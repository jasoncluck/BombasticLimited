import { showNotification } from '$lib/stores/notification.js';
import { SOURCE_INFO, type Source } from '$lib/constants/source.js';
import type { SidebarState } from '$lib/state/sidebar.svelte.js';
import { source, type Source as SSESource } from 'sveltekit-sse';
import { browser } from '$app/environment';

// Key for localStorage to track shown notifications
const SHOWN_NOTIFICATIONS_KEY = 'bombastic_shown_stream_notifications';
// How long to remember a notification was shown (24 hours)
const NOTIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Interface for tracking shown notifications
 */
interface ShownNotification {
  source: Source;
  timestamp: number;
}

/**
 * Get shown notifications from localStorage
 */
function getShownNotifications(): ShownNotification[] {
  if (!browser) return [];
  
  try {
    const stored = localStorage.getItem(SHOWN_NOTIFICATIONS_KEY);
    if (!stored) return [];
    
    const notifications: ShownNotification[] = JSON.parse(stored);
    const now = Date.now();
    
    // Filter out expired notifications
    const validNotifications = notifications.filter(
      (notification) => now - notification.timestamp < NOTIFICATION_EXPIRY_MS
    );
    
    // Save back if we filtered any out
    if (validNotifications.length !== notifications.length) {
      localStorage.setItem(SHOWN_NOTIFICATIONS_KEY, JSON.stringify(validNotifications));
    }
    
    return validNotifications;
  } catch (error) {
    console.error('Failed to load shown notifications:', error);
    return [];
  }
}

/**
 * Check if notification for a source was recently shown
 */
function wasNotificationRecentlyShown(source: Source): boolean {
  const shownNotifications = getShownNotifications();
  return shownNotifications.some((notification) => notification.source === source);
}

/**
 * Mark a notification as shown for a source
 */
function markNotificationAsShown(source: Source): void {
  if (!browser) return;
  
  try {
    const shownNotifications = getShownNotifications();
    
    // Remove any existing entry for this source
    const filteredNotifications = shownNotifications.filter(
      (notification) => notification.source !== source
    );
    
    // Add new entry
    filteredNotifications.push({
      source,
      timestamp: Date.now(),
    });
    
    localStorage.setItem(SHOWN_NOTIFICATIONS_KEY, JSON.stringify(filteredNotifications));
  } catch (error) {
    console.error('Failed to save shown notification:', error);
  }
}

/**
 * Service to manage SSE connection for Twitch streaming updates
 */
export class StreamingSSEService {
  private connection: SSESource | null = null;
  private sidebarState: SidebarState | null = null;
  private isInitialLoad = true;

  /**
   * Set the sidebar state for managing streaming sources
   */
  public setSidebarState(sidebarState: SidebarState): void {
    this.sidebarState = sidebarState;
  }

  /**
   * Get the current connection status
   */
  public getStatus(): 'disconnected' | 'connecting' | 'connected' | 'error' {
    if (!this.connection) {
      return 'disconnected';
    }
    
    // For sveltekit-sse, we don't have direct access to EventSource readyState
    // We'll track status through the connection lifecycle
    return 'connecting';
  }

  /**
   * Start the SSE connection to receive streaming updates
   */
  public start(): void {
    if (this.connection) {
      console.log('SSE connection already exists');
      return;
    }

    // Reset initial load flag when starting
    this.isInitialLoad = true;

    try {
      this.connection = source('/api/twitch');

      this.connection.select('streamingSubscriptions').subscribe((data) => {
        try {
          const streamingSources: Source[] = JSON.parse(data);
          this.updateStreamingState(streamingSources);
        } catch (error) {
          console.error('Failed to parse streaming update:', error);
        }
      });

      this.connection.select('open').subscribe(() => {
        console.log('Twitch streaming SSE connection established');
      });

      this.connection.select('error').subscribe((event) => {
        console.error('Twitch streaming SSE error:', event);
      });
    } catch (error) {
      console.error('Failed to create EventSource:', error);
    }
  }

  // /**
  //  * Stop the SSE connection and cleanup
  //  */
  public stop(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      console.log('Twitch streaming SSE connection closed');
    }
  }

  /**
   * Update the local streaming state and send notifications
   */
  private updateStreamingState(newStreamingSources: Source[]): void {
    if (!this.sidebarState) {
      console.warn('SidebarState not set in StreamingSSEService');
      return;
    }

    const previousStreams = new Set(this.sidebarState.getStreamingSources());
    const currentStreams = new Set(newStreamingSources);

    // Find sources that just started streaming
    const startedStreaming = newStreamingSources.filter(
      (source) => !previousStreams.has(source)
    );

    // Find sources that stopped streaming
    const stoppedStreaming = this.sidebarState
      .getStreamingSources()
      .filter((source) => !currentStreams.has(source));

    // Update the sidebar streaming state
    this.sidebarState.updateStreamingSources(newStreamingSources);

    // Only send notifications for real-time changes, not on initial load
    if (!this.isInitialLoad) {
      // Send notifications for stream status changes
      startedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;
        
        // Only show notification if it wasn't recently shown
        if (!wasNotificationRecentlyShown(source)) {
          showNotification(`${displayName} is now streaming!`, 'success');
          markNotificationAsShown(source);
        }
      });
    }

    // Mark initial load as complete after first update
    if (this.isInitialLoad) {
      this.isInitialLoad = false;
    }

    stoppedStreaming.forEach((source) => {
      const displayName = SOURCE_INFO[source]?.displayName || source;
      console.log(`${displayName} has stopped streaming`);
    });
  }
}

// Export a singleton instance
export const streamingSSE = new StreamingSSEService();
