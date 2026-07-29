/**
 * Fitness function: Chrome Web Store field limits.
 *
 * The store rejects a package upload outright when a localized manifest field
 * exceeds its limit — the failure surfaces only at upload time, after a release
 * has already been tagged. v2.4.0 shipped a 138-character `en` extDescription
 * (limit 132) and could not be published.
 *
 * Limits are per *locale*, so every file under src/_locales must be checked,
 * not just the default one.
 *
 * @see https://developer.chrome.com/docs/extensions/reference/manifest/name
 * @see https://developer.chrome.com/docs/extensions/reference/manifest/description
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const localesDir = path.join(root, 'src/_locales');

/** Chrome Web Store maximum lengths for localized manifest fields. */
const FIELD_LIMITS: Record<string, number> = {
  extName: 45,
  extDescription: 132,
};

interface LocaleMessages {
  [key: string]: { message?: string } | undefined;
}

const locales = fs
  .readdirSync(localesDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

describe('architecture: Chrome Web Store field limits', () => {
  it('discovers at least one locale', () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  describe.each(locales)('locale %s', locale => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf-8')
    ) as LocaleMessages;

    it.each(Object.entries(FIELD_LIMITS))(
      '%s stays within its %i-character store limit',
      (field, limit) => {
        const message = messages[field]?.message;
        expect(message, `${locale}/messages.json is missing ${field}`).toBeDefined();
        expect(
          message!.length,
          `${locale} ${field} is ${message!.length} chars; the store rejects uploads over ${limit}`
        ).toBeLessThanOrEqual(limit);
      }
    );
  });
});
