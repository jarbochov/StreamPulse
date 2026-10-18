# Streamer Quick Start Guide

Get StreamPulse running and connected to OBS Studio in under five minutes.

---

## 1. Fast Setup

<!-- tabs:start -->

#### **macOS**

1. Ensure **Node.js LTS (v22.12+)** is installed from [nodejs.org](https://nodejs.org/).
2. Clone or download StreamPulse:
   ```bash
   git clone https://github.com/jarbochov/StreamPulse.git
   cd StreamPulse
   npm install
   ```
3. Launch StreamPulse:
   ```bash
   ./start-streampulse.sh
   ```
   *StreamPulse will start on `http://localhost:3000` and automatically open your dashboard.*

#### **Windows**

1. Ensure **Node.js LTS (v22.12+)** is installed from [nodejs.org](https://nodejs.org/).
2. Clone or download StreamPulse:
   ```cmd
   git clone https://github.com/jarbochov/StreamPulse.git
   cd StreamPulse
   npm install
   ```
3. Launch StreamPulse:
   - Double-click **`start-streampulse.bat`** (or run `npm start` in Command Prompt).
   *StreamPulse will start on `http://localhost:3000` and launch in your default browser.*

<!-- tabs:end -->

---

## 2. Connect Your Data Sources

1. **SocialStream Ninja (Live Chat & Multi-Platform Events)**:
   - Install the [SocialStream Ninja](https://socialstream.ninja/) browser extension (Chrome, Firefox, Edge) or download the standalone [SocialStream Ninja Desktop App](https://github.com/steveseguin/social-stream-desktop).
   - Keep SocialStream Ninja open in your browser, running in the background as a desktop app, or docked inside OBS Studio.
   - In StreamPulse, open **Config Editor -> Connection & Security** and verify the SSN WebSocket URL is `ws://127.0.0.1:8080`.
   - See the full [SocialStream Ninja Setup Guide](socialstream-setup.md).
2. **Twitch Account (Broadcaster Sync & Polls)**:
   - Navigate to **System -> Twitch Connect** (`/system/twitch-connect.html`).
   - Click **Connect with Twitch** to authenticate using device code authorization (no developer application required).

---

## 3. Adding Overlays to OBS Studio

Every StreamPulse overlay runs as a local web page optimized for OBS browser sources.

### Standard OBS Browser Source Settings
1. Open **OBS Studio**.
2. In your Scene, click **+ (Add Source)** and select **Browser**.
3. Name the source (e.g., `StreamPulse Credits` or `StreamPulse Randomizer`).
4. Enter the URL:
   - **Credits Roll**: `http://localhost:3000/overlays/credits.html`
   - **Choice Randomizer**: `http://localhost:3000/overlays/randomizer.html`
   - **Game Plan Ticker**: `http://localhost:3000/overlays/game-plan.html`
   - **Community Goals**: `http://localhost:3000/overlays/goal.html`
   - **Now Playing Music**: `http://localhost:3000/overlays/music.html`
   - **Custom Overlays**: `http://localhost:3000/overlays/custom-overlay.html?id=<overlayId>`
5. Set **Width**: `1920` and **Height**: `1080` (or match your canvas resolution).
6. Check **Shutdown source when not visible** (saves CPU when the scene is inactive).
7. Check **Refresh browser when scene becomes active** (optional, recommended for credits).
8. Click **OK**.

---

## 4. Testing Your Overlays

- **Credits Studio**: Open `http://localhost:3000/credits-editor.html` and click **Live Roll** to test your scrolling credits.
- **Randomizer Studio**: Open `http://localhost:3000/randomizer-editor.html` and click **Spin** to test wheel animations and sound effects.
- **Alerts**: Open `http://localhost:3000/alerts.html` and click **Simulate** on any rule to trigger a live test event.
