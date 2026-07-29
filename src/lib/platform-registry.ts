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
  /**
   * Content-script hostnames, exactly as matched in the manifest.
   * The first entry is the canonical host; later entries are legacy hosts
   * kept alive across a rename (ADR-023).
   */
  hosts: readonly [string, ...string[]];
  /** Human-readable display label */
  label: string;
  /**
   * Superseded display labels. Notes written before a rebrand still carry
   * these, so append-mode message counting and document.title suffix
   * stripping must keep recognising them (ADR-023).
   */
  labelAliases?: readonly string[];
}

export const PLATFORM_REGISTRY: Record<AIPlatform, PlatformInfo> = {
  gemini: { hosts: ['gemini.google.com'], label: 'Gemini' },
  claude: { hosts: ['claude.ai'], label: 'Claude' },
  chatgpt: { hosts: ['chatgpt.com'], label: 'ChatGPT' },
  perplexity: { hosts: ['www.perplexity.ai'], label: 'Perplexity' },
  notebooklm: {
    // Google rebranded NotebookLM to "Gemini Notebook" and moved it to
    // notebook.google.com. The legacy host currently 301s to the new one, but
    // is kept here so a staggered rollout cannot break extraction (ADR-023).
    hosts: ['notebook.google.com', 'notebooklm.google.com'],
    label: 'Gemini Notebook',
    labelAliases: ['NotebookLM'],
  },
};

/** All platform ids, in registry declaration order */
export const ALL_PLATFORMS = Object.keys(PLATFORM_REGISTRY) as readonly AIPlatform[];

/**
 * Resolve a hostname to its platform id.
 *
 * Each candidate is compared with strict equality, which prevents subdomain
 * attacks like "evil-gemini.google.com.attacker.com"
 * (CodeQL js/incomplete-url-substring-sanitization).
 */
export function platformForHost(hostname: string): AIPlatform | undefined {
  return ALL_PLATFORMS.find(platform => PLATFORM_REGISTRY[platform].hosts.includes(hostname));
}

/** Canonical origin for a platform, derived from its primary host */
export function platformOrigin(platform: AIPlatform): string {
  return `https://${PLATFORM_REGISTRY[platform].hosts[0]}`;
}

/** Every origin a platform may be served from, canonical first */
export function platformOrigins(platform: AIPlatform): string[] {
  return PLATFORM_REGISTRY[platform].hosts.map(host => `https://${host}`);
}

/**
 * Every display label a platform has ever used (current label first, then
 * superseded aliases), sorted longest-first so regex alternations built from
 * this list match "Gemini Notebook" before the shorter "Gemini" (ADR-023).
 */
export function platformLabels(platform: AIPlatform): string[] {
  const { label, labelAliases = [] } = PLATFORM_REGISTRY[platform];
  return [label, ...labelAliases].sort((a, b) => b.length - a.length);
}
