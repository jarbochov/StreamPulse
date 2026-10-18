/**
 * StreamPulse Custom Overlay Editor — Main Controller & Entry Point
 */

import {
    $, esc, clamp, state, prefs, savePrefs, snapshot, pushHistory, flushHistory,
    undo, redo, restore, updateHistoryUI, setSelection, groupSelection, ungroupSelection,
    normalizeZ, normalizeLoaded, ensureCurPage, defaultPages, pagesOn, byId,
    selectedElements, primary, visibleElements, withGroups, boundsOf, boxOf,
    visualBoxOf, scaleSnapshot, applyScale, uid, createElementData, toast,
    changed, registerRenderAll, registerFitView, registerSelectionChange,
    registerStatusBar, params, initialId, LIMITS, MIN_SIZE, ICON, TEXT_TYPES,
    liveSignature, displayName, setStyleClipboard, getStyleClipboard
} from './editor-state.js';

import {
    stage, applyView, zoomAt, fitView, toLogical, syncCanvasUI,
    renderCanvas, renderSelectionUI, showGuides, initCanvasGestures,
    tickPlaceholders
} from './editor-canvas.js';

import {
    renderLayers, renderPageBar, updateLayerSelection, setRailTab,
    initLayersAndPages, registerLayerCallbacks, duplicatePage, deletePage,
    switchEditPage, livePage, refreshLivePage
} from './editor-layers.js';

import {
    renderSettings, renderProperties, syncGeometryInputs,
    initInspectorEvents, registerInspectorCallbacks, loadAssetTags
} from './editor-inspector.js';

const shared = window.OverlayShared || {};
window.editorState = state;

// ---- Status Bar -------------------------------------------------------------------
export function updateStatusBar() {
    const items = selectedElements();
    let text = 'Nothing selected';
    if (items.length === 1) {
        const b = boxOf(items[0]);
        text = `${displayName(items[0])} — X ${Math.round(b.x)}  Y ${Math.round(b.y)}  ·  ${Math.round(b.w)} × ${Math.round(b.h)}${items[0].locked ? '  ·  locked' : ''}`;
    } else if (items.length > 1) {
        text = `${items.length} elements selected`;
    }
    const statusEl = $('status-info');
    if (statusEl) statusEl.textContent = text;
}

// ---- Selection Change Callback ----------------------------------------------------
function onSelectionChange({ light = false } = {}) {
    renderSelectionUI();
    updateLayerSelection();
    updateStatusBar();
    if (!light) renderProperties();
}

// ---- Scale Selection By -----------------------------------------------------------
export function scaleSelectionBy(percent) {
    const items = selectedElements(), snaps = scaleSnapshot(items);
    if (!snaps.length || !(percent > 0)) return;
    const b = boundsOf(items), f = percent / 100;
    applyScale(snaps, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, f, f);
    renderCanvas();
    renderSelectionUI();
    changed(true);
    renderProperties();
    updateStatusBar();
}

// ---- Selection & Action Helpers ---------------------------------------------------
export function addElement(type, overrides = {}) {
    const el = createElementData(type, overrides);
    state.overlay.elements.push(el);
    normalizeZ();
    renderCanvas();
    renderLayers();
    setSelection([el.id]);
    changed(true);
    return el;
}

export function deleteSelection() {
    const targets = selectedElements().filter(el => !el.locked);
    if (!targets.length) {
        if (state.selectedIds.size) toast('Locked layers can’t be deleted. Unlock them first.', 'warn');
        return;
    }
    const ids = new Set(targets.map(el => el.id));
    state.overlay.elements = state.overlay.elements.filter(el => !ids.has(el.id));
    state.selectedIds = new Set([...state.selectedIds].filter(id => !ids.has(id)));
    normalizeZ();
    renderCanvas();
    renderLayers();
    renderProperties();
    updateStatusBar();
    changed(true);
}

export function duplicateSelection(source = selectedElements()) {
    if (!source.length) return;
    const groupMap = new Map();
    const clones = source.map(el => {
        const copy = JSON.parse(JSON.stringify(el));
        copy.id = uid(el.type);
        if (el.group) {
            if (!groupMap.has(el.group)) groupMap.set(el.group, uid('group'));
            copy.group = groupMap.get(el.group);
        }
        copy.x += 24;
        copy.y += 24;
        copy.name = el.name ? `${el.name} copy` : '';
        copy.locked = false;
        return copy;
    });
    state.overlay.elements.push(...clones);
    normalizeZ();
    renderCanvas();
    renderLayers();
    setSelection(clones.map(c => c.id));
    changed(true);
}

export function copySelection() {
    const items = selectedElements();
    if (!items.length) return;
    try {
        localStorage.setItem('streampulse.overlayEditor.clipboard', JSON.stringify(items));
        toast(`Copied ${items.length} element${items.length > 1 ? 's' : ''}`, 'info', 1200);
    } catch {}
}

export function pasteClipboard() {
    try {
        const items = JSON.parse(localStorage.getItem('streampulse.overlayEditor.clipboard') || '[]');
        if (items.length) {
            duplicateSelection(items.map(item => (pagesOn() && item.page !== '*' ? { ...item, page: state.curPage } : item)));
        }
    } catch {}
}

export function reorder(direction) {
    const sel = new Set(state.selectedIds), arr = state.overlay.elements;
    if (!sel.size) return;
    if (direction === 'front') state.overlay.elements = [...arr.filter(e => !sel.has(e.id)), ...arr.filter(e => sel.has(e.id))];
    else if (direction === 'back') state.overlay.elements = [...arr.filter(e => sel.has(e.id)), ...arr.filter(e => !sel.has(e.id))];
    else if (direction === 'forward') {
        for (let i = arr.length - 2; i >= 0; i--) {
            if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
    } else {
        for (let i = 1; i < arr.length; i++) {
            if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
    }
    normalizeZ();
    renderCanvas();
    renderLayers();
    changed(true);
}

export function copySelectionStyle() {
    const items = selectedElements();
    const primaryEl = items[0];
    if (!primaryEl) return;
    setStyleClipboard({
        style: JSON.parse(JSON.stringify(primaryEl.style || {})),
        mediaFilter: primaryEl.mediaFilter ? JSON.parse(JSON.stringify(primaryEl.mediaFilter)) : null
    });
    toast('Style copied (borders, filters, gradients & shadows)', 'info', 1200);
}

export function pasteSelectionStyle() {
    const clip = getStyleClipboard();
    if (!clip) {
        toast('No style copied yet (use Copy Style first)', 'warn', 1500);
        return;
    }
    const items = selectedElements().filter(el => !el.locked);
    if (!items.length) return;
    items.forEach(el => {
        el.style = { ...el.style, ...JSON.parse(JSON.stringify(clip.style)) };
        if (clip.mediaFilter) {
            el.mediaFilter = JSON.parse(JSON.stringify(clip.mediaFilter));
        }
    });
    renderCanvas();
    renderProperties();
    changed(true);
    toast(`Style pasted to ${items.length} element${items.length > 1 ? 's' : ''}`, 'ok', 1200);
}

export function runAction(act) {
    const items = selectedElements();
    if (!items.length) return;
    if (act === 'delete') deleteSelection();
    else if (act === 'duplicate') duplicateSelection();
    else if (act === 'copy-style') copySelectionStyle();
    else if (act === 'paste-style') pasteSelectionStyle();
    else if (act === 'preset') openSavePreset();
    else if (act === 'group') groupSelection();
    else if (act === 'ungroup') ungroupSelection();
    else if (['front', 'forward', 'backward', 'back'].includes(act)) reorder(act);
    else if (act === 'lock') {
        const next = !items.every(el => el.locked);
        items.forEach(el => { el.locked = next; });
        renderLayers();
        renderCanvas();
        renderProperties();
        updateStatusBar();
        changed(true);
    } else if (act === 'hide') {
        const next = items.every(el => el.visible === false);
        items.forEach(el => { el.visible = next; });
        renderLayers();
        renderCanvas();
        renderProperties();
        changed(true);
    }
}

export function alignSelection(mode) {
    const items = selectedElements().filter(el => !el.locked);
    if (!items.length) return;
    const relative = items.length > 1 && prefs.alignTo === 'selection'
        ? boundsOf(items)
        : { x: 0, y: 0, w: state.overlay.canvas.width, h: state.overlay.canvas.height };
    for (const el of items) {
        const b = visualBoxOf(el);
        if (mode === 'left') el.x += relative.x - b.x;
        else if (mode === 'center') el.x += (relative.x + (relative.w - b.w) / 2) - b.x;
        else if (mode === 'right') el.x += (relative.x + relative.w - b.w) - b.x;
        else if (mode === 'top') el.y += relative.y - b.y;
        else if (mode === 'middle') el.y += (relative.y + (relative.h - b.h) / 2) - b.y;
        else el.y += (relative.y + relative.h - b.h) - b.y;
        el.x = Math.round(el.x);
        el.y = Math.round(el.y);
    }
    let guideX = [], guideY = [];
    if (mode === 'left') guideX = [relative.x];
    else if (mode === 'center') guideX = [relative.x + relative.w / 2];
    else if (mode === 'right') guideX = [relative.x + relative.w];
    else if (mode === 'top') guideY = [relative.y];
    else if (mode === 'middle') guideY = [relative.y + relative.h / 2];
    else if (mode === 'bottom') guideY = [relative.y + relative.h];
    showGuides(guideX, guideY);
    clearTimeout(alignSelection._timer);
    alignSelection._timer = setTimeout(() => showGuides(), 800);
    renderCanvas();
    syncGeometryInputs();
    updateStatusBar();
    changed(true);
}

export function distributeSelection(axis) {
    const items = selectedElements().filter(el => !el.locked);
    if (items.length < 3) return;
    const horizontal = axis === 'h';
    const sorted = items.slice().sort((a, b) => horizontal ? visualBoxOf(a).x - visualBoxOf(b).x : visualBoxOf(a).y - visualBoxOf(b).y);
    const size = el => horizontal ? visualBoxOf(el).w : visualBoxOf(el).h;
    const start = horizontal ? visualBoxOf(sorted[0]).x : visualBoxOf(sorted[0]).y;
    const lastEl = sorted[sorted.length - 1];
    const end = (horizontal ? visualBoxOf(lastEl).x : visualBoxOf(lastEl).y) + size(lastEl);
    const gap = (end - start - sorted.reduce((sum, el) => sum + size(el), 0)) / (sorted.length - 1);
    let cursor = start;
    for (const el of sorted) {
        const b = visualBoxOf(el);
        if (horizontal) el.x += Math.round(cursor - b.x);
        else el.y += Math.round(cursor - b.y);
        cursor += size(el) + gap;
    }
    renderCanvas();
    syncGeometryInputs();
    changed(true);
}

// ---- Asset Uploads & Drag-and-Drop -------------------------------------------------
const UPLOAD_TYPES = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown'
};

export async function uploadAsset(file) {
    if (file.size > 100 * 1024 * 1024) throw new Error('That file is larger than the 100 MB limit.');
    const type = UPLOAD_TYPES[(file.name.split('.').pop() || '').toLowerCase()] || file.type;
    if (!Object.values(UPLOAD_TYPES).includes(type)) {
        throw new Error(`${file.name}: only PNG, JPEG, GIF, WebP, SVG, MP4, WebM, OGG, TTF, OTF, WOFF, WOFF2, TXT and MD files are supported.`);
    }
    let response;
    try {
        response = await fetch('/api/custom-overlays/assets', {
            method: 'POST',
            headers: { 'Content-Type': type, 'X-Asset-Name': file.name.replace(/[^\x20-\x7e]+/g, '-') },
            body: file
        });
    } catch {
        throw new Error('Upload failed. Is the StreamPulse server running?');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Asset upload failed');
    return data.url;
}

export function fitToMedia(el, url, type) {
    return new Promise(resolve => {
        const probe = document.createElement(type === 'video' ? 'video' : 'img');
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            if (type === 'video') {
                try { probe.pause(); probe.removeAttribute('src'); probe.load(); } catch {}
            }
            resolve();
        };
        probe.onerror = done;
        const onSize = (w, h) => {
            if (!w || !h) return done();
            const scale = Math.min(1, 960 / w, 540 / h);
            el.width = Math.max(MIN_SIZE, Math.round(w * scale));
            el.height = Math.max(MIN_SIZE, Math.round(h * scale));
            el.x = Math.round((state.overlay.canvas.width - el.width) / 2);
            el.y = Math.round((state.overlay.canvas.height - el.height) / 2);
            done();
        };
        if (type === 'video') {
            probe.preload = 'metadata';
            probe.onloadedmetadata = () => onSize(probe.videoWidth, probe.videoHeight);
        } else {
            probe.onload = () => onSize(probe.naturalWidth, probe.naturalHeight);
        }
        probe.src = url;
        setTimeout(done, 4000);
    });
}

export async function addMediaFiles(files, point) {
    for (const file of files) {
        try {
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const url = await uploadAsset(file);
            const el = createElementData(type, { src: url });
            await fitToMedia(el, url, type);
            if (point) {
                el.x = Math.round(point.x - el.width / 2);
                el.y = Math.round(point.y - el.height / 2);
            }
            state.overlay.elements.push(el);
            normalizeZ();
            renderCanvas();
            renderLayers();
            setSelection([el.id]);
            changed(true);
        } catch (error) {
            toast(error.message, 'error', 5000);
        }
    }
}

// ---- Asset Picker Dialog ----------------------------------------------------------
const assetDialog = $('asset-dialog'), assetGrid = $('asset-grid'), assetSearch = $('asset-search');
let libraryAssets = [], pickerTarget = null, assetTagFilter = '';
const tagFilterMatch = window.TagChips?.matches || (() => true);

function renderTagChips(container, assets, active, query) {
    if (!container || !window.TagChips) return;
    container.innerHTML = assets.some(asset => (asset.tags || []).length)
        ? window.TagChips.html(assets, { active, query })
        : '';
}

export function renderAssetGrid() {
    const el = state.overlay.elements.find(item => item.id === pickerTarget);
    if (!el || !assetGrid) return;
    if (shared.cleanupMedia) shared.cleanupMedia(assetGrid);
    const query = assetSearch ? assetSearch.value.trim().toLowerCase() : '';
    const wanted = TEXT_TYPES.has(el.type) ? 'text' : el.type === 'video' ? 'video' : 'image';
    const current = TEXT_TYPES.has(el.type) ? el.source?.path : el.type === 'alert' ? el.alert?.sampleImage : el.src;
    const matches = libraryAssets.filter(asset => asset.kind === wanted && asset.label.toLowerCase().includes(query) && tagFilterMatch(asset, assetTagFilter));
    renderTagChips($('asset-tags'), libraryAssets.filter(asset => asset.kind === wanted), assetTagFilter, $('asset-tag-q')?.value || '');
    assetGrid.innerHTML = matches.length
        ? matches.map(asset => `<button type="button" class="asset-tile" data-url="${esc(asset.url)}" ${asset.url === current ? 'aria-current="true"' : ''} title="${esc(asset.label)}"><span class="thumb">${asset.kind === 'text' ? '<span style="font-size:2rem">¶</span>' : asset.kind === 'video' ? `<video src="${esc(asset.url)}" muted preload="none"></video>` : `<img src="${esc(asset.url)}" loading="lazy" decoding="async" alt="">`}</span><span class="cap">${esc(asset.label)}</span></button>`).join('')
        : `<p class="hint">No ${wanted} assets${query ? ' match your filter' : ' uploaded yet — use the Upload field'}.</p>`;
}

export async function openAssetPicker(targetId) {
    const el = targetId ? byId(targetId) : primary();
    if (!el || !['image', 'video', 'pattern', 'alert', ...TEXT_TYPES].includes(el.type)) return;
    pickerTarget = el.id;
    const titleEl = $('asset-title');
    if (titleEl) titleEl.textContent = TEXT_TYPES.has(el.type) ? 'Choose a text or Markdown file' : `Choose ${el.type === 'video' ? 'a video' : 'an image'}`;
    if (assetSearch) assetSearch.value = '';
    if ($('asset-tag-q')) $('asset-tag-q').value = '';
    assetTagFilter = '';
    if (assetGrid) {
        if (shared.cleanupMedia) shared.cleanupMedia(assetGrid);
        assetGrid.innerHTML = '<p class="hint">Loading…</p>';
    }
    if (assetDialog) assetDialog.showModal();
    try {
        const response = await fetch('/api/custom-overlays/assets', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        libraryAssets = await response.json();
        renderAssetGrid();
    } catch {
        if (assetGrid) assetGrid.innerHTML = '<p class="hint">Could not load assets. Is the StreamPulse server running?</p>';
    }
}

// ---- Slideshow Picker Dialog ------------------------------------------------------
const slideDialog = $('slide-dialog'), slideGrid = $('slide-grid');
let slideTagFilter = '', slidePicked = new Set(), slideShown = [];

export function renderSlideGrid() {
    const el = state.overlay.elements.find(item => item.id === pickerTarget);
    if (!el || !slideGrid) return;
    if (shared.cleanupMedia) shared.cleanupMedia(slideGrid);
    const kinds = el.slideshow?.kinds || 'image';
    const pool = libraryAssets.filter(asset => kinds === 'both' ? ['image', 'video'].includes(asset.kind) : asset.kind === (kinds === 'video' ? 'video' : 'image'));
    const query = $('slide-search')?.value.trim().toLowerCase() || '';
    slideShown = pool.filter(asset => asset.label.toLowerCase().includes(query) && tagFilterMatch(asset, slideTagFilter));
    renderTagChips($('slide-tags'), pool, slideTagFilter, $('slide-tag-q')?.value || '');
    slideGrid.innerHTML = slideShown.length
        ? slideShown.map(asset => `<button type="button" class="asset-tile" data-name="${esc(asset.name)}" aria-pressed="${slidePicked.has(asset.name)}" title="${esc(asset.label)}"><span class="thumb">${asset.kind === 'video' ? `<video src="${esc(asset.url)}" muted preload="none"></video>` : `<img src="${esc(asset.url)}" loading="lazy" decoding="async" alt="">`}</span><span class="cap">${esc(asset.label)}</span></button>`).join('')
        : '<p class="hint">Nothing here. Upload in the Asset Library, or change the filter.</p>';
    if ($('slide-picked')) $('slide-picked').textContent = `${slidePicked.size} selected`;
}

export async function openSlidePicker() {
    const el = primary();
    if (!el || el.type !== 'slideshow') return;
    pickerTarget = el.id;
    slidePicked = new Set(el.slideshow?.files || []);
    slideTagFilter = '';
    if ($('slide-search')) $('slide-search').value = '';
    if ($('slide-tag-q')) $('slide-tag-q').value = '';
    if (slideGrid) {
        if (shared.cleanupMedia) shared.cleanupMedia(slideGrid);
        slideGrid.innerHTML = '<p class="hint">Loading…</p>';
    }
    if (slideDialog) slideDialog.showModal();
    await loadAssetTags();
    renderSlideGrid();
}

// ---- Presets System ---------------------------------------------------------------
const presetDialog = $('preset-dialog'), presetSaveDialog = $('preset-save-dialog');
let userPresets = [], presetCategory = 'All';

async function loadUserPresets() {
    try {
        const response = await fetch('/api/overlay-presets', { cache: 'no-store' });
        userPresets = response.ok ? await response.json() : [];
    } catch {
        userPresets = [];
    }
}

const allPresets = () => [...(window.OverlayPresets?.list() || []), ...userPresets];
const presetAvailable = preset => !preset.requires || (preset.requires === 'weather' ? state.liveStatus.weather?.enabled : true);

function presetThumb(preset) {
    const parts = preset.elements.map(el => {
        const s = el.style || {};
        const rect = `x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"`;
        if (el.type === 'shape') {
            const fill = s.shape === 'ellipse' || s.background === 'transparent' ? (s.fill || s.background) : s.background;
            const stroke = s.borderWidth ? `stroke="${esc(s.borderColor)}" stroke-width="${s.borderWidth}"` : '';
            return s.shape === 'ellipse'
                ? `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${esc(fill)}" ${stroke}/>`
                : `<rect ${rect} rx="${s.borderRadius || 0}" fill="${esc(fill)}" ${stroke}/>`;
        }
        if (el.type === 'text' || el.type === 'random-text' || el.type === 'markdown') {
            const size = Math.min(s.fontSize || 24, el.height);
            const anchor = s.textAlign === 'center' ? 'middle' : s.textAlign === 'right' ? 'end' : 'start';
            const x = s.textAlign === 'center' ? el.x + el.width / 2 : s.textAlign === 'right' ? el.x + el.width : el.x;
            const y = s.verticalAlign === 'top' ? el.y + size * 0.6 : el.y + el.height / 2;
            const label = String(shared.expandVariables ? shared.expandVariables(String(el.content ?? '').split('\n')[0], state.liveStatus, {}, true) : el.content || '').slice(0, 60);
            return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${s.fontWeight || 400}" fill="${esc(s.color || '#fff')}" text-anchor="${anchor}" dominant-baseline="middle" font-family="sans-serif">${esc(label)}</text>`;
        }
        if (el.type === 'progress') {
            return `<rect ${rect} rx="${el.height / 2}" fill="rgba(255,255,255,0.25)"/><rect x="${el.x}" y="${el.y}" width="${el.width * 0.6}" height="${el.height}" rx="${el.height / 2}" fill="${esc(s.color || '#3fb950')}"/>`;
        }
        return `<rect ${rect} fill="rgba(128,128,128,0.25)" stroke="#8b949e" stroke-dasharray="6 4" stroke-width="2"/>`;
    }).join('');
    return `<svg viewBox="-8 -8 ${preset.width + 16} ${preset.height + 16}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g>${parts}</g></svg>`;
}

export function renderPresets() {
    const query = $('preset-search')?.value.trim().toLowerCase() || '';
    const available = allPresets().filter(presetAvailable);
    const categories = ['All', ...new Set(available.map(preset => preset.category))];
    if (!categories.includes(presetCategory)) presetCategory = 'All';
    if ($('preset-cats')) {
        $('preset-cats').innerHTML = categories.map(name => `<button type="button" data-cat="${esc(name)}" aria-pressed="${name === presetCategory}">${esc(name)}</button>`).join('');
    }
    const matches = available.filter(preset => (presetCategory === 'All' || preset.category === presetCategory) && `${preset.name} ${preset.category} ${preset.description || ''}`.toLowerCase().includes(query));
    if ($('preset-grid')) {
        $('preset-grid').innerHTML = matches.length
            ? matches.map(preset => `<div class="preset-card-wrap" style="position:relative"><button type="button" class="preset-card" data-preset-id="${esc(preset.id)}" style="width:100%"><span class="thumb">${presetThumb(preset)}</span><span class="cap"><strong>${esc(preset.name)}</strong><small>${esc(preset.description || `${preset.elements.length} element${preset.elements.length > 1 ? 's' : ''}`)}</small></span></button>${preset.builtin ? '' : `<button type="button" class="del danger" data-del-preset="${esc(preset.id)}" title="Delete this preset" aria-label="Delete preset ${esc(preset.name)}">×</button>`}</div>`).join('')
            : '<p class="hint">No presets match.</p>';
    }
    const hidden = allPresets().some(preset => !presetAvailable(preset));
    if ($('preset-note')) {
        $('preset-note').hidden = !hidden;
        if (hidden) $('preset-note').textContent = 'Weather presets are hidden because weather is turned off. Enable it in the Config Editor to use them.';
    }
}

export async function openPresets() {
    if ($('preset-search')) $('preset-search').value = '';
    await loadUserPresets();
    renderPresets();
    presetDialog?.showModal();
}

export function placePreset(preset) {
    const sharedGroup = uid('group');
    const groupMap = new Map();
    const originX = Math.round(state.overlay.canvas.width / 2 - preset.width / 2);
    const originY = Math.round(state.overlay.canvas.height / 2 - preset.height / 2);
    const made = preset.elements.map((def, index) => {
        const copy = JSON.parse(JSON.stringify(def));
        const base = createElementData(copy.type);
        delete copy.page; delete copy.id;
        const el = Object.assign(base, copy, { style: { ...base.style, ...copy.style } });
        if (copy.progress) el.progress = { ...base.progress, ...copy.progress };
        el.id = uid(el.type);
        el.x = originX + (Number(copy.x) || 0);
        el.y = originY + (Number(copy.y) || 0);
        el.locked = false;
        el.visible = true;
        el.zIndex = state.overlay.elements.length + index;
        if (preset.builtin) el.group = sharedGroup;
        else if (copy.group) {
            if (!groupMap.has(copy.group)) groupMap.set(copy.group, uid('group'));
            el.group = groupMap.get(copy.group);
        } else {
            el.group = preset.elements.length > 1 ? sharedGroup : '';
        }
        return el;
    });
    state.overlay.elements.push(...made);
    normalizeZ();
    renderCanvas();
    renderLayers();
    setSelection(made.map(el => el.id));
    changed(true);
    toast(`Added “${preset.name}”. Ungroup to tweak the pieces.`, 'info', 3500);
}

export function openSavePreset() {
    const items = selectedElements();
    if (!items.length) { toast('Select the elements to save first.', 'warn'); return; }
    if ($('preset-name')) $('preset-name').value = '';
    if ($('preset-category-list')) {
        $('preset-category-list').innerHTML = [...new Set(['My presets', ...userPresets.map(preset => preset.category)])].map(name => `<option value="${esc(name)}">`).join('');
    }
    presetSaveDialog?.showModal();
    $('preset-name')?.focus();
}

export async function saveSelectionAsPreset() {
    const items = selectedElements();
    const name = $('preset-name')?.value.trim();
    if (!items.length || !name) { toast('Give the preset a name.', 'warn'); return; }
    const box = boundsOf(items);
    const elements = items.map(el => {
        const copy = JSON.parse(JSON.stringify(el));
        delete copy.page;
        delete copy.zIndex;
        copy.x = Math.round(el.x - box.x);
        copy.y = Math.round(el.y - box.y);
        copy.locked = false;
        return copy;
    });
    const id = `preset-${Date.now().toString(36)}`;
    try {
        const response = await fetch('/api/overlay-presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id, name,
                category: $('preset-category')?.value.trim() || 'My presets',
                width: Math.round(box.w),
                height: Math.round(box.h),
                elements
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save the preset');
        presetSaveDialog?.close();
        toast(`Saved preset “${name}”. Find it under Add element → Presets.`, 'info', 3500);
    } catch (error) {
        toast(error.message, 'error', 5000);
    }
}

// ---- Canvas Context Menu ----------------------------------------------------------
const ctxMenu = $('canvas-ctx-menu');
export function hideContextMenu() {
    if (ctxMenu) {
        ctxMenu.classList.remove('open');
        ctxMenu.innerHTML = '';
    }
}

// ---- Server Overlay Synchronization -----------------------------------------------
function applyServerOverlay(data) {
    const next = normalizeLoaded(data);
    state.overlay = next;
    ensureCurPage();
    state.savedSnapshot = snapshot();
    state.selectedIds = new Set([...state.selectedIds].filter(id => byId(id)));
}

export async function save() {
    if (state.saving) return;
    flushHistory();
    if (!state.overlay.name.trim()) {
        state.overlay.name = state.overlay.id;
        $('overlay-name').value = state.overlay.id;
    }
    normalizeZ();
    state.saving = true;
    $('save').disabled = true;
    $('save').textContent = 'Saving…';
    try {
        if (state.isNew) {
            let taken = [];
            try {
                taken = (await (await fetch('/api/custom-overlays', { cache: 'no-store' })).json()).map(o => o.id);
            } catch { /* server will reject a clash */ }
            const base = (state.overlay.name || 'overlay').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'overlay';
            let id = base, n = 2;
            while (taken.includes(id)) id = `${base}-${n++}`;
            state.overlay.id = id;
        }
        const url = state.isNew ? '/api/custom-overlays' : `/api/custom-overlays/${encodeURIComponent(state.overlay.id)}`;
        let response;
        try {
            response = await fetch(url, {
                method: state.isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state.overlay)
            });
        } catch {
            throw new Error('Could not reach the StreamPulse server. Your changes are still here — try again.');
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Save failed (${response.status})`);
        if (state.isNew) {
            state.isNew = false;
            history.replaceState(null, '', `?id=${encodeURIComponent(data.id)}`);
        }
        applyServerOverlay(data);
        pushHistory();
        renderAll();
        toast(`Saved revision ${state.overlay.revision}. Live overlays updated.`, 'success');
    } catch (error) {
        toast(error.message, 'error', 6000);
    } finally {
        state.saving = false;
        $('save').disabled = false;
        $('save').textContent = 'Save & Push Live';
        updateHistoryUI();
    }
}

// ---- Master Render ----------------------------------------------------------------
export function renderAll() {
    if ($('overlay-name')) $('overlay-name').value = state.overlay.name;
    renderSettings();
    renderPageBar();
    syncCanvasUI();
    renderCanvas();
    renderLayers();
    renderProperties();
    updateStatusBar();
    updateHistoryUI();
}

// ---- Live Status & Alert Preview --------------------------------------------------
export async function refreshLiveStatus() {
    try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        if (!response.ok) return;
        const before = liveSignature();
        state.liveStatus = await response.json();
        if (shared.loadLiveExtras) await shared.loadLiveExtras(state.liveStatus, state.overlay.elements);
        if (prefs.live && liveSignature() !== before) renderCanvas();
    } catch {}
}

export function connectAlertPreview() {
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
    socket.addEventListener('message', event => {
        if (typeof event.data === 'string' && !event.data.includes('"alert')) return;
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'alert-skip' || message.type === 'alert-clear') {
            for (const node of state.nodes.values()) if (node._alertHandle) node._alertHandle.stop();
            return;
        }
        if (message.type !== 'alert') return;
        for (const el of state.overlay.elements) {
            const node = state.nodes.get(el.id);
            if (el.type !== 'alert' || !node || el.visible === false) continue;
            const only = el.alert?.triggers || [];
            if (only.length && !only.includes(message.data.trigger)) continue;
            if (node._alertHandle) node._alertHandle.stop();
            node._alertHandle = shared.playAlert ? shared.playAlert(node, el, message.data, {
                sound: false,
                onEnd: () => { node._sig = null; renderCanvas(); }
            }) : null;
        }
    });
    socket.addEventListener('close', () => setTimeout(connectAlertPreview, 3000));
}

export function syncToggles() {
    $('toggle-snap')?.setAttribute('aria-pressed', String(prefs.snap));
    $('toggle-grid')?.setAttribute('aria-pressed', String(prefs.grid));
    $('toggle-safe')?.setAttribute('aria-pressed', String(!!prefs.safeZones));
    $('toggle-live')?.setAttribute('aria-pressed', String(prefs.live));
    $('toggle-fx')?.setAttribute('aria-pressed', String(prefs.fx));
    $('safe-zones')?.classList.toggle('on', !!prefs.safeZones);
    if (shared.setEffectsPaused) shared.setEffectsPaused(!prefs.fx);
    if (window.OverlayFilters?.setEffectsPaused) window.OverlayFilters.setEffectsPaused(!prefs.fx);
    if (window.OverlayRetro?.setEffectsPaused) window.OverlayRetro.setEffectsPaused(!prefs.fx);
}

// ---- Global Event Listeners Setup -------------------------------------------------
function initEventListeners() {
    // Toolbar toggle buttons
    $('toggle-snap')?.addEventListener('click', () => { prefs.snap = !prefs.snap; savePrefs(); syncToggles(); });
    $('toggle-grid')?.addEventListener('click', () => { prefs.grid = !prefs.grid; savePrefs(); syncToggles(); syncCanvasUI(); });
    $('toggle-safe')?.addEventListener('click', () => { prefs.safeZones = !prefs.safeZones; savePrefs(); syncToggles(); syncCanvasUI(); });
    $('toggle-fx')?.addEventListener('click', () => { prefs.fx = !prefs.fx; savePrefs(); syncToggles(); });
    $('toggle-live')?.addEventListener('click', () => { prefs.live = !prefs.live; savePrefs(); syncToggles(); renderCanvas(); });

    // Zoom and Fit buttons
    $('zoom-in')?.addEventListener('click', () => zoomAt(state.zoom * 1.25));
    $('zoom-out')?.addEventListener('click', () => zoomAt(state.zoom / 1.25));
    $('zoom-reset')?.addEventListener('click', () => zoomAt(1));
    $('fit-view')?.addEventListener('click', () => fitView());

    // Undo / Redo buttons
    $('undo')?.addEventListener('click', undo);
    $('redo')?.addEventListener('click', redo);

    // Help Dialog
    $('help')?.addEventListener('click', () => $('help-dialog')?.showModal());
    $('help-close')?.addEventListener('click', () => $('help-dialog')?.close());

    // Overlay Name
    $('overlay-name')?.addEventListener('input', event => { state.overlay.name = event.target.value; changed(false); });
    $('overlay-name')?.addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });
    $('overlay-name')?.addEventListener('change', () => {
        if (!state.overlay.name.trim()) { state.overlay.name = state.overlay.id; $('overlay-name').value = state.overlay.id; }
        changed(true);
    });

    const runtimeUrl = () => `${location.origin}/custom-overlay.html?id=${encodeURIComponent(state.overlay.id)}`;
    $('preview')?.addEventListener('click', () => {
        if (state.isNew) toast('Save the overlay first so the runtime has something to load.', 'warn');
        window.open(`${runtimeUrl()}&preview=true`, '_blank', 'noopener');
    });
    $('copy-url')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(runtimeUrl());
            toast(`Copied. Use a ${state.overlay.canvas.width} × ${state.overlay.canvas.height} browser source in OBS.${state.isNew ? ' Save first.' : ''}`, 'success', 4200);
        } catch {
            window.prompt('Copy this OBS browser-source URL:', runtimeUrl());
        }
    });

    // Save button
    $('save')?.addEventListener('click', save);

    // Revisions Dialog
    const revisionDialog = $('revision-dialog');
    $('revisions')?.addEventListener('click', async () => {
        if (state.isNew) { toast('Save the overlay first. History starts with the second save.', 'warn'); return; }
        const list = $('revision-list');
        if (list) list.innerHTML = '<p class="hint">Loading…</p>';
        revisionDialog?.showModal();
        try {
            const data = await (await fetch(`/api/custom-overlays/${encodeURIComponent(state.overlay.id)}/history`, { cache: 'no-store' })).json();
            if (list) {
                list.innerHTML = data.revisions.length
                    ? data.revisions.map(rev => `<div class="rev"><span><b>Revision ${rev.revision}</b>${rev.name ? ` · ${esc(rev.name)}` : ''}<small>${rev.updatedAt ? esc(new Date(rev.updatedAt).toLocaleString()) : 'Earlier save'} · ${rev.elementCount} element${rev.elementCount === 1 ? '' : 's'}</small></span><button type="button" data-rev="${rev.revision}">Restore</button></div>`).join('')
                    : '<p class="hint">No earlier revisions yet. They appear after you save again.</p>';
            }
        } catch {
            if (list) list.innerHTML = '<p class="hint">Could not load history.</p>';
        }
    });
    $('revision-close')?.addEventListener('click', () => revisionDialog?.close());
    $('revision-list')?.addEventListener('click', async event => {
        const revision = event.target.closest('[data-rev]')?.dataset.rev;
        if (!revision) return;
        try {
            const response = await fetch(`/api/custom-overlays/${encodeURIComponent(state.overlay.id)}/history/${revision}`, { cache: 'no-store' });
            if (!response.ok) throw new Error('That revision is no longer available.');
            const old = normalizeLoaded(await response.json());
            flushHistory();
            state.overlay.name = old.name || state.overlay.name;
            state.overlay.canvas = old.canvas;
            state.overlay.elements = old.elements;
            state.overlay.pages = old.pages;
            ensureCurPage();
            state.selectedIds = new Set();
            changed(true);
            renderAll();
            if (state.autoFit) fitView(true);
            revisionDialog?.close();
            toast(`Loaded revision ${revision}. Review it, then Save & Push Live to apply (Undo to go back).`, 'success', 5000);
        } catch (error) {
            toast(error.message, 'error', 4000);
        }
    });

    // Add Element Dropdown Menu
    const addMenu = $('add-menu');
    $('add-element')?.addEventListener('click', event => {
        event.stopPropagation();
        const open = addMenu.classList.toggle('open');
        $('add-element').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
        if (addMenu && !addMenu.contains(event.target)) {
            addMenu.classList.remove('open');
            $('add-element')?.setAttribute('aria-expanded', 'false');
        }
    });
    addMenu?.querySelectorAll('[data-add]').forEach(button => {
        button.addEventListener('click', () => {
            addElement(button.dataset.add);
            addMenu.classList.remove('open');
            $('add-element').setAttribute('aria-expanded', 'false');
        });
    });

    // Presets UI listeners
    $('open-presets')?.addEventListener('click', () => {
        addMenu?.classList.remove('open');
        $('add-element')?.setAttribute('aria-expanded', 'false');
        openPresets();
    });
    $('preset-close')?.addEventListener('click', () => presetDialog?.close());
    $('preset-search')?.addEventListener('input', renderPresets);
    $('preset-cats')?.addEventListener('click', event => {
        const button = event.target.closest('[data-cat]');
        if (button) { presetCategory = button.dataset.cat; renderPresets(); }
    });
    $('preset-grid')?.addEventListener('click', async event => {
        const del = event.target.closest('[data-del-preset]');
        if (del) {
            const preset = userPresets.find(item => item.id === del.dataset.delPreset);
            const conf = window.StreamPulse?.confirm
                ? await window.StreamPulse.confirm('Delete Preset', `Delete the preset “${preset.name}”? Overlays already using it are not affected.`, { danger: true, confirmText: 'Delete' })
                : window.confirm(`Delete the preset “${preset.name}”?`);
            if (!preset || !conf) return;
            await fetch(`/api/overlay-presets/${encodeURIComponent(preset.id)}`, { method: 'DELETE' });
            await loadUserPresets();
            renderPresets();
            return;
        }
        const card = event.target.closest('[data-preset-id]');
        const preset = card && allPresets().find(item => item.id === card.dataset.presetId);
        if (preset) { presetDialog?.close(); placePreset(preset); }
    });
    $('preset-save-cancel')?.addEventListener('click', () => presetSaveDialog?.close());
    $('preset-save-confirm')?.addEventListener('click', saveSelectionAsPreset);
    $('preset-name')?.addEventListener('keydown', event => { if (event.key === 'Enter') saveSelectionAsPreset(); });

    // Asset Picker Listeners
    $('asset-tags')?.addEventListener('click', event => {
        const button = event.target.closest('[data-tag-filter]');
        if (!button) return;
        assetTagFilter = button.dataset.tagFilter;
        renderAssetGrid();
    });
    assetSearch?.addEventListener('input', renderAssetGrid);
    $('asset-tag-q')?.addEventListener('input', renderAssetGrid);
    $('asset-close')?.addEventListener('click', () => assetDialog?.close());
    assetDialog?.addEventListener('close', () => {
        if (assetGrid) {
            if (shared.cleanupMedia) shared.cleanupMedia(assetGrid);
            assetGrid.innerHTML = '';
        }
    });
    $('asset-upload')?.addEventListener('change', async event => {
        const file = event.target.files[0];
        const el = state.overlay.elements.find(item => item.id === pickerTarget);
        event.target.value = '';
        if (!file || !el) return;
        try {
            toast('Uploading…', 'info', 1500);
            const url = await uploadAsset(file);
            if (TEXT_TYPES.has(el.type)) {
                assetDialog?.close();
                el.source = { ...(el.source || { split: 'lines' }), mode: 'library', path: url };
                if (shared.refreshTextSources) await shared.refreshTextSources([el]);
                renderCanvas(); renderProperties(); changed(true);
                return;
            }
            if (el.type === 'alert') {
                el.alert.sampleImage = url;
                assetDialog?.close();
                renderCanvas(); renderProperties(); changed(true);
                return;
            }
            const hadSource = !!el.src;
            el.src = url;
            assetDialog?.close();
            if (!hadSource && el.type !== 'pattern') await fitToMedia(el, url, el.type);
            renderCanvas(); renderProperties(); changed(true);
        } catch (error) {
            toast(error.message, 'error', 5000);
        }
    });
    assetGrid?.addEventListener('click', async event => {
        const tile = event.target.closest('.asset-tile');
        const el = state.overlay.elements.find(item => item.id === pickerTarget);
        if (!tile || !el) return;
        if (TEXT_TYPES.has(el.type)) {
            assetDialog?.close();
            el.source = { ...(el.source || { split: 'lines' }), mode: 'library', path: tile.dataset.url };
            if (shared.refreshTextSources) await shared.refreshTextSources([el]);
            renderCanvas(); renderProperties(); changed(true);
            return;
        }
        if (el.type === 'alert') {
            el.alert.sampleImage = tile.dataset.url;
            assetDialog?.close();
            renderCanvas(); renderProperties(); changed(true);
            return;
        }
        const hadSource = !!el.src;
        el.src = tile.dataset.url;
        assetDialog?.close();
        if (!hadSource && el.type !== 'pattern') await fitToMedia(el, el.src, el.type);
        renderCanvas(); renderProperties(); changed(true);
    });

    // Slideshow Picker Listeners
    $('slide-search')?.addEventListener('input', renderSlideGrid);
    $('slide-tag-q')?.addEventListener('input', renderSlideGrid);
    $('slide-tags')?.addEventListener('click', event => {
        const button = event.target.closest('[data-tag-filter]');
        if (button) { slideTagFilter = button.dataset.tagFilter; renderSlideGrid(); }
    });
    slideGrid?.addEventListener('click', event => {
        const tile = event.target.closest('[data-name]');
        if (!tile) return;
        slidePicked.has(tile.dataset.name) ? slidePicked.delete(tile.dataset.name) : slidePicked.add(tile.dataset.name);
        renderSlideGrid();
    });
    $('slide-all')?.addEventListener('click', () => { slideShown.forEach(asset => slidePicked.add(asset.name)); renderSlideGrid(); });
    $('slide-none')?.addEventListener('click', () => { slidePicked.clear(); renderSlideGrid(); });
    $('slide-done')?.addEventListener('click', () => {
        const el = state.overlay.elements.find(item => item.id === pickerTarget);
        slideDialog?.close();
        if (!el) return;
        const order = libraryAssets.map(asset => asset.name);
        const files = [...slidePicked].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        el.slideshow = { ...el.slideshow, files };
        renderCanvas(); renderProperties(); changed(false);
    });
    $('slide-close')?.addEventListener('click', () => slideDialog?.close());
    slideDialog?.addEventListener('close', () => {
        if (slideGrid) {
            if (shared.cleanupMedia) shared.cleanupMedia(slideGrid);
            slideGrid.innerHTML = '';
        }
    });

    // Canvas Drag and Drop & Paste
    if (stage) {
        stage.addEventListener('dragover', event => {
            if ([...(event.dataTransfer?.types || [])].includes('Files')) {
                event.preventDefault();
                stage.classList.add('drop-target');
            }
        });
        stage.addEventListener('dragleave', event => {
            if (!stage.contains(event.relatedTarget)) stage.classList.remove('drop-target');
        });
        stage.addEventListener('drop', event => {
            event.preventDefault();
            stage.classList.remove('drop-target');
            const files = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
            if (!files.length) { toast('Drop an image or video file.', 'warn'); return; }
            addMediaFiles(files, toLogical(event.clientX, event.clientY));
        });
    }

    document.addEventListener('paste', event => {
        if (event.target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea, select')) return;
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const files = [...(event.clipboardData?.files || [])]
            .filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
            .map(file => /^(image|blob)\.\w+$/i.test(file.name) ? new File([file], `pasted-${stamp}.${file.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`, { type: file.type }) : file);
        event.preventDefault();
        if (files.length) {
            toast(`Uploading ${files.length} pasted file${files.length > 1 ? 's' : ''}…`, 'info', 1500);
            addMediaFiles(files);
        } else {
            pasteClipboard();
        }
    });

    // Canvas Context Menu
    document.addEventListener('click', event => {
        if (!event.target.closest('#canvas-ctx-menu')) hideContextMenu();
    });

    stage?.addEventListener('contextmenu', event => {
        if (!event.target.closest('#stage')) return;
        event.preventDefault();

        const targetNode = event.target.closest('.canvas-element');
        if (targetNode) {
            const elId = [...state.nodes.entries()].find(([, n]) => n === targetNode)?.[0];
            if (elId && !state.selectedIds.has(elId)) {
                setSelection([elId]);
            }
        }

        const items = selectedElements();
        const hasSelection = items.length > 0;
        let hasClipboard = false;
        try { hasClipboard = Boolean(localStorage.getItem('streampulse.overlayEditor.clipboard')); } catch {}
        const isMulti = items.length > 1;
        const allLocked = hasSelection && items.every(el => el.locked);
        const hasGroup = hasSelection && items.some(el => el.group);
        const modKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
        const altKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌥' : 'Alt+';
        const hasStyleClip = Boolean(getStyleClipboard());

        let menuHtml = '';
        if (hasSelection) {
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="duplicate"><span>Duplicate</span><kbd>${modKey}D</kbd></button>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="copy"><span>Copy</span><kbd>${modKey}C</kbd></button>`;
            if (hasClipboard) {
                menuHtml += `<button type="button" class="ctx-item" data-ctx-act="paste"><span>Paste</span><kbd>${modKey}V</kbd></button>`;
            }
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="copy-style"><span>Copy Style</span><kbd>${modKey}${altKey}C</kbd></button>`;
            if (hasStyleClip) {
                menuHtml += `<button type="button" class="ctx-item" data-ctx-act="paste-style"><span>Paste Style</span><kbd>${modKey}${altKey}V</kbd></button>`;
            }
            menuHtml += `<div class="ctx-divider"></div>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="front"><span>Bring to Front</span><kbd>${modKey}⇧]</kbd></button>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="forward"><span>Bring Forward</span><kbd>${modKey}]</kbd></button>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="backward"><span>Send Backward</span><kbd>${modKey}[</kbd></button>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="back"><span>Send to Back</span><kbd>${modKey}⇧[</kbd></button>`;
            menuHtml += `<div class="ctx-divider"></div>`;
            if (isMulti) {
                menuHtml += `<button type="button" class="ctx-item" data-ctx-act="group"><span>Group</span><kbd>${modKey}G</kbd></button>`;
            }
            if (hasGroup) {
                menuHtml += `<button type="button" class="ctx-item" data-ctx-act="ungroup"><span>Ungroup</span><kbd>${modKey}⇧G</kbd></button>`;
            }
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="lock"><span>${allLocked ? 'Unlock' : 'Lock'}</span></button>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="hide"><span>${items.every(el => el.visible === false) ? 'Show' : 'Hide'}</span></button>`;
            menuHtml += `<div class="ctx-divider"></div>`;
            menuHtml += `<button type="button" class="ctx-item danger" data-ctx-act="delete"><span>Delete</span><kbd>Del</kbd></button>`;
        } else {
            if (hasClipboard) {
                menuHtml += `<button type="button" class="ctx-item" data-ctx-act="paste"><span>Paste</span><kbd>${modKey}V</kbd></button>`;
                menuHtml += `<div class="ctx-divider"></div>`;
            }
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="fit"><span>Fit to Screen</span><kbd>${modKey}0</kbd></button>`;
            menuHtml += `<button type="button" class="ctx-item" data-ctx-act="select-all"><span>Select All</span><kbd>${modKey}A</kbd></button>`;
        }

        if (ctxMenu) {
            ctxMenu.innerHTML = menuHtml;
            ctxMenu.classList.add('open');
            const menuRect = ctxMenu.getBoundingClientRect();
            const posX = Math.min(event.clientX, window.innerWidth - menuRect.width - 8);
            const posY = Math.min(event.clientY, window.innerHeight - menuRect.height - 8);
            ctxMenu.style.left = `${Math.max(8, posX)}px`;
            ctxMenu.style.top = `${Math.max(8, posY)}px`;
        }
    });

    ctxMenu?.addEventListener('click', event => {
        const btn = event.target.closest('[data-ctx-act]');
        if (!btn) return;
        const act = btn.dataset.ctxAct;
        hideContextMenu();
        if (act === 'duplicate') duplicateSelection();
        else if (act === 'copy') copySelection();
        else if (act === 'copy-style') copySelectionStyle();
        else if (act === 'paste-style') pasteSelectionStyle();
        else if (act === 'paste') pasteClipboard();
        else if (['front', 'forward', 'backward', 'back'].includes(act)) reorder(act);
        else if (act === 'group') groupSelection();
        else if (act === 'ungroup') ungroupSelection();
        else if (act === 'lock') runAction('lock');
        else if (act === 'hide') runAction('hide');
        else if (act === 'delete') deleteSelection();
        else if (act === 'fit') fitView();
        else if (act === 'select-all') setSelection(visibleElements().filter(el => el.visible !== false).map(el => el.id));
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', event => {
        const pacEl = $('placeholder-ac');
        if (pacEl?.classList.contains('open')) {
            const pacItems = pacEl.querySelectorAll('.pac-item');
            let activeIdx = [...pacItems].findIndex(el => el.classList.contains('active'));
            if (event.key === 'ArrowDown') {
                event.preventDefault(); event.stopPropagation();
                activeIdx = (activeIdx + 1) % pacItems.length;
                pacItems.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault(); event.stopPropagation();
                activeIdx = (activeIdx - 1 + pacItems.length) % pacItems.length;
                pacItems.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
                return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                if (pacItems[activeIdx]) {
                    event.preventDefault(); event.stopPropagation();
                    pacItems[activeIdx].click();
                    return;
                }
            }
            if (event.key === 'Escape') {
                event.preventDefault(); event.stopPropagation();
                pacEl.classList.remove('open');
                return;
            }
        }

        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const typing = event.target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea, select');

        if (mod && key === 's') { event.preventDefault(); save(); return; }
        if ($('help-dialog')?.open) return;
        if (typing) return;

        if (mod && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
        if (mod && key === 'y') { event.preventDefault(); redo(); return; }
        if (mod && key === 'a') { event.preventDefault(); setSelection(visibleElements().filter(el => el.visible !== false).map(el => el.id)); return; }
        if (mod && event.altKey && key === 'c') { event.preventDefault(); copySelectionStyle(); return; }
        if (mod && event.altKey && key === 'v') { event.preventDefault(); pasteSelectionStyle(); return; }
        if (mod && key === 'c') { copySelection(); return; }
        if (mod && key === 'v') return;
        if (mod && key === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection(); return; }
        if (mod && key === 'd') { event.preventDefault(); duplicateSelection(); return; }
        if (mod && key === '0') { event.preventDefault(); fitView(); return; }
        if (mod && key === '1') { event.preventDefault(); zoomAt(1); return; }
        if (mod && (event.key === ']' || event.key === '[')) {
            event.preventDefault();
            reorder(event.key === ']' ? (event.shiftKey ? 'front' : 'forward') : (event.shiftKey ? 'back' : 'backward'));
            return;
        }
        if (event.key === ' ' && !event.target.closest('button, a, summary')) {
            event.preventDefault();
            if (!state.spaceDown) { state.spaceDown = true; stage?.classList.add('space'); }
            return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (state.selectedIds.size) { event.preventDefault(); deleteSelection(); }
            return;
        }
        if (event.key === 'Escape') {
            if (ctxMenu?.classList.contains('open')) { hideContextMenu(); return; }
            $('add-menu')?.classList.remove('open');
            setSelection([]);
            return;
        }
        if (event.key === '+' || event.key === '=') { zoomAt(state.zoom * 1.25); return; }
        if (event.key === '-') { zoomAt(state.zoom / 1.25); return; }
        if (event.key.startsWith('Arrow')) {
            const items = selectedElements().filter(el => !el.locked);
            if (!items.length) return;
            event.preventDefault();
            const step = event.shiftKey ? 10 : 1;
            for (const el of items) {
                if (event.key === 'ArrowLeft') el.x -= step;
                if (event.key === 'ArrowRight') el.x += step;
                if (event.key === 'ArrowUp') el.y -= step;
                if (event.key === 'ArrowDown') el.y += step;
            }
            renderCanvas();
            syncGeometryInputs();
            updateStatusBar();
            changed(false);
        }
    });

    document.addEventListener('keyup', event => {
        if (event.key === ' ') {
            state.spaceDown = false;
            stage?.classList.remove('space');
        }
    });

    window.addEventListener('blur', () => {
        state.spaceDown = false;
        stage?.classList.remove('space');
    });

    window.addEventListener('beforeunload', event => {
        if (state.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

// ---- Initialization / Load --------------------------------------------------------
export async function load() {
    // Populate toolbar button icons
    if ($('undo')) $('undo').innerHTML = ICON.undo;
    if ($('redo')) $('redo').innerHTML = ICON.redo;
    if ($('zoom-in')) $('zoom-in').innerHTML = ICON.plus;
    if ($('zoom-out')) $('zoom-out').innerHTML = ICON.minus;

    // Register cross-module callbacks
    registerRenderAll(renderAll);
    registerFitView(fitView);
    registerStatusBar(updateStatusBar);
    registerSelectionChange(onSelectionChange);

    registerLayerCallbacks({
        onRenderCanvas: renderCanvas,
        onRenderProperties: renderProperties,
        onUpdateStatusBar: updateStatusBar,
        onRenderAll: renderAll
    });

    registerInspectorCallbacks({
        onUpdateStatusBar: updateStatusBar,
        onRunAction: runAction,
        onAlignSelection: alignSelection,
        onDistributeSelection: distributeSelection,
        onScaleSelectionBy: scaleSelectionBy,
        onUploadAsset: uploadAsset,
        onFitToMedia: fitToMedia,
        onOpenAssetDialog: openAssetPicker
    });

    initCanvasGestures({
        onSyncGeometry: syncGeometryInputs,
        onUpdateStatusBar: updateStatusBar,
        onRenderProperties: renderProperties,
        onHideContextMenu: hideContextMenu
    });

    initLayersAndPages();
    initInspectorEvents();
    initEventListeners();
    syncToggles();

    if (shared.loadAssetFonts) shared.loadAssetFonts().catch(() => null);

    if (!state.isNew) {
        const response = await fetch(`/api/custom-overlays/${encodeURIComponent(initialId)}`).catch(() => null);
        if (!response) throw new Error('Could not reach the StreamPulse server.');
        if (response.status === 404) throw new Error(`No overlay named “${initialId}” exists.`);
        if (!response.ok) throw new Error(`Could not load the overlay (${response.status}).`);
        state.overlay = normalizeLoaded(await response.json());
    } else {
        state.overlay = normalizeLoaded(state.overlay);
    }
    ensureCurPage();

    if (shared.refreshTextSources) {
        shared.refreshTextSources(state.overlay.elements).then(() => {
            if (state.overlay.elements.some(e => e.source && e.source.mode !== 'inline')) renderCanvas();
        }).catch(() => null);
    }

    renderAll();
    state.hist.stack = [];
    state.hist.index = -1;
    pushHistory();
    state.savedSnapshot = snapshot();
    state.dirty = false;
    updateHistoryUI();
    setRailTab(prefs.railTab === 'pages' ? 'pages' : 'layers');

    const selectId = params.get('select');
    if (selectId && byId(selectId)) setSelection([selectId]);

    fitView(true);
    refreshLiveStatus();
    refreshLivePage();

    loadAssetTags().then(() => {
        if (primary()?.type === 'slideshow') renderProperties();
    });

    if (window.pollVisible) {
        window.pollVisible(refreshLiveStatus, 10000);
    }
    setInterval(tickPlaceholders, 1000);

    connectAlertPreview();
}

// ---- Auto Bootstrap ---------------------------------------------------------------
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            load().catch(error => {
                const emptyHint = $('empty-hint');
                if (emptyHint) {
                    emptyHint.innerHTML = `<div><strong id="load-error">${esc(error.message)}</strong><a href="/custom-overlays.html" style="color:var(--accent);pointer-events:auto">Back to custom overlays</a></div>`;
                    emptyHint.classList.add('on');
                }
                if ($('save')) $('save').disabled = true;
                renderSettings();
                renderProperties();
            });
        });
    } else {
        load().catch(error => {
            const emptyHint = $('empty-hint');
            if (emptyHint) {
                emptyHint.innerHTML = `<div><strong id="load-error">${esc(error.message)}</strong><a href="/custom-overlays.html" style="color:var(--accent);pointer-events:auto">Back to custom overlays</a></div>`;
                emptyHint.classList.add('on');
            }
            if ($('save')) $('save').disabled = true;
            renderSettings();
            renderProperties();
        });
    }
}
