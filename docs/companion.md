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
  - `Spin Randomizer`: Triggers the wheel or slot machine roller on your stream overlay.
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
- **Chat Bot & Alerts**:
  - `Run Bot Command`: Silently triggers custom chatbot commands or webhooks.
  - `Test Alert`: Simulates subscriber, bit, or raid alerts on stream.

---

## 3. Dynamic Feedbacks & Variables

The StreamPulse module exposes live variables that display directly on your Stream Deck buttons:
- `$(streampulse:viewers)`: Current live viewer count.
- `$(streampulse:session_time)`: Formatted stream uptime (HH:MM:SS).
- `$(streampulse:now_playing)`: Currently active game title or music track.
- `$(streampulse:timer_remaining)`: Active countdown time remaining.
- `$(streampulse:last_follower)`: Username of the most recent follower.
