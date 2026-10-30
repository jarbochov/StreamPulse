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

### What the Dashboard Memory Figure Means

**Node RSS** is resident memory for the backend process: JavaScript heap, native allocations, buffers, and other resident pages. **JS heap** shows used / allocated V8 heap separately. Neither measures Safari, OBS browser sources, or GPU memory. Values are displayed in binary megabytes (MiB), labelled MB in the dashboard. A 200 MB RSS reading alone does not prove a leak; garbage collection can release objects without the allocator immediately returning those pages to the OS.

Compare readings over similar idle/active cycles and check whether used heap keeps increasing after workload and retained history stabilize. Tournament votes update poll state and broadcast brackets, so temporary allocations are expected, but the tournament being active does not establish the cause of a particular spike. Keep session/lifetime data intact when investigating; do not reset a running tournament just to lower the number.

The backend avoids retaining duplicate serialized chat/statistics snapshots, bounds slow WebSocket queues and slideshow reports, expires dead peers, and bounds transient alert deduplication. Existing protections include a 2,000-message in-memory chat-log tail, 5,000 recent-chatter records, capped poll/tournament histories, compact archive summaries, and bounded backup workers. These are not a fixed total-memory budget: lifetime statistics, archive summaries, and large media/export operations can still need substantial RAM.

Live API responses use `no-store`; static files support ETag revalidation and media range streaming instead of adding an in-memory file cache. Browser HTTP caching policy does not by itself control retained DOM, decoded images, video frames, GPU resources, or JavaScript objects. Those require browser-side lifecycle cleanup and inspection in Safari's developer tools.

Tournament overlays now keep unchanged cards/connectors in place instead of rebuilding them for countdown pushes, and Poll Manager avoids choice-node rebuilds, preference writes, and bracket requests for unchanged countdown updates. Navigation closes tournament/shared visibility sockets and cancels pending work; returning restores those connections. Production tournament sources still receive live vote updates when the browser reports them hidden.

For Safari, compare Web Inspector timelines/JavaScript allocations and macOS Activity Monitor readings for the relevant Web Content process separately from backend RSS. A decoded 4K image, several video frames, or a large composited canvas can consume far more memory than its compressed file. Prefer appropriately sized source media and close unused editor/preview tabs. Do not disable live data or indiscriminately clear caches to hide a growing-memory symptom.

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
