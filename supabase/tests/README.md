# SQL Unit Testing Framework

This directory contains SQL unit tests for the Bombify database functions and procedures.

## Recommended Approach

After researching the most recommended libraries for SQL unit testing in PostgreSQL/Supabase environments, we've chosen **pgTAP** as our testing framework because:

### Why pgTAP?

1. **Native PostgreSQL Support**: pgTAP is built specifically for PostgreSQL and works seamlessly with Supabase
2. **TAP Protocol**: Uses the Test Anything Protocol (TAP), which is widely supported and can integrate with existing CI/CD pipelines
3. **Comprehensive Assertions**: Provides extensive assertion functions for database testing
4. **Active Community**: Well-maintained with good documentation and community support
5. **Supabase Compatible**: Works with Supabase local development environment

### Alternative Approaches Considered

1. **PL/pgSQL Unit Testing**: Custom functions using RAISE NOTICE - good for simple tests but lacks standardization
2. **Jest/Vitest with Database Connections**: JavaScript-based testing - good for integration tests but less suited for pure SQL logic testing
3. **Database-specific frameworks**: Various options exist but pgTAP is the most mature for PostgreSQL

## Setup Instructions

### Prerequisites

1. **Supabase CLI**: Install from https://supabase.com/docs/reference/cli
2. **PostgreSQL Client**: Ensure `psql` is available
3. **pgTAP (Optional)**: For advanced testing, install pg_prove:
   - Ubuntu/Debian: `sudo apt-get install libtap-parser-sourcehandler-pgtap-perl`
   - macOS: `brew install tap-parser-sourcehandler-pgtap`

### Quick Setup

Run the setup script to get started:

```bash
chmod +x supabase/tests/setup.sh
./supabase/tests/setup.sh
```

### Manual Setup

1. **Start Supabase**: `supabase start`
2. **Apply Migrations**: `supabase db reset` (includes pgTAP extension)
3. **Run Tests**:

**Option A: Simple Tests (No dependencies)**
```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/test_soft_delete_simple.sql
```

**Option B: pgTAP Tests (Requires pg_prove)**
```bash
pg_prove -h localhost -p 54322 -U postgres -d postgres supabase/tests/test_soft_delete_functions.sql
```

**Option C: Using npm scripts**
```bash
npm run test:sql              # Run all pgTAP tests
npm run test:sql:single supabase/tests/test_soft_delete_functions.sql
```

## Test Structure

Each test file should follow this structure:

### pgTAP Tests

```sql
-- Start transaction and plan tests
BEGIN;
SELECT plan(N); -- Replace N with number of tests

-- Your tests here using pgTAP functions
SELECT ok(condition, 'test description');
SELECT is(actual, expected, 'test description');

-- Finish tests
SELECT * FROM finish();
ROLLBACK;
```

### Simple Tests (No pgTAP)

```sql
DO $$
DECLARE
  test_passed boolean := true;
  test_count int := 0;
  passed_count int := 0;
BEGIN
  -- Test 1
  test_count := test_count + 1;
  IF condition THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test description';
  ELSE
    RAISE NOTICE 'FAIL: Test description';
    test_passed := false;
  END IF;
  
  -- Summary
  RAISE NOTICE 'Summary: % of % tests passed', passed_count, test_count;
END $$;
```

## Test Categories

### 1. Function Testing
Test individual database functions with various inputs:

```sql
-- Test function returns expected value
SELECT is(
  public.my_function('input'),
  'expected_output',
  'Function returns correct value for valid input'
);

-- Test function handles edge cases
SELECT is(
  public.my_function(NULL),
  NULL,
  'Function handles NULL input correctly'
);
```

### 2. Data Integrity Testing
Test constraints, triggers, and data validation:

```sql
-- Test foreign key constraints
SELECT throws_ok(
  'INSERT INTO child_table (parent_id) VALUES (999)',
  '23503',  -- Foreign key violation error code
  'Foreign key constraint prevents invalid parent_id'
);
```

### 3. Business Logic Testing
Test complex business rules and workflows:

```sql
-- Test soft delete workflow (from our example)
-- 1. Create test data
-- 2. Perform operation
-- 3. Verify state changes
-- 4. Test edge cases
-- 5. Cleanup
```

## Best Practices

1. **Use Transactions**: Wrap tests in transactions and ROLLBACK for cleanup
2. **Isolate Tests**: Each test should be independent and not rely on others
3. **Test Edge Cases**: Include NULL values, empty strings, boundary conditions
4. **Clear Messages**: Use descriptive test names and failure messages
5. **Setup and Teardown**: Create and clean up test data properly
6. **Performance**: Consider testing query performance for critical functions

## Example Test File

See `test_soft_delete_functions.sql` for a complete example testing the soft delete functionality.