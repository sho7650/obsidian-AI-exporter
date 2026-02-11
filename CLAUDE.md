# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension that extracts AI conversations from Google Gemini, Claude AI, ChatGPT, and Perplexity and saves them to Obsidian via the Local REST API. Built with CRXJS + Vite + TypeScript.

## ⚠️ Absolute Rules

### 🚫 NEVER (Absolutely Forbidden)

The following are **forbidden under any circumstances**. No exceptions. No context override.

#### Documentation

- **NEVER** create project-related docs under `~/.claude/`
- **NEVER** place design docs in global directories
- **NEVER** create files in `~/.claude/plans/` even in Plan mode

#### Assumptions

- **NEVER** say "should be" or "probably" without verifying server state
- **NEVER** assume current state based on past information
- **NEVER** assert "already done" without verification
- **NEVER** apply "best practices" without validation

#### Implementation

- **NEVER** generate code before plan approval
- **NEVER** expand scope during execution phase
- **NEVER** guess configuration parameters
- **NEVER** try alternatives without error analysis
- **NEVER** modify files directly on the main branch

### ✅ ALWAYS (Mandatory Actions)

The following are **always required**. No shortcuts.

#### Verification

- **ALWAYS** follow: "I'll check" → actually check → report results
- **ALWAYS** say "verification needed" when uncertain

#### Documentation

- **ALWAYS** place project docs under `docs/`
- **ALWAYS** document reasons for config changes in comments
- **ALWAYS** create ADR for significant config changes

#### Implementation Process

- **ALWAYS** output [PLAN] before implementation
- **ALWAYS** wait for explicit approval before execution
- **ALWAYS** follow approved plan strictly
- **ALWAYS** output progress for each step
- **ALWAYS** Create a branch with an appropriate name and switch to it before making any modifications

**ADR Guide:**

- Location: `docs/adr/`
- Naming: `NNN-<topic>.md`

## Commands

```bash
npm run build    # TypeScript check + Vite production build
npm run dev      # Vite dev server with HMR
npm run lint     # ESLint on src/
npm run format   # Prettier formatting
```

Load the extension in Chrome: `chrome://extensions` → Load unpacked → select `dist/` folder

## Architecture

```
Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)
    ↓ extracts conversation / Deep Research / Artifacts
Background Service Worker
    ↓ sends to Obsidian
Obsidian Local REST API (127.0.0.1:27123)
```

### Key Components

| Path                               | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `src/content/extractors/gemini.ts` | DOM extraction for Gemini conversations & Deep Research    |
| `src/content/extractors/claude.ts` | DOM extraction for Claude conversations & Artifacts        |
| `src/content/extractors/base.ts`   | Abstract extractor with selector fallback helpers          |
| `src/content/markdown.ts`          | HTML→Markdown via Turndown with custom rules               |
| `src/lib/obsidian-api.ts`          | REST API client for Obsidian                               |
| `src/lib/types.ts`                 | Shared TypeScript interfaces                               |
| `src/background/index.ts`          | Service worker handling API calls                          |
| `src/popup/`                       | Settings UI                                                |

### Extractor Pattern

Extractors implement `IConversationExtractor` from `src/lib/types.ts`. The `BaseExtractor` provides:

- `queryWithFallback()` - tries multiple CSS selectors in order
- `queryAllWithFallback()` - same for querySelectorAll
- `sanitizeText()` - normalizes whitespace

### DOM Selectors

**Gemini** uses Angular components. Key selectors in `gemini.ts`:

- `.conversation-container` - each Q&A turn
- `user-query` / `model-response` - Angular component tags
- `.query-text-line` - user message lines (multiple per query)
- `.markdown.markdown-main-panel` - assistant response content

**Claude** uses React components. Key selectors in `claude.ts`:

- `.whitespace-pre-wrap.break-words` - user message content
- `.font-claude-response` - assistant response content
- `#markdown-artifact` - Deep Research / Artifact content
- `span.inline-flex a[href^="http"]` - inline citations

When DOM changes, update `SELECTORS` in the respective extractor file.

## Output Format

Conversations are saved as Markdown with YAML frontmatter and Obsidian callouts:

```markdown
---
id: gemini_xxx
title: '...'
source: gemini
---

> [!QUESTION] User
> query text

> [!NOTE] Gemini
> response text
```

## Supported Platforms

- **Gemini** (`gemini.google.com`): Conversations and Deep Research reports
- **Claude** (`claude.ai`): Conversations, Extended Thinking, and Artifacts with inline citations
- **ChatGPT** (`chatgpt.com`): Conversations (including custom GPTs via `/g/` URLs)
- **Perplexity** (`www.perplexity.ai`): Conversations

## Adding New Platforms

When adding a new platform extractor:

1. Add platform to union types in `src/lib/types.ts` (`source`, `platform`)
2. Add platform to `BaseExtractor` in `src/content/extractors/base.ts`
3. Create new extractor class extending `BaseExtractor`
4. Add routing in `src/content/index.ts` (`getExtractor()`)
5. Update `waitForConversationContainer()` selectors if needed
6. **Add origin to `ALLOWED_ORIGINS` in `src/background/index.ts`** ← CRITICAL
7. Update `src/manifest.json`:
   - `host_permissions`
   - `content_scripts.matches`
8. Add DOM helpers and tests

## Future Platforms

Add new extractors by extending `BaseExtractor` and implementing `IConversationExtractor`.
