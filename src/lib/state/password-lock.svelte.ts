import { browser, dev } from '$app/environment';

export interface PasswordLockState {
  checkPassword: (password: string) => boolean;
  isUnlocked: boolean;
  unlock: () => void;
  lock: () => void;
}

const CORRECT_PASSWORD = 'cardigancrew22';
const COOKIE_NAME = 'bombastic_unlocked';
const COOKIE_EXPIRY_DAYS = 30;

function createPasswordLockState(): PasswordLockState {
  let isUnlocked = $state(false);

  // Check if already unlocked via cookie on initialization
  if (browser) {
    const cookieValue = getCookie(COOKIE_NAME);
    isUnlocked = cookieValue === 'true';
  }

  return {
    get isUnlocked() {
      return dev ? true : isUnlocked;
    },

    checkPassword(password: string): boolean {
      return password === CORRECT_PASSWORD;
    },

    unlock() {
      isUnlocked = true;
      if (browser) {
        setCookie(COOKIE_NAME, 'true', COOKIE_EXPIRY_DAYS);
      }
    },

    lock() {
      isUnlocked = false;
      if (browser) {
        deleteCookie(COOKIE_NAME);
      }
    },
  };
}

// Cookie utilities
function setCookie(name: string, value: string, days: number): void {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict;Secure`;
}

function getCookie(name: string): string | null {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

// Global state instance
let passwordLockState: PasswordLockState | null = null;

export function setPasswordLockState(): PasswordLockState {
  if (!passwordLockState) {
    passwordLockState = createPasswordLockState();
  }
  return passwordLockState;
}

export function getPasswordLockState(): PasswordLockState | null {
  return passwordLockState;
}
