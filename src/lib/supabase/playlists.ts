import { showNotification } from "$lib/stores/notification";
import type {
  PostgrestError,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database, Json, Tables } from "./database.types";
import { invalidate } from "$app/navigation";
import {
  SORT_OPTIONS_PLAYLIST_VIDEOS,
  type PlaylistVideosFilter,
  type SortKey,
  type SortOrder,
} from "$lib/components/content/content-filter";
import type { CropArea } from "svelte-easy-crop";
import { DEFAULT_NUM_VIDEOS_OVERVIEW, type Video } from "./videos";
import type { Source } from "$lib/constants/source";
import { videoDurationToSeconds } from "$lib/components/video/video-service";

export const DEFAULT_NUM_PLAYLISTS_OVERVIEW = 5;
export const DEFAULT_NUM_PLAYLISTS_PAGINATION = 15;
export const PLAYLIST_VIDEO_LIMIT = 100;

export type Playlist = Omit<Tables<"playlists">, "search_vector"> & {
  processedImageUrl?: string | null;
};

export type ProfilePlaylist = Playlist & {
  profile_username: string;
} & Playlist;

export type UserPlaylist = ProfilePlaylist & {
  // User playlist specific fields from user_playlists table
  playlist_position: number | null;
  sorted_by: string;
  created_by: string;
  sort_order: string;
};

export type PlaylistVideo = Tables<"playlist_videos">;
export const PLAYLIST_TYPES = ["Public", "Private"] as const;
export type PlaylistType = (typeof PLAYLIST_TYPES)[number];

// Flattened rpc return
export type PlaylistVideoWithTimestamp = {
  id: string;
  video_position: number;
  source: Source;
  title: string;
  description: string;
  thumbnail_url: string;
  thumbnail_maxres_url: string;
  published_at: string;
  duration: string;
  video_start_seconds: number | null;
  updated_at: string | null;
};

export interface PlaylistImageProperties {
  x: number;
  y: number;
  height: number;
  width: number;
}

export async function getPlaylistByShortId({
  shortId,
  supabase,
}: {
  shortId: string;
  supabase: SupabaseClient<Database>;
}): Promise<{
  playlist: ProfilePlaylist | null;
  error: PostgrestError | null;
}> {
  const { data, error } = await supabase
    .rpc("get_playlist_by_short_id", {
      p_short_id: shortId,
    })
    .single();

  if (error || !data) {
    console.error("Error fetching playlist from short ID.", error);
  }
  return { playlist: data, error };
}

export async function getPlaylistsForUsername({
  username,
  currentPage = 1,
  limit = DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  supabase,
}: {
  username: string;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
}): Promise<{
  playlists: Playlist[];
  count?: number | null;
  error: PostgrestError | null;
}> {
  const query = supabase
    .rpc(
      "get_user_playlists",
      {
        p_username: username,
      },
      { count: "exact" },
    )
    .order("name", { ascending: true })
    .limit(limit)
    .select();

  if (limit) {
    query.limit(limit);
  }

  if (currentPage && currentPage > 1) {
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit - 1;
    query.range(startIndex, endIndex);
  }

  const { data: playlists, count, error } = await query;

  if (error || !playlists) {
    console.error(`Error fetching playlists for username: ${username}.`, error);
    return { playlists: [], error };
  }
  return { playlists, count, error };
}

export async function getPlaylistByYoutubeId({
  youtubeId,
  supabase,
}: {
  youtubeId: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await supabase
    .rpc("get_playlist_by_youtube_id", {
      p_youtube_id: youtubeId,
    })
    .single();

  if (error || !data) {
    console.error(
      `Error fetching playlist from Youtube ID: ${youtubeId}`,
      error,
    );
  }
  return { playlist: data, error };
}

export async function getPlaylistVideo({
  playlistId,
  videoId,
  supabase,
}: {
  playlistId: number;
  videoId: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: video, error } = await supabase
    .rpc("get_playlist_videos", { p_playlist_id: playlistId })
    .eq("id", videoId)
    .single();

  if (error) {
    console.error("Error fetching playlist video:", error);
  }

  return { video, error };
}

export async function getPlaylistVideos({
  playlistId,
  contentFilter,
  currentPage = 1,
  currentVideo,
  limit = DEFAULT_NUM_VIDEOS_OVERVIEW,
  supabase,
}: {
  playlistId: number;
  contentFilter: PlaylistVideosFilter;
  limit?: number;
  currentPage?: number | null;
  currentVideo?: PlaylistVideoWithTimestamp | null;
  videosCount?: number | null;
  supabase: SupabaseClient<Database>;
}) {
  const sortOptionInfo = SORT_OPTIONS_PLAYLIST_VIDEOS[contentFilter.sort.key];

  const query = supabase.rpc(
    "get_playlist_videos",
    {
      p_playlist_id: playlistId,
    },
    { count: "exact" },
  );

  if (limit) {
    query.limit(limit);
  }

  // Sorting by playlist order
  query.order(sortOptionInfo.tableColumn, {
    ascending:
      contentFilter.sort.key === "playlistOrder" ||
      contentFilter.sort.order === "ascending",
  });

  // NOTE: Removing date filters for now
  // if (contentFilter.sort.key !== "playlistOrder" && contentFilter.startDate) {
  //   try {
  //     // Parse the input date string and explicitly set it to midnight (local time)
  //     const startDate = new Date(`${contentFilter.startDate}T00:00:00`);
  //     query.gte("published_at", startDate.toISOString());
  //   } catch {
  //     console.error("Unable to parse start date, ignoring.");
  //   }
  // }
  // if (contentFilter.sort.key !== "playlistOrder" && contentFilter.endDate) {
  //   try {
  //     // Parse the input date string and set it to the end of the day (local time)
  //     const endDate = new Date(`${contentFilter.endDate}T23:59:59.999`);
  //     query.lte("published_at", endDate.toISOString());
  //   } catch {
  //     console.error("Unable to parse end date, ignoring.");
  //   }
  // }

  if (currentPage && currentPage > 1) {
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit - 1;
    query.range(startIndex, endIndex);
  }

  if (currentVideo) {
    const sortColumn =
      SORT_OPTIONS_PLAYLIST_VIDEOS[contentFilter.sort.key].tableColumn;

    if (contentFilter.sort.order === "ascending") {
      query.gt(sortColumn, currentVideo[sortColumn]);
    } else {
      query.lt(sortColumn, currentVideo[sortColumn]);
    }
  }

  const { data: videos, count, error } = await query;

  if (error) {
    console.error("Error fetching playlist videos:", error);
    return { videos: [], error };
  }

  return { videos, count, error };
}

export async function createPlaylist({
  name,
  session,
  supabase,
}: {
  name: string;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session) {
    throw new Error("Unable to create playlist, invalid session");
  }

  const { data: playlist, error } = await supabase
    .rpc("insert_playlist", {
      p_name: name,
      p_created_by: session?.user.id,
      p_type: "Private",
    })
    .single();

  if (error) {
    console.error("Error creating playlist:", error);

    if (error.code === "P0001") {
      showNotification(
        "Unable to create playlist, a maximum of 25 playlists can be created or followed.",
        "error",
      );
    } else {
      showNotification("Error creating playlist", "error");
    }
  }

  return { playlist, error };
}

export async function getUserPlaylists({
  session,
  supabase,
}: {
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): Promise<{
  userPlaylists: UserPlaylist[];
  count: number | null;
  error: PostgrestError | null;
}> {
  if (!session) {
    return { userPlaylists: [], count: null, error: null };
  }

  const { data, count, error } = await supabase
    .rpc("get_user_playlists", { p_user_id: session.user.id })
    .order("playlist_position", { ascending: false });

  if (error) {
    console.error("Error when fetching playlists:", error);
  }

  return { userPlaylists: data ?? [], count, error };
}

export async function updatePlaylistPosition({
  playlistId,
  position,
  supabase,
  session,
}: {
  playlistId: number;
  position: number;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { error } = await supabase.rpc("update_playlist_position", {
    p_playlist_id: playlistId,
    p_user_id: session.user.id,
    p_new_position: position,
  });

  if (error) {
    console.error(error);
  }

  return { error };
}

export async function deletePlaylist({
  playlistId,
  session,
  supabase,
}: {
  playlistId: number;
  session: Session;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase.rpc("delete_playlist", {
    p_playlist_id: playlistId,
    p_user_id: session.user.id,
  });

  if (error) {
    console.error("Error when deleting playlists:", error);
  }

  invalidate("supabase:db:playlists");

  return { error };
}

export async function searchPlaylists({
  searchString,
  limit = 15,
  currentPage = 1,
  supabase,
}: {
  searchString: string;
  limit?: number;
  currentPage?: number;
  supabase: SupabaseClient<Database>;
}): Promise<{
  playlists: ProfilePlaylist[];
  error: PostgrestError | null;
  count?: number | null;
}> {
  const query = supabase
    .rpc(
      "search_playlists",
      {
        search_term: searchString,
      },
      { count: "exact" },
    )
    .limit(limit);

  const { data: playlists, error, count } = await query;

  if (currentPage && currentPage > 1) {
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit - 1;
    query.range(startIndex, endIndex);
  }

  if (error) {
    showNotification(
      "Encountered an error when searching playlists and was unable to complete the request.",
      "error",
    );
  }
  return { playlists: playlists ?? [], error, count };
}

export async function addVideosToPlaylist({
  playlistId,
  videoIds,
  supabase,
}: {
  playlistId: number;
  videoIds: string[];
  position?: number;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { error } = await supabase.rpc("insert_playlist_videos", {
    p_playlist_id: playlistId,
    p_video_ids: videoIds,
  });

  if (error) {
    console.error(error);
    invalidate("supabase:db:playlists");
  }

  return { error };
}

export async function updatePlaylistVideoPosition({
  videoIds,
  playlistId,
  position,
  supabase,
}: {
  playlistId: number;
  videoIds: string[];
  position: number;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase.rpc("update_playlist_videos_positions", {
    p_playlist_id: playlistId,
    p_video_ids: videoIds,
    p_new_position: position,
  });

  if (error) {
    console.error(error);
    invalidate("supabase:db:playlists");
  }

  return { error };
}

export async function deleteVideosFromPlaylist({
  playlistId,
  videoIds,
  supabase,
}: {
  playlistId: number;
  videoIds: string[];
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase
    .rpc("delete_playlist_videos", {
      p_playlist_id: playlistId,
      p_video_ids: videoIds,
    })
    .select();

  if (error) {
    console.error(error);
    invalidate("supabase:db:playlists");
  }

  return { error };
}

export async function updatePlaylistInfo({
  playlistId,
  name,
  description,
  imageProperties,
  type,
  supabase,
}: {
  playlistId: number;
  name: string;
  description: string | null;
  session: Session;
  imageProperties: CropArea | null;
  type: PlaylistType;
  supabase: SupabaseClient<Database>;
}) {
  const { data: updatedPlaylist, error } = await supabase
    .from("playlists")
    .update({
      name: name.trim(),
      description: description?.trim(),
      image_properties: imageProperties as Json,
      type,
    })
    .eq("id", playlistId)
    .select()
    .single();

  if (error) {
    console.error(error);
  }

  return { updatedPlaylist, error };
}

export async function updatePlaylistImage({
  playlistId,
  thumbnailUrl,
  thumbnailMaxResUrl,
  supabase,
}: {
  playlistId: number;
  thumbnailUrl: string | null;
  thumbnailMaxResUrl: string | null;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = thumbnailUrl === null && thumbnailMaxResUrl === null;
  if (isResetImage) {
    const { error } = await supabase
      .from("playlists")
      .update({
        thumbnail_url: null,
        thumbnail_maxres_url: null,
        image_properties: null,
      })
      .eq("id", playlistId)
      .select();

    return { error };
  }

  const { data: isValid, error: validationError } = await supabase.rpc(
    "validate_playlist_thumbnail_urls",
    {
      p_playlist_id: playlistId,
      p_thumbnail_maxres_url: thumbnailMaxResUrl ?? undefined,
      p_thumbnail_url: thumbnailUrl ?? undefined,
    },
  );

  if (validationError) {
    console.error("Error validating URLs:", validationError);
    return { error: validationError };
  }

  if (!isValid) {
    const error = {
      message: "Invalid image URLs. URLs must be from videos in this playlist.",
      code: "invalid_image_urls",
    };

    console.error(error);
    return { error };
  }

  const { data: updatedPlaylist, error: updateError } = await supabase
    .from("playlists")
    .update({
      thumbnail_url: thumbnailUrl,
      thumbnail_maxres_url: thumbnailMaxResUrl,
      image_properties: null,
    })
    .eq("id", playlistId)
    .select()
    .single();

  if (updateError) {
    console.error("Error updating playlist:", updateError);
  }

  return { updatedPlaylist, error: updateError };
}

export async function followPlaylist({
  playlistId,
  supabase,
  session,
  position,
}: {
  playlistId: number;
  supabase: SupabaseClient<Database>;
  session: Session;
  position?: number;
}) {
  const { error } = await supabase
    .rpc("follow_playlist", {
      p_playlist_id: playlistId,
      p_user_id: session.user.id,
      p_playlist_position: position,
    })
    .select();

  if (error) {
    console.error(error);
  }

  return { error };
}

export async function unfollowPlaylist({
  playlistId,
  supabase,
  session,
}: {
  playlistId: number;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { error } = await supabase
    .rpc("unfollow_playlist", {
      p_playlist_id: playlistId,
      p_user_id: session.user.id,
    })
    .select();

  if (error) {
    console.error(error);
  }

  return { error };
}

export async function updatePlaylistSort({
  playlistId,
  sortedBy,
  sortOrder,
  supabase,
}: {
  playlistId: number;
  sortedBy: SortKey<PlaylistVideo>;
  sortOrder: SortOrder;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { data: updatedPlaylist, error } = await supabase
    .from("user_playlists")
    .update({
      sorted_by: sortedBy,
      sort_order: sortOrder,
    })
    .eq("id", playlistId)
    .select()
    .single();

  if (error) {
    console.error("Error updating playlist sort:", error);
  }

  return { updatedPlaylist, error };
}

export async function getPlaylistTotalDuration({
  supabase,
  playlistId,
}: {
  supabase: SupabaseClient;
  playlistId: number;
}): Promise<{ hours: number; minutes: number; seconds: number }> {
  // First, get all video IDs in the playlist
  const { data: playlistVideos, error: playlistError } = await supabase
    .from("playlist_videos")
    .select("video_id")
    .eq("playlist_id", playlistId);

  if (playlistError) {
    console.error("Error fetching playlist videos:", playlistError);
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  if (!playlistVideos || playlistVideos.length === 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  // Extract video IDs
  const videoIds = playlistVideos.map((pv) => pv.video_id);

  // Then, get durations for those videos
  const { data: videos, error: videosError } = await supabase
    .from("videos")
    .select("duration")
    .in("id", videoIds);

  if (videosError) {
    console.error("Error fetching video durations:", videosError);
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  let totalSeconds = 0;
  for (const video of videos || []) {
    if (video.duration) {
      // Use your existing function to parse PT15M10S format
      totalSeconds += videoDurationToSeconds(video.duration);
    }
  }

  // Convert total seconds to hours, minutes, seconds
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

export function isPlaylistVideo(video: Video): video is Video & PlaylistVideo {
  return !!video && "video_position" in video;
}

// Helper for checking plain objects
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function isPlaylist(obj: unknown): obj is Playlist {
  return (
    isRecord(obj) &&
    typeof obj.id === "number" &&
    typeof obj.created_at === "string" &&
    typeof obj.created_by === "string" &&
    (typeof obj.description === "string" || obj.description === null) &&
    "image_properties" in obj && // Accepts any (Json)
    typeof obj.name === "string" &&
    typeof obj.short_id === "string" &&
    (typeof obj.thumbnail_maxres_url === "string" ||
      obj.thumbnail_maxres_url === null) &&
    (typeof obj.thumbnail_url === "string" || obj.thumbnail_url === null) &&
    typeof obj.type === "string" &&
    typeof obj.updated_at === "string" &&
    (typeof obj.youtube_id === "string" || obj.youtube_id === null)
  );
}

export function isUserPlaylist(obj: unknown): obj is UserPlaylist {
  return (
    isRecord(obj) &&
    typeof obj.id === "number" &&
    (typeof obj.playlist_position === "number" ||
      obj.playlist_position === null) &&
    typeof obj.sorted_by === "string" && // playlist_sorted_by enum
    typeof obj.sort_order === "string" && // playlist_sort_order enum
    // Playlist data (joined from playlists table)
    typeof obj.name === "string" &&
    typeof obj.short_id === "string" &&
    typeof obj.created_at === "string" &&
    typeof obj.created_by === "string" &&
    (typeof obj.description === "string" || obj.description === null) &&
    "image_properties" in obj && // Accepts any (Json)
    (typeof obj.thumbnail_maxres_url === "string" ||
      obj.thumbnail_maxres_url === null) &&
    (typeof obj.thumbnail_url === "string" || obj.thumbnail_url === null) &&
    typeof obj.type === "string" &&
    (typeof obj.youtube_id === "string" || obj.youtube_id === null)
  );
}
