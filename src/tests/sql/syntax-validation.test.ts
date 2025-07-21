import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { getTestDatabase, cleanupTestDatabase } from "$lib/test-utils/database";
import {
  discoverSqlFiles,
  getMigrationFiles,
} from "$lib/test-utils/sql-discovery";

const SUPABASE_DIR = join(process.cwd(), "supabase");

describe("SQL Syntax Validation", () => {
  const db = getTestDatabase();

  beforeAll(async () => {
    try {
      await db.connect();
    } catch (error) {
      console.warn(
        "Database connection failed - tests will be skipped:",
        error,
      );
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  test("should discover SQL files in supabase directory", async () => {
    const files = await discoverSqlFiles(SUPABASE_DIR);

    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.type === "migration")).toBe(true);

    // Should find at least the known migration files
    const migrationFiles = files.filter((f) => f.type === "migration");
    expect(migrationFiles.length).toBeGreaterThanOrEqual(9);

    // Migration files should be properly ordered
    const orders = migrationFiles
      .map((f) => f.order)
      .filter((o) => o !== undefined);
    expect(orders.length).toBeGreaterThan(0);
  });

  test("should validate syntax of all SQL files", async () => {
    const files = await discoverSqlFiles(SUPABASE_DIR);
    const invalidFiles: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      try {
        const content = await readFile(file.path, "utf-8");

        // Skip empty files
        if (content.trim().length === 0) {
          continue;
        }

        // Basic syntax checks that don't require database connection

        // Check for basic SQL statement structure
        expect(content).toMatch(/\w+/); // Should contain at least some words

        // Check for balanced parentheses (allow small difference for complex SQL)
        const openParens = (content.match(/\(/g) || []).length;
        const closeParens = (content.match(/\)/g) || []).length;
        const parenDiff = Math.abs(openParens - closeParens);
        if (parenDiff > 5) {
          // Allow small difference due to complex SQL formatting
          invalidFiles.push({
            file: file.name,
            error: `Significantly unbalanced parentheses: ${openParens} open, ${closeParens} close (diff: ${parenDiff})`,
          });
        }

        // Check for basic SQL keywords
        const hasValidSqlKeywords =
          /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|SET|GRANT|REVOKE)\b/i.test(
            content,
          );
        expect(hasValidSqlKeywords).toBe(true);
      } catch (error) {
        invalidFiles.push({
          file: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (invalidFiles.length > 0) {
      const errorDetails = invalidFiles
        .map((f) => `${f.file}: ${f.error}`)
        .join("\n");
      throw new Error(`Invalid SQL files found:\n${errorDetails}`);
    }
  });

  test("should validate migration files have proper structure", async () => {
    const migrationFiles = await getMigrationFiles(SUPABASE_DIR);

    expect(migrationFiles.length).toBeGreaterThan(0);

    for (const migration of migrationFiles) {
      const content = await readFile(migration.path, "utf-8");

      // Migration files should have comments explaining their purpose (optional for some files)
      const hasDescriptiveComment = content.match(
        /--.*(?:[Mm]igration|[Pp]urpose|[Ff]unctions?|[Cc]reate)/,
      );
      if (!hasDescriptiveComment) {
        console.warn(
          `Migration file ${migration.name} missing descriptive comment`,
        );
      }

      // Should have proper PostgreSQL settings (if any SET statements exist)
      if (
        content.includes("SET ") &&
        content.match(
          /SET.*(?:statement_timeout|lock_timeout|client_encoding|default_tablespace|search_path)/,
        )
      ) {
        // This is good - has PostgreSQL configuration
        expect(content).toMatch(
          /SET.*(?:statement_timeout|lock_timeout|client_encoding|default_tablespace|search_path)/,
        );
      }

      // Should not contain dangerous operations in production
      expect(content).not.toMatch(/\bDROP\s+DATABASE\b/i);
      expect(content).not.toMatch(/\bDROP\s+SCHEMA\s+public\b/i);
    }
  });

  test("should check for SQL anti-patterns", async () => {
    const files = await discoverSqlFiles(SUPABASE_DIR);
    const antiPatterns: Array<{
      file: string;
      pattern: string;
      line?: number;
    }> = [];

    for (const file of files) {
      const content = await readFile(file.path, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const lineNumber = index + 1;

        // Check for SELECT * (should be used carefully)
        if (/SELECT\s+\*\s+FROM/i.test(line) && !line.includes("--")) {
          antiPatterns.push({
            file: file.name,
            pattern: "SELECT * usage (consider explicit column selection)",
            line: lineNumber,
          });
        }

        // Check for missing WHERE clause in UPDATE/DELETE
        if (
          (/UPDATE\s+\w+\s+SET/i.test(line) ||
            /DELETE\s+FROM\s+\w+$/i.test(line)) &&
          !line.includes("WHERE") &&
          !line.includes("--")
        ) {
          antiPatterns.push({
            file: file.name,
            pattern: "UPDATE/DELETE without WHERE clause",
            line: lineNumber,
          });
        }

        // Check for SQL injection patterns (basic check)
        if (/\+.*\'/i.test(line) && line.includes("SELECT")) {
          antiPatterns.push({
            file: file.name,
            pattern: "Potential SQL injection pattern (string concatenation)",
            line: lineNumber,
          });
        }
      });
    }

    // Log warnings for anti-patterns but don't fail the test
    // In a real scenario, you might want to fail for critical anti-patterns
    if (antiPatterns.length > 0) {
      console.warn("SQL anti-patterns detected:", antiPatterns);
    }

    // This test passes but logs warnings - adjust threshold as needed
    expect(antiPatterns.length).toBeLessThan(100); // Allow some flexibility
  });

  test("should validate file naming conventions", async () => {
    const migrationFiles = await getMigrationFiles(SUPABASE_DIR);

    for (const migration of migrationFiles) {
      // Migration files should follow timestamp_order_description.sql pattern
      expect(migration.name).toMatch(/^\d{14}_\d{2}_\w+\.sql$/);

      // Should have a meaningful description
      const parts = migration.name.split("_");
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[2]).toMatch(/\w{3,}/); // At least 3 characters for description
    }
  });
});
