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