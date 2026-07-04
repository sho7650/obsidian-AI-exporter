import { describe, it, expect, vi } from 'vitest';
import { waitForReadyWithRetry, decideLoadOutcome } from '../load-readiness';

describe('waitForReadyWithRetry', () => {
  it('returns true on first attempt without reloading', async () => {
    const waitReady = vi.fn().mockResolvedValue(true);
    const reload = vi.fn().mockResolvedValue(undefined);

    const found = await waitForReadyWithRetry({ waitReady, reload }, { maxAttempts: 3 });

    expect(found).toBe(true);
    expect(waitReady).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads between failed attempts and succeeds on a later attempt', async () => {
    const waitReady = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const reload = vi.fn().mockResolvedValue(undefined);

    const found = await waitForReadyWithRetry({ waitReady, reload }, { maxAttempts: 3 });

    expect(found).toBe(true);
    expect(waitReady).toHaveBeenCalledTimes(3);
    // reload runs after the 1st and 2nd failures, not after the 3rd success
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('returns false after exhausting all attempts and does not reload after the last', async () => {
    const waitReady = vi.fn().mockResolvedValue(false);
    const reload = vi.fn().mockResolvedValue(undefined);

    const found = await waitForReadyWithRetry({ waitReady, reload }, { maxAttempts: 3 });

    expect(found).toBe(false);
    expect(waitReady).toHaveBeenCalledTimes(3);
    // no reload after the final failed attempt
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('with maxAttempts=1 tries once and never reloads', async () => {
    const waitReady = vi.fn().mockResolvedValue(false);
    const reload = vi.fn().mockResolvedValue(undefined);

    const found = await waitForReadyWithRetry({ waitReady, reload }, { maxAttempts: 1 });

    expect(found).toBe(false);
    expect(waitReady).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('decideLoadOutcome', () => {
  it('validates when the ready selector was found', () => {
    const d = decideLoadOutcome({ platform: 'gemini', readyFound: true, loadingPresent: true });
    expect(d.action).toBe('validate');
  });

  it('skips (transient) when ready is absent but a loading indicator is present', () => {
    const d = decideLoadOutcome({ platform: 'gemini', readyFound: false, loadingPresent: true });
    expect(d.action).toBe('skip');
    expect(d.reason).toMatch(/transient/i);
    expect(d.reason).toContain('gemini');
  });

  it('validates (possible regression) when ready is absent and no loading indicator', () => {
    const d = decideLoadOutcome({ platform: 'gemini', readyFound: false, loadingPresent: false });
    expect(d.action).toBe('validate');
    expect(d.reason).toMatch(/regression/i);
  });
});

describe('decideLoadOutcome stall escalation', () => {
  const base = { platform: 'gemini', readyFound: false, loadingPresent: true };

  it('skips while consecutive stalls are below the threshold', () => {
    const d = decideLoadOutcome({ ...base, priorConsecutiveStalls: 0, maxConsecutiveStalls: 3 });
    expect(d.action).toBe('skip');
    expect(d.reason).toContain('1/3');
  });

  it('escalates to validate (-> FAIL) when the threshold is reached', () => {
    const d = decideLoadOutcome({ ...base, priorConsecutiveStalls: 2, maxConsecutiveStalls: 3 });
    expect(d.action).toBe('validate');
    expect(d.reason).toContain('no longer treated as transient');
  });

  it('keeps escalating on subsequent stalled runs past the threshold', () => {
    const d = decideLoadOutcome({ ...base, priorConsecutiveStalls: 5, maxConsecutiveStalls: 3 });
    expect(d.action).toBe('validate');
  });

  it('still validates immediately when no loading indicator is present', () => {
    const d = decideLoadOutcome({
      ...base,
      loadingPresent: false,
      priorConsecutiveStalls: 0,
      maxConsecutiveStalls: 3,
    });
    expect(d.action).toBe('validate');
  });

  it('defaults to legacy skip behavior when stall counts are not provided', () => {
    const d = decideLoadOutcome(base);
    expect(d.action).toBe('skip');
  });
});
