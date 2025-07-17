import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/svelte";
import { mockReset } from "vitest-mock-extended";

export const setupTest = () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });
};

// Enhanced setup with vitest-mock-extended reset
export const setupTestWithMockExtended = (mocksToReset: any[] = []) => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all vitest-mock-extended mocks
    mocksToReset.forEach((mock) => mockReset(mock));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });
};

// Helper to get mocked versions of video functions
export const getMockedVideoQueries = () => {
  const { getVideos, getInProgressVideos } = vi.hoisted(() => {
    return {
      getVideos: vi.fn(),
      getInProgressVideos: vi.fn(),
    };
  });

  return {
    getVideos: vi.mocked(getVideos),
    getInProgressVideos: vi.mocked(getInProgressVideos),
  };
};
