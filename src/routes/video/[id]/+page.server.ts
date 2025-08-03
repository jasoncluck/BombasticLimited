import { getVideo } from '$lib/supabase/videos';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({
  locals: { supabase, session },
  params,
}) => {
  const { video } = await getVideo({
    supabase,
    videoId: params.id,
    session,
  });

  if (!video) {
    throw new Error('Could not find video specified.');
  }

  return {
    video,
  };
};
