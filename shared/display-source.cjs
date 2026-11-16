function resolveDisplayOwner(sets = [], binding = {}) {
    let set = sets.find(candidate => candidate.id === binding.setId);
    const selector = binding.selector || 'active';
    const id = selector.startsWith('entry:') ? selector.slice(6) : selector.startsWith('slot:') ? set?.slots?.[Number(selector.slice(5)) - 1] : set?.slotsCount > 0 ? set.slots?.[0] : set?.activeEntry;
    let entry = set?.roster?.find(candidate => candidate.id === id && candidate.enabled !== false);
    for (const fieldKey of binding.path || []) {
        const field = set?.fields?.find(candidate => candidate.key === fieldKey && candidate.type === 'ref');
        const nextId = entry?.values?.[fieldKey];
        set = sets.find(candidate => candidate.id === field?.targetSet);
        entry = set?.roster?.find(candidate => candidate.id === nextId && candidate.enabled !== false);
    }
    return { set, entry };
}

module.exports = { resolveDisplayOwner };
