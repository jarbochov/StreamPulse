// Dedicated live operator console for inline-editing all items and fields of a Variable Set
import { connectLiveSocket } from '../shared/client-core.js';
import { api, esc, pickImage, slugId, state, toast } from './variables-state.js';

const STORAGE_KEY = 'streampulse_operator_set';
const LAYOUTS_PREFIX = 'streampulse_operator_layouts_';
const VIEW_PREFIX = 'streampulse_operator_view_';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const SVG_SORT_NONE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
const SVG_SORT_ASC = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>';
const SVG_SORT_DESC = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';

function getSetIdFromUrl() {
    const rawHash = (location.hash || '').replace(/^#/, '').trim();
    if (rawHash) {
        if (rawHash.startsWith('set=')) return decodeURIComponent(rawHash.slice(4));
        return decodeURIComponent(rawHash);
    }
    return new URLSearchParams(location.search).get('set') || '';
}

let activeSetId = getSetIdFromUrl() || localStorage.getItem(STORAGE_KEY) || '';
let searchQuery = '';
let filterMode = 'all';
let saveTimer = null;
let saveBadgeTimer = null;
let activeLayoutName = '';

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
    const viewCfg = getViewConfig(setObj);
    renderColumnToolbar(setObj, viewCfg);
    if (fields.some(f => f.type === 'icon')) window.IconPicker?.ensureFont?.();
    if (stats) stats.textContent = `${roster.length} items · ${fields.length} fields · ${setObj.slotsCount ? `${setObj.slotsCount} slots` : 'Preset mode'}`;
    if (rotBar) rotBar.hidden = (setObj.slotsCount || 0) >= 2 || roster.filter(r => r.enabled !== false).length < 2;

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

async function persistRoster(setObj) {
    setSaveBadge('Saving…');
    try {
        const res = await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}`, 'PUT', { roster: setObj.roster });
        if (res?.set) {
            const idx = state.sets.findIndex(s => s.id === res.set.id);
            if (idx >= 0) state.sets[idx] = res.set;
        }
        setSaveBadge('Saved');
    } catch (err) {
        setSaveBadge('Save failed', true);
        toast(err.message, 'error');
    }
}

function scheduleSave(setObj, immediate = false) {
    clearTimeout(saveTimer);
    if (immediate) return persistRoster(setObj);
    saveTimer = setTimeout(() => persistRoster(setObj), 280);
}

async function loadData(preserveFocus = false) {
    const activeEl = preserveFocus ? document.activeElement : null;
    const focusEntry = activeEl?.dataset?.opEntry;
    const focusKey = activeEl?.dataset?.opKey;
    const data = await api('/api/variables');
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
        const nextId = getSetIdFromUrl();
        if (nextId && nextId !== activeSetId) {
            activeSetId = nextId;
            localStorage.setItem(STORAGE_KEY, activeSetId);
            renderOperator();
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
            await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}/rotate`, 'POST', { dir });
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

    host.addEventListener('input', e => {
        const t = e.target;
        const setObj = getActiveSet();
        if (!setObj) return;

        if (t.dataset.opSwatch) {
            const input = host.querySelector(`[data-op-entry="${CSS.escape(t.dataset.opSwatch)}"][data-op-key="${CSS.escape(t.dataset.opKey)}"]`);
            if (input) input.value = t.value;
            const entry = setObj.roster.find(r => r.id === t.dataset.opSwatch);
            if (entry) {
                entry.values = { ...(entry.values || {}), [t.dataset.opKey]: t.value };
                scheduleSave(setObj, false);
            }
            return;
        }
        if (t.dataset.opEntry && t.dataset.opKey && t.dataset.opType !== 'toggle') {
            const entry = setObj.roster.find(r => r.id === t.dataset.opEntry);
            if (!entry) return;
            entry.values = { ...(entry.values || {}), [t.dataset.opKey]: t.value };
            if (t.dataset.opKey === (setObj.fields?.[0]?.key || 'name')) {
                entry.label = String(t.value || entry.label).trim() || entry.label;
            }
            scheduleSave(setObj, false);
        }
    });

    host.addEventListener('change', e => {
        const t = e.target;
        const setObj = getActiveSet();
        if (!setObj) return;
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
            scheduleSave(setObj, true);
        }
    });

    host.addEventListener('click', async e => {
        const t = e.target;
        if (t.id === 'op-empty-add') { await addItem(); return; }

        const setObj = getActiveSet();
        if (!setObj) return;

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
        if (msg.type === 'variables' || msg.type === 'status') loadData(true);
    }
});
