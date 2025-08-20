#!/bin/bash

# Simple SQL syntax validation script
# Checks that our modified SQL files have valid syntax

echo "Validating SQL syntax for modified files..."

# Function to check SQL syntax using PostgreSQL parser
check_sql_file() {
    local file="$1"
    echo "Checking: $file"
    
    # Use pg_dump to validate SQL syntax (it parses the file)
    if command -v psql >/dev/null 2>&1; then
        # If psql is available, use it to check syntax
        psql --set ON_ERROR_STOP=1 --single-transaction --quiet \
             --file="$file" --dbname="postgresql:///" --dry-run 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✓ $file: Valid syntax"
            return 0
        else
            echo "✗ $file: Syntax error detected"
            return 1
        fi
    else
        # Basic validation - check for common syntax issues
        if grep -q "CREATE OR REPLACE FUNCTION\|CREATE FUNCTION" "$file" && \
           grep -q "END;" "$file" && \
           ! grep -q "thumbnail_video_id.*thumb_video" "$file"; then
            echo "✓ $file: Basic validation passed"
            return 0
        else
            echo "✗ $file: Basic validation failed"
            return 1
        fi
    fi
}

# Files to check
files=(
    "supabase/migrations/20250820000002_remove_thumbnail_video_id_foreign_key.sql"
    "supabase/migrations/20250721023810_08d_playlist_query_functions.sql"
    "supabase/migrations/20250721023811_08e_playlist_management_functions.sql"
    "supabase/migrations/20250814173410_15_image_processing.sql"
    "supabase/tests/12_thumbnail_video_id_removal.sql"
)

errors=0

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        if ! check_sql_file "$file"; then
            errors=$((errors + 1))
        fi
    else
        echo "✗ $file: File not found"
        errors=$((errors + 1))
    fi
done

echo ""
if [ $errors -eq 0 ]; then
    echo "✓ All SQL files passed validation"
    exit 0
else
    echo "✗ $errors file(s) failed validation"
    exit 1
fi