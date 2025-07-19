<script lang="ts">
  import Progress from "../ui/progress/progress.svelte";
  import { getVideoSecondsOffset } from "../video/video-service";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import { userPreferences } from "$lib/state/user-preferences.svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte";
  import { ArrowDown, ArrowUp, Check, ListVideo } from "@lucide/svelte";
  import type { ContentDisplayProps } from "./content";
  import ContentDropdown from "./content-dropdown.svelte";
  import { goto } from "$app/navigation";
  import { getSortDisplayName } from "./content-filter";
  import ContentCardSkeleton from "./content-card-skeleton.svelte";

  type ContentCardProps = {
    video?: Video;
    isLoading?: boolean;
  } & Pick<
    ContentDisplayProps,
    | "isContinueVideos"
    | "playlistContentFilter"
    | "contentFilter"
    | "videos"
    | "playlists"
    | "sectionId"
    | "supabase"
    | "session"
  > &
    HTMLAnchorAttributes;

  const {
    video,
    isLoading = false,
    sectionId = DEFAULT_SECTION_ID,
    playlists,
    supabase,
    session,
  }: ContentCardProps = $props();

  const contentState = getContentState();

  const selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? [],
  );

  const hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  const isHovered = $derived(video && hoveredVideo?.id === video.id);
  const isSelected = $derived(
    video && selectedVideos.some((v) => v.id === video.id),
  );
  const isContextMenuOpen = $derived(
    contentState.isContextMenuOpenForSection(sectionId) && isSelected,
  );
  const isDragActive = $derived(
    contentState.dragContentType === "video" &&
      contentState.draggedFromSectionId === sectionId &&
      isHovered,
  );

  // Show description when:
  // 1. Card is hovered (regardless of context menu state)
  // 2. Card has context menu open (and is selected)
  // 3. Card is being dragged
  const shouldShowDescription = $derived(
    isHovered || isSelected || isContextMenuOpen || isDragActive,
  );
</script>

{#if isLoading || !video}
  <ContentCardSkeleton />
{:else}
  <div class="group transform will-change-transform cursor-pointer mb-6 w-full">
    <div role="button" tabindex="0" class="text-left cursor-pointer">
      <div class="relative">
        <img
          class="w-full aspect-[16/9] h-auto"
          src={video.thumbnail_url}
          alt={video.title}
        />
        <div class="absolute top-0.5 right-0.5">
          <ContentDropdown
            {playlists}
            videos={[video]}
            variant="list-items"
            {sectionId}
            {supabase}
            {session}
          />
        </div>
        {#if isVideoWithTimestamp(video) && !video.watched_at && video.video_start_seconds && video.duration}
          <Progress
            class="absolute -bottom-1 left-0 h-[2%]"
            value={Math.floor(
              getVideoSecondsOffset({
                duration: video.duration,
                timestampSeconds: video.video_start_seconds,
              }),
            )}
          />
        {:else if "watched_at" in video && video.watched_at}
          <div
            class="absolute bottom-0 right-0 flex bg-background-lighter
            w-full gap-1 px-1 items-center justify-center"
          >
            <Check class="text-primary" />
            <p class="text-xs text-primary">Watched</p>
          </div>
        {/if}
      </div>

      <p class="text-sm p-2">
        {video.title}
      </p>

      {#if isVideoWithTimestamp(video) && video.playlist_name && video.playlist_short_id}
        <div
          class="flex items-center gap-2 mt-1 mb-3 px-2 text-xs text-secondary-foreground hover:text-primary line-clamp-2 z-10"
        >
          <ListVideo size="16" class="shrink-0 self-start" />
          <div class="flex flex-col gap-2 justify-center w-full">
            <a
              onclick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                goto(`playlist/${video.playlist_short_id}`);
              }}
              href={`playlist/${video.playlist_short_id}`}
              class="whitespace-normal flex gap-2 items-center truncate"
            >
              <span class="truncate">{video.playlist_name}</span>
            </a>
            <div class="flex items-center text-muted-foreground shrink-0">
              {#if video.playlist_sorted_by}
                <div class="flex items-center shrink-0">
                  <span class="text-xs truncate">
                    {getSortDisplayName({
                      key: video.playlist_sorted_by,
                      view: "playlist",
                    })}
                  </span>
                  {#if video.playlist_sort_order}
                    {#if video.playlist_sort_order === "ascending"}
                      <ArrowUp size="14" class="shrink-0 ml-1" />
                      <span class="sr-only">Sorted Ascending</span>
                    {:else}
                      <ArrowDown size="14" class="shrink-0 ml-1" />
                      <span class="sr-only">Sorted Descending</span>
                    {/if}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <p
        class="text-xs/4 text-muted-foreground transform px-2 pointer-events-none w-full @sm:absolute
        {shouldShowDescription ? '@sm:invisible @sm:bg-transparent ' : 'block'}"
      >
        {new Date(video.published_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>

      <!-- Description overlay -->
      {#if userPreferences.contentDescription !== "NONE"}
        <p
          class="@sm:opacity-0 text-sm @sm:absolute pointer-events-none
      {shouldShowDescription ? '@sm:opacity-100 @sm:bg-secondary' : ''}
      transform will-change-transform rounded-b-md
      z-50 break-anywhere whitespace-pre-line px-4
      {userPreferences.contentDescription === 'BRIEF' &&
            'line-clamp-4 overflow-clip pb-1'}"
          style="left: -0.5rem; right: -0.5rem; width: auto;"
        >
          {video.description}
        </p>
      {/if}
    </div>
  </div>
{/if}
