import type { HighlightPlaylist } from '$lib/constants/source';
import type { Playlist } from '$lib/supabase/playlists';
import type { Video } from '$lib/supabase/videos';

interface CachedPlaylistData {
  playlist: Playlist;
  videos: Video[];
}

interface CacheEntry {
  data: CachedPlaylistData[];
  timestamp: number;
  expiry: number;
}

class PlaylistCache {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

  private getCacheKey(
    source: string,
    highlightedPlaylists: HighlightPlaylist[]
  ): string {
    const playlistIds = highlightedPlaylists
      .map((p) => p.youtubeId)
      .sort()
      .join(',');
    return `highlighted-playlists-${source}-${playlistIds}`;
  }

  get(
    source: string,
    highlightedPlaylists: HighlightPlaylist[]
  ): CachedPlaylistData[] | null {
    const key = this.getCacheKey(source, highlightedPlaylists);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    if (now > entry.timestamp + entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(
    source: string,
    highlightedPlaylists: HighlightPlaylist[],
    data: CachedPlaylistData[]
  ): void {
    const key = this.getCacheKey(source, highlightedPlaylists);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      expiry: this.CACHE_DURATION,
    };

    this.cache.set(key, entry);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

export const playlistCache = new PlaylistCache();

// Clean up expired entries every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      playlistCache.cleanup();
    },
    10 * 60 * 1000
  );
}
