// Global setup that runs before module imports
// This must be applied to fix SvelteKit payload issues

// Mock SvelteKit payload global before any modules are imported
Object.defineProperty(globalThis, '__SVELTEKIT_PAYLOAD__', {
  value: {
    data: {},
  },
  writable: true,
  configurable: true,
});

// Ensure window can be properly cleaned up during test teardown
if (typeof globalThis !== 'undefined' && globalThis.window) {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis.window,
    writable: true,
    configurable: true,
  });
}
