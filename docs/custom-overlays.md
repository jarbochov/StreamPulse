# Custom Overlays

Custom overlays are JSON-backed scenes that can be displayed in OBS or any browser source:

```text
http://localhost:3000/custom-overlay.html?id=be-right-back
```

Open `/custom-overlays.html` to create and manage overlays. The editor currently supports text, randomized text pools, Markdown, images, videos, webpage embeds, and shapes. Elements can be positioned on a zoomable 1920×1080-style canvas, styled, reordered, aligned, snapped to canvas/element guides, and saved. The canvas can be panned with the middle mouse button, Shift-drag, or Alt-drag.

Saving an overlay increments its revision, writes the definition to `data/custom-overlays.json`, and broadcasts the updated definition over StreamPulse's WebSocket. Open overlay instances update without an OBS browser-source refresh.

Markdown is sanitized before rendering. It supports common formatting such as headings, emphasis, lists, links, images, and block quotes. Webpage embeds use a sandboxed iframe and may still be refused by sites that disallow framing. Overlay definitions are included in StreamPulse backups.

Images and videos can be uploaded from the selected element's properties. Uploads are stored in `data/custom-overlay-assets/`, served from `/custom-overlay-assets/<filename>`, and included in backups. Individual assets are limited to 100 MB.

Text and Markdown content support live variables using double braces. The editor's placeholder picker inserts these values without requiring memorization. Values refresh every five seconds in the runtime:

```text
{{viewers.current}}  {{viewers.peak}}  {{viewers.average}}
{{chatters}}  {{messages}}  {{followers}}  {{subscribers}}  {{hashtags}}
{{gift_subs}}  {{bits}}  {{donations}}
{{hashtags.top}}  {{hashtags.session_top}}  {{hashtags.total}}
{{music.title}}  {{music.artist}}  {{stream.title}}  {{overlay.name}}
```

Shapes support rectangle, circle, pill, and line variants. Text supports a curated font-family picker, size, weight, color, horizontal alignment, vertical alignment, line height, letter spacing, background, border, and opacity. Multiple elements can be selected with Ctrl/Cmd or Shift and aligned or moved as a group.

Random Text elements support random or entered-order display, configurable refresh intervals, typewriter animation, and marquee animation.

The editor is a three-pane workspace: editor settings and layers on the left, the canvas stage in the middle, and context-sensitive properties on the right.

- **Canvas:** scroll to pan, Ctrl/⌘+scroll to zoom, Space-drag or middle-drag to pan, and **Fit** to show the whole canvas. Fit is applied automatically until you pan or zoom manually.
- **Direct manipulation:** drag to move, use the eight resize handles (Shift keeps aspect ratio), drag on empty space to box-select, and Shift-click to multi-select. Snapping guides can be bypassed by holding Alt.
- **Layers:** drag to reorder (this sets stacking order), double-click to rename, and use the lock and eye toggles. Names and locked state are saved with the overlay.
- **Shortcuts:** Ctrl/⌘+S save, Z/Y undo/redo, C/V/D copy/paste/duplicate, A select all, `[` / `]` change stacking, Delete, arrow keys to nudge, and Esc to deselect. Press `?` in the editor for the full list.
- **Live data:** the editor previews `{{placeholders}}` with current values; toggle **Live data** to see raw placeholders instead.
- **Assets:** upload from the Image/Video fields or drop files onto the canvas, or pick an existing upload with **Library…** in the Content section. The **Assets** section of the Custom Overlays page lists every upload with a preview and the overlays that use it, and lets you delete files (or all unused ones). Removing an element from an overlay never deletes its file. The API is `GET /api/custom-overlays/assets` and `DELETE /api/custom-overlays/assets/:name` (returns 409 for in-use assets unless `?force=1`).
- **Fonts:** the font picker includes common system fonts plus selected Google Fonts, including Silkscreen; Google Fonts are loaded when used by the editor or runtime. Random Text typewriter mode includes a blinking cursor modeled after the existing StreamEndRandom screen.
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
