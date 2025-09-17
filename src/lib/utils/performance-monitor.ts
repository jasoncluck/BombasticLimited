/**
 * Performance monitoring utilities for tracking reactive effects,
 * service worker performance, and overall application metrics
 */

import { dev } from '$app/environment';

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  type: 'reactive-effect' | 'service-worker' | 'intersection-observer' | 'general';
  metadata?: Record<string, unknown>;
}

export interface PerformanceThresholds {
  reactiveEffectWarning: number; // ms
  reactiveEffectError: number; // ms
  fpsWarning: number; // fps
  fpsError: number; // fps
  serviceWorkerBatchWarning: number; // ms
  serviceWorkerBatchError: number; // ms
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 1000;
  private observers: ((metric: PerformanceMetric) => void)[] = [];
  
  private readonly thresholds: PerformanceThresholds = {
    reactiveEffectWarning: 16, // > 1 frame at 60fps
    reactiveEffectError: 33, // > 2 frames at 60fps
    fpsWarning: 45, // Below 45 fps
    fpsError: 30, // Below 30 fps
    serviceWorkerBatchWarning: 100, // 100ms batch processing
    serviceWorkerBatchError: 500, // 500ms batch processing
  };

  constructor() {
    // Only enable detailed monitoring in development
    if (dev) {
      this.setupPerformanceObserver();
    }
  }

  /**
   * Track the execution time of a reactive effect
   */
  trackReactiveEffect<T>(name: string, fn: () => T, metadata?: Record<string, unknown>): T {
    if (!dev) return fn();

    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name: `reactive-effect:${name}`,
        duration,
        timestamp: Date.now(),
        type: 'reactive-effect',
        metadata,
      });

      // Warn about slow reactive effects
      if (duration > this.thresholds.reactiveEffectWarning) {
        const level = duration > this.thresholds.reactiveEffectError ? 'error' : 'warn';
        console[level](`Slow reactive effect "${name}": ${duration.toFixed(2)}ms`, { metadata });
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric({
        name: `reactive-effect:${name}:error`,
        duration,
        timestamp: Date.now(),
        type: 'reactive-effect',
        metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Track async operations like service worker batches
   */
  async trackAsyncOperation<T>(
    name: string,
    fn: () => Promise<T>,
    type: PerformanceMetric['type'] = 'general',
    metadata?: Record<string, unknown>
  ): Promise<T> {
    if (!dev) return fn();

    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        type,
        metadata,
      });

      // Check service worker thresholds
      if (type === 'service-worker') {
        if (duration > this.thresholds.serviceWorkerBatchWarning) {
          const level = duration > this.thresholds.serviceWorkerBatchError ? 'error' : 'warn';
          console[level](`Slow service worker operation "${name}": ${duration.toFixed(2)}ms`, { metadata });
        }
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric({
        name: `${name}:error`,
        duration,
        timestamp: Date.now(),
        type,
        metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: PerformanceMetric) {
    if (!dev) return;

    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Notify observers
    this.observers.forEach(observer => observer(metric));
  }

  /**
   * Subscribe to performance metrics
   */
  subscribe(observer: (metric: PerformanceMetric) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  /**
   * Get performance metrics for analysis
   */
  getMetrics(type?: PerformanceMetric['type'], since?: number): PerformanceMetric[] {
    let filtered = this.metrics;
    
    if (type) {
      filtered = filtered.filter(m => m.type === type);
    }
    
    if (since) {
      filtered = filtered.filter(m => m.timestamp >= since);
    }
    
    return filtered;
  }

  /**
   * Get performance summary
   */
  getSummary(since: number = Date.now() - 60000): {
    reactiveEffects: { total: number; avgDuration: number; slowest: PerformanceMetric | null };
    serviceWorker: { total: number; avgDuration: number; slowest: PerformanceMetric | null };
    intersectionObserver: { total: number; avgDuration: number; slowest: PerformanceMetric | null };
  } {
    const recentMetrics = this.getMetrics(undefined, since);
    
    const getTypeStats = (type: PerformanceMetric['type']) => {
      const typeMetrics = recentMetrics.filter(m => m.type === type);
      return {
        total: typeMetrics.length,
        avgDuration: typeMetrics.length > 0 
          ? typeMetrics.reduce((sum, m) => sum + m.duration, 0) / typeMetrics.length 
          : 0,
        slowest: typeMetrics.length > 0 
          ? typeMetrics.reduce((max, m) => m.duration > max.duration ? m : max)
          : null,
      };
    };

    return {
      reactiveEffects: getTypeStats('reactive-effect'),
      serviceWorker: getTypeStats('service-worker'),
      intersectionObserver: getTypeStats('intersection-observer'),
    };
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
  }

  /**
   * Setup Performance Observer for additional browser metrics
   */
  private setupPerformanceObserver() {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      // Observe long tasks (> 50ms) that could cause frame drops
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            this.recordMetric({
              name: 'long-task',
              duration: entry.duration,
              timestamp: entry.startTime,
              type: 'general',
              metadata: {
                entryType: entry.entryType,
                startTime: entry.startTime,
              },
            });

            console.warn(`Long task detected: ${entry.duration.toFixed(2)}ms`, entry);
          }
        }
      });

      longTaskObserver.observe({ entryTypes: ['longtask'] });

      // Observe layout shifts
      const layoutShiftObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShiftEntry = entry as any; // Layout shift entries have a value property
          if (layoutShiftEntry.value > 0.1) { // Significant layout shift
            this.recordMetric({
              name: 'layout-shift',
              duration: layoutShiftEntry.value,
              timestamp: entry.startTime,
              type: 'general',
              metadata: {
                value: layoutShiftEntry.value,
                hadRecentInput: layoutShiftEntry.hadRecentInput,
              },
            });

            console.warn(`Layout shift detected: ${layoutShiftEntry.value.toFixed(4)}`, entry);
          }
        }
      });

      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });

    } catch (error) {
      console.warn('Performance Observer setup failed:', error);
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for tracking method performance
 */
export function trackPerformance(name?: string, type: PerformanceMetric['type'] = 'general') {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;

    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (this: any, ...args: any[]) {
      return performanceMonitor.trackReactiveEffect(
        methodName,
        () => originalMethod.apply(this, args),
        { args: args.length }
      );
    } as T;
  };
}

/**
 * Utility function to debounce expensive operations
 */
export function createPerformantComparison<T>(
  compareFn: (a: T, b: T) => boolean,
  debounceMs: number = 16
) {
  let lastValue: T;
  let lastComparison: { a: T; b: T } | null = null;
  let lastResult: boolean;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (a: T, b: T): boolean => {
    // For immediate calls with same values, return cached result
    if (lastComparison && lastComparison.a === a && lastComparison.b === b) {
      return lastResult;
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      lastComparison = { a, b };
      lastResult = compareFn(a, b);
      timeout = null;
    }, debounceMs);

    // Return immediate comparison for first call or changed values
    return compareFn(a, b);
  };
}

/**
 * Replace expensive JSON.stringify comparisons with efficient alternatives
 */
export function efficientArrayComparison<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) return false;
  
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  
  return true;
}

export function shallowEqual<T extends Record<string, any>>(obj1: T, obj2: T): boolean {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
}