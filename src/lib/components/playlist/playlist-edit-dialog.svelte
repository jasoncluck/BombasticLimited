<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import {
    playlistSchema,
    type PlaylistSchema,
  } from '../../../routes/playlist/[shortId]/schema';
  import { Input } from '$lib/components/ui/input';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Form from '$lib/components/ui/form';
  import { Button } from '$lib/components/ui/button';
  import type { Playlist } from '$lib/supabase/playlists';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { ListVideo, Loader, Pencil } from '@lucide/svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import * as ImageCropper from '$lib/components/ui/image-cropper';
  import {
    useImageCropperCrop,
    useImageCropperCropper,
  } from '$lib/components/ui/image-cropper/image-cropper.svelte.js';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Popover from '$lib/components/ui/popover';
  import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
  import type { Snippet } from 'svelte';
  import ScrollArea from '../ui/scroll-area/scroll-area.svelte';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import { page } from '$app/state';
  import type { Session } from '@supabase/supabase-js';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { invalidate } from '$app/navigation';
  import { isLowResolutionThumbnail } from './playlist-service';

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
  let isPublic = $state(playlist.type === 'Public');

  const cropperState = useImageCropperCropper();
  const cropState = useImageCropperCrop();

  const isPlaylistOwner = $derived(playlist.created_by === session?.user.id);
  const isLowResThumbnail = $derived(
    isLowResolutionThumbnail(
      playlist.thumbnail_maxres_url,
      playlist.thumbnail_url
    )
  );

  const playlistForm = $derived(
    superForm(form, {
      validators: zodClient(playlistSchema),
      id: formId ?? 'playlist-dialog-form',
      dataType: 'json',
      onSubmit() {
        isSubmitting = true;
        $flash = undefined;
      },
      onResult(event) {
        if (event.result.type !== 'success') {
          isSubmitting = false;
        }
      },
      async onUpdated(event) {
        updateFlash(page);

        if (event.form.valid) {
          open = false;
          isSubmitting = false;
          playlistForm.reset();

          // const updatedPlaylist = Object.assign(playlist, data);
          // if (isDeletingPlaylistImage) {
          //   updatedPlaylist.thumbnail_video_id = null;
          // }

          // Sidebar refresh will get server-processed images with AVIF support
          sidebarState.refreshData();
          invalidate('supabase:db:playlists');
        }
      },
    })
  );
  const { form: formData, enhance } = $derived(playlistForm);

  $effect(() => {
    $formData.type = isPublic ? 'Public' : 'Private';

    if (cropState.rootState.pixelCrop) {
      $formData.image_properties = cropState.rootState.pixelCrop;
    }

    // Set the initial image URL when the dialog opens
    cropperState.rootState.tempUrl =
      playlist.thumbnail_maxres_url ?? playlist.thumbnail_url;
  });
</script>

<!-- Rest of your component remains the same -->
<Dialog.Root
  bind:open
  onOpenChange={(open) => {
    if (open === false) {
      playlistState.openEditPlaylist = false;
      // Reset the cropper state when closing
      cropperState.rootState.tempUrl = null;
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
    class="h-[90%] w-[90%] min-w-[375px] sm:h-auto sm:max-w-[800px]"
  >
    <ScrollArea type="scroll">
      <form method="POST" use:enhance class="overflow-hidden">
        <Dialog.Header class="mb-4">
          <Dialog.Title>Edit Playlist</Dialog.Title>
        </Dialog.Header>

        <div class="mb-4 flex flex-col justify-center gap-4 sm:flex-row">
          <div class="relative m-6 flex justify-center">
            {#if ($formData.thumbnail_maxres_url || $formData.thumbnail_url) && !$formData.isDeletingPlaylistImage}
              <div class="relative h-56 w-56">
                <ImageCropper.Preview class="h-full w-full rounded-md" />
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="outline-none">
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        class="hover:bg-secondary absolute -right-3 -bottom-3 rounded-full hover:brightness-110"
                        variant="secondary"
                        size="icon"
                      >
                        <Pencil class="size-4" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start">
                    {#if isLowResThumbnail}
                      <DropdownMenu.Item disabled
                        >This video doesn't have a high-resolution thumbnail and
                        cannot be cropped</DropdownMenu.Item
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
                      <Pencil class="size-4" />
                    </Button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content align="start"
                  ><p class="text-sm">
                    Upload a new image or crop an existing video thumbnail as
                    the playlist image.
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
                class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:items-start md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <!-- textarea border + pad = 9px -->
                    <Form.Label for="description" class="mt-[9px] text-right"
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
                class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:items-start md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <!-- textarea border + pad = 9px -->
                    <Form.Label for="isPublic" class="mr-1 cursor-pointer"
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
            <!-- Add the hidden field for imageDataUrl -->
            <Form.Field form={playlistForm} name="thumbnail_video_id">
              <Form.Control>
                {#snippet children({ props })}
                  <Input
                    {...props}
                    hidden
                    bind:value={$formData.thumbnail_video_id}
                  />
                {/snippet}
              </Form.Control>
            </Form.Field>
            <Form.Field form={playlistForm} name="thumbnail_url">
              <Form.Control>
                {#snippet children({ props })}
                  <Input
                    {...props}
                    hidden
                    bind:value={$formData.thumbnail_url}
                  />
                {/snippet}
              </Form.Control>
            </Form.Field>
            <Form.Field form={playlistForm} name="thumbnail_maxres_url">
              <Form.Control>
                {#snippet children({ props })}
                  <Input
                    {...props}
                    hidden
                    bind:value={$formData.thumbnail_maxres_url}
                  />
                {/snippet}
              </Form.Control>
            </Form.Field>
          </div>
        </div>
        {#if $flash?.message && $flash?.type === 'error'}
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
