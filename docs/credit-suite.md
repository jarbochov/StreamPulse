# Credit Suite

> **Module toggle:** Credit Suite is an opt-in module disabled by default (`credit_suite_enabled: false`). Enable it under **System Config → Modules & Services → Production & Exports**, then open it from **Tools → Production & Exports → Credit Suite**. When disabled it disappears from navigation and Operator Mode, and its API returns `403` (except `GET /api/credit-suite/status`, which reports `enabled: false`).

**Credit Suite** (`/tools/credit-suite.html`) is an independent cinematic credits studio in StreamPulse built for feature-film-style credit sequences, event rollouts, documentary endings, and live OBS broadcast closings. It is completely separate from the automatic live-session Credits Studio and Custom Overlay Editor while sharing StreamPulse's Asset Library, Font Awesome icons, 31 border styles + 17 border animations, animated patterns, and live Variables.

---

## Core Capabilities

- **Hybrid Studio Workflow**: Combine a drag-and-drop **Sequence Outliner** (Credit Blocks + Floating Tracks), an interactive **16:9 / Multi-Aspect Live Stage**, a contextual **Inspector**, and a docked NLE-style **Multi-Track Scrubbable Timeline**.
- **Mixed Choreography**: Any credit block can switch between **Fade / Title Card** (timed hero cards with Enter/Exit transitions) and **Continuous Crawl** (smooth bottom-to-top scroll with soft top/bottom edge-fade masks).
- **Dynamic Auto-Reflow**: Place a video, image, slideshow, or custom visual card on a **Side Showcase** track. When it enters on the left or right half of the frame, the scrolling credits column automatically glides smoothly to the opposite side — and glides right back to center as soon as the side clip finishes.
- **10 Cinema Block Types**:
  - **Featured Card** — Hero / billing lockups
  - **Role & Name Split** — Classic Hollywood two-column paired table (`ROLE` right-aligned | `Name` left-aligned) with drag-and-drop rows and bulk paste
  - **Multi-Column Roster (1–4 Columns)** — Auto-fit name scaling (`scaleX`) so wide names never wrap awkwardly, plus live **Data Source Binding** (StreamPulse Variable Sets, List Variables, CSV/TXT paste, or live Stream Session Contributors with conflict-safe Refresh)
  - **Stacked Section**, **Paragraph / Legal**, **Inline Media** (Image/Video/Icon with full video playback controls: autoplay, loop, mute, volume, start offset, playback rate, and `cover` / `contain` / `contain-blur` / `fill` fit modes), **Logo / Sponsor Strip**, **Inline Split Row**, **8 Ornamental Dividers**, and **Spacers**
- **Per-Element Style Overrides**: Every credit block and floating clip supports granular visual overrides — heading/content fonts, sizes, weights, colors, subtitle/icon colors, case, letter spacing, italic/underline/shadow, max width, opacity, padding, card background color/opacity/radius, and all 31 border styles + 17 border animations (with one-click Reset Overrides).
- **Section Edge Characters & Mascots**: Attach an image, animated GIF/sticker, transparent video, or Font Awesome icon to the edge of any credit section (`Hanging Off Top-Right`, `Hanging Off Top-Left`, `Peeking Left/Right`, `Perched Top`, `Dangling Bottom`) with deterministic idle animations (`Hang & Swing`, `Peek & Bob`, `Playful Bounce`, `Gentle Float`, `Wiggle`, `Walk Across Edge`) that ride locked to the section in both live OBS and FFmpeg exports.
- **11 Floating / Side / Background Visual Element Types & Scrolling Backdrop FX**: `image`, `video`, `slideshow`, `text`, `icon`, `shape`, `pattern` (all 31 procedural Pattern Studio presets with full controls), `badge`, `counter`, `meter`, and `cutout` (SVG punchout mask). Supports direct stage drag/resize, directional scrolling (`Bottom to Top`, `Top to Bottom`, `Left to Right`, `Right to Left`, diagonals, seamless repeating tiles, orbital/floating/pendulum drift, Ken Burns), Enter/Exit transitions, **Block-Sync Anchoring** (so side media automatically shifts if earlier credits grow), and all 31 border styles + 17 border animations.
- **Dual Timing Modes**: Switch seamlessly between **Constant Reading Speed (`px/s`)** and **Exact Target Duration (seconds)** (e.g., match a 2-minute music track to the exact frame).
- **Multi-Aspect Canvases & 6 Starter Themes**: `1080p`, `4K`, `720p`, `9:16 Vertical`, `2.39:1 CinemaScope`, `1:1 Square`, or `Custom` at `24 / 30 / 60 fps`, with 6 one-click cinema themes (*Hollywood Classic*, *Modern Minimal*, *Sci-Fi Neon*, *Broadcast Documentary*, *Gold Prestige*, *Clean Light Studio*).

---

## Live OBS Dynamic Overlay

Add a Browser Source in OBS pointing to:

```text
http://localhost:3000/overlays/credit-suite.html?project=cinematic-feature
```

### Supported URL Query Overrides
| Parameter | Values | Purpose |
| :--- | :--- | :--- |
| `project` | Project ID | Which Credit Suite project to load (defaults to active project) |
| `autoplay` | `1` \| `0` | Start rolling immediately on load |
| `loop` | `0` \| `1` | Loop seamlessly after finishing |
| `end` | `hold` \| `clear` \| `loop` | Behavior at sequence end |
| `bg` | `transparent` \| `solid` \| `chroma` | Override background fill |
| `chroma` | `#00FF00FF` | Chroma key background color when `bg=chroma` |
| `speed` | `0.25`–`4.0` | Playback speed multiplier |

---

## Frame-Accurate Video & Asset Exports

From the **Export** tab in Credit Suite Studio, StreamPulse renders deterministically frame-by-frame via headless Chromium and local FFmpeg (zero dropped frames):

- **MP4 (H.264 `yuv420p`)** — Universal opaque/gradient/pattern/video/chroma background export
- **WebM (VP9 `yuva420p`)** — True alpha transparency for OBS Studio and web
- **ProRes 4444 (`.mov`, `yuva444p10le`)** — Studio-grade true alpha transparency for DaVinci Resolve, Final Cut Pro, and Premiere Pro
- **PNG Frame Sequence (`.zip`)** — Lossless transparent frames
- **Full Tall Credits (`.png`)** & **Individual Section PNGs (`.zip`)** — High-res static plates
- **SRT Subtitles (`.srt`)** & **Plain Text Copy** — Exact timeline-synced captions

---

## Bitfocus Companion & Operator Mode Triggers

All transport triggers support both `GET` and `POST`:

- `GET /api/credit-suite/status` — Poll active project, playing state, timecode, duration, and jump markers
- `GET /api/credit-suite/play?project=ID`
- `GET /api/credit-suite/pause?project=ID`
- `GET /api/credit-suite/toggle?project=ID`
- `GET /api/credit-suite/restart?project=ID`
- `GET /api/credit-suite/stop?project=ID`
- `GET /api/credit-suite/seek?project=ID&t=12.5`
- `GET /api/credit-suite/jump?project=ID&marker=Cast`
- `GET /api/credit-suite/speed?project=ID&rate=1.25`

You can also add the **Credit Suite Transport** card directly to your Operator Mode Live Board (`/operator.html`).
