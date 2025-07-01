<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import type { Video } from "$lib/supabase/videos";
  import { Play } from "@lucide/svelte";
  import { handleContentNavigation } from "../content";
  import type { Playlist } from "$lib/supabase/playlists";
  import Button from "$lib/components/ui/button/button.svelte";

  const contentState = getContentState();
  const { video, playlist }: { video: Video; playlist?: Playlist } = $props();

  const isHovering = $derived(contentState.hoveredVideo?.id === video.id);
</script>

<Button
  class="{isHovering
    ? 'opacity-100'
    : 'opacity-0'} ghost-button-minimal transition-opacity duration-150"
  variant="ghost"
  size="icon"
  title="Play video"
  onclick={(e) => {
    contentState.handlePlayButtonClick({
      event: e,
      video,
      playlist,
      onNavigate: (video, playlist) => {
        handleContentNavigation({ video, playlist });
      },
    });
    handleContentNavigation({ video, playlist });
  }}
>
  <Play class="cursor-pointer stroke-primary fill-primary brightness-[105%]" />
</Button>
