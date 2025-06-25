<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import type { ContentDisplayProps } from "../content";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { getContentState } from "$lib/state/content.svelte";
  import DeleteTimestampButton from "../delete-timestamp-button.svelte";
  import Progress from "$lib/components/ui/progress/progress.svelte";
  import { getVideoSecondsOffset } from "$lib/components/video/video-service";

  type ContentCardProps = {
    video: Video;
    playlist?: Playlist;
  } & Pick<
    ContentDisplayProps,
    | "isContinueVideos"
    | "playlist"
    | "playlistContentFilter"
    | "videos"
    | "playlists"
    | "supabase"
    | "session"
  > &
    HTMLAnchorAttributes;

  const {
    video = $bindable(),
    videos,
    playlist,
    isContinueVideos,
    supabase,
    session,
    ...restProps
  }: ContentCardProps = $props();

  const contentState = getContentState();
</script>

<a class="relative" {...restProps}>
  <img
    class="w-full aspect-[16/9] h-auto {contentState.isSelectionMode &&
      'opacity-50'}"
    src={video.thumbnail_url}
    alt={video.title}
    loading="lazy"
  />
  {#if isVideoWithTimestamp(video) && video.video_start_seconds}
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
  {#if isVideoWithTimestamp(video) && video.video_start_seconds && video.duration}
    <Progress
      class="absolute bottom-0 left-0 h-[2%]"
      value={Math.floor(
        getVideoSecondsOffset({
          duration: video.duration,
          timestampSeconds: video.video_start_seconds,
        }),
      )}
    />
  {/if}
</a>
