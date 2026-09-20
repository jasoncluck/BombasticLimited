import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/stack/app-stack';
import { WebStack } from '../lib/stack/web-stack';
import { AuthStack } from '../lib/stack/auth-stack';
import { CronStack } from '../lib/stack/cron-stack';
import 'dotenv/config';

const app = new cdk.App();

// Video/playlist YouTube-sync pipeline (populate-videos, populate-playlists,
// their EventBridge schedules, and the full-repopulate Step Function).
// Production only — this project has no separate staging environment (see
// the WebStack comment below).
const appStackGoogleApiKey = process.env.GOOGLE_API_KEY_PROD;
const appStackNeonDatabaseUrl = process.env.NEON_DATABASE_URL_PROD;
if (!appStackGoogleApiKey || !appStackNeonDatabaseUrl) {
  console.error(
    '❌ Missing GOOGLE_API_KEY_PROD / NEON_DATABASE_URL_PROD for AppStack'
  );
  process.exit(1);
}

new AppStack(app, 'BombasticStack-Production', {
  stackName: 'BombasticStack-Production',
  stage: 'Production',
  environmentVariables: {
    GOOGLE_API_KEY: appStackGoogleApiKey,
    NEON_DATABASE_URL: appStackNeonDatabaseUrl,
  },
  cognitoUserPoolId: 'us-east-1_HlOiTnRXC',
  cognitoRegion: 'us-east-1',
  env: { region: 'us-east-1' },
});

const webStackNeonDatabaseUrl = process.env.NEON_DATABASE_URL_PROD;
const cognitoAnonUserEmail = process.env.COGNITO_ANON_USER_EMAIL_PROD;
const cognitoAnonUserPassword = process.env.COGNITO_ANON_USER_PASSWORD_PROD;
const originVerifySecret = process.env.ORIGIN_VERIFY_SECRET_PROD;
const discordBotToken = process.env.DISCORD_BOT_TOKEN_PROD;
const adminEmail = process.env.ADMIN_EMAIL_PROD;
const webStackPodcastFeedEncryptionKey =
  process.env.PODCAST_FEED_ENCRYPTION_KEY_PROD;
if (
  !webStackNeonDatabaseUrl ||
  !cognitoAnonUserEmail ||
  !cognitoAnonUserPassword ||
  !originVerifySecret ||
  !discordBotToken ||
  !adminEmail ||
  !webStackPodcastFeedEncryptionKey
) {
  console.error(
    '❌ Missing NEON_DATABASE_URL_PROD / COGNITO_ANON_USER_EMAIL_PROD / COGNITO_ANON_USER_PASSWORD_PROD / ORIGIN_VERIFY_SECRET_PROD / DISCORD_BOT_TOKEN_PROD / ADMIN_EMAIL_PROD / PODCAST_FEED_ENCRYPTION_KEY_PROD for WebStack'
  );
  process.exit(1);
}

// Web hosting (S3 + CloudFront + Lambda SSR) - single environment, no
// separate staging site since this is a showcase project with no real users.
new WebStack(app, 'BombasticWebStack', {
  stackName: 'BombasticWebStack',
  stage: 'Production',
  origin: 'https://bombastic.ltd',
  neonDatabaseUrl: webStackNeonDatabaseUrl,
  cognitoAnonUserEmail,
  cognitoAnonUserPassword,
  originVerifySecret,
  discordBotToken,
  adminEmail,
  podcastFeedEncryptionKey: webStackPodcastFeedEncryptionKey,
  env: { region: 'us-east-1' },
});

// Cognito replaces Supabase Auth (see ~/.claude/plans/vectorized-riding-lake.md).
// Discord is federated as a generic OIDC provider; only Discord is wired up
// for now since it's the one federated identity bombify actually uses.
const discordClientId = process.env.DISCORD_CLIENT_ID_PROD;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET_PROD;
if (!discordClientId || !discordClientSecret) {
  console.error(
    '❌ Missing DISCORD_CLIENT_ID_PROD / DISCORD_CLIENT_SECRET_PROD for AuthStack'
  );
  process.exit(1);
}

new AuthStack(app, 'BombasticAuthStack', {
  stackName: 'BombasticAuthStack',
  stage: 'Production',
  discordClientId,
  discordClientSecret,
  callbackUrls: [
    'https://bombastic.ltd/auth/callback',
    'http://localhost:5173/auth/callback',
  ],
  logoutUrls: [
    'https://bombastic.ltd/auth/login',
    'http://localhost:5173/auth/login',
  ],
  env: { region: 'us-east-1' },
});

// Replaces Supabase's pg_cron + pg_net + vault jobs (see
// ~/.claude/plans/vectorized-riding-lake.md).
const neonDatabaseUrl = process.env.NEON_DATABASE_URL_PROD;
const twitchClientId = process.env.TWITCH_CLIENT_ID_PROD;
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET_PROD;
const podcastFeedEncryptionKey = process.env.PODCAST_FEED_ENCRYPTION_KEY_PROD;
if (
  !neonDatabaseUrl ||
  !twitchClientId ||
  !twitchClientSecret ||
  !podcastFeedEncryptionKey
) {
  console.error(
    '❌ Missing NEON_DATABASE_URL_PROD / TWITCH_CLIENT_ID_PROD / TWITCH_CLIENT_SECRET_PROD / PODCAST_FEED_ENCRYPTION_KEY_PROD for CronStack'
  );
  process.exit(1);
}

new CronStack(app, 'BombasticCronStack', {
  stackName: 'BombasticCronStack',
  stage: 'Production',
  neonDatabaseUrl,
  twitchClientId,
  twitchClientSecret,
  // Not required to deploy; the process-images Lambda will fail at runtime
  // without it. See the TODO in cdk/.env.
  triggerSecretKey: process.env.TRIGGER_SECRET_KEY_PROD ?? '',
  contentImagesBucket: 'bombify-content-images-production',
  podcastFeedEncryptionKey,
  env: { region: 'us-east-1' },
});
