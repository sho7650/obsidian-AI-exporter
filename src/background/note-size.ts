/**
 * The note size cap message, shared by the pre-gate check in
 * `handleMultiOutput()` and the post-gate checks on each output (DES-019 §4.0).
 */
import { BYTES_PER_MIB } from '../lib/constants';

/** `true` when `length` characters are over the `capMiB` cap. */
export function isOverNoteSize(length: number, capMiB: number): boolean {
  return length > capMiB * BYTES_PER_MIB;
}

/**
 * The text names the setting to raise, as ADR-032 does for the scroll
 * deadlines (issue #467).
 */
export function noteSizeError(length: number, capMiB: number): string {
  const sizeMiB = (length / BYTES_PER_MIB).toFixed(1);
  return (
    `Note is ${sizeMiB} MiB, above the ${capMiB} MiB limit. ` +
    'Raise "Maximum note size" in Settings and sync again.'
  );
}
