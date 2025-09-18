#!/bin/bash

# Test validation script for Bombastic Supabase RPC functions
# This script validates that all tests can be run and provides coverage reporting

set -e

echo "🧪 Bombastic SQL Test Validation"
echo "=================================="
echo

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first."
    echo "   curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz"
    exit 1
fi

echo "✅ Supabase CLI found: $(supabase --version)"
echo

# Count test files
TEST_DIR="supabase/tests"
TEST_COUNT=$(find $TEST_DIR -name "*.sql" -type f | wc -l)
echo "📁 Found $TEST_COUNT test files in $TEST_DIR"
echo

# List all test files
echo "📋 Test Files:"
find $TEST_DIR -name "*.sql" -type f | sort | while read -r file; do
    echo "   - $(basename $file)"
done
echo

# Check for key test files
echo "🔍 Checking for key test files..."
KEY_FILES=(
    "00_test_setup.sql"
    "14_user_management_functions.sql"
    "15_playlist_management_functions.sql"
    "16_video_tracking_functions.sql"
    "17_notification_system_functions.sql"
    "18_image_processing_functions.sql"
    "19_utility_functions.sql"
    "20_timestamp_and_data_functions.sql"
    "21_comprehensive_function_coverage.sql"
    "22_missing_function_tests.sql"
)

for file in "${KEY_FILES[@]}"; do
    if [ -f "$TEST_DIR/$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (missing)"
    fi
done
echo

# Count total test assertions
echo "🧮 Counting test assertions..."
TOTAL_ASSERTIONS=0
for file in $TEST_DIR/*.sql; do
    if [ -f "$file" ]; then
        # Count plan() calls and extract numbers
        PLAN_COUNT=$(grep -o "plan *([0-9]\+)" "$file" | grep -o "[0-9]\+" | head -1)
        if [ -n "$PLAN_COUNT" ]; then
            TOTAL_ASSERTIONS=$((TOTAL_ASSERTIONS + PLAN_COUNT))
            echo "   $(basename $file): $PLAN_COUNT tests"
        fi
    fi
done
echo "   📊 Total planned assertions: $TOTAL_ASSERTIONS"
echo

# Basic syntax validation
echo "🔧 Validating SQL syntax..."
SYNTAX_ERRORS=0
for file in $TEST_DIR/*.sql; do
    if [ -f "$file" ]; then
        # Basic SQL syntax check - look for unmatched BEGIN/ROLLBACK
        BEGIN_COUNT=$(grep -c "BEGIN;" "$file" 2>/dev/null || echo 0)
        ROLLBACK_COUNT=$(grep -c "ROLLBACK;" "$file" 2>/dev/null || echo 0)
        
        if [ "$BEGIN_COUNT" -ne "$ROLLBACK_COUNT" ]; then
            echo "   ⚠️  $(basename $file): Unmatched BEGIN/ROLLBACK ($BEGIN_COUNT/$ROLLBACK_COUNT)"
            SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
        else
            echo "   ✅ $(basename $file): SQL structure looks good"
        fi
    fi
done

if [ $SYNTAX_ERRORS -eq 0 ]; then
    echo "   ✅ All files passed basic syntax validation"
else
    echo "   ⚠️  $SYNTAX_ERRORS files have potential syntax issues"
fi
echo

# Function coverage analysis
echo "🎯 Analyzing function coverage..."
if [ -d "supabase/migrations" ]; then
    MIGRATION_FUNCTIONS=$(grep -h "CREATE OR REPLACE FUNCTION" supabase/migrations/*.sql 2>/dev/null | wc -l || echo 0)
    echo "   📈 Functions in migrations: $MIGRATION_FUNCTIONS"
    
    # Count has_function calls in tests
    TEST_FUNCTIONS=$(grep -h "has_function" $TEST_DIR/*.sql 2>/dev/null | wc -l || echo 0)
    echo "   🧪 Function existence tests: $TEST_FUNCTIONS"
    
    if [ $MIGRATION_FUNCTIONS -gt 0 ] && [ $TEST_FUNCTIONS -gt 0 ]; then
        COVERAGE_PERCENT=$((TEST_FUNCTIONS * 100 / MIGRATION_FUNCTIONS))
        echo "   📊 Estimated coverage: ~${COVERAGE_PERCENT}%"
    fi
else
    echo "   ⚠️  Migration directory not found"
fi
echo

echo "📋 Summary"
echo "=========="
echo "   • Test files: $TEST_COUNT"
echo "   • Total assertions: $TOTAL_ASSERTIONS"
echo "   • Syntax issues: $SYNTAX_ERRORS"
echo "   • Function tests: $TEST_FUNCTIONS"
echo

if [ $SYNTAX_ERRORS -eq 0 ]; then
    echo "🎉 Test suite validation completed successfully!"
    echo "   Ready to run: supabase db test"
else
    echo "⚠️  Please fix syntax issues before running tests"
    exit 1
fi