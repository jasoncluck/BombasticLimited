<script lang="ts">
  import { ChevronUp } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import BreadcrumbLayout, {
    type BreadcrumbItem,
  } from "$lib/components/breadcrumb-layout.svelte";
  import { getPageState } from "$lib/state/page.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import ContentSelect from "./content/content-select.svelte";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { Video } from "$lib/supabase/videos";

  interface BreacrumbLayoutProps {
    breadcrumbs: BreadcrumbItem[];
    videos: Video[];
    playlist?: Playlist;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }
  const {
    breadcrumbs,
    videos,
    playlist,
    supabase,
    session,
  }: BreacrumbLayoutProps = $props();

  const pageState = getPageState();

  function handleChevronClick() {
    pageState.contentScrollPosition = { scrollTop: 0, scrollLeft: 0 };
  }
</script>

<div
  class="w-full py-1 sm:px-4 bg-background-lighter flex grow items-center absolute pointer-events-auto justify-between"
>
  <div class="relative">
    {#if session}
      <ContentSelect
        {videos}
        {playlist}
        {supabase}
        {session}
        displayLabel={false}
      />
    {/if}
  </div>

  <!-- Absolutely positioned center breadcrumbs -->
  <div class="overflow-hidden items-center ml-auto">
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
