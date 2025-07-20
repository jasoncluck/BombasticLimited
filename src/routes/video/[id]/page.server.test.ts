import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { mockVideo } from "../../../tests/mocks/videos";
import { setupTest } from "../../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetVideo } = vi.hoisted(() => ({
  mockGetVideo: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/videos", () => ({
  getVideo: mockGetVideo,
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("video/[id]/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetVideo.mockResolvedValue({
      video: mockVideo,
    });
  });

  it("loads video successfully with authenticated user", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      params: { id: "test-video-id" },
      routeId: "/video/[id]",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.video).toEqual(mockVideo);
    expect(mockGetVideo).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      videoId: "test-video-id",
      session: mockSession,
    });
  });

  it("loads video successfully without authenticated user", async () => {
    const { load } = await loadModule();

    const parentData: BaseParentData = {
      session: null,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      parentData,
      params: { id: "test-video-id" },
      routeId: "/video/[id]",
    });

    // Manually override the session in locals to be null for this test
    mockEvent.locals.session = null;
    mockEvent.locals.user = null;

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.video).toEqual(mockVideo);
    expect(mockGetVideo).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      videoId: "test-video-id",
      session: null,
    });
  });

  it("throws error when video is not found", async () => {
    const { load } = await loadModule();

    // Mock getVideo to return null video
    mockGetVideo.mockResolvedValue({
      video: null,
    });

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      params: { id: "nonexistent-id" },
      routeId: "/video/[id]",
    });

    await expect(load(mockEvent)).rejects.toThrow("Could not find video specified.");

    expect(mockGetVideo).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      videoId: "nonexistent-id",
      session: mockSession,
    });
  });

  it("handles different video IDs correctly", async () => {
    const { load } = await loadModule();

    const customVideo = {
      ...mockVideo,
      id: "custom-video-123",
      title: "Custom Video Title",
    };

    mockGetVideo.mockResolvedValue({
      video: customVideo,
    });

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      params: { id: "custom-video-123" },
      routeId: "/video/[id]",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.video).toEqual(customVideo);
    expect(mockGetVideo).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      videoId: "custom-video-123",
      session: mockSession,
    });
  });

  it("handles database errors gracefully", async () => {
    const { load } = await loadModule();

    // Mock getVideo to throw an error
    mockGetVideo.mockRejectedValue(new Error("Database connection failed"));

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      params: { id: "test-video-id" },
      routeId: "/video/[id]",
    });

    await expect(load(mockEvent)).rejects.toThrow("Database connection failed");

    expect(mockGetVideo).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      videoId: "test-video-id",
      session: mockSession,
    });
  });
});