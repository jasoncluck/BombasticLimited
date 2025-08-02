import { browser } from "$app/environment";
import { getContext, setContext } from "svelte";

export interface MediaQueryState {
  isMobile: boolean;
  canHover: boolean;
  initialized: boolean;
  initialize: () => (() => void) | undefined;
}

export class MediaQueryStateClass implements MediaQueryState {
  isMobile = $state(false);
  canHover = $state(true); // Default to true for better initial experience
  initialized = $state(false);

  initialize() {
    if (!browser) {
      // Set reasonable defaults for SSR
      this.isMobile = false;
      this.canHover = true;
      this.initialized = true;
      return;
    }

    // Use a more efficient initialization approach
    const updateMediaQueries = () => {
      this.isMobile = window.innerWidth < 768;
      this.canHover = window.matchMedia("(hover: hover)").matches;

      // Mark as initialized after first check
      if (!this.initialized) {
        this.initialized = true;
      }
    };

    // Update immediately
    updateMediaQueries();

    // Set up listeners for changes
    const mediaQueryList = window.matchMedia("(hover: hover)");
    const mobileMediaQuery = window.matchMedia("(max-width: 767px)");

    const handleHoverChange = () => {
      this.canHover = mediaQueryList.matches;
    };

    const handleMobileChange = () => {
      this.isMobile = mobileMediaQuery.matches;
    };

    const handleResize = () => {
      this.isMobile = window.innerWidth < 768;
    };

    mediaQueryList.addEventListener("change", handleHoverChange);
    mobileMediaQuery.addEventListener("change", handleMobileChange);
    window.addEventListener("resize", handleResize);

    return () => {
      mediaQueryList.removeEventListener("change", handleHoverChange);
      mobileMediaQuery.removeEventListener("change", handleMobileChange);
      window.removeEventListener("resize", handleResize);
    };
  }
}

const DEFAULT_KEY = "$_media_query_state";

export function setMediaQueryState(key = DEFAULT_KEY) {
  const mediaQueryState = new MediaQueryStateClass();
  return setContext(key, mediaQueryState);
}

export function getMediaQueryState(key = DEFAULT_KEY) {
  return getContext<MediaQueryState>(key);
}
