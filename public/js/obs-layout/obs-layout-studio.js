const ANCHOR_RATIOS = {
    tl: [0, 0], tc: [0.5, 0], tr: [1, 0],
    ml: [0, 0.5], c: [0.5, 0.5], mr: [1, 0.5],
    bl: [0, 1], bc: [0.5, 1], br: [1, 1]
};

const SVG_EYE_ON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_EYE_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const SVG_LOCK_ON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const SVG_LOCK_OFF = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
const SVG_UP = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="18 15 12 9 6 15"/></svg>';
const SVG_DOWN = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>';

const TAB_STORAGE_KEY = 'sp_obs_layout_top_tab';
const INSP_STORAGE_KEY = 'sp_obs_layout_insp_tab';
const SCENE_STORAGE_KEY = 'sp_obs_layout_scene';
const MAX_HISTORY = 40;

let studioState = null;
let currentScene = '';
let baseWidth = 1920;
let baseHeight = 1080;
let canvasScale = 0.5;
let items = [];
let selectedItemId = null;
let selectedRatio = 'native';
let selectedAnchor = 'c';
let backdropDataUrl = '';
let dragState = null;
let cpDragState = null;
let liveSyncTimer = null;
let backdropRefreshTimer = null;
let stageObserver = null;
let historyStack = [];
let historyIndex = -1;
let previewLayoutId = null;
let customControlPoint = null;

const $ = id => document.getElementById(id);

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function showNotice(msg) {
    const el = $('ol-notice');
    if (el) el.textContent = msg;
}

async function api(url, opts = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function getSelectedItem() {
    return items.find(i => i.sceneItemId === selectedItemId) || null;
}

function computeScaledBorderBoxes(item, rect = item?.rect) {
    if (!item?.hasBorderFilter || !item.borderOuterRect || !item._origRect) {
        return { outer: null, content: null };
    }
    const orig = item._origRect;
    const rx = rect.width / Math.max(1, orig.width);
    const ry = rect.height / Math.max(1, orig.height);
    const mapBox = b => ({
        left: rect.left + (b.left - orig.left) * rx,
        top: rect.top + (b.top - orig.top) * ry,
        width: Math.max(2, b.width * rx),
        height: Math.max(2, b.height * ry)
    });
    return {
        outer: mapBox(item.borderOuterRect),
        content: item.contentRect ? mapBox(item.contentRect) : null
    };
}

function getEffectiveSnapBox(item, rect) {
    const boxes = computeScaledBorderBoxes(item, rect);
    if (boxes.outer) {
        return {
            left: boxes.outer.left,
            top: boxes.outer.top,
            right: boxes.outer.left + boxes.outer.width,
            bottom: boxes.outer.top + boxes.outer.height,
            insetLeft: boxes.outer.left - rect.left,
            insetTop: boxes.outer.top - rect.top,
            insetRight: (rect.left + rect.width) - (boxes.outer.left + boxes.outer.width),
            insetBottom: (rect.top + rect.height) - (boxes.outer.top + boxes.outer.height)
        };
    }
    return {
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        insetLeft: 0,
        insetTop: 0,
        insetRight: 0,
        insetBottom: 0
    };
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
    const hasBounds = String(tx.boundsType || 'OBS_BOUNDS_NONE') !== 'OBS_BOUNDS_NONE' && Number(tx.boundsWidth) > 0 && Number(tx.boundsHeight) > 0;
    const patch = {
        positionX: Number((rect.left + ax * rect.width).toFixed(3)),
        positionY: Number((rect.top + ay * rect.height).toFixed(3))
    };
    if (hasBounds) {
        patch.boundsWidth = Number(Math.max(8, rect.width).toFixed(3));
        patch.boundsHeight = Number(Math.max(8, rect.height).toFixed(3));
    } else {
        const signX = (Number(tx.scaleX) || 1) < 0 ? -1 : 1;
        const signY = (Number(tx.scaleY) || 1) < 0 ? -1 : 1;
        patch.scaleX = Number((signX * (rect.width / effW)).toFixed(6));
        patch.scaleY = Number((signY * (rect.height / effH)).toFixed(6));
    }
    if (Number.isFinite(Number(rect.rotation))) {
        patch.rotation = Number(Number(rect.rotation).toFixed(2));
    }
    return patch;
}

function scheduleBackdropRefresh(delayMs = 180) {
    if (!$('ol-show-backdrop')?.checked || !currentScene) return;
    if (backdropRefreshTimer) clearTimeout(backdropRefreshTimer);
    backdropRefreshTimer = setTimeout(() => {
        backdropRefreshTimer = null;
        refreshSnapshot();
    }, delayMs);
}

async function pushTransformNow(item, extraPatch = {}, { refreshBackdrop = false } = {}) {
    if (!item || !currentScene) return;
    const patch = { ...rectToObsPatch(item, item.rect), ...extraPatch };
    try {
        await api('/api/obs-layout/transform', {
            method: 'POST',
            body: JSON.stringify({
                sceneName: currentScene,
                sceneItemId: item.sceneItemId,
                transform: patch
            })
        });
        if (refreshBackdrop) scheduleBackdropRefresh(160);
    } catch (err) {
        showNotice(`OBS sync error: ${err.message}`);
    }
}

function scheduleLiveSync(item) {
    if (!$('ol-live-sync').checked) return;
    if (liveSyncTimer) return;
    liveSyncTimer = setTimeout(() => {
        liveSyncTimer = null;
        pushTransformNow(item);
    }, 34);
}

function layoutCanvas() {
    const wrap = $('ol-stage-wrap');
    const canvas = $('ol-canvas');
    if (!wrap || !canvas) return;
    const pad = 28;
    const availW = Math.max(260, wrap.clientWidth - pad);
    const availH = Math.max(200, wrap.clientHeight - pad);
    canvasScale = Math.min(availW / baseWidth, availH / baseHeight);
    canvas.style.width = `${Math.round(baseWidth * canvasScale)}px`;
    canvas.style.height = `${Math.round(baseHeight * canvasScale)}px`;
    $('ol-readout').textContent = `${baseWidth}×${baseHeight} (${Math.round(canvasScale * 100)}%)`;
    renderCanvas();
}

function renderMotionPathOverlay(canvas) {
    if (!previewLayoutId || !studioState) return;
    const layout = (studioState.layouts || []).find(l => l.id === previewLayoutId && l.sceneName === currentScene);
    if (!layout) return;
    const pathType = $('ol-path-type')?.value || layout.pathType || 'direct';
    const curve = (Number($('ol-path-curve')?.value) || 28) / 100;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'ol-path-svg');
    svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`);

    let primaryPath = null;
    for (const saved of (layout.items || [])) {
        const cur = items.find(i => i.sourceName === saved.sourceName);
        if (!cur || !saved.transform) continue;
        const x0 = cur.rect.left + cur.rect.width * 0.5;
        const y0 = cur.rect.top + cur.rect.height * 0.5;
        const tW = saved.transform.boundsWidth || cur.rect.width;
        const tH = saved.transform.boundsHeight || cur.rect.height;
        const bits = Number.isFinite(Number(cur.transform?.alignment)) ? Number(cur.transform.alignment) : 5;
        const ax = (bits & 1) ? 0 : (bits & 2) ? 1 : 0.5;
        const ay = (bits & 4) ? 0 : (bits & 8) ? 1 : 0.5;
        const x1 = (Number(saved.transform.positionX) || cur.rect.left) - ax * tW + tW * 0.5;
        const y1 = (Number(saved.transform.positionY) || cur.rect.top) - ay * tH + tH * 0.5;
        const dist = Math.hypot(x1 - x0, y1 - y0);
        if (dist < 2) continue;

        let d = `M ${x0} ${y0} L ${x1} ${y1}`;
        let cp = null;
        if (pathType === 'arc-up' || pathType === 'arc-down') {
            const dir = pathType === 'arc-up' ? -1 : 1;
            cp = { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 + dir * Math.max(40, dist * Math.abs(curve)) };
            d = `M ${x0} ${y0} Q ${cp.x} ${cp.y} ${x1} ${y1}`;
        } else if (pathType === 's-curve') {
            const off = Math.max(40, dist * Math.abs(curve));
            d = `M ${x0} ${y0} C ${x0 + (x1 - x0) * 0.35} ${y0 - off}, ${x0 + (x1 - x0) * 0.65} ${y1 + off}, ${x1} ${y1}`;
        } else if (pathType === 'custom') {
            cp = customControlPoint || layout.pathControlPoint || { x: (x0 + x1) * 0.5, y: Math.max(60, (y0 + y1) * 0.5 - 120) };
            customControlPoint = { ...cp };
            d = `M ${x0} ${y0} Q ${cp.x} ${cp.y} ${x1} ${y1}`;
        }

        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.setAttribute('d', d);
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', '#f59e0b');
        pathEl.setAttribute('stroke-width', '4');
        pathEl.setAttribute('stroke-dasharray', '12 8');
        svg.appendChild(pathEl);

        const endDot = document.createElementNS(svgNS, 'circle');
        endDot.setAttribute('cx', String(x1));
        endDot.setAttribute('cy', String(y1));
        endDot.setAttribute('r', '8');
        endDot.setAttribute('fill', '#f59e0b');
        svg.appendChild(endDot);

        if (!primaryPath && cp) primaryPath = { x0, y0, x1, y1, cp };
    }
    canvas.appendChild(svg);

    if (pathType === 'custom' && primaryPath) {
        const handle = document.createElement('div');
        handle.className = 'ol-cp-handle';
        handle.title = 'Drag to bend Custom Movement Path';
        handle.style.left = `${primaryPath.cp.x * canvasScale}px`;
        handle.style.top = `${primaryPath.cp.y * canvasScale}px`;
        handle.dataset.cpHandle = '1';
        canvas.appendChild(handle);
    }
}

function renderCanvas(snapGuides = []) {
    const canvas = $('ol-canvas');
    if (!canvas) return;
    canvas.innerHTML = '';

    if ($('ol-show-backdrop').checked && backdropDataUrl) {
        const img = document.createElement('img');
        img.className = 'ol-backdrop-img';
        img.src = backdropDataUrl;
        img.alt = '';
        canvas.appendChild(img);
    }

    if ($('ol-show-guides')?.checked) {
        const staticGuides = [
            { axis: 'v', pos: baseWidth / 3, center: false },
            { axis: 'v', pos: baseWidth / 2, center: true },
            { axis: 'v', pos: (baseWidth * 2) / 3, center: false },
            { axis: 'h', pos: baseHeight / 3, center: false },
            { axis: 'h', pos: baseHeight / 2, center: true },
            { axis: 'h', pos: (baseHeight * 2) / 3, center: false }
        ];
        for (const sg of staticGuides) {
            const gl = document.createElement('div');
            gl.className = `ol-canvas-guide ${sg.axis}${sg.center ? ' is-center' : ''}`;
            if (sg.axis === 'v') gl.style.left = `${sg.pos * canvasScale}px`;
            else gl.style.top = `${sg.pos * canvasScale}px`;
            canvas.appendChild(gl);
        }
    }

    const showBorders = $('ol-show-borders')?.checked !== false;

    items.forEach((item, idx) => {
        const r = item.rect;
        const box = document.createElement('div');
        const hasBorder = Boolean(item.hasBorderFilter && item.borderOuterRect);
        box.className = `ol-item-box${item.sceneItemId === selectedItemId ? ' is-selected' : ''}${!item.visible ? ' is-hidden' : ''}${item.locked ? ' is-locked' : ''}${hasBorder && showBorders ? ' has-border' : ''}`;
        box.dataset.id = String(item.sceneItemId);
        box.style.left = `${r.left * canvasScale}px`;
        box.style.top = `${r.top * canvasScale}px`;
        box.style.width = `${Math.max(4, r.width * canvasScale)}px`;
        box.style.height = `${Math.max(4, r.height * canvasScale)}px`;
        box.style.zIndex = String(10 + idx);
        if (item.transform?.rotation) {
            box.style.transform = `rotate(${item.transform.rotation}deg)`;
        }

        const label = document.createElement('div');
        label.className = 'ol-item-label';
        label.textContent = item.sourceName;
        box.appendChild(label);

        if (hasBorder && showBorders) {
            const boxes = computeScaledBorderBoxes(item, r);
            if (boxes.outer) {
                const ob = document.createElement('div');
                ob.className = 'ol-border-outer-box';
                ob.style.left = `${(boxes.outer.left - r.left) * canvasScale}px`;
                ob.style.top = `${(boxes.outer.top - r.top) * canvasScale}px`;
                ob.style.width = `${Math.max(4, boxes.outer.width * canvasScale)}px`;
                ob.style.height = `${Math.max(4, boxes.outer.height * canvasScale)}px`;
                const tag = document.createElement('span');
                tag.className = 'ol-border-outer-tag';
                tag.textContent = 'Border';
                ob.appendChild(tag);
                box.appendChild(ob);
            }
            if (boxes.content) {
                const cb = document.createElement('div');
                cb.className = 'ol-border-content-box';
                cb.style.left = `${(boxes.content.left - r.left) * canvasScale}px`;
                cb.style.top = `${(boxes.content.top - r.top) * canvasScale}px`;
                cb.style.width = `${Math.max(4, boxes.content.width * canvasScale)}px`;
                cb.style.height = `${Math.max(4, boxes.content.height * canvasScale)}px`;
                box.appendChild(cb);
            }
        }

        if (item.sceneItemId === selectedItemId && !item.locked) {
            ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(h => {
                const hd = document.createElement('div');
                hd.className = 'ol-handle';
                hd.dataset.h = h;
                box.appendChild(hd);
            });
            const [ax, ay] = ANCHOR_RATIOS[selectedAnchor] || [0.5, 0.5];
            const dot = document.createElement('div');
            dot.className = 'ol-anchor-dot';
            dot.style.left = `${ax * 100}%`;
            dot.style.top = `${ay * 100}%`;
            box.appendChild(dot);
        }
        canvas.appendChild(box);
    });

    renderMotionPathOverlay(canvas);

    for (const g of snapGuides) {
        const line = document.createElement('div');
        line.className = `ol-snap-guide ${g.axis}`;
        if (g.axis === 'v') line.style.left = `${g.pos * canvasScale}px`;
        else line.style.top = `${g.pos * canvasScale}px`;
        canvas.appendChild(line);
    }
}

function renderLayers() {
    const list = $('ol-layer-list');
    if (!list) return;
    if ($('ol-layer-count')) $('ol-layer-count').textContent = String(items.length);
    const ordered = [...items].reverse();
    list.innerHTML = ordered.map(it => {
        const tags = [];
        if (it.hasBorderFilter) tags.push('<span class="ol-mini-tag border">Border</span>');
        if (it.hasAspectFilter) tags.push('<span class="ol-mini-tag aspect">GPU Aspect</span>');
        else if (it.aspect && it.aspect.ratio && it.aspect.ratio !== 'native') tags.push(`<span class="ol-mini-tag aspect">${esc(it.aspect.ratio)}</span>`);
        if (it.rect?.hasBounds) tags.push('<span class="ol-mini-tag bounds">Bounds</span>');
        return `
        <div class="ol-layer-row${it.sceneItemId === selectedItemId ? ' is-selected' : ''}${!it.visible ? ' is-hidden' : ''}" data-layer-id="${it.sceneItemId}">
            <div class="ol-layer-top">
                <button type="button" class="ol-icon-btn${it.visible ? ' is-active' : ''}" data-act="vis" title="Toggle Visibility">${it.visible ? SVG_EYE_ON : SVG_EYE_OFF}</button>
                <span class="ol-layer-name" title="${esc(it.sourceName)}">${esc(it.sourceName)}</span>
                <button type="button" class="ol-icon-btn" data-act="up" title="Bring Forward">${SVG_UP}</button>
                <button type="button" class="ol-icon-btn" data-act="down" title="Send Backward">${SVG_DOWN}</button>
                <button type="button" class="ol-icon-btn${it.locked ? ' is-active' : ''}" data-act="lock" title="Toggle Lock">${it.locked ? SVG_LOCK_ON : SVG_LOCK_OFF}</button>
            </div>
            ${tags.length ? `<div class="ol-layer-tags">${tags.join('')}</div>` : ''}
        </div>`;
    }).join('') || '<div style="font-size:12px;color:var(--text-muted);">No sources in this scene.</div>';
}

function renderInspector() {
    const item = getSelectedItem();
    $('ol-sel-title').textContent = item ? item.sourceName : 'No Source Selected';
    $('ol-sel-kind').textContent = item ? (item.inputKind || (item.isGroup ? 'Group' : 'Source')) : '—';
    if (!item) return;

    $('ol-x').value = Math.round(item.rect.left);
    $('ol-y').value = Math.round(item.rect.top);
    $('ol-w').value = Math.round(item.rect.width);
    $('ol-h').value = Math.round(item.rect.height);
    $('ol-rot').value = Math.round(item.transform?.rotation || 0);
    if ($('ol-bounds-type')) {
        $('ol-bounds-type').value = item.transform?.boundsType || 'OBS_BOUNDS_NONE';
    }

    const br = $('ol-border-readout');
    if (br) {
        if (item.hasBorderFilter && item.borderOuterRect) {
            const boxes = computeScaledBorderBoxes(item, item.rect);
            br.hidden = false;
            br.textContent = `StreamPulse Border — Outer: ${Math.round(boxes.outer.width)}×${Math.round(boxes.outer.height)} • Content: ${Math.round(boxes.content?.width || 0)}×${Math.round(boxes.content?.height || 0)}`;
        } else {
            br.hidden = true;
        }
    }

    const modeBadge = $('ol-aspect-mode-badge');
    if (modeBadge) {
        if (item.hasAspectFilter) {
            modeBadge.textContent = 'GPU Filter Active';
            modeBadge.className = 'ol-pill live';
        } else {
            modeBadge.textContent = 'Native OBS Crop';
            modeBadge.className = 'ol-pill warn';
        }
    }

    const cfg = item.aspect || studioState?.sources?.[item.sourceName] || {
        ratio: 'native', resizeMode: 'lock-width', anchor: 'c', panX: 0, panY: 0, zoom: 1, durationMs: 400
    };
    selectedRatio = cfg.ratio || 'native';
    selectedAnchor = cfg.anchor || 'c';

    $('ol-ratio-chips').querySelectorAll('[data-ratio]').forEach(btn => {
        btn.classList.toggle('btn-primary', btn.dataset.ratio === selectedRatio);
        btn.classList.toggle('btn-secondary', btn.dataset.ratio !== selectedRatio);
    });
    $('ol-resize-mode').value = cfg.resizeMode || 'lock-width';
    $('ol-anchor-grid').querySelectorAll('[data-anchor]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.anchor === selectedAnchor);
    });
    $('ol-pan-x').value = String(cfg.panX ?? 0);
    $('ol-pan-x-val').textContent = String(cfg.panX ?? 0);
    $('ol-pan-y').value = String(cfg.panY ?? 0);
    $('ol-pan-y-val').textContent = String(cfg.panY ?? 0);
    $('ol-zoom').value = String(cfg.zoom ?? 1);
    $('ol-zoom-val').textContent = String(Math.round((cfg.zoom ?? 1) * 100));
    $('ol-duration').value = String(cfg.durationMs ?? 400);
}

function buildLayoutThumbSvg(layout) {
    const w = 1920;
    const h = 1080;
    const rects = (layout.items || []).filter(it => it.visible !== false && it.transform).map((it, idx) => {
        const t = it.transform || {};
        const rw = Math.max(40, Number(t.boundsWidth) || Math.abs(Number(t.scaleX) || 0.35) * 1920);
        const rh = Math.max(24, Number(t.boundsHeight) || Math.abs(Number(t.scaleY) || 0.35) * 1080);
        const x = Number(t.positionX) || 0;
        const y = Number(t.positionY) || 0;
        const hue = (idx * 55 + 195) % 360;
        return `<g>
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.min(w, rw).toFixed(1)}" height="${Math.min(h, rh).toFixed(1)}" rx="12" fill="hsla(${hue}, 78%, 58%, 0.16)" stroke="hsla(${hue}, 82%, 65%, 0.85)" stroke-width="6"/>
            <text x="${(x + 18).toFixed(1)}" y="${(y + 42).toFixed(1)}" fill="#e2e8f0" font-size="34" font-family="system-ui, sans-serif" font-weight="700">${esc((it.sourceName || "").slice(0, 18))}</text>
        </g>`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <line x1="960" y1="0" x2="960" y2="1080" stroke="rgba(148,163,184,0.16)" stroke-width="3"/>
        <line x1="0" y1="540" x2="1920" y2="540" stroke="rgba(148,163,184,0.16)" stroke-width="3"/>
        ${rects}
    </svg>`;
}

function renderLayoutsDeck() {
    const allLayouts = studioState?.layouts || [];
    const tabCount = $('ol-layouts-tab-count');
    if (tabCount) tabCount.textContent = String(allLayouts.length);

    const filterSel = $('ol-deck-scene-filter');
    if (filterSel) {
        const curVal = filterSel.value;
        const sceneNames = [...new Set(allLayouts.map(l => l.sceneName).filter(Boolean))];
        filterSel.innerHTML = `<option value="">All Scenes (${allLayouts.length})</option>` +
            sceneNames.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
        if (sceneNames.includes(curVal)) filterSel.value = curVal;
    }

    const deck = $('ol-layouts-deck');
    if (!deck) return;
    const sceneFilter = filterSel?.value || "";
    const q = ($('ol-deck-search')?.value || "").trim().toLowerCase();
    const filtered = allLayouts.filter(l => {
        if (sceneFilter && l.sceneName !== sceneFilter) return false;
        if (q && !String(l.name || "").toLowerCase().includes(q) && !String(l.sceneName || "").toLowerCase().includes(q)) return false;
        return true;
    });

    if (!filtered.length) {
        deck.innerHTML = `<div class="ol-panel" style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted);">
            No saved layouts match your filter. Arrange sources in <strong>Scene Stage</strong> or click <strong>Save Current Scene</strong> above to create a save point.
        </div>`;
        return;
    }

    deck.innerHTML = filtered.map(l => {
        const tType = l.transitionType || "move";
        const pType = l.pathType || "direct";
        const dur = l.durationMs ?? 450;
        const ease = l.easing || "ease-in-out";
        const canOverwrite = Boolean(currentScene && l.sceneName === currentScene);
        return `
        <article class="ol-layout-card" data-deck-layout="${esc(l.id)}">
            <div class="ol-layout-thumb">${buildLayoutThumbSvg(l)}</div>
            <div class="ol-layout-card-head">
                <div class="ol-layout-card-title" title="${esc(l.name)}">${esc(l.name)}</div>
                <span class="ol-pill">${esc(l.sceneName || "Any Scene")}</span>
            </div>
            <div class="ol-layout-card-meta">
                <span class="ol-pill beta">${esc(tType)}</span>
                <span class="ol-pill">${esc(pType)}</span>
                <span class="ol-pill">${dur}ms · ${esc(ease)}</span>
                <span class="ol-pill">${(l.items || []).length} items</span>
            </div>
            <div class="ol-layout-card-actions">
                <button type="button" class="btn btn-primary btn-sm" data-deck-act="apply" data-id="${esc(l.id)}">Apply to OBS</button>
                <button type="button" class="btn btn-secondary btn-sm" data-deck-act="stage" data-id="${esc(l.id)}">Stage &amp; Path</button>
                ${canOverwrite ? `<button type="button" class="btn btn-secondary btn-sm" data-deck-act="overwrite" data-id="${esc(l.id)}" title="Update this snapshot with current scene positions">Update</button>` : ""}
                <button type="button" class="btn btn-secondary btn-sm" data-deck-act="duplicate" data-id="${esc(l.id)}">Clone</button>
                <button type="button" class="btn btn-secondary btn-sm" data-deck-act="copy" data-id="${esc(l.id)}" title="Copy Bitfocus Companion URL">URL</button>
                <button type="button" class="btn btn-secondary btn-sm" data-deck-act="delete" data-id="${esc(l.id)}">Del</button>
            </div>
        </article>`;
    }).join("");
}

function renderLayoutsList() {
    renderLayoutsDeck();
    const list = $('ol-layout-list');
    if (!list) return;
    const layouts = (studioState?.layouts || []).filter(l => !currentScene || l.sceneName === currentScene);
    list.innerHTML = layouts.map(l => {
        const isPrev = previewLayoutId === l.id;
        const meta = `${l.transitionType || 'move'} · ${l.pathType || 'direct'} · ${l.durationMs ?? 450}ms`;
        return `
        <div class="ol-layout-item${isPrev ? ' is-previewing' : ''}">
            <div class="ol-layout-head">
                <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(l.name)}</strong>
                <span class="ol-pill">${esc(meta)}</span>
            </div>
            <div class="ol-layout-actions">
                <button type="button" class="btn btn-primary btn-sm" data-apply-layout="${esc(l.id)}">Apply</button>
                <button type="button" class="btn btn-secondary btn-sm" data-preview-layout="${esc(l.id)}">${isPrev ? 'Hide Path' : 'Path'}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-copy-layout="${esc(l.id)}" title="Copy Bitfocus Companion URL">URL</button>
                <button type="button" class="btn btn-secondary btn-sm" data-del-layout="${esc(l.id)}">Del</button>
            </div>
        </div>`;
    }).join('') || '<div style="font-size:12px;color:var(--text-muted);">No saved snapshots for this scene yet.</div>';
}

function collectSnapTargets(excludeItemId) {
    const xTargets = [0, baseWidth / 3, baseWidth / 2, (baseWidth * 2) / 3, baseWidth];
    const yTargets = [0, baseHeight / 3, baseHeight / 2, (baseHeight * 2) / 3, baseHeight];
    for (const other of items) {
        if (other.sceneItemId === excludeItemId || !other.visible) continue;
        const box = getEffectiveSnapBox(other, other.rect);
        xTargets.push(box.left, (box.left + box.right) / 2, box.right);
        yTargets.push(box.top, (box.top + box.bottom) / 2, box.bottom);
    }
    return { xTargets, yTargets };
}

function findNearest(val, targets, tol = 10) {
    let best = null;
    let bestDist = tol;
    for (const t of targets) {
        const d = Math.abs(val - t);
        if (d <= bestDist) {
            bestDist = d;
            best = t;
        }
    }
    return best;
}

function computeSnap(rect, item) {
    if (!$('ol-snap-edges').checked) return { left: rect.left, top: rect.top, guides: [] };
    const { xTargets, yTargets } = collectSnapTargets(item.sceneItemId);
    const guides = [];
    let left = rect.left;
    let top = rect.top;

    const eff = getEffectiveSnapBox(item, rect);
    const xChecks = [
        { val: eff.left, apply: t => { left = t - eff.insetLeft; } },
        { val: (eff.left + eff.right) / 2, apply: t => { left = t - (eff.insetLeft + (eff.right - eff.left) / 2); } },
        { val: eff.right, apply: t => { left = t + eff.insetRight - rect.width; } }
    ];
    for (const c of xChecks) {
        const hit = findNearest(c.val, xTargets);
        if (hit !== null) {
            c.apply(hit);
            guides.push({ axis: 'v', pos: hit });
            break;
        }
    }

    const yChecks = [
        { val: eff.top, apply: t => { top = t - eff.insetTop; } },
        { val: (eff.top + eff.bottom) / 2, apply: t => { top = t - (eff.insetTop + (eff.bottom - eff.top) / 2); } },
        { val: eff.bottom, apply: t => { top = t + eff.insetBottom - rect.height; } }
    ];
    for (const c of yChecks) {
        const hit = findNearest(c.val, yTargets);
        if (hit !== null) {
            c.apply(hit);
            guides.push({ axis: 'h', pos: hit });
            break;
        }
    }

    return { left, top, guides };
}

function computeResizeSnap(rect, mode, item) {
    if (!$('ol-snap-edges').checked) return { rect, guides: [] };
    const { xTargets, yTargets } = collectSnapTargets(item.sceneItemId);
    const guides = [];
    const out = { ...rect };
    const eff = getEffectiveSnapBox(item, out);

    if (mode.includes('e')) {
        const hit = findNearest(eff.right, xTargets);
        if (hit !== null && (hit + eff.insetRight) - out.left >= 16) {
            out.width = (hit + eff.insetRight) - out.left;
            guides.push({ axis: 'v', pos: hit });
        }
    } else if (mode.includes('w')) {
        const right = out.left + out.width;
        const hit = findNearest(eff.left, xTargets);
        if (hit !== null && right - (hit - eff.insetLeft) >= 16) {
            out.left = hit - eff.insetLeft;
            out.width = right - out.left;
            guides.push({ axis: 'v', pos: hit });
        }
    }
    if (mode.includes('s')) {
        const hit = findNearest(eff.bottom, yTargets);
        if (hit !== null && (hit + eff.insetBottom) - out.top >= 16) {
            out.height = (hit + eff.insetBottom) - out.top;
            guides.push({ axis: 'h', pos: hit });
        }
    } else if (mode.includes('n')) {
        const bottom = out.top + out.height;
        const hit = findNearest(eff.top, yTargets);
        if (hit !== null && bottom - (hit - eff.insetTop) >= 16) {
            out.top = hit - eff.insetTop;
            out.height = bottom - out.top;
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
            || cur.transform?.boundsType !== snap.transform?.boundsType
            || cur.transform?.cropLeft !== snap.transform?.cropLeft
            || cur.transform?.cropRight !== snap.transform?.cropRight
            || cur.transform?.cropTop !== snap.transform?.cropTop
            || cur.transform?.cropBottom !== snap.transform?.cropBottom;
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
            cropLeft: Number(item.transform?.cropLeft) || 0,
            cropRight: Number(item.transform?.cropRight) || 0,
            cropTop: Number(item.transform?.cropTop) || 0,
            cropBottom: Number(item.transform?.cropBottom) || 0,
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

async function loadScene(sceneName, { preserveHistory = false, historyLabel = '' } = {}) {
    if (!sceneName) return;
    const sceneChanged = sceneName !== currentScene;
    currentScene = sceneName;
    if (sceneChanged) {
        previewLayoutId = null;
        customControlPoint = null;
    }
    try { localStorage.setItem(SCENE_STORAGE_KEY, sceneName); } catch { /* ignore */ }
    const data = await api(`/api/obs-layout/scene?name=${encodeURIComponent(sceneName)}`);
    baseWidth = data.baseWidth || 1920;
    baseHeight = data.baseHeight || 1080;
    items = (data.items || []).map(it => ({ ...it, _origRect: { ...it.rect } }));
    if (!items.some(i => i.sceneItemId === selectedItemId)) {
        selectedItemId = items.length ? items[items.length - 1].sceneItemId : null;
    }
    if (!preserveHistory || sceneChanged || !historyStack.length) {
        historyStack = [];
        historyIndex = -1;
        recordHistory('Initial scene state');
    } else if (historyLabel) {
        recordHistory(historyLabel);
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

async function applyAspectNow(ratioOverride = null) {
    const sel = getSelectedItem();
    if (!sel) return;
    if (ratioOverride) {
        selectedRatio = ratioOverride;
        $('ol-ratio-chips').querySelectorAll('[data-ratio]').forEach(b => {
            b.classList.toggle('btn-primary', b.dataset.ratio === selectedRatio);
            b.classList.toggle('btn-secondary', b.dataset.ratio !== selectedRatio);
        });
    }
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
                durationMs: Number($('ol-duration').value) || 0,
                transitionType: $('ol-trans-type')?.value || 'move',
                pathType: $('ol-path-type')?.value || 'direct',
                easing: $('ol-easing')?.value || 'ease-in-out'
            })
        });
        studioState = { ...studioState, ...res.state };
        const note = res.mode === 'gpu-filter'
            ? `Morphed ${sel.sourceName} to ${selectedRatio} (GPU Filter)`
            : res.hasBorderFilter
                ? `Cropped ${sel.sourceName} to ${selectedRatio} (Native OBS Crop — load streampulse-aspect.lua in OBS Scripts so StreamPulse Border wraps the new shape)`
                : `Cropped ${sel.sourceName} to ${selectedRatio} (Native OBS Crop)`;
        showNotice(note);
        await loadScene(currentScene, { preserveHistory: true, historyLabel: `Aspect ${selectedRatio} (${sel.sourceName})` });
    } catch (err) {
        showNotice(err.message);
    }
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
    const valid = ['stage', 'layouts', 'setup'].includes(tab) ? tab : 'stage';
    try { localStorage.setItem(TAB_STORAGE_KEY, valid); } catch { /* ignore */ }
    document.querySelectorAll('[data-ol-tab]').forEach(btn => {
        const on = btn.dataset.olTab === valid;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-ol-pane]').forEach(pane => {
        pane.hidden = pane.dataset.olPane !== valid;
    });
    if (valid === 'stage') layoutCanvas();
}

function switchInspectorTab(tab) {
    const valid = ['transform', 'aspect', 'motion'].includes(tab) ? tab : 'transform';
    try { localStorage.setItem(INSP_STORAGE_KEY, valid); } catch { /* ignore */ }
    document.querySelectorAll('[data-insp-tab]').forEach(btn => {
        const on = btn.dataset.inspTab === valid;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-insp-pane]').forEach(pane => {
        pane.hidden = pane.dataset.inspPane !== valid;
    });
}

function bindEvents() {
    document.querySelectorAll('[data-ol-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTopTab(btn.dataset.olTab));
    });
    document.querySelectorAll('[data-insp-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchInspectorTab(btn.dataset.inspTab));
    });

    $('ol-scene-select').addEventListener('change', e => loadScene(e.target.value));
    $('ol-btn-refresh').addEventListener('click', () => loadScene(currentScene));
    $('ol-btn-undo')?.addEventListener('click', () => restoreHistoryIndex(historyIndex - 1));
    $('ol-btn-redo')?.addEventListener('click', () => restoreHistoryIndex(historyIndex + 1));
    $('ol-btn-revert')?.addEventListener('click', () => restoreHistoryIndex(0));

    $('ol-history-list')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-history-idx]');
        if (!btn) return;
        restoreHistoryIndex(Number(btn.dataset.historyIdx));
    });

    window.addEventListener('keydown', e => {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) restoreHistoryIndex(historyIndex + 1);
            else restoreHistoryIndex(historyIndex - 1);
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            restoreHistoryIndex(historyIndex + 1);
        }
    });

    $('ol-btn-snapshot').addEventListener('click', () => {
        $('ol-show-backdrop').checked = true;
        refreshSnapshot();
    });
    $('ol-show-backdrop').addEventListener('change', () => {
        if ($('ol-show-backdrop').checked && !backdropDataUrl) refreshSnapshot();
        else renderCanvas();
    });
    $('ol-show-guides')?.addEventListener('change', () => renderCanvas());
    $('ol-show-borders')?.addEventListener('change', () => renderCanvas());

    $('ol-bounds-type')?.addEventListener('change', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        const boundsType = $('ol-bounds-type').value;
        sel.transform.boundsType = boundsType;
        const extra = { boundsType };
        if (boundsType !== 'OBS_BOUNDS_NONE') {
            extra.boundsWidth = Number(Math.max(8, sel.rect.width).toFixed(3));
            extra.boundsHeight = Number(Math.max(8, sel.rect.height).toFixed(3));
        }
        await pushTransformNow(sel, extra, { refreshBackdrop: true });
        await loadScene(currentScene, { preserveHistory: true, historyLabel: `Bounds ${sel.sourceName}` });
    });

    $('ol-btn-copy-lua')?.addEventListener('click', () => {
        navigator.clipboard?.writeText($('ol-lua-path').textContent || '');
        showNotice('Copied Lua script path to clipboard.');
    });

    // Dedicated Left Layers Panel interactions (select, visibility, lock, z-order up/down)
    $('ol-layer-list').addEventListener('click', async e => {
        const row = e.target.closest('[data-layer-id]');
        if (!row) return;
        const id = Number(row.dataset.layerId);
        const item = items.find(i => i.sceneItemId === id);
        if (!item) return;
        const actBtn = e.target.closest('[data-act]');
        if (actBtn) {
            const act = actBtn.dataset.act;
            if (act === 'vis') {
                item.visible = !item.visible;
                await api('/api/obs-layout/transform', {
                    method: 'POST',
                    body: JSON.stringify({ sceneName: currentScene, sceneItemId: id, visible: item.visible })
                }).catch(() => {});
                recordHistory(`${item.visible ? 'Show' : 'Hide'} ${item.sourceName}`);
                renderLayers();
                renderCanvas();
                scheduleBackdropRefresh(140);
            } else if (act === 'lock') {
                item.locked = !item.locked;
                await api('/api/obs-layout/transform', {
                    method: 'POST',
                    body: JSON.stringify({ sceneName: currentScene, sceneItemId: id, locked: item.locked })
                }).catch(() => {});
                recordHistory(`${item.locked ? 'Lock' : 'Unlock'} ${item.sourceName}`);
                renderLayers();
                renderCanvas();
            } else if (act === 'up' || act === 'down') {
                const curIdx = Number(item.sceneItemIndex ?? items.indexOf(item));
                const nextIdx = act === 'up' ? Math.min(items.length - 1, curIdx + 1) : Math.max(0, curIdx - 1);
                if (nextIdx !== curIdx) {
                    await api('/api/obs-layout/transform', {
                        method: 'POST',
                        body: JSON.stringify({ sceneName: currentScene, sceneItemId: id, sceneItemIndex: nextIdx })
                    }).catch(() => {});
                    await loadScene(currentScene, { preserveHistory: true, historyLabel: `Reorder ${item.sourceName}` });
                }
            }
            return;
        }
        selectedItemId = id;
        renderLayers();
        renderInspector();
        renderCanvas();
    });

    // Canvas drag, resize & Custom Bezier Path Control Point dragging
    $('ol-canvas').addEventListener('pointerdown', e => {
        const cpEl = e.target.closest('[data-cp-handle]');
        if (cpEl) {
            e.preventDefault();
            cpDragState = {
                startX: e.clientX,
                startY: e.clientY,
                orig: { ...(customControlPoint || { x: baseWidth / 2, y: baseHeight / 2 }) }
            };
            window.addEventListener('pointermove', onCpPointerMove);
            window.addEventListener('pointerup', onCpPointerUp, { once: true });
            return;
        }
        const box = e.target.closest('.ol-item-box');
        if (!box) return;
        const id = Number(box.dataset.id);
        const item = items.find(i => i.sceneItemId === id);
        if (!item) return;
        selectedItemId = id;
        renderLayers();
        renderInspector();
        renderCanvas();
        if (item.locked) return;
        const handle = e.target.closest('.ol-handle');
        dragState = {
            item,
            mode: handle ? handle.dataset.h : 'move',
            startX: e.clientX,
            startY: e.clientY,
            orig: { ...item.rect }
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
    });

    function onCpPointerMove(e) {
        if (!cpDragState) return;
        const dx = (e.clientX - cpDragState.startX) / canvasScale;
        const dy = (e.clientY - cpDragState.startY) / canvasScale;
        customControlPoint = {
            x: Math.round(Math.max(0, Math.min(baseWidth, cpDragState.orig.x + dx))),
            y: Math.round(Math.max(0, Math.min(baseHeight, cpDragState.orig.y + dy)))
        };
        renderCanvas();
    }

    function onCpPointerUp() {
        window.removeEventListener('pointermove', onCpPointerMove);
        cpDragState = null;
        if (customControlPoint) {
            showNotice(`Custom path control point set to (${customControlPoint.x}, ${customControlPoint.y})`);
        }
    }

    function onPointerMove(e) {
        if (!dragState) return;
        const { item, mode, startX, startY, orig } = dragState;
        const dx = (e.clientX - startX) / canvasScale;
        const dy = (e.clientY - startY) / canvasScale;
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

    // Full 6-way Canvas Align (border-aware!) + Fit + Reset Crop
    async function alignSelected(kind) {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        const eff = getEffectiveSnapBox(sel, sel.rect);
        const effW = eff.right - eff.left;
        const effH = eff.bottom - eff.top;
        if (kind === 'left') sel.rect.left = -eff.insetLeft;
        else if (kind === 'ch') sel.rect.left = (baseWidth - effW) / 2 - eff.insetLeft;
        else if (kind === 'right') sel.rect.left = baseWidth - effW - eff.insetLeft;
        else if (kind === 'top') sel.rect.top = -eff.insetTop;
        else if (kind === 'cv') sel.rect.top = (baseHeight - effH) / 2 - eff.insetTop;
        else if (kind === 'bottom') sel.rect.top = baseHeight - effH - eff.insetTop;
        else if (kind === 'fit') {
            sel.rect.left = 0; sel.rect.top = 0; sel.rect.width = baseWidth; sel.rect.height = baseHeight;
        }
        renderCanvas();
        renderInspector();
        recordHistory(`Align ${kind.toUpperCase()} ${sel.sourceName}`);
        await pushTransformNow(sel, {}, { refreshBackdrop: true });
    }

    $('ol-align-left')?.addEventListener('click', () => alignSelected('left'));
    $('ol-align-ch')?.addEventListener('click', () => alignSelected('ch'));
    $('ol-align-right')?.addEventListener('click', () => alignSelected('right'));
    $('ol-align-top')?.addEventListener('click', () => alignSelected('top'));
    $('ol-align-cv')?.addEventListener('click', () => alignSelected('cv'));
    $('ol-align-bottom')?.addEventListener('click', () => alignSelected('bottom'));
    $('ol-align-fit')?.addEventListener('click', () => alignSelected('fit'));

    $('ol-reset-crop')?.addEventListener('click', async () => {
        const sel = getSelectedItem();
        if (!sel || sel.locked) return;
        await pushTransformNow(sel, { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 }, { refreshBackdrop: true });
        await loadScene(currentScene, { preserveHistory: true, historyLabel: `Reset Crop ${sel.sourceName}` });
    });

    // Aspect ratio controls — clicking a ratio chip applies immediately!
    $('ol-ratio-chips').addEventListener('click', e => {
        const btn = e.target.closest('[data-ratio]');
        if (!btn) return;
        applyAspectNow(btn.dataset.ratio);
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
            showNotice(`Attached StreamPulse Aspect GPU filter to ${sel.sourceName}`);
            await loadScene(currentScene, { preserveHistory: true });
        } catch (err) {
            showNotice(`Could not attach GPU filter (load streampulse-aspect.lua in OBS Tools -> Scripts first): ${err.message}`);
        }
    });

    $('ol-btn-apply-aspect').addEventListener('click', () => applyAspectNow());

    // Motion & Path controls
    $('ol-path-curve')?.addEventListener('input', () => {
        $('ol-path-curve-val').textContent = $('ol-path-curve').value;
        if (previewLayoutId) renderCanvas();
    });
    $('ol-path-type')?.addEventListener('change', () => {
        const pt = $('ol-path-type').value;
        if ($('ol-curve-wrap')) $('ol-curve-wrap').hidden = pt === 'direct' || pt === 'custom';
        if (previewLayoutId) renderCanvas();
    });

    async function saveCurrentLayoutSnapshot(name, existingId = null) {
        if (!name || !currentScene) return;
        const layoutItems = items.map(it => ({
            sourceName: it.sourceName,
            visible: it.visible,
            transform: {
                ...rectToObsPatch(it, it.rect),
                cropLeft: Number(it.transform?.cropLeft) || 0,
                cropRight: Number(it.transform?.cropRight) || 0,
                cropTop: Number(it.transform?.cropTop) || 0,
                cropBottom: Number(it.transform?.cropBottom) || 0,
                ...(it.transform?.boundsType ? { boundsType: it.transform.boundsType } : {})
            },
            aspect: it.aspect || studioState?.sources?.[it.sourceName] || null
        }));
        const res = await api('/api/obs-layout/layouts', {
            method: 'POST',
            body: JSON.stringify({
                ...(existingId ? { id: existingId } : {}),
                name,
                sceneName: currentScene,
                durationMs: Number($('ol-trans-dur')?.value) || 450,
                transitionType: $('ol-trans-type')?.value || 'move',
                pathType: $('ol-path-type')?.value || 'direct',
                pathCurve: (Number($('ol-path-curve')?.value) || 28) / 100,
                pathControlPoint: $('ol-path-type')?.value === 'custom' ? customControlPoint : null,
                easing: $('ol-easing')?.value || 'ease-in-out',
                items: layoutItems
            })
        });
        studioState = { ...studioState, ...res.state };
        renderLayoutsList();
        return res;
    }

    // Saved Layout Snapshots (Save Points)
    $('ol-btn-save-layout').addEventListener('click', async () => {
        const name = $('ol-layout-name').value.trim();
        if (!name || !currentScene) return;
        try {
            await saveCurrentLayoutSnapshot(name);
            $('ol-layout-name').value = '';
            showNotice(`Saved layout snapshot "${name}"`);
        } catch (err) {
            showNotice(err.message);
        }
    });

    // Dedicated Saved Layouts Deck Tab handlers
    $('ol-deck-scene-filter')?.addEventListener('change', () => renderLayoutsDeck());
    $('ol-deck-search')?.addEventListener('input', () => renderLayoutsDeck());
    $('ol-deck-btn-save')?.addEventListener('click', async () => {
        const name = $('ol-deck-save-name')?.value.trim();
        if (!name || !currentScene) return;
        try {
            await saveCurrentLayoutSnapshot(name);
            $('ol-deck-save-name').value = '';
            showNotice(`Saved layout snapshot "${name}"`);
        } catch (err) {
            showNotice(err.message);
        }
    });

    $('ol-layouts-deck')?.addEventListener('click', async e => {
        const btn = e.target.closest('[data-deck-act]');
        if (!btn) return;
        const act = btn.dataset.deckAct;
        const id = btn.dataset.id;
        const layout = (studioState?.layouts || []).find(l => l.id === id);
        if (!layout) return;

        if (act === 'apply') {
            try {
                await api('/api/obs-layout/layouts/apply', {
                    method: 'POST',
                    body: JSON.stringify({ id })
                });
                showNotice(`Applied layout "${layout.name}"`);
                if (layout.sceneName === currentScene) {
                    await loadScene(currentScene, { preserveHistory: true, historyLabel: `Layout: ${layout.name}` });
                }
            } catch (err) {
                showNotice(err.message);
            }
        } else if (act === 'stage') {
            switchTopTab('stage');
            switchInspectorTab('motion');
            if (layout.sceneName && layout.sceneName !== currentScene) {
                const sel = $('ol-scene-select');
                if (sel) sel.value = layout.sceneName;
                await loadScene(layout.sceneName);
            }
            previewLayoutId = id;
            if ($('ol-trans-type') && layout.transitionType) $('ol-trans-type').value = layout.transitionType;
            if ($('ol-path-type') && layout.pathType) $('ol-path-type').value = layout.pathType;
            if ($('ol-easing') && layout.easing) $('ol-easing').value = layout.easing;
            if ($('ol-trans-dur') && layout.durationMs !== undefined) $('ol-trans-dur').value = String(layout.durationMs);
            if (layout.pathControlPoint) customControlPoint = { ...layout.pathControlPoint };
            renderLayoutsList();
            renderCanvas();
        } else if (act === 'overwrite') {
            try {
                await saveCurrentLayoutSnapshot(layout.name, layout.id);
                showNotice(`Updated layout "${layout.name}" with current scene state`);
            } catch (err) {
                showNotice(err.message);
            }
        } else if (act === 'duplicate') {
            try {
                const clone = { ...layout, id: undefined, name: `${layout.name} (Copy)` };
                const res = await api('/api/obs-layout/layouts', {
                    method: 'POST',
                    body: JSON.stringify(clone)
                });
                studioState = { ...studioState, ...res.state };
                renderLayoutsList();
                showNotice(`Cloned "${layout.name}"`);
            } catch (err) {
                showNotice(err.message);
            }
        } else if (act === 'copy') {
            const url = `${window.location.origin}/api/obs-layout/layouts/apply?id=${encodeURIComponent(id)}`;
            navigator.clipboard?.writeText(url);
            showNotice(`Copied Companion URL for "${layout.name}"`);
        } else if (act === 'delete') {
            try {
                const res = await api(`/api/obs-layout/layouts/${encodeURIComponent(id)}`, { method: 'DELETE' });
                studioState = { ...studioState, ...res.state };
                if (previewLayoutId === id) previewLayoutId = null;
                renderLayoutsList();
                renderCanvas();
                showNotice(`Deleted "${layout.name}"`);
            } catch (err) {
                showNotice(err.message);
            }
        }
    });

    $('ol-layout-list').addEventListener('click', async e => {
        const applyBtn = e.target.closest('[data-apply-layout]');
        if (applyBtn) {
            const id = applyBtn.dataset.applyLayout;
            try {
                const payload = {
                    id,
                    durationMs: Number($('ol-trans-dur')?.value),
                    transitionType: $('ol-trans-type')?.value || 'move',
                    pathType: $('ol-path-type')?.value || 'direct',
                    pathCurve: (Number($('ol-path-curve')?.value) || 28) / 100,
                    easing: $('ol-easing')?.value || 'ease-in-out',
                    ...($('ol-path-type')?.value === 'custom' && customControlPoint ? { pathControlPoint: customControlPoint } : {})
                };
                await api('/api/obs-layout/layouts/apply', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                showNotice(`Applied layout snapshot (${payload.transitionType} · ${payload.pathType} · ${payload.durationMs}ms)`);
                await loadScene(currentScene, { preserveHistory: true, historyLabel: 'Applied Layout Snapshot' });
            } catch (err) {
                showNotice(err.message);
            }
            return;
        }
        const prevBtn = e.target.closest('[data-preview-layout]');
        if (prevBtn) {
            const id = prevBtn.dataset.previewLayout;
            previewLayoutId = previewLayoutId === id ? null : id;
            const layout = (studioState?.layouts || []).find(l => l.id === previewLayoutId);
            if (layout) {
                if ($('ol-trans-type') && layout.transitionType) $('ol-trans-type').value = layout.transitionType;
                if ($('ol-path-type') && layout.pathType) $('ol-path-type').value = layout.pathType;
                if ($('ol-easing') && layout.easing) $('ol-easing').value = layout.easing;
                if ($('ol-trans-dur') && layout.durationMs !== undefined) $('ol-trans-dur').value = String(layout.durationMs);
                if (layout.pathControlPoint) customControlPoint = { ...layout.pathControlPoint };
                if ($('ol-curve-wrap')) $('ol-curve-wrap').hidden = (layout.pathType === 'direct' || layout.pathType === 'custom');
            }
            renderLayoutsList();
            renderCanvas();
            return;
        }
        const copyBtn = e.target.closest('[data-copy-layout]');
        if (copyBtn) {
            const url = `${window.location.origin}/api/obs-layout/layouts/apply?id=${encodeURIComponent(copyBtn.dataset.copyLayout)}`;
            navigator.clipboard?.writeText(url);
            showNotice('Copied Bitfocus Companion layout trigger URL.');
            return;
        }
        const delBtn = e.target.closest('[data-del-layout]');
        if (delBtn) {
            try {
                const res = await api(`/api/obs-layout/layouts/${encodeURIComponent(delBtn.dataset.delLayout)}`, { method: 'DELETE' });
                studioState = { ...studioState, ...res.state };
                if (previewLayoutId === delBtn.dataset.delLayout) previewLayoutId = null;
                renderLayoutsList();
                renderCanvas();
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
