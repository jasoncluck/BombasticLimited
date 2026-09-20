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

<div class="flex flex-col gap-1" data-testid="podcast-episode-list">
  {#if episodes.length === 0}
    <p class="text-muted-foreground py-8 text-center text-sm">
      {emptyMessage}
    </p>
  {:else}
    {#each episodes as episode (episode.id)}
      <PodcastEpisodeTile {episode} />
    {/each}
  {/if}
</div>
