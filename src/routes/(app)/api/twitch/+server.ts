import { addStreamChangeListener, getActiveStreams } from '$lib/server/twitch-poller.js';
import { dev } from '$app/environment';
import type { Source } from '$lib/constants/source.js';

/**
 * Create SSE response following Vercel streaming patterns
 */
function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

/**
 * Create SSE data string
 */
function createSSEData(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

function createSSEHandler() {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cleanupListener: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      
      if (dev) {
        console.log('🚀 SSE: Connection started with background poller');
      }

      // Send initial stream state immediately
      try {
        const initialStreams = getActiveStreams();
        const initialData = createSSEData('streamingSubscriptions', JSON.stringify(initialStreams));
        controller.enqueue(encoder.encode(initialData));
        
        if (dev) {
          console.log('📤 SSE: Sent initial streams:', initialStreams);
        }
      } catch (error) {
        console.error('Failed to send initial stream state:', error);
      }

      // Set up listener for stream changes
      cleanupListener = addStreamChangeListener((activeStreams: Source[]) => {
        try {
          if (controller.desiredSize === null) {
            // Stream is closed
            return;
          }
          
          const sseData = createSSEData('streamingSubscriptions', JSON.stringify(activeStreams));
          controller.enqueue(encoder.encode(sseData));
          
          if (dev) {
            console.log('📤 SSE: Sent stream update:', activeStreams);
          }
        } catch (error) {
          console.error('Failed to send stream update:', error);
          // Close the stream on error
          try {
            controller.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }
      });

      // Send periodic heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          if (controller.desiredSize === null) {
            // Stream is closed
            clearInterval(heartbeatInterval);
            return;
          }
          
          // Send a comment as heartbeat (ignored by EventSource)
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          
          if (dev) {
            console.log('💓 SSE: Heartbeat sent');
          }
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
          clearInterval(heartbeatInterval);
        }
      }, 30000); // 30 second heartbeat

      // Store interval for cleanup
      (controller as any).__heartbeatInterval = heartbeatInterval;
    },
    
    cancel(reason) {
      if (dev) {
        console.log('🔌 SSE: Connection cancelled:', reason);
      }
      
      // Clean up listener
      if (cleanupListener) {
        cleanupListener();
        cleanupListener = null;
      }
      
      // Clean up heartbeat interval
      if (controllerRef && (controllerRef as any).__heartbeatInterval) {
        clearInterval((controllerRef as any).__heartbeatInterval);
      }
    }
  });

  return createSSEResponse(stream);
}

// EventSource only supports GET requests
export async function GET() {
  return createSSEHandler();
}

// Keep POST for backward compatibility with tests
export async function POST() {
  return createSSEHandler();
}
