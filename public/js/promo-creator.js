import { makeBackdrop, layoutText, shapeBox } from './promo-renderer.js';
import { exportAnimation, exportPromos, supportsMp4 } from './promo-export.js';
import { fontAssets, promoFont } from './promo-fonts.js';
import { alignmentOffset, snapAxis } from './editor-geometry.js';
import { F, bindFields } from './editor/editor-form.js';
import { ICON, TYPE_META, esc } from './editor/editor-state.js';

const M = window.PromoModel, $ = id => document.getElementById(id);
const LABELS = { photo: 'Screenshot / photo', artwork: 'Artwork / logo', badge: 'Status label', title: 'Headline', subtitle: 'Subtitle', url: 'Twitch URL', qr: 'QR code' };
const clone = value => JSON.parse(JSON.stringify(value));
const LAST_PROMO_KEY = 'streampulse.promo.lastId';
const PROMO_RAIL_TAB_KEY = 'streampulse.promo.settingsTab';
let design = M.normalize(), library = [], id = '', selected = 'title', dirty = false, ready = false;
let ratio = 'square', assetTarget = 'photo', assets = [], zoom = 1, scale = 1;
let customThemes = [], themesReady = false, editingTheme = '', themeSnapshot = null;
let railTab = 'layers';
try {
    const saved = localStorage.getItem('streampulse.promo.ratio');
    if (Object.hasOwn(M.SIZES, saved)) ratio = saved;
} catch { /* Storage can be unavailable in private browser contexts. */ }
try {
    const saved = localStorage.getItem(PROMO_RAIL_TAB_KEY);
    if (['layers', 'content', 'appearance'].includes(saved)) railTab = saved;
} catch { /* Storage can be unavailable in private browser contexts. */ }
const size = () => M.SIZES[ratio];
const element = (key = selected) => design.elements.find(item => item.id === key);
const roleElement = role => design.elements.find(item => item.role === role);
const placementOf = key => design.layouts[ratio].placements[key];
const elementLabel = item => LABELS[item.role] || item.name || M.TYPE_NAMES?.[item.type] || item.type;
const hasBg = s => s.background && s.background !== 'transparent';
const uuid = () => crypto.randomUUID();
const status = (message, error = false) => {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
};
function selectRailTab(next, focus = false) {
    if (!['layers', 'content', 'appearance'].includes(next)) return;
    railTab = next;
    for (const tab of document.querySelectorAll('[data-rail-tab]')) {
        const active = tab.dataset.railTab === railTab;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        $(tab.getAttribute('aria-controls')).hidden = !active;
    }
    try { localStorage.setItem(PROMO_RAIL_TAB_KEY, railTab); } catch { /* Optional view preference. */ }
    if (focus) $(`rail-tab-${railTab}`).focus();
}
selectRailTab(railTab);
function rememberPromo(value) {
    try {
        if (value) localStorage.setItem(LAST_PROMO_KEY, value);
        else localStorage.removeItem(LAST_PROMO_KEY);
    } catch { /* Promo reopening is optional when browser storage is unavailable. */ }
}
function rememberedPromo() {
    try { return localStorage.getItem(LAST_PROMO_KEY) || ''; }
    catch { return ''; }
}

// ---- History / dirty state ----
let hist = [], hi = -1, histTimer = 0;
const snap = () => JSON.stringify(design);
function updateDirty() {
    $('dirty').hidden = !dirty;
    $('save-design').textContent = dirty ? 'Save changes' : 'Save design';
    $('undo').disabled = hi <= 0 && !histTimer;
    $('redo').disabled = hi >= hist.length - 1;
}
function resetHistory() { clearTimeout(histTimer); histTimer = 0; hist = [snap()]; hi = 0; updateDirty(); }
function pushHistory() {
    clearTimeout(histTimer); histTimer = 0;
    const next = snap();
    if (next !== hist[hi]) {
        hist = hist.slice(0, hi + 1); hist.push(next);
        if (hist.length > 100) hist.shift();
        hi = hist.length - 1;
    }
    updateDirty();
}
function stepHistory(direction) {
    if (histTimer) pushHistory();
    const next = hi + direction;
    if (next < 0 || next >= hist.length) return;
    hi = next; design = M.normalize(JSON.parse(hist[hi])); dirty = true;
    if (!element()) selected = design.elements[0]?.id || '';
    syncFields();
}
const changed = () => {
    dirty = true; updateDirty(); syncThemeSelection();
    clearTimeout(histTimer); histTimer = setTimeout(pushHistory, 350);
};

$('undo').innerHTML = ICON.undo; $('redo').innerHTML = ICON.redo;
const uploadedFonts = [];
const fontGroups = () => [['', 'Use promo font'],
    { group: 'System fonts / work offline', options: ['sans-serif', 'serif', 'monospace', ...window.OverlayFonts.system].map(name => [name, name]) },
    { group: 'Google Fonts', options: window.OverlayFonts.google.map(name => [name, name]) },
    ...(uploadedFonts.length ? [{ group: 'Uploaded fonts', options: uploadedFonts.map(name => [name, name]) }] : [])];

async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}

// ---- Stage: DOM elements over a cached background canvas ----
const mctx = document.createElement('canvas').getContext('2d');
const loadingFonts = new Set(), nodes = new Map();
function cssFont(name) {
    name = name || design.font || 'sans-serif';
    if (['sans-serif', 'serif', 'monospace'].includes(name)) return name;
    if (!loadingFonts.has(name)) {
        loadingFonts.add(name);
        promoFont(name).then(() => renderEls(), error => status(error.message, true));
    }
    return `"${name}"`;
}
function paint(node, item, p) {
    const s = item.style, colors = design.colors;
    const { box, radius } = shapeBox({ x: 0, y: 0, w: p.width, h: p.height }, s, item.type);
    node.className = `pe${item.id === selected ? ' selected' : ''}${item.locked ? ' locked' : ''}`;
    Object.assign(node.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px`, opacity: s.opacity, transform: s.rotate ? `rotate(${s.rotate}deg)` : '' });
    let pb = node.firstChild;
    if (!pb) { pb = document.createElement('div'); pb.className = 'pb'; node.append(pb); }
    pb.replaceChildren();
    Object.assign(pb.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, borderRadius: `${radius}px`, boxShadow: '', background: '', overflow: item.type === 'text' ? '' : 'hidden' });
    const shadows = s.shadow?.blur > 0 ? [`0 0 ${s.shadow.blur}px ${s.shadow.color}`] : [];
    const border = () => {
        if (!(s.borderWidth > 0)) return;
        const ring = document.createElement('i'); ring.className = 'pbo';
        ring.style.cssText = `border-radius:${radius}px;box-shadow:inset 0 0 0 ${s.borderWidth}px ${s.borderColor}`;
        pb.append(ring);
    };
    if (item.type === 'image') {
        if (s.shadow.blur > 0) pb.style.background = colors.panel;
        pb.style.boxShadow = shadows.join(',');
        if (item.src) {
            const img = document.createElement('img');
            img.src = item.src; img.draggable = false;
            img.style.cssText = `object-fit:${s.objectFit};object-position:${s.focusX}% ${s.focusY}%`;
            pb.append(img);
        } else {
            const hint = document.createElement('div'); hint.className = 'pt';
            hint.style.cssText = `inset:24px;width:auto;height:auto;display:flex;align-items:center;font:400 28px/1.12 ${cssFont()};color:${colors.muted}`;
            hint.textContent = item.role === 'photo' ? 'Add your screenshot' : item.role === 'artwork' ? 'Add artwork' : 'Add image';
            pb.style.background = colors.panel; pb.append(hint);
        }
        if (item.role === 'photo' && design.layouts[ratio].template === 'spotlight') {
            const shade = document.createElement('i'); shade.className = 'pbo';
            shade.style.background = ratio === 'landscape' ? `linear-gradient(90deg,${colors.background}f0,${colors.background}35)` : `linear-gradient(180deg,${colors.background}00,${colors.background}ff)`;
            pb.append(shade);
        }
        border();
    } else if (item.type === 'shape') {
        pb.style.background = s.background; pb.style.boxShadow = shadows.join(',');
        border();
    } else if (item.type === 'icon') {
        const side = Math.min(box.w, box.h);
        pb.style.overflow = 'visible'; pb.style.display = 'grid'; pb.style.placeItems = 'center';
        pb.innerHTML = `<svg viewBox="0 0 24 24" width="${side}" height="${side}" style="${s.shadow.blur > 0 ? `filter:drop-shadow(0 0 ${s.shadow.blur}px ${s.shadow.color})` : ''}"><path fill="${esc(s.color)}" d="${M.ICONS[item.icon]}"/></svg>`;
    } else if (item.type === 'qr') {
        const value = item.source === 'channel-url' ? design.url : item.content;
        if (!value) return;
        const side = Math.min(box.w, box.h), q = item.qr;
        const img = document.createElement('img');
        img.src = `/api/qr?${new URLSearchParams({ text: value, fg: q.fg, bg: q.bg, margin: String(q.margin), ecc: q.ecc })}`;
        img.draggable = false;
        img.style.cssText = `position:absolute;left:${(box.w - side) / 2}px;top:${(box.h - side) / 2}px;width:${side}px;height:${side}px;image-rendering:pixelated;border-radius:${Math.min(radius, side / 2)}px`;
        pb.append(img);
    } else {
        const value = item.source === 'channel-url' ? design.url.replace(/^https?:\/\//, '') : item.content;
        if (!value) return;
        const badge = item.role === 'badge' && !hasBg(s), filled = hasBg(s) || badge || s.borderWidth > 0;
        if (filled) {
            pb.style.background = hasBg(s) ? s.background : badge ? `${colors.accent}25` : '';
            if (badge) shadows.push(`inset 0 0 0 1.5px ${colors.accent}90`);
        }
        pb.style.boxShadow = shadows.join(',');
        border();
        const inset = filled ? (s.padding || (badge ? Math.min(box.h * .18, 14) : 0)) + (s.borderWidth || 0) : 0;
        const inner = { x: 0, y: 0, w: Math.max(1, box.w - inset * 2), h: Math.max(1, box.h - inset * 2) };
        const family = cssFont(s.fontFamily), L = layoutText(mctx, value, inner, s, family);
        const fallback = item.role === 'badge' ? colors.accent : ['subtitle', 'url'].includes(item.role) ? colors.muted : colors.text;
        const span = document.createElement('div'); span.className = 'pt';
        span.style.cssText = `left:${inset}px;top:${inset}px;width:${inner.w}px;height:${inner.h}px;padding-top:${L.textY}px;font:${s.fontStyle === 'italic' ? 'italic ' : ''}${s.fontWeight} ${L.size}px/${L.size * L.lh}px ${family};letter-spacing:${s.letterSpacing}px;text-align:${L.align}`;
        const g = s.textGradient;
        if (g.enabled) {
            span.style.backgroundImage = g.type === 'radial' ? `radial-gradient(circle farthest-corner,${g.from},${g.to})` : `linear-gradient(${g.angle}deg,${g.from},${g.to})`;
            span.style.webkitBackgroundClip = 'text'; span.style.backgroundClip = 'text'; span.style.color = 'transparent';
        } else span.style.color = s.color || fallback;
        if (s.textStroke.width > 0) { span.style.webkitTextStroke = `${s.textStroke.width * 2}px ${s.textStroke.color}`; span.style.paintOrder = 'stroke fill'; }
        if (s.textShadow.blur > 0 && !(g.enabled && hasBg(s))) span.style.textShadow = `0 0 ${s.textShadow.blur}px ${s.textShadow.color}`;
        span.textContent = L.lines.join('\n');
        pb.append(span);
    }
}
let selBox = null;
function updateSel() {
    const p = placementOf(selected);
    if (!selBox) { selBox = document.createElement('div'); selBox.id = 'sel'; selBox.innerHTML = '<span class="rh"></span>'; }
    $('els').append(selBox);
    const show = p?.visible && element();
    selBox.hidden = !show;
    if (show) Object.assign(selBox.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px`, transform: element().style.rotate ? `rotate(${element().style.rotate}deg)` : '' });
}
function renderEls(only) {
    const layout = design.layouts[ratio], host = $('els');
    const wanted = layout.order.filter(key => element(key) && layout.placements[key]?.visible);
    for (const [key, node] of nodes) if (!wanted.includes(key)) { node.remove(); nodes.delete(key); }
    for (const key of wanted) {
        let node = nodes.get(key);
        if (!node) { node = document.createElement('div'); node.dataset.id = key; nodes.set(key, node); }
        if (!only || only.includes(key) || !node.firstChild) paint(node, element(key), layout.placements[key]);
        host.append(node);
    }
    updateSel();
}
function applyScale() {
    const [w, h] = size(), box = $('composition');
    const fit = Math.max(.05, Math.min((box.clientWidth - 36) / w, (box.clientHeight - 36) / h));
    scale = fit * zoom;
    Object.assign($('stage').style, { width: `${w * scale}px`, height: `${h * scale}px`, borderRadius: `${design.cornerRadius * scale}px` });
    Object.assign($('els').style, { width: `${w}px`, height: `${h}px`, transform: `scale(${scale})` });
    $('els').style.setProperty('--inv', String(1 / scale));
    $('zoom-fit').textContent = zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`;
}
new ResizeObserver(applyScale).observe($('composition'));
for (const [button, factor] of [['zoom-in', 1.25], ['zoom-out', .8]]) $(button).addEventListener('click', () => { zoom = Math.max(.25, Math.min(4, zoom * factor)); applyScale(); });
$('zoom-fit').addEventListener('click', () => { zoom = 1; applyScale(); });

// The backdrop is cached on the canvas and redrawn only when it changes (or per frame when animated).
let backdropKey = '', backdropBusy = false;
const startedAt = performance.now();
async function backdropFrame(now) {
    requestAnimationFrame(backdropFrame);
    if (backdropBusy) return;
    const bg = design.background;
    const animate = (bg.mode === 'pattern' || (bg.mode === 'gradient' && bg.motion === 'rotate')) && bg.motion !== 'none' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key = JSON.stringify([ratio, bg, design.theme, design.colors]);
    if (!animate && key === backdropKey) return;
    backdropBusy = true; backdropKey = key;
    try {
        const canvas = await makeBackdrop(design, ratio, animate ? (now - startedAt) / 1000 : 0);
        const target = $('preview');
        if (target.width !== canvas.width || target.height !== canvas.height) { target.width = canvas.width; target.height = canvas.height; }
        target.getContext('2d').drawImage(canvas, 0, 0);
    } catch (error) { status(error.message, true); }
    backdropBusy = false;
}
requestAnimationFrame(backdropFrame);

// ---- Layers ----
function renderLayers() {
    const layout = design.layouts[ratio];
    $('block-list').innerHTML = [...layout.order].reverse().map(key => {
        const item = element(key), p = layout.placements[key];
        if (!item) return '';
        const hidden = !p.visible;
        return `<div class="layer${key === selected ? ' selected' : ''}${hidden ? ' is-hidden' : ''}" data-id="${esc(key)}" data-select="${esc(key)}">
            <span class="layer-grip" title="Drag to reorder">${ICON.grip}</span><span class="layer-icon">${TYPE_META[item.type].icon}</span>
            <span class="layer-name">${esc(elementLabel(item))}</span>
            <span class="layer-actions"><button type="button" data-layer-action="lock" class="${item.locked ? 'on' : ''}" title="${item.locked ? 'Unlock' : 'Lock'}" aria-label="${item.locked ? 'Unlock' : 'Lock'} layer">${item.locked ? ICON.lock : ICON.unlock}</button>
            <button type="button" data-layer-action="visible" title="${hidden ? 'Show' : 'Hide'} in this format" aria-label="${hidden ? 'Show' : 'Hide'} layer">${hidden ? ICON.eyeOff : ICON.eye}</button></span></div>`;
    }).join('');
}
if (window.Sortable) new window.Sortable($('block-list'), {
    handle: '.layer-grip', animation: 120,
    onEnd: () => {
        design.layouts[ratio].order = [...$('block-list').children].map(row => row.dataset.id).reverse();
        changed(); renderLayers(); renderEls();
    }
});
$('block-list').addEventListener('click', event => {
    const row = event.target.closest('[data-select]');
    if (!row) return;
    const key = row.dataset.select, act = event.target.closest('[data-layer-action]')?.dataset.layerAction;
    if (act === 'lock') element(key).locked = !element(key).locked;
    else if (act === 'visible') placementOf(key).visible = !placementOf(key).visible;
    if (act) { changed(); selected = key; syncFields(); return; }
    select(key);
});
function select(key) {
    selected = key; renderLayers(); renderProps(); renderEls();
}
document.querySelectorAll('.menu-item-icon[data-icon]').forEach(node => { node.innerHTML = TYPE_META[node.dataset.icon]?.icon || ''; });
$('add-element').addEventListener('click', () => {
    const open = $('add-menu').classList.toggle('open');
    $('add-element').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
    if (!event.target.closest('#add-menu')) $('add-menu').classList.remove('open');
});
function addElement(type) {
    const item = M.createElement(type, `${type}-${uuid()}`);
    design.elements.push(item);
    for (const [format, layout] of Object.entries(design.layouts)) {
        layout.placements[item.id] = M.arrangement(format, layout.template, [item]).placements[item.id];
        layout.order.push(item.id);
    }
    selected = item.id; changed(); syncFields();
}
document.querySelectorAll('[data-add-element]').forEach(button => button.addEventListener('click', () => {
    $('add-menu').classList.remove('open'); addElement(button.dataset.addElement);
}));
function removeElement() {
    const item = element();
    if (!item) return;
    design.elements = design.elements.filter(current => current.id !== item.id);
    for (const layout of Object.values(design.layouts)) {
        delete layout.placements[item.id];
        layout.order = layout.order.filter(key => key !== item.id);
    }
    selected = roleElement('title')?.id || design.elements[0]?.id || '';
    changed(); syncFields();
}
function duplicateElement() {
    const source = element();
    if (!source) return;
    const copy = M.normalizeElement({ ...clone(source), id: `${source.type}-${uuid()}`, role: '', name: `${source.name} copy`, locked: false });
    design.elements.push(copy);
    for (const [format, layout] of Object.entries(design.layouts)) {
        const [w, h] = M.SIZES[format], from = layout.placements[source.id];
        layout.placements[copy.id] = { ...from, x: Math.min(w - from.width, from.x + 24), y: Math.min(h - from.height, from.y + 24) };
        layout.order.push(copy.id);
    }
    selected = copy.id; changed(); syncFields();
}

// ---- Properties (shared form helpers from the overlay editor) ----
function targetOf(item) {
    const p = placementOf(item.id), target = { style: item.style, qr: item.qr };
    for (const key of ['x', 'y', 'width', 'height', 'visible']) Object.defineProperty(target, key, { get: () => p[key], set: value => { p[key] = value; }, enumerable: true });
    for (const key of ['name', 'content', 'source']) Object.defineProperty(target, key, { get: () => item[key], set: value => { item[key] = value; }, enumerable: true });
    return target;
}
const structural = event => { const t = event?.target; return !t || t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'BUTTON' || (event.type === 'change' && !['number', 'text', 'range', 'color'].includes(t.type) && t.tagName !== 'TEXTAREA'); };
const seg2 = (path, label, value, options) => F.seg(path, label, value, options);
function textSections(item) {
    const s = item.style, g = s.textGradient;
    const fallback = design.colors[item.role === 'badge' ? 'accent' : ['subtitle', 'url'].includes(item.role) ? 'muted' : 'text'];
    const typography = `${F.select('style.fontFamily', 'Font', s.fontFamily, fontGroups())}
        <div class="grid2">${F.number('style.fontSize', 'Max size (px)', s.fontSize, { min: 8, max: 400 })}${F.select('style.fontWeight', 'Weight', String(s.fontWeight), [[300, 'Light'], [400, 'Normal'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']])}</div>
        ${seg2('style.fontStyle', 'Style', s.fontStyle, [['normal', 'Normal'], ['italic', 'Italic']])}
        <div class="grid2">${seg2('style.textAlign', 'Horizontal', s.textAlign, [['left', 'Align left', ICON.textLeft], ['center', 'Center', ICON.textCenter], ['right', 'Align right', ICON.textRight]])}${seg2('style.verticalAlign', 'Vertical', s.verticalAlign, [['top', 'Top', ICON.vTop], ['middle', 'Middle', ICON.vMiddle], ['bottom', 'Bottom', ICON.vBottom]])}</div>
        <div class="grid2">${F.number('style.lineHeight', 'Line height', s.lineHeight, { min: .5, max: 3, step: .1 })}${F.number('style.letterSpacing', 'Letter spacing', s.letterSpacing, { min: -10, max: 50, step: .5 })}</div>
        ${F.seg('style.textGradient.enabled', 'Text color', g.enabled ? 'true' : 'false', [['false', 'Solid color', 'Solid'], ['true', 'Gradient', 'Gradient']])}
        ${g.enabled ? `<div class="grid2">${F.select('style.textGradient.type', 'Type', g.type, [['linear', 'Linear'], ['radial', 'Radial']])}${g.type === 'radial' ? '<span></span>' : F.number('style.textGradient.angle', 'Angle', g.angle, { min: 0, max: 360 })}</div><div class="grid2">${F.color('style.textGradient.from', 'From', g.from)}${F.color('style.textGradient.to', 'To', g.to)}</div>` : F.color('style.color', 'Color', s.color || fallback)}`;
    const effects = `<div class="grid2">${F.number('style.textStroke.width', 'Outline (px)', s.textStroke.width, { min: 0, max: 20, step: .5 })}${s.textStroke.width > 0 ? F.color('style.textStroke.color', 'Outline color', s.textStroke.color) : '<span></span>'}</div>
        <div class="grid2">${F.number('style.textShadow.blur', 'Text shadow (px)', s.textShadow.blur, { min: 0, max: 60 })}${s.textShadow.blur > 0 ? F.color('style.textShadow.color', 'Shadow color', s.textShadow.color) : '<span></span>'}</div>`;
    const box = `${F.color('style.background', 'Background', s.background, { clear: true })}${boxBorder(s, true)}`;
    return F.section('p-typo', 'Typography', typography) + F.section('p-texteffects', 'Text effects', effects, false) + F.section('p-box', 'Background & border', box, false);
}
function boxBorder(s, padding = false) {
    return `<div class="grid2">${F.number('style.borderWidth', 'Border width', s.borderWidth, { min: 0, max: 40 })}${F.number('style.borderRadius', 'Corner radius', s.borderRadius, { min: 0, max: 300 })}</div>
        ${s.borderWidth > 0 ? F.color('style.borderColor', 'Border color', s.borderColor) : ''}
        ${padding ? F.number('style.padding', 'Padding (px)', s.padding, { min: 0, max: 200 }) : ''}
        <div class="grid2">${F.number('style.shadow.blur', 'Shadow (px)', s.shadow.blur, { min: 0, max: 100 })}${s.shadow.blur > 0 ? F.color('style.shadow.color', 'Shadow color', s.shadow.color) : '<span></span>'}</div>`;
}
function renderProps() {
    const item = element(), host = $('properties');
    if (!item) { host.innerHTML = '<div class="sect-body"><p class="hint">Select or add an element.</p></div>'; return; }
    const s = item.style, p = placementOf(item.id);
    const assetButtons = `<div class="asset-actions"><button data-library="selected-image" type="button">Library</button><button data-upload="selected-image" type="button">Upload</button><button data-igdb="selected-image" type="button">IGDB</button><button data-clear-asset="selected-image" type="button">Clear</button></div>`;
    let content = F.text('name', 'Layer name', item.name, 'maxlength="80"');
    if (item.type === 'text') content += item.source === 'channel-url' ? '<p class="hint">Shows your Twitch channel from the Content tab.</p>' : `<label class="field"><span>Text</span><textarea data-path="content" data-kind="text" maxlength="500" rows="3">${esc(item.content)}</textarea></label>`;
    if (item.type === 'qr') content += F.select('source', 'Encodes', item.source, [['channel-url', 'Twitch channel URL'], ['content', 'Custom text']]) + (item.source === 'content' ? F.text('content', 'Custom text', item.content, 'maxlength="500"') : '');
    if (item.type === 'icon') content += F.select('icon', 'Icon', item.icon, Object.keys(M.ICONS).map(k => [k, k[0].toUpperCase() + k.slice(1)]));
    if (item.type === 'image') content += `<p class="hint">${item.src ? esc(decodeURIComponent(item.src.split('/').pop())) : 'No image selected'}</p>${assetButtons}`;
    const align = ['left', 'center', 'right', 'top', 'middle', 'bottom'].map(m => `<button type="button" data-align="${m}" title="Align ${m} on canvas" aria-label="Align ${m} on canvas">${ICON['align' + m[0].toUpperCase() + m.slice(1)]}</button>`).join('');
    const layout = `<div class="grid2">${F.number('x', 'X (px)', Math.round(p.x), { min: 0, max: 3840 })}${F.number('y', 'Y (px)', Math.round(p.y), { min: 0, max: 2160 })}</div>
        <div class="grid2">${F.number('width', 'Width (px)', Math.round(p.width), { min: 1, max: 3840 })}${F.number('height', 'Height (px)', Math.round(p.height), { min: 1, max: 2160 })}</div>
        ${F.range('style.rotate', 'Rotation', s.rotate, { min: -180, max: 180, editable: true, reset: 0, unit: '°' })}
        <div class="sub-head">Align to canvas</div><div class="align-grid">${align}</div>
        ${F.check('visible', 'Show in this format', p.visible)}`;
    let specific = '';
    if (item.type === 'text') specific = textSections(item);
    else if (item.type === 'image') {
        const focus = s.objectFit === 'cover' && item.src ? `<div class="field focus-field"><span>Focus point</span><div class="focus-pick" data-focus-pick><img src="${esc(item.src)}" draggable="false"><i class="focus-dot" style="left:${s.focusX}%;top:${s.focusY}%"></i></div></div>` : '';
        specific = F.section('p-image', 'Image', `${F.select('style.objectFit', 'Fit', s.objectFit, [['cover', 'Fill (crop to fit)'], ['contain', 'Contain (letterbox)']])}${focus}${F.select('style.shape', 'Shape', s.shape, [['rounded', 'Rounded corners'], ['rectangle', 'Rectangle'], ['circle', 'Circle']])}${s.shape === 'rounded' ? F.number('style.borderRadius', 'Corner radius', s.borderRadius, { min: 0, max: 300 }) : ''}
            <div class="grid2">${F.number('style.borderWidth', 'Border width', s.borderWidth, { min: 0, max: 40 })}${s.borderWidth > 0 ? F.color('style.borderColor', 'Border color', s.borderColor) : '<span></span>'}</div>
            <div class="grid2">${F.number('style.shadow.blur', 'Shadow (px)', s.shadow.blur, { min: 0, max: 100 })}${s.shadow.blur > 0 ? F.color('style.shadow.color', 'Shadow color', s.shadow.color) : '<span></span>'}</div>`);
    } else if (item.type === 'shape') {
        specific = F.section('p-shape', 'Shape', `${F.select('style.shape', 'Form', s.shape, [['rounded', 'Rounded box'], ['rectangle', 'Box'], ['pill', 'Pill'], ['circle', 'Circle']])}${F.color('style.background', 'Fill', s.background)}
            ${s.shape === 'rounded' ? F.range('style.borderRadius', 'Corner radius', s.borderRadius, { min: 0, max: 300, editable: true, reset: 24, unit: 'px' }) : ''}
            <div class="grid2">${F.number('style.borderWidth', 'Border width', s.borderWidth, { min: 0, max: 40 })}${s.borderWidth > 0 ? F.color('style.borderColor', 'Border color', s.borderColor) : '<span></span>'}</div>
            <div class="grid2">${F.number('style.shadow.blur', 'Shadow (px)', s.shadow.blur, { min: 0, max: 100 })}${s.shadow.blur > 0 ? F.color('style.shadow.color', 'Shadow color', s.shadow.color) : '<span></span>'}</div>`);
    } else if (item.type === 'icon') {
        specific = F.section('p-icon', 'Icon', `${F.color('style.color', 'Color', s.color)}<div class="grid2">${F.number('style.shadow.blur', 'Shadow (px)', s.shadow.blur, { min: 0, max: 100 })}${s.shadow.blur > 0 ? F.color('style.shadow.color', 'Shadow color', s.shadow.color) : '<span></span>'}</div>`);
    } else {
        specific = F.section('p-qr', 'QR code', `<div class="grid2">${F.color('qr.fg', 'Foreground', item.qr.fg)}${F.color('qr.bg', 'Background', item.qr.bg)}</div>
            ${F.range('qr.margin', 'Quiet zone', item.qr.margin, { min: 0, max: 20, editable: true, reset: 4 })}${F.select('qr.ecc', 'Error correction', item.qr.ecc, [['L', 'Low'], ['M', 'Medium'], ['Q', 'Quartile'], ['H', 'High']])}${F.number('style.borderRadius', 'Corner radius', s.borderRadius, { min: 0, max: 200 })}
            <p class="hint">Keep it large with strong contrast so it scans after sharing.</p>`);
    }
    host.innerHTML = `<div class="props-head"><div class="props-title">${esc(elementLabel(item))}</div><span class="layer-actions">
        <button type="button" data-act="forward" title="Bring forward" aria-label="Bring forward">${ICON.up || '&uarr;'}</button><button type="button" data-act="backward" title="Send backward" aria-label="Send backward">${ICON.down || '&darr;'}</button>
        <button type="button" data-act="duplicate" title="Duplicate (Cmd/Ctrl+D)" aria-label="Duplicate">${ICON.copy}</button><button type="button" data-act="remove" title="Delete (Del)" aria-label="Delete element">${ICON.trash}</button></span></div>
        ${F.section('p-content', 'Content', content)}${F.section('p-layout', 'Size & position', layout)}${specific}
        ${F.section('p-opacity', 'Opacity', F.range('style.opacity', 'Opacity', s.opacity, { min: 0, max: 100, scale: .01, unit: '%', editable: true, reset: 100 }), true)}`;
}
bindFields($('properties'), () => { const item = element(); return item ? [targetOf(item)] : []; }, (path, event) => {
    const item = element(), p = placementOf(selected);
    if (!item) return;
    const [w, h] = size();
    p.width = Math.max(1, Math.min(w, p.width)); p.height = Math.max(1, Math.min(h, p.height));
    p.x = Math.max(0, Math.min(w - p.width, p.x)); p.y = Math.max(0, Math.min(h - p.height, p.y));
    changed(); renderEls([selected]); updateSel();
    if (path === 'content' && item.role && $(item.role)) $(item.role).value = item.content;
    if (['name', 'visible'].includes(path)) renderLayers();
    if (structural(event)) { renderProps(); renderLayers(); }
});
$('properties').addEventListener('click', event => {
    const act = event.target.closest('[data-act]')?.dataset.act, mode = event.target.closest('[data-align]')?.dataset.align;
    if (act === 'remove') removeElement();
    else if (act === 'duplicate') duplicateElement();
    else if (act === 'forward' || act === 'backward') {
        const order = design.layouts[ratio].order, i = order.indexOf(selected), next = i + (act === 'forward' ? 1 : -1);
        if (next < 0 || next >= order.length) return;
        [order[i], order[next]] = [order[next], order[i]];
        changed(); renderLayers(); renderEls();
    } else if (mode) {
        const p = placementOf(selected), [w, h] = size();
        const offset = alignmentOffset({ x: p.x, y: p.y, w: p.width, h: p.height }, { x: 0, y: 0, w, h }, mode);
        p.x = Math.round(p.x + offset.x); p.y = Math.round(p.y + offset.y);
        changed(); renderEls([selected]); renderProps();
    }
});

$('properties').addEventListener('pointerdown', event => {
    const pick = event.target.closest('[data-focus-pick]');
    if (!pick) return;
    const move = e => {
        const r = pick.getBoundingClientRect(), s = element().style;
        s.focusX = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) * 100 / r.width)));
        s.focusY = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) * 100 / r.height)));
        const dot = pick.querySelector('.focus-dot'); dot.style.left = `${s.focusX}%`; dot.style.top = `${s.focusY}%`;
        changed(); renderEls([selected]);
    };
    move(event);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
});

// ---- Style tab (theme-level look, shared form helpers) ----
function renderStyle() {
    const bg = design.background, m = bg.mode;
    const patterns = [
        { group: 'Geometric', options: [['grid', 'Grid'], ['geometry', 'Geometry'], ['orbits', 'Orbits'], ['hexagons', 'Hexagons'], ['diamonds', 'Diamonds'], ['isometric', 'Isometric tiles'], ['mesh', 'Curved mesh'], ['sunburst', 'Sunburst'], ['triangles', 'Triangles'], ['chevrons', 'Chevrons'], ['checker', 'Checkerboard']] },
        { group: 'Organic', options: [['waves', 'Waves'], ['rings', 'Concentric rings'], ['scales', 'Scales'], ['topography', 'Topographic contours']] },
        { group: 'Atmospheric', options: [['starfield', 'Starfield'], ['sparkles', 'Sparkles'], ['dots', 'Dots']] },
        { group: 'Playful & tech', options: [['confetti', 'Confetti'], ['circuit', 'Circuit board']] }
    ];
    let body = F.select('background.mode', 'Style', m, [['theme', 'Theme background'], ['solid', 'Solid color'], ['gradient', 'Gradient'], ['pattern', 'Pattern'], ['image', 'Image'], ['transparent', 'Transparent']]);
    if (['solid', 'pattern'].includes(m)) body += F.color('background.color', m === 'pattern' ? 'Base color' : 'Color', bg.color);
    if (m === 'gradient') body += `${F.select('background.gradientType', 'Type', bg.gradientType, [['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']])}
        ${bg.gradientType === 'radial' ? '' : F.range('background.angle', 'Angle', bg.angle, { min: 0, max: 360, editable: true, reset: 135, unit: '°' })}
        ${F.select('background.motion', 'Motion', ['rotate'].includes(bg.motion) ? 'rotate' : 'none', [['none', 'Still'], ['rotate', 'Rotating gradient']])}${bg.motion === 'rotate' ? F.range('background.speed', 'Loops per 6 s', bg.speed, { min: 1, max: 4, editable: true, reset: 1, unit: 'x' }) : ''}
        <div class="grid2">${F.color('background.color', 'From', bg.color)}${F.color('background.endColor', 'To', bg.endColor)}</div>${F.color('background.midColor', 'Middle (optional)', bg.midColor, { clear: true })}`;
    if (m === 'pattern') body += `${F.select('background.pattern', 'Pattern', bg.pattern, patterns)}${F.range('background.scale', 'Pattern scale', bg.scale, { min: 2, max: 800, step: 1, editable: true, reset: 100, unit: '%' })}
        ${F.select('background.motion', 'Motion', bg.motion, [['none', 'Still'], ['drift', 'Slow drift'], ['pulse', 'Soft pulse'], ['sweep', 'Light sweep'], ['aurora', 'Aurora ribbons'], ['flow', 'Sweeping gradient'], ['sway', 'Sway and zoom'], ['orbit', 'Orbit'], ['pan', 'Linear pan']])}
        ${bg.motion === 'none' ? '' : F.range('background.speed', 'Loops per 6 s', bg.speed, { min: 1, max: 4, editable: true, reset: 1, unit: 'x' })}
        ${bg.motion === 'pan' ? F.range('background.angle', 'Pan direction', bg.angle, { min: 0, max: 360, step: 5, editable: true, reset: 135, unit: '°' }) : ''}${['aurora', 'flow'].includes(bg.motion) ? `${F.color('background.endColor', 'Third ribbon color', bg.endColor)}<p class="hint">Ribbons use the palette accent and secondary colors. Motion loops seamlessly in preview and MP4 export.</p>` : ''}`;
    if (m === 'image') body += `<p class="hint" id="background-name">${bg.image ? esc(decodeURIComponent(bg.image.split('/').pop())) : 'No background image'}</p>
        <div class="asset-actions"><button data-library="background" type="button">Choose image</button><button data-upload="background" type="button">Upload</button><button data-clear-asset="background" type="button">Clear</button></div>
        ${F.select('background.fit', 'Fit', bg.fit, [['cover', 'Fill / crop'], ['contain', 'Contain']])}${F.range('background.shade', 'Darken', bg.shade, { min: 0, max: 100, editable: true, reset: 35, unit: '%' })}
        ${F.range('background.focusX', 'Crop X', bg.focusX, { min: 0, max: 100, unit: '%' })}${F.range('background.focusY', 'Crop Y', bg.focusY, { min: 0, max: 100, unit: '%' })}`;
    if (m === 'pattern' || m === 'theme') body += `${F.select('background.bar', 'Top accent bar', bg.bar, [['theme', 'Theme gradient'], ['custom', 'Custom colors'], ['none', 'Hidden']])}${bg.bar === 'custom' ? F.color('background.barColor', 'Bar start color', bg.barColor) + F.color('background.barEndColor', 'Bar end color', bg.barEndColor) : ''}`;
    if (m !== 'transparent') body += F.range('background.vignette', 'Edge vignette', bg.vignette, { min: 0, max: 100, editable: true, reset: 0, unit: '%' });
    const palette = Object.entries(design.colors).map(([key, value]) => F.color(`colors.${key}`, key[0].toUpperCase() + key.slice(1), value)).join('');
    $('style-fields').innerHTML = F.section('s-bg', 'Background', body) + F.section('s-frame', 'Frame & font', `${F.range('cornerRadius', 'Corner radius', design.cornerRadius, { min: 0, max: 300, editable: true, reset: 0, unit: 'px' })}${F.select('font', 'Promo font', design.font, fontGroups().slice(1))}`) + F.section('s-palette', 'Color palette', palette, false);
}
bindFields($('style-fields'), () => [design], (path, event) => {
    design.background = M.background(design.background, design.theme);
    changed(); renderEls();
    if (structural(event)) renderStyle();
    if (path === 'cornerRadius') applyScale();
});
$('stage').addEventListener('keydown', event => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const p = placementOf(selected);
    if (!delta || !p || element().locked) return;
    const [w, h] = size(), step = event.shiftKey ? 10 : 1;
    p.x = Math.max(0, Math.min(w - p.width, p.x + delta[0] * step));
    p.y = Math.max(0, Math.min(h - p.height, p.y + delta[1] * step));
    event.preventDefault(); changed(); renderEls([selected]); renderProps();
});

// ---- Drag & resize ----
function placementTargets(excludeId) {
    const [width, height] = size(), xs = [0, width / 2, width], ys = [0, height / 2, height];
    for (const item of design.elements) {
        const p = placementOf(item.id);
        if (item.id === excludeId || !p?.visible) continue;
        xs.push(p.x, p.x + p.width / 2, p.x + p.width);
        ys.push(p.y, p.y + p.height / 2, p.y + p.height);
    }
    return { xs, ys };
}
function renderSnapGuides(xs = [], ys = []) {
    const [width, height] = size();
    $('snap-guides').replaceChildren(...xs.map(x => Object.assign(document.createElement('i'), { className: 'promo-snap-guide vertical', style: `left:${x * 100 / width}%` })),
        ...ys.map(y => Object.assign(document.createElement('i'), { className: 'promo-snap-guide horizontal', style: `top:${y * 100 / height}%` })));
}
let drag = null;
$('els').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const resize = event.target.classList.contains('rh'), node = event.target.closest('.pe');
    if (!resize && !node) return;
    const key = resize ? selected : node.dataset.id;
    if (key !== selected) select(key);
    const p = placementOf(key);
    $('stage').focus({ preventScroll: true }); event.preventDefault();
    if (element(key).locked) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, box: { ...p }, resize, targets: placementTargets(key), moved: false };
    $('els').setPointerCapture(event.pointerId);
});
$('els').addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    let dx = (event.clientX - drag.x) / scale, dy = (event.clientY - drag.y) / scale;
    const p = placementOf(selected), [width, height] = size(), threshold = 8 / scale;
    let guideX = [], guideY = [];
    drag.moved = true;
    if (drag.resize) {
        let right = drag.box.x + drag.box.width + dx, bottom = drag.box.y + drag.box.height + dy;
        if (!event.altKey) {
            const sx = snapAxis([right], drag.targets.xs, threshold), sy = snapAxis([bottom], drag.targets.ys, threshold);
            right += sx.delta; bottom += sy.delta; guideX = sx.lines; guideY = sy.lines;
        }
        p.width = Math.max(10, Math.min(width - p.x, right - p.x)); p.height = Math.max(10, Math.min(height - p.y, bottom - p.y));
    } else {
        if (event.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
        let x = drag.box.x + dx, y = drag.box.y + dy;
        if (!event.altKey) {
            const sx = snapAxis([x, x + p.width / 2, x + p.width], drag.targets.xs, threshold), sy = snapAxis([y, y + p.height / 2, y + p.height], drag.targets.ys, threshold);
            x += sx.delta; y += sy.delta; guideX = sx.lines; guideY = sy.lines;
        }
        p.x = Math.max(0, Math.min(width - p.width, x)); p.y = Math.max(0, Math.min(height - p.height, y));
    }
    renderSnapGuides(guideX, guideY);
    if (drag.resize) renderEls([selected]);
    else Object.assign(nodes.get(selected).style, { left: `${p.x}px`, top: `${p.y}px` });
    updateSel();
});
for (const name of ['pointerup', 'pointercancel']) $('els').addEventListener(name, () => {
    if (!drag) return;
    const moved = drag.moved; drag = null; renderSnapGuides();
    if (moved) { changed(); renderEls([selected]); }
    renderProps();
});

// ---- Sync ----
function syncFields() {
    $('name').value = design.name;
    for (const key of ['title', 'subtitle', 'badge']) $(key).value = roleElement(key)?.content || '';
    $('url').value = design.url;
    $('template').value = design.layouts[ratio].template;
    document.querySelectorAll('[data-ratio]').forEach(tab => {
        tab.setAttribute('aria-selected', String(tab.dataset.ratio === ratio));
        tab.tabIndex = tab.dataset.ratio === ratio ? 0 : -1;
    });
    $('composition').setAttribute('aria-labelledby', `tab-${ratio}`);
    $('format-size').textContent = `${size().join(' x ')} px`;
    $('stage-hint').textContent = 'Drag to move / corner to resize / arrows nudge (Shift faster) / Alt bypasses snapping';
    for (const key of ['photo', 'artwork']) {
        const src = roleElement(key)?.src || '';
        $(key + '-name').textContent = src ? decodeURIComponent(src.split('/').pop()) : (key === 'photo' ? 'Add a photo' : 'Optional');
        renderAssetPreview($(`${key}-preview`), src, key);
    }
    renderStyle(); renderLayers(); renderProps(); applyScale();
    nodes.forEach(node => node.remove()); nodes.clear(); renderEls();
    updateDirty(); syncThemeSelection();
}
$('template').closest('label').querySelector('span').textContent = 'Starting composition';
document.addEventListener('keydown', event => {
    const mod = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    const typing = event.target.closest?.('input,textarea,select,[contenteditable]');
    if (mod && key === 's') { event.preventDefault(); action(() => save())(); }
    else if (mod && key === 'z' && !typing) { event.preventDefault(); stepHistory(event.shiftKey ? 1 : -1); }
    else if (mod && key === 'y' && !typing) { event.preventDefault(); stepHistory(1); }
    else if (mod && key === 'd' && !typing) { event.preventDefault(); duplicateElement(); }
    else if ((key === 'delete' || key === 'backspace') && !typing && !mod && !document.querySelector('dialog[open]')) { event.preventDefault(); removeElement(); }
});
$('undo').addEventListener('click', () => stepHistory(-1));
$('redo').addEventListener('click', () => stepHistory(1));
for (const key of ['name', 'title', 'subtitle', 'badge']) $(key).addEventListener('input', () => {
    if (key === 'name') design.name = $(key).value;
    else { const item = roleElement(key); if (item) item.content = $(key).value; }
    changed(); renderEls(); if (railTab === 'content') renderLayers();
    const sel = element();
    if (key !== 'name' && sel?.role === key) { const field = $('properties').querySelector('[data-path="content"]'); if (field) field.value = sel.content; }
});
$('url').addEventListener('input', () => { design.url = $('url').value; changed(); renderEls(); });
$('url').addEventListener('change', () => {
    try { design.url = M.twitchUrl($('url').value); $('url').value = design.url; changed(); renderEls(); }
    catch (error) { status(error.message, true); }
});

async function loadLibrary() {
    library = await request('/api/promos');
    if (!Array.isArray(library)) throw new Error('Invalid promo library response.');
    library.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || '') || 0) - (Date.parse(a.updatedAt || a.createdAt || '') || 0));
    $('saved').replaceChildren(new Option('Unsaved design', ''));
    for (const item of library) $('saved').appendChild(new Option(item.name, item.id));
    $('saved').value = id;
}

function contentSnapshot() {
    const snapshot = clone(design);
    snapshot.name = $('name').value;
    snapshot.url = $('url').value;
    return M.normalize(snapshot);
}

async function save(copy = false) {
    if (!ready) throw new Error('The promo library could not be loaded. Reload and resolve the library error before saving.');
    const snapshot = contentSnapshot();
    document.querySelector('main').inert = true;
    try {
        const result = await request(id && !copy ? `/api/promos/${id}` : '/api/promos', {
            method: id && !copy ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
        });
        id = result.id; design = M.normalize(result); dirty = false; resetHistory();
        rememberPromo(id);
        $('save-design').textContent = 'Save design';
        await loadLibrary();
        history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
        syncFields();
        status('Design saved. All three format arrangements are stored locally on your StreamPulse server.');
    } finally { document.querySelector('main').inert = false; }
}

function action(fn) {
    return async () => {
        try { await fn(); } catch (error) { status(error.message, true); }
    };
}


function builtinLook(theme) {
    return M.appearance({ theme, font: theme === 'matrix' ? 'monospace' : theme === 'gold' ? 'serif' : 'sans-serif', background: { mode: 'theme', vignette: 18 } });
}
const currentAppearance = () => M.appearance({ ...design, background: design.background });
function syncThemeSelection() {
    const signature = JSON.stringify(currentAppearance());
    const saved = customThemes.find(theme => JSON.stringify(M.appearance(theme)) === signature);
    $('theme').value = saved ? `saved:${saved.id}` : Object.keys(M.THEMES).find(theme => JSON.stringify(builtinLook(theme)) === signature) || 'custom';
}
function applyLook(style) {
    const look = M.appearance(style);
    design.theme = look.theme; design.colors = look.colors; design.font = look.font;
    design.background = look.background;
    changed(); syncFields();
}
$('theme').appendChild(new Option('Custom / current settings', 'custom'));
const builtinGroup = document.createElement('optgroup'); builtinGroup.label = 'Built-in themes';
for (const theme of Object.values(window.StudioThemes)) {
    if (theme.id === 'system') continue;
    builtinGroup.appendChild(new Option(theme.name, theme.id));
}
builtinGroup.append(new Option('Studio light', 'studio'), new Option('Ember', 'ember'));
$('theme').appendChild(builtinGroup);
$('theme').addEventListener('change', () => {
    const value = $('theme').value;
    if (value === 'custom') return;
    const style = value.startsWith('saved:') ? customThemes.find(theme => `saved:${theme.id}` === value) : builtinLook(value);
    if (style) applyLook(style);
});
async function loadThemes() {
    const data = await request('/api/promo-themes');
    if (!Array.isArray(data)) throw new Error('Invalid custom theme library response.');
    customThemes = data; themesReady = true;
    $('saved-theme-options')?.remove();
    const group = document.createElement('optgroup'); group.id = 'saved-theme-options'; group.label = 'Your themes';
    for (const theme of customThemes) group.appendChild(new Option(theme.name, `saved:${theme.id}`));
    if (customThemes.length) $('theme').appendChild(group);
    syncThemeSelection();
}
$('save-theme').addEventListener('click', action(async () => {
    if (!themesReady) await loadThemes();
    editingTheme = $('theme').value.startsWith('saved:') ? $('theme').value.slice(6) : '';
    themeSnapshot = currentAppearance();
    $('theme-target').replaceChildren(new Option('Choose a saved theme', ''));
    for (const theme of customThemes) $('theme-target').appendChild(new Option(theme.name, theme.id));
    $('theme-target').value = editingTheme;
    $('theme-name').value = customThemes.find(theme => theme.id === editingTheme)?.name || '';
    $('update-theme').hidden = $('delete-theme').hidden = !editingTheme;
    $('theme-status').textContent = '';
    $('theme-dialog').showModal(); $('theme-name').focus();
}));
$('close-theme').addEventListener('click', () => $('theme-dialog').close());
$('theme-target').addEventListener('change', () => {
    editingTheme = $('theme-target').value;
    $('update-theme').hidden = $('delete-theme').hidden = !editingTheme;
    if (editingTheme) $('theme-name').value = customThemes.find(theme => theme.id === editingTheme).name;
});
for (const operation of ['create', 'update', 'delete']) $(operation + '-theme').addEventListener('click', async () => {
    if (operation === 'delete' && !window.confirm('Delete this reusable theme? Existing promo designs keep their appearance.')) return;
    $('theme-dialog').querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
    try {
        const data = operation === 'delete' ? null : M.normalizeTheme({ ...themeSnapshot, name: $('theme-name').value });
        await request(`/api/promo-themes${operation === 'create' ? '' : `/${editingTheme}`}`, {
            method: { create: 'POST', update: 'PUT', delete: 'DELETE' }[operation],
            ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {})
        });
        await loadThemes(); $('theme-dialog').close();
        status(operation === 'delete' ? 'Custom theme deleted. Existing promos are unchanged.' : 'Custom theme saved for reuse across promos. Save your design separately to keep its edits.');
    } catch (error) { $('theme-status').textContent = error.message; }
    finally { $('theme-dialog').querySelectorAll('button,input,select').forEach(el => { el.disabled = false; }); }
});

function renderAssetPreview(host, url, label) {
    host.replaceChildren();
    if (url) {
        const image = new Image();
        image.src = url; image.alt = ''; image.loading = 'lazy';
        host.appendChild(image);
    } else {
        const mark = document.createElement('span');
        mark.textContent = label === 'photo' ? 'PHOTO' : 'LOGO';
        host.appendChild(mark);
    }
    host.classList.toggle('has-image', Boolean(url));
}

function changeRatio(next, focus = false) {
    ratio = next;
    try { localStorage.setItem('streampulse.promo.ratio', ratio); } catch { /* Optional view preference. */ }
    syncFields();
    if (focus) $(`tab-${ratio}`).focus();
}
$('promo-rail-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-rail-tab]');
    if (tab) selectRailTab(tab.dataset.railTab);
});
$('promo-rail-tabs').addEventListener('keydown', event => {
    const tabs = ['layers', 'content', 'appearance'], at = tabs.indexOf(railTab);
    const next = { ArrowLeft: tabs[(at + 2) % 3], ArrowRight: tabs[(at + 1) % 3], Home: tabs[0], End: tabs[2] }[event.key];
    if (next) { event.preventDefault(); selectRailTab(next, true); }
});
$('ratio-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-ratio]');
    if (tab) changeRatio(tab.dataset.ratio);
});
$('ratio-tabs').addEventListener('keydown', event => {
    const keys = Object.keys(M.SIZES), at = keys.indexOf(ratio);
    const next = { ArrowLeft: keys[(at + 2) % 3], ArrowRight: keys[(at + 1) % 3], Home: keys[0], End: keys[2] }[event.key];
    if (next) { event.preventDefault(); changeRatio(next, true); }
});

function applyLayout(template) {
    const current = design.layouts[ratio];
    const baseline = M.arrangement(ratio, current.template, design.elements);
    if (roleElement('artwork')?.src) baseline.placements.artwork.visible = true;
    if (JSON.stringify({ placements: current.placements, order: current.order }) !== JSON.stringify({ placements: baseline.placements, order: baseline.order }) && !window.confirm('Replace your layout edits in this format? Your content and other formats will not change.')) {
        $('template').value = current.template;
        return;
    }
    design.layouts[ratio] = M.arrangement(ratio, template, design.elements);
    if (roleElement('artwork')?.src) design.layouts[ratio].placements.artwork.visible = true;
    changed(); syncFields();
}
$('template').addEventListener('change', () => applyLayout($('template').value));
$('auto-layout').addEventListener('click', () => applyLayout($('template').value));

function renderAssets() {
    const query = $('asset-search').value.toLowerCase().trim();
    const filtered = assets.filter(asset => [asset.label, asset.name, ...(asset.tags || [])].some(value => value?.toLowerCase().includes(query)));
    $('asset-grid').replaceChildren();
    for (const asset of filtered) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'promo-asset';
        const image = new Image(); image.src = asset.url; image.alt = ''; image.loading = 'lazy';
        const label = document.createElement('span'); label.textContent = asset.label || asset.name;
        button.append(image, label); button.title = label.textContent;
        button.addEventListener('click', action(() => { useImage(asset.url); $('asset-dialog').close(); }));
        $('asset-grid').appendChild(button);
    }
    $('asset-status').textContent = filtered.length ? `${filtered.length} images` : 'No matching images. Upload a PNG, JPEG, WebP, GIF, or SVG.';
}
function useImage(url, target = assetTarget, format = ratio) {
    const image = M.assetUrl(url);
    if (target === 'background') {
        design.background.image = image;
        design.background.mode = 'image';
    } else {
        const key = target === 'selected-image' ? selected : target;
        const item = element(key);
        if (!item || item.type !== 'image') throw new Error('Select an image element before choosing an image.');
        item.src = image;
        const formats = item.role === 'artwork' ? Object.keys(M.SIZES) : [format];
        for (const layoutKey of formats) design.layouts[layoutKey].placements[key].visible = true;
    }
    changed(); syncFields();
}

$('asset-search').addEventListener('input', renderAssets);
$('close-assets').addEventListener('click', () => $('asset-dialog').close());
let igdbRevision = 0, igdbTarget = 'artwork', igdbResults = [];
function igdbButton(url, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'promo-asset';
    if (url) {
        const image = new Image();
        image.src = url; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        button.appendChild(image);
    }
    const text = document.createElement('span');
    text.textContent = label; button.title = label; button.appendChild(text);
    button.addEventListener('click', onClick);
    $('igdb-grid').appendChild(button);
}
function showGames() {
    $('igdb-back').hidden = true;
    $('igdb-grid').replaceChildren();
    $('igdb-status').textContent = igdbResults.length ? 'Choose a game to browse its artwork.' : 'No games found. Try another title.';
    for (const game of igdbResults) igdbButton(game.cover, `${game.name}${game.year ? ` (${game.year})` : ''}`, () => showGameMedia(game.id));
}
async function showGameMedia(gameId) {
    const revision = ++igdbRevision;
    $('igdb-grid').replaceChildren(); $('igdb-back').hidden = false;
    $('igdb-status').textContent = 'Loading game artwork...';
    try {
        const game = await request(`/api/promos/igdb/games/${encodeURIComponent(gameId)}`);
        if (revision !== igdbRevision) return;
        $('igdb-status').textContent = game.images.length ? `${game.name} / choose a cover, artwork, or screenshot.` : 'This game has no images on IGDB.';
        for (const [index, image] of game.images.entries()) igdbButton(image.url, `${image.kind} ${index + 1}`, async () => {
            const target = igdbTarget, current = design;
            $('igdb-status').textContent = 'Saving full-resolution artwork to your Asset Library...';
            $('igdb-dialog').querySelectorAll('button,input').forEach(el => { el.disabled = true; });
            try {
                const asset = await request('/api/promos/igdb/import', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId, imageId: image.imageId })
                });
                if (current === design) useImage(asset.url, target);
                else status('Artwork imported to the Asset Library. Choose Library to add it to this design.');
                $('igdb-dialog').close();
            } catch (error) { $('igdb-status').textContent = error.message; }
            finally { $('igdb-dialog').querySelectorAll('button,input').forEach(el => { el.disabled = false; }); }
        });
    } catch (error) {
        if (revision === igdbRevision) $('igdb-status').textContent = error.message;
    }
}

$('close-igdb').addEventListener('click', () => $('igdb-dialog').close());
$('igdb-dialog').addEventListener('close', () => { igdbRevision++; });
$('igdb-back').addEventListener('click', () => { igdbRevision++; showGames(); });
$('igdb-search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const revision = ++igdbRevision;
    $('igdb-grid').replaceChildren(); $('igdb-back').hidden = true;
    $('igdb-status').textContent = 'Searching IGDB...';
    try {
        const data = await request(`/api/promos/igdb/search?q=${encodeURIComponent($('igdb-query').value)}`);
        if (revision !== igdbRevision) return;
        igdbResults = data.results; showGames();
    } catch (error) { if (revision === igdbRevision) $('igdb-status').textContent = error.message; }
});

async function upload(file) {
    const target = assetTarget, format = ratio, current = design;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'].includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP, AVIF, GIF, or SVG image.');
    status('Uploading image...');
    const asset = await request('/api/custom-overlays/assets', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Asset-Name': file.name.replace(/[^\x20-\x7e]/g, '-') }, body: file });
    if (current === design) useImage(asset.url, target, format);
    else status('Image uploaded to the Asset Library. Choose Library to add it to this design.');
}
$('upload-file').addEventListener('change', action(async () => {
    const file = $('upload-file').files[0]; $('upload-file').value = '';
    if (file) await upload(file);
}));
document.addEventListener('paste', event => {
    if (event.target.closest('input,textarea,[contenteditable]')) return;
    const file = [...(event.clipboardData?.files || [])].find(item => item.type.startsWith('image/'));
    if (file) { event.preventDefault(); assetTarget = 'photo'; action(() => upload(file))(); }
});

$('save-design').addEventListener('click', action(() => save()));
$('duplicate').addEventListener('click', action(() => save(true)));
$('new-design').addEventListener('click', () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    design = M.normalize(); id = ''; dirty = false; resetHistory(); $('saved').value = '';
    $('save-design').textContent = 'Save design';
    history.replaceState(null, '', location.pathname); syncFields(); status('New promo. Add your title, channel URL, and images.');
});
$('saved').addEventListener('change', () => {
    const requested = $('saved').value;
    if (dirty && !window.confirm('Discard unsaved changes?')) { $('saved').value = id; return; }
    if (!requested) { $('saved').value = id; return; }
    const item = library.find(entry => entry.id === requested);
    if (!item) return;
    design = M.normalize(item); id = item.id; dirty = false; resetHistory();
    rememberPromo(id);
    $('save-design').textContent = 'Save design';
    history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
    syncFields(); status('Saved promo loaded.');
});
$('delete-design').addEventListener('click', action(async () => {
    if (!id) throw new Error('This design has not been saved yet.');
    if (!window.confirm('Delete this saved promo? Uploaded images will remain in the Asset Library.')) return;
    await request(`/api/promos/${id}`, { method: 'DELETE' });
    rememberPromo('');
    id = ''; design = M.normalize(); dirty = false; resetHistory();
    $('save-design').textContent = 'Save design';
    history.replaceState(null, '', location.pathname); await loadLibrary(); syncFields(); status('Promo deleted.');
}));
$('export').addEventListener('click', action(async () => {
    const snapshot = contentSnapshot();
    if (Object.values(snapshot.layouts).some(layout => snapshot.elements.some(item => item.type === 'qr' && layout.placements[item.id]?.visible)) && !snapshot.url) throw new Error('Enter your Twitch URL for the QR code, or hide the QR element in all three formats.');
    $('export').disabled = true;
    try {
        status('Preparing square, landscape, and portrait PNGs...');
        const { blob, name } = await exportPromos(snapshot);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = name;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        status(`PNGs exported: all three full-resolution arrangements in one ZIP. ${dirty ? 'Design changes are still unsaved.' : ''}`);
    } finally { $('export').disabled = false; }
}));
$('animation-export').addEventListener('click', action(async () => {
    const snapshot = contentSnapshot(), format = ratio;
    if (snapshot.elements.some(item => item.type === 'qr' && snapshot.layouts[format].placements[item.id]?.visible) && !snapshot.url) throw new Error('Enter your Twitch URL for the QR code, or hide the QR element in this format.');
    const button = $('animation-export');
    button.disabled = true;
    try {
        status(`Rendering a six-second ${format} MP4 loop...`);
        const { blob, name } = await exportAnimation(snapshot, format, {
            onProgress: (complete, total) => {
                if (complete === total || complete % 20 === 0) status(`Rendering MP4 frame ${complete} of ${total}...`);
            }
        });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        status(`Seamless ${format} MP4 exported at full resolution. ${dirty ? 'Design changes are still unsaved.' : ''}`);
    } finally { button.disabled = false; }
}));
async function updateAnimationExport() {
    const button = $('animation-export');
    button.disabled = true;
    try {
        const supported = await supportsMp4();
        button.disabled = !supported;
        $('animation-hint').textContent = supported
            ? 'Six-second seamless loop of this format, at full resolution.'
            : 'MP4 export needs a recent Safari, Chrome, or Edge browser with H.264 encoding support.';
    } catch (error) {
        button.disabled = true;
        $('animation-hint').textContent = 'MP4 support could not be checked. Reload the editor and try again.';
        status(error.message, true);
    }
}
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
await (async () => {
    try {
        await loadLibrary();
        ready = true;
        const uploaded = await fontAssets();
        if (uploaded.length) {
            uploadedFonts.push(...uploaded.map(font => font.family));
        }
        const requested = new URLSearchParams(location.search).get('id');
        const preferred = requested || rememberedPromo();
        let item = library.find(entry => entry.id === preferred);
        if (requested) {
            if (!item) throw new Error('Saved promo not found. Use New promo to start a design.');
        } else if (!item && library.length) {
            item = library[0];
        }
        if (item) {
            design = M.normalize(item); id = item.id; $('saved').value = id;
            rememberPromo(id);
        } else {
            id = ''; rememberPromo('');
        }
        $('save-design').textContent = 'Save design';
        resetHistory(); syncFields(); status(id ? 'Ready. Your saved promo is loaded.' : 'Ready. Add a headline and photo; export includes all three sizes.');
        await loadThemes();
        await updateAnimationExport();
    } catch (error) { status(error.message, true); }
})();

document.addEventListener('click', event => {
    const button = event.target.closest('[data-library],[data-igdb],[data-upload],[data-clear-asset]');
    if (!button) return;
    const d = button.dataset;
    if (d.upload) { assetTarget = d.upload; $('upload-file').click(); }
    else if (d.igdb) {
        igdbTarget = d.igdb; igdbRevision++;
        $('igdb-grid').replaceChildren(); $('igdb-back').hidden = true;
        $('igdb-status').textContent = 'Search IGDB for a game. Uses your configured Twitch client credentials.';
        $('igdb-dialog').showModal(); $('igdb-query').focus();
    } else if (d.library) action(async () => {
        assetTarget = d.library; assets = []; $('asset-grid').replaceChildren(); $('asset-search').value = '';
        $('asset-status').textContent = 'Loading images...'; $('asset-dialog').showModal();
        try {
            const data = await request('/api/custom-overlays/assets');
            if (!Array.isArray(data)) throw new Error('Invalid image library response.');
            assets = data.filter(asset => asset.kind === 'image'); renderAssets();
        } catch (error) { $('asset-status').textContent = error.message; }
    })();
    else if (d.clearAsset === 'background') { design.background.image = ''; design.background.mode = 'theme'; changed(); syncFields(); }
    else {
        const item = element(d.clearAsset === 'selected-image' ? selected : d.clearAsset);
        if (item?.type === 'image') {
            item.src = '';
            if (item.role !== 'photo') for (const layout of Object.values(design.layouts)) layout.placements[item.id].visible = false;
        }
        changed(); syncFields();
    }
});
