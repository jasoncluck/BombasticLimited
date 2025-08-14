<script lang="ts">
  import { ListVideo } from '@lucide/svelte';
  import {
    getOptimizedImageUrl,
    generatePictureSources,
    hasOptimizedImages,
    type VideoThumbnailPaths,
  } from '$lib/utils/video-thumbnails-storage';
  import { generatePlaylistImageUrl } from '$lib/server/image-processing';
  import { parseImageProperties } from '$lib/components/playlist/playlist';

  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';

  type PlaylistImageProps = {
    playlist: VideoThumbnailPaths & {
      id?: string | bigint;
      name: string;
      image_properties?: string | null;
    };
    supabase: SupabaseClient<Database>;
    size?: 'small' | 'medium' | 'large';
    class?: string;
  };

  const {
    playlist,
    supabase,
    size = 'medium',
    class: className = '',
  }: PlaylistImageProps = $props();

  // Size mappings for different use cases
  const sizeClasses = {
    small: 'h-12 w-12',
    medium: 'h-16 w-16', 
    large: 'h-24 w-24',
  };

  // Fallback URL for playlists without optimized images
  function getPlaylistImageFallbackUrl(): string | null {
    // Use maxres URL first for better quality when cropping, fallback to regular thumbnail
    const effectiveUrl = playlist.thumbnail_maxres_url || playlist.thumbnail_url;
    if (!effectiveUrl) return null;

    const params = new URLSearchParams({
      url: playlist.thumbnail_url || '',
      maxresUrl: playlist.thumbnail_maxres_url || '',
      type: 'image',
    });

    if (playlist.id) {
      params.set('playlistId', playlist.id.toString());
    }

    if (playlist.image_properties) {
      params.set('imageProperties', playlist.image_properties);
    }

    return `/api/playlist-image?${params.toString()}`;
  }
</script>

<div class="relative {sizeClasses[size]} flex-shrink-0 justify-self-center {className}">
  {#if hasOptimizedImages(playlist)}
    <!-- Use optimized images with smart fallback chain -->
    {@const pictureSources = generatePictureSources(
      playlist,
      'thumbnail_maxres',
      supabase
    )}
    {@const optimizedResult = getOptimizedImageUrl(
      playlist,
      'thumbnail_maxres',
      supabase
    )}
    <picture>
      {#each pictureSources as source}
        <source srcset={source.srcset} type={source.type} />
      {/each}
      <img
        class="h-full w-full rounded object-cover"
        src={optimizedResult.url || getPlaylistImageFallbackUrl()}
        alt={playlist.name}
        loading="lazy"
        decoding="async"
        fetchpriority="auto"
      />
    </picture>
  {:else if playlist.thumbnail_url || playlist.thumbnail_maxres_url}
    <!-- Immediate server-side square cropping for playlists without optimized images -->
    <img
      class="h-full w-full rounded object-cover"
      src={getPlaylistImageFallbackUrl()}
      alt={playlist.name}
      loading="lazy"
      decoding="async"
      fetchpriority="auto"
    />
  {:else}
    <!-- Default placeholder for playlists without any image -->
    <div
      class="bg-muted flex h-full w-full items-center justify-center rounded"
    >
      <ListVideo class="text-muted-foreground !h-8 !w-8" />
    </div>
  {/if}
</div>