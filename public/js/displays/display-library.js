import { displaySourceFields, updateDisplaySource } from './display-source.js';

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
    previewBackdrop: '#111827', dragged: null, previewFrame: 0, loaded: false, busy: false
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
    renderLibrary();
}

function displaySummary(display) {
    const set = state.sets.find(candidate => candidate.id === display.catalogId);
    const items = (display.sections || []).reduce((count, section) => count + (section.items || []).length, 0);
    return [
        set?.name || 'Catalog unavailable',
        `${items} ${items === 1 ? 'item' : 'items'}`,
        `${display.sections?.length || 0} ${display.sections?.length === 1 ? 'section' : 'sections'}`,
        display.layout?.mode === 'fixed' ? 'Fixed slots' : 'Auto grid'
    ];
}

function renderLibrary() {
    const query = $('#display-library-search').value.trim().toLowerCase();
    const filtered = state.displays.filter(display => !query || `${display.name} ${displaySummary(display).join(' ')}`.toLowerCase().includes(query));
    $('#display-count').textContent = `${state.displays.length} / 100 saved`;
    $('#create-display').disabled = state.displays.length >= 100;
    if (!state.displays.length) {
        $('#display-list').innerHTML = `
            <div class="display-empty">
                <h3>Start with your item inventory</h3>
                <p>Create a reusable inventory layout from a Variable Set. Layout and groups live here; player-specific tracker bindings are added when you place the design in an overlay.</p>
                <button class="btn btn-primary" type="button" data-action="create">Create inventory display</button>
                <p style="margin-top:14px">Need a catalog first? <a href="/placeholders.html#sets">Create a Variable Set</a>.</p>
            </div>`;
        return;
    }
    if (!filtered.length) {
        $('#display-list').innerHTML = '<div class="display-empty"><h3>No matching displays</h3><p>Try a different search or clear the filter.</p></div>';
        return;
    }
    $('#display-list').innerHTML = filtered.map(display => `
        <article class="display-list-card">
            <div class="display-list-head">
                <h3>${esc(display.name)}</h3>
                <span class="display-tag">Inventory</span>
            </div>
            <div class="display-list-meta">${displaySummary(display).map(value => `<span class="display-tag">${esc(value)}</span>`).join('')}</div>
            <div class="display-list-actions">
                <button class="btn btn-sm btn-primary" type="button" data-action="edit" data-id="${esc(display.id)}">Edit</button>
                <button class="btn btn-sm" type="button" data-action="duplicate" data-id="${esc(display.id)}">Duplicate</button>
                <button class="btn btn-sm btn-danger" type="button" data-action="delete" data-id="${esc(display.id)}">Delete</button>
            </div>
        </article>`).join('');
}

function loadPreviewPreferences() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}'); } catch { saved = {}; }
    const perId = saved[displayPreviewId()] || {};
    state.previewBackdrop = perId.backdrop || '#111827';
    state.previewBinding = {
        displayId: displayPreviewId(), setId: '', selector: 'active', path: [], tracker: '', showMode: 'dim',
        ...(perId.binding || {})
    };
    state.previewBinding.displayId = displayPreviewId();
}

function savePreviewPreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}');
        saved[displayPreviewId()] = { backdrop: state.previewBackdrop, binding: state.previewBinding };
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(saved));
    } catch { /* Private browsing can disable localStorage; preview remains available in memory. */ }
}

function markDirty() {
    const dirty = JSON.stringify(state.draft) !== state.baseline;
    $('#dirty-state').textContent = dirty ? 'Unsaved changes' : 'Saved';
    $('#save-display').disabled = state.busy;
    return dirty;
}

function confirmDiscard() {
    return !markDirty() || window.confirm('Discard unsaved display changes?');
}

function beginDraft(display = defaults()) {
    state.draft = clone(display);
    if (!state.draft.sections?.length) state.draft.sections = [{ id: 'section_1', title: '', items: [] }];
    state.baseline = JSON.stringify(state.draft);
    loadPreviewPreferences();
    libraryView.hidden = true;
    builderView.hidden = false;
    clearAlert();
    renderBuilder();
    history.replaceState(null, '', display.id ? `/variable-displays.html?id=${encodeURIComponent(display.id)}` : '/variable-displays.html');
    window.scrollTo(0, 0);
}

function openLibrary() {
    libraryView.hidden = false;
    builderView.hidden = true;
    history.replaceState(null, '', '/variable-displays.html');
    clearAlert();
    renderLibrary();
}

function controlsForFields(fields, className = '') {
    return fields.map(field => {
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
    const fields = state.draft.catalogId ? currentSet?.fields || [] : [];
    const catalogs = state.sets.filter(set => Array.isArray(set.roster));
    $('#catalog-controls').innerHTML = `
        <div class="control-field"><label for="catalog-set">Variable Set catalog</label>
            <select id="catalog-set" class="select input" data-bind="catalogId">
                <option value="">Choose a catalog</option>${catalogs.map(set => `<option value="${esc(set.id)}"${state.draft.catalogId === set.id ? ' selected' : ''}>${esc(set.name || 'Unnamed set')} · ${(set.roster || []).length} items</option>`).join('')}
            </select>
        </div>
        ${state.draft.catalogId ? `
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
        $('#catalog-help').textContent = `${(currentSet.roster || []).length} catalog entries. Only saved fields and explicit tier data are used; missing images or labels stay blank.`;
    } else {
        $('#catalog-help').textContent = fields.length ? `${fields.length} fields available.` : 'Choose a Variable Set whose roster contains the display items.';
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
    ['borderWidth', 'Border width', 0, 12, .5], ['radius', 'Corner radius', 0, 100, 1],
    ['padding', 'Display padding', 0, 100, 1], ['fontSize', 'Font size', 8, 60, 1],
    ['inactiveOpacity', 'Inactive opacity', 0, 1, .05]
];
const appearanceColors = [
    ['background', 'Display background'], ['cellBackground', 'Cell background'],
    ['color', 'Text color'], ['borderColor', 'Border color']
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
            <div class="bar">
                <button class="btn btn-sm${state.draft.layout.mode === 'flow' ? ' btn-primary' : ''}" type="button" data-action="layout-mode" data-mode="flow">Auto grid</button>
                <button class="btn btn-sm${state.draft.layout.mode === 'fixed' ? ' btn-primary' : ''}" type="button" data-action="layout-mode" data-mode="fixed">Fixed slots</button>
            </div>
        </div>
        ${layoutFields.map(([name, label, min, max, step]) => numericControl(name, label, state.draft.layout[name], min, max, step)).join('')}
    `;
    $('#appearance-controls').innerHTML = `
        ${appearanceColors.map(([name, label]) => `<div class="control-field"><label for="style-${name}">${label}</label><input id="style-${name}" class="input" type="text" maxlength="9" pattern="#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?" placeholder="#RRGGBBAA" value="${esc(state.draft.style[name])}" data-bind="style.${name}"><small>Hex color with optional opacity</small></div>`).join('')}
        ${appearanceNumeric.map(([name, label, min, max, step]) => numericControl(name, label, state.draft.style[name], min, max, step, 'style')).join('')}
        <div class="control-field"><label for="style-fontFamily">Font family</label><input id="style-fontFamily" class="input" type="text" maxlength="120" value="${esc(state.draft.style.fontFamily)}" data-bind="style.fontFamily"></div>
        ${checkboxControl('showLabels', 'Show labels')}
        ${checkboxControl('showLevels', 'Show tracker levels')}
        ${checkboxControl('showOwner', 'Show owner name')}
        ${checkboxControl('showSectionTitles', 'Show section titles')}
    `;
}

function renderPreviewControls() {
    const fields = displaySourceFields(state.previewBinding, state.sets, state.draft.catalogId);
    $('#preview-controls').innerHTML = `
        ${controlsForFields(fields)}
        <div class="control-field"><label for="preview-backdrop">Preview backdrop</label><input id="preview-backdrop" class="input" type="text" maxlength="9" pattern="#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?" value="${esc(state.previewBackdrop)}" aria-describedby="preview-backdrop-help"><small id="preview-backdrop-help">Local preview only · #RRGGBB or #RRGGBBAA</small></div>
    `;
    $('#display-preview').style.background = state.previewBackdrop;
}

function renderBuilder() {
    $('#display-name').value = state.draft.name || '';
    $('#duplicate-display').disabled = !state.draft.id || state.displays.length >= 100;
    renderCatalogControls();
    renderCatalogItems();
    renderSections();
    renderLayoutControls();
    renderPreviewControls();
    markDirty();
    schedulePreview();
}

function schedulePreview() {
    if (state.previewFrame) cancelAnimationFrame(state.previewFrame);
    state.previewFrame = requestAnimationFrame(() => {
        state.previewFrame = 0;
        const stage = $('#display-preview');
        stage.replaceChildren();
        if (!window.OverlayShared?.renderVariableDisplay) {
            stage.innerHTML = '<div class="preview-empty">The shared overlay renderer is unavailable. Reload the page to try again.</div>';
            return;
        }
        const host = document.createElement('div');
        host.style.cssText = 'width:100%;height:100%;min-width:0;min-height:0;';
        stage.append(host);
        const display = { ...state.draft, id: displayPreviewId() };
        const rendered = window.OverlayShared.renderVariableDisplay(host, {
            type: 'data-display',
            display: { ...state.previewBinding, displayId: display.id }
        }, { variableDisplays: [display], variableSets: state.sets });
        if (!rendered) {
            stage.innerHTML = `<div class="preview-empty">Choose a catalog and add items to see the design. To preview tracked levels, choose a linked owner set and checklist tracker above.</div>`;
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
    draft.catalogId = state.sets.find(set => set.roster?.length)?.id || '';
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
    if (!display || !window.confirm(`Delete “${display.name}”? Existing overlay placements may no longer find this design.`)) return;
    try {
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
    if (!catalogSet()) throw new Error('Choose a Variable Set catalog.');
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
    $('#display-library-search').addEventListener('input', renderLibrary);
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

async function start() {
    installEvents();
    try {
        await loadLibrary();
        const requestedId = new URLSearchParams(location.search).get('id');
        if (requestedId) {
            const display = state.displays.find(candidate => candidate.id === requestedId);
            if (!display) showAlert('That saved display could not be found.');
            else beginDraft(display);
        }
    } catch (error) {
        showAlert(`Could not load the Display Library or Variable Sets: ${error.message}. Check the server connection and retry.`, 'error');
        $('#display-list').innerHTML = '<div class="display-empty"><h3>Library could not be loaded</h3><p>Saved designs and source sets were not changed. Reload this page to retry.</p></div>';
        $('#create-display').disabled = true;
    }
}

start();
