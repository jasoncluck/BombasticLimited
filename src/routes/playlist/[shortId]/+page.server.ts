import {
  getPlaylistData,
  isUserPlaylist,
  updatePlaylistImage,
  updatePlaylistInfo,
  type PlaylistVideo,
} from '$lib/supabase/playlists';
import { type Actions, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from '../[shortId]/$types';
import { fail, superValidate } from 'sveltekit-superforms';
import { playlistSchema } from './schema';
import { zod } from 'sveltekit-superforms/adapters';
import {
  isPlaylistVideosFilter,
  type SortKey,
  type SortOrder,
} from '$lib/components/content/content-filter';
import { DEFAULT_NUM_VIDEOS_PAGINATION } from '$lib/supabase/videos';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import { Filter } from 'bad-words';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { getProfileById } from '$lib/supabase/user-profiles';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  url,
  parent,
  params,
  depends,
}) => {
  depends('supabase:db:videos', 'supabase:db:playlists');

  const { contentFilter } = await parent();

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const hasExplicitSortInUrl =
    url.searchParams.has('sort') || url.searchParams.has('order');

  const { playlist, videos, videosCount, playlistDuration } =
    await getPlaylistData({
      shortId: params.shortId,
      contentFilter,
      currentPage,
      limit: DEFAULT_NUM_VIDEOS_PAGINATION,
      supabase,
      session,
    });

  if (!playlist) {
    console.error(`Playlist was not found`);
    redirect(302, '/');
  }

  const [form, creatorProfile] = await Promise.all([
    superValidate({
      ...playlist,
      thumbnail_video_id: playlist.thumbnail_video_id || undefined,
      thumbnail_url: playlist.thumbnail_url || undefined,
      thumbnail_maxres_url: playlist.thumbnail_maxres_url || undefined,
    }, zod(playlistSchema)),
    // Load creator profile for all playlists to ensure avatar is available
    getProfileById({ userId: playlist.created_by, supabase }).then(
      (result) => result.profile
    ),
  ]);

  const effectiveContentFilter =
    isUserPlaylist(playlist) &&
    playlist.sorted_by &&
    playlist.sort_order &&
    !hasExplicitSortInUrl
      ? {
          type: 'playlist' as const,
          sort: {
            key: playlist.sorted_by as SortKey<PlaylistVideo>,
            order: playlist.sort_order as SortOrder,
          },
        }
      : contentFilter;

  return {
    playlist,
    videos,
    videosCount,
    contentFilter: effectiveContentFilter,
    currentPage,
    playlistDuration,
    form,
    creatorProfile,
  };
};

export const actions: Actions = {
  default: async ({
    request,
    locals: { supabase, session },
    cookies,
  }: RequestEvent) => {
    if (!session) {
      redirect(302, '/auth');
    }

    const form = await superValidate(request, zod(playlistSchema));
    if (!form.valid) {
      return fail(400, {
        form,
      });
    }

    const {
      name,
      description,
      id,
      type,
      isDeletingPlaylistImage,
      thumbnail_video_id,
      thumbnail_maxres_url,
      thumbnail_url,
    } = form.data;
    let { image_properties } = form.data;

    const filter = new Filter();
    const [nameIsProfane, descriptionIsProfane] = await Promise.all([
      name ? Promise.resolve(filter.isProfane(name)) : Promise.resolve(false),
      description
        ? Promise.resolve(filter.isProfane(description))
        : Promise.resolve(false),
    ]);

    if (nameIsProfane) {
      setFlash(
        {
          type: 'error',
          message:
            'Offensive language detected in playlist name, unable to update playlist.',
        },
        cookies
      );
      return fail(400, { form });
    }

    if (descriptionIsProfane) {
      setFlash(
        {
          type: 'error',
          message:
            'Offensive language detected in playlist description, unable to update playlist.',
        },
        cookies
      );
      return fail(400, { form });
    }

    if (isDeletingPlaylistImage) {
      await updatePlaylistImage({
        playlistId: id,
        processedPlaylistImage: null,
        imageProperties: null,
        supabase,
      });
    } else {
      if (
        image_properties?.x === 0 &&
        image_properties?.y === 0 &&
        image_properties?.height === 0 &&
        image_properties?.width === 0
      ) {
        image_properties = null;
      }

      const processedPlaylistImage = await getCroppedPlaylistImageUrlServer({
        thumbnailUrl: thumbnail_url,
        thumbnailMaxResUrl: thumbnail_maxres_url,
        imageProperties: image_properties,
      });

      // With the new system, we don't need to pass the image URL through the form
      // The image is handled separately via the new database structure
      await updatePlaylistImage({
        playlistId: id,
        processedPlaylistImage,
        imageProperties: image_properties,
        thumbnailVideoId: thumbnail_video_id,
        supabase,
      });

      await updatePlaylistInfo({
        playlistId: id,
        name,
        description,
        imageProperties: image_properties,
        type,
        supabase,
        session,
      });
    }

    // Return the updated playlist data for optimistic updates
    return {
      form,
      success: true,
    };
  },
};
