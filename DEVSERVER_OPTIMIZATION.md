# Development Server Optimization Guide

This guide explains how to prevent dev server overload during image processing and provides solutions for local development.

## Issues and Solutions

### 1. Dev Server Overload During Image Processing

**Problem**: The Inngest image processing functions run Sharp (CPU-intensive image processing) directly in the SvelteKit dev server process, causing the server to become unresponsive.

**Solutions Implemented**:

- **Reduced Concurrency**: Development mode processes only 1 image at a time (vs 5 in production)
- **Sequential Processing**: Images are processed one after another with 2-second delays between jobs
- **Lower Quality Settings**: Sharp uses lower effort settings in development (effort 1 for WebP, effort 2 for AVIF)
- **Throttling**: 1-second delay between each image processing step to prevent CPU spikes

### 2. Alternative Development Setup

For heavy image processing during development, consider these options:

#### Option A: Disable Image Processing in Development
Add to your `.env.local`:
```
DISABLE_IMAGE_PROCESSING=true
```

This will skip all background image processing and only use original images.

#### Option B: Use Production Supabase for Processing
Point your local development to a staging/production Supabase instance for image processing:
```
PUBLIC_SUPABASE_URL=your-staging-url
SUPABASE_SERVICE_ROLE_KEY=your-staging-key
```

#### Option C: External Inngest Development Server
Run Inngest functions in a separate process:

1. Install Inngest CLI: `npm install -g inngest`
2. Run dev server: `inngest dev`
3. Point your app to external Inngest: `INNGEST_ENV=development`

### 3. Local Storage Setup

The optimized-images bucket is now configured in `supabase/config.toml`:

```toml
[storage.buckets.optimized-images]
public = true
file_size_limit = "50MiB"
allowed_mime_types = ["image/png", "image/jpeg", "image/webp", "image/avif"]
objects_path = "./storage/optimized-images"
```

This creates the bucket automatically when running `supabase start`.

### 4. Testing Image Processing Locally

Use the provided scripts to test image processing:

```bash
# Test complete workflow (includes Sharp processing)
npm run script:test-image-processing

# Process existing unprocessed images
npm run script:process-existing-images --dry-run  # Preview only
npm run script:process-existing-images            # Actually process
```

**Note**: These scripts will trigger the CPU-intensive processing, so expect the dev server to slow down temporarily.

### 5. Monitoring Resource Usage

To monitor CPU usage during development:

**macOS/Linux**:
```bash
top -p $(pgrep -f "vite\|node.*dev")
```

**Windows**:
```bash
tasklist /fi "imagename eq node.exe"
```

### 6. Production vs Development Differences

| Feature | Development | Production |
|---------|------------|------------|
| Concurrency | 1 image at a time | 5 concurrent images |
| Processing Speed | Throttled (2s delays) | Full speed |
| Sharp Quality | Lower effort | High effort |
| Error Handling | More verbose logging | Standard logging |

## Troubleshooting

### Dev Server Becomes Unresponsive
1. Stop the dev server (Ctrl+C)
2. Clear any pending Inngest jobs: `npm run script:clear-processing-queue`
3. Restart with: `npm run dev`

### Image Processing Stuck
1. Check Supabase logs: `supabase logs`
2. Check Inngest dashboard: `http://localhost:8288`
3. Clear failed jobs: `npm run script:cleanup-failed-jobs`

### Memory Issues
If you encounter memory issues during image processing:

1. Increase Node.js memory limit:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm run dev
   ```

2. Or use the provided script:
   ```bash
   npm run dev:memory  # Runs with increased memory
   ```

## Best Practices for Development

1. **Process Small Batches**: Process 5-10 images at a time instead of hundreds
2. **Use Original Images**: For UI development, use original images and test optimization separately
3. **Monitor Resources**: Keep an eye on CPU usage during image processing
4. **Test in Production-like Environment**: Use staging environment for heavy image processing tests