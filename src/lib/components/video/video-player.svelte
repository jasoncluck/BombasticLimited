<script lang="ts">
  import { videoDurationToSeconds } from "$lib/components/video/video-service.js";
  import YoutubeEmbed from "$lib/components/video/youtube-embed.svelte";
  import { getPageState } from "$lib/state/page.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { CombinedContentFilter } from "../content/content-filter";
  import ContentDropdown from "../content/content-dropdown.svelte";
  import { Ellipsis } from "@lucide/svelte";
  import Button from "../ui/button/button.svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";

  interface ProcessedLine {
    text: string;
    hasTimestamp: boolean;
    timestamp?: number;
  }

  const {
    video,
    playlist,
    contentFilter,
    supabase,
    session,
    baseUrl = "/video",
  }: {
    video: Video;
    playlist?: Playlist | null;
    contentFilter: CombinedContentFilter;
    supabase: SupabaseClient;
    session: Session | null;
    baseUrl?: string;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  const pageState = getPageState();

  // Process the description to extract timestamp information but don't create HTML
  const processTimestamps = (description: string): ProcessedLine[] => {
    if (!description) return [];

    // Regular expression to match timestamps (e.g., hh:mm:ss, mm:ss, h:mm:ss)
    const timestampRegex = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;

    const lines = description.split("\n");
    const processedLines: ProcessedLine[] = [];

    for (const line of lines) {
      const matches = [...line.matchAll(timestampRegex)];

      if (matches.length > 0) {
        const [, hoursOrMinutes, minutesOrSeconds, maybeSeconds] = matches[0];
        let totalSeconds = 0;

        if (maybeSeconds !== undefined) {
          // Format is hh:mm:ss
          const hours = parseInt(hoursOrMinutes, 10);
          const minutes = parseInt(minutesOrSeconds, 10);
          totalSeconds =
            hours * 3600 + minutes * 60 + parseInt(maybeSeconds, 10);
        } else {
          // Format is mm:ss
          const minutes = parseInt(hoursOrMinutes, 10);
          const seconds = parseInt(minutesOrSeconds, 10);
          totalSeconds = minutes * 60 + seconds;
        }

        processedLines.push({
          text: line,
          hasTimestamp: true,
          timestamp: totalSeconds,
        });
      } else {
        processedLines.push({
          text: line,
          hasTimestamp: false,
        });
      }
    }

    return processedLines;
  };

  const formatPublishedDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
</script>

<div class="flex flex-col">
  <YoutubeEmbed
    {supabase}
    {session}
    {video}
    {contentFilter}
    {playlist}
    durationSeconds={videoDurationToSeconds(video?.duration)}
  />

  <div class="flex justify-between mt-6">
    <div class="flex flex-wrap items-center gap-2">
      <p class="font-semibold">{video.title}</p>

      <span class="text-muted-foreground">
        {formatPublishedDate(video.published_at)}
      </span>
    </div>
    <div class="ml-auto">
      {#if mediaQueryState.canHover}
        <ContentDropdown videos={[video]} variant="item" {supabase} {session} />
      {:else}
        <Button
          variant="ghost"
          class="outline-none ghost-button-minimal"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            contentState.handleDrawer({
              video,
              variant: "item",
            });
          }}
        >
          <Ellipsis />
        </Button>
      {/if}
    </div>
  </div>

  {#if video?.description}
    <div class="whitespace-pre-line mt-4">
      {#each processTimestamps(video.description) as line (line)}
        {#if line.hasTimestamp}
          <div>
            <a
              class="timestamp-link text-left w-full hover:underline hover:text-primary"
              href="{baseUrl}/{video.id}?t={line.timestamp}"
              onclick={() => {
                pageState.contentScrollPosition = { scrollTop: 0 };
              }}
            >
              {line.text}
            </a>
          </div>
        {:else}
          <p>{line.text}</p>
        {/if}
      {/each}
    </div>
  {/if}
</div>
