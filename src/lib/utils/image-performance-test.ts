/**
 * Performance measurement utility for server-side image processing
 * Measures loading performance and optimization effectiveness
 */

import type { Video } from '$lib/supabase/videos';
import { getBestThumbnailUrl } from './video-thumbnails';

export interface ImageLoadingMetrics {
  approach: 'server' | 'direct';
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
  serverMetrics: ImageLoadingMetrics[];
  directMetrics: ImageLoadingMetrics[];
  summary: {
    serverAverage: number;
    directAverage: number;
    serverMedian: number;
    directMedian: number;
    serverTotal: number;
    directTotal: number;
    winner: 'server' | 'direct' | 'tie';
    difference: number;
    differencePercent: number;
  };
}

/**
 * Measure image loading time for a single URL
 */
async function measureImageLoadTime(
  url: string,
  approach: 'server' | 'direct'
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
 * Generate both server-processed and direct URLs for a video
 */
function generateComparisonUrls(video: Video): {
  server: string | null;
  direct: string | null;
} {
  const thumbnailUrl = getBestThumbnailUrl(video);
  if (!thumbnailUrl) {
    return { server: null, direct: null };
  }

  const serverUrl = `/api/video-thumbnail?type=image&url=${encodeURIComponent(thumbnailUrl)}`;

  return { server: serverUrl, direct: thumbnailUrl };
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

  const serverMetrics: ImageLoadingMetrics[] = [];
  const directMetrics: ImageLoadingMetrics[] = [];

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

    // Test direct approach 
    if (urls.direct) {
      try {
        const directMetric = await measureImageLoadTime(urls.direct, 'direct');
        directMetrics.push(directMetric);
        console.log(`  📈 Direct: ${directMetric.loadTimeMs.toFixed(0)}ms`);
      } catch (error) {
        console.error(`  ❌ Direct failed:`, error);
        directMetrics.push({
          approach: 'direct',
          url: urls.direct,
          loadTimeMs: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Add small delay between tests to avoid overwhelming the server
    if (i < testVideos.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Calculate summary statistics
  const serverTimes = serverMetrics
    .filter((m) => !m.error)
    .map((m) => m.loadTimeMs);
  const directTimes = directMetrics
    .filter((m) => !m.error)
    .map((m) => m.loadTimeMs);

  const serverAverage =
    serverTimes.length > 0
      ? serverTimes.reduce((a, b) => a + b, 0) / serverTimes.length
      : 0;
  const directAverage =
    directTimes.length > 0
      ? directTimes.reduce((a, b) => a + b, 0) / directTimes.length
      : 0;

  const serverMedian =
    serverTimes.length > 0
      ? serverTimes.sort((a, b) => a - b)[Math.floor(serverTimes.length / 2)]
      : 0;
  const directMedian =
    directTimes.length > 0
      ? directTimes.sort((a, b) => a - b)[Math.floor(directTimes.length / 2)]
      : 0;

  const serverTotal = serverTimes.reduce((a, b) => a + b, 0);
  const directTotal = directTimes.reduce((a, b) => a + b, 0);

  let winner: 'server' | 'direct' | 'tie' = 'tie';
  const difference = Math.abs(serverAverage - directAverage);
  const differencePercent =
    directAverage > 0 ? (difference / directAverage) * 100 : 0;

  if (serverAverage > 0 && directAverage > 0) {
    if (serverAverage < directAverage * 0.95) {
      // At least 5% faster to be considered winner
      winner = 'server';
    } else if (directAverage < serverAverage * 0.95) {
      winner = 'direct';
    }
  } else if (serverAverage > 0) {
    winner = 'server';
  } else if (directAverage > 0) {
    winner = 'direct';
  }

  const result: PerformanceTestResult = {
    testId,
    timestamp: Date.now(),
    videos: testVideos,
    serverMetrics,
    directMetrics,
    summary: {
      serverAverage,
      directAverage,
      serverMedian,
      directMedian,
      serverTotal,
      directTotal,
      winner,
      difference,
      differencePercent,
    },
  };

  // Log results
  console.log(`\n📊 Performance Test Results (${testId})`);
  console.log(`┌─────────────────────────────┬─────────────┬─────────────┐`);
  console.log(`│ Metric                      │ Server      │ Direct      │`);
  console.log(`├─────────────────────────────┼─────────────┼─────────────┤`);
  console.log(
    `│ Average Load Time           │ ${serverAverage.toFixed(0).padStart(8)}ms │ ${directAverage.toFixed(0).padStart(8)}ms │`
  );
  console.log(
    `│ Median Load Time            │ ${serverMedian.toFixed(0).padStart(8)}ms │ ${directMedian.toFixed(0).padStart(8)}ms │`
  );
  console.log(
    `│ Total Time                  │ ${serverTotal.toFixed(0).padStart(8)}ms │ ${directTotal.toFixed(0).padStart(8)}ms │`
  );
  console.log(
    `│ Successful Images           │ ${serverTimes.length.toString().padStart(8)}    │ ${directTimes.length.toString().padStart(8)}    │`
  );
  console.log(
    `│ Failed Images               │ ${(serverMetrics.length - serverTimes.length).toString().padStart(8)}    │ ${(directMetrics.length - directTimes.length).toString().padStart(8)}    │`
  );
  console.log(`└─────────────────────────────┴─────────────┴─────────────┘`);
  console.log(
    `\n🏆 Winner: ${winner === 'tie' ? 'TIE' : winner.toUpperCase()}`
  );
  if (winner !== 'tie') {
    console.log(
      `💡 ${winner === 'server' ? 'Server' : 'Direct'} is ${differencePercent.toFixed(1)}% faster on average`
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
