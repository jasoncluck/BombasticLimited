<script lang="ts">
  import { videoDurationToSeconds } from "$lib/components/video/video-service.js";
  import YoutubeEmbed from "$lib/components/video/youtube-embed.svelte";
  import { pageState } from "$lib/state/page.svelte";
  import type { Video } from "$lib/supabase/videos";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";

  interface ProcessedLine {
    text: string;
    hasTimestamp: boolean;
    timestamp?: number;
  }

  const {
    video,
    videoId,
    supabase,
    session,
    baseUrl = "/video",
  }: {
    video: Video;
    videoId: string;
    supabase: SupabaseClient;
    session: Session | null;
    baseUrl?: string;
  } = $props();

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

<div class="flex flex-col gap-6">
  <YoutubeEmbed
    {supabase}
    {session}
    {video}
    durationSeconds={videoDurationToSeconds(video?.duration)}
  />

  <div class="flex justify-between">
    <h2 class="font-semibold pr-4">{video.title}</h2>
    <span class="text-muted-foreground">
      {formatPublishedDate(video.published_at)}
    </span>
  </div>

  {#if video?.description}
    <div class="whitespace-pre-line">
      {#each processTimestamps(video.description) as line (line)}
        {#if line.hasTimestamp}
          <div>
            <a
              class="timestamp-link text-left w-full hover:underline hover:text-primary"
              href="{baseUrl}/{videoId}?t={line.timestamp}"
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
