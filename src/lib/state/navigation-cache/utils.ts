import { browser } from '$app/environment';

export function extractPathname(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

export function generateCacheKey(
  url: string,
  userId: string | null,
  anonymousId: string | null
): string {
  const pathname = extractPathname(url);
  const effectiveUserId = getEffectiveUserId(userId, anonymousId);
  return `${pathname}|${effectiveUserId}`;
}

export function getEffectiveUserId(
  userId: string | null,
  anonymousId: string | null
): string {
  return userId || anonymousId || 'anonymous';
}

export function initializeAnonymousId(storageKey: string): string | null {
  if (!browser) return null;

  try {
    let anonymousId = localStorage.getItem(storageKey);
    if (!anonymousId) {
      anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem(storageKey, anonymousId);
    }
    return anonymousId;
  } catch {
    return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export function saveToLocalStorage(key: string, data: object): void {
  if (!browser) return;

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}

export function loadFromLocalStorage<T>(key: string): T | null {
  if (!browser) return null;

  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function removeFromLocalStorage(key: string): void {
  if (!browser) return;

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage errors
  }
}
