/**
 * Cross-platform canExtract() contract (ADR-014, ADR-023).
 *
 * Every extractor answers "is this my page?" from PLATFORM_REGISTRY rather than
 * a hostname literal of its own. Before this was centralised, the NotebookLM
 * rebrand broke extraction because the manifest and the extractor each carried
 * their own copy of the host.
 *
 * The suite is driven by the registry itself, so a new platform — or a new host
 * on an existing platform — is covered the moment it is registered.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { GeminiExtractor } from '../../src/content/extractors/gemini';
import { ClaudeExtractor } from '../../src/content/extractors/claude';
import { ChatGPTExtractor } from '../../src/content/extractors/chatgpt';
import { PerplexityExtractor } from '../../src/content/extractors/perplexity';
import { NotebookLMExtractor } from '../../src/content/extractors/notebooklm';
import { PLATFORM_REGISTRY, ALL_PLATFORMS } from '../../src/lib/platform-registry';
import type { AIPlatform, IConversationExtractor } from '../../src/lib/types';
import { resetLocation } from '../fixtures/dom-helpers';

/**
 * Keyed by AIPlatform so the compiler demands an entry when the union grows —
 * the same exhaustiveness guard EXTRACTOR_CONSTRUCTORS uses in content/bootstrap.ts.
 */
const EXTRACTOR_FACTORIES: Record<AIPlatform, () => IConversationExtractor> = {
  gemini: () => new GeminiExtractor(),
  claude: () => new ClaudeExtractor(),
  chatgpt: () => new ChatGPTExtractor(),
  perplexity: () => new PerplexityExtractor(),
  notebooklm: () => new NotebookLMExtractor(),
};

function setHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    value: { hostname, pathname: '/', href: `https://${hostname}/`, search: '', hash: '' },
    writable: true,
    configurable: true,
  });
}

/** Hostnames that embed a real host but must never be accepted. */
function lookalikesFor(host: string): string[] {
  return [`evil-${host}.attacker.com`, `${host}.attacker.com`, `sub.${host}`, `attacker.com`];
}

afterEach(() => {
  resetLocation();
});

describe('canExtract() is derived from the platform registry', () => {
  describe.each(ALL_PLATFORMS)('%s', platform => {
    const createExtractor = EXTRACTOR_FACTORIES[platform];
    const { hosts } = PLATFORM_REGISTRY[platform];

    it.each(hosts)('accepts its registered host %s', host => {
      setHostname(host);
      expect(createExtractor().canExtract()).toBe(true);
    });

    it('rejects every other platform’s hosts', () => {
      const foreignHosts = ALL_PLATFORMS.filter(p => p !== platform).flatMap(
        p => PLATFORM_REGISTRY[p].hosts
      );
      for (const host of foreignHosts) {
        setHostname(host);
        expect(createExtractor().canExtract(), `${platform} accepted ${host}`).toBe(false);
      }
    });

    it.each(lookalikesFor(hosts[0]))('rejects lookalike hostname %s', hostname => {
      setHostname(hostname);
      expect(createExtractor().canExtract()).toBe(false);
    });

    it('rejects an unrelated host', () => {
      setHostname('localhost');
      expect(createExtractor().canExtract()).toBe(false);
    });
  });
});
