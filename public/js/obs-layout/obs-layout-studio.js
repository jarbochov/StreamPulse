const SCENE_STORAGE_KEY = 'sp_obs_layout_scene';
const TAB_STORAGE_KEY = 'sp_obs_layout_tab';
const INSP_STORAGE_KEY = 'sp_obs_layout_insp';
const ANCHOR_RATIOS = {
    tl: [0, 0], tc: [0.5, 0], tr: [1, 0],
    ml: [0, 0.5], c: [0.5, 0.5], mr: [1, 0.5],
    bl: [0, 1], bc: [0.5, 1], br: [1, 1]
};

let studioState = null;
let currentScene = '';
let baseWidth = 1920;
let baseHeight = 1080;
let stageScale = 0.5;
let items = [];
let selectedItemId = null;
let backdropDataUrl = '';
let selectedRatio = 'native';
let selectedAnchor = 'c';
let stageObserver = null;
let liveSyncTimer = null;
let backdropRefreshTimer = null;
let pendingLivePayload = null;
let dragState = null;
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 40;

const $ = id => document.getElementById(id);

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function api(url, opts = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

function showNotice(msg) {
    const prev = document.getElementById('ol-toast');
    if (prev) prev.remove();
    const el = document.createElement('div');
    el.id = 'ol-toast';
    el.textContent = msg;
    Object.assign(el.style, {
        position: 'fixed', right: '20px', bottom: '20px', zIndex: '999',
        padding: '10px 16px', borderRadius: '10px', background: 'var(--bg-card)',
        border: '1px solid var(--accent)', color: 'var(--text-main)',
        fontSize: '13px', fontWeight: '600', boxShadow: '0 10px 28px rgba(0,0,0,0.4)'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

function getSelectedItem() {
    return items.find(i => i.sceneItemId === selectedItemId) || null;
}

function rectToObsPatch(item, rect) {
    const tx = item.transform || {};
    const sw = Math.max(1, Number(tx.sourceWidth) || 1920);
    const sh = Math.max(1, Number(tx.sourceHeight) || 1080);
    const effW = Math.max(1, sw - (Number(tx.cropLeft) || 0) - (Number(tx.cropRight) || 0));
    const effH = Math.max(1, sh - (Number(tx.cropTop) || 0) - (Number(tx.cropBottom) || 0));
    const bits = Number.isFinite(Number(tx.alignment)) ? Number(tx.alignment) : 5;
    const ax = (bits & 1) ? 0 : (bits & 2) ? 1 : 0.5;
    const ay = (bits & 4) ? 0 : (bits & 8) ? 1 : 0.5;
    const hasBounds = String(tx.boundsType || 'OBS_BOUNDS_NONE') !== 'OBS_BOUNDS_NONE'
        && Number(tx.boundsWidth) > 0 && Number(tx.boundsHeight) > 0;

    const patch = {
        positionX: Number((rect.left + ax * rect.width).toFixed(2)),
        positionY: Number((rect.top + ay * rect.height).toFixed(2))
    };
    if (hasBounds) {
        patch.boundsWidth = Number(Math.max(8, rect.width).toFixed(2));
        patch.boundsHeight = Number(Math.max(8, rect.height).toFixed(2));
    } else {
        const signX = (Number(tx.scaleX) || 1) < 0 ? -1 : 1;
        const signY = (Number(tx.scaleY) || 1) < 0 ? -1 : 1;
        patch.scaleX = Number((signX * (rect.width / effW)).toFixed(6));
        patch.scaleY = Number((signY * (rect.height / effH)).toFixed(6));
    }
    if (rect.rotation !== undefined) {
        patch.rotation = Number(Number(rect.rotation).toFixed(2));
    }
    return patch;
}

function scheduleBackdropRefresh(delayMs = 140) {
    if (!$('ol-show-backdrop')?.checked || !currentScene) return;
    if (backdropRefreshTimer) clearTimeout(backdropRefreshTimer);
    backdropRefreshTimer = setTimeout(() => {
        backdropRefreshTimer = null;
        refreshSnapshot();
    }, delayMs);
}

async function pushTransformNow(item, extra = {}, { refreshBackdrop = false } = {}) {
    if (!currentScene || !item) return;
    const transform = rectToObsPatch(item, item.rect);
    try {
        await api('/api/obs-layout/transform', {
            method: 'POST',
            body: JSON.stringify({
                sceneName: currentScene,
                sceneItemId: item.sceneItemId,
                transform,
                ...extra
            })
        });
        if (refreshBackdrop) scheduleBackdropRefresh(140);
    } catch { /* ignore transient during rapid drag */ }
}

function scheduleLiveSync(item) {
    if (!$('ol-live-sync')?.checked || !item) return;
    pendingLivePayload = item;
    if (liveSyncTimer) return;
    liveSyncTimer = setTimeout(async () => {
        liveSyncTimer = null;
        const target = pendingLivePayload;
        pendingLivePayload = null;
        if (target) await pushTransformNow(target);
    }, 33);
}

function layoutCanvas() {
    const wrap = $('ol-stage-wrap');
    const canvas = $('ol-canvas');
    if (!wrap || !canvas) return;
    const availW = Math.max(240, wrap.clientWidth - 24);
    const availH = Math.max(200, wrap.clientHeight - 24);
    stageScale = Math.min(availW / baseWidth, availH / baseHeight, 1);
    canvas.style.width = `${Math.round(baseWidth * stageScale)}px`;
    canvas.style.height = `${Math.round(baseHeight * stageScale)}px`;
    renderCanvas();
}

function renderLayers() {
    $('ol-item-count').textContent = String(items.length);
    const list = $('ol-layer-list');
    if (!items.length) {
        list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No items in this scene.</div>';
        return;
    }
    // OBS renders bottom-to-top; show top-most layer first in sidebar
    const ordered = [...items].reverse();
    list.innerHTML = ordered.map(it => {
        const sel = it.sceneItemId === selectedItemId;
        return `
        <div class="ol-layer-row${sel ? ' is-selected' : ''}${!it.visible ? ' is-hidden' : ''}" data-select-id="${it.sceneItemId}">
            <button type="button" class="ol-icon-btn${it.visible ? ' is-active' : ''}" data-toggle-vis="${it.sceneItemId}" title="Toggle Visibility">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <span class="ol-layer-name" title="${esc(it.sourceName)}">${esc(it.sourceName)}</span>
            <button type="button" class="ol-icon-btn${it.locked ? ' is-active' : ''}" data-toggle-lock="${it.sceneItemId}" title="Toggle Lock">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
        </div>`;
    }).join('');
}

function renderLayoutsList() {
    const list = $('ol-layout-list');
    const layouts = (studioState?.layouts || []).filter(l => !currentScene || l.sceneName === currentScene);
    if (!layouts.length) {
        list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No saved layouts for this scene yet.</div>';
        return;
    }
    list.innerHTML = layouts.map(l => `
        <div class="ol-layout-item">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650;" title="${esc(l.name)}">${esc(l.name)}</span>
            <div style="display:flex;gap:4px;flex:none;">
                <button type="button" class="btn btn-primary btn-sm" data-apply-layout="${esc(l.id)}">Apply</button>
                <button type="button" class="btn btn-danger btn-sm" data-del-layout="${esc(l.id)}">&times;</button>
            </div>
        </div>
    `).join('');
}

function getVisibleBorderInsets(item, rectOverride = null) {
    if (!item || !(item.borderPad > 0) || !(item.borderPad > item.borderReach)) {
        return { insetX: 0, insetY: 0, hasOuterBorder: false };
    }
    const rect = rectOverride || item.rect;
    const tx = item.transform || {};
    const sw = Math.max(1, Number(tx.sourceWidth) || 1920);
    const sh = Math.max(1, Number(tx.sourceHeight) || 1080);
    const boundsType = String(tx.boundsType || 'OBS_BOUNDS_NONE');
    const margin = item.borderPad - item.borderReach;

    let sx = rect.width / sw;
    let sy = rect.height / sh;
    if (boundsType === 'OBS_BOUNDS_SCALE_INNER' || boundsType === 'OBS_BOUNDS_MAX_ONLY') {
        const s = boundsType === 'OBS_BOUNDS_MAX_ONLY' ? Math.min(1, sx, sy) : Math.min(sx, sy);
        const renderW = sw * s;
        const renderH = sh * s;
        return {
            insetX: (rect.width - renderW) * 0.5 + margin * s,
            insetY: (rect.height - renderH) * 0.5 + margin * s,
            hasOuterBorder: true
        };
    }
    if (boundsType === 'OBS_BOUNDS_SCALE_OUTER') {
        const s = Math.max(sx, sy);
        const renderW = sw * s;
        const renderH = sh * s;
        return {
            insetX: (rect.width - renderW) * 0.5 + margin * s,
            insetY: (rect.height - renderH) * 0.5 + margin * s,
            hasOuterBorder: true
        };
    }
    return { insetX: margin * sx, insetY: margin * sy, hasOuterBorder: true };
}

function renderCanvas(snapGuides = []) {
    const canvas = $('ol-canvas');
    if (!canvas) return;
    canvas.innerHTML = '';

    if ($('ol-show-backdrop')?.checked && backdropDataUrl) {
        const img = document.createElement('img');
        img.className = 'ol-backdrop-img';
        img.src = backdropDataUrl;
        img.alt = '';
        canvas.appendChild(img);
    }

    if ($('ol-show-guides')?.checked) {
        for (const [axis, frac, isCenter] of [
            ['v', 1 / 3, false], ['v', 0.5, true], ['v', 2 / 3, false],
            ['h', 1 / 3, false], ['h', 0.5, true], ['h', 2 / 3, false]
        ]) {
            const g = document.createElement('div');
            g.className = `ol-canvas-guide ${axis}${isCenter ? ' is-center' : ''}`;
            if (axis === 'v') g.style.left = `${baseWidth * frac * stageScale}px`;
            else g.style.top = `${baseHeight * frac * stageScale}px`;
            canvas.appendChild(g);
        }
    }

    for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const isSel = it.sceneItemId === selectedItemId;
        const box = document.createElement('div');
        box.className = `ol-item-box${isSel ? ' is-selected' : ''}${!it.visible ? ' is-hidden' : ''}${it.locked ? ' is-locked' : ''}`;
        box.dataset.itemId = String(it.sceneItemId);
        box.style.left = `${it.rect.left * stageScale}px`;
        box.style.top = `${it.rect.top * stageScale}px`;
        box.style.width = `${Math.max(4, it.rect.width * stageScale)}px`;
        box.style.height = `${Math.max(4, it.rect.height * stageScale)}px`;
        box.style.zIndex = String(10 + idx);
        if (it.transform?.rotation) {
            box.style.transform = `rotate(${it.transform.rotation}deg)`;
        }

        const lbl = document.createElement('span');
        lbl.className = 'ol-item-label';
        lbl.textContent = it.aspect && it.aspect.ratio !== 'native'
            ? `${it.sourceName} (${it.aspect.ratio})`
            : it.sourceName;
        box.appendChild(lbl);

        // If source uses StreamPulse Border, draw dashed guide showing visible outer border edge inside padded canvas
        const bInsets = getVisibleBorderInsets(it);
        if (bInsets.hasOuterBorder) {
            const guide = document.createElement('div');
            guide.className = 'ol-border-guide';
            guide.style.left = `${bInsets.insetX * stageScale}px`;
            guide.style.right = `${bInsets.insetX * stageScale}px`;
            guide.style.top = `${bInsets.insetY * stageScale}px`;
            guide.style.bottom = `${bInsets.insetY * stageScale}px`;
            box.appendChild(guide);
        }

        if (isSel && !it.locked) {
            for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
                const handle = document.createElement('div');
                handle.className = 'ol-handle';
                handle.dataset.h = h;
                box.appendChild(handle);
            }
            const [ax, ay] = ANCHOR_RATIOS[selectedAnchor] || [0.5, 0.5];
            const dot = document.createElement('div');
            dot.className = 'ol-anchor-dot';
            dot.style.left = `${ax * 100}%`;
            dot.style.top = `${ay * 100}%`;
            box.appendChild(dot);
        }

        canvas.appendChild(box);
    }

    for (const g of snapGuides) {
        const line = document.createElement('div');
        line.className = `ol-snap-line ${g.axis}${g.isBorder ? ' is-border' : ''}`;
        if (g.axis === 'v') line.style.left = `${g.pos * stageScale}px`;
        else line.style.top = `${g.pos * stageScale}px`;
        canvas.appendChild(line);
    }

    const sel = getSelectedItem();
    $('ol-readout').textContent = sel
        ? `${Math.round(sel.rect.left)}, ${Math.round(sel.rect.top)} · ${Math.round(sel.rect.width)}×${Math.round(sel.rect.height)}`
        : `${baseWidth}×${baseHeight}`;
}

function renderInspector() {
    const sel = getSelectedItem();
    $('ol-sel-name').textContent = sel ? sel.sourceName : 'None';
    $('ol-inspector-empty').hidden = Boolean(sel);
    $('ol-inspector-body').hidden = !sel;
    if (!sel) return;

    $('ol-x').value = String(Math.round(sel.rect.left));
    $('ol-y').value = String(Math.round(sel.rect.top));
    $('ol-w').value = String(Math.round(sel.rect.width));
    $('ol-h').value = String(Math.round(sel.rect.height));
    $('ol-rot').value = String(Math.round(Number(sel.transform?.rotation) || 0));
    if ($('ol-bounds-type')) {
        $('ol-bounds-type').value = String(sel.transform?.boundsType || 'OBS_BOUNDS_NONE');
    }

    const aspect = sel.aspect || studioState?.sources?.[sel.sourceName] || {
        ratio: 'native', panX: 0, panY: 0, zoom: 1, resizeMode: 'lock-width', anchor: 'c', durationMs: 400
    };
    selectedRatio = aspect.ratio || 'native';
    selectedAnchor = aspect.anchor || 'c';

    $('ol-ratio-chips').querySelectorAll('[data-ratio]').forEach(btn => {
        const on = btn.dataset.ratio === selectedRatio;
        btn.classList.toggle('btn-primary', on);
        btn.classList.toggle('btn-secondary', !on);
    });
    $('ol-anchor-grid').querySelectorAll('[data-anchor]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.anchor === selectedAnchor);
    });
    $('ol-resize-mode').value = aspect.resizeMode || 'lock-width';
    $('ol-pan-x').value = String(aspect.panX || 0);
    $('ol-pan-x-val').textContent = String(aspect.panX || 0);
    $('ol-pan-y').value = String(aspect.panY || 0);
    $('ol-pan-y-val').textContent = String(aspect.panY || 0);
    $('ol-zoom').value = String(aspect.zoom || 1);
    $('ol-zoom-val').textContent = String(Math.round((aspect.zoom || 1) * 100));
    $('ol-duration').value = String(aspect.durationMs ?? 400);
}

function selectItem(id) {
    selectedItemId = id;
    renderLayers();
    renderInspector();
    renderCanvas();
}

function buildSnapTargets(ignoreId) {
    const xTargets = [0, baseWidth / 3, baseWidth / 2, (baseWidth * 2) / 3, baseWidth];
    const yTargets = [0, baseHeight / 3, baseHeight / 2, (baseHeight * 2) / 3, baseHeight];
    for (const other of items) {
        if (other.sceneItemId === ignoreId || !other.visible) continue;
        xTargets.push(other.rect.left, other.rect.left + other.rect.width / 2, other.rect.left + other.rect.width);
        yTargets.push(other.rect.top, other.rect.top + other.rect.height / 2, other.rect.top + other.rect.height);
        const bi = getVisibleBorderInsets(other);
        if (bi.hasOuterBorder) {
            xTargets.push(other.rect.left + bi.insetX, other.rect.left + other.rect.width - bi.insetX);
            yTargets.push(other.rect.top + bi.insetY, other.rect.top + other.rect.height - bi.insetY);
        }
    }
    return { xTargets, yTargets };
}

function computeSnap(rect, item) {
    if (!$('ol-snap-edges')?.checked) return { left: rect.left, top: rect.top, guides: [] };
    const thresh = 10;
    const { xTargets, yTargets } = buildSnapTargets(item.sceneItemId);
    const bi = getVisibleBorderInsets(item, rect);

    let left = rect.left;
    let top = rect.top;
    const guides = [];

    const xEdges = [
        { val: left, offset: 0, isBorder: false },
        { val: left + rect.width / 2, offset: rect.width / 2, isBorder: false },
        { val: left + rect.width, offset: rect.width, isBorder: false }
    ];
    if (bi.hasOuterBorder) {
        xEdges.push(
            { val: left + bi.insetX, offset: bi.insetX, isBorder: true },
            { val: left + rect.width - bi.insetX, offset: rect.width - bi.insetX, isBorder: true }
        );
    }
    let bestDx = thresh + 1;
    let snapX = null;
    for (const e of xEdges) {
        for (const t of xTargets) {
            const d = Math.abs(e.val - t);
            if (d < bestDx) { bestDx = d; snapX = { target: t, offset: e.offset, isBorder: e.isBorder }; }
        }
    }
    if (snapX) {
        left = snapX.target - snapX.offset;
        guides.push({ axis: 'v', pos: snapX.target, isBorder: snapX.isBorder });
    }

    const yEdges = [
        { val: top, offset: 0, isBorder: false },
        { val: top + rect.height / 2, offset: rect.height / 2, isBorder: false },
        { val: top + rect.height, offset: rect.height, isBorder: false }
    ];
    if (bi.hasOuterBorder) {
        yEdges.push(
            { val: top + bi.insetY, offset: bi.insetY, isBorder: true },
            { val: top + rect.height - bi.insetY, offset: rect.height - bi.insetY, isBorder: true }
        );
    }
    let bestDy = thresh + 1;
    let snapY = null;
    for (const e of yEdges) {
        for (const t of yTargets) {
            const d = Math.abs(e.val - t);
            if (d < bestDy) { bestDy = d; snapY = { target: t, offset: e.offset, isBorder: e.isBorder }; }
        }
    }
    if (snapY) {
        top = snapY.target - snapY.offset;
        guides.push({ axis: 'h', pos: snapY.target, isBorder: snapY.isBorder });
    }

    return { left, top, guides };
}

function computeResizeSnap(next, mode, item) {
    if (!$('ol-snap-edges')?.checked) return { rect: next, guides: [] };
    const thresh = 10;
    const { xTargets, yTargets } = buildSnapTargets(item.sceneItemId);
    const guides = [];
    const out = { ...next };

    const findNearest = (val, targets) => {
        let best = thresh + 1;
        let hit = null;
        for (const t of targets) {
            const d = Math.abs(val - t);
            if (d < best) { best = d; hit = t; }
        }
        return hit;
    };

    if (mode.includes('e')) {
        const hit = findNearest(out.left + out.width, xTargets);
        if (hit !== null && hit - out.left >= 16) {
            out.width = hit - out.left;
            guides.push({ axis: 'v', pos: hit });
        }
    } else if (mode.includes('w')) {
        const right = out.left + out.width;
        const hit = findNearest(out.left, xTargets);
        if (hit !== null && right - hit >= 16) {
            out.left = hit;
            out.width = right - hit;
            guides.push({ axis: 'v', pos: hit });
        }
    }
    if (mode.includes('s')) {
        const hit = findNearest(out.top + out.height, yTargets);
        if (hit !== null && hit - out.top >= 16) {
            out.height = hit - out.top;
            guides.push({ axis: 'h', pos: hit });
        }
    } else if (mode.includes('n')) {
        const bottom = out.top + out.height;
        const hit = findNearest(out.top, yTargets);
        if (hit !== null && bottom - hit >= 16) {
            out.top = hit;
            out.height = bottom - hit;
            guides.push({ axis: 'h', pos: hit });
        }
    }
    return { rect: out, guides };
}

function cloneItemsSnapshot() {
    return items.map(it => ({
        sceneItemId: it.sceneItemId,
        sourceName: it.sourceName,
        visible: it.visible,
        locked: it.locked,
        rect: { ...it.rect },
        transform: { ...it.transform }
    }));
}

function updateHistoryUI() {
    const undoBtn = $('ol-btn-undo');
    const redoBtn = $('ol-btn-redo');
    const revBtn = $('ol-btn-revert');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex < 0 || historyIndex >= historyStack.length - 1;
    if (revBtn) revBtn.disabled = historyIndex <= 0;

    const cnt = $('ol-history-count');
    if (cnt) cnt.textContent = String(Math.max(0, historyStack.length - 1));
    const list = $('ol-history-list');
    if (!list) return;
    if (!historyStack.length) {
        list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">No edits yet.</div>';
        return;
    }
    list.innerHTML = [...historyStack].map((entry, idx) => ({ entry, idx })).reverse().map(({ entry, idx }) => {
        const cls = idx === historyIndex ? ' is-current' : idx > historyIndex ? ' is-future' : '';
        return `<button type="button" class="ol-history-btn${cls}" data-history-idx="${idx}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(entry.label)}</span>
            <span style="color:var(--text-muted);flex:none;">${esc(entry.time)}</span>
        </button>`;
    }).join('');
}

function recordHistory(label) {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }
    historyStack.push({ label, time, snapshot: cloneItemsSnapshot() });
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
    updateHistoryUI();
}

async function restoreHistoryIndex(targetIdx) {
    if (targetIdx < 0 || targetIdx >= historyStack.length || targetIdx === historyIndex) return;
    const entry = historyStack[targetIdx];
    if (!entry) return;
    historyIndex = targetIdx;
    const changed = [];
    for (const snap of entry.snapshot) {
        const cur = items.find(i => i.sceneItemId === snap.sceneItemId);
        if (!cur) continue;
        const diff = JSON.stringify(cur.rect) !== JSON.stringify(snap.rect)
            || cur.visible !== snap.visible
            || cur.locked !== snap.locked
            || cur.transform?.boundsType !== snap.transform?.boundsType;
        cur.visible = snap.visible;
        cur.locked = snap.locked;
        cur.rect = { ...snap.rect };
        cur.transform = { ...cur.transform, ...snap.transform };
        if (diff) changed.push(cur);
    }
    renderLayers();
    renderInspector();
    renderCanvas();
    updateHistoryUI();
    for (const item of changed) {
        const patch = {
            ...rectToObsPatch(item, item.rect),
            ...(item.transform?.boundsType ? { boundsType: item.transform.boundsType } : {})
        };
        await api('/api/obs-layout/transform', {
            method: 'POST',
            body: JSON.stringify({
                sceneName: currentScene,
                sceneItemId: item.sceneItemId,
                transform: patch,
                visible: item.visible,
                locked: item.locked
            })
        }).catch(() => {});
    }
    if (changed.length) scheduleBackdropRefresh(140);
    showNotice(`Restored: ${entry.label}`);
}

async function loadScene(sceneName) {
    if (!sceneName) return;
    currentScene = sceneName;
    try { localStorage.setItem(SCENE_STORAGE_KEY, sceneName); } catch { /* ignore */ }
    const data = await api(`/api/obs-layout/scene?name=${encodeURIComponent(sceneName)}`);
    baseWidth = data.baseWidth || 1920;
    baseHeight = data.baseHeight || 1080;
    items = data.items || [];
    if (!items.some(i => i.sceneItemId === selectedItemId)) {
        selectedItemId = items.length ? items[items.length - 1].sceneItemId : null;
    }
    historyStack = [];
    historyIndex = -1;
    recordHistory('Initial scene state');
    renderLayers();
    renderLayoutsList();
    renderInspector();
    layoutCanvas();
    if ($('ol-show-backdrop')?.checked) refreshSnapshot();
}

async function refreshSnapshot() {
    if (!currentScene) return;
    try {
        const res = await api(`/api/obs-layout/screenshot?scene=${encodeURIComponent(currentScene)}`);
        backdropDataUrl = res.imageData || '';
        renderCanvas();
    } catch { /* ignore */ }
}

async function loadAll() {
    try {
        studioState = await api('/api/obs-layout');
        $('ol-disabled-banner').hidden = studioState.enabled === true;
        $('ol-disconnected-banner').hidden = !studioState.enabled || studioState.obsConnected === true;
        if ($('ol-lua-path') && studioState.luaScriptPath) {
            $('ol-lua-path').textContent = studioState.luaScriptPath;
        }
        const badge = $('ol-obs-ws-badge');
        if (badge) {
            badge.textContent = studioState.obsConnected ? 'OBS Connected' : 'OBS Disconnected';
            badge.classList.toggle('live', studioState.obsConnected === true);
        }
        if (!studioState.enabled || !studioState.obsConnected) {
            renderLayoutsList();
            return;
        }
        const sc = await api('/api/obs-layout/scenes');
        baseWidth = sc.baseWidth || 1920;
        baseHeight = sc.baseHeight || 1080;
        const sel = $('ol-scene-select');
        sel.innerHTML = (sc.scenes || []).map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
        const remembered = (() => { try { return localStorage.getItem(SCENE_STORAGE_KEY); } catch { return ''; } })();
        const initial = (remembered && sc.scenes.includes(remembered)) ? remembered : (sc.currentProgramScene || sc.scenes[0] || '');
        if (initial) {
            sel.value = initial;
            await loadScene(initial);
        }
    } catch (err) {
        showNotice(err.message);
    }
}

function switchTopTab(tab) {
    const valid = tab === 'setup' ? 'setup' : 'stage';
    try { localStorage.setItem(TAB_STORAGE_KEY, valid); } catch { /* ignore */ }
    document.querySelectorAll('[data-ol-tab]').forEach(btn => {
        const on = btn.dataset.olTab === valid;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('[data-ol-pane]').forEach(sec => {
        sec.hidden = sec.dataset.olPane !== valid;
    });
    if (valid === 'stage') layoutCanvas();
}

function switchInspectorTab(tab) {
    const valid = ['transform', 'aspect', 'layers'].includes(tab) ? tab : 'transform';
    try { localStorage.setItem(INSP_STORAGE_KEY, valid); } catch { /* ignore */ }
    $('ol-inspector-tabs')?.querySelectorAll('[data-insp]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.insp === valid);
    });
    document.querySelectorAll('[data-insp-pane]').forEach(pane => {
        pane.hidden = pane.dataset.inspPane !== valid;
    });
}

function bindEvents() {
    document.querySelectorAll('[data-ol-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTopTab(btn.dataset.olTab));
    });
    $('ol-inspector-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-insp]');
        if (btn) switchInspectorTab(btn.dataset.insp);
    });
    $('ol-btn-copy-lua')?.addEventListener('click', async () => {
        await navigator.clipboard?.writeText($('ol-lua-path')?.textContent || '');
        showNotice('Copied Lua script path');
    });

    $('ol-bounds-type')?.addEventListener('change', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        const nextType = $('ol-bounds-type').value;
        sel.transform.boundsType = nextType;
        const isBounded = nextType !== 'OBS_BOUNDS_NONE';
        if (isBounded) {
            sel.transform.boundsWidth = Math.max(8, Math.round(sel.rect.width));
            sel.transform.boundsHeight = Math.max(8, Math.round(sel.rect.height));
        }
        const patch = {
            ...rectToObsPatch(sel, sel.rect),
            boundsType: nextType,
            ...(isBounded ? {
                boundsWidth: Number(Math.max(8, sel.rect.width).toFixed(2)),
                boundsHeight: Number(Math.max(8, sel.rect.height).toFixed(2))
            } : {})
        };
        try {
            await api('/api/obs-layout/transform', {
                method: 'POST',
                body: JSON.stringify({ sceneName: currentScene, sceneItemId: sel.sceneItemId, transform: patch })
            });
            showNotice(`Bounds set to ${nextType.replace('OBS_BOUNDS_', '')}`);
            await loadScene(currentScene);
        } catch (err) {
            showNotice(err.message);
        }
    });

    $('ol-btn-undo')?.addEventListener('click', () => restoreHistoryIndex(historyIndex - 1));
    $('ol-btn-redo')?.addEventListener('click', () => restoreHistoryIndex(historyIndex + 1));
    $('ol-btn-revert')?.addEventListener('click', () => restoreHistoryIndex(0));
    $('ol-history-list')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-history-idx]');
        if (btn) restoreHistoryIndex(Number(btn.dataset.historyIdx));
    });
    window.addEventListener('keydown', e => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
            e.preventDefault();
            restoreHistoryIndex(historyIndex - 1);
        } else if ((k === 'z' && e.shiftKey) || k === 'y') {
            e.preventDefault();
            restoreHistoryIndex(historyIndex + 1);
        }
    });

    $('ol-scene-select').addEventListener('change', e => loadScene(e.target.value));
    $('ol-btn-refresh').addEventListener('click', () => (currentScene ? loadScene(currentScene) : loadAll()));
    $('ol-show-guides')?.addEventListener('change', () => renderCanvas());
    $('ol-show-backdrop').addEventListener('change', () => {
        if ($('ol-show-backdrop').checked && !backdropDataUrl) refreshSnapshot();
        else renderCanvas();
    });
    $('ol-btn-snapshot').addEventListener('click', () => {
        $('ol-show-backdrop').checked = true;
        refreshSnapshot();
    });

    // Layer sidebar clicks
    $('ol-layer-list').addEventListener('click', async e => {
        const visBtn = e.target.closest('[data-toggle-vis]');
        if (visBtn) {
            const it = items.find(x => x.sceneItemId === Number(visBtn.dataset.toggleVis));
            if (!it) return;
            it.visible = !it.visible;
            renderLayers();
            renderCanvas();
            await pushTransformNow(it, { visible: it.visible }, { refreshBackdrop: true });
            return;
        }
        const lockBtn = e.target.closest('[data-toggle-lock]');
        if (lockBtn) {
            const it = items.find(x => x.sceneItemId === Number(lockBtn.dataset.toggleLock));
            if (!it) return;
            it.locked = !it.locked;
            renderLayers();
            renderCanvas();
            await pushTransformNow(it, { locked: it.locked });
            return;
        }
        const row = e.target.closest('[data-select-id]');
        if (row) selectItem(Number(row.dataset.selectId));
    });

    // Canvas drag & resize
    $('ol-canvas').addEventListener('pointerdown', e => {
        const handleEl = e.target.closest('.ol-handle');
        const boxEl = e.target.closest('.ol-item-box');
        if (!boxEl) return;
        const id = Number(boxEl.dataset.itemId);
        const item = items.find(x => x.sceneItemId === id);
        if (!item) return;
        selectItem(id);
        if (item.locked) return;
        e.preventDefault();
        dragState = {
            item,
            mode: handleEl ? handleEl.dataset.h : 'move',
            startX: e.clientX,
            startY: e.clientY,
            orig: { ...item.rect }
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
    });

    function onPointerMove(e) {
        if (!dragState) return;
        const dx = (e.clientX - dragState.startX) / stageScale;
        const dy = (e.clientY - dragState.startY) / stageScale;
        const { item, mode, orig } = dragState;
        let next = { ...orig };

        if (mode === 'move') {
            next.left = orig.left + dx;
            next.top = orig.top + dy;
            const snapped = computeSnap(next, item);
            next.left = snapped.left;
            next.top = snapped.top;
            item.rect = next;
            renderCanvas(snapped.guides);
        } else {
            if (mode.includes('e')) next.width = Math.max(16, orig.width + dx);
            if (mode.includes('s')) next.height = Math.max(16, orig.height + dy);
            if (mode.includes('w')) {
                next.width = Math.max(16, orig.width - dx);
                next.left = orig.left + (orig.width - next.width);
            }
            if (mode.includes('n')) {
                next.height = Math.max(16, orig.height - dy);
                next.top = orig.top + (orig.height - next.height);
            }
            const snapped = computeResizeSnap(next, mode, item);
            item.rect = snapped.rect;
            renderCanvas(snapped.guides);
        }
        renderInspector();
        scheduleLiveSync(item);
    }

    async function onPointerUp() {
        window.removeEventListener('pointermove', onPointerMove);
        if (!dragState) return;
        const { item, mode } = dragState;
        dragState = null;
        renderCanvas([]);
        recordHistory(`${mode === 'move' ? 'Move' : 'Resize'} ${item.sourceName}`);
        await pushTransformNow(item, {}, { refreshBackdrop: true });
    }

    // Keyboard 1px / 10px nudge
    $('ol-stage-wrap').addEventListener('keydown', async e => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') sel.rect.left -= step;
        else if (e.key === 'ArrowRight') sel.rect.left += step;
        else if (e.key === 'ArrowUp') sel.rect.top -= step;
        else if (e.key === 'ArrowDown') sel.rect.top += step;
        else return;
        e.preventDefault();
        renderCanvas();
        renderInspector();
        recordHistory(`Nudge ${sel.sourceName}`);
        await pushTransformNow(sel, {}, { refreshBackdrop: true });
    });

    // Numeric inspector inputs
    ['ol-x', 'ol-y', 'ol-w', 'ol-h', 'ol-rot'].forEach(id => {
        $(id).addEventListener('change', async () => {
            const sel = getSelectedItem();
            if (!sel || sel.locked) return;
            sel.rect.left = Number($('ol-x').value) || 0;
            sel.rect.top = Number($('ol-y').value) || 0;
            sel.rect.width = Math.max(8, Number($('ol-w').value) || 100);
            sel.rect.height = Math.max(8, Number($('ol-h').value) || 100);
            sel.rect.rotation = Number($('ol-rot').value) || 0;
            sel.transform.rotation = sel.rect.rotation;
            renderCanvas();
            recordHistory(`Edit ${sel.sourceName}`);
            await pushTransformNow(sel, {}, { refreshBackdrop: true });
        });
    });

    $('ol-align-ch').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        sel.rect.left = (baseWidth - sel.rect.width) / 2;
        renderCanvas(); renderInspector();
        recordHistory(`Center H ${sel.sourceName}`);
        await pushTransformNow(sel, {}, { refreshBackdrop: true });
    });
    $('ol-align-cv').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        sel.rect.top = (baseHeight - sel.rect.height) / 2;
        renderCanvas(); renderInspector();
        recordHistory(`Center V ${sel.sourceName}`);
        await pushTransformNow(sel, {}, { refreshBackdrop: true });
    });
    $('ol-align-fit').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        sel.rect.left = 0; sel.rect.top = 0; sel.rect.width = baseWidth; sel.rect.height = baseHeight;
        renderCanvas(); renderInspector();
        recordHistory(`Fit Canvas ${sel.sourceName}`);
        await pushTransformNow(sel, {}, { refreshBackdrop: true });
    });

    // Aspect ratio controls
    $('ol-ratio-chips').addEventListener('click', e => {
        const btn = e.target.closest('[data-ratio]');
        if (!btn) return;
        selectedRatio = btn.dataset.ratio;
        $('ol-ratio-chips').querySelectorAll('[data-ratio]').forEach(b => {
            b.classList.toggle('btn-primary', b === btn);
            b.classList.toggle('btn-secondary', b !== btn);
        });
    });

    $('ol-anchor-grid').addEventListener('click', e => {
        const btn = e.target.closest('[data-anchor]');
        if (!btn) return;
        selectedAnchor = btn.dataset.anchor;
        $('ol-anchor-grid').querySelectorAll('[data-anchor]').forEach(b => b.classList.toggle('active', b === btn));
        renderCanvas();
    });

    $('ol-pan-x').addEventListener('input', () => { $('ol-pan-x-val').textContent = $('ol-pan-x').value; });
    $('ol-pan-y').addEventListener('input', () => { $('ol-pan-y-val').textContent = $('ol-pan-y').value; });
    $('ol-zoom').addEventListener('input', () => { $('ol-zoom-val').textContent = String(Math.round(Number($('ol-zoom').value) * 100)); });

    $('ol-btn-attach-aspect').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel) return;
        try {
            await api('/api/obs-layout/aspect/attach', {
                method: 'POST',
                body: JSON.stringify({ sourceName: sel.sourceName })
            });
            showNotice(`Attached StreamPulse Aspect filter to ${sel.sourceName}`);
        } catch (err) {
            showNotice(err.message);
        }
    });

    $('ol-btn-apply-aspect').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel) return;
        try {
            const res = await api('/api/obs-layout/aspect', {
                method: 'POST',
                body: JSON.stringify({
                    sourceName: sel.sourceName,
                    sceneName: currentScene,
                    ratio: selectedRatio,
                    resizeMode: $('ol-resize-mode').value,
                    anchor: selectedAnchor,
                    panX: Number($('ol-pan-x').value) || 0,
                    panY: Number($('ol-pan-y').value) || 0,
                    zoom: Number($('ol-zoom').value) || 1,
                    durationMs: Number($('ol-duration').value) || 0
                })
            });
            studioState = { ...studioState, ...res.state };
            showNotice(`Morphed ${sel.sourceName} to ${selectedRatio}`);
            await loadScene(currentScene);
        } catch (err) {
            showNotice(err.message);
        }
    });

    // Saved Layout Snapshots
    $('ol-btn-save-layout').addEventListener('click', async () => {
        const name = $('ol-layout-name').value.trim();
        if (!name || !currentScene) return;
        const layoutItems = items.map(it => ({
            sourceName: it.sourceName,
            visible: it.visible,
            transform: rectToObsPatch(it, it.rect),
            aspect: it.aspect || studioState?.sources?.[it.sourceName] || null
        }));
        try {
            const res = await api('/api/obs-layout/layouts', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    sceneName: currentScene,
                    durationMs: Number($('ol-duration')?.value) || 400,
                    items: layoutItems
                })
            });
            studioState = { ...studioState, ...res.state };
            $('ol-layout-name').value = '';
            renderLayoutsList();
            showNotice(`Saved layout "${name}"`);
        } catch (err) {
            showNotice(err.message);
        }
    });

    $('ol-layout-list').addEventListener('click', async e => {
        const applyBtn = e.target.closest('[data-apply-layout]');
        if (applyBtn) {
            try {
                await api('/api/obs-layout/layouts/apply', {
                    method: 'POST',
                    body: JSON.stringify({ id: applyBtn.dataset.applyLayout })
                });
                showNotice('Applied layout snapshot');
                await loadScene(currentScene);
            } catch (err) {
                showNotice(err.message);
            }
            return;
        }
        const delBtn = e.target.closest('[data-del-layout]');
        if (delBtn) {
            try {
                const res = await api(`/api/obs-layout/layouts/${encodeURIComponent(delBtn.dataset.delLayout)}`, { method: 'DELETE' });
                studioState = { ...studioState, ...res.state };
                renderLayoutsList();
                showNotice('Deleted layout snapshot');
            } catch (err) {
                showNotice(err.message);
            }
        }
    });

    if (typeof ResizeObserver === 'function' && $('ol-stage-wrap')) {
        stageObserver = new ResizeObserver(() => layoutCanvas());
        stageObserver.observe($('ol-stage-wrap'));
        window.addEventListener('beforeunload', () => {
            stageObserver?.disconnect();
            if (backdropRefreshTimer) clearTimeout(backdropRefreshTimer);
            if (liveSyncTimer) clearTimeout(liveSyncTimer);
        }, { once: true });
    }
}

bindEvents();
switchTopTab((() => { try { return localStorage.getItem(TAB_STORAGE_KEY); } catch { return 'stage'; } })());
switchInspectorTab((() => { try { return localStorage.getItem(INSP_STORAGE_KEY); } catch { return 'transform'; } })());
loadAll();
