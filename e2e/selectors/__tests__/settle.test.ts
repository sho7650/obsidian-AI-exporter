/**
 * Tests for the settle wait that runs between "page is ready" and selector
 * validation.
 *
 * Measured on 2026-08-08: the ready condition does not imply the page has
 * finished rendering. `gemini_conv` is ready as soon as `.conversation-container`
 * exists — the first turn — while the generated image lives in the third turn
 * behind `loading="lazy"`. Three timed loads put the gap at 1313 / 1973 /
 * 1631 ms, and validation used to start immediately, so `generatedImage`
 * intermittently read zero and failed the run.
 *
 * The gap is not Gemini's alone. Every platform shows one between ready and a
 * stable count set: gemini 774ms, claude 1562ms, chatgpt 371ms, perplexity
 * 168ms, notebooklm 16ms — and counts keep moving for a further 600-1600ms
 * after the last selector first matches, which is what a baseline recorded at
 * that moment freezes into the contract.
 */

import { describe, it, expect, vi } from 'vitest';
import { observe, isSettled, waitForSettledCounts } from '../settle';

describe('observe / isSettled', () => {
  it('counts the first observation as one run', () => {
    const progress = observe(null, [1, 2, 3]);

    expect(progress.stableRuns).toBe(1);
    expect(isSettled(progress, 3)).toBe(false);
  });

  it('accumulates runs while the counts repeat', () => {
    let progress = observe(null, [1, 2, 3]);
    progress = observe(progress, [1, 2, 3]);
    progress = observe(progress, [1, 2, 3]);

    expect(progress.stableRuns).toBe(3);
    expect(isSettled(progress, 3)).toBe(true);
  });

  it('restarts the count when any selector changes', () => {
    let progress = observe(null, [4, 4, 0]);
    progress = observe(progress, [4, 4, 0]);
    progress = observe(progress, [4, 4, 1]);

    expect(progress.stableRuns).toBe(1);
    expect(isSettled(progress, 3)).toBe(false);
  });

  it('does not treat the moment the image appears as settled (issue #402)', () => {
    // The real transition, from the 2026-08-08 measurement of GEMINI_CONV_URL:
    //   3705ms [...,0,0,0,...]  →  5042ms [...,1,1,1,...]
    // Validating on that first non-zero observation is exactly as unsafe as
    // validating on the zero before it — neither is a settled page.
    const before = [4, 4, 4, 20, 0, 0, 0, 1, 2];
    const after = [4, 4, 4, 20, 1, 1, 1, 1, 2];

    let progress = observe(null, before);
    progress = observe(progress, before);
    progress = observe(progress, after);

    expect(isSettled(progress, 3)).toBe(false);
  });

  it('treats an empty selector set as trivially repeatable', () => {
    let progress = observe(null, []);
    progress = observe(progress, []);
    progress = observe(progress, []);

    expect(isSettled(progress, 3)).toBe(true);
  });
});

describe('waitForSettledCounts', () => {
  /** Deterministic clock + sleep so the loop is testable without a browser. */
  function harness(samples: number[][]) {
    let now = 0;
    const sleeps: number[] = [];
    let index = 0;
    return {
      deps: {
        sleep: (ms: number): Promise<void> => {
          now += ms;
          sleeps.push(ms);
          return Promise.resolve();
        },
        now: (): number => now,
      },
      sample: (): Promise<number[]> =>
        Promise.resolve(samples[Math.min(index++, samples.length - 1)]),
      sleeps,
    };
  }

  const OPTIONS = { requiredRuns: 3, pollIntervalMs: 300, timeoutMs: 10_000, minElapsedMs: 0 };

  it('returns as soon as the counts have repeated enough times', async () => {
    const h = harness([
      [0, 0],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);

    const result = await waitForSettledCounts(h.sample, { ...OPTIONS, ...h.deps });

    expect(result.settled).toBe(true);
    expect(result.observations).toBe(4);
    expect(result.counts).toEqual([1, 1]);
  });

  it('does not settle inside the quiet stretch before a late selector arrives', async () => {
    // gemini's shape, and the reason stability alone is not enough: the counts
    // hold perfectly still at zero while the image is on its way (~1337ms on
    // the live page), so three identical observations land INSIDE that stretch.
    // The elapsed floor is what stops the wait from concluding there.
    const zero = [4, 4, 0, 0, 0];
    const one = [4, 4, 1, 1, 1];
    const h = harness([zero, zero, zero, zero, one, one, one]);

    const result = await waitForSettledCounts(h.sample, {
      ...OPTIONS,
      ...h.deps,
      minElapsedMs: 1_200,
    });

    expect(result.settled).toBe(true);
    expect(result.counts).toEqual(one);
  });

  it('settles on a stable page once the floor has passed', async () => {
    const h = harness([[4, 4, 1], [4, 4, 1], [4, 4, 1], [4, 4, 1], [4, 4, 1], [4, 4, 1]]);

    const result = await waitForSettledCounts(h.sample, {
      ...OPTIONS,
      ...h.deps,
      minElapsedMs: 900,
    });

    expect(result.settled).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(900);
  });

  it('gives up at the timeout and reports the last observation', async () => {
    // A page whose counts never stop moving must not hang the run.
    let n = 0;
    let now = 0;
    const result = await waitForSettledCounts(() => Promise.resolve([n++]), {
      ...OPTIONS,
      minElapsedMs: 0,
      timeoutMs: 1_000,
      sleep: (ms: number) => {
        now += ms;
        return Promise.resolve();
      },
      now: () => now,
    });

    expect(result.settled).toBe(false);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(1_000);
    expect(result.counts.length).toBe(1);
  });

  it('samples at the configured interval', async () => {
    const h = harness([
      [7],
      [7],
      [7],
    ]);

    await waitForSettledCounts(h.sample, { ...OPTIONS, ...h.deps });

    expect(h.sleeps.every(ms => ms === 300)).toBe(true);
  });

  it('surfaces a sampling failure instead of looping on it', async () => {
    const sample = vi.fn().mockRejectedValue(new Error('page closed'));

    await expect(
      waitForSettledCounts(sample, {
        ...OPTIONS,
        sleep: () => Promise.resolve(),
        now: () => 0,
      })
    ).rejects.toThrow('page closed');
  });
});
