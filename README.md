# Stream Credits Overlay

A configurable stream credits and stats overlay system for OBS, powered by a unified Node.js server that combines Twitch API data with live SocialStream Ninja chat collection.

## Features

- **Credits Roll** — Cinematic scrolling credits with subscribers, followers, chatters, emotes, hashtags, and more
- **Live Stats Overlay** — Persistent top chatters, emotes, and hashtags across sessions
- **Unified Server** — One `npm start` command runs HTTP serving, SSN chat collection, and Twitch API fetching
- **Fully Configurable** — All section titles, subtitles, social links, and enabled/disabled state controlled via `config.json`
- **Twitch OAuth** — Browser-based authorization with automatic token refresh
- **Auto-clear** — Chat data resets each startup; persistent stats accumulate across sessions
- **Companion Ready** — API endpoints for triggering fetches, resets, and status checks

## Quick Start

```bash
npm install
cp config.example.json config.json
# Edit config.json with your credentials
npm start
```

On first run, a browser window opens for Twitch authorization. After that, the server handles everything automatically.

**OBS Browser Sources:**
- Credits: `http://localhost:8080/credits.html`
- Stats: `http://localhost:8080/stats.html`

## Data Flow

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│  SSN Dock   │────▶│              server.js                   │
│  (browser)  │ WSS │  ┌─────────────┐  ┌──────────────────┐  │
└─────────────┘     │  │ SSN Collect  │  │ Twitch API Fetch │  │
                    │  │ (WebSocket)  │  │ (auto-refresh)   │  │
                    │  └──────┬──────┘  └────────┬─────────┘  │
                    │         │ writes            │ writes     │
                    │         ▼                   ▼            │
                    │   data/chat.json      data/subs.json     │
                    │   data/stats.json     data/bits.json     │
                    │                       data/followers.json│
                    │      ┌─────────────┐                     │
                    │      │ HTTP Server │                     │
                    │      └──────┬──────┘                     │
                    └─────────────┼────────────────────────────┘
                                  │ serves
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
          ┌──────────────────┐       ┌──────────────────┐
          │  credits.html    │       │  stats.html      │
          │  (OBS source)    │       │  (OBS source)    │
          └──────────────────┘       └──────────────────┘
```

## Prerequisites

### Required
- **Node.js** (v18+) — https://nodejs.org/
- **OBS Studio** — For displaying browser source overlays
- **Twitch Application** — Create at https://dev.twitch.tv/console/apps
  - Add `http://localhost:8080/auth/callback` as an OAuth Redirect URL
  - Note your Client ID and Client Secret
- **SocialStream Ninja** — For live chat/event data
  - Install: https://socialstream.ninja/
  - Enable Toggles 1 and 3 in Global Settings → Mechanics
  - Keep the dock page open during stream

### Optional
- **Bitfocus Companion** — Trigger API endpoints via Stream Deck buttons

## Configuration

### config.json Reference

```json
{
  "port": 8080,
  "broadcaster_id": "YOUR_BROADCASTER_ID",
  "broadcaster_name": "YOUR_TWITCH_USERNAME",
  "twitch": {
    "client_id": "YOUR_TWITCH_CLIENT_ID",
    "client_secret": "YOUR_TWITCH_CLIENT_SECRET"
  },
  "ssn": {
    "session_id": "YOUR_SSN_SESSION_ID",
    "server": "wss://io.socialstream.ninja"
  },
  "twitch_refresh_minutes": 10,
  "days_filter": 30,
  "subs_source": "twitch",
  "active_subs_only": false,
  "exclude_users": [],

  "credits": {
    "header": {
      "image": "",
      "title": "Thank you for your support!",
      "subtitle": ""
    },
    "closing": "Thanks for watching!",
    "sections": {
      "subscribers": { "enabled": true, "title": "Subscribers", "subtitle": "" },
      "followers":   { "enabled": true, "title": "New Followers", "subtitle": "" },
      "donations":   { "enabled": true, "title": "Donators", "subtitle": "" },
      "gift_subs":   { "enabled": true, "title": "Gift Subs", "subtitle": "" },
      "cheerers":    { "enabled": true, "title": "Cheerers", "subtitle": "" },
      "emotes":      { "enabled": true, "title": "Top Emotes", "subtitle": "" },
      "hashtags":    { "enabled": true, "title": "Trending Hashtags", "subtitle": "" },
      "chatters":    { "enabled": true, "title": "Today's Chatters", "subtitle": "" }
    },
    "social": {
      "title": "Thanks for watching!",
      "subtitle": "",
      "links": [
        { "icon": "fab fa-threads", "handle": "@you" },
        { "icon": "🦋", "handle": "@you.bsky.social" }
      ]
    }
  }
}
```

### Config Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `port` | number | `8080` | HTTP server port |
| `broadcaster_id` | string | | Your Twitch numeric broadcaster ID |
| `broadcaster_name` | string | | Your Twitch username (filtered from sub/follower lists) |
| `twitch_refresh_minutes` | number | `10` | Auto-refresh interval for Twitch API data |
| `days_filter` | number | `30` | Only show followers from last N days |
| `subs_source` | string | `"twitch"` | `"twitch"`, `"ssn"`, or `"both"` |
| `active_subs_only` | boolean | `false` | Only show subscribers who chatted this stream |
| `exclude_users` | array | `[]` | Usernames to exclude from all data (case-insensitive) |

### Credits Sections

Each section in `credits.sections` supports:
- `enabled` — `true`/`false` to show/hide the section
- `title` — Section heading text
- `subtitle` — Text below the heading

### Social Links

Each entry in `credits.social.links`:
- `icon` — Font Awesome class (e.g. `"fab fa-threads"`) or emoji (e.g. `"🦋"`)
- `handle` — Display text (e.g. `"@username"`)

## URL Parameters

### credits.html

| Parameter | Default | Description |
| --- | --- | --- |
| `duration` | `82` | Scroll duration in seconds |
| `speed` | | Speed multiplier (only if `duration` not set) |
| `days` | config value | Override days_filter from config |
| `datapath` | `./data` | Path to data directory |

### stats.html

| Parameter | Default | Description |
| --- | --- | --- |
| `days` | all time | Only show stats from last N days |
| `date` | | Show stats for a single date (`YYYY-MM-DD`) |
| `from` | | Start of date range (`YYYY-MM-DD`) |
| `to` | | End of date range (`YYYY-MM-DD`) |
| `limit` | `20` | Top N items per column |
| `refresh` | `60` | Auto-refresh interval in seconds |

**Examples:**
```
stats.html?days=30              # Last 30 days
stats.html?date=2026-02-23     # Single date
stats.html?from=2026-02-01&to=2026-02-28  # Date range
```

### 🎵 Syncing Credits with Music

Use `?duration=` to match your end-of-stream music exactly:

```
http://localhost:8080/credits.html?duration=75
```

**💡 Tip:** Use a Companion button to trigger both the OBS credits source and music simultaneously!

## API Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/status` | Server health, SSN connection, data counts |
| `GET /api/config` | Current config (sections, social links, options) |
| `GET /api/fetch` | Trigger Twitch API data refresh |
| `GET /api/reset` | Clear session chat data |
| `GET /api/stats` | Raw persistent stats JSON (daily buckets) |
| `GET /api/stats/reset` | Clear all persistent stats |
| `POST /api/stats/migrate` | Migrate stats from old format to daily buckets |
| `GET /api/sessions` | List archived session files |
| `GET /auth/twitch` | Start Twitch OAuth flow |

## Bitfocus Companion Integration

Use the **Generic HTTP** module:

| Action | URL |
| --- | --- |
| Refresh Twitch data | `GET http://localhost:8080/api/fetch` |
| Reset chat data | `GET http://localhost:8080/api/reset` |
| Check status | `GET http://localhost:8080/api/status` |

## Data Persistence

| File | Lifecycle | Contains |
| --- | --- | --- |
| `data/chat.json` | **Cleared on each startup** (archived first) | Session chatters, subs, emotes, hashtags |
| `data/stats.json` | **Persists across restarts** | Cumulative stats with daily buckets per event type |
| `data/sessions/` | **Persists** | Archived chat.json from previous sessions |
| `data/subs.json` | Refreshed from Twitch API | Subscriber list |
| `data/bits.json` | Refreshed from Twitch API | Bits leaderboard (current month) |
| `data/followers.json` | Refreshed from Twitch API | Follower list |
| `data/.twitch-token.json` | Persists | OAuth access/refresh tokens |

### Stats Daily Buckets

Stats are tracked with daily `YYYY-MM-DD` buckets for accurate date-range filtering. All event types are recorded: chatters, emotes, hashtags, subscribers, followers, gift subs, bits, donations, and raids.

### Migration

If you have stats data from before daily buckets were added, visit `http://localhost:8080/migrate.html` to migrate. The tool detects the old format, shows a preview, and lets you download a backup before applying.

Data is saved to disk every 5 seconds and on graceful shutdown (Ctrl+C).

## Troubleshooting

### Credits not loading
- Ensure `npm start` is running
- OBS URL should be `http://localhost:8080/credits.html`
- Right-click OBS source → "Refresh cache of current page"

### Twitch API errors (401 Unauthorized)
- Visit `http://localhost:8080/auth/twitch` to re-authorize
- Ensure `http://localhost:8080/auth/callback` is registered as an OAuth Redirect URL in your Twitch app
- Check that `client_id` and `client_secret` are correct in `config.json`

### No SSN/chat data
- SSN dock page must be open in a browser tab
- Enable Toggles 1 and 3 in SSN Global Settings → Mechanics
- Verify `session_id` in `config.json` matches your SSN dock URL
- Check `http://localhost:8080/api/status` — `ssn.connected` should be `true`

### Hashtags showing `#039`
- This was caused by HTML entities in chat messages — fixed in current version
- Hit `/api/stats/reset` to clear stale stats data

## File Structure

```
stream-credits/
├── server.js              # Unified server (HTTP + SSN + Twitch + OAuth)
├── config.json            # Your config and credentials (git-ignored)
├── config.example.json    # Template config
├── credits.html           # Credits overlay (HTML shell)
├── credits.css            # Credits overlay styles
├── credits.js             # Credits overlay client logic
├── stats.html             # Stats overlay (top chatters/emotes/hashtags)
├── migrate.html           # Stats migration tool (old format → daily buckets)
├── package.json           # Node.js dependencies
├── .gitignore             # Git ignore patterns
└── data/                  # Generated data (git-ignored)
    ├── .gitkeep
    ├── subs.json          # Twitch subscribers
    ├── bits.json          # Twitch bits leaderboard
    ├── followers.json     # Twitch followers
    ├── chat.json          # SSN session chat data (cleared on startup)
    ├── stats.json         # Persistent stats with daily buckets (survives restarts)
    ├── .twitch-token.json # OAuth tokens
    └── sessions/          # Archived chat.json from previous sessions
```

## Security

- `config.json` contains credentials — git-ignored, never commit
- `data/*.json` may contain subscriber info — git-ignored
- OAuth tokens stored locally in `data/.twitch-token.json` — git-ignored
- Server only listens on localhost

## License

Custom project for Jarbochov's stream.

## Built With

- [Twitch API](https://dev.twitch.tv/docs/api/)
- [SocialStream Ninja](https://socialstream.ninja/) by Steve Seguin
- [OBS Studio](https://obsproject.com/)
- [Font Awesome](https://fontawesome.com/) for social icons
- [Jersey 20](https://fonts.google.com/specimen/Jersey+20) Google Font
