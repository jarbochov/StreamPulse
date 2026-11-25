import { displaySourceFields, displaySourceSummary, updateDisplaySource } from './display-source.js';
import { createTableDesigner, defaultTable, tableFieldOptions } from './table-designer.js';
import { createBadgeDesigner } from './badge-designer.js';
import { createCounterDesigner, defaultCounter } from './counter-designer.js';
import { defaultImageGroupConfig } from './badge-model.js';
import { badgeVisualControls, bindBadgeControls, pickBadgeAsset, uploadBadgeAsset } from './badge-controls.js';
import { setDisplayFormContext, refreshBoundDisplayNumbers } from './display-form.js';

const $ = selector => document.querySelector(selector);
const libraryView = $('#display-library');
const builderView = $('#display-builder');
const alertBox = $('#display-alert');
const PREVIEW_KEY = 'streampulse:display-library:preview';
const defaults = () => ({
    id: '', name: 'Inventory display', kind: 'inventory', catalogId: '', imageField: 'image', labelField: 'name',
    layout: { mode: 'flow', columns: 6, cellWidth: 80, cellHeight: 92, gap: 8, sectionGap: 16 },
    style: {
        background: '#10182700', cellBackground: '#182338cc', color: '#eef4ff', borderColor: '#ffffff22',
        borderWidth: 1, radius: 8, padding: 12, fontSize: 12, fontFamily: 'sans-serif',
        inactiveOpacity: 0.3, showLabels: true, showLevels: false, showOwner: false, showSectionTitles: true
    },
    sections: [{ id: 'section_1', title: '', items: [] }]
});
const state = {
    displays: [], sets: [], variables: [], draft: null, baseline: '', previewBinding: null,
    previewBackdrop: '#111827', previewResolution: 'native', dragged: null, previewFrame: 0, loaded: false, busy: false,
    libraryFilter: 'all', builderView: 'design', counterPreviewDelta: 0
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clone = value => JSON.parse(JSON.stringify(value));
const catalogSet = () => state.sets.find(set => set.id === state.draft?.catalogId);
const allItems = () => catalogSet()?.roster || [];
const itemById = id => allItems().find(item => item.id === id);
const sectionById = id => state.draft.sections.find(section => section.id === id);
const itemName = item => String(item?.values?.[state.draft?.labelField] ?? item?.label ?? 'Unnamed item');
const itemImage = item => String(item?.values?.[state.draft?.imageField] ?? '');
const totalItems = () => state.draft?.sections.reduce((sum, section) => sum + section.items.length, 0) || 0;
const displayPreviewId = () => state.draft.id || 'display-preview-draft';
setDisplayFormContext(() => state.draft?.kind === 'badge' ? { badge: state.draft.badge, variables: state.variables } : null);
const tableDesigner = createTableDesigner($('#table-design-controls'), {
    getDraft: () => state.draft, getSets: () => state.sets, onChange: () => { markDirty(); schedulePreview(); }
});
const counterDesigner = createCounterDesigner($('#counter-design-controls'), $('#counter-appearance-controls'), {
    getDraft: () => state.draft, getSets: () => state.sets, getVariables: () => state.variables,
    onChange: () => { markDirty(); renderPreviewControls(); schedulePreview(); },
    pickColor: openBadgeColorPicker,
    pickFont: ({ onSelect }) => window.PlaceholderPicker?.open({
        filter: 'font',
        getStatus: () => ({ customVars: state.variables, variableSets: state.sets }),
        onPick: (token, meta) => onSelect(meta?.raw ? token : `{{${token}}}`)
    })
});
const badgeDesigner = createBadgeDesigner($('#badge-designer'), {
    getDraft: () => state.draft, getStatus: () => ({ variableSets: state.sets, customVars: state.variables }),
    onChange: () => { markDirty(); schedulePreview(); },
    visualControls: (element, helpers) => badgeVisualControls(element, helpers, state.sets, state.draft.catalogId),
    bindControls: (root, primary, render) => bindBadgeControls(root, primary, render, () => { markDirty(); schedulePreview(); }, async file => {
        try { await uploadBadgeAsset(file); } catch (error) { showAlert(error.message); }
    }, () => ({ customVars: state.variables, variableSets: state.sets }), openBadgeColorPicker),
    pickAsset: pickBadgeAsset,
    pickColor: openBadgeColorPicker
});
function openBadgeColorPicker({ onSelect, allowMember = true }) {
    const colors = allowMember ? catalogSet()?.fields?.filter(field => field.type === 'color') || [] : [];
    window.PlaceholderPicker?.open({
        filter: 'color', memberColorFields: colors.map(field => ({ key: field.key, label: field.label || field.key })),
        getStatus: () => ({ customVars: state.variables, variableSets: state.sets }),
        onPick: (token, meta) => onSelect(meta?.raw ? token : `{{${token}}}`)
    });
}

function showAlert(message, kind = 'error') {
    alertBox.textContent = message;
    alertBox.dataset.kind = kind;
    alertBox.hidden = !message;
    if (message) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearAlert() {
    alertBox.hidden = true;
    alertBox.textContent = '';
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

async function loadLibrary() {
    const [library, variables] = await Promise.all([
        request('/api/variable-displays'),
        request('/api/variables')
    ]);
    state.displays = Array.isArray(library.displays) ? library.displays : [];
    state.sets = Array.isArray(variables.sets) ? variables.sets : [];
    state.variables = Array.isArray(variables.variables) ? variables.variables : [];
    state.loaded = true;
    window.OverlayShared?.loadAssetFonts?.();
    renderLibrary();
}

function displaySummary(display) {
    const set = state.sets.find(candidate => candidate.id === display.catalogId);
    const items = (display.sections || []).reduce((count, section) => count + (section.items || []).length, 0);
    const columnCount = display.table?.columns?.length || 0, fieldCount = display.badge?.imageGroup?.fields?.length || 0;
    if (display.kind === 'table') return [set?.name || 'Catalog unavailable', `${columnCount} ${columnCount === 1 ? 'column' : 'columns'}`, 'Table'];
    if (display.kind === 'badge') return [set?.name || 'Catalog unavailable', `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`, 'Badge / strip'];
    if (display.kind === 'counter') {
        const c = display.counter || {};
        const styleLabel = c.style === 'tally-chalk' ? 'Tally (Chalk)' : c.style ? c.style.charAt(0).toUpperCase() + c.style.slice(1) : 'Pips';
        if (c.sourceMode === 'set') return [set?.name || 'Set unavailable', c.valueField || 'Auto field', styleLabel];
        const varCount = (c.variables || []).length;
        return [`${varCount} ${varCount === 1 ? 'counter' : 'counters'}`, styleLabel, c.capMode === 'custom' ? `Cap ${c.customCap}` : c.capMode === 'none' ? 'Uncapped' : 'Auto cap'];
    }
    return [
        set?.name || 'Catalog unavailable',
        `${items} ${items === 1 ? 'item' : 'items'}`,
        `${display.sections?.length || 0} ${display.sections?.length === 1 ? 'section' : 'sections'}`,
        display.layout?.mode === 'fixed' ? 'Fixed slots' : 'Auto grid'
    ];
}

function renderLibrary() {
    const query = $('#display-library-search').value.trim().toLowerCase();
    const filtered = state.displays.filter(display => (state.libraryFilter === 'all' || (display.kind || 'inventory') === state.libraryFilter) && (!query || `${display.name} ${displaySummary(display).join(' ')}`.toLowerCase().includes(query)));
    document.querySelectorAll('[data-filter-kind]').forEach(button => {
        const active = button.dataset.filterKind === state.libraryFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    $('#display-count').textContent = `${state.displays.length} / 100 saved`;
    $('#create-display').disabled = state.displays.length >= 100;
    if (!state.displays.length) {
        $('#display-list').innerHTML = `
            <div class="display-empty">
                <h3>Create your first reusable display</h3>
                <p>Your library is ready. Start with one of the display types above, then reuse the design in as many overlays as you need.</p>
                <button class="btn btn-primary" type="button" data-action="create">Create display</button>
                <p style="margin-top:14px">Need a catalog first? <a href="/placeholders.html#sets">Create a Variable Set</a>.</p>
            </div>`;
        return;
    }
    if (!filtered.length) {
        $('#display-list').innerHTML = '<div class="display-empty"><h3>No matching displays</h3><p>Try a different search or clear the filter.</p></div>';
        return;
    }
    $('#display-list').innerHTML = filtered.map(display => `
        <article class="display-list-card" data-display-kind="${esc(display.kind || 'inventory')}">
            <div class="display-card-illustration" aria-hidden="true">${display.kind === 'table' ? '<div class="mini-table"><i></i><i></i><i></i><i></i></div>' : display.kind === 'badge' ? '<div class="mini-badge"><i></i><span><b></b><b></b></span></div>' : display.kind === 'counter' ? '<div class="mini-counter"><i></i><i></i><i></i><i class="is-empty"></i><i class="is-empty"></i></div>' : '<div class="mini-inventory"><i></i><i></i><i></i><i></i><i></i><i></i></div>'}</div>
            <div class="display-list-head">
                <h3>${esc(display.name)}</h3>
                <span class="display-tag">${esc(display.kind === 'table' ? 'Table' : display.kind === 'badge' ? 'Badge' : display.kind === 'counter' ? 'Counter' : 'Inventory')}</span>
            </div>
            <div class="display-list-meta">${displaySummary(display).map(value => `<span class="display-tag">${esc(value)}</span>`).join('')}</div>
            <div class="display-list-actions">
                <button class="btn btn-sm btn-primary" type="button" data-action="edit" data-id="${esc(display.id)}">Edit</button>
                <details class="display-card-menu"><summary aria-label="More actions for ${esc(display.name)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary><div><button type="button" data-action="duplicate" data-id="${esc(display.id)}">Duplicate design</button><button type="button" data-action="delete" data-id="${esc(display.id)}">Delete design</button></div></details>
            </div>
        </article>`).join('');
}

function loadPreviewPreferences() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}'); } catch { saved = {}; }
    const perId = saved[displayPreviewId()] || {};
    state.previewBackdrop = perId.backdrop || '#111827';
    state.previewResolution = perId.resolution || 'native';
    state.previewBinding = {
        displayId: displayPreviewId(), setId: '', selector: 'active', path: [], tracker: '', showMode: 'dim', rows: 'all', fields: [],
        ...(perId.binding || {})
    };
    state.previewBinding.displayId = displayPreviewId();
}

function savePreviewPreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}');
        saved[displayPreviewId()] = { backdrop: state.previewBackdrop, binding: state.previewBinding, resolution: state.previewResolution };
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(saved));
    } catch { /* Private browsing can disable localStorage; preview remains available in memory. */ }
}

function markDirty() {
    const dirty = Boolean(state.draft && (!state.draft.id || JSON.stringify(state.draft) !== state.baseline));
    $('#dirty-state').textContent = dirty ? 'Unsaved changes' : 'Saved';
    $('#dirty-state').classList.toggle('is-dirty', dirty);
    $('#save-display').disabled = state.busy;
    return dirty;
}

function confirmDiscard() {
    return !state.draft || !markDirty() || window.confirm('Discard unsaved display changes?');
}

function beginDraft(display = defaults()) {
    state.draft = { ...defaults(), ...clone(display) };
    state.counterPreviewDelta = 0;
    if (state.draft.kind === 'table') state.draft.table = { ...defaultTable(), ...state.draft.table };
    if (state.draft.kind === 'counter') state.draft.counter = { ...defaultCounter(), ...state.draft.counter };
    if (state.draft.kind === 'badge') {
        const set = state.sets.find(set => set.id === state.draft.catalogId);
        state.draft.badge ||= {
            width: 640, height: 360,
            imageGroup: { ...defaultImageGroupConfig(set), fallbackMode: 'initials', showLabels: true, layout: 'cards', cardFrame: true, labelPosition: 'right', cardWidthMode: 'fixed', cardWidth: 280, shape: 'rounded', cardPaddingX: 12, cardPaddingY: 10 },
            style: { fontFamily: 'sans-serif', fontSize: 20, color: '#ffffff', fontWeight: '600' }, mediaFilter: {}
        };
        if (state.draft.badge.imageGroup.showLabels == null) state.draft.badge.imageGroup.showLabels = Boolean(state.draft.badge.imageGroup.fields?.length);
        for (const key of ['setId', 'filterMode', 'linkedSource', 'onlySelected', 'showMode']) delete state.draft.badge.imageGroup[key];
    }
    if (!state.draft.sections?.length) state.draft.sections = [{ id: 'section_1', title: '', items: [] }];
    state.baseline = JSON.stringify(state.draft);
    loadPreviewPreferences();
    libraryView.hidden = true;
    builderView.hidden = false;
    clearAlert();
    renderBuilder();
    history.replaceState(null, '', display.id ? `/variable-displays.html?id=${encodeURIComponent(display.id)}` : `/variable-displays.html?kind=${state.draft.kind}`);
    window.scrollTo(0, 0);
}

function openLibrary() {
    window.OverlayShared?.cleanupNode?.($('#display-preview'));
    state.draft = null;
    libraryView.hidden = false;
    builderView.hidden = true;
    history.replaceState(null, '', '/variable-displays.html');
    clearAlert();
    renderLibrary();
}

function controlsForFields(fields, className = '') {
    return fields.map(field => {
        if (field.multiple) return `<fieldset class="control-field ${className}"><legend>${esc(field.label)}</legend>${field.options.map(([value, label]) => `<label><input type="checkbox" data-source-field value="${esc(value)}"${field.value.includes(value) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</fieldset>`;
        const control = `<select class="select input" data-source-path="${esc(field.path)}" aria-label="${esc(field.label)}">${field.options.map(([value, label]) => `<option value="${esc(value)}"${String(field.value ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
        return `<div class="control-field ${className}"><label>${esc(field.label)}</label>${control}</div>`;
    }).join('');
}

function availableFields(kind) {
    const set = catalogSet();
    const seen = new Map((set?.fields || []).map(field => [field.key, field.label || field.key]));
    for (const item of set?.roster || []) {
        for (const key of Object.keys(item.values || {})) if (!seen.has(key)) seen.set(key, key);
    }
    const preferred = kind === 'image' ? ['image', 'icon', 'avatar', 'artwork'] : ['name', 'label', 'title'];
    const keys = [...seen.keys()].sort((a, b) => {
        const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
    });
    if (!keys.includes(kind === 'image' ? 'image' : 'name')) keys.unshift(kind === 'image' ? 'image' : 'name');
    return keys.map(key => [key, seen.get(key) || key]);
}

function renderCatalogControls() {
    const currentSet = catalogSet();
    const kind = state.draft.kind, inventory = kind === 'inventory';
    $('#catalog-heading').textContent = `1. Choose ${kind === 'badge' ? 'a member' : kind === 'table' ? 'a table' : 'an item'} catalog`;
    $('#catalog-intro').textContent = inventory ? 'Arrange saved catalog items and explicitly configured tiers.' : kind === 'table' ? 'Choose the entries and linked fields used by your table columns.' : 'Choose the member fields used by badge text, images and icons.';
    $('#preview-binding-help').textContent = inventory ? 'Reuse this inventory with a separate checklist tracker for each player or placement.' : kind === 'table' ? 'Each placement chooses its own row scope and linked source; the saved columns are shared.' : 'Each placement chooses its own members or linked source; the badge design is shared.';
    $('#placement-source-step').textContent = inventory ? 'Choose the player or owner entry and its checklist tracker.' : kind === 'table' ? 'Choose the live row scope or linked entries for this table placement.' : 'Choose the live members or linked source for this badge placement.';
    $('#appearance-description').textContent = inventory ? 'Item cells, labels and unselected states' : 'Column cells, table rows and labels';
    const fields = state.draft.catalogId ? currentSet?.fields || [] : [];
    const catalogs = state.sets.filter(set => Array.isArray(set.roster));
    $('#catalog-controls').innerHTML = `
        <div class="control-field"><label for="catalog-set">Variable Set catalog</label>
            <select id="catalog-set" class="select input" data-bind="catalogId">
                <option value="">Choose a catalog</option>${catalogs.map(set => { const count = (set.roster || []).length; return `<option value="${esc(set.id)}"${state.draft.catalogId === set.id ? ' selected' : ''}>${esc(set.name || 'Unnamed set')} · ${count} ${count === 1 ? (inventory ? 'item' : 'entry') : (inventory ? 'items' : 'entries')}</option>`; }).join('')}
            </select>
        </div>
        ${state.draft.catalogId && state.draft.kind === 'inventory' ? `
        <div class="control-field"><label for="image-field">Item image field</label>
            <select id="image-field" class="select input" data-bind="imageField">${availableFields('image').map(([key, label]) => `<option value="${esc(key)}"${state.draft.imageField === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
        </div>
        <div class="control-field"><label for="label-field">Item label field</label>
            <select id="label-field" class="select input" data-bind="labelField">${availableFields('label').map(([key, label]) => `<option value="${esc(key)}"${state.draft.labelField === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
        </div>` : ''}
    `;
    if (!state.sets.length) {
        $('#catalog-help').innerHTML = `No Variable Sets are available. <a href="/placeholders.html#sets">Create a catalog in Placeholders &amp; Variables</a>, then return here.`;
    } else if (currentSet && !currentSet.roster?.length) {
        $('#catalog-help').textContent = 'This catalog has no entries yet. Add entries to its roster before building a display.';
    } else if (currentSet) {
        const count = currentSet.roster.length;
        $('#catalog-help').textContent = `${count} ${count === 1 ? 'entry' : 'entries'} available. ${inventory ? 'Only saved fields and explicit tier data are used; missing images or labels stay blank.' : kind === 'table' ? 'Configure columns below; choose live rows independently in each placement.' : 'Configure the badge below; choose live members independently in each placement.'}`;
    } else {
        $('#catalog-help').textContent = fields.length ? `${fields.length} ${fields.length === 1 ? 'field' : 'fields'} available.` : `Choose a Variable Set containing the ${inventory ? 'items' : kind === 'table' ? 'rows' : 'members'} to display.`;
    }
}

function renderCatalogItems() {
    const search = $('#display-search').value.trim().toLowerCase();
    const added = new Set(state.draft.sections.flatMap(section => section.items.map(item => item.itemId)));
    const items = allItems().filter(item => `${itemName(item)} ${item.label || ''}`.toLowerCase().includes(search));
    $('#catalog-item-count').textContent = `${items.length} shown · ${added.size} added`;
    if (!catalogSet()) {
        $('#catalog-items').innerHTML = '<div class="section-placeholder">Choose a catalog to browse its items.</div>';
        return;
    }
    if (!items.length) {
        $('#catalog-items').innerHTML = '<div class="section-placeholder">No catalog items match this search.</div>';
        return;
    }
    $('#catalog-items').innerHTML = items.map(item => {
        const image = itemImage(item), alreadyAdded = added.has(item.id);
        const detail = item.tiers?.length ? `${item.tiers.length} configured ${item.tiers.length === 1 ? 'tier' : 'tiers'}` : 'Catalog item';
        return `<div class="catalog-item${alreadyAdded ? ' is-added' : ''}" draggable="${!alreadyAdded}" data-catalog-item="${esc(item.id)}" tabindex="${alreadyAdded ? '-1' : '0'}">
            ${image ? `<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="catalog-item-placeholder">No image</span>'}
            <div><div class="catalog-item-name" title="${esc(itemName(item))}">${esc(itemName(item))}</div><div class="catalog-item-detail">${esc(detail)}</div></div>
            <button type="button" class="btn btn-sm" data-action="add-item" data-item-id="${esc(item.id)}" aria-label="Add ${esc(itemName(item))}" ${alreadyAdded || totalItems() >= 60 ? 'disabled' : ''}>Add</button>
        </div>`;
    }).join('');
}

function renderFixedSlots(section) {
    if (state.draft.layout.mode !== 'fixed') return '';
    const maxCell = Math.max(-1, ...section.items.map(item => Number(item.cell) || 0));
    const cells = Math.min(256, Math.max(state.draft.layout.columns * 2, maxCell + 1));
    const occupied = new Map(section.items.map(item => [Number(item.cell), item]));
    const placeholders = Array.from({ length: cells }, (_, cell) => {
        const placement = occupied.get(cell);
        const item = placement && itemById(placement.itemId);
        return `<div class="fixed-slot${placement ? ' filled' : ''}" title="${placement ? `${cell}: ${esc(itemName(item))}` : `Empty slot ${cell}`}">${itemImage(item) ? `<img src="${esc(itemImage(item))}" alt="">` : placement ? esc(cell) : esc(cell)}</div>`;
    }).join('');
    return `<div class="fixed-slots" style="--slot-columns:${state.draft.layout.columns}" aria-label="Fixed slot map">${placeholders}</div>`;
}

function renderSections() {
    const options = state.draft.sections.map(section => ({
        id: section.id,
        html: `<option value="${esc(section.id)}">${esc(section.title || 'Untitled section')}</option>`
    }));
    $('#section-editor').innerHTML = state.draft.sections.map((section, sectionIndex) => `
        <article class="display-section" data-section="${esc(section.id)}">
            <div class="section-head">
                <input class="input" type="text" maxlength="80" placeholder="Section title (optional)" aria-label="Section ${sectionIndex + 1} title" data-section-title="${esc(section.id)}" value="${esc(section.title)}">
                <div class="section-actions">
                    <button class="btn btn-sm" type="button" data-action="section-up" data-section-id="${esc(section.id)}" aria-label="Move section up" ${sectionIndex === 0 ? 'disabled' : ''}>Move up</button>
                    <button class="btn btn-sm" type="button" data-action="section-down" data-section-id="${esc(section.id)}" aria-label="Move section down" ${sectionIndex === state.draft.sections.length - 1 ? 'disabled' : ''}>Move down</button>
                    <button class="btn btn-sm btn-danger" type="button" data-action="remove-section" data-section-id="${esc(section.id)}" aria-label="Remove section">Remove</button>
                </div>
            </div>
            <div class="section-items" data-drop-section="${esc(section.id)}" aria-label="Items in ${esc(section.title || 'untitled section')}">
                ${section.items.length ? section.items.map((placement, itemIndex) => {
                    const item = itemById(placement.itemId);
                    return `<div class="placed-item" draggable="true" data-placed-item="${esc(item?.id || placement.itemId)}" data-section-id="${esc(section.id)}">
                        <span class="placed-grip" aria-hidden="true">⋮⋮</span>
                        ${itemImage(item) ? `<img class="placed-thumb" src="${esc(itemImage(item))}" alt="" referrerpolicy="no-referrer">` : '<span class="placed-thumb-placeholder">No image</span>'}
                        <span class="placed-name" title="${esc(itemName(item))}">${esc(itemName(item))}</span>
                        ${state.draft.layout.mode === 'fixed' ? `<label class="sr-only" for="cell-${esc(section.id)}-${itemIndex}">Slot number</label><input id="cell-${esc(section.id)}-${itemIndex}" class="input input-sm placed-cell" type="number" min="0" max="255" step="1" value="${Number(placement.cell) || 0}" data-cell-section="${esc(section.id)}" data-cell-item="${esc(item?.id || placement.itemId)}">` : '<span class="display-tag">Flow</span>'}
                        <div class="placed-actions">
                            <button type="button" class="btn btn-sm" data-action="item-up" data-section-id="${esc(section.id)}" data-item-id="${esc(item?.id || placement.itemId)}" aria-label="Move ${esc(itemName(item))} up" ${itemIndex === 0 ? 'disabled' : ''}>Up</button>
                            <button type="button" class="btn btn-sm" data-action="item-down" data-section-id="${esc(section.id)}" data-item-id="${esc(item?.id || placement.itemId)}" aria-label="Move ${esc(itemName(item))} down" ${itemIndex === section.items.length - 1 ? 'disabled' : ''}>Down</button>
                            ${state.draft.sections.length > 1 ? `<label class="sr-only" for="move-${esc(section.id)}-${itemIndex}">Move ${esc(itemName(item))} to section</label><select id="move-${esc(section.id)}-${itemIndex}" class="select input input-sm" data-move-item="${esc(item?.id || placement.itemId)}" data-from-section="${esc(section.id)}"><option value="">Move to…</option>${options.filter(target => target.id !== section.id).map(target => target.html).join('')}</select>` : ''}
                            <button type="button" class="btn btn-sm btn-danger" data-action="remove-item" data-section-id="${esc(section.id)}" data-item-id="${esc(item?.id || placement.itemId)}" aria-label="Remove ${esc(itemName(item))}">Remove</button>
                        </div>
                    </div>`;
                }).join('') : '<div class="section-placeholder">Drop catalog items here or add them from the catalog above.</div>'}
            </div>
            ${renderFixedSlots(section)}
        </article>`).join('');
}

const layoutFields = [
    ['columns', 'Columns', 1, 16, 1], ['cellWidth', 'Cell width', 24, 300, 1],
    ['cellHeight', 'Cell height', 24, 360, 1], ['gap', 'Cell gap', 0, 80, 1], ['sectionGap', 'Section gap', 0, 100, 1]
];
const appearanceNumeric = [
    ['borderWidth', 'Cell border width', 0, 12, .5], ['radius', 'Cell corner radius', 0, 100, 1],
    ['padding', 'Content padding', 0, 100, 1], ['fontSize', 'Label font size', 8, 60, 1],
    ['inactiveOpacity', 'Unselected item opacity', 0, 1, .05]
];
const appearanceColors = [
    ['cellBackground', 'Cell background'], ['color', 'Label text color'], ['borderColor', 'Cell border color']
];

function numericControl(name, label, value, min, max, step, group = 'layout') {
    return `<div class="control-field"><label for="control-${group}-${name}">${esc(label)}</label><input id="control-${group}-${name}" class="input" type="number" min="${min}" max="${max}" step="${step}" value="${esc(value)}" data-bind="${group}.${name}"></div>`;
}

function checkboxControl(name, label) {
    return `<div class="control-field toggle-field"><input id="style-${name}" type="checkbox" data-bind="style.${name}" ${state.draft.style[name] ? 'checked' : ''}><label for="style-${name}">${esc(label)}</label></div>`;
}

function renderLayoutControls() {
    $('#layout-controls').innerHTML = `
        <div class="control-field"><span class="control-label">Layout mode</span>
            <div class="tabs-nav" role="group" aria-label="Inventory layout">
                <button class="tab-btn${state.draft.layout.mode === 'flow' ? ' active' : ''}" type="button" data-action="layout-mode" data-mode="flow" aria-pressed="${state.draft.layout.mode === 'flow'}">Auto grid</button>
                <button class="tab-btn${state.draft.layout.mode === 'fixed' ? ' active' : ''}" type="button" data-action="layout-mode" data-mode="fixed" aria-pressed="${state.draft.layout.mode === 'fixed'}">Fixed slots</button>
            </div>
        </div>
        ${layoutFields.map(([name, label, min, max, step]) => numericControl(name, label, state.draft.layout[name], min, max, step)).join('')}
    `;
    $('#appearance-controls').innerHTML = `
        ${appearanceColors.map(([name, label]) => `<div class="control-field"><label for="style-${name}">${label}</label><span class="display-color-pair"><input type="color" data-bind="style.${name}" value="${esc(state.draft.style[name].slice(0, 7))}" aria-label="${label} picker"><input id="style-${name}" class="input" type="text" maxlength="9" pattern="#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?" placeholder="#RRGGBBAA" value="${esc(state.draft.style[name])}" data-bind="style.${name}"></span><small>Hex color with optional opacity</small></div>`).join('')}
        ${appearanceNumeric.filter(([name]) => state.draft.kind === 'inventory' || name !== 'inactiveOpacity').map(([name, label, min, max, step]) => numericControl(name, label, state.draft.style[name], min, max, step, 'style')).join('')}
        <div class="control-field"><label for="style-fontFamily">Font family</label><input id="style-fontFamily" class="input" type="text" maxlength="120" value="${esc(state.draft.style.fontFamily)}" data-bind="style.fontFamily"></div>
        ${state.draft.kind === 'inventory' ? checkboxControl('showLabels', 'Show labels') + checkboxControl('showLevels', 'Show tracker levels') + checkboxControl('showOwner', 'Show owner name') + checkboxControl('showSectionTitles', 'Show section titles') : ''}
    `;
}

function renderPreviewControls() {
    const fields = displaySourceFields(state.previewBinding, state.sets, state.draft.catalogId, state.draft.kind, state.variables, state.draft);
    const source = displaySourceSummary(state.previewBinding, state.sets, state.draft, true, state.variables);
    $('#preview-controls').innerHTML = `
        ${controlsForFields(fields)}
        <div class="control-field"><label for="preview-backdrop">Preview backdrop</label><input id="preview-backdrop" class="input" type="text" maxlength="9" pattern="#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?" value="${esc(state.previewBackdrop)}" aria-describedby="preview-backdrop-help"><small id="preview-backdrop-help">Local preview only · #RRGGBB or #RRGGBBAA</small></div>
    `;
    $('#preview-source-summary').dataset.displaySourceState = source.ok ? 'ready' : 'empty';
    $('#preview-source-summary').innerHTML = `<strong>${esc(source.chain)}</strong><p>${esc(source.message)}</p>`;
    $('#display-preview').style.background = state.previewBackdrop;
}

function renderBuilder() {
    const kind = state.draft.kind || 'inventory';
    builderView.dataset.kind = kind;
    document.querySelectorAll('[data-kinds]').forEach(node => { node.hidden = !node.dataset.kinds.split(' ').includes(kind); });
    $('#builder-kind-label').textContent = `${kind === 'table' ? 'Table' : kind === 'badge' ? 'Badge' : kind === 'counter' ? 'Counter & Pips' : 'Inventory'} designer`;
    $('#builder-intro').textContent = kind === 'inventory'
        ? 'Arrange catalog items into reusable sections. Bind each player’s tracker in the overlay placement.'
        : kind === 'table'
            ? 'Choose columns, linked fields and row ordering. The preview source is local to this device; each placement chooses its own live rows.'
            : kind === 'counter'
                ? 'Visualize counters and scores as pips, filled & outlined hearts, stars, bars, or 5-count slashed tally marks. Bind standalone variables or Variable Set numeric fields.'
                : 'Design member badges and strips using fields, images, icons, fonts, zones and animated frames. Reuse this design with independent sources in any overlay.';
    $('#display-name').value = state.draft.name || '';
    $('#duplicate-display').disabled = !state.draft.id || state.displays.length >= 100;
    if (kind !== 'counter') renderCatalogControls();
    else {
        $('#preview-binding-help').textContent = 'Each overlay placement can use the saved counters or override with a specific counter variable or Variable Set.';
        $('#placement-source-step').textContent = 'Use the saved counters as-is, or override the bound variable/set for this placement.';
    }
    if (kind === 'inventory') { renderCatalogItems(); renderSections(); }
    if (kind === 'table') tableDesigner.render();
    if (kind === 'badge') badgeDesigner.render();
    if (kind === 'counter') counterDesigner.render();
    renderLayoutControls();
    renderPreviewControls();
    applyBuilderView();
    markDirty();
    schedulePreview();
}

function applyBuilderView() {
    builderView.dataset.builderView = state.builderView;
    document.querySelectorAll('button[data-builder-view]').forEach(button => {
        const active = button.dataset.builderView === state.builderView;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
}

function schedulePreview() {
    if (state.previewFrame) cancelAnimationFrame(state.previewFrame);
    state.previewFrame = requestAnimationFrame(() => {
        state.previewFrame = 0;
        const summary = $('#preview-source-summary');
        if (summary) {
            const source = displaySourceSummary(state.previewBinding, state.sets, state.draft, true, state.variables);
            summary.dataset.displaySourceState = source.ok ? 'ready' : 'empty';
            summary.innerHTML = `<strong>${esc(source.chain)}</strong><p>${esc(source.message)}</p>`;
        }
        const stage = $('#display-preview');
        const isCounter = state.draft.kind === 'counter';
        const existingCounterHost = isCounter ? stage.querySelector(':scope > .counter-preview-host') : null;
        if (!existingCounterHost) {
            window.OverlayShared?.cleanupNode?.(stage);
            stage.replaceChildren();
        }
        if (!window.OverlayShared?.renderVariableDisplay) {
            stage.innerHTML = '<div class="preview-empty">The shared overlay renderer is unavailable. Reload the page to try again.</div>';
            return;
        }
        const host = existingCounterHost || document.createElement('div');
        if (isCounter) host.className = 'counter-preview-host';
        host.style.cssText = 'width:100%;height:100%;min-width:0;min-height:0;';
        const native = state.draft.kind === 'badge' ? [state.draft.badge.width || 640, state.draft.badge.height || 360] : state.draft.kind === 'table' ? [1280, 720] : state.draft.kind === 'counter' ? [560, 220] : [640, 360];
        const [width, height] = state.previewResolution === 'native' ? native : state.previewResolution.split('x').map(Number);
        stage.classList.add('is-aspect-preview');
        stage.style.aspectRatio = `${width} / ${height}`;
        stage.style.setProperty('--display-preview-ratio', width / height);
        const scale = Math.min((stage.clientWidth - 24) / width, (stage.clientHeight - 24) / height, 1);
        host.style.cssText = `width:${width}px;height:${height}px;min-width:0;min-height:0;transform:scale(${scale});transform-origin:center;flex:none;`;
        $('#preview-dimensions').textContent = `${width} × ${height}`;
        document.querySelectorAll('[data-preview-resolution]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.previewResolution === state.previewResolution)));
        if (!existingCounterHost) stage.append(host);
        const display = { ...state.draft, id: displayPreviewId() };
        let previewVars = state.variables;
        let previewSets = state.sets;
        if (isCounter && state.counterPreviewDelta !== 0) {
            const delta = state.counterPreviewDelta;
            previewVars = state.variables.map(v => (v.type === 'counter' || v.type === 'number')
                ? { ...v, value: Math.max(0, (Number(v.value) || 0) + delta) }
                : v);
            previewSets = state.sets.map(s => s.id === (state.previewBinding?.setId || state.draft.catalogId)
                ? {
                    ...s,
                    roster: (s.roster || []).map(r => {
                        const key = state.draft.counter?.valueField || (s.fields || []).find(f => f.type === 'number' || f.type === 'counter')?.key;
                        if (!key) return r;
                        return { ...r, values: { ...(r.values || {}), [key]: Math.max(0, (Number(r.values?.[key]) || 0) + delta) } };
                    })
                }
                : s);
        }
        const rendered = window.OverlayShared.renderVariableDisplay(host, {
            type: 'data-display',
            display: { ...state.previewBinding, displayId: display.id }
        }, { variableDisplays: [display], variableSets: previewSets, customVars: previewVars });
        if (!rendered) {
            stage.innerHTML = `<div class="preview-empty">${esc(displaySourceSummary(state.previewBinding, state.sets, state.draft, true, state.variables).message)}</div>`;
        }
    });
}

function setNested(object, path, value) {
    const parts = path.split('.');
    let current = object;
    for (const key of parts.slice(0, -1)) current = current[key];
    current[parts.at(-1)] = value;
}

function readControlValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number') return input.value === '' ? '' : Number(input.value);
    return input.value;
}

function updateBoundInput(input) {
    const path = input.dataset.bind;
    if (!path) return;
    const value = readControlValue(input);
    if (path === 'catalogId') {
        state.draft.catalogId = value;
        state.draft.imageField = 'image';
        state.draft.labelField = 'name';
        state.draft.sections = state.draft.sections.map(section => ({ ...section, items: [] }));
        renderCatalogControls();
        renderCatalogItems();
        renderSections();
        if (state.draft.kind === 'table') {
            state.draft.table = defaultTable();
            const choices = tableFieldOptions(state.sets, catalogSet()).slice(0, 4);
            state.draft.table.columns = choices.map(([key, label]) => ({ key, label, width: 1, type: catalogSet()?.fields?.find(field => field.key === key)?.type === 'image' ? 'image' : 'text', align: 'left' }));
            tableDesigner.render();
        }
        if (state.draft.kind === 'badge') badgeDesigner.render();
    } else if (path.startsWith('layout.')) {
        const key = path.slice('layout.'.length);
        if (value === '') {
            state.draft.layout[key] = '';
        } else if (Number.isFinite(value)) {
            const oldColumns = state.draft.layout.columns;
            state.draft.layout[key] = value;
            if (key === 'columns' && value !== oldColumns) reflowCells();
        }
    } else if (path.startsWith('style.')) {
        setNested(state.draft, path, value);
    } else {
        state.draft[path] = value;
        if (path === 'imageField' || path === 'labelField') {
            renderCatalogItems();
            renderSections();
        }
    }
    markDirty();
    schedulePreview();
}

function reflowCells() {
    for (const section of state.draft.sections) section.items.forEach((item, index) => { item.cell = index; });
    renderSections();
}

function normalizeFlowCells() {
    if (state.draft.layout.mode === 'flow') {
        for (const section of state.draft.sections) section.items.forEach((item, index) => { item.cell = index; });
    }
}

function saveChanged() {
    markDirty();
    schedulePreview();
}

function firstFreeCell(section) {
    const occupied = new Set(section.items.map(item => Number(item.cell)));
    for (let cell = 0; cell <= 255; cell++) if (!occupied.has(cell)) return cell;
    return -1;
}

function addItem(itemId, sectionId = state.draft.sections[0]?.id, index = null) {
    if (totalItems() >= 60) {
        showAlert('A display supports up to 60 items.');
        return;
    }
    if (!itemById(itemId) || state.draft.sections.some(section => section.items.some(item => item.itemId === itemId))) return;
    const section = sectionById(sectionId) || state.draft.sections[0];
    if (!section) return;
    const cell = state.draft.layout.mode === 'fixed' ? firstFreeCell(section) : section.items.length;
    if (cell < 0) {
        showAlert('This section has no empty fixed slots.');
        return;
    }
    const position = index == null ? section.items.length : Math.max(0, Math.min(section.items.length, index));
    section.items.splice(position, 0, { itemId, cell });
    normalizeFlowCells();
    renderCatalogItems();
    renderSections();
    saveChanged();
}

function removeItem(sectionId, itemId) {
    const section = sectionById(sectionId);
    if (!section) return;
    section.items = section.items.filter(item => item.itemId !== itemId);
    normalizeFlowCells();
    renderCatalogItems();
    renderSections();
    saveChanged();
}

function moveItem(itemId, fromId, toId, targetIndex = null) {
    const from = sectionById(fromId), to = sectionById(toId);
    if (!from || !to) return;
    const currentIndex = from.items.findIndex(item => item.itemId === itemId);
    if (currentIndex < 0) return;
    let insertionIndex = targetIndex;
    if (from === to && insertionIndex != null && currentIndex < insertionIndex) insertionIndex--;
    const movingCell = from.items[currentIndex].cell;
    if (from !== to && state.draft.layout.mode === 'fixed') {
        const targetOccupied = new Set(to.items.map(item => Number(item.cell)));
        if (targetOccupied.has(Number(movingCell))) {
            const replacement = firstFreeCell(to);
            if (replacement < 0) {
                showAlert('The destination section has no empty fixed slots.');
                return;
            }
            from.items[currentIndex].cell = replacement;
        }
    }
    const [placement] = from.items.splice(currentIndex, 1);
    const index = insertionIndex == null ? to.items.length : Math.max(0, Math.min(to.items.length, insertionIndex));
    to.items.splice(index, 0, placement);
    normalizeFlowCells();
    renderSections();
    saveChanged();
}

function moveItemWithin(sectionId, itemId, delta) {
    const section = sectionById(sectionId);
    const index = section?.items.findIndex(item => item.itemId === itemId) ?? -1;
    if (index < 0) return;
    const target = Math.max(0, Math.min(section.items.length - 1, index + delta));
    if (target === index) return;
    const [placement] = section.items.splice(index, 1);
    section.items.splice(target, 0, placement);
    normalizeFlowCells();
    renderSections();
    saveChanged();
}

function moveSection(sectionId, delta) {
    const index = state.draft.sections.findIndex(section => section.id === sectionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= state.draft.sections.length) return;
    const [section] = state.draft.sections.splice(index, 1);
    state.draft.sections.splice(target, 0, section);
    renderSections();
    saveChanged();
}

function addSection() {
    if (state.draft.sections.length >= 20) {
        showAlert('A display supports up to 20 sections.');
        return;
    }
    let index = 1;
    while (state.draft.sections.some(section => section.id === `section_${index}`)) index++;
    state.draft.sections.push({ id: `section_${index}`, title: '', items: [] });
    renderSections();
    saveChanged();
    const last = $('#section-editor .display-section:last-child input');
    last?.focus();
}

function removeSection(sectionId) {
    if (state.draft.sections.length <= 1) {
        showAlert('A display must keep at least one section. Add another section before removing this one.', 'info');
        return;
    }
    const index = state.draft.sections.findIndex(section => section.id === sectionId);
    if (index < 0) return;
    const section = state.draft.sections[index];
    if (section.items.length) {
        const target = state.draft.sections[index > 0 ? index - 1 : 1];
        if (!window.confirm(`“${section.title || 'Untitled section'}” contains ${section.items.length} item(s). Move them into “${target.title || 'Untitled section'}” before removing this section?`)) return;
        target.items.push(...section.items);
    }
    state.draft.sections.splice(index, 1);
    normalizeFlowCells();
    if (state.draft.layout.mode === 'fixed') reflowCells();
    else renderSections();
    saveChanged();
}

function changeLayoutMode(mode) {
    state.draft.layout.mode = mode === 'fixed' ? 'fixed' : 'flow';
    normalizeFlowCells();
    renderLayoutControls();
    renderSections();
    saveChanged();
}

function setCell(input) {
    const section = sectionById(input.dataset.cellSection);
    const placement = section?.items.find(item => item.itemId === input.dataset.cellItem);
    if (!placement || input.value === '') return;
    const cell = Math.round(Number(input.value));
    if (!Number.isFinite(cell) || cell < 0 || cell > 255) {
        input.setCustomValidity('Choose a slot from 0 to 255.');
        input.reportValidity();
        return;
    }
    const collision = section.items.some(item => item !== placement && Number(item.cell) === cell);
    if (collision) {
        input.setCustomValidity('This section already uses that slot.');
        input.reportValidity();
        return;
    }
    input.setCustomValidity('');
    placement.cell = cell;
    markDirty();
    schedulePreview();
}

function addNewDisplay() {
    if (!confirmDiscard()) return;
    if (state.displays.length >= 100) {
        showAlert('The display library is full (100 designs). Delete a design before creating another.');
        return;
    }
    const draft = defaults();
    draft.kind = $('#display-kind').value || 'inventory';
    draft.name = `${draft.kind === 'table' ? 'Table' : draft.kind === 'badge' ? 'Badge' : draft.kind === 'counter' ? 'Counter' : 'Inventory'} display`;
    draft.catalogId = draft.kind === 'counter' ? '' : (state.sets.find(set => set.roster?.length)?.id || '');
    const requestedCatalog = new URLSearchParams(location.search).get('catalog');
    if (state.sets.some(set => set.id === requestedCatalog)) draft.catalogId = requestedCatalog;
    if (draft.kind === 'counter') {
        draft.counter = defaultCounter();
        const firstCounter = state.variables.find(v => !v.setId && (v.type === 'counter' || v.type === 'number'));
        if (firstCounter) draft.counter.variables = [{ name: firstCounter.name, label: '', cap: null }];
    }
    if (draft.kind === 'table') {
        draft.table = defaultTable();
        const catalog = state.sets.find(set => set.id === draft.catalogId);
        const choices = tableFieldOptions(state.sets, catalog).slice(0, 4);
        if (choices.length) draft.table.columns = choices.map(([key, label]) => ({
            key, label, width: 1, type: catalog?.fields?.find(field => field.key === key)?.type === 'image' ? 'image' : 'text', align: 'left'
        }));
    }
    beginDraft(draft);
}

function duplicateDisplay(display) {
    if (!display || state.displays.length >= 100 || !confirmDiscard()) return;
    const copy = clone(display);
    copy.id = '';
    copy.name = `${display.name} copy`.slice(0, 80);
    beginDraft(copy);
}

async function deleteDisplay(id) {
    const display = state.displays.find(item => item.id === id);
    if (!display) return;
    try {
        const { dependencies } = await request(`/api/variable-displays/${encodeURIComponent(id)}/dependencies`);
        if (dependencies.length) {
            showAlert(`“${display.name}” is in use: ${dependencies.map(item => item.label).join('; ')}. Remove or replace these placements before deleting the design.`, 'info');
            return;
        }
        if (!window.confirm(`Delete “${display.name}”? No saved placements use this design.`)) return;
        await request(`/api/variable-displays/${encodeURIComponent(id)}`, { method: 'DELETE' });
        state.displays = state.displays.filter(item => item.id !== id);
        renderLibrary();
        showAlert(`Deleted “${display.name}”.`, 'success');
    } catch (error) {
        showAlert(`Could not delete the display: ${error.message}`);
    }
}

function validateDraft() {
    if (!state.draft.name.trim()) throw new Error('Enter a display name.');
    if (state.draft.kind === 'counter') {
        const cfg = state.draft.counter || {};
        if (cfg.sourceMode === 'set') {
            if (!catalogSet()) throw new Error('Choose a Variable Set for this counter display.');
        } else if (!Array.isArray(cfg.variables) || !cfg.variables.length) {
            throw new Error('Add at least one Counter or Number variable.');
        }
        return;
    }
    if (!catalogSet()) throw new Error('Choose a Variable Set catalog.');
    if (state.draft.kind === 'badge') return;
    if (state.draft.kind === 'table') {
        if (!state.draft.table.columns.length) throw new Error('Add at least one table column.');
        return;
    }
    if (state.draft.sections.length > 20) throw new Error('A display supports up to 20 sections.');
    if (totalItems() > 60) throw new Error('A display supports up to 60 items.');
    const seen = new Set();
    for (const section of state.draft.sections) {
        const cells = new Set();
        for (const placement of section.items) {
            if (seen.has(placement.itemId)) throw new Error('An item can appear only once in a display.');
            seen.add(placement.itemId);
            const cell = Number(placement.cell);
            if (!Number.isInteger(cell) || cell < 0 || cell > 255) throw new Error('Slot numbers must be between 0 and 255.');
            if (cells.has(cell)) throw new Error(`“${section.title || 'Untitled section'}” has two items in slot ${cell}.`);
            cells.add(cell);
        }
    }
    for (const [key, label] of appearanceColors) {
        if (!/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(state.draft.style[key])) throw new Error(`${label} must be a 6- or 8-digit hex color.`);
    }
    for (const [key, label, min, max] of [...layoutFields, ...appearanceNumeric]) {
        const values = key in state.draft.layout ? state.draft.layout : state.draft.style;
        const value = Number(values[key]);
        if (values[key] === '' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
        if (key === 'columns' && !Number.isInteger(value)) throw new Error('Columns must be a whole number.');
    }
    if (state.draft.layout.mode === 'flow') normalizeFlowCells();
}

async function saveDisplay() {
    if (state.busy || !markDirty()) return;
    try {
        validateDraft();
    } catch (error) {
        showAlert(error.message, 'info');
        return;
    }
    state.busy = true;
    builderView.inert = true;
    markDirty();
    $('#save-display').textContent = 'Saving…';
    try {
        const result = await request(state.draft.id ? `/api/variable-displays/${encodeURIComponent(state.draft.id)}` : '/api/variable-displays', {
            method: state.draft.id ? 'PUT' : 'POST',
            body: JSON.stringify(state.draft)
        });
        const saved = result.display || result;
        state.draft = clone(saved);
        state.previewBinding.displayId = saved.id;
        savePreviewPreferences();
        const index = state.displays.findIndex(display => display.id === saved.id);
        if (index < 0) state.displays.push(clone(saved));
        else state.displays[index] = clone(saved);
        state.baseline = JSON.stringify(state.draft);
        state.busy = false;
        builderView.inert = false;
        renderBuilder();
        showAlert('Display saved.', 'success');
        history.replaceState(null, '', `/variable-displays.html?id=${encodeURIComponent(saved.id)}`);
    } catch (error) {
        state.busy = false;
        builderView.inert = false;
        showAlert(`Could not save the display: ${error.message}`);
    } finally {
        $('#save-display').textContent = 'Save display';
        markDirty();
    }
}

function onBuilderInput(event) {
    const input = event.target;
    const colorPair = input.closest('.display-color-pair');
    if (colorPair) {
        if (input.type === 'color') colorPair.querySelector('input[type=text]').value = input.value;
        else if (/^#[a-f\d]{6}/i.test(input.value)) colorPair.querySelector('input[type=color]').value = input.value.slice(0, 7);
    }
    if (input.matches('[data-bind]')) updateBoundInput(input);
    else if (input.matches('[data-section-title]')) {
        const section = sectionById(input.dataset.sectionTitle);
        if (section) section.title = input.value;
        markDirty();
    } else if (input.matches('[data-cell-section]')) setCell(input);
    else if (input.id === 'display-name') {
        state.draft.name = input.value;
        markDirty();
    }
    else if (input.id === 'preview-backdrop') {
        if (/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(input.value)) {
            state.previewBackdrop = input.value;
            $('#display-preview').style.background = input.value;
            savePreviewPreferences();
        }
    }
}

function onBuilderChange(event) {
    const input = event.target;
    if (input.matches('[data-source-field]')) {
        updateDisplaySource(state.previewBinding, 'fields', [...$('#preview-controls').querySelectorAll('[data-source-field]:checked')].map(input => input.value));
        savePreviewPreferences();
        renderPreviewControls();
        schedulePreview();
        return;
    }
    if (input.matches('[data-source-path]')) {
        updateDisplaySource(state.previewBinding, input.dataset.sourcePath, input.value);
        savePreviewPreferences();
        renderPreviewControls();
        schedulePreview();
    } else if (input.matches('[data-move-item]') && input.value) {
        moveItem(input.dataset.moveItem, input.dataset.fromSection, input.value);
    } else if (input.matches('[data-bind]')) {
        updateBoundInput(input);
        if (input.dataset.bind === 'catalogId') {
            updateDisplaySource(state.previewBinding, 'setId', '');
            savePreviewPreferences();
            renderPreviewControls();
        }
    } else if (input.matches('[data-cell-section]')) {
        setCell(input);
        renderSections();
    }
}

function onBuilderClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, itemId, sectionId, mode } = button.dataset;
    if (action === 'add-item') addItem(itemId);
    else if (action === 'remove-item') removeItem(sectionId, itemId);
    else if (action === 'item-up') moveItemWithin(sectionId, itemId, -1);
    else if (action === 'item-down') moveItemWithin(sectionId, itemId, 1);
    else if (action === 'section-up') moveSection(sectionId, -1);
    else if (action === 'section-down') moveSection(sectionId, 1);
    else if (action === 'remove-section') removeSection(sectionId);
    else if (action === 'layout-mode') changeLayoutMode(mode);
    else if (action === 'create') addNewDisplay();
    else if (action === 'edit') {
        if (!confirmDiscard()) return;
        const display = state.displays.find(candidate => candidate.id === id);
        if (display) beginDraft(display);
    } else if (action === 'duplicate') duplicateDisplay(state.displays.find(candidate => candidate.id === id));
    else if (action === 'delete') deleteDisplay(id);
}

function onDragStart(event) {
    const catalogCard = event.target.closest('[data-catalog-item]');
    const placed = event.target.closest('[data-placed-item]');
    if (catalogCard && !catalogCard.classList.contains('is-added')) {
        state.dragged = { kind: 'catalog', itemId: catalogCard.dataset.catalogItem };
        event.dataTransfer?.setData('text/plain', catalogCard.dataset.catalogItem);
    } else if (placed) {
        state.dragged = { kind: 'placed', itemId: placed.dataset.placedItem, sectionId: placed.dataset.sectionId };
        event.dataTransfer?.setData('text/plain', placed.dataset.placedItem);
    }
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event) {
    const section = event.target.closest('[data-drop-section]');
    const row = event.target.closest('[data-placed-item]');
    if (!state.dragged || (!section && !row)) return;
    event.preventDefault();
    document.querySelectorAll('.display-section.is-drop-target').forEach(element => element.classList.remove('is-drop-target'));
    (section || row.closest('.display-section'))?.classList.add('is-drop-target');
}

function onDrop(event) {
    const sectionTarget = event.target.closest('[data-drop-section]');
    const rowTarget = event.target.closest('[data-placed-item]');
    if (!state.dragged || (!sectionTarget && !rowTarget)) return;
    event.preventDefault();
    const drag = state.dragged;
    state.dragged = null;
    document.querySelectorAll('.display-section.is-drop-target').forEach(element => element.classList.remove('is-drop-target'));
    if (drag.kind === 'catalog') {
        const section = rowTarget?.dataset.sectionId || sectionTarget.dataset.dropSection;
        const targetIndex = rowTarget ? sectionById(section).items.findIndex(item => item.itemId === rowTarget.dataset.placedItem) : null;
        addItem(drag.itemId, section, targetIndex);
    } else {
        const toSection = rowTarget?.dataset.sectionId || sectionTarget.dataset.dropSection;
        const targetIndex = rowTarget ? sectionById(toSection).items.findIndex(item => item.itemId === rowTarget.dataset.placedItem) : null;
        moveItem(drag.itemId, drag.sectionId, toSection, targetIndex);
    }
}

function installEvents() {
    document.addEventListener('keydown', event => {
        const target = event.target.closest('button[data-filter-kind],button[data-builder-view]');
        if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...target.parentElement.querySelectorAll('button[role=tab]')];
        const index = tabs.indexOf(target);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
    });
    document.querySelectorAll('[data-new-kind]').forEach(button => button.addEventListener('click', () => {
        $('#display-kind').value = button.dataset.newKind;
        addNewDisplay();
    }));
    document.querySelectorAll('[data-filter-kind]').forEach(button => button.addEventListener('click', () => {
        state.libraryFilter = button.dataset.filterKind;
        if (state.libraryFilter !== 'all') $('#display-kind').value = state.libraryFilter;
        try { localStorage.setItem('streampulse:display-library:filter', state.libraryFilter); } catch { /* Optional preference. */ }
        renderLibrary();
    }));
    document.querySelectorAll('button[data-builder-view]').forEach(button => button.addEventListener('click', () => {
        state.builderView = button.dataset.builderView;
        try { localStorage.setItem('streampulse:display-library:view', state.builderView); } catch { /* Optional preference. */ }
        applyBuilderView();
    }));
    document.querySelectorAll('[data-preview-resolution]').forEach(button => button.addEventListener('click', () => {
        state.previewResolution = button.dataset.previewResolution;
        savePreviewPreferences();
        schedulePreview();
    }));
    document.querySelectorAll('[data-counter-preview]').forEach(button => button.addEventListener('click', () => {
        const act = button.dataset.counterPreview;
        if (act === 'reset') state.counterPreviewDelta = 0;
        else state.counterPreviewDelta += Number(act) || 0;
        schedulePreview();
    }));
    $('#display-library-search').addEventListener('input', () => {
        try { localStorage.setItem('streampulse:display-library:search', $('#display-library-search').value); } catch { /* Optional preference. */ }
        renderLibrary();
    });
    $('#display-search').addEventListener('input', renderCatalogItems);
    $('#create-display').addEventListener('click', addNewDisplay);
    $('#display-list').addEventListener('click', onBuilderClick);
    $('#back-to-library').addEventListener('click', () => {
        if (confirmDiscard()) openLibrary();
    });
    $('#save-display').addEventListener('click', saveDisplay);
    $('#duplicate-display').addEventListener('click', () => duplicateDisplay(state.draft));
    $('#add-section').addEventListener('click', addSection);
    builderView.addEventListener('click', onBuilderClick);
    builderView.addEventListener('input', onBuilderInput);
    builderView.addEventListener('change', onBuilderChange);
    builderView.addEventListener('dragstart', onDragStart);
    builderView.addEventListener('dragover', onDragOver);
    builderView.addEventListener('drop', onDrop);
    builderView.addEventListener('dragend', () => {
        state.dragged = null;
        document.querySelectorAll('.display-section.is-drop-target').forEach(element => element.classList.remove('is-drop-target'));
    });
    window.addEventListener('beforeunload', event => {
        if (state.draft && markDirty()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

function startLiveSources() {
    let socket, retry, stopped = false;
    const connect = () => {
        if (stopped) return;
        socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
        socket.addEventListener('message', event => {
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.type !== 'variables-update' || !message.data) return;
            state.sets = message.data.sets || state.sets;
            state.variables = message.data.variables || state.variables;
            if (state.draft?.kind === 'badge') refreshBoundDisplayNumbers($('#badge-designer'));
            if (state.draft && !builderView.hidden) schedulePreview();
        });
        socket.addEventListener('close', () => { if (!stopped) retry = setTimeout(connect, 3000); });
    };
    connect();
    window.addEventListener('pagehide', () => {
        stopped = true;
        clearTimeout(retry);
        socket?.close();
        if (state.previewFrame) cancelAnimationFrame(state.previewFrame);
        window.OverlayShared?.cleanupNode?.($('#display-preview'));
    }, { once: true });
}

async function start() {
    installEvents();
    try {
        const filter = localStorage.getItem('streampulse:display-library:filter');
        if (['all', 'inventory', 'table', 'badge', 'counter'].includes(filter)) state.libraryFilter = filter;
        state.builderView = localStorage.getItem('streampulse:display-library:view') === 'appearance' ? 'appearance' : 'design';
        $('#display-library-search').value = localStorage.getItem('streampulse:display-library:search') || '';
    } catch { /* Optional preferences. */ }
    try {
        await loadLibrary();
        const requestedId = new URLSearchParams(location.search).get('id');
        const requestedKind = new URLSearchParams(location.search).get('kind');
        if (['inventory', 'table', 'badge', 'counter'].includes(requestedKind)) $('#display-kind').value = requestedKind;
        if (requestedId) {
            const display = state.displays.find(candidate => candidate.id === requestedId);
            if (!display) showAlert('That saved display could not be found.');
            else beginDraft(display);
        } else if (requestedKind) addNewDisplay();
        startLiveSources();
        const observer = new ResizeObserver(() => { if (state.draft && !builderView.hidden) schedulePreview(); });
        observer.observe($('#display-preview'));
        window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    } catch (error) {
        showAlert(`Could not load the Display Library or Variable Sets: ${error.message}. Check the server connection and retry.`, 'error');
        $('#display-list').innerHTML = '<div class="display-empty"><h3>Library could not be loaded</h3><p>Saved designs and source sets were not changed. Reload this page to retry.</p></div>';
        $('#create-display').disabled = true;
    }
}

start();
