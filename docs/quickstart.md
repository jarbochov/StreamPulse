# Get started with StreamPulse

Set up the desktop app, connect your chat, and bring your first overlay into OBS. You can add more studios later.

You will need **OBS Studio**, the **StreamPulse desktop app**, and **SocialStream Ninja** for chat and supported events. StreamPulse currently focuses on Twitch. SocialStream Ninja handles unified chat, chat overlays, and featured messages; StreamPulse adds production tools and session review alongside it. A Twitch account connection is optional unless you want features that use it.

## 1. Open the desktop app

1. Visit [StreamPulse releases on GitHub](https://github.com/jarbochov/StreamPulse/releases/latest).
2. Read the release notes and download the macOS or Windows app that matches your computer.
3. On macOS, open the disk image and copy StreamPulse to Applications. On Windows, run the installer and follow its prompts.
4. Open StreamPulse. The dashboard is your starting point for connection status, studios, and current session activity.

**The apps are currently unsigned.** macOS or Windows may show a security warning. Only proceed if you trust the release you downloaded from the official repository; do not disable your system's security protections. See [desktop app details](desktop-app.md) and [troubleshooting](troubleshooting.md) if launch is blocked.

You do not need to install Node.js or use a terminal for the packaged desktop app.

**Prefer to run from source or host the server yourself?** Follow the [Developer Guide](developer-guide.md) for installation, then [Server Management](server-management.md) for operation and backups. Return here when your dashboard is open.

## 2. Connect your chat with SocialStream Ninja

SocialStream Ninja gathers chat and supported events from the platforms you use. StreamPulse reads that activity to power chat views, alerts, community records, and credits.

1. Install and open the [SocialStream Ninja desktop app](https://github.com/steveseguin/social-stream-desktop/releases). Connect the chat sources for your streaming platforms.
2. Make sure its local WebSocket server is enabled. For other SocialStream Ninja setups, follow the [connection guide](socialstream-setup.md).
3. In StreamPulse, open **System → Config Editor → Connection & Security**.
4. Enter your actual **SocialStream session ID**. Copy it from your SSN setup (the `session` value in its dock URL), not the example `YOUR_SSN_SESSION_ID`. The endpoint in `config.json` under `ssn.server` must match your SSN setup; see the [connection guide](socialstream-setup.md).
5. Choose **Save Config**, then restart StreamPulse when prompted and return to the dashboard. A blank or example ID leaves SocialStream **Not configured**.
6. Look for a connected SocialStream Ninja status and send a message in your platform's chat. Confirm the dashboard receives the activity.

Keep SocialStream Ninja and the chat sources it needs running while you stream. If activity does not arrive, check the [SocialStream Ninja setup guide](socialstream-setup.md) before moving on.

## 3. Connect Twitch if you use it

For Twitch account features, open **System → Twitch Connect** and choose **Connect with Twitch**. Follow the displayed device-code instructions in your browser, review the requested permissions, and approve the account you intend to use.

Return to StreamPulse and check that it shows the expected account. The standard connection does not require creating your own Twitch developer application.

SocialStream Ninja and Twitch Connect have different roles: connecting your Twitch account does not replace the chat-capture setup above. Available events and actions depend on your connection and permissions.

## 4. Choose your first overlay

Start with one overlay rather than configuring every studio.

- **For a countdown, goal, music display, or schedule:** open **Overlays → URL Wizards**, choose the relevant wizard, and adjust its preview.
- **For a custom scene:** open **Custom Overlay Studio**, create or choose a layout, and preview it.
- **For an outro:** open **Credits Studio**, choose your sections, and preview the credits.

Use the studio or wizard's option to copy the **OBS overlay URL**. This is the display link for OBS, not the address of the editor or a preview-only link. Note the recommended width and height.

For guidance on the choices, see [features](features.md) or the detailed [Overlay URL Wizards guide](overlay-wizards.md).

## 5. Add it to OBS

These steps assume OBS and StreamPulse run on the same computer.

1. In OBS, select the scene where you want the overlay.
2. Under **Sources**, choose **+ → Browser** and give the source a recognizable name.
3. Paste the copied overlay URL into **URL**.
4. Set **Width** and **Height** to the dimensions recommended by the studio or wizard. A full-screen layout commonly matches your OBS canvas, such as `1920 × 1080`; a ticker or timer may be smaller.
5. Confirm the source and position it in your scene. Put it above your gameplay source if it should appear on top.
6. If the overlay plays sound, check OBS's browser-source audio settings and test the levels in a short recording.

Keep StreamPulse running while OBS uses its overlays. If you host it on another computer or change its port, use your actual StreamPulse address instead of the default `localhost:3000` address in copied links.

**Scene switching matters:** “Shutdown source when not visible” unloads the overlay, and “Refresh browser when scene becomes active” reloads it. Leave these off for displays that need to keep running between scenes unless the specific overlay guide recommends otherwise.

## 6. Test before going live

- Send a chat message and check it reaches StreamPulse.
- Switch OBS scenes and confirm the overlay appears where expected.
- Try the control that drives your chosen overlay: start a timer, update a lineup, or use **Live Roll** in Credits Studio.
- If you use alerts, test a rule while off-air and check both its appearance and audio.
- Check the dashboard's session status before collecting the broadcast you want to keep. Tests may affect current activity.

Closing the desktop window leaves StreamPulse running in the menu bar or notification tray. Use the app or tray menu to quit only when you no longer need the overlays.

## Your next step

Follow the [streamer guide](streamer-guide.md) to build a before, during, and after-stream routine. Browse [features](features.md) when you are ready to add another tool.

For connection problems, see [troubleshooting](troubleshooting.md). For hosting, integrations, and automation, use the separate [technical reference](technical-reference.md).
