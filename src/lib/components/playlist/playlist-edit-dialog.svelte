<script lang="ts">
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import {
    playlistSchema,
    type PlaylistSchema,
  } from "../../../routes/playlist/[shortId]/schema";
  import { Input } from "$lib/components/ui/input";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Form from "$lib/components/ui/form";
  import { Button } from "$lib/components/ui/button";
  import type { Playlist } from "$lib/supabase/playlists";
  import { zodClient } from "sveltekit-superforms/adapters";
  import { EditIcon, ListVideo, Loader } from "@lucide/svelte";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import * as ImageCropper from "$lib/components/ui/image-cropper";
  import {
    useImageCropperCrop,
    useImageCropperCropper,
  } from "$lib/components/ui/image-cropper/image-cropper.svelte.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Popover from "$lib/components/ui/popover";
  import Checkbox from "$lib/components/ui/checkbox/checkbox.svelte";
  import { getCroppedPlaylistImageUrl } from "$lib/components/playlist/playlist-service";
  import type { Snippet } from "svelte";
  import ScrollArea from "../ui/scroll-area/scroll-area.svelte";
  import { parseImageProperties } from "./playlist";
  import { getFlash, updateFlash } from "sveltekit-flash-message";
  import { page } from "$app/state";
  import type { Session } from "@supabase/supabase-js";
  import { getPlaylistState } from "$lib/state/playlist.svelte";
  import { getSidebarState } from "$lib/state/sidebar.svelte";
  import { invalidate } from "$app/navigation";

  let {
    form,
    formId,
    playlist,
    open = $bindable(),
    trigger,
    session,
  }: {
    form: SuperValidated<PlaylistSchema>;
    formId?: string;
    playlist: Playlist;
    trigger: Snippet;
    open: boolean;
    session: Session | null;
  } = $props();

  const playlistState = getPlaylistState();
  const sidebarState = getSidebarState();
  const flash = getFlash(page);
  let isSubmitting = $state(false);
  let isPublic = $state(playlist.type === "Public");

  const cropperState = useImageCropperCropper();
  const cropState = useImageCropperCrop();

  const isPlaylistOwner = $derived(playlist.created_by === session?.user.id);

  const playlistForm = $derived(
    superForm(form, {
      validators: zodClient(playlistSchema),
      id: formId ?? "playlist-dialog-form",
      dataType: "json",
      onSubmit() {
        isSubmitting = true;
        $flash = undefined;
      },
      onResult(event) {
        if (event.result.type !== "success") {
          isSubmitting = false;
        }
      },
      async onUpdated(event) {
        updateFlash(page);
        if (event.form.valid) {
          const { isDeletingPlaylistImage, ...data } = event.form.data;
          open = false;
          isSubmitting = false;
          playlistForm.reset();

          const updatedPlaylist = Object.assign(playlist, data);
          if (isDeletingPlaylistImage) {
            updatedPlaylist.thumbnail_url = null;
            updatedPlaylist.thumbnail_maxres_url = null;
          } else {
            await getCroppedPlaylistImageUrl({
              imageProperties: parseImageProperties(playlist.image_properties),
              thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
              thumbnailUrl: playlist.thumbnail_url,
            });
          }
          sidebarState.refreshData();
          invalidate("supabase:db:playlists");
        }
      },
    }),
  );
  const { form: formData, enhance } = $derived(playlistForm);

  $effect(() => {
    $formData.type = isPublic ? "Public" : "Private";

    if (cropState.rootState.pixelCrop) {
      $formData.image_properties = cropState.rootState.pixelCrop;
    }

    cropperState.rootState.tempUrl =
      playlist.thumbnail_maxres_url ?? playlist.thumbnail_url;
  });
</script>

<Dialog.Root
  bind:open
  onOpenChange={(open) => {
    if (open === false) {
      playlistState.openEditPlaylist = false;
    }
  }}
>
  {#if isPlaylistOwner}
    <Dialog.Trigger class="outline-none">
      {@render trigger()}
    </Dialog.Trigger>
  {:else}
    <div class="outline-none">
      {@render trigger()}
    </div>
  {/if}
  <Dialog.Content
    class="min-w-[375px] sm:max-w-[800px] w-[90%] h-[90%] sm:h-auto"
  >
    <ScrollArea type="scroll">
      <form method="POST" use:enhance class="overflow-hidden">
        <Dialog.Header class="mb-4">
          <Dialog.Title>Edit Playlist</Dialog.Title>
        </Dialog.Header>

        <div class="flex flex-col sm:flex-row justify-center gap-4 mb-4">
          <div class="relative m-6 flex justify-center">
            {#if (playlist.thumbnail_maxres_url || playlist.thumbnail_url) && !$formData.isDeletingPlaylistImage}
              <div class="h-56 w-56 relative">
                <ImageCropper.Preview class="rounded-md h-full w-full" />
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="outline-none">
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        class="absolute -bottom-3 -right-3 rounded-full hover:brightness-110 hover:bg-secondary"
                        variant="secondary"
                        size="icon"
                      >
                        <EditIcon class="size-4" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start">
                    <DropdownMenu.Item
                      onclick={() => {
                        cropperState.rootState.open = true;
                      }}>Update crop</DropdownMenu.Item
                    >
                    <DropdownMenu.Item
                      onclick={() => {
                        $formData.isDeletingPlaylistImage = true;
                      }}>Remove photo</DropdownMenu.Item
                    >
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            {:else}
              <div class="flex justify-center items-center h-56 w-56">
                <ListVideo size={128} />
              </div>
              <Popover.Root>
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      class="absolute -bottom-3 -right-3 rounded-full"
                      variant="outline"
                      size="icon"
                    >
                      <EditIcon class="size-4" />
                    </Button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content align="start"
                  ><p class="text-sm">
                    Playlist images can only be set to thumbnails of videos
                    added to the playlist. Select a video to set it's thumbnail
                    as the playlist image. Once complete, the image can be
                    cropped using this button.
                  </p>
                </Popover.Content>
              </Popover.Root>
            {/if}
          </div>

          <ImageCropper.Dialog>
            <ImageCropper.Cropper cropShape="rect" />
            <ImageCropper.Controls>
              <ImageCropper.Crop />
              <ImageCropper.Cancel />
            </ImageCropper.Controls>
          </ImageCropper.Dialog>
          <div class="flex flex-col relative grow gap-2">
            <Form.Field form={playlistForm} name="name">
              <div
                class="md:grid md:grid-cols-4 items-center flex flex-wrap gap-2 md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <Form.Label for="name" class="text-right">Name</Form.Label>
                    <Input
                      {...props}
                      class="col-span-3"
                      bind:value={$formData.name}
                    />
                  {/snippet}
                </Form.Control>
              </div>
              <Form.FieldErrors class="mb-2" />
            </Form.Field>
            <Form.Field form={playlistForm} name="description" class="mb-2">
              <div
                class="md:grid md:grid-cols-4 items-center md:items-start flex flex-wrap gap-2 md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <!-- textarea border + pad = 9px -->
                    <Form.Label for="description" class="text-right mt-[9px]"
                      >Description</Form.Label
                    >
                    <Textarea
                      {...props}
                      class="col-span-3 max-h-64 md:min-h-40"
                      bind:value={$formData.description}
                    />
                  {/snippet}
                </Form.Control>
              </div>
              <Form.FieldErrors />
            </Form.Field>
            <Form.Field form={playlistForm} name="type">
              <div
                class="md:grid md:grid-cols-4 items-center md:items-start flex flex-wrap gap-2 md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <!-- textarea border + pad = 9px -->
                    <Form.Label for="isPublic" class="text-right cursor-pointer"
                      >Public Playlist</Form.Label
                    >
                    <Checkbox
                      {...props}
                      class="col-span-3 cursor-pointer"
                      bind:checked={isPublic}
                    />
                  {/snippet}
                </Form.Control>
              </div>
              <Form.FieldErrors />
            </Form.Field>
            <Form.Field form={playlistForm} name="id">
              <Form.Control>
                {#snippet children({ props })}
                  <Input {...props} hidden bind:value={$formData.id} />
                {/snippet}
              </Form.Control>
            </Form.Field>
            <Form.Field form={playlistForm} name="image_properties">
              <Form.Control>
                {#snippet children({ props })}
                  <Input
                    {...props}
                    hidden
                    bind:value={$formData.image_properties}
                  />
                {/snippet}
              </Form.Control>
            </Form.Field>
            <Form.Field form={playlistForm} name="isDeletingPlaylistImage">
              <Form.Control>
                {#snippet children({ props })}
                  <Input
                    {...props}
                    hidden
                    bind:value={$formData.isDeletingPlaylistImage}
                  />
                {/snippet}
              </Form.Control>
            </Form.Field>
          </div>
        </div>
        {#if $flash?.message && $flash?.type === "error"}
          <Alert.Root class="mb-4">
            <Alert.Title>Error when updating playlist</Alert.Title>
            <Alert.Description>{$flash.message}</Alert.Description>
          </Alert.Root>
        {/if}
        <Dialog.Footer>
          <Button type="submit">
            {#if isSubmitting}
              <Loader class="animate-spin" />
            {:else}
              Save Changes
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
