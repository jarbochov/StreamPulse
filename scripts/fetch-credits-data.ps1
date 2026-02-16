# ============================================================================
# Fetch Stream Credits Data (PowerShell)
# ============================================================================
# This script fetches subscriber, bits, and follower data from Twitch API
# using the Twitch CLI and saves them as JSON files for the credits overlay.
#
# Usage:
#   .\fetch-credits-data.ps1 [BROADCASTER_ID]
#
# Or set BROADCASTER_ID as an environment variable:
#   $env:BROADCASTER_ID = "your_id"
#   .\fetch-credits-data.ps1
# ============================================================================

param(
    [string]$BroadcasterId = $env:BROADCASTER_ID
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputDir = if ($env:OUTPUT_DIR) { $env:OUTPUT_DIR } else { Join-Path $ScriptDir "..\data" }

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "INFO" { "Green" }
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        default { "White" }
    }
    
    Write-Host "[$timestamp] " -NoNewline
    Write-Host "$Level`: " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

# ============================================================================
# Validation
# ============================================================================

# Check if Twitch CLI is installed
try {
    $null = Get-Command twitch -ErrorAction Stop
} catch {
    Write-Log "Twitch CLI is not installed or not in PATH" -Level "ERROR"
    Write-Log "Install it from: https://dev.twitch.tv/docs/cli/" -Level "ERROR"
    exit 1
}

# Check if broadcaster ID is provided
if ([string]::IsNullOrEmpty($BroadcasterId)) {
    Write-Log "BROADCASTER_ID is required" -Level "ERROR"
    Write-Host "Usage: .\fetch-credits-data.ps1 BROADCASTER_ID"
    Write-Host "Or set environment variable: `$env:BROADCASTER_ID = 'your_id'"
    exit 1
}

# Create output directory if it doesn't exist
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Log "Starting data fetch for broadcaster ID: $BroadcasterId"
Write-Log "Output directory: $OutputDir"

# ============================================================================
# Fetch Subscriptions
# ============================================================================

Write-Log "Fetching subscriptions..."

$SubsFile = Join-Path $OutputDir "subs.json"
$TempSubsFile = Join-Path $OutputDir "subs.tmp.json"

# Initialize with empty data array
@{data = @()} | ConvertTo-Json | Set-Content $TempSubsFile

$Cursor = ""
$Page = 1
$TotalSubs = 0
$AllSubs = @()

while ($true) {
    Write-Log "Fetching subscriptions page $Page..."
    
    try {
        if ([string]::IsNullOrEmpty($Cursor)) {
            $Response = twitch api get /subscriptions -q broadcaster_id="$BroadcasterId" -q first=100 | ConvertFrom-Json
        } else {
            $Response = twitch api get /subscriptions -q broadcaster_id="$BroadcasterId" -q first=100 -q after="$Cursor" | ConvertFrom-Json
        }
    } catch {
        Write-Log "Failed to fetch subscriptions: $_" -Level "ERROR"
        exit 1
    }
    
    $PageData = $Response.data
    $PageCount = $PageData.Count
    $TotalSubs += $PageCount
    $AllSubs += $PageData
    
    # Check for next page
    $Cursor = $Response.pagination.cursor
    
    if ([string]::IsNullOrEmpty($Cursor)) {
        break
    }
    
    $Page++
}

@{data = $AllSubs} | ConvertTo-Json -Depth 10 | Set-Content $SubsFile
Write-Log "Subscriptions saved: $TotalSubs total subscribers"

# ============================================================================
# Fetch Bits Leaderboard
# ============================================================================

Write-Log "Fetching bits leaderboard..."

$BitsFile = Join-Path $OutputDir "bits.json"

try {
    $Response = twitch api get /bits/leaderboard -q count=100 -q period=all
    $Response | Set-Content $BitsFile
    $BitsData = $Response | ConvertFrom-Json
    $BitsCount = $BitsData.data.Count
    Write-Log "Bits leaderboard saved: $BitsCount entries"
} catch {
    Write-Log "Failed to fetch bits leaderboard (may not be available)" -Level "WARN"
    @{data = @()} | ConvertTo-Json | Set-Content $BitsFile
    $BitsCount = 0
}

# ============================================================================
# Fetch Followers
# ============================================================================

Write-Log "Fetching followers..."

$FollowersFile = Join-Path $OutputDir "followers.json"
$TempFollowersFile = Join-Path $OutputDir "followers.tmp.json"

# Initialize with empty data array
@{data = @()} | ConvertTo-Json | Set-Content $TempFollowersFile

$Cursor = ""
$Page = 1
$TotalFollowers = 0
$AllFollowers = @()

while ($true) {
    Write-Log "Fetching followers page $Page..."
    
    try {
        if ([string]::IsNullOrEmpty($Cursor)) {
            $Response = twitch api get /channels/followers -q broadcaster_id="$BroadcasterId" -q first=100 | ConvertFrom-Json
        } else {
            $Response = twitch api get /channels/followers -q broadcaster_id="$BroadcasterId" -q first=100 -q after="$Cursor" | ConvertFrom-Json
        }
    } catch {
        Write-Log "Failed to fetch followers: $_" -Level "ERROR"
        exit 1
    }
    
    $PageData = $Response.data
    $PageCount = $PageData.Count
    $TotalFollowers += $PageCount
    $AllFollowers += $PageData
    
    # Check for next page
    $Cursor = $Response.pagination.cursor
    
    if ([string]::IsNullOrEmpty($Cursor)) {
        break
    }
    
    $Page++
}

@{data = $AllFollowers} | ConvertTo-Json -Depth 10 | Set-Content $FollowersFile
Write-Log "Followers saved: $TotalFollowers total followers"

# ============================================================================
# Summary
# ============================================================================

Write-Log "========================================"
Write-Log "Data fetch completed successfully!"
Write-Log "  Subscribers: $TotalSubs"
Write-Log "  Bits Leaders: $BitsCount"
Write-Log "  Followers: $TotalFollowers"
Write-Log "  Output: $OutputDir"
Write-Log "========================================"
