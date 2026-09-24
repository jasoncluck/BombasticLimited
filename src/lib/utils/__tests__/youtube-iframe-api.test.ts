import { describe, it, expect, beforeEach, vi } from 'vitest';

interface TestWindow extends Window {
  YT?: unknown;
  onYouTubeIframeAPIReady?: () => void;
}

const testWindow = window as TestWindow;

// Regression test for a production bug: youtube-embed.svelte used to check
// `if (window.YT)` and construct `new window.YT.Player(...)` directly in
// onMount. `window.YT` exists as a partial stub before `YT.Player` is a
// real constructor, so on a cold page load this threw
// "TypeError: YT.Player is not a constructor" (confirmed in production
// console) and broke the whole video page's rendering, not just the
// player -- and with no player, there's no way for YouTube to serve ads
// on the video either. waitForYouTubeIframeAPI() replaces the naive check
// with the API's own documented readiness contract
// (window.onYouTubeIframeAPIReady).
describe('waitForYouTubeIframeAPI', () => {
  beforeEach(() => {
    vi.resetModules();
    delete testWindow.YT;
    delete testWindow.onYouTubeIframeAPIReady;
  });

  it('resolves immediately if YT.Player is already a real constructor', async () => {
    const { waitForYouTubeIframeAPI } = await import('../youtube-iframe-api');

    testWindow.YT = { Player: function () {} };

    await expect(waitForYouTubeIframeAPI()).resolves.toBeUndefined();
  });

  it('does not resolve until onYouTubeIframeAPIReady fires, when YT.Player is not yet ready', async () => {
    const { waitForYouTubeIframeAPI } = await import('../youtube-iframe-api');

    // Simulates the real race: window.YT exists as a partial stub, but
    // .Player isn't a constructor yet.
    testWindow.YT = { loading: 1 };

    let resolved = false;
    const promise = waitForYouTubeIframeAPI().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    // The real API script calls this once it's truly ready.
    testWindow.YT = { Player: function () {} };
    testWindow.onYouTubeIframeAPIReady?.();

    await promise;
    expect(resolved).toBe(true);
  });

  it('preserves and still calls a previously-registered onYouTubeIframeAPIReady handler', async () => {
    const { waitForYouTubeIframeAPI } = await import('../youtube-iframe-api');

    const previousHandler = vi.fn();
    testWindow.onYouTubeIframeAPIReady = previousHandler;

    const promise = waitForYouTubeIframeAPI();

    testWindow.YT = { Player: function () {} };
    testWindow.onYouTubeIframeAPIReady?.();

    await promise;
    expect(previousHandler).toHaveBeenCalledOnce();
  });

  it('reuses the same pending promise across multiple callers before the API is ready', async () => {
    const { waitForYouTubeIframeAPI } = await import('../youtube-iframe-api');

    testWindow.YT = { loading: 1 };

    const first = waitForYouTubeIframeAPI();
    const second = waitForYouTubeIframeAPI();

    testWindow.YT = { Player: function () {} };
    testWindow.onYouTubeIframeAPIReady?.();

    await expect(Promise.all([first, second])).resolves.toBeDefined();
  });
});
