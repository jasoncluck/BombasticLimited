import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as dotenv from 'dotenv';

dotenv.config();

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

const BACKUP_FUNCTION_NAME =
  process.env.BACKUP_LAMBDA_FUNCTION_NAME || 'BombasticDatabaseBackup-prod';

interface BackupOptions {
  dryRun?: boolean;
  tables?: string[];
  backupType?: 'full' | 'incremental';
}

async function triggerBackup(options: BackupOptions = {}) {
  console.log('🚀 Triggering database backup...');
  console.log(`📋 Function: ${BACKUP_FUNCTION_NAME}`);
  console.log(`🌍 Region: ${process.env.AWS_REGION || 'us-west-2'}`);

  if (options.dryRun) {
    console.log('🧪 Dry run mode enabled');
  }

  try {
    const command = new InvokeCommand({
      FunctionName: BACKUP_FUNCTION_NAME,
      Payload: JSON.stringify(options),
    });

    console.log('⏳ Invoking Lambda function...');
    const response = await lambdaClient.send(command);

    if (response.Payload) {
      const result = JSON.parse(Buffer.from(response.Payload).toString());

      console.log('✅ Backup operation completed!');
      console.log('📊 Result:', JSON.stringify(result, null, 2));

      if (result.success) {
        console.log(`📦 Backup created: ${result.backupKey}`);
        console.log(`📅 Timestamp: ${result.timestamp}`);
        console.log(`📋 Tables backed up: ${result.tables.join(', ')}`);
        if (result.backupSize) {
          console.log(
            `💾 Backup size: ${(result.backupSize / 1024 / 1024).toFixed(2)} MB`
          );
        }
      } else {
        console.error(`❌ Backup failed: ${result.error}`);
      }
    } else {
      console.log('⚠️  No response payload received');
    }

    if (response.LogResult) {
      const logs = Buffer.from(response.LogResult, 'base64').toString();
      console.log('📝 Lambda logs:');
      console.log(logs);
    }
  } catch (error) {
    console.error('❌ Error triggering backup:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--') && arg !== '--');

const dryRun = process.argv.includes('--dry-run');
const tables = process.argv.includes('--tables')
  ? process.argv[process.argv.indexOf('--tables') + 1]?.split(',')
  : undefined;
const backupType = process.argv.includes('--incremental')
  ? 'incremental'
  : 'full';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🗄️  Database Backup Trigger

Usage: npm run backup [options]

Options:
  --dry-run        Perform a dry run without uploading to S3
  --tables <list>  Comma-separated list of tables to backup
  --incremental    Perform incremental backup (default: full)
  --help, -h       Show this help message

Examples:
  npm run backup
  npm run backup -- --dry-run
  npm run backup -- --tables playlists,profiles
  npm run backup -- --incremental

Environment Variables:
  AWS_REGION                    AWS region (default: us-west-2)
  BACKUP_LAMBDA_FUNCTION_NAME   Lambda function name (default: BombasticDatabaseBackup-prod)

💡 CloudWatch Logs:
  View logs at: https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || 'us-west-2'}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${BACKUP_FUNCTION_NAME}
  `);
  process.exit(0);
}

// Trigger the backup
triggerBackup({ dryRun, tables, backupType })
  .then(() => {
    console.log('🎉 Backup trigger completed successfully!');
  })
  .catch((error) => {
    console.error('💥 Backup trigger failed:', error);
    process.exit(1);
  });
