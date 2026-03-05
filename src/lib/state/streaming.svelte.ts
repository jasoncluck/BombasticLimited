import type { Source } from '$lib/constants/source';

export const activeStreams = $state<{ sources: Source[] }>({
  sources: [],
});
