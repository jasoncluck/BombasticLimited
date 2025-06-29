// Example Edge Function or API route handler for sendBeacon
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({
  request,
  locals: { supabase, session },
}) => {
  const data = await request.json();

  // You may want to validate the payload, check auth, etc.
  const { videoId, currentTimeSeconds, watchedAt } = data;

  if (session) {
    // Save to Supabase (adapt to your schema/method)
    console.log(session.user.id);
    const { error } = await supabase.from("timestamps").upsert(
      {
        user_id: session?.user.id,
        video_id: videoId,
        video_start_seconds: currentTimeSeconds,
        watched_at: watchedAt?.toISOString() ?? null,
      },
      { onConflict: "user_id,video_id" },
    );
    console.log(error);
  }

  // The response can be empty for sendBeacon
  return new Response(null, { status: 204 });
};
