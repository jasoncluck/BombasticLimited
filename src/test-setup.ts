import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";

// Set up browser-like environment for Svelte 5
Object.defineProperty(globalThis, "window", {
  value: global.window,
  writable: true,
});

Object.defineProperty(globalThis, "document", {
  value: global.document,
  writable: true,
});

// Mock browser APIs that Svelte might need
Object.defineProperty(global, "requestAnimationFrame", {
  value: vi.fn((cb) => setTimeout(cb, 16)),
  writable: true,
});

Object.defineProperty(global, "cancelAnimationFrame", {
  value: vi.fn(),
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Clean setup
beforeEach(() => {
  // Reset any global mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
  // Clear any remaining timers
  vi.clearAllTimers();
});

// Mock SvelteKit app modules
vi.mock("$app/environment", () => ({
  browser: true, // Changed to true for testing
  dev: true,
  building: false,
  version: "1.0.0",
}));

vi.mock("$app/stores", () => ({
  page: {
    subscribe: vi.fn(() => () => {}),
  },
  navigating: {
    subscribe: vi.fn(() => () => {}),
  },
  updated: {
    subscribe: vi.fn(() => () => {}),
  },
}));

// Global test utilities
global.structuredClone =
  structuredClone || ((obj) => JSON.parse(JSON.stringify(obj)));

// Mock fetch if needed
global.fetch = vi.fn();

// Extend expect with jest-dom matchers
declare module "vitest" {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveClass(className: string): T;
  }
  interface AsymmetricMatchersContaining {
    toBeInTheDocument(): unknown;
    toHaveClass(className: string): unknown;
  }
}
