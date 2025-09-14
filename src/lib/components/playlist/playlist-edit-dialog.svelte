<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Form from '$lib/components/ui/form';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import type { Playlist } from '$lib/supabase/playlists';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { Crop, ListVideo, Loader, Pencil, X } from '@lucide/svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Cropper, { type CropArea } from 'svelte-easy-crop';
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
  import { parseImageProperties } from './playlist';
  import {
    playlistSchema,
    type PlaylistSchema,
  } from '$lib/schema/playlist-schema';

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

  // State variables
  let isSubmitting = $state(false);
  let isPublic = $derived(playlist.type === 'Public');

  // Cropper state
  let cropperDialogOpen = $state(false);
  let crop = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let currentCropArea: CropArea | null = null;
  let imageLoaded = $state(false);

  // Preview state
  let previewCanvas: HTMLCanvasElement | null = null;
  let previewImageUrl = $state<string | null>(null);

  const isPlaylistOwner = $derived(playlist.created_by === session?.user.id);
  const imageSrc = $derived(playlist.thumbnail_url);
  const displayImageUrl = $derived(previewImageUrl || playlist.image_url);

  // Create cropped preview
  async function createCroppedPreview(
    imageSrc: string,
    cropArea: CropArea
  ): Promise<string> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        if (!previewCanvas) {
          previewCanvas = document.createElement('canvas');
        }

        const canvas = previewCanvas;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(imageSrc);
          return;
        }

        canvas.width = cropArea.width;
        canvas.height = cropArea.height;

        ctx.drawImage(
          image,
          cropArea.x,
          cropArea.y,
          cropArea.width,
          cropArea.height,
          0,
          0,
          cropArea.width,
          cropArea.height
        );

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      image.crossOrigin = 'anonymous';
      image.src = imageSrc;
    });
  }

  // Handle crop confirmation
  async function handleCropConfirm(): Promise<void> {
    if (currentCropArea && imageSrc) {
      // Update form data with the crop area object (not string)
      $formData.image_properties = currentCropArea;
      previewImageUrl = await createCroppedPreview(imageSrc, currentCropArea);
    }
    cropperDialogOpen = false;
  }

  // Handle crop cancellation
  function handleCropCancel(): void {
    // Reset to original image properties
    $formData.image_properties = parseImageProperties(
      playlist.image_properties
    );
    previewImageUrl = null;
    cropperDialogOpen = false;
  }

  // Handle image load in cropper
  function handleImageLoad(): void {
    imageLoaded = true;
    const savedProps = parseImageProperties($formData.image_properties);
    if (savedProps) {
      currentCropArea = {
        x: savedProps.x,
        y: savedProps.y,
        width: savedProps.width,
        height: savedProps.height,
      };
    } else {
      crop = { x: 0, y: 0 };
      zoom = 1;
      currentCropArea = null;
    }
  }

  // Handle image actions
  function handleUpdateImageCrop(): void {
    cropperDialogOpen = true;
  }

  function handleRemoveImage(): void {
    $formData.isDeletingPlaylistImage = true;
    previewImageUrl = null;
  }

  // SuperForm setup
  const playlistForm = superForm(form, {
    validators: zodClient(playlistSchema),
    id: formId ?? 'playlist-dialog-form',
    dataType: 'json',
    resetForm: false, // Prevent auto-reset
    async onSubmit() {
      $flash = undefined;
      isSubmitting = true;
    },
    async onUpdated(event) {
      if (event.form.valid) {
        if (event.form.data.isDeletingPlaylistImage) {
          playlist.image_url = null;
          playlist.image_properties = null;
          playlist.thumbnail_url = null;
        }

        // Now close dialog and refresh data
        open = false;
        invalidate('supabase:db:playlists');
        sidebarState.refreshData();
      }

      isSubmitting = false;
      updateFlash(page);
    },
  });

  const { form: formData, enhance } = $derived(playlistForm);

  // Initialize form when dialog opens
  $effect(() => {
    if (open) {
      isSubmitting = false;
      isPublic = playlist.type === 'Public';
      previewImageUrl = null;

      // Set form data
      $formData.id = playlist.id;
      $formData.name = playlist.name;
      $formData.description = playlist.description ?? '';
      $formData.type = playlist.type;
      $formData.image_properties = parseImageProperties(
        playlist.image_properties
      );
      $formData.isDeletingPlaylistImage = false;
      $formData.thumbnail_url = playlist.thumbnail_url;
    }
  });

  // Update type when checkbox changes
  $effect(() => {
    $formData.type = isPublic ? 'Public' : 'Private';
  });

  // Reset cropper state when dialog opens
  $effect(() => {
    if (cropperDialogOpen) {
      imageLoaded = false;
      crop = { x: 0, y: 0 };
      zoom = 1;
      currentCropArea = null;
    }
  });
</script>

<Dialog.Root
  bind:open
  onOpenChange={(open) => {
    if (open === false) {
      playlistForm.reset();
      playlistState.openEditPlaylist = false;
    }
  }}
>
  {#if isPlaylistOwner}
    <Dialog.Trigger class="w-full outline-hidden">
      {@render trigger()}
    </Dialog.Trigger>
  {:else}
    <div class="w-full outline-hidden">
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
          <!-- Image Section -->
          <div class="relative m-6 flex items-center justify-center">
            {#if playlist.thumbnail_url && !$formData.isDeletingPlaylistImage}
              <div class="relative h-56 w-56">
                <img
                  src={displayImageUrl}
                  alt="Playlist thumbnail"
                  class="h-full w-full rounded-md object-cover"
                />
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="outline-hidden">
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        class="hover:bg-secondary absolute -right-3 -bottom-3
                        rounded-full opacity-75 transition-opacity duration-150 hover:scale-105 
                        hover:opacity-100 hover:brightness-110"
                        variant="secondary"
                        size="icon"
                        type="button"
                      >
                        <Pencil class="size-4" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start">
                    <DropdownMenu.Item
                      onclick={handleUpdateImageCrop}
                      class="flex gap-2"
                    >
                      <Crop class="dropdown-icon" />
                      Update image crop
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onclick={handleRemoveImage}
                      class="flex gap-2"
                    >
                      <X class="dropdown-icon" />
                      Remove image
                    </DropdownMenu.Item>
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
                      type="button"
                    >
                      <Pencil class="size-4" />
                    </Button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content align="start">
                  <p class="text-sm">
                    Playlist images can only be set to thumbnails of videos
                    added to the playlist. Select a video to set its thumbnail
                    as the playlist image. The image can then be cropped using
                    this button.
                  </p>
                </Popover.Content>
              </Popover.Root>
            {/if}
          </div>

          <!-- Form Section -->
          <div class="relative flex grow flex-col gap-2">
            <!-- Name Field -->
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
                      inputmode="text"
                      autocomplete="off"
                      autocapitalize="words"
                      spellcheck="true"
                    />
                  {/snippet}
                </Form.Control>
              </div>
              <Form.FieldErrors class="mb-2" />
            </Form.Field>

            <!-- Description Field -->
            <Form.Field form={playlistForm} name="description" class="mb-2">
              <div
                class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:items-start md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <Form.Label for="description" class="mt-[9px] text-right">
                      Description
                    </Form.Label>
                    <Textarea
                      {...props}
                      class="col-span-3 max-h-64 md:min-h-40"
                      bind:value={$formData.description}
                      inputmode="text"
                      autocomplete="off"
                      autocapitalize="sentences"
                      spellcheck="true"
                    />
                  {/snippet}
                </Form.Control>
              </div>
              <Form.FieldErrors />
            </Form.Field>

            <!-- Public Checkbox -->
            <Form.Field form={playlistForm} name="type">
              <div
                class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:items-start md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <Form.Label
                      for="isPublic"
                      class="mr-1 cursor-pointer leading-5"
                    >
                      Public Playlist
                    </Form.Label>
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
          </div>
        </div>

        <!-- Error Display -->
        {#if $flash?.message && $flash?.type === 'error'}
          <Alert.Root class="mb-4">
            <Alert.Title>Error when updating playlist</Alert.Title>
            <Alert.Description>{$flash.message}</Alert.Description>
          </Alert.Root>
        {/if}

        <Dialog.Footer>
          <Button
            type="submit"
            disabled={isSubmitting}
            style="-webkit-tap-highlight-color: transparent;"
            class="tap-highlight-none"
          >
            {#if isSubmitting}
              <Loader class="mr-2 animate-spin" />
              Saving...
            {:else}
              Save Changes
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>

<!-- Crop Dialog -->
<Dialog.Root bind:open={cropperDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Crop Image</Dialog.Title>
    </Dialog.Header>

    <div class="relative h-96 flex-1">
      {#if imageSrc}
        <img
          src={imageSrc}
          alt=""
          style="display: none;"
          onload={handleImageLoad}
        />

        {#if imageLoaded}
          <Cropper
            image={imageSrc}
            bind:crop
            bind:zoom
            aspect={1}
            cropShape="rect"
            showGrid={true}
            oncropcomplete={({ pixels }) => {
              currentCropArea = pixels;
            }}
          />
        {:else}
          <div class="flex h-full items-center justify-center">
            <Loader class="animate-spin" />
          </div>
        {/if}
      {/if}
    </div>

    <Dialog.Footer class="flex justify-between">
      <Button variant="outline" onclick={handleCropCancel}>Cancel</Button>
      <Button onclick={handleCropConfirm}>Apply Crop</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
