# SocialStream Ninja Integration Guide

[SocialStream Ninja](https://socialstream.ninja/) (SSN) by Steve Seguin is a powerful, free application and browser extension that captures live chat messages, alerts, tips, and viewer engagement across multiple streaming platforms (Twitch, YouTube, Kick, Discord, TikTok, and more) and provides a secure local WebSocket and HTTP API.

StreamPulse reads chat and supported events from SocialStream Ninja and stores its session records locally. The connection can use SSN's public relay or your own local API endpoint; use a local endpoint if you want to avoid sending that connection through the relay.

### What StreamPulse adds

SocialStream Ninja already offers unified chat, chat overlays, and featured messages. StreamPulse is a companion to those tools, adding show planning, custom layouts, timers, goals, randomizers, alerts, closing credits, session history, community notes, and Twitch analytics.

StreamPulse currently focuses on Twitch. SSN's broader platform support does not imply equivalent StreamPulse account integrations or feature coverage. For overlapping features, choose which app should handle alerts or bot replies to avoid duplicates. See the [feature overview](features.md).

---

## 1. What SocialStream Ninja Provides to StreamPulse

When SocialStream Ninja is active and connected, StreamPulse automatically receives:
- **Live Chat Stream**: Real-time chat messages, sender badges (Broadcaster, Mod, VIP, Subscriber), custom platform emotes, and reply threads.
- **Engagement Events**: Bits cheered, channel subscriptions, gifted subscriptions, raids led, and third-party tips/donations.
- **Viewer Counts**: Live viewer-count packets across platforms, used as a fast, resilient fallback when Twitch API rate limits or delays occur.
- **Hashtags & Highlight Triggers**: Dynamic community hashtags (`#hype`, `#clutch`) and highlight pins.

---

## 2. Choosing Your SocialStream Setup Method

SocialStream Ninja can run in three different configurations depending on your stream workflow:

<!-- tabs:start -->

#### **Option A: Standalone Desktop App (Recommended)**

The [SocialStream Ninja Desktop App](https://github.com/steveseguin/social-stream-desktop) is an open-source standalone Electron application available for macOS and Windows.

- **Advantage**: Runs independently in the background—no browser extensions to install, no risk of browsers sleeping inactive background tabs, and zero impact on your primary web browsing.
- **Setup**:
  1. Download the latest installer for macOS or Windows from [SocialStream Ninja Desktop Releases](https://github.com/steveseguin/social-stream-desktop/releases) or [socialstream.ninja](https://socialstream.ninja/).
  2. Launch the application and log into your streaming platforms (Twitch, YouTube, Kick).
  3. The desktop app automatically enables the local WebSocket server on `ws://127.0.0.1:8080`.

#### **Option B: Web Browser Extension**

The classic SocialStream Ninja extension runs directly inside Chrome, Edge, Brave, Opera, or Firefox.

- **Advantage**: Fast setup without downloading an external program.
- **Setup**:
  1. Install the extension from [socialstream.ninja](https://socialstream.ninja/) or the [Chrome Web Store](https://chromewebstore.google.com/).
  2. Open your live stream chat tabs in that browser (e.g., your Twitch stream manager or YouTube Live Studio).
  3. Click the extension toolbar icon and verify that the local API is enabled on port `8080`.

#### **Option C: OBS Custom Browser Dock**

SocialStream Ninja can be embedded directly inside OBS Studio as a native dock window.

- **Advantage**: Starts and closes automatically alongside OBS Studio.
- **Setup**:
  1. In OBS Studio, go to **Docks** -> **Custom Browser Docks...**.
  2. Enter Dock Name: `SocialStream Ninja`.
  3. Enter URL: `https://socialstream.ninja/dock.html` (or your local/extension dock URL).
  4. Click **Apply** and dock the window into your OBS workspace.

<!-- tabs:end -->

---

## 3. Connecting StreamPulse to SocialStream

Once SocialStream Ninja is running (via desktop app, browser extension, or OBS dock):

1. Open StreamPulse in your browser at `http://localhost:3000` (or inside the StreamPulse Desktop App).
2. Navigate to **System -> Config Editor** (`/config-editor.html`) and select the **Connection & Security** tab.
3. Under **Credentials & Polling Intervals**, enter your actual **SocialStream session ID**. Use the session value from your SSN setup (for example, the `session` parameter in the dock URL). It is required by StreamPulse for both local and relay connections; it is a room identifier, not proof of authentication.
4. Check the read-only **SocialStream Server** value. To change the endpoint, edit `ssn.server` in `config.json` to match your SSN setup. The supplied example uses `wss://io.socialstream.ninja`; a local API server commonly uses `ws://127.0.0.1:8080`.
5. Click **Save Config** and restart StreamPulse when prompted to apply connection changes.

`YOUR_SSN_SESSION_ID` is an example, not a usable session ID. StreamPulse does not connect using it. A blank ID disables chat collection and shows **Not configured** on the dashboard; you can clear the ID in Config Editor to disable collection after restarting.

---

## 4. Verifying Connection & Health Check

1. Return to the StreamPulse **Dashboard** (`/dashboard.html`).
2. Check the **Health** panel at the top:
   - The **SocialStream Ninja** status badge will display **Connected** with a green indicator.
3. Send a test chat message in your streaming platform's chat window.
4. Verify that the message count and Active Chatters update on the StreamPulse dashboard.

**Connected** means the WebSocket is open, not that SSN has authenticated the room or received chat. A relay can accept an arbitrary room name. Always verify a real message arrives in StreamPulse.

---

## 5. Best Practices & Stream Setup

- **Desktop App Reliability**: Using the standalone SocialStream Ninja desktop app is the most reliable method for multi-hour streams because operating systems prioritize native windows over background browser tabs.
- **Disable Tab Discarding (If using Extension)**: If running via browser extension, add your stream chat tabs and SocialStream Ninja to your browser's performance exception list so the browser does not discard them to save RAM.
- **Local Loopback Security**: The `ws://127.0.0.1:8080` connection remains entirely within your local machine; your chat stream and viewer data are never routed through public third-party servers.

---

## 6. Troubleshooting

### Status Displays "Disconnected" or "Reconnecting"
1. **Verify SSN is Running**: Ensure either the SocialStream Ninja desktop app, browser extension, or OBS dock is open and running.
2. **Port Conflict**: Ensure no other application (such as an alternate local proxy or dev server) is occupying port `8080`. You can configure a custom port in SSN and update the URL in StreamPulse's Config Editor.
3. **Firewall / Localhost**: Ensure local loopback connections (`127.0.0.1`) are permitted by your operating system firewall.

### Chat Messages Appear but Alerts Do Not Fire
- Verify that the specific event type (e.g. Bits, Raids) is enabled under **Tools -> Alerts** (`/alerts.html`) and that the corresponding rule is toggled **Active**.
