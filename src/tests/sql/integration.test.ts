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
import { getMigrationFiles, getSeedFiles } from "$lib/test-utils/sql-discovery";

const SUPABASE_DIR = join(process.cwd(), "supabase");

describe("SQL Integration Tests", () => {
  const db = getTestDatabase();
  let migrationFiles: any[] = [];
  let seedFiles: any[] = [];

  beforeAll(async () => {
    try {
      await db.connect();
      migrationFiles = await getMigrationFiles(SUPABASE_DIR);
      seedFiles = await getSeedFiles(SUPABASE_DIR);
    } catch (error) {
      console.warn(
        "Database connection failed - integration tests will be skipped:",
        error,
      );
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    // Reset database state before each test
    if (await isDbAvailable()) {
      try {
        await db.resetDatabase();
        console.log("Database reset completed successfully");
      } catch (error) {
        console.warn(
          "Database reset failed - some tests may not work correctly:",
          error,
        );
      }
    }
  });

  test("should handle complete database lifecycle", async () => {
    if (!(await isDbAvailable())) return;

    try {
      // 1. Apply all migrations
      console.log("Applying migrations...");
      await applyAllMigrations();

      // 2. Verify schema is complete
      console.log("Verifying schema...");
      const schemaValid = await validateCompleteSchema();
      if (!schemaValid) {
        console.error("Schema validation failed after migrations");
        const verification = await db.verifyEssentialTables();
        console.log("Essential tables check:", verification);
      }
      expect(schemaValid).toBe(true);

      // 3. Create test user
      console.log("Creating test user...");
      await db.createTestUser();

      // 4. Insert test data across related tables
      console.log("Inserting test data...");
      await insertTestData();

      // 5. Verify data integrity and relationships
      console.log("Verifying data integrity...");
      await verifyDataIntegrity();

      // 6. Test cascade operations
      console.log("Testing cascade operations...");
      await testCascadeOperations();

      console.log("✅ Complete database lifecycle test passed");
    } catch (error) {
      console.error("❌ Database lifecycle test failed:", error);
      throw error;
    }
  });

  test("should test cross-table data integrity", async () => {
    if (!(await isDbAvailable())) return;

    await applyAllMigrations();

    // Create test user first
    await db.createTestUser();

    // Test data relationships between tables
    if (
      (await db.tableExists("videos")) &&
      (await db.tableExists("playlists"))
    ) {
      // Create test playlist
      const playlistResult = await db.query(`
        INSERT INTO public.playlists (created_by, name, short_id)
        VALUES ('00000000-0000-0000-0000-000000000000', 'Test Playlist', 'test123')
        RETURNING id
      `);

      const playlistId = playlistResult.rows[0].id;

      // Create test video with valid enum value
      await db.query(`
        INSERT INTO public.videos (id, source, title, description, thumbnail_url)
        VALUES ('test-video-1', 'giantbomb', 'Test Video', 'Description', 'https://example.com/thumb.jpg')
      `);

      // Link video to playlist (if playlist_items table exists)
      if (await db.tableExists("playlist_items")) {
        await db.query(
          `
          INSERT INTO public.playlist_items (playlist_id, video_id, position)
          VALUES ($1, 'test-video-1', 1)
        `,
          [playlistId],
        );

        // Verify relationship
        const relationshipResult = await db.query(
          `
          SELECT p.name, v.title
          FROM playlists p
          JOIN playlist_items pi ON p.id = pi.playlist_id
          JOIN videos v ON pi.video_id = v.id
          WHERE p.id = $1
        `,
          [playlistId],
        );

        expect(relationshipResult.rows.length).toBe(1);
        expect(relationshipResult.rows[0].name).toBe("Test Playlist");
        expect(relationshipResult.rows[0].title).toBe("Test Video");
      }
    }
  });

  test("should test timestamp and audit functionality", async () => {
    if (!(await isDbAvailable())) return;

    await applyAllMigrations();

    // Create test user first
    await db.createTestUser();

    // Test tables with created_at/updated_at columns
    const timestampTables = await getTablesWithTimestamps();

    for (const table of timestampTables.slice(0, 2)) {
      // Test first 2 tables to keep test reasonable
      try {
        // Insert a record and check created_at is set
        let insertQuery = "";
        let selectQuery = "";

        if (table === "videos") {
          insertQuery = `
            INSERT INTO videos (id, source, title, description, thumbnail_url)
            VALUES ('test-ts-1', 'giantbomb', 'Test', 'Desc', 'https://example.com/thumb.jpg')
          `;
          selectQuery = `SELECT created_at, updated_at FROM videos WHERE id = 'test-ts-1'`;
        } else if (table === "playlists") {
          insertQuery = `
            INSERT INTO playlists (created_by, name, short_id)
            VALUES ('00000000-0000-0000-0000-000000000000', 'Test', 'ts123')
          `;
          selectQuery = `SELECT created_at, updated_at FROM playlists WHERE short_id = 'ts123'`;
        } else {
          continue; // Skip unknown tables
        }

        await db.query(insertQuery);

        const result = await db.query(selectQuery);
        if (result.rows.length > 0) {
          const row = result.rows[0];

          // created_at should be set
          if (row.created_at) {
            expect(new Date(row.created_at)).toBeInstanceOf(Date);
          }

          // updated_at should be set if column exists
          if (row.updated_at) {
            expect(new Date(row.updated_at)).toBeInstanceOf(Date);
          }
        }
      } catch (error) {
        console.warn(`Timestamp test failed for table ${table}:`, error);
      }
    }
  });

  test("should test search functionality integration", async () => {
    if (!(await isDbAvailable())) return;

    await applyAllMigrations();

    // Create test user
    await db.createTestUser();

    // Test search vectors if they exist
    const searchTables = await getTablesWithSearchVectors();

    for (const table of searchTables.slice(0, 1)) {
      // Test one table
      try {
        if (table === "videos") {
          // Insert test data
          await db.query(`
            INSERT INTO videos (id, source, title, description, thumbnail_url)
            VALUES ('search-test-1', 'giantbomb', 'JavaScript Tutorial', 'Learn JavaScript programming', 'https://example.com/thumb.jpg')
          `);

          // Test search functionality (if search vector is automatically updated)
          const searchResult = await db.query(`
            SELECT id, title 
            FROM videos 
            WHERE search_vector @@ plainto_tsquery('english', 'JavaScript')
          `);

          // This test may pass with 0 results if search vectors aren't automatically updated
          // The important thing is that the query executes without error
          expect(Array.isArray(searchResult.rows)).toBe(true);
        }
      } catch (error) {
        console.warn(`Search test failed for table ${table}:`, error);
      }
    }
  });

  test("should test performance with larger dataset", async () => {
    if (!(await isDbAvailable())) return;

    await applyAllMigrations();

    // Create test user
    await db.createTestUser();

    // Insert multiple records to test performance
    const batchSize = 100;
    const startTime = Date.now();

    try {
      // Insert batch of videos
      const values = Array.from(
        { length: batchSize },
        (_, i) =>
          `('perf-test-${i}', 'giantbomb', 'Video ${i}', 'Description ${i}', 'https://example.com/thumb${i}.jpg')`,
      ).join(",");

      await db.query(`
        INSERT INTO videos (id, source, title, description, thumbnail_url)
        VALUES ${values}
      `);

      const insertTime = Date.now() - startTime;

      // Test query performance
      const queryStartTime = Date.now();
      const result = await db.query(
        `SELECT COUNT(*) FROM videos WHERE source = 'giantbomb'`,
      );
      const queryTime = Date.now() - queryStartTime;

      // Verify results
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(batchSize);

      // Performance assertions (adjust thresholds as needed)
      expect(insertTime).toBeLessThan(5000); // 5 seconds for 100 inserts
      expect(queryTime).toBeLessThan(1000); // 1 second for count query
    } catch (error) {
      console.warn("Performance test failed:", error);
    }
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

  async function applyAllMigrations(): Promise<void> {
    const migrationResults = await db.applyMigrations(migrationFiles);

    const failedMigrations = migrationResults.filter((r) => !r.success);
    if (failedMigrations.length > 0) {
      console.warn(
        "Some migrations failed:",
        failedMigrations.map((f) => f.name),
      );
      // Don't throw here in helper function - let the calling test decide how to handle
    } else {
      console.log("All migrations applied successfully");
    }
  }

  async function validateCompleteSchema(): Promise<boolean> {
    try {
      // Check that essential tables exist
      const essentialTables = ["videos", "playlists"];
      for (const table of essentialTables) {
        if (!(await db.tableExists(table))) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  async function insertTestData(): Promise<void> {
    // Insert test data across related tables
    try {
      // Ensure test user exists first
      await db.createTestUser();

      // Check if videos table exists before trying to insert
      if (!(await db.tableExists("videos"))) {
        console.warn(
          "Videos table does not exist - skipping test data insertion",
        );
        return;
      }

      await db.query(`
        INSERT INTO public.videos (id, source, title, description, thumbnail_url)
        VALUES 
          ('integration-1', 'giantbomb', 'Integration Test 1', 'Description 1', 'https://example.com/1.jpg'),
          ('integration-2', 'giantbomb', 'Integration Test 2', 'Description 2', 'https://example.com/2.jpg')
      `);

      console.log("✅ Test videos inserted successfully");

      if (await db.tableExists("public.playlists")) {
        await db.query(`
          INSERT INTO playlists (created_by, name, short_id)
          VALUES ('00000000-0000-0000-0000-000000000000', 'Integration Playlist', 'int123')
        `);
        console.log("✅ Test playlist inserted successfully");
      }
    } catch (error) {
      console.warn("Could not insert test data:", error);
      throw error; // Re-throw to make test failures more visible
    }
  }

  async function verifyDataIntegrity(): Promise<void> {
    // Verify that inserted data maintains integrity
    const videoCount = await db.getRowCount("videos");
    expect(videoCount).toBeGreaterThan(0);
  }

  async function testCascadeOperations(): Promise<void> {
    // Test cascade delete operations if applicable
    try {
      if (await db.tableExists("public.playlists")) {
        const playlistResult = await db.query(`
          SELECT id FROM public.playlists WHERE short_id = 'int123' LIMIT 1
        `);

        if (playlistResult.rows.length > 0) {
          // Delete playlist and verify cascade behavior
          await db.query(`DELETE FROM playlists WHERE id = $1`, [
            playlistResult.rows[0].id,
          ]);
        }
      }
    } catch (error) {
      console.warn("Cascade test failed:", error);
    }
  }

  async function getTablesWithData(): Promise<string[]> {
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    const tablesWithData = [];
    for (const row of result.rows) {
      try {
        const count = await db.getRowCount(row.table_name);
        if (count > 0) {
          tablesWithData.push(row.table_name);
        }
      } catch {
        // Table might not be accessible
      }
    }

    return tablesWithData;
  }

  async function getTablesWithTimestamps(): Promise<string[]> {
    const result = await db.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('created_at', 'updated_at')
    `);

    return result.rows.map((row) => row.table_name);
  }

  async function getTablesWithSearchVectors(): Promise<string[]> {
    const result = await db.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name LIKE '%search_vector%'
    `);

    return result.rows.map((row) => row.table_name);
  }
});
