# Choice Randomizer Studio & Overlay Guide

The **Choice Randomizer** is a production-ready giveaway and decision overlay featuring spinning wheels, continuous slot-machine rollers, celebratory winner cards, and particle confetti with integrated audio and Bitfocus Companion remote control.

![Choice Randomizer Studio](images/randomizer-studio.png)

---

## 1. Decoupled Architecture

The Randomizer is built with a decoupled architecture:
- **Studio Controller** (`/randomizer-editor.html`): The streamer's control panel for adding choices, configuring weights, triggering spins, and managing presets.
- **OBS Overlay** (`/overlays/randomizer.html`): Transparent, clean browser source rendered in OBS Studio.
- **Real-Time Synchronization**: Any spin triggered in the Studio or via Stream Deck immediately animates on the OBS overlay across WebSockets.

### Shared rendering runtime

The Studio monitor and OBS overlay import the same focused modules under `public/js/randomizer/`:
- `stage-rendering.js`: idle roller/deck rendering and card logo/watermark markup.
- `spin-animation.js`: roller, weighted wheel, and four-phase deck animation, including suspense nudges and the instant card reveal.
- `wheel.js`: shared weighted slice geometry and canvas rendering.
- `animation-scope.js`: spin-owned animation frames and nested timers, cancelled when a spin completes or the page is unloaded.

Winner selection, preset persistence, audio controls, REST requests, and WebSocket handling remain in their existing hosts/server. The shared animator receives the selected winner; it does not select a replacement.

The wheel caches one unrotated face (sectors, borders, and labels) and rotates that image during a spin instead of painting every sector and label on every frame. Choices, weights, palette, typography, outline, resolution, and completed font loads invalidate the cache. Resize/DPR and stage-scale changes refresh the current angle using the existing 1160–3200 pixel resolution policy. This trades one additional canvas buffer for fewer repeated drawing operations; it is not a measured CPU/FPS improvement or a guarantee across OBS/browser hardware. The extra RGBA buffer is approximately 5.1 MiB at 1160 square pixels, up to 39.1 MiB at the 3200-pixel cap.

Run the isolated fictional browser regression with `node scripts/test-randomizer-rendering.mjs`. It exercises both consumers and all three display modes without contacting a running StreamPulse server or external services. Its deterministic clock checks rendering, winner alignment, invalidation, and callback cleanup, not real-time GPU performance or audible output.

---

## 2. Display Modes

Select between three distinctive broadcast animation modes in the Studio:

1. **Continuous Slot Roller (`roller`)**:
   - Continuous vertical carousel roller with authentic mechanical ticker audio.
   - Smooth easing physics that decelerate and align precisely on the winner choice.
   - Ideal for narrow OBS sidebars, vertical broadcast docks, and quick rapid-fire choices.
2. **Fortune Spinning Wheel (`wheel`)**:
   - Classic wheel of fortune with customizable sector colors, center cap, and physics needle ticker.
   - Proportional slice sizing automatically adapted to relative choice probability weights.
   - Smooth deceleration physics with winner celebration bounce.
3. **Physical Playing Card Deck (`deck`)**:
   - Physical 3D playing card deck with authentic stacked card edge shadows and live pool count badge.
   - Tactile 4-phase duration-scaled animation: 3D deck cut & packet split, physical decelerating riffle flutter cascade with realistic tick audio, deck square-up with center-stage deal and suspense hover, followed by a dramatic 3D 180° flip reveal with holographic light sheen.
   - **Custom Card Deck Branding**:
     - **Custom Deck Logo**: Upload or enter any image URL (channel emblem, avatar, transparent PNG, SVG) in the Studio to replace the default diamond pattern. The logo is flex-centered across the idle deck stack, split cut packets, falling riffle cards, and the dealt card back.
     - **Custom Deck Watermark**: Set custom bottom watermark text (e.g. channel name) or leave it blank to hide.
     - Saved automatically within Choice Presets and passed to OBS overlays via URL parameters (`&deckLogo=...&deckWatermark=...`) or live WebSocket spin events.
     - The initial top card displays the same watermark before shuffling; clearing the watermark hides it on that card too.
   - Strictly respects the configured spin duration (4s, 6s, 8s, 10s), synchronizing deck shuffle and card flip precisely with Wheel and Slot Roller modes.
   - Interactive on-overlay spin button (`?button=1`) previewed live in the Studio Monitor for touchscreen and interactive OBS browser source control.

All three modes conclude with the **Winner Celebration Card** featuring a particle confetti explosion on your stream overlay, customizable header banners, and triumphant audio fanfare.

---

## 3. Choice Weighting, Persistence & Reset

Configure probability distributions to fit your broadcast format:
- **Equal (1x)**: Standard uniform distribution where every choice has identical winning odds.
- **Manual Weights**: Fine-tune custom probability multipliers per choice with 0.1 precision stepping. Wheel slice angles and percentage odds update in real time. Click **Reset to Equal (1.0)** to set all choices back to equal 1.0x odds.
- **Growth (Pity Mode)**: Unpicked choices gain bonus weight on each spin (`step` parameter), ensuring long-neglected items eventually win. When a choice wins, its pity bonus resets. Click **Reset Pity Streaks** to wipe accrued missed-spin bonuses back to baseline without clearing custom choices.
- **Momentum (Hot Streak)**: Winning choices gain temporary weight boosts for exciting winner-stays streaks. Click **Reset Win Streaks** to clear winning multipliers back to baseline.
- **Preset Saving Required**: Weighting modes and choice statistics are stored within your active Choice Preset. Whenever you switch modes or tweak weights, click **Save** in the Studio to persist changes to the server and update live OBS browser sources and Stream Deck Companion triggers.
- **Elimination Mode**: Once a choice wins, it is automatically removed from subsequent spins.
- **Auto-Populate Active Chatters**: Click **Load Active Chatters** to instantly populate the wheel with viewers who participated in your stream chat.
- **Persistence Across Reloads**: Preserves choices and remaining pool even if the page or browser source is refreshed.

---

## 4. Audio Effects & Theming

- **Audio Cues**: Integrated Web Audio sound synthesis for acceleration ticks, physical card slide friction & snap flip effects, spinning whir, and winner fanfare with browser gesture auto-unlock.
- **Curated Themes**:
  - `Dark`: Clean slate with subtle borders.
  - `Neon`: Glowing high-contrast cyberpunk accents.
  - `Retro`: 8-bit arcade aesthetic.
  - `Pastel`: Soft, playful gradients.
  - `System`: Matches your StreamPulse admin theme.

---

## 5. Bitfocus Companion & Remote Control

Trigger spins directly from your Stream Deck using the wheel, roller, or physical card deck. The Companion action supports 4, 6, 8, or 10-second spins. Its general Randomizer preset displays the last-used mode and duration; a separate **Draw Randomizer Card** preset is ready for deck draws.
- Endpoint: `POST /api/randomizer/spin` (or `GET /api/randomizer/spin`)
- Optional JSON body: `{"theme": "neon", "mode": "deck", "duration": 8}`
- When triggered, all connected OBS overlays spin simultaneously and announce the winner with fanfare.

Set the overlay's display scale in its browser-source URL, for example `http://localhost:3000/overlays/randomizer.html?scale=1.2`. The Studio does not include or change scale; the setting is intentionally controlled by the URL parameter only.
