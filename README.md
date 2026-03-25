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

1. **Setup**: Fill in `config.json` with your Twitch and SSN credentials
2. **Start of Stream**: Run `npm start` (or `node server.js`) — this starts the HTTP server, connects to SSN, and fetches Twitch data
3. **During Stream**: The server collects chat data (chatters, emotes, hashtags, follows, subs, donations) in the background and auto-refreshes Twitch API data
4. **End of Stream**: Show the credits OBS browser source — it loads all collected data and scrolls
5. **Companion Integration**: Hit `http://localhost:8080/api/fetch` to trigger a Twitch data refresh, or `http://localhost:8080/api/reset` to clear chat data for a new session

## Prerequisites

### Required
- **Node.js** (v18+) — https://nodejs.org/
- **OBS Studio** — For displaying the browser source overlay
- **Twitch Application** — Create one at https://dev.twitch.tv/console/apps
  - Note your Client ID and Client Secret
- **SocialStream Ninja Extension** — For live chat/event data
  - Install: https://socialstream.ninja/
  - Enable Toggles 1 and 3 in Global Settings → Mechanics
  - Keep the dock page open during stream
  - Note your Session ID from the dock page URL

### Optional but Recommended
- **Bitfocus Companion** — For triggering API endpoints via button press
  - Install: https://bitfocus.io/companion

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure

Copy the example config and fill in your credentials:

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "port": 8080,
  "broadcaster_id": "YOUR_BROADCASTER_ID",
  "twitch": {
    "client_id": "YOUR_TWITCH_CLIENT_ID",
    "client_secret": "YOUR_TWITCH_CLIENT_SECRET"
  },
  "ssn": {
    "session_id": "YOUR_SSN_SESSION_ID",
    "server": "wss://io.socialstream.ninja"
  },
  "twitch_refresh_minutes": 10,
  "days_filter": 30
}
```

To find your Broadcaster ID:
```bash
# Use the Twitch API or look up your numeric ID at twitchtracker.com
```

### 3. Set Up SocialStream Ninja

1. Install the SocialStream Ninja browser extension
2. Configure it for your Twitch channel
3. In Global Settings → Mechanics, enable:
   - Toggle 1: "Enable remote API control of extension"
   - Toggle 3: "Send chat messages to API server"
4. Open the dock page and note your Session ID from the URL

### 4. Start the Server

```bash
npm start
# or: node server.js
```

The server will:
- Start an HTTP server on the configured port
- Connect to SSN and start collecting chat data
- Fetch Twitch subscriber/follower/bits data
- Auto-refresh Twitch data every N minutes (configurable)

### 5. Add to OBS

1. Add a new **Browser Source** to your OBS scene
2. Set the URL to:
   ```
   http://localhost:8080/credits.html
   ```
   Optional parameters: `?duration=82&days=30`
3. Recommended dimensions: 1920x1080 (or match your canvas)
4. Show the source when you want credits to play

### 6. URL Parameters

The credits overlay accepts URL parameters for customization:

- `duration` (optional) - Scroll duration in seconds. Default: 82s
- `speed` (optional) - Speed multiplier (e.g. `2` = twice as fast). Only used if `duration` is not set
- `days` (optional) - Only show followers from last N days. Default: 30
- `datapath` (optional) - Path to data directory. Default: `./data`

Examples:
```
http://localhost:8080/credits.html?duration=82
http://localhost:8080/credits.html?duration=120&days=7
```

## How It Works

### Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│  SSN Dock   │────▶│              server.js                   │
│  (browser)  │ WSS │  ┌─────────────┐  ┌──────────────────┐  │
└─────────────┘     │  │ SSN Collect  │  │ Twitch API Fetch │  │
                    │  │ (WebSocket)  │  │ (auto-refresh)   │  │
                    │  └──────┬──────┘  └────────┬─────────┘  │
                    │         │ writes            │ writes     │
                    │         ▼                   ▼            │
                    │      data/chat.json    data/subs.json    │
                    │                        data/bits.json    │
                    │      ┌─────────────┐   data/followers.json│
                    │      │ HTTP Server │                     │
                    │      └──────┬──────┘                     │
                    └─────────────┼────────────────────────────┘
                                  │ serves
                                  ▼
                    ┌─────────────────────────┐
                    │  OBS Browser Source      │
                    │  credits.html/css/js     │
                    │  (reads data/*.json)     │
                    └─────────────────────────┘
```

### 🎵 Syncing Credits with Music

Use the `duration` parameter to match your end-of-stream music:

| Music Length | URL Parameter |
| --- | --- |
| 60 seconds | `?duration=60` |
| 82 seconds | `?duration=82` (default) |
| 120 seconds | `?duration=120` |

**💡 Tip:** Use a Companion button to trigger both the credits OBS source and the music simultaneously!

### Data Sources

**Twitch API** (fetched by server.js):
- **Subscribers** — Current subscriber list with tiers
- **Bits Leaderboard** — Top cheerers for the current month
- **Followers** — Recent follower list (filterable by days)

**SocialStream Ninja** (collected by server.js via WebSocket):
- **Chatters** — Unique users who sent messages (excludes bots)
- **New Followers/Subscribers** — Detected from SSN events
- **Gift Subs / Bits / Donations** — Detected from SSN events
- **Emotes** — Top 5 most-used emotes with images
- **Hashtags** — Top 10 trending hashtags

### API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/status` | GET | Server health, SSN connection state, data counts |
| `/api/fetch` | GET | Trigger a Twitch data refresh |
| `/api/reset` | GET | Clear chat data for a new session |

## Bitfocus Companion Integration

Use the **Generic HTTP** module in Companion:

- **Refresh Twitch data**: `GET http://localhost:8080/api/fetch`
- **Reset chat data**: `GET http://localhost:8080/api/reset`
- **Check status**: `GET http://localhost:8080/api/status`

## Troubleshooting

### Credits not loading / No data showing
- Ensure `node server.js` is running
- Check that OBS URL is `http://localhost:8080/credits.html`
- Right-click the OBS source → "Refresh cache of current page"

### No subscribers/followers showing
- Check `config.json` has valid Twitch `client_id`, `client_secret`, and `broadcaster_id`
- Hit `http://localhost:8080/api/fetch` in a browser to trigger a manual fetch
- Check terminal for Twitch API error messages
- Note: Subscriptions endpoint requires a user token with `channel:read:subscriptions` scope (app tokens may not work)

### No SSN/chat data
- Ensure SSN dock page is open in a browser
- Enable Toggles 1 and 3 in SSN Global Settings → Mechanics
- Verify session ID in `config.json` matches your SSN dock URL
- Check `http://localhost:8080/api/status` — `ssn.connected` should be `true`

### WebSocket connection issues
- SSN connections may drop — the server auto-reconnects
- Check terminal output for `[SSN]` log messages

## File Structure

```
stream-credits/
├── server.js              # Unified server (HTTP + SSN + Twitch)
├── config.json            # Your credentials (git-ignored)
├── config.example.json    # Template config
├── credits.html           # OBS browser source (HTML shell)
├── credits.css            # Overlay styles
├── credits.js             # Overlay client-side logic
├── package.json           # Node.js config and dependencies
├── .gitignore             # Git ignore patterns
├── data/                  # Generated data (git-ignored)
│   ├── .gitkeep
│   ├── subs.json          # Twitch subscribers
│   ├── bits.json          # Twitch bits leaderboard
│   ├── followers.json     # Twitch followers
│   └── chat.json          # SSN collected chat data
└── scripts/               # Legacy standalone scripts
    ├── fetch-credits-data.sh
    ├── fetch-credits-data.ps1
    ├── collect-chat.js
    └── serve.sh
```

## Security Note

- `config.json` contains your Twitch credentials and is git-ignored — never commit it
- `data/*.json` files contain subscriber information and are git-ignored
- The server only listens on localhost by default

## License

Custom project for Jarbochov's stream.

## Credits

Built with:
- [Twitch API](https://dev.twitch.tv/docs/api/)
- [SocialStream Ninja](https://socialstream.ninja/) by Steve Seguin
- [OBS Studio](https://obsproject.com/)
