import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
});

export interface BackupEvent {
  tables?: string[];
  backupType?: 'full' | 'incremental';
  dryRun?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupKey: string;
  timestamp: string;
  tables: string[];
  error?: string;
  backupSize?: number;
}

export const handler = async (
  event: BackupEvent = {}
): Promise<BackupResult> => {
  const bucketName = process.env.BACKUP_BUCKET_NAME;
  const environment = process.env.ENVIRONMENT || 'prod';
  let supabaseDbUrl = process.env.SUPABASE_DB_URL_PROD;

  // Add debugging

  if (!bucketName) {
    throw new Error('BACKUP_BUCKET_NAME environment variable is not set');
  }

  if (!supabaseDbUrl) {
    throw new Error('SUPABASE_DB_URL_PROD environment variable is not set');
  }

  // Fix special characters in the connection string
  const urlMatch = supabaseDbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@(.+)$/);

  if (urlMatch) {
    const [, username, password, hostAndDb] = urlMatch;
    const encodedPassword = encodeURIComponent(password);
    supabaseDbUrl = `postgresql://${username}:${encodedPassword}@${hostAndDb}`;
  }

  // Clean the connection string of any whitespace/newlines
  supabaseDbUrl = supabaseDbUrl.trim().replace(/[\r\n]/g, '');

  const timestamp = new Date().toISOString();
  const backupKey = `backups/${environment}/${timestamp.split('T')[0]}/database-backup-${timestamp.replace(/[:.]/g, '-')}.json`;


  try {
    // Define tables to backup (can be customized via event)
    // Note: "videos" table excluded as it can be regenerated from external data
    // Auth tables excluded - use Supabase's official backup for those
    const tablesToBackup = event.tables || [
      'playlists',
      'playlist_videos',
      'profiles',
      'user_playlists',
    ];


    // Initialize PostgreSQL client
    const pgClient = new Client({
      connectionString: supabaseDbUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    await pgClient.connect();

    const backupData: Record<string, any> = {};

    // Backup public schema tables only
    for (const table of tablesToBackup) {

      try {
        const result = await pgClient.query(`SELECT * FROM public.${table}`);
        backupData[`public.${table}`] = result.rows;
      } catch (error) {
        console.error(`Error backing up table public.${table}:`, error);
        throw new Error(`Failed to backup table public.${table}: ${error}`);
      }
    }

    await pgClient.end();

    // Create backup metadata
    const backupMetadata = {
      timestamp,
      environment,
      backupType: event.backupType || 'full',
      tables: tablesToBackup,
      schemas: ['public'],
      method: 'postgresql-direct',
      recordCounts: Object.fromEntries(
        Object.entries(backupData).map(([table, data]) => [
          table,
          Array.isArray(data) ? data.length : 0,
        ])
      ),
    };

    const backup = {
      metadata: backupMetadata,
      data: backupData,
    };

    const backupJson = JSON.stringify(backup, null, 2);

    if (event.dryRun) {

      return {
        success: true,
        backupKey,
        timestamp,
        tables: tablesToBackup,
        backupSize: Buffer.byteLength(backupJson, 'utf8'),
      };
    }

    // Upload to S3

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: backupKey,
      Body: backupJson,
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: {
        environment,
        backupType: event.backupType || 'full',
        tables: tablesToBackup.join(','),
        schemas: 'public',
        method: 'postgresql-direct',
        totalRecords: Object.values(backupData)
          .reduce(
            (sum, data) => sum + (Array.isArray(data) ? data.length : 0),
            0
          )
          .toString(),
      },
    });

    await s3Client.send(putCommand);

    const backupSize = Buffer.byteLength(backupJson, 'utf8');

    return {
      success: true,
      backupKey,
      timestamp,
      tables: tablesToBackup,
      backupSize,
    };
  } catch (error) {
    console.error('Backup failed:', error);

    return {
      success: false,
      backupKey,
      timestamp,
      tables: event.tables || [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
