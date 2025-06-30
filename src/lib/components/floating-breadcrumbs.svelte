<script lang="ts">
  import { ChevronUp } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import BreadcrumbLayout, {
    type BreadcrumbItem,
  } from "$lib/components/breadcrumb-layout.svelte";
  import { pageState } from "$lib/state/page.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import ContentSelect from "./content/content-select.svelte";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { Video } from "$lib/supabase/videos";

  function handleChevronClick() {
    pageState.contentScrollPosition = { scrollTop: 0, scrollLeft: 0 };
  }

  interface BreacrumbLayoutProps {
    breadcrumbs: BreadcrumbItem[];
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }
  const {
    breadcrumbs,
    videos,
    playlist,
    playlists,
    supabase,
    session,
  }: BreacrumbLayoutProps = $props();
</script>

<div
  class=" w-full py-1 px-4 bg-background-lighter flex items-center relative pointer-events-auto"
>
  <div class="relative py-2">
    {#if session}
      <ContentSelect
        {videos}
        {playlist}
        {playlists}
        {supabase}
        {session}
        displayLabel={false}
      />
    {/if}
  </div>

  <!-- Absolutely positioned center breadcrumbs -->
  <div
    class="absolute left-1/2 transform -translate-x-1/2 max-w-[50%] overflow-hidden"
  >
    <BreadcrumbLayout {breadcrumbs} />
  </div>

  <div class="ml-auto">
    <Button variant="ghost" class="h-auto w-4" onclick={handleChevronClick}>
      <ChevronUp />
    </Button>
  </div>
</div>
