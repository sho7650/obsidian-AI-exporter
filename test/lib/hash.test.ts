import { describe, it, expect } from 'vitest';
import { generateHash } from '../../src/lib/hash';

describe('generateHash', () => {
  it('returns 00000000 for empty input', () => {
    expect(generateHash('')).toBe('00000000');
  });

  it('returns consistent hash for same input', () => {
    const input = 'test content';
    expect(generateHash(input)).toBe(generateHash(input));
    expect(generateHash(input)).toBe('5b9662eb');
  });

  it('returns different hash for different input', () => {
    expect(generateHash('hello')).toBe('05e918d2');
    expect(generateHash('world')).toBe('06c11b92');
    expect(generateHash('hello')).not.toBe(generateHash('world'));
  });

  it('handles Unicode characters', () => {
    const hash = generateHash('こんにちは世界');
    expect(hash).toBe('09bec111');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns 8-character padded hex string', () => {
    const hash = generateHash('a');
    expect(hash).toBe('00000061');
    expect(hash).toHaveLength(8);
  });

  it('handles very long strings', () => {
    const longString = 'a'.repeat(100000);
    const hash = generateHash(longString);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hash).toHaveLength(8);
  });

  it('produces deterministic output', () => {
    const inputs = ['test1', 'test2', 'test3'];
    const hashes1 = inputs.map(generateHash);
    const hashes2 = inputs.map(generateHash);
    expect(hashes1).toEqual(hashes2);
  });

  it('always returns exactly 8 lowercase hex chars — never a sign (INT_MIN safety)', () => {
    // Guards against a signed-overflow regression: the internal 32-bit hash can
    // reach -2147483648, whose abs must still render as clean hex (no '-'),
    // since the value feeds filename collision suffixes and dedup keys.
    for (let i = 0; i < 5000; i++) {
      const out = generateHash(`fuzz-${i}-${i * 7919}-${String.fromCharCode(i % 65535)}`);
      expect(out).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});
