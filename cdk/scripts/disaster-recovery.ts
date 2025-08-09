import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
});

const BACKUP_FUNCTION_NAME =
  process.env.BACKUP_LAMBDA_FUNCTION_NAME || 'BombasticDatabaseBackup-prod';
const RESTORE_FUNCTION_NAME =
  process.env.RESTORE_LAMBDA_FUNCTION_NAME || 'BombasticDatabaseRestore-prod';
const BACKUP_BUCKET_NAME =
  process.env.BACKUP_BUCKET_NAME || 'bombastic-database-backups-prod';

interface DisasterRecoveryOptions {
  scenario:
    | 'point-in-time'
    | 'latest'
    | 'validate-and-restore'
    | 'full-recovery';
  timestamp?: string;
  tables?: string[];
  validateFirst?: boolean;
  createBackupFirst?: boolean;
  dryRun?: boolean;
}

interface DisasterRecoveryResult {
  success: boolean;
  operations: {
    preBackup?: any;
    validation?: any;
    restore?: any;
  };
  summary: string;
  error?: string;
}

class DisasterRecoveryManager {
  async executeRecovery(
    options: DisasterRecoveryOptions
  ): Promise<DisasterRecoveryResult> {
    console.log('🚨 Starting Disaster Recovery Process');
    console.log('='.repeat(60));
    console.log(`Scenario: ${options.scenario}`);
    console.log(`Dry Run: ${options.dryRun || false}`);

    const operations: any = {};

    try {
      // Step 1: Create a pre-recovery backup if requested
      if (options.createBackupFirst) {
        console.log('\n📦 Step 1: Creating pre-recovery backup...');
        operations.preBackup = await this.triggerBackup({
          backupType: 'full',
          dryRun: options.dryRun,
        });

        if (!operations.preBackup.success) {
          throw new Error(
            `Pre-recovery backup failed: ${operations.preBackup.error}`
          );
        }

        console.log(
          `✅ Pre-recovery backup completed: ${operations.preBackup.backupKey}`
        );
      }

      // Step 2: Find and validate the target backup
      console.log('\n🔍 Step 2: Locating target backup...');
      const targetBackup = await this.findTargetBackup(options);
      console.log(`Found backup: ${targetBackup.key}`);
      console.log(`Backup date: ${targetBackup.timestamp}`);

      // Step 3: Validate backup integrity
      if (options.validateFirst !== false) {
        console.log('\n✅ Step 3: Validating backup integrity...');
        operations.validation = await this.validateBackup(
          targetBackup.key,
          options.tables
        );

        if (!operations.validation.success) {
          throw new Error(
            `Backup validation failed: ${operations.validation.error}`
          );
        }

        const invalidTables = Object.entries(
          operations.validation.validationResults || {}
        )
          .filter(([_, isValid]) => !isValid)
          .map(([table, _]) => table);

        if (invalidTables.length > 0) {
          throw new Error(
            `Invalid tables found in backup: ${invalidTables.join(', ')}`
          );
        }

        console.log('✅ Backup validation passed');
      }

      // Step 4: Execute restore
      console.log('\n🔄 Step 4: Executing restore operation...');
      operations.restore = await this.triggerRestore({
        backupKey: targetBackup.key,
        tables: options.tables,
        dryRun: options.dryRun,
      });

      if (!operations.restore.success) {
        throw new Error(
          `Restore operation failed: ${operations.restore.error}`
        );
      }

      console.log('✅ Restore operation completed successfully');

      // Generate summary
      const summary = this.generateSummary(options, operations, targetBackup);

      console.log('\n' + '='.repeat(60));
      console.log('🎉 DISASTER RECOVERY COMPLETED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(summary);

      return {
        success: true,
        operations,
        summary,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('\n💥 DISASTER RECOVERY FAILED');
      console.error('Error:', errorMessage);

      return {
        success: false,
        operations,
        summary: `Disaster recovery failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  private async findTargetBackup(options: DisasterRecoveryOptions) {
    const environment = process.env.ENVIRONMENT || 'prod';

    if (options.timestamp) {
      // Find backup by timestamp
      const date = new Date(options.timestamp).toISOString().split('T')[0];
      const prefix = `backups/${environment}/${date}/`;

      const listCommand = new ListObjectsV2Command({
        Bucket: BACKUP_BUCKET_NAME,
        Prefix: prefix,
      });

      const result = await s3Client.send(listCommand);
      const backups =
        result.Contents?.filter((obj) =>
          obj.Key?.includes(options.timestamp!.replace(/[:.]/g, '-'))
        ) || [];

      if (backups.length === 0) {
        throw new Error(`No backup found for timestamp: ${options.timestamp}`);
      }

      const backup = backups[0];
      return {
        key: backup.Key!,
        timestamp: backup.LastModified!.toISOString(),
      };
    } else {
      // Find latest backup
      const listCommand = new ListObjectsV2Command({
        Bucket: BACKUP_BUCKET_NAME,
        Prefix: `backups/${environment}/`,
      });

      const result = await s3Client.send(listCommand);
      const backups =
        result.Contents?.sort(
          (a, b) =>
            (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
        ) || [];

      if (backups.length === 0) {
        throw new Error('No backups found');
      }

      const backup = backups[0];
      return {
        key: backup.Key!,
        timestamp: backup.LastModified!.toISOString(),
      };
    }
  }

  private async triggerBackup(options: any) {
    const command = new InvokeCommand({
      FunctionName: BACKUP_FUNCTION_NAME,
      Payload: JSON.stringify(options),
    });

    const response = await lambdaClient.send(command);
    return JSON.parse(Buffer.from(response.Payload!).toString());
  }

  private async validateBackup(backupKey: string, tables?: string[]) {
    const command = new InvokeCommand({
      FunctionName: RESTORE_FUNCTION_NAME,
      Payload: JSON.stringify({
        backupKey,
        tables,
        validateOnly: true,
      }),
    });

    const response = await lambdaClient.send(command);
    return JSON.parse(Buffer.from(response.Payload!).toString());
  }

  private async triggerRestore(options: any) {
    const command = new InvokeCommand({
      FunctionName: RESTORE_FUNCTION_NAME,
      Payload: JSON.stringify(options),
    });

    const response = await lambdaClient.send(command);
    return JSON.parse(Buffer.from(response.Payload!).toString());
  }

  private generateSummary(
    options: DisasterRecoveryOptions,
    operations: any,
    targetBackup: any
  ): string {
    const lines = [
      `Disaster Recovery Summary:`,
      ``,
      `Scenario: ${options.scenario}`,
      `Target Backup: ${targetBackup.key}`,
      `Backup Date: ${targetBackup.timestamp}`,
      ``,
    ];

    if (operations.preBackup) {
      lines.push(`Pre-Recovery Backup: ${operations.preBackup.backupKey}`);
    }

    if (operations.validation) {
      const validTables = Object.keys(
        operations.validation.validationResults || {}
      ).length;
      lines.push(`Validation: ${validTables} tables validated successfully`);
    }

    if (operations.restore) {
      const totalRecords = Object.values(
        operations.restore.recordsRestored || {}
      ).reduce((sum: number, count: any) => sum + (count as number), 0);
      const tableCount = Object.keys(
        operations.restore.recordsRestored || {}
      ).length;

      lines.push(
        `Restore: ${totalRecords} records restored across ${tableCount} tables`
      );

      if (operations.restore.recordsRestored) {
        lines.push(``, `Records Restored by Table:`);
        Object.entries(operations.restore.recordsRestored).forEach(
          ([table, count]) => {
            lines.push(`  ${table}: ${count} records`);
          }
        );
      }
    }

    lines.push(``, `Recovery completed at: ${new Date().toISOString()}`);

    return lines.join('\n');
  }
}

// CLI interface
async function main() {
  const scenario = process.argv.includes('--scenario')
    ? (process.argv[process.argv.indexOf('--scenario') + 1] as any)
    : 'latest';

  const timestamp = process.argv.includes('--timestamp')
    ? process.argv[process.argv.indexOf('--timestamp') + 1]
    : undefined;

  const tables = process.argv.includes('--tables')
    ? process.argv[process.argv.indexOf('--tables') + 1]?.split(',')
    : undefined;

  const validateFirst = !process.argv.includes('--no-validate');
  const createBackupFirst = process.argv.includes('--backup-first');
  const dryRun = process.argv.includes('--dry-run');

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🚨 Disaster Recovery Automation Tool

Usage: npm run disaster-recovery [options]

Options:
  --scenario <type>      Recovery scenario (default: latest)
                        - latest: Restore from latest backup
                        - point-in-time: Restore from specific timestamp
                        - validate-and-restore: Validate then restore
                        - full-recovery: Full DR process with pre-backup
  
  --timestamp <time>     Specific timestamp for point-in-time recovery
  --tables <list>        Comma-separated list of tables to restore
  --backup-first         Create backup before starting recovery
  --no-validate          Skip backup validation step
  --dry-run              Test recovery process without making changes
  --help, -h             Show this help message

Examples:
  npm run disaster-recovery                                    # Restore latest backup
  npm run disaster-recovery -- --dry-run                      # Test latest restore
  npm run disaster-recovery -- --scenario point-in-time --timestamp 2024-01-15T02:00:00.000Z
  npm run disaster-recovery -- --scenario full-recovery --backup-first
  npm run disaster-recovery -- --tables auth.users,playlists --validate-first

Environment Variables:
  AWS_REGION                      AWS region (default: us-west-2)
  BACKUP_LAMBDA_FUNCTION_NAME     Backup function name
  RESTORE_LAMBDA_FUNCTION_NAME    Restore function name
  BACKUP_BUCKET_NAME             S3 backup bucket name

⚠️  WARNING: This tool modifies your database. Always test with --dry-run first!
    `);
    process.exit(0);
  }

  const manager = new DisasterRecoveryManager();

  const result = await manager.executeRecovery({
    scenario,
    timestamp,
    tables,
    validateFirst,
    createBackupFirst,
    dryRun,
  });

  if (!result.success) {
    console.error('\n💥 Disaster recovery failed!');
    process.exit(1);
  }

  console.log('\n🎉 Disaster recovery completed successfully!');
}

// Export for use as a module
export { DisasterRecoveryManager };

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
}
