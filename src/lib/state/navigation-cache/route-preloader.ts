import { preloadData } from "$app/navigation";
export interface PreloadJob {
  url: string;
  priority: number;
  userId: string | null;
  timestamp: number;
  retries: number;
  completed: boolean;
}

export interface PreloadStats {
  pending: number;
  completed: number;
  failed: number;
  queueSize: number;
  activePreloads: number;
}

export class RoutePreloader {
  private preloadQueue = new Map<string, PreloadJob>();
  private activePreloads = new Set<string>();
  private maxConcurrentPreloads = 2;
  private preloadStats = { pending: 0, completed: 0, failed: 0 };

  constructor(
    private getCurrentUserId: () => string | null,
    private markRouteAsPreloaded: (url: string) => void,
    private isRoutePreloaded: (url: string) => boolean,
  ) {}

  getPreloadSuggestions(currentPath: string, userId: string | null): string[] {
    const suggestions: string[] = [];

    if (currentPath === "/") {
      suggestions.push("/giantbomb", "/nextlander", "/remap", "/jeffgerstmann");
      if (userId) {
        suggestions.push("/continue");
      }
    } else if (currentPath === "/giantbomb") {
      suggestions.push("/giantbomb?page=1", "/nextlander");
      if (userId) suggestions.push("/continue");
    } else if (currentPath === "/nextlander") {
      suggestions.push("/nextlander?page=1", "/giantbomb");
      if (userId) suggestions.push("/continue");
    } else if (currentPath === "/remap") {
      suggestions.push("/remap?page=1", "/giantbomb");
      if (userId) suggestions.push("/continue");
    } else if (currentPath === "/jeffgerstmann") {
      suggestions.push("/jeffgerstmann?page=1", "/giantbomb");
      if (userId) suggestions.push("/continue");
    } else if (currentPath === "/continue" && userId) {
      suggestions.push("/giantbomb", "/nextlander");
    }

    return suggestions.filter(
      (url) => url !== currentPath && !this.isRoutePreloaded(url),
    );
  }

  async preloadRoute(
    url: string,
    priority = 5,
    userId: string | null = null,
  ): Promise<void> {
    // Check if already preloaded
    if (this.isRoutePreloaded(url)) {
      return;
    }

    // Check if already in queue
    if (this.preloadQueue.has(url) || this.activePreloads.has(url)) {
      return;
    }

    const effectiveUserId = userId ?? this.getCurrentUserId();
    const job: PreloadJob = {
      url,
      priority,
      userId: effectiveUserId,
      timestamp: Date.now(),
      retries: 0,
      completed: false,
    };

    this.preloadQueue.set(url, job);
    this.preloadStats.pending++;

    return this.processPreloadQueue();
  }

  async preloadRoutes(urls: string[], priority = 5): Promise<void> {
    const userId = this.getCurrentUserId();

    for (const url of urls) {
      await this.preloadRoute(url, priority, userId);
    }
  }

  getStats(): PreloadStats {
    return {
      ...this.preloadStats,
      queueSize: this.preloadQueue.size,
      activePreloads: this.activePreloads.size,
    };
  }

  cleanup(): void {
    this.preloadQueue.clear();
    this.activePreloads.clear();
    this.preloadStats = { pending: 0, completed: 0, failed: 0 };
  }

  private async processPreloadQueue(): Promise<void> {
    if (this.activePreloads.size >= this.maxConcurrentPreloads) {
      return;
    }

    const sortedJobs = Array.from(this.preloadQueue.values())
      .filter((job) => !this.activePreloads.has(job.url))
      .sort((a, b) => a.priority - b.priority);

    const jobsToProcess = sortedJobs.slice(
      0,
      this.maxConcurrentPreloads - this.activePreloads.size,
    );

    for (const job of jobsToProcess) {
      this.processPreloadJob(job);
    }
  }

  private async processPreloadJob(job: PreloadJob): Promise<void> {
    this.activePreloads.add(job.url);

    try {
      // Use SvelteKit's preloadData instead of raw fetch
      const result = await preloadData(job.url);

      if (result) {
        this.markRouteAsPreloaded(job.url);
        this.completePreloadJob(job.url, true);
      } else {
        throw new Error("preloadData returned null");
      }
    } catch {
      if (job.retries < 2) {
        job.retries++;
        job.timestamp = Date.now();
        setTimeout(() => {
          if (this.preloadQueue.has(job.url)) {
            this.processPreloadJob(job);
          }
        }, 1000 * job.retries);
      } else {
        this.completePreloadJob(job.url, false);
      }
    }
  }

  private completePreloadJob(url: string, success: boolean): void {
    this.activePreloads.delete(url);
    this.preloadQueue.delete(url);

    if (this.preloadStats.pending > 0) {
      this.preloadStats.pending--;
    }

    if (success) {
      this.preloadStats.completed++;
    } else {
      this.preloadStats.failed++;
    }

    setTimeout(() => this.processPreloadQueue(), 100);
  }
}
