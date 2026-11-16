// Discovery and resolution share the same traversal so every offered token is live.
import { trackerMax } from '../../../shared/variable-links.cjs';

const LINK_TYPES = new Set(['ref', 'ref_list', 'checklist']);
const MAX_HOPS = 4;
const MAX_ITEMS = 10000;

function linkedPlaceholders(status = {}) {
    const groups = [], values = {}, lists = {}, types = {};
    if (status.modules?.variableSets === false) return { groups, values, lists, types };
    const sets = new Map((status.variableSets || []).map(set => [set.id, set]));
    let remaining = MAX_ITEMS;
    const enabled = entry => entry && entry.enabled !== false && entry.enabled !== 'false' && entry.enabled !== 0 && entry.enabled !== '0';
    const name = entry => {
        const candidate = entry?.values?.name;
        const value = (typeof candidate === 'string' || typeof candidate === 'number' ? candidate : '') || entry?.label || '';
        return String(value === entry?.id ? '' : value);
    };
    const parse = (value, fallback) => {
        if (typeof value !== 'string') return value ?? fallback;
        try { return JSON.parse(value); } catch { return fallback; }
    };
    const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    for (const set of sets.values()) {
        if (!set?.id) continue;
        const items = [];
        const materialized = new Map((status.customVars || []).filter(v => v.setId === set.id && !v.hidden).map(v => [v.name, v]));
        for (const [suffix, description] of [['group', 'Group'], ['group_count', 'Group count']]) {
            const variable = materialized.get(`${set.id}_${suffix}`);
            if (variable) items.push([`var.${variable.name}`, `${set.name || set.id} → ${description}`, { type: variable.type, preview: variable.value }]);
        }
        const slots = Number(set.slotsCount) || 0;
        for (let index = 0; index < Math.max(1, slots); index++) {
            const id = slots ? set.slots?.[index] : set.activeEntry;
            const entry = (set.roster || []).find(candidate => candidate.id === id && enabled(candidate));
            const slotLabel = slots ? `Slot ${index + 1}${set.slotNames?.[index] ? ` / ${set.slotNames[index]}` : ''}` : 'Active entry';
            const rootPrefix = `var.${set.id}${slots ? `_${index + 1}` : ''}`;
            const aliases = [];
            if (slots && index === 0) aliases.push(`var.${set.id}`);
            const named = slots && slug(set.slotNames?.[index]);
            if (named && !/^\d+$/.test(named) && named !== 'active') aliases.push(`var.${set.id}_${named}`);
            const breadcrumb = `${set.name || set.id} → ${slotLabel}`;
            const state = entry ? '' : id ? 'Unavailable entry' : 'Unassigned';
            function add(key, label, type, raw, list = false, hint = state, search = '') {
                if (remaining-- <= 0) return;
                const clean = list ? raw.filter(v => v !== '' && v !== undefined && v !== null).map(String) : raw;
                const value = list ? clean.join(', ') : clean ?? '';
                const meta = { type, preview: value, list, state: hint, search: `${set.name || ''} ${slotLabel} ${search} ${value}` };
                items.push([key, label, meta]);
                const keys = [key, ...aliases.map(alias => alias + key.slice(rootPrefix.length))];
                for (const [index, candidate] of [...keys].entries()) {
                    if ((candidate.match(/\.field\./g) || []).length !== 1 || /\.(count|started|completed|total|progress)$/.test(candidate)) continue;
                    const legacy = candidate.replace('.field.', '_');
                    const rootField = legacy.slice((index === 0 ? rootPrefix : aliases[index - 1]).length + 1);
                    if (!(set.fields || []).some(f => f.key === rootField) && materialized.has(legacy.slice(4))) keys.push(legacy);
                }
                for (const k of keys) {
                    values[k] = value;
                    types[k] = type;
                    if (list) lists[k] = clean;
                }
            }
            if (slots) add(`${rootPrefix}_slot_name`, `${breadcrumb} → Slot name`, 'text', set.slotNames?.[index] || `Slot ${index + 1}`);
            add(`${rootPrefix}_active`, `${breadcrumb} → Active`, 'toggle', entry ? 'true' : 'false');
            function visit(fields, entries, prefix, label, hops, multi, hint, search) {
                for (const field of fields || []) {
                    if (!field?.key || remaining <= 0) continue;
                    const key = `${prefix}${prefix === rootPrefix ? '_' : '.field.'}${field.key}`;
                    const pathLabel = `${label} → ${field.label || field.key}`;
                    if (!LINK_TYPES.has(field.type)) {
                        const vals = entries.map(e => {
                            const value = e?.values?.[field.key] ?? '';
                            return field.type === 'template' ? String(value).replace(/@([a-z0-9_]{1,20})\b/gi, (_, k) => {
                                const targetField = fields.find(f => f.key === k);
                                const raw = e.values?.[k];
                                if (LINK_TYPES.has(targetField?.type)) {
                                    const target = sets.get(targetField.targetSet);
                                    const parsed = targetField.type === 'checklist' ? parse(raw, {}) : targetField.type === 'ref_list' ? parse(raw, []) : [raw];
                                    const ids = targetField.type === 'checklist' && parsed && !Array.isArray(parsed) ? Object.keys(parsed).filter(id => Number(parsed[id]) > 0) : parsed;
                                    return (Array.isArray(ids) ? ids : []).map(id => name(target?.roster?.find(candidate => candidate.id === id && enabled(candidate)))).filter(Boolean).join(', ');
                                }
                                return raw == null || typeof raw === 'object' ? '' : String(raw);
                            }) : value;
                        }).filter(v => typeof v !== 'object');
                        add(key, pathLabel, field.type, multi ? vals : (vals[0] ?? ''), multi, hint, search);
                        continue;
                    }
                    if (hops >= MAX_HOPS) continue;
                    const target = sets.get(field.targetSet);
                    const matched = [];
                    let started = 0, completed = 0, total = 0;
                    for (const source of entries) {
                        const raw = source?.values?.[field.key];
                        const map = field.type === 'checklist' ? parse(raw, {}) : null;
                        const ids = field.type === 'ref' ? [raw] : field.type === 'ref_list' ? parse(raw, []) : Object.keys(map && typeof map === 'object' && !Array.isArray(map) ? map : {}).filter(id => Number(map[id]) > 0);
                        const validIds = Array.isArray(ids) ? ids : [];
                        for (const linkedId of validIds) {
                            const found = target?.roster?.find(candidate => candidate.id === linkedId && enabled(candidate));
                            if (found) matched.push(found);
                        }
                        if (field.type === 'checklist' && target) {
                            const eligible = (target.roster || []).filter(enabled);
                            total += eligible.length;
                            started += eligible.filter(candidate => Number(map?.[candidate.id]) > 0).length;
                            completed += eligible.filter(candidate => Number(map?.[candidate.id]) >= trackerMax(field, candidate)).length;
                        }
                    }
                    const linkHint = !entries.length ? hint : !target ? 'Missing linked set' : !matched.length ? 'No linked entries' : '';
                    const isMulti = multi || field.type !== 'ref';
                    const names = matched.map(name).filter(Boolean);
                    const linkedSearch = `${search} ${names.join(' ')}`;
                    add(key, pathLabel, 'text', isMulti ? names : (names[0] || ''), isMulti, linkHint, linkedSearch);
                    if (field.type !== 'ref') {
                        const available = entries.length && target;
                        add(`${key}.count`, `${pathLabel} → Count`, 'number', available ? matched.length : '', false, linkHint, linkedSearch);
                        if (field.type === 'checklist') {
                            add(`${key}.started`, `${pathLabel} → Started`, 'number', available ? started : '', false, linkHint, linkedSearch);
                            add(`${key}.completed`, `${pathLabel} → Completed`, 'number', available ? completed : '', false, linkHint, linkedSearch);
                            add(`${key}.total`, `${pathLabel} → Total`, 'number', available ? total : '', false, linkHint, linkedSearch);
                            add(`${key}.progress`, `${pathLabel} → Progress`, 'text', available ? `${completed}/${total}` : '', false, linkHint, linkedSearch);
                        }
                    }
                    if (target) visit(target.fields, matched, key, pathLabel, hops + 1, isMulti, linkHint, linkedSearch);
                }
            }
            visit(set.fields, entry ? [entry] : [], rootPrefix, breadcrumb, 0, false, state, name(entry));
        }
        if (items.length) groups.push({ label: `Variable Set: ${set.name || set.id}`, items });
    }
    return { groups, values, lists, types };
}

export { linkedPlaceholders };
