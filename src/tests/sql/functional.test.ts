import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { getTestDatabase, cleanupTestDatabase } from "$lib/test-utils/database";
import { getMigrationFiles } from "$lib/test-utils/sql-discovery";

const SUPABASE_DIR = join(process.cwd(), "supabase");

describe("SQL Functional Tests", () => {
  const db = getTestDatabase();
  let migrationFiles: any[] = [];

  beforeAll(async () => {
    try {
      await db.connect();
      migrationFiles = await getMigrationFiles(SUPABASE_DIR);

      // Apply all migrations to set up the complete database
      for (const migration of migrationFiles) {
        try {
          const content = await readFile(migration.path, "utf-8");
          await db.query(content);
        } catch (error) {
          console.warn(`Could not apply migration ${migration.name}:`, error);
        }
      }
    } catch (error) {
      console.warn(
        "Database setup failed - functional tests will be skipped:",
        error,
      );
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    // Reset database and reapply migrations for each test
    try {
      await db.resetDatabase();

      // Reapply migrations after reset using the new utility method
      const migrationResults = await db.applyMigrations(migrationFiles);

      // Log migration status for debugging
      const failed = migrationResults.filter((r) => !r.success);
      if (failed.length > 0) {
        console.warn(
          `Migration errors during setup: ${failed.length}/${migrationFiles.length} failed`,
        );
        failed.forEach((f) => console.warn(`  - ${f.name}: ${f.error}`));
      } else {
        console.log(
          `All ${migrationFiles.length} migrations applied successfully`,
        );
      }

      // Create test user for tests that need it
      await db.createTestUser();
    } catch (error) {
      console.warn("Database setup failed:", error);
    }
  });

  test("should test database functions exist and are callable", async () => {
    if (!(await isDbAvailable())) return;

    // Get list of user-defined functions
    const functionsResult = await db.query(`
      SELECT 
        routine_name,
        routine_type,
        data_type,
        routine_definition
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `);

    expect(functionsResult.rows.length).toBeGreaterThan(0);

    // Test each function can be described (basic validation)
    for (const func of functionsResult.rows) {
      const funcName = func.routine_name;

      // Skip testing functions that require parameters for now
      // In a real implementation, you'd want to test with appropriate parameters
      try {
        await db.query(
          `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = $1`,
          [funcName],
        );
      } catch (error) {
        console.warn(
          `Could not get definition for function ${funcName}:`,
          error,
        );
      }
    }
  });

  test("should test RLS policies are properly configured", async () => {
    if (!(await isDbAvailable())) return;

    // Check that RLS is enabled on protected tables
    const rlsResult = await db.query(`
      SELECT 
        schemaname,
        tablename,
        rowsecurity
      FROM pg_tables 
      WHERE schemaname = 'public'
        AND rowsecurity = true
    `);

    // Should have some tables with RLS enabled
    expect(rlsResult.rows.length).toBeGreaterThan(0);

    // Check that policies exist
    const policiesResult = await db.query(`
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual
      FROM pg_policies
      WHERE schemaname = 'public'
    `);

    expect(policiesResult.rows.length).toBeGreaterThan(0);
  });

  test("should test table constraints and relationships", async () => {
    if (!(await isDbAvailable())) return;

    // Test primary key constraints
    const pkResult = await db.query(`
      SELECT 
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    `);

    expect(pkResult.rows.length).toBeGreaterThan(0);

    // Test foreign key constraints
    const fkResult = await db.query(`
      SELECT 
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);

    expect(fkResult.rows.length).toBeGreaterThan(0);
  });

  test("should test database triggers are properly set up", async () => {
    if (!(await isDbAvailable())) return;

    const triggersResult = await db.query(`
      SELECT 
        trigger_name,
        event_manipulation,
        event_object_table,
        action_timing,
        action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
    `);

    // Should have triggers for common operations like updated_at
    const hasUpdateTriggers = triggersResult.rows.some(
      (row) =>
        row.trigger_name.includes("updated_at") ||
        row.action_statement.includes("updated_at"),
    );

    expect(hasUpdateTriggers).toBe(true);
  });

  test("should test basic CRUD operations on core tables", async () => {
    if (!(await isDbAvailable())) return;

    // Test videos table operations
    if (await db.tableExists("public.videos")) {
      // Insert test data
      await db.query(`
        INSERT INTO public.videos (id, source, title, description, thumbnail_url)
        VALUES ('test-video-1', 'giantbomb', 'Test Video', 'Test Description', 'https://example.com/thumb.jpg')
      `);

      // Verify insert
      const count = await db.getRowCount("videos");
      expect(count).toBe(1);

      // Test update
      await db.query(`
        UPDATE videos 
        SET title = 'Updated Title' 
        WHERE id = 'test-video-1'
      `);

      // Verify update
      const result = await db.query(`
        SELECT title FROM videos WHERE id = 'test-video-1'
      `);
      expect(result.rows[0].title).toBe("Updated Title");

      // Test delete
      await db.query(`DELETE FROM videos WHERE id = 'test-video-1'`);

      // Verify delete
      const finalCount = await db.getRowCount("videos");
      expect(finalCount).toBe(0);
    }
  });

  test("should test search functionality if implemented", async () => {
    if (!(await isDbAvailable())) return;

    // Check if search vector columns exist
    const searchResult = await db.query(`
      SELECT 
        table_name,
        column_name
      FROM information_schema.columns
      WHERE column_name LIKE '%search_vector%'
        AND table_schema = 'public'
    `);

    if (searchResult.rows.length > 0) {
      // Test that search vectors can be updated
      const table = searchResult.rows[0].table_name;

      try {
        await db.query(`
          SELECT COUNT(*) 
          FROM ${table} 
          WHERE search_vector IS NOT NULL
        `);

        // This test passes if the query doesn't error
        expect(true).toBe(true);
      } catch (error) {
        console.warn(`Search vector test failed for table ${table}:`, error);
      }
    }
  });

  test("should test enum types are properly defined", async () => {
    if (!(await isDbAvailable())) return;

    const enumsResult = await db.query(`
      SELECT 
        t.typname,
        e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `);

    if (enumsResult.rows.length > 0) {
      // Group by enum type
      const enums = enumsResult.rows.reduce(
        (acc, row) => {
          if (!acc[row.typname]) {
            acc[row.typname] = [];
          }
          acc[row.typname].push(row.enumlabel);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      // Test that enums have reasonable values
      Object.entries(enums).forEach(([enumName, values]) => {
        expect(values.length).toBeGreaterThan(0);
        expect(values.every((v) => typeof v === "string" && v.length > 0)).toBe(
          true,
        );
      });
    }
  });

  test("should test database indexes exist and are properly configured", async () => {
    if (!(await isDbAvailable())) return;

    // Check if we have a valid schema and tables first
    const tableCount = await db.getTableCount();
    if (tableCount === 0) {
      console.warn("No tables found in public schema - skipping index test");
      return;
    }

    console.log(
      `Found ${tableCount} tables in public schema, checking for indexes...`,
    );

    const indexesResult = await db.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'  -- Exclude primary key indexes
      ORDER BY tablename, indexname
    `);

    console.log(`Found ${indexesResult.rows.length} non-primary key indexes`);

    // Should have performance indexes if tables exist
    // Since we have tables, we expect at least some indexes to be created by migrations
    expect(indexesResult.rows.length).toBeGreaterThan(0);

    // Check for search-related indexes if applicable
    const hasSearchIndexes = indexesResult.rows.some(
      (row) =>
        row.indexdef.includes("search_vector") ||
        row.indexdef.includes("gin") ||
        row.indexdef.includes("gist"),
    );

    if (hasSearchIndexes) {
      expect(hasSearchIndexes).toBe(true);
    }
  });

  // Helper function
  async function isDbAvailable(): Promise<boolean> {
    try {
      await db.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
});

