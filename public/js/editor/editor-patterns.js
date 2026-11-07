/**
 * StreamPulse Custom Overlay Editor — Pattern Tile & Procedural Pattern Inspector Module
 */

import { esc, primary, selectedElements, changed, toast } from './editor-state.js';
import { F } from './editor-form.js';
import { renderCanvas } from './editor-canvas.js';

const FALLBACK_PATTERN_CATEGORIES = [
    { group: 'Geometric', options: [['grid', 'Grid'], ['geometry', 'Geometry'], ['orbits', 'Orbits'], ['hexagons', 'Hexagons'], ['diamonds', 'Diamonds'], ['isometric', 'Isometric tiles'], ['mesh', 'Curved mesh'], ['sunburst', 'Sunburst'], ['triangles', 'Triangles'], ['chevrons', 'Chevrons'], ['checker', 'Checkerboard']] },
    { group: 'Organic & decorative', options: [['waves', 'Waves'], ['rings', 'Rings'], ['scales', 'Scales'], ['topography', 'Topography'], ['circuit', 'Circuit board']] },
    { group: 'Particle & field', options: [['starfield', 'Starfield'], ['sparkles', 'Sparkles'], ['dots', 'Dots'], ['confetti', 'Confetti']] },
    { group: 'Seasonal & holiday', options: [['leaves', 'Autumn leaves'], ['turkeys', 'Thanksgiving turkeys'], ['pumpkins', 'Pumpkins & harvest'], ['christmas-trees', 'Christmas trees'], ['christmas-lights', 'Christmas string lights'], ['snowflakes', 'Snowflakes'], ['hearts', 'Floating hearts'], ['fireworks', 'Celebration fireworks']] }
];

export function proceduralPatternContentFields(el) {
    const p = el.pattern || {};
    const patterns = (window.StreamPulsePatterns?.PATTERN_CATEGORIES) || FALLBACK_PATTERN_CATEGORIES;
    return `
        ${F.select('pattern.preset', 'Generative pattern', p.preset || 'hexagons', patterns)}
        <span class="hint">Generative procedural backgrounds render pure vector geometry across the layer frame with zero seams. Customize colors, fill styles, line weights, scale, and animation under the <strong>Style</strong> tab.</span>
    `;
}

export function proceduralPatternSection(el) {
    const p = el.pattern || {};
    const palette = p.palette || 'dual';
    const fillMode = p.fillMode || 'tinted';
    const motion = p.motion || 'drift';
    const blendMode = p.blendMode || 'normal';
    const secColor = (p.secondary && p.secondary !== 'transparent') ? p.secondary : (p.accent || '#38bdf8');
    const palettesDict = window.StreamPulsePatterns?.PALETTES || {};

    const paletteOptions = [
        ['dual', 'Custom Two-Tone (Accent & Secondary)'],
        ['multicolor', 'Festive Multicolor (7 Jewel Tones)'],
        ['warm', 'Warm Hearth (Amber, Crimson, Gold, Rose)'],
        ['cool', 'Cool Frost (Ice Blue, Mint, Lilac, Slate)'],
        ['autumn', 'Autumn Harvest (Foliage Red, Orange, Gold)'],
        ['pastel', 'Soft Pastel (Coral, Mint, Lavender)']
    ];

    let colorFields = F.select('pattern.palette', 'Color palette', palette, paletteOptions);

    if (palette !== 'dual' && palettesDict[palette]) {
        const swatches = palettesDict[palette].map(c => `<span style="flex:1;background:${c};height:100%;"></span>`).join('');
        colorFields += `
            <div class="pattern-palette-bar" style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin:4px 0 10px;" title="Curated palette preview">
                ${swatches}
            </div>
            <p class="hint" style="margin:2px 0 8px;">Shapes, lights, and foliage alternate through the curated palette.</p>
            <details class="sub-details" style="margin-bottom:8px;">
                <summary>Custom fallback colors</summary>
                <div class="grid2" style="margin-top:6px;">
                    ${F.color('pattern.accent', 'Primary / accent', p.accent || '#58a6ff')}
                    ${F.color('pattern.secondary', 'Secondary color', secColor, { clear: true })}
                </div>
            </details>
        `;
    } else {
        colorFields += `
            <div class="grid2">
                ${F.color('pattern.accent', 'Primary / accent color', p.accent || '#58a6ff')}
                ${F.color('pattern.secondary', 'Secondary color', secColor, { clear: true })}
            </div>
        `;
    }

    const fillModeOptions = [
        ['tinted', 'Translucent Tint (Glass / Ambient)'],
        ['solid', 'Solid Color (Vibrant Opaque)'],
        ['outline', 'Wireframe Outlines Only']
    ];

    let fillBlock = F.select('pattern.fillMode', 'Fill style', fillMode, fillModeOptions);
    if (fillMode !== 'outline') {
        const defaultOp = fillMode === 'solid' ? 100 : 30;
        fillBlock += F.range('pattern.fillOpacity', 'Fill opacity', p.fillOpacity ?? defaultOp, { min: 0, max: 100, step: 5, unit: '%', editable: true, reset: defaultOp });
    } else {
        fillBlock += '<span class="hint">Shapes render as clean vector outlines with hollow interiors.</span>';
    }

    const styleBlock = `
        ${colorFields}
        ${fillBlock}
        <div class="grid2">
            ${F.color('pattern.color', 'Canvas base fill', p.color || 'transparent', { clear: true })}
            ${F.number('pattern.lineWidth', 'Line width (px, 0=auto)', p.lineWidth || 0, { min: 0, max: 20, step: 0.5 })}
        </div>
        ${F.range('pattern.scale', 'Geometry scale', p.scale ?? 100, { min: 10, max: 500, step: 5, unit: '%', editable: true, reset: 100 })}
    `;

    let motionBlock = F.select('pattern.motion', 'Animation motion', motion, [
        ['none', 'Static (no animation)'],
        ['drift', 'Drift (gentle floating drift)'],
        ['fall', 'Fall (continuous falling cascade)'],
        ['sway', 'Sway (breathing tilt & scale)'],
        ['pulse', 'Pulse (rhythmic breath)'],
        ['orbit', 'Orbit (subtle celestial orbit)'],
        ['sweep', 'Sweep (scanner light sweep)'],
        ['aurora', 'Aurora (glowing color ribbons)'],
        ['pan', 'Pan (continuous smooth glide)']
    ]);

    if (motion !== 'none') {
        motionBlock += `<div class="grid2">
            ${F.number('pattern.speed', 'Motion speed (multiplier)', p.speed ?? 1, { min: 0.1, max: 10, step: 0.1 })}
            ${F.select('pattern.blendMode', 'Blend mode', blendMode, [
                ['normal', 'Normal'],
                ['screen', 'Screen (glow on dark)'],
                ['overlay', 'Overlay'],
                ['color-dodge', 'Color dodge'],
                ['multiply', 'Multiply'],
                ['soft-light', 'Soft light'],
                ['luminosity', 'Luminosity']
            ])}
        </div>`;
    } else {
        motionBlock += F.select('pattern.blendMode', 'Blend mode', blendMode, [
            ['normal', 'Normal'],
            ['screen', 'Screen (glow on dark)'],
            ['overlay', 'Overlay'],
            ['color-dodge', 'Color dodge'],
            ['multiply', 'Multiply'],
            ['soft-light', 'Soft light'],
            ['luminosity', 'Luminosity']
        ]);
    }

    motionBlock += '<span class="hint">Generative procedural backgrounds render vector mathematics across the full layer frame with zero seams.</span>';

    return F.section('proceduralStyle', 'Colors & Fill Style', styleBlock)
        + F.section('proceduralMotion', 'Animation & Motion', motionBlock);
}

export function patternContentSection(el, focusFieldFn, iconEffectsSectionFn) {
    const p = el.pattern || {};
    const sourceType = p.sourceType || 'image';
    const extraTiles = Array.isArray(p.tiles) ? p.tiles : [];
    const totalTiles = 1 + extraTiles.length;
    const isMultiTile = extraTiles.length > 0;

    if (sourceType === 'preset') {
        return F.section('content', 'Content', `
            ${F.select('pattern.sourceType', 'Pattern mode', sourceType, [
                ['preset', 'Procedural Vector Pattern'],
                ['image', 'Image / Icon Tiles (1–4 Slots)'],
                ['icon', 'Icon / Emoji Tiles (1–4 Slots)']
            ])}
            ${proceduralPatternContentFields(el)}
            <span class="hint">Rendering full-bleed vector geometry with zero seams. Switch to Image or Icon above for repeating tile mosaics.</span>
        `);
    }

    const cropSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>';
    const plusSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    const trashSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

    // Primary Tile (Slot 1)
    let slot1Body = '';
    if (sourceType === 'icon') {
        slot1Body = `
            <div class="field">
                <span>Font Awesome class or emoji</span>
                <span class="upload-row">
                    <input data-path="content" data-kind="text" value="${esc(el.content || 'fa-brands fa-twitch')}" placeholder="e.g. fa-solid fa-star or emoji" maxlength="80">
                    <button type="button" id="pick-icon">Browse Icons…</button>
                </span>
            </div>
            ${F.color('style.color', 'Icon color', el.style?.color || '#ffffff')}
        `;
    } else {
        slot1Body = `
            <div class="field">
                <span>Tile image</span>
                <span class="upload-row">
                    <input id="prop-src" data-path="src" value="${esc(el.src || '')}" placeholder="https://… or library asset" spellcheck="false">
                    <button type="button" id="open-assets">Library…</button>
                </span>
            </div>
            <div class="field">
                <span>Upload</span>
                <span class="upload-row">
                    <input id="prop-upload" type="file" accept="image/*">
                    ${el.src && !/\{\{/.test(el.src) ? `<button type="button" id="crop-image-btn" title="Crop or reframe this image">${cropSvg}Crop &amp; Edit Image</button>` : '<span></span>'}
                </span>
                ${!el.src ? '<span class="hint">No image selected yet — displaying the sample crystal motif on canvas.</span>' : ''}
            </div>
        `;
    }

    if (isMultiTile) {
        slot1Body += F.range('pattern.tile1Scale', 'Tile 1 relative scale', p.tile1Scale ?? 100, { min: 25, max: 200, step: 5, unit: '%', editable: true, reset: 100 });
    }

    const slot1Card = `
        <div class="pattern-slot-card" data-slot-index="0">
            <div class="pattern-slot-head">
                <span class="pattern-slot-badge">Tile 1${isMultiTile ? ' · Primary' : ''}</span>
                <select class="pattern-slot-type-select" data-path="pattern.sourceType" data-kind="text" aria-label="Tile 1 source type">
                    <option value="image"${sourceType === 'image' ? ' selected' : ''}>Image</option>
                    <option value="icon"${sourceType === 'icon' ? ' selected' : ''}>Icon / Emoji</option>
                    <option value="preset"${sourceType === 'preset' ? ' selected' : ''}>Procedural Preset</option>
                </select>
            </div>
            <div class="pattern-slot-body">
                ${slot1Body}
            </div>
        </div>
    `;

    // Extra Tile Slots (Tiles 2–4)
    const extraCards = extraTiles.map((slot, idx) => {
        const sType = slot?.sourceType === 'icon' ? 'icon' : 'image';
        const slotNum = idx + 2;
        const basePath = `pattern.tiles.${idx}`;
        const slotBody = sType === 'icon'
            ? `
                <div class="field">
                    <span>Font Awesome class or emoji</span>
                    <span class="upload-row">
                        <input data-path="${basePath}.content" data-kind="text" value="${esc(slot?.content || 'fa-solid fa-star')}" placeholder="e.g. fa-solid fa-star" maxlength="80">
                        <button type="button" data-pattern-slot-icon="${idx}">Browse Icons…</button>
                    </span>
                </div>
                ${F.color(`${basePath}.color`, 'Icon color', slot?.color || '#ffffff')}
            `
            : `
                <div class="field">
                    <span>Tile image</span>
                    <span class="upload-row">
                        <input data-path="${basePath}.src" data-kind="text" value="${esc(slot?.src || '')}" placeholder="https://… or library asset" spellcheck="false">
                        <button type="button" data-pattern-slot-lib="${idx}">Library…</button>
                    </span>
                </div>
                <div class="field">
                    <span>Upload</span>
                    <span class="upload-row">
                        <input type="file" accept="image/*" data-pattern-slot-upload="${idx}">
                        ${slot?.src && !/\{\{/.test(slot.src) ? `<button type="button" data-pattern-slot-crop="${idx}" title="Crop or reframe this tile image">${cropSvg}Crop</button>` : '<span></span>'}
                    </span>
                </div>
            `;
        return `
            <div class="pattern-slot-card" data-slot-index="${idx + 1}">
                <div class="pattern-slot-head">
                    <span class="pattern-slot-badge">Tile ${slotNum}</span>
                    <div class="pattern-slot-actions">
                        <select class="pattern-slot-type-select" data-path="${basePath}.sourceType" data-kind="text" aria-label="Tile ${slotNum} source type">
                            <option value="image"${sType === 'image' ? ' selected' : ''}>Image</option>
                            <option value="icon"${sType === 'icon' ? ' selected' : ''}>Icon / Emoji</option>
                        </select>
                        <button type="button" class="pattern-slot-remove" data-remove-pattern-tile="${idx}" title="Remove Tile ${slotNum}" aria-label="Remove Tile ${slotNum}">${trashSvg}</button>
                    </div>
                </div>
                <div class="pattern-slot-body">
                    ${slotBody}
                    ${F.range(`${basePath}.scale`, `Tile ${slotNum} relative scale`, slot?.scale ?? 100, { min: 25, max: 200, step: 5, unit: '%', editable: true, reset: 100 })}
                </div>
            </div>
        `;
    }).join('');

    const addSlotBtn = totalTiles < 4
        ? `<button type="button" id="btn-add-pattern-tile" class="pattern-add-slot-btn">${plusSvg}Add Tile Slot (${totalTiles} / 4)</button>`
        : `<p class="hint" style="margin:4px 0 0;text-align:center;">Maximum 4 repeating tile slots active.</p>`;

    const distControl = isMultiTile
        ? `<div class="pattern-dist-box">
            ${F.select('pattern.tileDistribution', 'Multi-tile sequence / distribution', p.tileDistribution || 'diagonal', [
                ['diagonal', 'Diagonal weave (A → B → C)'],
                ['row', 'Alternating rows'],
                ['col', 'Alternating columns'],
                ['grid', '2×2 Quadrant matrix'],
                ['random', 'Organic random mix']
            ])}
            <p class="hint" style="margin-top:2px;">Controls how your ${totalTiles} tiles alternate across the grid. Set <strong>Tile aspect ratio → Natural</strong> in Style &gt; Grid configuration if mixing wide and square logos.</p>
        </div>`
        : '';

    const hasAnyImageSlot = sourceType === 'image' || extraTiles.some(t => (t?.sourceType || 'image') === 'image');
    const hasAnyIconSlot = sourceType === 'icon' || extraTiles.some(t => t?.sourceType === 'icon');

    const sharedImageFit = (hasAnyImageSlot && p.aspectRatio !== 'natural')
        ? F.select('style.objectFit', 'Image fit inside tile', el.style?.objectFit || 'contain', [
            ['contain', 'Contain (full image)'],
            ['cover', 'Cover (crop to tile)'],
            ['fill', 'Stretch to fill']
        ]) + (typeof focusFieldFn === 'function' ? focusFieldFn(el) : '')
        : '';

    return F.section('content', `Pattern Tiles (${totalTiles} / 4)`, `
        <div class="pattern-slots-stack">
            ${slot1Card}
            ${extraCards}
        </div>
        ${addSlotBtn}
        ${distControl}
        ${sharedImageFit}
    `) + (hasAnyIconSlot && typeof iconEffectsSectionFn === 'function' ? iconEffectsSectionFn(el) : '');
}

export function patternSection(el) {
    const p = el.pattern || {};
    if (p.sourceType === 'preset') return proceduralPatternSection(el);
    const layout = (p.layout === 'kaleidoscope-quad' || p.layout === 'kaleidoscope-radial') ? 'grid' : (p.layout || 'brick');
    const symmetry = ['none', 'quad', 'radial'].includes(p.symmetry)
        ? p.symmetry
        : (p.layout === 'kaleidoscope-quad' ? 'quad' : (p.layout === 'kaleidoscope-radial' || p.motion === 'kaleidoscope' ? 'radial' : 'none'));
    const kaleidoMorph = p.kaleidoMorph !== undefined ? Boolean(p.kaleidoMorph) : true;
    const motion = p.motion === 'kaleidoscope' ? 'none' : (p.motion || 'scroll');
    const hueShift = p.hueShift || 'none';
    const isKaleido = symmetry === 'quad' || symmetry === 'radial';
    const isAlt = layout === 'alternating';
    const isChecker = layout === 'checkerboard';
    const hasCustomOffsets = layout === 'grid' || layout === 'brick' || layout === 'stagger';
    const extraTiles = Array.isArray(p.tiles) ? p.tiles : [];
    const isMultiTile = extraTiles.length > 0;

    // 1. Grid Configuration & Symmetry
    const secLayout = F.section('patternLayout', 'Grid configuration', `
        <div class="grid2">
            ${F.select('pattern.layout', 'Grid arrangement', layout, [
                ['brick', 'Brick (row offset)'],
                ['grid', 'Straight grid'],
                ['stagger', 'Column stagger'],
                ['alternating', 'Alternating flip / tilt'],
                ['checkerboard', 'Checkerboard (2-tone)']
            ])}
            ${F.select('pattern.aspectRatio', 'Tile aspect ratio', p.aspectRatio || '1:1', [
                ['1:1', '1:1 (Square)'],
                ['natural', 'Natural (Original image)'],
                ['16:9', '16:9 (Widescreen)'],
                ['4:3', '4:3 (Standard)'],
                ['3:2', '3:2 (Classic)'],
                ['2:1', '2:1 (Banner)'],
                ['3:4', '3:4 (Portrait)'],
                ['9:16', '9:16 (Vertical)']
            ])}
        </div>
        ${isMultiTile ? F.select('pattern.tileDistribution', 'Multi-tile sequence', p.tileDistribution || 'diagonal', [
            ['diagonal', 'Diagonal weave (A → B → C)'],
            ['row', 'Alternating rows'],
            ['col', 'Alternating columns'],
            ['grid', '2×2 Quadrant matrix'],
            ['random', 'Organic random mix']
        ]) : ''}
        ${isMultiTile && p.aspectRatio === 'natural' ? '<p class="hint" style="margin-top:-2px;">Natural aspect ratio preserves each tile\'s native proportions with area-balanced sizing so wide, square, and tall tiles have balanced visual weight.</p>' : ''}
        <div class="grid2">
            ${F.select('pattern.symmetry', 'Tile symmetry / kaleidoscope', symmetry, [
                ['none', 'None (Standard tile)'],
                ['quad', '4-Way Mirror Medallion'],
                ['radial', 'Radial Mandala Symmetry']
            ])}
            ${symmetry === 'radial' ? F.range('pattern.wedges', 'Mandala wedges', p.wedges ?? 6, { min: 4, max: 16, step: 2, editable: true, reset: 6 }) : '<span></span>'}
        </div>
        ${isKaleido ? `
            ${F.check('pattern.kaleidoMorph', 'Internal kaleidoscope morph (mirrors revolve inside tiles)', kaleidoMorph)}
            ${kaleidoMorph ? `<div class="grid3">
                ${F.number('pattern.kaleidoSpeed', 'Morph cycle (s)', p.kaleidoSpeed ?? 8, { min: 0.5, max: 120, step: 0.5 })}
                ${F.select('pattern.kaleidoDirection', 'Morph dir', p.kaleidoDirection || 'cw', [['cw', 'Clockwise'], ['ccw', 'Counter-CW']])}
                ${F.range('pattern.kaleidoDepth', 'Petal drift', p.kaleidoDepth ?? 35, { min: 5, max: 100, step: 5, unit: '%', editable: true, reset: 35 })}
            </div>` : ''}
        ` : ''}
        <div class="grid2">
            ${F.range('pattern.tileSize', 'Tile size', p.tileSize ?? 96, { min: 16, max: 512, step: 4, unit: 'px', editable: true, reset: 96 })}
            ${F.range('pattern.gap', 'Tile spacing', p.gap ?? 16, { min: 0, max: 256, step: 2, unit: 'px', editable: true, reset: 16 })}
        </div>
        ${hasCustomOffsets ? `<div class="grid2">
            ${F.range('pattern.offsetX', 'Row stagger', p.offsetX ?? (layout === 'brick' ? 50 : 0), { min: 0, max: 100, step: 5, unit: '%', editable: true, reset: layout === 'brick' ? 50 : 0 })}
            ${F.range('pattern.offsetY', 'Col stagger', p.offsetY ?? (layout === 'stagger' ? 50 : 0), { min: 0, max: 100, step: 5, unit: '%', editable: true, reset: layout === 'stagger' ? 50 : 0 })}
        </div>` : ''}
        <div class="grid2">
            ${F.range('pattern.angle', 'Grid rotation', p.angle ?? -15, { min: -180, max: 180, step: 5, unit: '°', editable: true, reset: -15 })}
            ${F.range('pattern.tileAngle', isKaleido ? 'Motif angle' : 'Tile tilt', p.tileAngle ?? 0, { min: -180, max: 180, step: 5, unit: '°', editable: true, reset: 0 })}
        </div>
        ${isAlt ? `
            ${F.select('pattern.alternateFlip', 'Odd-tile flip mode', p.alternateFlip || 'tilt', [
                ['tilt', 'Counter-tilt angle (+/−)'],
                ['h', 'Mirror horizontal'],
                ['v', 'Mirror vertical'],
                ['both', 'Mirror both (180°)'],
                ['none', 'Scale & opacity only']
            ])}
            <div class="grid2">
                ${F.range('pattern.altOpacity', 'Odd-tile opacity', (p.altOpacity ?? 1) * 100, { min: 0, max: 100, step: 5, unit: '%', editable: true, scale: 0.01, reset: 100 })}
                ${F.range('pattern.altScale', 'Odd-tile scale', p.altScale ?? 100, { min: 25, max: 175, step: 5, unit: '%', editable: true, reset: 100 })}
            </div>
        ` : ''}
        ${isChecker ? `
            <div class="grid2">
                ${F.range('pattern.altOpacity', 'Secondary opacity', (p.altOpacity ?? 0.4) * 100, { min: 0, max: 100, step: 5, unit: '%', editable: true, scale: 0.01, reset: 40 })}
                ${F.range('pattern.altScale', 'Secondary scale', p.altScale ?? 100, { min: 25, max: 175, step: 5, unit: '%', editable: true, reset: 100 })}
            </div>
        ` : ''}
    `);

    // 2. Motion & Animation
    let motionFields = '';
    if (motion === 'scroll' || motion === 'scroll-spin') {
        const scrollTrackOpts = [
            ['uniform', 'All tiles together'],
            ['alt-rows', 'Alternating rows (opposing)'],
            ['stagger-rows', 'Parallax rows (2x / 1x)'],
            ['alt-cols', 'Alternating columns (opposing)'],
            ['stagger-cols', 'Parallax columns (2x / 1x)']
        ];
        motionFields = `
            <div class="grid2">
                ${F.range('pattern.scrollAngle', 'Scroll direction', p.scrollAngle ?? 315, { min: 0, max: 360, step: 15, unit: '°', editable: true, reset: 315 })}
                ${F.number('pattern.speed', 'Scroll cycle (sec)', p.speed ?? 12, { min: 0.5, max: 120, step: 0.5 })}
            </div>
            ${F.select('pattern.trackMode', 'Row / column behavior', p.trackMode || 'uniform', scrollTrackOpts)}
        `;
        if (motion === 'scroll-spin') {
            motionFields += `
                <div class="grid2">
                    ${F.number('pattern.spinSpeed', 'Spin cycle (sec)', p.spinSpeed ?? 8, { min: 0.5, max: 120, step: 0.5 })}
                    ${F.select('pattern.spinDirection', 'Spin direction', p.spinDirection || 'cw', [
                        ['cw', 'Clockwise'],
                        ['ccw', 'Counter-clockwise'],
                        ['alternate', 'Alternating (checkerboard)']
                    ])}
                </div>
            `;
        }
    } else if (motion === 'alt-rows' || motion === 'alt-cols') {
        const axisLabel = motion === 'alt-rows' ? 'Row' : 'Column';
        const trackMode = p.trackMode && p.trackMode !== 'uniform' ? p.trackMode : 'opposite';
        motionFields = `
            <div class="grid2">
                ${F.select('pattern.trackMode', `${axisLabel} motion style`, trackMode, [
                    ['opposite', 'Opposite directions (continuous)'],
                    ['sine', 'Sine-wave slide (back & forth)'],
                    ['stagger', 'Parallax speeds (fast / slow)'],
                    ['alternate-stop', 'Every other track slides']
                ])}
                ${F.number('pattern.speed', 'Cycle speed (sec)', p.speed ?? 12, { min: 0.5, max: 120, step: 0.5 })}
            </div>
            <div class="grid2">
                ${F.select('pattern.spinDirection', 'Slide direction', p.spinDirection || 'cw', [
                    ['cw', 'Forward'],
                    ['ccw', 'Reverse']
                ])}
                ${trackMode === 'sine' ? F.range('pattern.waveAmount', 'Slide distance', p.waveAmount ?? 25, { min: 5, max: 100, step: 5, unit: '%', editable: true, reset: 25 }) : '<span></span>'}
            </div>
        `;
    } else if (motion === 'weave') {
        motionFields = `
            <div class="grid2">
                ${F.number('pattern.speed', 'Weave cycle (sec)', p.speed ?? 12, { min: 0.5, max: 120, step: 0.5 })}
                ${F.select('pattern.trackMode', 'Weave style', (p.trackMode === 'alternate-stop' ? 'alternate-stop' : 'opposite'), [
                    ['opposite', 'Opposing tracks (push-pull)'],
                    ['alternate-stop', 'Single track step']
                ])}
            </div>
            <p class="hint">Rows slide horizontally, then columns slide vertically in a rhythmic choreographed loop.</p>
        `;
    } else if (motion === 'spin') {
        motionFields = `
            <div class="grid2">
                ${F.number('pattern.spinSpeed', 'Spin cycle (sec)', p.spinSpeed ?? 8, { min: 0.5, max: 120, step: 0.5 })}
                ${F.select('pattern.spinDirection', 'Direction', p.spinDirection || 'cw', [
                    ['cw', 'Clockwise'],
                    ['ccw', 'Counter-clockwise'],
                    ['alternate', 'Alternating (checkerboard)']
                ])}
            </div>
        `;
    } else if (motion === 'sway') {
        motionFields = `
            <div class="grid2">
                ${F.number('pattern.speed', 'Drift cycle (sec)', p.speed ?? 12, { min: 0.5, max: 120, step: 0.5 })}
                ${F.number('pattern.spinSpeed', 'Tilt cycle (sec)', p.spinSpeed ?? 8, { min: 0.5, max: 120, step: 0.5 })}
            </div>
            <div class="grid2">
                ${F.range('pattern.waveAmount', 'Sway intensity', p.waveAmount ?? 25, { min: 5, max: 100, step: 5, unit: '%', editable: true, reset: 25 })}
                ${F.select('pattern.spinDirection', 'Tilt sync', p.spinDirection || 'cw', [
                    ['cw', 'Synchronized wave'],
                    ['alternate', 'Alternating counter-rock']
                ])}
            </div>
        `;
    } else if (motion === 'wave') {
        motionFields = `
            <div class="grid2">
                ${F.number('pattern.spinSpeed', 'Wave cycle (sec)', p.spinSpeed ?? 8, { min: 0.5, max: 120, step: 0.5 })}
                ${F.range('pattern.waveAmount', 'Pulse depth', p.waveAmount ?? 25, { min: 5, max: 100, step: 5, unit: '%', editable: true, reset: 25 })}
            </div>
        `;
    } else if (motion === 'float') {
        motionFields = `
            <div class="grid2">
                ${F.number('pattern.jitterSpeed', 'Float cycle (sec)', p.jitterSpeed ?? 6, { min: 0.5, max: 60, step: 0.5 })}
                ${F.range('pattern.waveAmount', 'Float amplitude', p.waveAmount ?? 25, { min: 5, max: 100, step: 5, unit: '%', editable: true, reset: 25 })}
            </div>
            <p class="hint">Each tile gently bobs, drifts, and rocks on its own independent phase.</p>
        `;
    }

    const secMotion = F.section('patternMotion', 'Grid motion & animation', `
        ${F.select('pattern.motion', 'Grid motion style', motion, [
            ['scroll', 'Continuous Scroll'],
            ['alt-rows', 'Alternating Rows (Slide)'],
            ['alt-cols', 'Alternating Columns (Slide)'],
            ['weave', 'Rhythmic Grid Weave (Row ↔ Col)'],
            ['sway', 'Floating Sway & Rock'],
            ['float', 'Organic Per-Tile Float'],
            ['spin', 'In-Place Tile Spin'],
            ['scroll-spin', 'Scroll + Tile Spin'],
            ['wave', 'Ripple Scale Wave'],
            ['none', 'Static (No Grid Motion)']
        ])}
        ${motionFields}
    `);

    // 3. Appearance & Blend
    const secAppearance = F.section('patternAppearance', 'Tile appearance & blend', `
        <div class="grid2">
            ${F.range('pattern.tileOpacity', 'Tile opacity', (p.tileOpacity ?? 1) * 100, { min: 5, max: 100, step: 5, unit: '%', editable: true, scale: 0.01, reset: 100 })}
            ${F.range('pattern.feather', 'Edge vignette fade', p.feather ?? 0, { min: 0, max: 100, step: 5, unit: '%', editable: true, reset: 0 })}
        </div>
        ${F.select('pattern.blendMode', 'Blend mode', p.blendMode || 'normal', [
            ['normal', 'Normal'],
            ['screen', 'Screen (lighten)'],
            ['overlay', 'Overlay (contrast)'],
            ['soft-light', 'Soft light'],
            ['hard-light', 'Hard light'],
            ['multiply', 'Multiply (darken)'],
            ['color-dodge', 'Color dodge (glow)'],
            ['plus-lighter', 'Plus lighter (additive)'],
            ['difference', 'Difference'],
            ['luminosity', 'Luminosity']
        ])}
    `, false);

    // 4. Organic Scatter & Jitter
    const hasJitter = Boolean((p.scaleJitter || 0) > 0 || (p.rotationJitter || 0) > 0 || (p.positionJitter || 0) > 0 || p.animateJitter);
    const secJitter = F.section('patternJitter', 'Organic scatter & jitter', `
        ${F.range('pattern.scaleJitter', 'Size variation', p.scaleJitter ?? 0, { min: 0, max: 50, step: 5, unit: '%', editable: true, reset: 0 })}
        ${F.range('pattern.rotationJitter', 'Angle jitter', p.rotationJitter ?? 0, { min: 0, max: 180, step: 5, unit: '°', editable: true, reset: 0 })}
        ${F.range('pattern.positionJitter', 'Position scatter', p.positionJitter ?? 0, { min: 0, max: 50, step: 5, unit: '%', editable: true, reset: 0 })}
        ${F.check('pattern.animateJitter', 'Animate organic jitter (per-tile float & bob)', p.animateJitter === true)}
        ${p.animateJitter ? F.number('pattern.jitterSpeed', 'Jitter float cycle (sec)', p.jitterSpeed ?? 6, { min: 0.5, max: 60, step: 0.5 }) : ''}
        <p class="hint">Adds deterministic organic randomness per tile so repeating patterns feel hand-placed${p.animateJitter ? ' and gently float in place' : ''}.</p>
    `, hasJitter);

    // 5. Color & Hue Variation + Twinkle
    const hasColorVar = Boolean(hueShift !== 'none' || (p.hueJitter || 0) > 0 || (p.brightnessJitter || 0) > 0 || (p.saturationJitter || 0) > 0 || (p.twinkle || 0) > 0);
    const secColor = F.section('patternColor', 'Color & hue variation', `
        <div class="grid2">
            ${F.select('pattern.hueShift', 'Animated hue shift', hueShift, [
                ['none', 'Off'],
                ['cycle', 'Full spectrum cycle'],
                ['wave-x', 'Horizontal rainbow wave'],
                ['wave-y', 'Vertical rainbow wave']
            ])}
            ${hueShift !== 'none' ? F.number('pattern.hueSpeed', 'Hue cycle (sec)', p.hueSpeed ?? 12, { min: 1, max: 120, step: 1 }) : '<span></span>'}
        </div>
        ${F.range('pattern.hueJitter', 'Per-tile hue scatter', p.hueJitter ?? 0, { min: 0, max: 180, step: 5, unit: '°', editable: true, reset: 0 })}
        <div class="grid2">
            ${F.range('pattern.saturationJitter', 'Saturation jitter', p.saturationJitter ?? 0, { min: 0, max: 50, step: 5, unit: '%', editable: true, reset: 0 })}
            ${F.range('pattern.brightnessJitter', 'Brightness jitter', p.brightnessJitter ?? 0, { min: 0, max: 50, step: 5, unit: '%', editable: true, reset: 0 })}
        </div>
        <div class="grid2">
            ${F.range('pattern.twinkle', 'Twinkle / shimmer', p.twinkle ?? 0, { min: 0, max: 100, step: 5, unit: '%', editable: true, reset: 0 })}
            ${(p.twinkle || 0) > 0 ? F.number('pattern.twinkleSpeed', 'Twinkle speed (s)', p.twinkleSpeed ?? 4, { min: 0.5, max: 30, step: 0.5 }) : '<span></span>'}
        </div>
    `, hasColorVar);

    return secLayout + secMotion + secAppearance + secJitter + secColor;
}

export function handlePatternInspectorClick(event, { renderProperties, openAssetDialog, propEl }) {
    const target = event.target;

    // 1. Add tile slot
    if (target.closest('#btn-add-pattern-tile')) {
        for (const el of selectedElements()) {
            if (el.type !== 'pattern') continue;
            el.pattern = el.pattern || {};
            const list = Array.isArray(el.pattern.tiles) ? [...el.pattern.tiles] : [];
            if (list.length >= 3) continue;
            const defaultType = el.pattern.sourceType === 'icon' ? 'icon' : 'image';
            const fallbackIcons = ['fa-solid fa-star', 'fa-solid fa-bolt', 'fa-solid fa-heart'];
            list.push({
                sourceType: defaultType,
                src: '',
                content: fallbackIcons[list.length] || 'fa-solid fa-star',
                color: '#ffffff',
                scale: 100
            });
            el.pattern.tiles = list;
        }
        renderCanvas();
        renderProperties();
        changed(true);
        return true;
    }

    // 2. Remove tile slot
    const removeBtn = target.closest('[data-remove-pattern-tile]');
    if (removeBtn) {
        const idx = Number(removeBtn.dataset.removePatternTile);
        for (const el of selectedElements()) {
            if (el.type !== 'pattern' || !Array.isArray(el.pattern?.tiles)) continue;
            const list = [...el.pattern.tiles];
            if (idx >= 0 && idx < list.length) {
                list.splice(idx, 1);
                el.pattern.tiles = list;
            }
        }
        renderCanvas();
        renderProperties();
        changed(true);
        return true;
    }

    // 3. Per-slot Library button
    const libBtn = target.closest('[data-pattern-slot-lib]');
    if (libBtn) {
        const idx = Number(libBtn.dataset.patternSlotLib);
        const el = primary();
        if (el && el.type === 'pattern') {
            openAssetDialog(el.id, url => {
                if (!Array.isArray(el.pattern?.tiles) || !el.pattern.tiles[idx]) return;
                el.pattern.tiles[idx].src = url;
                renderCanvas();
                renderProperties();
                changed(true);
            });
        }
        return true;
    }

    // 4. Per-slot Icon Picker button
    const iconBtn = target.closest('[data-pattern-slot-icon]');
    if (iconBtn && window.IconPicker) {
        const idx = Number(iconBtn.dataset.patternSlotIcon);
        const input = propEl?.querySelector(`[data-path="pattern.tiles.${idx}.content"]`);
        window.IconPicker.open({
            value: input?.value,
            onPick: cls => {
                if (!input) return;
                input.value = cls;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        return true;
    }

    // 5. Per-slot Crop button
    const cropBtn = target.closest('[data-pattern-slot-crop]');
    if (cropBtn && typeof window.openImageCropper === 'function') {
        const idx = Number(cropBtn.dataset.patternSlotCrop);
        const el = primary();
        const slot = el?.pattern?.tiles?.[idx];
        if (el && slot?.src) {
            const src = slot.src;
            const assetName = src.startsWith('/custom-overlay-assets/') ? src.split('/').pop().split('?')[0] : '';
            window.openImageCropper({
                url: src,
                name: assetName,
                aspectRatio: el.pattern?.aspectRatio || '1:1',
                onSave: async res => {
                    slot.src = res.url || src;
                    renderCanvas();
                    renderProperties();
                    changed(true);
                    toast(res.isNew ? `Saved cropped image as ${res.name}` : `Updated ${res.name}`, 'success');
                }
            });
        }
        return true;
    }

    return false;
}

export async function handlePatternInspectorChange(event, { renderProperties, uploadAsset }) {
    const uploadInput = event.target.closest('[data-pattern-slot-upload]');
    if (!uploadInput || !uploadInput.files?.[0]) return false;
    const idx = Number(uploadInput.dataset.patternSlotUpload);
    const el = primary();
    if (!el || el.type !== 'pattern' || !el.pattern?.tiles?.[idx]) return false;
    const file = uploadInput.files[0];
    try {
        toast('Uploading tile image…', 'info', 1500);
        const url = await uploadAsset(file);
        el.pattern.tiles[idx].src = url;
        renderCanvas();
        renderProperties();
        changed(true);
        toast(`Tile ${idx + 2} image uploaded`, 'success', 1800);
    } catch (error) {
        toast(error.message, 'error', 5000);
        uploadInput.value = '';
    }
    return true;
}
