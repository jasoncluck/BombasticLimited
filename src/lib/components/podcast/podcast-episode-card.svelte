<script lang="ts">
  import { Play, Pause } from '@lucide/svelte';
  import type { PodcastEpisode } from '$lib/supabase/podcasts/types';
  import { getPodcastPlayerState } from '$lib/state/podcast-player.svelte';
  import Badge from '../ui/badge/badge.svelte';
  import {
    formatEpisodeDuration,
    formatEpisodePublishedDate,
  } from './podcast-service';

  const { episode }: { episode: PodcastEpisode } = $props();

  const playerState = getPodcastPlayerState();

  const isCurrent = $derived(playerState.currentEpisode?.id === episode.id);
  const isPlayingThis = $derived(isCurrent && playerState.isPlaying);

  function handlePlayClick(): void {
    if (isCurrent) {
      playerState.togglePlayPause();
    } else {
      playerState.play(episode);
    }
  }
</script>

<button
  type="button"
  class="group flex w-full cursor-pointer flex-col text-left"
  data-testid="podcast-episode-card"
  onclick={handlePlayClick}
>
  <div class="relative aspect-square w-full overflow-hidden rounded-lg">
    {#if episode.image_url}
      <img
        src={episode.image_url}
        alt={episode.title}
        class="h-full w-full object-cover"
        loading="lazy"
      />
    {:else}
      <div class="bg-muted h-full w-full"></div>
    {/if}
    <div
      class="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-150 group-hover:bg-black/40"
    >
      <div
        class="bg-background/90 flex h-12 w-12 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100 {isPlayingThis
          ? 'opacity-100'
          : ''}"
      >
        {#if isPlayingThis}
          <Pause size={20} />
        {:else}
          <Play size={20} />
        {/if}
      </div>
    </div>
  </div>

  <p
    class="mt-2 line-clamp-2 text-sm font-medium {isCurrent
      ? 'text-primary'
      : ''}"
    title={episode.title}
  >
    {episode.title}
  </p>
  <p class="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
    <span>{formatEpisodePublishedDate(episode.published_at)}</span>
    {#if episode.duration_seconds}
      <span>·</span>
      <span>{formatEpisodeDuration(episode.duration_seconds)}</span>
    {/if}
    {#if episode.is_premium}
      <Badge variant="secondary" class="text-[10px]">Premium</Badge>
    {/if}
  </p>
</button>
