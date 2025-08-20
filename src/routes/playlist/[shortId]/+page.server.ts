import {
  getPlaylistData,
  isUserPlaylist,
  parseImageProperties,
  updatePlaylistImage,
  updatePlaylistInfo,
  type PlaylistImageProperties,
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
import { detectOptimalFormat } from '$lib/utils/image-format-detection';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  url,
  parent,
  params,
  request,
  depends,
}) => {
  depends('supabase:db:videos', 'supabase:db:playlists');

  const acceptHeader = request.headers.get('accept');

  // Detect optimal image format from Accept header
  const preferredImageFormat = detectOptimalFormat(acceptHeader);

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
      preferredImageFormat,
      supabase,
      session,
    });

  if (!playlist) {
    console.error(`Playlist was not found`);
    redirect(302, '/');
  }

  const [form, creatorProfile] = await Promise.all([
    superValidate(
      {
        ...playlist,
        thumbnail_url: playlist.thumbnail_url,
      },
      zod(playlistSchema)
    ),
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

// Helper function to compare image properties
function imagePropertiesChanged(
  current: PlaylistImageProperties | null,
  submitted: PlaylistImageProperties | null
): boolean {
  // If both are null/undefined, no change
  if (!current && !submitted) return false;

  // If one is null and other isn't, there's a change
  if (!current || !submitted) return true;

  // Compare the actual values
  return (
    current.x !== submitted.x ||
    current.y !== submitted.y ||
    current.width !== submitted.width ||
    current.height !== submitted.height
  );
}

export const actions: Actions = {
  default: async ({
    request,
    locals: { supabase, session },
    cookies,
    params,
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

    // Get current playlist data to compare image properties
    const { playlist: currentPlaylist } = await getPlaylistData({
      shortId: params.shortId,
      currentPage: 1,
      limit: 1,
      preferredImageFormat: 'avif',
      supabase,
      session,
    });

    if (!currentPlaylist) {
      return fail(404, { form });
    }

    if (isDeletingPlaylistImage) {
      await updatePlaylistImage({
        playlistId: id,
        processedPlaylistImage: null,
        imageProperties: null,
        supabase,
      });
    } else {
      // Normalize zero values to null
      if (
        image_properties?.x === 0 &&
        image_properties?.y === 0 &&
        image_properties?.height === 0 &&
        image_properties?.width === 0
      ) {
        image_properties = null;
      }

      // Check if image properties have actually changed
      const hasImagePropertiesChanged = imagePropertiesChanged(
        parseImageProperties(currentPlaylist.image_properties),
        image_properties
      );

      // Check if thumbnail URLs have changed
      const hasThumbnailChanged =
        currentPlaylist.thumbnail_url !== thumbnail_url;

      // Only process image if something image-related has changed
      if (hasImagePropertiesChanged || hasThumbnailChanged) {
        const processedPlaylistImage = await getCroppedPlaylistImageUrlServer({
          thumbnailUrl: thumbnail_url,
          imageProperties: image_properties,
        });

        await updatePlaylistImage({
          playlistId: id,
          processedPlaylistImage,
          imageProperties: image_properties,
          thumbnailVideoId: thumbnail_video_id,
          supabase,
        });
      }
    }

    // Always update playlist info (name, description, type) regardless of image changes
    await updatePlaylistInfo({
      playlistId: id,
      name,
      description,
      imageProperties: image_properties,
      type,
      supabase,
      session,
    });

    // Return the updated playlist data for optimistic updates
    return {
      form,
      success: true,
    };
  },
};
