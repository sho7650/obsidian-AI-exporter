/**
 * Unit tests for the single source of truth on Markdown code fences (ADR-029).
 *
 * Two halves, written against the rules of CommonMark 0.31.2 §4.5:
 * - the WRITER side sizes a fence so that nothing in the content can close it;
 * - the READER side tracks fence state so that an inner fence is content, not
 *   a delimiter.
 *
 * Both halves exist because issue #433 broke in both directions at once: the
 * emitted fence was too short, and the two fence readers then disagreed about
 * where the code block ended.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_FENCE_LENGTH,
  outerFenceLength,
  sanitizeInfoString,
  fenceCodeBlock,
  nextFenceState,
  type OpenFence,
} from '../../src/lib/code-fence';

/** Backtick runs, built by repetition so the source itself stays fence-free. */
const BT = (n: number): string => '`'.repeat(n);
const F3 = BT(3);
const F4 = BT(4);

describe('outerFenceLength', () => {
  it('uses the minimum fence for code with no fence-capable run', () => {
    expect(outerFenceLength('const x = 1;')).toBe(MIN_FENCE_LENGTH);
    expect(outerFenceLength('')).toBe(MIN_FENCE_LENGTH);
  });

  it('grows past an inner opening fence with an info string', () => {
    expect(outerFenceLength(`# Title\n${F3}python\nprint(1)\n${F3}`)).toBe(4);
  });

  it('grows past a bare inner fence', () => {
    expect(outerFenceLength(`text\n${F3}\ncode\n${F3}`)).toBe(4);
  });

  it('grows past the longest run, not the first', () => {
    expect(outerFenceLength(`${F3}\n${BT(5)}\n${F3}`)).toBe(6);
  });

  it('counts a run indented by up to three spaces (CommonMark §4.5)', () => {
    expect(outerFenceLength(`   ${F3}md`)).toBe(4);
  });

  it('ignores a run indented by four spaces — too much to be a fence', () => {
    expect(outerFenceLength(`    ${F3}md`)).toBe(MIN_FENCE_LENGTH);
  });

  it('ignores backtick runs that are not at the start of a line', () => {
    expect(outerFenceLength(`const s = "${F3}";`)).toBe(MIN_FENCE_LENGTH);
  });

  it('ignores runs shorter than a fence', () => {
    expect(outerFenceLength('``not a fence')).toBe(MIN_FENCE_LENGTH);
  });

  it('ignores tilde runs — a tilde cannot close a backtick fence', () => {
    expect(outerFenceLength('~~~\ncode\n~~~')).toBe(MIN_FENCE_LENGTH);
  });
});

describe('sanitizeInfoString', () => {
  it('strips backticks, which CommonMark forbids in a backtick info string', () => {
    expect(sanitizeInfoString(`py${F3}thon`)).toBe('python');
  });

  it('strips newlines and carriage returns', () => {
    expect(sanitizeInfoString('py\r\nthon')).toBe('python');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeInfoString('  python  ')).toBe('python');
  });

  it('passes an ordinary hint through unchanged', () => {
    expect(sanitizeInfoString('javascript')).toBe('javascript');
  });
});

describe('fenceCodeBlock', () => {
  it('emits the block shape the Turndown rules emitted before ADR-029', () => {
    expect(fenceCodeBlock('x = 1', 'python')).toBe(`\n${F3}python\nx = 1\n${F3}\n`);
  });

  it('omits the info string when no language is given', () => {
    expect(fenceCodeBlock('x = 1')).toBe(`\n${F3}\nx = 1\n${F3}\n`);
  });

  it('trims the code exactly as the previous rules did', () => {
    expect(fenceCodeBlock('\n\nx = 1\n\n', 'py')).toBe(`\n${F3}py\nx = 1\n${F3}\n`);
  });

  it('wraps nested fences in a longer fence (issue #433)', () => {
    const code = `# Title\n${F3}python\nprint(1)\n${F3}`;
    expect(fenceCodeBlock(code, 'markdown')).toBe(`\n${F4}markdown\n${code}\n${F4}\n`);
  });

  it('sizes the fence from the trimmed code', () => {
    expect(fenceCodeBlock(`  ${F3}md\ntext`)).toBe(`\n${F4}\n${F3}md\ntext\n${F4}\n`);
  });

  it('sanitizes the language hint', () => {
    expect(fenceCodeBlock('x', `m${F3}d`)).toBe(`\n${F3}md\nx\n${F3}\n`);
  });
});

describe('nextFenceState', () => {
  const open = (char: '`' | '~', length: number): OpenFence => ({ char, length });

  describe('opening', () => {
    it('opens on a bare fence', () => {
      expect(nextFenceState(null, F3)).toEqual({ state: open('`', 3), isDelimiter: true });
    });

    it('opens on a fence with an info string', () => {
      expect(nextFenceState(null, `${F3}python`)).toEqual({
        state: open('`', 3),
        isDelimiter: true,
      });
    });

    it('records the full run length of a longer fence', () => {
      expect(nextFenceState(null, F4).state).toEqual(open('`', 4));
    });

    it('opens on a tilde fence by default', () => {
      expect(nextFenceState(null, '~~~yaml').state).toEqual(open('~', 3));
    });

    it('does not open on a tilde fence when openChars excludes it', () => {
      expect(nextFenceState(null, '~~~yaml', { openChars: ['`'] })).toEqual({
        state: null,
        isDelimiter: false,
      });
    });

    it('does not open on a backtick fence whose info string contains a backtick', () => {
      expect(nextFenceState(null, `${F3}js \`x\``)).toEqual({ state: null, isDelimiter: false });
    });

    it('opens on a tilde fence whose info string contains a backtick', () => {
      expect(nextFenceState(null, '~~~js `x`').state).toEqual(open('~', 3));
    });

    it('opens when indented by up to three spaces', () => {
      expect(nextFenceState(null, `   ${F3}`).state).toEqual(open('`', 3));
    });

    it('does not open when indented by four spaces', () => {
      expect(nextFenceState(null, `    ${F3}`)).toEqual({ state: null, isDelimiter: false });
    });

    it('does not open on a leading tab (a tab reaches column four)', () => {
      expect(nextFenceState(null, `\t${F3}`)).toEqual({ state: null, isDelimiter: false });
    });

    it('does not open on a run shorter than three characters', () => {
      expect(nextFenceState(null, '``x')).toEqual({ state: null, isDelimiter: false });
    });

    it('leaves ordinary text alone', () => {
      expect(nextFenceState(null, 'const x = 1;')).toEqual({ state: null, isDelimiter: false });
    });
  });

  describe('closing', () => {
    it('closes on a fence of equal length', () => {
      expect(nextFenceState(open('`', 3), F3)).toEqual({ state: null, isDelimiter: true });
    });

    it('closes on a longer fence (CommonMark: at least as long)', () => {
      expect(nextFenceState(open('`', 3), BT(5))).toEqual({ state: null, isDelimiter: true });
    });

    it('does not close on a shorter fence — that is content', () => {
      expect(nextFenceState(open('`', 4), F3)).toEqual({
        state: open('`', 4),
        isDelimiter: false,
      });
    });

    it('does not close on an inner fence carrying an info string (issue #433)', () => {
      expect(nextFenceState(open('`', 3), `${F3}python`)).toEqual({
        state: open('`', 3),
        isDelimiter: false,
      });
    });

    it('does not close on the other fence character', () => {
      expect(nextFenceState(open('`', 3), '~~~').state).toEqual(open('`', 3));
      expect(nextFenceState(open('~', 3), F3).state).toEqual(open('~', 3));
    });

    it('closes when followed by trailing spaces or tabs', () => {
      expect(nextFenceState(open('`', 3), `${F3}  \t`)).toEqual({
        state: null,
        isDelimiter: true,
      });
    });

    it('tolerates a trailing carriage return (ADR-026 defence in depth)', () => {
      expect(nextFenceState(open('`', 3), `${F3}\r`)).toEqual({ state: null, isDelimiter: true });
    });

    it('closes when indented by up to three spaces', () => {
      expect(nextFenceState(open('`', 3), `   ${F3}`)).toEqual({ state: null, isDelimiter: true });
    });

    it('does not close when indented by four spaces', () => {
      expect(nextFenceState(open('`', 3), `    ${F3}`).state).toEqual(open('`', 3));
    });

    it('treats ordinary lines inside a block as content', () => {
      expect(nextFenceState(open('`', 3), '<div>a</div>')).toEqual({
        state: open('`', 3),
        isDelimiter: false,
      });
    });
  });

  describe('blockquote handling', () => {
    it('ignores blockquote markers when stripBlockquote is set', () => {
      expect(nextFenceState(null, `> ${F3}md`, { stripBlockquote: true }).state).toEqual(
        open('`', 3)
      );
      expect(nextFenceState(open('`', 3), `> ${F3}`, { stripBlockquote: true }).state).toBeNull();
    });

    it('does not treat a quoted fence as a delimiter by default', () => {
      expect(nextFenceState(null, `> ${F3}md`)).toEqual({ state: null, isDelimiter: false });
    });
  });

  it('is pure — it never mutates the state it is handed', () => {
    const state = open('`', 3);
    nextFenceState(state, F3);
    expect(state).toEqual({ char: '`', length: 3 });
  });
});
