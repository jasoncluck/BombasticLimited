#!/bin/bash

# Playlist E2E Test Runner
# Convenient script to run all playlist-related E2E tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test files
PLAYLIST_OPERATIONS="tests/e2e/playlist-operations.test.ts"
PLAYLIST_BEHAVIOR="tests/e2e/playlist-behavior.test.ts"
SIDEBAR_SOURCES="tests/e2e/sidebar-sources.test.ts"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run comprehensive playlist E2E tests"
    echo ""
    echo "Options:"
    echo "  --headed              Run tests in headed mode (visible browser)"
    echo "  --debug               Run tests in debug mode"
    echo "  --operations          Run only playlist operations tests"
    echo "  --behavior            Run only playlist behavior/timestamp tests"
    echo "  --sidebar             Run only sidebar source reordering tests"
    echo "  --all                 Run all playlist-related tests (default)"
    echo "  --project <name>      Run tests on specific browser (chromium, firefox, webkit)"
    echo "  --grep <pattern>      Run tests matching pattern"
    echo "  --ui                  Run tests in UI mode"
    echo "  --report              Show test report"
    echo "  --help, -h            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --headed --operations"
    echo "  $0 --debug --grep \"drag and drop\""
    echo "  $0 --project chromium --behavior"
    echo "  $0 --ui"
}

# Parse command line arguments
HEADED=""
DEBUG=""
UI=""
PROJECT=""
GREP=""
TEST_FILES=""
SHOW_REPORT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --headed)
            HEADED="--headed"
            shift
            ;;
        --debug)
            DEBUG="--debug"
            shift
            ;;
        --ui)
            UI="--ui"
            shift
            ;;
        --operations)
            TEST_FILES="$TEST_FILES $PLAYLIST_OPERATIONS"
            shift
            ;;
        --behavior)
            TEST_FILES="$TEST_FILES $PLAYLIST_BEHAVIOR"
            shift
            ;;
        --sidebar)
            TEST_FILES="$TEST_FILES $SIDEBAR_SOURCES"
            shift
            ;;
        --all)
            TEST_FILES="$PLAYLIST_OPERATIONS $PLAYLIST_BEHAVIOR $SIDEBAR_SOURCES"
            shift
            ;;
        --project)
            PROJECT="--project $2"
            shift 2
            ;;
        --grep)
            GREP="--grep $2"
            shift 2
            ;;
        --report)
            SHOW_REPORT="true"
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Default to all tests if none specified
if [[ -z "$TEST_FILES" && -z "$SHOW_REPORT" && -z "$UI" ]]; then
    TEST_FILES="$PLAYLIST_OPERATIONS $PLAYLIST_BEHAVIOR $SIDEBAR_SOURCES"
fi

# Show report if requested
if [[ -n "$SHOW_REPORT" ]]; then
    print_status "Showing test report..."
    npx playwright show-report
    exit 0
fi

# Check if Playwright is installed
if ! npx playwright --version &> /dev/null; then
    print_error "Playwright is not installed. Please run 'npm install' first."
    exit 1
fi

# Check if test files exist
for file in $TEST_FILES; do
    if [[ ! -f "$file" ]]; then
        print_error "Test file not found: $file"
        exit 1
    fi
done

# Construct the command
CMD="npx playwright test"

if [[ -n "$HEADED" ]]; then
    CMD="$CMD $HEADED"
fi

if [[ -n "$DEBUG" ]]; then
    CMD="$CMD $DEBUG"
fi

if [[ -n "$UI" ]]; then
    CMD="$CMD $UI"
fi

if [[ -n "$PROJECT" ]]; then
    CMD="$CMD $PROJECT"
fi

if [[ -n "$GREP" ]]; then
    CMD="$CMD $GREP"
fi

# Add test files
if [[ -n "$TEST_FILES" ]]; then
    CMD="$CMD $TEST_FILES"
fi

# Print what we're about to run
print_status "Running playlist E2E tests..."
print_status "Command: $CMD"
echo ""

# Run the tests
if [[ -n "$UI" ]]; then
    print_status "Opening Playwright UI..."
    eval $CMD
else
    print_status "Executing tests..."
    
    # Run with proper error handling
    if eval $CMD; then
        print_success "All playlist tests completed successfully!"
        echo ""
        print_status "Test files covered:"
        if [[ "$TEST_FILES" =~ "$PLAYLIST_OPERATIONS" ]]; then
            echo "  ✓ Playlist Operations (create, delete, add/remove videos, drag & drop)"
        fi
        if [[ "$TEST_FILES" =~ "$PLAYLIST_BEHAVIOR" ]]; then
            echo "  ✓ Playlist Behavior (watching, timestamps, continue watching integration)"
        fi
        if [[ "$TEST_FILES" =~ "$SIDEBAR_SOURCES" ]]; then
            echo "  ✓ Sidebar Sources (source reordering, persistence, visual feedback)"
        fi
        echo ""
        print_status "To view detailed results, run: $0 --report"
    else
        print_error "Some tests failed. Check the output above for details."
        echo ""
        print_status "To debug failing tests:"
        echo "  $0 --debug --grep \"<failing test name>\""
        echo ""
        print_status "To run in headed mode for visual debugging:"
        echo "  $0 --headed --grep \"<failing test name>\""
        exit 1
    fi
fi

# Additional information
echo ""
print_status "Playlist E2E Test Coverage:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Basic Operations:"
echo "   • Create and delete playlists"
echo "   • Add videos to playlists via context menu"
echo "   • Remove videos from playlists"
echo ""
echo "🎯 Drag & Drop Functionality:"
echo "   • Drag videos from homepage onto playlists"
echo "   • Reorder videos within playlists (when sort = Custom)"
echo "   • Reorder playlists in sidebar"
echo "   • Drag sources in sidebar to reorder them"
echo ""
echo "📊 Sort Order Management:"
echo "   • Change playlist sort: Custom → Published At → Title"
echo "   • Ascending/descending options for Published At and Title"
echo "   • Disable drag & drop when sort ≠ Custom"
echo "   • Persist sort order across navigation"
echo ""
echo "⏱️ Timestamp Integration:"
echo "   • Create timestamps when watching playlist videos"
echo "   • Resume playlist from Continue Watching with correct sort order"
echo "   • Navigate to playlist page via Continue Watching playlist title"
echo "   • Display next videos in correct sort order"
echo "   • Include query parameters for non-default sort orders"
echo ""
echo "🔐 Authentication Requirements:"
echo "   • Restrict playlist operations to authenticated users"
echo "   • Disable drag & drop for unauthenticated users"
echo "   • Show appropriate UI states for different user types"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"