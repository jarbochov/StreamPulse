# Clips (Beta)

StreamPulse's Clips page records possible clip moments and lets you request a Twitch clip while the channel is live.

## How candidates are created

Candidates are added automatically for:

- Chat-volume spikes
- Gift subscriptions
- Subscriptions
- Bits
- Donations
- Raids

You can also add a manual marker from `/clips.html`. Candidate detection does not create clips automatically. This keeps the beta feature reviewable and avoids creating unwanted Twitch clips.

## Tuning and historical sessions

The **Detection Settings** panel groups controls into automatic detection, the chat spike window, and event triggers. A chat spike is defined by two values: the required number of messages and the number of seconds in which they must arrive. For the default installation, that rule is **20 messages within 60 seconds**, followed by a **30-second cooldown** before another chat-spike candidate can be added. The page shows this rule as a live summary while values are edited.

The event trigger section controls subscriptions, gift subs, Bits, donations, and raids separately. Its default examples are **1 Bit**, **$0.00 donation minimum** (include all detected donations), and **0 raid viewers** (include raids of any size). Changes are saved to `config.json` under `clip_candidates` and apply without a restart.

Select **Analyze Past Sessions** to scan the current and archived JSONL chat logs with the visible settings. Existing candidates are preserved, and repeated analysis skips candidates it has already recorded.

Each candidate includes a **View Chat** link that opens the matching session in the Sessions page and a **View VODs** link to the broadcaster's Twitch video archive. StreamPulse does not currently persist a Twitch VOD ID in session archives, so the VOD link opens the channel archive rather than guessing a specific recording.

## Creating a Twitch clip

Open **Clips (Beta)**, review a candidate, and select **Create Twitch Clip**. Twitch must be live and StreamPulse must have a user token with the `clips:edit` permission.

After a successful request, StreamPulse stores:

- The Twitch clip ID
- Twitch's temporary edit URL
- The published clip URL
- The creation timestamp

The edit URL is intended for short-term editing after creation. The published clip URL is retained as the durable link.

If StreamPulse was authorized before clip support was enabled, visit `/auth/twitch` again to grant the additional permission. A failed request is retained on the candidate with the Twitch error so it can be retried or removed.
