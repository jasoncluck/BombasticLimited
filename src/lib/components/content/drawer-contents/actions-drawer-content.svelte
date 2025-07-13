<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import type { ContentState } from "$lib/state/content.svelte";
  import type { DrawerState } from "$lib/state/drawer.svelte";
  import Button from "../../ui/button/button.svelte";
  import * as Drawer from "$lib/components/ui/drawer/index.js";

  import {
    ArrowDownUp,
    ChevronRight,
    CircleCheck,
    CircleMinus,
    Edit,
    ImagePlay,
    ListVideo,
    PlusCircle,
    TimerReset,
  } from "@lucide/svelte";
  import {
    handleAddVideosToPlaylist,
    handleDeletePlaylist,
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
  import FullHeightDrawer from "./full-height-drawer.svelte";

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

  // New function to open the edit list drawer
  function openEditListDrawer() {
    drawerState.open({
      component: EditListDrawer,
      props: {
        items: videos,
        onReorder: handleVideoReorder,
        onClose: () => {
          invalidate("supabase:db:playlists");
        },
      },
      title: "Reorder playlist videos",
      options: {
        fullHeight: true,
        nested: true,
      },
    });
  }
</script>

<Drawer.Content class="outline-none">
  <Drawer.Header class="text-left mx-4">
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
  </Drawer.Header>

  <hr />

  <!-- Action Buttons -->
  <div class="flex flex-col">
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
      <!-- Updated to use drawerState instead of FullHeightDrawer component -->
      <Button
        class="drawer-button"
        variant="ghost"
        onclick={openEditListDrawer}
      >
        <div class="flex justify-between items-center w-full">
          <div class="flex items-center gap-2">
            <ArrowDownUp class="drawer-icon" />
            Reorder videos
          </div>
          <ChevronRight />
        </div>
      </Button>
    {/if}

    {#if variant === "list-items"}
      {@const filteredPlaylists = playlists.filter(
        (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
      )}

      <FullHeightDrawer
        title="Add to playlist"
        handleOnly={true}
        nested={true}
        onClose={() => {
          invalidate("supabase:db:playlists");
        }}
      >
        {#snippet trigger()}
          <div class="flex justify-between items-center w-full">
            <div class="flex gap-2 items-center">
              <PlusCircle class="drawer-icon" />
              Add to playlist
            </div>
            <ChevronRight />
          </div>
        {/snippet}

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
      </FullHeightDrawer>
    {/if}

    <!-- Rest of your existing action buttons remain the same -->
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
    <Button
      class="drawer-button-footer"
      variant="outline"
      onclick={closeDrawer}
    >
      Close
    </Button>
  </div>
</Drawer.Content>
