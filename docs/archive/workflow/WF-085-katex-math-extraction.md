# WF-085: Cross-Platform KaTeX Math Formula Extraction Workflow

> Design: [DES-085](../design/DES-085-katex-math-extraction.md)
> Requirement: [REQ-085](../requirements/REQ-085-katex-math-extraction.md)
> Date: 2026-02-27
> Baseline: TBD tests passing, 0 lint errors

## Phase Overview

```
Phase 1: Setup           ──► Phase 2: Core Functions    ──► Phase 3: Integration
(branch, baseline)            (preprocessKatex)              (sanitizeHtml wiring)
                                      │
                                      ▼
                              Phase 4: Tests            ──► Phase 5: Validation & PR
                              (unit + integration + E2E)     (regression, lint, build)
```

**Estimated scope:** ~50 lines production code, ~200 lines test code, 3 files changed

---

## Phase 1: Setup

### Step 1.1: Create feature branch

```bash
git checkout -b fix/katex-math-extraction
```

### Step 1.2: Verify baseline

```bash
npm test            # All tests passing
npm run lint        # 0 errors
npm run build       # Clean build
```

**Checkpoint:** All green before any changes

---

## Phase 2: Core Functions — `preprocessKatex()`

### Step 2.1: Add `extractLatexFromKatex()` private helper

**File:** `src/lib/sanitize.ts`
**Location:** Before `sanitizeHtml()` function

```typescript
/**
 * Extract LaTeX source from a standard KaTeX element's annotation.
 *
 * Standard KaTeX stores LaTeX in:
 *   <annotation encoding="application/x-tex">LATEX</annotation>
 * inside <math> → <semantics> structures.
 *
 * @returns LaTeX string, or null if no annotation found
 */
function extractLatexFromKatex(element: Element): string | null {
  const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
  return annotation?.textContent?.trim() || null;
}
```

**Verify:** TypeScript compiles (`npm run build`)

### Step 2.2: Add `preprocessKatex()` exported function

**File:** `src/lib/sanitize.ts`
**Location:** After `extractLatexFromKatex()`, before `sanitizeHtml()`

```typescript
/**
 * Pre-process standard KaTeX HTML structures to data-math attribute format.
 *
 * Standard KaTeX (used by Perplexity, ChatGPT, Claude) stores LaTeX source
 * in <annotation encoding="application/x-tex"> inside MathML structures.
 * DOMPurify strips MathML, so this function extracts LaTeX BEFORE sanitization
 * and converts elements to data-math format that existing Turndown rules handle.
 *
 * Processing:
 * 1. Display math: span.katex-display → div[data-math="LATEX"]
 *    (matches existing mathBlock Turndown rule: DIV[data-math])
 * 2. Inline math: span.katex → span[data-math="LATEX"]
 *    (matches existing mathInline Turndown rule: SPAN[data-math])
 *
 * Gemini coexistence: Elements already inside a [data-math] ancestor
 * (Gemini's native format) are skipped.
 *
 * @param html Raw HTML string from extractor innerHTML
 * @returns HTML with standard KaTeX converted to data-math format
 */
export function preprocessKatex(html: string): string {
  // Fast path: skip DOMParser overhead when no KaTeX content present
  if (!html.includes('katex')) {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  let modified = false;

  // Phase 1: Display math (span.katex-display → div[data-math])
  for (const el of doc.querySelectorAll('span.katex-display')) {
    if (el.closest('[data-math]')) continue; // Gemini format — skip
    const latex = extractLatexFromKatex(el);
    if (!latex) continue;
    const div = doc.createElement('div');
    div.setAttribute('data-math', latex);
    el.replaceWith(div);
    modified = true;
  }

  // Phase 2: Inline math (span.katex → span[data-math])
  // After Phase 1, display math children (inner span.katex) are already removed.
  // Guard with closest() for any remaining edge cases.
  for (const el of doc.querySelectorAll('span.katex')) {
    if (el.closest('[data-math]') || el.closest('.katex-display')) continue;
    const latex = extractLatexFromKatex(el);
    if (!latex) continue;
    const span = doc.createElement('span');
    span.setAttribute('data-math', latex);
    el.replaceWith(span);
    modified = true;
  }

  return modified ? doc.body.innerHTML : html;
}
```

**Verify:** `npm run build` passes

### Step 2.3: Update module-level JSDoc

**File:** `src/lib/sanitize.ts`
**Change:** Update the file header comment to mention KaTeX preprocessing:

```
 * HTML sanitization utility
 * Uses DOMPurify to prevent XSS attacks.
 * Pre-processes standard KaTeX HTML to data-math attribute format.
```

Update the `sanitizeHtml()` JSDoc to mention:
- `data-math` is now used by both Gemini (native) and standard KaTeX (via `preprocessKatex`)

---

## Phase 3: Integration — Wire into `sanitizeHtml()`

### Step 3.1: Add preprocessKatex call

**File:** `src/lib/sanitize.ts`
**Change:** One-line addition at the start of `sanitizeHtml()`:

```typescript
export function sanitizeHtml(html: string): string {
  // Pre-process: convert standard KaTeX structures to data-math attributes
  // Must run BEFORE DOMPurify, which strips MathML elements (<math>, <annotation>)
  const preprocessed = preprocessKatex(html);

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    // ... existing hook unchanged ...
  });

  try {
    return DOMPurify.sanitize(preprocessed, {  // ← use preprocessed
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}
```

**Checkpoint:** `npm run build` passes. No other files changed.

---

## Phase 4: Tests

### Step 4.1: Unit tests for `preprocessKatex()` in `test/lib/sanitize.test.ts`

**File:** `test/lib/sanitize.test.ts`
**Change:** Add import for `preprocessKatex`, add new `describe('preprocessKatex')` block

#### Helper: Standard KaTeX HTML builder

```typescript
/** Build minimal standard KaTeX HTML for testing */
function buildKatexHtml(latex: string, display: boolean = false): string {
  const mathAttrs = display
    ? 'xmlns="http://www.w3.org/1998/Math/MathML" display="block"'
    : 'xmlns="http://www.w3.org/1998/Math/MathML"';
  const inner = `<span class="katex"><span class="katex-mathml"><math ${mathAttrs}><semantics><mrow></mrow><annotation encoding="application/x-tex">${latex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">rendered</span></span>`;
  return display ? `<span class="katex-display">${inner}</span>` : inner;
}
```

#### Test cases:

| # | Test | Input | Assertion |
|---|------|-------|-----------|
| 1 | Display math → `div[data-math]` | `buildKatexHtml('E = mc^2', true)` | Result contains `<div data-math="E = mc^2">` |
| 2 | Inline math → `span[data-math]` | `buildKatexHtml('x^2')` | Result contains `<span data-math="x^2">` |
| 3 | Mixed display + inline | Both in `<p>` wrapper | Both converted correctly |
| 4 | Gemini coexistence — skip `[data-math]` parent | `<div data-math="E=mc^2"><span class="katex">...</span></div>` | Unchanged |
| 5 | No annotation → fallback | `<span class="katex"><span class="katex-html">x²</span></span>` | Unchanged (element left as-is) |
| 6 | Empty annotation → skip | `<annotation encoding="application/x-tex">  </annotation>` | Unchanged |
| 7 | HTML entity decoding (`&amp;` → `&`) | `<annotation ...>a &amp; b</annotation>` | `data-math` contains `a & b` |
| 8 | Multi-line annotation (Perplexity) | Annotation with `\n` inside | Trimmed LaTeX in `data-math` |
| 9 | No katex in HTML → early return | `<p>Hello World</p>` | Exact same string returned |
| 10 | Multiple formulas | 3 inline katex spans | All 3 converted |
| 11 | Empty string | `""` | `""` |

### Step 4.2: Integration tests in `test/lib/sanitize.test.ts`

Add to existing `describe('sanitizeHtml')`:

| # | Test | Description |
|---|------|-------------|
| 12 | Standard KaTeX through full pipeline | `sanitizeHtml(buildKatexHtml('x^2'))` → output contains `data-math="x^2"`, no `<math>` or `<annotation>` |
| 13 | Gemini data-math unchanged | `sanitizeHtml('<div data-math="\\frac{a}{b}">content</div>')` → same as before |

### Step 4.3: Markdown integration tests in `test/content/markdown.test.ts`

**File:** `test/content/markdown.test.ts`
**Change:** Add new `describe('standard KaTeX math (REQ-085)')` block after existing `describe('math rendering')`

**Important:** These tests must use `sanitizeHtml()` + `htmlToMarkdown()` to test the full pipeline, since `htmlToMarkdown()` alone doesn't call `preprocessKatex()`.

```typescript
import { sanitizeHtml } from '../../src/lib/sanitize';
```

| # | Test | Input → Expected |
|---|------|------------------|
| 1 | Display math end-to-end | `sanitizeHtml(displayKatex) → htmlToMarkdown()` → `$$\nE = mc^2\n$$` |
| 2 | Inline math end-to-end | Same pipeline → `$x^2$` |
| 3 | Inline math in paragraph | `<p>Value <span class="katex">...</span> ok</p>` → `Value $x^2$ ok` |
| 4 | Complex LaTeX (pmatrix with `&`) | Annotation with `&amp;` → `data-math` decoded → correct output |
| 5 | Existing Gemini tests unaffected | Verify all 7 existing `math rendering` tests still pass |

### Step 4.4: Run full test suite

```bash
npm test
```

**Checkpoint:** All existing tests + new tests pass

---

## Phase 5: Validation & PR

### Step 5.1: E2E snapshot verification

Run E2E tests. Snapshots for Perplexity, Claude, ChatGPT may change (math now renders correctly). Gemini snapshot should NOT change.

```bash
npm test -- test/e2e/
```

If snapshots need updating:
```bash
npm test -- test/e2e/ -u
```

**Review:** All snapshot diffs must be math-related improvements only.

### Step 5.2: Full regression suite

```bash
npm run build       # TypeScript compiles cleanly
npm test            # All tests pass
npm run lint        # 0 errors, 0 warnings
```

### Step 5.3: Manual verification checklist

- [ ] New `preprocessKatex()` exported and documented
- [ ] `sanitizeHtml()` calls `preprocessKatex()` before DOMPurify
- [ ] No changes to `src/content/markdown.ts` (Turndown rules untouched)
- [ ] No changes to any extractor files
- [ ] Gemini math tests (7 existing) still pass unchanged
- [ ] E2E Gemini snapshot unchanged

### Step 5.4: Create PR

```bash
git add src/lib/sanitize.ts test/lib/sanitize.test.ts test/content/markdown.test.ts
git commit -m "fix: extract LaTeX from standard KaTeX for Perplexity/ChatGPT/Claude (#85)"
git push -u origin fix/katex-math-extraction
gh pr create --title "fix: extract LaTeX from standard KaTeX (#85)" \
  --body "$(cat <<'EOF'
## Summary
- Add `preprocessKatex()` to convert standard KaTeX HTML to `data-math` format before DOMPurify
- Enables math formula extraction for Perplexity, ChatGPT, and Claude
- Existing Gemini math handling unchanged (coexistence guard)

## Design
[DES-085](docs/design/DES-085-katex-math-extraction.md) — Option A (pre-processing)

Closes #85
EOF
)"
```

---

## Dependency Graph

```
sanitize.ts changes (Phase 2-3)
    │
    ├──► sanitize.test.ts (Phase 4.1-4.2)
    │
    └──► markdown.test.ts (Phase 4.3)
              │
              └──► E2E snapshot review (Phase 5.1)
                        │
                        └──► Final validation (Phase 5.2)
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| DOMParser output format differences (jsdom vs Chrome) | Unit tests run in jsdom; use `.toContain()` for structural assertions |
| E2E snapshot breakage | Review all diffs; only math-related changes expected |
| Gemini regression | 7 existing tests + `closest('[data-math]')` guard |
| LaTeX with special chars (`&`, `"`, `<`, `>`) | DOM API handles encoding/decoding automatically; test case #7 covers `&` |
| Performance on large non-math HTML | Early return `!html.includes('katex')` avoids DOMParser overhead |
