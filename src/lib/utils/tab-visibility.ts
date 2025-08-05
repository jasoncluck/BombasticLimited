/**
 * Tab Visibility Utility
 * Provides a centralized way to manage tab visibility state and callbacks
 * Uses Page Visibility API to detect when tab becomes inactive/active
 */

export interface TabVisibilityState {
  isVisible: boolean;
  isHidden: boolean;
}

export type TabVisibilityCallback = (state: TabVisibilityState) => void;

class TabVisibilityManager {
  private callbacks = new Set<TabVisibilityCallback>();
  private _isVisible = true;

  constructor() {
    if (typeof document !== 'undefined') {
      this._isVisible = !document.hidden;
      this.setupEventListeners();
    }
  }

  private setupEventListeners() {
    const handleVisibilityChange = () => {
      this._isVisible = !document.hidden;
      const state: TabVisibilityState = {
        isVisible: this._isVisible,
        isHidden: !this._isVisible,
      };

      // Notify all callbacks
      this.callbacks.forEach((callback) => {
        try {
          callback(state);
        } catch (error) {
          console.warn('Tab visibility callback error:', error);
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also listen for focus/blur events for additional reliability
    window.addEventListener('focus', () => {
      if (document.hidden === false && !this._isVisible) {
        handleVisibilityChange();
      }
    });

    window.addEventListener('blur', () => {
      if (document.hidden === true && this._isVisible) {
        handleVisibilityChange();
      }
    });
  }

  /**
   * Subscribe to tab visibility changes
   * @param callback Function to call when visibility changes
   * @returns Cleanup function to unsubscribe
   */
  subscribe(callback: TabVisibilityCallback): () => void {
    this.callbacks.add(callback);

    // Call immediately with current state
    callback({
      isVisible: this._isVisible,
      isHidden: !this._isVisible,
    });

    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get current visibility state
   */
  get state(): TabVisibilityState {
    return {
      isVisible: this._isVisible,
      isHidden: !this._isVisible,
    };
  }

  /**
   * Check if tab is currently visible
   */
  get isVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Check if tab is currently hidden
   */
  get isHidden(): boolean {
    return !this._isVisible;
  }
}

// Create singleton instance
export const tabVisibility = new TabVisibilityManager();

/**
 * Svelte store-like interface for tab visibility
 * Usage: const isVisible = useTabVisibility();
 */
export function useTabVisibility() {
  // In testing or server environments, return a simple object
  if (typeof document === 'undefined') {
    return {
      isVisible: true,
      isHidden: false,
      state: { isVisible: true, isHidden: false },
      unsubscribe: () => {},
    };
  }

  // For runtime environments with Svelte 5 runes
  let currentState = {
    isVisible: tabVisibility.isVisible,
    isHidden: tabVisibility.isHidden,
  };

  const unsubscribe = tabVisibility.subscribe((state) => {
    currentState = state;
  });

  // Cleanup on component destroy
  // Note: In Svelte 5, this needs to be handled by the component using this
  return {
    get isVisible() {
      return currentState.isVisible;
    },
    get isHidden() {
      return currentState.isHidden;
    },
    get state() {
      return currentState;
    },
    unsubscribe,
  };
}

/**
 * Utility to pause/resume operations based on tab visibility
 */
export class VisibilityAwareTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private callback: () => void;
  private interval: number;
  private isActive = false;
  private unsubscribeVisibility: (() => void) | null = null;

  constructor(callback: () => void, interval: number) {
    this.callback = callback;
    this.interval = interval;
  }

  start() {
    if (this.isActive) return;

    this.isActive = true;

    // Subscribe to visibility changes
    this.unsubscribeVisibility = tabVisibility.subscribe((state) => {
      if (state.isVisible) {
        this.resume();
      } else {
        this.pause();
      }
    });
  }

  stop() {
    this.isActive = false;
    this.clearTimer();

    if (this.unsubscribeVisibility) {
      this.unsubscribeVisibility();
      this.unsubscribeVisibility = null;
    }
  }

  private resume() {
    if (!this.isActive) return;

    this.clearTimer();
    this.timerId = setInterval(this.callback, this.interval);
  }

  private pause() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

/**
 * Create a visibility-aware interval that only runs when tab is visible
 */
export function createVisibilityAwareInterval(
  callback: () => void,
  interval: number
): VisibilityAwareTimer {
  return new VisibilityAwareTimer(callback, interval);
}
