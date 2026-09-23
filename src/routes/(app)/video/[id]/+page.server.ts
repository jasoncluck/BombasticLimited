import { getVideo, incrementVideoView } from '$lib/neon/videos';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  locals: { neon, userId },
  parent,
  params,
}) => {
  const videoId = params.id;

  const { preferredImageFormat } = await parent();

  const { video } = await getVideo({
    neon,
    userId,
    videoId,
    preferredImageFormat,
  });

  if (!video) {
    throw new Error('Could not find video specified.');
  }

  incrementVideoView({ videoId, neon });

  return {
    video,
  };
};
