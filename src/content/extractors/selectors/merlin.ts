/**
 * CSS Selectors for Merlin (www.getmerlin.in)
 *
 * Verified live on 2026-11-24 (docs/requirements/REQ-merlin-extractor.md §3).
 * Merlin is a React/Next.js app (Tailwind, Radix UI, Streamdown markdown
 * renderer). Every message — user and assistant — is an
 * `article[data-message-id]`; all but the last turn sit directly under
 * `.chat-messages-area`, the last pair inside a wrapper, so messages are
 * queried as descendants. Nothing is virtualized.
 *
 * Only selectors that match in EVERY conversation belong here: the live E2E
 * baseline cannot be written while one entry matches nothing (#402). The
 * detection-only selectors for images, crafts, code blocks, citations and the
 * sponsored box stay private to the extractor.
 *
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup } from './types';

export const SELECTORS = {
  // One chat message, user or assistant (HIGH)
  conversationTurn: ['article[data-message-id]'],

  // User message text (HIGH); an attachment's chip is outside these paragraphs
  userMessage: ['p.whitespace-pre-wrap'],

  // Assistant response body (HIGH); a message holds 1-3 of them, some empty
  markdownContent: ['.chat-reply-markdown'],

  // Chat title: the last item of the top-bar breadcrumb (HIGH), also the last
  // list item for a layout that drops the page marker (MEDIUM)
  conversationTitle: [
    'nav[aria-label="breadcrumb"] [data-slot="breadcrumb-page"]',
    'nav[aria-label="breadcrumb"] li:last-child',
  ],
} as const satisfies SelectorGroup;
