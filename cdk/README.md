# Bombastic CDK

AWS CDK infrastructure for the Bombastic application. Manages the AWS resources
that sync YouTube content into the Supabase database on a schedule.

This is a standalone TypeScript project — install and run it separately from the
main application.

## Prerequisites

- Node.js 20+
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
  configured with appropriate permissions
- AWS CDK CLI: `npm install -g aws-cdk`

## Getting Started

```bash
cd cdk
npm install
npm run build
```

For a first-time deployment, bootstrap CDK in your AWS account:

```bash
npx cdk bootstrap
```

## Environment Variables

```bash
export GOOGLE_API_KEY=...
export PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_API_KEY=...
```

## Deploy

```bash
npm run deploy                # Deploy all stacks
npm run deploy:production     # BombifyStack-Production only
npm run deploy:staging        # BombifyStack-Staging only

npx cdk diff                  # Preview changes vs deployed state
npx cdk synth                 # Emit CloudFormation template without deploying
```

## Repopulate Database

Trigger a full re-sync from YouTube into Supabase:

```bash
npm run repopulate                    # All sources (staging)
npm run repopulate:production         # All sources (production)
npm run repopulate:staging            # All sources (staging, explicit)
npm run repopulate:videos             # Videos only
npm run repopulate:playlists          # Playlists only
npm run repopulate:source             # Single source (pass source as arg)
```

## Database Backup / Restore

```bash
npm run backup                        # Full backup to S3
npm run backup:dry-run                # Test run without uploading
npm run backup:staging                # Backup staging environment
npm run backup:validate               # Validate a backup file

npm run restore                       # Restore from S3
npm run restore:dry-run               # Validate restore without writing
npm run restore:staging               # Restore staging environment
npm run restore:validate              # Validate restore compatibility

npm run disaster-recovery             # Full disaster recovery flow
npm run disaster-recovery:staging     # Disaster recovery for staging
```

## Testing

```bash
npm run test                          # Jest unit tests
npm run watch                         # Watch mode TypeScript compilation
```

## Infrastructure Overview

### Stacks

**`AppStack`** (`lib/stack/app-stack.ts`) — Root stack, creates
environment-specific child stacks. Production has termination protection
enabled.

**`VideoStack`** (`lib/stack/video-stack.ts`) — Core content sync
infrastructure:

- `BombasticPopulateVideos` Lambda — Fetches new videos from YouTube API and
  upserts into Supabase. Runs every 30 minutes in production, every 2 hours in
  staging.
- `BombasticPopulatePlaylists` Lambda — Syncs playlist metadata. Runs daily in
  production, weekly in staging.
- `BombasticRepopulateStateMachine` Step Function — Orchestrates full
  repopulation across all four sources sequentially.
- `BombasticTriggerRepopulate` Lambda — Triggers the Step Function on demand.
- EventBridge rules schedule all Lambdas per source (giantbomb, jeffgerstmann,
  nextlander, remap).
- CloudWatch alarms for Lambda errors.

**`BackupStack`** (`lib/stack/backup-stack.ts`) — S3-based database backup
system. Currently disabled in `AppStack` but backup/restore scripts are fully
operational for manual use.

### Lambda Functions

| Function                     | File                               | Purpose                          |
| ---------------------------- | ---------------------------------- | -------------------------------- |
| `BombasticPopulateVideos`    | `lib/lambda/populate-videos.ts`    | YouTube → Supabase video sync    |
| `BombasticPopulatePlaylists` | `lib/lambda/populate-playlists.ts` | YouTube → Supabase playlist sync |
| `BombasticTriggerRepopulate` | `lib/lambda/trigger-repopulate.ts` | Step Function trigger            |
| `BombasticDatabaseBackup`    | `lib/lambda/database-backup.ts`    | Supabase → S3 backup             |
| `BombasticDatabaseRestore`   | `lib/lambda/database-restore.ts`   | S3 → Supabase restore            |

### Shared Types

`lib/channel.ts` imports `database.types.ts` from the main project root
(`../src/lib/supabase/database.types.ts`) to ensure CDK and the web app use the
same source enum types. After database schema changes, run
`npm run generate-types` in the root project before building the CDK project.
