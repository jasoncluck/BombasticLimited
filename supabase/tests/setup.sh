#!/bin/bash

# SQL Testing Setup Script for Bombify
# This script helps set up the SQL testing environment

set -e

echo "============================================================================"
echo "Setting up SQL Unit Testing for Bombify"
echo "============================================================================"

# Check if Supabase is running
echo "Checking if Supabase is running..."
if ! nc -z localhost 54322; then
    echo "❌ Supabase is not running. Please start it with: supabase start"
    exit 1
fi
echo "✓ Supabase is running"

# Check if pg_prove is available (for pgTAP tests)
echo "Checking for pg_prove (pgTAP test runner)..."
if command -v pg_prove &> /dev/null; then
    echo "✓ pg_prove is available"
    PGTAP_AVAILABLE=true
else
    echo "⚠️  pg_prove not found. pgTAP tests will not be available."
    echo "   To install pg_prove, run: sudo apt-get install libtap-parser-sourcehandler-pgtap-perl"
    echo "   Or on macOS: brew install tap-parser-sourcehandler-pgtap"
    PGTAP_AVAILABLE=false
fi

# Apply migrations to ensure pgTAP extension is available
echo "Applying database migrations..."
cd "$(dirname "$0")/../.."
supabase db reset

# Test database connection
echo "Testing database connection..."
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT 1;" > /dev/null
echo "✓ Database connection successful"

if [ "$PGTAP_AVAILABLE" = true ]; then
    # Check if pgTAP extension is available
    echo "Checking if pgTAP extension is installed..."
    if PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT 1 FROM pg_extension WHERE extname = 'pgtap';" | grep -q 1; then
        echo "✓ pgTAP extension is installed"
        
        # Run pgTAP tests
        echo "Running pgTAP-based SQL tests..."
        pg_prove -h localhost -p 54322 -U postgres -d postgres supabase/tests/test_soft_delete_functions.sql
        
    else
        echo "⚠️  pgTAP extension not available in this PostgreSQL installation"
        echo "   Falling back to simple test runner..."
        PGTAP_AVAILABLE=false
    fi
fi

if [ "$PGTAP_AVAILABLE" = false ]; then
    # Run simple tests
    echo "Running simple SQL tests..."
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/test_soft_delete_simple.sql
fi

echo "============================================================================"
echo "SQL Testing Setup Complete!"
echo ""
echo "Available test commands:"
echo "  npm run test:sql         - Run all pgTAP tests"
echo "  npm run test:sql:single  - Run specific test file"
echo ""
echo "Manual test commands:"
echo "  # Run simple tests without pgTAP:"
echo "  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/test_soft_delete_simple.sql"
echo ""
echo "  # Run pgTAP tests (if available):"
echo "  pg_prove -h localhost -p 54322 -U postgres -d postgres supabase/tests/*.sql"
echo "============================================================================"