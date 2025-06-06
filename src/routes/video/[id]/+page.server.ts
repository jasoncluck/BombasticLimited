import { getVideo, isVideoWithTimestamp } from "$lib/supabase/videos";
import type { PageServerLoad } from "./$types";
export const load: PageServerLoad = async ({
  locals: { supabase, session },
  params,
  url,
}) => {
  let urlStartSeconds;
  let urlStartSecondsQueryParam = url.searchParams.get("t");

  if (urlStartSecondsQueryParam) {
    urlStartSeconds = parseInt(urlStartSecondsQueryParam);
  }

  const { video } = await getVideo({
    supabase,
    videoId: params.id,
    session,
  });

  if (!video) {
    throw new Error("Could not find video specified.");
  }

  return {
    video,
    startSeconds:
      urlStartSeconds === 0
        ? null
        : isVideoWithTimestamp(video)
          ? video.video_start_seconds
          : urlStartSeconds,
  };
};
