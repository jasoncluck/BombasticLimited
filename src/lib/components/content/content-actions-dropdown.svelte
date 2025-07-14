<script lang="ts">
  import {
    CircleCheck,
    CircleMinus,
    Edit,
    Ellipsis,
    ImagePlay,
    ListChecks,
    MinusCircle,
    PlusCircle,
    TimerReset,
  } from "@lucide/svelte";
  import * as DropdownMenu from "../ui/dropdown-menu";
  import {
    handleRemoveVideosFromPlaylist,
    handleAddVideosToPlaylist,
    handleUpdatePlaylistImage,
    handleDeletePlaylist,
  } from "../playlist/playlist-service";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import ScrollArea from "../ui/scroll-area/scroll-area.svelte";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideosTimestamp,
  } from "../video/video-service";
  import Button from "../ui/button/button.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import type { ContentSelectVariant } from "./content";

  let {
    videos = $bindable(),
    playlist,
    playlists,
    variant,
    onSelectAll,
    onPlaylistEdit,
    sectionId,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    // For items like deselecting only makes sense when using the content selector
    variant: ContentSelectVariant;
    sectionId: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onSelectAll?: () => void;
    onPlaylistEdit?: () => void;
  } = $props();

  const contentState = getContentState();

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
  <DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          onclick={(e) => {
            if (contentState.isDropdownMenuOpen) {
              contentState.isDropdownMenuOpen = false;
            }
            if (variant === "list-items" && videos.length > 0) {
              contentState.selectedVideosBySection[sectionId] = [videos[0]];
            }
            // Don't allow double click to go through to navigate
            e.stopPropagation();
          }}
          class="outline-none ghost-button-minimal  {open
            ? 'scale-105'
            : ''} {variant !== 'list-items' || isHovering
            ? 'opacity-100'
            : 'opacity-0'}"
        >
          <Ellipsis />
          <span class="sr-only">
            {variant === "header"
              ? "Actions for selected items"
              : "Actions for video"}
          </span>
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start">
      {#if variant === "header"}
        <DropdownMenu.Item
          class="p-2"
          onclick={() => {
            onSelectAll?.();
          }}
        >
          <div class="flex items-center gap-2">
            <ListChecks class="dropdown-icon" />
            Select All
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if isPlaylistOwner && variant === "header"}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={() => onPlaylistEdit?.()}
        >
          <div class="flex items-center gap-2">
            <Edit class="dropdown-icon" />
            Edit
          </div>
        </DropdownMenu.Item>
      {/if}

      {@const filteredPlaylists = playlists.filter(
        (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
      )}
      {#if (variant !== "header" && filteredPlaylists.length > 0) || (variant === "header" && videos.length > 0)}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger onclick={(e) => e.stopPropagation()}>
            <div class="flex gap-2 items-center">
              <PlusCircle class="dropdown-icon" />
              Add to playlist
            </div>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            align="start"
            class="z-50 overflow-hidden"
            sideOffset={5}
          >
            <ScrollArea
              type="scroll"
              class={filteredPlaylists.length <= 6 ? "h-auto" : "h-56"}
            >
              {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                  <DropdownMenu.Item
                    class="p-2"
                    onclick={() => {
                      handleAddVideosToPlaylist({
                        videos,
                        playlist: addPlaylist,
                        supabase,
                        session,
                      });
                    }}
                  >
                    {addPlaylist.name}
                  </DropdownMenu.Item>
                {/if}
              {/each}
            </ScrollArea>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      {/if}

      {#if playlist && isPlaylistOwner && videos && videos.length > 0}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            const { error } = await handleRemoveVideosFromPlaylist({
              videos,
              playlist,
              supabase,
            });

            if (!error) {
              videos = [];
            }
          }}
        >
          <div class="flex gap-2 items-center">
            <MinusCircle class="dropdown-icon" />
            Remove from playlist
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if contentState.selectedVideosBySection[sectionId] && contentState.selectedVideosBySection[sectionId].length === 1 && playlist && variant === "list-items" && isPlaylistOwner}
        {@const selectedVideo =
          contentState.selectedVideosBySection[sectionId][0]}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () =>
            await handleUpdatePlaylistImage({
              playlist,
              thumbnailUrl: selectedVideo.thumbnail_url,
              thumbnailMaxResUrl: selectedVideo.thumbnail_maxres_url,
              supabase,
            })}
        >
          <div class="flex gap-2 items-center">
            <ImagePlay class="dropdown-icon" />
            Set as playlist image
          </div>
        </DropdownMenu.Item>
      {/if}
      {#if session && variant !== "item" && videos.length > 0 && videos.some( (v) => isVideoWithTimestamp(v), )}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            ({ updatedVideos: videos } = await handleDeleteVideosTimestamp({
              videos,
              supabase,
              session,
            }));
          }}
        >
          <div class="flex items-center gap-2">
            <TimerReset class="dropdown-icon" />
            Reset Progress
          </div>
        </DropdownMenu.Item>
      {/if}
      {#if variant !== "item" && videos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            if (videos) {
              ({ updatedVideos: videos } = await handleAddVideoTimestamp({
                videoTimestamps: videos.map((v) => ({
                  videoId: v.id,
                  watchedAt: new Date(),
                })),
                session,
                supabase,
              }));
            }
          }}
        >
          <div class="flex items-center gap-2">
            <CircleCheck class="dropdown-icon" />
            Set as watched
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if playlist && variant === "header"}
        <DropdownMenu.Item
          class="cursor-pointer"
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
          }}
        >
          <div class="flex items-center gap-2">
            <CircleMinus class="dropdown-icon" />
            Delete Playlist
          </div>
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
