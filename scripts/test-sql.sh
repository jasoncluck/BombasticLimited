#!/bin/bash

# SQL Test Runner
# This script runs SQL tests with appropriate configuration

echo "🔍 Running SQL Tests for Bombastic"
echo "================================="

# Check if Supabase is available
if curl -f http://localhost:54322 >/dev/null 2>&1; then
    echo "✅ Supabase database is available at localhost:54322"
    echo ""
else
    echo "⚠️  Supabase database not available at localhost:54322"
    echo "   Tests requiring database connection will be skipped"
    echo "   To run full tests, start Supabase with: supabase start"
    echo ""
fi

# Run syntax validation tests (don't require database)
echo "📝 Running syntax validation tests..."
npm run test:sql:syntax -- --reporter=verbose --run

if [ $? -eq 0 ]; then
    echo "✅ Syntax validation tests passed"
else
    echo "❌ Syntax validation tests failed"
    exit 1
fi

echo ""

# Run other SQL tests if database is available
if curl -f http://localhost:54322 >/dev/null 2>&1; then
    echo "🗄️  Running migration tests..."
    npm run test:sql:migration -- --reporter=verbose --run
    
    echo ""
    echo "⚙️  Running functional tests..."
    npm run test:sql:functional -- --reporter=verbose --run
    
    echo ""
    echo "🔗 Running integration tests..."
    npm run test:sql:integration -- --reporter=verbose --run
    
    echo ""
    echo "🎯 Running all SQL tests together..."
    npm run test:sql -- --reporter=verbose --run
else
    echo "⏭️  Skipping database-dependent tests (database not available)"
fi

echo ""
echo "🏁 SQL test run complete"