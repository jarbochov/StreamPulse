# Bitfocus Companion & Stream Deck Integration

StreamPulse features deep hardware control integration with [Bitfocus Companion](https://bitfocus.io/companion) and the Elgato Stream Deck via the dedicated [`companion-module-streampulse`](https://github.com/jarbochov/companion-module-streampulse) as well as the standard Companion **Generic HTTP** module.

---

## 1. Quick Setup

### Using the Dedicated Companion Module
1. Open **Bitfocus Companion** (v3.0+ recommended).
2. Go to the **Connections** tab and search for **StreamPulse**.
3. Click **Add**.
4. In the connection settings:
   - **Target Host**: `127.0.0.1` (or your local LAN IP if StreamPulse runs on a dedicated broadcast PC).
   - **Target Port**: `3000` (default StreamPulse HTTP port).
5. Click **Save**. The status badge will turn **OK (green)**.

### Using the Generic HTTP Module
If preferred, you can also use Companion's **Generic HTTP** module. Every actionable trigger endpoint in StreamPulse supports both `GET` (with query parameter fallbacks) and `POST` (with JSON bodies), allowing you to fire actions with simple URLs without writing JSON payloads.

---

## 2. Complete Supported Actions

Bind any of the following actions to your Stream Deck keys:

### Versus & Speedrun Studio
- **Change Score or Round**: Increment or decrement Game Score (`delta`) or Round in Game (`roundDelta`) for Competitors 1–4.
  - `GET /api/matchup/score?competitor=1&delta=1`
  - `GET /api/matchup/score?competitor=2&delta=-1`
  - `GET /api/matchup/score?competitor=1&roundDelta=1`
- **Swap Sides**: Swaps P1 and P2 names, tags, scores, rounds, colors, and runner splits.
  - `GET /api/matchup/swap`
- **Reset Scores**: Resets game scores and rounds to zero (`0–0`) while preserving competitor names, tags, and theme styling.
  - `GET /api/matchup/reset-scores`
- **Match Clock Control**: Start, pause, toggle running state, or reset the matchup countdown / stopwatch clock.
  - `GET /api/matchup/clock/start`
  - `GET /api/matchup/clock/pause`
  - `GET /api/matchup/clock/toggle`
  - `GET /api/matchup/clock/reset`
  - `GET /api/matchup/clock/set?mode=countdown&duration=300`
- **Speedrun Race Timers**: Multi-runner split clock controls for speedrun battles and GDQ-style marathons.
  - `GET /api/matchup/clock/race/start-all` (Sync-start all runners)
  - `GET /api/matchup/clock/race/pause-all` (Pause all runners)
  - `GET /api/matchup/clock/race/toggle-all` (Toggle running state across all runners)
  - `GET /api/matchup/clock/race/reset-all` (Reset all runner clocks & splits)
  - `GET /api/matchup/clock/race/finish?competitor=1` (Lock finish split & place delta for Runner 1)
  - `GET /api/matchup/clock/race/toggle?competitor=1` (Start/pause individual runner)
  - `GET /api/matchup/clock/race/reset?competitor=1` (Reset individual runner)
- **Queue & Presets**: Advance or rewind through your Fight Card matchup queue or load saved presets.
  - `GET /api/matchup/queue/next`
  - `GET /api/matchup/queue/prev`
  - `GET /api/matchup/presets/load?id=preset_id`

### Tournaments & Esports Brackets
- **Update Match Score**: Adjust Game Score (`delta`) or Round in Game (`roundDelta`) for Entrant 1 or Entrant 2 in the active (or selected) bracket match.
  - `GET /api/tournament/score?entrant=1&delta=1`
  - `GET /api/tournament/score?entrant=2&delta=-1`
- **Confirm & Advance Winner**: Confirm the winning entrant (`winner=1`, `winner=2`, or `winner=auto`) and advance them to the next bracket round or crown the champion.
  - `GET /api/tournament/advance?winner=1`
  - `GET /api/tournament/advance?winner=auto`
- **Start / Pin Match**: Mark a bracket match as live on stream, syncing the scoreboard overlay and activating the live bracket glow.
  - `GET /api/tournament/start-match?matchId=m1`
  - `GET /api/tournament/select-match?action=next` (Cycle to next ready match)
  - `GET /api/tournament/select-match?action=prev` (Cycle to previous ready match)
- **Match Score Reset & Rollback**: Reset scores for the current match or rollback advancement to restore previous bracket state.
  - `GET /api/tournament/reset-match`
  - `GET /api/tournament/rollback?matchId=m1`
- **Tournament Settings & Reset**:
  - `GET /api/tournament/settings?matchDuration=300&bestOf=5&highlightLive=1`
  - `GET /api/tournament/reset`

### Live Audience Polls
- **Create & Launch Poll**: Start an audience poll with question, comma-separated choices, duration, and blind voting toggle.
  - `GET /api/polls/create?title=Map+Pick&choices=Haven,Ascent,Bind&duration=60&blind=true`
  - `GET /api/polls/start?preset=jackbox`
- **Cast Simulated Vote**: Cast a test vote for Choice 1, 2, 3, etc.
  - `GET /api/polls/vote?user=Companion&choice=1`
- **Extend Voting Timer**: Add extra voting time in seconds.
  - `GET /api/polls/extend?seconds=30`
- **End Poll**: Conclude voting immediately, calculate winner, and trigger celebration overlay alert.
  - `GET /api/polls/end`
- **Toggle Blind Voting**: Hide or reveal live vote percentages from stream view while voting is active.
  - `GET /api/polls/toggle-blind`
- **Toggle Chat Voting**: Freeze or unfreeze incoming chat votes.
  - `GET /api/polls/toggle-voting`
- **Cancel Poll**: Dismiss the poll without crowning a winner.
  - `GET /api/polls/cancel`

### Alerts & Event Queue
- **Simulate Stream Alert**: Test alert presentation with custom type and parameters.
  - `GET /api/alerts/test-event?type=bits&amount=500&user=Cheerer`
  - `GET /api/alerts/test-event?type=sub&tier=1000&user=SubViewer`
  - `GET /api/alerts/test-event?type=raid&viewers=25&user=Raider`
  - `GET /api/alerts/test?ruleId=bits-big`
- **Alert Queue Controls**:
  - `GET /api/alerts/queue/pause` (Hold incoming alerts in queue)
  - `GET /api/alerts/queue/resume` (Resume queued alert presentation)
  - `GET /api/alerts/queue/clear` (Clear pending alerts and dismiss active alert)
  - `GET /api/alerts/queue/skip` (Skip current alert and advance to next)
  - `GET /api/alerts/replay?eventId=...` (Replay past event through current rules)

### Global & Overlay Video Playback
- **Global Video Controls**: Send unified playback commands to all `<video>` and embedded YouTube players across all overlays.
  - `GET /api/videos/control?action=play`
  - `GET /api/videos/control?action=pause`
  - `GET /api/videos/control?action=toggle`
  - `GET /api/videos/control?action=restart`
  - `GET /api/videos/control?action=mute`
  - `GET /api/videos/control?action=unmute`
  - `GET /api/videos/control?action=toggle-mute`
- **Targeted Overlay Video Controls**:
  - `GET /api/custom-overlays/:id/video?action=toggle`
  - `GET /api/custom-overlays/:id/video?action=restart`

### Chat Bot Automation
- **Toggle Active State**: Enable or disable automated bot responses to chat commands.
  - `GET /api/chatbot/enabled?action=toggle`
  - `GET /api/chatbot/enabled?enabled=true`
- **Trigger Bot Command**: Execute a configured command (including silent commands that trigger webhooks, OBS controls, or overlay events).
  - `GET /api/chatbot/run?command=hydrate`
  - `GET /api/chatbot/run?command=shoutout&arg=raider_name`
- **Send Channel Shoutout**:
  - `GET /api/chatbot/shoutout?user=friend_streamer`
- **Send Chat Message**:
  - `GET /api/chatbot/send?text=Thanks+for+watching!`

### Game Plan & Rundown
- **Play Now**: Set current game as active and automatically update your Twitch broadcast category and stream tags.
  - `GET /api/game-plan/now?id=game_id`
- **Advance Game**: Conclude the active game and advance to the next scheduled title in your lineup.
  - `GET /api/game-plan/advance`

### Choice Randomizer & Wheel
- **Spin Wheel / Roller / Cards**:
  - `GET /api/randomizer/spin`
  - `GET /api/randomizer/draw-card`
- **Restore Choices**: Restores all eliminated choices back to the active pool.
  - `GET /api/randomizer/restore`

### Custom Variables & Counters
- **Increment Counter**: `GET /api/variables/:name/increment?amount=1`
- **Decrement Counter**: `GET /api/variables/:name/decrement?amount=1`
- **Reset Counter**: `GET /api/variables/:name/reset?value=0`
- **Roll Random Choice**: `GET /api/variables/:name/roll`

### Overlay Visibility & Timers
- **Toggle Overlay Visibility**: Smoothly fade any overlay in or out.
  - `GET /api/overlay-visibility/:key?action=toggle` (keys: `credits`, `music`, `custom-overlay-id`)
- **Named Timers**: Start, pause, toggle, or reset countdowns and stopwatches.
  - `GET /api/timers/:id/toggle`
  - `GET /api/timers/:id/reset`
  - `GET /api/timers/:id/add?seconds=60`

---

## 3. Dynamic Variables & Real-Time Feedbacks

The StreamPulse status snapshot (`/api/status`) broadcasts live state for dynamic button labels and status feedback colors:

### Real-Time Companion Variables

| Variable Name | Description | Example Value |
|---|---|---|
| `$(streampulse:matchup_title)` | Active matchup headline | "Grand Finals" |
| `$(streampulse:matchup_phase)` | Matchup bracket phase | "Top 8" |
| `$(streampulse:matchup_clock)` | Formatted match clock | "04:32" |
| `$(streampulse:matchup_c1_name)` | Competitor 1 display name | "Daigo" |
| `$(streampulse:matchup_c1_score)` | Competitor 1 game score | `2` |
| `$(streampulse:matchup_c1_rounds)` | Competitor 1 round score | `1` |
| `$(streampulse:matchup_c1_time)` | Competitor 1 race split | "12:45.30" |
| `$(streampulse:matchup_c1_delta)` | Competitor 1 split delta | "+0.45" |
| `$(streampulse:matchup_c2_name)` | Competitor 2 display name | "Tokido" |
| `$(streampulse:matchup_c2_score)` | Competitor 2 game score | `1` |
| `$(streampulse:matchup_pending_winner)` | Name of competitor who reached target score | "Daigo" |
| `$(streampulse:tournament_title)` | Active tournament title | "Summer Invitational" |
| `$(streampulse:tournament_round)` | Active tournament round name | "Winners Semis" |
| `$(streampulse:tournament_e1_name)` | Entrant 1 name in active match | "Alpha" |
| `$(streampulse:tournament_e1_score)` | Entrant 1 score in active match | `3` |
| `$(streampulse:tournament_e2_name)` | Entrant 2 name in active match | "Beta" |
| `$(streampulse:tournament_e2_score)` | Entrant 2 score in active match | `1` |
| `$(streampulse:tournament_pending_winner)` | Ready-to-advance winner name | "Alpha" |
| `$(streampulse:tournament_champion)` | Crowned tournament champion | "Alpha" |
| `$(streampulse:poll_active)` | Whether a poll is actively running | `true` |
| `$(streampulse:poll_title)` | Active poll question | "Which game next?" |
| `$(streampulse:poll_leader)` | Choice leading the live vote | "Chrono Trigger" |
| `$(streampulse:poll_winner)` | Winning choice upon poll completion | "Chrono Trigger" |
| `$(streampulse:poll_remaining)` | Remaining voting seconds | `28` |
| `$(streampulse:poll_total_votes)` | Total votes cast | `142` |
| `$(streampulse:alerts_paused)` | Alert queue pause state | `false` |
| `$(streampulse:alerts_pending)` | Number of alerts waiting in queue | `0` |
| `$(streampulse:viewers)` | Live broadcast viewer count | `240` |
| `$(streampulse:stream_uptime)` | Formatted stream uptime | "02:15:30" |
| `$(streampulse:track)` | Currently playing music track title | "Solar Waves" |
| `$(streampulse:artist)` | Currently playing music artist | "Astral Echo" |
| `$(streampulse:latest_follow)` | Most recent channel follower | "SuperFan99" |
| `$(streampulse:latest_sub)` | Most recent subscriber | "MegaGifter" |
| `$(streampulse:gameplan_now)` | Currently playing game name | "Chrono Trigger" |
| `$(streampulse:randomizer_last_winner)` | Winner of last randomizer spin | "Pizza Night" |

### Boolean Feedbacks

- **`matchup_clock_running`**: Lights up green when the match clock or race stopwatch is ticking.
- **`matchup_win_ready`**: Lights up amber/green when a competitor has achieved the target match score, signaling ready to declare match victory.
- **`matchup_runner_finished`** (Competitors 1–4): Lights up when a specific runner's finish time has been locked.
- **`tournament_active`**: Highlights when an esports tournament bracket is loaded.
- **`tournament_win_ready`**: Lights up green when an entrant has reached `targetScore` and is ready for confirmation and bracket advancement.
- **`poll_active`**: Highlights when an audience poll is currently live.
- **`alerts_paused`**: Turns yellow/red when the alert queue is paused.
- **`overlay_visible`**: Reflects the on-air visibility state of any overlay.

---

## 4. Plain-Text Stream Deck Title Lookups

For Stream Deck buttons, custom scripts, or third-party devices that display text directly from HTTP without JSON parsing, StreamPulse provides raw plain-text field routes:

### Stream & System Status (`/api/status/field/:field`)
```text
http://127.0.0.1:3000/api/status/field/viewers         -> "240"
http://127.0.0.1:3000/api/status/field/uptime          -> "02:15:30"
http://127.0.0.1:3000/api/status/field/track           -> "Solar Waves"
http://127.0.0.1:3000/api/status/field/artist          -> "Astral Echo"
http://127.0.0.1:3000/api/status/field/latest_follow   -> "SuperFan99"
http://127.0.0.1:3000/api/status/field/latest_sub      -> "MegaGifter"
http://127.0.0.1:3000/api/status/field/matchup_title   -> "Grand Finals"
http://127.0.0.1:3000/api/status/field/matchup_clock   -> "04:32"
http://127.0.0.1:3000/api/status/field/matchup_c1_score -> "2"
http://127.0.0.1:3000/api/status/field/matchup_c2_score -> "1"
http://127.0.0.1:3000/api/status/field/counter_deaths  -> "7"
```

### Matchup & Versus Fields (`/api/matchup/field/:field`)
```text
http://127.0.0.1:3000/api/matchup/field/c1_score       -> "2"
http://127.0.0.1:3000/api/matchup/field/c2_score       -> "1"
http://127.0.0.1:3000/api/matchup/field/c1_name        -> "Daigo"
http://127.0.0.1:3000/api/matchup/field/c2_name        -> "Tokido"
http://127.0.0.1:3000/api/matchup/field/clock          -> "04:32"
http://127.0.0.1:3000/api/matchup/field/c1_time         -> "12:45.30"
http://127.0.0.1:3000/api/matchup/field/c1_delta        -> "+0.45"
http://127.0.0.1:3000/api/matchup/field/winner         -> "Daigo"
```

### Custom Variables & Counters (`/api/variables/:name?raw=1`)
```text
http://127.0.0.1:3000/api/variables/death_count?raw=1  -> "7"
```
