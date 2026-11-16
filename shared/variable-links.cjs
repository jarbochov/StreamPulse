function trackerMax(field, item) {
    const levels = (item?.tiers || []).map(tier => Number(tier.level)).filter(level => Number.isInteger(level) && level > 0);
    return Math.min(100, levels.length ? Math.max(...levels) : Math.max(1, Number(field?.maxTier) || 1));
}

function linkedSourceEntry(sets, source = {}) {
    const set = (sets || []).find(candidate => candidate.id === source.setId);
    if (!set) return { set: null, entry: null };
    const selector = source.selector || 'active';
    const id = selector.startsWith('entry:') ? selector.slice(6)
        : selector.startsWith('slot:') ? set.slots?.[Number(selector.slice(5)) - 1]
            : set.slotsCount > 0 ? set.slots?.[0] : set.activeEntry;
    return { set, entry: (set.roster || []).find(candidate => candidate.id === id) || null };
}

function linkedSourceFields(sets, source = {}, types = ['ref', 'ref_list']) {
    const { set, entry } = linkedSourceEntry(sets, source);
    const keys = Array.isArray(source.fields) ? source.fields : [];
    const fields = keys.map(key => (set?.fields || []).find(field => key === field.key && types.includes(field.type))).filter(Boolean);
    return { set, entry, fields };
}

module.exports = { trackerMax, linkedSourceEntry, linkedSourceFields };
