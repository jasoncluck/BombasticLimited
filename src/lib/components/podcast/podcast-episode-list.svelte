<script lang="ts">
  import type { PodcastEpisode } from '$lib/supabase/podcasts/types';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import PodcastEpisodeTile from './podcast-episode-tile.svelte';
  import PodcastEpisodeCard from './podcast-episode-card.svelte';
  import { getContentView } from '$lib/components/content/content';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  const {
    episodes,
    userProfile,
    emptyMessage = 'No episodes yet.',
  }: {
    episodes: PodcastEpisode[];
    userProfile?: UserProfile | null;
    emptyMessage?: string;
  } = $props();

  const mediaQueryState = getMediaQueryState();

  // Same TILES/TABLE split every other content type (videos, playlists) uses.
  const contentView = $derived(getContentView(mediaQueryState, userProfile));
</script>

<div data-testid="podcast-episode-list">
  {#if episodes.length === 0}
    <p class="text-muted-foreground py-8 text-center text-sm">
      {emptyMessage}
    </p>
  {:else if contentView === 'TABLE'}
    <div class="flex flex-col gap-1">
      {#each episodes as episode (episode.id)}
        <PodcastEpisodeTile {episode} />
      {/each}
    </div>
  {:else}
    <div
      class="grid grid-cols-2 gap-x-2 gap-y-6 @sm:grid-cols-3 @4xl:grid-cols-5"
    >
      {#each episodes as episode (episode.id)}
        <PodcastEpisodeCard {episode} />
      {/each}
    </div>
  {/if}
</div>
