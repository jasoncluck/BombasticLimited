<script lang="ts">
  import type { SuperValidated } from "sveltekit-superforms";
  import type { Playlist } from "$lib/supabase/playlists";
  import * as ImageCropper from "$lib/components/ui/image-cropper";
  import type { PlaylistSchema } from "../../../../routes/playlist/[shortId]/schema";
  import PlaylistEditDrawerForm from "./playlist-edit-drawer-form.svelte";

  let {
    form,
    playlist,
  }: {
    form: SuperValidated<PlaylistSchema>;
    playlist: Playlist;
  } = $props();
</script>

<ImageCropper.Root src={playlist.processedImageUrl ?? undefined}>
  <PlaylistEditDrawerForm {form} {playlist} />
</ImageCropper.Root>
