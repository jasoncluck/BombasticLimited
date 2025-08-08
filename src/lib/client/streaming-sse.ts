import { activeStreams } from '$lib/state/streaming.svelte.js';
import { showNotification } from '$lib/stores/notification.js';
import { SOURCE_INFO, type Source } from '$lib/constants/source.js';

/**
 * Service to manage SSE connection for Twitch streaming updates
 */
export class StreamingSSEService {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Start the SSE connection to receive streaming updates
   */
  public start(): void {
    if (this.eventSource) {
      console.log('SSE connection already exists');
      return;
    }

    try {
      this.eventSource = new EventSource('/api/twitch', {
        withCredentials: true,
      });

      this.eventSource.addEventListener('streamingSubscriptions', (event) => {
        try {
          const streamingSources: Source[] = JSON.parse(event.data);
          this.updateStreamingState(streamingSources);
        } catch (error) {
          console.error('Failed to parse streaming update:', error);
        }
      });

      this.eventSource.addEventListener('open', () => {
        console.log('Twitch streaming SSE connection established');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay on successful connection
      });

      this.eventSource.addEventListener('error', (event) => {
        console.error('Twitch streaming SSE error:', event);
        this.handleConnectionError();
      });
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Stop the SSE connection and cleanup
   */
  public stop(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('Twitch streaming SSE connection closed');
    }

    this.reconnectAttempts = 0;
  }

  /**
   * Update the local streaming state and send notifications
   */
  private updateStreamingState(newStreamingSources: Source[]): void {
    const previousStreams = new Set(activeStreams.sources);
    const currentStreams = new Set(newStreamingSources);

    // Find sources that just started streaming
    const startedStreaming = newStreamingSources.filter(
      (source) => !previousStreams.has(source)
    );

    // Find sources that stopped streaming
    const stoppedStreaming = activeStreams.sources.filter(
      (source) => !currentStreams.has(source)
    );

    // Update the active streams state
    activeStreams.sources = [...newStreamingSources];

    // Send notifications for stream status changes
    startedStreaming.forEach((source) => {
      const displayName = SOURCE_INFO[source]?.displayName || source;
      showNotification(`${displayName} has started streaming!`, 'success');
    });

    stoppedStreaming.forEach((source) => {
      const displayName = SOURCE_INFO[source]?.displayName || source;
      console.log(`${displayName} has stopped streaming`);
    });
  }

  /**
   * Handle connection errors with exponential backoff
   */
  private handleConnectionError(): void {
    if (this.eventSource?.readyState === EventSource.CLOSED) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        'Maximum reconnection attempts reached for Twitch streaming SSE'
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Attempting to reconnect to Twitch streaming SSE in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.stop(); // Clean up current connection
      this.start(); // Start new connection
    }, delay);
  }

  /**
   * Get the current connection status
   */
  public getStatus(): string {
    if (!this.eventSource) return 'disconnected';

    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING:
        return 'connecting';
      case EventSource.OPEN:
        return 'connected';
      case EventSource.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }
}

// Export a singleton instance
export const streamingSSE = new StreamingSSEService();