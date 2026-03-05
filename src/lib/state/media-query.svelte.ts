import { browser } from '$app/environment';
import { getContext, setContext } from 'svelte';

const breakpoints = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
  // Max-width variants
  'max-sm': '(max-width: 639px)',
  'max-md': '(max-width: 767px)',
  'max-lg': '(max-width: 1023px)',
  'max-xl': '(max-width: 1279px)',
  'max-2xl': '(max-width: 1535px)',
  hover: '(hover: hover)',
  'no-hover': '(hover: none)',
} as const;

export type Breakpoint = keyof typeof breakpoints;

export interface MediaQueryState {
  isMobile: boolean;
  canHover: boolean;
  initialized: boolean;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2xl: boolean;
  isMaxSm: boolean;
  isMaxMd: boolean;
  isMaxLg: boolean;
  isMaxXl: boolean;
  isMaxXl2: boolean;
  cannotHover: boolean;
  supportsHover: boolean;
  isTouchDevice: boolean;
  matches: (key: string) => boolean;
  allMatches: Record<string, boolean>;
  initialize: () => (() => void) | undefined;
}

export class MediaQueryStateClass implements MediaQueryState {
  #mediaQueries = new Map<string, MediaQueryList>();
  #matches = $state<Record<string, boolean>>({});
  #initialized = $state(false);

  constructor() {
    // Set SSR-safe defaults (assume desktop-first)
    this.#matches = {
      sm: true,
      md: true,
      lg: false,
      xl: false,
      '2xl': false,
      'max-sm': false,
      'max-md': false,
      'max-lg': true,
      'max-xl': true,
      'max-2xl': true,
      hover: true,
      'no-hover': false,
    };
  }

  get isSm() {
    return this.#matches['sm'] ?? false;
  }
  get isMd() {
    return this.#matches['md'] ?? false;
  }
  get isLg() {
    return this.#matches['lg'] ?? false;
  }
  get isXl() {
    return this.#matches['xl'] ?? false;
  }
  get is2xl() {
    return this.#matches['2xl'] ?? false;
  }

  get isMaxSm() {
    return this.#matches['max-sm'] ?? false;
  }
  get isMaxMd() {
    return this.#matches['max-md'] ?? false;
  }
  get isMaxLg() {
    return this.#matches['max-lg'] ?? false;
  }
  get isMaxXl() {
    return this.#matches['max-xl'] ?? false;
  }
  get isMaxXl2() {
    return this.#matches['max-2xl'] ?? false;
  }

  /**
   * Check if the device supports hover interactions (like desktop with mouse)
   */
  get canHover() {
    return this.#matches['hover'] ?? true; // Default to true for better initial experience
  }

  /**
   * Check if the device does not support hover interactions (like touch devices)
   */
  get cannotHover() {
    return this.#matches['no-hover'] ?? false;
  }

  get supportsHover() {
    return this.canHover;
  }

  get isTouchDevice() {
    return this.cannotHover;
  }

  // Legacy mobile detection for backward compatibility
  get isMobile() {
    return this.isMaxMd; // Mobile is typically max-md (< 768px)
  }

  get initialized() {
    return this.#initialized;
  }

  matches(key: string): boolean {
    return this.#matches[key] ?? false;
  }

  get allMatches(): Record<string, boolean> {
    return { ...this.#matches };
  }

  initialize() {
    if (!browser) {
      // Set reasonable defaults for SSR
      this.#initialized = true;
      return;
    }

    // Initialize all breakpoints
    const breakpointKeys = Object.keys(breakpoints) as Breakpoint[];

    const updateAllMatches = () => {
      for (const key of breakpointKeys) {
        const mediaQuery = this.#mediaQueries.get(key);
        if (mediaQuery) {
          this.#matches[key] = mediaQuery.matches;
        }
      }

      // Mark as initialized after first check
      if (!this.#initialized) {
        this.#initialized = true;
      }
    };

    // Create media query lists and set up listeners
    for (const [key, query] of Object.entries(breakpoints)) {
      const mediaQueryList = window.matchMedia(query);
      this.#mediaQueries.set(key, mediaQueryList);

      const handleChange = () => {
        this.#matches[key] = mediaQueryList.matches;
      };

      mediaQueryList.addEventListener('change', handleChange);
    }

    // Update all matches immediately
    updateAllMatches();

    // Return cleanup function
    return () => {
      for (const [key, mediaQueryList] of this.#mediaQueries) {
        const handleChange = () => {
          this.#matches[key] = mediaQueryList.matches;
        };
        mediaQueryList.removeEventListener('change', handleChange);
      }
      this.#mediaQueries.clear();
    };
  }
}

const DEFAULT_KEY = '$_media_query_state';

export function setMediaQueryState(key = DEFAULT_KEY) {
  const mediaQueryState = new MediaQueryStateClass();
  return setContext(key, mediaQueryState);
}

export function getMediaQueryState(key = DEFAULT_KEY) {
  return getContext<MediaQueryState>(key);
}
