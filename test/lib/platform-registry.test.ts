/**
 * Platform registry tests (ADR-014, ADR-023)
 *
 * Covers the multi-host registry shape introduced when NotebookLM was
 * rebranded to "Gemini Notebook" and moved from notebooklm.google.com to
 * notebook.google.com (issue: NotebookLM rebrand).
 */
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_REGISTRY,
  ALL_PLATFORMS,
  platformForHost,
  platformOrigin,
  platformOrigins,
  platformLabels,
} from '../../src/lib/platform-registry';
import { ALLOWED_ORIGINS, ALL_PLATFORM_LABELS, PLATFORM_LABELS } from '../../src/lib/constants';

describe('PLATFORM_REGISTRY', () => {
  it('gives every platform at least one host', () => {
    for (const platform of ALL_PLATFORMS) {
      expect(PLATFORM_REGISTRY[platform].hosts.length).toBeGreaterThan(0);
    }
  });

  it('maps notebooklm to the new notebook.google.com host first', () => {
    expect(PLATFORM_REGISTRY.notebooklm.hosts[0]).toBe('notebook.google.com');
  });

  it('keeps the legacy notebooklm.google.com host for the rebrand transition', () => {
    expect(PLATFORM_REGISTRY.notebooklm.hosts).toContain('notebooklm.google.com');
  });

  it('labels notebooklm with the current brand name', () => {
    expect(PLATFORM_REGISTRY.notebooklm.label).toBe('Gemini Notebook');
  });

  it('keeps the legacy NotebookLM label as an alias', () => {
    expect(PLATFORM_REGISTRY.notebooklm.labelAliases).toContain('NotebookLM');
  });

  it('never lists the same host under two platforms', () => {
    const seen = new Set<string>();
    for (const platform of ALL_PLATFORMS) {
      for (const host of PLATFORM_REGISTRY[platform].hosts) {
        expect(seen.has(host), `duplicate host ${host}`).toBe(false);
        seen.add(host);
      }
    }
  });
});

describe('platformForHost', () => {
  it('resolves every registered host to its platform', () => {
    for (const platform of ALL_PLATFORMS) {
      for (const host of PLATFORM_REGISTRY[platform].hosts) {
        expect(platformForHost(host)).toBe(platform);
      }
    }
  });

  it('resolves both the new and legacy NotebookLM hosts', () => {
    expect(platformForHost('notebook.google.com')).toBe('notebooklm');
    expect(platformForHost('notebooklm.google.com')).toBe('notebooklm');
  });

  it.each([
    'evil-notebook.google.com.attacker.com',
    'notebook.google.com.attacker.com',
    'attacker.com',
    'sub.notebook.google.com',
    '',
  ])('rejects lookalike hostname %s', hostname => {
    expect(platformForHost(hostname)).toBeUndefined();
  });
});

describe('platformOrigin / platformOrigins', () => {
  it('returns the primary origin for a platform', () => {
    expect(platformOrigin('notebooklm')).toBe('https://notebook.google.com');
    expect(platformOrigin('claude')).toBe('https://claude.ai');
  });

  it('returns every origin for a multi-host platform, primary first', () => {
    expect(platformOrigins('notebooklm')).toEqual([
      'https://notebook.google.com',
      'https://notebooklm.google.com',
    ]);
  });

  it('returns a single origin for single-host platforms', () => {
    expect(platformOrigins('chatgpt')).toEqual(['https://chatgpt.com']);
  });
});

describe('platformLabels', () => {
  it('returns current label plus aliases, longest first', () => {
    expect(platformLabels('notebooklm')).toEqual(['Gemini Notebook', 'NotebookLM']);
  });

  it('returns just the label when a platform has no aliases', () => {
    expect(platformLabels('claude')).toEqual(['Claude']);
  });
});

describe('derived constants', () => {
  it('allows every origin of every platform, including legacy hosts', () => {
    for (const platform of ALL_PLATFORMS) {
      for (const origin of platformOrigins(platform)) {
        expect(ALLOWED_ORIGINS).toContain(origin);
      }
    }
    expect(ALLOWED_ORIGINS).toContain('https://notebook.google.com');
    expect(ALLOWED_ORIGINS).toContain('https://notebooklm.google.com');
  });

  it('keeps PLATFORM_LABELS on the current brand name', () => {
    expect(PLATFORM_LABELS.notebooklm).toBe('Gemini Notebook');
  });

  it('exposes current and legacy labels via ALL_PLATFORM_LABELS', () => {
    expect(ALL_PLATFORM_LABELS).toContain('Gemini Notebook');
    expect(ALL_PLATFORM_LABELS).toContain('NotebookLM');
    expect(ALL_PLATFORM_LABELS).toContain('Gemini');
  });

  it('orders ALL_PLATFORM_LABELS longest-first so regex alternations are greedy-safe', () => {
    const geminiIndex = ALL_PLATFORM_LABELS.indexOf('Gemini');
    const notebookIndex = ALL_PLATFORM_LABELS.indexOf('Gemini Notebook');
    expect(notebookIndex).toBeLessThan(geminiIndex);
  });
});
