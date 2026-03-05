<script lang="ts">
  import { ChevronUp } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import BreadcrumbLayout, {
    type BreadcrumbItem,
  } from '$lib/components/breadcrumb-layout.svelte';
  import { getPageState } from '$lib/state/page.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import ContentSelect from './content/content-select.svelte';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { Video } from '$lib/supabase/videos';
  import type { CombinedContentFilter } from './content/content-filter';
  import { getContentView } from './content/content';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  interface BreacrumbLayoutProps {
    breadcrumbs: BreadcrumbItem[];
    videos: Video[];
    contentFilter?: CombinedContentFilter;
    playlist?: Playlist;
    userProfile: UserProfile | null;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }
  const {
    breadcrumbs,
    videos,
    contentFilter,
    playlist,
    userProfile,
    supabase,
    session,
  }: BreacrumbLayoutProps = $props();

  const pageState = getPageState();
  const mediaQueryState = getMediaQueryState();

  function handleChevronClick() {
    pageState.contentScrollPosition = { scrollTop: 0, scrollLeft: 0 };
  }
</script>

<div
  class="bg-background-lighter pointer-events-auto absolute flex w-full grow items-center justify-between py-1"
>
  <div class="relative">
    {#if session && getContentView(mediaQueryState, userProfile) === 'TABLE'}
      <ContentSelect
        {videos}
        {playlist}
        {contentFilter}
        {supabase}
        {session}
        displayLabel={false}
      />
    {/if}
  </div>

  <!-- Absolutely positioned center breadcrumbs -->
  <div class="ml-auto items-center overflow-hidden">
    <BreadcrumbLayout {breadcrumbs} />
  </div>

  <div class="ml-auto">
    <Button
      variant="ghost"
      class="ghost-button-minimal"
      onclick={handleChevronClick}
    >
      <ChevronUp />
    </Button>
  </div>
</div>
