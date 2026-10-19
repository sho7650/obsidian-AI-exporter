/**
 * The gate's fail-closed paths for a parser it cannot trust. markdown-it is
 * replaced by a stub that runs the gate's collection rule over crafted tokens,
 * since a real parse never produces these situations on demand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Rule = (state: { tokens: unknown[]; env: unknown }) => void;
const stub = vi.hoisted(() => ({
  rule: null as Rule | null,
  tokens: [] as unknown[],
  throws: false,
}));

vi.mock('markdown-it', () => ({
  default: class {
    core = {
      ruler: {
        before: (_after: string, _name: string, rule: Rule) => {
          stub.rule = rule;
        },
      },
    };
    use() {
      return this;
    }
    parse(_src: string, env: unknown) {
      if (stub.throws) throw new Error('parser failure');
      stub.rule?.({ tokens: stub.tokens, env });
      return [];
    }
  },
}));

const { neutralizeLiveHtml } = await import('../../src/lib/html-gate');

const body = 'safe line\n\n```\n<div>code</div>\n```\n\nnew <b>line</b>\n';
const unlocatable = [{ type: 'html_block', nesting: 0, map: null, children: null }];
const alwaysHtml = [{ type: 'html_block', nesting: 0, map: [6, 7], children: null }];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  stub.tokens = [];
  stub.throws = false;
});

describe('neutralizeLiveHtml with an untrustworthy parse', () => {
  it('escapes every line when the parser throws on a full save', () => {
    stub.throws = true;
    expect(neutralizeLiveHtml(body)).toBe(
      'safe line\n\n```\n\\<div>code\\</div>\n```\n\nnew \\<b>line\\</b>\n'
    );
  });

  it('escapes every non-code line when a token is unlocatable on a full save', () => {
    stub.tokens = [
      ...unlocatable,
      { type: 'fence', nesting: 0, map: [2, 5], children: null },
    ];
    expect(neutralizeLiveHtml(body)).toBe(
      'safe line\n\n```\n<div>code</div>\n```\n\nnew \\<b>line\\</b>\n'
    );
  });

  it('fails closed when HTML is still reported after every pass', () => {
    stub.tokens = alwaysHtml;
    expect(neutralizeLiveHtml(body)).toBe(
      'safe line\n\n```\n\\<div>code\\</div>\n```\n\nnew \\<b>line\\</b>\n'
    );
  });

  it.each([
    ['the parser throws', () => (stub.throws = true)],
    ['a token is unlocatable', () => (stub.tokens = unlocatable)],
    ['HTML is still reported after every pass', () => (stub.tokens = alwaysHtml)],
  ])('refuses an append when %s', (_name, arrange) => {
    arrange();
    expect(neutralizeLiveHtml(body, { repairFromLine: 6 })).toBeNull();
  });
});
