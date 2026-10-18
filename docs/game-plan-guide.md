# Game Plan Broadcast Scheduler Guide

**Game Plan** is an integrated stream rundown manager and broadcast schedule overlay with IGDB catalog integration, box art fetching, and full calendar planning.

![Game Plan Studio](images/game-plan-studio.png)

---

## 1. Calendar Planning & Lineups

- **Full Month & Week Views**: View all past streamed titles and upcoming scheduled games in a full calendar grid.
- **14-Day Quick Calendar Strip**: One-click scheduling directly from the game detail dialog.
- **Schedule Stages**:
  - `Tonight's Lineup`: Games queued for the current broadcast.
  - `Schedule`: Confirmed upcoming dates.
  - `Up Next`: High-priority games on deck.
  - `Backlog`: Saved games to play in the future.
  - `Played`: Completed campaigns and one-offs with total play hours recorded.

---

## 2. One-Click Broadcaster Actions

Control your broadcast rundown in real time with quick action buttons:
- **Play Now**: Marks a game as currently active, switches the overlay to "Now Playing", and **automatically updates your Twitch broadcast category**.
- **Stop**: Pauses the current game timer.
- **Finish & Next**: Marks the current game as played and automatically advances to the next title in tonight's lineup.
- **Move to Schedule**: Reassigns dates with a single click.

---

## 3. Dedicated OBS Overlays & URL Wizard

Use the visual **Game Plan URL Wizard** (`/game-plan-url-wizard.html`) to generate custom browser source overlays:

### Overlay Modes:
1. **Ticker Mode**: Sleek lower-third banner showing the current game, IGDB box art, and "Up Next" preview.
2. **Schedule Strip**: Horizontal card strip displaying your upcoming schedule for viewers.
3. **Checklist Mode**: Vertical rundown checklist that checks off games as you complete them.

### Responsive Cover Art Controls:
- `coverScale`: Multiplier for artwork sizing.
- `coverFit`: Fill (`cover`), letterbox (`contain`), or unconstrained (`natural`).
- Container queries ensure flawless scaling from 720p to 4K.
