const { resolveDisplayOwner } = require('./display-source.cjs');
const id = value => String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
const fieldPath = value => String(value || '').split('.').slice(0, 5).map(part => part === '$label' ? part : id(part)).filter(Boolean).join('.');
const bound = (value, fallback, min, max) => Number.isFinite(Number(value)) && value != null && value !== '' ? Math.min(max, Math.max(min, Number(value))) : fallback;

function normalizeDisplayTable(input = {}) {
    const seen = new Set();
    const columns = (Array.isArray(input.columns) ? input.columns : []).slice(0, 12).map(column => {
        const key = fieldPath(column.key);
        if (!key || seen.has(key)) throw new Error('Choose a unique field for each table column');
        seen.add(key);
        return {
            key, label: String(column.label || key).slice(0, 80),
            width: bound(column.width, 1, 0.25, 10),
            type: ['text', 'image', 'color', 'toggle'].includes(column.type) ? column.type : 'text',
            align: ['left', 'center', 'right'].includes(column.align) ? column.align : 'left'
        };
    });
    return {
        columns: columns.length ? columns : [{ key: '$label', label: 'Name', width: 1, type: 'text', align: 'left' }],
        showHeader: input.showHeader !== false,
        rowHeight: bound(input.rowHeight, 44, 20, 200),
        headerHeight: bound(input.headerHeight, 40, 20, 200),
        alternateColor: /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(input.alternateColor || '') ? input.alternateColor : '#ffffff0a',
        sortKey: fieldPath(input.sortKey),
        sortDirection: input.sortDirection === 'desc' ? 'desc' : 'asc',
        rowOrder: [...new Set((Array.isArray(input.rowOrder) ? input.rowOrder : []).slice(0, 200).map(id).filter(Boolean))],
        maxRows: Math.round(bound(input.maxRows, 60, 1, 200))
    };
}

function displayFieldValue(sets, set, entry, path) {
    const keys = String(path || '').split('.');
    for (let index = 0; index < keys.length && index < 5; index++) {
        const key = keys[index];
        if (key === '$label') return { value: entry?.label || '', type: 'text' };
        const field = set?.fields?.find(candidate => candidate.key === key);
        let value = entry?.values?.[key];
        if (!field) return { value: '', type: 'text' };
        if (index < keys.length - 1) {
            if (field.type !== 'ref') return { value: '', type: 'text' };
            set = sets.find(candidate => candidate.id === field.targetSet);
            entry = set?.roster?.find(candidate => candidate.id === value);
            continue;
        }
        if (['ref', 'ref_list', 'checklist'].includes(field.type)) {
            const target = sets.find(candidate => candidate.id === field.targetSet);
            const ids = field.type === 'ref' ? [value] : field.type === 'ref_list' ? (Array.isArray(value) ? value : []) : Object.keys(value || {}).filter(id => Number(value[id]) > 0);
            value = ids.map(id => target?.roster?.find(candidate => candidate.id === id)?.label || '').filter(Boolean).join(', ');
        }
        return { value: value ?? '', type: field.type };
    }
    return { value: '', type: 'text' };
}

function getDisplayRows(sets = [], definition, binding = {}) {
    const catalog = sets.find(set => set.id === definition.catalogId);
    if (!catalog) return { set: null, entries: [] };
    const source = binding.setId ? resolveDisplayOwner(sets, binding) : { set: catalog };
    let entries;
    const linkedKeys = binding.listField ? [binding.listField] : binding.fields || [];
    if (linkedKeys.length) {
        const ids = linkedKeys.flatMap(key => {
            const field = source.set?.fields?.find(field => field.key === key && ['ref', 'ref_list'].includes(field.type) && field.targetSet === catalog.id);
            const value = source.entry?.values?.[key];
            return !field ? [] : field.type === 'ref' ? [value] : Array.isArray(value) ? value : [];
        });
        entries = [...new Set(ids)].map(id => catalog.roster?.find(entry => entry.id === id)).filter(Boolean);
    } else if (source.set?.id !== catalog.id) entries = [];
    else if (binding.path?.length || binding.rows === 'active') {
        const owner = binding.setId ? source.entry : resolveDisplayOwner(sets, { ...binding, setId: catalog.id }).entry;
        entries = owner ? [owner] : [];
    } else if (binding.rows === 'slots') {
        entries = [...new Set(catalog.slots || [])].map(id => catalog.roster?.find(entry => entry.id === id)).filter(Boolean);
    } else if (binding.rows === 'group') entries = catalog.roster?.filter(entry => entry.inGroup) || [];
    else if (binding.rows === 'ordered') entries = (definition.table?.rowOrder || []).map(id => catalog.roster?.find(entry => entry.id === id)).filter(Boolean);
    else entries = [...(catalog.roster || [])];
    entries = entries.filter(entry => entry.enabled !== false);
    const order = new Map((definition.table?.rowOrder || []).map((id, index) => [id, index]));
    if (order.size && !['slots', 'ordered'].includes(binding.rows) && !linkedKeys.length) entries.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    if (definition.table?.sortKey) {
        const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        entries.sort((a, b) => {
            const av = displayFieldValue(sets, catalog, a, definition.table.sortKey).value;
            const bv = displayFieldValue(sets, catalog, b, definition.table.sortKey).value;
            return compare.compare(String(av), String(bv)) * (definition.table.sortDirection === 'desc' ? -1 : 1);
        });
    }
    return { set: catalog, entries: entries.slice(0, definition.table?.maxRows || 200) };
}

module.exports = { normalizeDisplayTable, displayFieldValue, getDisplayRows };
