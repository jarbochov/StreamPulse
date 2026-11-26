import { createCreditSuiteState } from './credit-suite-state.js';
import { mountCreditSuiteBlocks } from './credit-suite-blocks.js';
import { mountCreditSuiteStage } from './credit-suite-stage.js';
import { mountCreditSuiteTimeline } from './credit-suite-timeline.js';
import { mountCreditSuiteInspector } from './credit-suite-inspector.js';

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDur(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
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

    const projSelect = document.getElementById('cs-project-select');
    const dirtyPill = document.getElementById('cs-dirty-pill');
    const durPill = document.getElementById('cs-duration-pill');
    const speedPill = document.getElementById('cs-speed-pill');
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

    moreBtn?.addEventListener('click', ev => {
        ev.stopPropagation();
        const isOpen = overflowMenu?.classList.toggle('open');
        moreBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', ev => {
        if (overflowMenu?.classList.contains('open') && !ev.target.closest('.cs-overflow-wrap')) {
            overflowMenu.classList.remove('open');
            moreBtn?.setAttribute('aria-expanded', 'false');
        }
    });

    function syncTopBar() {
        const s = state.store;
        if (projSelect) {
            projSelect.innerHTML = (s.projects || []).map(p =>
                `<option value="${esc(p.id)}" ${p.id === s.project?.id ? 'selected' : ''}>${esc(p.name)}</option>`
            ).join('');
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
        if (durPill && s.solved) {
            durPill.textContent = `Duration ${fmtDur(s.solved.totalDurationSec)}`;
        }
        if (speedPill && s.solved) {
            speedPill.textContent = `${Math.round(s.solved.effectiveSpeed || 0)} px/s`;
        }
        if (undoBtn) undoBtn.disabled = !s.undoStack.length;
        if (redoBtn) redoBtn.disabled = !s.redoStack.length;
        if (delBtn) delBtn.disabled = (s.projects || []).length <= 1;
    }

    projSelect?.addEventListener('change', () => {
        if (state.store.dirty && !window.confirm('Discard unsaved changes and switch project?')) {
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
    exportBtn?.addEventListener('click', () => state.setInspectorTab('export'));

    newBtn?.addEventListener('click', () => {
        const name = window.prompt('New Credit Suite project name:', 'New Credit Sequence');
        if (name && name.trim()) {
            state.createNewProject(name.trim()).catch(err => window.alert(err.message));
        }
    });

    dupBtn?.addEventListener('click', () => {
        state.duplicateCurrentProject().catch(err => window.alert(err.message));
    });

    delBtn?.addEventListener('click', () => {
        if (!state.store.project) return;
        if (!window.confirm(`Delete project "${state.store.project.name}"?`)) return;
        state.deleteCurrentProject().catch(err => window.alert(err.message));
    });

    jsonExportBtn?.addEventListener('click', () => {
        if (!state.store.project) return;
        const blob = new Blob([JSON.stringify(state.store.project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.store.project.id || 'credit-suite'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    jsonImportBtn?.addEventListener('click', () => jsonImportInput?.click());
    jsonImportInput?.addEventListener('change', () => {
        const file = jsonImportInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(reader.result);
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

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', ev => {
        const tag = (ev.target?.tagName || '').toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target?.isContentEditable;
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') {
            ev.preventDefault();
            state.saveProject().catch(err => window.alert(err.message));
            return;
        }
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !isTyping) {
            ev.preventDefault();
            if (ev.shiftKey) state.redo();
            else state.undo();
            return;
        }
        if (isTyping) return;
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
            const sel = state.store.selection;
            if (sel.kind === 'block' && sel.id) {
                ev.preventDefault();
                state.mutateProject(p => {
                    p.blocks = p.blocks.filter(b => b.id !== sel.id);
                });
                state.setSelection(null, null);
                return;
            }
            if (sel.kind === 'clip' && sel.id) {
                ev.preventDefault();
                state.mutateProject(p => {
                    for (const tr of p.tracks) {
                        tr.clips = tr.clips.filter(c => c.id !== sel.id);
                    }
                });
                state.setSelection(null, null);
                return;
            }
        }
        if (ev.code === 'Space') {
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

    state.subscribe(() => syncTopBar());

    state.loadInitial()
        .then(() => {
            syncTopBar();
            state.connectWs();
        })
        .catch(err => console.error('[Credit Suite Init]', err));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCreditSuiteStudio);
} else {
    initCreditSuiteStudio();
}
