# StreamPulse HTTP API & WebSocket Protocol

StreamPulse exposes a clean, RESTful HTTP API and a real-time WebSocket protocol designed for hardware controllers (such as Bitfocus Companion and Elgato Stream Deck), custom overlays, and automation scripts.

All endpoints are hosted locally at `http://localhost:3000` (or your configured port).

---

## 1. Session Lifecycle Endpoints

### Start Live Stream Session
- **Endpoint**: `POST /api/session/start`
- **Description**: Explicitly marks a new stream session as live, archives the previous session, and initializes viewer tracking.
- **Response**:
  ```json
  { "success": true, "session": { "id": "session-1729270000", "live": true } }
  ```

### End Current Stream Session
- **Endpoint**: `POST /api/session/end`
- **Description**: Gracefully ends the current session, finalizes stream duration, records peak viewer metrics, updates Game Plan playthrough times, and flushes chat logs.
- **Response**:
  ```json
  { "success": true, "archived": "session-1729270000" }
  ```

### Get Current Session State
- **Endpoint**: `GET /api/session`
- **Description**: Returns live viewer counts, current category, message counts, active chatters, and session duration.

---

## 2. Choice Randomizer Endpoints

### Trigger Spin
- **Endpoint**: `POST /api/randomizer/spin` (or `GET /api/randomizer/spin`)
- **Description**: Triggers a spin animation across all connected randomizer OBS overlays and studio editors.
- **Parameters** (optional JSON body or query params):
  - `forceIndex`: (number) Force the wheel/roller to land on a specific choice index.
  - `theme`: (string) Temporary visual theme override (`dark`, `neon`, `retro`, `pastel`, `system`).
- **Response**:
  ```json
  { "success": true, "action": "spin", "forcedIndex": null }
  ```

### Get Randomizer State
- **Endpoint**: `GET /api/randomizer/state`
- **Description**: Retrieves current choices, weighting array, active preset, and persistence configuration.

---

## 3. Named Timers Endpoints

### Adjust / Toggle Timer
- **Endpoint**: `POST /api/timers/:id/toggle`
- **Description**: Pauses or resumes the specified countdown or stopwatch.
- **Response**:
  ```json
  { "id": "break", "running": true, "remainingSeconds": 300 }
  ```

### Reset Timer
- **Endpoint**: `POST /api/timers/:id/reset`
- **Description**: Resets the timer back to its initial configured duration.

### Add / Subtract Time
- **Endpoint**: `POST /api/timers/:id/adjust`
- **Body**: `{ "seconds": 60 }` (positive to add, negative to subtract).

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
- **Description**: Returns a dictionary mapping all overlay keys to their current visibility boolean (`true` or `false`).

---

## 5. Media & YouTube Video Playback

### List Controllable Video Elements
- **Endpoint**: `GET /api/videos`
- **Description**: Lists all active HTML5 `<video>` and YouTube `<iframe>` elements across open custom overlay pages.

### Control Playback
- **Endpoint**: `POST /api/videos/control`
- **Body**:
  ```json
  {
    "overlayId": "main-stream",
    "elementId": "bg-video",
    "command": "play"   // "play", "pause", "toggle", "restart", "mute", "unmute", "toggle-mute"
  }
  ```

---

## 6. Chat Bot & Automation Endpoints

### Execute Command
- **Endpoint**: `POST /api/chatbot/run` (or `GET /api/chatbot/run?command=!shoutout&user=streamer`)
- **Description**: Directly triggers a chatbot command or action via HTTP request (useful for Bitfocus Companion buttons or external stream decks).
- **Body**:
  ```json
  {
    "command": "!game",
    "user": "broadcaster",
    "silent": true
  }
  ```

---

## 7. Community Directory & Viewer Dossiers

### Query Viewer Dossier
- **Endpoint**: `GET /api/crm/dossier/:username`
- **Description**: Retrieves lifetime metrics for a viewer: stream attendance, message counts, bits cheered, gift subs given, raids led, and private notes.

### Update Viewer Notes
- **Endpoint**: `POST /api/crm/notes`
- **Body**:
  ```json
  {
    "username": "coolviewer",
    "notes": "Met at TwitchCon, regular speedrunner",
    "tags": ["speedrunner", "vip-candidate"],
    "pronouns": "they/them"
  }
  ```

---

## 8. WebSocket Live Push Protocol

StreamPulse operates an overlay WebSocket server at `ws://localhost:3000/ws`.

When overlays connect, they receive live event packets in real time:
- **`stats_update`**: Real-time totals for messages, active chatters, and top hashtags.
- **`alert`**: Trigger payload containing rule metadata, sound file, animations, and custom text.
- **`visibility`**: Broadcast toggle signal for smooth CSS transitions.
- **`timer_tick`**: Clock and stopwatch state synchronized to the millisecond.
- **`randomizer_spin`**: Synchronized spin and outcome signal for multi-screen sync.
