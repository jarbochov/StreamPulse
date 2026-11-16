const key = value => String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
const text = (value, limit = 80) => String(value ?? '').trim().slice(0, limit);
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== '' && value != null ? Math.max(min, Math.min(max, Number(value))) : fallback;
const color = (value, fallback) => /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(value || '') ? value : fallback;

function normalizeDisplay(input = {}, id = input.id) {
    if (input.kind && input.kind !== 'inventory') throw new Error('Unsupported display kind');
    const seen = new Set();
    const sections = (Array.isArray(input.sections) ? input.sections : []).slice(0, 20).map((section, index) => {
        const cells = new Set();
        return {
            id: `section_${index + 1}`,
            title: text(section.title),
            items: (Array.isArray(section.items) ? section.items : []).slice(0, 60).map((item, itemIndex) => {
                const itemId = key(item.itemId);
                const cell = input.layout?.mode === 'fixed' ? Math.round(number(item.cell, itemIndex, 0, 255)) : itemIndex;
                if (!itemId || seen.has(itemId)) throw new Error('Each item may appear once in a display');
                if (cells.has(cell)) throw new Error('Two items cannot occupy the same cell');
                seen.add(itemId);
                cells.add(cell);
                return { itemId, cell };
            })
        };
    });
    if (seen.size > 60) throw new Error('A display supports up to 60 items');
    const style = input.style || {};
    return {
        id: key(id), name: text(input.name) || 'Inventory display', kind: 'inventory',
        catalogId: key(input.catalogId), imageField: key(input.imageField) || 'image', labelField: key(input.labelField) || 'name',
        layout: {
            mode: input.layout?.mode === 'fixed' ? 'fixed' : 'flow',
            columns: Math.round(number(input.layout?.columns, 6, 1, 16)),
            cellWidth: number(input.layout?.cellWidth, 80, 24, 300),
            cellHeight: number(input.layout?.cellHeight, 92, 24, 360),
            gap: number(input.layout?.gap, 8, 0, 80),
            sectionGap: number(input.layout?.sectionGap, 16, 0, 100)
        },
        style: {
            background: color(style.background, '#10182700'), cellBackground: color(style.cellBackground, '#182338cc'),
            color: color(style.color, '#eef4ff'), borderColor: color(style.borderColor, '#ffffff22'),
            borderWidth: number(style.borderWidth, 1, 0, 12), radius: number(style.radius, 8, 0, 100),
            padding: number(style.padding, 12, 0, 100), fontSize: number(style.fontSize, 12, 8, 60),
            fontFamily: text(style.fontFamily, 120).replace(/[;{}<>]/g, '') || 'sans-serif',
            inactiveOpacity: number(style.inactiveOpacity, 0.3, 0, 1),
            showLabels: style.showLabels !== false, showLevels: style.showLevels === true,
            showOwner: style.showOwner === true, showSectionTitles: style.showSectionTitles !== false
        },
        sections: sections.length ? sections : [{ id: 'section_1', title: '', items: [] }]
    };
}

function normalizeDisplayBinding(input = {}) {
    return {
        displayId: key(input.displayId), setId: key(input.setId),
        selector: /^(active|slot:\d{1,2}|entry:[a-z0-9_-]{1,60})$/.test(input.selector || '') ? input.selector : 'active',
        path: (Array.isArray(input.path) ? input.path : []).slice(0, 4).map(key).filter(Boolean),
        tracker: key(input.tracker), showMode: input.showMode === 'active' ? 'active' : 'dim'
    };
}

function resolveDisplayOwner(sets = [], binding = {}) {
    let set = sets.find(candidate => candidate.id === binding.setId);
    const selector = binding.selector || 'active';
    const id = selector.startsWith('entry:') ? selector.slice(6) : selector.startsWith('slot:') ? set?.slots?.[Number(selector.slice(5)) - 1] : set?.slotsCount > 0 ? set.slots?.[0] : set?.activeEntry;
    let entry = set?.roster?.find(candidate => candidate.id === id);
    for (const fieldKey of binding.path || []) {
        const field = set?.fields?.find(candidate => candidate.key === fieldKey && candidate.type === 'ref');
        const nextId = entry?.values?.[fieldKey];
        set = sets.find(candidate => candidate.id === field?.targetSet);
        entry = set?.roster?.find(candidate => candidate.id === nextId);
    }
    return { set, entry };
}

module.exports = { normalizeDisplay, normalizeDisplayBinding, resolveDisplayOwner };
