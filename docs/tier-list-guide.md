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
3. **Desktop Drag & Drop**: Drag one or more PNG/JPG/WebP/GIF files directly into the dashed Unranked Items pool.

### Customizing Tiers
- Click on any tier header (e.g. "S" or "A") to customize its label, hex color code, and description.
- Use the &uarr; and &darr; arrows to reorder tiers.
- Click **Presets** to load built-in templates (*Standard S-F*, *Extended Gaming S+-Trash*, *Movie Reviews*, *Food & Snacks*) or save your current list.

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

---

## 4. OBS Broadcast Overlay

Add a Browser Source in OBS with URL:
```text
http://localhost:3000/overlays/tier-list.html
```

### URL Parameters

| Parameter | Options | Description |
| :--- | :--- | :--- |
| `layout` | `board` *(default)*, `sidebar` | Full-screen tier list board or narrow vertical sidebar. |
| `hideUnranked` | `0` *(default)*, `1` | Hide the unranked pool tray to only display ranked tiers. |
| `size` | `compact`, `medium` *(default)*, `large` | Card scale and artwork thumbnail sizing. |
| `theme` | `dark` *(default)*, `transparent` | Transparent background for clean game capture compositing. |

---

## 5. REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tier-list` | Fetch full tier list state (tiers, items, active vote, presets). |
| `PUT` | `/api/tier-list` | Update title, theme, settings, or tier order. |
| `POST` | `/api/tier-list/item` | Add a single item (`{ name, imageUrl, note, tierId }`). |
| `POST` | `/api/tier-list/items/batch` | Bulk add items (`{ items: [...] }`). |
| `PUT` | `/api/tier-list/item/:id` | Update an existing item's name or note. |
| `DELETE` | `/api/tier-list/item/:id` | Delete an item. |
| `POST` | `/api/tier-list/move` | Move an item (`{ itemId, toTier, toIndex }`). |
| `POST` | `/api/tier-list/reset` | Move all ranked items back to the unranked pool. |
| `POST` | `/api/tier-list/clear` | Remove all items from the list. |
| `POST` | `/api/tier-list/vote/start` | Start chat voting (`{ itemId, duration, consensusMode }`). |
| `POST` | `/api/tier-list/vote/cast` | Cast a vote manually (`{ user, userId, tierId, isSub }`). |
| `POST` | `/api/tier-list/vote/end` | Lock vote and apply consensus (`{ applyConsensus: true }`). |
| `POST` | `/api/tier-list/vote/cancel` | Cancel the active vote. |
| `POST` | `/api/tier-list/presets/save` | Save current setup as a preset (`{ name, description }`). |
| `POST` | `/api/tier-list/presets/:id/load` | Load a saved or built-in preset. |
| `DELETE` | `/api/tier-list/presets/:id` | Delete a custom preset. |
