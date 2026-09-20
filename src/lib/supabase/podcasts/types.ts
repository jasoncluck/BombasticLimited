import type { Source } from '$lib/constants/source';

export interface PodcastEpisode {
  id: number;
  feed_id: number;
  source: Source;
  guid: string;
  title: string;
  description: string | null;
  audio_url: string;
  image_url: string | null;
  duration_seconds: number | null;
  published_at: string;
  is_premium: boolean;
}
