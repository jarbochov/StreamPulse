import { getDisplayRows, displayFieldValue } from '../../../shared/display-table.cjs';
import { expandVariables } from './variables.js';

export function renderDisplayTable(host, element, status, definition) {
    const { set, entries } = getDisplayRows(status.variableSets, definition, element.display);
    if (!set || (!entries.length && (element.display?.setId || ['active', 'slots', 'group', 'ordered'].includes(element.display?.rows)))) return false;
    const config = definition.table;
    const style = definition.style;
    const rowHeight = Math.max(config.rowHeight, style.fontSize * 1.25 + style.borderWidth);
    const headerHeight = Math.max(config.headerHeight, style.fontSize * 1.25 + style.borderWidth);
    const root = document.createElement('div');
    root.className = 'sp-variable-display sp-display-table';
    Object.assign(root.style, { width: '100%', height: '100%', containerType: 'size', overflow: 'hidden' });
    const width = Math.max(240, config.columns.reduce((sum, column) => sum + column.width * 160, 0)) + style.padding * 2;
    const height = Math.max(1, style.padding * 2 + entries.length * rowHeight + (config.showHeader ? headerHeight : 0));
    root.style.setProperty('--display-unit', `min(calc(100cqw / ${width}), calc(100cqh / ${height}))`);
    const px = value => `calc(var(--display-unit) * ${value})`;
    const table = document.createElement('table');
    Object.assign(table.style, { width: px(width), tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '0', padding: px(style.padding), background: style.background, color: style.color, fontSize: px(style.fontSize), lineHeight: '1.25', fontFamily: style.fontFamily, borderRadius: px(style.radius), overflow: 'hidden' });
    const weights = config.columns.reduce((sum, column) => sum + column.width, 0);
    const columns = document.createElement('colgroup');
    for (const column of config.columns) {
        const col = document.createElement('col');
        col.style.width = `${column.width / weights * 100}%`;
        columns.append(col);
    }
    table.append(columns);
    const cellStyle = (cell, column, height) => Object.assign(cell.style, {
        height: px(height), maxHeight: px(height), boxSizing: 'border-box', padding: `0 ${px(8)}`,
        textAlign: column.align, verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        borderBottom: `${px(style.borderWidth)} solid ${style.borderColor}`
    });
    if (config.showHeader) {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        tr.style.background = style.cellBackground;
        for (const column of config.columns) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = column.label;
            cellStyle(th, column, headerHeight);
            tr.append(th);
        }
        thead.append(tr);
        table.append(thead);
    }
    const tbody = document.createElement('tbody');
    for (const [index, entry] of entries.entries()) {
        const tr = document.createElement('tr');
        tr.dataset.displayRow = entry.id;
        tr.style.background = index % 2 ? config.alternateColor : 'transparent';
        for (const column of config.columns) {
            const td = document.createElement('td');
            td.dataset.displayColumn = column.key;
            cellStyle(td, column, rowHeight);
            const result = displayFieldValue(status.variableSets, set, entry, column.key);
            const value = String(result.value);
            if (column.type === 'image' && value) {
                const image = document.createElement('img');
                image.src = value;
                image.alt = '';
                image.referrerPolicy = 'no-referrer';
                Object.assign(image.style, { height: px(rowHeight - 8), maxWidth: '100%', objectFit: 'contain', display: 'block' });
                td.append(image);
            } else if (column.type === 'color' && /^#[a-f0-9]{3,8}$/i.test(value)) {
                const swatch = document.createElement('span');
                swatch.title = value;
                Object.assign(swatch.style, { display: 'inline-block', width: px(16), height: px(16), borderRadius: px(3), background: value });
                td.append(swatch);
            } else {
                td.textContent = value === '' ? '' : column.type === 'toggle' || result.type === 'toggle' ? (result.value === true || value === 'true' || value === '1' ? 'Yes' : 'No')
                    : result.type === 'template' ? expandVariables(value, status, {}, false) : value;
                td.title = td.textContent;
            }
            tr.append(td);
        }
        tbody.append(tr);
    }
    table.append(tbody);
    root.append(table);
    host.append(root);
    return true;
}
