# Promo Creator

Create a polished stream announcement, download all three PNGs in one ZIP, and share them yourself. Promo Creator is a **separate design studio**, not an OBS overlay or a social-posting tool. There are no social logins, publishing integrations, or background capture jobs.

Open **Tools > Promo Creator**.

![Promo Creator with a fictional stream announcement](images/promo-creator.png)

## Make a promo

1. Choose **New promo** and give the design a reusable name.
2. Write a headline, optional subtitle, and status label such as “LIVE NOW.” Enter your Twitch channel name or channel URL.
3. Add a screenshot/photo and optional artwork/logo. Use **Library** for an existing uploaded image, **Upload** for a new one, **IGDB** to browse game covers/artwork/screenshots, or paste an image outside a text field. An OBS screenshot is simply an image you supply; StreamPulse does not connect to OBS or capture your screen.
4. Pick a one-click visual theme from the gallery. It applies a composed background, coordinated colors, status treatment, and typography. Choose a format to refine, or export immediately.
5. Drag blocks to position them, drag a selected block's corner to resize, or enter percentage coordinates. Use the Composition list to select overlapping blocks, hide unnecessary blocks, or change their front/back order. Arrow keys nudge; Shift moves faster.
6. **Save design** to reuse it, then **Export PNGs** to download one ZIP containing all three full-resolution images, each using its own arrangement. You do not need to switch formats and export separately.

Review screenshots before uploading: make sure chat, private notes, desktop notifications, and other personal information are not visible.

## Three formats, one design

| Format | PNG dimensions |
| --- | --- |
| Square / 1:1 | 1080 × 1080 |
| Landscape / 16:9 | 1920 × 1080 |
| Portrait / 9:16 | 1080 × 1920 |

Each format has **its own arrangement**, visibility, crop, type sizing, and block order. Switching formats preserves your adjustments. Auto-layout changes only the current format, never the other two.

Headline, subtitle, status text, images, Twitch URL, palette, and typeface are shared across the three formats. **Save design** stores all three compositions together. Switching designs or starting again prompts before discarding unsaved changes; saving is manual.

## Instant looks and art direction

The gallery offers **Purple Chaos**, **Vibrant Rainbow**, **Cyberpunk Neon**, **Royal Gold & Navy**, **Fire & Magma**, **Midnight Nebula**, and **Hacker Terminal**. Each gets a static promo treatment: gradient geometry, neon grids, gold framing, or orbital accents. Nothing animates or runs in the background.

Theme changes preserve your text, images, and all three custom arrangements. Hacker Terminal applies monospace typography; Royal Gold & Navy applies serif type. Other looks use bold sans serif. Open **Fine-tune the look** only when you want to change individual colors.

The **Font** chooser offers system fonts, Google Fonts, and fonts already uploaded to your Asset Library. System fonts work offline; Google Fonts need internet the first time they load. Preview and export wait for your chosen font; a failed web-font request produces an error rather than silently exporting with a substitute. Font selection applies to all three formats. Applying a theme resets its suggested font, so choose your custom font afterward.

- **Editorial** frames the photo beside or above a clear text panel.
- **Spotlight** uses a full-bleed photo with a directional shade for readable text.
- **Type first** starts with the photo hidden for a minimal typography-led design.
- Choosing a **Starting layout** applies it immediately to this format. If you have modified its arrangement, confirmation protects your edits. **Rearrange this format** reapplies the current layout; neither action changes your other formats or content.
- Text wraps and shrinks inside its block. Very small blocks truncate overflow; give important headlines enough space.
- Images can fill/crop or contain without cropping. Crop focus controls choose which part of the image stays visible.
- Select a photo/artwork block and choose **Rounded corners**, **Rectangle**, or **Circle crop / logo** in the inspector. Rounded corners have a pixel-radius control; circular crops stay perfectly round even inside a rectangular block. Shape, radius, fit, and crop focus are saved independently per format.
- To round the entire promo rather than just its images, open **Fine-tune the look > Canvas corner radius**. This affects only the current format and leaves transparent PNG corners; `0` keeps a full rectangular canvas.

### Game artwork from IGDB

Both image slots have an **IGDB** picker. Search by game title, choose the exact game, then select a cover, promotional artwork, or screenshot. Availability varies by game. The picker uses the Twitch client credentials configured in Settings; it reports an authentication error if those credentials are unavailable.

StreamPulse imports a full-resolution image into the local Asset Library (up to 20 MB). The actual JPEG, PNG, WebP, GIF, or AVIF format is detected from the response, even when IGDB's URL ends in `.jpg`. Saved designs and PNG exports use that local copy rather than depending on IGDB's image server or cross-origin canvas access. You can reuse it in other promos or overlays through the Library. Importing art does not change your Game Plan or Twitch category.

Artwork remains the property of its respective rights holders; follow the game's media guidelines when sharing.

The QR code always points to your Twitch URL. It stays square inside its block, with a white quiet zone and dark modules. Keep it large enough to scan after resizing or social-site compression. Enter a URL before exporting, or hide the QR block if you do not want one.

## Saved designs and exports

Saved promos live in `data/promos.json`; uploaded images use the existing Asset Library. Full data backups include both. Asset usage lists include saved promos, protect referenced images from accidental deletion, and update references when you rename an asset.

PNG generation happens in your browser using the same renderer as the preview. **Export PNGs** always includes square, landscape, and portrait PNG files in one ZIP. It uses the latest unsaved edits too, but does not save the design automatically. If any format fails, no partial ZIP is downloaded.

Exports contain no editor handles or sample-image labels. A missing image, font, or QR response produces an error instead of silently exporting an incomplete image. Animated images produce a static browser-decoded frame, not an animation. Use an uploaded still image when the exact frame matters.

This is intentionally focused: named headline, subtitle, status, photo, artwork, URL, and QR blocks—not arbitrary overlay layers, animations, or live variables. Export does not require a running Twitch broadcast.
