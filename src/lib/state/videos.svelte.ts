import { type TimestampResponse } from "$lib/supabase/videos";

export interface MostRecentVideo {
  videoId: string | null;
}
export let mostRecentVideo = $state<MostRecentVideo>({ videoId: null });
