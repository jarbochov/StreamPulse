# Custom Overlay Studio

StreamPulse features a visual, GPU-accelerated canvas editor for creating broadcast overlays and scenes for OBS Studio, vMix, and browser sources:

```text
http://localhost:3000/overlays/custom-overlay.html?id=my-overlay
```

Manage and preview all saved scenes from the [Custom Overlays Directory](http://localhost:3000/custom-overlays.html), complete with live canvas cards, duplicate actions, revision histories, and direct OBS browser-source URL generators.

![StreamPulse Custom Overlay Studio](images/custom-overlay-studio.png?v=2)

---

## Workspace Architecture

The studio provides a modern three-pane workspace designed for high-density broadcasting control:

1. **Left Rail (Layers & Settings)**: Reorder layers with drag-and-drop to adjust stacking order, toggle visibility (eye icon), lock layers against accidental drag movements, switch between multi-page scenes, and configure global canvas properties (Full HD 1920×1080, 4K, vertical portrait 1080×1920, or custom aspect ratios).
2. **Center Stage (Interactive Canvas)**: Direct manipulation viewport with 8 transform handles, aspect-ratio constraint (Shift-drag), alignment and snapping guides (bypass with Alt), marquee box multi-selection, pan (Middle-click, Space-drag, or Shift-drag), and zoom controls.
3. **Right Rail (Context-Sensitive Inspector)**: Dynamic properties panel displaying layout coordinates, dimensional sizing, typography, fill gradients, animated sweep borders, GPU media filters, WebGL display shaders, and stream widget configurations for the currently selected layer(s).

### Preview Resource Use

The editor mounts only the selected page's layers and common (`*`) layers. Other pages remain in the layer list but do not keep background video/audio, slideshow timers, or effect renderers running. Common layers remain mounted across page changes, and the **Effects** toggle still controls preview effect animation.

Returning to a page restores HTML5 video playback intent/time and slideshow position. Embedded players reload, and slideshow transitions and motion-effect phases restart. These preview lifecycle rules do not change saved overlay definitions or production overlay URLs.

### Keyboard Shortcuts

| Shortcut | Action | Description |
| --- | --- | --- |
| `Ctrl` / `Cmd` + `S` | **Save & Push Live** | Saves scene definition and broadcasts updates over WebSocket |
| `Ctrl` / `Cmd` + `Z` | **Undo** | Reverts the last canvas modification |
| `Ctrl` / `Cmd` + `Shift` + `Z` / `Y` | **Redo** | Re-applies reverted action |
| `Ctrl` / `Cmd` + `C` | **Copy** | Copies selected element(s) to internal clipboard |
| `Ctrl` / `Cmd` + `V` | **Paste** | Pastes elements at offset, or auto-uploads dragged media files |
| `Ctrl` / `Cmd` + `D` | **Duplicate** | Clones selected element(s) directly on canvas |
| `Ctrl` / `Cmd` + `G` | **Group Elements** | Groups selected layers for synchronized transforms |
| `[` / `]` | **Layer Stacking** | Moves selected layer down or up in the z-stack |
| `Delete` / `Backspace` | **Remove** | Deletes selected layer(s) from the scene |
| `Arrow Keys` | **Nudge** | Moves selected layer by 1px (or 10px with `Shift`) |
| `Esc` | **Deselect** | Clears current selection |
| `?` | **Shortcuts Dialog** | Displays interactive keyboard cheat sheet |

---

## Automatic pages and trigger priority

Pages in the normal rotation pause while a triggered page is on screen. All custom overlays use this order, highest first:

| Priority | Trigger |
| --- | --- |
| 1 | Alerts |
| 2 | Featured messages |
| 3 | Polls, including results |
| 4 | Chat commands / bot triggers |
| 5 | Normal page rotation |

An alert can interrupt a poll. When the alert finishes (or you skip/clear it), the overlay returns to that poll **if voting or its results window is still valid**. Featured messages also take priority over polls. Commands cannot interrupt a poll.

Each overlay keeps only the latest pending event of each type, not a backlog. Display deadlines keep running while another page is shown: an event with a ten-second window that waits eight seconds has only two seconds left. Expired events are discarded, not replayed late. A newer event of the same type replaces the previous one and renews its window; it does not rebuild the page if the target page is unchanged.

**Only polls resume after interruption.** Interrupted featured messages and command pages are dropped rather than restarting their media. An interrupted poll's countdown and results deadline continue; a new poll replaces the old one. A separate **Poll end** page replaces the active-poll entry at the same priority, so it does not cut off an alert or featured message.

Once no eligible trigger remains, the previous normal page returns and automatic rotation starts its page duration again. Manual page navigation clears active and pending takeovers for that overlay. Deleting/disabling a trigger page removes its pending event; turning off pages clears all takeovers. Separate custom overlays operate independently. Multiple matching pages still use the first enabled match.

Alerts retain their own Alert Queue; page priority does not create a second alert queue. Priority applies only when a matching triggered page exists in that overlay. A shared alert box or separate alert overlay can display without replacing a poll page.

> [!TIP]
> **Testing Triggered Pages in the Editor**: When configuring an alert, featured message, poll, or chat command page in the Custom Overlay Editor, click **Test trigger** in the page card to immediately preview the takeover on stream and verify transition timings.

## Element Types Catalog

StreamPulse includes 14 distinct element types organized across 4 functional categories. Access them anytime by clicking **+ Add element** in the stage toolbar:

![Custom Overlay Element Types](images/overlay-elements-menu.png?v=2)

### Text & Copy

#### Text (`text`)
Direct single or multi-line text elements supporting static copy and live stream placeholder tokens.
- **Typography**: Select from popular system fonts, curated Google Fonts (such as *Silkscreen*, *Poppins*, *Inter*, *Montserrat*), or uploaded custom web fonts (`.ttf`, `.otf`, `.woff`, `.woff2`).
- **Styling**: Configure font size, weight (100–900), horizontal and vertical alignment, letter spacing, line height, text color, and gradient fills.
- **Glow & Shadow**: Outer text shadows with configurable blur, offset, and color spread for high legibility over busy gameplay.
- **Text Stroke**: Crisp vector outlines with custom width and stroke colors.
- **Live Placeholders**: Embed live dynamic variables like `{{stream.title}}`, `{{viewers.current}}`, or `{{latest.follower}}` directly in the content string.

![Text & Typography Inspector](images/overlay-text-inspector.png?v=2)

#### Random Text (`random-text`)
Rotating phrase pools for stream rules, broadcaster quotes, tip reminders, or trivia.
- **Phrase Pool**: Supply a multi-line list of phrases or tokens.
- **Selection Modes**: Pick phrases randomly (preventing immediate consecutive repeats) or cycle through the pool in sequential order.
- **Interval Control**: Configurable rotation duration (in seconds).
- **Animation Modes**: Instant transitions, smooth fade, terminal-style **Typewriter** effect (complete with blinking cursor), or continuous horizontal **Marquee** ticker.

#### Markdown (`markdown`)
Rich formatted content compiled using sanitized Markdown.
- **Syntax Support**: Headers (`#` to `###`), bold (`**text**`), italics (`*text*`), unordered and ordered lists, links, inline code, and block quotes.
- **Padding & Container Spacing**: Configure internal padding (`style.padding`, 0–200px) directly in the inspector to inset text cleanly from the bounding box, with optional backgrounds, borders, and multi-column formatting.
- **Live Data Tokens**: Dynamic stream tokens can be placed inside Markdown syntax (e.g. `### Top Chatter: **{{chatter.top}}**`).
- **File Syncing**: Optionally link a local text or markdown file (`.md` / `.txt`). StreamPulse reads the file in place without manual re-uploads, automatically updating the overlay when the file is modified on disk.

---

### Media & Visuals

#### Image (`image`)
High-resolution static artwork, logos, channel badges, and animated GIFs.
- **Formats**: PNG, JPG, JPEG, SVG, WebP, and animated GIF.
- **Source Ingestion**: Choose files from the central Asset Library, enter external HTTP/HTTPS image URLs, link local computer paths, or dynamically resolve stream tokens (e.g. `{{game.cover}}` or `{{music.cover}}`).
- **Cover Fit**: Select between `cover` (fills the element bounding box, cropping overflow), `contain` (scales proportionally without clipping), or `natural` (unconstrained 1:1 image dimensions).
- **Styling**: Corner rounding (`borderRadius`), borders, drop shadows, and opacity.

#### Video (`video`)
Cinematic video loops, stingers, background visuals, and YouTube embeds.
- **Playback Capabilities**:
  - **HTML5 Videos**: Direct playback of `.mp4`, `.webm`, and `.ogg` files.
  - **YouTube Embeds**: Full support for YouTube watch and embed links (`https://youtube.com/watch?v=...`), automatically converted into secure iframe players with `playsinline=1` and `mute=1` to guarantee WebKit/Safari autoplay compliance.
- **Unified Controls**:
  - `video.autoplay`: Begins playback automatically upon scene load.
  - `video.loop`: Seamlessly replays video media upon reaching the end.
  - `video.sound`: Master audio toggle (production overlays remain 100% clean of on-screen floating audio buttons).
  - `video.volume`: Fine-grained audio scaling (0–100%).
- **Hardware & Controller Discovery**: Controllable via the `/api/videos` REST endpoint and Bitfocus Companion module actions (`play`, `pause`, `toggle`, `restart`, `mute`, `unmute`).

#### Slideshow (`slideshow`)
Automated image carousel cycling through media assets.
- **Tag Filtering**: Automatically pull all images matching specific Asset Library tags (e.g. `sponsor`, `fanart`, `game-screenshots`).
- **Slide Duration**: Configurable delay per slide before advancing.
- **Transitions**: Smooth cross-fade or lateral slide animations.

#### Pattern Tile (`pattern`)
Seamlessly repeating geometric, textured, or procedural tile backgrounds and motion graphics.
- **Graphic Styles**: Choose from 20 shared procedural patterns (Grid, Geometry, Orbits, Hexagons, Diamonds, Isometric, Mesh, Sunburst, Triangles, Chevrons, Checker, Waves, Rings, Scales, Topography, Starfield, Sparkles, Dots, Confetti, Circuit), uploaded tile images, or Font Awesome icons and emoji.
- **Procedural Customization**: Tune stroke width, line/accent colors, secondary tones, base fills, and scale (10–500%).
- **Tile Layout**: Brick staggered, alternating, checkerboard, or kaleidoscope radial mirror wedges (4 to 16 wedges).
- **Motion Scrolling & Weave**: Continuous background panning with configurable scroll angle (0–360°), counter-scrolling rows/columns, spin, sway, pulse, and weave stepping.
- **Transforms**: Per-tile rotation angles, alternating tilt, scale variation, and blend modes (`normal`, `screen`, `multiply`, `overlay`).

#### Game Artwork from IGDB
Directly browse and import official covers, concept artwork, logos, and high-resolution screenshots from IGDB into custom overlay image layers via **Add element &rarr; Game Artwork (IGDB)** or the inspector's **IGDB...** button.

---

### Geometric Shapes & Camera Cutouts

#### Shape (`shape`)
Structural primitives for scene framing, HUD panels, and lower thirds.
- **Geometries**: Rectangle, circle, rounded pill, and horizontal/vertical divider lines.
- **Fills**: Flat color fills or multi-stop linear and radial gradients with adjustable angles.
- **Animated Sweep Borders**: Conic neon glow traveling around the shape perimeter with configurable rotation speed, glow spread, and accent colors.
- **Drop & Inner Shadows**: Layered shadows providing physical depth beneath text and widgets.

#### Icon (`icon`)
Crisp vector iconography from FontAwesome and StreamPulse built-in SVG collections.
- **Customization**: Vector stroke width, fill color, duotone accenting, and drop shadow.
- **Placement**: Ideal for pairing with live statistics (viewer counts, chat messages, timer clocks).

#### Cutout / Punchthrough (`cutout`)
Cross-browser transparent apertures designed for webcam frames, capture cards, and game window cutouts.

![Camera Cutout & Punchthrough Frames](images/overlay-cutout-webcam.png?v=2)

- **Flicker-Free Masking**: Uses self-contained SVG image data URIs in CSS mask properties (`-webkit-mask-image`, `mask-image`) on underlayer containers, guaranteeing flicker-free rendering across Chromium (OBS) and WebKit (Safari).
- **Aperture Shapes**: Rectangular, rounded rectangular, circular, or elliptical cutouts.
- **Feathering**: Soft edge blur for smooth blending into backgrounds.
- **Radial Glow & Borders**: Frame webcam feeds with neon borders, conic animations, and inner shadow depth bevels.

---

### Broadcast & Interactive Widgets

#### Alert Box (`alert`)
Integrated stream alert listener connecting directly to StreamPulse's rules engine.
- **Triggers**: Follows, new subscribers, resubs, subscriber milestones, gifted sub batches, bits cheers, donations, raids, channel point redeems, and completed timers/goals.
- **Variant Cycling**: Cycle through multiple visual and audio variants (random, weighted, or sequential).
- **Layouts**: Stacked (image above text), horizontal banner (image beside text), or text-only.
- **Audio & Animations**: Configurable alert sounds, volume levels, entrance/exit animations, and duration hold times.
- **Routing**: Filter alert boxes by event type so you can display raids on a dedicated scene while subs appear elsewhere.

#### Game Plan (`game-list`)
Live broadcasting schedule and backlog cards driven by StreamPulse's [Game Plan Studio](http://localhost:3000/game-plan-editor.html).

![Game Plan Broadcast Card Layouts](images/overlay-game-plan-cards.png?v=2)

- **Layout Modes**:
  - `columns`: Kanban-style multi-column layout with one column per period or custom collection.
  - `grid`: Responsive tile grid of game box art.
  - `strip`: Horizontal scrolling or static ticker strip.
  - `list`: Compact text list with micro cover thumbnails.
- **Metadata Integration**: Live IGDB cover artwork, game titles, genres, release years, and developer credits.
- **Status Pills**: Highlights games with badges: `Now Playing` (automatically synchronized with your live Twitch category), `Tonight`, and `Scheduled`.
- **Scaling Controls**: Responsive `coverFit` (`cover`, `contain`, `natural`), cover scaling multiplier, and optional shrink-to-fit scaling.

#### Progress Bar / Ring (`progress`)
Dynamic visual meters for goals, music track playback, and countdown timers.
- **Visual Display**: Linear horizontal progress bar or circular progress ring.
- **Drive Modes**: Connect to any numerical percentage token:
  - Stream Goals: `{{goal.<id>.percent}}`
  - Music Track Position: `{{music.percent}}`
  - Countdown Timers: `{{timer.<id>.percent}}`
- **Styling**: Customizable track color, fill color (or gradient), border radius, line thickness, and centered percentage labels.

#### Twitch Poll (`poll`)
Display your native Twitch poll in a compact, horizontal panel. Choose **Add Element > Stream Widgets > Poll**, or insert the **Compact poll** preset from the Presets panel.

- **400 × 150 starting size**: The question sits above slim horizontal result bars. Two to five choices fill the available space automatically; extra rows disappear when the next poll has fewer choices.
- **Live voting**: Show vote counts, percentages, total votes, and a remaining-time countdown based on Twitch's start time and duration. The display says **Closing** at zero until Twitch confirms the result. Twitch API refreshes are not instant.
- **Results**: Highlight every tied winner; zero votes never produce a winner. Results stay visible for 15 seconds by default. Set **Show results (seconds)** to another duration, or to `0` to hide completed polls.
- **Your channel's style**: Adjust the font, panel background, border, and bar colors. Resizing scales the display, with text sizing limited to keep the rows inside the panel. Long questions and choice names are shortened visually rather than overflowing.
- **Safe previews**: Choose live data, fictional sample data, or automatic fallback samples. Preview two to five choices, voting, completed, tied, or zero-vote states without creating a Twitch poll. Samples appear only in the editor and preview URLs; production OBS sources hide the entire panel when no current poll or unexpired result is available.

**Create the poll and let viewers vote in Twitch.** This is a display, not an embedded Twitch voting interface. Chat Bot voting is not available yet.

Twitch must be connected with the `channel:read:polls` permission and your channel must support native Twitch polls. Reconnect Twitch if your existing connection lacks that permission.

For automatic showing, set the page to **While a Twitch poll is active** and leave **Show for** at `0`. The page stays through voting and the Poll element's **Show results** duration, then returns to the previous page and resumes any automatic rotation. If several visible Poll elements are on the page (including shared elements), the longest results duration wins. Hidden elements and Poll elements on other pages do not extend it.

The active page waits up to 30 seconds past the expected voting end for Twitch to confirm results, avoiding a page change between voting and results. The results deadline uses Twitch's actual end time, so delayed updates do not add extra display time. Set every visible Poll element's results duration to `0` for active-only behavior. A nonzero page **Show for** preserves fixed-duration behavior; a separate matching **Poll end** trigger page replaces the active-poll page at poll priority. Poll completion updates the deadline even while an alert or featured message is interrupting it. Manual page changes cancel pending automatic returns.

#### QR Code (`qr`)
Dynamic vector SVG QR code generator backed by the `/api/qr` endpoint.
- **Live URLs & Tokens**: Direct viewers to tips, Discord, socials, or Twitch profiles using live tokens (e.g. `https://twitch.tv/{{streamer}}`).
- **Styling**: Configurable foreground color, background fill (supports fully transparent `bg=transparent`), quiet zone margin, and error correction levels (`L`, `M`, `Q`, `H`).

#### Webpage Embed (`embed`)
Sandboxed iframe embed for displaying external web applications, chats, or live web dashboards.
- **Security & Sandboxing**: Untrusted web pages are strictly sandboxed with `referrerPolicy = "no-referrer"`.
- **Custom Zoom & Viewport**: Apply CSS scaling multipliers to fit desktop web interfaces into compact broadcast boxes.

---

## WebGL Retro Display Shaders & GPU Media Filters

Apply real-time GPU-accelerated post-processing effects to any image, video, slideshow, or visual layer:

![WebGL Retro Display Shaders & CRT Effects](images/overlay-retro-shaders.png?v=2)

### CRT & Display Simulation
- **Scanlines**: Separate intensity and scale controls adjust raster-line darkness and pitch. Interlace alternates line brightness over time; it is not vertical scrolling.
- **Aperture Grille & Shadow Mask**: Select RGB aperture stripes, slot masks, or dot triads, with separate mask scale and intensity controls.
- **LCD Matrix**: Grid spacing adjusts cell pitch (zero disables the grid). Palette selection is independent of spacing and ghosting.
- **Screen Curvature**: Physical barrel distortion warping the layer corners into a curved glass display.
- **TV Static & Snow**: Procedural analog static noise with customizable intensity and monochrome/color modes.
- **Phosphor Bloom**: Soft glowing bleed around bright highlights.

### Signal Degradation
- **VHS Tape Tracking**: Magnetic tape jitter, horizontal noise bars, and color smearing.
- **NTSC Chroma Bleed**: Composite video color phase shifting and fringing.
- **LCD Ghosting**: Liquid-crystal display response lag and trail smear.
- **Chromatic Aberration**: Optical lens RGB color splitting.

Retro percentages and mask choices use the same saved settings in the editor and production overlay. Existing saved overlays need no conversion. LCD ghosting adds directional edge smear, with temporal persistence for native video frames; a still image has no moving-frame trail.

### Halftone & Dithering Algorithms
- **Ordered Dithering**: Bayer matrix patterns (2×2, 4×4, 8×8) and blue noise.
- **Error Diffusion**: Floyd-Steinberg, Atkinson (classic Macintosh 1-bit style), Burkes, and Sierra dithering.
- **Print Halftoning**: Manga-style dot screens, horizontal/vertical line screens, and crosshatching.
- **Pixelation**: Retro 8-bit / 16-bit mosaic downsampling.

---

## Live Data Placeholders & Formatting

Insert dynamic values anywhere in text, Markdown, image URLs, or QR codes using `{{token}}` syntax.

| Category | Available Placeholders |
| --- | --- |
| **Viewers** | `{{viewers.current}}`, `{{viewers.peak}}`, `{{viewers.average}}` |
| **Chat & Activity** | `{{chatters}}`, `{{messages}}`, `{{followers}}`, `{{followers.session}}`, `{{subscribers}}`, `{{subscribers.session}}`, `{{chatter.top}}`, `{{chatter.top.count}}`, `{{chatter.last}}`, `{{emotes}}`, `{{raids}}`, `{{highlights}}`, `{{clips.pending}}` |
| **Engagement** | `{{gift_subs}}`, `{{gift_subs.total}}`, `{{bits}}`, `{{bits.total}}`, `{{donations}}`, `{{donations.total}}` |
| **Hashtags** | `{{hashtags.top}}`, `{{hashtags.session_top}}`, `{{hashtags.top.count}}`, `{{hashtags.total}}` |
| **Latest Events** | `{{latest.follower}}`, `{{latest.subscriber}}`, `{{latest.subscriber.tier}}`, `{{latest.gifter}}`, `{{latest.cheer}}`, `{{latest.cheer.amount}}`, `{{latest.donation}}`, `{{latest.raider}}` |
| **Stream Info** | `{{stream.title}}`, `{{stream.category}}`, `{{stream.live}}`, `{{uptime}}`, `{{overlay.name}}`, `{{category.session_time}}` |
| **Clock & Calendar** | `{{now}}`, `{{time}}`, `{{time.24}}`, `{{time.seconds}}`, `{{date}}`, `{{date.long}}`, `{{weekday}}`, `{{month}}`, `{{year}}` |
| **Timers** | `{{timer.<id>}}`, `{{timer.<id>.label}}`, `{{timer.<id>.state}}`, `{{timer.<id>.target}}`, `{{timer.<id>.percent}}` |
| **Goals** | `{{goal.<id>.title}}`, `{{goal.<id>.current}}`, `{{goal.<id>.target}}`, `{{goal.<id>.percent}}`, `{{goal.<id>.remaining}}` |
| **Game Plan (IGDB)** | `{{game.name}}`, `{{game.url}}`, `{{game.cover}}`, `{{game.release_year}}`, `{{game.genres}}`, `{{game.developer}}`, `{{game.rating}}` |
| **Plan Lists** | `{{plan.now}}`, `{{plan.scheduled}}`, `{{plan.backlog}}`, `{{plan.list.<list-id>}}` |
| **Music Now-Playing** | `{{music.title}}`, `{{music.artist}}`, `{{music.album}}`, `{{music.cover}}`, `{{music.position}}`, `{{music.duration}}`, `{{music.percent}}` |
| **Weather** | `{{weather.temp}}`, `{{weather.feels_like}}`, `{{weather.condition}}`, `{{weather.icon.url}}`, `{{weather.high}}`, `{{weather.low}}`, `{{weather.city}}` |
| **Community Milestones** | `{{milestone.stream_number}}`, `{{milestone.total_hours}}`, `{{milestone.streak_days}}`, `{{milestone.unique_chatters}}` |

### Date & Time Formatting
Format date tokens by appending `|format`:
- `{{date|dddd, MMMM Do}}` → *Friday, October 2nd*
- `{{time|h:mm A}}` → *2:30 PM*
- `{{timer.subathon.target|MMM D [at] h:mm A}}` → *Nov 12 at 4:00 PM*

### Timer Countdown Formatting
- `{{timer.<id>|short}}` → *4d 3h 22m 2s*
- `{{timer.<id>|clock}}` → *4d 03:22:02*
- `{{timer.<id>|long}}` → *4 days, 3 hours, 22 minutes, 2 seconds*

### List Separators
Format array tokens like `plan.scheduled` or `game.genres`:
- `{{plan.scheduled|lines}}` — One item per line
- `{{plan.scheduled|bullets}}` — Bulleted markdown list
- `{{plan.scheduled|3}}` — First 3 items comma-separated
- `{{plan.scheduled|sep: / }}` — Custom forward-slash delimiter

---

## Asset Library & Font Management

Access the unified [Asset Library](http://localhost:3000/assets.html) (Overlays ▾ → Overlay Assets) to store and manage media files:
- **Shared Storage**: One central repository for images, video loops, audio alert chimes, and custom typography. Files are stored in `data/custom-overlay-assets/` (up to 100 MB per file) and included in ZIP backups.
- **Uploaded Web Fonts**: Upload `.ttf`, `.otf`, `.woff`, or `.woff2` font files. StreamPulse automatically injects `@font-face` rules into both the studio editor and live OBS browser sources, guaranteeing that custom typography renders consistently without requiring local font installation on the host machine.
- **Reference Integrity**: Renaming an asset in the library automatically updates every custom overlay and timer that references it without breaking active broadcast sources.

---

## OBS Studio Integration

To add an overlay to OBS Studio:

1. In OBS Studio, navigate to your desired scene and click **+** under **Sources**.
2. Select **Browser** and name the source (e.g. `Custom Overlay - BRB Screen`).
3. Set the **URL** to:
   ```text
   http://localhost:3000/overlays/custom-overlay.html?id=my-overlay
   ```
4. Set **Width** to `1920` and **Height** to `1080` (or match your canvas resolution).
5. Check **Control audio via OBS** if your overlay contains video or alert audio.
6. Check **Shutdown source when not visible** (recommended for transition efficiency) or leave unchecked if you want background timers to stay active.

---

## Developer API & WebSocket Synchronization

All overlays are backed by atomic JSON storage and synchronised live across active clients over WebSockets:

- `GET /api/custom-overlays` — List all overlay scene definitions
- `POST /api/custom-overlays` — Create a new overlay definition
- `GET /api/custom-overlays/:id` — Fetch a single overlay definition
- `PUT /api/custom-overlays/:id` — Update definition and broadcast live update to OBS
- `DELETE /api/custom-overlays/:id` — Delete an overlay
- `GET /api/custom-overlays/:id/history` — List saved revision snapshots
- `POST /api/custom-overlays/:id/history/:revision/restore` — Restore historical revision
- `GET /api/videos` — Discover all controllable `<video>` and YouTube elements

### Live WebSocket Broadcast
Whenever an overlay is saved, StreamPulse emits a real-time event to all connected browser sources:

```json
{
  "type": "custom-overlay-update",
  "data": {
    "id": "my-overlay",
    "overlay": {
      "name": "Broadcast Studio Master Scene",
      "width": 1920,
      "height": 1080,
      "elements": [ ... ]
    }
  }
}
```

Open overlay instances update instantly without requiring an OBS browser-source refresh cache action.
