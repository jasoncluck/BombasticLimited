<script lang="ts">
  import { Play, Pause } from '@lucide/svelte';
  import type { PodcastEpisode } from '$lib/supabase/podcasts/types';
  import { getPodcastPlayerState } from '$lib/state/podcast-player.svelte';
  import Button from '../ui/button/button.svelte';
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

<div
  class="hover:bg-secondary/50 flex items-center gap-3 rounded-md p-2 transition-colors duration-150"
  data-testid="podcast-episode-tile"
>
  <Button
    variant="secondary"
    size="icon"
    class="shrink-0 cursor-pointer rounded-full"
    title={isPlayingThis ? 'Pause' : 'Play'}
    onclick={handlePlayClick}
  >
    {#if isPlayingThis}
      <Pause size={16} />
    {:else}
      <Play size={16} />
    {/if}
  </Button>

  {#if episode.image_url}
    <img
      src={episode.image_url}
      alt={episode.title}
      class="h-12 w-12 shrink-0 rounded object-cover"
      loading="lazy"
    />
  {/if}

  <div class="min-w-0 flex-1">
    <p
      class="truncate text-sm font-medium {isCurrent ? 'text-primary' : ''}"
      title={episode.title}
    >
      {episode.title}
    </p>
    <p class="text-muted-foreground flex items-center gap-2 text-xs">
      <span>{formatEpisodePublishedDate(episode.published_at)}</span>
      {#if episode.duration_seconds}
        <span>·</span>
        <span>{formatEpisodeDuration(episode.duration_seconds)}</span>
      {/if}
      {#if episode.is_premium}
        <Badge variant="secondary" class="text-[10px]">Premium</Badge>
      {/if}
    </p>
  </div>
</div>
