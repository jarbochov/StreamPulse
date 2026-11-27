# OBS Studios: Borders, Patterns & Layout

StreamPulse includes three dedicated GPU-accelerated studios built directly around **OBS Studio** (`Tools → OBS Studios`). Together they replace brittle manual shader tweaking, mismatched browser-source frames, and hand-nudged scene transforms with live-synced, reusable presets driven by native OBS Lua scripts and OBS WebSocket v5.

> [!NOTE]
> All three studios connect to OBS through the shared OBS WebSocket v5 setup under **System → Config → Connection & Security → OBS Connection**. You can enable or hide each studio independently under **System → Config → Modules & Services → OBS Studio Integrations**.

---

## 1. OBS Border Studio (`/tools/obs-borders.html`)

**OBS Border Studio** generates a single-pass, Metal- and OpenGL-compatible OBS Lua effect filter (`data/obs-borders/streampulse-borders.lua`) that draws crisp, hardware-accelerated borders around any camera, gameplay capture, or browser source without cropping your video.

- **Module toggle**: Enabled by default (`obs_borders_enabled`).
- **One-time OBS setup**: Load `data/obs-borders/streampulse-borders.lua` in OBS under **Tools → Scripts**, then attach the **StreamPulse Border** filter directly from the studio via OBS WebSocket (or manually on any source). Profile edits hot-reload live via `data/obs-borders/manifest.json`.
- **4-tab Hybrid Inspector**: Organized into **Shape & Fit**, **Border Layers**, **Shadow & FX**, and **Standby Fill**, with Preview Backdrop chips (*Checker*, *Light*, *Dark*), preview clock Pause/Restart, and live Synced status indicators.
- **31 Border Styles & Dual Rings**: Combine an independent **Inner** and **Outer** border ring with 31 procedural styles across Standard (`solid`, `dashed`, `dotted`, `double`), 3D Bevel (`groove`, `ridge`, `inset`, `outset` with 45° mitered bevels), Broadcast & Tech HUD (`neon-tube`, `double-ring`, `corner-brackets`, `tech-hud`, `chamfer`, `notched`, `crosshair`, `viewfinder-ticks`, `circuit-trace`, `segmented-bars`), and Stylized & Decorative (`hazard`, `chevron-track`, `scallop-stamp`, `ornate-filigree`, `pixel-arcade`, `film-sprocket`, `marquee-bulbs`, `art-deco`, `rivet-plate`, `braid-weave`, `zigzag`, `sine-wave`, `sketch-ink`), plus independent per-corner radii.
- **Shared Color Palettes**: Drive solid colors, 2–8 stop linear or perimeter gradients (Smooth or Stepped), and animated color flows from the centralized **Shared Color Palettes Library** (`/api/palettes`), shared across Custom Overlay Studio and OBS Pattern Studio.
- **Icon Borders**: Decorate corners or full perimeters using Font Awesome icons and Asset Library images with drag-and-drop icon ordering, clickable Corner/Edge role pills, Pinned Corners and Scrolling Edges modes, per-asset Monochrome & Contrast toggles, an independent 8-stop icon palette, 7 GPU blend modes (including Punchout), and dedicated Icon Motion.
- **Transform Auto-Align**: True outset canvas expansion grows the border outside your source frame so video edges stay untouched. Enable **OBS Transform Auto-Align** (`Pin Outer Border Edge` or `Pin Inner Content Box`) so changing border thickness, padding, or glow automatically compensates the OBS scene item transform without shifting your layout on screen.
- **4-Mode Drop Shadow & Outer Glow**: Layer an independent **Drop Shadow** (*Soft Drop*, *Hard Offset*, *Layered Elevation*, or *Inner Shadow* with Multiply blend) alongside configurable outer or inner glow.
- **17 GPU Animations**: Apply 60fps single-pass shader animations across Beams & Energy (`rotating`, `dual-beam`, `corner-sparks`, `laser-scan`, `shimmer-glint`, `plasma`, `glitch-split`), Glow & Pulse (`radial`, `pulsing`, `heartbeat`, `neon-flicker`, `strobe-flash`, `sparkle-twinkle`), and Color & Perimeter (`palette-flow`, `gradient`, `rainbow`, `marching`).
- **Standby Fill, Scene Rules & Variable Settings**: Switch any bordered source to a placeholder fill (*Person Silhouette*, *Solid*, *Gradient*, or *TV Static*) when a camera or guest feed goes offline, map per-scene Include/Exclude overrides or import offline OBS Scene Collection JSON, bind colors and sizes to live **Variable Settings** (`{}`), and trigger profile changes or standby toggles from **Bitfocus Companion** (`/api/obs-borders/activate`, `/api/obs-borders/standby`).

---

## 2. OBS Pattern Studio (`/tools/obs-patterns.html`)

**OBS Pattern Studio** powers a native, GPU-rendered OBS Lua video source (`data/obs-patterns/streampulse-patterns.lua` / **StreamPulse Pattern Background**) so animated backgrounds run straight on the OBS graphics pipeline instead of a heavy full-screen browser source.

- **Module toggle**: Enabled by default (`obs_patterns_enabled`).
- **One-time OBS setup**: Load `data/obs-patterns/streampulse-patterns.lua` in OBS under **Tools → Scripts**, then create or assign **StreamPulse Pattern Background** inputs directly into any OBS scene from the studio.
- **4-tab Hybrid Inspector**: Switch cleanly between **Setup & Canvas**, **Pattern / Tile Layout**, **Motion & Color**, and **FX & Filters**, with live WebGL preview, canvas gradients (*Solid*, *Linear*, *Radial*, *Conic*, or *Transparent Cutout*), and preview clock Pause/Restart controls.
- **31 Procedural Patterns & 22 Palettes**: Shares the exact same catalog as Custom Overlay Studio and Promo Creator — 31 geometric, organic, particle, and seasonal patterns paired with 22 curated palettes plus custom multi-stop palettes from the **Shared Color Palettes Library**. Configure fill style (*Translucent Tint*, *Solid Color*, *Wireframe Outlines*), density, spacing, line width, element spin, color layout, and in-place or canvas motion.
- **Pattern Tiles**: Build repeating wallpaper mosaics from 1 to 4 uploaded images or icons with Grid, Brick, Stagger, Alternating, and Checkerboard layouts, 4-Way Mirror and Radial Kaleidoscope symmetry, 10 motion and track modes, PNG stamp rasterization, and mutually exclusive **Master Tint & Hue Shift** vs **Palette Set & Gradients** (*Per-Tile* or *Smooth Gradient* placement with Multiply Tint or Luminance Recolor blending).
- **Single-Pass GPU Filters**: Apply real-time Brightness, Contrast, Saturation, Grayscale, Hue Shift, Blur, Duotone, Tint, and animated Film Grain — or pick from built-in filter presets like *Soft Frosted Backdrop*, *Moody Dim*, *Vibrant Neon Pop*, *Retro Noir + Film Grain*, and *Cyber Duotone*.
- **Variable Settings & Companion Control**: Bind colors and parameters with `{}` Variable Settings tokens, manage per-source or per-scene profile assignments, and switch active pattern profiles live from **Bitfocus Companion** (`/api/obs-patterns/activate`).

---

## 3. OBS Layout & Aspect Studio (`/tools/obs-layout.html`)

**OBS Layout & Aspect Studio** is an opt-in visual scene layout editor and real-time GPU aspect ratio controller for rearranging OBS scenes and smoothly morphing cameras or gameplay sources between aspect ratios during a live broadcast.

> [!NOTE]
> **Opt-In Module**: OBS Layout & Aspect Studio is disabled by default. Enable **OBS Layout & Aspect Studio** under **System → Config → Modules & Services → OBS Studio Integrations** (`obs_layout_enabled: true`), then open **Tools → OBS Studios → OBS Layout & Aspect Studio**.

- **Visual Scene Bounding-Box Editor**: Inspect any connected OBS scene on an interactive canvas with live-synced drag, resize, arrow-key nudging, layer visibility/lock toggles, magnetic edge and center snapping, outer **StreamPulse Border** reach guides, and an optional on-demand scene screenshot backdrop.
- **GPU Aspect Ratio Morphing (`streampulse-aspect.lua`)**: Load `data/obs-layout/streampulse-aspect.lua` in OBS under **Tools → Scripts** to attach the **StreamPulse Aspect** filter upstream of **StreamPulse Border** (so borders always wrap the newly cropped shape cleanly). Morph sources smoothly between `native`, `16:9`, `4:3`, `1:1`, `4:5`, `9:16`, `21:9`, or custom ratios with live **Pan X / Pan Y** framing and **Zoom**. If the Lua filter is not attached, StreamPulse gracefully falls back to native OBS scene-item crop values.
- **9-Point Anchor Pinning & Resize Modes**: Choose which edge or corner stays locked on screen (`top-left`, `top-center`, `top-right`, `middle-left`, `center`, `middle-right`, `bottom-left`, `bottom-center`, `bottom-right`) together with Resize Modes (`Lock Width`, `Lock Height`, `Fit Slot`, `Keep Area`) so changing a webcam from `16:9` to `1:1` or `9:16` stays aligned to your HUD.
- **Multi-Waypoint Motion Paths & Item Transitions**: Animate scene changes using direct, curved, elbow, or custom multi-waypoint motion paths with configurable duration, delay, easing, and transition styles (`move`, `fade`, `move-fade`, `cut`), plus per-layer native OBS Show/Hide transitions (`fade_transition`, `slide_transition`, `swipe_transition`, `wipe_transition`, `fade_to_color_transition`, `cut_transition`) and automatic reverse-return trajectories when switching back to a previous layout.
- **Saved Layouts & Companion Triggers**: Save multi-element **Scene Layout Presets** per OBS scene and trigger smooth layout morphs (`/api/obs-layout/layouts/apply?id=<layout-id>`) or single-source aspect ratio changes and cycles (`/api/obs-layout/aspect?source=Webcam&ratio=1:1` or `?source=Webcam&action=cycle`) directly from **Bitfocus Companion**.

---

Explore more [StreamPulse features](features.md) or [Bitfocus Companion controls](companion.md). Already installed? Open **Docs** and **API Reference** from the app navigation for every endpoint and query parameter.
