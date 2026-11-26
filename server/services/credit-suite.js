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
            } catch { /* fall through to defaults */ }
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

    function bumpRevision(eventType = 'state') {
        state.revision = Math.max(state.revision + 1, Date.now());
        saveState();
        onChange({
            type: eventType,
            activeProjectId: state.activeProjectId,
            revision: state.revision,
            projects: state.projects
        });
    }

    function getCurrentTransportTime() {
        if (!transport.playing) return transport.timeSec;
        const elapsed = Math.max(0, (Date.now() - transport.startedAtMs) / 1000) * (transport.speedRate || 1);
        const proj = getProject(transport.projectId) || state.projects[0];
        const solved = proj ? engine.solveTimeline(proj) : { totalDurationSec: 60 };
        const dur = solved.totalDurationSec || 60;
        const nextT = transport.timeSec + elapsed;
        if (nextT >= dur) {
            if (proj?.timing?.loop || proj?.timing?.endBehavior === 'loop') {
                return nextT % dur;
            }
            return dur;
        }
        return nextT;
    }

    function getTransportSnapshot() {
        const proj = getProject(transport.projectId) || state.projects[0];
        const solved = proj ? engine.solveTimeline(proj) : { totalDurationSec: 0, markers: [] };
        const currentSec = getCurrentTransportTime();
        return {
            projectId: transport.projectId,
            playing: transport.playing,
            timeSec: Number(currentSec.toFixed(3)),
            speedRate: transport.speedRate,
            durationSec: Number((solved.totalDurationSec || 0).toFixed(3)),
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
            projectsCount: state.projects.length,
            playing: snap.playing,
            timeSec: snap.timeSec,
            durationSec: snap.durationSec,
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
        bumpRevision('project-saved');
        return normalized;
    }

    function duplicateProject(id) {
        const orig = getProject(id);
        if (!orig) throw new Error(`Credit project "${id}" not found`);
        const copyId = uniqueProjectId(`${orig.id}-copy`);
        const copy = engine.normalizeProject({
            ...JSON.parse(JSON.stringify(orig)),
            id: copyId,
            name: `${orig.name} (Copy)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, state.projects.length);
        state.projects.push(copy);
        bumpRevision('project-duplicated');
        return copy;
    }

    function deleteProject(id) {
        const idx = state.projects.findIndex(p => p.id === id);
        if (idx < 0) throw new Error(`Credit project "${id}" not found`);
        if (state.projects.length <= 1) {
            throw new Error('Cannot delete the last remaining Credit Suite project');
        }
        state.projects.splice(idx, 1);
        if (state.activeProjectId === id) {
            state.activeProjectId = state.projects[0].id;
            transport.projectId = state.activeProjectId;
        }
        bumpRevision('project-deleted');
        return getState();
    }

    function setActiveProject(id) {
        const proj = getProject(id);
        if (!proj) throw new Error(`Credit project "${id}" not found`);
        state.activeProjectId = proj.id;
        transport.projectId = proj.id;
        transport.playing = false;
        transport.timeSec = 0;
        transport.seq++;
        bumpRevision('active-changed');
        onTransport(getTransportSnapshot());
        return proj;
    }

    function controlTransport(action, params = {}) {
        const targetId = params.projectId || params.project || transport.projectId || state.activeProjectId;
        const proj = getProject(targetId) || state.projects[0];
        if (!proj) throw new Error('No Credit Suite project available');

        if (proj.id !== transport.projectId) {
            transport.projectId = proj.id;
            transport.timeSec = 0;
            transport.playing = false;
        }
        const solved = engine.solveTimeline(proj);
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
                if (params.play === true || params.play === '1') transport.playing = true;
                else if (params.play === false || params.play === '0') transport.playing = false;
                break;
            }
            case 'jump': {
                const want = String(params.marker || params.name || '').trim().toLowerCase();
                const hit = (solved.markers || []).find(m => m.name.toLowerCase() === want)
                    || (solved.markers || []).find(m => m.name.toLowerCase().includes(want));
                if (!hit) throw new Error(`Marker "${params.marker || ''}" not found`);
                transport.timeSec = hit.timeSec;
                transport.startedAtMs = Date.now();
                if (params.play !== false && params.play !== '0') transport.playing = true;
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
            .filter(v => v && (v.type === 'list' || Array.isArray(v.value) || Array.isArray(v.items)))
            .map(v => ({
                id: v.key || v.id || v.name,
                label: v.label || v.name || v.key,
                count: Array.isArray(v.items) ? v.items.length : (Array.isArray(v.value) ? v.value.length : 0)
            }));

        const variableSets = rawSets.map(s => ({
            id: s.id || s.key || s.name,
            label: s.label || s.name || s.id,
            fields: Array.isArray(s.fields) ? s.fields.map(f => ({ key: f.key || f.name, label: f.label || f.key })) : [],
            count: Array.isArray(s.entries) ? s.entries.length : 0
        }));

        const session = getSessionData();
        const sessionCategories = [
            { id: 'all', label: 'All Contributors (Subs, Mods, VIPs, Chatters)', count: countSessionCategory(session, 'all') },
            { id: 'subscribers', label: 'Subscribers & Giftees', count: countSessionCategory(session, 'subscribers') },
            { id: 'gifters', label: 'Gift Subbers', count: countSessionCategory(session, 'gifters') },
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
                    : (item?.displayName || item?.display_name || item?.username || item?.user || item?.name || '');
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
        if (cat === 'all' || cat === 'gifters') addAll(out, session.gifters);
        if (cat === 'all' || cat === 'raiders') addAll(out, session.raiders);
        if (cat === 'all' || cat === 'cheerers') {
            addAll(out, session.cheerers);
            addAll(out, session.donations);
        }
        if (cat === 'all' || cat === 'moderators') addAll(out, session.moderators);
        if (cat === 'all' || cat === 'chatters') {
            if (Array.isArray(session.chatters)) addAll(out, session.chatters);
            else if (session.chatters && typeof session.chatters === 'object') {
                Object.keys(session.chatters).forEach(k => { if (k.trim()) out.add(k.trim()); });
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
            const found = rawVars.find(v => (v.key || v.id || v.name) === dataSource.sourceId);
            if (!found) return [];
            const items = Array.isArray(found.items)
                ? found.items
                : (Array.isArray(found.value) ? found.value : String(found.value || '').split('\n'));
            return items
                .map((it, i) => {
                    const label = typeof it === 'string' ? it.trim() : String(it?.label || it?.value || it?.name || '').trim();
                    return label ? { sourceKey: `lv-${i}-${label.toLowerCase()}`, name: label, role: '' } : null;
                })
                .filter(Boolean);
        }

        if (type === 'variable-set') {
            const rawSets = Array.isArray(varState.sets) ? varState.sets : Object.values(varState.sets || {});
            const found = rawSets.find(s => (s.id || s.key || s.name) === dataSource.sourceId);
            if (!found || !Array.isArray(found.entries)) return [];
            const nameField = dataSource.field || found.fields?.[0]?.key || 'name';
            const roleField = dataSource.roleField || '';
            return found.entries
                .filter(e => e && e.enabled !== false)
                .map((e, i) => {
                    const vals = e.values || e;
                    const name = String(vals[nameField] ?? e.label ?? e.name ?? '').trim();
                    const role = roleField ? String(vals[roleField] ?? '').trim() : '';
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
     * Preserves checked state and editedName overrides (just like credits-export.php!).
     */
    function pullDataSourceForBlock(block) {
        const fresh = resolveDataSourceEntries(block.dataSource);
        if (block.type === 'role-split') {
            const existingByKey = new Map((block.rows || []).map(r => [`${r.role}::${r.name}`.toLowerCase(), r]));
            const nextRows = fresh.map((item, i) => {
                const prev = existingByKey.get(`${item.role}::${item.name}`.toLowerCase());
                return {
                    id: prev?.id || `row-${Date.now()}-${i}`,
                    role: item.role || block.title || 'Credit',
                    name: item.name,
                    checked: prev ? prev.checked !== false : true
                };
            });
            return { rows: nextRows, count: nextRows.length };
        }
        const existingByKey = new Map();
        for (const n of (block.names || [])) {
            if (n.sourceKey) existingByKey.set(n.sourceKey, n);
            else existingByKey.set(String(n.name || '').toLowerCase(), n);
        }
        const conflicts = [];
        const nextNames = fresh.map((item, i) => {
            const prev = existingByKey.get(item.sourceKey) || existingByKey.get(item.name.toLowerCase());
            if (prev) {
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
        if (idx < 0) throw new Error(`Theme "${id}" not found`);
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
        bumpRevision('reset-defaults');
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
            const proj = getProject(id);
            if (!proj) throw new Error(`Credit project "${id}" not found`);
            return engine.generateSrt(proj);
        },
        resetDefaults,
        reload
    };
}

module.exports = { createCreditSuiteService };
