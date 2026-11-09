# StreamPulse Architecture & Agent Guidelines

This document provides project architecture context, mandatory UI/UX design rules, and coding standards for all AI coding assistant sessions working on the StreamPulse repository. Keep `GEMINI.md` and `AGENTS.md` strictly synchronized.

---

## 1. Core Principles & Engineering Philosophy

### First-Class Modularization (No "Tacked-On" Code)
- Every feature must be an integrated, first-class citizen of the architecture, never tacked on as ad-hoc spaghetti code.
- Maintain strict domain boundaries:
  - Backend business logic belongs in dedicated services under `server/services/<domain>.js` with comprehensive state management (`getState()`, `reset()`, validation, events).
  - API and Companion endpoints belong in dedicated route modules under `server/routes/<domain>.js`.
  - Frontend scripts must be organized into modular ES components under `public/js/<domain>/`.
- **Proactive Refactoring**: If a file or controller grows monolithic or mixes multiple concerns (such as canvas manipulation, inspector forms, state tracking, and networking in a single file), proactively suggest and execute clean modular decomposition (following the pattern established in `public/js/editor/`: `editor-state.js`, `editor-canvas.js`, `editor-inspector.js`, `editor-layers.js`).

### Optimized for Low Overhead & High Efficiency
- StreamPulse runs locally on live broadcasting computers alongside OBS Studio, real-time hardware encoders, and demanding games. System overhead (CPU, GPU, RAM) must be minimal.
- **Zero Redundant Dependencies**: Favor modern Web standards and native Node.js / browser APIs over bloated third-party libraries.
- **Flicker-Free, Zero-Lag Live Previews**: Never perform full iframe reloads on user input. Use direct `postMessage` synchronization and targeted DOM / CSS variable updates for instantaneous 60fps real-time live previewing.
- **Resource Management**:
  - Coalesce visual updates to `requestAnimationFrame`.
  - Always cancel inactive animation frames, disconnect WebSocket listeners, and disconnect `ResizeObserver` / `MutationObserver` instances upon unmount to eliminate memory leaks and runaway background execution.
  - Cache expensive computations and font lookups; debounce non-urgent file persistence.

### Zero Assumptions & Certainty Rule
- Never make assumptions regarding ambiguous requirements, UX behavior, or breaking architectural changes.
- If requirements are unclear, design options diverge, or trade-offs arise, stop and ask the user targeted, clarifying questions before implementing.

### Cross-Project Architectural Consistency
- When developing new features, always look to established patterns in other parts of the codebase first (e.g., Alert Studio, Custom Overlay Editor, Versus/Tournaments, Tier List, Trivia Studio).
- Mirror existing conventions for:
  - Structured storage schemas (`data/*.json`) and backup fixtures.
  - Live preview tabs with responsive sticky floating preview columns and resolution scaler chips.
  - Service lifecycle methods and event emission.
  - Companion HTTP GET/POST triggers and WebSocket event broadcasting.
  - Test suites (`scripts/test-<domain>.cjs`).

---

## 2. UI/UX Design System & Centralized Styling

### Centralized CSS & Design Consistency
- Maintain strict visual harmony across all studios, docks, wizards, and inspectors.
- Do not duplicate massive inline CSS blocks across pages. Centralize styles into `public/css/` and use shared design tokens, CSS custom properties, and standardized utility classes.
- Group inspector controls inside structured sections (`F.section(...)` or styled panels) with clear, muted micro-headings (`font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted)`).

### Strict No-Emoji Policy
- **Never use raw unicode emojis** in UI controls, wizard options, buttons, tabs, headers, status badges, or overlay previews (e.g. avoid 🎮, 📅, 🚀, 🧪, 👤, ⭐, 💎, 🔗).
- Always use **crisp inline SVG icons** (viewBox `0 0 24 24`, 12–16px, `currentColor`) or approved icon font classes (`fa-solid`, `fa-brands`).
- For status indicators, use clean pill badges with low-opacity tinted backgrounds and subtle borders (e.g., `badge-shown`, `badge-test`, `badge-now`).

### Density & Clutter Control
- Keep controls visually calm and spacious. Avoid overwhelming walls of buttons or unorganized option lists.
- When options expand (such as 7+ custom game collections or extensive choices), collapse them gracefully into overflow menus, chips, or searchable multi-select pickers rather than cluttering the primary toolbar.

### Comprehensive Settings & Power-User Controls
- Options are good: empower streamers with granular, comprehensive settings for visual presentation (colors with 8-digit `#RRGGBBAA` opacity, typography font family, font weight, font size scales with custom CSS size inputs, drop shadows, borders, radiuses, transitions, layout modes, and element visibility toggles).
- Supply polished, production-ready defaults so overlays look stunning out-of-the-box without requiring initial setup, while allowing power users to customize every aspect.

### Responsive Design
- Studio interfaces, controllers, and docks must be fully responsive across desktop, tablet, and mobile screens (no horizontal scrollbar leaks, responsive grids, and clean mobile overflow navigation).
- Overlays must be resolution-independent from 720p to 1080p, 1440p, 4K, and 9:16 vertical displays using container queries (`@container`), fluid clamping (`clamp(...)`), and scalable preview viewports.

### State Persistence & Navigation Memory
- Always persist user view preferences (active tab, calendar vs list view, filter states like `hideUnmatched`, active period, preview sample data, canvas backdrop) in `localStorage` or URL query params so page reloads do not reset the streamer's context.

---

## 3. Overlay Architecture & URL Parameterization

### Parameterized, Multi-Context Overlays
- Overlays must support multiple broadcast contexts from a single HTML file by prioritizing URL query parameters over saved server/theme defaults.
- Streamers frequently reuse the same overlay across different OBS scenes (e.g., full broadcast intermission card, lower-third gameplay strip, corner HUD, or vertical 9:16 mobile stream) simply by setting URL parameters:
  - `?layout=full|compact|hud`
  - `?theme=modern|arcade|esports|minimal|broadcast-text`
  - `?style=cards|text`
  - `?scale=1.2`
  - Granular visibility overrides: `?category=0|1`, `?timer=0|1`, `?counter=0|1`, `?votes=0|1`, `?hint=0|1`
  - Header & label overrides: `?qlabel=Round 1`, `?alabel=Reveal`, `?cformat=compact`, `?hsize=1.5rem`
- Explicit parameter passing (`&elem=1` or `&elem=0`) guarantees deterministic preview and production rendering without reliance on mutable server state.

### Cross-Browser Punchouts & Masking
- Punchouts (cutout layers) must work seamlessly across both Chromium and WebKit (Safari).
- Use self-contained SVG image data URIs in CSS mask properties (`-webkit-mask-image`, `mask-image`) on underlayer containers.
- Never call `removeProperty` on mask styles during active drags or transforms. Cache previous mask signatures to avoid redundant string allocations, and coalesce mask rendering to `requestAnimationFrame` (`scheduleEditorCutoutMask`) to eliminate visual flashes and stutter.
- Media filters (blur, brightness, contrast, grayscale, duotone SVGs, tints) must apply uniformly across images, HTML5 videos, slideshows, and iframes/embeds.

### Unified Video & YouTube Playback
- YouTube embeds and standard HTML5 videos must share identical playback capabilities, controls, and schema:
  - Autoplay on load: `video.autoplay` (defaults to `true`, passes `autoplay=1` or `autoplay=0` on YouTube, and sets `media.autoplay` / `media.preload` on HTML5 `<video>`).
  - WebKit/Safari Autoplay Resilience: Always set `frame.allow`, `frame.referrerPolicy`, and `frame.style` *before* assigning `frame.src`. Embed parameters must include `playsinline=1` and `mute=1` to prevent browser autoplay policy blocks.
  - Looping: `video.loop` (passes `loop=1` and `playlist=<id>` for YouTube player repeat, with state-change replay fallback).
  - Sound & Volume: `video.sound` toggle and `video.volume` percentage scaling (0–100), applied via YouTube player API (`setVolume`, `unMute`, `mute`).
  - Production vs Preview Audio UI: The interactive audio unlock prompt ("Click to enable audio") is strictly restricted to preview mode (`preview=true`). Live production overlay URLs must remain 100% clean and free of on-screen floating UI buttons or prompts for broadcast capture.
  - Unified Remote Control: All video commands (`play`, `pause`, `toggle`, `restart`, `stop`, `mute`, `unmute`, `toggle-mute`) must operate uniformly across both HTML5 `<video>` and YouTube `<iframe>` elements via postMessage.
  - Companion & Controller Discovery: The `/api/videos` endpoint must list all controllable `<video>` and YouTube embed elements so Bitfocus Companion and the overlay controller can dynamically control playback.
- YouTube embeds must use `referrerPolicy = "strict-origin-when-cross-origin"` without iframe sandboxing (to prevent YouTube Error 153 domain authorization blocks and player SecurityErrors).
- Untrusted third-party web pages must remain sandboxed with `referrerPolicy = "no-referrer"`.

---

## 4. Ecosystem Integration (Bitfocus Companion & Social Stream)

### Non-Duplication of Companion & Social Stream
- StreamPulse is designed to complement and integrate tightly with Bitfocus Companion and Social Stream Ninja, not duplicate or replace them:
  - Do not build custom macro hotkey systems or stream deck emulators that replicate Companion's core strengths.
  - Do not build standalone multi-platform chat scrapers that replicate Social Stream's ingestion engine.
  - Instead, expose clean HTTP endpoints, WebSocket feeds, and state variables for Companion, and ingest chat and events from Social Stream / Twitch EventSub reliably.

### Keep Bitfocus Companion Module Synchronized
- Whenever adding, changing, or refactoring features, endpoints, or data models, update the Companion integration:
  - All actionable endpoints must support standard REST methods (`POST`, `PUT`, `DELETE`) as well as Companion-friendly `GET` triggers with query parameters (e.g. `/api/trivia/question/start?index=0`, `/api/trivia/question/reveal`, `/api/trivia/reset`).
  - Expose human-readable status summaries for polling endpoints (e.g. `/api/trivia/status`).
  - Maintain dynamic variable names (`$(streampulse:...)`) and documented action definitions in `docs/` and companion modules.

---

## 5. Git & Workflow Rules

- **Always commit and push all changes** (`git commit` and `git push`) automatically after completing and verifying a task.
- **Never create git tags** during commits or pushes.
- Keep commits focused, descriptive, and atomic.
- Verify changes with existing test suites (`npm test`) before pushing.
- **Documentation & GitHub Pages Sync**:
  - Always update the documentation in `docs/` whenever adding, modifying, or refactoring features, studio controllers, overlays, APIs, or configurations.
  - Maintain the live documentation site at `https://jarbochov.github.io/StreamPulse/` up to date on every change.
  - Keep all screenshots in `docs/images/` sanitized with purely fictional dummy data (never use real names or live streamer notes). Run `node scripts/capture-screenshots.mjs` when updating visuals.
- **Changelog**: Unreleased features get one short entry describing what exists (under Added). Only describe changes or fixes (Changed/Fixed) for features already shipped in a release. Keep entries terse while a feature is in development.
