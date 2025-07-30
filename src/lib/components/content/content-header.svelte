<script lang="ts">
  import type { BreadcrumbItem } from "../breadcrumb-layout.svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import type { ProfilePlaylist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import SharedContentHeader from "./shared-content-header.svelte";
  import { SOURCE_INFO, type Source } from "$lib/constants/source";
  import type { ContentView } from "./content";
  import type { Video } from "$lib/supabase/videos";
  import type { UserProfile } from "$lib/supabase/user-profiles";

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
    view = "default",
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
  {videosCount}
  {contentFilter}
  {videos}
  playlist={profilePlaylist}
  {userProfile}
  {supabase}
  {session}
>
  <div class="flex gap-6 mx-2">
    <div class="flex flex-col relative">
      <div
        class="flex flex-col items-start text-left border-none bg-transparent p-0"
      >
        <p class="text-sm text-muted-foreground tracking-tight"></p>

        {#if source}
          <p class="text-sm text-muted-foreground tracking-tight">
            {title}
          </p>
          <h2 class="header-primary-no-margin text-left">
            {SOURCE_INFO[source].displayName}
          </h2>
        {:else}
          <h2 class="header-primary text-left">
            {title}
          </h2>
        {/if}
      </div>

      <p class="text-sm text-muted-foreground tracking-tight mt-1">
        {videosCount}
        {videosCount === 1 ? "video" : "videos"}
      </p>
    </div>
  </div>
</SharedContentHeader>
