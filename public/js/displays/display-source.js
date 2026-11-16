const setLabel = set => set?.name || 'Unnamed set';

function selectorOptions(set, binding) {
    const options = [['active', 'Active entry']];
    const count = Math.max(0, Number(set?.slotsCount) || Number(set?.slots?.length) || 0);
    for (let index = 1; index <= count; index++) options.push([`slot:${index}`, set?.slotNames?.[index - 1] || `Slot ${index}`]);
    for (const entry of set?.roster || []) options.push([`entry:${entry.id}`, entry.label || 'Unnamed entry']);
    if (binding.selector?.startsWith('slot:') && !options.some(([value]) => value === binding.selector)) {
        options.push([binding.selector, `Player ${Number(binding.selector.slice(5)) || 1} slot`]);
    }
    if (binding.selector?.startsWith('entry:') && !options.some(([value]) => value === binding.selector)) {
        const id = binding.selector.slice(6);
        options.push([binding.selector, set?.roster?.find(entry => entry.id === id)?.label || 'Selected entry']);
    }
    return options;
}

function selectedField(set, fieldKey) {
    return set?.fields?.find(field => field.key === fieldKey && field.type === 'ref');
}

export function displaySourceFields(binding = {}, sets = [], catalogId = '', kind = 'inventory') {
    const inventory = kind === 'inventory', tracks = inventory || kind === 'badge';
    const sourceOptions = [['', inventory ? 'Whole catalog (no tracker)' : 'Design catalog'], ...sets.map(set => [set.id, set.name || 'Unnamed set'])];
    const fields = [{
        path: 'setId', label: inventory ? 'Tracker owner set' : 'Source set', value: binding.setId || '', options: sourceOptions
    }];
    const sourceSet = sets.find(set => set.id === binding.setId);
    if (sourceSet) {
        if (inventory || binding.rows === 'active' || (sourceSet.fields || []).some(field => ['ref', 'ref_list', 'checklist'].includes(field.type))) fields.push({
            path: 'selector', label: inventory ? 'Tracker owner entry' : 'Source entry', value: binding.selector || 'active',
            options: selectorOptions(sourceSet, binding)
        });
        let current = sourceSet;
        const path = Array.isArray(binding.path) ? binding.path : [];
        for (let index = 0; index < Math.min(path.length + 1, 4); index++) {
            const fieldKey = path[index];
            const refs = (current?.fields || []).filter(field => field.type === 'ref' && sets.some(set => set.id === field.targetSet));
            if (!refs.length && !fieldKey) break;
            const options = [['', 'Stop at this set'], ...refs.map(field => [
                field.key, `${field.label || field.key} → ${setLabel(sets.find(set => set.id === field.targetSet))}`
            ])];
            if (fieldKey && !options.some(([value]) => value === fieldKey)) {
                options.push([fieldKey, `${fieldKey} → linked set unavailable`]);
            }
            fields.push({
                path: `path.${index}`, label: index === 0 ? 'Linked role' : `Linked role · level ${index + 1}`,
                value: fieldKey || '', options
            });
            if (!fieldKey) break;
            const reference = selectedField(current, fieldKey);
            current = sets.find(set => set.id === reference?.targetSet);
            if (!current) break;
        }
        let currentSet = sourceSet;
        for (const key of path) currentSet = sets.find(set => set.id === selectedField(currentSet, key)?.targetSet);
        if (!inventory && !binding.tracker) {
            const members = (currentSet?.fields || []).filter(field => ['ref', 'ref_list'].includes(field.type) && field.targetSet === catalogId);
            const options = members.map(field => [field.key, field.label || field.key]);
            for (const key of binding.fields || []) if (!options.some(([value]) => value === key)) options.push([key, `${key} (unavailable)`]);
            if (options.length) fields.push({
                path: 'fields', label: 'Linked members', value: binding.fields || [], multiple: true, options
            });
        }
        if (tracks && (inventory || binding.tracker || (currentSet?.fields || []).some(field => field.type === 'checklist' && field.targetSet === catalogId)) && !(binding.fields || []).length) {
            fields.push({
                path: 'tracker', label: 'Progress tracker', value: binding.tracker || '',
                options: [['', inventory ? 'Choose a tracker' : 'No tracker'], ...(currentSet?.fields || [])
                    .filter(field => field.type === 'checklist' && field.targetSet === catalogId)
                    .map(field => [field.key, field.label || field.key])]
            });
        }
    }
    if (inventory || binding.tracker) fields.push({
        path: 'showMode', label: 'Untracked items', value: binding.showMode || 'dim',
        options: [['dim', 'Dim inactive items'], ['active', 'Show active items only']]
    });
    else if (!(binding.fields || []).length && !(binding.path || []).length) fields.push({
        path: 'rows', label: kind === 'table' ? 'Rows' : 'Members', value: binding.rows || 'all',
        options: [['all', 'All enabled entries'], ['active', 'Active entry'], ['slots', 'Live slots'], ['group', 'In Group entries'], ['group-slots', 'In Group live slots'], ...(kind === 'table' ? [['ordered', 'Saved row order only']] : [])]
    });
    return fields;
}

export function updateDisplaySource(binding, path, value) {
    if (!binding || typeof binding !== 'object') return binding;
    if (path === 'setId') {
        binding.setId = value || '';
        binding.selector = 'active';
        binding.path = [];
        binding.tracker = '';
        binding.fields = [];
        return binding;
    }
    const pathMatch = /^path\.(\d)$/.exec(path);
    if (pathMatch) {
        const index = Number(pathMatch[1]);
        const nextPath = Array.isArray(binding.path) ? binding.path.slice(0, index) : [];
        if (value) nextPath.push(value);
        binding.path = nextPath.slice(0, 4);
        binding.tracker = '';
        binding.fields = [];
        return binding;
    }
    if (path === 'fields') binding.tracker = '';
    if (path === 'tracker') binding.fields = [];
    binding[path] = value;
    return binding;
}

export function displaySourceSummary(binding = {}, sets = [], definition, enabled = true) {
    if (!enabled) return { ok: false, chain: 'Variable Sets disabled', message: 'Enable Variable Sets in System Config to use live data displays.' };
    if (!definition) return { ok: false, chain: 'Saved design', message: 'Choose an available saved design.' };
    const catalog = sets.find(set => set.id === definition.catalogId);
    if (!catalog) return { ok: false, chain: definition.name, message: 'The design catalog is missing. Choose another catalog in Display Library.' };
    const shared = window.OverlayShared;
    const parts = [binding.setId ? sets.find(set => set.id === binding.setId)?.name || 'Missing source set' : catalog.name || 'Catalog'];
    let current = sets.find(set => set.id === binding.setId);
    const needsOwner = definition.kind === 'inventory' && binding.setId || binding.tracker || binding.fields?.length || binding.path?.length || binding.rows === 'active';
    if (binding.setId && needsOwner) {
        const selector = binding.selector || 'active';
        parts.push(selector.startsWith('entry:') ? current?.roster?.find(entry => entry.id === selector.slice(6))?.label || 'Missing entry'
            : selector.startsWith('slot:') ? current?.slotNames?.[Number(selector.slice(5)) - 1] || `Slot ${selector.slice(5)}` : 'Active entry');
    }
    for (const key of binding.path || []) {
        const field = current?.fields?.find(field => field.key === key && field.type === 'ref');
        parts.push(field?.label || `${key} (missing role)`);
        current = sets.find(set => set.id === field?.targetSet);
    }
    const { set, entry } = shared?.resolveDisplayOwner?.(sets, binding) || {};
    if (binding.setId && needsOwner && !entry) return { ok: false, chain: parts.join(' → '), message: 'No enabled entry resolves here. Assign the slot or linked role in Variable Set Operator.' };
    if (binding.setId && !set) return { ok: false, chain: parts.join(' → '), message: 'The selected source set is missing.' };
    if (binding.tracker || definition.kind === 'inventory' && binding.setId) {
        const tracker = set?.fields?.find(field => field.key === binding.tracker && field.type === 'checklist' && field.targetSet === catalog.id);
        if (!tracker) return { ok: false, chain: parts.join(' → '), message: 'Choose a progress tracker linked to this design catalog.' };
        parts.push(tracker.label || tracker.key);
    }
    if (binding.fields?.length) {
        const fields = binding.fields.map(key => set?.fields?.find(field => field.key === key && ['ref', 'ref_list'].includes(field.type) && field.targetSet === catalog.id));
        if (fields.some(field => !field)) return { ok: false, chain: parts.join(' → '), message: 'A linked member field is missing or targets a different catalog.' };
        parts.push(fields.map(field => field.label || field.key).join(' + '));
    }
    if (definition.kind === 'inventory') {
        const count = (definition.sections || []).flatMap(section => section.items || []).filter(item => catalog.roster?.some(entry => entry.id === item.itemId && entry.enabled !== false)).length;
        return { ok: count > 0, chain: parts.join(' → '), message: count ? `${entry ? `Owner: ${entry.label}. ` : ''}${count} enabled arranged item${count === 1 ? '' : 's'}.` : 'No enabled arranged items. Add items in Display Library or enable them in Variable Sets.' };
    }
    const count = shared?.getDisplayRows?.(sets, definition, binding)?.entries.length || 0;
    return { ok: count > 0, chain: parts.join(' → '), message: count ? `${entry && needsOwner ? `Resolved: ${entry.label}. ` : ''}${count} enabled ${definition.kind === 'table' ? 'row' : 'member'}${count === 1 ? '' : 's'}.` : 'No enabled entries match this selection. Check linked members, slots, grouping, and Enabled flags in Variable Set Operator.' };
}
