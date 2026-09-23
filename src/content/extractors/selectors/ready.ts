/**
 * "A conversation has rendered" — one selector per platform, derived from the
 * group each extractor reads its turns from.
 *
 * The content script waits for this before it starts (bootstrap.ts
 * waitForConversationContainer). It used to be a hand-written list there,
 * which drifted from the extractors' selectors: it still carried
 * `article[data-turn-id]` after chatgpt.ts had recorded that variant as dead
 * (2026-07). Deriving the list keeps a selector repair in one place.
 *
 * Keyed by AIPlatform so the compiler demands an entry per platform (ADR-014).
 * Each value is the PRIMARY of its group: readiness must fire on the element
 * the extractor will actually read, not on a loose fallback.
 */

import type { AIPlatform } from '../../../lib/types';
import { SELECTORS as GEMINI } from './gemini';
import { SELECTORS as CLAUDE } from './claude';
import { SELECTORS as CHATGPT } from './chatgpt';
import { SELECTORS as PERPLEXITY } from './perplexity';
import { SELECTORS as NOTEBOOKLM } from './notebooklm';

export const CONVERSATION_READY_SELECTORS: Readonly<Record<AIPlatform, string>> = {
  gemini: GEMINI.conversationTurn[0],
  claude: CLAUDE.conversationRow[0],
  chatgpt: CHATGPT.conversationTurn[0],
  // Perplexity has no turn wrapper in its contract; the query bubble is the
  // first conversation element to render, before any answer exists.
  perplexity: PERPLEXITY.userQuery[0],
  notebooklm: NOTEBOOKLM.conversationTurn[0],
};

/** Selector list matching a rendered conversation on any supported platform. */
export const CONVERSATION_CONTAINER_SELECTOR: string = Object.values(
  CONVERSATION_READY_SELECTORS
).join(', ');
