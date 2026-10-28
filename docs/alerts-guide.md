# Alerts & Alert Queue Dock Guide

StreamPulse includes an advanced, rule-based stream alert system and an OBS-ready **Alert Queue Dock** for reviewing and replaying live events.

![Alert Queue Dock](images/alert-queue.png)

---

## 1. Alert Rules & Triggers

Configure alerts under **Tools -> Alerts** (`/alerts.html`):

![StreamPulse Alerts Studio](images/alerts-studio.png)

- **Event Types**: Follows, subscriptions, resubs, gift subs, bits/cheers, donations/tips, raids, channel point redeems, finished timers, reached goals, poll completed / winner (`poll_end`), chat keywords, and chat commands.
- **Subscription Tier Checkboxes & Precedence**: Select any combination of tiers (Tier 1, Tier 2, Tier 3, Prime) for sub, resub, milestone, and gift sub alerts. More specific tier rules take precedence over general "Any Tier" rules, ensuring only the intended alert fires without duplicate alerts.
- **Unified Variant Model (Conditions & Selection Weights)**: Create multiple variations per rule with zero clutter. Each variant can trigger unconditionally or when an event metric meets a threshold condition (e.g. `≥ 12 months`, `≥ 500 bits`, or specific viewer counts). Every variant features dedicated Odds Weight controls with live `% roll chance` badges; when multiple variants qualify (or for default alerts), the engine rolls proportionally by weight without artificial alternation locks.
- **Rule Simulation & Variant Previews**: The rule banner includes a "Test Rule" button with an inline simulation value input to test live threshold matching and weighted random rolls, while individual variants have "Preview" buttons to audit specific animations and audio.
- **Video Audio & Volume**: Full volume slider control for video alerts (MP4 / WebM) alongside audio effects.
- **Twitch Channel Emotes**: Pick directly from your channel's cached and live Twitch emotes in the Emoji field, rendering crisp emote graphics on stream alongside standard icons.
- **Replacement Tokens**: Dynamic placeholders including `{{alert.user}}`, `{{alert.recipient}}` (or `{{alert.gift_recipient}}` for gift subs), `{{alert.amount}}`, `{{alert.months}}`, `{{alert.streak}}`, `{{alert.tier}}`, plus poll tokens: `{{winner}}`, `{{poll_title}}`, `{{votes}}`, `{{percent}}`, and `{{total_votes}}`.
- **Clean Idle State**: Alert box containers in custom overlays remain 100% invisible with no borders, backgrounds, or shadows when idle, only displaying border effects and styling while an alert is actively playing.
- **Tiered Thresholds**: Configure escalating visual alerts based on amount (e.g. 100 bits vs 1,000 bits vs 10,000 bits).
- **Media Uploads**: Upload custom images, animated GIFs, WebM/MP4 videos, and audio sounds to the Asset Library.
- **Synthesized Web Audio Palette**: 23 offline synthesized sound effects categorized into Chimes, Bells, 8-Bit Arcade, Triumphs, and Modern UI notifications (Desk Bell, Three-Tone Chime, Tubular Bell, Crystal Ping, Harp Flourish, Retro Coin, 8-Bit Level Up, Laser Zap, Retro Jump, Power-Up Riser, Retro Victory, Royal Fanfare, Ta-Da!, Victory Stinger, Celebration Shimmer, Drumroll & Crash, Bubble Pop, Snappy Click, Notification Ping, Warm Success, Water Drop, Cinematic Whoosh, Magic Sparkle) that synthesize instantly in Web Audio without external assets or 404s.

---

## 2. Low-Density Alert Queue Dock

Open **Tools -> Alert Queue** (`/alert-queue.html`) or dock it inside OBS Studio:

### Adding to OBS Studio as a Custom Dock:
1. In OBS Studio, navigate to **Docks -> Custom Browser Docks...**
2. Dock Name: `StreamPulse Queue`
3. URL: `http://localhost:3000/tools/alert-queue.html`
4. Click **Apply**. You can now dock the queue alongside your chat or audio mixer!

### Dock Features:
- **Hide Unmatched Filtering**: Toggle "Hide unmatched" to filter out regular background chat messages and focus strictly on triggered alerts and engagement events.
- **Event Replay**: Click **Replay** next to any past event to trigger the on-screen alert again (useful if you missed an alert during a tense game moment).
- **Skip & Pause**: Skip the currently playing alert or pause the queue when starting a high-focus gameplay section.
