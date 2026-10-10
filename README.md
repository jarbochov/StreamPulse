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

Before starting, you'll need a **SocialStream Ninja** session ID (see [Prerequisites](#prerequisites) below). Twitch is connected from inside StreamPulse, so you don't need a Twitch developer app.

Open the `streampulse` folder and:

1. Make a copy of `config.example.json` and name it `config.json`
2. Open `config.json` in any text editor and fill in your credentials:
   - `session_id` — Your SSN Session ID (you can also set it later in the Config Editor)
   - Twitch is optional here. Leave `broadcaster_id`, `broadcaster_name` and the `twitch` fields blank and connect from the app in the next step. Only fill them in if you want to use your own Twitch application (see [Twitch](#twitch-application))

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

Or double-click `start-streampulse.bat` (Windows) or run `./start-streampulse.sh` (macOS/Linux). They install dependencies on first run and start the server.

On first run, open `http://localhost:3000/twitch-connect.html`, click **Connect with Twitch**, enter the code on twitch.tv and approve. Your Twitch ID and username are filled in automatically, and the token is refreshed in the background from then on.

### 5. Add to OBS

Add **Browser Sources** in OBS with these URLs:
- Credits: `http://localhost:3000/credits.html`
- Stats: `http://localhost:3000/stats.html`
- Hashtags: `http://localhost:3000/hashtags.html`
- Goal: `http://localhost:3000/goal.html?goal=follower-goal`
- Goals Cycle: `http://localhost:3000/goal.html?mode=cycle`
- Viewer Count: `http://localhost:3000/viewers.html`
- Music: `http://localhost:3000/music.html`
- Countdown: `http://localhost:3000/countdown.html?timer=starting-soon`
- Stopwatch: `http://localhost:3000/stopwatch.html?timer=run-clock`
- Layouts: add `&display=standard|compact|stacked|ring|flip|banner`; animate the box with `&gradient=ff0080,7928ca,2afadf&gradientspeed=8&gradientangle=135` (the URL Wizard builds these)

**Management pages** (open in your browser, not OBS):
- Dashboard: `http://localhost:3000/dashboard.html`
- Sessions: `http://localhost:3000/sessions.html`
- Highlights: `http://localhost:3000/highlights.html`
- Clips (Beta): `http://localhost:3000/clips.html`
- Goals: `http://localhost:3000/goals-editor.html`
- Config: `http://localhost:3000/config-editor.html`
- Credits: `http://localhost:3000/credits-editor.html`
- Theme: `http://localhost:3000/theme-editor.html`
- Overlays hub (every browser source, copy URL, customize): `http://localhost:3000/overlays.html`
- Overlay URL Wizard: `http://localhost:3000/overlay-url-wizard.html`
- Overlay URL parameter names are case-insensitive (`fontScale` = `fontscale`); lowercase is the documented form.
- Custom Overlays: `http://localhost:3000/custom-overlays.html`
- Game Plan: `http://localhost:3000/game-plan-editor.html`
- Music Editor: `http://localhost:3000/music-editor.html`
- Timer Manager: `http://localhost:3000/timers-editor.html`
- Timer URL Wizard: `http://localhost:3000/timer-url-wizard.html`

## Prerequisites

StreamPulse requires two external services to collect live stream data. Set both up before installing.

### SocialStream Ninja (SSN)

SSN captures live chat messages, subscriptions, follows, raids, bits, and donations from Twitch (and YouTube, Kick, etc.) and forwards them to StreamPulse via WebSocket.

**Install & Configure:**
1. Install [SocialStream Ninja](https://socialstream.ninja/) — available as a **browser extension** or a **standalone desktop app**
2. Open SSN settings and go to **Global Mechanics → Mechanics - Connections & Integrations**
3. Enable **Enable remote API control of extension**
4. Enable **Send chat messages to API server**
5. Note your **Session ID** — visible in the `?session=` parameter of your dock.html or featured.html URL
6. Keep the SSN dock page open during your stream (browser tab or standalone app)

> **Tip:** You can test the connection using SSN's [API Sandbox](https://socialstream.ninja/sampleapi.html) — connect with your Session ID to see live messages.

### Twitch Application

**You don't need to create one.** StreamPulse ships with a built-in Twitch connection. Start it, open `http://localhost:3000/twitch-connect.html`, click **Connect with Twitch**, enter the code on twitch.tv and approve. This provides subscriber, follower, and bits data, and fills in your Twitch ID and username automatically. Leave the `twitch` fields in `config.json` blank.

Clip creation in **Clips (Beta)** requires `clips:edit` for live clips. VOD clip creation requires broadcaster authorization with `channel:manage:clips` (or editor authorization with `editor:manage:clips`). If StreamPulse was authorized before VOD clipping was enabled, reconnect from the Twitch connect page to refresh the saved token with the new permissions.

**Optional: use your own Twitch app** (for example if you host StreamPulse somewhere other than localhost):
1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and create a new application
2. Set the **OAuth Redirect URL** to the exact address StreamPulse uses (`http://localhost:3000/auth/callback`, or the value of `twitch.redirect_uri`)
3. Put the **Client ID** and **Client Secret** in `config.json`:

```json
"twitch": {
  "client_id": "YOUR_TWITCH_CLIENT_ID",
  "client_secret": "YOUR_TWITCH_CLIENT_SECRET",
  "redirect_uri": "http://localhost:3000/auth/callback"
}
```

### Optional

- **Bitfocus Companion** — Trigger API endpoints via Stream Deck buttons
- **OBS Studio** — For displaying browser source overlays

## Features

- **Credits Roll** — Cinematic scrolling credits with subscribers, followers, chatters, emotes, hashtags, raids, gift subs, cheerers, and optional fade-style text sections for custom sections, Special Thanks, or the closing message
- **Music Overlay** — "Now Playing" overlay for Apple Music, Spotify, and VLC with album art, marquee titles, and multiple display modes
- **Named Timers** — Shared countdown and stopwatch overlays with duration or target-date countdown modes, pause/resume controls, quick add/subtract time adjustments, persistent state, and Companion-friendly field endpoints
- **Appearance** — Dark, light or match-system mode and a custom accent color for all admin pages, set in the Config Editor (or the ☀️/🌙 nav toggle). Stored per browser; shared styles live in `admin.css` and `appearance.js`. Overlays are unaffected.
- **Alerts (Beta)** — Rule-based on-screen alerts for follows, subs, resubs, milestones, gifted subs, bits, donations, raids, channel point redeems, finished timers, reached goals and chat words. Random/weighted variants, tiered thresholds, image/GIF/video/sound uploads, an emoji option with an amount-based emoji ladder (e.g. 🥉 at 100 bits, 💎💎💎 at 10,000), built-in synthesized sounds (ding, chime, coin, fanfare, level up, pop, whoosh), animations, a queue with skip/pause, an event queue page with replay (usable as an OBS dock), and optional timer or HTTP actions. Shown through an **Alert box** element in the custom overlay editor
- **Goals + Viewer Tracking** — Live viewer sampling plus configurable follower, subscriber, gift sub, bits, donation, viewer, and combined community goals with single-goal and rotating cycle overlays
- **Game Plan** — Manually curated Scheduled, Backlog, Played and your own custom lists (Scheduled, Backlog and Played are mutually exclusive; a game can also be on any number of custom lists via "Also on" in its edit dialog) with IGDB cover art, release years and genres. Pick the exact game when names collide (e.g. Doom), group by period such as "October", and mark the game matching your Twitch category as *Now playing*. When a session ends, every game you streamed for at least 15 minutes that isn't on any list is added to Played automatically, and games already on a list stay where they are but gain the dates you streamed them. *Import past games* in the Game Plan editor does the same for your archived sessions; Twitch categories that aren't games (Just Chatting, Special Events, Music, ...) are skipped. The Game list element can then show only games played in a year or month (`thisYear`, `lastMonth`, `2026`, `2026-10`) and group them by month or year
- **Live Stats Overlay** — Persistent top chatters, emotes, and hashtags across sessions
- **Session History** — Browse archived sessions with full chat logs, searchable with boolean operators (`AND`, `OR`, `"exact phrase"`, `user:name`)
- **Highlights** — Pin notable chat messages and export them per session
- **Clip Candidates (Beta)** — Detect notable events and chat spikes, add manual markers, and request Twitch clips with edit/view links
- **Chat Log Exports** — Export filtered chat logs and highlights as TSV, TXT, or PDF (with the same quoted phrase / AND / OR / `user:name` filtering used in search)
- **Hashtag Tracking** — Live hashtag overlays with moderation plus a dedicated sortable admin stats page
- **Dashboard** — Server status, session stats, message volume chart, and quick actions
- **Fully Configurable** — All sections, titles, social links, and options editable via web UI or `config.json`
- **Twitch Connect** — Built-in device-code sign-in (no Twitch developer app needed) with automatic background token refresh
- **WebSocket Push** — Live data pushed to overlays in real-time
- **Session Lifecycle** — End/start session endpoints for Companion integration
- **Backup & Restore** — Download full data backups as ZIP, including the current live session, and restore them with restart guidance when connection settings changed
- **Update** — Check for and manually install the latest stable release, or explicitly opt in to a warned nightly `main` build from the Manage menu

The updater works on Windows, macOS, and Linux when StreamPulse is run from a Git checkout with Git and Node.js/npm available. On Windows, the server uses the native `npm.cmd` command automatically. Keep the production folder writable and avoid running with uncommitted tracked code changes; data is backed up before an update.
- **Preview Mode** — `?preview=true` renders credits without scrolling for layout testing
- **Multipage overlays** — Turn on **Pages** in the overlay editor to build a slide deck: add, duplicate, reorder and rename pages, switch pages on or off (off pages are skipped by next/prev/auto and can't be switched to), mark elements as shared across all pages, and choose manual or automatic advance (cycle time plus per-page duration, loop, none/fade/slide transitions). Switch pages from the control panel (`/overlay-control.html?id=<id>`, usable as an OBS dock), the `POST /api/custom-overlays/:id/page` API, or pin a source with `?page=<id|name|number>`
- **Custom Overlays** — Create JSON-backed canvas overlays with text, Markdown, images, video, shapes, progress bars/rings, scannable QR codes, groups, gradients, and live WebSocket updates after saving. Text, Random Text and Markdown elements can be typed inline, loaded from an uploaded library file, or read in place from a `.txt`/`.md` file on your computer (picked with a Finder dialog; edits show up automatically). Image and video elements can also use a file in place from your computer. Text elements can auto-fit (shrink or grow) to their box. Markdown elements can flow into 2–4 columns, with a choice of which heading levels span all columns. Markdown heading size can be scaled (40–200%). Text, image and progress elements accept live `{{placeholders}}` (dates can be formatted, e.g. `{{now|MMM D, h:mm A}}`) (stream stats, clock, timers, goals, latest events, Twitch category and IGDB game data, music title/artist/cover/progress, Game Plan lists), and the **Game list** element renders your Game Plan as a cover grid, strip or text list with cover-fit and shrink-to-fit options

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
  "broadcaster_id": "",
  "broadcaster_name": "",
  "twitch": {},
  "ssn": {
    "session_id": "YOUR_SSN_SESSION_ID",
    "server": "wss://io.socialstream.ninja"
  }
}
```

All other settings can be edited via the [Config Editor](http://localhost:3000/config-editor.html). Most apply immediately; the SocialStream session and Twitch polling intervals need a restart, and the editor offers a **Restart now** button when you change them.

### Key Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `port` | number | `8080` | HTTP server port |
| `broadcaster_id` | string | | Your Twitch numeric broadcaster ID |
| `broadcaster_name` | string | | Your Twitch username (filtered from sub/follower lists) |
| `twitch_refresh_minutes` | number | `10` | Auto-refresh interval for Twitch API data (followers, subs, clips) |
| `twitch_stream_info_seconds` | number | `30` | How often the stream title and category are polled |
| `days_filter` | number | `30` | Only show followers from last N days |
| `active_subs_only` | boolean | `false` | Only show subscribers who chatted this stream |
| `exclude_users` | array | `[]` | Usernames to exclude from all data (case-insensitive) |
| `banned_users` | array | `[]` | Usernames completely hidden from everything |
| `hashtags_enabled` | boolean | `true` | Enable hashtag tracking |
| `chat_log_enabled` | boolean | `true` | Enable chat log recording |
| `auto_backup_on_session_end` | boolean | `false` | Auto-backup data when ending a session |
| `game_plan_auto` | object | `{"enabled":true,"min_minutes":15,"skip":["Just Chatting"]}` | Auto-add streamed games to the Game Plan as Played when a session ends; `skip` lists extra categories to ignore |
| `session_lifecycle.auto` | boolean | `true` | Auto start/end sessions from Twitch live status (needs Twitch connected) |
| `session_lifecycle.end_grace_minutes` | number | `15` | Minutes offline before a session auto-ends; outages/API errors never count |
| `session_lifecycle.resume_window_minutes` | number | `120` | Going live again within this window reopens the last archived session |
| `session_lifecycle.min_session_minutes` | number | `5` | Auto-ended streams shorter than this are discarded |
| `session_lifecycle.poll_seconds` | number | `30` | How often to check Twitch live status |
| `music.enabled` | boolean | `false` | Enable music "Now Playing" overlay |
| `music.source` | string | `apple_music` | Music source: `apple_music`, `spotify`, or `vlc` |
| `music.poll_seconds` | number | `5` | How often to check for track changes |
| `viewer_tracking.enabled` | boolean | `true` | Enable current viewer polling and session sampling |
| `viewer_tracking.poll_seconds` | number | `60` | How often to sample current viewers |
| `viewer_tracking.retain_samples` | number | `720` | Max session viewer samples to keep |
| `weather.enabled` | boolean | `false` | Enable weather placeholders (`{{weather.temp}}`, `{{weather.icon}}`, …) from Open-Meteo |
| `weather.location` | string | `""` | City to look up, e.g. `Pittsburgh, PA` |
| `weather.extra_locations` | array | `[]` | Extra cities (max 8), used as `{{weather.<city>.temp}}` |
| `weather.units` | string | `imperial` | `imperial` (°F, mph) or `metric` (°C, km/h) |
| `weather.poll_minutes` | number | `15` | How often to refresh the weather |

Weather placeholders beyond the current temperature: `{{weather.gusts}}`, `cloud_cover`, `pressure`, `uv`, `sunrise`, `sunset`; the next six hours as `{{weather.h1.temp}}` … `h6` (`time`, `temp`, `icon`, `icon.url`, `condition`, `precip`); and the next five days as `{{weather.d1.high}}` … `d5` (`day`, `high`, `low`, `icon`, `icon.url`, `condition`, `precip`; `d1` is tomorrow). Extra cities get the same names, e.g. `{{weather.tokyo.d1.high}}`.

**Overlay editor presets:** *Add element → Presets…* opens a searchable picker (counter, clock, latest activity, now playing, game banner, and weather cards/forecasts; weather presets only show while weather is enabled). Select elements and use the ☆ **Save as preset** button in the properties panel to build your own; they are stored in `data/overlay-presets.json` and included in backups.

**Show/hide any overlay:** `POST /api/overlay-visibility/<key>` with `{"action":"on"|"off"|"toggle"}` fades the whole overlay page out or in. Keys are `credits`, `goal`, `countdown`, `stopwatch`, `music` and `custom:<overlayId>`; `GET /api/overlay-visibility` lists them with their state. Visibility resets to shown when the server restarts.

**Asset tags and slideshows:** In the Asset Library, give assets one or more tags (`+ Tag`, bulk *Tag N selected…*, or a tags field next to *Upload*) and filter by tag or *Untagged*. Tags are stored in `data/asset-tags.json` and included in backups. The **Slideshow** element (*Add element → Slideshow*) plays images either by tag (live: tag changes show up within ~20 seconds; match any or all tags) or from a hand-picked list. Options: seconds per image, order (newest/shuffle/random), fit, fade/slide transitions, slow zoom, and a caption (none, the asset's own caption, or the file name). Set an asset's caption with *+ Caption* in the Asset Library (`data/asset-captions.json`). With many tags, filters show the most-used ones plus a search box, and *Manage tags…* lets you rename, merge or delete a tag everywhere (slideshows using it are updated). Set *Advance* to Manually to step through slides yourself: `POST /api/custom-overlays/<id>/slideshow` with `{"action":"next"}` (also `prev`, `pause`, `play`, `toggle`; optional `"element"` id), and `GET /api/slideshows` lists every slideshow with its live paused/playing state and position while an overlay page is open, or use the editor's *live controls* buttons (they also drive the editor preview) or the popout control panel at `/overlay-control.html?id=<id>` (*Pop out controls*), which lists every slideshow in the overlay. Videos can be included (they play to the end); the editor's video picking UI is basic for now. API: `GET /api/asset-library?tags=a,b&mode=any|all&kinds=image|video|both`, `POST /api/asset-tags` (`{names, add, remove, set}`).
| `clip_candidates` | object | enabled | Beta candidate detection thresholds and event toggles |

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

Customize the shared look of supported overlays from the dedicated [Theme Editor](http://localhost:3000/theme-editor.html):

- **Font** — Choose from popular Google Fonts or enter any custom Google Font name
- **Text / Accent Colors** — Color pickers with manual hex/rgb input
- **Background** — Set to `transparent` for OBS (default), or pick a color for previewing
- **Goal / Viewer Count Backgrounds** — Separate backgrounds for those full-canvas overlays
- **Text Outline** — Toggle the shadow outline on/off, pick outline color
- **Font Scale** — Scale all overlay text proportionally (0.5× – 2×)
- **Theme presets** — Export or import only the shared theme as JSON

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

The goal overlay fills the browser-source viewport at 100% width and height. Typography, spacing, and the progress bar scale from the smaller viewport axis, so the same URL can be placed in any size or aspect ratio without fixed-size positioning.

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
| `GET /api/clip-candidates` | List beta clip candidates |
| `POST /api/clip-candidates` | Add a beta clip marker |
| `GET/PUT /api/clip-candidates/config` | Read or update beta detection thresholds |
| `POST /api/clip-candidates/backfill` | Rebuild candidates from current and archived chat logs (`{"rebuild":true}`) |
| `POST /api/clip-candidates/:id/create` | Request a Twitch clip |
| `DELETE /api/clip-candidates/:id` | Delete a beta clip candidate |
| `GET /auth/twitch` | Start Twitch OAuth flow |
| `GET /api/music/now-playing` | Current track info (JSON) |
| `GET /api/music/artwork` | Current album art image |
| `GET/PUT /api/game-plan` | Game Plan lists and games (with IGDB covers and the "playing now" match) |
| `GET /api/qr` | QR code as SVG (`?text=`, `fg`, `bg`, `margin`, `ecc`) |
| `GET /api/game-search` | Search IGDB for games (`?q=`) |
| `GET /api/game` | IGDB info for a game (`?name=`, defaults to the current Twitch category) |
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
| `data/timers.json` | Persists | Named countdowns, stopwatches, timer state, global and per-timer completion sounds (from the asset library), and per-timer HTTP action settings |
| `data/clip-candidates.json` | Persists | Beta clip candidates and Twitch clip links |
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
├── alerts.js              # Alert engine (rules, queue, gift batching)
├── admin.css              # Shared admin palette (dark/light)
├── appearance.js          # Light/dark mode and accent color
├── alerts.html            # Alerts manager
├── alert-queue.html       # Event queue / replay (OBS dock)
├── goals-editor.html      # Goals manager + viewer tracking settings
├── game-plan-editor.html  # Game Plan lists (scheduled / backlog / played / custom)
├── music-editor.html      # Music overlay customization
├── music-url-wizard.html  # Music URL builder
├── timers-editor.html     # Named timer manager
├── timer-url-wizard.html  # Timer overlay URL builder
├── dashboard.html         # Dashboard UI
├── sessions.html          # Session history + chat logs
├── highlights.html        # Highlights viewer
├── clips.html             # Beta clip candidates and Twitch clip links
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
2. Ensure **Enable remote API control of extension** and **Send chat messages to API server** are enabled in SSN under Global Mechanics → Mechanics - Connections & Integrations
3. Verify `session_id` in `config.json` matches the `?session=` value in your SSN dock URL
4. Check `http://localhost:3000/api/status` — `ssn.connected` should be `true`
5. Test with the [SSN API Sandbox](https://socialstream.ninja/sampleapi.html) to verify messages are flowing

### Twitch API errors (401)
- Open `/twitch-connect.html` on the same host where StreamPulse is running and reconnect
- If you use your own Twitch app: ensure `twitch.redirect_uri` is registered exactly as an OAuth Redirect URL, and verify `client_id` and `client_secret` in `config.json`

### Credits not loading

- Ensure `npm start` is running
- OBS URL: `http://localhost:3000/credits.html`

### High memory usage

The live chat log is stored in `data/chat-log.jsonl`, while StreamPulse keeps only the most recent 2,000 messages in memory for live controls such as pinning the latest message. Chat history APIs, search, exports, and historical analysis read the full JSONL log when needed. Current process memory metrics are available from `/api/status` under `memory`.

### Refreshing OBS sources

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
