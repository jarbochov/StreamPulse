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

export function displaySourceFields(binding = {}, sets = [], catalogId = '', kind = 'inventory', variables = [], definition = null) {
    if (kind === 'counter' || kind === 'meter' || kind === 'ticker') {
        const cfg = definition?.[kind] || {};
        if (cfg.sourceMode === 'set') {
            return [
                {
                    path: 'setId',
                    label: 'Source Variable Set',
                    value: binding.setId || '',
                    options: [['', 'Design Variable Set'], ...sets.map(set => [set.id, set.name || 'Unnamed set'])]
                },
                {
                    path: 'rows',
                    label: 'Rows',
                    value: binding.rows || cfg.rowScope || 'all',
                    options: [
                        ['all', 'All enabled entries'],
                        ['active', 'Active entry'],
                        ['slots', 'Live slots'],
                        ['group', 'In Group entries'],
                        ['group-slots', 'In Group live slots']
                    ]
                }
            ];
        }
        const allowedVars = kind === 'ticker'
            ? (Array.isArray(variables) ? variables : []).filter(v => !v.setId && v.type === 'list')
            : (Array.isArray(variables) ? variables : []).filter(v => !v.setId && (v.type === 'counter' || v.type === 'number'));
        return [{
            path: 'variableName',
            label: kind === 'ticker' ? 'Override list variable (optional)' : 'Override counter variable (optional)',
            value: binding.variableName || '',
            options: [
                ['', `Use design ${kind === 'ticker' ? 'feed' : 'counters'}`],
                ...allowedVars.map(v => [v.name, kind === 'ticker' ? `${v.name} (${(v.items || []).length} items)` : `${v.name} (${v.value ?? 0}${v.max !== '' && v.max != null ? ` / ${v.max}` : ''})`])
            ]
        }];
    }
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

export function displaySourceSummary(binding = {}, sets = [], definition, enabled = true, variables = []) {
    if (!definition) return { ok: false, chain: 'Saved design', message: 'Choose an available saved design.' };
    if (definition.kind === 'counter' || definition.kind === 'meter' || definition.kind === 'ticker') {
        const kind = definition.kind;
        const cfg = definition[kind] || {};
        if (binding?.variableName) {
            const found = (variables || []).find(v => v.name === binding.variableName);
            return found
                ? { ok: true, chain: `${definition.name} → ${found.name}`, message: `Tracking live variable "${found.name}".` }
                : { ok: false, chain: `${definition.name} → ${binding.variableName}`, message: `Variable "${binding.variableName}" was not found.` };
        }
        if (cfg.sourceMode === 'set') {
            if (!enabled) return { ok: false, chain: 'Variable Sets disabled', message: 'Enable Variable Sets in System Config to track Variable Set displays.' };
            const setObj = sets.find(s => s.id === (binding.setId || definition.catalogId));
            if (!setObj) return { ok: false, chain: definition.name, message: 'Choose a Variable Set in Step 1.' };
            const rows = (setObj.roster || []).filter(r => r.enabled !== false).length;
            return { ok: rows > 0, chain: `${setObj.name || setObj.id}`, message: rows ? `Showing ${rows} enabled ${rows === 1 ? 'entry' : 'entries'} from ${setObj.name || setObj.id}.` : 'This Variable Set has no enabled entries yet.' };
        }
        if (kind === 'ticker') {
            if (!cfg.listVariable) return { ok: false, chain: definition.name, message: 'Choose a List variable in Step 1.' };
            const found = (variables || []).find(v => v.name === cfg.listVariable);
            const items = Array.isArray(found?.items) ? found.items.length : 0;
            return { ok: items > 0, chain: `${definition.name} → ${cfg.listVariable}`, message: items ? `Scrolling ${items} ${items === 1 ? 'item' : 'items'} from ${cfg.listVariable}.` : `List "${cfg.listVariable}" has no items yet.` };
        }
        const count = (cfg.variables || []).length;
        if (!count) return { ok: false, chain: definition.name, message: 'Add at least one Counter or Number variable in Step 1.' };
        return { ok: true, chain: `${definition.name} · ${count} ${count === 1 ? 'source' : 'sources'}`, message: `Tracking ${cfg.variables.map(v => v.label || v.name).join(', ')}.` };
    }
    if (!enabled) return { ok: false, chain: 'Variable Sets disabled', message: 'Enable Variable Sets in System Config to use live data displays.' };
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
