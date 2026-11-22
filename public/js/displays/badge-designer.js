import { F, esc } from './display-form.js';
import { defaultImageGroupConfig, resolveImageGroupFields, syncLegacyGroupFields, normalizeGroupFieldItem, IMAGE_GROUP_FIELD_ROLES, IMAGE_GROUP_SLOTS } from './badge-model.js';

// The original Badge Builder edits reusable definitions through this library-local adapter.
export function createBadgeDesigner(root, context) {
    const $ = id => id === 'ig-fields-dialog' ? root : root.querySelector(`#${id}`);
    const shared = window.OverlayShared || {};
    const state = { get liveStatus() { return context.getStatus(); } };
    const prefs = { sections: {} };
    const SYSTEM_FONTS = [['sans-serif', 'System sans-serif'], ['Arial, sans-serif', 'Arial'], ['Georgia, serif', 'Georgia'], ['Impact, sans-serif', 'Impact'], ['monospace', 'Monospace']];
    const GOOGLE_FONT_OPTIONS = (shared.GOOGLE_FONTS || []).map(name => [`'${name}', sans-serif`, name]);

    const isImageGroup = el => Boolean(el?.imageGroup?.enabled);
    const ICON = { textLeft: 'Left', textCenter: 'Center', textRight: 'Right', vTop: 'Top', vMiddle: 'Middle', vBottom: 'Bottom' };
    const primary = () => {
        const draft = context.getDraft();
        return {
            type: 'image',
            get width() { return draft.badge.width || 640; }, set width(value) { draft.badge.width = value; },
            get height() { return draft.badge.height || 360; }, set height(value) { draft.badge.height = value; },
            get imageGroup() { return draft.badge.imageGroup; }, set imageGroup(value) { draft.badge.imageGroup = value; },
            get style() { return draft.badge.style; }, set style(value) { draft.badge.style = value; }
        };
    };
    const readTab = () => { try { return localStorage.getItem('streampulse_badge_builder_tab'); } catch { return 'badge'; } };
    const renderGroupBadgePreview = () => context.onChange();

const TEMPLATE = "        <div class=\"tabs-nav ig-builder-tabs\" role=\"tablist\" aria-label=\"Builder views\">\n            <button type=\"button\" class=\"tab-btn active\" data-ig-builder-tab=\"badge\" role=\"tab\" aria-selected=\"true\" aria-controls=\"ig-badge-panel\">Badge</button>\n            <button type=\"button\" class=\"tab-btn\" data-ig-builder-tab=\"strip\" role=\"tab\" aria-selected=\"false\" aria-controls=\"ig-strip-panel\">Strip</button>\n        </div>\n        <div class=\"ig-builder-cols\" id=\"ig-badge-panel\" data-ig-builder-panel=\"badge\" role=\"tabpanel\">\n            <aside class=\"ig-builder-left\">\n                <div class=\"ig-presets-section\">\n                    <span class=\"ig-presets-label\">Quick Geometry</span>\n                    <div class=\"ig-geom-grid\" id=\"ig-quick-geometries\"></div>\n                </div>\n                <div class=\"ig-presets-section\">\n                    <span class=\"ig-presets-label\">Arrangement Presets</span>\n                    <select id=\"badge-arrangement\" aria-label=\"Arrangement preset\"><option value=\"\">Choose a layout preset\u2026</option><option value=\"stack\">Clean Stack</option><option value=\"profile-card\">Profile Card</option><option value=\"card-grid\">Card Grid</option><option value=\"lower-banners\">Nameplate Banners</option><option value=\"broadcast-hud\">Broadcast HUD</option><option value=\"split-hud\">Split Header + Sub</option><option value=\"corner-tag\">Avatar Corner Tag</option><option value=\"upper-left-crest\">Upper-Left Crest</option><option value=\"avatar-emblem\">Avatar Emblem</option><option value=\"inline-roster\">Inline Roster</option><option value=\"overlay-tags\">Inside Overlay Tags</option></select>\n                </div>\n                <details class=\"ig-placement-card\"><summary class=\"ig-presets-label\">Badge layout, spacing &amp; font size</summary>\n                    <div class=\"ig-modal-placement\" id=\"ig-modal-placement\"></div>\n                </details>\n            </aside>\n            <section class=\"ig-builder-right\" aria-label=\"Badge Fields and Secondary Images\">\n                <div class=\"ig-fields-toolbar\">\n                    <div class=\"ig-fields-toolbar-meta\">\n                        <span class=\"ig-presets-label\">Fields &amp; Secondary Images</span>\n                        <span class=\"ig-fields-count\" id=\"ig-fields-count\"></span>\n                    </div>\n                    <div class=\"ig-fields-toolbar-actions\">\n                        <button type=\"button\" id=\"ig-add-field-btn\" class=\"ghost\">+ Text Field</button>\n                        <button type=\"button\" id=\"ig-add-image-btn\" class=\"ghost\">+ Image / Icon</button>\n                    </div>\n                </div>\n                <div class=\"ig-blueprint-wrap\" id=\"ig-zone-blueprint\"></div>\n                <div class=\"ig-fields-list\" id=\"ig-fields-list\"></div>\n            </section>\n        </div>\n        <div class=\"ig-builder-strip\" id=\"ig-strip-panel\" data-ig-builder-panel=\"strip\" role=\"tabpanel\" hidden>\n            <section id=\"ig-strip-controls\" aria-label=\"Strip arrangement\"></section>\n\n        </div>\n\n<div id=\"badge-visual-controls\"></div>";
function fontOptions(current) {
    const uploaded = (shared.assetFonts || []).map(font => [`'${font.family}', sans-serif`, font.family]);
    const variables = (state.liveStatus?.customVars || []).filter(v => v.type === 'font' && !v.hidden && !v.setId)
        .map(v => [`{{var.${shared.variableKey(v)}|sans-serif}}`, `${v.group ? `${v.group} / ` : ''}${v.name}`]);
    const known = [...SYSTEM_FONTS, ...GOOGLE_FONT_OPTIONS, ...uploaded, ...variables];
    const custom = known.some(([v]) => v === current) ? '' : `<option value="${esc(current)}" selected>${esc(String(current).split(',')[0].replace(/['"]/g, ''))} (custom)</option>`;
    const opt = ([v, l]) => `<option value="${esc(v)}" style="font-family:${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`;
    const varOpt = ([v, l]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`;
    return `${custom}${variables.length ? `<optgroup label="Font variables">${variables.map(varOpt).join('')}</optgroup>` : ''}${SYSTEM_FONTS.map(opt).join('')}${uploaded.length ? `<optgroup label="Uploaded fonts">${uploaded.map(opt).join('')}</optgroup>` : ''}<optgroup label="Google Fonts">${GOOGLE_FONT_OPTIONS.map(opt).join('')}</optgroup>`;
}

function inheritFontOptions(current, inheritLabel = 'Use base font') {
    const val = current || '';
    const inner = val ? fontOptions(val) : fontOptions(SYSTEM_FONTS[0][0]).replace(' selected', '');
    return `<option value=""${!val ? ' selected' : ''}>${esc(inheritLabel)}</option>${inner}`;
}

const gradOf = (s, key) => ({ from: '#1f6feb', to: '#8957e5', angle: 135, type: 'linear', position: 'center', speed: 8, ...(s[key] || {}) });
const hasMidStop = val => Boolean(val && val !== 'transparent' && val !== 'none');
const fillSeg = (s, key, label, prefix = 'style') => F.seg(`${prefix}.${key}.enabled`, label, s[key]?.enabled ? 'true' : 'false', [['false', 'Solid color', 'Solid'], ['true', 'Gradient', 'Gradient']]);

function gradientFields(s, key = 'gradient', prefix = 'style') {
    const g = gradOf(s, key), at = name => `${prefix}.${key}.${name}`;
    const hasMid = hasMidStop(g.mid);
    return `<div class="grid2">${F.select(at('type'), 'Type', g.type, [['linear', 'Linear'], ['radial', 'Radial']])}${g.type === 'radial' ? F.select(at('position'), 'Center', g.position, [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]) : F.number(at('angle'), 'Angle (°)', g.angle, { min: 0, max: 360 })}</div>
        <div class="grid2">${F.color(at('from'), 'From', g.from)}${F.color(at('to'), 'To', g.to)}</div>
        <label class="check"><input type="checkbox" data-grad-mid-toggle="${esc(at('mid'))}" ${hasMid ? 'checked' : ''}> Middle color stop (optional)</label>
        ${hasMid ? F.color(at('mid'), 'Middle color', g.mid, { clear: true, clearValue: '', clearLabel: 'Off' }) : ''}
        ${F.check(at('animate'), 'Animate', g.animate)}
        ${g.animate ? F.number(at('speed'), 'Speed (sec per sweep)', g.speed, { min: 1, max: 120 }) : ''}`;
}

const fillControl = (s, key, label, solidField, prefix = 'style') => fillSeg(s, key, label, prefix) + (s[key]?.enabled ? gradientFields(s, key, prefix) : solidField);

const BORDER_STYLE_OPTIONS = (window.OverlayShared?.BORDER_STYLE_GROUPS)
    ? window.OverlayShared.BORDER_STYLE_GROUPS.map(g => ({
        group: g.label,
        options: g.options.map(o => [o.id, o.label])
    }))
    : [
        { group: 'Standard', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']] },
        { group: '3D Bevel', options: [['groove', '3D Groove'], ['ridge', '3D Ridge'], ['inset', '3D Inset'], ['outset', '3D Outset']] },
        { group: 'Broadcast & Tech HUD', options: [
            ['neon-tube', 'Neon tube (hot core)'],
            ['double-ring', 'Double ring track'],
            ['corner-brackets', 'Corner brackets (HUD)'],
            ['tech-hud', 'Mecha tech HUD'],
            ['chamfer', 'Chamfered octagon'],
            ['notched', 'Cyber notched HUD'],
            ['crosshair', 'Scope crosshair reticles'],
            ['viewfinder-ticks', 'Viewfinder telemetry ticks'],
            ['circuit-trace', 'PCB circuit trace'],
            ['segmented-bars', 'Segmented LED bars']
        ] },
        { group: 'Stylized & Decorative', options: [
            ['hazard', 'Hazard stripes'],
            ['chevron-track', 'Speed chevron track'],
            ['scallop-stamp', 'Scallop ticket stamp'],
            ['ornate-filigree', 'Royal diamond filigree'],
            ['pixel-arcade', '8-bit pixel arcade'],
            ['film-sprocket', 'Cinema filmstrip'],
            ['marquee-bulbs', 'Theater marquee bulbs'],
            ['art-deco', 'Art Deco stepped frame'],
            ['rivet-plate', 'Riveted steel plate'],
            ['braid-weave', 'Braided rope weave'],
            ['zigzag', 'Serrated zigzag teeth'],
            ['sine-wave', 'Smooth wave scallop'],
            ['sketch-ink', 'Hand-drawn sketch ink']
        ] }
    ];

function borderFxControls(container = {}, { glowKey = 'borderGlow', animKey = 'borderAnimation', prefix = 'style', fallbackColor = '#38bdf8' } = {}) {
    let html = '';
    const glow = container[glowKey] || {};
    const gp = `${prefix}.${glowKey}`;
    html += F.check(`${gp}.enabled`, 'Border glow', glow.enabled);
    if (glow.enabled) {
        html += `
            <div class="grid2">
                ${F.color(`${gp}.color`, 'Glow color', glow.color || fallbackColor, { clear: true })}
                ${F.number(`${gp}.blur`, 'Glow blur (px)', glow.blur ?? 16, { min: 0, max: 100 })}
            </div>
            <div class="grid2">
                ${F.check(`${gp}.neon`, 'Neon core mode', glow.neon)}
                ${F.check(`${gp}.inner`, 'Inner glow', glow.inner)}
            </div>`;
    }

    const anim = container[animKey] || {};
    const ap = `${prefix}.${animKey}`;
    html += F.select(`${ap}.type`, 'Border animation', anim.type || 'none', [
        ['none', 'None (static)'],
        { group: 'Beams & Energy', options: [
            ['rotating', 'Rotating beam (spotlight)'],
            ['dual-beam', 'Twin chasing beams'],
            ['laser-scan', 'Laser scanner sweep'],
            ['plasma', 'Electric plasma arc']
        ] },
        { group: 'Glow & Pulse', options: [
            ['radial', 'Radial rotating (sweeping glow)'],
            ['pulsing', 'Pulsing glow (breathing)'],
            ['strobe-flash', 'Energy surge (double flash)']
        ] },
        { group: 'Color & Perimeter', options: [
            ['gradient', 'Gradient sweep (flowing)'],
            ['rainbow', 'Rainbow cycle (RGB chroma)'],
            ['marching', 'Marching ants (perimeter chase)']
        ] }
    ]);
    if (anim.type && anim.type !== 'none') {
        if (anim.type === 'rotating' || anim.type === 'dual-beam') {
            html += `
                <div class="grid2">
                    ${F.number(`${ap}.speed`, 'Speed (seconds)', anim.speed ?? 4, { min: 0.5, max: 60, step: 0.5 })}
                    ${F.number(`${ap}.size`, 'Beam arc (%)', anim.size ?? 35, { min: 10, max: 100 })}
                </div>
                ${F.color(`${ap}.color2`, 'Beam head color', anim.color2 || '#ffffff')}`;
        } else if (anim.type === 'laser-scan' || anim.type === 'plasma') {
            const hasBorderMid = hasMidStop(anim.color3);
            html += `
                <div class="grid2">
                    ${F.number(`${ap}.speed`, 'Speed (seconds)', anim.speed ?? 3.5, { min: 0.5, max: 60, step: 0.5 })}
                    ${F.color(`${ap}.color2`, anim.type === 'laser-scan' ? 'Laser core color' : 'Plasma accent color', anim.color2 || (anim.type === 'laser-scan' ? '#ffffff' : '#a855f7'))}
                </div>`;
            if (anim.type === 'plasma') {
                html += `<label class="check"><input type="checkbox" data-grad-mid-toggle="${esc(`${ap}.color3`)}" ${hasBorderMid ? 'checked' : ''}> Middle color stop (optional)</label>`;
                if (hasBorderMid) {
                    html += F.color(`${ap}.color3`, 'Middle color', anim.color3, { clear: true, clearValue: '', clearLabel: 'Off' });
                }
            }
        } else if (anim.type === 'radial') {
            const mode = anim.mode || 'spotlight';
            html += `
                <div class="grid2">
                    ${F.select(`${ap}.mode`, 'Radial mode', mode, [
                        ['spotlight', 'Spotlight (focused glow)'],
                        ['two-tone', 'Two-tone (head & trail)'],
                        ['fade-white', 'Fade to white'],
                        ['fade-black', 'Fade to black'],
                        ['rainbow', 'Rainbow cycle']
                    ])}
                    ${F.select(`${ap}.direction`, 'Direction', anim.direction || 'cw', [
                        ['cw', 'Clockwise'],
                        ['ccw', 'Counter-clockwise'],
                        ['alternate', 'Alternate (back & forth)']
                    ])}
                </div>
                <div class="grid2">
                    ${F.number(`${ap}.speed`, 'Speed (seconds)', anim.speed ?? 4, { min: 0.5, max: 60, step: 0.5 })}
                    ${F.number(`${ap}.size`, 'Glow spread (%)', anim.size ?? 40, { min: 10, max: 100 })}
                </div>`;
            if (mode !== 'rainbow') {
                const label = mode === 'two-tone' ? 'Accent color' : (mode === 'spotlight' ? 'Spotlight color' : 'Primary color');
                const hasBorderMid = hasMidStop(anim.color3);
                html += F.color(`${ap}.color2`, label, anim.color2 || (mode === 'spotlight' ? '#ffffff' : '#38bdf8'));
                html += `<label class="check"><input type="checkbox" data-grad-mid-toggle="${esc(`${ap}.color3`)}" ${hasBorderMid ? 'checked' : ''}> Middle color stop (optional)</label>`;
                if (hasBorderMid) {
                    html += F.color(`${ap}.color3`, 'Middle color', anim.color3, { clear: true, clearValue: '', clearLabel: 'Off' });
                }
            }
        } else if (anim.type === 'gradient') {
            const hasBorderMid = hasMidStop(anim.color3);
            html += `
                <div class="grid2">
                    ${F.number(`${ap}.speed`, 'Speed (seconds)', anim.speed ?? 4, { min: 0.5, max: 60, step: 0.5 })}
                    ${F.color(`${ap}.color2`, 'End color', anim.color2 || '#8957e5')}
                </div>
                <label class="check"><input type="checkbox" data-grad-mid-toggle="${esc(`${ap}.color3`)}" ${hasBorderMid ? 'checked' : ''}> Middle color stop (optional)</label>`;
            if (hasBorderMid) {
                html += F.color(`${ap}.color3`, 'Middle color', anim.color3, { clear: true, clearValue: '', clearLabel: 'Off' });
            }
        } else {
            html += F.number(`${ap}.speed`, 'Speed (seconds)', anim.speed ?? 4, { min: 0.5, max: 60, step: 0.5 });
        }
    }
    return html;
}

const IG_SVG_UP = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>';
const IG_SVG_DOWN = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const IG_SVG_REMOVE = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const IG_ROLE_LABELS = { title: 'Title', subtitle: 'Subtitle', badge: 'Badge pill', accent: 'Accent tag', caption: 'Caption' };
const IG_SLOT_LABELS = {
    main: 'Main flow',
    header: 'Card header (Top)',
    footer: 'Card footer (Bottom)',
    trailing: 'Trailing · right of content',
    'avatar-top': 'Avatar overlay · top',
    'avatar-bottom': 'Avatar overlay · bottom',
    'corner-tl': 'Card corner top-left',
    'corner-tr': 'Card corner top-right',
    'corner-bl': 'Card corner bottom-left',
    'corner-br': 'Card corner bottom-right',
    'avatar-tl': 'Avatar corner top-left',
    'avatar-tr': 'Avatar corner top-right',
    'avatar-bl': 'Avatar corner bottom-left',
    'avatar-br': 'Avatar corner bottom-right'
};
function effectiveFieldSlot(slot, ig) {
    if (ig.showAvatar !== false) return slot;
    if (slot === 'avatar-top') return 'header';
    if (slot === 'avatar-bottom') return 'footer';
    return slot.startsWith('avatar-') ? slot.replace('avatar-', 'corner-') : slot;
}
function fieldSlotLabel(slot, ig) {
    const effective = effectiveFieldSlot(slot, ig);
    return `${IG_SLOT_LABELS[slot] || slot}${effective !== slot ? ` → ${IG_SLOT_LABELS[effective]}` : ''}`;
}
const IG_PLACEMENTS = [
    ['below', 'Below avatar'],
    ['above', 'Above avatar'],
    ['right', 'Beside avatar (right)'],
    ['left', 'Beside avatar (left)'],
    ['inside-bottom', 'Inside bottom overlay'],
    ['inside-top', 'Inside top overlay'],
    ['split', 'Split (Title top + Sub bottom)']
];
const IG_TEXT_ALIGNS = [['auto', 'Auto'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
const IG_WIDTH_MODES = [['auto', 'Auto fit content'], ['full', 'Full strip width (100%)'], ['fixed', 'Custom width (px)']];
const IG_CARD_ALIGNS = [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']];

function imageGroupFieldMeta(ig = {}) {
    const sets = Array.isArray(state.liveStatus?.variableSets) ? state.liveStatus.variableSets : [];
    const targetId = context.getDraft().catalogId;
    const setObj = sets.find(s => s.id === targetId) || null;
    const fields = setObj?.fields || [];
    return {
        sets,
        setObj,
        fields,
        imageFieldOpts: fields.length
            ? [...fields.filter(f => f.type === 'image' || f.type === 'url'), ...fields.filter(f => f.type !== 'image' && f.type !== 'url')].map(f => [f.key, `${f.label} ({{var.${setObj.id}_${f.key}}})`])
            : [['image', 'image']],
        labelFieldOpts: [['', 'Auto / None'], ...fields.map(f => [f.key, `${f.label} (${f.key})`])],
        subFieldOpts: [['', 'None'], ...fields.map(f => [f.key, `${f.label} (${f.key})`])]
    };
}

function imageGroupLayoutSection(el, inBuilder = false) {
    if (!isImageGroup(el)) return '';

    const ig = el.imageGroup || {};
    const st = el.style || {};
    const layout = ig.layout || 'row';
    const wrappable = layout === 'row' || layout === 'chips' || layout === 'cards';
    const gapVal = ig.gap ?? 10;

    let body = F.select('imageGroup.layout', 'Layout style', layout, [
        ['row', 'Row strip'],
        ['column', 'Vertical stack'],
        ['grid', 'Wrap grid'],
        ['cards', 'Member cards'],
        ['banners', 'Nameplate banners'],
        ['chips', 'Capsule chips'],
        ['stagger', 'Staggered wave'],
        ['spotlight', 'Spotlight lead + crew'],
        ['overlap', 'Overlapping avatar stack']
    ]);
    if (layout === 'grid') {
        body += F.number('imageGroup.columns', 'Grid columns (0 = auto)', ig.columns ?? 0, { min: 0, max: 12 });
    } else if (wrappable) {
        body += F.check('imageGroup.wrap', 'Wrap items onto multiple rows', ig.wrap === true);
        if (ig.wrap) {
            body += F.number('imageGroup.columns', 'Max columns per row (0 = auto)', ig.columns ?? 0, { min: 0, max: 12 });
        }
    } else if (layout === 'stagger') {
        body += F.number('imageGroup.staggerOffset', 'Stagger wave offset (px)', ig.staggerOffset ?? 18, { min: 0, max: 80, step: 2 });
    } else if (layout === 'spotlight') {
        body += F.number('imageGroup.spotlightScale', 'Lead scale (×)', ig.spotlightScale ?? 1.35, { min: 1.1, max: 2.0, step: 0.05 });
    } else if (layout === 'overlap') {
        body += F.number('imageGroup.overlap', 'Overlap amount (px)', ig.overlap ?? 16, { min: 4, max: 60, step: 2 });
    }
    body += F.check('imageGroup.autoScale', 'Auto-scale content to fit box', ig.autoScale === true);
    body += '<p class="hint">Proportionally shrinks avatars, text, and cards if longer names or extra members exceed the box.</p>';
    body += `<div class="grid2">${F.number('imageGroup.maxItems', 'Maximum members (0 = all)', ig.maxItems || 0, { min: 0, max: 60 })}${F.select('imageGroup.sortOrder', 'Member order', ig.sortOrder || 'roster', [['roster', 'Source order'], ['alpha', 'Alphabetical'], ['reverse', 'Reverse']])}</div>`;
    body += F.check('imageGroup.showOverflowBadge', 'Show overflow count', ig.showOverflowBadge !== false);
    body += F.text('imageGroup.delimiter', 'Member delimiter', ig.delimiter || '');

    body += '<div class="sub-head">Spacing &amp; Gaps</div>';
    body += `<div class="grid2">${layout === 'overlap' ? '<span></span>' : F.number('imageGroup.gap', 'Item gap (px)', gapVal, { min: 0, max: 80, step: 2 })}${F.number('imageGroup.rowGap', 'Row gap (px)', ig.rowGap ?? gapVal, { min: 0, max: 120, step: 2 })}</div>`;

    body += '<div class="sub-head">Strip Alignment in Box</div>';
    body += `<div class="grid2">${F.seg('style.textAlign', 'Align X', st.textAlign || 'left', [['left', 'Align left', ICON.textLeft], ['center', 'Center', ICON.textCenter], ['right', 'Align right', ICON.textRight]])}${F.seg('style.verticalAlign', 'Align Y', st.verticalAlign || 'top', [['top', 'Align top', ICON.vTop], ['middle', 'Middle', ICON.vMiddle], ['bottom', 'Align bottom', ICON.vBottom]])}</div>`;
    return F.section('igStripArrangement', 'Strip arrangement & spacing', body);
}

function imageGroupStyleSections(el) {
    if (!isImageGroup(el)) return '';
    const ig = el.imageGroup || {};
    const layout = ig.layout || 'row';
    const shape = ig.shape || 'rounded';
    const avBorderW = Number(ig.avatarBorderWidth) || 0;
    const isPolyShape = shape === 'hexagon' || shape === 'diamond' || shape === 'octagon';

    let avBody = `<div class="grid2">${F.select('imageGroup.shape', 'Avatar shape', shape, [
        ['rounded', 'Rounded'],
        ['circle', 'Circle'],
        ['squircle', 'Squircle'],
        ['octagon', 'Octagon'],
        ['hexagon', 'Hexagon'],
        ['diamond', 'Diamond'],
        ['square', 'Square']
    ])}${shape === 'rounded' ? F.number('imageGroup.avatarRadius', 'Corner radius (px)', ig.avatarRadius ?? 10, { min: 0, max: 100 }) : '<span></span>'}</div>`;
    avBody += `<div class="grid2">${F.number('imageGroup.avatarBorderWidth', 'Avatar border (px)', avBorderW, { min: 0, max: 12 })}${F.number('imageGroup.avatarShadow', 'Avatar shadow (px)', ig.avatarShadow ?? 0, { min: 0, max: 40 })}</div>`;
    if (avBorderW > 0 || layout === 'overlap') {
        avBody += F.select('imageGroup.avatarBorderStyle', 'Avatar border style', ig.avatarBorderStyle || 'solid', BORDER_STYLE_OPTIONS);
        if (isPolyShape) {
            avBody += F.color('imageGroup.avatarBorderColor', 'Avatar border color', ig.avatarBorderColor || 'rgba(255,255,255,0.28)');
            avBody += '<p class="hint">Polygon shapes use clean SVG contour outlines; choose rounded, square, or circle for gradient fills, glows, and 21-style animated borders.</p>';
        } else {
            avBody += fillControl(ig, 'avatarBorderGradient', 'Avatar border fill', F.color('imageGroup.avatarBorderColor', 'Avatar border color', ig.avatarBorderColor || 'rgba(255,255,255,0.28)', { clear: true }), 'imageGroup');
            avBody += borderFxControls(ig, { glowKey: 'avatarBorderGlow', animKey: 'avatarBorderAnimation', prefix: 'imageGroup', fallbackColor: ig.avatarBorderColor || '#38bdf8' });
        }
    }
    if (ig.fallbackMode === 'initials') {
        avBody += F.color('imageGroup.avatarBg', 'Initials badge color', ig.avatarBg || '#1e293b');
    }

    const layoutAutoFrames = layout === 'cards' || layout === 'chips' || layout === 'banners';
    const isFramed = ig.cardFrame === true || layoutAutoFrames;
    const cardBW = Number(ig.cardBorderWidth ?? 1) || 0;
    let cardBody = F.check('imageGroup.cardFrame', 'Frame each member in a card / plate', isFramed);
    if (layoutAutoFrames) {
        cardBody += `<p class="hint">${layout === 'banners' ? 'Banners' : layout === 'chips' ? 'Capsule chips' : 'Member cards'} automatically frame each member.</p>`;
    }
    if (isFramed) {
        cardBody += fillControl(ig, 'cardGradient', layout === 'chips' ? 'Chip fill' : 'Card fill', F.color('imageGroup.cardBg', layout === 'chips' ? 'Chip background' : 'Card background', ig.cardBg || 'rgba(15,23,42,0.78)', { clear: true }), 'imageGroup');
        cardBody += `<div class="grid2">${F.number('imageGroup.cardBorderWidth', 'Card border (px)', cardBW, { min: 0, max: 16 })}${F.number('imageGroup.cardRadius', 'Corner radius (px)', ig.cardRadius ?? 12, { min: 0, max: 999 })}</div>`;
        if (cardBW > 0) {
            cardBody += F.select('imageGroup.cardBorderStyle', 'Card border style', ig.cardBorderStyle || 'solid', BORDER_STYLE_OPTIONS);
            cardBody += fillControl(ig, 'cardBorderGradient', 'Card border fill', F.color('imageGroup.cardBorderColor', 'Card border color', ig.cardBorderColor || 'rgba(255,255,255,0.16)', { clear: true }), 'imageGroup');
            cardBody += borderFxControls(ig, { glowKey: 'cardBorderGlow', animKey: 'cardBorderAnimation', prefix: 'imageGroup', fallbackColor: ig.cardBorderColor || '#38bdf8' });
        }
        cardBody += `<div class="grid2">${F.number('imageGroup.cardPaddingX', 'Card pad X (px)', ig.cardPaddingX ?? ig.cardPadding ?? 8, { min: 0, max: 64 })}${F.number('imageGroup.cardPaddingY', 'Card pad Y (px)', ig.cardPaddingY ?? ig.cardPadding ?? 8, { min: 0, max: 64 })}</div>`;
        cardBody += `<div class="grid2">${F.number('imageGroup.cardShadow', 'Card shadow (px)', ig.cardShadow ?? 0, { min: 0, max: 48 })}${F.number('imageGroup.cardBlur', 'Backdrop blur (px)', ig.cardBlur ?? 0, { min: 0, max: 40 })}</div>`;
    }

    let lblBody = '';
    if (ig.showLabels) {
        lblBody += F.number('imageGroup.labelSize', 'Base size px (0 = Typography)', ig.labelSize ?? 0, { min: 0, max: 72 });
        lblBody += `<div class="grid2">${F.color('imageGroup.labelColor', 'Primary color', ig.labelColor || '', { clear: true, clearValue: '', clearLabel: 'Auto' })}${F.color('imageGroup.subColor', 'Secondary color', ig.subColor || '', { clear: true, clearValue: '', clearLabel: 'Auto' })}</div>`;
        lblBody += F.color('imageGroup.labelBg', 'Text block background', ig.labelBg || 'transparent', { clear: true });
        lblBody += `<div class="grid2">${F.color('imageGroup.badgeBg', 'Badge pill bg', ig.badgeBg || 'rgba(56,189,248,0.16)', { clear: true })}${F.color('imageGroup.badgeColor', 'Badge pill text', ig.badgeColor || '#38bdf8', { clear: true, clearValue: '', clearLabel: 'Auto' })}</div>`;
        lblBody += '';
    }
    lblBody += F.check('imageGroup.showStatusDot', 'Show accent status dot on frame', ig.showStatusDot === true);
    if (ig.delimiter && layout !== 'overlap') {
        lblBody += F.color('imageGroup.delimiterColor', 'Delimiter color', ig.delimiterColor || '', { clear: true, clearValue: '', clearLabel: 'Auto' });
    }

    return (ig.showAvatar !== false ? F.section('igAvatar', 'Primary image frames', avBody) : '')
        + F.section('igCards', 'Member cards & plates', cardBody)
        + F.section('igTextStyle', 'Labels, badges & delimiters', lblBody);
}

const IG_MODAL_SAMPLE_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><rect width="120" height="120" rx="20" fill="url(#g)"/><circle cx="60" cy="46" r="20" fill="#ffffff" fill-opacity="0.9"/><path d="M26 106c4-20 18-30 34-30s30 10 34 30" fill="#ffffff" fill-opacity="0.9"/></svg>');
const IG_MODAL_SAMPLE_CREST = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><path d="M32 6l20 8v16c0 14-8.5 23.5-20 28C20.5 53.5 12 44 12 30V14l20-8z" fill="url(#c)" stroke="#e0f2fe" stroke-width="3"/><path d="M32 18l4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.4-8.4-4.4-8.4 4.4 1.6-9.4-6.8-6.6 9.4-1.4z" fill="#fff"/></svg>');
const IG_MODAL_SAMPLE_RANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/><polygon points="32,12 38,26 53,27 41,37 45,51 32,43 19,51 23,37 11,27 26,26" fill="#fbbf24"/></svg>');

let igSelectedFieldIdx = 0;
let renderedFieldsSignature = '';

const IG_QUICK_GEOMETRIES = [
    {
        id: 'left-left',
        label: 'Avatar L · Text L',
        match: ig => (ig.labelPosition || 'below') === 'right' && (ig.textAlign || 'auto') !== 'right' && (ig.cardWidthMode || 'auto') !== 'full',
        apply: ig => Object.assign(ig, { showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'left', cardWidthMode: 'auto' }),
        svg: '<svg viewBox="0 0 54 26" fill="none"><rect x="1" y="1" width="52" height="24" rx="4" stroke="currentColor" stroke-opacity=".35"/><circle cx="11" cy="13" r="6" fill="currentColor" fill-opacity=".85"/><rect x="21" y="8" width="18" height="3.5" rx="1.5" fill="currentColor"/><rect x="21" y="14.5" width="12" height="2.5" rx="1.2" fill="currentColor" fill-opacity=".45"/></svg>'
    },
    {
        id: 'split-lr',
        label: 'Split: L / R',
        match: ig => (ig.labelPosition || 'below') === 'right' && ig.textAlign === 'right' && (ig.cardWidthMode === 'full' || ig.cardWidthMode === 'fixed'),
        apply: ig => Object.assign(ig, { showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'right', cardWidthMode: 'full' }),
        svg: '<svg viewBox="0 0 54 26" fill="none"><rect x="1" y="1" width="52" height="24" rx="4" stroke="currentColor" stroke-opacity=".35"/><circle cx="11" cy="13" r="6" fill="currentColor" fill-opacity=".85"/><rect x="30" y="8" width="18" height="3.5" rx="1.5" fill="currentColor"/><rect x="36" y="14.5" width="12" height="2.5" rx="1.2" fill="currentColor" fill-opacity=".45"/></svg>'
    },
    {
        id: 'split-rl',
        label: 'Split: R / L',
        match: ig => ig.labelPosition === 'left' && (ig.textAlign === 'left' || ig.textAlign === 'auto') && (ig.cardWidthMode === 'full' || ig.cardWidthMode === 'fixed'),
        apply: ig => Object.assign(ig, { showAvatar: true, showLabels: true, labelPosition: 'left', textAlign: 'left', cardWidthMode: 'full' }),
        svg: '<svg viewBox="0 0 54 26" fill="none"><rect x="1" y="1" width="52" height="24" rx="4" stroke="currentColor" stroke-opacity=".35"/><circle cx="43" cy="13" r="6" fill="currentColor" fill-opacity=".85"/><rect x="6" y="8" width="18" height="3.5" rx="1.5" fill="currentColor"/><rect x="6" y="14.5" width="12" height="2.5" rx="1.2" fill="currentColor" fill-opacity=".45"/></svg>'
    },
    {
        id: 'stacked',
        label: 'Stacked',
        match: ig => (ig.labelPosition || 'below') === 'below' && (ig.textAlign || 'center') === 'center',
        apply: ig => Object.assign(ig, { showAvatar: true, showLabels: true, labelPosition: 'below', textAlign: 'center', cardWidthMode: 'auto' }),
        svg: '<svg viewBox="0 0 54 26" fill="none"><rect x="1" y="1" width="52" height="24" rx="4" stroke="currentColor" stroke-opacity=".35"/><circle cx="27" cy="9" r="5" fill="currentColor" fill-opacity=".85"/><rect x="17" y="17" width="20" height="3" rx="1.5" fill="currentColor"/></svg>'
    },
    {
        id: 'banner-trail',
        label: 'L + Trailing',
        match: ig => ig.labelPosition === 'right' && ig.textAlign === 'left' && (ig.cardWidthMode === 'full' || ig.cardWidthMode === 'fixed'),
        apply: ig => Object.assign(ig, { showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'left', cardWidthMode: 'full' }),
        svg: '<svg viewBox="0 0 54 26" fill="none"><rect x="1" y="1" width="52" height="24" rx="4" stroke="currentColor" stroke-opacity=".35"/><circle cx="10" cy="13" r="5.5" fill="currentColor" fill-opacity=".85"/><rect x="19" y="10" width="14" height="3" rx="1.5" fill="currentColor"/><rect x="39" y="9.5" width="9" height="7" rx="2" fill="currentColor" fill-opacity=".55"/></svg>'
    },
    {
        id: 'overlay-bot',
        label: 'Inside Bottom',
        match: ig => ig.labelPosition === 'inside-bottom' || ig.labelPosition === 'inside-top',
        apply: ig => Object.assign(ig, { showAvatar: true, showLabels: true, labelPosition: 'inside-bottom', textAlign: 'center', cardWidthMode: 'auto' }),
        svg: '<svg viewBox="0 0 54 26" fill="none"><rect x="14" y="2" width="26" height="22" rx="4" stroke="currentColor" stroke-opacity=".55"/><circle cx="27" cy="10" r="4" fill="currentColor" fill-opacity=".75"/><rect x="16" y="17" width="22" height="5" rx="1.5" fill="currentColor" fill-opacity=".85"/></svg>'
    }
];

function renderImageGroupLayoutHint(el, ig, list) {
    const hintHost = $('ig-layout-hint');
    if (!hintHost) return;
    const widthMode = ig.cardWidthMode || ((ig.layout === 'banners') ? 'full' : 'auto');
    const hasTrailing = list.some(f => (f.slot || 'main') === 'trailing');
    const padX = Number(ig.cardPaddingX ?? ig.cardPadding ?? 8);
    const borderW = Number(ig.cardBorderWidth ?? 1);
    const avW = ig.showAvatar !== false ? (Number(ig.size ?? 56) + Number(ig.avatarBorderWidth ?? 0) * 2) : 0;
    const chromeW = padX * 2 + borderW * 2 + avW;
    const cols = Math.max(1, Number(ig.columns || 1));
    const elW = Number(el?.width || 0);
    const estSlotW = ig.layout === 'grid' && elW > 0 ? Math.round((elW - (Number(ig.gap ?? 12) * (cols - 1))) / cols) : (widthMode === 'fixed' ? Number(ig.cardWidth || 240) : elW);

    if ((ig.textAlign === 'right' || hasTrailing) && widthMode === 'auto') {
        hintHost.innerHTML = '<span><strong>Auto-fit width</strong> wraps tightly around content, so right-aligned/trailing fields sit next to the avatar.</span><button type="button" data-ig-hint-action="full-width">Switch to Full Width</button>';
        hintHost.hidden = false;
        return;
    }
    if (estSlotW > 0 && chromeW > estSlotW * 0.72 && (padX > 20 || borderW > 6)) {
        hintHost.innerHTML = `<span>Tight card budget: <strong>${chromeW}px</strong> padding/border + avatar inside <strong>~${estSlotW}px</strong> slot leaves little room to separate fields.</span><button type="button" data-ig-hint-action="trim-pad">Trim Pad X</button>`;
        hintHost.hidden = false;
        return;
    }
    hintHost.hidden = true;
    hintHost.innerHTML = '';
}

function renderImageGroupZoneBlueprint(ig, list) {
    const bpHost = $('ig-zone-blueprint');
    if (!bpHost) return;
    const focused = bpHost.contains(document.activeElement) ? document.activeElement : null;
    const focusSelector = focused?.id === 'badge-selected-field' ? '#badge-selected-field'
        : focused?.dataset.igBpPill !== undefined ? `[data-ig-bp-pill="${focused.dataset.igBpPill}"]`
        : focused?.dataset.igBpZone ? `[data-ig-bp-zone="${focused.dataset.igBpZone}"]` : '';
    if (igSelectedFieldIdx >= list.length) igSelectedFieldIdx = Math.max(0, list.length - 1);
    const activeField = list[igSelectedFieldIdx];
    const { fields } = imageGroupFieldMeta(ig);
    const title = (field, index) => fields.find(definition => definition.key === field.key)?.label || (field.customSrc ? 'Custom image' : field.key) || `Field ${index + 1}`;
    const activeSlot = activeField?.slot || 'main', actualSlot = effectiveFieldSlot(activeSlot, ig);
    const positions = {
        above: 'Main fields appear above the avatar.',
        below: 'Main fields appear below the avatar.',
        left: 'Main fields appear to the left of the avatar.',
        right: 'Main fields appear to the right of the avatar.',
        'inside-top': 'Main fields overlay the top of the avatar.',
        'inside-bottom': 'Main fields overlay the bottom of the avatar.',
        split: 'The first visible Main field appears above the avatar; remaining Main fields appear below it.'
    };
    const position = ig.labelPosition || 'below', showAvatar = ig.showAvatar !== false;
    const flow = !showAvatar ? 'Avatar hidden: avatar slots render in the corresponding card regions.' : positions[position];
    const members = slot => list.map((field, index) => ({ field, index })).filter(item => effectiveFieldSlot(item.field.slot || 'main', ig) === slot);
    const zoneHtml = (slot, label, contents = members(slot)) => {
        const pills = contents.map(({ field, index }) => `<button type="button" class="ig-bp-pill${index === igSelectedFieldIdx ? ' is-selected' : ''}" data-ig-bp-pill="${index}" title="Edit ${esc(title(field, index))}">${esc(title(field, index))}</button>`).join('');
        const selected = Boolean(activeField && actualSlot === slot && contents.some(item => item.index === igSelectedFieldIdx));
        return `<div class="ig-bp-zone${selected ? ' is-target' : ''}${contents.length ? ' has-items' : ''}" data-ig-bp-zone="${slot}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${esc(fieldSlotLabel(slot, ig))}" title="${esc(fieldSlotLabel(slot, ig))}"><span class="ig-bp-zone-label">${esc(label)}</span>${pills}</div>`;
    };
    const main = (label = 'Main', contents) => zoneHtml('main', label, contents);
    const cornerRow = prefix => `<div class="ig-bp-avatar-corners">${zoneHtml(`${prefix}-tl`, 'TL')}${zoneHtml(`${prefix}-tr`, 'TR')}</div>`;
    const avatar = showAvatar ? `<div class="ig-blueprint-avatar">${cornerRow('avatar')}${zoneHtml('avatar-top', 'Overlay top')}${position === 'inside-top' ? main('Main · inside top') : ''}<span class="ig-blueprint-avatar-label">Avatar</span>${position === 'inside-bottom' ? main('Main · inside bottom') : ''}${zoneHtml('avatar-bottom', 'Overlay bottom')}<div class="ig-bp-avatar-corners">${zoneHtml('avatar-bl', 'BL')}${zoneHtml('avatar-br', 'BR')}</div></div>` : '';
    let core;
    if (!showAvatar) core = main();
    else if (position === 'split') core = main('Main · first', members('main').slice(0, 1)) + avatar + main('Main · remaining', members('main').slice(1));
    else if (position.startsWith('inside-')) core = avatar;
    else if (['above', 'left'].includes(position)) core = main() + avatar;
    else core = avatar + main();
    bpHost.innerHTML = `<div class="ig-placement-heading"><span class="ig-presets-label">Card Zone Blueprint</span><span class="ig-bp-sub">${list.length} ${list.length === 1 ? 'field' : 'fields'}</span></div>
        <label class="ig-field-selector">Editing field<select id="badge-selected-field" aria-label="Editing field">${list.map((field, index) => `<option value="${index}"${index === igSelectedFieldIdx ? ' selected' : ''}>${index + 1}. ${esc(title(field, index))} · ${esc(IG_ROLE_LABELS[field.role] || 'Image')}</option>`).join('')}</select></label>
        <div class="ig-blueprint-card" data-blueprint-layout="${esc(position)}">
            <div class="ig-blueprint-edge">${zoneHtml('corner-tl', 'TL')}${zoneHtml('header', 'Card header')}${zoneHtml('corner-tr', 'TR')}</div>
            <div class="ig-blueprint-core"><div class="ig-blueprint-flow${['left', 'right'].includes(position) ? ' is-horizontal' : ''}">${core}</div>${zoneHtml('trailing', 'Trailing')}</div>
            <div class="ig-blueprint-edge">${zoneHtml('corner-bl', 'BL')}${zoneHtml('footer', 'Card footer')}${zoneHtml('corner-br', 'BR')}</div>
        </div><p class="ig-placement-context">${activeField ? `<strong>${esc(fieldSlotLabel(activeSlot, ig))}.</strong> ` : ''}${esc(flow)}</p>`;
    if (focusSelector) bpHost.querySelector(focusSelector)?.focus({ preventScroll: true });
}

function selectImageGroupField(index, reveal = false) {
    const el = primary(), list = resolveImageGroupFields(el.imageGroup || {});
    igSelectedFieldIdx = Math.max(0, Math.min(list.length - 1, index));
    root.querySelectorAll('.ig-field-row').forEach(row => row.classList.toggle('is-selected', Number(row.dataset.igFieldIdx) === igSelectedFieldIdx));
    renderImageGroupZoneBlueprint(el.imageGroup || {}, list);
    if (!reveal) return;
    const host = $('ig-fields-list'), row = host?.querySelector(`[data-ig-field-idx="${igSelectedFieldIdx}"]`);
    if (!row) return;
    row.querySelector('.ig-field-advanced').open = true;
    host.scrollTo({ top: Math.max(0, row.offsetTop - 8), behavior: 'smooth' });
}

function selectGroupBuilderTab(tab) {
    const dialog = $('ig-fields-dialog');
    if (!dialog) return;
    const selected = tab === 'strip' ? 'strip' : 'badge';
    dialog.dataset.builderTab = selected;
    try { localStorage.setItem('streampulse_badge_builder_tab', selected); } catch { /* Optional preference. */ }
    dialog.querySelectorAll('[data-ig-builder-tab]').forEach(button => {
        const active = button.dataset.igBuilderTab === selected;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    dialog.querySelectorAll('[data-ig-builder-panel]').forEach(panel => { panel.hidden = panel.dataset.igBuilderPanel !== selected; });

}

function resolveImageGroupFieldKind(f, setFields = []) {
    if (!f) return 'text';
    if (f.kind === 'image' || f.kind === 'text') return f.kind;
    const sf = (setFields || []).find(item => item.key === f.key);
    if (sf?.type === 'image') return 'image';
    if (f.customSrc && !sf) return 'image';
    if (/^(avatar|photo|image|img|icon|pic|logo|crest|emblem|badge_img|flag)/i.test(String(f.key || ''))) return 'image';
    return 'text';
}

const IMAGE_GROUP_ARRANGEMENT_PRESETS = {
    stack: { layout: 'row', cardFrame: false, cardWidthMode: 'auto', showAvatar: true, showLabels: true, labelPosition: 'below', textAlign: 'center', delimiter: '', innerGap: 8, fieldGap: 2, slots: ['main', 'main', 'main'] },
    'profile-card': { layout: 'cards', cardFrame: true, cardWidthMode: 'fixed', cardWidth: 260, showAvatar: true, showLabels: true, labelPosition: 'below', textAlign: 'center', delimiter: '', cardPaddingX: 14, cardPaddingY: 14, innerGap: 8, fieldGap: 3, slots: ['header', 'main', 'main', 'footer'] },
    'card-grid': { layout: 'grid', columns: 3, cardFrame: true, cardWidthMode: 'full', showAvatar: true, showLabels: true, labelPosition: 'below', textAlign: 'center', delimiter: '', cardPaddingX: 12, cardPaddingY: 12, innerGap: 8, fieldGap: 3, slots: ['main', 'main', 'footer'] },
    'lower-banners': { layout: 'banners', cardFrame: true, cardWidthMode: 'fixed', cardWidth: 320, showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'left', delimiter: '', cardPaddingX: 14, cardPaddingY: 10, innerGap: 12, fieldGap: 2, slots: ['main', 'main', 'trailing'] },
    'broadcast-hud': { layout: 'cards', cardFrame: true, cardWidthMode: 'fixed', cardWidth: 340, cardAlign: 'center', showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'left', delimiter: '', cardPaddingX: 14, cardPaddingY: 10, innerGap: 12, fieldGap: 2, slots: ['main', 'main', 'trailing', 'footer'] },
    'split-hud': { layout: 'cards', cardFrame: true, cardWidthMode: 'fixed', cardWidth: 240, showAvatar: true, showLabels: true, labelPosition: 'split', textAlign: 'center', delimiter: '', innerGap: 8, fieldGap: 2, slots: ['avatar-top', 'avatar-bottom', 'trailing'] },
    'corner-tag': { layout: 'cards', cardFrame: true, cardWidthMode: 'auto', showAvatar: true, showLabels: true, labelPosition: 'below', textAlign: 'center', delimiter: '', cardPaddingX: 10, cardPaddingY: 10, innerGap: 8, fieldGap: 2, cornerInset: 6, slots: ['main', 'main', 'corner-tr', 'avatar-top'] },
    'upper-left-crest': { layout: 'cards', cardFrame: true, cardWidthMode: 'fixed', cardWidth: 280, showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'left', delimiter: '', cardPaddingX: 14, cardPaddingY: 12, innerGap: 10, fieldGap: 3, cornerInset: 6, imgSlot: 'corner-tl', slots: ['main', 'main', 'trailing'] },
    'avatar-emblem': { layout: 'cards', cardFrame: true, cardWidthMode: 'fixed', cardWidth: 290, showAvatar: true, showLabels: true, labelPosition: 'right', textAlign: 'left', delimiter: '', cardPaddingX: 12, cardPaddingY: 10, innerGap: 12, fieldGap: 2, cornerInset: 2, imgSlot: 'avatar-br', slots: ['main', 'main', 'trailing'] },
    'inline-roster': { layout: 'row', wrap: true, cardFrame: false, cardWidthMode: 'auto', showAvatar: true, showLabels: true, labelPosition: 'below', textAlign: 'center', delimiter: '•', gap: 14, slots: ['main', 'main', 'main'] },
    'overlay-tags': { layout: 'row', cardFrame: false, cardWidthMode: 'auto', showAvatar: true, showLabels: true, labelPosition: 'inside-bottom', textAlign: 'center', delimiter: '', slots: ['main', 'corner-tr', 'main'] }
};

function applyImageGroupPreset(el, presetName) {
    if (!isImageGroup(el)) return false;
    const preset = IMAGE_GROUP_ARRANGEMENT_PRESETS[presetName];
    if (!preset) return false;
    const { slots, imgSlot, ...props } = preset;
    el.imageGroup = { ...(el.imageGroup || {}), ...props };
    const { fields: setFields } = imageGroupFieldMeta(el.imageGroup);
    if (Array.isArray(slots)) {
        let txtIdx = 0;
        let imgIdx = 0;
        const list = resolveImageGroupFields(el.imageGroup).map((f, idx) => {
            const isImg = resolveImageGroupFieldKind(f, setFields) === 'image';
            let nextSlot = f.slot || 'main';
            if (imgSlot && isImg) {
                nextSlot = imgIdx === 0 ? imgSlot : (imgSlot === 'corner-tl' ? 'avatar-br' : 'corner-tl');
                imgIdx += 1;
            } else {
                nextSlot = slots[txtIdx] || (isImg ? 'corner-tl' : 'main');
                txtIdx += 1;
            }
            return normalizeGroupFieldItem({ ...f, slot: nextSlot }, idx);
        }).filter(Boolean);
        el.imageGroup.fields = list;
        syncLegacyGroupFields(el.imageGroup);
    }
    return true;
}

function renderImageGroupFieldsModal() {
    const dlg = $('ig-fields-dialog');
    if (!dlg) return;
    const fieldHost = $('ig-fields-list'), fieldScroll = fieldHost?.scrollTop || 0;
    const expandedFields = new Map([...dlg.querySelectorAll('.ig-field-row')].map(row => [row.dataset.igFieldKey, row.querySelector('.ig-field-advanced').open]));
    const expandedSections = new Map([...dlg.querySelectorAll('details[data-sect]')].map(section => [section.dataset.sect, section.open]));
    const el = primary();
    if (!isImageGroup(el)) return;
    const ig = el.imageGroup || {};
    const { setObj, fields } = imageGroupFieldMeta(ig);
    const list = resolveImageGroupFields(ig);
    const widthMode = ig.cardWidthMode || ((ig.layout === 'banners') ? 'full' : 'auto');
    const padXVal = ig.cardPaddingX ?? ig.cardPadding ?? 8;
    const padYVal = ig.cardPaddingY ?? ig.cardPadding ?? 8;
    const baseTextFallback = Number(ig.labelSize) > 0 ? ig.labelSize : '';
    const layerFontPx = Number(el.style?.fontSize) || 15;
    const stripHost = $('ig-strip-controls');
    if (stripHost) stripHost.innerHTML = imageGroupLayoutSection(el, true);
    selectGroupBuilderTab(dlg.dataset.builderTab || readTab());
    const appearance = $('badge-visual-controls');
    if (appearance) appearance.innerHTML = context.visualControls(primary(), { F, fontOptions, inheritFontOptions }) + imageGroupStyleSections(el)
        + '<p class="hint">Set placement backgrounds, overall opacity, filters and effects in the Custom Overlay Editor.</p>';

    const geomHost = $('ig-quick-geometries');
    if (geomHost) {
        geomHost.innerHTML = IG_QUICK_GEOMETRIES.map(g => `<button type="button" class="ig-geom-btn${g.match(ig) ? ' active' : ''}" data-ig-geom="${esc(g.id)}">${g.svg}<span>${esc(g.label)}</span></button>`).join('');
    }
    renderImageGroupLayoutHint(el, ig, list);
    renderImageGroupZoneBlueprint(ig, list);

    const placeHost = $('ig-modal-placement');
    if (placeHost) {
        placeHost.innerHTML = `<label>Fields placement<select id="ig-modal-pos">${IG_PLACEMENTS.map(([v, l]) => `<option value="${esc(v)}"${(ig.labelPosition || 'below') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label>Text alignment<select id="ig-modal-align">${IG_TEXT_ALIGNS.map(([v, l]) => `<option value="${esc(v)}"${(ig.textAlign || 'auto') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label>Badge Y align<select id="ig-modal-card-align">${IG_CARD_ALIGNS.map(([v, l]) => `<option value="${esc(v)}"${(ig.cardAlign || 'center') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label>Base font size (px)<input type="number" id="ig-modal-label-size" value="${esc(baseTextFallback)}" placeholder="Auto (${layerFontPx}px)" min="0" max="72" step="1"></label>
            <label>Width mode<select id="ig-modal-width-mode">${IG_WIDTH_MODES.map(([v, l]) => `<option value="${esc(v)}"${widthMode === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            ${widthMode === 'fixed' ? `<label>Width (px)<input type="number" id="ig-modal-card-width" value="${esc(ig.cardWidth ?? 240)}" min="60" max="1600" step="4"></label>` : ''}
            <label>Min height (px)<input type="number" id="ig-modal-card-height" value="${esc(ig.cardMinHeight ?? 0)}" min="0" max="800" step="2"></label>
            <label>Corner inset (px)<input type="number" id="ig-modal-corner-inset" value="${esc(ig.cornerInset ?? 6)}" min="0" max="32" step="1"></label>
            <label>Card pad X (px)<input type="number" id="ig-modal-pad-x" value="${esc(padXVal)}" min="0" max="64" step="1"></label>
            <label>Card pad Y (px)<input type="number" id="ig-modal-pad-y" value="${esc(padYVal)}" min="0" max="64" step="1"></label>
            <label>Field gap (px)<input type="number" id="ig-modal-field-gap" value="${esc(ig.fieldGap ?? 2)}" min="0" max="40" step="1"></label>
            ${ig.showAvatar !== false ? F.number('imageGroup.innerGap', 'Image to text gap (px)', ig.innerGap ?? 8, { min: 0, max: 60 }) : ''}
            ${F.select('imageGroup.textWrap', 'Text wrapping', ig.textWrap || 'truncate', [['truncate', 'Truncate (...)'], ['wrap', 'Wrap multi-line']])}
            ${ig.showAvatar !== false ? F.number('imageGroup.size', 'Primary image size (px)', ig.size ?? 56, { min: 16, max: 400, step: 2 }) + F.select('imageGroup.aspectRatio', 'Primary image ratio', ig.aspectRatio || '1:1', [['1:1', 'Square'], ['4:3', 'Wide'], ['16:9', 'Cinema'], ['3:4', 'Portrait'], ['21:9', 'Banner']]) : ''}
            <div class="ig-inline-checks">
                <label><input type="checkbox" id="ig-modal-show-avatar"${ig.showAvatar !== false ? ' checked' : ''}> Show primary avatar</label>
            </div>`;
    }

    const IG_SVG_COLOR_VAR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>';
    const hasColorVars = fields.some(sf => sf?.type === 'color')
        || (state.liveStatus?.customVars || []).some(cv => cv?.type === 'color')
        || (state.liveStatus?.variableSets || []).some(s => (s?.fields || []).some(sf => sf?.type === 'color'));
    const colorVarPickBtn = targetProp => (hasColorVars
        ? `<button type="button" class="ig-var-btn" data-ig-var-pick="${targetProp}" title="Bind color placeholder (@field or {{var.*}})" aria-label="Bind color placeholder">${IG_SVG_COLOR_VAR}</button>`
        : '');

    const host = $('ig-fields-list');
    const fieldsSignature = JSON.stringify([context.getDraft().catalogId, list, fields]);
    if (host && (host.getClientRects().length || fieldsSignature !== renderedFieldsSignature)) {
        const hexOr = (val, fallback) => {
            const raw = String(val || '').trim();
            if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
            if (raw.startsWith('@')) {
                const fk = raw.slice(1).trim();
                const sample = String((setObj?.roster || [])[0]?.values?.[fk] || '').trim();
                if (/^#[0-9a-f]{6}$/i.test(sample)) return sample;
            }
            if (raw.includes('{{var.')) {
                const m = raw.match(/\{\{\s*var\.([a-z0-9_.]+)\s*\}\}/i);
                const cv = m && (state.liveStatus?.customVars || []).find(v => shared.variableKey(v) === m[1]);
                if (cv && /^#[0-9a-f]{6}$/i.test(cv.value || '')) return cv.value;
            }
            return fallback;
        };
        const imgFields = fields.filter(sf => sf.type === 'image');
        const otherFields = fields.filter(sf => sf.type !== 'image');
        const buildKeySelect = f => {
            if (!fields.length) {
                return `<input type="text" data-ig-fprop="key" value="${esc(f.key)}" placeholder="field_key" maxlength="40">`;
            }
            const setHasKey = fields.some(sf => sf.key === f.key);
            const optTag = sf => `<option value="${esc(sf.key)}"${sf.key === f.key ? ' selected' : ''}>${esc(sf.label)} (${esc(sf.key)})</option>`;
            return `<select data-ig-fprop="key">
                ${otherFields.length ? `<optgroup label="Text & Data Fields">${otherFields.map(optTag).join('')}</optgroup>` : ''}
                ${imgFields.length ? `<optgroup label="Image Fields">${imgFields.map(optTag).join('')}</optgroup>` : ''}
                ${!setHasKey ? `<option value="${esc(f.key)}" selected>${esc(f.key)} (custom)</option>` : ''}
            </select>`;
        };
        host.innerHTML = list.length ? list.map((f, idx) => {
            const isImg = resolveImageGroupFieldKind(f, fields) === 'image';
            const setFieldIcon = fields.find(sf => sf.key === f.key)?.icon || '';
            if (!isImg && (f.icon || setFieldIcon)) window.IconPicker?.ensureFont?.();
            const weightOpts = [['', 'Auto'], ['400', 'Normal'], ['600', 'Semi-bold'], ['700', 'Bold'], ['900', 'Black']];
            const caseOpts = [['', 'Inherit'], ['none', 'As typed'], ['uppercase', 'UPPER'], ['lowercase', 'lower'], ['capitalize', 'Title']];
            const kindOpts = [['auto', 'Auto'], ['text', 'Text'], ['image', 'Image / Icon']];
            const fitOpts = [['contain', 'Contain (logos / icons)'], ['cover', 'Cover (crop fill)']];
            const imgShapeOpts = [['rounded', 'Rounded'], ['circle', 'Circle'], ['square', 'Square'], ['auto', 'Original ratio']];
            const approxPx = Math.max(8, Math.round((Number(ig.labelSize) > 0 ? ig.labelSize : layerFontPx) * ({ title: 1, accent: 0.88, subtitle: 0.82, caption: 0.75, badge: 0.72 }[f.role] || 0.9) * ((f.sizeScale || 100) / 100)));

            const bodyHtml = isImg
                ? `<div class="ig-field-row-mid">
                    <label>Display as<select data-ig-fprop="kind">${kindOpts.map(([v, l]) => `<option value="${esc(v)}"${(f.kind || 'auto') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Image size (px)<input type="number" data-ig-fprop="imgSize" value="${esc(f.imgSize ?? 28)}" min="10" max="200" step="2"></label>
                    <label>Fit<select data-ig-fprop="imgFit">${fitOpts.map(([v, l]) => `<option value="${esc(v)}"${(f.imgFit || 'contain') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Shape<select data-ig-fprop="imgShape">${imgShapeOpts.map(([v, l]) => `<option value="${esc(v)}"${(f.imgShape || 'rounded') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <div class="ig-src-row">
                        <label>Static icon / fallback URL<input type="text" data-ig-fprop="customSrc" value="${esc(f.customSrc || '')}" placeholder="Optional URL or pick from Assets (used if member field empty)" maxlength="1000"></label>
                        <button type="button" data-ig-pick-img="${idx}">Assets…</button>
                    </div>
                </div>
                <div class="ig-field-row-bot">
                    <label>Plate pad X (px)<input type="number" data-ig-fprop="padX" value="${esc(f.padX ?? '')}" placeholder="Auto" min="0" max="32"></label>
                    <label>Plate pad Y (px)<input type="number" data-ig-fprop="padY" value="${esc(f.padY ?? '')}" placeholder="Auto" min="0" max="32"></label>
                    <label>Border (px)<input type="number" data-ig-fprop="imgBorderW" value="${esc(f.imgBorderW ?? 0)}" min="0" max="8"></label>
                    <label class="ig-field-inline-chk"><input type="checkbox" data-ig-fprop="inline"${f.inline ? ' checked' : ''}> Inline with neighbor</label>
                    <label class="ig-grid-span2">Border color<span class="ig-color-mini"><input type="color" data-ig-fcolor="color" value="${esc(hexOr(f.color, '#ffffff'))}" aria-label="Image border color"><input type="text" data-ig-fprop="color" value="${esc(f.color || '')}" placeholder="Auto or @var" maxlength="80" spellcheck="false">${colorVarPickBtn('color')}</span></label>
                    <label class="ig-grid-span2">Plate background<span class="ig-color-mini"><input type="color" data-ig-fcolor="bgColor" value="${esc(hexOr(f.bgColor, '#0f172a'))}" aria-label="Image plate background"><input type="text" data-ig-fprop="bgColor" value="${esc(f.bgColor || '')}" placeholder="None or @var" maxlength="80" spellcheck="false">${colorVarPickBtn('bgColor')}</span></label>
                </div>`
                : `<div class="ig-field-row-mid">
                    <label>Style role<select data-ig-fprop="role">${IMAGE_GROUP_FIELD_ROLES.map(r => `<option value="${esc(r)}"${r === f.role ? ' selected' : ''}>${esc(IG_ROLE_LABELS[r] || r)}</option>`).join('')}</select></label>
                    <label>Display as<select data-ig-fprop="kind">${kindOpts.map(([v, l]) => `<option value="${esc(v)}"${(f.kind || 'auto') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Font<select data-ig-fprop="fontFamily" data-font-picker>${inheritFontOptions(f.fontFamily || '', 'Inherit role/base')}</select></label>
                    <label>Font size (px)<input type="number" data-ig-fprop="fontSize" value="${esc(f.fontSize ?? '')}" placeholder="Auto (~${approxPx}px)" min="8" max="96" step="1"></label>
                    <label>Scale %<input type="number" data-ig-fprop="sizeScale" value="${esc(f.sizeScale ?? 100)}" min="50" max="200" step="5"></label>
                    <label>Weight<select data-ig-fprop="fontWeight">${weightOpts.map(([v, l]) => `<option value="${esc(v)}"${(f.fontWeight || '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Case<select data-ig-fprop="textTransform">${caseOpts.map(([v, l]) => `<option value="${esc(v)}"${(f.textTransform || '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Align<select data-ig-fprop="align">${IG_TEXT_ALIGNS.map(([v, l]) => `<option value="${esc(v)}"${(f.align || 'auto') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                </div>
                <div class="ig-field-row-bot">
                    <label>Prefix<input type="text" data-ig-fprop="prefix" value="${esc(f.prefix || '')}" placeholder="e.g. @" maxlength="24"></label>
                    <label>Suffix<input type="text" data-ig-fprop="suffix" value="${esc(f.suffix || '')}" placeholder="e.g. pts" maxlength="24"></label>
                    <label>Pad X (px)<input type="number" data-ig-fprop="padX" value="${esc(f.padX ?? '')}" placeholder="Auto" min="0" max="32"></label>
                    <label>Pad Y (px)<input type="number" data-ig-fprop="padY" value="${esc(f.padY ?? '')}" placeholder="Auto" min="0" max="32"></label>
                    <label class="ig-field-inline-chk"><input type="checkbox" data-ig-fprop="fontStyle"${f.fontStyle === 'italic' ? ' checked' : ''}> Italic</label>
                    <label class="ig-field-inline-chk"><input type="checkbox" data-ig-fprop="inline"${f.inline ? ' checked' : ''}> Inline</label>
                    <label class="ig-grid-span2">Text color<span class="ig-color-mini"><input type="color" data-ig-fcolor="color" value="${esc(hexOr(f.color, '#ffffff'))}" aria-label="Field color picker"><input type="text" data-ig-fprop="color" value="${esc(f.color || '')}" placeholder="Auto, @field, or {{var.x}}" maxlength="80" spellcheck="false">${colorVarPickBtn('color')}</span></label>
                    <label class="ig-grid-span2">Pill background<span class="ig-color-mini"><input type="color" data-ig-fcolor="bgColor" value="${esc(hexOr(f.bgColor, '#0ea5e9'))}" aria-label="Field badge bg picker"><input type="text" data-ig-fprop="bgColor" value="${esc(f.bgColor || '')}" placeholder="None, @field, or {{var.x}}" maxlength="80" spellcheck="false">${colorVarPickBtn('bgColor')}</span></label>
                    <label class="ig-grid-span2">Inline icon<span class="ig-color-mini"><button type="button" data-ig-pick-icon="${idx}" style="flex:1;min-width:0;display:inline-flex;align-items:center;gap:0.35rem;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.icon === 'none' ? '<span>Hidden</span>' : f.icon ? `<i class="${esc(f.icon)}"></i> <span>${esc(f.icon)}</span>` : setFieldIcon ? `<i class="${esc(setFieldIcon)}"></i> <span>Auto (${esc(setFieldIcon)})</span>` : '<span>Pick icon…</span>'}</button>${f.icon ? `<button type="button" class="ig-var-pick-btn" data-ig-clear-icon="${idx}" title="Reset icon to Auto / None">&times;</button>` : ''}</span></label>
                </div>`;

            return `<div class="ig-field-row${isImg ? ' is-img-card' : ''}${idx === igSelectedFieldIdx ? ' is-selected' : ''}" data-ig-field-idx="${idx}" data-ig-field-key="${esc(f.key)}">
                <div class="ig-field-head">
                    <span class="ig-kind-badge${isImg ? ' is-img' : ''}">${isImg ? 'IMG' : 'TXT'}</span>
                    <label class="ig-field-head-grow">Field source${buildKeySelect(f)}</label>
                    <label class="ig-field-head-zone">Zone / Position<select data-ig-fprop="slot">${IMAGE_GROUP_SLOTS.map(s => `<option value="${esc(s)}"${s === (f.slot || 'main') ? ' selected' : ''}>${esc(fieldSlotLabel(s, ig))}</option>`).join('')}</select></label>
                    <div class="ig-field-head-actions">
                        <button type="button" data-ig-move="up" data-idx="${idx}" title="Move up"${idx === 0 ? ' disabled' : ''}>${IG_SVG_UP}</button>
                        <button type="button" data-ig-move="down" data-idx="${idx}" title="Move down"${idx === list.length - 1 ? ' disabled' : ''}>${IG_SVG_DOWN}</button>
                        <button type="button" data-ig-remove="${idx}" title="Remove field" aria-label="Remove field">${IG_SVG_REMOVE}</button>
                    </div>
                </div>
                <details class="ig-field-advanced"${idx === igSelectedFieldIdx ? ' open' : ''}><summary>${isImg ? 'Image & plate styling' : 'Typography, icons & styling'}</summary>${bodyHtml}</details>
            </div>`;
        }).join('') : '<p class="hint">No fields configured yet. Click <strong>+ Text Field</strong> or <strong>+ Image / Icon</strong> above, or pick an Arrangement Preset on the left.</p>';
        host.querySelectorAll('.ig-field-row').forEach(row => {
            if (expandedFields.has(row.dataset.igFieldKey)) row.querySelector('.ig-field-advanced').open = expandedFields.get(row.dataset.igFieldKey);
        });
        host.scrollTop = fieldScroll;
        renderedFieldsSignature = fieldsSignature;
    }
    dlg.querySelectorAll('details[data-sect]').forEach(section => {
        if (expandedSections.has(section.dataset.sect)) section.open = expandedSections.get(section.dataset.sect);
    });

    const cnt = $('ig-fields-count');
    if (cnt) cnt.textContent = `${list.length} / 10`;
    const addBtn = $('ig-add-field-btn');
    if (addBtn) addBtn.disabled = list.length >= 10;
    const addImgBtn = $('ig-add-image-btn');
    if (addImgBtn) addImgBtn.disabled = list.length >= 10;
    renderGroupBadgePreview(el);
}

function mutateImageGroupFields(el, mutator) {
    if (!isImageGroup(el)) return false;
    const ig = el.imageGroup || (el.imageGroup = defaultImageGroupConfig());
    const list = resolveImageGroupFields(ig).map(f => ({ ...f }));
    const next = mutator(list, ig);
    ig.fields = (Array.isArray(next) ? next : list)
        .map((f, idx) => normalizeGroupFieldItem(f, idx))
        .filter(Boolean)
        .slice(0, 10);
    syncLegacyGroupFields(ig);
    return true;
}

function addNextImageGroupField(el, { preferImage = false } = {}) {
    return mutateImageGroupFields(el, (fields, ig) => {
        if (fields.length >= 10) return fields;
        const { fields: setFields } = imageGroupFieldMeta(ig);
        const used = new Set(fields.map(f => f.key));
        if (preferImage) {
            const primaryImgKey = ig.imageField || 'image';
            const candidate = setFields.find(sf => sf.type === 'image' && sf.key !== primaryImgKey && !used.has(sf.key))
                || setFields.find(sf => sf.type === 'image' && !used.has(sf.key))
                || setFields.find(sf => sf.type === 'image');
            const key = candidate?.key || (used.has('crest') ? `icon_${fields.length + 1}` : 'crest');
            const usedCorners = new Set(fields.map(f => f.slot));
            const defaultSlot = ['corner-tl', 'avatar-br', 'corner-tr', 'trailing'].find(s => !usedCorners.has(s)) || 'corner-tl';
            return [...fields, {
                key,
                kind: 'image',
                customSrc: candidate ? '' : IG_MODAL_SAMPLE_CREST,
                role: 'accent',
                slot: defaultSlot,
                align: 'auto',
                inline: false,
                imgSize: 26,
                imgFit: 'contain',
                imgShape: 'rounded',
                imgBorderW: 0,
                sizeScale: 100,
                color: '',
                bgColor: ''
            }];
        }
        const candidate = setFields.find(sf => sf.type !== 'image' && sf.type !== 'url' && !used.has(sf.key))
            || setFields.find(sf => sf.type !== 'image' && sf.type !== 'url')
            || setFields[0];
        const key = candidate?.key || `field_${fields.length + 1}`;
        const textCount = fields.filter(f => resolveImageGroupFieldKind(f, setFields) !== 'image').length;
        const role = textCount === 0 ? 'title' : textCount === 1 ? 'subtitle' : 'badge';
        ig.showLabels = true;
        return [...fields, { key, kind: 'auto', role, slot: 'main', align: 'auto', fontFamily: '', fontWeight: '', fontStyle: '', textTransform: '', inline: role === 'badge', prefix: '', suffix: '', sizeScale: 100, color: '', bgColor: '' }];
    });
}

    const igDlg = root;
    context.bindControls(igDlg, primary, renderImageGroupFieldsModal);
        igDlg.addEventListener('focusin', event => {
            const row = event.target.closest('.ig-field-row');
            if (row && Number(row.dataset.igFieldIdx) !== igSelectedFieldIdx) selectImageGroupField(Number(row.dataset.igFieldIdx));
        });
        igDlg.addEventListener('keydown', event => {
            if (event.target.matches('[data-ig-bp-zone]') && ['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                event.target.click();
                return;
            }
            if (!event.target.matches('[data-ig-builder-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = [...igDlg.querySelectorAll('[data-ig-builder-tab]')];
            const index = buttons.indexOf(event.target);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next].focus();
            buttons[next].click();
        });
        const refreshIgAll = (commit, rebuild = false) => {
            context.onChange();
            if (rebuild) renderImageGroupFieldsModal();
        };
        igDlg.addEventListener('mousedown', event => {
            if (event.target.matches?.('[data-font-picker]') && shared.loadGoogleFont) {
                GOOGLE_FONT_OPTIONS.forEach(([v]) => shared.loadGoogleFont(v));
            }
        });
        igDlg.addEventListener('click', event => {
            const rawTarget = event.target;
            const bpPill = rawTarget.closest('[data-ig-bp-pill]');
            if (bpPill) {
                selectImageGroupField(Number(bpPill.dataset.igBpPill), true);
                return;
            }
            const bpZone = rawTarget.closest('[data-ig-bp-zone]');
            if (bpZone) {
                const el = primary();
                if (!isImageGroup(el)) return;
                const zone = bpZone.dataset.igBpZone;
                mutateImageGroupFields(el, list => {
                    const idx = Math.max(0, Math.min(list.length - 1, igSelectedFieldIdx));
                    if (list[idx]) list[idx].slot = zone;
                    return list;
                });
                const selector = igDlg.querySelector(`.ig-field-row[data-ig-field-idx="${igSelectedFieldIdx}"] [data-ig-fprop="slot"]`);
                if (selector) selector.value = zone;
                renderImageGroupZoneBlueprint(el.imageGroup || {}, resolveImageGroupFields(el.imageGroup || {}));
                context.onChange();
                return;
            }
            const fieldRow = rawTarget.closest('.ig-field-row[data-ig-field-idx]');
            if (fieldRow) {
                const el = primary();
                if (isImageGroup(el)) {
                    const nextIdx = Number(fieldRow.dataset.igFieldIdx) || 0;
                    if (nextIdx !== igSelectedFieldIdx) {
                        selectImageGroupField(nextIdx);
                    }
                }
                if (!rawTarget.closest('button, input, select, label')) return;
            }
            const target = rawTarget.closest('button');
            if (!target) return;
            if (target.dataset.igBuilderTab) {
                selectGroupBuilderTab(target.dataset.igBuilderTab);
                renderImageGroupFieldsModal();
                return;
            }
            const bgBtn = target.closest('[data-ig-preview-bg]');
            if (bgBtn) {
                const bg = bgBtn.dataset.igPreviewBg || 'dark';
                const stage = $('ig-preview-stage');
                if (stage) {
                    stage.classList.remove('is-dark', 'is-light', 'is-checker');
                    stage.classList.add(`is-${bg}`);
                }
                igDlg.querySelectorAll('[data-ig-preview-bg]').forEach(btn => btn.setAttribute('aria-pressed', String(btn === bgBtn)));
                return;
            }
            if (target.id === 'ig-fields-close') {
                if (typeof igDlg.close === 'function') igDlg.close();
                else igDlg.removeAttribute('open');
                return;
            }
            const el = primary();
            if (!isImageGroup(el)) return;
            const presetBtn = target.closest('[data-ig-preset]');
            if (presetBtn && applyImageGroupPreset(el, presetBtn.dataset.igPreset)) {
                refreshIgAll(true, true);
                return;
            }
            const geomBtn = target.closest('[data-ig-geom]');
            if (geomBtn) {
                const geom = IG_QUICK_GEOMETRIES.find(g => g.id === geomBtn.dataset.igGeom);
                if (geom) {
                    const ig = el.imageGroup || (el.imageGroup = defaultImageGroupConfig());
                    geom.apply(ig);
                    refreshIgAll(true, true);
                }
                return;
            }
            const hintBtn = target.closest('[data-ig-hint-action]');
            if (hintBtn) {
                const ig = el.imageGroup || (el.imageGroup = defaultImageGroupConfig());
                if (hintBtn.dataset.igHintAction === 'full-width') ig.cardWidthMode = 'full';
                else if (hintBtn.dataset.igHintAction === 'trim-pad') {
                    ig.cardPaddingX = 14;
                    if (Number(ig.cardBorderWidth ?? 0) > 6) ig.cardBorderWidth = 4;
                }
                refreshIgAll(true, true);
                return;
            }
            if (target.id === 'ig-add-field-btn') {
                if (addNextImageGroupField(el)) refreshIgAll(true, true);
                return;
            }
            if (target.id === 'ig-add-image-btn') {
                if (addNextImageGroupField(el, { preferImage: true })) refreshIgAll(true, true);
                return;
            }
            const varPickBtn = target.closest('[data-ig-var-pick]');
            if (varPickBtn) {
                const row = varPickBtn.closest('[data-ig-field-idx]');
                const idx = row ? Number(row.dataset.igFieldIdx) : -1;
                const varTarget = varPickBtn.dataset.igVarPick;
                if (idx >= 0 && varTarget) {
                    context.pickColor({
                        allowMember: true,
                        onSelect: val => {
                            mutateImageGroupFields(el, list => {
                                if (list[idx]) list[idx][varTarget] = val;
                                return list;
                            });
                            refreshIgAll(true, true);
                        }
                    });
                }
                return;
            }
            const pickIconBtn = target.closest('[data-ig-pick-icon]');
            if (pickIconBtn) {
                const idx = Number(pickIconBtn.dataset.igPickIcon);
                const ig = el.imageGroup || {};
                const fields = resolveImageGroupFields(ig);
                const curField = fields[idx];
                const { fields: setFields } = imageGroupFieldMeta(ig);
                const setFieldIcon = setFields.find(sf => sf.key === curField?.key)?.icon || '';
                const curVal = curField?.icon && curField.icon !== 'none' ? curField.icon : setFieldIcon;
                window.IconPicker?.open({
                    value: curVal,
                    onPick: cls => {
                        mutateImageGroupFields(el, list => {
                            if (!list[idx]) return list;
                            list[idx].icon = cls ? cls : (setFieldIcon ? 'none' : '');
                            return list;
                        });
                        refreshIgAll(true, true);
                    }
                });
                return;
            }
            const clearIconBtn = target.closest('[data-ig-clear-icon]');
            if (clearIconBtn) {
                const idx = Number(clearIconBtn.dataset.igClearIcon);
                mutateImageGroupFields(el, list => {
                    if (!list[idx]) return list;
                    list[idx].icon = '';
                    return list;
                });
                refreshIgAll(true, true);
                return;
            }
            const pickImgBtn = target.closest('[data-ig-pick-img]');
            if (pickImgBtn) {
                const idx = Number(pickImgBtn.dataset.igPickImg);
                context.pickAsset(url => {
                    mutateImageGroupFields(el, list => {
                        if (!list[idx]) return list;
                        list[idx].kind = 'image';
                        list[idx].customSrc = url;
                        return list;
                    });
                    refreshIgAll(true, true);
                });
                return;
            }
            const moveBtn = target.closest('[data-ig-move]');
            if (moveBtn) {
                const idx = Number(moveBtn.dataset.idx);
                const dir = moveBtn.dataset.igMove === 'up' ? -1 : 1;
                mutateImageGroupFields(el, list => {
                    const swap = idx + dir;
                    if (swap < 0 || swap >= list.length) return list;
                    [list[idx], list[swap]] = [list[swap], list[idx]];
                    if (igSelectedFieldIdx === idx) igSelectedFieldIdx = swap;
                    else if (igSelectedFieldIdx === swap) igSelectedFieldIdx = idx;
                    return list;
                });
                refreshIgAll(true, true);
                return;
            }
            const rmBtn = target.closest('[data-ig-remove]');
            if (rmBtn) {
                const idx = Number(rmBtn.dataset.igRemove);
                mutateImageGroupFields(el, list => list.filter((_, i) => i !== idx));
                if (idx < igSelectedFieldIdx) igSelectedFieldIdx--;
                refreshIgAll(true, true);
            }
        });
        const onIgModalFieldEdit = event => {
            const el = primary();
            if (!isImageGroup(el)) return;
            const t = event.target;
            if (t.id === 'badge-selected-field') {
                selectImageGroupField(Number(t.value), true);
                return;
            }
            if (t.id === 'badge-arrangement') {
                if (applyImageGroupPreset(el, t.value)) refreshIgAll(true, true);
                return;
            }
            if (t.id === 'ig-modal-pos') {
                el.imageGroup.labelPosition = t.value;
                renderImageGroupZoneBlueprint(el.imageGroup, resolveImageGroupFields(el.imageGroup));
                refreshIgAll(true, false);
                return;
            }
            if (t.id === 'ig-modal-align') {
                el.imageGroup.textAlign = t.value;
                refreshIgAll(true, false);
                return;
            }
            if (t.id === 'ig-modal-card-align') {
                el.imageGroup.cardAlign = t.value;
                refreshIgAll(true, false);
                return;
            }
            if (t.id === 'ig-modal-label-size') {
                el.imageGroup.labelSize = t.value === '' ? 0 : Math.max(0, Math.min(72, Math.round(Number(t.value) || 0)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-width-mode') {
                el.imageGroup.cardWidthMode = t.value;
                refreshIgAll(true, true);
                return;
            }
            if (t.id === 'ig-modal-card-width') {
                el.imageGroup.cardWidth = Math.max(60, Math.min(1600, Math.round(Number(t.value) || 240)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-card-height') {
                el.imageGroup.cardMinHeight = Math.max(0, Math.min(800, Math.round(Number(t.value) || 0)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-corner-inset') {
                el.imageGroup.cornerInset = Math.max(0, Math.min(32, Math.round(Number(t.value) || 0)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-pad-x') {
                el.imageGroup.cardPaddingX = t.value === '' ? null : Math.max(0, Math.min(64, Math.round(Number(t.value) || 0)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-pad-y') {
                el.imageGroup.cardPaddingY = t.value === '' ? null : Math.max(0, Math.min(64, Math.round(Number(t.value) || 0)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-field-gap') {
                el.imageGroup.fieldGap = Math.max(0, Math.min(40, Math.round(Number(t.value) || 0)));
                refreshIgAll(event.type === 'change', false);
                return;
            }
            if (t.id === 'ig-modal-show-avatar') {
                el.imageGroup.showAvatar = t.checked;
                refreshIgAll(true, true);
                return;
            }
            const row = t.closest('[data-ig-field-idx]');
            if (!row) return;
            const idx = Number(row.dataset.igFieldIdx);
            const fColorProp = t.dataset.igFcolor;
            const prop = fColorProp || t.dataset.igFprop;
            if (!prop) return;
            if (prop === 'fontFamily' && t.value && shared.loadGoogleFont) shared.loadGoogleFont(t.value);
            if (fColorProp) {
                const pairedText = row.querySelector(`input[data-ig-fprop="${fColorProp}"]`);
                if (pairedText) pairedText.value = t.value;
            }
            mutateImageGroupFields(el, list => {
                if (!list[idx]) return list;
                let val = t.value;
                if (prop === 'fontStyle') val = t.checked ? 'italic' : '';
                else if (t.type === 'checkbox') val = t.checked;
                else if (prop === 'sizeScale') val = Number(t.value) || 100;
                else if (prop === 'imgSize') val = Math.max(10, Math.min(200, Math.round(Number(t.value) || 28)));
                else if (prop === 'imgBorderW') val = Math.max(0, Math.min(8, Math.round(Number(t.value) || 0)));
                else if (prop === 'fontSize') val = t.value === '' ? null : Math.max(8, Math.min(96, Math.round(Number(t.value) || 14)));
                else if (prop === 'padX' || prop === 'padY') val = t.value === '' ? null : Math.max(0, Math.min(32, Math.round(Number(t.value) || 0)));
                list[idx][prop] = val;
                return list;
            });
            const needsModalRebuild = prop === 'kind' || (prop === 'key' && event.type === 'change');
            if (prop === 'slot') renderImageGroupZoneBlueprint(el.imageGroup || {}, resolveImageGroupFields(el.imageGroup || {}));
            refreshIgAll(event.type === 'change', needsModalRebuild);
        };
        igDlg.addEventListener('input', onIgModalFieldEdit);
        igDlg.addEventListener('change', onIgModalFieldEdit);
    return { render() {
        root.hidden = false;
        if (!root.childElementCount) {
            root.innerHTML = TEMPLATE;
            const startingPoints = document.createElement('details');
            startingPoints.className = 'ig-starting-points';
            startingPoints.innerHTML = '<summary>Layout starting points</summary>';
            startingPoints.append(...root.querySelectorAll('.ig-presets-section'));
            root.querySelector('.ig-builder-left').prepend(startingPoints);
        }
        renderImageGroupFieldsModal();
    } };
}
