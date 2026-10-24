# Bitfocus Companion & Stream Deck Integration

StreamPulse features deep hardware control integration with [Bitfocus Companion](https://bitfocus.io/companion) and the Elgato Stream Deck via the dedicated [`companion-module-streampulse`](https://github.com/jarbochov/companion-module-streampulse).

---

## 1. Quick Setup

1. Open **Bitfocus Companion** on your computer.
2. In the **Connections** tab, search for **StreamPulse**.
3. Click **Add**.
4. In the connection settings:
   - **Target Host**: `127.0.0.1` (or your local network IP if running on a dedicated streaming PC).
   - **Target Port**: `3000` (default StreamPulse port).
5. Click **Save**. The status badge in Companion will turn **OK (green)**.

---

## 2. Supported Actions

With the Companion module connected, you can bind the following actions to any Stream Deck button:

- **Choice Randomizer**:
  - `Spin Randomizer`: Triggers the wheel, slot machine roller, or physical card deck. Mode, duration, suspense, auto-hide, button visibility and phrase preset inherit the current Studio/overlay settings unless explicitly overridden. It also supports a custom phrase pool and winner headline/subtitle. The key displays the last-used mode and spin duration. An Elimination option forces winner removal on or off for that spin; otherwise the preset's setting applies.
  - `Restore Randomizer Choices`: Puts every removed choice back in the pool for a preset.
  - `Draw Randomizer Card`: A preconfigured card-deck button; duration and auto-hide can inherit the current Studio/overlay settings or be changed in the action settings.
  - `Set Preset`: Switches between saved choice sets (e.g. "Jackbox Games", "Giveaway Chatters", "Next Level").
- **Overlay Visibility**:
  - `Toggle Overlay`: Smoothly fades any overlay (Credits, Goal, Countdown, Stopwatch, Music, Custom Overlay) in or out.
- **Session Lifecycle**:
  - `Start Session`: Marks the stream session as live.
  - `End Session`: Safely wraps up the session and saves archives.
- **Named Timers**:
  - `Start / Pause Timer`: Controls countdowns and stopwatches.
  - `Reset Timer`: Restores initial duration.
  - `Add Time`: Adds quick time increments (e.g. +60 seconds, +5 minutes).
- **Game Plan Rundown**:
  - `Play Now`: Marks a game as active and syncs your Twitch category automatically.
  - `Advance Game`: Finishes the current game and queues the next game in your lineup.
- **Live Polls**:
  - `End Poll / Crown Winner`: Concludes active poll and triggers celebrations.
  - `Extend Poll`: Adds +30 seconds of voting time to active poll.
  - `Cancel Poll`: Aborts active poll without crowning a winner.
- **Chat Bot & Alerts**:
  - `Run Bot Command`: Silently triggers custom chatbot commands or webhooks.
  - `Test Alert`: Simulates subscriber, bit, or raid alerts on stream.

---

## 3. Dynamic Feedbacks & Variables

The StreamPulse module exposes live variables that display directly on your Stream Deck buttons:
- `$(streampulse:randomizer_last_mode)` and `$(streampulse:randomizer_last_duration)`: Last-used Randomizer mode and spin duration in seconds. `$(streampulse:randomizer_remaining)`, `$(streampulse:randomizer_removed)` and `$(streampulse:randomizer_elimination)`: choices left, choices removed and elimination mode for the last-used preset.
- `$(streampulse:viewers)`: Current live viewer count.
- `$(streampulse:session_time)`: Formatted stream uptime (HH:MM:SS).
- `$(streampulse:now_playing)`: Currently active game title or music track.
- `$(streampulse:timer_remaining)`: Active countdown time remaining.
- `$(streampulse:last_follower)`: Username of the most recent follower.
