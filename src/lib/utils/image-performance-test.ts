/**
 * Performance measurement utility for comparing image loading approaches
 * Compares Vercel Image Optimization vs SvelteKit server processing
 */

import type { Video } from '$lib/supabase/videos';
import {
  getBestThumbnailUrl,
  isOptimizableVideoThumbnail,
} from './vercel-video-images';

export interface ImageLoadingMetrics {
  approach: 'vercel' | 'server';
  url: string;
  loadTimeMs: number;
  imageSize?: {
    naturalWidth: number;
    naturalHeight: number;
    fileSize?: number;
  };
  networkTiming?: {
    dnsLookup?: number;
    connect?: number;
    responseStart?: number;
    responseEnd?: number;
  };
  error?: string;
}

export interface PerformanceTestResult {
  testId: string;
  timestamp: number;
  videos: Video[];
  vercelMetrics: ImageLoadingMetrics[];
  serverMetrics: ImageLoadingMetrics[];
  summary: {
    vercelAverage: number;
    serverAverage: number;
    vercelMedian: number;
    serverMedian: number;
    vercelTotal: number;
    serverTotal: number;
    winner: 'vercel' | 'server' | 'tie';
    difference: number;
    differencePercent: number;
  };
}

/**
 * Measure image loading time for a single URL
 */
async function measureImageLoadTime(
  url: string,
  approach: 'vercel' | 'server'
): Promise<ImageLoadingMetrics> {
  const startTime = performance.now();

  return new Promise((resolve) => {
    const img = new Image();
    let resolved = false;

    const resolveMetrics = (error?: string) => {
      if (resolved) return;
      resolved = true;

      const endTime = performance.now();
      const loadTimeMs = endTime - startTime;

      const metrics: ImageLoadingMetrics = {
        approach,
        url,
        loadTimeMs,
        error,
      };

      if (!error && img.complete) {
        metrics.imageSize = {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        };
      }

      resolve(metrics);
    };

    img.onload = () => resolveMetrics();
    img.onerror = () => resolveMetrics('Image failed to load');

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!resolved) {
        resolveMetrics('Timeout after 15 seconds');
      }
    }, 15000);

    img.src = url;
  });
}

/**
 * Generate both Vercel and server URLs for a video
 */
function generateComparisonUrls(video: Video): {
  vercel: string | null;
  server: string | null;
} {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return { vercel: null, server: null };
  }

  const serverUrl = `/api/video-thumbnail?type=image&url=${encodeURIComponent(thumbnailUrl)}`;

  // Only generate Vercel URL for optimizable thumbnails
  let vercelUrl: string | null = null;
  if (isOptimizableVideoThumbnail(thumbnailUrl)) {
    const params = new URLSearchParams({
      url: thumbnailUrl,
      w: '480',
      h: '360',
      q: '90',
    });
    vercelUrl = `/_vercel/image?${params.toString()}`;
  }

  return { vercel: vercelUrl, server: serverUrl };
}

/**
 * Run performance comparison test for multiple videos
 */
export async function runImagePerformanceTest(
  videos: Video[],
  options: {
    maxVideos?: number;
    includeCache?: boolean;
    clearCacheFirst?: boolean;
  } = {}
): Promise<PerformanceTestResult> {
  const { maxVideos = 10, clearCacheFirst = false } = options;
  const testVideos = videos.slice(0, maxVideos);

  const testId = `perf-test-${Date.now()}`;
  console.log(
    `🔬 Starting image performance test ${testId} with ${testVideos.length} videos`
  );

  // Clear browser cache if requested
  if (clearCacheFirst && 'caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      console.log('✅ Browser caches cleared');
    } catch (error) {
      console.warn('⚠️ Failed to clear caches:', error);
    }
  }

  const vercelMetrics: ImageLoadingMetrics[] = [];
  const serverMetrics: ImageLoadingMetrics[] = [];

  // Test each video
  for (let i = 0; i < testVideos.length; i++) {
    const video = testVideos[i];
    const urls = generateComparisonUrls(video);

    console.log(
      `📊 Testing video ${i + 1}/${testVideos.length}: ${video.title}`
    );

    // Test server approach
    if (urls.server) {
      try {
        const serverMetric = await measureImageLoadTime(urls.server, 'server');
        serverMetrics.push(serverMetric);
        console.log(`  📈 Server: ${serverMetric.loadTimeMs.toFixed(0)}ms`);
      } catch (error) {
        console.error(`  ❌ Server failed:`, error);
        serverMetrics.push({
          approach: 'server',
          url: urls.server,
          loadTimeMs: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Test Vercel approach (only for YouTube videos)
    if (urls.vercel) {
      try {
        const vercelMetric = await measureImageLoadTime(urls.vercel, 'vercel');
        vercelMetrics.push(vercelMetric);
        console.log(`  📈 Vercel: ${vercelMetric.loadTimeMs.toFixed(0)}ms`);
      } catch (error) {
        console.error(`  ❌ Vercel failed:`, error);
        vercelMetrics.push({
          approach: 'vercel',
          url: urls.vercel,
          loadTimeMs: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.log(`  ⏭️ Skipping Vercel (non-YouTube thumbnail)`);
    }

    // Add small delay between tests to avoid overwhelming the server
    if (i < testVideos.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Calculate summary statistics
  const vercelTimes = vercelMetrics
    .filter((m) => !m.error)
    .map((m) => m.loadTimeMs);
  const serverTimes = serverMetrics
    .filter((m) => !m.error)
    .map((m) => m.loadTimeMs);

  const vercelAverage =
    vercelTimes.length > 0
      ? vercelTimes.reduce((a, b) => a + b, 0) / vercelTimes.length
      : 0;
  const serverAverage =
    serverTimes.length > 0
      ? serverTimes.reduce((a, b) => a + b, 0) / serverTimes.length
      : 0;

  const vercelMedian =
    vercelTimes.length > 0
      ? vercelTimes.sort((a, b) => a - b)[Math.floor(vercelTimes.length / 2)]
      : 0;
  const serverMedian =
    serverTimes.length > 0
      ? serverTimes.sort((a, b) => a - b)[Math.floor(serverTimes.length / 2)]
      : 0;

  const vercelTotal = vercelTimes.reduce((a, b) => a + b, 0);
  const serverTotal = serverTimes.reduce((a, b) => a + b, 0);

  let winner: 'vercel' | 'server' | 'tie' = 'tie';
  const difference = Math.abs(vercelAverage - serverAverage);
  const differencePercent =
    serverAverage > 0 ? (difference / serverAverage) * 100 : 0;

  if (vercelAverage > 0 && serverAverage > 0) {
    if (vercelAverage < serverAverage * 0.95) {
      // At least 5% faster to be considered winner
      winner = 'vercel';
    } else if (serverAverage < vercelAverage * 0.95) {
      winner = 'server';
    }
  } else if (vercelAverage > 0) {
    winner = 'vercel';
  } else if (serverAverage > 0) {
    winner = 'server';
  }

  const result: PerformanceTestResult = {
    testId,
    timestamp: Date.now(),
    videos: testVideos,
    vercelMetrics,
    serverMetrics,
    summary: {
      vercelAverage,
      serverAverage,
      vercelMedian,
      serverMedian,
      vercelTotal,
      serverTotal,
      winner,
      difference,
      differencePercent,
    },
  };

  // Log results
  console.log(`\n📊 Performance Test Results (${testId})`);
  console.log(`┌─────────────────────────────┬─────────────┬─────────────┐`);
  console.log(`│ Metric                      │ Vercel      │ Server      │`);
  console.log(`├─────────────────────────────┼─────────────┼─────────────┤`);
  console.log(
    `│ Average Load Time           │ ${vercelAverage.toFixed(0).padStart(8)}ms │ ${serverAverage.toFixed(0).padStart(8)}ms │`
  );
  console.log(
    `│ Median Load Time            │ ${vercelMedian.toFixed(0).padStart(8)}ms │ ${serverMedian.toFixed(0).padStart(8)}ms │`
  );
  console.log(
    `│ Total Time                  │ ${vercelTotal.toFixed(0).padStart(8)}ms │ ${serverTotal.toFixed(0).padStart(8)}ms │`
  );
  console.log(
    `│ Successful Images           │ ${vercelTimes.length.toString().padStart(8)}    │ ${serverTimes.length.toString().padStart(8)}    │`
  );
  console.log(
    `│ Failed Images               │ ${(vercelMetrics.length - vercelTimes.length).toString().padStart(8)}    │ ${(serverMetrics.length - serverTimes.length).toString().padStart(8)}    │`
  );
  console.log(`└─────────────────────────────┴─────────────┴─────────────┘`);
  console.log(
    `\n🏆 Winner: ${winner === 'tie' ? 'TIE' : winner.toUpperCase()}`
  );
  if (winner !== 'tie') {
    console.log(
      `💡 ${winner === 'vercel' ? 'Vercel' : 'Server'} is ${differencePercent.toFixed(1)}% faster on average`
    );
  }

  return result;
}

/**
 * Run a simple A/B test with cache warming
 */
export async function runCacheWarmedTest(
  videos: Video[],
  rounds = 3
): Promise<PerformanceTestResult[]> {
  const results: PerformanceTestResult[] = [];

  console.log(`🔥 Running cache-warmed test with ${rounds} rounds`);

  for (let round = 0; round < rounds; round++) {
    console.log(`\n🔄 Round ${round + 1}/${rounds}`);

    const clearCache = round === 0; // Only clear cache on first round
    const result = await runImagePerformanceTest(videos, {
      maxVideos: 5,
      clearCacheFirst: clearCache,
    });

    results.push(result);

    // Wait between rounds
    if (round < rounds - 1) {
      console.log('⏳ Waiting 2 seconds before next round...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}

/**
 * Create a simple test component (for debugging in dev tools)
 */
export function createPerformanceTestButton(
  videos: Video[]
): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = '🔬 Run Image Performance Test';
  button.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 10000;
    padding: 8px 12px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
  `;

  button.onclick = async () => {
    button.textContent = '⏳ Running test...';
    button.disabled = true;

    try {
      await runImagePerformanceTest(videos.slice(0, 10));
    } finally {
      button.textContent = '🔬 Run Image Performance Test';
      button.disabled = false;
    }
  };

  return button;
}
