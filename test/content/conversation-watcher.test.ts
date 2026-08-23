/**
 * Conversation watcher tests (issue #458)
 *
 * The transitions pinned here are the ones measured on the live platforms on
 * 2026-08-23: every "new chat" takes the path from an id to no id, and every
 * conversation switch swaps one id for another, both without a page load.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startConversationWatcher } from '../../src/content/conversation-watcher';

/** Navigate the way an SPA does: same document, new path. */
function softNavigate(path: string): void {
  window.history.pushState({}, '', path);
}

describe('startConversationWatcher', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.pushState({}, '', '/chat/conv-1');
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it('does not fire while the url is unchanged', () => {
    const onChanged = vi.fn();
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => 'conv-1',
      onChanged,
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(5000);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('does not consult the extractor while the url is unchanged', () => {
    // The tick runs every second for as long as a badge is on screen; it must
    // not re-parse the DOM/URL when nothing moved.
    const getKey = vi.fn(() => 'conv-1');
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey,
      onChanged: vi.fn(),
      intervalMs: 1000,
    });

    vi.advanceTimersByTime(5000);

    expect(getKey).not.toHaveBeenCalled();
  });

  it('fires when the conversation id changes', () => {
    const onChanged = vi.fn();
    let key = 'conv-1';
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => key,
      onChanged,
      intervalMs: 1000,
    });

    softNavigate('/chat/conv-2');
    key = 'conv-2';
    vi.advanceTimersByTime(1000);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith('conv-2');
  });

  it('fires when the conversation id becomes null (new chat)', () => {
    const onChanged = vi.fn();
    let key: string | null = 'conv-1';
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => key,
      onChanged,
      intervalMs: 1000,
    });

    softNavigate('/new');
    key = null;
    vi.advanceTimersByTime(1000);

    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it('does not fire when the url changed but the conversation did not', () => {
    // e.g. Perplexity appending a query parameter to the same thread.
    const onChanged = vi.fn();
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => 'conv-1',
      onChanged,
      intervalMs: 1000,
    });

    softNavigate('/chat/conv-1?utm=x');
    vi.advanceTimersByTime(1000);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('reports each distinct conversation once', () => {
    const onChanged = vi.fn();
    let key = 'conv-1';
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => key,
      onChanged,
      intervalMs: 1000,
    });

    softNavigate('/chat/conv-2');
    key = 'conv-2';
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);

    softNavigate('/chat/conv-3');
    key = 'conv-3';
    vi.advanceTimersByTime(1000);

    expect(onChanged.mock.calls).toEqual([['conv-2'], ['conv-3']]);
  });

  it('stops firing after stop()', () => {
    const onChanged = vi.fn();
    let key = 'conv-1';
    const stopFn = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => key,
      onChanged,
      intervalMs: 1000,
    });

    stopFn();
    softNavigate('/chat/conv-2');
    key = 'conv-2';
    vi.advanceTimersByTime(5000);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('tolerates stop() being called twice', () => {
    const stopFn = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => 'conv-1',
      onChanged: vi.fn(),
      intervalMs: 1000,
    });

    stopFn();

    expect(() => stopFn()).not.toThrow();
  });

  it('does not fire when the extractor throws', () => {
    // A DOM read can throw mid-navigation; that is not a conversation change.
    const onChanged = vi.fn();
    stop = startConversationWatcher({
      initialKey: 'conv-1',
      getKey: () => {
        throw new Error('boom');
      },
      onChanged,
      intervalMs: 1000,
    });

    softNavigate('/chat/conv-2');

    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
