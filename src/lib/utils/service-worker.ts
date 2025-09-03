/**
 * Utility functions for communicating with the service worker
 */

export interface ServiceWorkerMessage {
  type: string;
  payload?: unknown;
}

/**
 * Custom cancellation object used by service worker to avoid console errors
 */
export interface RequestCancellation {
  readonly reason: 'NAVIGATION_CANCELLED';
  readonly message: string;
  readonly cancelled: true;
}

/**
 * Checks if a rejection reason is a request cancellation (not an actual error)
 * @param rejection - The rejection reason to check
 * @returns true if this is a planned cancellation, false if it's an actual error
 */
export function isRequestCancellation(
  rejection: unknown
): rejection is RequestCancellation {
  return (
    typeof rejection === 'object' &&
    rejection !== null &&
    'reason' in rejection &&
    'cancelled' in rejection &&
    (rejection as RequestCancellation).reason === 'NAVIGATION_CANCELLED' &&
    (rejection as RequestCancellation).cancelled === true
  );
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
