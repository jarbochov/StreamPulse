'use strict';

const fs = require('fs');
const path = require('path');
const engine = require('../../shared/credit-suite-engine.cjs');

function createCreditSuiteService(options = {}) {
    const dataDir = options.dataDir || path.resolve(__dirname, '../../data');
    const suiteDir = path.join(dataDir, 'credit-suite');
    const statePath = path.join(suiteDir, 'projects.json');
    const exportsDir = path.join(suiteDir, 'exports');

    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const onTransport = typeof options.onTransport === 'function' ? options.onTransport : () => {};
    const getVariablesState = typeof options.getVariablesState === 'function' ? options.getVariablesState : () => ({ variables: [], sets: [] });
    const getSessionData = typeof options.getSessionData === 'function' ? options.getSessionData : () => null;

    let state = {
        activeProjectId: 'cinematic-feature',
        projects: [],
        themes: [],
        revision: 1
    };

    let transport = {
        projectId: 'cinematic-feature',
        playing: false,
        timeSec: 0,
        speedRate: 1,
        startedAtMs: 0,
        seq: 1
    };

    // Cache solved timeline per (projectId, revision) so status/transport polls do zero redundant math
    const solvedCache = new Map();
    function getSolvedForProject(proj) {
        if (!proj) return { totalDurationSec: 0, markers: [] };
        const key = `${proj.id}:${state.revision}`;
        let cached = solvedCache.get(key);
        if (!cached) {
            if (solvedCache.size > 24) solvedCache.clear();
            cached = engine.solveTimeline(proj);
            solvedCache.set(key, cached);
        }
        return cached;
    }

    function parseOptionalBool(val) {
        if (val === undefined || val === null || val === '') return undefined;
        if (val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true') return true;
        if (val === false || val === 0 || val === '0' || String(val).toLowerCase() === 'false') return false;
        return undefined;
    }

    function makeNotFoundError(message) {
        const err = new Error(message);
        err.statusCode = 404;
        return err;
    }

    function ensureDirs() {
        fs.mkdirSync(suiteDir, { recursive: true });
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    function saveState() {
        ensureDirs();
        const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({
            activeProjectId: state.activeProjectId,
            projects: state.projects,
            themes: state.themes,
            revision: state.revision
        }, null, 2), 'utf8');
        fs.renameSync(tmp, statePath);
    }

    function loadState() {
        ensureDirs();
        if (fs.existsSync(statePath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                const rawProjects = Array.isArray(parsed?.projects) ? parsed.projects : [];
                const projects = rawProjects.length
                    ? rawProjects.map((p, i) => engine.normalizeProject(p, i))
                    : engine.buildDefaultProjects();
                const rawThemes = Array.isArray(parsed?.themes) ? parsed.themes : null;
                const themes = rawThemes
                    ? rawThemes.map((t, i) => engine.normalizeThemePreset(t, i))
                    : engine.buildDefaultThemes();
                const activeId = projects.some(p => p.id === parsed?.activeProjectId)
                    ? parsed.activeProjectId
                    : projects[0].id;
                state = {
                    activeProjectId: activeId,
                    projects,
                    themes,
                    revision: Number(parsed?.revision) || 1
                };
                transport.projectId = activeId;
                return;
            } catch {
                // Preserve corrupted file instead of silently wiping user projects
                try {
                    const backupPath = `${statePath}.corrupt.${Date.now()}`;
                    fs.copyFileSync(statePath, backupPath);
                } catch {}
            }
        }
        const defaults = engine.buildDefaultProjects();
        state = {
            activeProjectId: defaults[0].id,
            projects: defaults,
            themes: engine.buildDefaultThemes(),
            revision: 1
        };
        transport.projectId = defaults[0].id;
        saveState();
    }

    loadState();

    function bumpRevision(eventType = 'state', meta = {}) {
        state.revision = Math.max(state.revision + 1, Date.now());
        solvedCache.clear();
        saveState();
        const isThemeEvent = eventType === 'theme-saved' || eventType === 'theme-deleted' || eventType === 'themes-reset';
        onChange({
            type: eventType,
            activeProjectId: state.activeProjectId,
            changedProjectId: meta.projectId || '',
            revision: state.revision,
            ...(isThemeEvent ? { themes: state.themes } : { projects: state.projects })
        });
    }

    function getCurrentTransportTime() {
        const proj = getProject(transport.projectId) || state.projects[0];
        const solved = getSolvedForProject(proj);
        const dur = solved.totalDurationSec || 0;
        if (!transport.playing) return Math.min(dur || transport.timeSec, Math.max(0, transport.timeSec));
        const elapsed = Math.max(0, (Date.now() - transport.startedAtMs) / 1000) * (transport.speedRate || 1);
        const nextT = transport.timeSec + elapsed;
        if (dur > 0 && nextT >= dur) {
            if (proj?.timing?.loop || proj?.timing?.endBehavior === 'loop') {
                return nextT % dur;
            }
            // Non-looping playback naturally finished: stop cleanly so Companion & Operator reflect real state
            transport.playing = false;
            transport.timeSec = dur;
            return dur;
        }
        return nextT;
    }

    function getTransportSnapshot() {
        const proj = getProject(transport.projectId) || state.projects[0];
        const solved = getSolvedForProject(proj);
        const currentSec = getCurrentTransportTime();
        const dur = solved.totalDurationSec || 0;
        const remainingSec = Math.max(0, dur - currentSec);
        const progressPct = dur > 0 ? Math.min(100, Math.round((currentSec / dur) * 100)) : 0;
        const playState = transport.playing ? 'playing' : (dur > 0 && currentSec >= dur - 0.01 ? 'ended' : 'paused');
        return {
            projectId: transport.projectId,
            projectName: proj?.name || '',
            playing: transport.playing,
            state: playState,
            timeSec: Number(currentSec.toFixed(3)),
            durationSec: Number(dur.toFixed(3)),
            remainingSec: Number(remainingSec.toFixed(3)),
            progressPct,
            speedRate: transport.speedRate,
            markers: solved.markers || [],
            seq: transport.seq
        };
    }

    function getProject(id) {
        if (!id) return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0] || null;
        return state.projects.find(p => p.id === id) || null;
    }

    function getState() {
        return {
            activeProjectId: state.activeProjectId,
            projects: state.projects,
            revision: state.revision,
            transport: getTransportSnapshot(),
            themes: state.themes,
            starterThemes: engine.STARTER_THEMES,
            canvasPresets: engine.CANVAS_PRESETS,
            blockTypes: engine.BLOCK_TYPES,
            exportsDir
        };
    }

    function getStatus() {
        const active = getProject(state.activeProjectId) || state.projects[0];
        const snap = getTransportSnapshot();
        return {
            activeProjectId: active?.id || '',
            activeProjectName: active?.name || '',
            transportProjectId: snap.projectId || active?.id || '',
            transportProjectName: snap.projectName || active?.name || '',
            projectsCount: state.projects.length,
            playing: snap.playing,
            state: snap.state,
            timeSec: snap.timeSec,
            durationSec: snap.durationSec,
            remainingSec: snap.remainingSec,
            progressPct: snap.progressPct,
            speedRate: snap.speedRate,
            markers: snap.markers,
            revision: state.revision
        };
    }

    function uniqueProjectId(desired, excludeId = null) {
        const base = engine.sanitizeId(desired, 'credits').slice(0, 56);
        let candidate = base;
        let n = 2;
        while (state.projects.some(p => p.id === candidate && p.id !== excludeId)) {
            const suffix = `-${n++}`;
            candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
        }
        return candidate;
    }

    function upsertProject(rawProject, { setActive = false, createNew = false } = {}) {
        const now = new Date().toISOString();
        const existingIdx = createNew ? -1 : state.projects.findIndex(p => p.id === rawProject?.id);
        const existing = existingIdx >= 0 ? state.projects[existingIdx] : null;
        const id = existing
            ? existing.id
            : uniqueProjectId(rawProject?.id || rawProject?.name || `credits-${state.projects.length + 1}`);

        const normalized = engine.normalizeProject({
            ...rawProject,
            id,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        }, state.projects.length);

        if (existingIdx >= 0) {
            state.projects[existingIdx] = normalized;
        } else {
            state.projects.push(normalized);
        }
        if (setActive || !state.activeProjectId) {
            state.activeProjectId = normalized.id;
            transport.projectId = normalized.id;
        }
        bumpRevision('project-saved', { projectId: normalized.id });
        return normalized;
    }

    function duplicateProject(id) {
        const orig = getProject(id);
        if (!orig) throw makeNotFoundError(`Credit project "${id}" not found`);
        const copyId = uniqueProjectId(`${orig.id}-copy`);
        const copy = engine.normalizeProject({
            ...JSON.parse(JSON.stringify(orig)),
            id: copyId,
            name: `${orig.name} (Copy)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, state.projects.length);
        state.projects.push(copy);
        bumpRevision('project-duplicated', { projectId: copy.id });
        return copy;
    }

    function deleteProject(id) {
        const idx = state.projects.findIndex(p => p.id === id);
        if (idx < 0) throw makeNotFoundError(`Credit project "${id}" not found`);
        if (state.projects.length <= 1) {
            throw new Error('Cannot delete the last remaining Credit Suite project');
        }
        state.projects.splice(idx, 1);
        let resetTransport = false;
        if (state.activeProjectId === id) {
            state.activeProjectId = state.projects[0].id;
            resetTransport = true;
        }
        if (transport.projectId === id || resetTransport) {
            transport.projectId = state.activeProjectId;
            transport.playing = false;
            transport.timeSec = 0;
            transport.seq++;
            resetTransport = true;
        }
        bumpRevision('project-deleted', { projectId: id });
        if (resetTransport) onTransport(getTransportSnapshot());
        return getState();
    }

    function setActiveProject(id) {
        if (!id || !String(id).trim()) throw new Error('Project ID is required');
        const proj = state.projects.find(p => p.id === String(id).trim());
        if (!proj) throw makeNotFoundError(`Credit project "${id}" not found`);
        state.activeProjectId = proj.id;
        transport.projectId = proj.id;
        transport.playing = false;
        transport.timeSec = 0;
        transport.seq++;
        bumpRevision('active-changed', { projectId: proj.id });
        onTransport(getTransportSnapshot());
        return proj;
    }

    function controlTransport(action, params = {}) {
        const requestedId = String(params.projectId || params.project || '').trim();
        const proj = requestedId
            ? state.projects.find(p => p.id === requestedId)
            : (getProject(transport.projectId) || state.projects[0]);
        if (!proj) throw makeNotFoundError(requestedId ? `Credit project "${requestedId}" not found` : 'No Credit Suite project available');

        if (proj.id !== transport.projectId) {
            transport.projectId = proj.id;
            transport.timeSec = 0;
            transport.playing = false;
        }
        const solved = getSolvedForProject(proj);
        const current = getCurrentTransportTime();

        switch (String(action || '').toLowerCase()) {
            case 'play':
                transport.timeSec = current >= solved.totalDurationSec ? 0 : current;
                transport.playing = true;
                transport.startedAtMs = Date.now();
                break;
            case 'pause':
                transport.timeSec = current;
                transport.playing = false;
                break;
            case 'toggle':
                if (transport.playing) {
                    transport.timeSec = current;
                    transport.playing = false;
                } else {
                    transport.timeSec = current >= solved.totalDurationSec ? 0 : current;
                    transport.playing = true;
                    transport.startedAtMs = Date.now();
                }
                break;
            case 'restart':
                transport.timeSec = 0;
                transport.playing = true;
                transport.startedAtMs = Date.now();
                break;
            case 'stop':
                transport.timeSec = 0;
                transport.playing = false;
                break;
            case 'seek': {
                const t = engine.clamp(params.t ?? params.timeSec ?? params.seconds, 0, solved.totalDurationSec, 0);
                transport.timeSec = t;
                transport.startedAtMs = Date.now();
                const playOpt = parseOptionalBool(params.play);
                if (playOpt !== undefined) transport.playing = playOpt;
                break;
            }
            case 'jump': {
                const want = String(params.marker || params.name || '').trim().toLowerCase();
                if (!want) throw new Error('Marker name is required');
                const hit = (solved.markers || []).find(m => m.name.toLowerCase() === want)
                    || (solved.markers || []).find(m => m.name.toLowerCase().includes(want));
                if (!hit) throw makeNotFoundError(`Marker "${params.marker || ''}" not found`);
                transport.timeSec = hit.timeSec;
                transport.startedAtMs = Date.now();
                const playOpt = parseOptionalBool(params.play);
                if (playOpt !== false) transport.playing = true;
                else transport.playing = false;
                break;
            }
            case 'speed': {
                transport.timeSec = current;
                transport.speedRate = engine.clamp(params.rate ?? params.speed, 0.25, 4, 1);
                transport.startedAtMs = Date.now();
                break;
            }
            default:
                throw new Error(`Unknown transport action "${action}"`);
        }

        transport.seq++;
        const snap = getTransportSnapshot();
        onTransport(snap);
        return snap;
    }

    function listDataSources() {
        const varState = getVariablesState() || {};
        const rawVars = Array.isArray(varState.variables) ? varState.variables : Object.values(varState.variables || {});
        const rawSets = Array.isArray(varState.sets) ? varState.sets : Object.values(varState.sets || {});

        const listVariables = rawVars
            .filter(v => v && (v.type === 'list' || v.type === 'tags' || Array.isArray(v.value) || Array.isArray(v.items)))
            .map(v => ({
                id: v.key || v.id || v.name,
                label: v.label || v.key || v.name,
                count: Array.isArray(v.items) ? v.items.length : (Array.isArray(v.value) ? v.value.length : 0)
            }));

        const variableSets = rawSets.map(s => {
            const entries = Array.isArray(s.roster) ? s.roster : (Array.isArray(s.entries) ? s.entries : []);
            const fields = [
                { key: '_label', label: 'Entry Label' },
                ...(Array.isArray(s.fields) ? s.fields.map(f => ({ key: f.key || f.id || f.name, label: f.label || f.key || f.id })) : [])
            ];
            return {
                id: s.id || s.key || s.name,
                label: s.label || s.name || s.id,
                fields,
                count: entries.length
            };
        });

        const session = getSessionData();
        const sessionCategories = [
            { id: 'all', label: 'All Contributors (Subs, Gifters, Followers, Raiders, Chatters)', count: countSessionCategory(session, 'all') },
            { id: 'subscribers', label: 'Subscribers & Giftees', count: countSessionCategory(session, 'subscribers') },
            { id: 'gifters', label: 'Gift Subbers', count: countSessionCategory(session, 'gifters') },
            { id: 'followers', label: 'Followers', count: countSessionCategory(session, 'followers') },
            { id: 'raiders', label: 'Raiders', count: countSessionCategory(session, 'raiders') },
            { id: 'cheerers', label: 'Cheerers & Supporters', count: countSessionCategory(session, 'cheerers') },
            { id: 'moderators', label: 'Moderators', count: countSessionCategory(session, 'moderators') },
            { id: 'chatters', label: 'Active Chatters', count: countSessionCategory(session, 'chatters') }
        ];

        return { listVariables, variableSets, sessionCategories };
    }

    function extractSessionNames(session, category = 'all') {
        if (!session || typeof session !== 'object') return [];
        const addAll = (set, arr) => {
            if (!Array.isArray(arr)) return;
            for (const item of arr) {
                const name = typeof item === 'string'
                    ? item
                    : (item?.chatname || item?.displayName || item?.display_name || item?.giver || item?.username || item?.user || item?.name || '');
                if (name && String(name).trim()) set.add(String(name).trim());
            }
        };
        const out = new Set();
        const cat = String(category || 'all').toLowerCase();
        if (cat === 'all' || cat === 'subscribers') {
            addAll(out, session.subscribers);
            addAll(out, session.resubs);
            addAll(out, session.subs);
        }
        if (cat === 'all' || cat === 'gifters') {
            addAll(out, session.gifters);
            addAll(out, session.giftSubs);
        }
        if (cat === 'all' || cat === 'followers') {
            addAll(out, session.followers);
        }
        if (cat === 'all' || cat === 'raiders') {
            addAll(out, session.raiders);
            addAll(out, session.raids);
        }
        if (cat === 'all' || cat === 'cheerers') {
            addAll(out, session.cheerers);
            addAll(out, session.bits);
            addAll(out, session.donations);
        }
        if (cat === 'all' || cat === 'moderators') {
            addAll(out, session.moderators);
            if (session.chatters && typeof session.chatters === 'object' && !Array.isArray(session.chatters)) {
                for (const [key, c] of Object.entries(session.chatters)) {
                    if (c && (c.mod || c.isMod || c.moderator || (Array.isArray(c.badges) && c.badges.some(b => /mod/i.test(String(b)))))) {
                        const nm = String(c.chatname || c.displayName || key || '').trim();
                        if (nm) out.add(nm);
                    }
                }
            }
        }
        if (cat === 'all' || cat === 'chatters') {
            if (Array.isArray(session.chatters)) addAll(out, session.chatters);
            else if (session.chatters && typeof session.chatters === 'object') {
                for (const [key, c] of Object.entries(session.chatters)) {
                    const nm = String(c?.chatname || c?.displayName || key || '').trim();
                    if (nm) out.add(nm);
                }
            }
        }
        return [...out].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    function countSessionCategory(session, category) {
        return extractSessionNames(session, category).length;
    }

    function resolveDataSourceEntries(dataSource = {}) {
        const type = dataSource.type || 'manual';
        const varState = getVariablesState() || {};

        if (type === 'list-variable') {
            const rawVars = Array.isArray(varState.variables) ? varState.variables : Object.values(varState.variables || {});
            const found = rawVars.find(v => (v.key || v.id || v.name) === dataSource.sourceId || v.name === dataSource.sourceId);
            if (!found) return [];
            const items = Array.isArray(found.items)
                ? found.items
                : (Array.isArray(found.value) ? found.value : String(found.value || '').split('\n'));
            const seen = new Map();
            return items
                .map(it => {
                    const label = typeof it === 'string' ? it.trim() : String(it?.label || it?.value || it?.name || '').trim();
                    if (!label) return null;
                    const baseKey = `lv-${label.toLowerCase()}`;
                    const occ = (seen.get(baseKey) || 0) + 1;
                    seen.set(baseKey, occ);
                    return { sourceKey: occ > 1 ? `${baseKey}-${occ}` : baseKey, name: label, role: '' };
                })
                .filter(Boolean);
        }

        if (type === 'variable-set') {
            const rawSets = Array.isArray(varState.sets) ? varState.sets : Object.values(varState.sets || {});
            const found = rawSets.find(s => (s.id || s.key || s.name) === dataSource.sourceId);
            const entries = Array.isArray(found?.roster) ? found.roster : (Array.isArray(found?.entries) ? found.entries : []);
            if (!found || !entries.length) return [];
            const nameField = dataSource.field || '_label';
            const roleField = dataSource.roleField || '';
            return entries
                .filter(e => e && e.enabled !== false)
                .map((e, i) => {
                    const vals = e.values || e;
                    const name = nameField === '_label'
                        ? String(e.label ?? e.name ?? '').trim()
                        : String(vals[nameField] ?? e.label ?? e.name ?? '').trim();
                    const role = roleField
                        ? (roleField === '_label' ? String(e.label ?? '').trim() : String(vals[roleField] ?? '').trim())
                        : '';
                    if (!name) return null;
                    return { sourceKey: String(e.id || `vs-${i}`), name, role };
                })
                .filter(Boolean);
        }

        if (type === 'session-credits') {
            const names = extractSessionNames(getSessionData(), dataSource.sessionCategory || 'all');
            return names.map(name => ({ sourceKey: `sess-${name.toLowerCase()}`, name, role: '' }));
        }

        return [];
    }

    /**
     * Conflict-safe refresh of a roster/role-split block from its configured dataSource.
     * Preserves checked state, editedName overrides, and manually-added entries.
     */
    function pullDataSourceForBlock(block) {
        const fresh = resolveDataSourceEntries(block.dataSource);
        if (block.type === 'role-split') {
            const existingByKey = new Map((block.rows || []).map(r => [`${r.role}::${r.name}`.toLowerCase(), r]));
            const nextRows = fresh.map((item, i) => {
                const resolvedRole = item.role || block.title || 'Credit';
                const prev = existingByKey.get(`${resolvedRole}::${item.name}`.toLowerCase())
                    || existingByKey.get(`${item.role}::${item.name}`.toLowerCase());
                return {
                    id: prev?.id || `row-${Date.now()}-${i}`,
                    role: resolvedRole,
                    name: item.name,
                    checked: prev ? prev.checked !== false : true
                };
            });
            return { rows: nextRows, count: nextRows.length };
        }
        const existingByKey = new Map();
        const manualEntries = [];
        for (const n of (block.names || [])) {
            if (n.sourceKey) {
                existingByKey.set(n.sourceKey, n);
            } else {
                existingByKey.set(String(n.name || '').toLowerCase(), n);
                manualEntries.push(n);
            }
        }
        const conflicts = [];
        const matchedManualIds = new Set();
        const nextNames = fresh.map((item, i) => {
            const prev = existingByKey.get(item.sourceKey) || existingByKey.get(item.name.toLowerCase());
            if (prev) {
                if (!prev.sourceKey) matchedManualIds.add(prev.id);
                if (prev.editedName && prev.name !== item.name) {
                    conflicts.push({
                        id: prev.id,
                        oldName: prev.name,
                        newName: item.name,
                        editedName: prev.editedName
                    });
                }
                return {
                    id: prev.id,
                    sourceKey: item.sourceKey,
                    name: item.name,
                    editedName: prev.editedName || '',
                    checked: prev.checked !== false
                };
            }
            return {
                id: `name-${Date.now()}-${i}`,
                sourceKey: item.sourceKey,
                name: item.name,
                editedName: '',
                checked: true
            };
        });
        for (const m of manualEntries) {
            if (!matchedManualIds.has(m.id)) nextNames.push(m);
        }
        return { names: nextNames, conflicts, count: nextNames.length };
    }

    function uniqueThemeId(desired) {
        const base = engine.sanitizeId(desired, 'custom-theme').slice(0, 56);
        let candidate = base;
        let n = 2;
        while (state.themes.some(t => t.id === candidate)) {
            const suffix = `-${n++}`;
            candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
        }
        return candidate;
    }

    function upsertTheme(rawTheme, { createNew = false } = {}) {
        const existingIdx = createNew ? -1 : state.themes.findIndex(t => t.id === rawTheme?.id);
        const id = existingIdx >= 0
            ? state.themes[existingIdx].id
            : uniqueThemeId(rawTheme?.id || rawTheme?.name || `theme-${state.themes.length + 1}`);
        const normalized = engine.normalizeThemePreset({
            ...rawTheme,
            id,
            builtin: existingIdx >= 0 ? Boolean(state.themes[existingIdx].builtin) : false
        }, state.themes.length);
        if (existingIdx >= 0) {
            state.themes[existingIdx] = normalized;
        } else {
            state.themes.push(normalized);
        }
        bumpRevision('theme-saved');
        return normalized;
    }

    function deleteTheme(id) {
        const idx = state.themes.findIndex(t => t.id === id);
        if (idx < 0) throw makeNotFoundError(`Theme "${id}" not found`);
        state.themes.splice(idx, 1);
        bumpRevision('theme-deleted');
        return state.themes;
    }

    function resetStarterThemes() {
        const defaults = engine.buildDefaultThemes();
        const defaultIds = new Set(defaults.map(d => d.id));
        const customOnly = state.themes.filter(t => !defaultIds.has(t.id));
        state.themes = [...defaults, ...customOnly];
        bumpRevision('themes-reset');
        return state.themes;
    }

    function resetDefaults() {
        const defaults = engine.buildDefaultProjects();
        state.projects = defaults;
        state.activeProjectId = defaults[0].id;
        transport.projectId = defaults[0].id;
        transport.playing = false;
        transport.timeSec = 0;
        transport.seq++;
        bumpRevision('reset-defaults');
        onTransport(getTransportSnapshot());
        return getState();
    }

    function reload() {
        loadState();
        return getState();
    }

    return {
        exportsDir,
        statePath,
        getState,
        getStatus,
        getProject,
        upsertProject,
        duplicateProject,
        deleteProject,
        setActiveProject,
        upsertTheme,
        deleteTheme,
        resetStarterThemes,
        controlTransport,
        getTransportSnapshot,
        listDataSources,
        resolveDataSourceEntries,
        pullDataSourceForBlock,
        generateSrt: id => {
            const proj = state.projects.find(p => p.id === id);
            if (!proj) throw makeNotFoundError(`Credit project "${id}" not found`);
            return engine.generateSrt(proj);
        },
        resetDefaults,
        reload
    };
}

module.exports = { createCreditSuiteService };
