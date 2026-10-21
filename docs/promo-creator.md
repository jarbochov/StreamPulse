# Promo Creator

Create a polished stream announcement, download all three PNGs in one ZIP, or export a seamless animated MP4 of the selected format.

Open **Tools > Promo Creator**.

![Promo Creator with a fictional stream announcement](images/promo-creator.png)

## Make a promo

1. Promo Creator reopens the last saved design you selected or edited. Choose **New** to start another design, then give it a reusable name.
2. Write a headline, optional subtitle, and status label such as “LIVE NOW.” Enter your Twitch channel name or channel URL.
3. Add a screenshot/photo and optional artwork/logo. Use **Library** for an existing uploaded image, **Upload** for a new one, **IGDB** to browse game covers/artwork/screenshots, or paste an image outside a text field. An OBS screenshot is simply an image you supply; StreamPulse does not connect to OBS or capture your screen.
4. Switch between **Content** and **Appearance** in the left settings rail. Choose a theme, custom colors, font, or background in Appearance; its controls apply to the selected format.
5. Use the Composition list to select elements, hide them, or change their front/back order. Drag an element to move it, drag its corner to resize, or enter percentage coordinates. Elements snap to canvas and neighboring edges/centers; hold Alt while dragging to bypass snapping. Use **Align to canvas** for exact placement. Arrow keys nudge; Shift moves faster.
6. **Save design** to reuse it. **Export 3 PNGs** downloads one ZIP containing all three full-resolution images. **Export 6-second MP4** makes a seamless full-resolution loop for the currently selected format.

Review screenshots before uploading: make sure chat, private notes, desktop notifications, and other personal information are not visible.

## Three formats, one design

| Format | PNG dimensions |
| --- | --- |
| Square / 1:1 | 1080 × 1080 |
| Landscape / 16:9 | 1920 × 1080 |
| Portrait / 9:16 | 1080 × 1920 |

Each format stores only its own **placement** (x, y, size), visibility, and element order. Background, palette, font, corner radius, and all element styling (font, weight, size, fit, shape, border, shadow, opacity, rotation) are shared by every format. The format tabs, active rail tab, and zoom-to-fit controls persist across reloads. **Auto-fit this format** reapplies the starting composition to the current format only.

The editor uses the same controls as the custom overlay editor: layer rows with grip, lock and eye, an Add element menu, range fields with reset, typography/gradient text/outline/shadow/background/border sections, undo/redo (Ctrl/Cmd+Z, Shift+Z), duplicate (Cmd/Ctrl+D), Delete, Ctrl/Cmd+S to save, and a dirty indicator. Elements are live DOM nodes over a cached background canvas, so dragging, resizing and typing stay responsive; PNG/MP4 export uses the same layout rules.

Text, images, QR settings, Twitch URL, palette, and typeface are shared across the three formats. Add Text, Image, or QR elements as needed; each element's content/source stays the same while placement, size, crop, and focus are stored per format. Adding game artwork enables its separate, contain-fit element in all three formats. **Save design** stores the shared elements and all three compositions together. The button changes to **Save changes** when anything needs saving, and switching designs or starting again prompts before discarding edits.

Gradient backgrounds support linear, radial and conic types with an optional middle color. Pattern motions (drift, soft pulse, light sweep, aurora ribbons, sweeping gradient, sway, orbit, linear pan at any angle) have a loops-per-6-seconds speed control and always loop seamlessly in preview and MP4 export.

## Background, appearance, and custom themes

Themes are optional starting points in the **Background & style > Theme** picker, not a separate gallery. Built-in choices include **Purple Chaos**, **Vibrant Rainbow**, **Cyberpunk Neon**, **Royal Gold & Navy**, **Fire & Magma**, **Midnight Nebula**, and **Hacker Terminal**, plus Studio light and Ember.

Choosing a theme applies its palette and font across the promo, and its background to the **current format only**. It preserves your text, image elements, geometry, and other formats' background settings. Hacker Terminal suggests monospace typography; Royal Gold & Navy suggests serif type.

To make your own, change the palette, font, and background, then choose **Save current look as a reusable theme** and enter a name. The saved theme is available under **Your themes** in every promo. That dialog also lets you select an existing theme to update or delete. A theme contains appearance only, not element content, images, or arrangement.

Applying a saved theme copies its settings into the promo; later updates/deletion of the theme do not change existing designs. **Save design** separately to retain your promo edits.

### Backgrounds

Background controls affect only the selected ratio:

| Style | Controls |
| --- | --- |
| Theme artwork | Built-in composed background, including its decorative accents |
| Solid color | One flat color, with no decorative theme artwork |
| Gradient | Start/end colors and direction angle |
| Transparent | No background; the preview checkerboard is not exported |
| Image | Upload or Library, fill/crop or contain, crop focus, and darkening |
| Pattern | 20 choices: grid, geometry, orbits, hexagons, diamonds, isometric tiles, curved mesh, sunburst, triangles, chevrons, checkerboard, waves, concentric rings, scales, topographic contours, starfield, sparkles, dots, confetti, or circuit board. Hexagons form a flat-top, staggered lattice: neighboring cells share edges without gaps or overlaps. |
| Pattern motion | Still, drift, soft pulse, light sweep, aurora ribbons, sweeping gradient, sway and zoom, or orbit. Motion previews in the editor and loops seamlessly in MP4 exports. |
| Edge vignette | Adjustable 0–70% soft darkening; starts at a subtle 18% on new promos and is skipped for transparent backgrounds |

Patterns, motion, vignette strength, image crop, and canvas corner radius save independently per format. New promos start with a subtle edge vignette. An image background is separate from image elements. A saved custom theme can include its library image and vignette; the Asset Library tracks image references too. If an image background is selected without an image, export reports the affected format instead of silently producing an incomplete pack.

The **Font** chooser offers system fonts, Google Fonts, and fonts already uploaded to your Asset Library. System fonts work offline; Google Fonts need internet the first time they load. Preview and export wait for your chosen font; a failed web-font request produces an error rather than silently exporting with a substitute. Font selection applies to all three formats. Applying a theme resets its suggested font, so choose your custom font afterward.

- **Editorial** frames the photo beside or above a clear text panel.
- **Spotlight** uses a full-bleed photo with a directional shade for readable text.
- **Type first** starts with the photo hidden for a minimal typography-led design.
- Choosing a **Starting layout** applies it immediately to this format. If you have modified its arrangement, confirmation protects your edits. **Rearrange this format** reapplies the current layout; neither action changes your other formats or content.
- Starting layouts keep the headline and supporting copy in dedicated areas with a separate artwork position. Add artwork once to enable its reserved slot in all formats, then adjust each format as needed.
- Text wraps and shrinks inside its element. Choose a font, alignment, and **Font weight** from Light (300) through Black (900); weight and maximum font size save independently per format. New headlines and status labels start at a less-heavy semibold weight. Very small elements truncate overflow; give important headlines enough space.
- Images can fill/crop or contain without cropping. Crop focus controls choose which part of the image stays visible.
- Select an image element and choose **Rounded corners**, **Rectangle**, or **Circle crop / logo** in the inspector. Rounded corners have a pixel-radius control; circular crops stay perfectly round even inside a rectangular element. Shape, radius, fit, and crop focus are saved independently per format.
- To round the entire promo rather than just its images, open **Background & style > Canvas corner radius**. This affects only the current format and leaves transparent PNG corners; `0` keeps a full rectangular canvas.

### Game artwork from IGDB

Both image slots have an **IGDB** picker. Search by game title, choose the exact game, then select a cover, promotional artwork, or screenshot. Availability varies by game. The picker uses the Twitch client credentials configured in Settings; it reports an authentication error if those credentials are unavailable.

StreamPulse imports a full-resolution image into the local Asset Library (up to 20 MB). The actual JPEG, PNG, WebP, GIF, or AVIF format is detected from the response, even when IGDB's URL ends in `.jpg`. Saved designs and PNG exports use that local copy rather than depending on IGDB's image server or cross-origin canvas access. You can reuse it in other promos or overlays through the Library. Importing art does not change your Game Plan or Twitch category.

Artwork remains the property of its respective rights holders; follow the game's media guidelines when sharing.

The default QR element points to your Twitch URL. It stays square inside its placement, with a white quiet zone and dark modules. Keep it large enough to scan after resizing or social-site compression. Enter a URL before exporting, or hide the QR element if you do not want one.

## Saved designs and exports

Saved promos live in `data/promos.json`, reusable custom themes in `data/promo-themes.json`, and uploaded images in the existing Asset Library. Full data backups include these files and assets. Use **Backup & Restore → Share individual items** to export a single promo scene with its referenced images and uploaded fonts, then import that ZIP on another StreamPulse installation. Copy, replace, and skip options handle scene ID conflicts. Asset usage lists include saved promos and themes, protect referenced images from accidental deletion, and update background/image references when you rename an asset.

PNG generation happens in your browser using the same renderer as the preview. **Export PNGs** always includes square, landscape, and portrait PNG files in one ZIP. It uses the latest unsaved edits too, but does not save the design automatically. If any format fails, no partial ZIP is downloaded.

Animated MP4 export uses the selected format and the latest unsaved edits; it does not save the design. Safari uses its native MP4 recorder when available; other supported browsers use browser H.264 encoding. The export control is disabled when the browser does not report compatible MP4/H.264 support. Transparent backgrounds are flattened using the promo palette because MP4 does not support transparency. Motion effects are designed as six-second loops; GIF export is not provided.

Exports contain no editor handles or sample-image labels. A missing image, font, or QR response produces an error instead of silently exporting an incomplete image. Uploaded animated images are rendered as a static browser-decoded frame; the MP4 animation is generated by the selected background motion. Use an uploaded still image when the exact frame matters.

Promo Creator uses the same Text, Image, and QR element types as the custom overlay editor. Other overlay-specific element types and live variables are not included; export does not require a running Twitch broadcast.
