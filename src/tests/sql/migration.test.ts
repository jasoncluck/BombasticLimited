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

describe("SQL Migration Tests", () => {
  const db = getTestDatabase();
  let migrationFiles: any[] = [];
  let dbAvailable = false;

  async function isDbAvailable(): Promise<boolean> {
    if (!dbAvailable) return false;
    try {
      await db.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  beforeAll(async () => {
    // Always load migration files regardless of database connection
    try {
      migrationFiles = await getMigrationFiles(SUPABASE_DIR);
    } catch (error) {
      console.warn("Failed to load migration files:", error);
    }

    // Try to connect to database
    try {
      await db.connect();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        "Database connection failed - database-dependent tests will be skipped:",
        error,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    // Reset database state before each test, but only if database is available
    if (await isDbAvailable()) {
      try {
        await db.resetDatabase();
      } catch (error) {
        console.warn("Database reset failed:", error);
      }
    }
  });

  test("should load migration files in correct order", async () => {
    expect(migrationFiles.length).toBeGreaterThan(0);

    // Check that files are ordered by their order number
    for (let i = 1; i < migrationFiles.length; i++) {
      const prev = migrationFiles[i - 1];
      const curr = migrationFiles[i];

      if (prev.order !== undefined && curr.order !== undefined) {
        expect(prev.order).toBeLessThanOrEqual(curr.order);
      }
    }
  });

  test("should apply extensions and types migration successfully", async () => {
    // Skip if database not available
    if (!(await isDbAvailable())) {
      console.warn("Skipping test - database not available");
      return;
    }

    const extensionsMigration = migrationFiles.find(
      (f) => f.name.includes("extensions_and_types") || f.name.includes("01_"),
    );

    expect(extensionsMigration).toBeDefined();

    const content = await readFile(extensionsMigration.path, "utf-8");
    await db.query(content);

    // Verify extensions are installed
    const extensions = ["uuid-ossp", "pgcrypto", "pgjwt"];
    for (const ext of extensions) {
      const exists = await db.extensionExists(ext);
      expect(exists).toBe(true);
    }
  });

  test("should apply core functions migration successfully", async () => {
    if (!(await isDbAvailable())) {
      console.warn("Skipping test - database not available");
      return;
    }
    if (!(await isDbAvailable())) return;

    // Apply dependencies first
    await applyBaseDependencies();

    const functionsMigration = migrationFiles.find(
      (f) => f.name.includes("core_functions") || f.name.includes("02_"),
    );

    expect(functionsMigration).toBeDefined();

    const content = await readFile(functionsMigration.path, "utf-8");
    await db.query(content);

    // Check that basic functions are created
    // Note: This is a basic check - specific function tests would be in functional tests
    const result = await db.query(`
      SELECT count(*) as function_count 
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
    `);

    expect(parseInt(result.rows[0].function_count)).toBeGreaterThan(0);
  });

  test("should apply base tables migration successfully", async () => {
    if (!(await isDbAvailable())) {
      console.warn("Skipping test - database not available");
      return;
    }
    if (!(await isDbAvailable())) return;

    await applyBaseDependencies();

    const tablesMigration = migrationFiles.find(
      (f) => f.name.includes("base_tables") || f.name.includes("03_"),
    );

    expect(tablesMigration).toBeDefined();

    const content = await readFile(tablesMigration.path, "utf-8");
    await db.query(content);

    // Verify core tables exist
    const expectedTables = ["videos", "playlists", "profiles"];
    for (const table of expectedTables) {
      const exists = await db.tableExists(table);
      expect(exists).toBe(true);
    }
  });

  test("should apply all migrations sequentially without errors", async () => {
    if (!(await isDbAvailable())) {
      console.warn("Skipping test - database not available");
      return;
    }
    if (!(await isDbAvailable())) return;

    const errors: Array<{ file: string; error: string }> = [];

    for (const migration of migrationFiles) {
      try {
        console.log(`Applying migration: ${migration.name}`);
        const content = await readFile(migration.path, "utf-8");
        await db.query(content);
      } catch (error) {
        errors.push({
          file: migration.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (errors.length > 0) {
      const errorDetails = errors
        .map((e) => `${e.file}: ${e.error}`)
        .join("\n");
      throw new Error(`Migration errors:\n${errorDetails}`);
    }
  });

  test("should verify database schema after all migrations", async () => {
    if (!(await isDbAvailable())) {
      console.warn("Skipping test - database not available");
      return;
    }
    if (!(await isDbAvailable())) return;

    // Apply all migrations
    for (const migration of migrationFiles) {
      const content = await readFile(migration.path, "utf-8");
      await db.query(content);
    }

    // Verify final database state
    const tableResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const tables = tableResult.rows.map((row) => row.table_name);

    // Should have core tables
    expect(tables).toContain("videos");
    expect(tables).toContain("playlists");
    expect(tables).toContain("profiles");

    // Check for indexes
    const indexResult = await db.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);

    expect(indexResult.rows.length).toBeGreaterThan(0);
  });

  test("should validate foreign key relationships after migrations", async () => {
    if (!(await isDbAvailable())) {
      console.warn("Skipping test - database not available");
      return;
    }
    if (!(await isDbAvailable())) return;

    // Apply all migrations to get full schema
    for (const migration of migrationFiles) {
      const content = await readFile(migration.path, "utf-8");
      await db.query(content);
    }

    // Check foreign key constraints exist
    const fkResult = await db.query(`
      SELECT 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);

    expect(fkResult.rows.length).toBeGreaterThan(0);
  });

  // Helper functions
  async function isDbAvailable(): Promise<boolean> {
    try {
      await db.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async function applyBaseDependencies(): Promise<void> {
    // Apply first two migrations (extensions and core functions) which are typically dependencies
    const baseMigrations = migrationFiles.slice(0, 2);

    for (const migration of baseMigrations) {
      try {
        const content = await readFile(migration.path, "utf-8");
        await db.query(content);
      } catch (error) {
        // May already be applied or not available
        console.warn(
          `Could not apply base migration ${migration.name}:`,
          error,
        );
      }
    }
  }
});
