<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import * as Table from "$lib/components/ui/table/index.js";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import type { Video } from "$lib/supabase/videos";

  const contentState = getContentState();
  const { video }: { video: Video } = $props();
</script>
