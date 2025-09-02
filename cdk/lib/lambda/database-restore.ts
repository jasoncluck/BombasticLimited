import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../../src/lib/supabase/database.types';
import { Client } from 'pg';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
});

export interface RestoreEvent {
  backupKey?: string;
  timestamp?: string;
  tables?: string[];
  dryRun?: boolean;
  validateOnly?: boolean;
}

export interface RestoreResult {
  success: boolean;
  backupKey: string;
  timestamp: string;
  tables: string[];
  recordsRestored: Record<string, number>;
  error?: string;
  validationResults?: Record<string, boolean>;
}

export const handler = async (
  event: RestoreEvent = {}
): Promise<RestoreResult> => {
  const bucketName = process.env.BACKUP_BUCKET_NAME;
  const environment = process.env.ENVIRONMENT || 'prod';
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL_PROD;
  const supabaseKey = process.env.SUPABASE_SERVICE_API_KEY_PROD;
  let supabaseDbUrl = process.env.SUPABASE_DB_URL_PROD;

  if (!bucketName) {
    throw new Error('BACKUP_BUCKET_NAME environment variable is not set');
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration is not available');
  }

  if (!supabaseDbUrl) {
    throw new Error('SUPABASE_DB_URL_PROD environment variable is not set');
  }

  // Fix connection string
  const urlMatch = supabaseDbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@(.+)$/);
  if (urlMatch) {
    const [, username, password, hostAndDb] = urlMatch;
    const encodedPassword = encodeURIComponent(password);
    supabaseDbUrl = `postgresql://${username}:${encodedPassword}@${hostAndDb}`;
  }
  supabaseDbUrl = supabaseDbUrl.trim().replace(/[\r\n]/g, '');


  try {
    // Initialize both Supabase client and PostgreSQL client
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    const pgClient = new Client({
      connectionString: supabaseDbUrl,
      ssl: { rejectUnauthorized: false },
    });

    let backupKey = event.backupKey;

    // Find backup if not specified
    if (!backupKey) {
      const prefix = event.timestamp
        ? `backups/${environment}/${new Date(event.timestamp).toISOString().split('T')[0]}/`
        : `backups/${environment}/`;

      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
      });

      const listResult = await s3Client.send(listCommand);
      const backups = listResult.Contents?.sort(
        (a, b) =>
          (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
      );

      if (!backups || backups.length === 0) {
        throw new Error(`No backups found with prefix: ${prefix}`);
      }

      backupKey = backups[0].Key!;
    }


    // Download backup from S3
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: backupKey,
    });

    const response = await s3Client.send(getCommand);
    const backupContent = await response.Body!.transformToString();
    const backup = JSON.parse(backupContent);

    const { metadata, data } = backup;

    Object.entries(data).forEach(([tableName, tableData]) => {
      if (Array.isArray(tableData)) {
      }
    });

    // Build a list of public schema tables that exist in the backup
    const availableTables = Object.keys(data)
      .filter((key) => Array.isArray(data[key]) && key.startsWith('public.'))
      .map((key) => key.replace('public.', ''));

    // Filter tables to restore based on event or use all available tables
    const tablesToRestore = event.tables || metadata.tables || availableTables;
    const recordsRestored: Record<string, number> = {};
    const validationResults: Record<string, boolean> = {};

    if (event.validateOnly) {

      for (const table of tablesToRestore) {
        const publicTableKey = `public.${table}`;
        const tableData = data[publicTableKey];

        if (!tableData) {
          validationResults[table] = false;
          continue;
        }

        const isValid =
          Array.isArray(tableData) &&
          (tableData.length === 0 || typeof tableData[0] === 'object');

        validationResults[table] = isValid;
      }

      return {
        success: true,
        backupKey,
        timestamp: metadata.timestamp,
        tables: tablesToRestore,
        recordsRestored,
        validationResults,
      };
    }

    if (event.dryRun) {

      for (const table of tablesToRestore) {
        const publicTableKey = `public.${table}`;
        const tableData = data[publicTableKey];

        if (tableData && Array.isArray(tableData)) {
          recordsRestored[table] = tableData.length;
        } else {
          recordsRestored[table] = 0;
        }
      }

      return {
        success: true,
        backupKey,
        timestamp: metadata.timestamp,
        tables: tablesToRestore,
        recordsRestored,
      };
    }

    // Actual restore process

    // Connect to PostgreSQL for creating placeholder users
    await pgClient.connect();

    // Step 1: Create placeholder users for foreign key constraints

    const allUserIds = new Set<string>();

    // Collect all user IDs from tables that reference auth.users
    const tablesWithUserRefs = ['playlists', 'profiles', 'user_playlists'];

    for (const table of tablesWithUserRefs) {
      const publicTableKey = `public.${table}`;
      const tableData = data[publicTableKey];

      if (Array.isArray(tableData)) {
        tableData.forEach((record: any) => {
          // Different tables might have different column names for user references
          if (record.created_by) allUserIds.add(record.created_by);
          if (record.user_id) allUserIds.add(record.user_id);
          if (record.id && table === 'profiles') allUserIds.add(record.id); // profiles.id often matches auth.users.id
        });
      }
    }


    // Create minimal placeholder users
    for (const userId of allUserIds) {
      try {
        await pgClient.query(
          `
          INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token) 
          VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '') 
          ON CONFLICT (id) DO NOTHING
        `,
          [userId, `placeholder-${userId.substring(0, 8)}@restore.placeholder`]
        );
      } catch (error) {
        // Continue with other users
      }
    }


    // Step 2: Restore public schema tables

    for (const table of tablesToRestore) {
      const publicTableKey = `public.${table}`;
      const tableData = data[publicTableKey];

      if (!tableData || !Array.isArray(tableData)) {
        recordsRestored[table] = 0;
        continue;
      }

      if (tableData.length === 0) {
        recordsRestored[table] = 0;
        continue;
      }


      try {
        // Insert in batches of 1000 records
        const batchSize = 1000;
        let insertedCount = 0;

        for (let i = 0; i < tableData.length; i += batchSize) {
          const batch = tableData.slice(i, i + batchSize);

          const { error } = await supabase
            .from(table as any)
            .upsert(batch, { onConflict: 'id' }); // Use upsert to handle conflicts

          if (error) {
            console.error(`Error restoring batch for table ${table}:`, error);
            throw new Error(
              `Failed to restore table ${table}: ${error.message}`
            );
          }

          insertedCount += batch.length;
        }

        recordsRestored[table] = insertedCount;
      } catch (error) {
        console.error(`Error restoring table ${table}:`, error);
        throw new Error(`Failed to restore table ${table}: ${error}`);
      }
    }

    await pgClient.end();


    return {
      success: true,
      backupKey,
      timestamp: metadata.timestamp,
      tables: tablesToRestore,
      recordsRestored,
    };
  } catch (error) {
    console.error('Restore failed:', error);

    return {
      success: false,
      backupKey: event.backupKey || 'unknown',
      timestamp: new Date().toISOString(),
      tables: event.tables || [],
      recordsRestored: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
