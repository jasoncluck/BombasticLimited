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
    giantbomb: {
      displayName: "Giant Bomb",
      urlParam: "giantbomb",
      image: "giantbomb.jpg",
      twitchId: "504350",
      youtubeId: "UCmeds0MLhjfkjD_5acPnFlQ",
      youtubeUrl: "https://www.youtube.com/giantbomb",
      highlightedPlaylists: [
        { name: "Blight Club", youtubeId: "PLXlhzeWIuTHIGNBahKzWx9Hy54BXtM8Ef" },
        { name: "Voicemail Dump Truck", youtubeId: "PLXlhzeWIuTHLjtyPTm42V-jPS70IYXOjJ" },
      ],
      websiteUrlDomain: "giantbomb.com",
      supportUrl: "https://www.giantbomb.com/upgrade/",
    },
    jeffgerstmann: {
      displayName: "The Jeff Gerstmann Show",
      urlParam: "jeffgerstmann",
      image: "jeffgerstmann.jpg",
      twitchId: "504350",
      youtubeId: "UCR9R2ARN74dCebn1kv06UhA",
      youtubeUrl: "https://www.youtube.com/@JeffGerstmannShow",
      highlightedPlaylists: [
        { name: "Quick Looks at New Video Games", youtubeId: "PLDKeuvgV0sxZ78sutjkPvhM9sL74WHITb" },
        { name: "Ranking the NES!", youtubeId: "PLDKeuvgV0sxZ_xs4zUvQcMEV-LTjSf-Ok" },
      ],
      supportUrl: "https://www.patreon.com/cw/jeffgerstmann",
    },
    nextlander: {
      displayName: "Nextlander",
      urlParam: "nextlander",
      image: "nextlander.jpg",
      twitchId: "689331234",
      youtubeId: "UCO0gHyqLNeIrCAjwlO2BmiA",
      youtubeUrl: "https://www.youtube.com/@Nextlander",
      highlightedPlaylists: [
        { name: "NXL Highlights", youtubeId: "PL8GKXV8flVOZkcetVtA7l9Z0SVIIIvUQ_" },
        { name: "Talkin' Over Things", youtubeId: "PL8GKXV8flVOaonOnH-Am9gz-FEfFGb8xz" },
      ],
      supportUrl: "https://www.patreon.com/nextlander/",
    },
    remap: {
      displayName: "Remap",
      urlParam: "remap",
      image: "remap.jpg",
      twitchId: "913491352",
      youtubeId: "UCpcSq3A3Z4tUJsHKfn8zpnA",
      youtubeUrl: "https://www.youtube.com/@RemapRadio",
      highlightedPlaylists: [
        { name: "Wheel of GeForce Now", youtubeId: "PLTbM52Fro5psQ2WIdV9M7YgfWMrnv8wLu" },
        { name: "Remap Radio", youtubeId: "PLTbM52Fro5psVDi5r1StiTdnLxM9McaSO" },
      ],
      websiteUrlDomain: "remapradio.com",
      supportUrl: "https://remapradio.com/signup/",
    },
  },
  isSourceArray: vi.fn((value) => {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }),
  isSource: vi.fn((value) => {
    return typeof value === "string" && ["giantbomb", "jeffgerstmann", "nextlander", "remap"].includes(value);
  }),
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
