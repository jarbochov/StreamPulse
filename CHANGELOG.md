# StreamPulse Changelog

All notable changes to StreamPulse are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Shared Color Palettes Library (`/api/palettes`)**: Centralized 2–8 stop custom color palettes persisted in `data/palettes.json` (included in backups, live `palettes-update` WebSocket sync) with a reusable Library & Builder modal shared across Custom Overlay Editor, OBS Pattern Studio, and OBS Border Studio.
- **Operator Mode (`/operator.html`)**: Unified live-show control console with a customizable 1–4 column Live Board, lazy-mounted domain tabs (Variables, Displays, Overlays, Timers + Subathon, Alerts, Music, Versus, Polls, Trivia, and server-saved Markdown Runbooks), Touch / Tablet Density, Quick Preset Pill Bar (`1`–`9`), Undo Toast, Live Activity Log, Two-Level Safety Locks (`Lock Layout` & `Show Mode`), OBS dock mode (`?profile=<id>&dock=1`), JSON import/export, and Companion triggers.
- **Display Library (`/variable-displays.html`)**: Reusable Inventories, Tables, Member Badges & Strips, Counter & Pips, Meter & Gauge, News Ticker, and Bingo Card designs (`data/variable-displays.json`) with usage counts, independent live sources, source diagnostics, dependency-aware deletion, and Companion Bingo controls (`/api/variable-displays/:id/bingo/*`).
- **Multiplayer Bingo (LAN) (`/tools/bingo.html`)**: Opt-in local-network multiplayer Bingo studio (`multiplayer_bingo_enabled`) with saved Prompt Packs, auto-detected Host LAN IP player join URLs (`/bingo-play.html?t=<token>`), Independent & Lockout modes, optional Four Corners winning line toggle, Host Caller with player-call tracking and Confirm Mode (`/confirm` & `/dismiss`), parameterized OBS overlays (`multi`, `lockout`, `standings`, `single`), and Companion triggers (`/api/multiplayer-bingo/*`).
- **OBS Border Studio (`/tools/obs-borders.html`)**: Metal/OpenGL-compatible OBS Lua border filter (`streampulse-borders.lua`, `obs_borders_enabled`) with 4-tab Hybrid Inspector, live `manifest.json` hot-reload, true outset expansion, OBS Transform Auto-Align, 31 border styles across dual rings, Shared Color Palettes, Icon Borders, 4-mode Drop Shadow, outer glow, 17 GPU animations, Standby Fill, Variable Settings (`{}`), scene rules, and Companion triggers.
- **OBS Pattern Studio (`/tools/obs-patterns.html`)**: Native Metal-safe OBS Lua GPU video source (`streampulse-patterns.lua`, `obs_patterns_enabled`) with 4-tab Hybrid Inspector, 31 procedural patterns, 22 curated palettes + Shared Color Palettes, Pattern Tiles (layouts, symmetry, 10 motions, PNG stamps, tint/palette blending), single-pass GPU filters, Variable Settings (`{}`), live OBS source creation, and Companion triggers.
- **OBS Layout & Aspect Studio (`/tools/obs-layout.html`)**: Opt-in visual OBS bounding-box editor and GPU aspect ratio studio (`obs_layout_enabled`, `streampulse-aspect.lua`) with live drag/resize/nudge, snapping, outer border guides, on-demand scene snapshots, GPU aspect ratio morphing (`16:9`, `4:3`, `1:1`, `4:5`, `9:16`, `21:9` + Pan/Zoom upstream of `StreamPulse Border`), 9-point anchor pinning, Resize Modes, multi-waypoint motion paths, native OBS item transitions, Saved Layouts, and Companion triggers (`/api/obs-layout/*`).
- **Variables & Variable Sets**: Added `image`, `toggle`, `color`, `template`, `font`, `date`, `time`, `datetime`, `duration`, `select` (`_color`/`_icon`/`_value`, `/next`/`/prev`), and `tags` (`_count`, `/toggle`/`/clear`) variable types; renamable Variable Groups; slotless & multi-slot Variable Sets with linked entries, per-owner item Trackers, queues, timed rotation, lazy Direct Item Placeholders (`{{var.<set>.1.<field>}}`, `.all.<n>`, `<slug>`, `.count`/`.total`), JSON/CSV import/export, Companion endpoints, and Variable Settings (`var:<key>|<fallback>`) across URL Wizards and Studio Theming Builders.
- **Custom Overlay Styling, Presets & Text Cycling**: Composable 31 frame border styles, 17 animated border modes, per-corner radiuses, whole-block / per-word / per-character text animations, multi-line Text Cycling (`cycle`), Element Style Presets (`/api/custom-overlays/style-presets`, `data/style-presets.json`), and **Contain + Blurred Fill (uncropped)** fit mode across Image, local Video, Slideshow, and Promo Creator layers.
- **Analytics & Community Insights**: Period comparisons, activity heatmaps, milestone estimates, remembered views/date ranges, and optional viewer history, Twitch follow dates, and welcome-back/milestone chat messages.
- **Trivia Leaderboard**: Dual session and persistent season player standings, standalone `/overlays/trivia-leaderboard.html` overlay, `!triviastats`/`!triviatop` chat commands, JSON/CSV import/export, and `trivia.leader.*` placeholders.
- **History Repairs**: Audited, backed-up alert corrections and gift-attribution repairs across session and lifetime credits without replay.

### Changed
- **Config Editor & Navigation**: Made **Promo Creator** an opt-in module (`promo_creator_enabled`, disabled by default), added a dedicated **Production & Exports** section in Config Editor and under **Tools → Production & Exports**, added live text search to **Modules & Services**, moved Twitch status/scopes/Disconnect/auth links into **Config → Connection & Security → Twitch Connection**, and removed the standalone **Twitch Connect** System menu entry.
- **Versus Studio (`/versus.html`)**: Added 3 broadcast themes (`Broadcast Sports Ticker`, `Retro Arcade`, `Minimal Transparent HUD`), Event Theme Sync, Saved Looks, Match & Race keyboard shortcuts with 20-step Undo, CSV/JSON bracket import with Shuffle Seeds & live BYE preview, Fight Card drag-and-drop, and one-click Create Promo handoff.
- **Promo Creator (`/promo-creator.html`)**: Unified all 31 background patterns onto the shared procedural pattern engine (with Fill Style, 22 curated palettes, spacing, scatter, spin, and cascade motion) and added **Color & Exposure** and **Tint, Duotone & Grain** drawers across preview, PNG export, and 6-second MP4 loops.
- **Asset Pickers**: Shared name/tag/caption search, tag filters, and recent/name sorting across library selectors with remembered preferences.
- **Game Plan Editor**: Switched Tonight's Lineup to a non-destructive pin/queue model keeping each game's Home List, added Pull Today's Scheduled / Clear Tonight / Sync All Unsynced actions, multi-select bulk actions, tabbed Edit dialog, horizon block suggestions, and JSON export/import.
- **Editor Modularization**: Decomposed Timers and Randomizer studios into modular ES components under `public/js/timers/` and `public/js/randomizer/`.
- **Trivia Studio**: Moved Leaderboard Overlay appearance settings, OBS URL builder, and widescreen 16:9 live preview into Tab 2 (`Overlay & Theming`) with a `Question Overlay` / `Leaderboard Overlay` sub-navigation bar.
- **Companion & API Parity**: Added `/api/goals/status`, `GET`/`POST /api/goals/:id/:action` (including manual `add` progress adjustments), `/api/tier-list/status`, `/api/randomizer/status`, `/api/randomizer/trigger`, and `GET` elimination toggles.
- **Live Previews, Wizards & Backup Portability**: Added zero-reload `postMessage` live previews and Reset to Defaults in Versus and Polls studios, `localStorage` persistence and Reset to Defaults across URL wizards, remembered editor views in Goals and Music studios, and JSON export/import in Goals, Polls, Randomizer, and Timers editors.
- **Dashboard**: Modularized into `public/js/dashboard/`, packed compact 12-column rows, auto-hid disabled modules, added Start Session toolbar action, Live Ops view preset, quick Alerts/Timers/Chat Bot controls, clickable Active Chatters dossiers, and remembered Diagnostics/Danger zone state.
- **Chat Bot**: Expanded placeholders in `/api/chatbot/send`, fired multiple due timed messages without starvation, added `/api/chatbot/messages/:id/run` and `/api/chatbot/test-trigger`, fixed `#timed` deep linking, persisted active tab, added a dedicated **Testing** tab, and added Duplicate controls.
- **Sessions & Overlays Pages**: Persisted selected session, detail tab, and overlay filter in `localStorage` with synchronized `?session=` and `#tab`/`#view` URL parameters.
- **Alerts Replay**: Supported replaying the last `1`–`50` shown alerts in order via `POST` or `GET /api/alerts/replay?count=N`.

### Fixed
- **Timers**: Restored countdown completion processing and prevented duplicate standalone overlay startup/update loops.
- **Session Lifecycle**: Resumed the original offline grace period after a restart instead of leaving a finished session active.
- **Overlay Rendering & Editor**: Culled off-screen stars, cached particle seeds, reduced grain/radial-border repainting, paused hidden-tab effects, exposed Placeholder / Variable image sources, kept color pickers open during slider drags, and clarified native StreamPulse vs Twitch Poll labels.
- **Analytics CRM**: Prevented `td .sub` from stretching `.tag-badge.sub` subscriber pills full-width.
- **Overlay Control**: Separated Pages, Media, and Speakers into standard `.tabs-nav` tabs with `#pages`/`#media`/`#speakers` deep links and count pills, listed trigger/event pages below rotation pages, and removed the full app nav bar.
- **Sessions & Subscription Alerts**: Recorded native Twitch subscriptions, kept title/category history live-only, selected Prime from Twitch/SSN announcements, deduplicated delayed notifications, preserved native gift counts/anonymous attribution, and used observed tenure when Twitch omits cumulative months.
- **Windows Builds**: Prevented embedded startup from opening an authorization browser and hanging desktop validation.
- **Trivia, Subathon, Tier List & Credits**: Fixed Trivia chat-voting silence, boxed styles, hints, saved controls, live edits, ordering, auto-advance, and Companion mapping; preserved omitted Subathon donation settings and refreshed idle overlays on boost expiry; prevented Tier List preview reloads; and displayed formatted donation totals in Credits.

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
