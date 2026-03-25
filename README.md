# StreamPulse

Stream credits, live stats, chat logs, and community tracking — powered by [SocialStream Ninja](https://socialstream.ninja/) and the [Twitch API](https://dev.twitch.tv/docs/api/).

## Prerequisites

StreamPulse requires two external services to collect live stream data. Set both up before installing.

### 1. SocialStream Ninja (SSN)

SSN captures live chat messages, subscriptions, follows, raids, bits, and donations from Twitch (and YouTube, Kick, etc.) and forwards them to StreamPulse via WebSocket.

**Install & Configure:**
1. Install [SocialStream Ninja](https://socialstream.ninja/) — available as a **browser extension** or a **standalone desktop app**
2. Open SSN settings and go to **Global Settings → Mechanics**
3. Enable **Toggle 1** (Enable remote API control)
4. Enable **Toggle 3** (Send chat messages to API server)
5. Note your **Session ID** — visible in the `?session=` parameter of your dock.html or featured.html URL
6. Keep the SSN dock page open during your stream (browser tab or standalone app)

> **Tip:** You can test the connection using SSN's [API Sandbox](https://socialstream.ninja/sampleapi.html) — connect with your Session ID to see live messages.

### 2. Twitch Application

A Twitch app provides subscriber, follower, and bits data via the Twitch API.

**Create your app:**
1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and create a new application
2. Set the **OAuth Redirect URL** to `http://localhost:8080/auth/callback`
3. Note your **Client ID** and **Client Secret**

### 3. Other Requirements

- **Node.js** (v18+) — [nodejs.org](https://nodejs.org/)
- **OBS Studio** — For displaying browser source overlays

### Optional

- **Bitfocus Companion** — Trigger API endpoints via Stream Deck buttons

## Quick Start

```bash
npm install
cp config.example.json config.json
# Edit config.json with your Twitch and SSN credentials
npm start
```

On first run, a browser window opens for Twitch authorization. After that, the server handles everything automatically.

**OBS Browser Sources:**
- Credits: `http://localhost:8080/credits.html`
- Stats: `http://localhost:8080/stats.html`
- Hashtags: `http://localhost:8080/hashtags.html`

**Management Pages:**
- Dashboard: `http://localhost:8080/dashboard.html`
- Sessions: `http://localhost:8080/sessions.html`
- Highlights: `http://localhost:8080/highlights.html`
- Config: `http://localhost:8080/config-editor.html`

## Features

- **Credits Roll** — Cinematic scrolling credits with subscribers, followers, chatters, emotes, hashtags, raids, and more
- **Live Stats Overlay** — Persistent top chatters, emotes, and hashtags across sessions
- **Session History** — Browse archived sessions with full chat logs, searchable with boolean operators (`AND`, `OR`, `"exact phrase"`, `user:name`)
- **Highlights** — Pin notable chat messages and export them per session
- **Chat Log Exports** — Export filtered chat logs and highlights as TSV, TXT, or PDF (with per-user colored usernames and emote images)
- **Hashtag Tracking** — Live hashtag overlays with moderation (ban/unban/purge)
- **Dashboard** — Server status, session stats, message volume chart, and quick actions
- **Fully Configurable** — All sections, titles, social links, and options editable via web UI or `config.json`
- **Twitch OAuth** — Browser-based authorization with automatic token refresh
- **WebSocket Push** — Live data pushed to overlays in real-time
- **Session Lifecycle** — End/start session endpoints for Companion integration
- **Backup & Restore** — Download full data backups as ZIP, restore from backups
- **Discord Webhooks** — Optional notifications for raids, subs, donations, bits, and follows
- **Preview Mode** — `?preview=true` renders credits without scrolling for layout testing

## How It Works

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
                    │  ┌─────────────┐  ┌──────────────────┐   │
                    │  │ HTTP Server │  │ WebSocket Server │   │
                    │  └──────┬──────┘  └────────┬─────────┘   │
                    └─────────┼──────────────────┼─────────────┘
                              │ serves           │ pushes live data
              ┌───────────────┼─────────┐        │
              ▼               ▼         ▼        ▼
    ┌──────────────┐  ┌──────────┐  ┌──────────────────┐
    │ credits.html │  │stats.html│  │  dashboard.html   │
    │ (OBS source) │  │(OBS src) │  │  sessions.html    │
    └──────────────┘  └──────────┘  └──────────────────┘
```

**SSN detects these events via WebSocket:**
- Chat messages (all platforms)
- Subscriptions: `new_subscriber`, `resub`, `subscription_gift`
- Follows: `follow`, `new_follower`
- Raids: `raid`
- Bits/Cheers: via `hasDonation` field containing "bit"
- Donations: via `hasDonation` field
- Emotes and hashtags: parsed from chat messages

## Configuration

### config.json

Copy `config.example.json` to `config.json` and fill in your credentials:

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
  }
}
```

All other settings can be edited live via the [Config Editor](http://localhost:8080/config-editor.html) — no restart needed.

### Key Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `port` | number | `8080` | HTTP server port |
| `broadcaster_id` | string | | Your Twitch numeric broadcaster ID |
| `broadcaster_name` | string | | Your Twitch username (filtered from sub/follower lists) |
| `twitch_refresh_minutes` | number | `10` | Auto-refresh interval for Twitch API data |
| `days_filter` | number | `30` | Only show followers from last N days |
| `active_subs_only` | boolean | `false` | Only show subscribers who chatted this stream |
| `exclude_users` | array | `[]` | Usernames to exclude from all data (case-insensitive) |
| `banned_users` | array | `[]` | Usernames completely hidden from everything |
| `hashtags_enabled` | boolean | `true` | Enable hashtag tracking |
| `chat_log_enabled` | boolean | `true` | Enable chat log recording |
| `auto_backup_on_session_end` | boolean | `false` | Auto-backup data when ending a session |

### Credits Configuration

Credits sections, social links, and the special thanks section are all configurable via the Config Editor or directly in `config.json` under the `credits` key. Each section supports `enabled`, `title`, and `subtitle`.

### Overlay Theme

Customize the look of all overlays (credits, stats, hashtags) from the Config Editor under **Overlay Theme**:

- **Font** — Choose from popular Google Fonts or enter any custom Google Font name
- **Text / Accent Colors** — Color pickers with manual hex/rgb input
- **Background** — Set to `transparent` for OBS (default), or pick a color for previewing
- **Text Outline** — Toggle the shadow outline on/off, pick outline color
- **Font Scale** — Scale all overlay text proportionally (0.5× – 2×)

### Discord Webhooks

Optional webhook notifications for stream events:

```json
{
  "webhooks": {
    "enabled": true,
    "discord_url": "https://discord.com/api/webhooks/...",
    "events": ["raid", "subscribe", "donation", "bits", "follow"],
    "batch_seconds": 5
  }
}
```

## URL Parameters

### credits.html

| Parameter | Default | Description |
| --- | --- | --- |
| `duration` | `82` | Scroll duration in seconds |
| `speed` | | Speed multiplier (only if `duration` not set) |
| `days` | config value | Override days_filter from config |
| `preview` | `false` | Show all credits without scrolling |

> **🎵 Syncing credits with music:** Set `?duration=` to match your end-of-stream track length so the credits scroll finishes exactly when the song ends. For example, `?duration=75` for a 1:15 track. Use a Companion/StreamDeck button to trigger both the OBS credits source and music simultaneously for a clean outro.

### stats.html

| Parameter | Default | Description |
| --- | --- | --- |
| `days` | all time | Only show stats from last N days |
| `date` | | Single date (`YYYY-MM-DD`) |
| `from` / `to` | | Date range |
| `limit` | `20` | Top N items per column |
| `refresh` | `60` | Auto-refresh interval in seconds |

## API Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/status` | Server health, SSN connection, data counts |
| `GET /api/config` | Current config |
| `PUT /api/config` | Update config (hot-reload) |
| `GET /api/fetch` | Trigger Twitch API refresh |
| `GET /api/reset` | Clear session chat data |
| `GET /api/end-session` | Archive session + reset |
| `GET /api/start-session` | Start new session |
| `GET /api/shutdown` | Archive + graceful shutdown |
| `GET /api/chat` | Current session data (live) |
| `GET /api/chat-log` | Current session chat log |
| `GET /api/chat-log/search` | Cross-session search (`?q=`, `?user=`, `?type=`, `?session=`) |
| `GET /api/chat-log/export` | Export chat log (`?format=tsv\|txt\|pdf`, `?q=`, `?type=`) |
| `GET /api/stats` | Persistent stats (daily buckets) |
| `GET /api/sessions` | List archived sessions |
| `GET/POST/DELETE /api/highlights` | Pin/unpin/list highlights |
| `GET /api/highlights/export` | Export highlights (`?format=`, `?session=`, `?q=`) |
| `GET/POST/DELETE /api/hashtags/banned` | Hashtag moderation |
| `GET /api/export` | Stats CSV export (`?type=chatters\|emotes\|all`) |
| `GET /api/backup` | Download full data backup (ZIP) |
| `GET /auth/twitch` | Start Twitch OAuth flow |
| `ws://localhost:8080` | WebSocket — live data push |

## Bitfocus Companion Integration

Use the **Generic HTTP** module:

| Action | URL |
| --- | --- |
| Refresh Twitch data | `GET http://localhost:8080/api/fetch` |
| End session | `GET http://localhost:8080/api/end-session` |
| Start new session | `GET http://localhost:8080/api/start-session` |
| Shutdown server | `GET http://localhost:8080/api/shutdown` |

## Data Persistence

| File | Lifecycle | Contains |
| --- | --- | --- |
| `data/chat.json` | Cleared on startup (archived) | Session chatters, subs, emotes, hashtags |
| `data/stats.json` | Persists across restarts | Cumulative stats with daily buckets |
| `data/sessions/` | Persists | Archived session data + JSONL chat logs |
| `data/highlights.json` | Persists | Pinned chat messages |
| `data/subs.json` | Refreshed from Twitch API | Subscriber list |
| `data/bits.json` | Refreshed from Twitch API | Bits leaderboard |
| `data/followers.json` | Refreshed from Twitch API | Follower list |
| `data/.twitch-token.json` | Persists | OAuth tokens |

Data is saved to disk every 5 seconds and on graceful shutdown (Ctrl+C).

## File Structure

```
streampulse/
├── server.js              # Unified server (HTTP + WebSocket + SSN + Twitch)
├── config.json            # Your config and credentials (git-ignored)
├── config.example.json    # Template config
├── credits.html/css/js    # Credits overlay (OBS browser source)
├── stats.html             # Stats overlay (OBS browser source)
├── hashtags.html          # Hashtag overlay (OBS browser source)
├── dashboard.html         # Dashboard UI
├── sessions.html          # Session history + chat logs
├── highlights.html        # Highlights viewer
├── config-editor.html     # Live config editor
├── backup.html            # Backup & restore
├── manage-hashtags.html   # Hashtag moderation
├── api.html               # API reference
├── docs.html              # Documentation
├── nav.js                 # Shared navigation
├── rebuild-session.js     # Utility: rebuild session from JSONL
└── data/                  # Generated data (git-ignored)
```

## Troubleshooting

### No SSN/chat data
1. SSN dock page must be open in a browser tab
2. Ensure **Toggle 1** and **Toggle 3** are enabled in SSN Global Settings → Mechanics
3. Verify `session_id` in `config.json` matches the `?session=` value in your SSN dock URL
4. Check `http://localhost:8080/api/status` — `ssn.connected` should be `true`
5. Test with the [SSN API Sandbox](https://socialstream.ninja/sampleapi.html) to verify messages are flowing

### Twitch API errors (401)
- Visit `http://localhost:8080/auth/twitch` to re-authorize
- Ensure `http://localhost:8080/auth/callback` is registered as an OAuth Redirect URL
- Verify `client_id` and `client_secret` in `config.json`

### Credits not loading
- Ensure `npm start` is running
- OBS URL: `http://localhost:8080/credits.html`
- Right-click OBS source → "Refresh cache of current page"

## Security

- `config.json` contains credentials — git-ignored, never commit
- OAuth tokens stored locally in `data/.twitch-token.json` — git-ignored
- Server only listens on localhost

## Built With

- [SocialStream Ninja](https://socialstream.ninja/) by Steve Seguin
- [Twitch API](https://dev.twitch.tv/docs/api/)
- [OBS Studio](https://obsproject.com/)
- [Puppeteer](https://pptr.dev/) for PDF exports
- [Font Awesome](https://fontawesome.com/) for icons
- [Jersey 20](https://fonts.google.com/specimen/Jersey+20) Google Font
