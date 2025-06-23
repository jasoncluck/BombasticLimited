import { getContext, setContext } from "svelte";

// Common breakpoint utilities
export const breakpoints = {
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
  // Max-width variants
  "max-sm": "(max-width: 639px)",
  "max-md": "(max-width: 767px)",
  "max-lg": "(max-width: 1023px)",
  "max-xl": "(max-width: 1279px)",
  "max-2xl": "(max-width: 1535px)",
} as const;

export type Breakpoint = keyof typeof breakpoints;

export type MediaQueryStateProps = {
  /**
   * The breakpoints to watch. If not provided, will watch all common breakpoints.
   */
  breakpoints?: Breakpoint[];

  /**
   * Custom media queries to watch in addition to breakpoints.
   */
  customQueries?: Record<string, string>;
};

class MediaQueryState {
  readonly props: MediaQueryStateProps;
  #mediaQueries = new Map<string, MediaQueryList>();
  #matches = $state<Record<string, boolean>>({});
  #initialized = $state(false);

  constructor(props: MediaQueryStateProps = {}) {
    this.props = props;
  }

  // Reactive getters for common breakpoints
  get isSm() {
    return this.#matches["sm"] ?? false;
  }
  get isMd() {
    return this.#matches["md"] ?? false;
  }
  get isLg() {
    return this.#matches["lg"] ?? false;
  }
  get isXl() {
    return this.#matches["xl"] ?? false;
  }
  get is2xl() {
    return this.#matches["2xl"] ?? false;
  }

  get isMaxSm() {
    return this.#matches["max-sm"] ?? false;
  }
  get isMaxMd() {
    return this.#matches["max-md"] ?? false;
  }
  get isMaxLg() {
    return this.#matches["max-lg"] ?? false;
  }
  get isMaxXl() {
    return this.#matches["max-xl"] ?? false;
  }
  get isMaxXl2() {
    return this.#matches["max-2xl"] ?? false;
  }

  // Convenience getters
  get isMobile() {
    return this.isMaxSm;
  }
  get isTablet() {
    return this.isMd && !this.isLg;
  }
  get isDesktop() {
    return this.isLg;
  }

  get initialized() {
    return this.#initialized;
  }

  /**
   * Check if a specific breakpoint or custom query matches
   */
  matches(key: string): boolean {
    return this.#matches[key] ?? false;
  }

  /**
   * Get all current matches
   */
  get allMatches(): Record<string, boolean> {
    return { ...this.#matches };
  }

  /**
   * Initialize the media query listeners. Should be called in onMount.
   */
  initialize = (): (() => void) => {
    if (typeof window === "undefined" || this.#initialized) {
      return () => {};
    }

    const queriesToWatch = new Map<string, string>();

    // Add breakpoints to watch
    const breakpointsToWatch =
      this.props.breakpoints || (Object.keys(breakpoints) as Breakpoint[]);
    for (const bp of breakpointsToWatch) {
      queriesToWatch.set(bp, breakpoints[bp]);
    }

    // Add custom queries
    if (this.props.customQueries) {
      for (const [key, query] of Object.entries(this.props.customQueries)) {
        queriesToWatch.set(key, query);
      }
    }

    // Set up media query listeners
    for (const [key, query] of queriesToWatch) {
      const mq = window.matchMedia(query);
      this.#mediaQueries.set(key, mq);
      this.#matches[key] = mq.matches;

      const handleChange = (e: MediaQueryListEvent) => {
        this.#matches[key] = e.matches;
      };

      mq.addEventListener("change", handleChange);
    }

    this.#initialized = true;

    // Return cleanup function
    return () => {
      for (const [key, mq] of this.#mediaQueries) {
        const handleChange = (e: MediaQueryListEvent) => {
          this.#matches[key] = e.matches;
        };
        mq.removeEventListener("change", handleChange);
      }
      this.#mediaQueries.clear();
      this.#matches = {};
      this.#initialized = false;
    };
  };

  /**
   * Add a new media query at runtime
   */
  addQuery = (key: string, query: string): void => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(query);
    this.#mediaQueries.set(key, mq);
    this.#matches[key] = mq.matches;

    const handleChange = (e: MediaQueryListEvent) => {
      this.#matches[key] = e.matches;
    };

    mq.addEventListener("change", handleChange);
  };

  /**
   * Remove a media query
   */
  removeQuery = (key: string): void => {
    const mq = this.#mediaQueries.get(key);
    if (mq) {
      const handleChange = (e: MediaQueryListEvent) => {
        this.#matches[key] = e.matches;
      };
      mq.removeEventListener("change", handleChange);
      this.#mediaQueries.delete(key);
      delete this.#matches[key];
    }
  };
}

const DEFAULT_KEY = "$_media_query_state";

/**
 * Instantiates a new `MediaQueryState` instance and sets it in the context.
 *
 * @param props The constructor props for the `MediaQueryState` class.
 * @returns The `MediaQueryState` instance.
 */
export function setMediaQueryState(
  props: MediaQueryStateProps = {},
): MediaQueryState {
  return setContext(Symbol.for(DEFAULT_KEY), new MediaQueryState(props));
}

/**
 * Retrieves the `MediaQueryState` instance from the context. This is a class instance,
 * so you cannot destructure it.
 * @returns The `MediaQueryState` instance.
 */
export function getMediaQueryState(): MediaQueryState {
  return getContext(Symbol.for(DEFAULT_KEY));
}
