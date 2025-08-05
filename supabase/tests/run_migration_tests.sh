#!/bin/bash

# SQL Test Runner for Reorganized Migration Functions
# This script runs all the pgTAP tests for the functions created in the reorganized migrations

set -e

echo "============================================================================"
echo "Running SQL Tests for Reorganized Migration Functions"
echo "============================================================================"

# Database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-54322}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

# Test files to run
TEST_FILES=(
    "supabase/tests/test_user_functions.sql"
    "supabase/tests/test_video_functions.sql"
    "supabase/tests/test_playlist_query_functions.sql"
    "supabase/tests/test_playlist_management_functions.sql"
    "supabase/tests/test_triggers_and_cleanup.sql"
    "supabase/tests/test_trigger_edge_cases.sql"
)

# Check if Supabase is running
echo "Checking if Supabase is running..."
if ! nc -z $DB_HOST $DB_PORT; then
    echo "❌ Supabase is not running on $DB_HOST:$DB_PORT"
    echo "Please start it with: supabase start"
    exit 1
fi
echo "✓ Supabase is running"

# Test database connection
echo "Testing database connection..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null
echo "✓ Database connection successful"

# Check if pgTAP extension is available
echo "Checking for pgTAP extension..."
PGTAP_AVAILABLE=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgtap');" | tr -d ' ')

if [ "$PGTAP_AVAILABLE" = "t" ]; then
    echo "✓ pgTAP extension is available"
    USE_PGTAP=true
else
    echo "⚠️  pgTAP extension not found. Using simple SQL execution instead."
    USE_PGTAP=false
fi

# Function to run a single test file
run_test_file() {
    local test_file=$1
    local test_name=$(basename "$test_file" .sql)
    
    echo ""
    echo "Running $test_name..."
    echo "----------------------------------------"
    
    if [ "$USE_PGTAP" = true ] && command -v pg_prove &> /dev/null; then
        # Use pg_prove for pgTAP tests
        if pg_prove -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME "$test_file"; then
            echo "✓ $test_name PASSED"
            return 0
        else
            echo "❌ $test_name FAILED"
            return 1
        fi
    else
        # Use direct psql execution
        if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$test_file" > /tmp/test_output_$$.log 2>&1; then
            # Check for test failures in output
            if grep -q "FAIL\|ERROR\|EXCEPTION" /tmp/test_output_$$.log; then
                echo "❌ $test_name FAILED"
                echo "Error output:"
                cat /tmp/test_output_$$.log
                rm -f /tmp/test_output_$$.log
                return 1
            else
                echo "✓ $test_name PASSED"
                rm -f /tmp/test_output_$$.log
                return 0
            fi
        else
            echo "❌ $test_name FAILED"
            echo "Error output:"
            cat /tmp/test_output_$$.log
            rm -f /tmp/test_output_$$.log
            return 1
        fi
    fi
}

# Run all test files
total_tests=0
passed_tests=0
failed_tests=0

for test_file in "${TEST_FILES[@]}"; do
    if [ -f "$test_file" ]; then
        total_tests=$((total_tests + 1))
        if run_test_file "$test_file"; then
            passed_tests=$((passed_tests + 1))
        else
            failed_tests=$((failed_tests + 1))
        fi
    else
        echo "⚠️  Test file not found: $test_file"
    fi
done

# Print summary
echo ""
echo "============================================================================"
echo "Test Summary"
echo "============================================================================"
echo "Total test files: $total_tests"
echo "Passed: $passed_tests"
echo "Failed: $failed_tests"

if [ $failed_tests -eq 0 ]; then
    echo ""
    echo "🎉 All tests passed!"
    exit 0
else
    echo ""
    echo "❌ Some tests failed. Please check the output above."
    exit 1
fi