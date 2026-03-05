import type { Playlist } from '$lib/supabase/playlists';
import type { UserProfile } from '$lib/supabase/user-profiles';

export interface SidebarData {
  playlists: Playlist[];
  userProfile: UserProfile;
  userPlaylistsCount: number;
}

export async function loadSidebarData(): Promise<SidebarData | null> {
  try {
    const response = await fetch('/api/sidebar');
    if (response.ok) {
      return await response.json();
    }
    console.error('Failed to load sidebar data:', response.statusText);
    return null;
  } catch (error) {
    console.error('Failed to load sidebar:', error);
    return null;
  }
}

export async function refreshSidebarData(): Promise<SidebarData | null> {
  // You can add any specific refresh logic here if needed
  return await loadSidebarData();
}
