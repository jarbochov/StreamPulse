# Troubleshooting & Frequently Asked Questions

Solutions to common questions and edge cases when running StreamPulse.

---

## 1. Connection & Data Ingestion

### SocialStream Ninja Status Shows "Disconnected"
- **Verify Extension Status**: Open the SocialStream Ninja extension in your browser and confirm the toggle is **ON**.
- **Port Conflict**: By default, SSN runs its local WebSocket API on port `8080`. If another application uses port `8080`, change the port in SSN settings and update the URL in StreamPulse's **Config Editor -> Connection & Security**.
- **Browser Background Tab Sleep**: Chrome and Edge automatically discard inactive background tabs. Add your streaming chat URL and SocialStream Ninja to your browser's performance exception list (*"Always keep these sites active"*).

### Twitch Token Shows Expired or 401
- Go to **System -> Twitch Connect** (`/system/twitch-connect.html`) and click **Reconnect**.
- StreamPulse automatically refreshes OAuth tokens in the background, but if you change your Twitch account password or revoke access in your Twitch security settings, re-authentication is required.

---

## 2. OBS Studio Overlays

### Overlay Appears Blank or Fails to Load
- Ensure StreamPulse is running locally (`http://localhost:3000`).
- In OBS Studio, right-click your browser source, select **Properties**, and ensure the URL begins with `http://localhost:3000/overlays/...`.
- Click **Refresh cache of current page** at the bottom of the source properties.

### YouTube Embeds or Videos Fail to Autoplay
- WebKit and modern Chromium browsers require audio to be muted or unlocked before autoplay is permitted.
- In StreamPulse, YouTube and HTML5 videos are configured with `playsinline=1` and `mute=1` by default to satisfy browser policies.
- In OBS Studio, check the box **"Control audio via OBS"** in the browser source properties if you want OBS to manage the audio levels directly in your audio mixer.

### Transparent Background Shows Black
- By default, all StreamPulse overlays use a 100% transparent background for OBS.
- If an overlay appears with a black background, open **Theme Editor** (`/theme-editor.html`) and verify that the background color is set to `transparent`.

---

## 3. Performance & Memory Optimization

### Reducing CPU Usage During Long Broadcasts
1. **Shutdown Inactive Sources**: In OBS Studio, check **"Shutdown source when not visible"** on all StreamPulse browser sources. This completely unloads the browser tab when switching away from that scene.
2. **Disable Effects in Background**: The WebGL retro display shaders and motion graphics automatically pause when their visual controls are hidden or toggled off.
3. **Limit Static Assets**: Use modern compressed formats (WebP for images, WebM for transparent videos) in the Asset Library.

---

## 4. PDF Export Says Chrome Could Not Be Found

If exporting chat logs or session summaries to PDF reports that Chrome could not be found:
- Run the following command in your terminal to install Puppeteer's standalone Chrome binary:
  ```bash
  npm run install:chrome
  ```
- Once downloaded, PDF exports will render reliably without requiring a system-wide Google Chrome installation.
