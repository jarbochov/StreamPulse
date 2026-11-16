import { F } from './editor-form.js';
import { esc, state } from './editor-state.js';
import { displaySourceFields, displaySourceSummary, updateDisplaySource } from '../displays/display-source.js';

export function savedDisplaySection(element) {
    const binding = element.display || {};
    const displays = state.liveStatus.variableDisplays || [];
    const display = displays.find(item => item.id === binding.displayId);
    const controls = F.select('display.displayId', 'Saved design', binding.displayId || '', [
        ['', 'Choose a display'], ...displays.map(item => [item.id, item.name])
    ]) + (display ? displaySourceFields(binding, state.liveStatus.variableSets || [], display.catalogId, display.kind)
        .map(field => field.multiple ? `<fieldset class="field"><legend>${esc(field.label)}</legend>${field.options.map(([value, label]) => `<label class="check"><input type="checkbox" data-display-field value="${esc(value)}"${field.value.includes(value) ? ' checked' : ''}>${esc(label)}</label>`).join('')}</fieldset>`
            : F.select(`display.${field.path}`, field.label, field.value, field.options)).join('') : '');
    const source = displaySourceSummary(binding, state.liveStatus.variableSets || [], display, state.liveStatus.modules?.variableSets !== false);
    return F.section('savedDisplay', 'Saved Display', controls
        + `<div class="hint" data-display-source-state="${source.ok ? 'ready' : 'empty'}"><strong>${esc(source.chain)}</strong><p>${esc(source.message)}</p></div>`
        + `<p class="hint">The saved design controls items, arrangement and item-specific appearance. Choose live data here; use this placement's Layout and Style tabs for positioning and overall effects.</p>
        <p><a href="/variable-displays.html${display ? `?id=${encodeURIComponent(display.id)}` : ''}" target="_blank" rel="noopener">${display ? `Edit ${esc(display.name)}` : 'Open Display Library'}</a></p>`);
}

export function updateSavedDisplay(element, path, value) {
    if (!element.display) element.display = {};
    if (path === 'display.displayId') {
        element.display = { displayId: value, setId: '', selector: 'active', path: [], tracker: '', showMode: 'dim' };
    } else updateDisplaySource(element.display, path.slice(8), value);
}

export function refreshDisplaySourceStatus() {
    const node = document.querySelector('[data-display-source-state]');
    const element = state.overlay?.elements?.find(element => state.selectedIds.has(element.id));
    if (!node || element?.type !== 'data-display') return;
    const definition = state.liveStatus.variableDisplays?.find(display => display.id === element.display?.displayId);
    const source = displaySourceSummary(element.display, state.liveStatus.variableSets || [], definition, state.liveStatus.modules?.variableSets !== false);
    node.dataset.displaySourceState = source.ok ? 'ready' : 'empty';
    node.innerHTML = `<strong>${esc(source.chain)}</strong><p>${esc(source.message)}</p>`;
}
