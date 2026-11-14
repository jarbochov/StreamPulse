# StreamPulse Changelog

All notable changes to StreamPulse are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Analytics**: Period comparisons, activity heatmaps, milestone estimates, and remembered views and date ranges.
- **Trivia Leaderboard**: Dual session and persistent season player standings (points, correct count, accuracy, streaks, optional speed bonus), standalone `/overlays/trivia-leaderboard.html` overlay with Reset to Defaults, `!triviastats`/`!triviatop` chat commands, leaderboard & question bank JSON/CSV export and import, and `trivia.leader.*` placeholders.

### Changed
- **Game Plan Editor**: Switched Tonight's Lineup to a non-destructive pin/queue model that keeps each game's Home List (`Schedule`, `Up Next`, `Backlog`, or Collection), added **Pull Today's Scheduled**, **Clear Tonight**, and **Sync All Unsynced** actions, multi-select bulk actions bar, compact row `⋯` overflow menus, a tabbed Edit dialog (`Details`, `Schedule & Twitch`, `Notes & Lists`), horizon block suggestions, and JSON Export/Import.
- **Editor Modularization**: Decomposed `public/editors/timers-editor.html` and `public/editors/randomizer-editor.html` inline scripts into modular ES components under `public/js/timers/` (`timers-state.js`, `timers-subathon.js`, `timers-main.js`) and `public/js/randomizer/` (`randomizer-state.js`, `randomizer-preview.js`, `randomizer-presets.js`, `randomizer-main.js`), and moved Import/Export utility actions into compact card headers so primary creation controls stay prominent.
- **Trivia Studio**: Moved Leaderboard Overlay appearance settings, OBS URL builder, and widescreen 16:9 live preview into Tab 2 (`Overlay & Theming`) with a `Question Overlay` / `Leaderboard Overlay` sub-navigation bar.
- **Companion & API Parity**: Add `/api/goals/status`, `GET`/`POST /api/goals/:id/:action` including manual `add` progress adjustments, `/api/tier-list/status`, `/api/randomizer/status`, `/api/randomizer/trigger`, and `GET` elimination toggles.
- **Live Previews, Wizards & Backup Portability**: Added zero-reload `postMessage` live previews and Reset to Defaults controls in Versus and Polls studios, `localStorage` persistence and Reset to Defaults across URL wizards, remembered editor views in Goals and Music studios, and JSON export/import in Goals, Polls, Randomizer, and Timers editors.
- **Dashboard**: Modularize into `public/js/dashboard/`, pack compact 12-column rows (`grid-auto-flow: dense`), auto-hide disabled modules, add a toolbar **Start Session** button when offline, add a **Live Ops** view preset toggle, add quick Alerts Pause/Mute/Skip buttons, per-timer Start/Pause/Reset controls, and Chat Bot Pause/Enable + quick send controls, make Active Chatters clickable for dossiers, and remember Diagnostics/Danger zone open state.
- **Chat Bot**: Expand placeholders in `/api/chatbot/send`, fire multiple due timed messages in the same minute without starvation, add `/api/chatbot/messages/:id/run` and `/api/chatbot/test-trigger`, fix `#timed` deep linking, persist the active Studio tab, auto-refresh Activity while open, add a dedicated **Testing** tab (Send as Bot, Trigger Dry-Run, Command Test Context), and add Duplicate controls.
- **Sessions & Overlays pages**: Persist the selected session, detail tab, and overlay filter in `localStorage`, keep `?session=` and `#tab`/`#view` URL parameters synchronized with navigation, and improve narrow-screen responsiveness on `.chat-search` and overlay cards.
- **Alerts replay**: Support replaying the last `1`–`50` shown alerts in order via `POST` or `GET /api/alerts/replay?count=N` (defaults to `1`).

### Fixed
- **Analytics CRM**: Prevent `td .sub` from stretching `.tag-badge.sub` subscriber pills full-width.
- **Overlay control**: Separate Pages, Media (videos/slideshows/cutouts), and Speakers into standard `.tabs-nav` tabs with `#pages`/`#media`/`#speakers` deep links and count pills, clean up the Speakers panel, list trigger/event pages below rotation pages, and remove the full app nav bar.
- **Sessions**: Record native Twitch subscriptions and keep title/category history live-only.
- **Trivia overlays**: Respect boxed styles and keep enabled hints at zero, never with voting off.
- **Subscription alerts**: Use observed tenure when Twitch omits cumulative months.
- **Windows builds**: Prevent embedded startup from opening an authorization browser and hanging desktop validation.
- **Trivia**: Chat-voting silence, saved sound/blur/collapse controls, live-edit preservation, question ordering/tracking, auto-advance, and Companion state mapping.
- **Subathon**: Preserve omitted donation settings during rule edits and update idle overlays when timed boosts expire.
- **Tier List**: Apply appearance and viewport changes to the live preview without reloading it.

---

## [0.15.0] - 2026-11-09

### Added
- **Trivia**: Choice randomization, manual Clear Question, separate advance delay, countdown colors, and responsive card widths.
- **Subathon Automation Engine**: Modular timer extension engine with granular event rates (subs by tier, bits, follows, raids, channel points), exact donation amount rules, Boost Period multipliers, undo audit log, dynamic rules overlay (`/overlays/subathon-rules.html`), visual theming studio with 60fps live preview, and secondary sub-navigation (`.sub-nav-bar`).
- **Speaker Badges**: Voice-reactive OBS overlay layers with 5 layout presets, dB speech gates, EQ visualizers, and a dedicated controller tab.
- **Tier List Maker**: Standalone tier list studio and 60fps animated OBS overlay with live chat consensus voting (`!tier`), multi-source imports, preset management, and PNG export.
- **Trivia Studio**: Audience quiz studio and broadcast overlay with 2–6 answer choices, True/False format, drag-and-drop question ordering, (Done) tracking, theme presets, glass styling, and Bitfocus Companion integration.
- **Embedded & Host Integration**: In-process embedded mode (`STREAMPULSE_EMBEDDED=true`) with `{{rep.*}}` host data placeholders, external donation ingestion, alert mute API (`POST /api/alerts/mute`), and chatbot donation announcements.
- **Alerts & Announcements**: Manual Announcements studio and OBS dock, rule priority and expiry, Hype Train and Channel Points triggers, bundled sound library, and emote celebrations.
- **Twitch EventSub & Moderation**: Native WebSocket EventSub client, plus real-time message deletion, chat clearing, and permanent ban synchronization.
- **Dynamic Placeholders**: Comprehensive placeholders and live ticking tokens for Tier List (`tier_list.*`), Trivia Studio (`trivia.*`), Versus / Matchup (`matchup.*`), and Tournaments (`tournament.*`).

### Changed
- **Chat Bot**: Promoted Chat Bot from Beta to general availability with independent quote persistence (`data/quotes.json`), pre-compiled pattern matching, per-user cooldowns, and full Bitfocus Companion integration.
- **Alerts & Custom Overlays**: Streamlined variant ladder and milestone tiers with drag-and-drop rule reordering, JSON import/export, and improved inspector organization.
- **OBS Scene Sync & Architecture**: Independent OBS Scene Sync module toggle decoupled from audio meters, plus extracted server domain services under `server/services/`.

### Fixed
- **Trivia**: Honor default duration and post-countdown Reveal Delay; hide disabled voting and preserve correct-choice selection.
- **Hashtag Stats & Timers**: Fixed array normalization in moderation service for hashtag stats, resolved subathon tab hash routing and safe status lookup, and added 1-click timer duration chips and Companion play/pause routes.
- **UI Design System Consistency**: Replaced unicode emojis and raw symbols across all studios, wizards, library, and overlays with crisp inline SVGs.

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
