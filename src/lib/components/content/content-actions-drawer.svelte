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
  import {
    ChevronRight,
    Ellipsis,
    ListVideo,
    PlusCircle,
  } from "@lucide/svelte";
  import ScrollArea from "../ui/scroll-area/scroll-area.svelte";
  import { handleAddVideosToPlaylist } from "../playlist/playlist-service";
  import { SOURCE_INFO } from "$lib/constants/source";

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
  let openPlaylistDrawer = $state(false);

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
    <Drawer.Trigger
      onclick={(e) => {
        console.log("in click");
        e.preventDefault();
        e.stopPropagation();
        open = true;
      }}
      class={buttonVariants({ variant: "ghost" })}
    >
      <Ellipsis />
    </Drawer.Trigger>
    <Drawer.Content class="p-0 max-h-[50%]">
      <Drawer.Header class="text-left mx-4">
        {#if videos.length === 1}
          {@const video = videos[0]}
          <div class="flex gap-2 items-center">
            <img
              src={video.thumbnail_url}
              alt={video.title}
              class="h-12 aspect-video"
            />
            <div class="flex flex-col">
              <p class="font-normal text-sm">
                {video.title}
              </p>
              <p class="text-xs text-muted-foreground tracking-tight">
                {SOURCE_INFO[video.source].displayName}
              </p>
            </div>
          </div>
        {:else}
          <Drawer.Title>{videos.length} videos selected</Drawer.Title>
        {/if}
      </Drawer.Header>
      <hr />
      {#if variant === "header"}
        <Button
          variant="outline"
          class="w-full"
          onclick={() => {
            onSelectAll?.();
          }}>Select All</Button
        >
      {/if}
      {@const filteredPlaylists = playlists.filter(
        (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
      )}
      {#if (variant !== "header" && filteredPlaylists.length > 0) || (variant === "header" && videos.length > 0)}
        <Drawer.NestedRoot bind:open={openPlaylistDrawer}>
          <Drawer.Trigger
            class={buttonVariants({
              variant: "outline",
              class: "drawer-button",
            })}
          >
            <div class="flex justify-between items-center w-full">
              <div class="flex gap-2 items-center">
                <PlusCircle class="!h-5 !w-5" />
                Add to Playlist
              </div>
              <ChevronRight />
            </div>
          </Drawer.Trigger>
          <Drawer.Content class="p-0 max-h-[50%]">
            <Drawer.Header class="text-left mx-4">
              <Drawer.Title class="text-lg">Select Playlist</Drawer.Title>
            </Drawer.Header>
            <ScrollArea
              type="scroll"
              class={filteredPlaylists.length <= 4 ? "h-auto" : "h-96"}
            >
              {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                  <Button
                    class="drawer-playlist-button"
                    variant="ghost"
                    onclick={() => {
                      handleAddVideosToPlaylist({
                        videos,
                        playlist: addPlaylist,
                        supabase,
                        session,
                      });
                      openPlaylistDrawer = false;
                      open = false;
                    }}
                  >
                    {#if addPlaylist.processedImageUrl}
                      <div class="h-12 w-12 shrink-0">
                        <img
                          src={addPlaylist.processedImageUrl}
                          class="h-full w-full object-cover cursor-pointer"
                          alt={`Image for playlist: ${addPlaylist.name}`}
                        />
                      </div>
                    {:else}
                      <div
                        class="h-12 w-12 flex-shrink-0 flex items-center justify-center"
                      >
                        <ListVideo class="!h-8 !w-8" />
                      </div>
                    {/if}
                    <div class="flex flex-col items-start gap-1">
                      <p>
                        {addPlaylist.name}
                      </p>
                      <p class="text-muted-foreground">{addPlaylist.type}</p>
                    </div>
                  </Button>
                {/if}
              {/each}
            </ScrollArea>
          </Drawer.Content>
        </Drawer.NestedRoot>
      {/if}

      <Drawer.Footer class="pt-2">
        <Drawer.Close class={buttonVariants({ variant: "outline" })}
          >Cancel</Drawer.Close
        >
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Root>
{/if}
