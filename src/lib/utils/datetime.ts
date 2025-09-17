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
 * Convert a local datetime string (from datetime-local input) to UTC ISO string
 * @param localDatetime - String in format "YYYY-MM-DDTHH:mm" (from datetime-local input)
 * @returns UTC ISO string suitable for database storage
 */
export function convertLocalToUTC(localDatetime: string): string {
  if (!localDatetime) return '';

  // Create a Date object from the local datetime string
  // Note: new Date() interprets this as local time
  const localDate = new Date(localDatetime);

  // Return as UTC ISO string
  return localDate.toISOString();
}

/**
 * Convert a UTC ISO string to local datetime string for datetime-local input
 * @param utcString - UTC ISO string from database
 * @returns String in format "YYYY-MM-DDTHH:mm" for datetime-local input
 */
export function convertUTCToLocal(utcString?: string): string {
  if (!utcString) return '';

  const date = new Date(utcString);

  // Format for datetime-local input (YYYY-MM-DDTHH:mm)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a date for display with timezone information
 */
export function formatDateWithTimezone(
  date: Date | string,
  includeSeconds = false
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

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
}

/**
 * Get the current datetime in the format expected by datetime-local input
 */
export function getCurrentLocalDatetime(): string {
  const now = new Date();
  return convertUTCToLocal(now.toISOString());
}

/**
 * Check if a datetime string is in the past
 */
export function isInPast(datetimeString: string): boolean {
  if (!datetimeString) return false;
  const date = new Date(datetimeString);
  return date.getTime() < Date.now();
}

/**
 * Check if a datetime string is in the future
 */
export function isInFuture(datetimeString: string): boolean {
  if (!datetimeString) return false;
  const date = new Date(datetimeString);
  return date.getTime() > Date.now();
}

/**
 * Add minutes to a datetime string and return new datetime string
 */
export function addMinutes(datetimeString: string, minutes: number): string {
  if (!datetimeString) return '';
  const date = new Date(datetimeString);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

/**
 * Add hours to a datetime string and return new datetime string
 */
export function addHours(datetimeString: string, hours: number): string {
  if (!datetimeString) return '';
  const date = new Date(datetimeString);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

/**
 * Add days to a datetime string and return new datetime string
 */
export function addDays(datetimeString: string, days: number): string {
  if (!datetimeString) return '';
  const date = new Date(datetimeString);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
