/**
 * Utility functions for communicating with the service worker
 */

export interface ServiceWorkerMessage {
  type: string;
  payload?: unknown;
}

/**
 * Sends a message to the service worker
 * @param message - The message to send to the service worker
 * @returns Promise that resolves when the message is sent (does not wait for response)
 */
export async function sendMessageToServiceWorker(
  message: ServiceWorkerMessage
): Promise<void> {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

/**
 * Cancels all pending image requests in the service worker
 * This is useful when navigating to prioritize new requests over stale ones
 */
export async function cancelPendingImageRequests(): Promise<void> {
  await sendMessageToServiceWorker({
    type: 'CANCEL_PENDING_REQUESTS',
  });
}