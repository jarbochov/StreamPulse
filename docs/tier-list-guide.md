# Tier Lists & Live Chat Voting

StreamPulse includes a standalone Tier List Maker and live animated OBS broadcast overlay with audience chat voting and real-time consensus.

<div class="doc-gallery doc-gallery--2">
  <figure>
    <img src="images/tier-list-studio.png" alt="Tier List Maker studio showing custom S to D tiers and unranked item pool">
    <figcaption><strong>Tier List Maker</strong>Drag artwork cards between tiers, upload custom images, or launch live chat votes.</figcaption>
  </figure>
  <figure>
    <img src="images/tier-list-overlay.png" alt="Animated Tier List OBS broadcast overlay">
    <figcaption><strong>OBS Broadcast Overlay</strong>Full-screen or sidebar layout with smooth animations and live chat voting stats.</figcaption>
  </figure>
</div>

---

## 1. Overview & Key Capabilities

- **Customizable Tiers**: Add, edit, recolor, and reorder any number of tiers (e.g. S+, S, A, B, C, D, F, Trash, DNF).
- **Interactive Drag & Drop**: Drag cards seamlessly between the unranked pool and ranked tiers.
- **Asset Library Integration**: Batch import images directly from your StreamPulse Asset Library with captions pre-filled.
- **Quick Paste & Drag-Drop**: Paste copied screenshots or images with `Ctrl+V` / `⌘V`, or drop image files directly from your computer into the unranked pool tray.
- **Audience Chat Voting**: Let viewers vote on where unranked items belong using chat commands (`!tier S`, `!rank 1`).
- **Flexible Consensus Modes**: Choose **Weighted Mean** ($A + C = B$), **Median**, or **Plurality** voting rules.
- **Presets & PNG Snapshot Export**: Save reusable tier setups, load built-in templates, and export a high-resolution PNG of your finished board.

---

## 2. Using the Tier List Maker

Open the maker at `http://localhost:3000/tools/tier-list.html` or navigate to **Tools &rarr; Tier List Maker** in the dashboard.

### Adding Items
1. **Manual Add**: Click **Add Item** to paste an image URL, upload a file, enter a caption, and add review notes.
2. **Asset Library**: Click **Asset Library** to browse your existing graphics and artworks. Multi-select multiple files to bulk-add them to the unranked tray in one click. Items already present on your active board display a visual **In List** badge. Assets used by the Tier Maker are automatically linked in the Asset Library with `Tier List: <Item>` usage badges and protected from accidental deletion.
3. **Clipboard Copy & Paste (Ctrl+V / ⌘V)**: Copy any image file, screenshot, browser image, or direct image URL to your clipboard and paste it directly onto the maker. The image is instantly uploaded to the Asset Library, tracked as in-use, and placed into the unranked pool.
4. **Desktop Drag & Drop**: Drag one or more PNG/JPG/WebP/GIF files directly into the dashed Unranked Items pool to upload to the Asset Library and add them to the board.

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

The embedded live preview applies appearance and viewport changes without reloading its iframe.

---

## 3. Audience Chat Voting

StreamPulse allows chatters to collaboratively decide where items belong on your tier list.

### Starting a Vote
1. Click **Vote** on any unranked or ranked item card.
2. The Live Voting HUD will expand at the top of the screen and activate the spotlight on the OBS overlay.
3. If enabled, the StreamPulse Chat Bot announces the vote in chat with available tier choices and time remaining.

### Voting Commands
Viewers vote in chat with commands like `!tier S`, `!tier S!`, `!tier A tier`, `!tier Trash`, or `!rank 1`.
*(Case-insensitive; supports tier labels, numeric positions, prefix shortcuts, and natural punctuation like exclamation marks or trailing words).*

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

### Finalizing Votes & Auto Lock-In
In **Settings &rarr; Auto Lock-In Item when Timer Expires**, choose how vote conclusions are handled:
- **Auto Lock-In Enabled** *(Default)*: When the countdown timer reaches zero, the vote closes automatically, the item is moved into the winning consensus tier with a celebration fanfare, and the chatbot announces the final ranking in chat.
- **Auto Lock-In Disabled**: When the timer expires, the vote transitions to a **LOCKED** state. Voting is closed and chat votes are frozen, but the item remains in the voting spotlight with a pulsing **Lock & Place** button and a "Voting Closed &middot; Ready to Lock In" indicator. This gives the streamer full control to discuss chat's decision on stream before clicking **Lock & Place** (or triggering it via Stream Deck) to apply the placement.
- **Manual Early Lock-In**: Streamers can click **Lock & Place** at any time during an active or locked vote to conclude voting early, or **Cancel** to abort without moving the item.

### Chat Bot Announcements & Settings
Customize automated chat announcements in **Chat Bot &rarr; Settings** (`/chatbot.html#settings`):
- **Enable Tier List Announcements**: Master toggle to enable or disable tier vote chat notifications.
- **Vote Start Announcement**: Automatically broadcast when voting opens with duration and choices.
- **Vote Consensus Announcement**: Post the final winning tier with total votes, percentages, and agreement.
- **Customizable Message Templates**: Personalize start and result templates using `{item}`, `{tier}`, `{tiers}`, `{commands}`, `{duration}`, `{votes}`, `{percent}`, `{tiervotes}`, `{tierpercent}`, `{subVotes}`, `{prefix}`, and `{tag}`.
- **Send Test Announcement**: Test bot formatting and chat delivery directly with a single click.

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

## 6. OBS Broadcast Overlay

Open **Overlay & Theming** inside Tier List Maker to customize your layout (`board` or vertical `sidebar`), artwork aspect ratio (`1/1`, `3/4`, `16/9`), card scale, theme (`dark`, `transparent`, or `light`), sound chimes, and voting instructions ribbon, then click **Copy URL** to paste straight into your OBS Browser Source.

Need Stream Deck buttons or HTTP endpoints to automate Tier List votes? See the **[API Reference](api-reference.md)** and **[Bitfocus Companion Guide](companion.md)** under **The Project → Technical**.
