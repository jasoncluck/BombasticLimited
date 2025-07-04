<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import { type Video } from "$lib/supabase/videos";
  import { Play } from "@lucide/svelte";
  import { handleContentNavigation } from "../content";
  import { type Playlist } from "$lib/supabase/playlists";
  import Button from "$lib/components/ui/button/button.svelte";
  import type { CombinedContentFilter } from "../content-filter";

  const contentState = getContentState();
  const {
    video,
    playlist,
    contentFilter,
  }: {
    video: Video;
    playlist?: Playlist;
    contentFilter?: CombinedContentFilter;
  } = $props();

  const isHovering = $derived(contentState.hoveredVideo?.id === video.id);
</script>

<div class="flex justify-center items-center">
  <Button
    class="{isHovering ? 'opacity-100' : 'opacity-0'} ghost-button-minimal"
    variant="ghost"
    size="icon"
    title="Play video"
    onclick={(e) => {
      e.stopPropagation();
      e.preventDefault();

      handleContentNavigation({
        video,
        playlist,
        contentFilter,
      });
    }}
  >
    <Play
      class="cursor-pointer stroke-primary fill-primary brightness-[105%]"
    />
  </Button>
</div>
