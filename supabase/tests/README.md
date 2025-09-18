# Bombastic Supabase pgTAP Tests

This directory contains comprehensive pgTAP tests for all RPC functions in the
Bombastic application's Supabase backend.

## Overview

The test suite validates the functionality of 66+ RPC functions across 10 test
files, providing over 218 individual test assertions covering:

- Function existence and signature validation
- Functional testing with realistic data
- Edge case handling (null inputs, invalid data)
- Error condition testing
- Data consistency validation
- Trigger function testing

## Test Files

### Core Test Files (Pre-existing)

- `00_test_setup.sql` - pgTAP setup and basic sanity checks
- `01_extensions_and_types.sql` - Database extensions and custom types
- `02_core_functions.sql` - Core database functions
- `03_base_tables.sql` - Table structure validation
- `04_user_profile_functions.sql` - User profile management
- `05_video_query_functions.sql` - Video search and retrieval
- `06_playlist_query_functions.sql` - Playlist search and retrieval
- `07_timestamp_functions.sql` - Timestamp management
- `08_trigger_functions.sql` - Database triggers
- `09_row_level_security.sql` - RLS policies
- `10_integration_tests.sql` - Cross-system integration
- `11_search_path_security_fixes.sql` - Security patches
- `12_thumbnail_video_id_removal.sql` - Data cleanup
- `13_playlist_video_reordering.sql` - Playlist management

### New Comprehensive Test Files

- `14_user_management_functions.sql` - User lifecycle and authentication (20
  tests)
- `15_playlist_management_functions.sql` - Playlist CRUD and permissions (25
  tests)
- `16_video_tracking_functions.sql` - Video analytics and history (18 tests)
- `17_notification_system_functions.sql` - Notification management (15 tests)
- `18_image_processing_functions.sql` - Image processing pipeline (18 tests)
- `19_utility_functions.sql` - Helper and utility functions (22 tests)
- `20_timestamp_and_data_functions.sql` - Data management and cleanup (15 tests)
- `21_comprehensive_function_coverage.sql` - Complete coverage validation (50
  tests)
- `22_missing_function_tests.sql` - Additional function tests and edge cases (45
  tests)
- `run_all_tests.sql` - Test infrastructure validation (10 tests)

## Running Tests

### Using Supabase CLI (Recommended)

```bash
# Start local Supabase environment
supabase start

# Run all tests
supabase db test

# Run all tests in sequence with comprehensive reporting
supabase db test --file tests/run_all_tests.sql
supabase db test --file tests/21_comprehensive_function_coverage.sql
supabase db test --file tests/22_missing_function_tests.sql

# Run complete test suite (all files)
find tests/ -name "*.sql" -type f | sort | xargs -I {} supabase db test --file {}
```

### Manual PostgreSQL Testing

```bash
# Start PostgreSQL and create test database
sudo service postgresql start
sudo -u postgres createdb testdb

# Install pgTAP extension
sudo -u postgres psql -d testdb -c "CREATE EXTENSION pgtap;"

# Run individual test file
sudo -u postgres psql -d testdb -f tests/14_user_management_functions.sql
```

## Test Coverage

### User Management Functions (14_user_management_functions.sql)

- ✅ `is_unique_username` - Username uniqueness validation
- ✅ `generate_unique_username` - Unique username generation with collision
  handling
- ✅ `create_user` - User creation with email normalization and idempotency
- ✅ `confirm_user` - Email confirmation and profile creation
- ✅ `delete_user` - User deletion and cleanup

**Key Test Scenarios:**

- Case-insensitive username checking
- Special character cleaning in usernames
- Duplicate email handling
- Profile creation after email confirmation

### Playlist Management Functions (15_playlist_management_functions.sql)

- ✅ `insert_playlist` - Playlist creation
- ✅ `delete_playlist` - Playlist deletion with soft delete
- ✅ `can_user_access_playlist` - Access control validation
- ✅ `follow_playlist` / `unfollow_playlist` - Social following system
- ✅ `get_user_playlists` - User playlist retrieval
- ✅ `update_playlist_duration` / `calculate_playlist_duration` - Duration
  calculations
- ✅ `get_playlist_data` - Playlist information retrieval

**Key Test Scenarios:**

- Duration calculation accuracy with real video data
- Public vs private playlist access
- Playlist cleanup queue management
- Video position management

### Video Tracking Functions (16_video_tracking_functions.sql)

- ✅ `increment_video_views` - View count tracking
- ✅ `auto_record_video_history` - Automatic history recording
- ✅ `get_user_video_history` - History retrieval
- ✅ `get_video_analytics` - Analytics data
- ✅ `calculate_seconds_watched` - Watch time calculations
- ✅ Video history session management

**Key Test Scenarios:**

- View count increment with non-existent videos
- Time calculation accuracy and edge cases
- History session lifecycle management

### Notification System Functions (17_notification_system_functions.sql)

- ✅ `create_notification` - Individual and broadcast notifications
- ✅ `get_user_notifications` - Notification retrieval with timing
- ✅ `mark_notifications_as_read` - Read status management
- ✅ `get_unread_notification_count` - Unread count tracking
- ✅ `cleanup_expired_notifications` - Automatic cleanup
- ✅ `is_admin` - Admin privilege checking

**Key Test Scenarios:**

- Notification expiration handling
- Admin-only functions
- Bulk notification operations

### Image Processing Functions (18_image_processing_functions.sql)

- ✅ `queue_image_processing_job` - Job queue management
- ✅ `get_next_image_processing_job` - Job processing workflow
- ✅ `complete_image_processing_job` / `fail_image_processing_job` - Job
  completion
- ✅ `hash_image_properties` - Image property hashing
- ✅ `reset_stuck_image_processing_jobs` - Error recovery
- ✅ `cleanup_old_completed_jobs` - Maintenance

**Key Test Scenarios:**

- Hash consistency and uniqueness
- Stuck job recovery mechanisms
- Job status transitions

### Utility Functions (19_utility_functions.sql)

- ✅ `normalize_search_term` - Text normalization for search
- ✅ `duration_to_seconds` - Time format conversion
- ✅ `get_discord_avatar_url` - Discord integration
- ✅ `select_best_image_format` - Image format optimization
- ✅ Various helper and formatting functions

**Key Test Scenarios:**

- Text normalization edge cases (empty, null, special characters)
- Time format parsing accuracy
- URL generation consistency

### Timestamp & Data Management Functions (20_timestamp_and_data_functions.sql)

- ✅ `insert_timestamp` / `insert_timestamps` - Timestamp creation
- ✅ `update_timestamp` - Timestamp modification
- ✅ `delete_timestamps` - Timestamp removal
- ✅ `delete_pending_videos` - Data cleanup
- ✅ `update_updated_at_column` - Automatic timestamp triggers

**Key Test Scenarios:**

- Batch timestamp operations
- Trigger function validation
- Data cleanup effectiveness

### New Comprehensive Coverage Tests (21_comprehensive_function_coverage.sql)

- ✅ All functions from recent migrations (August-September 2025)
- ✅ Complete validation of 50+ core RPC functions
- ✅ Signature verification for all major function categories
- ✅ Coverage of newest playlist soft-delete functionality
- ✅ Image processing pipeline validation
- ✅ Notification system completeness check

**Key Test Scenarios:**

- Complete migration function coverage
- Signature validation for all recent functions
- Systematic validation of all major functional areas

### Missing Function Tests (22_missing_function_tests.sql)

- ✅ Edge case testing for utility functions
- ✅ Functional behavior validation with realistic data
- ✅ Performance and error handling tests
- ✅ Integration tests for cross-system functionality
- ✅ Comprehensive validation of search and normalization

**Key Test Scenarios:**

- Text normalization edge cases (empty, null, special characters)
- Time format parsing accuracy with multiple formats
- Username uniqueness validation
- Video view counting accuracy
- URL generation consistency

## Test Patterns

### Function Existence Tests

```sql
SELECT has_function(
    'public',
    'function_name',
    ARRAY['param_type1', 'param_type2'],
    'Function should exist with correct signature'
);
```

### Functional Tests with Data

```sql
-- Create test data
INSERT INTO table (columns) VALUES (test_values);

-- Test function behavior
SELECT ok(
    function_call() = expected_result,
    'Function should produce expected result'
);
```

### Edge Case Testing

```sql
-- Test null inputs
SELECT ok(
    function_call(null) = expected_null_behavior,
    'Function should handle null input gracefully'
);

-- Test empty inputs
SELECT ok(
    function_call('') = expected_empty_behavior,
    'Function should handle empty input correctly'
);
```

## Transaction Safety

All tests use `BEGIN` and `ROLLBACK` to ensure:

- Test isolation (no side effects between tests)
- Database state preservation
- Ability to run tests multiple times safely

## Contributing

When adding new RPC functions:

1. Add function existence test using `has_function()`
2. Create realistic test data for functional testing
3. Test common edge cases (null, empty, invalid inputs)
4. Validate error handling behavior
5. Use descriptive test messages
6. Follow the established naming pattern

## Maintenance

- Tests should be updated when RPC function signatures change
- New functions should have corresponding tests added
- Test data should remain realistic and relevant
- Edge cases discovered in production should be added to tests
