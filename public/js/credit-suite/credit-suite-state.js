/**
 * StreamPulse Credit Suite — Reactive Studio State, History, & API Client
 */

const PREFS_KEY = 'streampulse.credit-suite.prefs';

function loadPrefs() {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
    } catch {
        return {};
    }
}

function savePrefs(patch) {
    try {
        const cur = loadPrefs();
        localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...patch }));
    } catch {}
}

export function createCreditSuiteState() {
    const prefs = loadPrefs();
    const listeners = new Set();

    const store = {
        projects: [],
        themes: [],
        activeProjectId: '',
        project: null,
        solved: null,
        capabilities: null,
        dataSources: { listVariables: [], variableSets: [], sessionCategories: [] },
        variablesMap: {},
        assets: [],
        selection: { kind: null, id: null, trackId: null },
        selectedClipIds: new Set(),
        outlinerTab: prefs.outlinerTab === 'tracks' ? 'tracks' : 'blocks',
        inspectorTab: ['selected', 'theme', 'export'].includes(prefs.inspectorTab) ? prefs.inspectorTab : 'selected',
        backdrop: ['checker', 'dark', 'light'].includes(prefs.backdrop) ? prefs.backdrop : 'checker',
        showGuides: prefs.showGuides !== undefined ? Boolean(prefs.showGuides) : true,
        timelineZoom: Number(prefs.timelineZoom) || 18, // px per second
        dirty: false,
        saving: false,
        activeExportJob: null,
        undoStack: [],
        redoStack: [],
        ws: null
    };

    function emit(reason = 'change') {
        for (const fn of listeners) {
            try { fn(reason, store); } catch (err) { console.error('[CreditSuite listener]', err); }
        }
    }

    function subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function pushUndoSnapshot() {
        if (!store.project) return;
        store.undoStack.push(clone(store.project));
        if (store.undoStack.length > 35) store.undoStack.shift();
        store.redoStack = [];
    }

    function mutateProject(mutator, { reason = 'project', recordUndo = true } = {}) {
        if (!store.project) return;
        if (recordUndo) pushUndoSnapshot();
        mutator(store.project);
        store.dirty = true;
        emit(reason);
    }

    function undo() {
        if (!store.undoStack.length || !store.project) return false;
        store.redoStack.push(clone(store.project));
        store.project = store.undoStack.pop();
        store.dirty = true;
        emit('project');
        return true;
    }

    function redo() {
        if (!store.redoStack.length || !store.project) return false;
        store.undoStack.push(clone(store.project));
        store.project = store.redoStack.pop();
        store.dirty = true;
        emit('project');
        return true;
    }

    function setSelection(kind, id, trackId = null) {
        store.selection = { kind, id, trackId };
        store.selectedClipIds = kind === 'clip' && id ? new Set([id]) : new Set();
        if (kind) {
            store.inspectorTab = 'selected';
            savePrefs({ inspectorTab: 'selected' });
        }
        emit('selection');
    }

    function toggleClipSelection(id, trackId = null) {
        if (!id) return;
        const next = new Set(store.selectedClipIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        store.selectedClipIds = next;
        if (next.size === 0) {
            store.selection = { kind: null, id: null, trackId: null };
        } else {
            const primary = next.has(id) ? id : [...next][next.size - 1];
            store.selection = { kind: 'clip', id: primary, trackId };
            store.inspectorTab = 'selected';
        }
        emit('selection');
    }

    function setClipSelectionSet(ids) {
        const next = new Set(ids || []);
        store.selectedClipIds = next;
        if (next.size === 0) {
            store.selection = { kind: null, id: null, trackId: null };
        } else {
            const first = [...next][0];
            let tid = null;
            for (const tr of (store.project?.tracks || [])) {
                if ((tr.clips || []).some(c => c.id === first)) { tid = tr.id; break; }
            }
            store.selection = { kind: 'clip', id: first, trackId: tid };
        }
        emit('selection');
    }

    function setOutlinerTab(tab) {
        store.outlinerTab = tab === 'tracks' ? 'tracks' : 'blocks';
        savePrefs({ outlinerTab: store.outlinerTab });
        emit('ui');
    }

    function setInspectorTab(tab) {
        store.inspectorTab = ['selected', 'theme', 'export'].includes(tab) ? tab : 'selected';
        savePrefs({ inspectorTab: store.inspectorTab });
        emit('ui');
    }

    function setBackdrop(mode) {
        store.backdrop = ['checker', 'dark', 'light'].includes(mode) ? mode : 'checker';
        savePrefs({ backdrop: store.backdrop });
        emit('ui');
    }

    function setShowGuides(on) {
        store.showGuides = Boolean(on);
        savePrefs({ showGuides: store.showGuides });
        emit('ui');
    }

    function setTimelineZoom(pxPerSec) {
        store.timelineZoom = Math.max(6, Math.min(80, Number(pxPerSec) || 18));
        savePrefs({ timelineZoom: store.timelineZoom });
        emit('timeline-zoom');
    }

    function setSolved(solved) {
        store.solved = solved;
        emit('solved');
    }

    function getSelectedBlock() {
        if (store.selection.kind !== 'block' || !store.project) return null;
        return (store.project.blocks || []).find(b => b.id === store.selection.id) || null;
    }

    function getSelectedClip() {
        if (store.selection.kind !== 'clip' || !store.project) return null;
        for (const tr of (store.project.tracks || [])) {
            const c = (tr.clips || []).find(item => item.id === store.selection.id);
            if (c) return { track: tr, clip: c };
        }
        return null;
    }

    function flattenVariables(data) {
        const out = {};
        const list = Array.isArray(data?.variables) ? data.variables : Object.values(data?.variables || {});
        for (const v of list) {
            if (!v || !v.key) continue;
            const val = v.value ?? '';
            out[v.key] = val;
            out[`var.${v.key}`] = val;
        }
        const sets = Array.isArray(data?.sets) ? data.sets : Object.values(data?.sets || {});
        for (const s of sets) {
            if (!s || !s.id) continue;
            const activeSlot = s.slots?.[0]?.entryId;
            const entry = (s.entries || []).find(e => e.id === activeSlot) || s.entries?.[0];
            if (entry?.values) {
                for (const [k, val] of Object.entries(entry.values)) {
                    out[`set.${s.id}.${k}`] = val;
                }
            }
        }
        return out;
    }

    async function loadInitial() {
        const [suiteRes, dsRes, varRes, assetsRes] = await Promise.all([
            fetch('/api/credit-suite'),
            fetch('/api/credit-suite/data-sources').catch(() => null),
            fetch('/api/variables').catch(() => null),
            fetch('/api/custom-overlays/assets').catch(() => null)
        ]);
        const suiteData = await suiteRes.json();
        store.projects = suiteData.projects || [];
        store.themes = Array.isArray(suiteData.themes)
            ? suiteData.themes
            : (window.StreamPulseCreditSuiteEngine?.buildDefaultThemes?.() || []);
        store.capabilities = suiteData.capabilities || null;
        const preferred = prefs.activeProjectId && store.projects.some(p => p.id === prefs.activeProjectId)
            ? prefs.activeProjectId
            : (suiteData.activeProjectId || store.projects[0]?.id || '');
        store.activeProjectId = preferred;
        const active = store.projects.find(p => p.id === preferred) || store.projects[0];
        store.project = active ? clone(active) : null;
        store.dirty = false;
        store.undoStack = [];
        store.redoStack = [];
        if (store.project?.blocks?.length) {
            store.selection = { kind: 'block', id: store.project.blocks[0].id, trackId: null };
        }

        if (dsRes?.ok) store.dataSources = await dsRes.json();
        if (varRes?.ok) store.variablesMap = flattenVariables(await varRes.json());
        if (assetsRes?.ok) {
            const aData = await assetsRes.json();
            store.assets = Array.isArray(aData) ? aData : (aData.assets || []);
        }
        emit('init');
    }

    async function selectProject(id) {
        const found = store.projects.find(p => p.id === id);
        if (!found) return;
        store.activeProjectId = found.id;
        store.project = clone(found);
        store.dirty = false;
        store.undoStack = [];
        store.redoStack = [];
        store.selection = found.blocks?.[0]
            ? { kind: 'block', id: found.blocks[0].id, trackId: null }
            : { kind: null, id: null, trackId: null };
        savePrefs({ activeProjectId: found.id });
        try {
            await fetch('/api/credit-suite/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: found.id })
            });
        } catch {}
        emit('project-switched');
    }

    async function saveProject() {
        if (!store.project || store.saving) return null;
        store.saving = true;
        emit('ui');
        try {
            const res = await fetch(`/api/credit-suite/projects/${encodeURIComponent(store.project.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: store.project, setActive: true })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            store.projects = data.state?.projects || store.projects;
            store.project = clone(data.project);
            store.dirty = false;
            emit('saved');
            return data.project;
        } finally {
            store.saving = false;
            emit('ui');
        }
    }

    async function createNewProject(name = 'New Credit Sequence') {
        const engine = window.StreamPulseCreditSuiteEngine;
        const fresh = engine.normalizeProject({
            name,
            blocks: [
                { id: `blk-${Date.now()}-1`, type: 'featured', presentation: 'card', title: name.toUpperCase(), subtitle: 'Opening Card', duration: 4 },
                { id: `blk-${Date.now()}-2`, type: 'role-split', presentation: 'crawl', title: 'Credits', rows: [{ id: 'r1', role: 'Director', name: 'Your Name', checked: true }] }
            ]
        });
        const res = await fetch('/api/credit-suite/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: fresh, createNew: true, setActive: true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create failed');
        store.projects = data.state.projects;
        store.activeProjectId = data.project.id;
        store.project = clone(data.project);
        store.dirty = false;
        store.undoStack = [];
        store.redoStack = [];
        savePrefs({ activeProjectId: data.project.id });
        store.selection = data.project.blocks?.[0]
            ? { kind: 'block', id: data.project.blocks[0].id, trackId: null }
            : { kind: null, id: null, trackId: null };
        emit('project-switched');
        return data.project;
    }

    async function duplicateCurrentProject() {
        if (!store.project) return null;
        const res = await fetch(`/api/credit-suite/projects/${encodeURIComponent(store.project.id)}/duplicate`, {
            method: 'POST'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Duplicate failed');
        store.projects = data.state.projects;
        await selectProject(data.project.id);
        return data.project;
    }

    async function deleteCurrentProject() {
        if (!store.project) return null;
        const res = await fetch(`/api/credit-suite/projects/${encodeURIComponent(store.project.id)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed');
        store.projects = data.state.projects;
        await selectProject(data.state.activeProjectId || store.projects[0]?.id);
        return data.state;
    }

    async function saveTheme(theme, { createNew = false } = {}) {
        const res = await fetch('/api/credit-suite/themes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme, createNew })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save theme');
        store.themes = data.themes || store.themes;
        emit('ui');
        return data.theme;
    }

    async function updateTheme(id, theme) {
        const res = await fetch(`/api/credit-suite/themes/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update theme');
        store.themes = data.themes || store.themes;
        emit('ui');
        return data.theme;
    }

    async function deleteTheme(id) {
        const res = await fetch(`/api/credit-suite/themes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete theme');
        store.themes = data.themes || store.themes;
        emit('ui');
        return store.themes;
    }

    async function resetThemes() {
        const res = await fetch('/api/credit-suite/themes/reset', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to restore themes');
        store.themes = data.themes || store.themes;
        emit('ui');
        return store.themes;
    }

    async function pullDataSource(block) {
        const res = await fetch('/api/credit-suite/data-sources/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Data source pull failed');
        return data;
    }

    async function sendRemoteTransport(action, params = {}) {
        const res = await fetch(`/api/credit-suite/${encodeURIComponent(action)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: store.project?.id, ...params })
        });
        return res.json();
    }

    async function startExport(opts) {
        if (!store.project) return null;
        if (store.dirty) await saveProject();
        const res = await fetch('/api/credit-suite/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: store.project.id, ...opts })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Export failed to start');
        store.activeExportJob = data.job;
        emit('export');
        return data.job;
    }

    async function cancelExport() {
        if (!store.activeExportJob?.id) return;
        const res = await fetch(`/api/credit-suite/export/${encodeURIComponent(store.activeExportJob.id)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.job) store.activeExportJob = data.job;
        emit('export');
    }

    async function refreshAssets() {
        try {
            const res = await fetch('/api/custom-overlays/assets');
            if (res.ok) {
                const aData = await res.json();
                store.assets = Array.isArray(aData) ? aData : (aData.assets || []);
            }
        } catch {}
    }

    function connectWs() {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}`);
        store.ws = ws;
        ws.onmessage = ev => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'credit-suite-export-progress' && msg.data) {
                    if (!store.activeExportJob || store.activeExportJob.id === msg.data.id) {
                        store.activeExportJob = msg.data;
                        emit('export');
                    }
                } else if (msg.type === 'variables-update') {
                    fetch('/api/variables')
                        .then(r => r.ok ? r.json() : null)
                        .then(d => {
                            if (d) {
                                store.variablesMap = flattenVariables(d);
                                emit('variables');
                            }
                        })
                        .catch(() => {});
                }
            } catch {}
        };
        ws.onclose = () => {
            setTimeout(() => {
                if (store.ws === ws) connectWs();
            }, 3500);
        };
    }

    return {
        store,
        subscribe,
        emit,
        mutateProject,
        undo,
        redo,
        setSelection,
        toggleClipSelection,
        setClipSelectionSet,
        setOutlinerTab,
        setInspectorTab,
        setBackdrop,
        setShowGuides,
        setTimelineZoom,
        setSolved,
        getSelectedBlock,
        getSelectedClip,
        loadInitial,
        selectProject,
        saveProject,
        createNewProject,
        duplicateCurrentProject,
        deleteCurrentProject,
        saveTheme,
        updateTheme,
        deleteTheme,
        resetThemes,
        pullDataSource,
        sendRemoteTransport,
        startExport,
        cancelExport,
        refreshAssets,
        connectWs
    };
}
