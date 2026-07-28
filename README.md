# Obsidian AI Exporter

Chrome Extension that exports AI conversations from Google Gemini, Claude AI, ChatGPT, Perplexity, and NotebookLM to Obsidian via the Local REST API.

[日本語版はこちら](README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

## Features

- **Multi-platform support**: Export from Google Gemini, Claude AI, ChatGPT, Perplexity, and NotebookLM
- **One-click export**: Floating "Sync" button on supported AI pages
- **Multiple output options**: Save to Obsidian, download as file, or copy to clipboard
- **Deep Research support**: Export Gemini Deep Research, Claude Extended Thinking, and Perplexity Deep Research reports
- **Artifact support**: Extract Claude Artifacts with inline citations and sources
- **Image export**: Gemini-generated images are saved alongside the conversation — embedded in your vault, downloaded as files, or stripped for clipboard
- **Source citations**: NotebookLM chat citations are exported as footnotes
- **Auto-scroll**: Automatically loads all messages in long conversations, including virtualized (windowed) Claude and ChatGPT threads
- **Append mode**: Only new messages are added to existing notes
- **Filename schemes**: Choose `title-id` (default) or `title-date` naming for exported notes
- **Vault path templates**: Organize with `{platform}` and date tokens (`{YYYY}`, `{MM}`, …) for auto-sorting
- **Filename collision safety**: Never overwrites a note belonging to a different conversation
- **Tool content support**: Optionally include Claude's web search results and tool activity as collapsible `[!ABSTRACT]` callouts
- **Question headers (optional)**: Prepend a `## ` heading (first 60 chars of the question) before each user message for TOC navigation in long conversations
- **Large-callout flattening**: Optionally flatten very long messages to plain text when saving to Obsidian, avoiding renderer slowdowns; the line threshold is configurable (default 200)
- **Configurable timezone**: Set timezone for frontmatter dates (created/modified)
- **Math formula preservation**: LaTeX math (`$...$` and `$$...$$`) is preserved across all platforms for Obsidian's math renderer
- **Obsidian callouts**: Formatted output with `[!QUESTION]` and `[!NOTE]` callouts
- **YAML frontmatter**: Metadata including title, source, URL, dates, and tags
- **Configurable**: Customizable vault path, template options, and frontmatter fields
- **Localized**: English and Japanese UI support

## Requirements

- Google Chrome 96+ (or Chromium-based browser)
- [Obsidian](https://obsidian.md/)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin

## Installation

### From Chrome Web Store

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/sho7650/obsidian-AI-exporter.git
   cd obsidian-AI-exporter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

### Setup Obsidian

1. Install the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin in Obsidian
2. Enable the plugin and copy your API key
3. Click the extension icon in Chrome and enter:
   - **API Key**: Your Local REST API key
   - **API URL**: Default is `http://127.0.0.1:27123` (HTTPS is also supported — see [HTTPS Setup](#https-setup-optional))
   - **Vault Path**: Folder path in your vault (e.g., `AI/{platform}` to auto-organize by source)

## Usage

### Gemini

1. Open a conversation on [gemini.google.com](https://gemini.google.com) (regular chats and Gem conversations are both supported)
2. Click the purple "Sync" button in the bottom-right corner
3. The conversation will be exported based on your selected output method:
   - **Obsidian** (default): Saved directly to your vault via Local REST API
   - **File**: Downloaded as a Markdown file
   - **Clipboard**: Copied to clipboard for pasting anywhere

Gemini-generated images are captured and exported automatically (see [Image Export](#image-export)).

### Claude

1. Open a conversation on [claude.ai](https://claude.ai)
2. Click the purple "Sync" button in the bottom-right corner
3. The conversation will be exported with the same output options as Gemini

> **Keep Auto-scroll enabled for long conversations.** Claude mounts only a window of turns at a time and discards the rest; with Auto-scroll off, only the turns currently on screen can be exported.

### ChatGPT

1. Open a conversation on [chatgpt.com](https://chatgpt.com) (regular chats and custom GPTs via `/g/` URLs are both supported)
2. Click the purple "Sync" button in the bottom-right corner
3. The conversation will be exported with the same output options as Gemini

> **Keep Auto-scroll enabled for long conversations.** ChatGPT mounts only a window of turns at a time and discards the rest; with Auto-scroll off, only the turns currently on screen can be exported.

### Perplexity

1. Open a conversation on [www.perplexity.ai](https://www.perplexity.ai)
2. Click the purple "Sync" button in the bottom-right corner
3. The conversation will be exported with the same output options as Gemini

### NotebookLM

1. Open a notebook on [notebooklm.google.com](https://notebooklm.google.com)
2. Click the purple "Sync" button in the bottom-right corner
3. The chat conversation will be exported with inline source citations as footnotes

### Deep Research / Extended Thinking Export

**Gemini Deep Research:**
1. Open the Deep Research panel (expanded view)
2. Click the "Sync" button
3. The full report will be saved with its original heading structure

**Claude Extended Thinking (Artifacts):**
1. Open a conversation with an Artifact
2. Click the "Sync" button
3. The Artifact content with inline citations and sources will be extracted

**Perplexity Deep Research:**
1. Open a Perplexity conversation containing a Deep Research report
2. Click the "Sync" button
3. The report content will be extracted alongside normal conversation messages

## Output Format

### Conversation Format

Conversations are saved as Markdown files with YAML frontmatter:

```markdown
---
id: gemini_abc123
title: "How to implement authentication"
source: gemini
url: https://gemini.google.com/app/abc123
created: 2025-01-10T12:00:00Z
modified: 2025-01-10T12:30:00Z
tags:
  - ai-conversation
  - gemini
message_count: 4
---

> [!QUESTION] User
> How do I implement JWT authentication?

> [!NOTE] Gemini
> To implement JWT authentication, you'll need to...
```

### Tool Content Format (Claude)

When "Include tool/search results" is enabled, Claude's web search and tool activity are rendered as collapsible callouts before the assistant response:

```markdown
> [!ABSTRACT]- Searched the web
> Rust latest version 2026 (10 results)
> - Rust Versions | Rust Changelogs (releases.rs)
> - Rust | endoflife.date (endoflife.date)

> [!NOTE] Claude
> Here are the latest Rust version details...
```

The `[!ABSTRACT]-` callout is collapsed by default in Obsidian (the `-` suffix).

### Deep Research Format

Deep Research reports include a `type` field and preserve the original structure:

```markdown
---
id: gemini_deep-research-a1b2c3d4
title: "Comprehensive Analysis of..."
source: gemini
type: deep-research
url: https://gemini.google.com/app/xxx
created: 2025-01-11T10:00:00Z
modified: 2025-01-11T10:00:00Z
tags:
  - ai-research
  - deep-research
  - gemini
message_count: 1
---

# Report Title

## 1. Introduction

The report content with original headings...

## 2. Analysis

Detailed analysis sections...
```

## Vault Path & Filenames

### Vault Path Templates

The **Vault Path** setting supports template tokens that are resolved at save time, so notes can be auto-organized. The default is `AI/{platform}`.

| Token        | Resolves to                                                              |
| ------------ | ------------------------------------------------------------------------ |
| `{platform}` | Source name (`gemini`, `claude`, `chatgpt`, `perplexity`, `notebooklm`)  |
| `{YYYY}`     | 4-digit year, local time (e.g. `2026`)                                   |
| `{YY}`       | 2-digit year, local time (e.g. `26`)                                     |
| `{MM}`       | 2-digit month, zero-padded (e.g. `07`)                                   |
| `{DD}`       | 2-digit day, zero-padded (e.g. `08`)                                     |

Example: `AI/{platform}/{YYYY}/{MM}` sorts notes into per-month folders. Date tokens use your local time zone. In append mode, existing conversations continue updating their original file even after the month rolls over.

### Filename Schemes

Choose how exported note filenames are built (Advanced Settings → **Filename scheme**):

- **`title-id`** (default): `{title}-{conversationId}.md` — stable across renames of the conversation.
- **`title-date`**: `{title}-{YYYY}-{MM}-{DD}.md` — uses the local save date.

If the intended filename is already occupied by a *different* conversation, the extension writes to a safe alternative name instead of overwriting it.

## Image Export

Gemini-generated images are exported alongside the conversation (enabled by default; toggle with **Export images** in Advanced Settings). Each image is captured as base64 and then resolved per output destination:

- **Obsidian**: images are written to your vault under **Image Folder** (default `AI/{platform}/images`, supports the same template tokens as the vault path); the note body embeds them with `![[filename]]` wikilinks.
- **File download**: the Markdown file and each image are downloaded as separate files.
- **Clipboard**: image placeholders are stripped (no binary is copied).

Gemini serves generated images either from `blob:` URLs, which only the page can read, or from Google's image CDN (`googleusercontent.com`). The extension reads `blob:` URLs in the page and downloads CDN-hosted images in the background worker — the browser blocks the page from fetching them directly. This is why the extension requests access to `googleusercontent.com`; it is used only to download images you asked to export.

Guards: up to 20 images per note and 10 MB per image. Append mode strips image placeholders (image handling in append mode is deferred). If an image cannot be saved, the note is still written and a warning names the images that were skipped.

## Development

The dev environment is provisioned by Nix (see [ADR-010](docs/adr/010-nix-only-dev-environment.md)). With `direnv` and `nix-direnv` installed, entering the directory loads the environment automatically; otherwise run `nix develop`.

Every workflow has a Nix entry point (canonical) and an `npm run` alias (compatibility). See [ADR-011](docs/adr/011-nix-task-surface.md).

| Workflow | Nix (canonical) | npm (alias) |
|---|---|---|
| Dev server (HMR) | `nix run .#dev` | `npm run dev` |
| Production build | `nix run .#build` | `npm run build` |
| Build + zip for store | `nix run .#build-zip` | `npm run build:zip` |
| Lint | `nix run .#lint` | `npm run lint` |
| Lint platform consistency | `nix run .#lint-platforms` | `npm run lint:platforms` |
| Format (write) | `nix run .#format` | `npm run format` |
| Format (check) | `nix run .#format-check` | `npm run format:check` |
| Test | `nix run .#test` | `npm test` |
| Test (watch) | `nix run .#test-watch` | `npm run test:watch` |
| Test with coverage | `nix run .#test-coverage` | `npm run test:coverage` |
| E2E auth setup | `nix run .#e2e-auth` | `npm run e2e:auth` |
| E2E selector validation | `nix run .#e2e-selectors` | `npm run e2e:selectors` |
| E2E selectors (headed) | `nix run .#e2e-selectors-headed` | `npm run e2e:selectors:headed` |
| CDP daemon | `nix run .#e2e-daemon -- <start\|stop\|status>` | `npm run e2e:daemon:<sub>` |

> [!NOTE]
> Nix attribute names cannot contain `:`, so npm script names like `e2e:auth` map to `e2e-auth`. The CDP daemon takes its subcommand as an argument: `nix run .#e2e-daemon -- start`.

If `node_modules/` is missing, the Nix wrapper exits with an instruction to run `npm ci` first. Dependency installation is intentionally not auto-run.

## Architecture

```
Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai, notebooklm.google.com)
    ↓ extracts conversation / Deep Research / Artifacts
Background Service Worker
    ↓ sends to Obsidian
Obsidian Local REST API (default: http://127.0.0.1:27123)
```

### Key Components

| Component | Description |
|-----------|-------------|
| `src/content/` | Content script for DOM extraction and UI |
| `src/content/extractors/gemini.ts` | Gemini conversation & Deep Research extractor |
| `src/content/extractors/claude.ts` | Claude conversation & Artifact extractor |
| `src/content/extractors/chatgpt.ts` | ChatGPT conversation extractor |
| `src/content/extractors/perplexity.ts` | Perplexity conversation extractor |
| `src/content/extractors/notebooklm.ts` | NotebookLM chat & source-citation extractor |
| `src/content/image-capture.ts` | Captures Gemini-generated images as base64 in the page context |
| `src/background/` | Service worker for API communication |
| `src/lib/image-output.ts` | Resolves image placeholders per output destination |
| `src/popup/` | Settings UI |
| `src/lib/` | Shared utilities and types |

## HTTPS Setup (Optional)

The extension supports HTTPS connections to the Obsidian Local REST API. This is useful when:
- The Local REST API is configured with HTTPS (self-signed certificate)
- You want to connect to an Obsidian instance on your local network (LAN)

### macOS

1. **Extract the certificate** from the running Obsidian REST API:
   ```bash
   openssl s_client -connect 127.0.0.1:27124 -showcerts \
     </dev/null 2>/dev/null | openssl x509 -outform PEM > obsidian-cert.pem
   ```

2. **Import into macOS Keychain** as a trusted root certificate:
   ```bash
   sudo security add-trusted-cert -d -r trustRoot \
     -k /Library/Keychains/System.keychain obsidian-cert.pem
   ```

3. **Restart Chrome completely** (Cmd+Q → relaunch). A simple tab reload is not sufficient.

4. **Set the API URL** in the extension popup to your HTTPS endpoint (e.g., `https://127.0.0.1:27124`).

> **Note**: If Obsidian regenerates its certificate (e.g., after a plugin update), you must re-extract and re-import the new certificate. Chrome extensions require OS-level certificate trust — browser-level "proceed anyway" exceptions do not apply to extension service workers.

### Windows / Linux

Import the certificate into your OS certificate store and restart Chrome. The general approach is the same — the certificate must be trusted at the OS level, not just accepted in the browser.

## Security

- **Secure storage**: API key stored in `chrome.storage.local` (not synced)
- **Input validation**: Message content and filenames validated
- **Path traversal protection**: Vault paths sanitized against directory traversal attacks
- **Sender verification**: Only trusted origins can send messages
- **CSP**: Content Security Policy configured for extension pages
- **YAML escaping**: Frontmatter values properly escaped

## Privacy

This extension:
- Does **not** collect your data, and sends **no** analytics or telemetry anywhere
- Sends your conversations only to your Obsidian instance (default: 127.0.0.1, configurable for LAN access)
- Downloads generated images from Google's image CDN (`googleusercontent.com`) when image export is enabled — the same host the AI page already loads them from, and only for images in the conversation you are exporting
- Stores API key locally in your browser (not synced to cloud)

See our [Privacy Policy](https://sho7650.github.io/obsidian-AI-exporter/privacy.html) for details.

## License

MIT

## Contributing

Contributions are welcome! Please read the [CLAUDE.md](CLAUDE.md) for development guidelines.

[![Buy Me a Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=sho7650&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/sho7650)

