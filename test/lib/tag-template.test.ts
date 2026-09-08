import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_CONVERSATION_TAGS,
  DEFAULT_DEEP_RESEARCH_TAGS,
  PLATFORM_TOKEN,
  parseTagList,
  formatTagList,
  resolveTags,
} from '../../src/lib/tag-template';

const FALLBACK = ['fallback', PLATFORM_TOKEN] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('defaults (issue #493)', () => {
  it('match the tags the extension has always written', () => {
    expect(DEFAULT_CONVERSATION_TAGS).toEqual(['ai-conversation', '{platform}']);
    expect(DEFAULT_DEEP_RESEARCH_TAGS).toEqual(['ai-research', 'deep-research', '{platform}']);
    expect(PLATFORM_TOKEN).toBe('{platform}');
  });
});

describe('parseTagList', () => {
  it('splits a comma-separated list and trims each entry', () => {
    expect(parseTagList(' ai/chat , {platform} ', FALLBACK)).toEqual(['ai/chat', '{platform}']);
  });

  it('accepts a single entry without the platform token', () => {
    expect(parseTagList('notes', FALLBACK)).toEqual(['notes']);
  });

  it('drops empty entries produced by stray commas', () => {
    expect(parseTagList('a,,b,', FALLBACK)).toEqual(['a', 'b']);
  });

  it('strips a leading # and replaces internal whitespace with -', () => {
    expect(parseTagList('#Foo Bar', FALLBACK)).toEqual(['Foo-Bar']);
    expect(parseTagList('#a\t b', FALLBACK)).toEqual(['a-b']);
  });

  it('keeps nested tags, underscores and Unicode letters (Obsidian tag rules)', () => {
    expect(parseTagList('ai/chat/2026, snake_case, 研究, kebab-case', FALLBACK)).toEqual([
      'ai/chat/2026',
      'snake_case',
      '研究',
      'kebab-case',
    ]);
  });

  it('returns a copy of the fallback for an empty or whitespace-only field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTagList('', FALLBACK)).toEqual([...FALLBACK]);
    expect(parseTagList('  , ,', FALLBACK)).toEqual([...FALLBACK]);
    expect(parseTagList('', FALLBACK)).not.toBe(FALLBACK);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the whole default list, with a warning, when any entry is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTagList('x,y!', FALLBACK)).toEqual([...FALLBACK]);
    expect(parseTagList('good, bad tag!', FALLBACK)).toEqual([...FALLBACK]);
    expect(parseTagList('a b, 123', FALLBACK)).toEqual([...FALLBACK]);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0][0]).toContain('[G2O]');
  });

  it('rejects digits-only entries but accepts digits mixed with letters', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTagList('2026', FALLBACK)).toEqual([...FALLBACK]);
    expect(parseTagList('y2026', FALLBACK)).toEqual(['y2026']);
  });

  it('accepts the platform token only spelled exactly', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTagList('{platform}', FALLBACK)).toEqual(['{platform}']);
    expect(parseTagList('{Platform}', FALLBACK)).toEqual([...FALLBACK]);
    expect(parseTagList('{other}', FALLBACK)).toEqual([...FALLBACK]);
  });

  it('never mutates the fallback it is given', () => {
    const fallback = ['a', 'b'];
    parseTagList('', fallback).push('z');
    expect(fallback).toEqual(['a', 'b']);
  });
});

describe('formatTagList', () => {
  it('joins entries for display in the popup', () => {
    expect(formatTagList(['ai-conversation', '{platform}'])).toBe('ai-conversation, {platform}');
    expect(formatTagList([])).toBe('');
  });

  it('round-trips through parseTagList', () => {
    const tags = ['ai/chat', '{platform}', '研究'];
    expect(parseTagList(formatTagList(tags), FALLBACK)).toEqual(tags);
  });
});

describe('resolveTags', () => {
  it('expands the platform token and leaves literals alone', () => {
    expect(resolveTags(['ai-conversation', '{platform}'], 'claude')).toEqual([
      'ai-conversation',
      'claude',
    ]);
  });

  it('omits the platform tag when the token is absent', () => {
    expect(resolveTags(['notes'], 'gemini')).toEqual(['notes']);
  });

  it('removes duplicates after expansion, case-insensitively, keeping the first', () => {
    expect(resolveTags(['claude', '{platform}', 'Claude'], 'claude')).toEqual(['claude']);
    expect(resolveTags(['AI', 'ai', 'Ai'], 'gemini')).toEqual(['AI']);
  });

  it('reproduces the historical defaults byte-for-byte', () => {
    expect(resolveTags(DEFAULT_CONVERSATION_TAGS, 'perplexity')).toEqual([
      'ai-conversation',
      'perplexity',
    ]);
    expect(resolveTags(DEFAULT_DEEP_RESEARCH_TAGS, 'gemini')).toEqual([
      'ai-research',
      'deep-research',
      'gemini',
    ]);
  });

  it('returns a new array and does not mutate the template', () => {
    const template = ['a', '{platform}'];
    const out = resolveTags(template, 'chatgpt');
    expect(out).not.toBe(template);
    expect(template).toEqual(['a', '{platform}']);
  });
});
