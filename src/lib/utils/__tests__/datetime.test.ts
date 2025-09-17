/**
 * Timezone and datetime utility functions
 */

export interface TimezoneInfo {
  localTime: string;
  utcTime: string;
  timezoneOffset: number;
  timezoneName: string;
  abbreviation: string;
  offset: string;
  offsetMinutes: number;
}

/**
 * Get current user's timezone information
 */
export function getTimezoneInfo(): TimezoneInfo {
  const now = new Date();
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Get timezone abbreviation
  const shortFormat = new Intl.DateTimeFormat('en', {
    timeZoneName: 'short',
    timeZone: timezoneName,
  });
  const abbreviation =
    shortFormat.formatToParts(now).find((part) => part.type === 'timeZoneName')
      ?.value || 'UTC';

  // Get offset in minutes (negative for behind UTC, positive for ahead)
  const offsetMinutes = now.getTimezoneOffset() * -1;
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;

  return {
    localTime: now.toLocaleString(),
    utcTime: now.toISOString(),
    timezoneOffset: offsetMinutes,
    timezoneName,
    abbreviation,
    offset,
    offsetMinutes,
  };
}

/**
 * Format a datetime string for display
 */
export function formatDateTime(datetime: string | null): string {
  if (!datetime || datetime === '') return 'N/A';

  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format a datetime string for display (date only)
 */
export function formatDateTimeShort(datetime: string | null): string {
  if (!datetime || datetime === '') return 'N/A';

  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format a datetime string in a readable format
 */
export function formatDateTimeReadable(datetime: string | null): string {
  if (!datetime || datetime === '') return 'N/A';

  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Get the current datetime in the format expected by datetime-local input
 */
export function getCurrentLocalDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convert a UTC ISO string to local datetime string for datetime-local input
 */
export function utcToLocalDateTime(utcString: string | null): string {
  if (!utcString || utcString === '') return '';

  try {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * Convert a local datetime string (from datetime-local input) to UTC ISO string
 */
export function localToUtcDateTime(localDatetime: string): string {
  if (!localDatetime || localDatetime === '') return '';

  try {
    const date = new Date(localDatetime);
    if (isNaN(date.getTime())) return '';

    return date.toISOString();
  } catch {
    return '';
  }
}

/**
 * Convert a local datetime string (from datetime-local input) to UTC ISO string
 * This is an alias for localToUtcDateTime for consistency with the new naming
 */
export function convertLocalToUTC(localDatetime: string): string {
  return localToUtcDateTime(localDatetime);
}

/**
 * Convert a UTC ISO string to local datetime string for datetime-local input
 * This is an alias for utcToLocalDateTime for consistency with the new naming
 */
export function convertUTCToLocal(utcString: string): string {
  return utcToLocalDateTime(utcString);
}

/**
 * Format a date for display with timezone information
 */
export function formatDateWithTimezone(
  date: Date | string,
  includeSeconds = false
): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    };

    if (includeSeconds) {
      options.second = '2-digit';
    }

    return dateObj.toLocaleDateString('en-US', options);
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Get the current datetime in the format expected by datetime-local input
 */
export function getCurrentLocalDatetime(): string {
  return getCurrentLocalDateTime();
}

/**
 * Check if a datetime string is in the past
 */
export function isInPast(datetimeString: string): boolean {
  if (!datetimeString) return false;

  try {
    const date = new Date(datetimeString);
    if (isNaN(date.getTime())) return false;

    return date.getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Check if a datetime string is in the future
 */
export function isInFuture(datetimeString: string): boolean {
  if (!datetimeString) return false;

  try {
    const date = new Date(datetimeString);
    if (isNaN(date.getTime())) return false;

    return date.getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Add minutes to a datetime string and return new datetime string
 */
export function addMinutes(datetimeString: string, minutes: number): string {
  if (!datetimeString) return '';

  try {
    const date = new Date(datetimeString);
    if (isNaN(date.getTime())) return '';

    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
  } catch {
    return '';
  }
}

/**
 * Add hours to a datetime string and return new datetime string
 */
export function addHours(datetimeString: string, hours: number): string {
  if (!datetimeString) return '';

  try {
    const date = new Date(datetimeString);
    if (isNaN(date.getTime())) return '';

    date.setHours(date.getHours() + hours);
    return date.toISOString();
  } catch {
    return '';
  }
}

/**
 * Add days to a datetime string and return new datetime string
 */
export function addDays(datetimeString: string, days: number): string {
  if (!datetimeString) return '';

  try {
    const date = new Date(datetimeString);
    if (isNaN(date.getTime())) return '';

    date.setDate(date.getDate() + days);
    return date.toISOString();
  } catch {
    return '';
  }
}

/**
 * Ensure a datetime string is in proper UTC format
 */
export function ensureUTCFormat(datetimeString: string): string {
  if (!datetimeString) return '';

  try {
    const date = new Date(datetimeString);
    if (isNaN(date.getTime())) return '';

    return date.toISOString();
  } catch {
    return '';
  }
}
