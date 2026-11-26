import { createCreditSuiteState } from './credit-suite-state.js';
import { mountCreditSuiteBlocks } from './credit-suite-blocks.js';
import { mountCreditSuiteStage } from './credit-suite-stage.js';
import { mountCreditSuiteTimeline } from './credit-suite-timeline.js';
import { mountCreditSuiteInspector } from './credit-suite-inspector.js';
import { mountCreditSuiteContent } from './credit-suite-content.js';

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function initCreditSuiteStudio() {
    const state = createCreditSuiteState();
    let timelineApi = null;

    const stageApi = mountCreditSuiteStage({
        state,
        onTimeTick: frame => {
            timelineApi?.updatePlayhead(frame.timeSec);
        }
    });

    const blocksApi = mountCreditSuiteBlocks({
        state,
        seekToTime: t => stageApi.seek(t)
    });

    timelineApi = mountCreditSuiteTimeline({
        state,
        stage: stageApi,
        blocksApi
    });

    mountCreditSuiteInspector({ state, stage: stageApi });
    const contentApi = mountCreditSuiteContent({ state });

    const studioShell = document.getElementById('cs-studio-shell');
    const contentView = document.getElementById('cs-content-view');
    const mainViewBtns = document.querySelectorAll('[data-cs-main-view]');
    mainViewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.setStudioView(btn.dataset.csMainView);
        });
    });

    let lastRenderedView = '';
    function syncMainView(force = false) {
        const view = state.store.studioView;
        if (!force && view === lastRenderedView) return;
        lastRenderedView = view;
        const isContent = view === 'content';
        if (studioShell) studioShell.style.display = isContent ? 'none' : 'flex';
        if (contentView) contentView.style.display = isContent ? 'block' : 'none';
        mainViewBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.csMainView === view);
        });
        if (isContent) {
            stageApi.pause();
            contentApi.render();
        } else {
            stageApi.flushIfStale?.();
        }
    }

    const projSelect = document.getElementById('cs-project-select');
    const dirtyPill = document.getElementById('cs-dirty-pill');
    const saveBtn = document.getElementById('cs-btn-save');
    const undoBtn = document.getElementById('cs-btn-undo');
    const redoBtn = document.getElementById('cs-btn-redo');
    const newBtn = document.getElementById('cs-btn-new');
    const moreBtn = document.getElementById('cs-btn-proj-more');
    const overflowMenu = document.getElementById('cs-proj-overflow-menu');
    const dupBtn = document.getElementById('cs-btn-dup');
    const delBtn = document.getElementById('cs-btn-del');
    const exportBtn = document.getElementById('cs-btn-open-export');
    const jsonExportBtn = document.getElementById('cs-btn-json-export');
    const jsonImportInput = document.getElementById('cs-json-import');
    const jsonImportBtn = document.getElementById('cs-btn-json-import');

    function closeOverflowMenu() {
        overflowMenu?.classList.remove('open');
        moreBtn?.setAttribute('aria-expanded', 'false');
    }

    moreBtn?.addEventListener('click', ev => {
        ev.stopPropagation();
        const isOpen = overflowMenu?.classList.toggle('open');
        moreBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', ev => {
        if (overflowMenu?.classList.contains('open') && !ev.target.closest('.cs-overflow-wrap')) {
            closeOverflowMenu();
        }
    });

    let lastProjSelectSig = '';
    function syncTopBar() {
        const s = state.store;
        if (projSelect) {
            const sig = `${s.project?.id || ''}|${(s.projects || []).map(p => `${p.id}:${p.name}`).join('|')}`;
            if (sig !== lastProjSelectSig) {
                lastProjSelectSig = sig;
                projSelect.innerHTML = (s.projects || []).map(p =>
                    `<option value="${esc(p.id)}" ${p.id === s.project?.id ? 'selected' : ''}>${esc(p.name)}</option>`
                ).join('');
            }
        }
        if (dirtyPill) {
            if (s.saving) {
                dirtyPill.textContent = 'Saving...';
                dirtyPill.className = 'cs-pill dirty';
            } else if (s.dirty) {
                dirtyPill.textContent = 'Unsaved Changes';
                dirtyPill.className = 'cs-pill dirty';
            } else {
                dirtyPill.textContent = 'Saved';
                dirtyPill.className = 'cs-pill saved';
            }
        }
        if (undoBtn) undoBtn.disabled = !s.undoStack.length;
        if (redoBtn) redoBtn.disabled = !s.redoStack.length;
        if (delBtn) delBtn.disabled = (s.projects || []).length <= 1;
    }

    projSelect?.addEventListener('change', () => {
        if (state.store.dirty && !window.confirm('Discard unsaved changes and switch project?')) {
            lastProjSelectSig = '';
            syncTopBar();
            return;
        }
        state.selectProject(projSelect.value);
    });

    saveBtn?.addEventListener('click', () => {
        state.saveProject().catch(err => window.alert(err.message));
    });
    undoBtn?.addEventListener('click', () => state.undo());
    redoBtn?.addEventListener('click', () => state.redo());
    exportBtn?.addEventListener('click', () => {
        if (state.store.studioView !== 'studio') state.setStudioView('studio');
        state.setInspectorTab('export');
    });

    newBtn?.addEventListener('click', () => {
        if (state.store.dirty && !window.confirm('Discard unsaved changes and create a new project?')) return;
        const name = window.prompt('New Credit Suite project name:', 'New Credit Sequence');
        if (name && name.trim()) {
            state.createNewProject(name.trim()).catch(err => window.alert(err.message));
        }
    });

    dupBtn?.addEventListener('click', () => {
        closeOverflowMenu();
        state.duplicateCurrentProject().catch(err => window.alert(err.message));
    });

    delBtn?.addEventListener('click', () => {
        closeOverflowMenu();
        if (!state.store.project) return;
        if (!window.confirm(`Delete project "${state.store.project.name}"?`)) return;
        state.deleteCurrentProject().catch(err => window.alert(err.message));
    });

    jsonExportBtn?.addEventListener('click', () => {
        closeOverflowMenu();
        if (!state.store.project) return;
        const blob = new Blob([JSON.stringify(state.store.project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.store.project.id || 'credit-suite'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    jsonImportBtn?.addEventListener('click', () => {
        closeOverflowMenu();
        if (state.store.dirty && !window.confirm('Discard unsaved changes and import a JSON project?')) return;
        jsonImportInput?.click();
    });
    jsonImportInput?.addEventListener('change', () => {
        const file = jsonImportInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => {
            window.alert('Import failed: could not read file');
            jsonImportInput.value = '';
        };
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('JSON file must contain a Credit Suite project object');
                }
                const engine = window.StreamPulseCreditSuiteEngine;
                const norm = engine.normalizeProject({ ...parsed, id: `${parsed.id || 'imported'}-${Date.now().toString(36)}` });
                const res = await fetch('/api/credit-suite/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: norm, createNew: true, setActive: true })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Import failed');
                state.store.projects = data.state.projects;
                await state.selectProject(data.project.id);
            } catch (err) {
                window.alert(`Import failed: ${err.message}`);
            }
            jsonImportInput.value = '';
        };
        reader.readAsText(file);
    });

    function isAnyModalOpen() {
        return Boolean(
            document.querySelector('.mp-backdrop, .ip-backdrop, .cs-modal-backdrop:not([hidden])')
            || document.getElementById('cs-bulk-modal')?.classList.contains('open')
        );
    }

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', ev => {
        const tag = (ev.target?.tagName || '').toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target?.isContentEditable;
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') {
            ev.preventDefault();
            state.saveProject().catch(err => window.alert(err.message));
            return;
        }
        if (isAnyModalOpen()) {
            if (ev.key === 'Escape') {
                document.getElementById('cs-bulk-modal')?.classList.remove('open');
            }
            return;
        }
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !isTyping) {
            ev.preventDefault();
            if (ev.shiftKey) state.redo();
            else state.undo();
            return;
        }
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'y' && !isTyping) {
            ev.preventDefault();
            state.redo();
            return;
        }
        if (isTyping || state.store.studioView !== 'studio') return;
        const isInteractiveTarget = tag === 'button' || tag === 'a' || ev.target?.getAttribute?.('role') === 'button';
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
            if (state.store.selectedClipIds && state.store.selectedClipIds.size > 1) {
                ev.preventDefault();
                const ids = new Set(state.store.selectedClipIds);
                state.mutateProject(p => {
                    for (const tr of p.tracks) {
                        tr.clips = tr.clips.filter(c => !ids.has(c.id));
                    }
                }, { reason: 'project-structure' });
                state.setSelection(null, null);
                return;
            }
            const sel = state.store.selection;
            if (sel.kind === 'block' && sel.id) {
                ev.preventDefault();
                state.mutateProject(p => {
                    p.blocks = p.blocks.filter(b => b.id !== sel.id);
                }, { reason: 'project-structure' });
                state.setSelection(null, null);
                return;
            }
            if (sel.kind === 'clip' && sel.id) {
                ev.preventDefault();
                state.mutateProject(p => {
                    for (const tr of p.tracks) {
                        tr.clips = tr.clips.filter(c => c.id !== sel.id);
                    }
                }, { reason: 'project-structure' });
                state.setSelection(null, null);
                return;
            }
        }
        if (ev.code === 'Space' && !isInteractiveTarget) {
            ev.preventDefault();
            stageApi.togglePlay();
        } else if (ev.key === 'ArrowLeft') {
            ev.preventDefault();
            stageApi.pause();
            stageApi.seek(Math.max(0, stageApi.getTime() - (ev.shiftKey ? 5 : 0.5)));
        } else if (ev.key === 'ArrowRight') {
            ev.preventDefault();
            stageApi.pause();
            stageApi.seek(stageApi.getTime() + (ev.shiftKey ? 5 : 0.5));
        }
    });

    window.addEventListener('beforeunload', ev => {
        if (state.store.dirty) {
            ev.preventDefault();
            ev.returnValue = '';
        }
    });

    window.addEventListener('pagehide', () => {
        state.disconnectWs();
        stageApi.destroy();
        timelineApi?.destroy?.();
    });

    state.subscribe(reason => {
        syncTopBar();
        if (reason === 'studio-view' || reason === 'init') {
            syncMainView(reason === 'init');
        }
    });

    state.loadInitial()
        .then(() => {
            syncTopBar();
            syncMainView(true);
            state.connectWs();
        })
        .catch(err => console.error('[Credit Suite Init]', err));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCreditSuiteStudio);
} else {
    initCreditSuiteStudio();
}
