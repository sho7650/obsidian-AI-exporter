/**
 * CSS Selectors for ChatGPT (chatgpt.com)
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-003-chatgpt-extractor.md Section 5.3.2
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup } from './types';

export const SELECTORS = {
  // Conversation turn. Since 2026-09 (issue #515) ONE turn holds a user prompt
  // AND its answer: `div[data-turn-key=<user message uuid>]`. The key is stable
  // across virtualized remounts; there is no conversation-wide ordinal any more
  // — the `fallback-turn-N` beside it is renumbered per mounted window (measured
  // live 2026-09-26, docs/investigation/chatgpt-dom-2026-09.md). The pre-2026-09
  // `section[data-turn-id]` layout lives on as LEGACY_SELECTORS in chatgpt.ts,
  // outside this group, because the E2E baseline rejects zero-match entries.
  conversationTurn: [
    'div[data-turn-key]', // Current structure (HIGH)
  ],

  // User message text inside a turn.
  userMessage: [
    '[data-user-message-bubble] .whitespace-pre-wrap', // Structure (HIGH)
  ],

  // Assistant role marker: a visually hidden `<h4>` reading "ChatGPT said:",
  // present on image-only answers too. A marker, NOT the answer body — its text
  // must never be exported (the pre-2026-09 `assistantResponse` group was a body
  // fallback, hence the new name).
  assistantRole: [
    '[data-conversation-role="assistant"]', // Semantic (HIGH)
  ],

  // Assistant answer body (one per markdown block).
  markdownContent: [
    '[data-markdown-text-style="assistant-message"]', // Semantic (HIGH)
  ],

  // Thread scroller for virtualized-conversation auto-scroll (ADR-017). Since
  // 2026-09 it is `flex-direction: column-reverse`, so scrollTop is 0 at the
  // bottom and negative upward (ADR-042). The sidebar has its own scroller,
  // `[data-app-action-sidebar-scroll]`; this semantic attribute tells them apart
  // (the sidebar-decoy lesson, #499).
  scrollContainer: [
    '[data-app-action-timeline-scroll]', // Semantic scroll root (HIGH)
  ],
} as const satisfies SelectorGroup;
