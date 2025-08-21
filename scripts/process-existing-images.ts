#!/usr/bin/env node

/**
 * Script to process existing images in the database
 * This script will queue background processing for all videos and playlists
 * that don't have optimized images yet.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local for local development
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

dotenv.config({ path: join(projectRoot, '.env.local') });
dotenv.config({ path: join(projectRoot, '.env') });

// Configuration
const BATCH_SIZE = 100; // Increased from 50 to 100 for better throughput
const DRY_RUN = process.argv.includes('--dry-run');
const ENTITY_TYPE = process.argv.includes('--videos')
  ? 'videos'
  : process.argv.includes('--playlists')
    ? 'playlists'
    : 'both';
const FORCE_REPROCESS = process.argv.includes('--force');

// Initialize Supabase client
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase environment variables');
  console.error('Required: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error(
    'For local development, make sure you have a .env.local file with:'
  );
  console.error('PUBLIC_SUPABASE_URL=your_supabase_url');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  console.error('');
  console.error(
    'You can also run "supabase start" to use local Supabase instance.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface Video {
  id: string;
  thumbnail_url: string | null;
  thumbnail_webp_url: string | null;
  thumbnail_avif_url: string | null;
  image_processing_status: string | null;
}

interface Playlist {
  id: string;
  thumbnail_video_id: string | null;
  image_webp_url: string | null;
  image_avif_url: string | null;
  image_processing_status: string | null;
  video_thumbnail_url: string | null;
}

interface Job {
  entity_type: 'video' | 'playlist';
  entity_id: string;
  image_type: 'thumbnail' | 'playlist_image';
  source_url: string;
  priority: number;
}

async function getVideosToProcess(): Promise<Video[]> {
  console.log('Fetching videos that need image processing...');

  let query = supabase
    .from('videos')
    .select(
      `
      id,
      thumbnail_url,
      thumbnail_webp_url,
      thumbnail_avif_url,
      image_processing_status
    `
    )
    .or('thumbnail_url.not.is.null');

  if (!FORCE_REPROCESS) {
    query = query.or(
      'image_processing_status.is.null,image_processing_status.eq.pending,image_processing_status.eq.failed'
    );
  }

  const { data, error } = await query.order('published_at', {
    ascending: false,
  });

  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }

  return data || [];
}

async function getPlaylistsToProcess(): Promise<Playlist[]> {
  console.log('Fetching playlists that need image processing...');

  // Get all playlists with thumbnail_video_id (we'll filter by actual image existence later)
  const playlistQuery = supabase
    .from('playlists')
    .select(
      `
      id,
      thumbnail_video_id,
      image_webp_url,
      image_avif_url,
      image_processing_status
    `
    )
    .not('thumbnail_video_id', 'is', null)
    .is('deleted_at', null);

  const { data: playlists, error: playlistError } = await playlistQuery.order(
    'created_at',
    { ascending: false }
  );

  if (playlistError) {
    throw new Error(`Failed to fetch playlists: ${playlistError.message}`);
  }

  if (!playlists || playlists.length === 0) {
    console.log('No playlists with thumbnail_video_id found');
    return [];
  }

  console.log(`Found ${playlists.length} playlists with thumbnail_video_id`);

  // Now get the video thumbnail URLs for these playlists
  const videoIds = playlists.map((p) => p.thumbnail_video_id).filter(Boolean);

  if (videoIds.length === 0) {
    return [];
  }

  const { data: videos, error: videoError } = await supabase
    .from('videos')
    .select('id, thumbnail_url ')
    .in('id', videoIds);

  if (videoError) {
    throw new Error(`Failed to fetch video thumbnails: ${videoError.message}`);
  }

  // Create a map of video thumbnails
  const videoThumbnailMap = new Map();
  videos?.forEach((video) => {
    videoThumbnailMap.set(video.id, {
      thumbnail_url: video.thumbnail_url,
    });
  });

  // Combine playlist data with video thumbnail data
  const playlistsWithThumbnails: Playlist[] = playlists.map((playlist) => {
    const videoThumbnails = videoThumbnailMap.get(playlist.thumbnail_video_id);
    return {
      ...playlist,
      video_thumbnail_url: videoThumbnails?.thumbnail_url || null,
    };
  });

  console.log(
    `Successfully joined ${playlistsWithThumbnails.length} playlists with video thumbnail data`
  );

  return playlistsWithThumbnails;
}

function createVideoJobs(videos: Video[]): Job[] {
  const jobs: Job[] = [];

  for (const video of videos) {
    // Skip if already has optimized images (unless forcing)
    if (
      !FORCE_REPROCESS &&
      video.image_processing_status === 'completed' &&
      (video.thumbnail_webp_url || video.thumbnail_avif_url)
    ) {
      continue;
    }

    if (video.thumbnail_url) {
      jobs.push({
        entity_type: 'video' as const,
        entity_id: video.id,
        image_type: 'thumbnail' as const,
        source_url: video.thumbnail_url,
        priority: 200, // Lower priority for batch processing
      });
    }
  }

  return jobs;
}

function createPlaylistJobs(playlists: Playlist[]): Job[] {
  const jobs: Job[] = [];

  for (const playlist of playlists) {
    console.log(`Processing playlist ${playlist.id}:`, {
      thumbnail_video_id: playlist.thumbnail_video_id,
      video_thumbnail_url: !!playlist.video_thumbnail_url,
      image_processing_status: playlist.image_processing_status,
      has_webp: !!playlist.image_webp_url,
      has_avif: !!playlist.image_avif_url,
    });

    const hasOptimizedImages =
      playlist.image_webp_url && playlist.image_avif_url;

    if (!FORCE_REPROCESS && hasOptimizedImages) {
      console.log(
        `Skipping playlist ${playlist.id} - already has WebP and AVIF images`
      );
      continue;
    }

    // Skip if no thumbnail video or video thumbnails
    if (!playlist.thumbnail_video_id) {
      console.log(`Skipping playlist ${playlist.id} - no thumbnail_video_id`);
      continue;
    }

    const sourceUrl = playlist.video_thumbnail_url;

    if (!sourceUrl) {
      console.log(
        `Skipping playlist ${playlist.id} - no video thumbnail URLs available`
      );
      continue;
    }

    console.log(
      `Creating job for playlist ${playlist.id} with source URL: ${sourceUrl} (missing WebP: ${!playlist.image_webp_url}, missing AVIF: ${!playlist.image_avif_url})`
    );

    jobs.push({
      entity_type: 'playlist' as const,
      entity_id: playlist.id.toString(),
      image_type: 'playlist_image' as const,
      source_url: sourceUrl,
      priority: 200,
    });
  }

  return jobs;
}

async function processBatch(jobs: Job[], batchNumber: number) {
  console.log(`Processing batch ${batchNumber}: ${jobs.length} jobs`);

  if (DRY_RUN) {
    console.log(
      'DRY RUN: Would process these jobs:',
      jobs.map(
        (j) =>
          `${j.entity_type}:${j.entity_id}:${j.image_type} (${j.source_url})`
      )
    );
    return;
  }

  try {
    // Create database jobs using the queue_image_processing_job function
    const jobPromises = jobs.map((job) =>
      supabase.rpc('queue_image_processing_job', {
        p_entity_type: job.entity_type,
        p_entity_id: job.entity_id,
        p_image_type: job.image_type,
        p_source_url: job.source_url,
        p_priority: job.priority,
      })
    );

    const results = await Promise.all(jobPromises);
    const successful = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;

    if (failed > 0) {
      console.error(
        `❌ Failed to queue ${failed} jobs in batch ${batchNumber}`
      );
      results.forEach((result, index) => {
        if (result.error) {
          console.error(`  Job ${index + 1}: ${result.error.message}`);
        }
      });
    }

    console.log(
      `✅ Queued batch ${batchNumber}: ${successful} successful, ${failed} failed`
    );
  } catch (error) {
    console.error(`❌ Failed to queue batch ${batchNumber}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🖼️  Starting existing image processing...');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Entity type: ${ENTITY_TYPE}`);
  console.log(`Force reprocess: ${FORCE_REPROCESS}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  try {
    const allJobs: Job[] = [];

    // Process videos
    if (ENTITY_TYPE === 'videos' || ENTITY_TYPE === 'both') {
      const videos = await getVideosToProcess();
      const videoJobs = createVideoJobs(videos);
      allJobs.push(...videoJobs);
      console.log(
        `Found ${videos.length} videos, created ${videoJobs.length} video processing jobs`
      );
    }

    // Process playlists
    if (ENTITY_TYPE === 'playlists' || ENTITY_TYPE === 'both') {
      const playlists = await getPlaylistsToProcess();
      const playlistJobs = createPlaylistJobs(playlists);
      allJobs.push(...playlistJobs);
      console.log(
        `Found ${playlists.length} playlists, created ${playlistJobs.length} playlist processing jobs`
      );
    }

    if (allJobs.length === 0) {
      console.log('✅ No images need processing');
      return;
    }

    console.log(`\nTotal jobs to process: ${allJobs.length}`);
    console.log(
      `Will be processed in ${Math.ceil(allJobs.length / BATCH_SIZE)} batches`
    );

    if (!DRY_RUN) {
      console.log('\nStarting processing in 3 seconds...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Process in batches
    for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
      const batch = allJobs.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      await processBatch(batch, batchNumber);

      // Add delay between batches to avoid overwhelming the system
      if (i + BATCH_SIZE < allJobs.length && !DRY_RUN) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log('\n✅ Image processing queuing completed!');

    if (!DRY_RUN) {
      console.log(
        '\n📊 You can monitor progress by checking the image_processing_jobs table'
      );
      console.log(
        '🌐 Jobs will be processed by the job poller and Inngest workers'
      );
      console.log(
        '⏰ The poller runs every 5 minutes and processes up to 50 jobs per cycle'
      );
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: npm run script:process-existing-images [options]

Options:
  --dry-run          Don't actually queue jobs, just show what would be processed
  --videos           Only process videos
  --playlists        Only process playlists
  --force            Reprocess even if images already exist
  --help, -h         Show this help message

Examples:
  npm run script:process-existing-images --dry-run
  npm run script:process-existing-images --videos
  npm run script:process-existing-images --force

Environment Setup:
  This script requires Supabase environment variables:
  - PUBLIC_SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  
  For local development, create a .env.local file or run "supabase start".
`);
  process.exit(0);
}

main().catch(console.error);
