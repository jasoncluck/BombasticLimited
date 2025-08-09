import { showNotification } from '$lib/stores/notification.js';
import { SOURCE_INFO } from '$lib/constants/source.js';
import type { Source } from '$lib/constants/source.js';
import { browser } from '$app/environment';

class StreamingSSE {
  private sidebarState: any = null;
  private eventSource: EventSource | null = null;
  private intervalId: number | null = null;
  private streamingSources: Source[] = [];
  private isInitialStreamLoad = true;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  setSidebarState(state: any) {
    this.sidebarState = state;
  }

  getStatus() {
    if (!this.eventSource) {
      return 'disconnected';
    }
    
    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING:
        return 'connecting';
      case EventSource.OPEN:
        return 'connected';
      case EventSource.CLOSED:
        return 'disconnected';
      default:
        return 'disconnected';
    }
  }

  /**
   * Update the local streaming state and send notifications
   */
  private updateStreamingState(newStreamingSources: Source[]): void {
    // Get current streaming sources from sidebar state if available
    const currentSidebarSources = this.sidebarState?.getStreamingSources?.() || [];
    const previousStreams = new Set(currentSidebarSources.length > 0 ? currentSidebarSources : this.streamingSources);
    const currentStreams = new Set(newStreamingSources);

    // Find sources that just started streaming
    const startedStreaming = newStreamingSources.filter(
      (source) => !previousStreams.has(source)
    );

    // Find sources that stopped streaming
    const stoppedStreaming = this.streamingSources.filter(
      (source) => !currentStreams.has(source)
    );

    // Update the local streaming state first
    this.streamingSources = [...newStreamingSources];

    // Update the sidebar streaming state
    if (this.sidebarState?.updateStreamingSources) {
      this.sidebarState.updateStreamingSources(newStreamingSources);
    }

    // Only send notifications for real-time changes, not on initial load
    if (!this.isInitialStreamLoad) {
      // Send notifications for streams that started
      startedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;
        if (browser) {
          showNotification(`${displayName} has started streaming.`, 'success');
        }
      });

      // Send notifications for streams that stopped (or log for testing)
      stoppedStreaming.forEach((source) => {
        const displayName = SOURCE_INFO[source]?.displayName || source;
        if (browser) {
          showNotification(`${displayName} has stopped streaming.`);
        } else {
          // For testing environments that expect console.log
          console.log(`${displayName} has stopped streaming.`);
        }
      });
    }

    // Mark initial load as complete after first update
    if (this.isInitialStreamLoad) {
      this.isInitialStreamLoad = false;
    }
  }

  start() {
    // Don't create multiple connections
    if (this.eventSource) {
      return;
    }

    // Mark that we're starting fresh - first events should show notifications
    this.isInitialStreamLoad = false;

    // Connect to your existing +twitch/+server.ts SSE endpoint
    this.eventSource = new EventSource('/api/twitch', {
      withCredentials: true
    });

    this.eventSource.addEventListener('streamingSubscriptions', (event) => {
      try {
        const streamingSources = JSON.parse(event.data);
        this.updateStreamingState(streamingSources);
      } catch (error) {
        console.error('Failed to parse streaming update:', error);
      }
    });

    this.eventSource.addEventListener('open', () => {
      this.reconnectAttempts = 0;
    });

    this.eventSource.onerror = (error) => {
      console.error('Twitch streaming SSE error:', error);
      
      // Try to reconnect if not at max attempts
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          console.log(`Attempting to reconnect to Twitch streaming... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          this.reconnectAttempts++;
          this.stop();
          this.start();
        }, 5000);
      }
    };

    console.log('Streaming SSE connection started');
  }

  stop() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }


    console.log('Streaming SSE connection stopped');
  }
}

// Export both the class and a singleton instance
export class StreamingSSEService extends StreamingSSE {}
export const streamingSSE = new StreamingSSE();
