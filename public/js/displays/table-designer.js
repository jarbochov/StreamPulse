import { F, esc, setPath } from './display-form.js';

export const defaultTable = () => ({
    columns: [{ key: '$label', label: 'Name', width: 2, type: 'text', align: 'left' }],
    showHeader: true, rowHeight: 44, headerHeight: 40, alternateColor: '#ffffff0a',
    sortKey: '', sortDirection: 'asc', rowOrder: [], maxRows: 60
});

export function tableFieldOptions(sets, set, prefix = '', depth = 0, labelPrefix = '') {
    if (!set || depth > 3) return [];
    return [[`${prefix}$label`, `${labelPrefix}Entry label`], ...(set.fields || []).flatMap(field => {
        const label = `${labelPrefix}${field.label || field.key}`;
        if (field.type === 'ref') return tableFieldOptions(sets, sets.find(candidate => candidate.id === field.targetSet), `${prefix}${field.key}.`, depth + 1, `${label} → `);
        if (['ref_list', 'checklist'].includes(field.type)) return [];
        return [[`${prefix}${field.key}`, label]];
    })];
}

export function createTableDesigner(root, context) {
    function render() {
        const draft = context.getDraft(), set = context.getSets().find(set => set.id === draft.catalogId);
        draft.table ||= defaultTable();
        const table = draft.table, choices = tableFieldOptions(context.getSets(), set);
        root.innerHTML = `
            <div class="builder-card-heading"><div><h3>Table columns</h3><p class="display-muted">Choose fields, including linked entry fields. Reorder columns using the arrow controls.</p></div><button class="btn btn-sm" type="button" data-table-add${table.columns.length >= 12 ? ' disabled' : ''}>Add column</button></div>
            <div id="table-column-editor">${table.columns.map((column, index) => `
                <fieldset class="table-column" data-column="${index}"><legend>Column ${index + 1}</legend>
                    <div class="control-grid">${F.select('key', 'Field', column.key, choices.some(([key]) => key === column.key) ? choices : [...choices, [column.key, `${column.key} (unavailable)`]])}
                    ${F.text('label', 'Header label', column.label)}
                    ${F.number('width', 'Relative width', column.width, { min: .2, max: 12, step: .1 })}
                    ${F.select('type', 'Cell type', column.type, [['text', 'Text'], ['image', 'Image'], ['color', 'Color'], ['toggle', 'Toggle']])}
                    ${F.select('align', 'Alignment', column.align, [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])}</div>
                    <div class="bar"><button class="btn btn-sm" type="button" data-table-move="-1" aria-label="Move column ${index + 1} up"${index === 0 ? ' disabled' : ''}>Move up</button><button class="btn btn-sm" type="button" data-table-move="1" aria-label="Move column ${index + 1} down"${index === table.columns.length - 1 ? ' disabled' : ''}>Move down</button><button class="btn btn-sm" type="button" data-table-remove aria-label="Remove column ${index + 1}"${table.columns.length === 1 ? ' disabled' : ''}>Remove</button></div>
                </fieldset>`).join('')}</div>
            <details class="sect" open><summary>Rows &amp; header</summary><div class="control-grid">
                ${F.check('showHeader', 'Show column header', table.showHeader)}
                ${F.number('rowHeight', 'Row height', table.rowHeight, { min: 20, max: 200 })}
                ${F.number('headerHeight', 'Header height', table.headerHeight, { min: 20, max: 200 })}
                ${F.number('maxRows', 'Maximum rows', table.maxRows, { min: 1, max: 200 })}
                ${F.color('alternateColor', 'Alternating row color', table.alternateColor)}
                ${F.select('sortKey', 'Sort rows', table.sortKey, [['', 'Manual / source order'], ...choices])}
                ${F.select('sortDirection', 'Sort direction', table.sortDirection, [['asc', 'Ascending'], ['desc', 'Descending']])}
            </div><p class="display-muted">Row scope is chosen per overlay placement or preview, never saved as a player source in this design.</p>
            <div class="table-row-order" aria-label="Manual row order">${orderedEntries(set, table).map((entry, index, entries) => `<div><span>${esc(entry.label || entry.id)}</span><button class="btn btn-sm" type="button" data-row="${esc(entry.id)}" data-row-move="-1" aria-label="Move ${esc(entry.label || entry.id)} up"${index ? '' : ' disabled'}>Up</button><button class="btn btn-sm" type="button" data-row="${esc(entry.id)}" data-row-move="1" aria-label="Move ${esc(entry.label || entry.id)} down"${index < entries.length - 1 ? '' : ' disabled'}>Down</button></div>`).join('')}</div></details>`;
    }
    function orderedEntries(set, table) {
        const byId = new Map((set?.roster || []).map(entry => [entry.id, entry]));
        return [...new Set([...(table.rowOrder || []), ...byId.keys()])].map(id => byId.get(id)).filter(Boolean);
    }
    root.addEventListener('input', event => {
        const input = event.target.closest('[data-path]');
        if (!input) return;
        const table = context.getDraft().table;
        const column = input.closest('[data-column]');
        const value = input.type === 'checkbox' ? input.checked : input.dataset.kind === 'number' ? Number(input.value) : input.value;
        setPath(column ? table.columns[Number(column.dataset.column)] : table, input.dataset.path, value);
        if (input.type === 'color') input.closest('.color-field').querySelector('.color-text').value = value;
        context.onChange();
    });
    root.addEventListener('change', event => {
        const input = event.target.closest('select[data-path]');
        if (!input) return;
        const column = input.closest('[data-column]');
        setPath(column ? context.getDraft().table.columns[Number(column.dataset.column)] : context.getDraft().table, input.dataset.path, input.value);
        context.onChange();
    });
    root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        const draft = context.getDraft(), table = draft.table;
        const column = button.closest('[data-column]'), index = Number(column?.dataset.column);
        if (button.hasAttribute('data-table-add')) {
            if (table.columns.length >= 12) return;
            const choices = tableFieldOptions(context.getSets(), context.getSets().find(set => set.id === draft.catalogId));
            const [key, label] = choices.find(([key]) => !table.columns.some(column => column.key === key)) || ['$label', 'Name'];
            table.columns.push({ key, label, width: 1, type: 'text', align: 'left' });
        } else if (button.hasAttribute('data-table-remove')) {
            if (table.columns.length > 1) table.columns.splice(index, 1);
        } else if (button.dataset.tableMove) {
            const target = index + Number(button.dataset.tableMove);
            if (table.columns[target]) [table.columns[index], table.columns[target]] = [table.columns[target], table.columns[index]];
        } else if (button.dataset.rowMove) {
            const rows = orderedEntries(context.getSets().find(set => set.id === draft.catalogId), table).map(entry => entry.id);
            const from = rows.indexOf(button.dataset.row), to = from + Number(button.dataset.rowMove);
            if (from >= 0 && to >= 0 && to < rows.length) [rows[from], rows[to]] = [rows[to], rows[from]];
            table.rowOrder = rows;
        } else return;
        context.onChange();
        render();
    });
    return { render };
}
