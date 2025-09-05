import { getVideo, incrementVideoView } from '$lib/supabase/videos';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  locals: { supabase },
  parent,
  params,
}) => {
  const videoId = params.id;

  const { preferredImageFormat } = await parent();

  const { video } = await getVideo({
    supabase,
    videoId,
    preferredImageFormat,
  });

  if (!video) {
    throw new Error('Could not find video specified.');
  }

  incrementVideoView({ videoId, supabase });

  return {
    video,
  };
};
