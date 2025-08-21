import { getVideo, incrementVideoView } from '$lib/supabase/videos';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  params,
  request,
}) => {
  const videoId = params.id;

  // Detect optimal image format from Accept header
  const acceptHeader = request.headers.get('accept');
  const preferredImageFormat = detectOptimalFormat(acceptHeader);

  const { video } = await getVideo({
    supabase,
    videoId,
    session,
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
