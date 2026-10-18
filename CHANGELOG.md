# Changelog

All notable changes to StreamPulse are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-10-18

### Added
- **Custom Overlay Studio & Visual Engine Overhaul**:
  - **Cutout Punchthrough Layers (Punchouts)**: Introduced cross-browser transparent punchouts for shapes, text, and graphics cutting through underlying media layers, video backgrounds, and color fills. Employs SVG image data URIs in CSS mask properties with zero-flash `requestAnimationFrame` caching across Chromium and WebKit/Safari.
  - **Hardware-Accelerated WebGL Retro Display Effects**: Added CRT scanline rendering, aperture grille sizing, shadow masks, authentic slow-cadence TV static white noise snow, LCD sub-pixel grid math, response-time smear, and temporal persistence blending. Animations automatically pause when the Effects toggle is disabled to conserve system resources.
  - **GPU Media Filters Engine**: Modularized into `overlay-filters.js`. Includes genuine error diffusion and ordered Bayer matrix dithering, GPU halftone, Japanese manga screentone, pixelate, directional and radial fade filters, SVG duotone tints, and Safari-optimized blur filtering.
  - **Pattern Tile (Mosaic) Element**: Multi-tile generator with adjustable row/column offset scrolling, step weave animations, tilt, kaleidoscope effects, motion graphics, blend mode compositing, and Font Awesome icon tiles.
  - **Advanced Animated Borders & Inner Shadows**: Expanded radial border modes, rainbow corner gradients, radial circuit sweeps, inner shadows rendered beneath borders, and inner glow across Chromium and Safari.
  - **Unified HTML5 Video & YouTube Playback Engine**: Standardized playback parameters, volume control, looping, autoplay resilience, and remote control postMessage commands across HTML5 `<video>` and YouTube `<iframe>` embeds. Clean production broadcast feeds with audio unlock prompt strictly restricted to preview mode. Discovered dynamically in the `/api/videos` endpoint.
  - **Modernized Studio Inspector & Canvas**: Interactive scrubbable drag labels on numeric inputs, eyedropper color picker, layer style copy/paste, inline text double-click editing with isolated events, aspect locking, rotation controls, canvas alignment tools, and collapsible section headers.
  - **Modular Studio Architecture**: Monolithic editor separated into dedicated ES modules (`editor-state.js`, `editor-canvas.js`, `editor-inspector.js`, `editor-layers.js`, `overlay-filters.js`, `overlay-retro.js`).
  - **Performance & Caching**: Static thumbnail caching with on-demand live toggles, elimination of render-blocking network waterfalls, WebKit memory leak fixes, and RAF coalesced rendering.

- **Choice Randomizer Studio & Overlay**:
  - **Decoupled Studio & OBS Overlay**: Decoupled studio controller (`randomizer-editor.html`) and dedicated transparent OBS overlay (`randomizer.html`).
  - **Multiple Display Modes**: Interactive spinning wheel, continuous vertical slot machine roller, and flip card reveal modes.
  - **Integrated Audio Effects**: Synthesized Web Audio ticking, acceleration/deceleration sounds, and celebratory fanfare on winner selection.
  - **Choice Weighting & Persistence**: Configurable choice probabilities, weighted wheel arcs, winner elimination modes, and state persistence across page reloads.
  - **Twitch Chatter Integration & Curated Themes**: Auto-populate choices from active stream chatters, custom button sets replicated on overlays, curated themes (Dark, Neon, Retro, Pastel, Clean System), winner announcement headers, and Bitfocus Companion integration (`/api/randomizer/spin`).

- **Community Analytics & Viewer Directory**:
  - **Community Directory**: Overhauled community section with high-level stats cards (total tracked viewers, active regulars, VIPs, moderators, total message volume).
  - **Smart Roster Segments**: Instant quick-view segmentation for Moderators, VIPs, Regulars (active across 3+ streams within the past 90 days), Lapsed (historical regulars seen 30–90 days ago but not recently), and Newcomers.
  - **Viewer Dossiers**: Twitch viewer card popout links, pronouns management, engagement history, custom notes, and deduplicated custom tags.
  - **1-Click CSV Export**: Complete roster export for external reporting and community management.
  - **Growth & Milestone Tracking**: Daily follower history, follower growth charts, scrubbable activity timelines, and stream milestone trackers.

- **Standalone Credits Studio & Modernized System Config**:
  - **Dedicated Credits Studio**: Extracted credits configuration from general settings into a dedicated studio (`public/editors/credits-editor.html`) organized by clean top tabs (`Sections & Order`, `Header & Spacing`, `Custom & Thanks`, `Closing & Socials`).
  - **Static & Live Previews**: Direct preview link to static non-scrolling card layouts (`/credits.html?preview=true`) alongside live roll actions.
  - **Config Editor Modernization**: Streamlined system settings (`public/system/config-editor.html`) into structured top tabs (`General`, `Stream & Lifecycle`, `Modules & Services`, `Connection & Security`, `Appearance`), fixing lifecycle persistence and removing UI clutter.

- **Chat Bot Enhancements & Silent Actions**:
  - **Silent Commands**: Execute chatbot actions and webhooks without posting visible chat responses back to Twitch/SSN.
  - **HTTP Webhook Actions**: Dynamic POST/GET webhook triggers linked to chat commands or alert conditions.
  - **Automated Sync & Moderator Detection**: Auto-detection and synchronization of broadcaster status and channel moderators.
  - **Expression & Token Engine**: Positional arguments, RNG/choice expressions, target user parsing, and live-only timers.
  - **Bot Activity Feed & Runner**: Real-time activity monitoring feed and direct API runner (`/api/chatbot/run`).
  - **Navigation & Layout**: Compact 9-tab navigation and collapsible Dynamic Tokens & Actions reference section with instant search.

- **Game Plan Overhaul & Calendar Integration**:
  - **Full Calendar Views**: Month, week, and 14-day calendar strips with chronological event ordering and category badges.
  - **Playstyle Tagging & Schedule Sync**: Multi-day recurring schedule support, Twitch category auto-sync on "Play Now", and cross-list search.
  - **Custom List Collections**: Custom lists/collections (`plan.lists`), smart period tokens (`@today`, `@tomorrow`, `@this-week`, etc.), and decluttered context menus.
  - **Game Plan OBS Overlay & URL Wizard**: Dedicated URL wizard with responsive layout modes (ticker, list, cards), cover art scaling (`coverScale`, `coverFit`), and fluid styling.

- **Alerts & Events Architecture**:
  - **Alert Queue & Dock**: Low-density alert queue dock (`public/tools/alert-queue.html`) with "Hide unmatched" filtering to filter background chat events, rule searching, trigger icons, and event replay.
  - **Simulator Presets**: Built-in simulator presets for follows, subs, resubs, bits, raids, and channel point redeems.

### Changed
- **Server Modularization**: Extracted monolithic routes and services from `server.js` into modular domain controllers (`server/routes/*` and `server/services/*`).
- **Directory Structure Reorganization**: Grouped client pages into clean domain folders (`public/overlays/`, `public/editors/`, `public/system/`, `public/library/`, `public/tools/`) with a backwards-compatible cascading static router.
- **Strict No-Emoji Design System**: Audited and purged raw unicode emojis across all UI controls, wizard options, buttons, tabs, headers, status badges, and documentation, standardizing on crisp inline SVG icons and clean typography.
- **Feature Gating**: Centralized modular toggles in Config Editor to enable/disable modules (Music, Chatbot, Clips, etc.) without broken links or navigation lockout.

### Fixed
- **Session Lifecycle Persistence**: Whitelisted `session_lifecycle` in system settings PUT and returned in GET responses to ensure auto-start/stop configurations persist correctly.
- **Security Hardening**: Blocked raw directory traversing and sensitive file access (`config.json`, dotfiles).
- **Twitch Token Refreshes**: Serialized token refreshes to avoid race conditions with rotating refresh tokens.
- **Memory & Resource Optimization**: Fixed filter string accumulation leaks, eliminated render-blocking waterfalls in overlay cutouts, and resolved Safari WebKit canvas memory leaks.
- **Graceful Shutdown**: Added SIGTERM and SIGINT handling with atomic file writes to ensure session state and metrics are preserved across restarts.

## [0.10.0] - 2026-10-12

### Added
- Integrated Chat Bot (Beta) with commands, aliases, cooldowns, quotes, timed messages, word triggers, and custom variables/counters.
- Built-in device-code sign-in for Twitch Connect without requiring a Twitch developer application.
- Initial Alert Box element and simulator presets for stream alerts.
