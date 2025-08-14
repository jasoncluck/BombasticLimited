#!/usr/bin/env tsx

/**
 * Clear pending image processing jobs
 * Useful when dev server becomes unresponsive due to stuck jobs
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

async function clearProcessingQueue() {
  try {
    console.log('🧹 Clearing image processing queue...');

    // Get pending and processing jobs
    const { data: jobs, error: selectError } = await supabase
      .from('image_processing_jobs')
      .select('*')
      .in('status', ['pending', 'processing']);

    if (selectError) {
      throw selectError;
    }

    if (!jobs || jobs.length === 0) {
      console.log('✅ No pending or processing jobs found');
      return;
    }

    console.log(`📊 Found ${jobs.length} jobs to clear:`);
    console.log(`- Pending: ${jobs.filter(j => j.status === 'pending').length}`);
    console.log(`- Processing: ${jobs.filter(j => j.status === 'processing').length}`);

    // Delete all pending and processing jobs
    const { error: deleteError } = await supabase
      .from('image_processing_jobs')
      .delete()
      .in('status', ['pending', 'processing']);

    if (deleteError) {
      throw deleteError;
    }

    console.log('✅ Successfully cleared processing queue');
    console.log('💡 You can now restart your dev server');

  } catch (error) {
    console.error('❌ Failed to clear processing queue:', error);
    process.exit(1);
  }
}

// Run the script
clearProcessingQueue();