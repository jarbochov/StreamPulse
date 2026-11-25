// Variable Sets & Output Slots UI (supports 0-slot preset mode and 1-N multi-slot output channels)

import { api, esc, pickImage, slugId, state, toast } from './variables-state.js';
import { bindLinkControls, linkControl } from './variables-links.js';

const SVG_PLUS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const SVG_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const SVG_PREV = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const SVG_NEXT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const SVG_CLEAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_IMAGE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
const SVG_GRIP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
const SVG_PLAY = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
const SVG_PAUSE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

let dragPayload = null;
let reloadHandler = async () => {};
let rosterFilter = localStorage.getItem('variables_roster_filter') || '';
let directoryFilter = localStorage.getItem('variables_directory_filter') || '';
let directoryMode = localStorage.getItem('variables_dir_mode') || 'all';
const openTokenKeys = new Set();
let activePickerCleanup = null;

function supportsRotation(setObj) {
    return (setObj?.slotsCount || 0) < 2;
}

function getNextRotationEntry(setObj) {
    const rot = setObj?.rotation || {};
    const pool = (setObj?.roster || []).filter(r => r.enabled !== false);
    if (pool.length < 2) return null;
    if (rot.mode === 'random') return { id: '__random__', label: 'Random' };
    const pos = pool.findIndex(r => r.id === rot.entryId);
    return pool[pos === -1 ? 0 : (pos + 1) % pool.length];
}

function rotationTiming(setObj) {
    const rot = setObj?.rotation || {};
    const intervalMs = Math.max(1000, (Number(rot.intervalSeconds) || 10) * 1000);
    const changedAt = Number(rot.changedAt) || 0;
    if (!changedAt) return { remainingSec: Math.round(intervalMs / 1000), pct: 0 };
    const elapsed = Math.max(0, Date.now() - changedAt);
    const remainingMs = Math.max(0, intervalMs - elapsed);
    return {
        remainingSec: Math.ceil(remainingMs / 1000),
        pct: Math.min(100, Math.round((elapsed / intervalMs) * 100))
    };
}

function rotationCountdownText(setObj) {
    const next = getNextRotationEntry(setObj);
    if (!next) return 'Waiting for 2+ enabled';
    const { remainingSec } = rotationTiming(setObj);
    return next.id === '__random__'
        ? `Next random in ${remainingSec}s`
        : `Next: ${next.label} in ${remainingSec}s`;
}

function getSetOverlays(setObj) {
    const overlays = Array.isArray(state.overlays) ? state.overlays : [];
    const prefix = String(setObj?.id || '').toLowerCase();
    if (!prefix) return [];
    const result = [];
    for (const o of overlays) {
        const follows = o.variableSetFollow?.[setObj.id] === true;
        const usesToken = Array.isArray(o.varRefs) && o.varRefs.some(tok => tok === prefix || tok.startsWith(`${prefix}_`));
        if (follows || usesToken) {
            result.push({ id: o.id, name: o.name || o.id, following: follows && supportsRotation(setObj) });
        }
    }
    return result;
}

export function tickSetCountdowns() {
    const sets = state.variableSets || [];
    for (const setObj of sets) {
        if (!supportsRotation(setObj) || !setObj.rotation?.enabled) continue;
        const { remainingSec, pct } = rotationTiming(setObj);
        const wsBadge = document.querySelector(`[data-rot-countdown="${CSS.escape(setObj.id)}"]`);
        if (wsBadge) wsBadge.textContent = rotationCountdownText(setObj);
        const wsBar = document.querySelector(`[data-rot-progress="${CSS.escape(setObj.id)}"]`);
        if (wsBar) wsBar.style.width = `${pct}%`;
        const dirSub = document.querySelector(`[data-dir-rot-sub="${CSS.escape(setObj.id)}"]`);
        if (dirSub) {
            const entry = (setObj.roster || []).find(e => e.id === setObj.rotation.entryId);
            dirSub.textContent = `Rotating · ${entry ? entry.label : 'Starting'} (${remainingSec}s)`;
        }
    }
}

function closeSlotEntryPicker() {
    if (typeof activePickerCleanup === 'function') {
        activePickerCleanup();
        activePickerCleanup = null;
    }
}

function openSlotEntryPicker(anchorBtn, setObj, slotNum, mode = 'assign') {
    closeSlotEntryPicker();
    const entries = (setObj.roster || []).filter(e => e.enabled !== false);
    const slotLabel = (setObj.slotNames?.[slotNum - 1] || '').trim() || `Slot ${slotNum}`;
    const imgField = (setObj.fields || []).find(f => f.type === 'image');
    const slotLiveByEntry = new Map();
    (setObj.slots || []).forEach((id, idx) => {
        if (id) slotLiveByEntry.set(id, (setObj.slotNames?.[idx] || '').trim() || `S${idx + 1}`);
    });

    const isQueue = mode === 'queue';
    const pop = document.createElement('div');
    pop.className = 'slot-picker-popover';
    pop.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:.4rem;">
            <div style="display:flex; align-items:center; gap:.4rem; min-width:0;">
                <span class="slot-zone-pill ${isQueue ? 'is-queue' : 'is-live'}">${isQueue ? 'UP NEXT' : 'SET LIVE'}</span>
                <strong style="font-size:.8rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(slotLabel)}</strong>
            </div>
            <button type="button" class="b sm" data-picker-close style="padding:.1rem .35rem;">&times;</button>
        </div>
        <div class="muted" style="font-size:.72rem;">${isQueue ? `Adds to ${esc(slotLabel)}'s Up Next queue` : `Replaces what is currently live in ${esc(slotLabel)}`}</div>
        <input type="search" placeholder="Search roster..." aria-label="Search roster" style="padding:.3rem .5rem; font-size:.82rem;">
        <div class="slot-picker-list"></div>
    `;
    document.body.appendChild(pop);

    const rect = anchorBtn.getBoundingClientRect();
    const popW = 290;
    const left = Math.max(8, Math.min(window.innerWidth - popW - 8, rect.left));
    const top = Math.min(window.innerHeight - 330, rect.bottom + 6);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;

    const searchInput = pop.querySelector('input[type="search"]');
    const listEl = pop.querySelector('.slot-picker-list');
    let selectedIdx = 0;
    let visibleEntries = entries;

    const renderList = () => {
        const q = searchInput.value.trim().toLowerCase();
        visibleEntries = entries.filter(e => !q || `${e.label} ${e.id} ${getEntrySummary(setObj, e)}`.toLowerCase().includes(q));
        if (selectedIdx >= visibleEntries.length) selectedIdx = Math.max(0, visibleEntries.length - 1);
        if (!visibleEntries.length) {
            listEl.innerHTML = `<div class="muted" style="font-size:.78rem; padding:.5rem; text-align:center;">${entries.length ? 'No matching enabled entries.' : 'No enabled entries in roster.'}</div>`;
            return;
        }
        listEl.innerHTML = visibleEntries.map((e, i) => {
            const thumb = imgField && e.values?.[imgField.key] ? `<img src="${esc(e.values[imgField.key])}" alt="">` : '';
            const sub = getEntrySummary(setObj, e);
            const liveWhere = slotLiveByEntry.get(e.id);
            return `
                <button type="button" class="slot-picker-item ${i === selectedIdx ? 'is-active' : ''}" data-pick-entry="${esc(e.id)}">
                    ${thumb}
                    <div class="slot-picker-meta">
                        <div class="slot-picker-name">${esc(e.label)}</div>
                        ${sub ? `<div class="slot-picker-sub">${esc(sub)}</div>` : ''}
                    </div>
                    ${liveWhere ? `<span class="badge">${esc(liveWhere)}</span>` : ''}
                </button>
            `;
        }).join('');
    };

    const pickEntry = async entryId => {
        closeSlotEntryPicker();
        const base = `/api/variables/sets/${encodeURIComponent(setObj.id)}`;
        const endpoint = mode === 'queue'
            ? `${base}/queue/add?slot=${encodeURIComponent(slotNum)}&entry=${encodeURIComponent(entryId)}`
            : `${base}/assign?slot=${encodeURIComponent(slotNum)}&entry=${encodeURIComponent(entryId)}`;
        try {
            await api(endpoint, 'POST', {});
            await reloadHandler();
        } catch (err) {
            toast(err.message, 'error');
        }
    };

    renderList();
    searchInput.focus();

    searchInput.addEventListener('input', () => { selectedIdx = 0; renderList(); });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (visibleEntries.length) { selectedIdx = (selectedIdx + 1) % visibleEntries.length; renderList(); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (visibleEntries.length) { selectedIdx = (selectedIdx - 1 + visibleEntries.length) % visibleEntries.length; renderList(); } }
        else if (e.key === 'Enter' && visibleEntries[selectedIdx]) { e.preventDefault(); pickEntry(visibleEntries[selectedIdx].id); }
    });

    pop.addEventListener('click', e => {
        if (e.target.closest('[data-picker-close]')) return closeSlotEntryPicker();
        const item = e.target.closest('[data-pick-entry]');
        if (item) pickEntry(item.dataset.pickEntry);
    });

    const onDocDown = e => {
        if (!pop.contains(e.target) && !anchorBtn.contains(e.target)) closeSlotEntryPicker();
    };
    const onDocKey = e => { if (e.key === 'Escape') closeSlotEntryPicker(); };
    const timer = setTimeout(() => {
        document.addEventListener('mousedown', onDocDown);
        document.addEventListener('keydown', onDocKey);
    }, 0);

    activePickerCleanup = () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', onDocDown);
        document.removeEventListener('keydown', onDocKey);
        pop.remove();
    };
}

function getEntryThumb(setObj, entry) {
    const imgField = (setObj.fields || []).find(f => f.type === 'image');
    const url = imgField ? entry?.values?.[imgField.key] : '';
    if (url) return `<img src="${esc(url)}" alt="" class="set-thumb">`;
    return `<div class="set-thumb-placeholder">${SVG_IMAGE}</div>`;
}

function parseChecklistMap(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
    }
    return {};
}

function getEntrySummary(setObj, entry) {
    return (setObj.fields || [])
        .filter(f => f.type !== 'image')
        .slice(1, 3)
        .map(f => {
            const raw = entry?.values?.[f.key];
            if (f.type === 'checklist') {
                const map = parseChecklistMap(raw);
                const count = Object.values(map).filter(v => Number(v) >= 1).length;
                return count ? `${count} active` : '';
            }
            if (f.type === 'ref' && raw) {
                const target = (state.variableSets || []).find(s => s.id === f.targetSet);
                const match = target?.roster?.find(r => r.id === raw);
                return match?.label || raw;
            }
            return raw;
        })
        .filter(Boolean)
        .join(' · ');
}

function renderSlotCard(setObj, slotNum, entry) {
    const customName = String(setObj.slotNames?.[slotNum - 1] || '').trim();
    const displayName = customName || `Slot ${slotNum}`;
    const slotSlug = slugId(customName);
    const hasAlias = slotSlug && !/^\d+$/.test(slotSlug) && slotSlug !== 'active';

    const tokenList = [
        `var.${setObj.id}_${slotNum}_slot_name`,
        ...(setObj.fields || []).map(f => `var.${setObj.id}_${slotNum}_${f.key}`),
        ...(hasAlias ? (setObj.fields || []).map(f => `var.${setObj.id}_${slotSlug}_${f.key}`) : [])
    ];
    const tokens = tokenList.map(key => `<code class="copyable" title="Click to copy" data-copy="{{${esc(key)}}}">{{${esc(key)}}}</code>`).join('');
    const subFields = entry ? getEntrySummary(setObj, entry) : '';

    const byId = new Map((setObj.roster || []).map(r => [r.id, r]));
    const queueIds = setObj.slotQueues?.[slotNum - 1] || [];
    const queueChips = queueIds.map((qid, qIdx) => {
        const qEntry = byId.get(qid);
        if (!qEntry) return '';
        return `<span class="queue-chip" title="${esc(qEntry.label)}"><span>${esc(qEntry.label)}</span><button type="button" data-set-act="q-remove" data-slot="${slotNum}" data-q-idx="${qIdx}" aria-label="Remove from queue">&times;</button></span>`;
    }).filter(Boolean).join('');

    return `
        <div class="slot-card ${entry ? 'filled' : 'empty'}"
             data-set="${esc(setObj.id)}"
             data-slot="${slotNum}"
             ${entry ? 'draggable="true"' : ''}>
            <div class="slot-head">
                <input type="text"
                       class="slot-name-input"
                       data-slot-name="${slotNum}"
                       value="${esc(customName)}"
                       placeholder="Slot ${slotNum}"
                       title="Customize slot name (also exposed as {{var.${esc(setObj.id)}_${slotNum}_slot_name}})"
                       aria-label="${esc(displayName)} name">
                <div class="slot-actions">
                    <button type="button" class="b sm" data-set-act="prev" data-slot="${slotNum}" title="Previous entry">${SVG_PREV}</button>
                    <button type="button" class="b sm" data-set-act="next" data-slot="${slotNum}" title="${queueIds.length ? 'Pop next from queue' : 'Next entry'}">${SVG_NEXT}</button>
                    <button type="button" class="b sm" data-set-act="clear" data-slot="${slotNum}" title="Clear slot" ${entry ? '' : 'disabled'}>${SVG_CLEAR}</button>
                </div>
            </div>
            <div class="slot-live-zone">
                <div class="slot-zone-head">
                    <span class="slot-zone-pill is-live">${entry ? 'Live Now' : 'Live Slot'}</span>
                    <button type="button" class="b sm" style="padding:.12rem .42rem; font-size:.7rem;" data-set-act="pick-assign" data-slot="${slotNum}">${entry ? 'Swap...' : 'Set Live...'}</button>
                </div>
                ${entry ? `
                    <div class="slot-body">
                        ${getEntryThumb(setObj, entry)}
                        <div class="slot-info">
                            <div class="slot-title">${esc(entry.label)}</div>
                            ${subFields ? `<div class="slot-sub">${esc(subFields)}</div>` : ''}
                        </div>
                    </div>
                ` : `
                    <div class="slot-empty-hint" style="padding:.25rem 0;">Empty — click Set Live or drop here</div>
                `}
            </div>
            <div class="slot-queue ${queueIds.length ? '' : 'is-empty'}" data-set="${esc(setObj.id)}" data-slot-queue="${slotNum}">
                <div class="slot-queue-head">
                    <span style="display:inline-flex; align-items:center; gap:.3rem;"><span class="slot-zone-pill is-queue">Up Next (${queueIds.length})</span></span>
                    <span style="display:inline-flex; gap:.25rem;">
                        <button type="button" class="b sm" style="padding:.12rem .42rem; font-size:.7rem;" data-set-act="pick-queue" data-slot="${slotNum}">+ Queue</button>
                        ${queueIds.length ? `<button type="button" class="b sm" style="padding:.12rem .35rem; font-size:.7rem;" data-set-act="q-clear" data-slot="${slotNum}">Clear</button>` : ''}
                    </span>
                </div>
                ${queueIds.length ? `<div class="slot-queue-chips">${queueChips}</div>` : `<div class="muted" style="font-size:.7rem;">Drop here to add to queue</div>`}
            </div>
            <details class="slot-tokens" data-token-key="${esc(setObj.id)}:${slotNum}"${openTokenKeys.has(`${setObj.id}:${slotNum}`) ? ' open' : ''}>
                <summary>Tokens (${tokenList.length})</summary>
                <div class="token-pills">${tokens}</div>
            </details>
        </div>
    `;
}

function renderActivePresetBar(setObj, entry) {
    const tokens = (setObj.fields || []).map(f => {
        const key = `var.${setObj.id}_${f.key}`;
        return `<code class="copyable" title="Click to copy" data-copy="{{${esc(key)}}}">{{${esc(key)}}}</code>`;
    }).join('');
    const subFields = entry ? getEntrySummary(setObj, entry) : '';
    const rotLive = supportsRotation(setObj) && Boolean(setObj.rotation?.enabled);
    const titleLabel = rotLive
        ? (entry ? 'Default Output (unfollowed overlays)' : 'Default Output (None)')
        : (entry ? 'Active Output' : 'No Active Entry');

    return `
        <div class="slot-card ${entry ? 'filled' : 'empty'}">
            <div class="slot-head">
                <span class="badge">${titleLabel}</span>
                <div class="slot-actions">
                    <button type="button" class="b sm" data-set-act="prev" data-slot="1" title="Previous entry">${SVG_PREV}</button>
                    <button type="button" class="b sm" data-set-act="next" data-slot="1" title="Next entry">${SVG_NEXT}</button>
                    <button type="button" class="b sm" data-set-act="clear" data-slot="1" title="Clear active output" ${entry ? '' : 'disabled'}>${SVG_CLEAR}</button>
                </div>
            </div>
            ${rotLive ? `<div class="muted" style="font-size:.73rem;">Following overlays show the <strong>Live Rotation</strong> entry above; overlays without Follow use this fallback.</div>` : ''}
            ${entry ? `
                <div class="slot-body">
                    ${getEntryThumb(setObj, entry)}
                    <div class="slot-info">
                        <div class="slot-title">${esc(entry.label)}</div>
                        ${subFields ? `<div class="slot-sub">${esc(subFields)}</div>` : ''}
                    </div>
                </div>
            ` : `
                <div class="slot-empty-hint">Click Activate on any entry below to push its default values live</div>
            `}
            <details class="slot-tokens" data-token-key="${esc(setObj.id)}:preset"${openTokenKeys.has(`${setObj.id}:preset`) ? ' open' : ''}>
                <summary>Output Tokens (${(setObj.fields || []).length})</summary>
                <div class="token-pills">${tokens}</div>
            </details>
        </div>
    `;
}

function renderRosterItem(setObj, entry) {
    const slotsCount = setObj.slotsCount || 0;
    const isEnabled = entry.enabled !== false;
    const slotLabel = idx => (setObj.slotNames?.[idx] || '').trim() || `Slot ${idx + 1}`;
    const liveSlotLabels = slotsCount > 0
        ? (setObj.slots || []).map((id, idx) => (id === entry.id ? slotLabel(idx) : '')).filter(Boolean)
        : [];
    const rot = setObj.rotation || {};
    const isRotatingNow = supportsRotation(setObj) && Boolean(rot.enabled) && rot.entryId === entry.id;
    const isLive = slotsCount === 0
        ? setObj.activeEntry === entry.id
        : liveSlotLabels.length > 0;
    const rotLiveActive = supportsRotation(setObj) && Boolean(rot.enabled);

    const assignControl = slotsCount === 0
        ? `<button type="button" class="b sm ${isLive ? 'primary' : ''}" data-set-act="assign" data-slot="1" data-entry="${esc(entry.id)}">${isLive ? (rotLiveActive ? 'Default' : 'Live') : (rotLiveActive ? 'Set Default' : 'Activate')}</button>`
        : '';
    const inGroup = entry.inGroup !== false;

    const summary = getEntrySummary(setObj, entry);
    const liveBadge = [
        isRotatingNow ? '<span class="rot-live-pill">Rotating Now</span>' : '',
        liveSlotLabels.length ? `<span class="live-slot-pill">${esc(liveSlotLabels.join(', '))}</span>` : ''
    ].filter(Boolean).join('');

    return `
        <div class="roster-item ${isLive ? 'is-live' : ''} ${isRotatingNow ? 'is-rotating' : ''} ${!isEnabled ? 'is-disabled' : ''}"
             ${slotsCount > 0 ? 'draggable="true"' : ''}
             data-set="${esc(setObj.id)}"
             data-entry="${esc(entry.id)}">
            ${slotsCount > 0 ? `<span class="roster-grip" title="Drag onto a slot">${SVG_GRIP}</span>` : ''}
            ${getEntryThumb(setObj, entry)}
            <div class="roster-meta">
                <div class="roster-name">${esc(entry.label)}${liveBadge}</div>
                <div class="roster-sub">${esc(summary || entry.id)}</div>
            </div>
            <div class="roster-controls">
                ${assignControl}
                <button type="button" class="b sm ${inGroup ? 'is-in-group' : ''}" data-set-act="toggle-group-entry" data-entry="${esc(entry.id)}" title="${inGroup ? 'Included in Group token & Group Strip (click to exclude)' : 'Excluded from Group token & Group Strip (click to include)'}">${inGroup ? 'In Group' : 'Out'}</button>
                <button type="button" class="b sm ${isEnabled ? '' : 'primary'}" data-set-act="toggle-entry" data-entry="${esc(entry.id)}" title="${isEnabled ? 'Disable in rotation' : 'Enable in rotation'}">${isEnabled ? 'On' : 'Off'}</button>
                <button type="button" class="b sm" data-set-act="edit-entry" data-entry="${esc(entry.id)}" title="Edit entry">${SVG_EDIT}</button>
                <button type="button" class="b sm danger" data-set-act="delete-entry" data-entry="${esc(entry.id)}" title="Remove entry">${SVG_TRASH}</button>
            </div>
        </div>
    `;
}

function renderRotationBar(setObj) {
    // Timed spotlight rotation applies only to Preset (0-slot) and single-slot (1-slot) sets.
    if (!supportsRotation(setObj)) return '';
    const rot = setObj.rotation || {};
    const isLive = Boolean(rot.enabled);
    const entry = (setObj.roster || []).find(e => e.id === rot.entryId);
    const enabledCount = (setObj.roster || []).filter(e => e.enabled !== false).length;
    const { pct } = isLive ? rotationTiming(setObj) : { pct: 0 };
    const tr = ['fade', 'slide-up', 'flip', 'none'];
    const trLabel = { fade: 'Crossfade', 'slide-up': 'Slide up', flip: 'Flip', none: 'Instant' };

    return `
        <div class="set-rot-panel${isLive ? ' is-live' : ''}">
            <div class="set-rot-top">
                <div class="set-rot-status">
                    <span class="set-rot-pulse" aria-hidden="true"></span>
                    <span class="set-section-title" style="margin:0;"><span>Live Rotation</span></span>
                    <span class="badge${isLive ? ' badge-now' : ''}">${isLive ? 'Running' : 'Paused'}</span>
                    ${isLive ? `<span class="set-rot-now">${entry ? esc(entry.label) : 'No active entry'}</span>` : ''}
                    ${isLive ? `<span class="set-rot-next" data-rot-countdown="${esc(setObj.id)}">${esc(rotationCountdownText(setObj))}</span>` : ''}
                </div>
                <div class="set-rot-actions">
                    ${isLive ? `<button type="button" class="b sm" data-set-act="rotation/prev" title="Previous rotation entry">${SVG_PREV}</button><button type="button" class="b sm" data-set-act="rotation/next" title="Next rotation entry">${SVG_NEXT}</button>` : ''}
                    <button type="button" class="b sm${isLive ? '' : ' primary'}" data-set-act="rotation/${isLive ? 'stop' : 'start'}">${isLive ? 'Pause rotation' : 'Start rotation'}</button>
                </div>
            </div>
            <div class="set-rot-controls">
                <label>Every <input type="number" min="1" max="3600" data-rot-field="intervalSeconds" value="${Number(rot.intervalSeconds) || 10}" style="width:4.2rem;"> s</label>
                <label>Order <select data-rot-field="mode"><option value="sequential"${rot.mode !== 'random' ? ' selected' : ''}>In order</option><option value="random"${rot.mode === 'random' ? ' selected' : ''}>Random</option></select></label>
                <label>Transition <select data-rot-field="transition">${tr.map(t => `<option value="${t}"${(rot.transition || 'fade') === t ? ' selected' : ''}>${trLabel[t]}</option>`).join('')}</select></label>
                <label>Duration <input type="number" min="50" max="2000" step="50" data-rot-field="durationMs" value="${Number(rot.durationMs) || 350}" style="width:4.4rem;"> ms</label>
                <span style="flex:1"></span>
                <span>Shared clock for overlays with <strong>Follow</strong> enabled in the editor's Sets tab.</span>
            </div>
            ${isLive && enabledCount < 2 ? `<div class="rot-warn-note">Enable at least 2 roster entries for automatic rotation to cycle.</div>` : ''}
            ${isLive ? `<div class="set-rot-track" aria-hidden="true"><div class="set-rot-fill" data-rot-progress="${esc(setObj.id)}" style="width:${pct}%"></div></div>` : ''}
        </div>`;
}

function renderGroupBar(setObj) {
    const group = setObj.group || { separator: ', ', lastSeparator: '', itemTemplate: '' };
    const sep = group.separator !== undefined ? group.separator : ', ';
    const lastSep = group.lastSeparator || '';
    const tpl = group.itemTemplate || '';
    const activeMembers = (setObj.roster || []).filter(e => e.inGroup !== false);
    const groupVar = (state.customVars || []).find(v => v.name === `${setObj.id}_group`);
    const previewText = groupVar ? String(groupVar.value ?? '') : activeMembers.map(e => e.label).join(sep);
    const firstField = setObj.fields?.[0]?.key || 'name';
    const isOpen = openTokenKeys.has(`${setObj.id}:group`);

    const sepChips = [
        [', ', 'Comma'],
        [' • ', 'Bullet'],
        [' | ', 'Pipe'],
        [' / ', 'Slash'],
        ['\n', 'Newline']
    ].map(([val, lbl]) => `<button type="button" class="group-sep-chip" data-group-sep-chip="${esc(val)}">${esc(lbl)}</button>`).join('');

    const tokenChips = [
        `var.${setObj.id}_group`,
        `var.${setObj.id}_group_count`,
        ...(setObj.fields || []).map(f => `var.${setObj.id}_group_${f.key}`),
        ...(setObj.slotsCount > 0 ? (setObj.fields || []).map(f => `var.${setObj.id}_joined_${f.key}`) : [])
    ].map(key => `<code class="copyable" title="Click to copy" data-copy="{{${esc(key)}}}">{{${esc(key)}}}</code>`).join('');

    return `
        <details class="set-group-panel" data-group-details="${esc(setObj.id)}"${isOpen ? ' open' : ''}>
            <summary>
                <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; min-width:0;">
                    <span class="set-section-title" style="margin:0;">Dynamic Group &amp; Delimiters</span>
                    <span class="badge">${activeMembers.length} active</span>
                    <code class="copyable" title="Click to copy" data-copy="{{var.${esc(setObj.id)}_group}}">{{var.${esc(setObj.id)}_group}}</code>
                </div>
                <span class="muted" style="font-size:.75rem;">Configure separators &amp; preview</span>
            </summary>
            <div class="set-group-body">
                <div class="set-rot-controls" style="border-top:0; padding-top:0;">
                    <label>Delimiter <input type="text" data-group-field="separator" value="${esc(sep)}" placeholder=", " style="width:6rem;" title="Separator between items"></label>
                    <div class="group-sep-chips" aria-label="Quick delimiters">${sepChips}</div>
                    <label>Final delimiter <input type="text" data-group-field="lastSeparator" value="${esc(lastSep)}" placeholder=" &amp; " style="width:6rem;" title="Optional delimiter before the final item (e.g. ' &amp; ' or ', and ')"></label>
                </div>
                <div class="set-rot-controls" style="border-top:0; padding-top:0;">
                    <label style="flex:1; min-width:14rem;">Item format
                        <input type="text" data-group-field="itemTemplate" value="${esc(tpl)}" placeholder="{{${esc(firstField)}}} (leave blank for first field)" style="flex:1; min-width:10rem;">
                    </label>
                    <span class="muted" style="font-size:.73rem;">Use field keys like <code>{{name}} ({{handle}})</code> — empty wrappers collapse automatically.</span>
                </div>
                <div class="group-preview-box">${previewText ? esc(previewText) : '<span class="muted">(no active group entries — click "In Group" on roster entries below)</span>'}</div>
                <div class="token-pills">${tokenChips}</div>
            </div>
        </details>`;
}

function renderSetConsumers(setObj) {
    const consumers = getSetOverlays(setObj);
    if (!consumers.length) return '';
    return `
        <div class="set-consumers-bar">
            <span>Used in overlays:</span>
            ${consumers.map(c => `
                <a class="set-consumer-chip${c.following ? ' is-following' : ''}" href="/custom-overlay-editor.html?id=${encodeURIComponent(c.id)}" target="_blank" rel="noopener" title="${c.following ? 'Follows live rotation' : 'Uses static set placeholders'}">
                    <span class="dot" aria-hidden="true"></span>
                    <span>${esc(c.name)}</span>
                    <span class="muted" style="font-size:.67rem;">${c.following ? 'Following' : 'Static'}</span>
                </a>
            `).join('')}
        </div>`;
}

function renderDirectory(sets, activeSet) {
    const q = directoryFilter.trim().toLowerCase();
    const counts = {
        all: sets.length,
        rotating: sets.filter(s => supportsRotation(s) && s.rotation?.enabled).length,
        slots: sets.filter(s => (s.slotsCount || 0) > 0).length,
        preset: sets.filter(s => (s.slotsCount || 0) === 0).length
    };
    const visible = sets.filter(s => {
        if (directoryMode === 'rotating' && !(supportsRotation(s) && s.rotation?.enabled)) return false;
        if (directoryMode === 'slots' && (s.slotsCount || 0) === 0) return false;
        if (directoryMode === 'preset' && (s.slotsCount || 0) > 0) return false;
        if (q && !`${s.name} ${s.id}`.toLowerCase().includes(q)) return false;
        return true;
    });

    const rowsHtml = visible.length
        ? visible.map(s => {
            const isRot = supportsRotation(s) && Boolean(s.rotation?.enabled);
            const slotsCount = s.slotsCount || 0;
            const modeLabel = slotsCount === 0 ? 'Preset' : `${slotsCount}s`;
            const byId = new Map((s.roster || []).map(r => [r.id, r]));
            let subText = '';
            if (isRot) {
                const entry = byId.get(s.rotation.entryId);
                const { remainingSec } = rotationTiming(s);
                subText = `Rotating · ${entry ? entry.label : 'Starting'} (${remainingSec}s)`;
            } else if (slotsCount > 0) {
                const filled = (s.slots || []).filter(Boolean).length;
                subText = filled ? `${filled}/${slotsCount} slots live` : 'All slots empty';
            } else {
                const act = byId.get(s.activeEntry || '');
                subText = act ? `Active: ${act.label}` : 'Idle';
            }
            const quickRotBtn = supportsRotation(s)
                ? `<button type="button" class="set-dir-play${isRot ? ' is-on' : ''}" data-dir-rot-toggle="${esc(s.id)}" title="${isRot ? 'Pause live rotation' : 'Start live rotation'}" aria-label="${isRot ? 'Pause' : 'Start'} ${esc(s.name)} rotation">${isRot ? SVG_PAUSE : SVG_PLAY}</button>`
                : '';

            return `
                <div class="set-dir-item ${s.id === activeSet.id ? 'active' : ''} ${isRot ? 'is-rotating' : ''}">
                    <button type="button" class="set-dir-main" data-select-set="${esc(s.id)}">
                        <div class="set-dir-top">
                            <span class="set-dir-dot" aria-hidden="true"></span>
                            <span class="set-dir-name">${esc(s.name)}</span>
                            <span class="set-dir-mode">${modeLabel}</span>
                        </div>
                        <div class="set-dir-sub"${isRot ? ` data-dir-rot-sub="${esc(s.id)}"` : ''}>${esc(subText)}</div>
                    </button>
                    ${quickRotBtn}
                </div>`;
        }).join('')
        : `<div class="muted" style="font-size:.78rem; padding:.5rem .25rem; text-align:center;">No sets match filter.</div>`;

    return `
        <aside class="sets-dir" aria-label="Variable Sets Directory">
            <input type="search" id="set-dir-search" class="sets-dir-search" value="${esc(directoryFilter)}" placeholder="Search sets (${sets.length})..." aria-label="Search variable sets">
            <div class="sets-dir-filters" role="group" aria-label="Filter sets">
                <button type="button" class="sets-filter-btn${directoryMode === 'all' ? ' active' : ''}" data-dir-mode="all">All (${counts.all})</button>
                ${counts.rotating ? `<button type="button" class="sets-filter-btn${directoryMode === 'rotating' ? ' active' : ''}" data-dir-mode="rotating">Rotating (${counts.rotating})</button>` : ''}
                ${counts.slots ? `<button type="button" class="sets-filter-btn${directoryMode === 'slots' ? ' active' : ''}" data-dir-mode="slots">Slots (${counts.slots})</button>` : ''}
                ${counts.preset ? `<button type="button" class="sets-filter-btn${directoryMode === 'preset' ? ' active' : ''}" data-dir-mode="preset">Preset (${counts.preset})</button>` : ''}
            </div>
            <div class="sets-dir-list">${rowsHtml}</div>
        </aside>`;
}

export function renderSets() {
    const host = document.getElementById('sets-list');
    if (!host) return;
    const sets = state.variableSets || [];

    if (!sets.length) {
        host.innerHTML = `
            <div class="empty-sets" style="padding:1.25rem; background:var(--bg-inset); border:1px dashed var(--border); border-radius:8px; text-align:center;">
                <div class="muted" style="margin-bottom:.75rem;">
                    No variable sets yet. Create a set to group structured fields (e.g. Sponsors, Casters, Guests, Teams, Products) as reusable presets or multi-slot output channels.
                </div>
                <button type="button" class="b primary sm" id="set-new-empty">${SVG_PLUS} New Variable Set</button>
            </div>
        `;
        return;
    }

    const savedId = localStorage.getItem('variables_active_set');
    const activeSet = sets.find(s => s.id === savedId) || sets[0];
    localStorage.setItem('variables_active_set', activeSet.id);

    const activeEl = document.activeElement;
    const focusInfo = activeEl && host.contains(activeEl) && activeEl.id
        ? { id: activeEl.id, start: activeEl.selectionStart, end: activeEl.selectionEnd }
        : null;

    const dirHtml = renderDirectory(sets, activeSet);

    const byId = new Map((activeSet.roster || []).map(r => [r.id, r]));
    const slotsCount = activeSet.slotsCount || 0;
    const outputHtml = slotsCount === 0
        ? renderActivePresetBar(activeSet, byId.get(activeSet.activeEntry || '') || null)
        : `<div class="slots-grid">${Array.from({ length: slotsCount }, (_, i) => {
            const slotNum = i + 1;
            return renderSlotCard(activeSet, slotNum, byId.get(activeSet.slots?.[i] || '') || null);
        }).join('')}</div>`;

    const filteredRoster = (activeSet.roster || []).filter(entry => {
        const q = rosterFilter.trim().toLowerCase();
        if (!q) return true;
        return `${entry.label} ${entry.id} ${Object.values(entry.values || {}).join(' ')}`.toLowerCase().includes(q);
    });

    const rosterHtml = filteredRoster.length
        ? filteredRoster.map(entry => renderRosterItem(activeSet, entry)).join('')
        : `<div class="muted" style="font-size:.82rem; padding:.5rem 0;">${(activeSet.roster || []).length ? 'No entries match your filter.' : 'No entries yet. Click "+ Add Entry" or "Import CSV" above to populate this set.'}</div>`;

    const slotBadge = slotsCount === 0 ? 'Preset mode (0 slots)' : `${slotsCount} output slot${slotsCount === 1 ? '' : 's'}`;

    host.innerHTML = `
        <div class="sets-directory-layout">
            ${dirHtml}
            <div class="set-workspace" data-set-card="${esc(activeSet.id)}">
                <div class="set-card-head">
                    <div style="display:grid; gap:.35rem; min-width:0;">
                        <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
                            <strong style="font-size:1.02rem;">${esc(activeSet.name)}</strong>
                            <code class="badge">${esc(activeSet.id)}</code>
                            <span class="badge">${slotBadge}</span>
                            <span class="badge">${(activeSet.roster || []).length} entries</span>
                        </div>
                        ${renderSetConsumers(activeSet)}
                    </div>
                    <div class="set-card-actions">
                        <button type="button" class="b sm primary" data-set-act="add-entry">${SVG_PLUS} Add Entry</button>
                        <button type="button" class="b sm" data-set-act="inc-slot" title="Add an output slot">+ Slot</button>
                        ${slotsCount > 0 ? '<button type="button" class="b sm" data-set-act="dec-slot" title="Remove last output slot">- Slot</button>' : ''}
                        <button type="button" class="b sm" data-set-act="edit-set">${SVG_EDIT} Edit Set</button>
                        <button type="button" class="b sm danger" data-set-act="delete-set" title="Delete set">${SVG_TRASH}</button>
                    </div>
                </div>
                ${renderRotationBar(activeSet)}
                ${renderGroupBar(activeSet)}
                <div class="${slotsCount > 0 ? 'sets-split' : ''}" style="${slotsCount > 0 ? '' : 'display:grid; gap:1rem;'}">
                    <div>
                        <div class="set-section-title">
                            <span>${slotsCount > 0 ? 'Output Channels' : 'Output'}</span>
                            ${slotsCount > 1 ? `
                                <div style="display:flex; gap:.3rem; align-items:center; text-transform:none; letter-spacing:0; font-weight:500;">
                                    <span class="muted" style="font-size:.74rem;">Shift Queue:</span>
                                    <button type="button" class="b sm" data-set-act="rewind" title="Shift all slots back">${SVG_PREV} Prev</button>
                                    <button type="button" class="b sm" data-set-act="advance" title="Shift all slots forward">Next ${SVG_NEXT}</button>
                                </div>
                            ` : ''}
                        </div>
                        ${outputHtml}
                    </div>
                    <div class="roster-section ${slotsCount > 0 ? 'sets-roster-pane' : ''}">
                        <div class="set-section-title" style="flex-wrap:wrap;">
                            <span title="${slotsCount > 0 ? 'Drag entries onto any output slot' : 'Activate a saved preset'}">${slotsCount > 0 ? 'Roster library' : 'Saved presets'}</span>
                            <div style="display:flex; gap:.35rem; align-items:center; text-transform:none; letter-spacing:0; font-weight:500; flex-wrap:wrap;">
                                ${(activeSet.roster || []).length > 4 || rosterFilter ? `<input type="search" id="set-roster-filter" value="${esc(rosterFilter)}" placeholder="Filter entries..." style="padding:.22rem .55rem; font-size:.78rem; width:10rem;">` : ''}
                                ${(() => {
                                    const hasChecklist = (activeSet.fields || []).some(f => f.type === 'checklist');
                                    if (hasChecklist) {
                                        return `<a class="b sm" href="/operator.html#${encodeURIComponent(activeSet.id)}/matrix" style="text-decoration:none;">Open Tracker</a>`;
                                    }
                                    const matrixOwner = (state.variableSets || []).find(s => s.id !== activeSet.id && (s.fields || []).some(f => f.type === 'checklist' && f.targetSet === activeSet.id));
                                    return matrixOwner ? `<a class="b sm" href="/operator.html#${encodeURIComponent(matrixOwner.id)}/matrix" style="text-decoration:none;">Tracker: ${esc(matrixOwner.name)}</a>` : '';
                                })()}
                                <a class="b sm" href="/operator.html#${encodeURIComponent(activeSet.id)}" style="text-decoration:none;">Operator Grid</a>
                                <a class="b sm" href="/api/variables/sets/${encodeURIComponent(activeSet.id)}/export?format=csv" download="${esc(activeSet.id)}-roster.csv" style="text-decoration:none;">Export CSV</a>
                                <label class="b sm" style="display:inline-flex; align-items:center; cursor:pointer;">Import CSV<input type="file" data-set-csv-import accept=".csv,text/csv" hidden></label>
                            </div>
                        </div>
                        <div class="roster-list">${rosterHtml}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (focusInfo) {
        const nextEl = document.getElementById(focusInfo.id);
        if (nextEl && typeof nextEl.focus === 'function') {
            nextEl.focus();
            if (typeof focusInfo.start === 'number' && nextEl.setSelectionRange) {
                nextEl.setSelectionRange(focusInfo.start, focusInfo.end);
            }
        }
    }
}

function showModal(title, bodyHtml, footHtml, onMount) {
    const backdrop = document.createElement('div');
    backdrop.className = 'vp-backdrop';
    backdrop.innerHTML = `
        <div class="vp-modal" role="dialog" aria-label="${esc(title)}">
            <div class="vp-modal-head">
                <strong>${esc(title)}</strong>
                <button type="button" class="b sm" data-vp-close>${SVG_CLEAR}</button>
            </div>
            <div class="vp-modal-body">${bodyHtml}</div>
            <div class="vp-modal-foot">${footHtml}</div>
        </div>
    `;
    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
    };
    function onKey(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    }
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', e => {
        if (e.target === backdrop || e.target.closest('[data-vp-close]')) close();
    });
    document.body.appendChild(backdrop);
    onMount(backdrop, close);
}

export function openSetModal(existing = null) {
    const isEdit = Boolean(existing);
    const fields = (existing?.fields || [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'label', label: 'Subtitle', type: 'text' },
        { key: 'image', label: 'Image', type: 'image' }
    ]).map(f => ({ ...f }));

    const availableTargets = (state.variableSets || []).filter(s => !existing || s.id !== existing.id);

    const renderFieldRows = host => {
        if (fields.some(f => f.icon)) window.IconPicker?.ensureFont?.();
        host.innerHTML = fields.map((f, idx) => {
            const targetOptions = `<option value="">Choose a linked set...</option>${availableTargets.map(s => `<option value="${esc(s.id)}" ${f.targetSet === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
            const subConfig = ['ref', 'ref_list', 'checklist'].includes(f.type)
                ? `<div class="vp-link-config"><label>${f.type === 'checklist' ? 'Track items from' : 'Choose entries from'}<select data-f-prop="targetSet">${targetOptions}</select></label>${f.type === 'checklist'
                    ? `<label title="For items without custom levels. Items with levels use their own level count. Zero is always Not started / Not owned.">Default levels<input type="number" min="1" max="100" data-f-prop="maxTier" value="${Math.max(1, Number(f.maxTier) || 1)}"></label><p class="muted">Each owner keeps separate progress. Define item upgrade labels and images in the linked set.</p>`
                    : `<p class="muted">Choose ${f.type === 'ref' ? 'one reusable entry' : 'several reusable entries'}. Links never change live slots.</p>`}</div>`
                : ['counter', 'number'].includes(f.type)
                    ? `<div class="vp-link-config" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;">
                        <label title="Optional lower bound">Min (optional)<input type="number" step="any" data-f-prop="min" value="${f.min ?? ''}" placeholder="None"></label>
                        <label title="Optional cap / maximum (used automatically by Counter &amp; Pips displays)">Cap / Max (optional)<input type="number" step="any" data-f-prop="max" value="${f.max ?? ''}" placeholder="Grow"></label>
                        <label title="Default increment/decrement step">Step<input type="number" step="any" min="0.01" data-f-prop="step" value="${f.step ?? ''}" placeholder="1"></label>
                        <p class="muted" style="grid-column:1 / -1;margin:0;">Leave Cap / Max blank to grow dynamically. Counter &amp; Pips displays automatically inherit this cap.</p>
                    </div>`
                    : '';
            return `
            <div class="vp-field-row" data-f-idx="${idx}">
                <input type="text" data-f-prop="label" value="${esc(f.label)}" placeholder="Label (e.g. Name)">
                <input type="text" data-f-prop="key" value="${esc(f.key)}" placeholder="key (e.g. name)">
                <select data-f-prop="type">
                    <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="number" ${f.type === 'number' ? 'selected' : ''}>Number</option>
                    <option value="counter" ${f.type === 'counter' ? 'selected' : ''}>Counter</option>
                    <option value="image" ${f.type === 'image' ? 'selected' : ''}>Image</option>
                    <option value="icon" ${f.type === 'icon' ? 'selected' : ''}>Icon</option>
                    <option value="color" ${f.type === 'color' ? 'selected' : ''}>Color</option>
                    <option value="toggle" ${f.type === 'toggle' ? 'selected' : ''}>Toggle</option>
                    <option value="font" ${f.type === 'font' ? 'selected' : ''}>Font</option>
                    <option value="list" ${f.type === 'list' ? 'selected' : ''}>List</option>
                    <option value="template" ${f.type === 'template' ? 'selected' : ''}>Template</option>
                    <option value="date" ${f.type === 'date' ? 'selected' : ''}>Date</option>
                    <option value="time" ${f.type === 'time' ? 'selected' : ''}>Time</option>
                    <option value="datetime" ${f.type === 'datetime' ? 'selected' : ''}>Date &amp; Time</option>
                    <option value="duration" ${f.type === 'duration' ? 'selected' : ''}>Duration</option>
                    <option value="ref" ${f.type === 'ref' ? 'selected' : ''}>Linked entry</option>
                    <option value="ref_list" ${f.type === 'ref_list' ? 'selected' : ''}>Linked entries</option>
                    <option value="checklist" ${f.type === 'checklist' ? 'selected' : ''}>Tracker</option>
                </select>
                <button type="button" class="b sm vp-f-icon-btn" data-f-icon="${idx}" title="${f.icon ? `Field icon: ${esc(f.icon)}` : 'Optional icon (e.g. fa-brands fa-twitch)'}">${f.icon ? `<i class="${esc(f.icon)}"></i>` : 'Icon'}</button>
                <button type="button" class="b sm danger" data-f-remove="${idx}" ${fields.length <= 1 ? 'disabled' : ''}>${SVG_TRASH}</button>
                ${subConfig}
            </div>
        `;
        }).join('');
    };

    showModal(isEdit ? `Edit Set: ${existing.name}` : 'Create Variable Set', `
        <form id="vp-set-form" class="vp-form">
            <div class="vp-row-2">
                <label>Display Name
                    <input type="text" id="vp-set-name" value="${esc(existing?.name || '')}" placeholder="e.g. Sponsors, Casters, Teams" required>
                </label>
                <label>Set ID
                    <input type="text" id="vp-set-id" value="${esc(existing?.id || '')}" placeholder="e.g. sponsor" ${isEdit ? 'readonly' : ''} required>
                </label>
            </div>
            <label>Output Slots (0 = Direct Preset mode, 1+ = Multi-Slot channels)
                <input type="number" id="vp-set-slots" min="0" max="24" value="${existing?.slotsCount ?? 0}">
            </label>
            <div class="vp-fields-box">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem;">
                    <span class="muted" style="font-weight:600;">Entry fields</span>
                    <button type="button" class="b sm" id="vp-add-field">${SVG_PLUS} Add Field</button>
                </div>
                <div id="vp-fields-list" class="vp-fields-list"></div>
            </div>
        </form>
    `, `
        <button type="button" class="b" data-vp-close>Cancel</button>
        <button type="submit" form="vp-set-form" class="b primary">${isEdit ? 'Save Set' : 'Create Set'}</button>
    `, (modal, close) => {
        const nameInput = modal.querySelector('#vp-set-name');
        const idInput = modal.querySelector('#vp-set-id');
        const fieldsHost = modal.querySelector('#vp-fields-list');
        renderFieldRows(fieldsHost);

        if (!isEdit) {
            nameInput.addEventListener('input', () => {
                if (!idInput.dataset.touched) idInput.value = slugId(nameInput.value);
            });
            idInput.addEventListener('input', () => {
                idInput.dataset.touched = '1';
            });
        }

        fieldsHost.addEventListener('input', e => {
            const row = e.target.closest('[data-f-idx]');
            if (!row) return;
            const idx = Number(row.dataset.fIdx);
            const prop = e.target.dataset.fProp;
            fields[idx][prop] = e.target.value;
            if (prop === 'label' && !isEdit && !row.dataset.keyTouched) {
                const k = slugId(e.target.value).slice(0, 20);
                fields[idx].key = k;
                row.querySelector('[data-f-prop="key"]').value = k;
            }
            if (prop === 'key') row.dataset.keyTouched = '1';
            if (prop === 'type') renderFieldRows(fieldsHost);
        });

        fieldsHost.addEventListener('click', e => {
            const iconBtn = e.target.closest('[data-f-icon]');
            if (iconBtn) {
                const idx = Number(iconBtn.dataset.fIcon);
                window.IconPicker?.open({
                    value: fields[idx]?.icon || '',
                    onPick: cls => {
                        if (!fields[idx]) return;
                        fields[idx].icon = cls || '';
                        renderFieldRows(fieldsHost);
                    }
                });
                return;
            }
            const btn = e.target.closest('[data-f-remove]');
            if (!btn || fields.length <= 1) return;
            fields.splice(Number(btn.dataset.fRemove), 1);
            renderFieldRows(fieldsHost);
        });

        modal.querySelector('#vp-add-field').onclick = () => {
            fields.push({ key: `field_${fields.length + 1}`, label: `Field ${fields.length + 1}`, type: 'text' });
            renderFieldRows(fieldsHost);
        };

        modal.querySelector('#vp-set-form').onsubmit = async e => {
            e.preventDefault();
            const setId = slugId(idInput.value);
            if (!setId) return toast('Valid Set ID is required', 'error');
            const parsedSlots = parseInt(modal.querySelector('#vp-set-slots').value, 10);
            const payload = {
                name: nameInput.value.trim() || setId,
                slotsCount: Number.isFinite(parsedSlots) ? Math.max(0, parsedSlots) : 0,
                fields: fields.map(f => {
                    const base = { key: slugId(f.key) || 'field', label: f.label.trim() || f.key, type: f.type, ...(f.icon ? { icon: f.icon } : {}) };
                    if (f.type === 'ref') {
                        base.targetSet = String(f.targetSet || '').trim();
                    } else if (f.type === 'ref_list') {
                        base.targetSet = String(f.targetSet || '').trim();
                    } else if (f.type === 'checklist') {
                        base.targetSet = String(f.targetSet || '').trim();
                        base.maxTier = Math.max(1, parseInt(f.maxTier, 10) || 1);
                    } else if (f.type === 'counter' || f.type === 'number') {
                        if (f.min !== '' && f.min != null && Number.isFinite(Number(f.min))) base.min = Number(f.min);
                        if (f.max !== '' && f.max != null && Number.isFinite(Number(f.max))) base.max = Number(f.max);
                        if (f.step !== '' && f.step != null && Number.isFinite(Number(f.step)) && Number(f.step) > 0) base.step = Number(f.step);
                    }
                    return base;
                })
            };
            try {
                await api(`/api/variables/sets/${encodeURIComponent(setId)}`, 'PUT', payload);
                toast(`Set "${payload.name}" saved`, 'success');
                close();
                await reloadHandler();
            } catch (err) {
                toast(err.message, 'error');
            }
        };
    });
}

function openEntryModal(setObj, existingEntry = null) {
    const isEdit = Boolean(existingEntry);
    const fields = setObj.fields || [];
    const values = { ...(existingEntry?.values || {}) };
    const isEnabled = existingEntry ? existingEntry.enabled !== false : true;
    const useTwoCol = fields.length > 3;

    const defaultValForType = t => (t === 'color' ? '#3b82f6' : t === 'toggle' ? 'false' : (t === 'counter' || t === 'number') ? '0' : '');
    if (fields.some(f => f.type === 'icon')) window.IconPicker?.ensureFont?.();
    const fieldsHtml = fields.map(f => {
        const val = values[f.key] ?? defaultValForType(f.type);
        const head = `<span class="vp-label-head"><span>${esc(f.label)}</span><code>${esc(f.key)}</code></span>`;
        const spanCls = useTwoCol && (f.type === 'image' || f.type === 'list' || f.type === 'template' || f.type === 'checklist') ? 'vp-span-2' : '';
        if (f.type === 'image') {
            return `
                <label class="${spanCls}" data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <div class="vp-img-row">
                        ${val ? `<img src="${esc(val)}" alt="" class="var-img-thumb" data-entry-thumb="${esc(f.key)}">` : ''}
                        <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="https://... or /assets/...">
                        <button type="button" class="b sm" data-entry-pick="${esc(f.key)}">Asset Library</button>
                    </div>
                </label>
            `;
        }
        if (f.type === 'icon') {
            return `
                <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <div class="vp-img-row">
                        <span class="vp-icon-preview" data-entry-icon-preview="${esc(f.key)}" style="width:2rem;height:2rem;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:6px;background:var(--bg-inset);flex-shrink:0;">${val ? `<i class="${esc(val)}"></i>` : ''}</span>
                        <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="e.g. fa-solid fa-crown">
                        <button type="button" class="b sm" data-entry-pick-icon="${esc(f.key)}">Pick Icon</button>
                    </div>
                </label>
            `;
        }
        if (f.type === 'counter' || f.type === 'number') {
            const minAttr = f.min !== '' && f.min != null ? ` min="${esc(f.min)}"` : '';
            const maxAttr = f.max !== '' && f.max != null ? ` max="${esc(f.max)}"` : '';
            const stepVal = f.step !== '' && f.step != null && Number(f.step) > 0 ? Number(f.step) : 1;
            const capHint = f.max !== '' && f.max != null ? `<span class="muted" style="font-size:.82rem;white-space:nowrap;">/ ${esc(f.max)}</span>` : '';
            return `
                <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <div class="vp-img-row">
                        ${f.type === 'counter' ? `<button type="button" class="b sm" data-entry-step="${esc(f.key)}" data-step-delta="${-stepVal}" aria-label="Decrement ${esc(f.label)}">-${esc(stepVal)}</button>` : ''}
                        <input type="number"${minAttr}${maxAttr} step="any" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="0">
                        ${capHint}
                        ${f.type === 'counter' ? `<button type="button" class="b sm" data-entry-step="${esc(f.key)}" data-step-delta="${stepVal}" aria-label="Increment ${esc(f.label)}">+${esc(stepVal)}</button>` : ''}
                    </div>
                </label>
            `;
        }
        if (f.type === 'list') {
            return `
                <label class="${spanCls}" data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <textarea rows="3" data-entry-field="${esc(f.key)}" placeholder="One item per line">${esc(val)}</textarea>
                </label>
            `;
        }
        if (f.type === 'template') {
            return `
                <label class="${spanCls}" data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="e.g. @wins W - @losses L or {{var.other}}">
                </label>
            `;
        }
        if (f.type === 'font') {
            return `
                <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="e.g. Inter, sans-serif">
                </label>
            `;
        }
        if (f.type === 'color') {
            return `
                <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <div class="vp-img-row">
                        <input type="color" data-entry-color="${esc(f.key)}" value="${esc(/^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : '#3b82f6')}" style="width:2.5rem; flex-shrink:0; padding:0; height:2rem;">
                        <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="#3b82f6">
                    </div>
                </label>
            `;
        }
        if (f.type === 'toggle') {
            return `
                <label class="vp-check" data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}" style="align-self:end; padding:.35rem 0;">
                    <input type="checkbox" data-entry-toggle="${esc(f.key)}" ${val === 'true' ? 'checked' : ''}>
                    <span>${esc(f.label)} <code style="font-size:.72rem; color:var(--text-muted);">(${esc(f.key)})</code></span>
                </label>
            `;
        }
        if (f.type === 'date' || f.type === 'time' || f.type === 'datetime') {
            const inputType = f.type === 'datetime' ? 'datetime-local' : f.type;
            return `
                <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <input type="${inputType}" data-entry-field="${esc(f.key)}" value="${esc(val)}">
                </label>
            `;
        }
        if (f.type === 'duration') {
            return `
                <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="e.g. 45m or 1:30:00">
                </label>
            `;
        }
        if (f.type === 'ref_list') {
            return `<div class="${spanCls}" data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">${head}${linkControl(f, values[f.key], state.variableSets || [], `data-entry-field="${esc(f.key)}"`)}</div>`;
        }
        if (f.type === 'ref') {
            return `<label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">${head}${linkControl(f, val, state.variableSets || [], `data-entry-field="${esc(f.key)}"`)}</label>`;
        }
        if (f.type === 'checklist') {
            const targetSet = (state.variableSets || []).find(s => s.id === f.targetSet);
            const map = parseChecklistMap(values[f.key]);
            const items = targetSet?.roster || [];
            const itemsHtml = items.length
                ? items.map(item => {
                    const maxTier = window.OverlayShared.trackerMax(f, item);
                    const lvl = Math.max(0, Math.min(maxTier, Number(map[item.id]) || 0));
                    return `<label data-tracker-item><span>${esc(item.label)}</span><select data-entry-check-item="${esc(item.id)}" data-entry-check-field="${esc(f.key)}" aria-label="${esc(item.label)} level">${Array.from({ length: maxTier + 1 }, (_, level) => `<option value="${level}"${lvl === level ? ' selected' : ''}>${esc(level === 0 ? '0 - Not started' : item.tiers?.find(tier => tier.level === level)?.label || (maxTier === 1 ? '1 - Active' : `Level ${level}`))}</option>`).join('')}</select></label>`;
                }).join('')
                : `<span class="muted" style="font-size:.8rem;">${targetSet ? 'Target set has no items yet.' : `Target set "${esc(f.targetSet || '')}" not found.`}</span>`;
            return `
                <div class="${spanCls}" data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                    ${head}
                    <input type="hidden" data-entry-field="${esc(f.key)}" value="${esc(JSON.stringify(map))}">
                    <details class="variable-link-picker"><summary>${Object.keys(map).length} tracked · Edit levels</summary><input type="search" data-tracker-search aria-label="Search ${esc(f.label)} items" placeholder="Search items..."><div class="vp-tracker-items">${itemsHtml}</div></details>
                </div>
            `;
        }
        return `
            <label data-entry-wrap="${esc(`${f.label} ${f.key}`.toLowerCase())}">
                ${head}
                <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="${esc(f.label)}">
            </label>
        `;
    }).join('');

    showModal(isEdit ? `Edit Entry: ${existingEntry.label}` : `Add Entry to ${setObj.name}`, `
        <form id="vp-entry-form" class="vp-form">
            <div class="vp-entry-bar">
                <label class="vp-check" style="margin:0;">
                    <input type="checkbox" id="vp-entry-enabled" ${isEnabled ? 'checked' : ''}>
                    <span>Enabled in rotation</span>
                </label>
                ${fields.length > 6 ? '<input type="search" id="vp-entry-filter" placeholder="Filter fields..." style="width:12rem;">' : ''}
            </div>
            <div class="vp-entry-grid ${useTwoCol ? '' : 'single-col'}">
                ${fieldsHtml}
            </div>
            <details id="vp-entry-tiers-wrap" style="margin-top:.75rem;border:1px solid var(--border);border-radius:8px;padding:.5rem .7rem;" ${(existingEntry?.tiers?.length) ? 'open' : ''}>
                <summary style="cursor:pointer;font-size:.8rem;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
                    <span>Item upgrade levels (optional)</span>
                    <button type="button" class="b sm" id="vp-add-tier">${SVG_PLUS} Add Level</button>
                </summary>
                <p class="muted">Define levels here once if this entry is used as a tracked item. Each person keeps their own current level; 0 means not owned / not completed.</p>
                <div id="vp-entry-tiers-list" style="display:grid;gap:.45rem;margin-top:.55rem;"></div>
            </details>
        </form>
    `, `
        <button type="button" class="b" data-vp-close>Cancel</button>
        <button type="submit" form="vp-entry-form" class="b primary">${isEdit ? 'Save Entry' : 'Add Entry'}</button>
    `, (modal, close) => {
        bindLinkControls(modal);
        const filterInput = modal.querySelector('#vp-entry-filter');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                const q = filterInput.value.trim().toLowerCase();
                modal.querySelectorAll('[data-entry-wrap]').forEach(el => {
                    el.hidden = !!q && !el.dataset.entryWrap.includes(q);
                });
            });
        }
        modal.querySelectorAll('[data-entry-pick]').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.entryPick;
                const input = modal.querySelector(`[data-entry-field="${CSS.escape(key)}"]`);
                pickImage(input.value, url => { input.value = url || ''; });
            };
        });
        modal.querySelectorAll('[data-entry-pick-icon]').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.entryPickIcon;
                const input = modal.querySelector(`[data-entry-field="${CSS.escape(key)}"]`);
                const preview = modal.querySelector(`[data-entry-icon-preview="${CSS.escape(key)}"]`);
                window.IconPicker?.open?.({
                    value: input?.value || '',
                    onPick: cls => {
                        if (input) input.value = cls || '';
                        if (preview) preview.innerHTML = cls ? `<i class="${esc(cls)}"></i>` : '';
                    }
                });
            };
        });
        modal.querySelectorAll('[data-entry-step]').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.entryStep;
                const delta = Number(btn.dataset.stepDelta) || 0;
                const input = modal.querySelector(`[data-entry-field="${CSS.escape(key)}"]`);
                if (input) {
                    let next = (Number(input.value) || 0) + delta;
                    if (input.min !== '' && Number.isFinite(Number(input.min))) next = Math.max(Number(input.min), next);
                    if (input.max !== '' && Number.isFinite(Number(input.max))) next = Math.min(Number(input.max), next);
                    input.value = String(next);
                }
            };
        });
        modal.querySelectorAll('[data-entry-color]').forEach(picker => {
            picker.addEventListener('input', () => {
                const text = modal.querySelector(`[data-entry-field="${CSS.escape(picker.dataset.entryColor)}"]`);
                if (text) text.value = picker.value;
            });
        });
        modal.addEventListener('input', event => {
            if (!event.target.matches('[data-tracker-search]')) return;
            const query = event.target.value.trim().toLowerCase();
            event.target.closest('details').querySelectorAll('[data-tracker-item]').forEach(item => {
                item.hidden = !item.querySelector('span').textContent.toLowerCase().includes(query);
            });
        });
        modal.querySelectorAll('[data-entry-check-item]').forEach(select => select.addEventListener('change', () => {
            const key = select.dataset.entryCheckField;
            const targetId = select.dataset.entryCheckItem;
            const input = modal.querySelector(`[data-entry-field="${CSS.escape(key)}"]`);
            if (!input) return;
            const map = parseChecklistMap(input.value);
            const next = Number(select.value);
            if (next > 0) map[targetId] = next;
            else delete map[targetId];
            input.value = JSON.stringify(map);
            select.closest('details').querySelector('summary').textContent = `${Object.keys(map).length} tracked · Edit levels`;
        }));
        const tiersState = (existingEntry?.tiers || []).map((t, i) => ({
            level: t.level || (i + 1),
            label: t.label || '',
            image: t.image || '',
            description: t.description || '',
            color: t.color || '',
            icon: t.icon || ''
        }));
        const tiersHost = modal.querySelector('#vp-entry-tiers-list');
        const renderTiers = () => {
            if (!tiersHost) return;
            modal.querySelector('#vp-add-tier').disabled = tiersState.length >= 20;
            tiersHost.innerHTML = tiersState.length ? tiersState.map((t, idx) => `
                <div data-tier-idx="${idx}" class="vp-tier-row">
                    <span class="badge" style="justify-self:start;">Lv.${idx + 1}</span>
                    <input type="text" data-tier-prop="label" value="${esc(t.label)}" placeholder="Level name">
                    <div class="vp-img-row">
                        <input type="text" data-tier-prop="image" value="${esc(t.image)}" placeholder="Image URL">
                        <button type="button" class="b sm" data-tier-pick="${idx}">Assets</button>
                    </div>
                    <input type="text" data-tier-prop="description" value="${esc(t.description)}" placeholder="Description">
                    <button type="button" class="b sm danger" data-tier-remove="${idx}">${SVG_TRASH}</button>
                </div>`).join('') : '<span class="muted" style="font-size:.78rem;">No custom levels yet. Click + Add Level to override name, image, or description per tier.</span>';
        };
        renderTiers();
        modal.querySelector('#vp-add-tier')?.addEventListener('click', e => {
            e.preventDefault();
            const details = modal.querySelector('#vp-entry-tiers-wrap');
            if (details) details.open = true;
            tiersState.push({ level: tiersState.length + 1, label: '', image: '', description: '' });
            renderTiers();
        });
        tiersHost?.addEventListener('input', e => {
            const row = e.target.closest('[data-tier-idx]');
            if (!row) return;
            const idx = Number(row.dataset.tierIdx);
            const prop = e.target.dataset.tierProp;
            if (tiersState[idx] && prop) tiersState[idx][prop] = e.target.value;
        });
        tiersHost?.addEventListener('click', e => {
            const pick = e.target.closest('[data-tier-pick]');
            if (pick) {
                const idx = Number(pick.dataset.tierPick);
                pickImage(tiersState[idx]?.image || '', url => {
                    if (!tiersState[idx]) return;
                    tiersState[idx].image = url || '';
                    renderTiers();
                });
                return;
            }
            const rem = e.target.closest('[data-tier-remove]');
            if (rem) {
                tiersState.splice(Number(rem.dataset.tierRemove), 1);
                renderTiers();
            }
        });
        modal.querySelector('#vp-entry-form').onsubmit = async e => {
            e.preventDefault();
            const nextValues = {};
            for (const f of fields) {
                if (f.type === 'toggle') {
                    nextValues[f.key] = modal.querySelector(`[data-entry-toggle="${CSS.escape(f.key)}"]`).checked ? 'true' : 'false';
                } else if (f.type === 'checklist') {
                    nextValues[f.key] = parseChecklistMap(modal.querySelector(`[data-entry-field="${CSS.escape(f.key)}"]`).value);
                } else if (f.type === 'ref_list') {
                    try { nextValues[f.key] = JSON.parse(modal.querySelector(`[data-entry-field="${CSS.escape(f.key)}"]`).value || '[]'); } catch { nextValues[f.key] = []; }
                } else {
                    nextValues[f.key] = modal.querySelector(`[data-entry-field="${CSS.escape(f.key)}"]`).value;
                }
            }
            const nextTiers = tiersState
                .filter(t => t.label || t.image || t.description || t.color || t.icon)
                .map((t, idx) => ({ ...t, level: idx + 1, label: t.label.trim(), image: t.image.trim(), description: t.description.trim() }));
            const nextEnabled = modal.querySelector('#vp-entry-enabled')?.checked !== false;
            const firstKey = fields[0]?.key || 'name';
            const label = String(nextValues[firstKey] || existingEntry?.label || `Entry ${(setObj.roster?.length || 0) + 1}`).trim();
            const patch = { label, enabled: nextEnabled, values: nextValues, tiers: nextTiers };
            try {
                await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}/entry/${isEdit ? 'update' : 'add'}`, 'PATCH',
                    isEdit ? { entry: existingEntry.id, expected: existingEntry, patch }
                        : { entry: { id: slugId(label) || `entry_${Date.now()}`, ...patch } });
                toast(isEdit ? 'Entry updated' : 'Entry added', 'success');
                close();
                await reloadHandler();
            } catch (err) {
                toast(err.message, 'error');
            }
        };
    });
}

export function bindSetEvents(onReload) {
    reloadHandler = onReload;
    const host = document.getElementById('sets-list');
    if (!host) return;

    document.getElementById('set-add-btn')?.addEventListener('click', () => openSetModal());

    host.addEventListener('input', e => {
        if (e.target.id === 'set-dir-search') {
            directoryFilter = e.target.value;
            localStorage.setItem('variables_directory_filter', directoryFilter);
            renderSets();
            return;
        }
        if (e.target.id === 'set-roster-filter') {
            rosterFilter = e.target.value;
            localStorage.setItem('variables_roster_filter', rosterFilter);
            renderSets();
        }
    });

    host.addEventListener('toggle', e => {
        const det = e.target.closest('.slot-tokens[data-token-key]');
        if (det) {
            if (det.open) openTokenKeys.add(det.dataset.tokenKey);
            else openTokenKeys.delete(det.dataset.tokenKey);
            return;
        }
        const grpDet = e.target.closest('[data-group-details]');
        if (grpDet) {
            const key = `${grpDet.dataset.groupDetails}:group`;
            if (grpDet.open) openTokenKeys.add(key);
            else openTokenKeys.delete(key);
        }
    }, true);

    host.addEventListener('change', async e => {
        const slotNameInput = e.target.closest('[data-slot-name]');
        const card = e.target.closest('[data-set-card]');
        if (slotNameInput && card) {
            const setObj = (state.variableSets || []).find(s => s.id === card.dataset.setCard);
            if (!setObj) return;
            const slotIdx = Number(slotNameInput.dataset.slotName) - 1;
            const slotNames = Array.from({ length: setObj.slotsCount || 0 }, (_, i) => String(setObj.slotNames?.[i] ?? ''));
            slotNames[slotIdx] = slotNameInput.value.trim();
            try {
                await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}`, 'PUT', { slotNames });
                toast('Slot name saved', 'success');
                await reloadHandler();
            } catch (err) {
                toast(err.message, 'error');
            }
            return;
        }
        const rotField = e.target.closest('[data-rot-field]');
        if (rotField && card) {
            try {
                await api(`/api/variables/sets/${encodeURIComponent(card.dataset.setCard)}/rotation`, 'POST', { [rotField.dataset.rotField]: rotField.value });
                await reloadHandler();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const grpField = e.target.closest('[data-group-field]');
        if (grpField && card) {
            try {
                await api(`/api/variables/sets/${encodeURIComponent(card.dataset.setCard)}/group`, 'POST', { [grpField.dataset.groupField]: grpField.value });
                await reloadHandler();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const csvInput = e.target.closest('[data-set-csv-import]');
        if (csvInput && card) {
            const file = csvInput.files?.[0];
            csvInput.value = '';
            if (!file) return;
            try {
                const csvText = await file.text();
                const res = await fetch(`/api/variables/sets/${encodeURIComponent(card.dataset.setCard)}/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
                    body: csvText
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || res.statusText);
                toast(`Imported ${data.imported} roster ${data.imported === 1 ? 'entry' : 'entries'}`, 'success');
                await reloadHandler();
            } catch (err) {
                toast('CSV import failed: ' + err.message, 'error');
            }
            return;
        }
        const qSel = e.target.closest('[data-set-queue-select]');
        if (qSel && card && qSel.value) {
            const base = `/api/variables/sets/${encodeURIComponent(card.dataset.setCard)}`;
            try {
                await api(`${base}/queue/add?slot=${encodeURIComponent(qSel.value)}&entry=${encodeURIComponent(qSel.dataset.setQueueSelect)}`, 'POST', {});
                await reloadHandler();
            } catch (err) {
                toast(err.message, 'error');
            }
            return;
        }
        const sel = e.target.closest('[data-set-assign-select]');
        if (!sel || !card || !sel.value) return;
        const base = `/api/variables/sets/${encodeURIComponent(card.dataset.setCard)}`;
        try {
            await api(`${base}/assign?slot=${encodeURIComponent(sel.value)}&entry=${encodeURIComponent(sel.dataset.setAssignSelect)}`, 'POST', {});
            await reloadHandler();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    host.addEventListener('click', async e => {
        const modeBtn = e.target.closest('[data-dir-mode]');
        if (modeBtn) {
            directoryMode = modeBtn.dataset.dirMode;
            localStorage.setItem('variables_dir_mode', directoryMode);
            renderSets();
            return;
        }
        const dirRotBtn = e.target.closest('[data-dir-rot-toggle]');
        if (dirRotBtn) {
            const setId = dirRotBtn.dataset.dirRotToggle;
            const setObj = (state.variableSets || []).find(s => s.id === setId);
            if (!setObj || !supportsRotation(setObj)) return;
            dirRotBtn.disabled = true;
            try {
                await api(`/api/variables/sets/${encodeURIComponent(setId)}/rotation/${setObj.rotation?.enabled ? 'stop' : 'start'}`, 'POST', {});
                await reloadHandler();
            } catch (err) {
                toast(err.message, 'error');
                dirRotBtn.disabled = false;
            }
            return;
        }
        const pill = e.target.closest('[data-select-set]');
        if (pill) {
            localStorage.setItem('variables_active_set', pill.dataset.selectSet);
            renderSets();
            return;
        }
        if (e.target.closest('#set-new-empty')) return openSetModal();

        const sepChip = e.target.closest('[data-group-sep-chip]');
        const sepCard = e.target.closest('[data-set-card]');
        if (sepChip && sepCard) {
            try {
                await api(`/api/variables/sets/${encodeURIComponent(sepCard.dataset.setCard)}/group`, 'POST', { separator: sepChip.dataset.groupSepChip });
                await reloadHandler();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const btn = e.target.closest('[data-set-act]');
        const card = e.target.closest('[data-set-card]');
        if (!btn || !card) return;
        const setObj = (state.variableSets || []).find(s => s.id === card.dataset.setCard);
        if (!setObj) return;
        const act = btn.dataset.setAct;
        const base = `/api/variables/sets/${encodeURIComponent(setObj.id)}`;

        try {
            if (act === 'pick-assign') return openSlotEntryPicker(btn, setObj, Number(btn.dataset.slot), 'assign');
            if (act === 'pick-queue') return openSlotEntryPicker(btn, setObj, Number(btn.dataset.slot), 'queue');
            if (act === 'edit-set') return openSetModal(setObj);
            if (act === 'inc-slot') {
                await api(base, 'PUT', { slotsCount: Math.min(24, (setObj.slotsCount || 0) + 1) });
                return await reloadHandler();
            }
            if (act === 'dec-slot') {
                await api(base, 'PUT', { slotsCount: Math.max(0, (setObj.slotsCount || 0) - 1) });
                return await reloadHandler();
            }
            if (act === 'add-entry') return openEntryModal(setObj);
            if (act === 'edit-entry') {
                const entry = (setObj.roster || []).find(r => r.id === btn.dataset.entry);
                if (entry) openEntryModal(setObj, entry);
                return;
            }
            if (act === 'toggle-entry') {
                await api(`${base}/entry/toggle?entry=${encodeURIComponent(btn.dataset.entry)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'toggle-group-entry') {
                await api(`${base}/entry/group-toggle?entry=${encodeURIComponent(btn.dataset.entry)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'delete-entry') {
                const result = await api(`${base}/dependencies?entry=${encodeURIComponent(btn.dataset.entry)}`);
                if (result.dependencies.length) throw new Error(`Remove references first: ${result.dependencies.map(use => use.label).join('; ')}`);
                const entry = setObj.roster.find(item => item.id === btn.dataset.entry);
                if (!confirm(`Remove "${entry?.label || btn.dataset.entry}"?`)) return;
                await api(`${base}/entry/remove`, 'PATCH', { entry: btn.dataset.entry, expected: entry });
                toast('Entry removed', 'info');
                return await reloadHandler();
            }
            if (act === 'delete-set') {
                const result = await api(`${base}/dependencies`);
                if (result.dependencies.length) throw new Error(`Remove references first: ${result.dependencies.map(use => use.label).join('; ')}`);
                const ok = window.StreamPulse?.confirm
                    ? await StreamPulse.confirm('Delete Variable Set', `Delete set "${setObj.name}" and all of its output variables?`, { danger: true, confirmText: 'Delete' })
                    : confirm(`Delete set "${setObj.name}"?`);
                if (!ok) return;
                await api(base, 'DELETE');
                toast(`Set "${setObj.name}" deleted`, 'info');
                return await reloadHandler();
            }
            if (act === 'q-add') {
                await api(`${base}/queue/add?slot=${encodeURIComponent(btn.dataset.slot)}&entry=${encodeURIComponent(btn.dataset.entry)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'q-remove') {
                await api(`${base}/queue/remove?slot=${encodeURIComponent(btn.dataset.slot)}&index=${encodeURIComponent(btn.dataset.qIdx)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'q-clear') {
                await api(`${base}/queue/clear?slot=${encodeURIComponent(btn.dataset.slot)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'assign') {
                await api(`${base}/assign?slot=${encodeURIComponent(btn.dataset.slot)}&entry=${encodeURIComponent(btn.dataset.entry)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'clear' || act === 'next' || act === 'prev') {
                await api(`${base}/${act}?slot=${encodeURIComponent(btn.dataset.slot)}`, 'POST', {});
                return await reloadHandler();
            }
            if (act.startsWith('rotation/')) {
                await api(`${base}/${act}`, 'POST', {});
                return await reloadHandler();
            }
            if (act === 'advance' || act === 'rewind') {
                await api(`${base}/${act}`, 'POST', {});
                return await reloadHandler();
            }
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // HTML5 Drag-and-Drop: Roster -> Slot (assign), Slot -> Slot (swap)
    host.addEventListener('dragstart', e => {
        const rosterEl = e.target.closest('.roster-item[data-entry]');
        if (rosterEl) {
            dragPayload = { kind: 'roster', setId: rosterEl.dataset.set, entryId: rosterEl.dataset.entry };
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('text/plain', rosterEl.dataset.entry);
            return;
        }
        const slotEl = e.target.closest('.slot-card.filled[data-slot]');
        if (slotEl) {
            dragPayload = { kind: 'slot', setId: slotEl.dataset.set, slot: slotEl.dataset.slot };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', slotEl.dataset.slot);
        }
    });

    host.addEventListener('dragover', e => {
        const queueEl = e.target.closest('.slot-queue[data-slot-queue]');
        if (queueEl && dragPayload?.kind === 'roster' && dragPayload.setId === queueEl.dataset.set) {
            e.preventDefault();
            e.stopPropagation();
            queueEl.closest('.slot-card')?.classList.remove('drag-over');
            queueEl.classList.add('drag-over');
            return;
        }
        const slotEl = e.target.closest('.slot-card[data-slot]');
        if (!slotEl || !dragPayload || dragPayload.setId !== slotEl.dataset.set) return;
        e.preventDefault();
        slotEl.querySelectorAll('.slot-queue.drag-over').forEach(q => q.classList.remove('drag-over'));
        slotEl.classList.add('drag-over');
    });

    host.addEventListener('dragleave', e => {
        const queueEl = e.target.closest('.slot-queue[data-slot-queue]');
        if (queueEl && !queueEl.contains(e.relatedTarget)) queueEl.classList.remove('drag-over');
        const slotEl = e.target.closest('.slot-card[data-slot]');
        if (slotEl && !slotEl.contains(e.relatedTarget)) slotEl.classList.remove('drag-over');
    });

    host.addEventListener('drop', async e => {
        const queueEl = e.target.closest('.slot-queue[data-slot-queue]');
        if (queueEl && dragPayload?.kind === 'roster' && dragPayload.setId === queueEl.dataset.set) {
            e.preventDefault();
            e.stopPropagation();
            queueEl.classList.remove('drag-over');
            const payload = dragPayload;
            dragPayload = null;
            try {
                await api(`/api/variables/sets/${encodeURIComponent(queueEl.dataset.set)}/queue/add?slot=${encodeURIComponent(queueEl.dataset.slotQueue)}&entry=${encodeURIComponent(payload.entryId)}`, 'POST', {});
                await reloadHandler();
            } catch (err) {
                toast(err.message, 'error');
            }
            return;
        }
        const slotEl = e.target.closest('.slot-card[data-slot]');
        if (!slotEl || !dragPayload || dragPayload.setId !== slotEl.dataset.set) return;
        e.preventDefault();
        slotEl.classList.remove('drag-over');
        const payload = dragPayload;
        dragPayload = null;
        const base = `/api/variables/sets/${encodeURIComponent(slotEl.dataset.set)}`;
        try {
            if (payload.kind === 'roster') {
                await api(`${base}/assign?slot=${encodeURIComponent(slotEl.dataset.slot)}&entry=${encodeURIComponent(payload.entryId)}`, 'POST', {});
            } else if (payload.kind === 'slot' && payload.slot !== slotEl.dataset.slot) {
                await api(`${base}/swap?from=${encodeURIComponent(payload.slot)}&to=${encodeURIComponent(slotEl.dataset.slot)}`, 'POST', {});
            }
            await reloadHandler();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    host.addEventListener('dragend', () => {
        dragPayload = null;
        host.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
}
