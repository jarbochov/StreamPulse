/**
 * StreamPulse Custom Overlay Editor — Property Inspector & Settings Panels
 */

import {
    $, esc, clamp, getPath, setPath, hasText, isLine, state, prefs, savePrefs,
    CANVAS_PRESETS, SYSTEM_FONTS, GOOGLE_FONT_OPTIONS, LIMITS, ICON, TYPE_META,
    ALERT_TRIGGER_LABELS, TEXT_TYPES, FILL_TEXT_TYPES, LOCAL_MEDIA, selectedElements,
    primary, byId, boundsOf, displayName, changed, toast, alertSample, variableContext
} from './editor-state.js';
import { F, bindFields } from './editor-form.js';
import {
    renderCanvas, renderSelectionUI, syncCanvasUI, fitView,
    scheduleEditorCutoutMask, updateEditorCutoutMask
} from './editor-canvas.js';
import { renderLayers } from './editor-layers.js';

const shared = window.OverlayShared || {};

let updateStatusBarHandler = () => {};
let runActionHandler = () => {};
let alignSelectionHandler = () => {};
let distributeSelectionHandler = () => {};
let scaleSelectionByHandler = () => {};
let uploadAssetHandler = () => Promise.resolve('');
let fitToMediaHandler = () => Promise.resolve();
let openAssetDialogHandler = () => {};

export function registerInspectorCallbacks(callbacks) {
    if (callbacks.onUpdateStatusBar) updateStatusBarHandler = callbacks.onUpdateStatusBar;
    if (callbacks.onRunAction) runActionHandler = callbacks.onRunAction;
    if (callbacks.onAlignSelection) alignSelectionHandler = callbacks.onAlignSelection;
    if (callbacks.onDistributeSelection) distributeSelectionHandler = callbacks.onDistributeSelection;
    if (callbacks.onScaleSelectionBy) scaleSelectionByHandler = callbacks.onScaleSelectionBy;
    if (callbacks.onUploadAsset) uploadAssetHandler = callbacks.onUploadAsset;
    if (callbacks.onFitToMedia) fitToMediaHandler = callbacks.onFitToMedia;
    if (callbacks.onOpenAssetDialog) openAssetDialogHandler = callbacks.onOpenAssetDialog;
}

// Controls that only matter for certain settings are hidden; changing one of these settings rebuilds the panel.
export const RERENDER_PATHS = new Set([
    'cutout.shape', 'alert.showOnPreview', 'style.objectFit', 'mediaFilter.duotone.enabled',
    'mediaFilter.duotone.animate', 'mediaFilter.grain.enabled', 'mediaFilter.tint.enabled',
    'style.gradient.enabled', 'style.gradient.type', 'style.gradient.animate',
    'style.textStroke.width', 'style.textShadow.blur', 'style.background', 'video.sound',
    'alert.layout', 'alert.hideText', 'slideshow.source', 'slideshow.advance', 'slideshow.transition',
    'slideshow.kinds', 'textFit', 'columns', 'random.typewriter', 'random.marquee',
    'progress.showLabel', 'gameList.showCovers', 'gameList.showTitles', 'gameList.showStatusBadge',
    'gameList.showGroupBadge', 'gameList.headings', 'gameList.highlightCurrent', 'gameList.meta'
]);

export const numberWasOn = new Map();

export function numberCrossedZero(path, event) {
    if (!/^style\.(textStroke\.width|textShadow\.blur)$/.test(path) || event?.target?.dataset?.kind !== 'number' || event.type !== 'input') return true;
    const now = Number(getPath(selectedElements()[0], path)) > 0;
    const crossed = numberWasOn.get(path) !== now;
    numberWasOn.set(path, now);
    return crossed;
}

export function syncGeometryInputs() {
    const el = state.selectedIds.size === 1 ? primary() : null;
    if (!el) return;
    for (const path of ['x', 'y', 'width', 'height']) {
        const input = $('properties')?.querySelector(`[data-path="${path}"]`);
        if (input && document.activeElement !== input) input.value = String(Math.round(el[path]));
    }
}

// ---- Editor Settings (left rail) --------------------------------------------------
export function renderSettings() {
    const settingsEl = $('settings');
    if (!settingsEl) return;
    const c = state.overlay.canvas;
    const preset = `${c.width}x${c.height}`;
    const presetOptions = CANVAS_PRESETS.some(([v]) => v === preset) ? CANVAS_PRESETS : [[preset, `Custom ${c.width} × ${c.height}`], ...CANVAS_PRESETS];
    settingsEl.innerHTML = `
        <label class="field"><span>Canvas size</span><select id="canvas-preset">${presetOptions.map(([v, l]) => `<option value="${v}"${v === preset ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="grid2">${F.number('canvas.width', 'Width', c.width, { min: LIMITS.canvasW[0], max: LIMITS.canvasW[1], lazy: true })}${F.number('canvas.height', 'Height', c.height, { min: LIMITS.canvasH[0], max: LIMITS.canvasH[1], lazy: true })}</div>
        ${F.color('canvas.background', 'Canvas background', c.background, { clear: true })}
        <label class="field"><span>Preview backdrop</span><select id="backdrop-select">${[['checker', 'Transparent checkerboard'], ['dark', 'Dark'], ['light', 'Light'], ['green', 'Green screen']].map(([v, l]) => `<option value="${v}"${v === prefs.backdrop ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="field">
            <span>Screenshot backdrop</span>
            <span class="upload-row">
                <input type="file" id="backdrop-upload" accept="image/*" style="display:none">
                <button type="button" id="backdrop-upload-btn">${prefs.backdropImage ? 'Change screenshot…' : 'Upload screenshot…'}</button>
                ${prefs.backdropImage ? `<button type="button" id="backdrop-clear-btn" class="danger" title="Remove backdrop screenshot">Clear</button>` : ''}
            </span>
            <span class="hint">Preview widgets over your actual gameplay or stream layout.</span>
        </div>
        ${prefs.backdropImage ? `
        <label class="field">
            <span>Backdrop opacity</span>
            <span class="range-field">
                <input type="range" id="backdrop-opacity-range" min="5" max="100" step="5" value="${prefs.backdropOpacity ?? 80}">
                <output>${prefs.backdropOpacity ?? 80}%</output>
            </span>
        </label>` : ''}
        <p class="hint">${state.overlay.canvas.background && !/^(transparent|rgba\(.*,\s*0\))$/i.test(state.overlay.canvas.background) ? 'The canvas background is set, so it covers the backdrop. Click None to preview the backdrop.' : 'The backdrop is only for editing. The OBS browser source stays transparent unless you set a background.'}</p>`;
}

// ---- Inspector Sections -----------------------------------------------------------
export function fontOptions(current) {
    const uploaded = (shared.assetFonts || []).map(font => [`'${font.family}', sans-serif`, font.family]);
    const known = [...SYSTEM_FONTS, ...GOOGLE_FONT_OPTIONS, ...uploaded];
    const custom = known.some(([v]) => v === current) ? '' : `<option value="${esc(current)}" selected>${esc(String(current).split(',')[0].replace(/['"]/g, ''))} (custom)</option>`;
    const opt = ([v, l]) => `<option value="${esc(v)}" style="font-family:${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`;
    return `${custom}${SYSTEM_FONTS.map(opt).join('')}${uploaded.length ? `<optgroup label="Uploaded fonts">${uploaded.map(opt).join('')}</optgroup>` : ''}<optgroup label="Google Fonts">${GOOGLE_FONT_OPTIONS.map(opt).join('')}</optgroup>`;
}

export function actionBar(items) {
    const single = items.length === 1 ? items[0] : null;
    const grouped = items.some(el => el.group);
    const label = single ? `<span class="badge">${esc(TYPE_META[single.type]?.label || single.type)}</span><span class="nm">${esc(displayName(single))}</span>` : `<span class="badge">${items.length} selected</span>`;
    const link = (items.length > 1 ? `<button type="button" class="link-btn" data-act="group" title="Group (Ctrl/⌘+G)">Group</button>` : '') + (grouped ? `<button type="button" class="link-btn" data-act="ungroup" title="Ungroup (Ctrl/⌘+Shift+G)">Ungroup</button>` : '');
    const allLocked = items.every(el => el.locked), allHidden = items.every(el => el.visible === false);
    const btn = (act, icon, text, cls = '') => `<button type="button" class="icon ${cls}" data-act="${act}" title="${text}" aria-label="${text}">${icon}</button>`;
    return `<div class="action-bar"><div class="title">${label}<span class="spacer"></span>${link}</div>
        <div class="btn-cluster">${btn('duplicate', ICON.copy, 'Duplicate (Ctrl/⌘+D)')}${btn('preset', ICON.preset, 'Save selection as a preset…')}${btn('delete', ICON.trash, 'Delete (Del)', 'danger')}</div>
        <div class="btn-cluster">${btn('front', ICON.toFront, 'Bring to front')}${btn('forward', ICON.forward, 'Bring forward')}${btn('backward', ICON.backward, 'Send backward')}${btn('back', ICON.toBack, 'Send to back')}</div>
        <div class="btn-cluster">${btn('lock', allLocked ? ICON.lock : ICON.unlock, allLocked ? 'Unlock' : 'Lock')}${btn('hide', allHidden ? ICON.eyeOff : ICON.eye, allHidden ? 'Show' : 'Hide')}</div></div>`;
}

export function scaleSection(items) {
    const b = boundsOf(items), quick = [50, 75, 125, 150, 200];
    return F.section('scale', 'Scale', `
        <div class="field"><span>Current size</span><span class="hint" style="margin:0">${Math.round(b.w)} × ${Math.round(b.h)} px</span></div>
        <div class="field"><span>Scale by (%)</span><span class="upload-row"><input type="number" id="scale-pct" value="100" min="10" max="500" step="5" aria-label="Scale percent"><button type="button" id="scale-apply">Apply</button></span></div>
        <div class="seg" style="display:flex;flex-wrap:wrap;gap:4px">${quick.map(p => `<button type="button" data-scale="${p}">${p}%</button>`).join('')}</div>
        <label class="check-row" style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem"><input type="checkbox" id="scale-text" ${prefs.scaleText !== false ? 'checked' : ''}> Scale text, borders and padding too</label>
        <span class="hint">Scales around the center. You can also drag the handles on the selection: corners keep proportions, Shift stretches freely.</span>`);
}

export function alignBody(items) {
    const multi = items.length > 1;
    const buttons = [
        ['left', ICON.alignLeft, multi ? 'Align left edges' : 'Align to left edge of canvas'],
        ['center', ICON.alignCenter, multi ? 'Align horizontal centers' : 'Center horizontally on canvas'],
        ['right', ICON.alignRight, multi ? 'Align right edges' : 'Align to right edge of canvas'],
        ['top', ICON.alignTop, multi ? 'Align top edges' : 'Align to top edge of canvas'],
        ['middle', ICON.alignMiddle, multi ? 'Align vertical centers' : 'Center vertically on canvas'],
        ['bottom', ICON.alignBottom, multi ? 'Align bottom edges' : 'Align to bottom edge of canvas']
    ];
    const target = multi
        ? `<div class="field" style="margin-bottom:.35rem"><span>Align relative to</span><span class="seg" data-align-target>${[['selection', 'Selection'], ['canvas', 'Canvas']].map(([v, l]) => `<button type="button" data-target="${v}" aria-pressed="${prefs.alignTo === v}">${l}</button>`).join('')}</span></div>`
        : '<div class="sub-head" style="margin-top:.45rem;padding-top:.45rem">Align to canvas</div>';
    const distribute = multi && items.length > 2 ? `<div class="grid2" style="margin-top:.4rem"><button type="button" data-distribute="h">${ICON.distH} Distribute H</button><button type="button" data-distribute="v">${ICON.distV} Distribute V</button></div>` : '';
    return `${target}<div class="align-grid">${buttons.map(([m, i, t]) => `<button type="button" data-align="${m}" title="${t}" aria-label="${t}">${i}</button>`).join('')}</div>${distribute}`;
}

export function alignSection(items) {
    return F.section('arrange', 'Align', alignBody(items));
}

export const gradOf = (s, key) => ({ from: '#1f6feb', to: '#8957e5', angle: 135, type: 'linear', position: 'center', speed: 8, ...(s[key] || {}) });
export const fillSeg = (s, key, label) => F.seg(`style.${key}.enabled`, label, s[key]?.enabled ? 'true' : 'false', [['false', 'Solid color', 'Solid'], ['true', 'Gradient', 'Gradient']]);

export function gradientFields(s, key = 'gradient') {
    const g = gradOf(s, key), at = name => `style.${key}.${name}`;
    return `<div class="grid2">${F.select(at('type'), 'Type', g.type, [['linear', 'Linear'], ['radial', 'Radial']])}${g.type === 'radial' ? F.select(at('position'), 'Center', g.position, [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]) : F.number(at('angle'), 'Angle (°)', g.angle, { min: 0, max: 360 })}</div>
        <div class="grid2">${F.color(at('from'), 'From', g.from)}${F.color(at('to'), 'To', g.to)}</div>
        ${F.color(at('mid'), 'Middle (optional)', g.mid || '', { clear: true })}
        ${F.check(at('animate'), 'Animate', g.animate)}
        ${g.animate ? F.number(at('speed'), 'Speed (sec per sweep)', g.speed, { min: 1, max: 120 }) : ''}`;
}

export const fillControl = (s, key, label, solidField) => fillSeg(s, key, label) + (s[key]?.enabled ? gradientFields(s, key) : solidField);
export const hasBox = s => s.borderWidth > 0 || (s.background && s.background !== 'transparent') || s.gradient?.enabled;
export const paddingField = el => TEXT_TYPES.has(el.type) && hasBox(el.style) ? F.number('style.padding', 'Padding (px)', el.style.padding || 0, { min: 0, max: 200 }) : '';
export const noRadius = (s, shape) => shape && ['circle', 'pill', 'line'].includes(s.shape);

export function textEffectsSection(el) {
    const s = el.style || {};
    return F.section('textEffects', 'Text effects', `
        <div class="grid2">${F.select('style.textTransform', 'Case', s.textTransform || 'none', [['none', 'As typed'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalize Words']])}${F.select('style.textDecoration', 'Decoration', s.textDecoration || 'none', [['none', 'None'], ['underline', 'Underline'], ['line-through', 'Strikethrough']])}</div>
        <div class="grid2">${F.number('style.textStroke.width', 'Outline (px)', s.textStroke?.width || 0, { min: 0, max: 20, step: 0.5 })}${s.textStroke?.width > 0 ? F.color('style.textStroke.color', 'Outline color', s.textStroke?.color || '#000000') : '<span></span>'}</div>
        ${(s.textGradient?.enabled && (s.gradient?.enabled || (s.background && s.background !== 'transparent'))) ? '<p class="hint">Text shadow is off while the text is a gradient on a filled box (the shadow would hit the box).</p>' : `<div class="grid2">${F.number('style.textShadow.blur', 'Text shadow (px)', s.textShadow?.blur || 0, { min: 0, max: 60 })}${s.textShadow?.blur > 0 ? F.color('style.textShadow.color', 'Shadow color', s.textShadow?.color || 'rgba(0,0,0,0.7)') : '<span></span>'}</div>`}`, false);
}

export function iconEffectsSection(el) {
    const s = el.style || {};
    return F.section('iconEffects', 'Icon effects', `
        <div class="grid2">${F.number('style.textStroke.width', 'Outline (px)', s.textStroke?.width || 0, { min: 0, max: 20, step: 0.5 })}${s.textStroke?.width > 0 ? F.color('style.textStroke.color', 'Outline color', s.textStroke?.color || '#000000') : '<span></span>'}</div>
        <div class="grid2">${F.number('style.textShadow.blur', 'Shadow / glow (px)', s.textShadow?.blur || 0, { min: 0, max: 60 })}${s.textShadow?.blur > 0 ? F.color('style.textShadow.color', 'Shadow color', s.textShadow?.color || 'rgba(0,0,0,0.7)') : '<span></span>'}</div>`, false);
}

export function typographySection(el) {
    const s = el.style || {};
    const alert = el.type === 'alert';
    const fontExtras = `<details class="sub-details"><summary>Custom font &amp; upload</summary>
        ${F.text('style.fontFamily', 'Custom / system font', s.fontFamily, 'placeholder="e.g. Comic Sans MS, Menlo" maxlength="120" list="system-font-list"')}
        <div class="field"><span>Upload font</span><span class="upload-row"><input id="font-upload" type="file" accept=".ttf,.otf,.woff,.woff2"><span></span></span><span class="hint">Uploaded fonts work in every browser, including Safari, and in OBS on any machine.</span></div></details>
        <datalist id="system-font-list">${SYSTEM_FONTS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</datalist>`;
    const weight = F.select('style.fontWeight', 'Weight', s.fontWeight, [['400', 'Normal'], ['600', 'Semi-bold'], ['700', 'Bold'], ['900', 'Black']]);
    const textAlign = s.textAlign || (alert ? 'center' : 'left');
    const verticalAlign = s.verticalAlign || (alert ? 'middle' : 'top');
    return F.section('typography', alert ? 'Message text' : 'Typography', `
        <label class="field"><span>Font</span><select id="font-picker" data-path="style.fontFamily" data-kind="text">${fontOptions(s.fontFamily)}</select></label>
        ${alert ? `<div class="grid2">${weight}${F.color('style.color', 'Text color', s.color)}</div>` : `<div class="grid2">${el.textFit === 'fit' && TEXT_TYPES.has(el.type) ? '' : F.number('style.fontSize', el.textFit === 'shrink' && TEXT_TYPES.has(el.type) ? 'Max size (px)' : 'Size (px)', s.fontSize, { min: 8, max: 400 })}${weight}</div>${TEXT_TYPES.has(el.type) && !(el.type === 'random-text' && el.random?.marquee) ? F.select('textFit', 'Auto-fit text', el.textFit || 'none', [['none', 'Off — use the size set here'], ['shrink', 'Shrink to fit the box'], ['fit', 'Grow or shrink to fill the box']]) : ''}${el.type === 'markdown' ? F.number('headingScale', 'Heading size (% of normal)', el.headingScale ?? 100, { min: 40, max: 200, step: 5 }) + F.select('columns', 'Columns', String(el.columns || 1), [['1', '1 column'], ['2', '2 columns'], ['3', '3 columns'], ['4', '4 columns']]) + ((el.columns || 1) > 1 ? F.select('headingSpan', 'Headings spanning all columns', String(el.headingSpan ?? 6), [['6', 'All headings (H1–H6)'], ['1', 'H1 only'], ['2', 'H1–H2'], ['3', 'H1–H3'], ['4', 'H1–H4'], ['0', 'None — headings stay in a column']]) : '') : ''}${FILL_TEXT_TYPES.has(el.type) ? fillControl(s, 'textGradient', 'Text color', F.color('style.color', 'Color', s.color)) : F.color('style.color', 'Text color', s.color)}`}
        <div class="grid2">${F.seg('style.textAlign', 'Horizontal', textAlign, [['left', 'Align text left', ICON.textLeft], ['center', 'Center text', ICON.textCenter], ['right', 'Align text right', ICON.textRight]])}${el.type === 'markdown' && el.columns > 1 ? '' : F.seg('style.verticalAlign', 'Vertical', verticalAlign, [['top', 'Align to top', ICON.vTop], ['middle', 'Center vertically', ICON.vMiddle], ['bottom', 'Align to bottom', ICON.vBottom]])}</div>
        <div class="grid2">${F.number('style.lineHeight', 'Line height', s.lineHeight, { min: 0.5, max: 3, step: 0.1 })}${F.number('style.letterSpacing', 'Letter spacing', s.letterSpacing, { min: -10, max: 50, step: 0.5 })}</div>
        ${fontExtras}`)
        + (FILL_TEXT_TYPES.has(el.type) || alert ? textEffectsSection(el) : '');
}

export function focusField(el) {
    if ((el.style.objectFit || 'cover') !== 'cover' || !el.src || /\{\{/.test(el.src)) return '';
    const x = el.style.focusX ?? 50, y = el.style.focusY ?? 50;
    const thumb = el.type === 'image' ? `<img src="${esc(el.src)}" draggable="false">` : `<video src="${esc(el.src)}" muted preload="metadata"></video>`;
    return `<div class="field focus-field"><span>Focus point</span><div class="focus-pick" data-focus-pick>${thumb}<i class="focus-dot" style="left:${x}%;top:${y}%"></i></div><small class="hint">Drag to choose which part stays in view when cropped.</small></div>`;
}

export const boxEffectsRelevant = (el, multi) => multi || !TEXT_TYPES.has(el.type) || hasBox(el.style) || el.style?.blur > 0 || el.style?.shadow?.blur > 0;

export function boxEffectFields(el, multi) {
    const s = el.style || {};
    if (!boxEffectsRelevant(el, multi)) return '<p class="hint">Backdrop blur and box shadow appear once this text has a background, gradient or border. For a shadow on the letters, use Text effects.</p>';
    return `<div class="grid2">${F.number('style.blur', 'Backdrop blur (px)', s.blur || 0, { min: 0, max: 60 })}${F.number('style.shadow.blur', 'Box shadow (px)', s.shadow?.blur || 0, { min: 0, max: 100 })}</div>
        ${s.shadow?.blur > 0 ? F.color('style.shadow.color', 'Box shadow color', s.shadow?.color || 'rgba(0,0,0,0.5)') : ''}
        <p class="hint">Backdrop blur frosts whatever is behind this box inside the overlay. Box shadow is drawn around the box edge, not the letters.</p>`;
}

export function appearanceBody(el, multi) {
    const s = el.style || {}, shape = el.type === 'shape';
    return `
        ${fillControl(s, 'gradient', shape ? 'Fill' : 'Background', F.color('style.background', 'Color', s.background, { clear: true }))}
        <div class="grid2">${F.number('style.borderWidth', shape && s.shape === 'line' ? 'Thickness' : 'Border width', s.borderWidth, { min: 0, max: 40 })}${noRadius(s, shape) ? '<span></span>' : F.number('style.borderRadius', 'Corner radius', s.borderRadius, { min: 0, max: 200 })}</div>
        ${(shape && s.shape === 'line') || !(s.borderWidth > 0) ? '' : fillControl(s, 'borderGradient', 'Border color', F.color('style.borderColor', 'Color', s.borderColor, { clear: true }))}
        ${paddingField(el)}
        ${boxEffectFields(el, multi)}
        ${F.range('style.opacity', 'Opacity', s.opacity ?? 1, { min: 0, max: 100, scale: 0.01, unit: '%' })}
        ${!multi && shape ? F.select('style.shape', 'Shape', s.shape, [['rectangle', 'Rectangle'], ['circle', 'Circle'], ['pill', 'Pill'], ['line', 'Line']]) : ''}
        ${!multi && (el.type === 'image' || el.type === 'video') ? F.select('style.objectFit', 'Fit', s.objectFit, [['cover', 'Fill (crop to fit)'], ['contain', 'Contain (letterbox)']]) + focusField(el) : ''}`;
}

export function appearanceSection(el, multi) {
    return F.section('appearance', multi ? 'Appearance (all selected)' : 'Appearance', appearanceBody(el, multi));
}

export function fillSection(el) {
    const s = el.style || {}, shape = el.type === 'shape';
    return F.section('fill', shape ? 'Fill & outline' : 'Background & border', `
        ${!shape && (el.type === 'image' || el.type === 'video') ? F.select('style.objectFit', 'Fit', s.objectFit, [['cover', 'Fill (crop to fit)'], ['contain', 'Contain (letterbox)']]) + focusField(el) : ''}
        ${shape ? F.select('style.shape', 'Shape', s.shape, [['rectangle', 'Rectangle'], ['circle', 'Circle'], ['pill', 'Pill'], ['line', 'Line']]) : ''}
        ${fillControl(s, 'gradient', shape ? 'Fill' : 'Background', F.color('style.background', 'Color', s.background, { clear: true }))}
        <div class="grid2">${F.number('style.borderWidth', shape && s.shape === 'line' ? 'Thickness' : 'Border width', s.borderWidth, { min: 0, max: 40 })}${noRadius(s, shape) ? '<span></span>' : F.number('style.borderRadius', 'Corner radius', s.borderRadius, { min: 0, max: 200 })}</div>
        ${(shape && s.shape === 'line') || !(s.borderWidth > 0) ? '' : fillControl(s, 'borderGradient', 'Border color', F.color('style.borderColor', 'Color', s.borderColor, { clear: true }))}
        ${paddingField(el)}`);
}

export function effectsSection(el) {
    const s = el.style || {};
    return F.section('effects', 'Effects', `
        ${F.range('style.opacity', 'Opacity', s.opacity ?? 1, { min: 0, max: 100, scale: 0.01, unit: '%' })}
        ${boxEffectFields(el, false)}`, false);
}

export const localMediaPath = src => src && src.startsWith(LOCAL_MEDIA) ? decodeURIComponent(src.slice(LOCAL_MEDIA.length)) : '';
export const currentMediaTab = el => state.mediaTab.get(el.id) || (el.src?.startsWith(LOCAL_MEDIA) ? 'file' : !el.src || el.src.startsWith('/custom-overlay-assets/') ? 'library' : 'url');
export const tabBar = (label, attr, current, options) => `<div class="field"><span>${label}</span><span class="seg">${options.map(([v, l]) => `<button type="button" ${attr}="${v}" aria-pressed="${v === current}">${l}</button>`).join('')}</span></div>`;
export const friendlyAssetName = url => url ? decodeURIComponent(url.split('/').pop()).replace(/^[a-z0-9]{6,}-/, '') : '';

export function mediaSourceBlock(el) {
    const tab = currentMediaTab(el);
    let body = tabBar('Source', 'data-media-tab', tab, [['library', 'Library & upload'], ['file', 'File on computer'], ['url', 'Web URL']]);
    if (tab === 'file') {
        body += `<div class="field"><span>File path</span><span class="upload-row"><input id="media-path" value="${esc(localMediaPath(el.src))}" placeholder="/Users/you/Pictures/logo.png" spellcheck="false"><button type="button" id="media-browse">Browse…</button></span><span class="hint">Uses the ${el.type} in place, with nothing uploaded. If you move or delete it, the overlay shows nothing.</span></div>`;
        if (el.type === 'image' && el.src) body += `<img class="asset-preview" src="${esc(el.src)}" alt="Preview" onerror="this.style.display='none'">`;
    } else if (tab === 'url') {
        body += F.text('src', 'Image or video URL', el.src, 'placeholder="https://… or {{game.cover}}"');
        const yt = shared.parseYouTubeUrl ? shared.parseYouTubeUrl(el.src) : null;
        if (yt) {
            body += `<div class="hint" style="color:var(--accent);display:flex;align-items:center;gap:6px;margin:4px 0 8px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> YouTube video detected (plays via responsive embed player)</div>`;
        }
        body += `<div class="field"><span>Placeholders</span><button type="button" id="open-variables">Insert placeholder…</button><span class="hint">Use e.g. {{game.cover}} to show the current game's cover art.</span></div>`;
    } else {
        const accept = el.type === 'image' ? 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml' : 'video/mp4,video/webm,video/ogg';
        body += `<div class="field"><span>${el.type === 'video' ? 'Video' : 'Image'} file</span><span class="upload-row"><input readonly value="${esc(friendlyAssetName(el.src))}" placeholder="Nothing chosen"><button type="button" id="open-assets">Library…</button></span></div>`;
        body += `<div class="field"><span>Upload new</span><input id="prop-upload" type="file" accept="${accept}"><span class="hint">Saved to the StreamPulse overlay asset folder (100 MB max). You can also drop files onto the canvas.</span></div>`;
    }
    if (el.type === 'video') {
        const v = el.video || {};
        const hasSound = v.sound === true || v.muted === false;
        body += `<div class="grid2">${F.check('video.loop', 'Loop playback', v.loop !== false)}${F.check('video.sound', 'Enable sound in overlay', hasSound)}</div>`;
        if (hasSound) {
            body += F.number('video.volume', 'Video volume (%)', v.volume ?? 100, { min: 0, max: 100, step: 5 });
        }
    }
    return body;
}

export function sourceStatusText(el) {
    const src = el.source || {};
    if (src.mode === 'inline' || !src.path) return '';
    const stateVal = shared.textSourceState ? shared.textSourceState(el) : null;
    if (!stateVal) return 'Reading file…';
    if (stateVal.error) return `⚠ ${stateVal.error}. The fallback text is shown instead.`;
    const count = el.type === 'random-text' ? `${shared.elementItems ? shared.elementItems(el).length : 0} entries` : `${stateVal.text.length.toLocaleString()} characters`;
    return `✓ ${stateVal.name || 'File'} loaded (${count}). Changes you save in the file appear automatically.`;
}

export function updateSourceStatus() {
    const node = $('source-status'), el = primary();
    if (node && el) node.textContent = sourceStatusText(el);
}

export function textSourceBlock(el) {
    const src = el.source || { mode: 'inline', path: '', split: 'lines' };
    const typed = `<label class="field"><span>${el.type === 'random-text' ? 'Fallback text' : el.type === 'markdown' ? 'Markdown' : 'Text'}</span><textarea id="prop-content" data-path="content" data-kind="text" spellcheck="true">${esc(el.content)}</textarea></label>`;
    let body = tabBar('Source', 'data-source-mode', src.mode, [['inline', 'Typed'], ['library', 'Library'], ['file', 'File on computer']]);
    if (src.mode === 'inline') {
        body += typed;
        if (el.type === 'random-text') body += `<label class="field"><span>Phrase pool</span><textarea id="prop-items" data-path="items" data-kind="lines" style="min-height:120px">${esc((el.items || []).join('\n'))}</textarea><span class="hint">One phrase per line. Placeholders work here too.</span></label>`;
        body += `<div class="field"><span>Placeholders</span><button type="button" id="open-variables">Insert placeholder…</button></div>`;
    } else {
        if (src.mode === 'library') {
            body += `<div class="field"><span>Library file</span><span class="upload-row"><input readonly value="${esc(friendlyAssetName(src.path))}" placeholder="No file chosen"><button type="button" id="source-library">Choose…</button></span></div>`;
            body += `<div class="field"><span>Upload new</span><input id="source-upload" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown"><span class="hint">Copies the file into StreamPulse. Re-upload it after you edit it.</span></div>`;
        } else {
            body += `<div class="field"><span>File path</span><span class="upload-row"><input data-path="source.path" data-kind="text" value="${esc(src.path)}" placeholder="/Users/you/Notes/intro.md" spellcheck="false"><button type="button" id="source-browse">Browse…</button></span><span class="hint">Reads the file in place (.txt or .md). Nothing is uploaded and edits show up automatically.</span></div>`;
        }
        if (el.type === 'random-text') body += F.select('source.split', 'Each entry is', src.split || 'lines', [['lines', 'One line'], ['blocks', 'A paragraph (separated by blank lines)']]);
        body += `<div class="hint" id="source-status">${esc(sourceStatusText(el))}</div>`;
        body += `<details class="sub-details"><summary>Fallback text</summary>${typed}</details>`;
    }
    return body;
}

export function contentSection(el) {
    const textual = TEXT_TYPES.has(el.type);
    const media = el.type === 'image' || el.type === 'video';
    let body = '';
    if (textual) body += textSourceBlock(el);
    if (el.type === 'progress') {
        body += `<label class="field"><span>Value (percent, 0–100)</span><textarea id="prop-content" data-path="content" data-kind="text" rows="2" style="min-height:0">${esc(el.content)}</textarea><span class="hint">Use a number or a placeholder such as {{timer.&lt;id&gt;.percent}} or {{goal.&lt;id&gt;.percent}}.</span></label>`;
        body += `<div class="field"><span>Placeholders</span><button type="button" id="open-variables">Insert placeholder…</button></div>`;
    }
    if (el.type === 'icon') {
        body += F.text('content', 'Font Awesome icon', el.content, 'placeholder="fa-brands fa-twitch" spellcheck="false"');
        body += `<div class="field"><span>Icon</span><button type="button" id="pick-icon">Choose icon…</button></div>`;
        body += F.color('style.color', 'Icon color', el.style.color);
        body += `<div class="grid2">${F.seg('style.textAlign', 'Horizontal', el.style.textAlign, [['left', 'Align left', ICON.textLeft], ['center', 'Center horizontally', ICON.textCenter], ['right', 'Align right', ICON.textRight]])}${F.seg('style.verticalAlign', 'Vertical', el.style.verticalAlign, [['top', 'Align to top', ICON.vTop], ['middle', 'Center vertically', ICON.vMiddle], ['bottom', 'Align to bottom', ICON.vBottom]])}</div>`;
        body += `<div class="field"><span>Box</span><button type="button" id="fit-icon">Fit box to icon</button></div>`;
        body += '<span class="hint">The icon is as tall as its box. Change the height to resize it; the width only adds space for alignment.</span>';
    }
    if (el.type === 'qr') {
        const q = el.qr || {};
        body += F.text('src', 'Link or text', el.src, 'placeholder="https://twitch.tv/yourchannel"');
        body += `<div class="field"><span>Placeholders</span><button type="button" id="open-variables">Insert placeholder…</button></div>`;
        body += `<div class="grid2">${F.color('qr.fg', 'Code color', q.fg || '#000000')}${F.color('qr.bg', 'Background', q.bg || '#ffffff', { clear: true })}</div>`;
        body += `<div class="grid2">${F.number('qr.margin', 'Quiet zone (modules)', q.margin ?? 2, { min: 0, max: 8 })}${F.select('qr.ecc', 'Error correction', q.ecc || 'M', [['L', 'Low (smaller code)'], ['M', 'Medium'], ['Q', 'Quartile'], ['H', 'High (more robust)']])}</div>`;
        body += '<span class="hint">Keep strong contrast and a quiet zone so phones can scan it. Dark code on a light background scans best.</span>';
    }
    if (el.type === 'embed') {
        body += F.text('src', 'Webpage or YouTube URL', el.src, 'placeholder="https://youtube.com/watch?v=... or https://example.com"');
        const isYt = shared.parseYouTubeUrl ? shared.parseYouTubeUrl(el.src) : null;
        if (isYt) {
            body += `<div class="hint" style="color:var(--accent);display:flex;align-items:center;gap:6px;margin:4px 0 8px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> YouTube video detected (privacy-enhanced looping embed)</div>`;
        }
        body += `<div class="field"><span>Placeholders</span><button type="button" id="open-variables">Insert placeholder…</button></div>`;
    }
    if (el.type === 'cutout') {
        const c = el.cutout || {};
        const rectIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>Rectangle';
        const circleIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="8"/></svg>Circle';
        const pillIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><rect x="3" y="7" width="18" height="10" rx="5"/></svg>Pill';
        body += F.seg('cutout.shape', 'Punchthrough shape', c.shape || 'rectangle', [
            ['rectangle', 'Rectangle', rectIcon],
            ['circle', 'Circle / Oval', circleIcon],
            ['pill', 'Pill / Stadium', pillIcon]
        ]);
        if ((c.shape || 'rectangle') === 'rectangle') {
            body += F.range('style.borderRadius', 'Corner radius', el.style?.borderRadius || 0, { min: 0, max: 200, unit: 'px', editable: true });
        }
        body += F.range('cutout.feather', 'Edge softness (feather)', c.feather || 0, { min: 0, max: 50, unit: 'px', editable: true });
        body += `<div class="grid2">${F.number('style.borderWidth', 'Border width', el.style?.borderWidth || 0, { min: 0, max: 40 })}${F.color('style.borderColor', 'Border color', el.style?.borderColor || '#ffffff')}</div>`;
        body += `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn" style="padding:4px 8px;font-size:11px;" data-cutout-aspect="16-9">16:9 Cam / Game</button>
            <button type="button" class="btn" style="padding:4px 8px;font-size:11px;" data-cutout-aspect="4-3">4:3 Cam</button>
            <button type="button" class="btn" style="padding:4px 8px;font-size:11px;" data-cutout-aspect="1-1">1:1 Square</button>
            <button type="button" class="btn" style="padding:4px 8px;font-size:11px;" data-cutout-aspect="9-16">9:16 Vertical</button>
        </div>`;
        body += `<div class="hint" style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(56, 189, 248, 0.08);border:1px solid rgba(56, 189, 248, 0.2);color:var(--text);font-size:11px;line-height:1.4;"><strong style="color:var(--accent);">OBS Alpha Punchthrough:</strong> Place this overlay above your webcam or gameplay in OBS. This element cuts a 100% transparent hole through all background graphics and cards beneath it.</div>`;
    }
    if (media) body += mediaSourceBlock(el);
    return body ? F.section('content', 'Content', body) : '';
}

export function layoutSection(el) {
    const line = isLine(el);
    const locked = !!el.aspectLock;
    return F.section('layout', 'Position & size', `
        <div class="grid2">${F.number('x', 'X', el.x, { min: -7680, max: 7680 })}${F.number('y', 'Y', el.y, { min: -4320, max: 4320 })}</div>
        <div class="grid2">${F.number('width', 'Width', el.width, { min: LIMITS.elementW[0], max: LIMITS.elementW[1] })}${line ? '<span></span>' : F.number('height', 'Height', el.height, { min: LIMITS.elementH[0], max: LIMITS.elementH[1] })}</div>
        ${line ? '' : `<div style="display:flex;justify-content:flex-end;margin:-.2rem 0 .45rem"><button type="button" id="toggle-aspect-lock" class="link-btn" style="font-size:11px;color:${locked ? 'var(--accent)' : 'var(--muted)'};display:inline-flex;align-items:center;gap:4px" title="${locked ? 'Unlock aspect ratio' : 'Lock aspect ratio when editing width/height'}">${locked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Proportions locked' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg> Proportions unlocked'}</button></div>`}
        ${F.range('style.rotate', 'Rotation (°)', el.style?.rotate || 0, { min: -180, max: 180, step: 1, unit: '°', editable: true, reset: 0, resetTitle: 'Reset rotation to 0°' })}
        ${alignBody([el])}`);
}

export const SMART_PERIOD_PRESETS = [
    ['@today', 'Tonight / Today (status or date is today)'],
    ['@tomorrow', 'Next Stream / Tomorrow'],
    ['@this-week', 'This Week (current week dates)'],
    ['@upcoming', 'Upcoming Dates (future scheduled)'],
    ['@unscheduled', 'No Period Set (undated)']
];

export function periodPicker(g) {
    const known = state.liveStatus.gamePlan?.periods || [];
    const picked = (g.periods?.length ? g.periods : g.period ? [g.period] : []);
    const smartTokens = new Set(['@today', '@tomorrow', '@this-week', '@upcoming', '@unscheduled']);
    const customNames = [...known, ...picked.filter(name => !known.includes(name) && !smartTokens.has(name))];

    let html = `<div class="field"><span>Periods to show (none ticked = all, in plan order)</span>
        <input type="hidden" data-path="gameList.periods" data-kind="lines" value="${esc(picked.join('\n'))}">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 2px;">Smart Date-Aware Presets</div>
        ${SMART_PERIOD_PRESETS.map(([val, label]) => `<label class="check"><input type="checkbox" data-period-pick value="${esc(val)}" ${picked.includes(val) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}`;

    if (customNames.length) {
        html += `<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 2px;">Game Plan Periods</div>
        ${customNames.map(name => `<label class="check"><input type="checkbox" data-period-pick value="${esc(name)}" ${picked.includes(name) ? 'checked' : ''}> ${esc(name)}</label>`).join('')}`;
    }
    html += `</div>`;
    return html;
}

export let assetTagNames = [];
export let libraryAssets = [];

export async function loadAssetTags() {
    try {
        const list = await (await fetch('/api/custom-overlays/assets', { cache: 'no-store' })).json();
        libraryAssets = list;
        assetTagNames = [...new Set(list.flatMap(asset => asset.tags || []))].sort((a, b) => a.localeCompare(b));
    } catch { /* server offline */ }
}

export function filterSection(el) {
    const defaultFilter = shared.defaultMediaFilter ? shared.defaultMediaFilter() : {};
    const f = { ...defaultFilter, ...(el.mediaFilter || {}) };
    const tint = f.tint || {};
    const duo = { ...(defaultFilter.duotone || {}), ...(f.duotone || {}) };
    const grain = { ...(defaultFilter.grain || {}), ...(f.grain || {}) };
    const presets = shared.MEDIA_FILTER_PRESETS || [];
    const media = ['image', 'video', 'slideshow'].includes(el.type);
    const body = `
        <label class="field"><span>Preset</span><select data-fx-preset><option value="">Choose a preset…</option>${presets.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>
        ${F.range('mediaFilter.blur', 'Blur', f.blur, { min: 0, max: 60, unit: 'px' })}
        ${F.range('mediaFilter.brightness', 'Brightness', f.brightness, { min: 0, max: 200, unit: '%' })}
        ${F.range('mediaFilter.contrast', 'Contrast', f.contrast, { min: 0, max: 200, unit: '%' })}
        ${F.range('mediaFilter.saturate', 'Saturation', f.saturate, { min: 0, max: 300, unit: '%' })}
        ${F.range('mediaFilter.grayscale', 'Grayscale', f.grayscale, { min: 0, max: 100, unit: '%' })}
        ${F.check('mediaFilter.duotone.enabled', 'Duotone', duo.enabled)}
        ${duo.enabled ? `<div class="grid2">${F.color('mediaFilter.duotone.dark', 'Shadows', duo.dark)}${F.color('mediaFilter.duotone.light', 'Highlights', duo.light)}</div>` : ''}
        ${duo.enabled ? F.select('mediaFilter.duotone.animate', 'Duotone animation', duo.animate, [['none', 'Still'], ['blend', 'Blend to second colors'], ['hue', 'Hue cycle'], ['both', 'Blend and hue cycle']]) + (duo.animate !== 'none' ? '<p class="hint">Animates in the live overlay. Use the Effects toggle in the toolbar to pause it while editing.</p>' : '') : ''}
        ${duo.enabled && (duo.animate === 'blend' || duo.animate === 'both') ? `<div class="grid2">${F.color('mediaFilter.duotone.dark2', 'Shadows 2', duo.dark2)}${F.color('mediaFilter.duotone.light2', 'Highlights 2', duo.light2)}</div>` : ''}
        ${duo.enabled && duo.animate !== 'none' ? F.range('mediaFilter.duotone.speed', 'Cycle length', duo.speed, { min: 1, max: 60, unit: 's' }) : ''}
        ${media ? F.check('mediaFilter.tint.enabled', 'Color tint', tint.enabled) : ''}
        ${media && tint.enabled ? `${F.color('mediaFilter.tint.color', 'Tint color', tint.color)}${F.range('mediaFilter.tint.opacity', 'Tint strength', tint.opacity, { min: 0, max: 100, scale: 0.01, unit: '%' })}` : ''}
        ${F.check('mediaFilter.grain.enabled', 'Film grain', grain.enabled)}
        ${grain.enabled ? `${F.range('mediaFilter.grain.amount', 'Grain strength', grain.amount, { min: 0, max: 100, scale: 0.01, unit: '%' })}${F.range('mediaFilter.grain.size', 'Grain size', grain.size, { min: 50, max: 400, scale: 0.01, unit: '%' })}${F.check('mediaFilter.grain.animate', 'Animate grain', grain.animate)}<p class="hint">Grain sits over the element. Keep strength low (10-30%) for a film look.</p>` : ''}
        ${f.blur > 20 && el.type === 'video' ? '<p class="hint">Heavy blur on video can be slow in the editor.</p>' : ''}`;
    return F.section('media-filter', 'Filters', body, false);
}

export function slideshowSection(el) {
    const c = el.slideshow || {};
    const manual = c.source === 'manual';
    const picked = c.tags || [];
    const what = F.section('slide-what', 'Slideshow: images', `
        ${F.seg('slideshow.source', 'Choose images', c.source || 'tags', [['tags', 'Choose by tag (live)', 'By tag'], ['manual', 'Pick images manually', 'Manual']])}
        ${manual ? `<button type="button" id="slide-pick" class="primary">Choose images…</button>
            <p class="hint">${(c.files || []).length} selected. ${(c.files || []).length ? '<a href="#" id="slide-clear" style="color:var(--accent)">Clear</a>' : ''}</p>`
        : `<div class="field"><span>Tags</span>
            <div class="tag-chips" style="margin:0 0 .4rem">${picked.length ? picked.map(tag => `<button type="button" data-slide-untag="${esc(tag)}" aria-pressed="true" title="Remove tag">${esc(tag)} ×</button>`).join('') : '<span class="hint">None chosen yet.</span>'}</div>
            <input id="slide-tag-q" type="search" placeholder="Search ${assetTagNames.length} tags to add…" aria-label="Search tags">
            <div id="slide-tag-sugg" class="tag-chips"></div></div>
            ${picked.length > 1 ? F.select('slideshow.tagMode', 'Match', c.tagMode || 'any', [['any', 'Any of the tags'], ['all', 'All of the tags']]) : ''}
            <p class="hint">Live: adding or removing a tag on an asset updates the slideshow within about 20 seconds.</p>`}
        <p class="hint" id="slide-count"></p>
        ${F.select('slideshow.kinds', 'Include', c.kinds || 'image', [['image', 'Images'], ['video', 'Videos'], ['both', 'Images and videos']])}
        ${c.kinds === 'image' || !c.kinds ? '' : '<p class="hint">Videos play to the end before the next slide.</p>'}`);
    const play = F.section('slide-play', 'Slideshow: playback', `
        ${F.select('slideshow.advance', 'Advance', c.advance || 'auto', [['auto', 'Automatically'], ['manual', 'Manually (next / previous controls)']])}
        ${c.advance === 'manual' ? '<p class="hint">Starts on the first slide and only changes when you use the controls below, or the API.</p>' : ''}
        ${c.advance === 'manual' || c.kinds === 'video' ? '' : F.number('slideshow.seconds', 'Seconds per image', c.seconds ?? 5, { min: 1, max: 3600, step: 0.5 })}
        ${F.select('slideshow.order', 'Order', c.order || 'sequential', [['sequential', 'Newest first, in order'], ['shuffle', 'Shuffle (no repeats until all shown)'], ['random', 'Random each time']])}
        ${F.select('slideshow.fit', 'Fit', c.fit || 'cover', [['cover', 'Fill (crop to fit)'], ['contain', 'Contain (whole image)']])}
        ${F.select('slideshow.transition', 'Transition', c.transition || 'fade', [['fade', 'Fade'], ['slide', 'Slide'], ['none', 'None']])}
        ${c.transition === 'none' ? '' : F.number('slideshow.transitionMs', 'Transition time (ms)', c.transitionMs ?? 800, { min: 0, max: 5000, step: 50 })}
        ${c.transition === 'slide' ? F.select('slideshow.direction', 'Slide direction', c.direction || 'left', [['left', 'From the right (moves left)'], ['right', 'From the left (moves right)'], ['up', 'From the bottom (moves up)'], ['down', 'From the top (moves down)']]) : ''}
        ${F.check('slideshow.kenBurns', 'Slow zoom (Ken Burns)', c.kenBurns === true)}
        ${F.select('slideshow.caption', 'Caption', c.caption === true ? 'name' : (c.caption || 'off'), [['off', 'None'], ['caption', 'Asset caption (set in Asset Library)'], ['name', 'File name']])}`);
    const remote = F.section('slide-remote', 'Slideshow: live controls', `
        <div class="seg-row" style="display:flex;gap:.4rem">
            <button type="button" data-slide-ctl="prev">Previous</button>
            <button type="button" data-slide-ctl="toggle">Pause / play</button>
            <button type="button" data-slide-ctl="next">Next</button>
        </div>
        <div style="display:flex;gap:.6rem;align-items:center;margin-top:.5rem"><button type="button" data-slide-popout>Pop out controls</button><span class="hint" id="slide-ctl-status"></span></div>
        <p class="hint">Drives the preview here and the saved overlay while it is running (OBS or the Open Runtime page). Also available as <code>POST /api/custom-overlays/${esc(state.overlay.id)}/slideshow</code> with <code>{"action":"next"}</code> (next, prev, pause, play, toggle), so a Stream Deck or hotkey tool can drive it.</p>`, false);
    return what + play + remote;
}

export async function refreshSlideCount() {
    const out = document.getElementById('slide-count'), el = primary();
    if (!out || !el || el.type !== 'slideshow' || !shared.slideshowItems) return;
    const c = el.slideshow || {};
    const items = await shared.slideshowItems(c);
    const target = document.getElementById('slide-count');
    if (target) target.textContent = (c.source === 'manual' || (c.tags || []).length) ? `${items.length} ${items.length === 1 ? 'item matches' : 'items match'} right now.` : 'Pick at least one tag.';
}

export function renderTagSuggestions() {
    const box = document.getElementById('slide-tag-sugg'), el = primary();
    if (!box || !el) return;
    const input = document.getElementById('slide-tag-q');
    const q = input ? input.value.trim().toLowerCase() : '';
    const picked = new Set((el.slideshow?.tags || []).map(tag => tag.toLowerCase()));
    const countsFn = window.TagChips?.counts ? window.TagChips.counts : () => [];
    const list = countsFn(libraryAssets).filter(([tag]) => !picked.has(tag.toLowerCase()) && (!q || tag.toLowerCase().includes(q)));
    const shown = list.slice(0, q ? 30 : 10);
    box.innerHTML = shown.map(([tag, n]) => `<button type="button" data-slide-addtag="${esc(tag)}">+ ${esc(tag)} (${n})</button>`).join('')
        + (list.length > shown.length ? `<span class="hint">+${list.length - shown.length} more. Type to search.</span>` : '')
        + (!list.length && q ? '<span class="hint">No tag matches.</span>' : '');
}

export function changeSlideTags(update) {
    selectedElements().forEach(el => { el.slideshow = { ...el.slideshow, tags: update(el.slideshow?.tags || []) }; });
    renderCanvas();
    renderProperties();
    changed(false);
    document.getElementById('slide-tag-q')?.focus();
}

export function gameListSection(el) {
    const g = el.gameList || {};
    const layout = g.layout || 'grid';
    const compact = ['grid', 'strip', 'tiers', 'ticker'].includes(layout);
    const covers = g.showCovers !== false;
    const titles = g.showTitles !== false;
    const what = F.section('gamelist', 'Game list: what to show', `
        ${F.select('gameList.filter', 'Show', g.filter || 'scheduled', [['tonight', "Tonight's lineup"], ['scheduled', 'Scheduled games (including Tonight)'], ['scheduled-only', 'Scheduled only (excluding Tonight)'], ['up-next', 'Up Next / Horizon'], ['backlog', 'Backlog'], ['played', 'Played'], ...(state.liveStatus.gamePlan?.lists || []).map(list => [list.id, `List: ${list.name}`]), ['all', 'Everything']])}
        ${periodPicker(g)}
        ${F.text('gameList.when', 'Played in (blank = any time)', g.when || '', 'placeholder="thisYear, lastMonth, 2026, 2026-10" maxlength="9" list="game-when-list"')}
        <datalist id="game-when-list"><option value="thisYear"><option value="lastYear"><option value="thisMonth"><option value="lastMonth"><option value="${new Date().getFullYear()}"><option value="${new Date().toISOString().slice(0, 7)}"></datalist>
        ${F.select('gameList.groupBy', 'Group by', g.groupBy || 'period', [['period', 'Period (manual labels)'], ['collection', 'Collection / Custom group'], ['status', 'Status (Tonight / Scheduled / etc.)'], ['none', 'None (flat list)'], ['month', 'Month played'], ['year', 'Year played']])}
        <div class="grid2">${F.number('gameList.maxPeriods', 'Max periods (0 = all)', g.maxPeriods || 0, { min: 0, max: 20 })}${F.number('gameList.max', 'Max games (0 = all)', g.max || 0, { min: 0, max: 100 })}</div>
        ${F.select('gameList.sort', 'Order', g.sort || 'plan', [
            ['plan', 'Plan order (as arranged in Game Plan)'],
            ['date-asc', 'Date: Earliest / Upcoming first'],
            ['date-desc', 'Date: Latest first'],
            ['group', 'Group / Collection A–Z'],
            ['status', 'Status (Tonight, Scheduled, etc.)'],
            ['name', 'Name A–Z'],
            ['name-desc', 'Name Z–A'],
            ['rating', 'Highest rating first']
        ])}
        ${['tiers', 'ticker'].includes(g.layout) ? '' : F.check('gameList.headings', 'Group with headings', g.headings !== false)}
        ${F.check('gameList.highlightCurrent', 'Highlight the game you are playing now', g.highlightCurrent !== false)}
        ${F.color('gameList.accent', 'Accent color', g.accent || '#3fb950')}
        <p class="hint">Themes Tonight badges, active highlights, and custom borders to match your stream brand.</p>
        <p class="hint" style="margin-top:-.3rem;">Games come from the <a href="/game-plan-editor.html" target="_blank" style="color:var(--accent)">Game Plan</a>. “Playing now” follows your Twitch category.</p>`);
    const tiers = layout === 'tiers', ticker = layout === 'ticker', kanban = layout === 'kanban';
    const grouped = kanban || (g.headings !== false && !tiers && !ticker);
    const LAYOUT_HINTS = { grid: 'Covers in rows, grouped by period.', strip: 'One row of covers per group, sharing the width.', list: 'Small cover and title per line.', kanban: 'One column per group (period, or list when showing everything).', tiers: 'Tier list: games sorted into rows by star rating or by a tier you set per game (? = unranked).', ticker: 'One row of covers that scrolls sideways, for slim banners.' };
    const lay = F.section('gamelayout', 'Game list: layout', `
        ${F.select('gameList.layout', 'Layout', layout, [['grid', 'Cover grid'], ['strip', 'Cover strip (one row)'], ['list', 'Text list'], ['kanban', 'Columns (one per group)'], ['tiers', 'Tier list (by star rating)'], ['ticker', 'Scrolling ticker']])}
        <p class="hint">${LAYOUT_HINTS[layout]}</p>
        ${grouped ? '<div class="sub-head">Groups (periods)</div>' : ''}
        ${grouped && !kanban ? F.number('gameList.periodsAcross', 'Groups side by side (0 = auto)', g.periodsAcross || 0, { min: 0, max: 8 }) : ''}
        ${grouped ? F.number('gameList.groupGap', 'Gap between groups (px)', g.groupGap ?? g.gap ?? 12, { min: 0, max: 200 }) : ''}
        ${tiers ? F.number('gameList.groupGap', 'Gap between tiers (px)', g.groupGap ?? g.gap ?? 12, { min: 0, max: 200 }) : ''}
        ${['grid', 'tiers', 'ticker', 'strip', 'list', 'kanban'].includes(layout) && layout !== 'list' && !kanban && layout !== 'strip' ? '<div class="sub-head">Games</div>' : ''}
        ${layout === 'grid' ? `${F.number('gameList.columns', 'Games per row (0 = auto)', g.columns ?? 3, { min: 0, max: 12 })}<p class="hint">0 picks the biggest covers that fit the box.</p>` : ''}
        ${tiers ? F.select('gameList.tierSource', 'Rank games by', g.tierSource || 'stars', [['stars', 'Star rating'], ['tier', 'Tier set per game (S–F)']]) : ''}
        ${tiers ? F.number('gameList.columns', 'Games per row', g.columns || 6, { min: 1, max: 12 }) : ''}
        ${ticker ? `${F.number('gameList.columns', 'Games visible at once', g.columns || 5, { min: 1, max: 12 })}${F.number('gameList.tickerPace', 'Seconds per game', g.tickerPace || 3, { min: 0.5, max: 30, step: 0.5 })}${F.select('gameList.tickerDirection', 'Scroll direction', g.tickerDirection || 'left', [['left', 'Right to left'], ['right', 'Left to right']])}${F.check('gameList.tickerFade', 'Fade the edges', g.tickerFade !== false)}<p class="hint">Continuously scrolls your lineup sideways. Shorter lists loop seamlessly.</p>` : ''}
        ${layout === 'grid' || tiers || ticker || layout === 'strip' ? F.number('gameList.gap', 'Gap between games (px)', g.gap ?? 12, { min: 0, max: 80 }) : F.number('gameList.gap', 'Gap between rows (px)', g.gap ?? 12, { min: 0, max: 80 })}
        ${ticker ? '' : `<div class="sub-head">Inside the box</div>
        ${F.select('gameList.fit', 'If the list is too tall', g.fit || 'none', [['none', 'Clip it'], ['shrink', 'Shrink everything to fit (text too)']])}
        <div class="grid2">${kanban ? '<span></span>' : F.select('gameList.alignH', 'Horizontal position', g.alignH || 'left', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])}${F.select('gameList.alignV', 'Vertical position', g.alignV || 'top', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']])}</div>
        <p class="hint">Position lines up each row (and the whole list when it is shorter than the box).</p>`}`);
    const look = F.section('gamecovers', 'Game list: covers & titles', `
        ${F.check('gameList.showCovers', 'Show covers', covers)}
        ${F.check('gameList.showTitles', 'Show titles', titles)}
        ${F.check('gameList.showStatusBadge', 'Show status badge (Tonight / Scheduled)', !!g.showStatusBadge)}
        ${F.check('gameList.showGroupBadge', 'Show collection & group badge', !!g.showGroupBadge)}
        ${covers ? `${F.number('gameList.coverScale', 'Cover size (%)', g.coverScale || 100, { min: 25, max: 400 })}
        ${compact ? F.select('gameList.coverRatio', 'Cover shape', g.coverRatio || '3/4', [['3/4', 'Portrait (3:4)'], ['2/3', 'Tall portrait (2:3)'], ['1/1', 'Square'], ['4/3', 'Landscape (4:3)'], ['16/9', 'Wide (16:9)'], ['21/9', 'Banner (21:9)']]) : ''}
        ${F.select('gameList.coverFit', 'Cover fit', g.coverFit || 'cover', [['cover', 'Fill (crop to fit)'], ['contain', 'Contain (whole cover, letterboxed)'], ['natural', 'Natural proportions (no crop)']])}
        <p class="hint">IGDB covers all share one shape, so Cover fit only shows on custom artwork. Grid and strip covers can only shrink below the cell width.</p>` : ''}
        ${titles && covers && compact ? F.select('gameList.titlePlacement', 'Title position', g.titlePlacement || 'below', [['below', 'Below the cover'], ['overlay', 'On the cover (bottom)']]) : ''}
        ${titles ? F.select('gameList.titleWrap', 'Long titles', g.titleWrap || 'ellipsis', [['ellipsis', 'Cut off with …'], ['wrap', 'Wrap onto more lines']]) : ''}
        ${F.select('gameList.meta', 'Extra line', g.meta || 'none', [['none', 'None'], ['group', 'Collection / Group'], ['status', 'Status pill'], ['date', 'Scheduled date'], ['period', 'Period name'], ['year', 'Release year'], ['genres', 'Genres'], ['note', 'Your note'], ['rating', 'Star rating'], ['tags', 'Tags']])}`);
    const text = F.section('gametext', 'Game list: text sizes', `
        <p class="hint">Percentages of this element's font size (Typography). Change that one to scale all the text; use these to tune the parts.</p>
        ${(g.headings === false && !tiers) || ticker ? '' : F.number('gameList.headingScale', tiers ? 'Tier label (%)' : 'Group heading (%)', g.headingScale || 100, { min: 10, max: 400 })}
        ${titles || !covers ? F.number('gameList.titleScale', 'Game title (%)', g.titleScale || (compact ? 80 : 100), { min: 10, max: 400 }) : ''}
        ${g.meta && g.meta !== 'none' ? F.number('gameList.metaScale', 'Extra line (%)', g.metaScale || (compact ? 65 : 70), { min: 10, max: 400 }) : ''}`);
    return what + lay + look + text;
}

export function alertSection(el) {
    const a = el.alert || {};
    const only = a.triggers || [];
    return F.section('alert', 'Alert box', `
        <p class="hint">What this box shows (text, images, sounds, animations) is set per alert in <a href="/alerts.html" target="_blank" style="color:var(--accent)">Alerts</a>. This is only the look.</p>
        <div class="field">
            <span>Simulate live event</span>
            <div class="seg" style="display:flex;flex-wrap:wrap;gap:4px">
                <button type="button" data-sim-alert="follow">Follow</button>
                <button type="button" data-sim-alert="sub">Sub</button>
                <button type="button" data-sim-alert="bits">Bits</button>
                <button type="button" data-sim-alert="raid">Raid</button>
            </div>
            <span class="hint">Fires the full animation and layout directly on the canvas right now.</span>
        </div>
        <details class="sub-details"${a.sampleImage || a.sampleEmoji ? ' open' : ''}><summary>Preview media (editor only)</summary>
        <span class="hint">Only for this editor preview. Real alerts use the media set per alert.</span>
        <div class="field">
            <span>Sample icon</span>
            <span class="upload-row">
                <input data-path="alert.sampleEmoji" data-kind="text" value="${esc(a.sampleEmoji || '')}" placeholder="e.g. fa-solid fa-bell or fa-solid fa-heart" maxlength="60">
                <button type="button" id="pick-alert-icon">Icon…</button>
            </span>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                ${['fa-solid fa-heart', 'fa-solid fa-star', 'fa-solid fa-gem', 'fa-solid fa-bolt', 'fa-solid fa-fire', 'fa-solid fa-crown', 'fa-solid fa-bell', 'fa-brands fa-twitch'].map(item => {
                    return `<button type="button" class="btn sm" data-set-alert-emoji="${esc(item)}" style="padding:4px 8px;font-size:12px;min-width:32px" title="${esc(item)}"><i class="${item}" style="font-size:12px;pointer-events:none"></i></button>`;
                }).join('')}
            </div>
        </div>
        <div class="field"><span>Sample image</span><span class="upload-row"><input data-path="alert.sampleImage" data-kind="text" value="${esc(a.sampleImage || '')}" placeholder="Pick from library, or paste a URL" spellcheck="false"><button type="button" id="open-assets">Library…</button></span></div>
        </details>
        ${F.select('alert.layout', 'Layout', a.layout || 'stack', [['stack', 'Media above text'], ['side', 'Media beside text'], ['text', 'Text only'], ['media', 'Media only (text over it)']])}
        ${a.layout === 'media' ? F.check('alert.hideText', 'Hide text overlay (pure media only)', a.hideText === true) : ''}
        ${a.layout === 'text' ? '' : `<div class="grid2">${F.number('alert.mediaScale', 'Media size (%)', a.mediaScale || 60, { min: 10, max: 100 })}${F.select('alert.mediaFit', 'Media fit', a.mediaFit || 'contain', [['contain', 'Contain'], ['cover', 'Fill (crop)']])}</div>`}
        ${a.hideText && a.layout === 'media' ? '' : `<div class="grid2">${F.number('alert.titleSize', 'Title size (px)', a.titleSize || 44, { min: 8, max: 300 })}${F.number('alert.messageSize', 'Message size (px)', a.messageSize || 28, { min: 8, max: 300 })}</div>
        ${F.color('alert.titleColor', 'Title color', a.titleColor || '#ffd166')}
        ${['stack', 'side', undefined].includes(a.layout) ? F.number('alert.gap', 'Gap between media and text (px)', a.gap ?? 12, { min: 0, max: 100 }) : ''}`}
        ${F.check('alert.sound', 'Play alert sound effects', a.sound !== false)}
        ${F.check('alert.showOnPreview', 'Show placeholder on runtime preview', a.showOnPreview === true)}
        <details class="sub-details"${only.length ? ' open' : ''}><summary>Only show certain alerts (${only.length ? only.length + ' selected' : 'all'})</summary>
        <div class="trigger-list">${Object.entries(ALERT_TRIGGER_LABELS).map(([key, label]) => `<label class="check"><input type="checkbox" data-alert-trigger="${key}" ${only.includes(key) ? 'checked' : ''}> ${label}</label>`).join('')}</div>
        <span class="hint">Leave all unchecked to show every alert. Use this to send, say, raids to a different box.</span></details>`);
}

export function progressSection(el) {
    const p = el.progress || {};
    return F.section('progress', 'Progress', `
        ${F.select('progress.kind', 'Style', p.kind || 'bar', [['bar', 'Bar'], ['ring', 'Ring']])}
        ${F.color('style.fill', 'Fill color', el.style.fill || '#1f6feb')}
        ${F.color('progress.trackColor', 'Track color', p.trackColor || 'rgba(255,255,255,0.18)')}
        ${p.kind === 'ring' ? F.number('progress.thickness', 'Ring thickness', p.thickness || 10, { min: 2, max: 40 }) : ''}
        ${F.check('progress.showLabel', 'Show label', p.showLabel !== false)}
        ${p.showLabel === false ? '' : `${F.text('progress.label', 'Label', p.label ?? '{{progress}}%')}
        <p class="hint">{{progress}} in the label is the current percent. The label uses the Typography settings.</p>`}`);
}

export function randomSection(el) {
    const r = el.random || {};
    return F.section('behavior', 'Random text behavior', `
        <div class="grid2">${F.select('random.mode', 'Display', r.mode || 'random', [['random', 'Random order'], ['order', 'Entered order']])}${F.number('random.intervalSeconds', 'Refresh (sec)', r.intervalSeconds || 5, { min: 1, max: 3600 })}</div>
        ${F.check('random.typewriter', 'Typewriter effect', r.typewriter)}
        ${r.typewriter ? F.number('random.typewriterSpeed', 'Typewriter speed (ms per character)', r.typewriterSpeed || 110, { min: 10, max: 1000 }) : ''}
        ${F.check('random.marquee', 'Marquee scroll', r.marquee)}
        ${r.marquee ? F.number('random.marqueeSpeed', 'Marquee duration (sec per pass)', r.marqueeSpeed || 60, { min: 10, max: 240 }) : ''}
        <p class="hint">The canvas shows the first phrase; the runtime cycles through the pool.</p>`);
}

export function sharedBlock(items) {
    const pagesEnabled = state.overlay.pages?.enabled === true;
    if (!pagesEnabled) return '';
    const all = items.every(el => el.page === '*');
    return `<div class="shared-box"><label class="check"><input type="checkbox" id="el-shared" ${all ? 'checked' : ''}> Show on all pages (shared)</label></div>`;
}

// ---- Property Inspector Panel Render ----------------------------------------------
export function renderProperties() {
    const items = selectedElements();
    const root = $('properties');
    if (!root) return;
    const scroll = root.parentElement ? root.parentElement.scrollTop : 0;
    const active = document.activeElement;
    const focused = active && root.contains(active) && active.dataset?.path ? { path: active.dataset.path, start: active.selectionStart, end: active.selectionEnd } : null;
    if (!items.length) {
        root.innerHTML = `<div class="empty-props"><h3>No element selected</h3><p class="hint">Click an element on the canvas or in Layers to edit it. Drag on empty canvas to box-select.</p>
            <div class="kbd-list"><span><kbd>Ctrl/⌘</kbd> <kbd>D</kbd></span><span>Duplicate</span><span><kbd>Del</kbd></span><span>Delete</span><span><kbd>↑↓←→</kbd></span><span>Nudge</span><span><kbd>Ctrl/⌘</kbd> <kbd>S</kbd></span><span>Save &amp; push live</span></div></div>`;
        return;
    }
    if (items.length > 1) {
        const textual = items.some(el => hasText(el) || el.type === 'shape');
        root.innerHTML = `${actionBar(items)}${sharedBlock(items)}${scaleSection(items)}${alignSection(items)}${appearanceSection(items[0], true)}${textual ? typographySection(items.find(hasText) || items[0]) : ''}`;
    } else {
        const el = items[0];
        const specific = { 'random-text': randomSection, progress: progressSection, 'game-list': gameListSection, alert: alertSection, slideshow: slideshowSection }[el.type];
        root.innerHTML = `${actionBar(items)}${sharedBlock(items)}<div style="padding:.7rem .85rem 0">${F.text('name', 'Layer name', el.name, `placeholder="${esc(displayName(el))}" maxlength="80"`)}</div>${layoutSection(el)}${contentSection(el)}${el.type === 'icon' ? iconEffectsSection(el) : ''}${specific ? specific(el) : ''}${!['embed', 'cutout'].includes(el.type) ? filterSection(el) : ''}${hasText(el) ? typographySection(el) : ''}${el.type !== 'cutout' ? fillSection(el) : ''}${el.type !== 'cutout' ? effectsSection(el) : ''}`;
    }
    if (root.parentElement) root.parentElement.scrollTop = scroll;
    state.lastTextField = null;
    refreshSlideCount();
    renderTagSuggestions();

    // Rebuilding the panel drops focus; restore so typing continues seamlessly
    if (focused) {
        const next = [...root.querySelectorAll('[data-path]')].find(node => node.dataset.path === focused.path && !node.matches('[type=color]'));
        if (next) {
            next.focus({ preventScroll: true });
            if (next.type === 'number') {
                next.type = 'text'; next.setSelectionRange(next.value.length, next.value.length); next.type = 'number';
            } else try { if (focused.start != null) next.setSelectionRange(focused.start, focused.end); } catch {}
        }
    }
}

// ---- Text Sources & Local Media Linking -------------------------------------------
export async function useTextSource(el, mode, path) {
    el.source = { ...(el.source || { split: 'lines' }), mode, path };
    if (shared.refreshTextSources) await shared.refreshTextSources([el]);
    renderCanvas();
    renderProperties();
    changed(true);
}

export async function useLocalMedia(el, filePath) {
    const hadSource = !!el.src;
    el.src = `${LOCAL_MEDIA}${encodeURIComponent(filePath.trim())}`;
    if (!hadSource) await fitToMediaHandler(el, el.src, el.type);
    renderCanvas();
    renderProperties();
    changed(true);
}

// ---- Inline Placeholder Autocomplete ----------------------------------------------
const pacEl = $('placeholder-ac');
let pacTarget = null, pacMatchStart = 0, pacActiveIdx = 0, pacTokens = [];

export function hidePlaceholderAC() {
    if (pacEl) {
        pacEl.classList.remove('open');
        pacEl.innerHTML = '';
    }
    pacTarget = null;
}

export function getAvailableTokens() {
    if (!shared.variableGroups) return [];
    const groups = shared.variableGroups(state.liveStatus);
    const tokens = [];
    const table = shared.variableTable ? shared.variableTable(state.liveStatus, variableContext()) : {};
    for (const g of groups) {
        for (const [key, label] of g.items) {
            const val = table[key];
            const preview = val === undefined || val === null || val === '' ? '' : String(val);
            tokens.push({ key, label, preview, group: g.label });
        }
    }
    return tokens;
}

export function renderPlaceholderACSelection() {
    if (!pacEl) return;
    const items = pacEl.querySelectorAll('.pac-item');
    items.forEach((item, idx) => {
        const isAct = idx === pacActiveIdx;
        item.classList.toggle('active', isAct);
        if (isAct) item.scrollIntoView({ block: 'nearest' });
    });
}

export function updatePlaceholderAC() {
    if (!pacTarget || !document.contains(pacTarget)) { hidePlaceholderAC(); return; }
    const val = pacTarget.value || '';
    const selEnd = pacTarget.selectionStart ?? val.length;
    const textBefore = val.slice(0, selEnd);
    const match = textBefore.match(/\{\{([a-zA-Z0-9_.-]*)$/);
    if (!match) { hidePlaceholderAC(); return; }

    const pacQuery = match[1].toLowerCase();
    pacMatchStart = match.index;

    const all = getAvailableTokens();
    pacTokens = pacQuery
        ? all.filter(t => t.key.toLowerCase().includes(pacQuery) || t.label.toLowerCase().includes(pacQuery))
        : all;

    if (!pacTokens.length) { hidePlaceholderAC(); return; }
    pacTokens = pacTokens.slice(0, 15);
    if (pacActiveIdx >= pacTokens.length) pacActiveIdx = 0;

    pacEl.innerHTML = pacTokens.map((t, i) => `
        <button type="button" class="pac-item${i === pacActiveIdx ? ' active' : ''}" data-idx="${i}" data-token="${esc(t.key)}">
            <div class="pac-head">
                <span class="pac-key">{{${esc(t.key)}}}</span>
                <span class="pac-label">${esc(t.label)}</span>
            </div>
            ${t.preview ? `<span class="pac-preview">${esc(t.preview)}</span>` : ''}
        </button>
    `).join('');
    pacEl.classList.add('open');

    const rect = pacTarget.getBoundingClientRect();
    const popupH = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320));
    let top = rect.bottom + 4;
    if (spaceBelow < popupH && rect.top > popupH) {
        top = rect.top - popupH - 4;
    }
    pacEl.style.left = `${left}px`;
    pacEl.style.top = `${top}px`;
}

export function insertPlaceholderToken(token) {
    if (!pacTarget) return;
    const selEnd = pacTarget.selectionStart ?? pacTarget.value.length;
    pacTarget.focus();
    pacTarget.setRangeText(`{{${token}}}`, pacMatchStart, selEnd, 'end');
    pacTarget.dispatchEvent(new Event('input', { bubbles: true }));
    pacTarget.dispatchEvent(new Event('change', { bubbles: true }));
    hidePlaceholderAC();
}

export function openVariableDialog() {
    if (!window.PlaceholderPicker) return;
    window.PlaceholderPicker.open({
        getStatus: () => state.liveStatus,
        getContext: variableContext,
        onWarn: message => toast(message, 'warn', 1800),
        onPick: token => {
            const field = state.lastTextField && state.lastTextField.isConnected
                ? state.lastTextField
                : ($('prop-content') || document.querySelector('#properties input[data-path="src"]'));
            if (!field) { toast('Select a text element first.', 'warn', 1800); return; }
            window.PlaceholderPicker.insertInto(field, token);
        }
    });
}

// ---- Inspector & Settings Event Initialization ------------------------------------
export function initInspectorEvents() {
    const settingsEl = $('settings');
    if (settingsEl) {
        bindFields(settingsEl, () => [state.overlay], path => {
            syncCanvasUI();
            if (path.startsWith('canvas.') && state.autoFit) fitView(true);
            changed(false);
        });

        settingsEl.addEventListener('click', event => {
            if (event.target.id === 'backdrop-upload-btn') {
                $('backdrop-upload')?.click();
            } else if (event.target.id === 'backdrop-clear-btn') {
                prefs.backdropImage = '';
                savePrefs();
                syncCanvasUI();
                renderSettings();
                toast('Screenshot backdrop cleared', 'info', 1500);
            }
        });

        settingsEl.addEventListener('input', event => {
            if (event.target.id === 'backdrop-opacity-range') {
                prefs.backdropOpacity = Number(event.target.value);
                savePrefs();
                const bdImg = $('backdrop-img');
                if (bdImg) bdImg.style.opacity = String(prefs.backdropOpacity / 100);
                const output = event.target.parentElement?.querySelector('output');
                if (output) output.textContent = `${prefs.backdropOpacity}%`;
            }
        });

        settingsEl.addEventListener('change', event => {
            const input = event.target;
            if (input.id === 'canvas-preset') {
                const [w, h] = input.value.split('x').map(Number);
                state.overlay.canvas.width = w; state.overlay.canvas.height = h;
                renderSettings(); syncCanvasUI(); if (state.autoFit) fitView(true); changed(true);
            } else if (input.id === 'backdrop-select') {
                prefs.backdrop = input.value; savePrefs(); syncCanvasUI();
            } else if (input.id === 'backdrop-upload' && input.files?.[0]) {
                const file = input.files[0];
                toast('Loading screenshot backdrop…', 'info', 1500);
                (async () => {
                    try {
                        const url = await uploadAssetHandler(file);
                        prefs.backdropImage = url;
                        prefs.backdropOpacity = prefs.backdropOpacity ?? 80;
                        savePrefs();
                        syncCanvasUI();
                        renderSettings();
                        toast('Backdrop screenshot loaded', 'success', 2000);
                    } catch {
                        const reader = new FileReader();
                        reader.onload = e => {
                            prefs.backdropImage = e.target.result;
                            prefs.backdropOpacity = prefs.backdropOpacity ?? 80;
                            savePrefs();
                            syncCanvasUI();
                            renderSettings();
                            toast('Backdrop screenshot loaded', 'success', 2000);
                        };
                        reader.readAsDataURL(file);
                    }
                })();
            } else if (input.dataset.path?.startsWith('canvas.') && input.dataset.kind === 'number') {
                renderSettings();
            }
        });
    }

    const propEl = $('properties');
    if (propEl) {
        propEl.addEventListener('focusin', event => {
            const input = event.target.closest?.('[data-path][data-kind="number"]');
            const target = selectedElements()[0];
            if (input && target) numberWasOn.set(input.dataset.path, Number(getPath(target, input.dataset.path)) > 0);
        });

        bindFields(propEl, selectedElements, (path, event) => {
            for (const el of selectedElements()) {
                el.width = clamp(el.width, 1, 3840);
                el.height = clamp(el.height, 1, 2160);
            }
            if (path === 'cutout.feather') {
                if (event?.type === 'input') scheduleEditorCutoutMask();
                else updateEditorCutoutMask();
                changed(false);
                return;
            }
            renderCanvas();
            renderSelectionUI();
            updateStatusBarHandler();
            if (path === 'name') renderLayers();
            if (path === 'style.shape' || path === 'progress.kind' || path === 'gameList.layout' || RERENDER_PATHS.has(path) || /^style\.(gradient|textGradient|borderGradient)\.(enabled|type|animate)$/.test(path)) {
                if (numberCrossedZero(path, event)) renderProperties();
            }
            if (path.startsWith('slideshow.')) refreshSlideCount();
            changed(false);
        });

        propEl.addEventListener('change', event => {
            if (!event.target.matches('[data-period-pick]')) return;
            const field = event.target.closest('.field');
            const hidden = field.querySelector('input[type="hidden"]');
            hidden.value = [...field.querySelectorAll('[data-period-pick]:checked')].map(box => box.value).join('\n');
            selectedElements().forEach(target => { if (target.gameList) target.gameList.period = ''; });
            hidden.dispatchEvent(new Event('input', { bubbles: true }));
        });

        propEl.addEventListener('change', event => {
            const path = event.target.closest('[data-path]')?.dataset.path;
            if (path === 'style.borderWidth' || path === 'style.shadow.blur') renderProperties();
        });

        propEl.addEventListener('change', event => {
            const box = event.target.closest('[data-alert-trigger]');
            if (!box) return;
            for (const el of selectedElements()) {
                const set = new Set(el.alert?.triggers || []);
                box.checked ? set.add(box.dataset.alertTrigger) : set.delete(box.dataset.alertTrigger);
                el.alert = { ...(el.alert || {}), triggers: [...set] };
            }
            renderProperties();
            renderCanvas();
            changed(true);
        });

        propEl.addEventListener('change', event => {
            if (event.target.id === 'scale-text') {
                prefs.scaleText = event.target.checked;
                savePrefs();
            }
        });

        propEl.addEventListener('keydown', event => {
            if (event.key === 'Enter' && event.target.id === 'scale-pct') {
                event.preventDefault();
                scaleSelectionByHandler(Number(event.target.value));
            } else if (event.key === 'Enter' && event.target.matches('input[data-path]')) {
                event.target.blur();
            }
        });

        propEl.addEventListener('change', async event => {
            if (event.target.id === 'font-upload' && event.target.files[0]) {
                try {
                    toast('Uploading font…', 'info', 1500);
                    const url = await uploadAssetHandler(event.target.files[0]);
                    const fonts = shared.loadAssetFonts ? await shared.loadAssetFonts() : [];
                    const font = fonts.find(f => f.url === url);
                    const targets = selectedElements();
                    if (font) targets.forEach(item => { item.style.fontFamily = `'${font.family}', sans-serif`; });
                    renderCanvas();
                    renderProperties();
                    changed(true);
                    toast(font ? `Font “${font.family}” applied` : 'Font uploaded', 'success', 2200);
                } catch (error) {
                    toast(error.message, 'error', 5000);
                    event.target.value = '';
                }
                return;
            }
            if (event.target.id !== 'prop-upload' || !event.target.files[0]) return;
            const el = primary();
            if (!el) return;
            const file = event.target.files[0];
            try {
                toast('Uploading…', 'info', 1500);
                const url = await uploadAssetHandler(file);
                const hadSource = !!el.src;
                el.src = url;
                if (!hadSource) await fitToMediaHandler(el, url, el.type);
                renderCanvas();
                renderProperties();
                changed(true);
                toast('Asset uploaded', 'success', 1800);
            } catch (error) {
                toast(error.message, 'error', 5000);
                event.target.value = '';
            }
        });

        propEl.addEventListener('change', async event => {
            const el = primary();
            if (!el) return;
            if (event.target.id === 'source-upload' && event.target.files[0]) {
                try {
                    toast('Uploading…', 'info', 1500);
                    const url = await uploadAssetHandler(event.target.files[0]);
                    await useTextSource(el, 'library', url);
                } catch (error) {
                    toast(error.message, 'error', 5000);
                    event.target.value = '';
                }
            } else if (event.target.dataset?.path === 'source.path' || event.target.dataset?.path === 'source.split') {
                if (shared.refreshTextSources) await shared.refreshTextSources([el]);
                renderCanvas();
                updateSourceStatus();
            } else if (event.target.id === 'media-path' && event.target.value.trim()) {
                useLocalMedia(el, event.target.value);
            }
        });

        propEl.addEventListener('mousedown', event => {
            if (event.target.id === 'font-picker' && shared.loadGoogleFont) {
                GOOGLE_FONT_OPTIONS.forEach(([v]) => shared.loadGoogleFont(v));
            }
        });

        propEl.addEventListener('input', event => {
            if (event.target.dataset?.path === 'style.fontFamily' && shared.loadGoogleFont) {
                shared.loadGoogleFont(event.target.value);
            }
            if (event.target.id === 'slide-tag-q') renderTagSuggestions();
            if (event.target.matches('textarea, input[data-kind="text"], input[data-path]')) {
                pacTarget = event.target;
                updatePlaceholderAC();
            }
        });

        propEl.addEventListener('click', async event => {
            const target = event.target;
            const act = target.closest('[data-act]')?.dataset.act;
            if (act) { runActionHandler(act); return; }
            const align = target.closest('[data-align]')?.dataset.align;
            if (align) { alignSelectionHandler(align); return; }
            const dist = target.closest('[data-distribute]')?.dataset.distribute;
            if (dist) { distributeSelectionHandler(dist); return; }
            const alignTarget = target.closest('[data-target]');
            if (alignTarget) {
                prefs.alignTo = alignTarget.dataset.target;
                savePrefs();
                alignTarget.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === alignTarget)));
                return;
            }
            if (target.closest('#open-variables')) openVariableDialog();
            const quick = target.closest('button[data-scale]');
            if (quick) scaleSelectionByHandler(Number(quick.dataset.scale));
            if (target.closest('#scale-apply')) scaleSelectionByHandler(Number($('scale-pct')?.value || 100));

            if (target.closest('#fit-icon')) {
                const el = primary(), glyph = state.nodes.get(el?.id)?.querySelector('i');
                if (el && glyph) {
                    el.width = Math.max(LIMITS.elementW[0], Math.ceil(glyph.offsetWidth));
                    changed(true);
                    renderCanvas();
                    renderProperties();
                }
            }
            if (target.closest('#pick-icon') && window.IconPicker) {
                const input = propEl.querySelector('[data-path="content"]');
                window.IconPicker.open({
                    value: input?.value,
                    onPick: cls => {
                        if (!input) return;
                        input.value = cls;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
            if (target.closest('#pick-alert-icon') && window.IconPicker) {
                const input = propEl.querySelector('[data-path="alert.sampleEmoji"]');
                window.IconPicker.open({
                    value: input?.value,
                    onPick: cls => {
                        if (!input) return;
                        input.value = cls;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
            const alertEmojiChip = target.closest('[data-set-alert-emoji]');
            if (alertEmojiChip) {
                const input = propEl.querySelector('[data-path="alert.sampleEmoji"]');
                if (input) {
                    input.value = alertEmojiChip.dataset.setAlertEmoji;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            const modeButton = target.closest('[data-source-mode]');
            if (modeButton) {
                const el = primary();
                if (el) {
                    el.source = { ...(el.source || { path: '', split: 'lines' }), mode: modeButton.dataset.sourceMode };
                    if (shared.refreshTextSources) await shared.refreshTextSources([el]);
                    renderCanvas();
                    renderProperties();
                    changed(true);
                }
                return;
            }
            const tab = target.closest('[data-media-tab]');
            if (tab) {
                const el = primary();
                if (el) {
                    state.mediaTab.set(el.id, tab.dataset.mediaTab);
                    renderProperties();
                }
                return;
            }
            if (target.closest('#source-browse')) {
                const el = primary();
                const button = target.closest('#source-browse');
                if (button && el) {
                    button.disabled = true; button.textContent = 'Choosing…';
                    try {
                        const response = await fetch('/api/system/choose-file', { method: 'POST' });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) toast(data.error || 'Could not open the file chooser', 'error', 5000);
                        else if (data.path) { await useTextSource(el, 'file', data.path); return; }
                    } catch { toast('Could not reach StreamPulse', 'error', 3000); }
                    button.disabled = false; button.textContent = 'Browse…';
                }
            }
            if (target.closest('#media-browse')) {
                const button = target.closest('#media-browse');
                const el = primary();
                if (button && el) {
                    button.disabled = true; button.textContent = 'Choosing…';
                    try {
                        const response = await fetch('/api/system/choose-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'media' }) });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) toast(data.error || 'Could not open the file chooser', 'error', 5000);
                        else if (data.path) { await useLocalMedia(el, data.path); return; }
                    } catch { toast('Could not reach StreamPulse', 'error', 3000); }
                    button.disabled = false; button.textContent = 'Browse…';
                }
            }
            if (target.closest('#open-assets') || target.closest('#source-library')) {
                openAssetDialogHandler(primary()?.id);
                return;
            }
            const simBtn = target.closest('[data-sim-alert]');
            if (simBtn || target.id === 'alert-play') {
                const el = primary(), node = el && state.nodes.get(el.id);
                if (!node) return;
                const kind = simBtn?.dataset?.simAlert || 'follow';
                const sample = alertSample(el);
                const events = {
                    follow: { title: 'TwitchFan42 followed!', message: 'Thanks for the follow!', animIn: 'pop', durationMs: 4000 },
                    sub: { title: 'SubHero subscribed!', message: 'Tier 1 sub · 3 month streak', animIn: 'bounce', durationMs: 4500 },
                    bits: { title: 'BitMaster cheered 500 bits!', message: 'Hyped for the stream!', animIn: 'slide', durationMs: 4500 },
                    raid: { title: 'CoolStreamer raided with 42 viewers!', message: 'Welcome raiders!', animIn: 'zoom', durationMs: 5000 }
                };
                if (node._alertHandle) node._alertHandle.stop();
                toast(`Simulating ${kind} alert…`, 'info', 1200);
                if (shared.playAlert) {
                    node._alertHandle = shared.playAlert(node, el, { ...sample, ...(events[kind] || events.follow) }, { sound: false, onEnd: () => { node._sig = null; renderCanvas(); } });
                }
                return;
            }
            if (target.closest('#toggle-aspect-lock')) {
                const el = primary();
                if (el) {
                    el.aspectLock = !el.aspectLock;
                    if (el.aspectLock) el.aspectRatio = el.width / Math.max(1, el.height);
                    changed(true);
                    renderProperties();
                    toast(el.aspectLock ? 'Proportions locked' : 'Proportions unlocked', 'info', 1200);
                }
                return;
            }
            const aspectBtn = target.closest('[data-cutout-aspect]');
            if (aspectBtn) {
                const el = primary();
                if (el && el.type === 'cutout') {
                    const ratio = aspectBtn.dataset.cutoutAspect;
                    let w = el.width || 480;
                    let h;
                    if (ratio === '16-9') h = Math.round(w * 9 / 16);
                    else if (ratio === '4-3') h = Math.round(w * 3 / 4);
                    else if (ratio === '1-1') h = w;
                    else if (ratio === '9-16') h = Math.round(w * 16 / 9);
                    if (h > (state.overlay.canvas?.height || 1080)) {
                        h = Math.round((state.overlay.canvas?.height || 1080) * 0.7);
                        if (ratio === '16-9') w = Math.round(h * 16 / 9);
                        else if (ratio === '4-3') w = Math.round(h * 4 / 3);
                        else if (ratio === '1-1') w = h;
                        else if (ratio === '9-16') w = Math.round(h * 9 / 16);
                    }
                    el.width = clamp(w, 10, 3840);
                    el.height = clamp(h, 10, 2160);
                    renderCanvas();
                    renderSelectionUI();
                    renderProperties();
                    changed(true);
                }
                return;
            }
            const ctl = target.closest('[data-slide-ctl]');
            if (ctl) {
                const el = primary(), status = document.getElementById('slide-ctl-status');
                state.nodes.get(el?.id)?._slideHandle?.control(ctl.dataset.slideCtl);
                fetch(`/api/custom-overlays/${encodeURIComponent(state.overlay.id)}/slideshow`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: ctl.dataset.slideCtl, element: el?.id })
                }).then(r => r.json()).then(d => {
                    if (status) status.textContent = d.listeners ? 'Preview updated. Sent to live overlays.' : 'Preview updated. No live overlay is connected.';
                }).catch(() => {
                    if (status) status.textContent = 'Preview updated. Could not reach the server.';
                });
            }
            if (target.closest('[data-slide-popout]')) {
                window.open(`/overlay-control.html?id=${encodeURIComponent(state.overlay.id)}`, 'slideshow-remote', 'popup,width=420,height=640');
            }
            const add = target.closest('[data-slide-addtag]'), remove = target.closest('[data-slide-untag]');
            if (add) changeSlideTags(tags => [...tags, add.dataset.slideAddtag]);
            if (remove) changeSlideTags(tags => tags.filter(tag => tag !== remove.dataset.slideUntag));
        });

        propEl.addEventListener('change', event => {
            if (event.target.id !== 'el-shared') return;
            for (const el of selectedElements()) el.page = event.target.checked ? '*' : state.curPage;
            renderLayers();
            renderCanvas();
            changed(true);
        });
    }

    if (pacEl) {
        pacEl.addEventListener('click', event => {
            const item = event.target.closest('[data-token]');
            if (item) insertPlaceholderToken(item.dataset.token);
        });
    }

    document.addEventListener('click', event => {
        if (!event.target.closest('#placeholder-ac') && event.target !== pacTarget) {
            hidePlaceholderAC();
        }
    });

    setInterval(async () => {
        if (shared.refreshTextSources) {
            if (!(await shared.refreshTextSources(state.overlay.elements))) return;
            renderCanvas();
            updateSourceStatus();
        }
    }, 3000);
}
