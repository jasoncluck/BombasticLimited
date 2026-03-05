# Database Backup Infrastructure - Deployment Guide

## Prerequisites

Before deploying the backup infrastructure, ensure you have:

1. **AWS CLI configured** with appropriate permissions
2. **AWS CDK installed** globally: `npm install -g aws-cdk`
3. **Environment variables** set:

   ```bash
   export SUPABASE_SERVICE_API_KEY_PROD=your_supabase_service_key
   export PUBLIC_SUPABASE_URL_PROD=your_supabase_url
   export ENVIRONMENT=prod  # or staging
   ```

## Deployment Steps

### 1. Install Dependencies

```bash
cd cdk
npm install
```

### 2. Build Infrastructure

```bash
npm run build
```

_Note: There may be warnings about existing YouTube API dependencies, but the
backup infrastructure is independent._

### 3. Bootstrap CDK (if first deployment)

```bash
npx cdk bootstrap
```

### 4. Deploy Backup Stack

```bash
npx cdk deploy BombasticStack/BackupStack
```

### 5. Verify Deployment

Check the CloudFormation console to ensure all resources were created:

- S3 bucket: `bombastic-database-backups-{environment}`
- Lambda function: `BombasticDatabaseBackup-{environment}`
- IAM role: `bombastic-database-backup-role-{environment}`
- CloudWatch dashboard: `BombasticBackups-{environment}`

## Testing the Backup

### Dry Run Test

```bash
npm run backup:dry-run
```

This will test the backup process without uploading to S3.

### Full Backup Test

```bash
npm run backup
```

This will perform a complete backup and upload to S3.

### Verify S3 Backup

Check your S3 bucket for the backup file:

```
s3://bombastic-database-backups-{environment}/backups/{environment}/{date}/database-backup-{timestamp}.json
```

## Monitoring

### CloudWatch Dashboard

Navigate to CloudWatch > Dashboards > `BombasticBackups-{environment}` to view:

- Lambda invocation metrics
- Error rates
- Duration metrics

### CloudWatch Logs

View backup logs at:

```
/aws/lambda/BombasticDatabaseBackup-{environment}
```

### CloudWatch Alarms

The error alarm will trigger if any backup fails.

## Scheduled Backups

Backups are automatically scheduled to run daily at 2 AM UTC via EventBridge.

To modify the schedule, update the `schedule` property in `backup-stack.ts`:

```typescript
const backupRule = new events.Rule(this, 'DailyBackupRule', {
  schedule: events.Schedule.expression('cron(0 2 * * ? *)'), // 2 AM UTC daily
});
```

## Backup Restoration

To restore from a backup:

1. Download the backup file from S3
2. Parse the JSON structure
3. Use the Supabase client to insert data back into tables

Example restoration script:

```typescript
import { createClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// Download backup from S3
const s3 = new S3Client({});
const response = await s3.send(
  new GetObjectCommand({
    Bucket: 'bombastic-database-backups-prod',
    Key: 'backups/prod/2024-01-15/database-backup-2024-01-15T02-00-00-000Z.json',
  })
);

// Parse backup data
const backupData = JSON.parse(await response.Body.transformToString());

// Restore to Supabase
const supabase = createClient(url, key);
for (const [table, records] of Object.entries(backupData.data)) {
  await supabase.from(table).insert(records);
}
```

## Cost Management

The backup infrastructure includes cost optimization features:

- Lifecycle policies automatically move old backups to cheaper storage
- Environment-specific retention policies
- Compression via JSON format

Expected monthly costs:

- **Staging**: ~$2-5 (90-day retention)
- **Production**: ~$10-20 (7-year retention)

## Security

The backup infrastructure implements security best practices:

- S3 bucket blocks all public access
- Server-side encryption enabled
- IAM policies follow least privilege principle
- All access is logged via CloudWatch

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Verify IAM role has S3 permissions
   - Check AWS CLI configuration

2. **Environment Variable Errors**
   - Ensure Supabase credentials are set
   - Verify environment variable names

3. **Lambda Timeout**
   - Default timeout is 15 minutes
   - For large databases, consider pagination

4. **S3 Access Denied**
   - Verify bucket permissions
   - Check IAM role attached to Lambda

### Debug Commands

```bash
# Check environment variables
echo $SUPABASE_SERVICE_API_KEY_PROD
echo $PUBLIC_SUPABASE_URL_PROD

# Test Lambda function directly
aws lambda invoke \
  --function-name BombasticDatabaseBackup-prod \
  --payload '{"dryRun": true}' \
  response.json

# Check S3 bucket contents
aws s3 ls s3://bombastic-database-backups-prod/backups/ --recursive
```

## Maintenance

### Regular Tasks

- Monitor CloudWatch alarms for backup failures
- Review S3 storage costs monthly
- Test restoration process quarterly
- Update retention policies as needed

### Updates

To update the backup infrastructure:

1. Modify code in `lib/stack/backup-stack.ts`
2. Run `npm run build`
3. Deploy with `npx cdk deploy BombasticStack/BackupStack`

## Support

For issues with the backup infrastructure:

1. Check CloudWatch logs for error details
2. Verify all environment variables are set
3. Test with dry-run mode first
4. Review AWS resource configurations in CloudFormation console
