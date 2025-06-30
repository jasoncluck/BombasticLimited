import { showNotification } from "$lib/stores/notification";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "./database.types";
import { invalidate } from "$app/navigation";
import {
  SORT_OPTIONS_PLAYLIST_VIDEOS,
  type PlaylistVideosFilter,
} from "$lib/components/content/content-filter";
import type { CropArea } from "svelte-easy-crop";
import { type Video } from "./videos";
import type { Source } from "$lib/constants/source";

export const PLAYLIST_VIDEO_LIMIT = 100;

export type Playlist = Omit<Tables<"playlists">, "search_vector"> & {
  croppedImageUrlData?: Promise<string | undefined>;
};

export type ProfilePlaylist = Playlist & { profile_username: string };

export type UserPlaylist = Omit<Tables<"user_playlists">, "user_id"> & Playlist;

export type PlaylistVideo = Tables<"playlist_videos">;
export const PLAYLIST_TYPES = ["Public", "Private", "Official"] as const;
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
}) {
  const { data, error } = await supabase
    .rpc("get_playlist_by_short_id", {
      p_short_id: shortId,
    })
    .single();

  if (error || data) {
    console.error("Error fetching playlist from short ID.", error);
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
  limit,
  currentVideo,
  supabase,
}: {
  playlistId: number;
  contentFilter: PlaylistVideosFilter;
  limit?: number;
  currentVideo?: PlaylistVideoWithTimestamp | null;
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

  if (contentFilter.sort.key !== "playlistOrder" && contentFilter.startDate) {
    try {
      // Parse the input date string and explicitly set it to midnight (local time)
      const startDate = new Date(`${contentFilter.startDate}T00:00:00`);
      query.gte("published_at", startDate.toISOString());
    } catch {
      console.error("Unable to parse start date, ignoring.");
    }
  }
  if (contentFilter.sort.key !== "playlistOrder" && contentFilter.endDate) {
    try {
      // Parse the input date string and set it to the end of the day (local time)
      const endDate = new Date(`${contentFilter.endDate}T23:59:59.999`);
      query.lte("published_at", endDate.toISOString());
    } catch {
      console.error("Unable to parse end date, ignoring.");
    }
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

    showNotification("Error creating playlist", "error");
    if (error.code === "23505") {
      showNotification(
        "Error when creating playlist, playlist with that title already exists.",
        "error",
      );
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
}) {
  if (!session) {
    return { playlists: [] };
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
  supabase,
}: {
  searchString: string;
  limit?: number;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await supabase
    .rpc("search_playlists", {
      search_term: searchString,
    })
    .limit(limit);

  if (error) {
    showNotification(
      "Encountered an error when searching playlists and was unable to complete the request.",
      "error",
    );
  }
  return data ?? [];
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
  videoId,
  playlistId,
  position,
  supabase,
}: {
  playlistId: number;
  videoId: string;
  position: number;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase.rpc("update_playlist_video_position", {
    p_playlist_id: playlistId,
    p_video_id: videoId,
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

export function getIsFollowingPlaylist({
  playlist,
  playlists,
  session,
}: {
  playlist?: Playlist;
  playlists: Playlist[];
  session: Session | null;
}) {
  if (!session || !playlist) {
    return false;
  }

  return (
    playlist.created_by !== session.user.id &&
    playlists.some((pl) => pl.id === playlist?.id)
  );
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
