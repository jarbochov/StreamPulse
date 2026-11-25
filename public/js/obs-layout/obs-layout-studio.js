const SCENE_STORAGE_KEY = 'sp_obs_layout_scene';
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
let pendingLivePayload = null;
let dragState = null;

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

async function pushTransformNow(item, extra = {}) {
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
        if (it.borderPad > 0 && it.borderPad > it.borderReach) {
            const margin = it.borderPad - it.borderReach;
            const sx = it.rect.width / Math.max(1, Number(it.transform?.sourceWidth) || 1920);
            const sy = it.rect.height / Math.max(1, Number(it.transform?.sourceHeight) || 1080);
            const guide = document.createElement('div');
            guide.className = 'ol-border-guide';
            guide.style.left = `${margin * sx * stageScale}px`;
            guide.style.right = `${margin * sx * stageScale}px`;
            guide.style.top = `${margin * sy * stageScale}px`;
            guide.style.bottom = `${margin * sy * stageScale}px`;
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
        line.className = `ol-snap-line ${g.axis}`;
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

function computeSnap(rect, ignoreId) {
    if (!$('ol-snap-edges')?.checked) return { left: rect.left, top: rect.top, guides: [] };
    const thresh = 10;
    const xTargets = [0, baseWidth / 2, baseWidth];
    const yTargets = [0, baseHeight / 2, baseHeight];
    for (const other of items) {
        if (other.sceneItemId === ignoreId || !other.visible) continue;
        xTargets.push(other.rect.left, other.rect.left + other.rect.width / 2, other.rect.left + other.rect.width);
        yTargets.push(other.rect.top, other.rect.top + other.rect.height / 2, other.rect.top + other.rect.height);
    }

    let left = rect.left;
    let top = rect.top;
    const guides = [];

    const xEdges = [
        { val: left, offset: 0 },
        { val: left + rect.width / 2, offset: rect.width / 2 },
        { val: left + rect.width, offset: rect.width }
    ];
    let bestDx = thresh + 1;
    let snapX = null;
    for (const e of xEdges) {
        for (const t of xTargets) {
            const d = Math.abs(e.val - t);
            if (d < bestDx) { bestDx = d; snapX = { target: t, offset: e.offset }; }
        }
    }
    if (snapX) {
        left = snapX.target - snapX.offset;
        guides.push({ axis: 'v', pos: snapX.target });
    }

    const yEdges = [
        { val: top, offset: 0 },
        { val: top + rect.height / 2, offset: rect.height / 2 },
        { val: top + rect.height, offset: rect.height }
    ];
    let bestDy = thresh + 1;
    let snapY = null;
    for (const e of yEdges) {
        for (const t of yTargets) {
            const d = Math.abs(e.val - t);
            if (d < bestDy) { bestDy = d; snapY = { target: t, offset: e.offset }; }
        }
    }
    if (snapY) {
        top = snapY.target - snapY.offset;
        guides.push({ axis: 'h', pos: snapY.target });
    }

    return { left, top, guides };
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

function bindEvents() {
    $('ol-scene-select').addEventListener('change', e => loadScene(e.target.value));
    $('ol-btn-refresh').addEventListener('click', () => (currentScene ? loadScene(currentScene) : loadAll()));
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
            await pushTransformNow(it, { visible: it.visible });
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
            const snapped = computeSnap(next, item.sceneItemId);
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
            item.rect = next;
            renderCanvas();
        }
        renderInspector();
        scheduleLiveSync(item);
    }

    async function onPointerUp() {
        window.removeEventListener('pointermove', onPointerMove);
        if (!dragState) return;
        const { item } = dragState;
        dragState = null;
        renderCanvas([]);
        await pushTransformNow(item);
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
        await pushTransformNow(sel);
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
            await pushTransformNow(sel);
        });
    });

    $('ol-align-ch').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        sel.rect.left = (baseWidth - sel.rect.width) / 2;
        renderCanvas(); renderInspector();
        await pushTransformNow(sel);
    });
    $('ol-align-cv').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        sel.rect.top = (baseHeight - sel.rect.height) / 2;
        renderCanvas(); renderInspector();
        await pushTransformNow(sel);
    });
    $('ol-align-fit').addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        sel.rect.left = 0; sel.rect.top = 0; sel.rect.width = baseWidth; sel.rect.height = baseHeight;
        renderCanvas(); renderInspector();
        await pushTransformNow(sel);
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
        window.addEventListener('beforeunload', () => stageObserver?.disconnect(), { once: true });
    }
}

bindEvents();
loadAll();
