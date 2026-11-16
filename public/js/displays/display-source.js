const setLabel = set => set?.name || 'Unnamed set';

function selectorOptions(set, binding) {
    const options = [['active', 'Active entry']];
    const count = Math.max(0, Number(set?.slotsCount) || Number(set?.slots?.length) || 0);
    for (let index = 1; index <= count; index++) options.push([`slot:${index}`, `Player ${index} slot`]);
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
    const inventory = kind === 'inventory';
    const sourceOptions = [['', inventory ? 'Whole catalog (no tracker)' : 'Design catalog'], ...sets.map(set => [set.id, set.name || 'Unnamed set'])];
    const fields = [{
        path: 'setId', label: inventory ? 'Tracker owner set' : 'Source set', value: binding.setId || '', options: sourceOptions
    }];
    const sourceSet = sets.find(set => set.id === binding.setId);
    if (sourceSet) {
        fields.push({
            path: 'selector', label: inventory ? 'Tracker owner entry' : 'Source entry', value: binding.selector || 'active',
            options: selectorOptions(sourceSet, binding)
        });
        let current = sourceSet;
        const path = Array.isArray(binding.path) ? binding.path : [];
        for (let index = 0; index < Math.min(path.length + 1, 4); index++) {
            const fieldKey = path[index];
            const refs = (current?.fields || []).filter(field => field.type === 'ref' && sets.some(set => set.id === field.targetSet));
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
        if (!inventory) {
            fields.push({
                path: 'listField', label: 'Linked members', value: binding.listField || '',
                options: [['', 'Use source rows'], ...(currentSet?.fields || []).filter(field => ['ref', 'ref_list'].includes(field.type) && field.targetSet === catalogId).map(field => [field.key, field.label || field.key])]
            });
        } else if (currentSet) {
            fields.push({
                path: 'tracker', label: 'Checklist tracker', value: binding.tracker || '',
                options: [['', 'Choose a tracker'], ...(currentSet.fields || [])
                    .filter(field => field.type === 'checklist' && field.targetSet === catalogId)
                    .map(field => [field.key, field.label || field.key])]
            });
        }
    }
    fields.push(inventory ? {
        path: 'showMode', label: 'Untracked items', value: binding.showMode || 'dim',
        options: [['dim', 'Dim inactive items'], ['active', 'Show active items only']]
    } : {
        path: 'rows', label: kind === 'table' ? 'Rows' : 'Members', value: binding.rows || 'all',
        options: [['all', 'All entries'], ['active', 'Active entry'], ['slots', 'Live slots'], ['group', 'In Group entries'], ...(kind === 'table' ? [['ordered', 'Saved row order only']] : [])]
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
        binding.listField = '';
        binding.fields = [];
        delete binding.badgeSource;
        return binding;
    }
    const pathMatch = /^path\.(\d)$/.exec(path);
    if (pathMatch) {
        const index = Number(pathMatch[1]);
        const nextPath = Array.isArray(binding.path) ? binding.path.slice(0, index) : [];
        if (value) nextPath.push(value);
        binding.path = nextPath.slice(0, 4);
        binding.tracker = '';
        binding.listField = '';
        binding.fields = [];
        delete binding.badgeSource;
        return binding;
    }
    if (path === 'listField') binding.fields = [];
    if (path === 'selector' || path === 'listField' || path === 'rows') delete binding.badgeSource;
    binding[path] = value;
    return binding;
}
