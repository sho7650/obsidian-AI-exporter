/**
 * Fitness function: formatting never rewrites the store dashboard text.
 *
 * docs/store/listing.md holds text that is pasted verbatim into the Chrome Web
 * Store, so a single re-quoted character or inserted line is a real defect — it
 * ships to a reviewer. Bringing Markdown under Prettier put a formatter in the
 * path of that text, which is safe only because of two things this file proves
 * rather than assumes:
 *
 *   1. `embeddedLanguageFormatting: "off"` in .prettierrc. Without it Prettier
 *      reformats recognised languages *inside* fenced blocks. Measured on
 *      README.md, the default setting rewrote a documented `title: "..."` into
 *      `title: '...'` — while escapeYamlValue() (src/lib/yaml-utils.ts) emits
 *      double quotes — and inserted a `>` line into a documented callout. Both
 *      would have made the docs disagree with the code.
 *   2. The character count written beside each field. The sync procedure tells
 *      a human to compare it with the dashboard's own counter, which only means
 *      anything if the count matches the text in this repo.
 *
 * @see https://prettier.io/docs/options — embeddedLanguageFormatting
 */
import fs from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const listingPath = path.join(root, 'docs/store/listing.md');
const source = fs.readFileSync(listingPath, 'utf-8');

const FIELD_BLOCK = /<!--\s*field:\s*([\w.*-]+),\s*limit:\s*\d+\s*-->\s*```text\n([\s\S]*?)\n```/g;

interface Field {
  name: string;
  text: string;
  /** The "N characters" note that follows the block, if present. */
  documentedLength: number | null;
}

function parseFields(markdown: string): Field[] {
  return [...markdown.matchAll(FIELD_BLOCK)].map(match => {
    // Look only as far as the next section or field, so a later count cannot
    // be mistaken for this field's.
    const rest = markdown.slice(match.index + match[0].length);
    const scope = rest.split(/\n(?:#{2,3} |<!--\s*field:)/)[0];
    const counted = /(\d+)\s+characters/.exec(scope);
    return {
      name: match[1],
      text: match[2],
      documentedLength: counted ? Number(counted[1]) : null,
    };
  });
}

const fields = parseFields(source);

describe('architecture: formatting preserves store dashboard text', () => {
  it('parses the field blocks', () => {
    expect(fields.length).toBeGreaterThan(0);
  });

  it.each(fields.map(f => [f.name, f] as const))(
    '%s matches its documented character count',
    (_name, field) => {
      expect(
        field.documentedLength,
        `${field.name} has no "N characters" note — the dashboard counter check depends on it`
      ).not.toBeNull();
      expect(
        field.text.length,
        `${field.name} is ${field.text.length} chars but documented as ${field.documentedLength}`
      ).toBe(field.documentedLength);
    }
  );

  it('keeps embedded-language formatting disabled repo-wide', async () => {
    // listing.md survives either way because its fences are tagged `text`, which
    // Prettier has no parser for. README.md does not: with the default setting
    // Prettier reformats its ```markdown examples of the extension's own output.
    // Nothing else fails when this is switched back on — format:check simply
    // reformats the docs and passes — so the assertion lives here.
    const config = await prettier.resolveConfig(listingPath);
    expect(
      config?.embeddedLanguageFormatting,
      'set embeddedLanguageFormatting to "off" in .prettierrc; documented output samples get rewritten without it'
    ).toBe('off');
  });

  it('leaves every field byte-exact after Prettier runs with the repo config', async () => {
    const config = await prettier.resolveConfig(listingPath);
    const formatted = await prettier.format(source, { ...config, filepath: listingPath });
    const after = new Map(parseFields(formatted).map(f => [f.name, f.text]));

    expect(after.size, 'formatting dropped or merged a field block').toBe(fields.length);
    for (const field of fields) {
      expect(
        after.get(field.name),
        `Prettier rewrote ${field.name}; this text is pasted verbatim into the store`
      ).toBe(field.text);
    }
  });
});
