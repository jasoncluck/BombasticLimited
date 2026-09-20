<script lang="ts">
  import { Play, Pause, Podcast } from '@lucide/svelte';
  import type { PodcastEpisode } from '$lib/supabase/podcasts/types';
  import { getPodcastPlayerState } from '$lib/state/podcast-player.svelte';
  import Button from '../ui/button/button.svelte';
  import Badge from '../ui/badge/badge.svelte';
  import {
    formatEpisodeDuration,
    formatEpisodePublishedDate,
    stripHtmlToText,
  } from './podcast-service';

  const { episode }: { episode: PodcastEpisode } = $props();

  const playerState = getPodcastPlayerState();

  const isCurrent = $derived(playerState.currentEpisode?.id === episode.id);
  const isPlayingThis = $derived(isCurrent && playerState.isPlaying);
  const descriptionPreview = $derived(stripHtmlToText(episode.description));

  function togglePlayback(): void {
    if (isCurrent) {
      playerState.togglePlayPause();
    } else {
      playerState.play(episode);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="hover:bg-secondary/50 flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors duration-150"
  data-testid="podcast-episode-tile"
  role="button"
  tabindex="0"
  ondblclick={togglePlayback}
  onkeydown={(e) => {
    if (e.key === 'Enter') togglePlayback();
  }}
>
  <Button
    variant="secondary"
    size="icon"
    class="mt-0.5 shrink-0 cursor-pointer rounded-full"
    title={isPlayingThis ? 'Pause' : 'Play'}
    onclick={(e) => {
      e.stopPropagation();
      togglePlayback();
    }}
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
  {:else}
    <div
      class="bg-muted text-muted-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded"
    >
      <Podcast size={20} />
    </div>
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
    {#if descriptionPreview}
      <p class="text-muted-foreground mt-1 line-clamp-2 text-xs">
        {descriptionPreview}
      </p>
    {/if}
  </div>
</div>
