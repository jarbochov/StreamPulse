'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';
import {
    getCollapsedPanelIds,
    getCurrentProfile,
    getFocusedPanelId,
    isEditLocked,
    isFocusPanelMode,
    isLayoutLocked,
    saveCollapsedPanelIds,
    saveFocusedPanelId,
    saveProfileToServer
} from './operator-state.js';

const ALL_SECTIONS = [
    { id: 'pages', label: 'Pages' },
    { id: 'videos', label: 'Videos' },
    { id: 'slides', label: 'Slideshows' },
    { id: 'cutouts', label: 'Cutouts' },
    { id: 'speakers', label: 'Speakers' }
];
const DOMAIN_SECTIONS_PREFIX = 'streampulse_op_ov_sections_';
const OV_COLS_PREFIX = 'streampulse_op_ov_cols_';

function getOverlayCols(profileId) {
    try {
        const n = Number(localStorage.getItem(`${OV_COLS_PREFIX}${profileId || 'default'}`));
        if ([1, 2, 3].includes(n)) return n;
    } catch { /* ignore */ }
    return 2;
}

function setOverlayCols(profileId, cols) {
    const clean = [1, 2, 3].includes(Number(cols)) ? Number(cols) : 2;
    try { localStorage.setItem(`${OV_COLS_PREFIX}${profileId || 'default'}`, String(clean)); } catch { /* ignore */ }
    return clean;
}

let overlayCatalog = [];
const overlayDetails = new Map();
let domainMounted = false;
let domainContainer = null;

async function fetchOverlayCatalog() {
    const list = await api('/api/custom-overlays');
    overlayCatalog = Array.isArray(list) ? list : [];
    return overlayCatalog;
}

async function fetchOverlayControlData(id, force = false) {
    if (!force && overlayDetails.has(id)) return overlayDetails.get(id);
    const [pageRes, fullRes, speakersRes] = await Promise.all([
        api(`/api/custom-overlays/${encodeURIComponent(id)}/page`).catch(() => ({ enabled: false })),
        api(`/api/custom-overlays/${encodeURIComponent(id)}`).catch(() => null),
        api(`/api/custom-overlays/${encodeURIComponent(id)}/speakers`).catch(() => ({ speakers: [] }))
    ]);
    const overlay = fullRes?.overlay || fullRes || { id, name: id, elements: [] };
    const elements = overlay.elements || [];
    const slides = elements.filter(e => e.type === 'slideshow').map((e, i) => ({ id: e.id, name: e.name || `Slideshow ${i + 1}` }));
    const videos = elements
        .filter(e => e.type === 'video' || (e.type === 'embed' && /youtube\.com|youtu\.be/i.test(e.src || '')))
        .map((e, i) => ({ id: e.id, name: e.name || (e.type === 'video' ? `Video ${i + 1}` : `YouTube ${i + 1}`) }));
    const cutouts = elements.filter(e => e.type === 'cutout').map((e, i) => ({ id: e.id, name: e.name || `Cutout ${i + 1}` }));
    const speakers = Array.isArray(speakersRes?.speakers) ? speakersRes.speakers : [];

    const entry = { id, name: overlay.name || id, pageState: pageRes, slides, videos, cutouts, speakers };
    overlayDetails.set(id, entry);
    return entry;
}

function getAvailableSections(entry, ctx) {
    if (!entry) return [];
    const avail = [];
    if (entry.pageState?.enabled && Array.isArray(entry.pageState.pages)) avail.push('pages');
    if (entry.videos.length) avail.push('videos');
    if (entry.slides.length) avail.push('slides');
    if (entry.cutouts.length) avail.push('cutouts');
    if (entry.speakers.length && (ctx?.status?.modules?.speakerBadges !== false || entry.speakers.length > 0)) avail.push('speakers');
    return avail;
}

function getDomainSectionsPref(overlayId) {
    try {
        const raw = JSON.parse(localStorage.getItem(`${DOMAIN_SECTIONS_PREFIX}${overlayId}`) || 'null');
        return Array.isArray(raw) ? raw : null;
    } catch { return null; }
}

function setDomainSectionsPref(overlayId, sections) {
    if (!sections) localStorage.removeItem(`${DOMAIN_SECTIONS_PREFIX}${overlayId}`);
    else localStorage.setItem(`${DOMAIN_SECTIONS_PREFIX}${overlayId}`, JSON.stringify(sections));
}

function renderOverlayBodyHtml(entry, ctx, { compact = false, sections = null } = {}) {
    if (!entry) return '<div style="font-size:.8rem;color:var(--text-muted);">Loading overlay…</div>';
    const allow = sections && sections.length ? new Set(sections) : null;
    const has = key => !allow || allow.has(key);
    const parts = [];
    const p = entry.pageState || {};

    const readOnly = isEditLocked();

    if (has('pages') && p.enabled && Array.isArray(p.pages)) {
        const current = p.pages.find(pg => pg.id === p.page);
        parts.push(`
            <div>
                <div class="op-pages-bar">
                    <span class="op-section-title op-pages-title" title="${esc(current?.name || p.name || p.page || '—')}">Pages · ${esc(current?.name || p.name || p.page || '—')}</span>
                    <div class="op-btn-row">
                        <button type="button" class="op-btn sm" data-ov-page-act="prev" data-ov-id="${esc(entry.id)}">Prev</button>
                        <button type="button" class="op-btn sm primary" data-ov-page-act="next" data-ov-id="${esc(entry.id)}">Next</button>
                        ${compact ? '' : `<button type="button" class="op-btn sm" data-ov-page-act="first" data-ov-id="${esc(entry.id)}">First</button>
                        <button type="button" class="op-btn sm" data-ov-page-act="last" data-ov-id="${esc(entry.id)}">Last</button>`}
                        <button type="button" class="op-btn sm op-btn-fixed-auto ${p.auto ? 'active' : ''}" data-ov-page-auto="${p.auto ? '0' : '1'}" data-ov-id="${esc(entry.id)}">${p.auto ? 'Auto: On' : 'Auto: Off'}</button>
                    </div>
                </div>
                <div class="op-page-list">
                    ${p.pages.map(pg => {
                        const enabled = pg.enabled !== false;
                        const isCur = pg.id === p.page;
                        return `<div class="op-page-item ${isCur ? 'is-current' : ''}">
                            <button type="button" class="op-page-go" data-ov-goto="${esc(pg.id)}" data-ov-id="${esc(entry.id)}" ${enabled ? '' : 'disabled'}>${esc(pg.name || pg.id)}</button>
                            ${readOnly ? '' : `<input type="checkbox" ${enabled ? 'checked' : ''} data-ov-page-toggle="${esc(pg.id)}" data-ov-id="${esc(entry.id)}" aria-label="Enable ${esc(pg.name || pg.id)}">`}
                        </div>`;
                    }).join('')}
                </div>
            </div>`);
    }

    if (has('videos') && entry.videos.length) {
        parts.push(`
            <div>
                <div class="op-section-title" style="margin-bottom:.35rem;">Videos &amp; YouTube</div>
                <div style="display:grid;gap:.38rem;">
                    ${entry.videos.map(v => `
                        <div class="op-panel-row" style="background:var(--bg-inset);padding:.38rem .52rem;border-radius:7px;border:1px solid var(--border);">
                            <span style="font-size:.8rem;font-weight:600;">${esc(v.name)}</span>
                            <div class="op-btn-row">
                                <button type="button" class="op-btn sm" data-ov-video="play" data-el="${esc(v.id)}" data-ov-id="${esc(entry.id)}">Play</button>
                                <button type="button" class="op-btn sm" data-ov-video="pause" data-el="${esc(v.id)}" data-ov-id="${esc(entry.id)}">Pause</button>
                                <button type="button" class="op-btn sm" data-ov-video="restart" data-el="${esc(v.id)}" data-ov-id="${esc(entry.id)}">Restart</button>
                                <button type="button" class="op-btn sm" data-ov-video="toggle-mute" data-el="${esc(v.id)}" data-ov-id="${esc(entry.id)}">Mute</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`);
    }

    if (has('slides') && entry.slides.length) {
        parts.push(`
            <div>
                <div class="op-section-title" style="margin-bottom:.35rem;">Slideshows</div>
                <div style="display:grid;gap:.38rem;">
                    ${entry.slides.map(s => `
                        <div class="op-panel-row" style="background:var(--bg-inset);padding:.38rem .52rem;border-radius:7px;border:1px solid var(--border);">
                            <span style="font-size:.8rem;font-weight:600;">${esc(s.name)}</span>
                            <div class="op-btn-row">
                                <button type="button" class="op-btn sm" data-ov-slide="prev" data-el="${esc(s.id)}" data-ov-id="${esc(entry.id)}">Prev</button>
                                <button type="button" class="op-btn sm" data-ov-slide="toggle" data-el="${esc(s.id)}" data-ov-id="${esc(entry.id)}">Play/Pause</button>
                                <button type="button" class="op-btn sm" data-ov-slide="next" data-el="${esc(s.id)}" data-ov-id="${esc(entry.id)}">Next</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`);
    }

    if (has('cutouts') && entry.cutouts.length) {
        parts.push(`
            <div>
                <div class="op-section-title" style="margin-bottom:.35rem;">Cutouts</div>
                <div style="display:grid;gap:.38rem;">
                    ${entry.cutouts.map(c => `
                        <div class="op-panel-row" style="background:var(--bg-inset);padding:.38rem .52rem;border-radius:7px;border:1px solid var(--border);">
                            <span style="font-size:.8rem;font-weight:600;">${esc(c.name)}</span>
                            <div class="op-btn-row">
                                <button type="button" class="op-btn sm" data-ov-cutout="show" data-el="${esc(c.id)}" data-ov-id="${esc(entry.id)}">Show</button>
                                <button type="button" class="op-btn sm" data-ov-cutout="hide" data-el="${esc(c.id)}" data-ov-id="${esc(entry.id)}">Hide</button>
                                <button type="button" class="op-btn sm" data-ov-cutout="toggle" data-el="${esc(c.id)}" data-ov-id="${esc(entry.id)}">Toggle</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`);
    }

    if (has('speakers') && entry.speakers.length && (ctx?.status?.modules?.speakerBadges !== false || entry.speakers.length > 0)) {
        parts.push(`
            <div>
                <div class="op-section-title" style="margin-bottom:.35rem;">Speaker Badges</div>
                <div style="display:grid;gap:.38rem;">
                    ${entry.speakers.map(sp => {
                        const speaker = sp.speakerBadge?.speaker || {};
                        if (readOnly) {
                            return `<div class="op-panel-row" style="background:var(--bg-inset);padding:.38rem .52rem;border-radius:7px;border:1px solid var(--border);gap:.4rem;">
                                <strong style="font-size:.82rem;">${esc(speaker.name || sp.name || 'Speaker')}</strong>
                                <span style="font-size:.76rem;color:var(--text-muted);">${esc([speaker.handle, speaker.callIn?.statusText].filter(Boolean).join(' · ') || '—')}</span>
                            </div>`;
                        }
                        return `
                        <form class="op-panel-row" data-ov-speaker-form="${esc(sp.id)}" data-ov-id="${esc(entry.id)}" style="background:var(--bg-inset);padding:.4rem .52rem;border-radius:7px;border:1px solid var(--border);gap:.38rem;">
                            <input type="text" name="name" class="op-cell-input" style="max-width:150px;" value="${esc(speaker.name || '')}" placeholder="Speaker name" aria-label="Speaker name">
                            <input type="text" name="handle" class="op-cell-input" style="max-width:130px;" value="${esc(speaker.handle || '')}" placeholder="@handle" aria-label="Handle">
                            <input type="text" name="statusText" class="op-cell-input" style="max-width:130px;" value="${esc(speaker.callIn?.statusText || '')}" placeholder="Status" aria-label="Call-in status">
                            <button type="submit" class="op-btn sm primary">Update</button>
                        </form>`;
                    }).join('')}
                </div>
            </div>`);
    }

    if (!parts.length) {
        return `<div style="font-size:.8rem;color:var(--text-muted);">${sections?.length ? 'None of the selected control sections are present on this overlay.' : 'No controllable pages, videos, slideshows, cutouts, or speaker badges in this overlay.'}</div>`;
    }
    return parts.join('');
}

async function handleOverlayAction(e, refreshCb) {
    const t = e.target;
    const btn = t.closest('button');
    if (btn) {
        const id = btn.dataset.ovId;
        if (!id) return false;
        try {
            if (btn.dataset.ovPageAct) {
                const res = await api(`/api/custom-overlays/${encodeURIComponent(id)}/page`, 'POST', { action: btn.dataset.ovPageAct });
                if (overlayDetails.has(id)) overlayDetails.get(id).pageState = res;
                refreshCb();
                return true;
            }
            if (btn.dataset.ovPageAuto !== undefined) {
                const res = await api(`/api/custom-overlays/${encodeURIComponent(id)}/page`, 'POST', { action: 'auto', auto: btn.dataset.ovPageAuto === '1' });
                if (overlayDetails.has(id)) overlayDetails.get(id).pageState = res;
                refreshCb();
                return true;
            }
            if (btn.dataset.ovGoto) {
                const res = await api(`/api/custom-overlays/${encodeURIComponent(id)}/page`, 'POST', { action: 'goto', page: btn.dataset.ovGoto });
                if (overlayDetails.has(id)) overlayDetails.get(id).pageState = res;
                refreshCb();
                return true;
            }
            if (btn.dataset.ovVideo) {
                await api(`/api/custom-overlays/${encodeURIComponent(id)}/video`, 'POST', { action: btn.dataset.ovVideo, element: btn.dataset.el || '' });
                toast(`Sent video ${btn.dataset.ovVideo}`, 'success');
                return true;
            }
            if (btn.dataset.ovSlide) {
                await api(`/api/custom-overlays/${encodeURIComponent(id)}/slideshow`, 'POST', { action: btn.dataset.ovSlide, element: btn.dataset.el || '' });
                toast(`Sent slideshow ${btn.dataset.ovSlide}`, 'success');
                return true;
            }
            if (btn.dataset.ovCutout) {
                await api(`/api/custom-overlays/${encodeURIComponent(id)}/cutout`, 'POST', { action: btn.dataset.ovCutout, element: btn.dataset.el || '' });
                toast(`Sent cutout ${btn.dataset.ovCutout}`, 'success');
                return true;
            }
        } catch (err) {
            toast(err.message, 'error');
            return true;
        }
    }
    return false;
}

async function handleOverlayChange(e, refreshCb) {
    if (isEditLocked()) return false;
    const chk = e.target.closest('[data-ov-page-toggle]');
    if (!chk) return false;
    const id = chk.dataset.ovId;
    const pageId = chk.dataset.ovPageToggle;
    try {
        const res = await api(`/api/custom-overlays/${encodeURIComponent(id)}/page`, 'POST', {
            action: chk.checked ? 'enable' : 'disable',
            page: pageId
        });
        if (overlayDetails.has(id)) overlayDetails.get(id).pageState = res;
        refreshCb();
    } catch (err) {
        chk.checked = !chk.checked;
        toast(err.message, 'error');
    }
    return true;
}

async function handleOverlaySubmit(e, refreshCb) {
    if (isEditLocked()) { e.preventDefault(); return false; }
    const form = e.target.closest('[data-ov-speaker-form]');
    if (!form) return false;
    e.preventDefault();
    const id = form.dataset.ovId;
    const element = form.dataset.ovSpeakerForm;
    try {
        const res = await api(`/api/custom-overlays/${encodeURIComponent(id)}/speakers`, 'PATCH', {
            element,
            speaker: {
                name: form.elements.name.value,
                handle: form.elements.handle.value,
                callIn: { statusText: form.elements.statusText.value }
            }
        });
        if (overlayDetails.has(id) && Array.isArray(res.speakers)) {
            overlayDetails.get(id).speakers = res.speakers;
        }
        toast('Speaker badge updated', 'success');
        refreshCb();
    } catch (err) {
        toast(err.message, 'error');
    }
    return true;
}

function resolveOverlayCollapsedSet(profile, addedIds) {
    const scopeKey = `overlays_${profile?.id || 'default'}`;
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

function renderDomain(container, ctx) {
    const profile = getCurrentProfile();
    const addedIds = profile?.overlays || [];
    const layoutLocked = isLayoutLocked();
    const { collapsed } = resolveOverlayCollapsedSet(profile, addedIds);
    const cols = getOverlayCols(profile?.id);
    container.innerHTML = `
        <div class="op-domain-stack">
            <div class="op-toolbar">
                <div class="op-toolbar-left" style="flex-wrap:wrap;gap:.45rem;">
                    <span style="display:inline-flex;align-items:center;gap:.4rem;font-weight:700;font-size:.88rem;">${OP_ICONS.overlays} Overlays</span>
                    <span class="op-pill">${addedIds.length} added</span>
                    ${addedIds.length ? `<div class="op-filter-seg" role="group" aria-label="Overlay grid columns">
                        ${[1, 2, 3].map(n => `<button type="button" class="op-filter-btn${cols === n ? ' active' : ''}" data-ov-cols="${n}" title="${n} column${n === 1 ? '' : 's'}">${n} Col</button>`).join('')}
                    </div>` : ''}
                </div>
                <div class="op-toolbar-right">
                    ${layoutLocked ? '' : `<button type="button" class="op-btn sm primary" data-ov-open-picker="1">${OP_ICONS.plus} Add Overlay</button>`}
                </div>
            </div>
            ${addedIds.length ? `
                <div class="op-board-grid" style="--op-board-cols:${cols};" data-ov-card-list="1">
                    ${addedIds.map(id => {
                        const entry = overlayDetails.get(id);
                        const meta = overlayCatalog.find(o => o.id === id);
                        const title = entry?.name || meta?.name || id;
                        const avail = getAvailableSections(entry, ctx);
                        const pref = getDomainSectionsPref(id);
                        const activeSet = pref ? new Set(pref) : new Set(avail);
                        const isCollapsed = collapsed.has(id);
                        return `
                        <article class="op-overlay-card${isCollapsed ? ' is-collapsed' : ''}" data-ov-panel="${esc(id)}"${layoutLocked ? '' : ' draggable="true"'}>
                            <header class="op-overlay-card-head">
                                <div class="op-overlay-card-title" style="display:flex;align-items:center;gap:.38rem;flex-wrap:wrap;min-width:0;">
                                    ${layoutLocked ? '' : `<span class="op-drag-grip" title="Drag to reorder">${OP_ICONS.grip}</span>`}
                                    <button type="button" class="op-icon-btn op-collapse-btn" data-ov-collapse="${esc(id)}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Expand overlay' : 'Collapse overlay'}">${OP_ICONS.chevronDown}</button>
                                    <strong style="font-size:.86rem;">${esc(title)}</strong>
                                    <span class="op-pill">${esc(id)}</span>
                                    ${!layoutLocked && avail.length > 1 ? avail.map(sec => {
                                        const secLabel = ALL_SECTIONS.find(s => s.id === sec)?.label || sec;
                                        return `<button type="button" class="op-section-chip ${activeSet.has(sec) ? 'active' : ''}" data-ov-domain-sec="${esc(sec)}" data-ov-sec-id="${esc(id)}">${esc(secLabel)}</button>`;
                                    }).join('') : ''}
                                </div>
                                <div class="op-btn-row">
                                    <a class="op-btn sm" href="/overlay-control.html?id=${encodeURIComponent(id)}" target="_blank">Full Control</a>
                                    ${layoutLocked ? '' : `<button type="button" class="op-btn sm danger" data-ov-remove="${esc(id)}">Remove</button>`}
                                </div>
                            </header>
                            <div class="op-overlay-card-body">
                                ${renderOverlayBodyHtml(entry, ctx, { compact: false, sections: avail.length > 1 ? [...activeSet] : null })}
                            </div>
                        </article>`;
                    }).join('')}
                </div>
            ` : `
                <div class="op-card">
                    <div class="op-empty">
                        <div>No overlays added to this preset yet.</div>
                        ${layoutLocked ? '' : `<button type="button" class="op-btn sm primary" data-ov-open-picker="1">${OP_ICONS.plus} Add Custom Overlay</button>`}
                    </div>
                </div>
            `}
        </div>`;
}

export async function openAddOverlayPicker(onToggleOverlay) {
    await fetchOverlayCatalog();
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    if (!modal || !titleEl || !bodyEl || !footEl) return;

    titleEl.textContent = 'Manage Added Overlays';
    let query = '';
    const drawList = () => {
        const listEl = bodyEl.querySelector('[data-ov-picker-list]');
        if (!listEl) return;
        const added = new Set(getCurrentProfile()?.overlays || []);
        const term = query.trim().toLowerCase();
        const filtered = overlayCatalog.filter(o =>
            !term || `${o.name} ${o.id}`.toLowerCase().includes(term)
        );
        listEl.innerHTML = filtered.length ? filtered.map(o => {
            const isAdded = added.has(o.id);
            return `
            <div class="op-picker-row">
                <div class="op-picker-row-info">
                    <strong>${esc(o.name || o.id)} ${isAdded ? '<span class="op-pill is-ok" style="margin-left:.3rem;">Added</span>' : ''}</strong>
                    <span>ID: ${esc(o.id)} · ${o.pageCount || 0} pages · ${o.hasControls ? 'Has live controls' : 'Canvas overlay'}</span>
                </div>
                <button type="button" class="op-btn sm ${isAdded ? 'danger' : 'primary'}" data-pick-overlay="${esc(o.id)}">
                    ${isAdded ? 'Remove' : 'Add'}
                </button>
            </div>`;
        }).join('') : '<div style="font-size:.82rem;color:var(--text-muted);">No matching custom overlays found.</div>';
    };

    bodyEl.innerHTML = `
        <div class="op-field">
            <label for="op-ov-pick-search">Search Custom Overlays</label>
            <input type="search" id="op-ov-pick-search" placeholder="Type overlay name or id…">
        </div>
        <div class="op-picker-list" data-ov-picker-list="1"></div>`;
    footEl.innerHTML = '<button type="button" class="op-btn sm primary" data-modal-close="1">Done</button>';
    drawList();

    const searchInput = document.getElementById('op-ov-pick-search');
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
        const btn = e.target.closest('[data-pick-overlay]');
        if (!btn) return;
        await onToggleOverlay(btn.dataset.pickOverlay);
        drawList();
    };
    searchInput?.addEventListener('input', onSearch);
    bodyEl.addEventListener('click', onPick);
    footEl.querySelector('[data-modal-close]')?.addEventListener('click', cleanup, { once: true });
    modal.hidden = false;
    searchInput?.focus();
}

async function loadAddedOverlays(profile) {
    const addedIds = profile?.overlays || [];
    await fetchOverlayCatalog();
    await Promise.all(addedIds.map(id => fetchOverlayControlData(id, true)));
}

registerOperatorModule({
    id: 'overlays',
    label: 'Overlays',
    iconSvg: OP_ICONS.overlays,
    order: 25,
    isEnabled: () => true,
    async mount(container, ctx) {
        domainMounted = true;
        domainContainer = container;
        container.hidden = false;

        let draggedOvId = '';
        const onClick = async e => {
            const colsBtn = e.target.closest('[data-ov-cols]');
            if (colsBtn) {
                const prof = getCurrentProfile();
                const nextCols = setOverlayCols(prof?.id, Number(colsBtn.dataset.ovCols));
                const grid = container.querySelector('[data-ov-card-list]');
                if (grid) grid.style.setProperty('--op-board-cols', String(nextCols));
                container.querySelectorAll('[data-ov-cols]').forEach(b => b.classList.toggle('active', b === colsBtn));
                return;
            }
            const colBtn = e.target.closest('[data-ov-collapse]');
            const collapsedTitle = !colBtn && e.target.closest('.op-overlay-card.is-collapsed .op-overlay-card-title');
            if (colBtn || (collapsedTitle && !e.target.closest('button, a'))) {
                const panel = (colBtn || collapsedTitle).closest('[data-ov-panel]');
                const id = panel?.dataset.ovPanel;
                const prof = getCurrentProfile();
                if (id && prof) {
                    const addedIds = prof.overlays || [];
                    const scopeKey = `overlays_${prof.id || 'default'}`;
                    let collapsed;
                    if (isFocusPanelMode()) {
                        const wasCollapsed = panel.classList.contains('is-collapsed');
                        saveFocusedPanelId(scopeKey, wasCollapsed ? id : '__none__');
                        collapsed = resolveOverlayCollapsedSet(prof, addedIds).collapsed;
                    } else {
                        collapsed = getCollapsedPanelIds(scopeKey);
                        if (collapsed.has(id)) collapsed.delete(id);
                        else collapsed.add(id);
                        saveCollapsedPanelIds(scopeKey, collapsed);
                    }
                    container.querySelectorAll('[data-ov-panel]').forEach(pEl => {
                        const isCol = collapsed.has(pEl.dataset.ovPanel);
                        pEl.classList.toggle('is-collapsed', isCol);
                        const btn = pEl.querySelector('[data-ov-collapse]');
                        if (btn) btn.setAttribute('aria-expanded', String(!isCol));
                    });
                }
                return;
            }
            const secBtn = e.target.closest('[data-ov-domain-sec]');
            if (secBtn) {
                const id = secBtn.dataset.ovSecId;
                const sec = secBtn.dataset.ovDomainSec;
                const entry = overlayDetails.get(id);
                const avail = getAvailableSections(entry, ctx);
                const cur = new Set(getDomainSectionsPref(id) || avail);
                if (cur.has(sec) && cur.size > 1) cur.delete(sec);
                else cur.add(sec);
                setDomainSectionsPref(id, [...cur]);
                renderDomain(container, ctx);
                return;
            }
            if (e.target.closest('[data-ov-open-picker]')) {
                await openAddOverlayPicker(async id => {
                    const prof = getCurrentProfile();
                    if (!prof) return;
                    const exists = prof.overlays.includes(id);
                    const overlays = exists
                        ? prof.overlays.filter(x => x !== id)
                        : [...prof.overlays, id];
                    await saveProfileToServer({ ...prof, overlays });
                    if (!exists) await fetchOverlayControlData(id, true);
                    renderDomain(container, ctx);
                });
                return;
            }
            const rm = e.target.closest('[data-ov-remove]');
            if (rm) {
                const prof = getCurrentProfile();
                if (!prof) return;
                const updated = { ...prof, overlays: prof.overlays.filter(x => x !== rm.dataset.ovRemove) };
                await saveProfileToServer(updated);
                renderDomain(container, ctx);
                return;
            }
            await handleOverlayAction(e, () => renderDomain(container, ctx));
        };
        const onChange = e => handleOverlayChange(e, () => renderDomain(container, ctx));
        const onSubmit = e => handleOverlaySubmit(e, () => renderDomain(container, ctx));
        const onDragStart = e => {
            if (isLayoutLocked()) return;
            const card = e.target.closest('[data-ov-panel]');
            if (!card || e.target.closest('button, a, input, select, textarea, .op-overlay-card-body')) return;
            draggedOvId = card.dataset.ovPanel || '';
            card.classList.add('is-dragging');
            e.dataTransfer?.setData('text/plain', draggedOvId);
        };
        const onDragOver = e => {
            if (!draggedOvId || isLayoutLocked()) return;
            const target = e.target.closest('[data-ov-panel]');
            if (!target || target.dataset.ovPanel === draggedOvId) return;
            e.preventDefault();
            container.querySelectorAll('[data-ov-panel].is-drop-target').forEach(el => {
                if (el !== target) el.classList.remove('is-drop-target');
            });
            target.classList.add('is-drop-target');
        };
        const onDrop = async e => {
            if (!draggedOvId || isLayoutLocked()) return;
            const target = e.target.closest('[data-ov-panel]');
            if (!target) return;
            e.preventDefault();
            const srcId = draggedOvId;
            const targetId = target.dataset.ovPanel || '';
            draggedOvId = '';
            container.querySelectorAll('[data-ov-panel]').forEach(el => el.classList.remove('is-dragging', 'is-drop-target'));
            if (!srcId || !targetId || srcId === targetId) return;
            const prof = getCurrentProfile();
            if (!prof) return;
            const list = [...(prof.overlays || [])];
            const fromIdx = list.indexOf(srcId);
            const toIdx = list.indexOf(targetId);
            if (fromIdx === -1 || toIdx === -1) return;
            const [moved] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, moved);
            try {
                await saveProfileToServer({ ...prof, overlays: list });
                renderDomain(container, ctx);
            } catch (err) { toast(err.message, 'error'); }
        };
        const onDragEnd = () => {
            draggedOvId = '';
            container.querySelectorAll('[data-ov-panel]').forEach(el => el.classList.remove('is-dragging', 'is-drop-target'));
        };

        container._opListeners = { onClick, onChange, onSubmit, onDragStart, onDragOver, onDrop, onDragEnd };
        container.addEventListener('click', onClick);
        container.addEventListener('change', onChange);
        container.addEventListener('submit', onSubmit);
        container.addEventListener('dragstart', onDragStart);
        container.addEventListener('dragover', onDragOver);
        container.addEventListener('drop', onDrop);
        container.addEventListener('dragend', onDragEnd);

        await loadAddedOverlays(getCurrentProfile());
        renderDomain(container, ctx);
    },
    unmount(ctx) {
        domainMounted = false;
        if (domainContainer?._opListeners) {
            const { onClick, onChange, onSubmit, onDragStart, onDragOver, onDrop, onDragEnd } = domainContainer._opListeners;
            domainContainer.removeEventListener('click', onClick);
            domainContainer.removeEventListener('change', onChange);
            domainContainer.removeEventListener('submit', onSubmit);
            domainContainer.removeEventListener('dragstart', onDragStart);
            domainContainer.removeEventListener('dragover', onDragOver);
            domainContainer.removeEventListener('drop', onDrop);
            domainContainer.removeEventListener('dragend', onDragEnd);
            delete domainContainer._opListeners;
        }
        if (ctx?.container) ctx.container.hidden = true;
        domainContainer = null;
    },
    async onSocket(type, data, ctx) {
        if (!domainMounted || !domainContainer) return;
        if (type === 'custom-overlay-page' && data?.id) {
            const entry = overlayDetails.get(data.id);
            if (entry) {
                entry.pageState = data;
                renderDomain(domainContainer, ctx);
            }
        } else if (type === 'custom-overlay-update' && data?.id) {
            if (overlayDetails.has(data.id)) {
                await fetchOverlayControlData(data.id, true);
                renderDomain(domainContainer, ctx);
            }
        }
    }
});

// Shared Live Board Card builder for full & granular Custom Overlay cards
function createOverlayCardDefinition({ type, label, description, defaultSections = null, filterCatalog = null }) {
    return {
        type,
        moduleId: 'overlays',
        label,
        description,
        iconSvg: OP_ICONS.overlays,
        isEnabled: () => true,
        async getPickerItems() {
            const list = await fetchOverlayCatalog();
            const filtered = typeof filterCatalog === 'function' ? list.filter(filterCatalog) : list;
            return filtered.map(o => ({
                title: o.name || o.id,
                subtitle: `ID: ${o.id} · ${o.pageCount || 0} pages${o.hasControls ? ' · Live controls' : ''}`,
                defaultTitle: defaultSections ? `${o.name || o.id} · ${label.replace('Overlay ', '')}` : (o.name || o.id),
                config: {
                    overlayId: o.id,
                    ...(defaultSections ? { sections: [...defaultSections] } : {})
                }
            }));
        },
        toggleConfig(el) {
            el._opConfigOpen = !el._opConfigOpen;
            el._opRender?.();
        },
        mount(el, card, ctx) {
            const overlayId = card.config?.overlayId || '';
            const render = () => {
                const entry = overlayDetails.get(overlayId);
                if (!overlayId) {
                    el.innerHTML = '<div style="font-size:.8rem;color:var(--text-muted);">No overlay selected.</div>';
                    return;
                }
                const avail = getAvailableSections(entry, ctx);
                const selected = Array.isArray(card.config?.sections) && card.config.sections.length
                    ? card.config.sections
                    : (defaultSections || avail);
                const cfgBar = el._opConfigOpen && avail.length ? `
                    <div class="op-card-sections-bar">
                        <span style="font-size:.72rem;font-weight:700;color:var(--text-muted);width:100%;">Included controls:</span>
                        ${avail.map(sec => {
                            const secLabel = ALL_SECTIONS.find(s => s.id === sec)?.label || sec;
                            const active = selected.includes(sec);
                            return `<button type="button" class="op-section-chip ${active ? 'active' : ''}" data-card-sec-toggle="${esc(sec)}">${esc(secLabel)}</button>`;
                        }).join('')}
                    </div>` : '';
                el.innerHTML = cfgBar + renderOverlayBodyHtml(entry, ctx, { compact: true, sections: selected });
            };
            const onClick = async e => {
                const secBtn = e.target.closest('[data-card-sec-toggle]');
                if (secBtn) {
                    const entry = overlayDetails.get(overlayId);
                    const avail = getAvailableSections(entry, ctx);
                    const cur = new Set(Array.isArray(card.config?.sections) && card.config.sections.length
                        ? card.config.sections
                        : (defaultSections || avail));
                    const sec = secBtn.dataset.cardSecToggle;
                    if (cur.has(sec) && cur.size > 1) cur.delete(sec);
                    else cur.add(sec);
                    card.config = { ...(card.config || {}), sections: [...cur] };
                    const prof = getCurrentProfile();
                    if (prof) {
                        const cards = (prof.board?.cards || []).map(c => c.id === card.id ? { ...c, config: card.config } : c);
                        await saveProfileToServer({ ...prof, board: { ...prof.board, cards } });
                    }
                    render();
                    return;
                }
                await handleOverlayAction(e, render);
            };
            const onChange = e => handleOverlayChange(e, render);
            const onSubmit = e => handleOverlaySubmit(e, render);
            el.addEventListener('click', onClick);
            el.addEventListener('change', onChange);
            el.addEventListener('submit', onSubmit);
            el._opRefresh = () => overlayId ? fetchOverlayControlData(overlayId, true).then(render) : render();
            el._opRender = render;
            el._opCleanup = () => {
                el.removeEventListener('click', onClick);
                el.removeEventListener('change', onChange);
                el.removeEventListener('submit', onSubmit);
            };
            el._opRefresh();
        },
        onSocket(el, card, type, data) {
            const overlayId = card.config?.overlayId || '';
            if (!overlayId || data?.id !== overlayId) return;
            if (type === 'custom-overlay-page') {
                const entry = overlayDetails.get(overlayId);
                if (entry) {
                    entry.pageState = data;
                    el._opRender?.();
                }
            } else if (type === 'custom-overlay-update') {
                el._opRefresh?.();
            }
        },
        unmount(el) {
            el._opCleanup?.();
        }
    };
}

registerCardType(createOverlayCardDefinition({
    type: 'overlay-control',
    label: 'Custom Overlay Control',
    description: 'Pin any combination of Pages, Media, Cutouts, and Speakers (toggleable via card sliders icon).'
}));

registerCardType(createOverlayCardDefinition({
    type: 'overlay-pages',
    label: 'Overlay Pages',
    description: 'Pin only Page switching and Auto-advance for an overlay.',
    defaultSections: ['pages'],
    filterCatalog: o => (o.pageCount || 0) > 0
}));

registerCardType(createOverlayCardDefinition({
    type: 'overlay-media',
    label: 'Overlay Media Playback',
    description: 'Pin only Videos, YouTube embeds, and Slideshows for an overlay.',
    defaultSections: ['videos', 'slides']
}));

registerCardType(createOverlayCardDefinition({
    type: 'overlay-cutouts',
    label: 'Overlay Cutouts',
    description: 'Pin only Cutout visibility controls for an overlay.',
    defaultSections: ['cutouts']
}));

registerCardType(createOverlayCardDefinition({
    type: 'overlay-speakers',
    label: 'Overlay Speaker Badges',
    description: 'Pin only Speaker Badge live editing for an overlay.',
    defaultSections: ['speakers']
}));
