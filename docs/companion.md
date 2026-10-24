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
  - `Polls: start poll (preset or custom)`: Launch an audience poll from a saved template dropdown or custom question, comma-separated choices, duration, blind voting toggle, and 2x subscriber multiplier.
  - `Polls: end / extend / cancel active poll`: Conclude the active poll & crown the winner, add voting time (`+30s` or custom seconds), or cancel/dismiss the poll.
- **Versus & Speedrun Studio**:
  - `Versus: change game or round score`: Increment or decrement Game Score (`delta`) or Round in Game (`roundDelta`) for Competitors 1–4.
  - `Versus: clock / speedrun race control`: Start, pause, or reset the match clock; sync-start, pause, or reset all speedrun race runners; switch clock modes (`race`, `countdown`, `stopwatch`, `none`); switch Speedrun Runner Timer Display between **Overall Clock Only — Reveal on Finish** (`timers_finish`), **Always Show Live Runner Timers** (`timers_always`), and **Overall Clock Only — Never Show Runner Times** (`timers_off`); or toggle Speedrun Split Deltas (`splits_toggle`, `splits_on`, `splits_off`).
  - `Versus: runner finish / toggle / reset`: Lock a runner's finish split & reveal their placement/delta (`finish`), start/pause an individual runner (`toggle`), or reset a runner (`reset`) for Runners 1–4.
  - `Versus: swap sides / reset scores / queue / presets`: Swap P1 and P2 sides, reset scores & rounds (`0-0`), save a snapshot to match history, advance/rewind the matchup queue, or load a saved Matchup Preset.
- **Tournaments (Esports Brackets & Poll Tournaments)**:
  - `Tournament: change match game or round score`: Adjust Game Score (`delta`) or Round in Game (`roundDelta`) for Entrant 1 or Entrant 2 on the active (or selected) bracket match.
  - `Tournament: confirm & advance match winner`: Confirm and advance the winning entrant (`Auto / Target Met`, `Entrant 1`, `Entrant 2`, or `Draw / Tie`) to the next round.
  - `Tournament: match selection, highlight & bracket control`: Cycle to the next/previous ready match, pin a specific match as live, unpin the live match for concurrent multi-station play, toggle the live bracket highlight glow (`highlightLive`), reset match scores, rollback/reopen a completed match, or launch an audience poll vote for the active Poll Tournament match.
- **Chat Bot & Alerts**:
  - `Run Bot Command`: Silently triggers custom chatbot commands or webhooks.
  - `Test Alert`: Simulates subscriber, bit, or raid alerts on stream.

---

## 3. Dynamic Feedbacks & Variables

The StreamPulse module exposes live variables and boolean feedbacks that update your Stream Deck buttons in real time:
- **Polls**: `$(streampulse:poll_active)`, `$(streampulse:poll_title)`, `$(streampulse:poll_total_votes)`, `$(streampulse:poll_remaining)`, `$(streampulse:poll_leader)`, `$(streampulse:poll_winner)`, plus the `Polls: poll actively running` (`poll_active`) feedback.
- **Versus & Speedrun**: `$(streampulse:matchup_title)`, `$(streampulse:matchup_phase)`, `$(streampulse:matchup_clock)`, `$(streampulse:matchup_runner_timers_mode)`, `$(streampulse:matchup_c1_name)`, `$(streampulse:matchup_c1_score)`, `$(streampulse:matchup_c1_rounds)`, `$(streampulse:matchup_c1_time)`, `$(streampulse:matchup_c1_delta)`, `$(streampulse:matchup_c1_place)` (and `c2` equivalents), plus `matchup_clock_running`, `matchup_runner_finished` (Runners 1–4), and `matchup_win_ready` feedbacks.
- **Tournaments**: `$(streampulse:tournament_title)`, `$(streampulse:tournament_status)`, `$(streampulse:tournament_format)`, `$(streampulse:tournament_round)`, `$(streampulse:tournament_e1_name)`, `$(streampulse:tournament_e1_score)`, `$(streampulse:tournament_e1_rounds)`, `$(streampulse:tournament_e2_name)`, `$(streampulse:tournament_e2_score)`, `$(streampulse:tournament_e2_rounds)`, `$(streampulse:tournament_pending_winner)`, `$(streampulse:tournament_champion)`, plus `tournament_active` and `tournament_win_ready` (lights up green when an entrant meets `targetScore` and is ready to advance).
- **Randomizer**: `$(streampulse:randomizer_last_mode)` and `$(streampulse:randomizer_last_duration)`: Last-used Randomizer mode and spin duration in seconds. `$(streampulse:randomizer_remaining)`, `$(streampulse:randomizer_removed)` and `$(streampulse:randomizer_elimination)`: choices left, choices removed and elimination mode for the last-used preset.
- **Stream & Session**: `$(streampulse:viewers)`, `$(streampulse:stream_uptime)`, `$(streampulse:track)`, `$(streampulse:latest_follow)`.
