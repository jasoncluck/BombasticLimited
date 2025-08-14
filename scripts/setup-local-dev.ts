#!/usr/bin/env tsx

/**
 * Local development setup script for image processing
 * This script sets up the database and storage for local development
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.log('\nAdd these to your .env.local file:');
  console.log('PUBLIC_SUPABASE_URL=your_supabase_url');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkDatabaseConnection() {
  console.log('🔗 Checking database connection...');

  try {
    const { data, error } = await supabase
      .from('videos')
      .select('count')
      .limit(1);

    if (error) {
      throw error;
    }

    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

async function checkImageProcessingTables() {
  console.log('🗃️  Checking image processing tables...');

  try {
    // Check if image_processing_jobs table exists
    const { data, error } = await supabase
      .from('image_processing_jobs')
      .select('count')
      .limit(1);

    if (error && error.message.includes('does not exist')) {
      console.log('⚠️  image_processing_jobs table not found');
      console.log('You need to apply the migration:');
      console.log('  npx supabase db push');
      return false;
    } else if (error) {
      throw error;
    }

    console.log('✅ Image processing tables exist');
    return true;
  } catch (error) {
    console.error('❌ Table check failed:', error);
    return false;
  }
}

async function checkDatabaseFunctions() {
  console.log('⚙️  Checking database functions...');

  try {
    // Test the queue function
    const { data, error } = await supabase.rpc('queue_image_processing_job', {
      p_entity_type: 'video',
      p_entity_id: 'test-setup-' + Date.now(),
      p_image_type: 'thumbnail',
      p_source_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      p_priority: 999,
    });

    if (error && error.message.includes('does not exist')) {
      console.log('⚠️  Database functions not found');
      console.log('You need to apply the migration:');
      console.log('  npx supabase db push');
      return false;
    } else if (error) {
      throw error;
    }

    console.log('✅ Database functions available');

    // Clean up test job
    await supabase.from('image_processing_jobs').delete().eq('id', data);

    return true;
  } catch (error) {
    console.error('❌ Function check failed:', error);
    return false;
  }
}

async function setupStorageBucket() {
  console.log('🗂️  Setting up storage bucket...');

  try {
    // Check if bucket exists
    const { data: buckets, error: bucketsError } =
      await supabase.storage.listBuckets();

    if (bucketsError) {
      throw bucketsError;
    }

    const existingBucket = buckets?.find((b) => b.name === 'optimized-images');

    if (existingBucket) {
      console.log('✅ optimized-images bucket already exists');
      return true;
    }

    console.log('📦 Creating optimized-images bucket...');

    const { error: createError } = await supabase.storage.createBucket(
      'optimized-images',
      {
        public: true,
        allowedMimeTypes: ['image/webp', 'image/avif', 'image/jpeg', 'image/png'],
        fileSizeLimit: 10485760, // 10MB
      }
    );

    if (createError) {
      throw createError;
    }

    console.log('✅ optimized-images bucket created successfully');
    return true;
  } catch (error) {
    console.error('❌ Storage setup failed:', error);

    // Provide manual setup instructions
    console.log('\n📝 Manual setup required:');
    console.log('1. Go to your Supabase Dashboard → Storage');
    console.log('2. Create a new bucket named "optimized-images"');
    console.log('3. Make it public');
    console.log('4. Set allowed MIME types: image/webp, image/avif');
    console.log('5. Set file size limit: 10MB');

    return false;
  }
}

async function testStorageAccess() {
  console.log('🧪 Testing storage access...');

  try {
    // Test upload with a minimal WebP image
    // This is a minimal 1x1 pixel WebP image (42 bytes)
    const testData = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x1a, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
      0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x34, 0x25, 0xa4, 0x00,
      0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd, 0x50, 0x00
    ]);
    const testPath = 'setup-test/test-file.webp';

    const { error: uploadError } = await supabase.storage
      .from('optimized-images')
      .upload(testPath, testData, { 
        contentType: 'image/webp',
        upsert: true 
      });

    if (uploadError) {
      throw uploadError;
    }

    // Test download
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('optimized-images')
      .download(testPath);

    if (downloadError) {
      throw downloadError;
    }

    // Clean up
    await supabase.storage.from('optimized-images').remove([testPath]);

    console.log('✅ Storage read/write access confirmed');
    return true;
  } catch (error) {
    console.error('❌ Storage access test failed:', error);
    return false;
  }
}

async function checkEnvironmentVariables() {
  console.log('🔧 Checking environment variables...');

  const required = {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const optional = {
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  };

  let allRequiredPresent = true;

  console.log('\n Required variables:');
  for (const [key, value] of Object.entries(required)) {
    if (value) {
      console.log(`  ✅ ${key}: Set (${value.length} chars)`);
    } else {
      console.log(`  ❌ ${key}: Missing`);
      allRequiredPresent = false;
    }
  }

  console.log('\n Optional variables:');
  for (const [key, value] of Object.entries(optional)) {
    if (value) {
      console.log(`  ✅ ${key}: Set (${value.length} chars)`);
    } else {
      console.log(`  ⚠️  ${key}: Not set (background processing won't work)`);
    }
  }

  return allRequiredPresent;
}

async function showNextSteps(allChecksPass: boolean) {
  console.log('\n🎯 Next Steps:');

  if (!allChecksPass) {
    console.log('❌ Setup incomplete. Please fix the issues above first.');
    return;
  }

  console.log('✅ Local setup complete! You can now:');
  console.log('');
  console.log('1. Test the image processing system:');
  console.log('   npm run script:test-image-processing');
  console.log('');
  console.log('2. Process existing images in your database:');
  console.log('   npm run script:process-existing-images -- --dry-run');
  console.log('   npm run script:process-existing-images');
  console.log('');
  console.log('3. Start development with background processing:');
  console.log('   # Terminal 1: Start Inngest dev server');
  console.log('   npx inngest-cli@latest dev');
  console.log('   ');
  console.log('   # Terminal 2: Start SvelteKit');
  console.log('   npm run dev');
  console.log('');
  console.log('4. Test API endpoints directly:');
  console.log(
    '   curl "http://localhost:5173/api/video-thumbnail?url=https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg&format=webp"'
  );
  console.log('');
  console.log('📚 For more details, see LOCAL_SETUP_GUIDE.md');
}

async function main() {
  console.log('🚀 Image Processing Local Setup');
  console.log('================================\n');

  const checks = [
    checkEnvironmentVariables,
    checkDatabaseConnection,
    checkImageProcessingTables,
    checkDatabaseFunctions,
    setupStorageBucket,
    testStorageAccess,
  ];

  let allPassed = true;

  for (const check of checks) {
    try {
      const result = await check();
      if (!result) {
        allPassed = false;
      }
      console.log('');
    } catch (error) {
      console.error('❌ Check failed:', error);
      allPassed = false;
      console.log('');
    }
  }

  await showNextSteps(allPassed);

  if (!allPassed) {
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Image Processing Local Setup Script

This script checks and sets up everything needed for local development:
- Database connection and tables
- Storage bucket and permissions  
- Environment variables
- Required database functions

Usage: npm run script:setup-local-dev

No options are required - the script will check and set up everything automatically.
`);
  process.exit(0);
}

main().catch(console.error);

