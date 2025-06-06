<script lang="ts">
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { Radio } from "@lucide/svelte";
  import TwitchEmbed from "$lib/components/video/twitch-embed.svelte";
  import Content from "$lib/components/content/content.svelte";
  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { SOURCE_INFO } from "$lib/constants/source";
  import Button from "$lib/components/ui/button/button.svelte";

  let { data } = $props();
  const { videos, playlists, session, supabase, source, contentFilter } =
    $derived(data);
</script>

<div class="flex flex-col">
  <div class="flex justify-between">
    <h1 class="header-primary mb-2">
      {SOURCE_INFO[source].displayName}
    </h1>
    <Button variant="secondary" href={SOURCE_INFO[source].supportUrl}
      >Support {SOURCE_INFO[source].displayName}
    </Button>
  </div>
  {#if activeStreams.sources.includes(source)}
    <div class="flex flex-col items-start w-full mb-8">
      <h2 class="header-link">
        <div class="flex items-center">
          <Radio class="mr-2" /> Live
        </div>
      </h2>
      <TwitchEmbed channel={source} />
    </div>
  {/if}

  <div class="flex flex-col bg-background-lighter gap-4">
    <a
      href={`/${source}/latest`}
      class="header-link hover:underline cursor-pointer"
    >
      Latest Videos
    </a>
    <Content
      contentDisplay={userPreferences.contentDisplay}
      invalidateOnVideoChange={false}
      {videos}
      {playlists}
      {contentFilter}
      {session}
      {supabase}
    />
  </div>
</div>
