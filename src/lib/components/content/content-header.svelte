<script lang="ts">
  import type { BreadcrumbItem } from '../breadcrumb-layout.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
  import type { AppSession as Session } from '$lib/types/session';
  import type { Database } from '$lib/neon/database.types';
  import SharedContentHeader from './shared-content-header.svelte';
  import type { Source } from '$lib/constants/source';
  import type { ContentView } from './content';
  import type { Video } from '$lib/neon/videos';
  import type { UserProfile } from '$lib/neon/user-profiles';
  import type { Playlist } from '$lib/neon/playlists';

  let {
    breadcrumbs,
    contentFilter,
    currentPage = $bindable(),
    profilePlaylist,
    session,
    showFloatingBreadcrumbs = $bindable(),
    source,
    neon,
    heading,
    subHeading,
    subHeadingHref,
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
    neon: NeonPostgrestClient<Database>;
    heading: string;
    subHeading?: string;
    subHeadingHref?: string;
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
  {neon}
  {session}
>
  <div class="flex gap-6">
    <div class="relative flex flex-col">
      <div
        class="flex flex-col items-start border-none bg-transparent text-left"
      >
        {#if source}
          {#if subHeadingHref}
            <a
              class="text-muted-foreground text-sm tracking-tight"
              href={subHeadingHref}
            >
              {subHeading}
            </a>
          {:else}
            <p class="text-muted-foreground text-sm tracking-tight">
              {subHeading}
            </p>
          {/if}
          <h2 class="header-content">
            {heading}
          </h2>
        {:else}
          <h2 class="header-content">
            {heading}
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
