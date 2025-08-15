import {
  getPlaylistData,
  isUserPlaylist,
  updatePlaylistImage,
  updatePlaylistInfo,
  uploadPlaylistImage,
  cropAndUploadYouTubeThumbnail,
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
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { generatePlaylistImageUrl } from '$lib/server/image-processing';
import { getProfileById } from '$lib/supabase/user-profiles';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  url,
  parent,
  params,
  depends,
  request,
}) => {
  // Remove automatic dependencies - we'll handle updates optimistically
  // Only keep video dependencies since those might come from other sources
  depends('supabase:db:videos', 'supabase:db:playlists');

  const { contentFilter } = await parent();

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  // ... rest of the load function stays the same
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
    superValidate(playlist, zod(playlistSchema)),
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
      isDeletingPlaylistImage,
      type,
      imageDataUrl,
      image_properties,
      thumbnailUrl,
      thumbnailMaxResUrl,
    } = form.data;

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

    // Handle image deletion
    if (isDeletingPlaylistImage) {
      const { error: deleteError } = await supabase
        .from('playlists')
        .update({
          image_url: null,
          image_webp_url: null,
          image_avif_url: null,
          image_properties: null,
        })
        .eq('id', id);

      if (deleteError) {
        console.error('Error deleting playlist image:', deleteError);
      }
    }

    // Handle new image upload if imageDataUrl is provided (frontend cropping scenario)
    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
      try {
        const uploadResult = await uploadPlaylistImage({
          playlistId: id,
          imageDataUrl,
          imageName: `playlist-${id}-${Date.now()}.jpg`,
          // Don't pass imageProperties since the image is already cropped
          supabase,
        });

        if (uploadResult.error) {
          console.error('Image upload error:', uploadResult.error);
          setFlash(
            {
              type: 'error',
              message: 'Failed to upload image. Please try again.',
            },
            cookies
          );
          return fail(400, { form });
        }

        setFlash(
          {
            type: 'success',
            message: 'Playlist image uploaded successfully.',
          },
          cookies
        );
      } catch (error) {
        console.error('Image processing error:', error);
        setFlash(
          {
            type: 'error',
            message: 'Failed to process image. Please try again.',
          },
          cookies
        );
        return fail(400, { form });
      }
    }
    // Handle YouTube thumbnail cropping scenario
    else if ((thumbnailUrl || thumbnailMaxResUrl) && image_properties) {
      try {
        const cropResult = await cropAndUploadYouTubeThumbnail({
          playlistId: id,
          thumbnailUrl,
          thumbnailMaxResUrl,
          imageProperties: image_properties,
          supabase,
        });

        if (cropResult.error) {
          console.error('YouTube thumbnail crop error:', cropResult.error);
          setFlash(
            {
              type: 'error',
              message: 'Failed to crop and upload thumbnail. Please try again.',
            },
            cookies
          );
          return fail(400, { form });
        }

        setFlash(
          {
            type: 'success',
            message: 'Playlist thumbnail cropped and uploaded successfully.',
          },
          cookies
        );
      } catch (error) {
        console.error('YouTube thumbnail processing error:', error);
        setFlash(
          {
            type: 'error',
            message: 'Failed to process thumbnail. Please try again.',
          },
          cookies
        );
        return fail(400, { form });
      }
    }

    // Update playlist info (no need to pass image_properties since we're storing the final image)
    const { updatedPlaylist } = await updatePlaylistInfo({
      playlistId: id,
      name,
      description,
      imageProperties: null, // Clear any old crop properties
      type,
      supabase,
      session,
    });

    // Return the updated playlist data for optimistic updates
    return {
      updatedPlaylist,
      form,
      success: true,
    };
  },
};
