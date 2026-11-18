'use strict';

const fs = require('fs');
const path = require('path');
const { safeWriteFileSync } = require('../routes/helpers');

const VALID_COLUMNS = new Set([1, 2, 3, 4]);
const MAX_PROFILES = 50;
const MAX_CARDS = 64;
const MAX_OVERLAYS = 40;

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
        tabs: { hidden: hiddenTabs }
    };
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
                tabs: { hidden: [] }
            }
        ]
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
        return {
            version: 1,
            activeProfileId,
            profiles
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
            overlayCount: active ? active.overlays.length : 0
        };
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
            profiles: listProfiles()
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
            state = {
                version: 1,
                activeProfileId: nextProfiles.some(p => p.id === reqActive) ? reqActive : nextProfiles[0].id,
                profiles: nextProfiles
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
        exportState,
        importState
    };
}

module.exports = {
    createOperatorService,
    slugifyProfileId
};
