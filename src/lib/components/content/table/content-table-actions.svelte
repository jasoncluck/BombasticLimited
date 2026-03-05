<script lang="ts">
  import type { Database } from '$lib/supabase/database.types';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Video } from '$lib/supabase/videos';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import ContentDropdown from '../content-dropdown.svelte';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Ellipsis } from '@lucide/svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  const {
    videos,
    playlist,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
</script>

<div class="content-table-row flex items-center justify-center">
  {#if mediaQueryState.canHover}
    <div class="hover-actions relative">
      <ContentDropdown
        videos={[videos[0]]}
        {playlist}
        {sectionId}
        variant="list-items"
        {supabase}
        {session}
      />
    </div>
  {:else}
    <div class="touch-actions">
      {#if session}
        <Button
          variant="ghost"
          class="ghost-button-minimal outline-hiddden"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            contentState.handleDrawer({
              video: videos[0],
              sectionId,
              variant: 'list-items',
            });
          }}
        >
          <Ellipsis />
        </Button>
      {/if}
    </div>
  {/if}
</div>
