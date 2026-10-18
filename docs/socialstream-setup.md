# SocialStream Ninja Integration Guide

[SocialStream Ninja](https://socialstream.ninja/) (SSN) is a powerful, free browser extension that captures live chat messages, alerts, tips, and viewer engagement across multiple streaming platforms (Twitch, YouTube, Kick, Discord, and more) and provides a secure local WebSocket and HTTP API.

StreamPulse integrates directly with SocialStream Ninja to ingest real-time stream activity without relying on third-party cloud aggregators or storing your credentials on external servers.

---

## 1. What SocialStream Ninja Provides to StreamPulse

When SocialStream Ninja is active and connected, StreamPulse automatically receives:
- **Live Chat Stream**: Real-time chat messages, sender badges (Broadcaster, Mod, VIP, Subscriber), custom platform emotes, and reply threads.
- **Engagement Events**: Bits cheered, channel subscriptions, gifted subscriptions, raids led, and third-party tips/donations.
- **Viewer Counts**: Live viewer-count packets across platforms, used as a fast, resilient fallback when Twitch API rate limits or delays occur.
- **Hashtags & Highlight Triggers**: Dynamic community hashtags (`#hype`, `#clutch`) and highlight pins.

---

## 2. Installation & Setup Walkthrough

### Step 1: Install the SocialStream Ninja Extension
1. Open your Chromium-based browser (Chrome, Brave, Edge, Opera) or Firefox.
2. Visit [socialstream.ninja](https://socialstream.ninja/) or search for **SocialStream.ninja** in the [Chrome Web Store](https://chromewebstore.google.com/).
3. Click **Add to Chrome** (or your browser's extension store equivalent).

### Step 2: Configure SocialStream Ninja
1. Click the SocialStream Ninja extension icon in your browser toolbar to open the extension dashboard.
2. In the top toolbar of the extension, locate the **Dock / API** settings.
3. Enable the **Local API / WebSocket server** in SocialStream Ninja (enabled by default).
4. SocialStream Ninja typically runs on port `8080` or provides an API bridge URL, such as:
   ```text
   ws://127.0.0.1:8080
   ```
   or provides an HTTPS/WSS session link if you are running it through an OBS dock or remote session.

### Step 3: Connect StreamPulse to SocialStream
1. Open StreamPulse in your browser at `http://localhost:3000`.
2. Navigate to **System -> Config Editor** (`/config-editor.html`) and select the **Connection & Security** tab.
3. Locate the **SocialStream Ninja (SSN)** section:
   - **SSN WebSocket URL**: Enter your SSN endpoint (default: `ws://127.0.0.1:8080`, or your custom SSN dock session address).
   - **Session Key / ID** (optional): If your SSN instance requires an authentication token or session key, enter it here.
4. Click **Save Config**. StreamPulse immediately connects to SocialStream Ninja in the background.

### Step 4: Verify Connection
1. Return to the StreamPulse **Dashboard** (`/dashboard.html`).
2. Check the **System Status** bar at the top:
   - The **SocialStream Ninja** status badge will display **Connected** with a green status indicator.
3. Send a test chat message in your streaming platform's chat window.
4. Verify that the message count and chat velocity update live on the StreamPulse dashboard.

---

## 3. Best Practices & Stream Setup

- **Keep the Chat Tab Open**: SocialStream Ninja reads chat directly from your open chat tabs or OBS docks. Ensure your chat popout or broadcast dashboard remains open during the stream.
- **Avoid Sleeping Tabs**: Modern browsers automatically discard background tabs to save RAM. In your browser's performance settings, add your stream chat URL and SocialStream Ninja to the **"Always keep these sites active"** list.
- **OBS Dock Integration**: You can add SocialStream Ninja directly as a custom OBS Browser Dock (`Docks -> Custom Browser Docks...`) inside OBS Studio so it opens automatically whenever OBS is running.

---

## 4. Troubleshooting

### Status Displays "Disconnected" or "Reconnecting"
1. **Check SSN Extension Status**: Open the extension popup in your browser and verify that the extension toggle is **ON**.
2. **Port Conflict**: Ensure no other application (such as an alternate local proxy or dev server) is occupying port `8080`. You can configure a custom port in SSN and update the URL in StreamPulse's Config Editor.
3. **Firewall / Localhost**: Ensure local loopback connections (`127.0.0.1`) are permitted by your operating system firewall.

### Chat Messages Appear but Alerts Do Not Fire
- Verify that the specific event type (e.g. Bits, Raids) is enabled under **Tools -> Alerts** (`/alerts.html`) and that the corresponding rule is toggled **Active**.
