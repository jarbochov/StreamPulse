# StreamPulse Changelog

All notable changes to StreamPulse are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> [!NOTE]
> **Semantic Versioning & Local-First Philosophy**
> StreamPulse is 100% self-hosted, open-source, and local-first. We do not push silent cloud updates or collect telemetric user data. Every release is published directly to [GitHub Releases](https://github.com/jarbochov/StreamPulse/releases) with full source code transparency.

---

## [Unreleased]

### Added
- **Interactive Trivia**: Standalone live trivia studio and animated OBS overlay with question banks, countdown progress timer, audience chat voting (!a, !b, !c, !d), answer reveal fanfare, preset packs, and Bitfocus Companion controls.
- **State Machine Architecture**: Universal, zero-dependency state machine engine (`server/services/state-machine.js` and `public/js/state-machine.js`) with declarative transitions, state guards, and queryable introspection for alerts, overlay lifecycles, and companion controllers.
- **Speaker Badges**: OBS voice-reactive overlay layers with 5 layout presets, dB speech gates, EQ visualizers, and a Speakers controller tab for live profile, avatar, audio-source, and field-visibility updates.
- **Tier List Maker**: Standalone tier list studio and 60fps animated OBS overlay with live chat consensus voting (`!tier`), clipboard/drag-and-drop/Asset Library imports, preset management, and PNG export.
- **Embedded & Host Integration**: In-process embedded mode (`STREAMPULSE_EMBEDDED=true`, e.g. NodeCG) with `{{rep.*}}` host data placeholders, external donation ingestion (`ingestEvent`, source filtering, `{{...|money}}` formatting), alert mute API (`POST /api/alerts/mute`), and chatbot donation announcements.
- **Alerts & Announcements**: Manual Announcements studio and OBS dock, rule priority/interrupt/expiry, Hype Train and Channel Points triggers, bundled CC0 and synthesized sound library, animated Twitch Cheermotes and emote celebrations, webhook/Companion actions, and Alert Box looks, media-only effects targeting, and focal point cropping.
- **Custom Overlay Studio & Assets**: 1–4 image/icon tiles, seasonal procedural backgrounds, palettes and independent motion, bounded rendering, modular shared engine, image cropper, asset safeguards, and per-page availability.
- **Twitch EventSub & Moderation**: Native EventSub WebSocket client for real-time Twitch events with automatic REST polling throttling, plus Twitch/SocialStream message-deletion, chat-clear, and permanent ban sync with non-destructive history and community filtering.
- **Chat Bot & Companion**: Collapsible chatbot settings with dedicated quote storage (`data/quotes.json`), plus expanded Bitfocus Companion controls and live feedback for Tier Maker, speakers, overlays, timers, and alerts.

### Changed
- **Alerts Studio & Custom Overlay Editor**: Streamlined variant ladder and milestone tiers with drag-and-drop rule reordering, JSON import/export, and native-volume previews; reorganized the Custom Overlay element picker, Pages tabs, and Alert Box inspector.
- **OBS Scene Sync & Server Architecture**: Independent OBS Scene Sync module toggle (decoupled from speaker audio meters) and extracted server domain services (`server/services/*`) and pattern inspector modules (`editor-patterns.js`).

---

## [0.14.0] - 2026-11-01

### Added
- **Custom Overlay Studio (Beta)**: Independent Pages and reversible Scene States with frame-synced OBS source motion, scene-hosted Move filters, inside/center/outside frame borders, smart alignment snapping, reusable prefabs, Twitch Poll widget, IGDB artwork browser, and full-bleed procedural Background Patterns (`procedural-pattern`).
- **Alerts Engine & Queue**: Unified variant conditions and weighted odds, milestone activation ladder, 23 synthesized Web Audio presets, subscription tier specificity, video volume controls, Twitch channel emotes, and a low-density Alert Queue dock with test dispatch.
- **Versus, Tournaments & Poll Manager**: Scoreboards with competitor race/split clocks, validated single/double-elimination brackets with camera focus and custom styling, round-robin standings, and chat-driven Poll Manager brackets with entrant colors and snapshot recovery.
- **Promo Creator & Randomizer**: Social promo studio with 20 shared procedural patterns and PNG/MP4 export, plus Randomizer elimination mode with weight-based choice restoration.
- **Chat Bot & Companion API**: Per-user command cooldowns, keyword matching modes (`contains`, `exact`, `starts_with`, `ends_with`, `regex`), command/trigger JSON import/export, full-coverage backup/restore, and unified GET/POST Bitfocus Companion endpoints with plain-text field lookups.

### Fixed
- **Overlays & Visual Engine**: Separated full-bleed procedural patterns from repeating Pattern Tiles, prevented idle Alert Box borders/glows, separated Versus (`/tournament.html`) and Poll (`/poll-tournament.html`) bracket overlays, fixed double-elimination loser routing and active match badges, and locked Game Plan tier list rows against multi-column wrapping.
- **Alerts & Audio**: Resolved Web Audio context suspension on load, fixed weighted variant distribution and Prime sub simulation, and tracked alert media assets in the Asset Library to prevent accidental purging.
- **Platform, Memory & Connections**: Cancelled inactive pattern RAF loops, bounded WebSocket/client queues and navigation polling deadlines, preserved paused timer baselines, unwrapped SocialStream featured message triggers, and enforced the repository-wide inline SVG (No-Emoji) design system.

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
- **Documentation & Packaging**: Redesigned the documentation site into streamer feature guides and technical references with local Docsify assets; enabled stable-release desktop installer publishing.
- **Performance & Architecture**: Moved full-backup ZIP creation/restore to a bounded worker service, extracted shared Randomizer rendering with static wheel caching, cached session archive summaries, and mounted only active Custom Overlay layers while throttling background Game Plan polling.

### Fixed
- **Overlays, Playback & Retro FX**: Preserved HTML5/YouTube playback and running alerts across live-data rerenders, restored CRT/LCD retro effect normalization, displayed Randomizer deck watermarks before the initial shuffle, and prevented stale Game Plan HTTP snapshots from overwriting newer WebSocket state.
- **Twitch, Accounting & Lifecycle**: Added 15-second deadlines on Twitch OAuth/Helix requests, corrected milestone/session totals by excluding empty offline sessions, counted registered overlay pages separately from raw WebSocket clients in the dashboard, and coordinated clean desktop quit/restart shutdown.

## [0.12.0] - 2026-10-19

### Added
- **Brand Identity & Desktop Packaging**: Official rainbow emblem and multi-platform icon suite (`.icns`, `.ico`, SVG favicons, adaptive menu bar icons), plus an interactive `npm run setup` wizard and `desktop:dev` / `desktop:build` scripts.
- **Choice Randomizer Studio**: 3D playing card deck draw mode with custom deck branding, vertical slot roller, high-DPI spinning wheel, synthesized Web Audio effects, choice weighting/pity modes, and decoupled studio/OBS overlays.
- **Custom Overlay Studio & Visual Engine**: Cross-browser SVG cutout punchouts, WebGL CRT/LCD retro display shaders, GPU media filters (`overlay-filters.js`), Pattern Tile mosaic layers, animated borders, unified HTML5/YouTube video playback and remote control, and modularized editor architecture.
- **Community Directory & Credits Studio**: Community analytics with smart roster segments (Regulars, VIPs, Lapsed, Newcomers), viewer dossiers, CSV export, follower growth charts, and a standalone Credits Studio (`/credits-editor.html`).
- **Game Plan, Chat Bot & Alerts**: Calendar views (month/week/14-day), custom game collections (`plan.lists`), smart period tokens (`@today`, `@this-week`), silent chatbot commands and HTTP webhooks, low-density Alert Queue dock with "Hide unmatched" filtering, and interactive Overlay URL Wizards.

### Changed
- **Server & Client Modularization**: Extracted routes and services from `server.js` into `server/routes/*` and `server/services/*`, reorganized client pages into domain directories (`overlays/`, `editors/`, `system/`, `library/`, `tools/`), centralized module feature gating, and enforced the repository-wide inline SVG (No-Emoji) design system.

### Fixed
- **Security, Stability & Persistence**: Persisted `session_lifecycle` settings, blocked directory traversal and dotfile access, serialized Twitch token refreshes, resolved WebKit canvas/filter memory leaks, and added atomic file writes on graceful shutdown.

---

## [0.10.0] - 2026-10-12

### Added
- Integrated Chat Bot (Beta) with commands, aliases, cooldowns, quotes, timed messages, word triggers, and custom variables/counters.
- Built-in device-code sign-in for Twitch Connect without requiring a Twitch developer application.
- Initial Alert Box element and simulator presets for stream alerts.
