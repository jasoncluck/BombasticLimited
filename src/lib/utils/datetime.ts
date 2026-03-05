/**
 * Timezone and datetime utility functions
 */

export interface TimezoneInfo {
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

  // Get offset
  const offsetMinutes = now.getTimezoneOffset() * -1; // getTimezoneOffset returns negative for ahead of UTC
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;

  return {
    timezoneName,
    abbreviation,
    offset,
    offsetMinutes,
  };
}

/**
 * Format datetime for display
 */
export function formatDateTime(datetime: string | null): string {
  if (!datetime) return 'N/A';

  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format datetime for display (short format - date only)
 */
export function formatDateTimeShort(datetime: string | null): string {
  if (!datetime) return 'N/A';

  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleDateString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format datetime in readable format
 */
export function formatDateTimeReadable(datetime: string | null): string {
  if (!datetime) return 'N/A';

  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Get current datetime in the format expected by datetime-local input
 */
export function getCurrentLocalDateTime(): string {
  const now = new Date();
  return utcToLocalDateTime(now.toISOString());
}

/**
 * Convert UTC datetime string to local datetime string for datetime-local input
 * @param utcString - UTC ISO string from database
 * @returns String in format "YYYY-MM-DDTHH:mm" for datetime-local input
 */
export function utcToLocalDateTime(utcString: string | null): string {
  if (!utcString) return '';

  try {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return '';

    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
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
 * Convert local datetime string (from datetime-local input) to UTC ISO string
 * @param localDatetime - String in format "YYYY-MM-DDTHH:mm" (from datetime-local input)
 * @returns UTC ISO string suitable for database storage
 */
export function localToUtcDateTime(localDatetime: string): string {
  if (!localDatetime) return '';

  try {
    // Create a Date object from the local datetime string
    // Note: new Date() interprets this as local time
    const localDate = new Date(localDatetime);
    if (isNaN(localDate.getTime())) return '';

    // Return as UTC ISO string
    return localDate.toISOString();
  } catch {
    return '';
  }
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
 * Convert a local datetime string to UTC ISO string (alias for compatibility)
 */
export function convertLocalToUTC(localDatetime: string): string {
  return localToUtcDateTime(localDatetime);
}

/**
 * Convert UTC ISO string to local datetime string (alias for compatibility)
 */
export function convertUTCToLocal(utcString: string): string {
  return utcToLocalDateTime(utcString);
}
