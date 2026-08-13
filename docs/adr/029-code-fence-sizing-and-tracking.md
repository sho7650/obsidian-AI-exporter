# ADR-029: Code fences are sized by the writer and tracked by length

- Status: Accepted
- Date: 2026-08-13
- Issue: [#433](https://github.com/sho7650/obsidian-AI-exporter/issues/433)
- Related: [ADR-026](026-line-ending-handling.md) (line endings),
  [ADR-028](028-message-count-survives-callout-flattening.md) (append contract),
  [ADR-025](025-note-identity-probe-and-fork-diagnostics.md) (naming the silent path)

## Context

A user asked ChatGPT for a `README.md`, exported the conversation, and got a note whose
Markdown structure fell apart in Obsidian. The reported symptom was precise: the exporter
always writes a three-backtick fence, so a code block whose *content* holds three backticks
is closed by its own content.

Three separate places in `src/` decided where a code block began and ended, and all three
were wrong in the same way.

### 1. The writer never looked at the code

`src/content/markdown-rules.ts` overrides Turndown's built-in `fencedCodeBlock` rule twice —
once for `pre > code` (Claude, Gemini, Perplexity, NotebookLM, ChatGPT's legacy DOM) and once
for ChatGPT's CodeMirror DOM. Both returned a hardcoded fence:

```js
return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
```

Turndown's own rule (`turndown/lib/turndown.cjs.js:190-213`, v7.2.2) already sizes the fence
from the content:

```js
var fenceSize = 3;
var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');
while ((match = fenceInCodeRegex.exec(code))) {
  if (match[0].length >= fenceSize) fenceSize = match[0].length + 1;
}
```

Turndown's documented rule precedence is *added rules → commonmark rules*, so our two added
rules shadowed that behaviour. **This was a regression against the library we depend on, not a
feature it lacks.**

### 2. Both readers used a length-blind toggle

`escapeByLine()` (markdown-rules.ts) and `scanMessageStarts()` (lib/message-counter.ts) each
flipped a boolean on any line starting with three backticks. Neither compared fence lengths,
neither required a closing fence to be bare, and each carried its own copy of the rule.

Measured consequences, both reproduced against the real modules before the fix:

- **Escaping leaked into code.** For a block holding an inner fence, the toggle thought the
  block had ended and escaped angle brackets *inside* it, writing `\<div\>a\</div\>` into the
  vault, while leaving the genuinely-inside `<span>` after it unescaped.
- **Append mode lost messages.** For an assistant answer showing an *opening* fence only
  ("put this at the top of the file" — routine on ChatGPT), a four-message note counted as
  **2**, and `extractTailMessages(body, 2)` returned `''`. That is the #406 failure class
  (ADR-028) reached by a different road.

### What the spec allows, and what it does not

CommonMark 0.31.2 §4.5: a fence is a run of at least three backticks or tildes; the closing
fence uses the same character, is at least as long as the opening one, and carries nothing but
spaces/tabs; either fence may be indented up to three spaces (four is too many); a backtick
fence's info string may not contain a backtick.

Obsidian documents the authoring rule that follows from it ("Nesting code blocks"): *"To nest
code blocks, use four or more backticks (or tildes) for the outer block, while the inner block
uses three."*

The reporter hoped we could preserve the tilde fence they had asked ChatGPT to use. **We
cannot.** The rendered DOM is `<pre><code>`; the fence character never reaches the extension.
Lengthening the backtick fence is the only fix available, and it is the one Obsidian prescribes.

## Decision

**1. One writer entry point.** `fenceCodeBlock(code, lang)` in `src/lib/code-fence.ts` is the
only place in `src/` that emits a fence. Fence length is `max(3, longest fence-capable backtick
run in the content + 1)`; the info string is sanitised, because ours is derived from arbitrary
DOM text in the CodeMirror rule.

The writer is deliberately **more conservative than the reader**: it counts any line whose first
non-space content is a run of ≥3 backticks, without applying the info-string or bare-closer
rules. Consumers disagree about lenient vs strict closing — a strict renderer breaks at an inner
*bare* fence, lenient highlighters break earlier at an inner ` ```python ` — and sizing against
any fence-capable run is correct under both. It is also exactly Turndown's own heuristic, so we
are not inventing a second dialect.

**2. One reader tracker.** `nextFenceState(state, line, options)` is a pure state machine
implementing §4.5 as an *asymmetry*: an opening fence may carry an info string, a closing fence
may not, and it must use the same character and be at least as long. Everything else inside an
open block is content. That asymmetry is the whole fix — the old toggle treated ` ```python ` as
a delimiter.

The two call sites differ, deliberately:

| Site | Blockquote markers | Fence characters |
| ---- | ------------------ | ---------------- |
| `escapeByLine()` | stripped — a callout carries every code line behind `> ` | `` ` `` and `~`; a user may paste a tilde block and its contents deserve the same protection |
| `scanMessageStarts()` | kept — the column-0-only policy of ADR-028 | `` ` `` only |

The counter ignores tildes because the writer never emits them: honouring a stray column-0
`~~~` would open a block that hides every message after it, and a hidden message is a silent
append stall. Ignoring it is inert.

**3. The writer ⇄ reader seam is the contract.** Stated in ADR-028's form — for any code
payload C embedded in an N-message conversation:

```
extractCodeBlocks(note.body)      contains C
countExistingMessages(note.body)  === N
countExistingMessages(extractTailMessages(note.body, k)) === N - k   for every k
no escaped \< \> \$ appears inside any fenced region
```

`test/lib/fence-writer-reader-seam.test.ts` asserts all four over a payload matrix × the three
message formats, recovering the code with a reference parser defined inside the test file so the
writer is never graded by its own tracker. Verified to fail against the pre-fix code
(32 of 144 assertions) and to pass after.

**4. Duplication is blocked structurally.** `test/arch/fence-literal-ssot.test.ts` fails any
module under `src/` other than `code-fence.ts` that spells out a fence literal or detects one
itself. Verified to name all four pre-fix violations with the remedy. One documented exemption:
`BaseExtractor.buildMetadata()` probes raw page HTML for a fence substring to set the
`hasCodeBlocks` metadata flag — a heuristic over HTML, not fence parsing.

**5. LF is the precondition; `\r` is tolerated anyway.** Body transforms run on LF and the
line-ending restore is the last step before the write (ADR-026), so readers see LF. The closing
rule — "only spaces or tabs after the run" — is exactly the shape a stray `\r` breaks, and
ADR-028's addendum records what a single unmatched CR already cost once. The tracker therefore
tolerates a trailing `\r` rather than losing the fence and every message boundary after it.

**6. The silent case is logged.** A body that ends inside a fenced block is the one shape where
the count can be wrong with no other symptom: an overcount makes `buildAppendContent()` return
null and the caller reports a successful no-op. It now emits
`[G2O] Existing note body ends inside a fenced code block` with the id, the open fence, and both
counts — the ADR-025 principle that a silent path must at least name itself.

## Consequences

- **Notes already on disk are not repaired**, matching the ADR-028 precedent. The information
  needed to recover the author's intent was destroyed at write time, so old and new readers both
  mis-parse a broken note — differently. The parity flip means the count may change on the first
  sync after upgrade: an undercount appends a tail that is already there once and then
  self-limits; an overcount is a silent no-op that needs a one-time manual fix. Decision 6 exists
  so the second case is reportable.
- **Nothing changes for notes without nested code.** Every fence in them is a balanced
  three-backtick pair, where the strict tracker and the old toggle agree line for line. No
  existing test needed editing: 1520 tests passed before, and the same 1520 still pass.
- **ADR-028's fenced-code consequence is superseded in part.** "A single column-0 toggle, shared
  by both functions" is now a length- and character-aware tracker. What survives unchanged: the
  column-0 policy, and the decision that an unterminated fence opens a block.
- **A known wrinkle is deliberately untouched.** `escapeByLine()` strips blockquote markers
  before matching, so a quoted `> ```  ` opening and a column-0 ` ``` ` closing are still
  conflated. It is out of scope for #433 and no reported symptom depends on it.
- Coverage moved 96.31 → 96.37 stmts / 87.04 → 87.28 branches; `code-fence.ts` and
  `message-counter.ts` are at 100% on all four metrics.
