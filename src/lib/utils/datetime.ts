/**
 * Formats a datetime string to local time
 */
export function formatDateTime(dateTimeString: string | null): string {
  if (!dateTimeString) return 'N/A';
  try {
    return new Date(dateTimeString).toLocaleString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Formats a datetime string to local date only
 */
export function formatDateTimeShort(dateTimeString: string | null): string {
  if (!dateTimeString) return 'N/A';
  try {
    return new Date(dateTimeString).toLocaleDateString();
  } catch {
    return 'Invalid';
  }
}

/**
 * Formats a datetime string with more readable local format
 */
export function formatDateTimeReadable(dateTimeString: string | null): string {
  if (!dateTimeString) return 'N/A';
  try {
    const date = new Date(dateTimeString);
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
 * Gets the current local datetime in format suitable for datetime-local input
 * Returns: "2025-08-13T12:54" (local time)
 */
export function getCurrentLocalDateTime(): string {
  const now = new Date();
  // Adjust for timezone offset to get local time
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16); // Remove seconds and timezone
}

/**
 * Converts UTC datetime to local datetime for input fields
 * Input: "2025-08-13T19:54:00.000Z" (UTC from database)
 * Output: "2025-08-13T12:54" (local time for input)
 */
export function utcToLocalDateTime(utcString: string | null): string {
  if (!utcString) return '';
  try {
    const date = new Date(utcString);
    // Adjust for timezone offset
    const localTime = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    );
    return localTime.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

/**
 * Converts local datetime from input to UTC for storage
 * Input: "2025-08-13T12:54" (local time from input)
 * Output: "2025-08-13T19:54:00.000Z" (UTC for database)
 *
 * Note: This is handled server-side in the form actions
 */
export function localToUtcDateTime(localString: string): string {
  if (!localString) return '';
  try {
    const date = new Date(localString);
    return date.toISOString();
  } catch {
    return '';
  }
}

/**
 * Debug function to show timezone information
 */
export function getTimezoneInfo() {
  const now = new Date();
  return {
    localTime: now.toLocaleString(),
    utcTime: now.toISOString(),
    timezoneOffset: now.getTimezoneOffset(),
    timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
