# HTML Fixture Management Guide

## Overview

This directory contains real HTML fixtures for E2E testing.
Each fixture is manually captured from the corresponding AI platform.

## Fixture List

| Platform | File | Description |
|----------|------|-------------|
| Gemini | `gemini/chat-simple.html` | Basic Q&A conversation |
| Gemini | `gemini/deep-research.html` | Deep Research report (with citations) |
| Claude | `claude/chat-simple.html` | Basic conversation |
| Claude | `claude/artifacts.html` | Artifacts/Deep Research |
| ChatGPT | `chatgpt/chat-simple.html` | Basic conversation |
| ChatGPT | `chatgpt/chat-code.html` | Conversation with code blocks |

## Fixture Capture Instructions

### 1. Access the Platform

Log in to the AI service and create or select a test conversation.

### 2. Capture HTML via DevTools

1. Press `F12` or `Cmd+Option+I` to open DevTools
2. Select the Elements tab
3. Select the conversation container element
   - **Gemini**: `.conversation-thread` or `deep-research-immersive-panel`
   - **Claude**: `.conversation-thread` or `#markdown-artifact`
   - **ChatGPT**: `section[data-testid^="conversation-turn"]` parent element (legacy: `article`)
4. Right-click → Copy → Copy outerHTML

### 3. Save File

Save the captured HTML with the following template:

```html
<!--
  Fixture: {platform}/{name}.html
  Captured: YYYY-MM-DD
  URL Pattern: https://{domain}/...

  Description: {what this tests}
  Messages: {N} user, {M} assistant

  Update Trigger: Selector changes or DOM structure changes
-->

{captured HTML}
```

### 4. Privacy Considerations

- Do not use conversations containing personal or confidential information
- Replace conversation content with test content if needed
- Generic values can be used for URLs and IDs

## Fixture Update Flow

```
CI Test Failure
    ↓
Review Error Content
    ↓
┌─────────────────────────┐
│ Snapshot diff?          │
│    ↓                    │
│ Intentional? → vitest -u│
│    ↓                    │
│ Unintentional → Investigate │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Structural assertion    │
│ failure?                │
│    ↓                    │
│ Likely selector change  │
│    ↓                    │
│ Re-capture HTML to verify│
└─────────────────────────┘
```

## Size Limits

- Recommended: 500KB or less per file
- Maximum: 1MB per file
- Unnecessary attributes and styles can be removed
