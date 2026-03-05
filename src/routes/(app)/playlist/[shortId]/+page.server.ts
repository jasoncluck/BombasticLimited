import {
  getPlaylistData,
  isUserPlaylist,
  parseImageProperties,
  updatePlaylistThumbnail,
  updatePlaylistInfo,
  type PlaylistImageProperties,
  type PlaylistVideo,
} from '$lib/supabase/playlists';
import { type Actions, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from '../[shortId]/$types';
import { fail, superValidate } from 'sveltekit-superforms';
import { playlistSchema } from '$lib/schema/playlist-schema';
import { zod } from 'sveltekit-superforms/adapters';
import {
  isPlaylistVideosFilter,
  type SortKey,
  type SortOrder,
  type PlaylistVideosFilter,
} from '$lib/components/content/content-filter';
import { DEFAULT_NUM_VIDEOS_PAGINATION } from '$lib/supabase/videos';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import { Filter } from 'bad-words';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { getProfileById } from '$lib/supabase/user-profiles';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

export const load: PageServerLoad = async ({
  locals: { supabase },
  url,
  parent,
  params,
  depends,
}) => {
  depends('supabase:db:videos', 'supabase:db:playlists');

  const { contentFilter, preferredImageFormat } = await parent();

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  // Check if URL has explicit sort parameters
  const hasExplicitSortInUrl =
    url.searchParams.has('sort') ||
    url.searchParams.has('order') ||
    url.searchParams.has('playlistOrder') ||
    url.searchParams.has('datePublished') ||
    url.searchParams.has('title');

  const { playlist, videos, videosCount, playlistDuration } =
    await getPlaylistData({
      shortId: params.shortId,
      contentFilter,
      currentPage,
      limit: DEFAULT_NUM_VIDEOS_PAGINATION,
      preferredImageFormat,
      supabase,
    });

  if (!playlist) {
    console.error(`Playlist was not found`);
    redirect(302, '/');
  }

  // If the image URL hasn't been uploaded yet process it
  if (!playlist.image_url) {
    playlist.image_url = await getCroppedPlaylistImageUrlServer({
      thumbnailUrl: playlist.thumbnail_url ?? undefined,
      imageProperties: parseImageProperties(playlist.image_properties),
    });
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

  // FIXED: Priority order - URL params first, then user playlist settings, then defaults
  const effectiveContentFilter: PlaylistVideosFilter = (() => {
    // If URL has explicit sort parameters, use the current contentFilter (which was built from URL)
    if (hasExplicitSortInUrl) {
      return contentFilter;
    }

    // If no URL params but playlist has user settings, use those
    if (isUserPlaylist(playlist) && playlist.sorted_by && playlist.sort_order) {
      return {
        type: 'playlist' as const,
        sort: {
          key: playlist.sorted_by as SortKey<PlaylistVideo>,
          order: playlist.sort_order as SortOrder,
        },
        startDate: contentFilter.startDate,
        endDate: contentFilter.endDate,
      };
    }

    // Fall back to defaults (playlistOrder ascending)
    return {
      type: 'playlist' as const,
      sort: {
        key: 'playlistOrder' as SortKey<PlaylistVideo>,
        order: 'ascending' as SortOrder,
      },
      startDate: contentFilter.startDate,
      endDate: contentFilter.endDate,
    };
  })();

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
    locals: { supabase },
    cookies,
    params,
  }: RequestEvent) => {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (!claimsData?.claims || claimsError) {
      redirect(302, '/auth/login');
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
    });

    if (!currentPlaylist) {
      return fail(404, { form });
    }

    if (isDeletingPlaylistImage) {
      await updatePlaylistThumbnail({
        playlistId: id,
        imageProperties: null,
        thumbnailUrl: null,
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

      // Only update image if something image-related has changed
      if (hasImagePropertiesChanged || hasThumbnailChanged) {
        await updatePlaylistThumbnail({
          playlistId: id,
          imageProperties: image_properties,
          thumbnailUrl: thumbnail_url,
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
    });

    // Return the updated playlist data for optimistic updates
    return {
      form,
      success: true,
    };
  },
};
