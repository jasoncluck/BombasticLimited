import { getVideo, incrementVideoView } from '$lib/supabase/videos';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({
  locals: { supabase, session },
  params,
}) => {
  const videoId = params.id;
  const { video } = await getVideo({
    supabase,
    videoId,
    session,
  });

  if (!video) {
    throw new Error('Could not find video specified.');
  }

  incrementVideoView({ videoId, supabase });

  return {
    video,
  };
};
