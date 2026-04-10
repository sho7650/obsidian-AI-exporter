# Obsidian AI Exporter v0.3.0 - Implementation Workflow

## Document Info

| Item | Value |
|------|-------|
| Version | 0.3.0 |
| Status | Ready for Execution |
| Created | 2025-01-10 |
| Design Doc | [DESIGN-v0.3.0-store-release.md](./DESIGN-v0.3.0-store-release.md) |
| Review Doc | [REVIEW-v0.3.0-store-release.md](../reviews/REVIEW-v0.3.0-store-release.md) |

---

## 1. Workflow Overview

### 1.1 Phase Summary

| Phase | Name | Tasks | Dependencies | Est. Effort |
|-------|------|-------|--------------|-------------|
| 1 | Project Setup & Documentation | 7 | None | Low |
| 2 | i18n Implementation | 10 | Phase 1 | Medium |
| 3 | Test Implementation | 12 | Phase 1 | Medium |
| 4 | Code Improvements | 6 | Phase 2, 3 | Low |
| 5 | Final Preparation & Store Submission | 15 | Phase 4 | Medium |

### 1.2 Dependency Graph

```
Phase 1 ─────────────────────────────────────────┐
   │                                              │
   ├──────────────┬───────────────────────────────┤
   ↓              ↓                               │
Phase 2       Phase 3                             │
(i18n)        (Tests)                             │
   │              │                               │
   └──────┬───────┘                               │
          ↓                                       │
       Phase 4 ←──────────────────────────────────┘
    (Code Improvements)
          │
          ↓
       Phase 5
   (Store Submission)
```

### 1.3 Parallel Execution Strategy

- **Phase 2 & Phase 3**: Can execute in parallel after Phase 1
- **Within Phase 3**: Test files can be created in parallel
- **Within Phase 5**: Screenshot capture and code updates can run in parallel

---

## 2. Phase 1: Project Setup & Documentation

### 2.1 Prerequisites

- [ ] Verify repository access: `git status`
- [ ] Verify npm installation: `npm --version`
- [ ] Verify existing build works: `npm run build`

### 2.2 Tasks

#### Task 1.1: Create LICENSE file

**Input**: None
**Output**: `LICENSE`
**Reference**: [DESIGN Section 4.2](./DESIGN-v0.3.0-store-release.md#42-license-file)

```bash
# Verification
cat LICENSE | head -5
# Expected: "MIT License" header
```

#### Task 1.2: Create CHANGELOG.md

**Input**: None
**Output**: `CHANGELOG.md`
**Reference**: [DESIGN Section 4.3](./DESIGN-v0.3.0-store-release.md#43-changelogmd)

```bash
# Verification
cat CHANGELOG.md | grep "## \[0.3.0\]"
# Expected: Version 0.3.0 section exists
```

#### Task 1.3: Create Privacy Policy

**Input**: None
**Output**: `docs/privacy.html`
**Reference**: [DESIGN Section 4.1](./DESIGN-v0.3.0-store-release.md#41-privacy-policy)

**Required Sections** (per Chrome Web Store guidelines):
- Overview
- Data Collection
- Data Storage
- Data Transmission
- Permissions Explained
- Remote Code (MV3 compliance)
- Children's Privacy (COPPA compliance)
- Contact

```bash
# Verification
grep -E "(Remote Code|Children's Privacy)" docs/privacy.html
# Expected: Both sections exist
```

#### Task 1.4: Create Store Description (English)

**Input**: None
**Output**: `docs/store/description_en.md`
**Reference**: [DESIGN Section 4.4 - English](./DESIGN-v0.3.0-store-release.md#44-chrome-web-store-listing)

```bash
# Verification
wc -c docs/store/description_en.md
# Expected: File exists with content
```

#### Task 1.5: Create Store Description (Japanese)

**Input**: None
**Output**: `docs/store/description_ja.md`
**Reference**: [DESIGN Section 4.4 - Japanese](./DESIGN-v0.3.0-store-release.md#44-chrome-web-store-listing)

```bash
# Verification
wc -c docs/store/description_ja.md
# Expected: File exists with content
```

#### Task 1.6: Create GitHub Pages Workflow

**Input**: None
**Output**: `.github/workflows/docs.yml`
**Reference**: [DESIGN Section 4.5](./DESIGN-v0.3.0-store-release.md#45-github-pages-setup)

```yaml
# Key configuration points:
- on.push.branches: [main]
- on.push.paths: ['docs/**']
- uses: actions/deploy-pages@v4
```

```bash
# Verification
cat .github/workflows/docs.yml | grep "deploy-pages"
# Expected: actions/deploy-pages reference exists
```

#### Task 1.7: Enable GitHub Pages

**Input**: GitHub repository access
**Output**: GitHub Pages enabled
**Manual Steps**:
1. Navigate to repository Settings
2. Select Pages from sidebar
3. Set Source to "GitHub Actions"

```bash
# Verification (after first deployment)
curl -I https://sho7650.github.io/obsidian-AI-exporter/privacy.html
# Expected: HTTP 200 response
```

### 2.3 Phase 1 Completion Criteria

- [ ] All 7 files created
- [ ] All verification commands pass
- [ ] GitHub Pages workflow committed

---

## 3. Phase 2: i18n Implementation

### 3.1 Prerequisites

- [ ] Phase 1 completed
- [ ] Understand Chrome i18n API: [chrome.i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n)

### 3.2 Tasks

#### Task 2.1: Create English Locale

**Input**: [DESIGN Section 2.3](./DESIGN-v0.3.0-store-release.md#23-_localesenmessagesjson)
**Output**: `src/_locales/en/messages.json`

**Message Key Categories**:
| Category | Count | Example Keys |
|----------|-------|--------------|
| Extension | 2 | `extName`, `extDescription` |
| UI Labels | 2 | `ui_syncButton`, `ui_syncing` |
| Settings | 16 | `settings_apiKey`, `settings_port`, ... |
| Toast | 8 | `toast_success_created`, `toast_error_noApiKey`, ... |
| Errors | 10 | `error_invalidApiKey`, `error_pathTraversal`, ... |
| Status | 3 | `status_connectionSuccess`, `status_settingsSaved`, ... |

```bash
# Verification
node -e "const m = require('./src/_locales/en/messages.json'); console.log(Object.keys(m).length)"
# Expected: 41+ message keys
```

#### Task 2.2: Create Japanese Locale

**Input**: [DESIGN Section 2.4](./DESIGN-v0.3.0-store-release.md#24-_localesjamessagesjson)
**Output**: `src/_locales/ja/messages.json`

```bash
# Verification
node -e "const m = require('./src/_locales/ja/messages.json'); console.log(Object.keys(m).length)"
# Expected: Same count as English locale
```

#### Task 2.3: Update manifest.json

**Input**: Current `src/manifest.json`
**Output**: Updated `src/manifest.json`
**Reference**: [DESIGN Section 2.5](./DESIGN-v0.3.0-store-release.md#25-manifestjson-updates)

**Required Changes**:
```json
{
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "default_locale": "en",
  "minimum_chrome_version": "88"
}
```

```bash
# Verification
grep -E "(default_locale|minimum_chrome_version|__MSG_)" src/manifest.json
# Expected: All three patterns found
```

#### Task 2.4: Update popup/index.html

**Input**: Current `src/popup/index.html`
**Output**: Updated `src/popup/index.html`
**Reference**: [DESIGN Section 2.6 - Popup HTML](./DESIGN-v0.3.0-store-release.md#26-implementation-pattern)

**Implementation Pattern**:
```html
<!-- Static text -->
<label data-i18n="settings_apiKey">Obsidian API Key</label>

<!-- Placeholders -->
<input type="password" id="apiKey" data-i18n-placeholder="settings_apiKeyPlaceholder">
```

```bash
# Verification
grep -c "data-i18n" src/popup/index.html
# Expected: 15+ elements with data-i18n
```

#### Task 2.5: Update popup/index.ts

**Input**: Current `src/popup/index.ts`
**Output**: Updated `src/popup/index.ts`

**Required Implementation**:
```typescript
// Add i18n initialization function
function initializeI18n(): void {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18n;
    if (key) el.textContent = chrome.i18n.getMessage(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18nPlaceholder;
    if (key) (el as HTMLInputElement).placeholder = chrome.i18n.getMessage(key);
  });
}

// Call on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initializeI18n();
  // ... existing code
});
```

```bash
# Verification
grep "chrome.i18n.getMessage" src/popup/index.ts
# Expected: Function calls exist
```

#### Task 2.6: Update content/ui.ts

**Input**: Current `src/content/ui.ts`
**Output**: Updated `src/content/ui.ts`
**Reference**: [DESIGN Section 2.6 - UI Component](./DESIGN-v0.3.0-store-release.md#26-implementation-pattern)

**Implementation Pattern**:
```typescript
function getMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Usage
button.innerHTML = `
  <span class="icon">📥</span>
  <span class="text">${getMessage('ui_syncButton')}</span>
`;
```

```bash
# Verification
grep -E "(getMessage|chrome.i18n)" src/content/ui.ts
# Expected: i18n helper and usage exist
```

#### Task 2.7: Update background/index.ts

**Input**: Current `src/background/index.ts`
**Output**: Updated error messages with i18n keys

```bash
# Verification
grep "chrome.i18n.getMessage" src/background/index.ts
# Expected: Localized error messages
```

#### Task 2.8: Update lib/obsidian-api.ts

**Input**: Current `src/lib/obsidian-api.ts`
**Output**: Updated error messages with i18n keys

```bash
# Verification
grep "chrome.i18n.getMessage" src/lib/obsidian-api.ts
# Expected: Localized error messages
```

#### Task 2.9: Update lib/validation.ts

**Input**: Current `src/lib/validation.ts`
**Output**: Updated error messages with i18n keys

```bash
# Verification
grep "chrome.i18n.getMessage" src/lib/validation.ts
# Expected: Localized validation messages
```

#### Task 2.10: Test i18n in Chrome

**Input**: Updated extension
**Output**: Verified functionality

**Manual Test Steps**:
1. Load extension in Chrome (`chrome://extensions`)
2. Verify English UI (default)
3. Change Chrome language to Japanese (Settings > Languages)
4. Restart Chrome
5. Verify Japanese UI

```bash
# Build verification
npm run build
# Expected: No build errors
```

### 3.3 Phase 2 Completion Criteria

- [ ] Both locale files created with matching keys
- [ ] manifest.json updated with i18n placeholders
- [ ] All UI components use chrome.i18n.getMessage()
- [ ] Extension works in both English and Japanese
- [ ] Build succeeds without errors

---

## 4. Phase 3: Test Implementation

### 4.1 Prerequisites

- [ ] Phase 1 completed
- [ ] Understand Vitest: [Vitest Documentation](https://vitest.dev/)

### 4.2 Tasks

#### Task 3.1: Install Vitest Dependencies

**Input**: `package.json`
**Output**: Updated `package.json` with devDependencies

```bash
npm install -D vitest @vitest/coverage-v8 jsdom
```

**Required devDependencies**:
```json
{
  "devDependencies": {
    "vitest": "^2.x",
    "@vitest/coverage-v8": "^2.x",
    "jsdom": "^24.x"
  }
}
```

```bash
# Verification
npm ls vitest
# Expected: vitest@2.x.x installed
```

#### Task 3.2: Create vitest.config.ts

**Input**: None
**Output**: `vitest.config.ts`
**Reference**: [DESIGN Section 3.2](./DESIGN-v0.3.0-store-release.md#32-vitest-configuration)

**Key Configuration** (per Vitest official docs):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/popup/index.ts'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
```

```bash
# Verification
npx vitest --version
# Expected: Version output (confirms config is valid)
```

#### Task 3.3: Create test/setup.ts

**Input**: None
**Output**: `test/setup.ts`
**Reference**: [DESIGN Section 3.3](./DESIGN-v0.3.0-store-release.md#33-test-setup)

**Required Mocks**:
- `chrome.runtime.sendMessage`
- `chrome.runtime.onMessage`
- `chrome.storage.local`
- `chrome.storage.sync`
- `chrome.i18n.getMessage`

```bash
# Verification
grep "vi.stubGlobal" test/setup.ts
# Expected: Chrome API stubbed globally
```

#### Task 3.4: Create test/mocks/chrome.ts

**Input**: None
**Output**: `test/mocks/chrome.ts`

**Chrome API Mock Structure**:
```typescript
import { vi } from 'vitest';

export const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    lastError: null,
    id: 'test-extension-id',
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
  },
};
```

```bash
# Verification
grep "chromeMock" test/mocks/chrome.ts
# Expected: Export exists
```

#### Task 3.5: Create test/fixtures/gemini-dom.html

**Input**: Sample Gemini page DOM
**Output**: `test/fixtures/gemini-dom.html`
**Reference**: Existing `test/element-sample.html`

```bash
# Verification
grep "conversation-container" test/fixtures/gemini-dom.html
# Expected: Gemini DOM structure exists
```

#### Task 3.6: Implement test/lib/sanitize.test.ts

**Input**: `src/lib/sanitize.ts`
**Output**: `test/lib/sanitize.test.ts`
**Reference**: [DESIGN Section 3.4.1](./DESIGN-v0.3.0-store-release.md#341-security-tests-high-priority)

**Test Cases**:
| Test | Input | Expected |
|------|-------|----------|
| removes script tags | `<script>alert(1)</script>` | No script in output |
| removes event handlers | `<img onerror="...">` | No onerror attribute |
| removes style tags | `<style>...</style>` | No style in output |
| preserves safe attributes | `<a href="...">` | href preserved |
| removes data attributes | `<div data-x="y">` | No data-x attribute |

```bash
# Verification
npx vitest run test/lib/sanitize.test.ts
# Expected: All tests pass
```

#### Task 3.7: Implement test/lib/path-utils.test.ts

**Input**: `src/lib/path-utils.ts`
**Output**: `test/lib/path-utils.test.ts`
**Reference**: [DESIGN Section 3.4.1](./DESIGN-v0.3.0-store-release.md#341-security-tests-high-priority)

**Test Cases**:
| Test | Input | Expected |
|------|-------|----------|
| detects ../ | `../etc/passwd` | true |
| detects absolute | `/etc/passwd` | true |
| detects URL-encoded | `%2e%2e%2f` | true |
| allows safe paths | `AI/Gemini` | false |

```bash
# Verification
npx vitest run test/lib/path-utils.test.ts
# Expected: All tests pass
```

#### Task 3.8: Implement test/lib/yaml-utils.test.ts

**Input**: `src/lib/yaml-utils.ts`
**Output**: `test/lib/yaml-utils.test.ts`
**Reference**: [DESIGN Section 3.4.1](./DESIGN-v0.3.0-store-release.md#341-security-tests-high-priority)

**Test Cases**:
| Test | Input | Expected |
|------|-------|----------|
| escapes special chars | `hello: world` | `"hello: world"` |
| escapes YAML words | `true` | `"true"` |
| handles empty | `` | `""` |
| preserves safe | `hello world` | `hello world` |

```bash
# Verification
npx vitest run test/lib/yaml-utils.test.ts
# Expected: All tests pass
```

#### Task 3.9: Implement test/lib/validation.test.ts

**Input**: `src/lib/validation.ts`
**Output**: `test/lib/validation.test.ts`
**Reference**: [DESIGN Section 3.4.2](./DESIGN-v0.3.0-store-release.md#342-validation-tests)

```bash
# Verification
npx vitest run test/lib/validation.test.ts
# Expected: All tests pass
```

#### Task 3.10: Implement test/extractors/gemini.test.ts

**Input**: `src/content/extractors/gemini.ts`
**Output**: `test/extractors/gemini.test.ts`
**Reference**: [DESIGN Section 3.4.3](./DESIGN-v0.3.0-store-release.md#343-extractor-tests)

**Test Cases**:
- `canExtract()` returns true on gemini.google.com
- `getConversationId()` extracts ID from URL
- `extractMessages()` returns user and assistant messages
- `extract()` returns success with valid data

```bash
# Verification
npx vitest run test/extractors/gemini.test.ts
# Expected: All tests pass
```

#### Task 3.11: Implement test/content/markdown.test.ts

**Input**: `src/content/markdown.ts`
**Output**: `test/content/markdown.test.ts`
**Reference**: [DESIGN Section 3.4.4](./DESIGN-v0.3.0-store-release.md#344-markdown-conversion-tests)

**Test Cases**:
- Code blocks with language
- Inline code
- Tables
- Line breaks

```bash
# Verification
npx vitest run test/content/markdown.test.ts
# Expected: All tests pass
```

#### Task 3.12: Verify Coverage

**Input**: All test files
**Output**: Coverage report

```bash
npm run test:coverage
# Expected: 70%+ coverage
```

### 4.3 Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:watch": "vitest --watch"
  }
}
```

### 4.4 Phase 3 Completion Criteria

- [ ] All test files created
- [ ] All tests pass
- [ ] Coverage >= 70%
- [ ] Security tests (sanitize, path-utils, yaml-utils) at 90%+

---

## 5. Phase 4: Code Improvements

### 5.1 Prerequisites

- [ ] Phase 2 completed (i18n)
- [ ] Phase 3 completed (tests)

### 5.2 Tasks

#### Task 4.1: Update eslint.config.js

**Input**: Current `eslint.config.js`
**Output**: Updated ESLint flat config
**Reference**: [DESIGN Section 5.1](./DESIGN-v0.3.0-store-release.md#51-eslint-configuration-fix)

```bash
# Verification
npm run lint
# Expected: No errors
```

#### Task 4.2: Update package.json Lint Script

**Input**: Current `package.json`
**Output**: Updated lint scripts

```json
{
  "scripts": {
    "lint": "eslint src",
    "lint:fix": "eslint src --fix"
  }
}
```

```bash
# Verification
npm run lint
# Expected: Runs without config errors
```

#### Task 4.3: Create src/lib/hash.ts

**Input**: None
**Output**: `src/lib/hash.ts`
**Reference**: [DESIGN Section 5.2](./DESIGN-v0.3.0-store-release.md#52-hash-utility-extraction)

```typescript
export function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
```

```bash
# Verification
grep "generateHash" src/lib/hash.ts
# Expected: Function exported
```

#### Task 4.4: Update extractors/base.ts

**Input**: Current `src/content/extractors/base.ts`
**Output**: Updated to use `src/lib/hash.ts`

```bash
# Verification
grep "from.*hash" src/content/extractors/base.ts
# Expected: Import from lib/hash
```

#### Task 4.5: Update content/markdown.ts

**Input**: Current `src/content/markdown.ts`
**Output**: Updated to use `src/lib/hash.ts`

```bash
# Verification
grep "from.*hash" src/content/markdown.ts
# Expected: Import from lib/hash
```

#### Task 4.6: Add API Key Toggle

**Input**: Current popup files
**Output**: Updated `src/popup/index.ts` and `src/popup/styles.css`
**Reference**: [DESIGN Section 5.3](./DESIGN-v0.3.0-store-release.md#53-api-key-masking)

```bash
# Verification
grep "api-key-toggle" src/popup/styles.css
# Expected: Toggle styles exist
```

### 5.3 Phase 4 Completion Criteria

- [ ] ESLint passes
- [ ] Hash utility extracted and used
- [ ] API key toggle functional
- [ ] All tests still pass

---

## 6. Phase 5: Final Preparation & Store Submission

### 6.1 Prerequisites

- [ ] Phase 4 completed
- [ ] Chrome Developer Account ($5 fee paid)
- [ ] GitHub Pages live

### 6.2 Asset Preparation Tasks

#### Task 5.1-5.3: Capture Screenshots (Required)

**Output**: `docs/store/screenshots/`

| Screenshot | Content | Size |
|------------|---------|------|
| screenshot-1.png | Sync button on Gemini page | 1280x800px |
| screenshot-2.png | Settings popup | 1280x800px |
| screenshot-3.png | Saved result in Obsidian | 1280x800px |

**Screenshot Guidelines** (per Chrome Web Store):
- Full bleed, square corners, no padding
- Demonstrate actual user experience
- Clear, properly rotated
- Up-to-date with latest extension version

#### Task 5.4-5.5: Capture Optional Screenshots

| Screenshot | Content | Size |
|------------|---------|------|
| screenshot-4.png | Toast notification | 1280x800px |
| screenshot-5.png | Japanese UI | 1280x800px |

#### Task 5.6: Create Promo Tile (Optional)

**Output**: `docs/store/promo-tile.png`
**Size**: 440x280px

### 6.3 Code & Build Tasks

#### Task 5.7: Update README.md

**Input**: Current `README.md`
**Output**: Updated with new name "Obsidian AI Exporter"

```bash
# Verification
grep "Obsidian AI Exporter" README.md
# Expected: New name appears
```

#### Task 5.8: Update manifest.json Version

**Input**: Current `src/manifest.json`
**Output**: Version set to "0.3.0"

```bash
# Verification
grep '"version": "0.3.0"' src/manifest.json
# Expected: Version is 0.3.0
```

#### Task 5.9: Run Full Test Suite

```bash
npm test
# Expected: All tests pass
```

#### Task 5.10: Build Production Bundle

```bash
npm run build
# Expected: Build succeeds, dist/ created
```

#### Task 5.11: Verify Production Build

**Manual Steps**:
1. Load `dist/` folder in Chrome
2. Navigate to gemini.google.com
3. Verify sync button appears
4. Open popup, verify settings display
5. Check console for errors

```bash
# Expected: No console errors
```

### 6.4 Store Submission Tasks

#### Task 5.12: Complete Developer Account Setup

**Reference**: [DESIGN Section 10.4](./DESIGN-v0.3.0-store-release.md#104-developer-account-setup)

**Steps**:
1. Navigate to https://chrome.google.com/webstore/devconsole
2. Sign in with Google Account (2-step verification required)
3. Pay $5 registration fee
4. Accept Developer Agreement
5. Complete email verification

#### Task 5.13: Fill Store Listing Tab

**Reference**: [DESIGN Section 10.5](./DESIGN-v0.3.0-store-release.md#105-pre-submission-checklist)

| Field | Value |
|-------|-------|
| Name | Obsidian AI Exporter |
| Summary | Export Gemini AI conversations to Obsidian (max 132 chars) |
| Description | [docs/store/description_en.md](./DESIGN-v0.3.0-store-release.md#44-chrome-web-store-listing) |
| Category | Productivity |
| Language | English, Japanese |
| Screenshots | 3-5 images |
| Store Icon | 128x128px |

#### Task 5.14: Fill Privacy Tab

**Reference**: [DESIGN Section 10.2](./DESIGN-v0.3.0-store-release.md#102-dashboard-privacy-tab-input)

| Field | Value |
|-------|-------|
| Single Purpose | Export Gemini AI conversations to local Obsidian vault via Local REST API |
| Permission: storage | Store user settings locally... |
| Permission: activeTab | Read the current Gemini conversation page... |
| Permission: gemini.google.com/* | Inject content script... |
| Permission: 127.0.0.1:27123/* | Communicate with user's local Obsidian REST API... |
| Remote Code | No |
| Personal communications | Yes (collected) |
| Website content | Yes (collected) |
| Certifications | All 3 checked |
| Privacy Policy URL | https://sho7650.github.io/obsidian-AI-exporter/privacy.html |

#### Task 5.15: Submit for Review

**Steps**:
1. Set Distribution to "Unlisted"
2. Review all fields
3. Click "Submit for review"
4. Monitor email for status

**Expected Review Timeline**:
| Scenario | Duration |
|----------|----------|
| Standard | Within 24 hours |
| 90% of submissions | Within 3 days |
| Extended (new developer) | 1-2 weeks |

### 6.5 Phase 5 Completion Criteria

- [ ] All screenshots captured (3+ required)
- [ ] Production build verified
- [ ] Store Listing complete
- [ ] Privacy Tab complete
- [ ] Extension submitted
- [ ] Extension approved (unlisted)

---

## 7. Verification Checklist

### 7.1 Final Verification Commands

```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. ESLint
npm run lint

# 3. Tests
npm test

# 4. Coverage
npm run test:coverage

# 5. Build
npm run build

# 6. Locale files
node -e "const en = require('./src/_locales/en/messages.json'); const ja = require('./src/_locales/ja/messages.json'); console.log('EN:', Object.keys(en).length, 'JA:', Object.keys(ja).length)"

# 7. Manifest validation
node -e "const m = require('./dist/manifest.json'); console.log('Version:', m.version, 'Locale:', m.default_locale, 'Min Chrome:', m.minimum_chrome_version)"
```

### 7.2 Success Criteria Summary

| Category | Criteria | Verification |
|----------|----------|--------------|
| Code Quality | Tests pass 70%+ | `npm run test:coverage` |
| Code Quality | ESLint passes | `npm run lint` |
| Code Quality | No console errors | Manual check |
| i18n | English works | Manual check |
| i18n | Japanese works | Manual check |
| Documentation | Privacy policy live | `curl` GitHub Pages |
| Store | Assets prepared | Screenshots exist |
| Store | Listing complete | Dashboard check |
| Store | Privacy complete | Dashboard check |
| Store | Approved | Email confirmation |

---

## 8. Rollback Procedures

### 8.1 If i18n Breaks Functionality

```bash
# Revert locale changes
git checkout HEAD -- src/_locales/
git checkout HEAD -- src/manifest.json

# Rebuild
npm run build
```

### 8.2 If Tests Fail in CI

```bash
# Run tests locally with verbose output
npm run test -- --reporter=verbose

# Check specific test file
npx vitest run path/to/test.ts --reporter=verbose
```

### 8.3 If Store Submission Rejected

1. Check Developer Console for rejection reason
2. Fix identified issues
3. Re-run verification checklist
4. Resubmit

---

## 9. References

### 9.1 Official Documentation

| Topic | URL |
|-------|-----|
| Chrome i18n API | https://developer.chrome.com/docs/extensions/reference/api/i18n |
| Chrome Web Store Publish | https://developer.chrome.com/docs/webstore/prepare |
| Chrome Web Store Privacy | https://developer.chrome.com/docs/webstore/cws-dashboard-privacy |
| Vitest Documentation | https://vitest.dev/ |
| Vitest Configuration | https://vitest.dev/config/ |

### 9.2 Project Documentation

| Document | Path |
|----------|------|
| Design Document | [DESIGN-v0.3.0-store-release.md](./DESIGN-v0.3.0-store-release.md) |
| Review Document | [REVIEW-v0.3.0-store-release.md](../reviews/REVIEW-v0.3.0-store-release.md) |
| Project README | [README.md](../../README.md) |
| CLAUDE.md | [CLAUDE.md](../../CLAUDE.md) |
