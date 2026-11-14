// Named variables (text, counter, list, image, toggle, color, template) and multi-slot Variable Sets,
// shared by overlays, chat bot, API and Bitfocus Companion.
const fs = require('fs');
const path = require('path');

const NAME_RE = /^[a-z0-9_]{1,40}$/;
const VALID_TYPES = ['counter', 'text', 'list', 'image', 'toggle', 'color', 'template'];
const VALID_SET_FIELD_TYPES = ['text', 'image', 'color', 'toggle'];

module.exports = function createVariables({ dataDir, onChange = null }) {
    const file = path.join(dataDir, 'variables.json');
    const setsFile = path.join(dataDir, 'variable-sets.json');
    let vars = {};
    let sets = {};

    function load() {
        try { vars = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { vars = {}; }
        try { sets = JSON.parse(fs.readFileSync(setsFile, 'utf8')) || {}; } catch { sets = {}; }
    }
    load();

    function notifyChange() {
        if (typeof onChange === 'function') {
            try { onChange({ variables: list(), sets: listSets() }); } catch { /* ignore listener errors */ }
        }
    }

    function save() {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(vars, null, 2));
        fs.renameSync(`${file}.tmp`, file);
        notifyChange();
    }

    function saveSets({ saveVarsAlso = false } = {}) {
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

    // Flat map for placeholders: {{var.name}} (with 1-pass template resolution)
    function values() {
        const out = Object.fromEntries(Object.entries(vars).map(([name, v]) => [name, v.value]));
        for (const [name, v] of Object.entries(vars)) {
            if (v?.type === 'template') {
                out[name] = String(v.value ?? '').replace(/\{\{\s*var\.([a-z0-9_]+)\s*(?:\|([^{}]*?))?\s*\}\}/gi, (_m, ref, fallback) => {
                    const resolved = out[normName(ref)];
                    return (resolved !== undefined && resolved !== null && String(resolved) !== '') ? String(resolved) : (fallback ?? '');
                });
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
        if (type === 'list') {
            const raw = patch.items ?? cur?.items ?? [];
            const items = (Array.isArray(raw) ? raw : String(raw).split(/\r?\n/)).map(i => String(i).trim().slice(0, 300)).filter(Boolean).slice(0, 200);
            const mode = patch.mode === 'sequential' ? 'sequential' : patch.mode === 'random' ? 'random' : cur?.mode || 'random';
            let value = patch.value ?? cur?.value ?? '';
            if (!items.includes(value)) value = items[0] || '';
            vars[name] = { type, items, mode, value, ...(setId ? { setId } : {}), updatedAt: Date.now() };
            if (persist) save();
            return { name, ...vars[name] };
        }
        if (!cur && Object.keys(vars).length >= 500) throw new Error('Too many variables');
        let value = patch.value ?? cur?.value ?? (type === 'counter' ? 0 : type === 'toggle' ? 'false' : type === 'color' ? '#3b82f6' : '');
        if (type === 'counter') {
            value = Number.isFinite(Number(value)) ? Number(value) : 0;
        } else if (type === 'toggle') {
            value = normalizeBool(value);
        } else if (type === 'color') {
            value = normalizeColor(value);
        } else if (type === 'image') {
            value = String(value).trim().slice(0, 1000);
        } else {
            value = String(value).slice(0, 500);
        }
        vars[name] = {
            type,
            value,
            ...(type === 'counter' ? { initial: Number(patch.initial ?? cur?.initial ?? 0) || 0 } : {}),
            ...(setId ? { setId } : {}),
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
        if (cur.type !== 'counter') throw new Error('Not a counter');
        const by = Number.isFinite(Number(amount)) && amount !== '' && amount !== undefined ? Number(amount) : 1;
        const value = action === 'reset' ? cur.initial || 0 : cur.value + (action === 'decrement' ? -by : by);
        return set(name, { type: 'counter', value });
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
        for (const f of rawFields.slice(0, 12)) {
            const key = normSetId(f?.key || f?.label || '').slice(0, 20);
            if (!key || seenKeys.has(key) || key === 'active') continue;
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
            while (seenEntries.has(entryId)) entryId = `${entryId}_${idx + 1}`.slice(0, 24);
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
            roster.push({ id: entryId, label, values: valuesMap });
        }

        const prevSlots = Array.isArray(patch?.slots) ? patch.slots : (cur?.slots || []);
        const validRosterIds = new Set(roster.map(r => r.id));
        const slots = Array.from({ length: slotsCount }, (_, i) => {
            const candidate = normSetId(prevSlots[i] || '');
            return validRosterIds.has(candidate) ? candidate : '';
        });
        const prevSlotNames = Array.isArray(patch?.slotNames) ? patch.slotNames : (cur?.slotNames || []);
        const slotNames = Array.from({ length: slotsCount }, (_, i) => String(prevSlotNames[i] ?? '').trim().slice(0, 40));
        const candidateActive = normSetId(patch?.activeEntry ?? cur?.activeEntry ?? '');
        const activeEntry = validRosterIds.has(candidateActive) ? candidateActive : '';

        return { id, name, slotsCount, fields, roster, slots, slotNames, activeEntry, updatedAt: Date.now() };
    }

    function materializeSetVars(setObj) {
        // Clear any previously materialized vars belonging to this set
        for (const [k, v] of Object.entries(vars)) {
            if (v?.setId === setObj.id) delete vars[k];
        }
        const byId = new Map(setObj.roster.map(r => [r.id, r]));
        const writeField = (varName, type, value) => {
            normalizeVarRecord(varName, { type, value, setId: setObj.id }, { persist: false });
        };

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

    function upsertSet(setId, patch) {
        const cleanId = normSetId(setId);
        const cur = sets[cleanId];
        if (!cur && Object.keys(sets).length >= 30) throw new Error('Too many variable sets');
        const nextSet = normalizeSetPayload(cleanId, patch, cur);
        sets[nextSet.id] = nextSet;
        materializeSetVars(nextSet);
        saveSets({ saveVarsAlso: true });
        return nextSet;
    }

    function deleteSet(setId) {
        const cleanId = normSetId(setId);
        if (!sets[cleanId]) throw new Error('Set not found');
        delete sets[cleanId];
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

    function assignSetSlot(setId, slotParam = 1, entryParam = '') {
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

    function clearSetSlot(setId, slotParam = 1) {
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

    function cycleSetSlot(setId, slotParam = 1, direction = 1) {
        const cleanId = normSetId(setId);
        const setObj = sets[cleanId];
        if (!setObj) throw new Error('Set not found');
        if (!setObj.roster.length) return setObj;
        const curEntryId = setObj.slotsCount === 0
            ? setObj.activeEntry
            : setObj.slots[parseSlotIndex(setObj, slotParam)];
        const curPos = setObj.roster.findIndex(r => r.id === curEntryId);
        const nextPos = curPos === -1
            ? (direction > 0 ? 0 : setObj.roster.length - 1)
            : (curPos + direction + setObj.roster.length) % setObj.roster.length;
        if (setObj.slotsCount === 0) {
            setObj.activeEntry = setObj.roster[nextPos].id;
        } else {
            const idx = parseSlotIndex(setObj, slotParam);
            setObj.slots[idx] = setObj.roster[nextPos].id;
        }
        setObj.updatedAt = Date.now();
        materializeSetVars(setObj);
        saveSets({ saveVarsAlso: true });
        return setObj;
    }

    function swapSetSlots(setId, fromParam = 1, toParam = 2) {
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

    function importBundle(payload = {}) {
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
        return { ok: true, importedVars: varCount, importedSets: setCount, variables: list(), sets: listSets() };
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

    async function handleApi(req, res, pathname, readBody) {
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        try {
            const urlObj = new URL(req.url, 'http://localhost');
            const query = Object.fromEntries(urlObj.searchParams);
            const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
            const rawBody = (req.method === 'GET' || req.method === 'DELETE') ? '' : await readBody(req);
            const body = contentType.includes('text/csv') ? {} : JSON.parse(rawBody || '{}');

            if (pathname === '/api/variables' && req.method === 'GET') {
                return json(200, { variables: list(), sets: listSets() }), true;
            }
            if (pathname === '/api/variables/import' && req.method === 'POST') {
                return json(200, importBundle(body)), true;
            }
            if (pathname === '/api/variables/sets' && req.method === 'GET') {
                return json(200, { sets: listSets() }), true;
            }

            // Variable Sets & Slots: /api/variables/sets/:setId[/assign|clear|next|prev|swap|export|import]
            const setMatch = pathname.match(/^\/api\/variables\/sets\/([^/]+)(?:\/(assign|clear|next|prev|swap|export|import))?$/);
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
                } else if (req.method === 'POST' || req.method === 'GET') {
                    const slot = query.slot ?? body.slot ?? 1;
                    if (action === 'assign') return json(200, assignSetSlot(setId, slot, query.entry ?? body.entry ?? '')), true;
                    if (action === 'clear') return json(200, clearSetSlot(setId, slot)), true;
                    if (action === 'next') return json(200, cycleSetSlot(setId, slot, 1)), true;
                    if (action === 'prev') return json(200, cycleSetSlot(setId, slot, -1)), true;
                    if (action === 'swap') return json(200, swapSetSlots(setId, query.from ?? body.from ?? 1, query.to ?? body.to ?? 2)), true;
                }
                return json(405, { error: 'Method not allowed' }), true;
            }

            const m = pathname.match(/^\/api\/variables\/([^/]+)(?:\/(increment|decrement|reset|roll|toggle))?$/);
            if (!m) return json(404, { error: 'Unknown variables endpoint' }), true;
            const name = decodeURIComponent(m[1]);
            if (m[2] === 'roll' && (req.method === 'POST' || req.method === 'GET')) return json(200, roll(name)), true;
            if (m[2] === 'toggle' && (req.method === 'POST' || req.method === 'GET')) return json(200, toggleVar(name, query.value ?? body.value)), true;
            if (m[2] && (req.method === 'POST' || req.method === 'GET')) return json(200, change(name, m[2], query.amount ?? body.amount)), true;
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
        set,
        change,
        toggleVar,
        roll,
        upsertSet,
        deleteSet,
        assignSetSlot,
        clearSetSlot,
        cycleSetSlot,
        swapSetSlots,
        importBundle,
        exportSetCsv,
        importSetCsv,
        reload: load
    };
};
