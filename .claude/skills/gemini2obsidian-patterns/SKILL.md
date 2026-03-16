---
name: gemini2obsidian-patterns
description: Development patterns for the obsidian-ai-exporter Chrome Extension (CRXJS + Vite + TypeScript)
version: 1.0.0
source: local-git-analysis
analyzed_commits: 134
---

# gemini2obsidian Development Patterns

## Commit Conventions

**Conventional Commits** enforced via commitlint + husky pre-commit hook.

```
{type}: {description}
```

### Recognized Types

| Type | Purpose | release-please |
|------|---------|----------------|
| `feat` | New feature | minor bump |
| `fix` | Bug fix | patch bump |
| `security` | Security fix | patch bump |
| `refactor` | Code refactoring | patch bump |
| `perf` | Performance improvement | patch bump |
| `test` | Tests only | patch bump |
| `chore` | Maintenance | patch bump |
| `docs` | Documentation | patch bump |
| `style` | Code style/formatting | patch bump |
| `ui` | UI changes | patch bump |
| `ci` | CI configuration | no bump |
| `build` | Build system | no bump |
| `revert` | Revert commit | depends |

### Rules
- Header max length: 100 characters
- Description starts lowercase, no trailing period
- PR title must match commit message header (squash merge)
- Include PR number in merge commit: `fix: description (#123)`

## Branching Strategy

```
main
 └── {type}/{slug}           # e.g. feat/append-mode, fix/katex-math-extraction
      └── squash merge only   # enforced via GitHub settings
```

- Always branch from `main` before modifying code
- Branch naming: `{type}/{descriptive-slug}`
- Merge strategy: **squash merge only** (release-please requirement)

## Code Architecture

```
src/
├── background/              # Service worker (message routing, API calls)
│   ├── index.ts             # onMessage listener, handleMessage router
│   ├── validation.ts        # Sender + message content validation
│   ├── obsidian-handlers.ts # Save, get, test connection
│   └── output-handlers.ts   # Multi-output (obsidian, file, clipboard)
├── content/                 # Content scripts (DOM extraction)
│   ├── index.ts             # Init, sync handler, extractor routing
│   ├── extractors/          # Platform-specific extractors
│   │   ├── base.ts          # BaseExtractor (shared utilities)
│   │   ├── gemini.ts        # Gemini extractor
│   │   ├── claude.ts        # Claude extractor
│   │   ├── chatgpt.ts       # ChatGPT extractor
│   │   └── perplexity.ts    # Perplexity extractor
│   ├── markdown.ts          # Turndown HTML-to-Markdown
│   ├── markdown-rules.ts    # Custom Turndown rules
│   ├── markdown-deep-research.ts  # Deep Research citation handling
│   ├── markdown-formatting.ts     # Message formatting
│   └── ui.ts                # Sync button, toasts
├── lib/                     # Shared utilities
│   ├── types.ts             # All TypeScript interfaces
│   ├── constants.ts         # Centralized constants
│   ├── storage.ts           # chrome.storage wrapper (local + sync)
│   ├── messaging.ts         # Type-safe chrome.runtime.sendMessage
│   ├── obsidian-api.ts      # REST API client
│   ├── validation.ts        # Input validation (URL, API key, callout)
│   ├── path-utils.ts        # Path security + template resolution
│   ├── sanitize.ts          # DOMPurify wrapper + KaTeX preprocessing
│   └── ...                  # error-utils, hash, throttle, etc.
├── offscreen/               # Clipboard operations (offscreen document)
├── popup/                   # Settings UI
└── manifest.json            # Chrome extension manifest v3
```

## Adding a New Platform Extractor

Strictly ordered checklist:

1. Add platform to union types in `src/lib/types.ts` (`AIPlatform`)
2. Add label to `PLATFORM_LABELS` in `src/lib/constants.ts`
3. Create extractor class extending `BaseExtractor` in `src/content/extractors/`
4. Add routing in `src/content/index.ts` (`getExtractor()`)
5. Update `waitForConversationContainer()` selectors if needed
6. **Add origin to `ALLOWED_ORIGINS` in `src/lib/constants.ts`** (security-critical)
7. Update `src/manifest.json`: `host_permissions` + `content_scripts.matches`
8. Add DOM helpers in `test/fixtures/dom-helpers.ts`
9. Add unit + E2E tests

## Testing Patterns

### Framework & Config
- **Vitest** + **jsdom** environment
- Setup file: `test/setup.ts` (chrome API mocks)
- Tests in `test/` (mirrors `src/` structure)
- Coverage thresholds: 85% stmts, 75% branch, 85% funcs, 85% lines

### Test File Organization
```
test/
├── setup.ts                    # Chrome API mocks
├── mocks/                      # Shared mock utilities
├── fixtures/                   # DOM helpers for each platform
├── background/index.test.ts    # Background service worker tests
├── content/                    # Content script tests
├── extractors/                 # Extractor unit tests
│   ├── base.test.ts
│   ├── gemini.test.ts
│   ├── claude.test.ts
│   └── e2e/                   # E2E snapshot tests
├── lib/                        # Utility tests
└── popup/                      # Popup UI tests
```

### Key Testing Conventions
- Module re-import per test via `vi.resetModules()` + `vi.doMock()` for modules with side effects
- `capturedListener` pattern: capture `chrome.runtime.onMessage.addListener` callback for testing
- DOM fixtures: helper functions like `createGeminiConversationDOM()`, `loadFixture()`, `clearFixture()`
- jsdom quirk: `innerHTML` encodes `&` as `&amp;`; use `Object.defineProperty` to mock `inHTML` in regex tests

### Commands
```bash
npm run test          # vitest run (all tests)
npm run test:watch    # vitest (watch mode)
npm run test:coverage # vitest run --coverage
npm run build         # tsc --noEmit && vite build
npm run lint          # eslint src/ && lint-platforms.mjs
npm run format        # prettier --write
```

## Security Patterns

### Storage Separation
- `chrome.storage.local`: API key (never synced to cloud)
- `chrome.storage.sync`: All other settings

### Message Security
- `validateSender()`: Exact origin matching via `url.origin` against `ALLOWED_ORIGINS`
- `validateMessageContent()`: Action allowlist + content size/path validation
- `getSettings` response: Redacted for content scripts (`ContentScriptSettings` with `isApiKeyConfigured` boolean, no raw key)

### Input Sanitization
- All HTML through `sanitizeHtml()` (DOMPurify) before Markdown conversion
- Path traversal detection: `containsPathTraversal()` (../,  null bytes, URL-encoded)
- URL validation: `validateObsidianUrl()` (http/https only, port range 1024-65535)
- YAML injection prevention: `escapeYamlValue()`

### Console Logging
- Prefix: `[G2O]` with context: `[G2O Background]`, `[G2O Popup]`, `[G2O Offscreen]`
- Never log API keys, auth headers, or raw HTML content

## Release Workflow

1. Develop on `{type}/{slug}` branch
2. Squash merge to `main`
3. **release-please** auto-creates release PR with version bump
4. Merge release PR → GitHub Action builds ZIP → attaches to GitHub Release
5. Config: `release-please-config.json` + `.release-please-manifest.json`

## Key Co-Change Patterns

Files that always change together:
- `src/lib/types.ts` + extractors (when adding fields)
- `src/background/index.ts` + `src/background/validation.ts` (when adding message actions)
- `src/manifest.json` + `src/lib/constants.ts` (when adding platforms)
- `src/content/extractors/*.ts` + `test/extractors/*.test.ts` + `test/fixtures/dom-helpers.ts`
