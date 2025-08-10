import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/stack/app-stack';
import 'dotenv/config';

const app = new cdk.App();

// Create Production Stack
new AppStack(app, 'BombasticStack-Production', {
  stackName: 'BombasticStack-Production',
  stage: 'Production',
  environmentVariables: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY_PROD,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL_PROD,
    SUPABASE_SERVICE_API_KEY: process.env.SUPABASE_SERVICE_API_KEY_PROD,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL_PROD,
  },
});

// Create Staging Stack
new AppStack(app, 'BombasticStack-Staging', {
  stackName: 'BombasticStack-Staging',
  stage: 'Staging',
  environmentVariables: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY_STAGING,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL_STAGING,
    SUPABASE_SERVICE_API_KEY: process.env.SUPABASE_SERVICE_API_KEY_STAGING,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL_STAGING,
  },
});
