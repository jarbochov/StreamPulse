function variableGroupKey(group) {
    return String(group || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function variableKey(variable) {
    const group = !variable.setId && !variable.hidden && variableGroupKey(variable.group);
    return group ? `${group}.${variable.name}` : variable.name;
}

const isVariableKey = key => typeof key === 'string' && /^(?:[a-z0-9_]{1,60}\.)?[a-z0-9_]{1,40}$/.test(key);

module.exports = { variableGroupKey, variableKey, isVariableKey };
