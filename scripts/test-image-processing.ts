#!/usr/bin/env tsx
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test script for the image processing queue
 * This script validates the image processing workflow with sample data
 */

import { createClient } from '@supabase/supabase-js';
import { inngest } from '../src/lib/inngest/client.js';

// Test configuration
const TEST_VIDEO_ID = 'test-video-' + Date.now();
const TEST_PLAYLIST_ID = 123456;
const TEST_IMAGE_URL = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'; // Rick Roll thumbnail

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
    persistSession: false,
  },
});

async function testSingleImageProcessing() {
  console.log('🧪 Testing single image processing...');

  try {
    // Send a single image processing event
    const event = await inngest.send({
      name: 'image.process',
      data: {
        entityType: 'video',
        entityId: TEST_VIDEO_ID,
        imageType: 'thumbnail',
        sourceUrl: TEST_IMAGE_URL,
        priority: 1,
      },
    });

    console.log('✅ Single image processing event sent:', event.ids[0]);
    return event.ids[0];
  } catch (error) {
    console.error('❌ Failed to send single image processing event:', error);
    throw error;
  }
}

async function testBatchImageProcessing() {
  console.log('🧪 Testing batch image processing...');

  try {
    const jobs = [
      {
        entityType: 'video' as const,
        entityId: TEST_VIDEO_ID + '-batch-1',
        imageType: 'thumbnail' as const,
        sourceUrl: TEST_IMAGE_URL,
        priority: 10,
      },
      {
        entityType: 'video' as const,
        entityId: TEST_VIDEO_ID + '-batch-2',
        imageType: 'thumbnail_maxres' as const,
        sourceUrl: TEST_IMAGE_URL,
        priority: 10,
      },
      {
        entityType: 'playlist' as const,
        entityId: TEST_PLAYLIST_ID,
        imageType: 'thumbnail' as const,
        sourceUrl: TEST_IMAGE_URL,
        priority: 10,
      },
    ];

    const event = await inngest.send({
      name: 'image.batch.process',
      data: { jobs },
    });

    console.log('✅ Batch image processing event sent:', event.ids[0]);
    console.log(`   Queued ${jobs.length} jobs for processing`);
    return event.ids[0];
  } catch (error) {
    console.error('❌ Failed to send batch image processing event:', error);
    throw error;
  }
}

async function testCleanupJobs() {
  console.log('🧪 Testing job cleanup...');

  try {
    const event = await inngest.send({
      name: 'image.cleanup',
      data: {
        olderThanHours: 1,
        status: 'failed',
      },
    });

    console.log('✅ Cleanup event sent:', event.ids[0]);
    return event.ids[0];
  } catch (error) {
    console.error('❌ Failed to send cleanup event:', error);
    throw error;
  }
}

async function checkJobsInQueue() {
  console.log('📊 Checking jobs in queue...');

  try {
    const { data, error } = await supabase
      .from('image_processing_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    console.log(`Found ${data?.length || 0} recent jobs in queue:`);

    if (data && data.length > 0) {
      data.forEach((job, index) => {
        console.log(
          `  ${index + 1}. ${job.entity_type}:${job.entity_id}:${job.image_type} - ${job.status} (${job.attempts}/${job.max_attempts} attempts)`
        );
      });
    } else {
      console.log('  No jobs found');
    }

    return data;
  } catch (error) {
    console.error('❌ Failed to check jobs:', error);
    throw error;
  }
}

async function testStorageBucketAccess() {
  console.log('🗂️  Testing Supabase Storage access...');

  try {
    // Test bucket exists
    const { data: buckets, error: bucketsError } =
      await supabase.storage.listBuckets();

    if (bucketsError) {
      throw bucketsError;
    }

    const optimizedImagesBucket = buckets?.find(
      (b) => b.name === 'optimized-images'
    );

    if (!optimizedImagesBucket) {
      console.log('⚠️  optimized-images bucket not found. Creating it...');

      const { error: createError } = await supabase.storage.createBucket(
        'optimized-images',
        {
          public: true,
          allowedMimeTypes: [
            'image/webp',
            'image/avif',
            'image/jpeg',
            'image/png',
          ],
          fileSizeLimit: 10485760, // 10MB
        }
      );

      if (createError) {
        throw createError;
      }

      console.log('✅ Created optimized-images bucket');
    } else {
      console.log('✅ optimized-images bucket exists');
    }

    // Test upload/download access with a minimal WebP image
    // This is a minimal 1x1 pixel WebP image (42 bytes)
    const testData = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x1a, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
      0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x34, 0x25, 0xa4, 0x00,
      0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd, 0x50, 0x00,
    ]);
    const testPath = 'test/test-file.webp';

    const { error: uploadError } = await supabase.storage
      .from('optimized-images')
      .upload(testPath, testData, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    console.log('✅ Upload test successful');

    // Clean up test file
    await supabase.storage.from('optimized-images').remove([testPath]);

    console.log('✅ Storage access test completed');
  } catch (error) {
    console.error('❌ Storage access test failed:', error);
    throw error;
  }
}

async function testDatabaseFunctions() {
  console.log('🗃️  Testing database functions...');

  try {
    // Test queue function
    const { data: queueResult, error: queueError } = await supabase.rpc(
      'queue_image_processing_job',
      {
        p_entity_type: 'video',
        p_entity_id: TEST_VIDEO_ID + '-db-test',
        p_image_type: 'thumbnail',
        p_source_url: TEST_IMAGE_URL,
        p_priority: 999,
      }
    );

    if (queueError) {
      throw queueError;
    }

    console.log('✅ Queue function test successful, job ID:', queueResult);

    // Test get next job function
    const { data: nextJob, error: nextJobError } = await supabase.rpc(
      'get_next_image_processing_job'
    );

    if (nextJobError) {
      throw nextJobError;
    }

    console.log('✅ Get next job function test successful');
    if (nextJob && nextJob.length > 0) {
      console.log('   Next job:', nextJob[0]);
    }
  } catch (error) {
    console.error('❌ Database functions test failed:', error);
    throw error;
  }
}

async function waitAndCheckProgress(eventIds: string[]) {
  console.log('⏳ Waiting 30 seconds for processing to complete...');
  await new Promise((resolve) => setTimeout(resolve, 30000));

  console.log('📊 Checking processing progress...');
  await checkJobsInQueue();
}

async function main() {
  console.log('🚀 Starting image processing test...');
  console.log('');

  try {
    // Test storage access first
    await testStorageBucketAccess();
    console.log('');

    // Test database functions
    await testDatabaseFunctions();
    console.log('');

    // Check initial queue state
    await checkJobsInQueue();
    console.log('');

    // Test single image processing
    const singleEventId = await testSingleImageProcessing();
    console.log('');

    // Test batch processing
    const batchEventId = await testBatchImageProcessing();
    console.log('');

    // Test cleanup
    const cleanupEventId = await testCleanupJobs();
    console.log('');

    // Wait and check progress
    await waitAndCheckProgress([singleEventId, batchEventId, cleanupEventId]);

    console.log('✅ All tests completed!');
    console.log('');
    console.log('💡 Tips:');
    console.log('   - Check the Inngest dashboard for job execution details');
    console.log(
      '   - Monitor the image_processing_jobs table for status updates'
    );
    console.log(
      '   - Check the optimized-images storage bucket for processed files'
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: npm run script:test-image-processing

This script tests the image processing system by:
1. Checking Supabase Storage access
2. Testing database functions
3. Sending test events to Inngest
4. Monitoring job progress

No options are required - the script uses test data automatically.
`);
  process.exit(0);
}

main().catch(console.error);
