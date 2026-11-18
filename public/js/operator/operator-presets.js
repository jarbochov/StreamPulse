'use strict';

import { esc, toast } from '../shared/client-core.js';
import { listEnabledModules } from './operator-registry.js';
import {
    activateProfileOnServer,
    createProfileOnServer,
    deleteProfileOnServer,
    getCurrentProfile,
    importProfilesOnServer,
    operatorState,
    refreshOperatorProfiles,
    saveProfileToServer
} from './operator-state.js';

function buildDockUrl(profileId, dockMode = 'show') {
    const base = `${location.origin}/operator.html?profile=${encodeURIComponent(profileId)}&dock=1`;
    if (dockMode === 'show') return `${base}&lock=show`;
    if (dockMode === 'layout') return `${base}&lock=layout`;
    return base;
}

const DOCK_MODE_LABELS = {
    show: 'Read-Only Show Dock',
    layout: 'Layout Locked Dock',
    none: 'Editable Dock'
};

export function openCustomizeTabsModal(onApplied) {
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    const prof = getCurrentProfile();
    if (!modal || !titleEl || !bodyEl || !footEl || !prof) return;

    const allEnabled = listEnabledModules(operatorState.status, prof, { includeHidden: true });
    const hiddenSet = new Set((prof.tabs?.hidden || []).map(t => String(t).toLowerCase()));

    titleEl.textContent = `Customize Tabs · ${prof.name}`;
    bodyEl.innerHTML = `
        <p style="margin:0;font-size:.82rem;color:var(--text-muted);">
            Choose which enabled modules show as top tabs in this preset. Disabled modules in System Config are automatically hidden.
        </p>
        <div class="op-tab-chips">
            ${allEnabled.map(mod => `
                <label class="op-tab-chip">
                    <input type="checkbox" data-custom-tab="${esc(mod.id)}" ${mod.alwaysVisible || !hiddenSet.has(mod.id) ? 'checked' : ''} ${mod.alwaysVisible ? 'disabled' : ''}>
                    ${mod.iconSvg || ''}
                    <span>${esc(mod.label)}</span>
                </label>`).join('')}
        </div>`;
    footEl.innerHTML = `
        <button type="button" class="op-btn sm" data-modal-close="1">Cancel</button>
        <button type="button" class="op-btn sm primary" data-tabs-save="1">Save Tabs</button>`;

    const cleanup = () => {
        footEl.removeEventListener('click', onFoot);
        modal.hidden = true;
    };
    const onFoot = async e => {
        if (e.target.closest('[data-modal-close]')) {
            cleanup();
            return;
        }
        if (e.target.closest('[data-tabs-save]')) {
            const nextHidden = [];
            bodyEl.querySelectorAll('[data-custom-tab]').forEach(chk => {
                if (!chk.disabled && !chk.checked) nextHidden.push(chk.dataset.customTab);
            });
            await saveProfileToServer({ ...prof, tabs: { hidden: nextHidden } });
            cleanup();
            onApplied?.();
            toast('Updated preset tabs', 'success');
        }
    };
    footEl.addEventListener('click', onFoot);
    modal.hidden = false;
}

export async function openPresetsModal(onChanged) {
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    if (!modal || !titleEl || !bodyEl || !footEl) return;

    try { await refreshOperatorProfiles(); } catch { /* keep cached list */ }

    const selectedDockModes = new Map();
    const cleanupRef = { fn: null };
    const close = () => {
        cleanupRef.fn?.();
        modal.hidden = true;
    };

    const draw = () => {
        cleanupRef.fn?.();
        const cur = getCurrentProfile();
        const profiles = operatorState.profiles || [];
        titleEl.textContent = 'Operator Presets & Import/Export';
        bodyEl.innerHTML = `
            <div class="op-field">
                <label>Saved Server Presets (${profiles.length})</label>
                <div class="op-picker-list">
                    ${profiles.map(p => {
                        const isActive = p.id === cur?.id;
                        const dockMode = selectedDockModes.get(p.id) || 'show';
                        const dockUrl = buildDockUrl(p.id, dockMode);
                        return `
                        <article class="op-preset-card ${isActive ? 'is-active' : ''}" data-preset-card="${esc(p.id)}">
                            <div class="op-panel-row">
                                <div class="op-picker-row-info">
                                    <div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;">
                                        <strong>${esc(p.name)}</strong>
                                        ${isActive ? '<span class="op-pill is-ok">Active</span>' : ''}
                                    </div>
                                    <span>${p.board?.cards?.length || 0} cards · ${p.overlays?.length || 0} overlays · ID: ${esc(p.id)}</span>
                                </div>
                                <div class="op-btn-row">
                                    ${isActive ? '' : `<button type="button" class="op-btn sm primary" data-pr-activate="${esc(p.id)}">Activate</button>`}
                                    <button type="button" class="op-btn sm" data-pr-rename="${esc(p.id)}">Rename</button>
                                    ${profiles.length > 1
                                        ? `<button type="button" class="op-btn sm danger" data-pr-delete="${esc(p.id)}">Delete</button>`
                                        : `<button type="button" class="op-btn sm danger" data-pr-reset="${esc(p.id)}" title="Clear cards and added overlays from this sole preset">Reset</button>`}
                                </div>
                            </div>
                            <div class="op-preset-dock-row">
                                <div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;">
                                    <span class="op-preset-dock-label">OBS Dock</span>
                                    <select class="op-preset-dock-select" data-pr-dock-mode="${esc(p.id)}" aria-label="OBS Dock lock mode for ${esc(p.name)}">
                                        <option value="show"${dockMode === 'show' ? ' selected' : ''}>Read-Only Show (Playback Only)</option>
                                        <option value="layout"${dockMode === 'layout' ? ' selected' : ''}>Layout Locked (Inputs Editable)</option>
                                        <option value="none"${dockMode === 'none' ? ' selected' : ''}>Full Editable Dock</option>
                                    </select>
                                </div>
                                <div class="op-btn-row">
                                    <a class="op-btn sm" data-pr-open-dock="${esc(p.id)}" href="${esc(dockUrl)}" target="_blank" rel="noopener">Open ${esc(DOCK_MODE_LABELS[dockMode])}</a>
                                    <button type="button" class="op-btn sm" data-pr-copy-dock="${esc(p.id)}">Copy URL</button>
                                </div>
                            </div>
                        </article>`;
                    }).join('')}
                </div>
            </div>

            <div class="op-preset-card" style="gap:.6rem;">
                <span class="op-section-title">Create New Preset</span>
                <form class="op-inline-group" data-pr-create-form="1">
                    <input type="text" class="op-cell-input" id="op-pr-new-name" placeholder="New preset name (e.g. Podcast, Tournament)…" aria-label="New preset name">
                    <button type="submit" class="op-btn sm primary">Create Blank</button>
                    <button type="button" class="op-btn sm" data-pr-duplicate="1" title="Create preset copying current cards and overlays">Duplicate Active</button>
                </form>
            </div>

            <div class="op-panel-row" style="padding:.2rem .1rem 0;">
                <span style="font-size:.76rem;color:var(--text-muted);">Portability &amp; Backups (auto-included in System Backup ZIPs)</span>
                <div class="op-btn-row">
                    <a class="op-btn sm" href="/api/operator/export?download=1" download="streampulse-operator-profiles.json">Export All JSON</a>
                    <label class="op-btn sm" style="cursor:pointer;">
                        Import JSON
                        <input type="file" accept=".json,application/json" data-pr-import-file="1" hidden>
                    </label>
                </div>
            </div>`;
        footEl.innerHTML = '<button type="button" class="op-btn sm primary" data-modal-close="1">Done</button>';

        const onBodyClick = async e => {
            try {
                const act = e.target.closest('[data-pr-activate]');
                if (act) {
                    await activateProfileOnServer(act.dataset.prActivate);
                    onChanged?.();
                    draw();
                    return;
                }
                const copyDock = e.target.closest('[data-pr-copy-dock]');
                if (copyDock) {
                    const pid = copyDock.dataset.prCopyDock;
                    const mode = selectedDockModes.get(pid) || 'show';
                    const url = buildDockUrl(pid, mode);
                    try {
                        await navigator.clipboard.writeText(url);
                        toast(`Copied ${DOCK_MODE_LABELS[mode]} URL`, 'success');
                    } catch {
                        toast(url, 'info');
                    }
                    return;
                }
                const ren = e.target.closest('[data-pr-rename]');
                if (ren) {
                    const target = profiles.find(x => x.id === ren.dataset.prRename);
                    if (!target) return;
                    const nextName = window.prompt('Preset name:', target.name);
                    const clean = String(nextName || '').trim();
                    if (!clean) return;
                    await saveProfileToServer({ ...target, name: clean });
                    onChanged?.();
                    draw();
                    return;
                }
                const rst = e.target.closest('[data-pr-reset]');
                if (rst) {
                    const target = profiles.find(x => x.id === rst.dataset.prReset);
                    if (!target || !confirm(`Reset preset "${target.name}" to an empty board?`)) return;
                    await saveProfileToServer({ ...target, board: { columns: target.board?.columns || 3, cards: [] }, overlays: [], tabs: { hidden: [] } });
                    onChanged?.();
                    draw();
                    return;
                }
                const del = e.target.closest('[data-pr-delete]');
                if (del) {
                    const target = profiles.find(x => x.id === del.dataset.prDelete);
                    if (!confirm(`Delete preset "${target?.name || del.dataset.prDelete}"?`)) return;
                    await deleteProfileOnServer(del.dataset.prDelete);
                    toast(`Deleted "${target?.name || del.dataset.prDelete}"`, 'success');
                    onChanged?.();
                    draw();
                    return;
                }
                if (e.target.closest('[data-pr-duplicate]') && cur) {
                    const customName = (document.getElementById('op-pr-new-name')?.value || '').trim();
                    const name = customName || `${cur.name} Copy`;
                    await createProfileOnServer({
                        name,
                        board: structuredClone(cur.board),
                        overlays: [...(cur.overlays || [])],
                        tabs: structuredClone(cur.tabs || { hidden: [] })
                    }, { activate: true });
                    onChanged?.();
                    draw();
                }
            } catch (err) {
                toast(err.message || 'Preset update failed', 'error');
            }
        };

        const onBodySubmit = async e => {
            const form = e.target.closest('[data-pr-create-form]');
            if (!form) return;
            e.preventDefault();
            try {
                const input = document.getElementById('op-pr-new-name');
                const name = (input?.value || '').trim();
                if (!name) {
                    toast('Enter a preset name first', 'error');
                    input?.focus();
                    return;
                }
                await createProfileOnServer({ name, board: { columns: 3, cards: [] }, overlays: [], tabs: { hidden: [] } }, { activate: true });
                onChanged?.();
                draw();
            } catch (err) {
                toast(err.message || 'Could not create preset', 'error');
            }
        };

        const onBodyChange = async e => {
            const modeSel = e.target.closest('[data-pr-dock-mode]');
            if (modeSel) {
                const pid = modeSel.dataset.prDockMode;
                const mode = modeSel.value;
                selectedDockModes.set(pid, mode);
                const link = bodyEl.querySelector(`[data-pr-open-dock="${CSS.escape(pid)}"]`);
                if (link) {
                    link.href = buildDockUrl(pid, mode);
                    link.textContent = `Open ${DOCK_MODE_LABELS[mode]}`;
                }
                return;
            }
            const fileInput = e.target.closest('[data-pr-import-file]');
            if (!fileInput || !fileInput.files?.[0]) return;
            try {
                const text = await fileInput.files[0].text();
                const parsed = JSON.parse(text);
                const replace = confirm('Merge into existing presets?\n\nClick OK to Merge, or Cancel to Replace all presets.');
                const res = await importProfilesOnServer(parsed, replace ? 'merge' : 'replace');
                toast(`Imported ${res.importedCount} preset(s)`, 'success');
                onChanged?.();
                draw();
            } catch (err) {
                toast(err.message || 'Invalid JSON file', 'error');
            }
        };

        const onFootClick = e => {
            if (e.target.closest('[data-modal-close]')) close();
        };

        bodyEl.addEventListener('click', onBodyClick);
        bodyEl.addEventListener('submit', onBodySubmit);
        bodyEl.addEventListener('change', onBodyChange);
        footEl.addEventListener('click', onFootClick);
        cleanupRef.fn = () => {
            bodyEl.removeEventListener('click', onBodyClick);
            bodyEl.removeEventListener('submit', onBodySubmit);
            bodyEl.removeEventListener('change', onBodyChange);
            footEl.removeEventListener('click', onFootClick);
        };
    };

    draw();
    modal.hidden = false;
}
