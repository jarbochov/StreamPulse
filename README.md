[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Z8Z11UEY5Q)

# StreamPulse

A self-hosted stream overlay toolkit — built around a cinematic **credits roll** that recognizes the people who make your stream what it is: subscribers, followers, cheerers, raiders, gifters, and chatters.

StreamPulse started as a way to give every community member their moment in the spotlight at the end of a stream. It grew into a full data toolkit with live stats, session history, searchable chat logs, hashtag tracking, highlights, and more — all powered by [SocialStream Ninja](https://socialstream.ninja/) and the [Twitch API](https://dev.twitch.tv/docs/api/).

> **Hashtags** are a fun way to capture community moments in smaller streams — viewers drop `#blessed` or `#teamwipe` and they show up live on the overlay and in the credits. For larger communities, you'll want to use the built-in moderation tools (ban/purge) or disable hashtags entirely unless you have a solid moderation process.

## Installation

### 1. Install Node.js

StreamPulse runs on [Node.js](https://nodejs.org/). Download and install the **LTS version** (v18 or newer):

- **Mac:** Download the `.pkg` installer from [nodejs.org](https://nodejs.org/) and double-click to install
- **Windows:** Download the `.msi` installer from [nodejs.org](https://nodejs.org/) and run through the setup wizard

To verify it's installed, open **Terminal** (Mac) or **Command Prompt** (Windows) and type:
```bash
node --version
```
You should see something like `v20.x.x`.

### 2. Download StreamPulse

Go to the [Releases page](https://github.com/jarbochov/streampulse/releases) and download the **Source code (zip)** from the latest release.

1. Unzip the downloaded file
2. Move the folder somewhere convenient (e.g. your Documents folder)
3. Rename it to `streampulse` if you'd like

### 3. Set up credentials

Before starting, you'll need a **Twitch Application** and **SocialStream Ninja** configured (see [Prerequisites](#prerequisites) below).

Open the `streampulse` folder and:

1. Make a copy of `config.example.json` and name it `config.json`
2. Open `config.json` in any text editor and fill in your credentials:
   - `broadcaster_id` — Your Twitch numeric ID (look it up at [streamscharts.com/tools/convert-username](https://streamscharts.com/tools/convert-username))
   - `broadcaster_name` — Your Twitch username
   - `client_id` and `client_secret` — From your Twitch application (see [Prerequisites](#prerequisites))
   - `session_id` — Your SSN Session ID

### 4. Install and run

Open **Terminal** (Mac) or **Command Prompt** (Windows), then navigate to your StreamPulse folder:

```bash
cd ~/Documents/streampulse
```

> **Windows tip:** You can also type `cmd` in the File Explorer address bar while inside the folder to open a Command Prompt there.

Install dependencies (only needed the first time, or after updates):
```bash
npm install
```

Install the bundled Chrome used for PDF exports on this machine:
```bash
npm run install:chrome
```

Start the server:
```bash
npm start
```

On first run, a browser window opens for Twitch authorization. After that, the server handles everything automatically.

### 5. Add to OBS

Add **Browser Sources** in OBS with these URLs:
- Credits: `http://localhost:3000/credits.html`
- Stats: `http://localhost:3000/stats.html`
- Hashtags: `http://localhost:3000/hashtags.html`
- Goal: `http://localhost:3000/goal.html?goal=follower-goal`
- Goals Cycle: `http://localhost:3000/goal.html?mode=cycle`
- Music: `http://localhost:3000/music.html`
- Countdown: `http://localhost:3000/countdown.html?timer=starting-soon`
- Stopwatch: `http://localhost:3000/stopwatch.html?timer=run-clock`

**Management pages** (open in your browser, not OBS):
- Dashboard: `http://localhost:3000/dashboard.html`
- Sessions: `http://localhost:3000/sessions.html`
- Highlights: `http://localhost:3000/highlights.html`
- Goals: `http://localhost:3000/goals-editor.html`
- Config: `http://localhost:3000/config-editor.html`
- Music Editor: `http://localhost:3000/music-editor.html`
- Timer Manager: `http://localhost:3000/timers-editor.html`
- Timer URL Wizard: `http://localhost:3000/timer-url-wizard.html`

## Prerequisites

StreamPulse requires two external services to collect live stream data. Set both up before installing.

### SocialStream Ninja (SSN)

SSN captures live chat messages, subscriptions, follows, raids, bits, and donations from Twitch (and YouTube, Kick, etc.) and forwards them to StreamPulse via WebSocket.

**Install & Configure:**
1. Install [SocialStream Ninja](https://socialstream.ninja/) — available as a **browser extension** or a **standalone desktop app**
2. Open SSN settings and go to **Global Settings → Mechanics**
3. Enable **Toggle 1** (Enable remote API control)
4. Enable **Toggle 3** (Send chat messages to API server)
5. Note your **Session ID** — visible in the `?session=` parameter of your dock.html or featured.html URL
6. Keep the SSN dock page open during your stream (browser tab or standalone app)

> **Tip:** You can test the connection using SSN's [API Sandbox](https://socialstream.ninja/sampleapi.html) — connect with your Session ID to see live messages.

### Twitch Application

A Twitch app provides subscriber, follower, and bits data via the Twitch API.

**Create your app:**
1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and create a new application
2. Set the **OAuth Redirect URL** to `http://localhost:3000/auth/callback`
3. Note your **Client ID** and **Client Secret**

### Optional

- **Bitfocus Companion** — Trigger API endpoints via Stream Deck buttons
- **OBS Studio** — For displaying browser source overlays

## Features

- **Credits Roll** — Cinematic scrolling credits with subscribers, followers, chatters, emotes, hashtags, raids, gift subs, cheerers, and optional fade-style text sections for custom sections, Special Thanks, or the closing message
- **Music Overlay** — "Now Playing" overlay for Apple Music, Spotify, and VLC with album art, marquee titles, and multiple display modes
- **Named Timers** — Shared countdown and stopwatch overlays with duration or target-date countdown modes, pause/resume controls, quick add/subtract time adjustments, persistent state, and Companion-friendly field endpoints
- **Goals + Viewer Tracking** — Live viewer sampling plus configurable follower, subscriber, gift sub, bits, donation, viewer, and combined community goals with single-goal and rotating cycle overlays
- **Live Stats Overlay** — Persistent top chatters, emotes, and hashtags across sessions
- **Session History** — Browse archived sessions with full chat logs, searchable with boolean operators (`AND`, `OR`, `"exact phrase"`, `user:name`)
- **Highlights** — Pin notable chat messages and export them per session
- **Chat Log Exports** — Export filtered chat logs and highlights as TSV, TXT, or PDF (with the same quoted phrase / AND / OR / `user:name` filtering used in search)
- **Hashtag Tracking** — Live hashtag overlays with moderation plus a dedicated sortable admin stats page
- **Dashboard** — Server status, session stats, message volume chart, and quick actions
- **Fully Configurable** — All sections, titles, social links, and options editable via web UI or `config.json`
- **Twitch OAuth** — Browser-based authorization with automatic token refresh
- **WebSocket Push** — Live data pushed to overlays in real-time
- **Session Lifecycle** — End/start session endpoints for Companion integration
- **Backup & Restore** — Download full data backups as ZIP, including the current live session, and restore them with restart guidance when connection settings changed
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

All other settings can be edited live via the [Config Editor](http://localhost:3000/config-editor.html) — no restart needed.

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
| `music.enabled` | boolean | `false` | Enable music "Now Playing" overlay |
| `music.source` | string | `apple_music` | Music source: `apple_music`, `spotify`, or `vlc` |
| `music.poll_seconds` | number | `5` | How often to check for track changes |
| `viewer_tracking.enabled` | boolean | `true` | Enable current viewer polling and session sampling |
| `viewer_tracking.poll_seconds` | number | `60` | How often to sample current viewers |
| `viewer_tracking.retain_samples` | number | `720` | Max session viewer samples to keep |

### Goals Configuration

Goals are managed from **Goals Manager** (`/goals-editor.html`) and stored in `config.json` under `viewer_tracking` and `goals`.

- **Viewer tracking** samples current viewers into the current session and archives those samples with the session for peak/average metrics.
- With `source: "best_available"`, recent viewer-count packets received from SocialStream Ninja are used first; Twitch polling is used when SSN has not supplied a recent count. Set `source: "twitch"` to force Twitch polling.
- **Goal targets are manual**, but progress is computed automatically from live session data, Twitch snapshots, and viewer samples.
- **Persistent goals** count upward from a saved baseline until you manually reset them.
- **Session goals** use the current stream/session totals.
- **Viewer goals** support either **current viewers** or **peak viewers**.
- **Community goals** use weighted points across follows, subs, gift subs, bits, and donations.

### Credits Configuration

Credits sections, social links, special thanks, and repeatable custom credit sections are all configurable via the Config Editor or directly in `config.json` under the `credits` key. Built-in sections support `enabled`, `title`, and `subtitle`; custom sections also support a freeform `body`, `columns`, `names`, `display_style`, and `display_duration` list/panel configuration. Use `credits.section_order` to place built-in sections, custom sections, and Special Thanks anywhere in the roll. Fade sections still fit inside the base credits `?duration=` by default, and any `display_duration` value adds extra seconds on top of that base sequence before socials.

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
| `duration` | `82` | Total credits duration in seconds before socials appear |
| `speed` | | Speed multiplier (only if `duration` not set) |
| `days` | config value | Override days_filter from config |
| `preview` | `false` | Show all credits without scrolling |

> **🎵 Syncing credits with music:** Set `?duration=` to match your base end-of-stream credits sequence before socials. For example, `?duration=75` for a 1:15 base roll. Fade sections stay inside that base duration by default, and any non-zero per-section fade duration adds extra time on top. Use a Companion/StreamDeck button to trigger both the OBS credits source and music simultaneously for a clean outro.

### goal.html

| Parameter | Default | Description |
| --- | --- | --- |
| `goal` | first enabled | Goal ID for single-goal mode |
| `mode` | `single` | Use `cycle` to rotate through enabled goals |
| `ids` | all enabled | Comma-separated subset of goal IDs for cycle mode |
| `interval` | config value | Cycle interval override in seconds |
| `skipcompleted` | config value | Override whether completed goals are skipped in cycle mode |
| `pausecomplete` | config value | Override the extra hold time for completed goals in cycle mode |
| `fontscale` | config theme | Override goal overlay font scale |

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
| `GET /api/viewers` | Current/peak/average viewer summary + samples |
| `GET /api/goals` | Computed goal snapshot with live progress |
| `GET/PUT /api/goals/config` | Goal and viewer-tracking settings |
| `POST /api/goals/:id/reset` | Reset a persistent goal baseline to current values |
| `POST /api/goals/:id/toggle` | Toggle a goal enabled/disabled |
| `GET /api/fetch` | Trigger Twitch API refresh |
| `GET /api/reset` | Clear session chat data |
| `GET /api/end-session` | Archive session + reset |
| `GET /api/start-session` | Start new session |
| `GET /api/shutdown` | Archive + graceful shutdown |
| `GET /api/chat` | Current session data (live) |
| `GET /api/chat-log` | Current session chat log |
| `GET /api/chat-log/search` | Cross-session search (`?q=`, `?user=`, `?type=`, `?session=`) |
| `GET /api/chat-log/export` | Export chat log (`?format=tsv\|txt\|pdf`, `?q=`, `?user=`, `?type=`, `?session=`) |
| `GET /api/stats` | Persistent stats (daily buckets) |
| `GET /api/sessions` | List archived sessions |
| `GET/POST/DELETE /api/highlights` | Pin/unpin/list highlights |
| `GET /api/highlights/export` | Export highlights (`?format=`, `?session=`, `?q=`) |
| `GET /api/hashtags/stats` | Hashtag stats summary + table data |
| `GET/POST/DELETE /api/hashtags/banned` | Hashtag moderation |
| `GET /api/export` | Stats CSV export (`?type=chatters\|emotes\|all`) |
| `GET /api/backup` | Download full data backup (ZIP) |
| `GET /auth/twitch` | Start Twitch OAuth flow |
| `GET /api/music/now-playing` | Current track info (JSON) |
| `GET /api/music/artwork` | Current album art image |
| `ws://localhost:3000` | WebSocket — live data push |

## Bitfocus Companion Integration

Use the **Generic HTTP** module:

| Action | URL |
| --- | --- |
| Refresh Twitch data | `GET http://localhost:3000/api/fetch` |
| End session | `GET http://localhost:3000/api/end-session` |
| Start new session | `GET http://localhost:3000/api/start-session` |
| Shutdown server | `GET http://localhost:3000/api/shutdown` |

## Data Persistence

| File | Lifecycle | Contains |
| --- | --- | --- |
| `data/chat.json` | Cleared on startup (archived) | Session chatters, subs, emotes, hashtags |
| `data/chat.json.viewerStats` | Cleared on startup (archived) | Session viewer samples plus current/peak/average viewer data |
| `data/stats.json` | Persists across restarts | Cumulative stats with daily buckets |
| `data/sessions/` | Persists | Archived session data + JSONL chat logs |
| `data/highlights.json` | Persists | Pinned chat messages |
| `data/timers.json` | Persists | Named countdowns, stopwatches, timer state, global sound settings, and per-timer HTTP action settings |
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
├── goal.html              # Goal overlay (single or rotating cycle)
├── music.html             # Music "Now Playing" overlay (OBS browser source)
├── countdown.html         # Countdown overlay (OBS browser source)
├── stopwatch.html         # Stopwatch overlay (OBS browser source)
├── goals-editor.html      # Goals manager + viewer tracking settings
├── music-editor.html      # Music overlay customization
├── music-url-wizard.html  # Music URL builder
├── timers-editor.html     # Named timer manager
├── timer-url-wizard.html  # Timer overlay URL builder
├── dashboard.html         # Dashboard UI
├── sessions.html          # Session history + chat logs
├── highlights.html        # Highlights viewer
├── categories.html        # Stream categories viewer
├── config-editor.html     # Live config editor
├── backup.html            # Backup & restore
├── hashtag-stats.html     # Hashtag stats admin page
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
4. Check `http://localhost:3000/api/status` — `ssn.connected` should be `true`
5. Test with the [SSN API Sandbox](https://socialstream.ninja/sampleapi.html) to verify messages are flowing

### Twitch API errors (401)
- Visit `http://localhost:3000/auth/twitch` to re-authorize
- Ensure `http://localhost:3000/auth/callback` is registered as an OAuth Redirect URL
- Verify `client_id` and `client_secret` in `config.json`

### Credits not loading
- Ensure `npm start` is running
- OBS URL: `http://localhost:3000/credits.html`
- Right-click OBS source → "Refresh cache of current page"

### PDF export says Chrome could not be found
- Puppeteer's browser download is machine-specific
- Run `npm run install:chrome`
- Restart StreamPulse with `npm start`
- If needed, reinstall dependencies first with `npm install`

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
