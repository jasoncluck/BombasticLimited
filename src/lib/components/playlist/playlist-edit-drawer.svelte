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
  import { tick } from 'svelte';

  interface DrawerProps {
    form: SuperValidated<PlaylistSchema>;
    formId?: string;
    trigger: Snippet;
    playlist: Playlist;
    open: boolean;
    session: Session | null;
    nested?: boolean;
  }

  let {
    form,
    formId,
    playlist,
    trigger,
    open = $bindable(),
    session,
    nested = false,
  }: DrawerProps = $props();

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
  let isAnimating = $state(false);
  let animationTimeoutId: number | undefined = undefined;

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

  // Debounce function for viewport changes
  function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | undefined;
    return (...args: Parameters<T>): void => {
      const later = (): void => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = window.setTimeout(later, wait);
    };
  }

  // Mobile Safari viewport handling with better detection
  function handleViewportChange(): void {
    if (!browser || !open || isAnimating) return;

    const currentHeight = window.visualViewport?.height || window.innerHeight;

    if (initialViewportHeight === 0) {
      initialViewportHeight = currentHeight;
      return;
    }

    const heightDifference = initialViewportHeight - currentHeight;
    const threshold = 150; // Keyboard threshold in pixels

    const newKeyboardState = heightDifference > threshold;

    if (newKeyboardState !== isKeyboardOpen) {
      isKeyboardOpen = newKeyboardState;

      // Apply styles to document root for mobile Safari fixes
      requestAnimationFrame(() => {
        if (isKeyboardOpen) {
          // Keyboard is open - apply mobile Safari fixes
          document.documentElement.style.setProperty(
            '--drawer-mobile-height',
            `${currentHeight}px`
          );
          document.body.classList.add('drawer-keyboard-open');
          // Prevent scrolling issues on body but allow drawer scrolling
          document.body.style.setProperty('overflow', 'hidden');
        } else {
          // Keyboard is closed - restore layout
          document.documentElement.style.removeProperty(
            '--drawer-mobile-height'
          );
          document.body.classList.remove('drawer-keyboard-open');
          // Restore scrolling
          document.body.style.removeProperty('overflow');
        }
      });
    }
  }

  // Debounced version of viewport change handler
  const debouncedViewportChange = debounce(handleViewportChange, 50);

  // Handle drawer animation states
  function handleDrawerStateChange(isOpen: boolean): void {
    if (isOpen) {
      // Drawer is opening
      isAnimating = true;

      // Clear any existing timeout
      if (animationTimeoutId) {
        clearTimeout(animationTimeoutId);
      }

      // Set animation complete after transition duration
      animationTimeoutId = window.setTimeout(() => {
        isAnimating = false;

        // Initialize viewport height tracking after animation
        if (browser) {
          initialViewportHeight =
            window.visualViewport?.height || window.innerHeight;
        }
      }, 300); // Typical drawer animation duration
    } else {
      // Drawer is closing
      isAnimating = true;

      // Clear any existing timeout
      if (animationTimeoutId) {
        clearTimeout(animationTimeoutId);
      }

      // Clean up mobile states
      isKeyboardOpen = false;
      initialViewportHeight = 0;

      // Clean up document styles
      try {
        document.documentElement.style.removeProperty('--drawer-mobile-height');
        document.body.classList.remove('drawer-keyboard-open');
        document.body.style.removeProperty('overflow');
      } catch (error) {
        console.warn('Error cleaning up document styles:', error);
      }

      // Set animation complete after transition duration
      animationTimeoutId = window.setTimeout(() => {
        isAnimating = false;
      }, 300);
    }
  }

  // Watch for drawer open/close changes
  $effect(() => {
    handleDrawerStateChange(open);
  });

  // Set up viewport listeners for mobile Safari
  $effect(() => {
    if (!browser || !open || isAnimating) return;

    // Listen for viewport changes
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', debouncedViewportChange);
      window.visualViewport.addEventListener('scroll', debouncedViewportChange);
    } else {
      window.addEventListener('resize', debouncedViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          'resize',
          debouncedViewportChange
        );
        window.visualViewport.removeEventListener(
          'scroll',
          debouncedViewportChange
        );
      } else {
        window.removeEventListener('resize', debouncedViewportChange);
      }
    };
  });

  // Handle input focus with better mobile Safari support
  function handleInputFocus(event: Event): void {
    if (!browser || isAnimating) return;

    const target = event.target as HTMLElement;

    // Scroll element into view with proper options
    setTimeout(() => {
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }

      // Check viewport after focus
      debouncedViewportChange();
    }, 100);
  }

  function handleInputBlur(): void {
    if (!browser || isAnimating) return;

    // Check viewport after blur with longer delay
    setTimeout(() => {
      debouncedViewportChange();
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

        // Wait for next tick before closing to ensure updates are processed
        await tick();

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
    if (open && !isAnimating) {
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
    if (!isAnimating) {
      $formData.type = isPublic ? 'Public' : 'Private';
    }
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
    if (!open && !isAnimating) {
      playlistForm.reset();
      playlistState.openEditPlaylist = false;
    }
  });

  // Cleanup on component unmount
  $effect(() => {
    return () => {
      if (animationTimeoutId) {
        clearTimeout(animationTimeoutId);
      }

      // Clean up styles with safety checks
      try {
        document.documentElement.style.removeProperty('--drawer-mobile-height');
        document.body.classList.remove('drawer-keyboard-open');
        document.body.style.removeProperty('overflow');
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    };
  });
</script>

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
    class="bg-background drawer flex min-h-[100%] flex-col"
    data-keyboard-open={isKeyboardOpen}
    data-animating={isAnimating}
  >
    <div class="flex-shrink-0 p-4 pb-0">
      <Drawer.Header class="px-0">
        <Drawer.Title class="text-xl">Edit Playlist</Drawer.Title>
      </Drawer.Header>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
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
                  disabled={isAnimating}
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

<style>
  /* Mobile Safari viewport and keyboard handling */
  :global(body.drawer-keyboard-open .drawer[data-keyboard-open='true']) {
    height: var(--drawer-mobile-height, 100dvh) !important;
    max-height: var(--drawer-mobile-height, 100dvh) !important;
  }

  /* Prevent zoom on input focus for iOS and ensure proper font size */
  :global(.drawer input),
  :global(.drawer textarea),
  :global(.drawer select) {
    font-size: max(16px, 1rem) !important;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  /* Ensure proper touch behavior */
  :global(.drawer) {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: pan-y;
  }

  :global(.drawer input),
  :global(.drawer textarea) {
    -webkit-user-select: text;
    user-select: text;
    touch-action: manipulation;
  }

  /* Animation state management */
  :global([data-animating='true']) {
    pointer-events: none;
  }

  :global([data-animating='false']) {
    pointer-events: auto;
  }

  /* iOS specific fixes */
  @supports (-webkit-touch-callout: none) {
    :global(body.drawer-keyboard-open .drawer[data-keyboard-open='true']) {
      /* Use fixed positioning to prevent viewport issues on iOS */
      position: fixed !important;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
  }

  /* Ensure scrolling works properly when keyboard is open */
  :global(
    body.drawer-keyboard-open .drawer[data-keyboard-open='true'] .min-h-0
  ) {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: env(keyboard-inset-height, 2rem);
  }
</style>
