import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_READY_SELECTORS,
  CONVERSATION_CONTAINER_SELECTOR,
} from '../../src/content/extractors/selectors/ready';
import { SELECTORS as GEMINI } from '../../src/content/extractors/selectors/gemini';
import { SELECTORS as CLAUDE } from '../../src/content/extractors/selectors/claude';
import { SELECTORS as CHATGPT } from '../../src/content/extractors/selectors/chatgpt';
import { SELECTORS as PERPLEXITY } from '../../src/content/extractors/selectors/perplexity';
import { SELECTORS as NOTEBOOKLM } from '../../src/content/extractors/selectors/notebooklm';
import { PLATFORM_REGISTRY } from '../../src/lib/platform-registry';

/**
 * The content script waits for "a conversation has rendered" before it starts
 * (bootstrap.ts waitForConversationContainer). Until 2026-09 that selector was a
 * hand-written list that had drifted from the extractors' own selectors: it
 * still carried `article[data-turn-id]`, which selectors/chatgpt.ts records as
 * 0 matches live since 2026-07 (docs/investigation/e2e-coverage-gaps-2026-09.md
 * §A). The ready selectors are now derived from the groups the extractors read
 * their turns from, so a selector repair fixes both places at once.
 */
describe('CONVERSATION_READY_SELECTORS', () => {
  it('has exactly one entry per registered platform', () => {
    expect(Object.keys(CONVERSATION_READY_SELECTORS).sort()).toEqual(
      Object.keys(PLATFORM_REGISTRY).sort()
    );
  });

  it('is the primary of the group each extractor reads its turns from', () => {
    expect(CONVERSATION_READY_SELECTORS.gemini).toBe(GEMINI.conversationTurn[0]);
    expect(CONVERSATION_READY_SELECTORS.claude).toBe(CLAUDE.conversationRow[0]);
    expect(CONVERSATION_READY_SELECTORS.chatgpt).toBe(CHATGPT.conversationTurn[0]);
    expect(CONVERSATION_READY_SELECTORS.perplexity).toBe(PERPLEXITY.userQuery[0]);
    expect(CONVERSATION_READY_SELECTORS.notebooklm).toBe(NOTEBOOKLM.conversationTurn[0]);
  });

  it('joins every ready selector into the container selector', () => {
    for (const selector of Object.values(CONVERSATION_READY_SELECTORS)) {
      expect(CONVERSATION_CONTAINER_SELECTOR.split(', ')).toContain(selector);
    }
  });

  it('no longer carries the variants the platforms stopped rendering', () => {
    expect(CONVERSATION_CONTAINER_SELECTOR).not.toContain('article[data-turn-id]');
    expect(CONVERSATION_CONTAINER_SELECTOR).not.toContain('threadContentWidth');
  });

  it('is a valid selector list', () => {
    expect(() => document.querySelector(CONVERSATION_CONTAINER_SELECTOR)).not.toThrow();
  });
});
