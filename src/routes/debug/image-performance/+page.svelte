<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import type { Video } from '$lib/supabase/videos';
  import {
    runImagePerformanceTest,
    runCacheWarmedTest,
    type PerformanceTestResult,
  } from '$lib/utils/image-performance-test';

  let testResults: PerformanceTestResult[] = $state([]);
  let isRunning = $state(false);
  let testVideos: Video[] = $state([]);
  let selectedTestSize = $state(5);
  let includeCache = $state(true);

  // Sample test videos with YouTube thumbnails
  const sampleVideos: Video[] = [
    {
      id: 'test-1',
      title: 'Sample Video 1',
      description: 'Test video for performance comparison 1',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      duration: 'PT3M32S',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-2',
      title: 'Sample Video 2',
      description: 'Test video for performance comparison 2',
      thumbnail_url: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/9bZkp7q19f0/maxresdefault.jpg',
      duration: 'PT3M',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-3',
      title: 'Sample Video 3',
      description: 'Test video for performance comparison 3',
      thumbnail_url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/jNQXAC9IVRw/maxresdefault.jpg',
      duration: 'PT3M45S',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-4',
      title: 'Sample Video 4',
      description: 'Test video for performance comparison 4',
      thumbnail_url: 'https://i.ytimg.com/vi/L_jWHffIx5E/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/L_jWHffIx5E/maxresdefault.jpg',
      duration: 'PT3M15S',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-5',
      title: 'Sample Video 5',
      description: 'Test video for performance comparison 5',
      thumbnail_url: 'https://i.ytimg.com/vi/fC7oUOUEEi4/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/fC7oUOUEEi4/maxresdefault.jpg',
      duration: 'PT4M',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-6',
      title: 'Sample Video 6',
      description: 'Test video for performance comparison 6',
      thumbnail_url: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/kJQP7kiw5Fk/maxresdefault.jpg',
      duration: 'PT3M24S',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-7',
      title: 'Sample Video 7',
      description: 'Test video for performance comparison 7',
      thumbnail_url: 'https://i.ytimg.com/vi/astISOttCQ0/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/astISOttCQ0/maxresdefault.jpg',
      duration: 'PT3M9S',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
    {
      id: 'test-8',
      title: 'Sample Video 8',
      description: 'Test video for performance comparison 8',
      thumbnail_url: 'https://i.ytimg.com/vi/ZZ5LpwO-An4/hqdefault.jpg',
      thumbnail_maxres_url:
        'https://i.ytimg.com/vi/ZZ5LpwO-An4/maxresdefault.jpg',
      duration: 'PT3M37S',
      published_at: '2024-01-01T00:00:00Z',
      source: 'nextlander',
    },
  ];

  onMount(() => {
    testVideos = sampleVideos;
  });

  async function runSingleTest() {
    if (isRunning) return;

    isRunning = true;
    try {
      const result = await runImagePerformanceTest(testVideos, {
        maxVideos: selectedTestSize,
        clearCacheFirst: !includeCache,
      });
      testResults = [result, ...testResults];
    } catch (error) {
      console.error('Test failed:', error);
      alert('Test failed: ' + error);
    } finally {
      isRunning = false;
    }
  }

  async function runCacheTest() {
    if (isRunning) return;

    isRunning = true;
    try {
      const results = await runCacheWarmedTest(testVideos, 3);
      testResults = [...results, ...testResults];
    } catch (error) {
      console.error('Cache test failed:', error);
      alert('Cache test failed: ' + error);
    } finally {
      isRunning = false;
    }
  }

  function clearResults() {
    testResults = [];
  }

  function formatTime(ms: number): string {
    return `${ms.toFixed(0)}ms`;
  }

  function getWinnerIcon(winner: string): string {
    switch (winner) {
      case 'vercel':
        return '🟦';
      case 'server':
        return '🟩';
      case 'tie':
        return '🟨';
      default:
        return '⚪';
    }
  }
</script>

<svelte:head>
  <title>Image Performance Test - Bombify</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
  <div class="mb-8">
    <h1 class="mb-4 text-3xl font-bold">🔬 Image Performance Test</h1>
    <p class="mb-6 text-gray-600">
      Compare loading performance between Vercel Image Optimization and
      SvelteKit server-side processing.
    </p>

    <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div class="rounded-lg border bg-white p-4">
        <label class="mb-2 block text-sm font-medium">Test Size</label>
        <select
          bind:value={selectedTestSize}
          class="w-full rounded border px-3 py-2"
        >
          <option value={3}>3 videos</option>
          <option value={5}>5 videos</option>
          <option value={8}>8 videos</option>
          <option value={10}>10 videos</option>
        </select>
      </div>

      <div class="rounded-lg border bg-white p-4">
        <label class="flex items-center">
          <input type="checkbox" bind:checked={includeCache} class="mr-2" />
          <span class="text-sm font-medium">Include Cache</span>
        </label>
        <p class="mt-1 text-xs text-gray-500">
          When unchecked, clears cache before testing
        </p>
      </div>

      <div class="flex flex-col rounded-lg border bg-white p-4">
        <span class="mb-2 text-sm font-medium">Test Videos</span>
        <span class="text-2xl font-bold text-blue-600">{testVideos.length}</span
        >
        <span class="text-xs text-gray-500">YouTube samples</span>
      </div>
    </div>

    <div class="mb-8 flex gap-4">
      <button
        onclick={runSingleTest}
        disabled={isRunning}
        class="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? '⏳ Running...' : '🚀 Run Single Test'}
      </button>

      <button
        onclick={runCacheTest}
        disabled={isRunning}
        class="rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? '⏳ Running...' : '🔥 Run Cache Test (3 rounds)'}
      </button>

      <button
        onclick={clearResults}
        disabled={isRunning}
        class="rounded-lg bg-gray-600 px-6 py-2 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🗑️ Clear Results
      </button>
    </div>
  </div>

  <!-- Test Results -->
  {#if testResults.length > 0}
    <div class="space-y-6">
      <h2 class="text-2xl font-bold">📊 Test Results</h2>

      {#each testResults as result, index}
        <div class="rounded-lg border bg-white p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold">
              Test #{testResults.length - index}
              <span class="text-sm text-gray-500">({result.testId})</span>
            </h3>
            <span class="text-sm text-gray-500">
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <!-- Summary Stats -->
          <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="rounded bg-gray-50 p-4 text-center">
              <div class="mb-1 text-2xl">
                {getWinnerIcon(result.summary.winner)}
              </div>
              <div class="font-semibold">
                {result.summary.winner === 'tie'
                  ? 'TIE'
                  : result.summary.winner === 'vercel'
                    ? 'VERCEL WINS'
                    : 'SERVER WINS'}
              </div>
              {#if result.summary.winner !== 'tie'}
                <div class="text-sm text-gray-600">
                  {result.summary.differencePercent.toFixed(1)}% faster
                </div>
              {/if}
            </div>

            <div class="rounded bg-blue-50 p-4 text-center">
              <div class="text-2xl font-bold text-blue-600">
                {formatTime(result.summary.vercelAverage)}
              </div>
              <div class="font-semibold">Vercel Average</div>
              <div class="text-sm text-gray-600">
                {result.vercelMetrics.filter((m) => !m.error).length} successful
              </div>
            </div>

            <div class="rounded bg-green-50 p-4 text-center">
              <div class="text-2xl font-bold text-green-600">
                {formatTime(result.summary.serverAverage)}
              </div>
              <div class="font-semibold">Server Average</div>
              <div class="text-sm text-gray-600">
                {result.serverMetrics.filter((m) => !m.error).length} successful
              </div>
            </div>
          </div>

          <!-- Detailed Results Table -->
          <details class="mt-4">
            <summary
              class="cursor-pointer font-medium text-gray-700 hover:text-gray-900"
            >
              📋 Detailed Results ({result.videos.length} videos tested)
            </summary>

            <div class="mt-4 overflow-x-auto">
              <table class="w-full border-collapse text-sm">
                <thead>
                  <tr class="bg-gray-50">
                    <th class="border p-2 text-left">Video</th>
                    <th class="border p-2">Vercel</th>
                    <th class="border p-2">Server</th>
                    <th class="border p-2">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {#each result.videos as video, i}
                    {@const vercelMetric =
                      result.vercelMetrics.find((m) =>
                        m.url.includes(video.id)
                      ) || result.vercelMetrics[i]}
                    {@const serverMetric =
                      result.serverMetrics.find((m) =>
                        m.url.includes(video.id)
                      ) || result.serverMetrics[i]}
                    <tr>
                      <td class="border p-2 font-medium">{video.title}</td>
                      <td class="border p-2 text-center">
                        {#if vercelMetric && !vercelMetric.error}
                          <span class="text-blue-600"
                            >{formatTime(vercelMetric.loadTimeMs)}</span
                          >
                        {:else if vercelMetric?.error}
                          <span class="text-xs text-red-500"
                            >❌ {vercelMetric.error}</span
                          >
                        {:else}
                          <span class="text-gray-400">N/A</span>
                        {/if}
                      </td>
                      <td class="border p-2 text-center">
                        {#if serverMetric && !serverMetric.error}
                          <span class="text-green-600"
                            >{formatTime(serverMetric.loadTimeMs)}</span
                          >
                        {:else if serverMetric?.error}
                          <span class="text-xs text-red-500"
                            >❌ {serverMetric.error}</span
                          >
                        {:else}
                          <span class="text-gray-400">N/A</span>
                        {/if}
                      </td>
                      <td class="border p-2 text-center">
                        {#if vercelMetric && serverMetric && !vercelMetric.error && !serverMetric.error}
                          {@const diff =
                            vercelMetric.loadTimeMs - serverMetric.loadTimeMs}
                          {@const faster = diff < 0 ? 'vercel' : 'server'}
                          <span
                            class="text-xs"
                            class:text-blue-600={faster === 'vercel'}
                            class:text-green-600={faster === 'server'}
                          >
                            {faster === 'vercel' ? '🟦' : '🟩'}
                            {Math.abs(diff).toFixed(0)}ms
                          </span>
                        {:else}
                          <span class="text-gray-400">-</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      {/each}
    </div>
  {:else}
    <div class="py-12 text-center text-gray-500">
      <div class="mb-4 text-4xl">📊</div>
      <p>No test results yet. Run a test to see performance comparisons.</p>
    </div>
  {/if}
</div>
