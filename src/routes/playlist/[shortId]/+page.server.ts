import {
  getPlaylistData,
  isUserPlaylist,
  updatePlaylistImage,
  updatePlaylistInfo,
  type PlaylistVideo,
} from "$lib/supabase/playlists";
import { type Actions, type RequestEvent } from "@sveltejs/kit";
import type { PageServerLoad } from "../[shortId]/$types";
import { fail, superValidate } from "sveltekit-superforms";
import { playlistSchema } from "./schema";
import { zod } from "sveltekit-superforms/adapters";
import {
  isPlaylistVideosFilter,
  type SortKey,
  type SortOrder,
} from "$lib/components/content/content-filter";
import { DEFAULT_NUM_VIDEOS_PAGINATION } from "$lib/supabase/videos";
import { parseImageProperties } from "$lib/components/playlist/playlist";
import { getPaginationQueryParams } from "$lib/components/pagination/pagination";
import { Filter } from "bad-words";
import { redirect, setFlash } from "sveltekit-flash-message/server";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  url,
  parent,
  params,
  depends,
}) => {
  depends("supabase:db:videos");

  const { playlists, contentFilter } = await parent();

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  // Process pagination params synchronously
  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });
  console.log(params.shortId);

  // Check if user has explicitly changed the sort from the URL
  const hasExplicitSortInUrl =
    url.searchParams.has("sort") || url.searchParams.has("order");

  // Always fetch fresh data using the single getPlaylistData call
  const [
    { playlist, videos, videosCount, playlistDuration },
    // We'll create the form after we get the playlist data
  ] = await Promise.all([
    // Get everything in single call
    // Only override saved sort if user explicitly changed it via URL
    getPlaylistData({
      shortId: params.shortId,
      contentFilter,
      currentPage,
      limit: DEFAULT_NUM_VIDEOS_PAGINATION,
      supabase,
      session,
    }),
  ]);

  if (!playlist) {
    console.error(`Playlist was not found`);
    redirect(302, "/");
  }

  // Now process image and create form with the fresh playlist data
  const [processedImageUrl, form] = await Promise.all([
    playlist.processedImageUrl
      ? Promise.resolve(playlist.processedImageUrl)
      : getCroppedPlaylistImageUrlServer({
          imageProperties: parseImageProperties(playlist.image_properties),
          thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
          thumbnailUrl: playlist.thumbnail_url,
        }),
    superValidate(playlist, zod(playlistSchema)),
  ]);

  // Update playlist with processed image URL if it was generated
  if (!playlist.processedImageUrl) {
    playlist.processedImageUrl = processedImageUrl;
  }

  // Determine the effective content filter (what was actually used for sorting)
  const effectiveContentFilter =
    isUserPlaylist(playlist) &&
    playlist.sorted_by &&
    playlist.sort_order &&
    !hasExplicitSortInUrl
      ? {
          type: "playlist" as const,
          sort: {
            key: playlist.sorted_by as SortKey<PlaylistVideo>,
            order: playlist.sort_order as SortOrder,
          },
        }
      : contentFilter;

  return {
    playlist,
    playlists, // Still return the cached playlists for other uses
    videos,
    videosCount,
    contentFilter: effectiveContentFilter,
    currentPage,
    playlistDuration,
    form,
  };
};

export const actions: Actions = {
  default: async ({
    request,
    locals: { supabase, session },
    cookies,
  }: RequestEvent) => {
    if (!session) {
      redirect(302, "/auth");
    }

    const form = await superValidate(request, zod(playlistSchema));
    if (!form.valid) {
      return fail(400, {
        form,
      });
    }

    const { name, description, id, isDeletingPlaylistImage, type } = form.data;

    const filter = new Filter();
    // Run profanity checks in parallel
    const [nameIsProfane, descriptionIsProfane] = await Promise.all([
      name ? Promise.resolve(filter.isProfane(name)) : Promise.resolve(false),
      description
        ? Promise.resolve(filter.isProfane(description))
        : Promise.resolve(false),
    ]);

    if (nameIsProfane) {
      setFlash(
        {
          type: "error",
          message:
            "Offensisve langage detected in playlist name, unable to update playlist.",
        },
        cookies,
      );
      return fail(400, { form });
    }

    if (descriptionIsProfane) {
      setFlash(
        {
          type: "error",
          message:
            "Offensisve langage detected in playlist description, unable to update playlist.",
        },
        cookies,
      );
      return fail(400, { form });
    }

    let { image_properties } = form.data;

    // Handle image deletion if needed
    if (isDeletingPlaylistImage) {
      await updatePlaylistImage({
        playlistId: id,
        thumbnailMaxResUrl: null,
        thumbnailUrl: null,
        supabase,
      });
    }

    if (
      image_properties?.x === 0 &&
      image_properties?.y === 0 &&
      image_properties?.height === 0 &&
      image_properties?.width === 0
    ) {
      image_properties = null;
    }

    const { updatedPlaylist } = await updatePlaylistInfo({
      playlistId: id,
      name,
      description,
      imageProperties: image_properties,
      type,
      supabase,
      session,
    });

    return {
      updatedPlaylist,
      form,
    };
  },
};
