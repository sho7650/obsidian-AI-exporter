# WF-007: Platform Lint Script and Perplexity Documentation Update

**Status**: Pending
**Design**: `docs/design/DES-007-platform-lint-and-perplexity-docs.md`
**Precedent Workflow**: `docs/workflow/WF-006-perplexity-extractor-implementation.md`

---

## Workflow Summary

| Property | Value |
|---|---|
| Total Phases | 3 |
| Total Steps | 6 |
| New Files | 1 (`scripts/lint-platforms.mjs`) |
| Modified Files | 7 (`package.json`, `docs/privacy.html`, `README.md`, `README.ja.md`, `CLAUDE.md`, `src/_locales/en/messages.json`, `src/_locales/ja/messages.json`) |

---

## Phase 1: Lint Script (Steps 1–2)

> Create the lint script and integrate into npm scripts.

### Step 1: Create `scripts/lint-platforms.mjs`

**Action**: Create the platform lint script per DES-007 §2.

**File**: `scripts/lint-platforms.mjs` (new)

**Specification**:
- Read `src/manifest.json` → `content_scripts[0].matches`
- Extract hostnames by stripping `https://` prefix and `/*` suffix
- Skip hostnames starting with `127.` (infrastructure, not platform)
- Hardcoded hostname → display name map (DES-007 §2.2):
  - `gemini.google.com` → `Gemini`
  - `claude.ai` → `Claude`
  - `chatgpt.com` → `ChatGPT`
  - `www.perplexity.ai` → `Perplexity`
- Error on unknown hostname (not in map)
- Check 7 target files with two check types (DES-007 §2.3):
  - **hostname check** (`docs/privacy.html`, `README.md`, `README.ja.md`, `CLAUDE.md`): hostname string present in file body
  - **display name check** (`package.json` → `description`, `src/_locales/en/messages.json` → `extDescription.message`, `src/_locales/ja/messages.json` → `extDescription.message`): display name present (case-insensitive)
- Output format per DES-007 §2.6
- Exit 1 on missing references, exit 0 on success
- No external dependencies (Node.js `fs`, `path`, `url` only)

**Validation**:
- [ ] `node scripts/lint-platforms.mjs` runs without syntax errors
- [ ] Reports errors for files missing Perplexity (expected at this step — 7 errors)
- [ ] Exit code is 1

**Depends on**: Nothing
**Blocks**: Step 2, Step 5

---

### Step 2: Update `package.json` Scripts

**Action**: Add `lint:platforms` script and chain into existing `lint` script.

**File**: `package.json`

**Changes**:
```
- Before: "lint": "eslint src/"
+ After:  "lint": "eslint src/ && node scripts/lint-platforms.mjs"
```

Add new script:
```json
"lint:platforms": "node scripts/lint-platforms.mjs"
```

**Validation**:
- [ ] `npm run lint:platforms` executes and reports errors (Perplexity missing from docs)
- [ ] `npm run lint` runs ESLint then platform lint sequentially
- [ ] `package.json` is valid JSON

**Depends on**: Step 1
**Blocks**: Step 5

---

## Phase 2: Documentation Update (Steps 3–4)

> Update all 7 files to include Perplexity references.

### Step 3: Update Documentation Files (4 files)

**Action**: Apply hostname-checked file changes from DES-007 §3.1–§3.4.

**File 1: `docs/privacy.html`** (DES-007 §3.1)
- Add `<li><strong>www.perplexity.ai</strong>: To extract Perplexity conversation content (read-only)</li>` to Data Transmission list (after line 53, before localhost entry)
- Add `<tr><td>Host: www.perplexity.ai</td><td>Inject the sync button on Perplexity pages</td></tr>` to Permissions table (after line 77, before localhost entry)

**File 2: `README.md`** (DES-007 §3.2)
- Line 3: `"from Google Gemini, Claude AI, and ChatGPT"` → `"from Google Gemini, Claude AI, ChatGPT, and Perplexity"`
- Line 12: `"Export from Google Gemini, Claude AI, and ChatGPT"` → `"Export from Google Gemini, Claude AI, ChatGPT, and Perplexity"`
- After line 91 (ChatGPT section): Add Perplexity usage section
- Line 188: `"Content Script (gemini.google.com, claude.ai, chatgpt.com)"` → `"Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)"`
- After line 202 (chatgpt.ts row): Add `| src/content/extractors/perplexity.ts | Perplexity conversation extractor |`

**File 3: `README.ja.md`** (DES-007 §3.3)
- Line 3: `"Google Gemini、Claude AI、ChatGPT の会話"` → `"Google Gemini、Claude AI、ChatGPT、Perplexity の会話"`
- Line 12: `"Google Gemini、Claude AI、ChatGPT からエクスポート"` → `"Google Gemini、Claude AI、ChatGPT、Perplexity からエクスポート"`
- After line 91 (ChatGPT section): Add Perplexity usage section (Japanese)
- Line 188: Same architecture diagram change as README.md
- After line 202: Add `| src/content/extractors/perplexity.ts | Perplexity 会話抽出 |`

**File 4: `CLAUDE.md`** (DES-007 §3.4)
- Line 7: `"from Google Gemini and Claude AI"` → `"from Google Gemini, Claude AI, ChatGPT, and Perplexity"`
- Line 76: `"Content Script (gemini.google.com, claude.ai)"` → `"Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)"`
- After line 144 (ChatGPT entry): Add `- **Perplexity** (www.perplexity.ai): Conversations`
- Lines 161–163: Remove `perplexity` from "Future Platforms" text → `"Add new extractors by extending BaseExtractor and implementing IConversationExtractor."`

**Validation**:
- [ ] Each file contains `www.perplexity.ai` (hostname check target)
- [ ] `docs/privacy.html` has no broken HTML tags
- [ ] README Perplexity usage sections follow existing ChatGPT section format

**Depends on**: Nothing (can run in parallel with Phase 1)
**Blocks**: Step 5

---

### Step 4: Update Description Files (3 files)

**Action**: Apply display-name-checked file changes from DES-007 §3.5–§3.7.

**File 1: `package.json`** (DES-007 §3.5)
- `"description"`: `"from Gemini, Claude, and ChatGPT"` → `"from Gemini, Claude, ChatGPT, and Perplexity"`

**File 2: `src/_locales/en/messages.json`** (DES-007 §3.6)
- `"extDescription.message"`: `"from Gemini, Claude, and ChatGPT"` → `"from Gemini, Claude, ChatGPT, and Perplexity"`

**File 3: `src/_locales/ja/messages.json`** (DES-007 §3.7)
- `"extDescription.message"`: `"Gemini、Claude、ChatGPT の"` → `"Gemini、Claude、ChatGPT、Perplexity の"`

**Validation**:
- [ ] `package.json` is valid JSON
- [ ] `src/_locales/en/messages.json` is valid JSON
- [ ] `src/_locales/ja/messages.json` is valid JSON
- [ ] Each file contains `Perplexity` (display name check target)

**Depends on**: Nothing (can run in parallel with Phase 1)
**Blocks**: Step 5

---

## Phase 3: Verification (Steps 5–6)

> Verify all changes are consistent and no regressions.

### Step 5: Run Platform Lint

**Action**: Run the lint script to confirm all platform references are consistent.

**Command**:
```bash
node scripts/lint-platforms.mjs
```

**Expected output** (DES-007 §2.6):
```
Platform lint check
===================
Source: src/manifest.json content_scripts[0].matches
Platforms: Gemini (gemini.google.com), Claude (claude.ai), ChatGPT (chatgpt.com), Perplexity (www.perplexity.ai)

All 7 files are consistent with manifest.json. ✓
```

**Validation**:
- [ ] Exit code is 0
- [ ] All 7 files pass
- [ ] No missing platform errors

**Depends on**: Steps 1, 2, 3, 4
**Blocks**: Step 6

---

### Step 6: Run Full Lint and Build

**Action**: Run existing CI checks to confirm no regressions.

**Commands** (sequential):
```bash
npm run lint
npm run build
```

**Validation**:
- [ ] `npm run lint` passes (ESLint + platform lint)
- [ ] `npm run build` passes (TypeScript + Vite)
- [ ] No new warnings introduced

**Depends on**: Step 5
**Blocks**: Nothing (final step)

---

## Dependency Graph

```
Phase 1: Lint Script
  Step 1 (lint-platforms.mjs) ──→ Step 2 (package.json scripts) ──┐
                                                                   │
Phase 2: Documentation Update                                      │
  Step 3 (4 doc files)  ──────────────────────────────────────────┤
  Step 4 (3 description files) ───────────────────────────────────┤
                                                                   ↓
Phase 3: Verification                                              │
  Step 5 (platform lint) ◄────────────────────────────────────────┘
       │
       ↓
  Step 6 (full lint + build)
```

**Parallelizable groups**:
- Phase 1 (Steps 1–2) and Phase 2 (Steps 3–4) can run in parallel
- Steps 3 and 4 can run in parallel within Phase 2

---

## Execution Checkpoints

| After Phase | Checkpoint | Command |
|---|---|---|
| Phase 1 | Lint script runs, reports errors for missing Perplexity | `node scripts/lint-platforms.mjs` (expect exit 1) |
| Phase 2 | All 7 files updated with Perplexity references | Manual review: `grep -l -i perplexity docs/privacy.html README.md README.ja.md CLAUDE.md package.json src/_locales/en/messages.json src/_locales/ja/messages.json` |
| Phase 3 | All checks pass, no regressions | `npm run lint && npm run build` |

---

## Files Changed Summary

### New Files (1)
| File | Phase | Step |
|---|---|---|
| `scripts/lint-platforms.mjs` | 1 | 1 |

### Modified Files (7)
| File | Phase | Step | Changes |
|---|---|---|---|
| `package.json` | 1+2 | 2, 4 | Add `lint:platforms` script, update `lint` script, update `description` |
| `docs/privacy.html` | 2 | 3 | Add Perplexity to Data Transmission list (+1 line) and Permissions table (+1 line) |
| `README.md` | 2 | 3 | Update description, features, add usage section, update architecture, add component row |
| `README.ja.md` | 2 | 3 | Same as README.md (Japanese) |
| `CLAUDE.md` | 2 | 3 | Update overview, architecture, add to Supported Platforms, update Future Platforms |
| `src/_locales/en/messages.json` | 2 | 4 | Update `extDescription.message` |
| `src/_locales/ja/messages.json` | 2 | 4 | Update `extDescription.message` |

**Total: 8 files (1 new, 7 modified)**
