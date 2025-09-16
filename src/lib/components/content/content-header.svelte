<script lang="ts">
  import type { BreadcrumbItem } from '../breadcrumb-layout.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import SharedContentHeader from './shared-content-header.svelte';
  import { SOURCE_INFO, type Source } from '$lib/constants/source';
  import type { ContentView } from './content';
  import type { Video } from '$lib/supabase/videos';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import type { Playlist } from '$lib/supabase/playlists';

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
    titleLinkHref,
    videos,
    videosCount,
    userProfile,
    view = 'default',
  }: {
    breadcrumbs: BreadcrumbItem[];
    contentFilter: CombinedContentFilter;
    currentPage: number;
    imageUrl?: string | null;
    profilePlaylist?: Playlist;
    session: Session | null;
    showFloatingBreadcrumbs: boolean;
    source?: Source;
    supabase: SupabaseClient<Database>;
    title: string;
    titleLinkHref?: string;
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
  <div class="flex gap-6">
    <div class="relative flex flex-col">
      <div
        class="flex flex-col items-start border-none bg-transparent text-left"
      >
        {#if source}
          {#if titleLinkHref}
            <a
              class="text-muted-foreground text-sm tracking-tight"
              href={titleLinkHref}
            >
              {title}
            </a>
          {:else}
            <p class="text-muted-foreground text-sm tracking-tight">
              {title}
            </p>
          {/if}
          <h2 class="header-content">
            {SOURCE_INFO[source].displayName}
          </h2>
        {:else}
          <h2 class="header-content">
            {title}
          </h2>
        {/if}

        <p class="text-muted-foreground text-sm tracking-tight">
          {videosCount}
          {videosCount === 1 ? 'video' : 'videos'}
        </p>
      </div>
    </div>
  </div>
</SharedContentHeader>
