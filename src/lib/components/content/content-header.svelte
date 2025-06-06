<script lang="ts">
  import type { BreadcrumbItem } from "../breadcrumb-layout.svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import SharedContentHeader from "./shared-content-header.svelte";
  import { SOURCE_INFO, type Source } from "$lib/constants/source";

  let {
    breadcrumbs,
    contentFilter,
    currentPage = $bindable(),
    playlist,
    playlists,
    showFloatingBreadcrumbs = $bindable(),
    source,
    title,
    videosCount,
    supabase,
    session,
  }: {
    breadcrumbs: BreadcrumbItem[];
    contentFilter: CombinedContentFilter;
    currentPage: number;
    imageUrl?: string | null;
    isContinueVideos?: boolean;
    playlist?: Playlist;
    playlists: Playlist[];
    showFloatingBreadcrumbs: boolean;
    source?: Source;
    title: string;
    videosCount: number;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();
</script>

<SharedContentHeader
  {breadcrumbs}
  bind:showFloatingBreadcrumbs
  bind:currentPage
  {videosCount}
  {contentFilter}
  {playlist}
  {playlists}
  {supabase}
  {session}
>
  <div class="flex gap-6">
    <div class="flex flex-col relative">
      <div
        class="flex flex-col cursor-pointer items-start text-left border-none bg-transparent p-0"
      >
        <p class="text-sm text-muted-foreground tracking-tight"></p>

        {#if source}
          <p class="text-sm text-muted-foreground tracking-tight">
            {title}
          </p>
          <h2 class="header-primary text-left">
            {SOURCE_INFO[source].displayName}
          </h2>
        {:else}
          <h2 class="header-primary text-left">
            {title}
          </h2>
        {/if}
      </div>

      <p class="text-sm text-muted-foreground tracking-tight">
        {videosCount}
        {videosCount === 1 ? "video" : "videos"}
      </p>
    </div>
  </div>
</SharedContentHeader>
