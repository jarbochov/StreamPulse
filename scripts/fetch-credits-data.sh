#!/bin/bash

# ============================================================================
# Fetch Stream Credits Data
# ============================================================================
# This script fetches subscriber, bits, and follower data from Twitch API
# using the Twitch CLI and saves them as JSON files for the credits overlay.
#
# Usage:
#   ./fetch-credits-data.sh [BROADCASTER_ID]
#
# Or set BROADCASTER_ID as an environment variable:
#   export BROADCASTER_ID=your_id
#   ./fetch-credits-data.sh
# ============================================================================

set -e

# Configuration
BROADCASTER_ID="${1:-${BROADCASTER_ID}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${SCRIPT_DIR}/../data}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# ============================================================================
# Validation
# ============================================================================

# Check if Twitch CLI is installed
if ! command -v twitch &> /dev/null; then
    log_error "Twitch CLI is not installed or not in PATH"
    log_error "Install it from: https://dev.twitch.tv/docs/cli/"
    exit 1
fi

# Check if broadcaster ID is provided
if [ -z "$BROADCASTER_ID" ]; then
    log_error "BROADCASTER_ID is required"
    echo "Usage: $0 BROADCASTER_ID"
    echo "Or set environment variable: export BROADCASTER_ID=your_id"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

log_info "Starting data fetch for broadcaster ID: $BROADCASTER_ID"
log_info "Output directory: $OUTPUT_DIR"

# ============================================================================
# Fetch Subscriptions
# ============================================================================

log_info "Fetching subscriptions..."

SUBS_FILE="${OUTPUT_DIR}/subs.json"
TEMP_SUBS_FILE="${OUTPUT_DIR}/subs.tmp.json"

# Initialize with empty data array
echo '{"data":[]}' > "$TEMP_SUBS_FILE"

# Fetch first page
CURSOR=""
PAGE=1
TOTAL_SUBS=0

while true; do
    log_info "Fetching subscriptions page $PAGE..."
    
    if [ -z "$CURSOR" ]; then
        RESPONSE=$(twitch api get /subscriptions -q broadcaster_id="$BROADCASTER_ID" -q first=100)
    else
        RESPONSE=$(twitch api get /subscriptions -q broadcaster_id="$BROADCASTER_ID" -q first=100 -q after="$CURSOR")
    fi
    
    if [ $? -ne 0 ]; then
        log_error "Failed to fetch subscriptions"
        exit 1
    fi
    
    # Extract data and pagination
    PAGE_DATA=$(echo "$RESPONSE" | jq -r '.data')
    PAGE_COUNT=$(echo "$PAGE_DATA" | jq 'length')
    TOTAL_SUBS=$((TOTAL_SUBS + PAGE_COUNT))
    
    # Append to temp file
    CURRENT_DATA=$(jq -r '.data' "$TEMP_SUBS_FILE")
    MERGED_DATA=$(echo "$CURRENT_DATA $PAGE_DATA" | jq -s 'add')
    echo "{\"data\":$MERGED_DATA}" > "$TEMP_SUBS_FILE"
    
    # Check for next page
    CURSOR=$(echo "$RESPONSE" | jq -r '.pagination.cursor // empty')
    
    if [ -z "$CURSOR" ]; then
        break
    fi
    
    PAGE=$((PAGE + 1))
done

mv "$TEMP_SUBS_FILE" "$SUBS_FILE"
log_info "Subscriptions saved: $TOTAL_SUBS total subscribers"

# ============================================================================
# Fetch Bits Leaderboard
# ============================================================================

log_info "Fetching bits leaderboard..."

BITS_FILE="${OUTPUT_DIR}/bits.json"

RESPONSE=$(twitch api get /bits/leaderboard -q count=100 -q period=all)

if [ $? -ne 0 ]; then
    log_warn "Failed to fetch bits leaderboard (may not be available)"
    echo '{"data":[]}' > "$BITS_FILE"
else
    echo "$RESPONSE" > "$BITS_FILE"
    BITS_COUNT=$(echo "$RESPONSE" | jq '.data | length')
    log_info "Bits leaderboard saved: $BITS_COUNT entries"
fi

# ============================================================================
# Fetch Followers
# ============================================================================

log_info "Fetching followers..."

FOLLOWERS_FILE="${OUTPUT_DIR}/followers.json"
TEMP_FOLLOWERS_FILE="${OUTPUT_DIR}/followers.tmp.json"

# Initialize with empty data array
echo '{"data":[]}' > "$TEMP_FOLLOWERS_FILE"

# Fetch first page
CURSOR=""
PAGE=1
TOTAL_FOLLOWERS=0

while true; do
    log_info "Fetching followers page $PAGE..."
    
    if [ -z "$CURSOR" ]; then
        RESPONSE=$(twitch api get /channels/followers -q broadcaster_id="$BROADCASTER_ID" -q first=100)
    else
        RESPONSE=$(twitch api get /channels/followers -q broadcaster_id="$BROADCASTER_ID" -q first=100 -q after="$CURSOR")
    fi
    
    if [ $? -ne 0 ]; then
        log_error "Failed to fetch followers"
        exit 1
    fi
    
    # Extract data and pagination
    PAGE_DATA=$(echo "$RESPONSE" | jq -r '.data')
    PAGE_COUNT=$(echo "$PAGE_DATA" | jq 'length')
    TOTAL_FOLLOWERS=$((TOTAL_FOLLOWERS + PAGE_COUNT))
    
    # Append to temp file
    CURRENT_DATA=$(jq -r '.data' "$TEMP_FOLLOWERS_FILE")
    MERGED_DATA=$(echo "$CURRENT_DATA $PAGE_DATA" | jq -s 'add')
    echo "{\"data\":$MERGED_DATA}" > "$TEMP_FOLLOWERS_FILE"
    
    # Check for next page
    CURSOR=$(echo "$RESPONSE" | jq -r '.pagination.cursor // empty')
    
    if [ -z "$CURSOR" ]; then
        break
    fi
    
    PAGE=$((PAGE + 1))
done

mv "$TEMP_FOLLOWERS_FILE" "$FOLLOWERS_FILE"
log_info "Followers saved: $TOTAL_FOLLOWERS total followers"

# ============================================================================
# Summary
# ============================================================================

log_info "========================================"
log_info "Data fetch completed successfully!"
log_info "  Subscribers: $TOTAL_SUBS"
log_info "  Bits Leaders: $BITS_COUNT"
log_info "  Followers: $TOTAL_FOLLOWERS"
log_info "  Output: $OUTPUT_DIR"
log_info "========================================"
