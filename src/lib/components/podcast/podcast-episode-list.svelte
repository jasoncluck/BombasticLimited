<script lang="ts">
  import type { PodcastEpisode } from '$lib/supabase/podcasts/types';
  import PodcastEpisodeTile from './podcast-episode-tile.svelte';

  const {
    episodes,
    emptyMessage = 'No episodes yet.',
  }: {
    episodes: PodcastEpisode[];
    emptyMessage?: string;
  } = $props();
</script>

<div data-testid="podcast-episode-list">
  {#if episodes.length === 0}
    <p class="text-muted-foreground py-8 text-center text-sm">
      {emptyMessage}
    </p>
  {:else}
    <div class="grid grid-cols-1 gap-x-4 @2xl:grid-cols-2 @6xl:grid-cols-3">
      {#each episodes as episode (episode.id)}
        <PodcastEpisodeTile {episode} />
      {/each}
    </div>
  {/if}
</div>
