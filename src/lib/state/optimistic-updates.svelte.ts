import { browser } from "$app/environment";

type OptimisticUpdate<T> = {
  id: string;
  data: T;
  timestamp: number;
  revert: () => void;
};

class OptimisticUpdatesState<T> {
  private updates = $state<Map<string, OptimisticUpdate<T>>>(new Map());
  private cleanupInterval: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (browser) {
      // Clean up old updates every 30 seconds
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 30000);
    }
  }

  // Apply optimistic update
  apply(id: string, data: T, revert: () => void): void {
    this.updates.set(id, {
      id,
      data,
      timestamp: Date.now(),
      revert,
    });
  }

  // Commit successful update (remove from optimistic updates)
  commit(id: string): void {
    this.updates.delete(id);
  }

  // Rollback failed update
  rollback(id: string): void {
    const update = this.updates.get(id);
    if (update) {
      update.revert();
      this.updates.delete(id);
    }
  }

  // Get current optimistic data for an ID
  get(id: string): T | null {
    const update = this.updates.get(id);
    return update ? update.data : null;
  }

  // Check if an update is pending
  isPending(id: string): boolean {
    return this.updates.has(id);
  }

  // Clean up old updates (older than 5 minutes)
  private cleanup(): void {
    const now = Date.now();
    const CLEANUP_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    for (const [id, update] of this.updates.entries()) {
      if (now - update.timestamp > CLEANUP_THRESHOLD) {
        console.warn(`Cleaning up stale optimistic update: ${id}`);
        this.updates.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.updates.clear();
  }
}

// Global instance for playlist updates
export const playlistOptimisticUpdates = new OptimisticUpdatesState<any>();
