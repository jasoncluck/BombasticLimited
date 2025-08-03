export const COLLAPSED_SIDEBAR_SIZE = 7;

// Suppress passive event listener messages from svelte-dnd-action
const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, listener, options) {
  if (type === 'touchstart' || type === 'touchmove') {
    // Force passive: false for all touch events to avoid warnings
    if (typeof options === 'boolean') {
      options = { passive: false, capture: options };
    } else if (typeof options === 'object' && options) {
      options = { ...options, passive: false };
    } else {
      options = { passive: false };
    }
  }
  return originalAddEventListener.call(this, type, listener, options);
};
