# Database Backup Infrastructure

This directory contains AWS CDK infrastructure for automated database backups to
S3.

## Overview

The backup infrastructure includes:

- **S3 Bucket**: Secure storage for database backups with lifecycle policies
- **IAM Role**: Least-privilege permissions for backup operations
- **Lambda Function**: Automated backup execution
- **CloudWatch Monitoring**: Alarms, logs, and dashboards for backup monitoring
- **Scheduled Backups**: Daily automated backups via EventBridge

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   EventBridge   │───▶│  Lambda Function │───▶│   S3 Bucket     │
│  (Daily at 2AM) │    │  (Database       │    │  (Encrypted     │
│                 │    │   Backup)        │    │   Versioned)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                       ┌──────────────────┐
                       │   CloudWatch     │
                       │  (Logs & Alarms) │
                       └──────────────────┘
```

## Security Features

- **Encryption**: S3 server-side encryption (SSE-S3)
- **Access Control**: Block all public access on S3 bucket
- **IAM Policies**: Least privilege access for backup operations
- **Versioning**: S3 object versioning for backup file history
- **Monitoring**: CloudWatch alarms for backup failures

## Lifecycle Management

Backups are automatically transitioned through storage classes:

- **0-30 days**: Standard storage
- **30-90 days**: Infrequent Access
- **90-365 days**: Glacier
- **365+ days**: Deep Archive

### Retention Policies

- **Staging**: 90 days retention
- **Production**: 7 years retention (2555 days)

## Backup Configuration

### Tables Included in Backup

The backup system is configured to backup the following critical tables:

- **`playlists`** - User-created playlists
- **`playlist_videos`** - Playlist-video relationships
- **`profiles`** - User profile information
- **`user_playlists`** - User-playlist relationships

### Auth Schema Backup

The backup system also includes a complete backup of the auth schema:

- **`auth.users`** - User authentication data (critical for user access)
- **`auth.sessions`** - Active user sessions
- **`auth.refresh_tokens`** - Token refresh data
- **`auth.identities`** - User identity information

### Tables Excluded from Backup

- **`videos`** - Video metadata (excluded as it can be regenerated from external
  data sources)

### Custom Table Selection

You can override the default table selection using the `--tables` parameter:

```bash
# Backup only specific tables
npm run backup -- --tables auth.users,playlists

# Restore only user data
npm run restore -- --tables profiles,user_playlists
```

## Usage

### Deploy Infrastructure

```bash
cd cdk
npm install
npm run build
npm run deploy
```

### Backup Operations

```bash
# Full backup
npm run backup

# Dry run (test without uploading)
npm run backup:dry-run

# Backup specific tables
npm run backup -- --tables playlists,profiles

# Incremental backup
npm run backup -- --incremental
```

### Restore Operations

```bash
# Restore latest backup (dry run first!)
npm run restore:dry-run
npm run restore

# Validate backup integrity
npm run restore:validate

# Restore from specific backup
npm run restore -- --backup-key backups/prod/2024-01-15/database-backup-xyz.json

# Restore specific tables only
npm run restore -- --tables profiles,user_playlists

# Point-in-time restore
npm run restore -- --timestamp 2024-01-15T02:00:00.000Z
```

### Disaster Recovery Automation

```bash
# Automated disaster recovery (latest backup)
npm run disaster-recovery -- --dry-run
npm run disaster-recovery

# Point-in-time recovery
npm run disaster-recovery -- --scenario point-in-time --timestamp 2024-01-15T02:00:00.000Z

# Full recovery with pre-backup
npm run disaster-recovery -- --scenario full-recovery --backup-first

# Recovery with validation
npm run disaster-recovery -- --scenario validate-and-restore
```

### Environment Variables

```bash
# Required for deployment
SUPABASE_SERVICE_API_KEY_PROD=your_supabase_service_key
PUBLIC_SUPABASE_URL_PROD=your_supabase_url

# Optional
ENVIRONMENT=prod                    # or staging
AWS_REGION=us-west-2               # AWS region
BACKUP_LAMBDA_FUNCTION_NAME=...    # Override function name
```

## Monitoring

### CloudWatch Dashboard

View backup metrics at:

```
https://console.aws.amazon.com/cloudwatch/home?region={region}#dashboards:name=BombasticBackups-{environment}
```

### Lambda Logs

View backup logs at:

```
https://console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/$252Faws$252Flambda$252FBombasticDatabaseBackup-{environment}
```

### CloudWatch Alarms

- **Backup Errors**: Triggers on any Lambda execution errors
- **Duration**: Monitors backup execution time

## Backup Format

Backups are stored as JSON files with the following structure:

```json
{
  "metadata": {
    "timestamp": "2024-01-15T02:00:00.000Z",
    "environment": "prod",
    "backupType": "full",
    "tables": ["playlists", "playlist_videos", "profiles"],
    "recordCounts": {
      "playlists": 45,
      "playlist_videos": 5680,
      "profiles": 1250
    }
  },
  "data": {
    "playlists": [...],
    "playlist_videos": [...],
    "profiles": [...],
    "auth.users": [...],
    "auth.sessions": [...]
  }
}
```

## Disaster Recovery

The infrastructure supports comprehensive disaster recovery with automated
tools:

### Automated Recovery Scenarios

1. **Latest Backup Recovery** - Restore from the most recent backup
2. **Point-in-Time Recovery** - Restore from a specific timestamp
3. **Validated Recovery** - Validate backup integrity before restoring
4. **Full Recovery** - Complete DR process with pre-recovery backup

### Recovery Features

- **Automated Backup Discovery** - Finds appropriate backups automatically
- **Integrity Validation** - Validates backup data before restoration
- **Selective Restore** - Restore specific tables or complete datasets
- **Pre-Recovery Backup** - Creates safety backup before recovery
- **Dry Run Testing** - Test recovery process without making changes
- **Progress Monitoring** - Detailed logging and progress reporting

### Manual Recovery Steps

For manual recovery scenarios:

1. **Identify Target Backup**

   ```bash
   aws s3 ls s3://your-backup-bucket/backups/prod/ --recursive
   ```

2. **Validate Backup**

   ```bash
   npm run restore:validate -- --backup-key <backup-key>
   ```

3. **Test Restore Process**

   ```bash
   npm run restore:dry-run -- --backup-key <backup-key>
   ```

4. **Execute Restore**

   ```bash
   npm run restore -- --backup-key <backup-key>
   ```

### API Integration

The disaster recovery system can be integrated into monitoring and alerting
systems:

```typescript
import { DisasterRecoveryManager } from './scripts/disaster-recovery';

const manager = new DisasterRecoveryManager();
const result = await manager.executeRecovery({
  scenario: 'latest',
  validateFirst: true,
  dryRun: false,
});
```

### Cross-Region Replication

For critical environments, consider enabling S3 cross-region replication:

```typescript
// Add to BackupStack
const replicationBucket = new s3.Bucket(this, 'BackupReplicationBucket', {
  bucketName: `${bucketName}-replica`,
  region: 'us-east-1', // Different region
});

this.backupBucket.addCrossRegionReplication({
  destinationBucket: replicationBucket,
  prefix: 'backups/',
});
```

## Troubleshooting

### Common Issues

1. **Permission Errors**: Verify IAM role has S3 permissions
2. **Network Timeouts**: Check Lambda timeout settings (15 min max)
3. **Large Backups**: Consider pagination for tables with many records
4. **Missing Environment Variables**: Ensure Supabase credentials are set

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG=true npm run backup
```

## Cost Optimization

- **Lifecycle Policies**: Automatically move old backups to cheaper storage
- **Compression**: JSON backups are automatically compressed by S3
- **Incremental Backups**: Use `--incremental` flag for changed data only
- **Retention Policies**: Shorter retention for non-production environments

## Contributing

1. Make changes to backup infrastructure in `lib/stack/backup-stack.ts`
2. Update Lambda function in `lib/lambda/database-backup.ts`
3. Add tests in `test/backup-stack.test.ts`
4. Update this documentation

## Security Considerations

- Never commit AWS credentials to source control
- Use environment-specific IAM roles
- Enable CloudTrail logging for S3 access auditing
- Regularly rotate Supabase service keys
- Monitor backup access patterns in CloudWatch
