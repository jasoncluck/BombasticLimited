<script lang="ts">
  import { dev } from '$app/environment';
  import { performanceMonitor } from '$lib/utils/performance-monitor.js';
  import { useFPSMonitor } from '$lib/utils/fps-monitor.js';
  import { onMount } from 'svelte';

  let isVisible = $state(false);
  let selectedTab = $state<'overview' | 'reactive-effects' | 'service-worker' | 'fps'>('overview');
  let autoRefresh = $state(true);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // FPS monitoring
  const fpsMonitor = useFPSMonitor();
  let fpsMetrics = $state<any>(null);
  
  // Performance data
  let performanceSummary = $state(performanceMonitor.getSummary());
  let recentMetrics = $state(performanceMonitor.getMetrics());

  // Service worker metrics (if available)
  let serviceWorkerMetrics = $state<any>(null);

  onMount(() => {
    // Only show in development
    if (!dev) return;
    
    // Start FPS monitoring
    fpsMonitor.start();
    
    // Subscribe to FPS updates
    const fpsUnsubscribe = performanceMonitor.subscribe((metric) => {
      if (metric.name === 'fps-measurement') {
        fpsMetrics = fpsMonitor.metrics;
      }
    });
    
    // Setup auto-refresh
    if (autoRefresh) {
      startAutoRefresh();
    }

    // Try to get service worker metrics
    getServiceWorkerMetrics();

    return () => {
      fpsMonitor.stop();
      fpsUnsubscribe();
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  });

  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      if (isVisible) {
        refreshData();
      }
    }, 1000);
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function refreshData() {
    performanceSummary = performanceMonitor.getSummary();
    recentMetrics = performanceMonitor.getMetrics(undefined, Date.now() - 30000); // Last 30 seconds
    fpsMetrics = fpsMonitor.metrics;
    getServiceWorkerMetrics();
  }

  function getServiceWorkerMetrics() {
    // Try to communicate with service worker for metrics
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'GET_METRICS' });
    }
  }

  function clearMetrics() {
    performanceMonitor.clear();
    refreshData();
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }

  // Listen for service worker messages
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'METRICS_RESPONSE') {
        serviceWorkerMetrics = event.data.metrics;
      }
    });
  }
</script>

{#if dev}
  <!-- Performance Debug Toggle Button -->
  <div class="fixed bottom-4 right-4 z-50">
    <button
      class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors text-sm font-medium"
      onclick={() => isVisible = !isVisible}
    >
      {isVisible ? 'Hide' : 'Show'} Performance Debug
    </button>
  </div>

  <!-- Performance Debug Panel -->
  {#if isVisible}
    <div class="fixed inset-0 z-40 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 class="text-lg font-semibold text-gray-900">Performance Monitor</h2>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                bind:checked={autoRefresh}
                onchange={toggleAutoRefresh}
                class="rounded"
              />
              Auto-refresh
            </label>
            <button
              onclick={refreshData}
              class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Refresh
            </button>
            <button
              onclick={clearMetrics}
              class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Clear
            </button>
            <button
              onclick={() => isVisible = false}
              class="text-gray-500 hover:text-gray-700"
              aria-label="Close performance debug panel"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="border-b border-gray-200">
          <nav class="flex space-x-8 px-4">
            {#each [
              { id: 'overview' as const, label: 'Overview' },
              { id: 'reactive-effects' as const, label: 'Reactive Effects' },
              { id: 'service-worker' as const, label: 'Service Worker' },
              { id: 'fps' as const, label: 'FPS Monitor' }
            ] as tab}
              <button
                class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {
                  selectedTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }"
                onclick={() => selectedTab = tab.id}
              >
                {tab.label}
              </button>
            {/each}
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-auto p-4">
          {#if selectedTab === 'overview'}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- FPS Status -->
              <div class="bg-gray-50 rounded-lg p-4">
                <h3 class="font-medium text-gray-900 mb-2">FPS Performance</h3>
                {#if fpsMetrics}
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span>Current FPS:</span>
                      <span class={getStatusColor(fpsMonitor.getStatus())}>
                        {fpsMetrics.currentFPS.toFixed(1)}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span>Average FPS:</span>
                      <span class={getStatusColor(fpsMonitor.getStatus())}>
                        {fpsMetrics.averageFPS.toFixed(1)}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span>Frame Drops:</span>
                      <span class={fpsMetrics.frameDrops > 0 ? 'text-red-600' : 'text-green-600'}>
                        {fpsMetrics.frameDrops}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span>Status:</span>
                      <span class={getStatusColor(fpsMonitor.getStatus())}>
                        {fpsMonitor.getStatus()}
                      </span>
                    </div>
                  </div>
                {:else}
                  <p class="text-gray-500 text-sm">FPS monitoring starting...</p>
                {/if}
              </div>

              <!-- Reactive Effects Summary -->
              <div class="bg-gray-50 rounded-lg p-4">
                <h3 class="font-medium text-gray-900 mb-2">Reactive Effects</h3>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span>Total Effects:</span>
                    <span>{performanceSummary.reactiveEffects.total}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Avg Duration:</span>
                    <span>{formatDuration(performanceSummary.reactiveEffects.avgDuration)}</span>
                  </div>
                  {#if performanceSummary.reactiveEffects.slowest}
                    <div class="flex justify-between">
                      <span>Slowest:</span>
                      <span class={performanceSummary.reactiveEffects.slowest.duration > 16 ? 'text-red-600' : 'text-green-600'}>
                        {formatDuration(performanceSummary.reactiveEffects.slowest.duration)}
                      </span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

          {:else if selectedTab === 'reactive-effects'}
            <div class="space-y-4">
              <h3 class="font-medium text-gray-900">Recent Reactive Effects (Last 30s)</h3>
              <div class="overflow-x-auto">
                <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    {#each recentMetrics.filter(m => m.type === 'reactive-effect') as metric}
                      <tr class={metric.duration > 16 ? 'bg-red-50' : ''}>
                        <td class="px-4 py-2 text-sm text-gray-900">{metric.name}</td>
                        <td class="px-4 py-2 text-sm {metric.duration > 16 ? 'text-red-600 font-medium' : 'text-gray-900'}">
                          {formatDuration(metric.duration)}
                        </td>
                        <td class="px-4 py-2 text-sm text-gray-500">
                          {new Date(metric.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>

          {:else if selectedTab === 'fps'}
            <div class="space-y-4">
              <h3 class="font-medium text-gray-900">FPS Monitor Details</h3>
              {#if fpsMetrics}
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div class="bg-gray-50 rounded-lg p-4">
                    <h4 class="font-medium text-gray-900 mb-3">Current Metrics</h4>
                    <div class="space-y-2 text-sm">
                      <div class="flex justify-between">
                        <span>Current FPS:</span>
                        <span class="font-mono">{fpsMetrics.currentFPS.toFixed(2)}</span>
                      </div>
                      <div class="flex justify-between">
                        <span>Average FPS:</span>
                        <span class="font-mono">{fpsMetrics.averageFPS.toFixed(2)}</span>
                      </div>
                      <div class="flex justify-between">
                        <span>Min FPS:</span>
                        <span class="font-mono">{fpsMetrics.minFPS.toFixed(2)}</span>
                      </div>
                      <div class="flex justify-between">
                        <span>Max FPS:</span>
                        <span class="font-mono">{fpsMetrics.maxFPS.toFixed(2)}</span>
                      </div>
                      <div class="flex justify-between">
                        <span>Frame Drops:</span>
                        <span class="font-mono">{fpsMetrics.frameDrops}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="bg-gray-50 rounded-lg p-4">
                    <h4 class="font-medium text-gray-900 mb-3">Performance Status</h4>
                    <div class="text-center">
                      <div class={`text-3xl font-bold ${getStatusColor(fpsMonitor.getStatus())}`}>
                        {fpsMonitor.getStatus().toUpperCase()}
                      </div>
                      <div class="text-sm text-gray-600 mt-2">
                        {fpsMonitor.isPerformingWell() ? 'Good performance' : 'Performance issues detected'}
                      </div>
                    </div>
                  </div>
                </div>
              {:else}
                <p class="text-gray-500">FPS monitoring not active</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{/if}