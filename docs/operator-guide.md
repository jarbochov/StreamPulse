# Operator Mode (`/operator.html`)

StreamPulse **Operator Mode** is your unified live-show control console, built for quick showrunning on a desktop monitor, tablet, or embedded OBS Studio Custom Browser Dock.

<div class="doc-gallery doc-gallery--2">
  <figure>
    <img src="images/operator-studio.png" alt="Operator Mode desktop Live Board with alert queue, timers, overlay controls, and music">
    <figcaption><strong>Desktop Live Board</strong>Mix live alerts, timers, custom overlays, and music controls in a multi-column board.</figcaption>
  </figure>
  <figure class="is-portrait">
    <img src="images/operator-dock.png" alt="Operator Mode in narrow OBS Studio dock mode with expanded Queue and Recent drawer">
    <figcaption><strong>OBS Custom Browser Dock</strong>Compact layout fits comfortably in narrow OBS docks with collapsible drawers.</figcaption>
  </figure>
  <figure>
    <img src="images/operator-runbook.png" alt="Operator Mode Runbook tab showing multi-column checkable tasks and Markdown notes">
    <figcaption><strong>Multi-Column Runbooks</strong>Combine checkable Tasks, rendered Markdown Notes, and Section headers with dedicated share links.</figcaption>
  </figure>
</div>

---

## 1. Live Board & Domain Tabs

Operator Mode brings two complementary views together:

1. **Live Board**: A customizable multi-column pinboard (`1–4` columns). Pin only the widgets your show needs — like **Alert Queue**, **Live Timers**, **Broadcast Layout**, **Variable Set** switchers, or **Music Now Playing** — drag to reorder, and collapse panels or switch on **Focus** to keep only one panel expanded at a time.
2. **Domain Tabs** (toggleable per preset via **Tabs**): Dedicated tabs for live show control:
   - **Variables**: Inline table editing, Trackers, Single Variable cards, and Variable Groups.
   - **Displays**: Add just the saved Display Library items your preset needs (Bingo Stamp Cards, Counters & Pips, Meters & Gauges, News Tickers, Inventories, Tables, Badges), choose `1–4` grid columns, drag-and-drop to reorder cards, toggle between interactive Controls and live Mini-Monitor per card, and copy dedicated direct or OBS Dock links (`/operator.html?preset=<preset>#display=<id>` or `?profile=<preset>&dock=1&bare=1#display=<id>`).
   - **Overlays**: Add just the Custom Overlays used in your broadcast to switch pages, control Videos/YouTube & Slideshows, toggle Cutouts, or update Speaker Badges.
   - **Timers**: Start, pause, reset, and adjust (`-1m`, `+1m`, `+5m`) live timers and toggle overlay visibility (including Subathon controls when enabled).
   - **Alerts**: Pause or resume the alert queue, skip current alerts, mute SFX, inspect waiting & recent alerts, replay past alerts, and trigger manual announcements.
   - **Music**: Monitor current track metadata and show or hide the Music Overlay.
   - **Versus**: Live scoreboard & active Tournament match controls (scores, rounds, live-ticking match clock with presets/start/pause/reset, swap, reset with undo, and tournament winner advancement; auto-hidden if disabled in System Config).
   - **Polls**: Launch new polls or saved poll presets right from Operator Mode, monitor live countdown & votes, extend duration (`+30s`), pause/resume voting, toggle blind mode, and end or cancel active polls (auto-hidden if disabled in System Config).
   - **Trivia**: Preview the next queued question and duration timer while idle, jump to any question, and run Start / Prev / Next / Reveal / Clear / Reset with a live countdown timer and chat vote bars (auto-hidden if disabled in System Config).
   - **Runbook**: Global server-saved library of multiple named runbooks supporting checkable **Tasks**, **Markdown Notes** (non-task callouts supporting bold, italic, lists, links, tables, and code blocks), and **Section** headings laid out across `1–3` columns with drag-and-drop reordering, task-only progress bars, reset checks, Live Board pinning, and dedicated direct/dock links (`/operator.html?preset=<preset>#runbook=<id>` or `?profile=<preset>&dock=1&bare=1#runbook=<id>`).

> **Creation & Setup Studios Stay Dedicated**: Multi-step creation and initial setup studios (**Polls**, **Trivia**, **Versus**, **Tier Lists**, **Display Library**, and **Custom Overlay Studio**) stay on their dedicated pages, while fast live-show controls (including Versus, Polls, Trivia, Displays, Overlays, Timers, Alerts, Music, Variables, and Runbooks) are built directly into Operator Mode.

---

## 2. Smart Module Visibility

Operator Mode adapts automatically to your StreamPulse settings. Any feature turned off in **System → Config** stays hidden from tabs and Live Board cards, keeping the workspace streamlined.

---

## 3. Presets, Docks & Lock Modes

Save multiple board setups as named **Presets** so you can switch layouts for different show formats (like Talk Show, Speedrun, or Intermission):

- **Customize Tabs**: Choose which tabs stay visible in the top bar for each preset.
- **Import & Export**: Back up your presets or share setups as a file using **Presets → Export / Import**.
- **OBS Custom Browser Dock**: Open **Presets** to copy a pre-built Dock URL (`?profile=default&dock=1`). Dock mode switches automatically to compact spacing and a slim single-row header — add `&bare=1` to hide the top tab strip completely, or `&focus=1` to start in single-panel accordion focus mode.
- **Two-Level Safety Locks**:
  - **Lock Layout**: Prevents accidentally dragging, renaming, or removing cards while keeping all live buttons editable.
  - **Show Mode (Read-Only)**: Locks your layout and prevents accidental text/variable edits while keeping live broadcast actions active (page switches, video/timer/alert controls).
- **Live Preset Sync**: Switching presets in an unpinned window updates other normal Operator tabs automatically, while windows pinned via a specific preset link stay locked to their assigned preset.

---

## Automation & Companion

Need Stream Deck triggers or HTTP control to switch Operator presets or toggle Runbook cues automatically? See the **[Bitfocus Companion Guide](companion.md)** or open **API Reference** from the StreamPulse app navigation.
