<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import { Input } from '$lib/components/ui/input';
  import * as Drawer from '$lib/components/ui/drawer';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Form from '$lib/components/ui/form';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import type {
    Playlist,
    PlaylistImageProperties,
  } from '$lib/supabase/playlists';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { Pencil, ListVideo, Loader } from '@lucide/svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Cropper, { type CropArea } from 'svelte-easy-crop';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Popover from '$lib/components/ui/popover';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
  import type { Snippet } from 'svelte';
  import type { Session } from '@supabase/supabase-js';
  import { page } from '$app/state';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import { invalidate } from '$app/navigation';
  import { parseImageProperties } from './playlist';
  import {
    type PlaylistSchema,
    playlistSchema,
  } from '../../../routes/playlist/[shortId]/schema';

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
  const sidebarState = getSidebarState();
  const flash = getFlash(page);
  let isSubmitting = $state(false);
  let isPublic = $state(playlist.type === 'Public');

  const triggerSnippet = trigger;

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
  const imageSrc = $derived(playlist.thumbnail_url);

  // Computed property for the display image
  const displayImageUrl = $derived(previewImageUrl || playlist.image_url);

  const playlistForm = superForm(form, {
    validators: zodClient(playlistSchema),
    id: formId ?? 'playlist-drawer-form',
    dataType: 'json',
    async onSubmit() {
      $flash = undefined;
      isSubmitting = true;
    },
    async onUpdated(event) {
      isSubmitting = false;
      updateFlash(page);
      if (event.form.valid) {
        const { isDeletingPlaylistImage, ...data } = event.form.data;

        // Update playlist object with new data including image_properties
        const updatedPlaylist = Object.assign(playlist, data);
        if (isDeletingPlaylistImage) {
          updatedPlaylist.image_url = null;
          updatedPlaylist.image_properties = null;
        }

        // Force reactive update by creating new object reference if image_properties changed
        if (data.image_properties !== playlist.image_properties) {
          // Create new playlist object to trigger reactivity in PlaylistImage component
          Object.assign(playlist, { ...playlist, ...data });
        }

        // Delay closing to allow animation to complete
        setTimeout(() => {
          open = false;
        }, 200);

        playlistForm.reset();

        // Sidebar refresh will get server-processed images with AVIF support
        sidebarState.refreshData();
        // Add invalidate to refresh playlist data like in dialog version
        invalidate('supabase:db:playlists');
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

      // Reset preview state
      previewImageUrl = null;
      cropSettingsBeforeEdit = null;
      previewBeforeEdit = null;
    }
  });

  $effect(() => {
    $formData.type = isPublic ? 'Public' : 'Private';
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
              {#if playlist.thumbnail_url && !$formData.isDeletingPlaylistImage}
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
                          class="!bg-secondary absolute -right-3 -bottom-3 rounded-full hover:brightness-110"
                          variant="outline"
                          size="icon"
                        >
                          <Pencil class="size-4" />
                        </Button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start">
                      <!-- {#if isLowResThumbnail} -->
                      <!--   <DropdownMenu.Item disabled -->
                      <!--     >This video is missing a high-resolution thumbnail and -->
                      <!--     cannot be cropped</DropdownMenu.Item -->
                      <!--   > -->
                      <!-- {:else} -->
                      <DropdownMenu.Item
                        onclick={() => {
                          cropperDialogOpen = true;
                        }}>Update crop</DropdownMenu.Item
                      >
                      <!-- {/if} -->
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
                      Playlist images can only be set to thumbnails of videos
                      added to the playlist. Select a video to set it's
                      thumbnail as the playlist image. The image can then be
                      cropped using this button.
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
              <Button
                type="submit"
                class="drawer-button-footer"
                disabled={isSubmitting}
              >
                {#if isSubmitting}
                  <Loader class="mr-2 animate-spin" />
                  Saving...
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

<!-- Crop Dialog using svelte-easy-crop -->
<Dialog.Root bind:open={cropperDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Crop Image</Dialog.Title>
    </Dialog.Header>

    <div class="relative h-96 flex-1">
      {#if imageSrc}
        <!-- Hidden img to preload -->
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
