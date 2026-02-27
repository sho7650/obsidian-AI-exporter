import { describe, it, expect } from 'vitest';
import { escapeYamlValue } from '../../src/lib/yaml-utils';

describe('escapeYamlValue', () => {
  it('escapes special characters', () => {
    expect(escapeYamlValue('hello: world')).toBe('"hello: world"');
    expect(escapeYamlValue('test\nline')).toBe('"test\\nline"');
    expect(escapeYamlValue('value#comment')).toBe('"value#comment"');
  });

  it('escapes YAML reserved words', () => {
    expect(escapeYamlValue('true')).toBe('"true"');
    expect(escapeYamlValue('false')).toBe('"false"');
    expect(escapeYamlValue('null')).toBe('"null"');
    expect(escapeYamlValue('yes')).toBe('"yes"');
    expect(escapeYamlValue('no')).toBe('"no"');
    expect(escapeYamlValue('on')).toBe('"on"');
    expect(escapeYamlValue('off')).toBe('"off"');
    expect(escapeYamlValue('~')).toBe('"~"');
  });

  it('handles empty strings', () => {
    expect(escapeYamlValue('')).toBe('""');
  });

  it('preserves safe strings', () => {
    expect(escapeYamlValue('hello world')).toBe('hello world');
    expect(escapeYamlValue('simple')).toBe('simple');
    expect(escapeYamlValue('AI-Chat')).toBe('AI-Chat');
  });

  it('escapes strings starting with numbers', () => {
    expect(escapeYamlValue('123abc')).toBe('"123abc"');
    expect(escapeYamlValue('0.5')).toBe('"0.5"');
  });

  it('escapes strings with leading/trailing spaces', () => {
    expect(escapeYamlValue(' leading')).toBe('" leading"');
    expect(escapeYamlValue('trailing ')).toBe('"trailing "');
  });

  it('escapes control characters', () => {
    expect(escapeYamlValue('tab\there')).toBe('"tab\\there"');
    expect(escapeYamlValue('cr\rhere')).toBe('"cr\\rhere"');
  });

  it('escapes quotes within value', () => {
    expect(escapeYamlValue('say "hello"')).toBe('"say \\"hello\\""');
  });

  it('escapes backslashes', () => {
    // Backslashes alone don't trigger quoting in the current implementation
    // Only specific special characters trigger quoting
    expect(escapeYamlValue('path\\to\\file')).toBe('path\\to\\file');
    // But if combined with other special chars, they get escaped
    expect(escapeYamlValue('path:\\ file')).toBe('"path:\\\\ file"');
  });

  it('escapes Unicode line terminators', () => {
    expect(escapeYamlValue('line\u0085end')).toBe('"line\\Nend"');
    expect(escapeYamlValue('line\u2028sep')).toBe('"line\\Lsep"');
    expect(escapeYamlValue('para\u2029sep')).toBe('"para\\Psep"');
  });

  it('escapes YAML syntax characters', () => {
    expect(escapeYamlValue('[array]')).toBe('"[array]"');
    expect(escapeYamlValue('{object}')).toBe('"{object}"');
    expect(escapeYamlValue('key: value')).toBe('"key: value"');
    expect(escapeYamlValue('item & item')).toBe('"item & item"');
    expect(escapeYamlValue('important!')).toBe('"important!"');
  });
});

