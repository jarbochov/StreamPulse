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

Each layout also has `cornerRadius` (pixels) and `background`: `{ mode, theme, color, endColor, angle, pattern, vignette, image, fit, focusX, focusY, shade }`. Modes are `theme` (default for older designs), `solid`, `gradient`, `transparent`, `image`, and `pattern`. Pattern choices are `grid`, `geometry`, `orbits`, `hexagons`, `dots`, `diagonal`, and `checker`; vignette and shade are 0–70 and 0–100; gradient angle is 0–360; crop focus values are 0–100. Background images must be local asset URLs. The background's `theme` selects its built-in artwork independently of other ratios, defaulting to the shared promo theme when migrating older designs. Choosing a custom background does not require a named theme. New promos start with a subtle vignette; missing vignette values on saved layouts normalize to zero.

Custom themes store a required name plus normalized palette/font/background settings, not content or layouts. Applying a theme in the browser copies its palette/font across the promo and its background into the current ratio. Theme changes are not live references.

Storage is `data/promos.json` (up to 200 designs) and `data/promo-themes.json` (up to 100 custom themes), included in full data backups. The Backup & Restore share endpoints can also list, export, inspect, and import individual scenes using `promo:<id>` item keys. Scene ZIPs include referenced local images and uploaded fonts; import supports `copy`, `replace`, or `skip` conflicts and rewrites asset references if filenames collide.

Validation failures return `400`, missing IDs return `404`, unsupported methods return `405`, and storage failures return `500`. Export renders all three arrangements and packages their PNGs into one ZIP in the browser; there is no server PNG export endpoint. The existing `/api/qr` and Asset Library endpoints supply QR graphics, fonts, and images.

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

## 2.5. Native Polls & Poll Studio Endpoints

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
- **Description**: Focuses a match as the active matchup in Poll Studio and the Esports Lower-Third Match HUD overlay (`?layout=active`).
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
