// Global setup that runs before module imports
// This must be applied to fix SvelteKit payload issues

import { vi } from 'vitest';

// `$lib/server/db` holds a real `pg.Pool` pointed at Neon. Without this,
// any test that transitively calls a function from `user-profiles.ts` (many
// load functions do, post-Cognito-migration) attempts a real network
// connection and hangs indefinitely in this sandboxed environment instead
// of failing fast. Individual test files can still override this with
// their own more specific `vi.mock('$lib/server/db', ...)`.
vi.mock('$lib/server/db', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

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
