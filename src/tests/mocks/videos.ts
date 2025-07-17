import type { Video, VideoWithTimestamp } from "$lib/supabase/videos";
import type { Source } from "$lib/constants/source";
import { mockDeep } from "vitest-mock-extended";

export const mockVideo: Video = {
  id: "video-1",
  title: "Test Video",
  description: "Test Description",
  thumbnail_url: "https://example.com/thumb1.jpg",
  thumbnail_maxres_url: "https://example.com/thumbmax1.jpg",
  published_at: "2023-01-01",
  duration: "3600",
  source: "giantbomb",
};

export const mockVideoWithTimestamp: VideoWithTimestamp = {
  ...mockVideo,
  updated_at: "2023-01-01T00:00:00Z",
  video_start_seconds: 100,
  watched_at: "2023-01-01T00:00:00Z",
};

export const createMockVideo = (overrides: Partial<Video> = {}): Video => ({
  ...mockVideo,
  ...overrides,
});

export const createMockVideoWithTimestamp = (
  overrides: Partial<VideoWithTimestamp> = {},
): VideoWithTimestamp => ({
  ...mockVideoWithTimestamp,
  ...overrides,
});

export const createMockVideosBySource = (
  sources: Source[],
): Record<Source, Video[]> => {
  const result = {} as Record<Source, Video[]>;
  sources.forEach((source, index) => {
    result[source] = [
      createMockVideo({
        id: `${source}-video-${index}`,
        source,
        title: `${source} Video ${index}`,
      }),
    ];
  });
  return result;
};

// Type-safe deep mock for complex video scenarios
export const createDeepMockVideo = () => mockDeep<Video>();
export const createDeepMockVideoWithTimestamp = () =>
  mockDeep<VideoWithTimestamp>();
