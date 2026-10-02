# Custom Overlays

Custom overlays are JSON-backed scenes that can be displayed in OBS or any browser source:

```text
http://localhost:3000/custom-overlay.html?id=be-right-back
```

Open `/custom-overlays.html` to create and manage overlays. The editor currently supports text, randomized text pools, Markdown, images, videos, webpage embeds, and shapes. Elements can be positioned on a zoomable 1920×1080-style canvas, styled, reordered, aligned, snapped to canvas/element guides, and saved. The canvas can be panned with the middle mouse button, Shift-drag, or Alt-drag.

Saving an overlay increments its revision, writes the definition to `data/custom-overlays.json`, and broadcasts the updated definition over StreamPulse's WebSocket. Open overlay instances update without an OBS browser-source refresh.

Markdown is sanitized before rendering. It supports common formatting such as headings, emphasis, lists, links, images, and block quotes. Webpage embeds use a sandboxed iframe and may still be refused by sites that disallow framing. Overlay definitions are included in StreamPulse backups.

Images and videos can be uploaded from the selected element's properties. Uploads are stored in `data/custom-overlay-assets/`, served from `/custom-overlay-assets/<filename>`, and included in backups. Individual assets are limited to 100 MB.

Text and Markdown content support live variables using double braces. Values refresh every five seconds in the runtime:

```text
{{viewers.current}}  {{viewers.peak}}  {{viewers.average}}
{{chatters}}  {{messages}}  {{followers}}  {{subscribers}}  {{hashtags}}
{{gift_subs}}  {{bits}}  {{donations}}
{{music.title}}  {{music.artist}}  {{stream.title}}  {{overlay.name}}
```

Shapes support rectangle, circle, pill, and line variants. Text supports font family, size, weight, color, horizontal alignment, vertical alignment, line height, letter spacing, background, border, and opacity.

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
