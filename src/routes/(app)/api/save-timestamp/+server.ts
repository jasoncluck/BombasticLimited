// Example Edge Function or API route handler for sendBeacon
import type { TimestampWithVideoId } from '$lib/neon/timestamps';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({
  request,
  locals: { neon, userId },
}) => {
  const data = await request.json();

  // You may want to validate the payload, check auth, etc.
  const { videoTimestamp }: { videoTimestamp: TimestampWithVideoId } = data;

  if (userId) {
    const { error } = await neon.from('timestamps').upsert(
      {
        user_id: userId,
        video_id: videoTimestamp.videoId,
        video_start_seconds: videoTimestamp.timestampStartSeconds,
        watched_at: videoTimestamp.watchedAt?.toISOString() ?? null,
        playlist_id: videoTimestamp.playlistId,
        sorted_by: videoTimestamp.sortedBy,
        sort_order: videoTimestamp.sortOrder,
      },
      { onConflict: 'user_id,video_id' }
    );
    if (error) {
      console.error(error);
    }
  }

  // The response can be empty for sendBeacon
  return new Response(null, { status: 204 });
};
