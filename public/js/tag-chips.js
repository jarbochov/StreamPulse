// Shared tag filter chips for the Asset Library and the overlay editor's pickers.
// Shows All, Untagged and the most-used tags; typing in a search box reveals any other tag.
(function (root) {
    const UNTAGGED = '\u0000untagged';
    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function counts(assets) {
        const map = new Map();
        for (const asset of assets) for (const tag of asset.tags || []) map.set(tag, (map.get(tag) || 0) + 1);
        return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }

    function matches(asset, filter) {
        if (!filter) return true;
        if (filter === UNTAGGED) return !(asset.tags || []).length;
        return (asset.tags || []).some(tag => tag.toLowerCase() === filter.toLowerCase());
    }

    function html(assets, { active = '', query = '', limit = 12 } = {}) {
        const list = counts(assets);
        const untagged = assets.filter(asset => !(asset.tags || []).length).length;
        const q = query.trim().toLowerCase();
        let shown;
        let hidden = 0;
        if (q) shown = list.filter(([tag]) => tag.toLowerCase().includes(q)).slice(0, 40);
        else {
            shown = list.slice(0, limit);
            const extra = active && active !== UNTAGGED && !shown.some(([tag]) => tag === active) ? list.find(([tag]) => tag === active) : null;
            if (extra) shown.push(extra);
            hidden = list.length - shown.length;
        }
        const chip = (value, label) => `<button type="button" data-tag-filter="${esc(value)}" aria-pressed="${active === value}">${esc(label)}</button>`;
        return chip('', 'All') + chip(UNTAGGED, `Untagged (${untagged})`)
            + shown.map(([tag, n]) => chip(tag, `${tag} (${n})`)).join('')
            + (q && !shown.length ? '<span class="hint">No tag matches.</span>' : '')
            + (hidden ? `<span class="hint">+${hidden} more. Type to search.</span>` : '');
    }

    root.TagChips = { UNTAGGED, counts, matches, html };
})(window);
