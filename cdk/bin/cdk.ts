import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/stack/app-stack';
import 'dotenv/config';

// Environment variable validation function
function validateEnvironmentVariables(stage: 'Production' | 'Staging') {
  const suffix = stage === 'Production' ? 'PROD' : 'STAGING';
  const requiredEnvVars = [
    `GOOGLE_API_KEY_${suffix}`,
    `PUBLIC_SUPABASE_URL_${suffix}`,
    `SUPABASE_SERVICE_API_KEY_${suffix}`,
  ];

  const missing: string[] = [];
  const envValues: Record<string, string> = {};

  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      missing.push(envVar);
    } else {
      // Store the validated value
      const key = envVar.replace(`_${suffix}`, '');
      envValues[key] = value.trim();
    }
  }

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables for ${stage}:`);
    missing.forEach((envVar) => console.error(`   - ${envVar}`));
    console.error('\nPlease set these environment variables before deploying.');
    process.exit(1);
  }

  console.log(`✅ All required environment variables validated for ${stage}`);
  return envValues;
}

const app = new cdk.App();

// Validate and create Production Stack
const prodEnvVars = validateEnvironmentVariables('Production');

new AppStack(app, 'BombasticStack-Production', {
  stackName: 'BombasticStack-Production',
  stage: 'Production',
  environmentVariables: {
    GOOGLE_API_KEY: prodEnvVars.GOOGLE_API_KEY,
    PUBLIC_SUPABASE_URL: prodEnvVars.PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_API_KEY: prodEnvVars.SUPABASE_SERVICE_API_KEY,
  },
});

// Validate and create Staging Stack
console.log('🔍 Validating Staging environment variables...');
const stagingEnvVars = validateEnvironmentVariables('Staging');

new AppStack(app, 'BombasticStack-Staging', {
  stackName: 'BombasticStack-Staging',
  stage: 'Staging',
  environmentVariables: {
    GOOGLE_API_KEY: stagingEnvVars.GOOGLE_API_KEY,
    PUBLIC_SUPABASE_URL: stagingEnvVars.PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_API_KEY: stagingEnvVars.SUPABASE_SERVICE_API_KEY,
  },
});
