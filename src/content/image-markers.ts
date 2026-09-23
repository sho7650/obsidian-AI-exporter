/**
 * Generated-image marker pipeline shared by the extractors (ADR-008, ADR-041).
 *
 * An extractor rewrites each generated `<img>` into a `<img data-g2o-image=…>`
 * marker while it reads a turn (synchronous, on a clone — the live DOM is never
 * touched), remembers the live element under that id, and after the messages
 * are assembled drains the pending list into base64 images (asynchronous,
 * sequential). Markers whose capture failed stay in the body and are resolved
 * away per output; the failure is surfaced as a warning, never swallowed.
 *
 * The id scheme belongs to the caller. Gemini counts (`img-1`, `img-2`, …)
 * because it extracts in one pass; ChatGPT keys on the widget's own uuid
 * because its virtualized harvest revisits the same turn once per scroll
 * window — pending entries therefore de-duplicate by id, last write wins.
 */

import { captureImage } from './image-capture';
import type { ExtractedImage, ExtractionResult } from '../lib/types';

/** The attribute the Turndown rule turns into `![alt](g2o-image://id)`. */
const MARKER_ATTRIBUTE = 'data-g2o-image';

export interface MarkerOptions {
  /** Matches the generated `<img>` elements inside the element being read. */
  selector: string;
  /**
   * Whether images are exported at all. When false the matched `<img>` is
   * removed instead of marked, so a src-less image never leaks an empty
   * `![]()` into the note.
   */
  enabled: boolean;
  /** Stable id for the image; receives the LIVE element and its match index. */
  idFor: (img: HTMLImageElement, index: number) => string;
}

interface PendingImage {
  id: string;
  alt: string;
  element: HTMLImageElement;
}

function createMarker(doc: Document, id: string, alt: string): HTMLImageElement {
  const marker = doc.createElement('img');
  marker.setAttribute(MARKER_ATTRIBUTE, id);
  if (alt) marker.setAttribute('alt', alt);
  return marker;
}

export class ImageMarkerCollector {
  private pending = new Map<string, PendingImage>();
  private failures: string[] = [];

  /** Forget everything from the previous extraction. */
  reset(): void {
    this.pending = new Map();
    this.failures = [];
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Live elements awaiting capture, in registration order. */
  pendingElements(): HTMLImageElement[] {
    return [...this.pending.values()].map(p => p.element);
  }

  /**
   * The element's innerHTML with every matching `<img>` replaced by a marker.
   *
   * The clone's images become markers; the LIVE elements are what capture
   * needs, because a revoked blob URL can only be read back off the rendered
   * bitmap (ADR-027). querySelectorAll is document order, so index i pairs the
   * clone's image with the live one.
   */
  rewrite(element: HTMLElement, options: MarkerOptions): string {
    if (!element.querySelector(options.selector)) {
      return element.innerHTML;
    }
    const clone = element.cloneNode(true) as HTMLElement;
    const cloned = clone.querySelectorAll<HTMLImageElement>(options.selector);
    const live = element.querySelectorAll<HTMLImageElement>(options.selector);

    cloned.forEach((img, index) => {
      const marker = this.markerFor(live[index], index, options, clone.ownerDocument);
      if (marker) img.replaceWith(marker);
      else img.remove();
    });
    return clone.innerHTML;
  }

  /**
   * Only the markers for the matching images, as HTML, without the rest of the
   * element. For platforms whose image widget sits outside the prose block, so
   * the markers are appended to the message rather than spliced into it.
   */
  markersFor(element: HTMLElement, options: MarkerOptions): string {
    const live = element.querySelectorAll<HTMLImageElement>(options.selector);
    const markers: string[] = [];
    live.forEach((img, index) => {
      const marker = this.markerFor(img, index, options, element.ownerDocument);
      if (marker) markers.push(marker.outerHTML);
    });
    return markers.join('\n');
  }

  /**
   * Attach the captured images to a successful result, immutably. Failed
   * captures are logged and reported as one warning; their markers remain.
   */
  async attach(result: ExtractionResult): Promise<ExtractionResult> {
    if (!result.success || !result.data) return result;
    const images = await this.collect();
    const warnings =
      this.failures.length > 0
        ? [
            ...(result.warnings ?? []),
            `${this.failures.length} image(s) could not be captured: ${[...new Set(this.failures)].join('; ')}`,
          ]
        : result.warnings;
    return { ...result, data: { ...result.data, images }, ...(warnings && { warnings }) };
  }

  /** Register the live image (if exportable) and build its marker. */
  private markerFor(
    live: HTMLImageElement | undefined,
    index: number,
    options: MarkerOptions,
    doc: Document
  ): HTMLImageElement | null {
    if (!options.enabled || !live) return null;
    const src = live.getAttribute('src') ?? '';
    if (!src) return null;
    const id = options.idFor(live, index);
    const alt = live.getAttribute('alt') ?? '';
    this.pending.set(id, { id, alt, element: live });
    return createMarker(doc, id, alt);
  }

  /** Sequential to avoid overwhelming the page; a handful of images. */
  private async collect(): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = [];
    for (const { id, alt, element } of this.pending.values()) {
      const result = await captureImage(element, id, alt);
      if (result.image) {
        images.push(result.image);
        continue;
      }
      // Never drop an image in silence: a lost one leaves an empty assistant
      // message that looks identical to image export being switched off.
      const reason = result.reason ?? 'unknown error';
      console.warn(`[G2O] Image capture failed (${id}): ${reason}`);
      this.failures = [...this.failures, reason];
    }
    return images;
  }
}
