/**
 * FPS (Frames Per Second) monitoring utility to detect performance issues
 * and frame drops that could negatively impact user experience
 */

import { dev } from '$app/environment';
import { performanceMonitor } from './performance-monitor.js';

export interface FPSMetrics {
  currentFPS: number;
  averageFPS: number;
  minFPS: number;
  maxFPS: number;
  frameDrops: number;
  isPerformingWell: boolean;
  timestamp: number;
}

export interface FPSThresholds {
  goodFPS: number;
  warningFPS: number;
  poorFPS: number;
  frameDropThreshold: number; // Consecutive frames below threshold
}

class FPSMonitor {
  private isMonitoring = false;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsHistory: number[] = [];
  private readonly maxHistorySize = 60; // Keep 1 second of history at 60fps
  private frameDropCount = 0;
  private consecutiveLowFrames = 0;
  
  private observers: ((metrics: FPSMetrics) => void)[] = [];
  
  private readonly thresholds: FPSThresholds = {
    goodFPS: 55,
    warningFPS: 45,
    poorFPS: 30,
    frameDropThreshold: 5, // 5 consecutive frames below threshold
  };

  private readonly updateInterval = 1000; // Update metrics every second
  private lastMetricsUpdate = 0;

  constructor() {
    // Auto-start monitoring in development
    if (dev) {
      this.start();
    }
  }

  /**
   * Start FPS monitoring
   */
  start(): void {
    if (this.isMonitoring || typeof requestAnimationFrame === 'undefined') return;

    this.isMonitoring = true;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsHistory = [];
    this.frameDropCount = 0;
    this.consecutiveLowFrames = 0;
    this.lastMetricsUpdate = performance.now();

    this.measureFrame();
  }

  /**
   * Stop FPS monitoring
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Subscribe to FPS metrics updates
   */
  subscribe(observer: (metrics: FPSMetrics) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  /**
   * Get current FPS metrics
   */
  getCurrentMetrics(): FPSMetrics {
    const currentFPS = this.calculateCurrentFPS();
    const averageFPS = this.calculateAverageFPS();
    const minFPS = this.fpsHistory.length > 0 ? Math.min(...this.fpsHistory) : 0;
    const maxFPS = this.fpsHistory.length > 0 ? Math.max(...this.fpsHistory) : 0;

    return {
      currentFPS,
      averageFPS,
      minFPS,
      maxFPS,
      frameDrops: this.frameDropCount,
      isPerformingWell: averageFPS >= this.thresholds.goodFPS,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if FPS is currently in a good state
   */
  isPerformingWell(): boolean {
    return this.calculateAverageFPS() >= this.thresholds.goodFPS;
  }

  /**
   * Get performance status
   */
  getPerformanceStatus(): 'good' | 'warning' | 'poor' {
    const avgFPS = this.calculateAverageFPS();
    
    if (avgFPS >= this.thresholds.goodFPS) return 'good';
    if (avgFPS >= this.thresholds.warningFPS) return 'warning';
    return 'poor';
  }

  private measureFrame = (): void => {
    if (!this.isMonitoring) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    
    if (deltaTime > 0) {
      const currentFPS = 1000 / deltaTime;
      
      // Add to history
      this.fpsHistory.push(currentFPS);
      if (this.fpsHistory.length > this.maxHistorySize) {
        this.fpsHistory.shift();
      }

      // Track frame drops
      if (currentFPS < this.thresholds.warningFPS) {
        this.consecutiveLowFrames++;
        if (this.consecutiveLowFrames >= this.thresholds.frameDropThreshold) {
          this.frameDropCount++;
          this.consecutiveLowFrames = 0; // Reset counter after recording drop
          
          // Record performance metric for frame drop
          performanceMonitor.recordMetric({
            name: 'frame-drop',
            duration: deltaTime,
            timestamp: Date.now(),
            type: 'general',
            metadata: {
              fps: currentFPS,
              consecutiveFrames: this.thresholds.frameDropThreshold,
            },
          });

          if (dev) {
            console.warn(`Frame drop detected: ${currentFPS.toFixed(1)} FPS (${deltaTime.toFixed(1)}ms frame time)`);
          }
        }
      } else {
        this.consecutiveLowFrames = 0;
      }
    }

    this.lastFrameTime = currentTime;
    this.frameCount++;

    // Update metrics periodically
    if (currentTime - this.lastMetricsUpdate >= this.updateInterval) {
      this.updateMetrics();
      this.lastMetricsUpdate = currentTime;
    }

    this.animationFrameId = requestAnimationFrame(this.measureFrame);
  };

  private calculateCurrentFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    return this.fpsHistory[this.fpsHistory.length - 1];
  }

  private calculateAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    const sum = this.fpsHistory.reduce((acc, fps) => acc + fps, 0);
    return sum / this.fpsHistory.length;
  }

  private updateMetrics(): void {
    const metrics = this.getCurrentMetrics();
    
    // Record FPS metric
    performanceMonitor.recordMetric({
      name: 'fps-measurement',
      duration: metrics.currentFPS,
      timestamp: Date.now(),
      type: 'general',
      metadata: {
        averageFPS: metrics.averageFPS,
        minFPS: metrics.minFPS,
        maxFPS: metrics.maxFPS,
        frameDrops: metrics.frameDrops,
        status: this.getPerformanceStatus(),
      },
    });

    // Notify observers
    this.observers.forEach(observer => observer(metrics));

    // Log warnings for poor performance
    if (dev) {
      const status = this.getPerformanceStatus();
      if (status === 'poor') {
        console.warn(`Poor FPS performance: ${metrics.averageFPS.toFixed(1)} FPS average`, metrics);
      } else if (status === 'warning') {
        console.warn(`FPS performance warning: ${metrics.averageFPS.toFixed(1)} FPS average`, metrics);
      }
    }
  }
}

// Singleton instance
export const fpsMonitor = new FPSMonitor();

/**
 * Hook for Svelte components to monitor FPS
 */
export function useFPSMonitor() {
  let metrics: FPSMetrics | null = null;
  let unsubscribe: (() => void) | null = null;

  function start() {
    if (unsubscribe) return; // Already started
    
    fpsMonitor.start();
    unsubscribe = fpsMonitor.subscribe((newMetrics) => {
      metrics = newMetrics;
    });
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    metrics = null;
  }

  return {
    get metrics() { return metrics; },
    start,
    stop,
    isPerformingWell: () => fpsMonitor.isPerformingWell(),
    getStatus: () => fpsMonitor.getPerformanceStatus(),
  };
}

/**
 * Utility to temporarily monitor FPS during a specific operation
 */
export async function monitorFPSDuring<T>(
  operation: () => Promise<T> | T,
  name: string
): Promise<T> {
  const wasMonitoring = fpsMonitor['isMonitoring'];
  
  if (!wasMonitoring) {
    fpsMonitor.start();
  }

  const initialMetrics = fpsMonitor.getCurrentMetrics();
  
  try {
    const result = await operation();
    
    // Wait a frame to get post-operation metrics
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const finalMetrics = fpsMonitor.getCurrentMetrics();
    
    // Record the operation's impact on FPS
    performanceMonitor.recordMetric({
      name: `fps-during-${name}`,
      duration: initialMetrics.averageFPS - finalMetrics.averageFPS,
      timestamp: Date.now(),
      type: 'general',
      metadata: {
        operation: name,
        initialFPS: initialMetrics.averageFPS,
        finalFPS: finalMetrics.averageFPS,
        frameDropsAdded: finalMetrics.frameDrops - initialMetrics.frameDrops,
      },
    });

    return result;
  } finally {
    if (!wasMonitoring) {
      fpsMonitor.stop();
    }
  }
}

/**
 * Check if the current device/browser can maintain good FPS
 */
export function canMaintainGoodFPS(): Promise<boolean> {
  return new Promise((resolve) => {
    const testDuration = 2000; // 2 seconds
    const startTime = Date.now();
    
    fpsMonitor.start();
    
    const unsubscribe = fpsMonitor.subscribe((metrics) => {
      if (Date.now() - startTime >= testDuration) {
        unsubscribe();
        const canMaintain = metrics.averageFPS >= fpsMonitor['thresholds'].goodFPS;
        resolve(canMaintain);
      }
    });
  });
}