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

    let localMutationSeq = 0;
    let inFlightSave = null;
    let lastUndoGroup = '';
    let lastUndoAt = 0;
    let varFetchTimer = null;

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
        studioView: prefs.studioView === 'content' ? 'content' : 'studio',
        outlinerTab: prefs.outlinerTab === 'tracks' ? 'tracks' : 'blocks',
        inspectorTab: ['selected', 'theme', 'export'].includes(prefs.inspectorTab) ? prefs.inspectorTab : 'selected',
        backdrop: ['checker', 'dark', 'light'].includes(prefs.backdrop) ? prefs.backdrop : 'checker',
        showGuides: prefs.showGuides !== undefined ? Boolean(prefs.showGuides) : true,
        timelineZoom: Number(prefs.timelineZoom) || 18, // px per second
        dirty: false,
        saving: false,
        activeExportJob: null,
        exportOptions: {
            format: 'mp4',
            fps: 'project',
            scale: '1',
            transparent: false,
            chromaColor: '#00ff00'
        },
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

    function findClipTrackId(clipId) {
        for (const tr of (store.project?.tracks || [])) {
            if ((tr.clips || []).some(c => c.id === clipId)) return tr.id;
        }
        return null;
    }

    function reconcileSelection() {
        const p = store.project;
        if (!p) {
            store.selection = { kind: null, id: null, trackId: null };
            store.selectedClipIds = new Set();
            return;
        }
        const existingClipIds = new Set();
        for (const tr of (p.tracks || [])) {
            for (const c of (tr.clips || [])) existingClipIds.add(c.id);
        }
        if (store.selectedClipIds.size) {
            store.selectedClipIds = new Set([...store.selectedClipIds].filter(id => existingClipIds.has(id)));
        }
        const sel = store.selection;
        if (sel.kind === 'block') {
            if (!(p.blocks || []).some(b => b.id === sel.id)) {
                store.selection = { kind: null, id: null, trackId: null };
            }
        } else if (sel.kind === 'clip') {
            const tid = findClipTrackId(sel.id);
            if (!tid) {
                if (store.selectedClipIds.size) {
                    const fallbackId = [...store.selectedClipIds][0];
                    store.selection = { kind: 'clip', id: fallbackId, trackId: findClipTrackId(fallbackId) };
                } else {
                    store.selection = { kind: null, id: null, trackId: null };
                }
            } else if (sel.trackId !== tid) {
                store.selection = { kind: 'clip', id: sel.id, trackId: tid };
            }
        }
    }

    function pushUndoSnapshot(undoGroup = '') {
        if (!store.project) return;
        const now = Date.now();
        if (undoGroup && undoGroup === lastUndoGroup && now - lastUndoAt < 650 && store.undoStack.length) {
            lastUndoAt = now;
            return;
        }
        lastUndoGroup = undoGroup;
        lastUndoAt = now;
        store.undoStack.push(clone(store.project));
        if (store.undoStack.length > 40) store.undoStack.shift();
        store.redoStack = [];
    }

    function mutateProject(mutator, { reason = 'project', recordUndo = true, undoGroup = '' } = {}) {
        if (!store.project) return;
        if (recordUndo) pushUndoSnapshot(undoGroup);
        mutator(store.project);
        reconcileSelection();
        localMutationSeq++;
        store.dirty = true;
        emit(reason);
    }

    function undo() {
        if (!store.undoStack.length || !store.project) return false;
        lastUndoGroup = '';
        store.redoStack.push(clone(store.project));
        store.project = store.undoStack.pop();
        reconcileSelection();
        localMutationSeq++;
        store.dirty = true;
        emit('project-structure');
        return true;
    }

    function redo() {
        if (!store.redoStack.length || !store.project) return false;
        lastUndoGroup = '';
        store.undoStack.push(clone(store.project));
        store.project = store.redoStack.pop();
        reconcileSelection();
        localMutationSeq++;
        store.dirty = true;
        emit('project-structure');
        return true;
    }

    function setSelection(kind, id, trackId = null) {
        const resolvedTrackId = kind === 'clip' ? (trackId || findClipTrackId(id)) : null;
        store.selection = { kind, id, trackId: resolvedTrackId };
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
            const primaryTrackId = primary === id ? (trackId || findClipTrackId(id)) : findClipTrackId(primary);
            store.selection = { kind: 'clip', id: primary, trackId: primaryTrackId };
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
            store.selection = { kind: 'clip', id: first, trackId: findClipTrackId(first) };
        }
        emit('selection');
    }

    function setStudioView(view) {
        const next = view === 'content' ? 'content' : 'studio';
        if (store.studioView === next) return;
        store.studioView = next;
        savePrefs({ studioView: store.studioView });
        emit('studio-view');
    }

    function setOutlinerTab(tab) {
        store.outlinerTab = tab === 'tracks' ? 'tracks' : 'blocks';
        savePrefs({ outlinerTab: store.outlinerTab });
        emit('outliner-ui');
    }

    function setInspectorTab(tab) {
        store.inspectorTab = ['selected', 'theme', 'export'].includes(tab) ? tab : 'selected';
        savePrefs({ inspectorTab: store.inspectorTab });
        emit('inspector-tab');
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
        if (data?.values && typeof data.values === 'object') {
            for (const [k, val] of Object.entries(data.values)) {
                out[k] = val ?? '';
                out[`var.${k}`] = val ?? '';
            }
        }
        const list = Array.isArray(data?.variables) ? data.variables : Object.values(data?.variables || {});
        for (const v of list) {
            if (!v) continue;
            const key = v.key || v.name;
            if (!key) continue;
            const val = v.value ?? '';
            out[key] = val;
            out[`var.${key}`] = val;
            if (v.name && v.name !== key) {
                out[v.name] = val;
                out[`var.${v.name}`] = val;
            }
        }
        const sets = Array.isArray(data?.sets) ? data.sets : Object.values(data?.sets || {});
        for (const s of sets) {
            if (!s || !s.id) continue;
            const roster = Array.isArray(s.roster) ? s.roster : (Array.isArray(s.entries) ? s.entries : []);
            const slot0 = s.slots?.[0];
            const activeId = typeof slot0 === 'string' ? slot0 : (slot0?.entryId || s.activeEntry || '');
            const entry = roster.find(e => e.id === activeId) || roster[0];
            if (entry?.values) {
                for (const [k, val] of Object.entries(entry.values)) {
                    out[`set.${s.id}.${k}`] = val;
                }
            }
            if (entry?.label) out[`set.${s.id}.label`] = entry.label;
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
        lastUndoGroup = '';
        store.activeProjectId = found.id;
        store.project = clone(found);
        store.dirty = false;
        store.undoStack = [];
        store.redoStack = [];
        store.selectedClipIds = new Set();
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
        if (!store.project) return null;
        if (inFlightSave) return inFlightSave;
        const seqAtStart = localMutationSeq;
        const projSnapshot = clone(store.project);
        store.saving = true;
        emit('save-status');
        inFlightSave = (async () => {
            try {
                const res = await fetch(`/api/credit-suite/projects/${encodeURIComponent(projSnapshot.id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: projSnapshot, setActive: true })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Save failed');
                store.projects = data.state?.projects || store.projects;
                if (localMutationSeq === seqAtStart && store.project?.id === data.project?.id) {
                    store.project = clone(data.project);
                    store.dirty = false;
                }
                emit('saved');
                return data.project;
            } finally {
                store.saving = false;
                inFlightSave = null;
                emit('save-status');
            }
        })();
        return inFlightSave;
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
        lastUndoGroup = '';
        store.projects = data.state.projects;
        store.activeProjectId = data.project.id;
        store.project = clone(data.project);
        store.dirty = false;
        store.undoStack = [];
        store.redoStack = [];
        store.selectedClipIds = new Set();
        savePrefs({ activeProjectId: data.project.id });
        store.selection = data.project.blocks?.[0]
            ? { kind: 'block', id: data.project.blocks[0].id, trackId: null }
            : { kind: null, id: null, trackId: null };
        emit('project-switched');
        return data.project;
    }

    async function duplicateCurrentProject() {
        if (!store.project) return null;
        if (store.dirty) await saveProject();
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
        emit('themes');
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
        emit('themes');
        return data.theme;
    }

    async function deleteTheme(id) {
        const res = await fetch(`/api/credit-suite/themes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete theme');
        store.themes = data.themes || store.themes;
        emit('themes');
        return store.themes;
    }

    async function resetThemes() {
        const res = await fetch('/api/credit-suite/themes/reset', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to restore themes');
        store.themes = data.themes || store.themes;
        emit('themes');
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Transport "${action}" failed`);
        return data;
    }

    async function startExport(opts) {
        if (!store.project) return null;
        if (store.dirty || inFlightSave) await saveProject();
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
        const data = await res.json().catch(() => ({}));
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
        if (store.ws && (store.ws.readyState === WebSocket.OPEN || store.ws.readyState === WebSocket.CONNECTING)) return;
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
                    clearTimeout(varFetchTimer);
                    varFetchTimer = setTimeout(() => {
                        fetch('/api/variables')
                            .then(r => r.ok ? r.json() : null)
                            .then(d => {
                                if (d) {
                                    store.variablesMap = flattenVariables(d);
                                    emit('variables');
                                }
                            })
                            .catch(() => {});
                    }, 220);
                }
            } catch {}
        };
        ws.onclose = () => {
            if (store.ws !== ws) return;
            store.ws = null;
            setTimeout(() => {
                if (!store.ws) connectWs();
            }, 3500);
        };
    }

    function disconnectWs() {
        clearTimeout(varFetchTimer);
        const ws = store.ws;
        store.ws = null;
        if (ws) {
            ws.onclose = null;
            try { ws.close(); } catch {}
        }
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
        setStudioView,
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
        connectWs,
        disconnectWs
    };
}
