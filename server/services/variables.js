// Named variables (text, counter, list, image, toggle, color, template) and multi-slot Variable Sets,
// shared by overlays, chat bot, API and Bitfocus Companion.
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('node:util');
const { variableKey, variableGroupKey } = require('../../shared/variable-paths.cjs');

const NAME_RE = /^[a-z0-9_]{1,40}$/;
const VALID_TYPES = ['counter', 'number', 'text', 'list', 'select', 'tags', 'image', 'icon', 'toggle', 'color', 'template', 'font', 'date', 'time', 'datetime', 'duration'];
const normalizeNumber = require('./variable-numbers');
const { trackerMax } = require('../../shared/variable-links.cjs');
const {
    normalizeOptions,
    normalizeSelectValue,
    resolveSelectMeta,
    normalizeTagsValue,
    formatTagsValue
} = require('../../shared/variable-options.cjs');
const VALID_SET_FIELD_TYPES = ['text', 'number', 'counter', 'select', 'tags', 'image', 'icon', 'color', 'toggle', 'font', 'list', 'template', 'date', 'time', 'datetime', 'duration', 'ref', 'ref_list', 'checklist'];

function defaultSetFieldValue(type) {
    if (type === 'toggle') return 'false';
    if (type === 'color') return '#3b82f6';
    if (type === 'counter' || type === 'number') return '0';
    if (type === 'checklist') return '{}';
    if (type === 'ref_list' || type === 'tags') return '[]';
    return '';
}

function resolveSetFieldValue(field, entry) {
    const raw = entry ? (entry.values?.[field.key] ?? '') : '';
    if (field.type === 'checklist') {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return JSON.stringify(raw);
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        return '{}';
    }
    if (field.type === 'ref_list') {
        if (Array.isArray(raw)) return JSON.stringify(raw);
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        return '[]';
    }
    if (field.type === 'select') {
        return resolveSelectMeta(raw, field.options || []).label;
    }
    if (field.type === 'tags') {
        return formatTagsValue(raw, field.options || []);
    }
    if (field.type === 'template') {
        const tpl = String(raw || '');
        if (!tpl) return '';
        const vals = entry?.values || {};
        return tpl.replace(/@([a-z0-9_]{1,20})\b/gi, (_, k) => (vals[k] !== undefined && vals[k] !== null ? String(vals[k]) : ''));
    }
    if (raw !== '' && raw !== undefined && raw !== null) return String(raw);
    return defaultSetFieldValue(field.type);
}
const ROTATION_TRANSITIONS = ['none', 'fade', 'slide-up', 'flip'];
const MAX_USER_VARS = 500;
const MAX_SET_VARS = 25000;
const TEMPLATE_RE = /\{\{\s*var\.([a-z0-9_.]+)\s*(?:\|([^{}]*?))?\s*\}\}/gi;

function sanitizeIcon(raw) {
    const cls = String(raw || '').trim()
        .replace(/^fab\b/, 'fa-brands')
        .replace(/^fas\b/, 'fa-solid')
        .replace(/^far\b/, 'fa-regular')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
    return /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls) ? cls : '';
}

module.exports = function createVariables({ dataDir, onChange = null, getDependencies = null }) {
    const file = path.join(dataDir, 'variables.json');
    const setsFile = path.join(dataDir, 'variable-sets.json');
    const variableGroups = require('./variable-groups')(dataDir);
    let vars = {};
    let sets = {};
    let moduleEnabled = true;
    let variableSettingsEnabled = true;

    function load() {
        variableGroups.reload();
        try { vars = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { vars = {}; }
        try { sets = JSON.parse(fs.readFileSync(setsFile, 'utf8')) || {}; } catch { sets = {}; }
    }
    load();

    function notifyChange(extra = {}) {
        if (typeof onChange === 'function') {
            try { onChange({ variables: list(), groups: listGroups(), sets: listSets(), variableSetsEnabled: moduleEnabled, variableSettingsEnabled, ...extra }); } catch { /* ignore listener errors */ }
        }
    }

    function save() {
        validateNamespaces();
        variableGroups.save();
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(vars, null, 2));
        fs.renameSync(`${file}.tmp`, file);
        notifyChange();
    }

    function saveSets({ saveVarsAlso = false } = {}) {
        validateNamespaces();
        variableGroups.save();
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${setsFile}.tmp`, JSON.stringify(sets, null, 2));
        fs.renameSync(`${setsFile}.tmp`, setsFile);
        if (saveVarsAlso) {
            fs.writeFileSync(`${file}.tmp`, JSON.stringify(vars, null, 2));
            fs.renameSync(`${file}.tmp`, file);
        }
        notifyChange();
    }

    const normName = name => String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    const normSetId = id => String(id || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    const list = () => Object.entries(vars).map(([name, v]) => ({ name, ...v, key: variableKey({ name, ...v }) }));
    const listSets = () => Object.entries(sets).map(([id, s]) => ({ id, ...s }));
    const listGroups = () => [...new Set([...variableGroups.list(), ...list().filter(v => !v.setId && !v.hidden && v.group).map(v => v.group)])];

    function validateNamespaces(candidateName, candidate) {
        for (const group of new Set([...variableGroups.list(), candidate?.group].filter(Boolean))) {
            const key = variableGroupKey(group);
            const record = key === candidateName ? candidate : vars[key];
            if (record && variableKey({ name: key, ...record }) === key) {
                throw new Error(`Group namespace "${key}" conflicts with an ungrouped or set-managed variable of that name`);
            }
        }
    }

    // Group-qualified keys are derived; names remain the stable API/storage identity.
    function values() {
        const records = new Map(list().map(v => [v.key, v]));
        const out = {};
        for (const [key, v] of records) {
            if (v.type === 'select') {
                const meta = resolveSelectMeta(v.value, v.options || []);
                out[key] = meta.label;
                out[`${key}_value`] = meta.value;
                if (meta.color) out[`${key}_color`] = meta.color;
                if (meta.icon) out[`${key}_icon`] = meta.icon;
            } else if (v.type === 'tags') {
                out[key] = v.value ?? formatTagsValue(v.items || [], v.options || []);
                out[`${key}_count`] = String(Array.isArray(v.items) ? v.items.length : 0);
            } else {
                out[key] = v.value;
            }
        }
        const resolving = new Set();
        const resolved = new Map();
        const resolve = (name, depth) => {
            const v = records.get(name);
            if (v?.type !== 'template') return out[name];
            if (resolved.has(name)) return resolved.get(name);
            if (depth > 3 || resolving.has(name)) return '';
            resolving.add(name);
            const text = String(v.value ?? '').replace(TEMPLATE_RE, (_m, ref, fallback) => {
                const val = resolve(ref.toLowerCase(), depth + 1);
                return (val !== undefined && val !== null && String(val) !== '') ? String(val) : (fallback !== undefined ? fallback.trim() : '');
            });
            resolving.delete(name);
            resolved.set(name, text);
            return text;
        };
        for (const [key, v] of records) if (v.type === 'template') out[key] = resolve(key, 0);
        for (const [name, v] of Object.entries(vars)) {
            const k = variableKey({ name, ...v });
            if (out[name] === undefined && out[k] !== undefined) {
                out[name] = out[k];
            }
        }
        return out;
    }

    function normalizeBool(raw) {
        if (raw === true || raw === 1) return 'true';
        const s = String(raw ?? '').trim().toLowerCase();
        return (s === 'true' || s === '1' || s === 'yes' || s === 'on') ? 'true' : 'false';
    }

    function normalizeColor(raw) {
        const s = String(raw ?? '').trim();
        if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return s.toLowerCase();
        if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
        return '#3b82f6';
    }

    function normalizeVarRecord(name, patch, { persist = true } = {}) {
        name = normName(name);
        if (!NAME_RE.test(name)) throw new Error('Name must be letters, numbers or underscore');
        const cur = vars[name];
        const type = VALID_TYPES.includes(patch.type) ? patch.type : cur?.type || 'text';
        const setId = patch.setId !== undefined ? (normSetId(patch.setId) || undefined) : cur?.setId;
        const isHidden = patch.hidden !== undefined ? Boolean(patch.hidden) : Boolean(cur?.hidden);
        const group = setId || isHidden ? '' : variableGroups.normalize(patch.group ?? cur?.group ?? '');
        if (persist) validateNamespaces(name, { group, setId, hidden: isHidden });
        const icon = sanitizeIcon(patch.icon !== undefined ? patch.icon : cur?.icon);
        const number = type === 'number' ? normalizeNumber(patch, cur?.type === 'number' || cur?.type === 'counter' ? cur : {}) : null;
        if (!cur) {
            const count = Object.values(vars).filter(v => Boolean(v?.setId) === Boolean(setId)).length;
            if (count >= (setId ? MAX_SET_VARS : MAX_USER_VARS)) throw new Error(setId ? 'Too many Variable Set variables' : 'Too many variables');
        }
        if (group) variableGroups.add(group);
        if (type === 'list') {
            const raw = patch.items ?? cur?.items ?? [];
            const items = (Array.isArray(raw) ? raw : String(raw).split(/\r?\n/)).map(i => String(i).trim().slice(0, 300)).filter(Boolean).slice(0, 200);
            const mode = patch.mode === 'sequential' ? 'sequential' : patch.mode === 'random' ? 'random' : cur?.mode || 'random';
            let value = patch.value ?? cur?.value ?? '';
            if (!items.includes(value)) value = items[0] || '';
            vars[name] = { type, items, mode, value, ...(setId ? { setId } : {}), ...(group ? { group } : {}), ...(icon ? { icon } : {}), ...(isHidden ? { hidden: true } : {}), updatedAt: Date.now() };
            if (persist) save();
            return { name, ...vars[name], key: variableKey({ name, ...vars[name] }) };
        }
        if (type === 'select') {
            const options = normalizeOptions(patch.options !== undefined ? patch.options : (cur?.options || []));
            const value = normalizeSelectValue(patch.value !== undefined ? patch.value : cur?.value, options);
            vars[name] = { type, options, value, ...(setId ? { setId } : {}), ...(group ? { group } : {}), ...(icon ? { icon } : {}), ...(isHidden ? { hidden: true } : {}), updatedAt: Date.now() };
            if (persist) save();
            return { name, ...vars[name], key: variableKey({ name, ...vars[name] }) };
        }
        if (type === 'tags') {
            const options = normalizeOptions(patch.options !== undefined ? patch.options : (cur?.options || []));
            const rawItems = patch.items !== undefined ? patch.items : (patch.value !== undefined ? patch.value : (cur?.items ?? cur?.value ?? []));
            const items = normalizeTagsValue(rawItems, options);
            const value = formatTagsValue(items, options);
            vars[name] = { type, options, items, value, ...(setId ? { setId } : {}), ...(group ? { group } : {}), ...(icon ? { icon } : {}), ...(isHidden ? { hidden: true } : {}), updatedAt: Date.now() };
            if (persist) save();
            return { name, ...vars[name], key: variableKey({ name, ...vars[name] }) };
        }
        let value = patch.value ?? cur?.value ?? (type === 'counter' ? 0 : type === 'toggle' ? 'false' : type === 'color' ? '#3b82f6' : '');
        if (type === 'counter') {
            value = Number.isFinite(Number(value)) ? Number(value) : 0;
        } else if (type === 'toggle') {
            value = normalizeBool(value);
        } else if (type === 'color') {
            value = normalizeColor(value);
        } else if (type === 'image') {
            value = String(value).trim().slice(0, 1000);
        } else if (type === 'font') {
            value = String(value).replace(/[\u0000-\u001f\u007f;{}<>]/g, '').trim().slice(0, 120) || 'sans-serif';
        } else {
            value = String(value).slice(0, (isHidden || setId) ? 16000 : 500);
        }
        vars[name] = {
            type,
            ...(number || { value }),
            ...(type === 'counter' ? { initial: Number(patch.initial ?? cur?.initial ?? 0) || 0 } : {}),
            ...(setId ? { setId } : {}),
            ...(group ? { group } : {}),
            ...(icon ? { icon } : {}),
            ...(isHidden ? { hidden: true } : {}),
            updatedAt: Date.now()
        };
        if (persist) save();
        return { name, ...vars[name], key: variableKey({ name, ...vars[name] }) };
    }

    function set(name, patch) {
        return normalizeVarRecord(name, patch, { persist: true });
    }

    function change(name, action, amount) {
        name = normName(name);
        const cur = vars[name] || { type: 'counter', value: 0, initial: 0 };
        if (action === 'set' && (cur.type === 'select' || cur.type === 'tags')) {
            if (amount === undefined || amount === null) throw new Error('Value is required');
            return set(name, cur.type === 'tags' ? { type: 'tags', items: amount } : { type: 'select', value: amount });
        }
        if (!['number', 'counter'].includes(cur.type)) throw new Error('Not a Number variable');
        const supplied = amount !== '' && amount !== undefined && amount !== null;
        if (action === 'set' && !supplied) throw new Error('Value is required');
        if (cur.type === 'number' && supplied && action !== 'reset') normalizeNumber.parse(amount, 'Amount');
        const by = Number.isFinite(Number(amount)) && supplied ? Number(amount) : cur.step ?? 1;
        const delta = action === 'decrement' ? -by : by;
        const value = action === 'reset' ? cur.resetValue ?? cur.initial ?? 0 : action === 'set' ? amount : cur.type === 'number' ? normalizeNumber.add(cur.value, delta) : cur.value + delta;
        return set(name, { type: cur.type, value });
    }

    function toggleVar(name, explicitValue = undefined) {
        name = normName(name);
        const cur = vars[name] || { type: 'toggle', value: 'false' };
        if (cur.type === 'tags') {
            const tag = String(explicitValue ?? '').trim();
            if (!tag) throw new Error('Tag value is required');
            const options = cur.options || [];
            const current = Array.isArray(cur.items) ? [...cur.items] : normalizeTagsValue(cur.value, options);
            const normalizedTag = normalizeTagsValue([tag], options)[0];
            if (!normalizedTag) throw new Error(`Unknown tag option "${tag}"`);
            const idx = current.findIndex(item => item.toLowerCase() === normalizedTag.toLowerCase());
            if (idx >= 0) current.splice(idx, 1);
            else current.push(normalizedTag);
            return set(name, { type: 'tags', items: current });
        }
        if (cur.type !== 'toggle') throw new Error('Not a toggle variable');
        const next = explicitValue !== undefined ? normalizeBool(explicitValue) : (normalizeBool(cur.value) === 'true' ? 'false' : 'true');
        return set(name, { type: 'toggle', value: next });
    }

    function cycleSelect(name, delta = 1) {
        name = normName(name);
        const cur = vars[name];
        if (!cur || cur.type !== 'select') throw new Error('Not a select variable');
        const options = cur.options || [];
        if (!options.length) return { name, ...cur, key: variableKey({ name, ...cur }) };
        const idx = options.findIndex(opt => opt.value.toLowerCase() === String(cur.value || '').toLowerCase());
        const nextIdx = idx < 0 ? 0 : (idx + (delta < 0 ? -1 : 1) + options.length) % options.length;
        return set(name, { type: 'select', value: options[nextIdx].value });
    }

    function clearTags(name) {
        name = normName(name);
        const cur = vars[name];
        if (!cur || cur.type !== 'tags') throw new Error('Not a tags variable');
        return set(name, { type: 'tags', items: [] });
    }

    function roll(name) {
        name = normName(name);
        const cur = vars[name];
        if (!cur || cur.type !== 'list') throw new Error('Not a list');
        const { items } = cur;
        let value = cur.value;
        if (items.length > 1) {
            if (cur.mode === 'sequential') value = items[(items.indexOf(cur.value) + 1) % items.length];
            else { const others = items.filter(i => i !== cur.value); value = others[Math.floor(Math.random() * others.length)]; }
        }
        return set(name, { value });
    }

    function normalizeChecklistMap(rawVal, field, deferLimits = false) {
        let obj = {};
        if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
            obj = rawVal;
        } else if (typeof rawVal === 'string' && rawVal.trim()) {
            try {
                const parsed = JSON.parse(rawVal);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
            } catch { /* ignore invalid JSON */ }
        }
        const catalog = sets[field.targetSet];
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            const cleanKey = normSetId(k);
            if (!cleanKey) continue;
            const num = Math.round(Number(v));
            if (Number.isFinite(num) && num >= 1) out[cleanKey] = Math.min(deferLimits ? 100 : trackerMax(field, catalog?.roster?.find(item => item.id === cleanKey)), num);
        }
        return out;
    }

    function normalizeSetPayload(rawId, patch, cur, deferTrackerLimits = false) {
        const id = normSetId(rawId);
        if (!id || !NAME_RE.test(id)) throw new Error('Set ID must be letters, numbers or underscore');
        const name = String(patch?.name ?? cur?.name ?? id).trim().slice(0, 60) || id;
        const parsedSlots = parseInt(patch?.slotsCount ?? cur?.slotsCount ?? 0, 10);
        const slotsCount = Number.isFinite(parsedSlots) ? Math.max(0, Math.min(24, parsedSlots)) : 0;

        const rawFields = Array.isArray(patch?.fields) ? patch.fields : (cur?.fields || [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'label', label: 'Subtitle', type: 'text' },
            { key: 'image', label: 'Image', type: 'image' }
        ]);
        const fields = [];
        const seenKeys = new Set();
        const reservedFieldKeys = new Set(['active', 'group', 'group_count', 'group_members']);
        for (const f of rawFields.slice(0, 12)) {
            const key = normSetId(f?.key || f?.label || '').slice(0, 20);
            if (!key || seenKeys.has(key) || reservedFieldKeys.has(key)) continue;
            seenKeys.add(key);
            const icon = sanitizeIcon(f?.icon);
            const type = VALID_SET_FIELD_TYPES.includes(f?.type) ? f.type : 'text';
            const extra = {};
            if (type === 'ref' || type === 'ref_list' || type === 'checklist') {
                const targetSet = normSetId(f?.targetSet || '');
                if (targetSet) extra.targetSet = targetSet;
            }
            if (type === 'checklist') {
                const parsedMax = parseInt(f?.maxTier, 10);
                extra.maxTier = (Number.isFinite(parsedMax) && parsedMax >= 1) ? Math.min(100, parsedMax) : 1;
            }
            if (type === 'counter' || type === 'number') {
                const parseOpt = val => (val !== '' && val != null && Number.isFinite(Number(val))) ? Number(val) : null;
                let minVal = parseOpt(f?.min);
                let maxVal = parseOpt(f?.max);
                if (minVal !== null && maxVal !== null && minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
                const stepVal = parseOpt(f?.step);
                if (minVal !== null) extra.min = minVal;
                if (maxVal !== null) extra.max = maxVal;
                if (stepVal !== null && stepVal > 0) extra.step = stepVal;
            }
            if (type === 'select' || type === 'tags') {
                extra.options = normalizeOptions(f?.options || []);
            }
            fields.push({
                key,
                label: String(f?.label || key).trim().slice(0, 40) || key,
                type,
                ...(icon ? { icon } : {}),
                ...extra
            });
        }
        if (!fields.length) fields.push({ key: 'name', label: 'Name', type: 'text' });

        const rawRoster = Array.isArray(patch?.roster) ? patch.roster : (cur?.roster || []);
        const roster = [];
        const seenEntries = new Set();
        for (let idx = 0; idx < rawRoster.slice(0, 60).length; idx++) {
            const r = rawRoster[idx];
            if (!r || typeof r !== 'object') continue;
            let entryId = normSetId(r.id || r.label || r.values?.name || `entry_${idx + 1}`);
            if (!entryId) entryId = `entry_${idx + 1}`;
            const baseId = entryId;
            for (let n = 2; seenEntries.has(entryId); n++) entryId = `${baseId.slice(0, 24 - String(n).length - 1)}_${n}`;
            seenEntries.add(entryId);
            const valuesMap = {};
            for (const f of fields) {
                const rawVal = r.values?.[f.key] ?? '';
                if (f.type === 'color') valuesMap[f.key] = rawVal ? normalizeColor(rawVal) : '#3b82f6';
                else if (f.type === 'toggle') valuesMap[f.key] = normalizeBool(rawVal);
                else if (f.type === 'image') valuesMap[f.key] = String(rawVal).trim().slice(0, 1000);
                else if (f.type === 'ref') valuesMap[f.key] = normSetId(rawVal || '');
                else if (f.type === 'ref_list') {
                    const arr = Array.isArray(rawVal) ? rawVal : (typeof rawVal === 'string' && rawVal.trim().startsWith('[') ? (() => { try { return JSON.parse(rawVal); } catch { return []; } })() : String(rawVal || '').split(',').map(s => s.trim()).filter(Boolean));
                    valuesMap[f.key] = [...new Set((Array.isArray(arr) ? arr : []).map(x => normSetId(x)).filter(Boolean))].slice(0, 60);
                }
                else if (f.type === 'checklist') valuesMap[f.key] = normalizeChecklistMap(rawVal, f, deferTrackerLimits);
                else if (f.type === 'select') valuesMap[f.key] = normalizeSelectValue(rawVal, f.options || []);
                else if (f.type === 'tags') valuesMap[f.key] = normalizeTagsValue(rawVal, f.options || []);
                else valuesMap[f.key] = String(rawVal).slice(0, 500);
            }
            const firstVal = valuesMap[fields[0].key];
            const label = String(r.label || (typeof firstVal === 'string' ? firstVal : '') || entryId).trim().slice(0, 60) || entryId;
            const enabled = r.enabled !== false && r.enabled !== 'false' && r.enabled !== 0 && r.enabled !== '0';
            const inGroup = r.inGroup !== false && r.inGroup !== 'false' && r.inGroup !== 0 && r.inGroup !== '0';
            const tiers = Array.isArray(r.tiers)
                ? r.tiers.slice(0, 20).map((t, tIdx) => ({
                    level: tIdx + 1,
                    label: String(t?.label || '').trim().slice(0, 80),
                    image: String(t?.image || '').trim().slice(0, 1000),
                    description: String(t?.description || '').trim().slice(0, 300),
                    ...(t?.color ? { color: normalizeColor(t.color) } : {}),
                    ...(t?.icon ? { icon: sanitizeIcon(t.icon) } : {})
                }))
                : undefined;
            roster.push({ id: entryId, label, enabled, inGroup, values: valuesMap, ...(tiers?.length ? { tiers } : {}) });
        }

        const prevSlots = Array.isArray(patch?.slots) ? patch.slots : (cur?.slots || []);
        const validRosterIds = new Set(roster.map(r => r.id));
        const slots = Array.from({ length: slotsCount }, (_, i) => {
            const candidate = normSetId(prevSlots[i] || '');
            return validRosterIds.has(candidate) ? candidate : '';
        });
        const prevSlotNames = Array.isArray(patch?.slotNames) ? patch.slotNames : (cur?.slotNames || []);
        const slotNames = Array.from({ length: slotsCount }, (_, i) => String(prevSlotNames[i] ?? '').trim().slice(0, 40));
        const prevQueues = Array.isArray(patch?.slotQueues) ? patch.slotQueues : (cur?.slotQueues || []);
        const slotQueues = Array.from({ length: slotsCount }, (_, i) => {
            const q = Array.isArray(prevQueues[i]) ? prevQueues[i] : [];
            return q.map(e => normSetId(e)).filter(e => validRosterIds.has(e)).slice(0, 50);
        });
        const candidateActive = normSetId(patch?.activeEntry ?? cur?.activeEntry ?? '');
        const activeEntry = validRosterIds.has(candidateActive) ? candidateActive : '';

        const rawRotation = normalizeRotation({ ...(cur?.rotation || {}), ...(patch?.rotation || {}) }, validRosterIds);
        // Multi-slot sets (2+ slots) are queue/slot managed rather than single-spotlight timer rotated.
        const rotation = slotsCount >= 2 ? { ...rawRotation, enabled: false } : rawRotation;
        const group = normalizeGroup({ ...(cur?.group || {}), ...(patch?.group && typeof patch.group === 'object' ? patch.group : {}) });

        return { id, name, slotsCount, fields, roster, slots, slotNames, slotQueues, activeEntry, rotation, group, updatedAt: Date.now() };
    }

    function normalizeGroup(raw = {}) {
        return {
            separator: raw.separator !== undefined ? String(raw.separator).slice(0, 40) : ', ',
            lastSeparator: raw.lastSeparator !== undefined ? String(raw.lastSeparator).slice(0, 40) : '',
            itemTemplate: String(raw.itemTemplate || '').slice(0, 240)
        };
    }

    function formatGroupItem(template, entry, fields = []) {
        const tpl = String(template || '').trim();
        if (!tpl) {
            const primaryKey = fields[0]?.key || 'name';
            return String(entry?.values?.[primaryKey] ?? entry?.label ?? '').trim();
        }
        let hadTokenValue = false;
        const rendered = tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, rawKey) => {
            const k = normSetId(rawKey);
            const val = k === 'label' ? entry?.label : entry?.values?.[k];
            const s = val === undefined || val === null ? '' : String(val).trim();
            if (s) hadTokenValue = true;
            return s;
        });
        if (!hadTokenValue && /\{\{\s*[a-z0-9_]+\s*\}\}/i.test(tpl)) return '';
        return rendered
            .replace(/\(\s*\)|\[\s*\]/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    function joinWithSeparators(items = [], separator = ', ', lastSeparator = '') {
        if (!items.length) return '';
        if (items.length === 1) return items[0];
        if (lastSeparator) return `${items.slice(0, -1).join(separator)}${lastSeparator}${items[items.length - 1]}`;
        return items.join(separator);
    }

    function normalizeRotation(raw = {}, validIds = null) {
        const entryId = normSetId(raw.entryId || '');
        return {
            enabled: raw.enabled === true || raw.enabled === 'true' || raw.enabled === 1 || raw.enabled === '1',
            intervalSeconds: Math.max(1, Math.min(3600, Math.round(Number(raw.intervalSeconds) || 10))),
            mode: raw.mode === 'random' ? 'random' : 'sequential',
            transition: ROTATION_TRANSITIONS.includes(raw.transition) ? raw.transition : 'fade',
            durationMs: Math.max(50, Math.min(2000, Math.round(Number(raw.durationMs) || 350))),
            entryId: validIds && !validIds.has(entryId) ? '' : entryId,
            changedAt: Number(raw.changedAt) || 0
        };
    }

    // Restores vars and sets if a mutation throws part-way (e.g. hitting a variable cap mid-materialize).
    function atomic(fn) {
        const prevVars = JSON.parse(JSON.stringify(vars));
        const prevSets = JSON.parse(JSON.stringify(sets));
        const prevGroups = variableGroups.list();
        try {
            return fn();
        } catch (err) {
            vars = prevVars;
            sets = prevSets;
            variableGroups.restore(prevGroups);
            throw err;
        }
    }

    function materializeSetVars(setObj) {
        // Clear any previously materialized vars belonging to this set
        for (const [k, v] of Object.entries(vars)) {
            if (v?.setId === setObj.id) delete vars[k];
        }
        const byId = new Map(setObj.roster.map(r => [r.id, r]));
        const writeField = (varName, type, value, extra = {}) => {
            normalizeVarRecord(varName, { type, value, setId: setObj.id, ...extra }, { persist: false });
        };

        // Dynamic Group tokens (all active members with inGroup !== false, zero empty slots)
        const groupCfg = normalizeGroup(setObj.group || {});
        const sep = groupCfg.separator;
        const lastSep = groupCfg.lastSeparator;
        const groupEntries = (setObj.roster || []).filter(r => r.inGroup !== false);
        const groupItems = groupEntries.map(e => formatGroupItem(groupCfg.itemTemplate, e, setObj.fields)).filter(Boolean);
        writeField(`${setObj.id}_group`, 'text', joinWithSeparators(groupItems, sep, lastSep));
        writeField(`${setObj.id}_group_count`, 'counter', groupEntries.length);

        const imgField = (setObj.fields || []).find(f => f.type === 'image')
            || (setObj.fields || []).find(f => /avatar|photo|image|img|icon|pic|logo/i.test(f.key));
        const subField = (setObj.fields || []).find(f => f.type === 'text' && f !== setObj.fields[0]);
        const groupMembers = groupEntries.map(e => ({
            id: e.id,
            label: e.label,
            text: formatGroupItem(groupCfg.itemTemplate, e, setObj.fields) || e.label,
            sub: subField ? String(e.values?.[subField.key] ?? '').trim() : '',
            image: imgField ? String(e.values?.[imgField.key] ?? '').trim() : '',
            values: e.values || {}
        }));
        writeField(`${setObj.id}_group_members`, 'text', JSON.stringify(groupMembers), { hidden: true });

        for (const f of setObj.fields) {
            const vals = groupEntries.map(e => {
                const v = resolveSetFieldValue(f, e);
                return f.type === 'checklist' ? '' : String(v ?? '').trim();
            }).filter(Boolean);
            writeField(`${setObj.id}_group_${f.key}`, 'text', joinWithSeparators(vals, sep, lastSep));
        }

        if (setObj.slotsCount === 0) {
            const entry = byId.get(setObj.activeEntry) || null;
            writeField(`${setObj.id}_active`, 'toggle', entry ? 'true' : 'false');
            for (const f of setObj.fields) {
                const val = resolveSetFieldValue(f, entry);
                writeField(`${setObj.id}_${f.key}`, f.type, val, f.icon ? { icon: f.icon } : {});
                if (f.type === 'ref' && f.targetSet) {
                    materializeRefFields(setObj.id, f, entry, [`${setObj.id}_${f.key}`], writeField);
                }
            }
            return;
        }

        for (const f of setObj.fields) {
            const slotVals = (setObj.slots || [])
                .map(sId => byId.get(sId))
                .filter(Boolean)
                .map(e => f.type === 'checklist' ? '' : String(e.values?.[f.key] ?? '').trim())
                .filter(Boolean);
            writeField(`${setObj.id}_joined_${f.key}`, 'text', joinWithSeparators(slotVals, sep, lastSep));
        }

        for (let i = 0; i < setObj.slotsCount; i++) {
            const slotNum = i + 1;
            const customLabel = String(setObj.slotNames?.[i] || '').trim();
            const slotDisplayName = customLabel || `Slot ${slotNum}`;
            const slotSlug = normSetId(customLabel);
            const hasNamedAlias = slotSlug && !/^\d+$/.test(slotSlug) && slotSlug !== 'active';

            const entry = byId.get(setObj.slots[i]) || null;
            const activeVal = entry ? 'true' : 'false';
            writeField(`${setObj.id}_${slotNum}_slot_name`, 'text', slotDisplayName);
            writeField(`${setObj.id}_${slotNum}_active`, 'toggle', activeVal);
            if (i === 0) {
                writeField(`${setObj.id}_slot_name`, 'text', slotDisplayName);
                writeField(`${setObj.id}_active`, 'toggle', activeVal);
            }
            if (hasNamedAlias) {
                writeField(`${setObj.id}_${slotSlug}_slot_name`, 'text', slotDisplayName);
                writeField(`${setObj.id}_${slotSlug}_active`, 'toggle', activeVal);
            }

            for (const f of setObj.fields) {
                const val = resolveSetFieldValue(f, entry);
                const iconExtra = f.icon ? { icon: f.icon } : {};
                writeField(`${setObj.id}_${slotNum}_${f.key}`, f.type, val, iconExtra);
                if (i === 0) writeField(`${setObj.id}_${f.key}`, f.type, val, iconExtra);
                if (hasNamedAlias) writeField(`${setObj.id}_${slotSlug}_${f.key}`, f.type, val, iconExtra);
                if (f.type === 'ref' && f.targetSet) {
                    const prefixes = [`${setObj.id}_${slotNum}_${f.key}`];
                    if (i === 0) prefixes.push(`${setObj.id}_${f.key}`);
                    if (hasNamedAlias) prefixes.push(`${setObj.id}_${slotSlug}_${f.key}`);
                    materializeRefFields(setObj.id, f, entry, prefixes, writeField);
                }
            }
        }
    }

    function materializeRefFields(sourceSetId, field, entry, prefixes, writeField) {
        const targetSetId = normSetId(field.targetSet);
        if (!targetSetId || targetSetId === sourceSetId) return; // 1-hop max, cycle-guarded
        const targetSet = sets[targetSetId];
        if (!targetSet) return;
        const targetEntryId = entry ? normSetId(entry.values?.[field.key] || '') : '';
        const targetEntry = targetEntryId ? (targetSet.roster || []).find(r => r.id === targetEntryId) || null : null;
        for (const tf of targetSet.fields || []) {
            if (tf.type === 'ref') continue; // 1-hop max
            const tVal = resolveSetFieldValue(tf, targetEntry);
            const tIconExtra = tf.icon ? { icon: tf.icon } : {};
            for (const prefix of prefixes) {
                writeField(`${prefix}_${tf.key}`, tf.type, tVal, tIconExtra);
            }
        }
    }

    function upsertSetRaw(setId, patch) {
        const cleanId = normSetId(setId);
        const cur = sets[cleanId];
        if (!cur && Object.keys(sets).length >= 30) throw new Error('Too many variable sets');
        const nextSet = normalizeSetPayload(cleanId, patch, cur);
        for (const field of cur?.fields || []) {
            const next = nextSet.fields.find(item => item.key === field.key);
            if (!next || next.type !== field.type || next.targetSet !== field.targetSet) assertUnreferenced(cleanId, undefined, field.key);
        }
        sets[nextSet.id] = nextSet;
        for (const entry of cur?.roster || []) {
            if (!nextSet.roster.some(item => item.id === entry.id)) assertUnreferenced(cleanId, entry.id);
        }
        materializeSetVars(nextSet);
        for (const other of Object.values(sets)) {
            if (other.id !== nextSet.id && (other.fields || []).some(f => f.type === 'ref' && normSetId(f.targetSet) === nextSet.id)) {
                materializeSetVars(other);
            }
        }
        saveSets({ saveVarsAlso: true });
        scheduleRotation(nextSet.id);
        return nextSet;
    }

    function deleteSet(setId) {
        const cleanId = normSetId(setId);
        if (!sets[cleanId]) throw new Error('Set not found');
        assertUnreferenced(cleanId);
        delete sets[cleanId];
        scheduleRotation(cleanId);
        for (const [k, v] of Object.entries(vars)) {
            if (v?.setId === cleanId) delete vars[k];
        }
        saveSets({ saveVarsAlso: true });
        return listSets();
    }

    function dependencies(setId, entryId, fieldKey) {
        if (getDependencies) return getDependencies(normSetId(setId), entryId ? normSetId(entryId) : undefined, fieldKey) || [];
        const helper = require('./variable-dependencies')({ getSets: listSets, getVariables: list });
        return fieldKey ? helper.forField(normSetId(setId), fieldKey) : helper.forSet(normSetId(setId), entryId ? normSetId(entryId) : undefined);
    }

    function assertUnreferenced(setId, entryId, fieldKey) {
        const uses = dependencies(setId, entryId, fieldKey);
        if (uses.length) {
            throw Object.assign(new Error(`Remove these references first: ${uses.map(use => use.label).join('; ')}`), {
                status: 409, code: 'dependencies', dependencies: uses
            });
        }
    }

    function checkExpected(options, current) {
        if (Object.hasOwn(options, 'expected') && !isDeepStrictEqual(options.expected, current)) {
            throw Object.assign(new Error(`This value changed elsewhere (current: ${JSON.stringify(current)}). Review and retry.`), {
                status: 409, code: 'conflict', current
            });
        }
    }

    function mutateEntryRaw(setId, action, options = {}) {
        const setObj = sets[normSetId(setId)];
        if (!setObj) throw new Error('Set not found');
        const roster = globalThis.structuredClone(setObj.roster);
        if (action === 'add') {
            if (roster.length >= 60) throw new Error('A set supports up to 60 entries');
            const input = typeof options.entry === 'object' && options.entry ? options.entry : { id: options.entry, label: options.label };
            const id = normSetId(input.id || input.label);
            if (!id) throw new Error('Entry ID is required');
            if (roster.some(entry => entry.id === id)) {
                throw Object.assign(new Error('An entry with this ID already exists. Choose another ID.'), { status: 409, code: 'conflict' });
            }
            roster.push({ ...input, id });
        } else {
            const entry = roster.find(item => item.id === options.entry);
            if (!entry) throw new Error('Entry not found');
            if (action === 'remove') {
                checkExpected(options, entry);
                assertUnreferenced(setObj.id, entry.id);
                roster.splice(roster.indexOf(entry), 1);
            } else if (action === 'update') {
                // Modal edits compare the single entry, never replace unrelated roster entries.
                checkExpected(options, entry);
                const patch = options.patch || {};
                if (patch.values) entry.values = { ...entry.values, ...patch.values };
                for (const property of ['label', 'enabled', 'inGroup', 'tiers']) {
                    if (Object.hasOwn(patch, property)) entry[property] = patch[property];
                }
            } else {
                const property = options.property;
                const field = setObj.fields.find(item => item.key === options.field);
                if (property && !['label', 'enabled', 'inGroup'].includes(property)) throw new Error('Unknown entry property');
                if (!property && !field) throw new Error('Field not found');
                const current = property ? entry[property] : entry.values[field.key];
                checkExpected(options, current);
                let value = options.value;
                if (action === 'step') {
                    if (property || !['number', 'counter'].includes(field.type)) throw new Error('Only numeric fields support stepping');
                    const delta = Number(options.delta ?? (field.step || 1));
                    if (!Number.isFinite(delta) || !Number.isFinite(Number(current))) throw new Error('A finite number is required');
                    let nextNum = Number(current) + delta;
                    if (field.min != null && Number.isFinite(Number(field.min))) nextNum = Math.max(Number(field.min), nextNum);
                    if (field.max != null && Number.isFinite(Number(field.max))) nextNum = Math.min(Number(field.max), nextNum);
                    value = String(nextNum);
                    if (!Number.isFinite(Number(value))) throw new Error('Result is outside the numeric range');
                }
                if (value === undefined) throw new Error('Value is required');
                if (property) entry[property] = property === 'label' ? String(value) : normalizeBool(value) === 'true';
                else {
                    entry.values[field.key] = value;
                    if (field.key === setObj.fields[0]?.key && typeof value === 'string') entry.label = value.trim() || entry.label;
                }
            }
        }
        return upsertSetRaw(setObj.id, { roster });
    }

    const mutateEntry = (...args) => atomic(() => mutateEntryRaw(...args));

    function resetSetColumnRaw(setId, fieldKey, resetValue = undefined) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const field = (setObj.fields || []).find(f => f.key === fieldKey);
        if (!field) throw new Error('Field not found');
        const roster = globalThis.structuredClone(setObj.roster || []);
        for (const entry of roster) {
            if (!entry.values) entry.values = {};
            if (field.type === 'counter' || field.type === 'number') {
                const fallback = field.min != null && Number.isFinite(Number(field.min)) ? Number(field.min) : 0;
                const val = resetValue !== undefined && resetValue !== '' && Number.isFinite(Number(resetValue)) ? Number(resetValue) : fallback;
                entry.values[field.key] = String(val);
            } else if (field.type === 'tags') {
                entry.values[field.key] = [];
            } else if (field.type === 'toggle') {
                entry.values[field.key] = 'false';
            } else if (field.type === 'select') {
                entry.values[field.key] = field.options?.[0]?.value || '';
            } else {
                entry.values[field.key] = '';
            }
        }
        return upsertSetRaw(setObj.id, { roster });
    }
    const resetSetColumn = (...args) => atomic(() => resetSetColumnRaw(...args));

    function parseSlotIndex(setObj, rawSlot) {
        const str = String(rawSlot ?? '').trim();
        if (str && !/^\d+$/.test(str)) {
            const slug = normSetId(str);
            const namedIdx = (setObj.slotNames || []).findIndex(n =>
                n.toLowerCase() === str.toLowerCase() || (slug && normSetId(n) === slug)
            );
            if (namedIdx >= 0) return namedIdx;
        }
        const idx = (parseInt(str, 10) || 1) - 1;
        if (idx < 0 || idx >= setObj.slotsCount) throw new Error(`Slot must be 1..${setObj.slotsCount}`);
        return idx;
    }

    function assignSetSlotRaw(setId, slotParam = 1, entryParam = '') {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const rawEntry = String(entryParam || '').trim();
        let nextId = '';
        if (rawEntry) {
            const normEntry = normSetId(rawEntry);
            const found = setObj.roster.find(r => r.id === normEntry || r.label.toLowerCase() === rawEntry.toLowerCase());
            if (!found) throw new Error(`Roster entry "${rawEntry}" not found`);
            nextId = found.id;
        }
        if (setObj.slotsCount === 0) {
            setObj.activeEntry = nextId;
        } else {
            const idx = parseSlotIndex(setObj, slotParam);
            setObj.slots[idx] = nextId;
        }
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }



    function clearSetSlotRaw(setId, slotParam = 1) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if (setObj.slotsCount === 0) {
            setObj.activeEntry = '';
        } else if (String(slotParam).toLowerCase() === 'all') {
            setObj.slots = setObj.slots.map(() => '');
        } else {
            const idx = parseSlotIndex(setObj, slotParam);
            setObj.slots[idx] = '';
        }
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }



    function cycleSetSlotRaw(setId, slotParam = 1, direction = 1) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const pool = setObj.roster.filter(r => r.enabled !== false);
        if (!pool.length) return setObj;

        if (setObj.slotsCount === 0) {
            const curPos = pool.findIndex(r => r.id === setObj.activeEntry);
            const nextPos = curPos === -1
                ? (direction > 0 ? 0 : pool.length - 1)
                : (curPos + direction + pool.length) % pool.length;
            setObj.activeEntry = pool[nextPos].id;
        } else {
            const idx = parseSlotIndex(setObj, slotParam);
            if (!Array.isArray(setObj.slotQueues)) setObj.slotQueues = Array.from({ length: setObj.slotsCount }, () => []);
            const queue = setObj.slotQueues[idx];
            let chosenFromQueue = '';
            while (direction > 0 && Array.isArray(queue) && queue.length > 0) {
                const candId = queue.shift();
                if (pool.some(r => r.id === candId)) { chosenFromQueue = candId; break; }
            }
            if (chosenFromQueue) {
                setObj.slots[idx] = chosenFromQueue;
            } else {
                const occupied = new Set(setObj.slots.filter((id, i) => id && i !== idx));
                const curPos = pool.findIndex(r => r.id === setObj.slots[idx]);
                const len = pool.length;
                let chosen = '';
                for (let step = 1; step <= len; step++) {
                    const pos = curPos === -1
                        ? (direction > 0 ? (step - 1) % len : (len - step) % len)
                        : (curPos + direction * step + len * step) % len;
                    const candidate = pool[pos].id;
                    if (!occupied.has(candidate)) { chosen = candidate; break; }
                }
                if (!chosen) {
                    const fallbackPos = curPos === -1 ? (direction > 0 ? 0 : len - 1) : (curPos + direction + len) % len;
                    chosen = pool[fallbackPos].id;
                }
                setObj.slots[idx] = chosen;
            }
        }

        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }

    function toggleSetEntry(setId, entryId, enabledParam) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const cleanEntry = normSetId(entryId);
        const entry = setObj.roster.find(r => r.id === cleanEntry || r.id === entryId);
        if (!entry) throw new Error('Entry not found');
        entry.enabled = (enabledParam !== undefined && enabledParam !== '')
            ? normalizeBool(enabledParam) === 'true'
            : (entry.enabled === false);
        setObj.updatedAt = Date.now();
        saveSets({ saveVarsAlso: false });
        scheduleRotation(cleanId);
        return setObj;
    }

    function toggleEntryGroupRaw(setId, entryId, inGroupParam) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const cleanEntry = normSetId(entryId);
        const entry = setObj.roster.find(r => r.id === cleanEntry || r.id === entryId);
        if (!entry) throw new Error('Entry not found');
        entry.inGroup = (inGroupParam !== undefined && inGroupParam !== '')
            ? normalizeBool(inGroupParam) === 'true'
            : (entry.inGroup === false);
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }

    function updateSetGroupRaw(setId, patch = {}) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        setObj.group = normalizeGroup({ ...(setObj.group || {}), ...(patch || {}) });
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }

    function advanceSetQueueRaw(setId, direction = 1, mode = 'shift') {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const pool = setObj.roster.filter(r => r.enabled !== false);
        if (!pool.length || setObj.slotsCount <= 1) {
            return cycleSetSlot(setId, 1, direction);
        }
        const len = pool.length;
        const n = setObj.slotsCount;
        if (mode === 'page') {
            const firstPos = pool.findIndex(r => r.id === setObj.slots[0]);
            const start = firstPos === -1 ? 0 : (firstPos + direction * n + len * n) % len;
            setObj.slots = Array.from({ length: n }, (_, i) => (i < len ? pool[(start + i) % len].id : ''));
        } else if (direction > 0) {
            const nextSlots = setObj.slots.slice(1);
            const occupied = new Set(nextSlots.filter(Boolean));
            const anchorId = setObj.slots[n - 1] || nextSlots[nextSlots.length - 1] || '';
            const anchorPos = pool.findIndex(r => r.id === anchorId);
            let incoming = '';
            for (let step = 1; step <= len; step++) {
                const pos = anchorPos === -1 ? (step - 1) % len : (anchorPos + step) % len;
                const cand = pool[pos].id;
                if (!occupied.has(cand)) { incoming = cand; break; }
            }
            nextSlots.push(incoming);
            setObj.slots = nextSlots;
        } else {
            const nextSlots = setObj.slots.slice(0, n - 1);
            const occupied = new Set(nextSlots.filter(Boolean));
            const anchorId = setObj.slots[0] || nextSlots[0] || '';
            const anchorPos = pool.findIndex(r => r.id === anchorId);
            let incoming = '';
            for (let step = 1; step <= len; step++) {
                const pos = anchorPos === -1 ? (len - step) % len : (anchorPos - step + len * step) % len;
                const cand = pool[pos].id;
                if (!occupied.has(cand)) { incoming = cand; break; }
            }
            setObj.slots = [incoming, ...nextSlots];
        }
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }



    function enqueueSetSlot(setId, slotParam = 1, entryParam = '') {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if (setObj.slotsCount <= 0) throw new Error('Slotless preset sets do not use slot queues');
        const idx = parseSlotIndex(setObj, slotParam);
        const rawEntry = String(entryParam || '').trim();
        const normEntry = normSetId(rawEntry);
        const found = setObj.roster.find(r => r.id === normEntry || r.label.toLowerCase() === rawEntry.toLowerCase());
        if (!found) throw new Error(`Roster entry "${rawEntry}" not found`);
        if (!Array.isArray(setObj.slotQueues)) setObj.slotQueues = Array.from({ length: setObj.slotsCount }, () => []);
        if (setObj.slotQueues[idx].length >= 50) throw new Error('Slot queue is full');
        setObj.slotQueues[idx].push(found.id);
        setObj.updatedAt = Date.now();
        saveSets({ saveVarsAlso: false });
        return setObj;
    }

    function removeSetSlotQueue(setId, slotParam = 1, indexOrEntry = 0) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if (setObj.slotsCount <= 0) return setObj;
        const idx = parseSlotIndex(setObj, slotParam);
        if (!Array.isArray(setObj.slotQueues)) setObj.slotQueues = Array.from({ length: setObj.slotsCount }, () => []);
        const q = setObj.slotQueues[idx];
        const num = Number(indexOrEntry);
        if (Number.isInteger(num) && num >= 0 && num < q.length) {
            q.splice(num, 1);
        } else {
            const normEntry = normSetId(indexOrEntry);
            const pos = q.indexOf(normEntry);
            if (pos >= 0) q.splice(pos, 1);
        }
        setObj.updatedAt = Date.now();
        saveSets({ saveVarsAlso: false });
        return setObj;
    }

    function clearSetSlotQueue(setId, slotParam = 1) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if (setObj.slotsCount <= 0) return setObj;
        if (!Array.isArray(setObj.slotQueues)) setObj.slotQueues = Array.from({ length: setObj.slotsCount }, () => []);
        if (String(slotParam).toLowerCase() === 'all') {
            setObj.slotQueues = setObj.slotQueues.map(() => []);
        } else {
            const idx = parseSlotIndex(setObj, slotParam);
            setObj.slotQueues[idx] = [];
        }
        setObj.updatedAt = Date.now();
        saveSets({ saveVarsAlso: false });
        return setObj;
    }

    function swapSetSlotsRaw(setId, fromParam = 1, toParam = 2) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const fromIdx = parseSlotIndex(setObj, fromParam);
        const toIdx = parseSlotIndex(setObj, toParam);
        const tmp = setObj.slots[fromIdx];
        setObj.slots[fromIdx] = setObj.slots[toIdx];
        setObj.slots[toIdx] = tmp;
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }

    function mutateChecklistRaw(setId, mode, opts = {}) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');

        const checklistFields = (setObj.fields || []).filter(f => f.type === 'checklist');
        const rawField = String(opts.field ?? '').trim();
        let field = null;
        if (rawField) {
            const fk = normSetId(rawField);
            field = checklistFields.find(f => f.key === fk);
            if (!field) throw new Error(`Checklist field "${rawField}" not found`);
        } else if (checklistFields.length === 1) {
            field = checklistFields[0];
        } else {
            throw new Error(checklistFields.length ? 'Checklist field is required' : 'Set has no checklist fields');
        }

        let entry = null;
        const resetAll = mode === 'reset' && (opts.all === true || opts.all === '1' || opts.all === 'true');
        if (!resetAll) {
            const rawEntry = String(opts.entry ?? '').trim();
            if (rawEntry) {
                const normEntry = normSetId(rawEntry);
                entry = (setObj.roster || []).find(r => r.id === normEntry || r.id === rawEntry || r.label.toLowerCase() === rawEntry.toLowerCase()) || null;
                if (!entry) throw new Error(`Roster entry "${rawEntry}" not found`);
            } else if (setObj.slotsCount === 0) {
                const activeId = setObj.activeEntry || '';
                entry = activeId ? (setObj.roster || []).find(r => r.id === activeId) || null : null;
                if (!entry) throw new Error('No active entry in set');
            } else {
                const idx = parseSlotIndex(setObj, opts.slot ?? 1);
                const slotEntryId = setObj.slots?.[idx] || '';
                entry = slotEntryId ? (setObj.roster || []).find(r => r.id === slotEntryId) || null : null;
                if (!entry) throw new Error(`Slot ${idx + 1} is empty`);
            }
        }

        const rawTarget = String(opts.target ?? '').trim();
        let targetId = normSetId(rawTarget);
        const targetSet = field.targetSet ? sets[normSetId(field.targetSet)] : null;

        if (mode === 'reset') {
            if (opts.all === true || opts.all === '1' || opts.all === 'true') {
                for (const r of setObj.roster || []) {
                    if (!r.values || typeof r.values !== 'object') r.values = {};
                    r.values[field.key] = {};
                }
            } else {
                if (!entry.values || typeof entry.values !== 'object') entry.values = {};
                entry.values[field.key] = {};
            }
            setObj.updatedAt = Date.now();
            materializeSetVars(setObj);
            saveSets({ saveVarsAlso: true });
            return setObj;
        }

        if (!targetId) throw new Error('Choose an item to track');
        let targetEntry = null;
        if (targetSet) {
            targetEntry = (targetSet.roster || []).find(r => r.id === targetId || r.label.toLowerCase() === rawTarget.toLowerCase()) || null;
            if (targetEntry) targetId = targetEntry.id;
        }

        if (!targetSet || !targetEntry) throw new Error('Tracked item was not found in the linked set');
        const maxTier = trackerMax(field, targetEntry);
        if (!entry.values || typeof entry.values !== 'object') entry.values = {};
        const curMap = normalizeChecklistMap(entry.values[field.key], field);
        const curVal = curMap[targetId] || 0;

        let nextVal = curVal;
        if (mode === 'set') {
            const rawVal = opts.value;
            if (rawVal === undefined || rawVal === '' || rawVal === null) throw new Error('Value is required');
            if (rawVal === true || rawVal === 'true') nextVal = 1;
            else if (rawVal === false || rawVal === 'false') nextVal = 0;
            else {
                const num = Number(rawVal);
                if (!Number.isFinite(num)) throw new Error('Value must be a number');
                nextVal = Math.max(0, Math.min(maxTier, Math.round(num)));
            }
        } else if (mode === 'toggle' || mode === 'step') {
            const rawDelta = opts.delta;
            if (rawDelta === undefined || rawDelta === '' || rawDelta === null) {
                nextVal = (curVal + 1) % (maxTier + 1);
            } else {
                const delta = Number(rawDelta);
                if (!Number.isFinite(delta)) throw new Error('Delta must be a number');
                nextVal = Math.max(0, Math.min(maxTier, Math.round(curVal + delta)));
            }
        } else {
            throw new Error(`Unknown checklist operation "${mode}"`);
        }

        if (nextVal <= 0) delete curMap[targetId];
        else curMap[targetId] = nextVal;
        entry.values[field.key] = curMap;
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }



    function importBundleRaw(payload = {}) {
        const previousRosters = new Map(Object.values(sets).map(setObj => [setObj.id, globalThis.structuredClone(setObj.roster)]));
        const previousFields = new Map(Object.values(sets).map(setObj => [setObj.id, globalThis.structuredClone(setObj.fields)]));
        for (const group of Array.isArray(payload.groups) ? payload.groups : []) variableGroups.add(group);
        const importedVars = Array.isArray(payload.variables) ? payload.variables : [];
        const importedSets = Array.isArray(payload.sets) ? payload.sets : [];
        let varCount = 0;
        let setCount = 0;
        for (const v of importedVars) {
            if (!v?.name || v.setId) continue;
            normalizeVarRecord(v.name, v, { persist: false });
            varCount++;
        }
        for (const s of importedSets) {
            if (!s?.id) continue;
            const nextSet = normalizeSetPayload(s.id, s, sets[normSetId(s.id)], true);
            sets[nextSet.id] = nextSet;
            setCount++;
        }
        // All linked catalogs must exist before applying item-specific limits.
        for (const s of importedSets) {
            if (!s?.id) continue;
            const id = normSetId(s.id);
            sets[id] = normalizeSetPayload(id, sets[id], sets[id]);
        }
        for (const [id, roster] of previousRosters) {
            for (const entry of roster) {
                if (!sets[id].roster.some(item => item.id === entry.id)) assertUnreferenced(id, entry.id);
            }
            for (const [id, fields] of previousFields) for (const field of fields) {
                const next = sets[id].fields.find(item => item.key === field.key);
                if (!next || next.type !== field.type || next.targetSet !== field.targetSet) assertUnreferenced(id, undefined, field.key);
            }
        }
        for (const s of Object.values(sets)) materializeSetVars(s);
        saveSets({ saveVarsAlso: true });
        for (const id of Object.keys(sets)) scheduleRotation(id);
        return { ok: true, importedVars: varCount, importedSets: setCount, variables: list(), groups: listGroups(), sets: listSets() };
    }

    function toCsvCell(val) {
        const s = String(val ?? '');
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    function parseCsvRows(text) {
        const rows = [];
        let row = [];
        let cell = '';
        let inQuotes = false;
        const clean = String(text || '').replace(/^\uFEFF/, '');
        for (let i = 0; i < clean.length; i++) {
            const ch = clean[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (clean[i + 1] === '"') { cell += '"'; i++; }
                    else inQuotes = false;
                } else {
                    cell += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(cell);
                cell = '';
            } else if (ch === '\r' || ch === '\n') {
                if (ch === '\r' && clean[i + 1] === '\n') i++;
                row.push(cell);
                if (row.some(c => c.trim() !== '')) rows.push(row);
                row = [];
                cell = '';
            } else {
                cell += ch;
            }
        }
        row.push(cell);
        if (row.some(c => c.trim() !== '')) rows.push(row);
        return rows;
    }

    function exportSetCsv(setId) {
        const setObj = sets[normSetId(setId)];
        if (!setObj) throw new Error('Set not found');
        const headers = ['id', 'label', ...(setObj.fields || []).map(f => f.key)];
        const lines = [headers.map(toCsvCell).join(',')];
        for (const entry of setObj.roster || []) {
            const cells = [
                entry.id,
                entry.label,
                ...(setObj.fields || []).map(f => {
                    const v = entry.values?.[f.key] ?? '';
                    return (v && typeof v === 'object') ? JSON.stringify(v) : v;
                })
            ];
            lines.push(cells.map(toCsvCell).join(','));
        }
        return `${lines.join('\r\n')}\r\n`;
    }

    function importSetCsv(setId, csvText, { replace = false } = {}) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        const rows = parseCsvRows(csvText);
        if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row');

        const rawHeaders = rows[0].map(h => String(h || '').trim());
        const fieldByCol = rawHeaders.map(h => {
            const lower = h.toLowerCase();
            if (lower === 'id') return '__id';
            if (lower === 'label') return '__label';
            const match = (setObj.fields || []).find(f =>
                f.key.toLowerCase() === lower || f.label.toLowerCase() === lower || normSetId(h) === f.key
            );
            return match ? match.key : null;
        });

        const existing = replace ? [] : [...(setObj.roster || [])];
        const byId = new Map(existing.map((r, idx) => [r.id, idx]));
        let imported = 0;

        for (const dataRow of rows.slice(1)) {
            let idVal = '';
            let labelVal = '';
            const values = {};
            for (let c = 0; c < fieldByCol.length; c++) {
                const target = fieldByCol[c];
                if (!target) continue;
                const cellVal = dataRow[c] ?? '';
                if (target === '__id') idVal = cellVal.trim();
                else if (target === '__label') labelVal = cellVal.trim();
                else values[target] = cellVal;
            }
            const firstKey = setObj.fields?.[0]?.key || 'name';
            const derivedLabel = labelVal || values[firstKey] || idVal;
            if (!derivedLabel && !Object.values(values).some(Boolean)) continue;
            const entryId = normSetId(idVal || derivedLabel) || normSetId(`entry_${existing.length + 1}`);
            const entry = { id: entryId, label: derivedLabel || entryId, values };
            if (byId.has(entryId)) {
                const idx = byId.get(entryId);
                existing[idx] = { ...existing[idx], ...entry, values: { ...existing[idx].values, ...values } };
            } else {
                byId.set(entryId, existing.length);
                existing.push(entry);
            }
            imported++;
        }

        const updated = upsertSet(cleanId, { roster: existing });
        return { ok: true, imported, total: updated.roster.length, set: updated };
    }

    const upsertSet = (...a) => atomic(() => upsertSetRaw(...a));
    const assignSetSlot = (...a) => atomic(() => assignSetSlotRaw(...a));
    const clearSetSlot = (...a) => atomic(() => clearSetSlotRaw(...a));
    const cycleSetSlot = (...a) => atomic(() => cycleSetSlotRaw(...a));
    const advanceSetQueue = (...a) => atomic(() => advanceSetQueueRaw(...a));
    const swapSetSlots = (...a) => atomic(() => swapSetSlotsRaw(...a));
    const toggleEntryGroup = (...a) => atomic(() => toggleEntryGroupRaw(...a));
    const updateSetGroup = (...a) => atomic(() => updateSetGroupRaw(...a));
    const setChecklist = (setId, opts) => atomic(() => mutateChecklistRaw(setId, 'set', opts));
    const toggleChecklist = (setId, opts) => atomic(() => mutateChecklistRaw(setId, 'toggle', opts));
    const stepChecklist = (setId, opts) => atomic(() => mutateChecklistRaw(setId, 'step', opts));
    const resetChecklist = (setId, opts) => atomic(() => mutateChecklistRaw(setId, 'reset', opts));
    const importBundle = (...a) => atomic(() => importBundleRaw(...a));
    const manageGroup = (name, members = [], { createOnly = false, originalName = null } = {}) => atomic(() => {
        if (!Array.isArray(members)) throw new Error('Group members must be an array of variable names');
        const group = variableGroups.normalize(name);
        const previous = originalName === null ? group : variableGroups.normalize(originalName);
        if (originalName !== null && !listGroups().includes(previous)) throw new Error('Variable Group not found');
        if (originalName !== null && createOnly) throw new Error('Cannot create and rename a group together');
        if (createOnly && listGroups().includes(group)) throw new Error('A group with this name already exists');
        const selected = new Set(members.map(normName));
        for (const member of selected) {
            if (!vars[member] || vars[member].setId || vars[member].hidden) throw new Error(`Ordinary variable "${member}" not found`);
        }
        if (originalName !== null) {
            if (previous !== group && listGroups().includes(group)) throw new Error('A group with this name already exists');
            if (!variableGroups.list().includes(previous)) variableGroups.add(previous);
            variableGroups.rename(previous, group);
        } else variableGroups.add(group);
        for (const [key, record] of Object.entries(vars)) {
            if (selected.has(key)) normalizeVarRecord(key, { group }, { persist: false });
            else if (record.group === previous) normalizeVarRecord(key, { group: '' }, { persist: false });
        }
        save();
        return { group, variables: list(), groups: listGroups() };
    });

    // Server-owned rotation: one shared clock per set. Materialized vars keep live values; overlays that
    // follow the set apply rotation.entryId themselves, so a single set can rotate on one overlay and not another.
    const rotationTimers = new Map();

    function scheduleRotation(setId) {
        clearInterval(rotationTimers.get(setId));
        rotationTimers.delete(setId);
        const setObj = sets[setId];
        if (!moduleEnabled || !setObj?.rotation?.enabled) return;
        const timer = setInterval(() => {
            try { stepRotation(setId, 1, { persist: false }); } catch { /* set removed */ }
        }, setObj.rotation.intervalSeconds * 1000);
        timer.unref?.();
        rotationTimers.set(setId, timer);
    }

    const isModuleEnabled = () => moduleEnabled;
    const isVariableSettingsEnabled = () => variableSettingsEnabled;

    function setVariableSettingsEnabled(enabled) {
        const next = enabled !== false;
        if (variableSettingsEnabled === next) return variableSettingsEnabled;
        variableSettingsEnabled = next;
        notifyChange();
        return variableSettingsEnabled;
    }

    function setModuleEnabled(enabled) {
        const next = Boolean(enabled);
        if (moduleEnabled === next) return moduleEnabled;
        moduleEnabled = next;
        if (!moduleEnabled) dispose();
        else for (const id of Object.keys(sets)) scheduleRotation(id);
        notifyChange();
        return moduleEnabled;
    }

    function stepRotation(setId, direction = 1, { persist = true } = {}) {
        const setObj = sets[normSetId(setId)];
        if (!setObj) throw new Error('Set not found');
        const rot = setObj.rotation || (setObj.rotation = normalizeRotation());
        const pool = (setObj.roster || []).filter(r => r.enabled !== false);
        let next = '';
        if (pool.length) {
            const pos = pool.findIndex(r => r.id === rot.entryId);
            if (rot.mode === 'random' && direction > 0 && pool.length > 1) {
                const others = pool.filter((_, i) => i !== pos);
                next = others[Math.floor(Math.random() * others.length)].id;
            } else {
                next = pool[pos === -1 ? (direction > 0 ? 0 : pool.length - 1) : (pos + direction + pool.length) % pool.length].id;
            }
        }
        rot.entryId = next;
        rot.changedAt = Date.now();
        if (persist) {
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(`${setsFile}.tmp`, JSON.stringify(sets, null, 2));
            fs.renameSync(`${setsFile}.tmp`, setsFile);
        }
        notifyChange({ rotated: setObj.id });
        return setObj;
    }

    function configureRotation(setId, patch = {}) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if ((setObj.slotsCount || 0) >= 2 && (patch.enabled === true || patch.enabled === 'true' || patch.enabled === 1 || patch.enabled === '1')) {
            throw new Error('Timed rotation is only available for 0-slot presets and 1-slot sets');
        }
        const validIds = new Set(setObj.roster.map(r => r.id));
        const nextRot = normalizeRotation({ ...(setObj.rotation || {}), ...patch }, validIds);
        setObj.rotation = (setObj.slotsCount || 0) >= 2 ? { ...nextRot, enabled: false } : nextRot;
        if (setObj.rotation.enabled && !setObj.rotation.entryId) return startRotation(cleanId);
        saveSets({ saveVarsAlso: false });
        scheduleRotation(cleanId);
        return setObj;
    }

    function startRotation(setId) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if ((setObj.slotsCount || 0) >= 2) {
            throw new Error('Timed rotation is only available for 0-slot presets and 1-slot sets');
        }
        setObj.rotation = { ...normalizeRotation(setObj.rotation), enabled: true, changedAt: Date.now() };
        scheduleRotation(cleanId);
        if (!setObj.rotation.entryId) return stepRotation(cleanId, 1);
        saveSets({ saveVarsAlso: false });
        return setObj;
    }

    function stopRotation(setId) {
        return configureRotation(setId, { enabled: false });
    }

    function toggleRotation(setId) {
        const setObj = sets[normSetId(setId)];
        if (!setObj) throw new Error('Set not found');
        return setObj.rotation?.enabled ? stopRotation(setId) : startRotation(setId);
    }

    function dispose() {
        for (const timer of rotationTimers.values()) clearInterval(timer);
        rotationTimers.clear();
    }

    for (const id of Object.keys(sets)) {
        if (sets[id]) sets[id].rotation = normalizeRotation(sets[id].rotation, new Set((sets[id].roster || []).map(r => r.id)));
        scheduleRotation(id);
    }

    async function handleApi(req, res, pathname, readBody) {
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        try {
            const urlObj = new URL(req.url, 'http://localhost');
            const query = Object.fromEntries(urlObj.searchParams);
            const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
            const rawBody = (req.method === 'GET' || req.method === 'DELETE') ? '' : await readBody(req);
            const body = contentType.includes('text/csv') ? {} : JSON.parse(rawBody || '{}');

            if (pathname === '/api/variables' && req.method === 'GET') {
                return json(200, { variables: list(), groups: listGroups(), sets: listSets(), values: values(), variableSetsEnabled: moduleEnabled, variableSettingsEnabled }), true;
            }
            if (pathname === '/api/variables/values' && req.method === 'GET') {
                return json(200, values()), true;
            }
            if (pathname === '/api/variables/groups/manage' && req.method === 'POST') {
                return json(200, manageGroup(body.name, body.variables, { createOnly: body.createOnly === true, originalName: body.originalName ?? null })), true;
            }
            if (pathname === '/api/variables/import' && req.method === 'POST') {
                return json(200, importBundle(body)), true;
            }
            if (pathname === '/api/variables/sets' && req.method === 'GET') {
                return json(200, { sets: listSets() }), true;
            }

            const entryMatch = pathname.match(/^\/api\/variables\/sets\/([^/]+)\/(dependencies|entry\/(set|step|add|remove|update))$/);
            if (entryMatch) {
                const setId = decodeURIComponent(entryMatch[1]);
                if (entryMatch[2] === 'dependencies') {
                    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' }), true;
                    return json(200, { dependencies: dependencies(setId, query.entry, query.field) }), true;
                }
                if (!['GET', 'POST', 'PATCH', ...(entryMatch[3] === 'remove' ? ['DELETE'] : [])].includes(req.method)) {
                    return json(405, { error: 'Method not allowed' }), true;
                }
                const options = { ...query, ...body };
                if (Object.hasOwn(query, 'expected') && !Object.hasOwn(body, 'expected')) {
                    try { options.expected = JSON.parse(query.expected); } catch { throw new Error('expected must be JSON encoded'); }
                }
                const fieldType = sets[normSetId(setId)]?.fields?.find(field => field.key === options.field)?.type;
                if (query.value && ['ref_list', 'checklist'].includes(fieldType) && /^[\[{]/.test(query.value) && !Object.hasOwn(body, 'value')) {
                    try { options.value = JSON.parse(query.value); } catch { throw new Error('value must be valid JSON'); }
                }
                if (query.patch && !Object.hasOwn(body, 'patch')) options.patch = JSON.parse(query.patch);
                return json(200, mutateEntry(setId, entryMatch[3], options)), true;
            }

            // Variable Sets & Slots: /api/variables/sets/:setId[/assign|clear|next|prev|swap|advance|rewind|export|import|group|entry/toggle|entry/group-toggle|checklist/*|queue/*]
            const setMatch = pathname.match(/^\/api\/variables\/sets\/([^/]+)(?:\/(assign|clear|next|prev|swap|advance|rewind|export|import|group|entry\/toggle|entry\/group-toggle|checklist\/set|checklist\/toggle|checklist\/step|checklist\/reset|queue\/add|queue\/remove|queue\/clear|rotation|rotation\/start|rotation\/stop|rotation\/toggle|rotation\/next|rotation\/prev))?$/);
            if (setMatch) {
                const setId = decodeURIComponent(setMatch[1]);
                const action = setMatch[2];
                if (!action) {
                    if (req.method === 'GET') {
                        const s = sets[normSetId(setId)];
                        return json(s ? 200 : 404, s ? s : { error: 'Set not found' }), true;
                    }
                    if (req.method === 'PUT' || req.method === 'POST') {
                        return json(200, upsertSet(setId, body)), true;
                    }
                    if (req.method === 'DELETE') {
                        return json(200, { sets: deleteSet(setId), variables: list() }), true;
                    }
                } else if (action === 'export' && req.method === 'GET') {
                    const csv = exportSetCsv(setId);
                    const safeName = normSetId(setId) || 'set';
                    res.writeHead(200, {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': `attachment; filename="${safeName}-roster.csv"`
                    });
                    res.end(`\uFEFF${csv}`);
                    return true;
                } else if (action === 'import' && req.method === 'POST') {
                    const csvText = contentType.includes('text/csv') ? rawBody : String(body.csv || '');
                    const replace = query.replace === '1' || query.replace === 'true' || body.replace === true;
                    return json(200, importSetCsv(setId, csvText, { replace })), true;
                } else if (action === 'group') {
                    if (req.method === 'GET' && !Object.keys(query).length) {
                        const s = sets[normSetId(setId)];
                        if (!s) return json(404, { error: 'Set not found' }), true;
                        const groupVar = vars[`${s.id}_group`]?.value ?? '';
                        return json(200, { id: s.id, group: s.group || normalizeGroup(), value: groupVar }), true;
                    }
                    if (['GET', 'POST', 'PUT'].includes(req.method)) return json(200, updateSetGroup(setId, { ...query, ...body })), true;
                } else if (action === 'rotation') {
                    if (req.method === 'GET' && !Object.keys(query).length) {
                        const s = sets[normSetId(setId)];
                        return json(s ? 200 : 404, s ? { id: s.id, rotation: s.rotation } : { error: 'Set not found' }), true;
                    }
                    if (['GET', 'POST', 'PUT'].includes(req.method)) return json(200, configureRotation(setId, { ...query, ...body })), true;
                } else if (action.startsWith('rotation/') && (req.method === 'POST' || req.method === 'GET')) {
                    if (action === 'rotation/start') return json(200, startRotation(setId)), true;
                    if (action === 'rotation/stop') return json(200, stopRotation(setId)), true;
                    if (action === 'rotation/toggle') return json(200, toggleRotation(setId)), true;
                    if (action === 'rotation/next') return json(200, stepRotation(setId, 1)), true;
                    if (action === 'rotation/prev') return json(200, stepRotation(setId, -1)), true;
                } else if (req.method === 'POST' || req.method === 'GET') {
                    const slot = query.slot ?? body.slot ?? 1;
                    if (action === 'assign') return json(200, assignSetSlot(setId, slot, query.entry ?? body.entry ?? '')), true;
                    if (action === 'clear') return json(200, clearSetSlot(setId, slot)), true;
                    if (action === 'next') return json(200, cycleSetSlot(setId, slot, 1)), true;
                    if (action === 'prev') return json(200, cycleSetSlot(setId, slot, -1)), true;
                    if (action === 'swap') return json(200, swapSetSlots(setId, query.from ?? body.from ?? 1, query.to ?? body.to ?? 2)), true;
                    if (action === 'advance') return json(200, advanceSetQueue(setId, 1, query.mode ?? body.mode ?? 'shift')), true;
                    if (action === 'rewind') return json(200, advanceSetQueue(setId, -1, query.mode ?? body.mode ?? 'shift')), true;
                    if (action === 'entry/toggle') return json(200, toggleSetEntry(setId, query.entry ?? body.entry ?? '', query.enabled ?? body.enabled)), true;
                    if (action === 'entry/group-toggle') return json(200, toggleEntryGroup(setId, query.entry ?? body.entry ?? '', query.inGroup ?? body.inGroup)), true;
                    if (action === 'entry/step') return json(200, mutateEntry(setId, 'step', { entry: query.entry ?? body.entry, field: query.field ?? body.field, delta: query.delta ?? body.delta })), true;
                    if (action === 'entry/set') return json(200, mutateEntry(setId, 'set', { entry: query.entry ?? body.entry, field: query.field ?? body.field, value: query.value ?? body.value })), true;
                    if (action === 'column/reset') return json(200, resetSetColumn(setId, query.field ?? body.field, query.value ?? body.value)), true;
                    if (action.startsWith('checklist/')) {
                        const checklistOpts = {
                            entry: query.entry ?? body.entry,
                            slot: query.slot ?? body.slot,
                            field: query.field ?? body.field,
                            target: query.target ?? body.target,
                            value: query.value ?? body.value,
                            delta: query.delta ?? body.delta
                        };
                        if (action === 'checklist/set') return json(200, setChecklist(setId, checklistOpts)), true;
                        if (action === 'checklist/toggle') return json(200, toggleChecklist(setId, checklistOpts)), true;
                        if (action === 'checklist/step') return json(200, stepChecklist(setId, checklistOpts)), true;
                        if (action === 'checklist/reset') return json(200, resetChecklist(setId, { ...checklistOpts, all: query.all ?? body.all })), true;
                    }
                    if (action === 'queue/add') return json(200, enqueueSetSlot(setId, slot, query.entry ?? body.entry ?? '')), true;
                    if (action === 'queue/remove') return json(200, removeSetSlotQueue(setId, slot, query.index ?? body.index ?? query.entry ?? body.entry ?? 0)), true;
                    if (action === 'queue/clear') return json(200, clearSetSlotQueue(setId, slot)), true;
                }
                return json(405, { error: 'Method not allowed' }), true;
            }

            const m = pathname.match(/^\/api\/variables\/([^/]+)(?:\/(increment|decrement|reset|set|roll|toggle|next|prev|clear))?$/);
            if (!m) return json(404, { error: 'Unknown variables endpoint' }), true;
            const name = decodeURIComponent(m[1]);
            if (m[2] === 'roll' && (req.method === 'POST' || req.method === 'GET')) return json(200, roll(name)), true;
            if (m[2] === 'toggle' && (req.method === 'POST' || req.method === 'GET')) return json(200, toggleVar(name, query.value ?? body.value)), true;
            if (m[2] === 'next' && (req.method === 'POST' || req.method === 'GET')) return json(200, cycleSelect(name, 1)), true;
            if (m[2] === 'prev' && (req.method === 'POST' || req.method === 'GET')) return json(200, cycleSelect(name, -1)), true;
            if (m[2] === 'clear' && (req.method === 'POST' || req.method === 'GET')) return json(200, clearTags(name)), true;
            if (m[2] && (req.method === 'POST' || req.method === 'GET')) return json(200, change(name, m[2], m[2] === 'set' ? query.value ?? body.value : query.amount ?? body.amount)), true;
            if (req.method === 'PUT' || req.method === 'POST') return json(200, set(name, body)), true;
            if (req.method === 'DELETE') { delete vars[normName(name)]; save(); return json(200, { variables: list(), sets: listSets() }), true; }
            if (req.method === 'GET') {
                const v = vars[normName(name)];
                if (query.raw === '1' || query.plain === '1' || query.format === 'text') {
                    res.writeHead(v ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(v ? String(v.value ?? '') : '');
                    return true;
                }
                return json(v ? 200 : 404, v ? { name: normName(name), ...v, key: variableKey({ name: normName(name), ...v }) } : { error: 'Not found' }), true;
            }
        } catch (err) {
            return json(err.status || 400, { error: err.message, ...(err.code ? { code: err.code } : {}),
                ...(err.dependencies ? { dependencies: err.dependencies } : {}),
                ...(Object.hasOwn(err, 'current') ? { current: err.current } : {}) }), true;
        }
        return json(405, { error: 'Method not allowed' }), true;
    }

    return {
        handleApi,
        values,
        list,
        listSets,
        listGroups,
        manageGroup,
        set,
        change,
        toggleVar,
        cycleSelect,
        clearTags,
        roll,
        upsertSet,
        deleteSet,
        dependencies,
        mutateEntry,
        resetSetColumn,
        assignSetSlot,
        clearSetSlot,
        cycleSetSlot,
        toggleSetEntry,
        toggleEntryGroup,
        updateSetGroup,
        setChecklist,
        toggleChecklist,
        stepChecklist,
        resetChecklist,
        swapSetSlots,
        advanceSetQueue,
        enqueueSetSlot,
        removeSetSlotQueue,
        clearSetSlotQueue,
        importBundle,
        exportSetCsv,
        importSetCsv,
        configureRotation,
        startRotation,
        stopRotation,
        toggleRotation,
        stepRotation,
        isModuleEnabled,
        setModuleEnabled,
        isVariableSettingsEnabled,
        setVariableSettingsEnabled,
        dispose,
        reload: () => { load(); for (const id of new Set([...rotationTimers.keys(), ...Object.keys(sets)])) scheduleRotation(id); }
    };
};
