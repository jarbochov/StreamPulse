# Community Directory & Viewer Dossiers Guide

The **Community Directory** (located under **Library -> Analytics** -> **Community Directory**) is a private, streamer-focused viewer relationship manager. It compiles lifetime viewer history across all your broadcasts without storing data in the cloud.

![Community Directory](images/community-directory.png)

---

## 1. Smart Roster Segments

Quickly filter your community with instant quick-view segment pills:

- **Moderators**: All active channel moderators detected from Twitch.
- **VIPs**: Channel VIP badge holders.
- **Regulars**: Viewers with chat activity on at least three distinct days who are present tonight or were last seen within 30 days.
- **Lapsed**: Viewers with chat activity on at least three distinct days, last seen 30 to 90 days ago, and not present tonight.
- **Newcomers**: Viewers first seen within 14 days, or with no more than one recorded activity day who are present tonight or were last seen within 30 days.
- **All Members**: Complete roster with instant search.

---

## 2. Interactive Viewer Dossiers

Click any username in the Community Directory or Session History to open their complete **Chatter Dossier**:

![Chatter Dossier](images/chatter-dossier.png)

### Dossier Capabilities:
- **Lifetime Activity**: Recorded attendance days (displayed as sessions), chat message counts, bits cheered, gift subs gifted, and raid days. Multiple broadcasts on one day do not count as separate attendance days.
- **Subscriber Tenure**: Highest subscription-month count observed from chat badges or resub events, not an authoritative continuously refreshed Twitch tenure.
- **Category History**: Categories from archived sessions where the viewer chatted, ranked by message counts. A multi-category session contributes that session's chatter count to each category; this is not measured viewing time.
- **Private Streamer Notes**: Local notes for remembering community member details. These are stored as plain JSON in `data/chatter-notes.json`, not encrypted; protect your data folder and backups.
- **Custom CRM Tags**: Add custom chips (e.g. `speedrunner`, `vip-candidate`, `artist`).
- **Pronouns**: Manage viewer pronouns with automatic display in chat popouts.
- **Twitch Actions**: Instant popout link to Twitch's native Mod Viewer Card.

Dossiers reuse the same compact historical-session cache as milestones and category totals. Reopening a dossier does not reread unchanged archive JSON files. StreamPulse archive changes invalidate it immediately; external archive edits are detected on the next metadata check, up to ten seconds later.

---

## 3. CSV Roster Export

Click **Export CSV** at the top right of the directory to download a full spreadsheet containing:
- Username & display name
- Mod / VIP / Subscriber status
- First seen and last active timestamps
- Recorded attendance days & messages sent
- Observed subscription months, pronouns, and custom tags
- Private streamer notes only when explicitly included
