<script lang="ts">
  import { ListVideo } from '@lucide/svelte';
  import {
    getOptimizedPlaylistImageUrl,
    getOptimizedImageUrl,
    generatePictureSources,
    hasUploadedPlaylistImage,
    hasOptimizedImages,
    type VideoThumbnailPaths,
  } from '$lib/utils/video-thumbnails-storage';

  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import { SvelteURLSearchParams } from 'svelte/reactivity';

  type PlaylistImageProps = {
    playlist: VideoThumbnailPaths & {
      id?: string | bigint | number;
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

  // Reactive fallback URL for playlists without optimized images
  const playlistImageFallbackUrl = $derived.by(() => {
    // If playlist has uploaded images, don't use server processing
    if (hasUploadedPlaylistImage(playlist)) {
      return null;
    }

    // Use maxres URL first for better quality when cropping, fallback to regular thumbnail
    const effectiveUrl =
      playlist.thumbnail_maxres_url || playlist.thumbnail_url;
    if (!effectiveUrl) return null;

    const params = new SvelteURLSearchParams({
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
  });
</script>

<div
  class="relative {className ||
    sizeClasses[size]} flex-shrink-0 justify-self-center"
>
  {#if hasUploadedPlaylistImage(playlist)}
    <!-- Use uploaded playlist images with optimized fallback chain -->
    {@const optimizedResult = getOptimizedPlaylistImageUrl(playlist, supabase)}
    <picture>
      <!-- Generate picture sources for uploaded images -->
      {#if playlist.image_avif_url}
        <source
          srcset={supabase.storage
            .from('optimized-images')
            .getPublicUrl(playlist.image_avif_url).data.publicUrl}
          type="image/avif"
        />
      {/if}
      {#if playlist.image_webp_url}
        <source
          srcset={supabase.storage
            .from('optimized-images')
            .getPublicUrl(playlist.image_webp_url).data.publicUrl}
          type="image/webp"
        />
      {/if}
      <img
        class="h-full w-full rounded object-cover"
        src={optimizedResult.url}
        alt={playlist.name}
        loading="lazy"
        decoding="async"
        fetchpriority="auto"
      />
    </picture>
  {:else if hasOptimizedImages(playlist, 'thumbnail_maxres') || hasOptimizedImages(playlist, 'thumbnail')}
    <!-- Use optimized YouTube thumbnail images with smart fallback chain -->
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
        src={optimizedResult.url || playlistImageFallbackUrl}
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
      src={playlistImageFallbackUrl}
      alt={playlist.name}
      loading="lazy"
      decoding="async"
      fetchpriority="auto"
    />
  {:else}
    <!-- Default placeholder for playlists without any image -->

    <div
      class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center {isPlaylistOwner &&
        'cursor-pointer'}border-none bg-transparent p-0"
    >
      <ListVideo size={128} />
    </div>
  {/if}
</div>
