# Background Image Processing - Local Development Setup

This guide helps you set up and test the background image processing system locally.

## Prerequisites

Before setting up the image processing system, ensure you have:

1. **Supabase Local Setup** (if using local development)
   ```bash
   # Start Supabase locally
   npx supabase start
   ```

2. **Environment Variables** - Add these to your `.env.local`:
   ```bash
   # Supabase (required)
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Inngest (required for background processing)
   INNGEST_SIGNING_KEY=your_inngest_signing_key
   ```

## Database Setup

1. **Apply Migration**
   ```bash
   # Apply the image processing migration
   npx supabase db push
   
   # Or if using remote database
   npx supabase migration up
   ```

2. **Storage Bucket Auto-Setup**
   
   The `optimized-images` bucket is now automatically configured in `supabase/config.toml` and will be created when you run:
   
   ```bash
   npx supabase start
   ```
   
   The bucket configuration includes:
   - Public access enabled
   - 50MiB file size limit
   - Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/avif`
   - Local storage path: `./storage/optimized-images`

3. **Manual Bucket Creation** (if needed)
   
   If automatic setup doesn't work, create manually:
   - Go to Supabase Dashboard → Storage
   - Create a new bucket named `optimized-images`
   - Make it public
   - Set allowed MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/avif`

## Local Development

⚠️ **Important**: Image processing is CPU-intensive and can overload your dev server. See [Development Server Optimization Guide](./DEVSERVER_OPTIMIZATION.md) for solutions.

### Option 1: Optimized Development (Recommended)

For the best development experience, use these optimized npm scripts:

```bash
# Standard development with optimizations
npm run dev

# Development with increased memory for heavy processing
npm run dev:memory

# Development with image processing disabled (fastest)
npm run dev:no-processing
```

### Option 2: Using Inngest Dev Server

1. **Install Inngest CLI**
   ```bash
   npm install -g inngest-cli
   ```

2. **Start Inngest Dev Server**
   ```bash
   # In one terminal
   npx inngest-cli@latest dev
   ```

3. **Start Your SvelteKit App**
   ```bash
   # In another terminal
   npm run dev
   ```

4. **Test the System**
   ```bash
   # Test that everything is working
   npm run script:test-image-processing
   ```

### Option 3: Without Background Processing

If you want to focus on UI development without image processing overhead:

1. **Start SvelteKit**
   ```bash
   npm run dev
   ```

2. **Test API Endpoints Directly**
   ```bash
   # Test video thumbnail processing
   curl "http://localhost:5173/api/video-thumbnail?url=https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg&format=webp"
   
   # Test playlist image processing
   curl "http://localhost:5173/api/playlist-image?url=https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg&format=avif"
   ```

## Testing Scripts

### 1. Test Image Processing System

Tests the complete background processing workflow:

```bash
npm run script:test-image-processing
```

This script will:
- ✅ Test Supabase Storage access
- ✅ Test database functions
- ✅ Send test events to Inngest
- ✅ Monitor job progress

### 2. Process Existing Images

Queue existing images in your database for background processing:

```bash
# Dry run (see what would be processed)
npm run script:process-existing-images -- --dry-run

# Process all videos and playlists
npm run script:process-existing-images

# Process only videos
npm run script:process-existing-images -- --videos

# Process only playlists  
npm run script:process-existing-images -- --playlists

# Force reprocess even if optimized images exist
npm run script:process-existing-images -- --force
```

## Monitoring

### Database Tables

Monitor processing status via SQL:

```sql
-- Check recent jobs
SELECT * FROM image_processing_jobs 
ORDER BY created_at DESC 
LIMIT 10;

-- Check job status summary
SELECT status, COUNT(*) 
FROM image_processing_jobs 
GROUP BY status;

-- Check entity processing status
SELECT image_processing_status, COUNT(*) 
FROM videos 
GROUP BY image_processing_status;
```

### Inngest Dashboard

When using Inngest dev server, visit:
- Local: `http://localhost:8288`
- Production: Your Inngest dashboard URL

## Troubleshooting

### Common Issues

1. **"Missing environment variables"**
   - Ensure all required env vars are set in `.env.local`
   - Check that Supabase keys are valid

2. **"Bucket not found"**
   - Create the `optimized-images` bucket in Supabase Storage
   - Make sure it's set to public

3. **"Sharp processing failed"**
   - Ensure Sharp is installed: `npm install sharp`
   - On some systems you may need: `npm rebuild sharp`

4. **"Cannot import server code"**
   - This indicates a client-side import of server-only code
   - Check import paths in components use shared utilities

### Debugging

Enable debug logging:

```bash
# Set debug environment
DEBUG=inngest* npm run dev

# Or for more verbose logging
NODE_ENV=development npm run dev
```

### Manual Testing

Test individual functions:

```typescript
// Test format detection
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
console.log(detectOptimalFormat('image/avif,image/webp,*/*')); // 'avif'

// Test image validation
import { validateImageUrl } from '$lib/server/image-processing';
console.log(validateImageUrl('https://i.ytimg.com/vi/test/maxresdefault.jpg')); // true
```

## Production Deployment

1. **Environment Variables**
   - Set all required env vars in your hosting platform
   - Use production Supabase keys

2. **Inngest Setup**
   - Create Inngest account and get signing key
   - Configure webhook endpoint: `https://your-domain.com/api/inngest`

3. **Storage Configuration**
   - Ensure `optimized-images` bucket exists
   - Configure CDN if needed

## Performance Tips

- **Batch Processing**: Use the batch script for large datasets
- **Monitoring**: Set up alerts for failed jobs
- **Cleanup**: Run periodic cleanup of old failed jobs
- **Caching**: Optimized images are cached via CDN

## Need Help?

- Check the test scripts output for detailed error messages
- Monitor the `image_processing_jobs` table for job status
- Use Inngest dashboard for execution details
- Verify all environment variables are correctly set