<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { Input } from '$lib/components/ui/input';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Form from '$lib/components/ui/form';
  import { Button } from '$lib/components/ui/button';
  import type {
    Playlist,
    PlaylistImageProperties,
  } from '$lib/supabase/playlists';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { ListVideo, Loader, Pencil } from '@lucide/svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Cropper, { type CropArea } from 'svelte-easy-crop';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Popover from '$lib/components/ui/popover';
  import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
  import { type Snippet } from 'svelte';
  import ScrollArea from '../ui/scroll-area/scroll-area.svelte';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import { page } from '$app/state';
  import type { Session } from '@supabase/supabase-js';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { invalidate } from '$app/navigation';
  import { isLowResolutionThumbnail } from './playlist-service';
  import { parseImageProperties } from './playlist';
  import {
    playlistSchema,
    type PlaylistSchema,
  } from '../../../routes/(app)/playlist/[shortId]/schema';

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

  // Cropper state
  let cropperDialogOpen = $state(false);
  let crop = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let currentCropArea: CropArea | null = null;
  let imageLoaded = $state(false);

  // Track what the crop settings were BEFORE opening the cropper dialog
  let cropSettingsBeforeEdit = $state<PlaylistImageProperties | null>(null);
  let previewBeforeEdit = $state<string | null>(null);

  // Preview state
  let previewCanvas: HTMLCanvasElement | null = null;
  let previewImageUrl = $state<string | null>(null);

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
  });

  // Function to create cropped preview
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

        // Set canvas size to crop area size
        canvas.width = cropArea.width;
        canvas.height = cropArea.height;

        // Draw the cropped portion
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

        // Convert to data URL
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      image.crossOrigin = 'anonymous';
      image.src = imageSrc;
    });
  }

  // Handle crop confirmation - called when user clicks save
  async function handleCropConfirm() {
    if (currentCropArea && imageSrc) {
      $formData.image_properties = currentCropArea;
      // Create preview of the cropped image
      previewImageUrl = await createCroppedPreview(imageSrc, currentCropArea);

      // Update the "before edit" state since this is now the new baseline
      cropSettingsBeforeEdit = currentCropArea;
      previewBeforeEdit = previewImageUrl;
    }
    cropperDialogOpen = false;
  }

  // Handle crop cancellation - called when user clicks cancel
  function handleCropCancel() {
    // Restore to the state before we opened the cropper
    $formData.image_properties = cropSettingsBeforeEdit;
    previewImageUrl = previewBeforeEdit;

    cropperDialogOpen = false;
  }

  // Handle image load in cropper
  function handleImageLoad() {
    imageLoaded = true;

    // Set initial crop area if we have saved properties
    const savedProps = parseImageProperties($formData.image_properties);
    if (savedProps) {
      currentCropArea = {
        x: savedProps.x,
        y: savedProps.y,
        width: savedProps.width,
        height: savedProps.height,
      };
    } else {
      // Reset to defaults if no saved properties
      crop = { x: 0, y: 0 };
      zoom = 1;
      currentCropArea = null;
    }
  }

  // Get the image source for the cropper
  const imageSrc = $derived(
    playlist.thumbnail_maxres_url ?? playlist.thumbnail_url
  );

  // Computed property for the display image
  const displayImageUrl = $derived(previewImageUrl || playlist.image_url);

  // Reset state when main dialog opens/closes
  $effect(() => {
    if (open) {
      previewImageUrl = null; // Reset preview
      cropSettingsBeforeEdit = null;
      previewBeforeEdit = null;
    }
  });

  // Capture state when cropper dialog opens
  $effect(() => {
    if (cropperDialogOpen) {
      // Save current state before we start editing
      cropSettingsBeforeEdit = parseImageProperties($formData.image_properties);
      previewBeforeEdit = previewImageUrl;

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
      playlistState.openEditPlaylist = false;
    }
  }}
>
  {#if isPlaylistOwner}
    <Dialog.Trigger class="w-full outline-none">
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
          <div class="relative m-6 flex items-center justify-center">
            {#if ($formData.thumbnail_maxres_url || $formData.thumbnail_url) && !$formData.isDeletingPlaylistImage}
              <div class="relative h-56 w-56">
                <!-- Preview the cropped image -->
                <img
                  src={displayImageUrl}
                  alt="Playlist thumbnail"
                  class="h-full w-full rounded-md object-cover"
                />
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="outline-none">
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        class="hover:bg-secondary absolute -right-3 -bottom-3
                        rounded-full opacity-75 transition-opacity duration-150 hover:scale-105 
                        hover:opacity-100  hover:brightness-110
                        "
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
                        >This video is missing a high-resolution thumbnail and
                        cannot be cropped</DropdownMenu.Item
                      >
                    {:else}
                      <DropdownMenu.Item
                        onclick={() => {
                          cropperDialogOpen = true;
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
                    <Form.Label
                      for="isPublic"
                      class="mr-1 cursor-pointer leading-5"
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

            <!-- Hidden form fields -->
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

<!-- Crop Dialog using svelte-easy-crop -->
<Dialog.Root bind:open={cropperDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Crop Image</Dialog.Title>
    </Dialog.Header>

    <div class="relative h-96 flex-1">
      {#if imageSrc}
        <img
          src={imageSrc}
          onload={handleImageLoad}
          alt={`Image for playlist: ${playlist.name} `}
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
