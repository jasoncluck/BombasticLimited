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

  function handleChevronClick() {
    pageState.contentScrollPosition = { scrollTop: 0, scrollLeft: 0 };
  }

  interface BreacrumbLayoutProps {
    breadcrumbs: BreadcrumbItem[];
    playlist?: Playlist;
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }
  const {
    breadcrumbs,
    playlist,
    playlists,
    supabase,
    session,
  }: BreacrumbLayoutProps = $props();
</script>

<div
  class="absolute w-full py-1 bg-background-lighter grid grid-cols-3 items-center"
>
  <div class="justify-self-start relative">
    <BreadcrumbLayout {breadcrumbs} />
  </div>
  <div class="justify-self-center">
    <ContentSelect {playlist} {playlists} {supabase} {session} />
  </div>
  <div class="justify-self-end">
    <Button variant="ghost" class="h-auto w-4" onclick={handleChevronClick}>
      <ChevronUp />
    </Button>
  </div>
</div>
