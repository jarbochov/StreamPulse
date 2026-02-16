# Stream Credits Overlay

A hybrid stream credits overlay system for OBS that combines pre-fetched Twitch API data with live stream data from SocialStream Ninja (SSN).

## Overview

This project creates a cinematic movie-style credits roll for livestreams that displays:
- Pre-fetched Twitch data: Subscribers, bits leaderboard, followers
- Live stream data: Real-time chatters, new follows, subs, bits, donations, and hashtag tracking

The credits automatically scroll with a cinematic aesthetic, perfect for end-of-stream sequences.

## Architecture

```
┌─────────────────────┐
│ Bitfocus Companion  │ (optional - triggers data fetch)
│   (manual trigger)  │
└──────────┬──────────┘
           │ triggers
           ▼
┌─────────────────────────────┐
│ fetch-credits-data.sh/.ps1  │
└──────────┬──────────────────┘
           │ uses Twitch CLI
           ▼
┌─────────────────────────────┐
│      Twitch API             │
│  - Subscriptions            │
│  - Bits Leaderboard         │
│  - Followers                │
└──────────┬──────────────────┘
           │ writes JSON
           ▼
┌─────────────────────────────┐
│   data/                     │
│   ├── subs.json             │
│   ├── bits.json             │
│   └── followers.json        │
└──────────┬──────────────────┘
           │
           │ loaded by
           ▼
┌──────────────────────────────────────────────────┐
│               credits.html                        │
│  ┌────────────────────────────────────────────┐  │
│  │  Pre-fetched Data     +    Live SSN Data  │  │
│  │  (JSON files)              (WebSocket)    │  │
│  └────────────────────────────────────────────┘  │
└──────────┬───────────────────────────────────────┘
           │
           │ rendered in
           ▼
┌─────────────────────────────┐
│   OBS Browser Source        │
│   (Overlay Layer)           │
└─────────────────────────────┘

           ┌──────────────────────────────────┐
           │  SocialStream Ninja              │
           │  WebSocket (Channel 4)           │
           │  - Live chatters                 │
           │  - New follows                   │
           │  - New subs/memberships          │
           │  - Bits/donations                │
           │  - Emote tracking (Twitch/BTTV/  │
           │    7TV/FFZ)                      │
           │  - Hashtag tracking              │
           └──────────────────────────────────┘
```

### Data Flow

1. **Pre-Stream Setup**: Configure Twitch CLI and SocialStream Ninja
2. **Before/During Stream**: Run `fetch-credits-data.sh` (manually or via Bitfocus Companion) to fetch current subs/bits/followers
3. **During Stream**: credits.html connects to SSN WebSocket Channel 4 to collect live data
4. **End of Stream**: Toggle OBS browser source visibility - credits auto-play and scroll
5. **Live Updates**: Script auto-refreshes JSON data every 60 seconds, SSN provides real-time events

## Prerequisites

### Required
- **OBS Studio** - For displaying the browser source overlay
- **Twitch CLI** - For fetching subscriber and follower data
  - Install: https://dev.twitch.tv/docs/cli/
  - Authenticate: `twitch configure`
- **SocialStream Ninja Extension** - For live chat/event data
  - Install: https://socialstream.ninja/
  - Enable API toggles in extension settings
  - Note your Session ID from the extension

### Optional but Recommended
- **Bitfocus Companion** - For triggering data fetches via button press
  - Install: https://bitfocus.io/companion

## Setup Instructions

### 1. Install and Configure Twitch CLI

```bash
# Install Twitch CLI (macOS example)
brew install twitch-cli

# Authenticate with Twitch
twitch configure

# Test authentication
twitch token
```

### 2. Set Up SocialStream Ninja

1. Install the SocialStream Ninja browser extension
2. Configure it for your Twitch channel
3. In extension settings:
   - Enable "API Toggles"
   - Enable "Channel 4" for chat messages
   - Note your unique Session ID (shown in extension)

### 3. Fetch Initial Data

Run the fetch script to get current subscriber/follower data:

```bash
# macOS/Linux
chmod +x scripts/fetch-credits-data.sh
./scripts/fetch-credits-data.sh YOUR_BROADCASTER_ID

# Or set environment variable
export BROADCASTER_ID=your_broadcaster_id
./scripts/fetch-credits-data.sh

# Windows
.\scripts\fetch-credits-data.ps1 YOUR_BROADCASTER_ID
```

To find your Broadcaster ID:
```bash
twitch api get /users?login=YOUR_TWITCH_USERNAME
```

### 4. Add to OBS

1. Add a new **Browser Source** to your OBS scene
2. Set the URL to the local file path or web server:
   ```
   file:///absolute/path/to/credits.html?session=YOUR_SSN_SESSION_ID
   ```
3. Recommended dimensions: 1920x1080 (or match your canvas)
4. Check "Shutdown source when not visible" (allows reconnection)
5. Initially hide the source - show it when you want credits to play

### 5. Configure URL Parameters

The credits.html file accepts several URL parameters:

- `session` (required) - Your SocialStream Ninja session ID
- `server` (optional) - Custom WSS URL, defaults to `wss://io.socialstream.ninja`
- `duration` (optional) - Exact scroll duration in seconds. Perfect for syncing with music. Default: 82s
  - Example: `?duration=75` for a 75-second scroll
  - Takes priority over `speed` if both are provided
- `speed` (optional) - Scroll speed multiplier relative to the default 82s duration
  - Example: `speed=2` → 41s, `speed=0.5` → 164s
  - Only used if `duration` is not provided
- `datapath` (optional) - Path to data directory, defaults to `./data`

Example with custom parameters:
```
file:///path/to/credits.html?session=abc123&duration=82
file:///path/to/credits.html?session=abc123&speed=1.5&datapath=./custom-data
```

**💡 Tip:** Use the `duration` parameter to match your end-of-stream music exactly!

## How It Works

### 🎵 Syncing Credits with Music

The credits scroll duration can be set to exactly match your end-of-stream music:

| Music Length | URL Parameter |
| --- | --- |
| 60 seconds | `?duration=60` |
| 75 seconds | `?duration=75` |
| 82 seconds | `?duration=82` (default) |
| 90 seconds | `?duration=90` |
| 120 seconds | `?duration=120` |

Example:
```
credits.html?session=YOUR_SESSION_ID&duration=82
```

**💡 Tip:** Use a Bitfocus Companion button to trigger both the credits OBS source and the music simultaneously for perfect sync!

### Pre-fetched Data (Twitch API)

The fetch scripts use Twitch CLI to get:
- **Subscribers**: Current subscriber list with tiers
- **Bits Leaderboard**: Top cheerers for the current stream
- **Followers**: Recent follower list

This data is written to JSON files in the `data/` directory and refreshed:
- Manually by running the script
- Automatically every 60 seconds while credits.html is loaded
- Via Bitfocus Companion button (if configured)

### Live Data (SocialStream Ninja)

The credits.html file connects to SSN WebSocket Channel 4 and tracks:

1. **Chatters**: Unique users who sent messages during the stream
   - Tracked by username with message count
   - Excludes bots (where `data.bot === true`)
   
2. **New Followers**: Users who followed during the stream
   - Detected via `event === "follow"`
   
3. **New Subscribers**: Users who subscribed during the stream
   - Detected via populated `membership` field
   
4. **Gift Subs**: Gift subscriptions detected via:
   - `membership` field containing "gift"
   - Presence of `contentimg` field
   
5. **Bits/Donations**: Bits and monetary donations
   - Detected via populated `hasDonation` field
   - Separated into bits vs other donations
   
6. **Emotes**: Top 5 most-used emotes from chat
   - Tracked by parsing `<img>` tags from SSN's `chatmessage` field
   - SSN converts Twitch native emotes, BTTV, 7TV, and FFZ emotes to `<img>` tags
   - Top 5 displayed with actual emote images from CDN
   - Shows usage count and unique user count
   
7. **Hashtags**: Trending hashtags from chat messages
   - Parsed from `chatmessage` field using regex `/#\w+/g` (HTML stripped first)
   - Tracked with count and unique user count
   - Top 10 displayed in credits

### SSN Channel System

SocialStream Ninja uses a channel-based WebSocket system:
- **Channel 4**: Chat messages and events (what we use)
- Connection message: `{ join: SESSION_ID, in: 4, out: 3 }`
- Messages may be wrapped in `data.overlayNinja` - the code unwraps them
- Implements automatic reconnection (SSN times out after ~60s of inactivity)

### Credits Rendering

When the OBS source becomes visible, the credits automatically start scrolling:

**Sections (in order):**
1. Header image (animated GIF) + "Thank you for your support!" + "The room where it happens"
2. Subscribers — "Remember to feed your Wii U a disc" (2-column layout)
3. New Followers — "(not a cult)" (3-column layout)
4. Donators — "Can I have fifty dollars?" (2-column layout)
5. Gift Subs (2-column layout)
6. Cheerers (2-column layout with bits amounts)
7. Top Emotes — "Chat's Mood Board" (top 5 with actual emote images from CDN, usage count, and unique user count)
8. Trending Hashtags — "What we're talking about" (top 10 with usage stats)
9. Today's Chatters — "The Peanut Gallery" (3-column layout, sorted by message count)
10. Ending statement: "Never forget that you're awesome and that you matter. Thanks for being you!"
11. Social links fade-in: Threads, Mastodon, Bluesky, Website

**Styling:**
- Transparent background for OBS overlay compatibility
- **Jersey 20** Google Font with retro arcade aesthetic
- `rgb(214, 227, 225)` text color with dark text outline (`--text-outline-color: #00000066`)
- Multi-column layouts (2-column and 3-column for different sections)
- Font Awesome 6.5.1 for social link icons
- Smooth CSS scroll animation with configurable duration
- Credits fade-out → social links fade-in transition
- Empty sections automatically hidden

## Customization

### CSS Variables

Edit the CSS in credits.html to customize appearance:

```css
--text-outline-color: #00000066;  /* Text outline shadow */
```

The `--scroll-duration` variable is set dynamically via JavaScript based on URL parameters (defaults to 82s).

The overlay uses the **Jersey 20** Google Font with `rgb(214, 227, 225)` text color for a retro arcade aesthetic.

## Bitfocus Companion Integration

To trigger data fetches with a Stream Deck button:

1. Add a "Generic" → "Shell Command" button
2. Command (macOS/Linux):
   ```bash
   cd /path/to/stream-credits && ./scripts/fetch-credits-data.sh YOUR_BROADCASTER_ID
   ```
3. Command (Windows):
   ```powershell
   cd C:\path\to\stream-credits; .\scripts\fetch-credits-data.ps1 YOUR_BROADCASTER_ID
   ```

Or set up a scheduled trigger to refresh data every 5-10 minutes during stream.

## Troubleshooting

### Credits not loading
- Check browser console in OBS (right-click source → Interact → F12)
- Verify session ID is correct
- Ensure SocialStream Ninja extension is running and configured

### No subscribers/followers showing
- Run the fetch script: `./scripts/fetch-credits-data.sh YOUR_BROADCASTER_ID`
- Check that JSON files exist in `data/` directory
- Verify Twitch CLI is authenticated: `twitch token`

### WebSocket connection issues
- SSN WebSocket drops connections after ~60s - this is normal, reconnection is automatic
- Check that Channel 4 is enabled in SSN extension settings
- Verify the session ID matches the one shown in SSN extension

### Missing live data
- Ensure SSN extension is active during the stream
- Check that API toggles are enabled in extension settings
- Bot messages are intentionally filtered out

## File Structure

```
stream-credits/
├── README.md              # This file
├── credits.html           # Main OBS browser source
├── .gitignore            # Git ignore patterns
├── data/                 # Pre-fetched Twitch data
│   ├── .gitkeep
│   ├── subs.json         # (generated, git-ignored)
│   ├── bits.json         # (generated, git-ignored)
│   └── followers.json    # (generated, git-ignored)
└── scripts/
    ├── fetch-credits-data.sh   # Bash script for macOS/Linux
    └── fetch-credits-data.ps1  # PowerShell script for Windows
```

## Security Note

The `data/*.json` files are git-ignored because they contain sensitive subscriber information. Never commit these files to version control.

## License

Custom project for Jarbochov's stream.

## Credits

Built with:
- [Twitch API](https://dev.twitch.tv/docs/api/) via Twitch CLI
- [SocialStream Ninja](https://socialstream.ninja/) by Steve Seguin
- [OBS Studio](https://obsproject.com/) 
