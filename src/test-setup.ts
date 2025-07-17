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

// Global test utilities
global.structuredClone =
  structuredClone || ((obj) => JSON.parse(JSON.stringify(obj)));

// Mock fetch if needed
global.fetch = vi.fn();

// Mock common modules that are used across tests
vi.mock("$lib/state/media-query.svelte.js", () => ({
  getMediaQueryState: vi.fn(() => ({
    isSm: true,
    isMd: false,
    isLg: false,
    isXl: false,
    canHover: true,
    isTouchDevice: false,
    initialized: true,
    matches: vi.fn(() => false),
    allMatches: { sm: true, md: false, lg: false, xl: false },
  })),
  setMediaQueryState: vi.fn(),
  MediaQueryState: vi.fn(),
}));

vi.mock("$lib/state/content.svelte.js", () => ({
  getContentState: vi.fn(() => ({
    selectedVideosBySection: {
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
      continueWatching: [],
    },
    toggleVideoSelection: vi.fn(),
    clearSelectedVideos: vi.fn(),
    getSelectedVideos: vi.fn(() => []),
    isVideoSelected: vi.fn(() => false),
  })),
}));

vi.mock("$lib/components/content/content.js", () => ({
  getContentView: vi.fn(() => "tiles"),
  sourceWithContinueStateKeys: [
    "giantbomb",
    "jeffgerstmann",
    "nextlander",
    "remap",
    "continueWatching",
  ],
}));

vi.mock("$lib/constants/source", () => ({
  SOURCES: ["giantbomb", "jeffgerstmann", "nextlander", "remap"],
  SOURCE_INFO: {
    giantbomb: { displayName: "Giant Bomb", url: "https://giantbomb.com" },
    jeffgerstmann: {
      displayName: "Jeff Gerstmann",
      url: "https://jeffgerstmann.com",
    },
    nextlander: { displayName: "Nextlander", url: "https://nextlander.com" },
    remap: { displayName: "Remap", url: "https://remap.fm" },
  },
}));

vi.mock("$app/navigation", () => ({
  invalidate: vi.fn(),
  goto: vi.fn(),
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  preloadData: vi.fn(),
  preloadCode: vi.fn(),
  onNavigate: vi.fn(),
  pushState: vi.fn(),
  replaceState: vi.fn(),
  invalidateAll: vi.fn(),
}));

// Create a mutable page state object for tests
const pageState = {
  url: new URL("http://localhost:3000"),
  route: { id: "/" },
  params: {},
  status: 200,
  error: null,
  data: {},
  state: {},
  form: null,
};

vi.mock("$app/state", () => ({
  page: {
    get url() {
      return pageState.url;
    },
    set url(value) {
      pageState.url = value;
    },
    get route() {
      return pageState.route;
    },
    get params() {
      return pageState.params;
    },
    get status() {
      return pageState.status;
    },
    get error() {
      return pageState.error;
    },
    get data() {
      return pageState.data;
    },
    get state() {
      return pageState.state;
    },
    get form() {
      return pageState.form;
    },
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock("$app/environment", () => ({
  browser: true,
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

vi.mock("@supabase/ssr", () => ({
  isBrowser: vi.fn(() => false),
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(),
  parseCookieHeader: vi.fn(),
  serializeCookieHeader: vi.fn(),
}));

vi.mock("$lib/components/content/content.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Content Component</div>" }),
    $$: {},
  })),
}));

// Clean setup
beforeEach(() => {
  // Reset page state to default
  pageState.url = new URL("http://localhost:3000");
  pageState.route = { id: "/" };
  pageState.params = {};
  pageState.status = 200;
  pageState.error = null;
  pageState.data = {};
  pageState.state = {};
  pageState.form = null;
});

afterEach(() => {
  vi.clearAllTimers();
});

// Export the page state for tests that need to modify it
export { pageState };

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
