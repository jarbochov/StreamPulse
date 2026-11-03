# StreamPulse Changelog

All notable changes to StreamPulse are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Alert rule priority (low to critical), optional interrupt, expiry and queue cap; manual `POST /api/alerts/trigger`; Announcements (manual alerts with Fire tab, OBS dock grid and `/tools/announcements-dock.html`); chat message and Companion button alert actions.
- Bundled alert sound library: 22 CC0 Kenney jingle/impact clips (Celebration, Hype, Impact, Chime/Bell, Retro) plus 15 Synth and 15 layered synthesized presets (fanfares, air horn, bass drop, applause, gong) in the alert sound picker.
- Alerts page: variants grouped under Base and milestone tiers with threshold labels, odds pills and one-open-at-a-time rows; clickable ladder; live preview with Play sound; optional media thumbnails; inline warnings; rule search with Active/Inactive filters; Import/Export JSON (merge or replace); Copy/Paste style between variants; Revert; keyboard shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+Enter, Cmd/Ctrl+D, /).
- Alert box media focal point (Focus X/Y, shown for Fill media) and custom padding.
- Alert box "Apply media effects to" setting: filters and tint can target only the alert's media so title and message text stay crisp.
- Bits alerts: per-variant Emote source (Viewer's cheermote or Custom); Viewer's cheermote uses the family from the message with the tier from the summed bits, falling back to Cheer at the total amount.
- Alerts page: drag-and-drop (or Alt+Up/Down) alert reordering, remembered selection, and alert text that scales to fit small alert boxes.
- Embedded mode (`STREAMPULSE_EMBEDDED=true`) for in-process hosts such as NodeCG, with broadcast listeners and state snapshots; host data such as NodeCG replicants resolves as `{{rep.<bundle>.<name>.<path>}}` placeholders. Optional HTTPS via `STREAMPULSE_TLS_KEY`/`STREAMPULSE_TLS_CERT`.
- Embedded `ingestEvent` feeds external donations (such as Tiltify from NodeCG) into alerts, goals and stats.
- Alert rules and milestone variants can match an exact amount (At least / Between / Equal to); exact matches win.
- Donation alert rules can filter by source; `{{alert.source}}` and `{{alert.currency}}` placeholders.
- Embedded `registerHostSource`/`getHostSources` add host donation sources (listed as `hostSources` in `/api/status`).
- Chat bot donation announcements with minimum amount, source and template; optional `{total}`/`{goal}` from host data.
- Chat bot Live data panel lists host data with copyable `{{rep.*}}` placeholders; `GET /api/external-data` returns it read-only and size-limited.
- `POST /api/alerts/mute` mutes alert display (e.g. NodeCG panic); `queue.muted` in `/api/alerts`.
- `money` placeholder format, e.g. `{{placeholder|money}}` renders $1,234.00.

### Changed
- Alerts page: removed the Preview Vol slider; previews play at each variant's saved Alert/Video volume. Cooldown moved into Trigger & conditions.

---

## [0.14.0] - 2026-11-01

### Added
- Custom Overlay Studio (Beta): independent Pages (cut, crossfade or slide), reversible Scene States with snapshot recovery, cancellable OBS synchronization, scene-hosted Move filters for Morph with visible source motion, matching OBS Crossfade/Slide/Zoom/Cut for linked sources with the overlay's curves, one shared easing set that mirrors OBS Move's curves, self-cleaning managed OBS filters (`/api/obs/cleanup-filters`), a frame-synced OBS motion engine that shares one scheduled start time with the overlay (`obs.leadMs`, Move remains selectable), inside/center/outside frame borders, protected OBS credentials, smart snapping, and reusable prefabs.
- Alerts Engine & Queue: Unified variant conditions and weighted random selection, 23 synthesized Web Audio alert sound presets, master preview volume scaling, granular subscription tier selection with specificity precedence, visual Alert Activation Ladder and Milestone Tiers UX, video volume controls, Twitch channel emotes in alert media, gift sub recipient placeholders, and low-density Alert Queue filtering by event type and search query with in-dock test dispatch.
- Versus & Tournament Studio: Scoreboards, validated elimination brackets with Grand Finals resets, round-robin standings and saved history, unlimited points, exhibition queues, independently controlled race clocks, and broadcast overlays.
- Matchup Player Clocks: Optional competitor split, race, and countdown clock badges on all versus scoreboard layouts (`top`, `fgc`, `split`, `pillar`, `bottom`, `compact`, `versus`).
- Chat Bot Enhancements: Per-user cooldowns (`userCooldown`), keyword trigger matching modes (`contains`, `exact`, `starts_with`, `ends_with`, `regex`), and JSON import/export for custom command and trigger suites with REST API endpoints and toolbar buttons.
- Custom Overlay Editor: Type-aware inspector tabs, remembered navigation, page-preserving duplication, edit-safe saving, aspect ratio presets, slideshow easing, and responsive scaling.
- Bitfocus Companion & REST API: Plain-text Stream Deck title lookups (`/api/status/field/:field`, `/api/matchup/field/:field`), unified HTTP GET and POST trigger fallbacks, and real-time state variables.
- Poll Manager: Viewer-based chat voting, blind audience brackets, focused overlays with snapshot recovery, reusable tournament templates, progress checkpoints, and completed-ballot history.
- Randomizer Elimination Mode: Weight-based choice randomizer with elimination and restoration.
- Promo Creator: Social promo generator with multi-layer layout, animations, PNG exports, and six-second MP4 loops.
- Procedural Patterns Library: Shared 20-pattern geometric and organic pattern generator synced across Promo Creator and Custom Overlay Editor.
- Custom Overlay Background Patterns: Dedicated Background Pattern layer (`procedural-pattern`) for full-frame, seamless generative vector backdrops ported from Promo Creator with 20 patterns and 7 animation styles.
- Custom Overlay Poll Element: Real-time Twitch poll widget for custom overlays.
- Custom Overlay Editor IGDB Artwork: Direct browser and importer for official game artwork, logos, and screenshots from IGDB into custom overlay image layers.

### Fixed
- Website: Keep mobile navigation accessibility state synchronized when animation frames are delayed.
- Live connections: Preserve protocol close codes when rejecting oversized WebSocket messages.
- Dashboard: Restore connection text after outages, show disabled alerts accurately, and bound shared navigation polling with deadlines, stale-response protection, and idle cleanup.
- Goals & Timers: Preserve reset baselines and zero community weights on save, retain pending baseline edits during live updates, and keep paused date countdown snapshots frozen.
- Memory: Cancel queued pattern frames when Effects is disabled, avoid duplicate saved snapshots, bound live-client queues and transient caches, and distinguish Node RSS from JavaScript heap.
- Custom Overlay Editor Patterns: Separate procedural generative backdrops from repeating tile mosaics; render Promo patterns full-bleed across the layer without cutting geometry into 96px tiled stamp squares, while keeping Pattern Tile dedicated to repeating image and icon mosaics.
- Alert Variants UX: Eliminate text truncation and cutoff across headers and template fields; replace cramped inline micro-inputs with structured prestige cards, clear Base Alert vs Milestone Tier role selectors, full-width template and subtitle fields with inline 1-click token pills, and a visual Alert Activation Ladder showing ascending milestone tier progression.
- Alert Variants & Weights: Fix weighted variant distribution by removing forced 2-variant alternating locks and default pick overrides; remove misplaced odds weight input from Timing & FX tab, replace mutually exclusive weighted/gated toggle with a unified condition and odds bar, and fix test rule simulation bypassing variant selection.
- Alert Sounds: Resolve Web Audio API context suspension bug that muted built-in synthesized audio on load; expand built-in sound registry to 23 high-quality sound effects across chimes, arcade, celebration, and modern UI categories.
- Tournament Overlays: Separate Versus tournaments (`/tournament.html`) and Poll tournaments (`/poll-tournament.html`) into distinct overlays with shared rendering, eliminating cross-contamination where setting or advancing a Versus tournament resolved to active poll tournament data.
- Game Plan Tier List: Prevent multi-column reflow wrapping when shrinking tier lists to container bounds; keep each tier stacked on its own row.
- Asset Library Alert Tracking: Track audio, video, and image assets referenced in alert rules so they display active usage badges and are protected against accidental purging.
- Alert Box: Suppress idle container borders, backgrounds, and glow effects when no alert is actively displaying.
- Alerts Simulator: Add subscription tier selector and remove username substring check for Prime subs.
- Custom Overlay Editor: Fix featured message trigger ingestion from SocialStream Ninja (unwrapping payloads on channels 2 & 4) and add in-editor trigger testing.

## [0.13.2] - 2026-10-19

### Fixed
- Detect packaged desktop installations before updating; block source archive extraction into read-only `app.asar` and provide desktop installer instructions instead.
- Hide Nightly / Main outside Git checkouts and hide in-place source update controls for desktop apps; show stable release checks and a desktop download link.

### Changed
- Add installation update capabilities at `/api/update/info`, with desktop installer metadata in stable-release checks.

## [0.13.1] - 2026-10-19

### Fixed
- Treat example or blank SocialStream session IDs as unconfigured across chat, featured messages, bot replies, and configuration status; allow clearing the ID in Config Editor.
- Give the dashboard consistent default rows with Health and Actions first, readable tool panels, aligned empty states, and a reset that clears legacy layout preferences.

### Changed
- Explain how StreamPulse complements SocialStream Ninja and clarify the current Twitch focus.

## [0.13.0] - 2026-10-19

### Changed
- Redesign the documentation site with separate streamer feature guides and technical reference, local docsify assets, and responsive layout; the home hero is kept.
- Desktop installer workflow can publish to stable releases.

### Fixed
- Count registered overlay pages instead of all WebSocket connections in the dashboard; exclude embedded and explicit preview pages, and expose raw connections separately as `websocketClients`.
- Show the configured watermark on the initial visible Randomizer deck card before the shuffle, including live edits and blank-to-hide behavior.
- Bound Twitch OAuth/device and Helix requests with 15-second deadlines, reject broken response streams, and preserve refresh credentials after transient failures.
- Restore CRT/LCD control strength and spacing by normalizing saved retro settings only once; retain phosphor mask choices and LCD ghosting, with real-editor pixel regressions.
- Correct milestone message totals, broadcast hours, stream counts, and streaks using observed live bounds; exclude offline empty sessions and duplicate archives.
- Retry unchanged chat/stat snapshots after failed primary saves.
- Coordinate desktop quit/restart cleanup across server connections, polling, SSN reconnects, and service timers; preserve sessions on restart.
- Preserve video autoplay/remote-control intent and running custom-overlay alerts across ordinary live-data rerenders; release completed alert handles.
- Make browser smoke failures return a failing exit status and add isolated accounting, persistence, lifecycle, playback, and alert regressions to `npm test`.
- Correct API examples, desktop architecture/lifecycle documentation, and optional Chrome setup guidance.
- Correct Community Directory attendance, segment, subscriber-tenure, local-note storage, and CSV-export descriptions; remove unsupported music/EventSub claims from architecture documentation.
- Read Game Plan WebSocket snapshots from their actual `data` payload and prevent stale HTTP responses from replacing newer live state.

### Changed
- Move full-backup ZIP creation and restore parsing/decompression to a bounded worker service; await required backups before session reset or data replacement, with retention, cancellation, and responsiveness regressions.
- Add a bounded fictional editor resource fixture for Chromium and manual Safari/OBS checks; document one-minute Chromium/Safari observations and the remaining production-soak limits.
- Extract shared Randomizer wheel geometry/rendering, roller/deck staging, spin animations, and callback cleanup into focused modules used by both Studio and OBS. Cache the static wheel face instead of repainting sectors/labels every frame; preserve server-selected winners and existing controls.
- Share compact, metadata-validated session summaries across historical category totals, milestones, and chatter dossiers instead of repeatedly parsing unchanged archive JSON; invalidate on archive writes, deletion, and restore.
- Mount only active/common editor layers, disposing inactive media, slideshow timers, and effect runners while preserving HTML5 playback intent/time and slideshow position on return.
- Skip unchanged Game Plan DOM rebuilds, reduce healthy-WebSocket HTTP refreshes, pause hidden-document polling, and prevent overlapping requests.
- Add isolated archive-cache, editor-activity, and Game Plan refresh regressions to `npm test`.

## [0.12.0] - 2026-10-19

### Added
- **StreamPulse Official Brand Identity & Icon Suite**:
  - **New Visual Identity**: Integrated vibrant rainbow conical gradient and 6-spoke emblem across documentation, web applications, and desktop packages.
  - **GitHub Pages Showcase**: Featured the brand logo prominently beside the "StreamPulse" title in the sidebar header and as the hero emblem on the documentation cover page.
  - **Universal Favicons & Touch Icons**: Generated rounded-tile squircles for `public/favicon.svg`, `docs/favicon.svg`, and `docs/images/apple-touch-icon.png`.
  - **Multi-Platform Desktop & Menu Bar Icons**: Generated high-DPI macOS `.icns`, Windows multi-resolution `.ico`, 1024px master `icon.png`, and platform-adaptive macOS menu bar template icons (`setTemplateImage`) with dark/light mode switching on Windows and Linux.
  - **Brand Tooling**: Unified asset generation script in `scripts/generate-icons.mjs` and refreshed Open Graph social preview (`docs/images/og-preview.png`).

- **Choice Randomizer Studio & 3D Physics Overhaul**:
  - **3D Playing Card Deck Draw Mode**: Added authentic physical 3D playing card deck drawing with 3D deck cutting, split packets, tactile riffle cascade interleave, squaring up, and suspense hover card flip.
  - **Custom Card Deck Branding**: Real-time card deck logo upload (`/api/custom-overlays/assets`), clear button, and dynamic watermark text rendered consistently across split cut packets, riffle cascade cards, and dealt active card backs.
  - **Decoupled Studio & Dedicated OBS Overlay**: Independent studio monitor (`randomizer-editor.html`) and dedicated transparent broadcast overlay (`randomizer.html`) communicating in real-time over WebSockets (`/api/randomizer/spin`) and URL search params.
  - **Interactive Display Modes**: 3D Playing Card Deck, continuous vertical slot machine roller, and customizable high-DPI spinning wheel.
  - **Synthesized Web Audio Effects**: Procedural Web Audio oscillator synthesis for ticking, accelerating/decelerating wheel clicks, card sliding, tactile riffle drops, card flip whoosh/snaps, and celebratory fanfare. Features automatic browser audio policy unlocking.
  - **Choice Weighting & Pity Systems**: Equal probability, manual weighting, Growth (pity odds for unpicked items), and Momentum (hot streak booster) modes with persistent streak tracking across page reloads.
  - **Live Twitch Chatters & Curated Themes**: Auto-populate choices from active stream chatters, custom overlay button sets, announcement headers, and curated color palettes (Dark, Neon, Retro, Cyberpunk, Clean System).

- **Streamlined Setup Wizard & Desktop Scripts**:
  - **Interactive `npm run setup`**: Interactive terminal wizard allowing streamers to choose between a lean Self-Hosted Web Server installation (`npm install --omit=dev`, omitting Electron and packaging bloat) or full Desktop App Development.
  - **Clarified Development Commands**: Dedicated scripts for desktop development (`npm run desktop:dev`) and distribution binary packaging (`npm run desktop:build`).

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

- **Visual Overlay URL Wizards & Documentation**:
  - **Zero-Code URL Wizards**: Added interactive side-by-side URL wizards (`docs/overlay-wizards.md`) for Credits, Timers, Music, Game Plan, and Milestones with real-time preview canvas and responsive scaling parameters.
  - **Sanitized Visual Assets**: Comprehensive documentation overhaul with sanitized dummy data adhering strictly to privacy standards and the strict No-Emoji design system guidelines.

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

---

## [0.10.0] - 2026-10-12

### Added
- Integrated Chat Bot (Beta) with commands, aliases, cooldowns, quotes, timed messages, word triggers, and custom variables/counters.
- Built-in device-code sign-in for Twitch Connect without requiring a Twitch developer application.
- Initial Alert Box element and simulator presets for stream alerts.
