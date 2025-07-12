<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import Button, { buttonVariants } from "../ui/button/button.svelte";
  import * as Drawer from "$lib/components/ui/drawer/index.js";

  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import {
    ChevronRight,
    CircleCheck,
    CircleMinus,
    Edit,
    Ellipsis,
    ImagePlay,
    ListChecks,
    ListVideo,
    MinusCircle,
    PlusCircle,
    TimerReset,
  } from "@lucide/svelte";
  import ScrollArea from "../ui/scroll-area/scroll-area.svelte";
  import {
    handleAddVideosToPlaylist,
    handleDeletePlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
  } from "../playlist/playlist-service";
  import { SOURCE_INFO } from "$lib/constants/source";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideosTimestamp,
  } from "../video/video-service";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  let {
    videos = $bindable(),
    playlist,
    playlists,
    variant,
    onPlaylistEdit,
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
    onPlaylistEdit?: () => void;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  const isHovering = $derived(
    contentState.hoveredVideosBySection[sectionId]?.id === videos[0]?.id,
  );

  let open = $state(false);
  let openPlaylistDrawer = $state(false);
  let activeSnapPoint = $state(1);

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
  <Drawer.Root snapPoints={[1]} bind:activeSnapPoint bind:open>
    <Drawer.Trigger
      onclick={(e) => {
        console.log("in click");
        e.preventDefault();
        e.stopPropagation();
        open = true;
      }}
      class={buttonVariants({
        variant: "ghost",
        class: "outline-none ghost-button-minimal",
      })}
    >
      <Ellipsis />
    </Drawer.Trigger>
    <Drawer.Content class="p-0">
      <Drawer.Header class="text-left mx-4">
        {#if videos.length === 1}
          {@const video = videos[0]}
          <div class="flex gap-2 items-center">
            <img
              src={video.thumbnail_url}
              alt={video.title}
              class="h-12 aspect-video"
            />
            <div class="flex flex-col gap-1">
              <p class="font-normal text-sm">
                {video.title}
              </p>
              <p class="text-xs text-muted-foreground tracking-tight">
                {SOURCE_INFO[video.source].displayName}
              </p>
            </div>
          </div>
        {:else if playlist}
          <div class="flex gap-2 items-center">
            {#if playlist.processedImageUrl}
              <div class="w-12 h-12 shrink-0">
                <img src={playlist.processedImageUrl} alt={playlist.name} />
              </div>
            {:else}
              <div
                class="h-12 w-12 flex-shrink-0 flex items-center justify-center"
              >
                <ListVideo class="!h-8 !w-8" />
              </div>
            {/if}
            <div class="flex flex-col gap-1">
              <p class="font-normal text-sm">
                {playlist.name}
              </p>
              <p class="text-xs text-muted-foreground tracking-tight">
                {playlist.type}
              </p>
            </div>
          </div>
        {/if}
      </Drawer.Header>
      <hr />
      {#if isPlaylistOwner && variant === "header"}
        <Button
          class="drawer-button"
          variant="ghost"
          onclick={() => {
            onPlaylistEdit?.();
            open = false;
          }}
        >
          <div class="flex items-center gap-2">
            <Edit class="drawer-icon" />
            Edit
          </div>
        </Button>
      {/if}
      {@const filteredPlaylists = playlists.filter(
        (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
      )}
      {#if (variant !== "header" && filteredPlaylists.length > 0) || (variant === "header" && videos.length > 0)}
        <Drawer.NestedRoot bind:open={openPlaylistDrawer}>
          <Drawer.Trigger
            class={buttonVariants({
              variant: "ghost",
              class: "drawer-button",
            })}
          >
            <div class="flex justify-between items-center w-full">
              <div class="flex gap-2 items-center">
                <PlusCircle class="drawer-icon" />
                Add to playlist
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

      {#if playlist && isPlaylistOwner && videos && videos.length > 0}
        <Button
          class="drawer-button"
          variant="ghost"
          onclick={() => {
            handleRemoveVideosFromPlaylist({
              videos,
              playlist,
              supabase,
            });

            open = false;
          }}
        >
          <div class="flex gap-2 items-center">
            <MinusCircle class="drawer-icon" />
            Remove from playlist
          </div>
        </Button>
      {/if}

      {#if contentState.selectedVideosBySection[sectionId] && contentState.selectedVideosBySection[sectionId].length === 1 && playlist && variant === "list-items" && isPlaylistOwner}
        {@const selectedVideo =
          contentState.selectedVideosBySection[sectionId][0]}
        <Button
          class="drawer-button"
          variant="ghost"
          onclick={() => {
            handleUpdatePlaylistImage({
              playlist,
              thumbnailUrl: selectedVideo.thumbnail_url,
              thumbnailMaxResUrl: selectedVideo.thumbnail_maxres_url,
              supabase,
            });
            open = false;
          }}
        >
          <div class="flex gap-2 items-center">
            <ImagePlay class="drawer-icon" />
            Set as playlist image
          </div>
        </Button>
      {/if}
      {#if session && variant !== "item" && videos.length > 0 && videos.some( (v) => isVideoWithTimestamp(v), )}
        <Button
          class="drawer-button"
          variant="ghost"
          onclick={async () => {
            ({ updatedVideos: videos } = await handleDeleteVideosTimestamp({
              videos,
              supabase,
              session,
            }));
            open = false;
          }}
        >
          <div class="flex gap-2 items-center">
            <TimerReset class="drawer-icon" />
            Reset Progress
          </div>
        </Button>
      {/if}
      {#if variant !== "item" && videos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
        <Button
          class="drawer-button"
          variant="ghost"
          onclick={async () => {
            ({ updatedVideos: videos } = await handleAddVideoTimestamp({
              videoTimestamps: videos.map((v) => ({
                videoId: v.id,
                watchedAt: new Date(),
              })),
              session,
              supabase,
            }));
            open = false;
          }}
        >
          <div class="flex gap-2 items-center">
            <CircleCheck class="drawer-icon" />
            Set as Watched
          </div>
        </Button>
      {/if}
      {#if playlist && variant === "header"}
        <Button
          class="drawer-button"
          variant="ghost"
          onclick={async () => {
            const data = await handleDeletePlaylist({
              playlist,
              supabase,
              session,
            });

            if (
              !data?.error &&
              page.url.pathname === `/playlist/${playlist.short_id}`
            ) {
              goto("/");
            }
            open = false;
          }}
        >
          <div class="flex items-center gap-2">
            <CircleMinus class="drawer-icon" />
            Delete Playlist
          </div>
        </Button>
      {/if}

      <Drawer.Footer class="pt-2">
        <Drawer.Close class={buttonVariants({ variant: "outline" })}
          >Cancel</Drawer.Close
        >
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Root>
{/if}
