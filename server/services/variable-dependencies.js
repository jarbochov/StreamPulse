// Inspect only structured links and recognized placeholders, never arbitrary ID-like text.
module.exports = function createVariableDependencies({
    getSets = () => [], getDisplays = () => [], getOverlays = () => [],
    getPresets = () => [], getVariables = () => []
} = {}) {
    const array = value => Array.isArray(value) ? value : Object.values(value || {});
    const parse = (value, fallback) => {
        if (typeof value !== 'string') return value ?? fallback;
        try { return JSON.parse(value); } catch { return fallback; }
    };
    function inspect(setId, entryId, displayId) {
        const sets = array(getSets());
        const uses = new Map();
        const add = (kind, id, label) => uses.set(`${kind}:${id}:${label}`, { kind, id, label });
        const hasEntry = (field, value) => field.type === 'ref' ? value === entryId
            : field.type === 'ref_list' ? array(parse(value, [])).includes(entryId)
                : Object.hasOwn(parse(value, {}) || {}, entryId);
        const generatedNames = new Set(array(getVariables()).filter(variable => variable.setId === setId).map(variable => variable.name));
        function tokens(value, kind, id, label) {
            if (typeof value !== 'string' || displayId) return;
            for (const match of value.matchAll(/\{\{\s*var\.([a-z0-9_.]+)(?:\s*\|[^{}]*)?\s*\}\}/gi)) {
                const [base, ...suffix] = match[1].split('.');
                if (!entryId && suffix.length) {
                    for (const source of sets) {
                        const field = source.fields?.find(field => {
                            const prefix = `${source.id}_`;
                            return base.startsWith(prefix) && base.endsWith(`_${field.key}`)
                                && /^\d+$/.test(base.slice(prefix.length, -(field.key.length + 1)));
                        });
                        let linked = field;
                        for (let index = 0; linked?.targetSet && index <= 8; index += 2) {
                            if (linked.targetSet === setId) add(kind, id, `${label} — placeholder ${match[0]}`);
                            const nextSet = sets.find(set => set.id === linked.targetSet);
                            linked = suffix[index] === 'field' ? nextSet?.fields?.find(field => field.key === suffix[index + 1]) : null;
                        }
                    }
                }
                if (!generatedNames.has(base)) continue;
                // Variable tokens select dynamic slots/groups, not fixed roster entries.
                if (!entryId) add(kind, id, `${label} — placeholder ${match[0]}`);
            }
        }
        function walk(value, visitor) {
            if (!value || typeof value !== 'object') { visitor(value); return; }
            visitor(value);
            for (const child of Object.values(value)) walk(child, visitor);
        }
        if (!displayId) {
            for (const source of sets) {
                if (!entryId && source.id === setId) continue;
                for (const field of source.fields || []) {
                    if (field.targetSet !== setId || !['ref', 'ref_list', 'checklist'].includes(field.type)) continue;
                    if (!entryId) add('set', source.id, `Set "${source.name}" — linked field "${field.label}"`);
                    else for (const entry of source.roster || []) {
                        if (source.id === setId && entry.id === entryId) continue;
                        if (hasEntry(field, entry.values?.[field.key])) add('entry', `${source.id}/${entry.id}`, `Set "${source.name}" / "${entry.label}" — ${field.label}`);
                    }
                }
                const saved = entryId && source.id === setId ? { ...source, roster: source.roster.filter(entry => entry.id !== entryId) } : source;
                walk(saved, value => tokens(value, 'set', source.id, `Set "${source.name}"`));
            }
            for (const display of array(getDisplays())) {
                const label = `Display "${display.name || display.id}"`;
                walk(display, value => tokens(value, 'display', display.id, label));
                if (display.catalogId === setId) {
                    if (!entryId) add('display', display.id, `${label} — item catalog`);
                    else if ((display.sections || []).some(section => section.items?.some(item => item.itemId === entryId))
                        || display.table?.rowOrder?.includes(entryId)) add('display', display.id, `${label} — saved item / row`);
                }
                // Table column ref paths depend on every traversed catalog.
                if (!entryId) {
                    for (const column of [...(display.table?.columns || []), { key: display.table?.sortKey }]) {
                        let source = sets.find(set => set.id === display.catalogId);
                        for (const key of String(column.key || '').split('.')) {
                            const field = source?.fields?.find(field => field.key === key);
                            if (!field?.targetSet) break;
                            if (field.targetSet === setId) add('display', display.id, `${label} — table column "${column.label || column.key}"`);
                            source = sets.find(set => set.id === field.targetSet);
                        }
                    }
                }
            }
        }
        function bindingUses(binding, kind, id, label) {
            if (!binding || typeof binding !== 'object') return;
            if (displayId) {
                if (binding.displayId === displayId) add(kind, id, `${label} — display binding`);
                return;
            }
            let source = sets.find(set => set.id === binding.setId);
            if (binding.setId === setId && (!entryId || binding.selector === `entry:${entryId}`)) add(kind, id, `${label} — source ${entryId ? 'entry' : 'set'}`);
            for (const key of binding.path || []) {
                const field = source?.fields?.find(field => field.key === key);
                if (field?.type !== 'ref' || !field.targetSet) { source = undefined; break; }
                if (!entryId && field.targetSet === setId) add(kind, id, `${label} — linked role "${field.label}"`);
                source = sets.find(set => set.id === field.targetSet);
            }
            for (const key of [...(binding.fields || []), binding.tracker].filter(Boolean)) {
                const field = source?.fields?.find(field => field.key === key);
                if (!entryId && field?.targetSet === setId) add(kind, id, `${label} — linked role "${field.label}"`);
            }
        }
        for (const [kind, records] of [['overlay', getOverlays()], ['preset', getPresets()]]) {
            for (const record of array(records)) {
                const label = `${kind === 'overlay' ? 'Overlay' : 'Preset'} "${record.name || record.id}"`;
                walk(record, value => {
                    tokens(value, kind, record.id, label);
                    if (value && typeof value === 'object' && value.type === 'data-display') bindingUses(value.display, kind, record.id, `${label} / "${value.name || value.id || 'display'}"`);
                });
            }
        }
        if (!displayId) for (const variable of array(getVariables())) {
            if (variable.setId) continue; // Materialized values are derived, not independent saved uses.
            tokens(variable.value, 'variable', variable.name, `Variable "${variable.name}"`);
        }
        return [...uses.values()];
    }
    function forField(setId, fieldKey) {
        const sets = array(getSets());
        const source = sets.find(set => set.id === setId);
        const uses = new Map();
        const add = (kind, id, label) => uses.set(`${kind}:${id}:${label}`, { kind, id, label });
        const aliases = (set, key) => [
            `${set.id}_${key}`, `${set.id}_group_${key}`, ...(set.slotsCount > 0 ? [`${set.id}_joined_${key}`] : []),
            ...Array.from({ length: set.slotsCount || 0 }, (_, index) => `${set.id}_${index + 1}_${key}`),
            ...(set.slotNames || []).filter(Boolean).map(name => `${set.id}_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)}_${key}`)
        ];
        const names = new Set(source ? aliases(source, fieldKey) : []);
        function fieldPath(rootId, keys, kind, id, label) {
            let current = sets.find(set => set.id === rootId);
            for (const key of keys.filter(Boolean)) {
                if (current?.id === setId && key === fieldKey) add(kind, id, label);
                const field = current?.fields?.find(field => field.key === key);
                current = ['ref', 'ref_list', 'checklist'].includes(field?.type) ? sets.find(set => set.id === field.targetSet) : undefined;
            }
        }
        function walk(value, kind, id, label) {
            if (typeof value === 'string') {
                for (const match of value.matchAll(/\{\{\s*var\.([a-z0-9_.]+)(?:\s*\|[^{}]*)?\s*\}\}/gi)) {
                    const [base, ...suffix] = match[1].split('.');
                    if (names.has(base)) add(kind, id, `${label} — placeholder ${match[0]}`);
                    for (const root of sets) for (const field of root.fields || []) {
                        // Existing one-hop underscore aliases remain supported.
                        if (field.type === 'ref' && field.targetSet === setId && aliases(root, `${field.key}_${fieldKey}`).includes(base)) add(kind, id, `${label} — placeholder ${match[0]}`);
                        if (!aliases(root, field.key).includes(base)) continue;
                        const keys = [field.key];
                        for (let index = 0; index < suffix.length; index += 2) {
                            if (suffix[index] === 'field') keys.push(suffix[index + 1]);
                        }
                        fieldPath(root.id, keys, kind, id, `${label} — placeholder ${match[0]}`);
                    }
                }
                return;
            }
            if (!value || typeof value !== 'object') return;
            if (value.type === 'data-display' && value.display) {
                const binding = value.display;
                fieldPath(binding.setId, binding.path || [], kind, id, `${label} — linked source path`);
                let owner = sets.find(set => set.id === binding.setId);
                for (const key of binding.path || []) {
                    const field = owner?.fields?.find(field => field.key === key);
                    owner = field?.type === 'ref' ? sets.find(set => set.id === field.targetSet) : undefined;
                }
                if (owner?.id === setId && [...(binding.fields || []), binding.tracker].includes(fieldKey)) add(kind, id, `${label} — linked selection / tracker "${fieldKey}"`);
            }
            for (const child of Object.values(value)) walk(child, kind, id, label);
        }
        for (const display of array(getDisplays())) {
            const label = `Display "${display.name || display.id}"`;
            if (display.catalogId === setId && display.kind !== 'table' && [display.imageField, display.labelField].includes(fieldKey)) add('display', display.id, `${label} — image / label field "${fieldKey}"`);
            if (display.catalogId === setId && display.kind === 'badge') {
                const badge = display.badge?.imageGroup || {};
                const keys = [badge.imageField, badge.labelField, badge.subField, ...(badge.fields || []).map(field => field.key)];
                if (keys.includes(fieldKey) || new RegExp(`@${fieldKey}\\b`, 'i').test(JSON.stringify(display.badge || {}))) {
                    add('display', display.id, `${label} — badge field "${fieldKey}"`);
                }
            }
            walk(display, 'display', display.id, label);
            for (const column of [...(display.table?.columns || []), { key: display.table?.sortKey }]) {
                fieldPath(display.catalogId, String(column.key || '').split('.'), 'display', display.id, `${label} — table column "${column.label || column.key}"`);
            }
        }
        for (const [kind, records] of [['overlay', getOverlays()], ['preset', getPresets()], ['set', sets], ['variable', array(getVariables()).filter(variable => !variable.setId)]]) {
            for (const record of array(records)) walk(record, kind, record.id || record.name, `${kind} "${record.name || record.id}"`);
        }
        if (source) {
            const pattern = new RegExp(`@${fieldKey}\\b`, 'i');
            if (pattern.test(source.group?.itemTemplate || '')) add('set', setId, `Set "${source.name}" — group item template`);
            for (const entry of source.roster || []) for (const field of source.fields || []) {
                if (field.key !== fieldKey && field.type === 'template' && pattern.test(entry.values?.[field.key] || '')) add('entry', `${setId}/${entry.id}`, `Set "${source.name}" / "${entry.label}" — template "${field.label}"`);
            }
        }
        return [...uses.values()];
    }
    return {
        forSet: (id, entryId) => inspect(id, entryId),
        forDisplay: id => inspect(undefined, undefined, id),
        forField
    };
};
