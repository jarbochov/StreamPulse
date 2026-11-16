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

export function displaySourceFields(binding = {}, sets = [], catalogId = '') {
    const sourceOptions = [['', 'Whole catalog (no tracker)'], ...sets.map(set => [set.id, set.name || 'Unnamed set'])];
    const fields = [{
        path: 'setId', label: 'Tracker owner set', value: binding.setId || '', options: sourceOptions
    }];
    const sourceSet = sets.find(set => set.id === binding.setId);
    if (sourceSet) {
        fields.push({
            path: 'selector', label: 'Owner entry', value: binding.selector || 'active',
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
        if (binding.path?.length >= 4) {
            const currentSet = sets.find(set => set.id === binding.path.reduce((id, key) => {
                const parent = sets.find(candidate => candidate.id === id);
                return selectedField(parent, key)?.targetSet || '';
            }, sourceSet.id));
            if (currentSet) {
                fields.push({
                    path: 'tracker', label: 'Checklist tracker', value: binding.tracker || '',
                    options: [['', 'Choose a tracker'], ...(currentSet.fields || [])
                        .filter(field => field.type === 'checklist' && field.targetSet === catalogId)
                        .map(field => [field.key, field.label || field.key])]
                });
            }
        } else {
            let currentSet = sourceSet;
            for (const key of path) currentSet = sets.find(set => set.id === selectedField(currentSet, key)?.targetSet);
            if (currentSet) {
                fields.push({
                    path: 'tracker', label: 'Checklist tracker', value: binding.tracker || '',
                    options: [['', 'Choose a tracker'], ...(currentSet.fields || [])
                        .filter(field => field.type === 'checklist' && field.targetSet === catalogId)
                        .map(field => [field.key, field.label || field.key])]
                });
            }
        }
    }
    fields.push({
        path: 'showMode', label: 'Untracked items', value: binding.showMode || 'dim',
        options: [['dim', 'Dim inactive items'], ['active', 'Show active items only']]
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
        return binding;
    }
    const pathMatch = /^path\.(\d)$/.exec(path);
    if (pathMatch) {
        const index = Number(pathMatch[1]);
        const nextPath = Array.isArray(binding.path) ? binding.path.slice(0, index) : [];
        if (value) nextPath.push(value);
        binding.path = nextPath.slice(0, 4);
        binding.tracker = '';
        return binding;
    }
    binding[path] = value;
    return binding;
}
