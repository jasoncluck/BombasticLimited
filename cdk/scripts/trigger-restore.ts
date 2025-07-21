import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import * as dotenv from "dotenv";

dotenv.config();

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "us-west-2",
});

const RESTORE_FUNCTION_NAME =
  process.env.RESTORE_LAMBDA_FUNCTION_NAME || "BombifyDatabaseRestore-prod";

interface RestoreOptions {
  backupKey?: string;
  timestamp?: string;
  tables?: string[];
  dryRun?: boolean;
  validateOnly?: boolean;
}

async function triggerRestore(options: RestoreOptions = {}) {
  console.log("🔄 Triggering database restore...");
  console.log(`📋 Function: ${RESTORE_FUNCTION_NAME}`);
  console.log(`🌍 Region: ${process.env.AWS_REGION || "us-west-2"}`);

  if (options.dryRun) {
    console.log("🧪 Dry run mode enabled");
  }

  if (options.validateOnly) {
    console.log("✅ Validation mode enabled");
  }

  try {
    const command = new InvokeCommand({
      FunctionName: RESTORE_FUNCTION_NAME,
      Payload: JSON.stringify(options),
    });

    console.log("⏳ Invoking restore Lambda function...");
    const response = await lambdaClient.send(command);

    if (response.Payload) {
      const result = JSON.parse(Buffer.from(response.Payload).toString());
      
      console.log("✅ Restore operation completed!");
      console.log("📊 Result:", JSON.stringify(result, null, 2));

      if (result.success) {
        console.log(`📦 Backup restored from: ${result.backupKey}`);
        console.log(`📅 Backup timestamp: ${result.timestamp}`);
        console.log(`📋 Tables processed: ${result.tables.join(", ")}`);
        
        if (result.validationResults) {
          console.log("✅ Validation Results:");
          Object.entries(result.validationResults).forEach(([table, isValid]) => {
            console.log(`   ${table}: ${isValid ? "✅ VALID" : "❌ INVALID"}`);
          });
        }
        
        if (result.recordsRestored) {
          console.log("📊 Records Restored:");
          Object.entries(result.recordsRestored).forEach(([table, count]) => {
            console.log(`   ${table}: ${count} records`);
          });
        }
      } else {
        console.error(`❌ Restore failed: ${result.error}`);
      }
    } else {
      console.log("⚠️  No response payload received");
    }

    if (response.LogResult) {
      const logs = Buffer.from(response.LogResult, "base64").toString();
      console.log("📝 Lambda logs:");
      console.log(logs);
    }

  } catch (error) {
    console.error("❌ Error triggering restore:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const backupKey = process.argv.includes("--backup-key") 
  ? process.argv[process.argv.indexOf("--backup-key") + 1] 
  : undefined;

const timestamp = process.argv.includes("--timestamp") 
  ? process.argv[process.argv.indexOf("--timestamp") + 1] 
  : undefined;

const tables = process.argv.includes("--tables") 
  ? process.argv[process.argv.indexOf("--tables") + 1]?.split(",") 
  : undefined;

const dryRun = process.argv.includes("--dry-run");
const validateOnly = process.argv.includes("--validate-only");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
🔄 Database Restore Tool

Usage: npm run restore [options]

Options:
  --backup-key <key>   Specific S3 backup key to restore from
  --timestamp <time>   Restore from backup at specific timestamp (ISO format)
  --tables <list>      Comma-separated list of tables to restore
  --dry-run            Analyze restore without making changes
  --validate-only      Validate backup integrity without restoring
  --help, -h           Show this help message

Examples:
  npm run restore                                    # Restore latest backup
  npm run restore -- --dry-run                      # Analyze latest backup
  npm run restore -- --validate-only                # Validate latest backup
  npm run restore -- --timestamp 2024-01-15T02:00:00.000Z
  npm run restore -- --tables auth.users,playlists
  npm run restore -- --backup-key backups/prod/2024-01-15/database-backup-2024-01-15T02-00-00-000Z.json

Environment Variables:
  AWS_REGION                      AWS region (default: us-west-2)
  RESTORE_LAMBDA_FUNCTION_NAME    Lambda function name (default: BombifyDatabaseRestore-prod)

⚠️  WARNING: Restore operations modify your database. Always test with --dry-run first!

💡 CloudWatch Logs:
  View logs at: https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || "us-west-2"}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${RESTORE_FUNCTION_NAME}
  `);
  process.exit(0);
}

// Trigger the restore
triggerRestore({ backupKey, timestamp, tables, dryRun, validateOnly })
  .then(() => {
    console.log("🎉 Restore operation completed successfully!");
  })
  .catch((error) => {
    console.error("💥 Restore operation failed:", error);
    process.exit(1);
  });