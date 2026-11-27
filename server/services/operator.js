'use strict';

const fs = require('fs');
const path = require('path');
const { safeWriteFileSync } = require('../routes/helpers');

const VALID_COLUMNS = new Set([1, 2, 3, 4]);
const MAX_PROFILES = 50;
const MAX_CARDS = 64;
const MAX_OVERLAYS = 40;
const MAX_DISPLAYS = 40;
const MAX_RUNBOOKS = 50;
const MAX_RUNBOOK_ITEMS = 200;

const cloneJson = value => JSON.parse(JSON.stringify(value));

function operatorError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

function slugifyProfileId(raw, fallback = 'profile') {
    const clean = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return clean || fallback;
}

function sanitizeCard(raw, idx = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type || '').trim().slice(0, 80);
    if (!type) return null;
    const spanNum = Number(raw.span);
    const span = VALID_COLUMNS.has(spanNum) ? spanNum : 1;
    const minHeightNum = Number(raw.minHeight);
    const minHeight = Number.isFinite(minHeightNum) && minHeightNum >= 80
        ? Math.min(1200, Math.round(minHeightNum))
        : 0;
    const id = slugifyProfileId(raw.id || `${type}-${idx + 1}`, `card-${idx + 1}`);
    const title = String(raw.title || '').trim().slice(0, 80);
    const config = raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config)
        ? cloneJson(raw.config)
        : {};
    return minHeight ? { id, type, title, span, minHeight, config } : { id, type, title, span, config };
}

function normalizeProfile(raw, idx = 0) {
    if (!raw || typeof raw !== 'object') {
        throw operatorError('Profile payload must be an object', 400);
    }
    const name = String(raw.name || '').trim().slice(0, 80);
    if (!name && !raw.id) {
        throw operatorError('Profile name is required', 400);
    }
    const id = slugifyProfileId(raw.id || name, idx === 0 ? 'default' : `profile-${idx + 1}`);
    const finalName = name || id;
    const description = String(raw.description || '').trim().slice(0, 240);

    const rawBoard = raw.board && typeof raw.board === 'object' ? raw.board : {};
    const colNum = Number(rawBoard.columns);
    const columns = VALID_COLUMNS.has(colNum) ? colNum : 3;

    const seenCardIds = new Set();
    const cards = [];
    for (const [cardIdx, rawCard] of (Array.isArray(rawBoard.cards) ? rawBoard.cards : []).slice(0, MAX_CARDS).entries()) {
        const card = sanitizeCard(rawCard, cardIdx);
        if (!card) continue;
        let uniqueId = card.id;
        let suffix = 2;
        while (seenCardIds.has(uniqueId)) {
            uniqueId = `${card.id}-${suffix++}`;
        }
        seenCardIds.add(uniqueId);
        cards.push({ ...card, id: uniqueId });
    }

    const seenOverlays = new Set();
    const overlays = [];
    for (const ov of (Array.isArray(raw.overlays) ? raw.overlays : []).slice(0, MAX_OVERLAYS)) {
        const cleanOv = String(ov || '').trim().slice(0, 120);
        if (!cleanOv || seenOverlays.has(cleanOv)) continue;
        seenOverlays.add(cleanOv);
        overlays.push(cleanOv);
    }

    const seenDisplays = new Set();
    const displays = [];
    for (const disp of (Array.isArray(raw.displays) ? raw.displays : []).slice(0, MAX_DISPLAYS)) {
        const cleanDisp = String(disp || '').trim().slice(0, 120);
        if (!cleanDisp || seenDisplays.has(cleanDisp)) continue;
        seenDisplays.add(cleanDisp);
        displays.push(cleanDisp);
    }

    const rawTabs = raw.tabs && typeof raw.tabs === 'object' ? raw.tabs : {};
    const hiddenTabs = [...new Set(
        (Array.isArray(rawTabs.hidden) ? rawTabs.hidden : [])
            .map(t => String(t || '').trim().toLowerCase().slice(0, 40))
            .filter(Boolean)
    )];

    return {
        id,
        name: finalName,
        description,
        updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
        board: { columns, cards },
        overlays,
        displays,
        tabs: { hidden: hiddenTabs }
    };
}

const VALID_RUNBOOK_KINDS = new Set(['task', 'note', 'section']);
const VALID_RUNBOOK_COLS = new Set([1, 2, 3]);

function normalizeRunbookItem(raw, idx = 0) {
    if (typeof raw === 'string') {
        const text = raw.trim().slice(0, 600);
        if (!text) return null;
        return { id: `cue-${idx + 1}`, kind: 'task', text, done: false, note: '' };
    }
    if (!raw || typeof raw !== 'object') return null;
    const kind = VALID_RUNBOOK_KINDS.has(raw.kind) ? raw.kind : 'task';
    const text = String(raw.text || '').trim().slice(0, kind === 'note' ? 4000 : 240);
    if (!text) return null;
    const id = slugifyProfileId(raw.id || `cue-${idx + 1}`, `cue-${idx + 1}`);
    const note = String(raw.note || '').trim().slice(0, 400);
    return { id, kind, text, done: kind === 'task' ? Boolean(raw.done) : false, note };
}

function normalizeRunbook(raw, idx = 0) {
    if (!raw || typeof raw !== 'object') {
        throw operatorError('Runbook payload must be an object', 400);
    }
    const name = String(raw.name || '').trim().slice(0, 80);
    if (!name && !raw.id) {
        throw operatorError('Runbook name is required', 400);
    }
    const id = slugifyProfileId(raw.id || name, `runbook-${idx + 1}`);
    const finalName = name || id;
    const description = String(raw.description || '').trim().slice(0, 240);
    const colNum = Number(raw.columns);
    const columns = VALID_RUNBOOK_COLS.has(colNum) ? colNum : 1;
    const seenItemIds = new Set();
    const items = [];
    for (const [itemIdx, rawItem] of (Array.isArray(raw.items) ? raw.items : []).slice(0, MAX_RUNBOOK_ITEMS).entries()) {
        const item = normalizeRunbookItem(rawItem, itemIdx);
        if (!item) continue;
        let uniqueId = item.id;
        let suffix = 2;
        while (seenItemIds.has(uniqueId)) uniqueId = `${item.id}-${suffix++}`;
        seenItemIds.add(uniqueId);
        items.push({ ...item, id: uniqueId });
    }
    return {
        id,
        name: finalName,
        description,
        columns,
        updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
        items
    };
}

function buildDefaultRunbooks() {
    return [
        {
            id: 'pre-show',
            name: 'Pre-Show Checklist',
            description: 'Standard broadcast launch checklist',
            columns: 1,
            updatedAt: new Date().toISOString(),
            items: [
                { id: 'cue-1', kind: 'task', text: 'Check mic levels & OBS recording', done: false, note: '' },
                { id: 'cue-2', kind: 'task', text: 'Verify overlays & scene audio', done: false, note: '' },
                { id: 'cue-3', kind: 'task', text: 'Start StreamPulse session', done: false, note: '' }
            ]
        }
    ];
}

function buildDefaultState() {
    return {
        version: 1,
        activeProfileId: 'default',
        profiles: [
            {
                id: 'default',
                name: 'Main Show',
                description: 'Balanced live control board',
                updatedAt: new Date().toISOString(),
                board: {
                    columns: 3,
                    cards: [
                        { id: 'alerts-queue-1', type: 'alerts-queue', title: 'Alert Queue', span: 1, config: {} },
                        { id: 'timers-list-1', type: 'timers-list', title: 'Timers', span: 1, config: {} }
                    ]
                },
                overlays: [],
                displays: [],
                tabs: { hidden: [] }
            }
        ],
        runbooks: buildDefaultRunbooks()
    };
}

function createOperatorService({
    dataDir,
    broadcastToOverlays = () => {}
} = {}) {
    if (!dataDir) throw new Error('createOperatorService requires dataDir');
    const filePath = path.join(dataDir, 'operator-profiles.json');
    let state = buildDefaultState();

    function normalizeState(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.profiles) || !raw.profiles.length) {
            return buildDefaultState();
        }
        const seen = new Set();
        const profiles = [];
        for (const [idx, item] of raw.profiles.slice(0, MAX_PROFILES).entries()) {
            try {
                const profile = normalizeProfile(item, idx);
                let id = profile.id;
                let n = 2;
                while (seen.has(id)) id = `${profile.id}-${n++}`;
                seen.add(id);
                profiles.push({ ...profile, id });
            } catch {
                // Skip invalid entries on load so partial corruption doesn't wipe valid presets
            }
        }
        if (!profiles.length) return buildDefaultState();
        const requestedActive = String(raw.activeProfileId || '').trim();
        const activeProfileId = profiles.some(p => p.id === requestedActive) ? requestedActive : profiles[0].id;
        let runbooks;
        if (Array.isArray(raw.runbooks)) {
            const seenRb = new Set();
            runbooks = [];
            for (const [idx, item] of raw.runbooks.slice(0, MAX_RUNBOOKS).entries()) {
                try {
                    const rb = normalizeRunbook(item, idx);
                    let id = rb.id;
                    let n = 2;
                    while (seenRb.has(id)) id = `${rb.id}-${n++}`;
                    seenRb.add(id);
                    runbooks.push({ ...rb, id });
                } catch {
                    // Skip malformed runbooks
                }
            }
        } else {
            runbooks = buildDefaultRunbooks();
        }
        return {
            version: 1,
            activeProfileId,
            profiles,
            runbooks
        };
    }

    function load() {
        try {
            if (!fs.existsSync(filePath)) {
                state = buildDefaultState();
                return state;
            }
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            state = normalizeState(raw);
        } catch (err) {
            console.warn('[Operator] Could not read operator-profiles.json, using defaults:', err.message);
            state = buildDefaultState();
        }
        return state;
    }

    function save() {
        safeWriteFileSync(filePath, JSON.stringify(state, null, 2));
    }

    function getState() {
        return cloneJson(state);
    }

    function listProfiles() {
        return state.profiles.map(p => cloneJson(p));
    }

    function getProfile(id) {
        const cleanId = String(id || '').trim();
        const found = state.profiles.find(p => p.id === cleanId);
        return found ? cloneJson(found) : null;
    }

    function getActiveProfile() {
        const found = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
        return found ? cloneJson(found) : null;
    }

    function getStatusSummary() {
        const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0] || null;
        return {
            activeProfileId: active ? active.id : '',
            activeProfileName: active ? active.name : '',
            profileCount: state.profiles.length,
            cardCount: active ? active.board.cards.length : 0,
            overlayCount: active ? active.overlays.length : 0,
            displayCount: active ? (active.displays || []).length : 0,
            runbookCount: (state.runbooks || []).length
        };
    }

    function listRunbooks() {
        return (state.runbooks || []).map(rb => cloneJson(rb));
    }

    function getRunbook(id) {
        const cleanId = String(id || '').trim();
        const found = (state.runbooks || []).find(rb => rb.id === cleanId)
            || (state.runbooks || []).find(rb => rb.name.toLowerCase() === cleanId.toLowerCase());
        return found ? cloneJson(found) : null;
    }

    function upsertRunbook(payload) {
        const list = Array.isArray(state.runbooks) ? state.runbooks : (state.runbooks = []);
        const normalized = normalizeRunbook({ ...payload, updatedAt: new Date().toISOString() }, list.length);
        const existingIdx = list.findIndex(rb => rb.id === normalized.id);
        if (existingIdx === -1 && list.length >= MAX_RUNBOOKS) {
            throw operatorError(`Maximum of ${MAX_RUNBOOKS} runbooks reached`, 400);
        }
        if (existingIdx !== -1) {
            list[existingIdx] = normalized;
        } else {
            list.push(normalized);
        }
        save();
        emitUpdate('operator-runbooks-update', { runbooks: listRunbooks(), runbook: cloneJson(normalized) });
        return cloneJson(normalized);
    }

    function deleteRunbook(id) {
        const list = Array.isArray(state.runbooks) ? state.runbooks : (state.runbooks = []);
        const cleanId = String(id || '').trim();
        const idx = list.findIndex(rb => rb.id === cleanId);
        if (idx === -1) throw operatorError('Runbook not found', 404);
        const [removed] = list.splice(idx, 1);
        save();
        emitUpdate('operator-runbooks-update', { runbooks: listRunbooks(), deleted: removed.id });
        return { deleted: removed.id, runbooks: listRunbooks() };
    }

    function duplicateRunbook(id) {
        const source = getRunbook(id);
        if (!source) throw operatorError('Runbook not found', 404);
        const list = Array.isArray(state.runbooks) ? state.runbooks : (state.runbooks = []);
        if (list.length >= MAX_RUNBOOKS) throw operatorError(`Maximum of ${MAX_RUNBOOKS} runbooks reached`, 400);
        const existingIds = new Set(list.map(rb => rb.id));
        const baseId = slugifyProfileId(`${source.id}-copy`, 'runbook-copy');
        let nextId = baseId;
        let suffix = 2;
        while (existingIds.has(nextId)) nextId = `${baseId}-${suffix++}`;
        const copy = normalizeRunbook({
            ...source,
            id: nextId,
            name: `${source.name} (Copy)`.slice(0, 80),
            updatedAt: new Date().toISOString()
        }, list.length);
        list.push(copy);
        save();
        emitUpdate('operator-runbooks-update', { runbooks: listRunbooks(), runbook: cloneJson(copy) });
        return cloneJson(copy);
    }

    function toggleRunbookItem(id, { index, itemId, done } = {}) {
        const list = Array.isArray(state.runbooks) ? state.runbooks : (state.runbooks = []);
        const cleanId = String(id || '').trim();
        const rb = list.find(r => r.id === cleanId) || list.find(r => r.name.toLowerCase() === cleanId.toLowerCase());
        if (!rb) throw operatorError('Runbook not found', 404);
        let item = null;
        if (itemId) item = rb.items.find(it => it.id === String(itemId).trim());
        if (!item && index !== undefined && index !== null && index !== '') {
            const idx = Number(index);
            if (Number.isInteger(idx) && idx >= 0 && idx < rb.items.length) item = rb.items[idx];
        }
        if (!item) throw operatorError('Runbook cue item not found', 404);
        if (done === true || done === '1' || done === 'true') item.done = true;
        else if (done === false || done === '0' || done === 'false') item.done = false;
        else item.done = !item.done;
        rb.updatedAt = new Date().toISOString();
        save();
        emitUpdate('operator-runbooks-update', { runbooks: listRunbooks(), runbook: cloneJson(rb) });
        return cloneJson(rb);
    }

    function resetRunbook(id) {
        const list = Array.isArray(state.runbooks) ? state.runbooks : (state.runbooks = []);
        const cleanId = String(id || '').trim();
        const rb = list.find(r => r.id === cleanId) || list.find(r => r.name.toLowerCase() === cleanId.toLowerCase());
        if (!rb) throw operatorError('Runbook not found', 404);
        rb.items = rb.items.map(it => ({ ...it, done: false }));
        rb.updatedAt = new Date().toISOString();
        save();
        emitUpdate('operator-runbooks-update', { runbooks: listRunbooks(), runbook: cloneJson(rb) });
        return cloneJson(rb);
    }

    function emitUpdate(extraType = null, extraPayload = null) {
        const snapshot = getState();
        if (extraType) {
            broadcastToOverlays(extraType, extraPayload);
        }
        broadcastToOverlays('operator-update', snapshot);
    }

    function upsertProfile(payload, { activate = false } = {}) {
        const normalized = normalizeProfile({ ...payload, updatedAt: new Date().toISOString() }, state.profiles.length);
        const existingIdx = state.profiles.findIndex(p => p.id === normalized.id);
        if (existingIdx === -1 && state.profiles.length >= MAX_PROFILES) {
            throw operatorError(`Maximum of ${MAX_PROFILES} profiles reached`, 400);
        }
        if (existingIdx !== -1) {
            state.profiles[existingIdx] = normalized;
        } else {
            state.profiles.push(normalized);
        }
        if (activate) {
            state.activeProfileId = normalized.id;
        }
        save();
        emitUpdate(activate ? 'operator-active-profile' : null, activate ? {
            activeProfileId: state.activeProfileId,
            profile: cloneJson(normalized)
        } : null);
        return cloneJson(normalized);
    }

    function deleteProfile(id) {
        const cleanId = String(id || '').trim();
        const idx = state.profiles.findIndex(p => p.id === cleanId);
        if (idx === -1) {
            throw operatorError('Profile not found', 404);
        }
        if (state.profiles.length <= 1) {
            throw operatorError('Cannot delete the last remaining Operator profile', 400);
        }
        const [removed] = state.profiles.splice(idx, 1);
        const switched = state.activeProfileId === removed.id;
        if (switched) {
            state.activeProfileId = state.profiles[0].id;
        }
        save();
        emitUpdate(switched ? 'operator-active-profile' : null, switched ? {
            activeProfileId: state.activeProfileId,
            profile: getActiveProfile()
        } : null);
        return {
            deleted: removed.id,
            activeProfileId: state.activeProfileId
        };
    }

    function setActiveProfile(idOrName) {
        const query = String(idOrName || '').trim();
        if (!query) throw operatorError('Profile id or name is required', 400);
        const found = state.profiles.find(p => p.id === query)
            || state.profiles.find(p => p.name.toLowerCase() === query.toLowerCase());
        if (!found) {
            throw operatorError(`Operator profile "${query}" not found`, 404);
        }
        state.activeProfileId = found.id;
        save();
        emitUpdate('operator-active-profile', {
            activeProfileId: found.id,
            profile: cloneJson(found)
        });
        return cloneJson(found);
    }

    function exportState(profileId = '') {
        const cleanId = String(profileId || '').trim();
        if (cleanId) {
            const single = getProfile(cleanId);
            if (!single) throw operatorError('Profile not found', 404);
            return {
                format: 'streampulse-operator-profiles',
                version: 1,
                exportedAt: new Date().toISOString(),
                activeProfileId: single.id,
                profiles: [single]
            };
        }
        return {
            format: 'streampulse-operator-profiles',
            version: 1,
            exportedAt: new Date().toISOString(),
            activeProfileId: state.activeProfileId,
            profiles: listProfiles(),
            runbooks: listRunbooks()
        };
    }

    function importState(payload, { mode = 'merge' } = {}) {
        if (!payload || typeof payload !== 'object') {
            throw operatorError('Import payload must be a JSON object', 400);
        }
        const rawList = Array.isArray(payload.profiles)
            ? payload.profiles
            : (payload.profile ? [payload.profile] : (payload.name || payload.board ? [payload] : null));
        if (!rawList || !rawList.length) {
            throw operatorError('Import JSON contains no Operator profiles', 400);
        }
        const normalizedList = rawList.slice(0, MAX_PROFILES).map((p, idx) =>
            normalizeProfile({ ...p, updatedAt: new Date().toISOString() }, idx)
        );

        const cleanMode = mode === 'replace' ? 'replace' : 'merge';
        if (cleanMode === 'replace') {
            const seen = new Set();
            const nextProfiles = [];
            for (const p of normalizedList) {
                let id = p.id;
                let suffix = 2;
                while (seen.has(id)) id = `${p.id}-${suffix++}`;
                seen.add(id);
                nextProfiles.push({ ...p, id });
            }
            const reqActive = String(payload.activeProfileId || '').trim();
            const nextRunbooks = Array.isArray(payload.runbooks)
                ? payload.runbooks.slice(0, MAX_RUNBOOKS).map((rb, idx) => normalizeRunbook({ ...rb, updatedAt: new Date().toISOString() }, idx))
                : (state.runbooks || buildDefaultRunbooks());
            state = {
                version: 1,
                activeProfileId: nextProfiles.some(p => p.id === reqActive) ? reqActive : nextProfiles[0].id,
                profiles: nextProfiles,
                runbooks: nextRunbooks
            };
        } else {
            const map = new Map(state.profiles.map(p => [p.id, p]));
            for (const p of normalizedList) {
                if (!map.has(p.id) && map.size >= MAX_PROFILES) {
                    throw operatorError(`Maximum of ${MAX_PROFILES} profiles reached`, 400);
                }
                map.set(p.id, p);
            }
            state.profiles = [...map.values()];
            if (!state.profiles.some(p => p.id === state.activeProfileId)) {
                state.activeProfileId = state.profiles[0].id;
            }
            if (Array.isArray(payload.runbooks)) {
                const rbMap = new Map((state.runbooks || []).map(rb => [rb.id, rb]));
                for (const [idx, rawRb] of payload.runbooks.slice(0, MAX_RUNBOOKS).entries()) {
                    try {
                        const rb = normalizeRunbook({ ...rawRb, updatedAt: new Date().toISOString() }, idx);
                        if (!rbMap.has(rb.id) && rbMap.size >= MAX_RUNBOOKS) break;
                        rbMap.set(rb.id, rb);
                    } catch { /* skip invalid */ }
                }
                state.runbooks = [...rbMap.values()];
            }
        }
        save();
        emitUpdate('operator-active-profile', {
            activeProfileId: state.activeProfileId,
            profile: getActiveProfile()
        });
        return {
            importedCount: normalizedList.length,
            mode: cleanMode,
            state: getState()
        };
    }

    load();

    return {
        load,
        reload: load,
        getState,
        listProfiles,
        getProfile,
        getActiveProfile,
        getStatusSummary,
        upsertProfile,
        deleteProfile,
        setActiveProfile,
        listRunbooks,
        getRunbook,
        upsertRunbook,
        deleteRunbook,
        duplicateRunbook,
        toggleRunbookItem,
        resetRunbook,
        exportState,
        importState
    };
}

module.exports = {
    createOperatorService,
    slugifyProfileId
};
