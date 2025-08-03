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
    matchAll: vi.fn(() => Promise.resolve([])),
    claim: vi.fn(() => Promise.resolve()),
  },
  location: { origin: "http://localhost:5173" },
  addEventListener: vi.fn(),
};

// Mock caches API
const mockCaches = {
  open: vi.fn(),
  keys: vi.fn(() => Promise.resolve([])),
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

  vi.clearAllMocks();
});
