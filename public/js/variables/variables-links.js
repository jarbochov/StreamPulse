import { esc } from './variables-state.js';

function selectionLabel(names) {
    return names.length ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2} more` : ''}` : 'Choose entries...';
}

function orderedItems(ids, items) {
    return ids.map(id => items.find(item => item.id === id) || { id, label: `Missing entry: ${id}` });
}

function orderControls(ids, items) {
    return orderedItems(ids, items).map((item, index) => `<li data-link-selected="${esc(item.id)}"><span>${esc(item.label)}</span><button type="button" class="b sm" data-link-move="-1" aria-label="Move ${esc(item.label)} earlier"${index === 0 ? ' disabled' : ''}>Up</button><button type="button" class="b sm" data-link-move="1" aria-label="Move ${esc(item.label)} later"${index === ids.length - 1 ? ' disabled' : ''}>Down</button><button type="button" class="b sm" data-link-remove aria-label="Remove ${esc(item.label)}">Remove</button></li>`).join('');
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
    const names = orderedItems(ids, items).map(item => item.label);
    return `<div class="variable-link-picker" data-link-control><input type="hidden" data-link-value ${attributes} value="${esc(JSON.stringify(ids))}"><ol class="variable-link-order" data-link-order aria-label="${esc(field.label)} order">${orderControls(ids, items)}</ol><details><summary>${esc(selectionLabel(names))}</summary><div class="variable-link-options"><input type="search" data-link-search placeholder="Search ${esc(target?.name || 'entries')}..." aria-label="Search ${esc(field.label)}">${items.map(item => `<label data-link-option><input type="checkbox" value="${esc(item.id)}"${ids.includes(item.id) ? ' checked' : ''}>${esc(item.label)}</label>`).join('') || '<p class="muted">Add entries to the linked set first.</p>'}</div></details></div>`;
}

export function bindLinkControls(host) {
    const commit = (control, ids, focusId, direction) => {
        const options = [...control.querySelectorAll('[data-link-option] input')];
        const items = options.map(input => ({ id: input.value, label: input.parentElement.textContent.trim() }));
        const value = control.querySelector('[data-link-value]');
        value.value = JSON.stringify(ids);
        control.querySelector('summary').textContent = selectionLabel(orderedItems(ids, items).map(item => item.label));
        control.querySelector('[data-link-order]').innerHTML = orderControls(ids, items);
        for (const input of options) input.checked = ids.includes(input.value);
        if (focusId) {
            const row = [...control.querySelectorAll('[data-link-selected]')].find(row => row.dataset.linkSelected === focusId);
            const button = row?.querySelector(`[data-link-move="${direction}"]:not(:disabled)`) || row?.querySelector('button:not(:disabled)');
            button?.focus();
        }
        value.dispatchEvent(new Event('change', { bubbles: true }));
    };
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
        const ids = JSON.parse(control.querySelector('[data-link-value]').value || '[]');
        commit(control, event.target.checked ? [...ids, event.target.value] : ids.filter(id => id !== event.target.value));
    });
    host.addEventListener('click', event => {
        const button = event.target.closest('[data-link-move], [data-link-remove]');
        if (!button) return;
        const control = button.closest('[data-link-control]');
        const id = button.closest('[data-link-selected]').dataset.linkSelected;
        const ids = JSON.parse(control.querySelector('[data-link-value]').value || '[]');
        const index = ids.indexOf(id);
        const direction = Number(button.dataset.linkMove);
        if (button.hasAttribute('data-link-remove')) {
            ids.splice(index, 1);
            commit(control, ids);
        } else {
            const next = index + direction;
            if (next < 0 || next >= ids.length) return;
            [ids[index], ids[next]] = [ids[next], ids[index]];
            commit(control, ids, id, direction);
        }
    });
}
