import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ArtifactMarkerCollector,
  type ArtifactReadOutcome,
  type ArtifactReader,
  type PendingArtifact,
} from '../../src/content/artifact-markers';
import { htmlToMarkdown } from '../../src/content/markdown';
import { sanitizeHtml } from '../../src/lib/sanitize';
import { MAX_IMAGE_SIZE_BYTES } from '../../src/lib/image-utils';
import type { ExtractionResult } from '../../src/lib/types';

function successResult(): ExtractionResult {
  return {
    success: true,
    data: {
      id: 'x',
      title: 't',
      url: 'https://www.getmerlin.in/chat/x',
      source: 'merlin',
      messages: [],
      extractedAt: new Date(0),
      metadata: {
        messageCount: 0,
        userMessageCount: 0,
        assistantMessageCount: 0,
        hasCodeBlocks: false,
      },
    },
  };
}

const locate = (): HTMLElement | null => null;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ArtifactMarkerCollector.markerFor', () => {
  it('returns a span marker that survives sanitization and becomes a placeholder', () => {
    const collector = new ArtifactMarkerCollector();

    const marker = collector.markerFor(document, 'm#0', 'handshake-http.html', locate);

    expect(marker).toBe('<span data-g2o-craft="craft-1">handshake-http.html</span>');
    expect(htmlToMarkdown(sanitizeHtml(`<p>text</p>${marker}`))).toContain(
      '[handshake-http.html](g2o-craft://craft-1)'
    );
    expect(collector.pendingCount).toBe(1);
  });

  it('gives a card the same id every time it is registered', () => {
    const collector = new ArtifactMarkerCollector();

    const first = collector.markerFor(document, 'm#0', 'a.md', locate);
    collector.markerFor(document, 'm#1', 'b.md', locate);
    const again = collector.markerFor(document, 'm#0', 'a.md', locate);

    expect(again).toBe(first);
    expect(collector.pendingCount).toBe(2);
  });

  it('escapes a hostile name in the marker', () => {
    const collector = new ArtifactMarkerCollector();

    const marker = collector.markerFor(document, 'k', '<img src=x onerror=alert(1)>.md', locate);

    expect(marker).not.toContain('<img');
    expect(marker).toContain('&lt;img');
  });

  it('forgets everything on reset', () => {
    const collector = new ArtifactMarkerCollector();
    collector.markerFor(document, 'm#0', 'a.md', locate);

    collector.reset();

    expect(collector.pendingCount).toBe(0);
    expect(collector.markerFor(document, 'other', 'b.md', locate)).toContain('craft-1');
  });
});

describe('ArtifactMarkerCollector.attach', () => {
  function collectorWith(names: string[]): ArtifactMarkerCollector {
    const collector = new ArtifactMarkerCollector();
    names.forEach((name, i) => collector.markerFor(document, `k${i}`, name, locate));
    return collector;
  }

  const readAll: ArtifactReader = async pending =>
    pending.map(item => ({ id: item.id, language: 'markdown', content: `# ${item.name}` }));

  it('attaches one artifact per card, in registration order', async () => {
    const result = await collectorWith(['a.md', 'b.md']).attach(successResult(), readAll);

    expect(result.data?.artifacts).toEqual([
      { id: 'craft-1', name: 'a.md', language: 'markdown', content: '# a.md' },
      { id: 'craft-2', name: 'b.md', language: 'markdown', content: '# b.md' },
    ]);
    expect(result.warnings).toBeUndefined();
  });

  it('returns the result untouched when nothing is pending, without calling the reader', async () => {
    const reader = vi.fn<ArtifactReader>();
    const input = successResult();

    const result = await new ArtifactMarkerCollector().attach(input, reader);

    expect(result).toBe(input);
    expect(reader).not.toHaveBeenCalled();
  });

  it('returns a failed result untouched', async () => {
    const reader = vi.fn<ArtifactReader>();
    const failed: ExtractionResult = { success: false, error: 'nope' };

    expect(await collectorWith(['a.md']).attach(failed, reader)).toBe(failed);
    expect(reader).not.toHaveBeenCalled();
  });

  it('warns about a failed read and keeps the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reader: ArtifactReader = async pending =>
      pending.map((item, i): ArtifactReadOutcome =>
        i === 0
          ? { id: item.id, reason: 'the craft panel did not open' }
          : { id: item.id, language: 'html', content: '<p/>' }
      );

    const result = await collectorWith(['bad.html', 'ok.html']).attach(successResult(), reader);

    expect(result.success).toBe(true);
    expect(result.data?.artifacts?.map(a => a.name)).toEqual(['ok.html']);
    expect(result.warnings).toEqual([
      'Some crafts were not exported: bad.html: the craft panel did not open',
    ]);
  });

  it('treats a card the reader returned nothing for as failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await collectorWith(['a.md']).attach(successResult(), async () => []);

    expect(result.data?.artifacts).toEqual([]);
    expect(result.warnings?.[0]).toContain('a.md: no result');
  });

  it('keeps earlier warnings', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = { ...successResult(), warnings: ['earlier'] };

    const result = await collectorWith(['a.md']).attach(input, async () => []);

    expect(result.warnings?.[0]).toBe('earlier');
    expect(result.warnings).toHaveLength(2);
  });

  it('reads no more than 20 cards and says so', async () => {
    const names = Array.from({ length: 23 }, (_, i) => `f${i}.md`);
    const reader = vi.fn(readAll);

    const result = await collectorWith(names).attach(successResult(), reader);

    expect((reader.mock.calls[0][0] as readonly PendingArtifact[]).length).toBe(20);
    expect(result.data?.artifacts).toHaveLength(20);
    expect(result.warnings?.[0]).toContain('3 craft(s) skipped: more than 20 per note');
  });

  it('skips a source larger than the per-file limit', async () => {
    const huge = 'é'.repeat(MAX_IMAGE_SIZE_BYTES / 2 + 1); // 2 bytes each in UTF-8
    const reader: ArtifactReader = async pending => [
      { id: pending[0].id, language: 'text', content: huge },
      { id: pending[1].id, language: 'text', content: 'small' },
    ];

    const result = await collectorWith(['big.txt', 'small.txt']).attach(successResult(), reader);

    expect(result.data?.artifacts?.map(a => a.name)).toEqual(['small.txt']);
    expect(result.warnings?.[0]).toContain('big.txt: larger than the size limit');
  });

  it('keeps a source exactly at the limit', async () => {
    const reader: ArtifactReader = async pending => [
      { id: pending[0].id, language: 'text', content: 'x'.repeat(MAX_IMAGE_SIZE_BYTES) },
    ];

    const result = await collectorWith(['edge.txt']).attach(successResult(), reader);

    expect(result.data?.artifacts).toHaveLength(1);
  });

  it('does not mutate the input result', async () => {
    const input = successResult();

    await collectorWith(['a.md']).attach(input, readAll);

    expect(input.data?.artifacts).toBeUndefined();
  });
});
