import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/stack/app-stack';
import 'dotenv/config';

const app = new cdk.App();

// Create Production Stack
new AppStack(app, 'BombifyStack-Production', {
  stackName: 'BombifyStack-Production',
  environment: 'production',
  environmentVariables: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY_PROD,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL_PROD,
    SUPABASE_SERVICE_API_KEY: process.env.SUPABASE_SERVICE_API_KEY_PROD,
  },
});

// Create Staging Stack
new AppStack(app, 'BombifyStack-Staging', {
  stackName: 'BombifyStack-Staging',
  environment: 'staging',
  environmentVariables: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY_STAGING,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL_STAGING,
    SUPABASE_SERVICE_API_KEY: process.env.SUPABASE_SERVICE_API_KEY_STAGING,
  },
});
