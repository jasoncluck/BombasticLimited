import { getMultipleStreamStatus } from '$lib/client/streaming-sse.js';

class StreamingSSE {
  private sidebarState: any = null;
  private eventSource: EventSource | null = null;
  private intervalId: number | null = null;

  setSidebarState(state: any) {
    this.sidebarState = state;
  }

  start() {
    // Connect to your existing +twitch/+server.ts SSE endpoint
    this.eventSource = new EventSource('/twitch');


    this.eventSource.addEventListener('streamingSubscriptions', (event) => {
      try {
        const streamingSources = JSON.parse(event.data);

        if (this.sidebarState) {
          // Update sidebar state with streaming info
          // You'll need to adjust this based on your sidebar state structure
          this.sidebarState.updateStreamingStatus?.(streamingSources);
        }
      } catch (error) {
        console.error('Failed to parse SSE streaming data:', error);
      }
    });

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
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

// Export a singleton instance
export const streamingSSE = new StreamingSSE();
