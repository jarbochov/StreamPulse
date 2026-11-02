# Make room for the moments worth celebrating

Alerts help important stream events feel seen without making every moment compete for attention. Shape how follows, subscriptions, cheers, raids, and other events appear, then keep an eye on what’s coming through the queue.

![Alert Queue showing fictional stream events](images/alert-queue.png)

Give different kinds of support their own look and sound, and preview the result before it becomes part of your show. The queue helps you review recent events, revisit a missed moment, or pause the flow when you need to focus. A filter for unmatched activity makes it easier to focus on alerts that actually triggered.

Amount-based rules can fire at **At least**, **Between** or **Equal to** an amount. An equal-to rule (matched to the cent) wins over overlapping ranges, so a $69.69 donation can get its own alert. Milestone variants offer the same choice. Donation rules can also be limited to one source: SocialStream, or any source an embedded host registers (see [API reference](api-reference.md#9-embedded-mode-nodecg)), and `{{alert.source}}` and `{{alert.currency}}` are available in alert text.

### Emote Celebrations & Effects
Emote-driven alerts can celebrate with 60fps broadcast animations:
- **Showcase**: High-DPI hero emote centered prominently in the alert card (replaces tiny icon sizing with responsive 40%–250% scaling).
- **Emote Rain**: Streaming cascade of emotes falling across the card.
- **Emote Party**: Confetti-style explosion burst radiating outward from the center.
- **Emote Fountain**: Upward fireworks geyser spray arcing down.
- **Floating & Bouncing**: Joyful floating and dancing emotes.

Adjust **Particle Density** (10 to 75 particles) and **Emote Size (%)** to fine-tune the celebration for your layout.

### Emote Ladder vs. Milestone Variants for Bits
When designing bits or subscription alerts, decide between an Emote Ladder or Milestone Variants:
- **Use an Emote Ladder when**: You want to keep the **same alert look and sound**, but want the emote to change (e.g. cheer badges) or trigger a heavier emote rain/party as bits increase (e.g. 100 bits drops Cheer100; 1,000 bits drops a heavy Cheer1000 party). Configure this in the **Visuals** tab under Emote Ladder.
- **Use a Milestone Variant when**: You want a **completely different alert experience** — such as an epic sound effect, custom message template, custom video/GIF, or longer on-screen duration (e.g. 100+ bits plays a hype horn sound and video; 5,000+ bits triggers a full takeover). Configure this in the **Activation & Tier Rules** section.

Whether you prefer a quiet acknowledgement or a more theatrical reveal, the goal is to make the moment feel like yours—and keep the show in your hands.

Browse [StreamPulse features](features.md) or [get started](quickstart.md). Already installed? **Docs** and **API Reference** are available through the app navigation.
