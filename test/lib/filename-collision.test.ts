import { describe, it, expect } from 'vitest';
import { collisionSuffix, candidateFileName } from '../../src/lib/filename-collision';
import { generateHash } from '../../src/lib/hash';

describe('collisionSuffix', () => {
  it('is the deterministic 8-hex hash of the conversation id', () => {
    const suffix = collisionSuffix('perplexity_top-5-headlines-vRujSvdQ');
    expect(suffix).toBe(generateHash('perplexity_top-5-headlines-vRujSvdQ'));
    expect(suffix).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs for different conversations sharing a title', () => {
    expect(collisionSuffix('perplexity_top-5-headlines-aaa')).not.toBe(
      collisionSuffix('perplexity_top-5-headlines-bbb')
    );
  });
});

describe('candidateFileName', () => {
  it('returns the original name for attempt 0', () => {
    expect(candidateFileName('daily-news.md', 'a1b2c3d4', 0)).toBe('daily-news.md');
  });

  it('appends the collision suffix on attempt 1', () => {
    expect(candidateFileName('daily-news.md', 'a1b2c3d4', 1)).toBe('daily-news-a1b2c3d4.md');
  });

  it('adds a counter for further attempts', () => {
    expect(candidateFileName('daily-news.md', 'a1b2c3d4', 2)).toBe('daily-news-a1b2c3d4-2.md');
    expect(candidateFileName('daily-news.md', 'a1b2c3d4', 5)).toBe('daily-news-a1b2c3d4-5.md');
  });
});
