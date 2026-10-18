# Choice Randomizer Studio & Overlay Guide

The **Choice Randomizer** is a production-ready giveaway and decision overlay featuring spinning wheels, continuous slot-machine rollers, and flip card reveals with integrated audio and Bitfocus Companion remote control.

![Choice Randomizer Studio](images/randomizer-studio.png)

---

## 1. Decoupled Architecture

The Randomizer is built with a decoupled architecture:
- **Studio Controller** (`/randomizer-editor.html`): The streamer's control panel for adding choices, configuring weights, triggering spins, and managing presets.
- **OBS Overlay** (`/overlays/randomizer.html`): Transparent, clean browser source rendered in OBS Studio.
- **Real-Time Synchronization**: Any spin triggered in the Studio or via Stream Deck immediately animates on the OBS overlay across WebSockets.

---

## 2. Display Modes

Select between three visual reveal modes in the Studio:

1. **Spinning Wheel**:
   - Classic fortune wheel with customizable sector colors and needle ticker.
   - Smooth easing physics with deceleration and celebratory winner scale.
2. **Vertical Slot Roller**:
   - Continuous slot-machine roller with authentic ticking audio.
   - Decelerates smoothly and centers precisely on the selected choice.
3. **Flip Card Reveal**:
   - Hidden cards that shuffle and flip open with a 3D perspective animation.

---

## 3. Choice Weighting & Elimination

- **Custom Weights**: Assign relative probability weights to any choice (e.g. rare items at weight `1`, common choices at weight `5`). Arcs on the wheel automatically resize proportionally.
- **Elimination Mode**: Once a choice wins, it is automatically removed from subsequent spins.
- **Auto-Populate Active Chatters**: Click **Load Active Chatters** to instantly populate the wheel with viewers who participated in your stream chat.
- **Persistence Across Reloads**: Preserves choices and remaining pool even if the page or browser source is refreshed.

---

## 4. Audio Effects & Theming

- **Audio Cues**: Integrated Web Audio sound synthesis for acceleration ticks, spinning whir, and winner fanfare.
- **Curated Themes**:
  - `Dark`: Clean slate with subtle borders.
  - `Neon`: Glowing high-contrast cyberpunk accents.
  - `Retro`: 8-bit arcade aesthetic.
  - `Pastel`: Soft, playful gradients.
  - `System`: Matches your StreamPulse admin theme.

---

## 5. Bitfocus Companion & Remote Control

Trigger spins directly from your Stream Deck:
- Endpoint: `POST /api/randomizer/spin` (or `GET /api/randomizer/spin`)
- Optional JSON body: `{"theme": "neon"}`
- When triggered, all connected OBS overlays spin simultaneously and announce the winner with fanfare.
