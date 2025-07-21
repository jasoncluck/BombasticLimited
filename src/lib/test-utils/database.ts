import { Client } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface DatabaseTestConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Default test database configuration for Supabase local development
 */
export const DEFAULT_TEST_CONFIG: DatabaseTestConfig = {
  host: 'localhost',
  port: 54322, // Supabase local DB port from config.toml
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

/**
 * Database test utility class for managing test database connections and operations
 */
export class DatabaseTestUtils {
  private client: Client;
  private connected = false;

  constructor(private config: DatabaseTestConfig = DEFAULT_TEST_CONFIG) {
    this.client = new Client(this.config);
  }

  /**
   * Connect to the test database
   */
  async connect(): Promise<void> {
    if (!this.connected) {
      try {
        await this.client.connect();
        this.connected = true;
      } catch (error) {
        if (error.message && error.message.includes('has already been connected')) {
          // Client is already connected
          this.connected = true;
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Disconnect from the test database
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        await this.client.end();
      } catch (error) {
        // Ignore errors when disconnecting
        console.warn('Error disconnecting database:', error);
      }
      this.connected = false;
    }
  }

  /**
   * Get a fresh connection by disconnecting and reconnecting
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    this.client = new Client(this.config);
    await this.connect();
  }

  /**
   * Execute a SQL query and return the result
   */
  async query(sql: string, params?: any[]): Promise<any> {
    try {
      if (!this.connected) {
        await this.connect();
      }
      return this.client.query(sql, params);
    } catch (error) {
      // If connection is broken, try to reconnect once
      if (error.message && (
        error.message.includes('has already been connected') ||
        error.message.includes('Client has already been connected') ||
        error.message.includes('Connection terminated') ||
        error.message.includes('server closed the connection')
      )) {
        console.warn('Database connection broken, reconnecting...');
        await this.disconnect();
        this.client = new Client(this.config);
        await this.connect();
        return this.client.query(sql, params);
      }
      throw error;
    }
  }

  /**
   * Execute a SQL file
   */
  async executeFile(filePath: string): Promise<void> {
    const sql = await readFile(filePath, 'utf-8');
    await this.query(sql);
  }

  /**
   * Check if a table exists in the database
   */
  async tableExists(tableName: string, schema = 'public'): Promise<boolean> {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      )`,
      [schema, tableName]
    );
    return result.rows[0].exists;
  }

  /**
   * Check if a function exists in the database
   */
  async functionExists(functionName: string, schema = 'public'): Promise<boolean> {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.routines 
        WHERE routine_schema = $1 AND routine_name = $2
      )`,
      [schema, functionName]
    );
    return result.rows[0].exists;
  }

  /**
   * Check if an extension is installed
   */
  async extensionExists(extensionName: string): Promise<boolean> {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT FROM pg_extension 
        WHERE extname = $1
      )`,
      [extensionName]
    );
    return result.rows[0].exists;
  }

  /**
   * Get the count of rows in a table
   */
  async getRowCount(tableName: string, schema = 'public'): Promise<number> {
    const result = await this.query(`SELECT COUNT(*) FROM "${schema}"."${tableName}"`);
    return parseInt(result.rows[0].count);
  }

  /**
   * Clear all data from a table
   */
  async clearTable(tableName: string, schema = 'public'): Promise<void> {
    await this.query(`TRUNCATE TABLE "${schema}"."${tableName}" CASCADE`);
  }

  /**
   * Reset the database to a clean state for testing
   */
  async resetDatabase(): Promise<void> {
    try {
      // Ensure we have a working connection
      if (!this.connected) {
        await this.connect();
      }

      // Check our permissions first
      const canManageSchemas = await this.checkSchemaPermissions();
      
      if (canManageSchemas) {
        // We can manage schemas, proceed with full reset
        await this.performFullSchemaReset();
      } else {
        // Limited permissions, just clean up tables and data
        console.log('Limited schema permissions, performing table-level cleanup');
        await this.clearKnownTables();
        // Ensure auth schema exists if we can create it
        await this.ensureAuthSchema();
      }
      
      // Set search path to ensure migrations work properly
      await this.query("SELECT pg_catalog.set_config('search_path', 'public', false)");
      
    } catch (error) {
      console.warn('Database reset failed, attempting minimal cleanup:', error);
      // Final fallback: just clear what we can
      await this.clearKnownTables();
    }
  }

  /**
   * Check if we have permissions to manage schemas
   */
  private async checkSchemaPermissions(): Promise<boolean> {
    try {
      // Test if we can create/drop schemas by checking our role
      const result = await this.query(`
        SELECT 
          usesuper, 
          usecreatedb,
          current_user,
          session_user
        FROM pg_user 
        WHERE usename = current_user
      `);
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        return user.usesuper || user.usecreatedb;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Perform full schema reset when we have permissions
   */
  private async performFullSchemaReset(): Promise<void> {
    // Check if public schema exists first
    const schemaResult = await this.query(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name = 'public'
    `);

    if (schemaResult.rows.length === 0) {
      // Public schema doesn't exist, create it
      await this.query('CREATE SCHEMA public');
      await this.query('GRANT USAGE ON SCHEMA public TO current_user');
      await this.query('GRANT CREATE ON SCHEMA public TO current_user');
      await this.query("COMMENT ON SCHEMA public IS 'standard public schema'");
    } else {
      // Public schema exists, clean it up by dropping and recreating
      await this.query('DROP SCHEMA public CASCADE');
      await this.query('CREATE SCHEMA public');
      await this.query('GRANT USAGE ON SCHEMA public TO current_user');
      await this.query('GRANT CREATE ON SCHEMA public TO current_user');
      await this.query("COMMENT ON SCHEMA public IS 'standard public schema'");
    }

    // Try to ensure auth schema exists for test users
    await this.ensureAuthSchema();
  }

  /**
   * Ensure auth schema exists, with fallback handling
   */
  private async ensureAuthSchema(): Promise<void> {
    try {
      // Check if auth schema exists and we can access it
      const authExists = await this.query(`
        SELECT schema_name FROM information_schema.schemata 
        WHERE schema_name = 'auth'
      `);

      if (authExists.rows.length === 0) {
        // Auth schema doesn't exist, try to create it
        await this.query('CREATE SCHEMA IF NOT EXISTS auth');
        await this.query('GRANT USAGE ON SCHEMA auth TO current_user');
        await this.query('GRANT CREATE ON SCHEMA auth TO current_user');
      }
    } catch (error) {
      console.warn('Could not manage auth schema (this may be expected in some setups):', error);
    }
  }

  /**
   * Get a fresh database connection for a clean reset
   */
  async getFreshConnection(): Promise<DatabaseTestUtils> {
    await this.disconnect();
    return new DatabaseTestUtils(this.config);
  }

  /**
   * Clear known tables as a fallback cleanup method
   */
  private async clearKnownTables(): Promise<void> {
    const tables = ['user_video_timestamps', 'playlist_videos', 'playlists', 'videos', 'user_profiles'];
    
    // Disable foreign key checks temporarily
    try {
      await this.query('SET session_replication_role = replica');
      
      for (const table of tables) {
        try {
          if (await this.tableExists(table)) {
            await this.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
          }
        } catch (error) {
          console.warn(`Failed to drop table ${table}:`, error);
        }
      }
      
      // Drop types and other objects
      try {
        await this.query('DROP TYPE IF EXISTS source CASCADE');
        await this.query('DROP TYPE IF EXISTS playlist_type CASCADE');
        await this.query('DROP SEQUENCE IF EXISTS playlists_custom_seq CASCADE');
      } catch (error) {
        console.warn('Failed to drop some database objects:', error);
      }
      
    } finally {
      try {
        await this.query('SET session_replication_role = DEFAULT');
      } catch (error) {
        console.warn('Failed to reset session replication role:', error);
      }
    }
  }

  /**
   * Create a test user in the auth.users table if it doesn't exist
   */
  async createTestUser(userId: string = '00000000-0000-0000-0000-000000000000'): Promise<void> {
    try {
      // Try to ensure auth schema exists
      await this.ensureAuthSchema();
      
      // Create a minimal users table in auth schema if it doesn't exist
      await this.query(`
        CREATE TABLE IF NOT EXISTS auth.users (
          id uuid PRIMARY KEY,
          email text,
          created_at timestamp with time zone DEFAULT now()
        )
      `);
      
      // Insert test user if not exists
      await this.query(`
        INSERT INTO auth.users (id, email, created_at)
        VALUES ($1, 'test@example.com', now())
        ON CONFLICT (id) DO NOTHING
      `, [userId]);
    } catch (error) {
      console.warn('Failed to create test user (this may be expected if auth schema is managed externally):', error);
    }
  }

  /**
   * Clean up auth schema for tests
   */
  async cleanupAuthSchema(): Promise<void> {
    try {
      await this.query('DROP SCHEMA IF EXISTS auth CASCADE');
    } catch (error) {
      console.warn('Failed to cleanup auth schema:', error);
    }
  }

  /**
   * Apply a list of migrations in order with better error handling
   */
  async applyMigrations(migrationFiles: Array<{ name: string; path: string }>): Promise<Array<{ name: string; success: boolean; error?: string }>> {
    const results: Array<{ name: string; success: boolean; error?: string }> = [];
    
    // Ensure we have a clean state for migrations
    await this.prepareDatabaseForMigrations();
    
    for (const migration of migrationFiles) {
      try {
        const content = await readFile(migration.path, 'utf-8');
        await this.query(content);
        results.push({ name: migration.name, success: true });
        console.log(`✅ Migration ${migration.name} applied successfully`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`❌ Migration ${migration.name} failed:`, errorMsg);
        results.push({ 
          name: migration.name, 
          success: false, 
          error: errorMsg 
        });
      }
    }
    
    return results;
  }

  /**
   * Prepare database for migrations by ensuring basic schema is available
   */
  private async prepareDatabaseForMigrations(): Promise<void> {
    try {
      // Ensure public schema exists
      await this.query('CREATE SCHEMA IF NOT EXISTS public');
      
      // Set search path
      await this.query("SELECT pg_catalog.set_config('search_path', 'public', false)");
      
      // Log current state
      const tableCount = await this.getTableCount();
      console.log(`Database prepared for migrations. Current table count: ${tableCount}`);
    } catch (error) {
      console.warn('Failed to prepare database for migrations:', error);
    }
  }

  /**
   * Verify that essential tables exist after migrations
   */
  async verifyEssentialTables(): Promise<{ success: boolean; missingTables: string[] }> {
    const essentialTables = ['videos', 'playlists', 'user_profiles'];
    const missingTables: string[] = [];
    
    for (const table of essentialTables) {
      if (!await this.tableExists(table)) {
        missingTables.push(table);
      }
    }
    
    return {
      success: missingTables.length === 0,
      missingTables
    };
  }

  /**
   * Check if the database has basic schema in place
   */
  async hasValidSchema(): Promise<boolean> {
    try {
      // Check if public schema exists
      const schemaResult = await this.query(`
        SELECT schema_name FROM information_schema.schemata 
        WHERE schema_name = 'public'
      `);
      return schemaResult.rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get table count in public schema
   */
  async getTableCount(): Promise<number> {
    try {
      const result = await this.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      return parseInt(result.rows[0].count) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a specific SQL syntax is valid by trying to parse it
   */
  async validateSyntax(sql: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Use EXPLAIN to validate syntax without executing
      await this.query(`EXPLAIN ${sql}`);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}

/**
 * Global database test utility instance
 */
let globalTestDb: DatabaseTestUtils | null = null;

/**
 * Get or create a global database test utility instance
 */
export function getTestDatabase(): DatabaseTestUtils {
  if (!globalTestDb) {
    globalTestDb = new DatabaseTestUtils();
  }
  return globalTestDb;
}

/**
 * Clean up the global database connection
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (globalTestDb) {
    await globalTestDb.disconnect();
    globalTestDb = null;
  }
}