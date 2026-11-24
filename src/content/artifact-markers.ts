/**
 * Generated-file marker pipeline shared by the extractors (ADR-046), the
 * counterpart of image-markers.ts.
 *
 * While an extractor reads a message (synchronous) it registers each file card
 * it meets and gets back a `<span data-g2o-craft=…>` marker to splice into the
 * message HTML; the card is remembered under that id. After the messages
 * are assembled, `attach()` hands the pending cards to a platform reader that
 * opens each one and returns its source (asynchronous, sequential), and the
 * results become `ConversationData.artifacts`.
 *
 * Markers whose read failed stay in the body and are resolved away per output;
 * the failure is surfaced as a warning, never swallowed, and never aborts the
 * export.
 */

import { MAX_IMAGES_PER_NOTE } from '../lib/constants';
import { MAX_IMAGE_SIZE_BYTES } from '../lib/image-utils';
import type { ExtractedArtifact, ExtractionResult } from '../lib/types';

/** The attribute the Turndown rule turns into `[name](g2o-craft://id)`. */
const MARKER_ATTRIBUTE = 'data-g2o-craft';

/** A file card seen while reading a message, waiting to be opened. */
export interface PendingArtifact {
  /** Marker id, the key of the body placeholder */
  readonly id: string;
  /** File name the card shows */
  readonly name: string;
  /**
   * The card's live element right now, or null when it is gone. A function and
   * not an element because the page re-renders a card whenever its state
   * changes, which detaches the node that was read.
   */
  readonly locate: () => HTMLElement | null;
}

/** What a platform reader found for one card. */
export type ArtifactReadOutcome =
  | { readonly id: string; readonly language: string; readonly content: string }
  | { readonly id: string; readonly reason: string };

/**
 * Opens the pending cards and reads their sources. Must resolve with at most
 * one outcome per card and must not throw for a card it cannot read — a
 * failure is an outcome with a `reason`.
 */
export type ArtifactReader = (
  pending: readonly PendingArtifact[]
) => Promise<ArtifactReadOutcome[]>;

const encoder = new TextEncoder();

export class ArtifactMarkerCollector {
  private pending = new Map<string, PendingArtifact>();
  /** Caller key → marker id, so a card read twice keeps its id. */
  private ids = new Map<string, string>();

  /** Forget everything from the previous extraction. */
  reset(): void {
    this.pending = new Map();
    this.ids = new Map();
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Register a card and return the marker HTML to splice into the message.
   * `key` identifies the card across repeated reads of the same message.
   */
  markerFor(doc: Document, key: string, name: string, locate: () => HTMLElement | null): string {
    let id = this.ids.get(key);
    if (id === undefined) {
      id = `craft-${this.ids.size + 1}`;
      this.ids.set(key, id);
    }
    this.pending.set(id, { id, name, locate });

    const marker = doc.createElement('span');
    marker.setAttribute(MARKER_ATTRIBUTE, id);
    marker.textContent = name;
    return marker.outerHTML;
  }

  /**
   * Read the pending cards and attach the artifacts to a successful result,
   * immutably. Cards beyond the per-note limit, oversized sources and failed
   * reads are skipped and reported as warnings; their markers remain.
   */
  async attach(result: ExtractionResult, read: ArtifactReader): Promise<ExtractionResult> {
    if (!result.success || !result.data || this.pending.size === 0) return result;

    const failures: string[] = [];
    const cards = [...this.pending.values()];
    const readable = cards.slice(0, MAX_IMAGES_PER_NOTE);
    if (cards.length > readable.length) {
      failures.push(
        `${cards.length - readable.length} craft(s) skipped: more than ${MAX_IMAGES_PER_NOTE} per note`
      );
    }

    const artifacts: ExtractedArtifact[] = [];
    const outcomes = new Map((await read(readable)).map(outcome => [outcome.id, outcome]));
    for (const card of readable) {
      const outcome = outcomes.get(card.id);
      if (!outcome || 'reason' in outcome) {
        const reason = outcome && 'reason' in outcome ? outcome.reason : 'no result';
        console.warn(`[G2O] Craft read failed (${card.name}): ${reason}`);
        failures.push(`${card.name}: ${reason}`);
      } else if (encoder.encode(outcome.content).length > MAX_IMAGE_SIZE_BYTES) {
        failures.push(`${card.name}: larger than the size limit`);
      } else {
        artifacts.push({
          id: card.id,
          name: card.name,
          language: outcome.language,
          content: outcome.content,
        });
      }
    }

    const warnings =
      failures.length > 0
        ? [...(result.warnings ?? []), `Some crafts were not exported: ${failures.join('; ')}`]
        : result.warnings;
    return { ...result, data: { ...result.data, artifacts }, ...(warnings && { warnings }) };
  }
}
