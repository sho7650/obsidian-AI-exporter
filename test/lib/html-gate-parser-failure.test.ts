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
    stub.tokens = [...unlocatable, { type: 'fence', nesting: 0, map: [2, 5], children: null }];
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

  describe('without an unescaped `<`, the parse is skipped', () => {
    // Raw HTML and autolinks both start with an unescaped `<`, so a body
    // without one cannot carry live HTML. A throwing parser proves no parse ran.
    beforeEach(() => {
      stub.throws = true;
    });

    it.each([
      ['no `<` at all', '> [!NOTE] Claude\n> plain & simple\n'],
      ['only escaped `<`', 'a \\<b> and \\\\\\<i>\n\n```\n\\<div>\n```\n'],
    ])('returns a body with %s unchanged, full save or append', (_name, input) => {
      expect(neutralizeLiveHtml(input)).toBe(input);
      expect(neutralizeLiveHtml(input, { repairFromLine: 1 })).toBe(input);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('still parses a `<` behind an even backslash run', () => {
      expect(neutralizeLiveHtml('a \\\\<b>')).toBe('a \\\\\\<b>');
    });
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
