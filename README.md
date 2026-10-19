[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Z8Z11UEY5Q)
[![Documentation](https://img.shields.io/badge/Documentation-GitHub%20Pages-blue.svg)](https://jarbochov.github.io/StreamPulse/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/jarbochov/StreamPulse/releases)

# StreamPulse

**The ultimate self-hosted broadcast companion and overlay suite for [SocialStream Ninja](https://socialstream.ninja/) and Twitch.**

StreamPulse turns your live broadcast data into cinematic OBS browser overlays, actionable community analytics, and hands-on production tools. Built from the ground up for low CPU overhead and zero cloud lock-in, StreamPulse bridges multi-platform chat, subscriptions, cheers, raids, and follower milestones directly into your broadcast.

---

## What is StreamPulse?

If you stream on Twitch, YouTube, Kick, or multi-stream across platforms, you've probably noticed that most stream overlay tools rely on expensive monthly subscriptions, slow cloud dashboards, and third-party servers tracking your community's data.

**StreamPulse is different.** It is a free, self-hosted companion that runs quietly on your computer while you stream:

- **100% Free & Private**: No monthly subscription fees, no third-party tracking, and no cloud servers holding your stream data. Everything lives locally in simple files on your computer.
- **Decentralized Multi-Platform Power**: Pairs natively with SocialStream Ninja to ingest Twitch, YouTube, Kick, and Discord chat into one single stream engine.
- **Cinematic Broadcast Overlays**: Instant OBS browser sources for movie-style scrolling end credits, spinning choice randomizers, game plan broadcast schedules, community goal meters, and retro CRT animated borders.
- **Obsessively Low Overhead**: Uses negligible CPU and RAM so your computer can focus all its power on gaming and video encoding without dropped frames.

Whether you're looking for a simple, automated credits roll to thank your community at the end of each stream, or a complete production suite with Stream Deck hardware controls, StreamPulse has you covered.

---

## Visual Showcase & Overlays

### Game Plan Broadcast Scheduler & Dedicated OBS Overlays
Plan your upcoming broadcasts with full month and week calendar views, 14-day quick scheduling strips, and integrated game catalog cover art. Display your lineup directly in OBS using dedicated ticker bars, vertical countdown schedules, and game checklist overlays.

![Game Plan Broadcast Scheduler](docs/images/game-plan-studio.png)

#### Live OBS Broadcast Overlays with Authentic Box Art
Display your active playthrough and upcoming lineup with responsive box art scaling, countdown clocks, and custom tags:

![Game Plan Ticker Bar](docs/images/game-plan-overlay-ticker.png)

![Game Plan Vertical Schedule](docs/images/game-plan-overlay-schedule.png)

---

### Cinematic Credits Studio & Outro Roll
Celebrate every single supporter by name with a cinematic, Hollywood-style end credits roll. Includes customizable Special Thanks cards, music outro timing synchronization, and instant live-roll testing.

![Cinematic Credits Roll](docs/images/overview-credits-roll.png)

![Credits Studio Controller](docs/images/credits-studio.png)

---

### Live Stream Chat History & Searchable Archive
Full session chat logging and viewer activity metrics stored locally in high-performance JSONL archives. Filter messages by wildcards, links, donations, or bit amounts, and export clean transcripts to TSV or PDF.

![Session Chat History](docs/images/overview-chat-log.png)

---

### Custom Overlay Studio & Retro WebGL Shaders
A full drag-and-drop canvas designer featuring transparent WebKit punchout masks, animated sweep borders, GPU media filters, and hardware-accelerated WebGL retro display shaders (CRT scanlines, shadow mask, TV static snow, LCD ghost smear).

![Custom Overlay Studio](docs/images/custom-overlay-studio.png)

---

### Choice Randomizer Studio
Decoupled studio controller and transparent OBS overlay featuring spinning wheels, continuous vertical slot machine rollers, and winner celebration cards with sound effects, choice weighting, and active live chatter auto-population.

![Choice Randomizer Studio](docs/images/randomizer-studio.png)

---

### Community Directory & Viewer Dossiers
Streamer-focused community management with high-level analytics cards, private streamer notes, and smart roster segments (Moderators, VIPs, Regulars active in 3+ streams over 90 days, Lapsed viewers, and Newcomers) with 1-click CSV roster export. Click any member to open their complete dossier with category attendance, tenure, and cheered bits.

![Community Directory](docs/images/community-directory.png)

![Chatter Dossier](docs/images/chatter-dossier.png)

---

### Live Dashboard & Alert Queue Dock
Real-time message volume charts, session stream timers, Twitch connection status, and a low-density Alert Queue dock with background chat filtering ("Hide unmatched") and one-click event replay.

![Dashboard Overview](docs/images/dashboard.png)

![Alert Queue Dock](docs/images/alert-queue.png)

---

## Under the Hood: Technical Architecture

For developers, technical directors, and power users, StreamPulse is engineered with clean, modular primitives:

- **In-Process Engine**: Zero-latency HTTP and WebSocket broadcast engine running on Node.js or embedded directly inside the Electron main process for desktop builds.
- **SocialStream Ninja Ingest**: Native WebSocket client listening to local or remote SSN sessions, extracting chat messages, cheers, subscriptions, gift subs, and raid events in real time.
- **Cascading Static File Routing**: Built-in static router in `server/static-router.js` with cascading path resolution (`public/overlays/`, `public/editors/`, `public/wizards/`, `public/tools/`, `public/library/`, `public/system/`) providing 100% backward compatibility for flat root paths with zero redirect latency.
- **Atomic Local Persistence**: Pure filesystem storage (`data/*.json`, `data/chat-log.jsonl`) with automated hourly backups and ZIP share packages. Zero database server (PostgreSQL/MySQL/MongoDB) required.
- **Hardware-Accelerated WebGL Shaders**: Custom fragment shaders compiled on the GPU for zero-CPU CRT scanline emulation, phosphor bloom, curvature distortion, and LCD pixel response smearing.
- **Bitfocus Companion Integration**: Official Companion module (`companion-module-streampulse`) exposing dynamic stream variables, button feedbacks, and hardware execution for Elgato Stream Deck and web remotes.

---

## Quick Start Guide

### Option A: Standalone Desktop App (macOS & Windows)
1. Download the latest installer from the **[Releases Page](https://github.com/jarbochov/StreamPulse/releases)**:
   - **macOS**: Download `StreamPulse.dmg` or `StreamPulse.zip` (supports Apple Silicon and Intel).
   - **Windows**: Download `StreamPulse-Setup.exe` or portable `.exe`.
2. Launch StreamPulse. The application runs quietly in your system tray or menu bar with one-click access to all studio controllers and OBS overlay links.
3. Open `http://localhost:3000` or use the menu bar icon to access the studio.

### Option B: Self-Hosted Node.js (CLI)
1. Ensure **Node.js** (v22.12 or newer) is installed.
2. Clone and install dependencies:
   ```bash
   git clone https://github.com/jarbochov/StreamPulse.git
   cd StreamPulse
   npm run setup
   # (Select option 1 for fast server-only mode, or run: npm install --omit=dev)
   ```
3. Start the server:
   - **macOS / Linux**: `./start-streampulse.sh` or `npm start`
   - **Windows**: Double-click `start-streampulse.bat` or run `npm start`
4. Open `http://localhost:3000` in your browser.

### Connect to SocialStream Ninja
1. Open SocialStream Ninja in your browser and verify the local API server is active on port `8080`.
2. In StreamPulse, navigate to **System -> Config Editor** (`/config-editor.html`) -> **Connection & Security**.
3. Verify your SSN WebSocket URL (default: `ws://127.0.0.1:8080`) and save.
4. For step-by-step instructions, see the **[SocialStream Ninja Setup Guide](docs/socialstream-setup.md)**.

### Add Overlays to OBS Studio
1. In OBS Studio, add a new **Browser** source to your scene.
2. Set the **URL** to the desired overlay:
   - **Credits Roll**: `http://localhost:3000/overlays/credits.html`
   - **Choice Randomizer**: `http://localhost:3000/overlays/randomizer.html`
   - **Game Plan Ticker**: `http://localhost:3000/overlays/game-plan.html?view=ticker`
   - **Game Plan Schedule**: `http://localhost:3000/overlays/game-plan.html?mode=schedule`
   - **Community Goals**: `http://localhost:3000/overlays/goal.html`
   - **Now Playing Music**: `http://localhost:3000/overlays/music.html`
   - **Custom Overlays**: `http://localhost:3000/overlays/custom-overlay.html?id=<overlay-id>`
3. Set the dimensions (typically `1920` width and `1080` height).
4. Check **Shutdown source when not visible** and click **OK**.

---

## Inspiration & Acknowledgements

StreamPulse is built on the shoulders of giants and inspired by the open streaming ecosystem:

- **Steve Seguin & [SocialStream Ninja](https://socialstream.ninja/)**: Steve Seguin's visionary work on SocialStream Ninja proved that live stream tooling can be decentralized, community-driven, and completely independent of proprietary cloud platforms. StreamPulse exists because SocialStream Ninja made open, multi-platform chat ingestion accessible to everyone.
- **The Cinematic End-Credits Tradition**: Inspired by the movie and television tradition of scrolling end credits, where every person who contributed to the experience is honored by name before the lights come up.
- **[OBS Studio](https://obsproject.com/)**: The undisputed cornerstone of open-source video production and broadcasting.
- **[Bitfocus Companion](https://bitfocus.io/companion)**: The incredible open-source tactile control ecosystem powering broadcast studios and Stream Decks worldwide.
- **[Twitch Developer Platform](https://dev.twitch.tv/) & [IGDB](https://www.igdb.com/)**: For developer APIs and video game catalog metadata.

---

## Documentation Hub

Comprehensive technical guides, API documentation, and hardware configurations are maintained in the `docs/` directory and published on our live **[Documentation Site](https://jarbochov.github.io/StreamPulse/)**:

| Guide | Description |
| --- | --- |
| **[Quick Start Guide](docs/quickstart.md)** | Get up and running with OBS Studio in under 5 minutes. |
| **[SocialStream Ninja Setup](docs/socialstream-setup.md)** | Step-by-step guide for installing, configuring, and verifying SocialStream Ninja. |
| **[Custom Overlays Studio](docs/custom-overlays.md)** | Layer types, WebKit punchout masks, retro WebGL shaders, GPU media filters, and presets. |
| **[Cinematic Credits Studio](docs/credits-guide.md)** | Built-in sections, order customization, Special Thanks cards, and music sync timing. |
| **[Choice Randomizer Studio](docs/randomizer-guide.md)** | Spinning wheels, slot machine rollers, winner celebration cards, audio cues, and active chatter population. |
| **[Game Plan Broadcast Scheduler](docs/game-plan-guide.md)** | Calendar views, IGDB game catalog integration, and dedicated broadcast overlays. |
| **[Community Directory & Dossiers](docs/community-guide.md)** | Member rosters, smart quick-view segments, private streamer notes, and CSV exports. |
| **[Alerts & Alert Queue Dock](docs/alerts-guide.md)** | Event rules, synthesized audio, media uploads, and the low-density OBS queue dock. |
| **[Integrated Chat Bot](docs/chatbot-guide.md)** | Commands, aliases, cooldowns, timed messages, quotes, variables, and silent webhooks. |
| **[Bitfocus Companion & Stream Deck](docs/companion.md)** | Hardware button actions, live stream feedbacks, dynamic variables, and setup instructions. |
| **[Desktop App & Architecture](docs/desktop-app.md)** | Electron desktop wrapper architecture, system tray controls, and automated multi-platform packaging. |
| **[HTTP API & WebSocket Reference](docs/api-reference.md)** | Complete REST API endpoints for session control, randomizer, timers, and WebSocket events. |
| **[Architecture & Technical Overview](docs/architecture.md)** | Cascading static routing, modular services architecture, and atomic persistence. |
| **[Developer & Contributor Guide](docs/developer-guide.md)** | Environment setup, running the test pipeline (`npm test`), and UI/UX design standards. |
| **[Troubleshooting & FAQ](docs/troubleshooting.md)** | Solutions for port conflicts, OBS browser sources, audio autoplay, and background tabs. |

---

## License

StreamPulse is open-source software licensed under the [MIT License](LICENSE).
