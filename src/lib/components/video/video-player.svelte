<script lang="ts">
  import { videoDurationToSeconds } from '$lib/components/video/video-service.js';
  import YoutubeEmbed from '$lib/components/video/youtube-embed.svelte';
  import { getPageState } from '$lib/state/page.svelte';
  import { page } from '$app/state';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Video } from '$lib/supabase/videos';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { CombinedContentFilter } from '../content/content-filter';
  import ContentDropdown from '../content/content-dropdown.svelte';
  import { Ellipsis } from '@lucide/svelte';
  import Button from '../ui/button/button.svelte';
  import { getContentState } from '$lib/state/content.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

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
  }: {
    video: Video;
    playlist?: Playlist | null;
    contentFilter: CombinedContentFilter;
    supabase: SupabaseClient;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const pageState = getPageState();

  // Get the base URL from the current page
  const baseUrl = $derived.by(() => {
    const pathSegments = page.url.pathname.split('/');
    // Remove the video ID from the end to get the base path
    pathSegments.pop();
    return pathSegments.join('/');
  });

  // Process the description to extract timestamp information but don't create HTML
  const processTimestamps = (description: string): ProcessedLine[] => {
    if (!description) return [];

    // Regular expression to match timestamps (e.g., hh:mm:ss, mm:ss, h:mm:ss)
    const timestampRegex = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;

    const lines = description.split('\n');
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
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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

  <!-- Improved header section with better wrapping -->
  <div
    class="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
  >
    <div
      class="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
    >
      <h1 class="leading-tight font-semibold break-words">{video.title}</h1>
      <span class="text-muted-foreground text-sm sm:text-base">
        {formatPublishedDate(video.published_at)}
      </span>
    </div>

    <div class="flex-shrink-0 self-start sm:self-center">
      {#if mediaQueryState.canHover}
        <ContentDropdown
          videos={[video]}
          variant="item"
          {contentFilter}
          {supabase}
          {session}
        />
      {:else}
        <Button
          variant="ghost"
          class="ghost-button-minimal outline-hidden"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            contentState.handleDrawer({
              video,
              variant: 'item',
            });
          }}
        >
          <Ellipsis />
        </Button>
      {/if}
    </div>
  </div>

  <!-- Improved description section with proper text wrapping -->
  {#if video?.description}
    <div class="mt-4 overflow-hidden">
      {#each processTimestamps(video.description) as line (line)}
        {#if line.hasTimestamp}
          <div class="break-words">
            <a
              class="timestamp-link hover:text-primary inline-block w-full text-left break-words hover:underline"
              href="{baseUrl}/{video.id}?t={line.timestamp}"
              onclick={() => {
                pageState.contentScrollPosition = { scrollTop: 0 };
              }}
            >
              {line.text}
            </a>
          </div>
        {:else}
          <p class="break-words whitespace-pre-line">{line.text}</p>
        {/if}
      {/each}
    </div>
  {/if}
</div>
