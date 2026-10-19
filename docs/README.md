# StreamPulse Documentation

[![Release](https://img.shields.io/badge/Release-v0.12.0-indigo.svg)](https://github.com/jarbochov/StreamPulse/releases)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue.svg)](desktop-app.md)
[![Architecture](https://img.shields.io/badge/Architecture-Self--Hosted%20%26%20Local--First-emerald.svg)](architecture.md)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/jarbochov/StreamPulse/blob/main/LICENSE)
[![Companion](https://img.shields.io/badge/Bitfocus%20Companion-32--Key%20Ready-purple.svg)](companion.md)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20StreamPulse-ff5e5b.svg?logo=kofi&logoColor=white)](https://ko-fi.com/jarbochov)

Welcome to the official documentation for **StreamPulse**, the ultimate self-hosted broadcast companion and overlay suite for [SocialStream Ninja](https://socialstream.ninja/) and Twitch.

StreamPulse turns your live broadcast data into cinematic OBS browser overlays, actionable community analytics, and hands-on production tools with low CPU overhead and zero cloud lock-in.

---

## What is StreamPulse?

StreamPulse is a lightweight, self-hosted companion that runs quietly on your computer while you stream:

- **100% Free & Private**: No monthly subscription fees, no third-party tracking, and no cloud servers holding your stream data. Everything lives locally in simple files on your computer.
- **Decentralized Multi-Platform Power**: Pairs natively with SocialStream Ninja to ingest Twitch, YouTube, Kick, and Discord chat into one unified stream engine.
- **Cinematic Broadcast Overlays**: Instant OBS browser sources for movie-style scrolling end credits, spinning choice randomizers, game plan broadcast schedules, community goal meters, and retro CRT animated borders.
- **Obsessively Low Overhead**: Uses negligible CPU and RAM so your computer can focus all its power on gaming and video encoding without dropped frames.

> [!NOTE]
> **100% Self-Made & Independently Funded**
> StreamPulse is completely self-made, open-source, and privately maintained without corporate sponsors, subscriptions, or telemetry. If StreamPulse enhances your live stream production, consider supporting ongoing development on [Ko-fi](https://ko-fi.com/jarbochov).

---

## Production Studios & Overlays

<div class="feature-grid">
  <a class="feature-card" href="#/custom-overlays">
    <h4>Custom Overlay Studio</h4>
    <p>Visual drag-and-drop layer builder, transparent WebKit punchout masks, WebGL retro display shaders (CRT, scanlines, TV static), GPU media filters, and animated sweep borders.</p>
  </a>
  <a class="feature-card" href="#/credits-guide">
    <h4>Cinematic Credits Studio</h4>
    <p>Post-stream scrolling credits with customizable sections, static fade cards, Special Thanks spotlights, and synchronized outro music timing.</p>
  </a>
  <a class="feature-card" href="#/randomizer-guide">
    <h4>Choice Randomizer Studio</h4>
    <p>Decoupled studio controller and transparent OBS overlay with spinning wheels, continuous slot rollers, winner celebration cards, audio cues, and active chatter auto-population.</p>
  </a>
  <a class="feature-card" href="#/game-plan-guide">
    <h4>Game Plan Broadcast Scheduler</h4>
    <p>Interactive calendar views, 14-day schedule strips, IGDB game catalog integration with cover art, and dedicated OBS overlays.</p>
  </a>
  <a class="feature-card" href="#/community-guide">
    <h4>Community Directory & Dossiers</h4>
    <p>Streamer-focused CRM with smart segments (Regulars, VIPs, Lapsed, Newcomers), private streamer notes, pronouns, chatter dossiers, and CSV roster exports.</p>
  </a>
  <a class="feature-card" href="#/alerts-guide">
    <h4>Alerts & Alert Queue Dock</h4>
    <p>Event rules engine, audio synthesis, media uploads, and the low-density OBS dock with unmatched event filtering and one-click replay.</p>
  </a>
  <a class="feature-card" href="#/chatbot-guide">
    <h4>Integrated Chat Bot</h4>
    <p>Automated chat commands, aliases, user cooldowns, timed periodic messages, quotes database, dynamic variables, and silent webhooks.</p>
  </a>
  <a class="feature-card" href="#/companion">
    <h4>Bitfocus Companion & Stream Deck</h4>
    <p>Pre-configured 32-key page layout, hardware button actions, live stream feedbacks, dynamic variables, and tactile control.</p>
  </a>
  <a class="feature-card" href="#/desktop-app">
    <h4>Desktop App (Electron) & Roadmap</h4>
    <p>Standalone native application for macOS and Windows with system tray controls, background service management, and zero terminal setup.</p>
  </a>
</div>

---

## OBS Browser Source Quick Reference

All StreamPulse overlays run as transparent, GPU-accelerated OBS browser sources connected to your local server:

| Overlay Name | Local OBS Source URL | Default Resolution | Recommended Settings |
| --- | --- | --- | --- |
| **Credits Roll** | `http://localhost:3000/overlays/credits.html` | 1920 x 1080 | Shutdown source when not visible; Control audio via OBS |
| **Choice Randomizer** | `http://localhost:3000/overlays/randomizer.html` | 1920 x 1080 | Refresh browser when scene becomes active |
| **Custom Overlays** | `http://localhost:3000/overlays/custom-overlay.html?id=<id>` | 1920 x 1080 | Enable transparent punchouts; Hardware acceleration on |
| **Game Plan Ticker** | `http://localhost:3000/overlays/game-plan.html?view=ticker` | 1920 x 180 | Transparent background; CSS container queries enabled |
| **Game Plan Schedule** | `http://localhost:3000/overlays/game-plan.html?mode=schedule` | 1280 x 540 | Responsive card layout; Auto-scroll upcoming games |
| **Game Plan Checklist** | `http://localhost:3000/overlays/game-plan.html?mode=checklist` | 480 x 680 | Compact sidebar checklist; Live playing indicator |
| **Community Goals** | `http://localhost:3000/overlays/goal.html` | 600 x 140 | Custom styling via overlay URL query parameters |
| **Now Playing Music** | `http://localhost:3000/overlays/music.html` | 500 x 100 | Syncs with Snip, Spotify local, Apple Music, or VLC |
| **Alert Queue Dock** | `http://localhost:3000/tools/alert-queue.html` | 380 x 600 | Custom OBS Browser Dock; Persistent login |

---

## Visual Feature Showcase

### Game Plan Broadcast Scheduler & Overlays
Interactive broadcast scheduler with IGDB game catalog metadata, 14-day schedule strips, and calendar views:

![Game Plan Studio](images/game-plan-studio.png)

#### Dedicated OBS Broadcast Overlays
Display your active playthrough and upcoming lineup with responsive box art scaling, countdown clocks, and custom tags:

![Game Plan Ticker Bar](images/game-plan-overlay-ticker.png)

![Game Plan Vertical Schedule](images/game-plan-overlay-schedule.png)

---

### Cinematic Credits Studio & Outro Roll
Celebrate every single supporter by name with a cinematic, Hollywood-style end credits roll:

![Cinematic Credits Roll](images/overview-credits-roll.png)

![Credits Studio](images/credits-studio.png)

---

### Live Stream Chat History & Searchable Archive
Full session chat logging and viewer activity metrics stored locally in high-performance JSONL archives:

![Session Chat History](images/overview-chat-log.png)

---

### Custom Overlay Studio
Transparent WebKit punchout masks, WebGL retro display shaders (CRT scanlines, aperture grille, TV static snow), GPU filters, and animated sweep borders:

![Custom Overlay Studio](images/custom-overlay-studio.png)

---

### Choice Randomizer Studio & Overlay
Decoupled studio controller with choice weighting, winner elimination, and sound synthesis—paired with a glassmorphic OBS transparent stage:

![Choice Randomizer Studio](images/randomizer-studio.png)

![Choice Randomizer OBS Overlay](images/randomizer-overlay.png)

---

### Community Directory & Viewer Dossiers
Streamer-focused community management with high-level analytics cards, private streamer notes, pronouns, and smart roster segments with 1-click CSV export:

![Community Directory](images/community-directory.png)

![Chatter Dossier](images/chatter-dossier.png)

---

### Live Stream Command Center & Alert Queue Dock
Real-time message volume charts, session stream timers, Twitch connection status, and low-density OBS browser dock:

![Dashboard Overview](images/dashboard.png)

![Alert Queue](images/alert-queue.png)

---

## System Architecture

StreamPulse runs as a local-first service connecting stream data sources to your broadcast software and hardware controllers:

```mermaid
flowchart TD
    subgraph DataSources["Data Sources"]
        SSN["SocialStream Ninja (WebSocket :8080)"]
        Twitch["Twitch Helix API (Polls, Tokens)"]
    end

    subgraph Host["StreamPulse Host (Port 3000)"]
        Router["Static File Router (Cascading Resolver)"]
        Services["Domain Services (CRM, Alerts, Goals, Music)"]
        WS["WebSocket Server (Event Broadcasts)"]
        Atomic["Atomic Data Storage (JSON/JSONL)"]
    end

    subgraph Outputs["Production Outputs"]
        OBS["OBS Studio (Transparent Browser Sources)"]
        Companion["Bitfocus Companion (Stream Deck Controls)"]
        Docks["OBS Browser Docks (Alert Queue, Chat)"]
    end

    SSN --> Services
    Twitch --> Services
    Services --> Atomic
    Services --> WS
    WS --> OBS
    WS --> Docks
    Router --> OBS
    Router --> Docks
    Companion -->|"REST API & WS"| Services
    Services -->|"State Updates"| Companion
```

---

## Inspiration & Acknowledgements

StreamPulse is built on the shoulders of giants and inspired by the open streaming ecosystem:

- **Steve Seguin & [SocialStream Ninja](https://socialstream.ninja/)**: Steve Seguin's visionary work on SocialStream Ninja proved that live stream tooling can be decentralized, community-driven, and completely independent of proprietary cloud platforms. StreamPulse exists because SocialStream Ninja made open, multi-platform chat ingestion accessible to everyone.
- **The Cinematic End-Credits Tradition**: Inspired by the movie and television tradition of scrolling end credits, where every person who contributed to the experience is honored by name before the lights come up.
- **[OBS Studio](https://obsproject.com/)**: The undisputed cornerstone of open-source video production and broadcasting.
- **[Bitfocus Companion](https://bitfocus.io/companion)**: The incredible open-source tactile control ecosystem powering broadcast studios and Stream Decks worldwide.
- **[Twitch Developer Platform](https://dev.twitch.tv/) & [IGDB](https://www.igdb.com/)**: For developer APIs and video game catalog metadata.

---

## Getting Started Guides

- **[Quick Start Guide](quickstart.md)**: Set up Node.js, clone the repository, and connect your first OBS browser source in under 5 minutes.
- **[SocialStream Ninja Setup Guide](socialstream-setup.md)**: Step-by-step walkthrough for installing the free SocialStream desktop app or browser extension, configuring the WebSocket API on port 8080, and verifying message flow.
- **[Bitfocus Companion & Stream Deck](companion.md)**: Import the StreamPulse Companion profile for instant tactile control over randomizer spins, credits rolls, alerts, and timers.

---

## Technical & Architecture Documentation

- **[Desktop App & Roadmap](desktop-app.md)**: Deep dive into the Electron desktop architecture, process supervision, system tray menus, and GitHub Actions multi-platform packaging.
- **[Architecture & Routing](architecture.md)**: Technical breakdown of the cascading static router, modular service architecture, WebSocket broadcast pipeline, and atomic data persistence.
- **[HTTP API & WebSocket Reference](api-reference.md)**: Complete developer documentation for all REST endpoints, WebSocket message protocols, and payload schemas.
- **[Developer & Contributor Guide](developer-guide.md)**: Codebase setup, running the test pipeline (`npm test`), ESLint configuration, and strict No-Emoji design system guidelines.
- **[Server Management & Backups](server-management.md)**: Service supervisor configuration, atomic data directory backups, and headless deployment on Linux servers.
- **[Troubleshooting & FAQ](troubleshooting.md)**: Practical solutions for port conflicts, OBS browser source audio autoplay policies, background tab throttling, and PDF report exports.

---

## Community Support & Funding

StreamPulse is 100% self-made, open-source, and privately self-funded. There are no corporate sponsors, paywalled features, investor boards, or monetization subscriptions.

If StreamPulse brings value to your stream, helps celebrate your community, or saves you subscription costs from commercial alert tools, you can support continuous development, hosting, and hardware testing on Ko-fi:

<a href="https://ko-fi.com/jarbochov" target="_blank" rel="noopener noreferrer">
  <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support StreamPulse on Ko-fi" />
</a>

---

## License

StreamPulse is open-source software licensed under the [MIT License](https://github.com/jarbochov/StreamPulse/blob/main/LICENSE).
