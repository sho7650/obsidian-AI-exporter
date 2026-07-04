/**
 * Platform registry — single source of truth for per-platform metadata (ADR-014)
 *
 * `Record<AIPlatform, PlatformInfo>` forces compile-time exhaustiveness:
 * extending the AIPlatform union fails to compile until an entry is added
 * here, and consumers keyed by the union stay in sync automatically.
 *
 * Extractor constructors intentionally live in src/content/index.ts, not
 * here: this module is pure data so lib/ keeps its one-way layering
 * (enforced by test/arch/layering.test.ts).
 *
 * The manifest (src/manifest.json) cannot import TypeScript; the
 * manifest ⇄ registry seam is guarded by test/arch/platform-ssot.test.ts.
 */

import type { AIPlatform } from './types';

export interface PlatformInfo {
  /** Content-script hostname, exactly as matched in the manifest */
  host: string;
  /** Human-readable display label */
  label: string;
}

export const PLATFORM_REGISTRY: Record<AIPlatform, PlatformInfo> = {
  gemini: { host: 'gemini.google.com', label: 'Gemini' },
  claude: { host: 'claude.ai', label: 'Claude' },
  chatgpt: { host: 'chatgpt.com', label: 'ChatGPT' },
  perplexity: { host: 'www.perplexity.ai', label: 'Perplexity' },
  notebooklm: { host: 'notebooklm.google.com', label: 'NotebookLM' },
};

/** All platform ids, in registry declaration order */
export const ALL_PLATFORMS = Object.keys(PLATFORM_REGISTRY) as readonly AIPlatform[];

/**
 * Resolve a hostname to its platform id.
 *
 * Strict equality prevents subdomain attacks like
 * "evil-gemini.google.com.attacker.com" (CodeQL js/incomplete-url-substring-sanitization).
 */
export function platformForHost(hostname: string): AIPlatform | undefined {
  return ALL_PLATFORMS.find(platform => PLATFORM_REGISTRY[platform].host === hostname);
}

/** Origin for a platform, derived from its host — one fact, one place */
export function platformOrigin(platform: AIPlatform): string {
  return `https://${PLATFORM_REGISTRY[platform].host}`;
}
