import { type TimestampResponse } from "$lib/supabase/videos";

export interface MostRecentVideo {
  timestamp: TimestampResponse | null;
}
export let mostRecentVideo = $state<MostRecentVideo>({
  timestamp: null,
});
