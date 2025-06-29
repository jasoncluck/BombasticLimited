import {
  getPlaylistByShortId,
  getPlaylistVideos,
  updatePlaylistImage,
  updatePlaylistInfo,
} from "$lib/supabase/playlists";
import { redirect, type Actions, type RequestEvent } from "@sveltejs/kit";
import type { PageServerLoad } from "../[shortId]/$types";
import { fail, superValidate } from "sveltekit-superforms";
import { playlistSchema } from "./schema";
import { zod } from "sveltekit-superforms/adapters";
import {
  videoDurationSecondsToTime,
  videoDurationToSeconds,
} from "$lib/components/video/video-service";
import { isPlaylistVideosFilter } from "$lib/components/content/content-filter";
import { getPaginationQueryParams } from "$lib/components/content/pagination/content-pagination";

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  url,
  parent,
  params,
  depends,
}) => {
  depends("supabase:db:videos");
  if (!session) {
    redirect(302, "/auth");
  }

  const { playlists, contentFilter } = await parent();

  const { playlist: profilePlaylist } = await getPlaylistByShortId({
    shortId: params.shortId,
    supabase,
  });
  if (!profilePlaylist) {
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
    contentFilter,
    playlistId: profilePlaylist.id,
  });

  // Calculate total duration for all videos
  let playlistDurationSeconds = 0;
  for (const video of videos) {
    playlistDurationSeconds += videoDurationToSeconds(video.duration);
  }

  const playlistDuration = videoDurationSecondsToTime(playlistDurationSeconds);

  return {
    profilePlaylist,
    playlists,
    videos,
    videosCount,
    contentFilter,
    currentPage,
    playlistDuration,
    form: await superValidate(profilePlaylist, zod(playlistSchema)),
  };
};

export const actions: Actions = {
  default: async ({ request, locals: { supabase, session } }: RequestEvent) => {
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
    let { imageProperties } = form.data;

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
      imageProperties?.x === 0 &&
      imageProperties?.y === 0 &&
      imageProperties?.height === 0 &&
      imageProperties?.width === 0
    ) {
      imageProperties = null;
    }

    const { updatedPlaylist } = await updatePlaylistInfo({
      playlistId: id,
      name,
      description,
      imageProperties,
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
