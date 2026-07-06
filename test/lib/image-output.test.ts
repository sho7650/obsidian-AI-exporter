import { describe, it, expect } from 'vitest';
import {
  imageFileName,
  stripImagePlaceholders,
  resolveImagesForFile,
  resolveImagesForObsidian,
} from '../../src/lib/image-output';
import type { ExtractedImage } from '../../src/lib/types';

const img = (id: string, mimeType = 'image/png'): ExtractedImage => ({
  id,
  mimeType,
  data: 'UE5H',
  alt: '（AI 生成）',
});

const placeholder = (id: string, alt = '（AI 生成）') => `![${alt}](g2o-image://${id})`;

describe('imageFileName', () => {
  it('builds a deterministic name from note base, index and extension', () => {
    expect(imageFileName('my-note', img('img-1'), 0)).toBe('my-note-img-1.png');
    expect(imageFileName('my-note', img('img-2', 'image/jpeg'), 1)).toBe('my-note-img-2.jpg');
  });

  it('falls back to png for unknown MIME types', () => {
    expect(imageFileName('n', img('img-1', 'application/octet-stream'), 0)).toBe('n-img-1.png');
  });
});

describe('stripImagePlaceholders', () => {
  it('removes image placeholders and collapses surrounding blank lines', () => {
    const body = `> [!NOTE] Gemini\n> text\n\n${placeholder('img-1')}\n\nmore text`;
    const out = stripImagePlaceholders(body);
    expect(out).not.toContain('g2o-image://');
    expect(out).toContain('text');
    expect(out).toContain('more text');
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('leaves placeholder-free bodies unchanged', () => {
    expect(stripImagePlaceholders('plain body')).toBe('plain body');
  });
});

describe('resolveImagesForObsidian', () => {
  it('replaces placeholders with wikilink embeds and lists files to write', () => {
    const body = `intro\n\n${placeholder('img-1')}\n\nmid\n\n${placeholder('img-2')}`;
    const images = [img('img-1'), img('img-2', 'image/jpeg')];
    const { body: out, files } = resolveImagesForObsidian(body, images, 'note-base');

    expect(out).toContain('![[note-base-img-1.png]]');
    expect(out).toContain('![[note-base-img-2.jpg]]');
    expect(out).not.toContain('g2o-image://');
    expect(files).toEqual([
      { fileName: 'note-base-img-1.png', mimeType: 'image/png', data: 'UE5H' },
      { fileName: 'note-base-img-2.jpg', mimeType: 'image/jpeg', data: 'UE5H' },
    ]);
  });

  it('strips placeholders whose image failed to capture (no matching image)', () => {
    const body = `a\n\n${placeholder('img-1')}\n\nb`;
    const { body: out, files } = resolveImagesForObsidian(body, [], 'base');
    expect(out).not.toContain('g2o-image://');
    expect(files).toHaveLength(0);
  });
});

describe('resolveImagesForFile', () => {
  it('replaces placeholders with filename-only markdown links and lists files', () => {
    const body = `${placeholder('img-1', 'cat')}`;
    const { body: out, files } = resolveImagesForFile(body, [img('img-1')], 'note-base');
    expect(out).toContain('![cat](note-base-img-1.png)');
    expect(out).not.toContain('g2o-image://');
    expect(files).toEqual([
      { fileName: 'note-base-img-1.png', mimeType: 'image/png', data: 'UE5H' },
    ]);
  });
});
