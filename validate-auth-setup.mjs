#!/usr/bin/env node

/**
 * Pre-test validation script
 * Checks environment setup before running Playwright tests
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Playwright Authentication Setup...\n');

let hasErrors = false;

// Check 1: Required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

console.log('1. Checking environment variables...');
for (const envVar of requiredEnvVars) {
  const value = process.env[envVar] || process.env[`PUBLIC_${envVar}`];
  if (!value) {
    console.error(`   ❌ ${envVar} is not set`);
    hasErrors = true;
  } else {
    console.log(`   ✅ ${envVar} is set`);
  }
}

// Check 2: Required files exist
console.log('\n2. Checking required files...');
const requiredFiles = [
  'tests/e2e/auth.setup.ts',
  'tests/e2e/global.teardown.ts', 
  'tests/e2e/auth-fixtures.ts',
  'tests/e2e/utils/TestDataManager.ts',
  'playwright.config.ts'
];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file} exists`);
  } else {
    console.error(`   ❌ ${file} is missing`);
    hasErrors = true;
  }
}

// Check 3: .auth directory setup
console.log('\n3. Checking .auth directory...');
const authDir = path.join(process.cwd(), '.auth');
if (!fs.existsSync(authDir)) {
  console.log('   📁 Creating .auth directory...');
  try {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('   ✅ .auth directory created');
  } catch (err) {
    console.error(`   ❌ Failed to create .auth directory: ${err.message}`);
    hasErrors = true;
  }
} else {
  console.log('   ✅ .auth directory exists');
}

// Check 4: Playwright config validation
console.log('\n4. Checking Playwright configuration...');
try {
  const config = fs.readFileSync('playwright.config.ts', 'utf8');
  
  if (config.includes('globalSetup') && config.includes('auth.setup.ts')) {
    console.log('   ✅ Global setup configured');
  } else {
    console.error('   ❌ Global setup not properly configured');
    hasErrors = true;
  }
  
  if (config.includes('globalTeardown') && config.includes('global.teardown.ts')) {
    console.log('   ✅ Global teardown configured');
  } else {
    console.error('   ❌ Global teardown not properly configured');
    hasErrors = true;
  }
  
  if (config.includes('fullyParallel: true')) {
    console.log('   ✅ Parallel execution enabled');
  } else {
    console.error('   ❌ Parallel execution not enabled');
    hasErrors = true;
  }
  
} catch (err) {
  console.error(`   ❌ Failed to read playwright.config.ts: ${err.message}`);
  hasErrors = true;
}

// Check 5: Dependencies
console.log('\n5. Checking dependencies...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['@playwright/test', '@supabase/supabase-js'];
  
  for (const dep of requiredDeps) {
    if (packageJson.devDependencies?.[dep] || packageJson.dependencies?.[dep]) {
      console.log(`   ✅ ${dep} installed`);
    } else {
      console.error(`   ❌ ${dep} not installed`);
      hasErrors = true;
    }
  }
} catch (err) {
  console.error(`   ❌ Failed to check dependencies: ${err.message}`);
  hasErrors = true;
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('❌ Setup validation FAILED');
  console.error('\nPlease fix the errors above before running tests.');
  console.error('\nCommon fixes:');
  console.error('- Set environment variables in .env file');
  console.error('- Run: npm install');
  console.error('- Run: npm run test:setup (to start Supabase)');
  process.exit(1);
} else {
  console.log('✅ Setup validation PASSED');
  console.log('\nYour Playwright authentication setup is ready!');
  console.log('\nNext steps:');
  console.log('- Run: npm run test:e2e');
  console.log('- Or: node test-auth-setup.mjs (to test TestDataManager)');
}