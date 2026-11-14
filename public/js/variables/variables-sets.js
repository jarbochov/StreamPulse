// Variable Sets & Output Slots UI (supports 0-slot preset mode and 1-N multi-slot output channels)

import { api, esc, pickImage, slugId, state, toast } from './variables-state.js';

const SVG_PLUS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const SVG_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const SVG_PREV = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const SVG_NEXT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const SVG_CLEAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_IMAGE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
const SVG_GRIP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>';

let dragPayload = null;
let reloadHandler = async () => {};
let rosterFilter = '';

function getEntryThumb(setObj, entry) {
    const imgField = (setObj.fields || []).find(f => f.type === 'image');
    const url = imgField ? entry?.values?.[imgField.key] : '';
    if (url) return `<img src="${esc(url)}" alt="" class="set-thumb">`;
    return `<div class="set-thumb-placeholder">${SVG_IMAGE}</div>`;
}

function getEntrySummary(setObj, entry) {
    return (setObj.fields || [])
        .filter(f => f.type !== 'image')
        .slice(1, 3)
        .map(f => entry?.values?.[f.key])
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
    const aliasNote = slotNum === 1
        ? `<div class="muted" style="font-size:.72rem;">Slot 1 alias: <code class="copyable" data-copy="{{var.${esc(setObj.id)}_${esc(setObj.fields?.[0]?.key || 'name')}}}">{{var.${esc(setObj.id)}_${esc(setObj.fields?.[0]?.key || 'name')}}}</code></div>`
        : '';
    const subFields = entry ? getEntrySummary(setObj, entry) : '';

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
                    <button type="button" class="b sm" data-set-act="next" data-slot="${slotNum}" title="Next entry">${SVG_NEXT}</button>
                    <button type="button" class="b sm" data-set-act="clear" data-slot="${slotNum}" title="Clear slot" ${entry ? '' : 'disabled'}>${SVG_CLEAR}</button>
                </div>
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
                <div class="slot-empty-hint">Drop an entry here or click Next</div>
            `}
            ${aliasNote}
            <details class="slot-tokens">
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

    return `
        <div class="slot-card ${entry ? 'filled' : 'empty'}">
            <div class="slot-head">
                <span class="badge">${entry ? 'Active Output' : 'No Active Entry'}</span>
                <div class="slot-actions">
                    <button type="button" class="b sm" data-set-act="prev" data-slot="1" title="Previous entry">${SVG_PREV}</button>
                    <button type="button" class="b sm" data-set-act="next" data-slot="1" title="Next entry">${SVG_NEXT}</button>
                    <button type="button" class="b sm" data-set-act="clear" data-slot="1" title="Clear active output" ${entry ? '' : 'disabled'}>${SVG_CLEAR}</button>
                </div>
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
                <div class="slot-empty-hint">Click Activate on any entry below to push its values live</div>
            `}
            <details class="slot-tokens">
                <summary>Output Tokens (${(setObj.fields || []).length})</summary>
                <div class="token-pills">${tokens}</div>
            </details>
        </div>
    `;
}

function renderRosterItem(setObj, entry) {
    const slotsCount = setObj.slotsCount || 0;
    const isLive = slotsCount === 0
        ? setObj.activeEntry === entry.id
        : (setObj.slots || []).includes(entry.id);

    let assignControl = '';
    if (slotsCount === 0) {
        assignControl = `<button type="button" class="b sm ${isLive ? 'primary' : ''}" data-set-act="assign" data-slot="1" data-entry="${esc(entry.id)}">${isLive ? 'Live' : 'Activate'}</button>`;
    } else if (slotsCount <= 4) {
        assignControl = Array.from({ length: slotsCount }, (_, idx) => {
            const s = idx + 1;
            const isOn = setObj.slots?.[idx] === entry.id;
            return `<button type="button" class="b sm ${isOn ? 'primary' : ''}" data-set-act="assign" data-slot="${s}" data-entry="${esc(entry.id)}" title="Assign to Slot ${s}">S${s}</button>`;
        }).join('');
    } else {
        const options = Array.from({ length: slotsCount }, (_, idx) => {
            const s = idx + 1;
            const isOn = setObj.slots?.[idx] === entry.id;
            return `<option value="${s}">${isOn ? `Slot ${s} (Live)` : `Slot ${s}`}</option>`;
        }).join('');
        assignControl = `
            <select class="b sm" data-set-assign-select="${esc(entry.id)}" aria-label="Assign to slot">
                <option value="">Assign slot...</option>
                ${options}
            </select>
        `;
    }

    const summary = getEntrySummary(setObj, entry);

    return `
        <div class="roster-item ${isLive ? 'is-live' : ''}"
             ${slotsCount > 0 ? 'draggable="true"' : ''}
             data-set="${esc(setObj.id)}"
             data-entry="${esc(entry.id)}">
            ${slotsCount > 0 ? `<span class="roster-grip" title="Drag onto a slot">${SVG_GRIP}</span>` : ''}
            ${getEntryThumb(setObj, entry)}
            <div class="roster-meta">
                <div class="roster-name">${esc(entry.label)}</div>
                <div class="roster-sub">${esc(summary || entry.id)}</div>
            </div>
            <div class="roster-controls">
                ${assignControl}
                <button type="button" class="b sm" data-set-act="edit-entry" data-entry="${esc(entry.id)}" title="Edit entry">${SVG_EDIT}</button>
                <button type="button" class="b sm danger" data-set-act="delete-entry" data-entry="${esc(entry.id)}" title="Remove entry">${SVG_TRASH}</button>
            </div>
        </div>
    `;
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

    const switcherHtml = `
        <div class="set-switcher" role="tablist" aria-label="Variable Sets">
            ${sets.map(s => `
                <button type="button" class="set-pill ${s.id === activeSet.id ? 'active' : ''}" data-select-set="${esc(s.id)}">
                    <span>${esc(s.name)}</span>
                    <span class="badge">${s.slotsCount ? `${s.slotsCount}s` : 'Preset'}</span>
                </button>
            `).join('')}
        </div>
    `;

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
        ${switcherHtml}
        <div class="set-workspace" data-set-card="${esc(activeSet.id)}">
            <div class="set-card-head">
                <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
                    <strong style="font-size:1.02rem;">${esc(activeSet.name)}</strong>
                    <code class="badge">${esc(activeSet.id)}</code>
                    <span class="badge">${slotBadge}</span>
                    <span class="badge">${(activeSet.roster || []).length} entries</span>
                </div>
                <div style="display:flex; gap:.35rem; flex-wrap:wrap;">
                    <button type="button" class="b sm primary" data-set-act="add-entry">${SVG_PLUS} Add Entry</button>
                    <button type="button" class="b sm" data-set-act="inc-slot" title="Add an output slot">+ Slot</button>
                    ${slotsCount > 0 ? '<button type="button" class="b sm" data-set-act="dec-slot" title="Remove last output slot">- Slot</button>' : ''}
                    <button type="button" class="b sm" data-set-act="edit-set">${SVG_EDIT} Edit Set</button>
                    <button type="button" class="b sm danger" data-set-act="delete-set" title="Delete set">${SVG_TRASH}</button>
                </div>
            </div>
            <div>
                <div class="set-section-title">
                    <span>${slotsCount > 0 ? 'Output Channels (drag entries onto slots or swap)' : 'Active Output'}</span>
                </div>
                ${outputHtml}
            </div>
            <div class="roster-section">
                <div class="set-section-title" style="flex-wrap:wrap;">
                    <span>${slotsCount > 0 ? 'Roster Pool' : 'Saved Presets'}</span>
                    <div style="display:flex; gap:.35rem; align-items:center; text-transform:none; letter-spacing:0; font-weight:500;">
                        ${(activeSet.roster || []).length > 4 ? `<input type="search" id="set-roster-filter" value="${esc(rosterFilter)}" placeholder="Filter entries..." style="padding:.22rem .55rem; font-size:.78rem; width:11rem;">` : ''}
                        <a class="b sm" href="/api/variables/sets/${encodeURIComponent(activeSet.id)}/export?format=csv" download="${esc(activeSet.id)}-roster.csv" style="text-decoration:none;">Export CSV</a>
                        <label class="b sm" style="display:inline-flex; align-items:center; cursor:pointer;">Import CSV<input type="file" data-set-csv-import accept=".csv,text/csv" hidden></label>
                    </div>
                </div>
                <div class="roster-list">${rosterHtml}</div>
            </div>
        </div>
    `;
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

    const renderFieldRows = host => {
        host.innerHTML = fields.map((f, idx) => `
            <div class="vp-field-row" data-f-idx="${idx}">
                <input type="text" data-f-prop="label" value="${esc(f.label)}" placeholder="Label (e.g. Name)">
                <input type="text" data-f-prop="key" value="${esc(f.key)}" placeholder="key (e.g. name)">
                <select data-f-prop="type">
                    <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="image" ${f.type === 'image' ? 'selected' : ''}>Image</option>
                    <option value="color" ${f.type === 'color' ? 'selected' : ''}>Color</option>
                    <option value="toggle" ${f.type === 'toggle' ? 'selected' : ''}>Toggle</option>
                </select>
                <button type="button" class="b sm danger" data-f-remove="${idx}" ${fields.length <= 1 ? 'disabled' : ''}>${SVG_TRASH}</button>
            </div>
        `).join('');
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
                    <span class="muted" style="font-weight:600;">Fields Schema</span>
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
        });

        fieldsHost.addEventListener('click', e => {
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
                fields: fields.map(f => ({ key: slugId(f.key) || 'field', label: f.label.trim() || f.key, type: f.type })),
                roster: existing?.roster || [],
                slots: existing?.slots || [],
                activeEntry: existing?.activeEntry || ''
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
    const values = { ...(existingEntry?.values || {}) };
    const fieldsHtml = (setObj.fields || []).map(f => {
        const val = values[f.key] ?? (f.type === 'color' ? '#3b82f6' : f.type === 'toggle' ? 'false' : '');
        if (f.type === 'image') {
            return `
                <label>${esc(f.label)} <span class="muted">(${esc(f.key)})</span>
                    <div class="vp-img-row">
                        <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="https://... or /assets/...">
                        <button type="button" class="b sm" data-entry-pick="${esc(f.key)}">Asset Library</button>
                    </div>
                </label>
            `;
        }
        if (f.type === 'color') {
            return `
                <label>${esc(f.label)} <span class="muted">(${esc(f.key)})</span>
                    <div class="vp-img-row">
                        <input type="color" data-entry-color="${esc(f.key)}" value="${esc(/^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : '#3b82f6')}">
                        <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="#3b82f6">
                    </div>
                </label>
            `;
        }
        if (f.type === 'toggle') {
            return `
                <label class="vp-check">
                    <input type="checkbox" data-entry-toggle="${esc(f.key)}" ${val === 'true' ? 'checked' : ''}>
                    <span>${esc(f.label)} (${esc(f.key)})</span>
                </label>
            `;
        }
        return `
            <label>${esc(f.label)} <span class="muted">(${esc(f.key)})</span>
                <input type="text" data-entry-field="${esc(f.key)}" value="${esc(val)}" placeholder="${esc(f.label)}">
            </label>
        `;
    }).join('');

    showModal(isEdit ? `Edit Entry: ${existingEntry.label}` : `Add Entry to ${setObj.name}`, `
        <form id="vp-entry-form" class="vp-form">
            ${fieldsHtml}
        </form>
    `, `
        <button type="button" class="b" data-vp-close>Cancel</button>
        <button type="submit" form="vp-entry-form" class="b primary">${isEdit ? 'Save Entry' : 'Add Entry'}</button>
    `, (modal, close) => {
        modal.querySelectorAll('[data-entry-pick]').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.entryPick;
                const input = modal.querySelector(`[data-entry-field="${CSS.escape(key)}"]`);
                pickImage(input.value, url => { input.value = url || ''; });
            };
        });
        modal.querySelectorAll('[data-entry-color]').forEach(picker => {
            picker.addEventListener('input', () => {
                const text = modal.querySelector(`[data-entry-field="${CSS.escape(picker.dataset.entryColor)}"]`);
                if (text) text.value = picker.value;
            });
        });
        modal.querySelector('#vp-entry-form').onsubmit = async e => {
            e.preventDefault();
            const nextValues = {};
            for (const f of setObj.fields || []) {
                if (f.type === 'toggle') {
                    nextValues[f.key] = modal.querySelector(`[data-entry-toggle="${CSS.escape(f.key)}"]`).checked ? 'true' : 'false';
                } else {
                    nextValues[f.key] = modal.querySelector(`[data-entry-field="${CSS.escape(f.key)}"]`).value;
                }
            }
            const firstKey = setObj.fields?.[0]?.key || 'name';
            const label = String(nextValues[firstKey] || existingEntry?.label || `Entry ${(setObj.roster?.length || 0) + 1}`).trim();
            const roster = [...(setObj.roster || [])];
            if (isEdit) {
                const idx = roster.findIndex(r => r.id === existingEntry.id);
                if (idx >= 0) roster[idx] = { ...roster[idx], label, values: nextValues };
            } else {
                roster.push({ id: slugId(label) || `entry_${Date.now()}`, label, values: nextValues });
            }
            try {
                await api(`/api/variables/sets/${encodeURIComponent(setObj.id)}`, 'PUT', { roster });
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
        if (e.target.id === 'set-roster-filter') {
            rosterFilter = e.target.value;
            const pos = e.target.selectionStart;
            renderSets();
            const nextInput = document.getElementById('set-roster-filter');
            if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(pos, pos); }
        }
    });

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
        const pill = e.target.closest('[data-select-set]');
        if (pill) {
            localStorage.setItem('variables_active_set', pill.dataset.selectSet);
            renderSets();
            return;
        }
        if (e.target.closest('#set-new-empty')) return openSetModal();

        const btn = e.target.closest('[data-set-act]');
        const card = e.target.closest('[data-set-card]');
        if (!btn || !card) return;
        const setObj = (state.variableSets || []).find(s => s.id === card.dataset.setCard);
        if (!setObj) return;
        const act = btn.dataset.setAct;
        const base = `/api/variables/sets/${encodeURIComponent(setObj.id)}`;

        try {
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
            if (act === 'delete-entry') {
                const roster = (setObj.roster || []).filter(r => r.id !== btn.dataset.entry);
                await api(base, 'PUT', { roster });
                toast('Entry removed', 'info');
                return await reloadHandler();
            }
            if (act === 'delete-set') {
                const ok = window.StreamPulse?.confirm
                    ? await StreamPulse.confirm('Delete Variable Set', `Delete set "${setObj.name}" and all of its output variables?`, { danger: true, confirmText: 'Delete' })
                    : confirm(`Delete set "${setObj.name}"?`);
                if (!ok) return;
                await api(base, 'DELETE');
                toast(`Set "${setObj.name}" deleted`, 'info');
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
        const slotEl = e.target.closest('.slot-card[data-slot]');
        if (!slotEl || !dragPayload || dragPayload.setId !== slotEl.dataset.set) return;
        e.preventDefault();
        slotEl.classList.add('drag-over');
    });

    host.addEventListener('dragleave', e => {
        const slotEl = e.target.closest('.slot-card[data-slot]');
        if (slotEl && !slotEl.contains(e.relatedTarget)) slotEl.classList.remove('drag-over');
    });

    host.addEventListener('drop', async e => {
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
