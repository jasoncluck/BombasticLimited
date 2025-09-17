<script lang="ts">
  import { dev } from '$app/environment';
  import { performanceMonitor } from '$lib/utils/performance-monitor.js';
  import { fpsMonitor } from '$lib/utils/fps-monitor.js';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let selectedTab = $state<'overview' | 'reactive-effects' | 'fps' | 'service-worker'>('overview');
  let autoRefresh = $state(true);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Performance data
  let performanceSummary = $state(performanceMonitor.getSummary());
  let recentMetrics = $state(performanceMonitor.getMetrics());
  let fpsMetrics = $state<any>(null);

  // Service worker metrics (if available)
  let serviceWorkerMetrics = $state<any>(null);

  onMount(() => {
    // Start FPS monitoring in all environments for admin
    fpsMonitor.start();
    
    // Get initial metrics
    fpsMetrics = fpsMonitor.getCurrentMetrics();
    
    // Setup auto-refresh
    if (autoRefresh) {
      startAutoRefresh();
    }

    // Try to get service worker metrics
    getServiceWorkerMetrics();

    return () => {
      fpsMonitor.stop();
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  });

  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      refreshData();
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
    fpsMetrics = fpsMonitor.getCurrentMetrics();
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

  function getFPSStatus(): string {
    if (!fpsMetrics) return 'unknown';
    const avgFPS = fpsMetrics.averageFPS;
    if (avgFPS >= 55) return 'good';
    if (avgFPS >= 45) return 'warning';
    return 'poor';
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

<svelte:head>
  <title>Admin - Performance Monitor</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900">Performance Monitor</h1>
    <p class="text-gray-600 mt-2">Real-time performance monitoring and metrics for the Bombastic application</p>
  </div>

  <!-- Controls -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            bind:checked={autoRefresh}
            onchange={toggleAutoRefresh}
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Auto-refresh (1s)
        </label>
        <button
          onclick={refreshData}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          Refresh Now
        </button>
        <button
          onclick={clearMetrics}
          class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
        >
          Clear Metrics
        </button>
      </div>
      <div class="text-sm text-gray-500">
        Environment: {dev ? 'Development' : 'Production'}
      </div>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <div class="border-b border-gray-200">
      <nav class="flex space-x-8 px-6">
        {#each [
          { id: 'overview' as const, label: 'Overview', icon: '📊' },
          { id: 'reactive-effects' as const, label: 'Reactive Effects', icon: '⚡' },
          { id: 'fps' as const, label: 'FPS Monitor', icon: '🎯' },
          { id: 'service-worker' as const, label: 'Service Worker', icon: '⚙️' }
        ] as tab}
          <button
            class="py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 {
              selectedTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }"
            onclick={() => selectedTab = tab.id}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        {/each}
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="p-6">
      {#if selectedTab === 'overview'}
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <!-- FPS Status -->
          <div class="bg-gray-50 rounded-lg p-6">
            <h3 class="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              🎯 FPS Performance
            </h3>
            {#if fpsMetrics}
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Current FPS:</span>
                  <span class="font-mono text-lg {getStatusColor(getFPSStatus())}">
                    {fpsMetrics.currentFPS.toFixed(1)}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Average FPS:</span>
                  <span class="font-mono text-lg {getStatusColor(getFPSStatus())}">
                    {fpsMetrics.averageFPS.toFixed(1)}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Frame Drops:</span>
                  <span class="font-mono text-lg {fpsMetrics.frameDrops > 0 ? 'text-red-600' : 'text-green-600'}">
                    {fpsMetrics.frameDrops}
                  </span>
                </div>
                <div class="pt-2 border-t border-gray-200">
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-600">Status:</span>
                    <div class="px-3 py-1 rounded-full text-xs font-medium {
                      getFPSStatus() === 'good' ? 'bg-green-100 text-green-800' :
                      getFPSStatus() === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }">
                      {getFPSStatus().toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>
            {:else}
              <p class="text-gray-500 text-sm">FPS monitoring starting...</p>
            {/if}
          </div>

          <!-- Reactive Effects Summary -->
          <div class="bg-gray-50 rounded-lg p-6">
            <h3 class="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              ⚡ Reactive Effects
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Total Effects:</span>
                <span class="font-mono text-lg">{performanceSummary.reactiveEffects.total}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Avg Duration:</span>
                <span class="font-mono text-lg">{formatDuration(performanceSummary.reactiveEffects.avgDuration)}</span>
              </div>
              {#if performanceSummary.reactiveEffects.slowest}
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Slowest:</span>
                  <span class="font-mono text-lg {performanceSummary.reactiveEffects.slowest.duration > 16 ? 'text-red-600' : 'text-green-600'}">
                    {formatDuration(performanceSummary.reactiveEffects.slowest.duration)}
                  </span>
                </div>
              {/if}
              <div class="pt-2 border-t border-gray-200">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Slow Effects (>16ms):</span>
                  <span class="font-mono text-lg {recentMetrics.filter(m => m.type === 'reactive-effect' && m.duration > 16).length > 0 ? 'text-red-600' : 'text-green-600'}">
                    {recentMetrics.filter(m => m.type === 'reactive-effect' && m.duration > 16).length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Service Worker Summary -->
          <div class="bg-gray-50 rounded-lg p-6">
            <h3 class="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              ⚙️ Service Worker
            </h3>
            {#if serviceWorkerMetrics}
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Cache Hit Rate:</span>
                  <span class="font-mono text-lg text-green-600">{serviceWorkerMetrics.cacheHitRate}%</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Avg Batch Time:</span>
                  <span class="font-mono text-lg">{serviceWorkerMetrics.averageBatchTime}ms</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Active Requests:</span>
                  <span class="font-mono text-lg">{serviceWorkerMetrics.activeFetches}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600">Success Rate:</span>
                  <span class="font-mono text-lg text-green-600">{serviceWorkerMetrics.successRate}%</span>
                </div>
              </div>
            {:else}
              <p class="text-gray-500 text-sm">Service worker metrics not available</p>
            {/if}
          </div>
        </div>

        <!-- Performance Warnings -->
        {#if recentMetrics.some(m => m.duration > 16) || (fpsMetrics && fpsMetrics.frameDrops > 0)}
          <div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 class="font-semibold text-yellow-800 mb-4 flex items-center gap-2">
              ⚠️ Performance Warnings
            </h3>
            <div class="space-y-2">
              {#each recentMetrics.filter(m => m.duration > 16).slice(0, 5) as metric}
                <div class="text-sm text-yellow-700">
                  • Slow {metric.type}: {metric.name} ({formatDuration(metric.duration)})
                </div>
              {/each}
              {#if fpsMetrics && fpsMetrics.frameDrops > 0}
                <div class="text-sm text-yellow-700">
                  • Frame drops detected: {fpsMetrics.frameDrops} drops
                </div>
              {/if}
            </div>
          </div>
        {/if}

      {:else if selectedTab === 'reactive-effects'}
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Recent Reactive Effects (Last 30s)</h3>
            <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table class="min-w-full">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  {#each recentMetrics.filter(m => m.type === 'reactive-effect').slice(0, 20) as metric}
                    <tr class={metric.duration > 16 ? 'bg-red-50' : ''}>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {metric.name.replace('reactive-effect:', '')}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-mono {metric.duration > 16 ? 'text-red-600 font-semibold' : 'text-gray-900'}">
                        {formatDuration(metric.duration)}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(metric.timestamp).toLocaleTimeString()}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {
                          metric.duration > 33 ? 'bg-red-100 text-red-800' :
                          metric.duration > 16 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }">
                          {metric.duration > 33 ? 'Critical' : metric.duration > 16 ? 'Slow' : 'Good'}
                        </span>
                      </td>
                    </tr>
                  {:else}
                    <tr>
                      <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                        No reactive effects recorded in the last 30 seconds
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {:else if selectedTab === 'fps'}
        <div class="space-y-6">
          <h3 class="text-lg font-semibold text-gray-900">FPS Monitor Details</h3>
          
          {#if fpsMetrics}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div class="bg-gray-50 rounded-lg p-6">
                <h4 class="font-semibold text-gray-900 mb-4">Current Metrics</h4>
                <div class="space-y-4">
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Current FPS:</span>
                    <span class="font-mono text-xl">{fpsMetrics.currentFPS.toFixed(2)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Average FPS:</span>
                    <span class="font-mono text-xl">{fpsMetrics.averageFPS.toFixed(2)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Min FPS:</span>
                    <span class="font-mono text-xl">{fpsMetrics.minFPS.toFixed(2)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Max FPS:</span>
                    <span class="font-mono text-xl">{fpsMetrics.maxFPS.toFixed(2)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Frame Drops:</span>
                    <span class="font-mono text-xl">{fpsMetrics.frameDrops}</span>
                  </div>
                </div>
              </div>
              
              <div class="bg-gray-50 rounded-lg p-6">
                <h4 class="font-semibold text-gray-900 mb-4">Performance Status</h4>
                <div class="text-center">
                  <div class="text-6xl font-bold mb-4 {getStatusColor(getFPSStatus())}">
                    {getFPSStatus().toUpperCase()}
                  </div>
                  <div class="text-lg text-gray-600">
                    {getFPSStatus() === 'good' ? 'Excellent performance' : 
                     getFPSStatus() === 'warning' ? 'Some performance issues' : 
                     'Significant performance problems'}
                  </div>
                  <div class="mt-4 text-sm text-gray-500">
                    Target: 60 FPS | Good: ≥55 FPS | Warning: 45-54 FPS | Poor: <45 FPS
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-gray-500">FPS monitoring not active</p>
          {/if}
        </div>

      {:else if selectedTab === 'service-worker'}
        <div class="space-y-6">
          <h3 class="text-lg font-semibold text-gray-900">Service Worker Metrics</h3>
          
          {#if serviceWorkerMetrics}
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {#each Object.entries(serviceWorkerMetrics) as [key, value]}
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-600 mb-1 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2')}
                  </div>
                  <div class="text-2xl font-bold text-gray-900">{value}</div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p class="text-yellow-800">Service worker metrics not available. This may be normal if the service worker hasn't processed any requests yet.</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>