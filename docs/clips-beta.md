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

## Creating a Twitch clip

Open **Clips (Beta)**, review a candidate, and select **Create Twitch Clip**. Twitch must be live and StreamPulse must have a user token with the `clips:edit` permission.

After a successful request, StreamPulse stores:

- The Twitch clip ID
- Twitch's temporary edit URL
- The published clip URL
- The creation timestamp

The edit URL is intended for short-term editing after creation. The published clip URL is retained as the durable link.

If StreamPulse was authorized before clip support was enabled, visit `/auth/twitch` again to grant the additional permission. A failed request is retained on the candidate with the Twitch error so it can be retried or removed.
