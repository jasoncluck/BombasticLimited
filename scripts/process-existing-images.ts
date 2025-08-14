#!/usr/bin/env tsx

/**
 * Script to process existing images in the database
 * This script will queue background processing for all videos and playlists
 * that don't have optimized images yet.
 */

import { createClient } from '@supabase/supabase-js';
import { inngest } from '../src/lib/inngest/client.js';

// Configuration
const BATCH_SIZE = 50;
const DRY_RUN = process.argv.includes('--dry-run');
const ENTITY_TYPE = process.argv.includes('--videos') ? 'videos' : 
                   process.argv.includes('--playlists') ? 'playlists' : 'both';
const FORCE_REPROCESS = process.argv.includes('--force');

// Initialize Supabase client
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase environment variables');
  console.error('Required: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface Video {
  id: string;
  thumbnail_url: string | null;
  thumbnail_maxres_url: string | null;
  thumbnail_webp_path: string | null;
  thumbnail_avif_path: string | null;
  thumbnail_maxres_webp_path: string | null;
  thumbnail_maxres_avif_path: string | null;
  image_processing_status: string | null;
}

interface Playlist {
  id: string;
  thumbnail_url: string | null;
  thumbnail_maxres_url: string | null;
  thumbnail_webp_path: string | null;
  thumbnail_avif_path: string | null;
  thumbnail_maxres_webp_path: string | null;
  thumbnail_maxres_avif_path: string | null;
  image_processing_status: string | null;
}

async function getVideosToProcess(): Promise<Video[]> {
  console.log('Fetching videos that need image processing...');
  
  let query = supabase
    .from('videos')
    .select(`
      id,
      thumbnail_url,
      thumbnail_maxres_url,
      thumbnail_webp_path,
      thumbnail_avif_path,
      thumbnail_maxres_webp_path,
      thumbnail_maxres_avif_path,
      image_processing_status
    `)
    .or('thumbnail_url.not.is.null,thumbnail_maxres_url.not.is.null');
  
  if (!FORCE_REPROCESS) {
    query = query.or('image_processing_status.is.null,image_processing_status.eq.pending,image_processing_status.eq.failed');
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }
  
  return data || [];
}

async function getPlaylistsToProcess(): Promise<Playlist[]> {
  console.log('Fetching playlists that need image processing...');
  
  let query = supabase
    .from('playlists')
    .select(`
      id,
      thumbnail_url,
      thumbnail_maxres_url,
      thumbnail_webp_path,
      thumbnail_avif_path,
      thumbnail_maxres_webp_path,
      thumbnail_maxres_avif_path,
      image_processing_status
    `)
    .or('thumbnail_url.not.is.null,thumbnail_maxres_url.not.is.null')
    .is('deleted_at', null);
  
  if (!FORCE_REPROCESS) {
    query = query.or('image_processing_status.is.null,image_processing_status.eq.pending,image_processing_status.eq.failed');
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch playlists: ${error.message}`);
  }
  
  return data || [];
}

function createVideoJobs(videos: Video[]) {
  const jobs = [];
  
  for (const video of videos) {
    // Skip if already has optimized images (unless forcing)
    if (!FORCE_REPROCESS && video.image_processing_status === 'completed' && 
        (video.thumbnail_webp_path || video.thumbnail_avif_path)) {
      continue;
    }
    
    if (video.thumbnail_url) {
      jobs.push({
        entityType: 'video' as const,
        entityId: video.id,
        imageType: 'thumbnail' as const,
        sourceUrl: video.thumbnail_url,
        priority: 200, // Lower priority for batch processing
      });
    }
    
    if (video.thumbnail_maxres_url) {
      jobs.push({
        entityType: 'video' as const,
        entityId: video.id,
        imageType: 'thumbnail_maxres' as const,
        sourceUrl: video.thumbnail_maxres_url,
        priority: 200,
      });
    }
  }
  
  return jobs;
}

function createPlaylistJobs(playlists: Playlist[]) {
  const jobs = [];
  
  for (const playlist of playlists) {
    // Skip if already has optimized images (unless forcing)
    if (!FORCE_REPROCESS && playlist.image_processing_status === 'completed' && 
        (playlist.thumbnail_webp_path || playlist.thumbnail_avif_path)) {
      continue;
    }
    
    if (playlist.thumbnail_url) {
      jobs.push({
        entityType: 'playlist' as const,
        entityId: playlist.id.toString(),
        imageType: 'thumbnail' as const,
        sourceUrl: playlist.thumbnail_url,
        priority: 200,
      });
    }
    
    if (playlist.thumbnail_maxres_url) {
      jobs.push({
        entityType: 'playlist' as const,
        entityId: playlist.id.toString(),
        imageType: 'thumbnail_maxres' as const,
        sourceUrl: playlist.thumbnail_maxres_url,
        priority: 200,
      });
    }
  }
  
  return jobs;
}

async function processBatch(jobs: any[], batchNumber: number) {
  console.log(`Processing batch ${batchNumber}: ${jobs.length} jobs`);
  
  if (DRY_RUN) {
    console.log('DRY RUN: Would process these jobs:', jobs.map(j => `${j.entityType}:${j.entityId}:${j.imageType}`));
    return;
  }
  
  try {
    await inngest.send({
      name: 'image.batch.process',
      data: { jobs },
    });
    console.log(`✅ Queued batch ${batchNumber} successfully`);
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
    let allJobs = [];
    
    // Process videos
    if (ENTITY_TYPE === 'videos' || ENTITY_TYPE === 'both') {
      const videos = await getVideosToProcess();
      const videoJobs = createVideoJobs(videos);
      allJobs.push(...videoJobs);
      console.log(`Found ${videos.length} videos, created ${videoJobs.length} video processing jobs`);
    }
    
    // Process playlists
    if (ENTITY_TYPE === 'playlists' || ENTITY_TYPE === 'both') {
      const playlists = await getPlaylistsToProcess();
      const playlistJobs = createPlaylistJobs(playlists);
      allJobs.push(...playlistJobs);
      console.log(`Found ${playlists.length} playlists, created ${playlistJobs.length} playlist processing jobs`);
    }
    
    if (allJobs.length === 0) {
      console.log('✅ No images need processing');
      return;
    }
    
    console.log(`\nTotal jobs to process: ${allJobs.length}`);
    console.log(`Will be processed in ${Math.ceil(allJobs.length / BATCH_SIZE)} batches`);
    
    if (!DRY_RUN) {
      console.log('\nStarting processing in 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Process in batches
    for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
      const batch = allJobs.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      
      await processBatch(batch, batchNumber);
      
      // Add delay between batches to avoid overwhelming the system
      if (i + BATCH_SIZE < allJobs.length && !DRY_RUN) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n✅ Image processing queuing completed!');
    
    if (!DRY_RUN) {
      console.log('\n📊 You can monitor progress by checking the image_processing_jobs table');
      console.log('🌐 Jobs will be processed in the background by Inngest');
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
`);
  process.exit(0);
}

main().catch(console.error);