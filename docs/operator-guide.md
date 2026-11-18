# Operator Mode (`/operator.html`)

StreamPulse **Operator Mode** is a unified, modular live-show control console designed for fast broadcasting operations on a desktop monitor, tablet, or embedded OBS Studio Custom Browser Dock.

---

## 1. Core Architecture & Capabilities

### Unified Control Tabs + Pinned Live Board
Operator Mode combines **two complementary views**:
1. **Live Board (`board`)**: Your customizable multi-column pinboard (`1–4` columns). Mix and match live cards across enabled domains — e.g., pin an **Alert Queue** card, a **Timers** rack, a **Custom Overlay** controller, a **Variable Set** switcher, and **Music Now Playing** on a single screen.
2. **Domain Tabs**: Focused workspaces for deep live adjustments:
   - **Variables** (`variables`): Inline spreadsheet table, Tracker matrix, Single Variable quick editor, and Variable Group cards. Supports deep links (`/operator.html#<setId>`, `/operator.html#<setId>/matrix`, `/operator.html#var=<name>`, `/operator.html#group=<name>`).
   - **Overlays** (`overlays`): Selectively add only the Custom Overlays needed for your show (**Add Overlay** picker — never dumps every overlay at once) to switch Pages, toggle auto-advance, play/pause/mute Videos & YouTube embeds, control Slideshows and Cutouts, and update Speaker Badges. On the **Live Board**, you can pin either a full customizable overlay card (toggling individual sections via the card's sliders button) or focused granular cards (**Overlay Pages**, **Overlay Media Playback**, **Overlay Cutouts**, **Overlay Speaker Badges**).
   - **Timers** (`timers`): Start, pause, reset, and adjust (`-1m`, `+1m`, `+5m`) timers and toggle overlay visibility. When **Subathon** is enabled in System Configuration, Subathon automation controls (active toggle, 2x boost, undo) appear automatically.
   - **Alerts** (`alerts`): Pause/resume queue, skip current alert, clear waiting alerts, mute SFX audio, replay the last alert, and trigger enabled on-stream announcements.
   - **Music** (`music`): Monitor Now Playing metadata/artwork and show, hide, or toggle the Music Overlay.

> **Heavy Interactive Studios Stay Separate**: Multi-step setup and bracket studios (**Polls**, **Trivia**, **Versus**, and **Tier List**) remain on their dedicated studio pages to keep Operator Mode fast and uncluttered.

---

## 2. Config Editor Gating & Zero-Overhead Execution

- **Automatic Module Gating**: Operator Mode reads `/api/status` (`modules`) and listens for live `config-updated` WebSocket broadcasts. Features turned off in **System → Config** (such as `music`, `subathon`, `variableSets`, or `variableSettings`) never appear as tabs or Live Board cards and execute zero background work.
- **Lazy Mounting & Idle Pausing**: Only the active tab is mounted. Switching away cleanly unmounts previous controllers, and live timer readouts pause background intervals when browser tabs are hidden.

---

## 3. Presets, Import/Export & OBS Dock Mode

Operator Mode stores named presets in `data/operator-profiles.json` (included automatically in StreamPulse **Backup & Restore** archives):

- **Server Presets**: Create, rename, duplicate, activate, or delete presets under **Presets & Export**.
- **Customize Tabs**: Choose per preset which enabled Domain Tabs remain visible in the top bar.
- **JSON Import & Export**: Export all presets (or a single preset via `/api/operator/export?id=<id>`) to share setups or restore individual boards (`merge` or `replace`).
- **OBS Browser Dock URLs & Compact Density**: Append `?profile=<id>&dock=1` (or `&embed=1`) to pin an OBS Custom Browser Dock or tablet to a specific preset with the main top navigation and board-builder toolbar hidden, **Compact** spacing enabled automatically, and the top strip reduced to icon-only domain tabs + minimal controls (add `&bare=1` to hide the top tab bar completely, `&dense=0|1` to override density, or `&focus=1` to keep only one panel expanded at a time):
  ```text
  http://localhost:3000/operator.html?profile=default&dock=1
  ```
- **Collapsible Panels & Focus Mode (`?focus=1`)**: Collapse or expand individual Live Board and Overlay panels via each header's chevron, or toggle **Focus** so expanding any panel automatically collapses the others.
- **Two-Type Lock Mode (`?lock=layout|show`)**:
  - **Lock Layout**: Prevents dragging, resizing, renaming, adding, or removing cards and overlays while keeping every live control and input active.
  - **Show Mode (Read-Only)**: Locks layout AND makes variable/data inputs read-only value displays while keeping live broadcast controls active (Overlay page switching, Videos/YouTube & Slideshow playback, Cutouts, Timers, Alerts, and Music Overlay toggles).
- **Live Preset Sync**: Activating a preset from the UI or Bitfocus Companion (`/api/operator/profile/select?id=...`) broadcasts an `operator-active-profile` WebSocket event so normal `/operator.html` windows switch live, while windows explicitly pinned via `?profile=<id>` remain locked to their URL preset.

---

## 4. Bitfocus Companion & HTTP API

All preset endpoints support both standard REST methods and Companion-friendly `GET` triggers:

| Endpoint | Methods | Description |
| --- | --- | --- |
| `/api/operator` | `GET` | Full Operator state (`activeProfileId` and `profiles`) |
| `/api/operator/status` | `GET` | Lightweight summary (`activeProfileId`, `activeProfileName`, `profileCount`, `cardCount`, `overlayCount`) |
| `/api/operator/profiles` | `GET`, `POST` | List presets or create/save a preset (`?select=1` also activates it) |
| `/api/operator/profiles/:id` | `GET`, `PUT`, `DELETE` | Fetch, update/create, or delete a specific preset |
| `/api/operator/profiles/:id/activate` | `GET`, `POST` | Activate preset by ID and live-sync connected normal Operator windows |
| `/api/operator/profile/select` | `GET`, `POST` | Companion trigger accepting `?id=<id>` or `?name=<name>` |
| `/api/operator/export` | `GET` | Export JSON bundle (`?id=<id>` for single preset, `?download=1` for attachment) |
| `/api/operator/import` | `POST` | Import JSON presets (`?mode=merge` or `?mode=replace`) |

---

## 5. Extending Operator Mode (Developer Plugin Contract)

New StreamPulse modules plug into Operator Mode by calling the shared registry in `public/js/operator/operator-registry.js`:

- **`registerOperatorModule({ id, label, iconSvg, order, isEnabled, mount, unmount, onSocket, onStatus })`**: Registers a new Domain Tab automatically gated by Config Editor flags.
- **`registerCardType({ type, moduleId, label, description, iconSvg, defaultSpan, isEnabled, getPickerItems, mount, unmount, onSocket })`**: Registers a reusable Live Board card widget.

Import the new plugin file inside `public/js/operator/operator-main.js` and the module integrates into navigation tabs, **Customize Tabs**, and **Add Card** pickers without modifying the core shell.
