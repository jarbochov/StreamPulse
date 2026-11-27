'use strict';

const { resolveSelectMeta, normalizeTagsValue, formatTagsValue } = require('./variable-options.cjs');
const { trackerMax } = require('./variable-links.cjs');

const LINK_TYPES = new Set(['ref', 'ref_list', 'checklist']);
const RESERVED_SELECTORS = new Set(['count', 'total', 'all']);

function isEntryEnabled(entry) {
    return Boolean(entry) && entry.enabled !== false && entry.enabled !== 'false' && entry.enabled !== 0 && entry.enabled !== '0';
}

function slugifyEntryLabel(raw) {
    return String(raw ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
}

function entryDisplayLabel(entry) {
    if (!entry) return '';
    if (entry.label !== undefined && entry.label !== null && String(entry.label).trim() !== '') {
        return String(entry.label);
    }
    const nameVal = entry.values?.name;
    if ((typeof nameVal === 'string' || typeof nameVal === 'number') && String(nameVal).trim() !== '') {
        return String(nameVal);
    }
    return String(entry.id || '');
}

function parseJsonSafe(value, fallback) {
    if (typeof value !== 'string') return value ?? fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function findEntryBySelector(set, selector, includeDisabled = false) {
    const roster = Array.isArray(set?.roster) ? set.roster : [];
    const pool = includeDisabled ? roster : roster.filter(isEntryEnabled);
    if (/^[1-9]\d*$/.test(selector)) {
        const idx = Number(selector) - 1;
        return pool[idx] || null;
    }
    const needle = String(selector || '').toLowerCase();
    if (!needle) return null;
    // Exact entry.id match first (prefer enabled, then any)
    const byIdEnabled = roster.find(e => isEntryEnabled(e) && String(e.id || '').toLowerCase() === needle);
    if (byIdEnabled) return byIdEnabled;
    const byIdAny = roster.find(e => String(e.id || '').toLowerCase() === needle);
    if (byIdAny) return byIdAny;
    // Stable slug match against entry.label (prefer enabled, then any)
    const bySlugEnabled = roster.find(e => isEntryEnabled(e) && slugifyEntryLabel(e.label) === needle);
    if (bySlugEnabled) return bySlugEnabled;
    const bySlugAny = roster.find(e => slugifyEntryLabel(e.label) === needle);
    return bySlugAny || null;
}

function resolveTagItems(raw, options = []) {
    const normalized = normalizeTagsValue(raw, options);
    return normalized.map(val => resolveSelectMeta(val, options).label).filter(Boolean);
}

function resolveListItems(raw) {
    if (Array.isArray(raw)) return raw.map(v => String(v ?? '').trim()).filter(Boolean);
    const str = String(raw ?? '').trim();
    if (!str) return [];
    if (str.startsWith('[')) {
        const parsed = parseJsonSafe(str, null);
        if (Array.isArray(parsed)) return parsed.map(v => String(v ?? '').trim()).filter(Boolean);
    }
    return str.split(/[\r\n,]+/).map(v => v.trim()).filter(Boolean);
}

function resolveEntryTemplate(raw, entry, set, setsById) {
    const tpl = String(raw ?? '');
    if (!tpl) return '';
    const fields = Array.isArray(set?.fields) ? set.fields : [];
    const vals = entry?.values || {};
    return tpl.replace(/@([a-z0-9_]{1,20})\b/gi, (_, key) => {
        const targetField = fields.find(f => f.key === key);
        const val = vals[key];
        if (targetField && LINK_TYPES.has(targetField.type)) {
            const target = setsById.get(targetField.targetSet);
            const parsed = targetField.type === 'checklist' ? parseJsonSafe(val, {})
                : targetField.type === 'ref_list' ? parseJsonSafe(val, [])
                    : [val];
            const ids = targetField.type === 'checklist' && parsed && !Array.isArray(parsed)
                ? Object.keys(parsed).filter(id => Number(parsed[id]) > 0)
                : parsed;
            return (Array.isArray(ids) ? ids : [])
                .map(id => target?.roster?.find(c => c.id === id && isEntryEnabled(c)))
                .filter(Boolean)
                .map(entryDisplayLabel)
                .filter(Boolean)
                .join(', ');
        }
        if (targetField?.type === 'select') return resolveSelectMeta(val, targetField.options || []).label;
        if (targetField?.type === 'tags') return formatTagsValue(val, targetField.options || []);
        return val == null || typeof val === 'object' ? '' : String(val);
    });
}

function resolveSimpleField(field, entry, set, setsById, subMeta = '') {
    if (!field) return { matched: false };
    const raw = entry ? (entry.values?.[field.key] ?? '') : '';

    if (field.type === 'select') {
        const meta = entry ? resolveSelectMeta(raw, field.options || []) : { value: '', label: '', color: '', icon: '' };
        if (subMeta === 'value') return { matched: true, found: Boolean(entry), value: meta.value, type: 'text', isList: false };
        if (subMeta === 'color') return { matched: true, found: Boolean(entry), value: meta.color, type: 'color', isList: false };
        if (subMeta === 'icon') return { matched: true, found: Boolean(entry), value: meta.icon, type: 'icon', icon: meta.icon, isList: false };
        return { matched: true, found: Boolean(entry), value: meta.label, type: 'select', icon: meta.icon, isList: false };
    }

    if (field.type === 'tags') {
        const items = entry ? resolveTagItems(raw, field.options || []) : [];
        if (subMeta === 'count') {
            return { matched: true, found: Boolean(entry), value: entry ? String(items.length) : '', type: 'number', isList: false };
        }
        return {
            matched: true,
            found: Boolean(entry),
            value: entry ? items.join(', ') : '',
            type: 'tags',
            isList: true,
            listItems: items
        };
    }

    if (field.type === 'list') {
        const items = entry ? resolveListItems(raw) : [];
        if (subMeta === 'count') {
            return { matched: true, found: Boolean(entry), value: entry ? String(items.length) : '', type: 'number', isList: false };
        }
        return {
            matched: true,
            found: Boolean(entry),
            value: entry ? items.join(', ') : '',
            type: 'list',
            isList: true,
            listItems: items
        };
    }

    if (subMeta === 'icon') {
        const iconVal = field.type === 'icon' ? String(raw || '').trim() : '';
        return { matched: true, found: Boolean(entry), value: iconVal, type: 'icon', icon: iconVal, isList: false };
    }

    if (subMeta) return { matched: false };

    if (field.type === 'template') {
        const val = entry ? resolveEntryTemplate(raw, entry, set, setsById) : '';
        return { matched: true, found: Boolean(entry), value: val, type: 'template', isList: false };
    }

    const str = entry && raw !== undefined && raw !== null ? String(raw) : '';
    return {
        matched: true,
        found: Boolean(entry),
        value: str,
        type: field.type || 'text',
        ...(field.type === 'icon' ? { icon: str } : {}),
        isList: false
    };
}

function resolveLinkField(field, entry, setsById, restSegments) {
    const target = setsById.get(field.targetSet);
    const raw = entry?.values?.[field.key];
    const map = field.type === 'checklist' ? parseJsonSafe(raw, {}) : null;
    const ids = field.type === 'ref' ? [raw]
        : field.type === 'ref_list' ? parseJsonSafe(raw, [])
            : Object.keys(map && typeof map === 'object' && !Array.isArray(map) ? map : {}).filter(id => Number(map[id]) > 0);
    const validIds = Array.isArray(ids) ? ids : [];
    const matchedEntries = [];
    if (entry && target) {
        for (const id of validIds) {
            const found = (target.roster || []).find(c => c.id === id && isEntryEnabled(c));
            if (found) matchedEntries.push(found);
        }
    }

    // Drop optional legacy `.field.` bridge segment
    const tail = restSegments[0] === 'field' ? restSegments.slice(1) : restSegments;
    const subKey = tail[0] || '';

    if (!subKey) {
        const names = matchedEntries.map(entryDisplayLabel).filter(Boolean);
        const isMulti = field.type !== 'ref';
        return {
            matched: true,
            found: Boolean(entry),
            value: isMulti ? names.join(', ') : (names[0] || ''),
            type: 'text',
            isList: isMulti,
            ...(isMulti ? { listItems: names } : {})
        };
    }

    if (field.type !== 'ref' && subKey === 'count' && tail.length === 1) {
        return { matched: true, found: Boolean(entry && target), value: entry && target ? String(matchedEntries.length) : '', type: 'number', isList: false };
    }

    if (field.type === 'checklist' && tail.length === 1 && ['started', 'completed', 'total', 'progress'].includes(subKey)) {
        if (!entry || !target) return { matched: true, found: false, value: '', type: subKey === 'progress' ? 'text' : 'number', isList: false };
        const eligible = (target.roster || []).filter(isEntryEnabled);
        const total = eligible.length;
        const started = eligible.filter(c => Number(map?.[c.id]) > 0).length;
        const completed = eligible.filter(c => Number(map?.[c.id]) >= trackerMax(field, c)).length;
        const val = subKey === 'started' ? String(started)
            : subKey === 'completed' ? String(completed)
                : subKey === 'total' ? String(total)
                    : `${completed}/${total}`;
        return { matched: true, found: true, value: val, type: subKey === 'progress' ? 'text' : 'number', isList: false };
    }

    // Linked target sub-field (1 hop)
    if (target) {
        const targetFields = Array.isArray(target.fields) ? target.fields : [];
        const subField = targetFields.find(f => f.key === subKey);
        if (subField && !LINK_TYPES.has(subField.type)) {
            const subMeta = tail[1] || '';
            if (field.type === 'ref') {
                return resolveSimpleField(subField, matchedEntries[0] || null, target, setsById, subMeta);
            }
            const vals = matchedEntries.map(me => resolveSimpleField(subField, me, target, setsById, subMeta).value).filter(v => v !== '');
            return {
                matched: true,
                found: Boolean(entry),
                value: vals.join(', '),
                type: subField.type || 'text',
                isList: true,
                listItems: vals
            };
        }
    }

    return { matched: false };
}

function matchFieldAndSuffix(fields, segment, nextSegment) {
    const exact = fields.find(f => f.key === segment);
    if (exact) return { field: exact, subMeta: nextSegment || '', consumedNext: Boolean(nextSegment) };
    // Support underscore metadata suffixes matching existing set tokens: <field>_color, <field>_icon, <field>_value, <field>_count
    const suffixMatch = /^(.+)_(color|icon|value|count)$/.exec(segment);
    if (suffixMatch) {
        const base = fields.find(f => f.key === suffixMatch[1]);
        if (base) return { field: base, subMeta: suffixMatch[2], consumedNext: false };
    }
    return null;
}

/**
 * Lazily resolves direct Variable Set item placeholders without materializing N×M variables.
 *
 * Supported forms:
 *   var.<setId>.count                       Enabled roster item count
 *   var.<setId>.total                       Total roster item count (enabled + disabled)
 *   var.<setId>.<1..N>[.<field>[.<meta>]]   1-based positional lookup among enabled entries
 *   var.<setId>.all.<1..N>[.<field>]        1-based positional lookup across all entries
 *   var.<setId>.<idOrSlug>[.<field>]        Stable lookup by entry.id or slugified entry.label
 *
 * @param {string} tokenName Full token name (with or without leading `var.`)
 * @param {object} status    Status payload containing `variableSets` and `modules`
 * @returns {{ matched: boolean, found?: boolean, value?: string, type?: string, isList?: boolean, listItems?: string[], icon?: string, setId?: string, entryId?: string }}
 */
function resolveSetItemToken(tokenName, status = {}) {
    if (status?.modules?.variableSets === false) return { matched: false };
    const setsList = Array.isArray(status?.variableSets) ? status.variableSets : [];
    if (!setsList.length) return { matched: false };

    const raw = String(tokenName || '').trim();
    const path = raw.startsWith('var.') ? raw.slice(4) : raw;
    const dotIdx = path.indexOf('.');
    if (dotIdx <= 0) return { matched: false };

    const setId = path.slice(0, dotIdx);
    const setsById = new Map(setsList.map(s => [s.id, s]));
    const set = setsById.get(setId);
    if (!set) return { matched: false };

    const segments = path.slice(dotIdx + 1).split('.').filter(Boolean);
    if (!segments.length) return { matched: false };

    const roster = Array.isArray(set.roster) ? set.roster : [];
    const fields = Array.isArray(set.fields) ? set.fields : [];

    // Set-level counts
    if (segments.length === 1 && segments[0] === 'count') {
        return { matched: true, found: true, value: String(roster.filter(isEntryEnabled).length), type: 'number', isList: false, setId };
    }
    if (segments.length === 1 && segments[0] === 'total') {
        return { matched: true, found: true, value: String(roster.length), type: 'number', isList: false, setId };
    }

    // Selector resolution: `.all.<1..N>` vs `.<1..N>` vs `.<entryIdOrSlug>`
    let includeDisabled = false;
    let selector = segments[0];
    let rest = segments.slice(1);

    if (selector === 'all') {
        if (!rest.length) return { matched: false };
        includeDisabled = true;
        selector = rest[0];
        rest = rest.slice(1);
    }

    const entry = findEntryBySelector(set, selector, includeDisabled);
    const isPositional = /^[1-9]\d*$/.test(selector);

    // If non-positional selector did not match any entry AND there's no valid field/meta tail,
    // check whether this looks like an entry lookup: if it's a valid field key on the set or no tail,
    // treat unresolved positional or missing slug cleanly.
    if (!entry && !isPositional) {
        // Avoid hijacking unrelated dot paths if there is no matching entry and tail isn't a known field or builtin property
        if (rest.length > 0) {
            const firstTail = rest[0];
            const isKnownTail = ['label', 'id', 'enabled'].includes(firstTail) || Boolean(matchFieldAndSuffix(fields, firstTail, rest[1]));
            if (!isKnownTail) return { matched: false };
        }
    }

    // Entry label shorthand: var.<setId>.1 or var.<setId>.<slug>
    if (!rest.length) {
        return {
            matched: true,
            found: Boolean(entry),
            value: entry ? entryDisplayLabel(entry) : '',
            type: 'text',
            isList: false,
            setId,
            entryId: entry?.id || ''
        };
    }

    // Built-in entry properties
    if (rest.length === 1 && rest[0] === 'label') {
        return { matched: true, found: Boolean(entry), value: entry ? entryDisplayLabel(entry) : '', type: 'text', isList: false, setId, entryId: entry?.id || '' };
    }
    if (rest.length === 1 && rest[0] === 'id') {
        return { matched: true, found: Boolean(entry), value: entry ? String(entry.id || '') : '', type: 'text', isList: false, setId, entryId: entry?.id || '' };
    }
    if (rest.length === 1 && rest[0] === 'enabled') {
        return { matched: true, found: Boolean(entry), value: entry ? (isEntryEnabled(entry) ? 'true' : 'false') : 'false', type: 'toggle', isList: false, setId, entryId: entry?.id || '' };
    }

    // Field lookup
    const matched = matchFieldAndSuffix(fields, rest[0], rest[1]);
    if (!matched) return { matched: false };
    const { field, subMeta, consumedNext } = matched;

    if (LINK_TYPES.has(field.type)) {
        const res = resolveLinkField(field, entry, setsById, rest.slice(1));
        return res.matched ? { ...res, setId, entryId: entry?.id || '' } : res;
    }

    // For simple fields, disallow unexpected trailing segments beyond known subMeta
    const expectedLen = consumedNext ? 2 : 1;
    if (rest.length > expectedLen) return { matched: false };

    const res = resolveSimpleField(field, entry, set, setsById, subMeta);
    return res.matched ? { ...res, setId, entryId: entry?.id || '' } : res;
}

/**
 * Produces a concise list of direct item selector choices for UI pickers & token builders.
 */
function listSetItemChoices(set) {
    const roster = Array.isArray(set?.roster) ? set.roster : [];
    const enabled = roster.filter(isEntryEnabled);
    const positional = enabled.map((entry, idx) => ({
        selector: String(idx + 1),
        mode: 'position',
        index: idx + 1,
        entryId: entry.id,
        label: `#${idx + 1} — ${entryDisplayLabel(entry)}`,
        entryLabel: entryDisplayLabel(entry),
        enabled: true
    }));
    const usedSlugs = new Set();
    const pinned = roster.map(entry => {
        const slug = slugifyEntryLabel(entry.label);
        const safeSlug = slug && !RESERVED_SELECTORS.has(slug) && !/^\d+$/.test(slug) && !usedSlugs.has(slug)
            ? slug
            : String(entry.id || '');
        if (safeSlug) usedSlugs.add(safeSlug);
        return {
            selector: safeSlug,
            mode: 'pinned',
            entryId: entry.id,
            label: `${entryDisplayLabel(entry)} (${safeSlug})`,
            entryLabel: entryDisplayLabel(entry),
            enabled: isEntryEnabled(entry)
        };
    }).filter(item => item.selector);
    return { positional, pinned, enabledCount: enabled.length, totalCount: roster.length };
}

module.exports = {
    isEntryEnabled,
    slugifyEntryLabel,
    entryDisplayLabel,
    resolveSetItemToken,
    listSetItemChoices
};
