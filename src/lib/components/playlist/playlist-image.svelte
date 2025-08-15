<script lang="ts">
  import { ListVideo } from '@lucide/svelte';
  import {
    getOptimizedPlaylistImageUrl,
    hasUploadedPlaylistImage,
  } from '$lib/utils/video-thumbnails-storage';

  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { Playlist } from '$lib/supabase/playlists';
  import { IMAGES_BUCKET } from '$lib/constants/images';

  type PlaylistImageProps = {
    playlist: Playlist;
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
  // const playlistImageFallbackUrl = $derived.by(() => {
  //   // If playlist has uploaded images, don't use server processing
  //   if (hasUploadedPlaylistImage(playlist)) {
  //     return null;
  //   }
  //
  //   // No fallback needed for playlists without uploaded images
  //   // Playlists no longer use YouTube thumbnails
  //   return null;
  // });
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
            .from(IMAGES_BUCKET)
            .getPublicUrl(playlist.image_avif_url).data.publicUrl}
          type="image/avif"
        />
      {/if}
      {#if playlist.image_webp_url}
        <source
          srcset={supabase.storage
            .from(IMAGES_BUCKET)
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
  {:else}
    <!-- Default placeholder for playlists without any image -->
    <div
      class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center border-none bg-transparent p-0"
    >
      <ListVideo size={128} />
    </div>
  {/if}
</div>
