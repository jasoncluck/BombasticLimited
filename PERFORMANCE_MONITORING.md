# Performance Monitoring

This document describes the performance monitoring system added to detect and prevent performance issues in the Bombastic application.

## Features

### 1. Reactive Effects Monitoring
- Tracks execution time of Svelte reactive effects (`$effect` blocks)
- Identifies slow effects that could cause frame drops (>16ms)
- Provides detailed timing and metadata for debugging

### 2. FPS (Frames Per Second) Monitoring
- Real-time FPS tracking
- Frame drop detection
- Performance status (good/warning/poor)
- Automatic alerts for performance degradation

### 3. Service Worker Performance Metrics
- Batch processing timing
- Cache hit rate tracking
- Request success rate monitoring
- Concurrent request management

### 4. Intersection Observer Optimization
- Performance tracking for intersection callbacks
- Reduced polling frequency (5s instead of 2s for retries)
- Execution time monitoring

## How to Use

### Development Mode
In development mode, performance monitoring is automatically enabled:

1. **Performance Debug Panel**: Click the "Show Performance Debug" button in the bottom-right corner
2. **Browser Console**: Performance warnings are logged for slow operations
3. **Automatic FPS Monitoring**: Starts automatically and warns about frame drops

### Performance Debug Panel Tabs

#### Overview
- FPS performance summary
- Reactive effects statistics  
- Service worker metrics
- Intersection observer stats

#### Reactive Effects
- Detailed list of recent reactive effects
- Execution times and metadata
- Highlights slow effects (>16ms) in red

#### Service Worker
- Cache hit rates
- Batch processing metrics
- Request success rates
- Active request counts

#### FPS Monitor
- Real-time FPS metrics
- Min/max/average FPS
- Frame drop counts
- Performance status indicator

## Performance Optimizations Made

### 1. Efficient Array Comparisons
**Before:**
```javascript
if (JSON.stringify(newSectionIds) !== JSON.stringify(sectionIds)) {
  // Update logic
}
```

**After:**
```javascript
if (!efficientArrayComparison(newSectionIds, sectionIds)) {
  // Update logic - much faster!
}
```

### 2. Optimized Polling Intervals
- **Intersection Observer**: Increased retry interval from 2s to 5s
- **Layout Sync**: Extended interval to 10 minutes when tab is hidden
- **Visibility-based**: Adjusts polling based on tab visibility

### 3. Service Worker Batching
- Added performance metrics to batch processing
- Monitors slow batches (>500ms)
- Tracks cache efficiency

### 4. Reactive Effect Tracking
- Wraps expensive reactive effects with performance monitoring
- Provides detailed execution timing
- Identifies performance bottlenecks

## Thresholds and Alerts

### Reactive Effects
- **Warning**: >16ms (1 frame at 60fps)
- **Error**: >33ms (2 frames at 60fps)

### FPS Monitoring
- **Good**: ≥55 FPS
- **Warning**: 45-54 FPS  
- **Poor**: <45 FPS

### Service Worker
- **Batch Warning**: >100ms
- **Batch Error**: >500ms

## Production Considerations

- Performance monitoring is **disabled by default in production**
- Only essential metrics are collected
- No performance debug UI in production
- Minimal overhead when disabled

## Files Added/Modified

### New Files
- `src/lib/utils/performance-monitor.ts` - Core performance monitoring utilities
- `src/lib/utils/fps-monitor.ts` - FPS tracking and frame drop detection
- `src/lib/components/debug/performance-debug.svelte` - Debug UI component

### Modified Files
- `src/routes/(app)/[source]/+page.svelte` - Optimized reactive effects
- `src/routes/(app)/+layout.svelte` - Added monitoring and optimized intervals
- `src/lib/components/intersection-observer.svelte` - Added performance tracking
- `src/service-worker.ts` - Added performance metrics and monitoring

## Best Practices

1. **Monitor Reactive Effects**: Use `performanceMonitor.trackReactiveEffect()` for expensive operations
2. **Efficient Comparisons**: Use `efficientArrayComparison()` instead of `JSON.stringify()` 
3. **Debounce Expensive Operations**: Use the provided debouncing utilities
4. **Check FPS Impact**: Monitor FPS during heavy operations
5. **Service Worker Metrics**: Review cache hit rates and batch performance

## Debugging Performance Issues

1. **Enable Debug Panel**: Click "Show Performance Debug" in development
2. **Monitor Reactive Effects Tab**: Look for effects >16ms execution time
3. **Check FPS Tab**: Ensure FPS stays above 45
4. **Review Service Worker Tab**: Check cache hit rates and batch timing
5. **Use Browser DevTools**: Performance tab for detailed analysis

## Future Enhancements

- [ ] Performance budget enforcement
- [ ] Automated performance regression testing
- [ ] Custom performance dashboards
- [ ] Memory usage tracking
- [ ] Network performance metrics