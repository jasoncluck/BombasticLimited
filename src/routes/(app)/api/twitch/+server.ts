import {
  addStreamChangeListener,
  getActiveStreams,
} from '$lib/server/twitch-poller.js';
import { dev } from '$app/environment';
import type { Source } from '$lib/constants/source.js';


/**
 * Create SSE response following Vercel streaming patterns
 * With timeout management for serverless environments
 */
function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
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
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let connectionTimeout: NodeJS.Timeout | null = null;

  // Vercel has a 60-second timeout, so we'll close connections after 50 seconds
  // to allow for graceful cleanup before the timeout
  const MAX_CONNECTION_TIME = dev ? 300000 : 50000; // 5 min in dev, 50 sec in production
  const HEARTBEAT_INTERVAL = 25000; // 25 seconds

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      // Send initial stream state immediately
      try {
        const initialStreams = getActiveStreams();
        const initialData = createSSEData(
          'streamingSubscriptions',
          JSON.stringify(initialStreams)
        );
        controller.enqueue(encoder.encode(initialData));
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

          const sseData = createSSEData(
            'streamingSubscriptions',
            JSON.stringify(activeStreams)
          );
          controller.enqueue(encoder.encode(sseData));
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
      heartbeatInterval = setInterval(() => {
        try {
          // Check if stream is closed or controller is not available
          if (!controllerRef || controller.desiredSize === null) {
            // Stream is closed, clean up interval
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            return;
          }

          // Send a comment as heartbeat (ignored by EventSource)
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
          // Clean up interval on any error
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, HEARTBEAT_INTERVAL);

      // Auto-close connection before Vercel timeout
      connectionTimeout = setTimeout(() => {
        try {
          // Clean up heartbeat interval first to prevent the error
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          
          if (controller.desiredSize !== null) {
            // Send a close event to notify client to reconnect
            const closeData = createSSEData(
              'connection-close',
              JSON.stringify({ reason: 'timeout', reconnect: true })
            );
            controller.enqueue(encoder.encode(closeData));

            // Close the connection gracefully
            controller.close();
          }
        } catch (error) {
          console.error('Failed to close connection gracefully:', error);
        }
      }, MAX_CONNECTION_TIME);
    },

    cancel(reason) {
      // Clean up listener
      if (cleanupListener) {
        cleanupListener();
        cleanupListener = null;
      }

      // Clean up intervals and timeouts
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
    },
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
