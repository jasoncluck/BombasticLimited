<script lang="ts">
  import type { BreadcrumbItem } from '../breadcrumb-layout.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import type { ProfilePlaylist } from '$lib/supabase/playlists';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import SharedContentHeader from './shared-content-header.svelte';
  import { SOURCE_INFO, type Source } from '$lib/constants/source';
  import type { ContentView } from './content';
  import type { Video } from '$lib/supabase/videos';
  import type { UserProfile } from '$lib/supabase/user-profiles';

  let {
    breadcrumbs,
    contentFilter,
    currentPage = $bindable(),
    profilePlaylist,
    session,
    showFloatingBreadcrumbs = $bindable(),
    source,
    supabase,
    title,
    videos,
    videosCount,
    userProfile,
    view = 'default',
  }: {
    breadcrumbs: BreadcrumbItem[];
    contentFilter: CombinedContentFilter;
    currentPage: number;
    imageUrl?: string | null;
    profilePlaylist?: ProfilePlaylist;
    session: Session | null;
    showFloatingBreadcrumbs: boolean;
    source?: Source;
    supabase: SupabaseClient<Database>;
    title: string;
    videos: Video[];
    videosCount: number;
    userProfile: UserProfile | null;
    view?: ContentView;
  } = $props();
</script>

<SharedContentHeader
  {breadcrumbs}
  bind:showFloatingBreadcrumbs
  bind:currentPage
  {view}
  {contentFilter}
  {videos}
  playlist={profilePlaylist}
  {userProfile}
  {supabase}
  {session}
>
  <div class="mx-2 flex gap-6">
    <div class="relative flex flex-col">
      <div
        class="flex flex-col items-start border-none bg-transparent p-0 text-left"
      >
        <p class="text-muted-foreground text-sm tracking-tight"></p>

        {#if source}
          <p class="text-muted-foreground text-sm tracking-tight">
            {title}
          </p>
          <h2 class="header-primary-no-margin text-left">
            {SOURCE_INFO[source].displayName}
          </h2>
        {:else}
          <h2 class="header-primary-no-margin text-left">
            {title}
          </h2>
        {/if}
      </div>

      <p class="text-muted-foreground mt-1 text-sm tracking-tight">
        {videosCount}
        {videosCount === 1 ? 'video' : 'videos'}
      </p>
    </div>
  </div>
</SharedContentHeader>
