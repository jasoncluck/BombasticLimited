/**
 * The `<script src="https://www.youtube.com/iframe_api">` tag (loaded once,
 * app-wide, in `(app)/+layout.svelte`) sets `window.YT` to a partial stub
 * well before `YT.Player` is actually a usable constructor — checking
 * `if (window.YT)` alone races the real load and throws "YT.Player is not
 * a constructor" on a cold page load (confirmed in production: this
 * exception fires on the video page's first mount often enough to break
 * the whole page, not just the player). The API's own contract is to call
 * `window.onYouTubeIframeAPIReady()` once it's truly ready; this waits for
 * that (or resolves immediately if it already fired, which is the common
 * case on client-side navigations after the first page load).
 */

interface MinimalYouTubePlayerCtor {
  new (elementId: string, config: unknown): unknown;
}

interface WindowWithYouTubeReady extends Window {
  YT?: { Player?: MinimalYouTubePlayerCtor };
  onYouTubeIframeAPIReady?: () => void;
}

let apiReadyPromise: Promise<void> | null = null;

export function waitForYouTubeIframeAPI(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new Error('waitForYouTubeIframeAPI called outside the browser')
    );
  }

  const windowRef = window as WindowWithYouTubeReady;

  if (windowRef.YT?.Player) {
    return Promise.resolve();
  }

  if (apiReadyPromise) {
    return apiReadyPromise;
  }

  apiReadyPromise = new Promise((resolve) => {
    const previousHandler = windowRef.onYouTubeIframeAPIReady;
    windowRef.onYouTubeIframeAPIReady = () => {
      previousHandler?.();
      resolve();
    };
  });

  return apiReadyPromise;
}
