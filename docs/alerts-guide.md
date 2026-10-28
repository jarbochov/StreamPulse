# Alerts & Alert Queue Dock Guide

StreamPulse includes an advanced, rule-based stream alert system and an OBS-ready **Alert Queue Dock** for reviewing and replaying live events.

![Alert Queue Dock](images/alert-queue.png)

---

## 1. Alert Rules & Triggers

Configure alerts under **Tools -> Alerts** (`/alerts.html`):

![StreamPulse Alerts Studio](images/alerts-studio.png)

- **Event Types**: Follows, subscriptions, resubs, gift subs, bits/cheers, donations/tips, raids, channel point redeems, finished timers, reached goals, poll completed / winner (`poll_end`), chat keywords, and chat commands.
- **Subscription Tier Checkboxes & Precedence**: Select any combination of tiers (Tier 1, Tier 2, Tier 3, Prime) for sub, resub, milestone, and gift sub alerts. More specific tier rules take precedence over general "Any Tier" rules, ensuring only the intended alert fires without duplicate alerts.
- **Weighted & Gated Variants**: Create multiple variants per rule:
  - **Weighted Variants**: Random selection with customizable probability weights (e.g. 1 in 10 chance for a rare variant).
  - **Gated Variants**: Threshold criteria based on months (e.g. `> 12 months` and `< 24 months` for veteran resubs), amounts, or gift counts. The highest matching threshold triggers automatically; if no gates match, it falls back to the weighted variant pool.
- **Video Audio & Volume**: Full volume slider control for video alerts (MP4 / WebM) alongside audio effects.
- **Twitch Channel Emotes**: Pick directly from your channel's cached and live Twitch emotes in the Emoji field, rendering crisp emote graphics on stream alongside standard icons.
- **Replacement Tokens**: Dynamic placeholders including `{{alert.user}}`, `{{alert.recipient}}` (or `{{alert.gift_recipient}}` for gift subs), `{{alert.amount}}`, `{{alert.months}}`, `{{alert.streak}}`, `{{alert.tier}}`, plus poll tokens: `{{winner}}`, `{{poll_title}}`, `{{votes}}`, `{{percent}}`, and `{{total_votes}}`.
- **Clean Idle State**: Alert box containers in custom overlays remain 100% invisible with no borders, backgrounds, or shadows when idle, only displaying border effects and styling while an alert is actively playing.
- **Tiered Thresholds**: Configure escalating visual alerts based on amount (e.g. 100 bits vs 1,000 bits vs 10,000 bits).
- **Media Uploads**: Upload custom images, animated GIFs, WebM/MP4 videos, and audio sounds to the Asset Library.
- **Synthesized Audio**: Use built-in Web Audio synthesized sound presets (Ding, Chime, Coin, Fanfare, Level Up, Pop, Whoosh) without needing external audio files.

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
