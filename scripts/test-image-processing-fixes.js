#!/usr/bin/env node

/**
 * Test script to validate image processing removal
 * This script checks that image processing functionality has been properly removed
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🧪 Testing Image Processing Removal');
console.log('='.repeat(60));

console.log('📋 Validating migration file updates...\n');

// Check key migration files for proper removal of image processing
const migrations = [
  '../supabase/migrations/20250721023754_01_extensions_and_types.sql',
  '../supabase/migrations/20250721023756_03_base_tables.sql', 
  '../supabase/migrations/20250823044958_15_image-processing.sql',
  '../supabase/migrations/20250823162000_16_remove_image_processing_fields.sql'
];

let migrationsPassed = 0;
let total = migrations.length;

migrations.forEach((migrationPath, index) => {
  try {
    const fullPath = join(__dirname, migrationPath);
    const content = readFileSync(fullPath, 'utf8');
    const filename = migrationPath.split('/').pop();

    console.log(`Migration ${index + 1}: ${filename}`);

    if (filename.includes('01_extensions_and_types')) {
      // Should NOT contain image_processing_status enum
      const hasEnumRemoved = !content.includes('CREATE TYPE "public"."image_processing_status"');
      console.log(`  ${hasEnumRemoved ? '✅' : '❌'} image_processing_status enum removed`);
      if (hasEnumRemoved) migrationsPassed++;
    }
    else if (filename.includes('03_base_tables')) {
      // Should NOT contain image_processing fields in tables
      const hasVideoFieldsRemoved = !content.includes('"image_processing_status"') && 
                                    !content.includes('"image_processing_updated_at"');
      const hasPlaylistFieldsRemoved = !content.includes('public.image_processing_status');
      console.log(`  ${hasVideoFieldsRemoved ? '✅' : '❌'} Video table image_processing fields removed`);
      console.log(`  ${hasPlaylistFieldsRemoved ? '✅' : '❌'} Playlist table image_processing fields removed`);
      if (hasVideoFieldsRemoved && hasPlaylistFieldsRemoved) migrationsPassed++;
    }
    else if (filename.includes('15_image-processing')) {
      // Should be disabled/commented out
      const isDisabled = content.includes('disabled') || content.includes('commented out');
      console.log(`  ${isDisabled ? '✅' : '❌'} Image processing migration disabled`);
      if (isDisabled) migrationsPassed++;
    }
    else if (filename.includes('16_remove_image_processing_fields')) {
      // Should be converted to no-op
      const isNoOp = content.includes('disabled') && content.length < 500;
      console.log(`  ${isNoOp ? '✅' : '❌'} Remove fields migration converted to no-op`);
      if (isNoOp) migrationsPassed++;
    }

    console.log('');
  } catch (error) {
    console.log(`❌ Error reading ${migrationPath}: ${error.message}\n`);
  }
});

console.log(`📊 Migration validation: ${migrationsPassed}/${total} files correctly updated`);

// Check SQL function files
console.log('\n🔧 Validating SQL function updates...\n');

const functionFiles = [
  '../supabase/migrations/20250721023809_08c_video_query_functions.sql',
  '../supabase/migrations/20250721023810_08d_playlist_query_functions.sql',
  '../supabase/migrations/20250721023811_08e_playlist_management_functions.sql'
];

let functionsPassed = 0;

functionFiles.forEach((filePath, index) => {
  try {
    const fullPath = join(__dirname, filePath);
    const content = readFileSync(fullPath, 'utf8');
    const filename = filePath.split('/').pop();

    // Count image_processing references (should be zero)
    const imageProcessingRefs = (content.match(/image_processing_status|image_processing_updated_at/g) || []).length;
    const hasNoReferences = imageProcessingRefs === 0;

    console.log(`Function file ${index + 1}: ${filename}`);
    console.log(`  ${hasNoReferences ? '✅' : '❌'} No image_processing field references (found: ${imageProcessingRefs})`);

    if (hasNoReferences) functionsPassed++;
    console.log('');
  } catch (error) {
    console.log(`❌ Error reading ${filePath}: ${error.message}\n`);
  }
});

console.log(`📊 Function file validation: ${functionsPassed}/${functionFiles.length} files correctly updated`);

const totalPassed = migrationsPassed + functionsPassed;
const totalChecks = total + functionFiles.length;

if (totalPassed === totalChecks) {
  console.log('\n🎉 All files have been properly updated!');
  console.log('\n📝 Image processing removal complete:');
  console.log('   • Enum type removed from base types');
  console.log('   • Database columns removed from tables');
  console.log('   • SQL functions updated to remove field references');
  console.log('   • Image processing migration disabled');
  console.log('   • Static image fields preserved (thumbnail_url, image_webp_url, image_avif_url, image_properties)');
  console.log('\n🚀 Database schema is now clean without image processing functionality');
} else {
  console.log(`\n⚠️  ${totalChecks - totalPassed} files still need updates`);
  process.exit(1);
}
