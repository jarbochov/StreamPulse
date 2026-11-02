# Tier Lists & Live Chat Voting

StreamPulse includes a standalone Tier List Maker and live animated OBS broadcast overlay with audience chat voting and consensus aggregation.

---

## 1. Overview & Key Capabilities

- **Customizable Tiers**: Add, edit, recolor, and reorder any number of tiers (e.g. S+, S, A, B, C, D, F, Trash, DNF).
- **Interactive Drag & Drop**: Native drag and drop placement between unranked pool and tiers using hardware-accelerated movement.
- **Asset Library Integration**: Batch import images directly from your StreamPulse Asset Library (`/assets.html`) with captions pre-filled.
- **Direct File Drag & Drop**: Drag image files straight from your operating system into the unranked pool tray for auto-upload.
- **Audience Chat Voting**: Let stream viewers vote on where unranked items should go on the tier list using chat commands.
- **Mathematical Vote Consensus**: Automatic consensus aggregation supporting **Weighted Mean** ($A + C = B$), **Median**, and **Plurality**.
- **Chatbot Announcements**: Automated Twitch chat announcements when voting opens and closes.
- **OBS Hardware-Accelerated FLIP Animations**: 60fps GPU-accelerated card flight when items are ranked, moved, or placed by chat vote.
- **Presets & Draft Memory**: Save and restore custom tier structures, templates, or in-progress rankings.

---

## 2. Using the Tier List Maker

Open the maker at `http://localhost:3000/tools/tier-list.html` or navigate to **Tools &rarr; Tier List Maker** in the dashboard.

### Adding Items
1. **Manual Add**: Click **Add Item** to paste an image URL, upload a file, enter a caption, and add review notes.
2. **Asset Library**: Click **Asset Library** to browse your existing graphics and artworks. Multi-select multiple files to bulk-add them to the unranked tray in one click.
3. **Clipboard Copy & Paste (Ctrl+V / ⌘V)**: Copy any image file, screenshot, browser image, or direct image URL to your clipboard and paste it directly onto the maker. The image is instantly uploaded to the Asset Library and placed into the unranked pool.
4. **Desktop Drag & Drop**: Drag one or more PNG/JPG/WebP/GIF files directly into the dashed Unranked Items pool.

### Customizing Tiers
- Click on any tier header (e.g. "S" or "A") to customize its label, hex color code, and description.
- Use the &uarr; and &darr; arrows to reorder tiers.
- Click **Presets** to load templates (*Standard S-F*, *Extended Gaming S+-Trash*, *Movie Reviews*, *Food & Snacks*), save your current setup as a new preset, or delete unwanted presets. Click **Restore Defaults** to bring back built-in templates at any time.

### Configuring the Broadcast Overlay
Click **Overlay URL & Options** in the maker toolbar to customize your display before launching:
- **Layout**: Switch between full-screen `board` and compact vertical `sidebar`.
- **Unranked Tray**: Toggle showing or hiding the unranked item pool (`hideUnranked=1`).
- **Card Scale**: Set thumbnail scale to `compact`, `medium`, or `large`.
- **Card Aspect**: Choose between `1/1` (square), `3/4` (poster/box art), or `16/9` (widescreen).
- **Theme**: Select `dark` or `transparent` (for game capture compositing).

Your preferences are saved automatically in `localStorage`, and clicking **Launch Overlay** or **Copy URL** always uses your configured parameters.

---

## 3. Audience Chat Voting

StreamPulse allows chatters to collaboratively decide where items belong on your tier list.

### Starting a Vote
1. Click **Vote** on any unranked or ranked item card.
2. The Live Voting HUD will expand at the top of the screen and activate the spotlight on the OBS overlay.
3. If enabled, the StreamPulse Chat Bot announces the vote in chat with available tier choices and time remaining.

### Voting Commands
Viewers vote in chat with:
```text
!tier S
!tier A
!tier Trash
!rank 1
```
*(Case-insensitive; supports tier labels, numeric position, and prefix shortcuts).*

### Vote Updating
By default, chatters can change their vote as many times as they want while voting is open. Only their most recent vote is counted toward the final consensus.

### Consensus Mathematical Models
In **Settings &rarr; Vote Consensus Method**, choose how chat votes are aggregated:

1. **Weighted Mean ($A + C = B$)** *(Default)*:
   - Each tier is mapped to a numeric index $i \in [0, N-1]$.
   - Continuous average index: $\bar{i} = \frac{\sum (i \cdot \text{weight})}{\sum \text{weight}}$.
   - Rounds to the nearest integer index. For example, 1 vote for A (index 1) and 1 vote for C (index 3) averages to index 2 (**Tier B**).
2. **Median (50th Percentile)**:
   - Sorts all voter selections by tier rank and takes the middle voter.
   - Resistant to extreme troll votes or split extremes.
3. **Plurality (Mode)**:
   - Simple highest vote count wins.

### Finalizing Votes
- When the timer expires, the item automatically moves into the winning tier and chat is notified.
- Click **Lock & Place** to manually end voting early, or **Cancel** to abort without moving the item.

### Chat Bot Announcements & Settings
Customize automated chat announcements in **Chat Bot &rarr; Settings** (`/chatbot.html#settings`):
- **Enable Tier List Announcements**: Master toggle to enable or disable tier vote chat notifications.
- **Vote Start Announcement**: Automatically broadcast when voting opens with duration and choices.
- **Vote Consensus Announcement**: Post the final winning tier with total votes, percentages, and agreement.
- **Customizable Message Templates**: Personalize start and result templates using tokens:
  - `{item}`: Name of the item being ranked.
  - `{tier}`: Winning tier label (e.g. `S`).
  - `{tiers}`: Comma-separated list of available tier choices (e.g. `S, A, B, C, D, F`).
  - `{commands}`: Formatted commands list (e.g. `!tier S, !tier A, !tier B...`).
  - `{duration}`: Voting time limit (e.g. `60s` or `open`).
  - `{votes}`: Vote count for the consensus tier.
  - `{percent}`: Percentage of voters on the consensus tier.
  - `{totalVotes}`: Total votes cast across all tiers.
  - `{agreement}`: Consensus agreement metric.
  - `{subVotes}`: Number of subscriber votes cast.
  - `{prefix}` & `{tag}`: Bot command prefix and tag.
- **Send Test Announcement**: Test bot formatting and SocialStream connection directly with a single click.

### Consensus Agreement & Voter Spotlight
The live voting HUD on both the Maker tool and the broadcast overlay provides real-time community engagement metrics:
- **Agreement Percent**: Displays the percentage of audience voters who agreed with the winning tier (e.g., `83% agree`).
- **Subscriber Multiplier & Bonus**: Highlights subscriber vote weighting (e.g., `Subs 2x`).
- **Recent Voter Spotlight**: Displays a ticker of the latest chatters to cast votes, complete with subscriber badges and colored tier chips.

---

## 4. High-Resolution PNG Image Export

When your tier list ranking is complete, export a crisp, publication-ready snapshot:
1. Click **Export Image** in the Maker toolbar.
2. StreamPulse renders a dedicated 1920px Canvas layout containing:
   - Tier list title and date stamp.
   - Distinct colored tier headers with tier labels and descriptions.
   - Artwork thumbnails cropped to fit with clear legible captions.
   - StreamPulse watermark badge.
3. Automatically triggers a client-side download named `<title>-tier-list.png`.

---

## 5. Audio Sound Effects (SFX)

Both the Tier List Maker and OBS broadcast overlay include an internal Web Audio API synthesizer for zero-latency audio cues without external file dependencies:
- **Vote Start Chime**: 3-note ascending arpeggio (C5 &rarr; E5 &rarr; G5) announcing the start of audience voting.
- **5-Second Countdown Ticks**: Crisp ticks during the final 5 seconds of voting, shifting to a higher frequency warning triangle wave during the final 3 seconds.
- **Lock & Placement Fanfare**: 4-note celebration chord (C5 &rarr; E5 &rarr; G5 &rarr; C6) with exponential decay when an item is placed.

### Sound Controls
- In **Settings**, toggle sound effects on/off and adjust the master volume slider (0–100%).
- On the OBS broadcast overlay, sound effects can be explicitly enabled or muted with URL parameters: `?sfx=1` (enabled) or `?sfx=0` (muted).

---

## 6. Bitfocus Companion & Stream Deck Integration

Control your tier list directly from hardware buttons or external automations using standard HTTP GET and POST requests.

### Hardware Triggers

| Action | Method | URL | Description |
| :--- | :--- | :--- | :--- |
| **Start Next Vote** | `GET` / `POST` | `/api/tier-list/vote/start` | Automatically starts chat voting on the first unranked item. Optional: `?duration=60&consensusMode=weighted_mean`. |
| **Start Item Vote** | `GET` / `POST` | `/api/tier-list/vote/start?itemId=<id>` | Starts chat voting on a specific item ID. |
| **Lock & Place** | `GET` / `POST` | `/api/tier-list/vote/end?apply=1` | Concludes active voting immediately and moves item to consensus tier. |
| **Cancel Vote** | `GET` / `POST` | `/api/tier-list/vote/cancel` | Aborts active vote without moving item. |
| **Reset Placements** | `GET` / `POST` | `/api/tier-list/reset` | Moves all ranked items back to the unranked pool. |
| **Load Preset** | `GET` / `POST` | `/api/tier-list/presets/:id/load` | Activates a saved or built-in preset template. |

### Status Fields for Stream Deck Key Displays

Stream Deck keys can query plain-text endpoints at `/api/status/field/:field`:

| Field Endpoint | Example Return | Description |
| :--- | :--- | :--- |
| `/api/status/field/tier_voting` | `1` or `0` | Active voting status. |
| `/api/status/field/tier_item` | `Super Mario Galaxy` | Name of the item currently being voted on. |
| `/api/status/field/tier_consensus` | `S` | Leading consensus tier label. |
| `/api/status/field/tier_agreement` | `83%` | Voter consensus agreement percentage. |
| `/api/status/field/tier_votes` | `42` | Total votes cast in active vote. |
| `/api/status/field/tier_time` | `28` | Seconds remaining or `open`. |
| `/api/status/field/tier_title` | `Community Tier List` | Active tier list title. |

---

## 7. OBS Broadcast Overlay

Add a Browser Source in OBS with URL:
```text
http://localhost:3000/overlays/tier-list.html
```

### URL Parameters

| Parameter | Options | Description |
| :--- | :--- | :--- |
| `layout` | `board` *(default)*, `sidebar` | Full-screen tier list board or narrow vertical sidebar. |
| `hideUnranked` | `0` *(default)*, `1` | Hide the unranked pool tray to only display ranked tiers. |
| `size` / `scale` | `compact`, `medium` *(default)*, `large`, or number (e.g. `1.2`) | Responsive card scaling from 720p to 4K displays. |
| `aspect` | `1/1` *(default)*, `3/4`, `16/9` | Artwork card aspect ratio. |
| `coverFit` | `cover` *(default)*, `contain`, `natural` | Media scaling: `cover` (fill & crop), `contain` (letterboxed), or `natural` (unconstrained). |
| `theme` | `dark` *(default)*, `transparent`, `light` | Theme compositing (solid dark, alpha cutout for game capture, or light). |
| `howtovote` | `auto` *(default: only during active vote)*, `always`, `0` | Toggle voting instructions hint ribbon displaying chat command syntax and tier choices. Only displays during active votes by default. |
| `hintScale` | `1` *(default)*, `0.85`, `1.25`, `1.5`, or number | Font and element scaling for the voting instructions ribbon. |
| `sfx` | `1` *(default)*, `0` | Enable or disable synthesized audio cues in OBS. |

---

## 8. REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tier-list` | Fetch full tier list state (tiers, items, active vote, presets). |
| `PUT` | `/api/tier-list` | Update title, theme, settings, or tier order. |
| `POST` | `/api/tier-list/item` | Add a single item (`{ name, imageUrl, note, tierId }`). |
| `POST` | `/api/tier-list/items/batch` | Bulk add items (`{ items: [...] }`). |
| `PUT` | `/api/tier-list/item/:id` | Update an existing item's name or note. |
| `DELETE` | `/api/tier-list/item/:id` | Delete an item. |
| `POST` | `/api/tier-list/move` | Move an item (`{ itemId, toTier, toIndex }`). |
| `GET` / `POST` | `/api/tier-list/reset` | Move all ranked items back to the unranked pool. |
| `POST` | `/api/tier-list/clear` | Remove all items from the list. |
| `GET` / `POST` | `/api/tier-list/vote/start` | Start chat voting (defaults to first unranked item). |
| `POST` | `/api/tier-list/vote/cast` | Cast a vote manually (`{ user, userId, tierId, isSub }`). |
| `GET` / `POST` | `/api/tier-list/vote/end` | Lock vote and apply consensus (`?apply=1` or `{ applyConsensus: true }`). |
| `GET` / `POST` | `/api/tier-list/vote/cancel` | Cancel the active vote. |
| `POST` | `/api/tier-list/presets/save` | Save current setup as a preset (`{ name, description }`). |
| `GET` / `POST` | `/api/tier-list/presets/:id/load` | Load a saved or built-in preset. |
| `DELETE` | `/api/tier-list/presets/:id` | Delete any saved or built-in preset. |
| `POST` | `/api/tier-list/presets/reset` | Restore the built-in default templates. |
