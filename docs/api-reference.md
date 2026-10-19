# StreamPulse HTTP API & WebSocket Protocol

StreamPulse exposes a clean, RESTful HTTP API and a real-time WebSocket protocol designed for hardware controllers (such as Bitfocus Companion and Elgato Stream Deck), custom overlays, and automation scripts.

All endpoints are hosted locally at `http://localhost:3000` (or your configured port). This guide covers common automation calls; the server's [interactive API reference](http://localhost:3000/api.html) lists additional endpoints.

## Promo Creator

Promo designs are static, locally saved documents, not live overlay controls. They do not emit WebSocket events or require Companion actions. See the [Promo Creator guide](promo-creator.md) for the browser workflow.

| Endpoint | Result |
| --- | --- |
| `GET /api/promos` | Array of saved designs, including their IDs and `updatedAt` timestamps |
| `GET /api/promos/:id` | One saved design; `404` if missing |
| `POST /api/promos` | Create a design; returns the normalized design with a generated UUID (`201`) |
| `PUT /api/promos/:id` | Replace an existing design; returns the normalized design |
| `DELETE /api/promos/:id` | Delete the saved design, keeping uploaded images; returns `{ "deleted": "<id>" }` |
| `GET /api/promo-themes` | Array of reusable custom themes |
| `GET /api/promo-themes/:id` | One reusable custom theme |
| `POST /api/promo-themes` | Create `{ name, theme, font, colors, background }`; returns the theme with UUID and `updatedAt` (`201`) |
| `PUT /api/promo-themes/:id` | Replace a saved custom theme |
| `DELETE /api/promo-themes/:id` | Delete a custom theme; existing promo designs remain unchanged |
| `GET /api/promos/igdb/search?q=<title>` | IGDB game matches with IDs, names, years and cover thumbnails |
| `GET /api/promos/igdb/games/:id` | A game's cover, artwork and screenshot choices |
| `POST /api/promos/igdb/import` | Import `{ "gameId": "123", "imageId": "abc" }` into the local Asset Library; returns `{ url, name, game, kind }` |

Write requests accept a JSON design (maximum 256 KiB). Shared fields are `name`, `title`, `subtitle`, `badge`, `url` (Twitch handle or channel URL), `photo`, `artwork`, `theme`, `colors`, and `font`. Images must be local `/custom-overlay-assets/<filename>` URLs. Omitted fields use defaults.

`layouts.square`, `layouts.landscape`, and `layouts.portrait` each contain a `template` (`editorial`, `spotlight`, or `minimal`), back-to-front `order`, and `blocks` keyed by `photo`, `artwork`, `badge`, `title`, `subtitle`, `url`, and `qr`. Blocks use percentage `x/y/w/h`, `enabled`, pixel `fontSize`, optional hex `color`, `fit` (`cover` or `contain`), percentage `focusX/focusY`, image `shape` (`rectangle`, `rounded`, or `circle`), and pixel `radius`.

Each layout also has `cornerRadius` (pixels) and `background`: `{ mode, theme, color, endColor, angle, pattern, image, fit, focusX, focusY, shade }`. Modes are `theme` (default for older designs), `solid`, `gradient`, `transparent`, `image`, and `pattern`. Pattern choices are `grid`, `geometry`, and `orbits`; gradient angle is 0–360; shade/focus values are 0–100. Background images must be local asset URLs. The background's `theme` selects its built-in artwork independently of other ratios, defaulting to the shared promo theme when migrating older designs. Choosing a custom background does not require a named theme.

Custom themes store a required name plus normalized palette/font/background settings, not content or layouts. Applying a theme in the browser copies its palette/font across the promo and its background into the current ratio. Theme changes are not live references.

Storage is `data/promos.json` (up to 200 designs) and `data/promo-themes.json` (up to 100 custom themes), included in full data backups. Validation failures return `400`, missing IDs return `404`, unsupported methods return `405`, and storage failures return `500`. Export renders all three arrangements and packages their PNGs into one ZIP in the browser; there is no server export endpoint. The existing `/api/qr` and Asset Library endpoints supply QR graphics, fonts, and images.

IGDB operations use the configured Twitch client credentials. Missing credentials return `409`; upstream failures return `502`; image imports over 20 MB return `413`. Imports verify that the requested image belongs to the game and download only from IGDB's fixed HTTPS image origin, without following redirects. They do not accept arbitrary remote image URLs.

---

## 1. Session Lifecycle Endpoints

### Start Live Stream Session
- **Endpoint**: `POST /api/start-session`
- **Description**: Clears current session data and starts a new collection session. End the previous session first if you want to archive it. This does not start a Twitch broadcast or mark an offline channel as live.
- **Response**:
  ```json
  { "status": "started", "startedAt": "2026-10-19T18:00:00.000Z", "message": "New session started." }
  ```

### End Current Stream Session
- **Endpoint**: `POST /api/end-session`
- **Description**: Gracefully ends the current session, finalizes stream duration, records peak viewer metrics, updates Game Plan playthrough times, and flushes chat logs.
- **Response**:
  ```json
  { "status": "ended", "archived": "chat-2026-10-19T14-00.json", "streamEndedAt": "2026-10-19T20:00:00.000Z", "message": "Session archived and reset. Server still running." }
  ```

### Get Current Session State
- **Endpoint**: `GET /api/status`
- **Description**: Returns server and session state, viewer metrics, category, message and chatter counts, milestones, and module health. `sessionActive` describes collection state; `viewers.live` describes observed broadcast status.

`overlayClients` counts registered top-level overlay pages, not raw WebSocket connections. Dashboard/editor sockets, embedded previews, and URLs with `preview=true` are excluded. `websocketClients` reports all live transport connections for diagnostics. An ordinary browser tab opened to an overlay counts like an OBS browser source; StreamPulse cannot inspect OBS's configured source inventory. Refresh overlays left open from older versions so they register.

`POST /api/restart` saves and preserves the current session while restarting the server. In desktop mode the backend restarts in-process; in CLI mode the process is replaced. `POST /api/shutdown` ends and archives the current session and exits StreamPulse.

### Update capabilities and release checks

- `GET /api/update/info` detects the installation without contacting GitHub. Returns `installation` (`desktop`, `git`, or `release-folder`), `canApply`, and `supportsNightly`. Desktop results include the installed version, release link, and manual-install instructions.
- `GET /api/update/check?mode=release` checks GitHub's latest stable release. Desktop results have `canApply: false`, `releaseUrl`, and an `installers` array of `{ name, url }`; they do not advertise a source ZIP as an installer. An empty installer list can mean the release build is still running.
- `GET /api/update/check?mode=nightly` is supported only for Git checkouts.
- `POST /api/update/apply` with `{ "mode": "release" }` or `{ "mode": "nightly" }` applies source-installation updates. Packaged desktop apps reject both modes with HTTP `409` before any backup, download, command execution, or file replacement. Use the desktop installer instead.

---

## 2. Choice Randomizer Endpoints

### Trigger Spin
- **Endpoint**: `POST /api/randomizer/spin` (or `GET /api/randomizer/spin`)
- **Description**: Triggers a spin animation across all connected randomizer OBS overlays and studio editors.
- **Parameters** (optional JSON body or query params):
  - `preset`: Saved preset ID, or `chatters` to use collected chatter names.
  - `choices`: JSON array of choice strings, as an alternative to a preset.
  - `winner`: Optional forced winner text; normally selected by the server's weighting rules.
  - `mode`: `roller`, `wheel`, or `deck`.
  - `theme`: Temporary visual theme override.
- **Example request**:
  ```json
  { "choices": ["Choice A", "Choice B"], "mode": "wheel" }
  ```
- **Response**: `{ "ok": true, "winner": "...", "preset": null, "mode": "wheel", ... }`, including weights and the broadcast `payload`.

### Get Saved Randomizer Presets
- **Endpoint**: `GET /api/randomizer/presets`
- **Description**: Returns `{ "presets": [...] }` with saved choices, weights, and weighting settings. There is no `/api/randomizer/state` endpoint.

---

## 3. Named Timers Endpoints

### Adjust / Toggle Timer
- **Endpoint**: `POST /api/timers/:id/control`
- **Description**: Pauses or resumes the specified countdown or stopwatch.
- **Body**:
  ```json
  { "action": "toggle" }
  ```
- **Response**: `{ "ok": true, "timer": {...} }`, including `state` and the applicable `remainingMs` or `elapsedMs`.

### Reset Timer
- **Endpoint**: `POST /api/timers/:id/control`
- **Body**: `{ "action": "reset" }`.
- **Description**: Resets the timer back to its initial configured duration.

### Add / Subtract Time
- **Endpoint**: `POST /api/timers/:id/control`
- **Body**: `{ "action": "add_time", "seconds": 60 }` or `{ "action": "subtract_time", "seconds": 60 }`.

Control also accepts `GET /api/timers/:id/control?action=toggle`. Read an individual timer with `GET /api/timers/:id`.

---

## 4. Overlay Visibility & Remote Control

### Fade In / Fade Out Any Overlay
- **Endpoint**: `POST /api/overlay-visibility/:key`
- **Description**: Smoothly fades an overlay in or out in OBS without muting or unloading the browser source.
- **Keys**: `credits`, `goal`, `countdown`, `stopwatch`, `music`, `randomizer`, `game-plan`, or `custom:<id>`.
- **Body**:
  ```json
  { "action": "on" }   // Options: "on", "off", "toggle"
  ```

### List Overlay Visibility States
- **Endpoint**: `GET /api/overlay-visibility`
- **Description**: Returns `{ "overlays": [...] }`; each entry includes its `key`, label, and `visible` boolean.

---

## 5. Media & YouTube Video Playback

### List Controllable Video Elements
- **Endpoint**: `GET /api/videos`
- **Description**: Returns `{ "videos": [...] }` for configured HTML5 videos and YouTube embeds across saved custom overlays. This is configuration discovery, not proof that a browser source is connected.

### Control Playback
- **Endpoint**: `POST /api/custom-overlays/:id/video`
- **Body**:
  ```json
  {
    "element": "bg-video",
    "action": "play"
  }
  ```
- **Actions**: `play`, `pause`, `toggle`, `restart`, `stop`, `mute`, `unmute`, `toggle-mute`. Omit `element` to target all videos in the overlay. Commands are broadcast to connected browser sources; the response is an acknowledgement, not a playback-state report.
- Autoplay settings and remote pause/stop/mute choices are preserved through ordinary live-data rerenders. Hiding a page temporarily suspends its videos without changing the requested playback state.

---

## 6. Chat Bot & Automation Endpoints

### Execute Command
- **Endpoint**: `POST /api/chatbot/run` (or `GET /api/chatbot/run?command=!shoutout&user=streamer`)
- **Description**: Directly triggers a chatbot command or action via HTTP request (useful for Bitfocus Companion buttons or external stream decks).
- **Body**:
  ```json
  {
    "command": "!game",
    "user": "FixtureBroadcaster",
    "arg": "",
    "bypassCooldown": true
  }
  ```
- HTTP execution uses trusted broadcaster/moderator permissions. `bypassCooldown` defaults to true; set it to false to honor cooldowns. There is no `silent` option.

---

## 7. Community Directory & Viewer Dossiers

### Query Viewer Dossier
- **Endpoint**: `GET /api/chatters/:username`
- **Description**: Retrieves lifetime metrics for a viewer: stream attendance, message counts, bits cheered, gift subs given, raids led, and private notes.

### Update Viewer Notes
- **Endpoint**: `POST /api/chatters/:username/notes`
- **Body**:
  ```json
  {
    "notes": "Fictional example: enjoys speedruns",
    "tags": ["speedrunner", "vip-candidate"],
    "pronouns": "they/them"
  }
  ```

---

## 8. WebSocket Live Push Protocol

Connect to `ws://localhost:3000` (or your configured host/port). Messages use a `{ "type": "...", "data": {...} }` envelope.

When overlays connect, they receive live event packets in real time:
- **`snapshot`**: Current collected session data, sent immediately on connection.
- **`update`**: Updated session data, including chatters and hashtags.
- **`alert`**: Trigger payload containing rule metadata, sound file, animations, and custom text.
- **`overlay-visibility`**: Overlay key and visibility state.
- **`timers-snapshot`**: Named timer state sent on connection.
- **`timer-update`**: A timer's changed state/settings. Clients derive clock ticks from timestamps; the server does not send millisecond tick packets.
- **`randomizer-spin`**: Spin settings and the server-selected outcome.
- **`custom-overlay-video`**: Playback command for an overlay and optional element.

Active custom-overlay alerts survive ordinary live-data rerenders. They end on completion, explicit skip/clear, page departure, or a change/removal of their layer definition.
