/**
 * Date formatting utilities with timezone support
 *
 * Formats dates as ISO 8601 with timezone offset (e.g., 2025-01-15T09:00:00+09:00).
 * Uses Intl.DateTimeFormat for timezone conversion — no external dependencies.
 */

const FORMATTER_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

/**
 * Format a Date as ISO 8601 with timezone offset.
 *
 * Falls back to UTC if the timezone string is invalid, logging a warning.
 *
 * @param date - The date to format
 * @param timezone - IANA timezone name (e.g., 'Asia/Tokyo', 'UTC', 'America/New_York')
 * @returns ISO 8601 string with offset, e.g., '2025-01-15T09:00:00+09:00'
 */
export function formatDateWithTimezone(date: Date, timezone: string): string {
  const safeTimezone = validateTimezone(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...FORMATTER_OPTIONS,
    timeZone: safeTimezone,
  });

  const parts = formatter.formatToParts(date);

  const getString = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(p => p.type === type)?.value ?? '00';
  const getNumber = (type: Intl.DateTimeFormatPartTypes): number => parseInt(getString(type), 10);

  const year = getString('year');
  const month = getString('month');
  const day = getString('day');
  const rawHour = getString('hour');
  const hour = rawHour === '24' ? '00' : rawHour; // legacy V8 midnight guard
  const minute = getString('minute');
  const second = getString('second');

  // Calculate UTC offset: build wall-clock time as UTC millis, then subtract actual UTC millis
  let localHour = getNumber('hour');
  if (localHour === 24) localHour = 0;
  const localAsUtc = Date.UTC(
    getNumber('year'),
    getNumber('month') - 1,
    getNumber('day'),
    localHour,
    getNumber('minute'),
    getNumber('second')
  );
  const offsetMinutes = Math.round((localAsUtc - date.getTime()) / 60000);

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
  const offsetMins = String(absMinutes % 60).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetMins}`;
}

/**
 * Validate an IANA timezone string.
 * Returns the timezone if valid, or 'UTC' as fallback.
 */
function validateTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    console.warn(`[G2O] Invalid timezone "${timezone}", falling back to UTC`);
    return 'UTC';
  }
}
