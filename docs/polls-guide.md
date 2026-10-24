# Live Polls, Tournaments & Poll Manager Guide

StreamPulse provides two first-class ways to run live audience polls on your broadcast: official **Twitch API Polls** and full-featured **StreamPulse Native Polls & Tournaments** with multi-platform chat voting, Blind Mode ("Fog of War"), single & double elimination tournament brackets, celebratory fanfare, and confetti bursts.

---

## 1. Two Powerful Ways to Poll: Native vs. Twitch

| Feature | StreamPulse Native Polls | Twitch Native Polls |
| --- | --- | --- |
| **Voting Interface** | Chat messages (`1`–`10`, `!vote <n>`, keywords) | Twitch site & mobile app native widget |
| **Platform Coverage** | Multi-platform (Twitch, YouTube, Kick via SSN) | Twitch only |
| **Affiliate Required?** | No (works for all streamers) | Yes (Twitch Affiliate or Partner) |
| **Channel Points** | No | Yes (supports Channel Points for extra votes) |
| **Choice Limit** | 2 to 10 choices | 2 to 5 choices |
| **Duration Options** | 30s, 60s, 90s, 2m, 5m, 10m, 15m, or Manual | 1m, 2m, 3m, 5m, 10m |
| **Blind Mode ("Fog of War")** | Yes (conceals active standings on stream) | No |
| **Tournament Brackets** | Yes (4, 8, 16 seeds; Single & Double elim) | No |
| **Celebrations & Alerts** | Built-in fanfare, canvas confetti, `poll_end` alerts | Displays winner |
| **Overlay Integration** | Custom Overlays widget & `/tournament.html` | Custom Overlays widget & compact preset |

Choose the option that fits your broadcast: run Twitch polls when you want viewers spending Channel Points in the official Twitch app, or run StreamPulse Native Polls when you want multi-platform chat voting, tournament brackets, blind voting, or custom celebration cues!

---

## 2. Poll Manager Controller

Open **Tools -> Poll Manager** (`/polls.html`):

### Creating a Standard Poll
1. **Question & Choices**:
   - Enter your question.
   - Add between **2 and 10 dynamic choices** using **+ Add Option**.
   - **Pull from Game Plan**: Click to instantly load games from your tonight or backlog lineup.
   - **From Chatters**: Click to load active chatters from the current broadcast.
2. **Durations & Manual Control**:
   - Quick preset chips: **30s**, **60s**, **90s**, **2m**, **5m**, **10m**, **15m**, or **Manual** (stays open until you end it).
   - While running, click **+30s** or **+1m** at any time to extend voting time.
3. **Stopping an Open Poll**:
   - **Crown Winner & End**: Immediately concludes voting, calculates percentages, triggers celebration audio & confetti, and fires a `poll_end` alert.
   - **Stop & Cancel**: Aborts the poll immediately and discards active voting without declaring a winner.
4. **Saved Templates**:
   - Click **Save Template** to save your question and options for future broadcasts.
   - Select any template from the **Saved Templates** dropdown to populate the form with 1 click.

### Voting Rules & Spice
- **Blind Voting ("Fog of War")**: Conceals live percentages on public stream overlays (showing mystery `??` indicators), building tension until the poll closes.
- **Natural Keyword Voting**: Viewers can vote by typing words from the option title (e.g. typing "zelda" or "elden").
- **Subscriber 2× Multiplier**: Channel subscribers' votes count double.

---

## 3. Tournament Bracket Engine (Audience & Esports)

StreamPulse includes an advanced **Tournament Bracket** engine designed for community showdowns, esports competitions, retro game tournaments, and interactive viewer brackets. Tournaments can be managed from either **Versus** (`/versus.html`) for esports/manual brackets or **Poll Manager** (`/polls.html`) for audience chat brackets.

- **Dedicated & Isolated Tournament State**: Esports tournaments (`/api/tournament/*`) and Audience Chat tournaments (`/api/polls/tournament/*`) maintain completely independent lifecycles, states, and history. Running an audience bracket in Poll Manager never modifies or overwrites an active esports bracket in Versus.
- **Overlay Routing by Source**: `/overlays/tournament.html` defaults to the active esports tournament, while `/overlays/tournament.html?source=poll` monitors the audience chat bracket in real-time.
- **Entrant Color Customization**: Broadcasters can customize competitor colors directly from the Tournament Match HUD or the Versus competitor cards. Colors persist across the entire bracket, propagate automatically to downstream matches, and render as luminous accent borders and dots on both `/tournament.html` and `/matchup.html`.
- **Independent Score Pips vs. Round Pips**: Score pips (`?pips=1` or `?pips=0`) and round pips (`?roundpips=1` or `?roundpips=0`) are completely independent ("either or"). Streamers can choose to display round pips alone without score pips (`?pips=0&roundpips=1`), both, or neither.
- **Strict Round Logic & Auto-Advancement**: If rounds are configured (e.g. Best of 3 rounds, target 2), reaching target rounds immediately awards +1 game win and clears rounds to 0-0. Competitor round counts are strictly capped below the target, preventing invalid states like `3/2 rounds`. When rounds are Off (`roundsBestOf: 0`), round steppers are cleanly disabled.

### Flexible Tournament Capabilities:
- **Participant Scaling & Non-Multiples of 2 (2 to 32 Entrants)**: Enter any number of competitors, including odd or non-power-of-2 numbers (e.g. 3, 5, 6, 7, 9, 11, 13).
  - **Single Elimination with Clean BYEs**: Top seeds automatically receive 1st Round **BYEs** that cleanly advance directly to the subsequent round slot without ghost matches, fake scores, or confusing voting prompts. The overlay highlights these as sleek `1st Round BYE` cards.
  - **Round Robin (Single & Double Legs, Points & Draws)**: Perfect for all-play-all competitions. Supports **Single Round Robin (1 leg)** or **Double Round Robin (2 legs, Home & Away)**, with customizable point systems:
    - **Standard League (3-1-0)**: 3 points for a win, 1 for a draw, 0 for a loss.
    - **Simple Win-Only (1-0-0)**: 1 point for a win, 0 for draw or loss.
    - **Traditional Sports / Chess (2-1-0)**: 2 points for a win, 1 for a draw, 0 for a loss.
    - **Ties / Draws**: Record match ties directly via **Record Tie / Draw**; standings automatically calculate matches played, W-D-L records, points, and score differential.
  - **Double Elimination**: Full winners and losers bracket progression with Grand Finals reset capabilities.
- **Two Progression Modes**:
  1. **Audience Chat Vote** (in Poll Manager): Each matchup runs as an interactive chat poll where viewers vote live in stream chat.
  2. **Manual Scored Bracket** (in Versus): Broadcaster or tournament admin manually enters match scores, series scores, and match notes directly from Versus.
- **Series Formats**:
  - **Free Points**: Open score tally (e.g., basketball, pinball, 15 vs 12).
  - **Single Game (Best of 1)**: Winner takes all.
  - **Best of 3**: First to 2 wins.
  - **Best of 5**: First to 3 wins.
  - **Best of 7**: First to 4 wins.
- **Entrant Entry: Bulk Paste vs. Name & Tag Table**: Broadcasters can toggle between **Bulk Paste** text mode and an interactive **Name & Tag Table** where competitor names and character/sub-tags are entered in separate columns, auto-syncing seamlessly in real-time. Formats like `Daigo [Ryu]`, `FOX | SonicFox`, or `Tokido (Ken)` are automatically parsed.
- **Dynamic Orthogonal Connector Lines & Spacing**:
  - **Lines (`?lines=glow|solid|minimal`)**: Smooth orthogonal stepped connector lines featuring luminous glow with cyan drop-shadow (`glow`), high-contrast solid connectors (`solid`), or minimal borders (`minimal`).
  - **Spacing Density (`?spacing=normal|compact|spacious`)**: Adjust bracket gap width and match card padding to fit any screen resolution.
- **Rounds per Game (FGC Sets & Auto-Advancement)**: Configure rounds-within-a-game (`roundsBestOf`: Best of 1, Best of 3, Best of 5, Best of 7). Scoring target rounds (e.g. 2 rounds in Best of 3) automatically increments the game score by 1, resets rounds to 0-0, and completes the match upon reaching the target game score. Round pips render as distinct diamond markers (`◆ ◇`) in match cards and the active match HUD.
- **Centered Header & Granular Show/Hide Controls**: The bracket header (title banner, elimination format, series mode, and entrant count) is centered horizontally above the bracket. Broadcasters can independently toggle any element on the overlay (title, metadata pills, round headers, scores, round pips, seeds, tags, live badges, connector lines, and champion card) via URL parameters or studio checkboxes.
- **Auto-Advancement on Target Score**: In best-of series, reaching the required target score (e.g. 2 wins in Best of 3) automatically crowns the matchup winner and moves them to the next round slot!
- **Match Advancement Undo & Recursive Bracket Rollback**: Made a mistake or scored the wrong winner on a tournament match? Broadcasters can click **Undo / Edit** on any completed match in Versus (`/api/tournament/rollback`). The match winner is cleared, scores reset, and all downstream matches that depended on that match are recursively reverted back to `TBD` and `PENDING`, clearing any premature champion declarations.
- **In-Progress Tournament Drafts & Checkpoints**: Streamers can save tournament snapshots at any point during a broadcast (**Save Draft** / `/api/tournament/drafts/save`). Switch games or pause your stream, then resume your exact bracket progression later via **Checkpoints** (`/api/tournament/drafts/restore`).
- **Interactive Match Selection & Resets**: Click any match card in the studio overview to immediately inspect, score, advance, or reset it.
- **Saved Tournament Presets & Categories**: Categorized preset browser for Fighting Games (EVO SF6 8P, Tekken 16P), Speedrunning (GDQ League Round Robin), Party / FFA (Smash 6P, Rocket League 4P), and Custom Saved brackets. Broadcasters can edit existing custom presets (`PUT /api/tournament/presets/:id`), duplicate built-in presets to tweak configurations, and delete unwanted presets.
- **Dedicated Overlays & Live Preview Tab**: Full-width studio tab allowing broadcasters to test bracket tree scaling, theme styling, score indicators, and viewport presets (`1100×100`, `800×130`, `1280×220`, `1280×720`, `Full Bracket Fit`) before sending feeds to OBS.

---

## 4. Matchup Scoreboard & Versus Engine (Versus)

For broadcasts featuring fighting games (Street Fighter, Smash, Tekken), speedrun races, Mario Kart showdowns, or 1v1 to 4-player casual sets, StreamPulse provides a standalone **Matchup Scoreboard** in **Tools -> Versus** (`/versus.html`). It tracks match points, series win pips, and competitor side positions without requiring an elimination bracket.

### Key Matchup Features:
- **Speedrun Battle (GDQ Race Mode) with Multi-Runner Clocks**:
  - **Synchronized Master Clock**: One-click **Sync Start All Runners** launches all runner clocks simultaneously (`/api/matchup/clock/race/start-all`).
  - **Individual Runner Split Cards**: Each runner has independent split controls (`Finish / Split`, `Toggle`, `Reset`).
  - **Live Delta Badges**: The first runner to finish is awarded the green `WINNER` badge; subsequent finishers display exact positive split deltas (`+MM:SS.ss`) on stream.
  - **Target EST Display**: Set and display the estimated target time (`Target EST: 45:00`).
  - **Dedicated GDQ Race Layout**: Responsive multi-runner overlay layout (`?layout=race`) supporting 2, 3, or 4 runners with individual split clocks, runner tags, and status cards.
- **Active Tournament Match Binding on Versus Scoreboard**: When an esports tournament is currently active, the Matchup Scoreboard (`/versus.html`) displays the tournament's active match with a dedicated match control banner. Broadcasters can switch matches with previous/next buttons or a dropdown selector, record match ties/draws, advance winners, and toggle between tournament matches and standalone exhibition sets with 1 click.
- **Separated Game Pips & Round Pips**: Game/set wins and rounds-within-a-game are clearly separated into distinct visual docks in the studio, each featuring its own steppers, direct number inputs, and distinct pips (`● ● ○` for games, `◆ ◇` for rounds).
- **Match Clock Styles & Modes (EVO, GDQ, Bottom Dock & None)**:
  - **Round Countdown Timer**: Authentic fighting game clock (99s EVO / 60s Tekken) with amber LED digits that pulse red with high-urgency glow when under 10 seconds.
  - **Speedrun Stopwatch**: Marathon/GDQ-style elapsed runtime clock (`MM:SS` or `HH:MM:SS`) with optional target estimate display (e.g. `/ EST 45:00`).
  - **Clock Styles**: Choose from integrated center badge (`clockstyle=badge`), bottom dock timer (`clockstyle=bottom`), floating pill (`clockstyle=pill`), or EVO big digits (`clockstyle=fgc`).
  - **Hide Clock (`None`)**: Instantly hides the clock across broadcast overlays and studio controls when timers aren't required.
  - **Auto-Pause on Set Win**: Concluding a set automatically pauses the match clock to capture exact final clear times.
  - Full API controls: `/api/matchup/clock/start`, `/api/matchup/clock/pause`, `/api/matchup/clock/reset`, and `/api/matchup/clock/set`.
- **2, 3, or 4 Competitors / Teams**: Switch seamlessly between 1v1 duel, 3-way triple threat, or 4-player free-for-all or squads.
- **Series & Scoring Formats**:
  - **Best of 1, 3, 5, 7, 9**: Win pips automatically update as scores change.
  - **First to 10 (or custom target)**: Target score required to take the set.
  - **Free Points**: Open scoreboard with no upper score cap.
- **Side Swapping (`P1 ⇄ P2`)**: Instantly swaps Player 1 and Player 2 names, character/sub-tags, custom team colors, and current scores with 1 click in Versus.
- **Character & Sub-Tags**: Tag players with their chosen character, clan, or handicap (e.g. `Ryu`, `Fox`, `Blue Team`).
- **Custom Player / Team Colors**: Assign distinct hex colors to each competitor; score boxes and accents adapt dynamically.
- **Score Steppers & Direct Input**: Click `+` / `-` in Versus or type any score directly into the competitor card.
- **Auto Set Winner Detection & Fanfare**: Reaching the series target score crowns the set winner, triggers optional victory audio fanfare, and fires celebratory particle confetti.
- **Fight Card & Exhibition Queue**: Schedule a sequential list of matches to step through during your stream:
  - Step forward (`Next Match`) or backward (`Prev Match`) with 1 click or Stream Deck button.
  - Load any match directly to the live broadcast overlay with `Load`.
  - Add new exhibition fights on the fly with custom player names, tags, and game titles (names accurately persist in the queue).
- **Matchup Configuration Presets**: Save and reload favorite match rules, game titles, and player templates (includes SF6 FT10, Tekken 8 BO5, Smash Ultimate BO3, Mario Kart 4P FFA, Speedrun 1v1 Race defaults).
- **Unified Active Match HUD**: The active tournament match HUD is unified with the Matchup overlay (`/overlays/matchup.html?source=tournament`), giving tournament broadcasters identical access to EVO Top Bars, Split Corners, LED clocks, and themes.

---

## 5. Dedicated Broadcast Overlays: Polls, Tournaments & Matchups

StreamPulse offers three broadcast-ready, responsive OBS browser sources designed with CSS container queries, clamp scaling, and full styling support:

### Live Poll Overlay (`/poll.html` or `/overlays/poll.html`)
Renders the active live poll with real-time percentage fill bars, tabular vote metrics, ticking countdown timer, winner fanfare, and optional bottom instructions banner. Auto-hides when no poll is active.

#### URL Customization Parameters:
| Parameter | Default | Description |
| --- | --- | --- |
| `?overlay=<theme\|hash>` | `card` | Container styling or custom background hash/hex color.<br>• **Preset themes**: `card`, `glass` (frosted blur), `solid`, `transparent` (clean/borderless), `pill` (capsule), `neon` (cyber glow), `retro` (arcade border).<br>• **Hex/Hash color**: Any hex color with or without hash prefix (e.g. `?overlay=161b22`, `?overlay=#0d1117`, `?overlay=rgba(13,17,23,0.85)`). Also supports `window.location.hash` (e.g. `/poll.html#161b22`). |
| `?howtovote=1` | `0` (off) | Optional chat voting instructions banner docked at the bottom.<br>• `?howtovote=1` displays dynamic instructions: `Vote in chat: type 1–N or !vote <number>` (with title keywords when natural keyword voting is enabled).<br>• Pass custom text (e.g. `?howtovote=Type+your+choice+now!`) to display custom text.<br>• `?howtovote=0` explicitly hides the footer. |
| `?bg=<color>` | theme default | Direct background color override (accepts hex, rgba, or CSS color). |
| `?accent=<color>` | `#58a6ff` | Progress bar fill and active status accent color. |
| `?winner=<color>` | `#3fb950` | Highlight and bar color for crowned winning choice. |
| `?track=<color>` | `rgba(255,255,255,0.12)` | Progress bar background track color. |
| `?font=<name>` | system font | Custom font family (Roboto, Montserrat, Segoe UI, Impact, etc.). |
| `?fontscale=<n>` | `1` | Font and component scaling multiplier (e.g. `?scale=1.2`). |
| `?align=left\|center\|right` | `center` | Horizontal alignment on the canvas. |
| `?valign=top\|center\|bottom` | `center` | Vertical alignment on the canvas. |
| `?results=<seconds>` | `15` | How many seconds completed results stay on screen before auto-fading in OBS. Set to `0` to hold indefinitely. |
| `?confetti=1\|0` | `1` | Enable or disable winner celebration canvas confetti. |
| `?preview=1` | `0` | Displays sample poll data permanently for positioning and styling in OBS Studio. |

### Tournament Bracket Overlay (`/tournament.html` or `/overlays/tournament.html`)
Renders the tournament bracket with flexible layouts, responsive auto-scaling, series win pips, and full Champion victory celebrations.

#### Layout Modes (`?layout=`):
- **Full Bracket Tree (`?layout=tree`)**: Displays the entire tournament tree across all rounds. Ideal for pre-game intro scenes, intermission screens, and post-tournament breakdowns.
- **Esports Lower-Third Match HUD (`?layout=active` or `?layout=hud`)**: A compact, broadcast lower-third displaying the currently active matchup, round name, match details (e.g. Map/Game), competitor names, score boxes, and series win pips (`● ● ○`). Designed to overlay gameplay without obstructing action!
- **Compact Card (`?layout=compact`)**: A minimal floating bracket summary widget.

#### Tournament URL Customization Parameters:
| Parameter | Default | Description |
| --- | --- | --- |
| `?layout=tree\|active\|compact` | `tree` | Bracket layout mode (Full tree, lower-third match HUD, or compact card). |
| `?overlay=<theme\|hash>` | `card` | Container styling theme (`card`, `championship`, `fgc-evo`, `cyber`, `glass`, `clean-light`, `minimal-dark`, `solid`, `transparent`, `pill`, `neon`, `retro`) or hex color hash (e.g. `?overlay=0d1117`). |
| `?fit=1\|0` | `0` | **Fit Entire Bracket**: Auto-scales and centers the whole bracket tree within the OBS browser viewport so all rounds fit on-screen without scrollbars. |
| `?showtitle=1\|0` | `1` | Show or hide tournament title banner at the top of the bracket overlay (`?showtitle=0` removes header to save vertical space). |
| `?showmeta=1\|0` | `1` | Show or hide header metadata pill container (format, series mode, entrant count, status). |
| `?showformat=1\|0` | `1` | Show or hide tournament format pill (e.g. Single Elimination, Double Elimination, Round Robin). |
| `?showmode=1\|0` | `1` | Show or hide series mode pill (e.g. Best of 3, Best of 5, Free Points). |
| `?showentrants=1\|0` | `1` | Show or hide total entrants count badge. |
| `?showstatus=1\|0` | `1` | Show or hide tournament status indicator (Live, In Progress, Completed). |
| `?showrounds=1\|0` | `1` | Show or hide round header labels ("Round of 16", "Semifinals", "Grand Finals"). |
| `?showscores=1\|0` | `1` | Show or hide numerical scores and series win pips on match cards. |
| `?pipstyle=circle\|diamond\|bar\|digit` | `circle` | Pip presentation format: round dots (`circle`), diamonds (`diamond`), segmented rectangular bars (`bar`), or numerical indicator (`digit`). |
| `?roundpips=1\|0` | `1` | Show or hide round pips in match cards and active match HUD. |
| `?roundpipstyle=diamond\|circle\|bar\|digit` | `diamond` | Round pip presentation format: diamonds (`diamond`), round dots (`circle`), segmented rectangular bars (`bar`), or numerical indicator (`digit`). Sized equally to game score pips (8px). |
| `?showseeds=1\|0` | `1` | Show or hide entrant seed numbers (`#1`, `#2`) on bracket cards. |
| `?showtags=1\|0` | `1` | Show or hide competitor player/character tags (`[Ryu]`, `[Ken]`). |
| `?showbadges=1\|0` | `1` | Show or hide match card live/upcoming status badges. |
| `?highlight=1\|0` | `1` | Highlight the currently pinned live match on the bracket (`?highlight=0` disables live match highlighting when multiple tournament games run concurrently). |
| `?center=1\|0` | `1` | Show or hide the center phase badge in active HUD mode (`?center=0` hides the badge). |
| `?gap=intact\|<px>` | `auto` | Keep center spacing intact (`?gap=intact` for `160px`) or set custom spacing (`?gap=80px`, `?gap=240px`, `?gap=360px`) between opponents when `?center=0`. |
| `?showchampion=1\|0` | `1` | Show or hide champion card banner at bracket completion. |
| `?showlines=1\|0` | `1` | Show or hide bracket connector lines. |
| `?showstandings=1\|0` | `1` | Show or hide standings table in Round Robin view. |
| `?showmatches=1\|0` | `1` | Show or hide round-by-round match list in Round Robin view. |
| `?lines=glow\|solid\|minimal` | `glow` | Bracket line style: luminous glow, solid high-contrast connectors, or minimal borders. |
| `?spacing=normal\|compact\|spacious` | `normal` | Bracket match and column spacing density. |
| `?confetti=1\|0` | `1` | Enable or disable celebration confetti burst when champion is crowned. |
| `?scale=<multiplier>` | `1` | Responsive zoom and element scaling factor (e.g. `?scale=1.25`). |
| `?preview=1` | `0` | Displays sample tournament bracket permanently for setup, sizing, and styling in OBS Studio. |

### Matchup Scoreboard Overlay (`/matchup.html` or `/overlays/matchup.html`)
Renders live competitor scores, names, character tags, and series pips across fighting game and esports broadcasts.

#### Layout Modes (`?layout=`):
- **Fighting Game Top Bar (`?layout=top`)**: Docked at the top of the broadcast screen with P1 and P2 on opposing sides, score boxes, series win pips (`● ● ○`), and a center match phase badge.
- **Modern FGC / EVO Style (`?layout=fgc`)**: High-octane esports broadcast bar with angular polygon clip-path cuts, LED score counters, character badges, and responsive scaling.
- **Dual Corner Split (`?layout=split`)**: Places Player 1 in the top-left corner and Player 2 in the top-right corner with a **100% open clear center**. Ideal when webcams, game timers, or in-game super meters are positioned in the top center.
- **Speedrun Battle / GDQ Race (`?layout=race`)**: Multi-runner speedrun race layout featuring synchronized master clock, target estimate badge, runner nameplates and tags, independent live split times, and auto-calculating delta badges (`WINNER`, `+MM:SS.ss`). Supports 2, 3, or 4 runners.
- **Vertical Pillar Stack (`?layout=pillar` or `?layout=vertical`)**: Compact vertical stack designed for camera sidebars, mobile stream framing (9:16), or corner pillars.
- **Minimal / Center-Less (`?layout=minimal`)**: Ultra-compact, center-less score strip where player names and score numbers touch directly without center badges or bulky backplates.
- **Esports Lower-Third HUD (`?layout=bottom`)**: Docked at the bottom of the stream screen.
- **Compact Score Bug (`?layout=compact`)**: Floating score bug for placing in screen corners.
- **Angular Slash (`?layout=angular`)**: High-contrast symmetrical esports banner with polygon cuts, italic typography, and center VS badge.
- **Versus Screen Card (`?layout=versus`)**: Full-screen or large intro card showcasing competitors facing off with prominent VS emblem.

#### Responsive Self-Sizing, Container Queries & Narrow Viewports:
Unlike traditional full-screen overlays locked to 1920×1080 canvases, `/matchup.html` dynamically sizes itself to whatever OBS browser source dimensions you configure (e.g. 700×70, 1100×90, 480×120, 340×200).
- **Proportional Rem Scaling (`?scale=0.75\|1.0\|1.25\|1.5\|2.0`)**: Scales the root font size and all rem-based typography, pips, badges, and score boxes together in lockstep.
- **Fluid Container Queries (`@container`)**: Matchup layouts employ CSS container queries to fluidly adapt from 4K down to narrow sidebar widths without clipping:
  - `< 720px`: Paddings, clip-path angles, and badges scale down smoothly.
  - `< 580px` (Narrow Bar / Vertical 9:16 streams):
    - **Top Bar**: Center badge gracefully wraps into a sleek top micro-header, giving Player 1 and Player 2 the entire bottom row (50% width each) with zero name truncation.
    - **Modern FGC**: Polygon clip-paths retract and cards stack cleanly into opposing vertical battle cards.
    - **Dual Corner Split**: Corner pods stack vertically.
    - **Multi-Competitor Grid & Speedrun Battle**: Grids collapse into responsive single-column cards.
  - `< 380px` (Mobile Frame / Camera Sidebar): Opposing competitor cards stack vertically with clean borders.
- **Explicit Width & Max-Width (`?width=480px`, `?maxwidth=600px`)**: Constrain the overlay container to explicit pixel or percentage widths.
- **Tight Bounding Box Mode (`?fit=content` or `?fit=1`)**: Automatically sizes the container to wrap snugly around the content with zero dead whitespace or unwanted margins.
- **Canvas Alignment (`?align=left|center|right`, `?valign=top|center|bottom`)**: Aligns the scoreboard within the source bounding box.

#### Automatic Tournament Match Binding (`?source=auto`):
- By default, `/matchup.html` operates in **`?source=auto`** mode: when an esports tournament is currently running, it automatically mirrors the tournament's active match and real-time score; when no tournament is active, it seamlessly falls back to your exhibition matchup queue.
- You can force standalone exhibition mode (`?source=matchup`) or tournament-only mode (`?source=tournament`).

#### Matchup URL Customization Parameters:
| Parameter | Default | Description |
| --- | --- | --- |
| `?layout=top\|fgc\|split\|race\|pillar\|minimal\|bottom\|compact\|angular\|versus` | `top` | Display layout style (Fighting game top bar, modern FGC EVO style, dual corner split with open center, speedrun race, vertical pillar stack, minimal center-less strip, lower-third HUD, compact bug, angular slash banner, or versus intro card). |
| `?overlay=<theme\|hash>` | `card` | Container styling theme (`card`, `championship`, `fgc-evo`, `cyber`, `glass`, `clean-light`, `minimal-dark`, `border`, `solid`, `transparent`, `pill`, `neon`, `retro`, `ember`, `aurora`, `ocean`, `sunset`, `violet`, `forest`) or custom hex color (e.g. `?overlay=0d1117`). |
| `?source=auto\|matchup\|tournament` | `auto` | Data source binding: automatically display active tournament match during brackets, or lock to standalone matchup. |
| `?pipstyle=circle\|diamond\|bar\|digit` | `circle` | Pip presentation format: round dots (`circle`), diamonds (`diamond`), segmented rectangular bars (`bar`), or numerical indicator (`digit`). |
| `?fit=content` | off | Shrinkwrap container to fit tightly within the OBS browser source without canvas margins. |
| `?width=<width>` | `100%` | Custom width constraint (e.g. `?width=480px` or `?width=90%`). |
| `?maxwidth=<width>` | `1200px` | Custom maximum width constraint (e.g. `?maxwidth=600px`). |
| `?padding=<padding>` | `clamp(...)` | Custom stage padding (e.g. `?padding=8px`). |
| `?p1color=<hex>` | default | Custom theme accent color override for Player 1 / Left team. |
| `?p2color=<hex>` | default | Custom theme accent color override for Player 2 / Right team. |
| `?clockstyle=badge\|bottom\|pill\|fgc` | `badge` | Match clock styling presentation: center integrated badge, bottom dock timer (`00:00 / 45:00`), floating pill, or EVO big digits. |
| `?showest=1\|0` | `1` | Show or hide target EST timer (e.g. `00:00 / 45:00`) on clock displays. |
| `?title=1\|0` | `1` | Show or hide event / game title. |
| `?center=1\|0` | `1` | Show or hide the center match phase badge. Set `?center=0` to create completely center-less overlays that leave the middle of your screen 100% clear. |
| `?gap=intact\|<px>` | `auto` | Keep center spacing intact (`?gap=intact` for `160px`) or set custom opponent spacing (`?gap=80px`, `?gap=240px`, `?gap=360px`) when `?center=0` or across split/HUD layouts. |
| `?pips=1\|0` | `1` | Show or hide series win pips (`● ● ○`). |
| `?roundpips=1\|0` | `1` | Show or hide round pips alongside or stacked with game score pips. |
| `?roundpipstyle=diamond\|circle\|bar\|digit` | `diamond` | Round pip presentation format: diamonds (`diamond`), round dots (`circle`), segmented rectangular bars (`bar`), or numerical indicator (`digit`). Sized equally to game score pips (8px). |
| `?tags=1\|0` | `1` | Show or hide competitor character/sub-tags. |
| `?details=1\|0` | `1` | Show or hide match phase badge and series subtitle. |
| `?confetti=1\|0` | `1` | Enable or disable confetti burst when a set winner is crowned (`?confetti=0` silences confetti). |
| `?scale=<multiplier>` | `1` | Global scaling multiplier scaling all elements and root rem typography proportionally (e.g. `?scale=0.75`, `?scale=1.5`). |
| `?preview=1` | `0` | Displays sample matchup permanently for OBS scene framing. |

---

## 6. Multi-Platform Chat Voting

Viewers can vote through any connected chat platform:
- **Direct Numbers**: Simply typing `1`, `2`, `3` ... up to `10` in chat.
- **Command Syntax**: Typing `!vote 1`, `!vote 2`, or `!vote <title>`.
- **Natural Keywords**: Typing title words when keyword voting is enabled.
- **Vote Changing**: Viewers can change their vote before the poll concludes; their previous vote is automatically subtracted and moved to the new choice.

---

## 7. Winner Fanfare, Confetti & Alerts

When a poll ends, a tournament champion is crowned, or a matchup set is won:
- **Victory Audio**: Plays customizable victory audio fanfare at a configurable volume.
- **Confetti Explosion**: Spawns dynamic particle confetti over the winning option.
- **Alert Engine Integration**: Fires a `poll_end` alert with replacement tokens:
  - `{{winner}}`: The winning choice title or champion.
  - `{{poll_title}}`: The poll or tournament question.
  - `{{votes}}`: Number of votes cast for the winner.
  - `{{percent}}`: Percentage of total votes won.
  - `{{total_votes}}`: Total votes cast.

---

## 8. Bitfocus Companion & Stream Deck

Control live polls, tournament matchups, and scoreboard sets directly from your Stream Deck:

| Action | HTTP Path | Method | Purpose |
| --- | --- | --- | --- |
| **Crown Winner & End** | `/api/polls/end` | POST | Concludes active poll and triggers celebration effects. |
| **Extend Poll** | `/api/polls/extend` | POST | Adds +30 seconds of voting time. |
| **Stop & Cancel Poll** | `/api/polls/cancel` | POST | Aborts active poll without crowning a winner. |
| **Advance Tournament Match** | `/api/tournament/advance` | POST | Advances current matchup winner in bracket. |
| **Undo Tournament Match** | `/api/tournament/rollback` | POST | `{ "matchId": "m_1_1" }` Reverts match advancement and downstream resets. |
| **P1 Score +1** | `/api/matchup/score` | POST | `{ "competitorId": "c1", "delta": 1 }` Increments P1 score. |
| **P2 Score +1** | `/api/matchup/score` | POST | `{ "competitorId": "c2", "delta": 1 }` Increments P2 score. |
| **Swap Sides** | `/api/matchup/swap` | POST | Swaps P1 and P2 sides (names, colors, scores). |
| **Reset Matchup Scores** | `/api/matchup/reset-scores` | POST | Clears scores to 0 for next set. |
| **Clock Start / Pause** | `/api/matchup/clock/start` / `/pause` | POST | Starts or pauses match round countdown or stopwatch. |
| **Clock Reset** | `/api/matchup/clock/reset` | POST | Resets match clock to default duration or 0. |
| **Race Start All Runners** | `/api/matchup/clock/race/start-all` | POST | Synchronously starts master clock and all runner split timers. |
| **Race Pause All Runners** | `/api/matchup/clock/race/pause-all` | POST | Pauses master clock and all runner split timers. |
| **Race Reset All Runners** | `/api/matchup/clock/race/reset-all` | POST | Resets all runner split clocks, finished status, and delta badges. |
| **Finish Runner 1** | `/api/matchup/clock/race/finish` | POST | `{ "competitor": 0 }` Locks Runner 1 finish time and calculates delta. |
| **Finish Runner 2** | `/api/matchup/clock/race/finish` | POST | `{ "competitor": 1 }` Locks Runner 2 finish time and calculates delta. |
| **Next Queue Match** | `/api/matchup/queue/next` | POST | Advances to next match in the fight card queue. |
| **Prev Queue Match** | `/api/matchup/queue/prev` | POST | Returns to previous match in the fight card queue. |

---

## 9. HTTP API Reference

- `GET /api/polls/latest` — Returns active or most recent poll status.
- `GET /api/polls/active` — Returns the currently active poll, or `{ active: false }`.
- `GET /api/polls/history` — Returns recent poll history records.
- `POST /api/polls/create` — Launches a new poll: `{ title, choices: string[], duration, blind, keywords, subMultiplier, celebration }`.
- `POST /api/polls/end` — Concludes active poll and crowns winner.
- `POST /api/polls/extend` — Adds voting seconds: `{ seconds: 30 }`.
- `POST /api/polls/cancel` — Cancels active poll immediately.
- `POST /api/polls/vote` — Manually cast a vote: `{ user, choice, isSubscriber }`.
- `GET /api/polls/presets` — List saved poll templates.
- `POST /api/polls/presets` — Save a poll template.
- `DELETE /api/polls/presets/:id` — Delete a poll template.
- `GET /api/tournament` — Returns active tournament bracket state.
- `POST /api/tournament/create` — Launches a tournament: `{ title, format: 'single'|'double', entrants: string[], progressionMode: 'vote'|'manual', scoringType: 'points'|'bestOf', bestOf: 0|1|3|5|7, matchDuration, blind }`.
- `POST /api/tournament/start-match` — Starts voting on a matchup: `{ matchId }`.
- `POST /api/tournament/score` — Updates match score, details, or crowns winner: `{ matchId, entrant1Score, entrant2Score, winner, matchDetails }`.
- `POST /api/tournament/select-match` — Selects active match for scoring or display: `{ matchId }`.
- `POST /api/tournament/reset-match` — Resets a match's scores, downstream advancement, and winner: `{ matchId }`.
- `POST /api/tournament/rollback` — Reverts completed match advancement, resets winner/scores, and recursively resets downstream matches back to TBD/PENDING: `{ matchId }`.
- `POST /api/tournament/settings` — Updates tournament title or series settings: `{ title, bestOf, progressionMode }`.
- `POST /api/tournament/advance` — Advances winner in tournament: `{ matchId, winner }`.
- `POST /api/tournament/reset` — Resets active tournament.
- `GET /api/tournament/drafts` — Lists in-progress saved bracket draft checkpoints.
- `POST /api/tournament/drafts/save` — Saves active tournament state as a draft checkpoint: `{ name }`.
- `POST /api/tournament/drafts/restore` — Resumes an in-progress bracket draft checkpoint: `{ id }`.
- `DELETE /api/tournament/drafts/:id` — Deletes a saved draft checkpoint.
- `GET /api/matchup` — Returns active matchup scoreboard state.
- `POST /api/matchup` — Updates matchup settings, format, or competitors.
- `POST /api/matchup/score` — Adjusts competitor score (`delta` or `score`).
- `POST /api/matchup/swap` — Swaps P1 and P2 competitor sides.
- `POST /api/matchup/reset-scores` — Resets competitor scores to 0.
- `POST /api/matchup/reset` — Resets matchup state back to defaults.
- `POST /api/matchup/clock/start` — Resumes or starts the active match countdown or stopwatch.
- `POST /api/matchup/clock/pause` — Pauses the match clock (auto-triggered on set win).
- `POST /api/matchup/clock/reset` — Resets the match clock to duration or 0: `{ seconds }`.
- `POST /api/matchup/clock/set` — Configures clock mode and settings: `{ mode, duration, estimate }`.
- `GET /api/matchup/presets` — List saved matchup presets.
- `POST /api/matchup/presets` — Save a matchup preset.
- `POST /api/matchup/presets/load` — Load a matchup preset to the live scoreboard.
- `DELETE /api/matchup/presets/:id` — Delete a matchup preset.
- `GET /api/tournament/presets` — List saved tournament presets.
- `POST /api/tournament/presets` — Save a tournament preset.
- `POST /api/tournament/presets/load` — Load a tournament preset.
- `DELETE /api/tournament/presets/:id` — Delete a tournament preset.
- `GET /api/tournament/history` — Returns archived tournament brackets history.
- `POST /api/tournament/history/restore` — Restores a past completed tournament bracket to the live studio: `{ id }`.
- `DELETE /api/tournament/history/:id` — Deletes a past tournament history record.
- `POST /api/tournament/history/clear` — Clears all tournament bracket history.
- `GET /api/matchup/history` — Returns archived matchup and exhibition fight sets history.
- `POST /api/matchup/history/restore` — Restores a past matchup set to the live scoreboard: `{ id }`.
- `DELETE /api/matchup/history/:id` — Deletes a past matchup history record.
- `POST /api/matchup/history/clear` — Clears all matchup fight sets history.

## Versus: History, Progress Saves and Overlay Options

- **Save Progress** snapshots the live matchup (scores, clocks, runner times and event log) into History at any time; Restore resumes it.
- Completed matches are recorded with final times, deltas and a timestamped event log.
- Matchup overlay URLs accept `title=0`, `phase=0`, `clock=0`, `tags=0`, `details=0`, `pips=0` and `center=0` to hide individual elements; the Overlays tab has a toggle for each.

## Poll Manager: Overlay Tabs and Themes

- The Overlays tab has Standard Poll, Bracket Tree and Active Match HUD tabs, each with its own preview and URL builder.
- Tournament overlays accept `spacing`, `lines`, `showtitle=0` and `showrounds=0`.
- Poll and tournament overlays share the Versus themes (Championship, Cyber, Clean Light, OLED Black, Ember, Aurora, Ocean, Sunset, Violet, Forest).
- Stopwatch and race clocks broadcast every 250 ms and display milliseconds.
