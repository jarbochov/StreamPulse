// Dedicated live operator console for inline-editing all items and fields of a Variable Set
import { connectLiveSocket } from '../shared/client-core.js';
import { api, esc, pickImage, slugId, state, toast } from './variables-state.js';
import { bindLinkControls, linkControl } from './variables-links.js';

const STORAGE_KEY = 'streampulse_operator_set';
const LAYOUTS_PREFIX = 'streampulse_operator_layouts_';
const VIEW_PREFIX = 'streampulse_operator_view_';
const VIEW_MODE_PREFIX = 'streampulse_operator_mode_';
const MATRIX_FIELD_PREFIX = 'streampulse_operator_mfield_';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const SVG_SORT_NONE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
const SVG_SORT_ASC = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>';
const SVG_SORT_DESC = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const SVG_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_DOT = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg>';

function getHashParts() {
    const rawHash = (location.hash || '').replace(/^#/, '').trim();
    if (rawHash) {
        if (rawHash.startsWith('set=')) return { id: decodeURIComponent(rawHash.slice(4)), matrix: false };
        const hasMatrix = rawHash.endsWith('/matrix');
        const clean = hasMatrix ? rawHash.slice(0, -7) : rawHash;
        return { id: decodeURIComponent(clean), matrix: hasMatrix };
    }
    return { id: new URLSearchParams(location.search).get('set') || '', matrix: false };
}

function getSetIdFromUrl() {
    return getHashParts().id;
}

const initialHash = getHashParts();
let activeSetId = initialHash.id || localStorage.getItem(STORAGE_KEY) || '';
if (initialHash.id && initialHash.matrix) {
    localStorage.setItem(`${VIEW_MODE_PREFIX}${initialHash.id}`, 'matrix');
}
let searchQuery = '';
let filterMode = 'all';
let saveTimer = null;
let saveBadgeTimer = null;
let activeLayoutName = '';
let pendingSave = null;
let saveQueue = Promise.resolve();
let saveError = null;
let trackerBusy = false;

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

function getViewMode(setObj) {
    if (!(setObj?.fields || []).some(f => f.type === 'checklist')) return 'table';
    return localStorage.getItem(`${VIEW_MODE_PREFIX}${setObj.id}`) === 'matrix' ? 'matrix' : 'table';
}

function setViewMode(setObj, mode) {
    localStorage.setItem(`${VIEW_MODE_PREFIX}${setObj.id}`, mode === 'matrix' ? 'matrix' : 'table');
}

function getMatrixField(setObj) {
    const checklistFields = (setObj?.fields || []).filter(f => f.type === 'checklist');
    if (!checklistFields.length) return null;
    const savedKey = localStorage.getItem(`${MATRIX_FIELD_PREFIX}${setObj.id}`);
    return checklistFields.find(f => f.key === savedKey) || checklistFields[0];
}

function setMatrixField(setObj, key) {
    localStorage.setItem(`${MATRIX_FIELD_PREFIX}${setObj.id}`, key);
}

function getEntryThumbUrl(setObj, entry) {
    const imgField = (setObj?.fields || []).find(f => f.type === 'image');
    return imgField ? String(entry?.values?.[imgField.key] || '') : '';
}

function getAllColumnDefs(setObj) {
    return [
        { key: '__slot', label: 'On Air', type: 'slot' },
        ...(setObj.fields || []).map(f => ({ key: f.key, label: f.label, type: f.type, field: f })),
        { key: '__flags', label: 'Flags', type: 'flags' }
    ];
}

function getSavedLayouts(setId) {
    try {
        const raw = JSON.parse(localStorage.getItem(`${LAYOUTS_PREFIX}${setId}`) || '[]');
        return Array.isArray(raw) ? raw.filter(l => l && l.name) : [];
    } catch { return []; }
}

function setSavedLayouts(setId, list) {
    localStorage.setItem(`${LAYOUTS_PREFIX}${setId}`, JSON.stringify(list));
}

function getViewConfig(setObj) {
    const defs = getAllColumnDefs(setObj);
    const validKeys = defs.map(d => d.key);
    try {
        const saved = JSON.parse(localStorage.getItem(`${VIEW_PREFIX}${setObj.id}`) || 'null');
        if (saved && Array.isArray(saved.order) && Array.isArray(saved.visible)) {
            const order = saved.order.filter(k => validKeys.includes(k));
            for (const k of validKeys) if (!order.includes(k)) order.push(k);
            const visible = saved.visible.filter(k => validKeys.includes(k));
            const sort = saved.sort && validKeys.includes(saved.sort.key) ? saved.sort : { key: '', dir: '' };
            activeLayoutName = saved.layoutName || '';
            return { order, visible: visible.length ? visible : [...validKeys], sort };
        }
    } catch {}
    activeLayoutName = '';
    return { order: [...validKeys], visible: [...validKeys], sort: { key: '', dir: '' } };
}

function saveViewConfig(setObj, cfg, layoutName = '') {
    activeLayoutName = layoutName;
    localStorage.setItem(`${VIEW_PREFIX}${setObj.id}`, JSON.stringify({ ...cfg, layoutName }));
}

function setSaveBadge(text, isError = false) {
    const el = document.getElementById('op-save-state');
    if (!el) return;
    clearTimeout(saveBadgeTimer);
    el.textContent = text;
    el.className = `op-pill ${isError ? '' : 'is-ok'}`;
    el.hidden = false;
    if (!isError && text === 'Saved') {
        saveBadgeTimer = setTimeout(() => { el.hidden = true; }, 1800);
    }
}

function getActiveSet() {
    const sets = state.sets || [];
    if (!sets.length) return null;
    const found = sets.find(s => s.id === activeSetId) || sets[0];
    if (found) {
        if (found.id !== activeSetId) {
            activeSetId = found.id;
            localStorage.setItem(STORAGE_KEY, activeSetId);
        }
        if (getSetIdFromUrl() !== found.id) {
            const url = new URL(location.href);
            url.searchParams.delete('set');
            url.hash = encodeURIComponent(found.id);
            history.replaceState(null, '', url);
        }
    }
    return found;
}

function slotAssignmentsForEntry(setObj, entryId) {
    if ((setObj.slotsCount || 0) === 0) {
        return setObj.activeEntry === entryId ? [0] : [];
    }
    const out = [];
    (setObj.slots || []).forEach((id, idx) => {
        if (id === entryId) out.push(idx + 1);
    });
    return out;
}

function matchesFilter(setObj, entry) {
    const slotted = slotAssignmentsForEntry(setObj, entry.id).length > 0;
    if (filterMode === 'enabled' && entry.enabled === false) return false;
    if (filterMode === 'group' && entry.inGroup === false) return false;
    if (filterMode === 'slotted' && !slotted) return false;
    if (searchQuery) {
        const hay = `${entry.label || ''} ${entry.id || ''} ${Object.values(entry.values || {}).join(' ')}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
    }
    return true;
}

function renderFieldCell(entry, f) {
    const val = entry.values?.[f.key] ?? (f.type === 'color' ? '#3b82f6' : f.type === 'toggle' ? 'false' : (f.type === 'counter' || f.type === 'number') ? '0' : '');
    const eid = esc(entry.id);
    const fk = esc(f.key);

    if (f.type === 'toggle') {
        return `<label class="op-check"><input type="checkbox" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="toggle" ${val === 'true' ? 'checked' : ''}><span>${val === 'true' ? 'On' : 'Off'}</span></label>`;
    }
    if (f.type === 'counter') {
        return `<div class="op-counter-group">
            <button type="button" class="op-step-btn" data-op-step="${eid}" data-op-key="${fk}" data-op-delta="-1" aria-label="Decrement ${esc(f.label)}">-1</button>
            <input type="number" step="any" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="counter" value="${esc(val)}">
            <button type="button" class="op-step-btn" data-op-step="${eid}" data-op-key="${fk}" data-op-delta="1" aria-label="Increment ${esc(f.label)}">+1</button>
        </div>`;
    }
    if (f.type === 'number') {
        return `<input type="number" step="any" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="number" value="${esc(val)}">`;
    }
    if (f.type === 'color') {
        const hex = /^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : '#3b82f6';
        return `<div class="op-inline-group">
            <input type="color" class="op-color-swatch" data-op-swatch="${eid}" data-op-key="${fk}" value="${esc(hex)}" aria-label="${esc(f.label)} color">
            <input type="text" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="color" value="${esc(val)}" placeholder="#3b82f6">
        </div>`;
    }
    if (f.type === 'image') {
        return `<div class="op-inline-group">
            ${val ? `<img src="${esc(val)}" alt="" class="op-thumb">` : ''}
            <input type="text" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="image" value="${esc(val)}" placeholder="https://... or /assets/...">
            <button type="button" class="op-btn sm" data-op-pick-img="${eid}" data-op-key="${fk}">Assets</button>
        </div>`;
    }
    if (f.type === 'icon') {
        return `<div class="op-inline-group">
            <span class="op-icon-box">${val ? `<i class="${esc(val)}" aria-hidden="true"></i>` : ''}</span>
            <input type="text" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="icon" value="${esc(val)}" placeholder="fa-solid fa-star">
            <button type="button" class="op-btn sm" data-op-pick-icon="${eid}" data-op-key="${fk}">Pick</button>
        </div>`;
    }
    if (f.type === 'list') {
        return `<textarea class="op-cell-textarea" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="list" placeholder="One item per line">${esc(val)}</textarea>`;
    }
    if (f.type === 'ref' || f.type === 'ref_list') {
        return linkControl(f, val, state.sets || [], `class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="${f.type}"`);
    }
    if (['date', 'time', 'datetime'].includes(f.type)) {
        return `<input type="${f.type === 'datetime' ? 'datetime-local' : f.type}" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="${f.type}" value="${esc(val)}">`;
    }
    if (f.type === 'duration') {
        return `<input type="text" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="duration" value="${esc(val)}" placeholder="45m or 1:30:00" aria-label="${esc(f.label)}">`;
    }
    if (f.type === 'checklist') {
        const map = parseChecklistMap(entry.values?.[f.key]);
        const activeCount = Object.values(map).filter(v => Number(v) >= 1).length;
        return `<button type="button" class="op-btn sm" data-op-open-matrix="${fk}" data-op-owner="${eid}" title="Open tracker">${activeCount} tracked · Manage</button>`;
    }
    const placeholder = f.type === 'template' ? '@field or {{var.x}}' : f.type === 'font' ? 'Inter, sans-serif' : f.label;
    return `<input type="text" class="op-cell-input" data-op-entry="${eid}" data-op-key="${fk}" data-op-type="${esc(f.type)}" value="${esc(val)}" placeholder="${esc(placeholder)}">`;
}

function renderSlotsCell(setObj, entry) {
    if ((setObj.slotsCount || 0) === 0) {
        const active = setObj.activeEntry === entry.id;
        return `<button type="button" class="op-slot-btn${active ? ' active' : ''}" data-op-assign-slot="0" data-op-entry="${esc(entry.id)}">${active ? 'Active' : 'Activate'}</button>`;
    }
    const btns = [];
    for (let i = 0; i < setObj.slotsCount; i++) {
        const sNum = i + 1;
        const active = setObj.slots?.[i] === entry.id;
        const lbl = setObj.slotNames?.[i] ? esc(setObj.slotNames[i]) : `Slot ${sNum}`;
        btns.push(`<button type="button" class="op-slot-btn${active ? ' active' : ''}" data-op-assign-slot="${sNum}" data-op-entry="${esc(entry.id)}">${lbl}</button>`);
    }
    return `<div class="op-slots-wrap">${btns.join('')}</div>`;
}

function sortEntries(setObj, entries, sort) {
    if (!sort?.key || !sort?.dir) return entries;
    const dir = sort.dir === 'desc' ? -1 : 1;
    const def = getAllColumnDefs(setObj).find(d => d.key === sort.key);
    if (!def) return entries;
    return [...entries].sort((a, b) => {
        if (def.key === '__slot') {
            const sa = slotAssignmentsForEntry(setObj, a.id);
            const sb = slotAssignmentsForEntry(setObj, b.id);
            const va = sa.length ? sa[0] : 9999;
            const vb = sb.length ? sb[0] : 9999;
            return (va - vb) * dir;
        }
        if (def.key === '__flags') {
            const va = (a.enabled !== false ? 2 : 0) + (a.inGroup !== false ? 1 : 0);
            const vb = (b.enabled !== false ? 2 : 0) + (b.inGroup !== false ? 1 : 0);
            return (va - vb) * dir;
        }
        const rawA = a.values?.[def.key] ?? '';
        const rawB = b.values?.[def.key] ?? '';
        if (def.type === 'counter' || def.type === 'number') {
            return ((Number(rawA) || 0) - (Number(rawB) || 0)) * dir;
        }
        if (def.type === 'toggle') {
            return ((rawA === 'true' ? 1 : 0) - (rawB === 'true' ? 1 : 0)) * dir;
        }
        if (def.type === 'checklist') {
            const ca = Object.values(parseChecklistMap(rawA)).filter(v => Number(v) >= 1).length;
            const cb = Object.values(parseChecklistMap(rawB)).filter(v => Number(v) >= 1).length;
            return (ca - cb) * dir;
        }
        return String(rawA).localeCompare(String(rawB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
}

function renderColumnToolbar(setObj, viewCfg) {
    const layoutSelect = document.getElementById('op-layout-select');
    const delBtn = document.getElementById('op-del-layout');
    const colsPop = document.getElementById('op-cols-pop');
    const layouts = getSavedLayouts(setObj.id);
    if (layoutSelect) {
        layoutSelect.innerHTML = `<option value="">Default Layout</option>${layouts.map(l => `<option value="${esc(l.name)}"${l.name === activeLayoutName ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}`;
    }
    if (delBtn) delBtn.hidden = !activeLayoutName || !layouts.some(l => l.name === activeLayoutName);
    if (colsPop) {
        const defsMap = new Map(getAllColumnDefs(setObj).map(d => [d.key, d]));
        const itemsHtml = viewCfg.order.map((key, idx) => {
            const def = defsMap.get(key);
            if (!def) return '';
            const checked = viewCfg.visible.includes(key);
            return `<div class="op-col-item">
                <label><input type="checkbox" data-op-col-toggle="${esc(key)}" ${checked ? 'checked' : ''}><span>${esc(def.label)}</span></label>
                <span class="op-col-move">
                    <button type="button" data-op-col-move="up" data-op-col-key="${esc(key)}" ${idx === 0 ? 'disabled' : ''} title="Move left / up" aria-label="Move ${esc(def.label)} earlier">&uarr;</button>
                    <button type="button" data-op-col-move="down" data-op-col-key="${esc(key)}" ${idx === viewCfg.order.length - 1 ? 'disabled' : ''} title="Move right / down" aria-label="Move ${esc(def.label)} later">&darr;</button>
                </span>
            </div>`;
        }).join('');
        colsPop.innerHTML = `<div class="op-cols-head"><span>Columns &amp; Order</span><button type="button" class="op-btn sm" id="op-cols-reset">Reset</button></div><div class="op-cols-list">${itemsHtml}</div>`;
    }
}

function renderMatrixView(setObj, host) {
    const checklistFields = (setObj.fields || []).filter(f => f.type === 'checklist');
    const activeField = getMatrixField(setObj);
    if (!activeField) return;
    const targetSet = (state.sets || []).find(s => s.id === activeField.targetSet);
    const roster = setObj.roster || [];
    let colEntries = roster.filter(r => r.enabled !== false);
    if (filterMode === 'slotted') {
        colEntries = colEntries.filter(r => slotAssignmentsForEntry(setObj, r.id).length > 0);
    } else if (filterMode === 'group') {
        colEntries = colEntries.filter(r => r.inGroup !== false);
    } else if (filterMode === 'all' && !colEntries.length) {
        colEntries = roster;
    }

    const targetItems = (targetSet?.roster || []).filter(item => {
        if (!searchQuery) return true;
        return `${item.label || ''} ${item.id || ''}`.toLowerCase().includes(searchQuery);
    });

    const fieldPickerHtml = checklistFields.length > 1
        ? `<label style="display:inline-flex;align-items:center;gap:.4rem;"><span>Field:</span><select id="op-matrix-field" class="op-layout-select">${checklistFields.map(f => `<option value="${esc(f.key)}" ${f.key === activeField.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label>`
        : `<strong>${esc(activeField.label)}</strong>`;

    const barHtml = `<div class="op-matrix-bar">
        <div class="op-matrix-bar-left">
            ${fieldPickerHtml}
            <span>&rarr; ${targetSet ? `${esc(targetSet.name)} (${targetItems.length})` : `Missing target set: ${esc(activeField.targetSet || 'unset')}`}</span>
        </div>
        <div class="op-matrix-bar-left">
            <span>Click / Enter: next level · Right-click / Shift+Enter: previous · 0 = not started</span>
            <button type="button" class="op-btn sm danger" data-op-reset-all>Reset everyone</button>
        </div>
    </div>`;

    if (!targetSet) {
        host.innerHTML = `${barHtml}<div class="op-empty"><p>Target set "${esc(activeField.targetSet || 'unset')}" was not found. Check the field schema in <a href="/placeholders.html#sets" style="color:var(--accent);">Placeholders &amp; Variables</a>.</p></div>`;
        return;
    }
    if (!colEntries.length) {
        host.innerHTML = `${barHtml}<div class="op-empty"><p>No enabled items in this set to display as columns.</p></div>`;
        return;
    }
    if (!targetItems.length) {
        host.innerHTML = `${barHtml}<div class="op-empty"><p>${(targetSet.roster || []).length ? 'No target items match your search.' : `Target set "${esc(targetSet.name)}" has no items yet.`}</p></div>`;
        return;
    }

    const colHeads = colEntries.map(col => {
        const slots = slotAssignmentsForEntry(setObj, col.id);
        const slotTag = slots.length
            ? `<span class="op-matrix-slot-tag">${slots[0] === 0 ? 'Active' : `Slot ${slots.join(',')}`}</span>`
            : '';
        return `<th><div class="op-matrix-col-head"><span>${esc(col.label || col.id)}</span>${slotTag}<button type="button" class="op-btn sm" data-op-reset-entry="${esc(col.id)}" aria-label="Reset ${esc(col.label)}">Reset</button></div></th>`;
    }).join('');

    const rowsHtml = targetItems.map(item => {
        const maxTier = window.OverlayShared.trackerMax(activeField, item);
        const thumb = getEntryThumbUrl(targetSet, item);
        const rowLabel = `<div class="op-matrix-item">${thumb ? `<img src="${esc(thumb)}" alt="" class="op-thumb">` : ''}<span>${esc(item.label || item.id)}</span></div>`;
        const cells = colEntries.map(col => {
            const map = parseChecklistMap(col.values?.[activeField.key]);
            const level = Math.max(0, Math.min(maxTier, Number(map[item.id]) || 0));
            const title = `${item.label || item.id} — ${col.label || col.id}: ${maxTier > 1 ? `Lv.${level} / ${maxTier}` : (level >= 1 ? 'Active' : 'Inactive')}`;
            return `<td>
                <button type="button"
                    class="op-matrix-cell ${level >= 1 ? 'is-lit' : 'is-dim'}"
                    data-op-matrix-step="1"
                    data-op-entry="${esc(col.id)}"
                    data-op-field="${esc(activeField.key)}"
                    data-op-target="${esc(item.id)}"
                    title="${esc(title)}" aria-label="${esc(title)}">
                    ${item.tiers?.find(tier => tier.level === level)?.image ? `<img class="op-thumb" src="${esc(item.tiers.find(tier => tier.level === level).image)}" alt="">` : level >= 1 ? SVG_CHECK : SVG_DOT}
                    ${maxTier > 1 ? `<span class="op-tier-badge">${esc(item.tiers?.find(tier => tier.level === level)?.label || `Lv.${level}`)}</span>` : ''}
                </button>
            </td>`;
        }).join('');
        return `<tr><td>${rowLabel}</td>${cells}</tr>`;
    }).join('');

    host.innerHTML = `${barHtml}<table class="op-table op-matrix-table">
        <thead><tr><th>${esc(targetSet.name)}</th>${colHeads}</tr></thead>
        <tbody>${rowsHtml}</tbody>
    </table>`;
}

function renderOperator() {
    const select = document.getElementById('op-set-select');
    const stats = document.getElementById('op-stats');
    const host = document.getElementById('op-table-host');
    const rotBar = document.getElementById('op-rotation-bar');
    if (!select || !host) return;

    const sets = state.sets || [];
    if (!sets.length) {
        select.innerHTML = '<option value="">No variable sets</option>';
        select.disabled = true;
        if (stats) stats.textContent = '0 sets';
        if (rotBar) rotBar.hidden = true;
        host.innerHTML = '<div class="op-empty"><p>No Variable Sets exist yet. Create one in <a href="/placeholders.html#sets" style="color:var(--accent);">Placeholders &amp; Variables</a> first.</p></div>';
        return;
    }

    const setObj = getActiveSet();
    select.disabled = false;
    select.innerHTML = sets.map(s => `<option value="${esc(s.id)}"${s.id === setObj.id ? ' selected' : ''}>${esc(s.name)} (${(s.roster || []).length})</option>`).join('');

    const roster = setObj.roster || [];
    const fields = setObj.fields || [];
    const hasChecklist = fields.some(f => f.type === 'checklist');
    const viewMode = getViewMode(setObj);
    const viewSeg = document.getElementById('op-view-seg');
    if (viewSeg) {
        viewSeg.hidden = !hasChecklist;
        viewSeg.querySelectorAll('[data-op-view]').forEach(b => b.classList.toggle('active', b.dataset.opView === viewMode));
    }
    const viewCfg = getViewConfig(setObj);
    renderColumnToolbar(setObj, viewCfg);
    if (fields.some(f => f.type === 'icon')) window.IconPicker?.ensureFont?.();
    if (stats) {
        const baseStats = `${roster.length} items · ${fields.length} fields · ${setObj.slotsCount ? `${setObj.slotsCount} slots` : 'Preset mode'}`;
        const matrixOwner = !hasChecklist ? sets.find(s => s.id !== setObj.id && (s.fields || []).some(f => f.type === 'checklist' && f.targetSet === setObj.id)) : null;
        stats.innerHTML = matrixOwner
            ? `${esc(baseStats)} · <a href="#${encodeURIComponent(matrixOwner.id)}/matrix" style="color:var(--accent);text-decoration:none;font-weight:600;">Open ${esc(matrixOwner.name)} Matrix</a>`
            : esc(baseStats);
    }
    if (rotBar) rotBar.hidden = (setObj.slotsCount || 0) >= 2 || roster.filter(r => r.enabled !== false).length < 2;

    if (hasChecklist && viewMode === 'matrix') {
        renderMatrixView(setObj, host);
        return;
    }

    const visibleEntries = sortEntries(setObj, roster.filter(e => matchesFilter(setObj, e)), viewCfg.sort);
    if (!visibleEntries.length) {
        host.innerHTML = `<div class="op-empty"><p>${roster.length ? 'No items match the current filter.' : 'This Variable Set has no items yet.'}</p><button type="button" class="op-btn primary" id="op-empty-add">Add First Item</button></div>`;
        return;
    }

    const defsMap = new Map(getAllColumnDefs(setObj).map(d => [d.key, d]));
    const activeCols = viewCfg.order.filter(k => viewCfg.visible.includes(k)).map(k => defsMap.get(k)).filter(Boolean);

    const thHtml = activeCols.map(col => {
        const isSorted = viewCfg.sort?.key === col.key;
        const icon = isSorted ? (viewCfg.sort.dir === 'asc' ? SVG_SORT_ASC : SVG_SORT_DESC) : SVG_SORT_NONE;
        const typeSuffix = col.field ? ` <span style="opacity:.6;font-weight:500;">(${esc(col.type)})</span>` : '';
        return `<th><button type="button" class="op-sort-btn${isSorted ? ' active' : ''}" data-op-sort="${esc(col.key)}"><span>${esc(col.label)}${typeSuffix}</span>${icon}</button></th>`;
    }).join('') + '<th></th>';

    const rowsHtml = visibleEntries.map(entry => {
        const isSlotted = slotAssignmentsForEntry(setObj, entry.id).length > 0;
        const isDisabled = entry.enabled === false;
        const cellsHtml = activeCols.map(col => {
            if (col.key === '__slot') return `<td data-col-label="Live Slot">${renderSlotsCell(setObj, entry)}</td>`;
            if (col.key === '__flags') {
                return `<td data-col-label="Flags"><div class="op-switch-col">
                    <label class="op-check" title="Include in rotation"><input type="checkbox" data-op-flag="enabled" data-op-entry="${esc(entry.id)}" ${entry.enabled !== false ? 'checked' : ''}><span>Enabled</span></label>
                    <label class="op-check" title="Include in Group roster"><input type="checkbox" data-op-flag="inGroup" data-op-entry="${esc(entry.id)}" ${entry.inGroup !== false ? 'checked' : ''}><span>Group</span></label>
                </div></td>`;
            }
            return `<td data-col-label="${esc(col.label)}">${renderFieldCell(entry, col.field)}</td>`;
        }).join('');
        return `<tr class="${isSlotted ? 'is-slotted' : ''} ${isDisabled ? 'is-disabled' : ''}" data-op-row="${esc(entry.id)}">
            ${cellsHtml}
            <td data-col-label="Actions">
                <button type="button" class="op-btn sm danger" data-op-delete="${esc(entry.id)}" title="Remove item" aria-label="Remove item">${SVG_TRASH}</button>
            </td>
        </tr>`;
    }).join('');

    host.innerHTML = `<table class="op-table">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
    </table>`;
}

function persistRoster(setObj) {
    const roster = JSON.stringify(setObj.roster);
    setSaveBadge('Saving…');
    const saving = saveQueue.then(async () => {
        const res = await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}`, 'PUT', { roster: JSON.parse(roster) });
        if (res?.set) {
            const idx = state.sets.findIndex(s => s.id === res.set.id);
            if (idx >= 0 && JSON.stringify(state.sets[idx].roster) === roster) state.sets[idx] = res.set;
        }
        saveError = null;
        setSaveBadge('Saved');
    });
    saveQueue = saving.catch(err => {
        saveError = err;
        setSaveBadge('Save failed', true);
        toast(err.message, 'error');
    });
    return saveQueue;
}

function scheduleSave(setObj, immediate = false) {
    clearTimeout(saveTimer);
    if (pendingSave && pendingSave.id !== setObj.id) persistRoster(pendingSave);
    pendingSave = setObj;
    if (immediate) return flushSaves();
    saveTimer = setTimeout(() => flushSaves(), 280);
}

async function flushSaves() {
    clearTimeout(saveTimer);
    if (pendingSave) {
        const setObj = pendingSave;
        pendingSave = null;
        persistRoster(setObj);
    }
    await saveQueue;
}

async function loadData(preserveFocus = false) {
    const activeEl = preserveFocus ? document.activeElement : null;
    const focusEntry = activeEl?.dataset?.opEntry;
    const focusKey = activeEl?.dataset?.opKey;
    if (pendingSave || trackerBusy) return;
    await saveQueue;
    const data = await api('/api/variables');
    if (pendingSave || trackerBusy) return;
    state.sets = data.sets || [];
    state.variables = data.variables || [];
    if (focusEntry && focusKey) return; // Don't clobber active cell while user is typing
    renderOperator();
}

function bindEvents() {
    document.getElementById('op-set-select')?.addEventListener('change', e => {
        activeSetId = e.target.value;
        localStorage.setItem(STORAGE_KEY, activeSetId);
        const url = new URL(location.href);
        url.searchParams.delete('set');
        url.hash = activeSetId ? encodeURIComponent(activeSetId) : '';
        history.replaceState(null, '', url);
        renderOperator();
    });

    window.addEventListener('hashchange', () => {
        const next = getHashParts();
        if (next.id) {
            if (next.matrix) localStorage.setItem(`${VIEW_MODE_PREFIX}${next.id}`, 'matrix');
            if (next.id !== activeSetId || next.matrix) {
                activeSetId = next.id;
                localStorage.setItem(STORAGE_KEY, activeSetId);
                renderOperator();
            }
        }
    });

    document.getElementById('op-search')?.addEventListener('input', e => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderOperator();
    });

    document.getElementById('op-filter-seg')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-op-filter]');
        if (!btn) return;
        filterMode = btn.dataset.opFilter;
        document.querySelectorAll('.op-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderOperator();
    });

    document.getElementById('op-view-seg')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-op-view]');
        const setObj = getActiveSet();
        if (!btn || !setObj) return;
        setViewMode(setObj, btn.dataset.opView);
        renderOperator();
    });

    const addItem = async () => {
        const setObj = getActiveSet();
        if (!setObj) return;
        const fields = setObj.fields || [];
        const firstKey = fields[0]?.key || 'name';
        const nextNum = (setObj.roster?.length || 0) + 1;
        const values = {};
        for (const f of fields) {
            values[f.key] = f.key === firstKey ? `Item ${nextNum}` : (f.type === 'color' ? '#3b82f6' : f.type === 'toggle' ? 'false' : (f.type === 'counter' || f.type === 'number') ? '0' : '');
        }
        const entry = { id: slugId(`item_${nextNum}_${Date.now()}`), label: values[firstKey] || `Item ${nextNum}`, enabled: true, inGroup: true, values };
        setObj.roster = [...(setObj.roster || []), entry];
        renderOperator();
        await persistRoster(setObj);
        document.querySelector(`[data-op-entry="${CSS.escape(entry.id)}"][data-op-key="${CSS.escape(firstKey)}"]`)?.focus();
    };

    document.getElementById('op-add-entry')?.addEventListener('click', addItem);

    const stepRotation = async dir => {
        const setObj = getActiveSet();
        if (!setObj) return;
        try {
            await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}/rotation/${dir < 0 ? 'prev' : 'next'}`, 'POST', {});
            await loadData(false);
        } catch (err) {
            toast(err.message, 'error');
        }
    };
    document.getElementById('op-rot-prev')?.addEventListener('click', () => stepRotation(-1));
    document.getElementById('op-rot-next')?.addEventListener('click', () => stepRotation(1));

    const colsBtn = document.getElementById('op-cols-btn');
    const colsPop = document.getElementById('op-cols-pop');
    colsBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (!colsPop) return;
        const next = !colsPop.hidden;
        colsPop.hidden = next;
        colsBtn.setAttribute('aria-expanded', String(!next));
    });
    document.addEventListener('click', e => {
        if (colsPop && !colsPop.hidden && !e.target.closest('.op-cols-wrap')) {
            colsPop.hidden = true;
            colsBtn?.setAttribute('aria-expanded', 'false');
        }
    });
    colsPop?.addEventListener('change', e => {
        const key = e.target.dataset?.opColToggle;
        if (!key) return;
        const setObj = getActiveSet();
        if (!setObj) return;
        const cfg = getViewConfig(setObj);
        const nextVisible = e.target.checked
            ? [...new Set([...cfg.visible, key])]
            : cfg.visible.filter(k => k !== key);
        if (!nextVisible.length) {
            e.target.checked = true;
            return;
        }
        cfg.visible = nextVisible;
        saveViewConfig(setObj, cfg, '');
        renderOperator();
    });
    colsPop?.addEventListener('click', e => {
        const setObj = getActiveSet();
        if (!setObj) return;
        if (e.target.id === 'op-cols-reset') {
            const allKeys = getAllColumnDefs(setObj).map(d => d.key);
            saveViewConfig(setObj, { order: allKeys, visible: allKeys, sort: { key: '', dir: '' } }, '');
            renderOperator();
            return;
        }
        const mv = e.target.closest('[data-op-col-move]');
        if (mv) {
            const key = mv.dataset.opColKey;
            const cfg = getViewConfig(setObj);
            const idx = cfg.order.indexOf(key);
            const swap = idx + (mv.dataset.opColMove === 'up' ? -1 : 1);
            if (idx >= 0 && swap >= 0 && swap < cfg.order.length) {
                [cfg.order[idx], cfg.order[swap]] = [cfg.order[swap], cfg.order[idx]];
                saveViewConfig(setObj, cfg, '');
                renderOperator();
            }
        }
    });

    document.getElementById('op-layout-select')?.addEventListener('change', e => {
        const setObj = getActiveSet();
        if (!setObj) return;
        const name = e.target.value;
        if (!name) {
            const allKeys = getAllColumnDefs(setObj).map(d => d.key);
            saveViewConfig(setObj, { order: allKeys, visible: allKeys, sort: { key: '', dir: '' } }, '');
            renderOperator();
            return;
        }
        const found = getSavedLayouts(setObj.id).find(l => l.name === name);
        if (found) {
            saveViewConfig(setObj, { order: found.order, visible: found.visible, sort: found.sort || { key: '', dir: '' } }, found.name);
            renderOperator();
        }
    });
    document.getElementById('op-save-layout')?.addEventListener('click', () => {
        const setObj = getActiveSet();
        if (!setObj) return;
        const name = window.prompt('Save column layout as:', activeLayoutName || `${setObj.name} View`);
        const clean = String(name || '').trim().slice(0, 40);
        if (!clean) return;
        const cfg = getViewConfig(setObj);
        const list = getSavedLayouts(setObj.id).filter(l => l.name !== clean);
        list.push({ name: clean, order: cfg.order, visible: cfg.visible, sort: cfg.sort });
        setSavedLayouts(setObj.id, list);
        saveViewConfig(setObj, cfg, clean);
        renderOperator();
        toast(`Saved layout "${clean}"`, 'success');
    });
    document.getElementById('op-del-layout')?.addEventListener('click', () => {
        const setObj = getActiveSet();
        if (!setObj || !activeLayoutName) return;
        const list = getSavedLayouts(setObj.id).filter(l => l.name !== activeLayoutName);
        setSavedLayouts(setObj.id, list);
        const allKeys = getAllColumnDefs(setObj).map(d => d.key);
        saveViewConfig(setObj, { order: allKeys, visible: allKeys, sort: { key: '', dir: '' } }, '');
        renderOperator();
    });

    const host = document.getElementById('op-table-host');
    if (!host) return;
    bindLinkControls(host);

    host.addEventListener('input', e => {
        const t = e.target;
        const setObj = getActiveSet();
        if (!setObj) return;

        if (t.dataset.opSwatch) {
            const input = host.querySelector(`[data-op-entry="${CSS.escape(t.dataset.opSwatch)}"][data-op-key="${CSS.escape(t.dataset.opKey)}"]`);
            if (input) input.value = t.value;
            const entry = setObj.roster.find(r => r.id === t.dataset.opSwatch);
            if (entry) {
                entry.values = { ...(entry.values || {}), [t.dataset.opKey]: t.dataset.opType === 'ref_list' ? JSON.parse(t.value) : t.value };
                scheduleSave(setObj, false);
            }
            return;
        }
        if (t.dataset.opEntry && t.dataset.opKey && t.dataset.opType !== 'toggle') {
            const entry = setObj.roster.find(r => r.id === t.dataset.opEntry);
            if (!entry) return;
            entry.values = { ...(entry.values || {}), [t.dataset.opKey]: t.dataset.opType === 'ref_list' ? JSON.parse(t.value) : t.value };
            if (t.dataset.opKey === (setObj.fields?.[0]?.key || 'name')) {
                entry.label = String(t.value || entry.label).trim() || entry.label;
            }
            scheduleSave(setObj, false);
        }
    });

    host.addEventListener('change', e => {
        const t = e.target;
        const setObj = getActiveSet();
        if (!setObj || trackerBusy) return;
        if (t.id === 'op-matrix-field') {
            setMatrixField(setObj, t.value);
            renderOperator();
            return;
        }
        const entry = t.dataset.opEntry ? setObj.roster.find(r => r.id === t.dataset.opEntry) : null;
        if (!entry) return;

        if (t.dataset.opType === 'toggle') {
            entry.values = { ...(entry.values || {}), [t.dataset.opKey]: t.checked ? 'true' : 'false' };
            const span = t.closest('label')?.querySelector('span');
            if (span) span.textContent = t.checked ? 'On' : 'Off';
            scheduleSave(setObj, true);
        } else if (t.dataset.opFlag) {
            entry[t.dataset.opFlag] = t.checked;
            renderOperator();
            scheduleSave(setObj, true);
        } else if (t.dataset.opKey) {
            entry.values = { ...(entry.values || {}), [t.dataset.opKey]: t.dataset.opType === 'ref_list' ? JSON.parse(t.value) : t.value };
            scheduleSave(setObj, true);
        }
    });

    const stepMatrixCell = async (btn, delta = null) => {
        const setObj = getActiveSet();
        if (!setObj || trackerBusy) return;
        const entry = btn.dataset.opEntry;
        const field = btn.dataset.opField;
        const target = btn.dataset.opTarget;
        const body = delta === null ? { entry, field, target } : { entry, field, target, delta };
        setSaveBadge('Saving…');
        trackerBusy = true;
        try {
            await flushSaves();
            if (saveError) throw saveError;
            const res = await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}/checklist/step`, 'POST', body);
            const updated = res?.set || (res?.id ? res : null);
            if (updated) {
                const idx = state.sets.findIndex(s => s.id === updated.id);
                if (idx >= 0) state.sets[idx] = updated;
            }
            setSaveBadge('Saved');
            renderOperator();
        } catch (err) {
            setSaveBadge('Save failed', true);
            toast(err.message, 'error');
        } finally {
            trackerBusy = false;
        }
    };

    host.addEventListener('keydown', e => {
        const btn = e.target.closest('[data-op-matrix-step]');
        if (btn && e.shiftKey && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            stepMatrixCell(btn, -1);
        }
    });
    host.addEventListener('contextmenu', e => {
        const matrixBtn = e.target.closest('[data-op-matrix-step]');
        if (!matrixBtn) return;
        e.preventDefault();
        stepMatrixCell(matrixBtn, -1);
    });

    host.addEventListener('click', async e => {
        const t = e.target;
        if (t.id === 'op-empty-add') { await addItem(); return; }

        const setObj = getActiveSet();
        if (!setObj) return;
        const reset = t.closest('[data-op-reset-entry], [data-op-reset-all]');
        if (reset) {
            if (trackerBusy) return;
            const field = getMatrixField(setObj);
            const entry = reset.dataset.opResetEntry;
            const owner = setObj.roster.find(item => item.id === entry);
            if (!window.confirm(`Reset ${field.label} for ${owner ? owner.label : 'everyone (including hidden entries)'}? This clears current progress.`)) return;
            trackerBusy = true;
            try {
                await flushSaves();
                if (saveError) throw saveError;
                await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}/checklist/reset`, 'POST', { field: field.key, ...(entry ? { entry } : { all: true }) });
                trackerBusy = false;
                await loadData();
                setSaveBadge('Saved');
            } catch (err) {
                toast(err.message, 'error');
            } finally { trackerBusy = false; }
            return;
        }

        const openMatrixBtn = t.closest('[data-op-open-matrix]');
        if (openMatrixBtn) {
            setMatrixField(setObj, openMatrixBtn.dataset.opOpenMatrix);
            setViewMode(setObj, 'matrix');
            renderOperator();
            host.querySelector(`[data-op-matrix-step][data-op-entry="${CSS.escape(openMatrixBtn.dataset.opOwner)}"]`)?.focus();
            return;
        }

        const matrixBtn = t.closest('[data-op-matrix-step]');
        if (matrixBtn) {
            await stepMatrixCell(matrixBtn, null);
            return;
        }

        const sortBtn = t.closest('[data-op-sort]');
        if (sortBtn) {
            const key = sortBtn.dataset.opSort;
            const cfg = getViewConfig(setObj);
            const nextDir = cfg.sort?.key === key ? (cfg.sort.dir === 'asc' ? 'desc' : '') : 'asc';
            cfg.sort = nextDir ? { key, dir: nextDir } : { key: '', dir: '' };
            saveViewConfig(setObj, cfg, activeLayoutName);
            renderOperator();
            return;
        }

        const stepBtn = t.closest('[data-op-step]');
        if (stepBtn) {
            const entryId = stepBtn.dataset.opStep;
            const key = stepBtn.dataset.opKey;
            const delta = Number(stepBtn.dataset.opDelta) || 0;
            const entry = setObj.roster.find(r => r.id === entryId);
            if (!entry) return;
            const next = String((Number(entry.values?.[key]) || 0) + delta);
            entry.values = { ...(entry.values || {}), [key]: next };
            const input = host.querySelector(`[data-op-entry="${CSS.escape(entryId)}"][data-op-key="${CSS.escape(key)}"]`);
            if (input) input.value = next;
            await persistRoster(setObj);
            return;
        }

        const pickImg = t.closest('[data-op-pick-img]');
        if (pickImg) {
            const entryId = pickImg.dataset.opPickImg;
            const key = pickImg.dataset.opKey;
            const input = host.querySelector(`[data-op-entry="${CSS.escape(entryId)}"][data-op-key="${CSS.escape(key)}"]`);
            pickImage(input?.value || '', async url => {
                const entry = setObj.roster.find(r => r.id === entryId);
                if (!entry) return;
                entry.values = { ...(entry.values || {}), [key]: url || '' };
                renderOperator();
                await persistRoster(setObj);
            });
            return;
        }

        const pickIcon = t.closest('[data-op-pick-icon]');
        if (pickIcon) {
            const entryId = pickIcon.dataset.opPickIcon;
            const key = pickIcon.dataset.opKey;
            const input = host.querySelector(`[data-op-entry="${CSS.escape(entryId)}"][data-op-key="${CSS.escape(key)}"]`);
            window.IconPicker?.open?.({
                value: input?.value || '',
                onPick: async cls => {
                    const entry = setObj.roster.find(r => r.id === entryId);
                    if (!entry) return;
                    entry.values = { ...(entry.values || {}), [key]: cls || '' };
                    renderOperator();
                    await persistRoster(setObj);
                }
            });
            return;
        }

        const slotBtn = t.closest('[data-op-assign-slot]');
        if (slotBtn) {
            const slot = Number(slotBtn.dataset.opAssignSlot) || 0;
            const entryId = slotBtn.dataset.opEntry;
            try {
                await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}/assign`, 'POST', { slot, entry: entryId });
                await loadData(false);
            } catch (err) {
                toast(err.message, 'error');
            }
            return;
        }

        const delBtn = t.closest('[data-op-delete]');
        if (delBtn) {
            const entryId = delBtn.dataset.opDelete;
            setObj.roster = (setObj.roster || []).filter(r => r.id !== entryId);
            renderOperator();
            await persistRoster(setObj);
        }
    });
}

bindEvents();
loadData(false).catch(err => toast(err.message, 'error'));
connectLiveSocket({
    onMessage: msg => {
        if (msg.type === 'variables' || msg.type === 'variables-update' || msg.type === 'status') loadData(true);
    }
});
