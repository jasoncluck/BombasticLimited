import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as dotenv from 'dotenv';

dotenv.config();

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

const RESTORE_FUNCTION_NAME =
  process.env.RESTORE_LAMBDA_FUNCTION_NAME || 'BombasticDatabaseRestore-prod';

interface RestoreOptions {
  backupKey?: string;
  timestamp?: string;
  tables?: string[];
  dryRun?: boolean;
  validateOnly?: boolean;
}

async function triggerRestore(options: RestoreOptions = {}) {

  if (options.dryRun) {
  }

  if (options.validateOnly) {
  }

  try {
    const command = new InvokeCommand({
      FunctionName: RESTORE_FUNCTION_NAME,
      Payload: JSON.stringify(options),
    });

    const response = await lambdaClient.send(command);

    if (response.Payload) {
      const result = JSON.parse(Buffer.from(response.Payload).toString());


      if (result.success) {

        if (result.validationResults) {
          Object.entries(result.validationResults).forEach(
            ([table, isValid]) => {
            }
          );
        }

        if (result.recordsRestored) {
          Object.entries(result.recordsRestored).forEach(([table, count]) => {
          });
        }
      } else {
        console.error(`❌ Restore failed: ${result.error}`);
      }
    } else {
    }

    if (response.LogResult) {
      const logs = Buffer.from(response.LogResult, 'base64').toString();
    }
  } catch (error) {
    console.error('❌ Error triggering restore:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const backupKey = process.argv.includes('--backup-key')
  ? process.argv[process.argv.indexOf('--backup-key') + 1]
  : undefined;

const timestamp = process.argv.includes('--timestamp')
  ? process.argv[process.argv.indexOf('--timestamp') + 1]
  : undefined;

const tables = process.argv.includes('--tables')
  ? process.argv[process.argv.indexOf('--tables') + 1]?.split(',')
  : undefined;

const dryRun = process.argv.includes('--dry-run');
const validateOnly = process.argv.includes('--validate-only');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.exit(0);
}

// Trigger the restore
triggerRestore({ backupKey, timestamp, tables, dryRun, validateOnly })
  .then(() => {
  })
  .catch((error) => {
    console.error('💥 Restore operation failed:', error);
    process.exit(1);
  });
