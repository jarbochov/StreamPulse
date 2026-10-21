# StreamPulse Development & UX Guidelines

This document provides project architecture context and mandatory UI/UX design rules for all Antigravity coding assistant sessions working on the StreamPulse repository.

---

## 1. Core UI/UX Design System & Principles

### Strict No-Emoji Policy
- **Never use raw unicode emojis** in UI controls, wizard options, buttons, tabs, headers, status badges, or overlay previews (e.g. avoid 🎮, 📅, 🚀, 🧪, 👤, ⭐, 💎, 🔗).
- Always use **crisp inline SVG icons** (viewBox `0 0 24 24`, 12–16px, `currentColor`) or approved icon font classes (`fa-solid`, `fa-brands`).
- For status indicators, use clean pill badges with low-opacity tinted backgrounds and subtle borders (e.g., `badge-shown`, `badge-test`, `badge-now`).

### Density & Clutter Control
- Keep controls visually calm and spacious. Avoid wall-of-buttons or overwhelming lists of options on a single screen.
- Group related controls inside structured sections (`F.section(...)` in editors) with clear, muted micro-headings (`font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted)`).
- When options expand (such as 7+ custom game collections), collapse them gracefully into overflow menus, chips, or searchable multi-select pickers rather than cluttering the primary toolbar.

### State Persistence & Navigation Memory
- Always persist user view preferences (active tab, calendar vs list view, filter states like `hideUnmatched`, active period) in `localStorage` or URL search params so page reloads do not reset the streamer's context.

### Responsive Media & Cover Scaling
- Every widget and overlay displaying game artwork or alerts must provide responsive scaling controls:
  - `coverScale` (percentage or multiplier)
  - `coverFit` (`cover` [fill/crop], `contain` [letterboxed], `natural` [unconstrained])
  - Aspect ratio handling (`3/4`, `2/3`, `1/1`, `16/9`, etc.)
- Use CSS container queries (`@container`) and clamp scaling (`clamp(...)`) so overlays adapt seamlessly from 720p to 4K resolutions in OBS browser sources.

### Collections & Game Plan Model
- Game Plan items can belong to:
  1. Built-in lists: `tonight`, `scheduled`, `up-next`, `backlog`, `played`.
  2. Custom lists / collections: defined in `plan.lists` (identified by `id` and `name`).
  3. Smart period tokens: `@today`, `@tomorrow`, `@this-week`, `@upcoming`, `@unscheduled`.
- Filtering must distinguish between `scheduled` (which includes tonight's games) and `scheduled-only` (future scheduled games excluding tonight).
- Grouping must support grouping by `collection`, `status`, `period`, or `none`.

---

## 2. Alerts & Events Architecture

- Alerts are driven by `server/services/alerts.js` and displayed via overlays like `public/overlays/alerts.html` or custom overlay alert elements.
- The Alert Queue (`public/tools/alert-queue.html`) monitors live events and alert execution history.
- Always support "Hide unmatched" filtering in queue inspectors to allow streamers to filter out background events (such as unhandled chat messages or ignored channel actions) and focus on triggered alerts.

---

## 3. Custom Overlays, Media & Punchouts Architecture

### Unified Video & YouTube Playback
- YouTube embeds and standard HTML5 videos must share identical playback capabilities, controls, and schema:
  - Autoplay on load: `video.autoplay` (defaults to `true`, passes `autoplay=1` or `autoplay=0` on YouTube, and sets `media.autoplay` / `media.preload` on HTML5 `<video>`).
  - WebKit/Safari Autoplay Resilience: Always set `frame.allow`, `frame.referrerPolicy`, and `frame.style` *before* assigning `frame.src`. Embed parameters must include `playsinline=1` and `mute=1` to prevent browser autoplay policy blocks.
  - Looping: `video.loop` (passes `loop=1` and `playlist=<id>` for YouTube player repeat, with state-change replay fallback).
  - Sound & Volume: `video.sound` toggle and `video.volume` percentage scaling (0–100), applied via YouTube player API (`setVolume`, `unMute`, `mute`).
  - Production vs Preview Audio UI: The interactive audio unlock prompt ("Click to enable audio") is strictly restricted to preview mode (`preview=true`). Live production overlay URLs must remain 100% clean and free of on-screen floating UI buttons or prompts for broadcast capture.
  - Unified Remote Control: All video commands (`play`, `pause`, `toggle`, `restart`, `stop`, `mute`, `unmute`, `toggle-mute`) must operate uniformly across both HTML5 `<video>` and YouTube `<iframe>` elements via postMessage.
  - Companion & Controller Discovery: The `/api/videos` endpoint must list all controllable `<video>` and YouTube embed elements so Bitfocus Companion and the overlay controller can dynamically control playback.
  - Both `video` and `embed` layer types with YouTube URLs must expose these controls in the inspector.

### Embed Security & Referrer Specification
- YouTube embeds must use `referrerPolicy = "strict-origin-when-cross-origin"` without iframe sandboxing (to prevent YouTube Error 153 domain authorization blocks and player SecurityErrors).
- Untrusted third-party web pages must remain sandboxed with `referrerPolicy = "no-referrer"`.

### Cross-Browser Punchouts & Flicker-Free Masking
- Punchouts (cutout layers) must work seamlessly across both Chromium and WebKit (Safari).
- Use self-contained SVG image data URIs in CSS mask properties (`-webkit-mask-image`, `mask-image`) on underlayer containers.
- Never call `removeProperty` on mask styles during active drags or transforms. Cache previous mask signatures to avoid redundant string allocations, and coalesce mask rendering to `requestAnimationFrame` (`scheduleEditorCutoutMask`) to eliminate visual flashes and stutter.
- Media filters (blur, brightness, contrast, grayscale, duotone SVGs, tints) must apply uniformly across images, HTML5 videos, slideshows, and iframes/embeds.

### Editor Modularization Standards
- Large editors must maintain strict separation of concerns:
  - Stylesheets extracted to `public/css/custom-overlay-editor.css`.
  - JavaScript decomposed into focused ES modules under `public/js/editor/`:
    - `editor-state.js`: Core overlay model, selection tracking, preferences, undo history.
    - `editor-canvas.js`: Stage viewport (zoom, pan, fit), grid, safe zones, transform handles, box marquee, cutout masking.
    - `editor-inspector.js`: Form generators, section builders, layer properties.
    - `editor-layers.js`: Layer hierarchy tree, reordering, page management.

---

## 4. Git & Workflow Rules

- **Always commit and push all changes** (`git commit` and `git push`) automatically after completing and verifying a task.
- **Never create git tags** during commits or pushes.
- Keep commits focused, descriptive, and atomic.
- Verify changes with existing test suites (`npm test`) before pushing.
- **Documentation & GitHub Pages Sync**:
  - Always update the documentation in `docs/` whenever adding, modifying, or refactoring features, studio controllers, overlays, APIs, or configurations.
  - Maintain the live documentation site at `https://jarbochov.github.io/StreamPulse/` up to date on every change.
  - Keep all screenshots in `docs/images/` sanitized with purely fictional dummy data (never use real names or live streamer notes). Run `node scripts/capture-screenshots.mjs` when updating visuals.
- **Changelog**: Unreleased features get one short entry describing what exists (under Added). Only describe changes or fixes (Changed/Fixed) for features already shipped in a release. Keep entries terse while a feature is in development.
