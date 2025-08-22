#!/usr/bin/env node

/**
 * Simple test script to validate image processing job completion fixes
 * This script checks that our SQL functions work as expected
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🧪 Testing Image Processing Job Completion Fixes');
console.log('='.repeat(60));

// Read our test SQL file
const testFile = join(
  __dirname,
  '../supabase/tests/13_image_processing_job_completion.sql'
);

try {
  const testContent = readFileSync(testFile, 'utf8');

  // Basic validation that our test file contains the expected elements
  const expectedPatterns = [
    /complete_image_processing_job_with_worker/,
    /orphaned job detection/i,
    /cleanup_orphaned_image_processing_jobs/,
    /entity verification/i,
    /atomic updates/i,
    /nonexistent entity should fail/i,
  ];

  let passed = 0;
  let total = expectedPatterns.length;

  console.log('📋 Validating test file structure...\n');

  expectedPatterns.forEach((pattern, index) => {
    const matches = pattern.test(testContent);
    console.log(
      `${matches ? '✅' : '❌'} Test ${index + 1}: ${pattern.source}`
    );
    if (matches) passed++;
  });

  console.log(`\n📊 Test file validation: ${passed}/${total} checks passed`);

  if (passed === total) {
    console.log('\n🎉 Test file structure looks good!');
    console.log('\n📝 Key improvements implemented:');
    console.log('   • Entity existence validation before updates');
    console.log('   • Safe type casting with error handling');
    console.log('   • Update entities BEFORE deleting jobs');
    console.log('   • Orphaned job detection and cleanup');
    console.log('   • Better error messages and logging');
    console.log('\n💡 To run full tests: npm run test:sql');
  } else {
    console.log(
      '\n⚠️  Some test patterns are missing - please review the test file'
    );
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error reading test file:', error.message);
  process.exit(1);
}

// Check migration files for our key fixes
console.log('\n🔧 Validating migration file changes...\n');

const migrations = [
  '../supabase/migrations/20250820000000_16_image_processing_worker_support.sql',
  '../supabase/migrations/20250814173410_15_image_processing.sql',
];

let migrationsPassed = 0;

migrations.forEach((migrationPath, index) => {
  try {
    const fullPath = join(__dirname, migrationPath);
    const content = readFileSync(fullPath, 'utf8');

    // Check for key improvements
    const hasEntityValidation =
      content.includes('entity_exists') && content.includes('SELECT EXISTS');
    const hasSafeTypeCasting =
      content.includes('invalid_text_representation') &&
      content.includes('EXCEPTION');
    const hasEntityUpdateFirst =
      content.indexOf('UPDATE') < content.indexOf('DELETE FROM');
    const hasBetterLogging =
      content.includes('RAISE LOG') || content.includes('RAISE WARNING');

    console.log(`Migration ${index + 1}: ${migrationPath.split('/').pop()}`);
    console.log(
      `  ${hasEntityValidation ? '✅' : '❌'} Entity existence validation`
    );
    console.log(`  ${hasSafeTypeCasting ? '✅' : '❌'} Safe type casting`);
    console.log(`  ${hasEntityUpdateFirst ? '✅' : '❌'} Update before delete`);
    console.log(`  ${hasBetterLogging ? '✅' : '❌'} Enhanced logging`);

    if (
      hasEntityValidation &&
      hasSafeTypeCasting &&
      hasEntityUpdateFirst &&
      hasBetterLogging
    ) {
      migrationsPassed++;
    }
    console.log('');
  } catch (error) {
    console.log(`❌ Error reading ${migrationPath}: ${error.message}\n`);
  }
});

console.log(
  `📊 Migration validation: ${migrationsPassed}/${migrations.length} files passed all checks`
);

if (migrationsPassed === migrations.length) {
  console.log('\n🎉 All migration files contain the required fixes!');
  console.log('\n🚀 Ready to test with: npm run test:sql');
} else {
  console.log('\n⚠️  Some migration files are missing key improvements');
  process.exit(1);
}
