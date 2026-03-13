/**
 * Leading-edge throttle utility
 *
 * Executes immediately on first call, then blocks
 * subsequent calls for `limit` milliseconds.
 */

/**
 * Create a throttled version of a function.
 * The function executes on the leading edge (immediately on first call),
 * then ignores subsequent calls until `limit` ms have elapsed.
 *
 * @param fn - Function to throttle
 * @param limit - Minimum interval between executions (ms)
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
