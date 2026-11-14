/**
 * StreamPulse Custom Overlay Editor — Variable Sets Tab & Rotation Controls
 */

import {
    $, esc, state, pagesOn, byId, setSelection, changed, displayName, toast, defaultImageGroupConfig
} from './editor-state.js';

const TRANSITION_OPTIONS = [
    ['fade', 'Crossfade'],
    ['slide-up', 'Slide up'],
    ['flip', 'Flip'],
    ['none', 'Instant']
];

const TRANSITION_LABELS = Object.fromEntries(TRANSITION_OPTIONS);

let variableSets = null;
let loadingSets = false;
let setSearchQuery = '';
let renderCanvasHandler = () => {};
let switchEditPageHandler = () => {};
let addElementHandler = null;

function supportsRotation(setObj) {
    return (setObj?.slotsCount || 0) < 2;
}

function primaryTokenForSet(setObj) {
    const firstField = setObj?.fields?.[0]?.key || 'name';
    const prefix = (setObj?.slotsCount || 0) > 0 ? `${setObj.id}_1` : setObj.id;
    return `var.${prefix}_${firstField}`;
}

export function registerSetsCallbacks({ onRenderCanvas, onSwitchEditPage, onAddElement } = {}) {
    if (onRenderCanvas) renderCanvasHandler = onRenderCanvas;
    if (onSwitchEditPage) switchEditPageHandler = onSwitchEditPage;
    if (onAddElement) addElementHandler = onAddElement;
}

export function loadVariableSets({ force = false } = {}) {
    if (loadingSets) return;
    if (variableSets !== null && !force) return;
    loadingSets = true;
    fetch('/api/variables').then(r => r.json()).then(d => {
        variableSets = Array.isArray(d.sets) ? d.sets : [];
        if (state.liveStatus && typeof state.liveStatus === 'object') {
            state.liveStatus.variableSets = variableSets;
            if (typeof d.variableSetsEnabled === 'boolean') {
                state.liveStatus.modules = { ...(state.liveStatus.modules || {}), variableSets: d.variableSetsEnabled };
                const tabSets = $('tab-sets');
                if (tabSets) tabSets.hidden = !d.variableSetsEnabled;
                const groupStripBtn = $('menu-add-image-group');
                if (groupStripBtn) groupStripBtn.hidden = !d.variableSetsEnabled;
            }
        }
        loadingSets = false;
        renderCanvasHandler();
        renderSetsPanel();
    }).catch(() => {
        loadingSets = false;
        if (variableSets === null) variableSets = [];
        renderSetsPanel();
    });
}

export function findElementsUsingSet(setId) {
    if (!setId) return [];
    const normalized = String(setId).toLowerCase();
    const needle = `{{var.${normalized}_`;
    return (state.overlay.elements || []).filter(el => {
        if (el.type === 'image' && el.imageGroup?.enabled && String(el.imageGroup?.setId || '').toLowerCase() === normalized) {
            return true;
        }
        const hay = [el.content, ...(el.items || []), el.src, el.embedUrl, el.qrText, el.progress?.label]
            .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
    });
}

function getSets() {
    if (Array.isArray(state.liveStatus?.variableSets)) {
        variableSets = state.liveStatus.variableSets;
    }
    return variableSets;
}

function serverClockLabel(setObj) {
    const rot = setObj?.rotation;
    if (!rot?.enabled) return 'Server clock: Paused';
    const entry = (setObj.roster || []).find(e => e.id === rot.entryId);
    const active = entry ? ` · Now: ${entry.label || entry.id}` : '';
    const order = rot.mode === 'random' ? 'Random' : 'In order';
    return `Server clock: ${rot.intervalSeconds || 10}s · ${order}${active}`;
}

export function renderSetsCount() {
    const countEl = $('sets-count');
    if (!countEl) return;
    const setsById = new Map((getSets() || []).map(s => [s.id, s]));
    const follow = state.overlay.variableSetFollow || {};
    const rots = (Array.isArray(state.overlay.variableSetRotations) ? state.overlay.variableSetRotations : [])
        .filter(r => r && r.trigger === 'page' && r.enabled !== false && r.setId);
    const activeFollow = Object.entries(follow).filter(([id, val]) => val && supportsRotation(setsById.get(id))).length;
    const active = activeFollow + rots.length;
    countEl.textContent = active ? `(${active})` : '';
}

function renderSetCard(setObj) {
    const els = findElementsUsingSet(setObj.id);
    const rotCapable = supportsRotation(setObj);
    const enabledCount = (setObj.roster || []).filter(e => e.enabled !== false).length;
    const chipsHtml = `
        <div class="vrot-el-chips">
            <span>Used by:</span>
            ${els.length
                ? els.map(el => `<button type="button" class="vrot-el-chip" data-vrot-select="${esc(el.id)}" title="Select ${esc(displayName(el))} on canvas">${esc(displayName(el))}</button>`).join('')
                : '<span>no layers yet</span>'}
        </div>`;

    if (!rotCapable) {
        return `
            <div class="vset-card" data-vrot-set="${esc(setObj.id)}">
                <div class="vset-card-head">
                    <span class="vset-dot" aria-hidden="true"></span>
                    <span class="vset-name">${esc(setObj.name || setObj.id)}</span>
                    <span class="vset-meta">${setObj.slotsCount} slots</span>
                </div>
                <div class="vset-channel-meta">
                    <span>Manual slots &amp; Up Next queues</span>
                    <a href="/placeholders.html#sets" target="_blank" rel="noopener" class="link sm" data-vset-open="${esc(setObj.id)}">Manage</a>
                </div>
                ${chipsHtml}
            </div>`;
    }

    const follow = state.overlay.variableSetFollow || {};
    const on = follow[setObj.id] === true;
    const rot = setObj.rotation || {};
    const isRunning = Boolean(rot.enabled);
    const activeEntry = (setObj.roster || []).find(e => e.id === rot.entryId);
    const serverDefaultTrans = TRANSITION_LABELS[rot.transition || 'fade'] || 'Crossfade';
    const override = state.overlay.variableSetTransitions?.[setObj.id];
    const selectedTrans = override?.transition || 'default';
    const durationMs = Math.max(50, Math.min(2000, Number(override?.durationMs) || Number(rot.durationMs) || 350));

    return `
        <div class="vset-card${on ? ' is-following' : ''}" data-vrot-set="${esc(setObj.id)}">
            <div class="vset-card-head">
                <span class="vset-dot${isRunning ? ' is-live' : ''}" aria-hidden="true"></span>
                <span class="vset-name">${esc(setObj.name || setObj.id)}</span>
                <span class="vset-meta">${enabledCount} on</span>
            </div>
            <label class="vset-follow-toggle">
                <input type="checkbox" data-vrot-follow="${esc(setObj.id)}"${on ? ' checked' : ''}>
                <span>Follow live rotation on this overlay</span>
            </label>
            ${on ? `
                <div class="vrot-grid">
                    <label${selectedTrans === 'default' || selectedTrans === 'none' ? ' class="vrot-span2"' : ''}>Animation on this overlay
                        <select data-vrot-trans="${esc(setObj.id)}">
                            <option value="default"${selectedTrans === 'default' ? ' selected' : ''}>Set default (${esc(serverDefaultTrans)})</option>
                            ${TRANSITION_OPTIONS.map(([v, lbl]) => `<option value="${v}"${selectedTrans === v ? ' selected' : ''}>${lbl}</option>`).join('')}
                        </select>
                    </label>
                    ${selectedTrans !== 'default' && selectedTrans !== 'none'
                        ? `<label>Duration (ms)<input type="number" min="50" max="2000" step="50" data-vrot-trans-ms="${esc(setObj.id)}" value="${durationMs}"></label>`
                        : ''}
                </div>` : ''}
            <div class="vset-server-bar">
                <span class="vset-server-text" title="${activeEntry ? `Current entry: ${esc(activeEntry.label || activeEntry.id)}` : ''}">${esc(serverClockLabel(setObj))}</span>
                <button type="button" class="btn sm${isRunning ? ' ghost' : ''}" data-vrot-server="${esc(setObj.id)}" title="${isRunning ? 'Pause the shared server rotation clock for all following overlays' : 'Start the shared server rotation clock for all following overlays'}">${isRunning ? 'Pause' : 'Start'}</button>
            </div>
            ${chipsHtml}
        </div>`;
}

function renderLibraryRow(setObj) {
    const slotsCount = setObj.slotsCount || 0;
    const isRunning = supportsRotation(setObj) && Boolean(setObj.rotation?.enabled);
    const modeText = slotsCount >= 2 ? `${slotsCount} slots` : isRunning ? 'Rotating' : slotsCount === 1 ? '1 slot' : 'Preset';
    const token = `{{${primaryTokenForSet(setObj)}}}`;
    const hasImageField = (setObj.fields || []).some(f => f.type === 'image' || f.type === 'url');
    return `
        <div class="vset-lib-row" data-vset-lib="${esc(setObj.id)}">
            <div class="vset-lib-info">
                <div class="vset-lib-title">
                    <span class="vset-dot${isRunning ? ' is-live' : ''}" aria-hidden="true"></span>
                    <span>${esc(setObj.name || setObj.id)}</span>
                </div>
                <div class="vset-lib-sub">${esc(modeText)} · ${esc(token)}</div>
            </div>
            <div class="vset-lib-actions">
                <button type="button" class="btn sm ghost" data-vset-copy="${esc(setObj.id)}" title="Copy ${esc(token)}">Copy</button>
                <button type="button" class="btn sm" data-vset-insert="${esc(setObj.id)}" title="Add layer displaying ${esc(setObj.name || setObj.id)}">+ Layer</button>
                ${hasImageField ? `<button type="button" class="btn sm" data-vset-insert-strip="${esc(setObj.id)}" title="Add Group Image Strip for ${esc(setObj.name || setObj.id)}">+ Strip</button>` : ''}
            </div>
        </div>`;
}

function renderPageTriggerCard(r, ri, sets, pageItems) {
    const setOptions = [
        '<option value="">Select set...</option>',
        ...sets.map(s => `<option value="${esc(s.id)}"${s.id === r.setId ? ' selected' : ''}>${esc(s.name || s.id)}</option>`),
        ...(r.setId && !sets.some(s => s.id === r.setId) ? [`<option value="${esc(r.setId)}" selected>${esc(r.setId)}</option>`] : [])
    ].join('');
    const transition = ['none', 'fade', 'slide-up', 'flip'].includes(r.transition) ? r.transition : 'fade';
    const pageOpts = ['<option value="">Any page</option>', ...pageItems.map(p => `<option value="${esc(p.id)}"${p.id === r.pageId ? ' selected' : ''}>${esc(p.name || p.id)}</option>`)].join('');

    return `
        <div class="vset-card" data-vrot-idx="${ri}">
            <div class="vrot-head">
                <input type="checkbox" data-vrot-field="enabled" data-vrot-idx="${ri}" ${r.enabled !== false ? 'checked' : ''} title="Enable trigger">
                <select data-vrot-field="setId" data-vrot-idx="${ri}" aria-label="Variable set">${setOptions}</select>
                <button type="button" class="btn sm ghost danger" data-vrot-del="${ri}" title="Remove trigger" aria-label="Remove trigger"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div class="vrot-grid">
                ${pagesOn() ? `<label>When page shows<select data-vrot-field="pageId" data-vrot-idx="${ri}">${pageOpts}</select></label>` : ''}
                <label>Order
                    <select data-vrot-field="mode" data-vrot-idx="${ri}">
                        <option value="sequential"${r.mode !== 'random' ? ' selected' : ''}>In order</option>
                        <option value="random"${r.mode === 'random' ? ' selected' : ''}>Random</option>
                    </select>
                </label>
                <label>Animation
                    <select data-vrot-field="transition" data-vrot-idx="${ri}">
                        ${TRANSITION_OPTIONS.map(([v, lbl]) => `<option value="${v}"${transition === v ? ' selected' : ''}>${lbl}</option>`).join('')}
                    </select>
                </label>
                ${transition !== 'none'
                    ? `<label>Duration (ms)<input type="number" min="50" max="2000" step="50" data-vrot-field="durationMs" data-vrot-idx="${ri}" value="${Math.max(50, Math.min(2000, Number(r.durationMs) || 350))}"></label>`
                    : ''}
            </div>
        </div>`;
}

export function renderSetsPanel() {
    renderSetsCount();
    const panel = $('sets-panel');
    if (!panel) return;

    const sets = getSets();
    if (sets === null && !panel.hidden) {
        loadVariableSets();
    }

    const activeEl = document.activeElement;
    const restoreSearch = activeEl?.id === 'vset-filter'
        ? { start: activeEl.selectionStart, end: activeEl.selectionEnd }
        : null;

    const q = setSearchQuery.trim().toLowerCase();
    const matchesQuery = s => !q || `${s.name || ''} ${s.id}`.toLowerCase().includes(q);
    const follow = state.overlay.variableSetFollow || {};
    const rots = (Array.isArray(state.overlay.variableSetRotations) ? state.overlay.variableSetRotations : [])
        .map((r, ri) => ({ r, ri }))
        .filter(x => x.r && x.r.trigger === 'page');
    const pageItems = state.overlay.pages?.items || [];
    const linked = (sets || []).filter(s => (supportsRotation(s) && follow[s.id] !== undefined) || findElementsUsingSet(s.id).length);
    const linkedIds = new Set(linked.map(s => s.id));
    const unlinked = (sets || []).filter(s => !linkedIds.has(s.id));

    const visibleLinked = linked.filter(matchesQuery);
    const visibleUnlinked = unlinked.filter(matchesQuery);
    const libPref = localStorage.getItem('editor_vset_library_open');
    const libOpen = libPref === 'true' || (libPref !== 'false' && linked.length === 0) || Boolean(q);

    const followBody = sets === null
        ? '<div class="hint">Loading variable sets...</div>'
        : visibleLinked.length
            ? `<div class="vrot-list">${visibleLinked.map(renderSetCard).join('')}</div>`
            : linked.length
                ? '<div class="hint">No linked sets match your search.</div>'
                : `<div class="vset-empty">
                        <div class="vset-empty-ico" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>
                        </div>
                        <strong>No Variable Sets linked yet</strong>
                        <p>Add a layer from <strong>All Variable Sets</strong> below or insert <code>{{var.set_field}}</code> placeholders.</p>
                    </div>`;

    const libraryDrawer = unlinked.length
        ? `<details class="vset-library" id="vset-library-details"${libOpen ? ' open' : ''}>
                <summary>
                    <span>All Variable Sets (${unlinked.length})</span>
                    <span>${libOpen ? 'Hide' : 'Browse'}</span>
                </summary>
                <div class="vset-lib-list">
                    ${visibleUnlinked.length
                        ? visibleUnlinked.map(renderLibraryRow).join('')
                        : '<div class="hint">No unlinked sets match your search.</div>'}
                </div>
           </details>`
        : '';

    const triggerSets = (sets || []).filter(s => supportsRotation(s));
    const triggersBody = rots.length
        ? `<div class="vrot-list">${rots.map(({ r, ri }) => renderPageTriggerCard(r, ri, triggerSets, pageItems)).join('')}</div>`
        : `<div class="hint">${pagesOn() ? 'Optional: advance a set locally once whenever a specific page appears.' : 'Turn on Pages to step a set when switching pages.'}</div>`;

    const filterInput = (sets || []).length >= 4
        ? `<input type="search" id="vset-filter" class="vset-filter" value="${esc(setSearchQuery)}" placeholder="Search variable sets (${sets.length})..." aria-label="Search variable sets">`
        : '';

    panel.innerHTML = `
        <div class="pg-head">
            <span>Variable Sets</span>
            <a href="/placeholders.html#sets" target="_blank" rel="noopener" class="link sm">Edit sets <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
        </div>
        <span class="hint">Follow live set rotations per overlay with custom transitions, or browse every set below.</span>
        ${filterInput}
        ${followBody}
        ${libraryDrawer}
        <div class="vset-divider">
            <div class="pg-head">
                <span>Page-Show Triggers</span>
                <button type="button" class="btn sm" id="btn-add-var-rot">+ Add trigger</button>
            </div>
            ${triggersBody}
        </div>`;

    if (restoreSearch) {
        const nextInp = $('vset-filter');
        if (nextInp) {
            nextInp.focus();
            if (typeof restoreSearch.start === 'number') nextInp.setSelectionRange(restoreSearch.start, restoreSearch.end);
        }
    }
}

export function refreshVariableSetsPanel() {
    if (Array.isArray(state.liveStatus?.variableSets)) {
        const prev = variableSets;
        variableSets = state.liveStatus.variableSets;
        const sig = list => (list || []).map(x => `${x.id}:${x.name}:${x.rotation?.enabled}:${x.rotation?.intervalSeconds}:${x.rotation?.mode}:${x.rotation?.transition}:${x.rotation?.entryId}`).join('|');
        if (sig(prev) !== sig(variableSets)) {
            renderSetsCount();
            const panel = $('sets-panel');
            if (panel && !panel.hidden) renderSetsPanel();
        }
    }
}

export function initSetsPanel() {
    const panel = $('sets-panel');
    if (!panel) return;

    panel.addEventListener('input', event => {
        if (event.target.id === 'vset-filter') {
            setSearchQuery = event.target.value;
            renderSetsPanel();
        }
    });

    panel.addEventListener('toggle', event => {
        const det = event.target.closest('#vset-library-details');
        if (!det) return;
        localStorage.setItem('editor_vset_library_open', det.open ? 'true' : 'false');
        const label = det.querySelector('summary > span:last-child');
        if (label) label.textContent = det.open ? 'Hide' : 'Browse';
    }, true);

    panel.addEventListener('click', event => {
        const manageLink = event.target.closest('a[data-vset-open]');
        if (manageLink) {
            localStorage.setItem('variables_active_set', manageLink.dataset.vsetOpen);
            return;
        }
        const btn = event.target.closest('button');
        if (!btn) return;

        if (btn.dataset.vsetCopy) {
            const setObj = (getSets() || []).find(s => s.id === btn.dataset.vsetCopy);
            if (!setObj) return;
            const token = `{{${primaryTokenForSet(setObj)}}}`;
            navigator.clipboard?.writeText(token).then(
                () => toast(`Copied ${token}`, 'success', 2000),
                () => toast(token, 'info', 2500)
            );
            return;
        }

        if (btn.dataset.vsetInsert) {
            const setObj = (getSets() || []).find(s => s.id === btn.dataset.vsetInsert);
            if (!setObj || typeof addElementHandler !== 'function') return;
            const firstField = setObj.fields?.[0];
            const token = `{{${primaryTokenForSet(setObj)}}}`;
            const type = firstField?.type === 'image' ? 'image' : 'text';
            const props = type === 'image'
                ? { src: token, name: setObj.name || setObj.id }
                : { content: token, name: setObj.name || setObj.id };
            addElementHandler(type, props);
            if (supportsRotation(setObj) && setObj.rotation?.enabled) {
                state.overlay.variableSetFollow = { ...(state.overlay.variableSetFollow || {}), [setObj.id]: true };
                changed(true);
            }
            renderSetsPanel();
            toast(`Added layer for ${setObj.name || setObj.id}`, 'success', 2200);
            return;
        }

        if (btn.dataset.vsetInsertStrip) {
            const setObj = (getSets() || []).find(s => s.id === btn.dataset.vsetInsertStrip);
            if (!setObj || typeof addElementHandler !== 'function') return;
            addElementHandler('image-group', {
                name: `${setObj.name || setObj.id} Strip`,
                imageGroup: defaultImageGroupConfig(setObj)
            });
            renderSetsPanel();
            toast(`Added Group Image Strip for ${setObj.name || setObj.id}`, 'success', 2200);
            return;
        }

        if (btn.id === 'btn-add-var-rot') {
            const sets = getSets();
            if (sets === null) loadVariableSets();
            if (!Array.isArray(state.overlay.variableSetRotations)) state.overlay.variableSetRotations = [];
            const defaultSetId = sets?.[0]?.id || '';
            state.overlay.variableSetRotations.push({
                setId: defaultSetId,
                trigger: 'page',
                mode: 'sequential',
                intervalSeconds: 10,
                pageId: '',
                transition: 'fade',
                durationMs: 350,
                enabled: true
            });
            changed(true);
            renderSetsPanel();
            return;
        }

        if (btn.dataset.vrotServer) {
            const setId = btn.dataset.vrotServer;
            const sets = getSets() || [];
            const setObj = sets.find(x => x.id === setId);
            btn.disabled = true;
            fetch(`/api/variables/sets/${encodeURIComponent(setId)}/rotation/${setObj?.rotation?.enabled ? 'stop' : 'start'}`, { method: 'POST' })
                .then(r => (r.ok ? r.json() : Promise.reject()))
                .then(updated => {
                    variableSets = sets.map(x => (x.id === updated.id ? updated : x));
                    if (state.liveStatus) state.liveStatus.variableSets = variableSets;
                    if (!setObj?.rotation?.enabled) {
                        state.overlay.variableSetFollow = { ...(state.overlay.variableSetFollow || {}), [updated.id]: true };
                        changed(true);
                    }
                    renderCanvasHandler();
                    renderSetsPanel();
                })
                .catch(() => {
                    btn.disabled = false;
                    toast('Could not update server rotation', 'warn', 3000);
                });
            return;
        }

        if (btn.dataset.vrotSelect) {
            const el = byId(btn.dataset.vrotSelect);
            if (el) {
                if (pagesOn() && el.page && el.page !== '*' && el.page !== state.curPage) {
                    switchEditPageHandler(el.page, { animate: false });
                }
                setSelection([el.id]);
            }
            return;
        }

        if (btn.dataset.vrotDel !== undefined) {
            const ri = Number(btn.dataset.vrotDel);
            if (Array.isArray(state.overlay.variableSetRotations) && Number.isInteger(ri)) {
                state.overlay.variableSetRotations.splice(ri, 1);
                changed(true);
                renderSetsPanel();
            }
        }
    });

    panel.addEventListener('change', event => {
        const followBox = event.target.closest('[data-vrot-follow]');
        if (followBox) {
            state.overlay.variableSetFollow = { ...(state.overlay.variableSetFollow || {}), [followBox.dataset.vrotFollow]: followBox.checked };
            changed(true);
            renderSetsPanel();
            return;
        }

        const transSel = event.target.closest('[data-vrot-trans]');
        if (transSel) {
            const setId = transSel.dataset.vrotTrans;
            const next = { ...(state.overlay.variableSetTransitions || {}) };
            if (transSel.value === 'default') {
                delete next[setId];
            } else {
                const prevDur = Number(next[setId]?.durationMs) || 350;
                next[setId] = { transition: transSel.value, durationMs: prevDur };
            }
            state.overlay.variableSetTransitions = next;
            changed(true);
            renderSetsPanel();
            return;
        }

        const transMs = event.target.closest('[data-vrot-trans-ms]');
        if (transMs) {
            const setId = transMs.dataset.vrotTransMs;
            const next = { ...(state.overlay.variableSetTransitions || {}) };
            const curTr = next[setId]?.transition || 'fade';
            next[setId] = { transition: curTr, durationMs: Math.max(50, Math.min(2000, Math.round(Number(transMs.value) || 350))) };
            state.overlay.variableSetTransitions = next;
            changed(false);
            return;
        }

        const vrotField = event.target.closest('[data-vrot-field]');
        if (vrotField) {
            const ri = Number(vrotField.dataset.vrotIdx);
            const field = vrotField.dataset.vrotField;
            const rule = state.overlay.variableSetRotations?.[ri];
            if (rule) {
                if (field === 'enabled') rule.enabled = vrotField.checked;
                else if (field === 'intervalSeconds') rule.intervalSeconds = Math.max(1, Math.min(3600, Number(vrotField.value) || 10));
                else if (field === 'durationMs') rule.durationMs = Math.max(50, Math.min(2000, Number(vrotField.value) || 350));
                else rule[field] = vrotField.value;
                changed(false);
                if (field === 'enabled' || field === 'transition') renderSetsPanel();
            }
        }
    });
}
