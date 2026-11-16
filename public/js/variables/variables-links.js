import { esc } from './variables-state.js';

function selectionLabel(names) {
    return names.length ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2} more` : ''}` : 'Choose entries...';
}

export function linkControl(field, value, sets, attributes) {
    const target = sets.find(set => set.id === field.targetSet);
    const items = target?.roster || [];
    if (field.type === 'ref') {
        return `<select ${attributes} aria-label="${esc(field.label)}"><option value="">None</option>${value && !items.some(item => item.id === value) ? `<option value="${esc(value)}" selected>Missing entry (choose another)</option>` : ''}${items.map(item => `<option value="${esc(item.id)}"${value === item.id ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}</select>${target ? '' : '<small class="muted">Choose a linked set in Edit Set first.</small>'}`;
    }
    let ids = value;
    if (!Array.isArray(ids)) { try { ids = JSON.parse(value || '[]'); } catch { ids = []; } }
    if (!Array.isArray(ids)) ids = [];
    const names = items.filter(item => ids.includes(item.id)).map(item => item.label);
    return `<div class="variable-link-picker" data-link-control><input type="hidden" data-link-value ${attributes} value="${esc(JSON.stringify(ids))}"><details><summary>${esc(selectionLabel(names))}</summary><div class="variable-link-options"><input type="search" data-link-search placeholder="Search ${esc(target?.name || 'entries')}..." aria-label="Search ${esc(field.label)}">${items.map(item => `<label data-link-option><input type="checkbox" value="${esc(item.id)}"${ids.includes(item.id) ? ' checked' : ''}>${esc(item.label)}</label>`).join('') || '<p class="muted">Add entries to the linked set first.</p>'}</div></details></div>`;
}

export function bindLinkControls(host) {
    host.addEventListener('input', event => {
        if (!event.target.matches('[data-link-search]')) return;
        const query = event.target.value.trim().toLowerCase();
        event.target.closest('[data-link-control]').querySelectorAll('[data-link-option]').forEach(option => {
            option.hidden = !option.textContent.toLowerCase().includes(query);
        });
    });
    host.addEventListener('change', event => {
        if (!event.target.matches('[data-link-option] input')) return;
        const control = event.target.closest('[data-link-control]');
        const selected = [...control.querySelectorAll('[data-link-option] input:checked')];
        control.querySelector('summary').textContent = selectionLabel(selected.map(input => input.parentElement.textContent.trim()));
        const value = control.querySelector('[data-link-value]');
        value.value = JSON.stringify(selected.map(input => input.value));
        value.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
