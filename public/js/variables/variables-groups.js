import { api, esc, state, toast } from './variables-state.js';
import { groupFilterLink } from './variables-filter.js';

export function exportVariables(variables, sets = [], filename = 'streampulse-variables.json', groups = []) {
    const payload = { version: 2, exportedAt: new Date().toISOString(), variables, sets, groups: [...new Set([...groups, ...variables.filter(v => !v.setId && v.group).map(v => v.group)])] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openGroupEditor(onSaved, name = '') {
    const dialog = document.createElement('dialog');
    dialog.className = 'variable-group-dialog';
    const variables = state.customVars.filter(v => !v.setId && !v.hidden);
    dialog.innerHTML = `<form>
        <h2>${name ? 'Manage group' : 'New Variable Group'}</h2>
        <label>Group name<input name="name" value="${esc(name)}" maxlength="60" required placeholder="e.g. Broadcast Theme"></label>
        <p class="muted">Grouped placeholders use {{var.group_name.variable_name}}. Renaming a group or moving members changes their paths. Update existing placeholders and Number bindings yourself; old paths are not retained. Values and API names stay unchanged.</p>
        <p class="muted">Select variables to include. Adding a variable moves it from its previous group; unchecking removes it from this group.</p>
        <input type="search" aria-label="Search variables" placeholder="Search variables…">
        <div class="variable-group-members">${variables.map(v => `<label data-search="${esc(`${v.name} ${v.type} ${v.group || ''}`.toLowerCase())}">
            <input type="checkbox" name="member" value="${esc(v.name)}"${name && v.group === name ? ' checked' : ''}>
            <span><strong>${esc(v.name)}</strong><small>${esc(v.type)}${v.group ? ` · ${esc(v.group)}` : ''}</small></span>
        </label>`).join('') || '<p class="muted">No ordinary variables yet. You can create an empty group.</p>'}</div>
        <div class="variable-group-footer"><button type="button" class="b" data-close>Cancel</button><button type="submit" class="b primary">${name ? 'Save members' : 'Create group'}</button></div>
    </form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.querySelector('input[type="search"]').oninput = event => {
        const query = event.target.value.trim().toLowerCase();
        dialog.querySelectorAll('[data-search]').forEach(row => { row.hidden = !row.dataset.search.includes(query); });
    };
    dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const button = dialog.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            const result = await api('/api/variables/groups/manage', 'POST', {
                name: dialog.querySelector('[name="name"]').value,
                originalName: name || undefined,
                variables: [...dialog.querySelectorAll('[name="member"]:checked')].map(input => input.value),
                createOnly: !name
            });
            if (name && result.group !== name) {
                try {
                    const open = localStorage.getItem(`variable-group-open:group:${name}`);
                    if (open !== null) localStorage.setItem(`variable-group-open:group:${result.group}`, open);
                } catch { /* storage is optional */ }
            }
            dialog.close();
            await onSaved(result.group, name);
        } catch (error) {
            button.disabled = false;
            toast(error.message, 'error');
        }
    };
    dialog.showModal();
}

export function groupedRows(variables, rows, visibleGroups = null) {
    const grouped = new Map();
    if (visibleGroups || (!state.varGroupQuery && !state.varQuery.trim() && state.varTypeFilter === 'all')) {
        for (const name of visibleGroups || state.variableGroups || []) grouped.set(`group:${name}`, { name, group: name, rows: [] });
        if (grouped.size && !visibleGroups) grouped.set('ungrouped', { name: 'Ungrouped', group: '', rows: [] });
    }
    variables.forEach((v, i) => {
        const name = v.setId ? 'Set-managed variables' : (v.group || 'Ungrouped');
        const key = v.setId ? 'sets' : (v.group ? `group:${v.group}` : 'ungrouped');
        if (!grouped.has(key)) grouped.set(key, { name, group: v.setId ? '' : v.group, rows: [] });
        grouped.get(key).rows.push(rows[i]);
    });
    return [...grouped.values()].map(({ name, group, rows: groupRows }) => {
            const key = `variable-group-open:${group ? `group:${group}` : name}`;
            const open = localStorage.getItem(key) !== 'false';
            return `<details class="var-group" data-group-open="${esc(key)}"${open ? ' open' : ''}>
                <summary${name === 'Set-managed variables' && !group ? '' : ` data-drop-group="${esc(group || '')}"`}>${group ? `<a class="var-group-tag" href="${esc(groupFilterLink(group))}" data-filter-group="${esc(group)}" title="Open this group">${esc(name)}</a>` : name === 'Ungrouped' ? '<a class="var-group-tag" href="#variables#ungrouped" data-filter-ungrouped title="Open ungrouped variables">Ungrouped</a>' : `<span>${esc(name)}</span>`}<span class="badge">${groupRows.length}</span></summary>
                ${group ? `<div class="var-group-actions"><button type="button" class="b sm" data-manage-group="${esc(group)}">Manage members</button><button type="button" class="b sm" data-export-group="${esc(group)}">Export JSON</button><label class="b sm" style="display:inline-flex;align-items:center;cursor:pointer;">Import JSON<input type="file" data-import-group="${esc(group)}" accept=".json,application/json" hidden></label></div>` : ''}
                <div class="var-group-rows">${groupRows.join('') || '<span class="muted">No variables in this group yet.</span>'}</div>
            </details>`;
        }).join('');
}

export function bindGroupDragDrop(container, onSaved) {
    const mime = 'application/x-streampulse-variable';
    const clear = () => container.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    container.addEventListener('dragstart', event => {
        const name = event.target.closest('[data-drag-variable]')?.dataset.dragVariable;
        if (!name || !event.dataTransfer) return;
        event.dataTransfer.setData(mime, name);
        event.dataTransfer.effectAllowed = 'move';
    });
    container.addEventListener('dragover', event => {
        const header = event.target.closest('[data-drop-group]');
        if (!header || !event.dataTransfer?.types.includes(mime)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        clear();
        header.classList.add('is-drop-target');
    });
    container.addEventListener('dragleave', event => {
        const header = event.target.closest('[data-drop-group]');
        if (header && !header.contains(event.relatedTarget)) header.classList.remove('is-drop-target');
    });
    container.addEventListener('dragend', clear);
    container.addEventListener('drop', async event => {
        const header = event.target.closest('[data-drop-group]');
        const name = event.dataTransfer?.getData(mime);
        const variable = state.customVars.find(v => v.name === name && !v.setId && !v.hidden);
        clear();
        if (!header || !variable) return;
        event.preventDefault();
        const group = header.dataset.dropGroup;
        if ((variable.group || '') === group) return;
        try {
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { group });
            await onSaved();
            toast(group ? `Moved ${name} to ${group}` : `Ungrouped ${name}`, 'success');
        } catch (error) { toast(error.message, 'error'); }
    });
}

export function fontControls(v) {
    const shared = window.OverlayShared;
    shared?.loadGoogleFont?.(v.value);
    const choices = [
        ['sans-serif', 'Sans serif'], ['serif', 'Serif'], ['monospace', 'Monospace'],
        ['system-ui, sans-serif', 'System UI'],
        ...(shared?.GOOGLE_FONTS || []).map(name => [`'${name}', sans-serif`, name]),
        ...(shared?.assetFonts || []).map(font => [`'${font.family}', sans-serif`, `${font.family} (uploaded)`])
    ];
    if (!choices.some(([value]) => value === v.value)) choices.unshift([v.value, `${v.value} (custom)`]);
    return `<select data-act="value" aria-label="Font family">${choices.map(([value, label]) => `<option value="${esc(value)}"${value === v.value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
        <details class="var-organization"><summary>Custom / system font</summary><input data-act="value" value="${esc(v.value)}" maxlength="120" aria-label="Custom font family"></details>
        <span class="muted">Bind from an overlay's font dropdown. Upload fonts in the Asset Library.</span>`;
}
