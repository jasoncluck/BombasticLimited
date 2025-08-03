# SQL Testing Framework

This document describes the comprehensive SQL testing framework implemented for
the Bombify project. The framework provides automated testing for all SQL files
in the supabase directory, ensuring database migrations, functions, and schema
changes are properly validated.

## Overview

The SQL testing framework consists of four main categories of tests:

1. **Syntax Validation Tests** - Verify SQL files have correct syntax and follow
   best practices
2. **Migration Tests** - Test database migration application and rollback
   procedures
3. **Functional Tests** - Test database functions, triggers, constraints, and
   RLS policies
4. **Integration Tests** - Test complete migration sequences and cross-table
   relationships

## Test Structure

```
src/
├── lib/test-utils/
│   ├── database.ts           # Database connection and utility functions
│   └── sql-discovery.ts      # SQL file discovery and classification
└── tests/sql/
    ├── syntax-validation.test.ts  # Syntax and best practice validation
    ├── migration.test.ts          # Migration application testing
    ├── functional.test.ts         # Database function and feature testing
    └── integration.test.ts        # End-to-end integration testing
```

## Prerequisites

### Database Requirements

The tests require a running Supabase local development environment:

1. **Start Supabase locally:**

   ```bash
   supabase start
   ```

2. **Verify database connection:**
   - Host: localhost
   - Port: 54322 (configured in supabase/config.toml)
   - Database: postgres
   - User: postgres
   - Password: postgres

### Dependencies

The following packages are required (already installed):

- `pg` - PostgreSQL client for Node.js
- `@types/pg` - TypeScript definitions for pg
- `vitest` - Test framework (existing)

## Running Tests

### Run All SQL Tests

```bash
npm run test:sql
```

### Run Individual Test Categories

```bash
# Syntax validation only
npm run test:sql:syntax

# Migration tests only
npm run test:sql:migration

# Functional tests only
npm run test:sql:functional

# Integration tests only
npm run test:sql:integration
```

### Run with Coverage

```bash
npm run test:coverage -- src/tests/sql
```

## Test Categories

### 1. Syntax Validation Tests

**File:** `src/tests/sql/syntax-validation.test.ts`

**Purpose:** Validate SQL file syntax and coding standards

**Tests Include:**

- SQL file discovery and classification
- Basic syntax validation (balanced parentheses, SQL keywords)
- Migration file structure validation
- SQL anti-pattern detection
- File naming convention validation

**Example Test:**

```typescript
test('should validate syntax of all SQL files', async () => {
  const files = await discoverSqlFiles(SUPABASE_DIR);
  // Validates each file for basic syntax issues
});
```

### 2. Migration Tests

**File:** `src/tests/sql/migration.test.ts`

**Purpose:** Test database migration application and verification

**Tests Include:**

- Migration file ordering validation
- Individual migration application
- Sequential migration application
- Schema validation after migrations
- Idempotent migration handling
- Foreign key relationship validation

**Example Test:**

```typescript
test('should apply all migrations sequentially without errors', async () => {
  for (const migration of migrationFiles) {
    const content = await readFile(migration.path, 'utf-8');
    await db.query(content);
  }
  // Verifies all migrations apply successfully
});
```

### 3. Functional Tests

**File:** `src/tests/sql/functional.test.ts`

**Purpose:** Test database functions, triggers, and constraints

**Tests Include:**

- Database function existence and callability
- Row Level Security (RLS) policy validation
- Table constraints and relationships
- Database trigger functionality
- CRUD operations on core tables
- Search functionality validation
- Enum type validation
- Database index validation

**Example Test:**

```typescript
test('should test RLS policies are properly configured', async () => {
  const rlsResult = await db.query(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' AND rowsecurity = true
  `);
  expect(rlsResult.rows.length).toBeGreaterThan(0);
});
```

### 4. Integration Tests

**File:** `src/tests/sql/integration.test.ts`

**Purpose:** Test complete database lifecycle and cross-table operations

**Tests Include:**

- Complete migration sequence application
- Seed data loading
- Cross-table data integrity
- Timestamp and audit functionality
- Search functionality integration
- Performance testing with larger datasets
- Cascade operation testing

**Example Test:**

```typescript
test('should test cross-table data integrity', async () => {
  // Creates test data across related tables
  // Verifies relationships and referential integrity
});
```

## Utility Functions

### DatabaseTestUtils Class

Located in `src/lib/test-utils/database.ts`

**Key Methods:**

- `connect()` / `disconnect()` - Database connection management
- `query(sql, params)` - Execute SQL queries
- `executeFile(filePath)` - Execute SQL files
- `tableExists(tableName)` - Check table existence
- `functionExists(functionName)` - Check function existence
- `extensionExists(extensionName)` - Check extension installation
- `getRowCount(tableName)` - Get table row counts
- `clearTable(tableName)` - Clear table data
- `resetDatabase()` - Reset to clean state
- `validateSyntax(sql)` - Validate SQL syntax

### SQL Discovery Functions

Located in `src/lib/test-utils/sql-discovery.ts`

**Key Functions:**

- `discoverSqlFiles(supabaseDir)` - Find all SQL files
- `getMigrationFiles(supabaseDir)` - Get migration files in order
- `getSeedFiles(supabaseDir)` - Get seed files
- `getFunctionFiles(supabaseDir)` - Get function files

## Configuration

### Database Configuration

Default test database configuration (can be overridden):

```typescript
export const DEFAULT_TEST_CONFIG: DatabaseTestConfig = {
  host: 'localhost',
  port: 54322, // Supabase local DB port
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};
```

### Test Environment Variables

Set these environment variables to customize test behavior:

```bash
# Override database connection
TEST_DB_HOST=localhost
TEST_DB_PORT=54322
TEST_DB_NAME=postgres
TEST_DB_USER=postgres
TEST_DB_PASSWORD=postgres

# Enable verbose logging
VITEST_LOG_LEVEL=verbose
```

## Adding New Tests

### Adding Tests for New SQL Files

1. **Place SQL files** in the appropriate supabase directory
2. **Follow naming conventions** for automatic discovery:
   - Migrations: `YYYYMMDDHHMMSS_NN_description.sql`
   - Seeds: `*seed*.sql`
   - Functions: `*function*.sql` or `*proc*.sql`

3. **Tests will automatically include** new files in discovery and validation

### Adding Custom Test Cases

1. **Create new test file** in `src/tests/sql/`
2. **Follow existing patterns:**

   ```typescript
   import { describe, test, expect, beforeAll, afterAll } from 'vitest';
   import {
     getTestDatabase,
     cleanupTestDatabase,
   } from '$lib/test-utils/database';

   describe('Custom SQL Tests', () => {
     const db = getTestDatabase();

     beforeAll(async () => {
       await db.connect();
     });

     afterAll(async () => {
       await cleanupTestDatabase();
     });

     test('should test custom functionality', async () => {
       // Your test logic here
     });
   });
   ```

3. **Add test script** to package.json if needed

## Troubleshooting

### Common Issues

**1. Database Connection Failed**

```
Error: Connection failed - tests will be skipped
```

**Solution:** Ensure Supabase is running locally with `supabase start`

**2. Migration Apply Failed**

```
Error: Migration errors: 01_extensions.sql: permission denied
```

**Solution:** Check database permissions and ensure test database is clean

**3. Tests Timeout**

```
Error: Test timeout after 5000ms
```

**Solution:** Increase timeout in vitest config or optimize slow queries

**4. Table Does Not Exist**

```
Error: relation "videos" does not exist
```

**Solution:** Ensure migrations are applied before functional tests

### Debugging Tests

1. **Enable verbose logging:**

   ```bash
   npm run test:sql -- --reporter=verbose
   ```

2. **Run individual test files:**

   ```bash
   npm run test:sql:syntax -- --reporter=verbose
   ```

3. **Check database state:**

   ```bash
   supabase db reset
   supabase start
   ```

4. **Inspect test database:**
   ```bash
   psql -h localhost -p 54322 -U postgres -d postgres
   ```

## Best Practices

### For SQL Files

1. **Use IF NOT EXISTS** for idempotent operations
2. **Include descriptive comments** in migration files
3. **Follow naming conventions** for automatic discovery
4. **Avoid destructive operations** in migrations
5. **Use proper transaction handling**

### For Tests

1. **Keep tests independent** - each test should clean up after itself
2. **Use descriptive test names** that explain what is being tested
3. **Handle database unavailability gracefully** with try/catch blocks
4. **Test both success and failure scenarios**
5. **Keep performance tests realistic** but not resource-intensive

### For CI/CD

1. **Ensure database is available** in CI environment
2. **Run tests in isolation** to avoid conflicts
3. **Use test-specific database** separate from development
4. **Include SQL tests** in automated test suites
5. **Monitor test performance** and adjust timeouts as needed

## Maintenance

### Regular Tasks

1. **Update tests** when adding new SQL files
2. **Review test coverage** for new database features
3. **Monitor test performance** and optimize slow tests
4. **Update documentation** when adding new test categories
5. **Review and update** test thresholds and expectations

### Database Schema Changes

When database schema changes:

1. **Update migration tests** to reflect new structure
2. **Add functional tests** for new features
3. **Update integration tests** for new relationships
4. **Verify test data** still works with new schema
5. **Update utility functions** if needed

This framework provides comprehensive coverage for SQL testing while being
maintainable and extensible for future database changes.
