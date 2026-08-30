/**
 * New-message watcher tests (issue #465).
 *
 * The badge reports the last sync, so it must disappear as soon as the
 * conversation has grown past what that sync covered. The hard part is telling
 * "a turn was added" from "the user scrolled" on a virtualized page, where
 * turns mount and unmount constantly: only an ordinal ABOVE the synced one is
 * proof of a new message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startNewMessageWatcher } from '../../src/content/message-watcher';

describe('startNewMessageWatcher', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it('does not fire while the conversation stays at the synced ordinal', () => {
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => 12,
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(10_000);

    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('does not fire while the user scrolls up through older turns', () => {
    // Virtualization: scrolling up evicts the newest turns, so the mounted
    // maximum FALLS. A drop is never a new message.
    const mounted = [12, 9, 6, 3, 0];
    let tick = 0;
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => mounted[Math.min(tick++, mounted.length - 1)],
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(10_000);

    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('does not fire when the user scrolls back down to the synced turn', () => {
    // Coming back to the bottom re-mounts the tail, so the reading returns to
    // exactly the synced ordinal. Equal is not greater.
    const mounted = [3, 6, 9, 12, 12];
    let tick = 0;
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => mounted[Math.min(tick++, mounted.length - 1)],
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(10_000);

    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('fires once a turn newer than the sync appears', () => {
    let watermark = 12;
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => watermark,
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(3000);
    expect(onNewMessage).not.toHaveBeenCalled();

    watermark = 13; // the user asked a follow-up question
    vi.advanceTimersByTime(1000);

    expect(onNewMessage).toHaveBeenCalledTimes(1);
    expect(onNewMessage).toHaveBeenCalledWith(13);
  });

  it('stops polling once it has fired', () => {
    const getWatermark = vi.fn(() => 20);
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark,
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(1000);
    const callsAtFire = getWatermark.mock.calls.length;
    vi.advanceTimersByTime(10_000);

    expect(onNewMessage).toHaveBeenCalledTimes(1);
    expect(getWatermark).toHaveBeenCalledTimes(callsAtFire);
  });

  it('never polls when the sync produced no watermark', () => {
    // Gemini, Perplexity, Notebook, and any failed sync: with no trustworthy
    // baseline the badge must behave exactly as it did before #465 rather than
    // guess. Not even a timer is armed.
    const getWatermark = vi.fn(() => 99);
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: null,
      getWatermark,
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(10_000);

    expect(getWatermark).not.toHaveBeenCalled();
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('keeps watching when the ordinal cannot be read', () => {
    // Mid-navigation, or a window with no mounted rows: an unreadable DOM says
    // nothing about whether a message arrived.
    const readings: Array<number | null> = [null, null, 13];
    let tick = 0;
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => readings[Math.min(tick++, readings.length - 1)],
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(3000);

    expect(onNewMessage).toHaveBeenCalledTimes(1);
  });

  it('survives a read that throws', () => {
    let shouldThrow = true;
    const onNewMessage = vi.fn();
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => {
        if (shouldThrow) throw new Error('extractor blew up mid-navigation');
        return 13;
      },
      onNewMessage,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(1000);
    expect(onNewMessage).not.toHaveBeenCalled();

    shouldThrow = false;
    vi.advanceTimersByTime(1000);

    expect(onNewMessage).toHaveBeenCalledTimes(1);
  });

  it('stops polling when stopped', () => {
    const getWatermark = vi.fn(() => 12);
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark,
      onNewMessage: vi.fn(),
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(2000);
    const before = getWatermark.mock.calls.length;
    stop();
    vi.advanceTimersByTime(10_000);

    expect(getWatermark).toHaveBeenCalledTimes(before);
  });

  it('is safe to stop more than once', () => {
    stop = startNewMessageWatcher({
      syncedWatermark: 12,
      getWatermark: () => 12,
      onNewMessage: vi.fn(),
      intervalMs: 1000,
    });

    expect(() => {
      stop?.();
      stop?.();
    }).not.toThrow();
  });
});
