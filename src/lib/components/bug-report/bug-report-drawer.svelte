<script lang="ts">
  import * as Drawer from '$lib/components/ui/drawer';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { TriangleAlert, Loader, Upload, X, ImageIcon } from '@lucide/svelte';
  import {
    submitBugReport,
    isPostHogReady,
    type ImageFile,
  } from './bug-report';
  import {
    uploadBugReportImageToSupabase,
    createImagePreview,
    revokeImagePreview,
    validateImageFile,
    deleteBugReportImage,
    IMAGE_UPLOAD_CONFIG,
  } from '$lib/components/bug-report/bug-report-service';
  import type { BugReportFormData } from '$lib/types/bug-report';
  import {
    bugReportSchema,
    type BugReportSchema,
  } from '$lib/schema/bug-report-schema';
  import { toast } from 'svelte-sonner';
  import { untrack } from 'svelte';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { ZodError } from 'zod';

  let {
    open = $bindable(false),
    supabase,
    session,
  }: {
    open: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  // Form state
  let formData: BugReportFormData = $state({
    title: '',
    description: '',
    steps_to_reproduce: '',
    images: [],
  });

  let isSubmitting = $state(false);
  let errors: Partial<Record<keyof BugReportSchema, string>> = $state({});
  let imageFiles: ImageFile[] = $state([]);
  let imageUploadProgress = $state<Record<string, boolean>>({});

  // Form validation using Zod schema
  function validateForm(): boolean {
    try {
      bugReportSchema.parse(formData);
      errors = {};
      return true;
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const zodError = error as ZodError;
        const newErrors: Partial<Record<keyof BugReportSchema, string>> = {};

        for (const issue of zodError.issues) {
          const path = issue.path[0] as keyof BugReportSchema;
          newErrors[path] = issue.message;
        }

        errors = newErrors;
      }
      return false;
    }
  }

  // Clean up any existing images (including uploaded ones if submission failed)
  async function cleanupImages(keepUploaded = false): Promise<void> {
    for (const img of imageFiles) {
      // Always clean up preview URLs
      revokeImagePreview(img.preview);

      // Only delete uploaded images if not keeping them (i.e., on submission failure or drawer close)
      if (!keepUploaded && img.uploaded && img.uploadPath) {
        try {
          await deleteBugReportImage({ path: img.uploadPath, supabase });
        } catch (error) {
          console.error('Error cleaning up uploaded image:', error);
        }
      }
    }
  }

  // Reset form when drawer opens
  $effect(() => {
    if (open) {
      // Use untrack to prevent reactive update errors
      untrack(() => {
        formData = {
          title: '',
          description: '',
          steps_to_reproduce: '',
          images: [],
        };
        errors = {};
        isSubmitting = false;

        // Clean up any existing images (don't keep uploaded ones since we're resetting)
        cleanupImages(false);
        imageFiles = [];
        imageUploadProgress = {};
      });
    }
  });

  // Handle image file selection
  async function handleImageUpload(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files) return;

    for (const file of Array.from(files)) {
      // Check if we've reached the limit
      if (imageFiles.length >= IMAGE_UPLOAD_CONFIG.maxImages) {
        toast.error(`Maximum ${IMAGE_UPLOAD_CONFIG.maxImages} images allowed`);
        break;
      }

      // Validate file
      const validation = validateImageFile(file);
      if (!validation.isValid) {
        toast.error(validation.error || 'Invalid file');
        continue;
      }

      // Create image file object
      const imageFile: ImageFile = {
        file,
        preview: createImagePreview(file),
        id: crypto.randomUUID(),
      };

      imageFiles = [...imageFiles, imageFile];
      imageUploadProgress[imageFile.id] = true;

      // Upload image to Supabase storage
      try {
        const result = await uploadBugReportImageToSupabase({
          file,
          supabase,
          session,
        });

        if (result.success && result.url) {
          // Update the image file object with upload info
          const updatedImageFile = {
            ...imageFile,
            uploaded: true,
            uploadPath: result.path,
          };

          // Update imageFiles array
          imageFiles = imageFiles.map((img) =>
            img.id === imageFile.id ? updatedImageFile : img
          );

          // Add URL to form data
          formData.images = [...(formData.images || []), result.url];
        } else {
          toast.error(result.error || 'Failed to upload image');
          // Remove from imageFiles if upload failed
          imageFiles = imageFiles.filter((img) => img.id !== imageFile.id);
          revokeImagePreview(imageFile.preview);
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload image');
        imageFiles = imageFiles.filter((img) => img.id !== imageFile.id);
        revokeImagePreview(imageFile.preview);
      } finally {
        delete imageUploadProgress[imageFile.id];
        imageUploadProgress = { ...imageUploadProgress };
      }
    }

    // Reset input
    target.value = '';
  }

  // Remove image
  async function removeImage(index: number): Promise<void> {
    const imageFile = imageFiles[index];
    if (imageFile) {
      // Clean up uploaded image from storage if it was uploaded
      if (imageFile.uploaded && imageFile.uploadPath) {
        try {
          await deleteBugReportImage({ path: imageFile.uploadPath, supabase });
        } catch (error) {
          console.error('Error deleting uploaded image:', error);
        }
      }

      revokeImagePreview(imageFile.preview);
      imageFiles = imageFiles.filter((_, i) => i !== index);

      // Remove from form data as well
      formData.images = formData.images?.filter((_, i) => i !== index) || [];
    }
  }

  // Handle form submission
  async function handleSubmit(): Promise<void> {
    if (!validateForm()) {
      return;
    }

    if (!isPostHogReady()) {
      toast.error(
        'Bug reporting is currently unavailable. Please try again later.'
      );
      return;
    }

    isSubmitting = true;

    try {
      const result = await submitBugReport(formData, session);

      if (result.success) {
        toast.success(
          'Bug report submitted successfully. Thank you for your feedback!'
        );
        // Keep uploaded images since submission was successful
        await cleanupImages(true);
        open = false;
      } else {
        toast.error(
          result.error || 'Failed to submit bug report. Please try again.'
        );
        // Don't clean up uploaded images so user can retry
      }
    } catch (error) {
      console.error('Error submitting bug report:', error);
      toast.error('Failed to submit bug report. Please try again.');
      // Don't clean up uploaded images so user can retry
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Drawer.Root
  bind:open
  onOpenChange={(newOpen) => (newOpen === false ? false : (open = newOpen))}
>
  <Drawer.Content
    class="bg-background drawer flex min-h-[95%] flex-col overscroll-y-contain"
  >
    <div class="flex-shrink-0 p-4 pb-0">
      <Drawer.Header class="px-0">
        <Drawer.Title class="flex items-center gap-2">
          <TriangleAlert class="h-5 w-5" />
          Report Issue
        </Drawer.Title>
      </Drawer.Header>
    </div>

    <!-- Scrollable content area -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-4">
        <!-- Description moved inside scrollable area -->
        <div class="mb-6">
          <p class="text-muted-foreground text-sm">
            Thanks for taking the time to help improve the site. If there are
            any issues with this form please reach out using the contact link at
            the bottom of the page.
          </p>
        </div>

        <form
          onsubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          class="relative flex grow flex-col gap-4"
        >
          <!-- Title -->
          <div class="flex flex-col gap-2">
            <label for="drawer-title" class="text-sm">Title</label>
            <Input
              id="drawer-title"
              bind:value={formData.title}
              placeholder="Brief description of the bug"
              class={errors.title ? 'border-destructive' : ''}
              inputmode="text"
              autocomplete="off"
              autocapitalize="sentences"
              spellcheck="true"
            />
            {#if errors.title}
              <p class="text-destructive text-sm">{errors.title}</p>
            {/if}
          </div>

          <!-- Description -->
          <div class="flex flex-col gap-2">
            <label for="drawer-description" class="text-sm">Description</label>
            <Textarea
              id="drawer-description"
              bind:value={formData.description}
              placeholder="Detailed description of what happened"
              class="min-h-20 {errors.description ? 'border-destructive' : ''}"
              inputmode="text"
              autocomplete="off"
              autocapitalize="sentences"
              spellcheck="true"
            />
            {#if errors.description}
              <p class="text-destructive text-sm">{errors.description}</p>
            {/if}
          </div>

          <!-- Steps to Reproduce -->
          <div class="flex flex-col gap-2">
            <label for="drawer-steps" class="text-sm">Steps to Reproduce</label>
            <Textarea
              id="drawer-steps"
              bind:value={formData.steps_to_reproduce}
              placeholder="1. Go to...
2. Click on...
3. See error"
              class="min-h-16"
              inputmode="text"
              autocomplete="off"
              autocapitalize="sentences"
              spellcheck="true"
            />
            {#if errors.steps_to_reproduce}
              <p class="text-destructive text-sm">
                {errors.steps_to_reproduce}
              </p>
            {/if}
          </div>

          <!-- Screenshots/Images -->
          <div class="flex flex-col gap-2">
            <label for="drawer-images" class="flex items-center gap-2 text-sm">
              <ImageIcon class="h-4 w-4" />
              Screenshots (Optional)
            </label>
            <div class="space-y-3">
              <!-- Upload Area -->
              <div
                class="border-muted-foreground/25 rounded-lg border-2 border-dashed p-4 text-center"
              >
                <input
                  type="file"
                  id="drawer-image-upload"
                  accept="image/*"
                  multiple
                  onchange={handleImageUpload}
                  class="hidden"
                  disabled={imageFiles.length >= IMAGE_UPLOAD_CONFIG.maxImages}
                />
                <label
                  for="drawer-image-upload"
                  class="block cursor-pointer {imageFiles.length >=
                  IMAGE_UPLOAD_CONFIG.maxImages
                    ? 'cursor-not-allowed opacity-50'
                    : ''}"
                >
                  <Upload class="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                  <p class="text-muted-foreground text-sm">
                    {#if imageFiles.length >= IMAGE_UPLOAD_CONFIG.maxImages}
                      Maximum {IMAGE_UPLOAD_CONFIG.maxImages} images reached
                    {:else}
                      Click to upload screenshots or drag and drop
                    {/if}
                  </p>
                  <p class="text-muted-foreground mt-1 text-xs">
                    JPEG, PNG, WebP, GIF up to {IMAGE_UPLOAD_CONFIG.maxFileSizeMB}MB
                  </p>
                </label>
              </div>

              <!-- Image Previews -->
              {#if imageFiles.length > 0}
                <div class="grid grid-cols-2 gap-2">
                  {#each imageFiles as imageFile, index (imageFile.id)}
                    <div class="group relative">
                      <img
                        src={imageFile.preview}
                        alt="Bug report screenshot {index + 1}"
                        class="h-24 w-full rounded-lg border object-cover"
                      />

                      <!-- Upload Progress -->
                      {#if imageUploadProgress[imageFile.id]}
                        <div
                          class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50"
                        >
                          <Loader class="h-6 w-6 animate-spin text-white" />
                        </div>
                      {/if}

                      <!-- Remove Button -->
                      <button
                        type="button"
                        onclick={() => removeImage(index)}
                        class="bg-destructive text-destructive-foreground absolute -top-2 -right-2 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100"
                        disabled={imageUploadProgress[imageFile.id]}
                      >
                        <X class="h-4 w-4" />
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
            {#if errors.images}
              <p class="text-destructive text-sm">{errors.images}</p>
            {/if}
          </div>
        </form>
      </div>

      <!-- Fixed footer area outside scrollable content -->
      <div class="bg-background shrink-0 border-t p-4 pt-2">
        <div class="flex flex-col gap-2">
          <Button
            type="submit"
            onclick={handleSubmit}
            class="drawer-button-footer"
            disabled={isSubmitting}
          >
            {#if isSubmitting}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            {:else}
              Submit Report
            {/if}
          </Button>
          <Button
            type="button"
            variant="outline"
            class="drawer-button-footer"
            onclick={() => (open = false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  </Drawer.Content>
</Drawer.Root>
