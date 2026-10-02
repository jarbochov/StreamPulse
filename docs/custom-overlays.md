# Custom Overlays

Custom overlays are JSON-backed scenes that can be displayed in OBS or any browser source:

```text
http://localhost:3000/custom-overlay.html?id=be-right-back
```

Open `/custom-overlays.html` to create and manage overlays. The editor currently supports text, randomized text pools, Markdown, images, videos, webpage embeds, QR codes, progress bars/rings, game lists, and shapes. Elements can be positioned on a zoomable 1920×1080-style canvas, styled, reordered, aligned, snapped to canvas/element guides, and saved. The canvas can be panned with the middle mouse button, Shift-drag, or Alt-drag.

Saving an overlay increments its revision, writes the definition to `data/custom-overlays.json`, and broadcasts the updated definition over StreamPulse's WebSocket. Open overlay instances update without an OBS browser-source refresh.

Markdown is sanitized before rendering. It supports common formatting such as headings, emphasis, lists, links, images, and block quotes. Webpage embeds use a sandboxed iframe and may still be refused by sites that disallow framing. Overlay definitions are included in StreamPulse backups.

Images and videos can be uploaded from the selected element's properties. Uploads are stored in `data/custom-overlay-assets/`, served from `/custom-overlay-assets/<filename>`, and included in backups. Individual assets are limited to 100 MB.

Text and Markdown content support live variables using double braces. The editor's placeholder picker inserts these values without requiring memorization. Values refresh every five seconds in the runtime:

```text
{{viewers.current}}  {{viewers.peak}}  {{viewers.average}}
{{chatters}}  {{messages}}  {{followers}}  {{followers.session}}  {{subscribers}}  {{subscribers.session}}  {{gift_subs}}  {{gift_subs.total}}  {{bits}}  {{bits.total}}  {{donations}}  {{donations.total}}  {{hashtags}}
{{hashtags.top}}  {{hashtags.session_top}}  {{hashtags.total}}
{{music.title}}  {{music.artist}}  {{music.album}}  {{music.cover}}  {{music.position}}  {{music.duration}}  {{music.remaining}}  {{music.percent}}
{{stream.title}}  {{stream.category}}  {{overlay.name}}
{{plan.now}}  {{plan.scheduled}}  {{plan.backlog}}  {{plan.list.<list-id>}}
```

`{{music.cover}}` and `{{game.cover}}` are image URLs: put them in an Image element's source URL (use **Insert placeholder…** under the field). `{{music.percent}}` (0–100) drives a Progress element, and `music.position`, `music.remaining` and `music.percent` tick every second between player polls. Clock, timer, goal, latest-event and IGDB game placeholders are listed in the picker.

### Date and time formatting

Add `|format` to a date-like placeholder: `{{now|dddd, MMMM Do [at] h:mm A}}` → *Friday, October 2nd at 1:34 PM*. Works on `now`, `time`, `date`, `game.release_date` and `timer.<id>.target` (date countdowns). Tokens: `YYYY` `YY` year · `MMMM` `MMM` `MM` `M` month · `dddd` `ddd` weekday · `Do` `DD` `D` day · `HH` `H` `hh` `h` hour · `mm` `m` · `ss` `s` · `A` `a` AM/PM · `[text]` literal. The placeholder picker has a format box that appends the format for you.

**Timer durations** can be formatted too. Presets: `{{timer.<id>|short}}` → *4d 3h 22m 2s* (leading zero units are dropped), `|long` → *4 days, 3 hours, 22 minutes, 2 seconds*, `|clock` → *4d 3:22:02*. Or build your own: `d` `h` `m` `s` (days, hours, minutes, seconds; double the letter to zero-pad) and `th` `tm` `ts` (total hours/minutes/seconds), with literal text in brackets, e.g. `{{timer.<id>|d[d] h:mm:ss}}`. `{{timer.<id>.ms}}` is the raw milliseconds.

### QR code element

The **QR code** element turns a link or text into a scannable code (rendered by the server at `GET /api/qr?text=…`, as SVG). The link accepts placeholders, and you can choose the code color, background (or transparent), quiet zone and error correction. Keep strong contrast so phones can scan it.

### Game list element

The **Game list** element shows games from the Game Plan (`/game-plan-editor.html`). Choose Scheduled, Backlog, Played, any custom list, or everything; optionally filter by period; and pick a cover grid, cover strip, text list or **Columns** (a kanban-style layout with one column per period, or per list when showing everything). **Cover size** scales covers (text list and columns can grow up to 400%; grid and strip covers fill their cell, so they can only shrink — use fewer columns to enlarge them). **Cover fit** can crop, letterbox or keep natural proportions, and **Shrink everything to fit** scales the list down so it is never clipped. Heading and title sizes can be set in pixels, and long titles can wrap instead of being cut off. The game matching your current Twitch category gets a *Now playing* badge.

Shapes support rectangle, circle, pill, and line variants. Text supports a curated font-family picker, size, weight, color, horizontal alignment, vertical alignment, line height, letter spacing, background, border, and opacity. Multiple elements can be selected with Ctrl/Cmd or Shift and aligned or moved as a group.

Random Text elements support random or entered-order display, configurable refresh intervals, typewriter animation, and marquee animation.

The editor is a three-pane workspace: editor settings and layers on the left, the canvas stage in the middle, and context-sensitive properties on the right.

- **Canvas:** scroll to pan, Ctrl/⌘+scroll to zoom, Space-drag or middle-drag to pan, and **Fit** to show the whole canvas. Fit is applied automatically until you pan or zoom manually.
- **Direct manipulation:** drag to move, use the eight resize handles (Shift keeps aspect ratio), drag on empty space to box-select, and Shift-click to multi-select. Snapping guides can be bypassed by holding Alt.
- **Layers:** drag to reorder (this sets stacking order), double-click to rename, and use the lock and eye toggles. Names and locked state are saved with the overlay.
- **Shortcuts:** Ctrl/⌘+S save, Z/Y undo/redo, C/V/D copy/paste/duplicate, A select all, `[` / `]` change stacking, Delete, arrow keys to nudge, and Esc to deselect. Press `?` in the editor for the full list.
- **Live data:** the editor previews `{{placeholders}}` with current values; toggle **Live data** to see raw placeholders instead.
- **Assets:** upload from the Image/Video fields or drop or paste (Ctrl/⌘+V) images and videos onto the canvas, or pick an existing upload with **Library…** in the Content section. The global **Asset Library** (`/assets.html`, Manage > Assets) lists every upload, including timer sounds, with sizeable thumbnails, grid/list views, search, type and used/unused filters, sorting, audio/video preview, rename, multi-select delete, and drag-and-drop upload. Removing an element from an overlay never deletes its file. Renaming rewrites every reference in your overlays and timers and pushes the update live. The editor's **Library…** dialog has an **Upload new…** button too.
- **Uploaded fonts:** upload a `.ttf`, `.otf`, `.woff` or `.woff2` file (from Typography > Upload font, or the Asset Library). Fonts are loaded with `@font-face` in both the editor and the runtime, so they work in Safari (which hides user-installed fonts from web pages) and in OBS on any machine. They appear under **Uploaded fonts** in the font picker, and the font name comes from the file name.
- **Duplicate:** the Custom Overlays page has a Duplicate button that copies an overlay to `<id>-copy`, plus search, sort, and live previews.
- **Asset API:** `GET /api/custom-overlays/assets`, `POST /api/custom-overlays/assets/:name/rename` with `{ "name": "New name" }`, and `DELETE /api/custom-overlays/assets/:name` (returns 409 for in-use assets unless `?force=1`).
- **Fonts:** the font picker includes common system fonts plus selected Google Fonts, including Silkscreen; Google Fonts are loaded when used by the editor or runtime. Random Text typewriter mode includes a blinking cursor modeled after the existing StreamEndRandom screen.
- **Revision history:** every save keeps the version it replaced (the last 30 per overlay, in `data/custom-overlay-history/`, included in backups). **History** in the top bar lists them; **Restore** loads one into the editor as an unsaved change, so you can review or undo it before saving it as a new revision. `GET /api/custom-overlays/:id/history` and `/history/:revision` expose them.
- **Unsaved changes** are flagged in the top bar, and the browser warns before you leave.

The editor and runtime share `overlay-shared.js` (variables, Markdown rendering, and font loading) so previews match what OBS renders.

## API

- `GET /api/custom-overlays` — list definitions
- `POST /api/custom-overlays` — create a definition
- `GET /api/custom-overlays/:id` — read a definition
- `PUT /api/custom-overlays/:id` — update and broadcast a definition
- `DELETE /api/custom-overlays/:id` — delete a definition
- `POST /api/custom-overlays/assets` — upload an image/video asset using the file bytes as the request body, with `Content-Type` and `X-Asset-Name` headers

The WebSocket update message has this shape:

```json
{
  "type": "custom-overlay-update",
  "data": {
    "id": "be-right-back",
    "overlay": {}
  }
}
```
