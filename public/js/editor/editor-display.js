import { F } from './editor-form.js';
import { esc, state } from './editor-state.js';
import { displaySourceFields, updateDisplaySource } from '../displays/display-source.js';

export function savedDisplaySection(element) {
    const binding = element.display || {};
    const displays = state.liveStatus.variableDisplays || [];
    const display = displays.find(item => item.id === binding.displayId);
    const controls = F.select('display.displayId', 'Saved design', binding.displayId || '', [
        ['', 'Choose a display'], ...displays.map(item => [item.id, item.name])
    ]) + (display ? displaySourceFields(binding, state.liveStatus.variableSets || [], display.catalogId)
        .map(field => F.select(`display.${field.path}`, field.label, field.value, field.options)).join('') : '');
    return F.section('savedDisplay', 'Saved Display', controls
        + `<p class="hint">The design owns items, grouping and appearance. This placement chooses whose tracker to follow. Use the same design twice for Player 1 and Player 2.</p>
        <p><a href="/variable-displays.html${display ? `?id=${encodeURIComponent(display.id)}` : ''}" target="_blank" rel="noopener">${display ? `Edit ${esc(display.name)}` : 'Open Display Library'}</a></p>`);
}

export function updateSavedDisplay(element, path, value) {
    if (!element.display) element.display = {};
    if (path === 'display.displayId') {
        element.display = { displayId: value, setId: '', selector: 'active', path: [], tracker: '', showMode: 'dim' };
    } else updateDisplaySource(element.display, path.slice(8), value);
}
