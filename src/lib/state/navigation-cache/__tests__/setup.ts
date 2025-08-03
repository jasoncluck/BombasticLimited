import { vi, beforeEach } from "vitest";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

// Mock ServiceWorker global
const mockServiceWorkerGlobalScope = {
  skipWaiting: vi.fn(() => Promise.resolve()),
  clients: {
    matchAll: vi.fn(() => Promise.resolve([] as Array<{ postMessage: any }>)),
    claim: vi.fn(() => Promise.resolve()),
  },
  location: { origin: "http://localhost:5173" },
  addEventListener: vi.fn(),
};

// Mock caches API
const mockCaches = {
  open: vi.fn(),
  keys: vi.fn(() => Promise.resolve([] as string[])),
  delete: vi.fn(() => Promise.resolve(true)),
};

// Set up global mocks
beforeEach(() => {
  Object.defineProperty(global, "localStorage", {
    value: localStorageMock,
    writable: true,
  });

  Object.defineProperty(global, "self", {
    value: mockServiceWorkerGlobalScope,
    writable: true,
  });

  Object.defineProperty(global, "caches", {
    value: mockCaches,
    writable: true,
  });

  Object.defineProperty(global, "fetch", {
    value: vi.fn(),
    writable: true,
  });

  // Mock browser environment
  Object.defineProperty(global, "navigator", {
    value: {
      serviceWorker: {
        ready: Promise.resolve({
          active: {
            postMessage: vi.fn(),
          },
        }),
        controller: {
          postMessage: vi.fn(),
        },
        addEventListener: vi.fn(),
      },
    },
    writable: true,
  });

  Object.defineProperty(global, "MessageChannel", {
    value: class MockMessageChannel {
      port1 = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
      };
      port2 = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
      };
    },
    writable: true,
  });

  Object.defineProperty(global, "document", {
    value: {
      cookie: "",
    },
    writable: true,
  });

  vi.clearAllMocks();
});
