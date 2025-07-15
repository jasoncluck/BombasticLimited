import {
  getPlaylistByShortId,
  getPlaylistTotalDuration,
  getPlaylistVideos,
  isUserPlaylist,
  updatePlaylistImage,
  updatePlaylistInfo,
  type Playlist,
  type ProfilePlaylist,
  type UserPlaylist,
} from "$lib/supabase/playlists";
import { redirect, type Actions, type RequestEvent } from "@sveltejs/kit";
import type { PageServerLoad } from "../[shortId]/$types";
import { fail, superValidate } from "sveltekit-superforms";
import { playlistSchema } from "./schema";
import { zod } from "sveltekit-superforms/adapters";
import {
  isPlaylistVideosFilter,
  type PlaylistVideosFilter,
} from "$lib/components/content/content-filter";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";
import { DEFAULT_NUM_VIDEOS_PAGINATION } from "$lib/supabase/videos";
import { parseImageProperties } from "$lib/components/playlist/playlist";
import { getPaginationQueryParams } from "$lib/components/pagination/pagination";
import { Filter } from "bad-words";
import { redirect, setFlash } from "sveltekit-flash-message/server";

export const load: PageServerLoad = async ({
  locals: { supabase },
  url,
  parent,
  params,
  depends,
}) => {
  depends("supabase:db:videos");

  const { playlists, contentFilter } = await parent();

  let playlist: Playlist | UserPlaylist | ProfilePlaylist | null;

  playlist =
    playlists.find((playlist) => playlist.short_id === params.shortId) ?? null;

  // If not found in array, fetch from API
  if (!playlist) {
    ({ playlist } = await getPlaylistByShortId({
      shortId: params.shortId,
      supabase,
    }));
  }

  // If the playlist already has a set filter, use that
  let playlistVideosSavedContentFilter: PlaylistVideosFilter | undefined;
  if (isUserPlaylist(playlist) && playlist?.sorted_by && playlist?.sort_order) {
    playlistVideosSavedContentFilter = {
      type: "playlist",
      sort: {
        key: playlist.sorted_by,
        order: playlist.sort_order,
      },
    };
  }

  if (!playlist) {
    console.error(`Playlist was not found`);
    redirect(302, "/");
  }

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { videos, count: videosCount } = await getPlaylistVideos({
    supabase,
    currentPage,
    limit: DEFAULT_NUM_VIDEOS_PAGINATION,
    contentFilter: playlistVideosSavedContentFilter
      ? playlistVideosSavedContentFilter
      : contentFilter,
    playlistId: playlist.id,
  });

  // Calculate total duration for all videos
  const playlistDuration = await getPlaylistTotalDuration({
    playlistId: playlist.id,
    supabase,
  });

  if (!playlist.processedImageUrl) {
    playlist.processedImageUrl = await getCroppedPlaylistImageUrlServer({
      imageProperties: parseImageProperties(playlist.image_properties),
      thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
      thumbnailUrl: playlist.thumbnail_url,
    });
  }

  return {
    playlist,
    playlists,
    videos,
    videosCount,
    contentFilter: playlistVideosSavedContentFilter
      ? playlistVideosSavedContentFilter
      : contentFilter,
    currentPage,
    playlistDuration,
    form: await superValidate(playlist, zod(playlistSchema)),
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

    if (name && filter.isProfane(name)) {
      setFlash(
        {
          type: "error",
          message:
            "Offensisve langage detected in playlist name, unable to create playlist.",
        },
        cookies,
      );
      return fail(400, { form });
    }

    if (description && filter.isProfane(description)) {
      setFlash(
        {
          type: "error",
          message:
            "Offensisve langage detected in playlist description, unable to create playlist.",
        },
        cookies,
      );
      return fail(400, { form });
    }

    let { image_properties } = form.data;

    if (isDeletingPlaylistImage) {
      await updatePlaylistImage({
        playlistId: id,
        thumbnailMaxResUrl: null,
        thumbnailUrl: null,
        supabase,
      });
    }

    if (type === "Official") {
      throw new Error("Unable to create Official playlists.");
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
