<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import type { ContentState } from "$lib/state/content.svelte";
  import type { DrawerState } from "$lib/state/drawer.svelte";
  import Button, { buttonVariants } from "../../ui/button/button.svelte";
  import * as Drawer from "$lib/components/ui/drawer/index.js";

  import {
    ArrowDownUp,
    ChevronRight,
    CircleCheck,
    CircleMinus,
    Edit,
    ImagePlay,
    ListVideo,
    MinusCircle,
    PlusCircle,
    TimerReset,
  } from "@lucide/svelte";
  import {
    handleAddVideosToPlaylist,
    handleDeletePlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
    handleUpdatePlaylistVideoPosition,
  } from "../../playlist/playlist-service";
  import { SOURCE_INFO } from "$lib/constants/source";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideosTimestamp,
  } from "../../video/video-service";
  import { goto, invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import EditListDrawer from "./edit-list-drawer.svelte";

  let {
    playlist,
    playlists,
    videos,
    variant,
    onPlaylistEdit,
    supabase,
    session,
    drawerState,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    variant: "header" | "item" | "list-items";
    sectionId: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onPlaylistEdit?: () => void;
    contentState: ContentState;
    drawerState: DrawerState;
  } = $props();

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  let openPlaylistDrawer = $state(false);

  async function handleVideoReorder(
    oldIndex: number,
    newIndex: number,
    item: Video | Playlist | { id: string | number },
  ) {
    if (!session || !playlist) return;

    const newPosition = newIndex + 1;

    try {
      await handleUpdatePlaylistVideoPosition({
        playlist,
        position: newPosition,
        videos: [item as Video],
        supabase,
      });
    } catch (error) {
      console.error("Error updating video position:", error);
      throw error;
    }
  }

  function closeDrawer() {
    drawerState.close();
  }
</script>

<div class="drawer-content">
  <!-- Header Section -->
  <div class="text-left mx-4 py-4">
    {#if variant === "list-items" && videos.length === 1}
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
          <div class="h-12 w-12 flex-shrink-0 flex items-center justify-center">
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
  </div>

  <hr />

  <!-- Action Buttons -->
  <div class="flex flex-col mt-2">
    {#if isPlaylistOwner && variant === "header"}
      <Button
        class="drawer-button"
        variant="ghost"
        onclick={() => {
          onPlaylistEdit?.();
          closeDrawer();
        }}
      >
        <div class="flex items-center gap-2">
          <Edit class="drawer-icon" />
          Edit
        </div>
      </Button>
    {/if}

    {#if isPlaylistOwner && variant === "header" && videos && videos.length > 0}
      <EditListDrawer
        bind:items={videos}
        title="Reorder playlist videos"
        subtitle="Drag the handle to reorder videos"
        triggerClass="drawer-button"
        triggerVariant="ghost"
        onReorder={handleVideoReorder}
        onClose={() => {
          invalidate("supabase:db:playlists");
        }}
      >
        {#snippet trigger()}
          <div class="flex justify-between items-center w-full">
            <div class="flex items-center gap-2">
              <ArrowDownUp class="drawer-icon" />
              Reorder videos
            </div>
            <ChevronRight />
          </div>
        {/snippet}

        {#snippet itemRenderer(item)}
          {@const video = item as Video}
          <img
            src={video.thumbnail_url}
            alt={video.title}
            class="h-[60px] aspect-video pointer-events-none"
          />
          <div class="flex flex-col gap-1 flex-1 min-w-0 pointer-events-none">
            <p class="font-normal text-sm break-words line-clamp-2 leading-5">
              {video.title}
            </p>
            <p class="text-xs text-muted-foreground tracking-tight">
              {SOURCE_INFO[video.source].displayName}
            </p>
          </div>
        {/snippet}

        {#snippet emptyState()}
          <div class="flex items-center justify-center h-32">
            <p class="text-muted-foreground">No videos to reorder</p>
          </div>
        {/snippet}
      </EditListDrawer>
    {/if}

    {#if variant === "list-items"}
      {@const filteredPlaylists = playlists.filter(
        (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
      )}
      <Drawer.NestedRoot bind:open={openPlaylistDrawer} handleOnly={true}>
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
        <Drawer.Content class="bg-background flex flex-col min-h-[100%] drawer">
          <div class="flex-shrink-0 p-4">
            <Drawer.Header>
              <Drawer.Title class="text-xl">Add to playlist</Drawer.Title>
            </Drawer.Header>
          </div>
          {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
            {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
              <Button
                class="drawer-playlist-button"
                variant="ghost"
                onclick={() => {
                  handleAddVideosToPlaylist({
                    videos: [videos[0]],
                    playlist: addPlaylist,
                    supabase,
                    session,
                  });
                  openPlaylistDrawer = false;
                  closeDrawer();
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
        </Drawer.Content>
      </Drawer.NestedRoot>
    {/if}

    {#if playlist && isPlaylistOwner && variant === "list-items" && videos.length === 1}
      <Button
        class="drawer-button"
        variant="ghost"
        onclick={() => {
          handleRemoveVideosFromPlaylist({
            videos: [videos[0]],
            playlist,
            supabase,
          });
          closeDrawer();
        }}
      >
        <div class="flex gap-2 items-center">
          <MinusCircle class="drawer-icon" />
          Remove from playlist
        </div>
      </Button>
    {/if}

    {#if playlist && variant === "list-items" && isPlaylistOwner && videos.length === 1}
      <Button
        class="drawer-button"
        variant="ghost"
        onclick={() => {
          handleUpdatePlaylistImage({
            playlist,
            thumbnailUrl: videos[0].thumbnail_url,
            thumbnailMaxResUrl: videos[0].thumbnail_maxres_url,
            supabase,
          });
          closeDrawer();
        }}
      >
        <div class="flex gap-2 items-center">
          <ImagePlay class="drawer-icon" />
          Set as playlist image
        </div>
      </Button>
    {/if}

    {#if session && variant === "list-items" && videos.length === 1 && isVideoWithTimestamp(videos[0])}
      <Button
        class="drawer-button"
        variant="ghost"
        onclick={async () => {
          ({ updatedVideos: videos } = await handleDeleteVideosTimestamp({
            videos: [videos[0]],
            supabase,
            session,
          }));
          closeDrawer();
        }}
      >
        <div class="flex gap-2 items-center">
          <TimerReset class="drawer-icon" />
          Reset Progress
        </div>
      </Button>
    {/if}

    {#if (variant === "list-items" && videos.length === 1 && !isVideoWithTimestamp(videos[0])) || (isVideoWithTimestamp(videos[0]) && !videos[0].watched_at)}
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
          closeDrawer();
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
          closeDrawer();
        }}
      >
        <div class="flex items-center gap-2">
          <CircleMinus class="drawer-icon" />
          Delete Playlist
        </div>
      </Button>
    {/if}
  </div>

  <!-- Footer -->
  <div class="p-2 mt-auto">
    <button
      onclick={closeDrawer}
      class={buttonVariants({
        class: "drawer-button-footer w-full",
        variant: "outline",
      })}
    >
      Close
    </button>
  </div>
</div>
