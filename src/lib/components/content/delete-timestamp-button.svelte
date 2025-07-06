<script lang="ts">
  import { X } from "@lucide/svelte";
  import Button from "../ui/button/button.svelte";
  import type { Video } from "$lib/supabase/videos";
  import type { ContentDisplayProps } from "./content";
  import { handleDeleteVideosTimestamp } from "../video/video-service";

  let {
    video = $bindable(),
    manualHover,
    isContinueVideos,
    supabase,
    session,
  }: Pick<
    ContentDisplayProps,
    "isContinueVideos" | "videos" | "supabase" | "session"
  > & {
    video: Video;
    manualHover?: boolean;
  } = $props();
</script>

<Button
  variant="ghost"
  size="icon"
  class="flex flex-row-reverse items-center relative visible
                   cursor-pointer will-change-transform group/remove w-full h-fit"
  onclick={(e) => {
    e.preventDefault();
    handleDeleteVideosTimestamp({
      videos: [video],
      session,
      supabase,
    });
  }}
>
  <X
    class="peer invisible {manualHover &&
      'visible bg-secondary'} z-40  mr-0.5 mt-0.5"
  />
  <span
    class="absolute invisible group-hover/remove:static text-sm group-hover/remove:visible
                    transition-transform duration-300 ease-out z-30 p-2 group-hover/remove:translate-x-0 translate-x-2
                      will-change-transform"
  >
    {isContinueVideos ? "Remove" : "Reset"}
  </span>
</Button>
