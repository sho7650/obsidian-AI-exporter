/**
 * Date Utilities Tests
 *
 * Tests formatDateWithTimezone() for timezone-aware ISO 8601 date formatting.
 */
import { describe, it, expect } from 'vitest';
import { formatDateWithTimezone } from '../../src/lib/date-utils';

describe('formatDateWithTimezone', () => {
  // Fixed date: 2025-01-15 00:00:00 UTC
  const utcDate = new Date('2025-01-15T00:00:00.000Z');

  describe('UTC timezone', () => {
    it('formats date with +00:00 offset', () => {
      const result = formatDateWithTimezone(utcDate, 'UTC');
      expect(result).toBe('2025-01-15T00:00:00+00:00');
    });
  });

  describe('Asia/Tokyo (JST, UTC+9)', () => {
    it('shifts time forward by 9 hours', () => {
      const result = formatDateWithTimezone(utcDate, 'Asia/Tokyo');
      expect(result).toBe('2025-01-15T09:00:00+09:00');
    });

    it('handles date boundary crossing', () => {
      // 2025-01-15 20:00 UTC = 2025-01-16 05:00 JST
      const lateUtc = new Date('2025-01-15T20:00:00.000Z');
      const result = formatDateWithTimezone(lateUtc, 'Asia/Tokyo');
      expect(result).toBe('2025-01-16T05:00:00+09:00');
    });
  });

  describe('America/New_York (EST/EDT)', () => {
    it('formats winter date with EST offset (UTC-5)', () => {
      // January = EST (no DST)
      const result = formatDateWithTimezone(utcDate, 'America/New_York');
      expect(result).toBe('2025-01-14T19:00:00-05:00');
    });

    it('formats summer date with EDT offset (UTC-4)', () => {
      // July = EDT (DST active)
      const summerDate = new Date('2025-07-15T12:00:00.000Z');
      const result = formatDateWithTimezone(summerDate, 'America/New_York');
      expect(result).toBe('2025-07-15T08:00:00-04:00');
    });
  });

  describe('Asia/Kolkata (IST, UTC+5:30)', () => {
    it('handles half-hour offset timezone', () => {
      const result = formatDateWithTimezone(utcDate, 'Asia/Kolkata');
      expect(result).toBe('2025-01-15T05:30:00+05:30');
    });
  });

  describe('Pacific/Chatham (UTC+12:45 / +13:45 DST)', () => {
    it('handles 45-minute offset timezone in DST (January = summer)', () => {
      // January in Southern Hemisphere = DST → UTC+13:45
      const result = formatDateWithTimezone(utcDate, 'Pacific/Chatham');
      expect(result).toBe('2025-01-15T13:45:00+13:45');
    });

    it('handles 45-minute offset timezone in standard time (July = winter)', () => {
      const winterDate = new Date('2025-07-15T00:00:00.000Z');
      const result = formatDateWithTimezone(winterDate, 'Pacific/Chatham');
      expect(result).toBe('2025-07-15T12:45:00+12:45');
    });
  });

  describe('invalid timezone fallback', () => {
    it('falls back to UTC for invalid timezone string', () => {
      const result = formatDateWithTimezone(utcDate, 'Invalid/Timezone');
      expect(result).toBe('2025-01-15T00:00:00+00:00');
    });

    it('falls back to UTC for empty string', () => {
      const result = formatDateWithTimezone(utcDate, '');
      expect(result).toBe('2025-01-15T00:00:00+00:00');
    });
  });

  describe('edge cases', () => {
    it('handles midnight boundary', () => {
      // Midnight UTC → same day in UTC
      const midnight = new Date('2025-06-01T00:00:00.000Z');
      const result = formatDateWithTimezone(midnight, 'UTC');
      expect(result).toBe('2025-06-01T00:00:00+00:00');
    });

    it('handles year boundary with timezone shift', () => {
      // 2024-12-31 20:00 UTC = 2025-01-01 05:00 JST
      const newYearEve = new Date('2024-12-31T20:00:00.000Z');
      const result = formatDateWithTimezone(newYearEve, 'Asia/Tokyo');
      expect(result).toBe('2025-01-01T05:00:00+09:00');
    });
  });
});
