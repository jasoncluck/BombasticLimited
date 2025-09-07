<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import { Input } from '$lib/components/ui/input';
  import * as Drawer from '$lib/components/ui/drawer';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Form from '$lib/components/ui/form';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import type { Playlist } from '$lib/supabase/playlists';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { Pencil, ListVideo, Loader, Crop, X } from '@lucide/svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Cropper, { type CropArea } from 'svelte-easy-crop';
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
  } from '$lib/schema/playlist-schema';
  import { browser } from '$app/environment';

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

  // State variables
  let isSubmitting = $state(false);
  let isPublic = $state(playlist.type === 'Public');
  let nestedDrawerOpen = $state(false);

  // Mobile Safari keyboard handling
  let initialViewportHeight = $state(0);
  let isKeyboardOpen = $state(false);
  let drawerContainer: HTMLElement | null = null;

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

  // Mobile Safari viewport handling
  function handleViewportChange(): void {
    if (!browser) return;
    
    const currentHeight = window.visualViewport?.height || window.innerHeight;
    
    if (initialViewportHeight === 0) {
      initialViewportHeight = currentHeight;
      return;
    }

    const heightDifference = initialViewportHeight - currentHeight;
    const threshold = 150; // Keyboard threshold in pixels

    isKeyboardOpen = heightDifference > threshold;
    
    if (drawerContainer) {
      if (isKeyboardOpen) {
        // When keyboard is open, fix the height and prevent scrolling issues
        drawerContainer.style.height = `${currentHeight}px`;
        drawerContainer.style.maxHeight = `${currentHeight}px`;
        drawerContainer.classList.add('keyboard-open');
      } else {
        // When keyboard is closed, restore normal behavior
        drawerContainer.style.height = '';
        drawerContainer.style.maxHeight = '';
        drawerContainer.classList.remove('keyboard-open');
      }
    }
  }

  // Set up viewport listeners for mobile Safari
  $effect(() => {
    if (!browser || !open) return;

    // Initialize viewport height when drawer opens
    initialViewportHeight = window.visualViewport?.height || window.innerHeight;

    // Listen for viewport changes
    const handleResize = () => handleViewportChange();
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  });

  // Handle input focus/blur for additional keyboard detection
  function handleInputFocus(): void {
    // Small delay to allow keyboard to appear
    setTimeout(() => {
      handleViewportChange();
    }, 300);
  }

  function handleInputBlur(): void {
    // Small delay to allow keyboard to disappear
    setTimeout(() => {
      handleViewportChange();
    }, 300);
  }

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
    nestedDrawerOpen = false;
  }

  function handleRemoveImage(): void {
    $formData.isDeletingPlaylistImage = true;
    previewImageUrl = null;
    nestedDrawerOpen = false;
  }

  // SuperForm setup
  const playlistForm = superForm(form, {
    validators: zodClient(playlistSchema),
    id: formId ?? 'playlist-drawer-form',
    dataType: 'json',
    resetForm: false, // Prevent auto-reset
    async onSubmit() {
      $flash = undefined;
      isSubmitting = true;
    },
    async onUpdated(event) {
      if (event.form.valid) {
        // Update local playlist object immediately before any UI updates
        Object.assign(playlist, event.form.data);

        if (event.form.data.isDeletingPlaylistImage) {
          playlist.image_url = null;
          playlist.image_properties = null;
          playlist.thumbnail_url = null;
        }

        // Now close drawer and refresh data
        open = false;
        sidebarState.refreshData();
        invalidate('supabase:db:playlists');
      }

      isSubmitting = false;
      updateFlash(page);
    },
  });

  const { form: formData, enhance } = $derived(playlistForm);

  // Initialize form when drawer opens
  $effect(() => {
    if (open) {
      isSubmitting = false;
      isPublic = playlist.type === 'Public';
      previewImageUrl = null;
      initialViewportHeight = 0; // Reset viewport height tracking

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

  // Close nested drawer when main drawer closes
  $effect(() => {
    if (!open && nestedDrawerOpen) {
      nestedDrawerOpen = false;
    }
  });

  // Reset form when drawer closes
  $effect(() => {
    if (!open) {
      playlistForm.reset();
      playlistState.openEditPlaylist = false;
      // Reset keyboard state
      isKeyboardOpen = false;
      initialViewportHeight = 0;
      if (drawerContainer) {
        drawerContainer.style.height = '';
        drawerContainer.style.maxHeight = '';
        drawerContainer.classList.remove('keyboard-open');
      }
    }
  });
</script>

<!-- Add mobile-specific styles -->
<style>
  :global(.drawer-mobile-safe) {
    /* Use dvh (dynamic viewport height) for mobile Safari */
    min-height: 100dvh;
    height: 100dvh;
    max-height: 100dvh;
  }
  
  :global(.drawer-mobile-safe.keyboard-open) {
    /* When keyboard is open, use fixed height to prevent layout shifts */
    overflow: hidden;
  }
  
  :global(.drawer-content-mobile) {
    /* Ensure content area is properly contained */
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 100%;
  }
  
  :global(.drawer-form-container) {
    /* Make form scrollable when keyboard is open */
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  
  :global(.keyboard-open .drawer-form-container) {
    /* Adjust padding when keyboard is open to prevent content being hidden */
    padding-bottom: 2rem;
  }

  /* Prevent zoom on input focus for iOS */
  :global(.drawer input),
  :global(.drawer textarea),
  :global(.drawer select) {
    font-size: 16px !important;
    transform-origin: left top;
  }
</style>

<Drawer.Root bind:open handleOnly={true} {nested}>
  {#if !isPlaylistOwner}
    <div class="w-full outline-hidden">
      {@render trigger()}
    </div>
  {:else}
    <Drawer.Trigger class="w-full outline-hidden">
      {@render trigger()}
    </Drawer.Trigger>
  {/if}

  <Drawer.Content 
    bind:this={drawerContainer}
    class="bg-background drawer drawer-mobile-safe drawer-content-mobile flex min-h-[100%] flex-col"
  >
    <div class="flex-shrink-0 p-4 pb-0">
      <Drawer.Header class="px-0">
        <Drawer.Title class="text-xl">Edit Playlist</Drawer.Title>
      </Drawer.Header>
    </div>

    <div class="drawer-form-container min-h-0 flex-1 overflow-y-auto p-1">
      <div class="px-4 pb-2">
        <div class="mb-4 flex flex-col justify-center gap-4 sm:flex-row">
          <!-- Image Section -->
          <div class="relative m-6 flex justify-center">
            {#if playlist.thumbnail_url && !$formData.isDeletingPlaylistImage}
              <div class="relative h-56 w-56">
                <img
                  src={displayImageUrl}
                  alt="Playlist thumbnail"
                  class="h-full w-full rounded-md object-cover"
                />
                <Drawer.NestedRoot bind:open={nestedDrawerOpen}>
                  <Drawer.Trigger class="outline-hidden">
                    <Button
                      class="!bg-secondary absolute -right-3 -bottom-3 rounded-full hover:brightness-110"
                      variant="outline"
                      size="icon"
                      type="button"
                    >
                      <Pencil class="size-4" />
                    </Button>
                  </Drawer.Trigger>
                  <Drawer.Content>
                    <Drawer.Header>Image Options</Drawer.Header>
                    <Button
                      class="drawer-button"
                      variant="ghost"
                      type="button"
                      onclick={handleUpdateImageCrop}
                    >
                      <Crop class="drawer-icon" />
                      Update image crop
                    </Button>
                    <Button
                      class="drawer-button"
                      variant="ghost"
                      type="button"
                      onclick={handleRemoveImage}
                    >
                      <X class="drawer-icon" />
                      Remove image
                    </Button>
                    <Drawer.Footer class="drawer-footer flex gap-2">
                      <Drawer.Close
                        class={buttonVariants({
                          class: 'drawer-button-footer',
                          variant: 'outline',
                        })}
                      >
                        Close
                      </Drawer.Close>
                    </Drawer.Footer>
                  </Drawer.Content>
                </Drawer.NestedRoot>
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
          <form
            method="POST"
            use:enhance
            id="playlist-drawer-form"
            class="relative flex grow flex-col gap-2"
          >
            <!-- Name Field -->
            <Form.Field form={playlistForm} name="name">
              <div
                class="flex flex-wrap items-center gap-2 md:grid md:grid-cols-4 md:gap-4"
              >
                <Form.Control>
                  {#snippet children({ props })}
                    <Form.Label for="name" class="mb-1 text-right"
                      >Name</Form.Label
                    >
                    <Input
                      {...props}
                      class="col-span-3"
                      bind:value={$formData.name}
                      inputmode="text"
                      autocomplete="off"
                      autocapitalize="words"
                      spellcheck="true"
                      onfocus={handleInputFocus}
                      onblur={handleInputBlur}
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
                    <Form.Label
                      for="description"
                      class="mt-[9px] mb-1 text-right"
                    >
                      Description
                    </Form.Label>
                    <Textarea
                      {...props}
                      class="col-span-3 max-h-40 md:min-h-40"
                      bind:value={$formData.description}
                      inputmode="text"
                      autocomplete="off"
                      autocapitalize="sentences"
                      spellcheck="true"
                      onfocus={handleInputFocus}
                      onblur={handleInputBlur}
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
                      class="mr-1 cursor-pointer text-right"
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

            <!-- Error Display -->
            {#if $flash?.message && $flash?.type === 'error'}
              <Alert.Root class="mb-4">
                <Alert.Title>Error when updating playlist</Alert.Title>
                <Alert.Description>{$flash.message}</Alert.Description>
              </Alert.Root>
            {/if}

            <!-- Form Footer -->
            <div class="flex flex-col gap-2 pt-4">
              <Drawer.Footer class="flex gap-2">
                {#if isSubmitting}
                  <Button
                    type="submit"
                    class="drawer-button-footer"
                    disabled={isSubmitting}
                  >
                    <Loader class="mr-2 animate-spin" />
                    Saving...
                  </Button>
                {:else}
                  <Button
                    type="submit"
                    class="drawer-button-footer"
                    disabled={isSubmitting}
                  >
                    Save Changes
                  </Button>
                {/if}
                <Drawer.Close
                  class={buttonVariants({
                    class: 'drawer-button-footer',
                    variant: 'outline',
                  })}
                >
                  Close
                </Drawer.Close>
              </Drawer.Footer>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Drawer.Content>
</Drawer.Root>

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
