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

  if (options.dryRun) {
  }

  try {
    const command = new InvokeCommand({
      FunctionName: BACKUP_FUNCTION_NAME,
      Payload: JSON.stringify(options),
    });

    const response = await lambdaClient.send(command);

    if (response.Payload) {
      const result = JSON.parse(Buffer.from(response.Payload).toString());


      if (result.success) {
        if (result.backupSize) {
        }
      } else {
        console.error(`❌ Backup failed: ${result.error}`);
      }
    } else {
    }

    if (response.LogResult) {
      const logs = Buffer.from(response.LogResult, 'base64').toString();
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
  process.exit(0);
}

// Trigger the backup
triggerBackup({ dryRun, tables, backupType })
  .then(() => {
  })
  .catch((error) => {
    console.error('💥 Backup trigger failed:', error);
    process.exit(1);
  });
