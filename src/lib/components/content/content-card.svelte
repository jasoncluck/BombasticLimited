<script lang="ts">
  import Progress from "../ui/progress/progress.svelte";
  import { getVideoSecondsOffset } from "../video/video-service";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import { userPreferences } from "$lib/state/user-preferences.svelte";
  import DeleteTimestampButton from "./delete-timestamp-button.svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { getContentState } from "$lib/state/content.svelte";
  import { Check } from "@lucide/svelte";
  import { handleContentNavigation, type ContentDisplayProps } from "./content";

  type ContentCardProps = {
    video: Video;
  } & Pick<
    ContentDisplayProps,
    | "isContinueVideos"
    | "playlistContentFilter"
    | "contentFilter"
    | "videos"
    | "playlists"
    | "supabase"
    | "session"
  > &
    HTMLAnchorAttributes;

  const {
    video,
    videos,
    isContinueVideos,
    contentFilter,
    supabase,
    session,
    ...restProps
  }: ContentCardProps = $props();

  const contentState = getContentState();
</script>

<a
  class="group transform will-change-transform cursor-pointer mb-6"
  onclick={(e) => {
    e.preventDefault();
    contentState.handleSelectVideos({ event: e, video, videos });
    handleContentNavigation({ video, contentFilter });
  }}
  {...restProps}
>
  <div role="button" tabindex="0" class="text-left cursor-pointer">
    <div class="relative">
      <img
        class="w-full aspect-[16/9] h-auto"
        src={video.thumbnail_url}
        alt={video.title}
      />
      {#if isVideoWithTimestamp(video) && (video.video_start_seconds || video.watched_at)}
        <div class="absolute top-0.5 right-0.5">
          <DeleteTimestampButton
            {isContinueVideos}
            {video}
            {videos}
            {supabase}
            {session}
          />
        </div>
      {/if}
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
    <p class="text-sm p-2 transition-colors duration-150 ease-out">
      {video.title}
    </p>
  </div>

  <p
    class="text-xs/4 text-muted-foreground transform px-2
      @sm:absolute pointer-events-none
      {contentState.hoveredVideo?.id === video.id
      ? '@sm:bg-secondary @sm:invisible @sm:group-hover:bg-transparent'
      : ''}"
  >
    {new Date(video.published_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}
  </p>
  {#if userPreferences.contentDescription !== "NONE"}
    <p
      class=" @sm:opacity-0 text-sm
    @sm:absolute p-2 px-4 w-full pointer-events-none -ml-2
  {contentState.hoveredVideo?.id === video.id
        ? '@sm:opacity-100 @sm:bg-secondary'
        : ''}
        transform will-change-transform
        z-50 break-anywhere whitespace-pre-line
          {userPreferences.contentDescription === 'BRIEF' &&
        'line-clamp-3  py-1'}"
    >
      {video.description}
    </p>
  {/if}
</a>
