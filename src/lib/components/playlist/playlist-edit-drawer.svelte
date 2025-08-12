<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import {
    playlistSchema,
    type PlaylistSchema,
  } from '../../../routes/playlist/[shortId]/schema';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import { Input } from '$lib/components/ui/input';
  import * as Drawer from '$lib/components/ui/drawer';
  import * as Form from '$lib/components/ui/form';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import type { Playlist } from '$lib/supabase/playlists';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { EditIcon, ListVideo, Loader } from '@lucide/svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import * as ImageCropper from '$lib/components/ui/image-cropper';
  import {
    useImageCropperCrop,
    useImageCropperCropper,
  } from '$lib/components/ui/image-cropper/image-cropper.svelte.js';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Popover from '$lib/components/ui/popover';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
  import type { Snippet } from 'svelte';
  import type { Session } from '@supabase/supabase-js';
  import { page } from '$app/state';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { parseImageProperties } from './playlist';
  import { isLowResolutionThumbnail } from './playlist-service';

  let {
    form,
    formId,
    playlist,
    trigger,
    open = $bindable(),
    session,
    nested = false,
  }: {
    form: SuperValidated<PlaylistSchema>;
    formId?: string;
    trigger: Snippet;
    playlist: Playlist;
    open: boolean;
    session: Session | null;
    nested?: boolean;
  } = $props();

  const playlistState = getPlaylistState();
  let isSubmitting = $state(false);
  let isPublic = $state(playlist.type === 'Public');
  const flash = getFlash(page);

  const triggerSnippet = trigger;

  const cropperState = useImageCropperCropper();
  const cropState = useImageCropperCrop();

  const isPlaylistOwner = $derived(playlist.created_by === session?.user.id);
  const isLowResThumbnail = $derived(
    isLowResolutionThumbnail(
      playlist.thumbnail_maxres_url,
      playlist.thumbnail_url
    )
  );
  const sidebarState = getSidebarState();

  const playlistForm = superForm(form, {
    validators: zodClient(playlistSchema),
    id: formId ?? 'playlist-drawer-form',
    dataType: 'json',
    onSubmit() {
      $flash = undefined;
      isSubmitting = true;
    },
    async onUpdated(event) {
      isSubmitting = false;
      updateFlash(page);
      if (event.form.valid) {
        const { isDeletingPlaylistImage, ...data } = event.form.data;

        // Delay closing to allow animation to complete
        setTimeout(() => {
          open = false;
        }, 200);

        playlistForm.reset();

        const updatedPlaylist = Object.assign(playlist, data);
        if (isDeletingPlaylistImage) {
          updatedPlaylist.thumbnail_url = null;
          updatedPlaylist.thumbnail_maxres_url = null;
        }
        // Sidebar refresh will get server-processed images with AVIF support
        sidebarState.refreshData();
      }
    },
  });
  const { form: formData, enhance } = $derived(playlistForm);

  // Reset isSubmitting when drawer opens
  $effect(() => {
    if (open) {
      isSubmitting = false;
      // Refresh form data with current playlist values when drawer opens
      $formData.id = playlist.id;
      $formData.name = playlist.name;
      $formData.description = playlist.description ?? '';
      $formData.type = playlist.type;
      $formData.image_properties = parseImageProperties(
        playlist.image_properties
      );
      $formData.isDeletingPlaylistImage = false;
      isPublic = playlist.type === 'Public';
    }
  });

  $effect(() => {
    $formData.type = isPublic ? 'Public' : 'Private';

    if (cropState.rootState.pixelCrop) {
      $formData.image_properties = cropState.rootState.pixelCrop;
    }

    cropperState.rootState.tempUrl =
      playlist.thumbnail_maxres_url ?? playlist.thumbnail_url;
  });
</script>

<Drawer.Root
  bind:open
  handleOnly={true}
  {nested}
  onAnimationEnd={(open) => {
    if (open === false) {
      console.log('settin to false');
      playlistState.openEditPlaylist = false;
    }
  }}
>
  {#if !isPlaylistOwner}
    <div class="outline-none">
      {@render triggerSnippet()}
    </div>
  {:else}
    <Drawer.Trigger class="outline-none">
      {@render triggerSnippet()}
    </Drawer.Trigger>
  {/if}

  <Drawer.Content class="bg-background drawer flex min-h-[100%] flex-col">
    <div class="flex-shrink-0 p-4 pb-0">
      <Drawer.Header class="px-0">
        <Drawer.Title class="text-xl">Edit Playlist</Drawer.Title>
      </Drawer.Header>
    </div>

    <!-- Form now wraps the entire content area including footer -->
    <form
      method="POST"
      use:enhance
      id="playlist-drawer-form"
      class="flex min-h-0 flex-1 flex-col"
    >
      <div class="min-h-0 flex-1 overflow-y-auto p-1">
        <div class="px-4 pb-2">
          <div class="mb-4 flex flex-col justify-center gap-4 sm:flex-row">
            <div class="relative m-6 flex justify-center">
              {#if (playlist.thumbnail_maxres_url || playlist.thumbnail_url) && !$formData.isDeletingPlaylistImage}
                <div class="relative h-56 w-56">
                  <ImageCropper.Preview
                    class="h-full w-full overflow-scroll rounded-md"
                  />
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger class="outline-none">
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          class="!bg-secondary absolute -right-3 -bottom-3 rounded-full hover:brightness-110"
                          variant="outline"
                          size="icon"
                        >
                          <EditIcon class="size-4" />
                        </Button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start">
                      {#if isLowResThumbnail}
                        <DropdownMenu.Item disabled
                          >This video doesn't have a high-resolution thumbnail
                          and cannot be cropped</DropdownMenu.Item
                        >
                      {:else}
                        <DropdownMenu.Item
                          onclick={() => {
                            cropperState.rootState.open = true;
                          }}>Update crop</DropdownMenu.Item
                        >
                      {/if}
                      <DropdownMenu.Item
                        onclick={() => {
                          $formData.isDeletingPlaylistImage = true;
                        }}>Remove photo</DropdownMenu.Item
                      >
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              {:else}
                <div class="flex h-56 w-56 items-center justify-center">
                  <ListVideo size={128} />
                </div>
                <Popover.Root>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        class="absolute -right-3 -bottom-3 rounded-full"
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
                      added to the playlist. Select a video to set it's
                      thumbnail as the playlist image. The image can then be
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

            <div class="relative flex grow flex-col gap-2">
              <Form.Field form={playlistForm} name="name">
                <div
                  class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:gap-4"
                >
                  <Form.Control>
                    {#snippet children({ props })}
                      <Form.Label for="name" class="text-right">Name</Form.Label
                      >
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
                  class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:items-start md:gap-4"
                >
                  <Form.Control>
                    {#snippet children({ props })}
                      <Form.Label for="description" class="mt-[9px] text-right"
                        >Description</Form.Label
                      >
                      <Textarea
                        {...props}
                        class="col-span-3 max-h-40 md:min-h-40"
                        bind:value={$formData.description}
                      />
                    {/snippet}
                  </Form.Control>
                </div>
                <Form.FieldErrors />
              </Form.Field>

              <Form.Field form={playlistForm} name="type">
                <div
                  class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:items-start md:gap-4"
                >
                  <Form.Control>
                    {#snippet children({ props })}
                      <Form.Label
                        for="isPublic"
                        class="cursor-pointer text-right"
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
              {#if $flash?.message && $flash?.type === 'error'}
                <Alert.Root class="mb-4">
                  <Alert.Title>Error when updating playlist</Alert.Title>
                  <Alert.Description>{$flash.message}</Alert.Description>
                </Alert.Root>
              {/if}
            </div>
          </div>
        </div>

        <div class="p-4">
          <div class="flex flex-col gap-2">
            <Drawer.Footer class="drawer-footer flex gap-2">
              <Button type="submit" class="drawer-button-footer">
                {#if isSubmitting}
                  <Loader class="animate-spin" />
                {:else}
                  Save Changes
                {/if}
              </Button>

              <Drawer.Close
                onclick={(e) => {
                  e.preventDefault();
                  open = false;
                }}
                class={buttonVariants({
                  class: 'drawer-button-footer',
                  variant: 'outline',
                })}
                >Close
              </Drawer.Close>
            </Drawer.Footer>
          </div>
        </div>
      </div>
    </form>
  </Drawer.Content>
</Drawer.Root>
