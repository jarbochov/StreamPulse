/**
 * StreamPulse Custom Overlay Editor — Layers & Pages Management
 */

import {
    $, esc, ICON, TYPE_META, state, prefs, savePrefs, byId, selectedElements,
    pagesOn, inView, visibleElements, displayName, normalizeZ, setSelection,
    changed, flushHistory, ensureCurPage, uid, toast, defaultPages
} from './editor-state.js';
import { F, bindFields } from './editor-form.js';

let pgSortable = null;
let alertRules = null;
let liveState = null;

const liveId = () => (liveState?.enabled ? liveState.page : null);
const pageSeq = () => {
    let n = state.overlay.pages.items.length + 1;
    while (state.overlay.pages.items.some(p => p.id === `page-${n}`)) n++;
    return `page-${n}`;
};

export function pagesPanelBusy() {
    const a = document.activeElement;
    return a && $('pages-panel')?.contains(a) && a.matches('input, select');
}

// Callbacks registered from main
let renderCanvasHandler = () => {};
let renderPropertiesHandler = () => {};
let updateStatusBarHandler = () => {};
let renderAllHandler = () => {};

export function registerLayerCallbacks({ onRenderCanvas, onRenderProperties, onUpdateStatusBar, onRenderAll }) {
    if (onRenderCanvas) renderCanvasHandler = onRenderCanvas;
    if (onRenderProperties) renderPropertiesHandler = onRenderProperties;
    if (onUpdateStatusBar) updateStatusBarHandler = onUpdateStatusBar;
    if (onRenderAll) renderAllHandler = onRenderAll;
}

// ---- Layers Tree ------------------------------------------------------------------
export function renderLayers() {
    const list = $('layers');
    if (!list) return;
    const shown = visibleElements();
    const countEl = $('layer-count');
    if (countEl) countEl.textContent = shown.length ? `(${shown.length})` : '';

    if (pagesOn() && $('pages-panel') && !$('pages-panel').hidden && !pagesPanelBusy()) {
        renderPagesPanel();
    }
    if (!shown.length) {
        list.innerHTML = '<div class="layers-empty">No elements yet. Use <b>+ Add element</b> to start.</div>';
        return;
    }
    const top = shown.slice().reverse(), rows = [], seenGroups = new Set();
    for (const el of top) {
        if (!el.group) { rows.push({ el }); continue; }
        if (seenGroups.has(el.group)) continue;
        seenGroups.add(el.group);
        const members = top.filter(m => m.group === el.group);
        rows.push({ header: el.group, members });
        members.forEach(m => rows.push({ el: m, group: el.group }));
    }
    state.layerOrder = rows.filter(r => r.el).map(r => r.el);
    list.innerHTML = rows.map(row => {
        if (row.header) {
            const ids = row.members.map(m => m.id);
            const closed = state.collapsedGroups.has(row.header);
            const allHidden = row.members.every(m => m.visible === false);
            return `<div class="layer-group${closed ? ' collapsed' : ''}${ids.every(id => state.selectedIds.has(id)) ? ' selected' : ''}" data-group="${esc(row.header)}">
                <span class="chev" title="${closed ? 'Expand' : 'Collapse'} group">▾</span>
                <span class="layer-name" title="Double-click to rename">${esc(row.members.find(m => m.groupName)?.groupName || 'Group')} <small style="font-weight:400;opacity:.7">· ${ids.length}</small></span>
                <span class="layer-actions"><button data-layer-action="group-visible" title="${allHidden ? 'Show' : 'Hide'} group" aria-label="${allHidden ? 'Show' : 'Hide'} group">${allHidden ? ICON.eyeOff : ICON.eye}</button></span>
            </div>`;
        }
        const el = row.el, inGroup = row.group ? ` in-group${state.collapsedGroups.has(row.group) ? ' group-hidden' : ''}` : '';
        return `
        <div class="layer${state.selectedIds.has(el.id) ? ' selected' : ''}${el.visible === false ? ' is-hidden' : ''}${inGroup}" data-id="${esc(el.id)}">
            <span class="layer-grip" title="Drag to reorder">${ICON.grip}</span>
            <span class="layer-icon">${esc(TYPE_META[el.type]?.icon || '•')}</span>
            <span class="layer-name" title="Double-click to rename">${pagesOn() && el.page === '*' ? '◈ ' : ''}${esc(displayName(el))}</span>
            <span class="layer-actions">
                <button data-layer-action="lock" class="${el.locked ? 'on' : ''}" title="${el.locked ? 'Unlock' : 'Lock'}" aria-label="${el.locked ? 'Unlock' : 'Lock'} layer">${el.locked ? ICON.lock : ICON.unlock}</button>
                <button data-layer-action="visible" title="${el.visible === false ? 'Show' : 'Hide'}" aria-label="${el.visible === false ? 'Show' : 'Hide'} layer">${el.visible === false ? ICON.eyeOff : ICON.eye}</button>
            </span>
        </div>`;
    }).join('');
}

export function updateLayerSelection() {
    const list = $('layers');
    if (!list) return;
    for (const head of list.querySelectorAll('.layer-group')) {
        const members = state.overlay.elements.filter(el => el.group === head.dataset.group);
        head.classList.toggle('selected', members.length > 0 && members.every(el => state.selectedIds.has(el.id)));
    }
    for (const row of list.querySelectorAll('.layer')) {
        const on = state.selectedIds.has(row.dataset.id);
        row.classList.toggle('selected', on);
        if (on && state.selectedIds.size === 1) row.scrollIntoView({ block: 'nearest' });
    }
}

export function startRename(row) {
    const el = byId(row.dataset.id);
    const label = row.querySelector('.layer-name');
    if (!el || !label) return;
    const input = document.createElement('input');
    input.className = 'layer-name-input';
    input.value = el.name || displayName(el);
    input.maxLength = 80;
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
        if (done) return;
        done = true;
        const value = input.value.trim();
        if (commit && value !== (el.name || displayName(el))) { el.name = value; changed(true); }
        renderLayers();
        updateStatusBarHandler();
        if (state.selectedIds.has(el.id)) renderPropertiesHandler();
    };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
}

export function renameGroup(head) {
    const group = head.dataset.group, members = state.overlay.elements.filter(el => el.group === group);
    const label = head.querySelector('.layer-name');
    if (!label) return;
    const input = document.createElement('input');
    input.className = 'layer-name-input';
    input.value = members.find(m => m.groupName)?.groupName || '';
    input.placeholder = 'Group name';
    input.maxLength = 60;
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
        if (done) return;
        done = true;
        if (commit) {
            const value = input.value.trim();
            members.forEach(m => { m.groupName = value; });
            changed(true);
        }
        renderLayers();
    };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
}

// ---- Pages Panel ------------------------------------------------------------------
export function renderPageBar() {
    renderPageSwitch();
    renderPagesPanel();
}

export function renderPageSwitch() {
    const box = $('page-switch');
    if (!box) return;
    const on = pagesOn();
    box.hidden = !on;
    const pageCount = $('page-count');
    if (pageCount) pageCount.textContent = on ? `(${state.overlay.pages.items.length})` : '';
    if (!on) return;
    const live = liveId(), isLive = state.curPage === live;
    box.innerHTML = `<select id="page-select" aria-label="Page being edited">${state.overlay.pages.items.map((p, i) => `<option value="${esc(p.id)}"${p.id === state.curPage ? ' selected' : ''}>${i + 1}. ${esc(p.name)}${p.enabled === false ? ' (off)' : ''}${p.id === live ? '  ● live' : ''}</option>`).join('')}</select>
        <button id="live-toggle" aria-pressed="${isLive}" ${state.isNew ? 'disabled' : ''} title="${isLive ? 'This page is showing on stream' : 'Show this page on stream'}">${isLive ? '● Live' : 'Make live'}</button>`;
}

export function renderPagesPanel() {
    const panel = $('pages-panel');
    if (!panel) return;
    if (!pagesOn()) {
        panel.innerHTML = `<div class="pg-empty"><strong>Make this a slide deck</strong><p>Split the overlay into pages you can switch between from the editor, the control panel or the API. Existing elements go on Page 1, and anything marked shared shows on every page.</p><button id="pages-enable" class="primary">Turn on pages</button></div>`;
        return;
    }
    const items = state.overlay.pages.items;
    const live = liveId();
    const idx = items.findIndex(p => p.id === state.curPage);
    const cur = items[idx] || items[0];
    const count = id => state.overlay.elements.filter(el => el.page === id).length;
    const shared = state.overlay.elements.filter(el => el.page === '*').length;
    const P = state.overlay.pages;
    if (cur?.trigger === 'alert') loadAlertRules();

    const rowHtml = p => `
        <div class="pg-row${p.id === state.curPage ? ' current' : ''}${p.enabled === false ? ' off' : ''}" data-pid="${esc(p.id)}">
            <span class="pg-grip" title="Drag to reorder">${ICON.grip}</span>
            <span class="pg-main"><span class="pg-name" title="Double-click to rename">${p.trigger ? `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" style="display:inline-block;vertical-align:-1px;margin-right:3px"><title>Trigger page</title><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg> ` : ''}${esc(p.name)}</span>
                <span class="pg-meta">${p.id === live ? '<span class="pg-live">Live</span> · ' : ''}${p.enabled === false ? 'Off · ' : ''}${count(p.id)} element${count(p.id) === 1 ? '' : 's'}${p.duration ? ` · ${p.duration}s` : ''}</span></span>
            <span class="pg-actions">
                <button data-pg="toggle" class="${p.enabled === false ? '' : 'on'}" title="${p.enabled === false ? 'Enable this page' : 'Disable this page (skipped on stream)'}" aria-pressed="${p.enabled !== false}" ${p.enabled !== false && items.filter(x => x.enabled !== false).length === 1 ? 'disabled' : ''}>${p.enabled === false ? ICON.eyeOff : ICON.eye}</button>
                ${p.id === live || p.enabled === false ? '' : `<button data-pg="live" class="go" title="${state.isNew ? 'Save first to go live' : 'Make this page live'}" ${state.isNew ? 'disabled' : ''}>▶</button>`}
                <button data-pg="dup" title="Duplicate page">⧉</button>
                <button data-pg="del" class="danger" title="Delete page" ${items.length === 1 ? 'disabled' : ''}>✕</button>
            </span>
        </div>`;

    panel.innerHTML = `
        <div class="pg-head"><span>Pages</span><button id="page-add" title="Add a blank page">+ Add page</button></div>
        <div class="pg-list" id="pg-list">${items.filter(p => !p.trigger).map(rowHtml).join('')}</div>
        ${items.some(p => p.trigger) ? `<div class="pg-sub">Triggered pages <span>not in the rotation</span></div><div class="pg-list pg-trig" id="pg-trig-list">${items.filter(p => p.trigger).map(rowHtml).join('')}</div>` : ''}
        <div class="hint">${shared ? `${shared} shared element${shared === 1 ? '' : 's'} show on every page.` : 'Mark an element “Show on all pages” to share it across pages.'}</div>
        <div class="pg-card"><h4>${esc(cur?.name || '')}</h4>
            ${F.select(`pages.items.${idx}.trigger`, 'Show this page', cur?.trigger || '', [['', 'In the rotation'], ['alert', 'Only when an alert plays'], ['featured', 'Only when a message is featured'], ['command', 'Only when a chat command or trigger is used'], ['poll-end', 'Only when a Twitch poll ends'], ['poll-active', 'While a Twitch poll is active']])}
            ${cur?.trigger === 'alert' ? `<div class="field"><span>Alerts that show this page</span>${alertRules ? (alertRules.length ? `<div class="trule-list">${alertRules.map(r => `<label class="check"><input type="checkbox" data-trule="${esc(r.id)}" ${(cur.triggerRules || []).includes(r.id) ? 'checked' : ''}> ${esc(r.name || r.id)}</label>`).join('')}</div><div class="hint">${(cur.triggerRules || []).length ? 'Only the ticked alerts show this page.' : 'None ticked: any alert shows this page.'}</div>` : '<div class="hint">No alert rules yet.</div>') : '<div class="hint">Loading...</div>'}</div>` : ''}
            ${cur?.trigger === 'command' ? F.text(`pages.items.${idx}.triggerName`, 'Command or trigger name (blank = any)', cur.triggerName || '') : ''}
            ${cur?.trigger === 'poll-end' ? `<div class="hint">Shows this page when a Twitch poll completes. Leave &ldquo;Show for&rdquo; at 0 for default 15s.</div>` : ''}
            ${cur?.trigger === 'poll-active' ? `<div class="hint">Shows this page while a Twitch poll is active.</div>` : ''}
            ${cur?.trigger ? F.number(`pages.items.${idx}.triggerSeconds`, 'Show for (seconds, 0 = default)', cur.triggerSeconds || 0, { min: 0, max: 3600 }) : `${F.number(`pages.items.${idx}.duration`, 'Seconds on screen (auto mode, 0 = default)', cur?.duration || 0, { min: 0, max: 3600 })}`}</div>
        <div class="pg-card"><h4>Playback</h4>
            ${F.select('pages.mode', 'Advance', P.mode, [['manual', 'Manual (editor, control panel, API)'], ['auto', 'Automatic']])}
            ${P.mode === 'auto' ? `${F.number('pages.cycleSeconds', 'Default seconds per page', P.cycleSeconds, { min: 1, max: 3600 })}${F.check('pages.loop', 'Loop back to the first page', P.loop)}` : ''}
            ${F.select('pages.transition', 'Transition', P.transition, [['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide']])}
            ${P.transition === 'slide' ? F.select('pages.transitionDirection', 'Slide direction', P.transitionDirection || 'left', [['left', 'Left (new page enters from the right)'], ['right', 'Right (enters from the left)'], ['up', 'Up (enters from the bottom)'], ['down', 'Down (enters from the top)']]) + F.number('pages.transitionDistance', 'Slide distance (px)', P.transitionDistance || 120, { min: 10, max: 2000, step: 10 }) : ''}
            ${P.transition !== 'none' ? F.number('pages.transitionMs', 'Transition length (ms)', P.transitionMs, { min: 50, max: 5000, step: 50 }) : ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
            <a href="/overlay-control.html?id=${encodeURIComponent(state.overlay.id)}" target="_blank" style="color:var(--accent);font-size:12px">Control panel ↗</a>
            <button id="pages-disable" class="ghost" title="Back to a single page. Elements are kept.">Turn off pages</button></div>`;

    if (pgSortable) pgSortable.destroy();
    const sortList = $('pg-list');
    if (sortList && window.Sortable) {
        pgSortable = new window.Sortable(sortList, {
            animation: 150, handle: '.pg-grip', ghostClass: 'sortable-ghost',
            onEnd(event) {
                if (event.oldIndex === event.newIndex) return;
                const normal = state.overlay.pages.items.filter(p => !p.trigger);
                const trig = state.overlay.pages.items.filter(p => p.trigger);
                const [moved] = normal.splice(event.oldIndex, 1);
                normal.splice(event.newIndex, 0, moved);
                state.overlay.pages.items = [...normal, ...trig];
                changed(true);
                renderPageBar();
            }
        });
    }
}

export function loadAlertRules() {
    if (alertRules) return;
    alertRules = [];
    fetch('/api/alerts').then(r => r.json()).then(d => {
        alertRules = (d.rules || []).map(r => ({ id: r.id, name: r.name }));
        renderPagesPanel();
    }).catch(() => { alertRules = []; });
}

export async function livePage(body) {
    if (state.isNew) return;
    try {
        const response = await fetch(`/api/custom-overlays/${encodeURIComponent(state.overlay.id)}/page`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(response.status === 400 || response.status === 404
                ? 'Save & Push Live first so the stream knows about these pages.'
                : (data.error || 'Could not change the live page.'));
        }
        liveState = data;
        renderPageBar();
    } catch (error) {
        toast(error.message, 'warn', 3500);
    }
}

export async function refreshLivePage() {
    if (state.isNew || !pagesOn()) return;
    try {
        const response = await fetch(`/api/custom-overlays/${encodeURIComponent(state.overlay.id)}/page`, { cache: 'no-store' });
        if (response.ok) {
            liveState = await response.json();
            if (!pagesPanelBusy()) renderPageBar();
        }
    } catch {}
}

export function switchEditPage(id) {
    flushHistory();
    state.curPage = id;
    state.selectedIds = new Set();
    renderPageBar();
    renderCanvasHandler();
    renderLayers();
    renderPropertiesHandler();
    updateStatusBarHandler();
}

export function setPagesEnabled(on) {
    if (!state.overlay.pages) state.overlay.pages = defaultPages();
    state.overlay.pages.enabled = on;
    if (on) {
        ensureCurPage();
        state.overlay.elements.forEach(el => {
            if (el.page !== '*' && !state.overlay.pages.items.some(p => p.id === el.page)) {
                el.page = state.overlay.pages.items[0].id;
            }
        });
    }
    state.selectedIds = new Set();
    renderAllHandler();
    changed(true);
    if (on) setRailTab('pages'); else setRailTab('layers');
}

export function duplicatePage(src) {
    const items = state.overlay.pages.items, id = pageSeq();
    items.splice(items.indexOf(src) + 1, 0, { id, name: `${src.name} copy`, duration: src.duration || 0 });
    const groupMap = new Map();
    const clones = state.overlay.elements.filter(el => el.page === src.id).map(el => {
        const copy = JSON.parse(JSON.stringify(el)); copy.id = uid(el.type); copy.page = id;
        if (el.group) {
            if (!groupMap.has(el.group)) groupMap.set(el.group, uid('group'));
            copy.group = groupMap.get(el.group);
        }
        return copy;
    });
    state.overlay.elements.push(...clones);
    normalizeZ();
    changed(true);
    switchEditPage(id);
}

export async function deletePage(page) {
    const items = state.overlay.pages.items;
    if (items.length < 2) return;
    const doomed = state.overlay.elements.filter(el => el.page === page.id).length;
    if (window.StreamPulse?.confirm) {
        const ok = await window.StreamPulse.confirm('Delete Page', `Delete “${page.name}” and its ${doomed} element${doomed > 1 ? 's' : ''}? (Undo can restore it.)`, { danger: true, confirmText: 'Delete Page' });
        if (!ok) return;
    } else if (doomed && !confirm(`Delete “${page.name}” and its ${doomed} element${doomed > 1 ? 's' : ''}?`)) {
        return;
    }
    const idx = items.indexOf(page);
    state.overlay.elements = state.overlay.elements.filter(el => el.page !== page.id);
    items.splice(idx, 1);
    normalizeZ();
    changed(true);
    if (state.curPage === page.id) switchEditPage(items[Math.max(0, idx - 1)].id);
    else { renderPageBar(); renderCanvasHandler(); renderLayers(); }
}

export function startPageRename(row) {
    const page = state.overlay.pages.items.find(p => p.id === row.dataset.pid);
    const label = row.querySelector('.pg-name');
    if (!page || !label) return;
    const input = document.createElement('input');
    input.className = 'pg-name-input';
    input.value = page.name;
    input.maxLength = 60;
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
        if (done) return;
        done = true;
        if (commit && input.value.trim() && input.value.trim() !== page.name) {
            page.name = input.value.trim().slice(0, 60);
            changed(true);
        }
        renderPageBar();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
        e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
}

export function setRailTab(tab) {
    prefs.railTab = tab;
    savePrefs();
    for (const b of document.querySelectorAll('[data-rail-tab]')) {
        b.setAttribute('aria-selected', String(b.dataset.railTab === tab));
    }
    const layersPanel = $('layers-panel');
    const pagesPanel = $('pages-panel');
    if (layersPanel) layersPanel.hidden = tab !== 'layers';
    if (pagesPanel) pagesPanel.hidden = tab !== 'pages';
}

// ---- Initialization & Event Bindings ----------------------------------------------
export function initLayersAndPages() {
    const layersEl = $('layers');
    if (layersEl) {
        layersEl.addEventListener('click', e => {
            const head = e.target.closest('.layer-group');
            if (head) {
                const group = head.dataset.group;
                const members = state.overlay.elements.filter(el => el.group === group && inView(el));
                if (e.target.closest('[data-layer-action="group-visible"]')) {
                    const show = members.every(el => el.visible === false);
                    members.forEach(el => { el.visible = show ? true : false; });
                    renderLayers(); renderCanvasHandler(); renderPropertiesHandler(); changed(true);
                } else if (e.target.closest('.chev')) {
                    state.collapsedGroups.has(group) ? state.collapsedGroups.delete(group) : state.collapsedGroups.add(group);
                    localStorage.setItem('layerCollapsedGroups', JSON.stringify([...state.collapsedGroups]));
                    renderLayers();
                } else setSelection(members.map(el => el.id));
                return;
            }
            const row = e.target.closest('.layer');
            if (!row || e.target.closest('.layer-name-input')) return;
            const el = byId(row.dataset.id);
            if (!el) return;
            const action = e.target.closest('[data-layer-action]')?.dataset.layerAction;
            if (action === 'lock') {
                el.locked = !el.locked;
                renderLayers(); renderCanvasHandler(); updateStatusBarHandler();
                if (state.selectedIds.has(el.id)) renderPropertiesHandler();
                changed(true);
                return;
            }
            if (action === 'visible') {
                el.visible = el.visible === false;
                renderLayers(); renderCanvasHandler();
                if (state.selectedIds.has(el.id)) renderPropertiesHandler();
                changed(true);
                return;
            }
            const additive = e.shiftKey || e.ctrlKey || e.metaKey;
            if (additive) {
                const next = new Set(state.selectedIds);
                next.has(el.id) ? next.delete(el.id) : next.add(el.id);
                setSelection(next);
            } else setSelection([el.id]);
        });

        layersEl.addEventListener('dblclick', e => {
            const head = e.target.closest('.layer-group');
            if (head && e.target.closest('.layer-name')) return renameGroup(head);
            const row = e.target.closest('.layer');
            if (row && e.target.closest('.layer-name')) startRename(row);
        });

        if (window.Sortable) {
            new window.Sortable(layersEl, {
                animation: 150, handle: '.layer-grip', draggable: '.layer', ghostClass: 'sortable-ghost',
                onEnd(event) {
                    if (event.oldDraggableIndex === event.newDraggableIndex) return;
                    const order = state.layerOrder.slice();
                    const [moved] = order.splice(event.oldDraggableIndex, 1);
                    order.splice(event.newDraggableIndex, 0, moved);
                    const next = order.reverse(), slots = [];
                    state.overlay.elements.forEach((el, i) => { if (inView(el)) slots.push(i); });
                    slots.forEach((slot, i) => { state.overlay.elements[slot] = next[i]; });
                    normalizeZ(); renderCanvasHandler(); renderLayers(); changed(true);
                }
            });
        }
    }

    const railTabs = document.querySelector('.rail-tabs');
    if (railTabs) {
        railTabs.addEventListener('click', event => {
            const b = event.target.closest('[data-rail-tab]');
            if (b) setRailTab(b.dataset.railTab);
        });
    }

    const pageSwitch = $('page-switch');
    if (pageSwitch) {
        pageSwitch.addEventListener('click', event => {
            if (event.target.closest('#live-toggle')) livePage({ action: 'goto', page: state.curPage });
        });
        pageSwitch.addEventListener('change', event => {
            if (event.target.id === 'page-select') switchEditPage(event.target.value);
        });
    }

    const pagesPanel = $('pages-panel');
    if (pagesPanel) {
        pagesPanel.addEventListener('click', async event => {
            const t = event.target.closest('button'), row = event.target.closest('.pg-row');
            const items = state.overlay.pages?.items;
            if (!items) return;
            if (t?.id === 'pages-enable') return setPagesEnabled(true);
            if (t?.id === 'pages-disable') {
                if (window.StreamPulse?.confirm) {
                    const ok = await window.StreamPulse.confirm('Turn Off Pages', 'Turn off pages? Every page’s elements stay, and they all show together in one view.', { confirmText: 'Turn Off Pages' });
                    if (ok) setPagesEnabled(false);
                } else if (confirm('Turn off pages? Every page’s elements stay, and they all show together in one view.')) {
                    setPagesEnabled(false);
                }
                return;
            }
            if (t?.id === 'page-add') {
                const id = pageSeq();
                items.push({ id, name: `Page ${items.length + 1}`, duration: 0, enabled: true });
                changed(true);
                return switchEditPage(id);
            }
            if (!row) return;
            const page = items.find(p => p.id === row.dataset.pid);
            if (!page) return;
            if (t?.dataset.pg === 'toggle') {
                page.enabled = page.enabled === false;
                changed(true);
                return renderPageBar();
            }
            if (t?.dataset.pg === 'live') return livePage({ action: 'goto', page: page.id });
            if (t?.dataset.pg === 'dup') return duplicatePage(page);
            if (t?.dataset.pg === 'del') return await deletePage(page);
            if (!t && page.id !== state.curPage) switchEditPage(page.id);
        });

        pagesPanel.addEventListener('dblclick', event => {
            const row = event.target.closest('.pg-row');
            if (row && event.target.closest('.pg-name')) startPageRename(row);
        });

        bindFields(pagesPanel, () => [state.overlay], path => {
            if (path.startsWith('pages.items.')) {
                const page = state.overlay.pages.items[Number(path.split('.')[2])];
                if (page) {
                    const meta = document.querySelector(`.pg-row[data-pid="${CSS.escape(page.id)}"] .pg-meta`);
                    if (meta) meta.textContent = `${meta.textContent.replace(/ · \d+s$/, '')}${page.duration ? ` · ${page.duration}s` : ''}`;
                }
            }
            changed(false);
        });

        pagesPanel.addEventListener('change', event => {
            const box = event.target.closest('[data-trule]');
            if (box) {
                const page = state.overlay.pages.items.find(p => p.id === state.curPage);
                if (page) {
                    const set = new Set(page.triggerRules || []);
                    box.checked ? set.add(box.dataset.trule) : set.delete(box.dataset.trule);
                    page.triggerRules = [...set];
                    changed(true);
                    renderPagesPanel();
                }
                return;
            }
            const path = event.target.dataset?.path;
            if (path === 'pages.mode' || path === 'pages.transition' || /^pages\.items\.\d+\.trigger$/.test(path || '')) {
                renderPagesPanel();
            }
        });
    }

    if (window.pollVisible) {
        window.pollVisible(refreshLivePage, 5000);
    }
}
