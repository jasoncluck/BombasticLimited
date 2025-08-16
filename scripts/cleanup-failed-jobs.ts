#!/usr/bin/env tsx

/**
 * Cleanup failed image processing jobs
 * Removes old failed jobs from the database
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('- PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function cleanupFailedJobs() {
  try {
    const olderThanHours = 24;
    console.log(
      `🧹 Cleaning up failed jobs older than ${olderThanHours} hours...`
    );

    const cutoffTime = new Date(
      Date.now() - olderThanHours * 60 * 60 * 1000
    ).toISOString();

    // Get failed jobs count first
    const { data: failedJobs, error: countError } = await supabase
      .from('image_processing_jobs')
      .select('id')
      .eq('status', 'failed')
      .lt('updated_at', cutoffTime);

    if (countError) {
      throw countError;
    }

    const failedCount = failedJobs?.length || 0;
    console.log(`📊 Found ${failedCount} failed jobs to clean up`);

    if (failedCount === 0) {
      console.log('✅ No failed jobs to clean up');
      return;
    }

    // Delete failed jobs
    const { data: deletedJobs, error: deleteError } = await supabase
      .from('image_processing_jobs')
      .delete()
      .eq('status', 'failed')
      .lt('updated_at', cutoffTime)
      .select();

    if (deleteError) {
      throw deleteError;
    }

    const deletedCount = deletedJobs?.length || 0;
    console.log(`✅ Successfully cleaned up ${deletedCount} failed jobs`);
  } catch (error) {
    console.error('❌ Failed to cleanup failed jobs:', error);
    process.exit(1);
  }
}

// Run the script
cleanupFailedJobs();
