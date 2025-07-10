<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { type Video } from "$lib/supabase/videos";
  import Button, { buttonVariants } from "../ui/button/button.svelte";
  import * as Drawer from "$lib/components/ui/drawer/index.js";

  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import Label from "../ui/label/label.svelte";
  import Input from "../ui/input/input.svelte";
  import { Ellipsis } from "@lucide/svelte";

  let {
    videos = $bindable(),
    playlist,
    playlists,
    variant,
    onSelectAll,
    sectionId,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    // For items like deselecting only makes sense when using the content selector
    variant: "header" | "item" | "list-items";
    sectionId: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onSelectAll?: () => void;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  const isHovering = $derived(
    contentState.hoveredVideosBySection[sectionId]?.id === videos[0]?.id,
  );

  let open = $state(false);

  $effect(() => {
    contentState.isDropdownMenuOpen = open;
  });

  $effect(() => {
    if (contentState.isContextMenuOpenForAnySection()) {
      open = false;
    }
  });
</script>

{#if session}
  <Drawer.Root bind:open>
    <Drawer.Trigger class={buttonVariants({ variant: "ghost" })}>
      <Ellipsis />
    </Drawer.Trigger>
    <Drawer.Content>
      <Drawer.Header class="text-left">
        <Drawer.Title>Video actions</Drawer.Title>
      </Drawer.Header>
      <form class="grid items-start gap-4 px-4">
        <div class="grid gap-2">foo</div>
        <div class="grid gap-2">bar</div>
        <Button type="submit">Save changes</Button>
      </form>
      <Drawer.Footer class="pt-2">
        <Drawer.Close class={buttonVariants({ variant: "outline" })}
          >Cancel</Drawer.Close
        >
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Root>
{/if}
