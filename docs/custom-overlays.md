# Custom Overlays

Custom overlays are JSON-backed scenes that can be displayed in OBS or any browser source:

```text
http://localhost:3000/custom-overlay.html?id=be-right-back
```

Open `/custom-overlays.html` to create and manage overlays. The editor currently supports text, Markdown, images, videos, and shapes. Elements can be positioned on a 1920×1080-style canvas, styled, reordered, and saved.

Saving an overlay increments its revision, writes the definition to `data/custom-overlays.json`, and broadcasts the updated definition over StreamPulse's WebSocket. Open overlay instances update without an OBS browser-source refresh.

Markdown is sanitized before rendering. It supports common formatting such as headings, emphasis, lists, links, images, and block quotes. Overlay definitions are included in StreamPulse backups.

## API

- `GET /api/custom-overlays` — list definitions
- `POST /api/custom-overlays` — create a definition
- `GET /api/custom-overlays/:id` — read a definition
- `PUT /api/custom-overlays/:id` — update and broadcast a definition
- `DELETE /api/custom-overlays/:id` — delete a definition

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
