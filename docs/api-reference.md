# StreamPulse HTTP API & WebSocket Protocol

StreamPulse exposes a clean, RESTful HTTP API and a real-time WebSocket protocol designed for hardware controllers (such as Bitfocus Companion and Elgato Stream Deck), custom overlays, and automation scripts.

All endpoints are hosted locally at `http://localhost:3000` (or your configured port). This guide covers common automation calls; the server's [interactive API reference](http://localhost:3000/api.html) lists additional endpoints.

## Twitch Ban Sync

| Endpoint | Result |
| --- | --- |
| `GET /api/twitch/bans` | Sync status: `enabled`, `users` (`id`, `login`, `name`), `count`, `lastSyncAt`, `syncing`, `error`, `scopeReady`, `liveUpdates` (permission granted) |
| `POST /api/twitch/bans/sync` | Fetch every page of permanent bans and replace the broadcaster-scoped cached list only after success; returns status (`502` on failure, retaining the last successful list) |

Enable with `PUT /api/config` and `{ "twitch_ban_sync": { "enabled": true } }`. Manual `banned_users` remain separate. Sync runs at startup and every 10 minutes; `channel.ban` / `channel.unban` EventSub notifications keep it current with `channel:moderate`. Listing requires `moderation:read` or `moderator:manage:banned_users`. Timeouts are excluded. Cached bans are stored in `data/twitch-bans.json`.

Session/chat/highlight outputs and exports apply the current combined ban list retroactively without rewriting stored history. Full backups remain unfiltered. Anonymous aggregate totals are not rebuilt. See [System Config details](server-management.md#banned-accounts--twitch-sync).

## Speaker Badge Control

| Endpoint | Result |
| --- | --- |
| `GET /api/custom-overlays/:id/speakers` | Overlay `id`, `name`, `revision` and `speakers` with badge element IDs, layer names, page and `speakerBadge` settings |
| `PATCH /api/custom-overlays/:id/speakers` | Persist selected badge fields and broadcast the existing `custom-overlay-update` event; returns the refreshed speaker list |
| `GET /api/obs/audio-inputs` | OBS audio-source names with connection/enabled status |

Example patch: `{ "element": "guest-badge", "speaker": { "name": "Fictional Guest", "handle": "@fictional", "pronouns": "they/them", "avatarSrc": "/custom-overlay-assets/guest.png", "showHandle": false, "callIn": { "enabled": true, "statusText": "ON THE LINE", "location": "Remote studio", "showLocation": true } }, "audio": { "inputName": "Guest Audio" } }`. Profile text fields are optional strings. Visibility fields `speaker.showAvatar`, `showHandle`, `showPronouns`, `callIn.enabled` and `callIn.showLocation` accept booleans; omitted fields retain their current values, and hiding content does not clear it. Appearance, sensitivity, other badges and layers remain unchanged. The endpoint uses overlay revision history and storage; this is not a temporary runtime override. Unknown overlays/non-badge element IDs return `404`, invalid field types return `400`.

See [Speaker Badge setup and controller](custom-overlays.md#voice-reactive-speaker-badges--call-in-banners).

## OBS Bridge (WebSocket v5)

StreamPulse connects directly to OBS Studio via its built-in WebSocket v5 server (default port 4455) to drive frame-synchronized Scene State source animations, source discovery, and voice-reactive Speaker Badge volume meters.

| Endpoint | Result |
| --- | --- |
| `GET /api/obs/status` | Bridge connection and engine status (`enabled`, `sceneSyncEnabled`, `speakerBadgesEnabled`, `connected`, `connecting`, `host`, `port`, `syncOnSave`, `motionEngine`, `activeEngine`, `obsVersion`, `currentProgramScene`, `hasMovePlugin`, `lastError`) |
| `GET /api/obs/sources` | Discover OBS scenes, sources, and scene items grouped by scene (`scenes`, `sources`, `byScene`, `currentProgramScene`, `hasMovePlugin`). Returns `403` when Scene Sync is disabled |
| `GET /api/obs/audio-inputs` | Discover active audio mixer sources (`inputs`, `connected`, `enabled`) using capability probing and live volume metering |
| `POST /api/obs/config` | Update OBS bridge settings (`enabled`, `host`, `port`, `password`, `syncOnSave`, `motionEngine`). Loopback only; accepts `PUT` |
| `POST /api/obs/connect` | Enable and initiate connection to OBS WebSocket. Loopback only |
| `POST /api/obs/disconnect` | Disconnect the OBS WebSocket bridge. Loopback only |
| `POST /api/obs/cleanup-filters` | Remove orphaned StreamPulse-managed Move and Fade filters (`sceneName`, `all: boolean`). Loopback only. Returns `403` when Scene Sync is disabled |
| `POST /api/obs/sync` | Manually sync linked OBS source transforms for an overlay page or scene state. Loopback only. Returns `403` when Scene Sync is disabled |

**Module Independence & Security:**
- **Loopback Enforcement:** Configuration, connection, filter cleanup, and manual sync endpoints require requests from the local loopback interface (`127.0.0.1` / `::1`).
- **Protected Credentials:** Password values are write-only; `GET /api/obs/status` only returns `hasPassword: true/false` and never reveals secrets.
- **Independent Feature Modules:** The global OBS connection operates independently of feature toggles. Turning off **OBS Scene Sync** (`obs_scene_sync_enabled: false`) disables source motion and returns `403` on sync endpoints, while preserving connection health and audio volume meters for Speaker Badges.
- **Manual Sync Payload Example:**
  ```json
  POST /api/obs/sync
  {
    "overlayId": "main-layout",
    "pageId": "brb-state",
    "animate": true
  }
  ```
- **Filter Cleanup Payload Example:**
  ```json
  POST /api/obs/cleanup-filters
  {
    "sceneName": "Gameplay",
    "all": false
  }
  ```

## Message Deletion Sync

`GET /api/twitch/message-deletions` returns `enabled`, `events` (saved deletion records), `lastEventAt`, `error`, `scopeReady` (`user:read:chat` granted), and `connected` (Twitch message-delete subscription registered on the active EventSub socket).

`PUT /api/config` accepts `{ "message_deletion_sync": { "enabled": false } }` to stop receiving new deletion signals; syncing defaults to enabled. Existing tombstones still apply. Twitch uses `channel.chat.message_delete`, `channel.chat.clear_user_messages`, and `channel.chat.clear`, plus a non-ingesting `channel.chat.message` observer for native-ID correlation. SocialStream source deletion envelopes are handled on its existing data WebSocket.

Filtered chat/highlight APIs, search, timelines, exports and direct data reads hide matching messages without rewriting logs. `moderation-update` is a content-free WebSocket notification telling clients to invalidate message/highlight caches. Deletion state lives in `data/message-deletions.json` and is included in full backups. Clears are limited to the active session/source before receipt; exact native UUIDs also match archived records. Missing/ambiguous IDs and offline events cannot be reconstructed, and aggregate stats are not rebuilt. See [matching and setup limitations](server-management.md#message-deletion-sync).

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

Each layout also has `cornerRadius` (pixels) and `background`: `{ mode, theme, color, endColor, angle, pattern, vignette, image, fit, focusX, focusY, shade }`. Modes are `theme` (default for older designs), `solid`, `gradient`, `transparent`, `image`, and `pattern`. Pattern choices are `grid`, `geometry`, `orbits`, `hexagons`, `dots`, `diagonal`, and `checker`; vignette and shade are 0–70 and 0–100; gradient angle is 0–360; crop focus values are 0–100. Background images must be local asset URLs. The background's `theme` selects its built-in artwork independently of other ratios, defaulting to the shared promo theme when migrating older designs. Choosing a custom background does not require a named theme. New promos start with a subtle vignette; missing vignette values on saved layouts normalize to zero.

Custom themes store a required name plus normalized palette/font/background settings, not content or layouts. Applying a theme in the browser copies its palette/font across the promo and its background into the current ratio. Theme changes are not live references.

Storage is `data/promos.json` (up to 200 designs) and `data/promo-themes.json` (up to 100 custom themes), included in full data backups. The Backup & Restore share endpoints can also list, export, inspect, and import individual scenes using `promo:<id>` item keys. Scene ZIPs include referenced local images and uploaded fonts; import supports `copy`, `replace`, or `skip` conflicts and rewrites asset references if filenames collide.

Validation failures return `400`, missing IDs return `404`, unsupported methods return `405`, and storage failures return `500`. Export renders all three arrangements and packages their PNGs into one ZIP in the browser; there is no server PNG export endpoint. The existing `/api/qr` and Asset Library endpoints supply QR graphics, fonts, and images.

IGDB operations use the configured Twitch client credentials. Missing credentials return `409`; upstream failures return `502`; image imports over 20 MB return `413`. Imports verify that the requested image belongs to the game and download only from IGDB's fixed HTTPS image origin, without following redirects. They do not accept arbitrary remote image URLs.

---

## Asset Library Management

| Endpoint | Result |
| --- | --- |
| `GET /api/custom-overlays/assets` | Returns array of uploaded asset files with kind, size, modified date, usage tracking, and tags |
| `POST /api/custom-overlays/assets` | Upload a new graphic, video, font, or audio file |
| `PUT /api/custom-overlays/assets/:name` | Overwrite an existing asset in-place (atomic replacement for cropped/edited media without breaking references) |
| `DELETE /api/custom-overlays/assets/:name` | Deletes an asset (blocked with HTTP 409 if currently referenced by an active overlay, timer, or tier list) |
| `POST /api/custom-overlays/assets/:name/rename` | Renames an asset and automatically rewrites references across saved overlays |

## 1. Session Lifecycle Endpoints

`GET /api/chat` includes new and returning subscribers captured from Twitch EventSub or SocialStream Ninja. Nearby notifications for one Twitch subscription share the session/statistics count; their individual chat-log entries remain available when logging is enabled. New entries include `source`; native subscription entries additionally identify `sourceEvent` as `channel.subscribe` or `channel.subscription.message`.

`channelInfo` holds the current channel title/category even while offline. `streamInfo` is live-broadcast history: one starting state at Twitch's actual stream start, followed by live changes only. Offline edits do not append timestamps. Viewer transitions capture the baseline and close the live segment without extra polling.

Session views, timelines and exports accept legacy channel updates using `time` as well as canonical `changedAt`. Old pre-stream edits become one live-start baseline; off-air and untimed entries are excluded from timed history without rewriting saved data. Previously recorded live segments remain available in resumed sessions.

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
- **Endpoint**: `GET /api/external-data`
- **Description**: Read-only map of host data set through `setExternalData` (the `{{rep.*}}` placeholders), as `{ data, count, truncated }`. Arrays are capped at 50 items, strings at 500 characters, objects at 100 keys and 8 levels; `truncated` is true when anything was cut. The chat bot page shows it in the Live data panel. `POST /api/chatbot/preview` with `{ text }` resolves a response against live data without sending to chat.

---

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
  - `duration`: Spin duration in seconds (Studio and Companion choices: 4, 6, 8, or 10).
  - `autohide`: Seconds to keep the winner on screen; `0` keeps it visible indefinitely. Omitted Companion options preserve the latest Studio settings; otherwise the overlay's own defaults apply.
  - `theme`: Temporary visual theme override.
  - `inheritStudioSettings`: When `true`, omitted Companion options inherit the latest Studio settings synced to the server.
  - `showButton`: Explicitly show or hide the overlay's spin button. Omit to preserve its current visibility.
  - `buttonPreset`, `buttonPhrases`, `buttonText`: Select a saved button phrase preset, provide a custom phrase array, or set a fixed label.
  - `winnerHeader`, `winnerSub`: Optional winner headline and subtitle overrides.
  - `scale`: URL query parameter only; controls overlay scale and is not accepted from the JSON body.
- **Example request**:
  ```json
  { "choices": ["Choice A", "Choice B"], "mode": "wheel", "duration": 8 }
  ```
- **Scale example**: `GET /api/randomizer/spin?mode=deck&scale=1.2`, or set `scale=1.2` on the OBS overlay URL. Randomizer Studio has no scale control.
- **Companion inheritance**: Send `{ "inheritStudioSettings": true }` with only the desired overrides. The Studio automatically syncs settings when opened, reconnected, or changed. Without a Studio sync since server startup, omitted fields stay omitted and each overlay retains its own settings.

### Sync Randomizer Studio Settings
- **Endpoint**: `POST /api/randomizer/state`
- **Description**: Updates the server's in-memory settings snapshot without triggering a spin. The Randomizer Studio calls this on startup, WebSocket reconnection, and settings changes so Companion can inherit the latest choices and presentation options.
- **Body**: A Studio spin settings object containing a non-empty `choices` array.
- **Response**: `{ "ok": true, "winner": "...", "preset": null, "mode": "wheel", ... }`, including weights and the broadcast `payload`.

### Get Saved Randomizer Presets
- **Endpoint**: `GET /api/randomizer/presets`
- **Description**: Returns `{ "presets": [...] }` with saved choices, weights, and weighting settings. There is no `/api/randomizer/state` endpoint.

### Get Randomizer Button Phrase Presets
- **Endpoint**: `GET /api/randomizer/button-presets`
- **Description**: Returns `{ "presets": [...] }` with IDs, names, and phrases for Companion's dynamic button phrase selector.

---

## 2.5. Native Polls & Poll Manager Endpoints

### Get Latest Poll Status
- **Endpoint**: `GET /api/polls/latest`
- **Description**: Returns the active running poll or the most recently concluded poll state, including choice votes, winner, and timing.

### Get Active Running Poll
- **Endpoint**: `GET /api/polls/active`
- **Description**: Returns the active poll if currently running, or `{ "active": false }`.

### Get Poll History
- **Endpoint**: `GET /api/polls/history`
- **Description**: Returns an array of past poll records, total votes, winners, and completion timestamps.

### Create and Start Poll
- **Endpoint**: `POST /api/polls/create`
- **Description**: Launches a native poll.
- **Body**:
  ```json
  {
    "title": "Which adventure next?",
    "choices": ["Zelda", "Mario", "Metroid"],
    "duration": 60,
    "blind": false,
    "keywords": true,
    "subMultiplier": 2,
    "celebration": {
      "sound": true,
      "soundUrl": "",
      "volume": 0.8,
      "confetti": true
    }
  }
  ```

### Conclude Poll / Crown Winner
- **Endpoint**: `POST /api/polls/end`
- **Description**: Immediately ends active voting, calculates percentages, triggers celebration effects, and broadcasts results across WebSockets.

### Extend Poll Duration
- **Endpoint**: `POST /api/polls/extend`
- **Description**: Adds extra seconds to a running poll.
- **Body**: `{ "seconds": 30 }` (default is 30 seconds).

### Cancel Active Poll
- **Endpoint**: `POST /api/polls/cancel`
- **Description**: Immediately cancels the active poll without crowning a winner.

### Submit Chat or Manual Vote
- **Endpoint**: `POST /api/polls/vote`
- **Description**: Casts a vote for a user.
- **Body**: `{ "user": "StreamerFan", "choice": 1, "isSubscriber": true }`.

### Get Active Tournament State
- **Endpoint**: `GET /api/tournament`
- **Description**: Returns the active tournament bracket tree, rounds, matches, scoring settings, and champion state.

### Create Tournament Bracket
- **Endpoint**: `POST /api/tournament/create`
- **Description**: Generates an adaptive single or double elimination bracket (2 to 32 participants) with automatic seedings and BYE allocation.
- **Body**:
  ```json
  {
    "title": "Retro RPG Championship",
    "format": "single",
    "entrants": ["Chrono Trigger", "Final Fantasy VI", "EarthBound", "Secret of Mana"],
    "progressionMode": "manual",
    "scoringType": "bestOf",
    "bestOf": 3
  }
  ```

### Start Match Voting
- **Endpoint**: `POST /api/tournament/start-match`
- **Description**: Starts an interactive chat poll for the specified match in audience vote mode.
- **Body**: `{ "matchId": "m_1_1" }`.

### Update Match Score or Notes
- **Endpoint**: `POST /api/tournament/score`
- **Description**: Updates competitor scores, sets custom match notes (e.g. Map/Game #), or crowns a match winner. In best-of series, reaching the required target score automatically advances the competitor to the next round.
- **Body**: `{ "matchId": "m_1_1", "entrant1Score": 2, "entrant2Score": 1, "matchDetails": "Game 3 · Decider" }`.

### Select Active Match
- **Endpoint**: `POST /api/tournament/select-match`
- **Description**: Focuses a match as the active matchup in Poll Manager and the Esports Lower-Third Match HUD overlay (`?layout=active`).
- **Body**: `{ "matchId": "m_1_1" }`.

### Reset Match
- **Endpoint**: `POST /api/tournament/reset-match`
- **Description**: Resets a match's scores, status, and downstream bracket advancement.
- **Body**: `{ "matchId": "m_1_1" }`.

### Update Tournament Settings
- **Endpoint**: `POST /api/tournament/settings`
- **Description**: Updates tournament title, best-of format, or progression mode.
- **Body**: `{ "title": "Updated Championship", "bestOf": 5 }`.

### Advance Winner
- **Endpoint**: `POST /api/tournament/advance`
- **Description**: Manually advances a specific competitor to the next round slot.
- **Body**: `{ "matchId": "m_1_1", "winner": "Chrono Trigger" }`.

### Rollback Tournament Match Advancement
- **Endpoint**: `POST /api/tournament/rollback`
- **Description**: Reverts a completed match back to active status, clears its winner and scores, and recursively resets all downstream matches that depended on that match back to `TBD` and `PENDING`.
- **Body**: `{ "matchId": "m_1_1" }`.

### Reset Tournament
- **Endpoint**: `POST /api/tournament/reset`
- **Description**: Completely terminates and resets the active tournament bracket.

### Tournament Presets, History & Drafts
- **Get Presets**: `GET /api/tournament/presets` — Returns saved tournament configuration presets.
- **Save Preset**: `POST /api/tournament/presets` — Saves current or provided tournament setup: `{ "name": "8-Player Double Elim", "tournament": { ... } }`.
- **Update Preset**: `PUT /api/tournament/presets/:id` — Updates an existing tournament preset's properties: `{ "name": "Updated Bracket Name", "entrants": [...] }`.
- **Load Preset**: `POST /api/tournament/presets/load` — Loads a tournament preset: `{ "id": "preset-1" }`.
- **Delete Preset**: `DELETE /api/tournament/presets/:id` — Deletes a saved tournament preset.
- **Get History**: `GET /api/tournament/history` — Returns list of archived completed tournament brackets.
- **Restore Tournament**: `POST /api/tournament/history/restore` — Restores a past completed tournament bracket to live studio: `{ "id": "th-1" }`.
- **Delete History Record**: `DELETE /api/tournament/history/:id` — Deletes an archived tournament record.
- **Clear History**: `POST /api/tournament/history/clear` — Clears all archived tournament history.
- **Get Drafts**: `GET /api/tournament/drafts` — Returns list of in-progress saved bracket draft checkpoints.
- **Save Draft Checkpoint**: `POST /api/tournament/drafts/save` — Saves active tournament state as a named draft: `{ "name": "Mid-Tournament Checkpoint" }`.
- **Restore Draft Checkpoint**: `POST /api/tournament/drafts/restore` — Resumes an in-progress bracket draft: `{ "id": "draft-1" }`.
- **Delete Draft Checkpoint**: `DELETE /api/tournament/drafts/:id` — Deletes an in-progress draft checkpoint.

### Audience Poll Tournament Endpoints (`/api/polls/tournament/*`)
Dedicated endpoints managing audience chat brackets in Poll Manager, completely isolated from esports tournaments:
- `GET /api/polls/tournament` — Returns active poll tournament bracket.
- `POST /api/polls/tournament/create` — Creates an audience voting tournament: `{ "title": "Chat RPG Tournament", "entrants": ["Chrono", "Final Fantasy"], "format": "single", "bestOf": 3 }`.
- `POST /api/polls/tournament/start-match` — Launches the active match as a live chat poll.
- `POST /api/polls/tournament/advance` — Advances winner in the poll tournament: `{ "matchId": "m_1_1", "winner": "Chrono" }`.
- `POST /api/polls/tournament/score` — Manually updates score or entrant color in poll tournament.
- `POST /api/polls/tournament/select-match` — Sets active match: `{ "matchId": "m_1_2" }`.
- `POST /api/polls/tournament/reset-match` — Clears score of a match.
- `POST /api/polls/tournament/rollback` — Rolls back completed match and downstream matches: `{ "matchId": "m_1_1" }`.
- `POST /api/polls/tournament/settings` — Updates poll tournament title or settings.
- `POST /api/polls/tournament/reset` — Resets active poll tournament.
- `GET /api/polls/tournament/presets` — Returns `{ "status": "ok", "presets": [...] }`, the poll-only tournament templates.
- `POST /api/polls/tournament/presets` — Saves a clean template from creation settings, the active bracket, or a saved bracket. Bodies: `{ "name": "Friday bracket", "title": "Friday", "format": "double", "entrants": ["A", "B", "C", "D"], "matchDuration": 60 }`, `{ "name": "Friday bracket", "fromActive": true }`, or `{ "name": "Friday bracket", "historyId": "checkpoint-..." }`. Returns `{ "status": "ok", "preset": { ... } }`. Entrants may be strings or `{ "name": "A", "tag": "Team", "color": "#123456" }` objects. Templates exclude progress/results and enforce chat-vote scoring.
- `DELETE /api/polls/tournament/presets/:id` — Deletes only the named template.
- `POST /api/polls/tournament/checkpoints` — Snapshots current poll bracket progress without interrupting its ballot: `{ "name": "Before semifinals" }`. Returns `{ "status": "ok", "checkpoint": { ... } }`; checkpoint IDs are distinct from the original `tournamentId`.
- `GET /api/polls/tournament/history` — Returns `{ "status": "ok", "history": [...] }`, including completed/replaced brackets and named checkpoints. Automatically archived replacements and checkpoints use unique record IDs with the original bracket ID in `tournamentId`, so resumed brackets can retain multiple saved versions. Templates are capped at 100; history/checkpoints share a newest-30 limit.
- `POST /api/polls/tournament/history/restore` — Loads a saved bracket: `{ "id": "checkpoint-..." }`. Rejects any active poll. Preserves completed results/champions, resets saved active matches to pending with cleared votes, and never starts/restores a ballot. Started brackets are archived before replacement.
- `DELETE /api/polls/tournament/history/:id` — Deletes only that poll history/checkpoint record; live state and Versus history are unaffected.

To create a fresh tournament from a template through the API, fetch its settings from `/api/polls/tournament/presets` and pass those creation fields to `/api/polls/tournament/create`. Template lookup alone does not replace the live bracket. The template fields include voting options, logo, entrant tags/colors, and round-robin scoring. Double elimination requires exactly 2, 4, 8, or 16 entrants; saved voting durations are 10–3600 seconds.

---

## 2.5 Matchup Scoreboard & Versus Endpoints

Dedicated scoreboard system for fighting games, speedrun races, multi-player showdowns, and sports matches between 2, 3, or 4 competitors.

### Get Matchup State
- **Endpoint**: `GET /api/matchup`
- **Description**: Returns active matchup state including competitor names, sub-tags, colors, scores, game format, target score, and active winner status.

### Update Matchup Settings
- **Endpoint**: `POST /api/matchup`
- **Description**: Updates match title, phase, sub-details, series format (`points`, `bestOf`, `firstTo`), target score, competitor count (2, 3, or 4), or competitor metadata.
- **Body**:
  ```json
  {
    "title": "Capcom Pro Tour - Grand Finals",
    "phase": "Grand Finals",
    "details": "Best of 5 · First to 3",
    "format": "bestOf",
    "targetScore": 3,
    "competitors": [
      { "id": "c1", "name": "Daigo", "tag": "Ryu", "color": "#e5534b", "score": 2 },
      { "id": "c2", "name": "Justin Wong", "tag": "Chun-Li", "color": "#58a6ff", "score": 1 }
    ]
  }
  ```

### Increment or Set Competitor Score
- **Endpoint**: `POST /api/matchup/score`
- **Description**: Adjusts a competitor's score by a delta (`+1` or `-1`) or sets an absolute score. Reaching the required series target in Best-of / First-to formats automatically declares the set winner, triggers audio fanfare, and spawns celebratory confetti.
- **Body**: `{ "competitorId": "c1", "delta": 1 }` or `{ "competitorId": "c1", "score": 3 }`.

### Swap Player Sides (P1 ⇄ P2)
- **Endpoint**: `POST /api/matchup/swap`
- **Description**: Instantly swaps Player 1 and Player 2 names, character/sub-tags, custom team colors, and current scores. Ideal for fighting game side swaps (P1 side vs P2 side).

### Reset Matchup Scores
- **Endpoint**: `POST /api/matchup/reset-scores`
- **Description**: Resets all competitor scores to 0 and clears the winner state while keeping names, character tags, and format configuration intact for the next game or set.

### Reset Matchup
- **Endpoint**: `POST /api/matchup/reset`
- **Description**: Resets the entire matchup scoreboard back to initial default state.

### Matchup Fight Card / Exhibition Queue
- **Endpoint**: `GET /api/matchup/queue`
- **Description**: Returns all scheduled matches in the fight card queue and the current active queue index.

### Add Match to Queue
- **Endpoint**: `POST /api/matchup/queue`
- **Description**: Appends a new match to the fight card queue with optional immediate load.
- **Body**:
  ```json
  {
    "match": {
      "title": "Street Fighter 6",
      "phase": "Exhibition #1",
      "competitors": [
        { "name": "Player 1", "tag": "Ken", "score": 0 },
        { "name": "Player 2", "tag": "Ryu", "score": 0 }
      ]
    },
    "loadImmediately": false
  }
  ```

### Step / Select Queue Match
- **Endpoint**: `POST /api/matchup/queue/select` (Body: `{ "id": "queue-1" }`), `POST /api/matchup/queue/next`, `POST /api/matchup/queue/prev`
- **Description**: Advances, steps back, or directly loads a scheduled match from the fight card queue into the live scoreboard overlay.

### Delete Queue Match
- **Endpoint**: `DELETE /api/matchup/queue/:id`
- **Description**: Removes a scheduled match from the fight card queue.

### Matchup Presets & History
- **Get Presets**: `GET /api/matchup/presets` — Returns saved matchup configuration presets.
- **Save Preset**: `POST /api/matchup/presets` — Saves current or provided configuration as a named preset: `{ "name": "SF6 FT10", "matchup": { ... } }`.
- **Load Preset**: `POST /api/matchup/presets/load` — Loads a preset directly to live scoreboard: `{ "id": "preset-1" }`.
- **Delete Preset**: `DELETE /api/matchup/presets/:id` — Deletes a saved preset.
- **Get History**: `GET /api/matchup/history` — Returns list of completed fight sets and exhibition results.
- **Restore Matchup**: `POST /api/matchup/history/restore` — Restores a past fight set to the live scoreboard: `{ "id": "mh-1" }`.
- **Delete History Record**: `DELETE /api/matchup/history/:id` — Deletes an archived matchup record.
- **Clear History**: `POST /api/matchup/history/clear` — Clears all matchup history.

### Match Clocks & Timers
Dual-mode match clocks (EVO fighting game round timer or GDQ marathon stopwatch) integrated with the live matchup scoreboard.
- **Start Clock**: `POST /api/matchup/clock/start` — Resumes or starts the active match clock.
- **Pause Clock**: `POST /api/matchup/clock/pause` — Pauses the match clock (auto-triggered when set winner condition is met).
- **Reset Clock**: `POST /api/matchup/clock/reset` — Resets the clock to configured mode duration or zero: `{ "seconds": 99 }`.
- **Set Clock Mode & Settings**: `POST /api/matchup/clock/set` — Configures mode and parameters:
  ```json
  {
    "mode": "countdown",
    "duration": 99,
    "estimate": "45:00"
  }
  ```

### Speedrun Battle Multi-Runner Race Clocks (GDQ Mode)
Synchronized multi-runner clocks for speedrun races with individual splits and delta calculations:
- **Sync Start All Runners**: `POST /api/matchup/clock/race/start-all` — Starts the master timer and all competitor split timers in perfect synchronization.
- **Pause All Runners**: `POST /api/matchup/clock/race/pause-all` — Pauses the master race clock and all runner split timers.
- **Reset All Runners**: `POST /api/matchup/clock/race/reset-all` — Resets all runner split clocks, finished states, and delta badges to zero.
- **Finish / Split Runner**: `POST /api/matchup/clock/race/finish` — `{ "competitor": 0 }` Locks a competitor's finish time and calculates their delta badge (`WINNER` for first finisher, `+MM:SS.ss` for subsequent finishers).
- **Toggle Individual Runner**: `POST /api/matchup/clock/race/toggle` — `{ "competitor": 0 }` Pauses or resumes an individual runner's timer.
- **Reset Individual Runner**: `POST /api/matchup/clock/race/reset` — `{ "competitor": 0 }` Resets an individual runner's split clock and clears their finish state.
- **Set Target Estimate**: `POST /api/matchup/clock/race/estimate` — `{ "estimate": "45:00" }` Sets the target estimated finish time shown on overlays and studio monitors.

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

Control also accepts direct REST triggers like `POST`/`GET /api/timers/:id/toggle`, `POST`/`GET /api/timers/:id/start`, `POST`/`GET /api/timers/:id/pause`, `POST`/`GET /api/timers/:id/reset`, `GET /api/timers/:id/add_time?minutes=5`, and `GET /api/timers/:id/control?action=toggle`. Read an individual timer with `GET /api/timers/:id`. Plain-text fields for Companion button displays are available at `GET /api/timers/:id/field/:field` (e.g. `remaining`, `elapsed`, `state`, `label`, `progress`).

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

### Multipage Overlay Navigation
- **Endpoints**:
  - `GET /api/custom-overlays/:id/page`: Returns `{ enabled, page, name, index, count, auto, pages }`.
  - `POST /api/custom-overlays/:id/page`: Switches active page or scene state live across all connected browser sources.
- **Body**:
  ```json
  {
    "action": "goto",
    "page": "gameplay-scene"
  }
  ```
- **Actions**: `next`, `prev`, `first`, `last`, `goto`, `auto`, `enable`, `disable`, `toggle`. `page` accepts a page ID, name, or 1-based number (or array of page targets for enable/disable/toggle). Dedicated web remote available at `/overlay-control.html?id=<id>`.

### Slideshow Element Remote Control
- **Endpoint**: `POST /api/custom-overlays/:id/slideshow`
- **Description**: Broadcasts cycling actions to slideshow layers across live browser sources.
- **Body**:
  ```json
  {
    "action": "next",
    "element": "sponsor-slideshow"
  }
  ```
- **Actions**: `next`, `prev`, `pause`, `play`, `toggle`. Omit `element` to target all slideshow layers on the overlay.

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
- **Description**: Retrieves observed metrics, chat days (`sessionsAttended`, retained for compatibility), bits, gift subs, raids, and private notes. If Community insights are enabled, `community` contains the index status, optional `follow` snapshot, and `insights` (approximate streams and streak, observed hashtags and emotes, and last return). Emotes include `name`, `count`, and an optional `imageUrl`. `insights` is null until indexing completes; a missing follow date is unknown, not proof the viewer does not follow.

### Community Index Status
- **Endpoint**: `GET /api/community/insights/status`
- **Description**: Returns `enabled`, `phase` (`off`, `scanning`, `ready`, or `error`), `error`, and `progress` (`completed` and `total` files). Enable tracking through `PUT /api/config` with `{"community_insights_enabled": true}`; the default is false.

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

## 8. Standalone Tier List & Chat Voting API

### `GET /api/tier-list`
Fetches the current active tier list state including tiers, items, active vote, and presets.

### `PUT /api/tier-list`
Updates tier list configuration (title, theme, settings, or tier order).

### `POST /api/tier-list/item`
Adds a single item to the tier list or unranked pool tray.
```json
{
  "name": "Chrono Trigger",
  "imageUrl": "/custom-overlay-assets/chrono.png",
  "tierId": null,
  "note": "Masterpiece JRPG"
}
```

### `POST /api/tier-list/items/batch`
Bulk adds items (e.g. from Asset Library selection).

### `POST /api/tier-list/move`
Moves an item to a tier or reorders items.
```json
{
  "itemId": "item-123",
  "toTier": "tier-s",
  "toIndex": 0
}
```

### `POST /api/tier-list/vote/start`
Starts audience chat voting on an item.
```json
{
  "itemId": "item-123",
  "duration": 60,
  "consensusMode": "weighted_mean"
}
```

### `POST /api/tier-list/vote/cast`
Casts a vote manually (for testing or external integrations).
```json
{
  "user": "StreamViewer",
  "userId": "viewer-123",
  "tierId": "tier-s",
  "isSub": false
}
```

### `POST /api/tier-list/vote/end`
Ends active vote and optionally moves the item into the winning consensus tier.
```json
{
  "applyConsensus": true
}
```

### `POST /api/tier-list/vote/cancel`
Cancels the active vote without moving the item.

### `POST /api/tier-list/presets/save`
Saves current tiers and optionally items as a custom preset.
```json
{
  "name": "Custom JRPG Ranking",
  "description": "Custom template",
  "includeItems": false
}
```

### `POST /api/tier-list/presets/:id/load`
Loads a saved or built-in preset by ID.

### `DELETE /api/tier-list/presets/:id`
Deletes a preset by ID.

### `POST /api/tier-list/presets/reset`
Restores the built-in default presets.

---

## 9. Interactive Trivia & Audience Chat Voting API

### `GET /api/trivia`
Returns the public trivia game state. Add query `?includeAnswers=true` for admin view including hidden correct indexes and fun facts.

### `GET /api/trivia/status`
Lightweight summary for Companion buttons and dashboard widgets (`status`, `currentIndex`, `totalQuestions`, `activeCategory`, `activeQuestionText`, `totalVotes`, `remainingSeconds`).

### `PUT /api/trivia`
Update `settings` and/or `theme`. `settings.revealDelay` (0–60 seconds) waits after the countdown before automatic reveal; `settings.advanceDelay` (0–300 seconds) holds the revealed answer before optional auto-advance. Zero is supported for both. During the pre-reveal delay, `status` remains `question`, `remainingSeconds` is zero, answers stay hidden, and votes are rejected.

`settings.defaultDuration` (5–300 seconds) applies to every bank question unless the start request explicitly supplies a positive duration. `settings.randomizeChoices` shuffles choices per start and remaps the correct answer without modifying saved questions. Runtime choice indexes and letter votes refer to the displayed order.

Theme fields `timerColor`, `timerWarningColor`, and `timerCriticalColor` accept CSS colors, including `#RRGGBBAA`. `cardMaxWidth` accepts CSS maximum widths such as `1600px`, `85vw`, or `100%` for Cards & Boxes.

### `POST /api/trivia/question/start` (or `GET`)
Starts the current or target question timer and opens audience chat voting. Supports query params `?id=<id>` or `?index=<index>` and `?duration=<seconds>`.

### `POST /api/trivia/question/reveal` (or `GET`)
Immediately concludes question voting, cancels a pending reveal delay, displays the correct answer, broadcasts reveal fanfare, and reveals optional background fun facts.

### `POST /api/trivia/question/clear` (or `GET`)
Stops pending timers, clears votes and the active question, and broadcasts `trivia:state` with `status: "idle"`. The question bank, current index, and played/done marks are preserved.

### `POST /api/trivia/question/next` (or `GET`)
Advances to the next question in the bank (or random unplayed question if Random Order is enabled) and starts its countdown timer.

### `POST /api/trivia/question/prev` (or `GET`)
Returns to the previous question in the bank.

### `POST /api/trivia/question/toggle-done` (or `GET`)
Companion-friendly toggle for question played/done state. Accepts query `?id=<id>` (defaults to active question):
```http
GET /api/trivia/question/toggle-done?id=q_1731089201
```

### `POST /api/trivia/question/done`
Explicitly sets the played/done state of a question:
```json
{
  "id": "q_1731089201",
  "done": true
}
```

### `POST /api/trivia/questions/reset-done` (or `GET`)
Marks all questions in the bank as unplayed (`done = false`).

### `POST /api/trivia/reset` (or `GET`)
Halts any active question timers, clears active votes, and resets trivia state to `idle`.

### `POST /api/trivia/vote`
Casts a vote manually or via API:
```json
{
  "choiceIndex": 1,
  "user": "CoolViewer",
  "userId": "cool_viewer_123"
}
```

### `POST /api/trivia/question`
Adds a new question to the bank (supports 2 to 6 choices, or True/False):
```json
{
  "category": "Gaming",
  "question": "What year was Super Mario World released in Japan?",
  "choices": ["1988", "1990", "1991", "1992"],
  "correctIndex": 1,
  "funfact": "Launch title for the Super Famicom in Japan on November 21, 1990."
}
```

### `PUT /api/trivia/question/:id`
Updates an existing question in the bank.

### `DELETE /api/trivia/question/:id`
Deletes a question by ID.

### `POST /api/trivia/questions/move` (or `GET`)
Moves a question up or down in the bank order:
```http
POST /api/trivia/questions/move?id=q_1731089201&direction=up
```

### `POST /api/trivia/questions/shuffle` (or `GET`)
Randomly shuffles the order of questions in the active bank.

### `POST /api/trivia/questions/reorder`
Reorders questions by array of IDs: `{ "ids": ["q-2", "q-1", "q-3"] }`.

### `POST /api/trivia/questions/import`
Batch imports questions: `{ "questions": [...], "replace": false }`.

### `GET /api/trivia/presets`
Lists saved and built-in trivia question packs.

### `POST /api/trivia/presets/save`
Saves current questions and themes as a reusable preset pack: `{ "name": "Speedrun Lore", "description": "Custom questions" }`.

### `POST /api/trivia/presets/:id/load` (or `GET`)
Loads a preset quiz pack into the question bank.

### `DELETE /api/trivia/presets/:id`
Deletes a custom user preset pack.

---

## 10. WebSocket Live Push Protocol

Connect to `ws://localhost:3000` (or your configured host/port). Messages use a `{ "type": "...", "data": {...} }` envelope.

The server sends protocol ping frames every 30 seconds while connected; clients must answer with pong (browser WebSockets do this automatically). Dead or backlogged clients are disconnected and should reconnect for a fresh snapshot. Incoming reports have a 64 KiB message limit; outgoing snapshots are not subject to that limit. Slideshow reporting is bounded to 256 distinct keys per connection. See [live-state memory bounds](architecture.md#live-state-memory-bounds) for queue limits and cleanup. Reconnection does not replay missed transient alerts or control commands.

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

## 11. Embedded Mode

With `STREAMPULSE_EMBEDDED=true`, `require('streampulse/server.js')` exports `startServer`, `stopServer`, `onBroadcast`, `getSnapshots`, `setExternalData`, `registerHostSource`, `getHostSources` and `ingestEvent`.

- **`registerHostSource({ id, label })`**: adds a donation source (for example `{ id: 'tiltify', label: 'Tiltify' }`) to the alert rule and chat bot announcement source pickers. Listed in `/api/status` as `hostSources`. `getHostSources()` returns the list.

- **`ingestEvent({ type: 'donation', id, user, amount, currency, message, source, avatar })`**: feeds an external donation (for example Tiltify) through the same path as Social Stream Ninja donations: donation feed and latest-event placeholders, donation goals, session stats and the alerts engine. Returns the alert payload, or `null` when no rule matched or the `id` was already ingested. Other types throw.

### Embedded Host Integration

Embedded host bundles share external variables as `{{rep.<bundle>.<name>.<path>}}` placeholders, forward external donations through `ingestEvent` with `source: 'tiltify'` and register external host sources. Chat bot `{total}`/`{goal}` can then use `rep.tiltify.total` and `rep.tiltify.campaignGoal`, and commands can show `{{rep.tiltify.total|money}}`.

---

## 12. Subathon Automation Engine

StreamPulse features a fully automated, modular Subathon Engine that dynamically adds time to designated countdown timers whenever Twitch or external events occur. When disabled in System Config (`subathon_enabled: false`), the engine is inactive and imposes zero performance footprint.

### Configuration & State
| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/subathon` | `GET` | Return full subathon state (`config`, `stats`, `multiplier`, `auditLog`, `ruleSummary`, `targetTimer`) |
| `/api/subathon` | `PUT` | Update subathon configuration and rules (deep-merged with existing settings) |
| `/api/subathon/toggle` | `POST` / `GET` | Toggle active subathon state on/off (`?enabled=1` or `0`, or without params to invert) |
| `/api/subathon/multiplier` | `POST` / `GET` | Set or clear Boost Period multiplier (`?factor=2&durationMinutes=30` or `?clear=1`; `/api/subathon/boost` supported as alias) |
| `/api/subathon/undo` | `POST` / `GET` | Undo the last applied event and subtract its added time from the countdown timer |
| `/api/subathon/test` | `POST` | Simulate a subathon event (`event`, `tier`, `count`, `bits`, `amount`, `viewers`, `points`) |
| `/api/subathon/rules` | `GET` | Return human-readable rule summary string and structured rule parts |
| `/api/subathon/field/:field` | `GET` | Plain-text endpoint for Bitfocus Companion polling |

Partial rule updates retain omitted values, including donation defaults when editing exact-amount rules. A timed Boost Period expires and broadcasts its updated state without waiting for another event or poll; an unexpired saved boost resumes its expiry timer after restart.

### Plain-Text Companion Fields (`/api/subathon/field/:field`)
- `enabled`: `true` or `false`
- `targetTimerId`: Target timer ID
- `targetTimerTitle`: Target timer display title
- `multiplier`: Current active multiplier (e.g. `1` or `2`)
- `boost`: `true` when multiplier > 1 (Boost Period active)
- `boost_active`: `true` when multiplier > 1
- `happy_hour`: `true` when multiplier > 1 (alias)
- `totalSecondsAdded`: Total seconds added during this session
- `totalAddedFormatted`: Human-readable total added (e.g. `2h 15m 00s`)
- `totalEvents`: Total number of processed subathon events
- `ruleSummary`: Formatted string of active rules (e.g. `Tier 1: +2m | 100 Bits: +30s | $1: +1m`)
- `maxCapReached`: `true` if current timer remaining seconds have hit the hard safety ceiling

### Dynamic Rules Overlay (`/overlays/subathon-rules.html`)
A standalone 60fps overlay that reflects configured rates in real time and can be customized via the Timer Manager's Appearance Studio or URL query parameters:
- `?layout=grid|compact|ticker`: Display layout mode (grid, horizontal chips strip, or marquee ticker)
- `?theme=dark|glass|arcade|light|minimal`: Visual color theme preset
- `?columns=0|2|3|4`: Number of columns for grid layout (0 = responsive auto-fit)
- `?scale=1.0`: Resolution-independent scaling factor (0.5 to 3.0)
- `?title=Custom Header`: Custom banner title text
- `?header=0|1`: Toggle header bar visibility
- `?total=0|1`: Toggle total added time badge in header
- `?boost=0|1`: Toggle Boost Period pulse indicator bar (`?happyHour=0|1` supported as alias)
- `?icons=0|1`: Toggle rule card SVG icons
- `?notes=0|1`: Toggle rule detail note subtitles
- `?subs=0|1`, `?tips=0|1` (or `?donations=0|1`), `?bits=0|1`, `?follows=0|1`, `?raids=0|1`: Granular channel visibility toggles
- `?preview=1` / `?sample=1`: Render high-fidelity sample rates for previewing when subathon is inactive
- Real-time `postMessage` protocol: Accepts `{ type: 'subathon:preview-config', theme: {...}, sample: boolean }` for 0ms flicker-free 60fps theme and styling updates without reloading.
