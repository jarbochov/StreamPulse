# StreamPulse Changelog

All notable changes to StreamPulse are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> [!NOTE]
> **Semantic Versioning & Local-First Philosophy**
> StreamPulse is 100% self-hosted, open-source, and local-first. We do not push silent cloud updates or collect telemetric user data. Every release is published directly to [GitHub Releases](https://github.com/jarbochov/StreamPulse/releases) with full source code transparency.

---

## [Unreleased]

### Added
- **Shared Color Palettes Library (`/api/palettes`)**: Centralized 2–8 stop custom color palettes persisted in `data/palettes.json` (included in backups, live `palettes-update` WebSocket sync) with a reusable Library & Builder modal integrated across Custom Overlay Editor (**Text Gradients**, **Element/Shape/Canvas Background Gradients**, **Border Gradients & Animations**, and **Procedural Patterns**), OBS Pattern Studio, and OBS Border Studio.
- **OBS Pattern Studio (Beta / Advanced) (`/tools/obs-patterns.html`)**: Standalone Metal-safe OBS Lua GPU video source (`streampulse-patterns.lua`) organized into a 4-tab Hybrid Inspector (`Setup & Canvas`, `Pattern / Tile Layout`, `Motion & Color`, `FX & Filters`) with collapsible Advanced groups and preview clock Pause/Restart + Synced status bar, synced with Custom Overlay Editor presets, 22+ palettes (including Traditional Holiday Lights) and a 2–7 stop saved Custom Palette Editor, universal Density, Spacing (%), and Element Spin (including Voronoi cell GPU spin for baked seasonal icons), Pattern Tile Motion & Track Behaviors (with mutually exclusive **Master Tint & Hue Shift** vs **Palette Set & Gradients** supporting Per-Tile and Smooth Gradient placement modes, Band Width (%) and Gradient Angle controls, Multiply Tint / Luminance Recolor blending, Tint Strength, and fine slow Cycle/Breathe Color Speed), single-pass GPU Filters (Brightness, Contrast, Saturation, Grayscale, Hue Shift, Blur, Duotone, Tint, Film Grain, and filter presets), canvas gradients, Variable Settings (`{}`), live OBS WebSocket source creation/assignment, Companion triggers, and Config Editor module gating (`obs_patterns_enabled`).
- **History Repairs**: Audited, backed-up alert corrections and gift-attribution repairs across session and lifetime credits without replay.
- **OBS Layout & Aspect Studio (Opt-In / Advanced) (`/tools/obs-layout.html`)**: Standalone opt-in visual OBS scene bounding-box editor and GPU aspect ratio studio (gated by `obs_layout_enabled` in Config Editor → OBS Studio Integrations) with live-synced drag/resize/arrow-nudge, magnetic edge/center snapping, outer border guides, optional on-demand scene snapshot backdrop, standalone `streampulse-aspect.lua` filter (smoothly morphs `16:9`, `4:3`, `1:1`, `4:5`, `9:16`, `21:9` + Pan X/Y + Zoom upstream of `StreamPulse Border`), Resize Modes (`Lock Width`, `Lock Height`, `Fit Slot`, `Keep Area`), 9-point Anchor Pinning, multi-element Scene Layout Snapshots, and Companion-friendly `/api/obs-layout/*` endpoints.
- **Multiplayer Bingo (LAN) (`/tools/bingo.html`)**: Standalone opt-in multiplayer Bingo studio (gated by `multiplayer_bingo_enabled` in Config Editor → Overlays & Interactive Games) with saved **Prompt Packs**, per-player uniquely shuffled LAN cards (`/bingo-play.html?t=<token>`), Independent & Lockout claim modes, **Host Caller** (auto-marks called prompts across all player cards), Host Hide/Reveal, Lock/Unlock, Override, Shuffle/Reset, Companion-friendly `/api/multiplayer-bingo/*` triggers, and a dedicated parameterized OBS overlay (`/overlays/multiplayer-bingo.html`) supporting Multi-Card Grid with live player zoom, Lockout Master Board, Standings Strip, and Single Card views.
- **Display Library**: Reusable inventories, ordered tables, member badges/strips, **Counter & Pips** displays (7 broadcast themes, uniform CSS Grid layouts with non-clipping labels, pips, filled/half/outlined hearts, custom FontAwesome icons, 5-count slashed tally marks, variable & per-player `@color` bindings, interactive preview test controls, Operator Mode live cards), **Meter & Gauge** displays (uniform CSS Grid layouts with non-clipping labels, HP bars with damage-drain trails, segmented bars, radial ring gauges, vertical bars, and color thresholds), **News Ticker** displays (GPU-composited infinite broadcast ribbons from List variables or Variable Sets), and **Bingo Card** displays (3×3 / 4×4 / 5×5 Stream Bingo boards from custom prompts, List variables, or Variable Sets with Free Space, 5 stamp styles, automatic row/col/diagonal line detection, `BINGO!` banner, and persisted toggle/shuffle/reset APIs), with usage counts, shared designs, independent live sources, source diagnostics and dependency-aware deletion.
- **Operator Mode Control Room (`/operator.html`)**: Added 8 new Live Board card types (**Bingo Stamp Card**, **Meter & Gauge Controls**, **News Ticker Feed**, **Versus Match Score**, **Active Poll Controls**, **Trivia Controls**, **Session Runbook / Cues**, and collapsible zero-idle **Display Mini-Monitor**), **Touch / Tablet Density** mode (44px tap targets), one-click **Quick Preset Pill Bar** with `1`–`9` keyboard shortcuts, 7-second **Undo Toast** for destructive/quick actions, and a collapsible **Live Activity Log** drawer.
- **Select & Tags Variable Types**: Added `select` (preset options with optional color + icon per choice, automatic `_color`/`_icon`/`_value` tokens, `/next` & `/prev` cycling) and `tags` (multi-select color/icon chips with `_count` token and `/toggle` & `/clear` endpoints) across standalone Variables, Variable Sets, Variables Studio, and Operator Mode; added Variable Set `counter`/`number` field `min`/`max`/`step` caps, inline Operator table steppers, one-click column Reset, active slot toggle-to-clear, and Companion-friendly `GET`/`POST` entry step/set/column reset triggers.
- **Linked Variable Sets**: Ordered entry links, readable linked placeholders, guarded live edits, dependency-aware deletion and per-owner item trackers with upgrade labels and images.
- **Temporal Variables**: Standalone Date, Time, Date & Time, and Duration values with inline editing, inspector controls and type filters.
- **Variable Groups & Fonts**: Renamable groups with group-qualified placeholders, drag-and-drop membership, JSON import/export, inline editing, bookmarkable links and live font bindings; reusable Badge/Strip builders with uniformly scaled previews.
- **Number Variables**: Bounds, steps, precision, explicit resets, counter controls, independently formatted Text placeholders, live numeric style bindings, and a laptop-friendly grouped Variables Studio with inline editing and a shared inspector.
- **Variables & Variable Sets**: Typed live values, slotless/multi-slot rosters, named slots, queues, rotation, group formatting, lazy **Direct Item Placeholders** (`{{var.<set>.1.<field>}}`, `.all.<n>`, stable `{{var.<set>.<slug>.<field>}}`, `.count`/`.total` with interactive token builder and Placeholder Picker support), inline icons/color bindings, JSON/CSV import/export, Companion controls, and Variable Settings (`var:<key>|<fallback>`) across all URL Wizards and Studio Theming Builders.
- **Custom Overlay Styling & Presets**: Composable 31 frame border styles (`solid`..`outset`, `neon-tube`, `double-ring`, `corner-brackets`, `tech-hud`, `chamfer`, `notched`, `crosshair`, `hazard`, `chevron-track`, `scallop-stamp`, `ornate-filigree`, `pixel-arcade`, `film-sprocket`, `marquee-bulbs`, `viewfinder-ticks`, `circuit-trace`, `art-deco`, `rivet-plate`, `braid-weave`, `zigzag`, `sine-wave`, `sketch-ink`, `segmented-bars`) compatible with border gradients and all 17 animated border modes, per-corner border radiuses (`borderRadiusCorners`), box/text shadow quick-chips, explicit **Middle color stop (optional)** toggle on 3-stop gradients, `X`/`Y` text shadow offsets, italic & tabular-numeral typography toggles, pure-motion whole-block / per-word / per-character text animations (with `Loop continuously` or `Once on load` playback + configurable start delay) honoring `.sp-fx-paused` and `prefers-reduced-motion`, element-specific sections prioritized at the top of the **Style** tab, and built-in plus saved Element **Style Presets** (`/api/custom-overlays/style-presets`, persisted in `data/style-presets.json`).
- **Custom Overlay Text Cycling**: Added `cycle` options (`fade`, `slide-up`, `flip`, `none`, configurable hold & transition duration) to Text elements so multi-line templates automatically rotate and skip lines whose placeholders resolve to empty.
- **Analytics**: Period comparisons, activity heatmaps, milestone estimates, and remembered views and date ranges.
- **Community insights**: Optional viewer history, Twitch follow dates, and configurable welcome-back and personal milestone chat messages.
- **Trivia Leaderboard**: Dual session and persistent season player standings (points, correct count, accuracy, streaks, optional speed bonus), standalone `/overlays/trivia-leaderboard.html` overlay with Reset to Defaults, `!triviastats`/`!triviatop` chat commands, leaderboard & question bank JSON/CSV export and import, and `trivia.leader.*` placeholders.
- **OBS Border Studio (Beta / Advanced) (`/tools/obs-borders.html`)**: Metal-compatible single-pass OBS Lua effect filter (`streampulse-borders.lua`) organized into a 4-tab Hybrid Inspector (`Shape & Fit`, `Border Layers`, `Shadow & FX`, `Standby Fill`) with auto-collapsed disabled rings/effects, Preview Backdrop chips (`Checker`/`Light`/`Dark`), and preview clock Pause/Restart + Synced status bar, live `manifest.json` hot-reloading, true outset canvas expansion, **OBS Transform Auto-Align** (`Pin Outer Border Edge` or `Pin Inner Content Box`), dual inner + outer borders with 2–8 stop custom palettes (Smooth/Stepped, Linear/Perimeter), 45° mitered 3D outset/inset bevels, **Icon Borders** (Font Awesome + Asset Library images, drag-and-drop reorder, clickable Corner/Edge role pills, Pinned Corners & Scrolling Edges modes, per-asset Mono + Contrast, independent 8-stop palette, 7 GPU blend modes including Punchout, and dedicated Icon Motion), per-corner radii, outer glow, independent 4-mode Drop Shadow (`Soft Drop`, `Hard Offset`, `Layered Elevation`, `Inner Shadow` with Multiply blend), 17 universal GPU animations, Variable Settings bindings, OBS Scene Collection JSON importer, per-scene Include/Exclude rules, and Companion triggers.

### Changed
- **Versus Studio (`/versus.html`)**: Fixed unclosed `#panel-overlays` nesting (restoring Saved Presets & History tabs), deduplicated the Overlays inspector & context-filtered preview viewports, added 3 broadcast themes (`Broadcast Sports Ticker`, `Retro Arcade`, `Minimal Transparent HUD`) with visual theme swatches, Event Theme Sync, and Saved Looks, added Match & Race keyboard shortcuts + 20-step Undo, actionable Win Target Met controls, collapsed Rounds-Off layout, recent player roster autocomplete, Fight Card drag-and-drop, lazy mini-preview, Bracket Shuffle Seeds + CSV/JSON import + live seed/BYE preview, one-click Create Promo handoff, and centralized styling in `public/css/versus.css`.
- **Media Blurred Backdrop Fill (`contain-blur`)**: Added **Contain + Blurred Fill (uncropped)** fit mode with Backdrop Blur, Dim, Zoom, and Foreground Shadow controls across Promo Creator (Image elements & background images) and Custom Overlay Studio / Overlays (Image, local Video, and Slideshow layers), inheriting matching Exposure/Duotone/Tint filters onto the blurred backdrop.
- **Promo Creator (`/promo-creator.html`)**: Unified all 31 background patterns onto the shared `StreamPulsePatterns` engine (exposing **Fill style** Translucent Tint / Solid Color / Wireframe Outlines Only, 22 curated palettes, line width, density, spacing, scatter, size variance, color layout/animation, spin, and falling cascade motion) and added collapsible **Color & Exposure** (`Brightness`, `Contrast`, `Saturation`, `Grayscale`, `Blur`) and **Tint, Duotone & Grain** effect drawers for both backgrounds and Image elements across live preview, PNG export, and 6-second MP4 loops.
- **Asset pickers**: Shared name/tag/caption search, tag filters and recent/name sorting across library selectors, with remembered preferences.
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
- **Timers**: Restore countdown completion processing and prevent standalone overlay startup and duplicate update loops.
- **Session lifecycle**: Resume the original offline grace period after a restart instead of leaving the finished session active.
- **Overlay rendering**: Cull off-screen stars, cache particle seeds, reduce grain/radial-border repainting and pause hidden-tab effects.
- **Poll element**: Labels and help now identify native StreamPulse and Twitch polls, with native voting/results taking priority.
- **Overlay editor**: Expose Placeholder / Variable image sources with an image-only picker; keep color pickers open during slider adjustments and refresh dependent controls.
- **Analytics CRM**: Prevent `td .sub` from stretching `.tag-badge.sub` subscriber pills full-width.
- **Overlay control**: Separate Pages, Media (videos/slideshows/cutouts), and Speakers into standard `.tabs-nav` tabs with `#pages`/`#media`/`#speakers` deep links and count pills, clean up the Speakers panel, list trigger/event pages below rotation pages, and remove the full app nav bar.
- **Sessions**: Record native Twitch subscriptions and keep title/category history live-only.
- **Trivia overlays**: Respect boxed styles and keep enabled hints at zero, never with voting off.
- **Subscription alerts**: Select Prime from Twitch/SSN announcements, deduplicate delayed notifications, and preserve native gift counts and anonymous attribution.
- **Windows builds**: Prevent embedded startup from opening an authorization browser and hanging desktop validation.
- **Trivia**: Chat-voting silence, saved sound/blur/collapse controls, live-edit preservation, question ordering/tracking, auto-advance, and Companion state mapping.
- **Subathon**: Preserve omitted donation settings during rule edits and update idle overlays when timed boosts expire.
- **Tier List**: Apply appearance and viewport changes to the live preview without reloading it.
- **Credits**: Display the formatted donation total (`$XX.XX`) from `stats.donations[name].amounts` instead of `(×1)` count when the Donators section uses the `stats` (Last N days) source.

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
