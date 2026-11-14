// Named variables (text, counter, list, image, toggle, color, template) and multi-slot Variable Sets,
// shared by overlays, chat bot, API and Bitfocus Companion.
const fs = require('fs');
const path = require('path');

const NAME_RE = /^[a-z0-9_]{1,40}$/;
const VALID_TYPES = ['counter', 'number', 'text', 'list', 'image', 'toggle', 'color', 'template', 'font'];
const normalizeNumber = require('./variable-numbers');
const VALID_SET_FIELD_TYPES = ['text', 'image', 'color', 'toggle'];
const ROTATION_TRANSITIONS = ['none', 'fade', 'slide-up', 'flip'];
const MAX_USER_VARS = 500;
const MAX_SET_VARS = 25000;
const TEMPLATE_RE = /\{\{\s*var\.([a-z0-9_]+)\s*(?:\|([^{}]*?))?\s*\}\}/gi;

module.exports = function createVariables({ dataDir, onChange = null }) {
    const file = path.join(dataDir, 'variables.json');
    const setsFile = path.join(dataDir, 'variable-sets.json');
    const variableGroups = require('./variable-groups')(dataDir);
    let vars = {};
    let sets = {};
    let moduleEnabled = true;

    function load() {
        variableGroups.reload();
        try { vars = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { vars = {}; }
        try { sets = JSON.parse(fs.readFileSync(setsFile, 'utf8')) || {}; } catch { sets = {}; }
    }
    load();

    function notifyChange(extra = {}) {
        if (typeof onChange === 'function') {
            try { onChange({ variables: list(), groups: listGroups(), sets: listSets(), variableSetsEnabled: moduleEnabled, ...extra }); } catch { /* ignore listener errors */ }
        }
    }

    function save() {
        variableGroups.save();
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(vars, null, 2));
        fs.renameSync(`${file}.tmp`, file);
        notifyChange();
    }

    function saveSets({ saveVarsAlso = false } = {}) {
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
    const list = () => Object.entries(vars).map(([name, v]) => ({ name, ...v }));
    const listSets = () => Object.entries(sets).map(([id, s]) => ({ id, ...s }));
    const listGroups = () => [...new Set([...variableGroups.list(), ...list().filter(v => !v.setId && !v.hidden && v.group).map(v => v.group)])];

    // Flat map for placeholders: {{var.name}}. Templates may reference other templates in any order (depth 3, cycles resolve empty).
    function values() {
        const out = Object.fromEntries(Object.entries(vars).map(([name, v]) => [name, v.value]));
        const resolving = new Set();
        const resolved = new Map();
        const resolve = (name, depth) => {
            const v = vars[name];
            if (v?.type !== 'template') return out[name];
            if (resolved.has(name)) return resolved.get(name);
            if (depth > 3 || resolving.has(name)) return '';
            resolving.add(name);
            const text = String(v.value ?? '').replace(TEMPLATE_RE, (_m, ref, fallback) => {
                const val = resolve(normName(ref), depth + 1);
                return (val !== undefined && val !== null && String(val) !== '') ? String(val) : (fallback !== undefined ? fallback.trim() : '');
            });
            resolving.delete(name);
            resolved.set(name, text);
            return text;
        };
        for (const name of Object.keys(vars)) if (vars[name]?.type === 'template') out[name] = resolve(name, 0);
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
            vars[name] = { type, items, mode, value, ...(setId ? { setId } : {}), ...(group ? { group } : {}), ...(isHidden ? { hidden: true } : {}), updatedAt: Date.now() };
            if (persist) save();
            return { name, ...vars[name] };
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
            value = String(value).slice(0, isHidden ? 16000 : 500);
        }
        vars[name] = {
            type,
            ...(number || { value }),
            ...(type === 'counter' ? { initial: Number(patch.initial ?? cur?.initial ?? 0) || 0 } : {}),
            ...(setId ? { setId } : {}),
            ...(group ? { group } : {}),
            ...(isHidden ? { hidden: true } : {}),
            updatedAt: Date.now()
        };
        if (persist) save();
        return { name, ...vars[name] };
    }

    function set(name, patch) {
        return normalizeVarRecord(name, patch, { persist: true });
    }

    function change(name, action, amount) {
        name = normName(name);
        const cur = vars[name] || { type: 'counter', value: 0, initial: 0 };
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
        if (cur.type !== 'toggle') throw new Error('Not a toggle variable');
        const next = explicitValue !== undefined ? normalizeBool(explicitValue) : (normalizeBool(cur.value) === 'true' ? 'false' : 'true');
        return set(name, { type: 'toggle', value: next });
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

    function normalizeSetPayload(rawId, patch, cur) {
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
            fields.push({
                key,
                label: String(f?.label || key).trim().slice(0, 40) || key,
                type: VALID_SET_FIELD_TYPES.includes(f?.type) ? f.type : 'text'
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
                else valuesMap[f.key] = String(rawVal).slice(0, 500);
            }
            const label = String(r.label || valuesMap[fields[0].key] || entryId).trim().slice(0, 60) || entryId;
            const enabled = r.enabled !== false && r.enabled !== 'false' && r.enabled !== 0 && r.enabled !== '0';
            const inGroup = r.inGroup !== false && r.inGroup !== 'false' && r.inGroup !== 0 && r.inGroup !== '0';
            roster.push({ id: entryId, label, enabled, inGroup, values: valuesMap });
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
            const vals = groupEntries.map(e => String(e.values?.[f.key] ?? '').trim()).filter(Boolean);
            writeField(`${setObj.id}_group_${f.key}`, 'text', joinWithSeparators(vals, sep, lastSep));
        }

        if (setObj.slotsCount === 0) {
            const entry = byId.get(setObj.activeEntry) || null;
            writeField(`${setObj.id}_active`, 'toggle', entry ? 'true' : 'false');
            for (const f of setObj.fields) {
                const rawVal = entry ? (entry.values?.[f.key] ?? '') : '';
                const val = rawVal || (f.type === 'toggle' ? 'false' : f.type === 'color' ? '#3b82f6' : '');
                writeField(`${setObj.id}_${f.key}`, f.type, val);
            }
            return;
        }

        for (const f of setObj.fields) {
            const slotVals = (setObj.slots || [])
                .map(sId => byId.get(sId))
                .filter(Boolean)
                .map(e => String(e.values?.[f.key] ?? '').trim())
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
                const rawVal = entry ? (entry.values?.[f.key] ?? '') : '';
                const val = rawVal || (f.type === 'toggle' ? 'false' : f.type === 'color' ? '#3b82f6' : '');
                writeField(`${setObj.id}_${slotNum}_${f.key}`, f.type, val);
                if (i === 0) writeField(`${setObj.id}_${f.key}`, f.type, val);
                if (hasNamedAlias) writeField(`${setObj.id}_${slotSlug}_${f.key}`, f.type, val);
            }
        }
    }

    function upsertSetRaw(setId, patch) {
        const cleanId = normSetId(setId);
        const cur = sets[cleanId];
        if (!cur && Object.keys(sets).length >= 30) throw new Error('Too many variable sets');
        const nextSet = normalizeSetPayload(cleanId, patch, cur);
        sets[nextSet.id] = nextSet;
        materializeSetVars(nextSet);
        saveSets({ saveVarsAlso: true });
        scheduleRotation(nextSet.id);
        return nextSet;
    }

    function deleteSet(setId) {
        const cleanId = normSetId(setId);
        if (!sets[cleanId]) throw new Error('Set not found');
        delete sets[cleanId];
        scheduleRotation(cleanId);
        for (const [k, v] of Object.entries(vars)) {
            if (v?.setId === cleanId) delete vars[k];
        }
        saveSets({ saveVarsAlso: true });
        return listSets();
    }

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



    function importBundleRaw(payload = {}) {
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
            const nextSet = normalizeSetPayload(s.id, s, sets[normSetId(s.id)]);
            sets[nextSet.id] = nextSet;
            materializeSetVars(nextSet);
            setCount++;
        }
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
                ...(setObj.fields || []).map(f => entry.values?.[f.key] ?? '')
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
            const entryId = normSetId(idVal || derivedLabel || `entry_${existing.length + 1}`);
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
                return json(200, { variables: list(), groups: listGroups(), sets: listSets(), variableSetsEnabled: moduleEnabled }), true;
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

            // Variable Sets & Slots: /api/variables/sets/:setId[/assign|clear|next|prev|swap|advance|rewind|export|import|group|entry/toggle|entry/group-toggle|queue/*]
            const setMatch = pathname.match(/^\/api\/variables\/sets\/([^/]+)(?:\/(assign|clear|next|prev|swap|advance|rewind|export|import|group|entry\/toggle|entry\/group-toggle|queue\/add|queue\/remove|queue\/clear|rotation|rotation\/start|rotation\/stop|rotation\/toggle|rotation\/next|rotation\/prev))?$/);
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
                    if (action === 'queue/add') return json(200, enqueueSetSlot(setId, slot, query.entry ?? body.entry ?? '')), true;
                    if (action === 'queue/remove') return json(200, removeSetSlotQueue(setId, slot, query.index ?? body.index ?? query.entry ?? body.entry ?? 0)), true;
                    if (action === 'queue/clear') return json(200, clearSetSlotQueue(setId, slot)), true;
                }
                return json(405, { error: 'Method not allowed' }), true;
            }

            const m = pathname.match(/^\/api\/variables\/([^/]+)(?:\/(increment|decrement|reset|set|roll|toggle))?$/);
            if (!m) return json(404, { error: 'Unknown variables endpoint' }), true;
            const name = decodeURIComponent(m[1]);
            if (m[2] === 'roll' && (req.method === 'POST' || req.method === 'GET')) return json(200, roll(name)), true;
            if (m[2] === 'toggle' && (req.method === 'POST' || req.method === 'GET')) return json(200, toggleVar(name, query.value ?? body.value)), true;
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
                return json(v ? 200 : 404, v ? { name: normName(name), ...v } : { error: 'Not found' }), true;
            }
        } catch (err) {
            return json(400, { error: err.message }), true;
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
        roll,
        upsertSet,
        deleteSet,
        assignSetSlot,
        clearSetSlot,
        cycleSetSlot,
        toggleSetEntry,
        toggleEntryGroup,
        updateSetGroup,
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
        dispose,
        reload: () => { load(); for (const id of new Set([...rotationTimers.keys(), ...Object.keys(sets)])) scheduleRotation(id); }
    };
};
