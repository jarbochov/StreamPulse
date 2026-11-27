'use strict';

import { esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { getCardType, registerOperatorModule } from './operator-registry.js';
import { fetchDisplaysCatalog } from './operator-live-cards.js';
import {
    getCollapsedPanelIds,
    getCurrentProfile,
    getCurrentProfileId,
    getFocusedPanelId,
    isFocusPanelMode,
    isLayoutLocked,
    operatorState,
    saveCollapsedPanelIds,
    saveFocusedPanelId,
    saveProfileToServer
} from './operator-state.js';

const KIND_TO_CARD = {
    bingo: 'bingo-display',
    counter: 'counter-display',
    meter: 'meter-display',
    ticker: 'ticker-display'
};

const KIND_LABELS = {
    all: 'All',
    bingo: 'Bingo',
    counter: 'Counters',
    meter: 'Meters',
    ticker: 'Tickers',
    inventory: 'Inventory',
    table: 'Tables',
    badges: 'Badges'
};

const MODE_PREF_PREFIX = 'streampulse_op_disp_mode_';
const COLS_PREF_PREFIX = 'streampulse_op_disp_cols_';

function getDisplayCols(profileId) {
    try {
        const n = Number(localStorage.getItem(`${COLS_PREF_PREFIX}${profileId || 'default'}`));
        if ([1, 2, 3, 4].includes(n)) return n;
    } catch { /* ignore */ }
    return 2;
}

function setDisplayCols(profileId, cols) {
    const clean = [1, 2, 3, 4].includes(Number(cols)) ? Number(cols) : 2;
    try { localStorage.setItem(`${COLS_PREF_PREFIX}${profileId || 'default'}`, String(clean)); } catch { /* ignore */ }
    return clean;
}

function buildDisplayUrl(id, { dock = false, bare = false } = {}) {
    const url = new URL('/operator.html', location.origin);
    const profId = getCurrentProfileId();
    if (profId) url.searchParams.set(dock ? 'profile' : 'preset', profId);
    if (dock) url.searchParams.set('dock', '1');
    if (bare) url.searchParams.set('bare', '1');
    url.hash = `display=${encodeURIComponent(id)}`;
    return url.toString();
}

async function copyUrl(url, label) {
    try {
        await navigator.clipboard.writeText(url);
        toast(`Copied ${label}`, 'success');
    } catch {
        toast(url, 'info');
    }
}

export function getFocusedDisplayIdFromHash() {
    const raw = (location.hash || '').replace(/^#/, '').trim();
    if (!raw) return '';
    if (raw.startsWith('display=')) return decodeURIComponent(raw.slice('display='.length)).trim();
    const match = raw.match(/(?:^|&)display=([^&]+)/i);
    return match ? decodeURIComponent(match[1]).trim() : '';
}

function getDisplayViewMode(display) {
    if (!KIND_TO_CARD[display?.kind]) return 'monitor';
    try {
        return localStorage.getItem(`${MODE_PREF_PREFIX}${display.id}`) === 'monitor' ? 'monitor' : 'controls';
    } catch {
        return 'controls';
    }
}

function setDisplayViewMode(displayId, mode) {
    try { localStorage.setItem(`${MODE_PREF_PREFIX}${displayId}`, mode); } catch { /* ignore */ }
}

function resolveDisplayCollapsedSet(profile, addedIds) {
    const scopeKey = `displays_${profile?.id || 'default'}`;
    const manualCollapsed = getCollapsedPanelIds(scopeKey);
    if (!isFocusPanelMode()) {
        return { scopeKey, collapsed: manualCollapsed };
    }
    const savedFocused = getFocusedPanelId(scopeKey);
    let activeId = savedFocused;
    if (savedFocused !== '__none__' && !addedIds.includes(savedFocused)) {
        activeId = addedIds.find(id => !manualCollapsed.has(id)) || addedIds[0] || '';
        if (activeId) saveFocusedPanelId(scopeKey, activeId);
    }
    const focusCollapsed = new Set(addedIds.filter(id => id !== activeId));
    return { scopeKey, collapsed: focusCollapsed };
}

async function openAddDisplayPicker(displaysCatalog, onToggleDisplay) {
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    if (!modal || !titleEl || !bodyEl || !footEl) return;

    titleEl.textContent = 'Manage Added Displays';
    let query = '';
    let kindFilter = 'all';

    const drawList = () => {
        const listEl = bodyEl.querySelector('[data-disp-picker-list]');
        if (!listEl) return;
        const added = new Set(getCurrentProfile()?.displays || []);
        const term = query.trim().toLowerCase();
        const filtered = displaysCatalog.filter(d => {
            if (kindFilter !== 'all' && (d.kind || 'inventory') !== kindFilter) return false;
            return !term || `${d.name} ${d.id} ${d.kind || ''}`.toLowerCase().includes(term);
        });
        listEl.innerHTML = filtered.length ? filtered.map(d => {
            const isAdded = added.has(d.id);
            const hasInteractive = Boolean(KIND_TO_CARD[d.kind]);
            return `
            <div class="op-picker-row">
                <div class="op-picker-row-info">
                    <strong>${esc(d.name || d.id)} ${isAdded ? '<span class="op-pill is-ok" style="margin-left:.3rem;">Added</span>' : ''}</strong>
                    <span>ID: ${esc(d.id)} · ${esc(d.kind || 'inventory')}${hasInteractive ? ' · Interactive controls + Monitor' : ' · Live Mini-Monitor'}</span>
                </div>
                <button type="button" class="op-btn sm ${isAdded ? 'danger' : 'primary'}" data-pick-display="${esc(d.id)}">
                    ${isAdded ? 'Remove' : 'Add'}
                </button>
            </div>`;
        }).join('') : '<div style="font-size:.82rem;color:var(--text-muted);">No matching displays found. Create one in <a href="/variable-displays.html">Display Library</a>.</div>';
    };

    const presentKinds = new Set(displaysCatalog.map(d => d.kind || 'inventory'));
    const filterButtons = Object.entries(KIND_LABELS)
        .filter(([k]) => k === 'all' || presentKinds.has(k))
        .map(([k, lbl]) => `<button type="button" class="op-filter-btn${k === kindFilter ? ' active' : ''}" data-pick-kind="${esc(k)}">${esc(lbl)}</button>`)
        .join('');

    bodyEl.innerHTML = `
        <div class="op-field">
            <label for="op-disp-pick-search">Search Display Library</label>
            <input type="search" id="op-disp-pick-search" placeholder="Type display name, id, or kind…">
        </div>
        <div class="op-filter-seg" style="margin-bottom:.55rem;" role="group" aria-label="Filter display kind">${filterButtons}</div>
        <div class="op-picker-list" data-disp-picker-list="1"></div>`;
    footEl.innerHTML = '<button type="button" class="op-btn sm primary" data-modal-close="1">Done</button>';
    drawList();

    const searchInput = document.getElementById('op-disp-pick-search');
    const cleanup = () => {
        bodyEl.removeEventListener('click', onPick);
        searchInput?.removeEventListener('input', onSearch);
        modal.hidden = true;
    };
    const onSearch = e => {
        query = e.target.value;
        drawList();
    };
    const onPick = async e => {
        const kBtn = e.target.closest('[data-pick-kind]');
        if (kBtn) {
            kindFilter = kBtn.dataset.pickKind;
            bodyEl.querySelectorAll('[data-pick-kind]').forEach(b => b.classList.toggle('active', b === kBtn));
            drawList();
            return;
        }
        const btn = e.target.closest('[data-pick-display]');
        if (!btn) return;
        await onToggleDisplay(btn.dataset.pickDisplay);
        drawList();
    };
    searchInput?.addEventListener('input', onSearch);
    bodyEl.addEventListener('click', onPick);
    footEl.querySelector('[data-modal-close]')?.addEventListener('click', cleanup, { once: true });
    modal.hidden = false;
    searchInput?.focus();
}

(() => {
    let displaysCatalog = [];
    let mountedEntries = [];
    let hostContainer = null;
    let hostCtx = null;
    let onContainerClick = null;

    const cleanupMounted = () => {
        for (const entry of mountedEntries) {
            try { entry.def?.unmount?.(entry.body); } catch { /* ignore */ }
        }
        mountedEntries = [];
    };

    const mountDisplayPanelBody = (body, display, mode) => {
        const cardType = mode === 'monitor' || !KIND_TO_CARD[display.kind]
            ? 'live-monitor'
            : KIND_TO_CARD[display.kind];
        const def = getCardType(cardType);
        if (!def) {
            body.innerHTML = '<div style="font-size:.8rem;color:var(--text-muted);">No operator widget available for this display type.</div>';
            return;
        }
        const card = {
            id: `domain-disp-${cardType}-${display.id}`,
            type: cardType,
            title: display.name,
            config: { displayId: display.id }
        };
        mountedEntries.push({ def, body, card });
        Promise.resolve(def.mount(body, card, hostCtx)).catch(() => {});
    };

    const renderDisplaysDomain = async ({ forceFetch = false } = {}) => {
        if (!hostContainer) return;
        cleanupMounted();
        try {
            const res = await fetchDisplaysCatalog(forceFetch);
            displaysCatalog = Array.isArray(res?.displays) ? res.displays : [];
        } catch (err) {
            hostContainer.innerHTML = `<div class="op-panel" style="padding:1rem;color:#f87171;font-size:.82rem;">${esc(err.message)}</div>`;
            return;
        }

        const byId = new Map(displaysCatalog.map(d => [d.id, d]));
        const focusedId = getFocusedDisplayIdFromHash();
        const layoutLocked = isLayoutLocked();

        // Focused Direct Link View (#display=<id>)
        if (focusedId) {
            const display = byId.get(focusedId);
            const hasInteractive = Boolean(display && KIND_TO_CARD[display.kind]);
            const mode = display ? getDisplayViewMode(display) : 'monitor';
            hostContainer.innerHTML = `
                <div class="op-domain-stack">
                    <section class="op-toolbar" aria-label="Focused display">
                        <div class="op-toolbar-left" style="flex-wrap:wrap;gap:.4rem;">
                            ${operatorState.bareMode ? '' : '<button type="button" class="op-btn sm" data-disp-show-all="1">&larr; All Displays</button>'}
                            <span style="display:inline-flex;align-items:center;gap:.4rem;font-weight:700;font-size:.9rem;">${OP_ICONS.displays} ${esc(display?.name || focusedId)}</span>
                            ${display ? `<span class="op-pill">${esc(display.kind || 'inventory')}</span>` : ''}
                        </div>
                        <div class="op-toolbar-right" style="flex-wrap:wrap;">
                            ${hasInteractive ? `<div class="op-filter-seg" role="group" aria-label="Display mode">
                                <button type="button" class="op-filter-btn${mode === 'controls' ? ' active' : ''}" data-disp-mode="controls" data-disp-id="${esc(focusedId)}">Controls</button>
                                <button type="button" class="op-filter-btn${mode === 'monitor' ? ' active' : ''}" data-disp-mode="monitor" data-disp-id="${esc(focusedId)}">Monitor</button>
                            </div>` : ''}
                            <button type="button" class="op-btn sm" data-disp-copy-link="${esc(focusedId)}">Copy Link</button>
                            <button type="button" class="op-btn sm" data-disp-copy-dock="${esc(focusedId)}">Copy Dock Link</button>
                            <a class="op-btn sm" href="/variable-displays.html">Display Library</a>
                        </div>
                    </section>
                    <section class="op-panel" style="max-width:860px;">
                        <div class="op-panel-body" data-disp-focused-body="1"></div>
                    </section>
                </div>`;
            const body = hostContainer.querySelector('[data-disp-focused-body]');
            if (body) {
                if (!display) {
                    body.innerHTML = `<div style="font-size:.84rem;color:var(--text-muted);">Display <code>${esc(focusedId)}</code> was not found in Display Library.</div>`;
                } else {
                    mountDisplayPanelBody(body, display, mode);
                }
            }
            return;
        }

        const profile = getCurrentProfile();
        const addedIds = Array.isArray(profile?.displays) ? profile.displays : [];
        const { collapsed } = resolveDisplayCollapsedSet(profile, addedIds);
        const cols = getDisplayCols(profile?.id);

        hostContainer.innerHTML = `
            <div class="op-domain-stack">
                <div class="op-toolbar">
                    <div class="op-toolbar-left" style="flex-wrap:wrap;gap:.45rem;">
                        <span class="op-pill">${addedIds.length} added display${addedIds.length === 1 ? '' : 's'}</span>
                        <span style="font-size:.76rem;color:var(--text-muted);">Preset: ${esc(profile?.name || 'Main Show')}</span>
                        ${addedIds.length ? `<div class="op-filter-seg" role="group" aria-label="Display grid columns">
                            ${[1, 2, 3, 4].map(n => `<button type="button" class="op-filter-btn${cols === n ? ' active' : ''}" data-disp-cols="${n}" title="${n} column${n === 1 ? '' : 's'}">${n} Col</button>`).join('')}
                        </div>` : ''}
                    </div>
                    <div class="op-toolbar-right">
                        <a class="op-btn sm" href="/variable-displays.html">Display Library</a>
                        ${layoutLocked ? '' : `<button type="button" class="op-btn sm primary" data-disp-open-picker="1">${OP_ICONS.plus} Add Display</button>`}
                    </div>
                </div>
                ${addedIds.length ? `
                    <div class="op-board-grid" style="--op-board-cols:${cols};" data-disp-card-list="1">
                        ${addedIds.map(id => {
                            const display = byId.get(id);
                            const title = display?.name || id;
                            const kind = display?.kind || 'missing';
                            const hasInteractive = Boolean(display && KIND_TO_CARD[display.kind]);
                            const mode = display ? getDisplayViewMode(display) : 'monitor';
                            const isCollapsed = collapsed.has(id);
                            return `
                            <article class="op-overlay-card${isCollapsed ? ' is-collapsed' : ''}" data-disp-panel="${esc(id)}"${layoutLocked ? '' : ' draggable="true"'}>
                                <header class="op-overlay-card-head">
                                    <div class="op-overlay-card-title" style="display:flex;align-items:center;gap:.38rem;flex-wrap:wrap;min-width:0;">
                                        ${layoutLocked ? '' : `<span class="op-drag-grip" title="Drag to reorder">${OP_ICONS.grip}</span>`}
                                        <button type="button" class="op-icon-btn op-collapse-btn" data-disp-collapse="${esc(id)}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Expand display' : 'Collapse display'}">${OP_ICONS.chevronDown}</button>
                                        <strong style="font-size:.86rem;">${esc(title)}</strong>
                                        <span class="op-pill">${esc(kind)}</span>
                                        ${hasInteractive ? `<button type="button" class="op-section-chip ${mode === 'controls' ? 'active' : ''}" data-disp-mode="controls" data-disp-id="${esc(id)}">Controls</button>
                                        <button type="button" class="op-section-chip ${mode === 'monitor' ? 'active' : ''}" data-disp-mode="monitor" data-disp-id="${esc(id)}">Monitor</button>` : ''}
                                    </div>
                                    <div class="op-btn-row" style="flex-wrap:wrap;">
                                        <button type="button" class="op-btn sm" data-disp-copy-link="${esc(id)}" title="Copy dedicated link for this display">Copy Link</button>
                                        <button type="button" class="op-btn sm" data-disp-copy-dock="${esc(id)}" title="Copy compact OBS Dock link for this display">Dock Link</button>
                                        <a class="op-btn sm" href="${esc(buildDisplayUrl(id))}" target="_blank" rel="noopener">Open</a>
                                        ${layoutLocked ? '' : `<button type="button" class="op-btn sm danger" data-disp-remove="${esc(id)}">Remove</button>`}
                                    </div>
                                </header>
                                <div class="op-overlay-card-body" data-disp-body="${esc(id)}"></div>
                            </article>`;
                        }).join('')}
                    </div>
                ` : `
                    <div class="op-card">
                        <div class="op-empty">
                            <div>No displays added to this preset yet.</div>
                            ${layoutLocked ? '' : `<button type="button" class="op-btn sm primary" data-disp-open-picker="1">${OP_ICONS.plus} Add Saved Display</button>`}
                        </div>
                    </div>
                `}
            </div>`;

        for (const id of addedIds) {
            const body = hostContainer.querySelector(`[data-disp-body="${CSS.escape(id)}"]`);
            if (!body) continue;
            const display = byId.get(id);
            if (!display) {
                body.innerHTML = `<div style="font-size:.8rem;color:var(--text-muted);">Display <code>${esc(id)}</code> no longer exists in Display Library.</div>`;
                continue;
            }
            mountDisplayPanelBody(body, display, getDisplayViewMode(display));
        }
    };

    const toggleDisplayInProfile = async id => {
        const prof = getCurrentProfile();
        if (!prof) return;
        const current = Array.isArray(prof.displays) ? prof.displays : [];
        const exists = current.includes(id);
        const nextDisplays = exists ? current.filter(x => x !== id) : [...current, id];
        await saveProfileToServer({ ...prof, displays: nextDisplays });
        toast(exists ? 'Removed display from preset' : 'Added display to preset', 'success');
        await renderDisplaysDomain({ forceFetch: false });
    };

    let onDragStart = null;
    let onDragOver = null;
    let onDrop = null;
    let onDragEnd = null;
    let draggedDisplayId = '';

    const unbindDomListeners = () => {
        if (!hostContainer) return;
        if (onContainerClick) hostContainer.removeEventListener('click', onContainerClick);
        if (onDragStart) hostContainer.removeEventListener('dragstart', onDragStart);
        if (onDragOver) hostContainer.removeEventListener('dragover', onDragOver);
        if (onDrop) hostContainer.removeEventListener('drop', onDrop);
        if (onDragEnd) hostContainer.removeEventListener('dragend', onDragEnd);
        onContainerClick = onDragStart = onDragOver = onDrop = onDragEnd = null;
        draggedDisplayId = '';
    };

    registerOperatorModule({
        id: 'displays',
        label: 'Displays',
        iconSvg: OP_ICONS.displays,
        order: 24,
        isEnabled: () => true,
        async mount(container, ctx) {
            unbindDomListeners();
            cleanupMounted();
            hostContainer = container;
            hostCtx = ctx;

            onContainerClick = async e => {
                const colsBtn = e.target.closest('[data-disp-cols]');
                if (colsBtn) {
                    const prof = getCurrentProfile();
                    const nextCols = setDisplayCols(prof?.id, Number(colsBtn.dataset.dispCols));
                    const grid = hostContainer.querySelector('[data-disp-card-list]');
                    if (grid) grid.style.setProperty('--op-board-cols', String(nextCols));
                    hostContainer.querySelectorAll('[data-disp-cols]').forEach(b => b.classList.toggle('active', b === colsBtn));
                    return;
                }
                const showAll = e.target.closest('[data-disp-show-all]');
                if (showAll) {
                    const url = new URL(location.href);
                    url.hash = 'tab=displays';
                    history.replaceState(null, '', url);
                    await renderDisplaysDomain({ forceFetch: false });
                    return;
                }
                const colBtn = e.target.closest('[data-disp-collapse]');
                const collapsedTitle = !colBtn && e.target.closest('.op-overlay-card.is-collapsed .op-overlay-card-title');
                if (colBtn || (collapsedTitle && !e.target.closest('button, a'))) {
                    const panel = (colBtn || collapsedTitle).closest('[data-disp-panel]');
                    const id = panel?.dataset.dispPanel;
                    const prof = getCurrentProfile();
                    if (id && prof) {
                        const addedIds = prof.displays || [];
                        const scopeKey = `displays_${prof.id || 'default'}`;
                        let collapsed;
                        if (isFocusPanelMode()) {
                            const wasCollapsed = panel.classList.contains('is-collapsed');
                            saveFocusedPanelId(scopeKey, wasCollapsed ? id : '__none__');
                            collapsed = resolveDisplayCollapsedSet(prof, addedIds).collapsed;
                        } else {
                            collapsed = getCollapsedPanelIds(scopeKey);
                            if (collapsed.has(id)) collapsed.delete(id);
                            else collapsed.add(id);
                            saveCollapsedPanelIds(scopeKey, collapsed);
                        }
                        hostContainer.querySelectorAll('[data-disp-panel]').forEach(pEl => {
                            const isCol = collapsed.has(pEl.dataset.dispPanel);
                            pEl.classList.toggle('is-collapsed', isCol);
                            const btn = pEl.querySelector('[data-disp-collapse]');
                            if (btn) btn.setAttribute('aria-expanded', String(!isCol));
                        });
                    }
                    return;
                }
                const modeBtn = e.target.closest('[data-disp-mode]');
                if (modeBtn) {
                    setDisplayViewMode(modeBtn.dataset.dispId, modeBtn.dataset.dispMode);
                    await renderDisplaysDomain({ forceFetch: false });
                    return;
                }
                const copyLink = e.target.closest('[data-disp-copy-link]');
                if (copyLink) {
                    await copyUrl(buildDisplayUrl(copyLink.dataset.dispCopyLink), 'display link');
                    return;
                }
                const copyDock = e.target.closest('[data-disp-copy-dock]');
                if (copyDock) {
                    await copyUrl(buildDisplayUrl(copyDock.dataset.dispCopyDock, { dock: true, bare: true }), 'display dock link');
                    return;
                }
                if (e.target.closest('[data-disp-open-picker]') && !isLayoutLocked()) {
                    const res = await fetchDisplaysCatalog(true);
                    displaysCatalog = Array.isArray(res?.displays) ? res.displays : [];
                    await openAddDisplayPicker(displaysCatalog, toggleDisplayInProfile);
                    return;
                }
                const rmBtn = e.target.closest('[data-disp-remove]');
                if (rmBtn && !isLayoutLocked()) {
                    await toggleDisplayInProfile(rmBtn.dataset.dispRemove);
                }
            };
            container.addEventListener('click', onContainerClick);

            onDragStart = e => {
                if (isLayoutLocked()) return;
                const card = e.target.closest('[data-disp-panel]');
                if (!card || e.target.closest('button, a, input, select, textarea')) return;
                draggedDisplayId = card.dataset.dispPanel || '';
                card.classList.add('is-dragging');
                e.dataTransfer?.setData('text/plain', draggedDisplayId);
            };
            onDragOver = e => {
                if (!draggedDisplayId || isLayoutLocked()) return;
                const target = e.target.closest('[data-disp-panel]');
                if (!target || target.dataset.dispPanel === draggedDisplayId) return;
                e.preventDefault();
                hostContainer.querySelectorAll('[data-disp-panel].is-drop-target').forEach(el => {
                    if (el !== target) el.classList.remove('is-drop-target');
                });
                target.classList.add('is-drop-target');
            };
            onDrop = async e => {
                if (!draggedDisplayId || isLayoutLocked()) return;
                const target = e.target.closest('[data-disp-panel]');
                if (!target) return;
                e.preventDefault();
                const targetId = target.dataset.dispPanel || '';
                const srcId = draggedDisplayId;
                draggedDisplayId = '';
                hostContainer.querySelectorAll('[data-disp-panel]').forEach(el => el.classList.remove('is-dragging', 'is-drop-target'));
                if (!srcId || !targetId || srcId === targetId) return;
                const prof = getCurrentProfile();
                if (!prof) return;
                const list = [...(prof.displays || [])];
                const fromIdx = list.indexOf(srcId);
                const toIdx = list.indexOf(targetId);
                if (fromIdx === -1 || toIdx === -1) return;
                const [moved] = list.splice(fromIdx, 1);
                list.splice(toIdx, 0, moved);
                try {
                    await saveProfileToServer({ ...prof, displays: list });
                    await renderDisplaysDomain({ forceFetch: false });
                } catch (err) { toast(err.message, 'error'); }
            };
            onDragEnd = () => {
                draggedDisplayId = '';
                hostContainer?.querySelectorAll('[data-disp-panel]').forEach(el => el.classList.remove('is-dragging', 'is-drop-target'));
            };
            container.addEventListener('dragstart', onDragStart);
            container.addEventListener('dragover', onDragOver);
            container.addEventListener('drop', onDrop);
            container.addEventListener('dragend', onDragEnd);

            await renderDisplaysDomain({ forceFetch: true });
        },
        unmount() {
            unbindDomListeners();
            cleanupMounted();
            hostContainer = null;
            hostCtx = null;
        },
        onSocket(type, payload) {
            if (['variable-displays', 'variable-displays-update'].includes(type)) {
                renderDisplaysDomain({ forceFetch: true });
                return;
            }
            for (const entry of mountedEntries) {
                entry.def?.onSocket?.(entry.body, entry.card, type, payload);
            }
        }
    });
})();
