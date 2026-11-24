import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_ID_PATTERN,
  artifactFileNames,
  resolveArtifacts,
  sanitizeArtifactName,
  stripArtifactPlaceholders,
} from '../../src/lib/artifact-output';
import type { ExtractedArtifact } from '../../src/lib/types';

function artifact(id: string, name: string, content = 'x'): ExtractedArtifact {
  return { id, name, language: 'text', content };
}

describe('sanitizeArtifactName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeArtifactName('handshake-http.html')).toBe('handshake-http.html');
  });

  it.each([
    ['../../etc/passwd', 'passwd'],
    ['dir\\sub\\file.md', 'file.md'],
    ['a<b>c:d"e|f?g*h.md', 'a_b_c_d_e_f_g_h.md'],
    ['notes [draft] #1 ^x.md', 'notes _draft_ _1 _x.md'],
    ['..hidden', 'hidden'],
    ['.env', 'env'],
    ['trailing. ', 'trailing'],
    ['tab\tname.md', 'tab_name.md'],
  ])('makes %j safe: %j', (input, expected) => {
    expect(sanitizeArtifactName(input)).toBe(expected);
  });

  it.each(['', '   ', '...', '/', '..'])('never returns an empty name for %j', input => {
    expect(sanitizeArtifactName(input)).toBe('craft');
  });

  it('caps the length and keeps the extension', () => {
    const name = sanitizeArtifactName(`${'a'.repeat(300)}.html`);
    expect(name).toHaveLength(100);
    expect(name.endsWith('.html')).toBe(true);
  });

  it('caps a long name without a usable extension', () => {
    expect(sanitizeArtifactName('b'.repeat(300))).toHaveLength(100);
  });

  it('never yields a path separator or traversal', () => {
    for (const input of ['a/../b', '..\\..\\x', '%2e%2e/x', 'C:\\x\\y.md']) {
      const name = sanitizeArtifactName(input);
      expect(name).not.toMatch(/[/\\]/);
      expect(name).not.toMatch(/^\.\./);
    }
  });
});

describe('artifactFileNames', () => {
  it('is {noteBaseName}-{originalName}', () => {
    const names = artifactFileNames('note', [artifact('craft-1', 'handshake-http.html')]);
    expect(names.get('craft-1')).toBe('note-handshake-http.html');
  });

  it('suffixes the later of two identical names before the extension', () => {
    const names = artifactFileNames('note', [
      artifact('craft-1', 'diagram.mmd'),
      artifact('craft-2', 'diagram.mmd'),
      artifact('craft-3', 'diagram.mmd'),
    ]);
    expect([...names.values()]).toEqual([
      'note-diagram.mmd',
      'note-diagram-2.mmd',
      'note-diagram-3.mmd',
    ]);
  });

  it('compares names case-insensitively', () => {
    const names = artifactFileNames('note', [
      artifact('craft-1', 'Readme.md'),
      artifact('craft-2', 'README.md'),
    ]);
    expect(names.get('craft-2')).toBe('note-README-2.md');
  });

  it('suffixes a name without an extension', () => {
    const names = artifactFileNames('note', [artifact('a', 'Makefile'), artifact('b', 'Makefile')]);
    expect(names.get('b')).toBe('note-Makefile-2');
  });

  it('does not collide with an artifact that is literally called like a suffixed one', () => {
    const names = artifactFileNames('note', [
      artifact('a', 'x.md'),
      artifact('b', 'x-2.md'),
      artifact('c', 'x.md'),
    ]);
    expect([...names.values()]).toEqual(['note-x.md', 'note-x-2.md', 'note-x-3.md']);
  });

  it('is deterministic across calls', () => {
    const list = [artifact('a', 'x.md'), artifact('b', 'x.md')];
    expect([...artifactFileNames('n', list)]).toEqual([...artifactFileNames('n', list)]);
  });
});

describe('resolveArtifacts', () => {
  const body = [
    'Intro',
    '',
    '[handshake-http.html](g2o-craft://craft-1)',
    '',
    '> [flow.mmd](g2o-craft://craft-2)',
  ].join('\n');

  it('replaces placeholders with wikilinks (not embeds) and lists the files', () => {
    const { body: resolved, files } = resolveArtifacts(
      body,
      [
        artifact('craft-1', 'handshake-http.html', '<p>1</p>'),
        artifact('craft-2', 'flow.mmd', 'A-->B'),
      ],
      'note'
    );

    expect(resolved).toContain('[[note-handshake-http.html]]');
    expect(resolved).toContain('> [[note-flow.mmd]]');
    expect(resolved).not.toContain('![[');
    expect(resolved).not.toContain('g2o-craft://');
    expect(files).toEqual([
      { fileName: 'note-handshake-http.html', content: '<p>1</p>' },
      { fileName: 'note-flow.mmd', content: 'A-->B' },
    ]);
  });

  it('strips a placeholder whose artifact was not read', () => {
    const { body: resolved, files } = resolveArtifacts(
      body,
      [artifact('craft-1', 'handshake-http.html')],
      'note'
    );
    expect(resolved).toContain('[[note-handshake-http.html]]');
    expect(resolved).not.toContain('flow.mmd');
    expect(files).toHaveLength(1);
  });

  it('emits a file once even when its placeholder repeats', () => {
    const repeated = '[a.md](g2o-craft://c)\n\n[a.md](g2o-craft://c)';
    const { body: resolved, files } = resolveArtifacts(repeated, [artifact('c', 'a.md')], 'n');
    expect(resolved.match(/\[\[n-a\.md\]\]/g)).toHaveLength(2);
    expect(files).toHaveLength(1);
  });

  it('ignores an artifact that no placeholder references', () => {
    const { files } = resolveArtifacts('plain', [artifact('c', 'a.md')], 'n');
    expect(files).toEqual([]);
  });

  it('reads an escaped label as one placeholder', () => {
    const { body: resolved } = resolveArtifacts(
      '[we\\]ird \\[name\\].md](g2o-craft://c)',
      [artifact('c', 'weird.md')],
      'n'
    );
    expect(resolved).toBe('[[n-weird.md]]');
  });

  it('collapses the blank lines a stripped placeholder leaves', () => {
    const { body: resolved } = resolveArtifacts('a\n\n[x](g2o-craft://gone)\n\nb', [], 'n');
    expect(resolved).toBe('a\n\nb');
  });

  it('writes a sanitized file name even for a hostile original name', () => {
    const { files } = resolveArtifacts(
      '[x](g2o-craft://c)',
      [artifact('c', '../../../etc/passwd')],
      'note'
    );
    expect(files[0].fileName).toBe('note-passwd');
  });
});

describe('stripArtifactPlaceholders', () => {
  it('removes every placeholder', () => {
    const out = stripArtifactPlaceholders('a\n\n[x](g2o-craft://c1)\n\n[y](g2o-craft://c2)\n\nb');
    expect(out).toBe('a\n\nb');
  });

  it('leaves an ordinary link alone', () => {
    expect(stripArtifactPlaceholders('[x](https://example.test)')).toBe(
      '[x](https://example.test)'
    );
  });
});

describe('ARTIFACT_ID_PATTERN', () => {
  it.each(['craft-1', 'a_b-C9', 'x'.repeat(128)])('accepts %s', id => {
    expect(ARTIFACT_ID_PATTERN.test(id)).toBe(true);
  });

  it.each(['', 'a b', 'a)b', 'a/b', 'x'.repeat(129), 'é'])('rejects %j', id => {
    expect(ARTIFACT_ID_PATTERN.test(id)).toBe(false);
  });
});
