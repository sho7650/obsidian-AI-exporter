import { describe, it, expect } from 'vitest';
import { extractErrorMessage, getErrorMessage } from '../../src/lib/error-utils';
import { ObsidianApiError } from '../../src/lib/obsidian-api';

describe('extractErrorMessage', () => {
  it('extracts message from Error instances', () => {
    const error = new Error('Test error message');
    expect(extractErrorMessage(error)).toBe('Test error message');
  });

  it('converts string to itself', () => {
    expect(extractErrorMessage('string error')).toBe('string error');
  });

  it('converts number to string', () => {
    expect(extractErrorMessage(123)).toBe('123');
  });

  it('converts null to "null"', () => {
    expect(extractErrorMessage(null)).toBe('null');
  });

  it('converts undefined to "undefined"', () => {
    expect(extractErrorMessage(undefined)).toBe('undefined');
  });

  it('converts object to string representation', () => {
    expect(extractErrorMessage({ key: 'value' })).toBe('[object Object]');
  });
});

describe('getErrorMessage', () => {
  it('returns specific message for connection error (status 0)', () => {
    const error = new ObsidianApiError(0, 'Network error');
    expect(getErrorMessage(error)).toBe(
      'Obsidian REST API is not running. Please ensure Obsidian is open and the Local REST API plugin is enabled.'
    );
  });

  it('returns specific message for auth error (status 401)', () => {
    const error = new ObsidianApiError(401, 'Unauthorized');
    expect(getErrorMessage(error)).toBe('Invalid API key. Please check your settings.');
  });

  it('returns specific message for auth error (status 403)', () => {
    const error = new ObsidianApiError(403, 'Forbidden');
    expect(getErrorMessage(error)).toBe('Invalid API key. Please check your settings.');
  });

  it('returns specific message for not found error (status 404)', () => {
    const error = new ObsidianApiError(404, 'Not Found');
    expect(getErrorMessage(error)).toBe('File not found in vault.');
  });

  it('returns original message for other status codes', () => {
    const error = new ObsidianApiError(500, 'Internal Server Error');
    expect(getErrorMessage(error)).toBe('Internal Server Error');
  });

  it('returns Error.message for Error instances', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('returns stringified value for unknown error types', () => {
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(123)).toBe('123');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});
