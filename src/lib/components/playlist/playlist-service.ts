import { goto, invalidate } from '$app/navigation';
import type { Database } from '$lib/supabase/database.types';
import { showNotification } from '$lib/supabase/notifications';
import {
  addVideosToPlaylist,
  createPlaylist,
  deletePlaylist,
  deleteVideosFromPlaylist,
  followPlaylist,
  PLAYLIST_VIDEO_LIMIT,
  unfollowPlaylist,
  updatePlaylistThumbnail,
  updatePlaylistPosition,
  updatePlaylistSort,
  updatePlaylistVideoPosition,
  USER_PLAYLIST_LIMIT,
  type Playlist,
  type PlaylistVideo,
} from '$lib/supabase/playlists';
import { type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Video } from '$lib/supabase/videos';
import {
  isPlaylistVideosFilter,
  type CombinedContentFilter,
  type SortKey,
  type SortOrder,
} from '../content/content-filter';
import { type PlaylistImageProperties } from '$lib/supabase/playlists';
import type { SidebarState } from '$lib/state/sidebar.svelte';
import { showToast } from '$lib/state/notifications.svelte';

export type PlaylistImages = Record<string, string | undefined>;

export async function handleCreatePlaylist({
  sidebarState,
  session,
  supabase,
}: {
  sidebarState: SidebarState;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session) {
    goto('/login');
    throw new Error('Attempted to create a playlist without a valid session.');
  }

  const { playlist, error } = await createPlaylist({
    supabase,
  });

  if (error) {
    if (error.code === 'P0001') {
      showToast(
        `Unable to create playlist, a maximum of ${USER_PLAYLIST_LIMIT} playlists can be created or followed.`,
        'error'
      );
    } else {
      showToast('Error creating playlist', 'error');
    }
  }

  // Trigger populates short ID
  if (!error && playlist) {
    showToast(`Created Playlist: ${playlist.name}`);
  }

  sidebarState.refreshData();

  return { playlist, error };
}

export async function handleDeletePlaylist({
  session,
  playlist,
  sidebarState,
  supabase,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session?.user.id) {
    goto('/login');
    return;
  }

  const { error } = await deletePlaylist({
    playlistId: playlist.id,
    supabase,
  });

  if (error) {
    showNotification(`Unable to delete playlist: ${playlist.name}.`, 'error');
  } else {
    showNotification(`Deleted ${playlist.name}.`, 'success');
  }
  sidebarState.refreshData();
  return { error };
}

export async function handleAddVideosToPlaylist({
  playlist,
  videos,
  sidebarState,
  supabase,
  session,
}: {
  playlist: Playlist;
  videos: Video[];
  sidebarState: SidebarState;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return { error: null };
  }

  if (playlist.created_by !== session.user.id) {
    return { error: null };
  }

  // Remove the thumbnail logic - let the database function handle it
  const { error } = await addVideosToPlaylist({
    videoIds: videos.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
  });

  if (error) {
    if (error.code === 'P0001') {
      showNotification(
        `${videos.length === 1 ? 'Video' : 'Videos'} could not be added. Playlists can not contain more than ${PLAYLIST_VIDEO_LIMIT} videos.`
      );
    } else {
      showNotification('Unable to add video to playlist.');
    }
    console.error(error);
    return { error };
  }

  showNotification(
    `Added ${videos.length > 1 ? 'videos' : 'video'} to ${playlist.name}`
  );

  // Refresh data
  invalidate('supabase:db:videos');
  await sidebarState.refreshData();

  return { error: null };
}

export async function handleRemoveVideosFromPlaylist({
  videos,
  sidebarState,
  playlist,
  supabase,
}: {
  videos: Video[];
  sidebarState: SidebarState;
  playlist: Playlist;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await deleteVideosFromPlaylist({
    videoIds: videos.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
  });

  if (error) {
    showNotification('Unable to remove video from playlist.');
  } else {
    showNotification(`Removed video from ${playlist.name}.`);
  }

  sidebarState.refreshData();
  invalidate('supabase:db:videos');
  return { error };
}

export async function handleUpdatePlaylistImage({
  playlist,
  sidebarState,
  thumbnailUrl,
  imageProperties = null,
  supabase,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  thumbnailUrl: string | null;
  imageProperties?: PlaylistImageProperties | null;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await updatePlaylistThumbnail({
    playlistId: playlist.id,
    thumbnailUrl,
    imageProperties,
    supabase,
  });

  if (error) {
    showNotification('Unable update playlist image');
  }

  sidebarState.refreshData();
  invalidate('supabase:db:videos');
  return { error };
}

export async function handleUpdatePlaylistVideoPosition({
  playlist,
  position,
  videos,
  supabase,
}: {
  playlist: Playlist;
  videos: Video[];
  position: number;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await updatePlaylistVideoPosition({
    playlistId: playlist.id,
    position,
    videoIds: videos.map((v) => v.id),
    supabase,
  });

  if (error) {
    console.error(error);
  }

  return { error };
}

export async function handleUpdatePlaylistPosition({
  playlist,
  position,
  supabase,
  session,
}: {
  playlist: Playlist;
  position: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return;
  }

  await updatePlaylistPosition({
    playlistId: playlist.id,
    position,
    supabase,
  });
}

export async function handleFollowPlaylist({
  playlist,
  sidebarState,
  contentFilter,
  supabase,
  session,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  position?: number;
  contentFilter?: CombinedContentFilter;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return;
  }

  if (!contentFilter) {
    console.error('Unable to follow playlist, missing content filter.');
    return;
  }

  const { error } = await followPlaylist({
    playlistId: playlist.id,
    supabase,
  });

  if (
    isPlaylistVideosFilter(contentFilter) &&
    contentFilter.sort.key !== 'playlistOrder'
  ) {
    handleUpdatePlaylistSort({
      playlist,
      sortedBy: contentFilter.sort.key,
      sortOrder: contentFilter.sort.order,
      supabase,
      session,
    });
  }

  sidebarState.refreshData();

  if (error) {
    if (error?.code === 'P0001') {
      showNotification(
        `Unable to follow playlist, a maximum of ${USER_PLAYLIST_LIMIT} playlists can be followed or created.`,
        'error'
      );
    } else {
      showNotification('Unable to follow playlist', 'error');
    }
  } else {
    if (!error) {
      showNotification(`Followed playlist: ${playlist.name} `, 'success');
    }
  }
}

export async function handleUnfollowPlaylist({
  playlist,
  sidebarState,
  supabase,
  session,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  position?: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return;
  }

  const { error } = await unfollowPlaylist({
    playlistId: playlist.id,
    supabase,
  });

  sidebarState.refreshData();

  if (!error) {
    showNotification(`Unfollowed playlist: ${playlist.name} `, 'success');
  } else {
    showNotification(`Unable to unfollow playlist: ${error.message}`, 'error');
  }
  return { error };
}

export async function handleUpdatePlaylistSort({
  playlist,
  sortedBy,
  sortOrder,
  supabase,
  session,
}: {
  playlist: Playlist;
  sortedBy: SortKey<PlaylistVideo>;
  sortOrder: SortOrder;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return;
  }

  const { updatedPlaylist, error } = await updatePlaylistSort({
    playlistId: playlist.id,
    sortedBy,
    sortOrder,
    supabase,
  });

  if (error) {
    showNotification('Unable to update playlist sort settings', 'error');
  }

  return { updatedPlaylist, error };
}
