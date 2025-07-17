import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/svelte";
import { mockReset } from "vitest-mock-extended";

export const setupTest = () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
};

// Enhanced setup with vitest-mock-extended reset
export const setupTestWithMockExtended = (mocks: any[] = []) => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all vitest-mock-extended mocks
    mocks.forEach((mock) => mockReset(mock));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
};

export const mockVideoQueries = async () => {
  const { getVideos, getInProgressVideos } = await import(
    "$lib/supabase/videos"
  );

  vi.mock("$lib/supabase/videos", () => ({
    getVideos: vi.fn(),
    getInProgressVideos: vi.fn(),
    DEFAULT_NUM_VIDEOS_OVERVIEW: 30,
  }));

  return {
    getVideos: vi.mocked(getVideos),
    getInProgressVideos: vi.mocked(getInProgressVideos),
  };
};
