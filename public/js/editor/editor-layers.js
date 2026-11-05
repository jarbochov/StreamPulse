/**
 * StreamPulse Custom Overlay Editor — Layers & Pages Management
 */

import {
    $, esc, ICON, TYPE_META, state, prefs, savePrefs, byId, selectedElements,
    pagesOn, statesModeOn, basePageId, isBasePage, hasPageOverride, resetElementPageState,
    syncWorkingStateForCurrentPage, projectPageState, extractElementState, convertStatesToPages,
    inView, visibleElements, displayName, normalizeZ, setSelection,
    changed, flushHistory, ensureCurPage, uid, toast, defaultPages,
    ALERT_TRIGGER_LABELS, triggerIcon
} from './editor-state.js';
import { F, bindFields } from './editor-form.js';
import { captureEditorStateSnapshot, previewEditorStateMorph } from './editor-canvas.js';

let pgSortable = null;
let alertRules = null;
let liveState = null;
const TRIGGER_NAMES = { alert: 'On alert', featured: 'Featured chat', command: 'Chat command', 'poll-end': 'Poll end', 'poll-active': 'Poll active' };
const pageSectionOpen = (id, dflt) => (prefs.sections[`pg-${id}`] ?? dflt) ? ' open' : '';

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
let savePresetHandler = () => {};
let openObsModalHandler = () => {};
let syncObsStateHandler = () => {};

export function registerLayerCallbacks({ onRenderCanvas, onRenderProperties, onUpdateStatusBar, onRenderAll, onSavePreset, onOpenObsModal, onSyncObsState }) {
    if (onRenderCanvas) renderCanvasHandler = onRenderCanvas;
    if (onRenderProperties) renderPropertiesHandler = onRenderProperties;
    if (onUpdateStatusBar) updateStatusBarHandler = onUpdateStatusBar;
    if (onRenderAll) renderAllHandler = onRenderAll;
    if (onSavePreset) savePresetHandler = onSavePreset;
    if (onOpenObsModal) openObsModalHandler = onOpenObsModal;
    if (onSyncObsState) syncObsStateHandler = onSyncObsState;
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
        list.innerHTML = '<div class="layers-empty">No elements yet. Use <b>+ Add</b> to start.</div>';
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
                <span class="chev" title="${closed ? 'Expand' : 'Collapse'} group"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
                <span class="layer-name" title="Double-click to rename">${esc(row.members.find(m => m.groupName)?.groupName || 'Group')} <small style="font-weight:400;opacity:.7">· ${ids.length}</small></span>
                <span class="layer-actions">
                    <button data-layer-action="group-prefab" title="Save group as reusable prefab / preset…" aria-label="Save group as prefab">${ICON.preset}</button>
                    <button data-layer-action="group-visible" title="${allHidden ? 'Show' : 'Hide'} group" aria-label="${allHidden ? 'Show' : 'Hide'} group">${allHidden ? ICON.eyeOff : ICON.eye}</button>
                </span>
            </div>`;
        }
        const el = row.el, inGroup = row.group ? ` in-group${state.collapsedGroups.has(row.group) ? ' group-hidden' : ''}` : '';
        const hasOvr = hasPageOverride(el, state.curPage);
        const obsBadge = (state.obs?.enabled && state.obs?.sceneSyncEnabled !== false && el.obsLink?.enabled) ? `<span class="layer-obs-badge" title="Linked to OBS source: ${esc(el.obsLink.sourceName || 'Unassigned')}">OBS</span>` : '';
        return `
        <div class="layer${state.selectedIds.has(el.id) ? ' selected' : ''}${el.visible === false ? ' is-hidden' : ''}${inGroup}${hasOvr ? ' has-state-override' : ''}" data-id="${esc(el.id)}">
            <span class="layer-grip" title="Drag to reorder">${ICON.grip}</span>
            <span class="layer-icon">${TYPE_META[el.type]?.icon || '•'}</span>
            <span class="layer-name" title="Double-click to rename">${pagesOn() && el.page === '*' ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="shared-mark" title="${statesModeOn() ? 'Shared across all states' : 'Shared on all pages'}"><polygon points="12 2 22 12 12 22 2 12"/></svg>` : ''}${esc(displayName(el))}${obsBadge}${hasOvr ? '<span class="layer-ovr-dot" title="Overridden in this state"></span>' : ''}</span>
            <span class="layer-actions">
                ${hasOvr ? `<button data-layer-action="reset-state" class="ovr-reset" title="Reset state override back to base layout" aria-label="Reset state override"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>` : ''}
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
    const tabBtn = $('tab-pages');
    const on = pagesOn();
    const isStates = statesModeOn();
    const noun = isStates ? 'State' : 'Page';
    const nounPlural = isStates ? 'States' : 'Pages';
    if (tabBtn) {
        const cnt = on ? `(${state.overlay.pages.items.length})` : '';
        tabBtn.innerHTML = `${nounPlural} <small id="page-count">${cnt}</small>`;
    }
    if (!box) return;
    box.hidden = !on;
    if (!on) return;
    const live = liveId(), isLive = state.curPage === live;
    box.innerHTML = `<select id="page-select" aria-label="${noun} being edited">${state.overlay.pages.items.map((p, i) => `<option value="${esc(p.id)}"${p.id === state.curPage ? ' selected' : ''}>${i + 1}. ${esc(p.name)}${i === 0 && isStates ? ' (Base)' : ''}${p.enabled === false ? ' (off)' : ''}${p.id === live ? '  [Live]' : ''}</option>`).join('')}</select>
        <button id="live-toggle" aria-pressed="${isLive}" ${state.isNew ? 'disabled' : ''} title="${isLive ? `This ${noun.toLowerCase()} is showing on stream` : `Show this ${noun.toLowerCase()} on stream`}">${isLive ? '<span class="status-dot live live-dot"></span>Live' : 'Make live'}</button>`;
}


function triggersSummaryHtml() {
    const items = state.overlay.pages?.items || [];
    const rows = [];
    const seen = {};
    for (const p of items.filter(x => x.trigger && x.enabled !== false)) {
        const mode = p.triggerAlertMode || (p.triggerRules?.length ? 'selected' : 'all');
        const when = p.trigger === 'alert' ? (mode === 'selected' ? `${(p.triggerRules || []).length} alert rule(s)` : 'All alerts') : (p.triggerName ? `${TRIGGER_NAMES[p.trigger]}: ${p.triggerName}` : TRIGGER_NAMES[p.trigger] || p.trigger);
        const key = p.trigger === 'alert' ? `alert:${mode === 'all' ? '*' : (p.triggerRules || []).slice().sort().join(',')}` : `${p.trigger}:${p.triggerName || '*'}`;
        (seen[key] ||= []).push(p.name);
        rows.push({ key, name: p.name, id: p.id, kind: 'Page', when, show: p.name, forS: p.triggerSeconds ? `${p.triggerSeconds}s` : 'Default time' });
    }
    for (const el of state.overlay.elements.filter(e => e.type === 'alert')) {
        const only = el.alert?.triggers || [];
        const mode = el.alert?.alertMode || (only.length ? 'selected' : 'all');
        rows.push({ key: '', name: displayName(el), kind: 'Alert box', when: mode === 'selected' ? (only.length ? only.map(k => ALERT_TRIGGER_LABELS[k] || k).join(', ') : 'No events selected') : 'All events', show: 'Content from Alerts', forS: 'Per alert', warn: mode === 'selected' && !only.length });
    }
    if (!rows.length) return '<div class="hint">No page triggers or alert boxes in this overlay.</div>';
    return `<div class="trig-summary">${rows.map(r => {
        const dup = r.key && seen[r.key].length > 1;
        return `<div class="trig-row${dup || r.warn ? ' conflict' : ''}"><div class="trig-row-head"><span>${esc(r.name)} <small>${r.kind}</small></span>${r.id ? `<button type="button" class="btn sm" data-trig-test="${esc(r.id)}">Test</button>` : ''}</div><div class="trig-row-meta">When: ${esc(r.when)} · Show: ${esc(r.show)} · For: ${esc(r.forS)}</div>${dup ? `<div class="hint warn">Duplicate trigger: also used by ${esc(seen[r.key].filter(n => n !== r.name).join(', ') || 'another page')}.</div>` : ''}${r.warn ? '<div class="hint warn">No events selected. Will not show anything.</div>' : ''}</div>`;
    }).join('')}</div>`;
}

export function renderPagesPanel() {
    const panel = $('pages-panel');
    if (!panel) return;
    if (!pagesOn()) {
        panel.innerHTML = `
            <div class="pg-empty">
                <div class="pg-empty-ico">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 22 12 12 22 2 12"/></svg>
                </div>
                <strong>Pages &amp; Dynamic Scene States</strong>
                <p>Split your overlay into rotating pages, or add dynamic scene states that smoothly morph elements (e.g. Gameplay → Full Cam → Intermission).</p>
                <div class="pg-empty-actions">
                    <button id="pages-enable" type="button" class="primary">
                        <span>Turn on Pages</span>
                    </button>
                    <button id="states-enable" type="button" class="ghost bordered">
                        <span>Turn on Scene States (Morph)</span>
                        <span class="badge-beta">BETA</span>
                    </button>
                </div>
            </div>`;
        return;
    }
    const items = state.overlay.pages.items;
    const isStates = statesModeOn();
    const noun = isStates ? 'state' : 'page';
    const nounCap = isStates ? 'State' : 'Page';
    const nounPlural = isStates ? 'Scene States' : 'Pages';
    const live = liveId();
    const idx = items.findIndex(p => p.id === state.curPage);
    const cur = items[idx] || items[0];
    const count = id => state.overlay.elements.filter(el => el.page === id).length;
    const ovrCount = id => state.overlay.elements.filter(el => el.page === '*' && el.pageStates?.[id] && Object.keys(el.pageStates[id]).length > 0).length;
    const shared = state.overlay.elements.filter(el => el.page === '*').length;
    const P = state.overlay.pages;
    if (cur?.trigger === 'alert') loadAlertRules();

    const rowHtml = (p, rowIdx) => {
        const isBase = rowIdx === 0 && isStates && !p.trigger;
        const ovr = isBase ? 0 : ovrCount(p.id);
        const ownCount = count(p.id);
        const metaParts = [];
        if (p.id === live) metaParts.push('<span class="pg-live">Live</span>');
        if (p.enabled === false) metaParts.push('Off');
        if (isBase) metaParts.push('Base layout');
        else if (isStates) metaParts.push(ovr ? `${ovr} morph override${ovr === 1 ? '' : 's'}` : 'Matches base');
        if (ownCount || !isStates) metaParts.push(`${ownCount} own element${ownCount === 1 ? '' : 's'}`);
        if (p.duration) metaParts.push(`${p.duration}s`);

        return `
        <div class="pg-row${p.id === state.curPage ? ' current' : ''}${p.enabled === false ? ' off' : ''}" data-pid="${esc(p.id)}">
            <span class="pg-grip" title="Drag to reorder">${ICON.grip}</span>
            <span class="pg-main"><span class="pg-name" title="Double-click to rename">${p.trigger ? `<span class="trig-badge" title="${esc(TRIGGER_NAMES[p.trigger] || p.trigger)}"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>${esc(TRIGGER_NAMES[p.trigger] || p.trigger)}</span>` : ''}${esc(p.name)}</span>
                <span class="pg-meta">${metaParts.join(' · ')}</span></span>
            <span class="pg-actions">
                <button data-pg="toggle" class="${p.enabled === false ? '' : 'on'}" title="${p.enabled === false ? `Enable this ${noun}` : `Disable this ${noun} (skipped on stream)`}" aria-pressed="${p.enabled !== false}" ${p.enabled !== false && items.filter(x => x.enabled !== false).length === 1 ? 'disabled' : ''}>${p.enabled === false ? ICON.eyeOff : ICON.eye}</button>
                ${p.id === live || p.enabled === false ? '' : `<button data-pg="live" class="go" title="${state.isNew ? 'Save first to go live' : `Make this ${noun} live`}" ${state.isNew ? 'disabled' : ''}><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>`}
                <button data-pg="dup" title="Duplicate ${noun}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button data-pg="del" class="danger" title="Delete ${noun}" ${items.length === 1 ? 'disabled' : ''}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </span>
        </div>`;
    };

    const obsLinkedCount = state.overlay.elements.filter(el => el.obsLink?.enabled && el.obsLink?.sourceName).length;
    const pageAlertMode = cur?.triggerAlertMode || (cur?.triggerRules?.length ? 'selected' : 'all');
    const triggerLabel = cur?.trigger === 'alert'
        ? (pageAlertMode === 'selected'
            ? `${(cur.triggerRules || []).length} Alert${(cur.triggerRules || []).length === 1 ? '' : 's'}`
            : 'All Alerts')
        : ({ '': 'Manual / Rotation', alert: 'On Alert', featured: 'Featured Chat', command: 'Chat Command', 'poll-end': 'Poll End', 'poll-active': 'Poll Active' }[cur?.trigger || ''] || 'Manual');
    const transLabel = { morph: 'Morph', fade: 'Crossfade', slide: 'Slide', none: 'Instant' }[P.transition || 'morph'] || 'Morph';
    const rotation = items.filter(p => !p.trigger), evPages = items.filter(p => p.trigger);
    const showSearch = items.length > 6;
    const transSeg = isStates
        ? F.select('pages.transition', 'Transition', P.transition, [['morph', 'Liquid Morph'], ['fade', 'Crossfade'], ['slide', 'Slide'], ['none', 'Instant']])
        : F.seg('pages.transition', 'Transition', P.transition || 'none', [['none', 'Instant'], ['fade', 'Crossfade'], ['slide', 'Slide']]);
    const needMs = P.transition && P.transition !== 'none';
    const advTrans = needMs ? `<details class="sub-details" data-sect="pg-trans-adv"${pageSectionOpen('trans-adv', false)}><summary>Transition details</summary>
        ${isStates && P.transition === 'morph' ? F.select('pages.transitionEasing', 'Morph motion curve', P.transitionEasing || 'smooth', window.StreamPulseMotion.options()) + F.select('pages.enterExit', 'New & removed items', P.enterExit || 'fade', [['fade', 'Crossfade'], ['slide', 'Slide'], ['zoom', 'Scale pop'], ['none', 'Instant']]) : ''}
        ${(P.transition === 'slide' || (P.transition === 'morph' && P.enterExit === 'slide')) ? F.select('pages.transitionDirection', 'Slide direction', P.transitionDirection || 'left', [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']]) + F.number('pages.transitionDistance', 'Slide distance (px)', P.transitionDistance || 120, { min: 10, max: 2000, step: 10 }) : ''}
        ${F.number('pages.transitionMs', 'Duration (ms)', P.transitionMs, { min: 50, max: 5000, step: 50 })}</details>` : '';
    const trigSel = F.select(`pages.items.${idx}.trigger`, 'Show when', cur?.trigger || '', [
        ['', 'In the rotation / manual'], ['alert', 'An alert plays'], ['featured', 'A chat message is featured'],
        ['command', 'A chat command or trigger is used'], ['poll-end', 'A Twitch poll ends'], ['poll-active', 'A Twitch poll is active']]);
    panel.innerHTML = `
        <div class="pg-head"><span>Pages</span><button id="page-add" title="Add a new ${noun}">+ Add ${noun}</button></div>
        ${showSearch ? '<input type="search" class="pg-search" id="pg-search" placeholder="Search pages" aria-label="Search pages" spellcheck="false">' : ''}
        <div class="pg-section-title">Rotation</div>
        <div class="pg-list" id="pg-list">${rotation.map((p, i) => rowHtml(p, i)).join('')}</div>
        <div class="pg-section-title">Event pages <span class="hint">not in rotation</span></div>
        ${evPages.length ? `<div class="pg-list pg-trig" id="pg-trig-list">${evPages.map((p, i) => rowHtml(p, i)).join('')}</div>` : `<div class="hint">None yet. Pick an event under “Show when” for a ${noun} to make it an event page.</div>`}
        <div class="hint">${isStates
            ? `<b>${esc(items[0]?.name || 'State 1')}</b> is the Base Layout. Select another state and edit shared layers to record morph overrides.`
            : (shared ? `${shared} element${shared === 1 ? '' : 's'} show on All pages.` : 'Mark an element “Show on all pages” to share it.')}</div>
        ${!isStates && state.overlay.elements.some(el => Object.keys(el.pageStates || {}).length) ? '<div class="hint">This design still has saved state overrides. Convert them to keep each layout on an independent page.</div><button type="button" id="convert-state-pages">Convert state layouts to pages</button>' : ''}
        <details class="sub-details" data-sect="pg-this"${pageSectionOpen('this', true)}>
            <summary>${esc(cur?.name || nounCap)} <span class="spacer"></span><span class="badge-pill${cur?.trigger ? '' : ' is-muted'}">${esc(triggerLabel)}</span></summary>
            ${trigSel}
            ${cur?.trigger === 'alert' ? `
                ${F.seg(`pages.items.${idx}.triggerAlertMode`, 'Alerts', pageAlertMode, [['all', 'All alerts'], ['selected', 'Only these alerts']])}
                ${pageAlertMode === 'selected' ? `<div class="field">
                    <div class="trig-head"><span>Alert rules</span>${alertRules && alertRules.length ? '<span class="trig-head-actions"><button type="button" class="btn sm" id="btn-select-all-trules">All</button><button type="button" class="btn sm ghost" id="btn-clear-trules">None</button></span>' : ''}</div>
                    ${alertRules ? (alertRules.length ? `<div class="trule-list">${alertRules.map(r => `<label class="check"><input type="checkbox" data-trule="${esc(r.id)}" ${(cur.triggerRules || []).includes(r.id) ? 'checked' : ''}> ${esc(r.name || r.id)}</label>`).join('')}</div>
                    <div class="hint${(cur.triggerRules || []).length ? '' : ' warn'}">${(cur.triggerRules || []).length ? `Only the ticked alerts show this ${noun}.` : `No alerts selected. This ${noun} will not trigger.`}</div>` : '<div class="hint">No alert rules yet.</div>') : '<div class="hint">Loading alert rules...</div>'}
                </div>` : '<div class="hint">Shows whenever any alert plays.</div>'}` : ''}
            ${cur?.trigger === 'command' ? F.text(`pages.items.${idx}.triggerName`, 'Command or trigger name (blank = any)', cur.triggerName || '') : ''}
            ${cur?.trigger === 'poll-end' ? '<div class="hint">Time on screen 0 uses the default 15s.</div>' : ''}
            ${cur?.trigger === 'poll-active' ? '<div class="hint">Time on screen 0 keeps it through voting and results.</div>' : ''}
            ${cur?.trigger === 'featured' ? '<div class="hint">Time on screen 0 uses the default 10s.</div>' : ''}
            ${cur?.trigger ? F.number(`pages.items.${idx}.triggerSeconds`, 'Time on screen (seconds, 0 = default)', cur.triggerSeconds || 0, { min: 0, max: 3600 }) : F.number(`pages.items.${idx}.duration`, 'Time on screen (seconds, 0 = default)', cur?.duration || 0, { min: 0, max: 3600 })}
            ${cur?.trigger ? '<button type="button" class="btn" id="btn-test-trigger"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Test trigger</button>' : ''}
        </details>
        <div class="pg-section-title">Playback</div>
        ${F.seg('pages.mode', 'Advance', P.mode || 'manual', [['manual', 'Manual'], ['auto', 'Automatic']])}
        ${P.mode === 'auto' ? `${F.number('pages.cycleSeconds', 'Default time per page (seconds)', P.cycleSeconds, { min: 1, max: 3600 })}${F.check('pages.loop', `Loop back to first ${noun}`, P.loop)}` : ''}
        ${transSeg}
        ${advTrans}
        ${isStates && items.length > 1 && P.transition !== 'none' ? `<button type="button" id="btn-preview-transition" class="btn pg-preview"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Preview ${esc(transLabel)} on canvas</button>` : ''}
        <details class="sub-details" data-sect="pg-states"${pageSectionOpen('states', isStates)}>
            <summary>Advanced: Scene States (Morph) <span class="badge-beta">BETA</span> <span class="spacer"></span><span class="badge-pill${isStates ? '' : ' is-muted'}">${isStates ? 'On' : 'Off'}</span></summary>
            <span class="hint">Animates layout and styles${state.obs?.enabled && state.obs?.sceneSyncEnabled !== false ? ', plus linked OBS sources,' : ''} between states instead of switching pages.</span>
            <button type="button" data-pg-kind="${isStates ? 'pages' : 'states'}" id="pg-kind-toggle" aria-pressed="${isStates}">${isStates ? 'Turn off Scene States (use Pages)' : 'Switch to Scene States'}</button>
            ${isStates && state.obs?.enabled && state.obs?.sceneSyncEnabled !== false ? `<div class="state-override-bar${obsLinkedCount ? ' is-active' : ''}"><span class="state-ovr-text"><strong>OBS Sync:</strong> ${obsLinkedCount ? `${obsLinkedCount} linked source${obsLinkedCount === 1 ? '' : 's'}` : 'Link Shape/Cutout boxes'}</span><button type="button" id="btn-pages-obs-setup" class="link-btn">${state.obs?.connected ? 'Connected' : 'Configure…'}</button></div>` : ''}
        </details>
        <details class="sub-details" data-sect="pg-triggers"${pageSectionOpen('triggers', false)}>
            <summary>Triggers summary</summary>
            ${triggersSummaryHtml()}
        </details>
        <div class="pg-foot">
            <a href="/overlay-control.html?id=${encodeURIComponent(state.overlay.id)}" target="_blank" class="link sm">Control panel ↗</a>
            <button id="pages-disable" class="ghost" title="Back to a single view. Elements are kept.">Turn off ${noun}s</button></div>`;

    if (pgSortable) pgSortable.destroy();
    const sortList = $('pg-list');
    if (sortList && window.Sortable) {
        pgSortable = new window.Sortable(sortList, {
            animation: 150, handle: '.pg-grip', ghostClass: 'sortable-ghost',
            onEnd(event) {
                if (event.oldIndex === event.newIndex) return;
                syncWorkingStateForCurrentPage(state.curPage);
                const normal = state.overlay.pages.items.filter(p => !p.trigger);
                const trig = state.overlay.pages.items.filter(p => p.trigger);
                const [moved] = normal.splice(event.oldIndex, 1);
                normal.splice(event.newIndex, 0, moved);
                state.overlay.pages.items = [...normal, ...trig];
                projectPageState(state.curPage);
                changed(true);
                renderPageBar();
                renderCanvasHandler();
            }
        });
    }
}

export const getAlertRules = () => alertRules;

export function loadAlertRules(onLoad) {
    if (alertRules) return;
    alertRules = [];
    fetch('/api/alerts').then(r => r.json()).then(d => {
        alertRules = (d.rules || []).map(r => ({ id: r.id, name: r.name }));
        renderPagesPanel();
        onLoad?.();
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

export function setLiveState(data) {
    liveState = data;
    if (!pagesPanelBusy()) renderPageBar();
}

export function switchEditPage(id, { animate = true } = {}) {
    if (!id || id === state.curPage) return;
    flushHistory();
    syncWorkingStateForCurrentPage(state.curPage);
    const trans = statesModeOn() ? (state.overlay.pages?.transition || 'morph') : 'none';
    const shouldAnimate = animate && trans !== 'none';
    const beforeSnap = shouldAnimate ? captureEditorStateSnapshot() : null;
    const prevPageId = state.curPage;
    state.curPage = id;
    projectPageState(id);
    renderPageBar();
    renderCanvasHandler();
    renderLayers();
    renderPropertiesHandler();
    updateStatusBarHandler();
    if (beforeSnap) {
        previewEditorStateMorph(beforeSnap, {
            prevPage: prevPageId,
            nextPage: id,
            transition: trans,
            enterExit: state.overlay.pages?.enterExit || 'fade',
            durationMs: state.overlay.pages?.transitionMs || (trans === 'morph' ? 650 : 500),
            easing: state.overlay.pages?.transitionEasing || 'smooth',
            direction: state.overlay.pages?.transitionDirection || 'left',
            distance: state.overlay.pages?.transitionDistance || 120
        });
    }
    if (animate && statesModeOn() && state.obs?.sceneSyncEnabled !== false && state.obs?.connected && state.obs?.syncOnSave !== false) {
        syncObsStateHandler(id);
    }
}

export function setPagesEnabled(on, kind = 'pages') {
    if (!state.overlay.pages) state.overlay.pages = defaultPages();
    syncWorkingStateForCurrentPage(state.curPage);
    if (on && kind === 'pages' && statesModeOn()) convertStatesToPages();
    state.overlay.pages.enabled = on;
    if (on) {
        state.overlay.pages.kind = kind === 'states' ? 'states' : 'pages';
        if (kind === 'states') {
            state.overlay.pages.transition = 'morph';
            if (!state.overlay.pages.transitionEasing) state.overlay.pages.transitionEasing = 'smooth';
            if (!state.overlay.pages.transitionMs || state.overlay.pages.transitionMs === 400) state.overlay.pages.transitionMs = 650;
            const items = state.overlay.pages.items;
            if (items[0] && items[0].name === 'Page 1') items[0].name = 'State 1';
            if (items.length < 2) {
                items.push({ id: pageSeq(), name: 'State 2', duration: 0, enabled: true });
            }
            const hasOtherLayouts = state.overlay.elements.some(el => el.page && el.page !== '*' && el.page !== items[0]?.id);
            state.overlay.elements.forEach(el => {
                if (!hasOtherLayouts && (!el.page || el.page === items[0]?.id)) el.page = '*';
                if (!el._baseState) el._baseState = extractElementState(el);
                if (!el.pageStates) el.pageStates = {};
            });
        } else {
            state.overlay.pages.transition = 'none';
            state.overlay.pages.enterExit = 'none';
            ensureCurPage();
            state.overlay.elements.forEach(el => {
                if (el.page !== '*' && !state.overlay.pages.items.some(p => p.id === el.page)) {
                    el.page = state.overlay.pages.items[0].id;
                }
            });
        }
        ensureCurPage();
        projectPageState(state.curPage);
    } else {
        projectPageState(basePageId());
    }
    state.selectedIds = new Set();
    renderAllHandler();
    changed(true);
    if (on) setRailTab('pages'); else setRailTab('layers');
}

export function duplicatePage(src) {
    syncWorkingStateForCurrentPage(state.curPage);
    const items = state.overlay.pages.items, id = pageSeq();
    items.splice(items.indexOf(src) + 1, 0, { id, name: `${src.name} copy`, duration: src.duration || 0, enabled: src.enabled !== false });
    const groupMap = new Map();
    const clones = state.overlay.elements.filter(el => el.page === src.id).map(el => {
        const copy = JSON.parse(JSON.stringify(el)); copy.id = uid(el.type); copy.page = id;
        if (!el.morphId) el.morphId = uid('morph');
        copy.morphId = el.morphId;
        if (el.group) {
            if (!groupMap.has(el.group)) groupMap.set(el.group, uid('group'));
            copy.group = groupMap.get(el.group);
        }
        return copy;
    });
    state.overlay.elements.forEach(el => {
        if (el.page === '*') {
            if (!el.pageStates) el.pageStates = {};
            if (src.id !== basePageId() && el.pageStates[src.id]) {
                el.pageStates[id] = JSON.parse(JSON.stringify(el.pageStates[src.id]));
            }
        }
    });
    state.overlay.elements.push(...clones);
    normalizeZ();
    changed(true);
    switchEditPage(id, { animate: false });
}

export async function deletePage(page) {
    const items = state.overlay.pages.items;
    if (items.length < 2) return;
    const isStates = statesModeOn();
    const noun = isStates ? 'State' : 'Page';
    const doomed = state.overlay.elements.filter(el => el.page === page.id).length;
    const msg = doomed
        ? `Delete “${page.name}” and its ${doomed} exclusive element${doomed > 1 ? 's' : ''}? (Undo can restore it.)`
        : `Delete ${noun.toLowerCase()} “${page.name}”? Shared layers will remain intact.`;
    if (window.StreamPulse?.confirm) {
        const ok = await window.StreamPulse.confirm(`Delete ${noun}`, msg, { danger: true, confirmText: `Delete ${noun}` });
        if (!ok) return;
    } else if (doomed && !confirm(msg)) {
        return;
    }
    syncWorkingStateForCurrentPage(state.curPage);
    const idx = items.indexOf(page);
    state.overlay.elements = state.overlay.elements.filter(el => el.page !== page.id);
    state.overlay.elements.forEach(el => {
        if (el.pageStates && el.pageStates[page.id]) delete el.pageStates[page.id];
    });
    items.splice(idx, 1);
    normalizeZ();
    changed(true);
    if (state.curPage === page.id) switchEditPage(items[Math.max(0, idx - 1)].id, { animate: false });
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
    const settingsSect = $('settings-sect');
    if (layersPanel) layersPanel.hidden = tab !== 'layers';
    if (pagesPanel) pagesPanel.hidden = tab !== 'pages';
    if (settingsSect) settingsSect.hidden = tab !== 'canvas';
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
                if (e.target.closest('[data-layer-action="group-prefab"]')) {
                    setSelection(members.map(el => el.id));
                    savePresetHandler();
                    return;
                }
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
            if (action === 'reset-state') {
                resetElementPageState(el, state.curPage);
                renderLayers(); renderCanvasHandler(); renderPropertiesHandler(); updateStatusBarHandler();
                changed(true);
                toast(`Reset “${el.name || el.type}” to Base State`, 'info', 2000);
                return;
            }
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
            if (t?.id === 'states-enable') return setPagesEnabled(true, 'states');
            if (t?.id === 'pages-enable') return setPagesEnabled(true, 'pages');
            if (t?.id === 'btn-pages-obs-setup') return openObsModalHandler();
            if (t?.id === 'convert-state-pages') {
                state.overlay.pages.kind = 'states';
                return setPagesEnabled(true, 'pages');
            }
            if (t?.dataset.pgKind) {
                const nextKind = t.dataset.pgKind === 'states' ? 'states' : 'pages';
                if (state.overlay.pages.kind !== nextKind) {
                    setPagesEnabled(true, nextKind);
                }
                return;
            }
            if (t?.id === 'btn-preview-morph' || t?.id === 'btn-preview-transition') {
                const enabledItems = items.filter(p => p.enabled !== false);
                if (enabledItems.length < 2) {
                    toast(`Add at least 2 ${isStates ? 'states' : 'pages'} to preview transitions.`, 'info', 2400);
                    return;
                }
                const curIdx = enabledItems.findIndex(p => p.id === state.curPage);
                const nextPage = enabledItems[(curIdx + 1) % enabledItems.length];
                if (nextPage) switchEditPage(nextPage.id, { animate: true });
                return;
            }
            if (t?.id === 'pages-disable') {
                const isStates = statesModeOn();
                const title = isStates ? 'Turn Off States' : 'Turn Off Pages';
                const msg = isStates
                    ? 'Turn off scene states? Layers will revert to their Base State layout.'
                    : 'Turn off pages? Every page’s elements stay, and they all show together in one view.';
                if (window.StreamPulse?.confirm) {
                    const ok = await window.StreamPulse.confirm(title, msg, { confirmText: title });
                    if (ok) setPagesEnabled(false);
                } else if (confirm(msg)) {
                    setPagesEnabled(false);
                }
                return;
            }
            if (t?.id === 'page-add') {
                const isStates = statesModeOn();
                const id = pageSeq();
                items.push({ id, name: `${isStates ? 'State' : 'Page'} ${items.length + 1}`, duration: 0, enabled: true });
                changed(true);
                return switchEditPage(id, { animate: false });
            }
            if (t?.id === 'btn-select-all-trules') {
                const page = items.find(p => p.id === state.curPage);
                if (page && alertRules) {
                    page.triggerRules = alertRules.map(r => r.id);
                    changed(true);
                    return renderPagesPanel();
                }
            }
            if (t?.id === 'btn-clear-trules') {
                const page = items.find(p => p.id === state.curPage);
                if (page) {
                    page.triggerRules = [];
                    changed(true);
                    return renderPagesPanel();
                }
            }
            if (t?.id === 'btn-test-trigger' || t?.dataset.trigTest) {
                const page = items.find(p => p.id === (t.dataset.trigTest || state.curPage));
                if (!page || !page.trigger) return;
                const mode = page.triggerAlertMode || (page.triggerRules?.length ? 'selected' : 'all');
                if (page.trigger === 'alert' && mode === 'selected' && (!page.triggerRules || !page.triggerRules.length)) {
                    toast('No alerts selected for this trigger. Select at least one alert rule or switch to All alerts.', 'warn', 3500);
                    return;
                }
                try {
                    const response = await fetch(`/api/custom-overlays/${encodeURIComponent(state.overlay.id)}/page`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'trigger',
                            kind: page.trigger,
                            name: page.triggerName || (page.triggerRules?.[0] || ''),
                            seconds: page.triggerSeconds || 0
                        })
                    });
                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        throw new Error(err.error || 'Failed to trigger page');
                    }
                    const data = await response.json();
                    liveState = data;
                    renderPageBar();
                    toast(`Triggered “${page.name}”`, 'success', 3000);
                } catch (error) {
                    toast(error.message, 'warn', 3500);
                }
                return;
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

        pagesPanel.addEventListener('input', event => {
            if (event.target.id !== 'pg-search') return;
            const q = event.target.value.trim().toLowerCase();
            pagesPanel.querySelectorAll('.pg-row').forEach(r => { r.hidden = !!q && !r.querySelector('.pg-name').textContent.toLowerCase().includes(q); });
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
            if (/^pages\.(mode|transition)$/.test(path) || /^pages\.items\.\d+\.(trigger|triggerAlertMode)$/.test(path)) renderPagesPanel();
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
            if (path === 'pages.mode' || path === 'pages.transition' || path === 'pages.transitionEasing' || path === 'pages.enterExit' || /^pages\.items\.\d+\.(trigger|triggerAlertMode)$/.test(path || '')) {
                renderPagesPanel();
            }
        });
    }

    if (window.pollVisible) {
        window.pollVisible(refreshLivePage, 5000);
    }
}
