const SORTS = new Set(['recent', 'oldest', 'name']);
const browsers = new WeakMap();
const UNTAGGED = '\u0000untagged';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const nameOf = asset => String(asset.label || asset.family || asset.name || asset.url || '');
const timeOf = asset => {
    const value = asset.modifiedAt ?? asset.updatedAt ?? asset.createdAt ?? asset.mtimeMs;
    return (typeof value === 'number' ? value : Date.parse(value)) || 0;
};

export function filterAssets(assets, { query = '', tag = '', sort = 'recent' } = {}) {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const wanted = tag.toLowerCase();
    return assets.filter(asset => {
        const tags = Array.isArray(asset.tags) ? asset.tags : [];
        if (tag === UNTAGGED ? tags.length : wanted && !tags.some(value => value.toLowerCase() === wanted)) return false;
        const text = [asset.label, asset.name, asset.family, asset.caption, ...tags].join(' ').toLowerCase();
        return words.every(word => text.includes(word));
    }).sort((a, b) => {
        const named = collator.compare(nameOf(a), nameOf(b));
        if (sort === 'name') return named || collator.compare(a.name || '', b.name || '');
        return (sort === 'oldest' ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a)) || named;
    });
}

export function mountAssetBrowser({ search, tag: existingTag, container, key, onChange }) {
    if (search && browsers.has(search)) return browsers.get(search);
    if (!document.getElementById('asset-browser-css')) {
        const css = document.createElement('link');
        css.id = 'asset-browser-css';
        css.rel = 'stylesheet';
        css.href = '/css/asset-browser.css';
        document.head.append(css);
    }
    const storageKey = `streampulse.asset-browser.${key}`;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
    const controls = document.createElement('div');
    controls.className = 'asset-browser-controls';
    const originalSearch = search;
    search ||= document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search name, filename, tag or caption...';
    search.setAttribute('aria-label', 'Search assets');
    search.value = typeof saved.query === 'string' ? saved.query : search.value;
    if (originalSearch) originalSearch.replaceWith(controls);
    else container.prepend(controls);
    controls.append(search);
    const tag = existingTag || document.createElement('select');
    const tagParent = existingTag?.parentNode;
    const tagNext = existingTag?.nextSibling;
    tag.setAttribute('aria-label', 'Filter assets by tag');
    const sort = document.createElement('select');
    sort.setAttribute('aria-label', 'Sort assets');
    for (const [value, label] of [['recent', 'Recent first'], ['oldest', 'Oldest first'], ['name', 'Name A-Z']]) {
        sort.add(new Option(label, value));
    }
    sort.value = SORTS.has(saved.sort) ? saved.sort : 'recent';
    controls.append(tag, sort);
    let activeTag = typeof saved.tag === 'string' ? saved.tag : '';
    let tagSignature = '', frame = 0;
    const preferences = () => ({ query: search.value, tag: activeTag, sort: sort.value });
    const refresh = () => {
        activeTag = tag.value;
        try { localStorage.setItem(storageKey, JSON.stringify(preferences())); } catch {}
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; onChange(); });
    };
    search.addEventListener('input', refresh);
    tag.addEventListener('change', refresh);
    sort.addEventListener('change', refresh);
    const browser = {
        element: controls,
        filter(assets) {
            const tags = new Map();
            for (const asset of assets) for (const value of asset.tags || []) {
                if (!tags.has(value.toLowerCase())) tags.set(value.toLowerCase(), value);
            }
            const ordered = [...tags].sort((a, b) => collator.compare(a[1], b[1]));
            const signature = JSON.stringify([ordered, activeTag]);
            if (signature !== tagSignature) {
                tagSignature = signature;
                tag.replaceChildren(new Option('All tags', ''), new Option('Untagged', UNTAGGED));
                for (const [value, label] of ordered) tag.add(new Option(label, value));
                if (activeTag && activeTag !== UNTAGGED && !tags.has(activeTag)) tag.add(new Option(`${activeTag} (not in this view)`, activeTag));
                tag.value = activeTag;
            }
            return filterAssets(assets, preferences());
        },
        cancel() { cancelAnimationFrame(frame); frame = 0; },
        destroy() {
            this.cancel();
            browsers.delete(search);
            search.removeEventListener('input', refresh);
            tag.removeEventListener('change', refresh);
            sort.removeEventListener('change', refresh);
            if (tagParent) tagParent.insertBefore(tag, tagNext?.parentNode === tagParent ? tagNext : null);
            if (originalSearch) controls.replaceWith(originalSearch);
            else controls.remove();
        }
    };
    browser.filter([]);
    browsers.set(search, browser);
    return browser;
}
