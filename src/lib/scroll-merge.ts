/**
 * Ordering of turns harvested from successive windows of a virtualized
 * conversation (issues #352, #353). Pure: no DOM, no timers.
 */

/**
 * Merge a newly-harvested window of keys into the accumulated ordering.
 *
 * A window's DOM order is always globally truthful — it is document order — so
 * every already-seen key in it is a valid **anchor**: each run of not-yet-seen
 * keys belongs immediately before the seen key that follows it. Merging by
 * anchor rather than by aligning the window's suffix against the accumulated
 * head is what makes this correct when the newest turns never evict: on both
 * Claude and ChatGPT the last few turns stay mounted in *every* window, so a
 * window harvested near the top looks like `[0…6, <persistent tail>]`. Its
 * suffix is that tail and can never match the accumulated (older) head, but the
 * anchor it needs — the first key it shares with the accumulation — is right
 * there in the window (issues #352, #353).
 *
 * A trailing run with no following anchor goes directly after the last anchor;
 * a window sharing nothing with the accumulation is prepended whole, since
 * windows are only ever harvested while scrolling **upward**. Keys are never
 * dropped and the result never contains duplicates.
 *
 * @param accumulated Keys gathered so far, in conversation order.
 * @param window Keys from the current window, in DOM (top→bottom) order.
 */
export function mergeWindow(accumulated: readonly string[], window: readonly string[]): string[] {
  if (accumulated.length === 0) return dedupeKeys(window);
  if (window.length === 0) return [...accumulated];

  const known = new Set(accumulated);
  const runBefore = new Map<string, string[]>(); // anchor key → run to insert ahead of it
  const staged = new Set<string>();
  let run: string[] = [];
  let lastAnchor: string | null = null;

  for (const key of window) {
    if (known.has(key)) {
      if (run.length > 0) {
        runBefore.set(key, [...(runBefore.get(key) ?? []), ...run]);
        run = [];
      }
      lastAnchor = key;
    } else if (!staged.has(key)) {
      staged.add(key);
      run.push(key);
    }
  }

  const lead = lastAnchor === null ? run : [];
  const trail = lastAnchor === null ? [] : run;

  const merged = [...lead];
  for (const key of accumulated) {
    merged.push(...(runBefore.get(key) ?? []), key);
    if (key === lastAnchor) merged.push(...trail);
  }
  return dedupeKeys(merged);
}

/**
 * Final key order for the accumulated turns.
 *
 * When *every* captured turn carries a monotonic order index, sort by it — the
 * platform's own statement of conversation order. Otherwise keep the order
 * {@link mergeWindow} established, which is authoritative on its own; the index
 * is a corroborating signal, not a repair (issues #352, #353).
 */
export function resolveOrder(
  order: readonly string[],
  orderIndex: ReadonlyMap<string, number>
): string[] {
  if (order.length > 0 && order.every(k => orderIndex.has(k))) {
    return [...order].sort((a, b) => (orderIndex.get(a) as number) - (orderIndex.get(b) as number));
  }
  return [...order];
}

/** Remove duplicate keys, keeping first occurrence. */
function dedupeKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
