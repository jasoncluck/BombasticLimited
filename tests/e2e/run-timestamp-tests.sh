#!/bin/bash

# Test runner script for timestamp E2E tests
# Usage: ./run-timestamp-tests.sh [options]

set -e

echo "🎬 Running Timestamp E2E Tests"
echo "================================"

# Check if required dependencies are available
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js and npm."
    exit 1
fi

# Default options
RUN_MODE="normal"
BROWSER="chromium"
HEADED=false
DEBUG=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --headed)
            HEADED=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --browser)
            BROWSER="$2"
            shift 2
            ;;
        --ui)
            RUN_MODE="ui"
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --headed     Run tests in headed mode (visible browser)"
            echo "  --debug      Run tests in debug mode"
            echo "  --ui         Run tests with Playwright UI"
            echo "  --browser    Specify browser (chromium, firefox, webkit)"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "📋 Configuration:"
echo "  Browser: $BROWSER"
echo "  Headed: $HEADED"
echo "  Debug: $DEBUG"
echo "  Mode: $RUN_MODE"
echo ""

# Build command
CMD="npx playwright test"

# Add test file patterns
CMD="$CMD --grep \"timestamp|continue watching|video.*context|video.*dropdown\""

# Add browser selection
CMD="$CMD --project=$BROWSER"

# Add mode-specific options
if [ "$RUN_MODE" = "ui" ]; then
    CMD="$CMD --ui"
elif [ "$DEBUG" = true ]; then
    CMD="$CMD --debug"
elif [ "$HEADED" = true ]; then
    CMD="$CMD --headed"
fi

echo "🚀 Running command: $CMD"
echo ""

# Run the tests
eval $CMD

echo ""
echo "✅ Timestamp tests completed!"
echo ""
echo "📊 To view the test report:"
echo "   npx playwright show-report"
echo ""
echo "🎥 To run specific timestamp test scenarios:"
echo "   npx playwright test timestamp.test.ts --headed"
echo "   npx playwright test timestamp-behavior.test.ts --debug"