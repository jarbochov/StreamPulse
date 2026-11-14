export function groupFilterTag(group) {
    return `#${/[\s"]/.test(group) || group.toLowerCase() === 'ungrouped' ? JSON.stringify(group) : group}`;
}

export function groupFilterLink(group) {
    return `#variables#${encodeURIComponent(group.includes('"') || group.toLowerCase() === 'ungrouped' ? JSON.stringify(group) : group)}`;
}

export function groupQueryFromFragment(fragment) {
    if (!fragment) return '';
    let group;
    try { group = decodeURIComponent(fragment); } catch { group = fragment; }
    if (group.toLowerCase() === 'ungrouped') return '#ungrouped';
    if (group.startsWith('"')) {
        try {
            const decoded = JSON.parse(group);
            if (typeof decoded === 'string') group = decoded;
        } catch { /* treat malformed fragments as literal names */ }
    }
    return groupFilterTag(group);
}

export function parseVariableQuery(raw, groups = []) {
    const match = /(?:^|\s)#("(?:[^"\\]|\\.)*"|[^\s"]+)/.exec(raw);
    let group = '', quoted = false;
    if (match) {
        quoted = match[1].startsWith('"');
        try { group = quoted ? JSON.parse(match[1]) : match[1]; }
        catch { return { text: raw.trim(), group: '', hasGroup: false, groups: [], ungrouped: false }; }
    }
    const lower = group.toLowerCase();
    const exact = groups.filter(name => name.toLowerCase() === lower);
    const compact = value => value.toLowerCase().replace(/[\s_-]+/g, '');
    return {
        text: (match ? raw.replace(match[0], ' ') : raw).trim(),
        group,
        hasGroup: Boolean(match),
        ungrouped: lower === 'ungrouped' && !quoted,
        groups: exact.length || quoted ? exact : groups.filter(name => compact(name) === compact(group))
    };
}

export function matchesVariableQuery(variable, query) {
    if (query.hasGroup) {
        if (query.ungrouped) {
            if (variable.group || variable.setId) return false;
        } else if (!query.groups.includes(variable.group)) return false;
    }
    const type = variable.type === 'counter' ? 'counter number' : variable.type;
    return !query.text || `${variable.name} ${type} ${variable.value} ${variable.group || ''}`.toLowerCase().includes(query.text.toLowerCase());
}
