'use strict';

import { esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';
import {
    createRunbookOnServer,
    deleteRunbookOnServer,
    duplicateRunbookOnServer,
    getCurrentProfileId,
    isEditLocked,
    operatorState,
    refreshRunbooks,
    resetRunbookOnServer,
    saveRunbookToServer,
    toggleRunbookItemOnServer
} from './operator-state.js';

const ACTIVE_RUNBOOK_KEY = 'streampulse_op_active_runbook';
const NOTE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
const EDIT_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

function buildRunbookUrl(id, { dock = false, bare = false } = {}) {
    const url = new URL('/operator.html', location.origin);
    const profId = getCurrentProfileId();
    if (profId) url.searchParams.set(dock ? 'profile' : 'preset', profId);
    if (dock) url.searchParams.set('dock', '1');
    if (bare) url.searchParams.set('bare', '1');
    url.hash = `runbook=${encodeURIComponent(id)}`;
    return url.toString();
}

async function copyUrl(url, label) {
    try {
        await navigator.clipboard.writeText(url);
        toast(`Copied ${label}`, 'success');
    } catch {
        toast(url, 'info');
    }
}

export function getFocusedRunbookIdFromHash() {
    const raw = (location.hash || '').replace(/^#/, '').trim();
    if (!raw) return '';
    if (raw.startsWith('runbook=')) return decodeURIComponent(raw.slice('runbook='.length)).trim();
    const match = raw.match(/(?:^|&)runbook=([^&]+)/i);
    return match ? decodeURIComponent(match[1]).trim() : '';
}

function getRunbookById(id) {
    const list = operatorState.runbooks || [];
    if (id) {
        const exact = list.find(rb => rb.id === id);
        if (exact) return exact;
    }
    return list[0] || null;
}

function taskCounts(items) {
    const tasks = (items || []).filter(i => (i.kind || 'task') === 'task');
    const done = tasks.filter(i => i.done).length;
    const notes = (items || []).filter(i => i.kind === 'note').length;
    return { done, total: tasks.length, notes };
}

function groupIntoSections(items) {
    const indexed = (items || []).map((item, idx) => ({ item, idx }));
    const hasSections = indexed.some(x => x.item.kind === 'section');
    if (!hasSections) return { hasSections: false, groups: [{ section: null, entries: indexed }] };
    const groups = [];
    let current = null;
    for (const entry of indexed) {
        if (entry.item.kind === 'section') {
            current = { section: entry, entries: [] };
            groups.push(current);
        } else {
            if (!current) {
                current = { section: null, entries: [] };
                groups.push(current);
            }
            current.entries.push(entry);
        }
    }
    return { hasSections: true, groups };
}

function renderNoteMarkdown(raw) {
    const src = String(raw ?? '');
    if (window.OverlayShared?.renderMarkdown && window.marked && window.DOMPurify) {
        try {
            const html = window.OverlayShared.renderMarkdown(src);
            const holder = document.createElement('div');
            holder.innerHTML = html;
            holder.querySelectorAll('a[href]').forEach(a => {
                const href = (a.getAttribute('href') || '').trim();
                if (!/^(https?:|mailto:|\/|#)/i.test(href)) {
                    a.removeAttribute('href');
                    return;
                }
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            });
            return holder.innerHTML;
        } catch {
            return esc(src);
        }
    }
    return esc(src);
}

function renderItemRow(rbId, entry, readOnly) {
    const { item, idx } = entry;
    const isNote = item.kind === 'note';
    const isDone = !isNote && Boolean(item.done);
    return `
        <div class="op-rb-item${isNote ? ' is-note' : ''}${isDone ? ' is-done' : ''}" data-rb-item-idx="${idx}" data-rb-id="${esc(rbId)}"${readOnly ? '' : ' draggable="true"'}>
            ${readOnly ? '' : `<span class="op-drag-grip" title="Drag to reorder">${OP_ICONS.grip}</span>`}
            ${isNote
                ? `<span class="op-rb-note-icon" title="Markdown Note">${NOTE_ICON}</span>`
                : `<input type="checkbox" class="op-rb-check" data-rb-toggle="${esc(item.id)}" data-rb-id="${esc(rbId)}" data-rb-idx="${idx}"${isDone ? ' checked' : ''} aria-label="${esc(item.text)}">`}
            ${isNote
                ? `<div class="op-rb-text op-rb-markdown" data-rb-text-idx="${idx}" data-rb-id="${esc(rbId)}" title="${readOnly ? '' : 'Double-click to edit note'}">${renderNoteMarkdown(item.text)}</div>`
                : `<span class="op-rb-text" data-rb-text-idx="${idx}" data-rb-id="${esc(rbId)}" title="${readOnly ? '' : 'Click to toggle or double-click to edit'}">${esc(item.text)}</span>`}
            ${readOnly ? '' : `<div class="op-rb-item-actions">
                <button type="button" class="op-icon-btn" data-rb-edit-item="${idx}" data-rb-id="${esc(rbId)}" title="Edit item">${EDIT_ICON}</button>
                <button type="button" class="op-icon-btn danger" data-rb-del="${idx}" data-rb-id="${esc(rbId)}" aria-label="Remove item">&times;</button>
            </div>`}
        </div>`;
}

function renderComposerHtml(rbId, composeKind, readOnly) {
    if (readOnly) return '';
    const isNote = composeKind === 'note';
    const isSec = composeKind === 'section';
    const placeholder = isNote
        ? 'Add a note — Markdown supported (**bold**, *italic*, - lists, [links](https://...), `code`)…'
        : isSec
            ? 'New section heading (e.g. Pre-Show, Live Segment, Raid & Outro)…'
            : 'Add a checkable cue or task…';
    return `
        <form class="op-rb-composer" data-rb-add="${esc(rbId)}">
            <div class="op-rb-composer-row">
                <div class="op-filter-seg" role="group" aria-label="New item type">
                    <button type="button" class="op-filter-btn${composeKind === 'task' ? ' active' : ''}" data-rb-kind="task">Task</button>
                    <button type="button" class="op-filter-btn${composeKind === 'note' ? ' active' : ''}" data-rb-kind="note">Note</button>
                    <button type="button" class="op-filter-btn${composeKind === 'section' ? ' active' : ''}" data-rb-kind="section">Section</button>
                </div>
                ${isNote
                    ? `<textarea class="op-cell-input" data-rb-input rows="3" placeholder="${esc(placeholder)}" style="resize:vertical;min-height:60px;font-family:inherit;"></textarea>`
                    : `<input type="text" class="op-cell-input" data-rb-input placeholder="${esc(placeholder)}" autocomplete="off">`}
                <button type="submit" class="op-btn sm primary">${OP_ICONS.plus} Add</button>
            </div>
        </form>`;
}

function renderRunbookSurface(el, rb, { compact = false, composeKind = 'task', showCardLinks = false } = {}) {
    if (!rb) {
        el.innerHTML = '<div style="font-size:.82rem;color:var(--text-muted);">No runbook selected. Create one to start tracking cues and notes.</div>';
        return;
    }
    const items = Array.isArray(rb.items) ? rb.items : [];
    const { done, total, notes } = taskCounts(items);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const readOnly = isEditLocked();
    const cols = compact ? 1 : (Number(rb.columns) || 1);
    const { hasSections, groups } = groupIntoSections(items);

    const contentHtml = !items.length
        ? '<div class="op-card" style="padding:1.25rem;text-align:center;color:var(--text-muted);font-size:.84rem;">This runbook is empty. Add a <strong>Task</strong>, <strong>Note</strong>, or <strong>Section</strong> below to get started.</div>'
        : hasSections
            ? `<div class="op-rb-grid" style="--rb-cols:${cols};">
                ${groups.map(group => {
                    const secTitle = group.section ? group.section.item.text : 'General';
                    const secIdx = group.section ? group.section.idx : -1;
                    const secTasks = group.entries.filter(e => (e.item.kind || 'task') === 'task');
                    const secDone = secTasks.filter(e => e.item.done).length;
                    return `<section class="op-rb-sec-card" data-rb-sec-idx="${secIdx}" data-rb-id="${esc(rb.id)}">
                        <header class="op-rb-sec-head"${secIdx >= 0 && !readOnly ? ` draggable="true" data-rb-item-idx="${secIdx}" data-rb-id="${esc(rb.id)}"` : ''}>
                            <div class="op-rb-sec-title">
                                ${secIdx >= 0 && !readOnly ? `<span class="op-drag-grip" title="Drag section to reorder">${OP_ICONS.grip}</span>` : ''}
                                <span>${esc(secTitle)}</span>
                                ${secTasks.length ? `<span class="op-pill" style="font-size:.66rem;">${secDone}/${secTasks.length}</span>` : ''}
                            </div>
                            ${secIdx >= 0 && !readOnly ? `<div class="op-btn-row" style="gap:.15rem;">
                                <button type="button" class="op-icon-btn" data-rb-edit-item="${secIdx}" data-rb-id="${esc(rb.id)}" title="Rename section">${EDIT_ICON}</button>
                                <button type="button" class="op-icon-btn danger" data-rb-del="${secIdx}" data-rb-id="${esc(rb.id)}" aria-label="Remove section">&times;</button>
                            </div>` : ''}
                        </header>
                        <div class="op-rb-list" data-rb-drop-zone="${secIdx}">
                            ${group.entries.length
                                ? group.entries.map(e => renderItemRow(rb.id, e, readOnly)).join('')
                                : '<div style="font-size:.76rem;color:var(--text-muted);padding:.25rem .1rem;">Drag items here</div>'}
                        </div>
                    </section>`;
                }).join('')}
            </div>`
            : `<div class="op-rb-grid" style="--rb-cols:${cols};" data-rb-drop-zone="-1">
                ${groups[0].entries.map(e => renderItemRow(rb.id, e, readOnly)).join('')}
            </div>`;

    if (compact) {
        el.innerHTML = `
            <div style="display:grid;gap:.5rem;">
                <div class="op-panel-row" style="flex-wrap:wrap;gap:.35rem;">
                    <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;">
                        ${total > 0 ? `<span class="op-pill ${done === total ? 'is-ok' : ''}">${done} / ${total} tasks</span>` : ''}
                        ${notes > 0 ? `<span class="op-pill">${notes} note${notes === 1 ? '' : 's'}</span>` : ''}
                    </div>
                    <div class="op-btn-row">
                        ${showCardLinks ? `<button type="button" class="op-btn sm" data-rb-copy-link="${esc(rb.id)}" title="Copy dedicated link">Link</button>
                        <button type="button" class="op-btn sm" data-rb-copy-dock="${esc(rb.id)}" title="Copy OBS dock link">Dock</button>` : ''}
                        ${total > 0 ? `<button type="button" class="op-btn sm" data-rb-reset="${esc(rb.id)}">Reset</button>` : ''}
                    </div>
                </div>
                ${total > 0 ? `<div class="op-rb-progress"><div style="width:${pct}%;"></div></div>` : ''}
                ${contentHtml}
                ${renderComposerHtml(rb.id, composeKind, readOnly)}
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="op-rb-shell">
            <div class="op-rb-header">
                <div class="op-rb-title-col">
                    <div class="op-rb-title-row">
                        <h2>${esc(rb.name)}</h2>
                        ${total > 0 ? `<span class="op-pill ${done === total ? 'is-ok' : ''}">${done} / ${total} tasks</span>` : ''}
                        ${notes > 0 ? `<span class="op-pill">${notes} note${notes === 1 ? '' : 's'}</span>` : ''}
                    </div>
                    ${rb.description ? `<span style="font-size:.78rem;color:var(--text-muted);">${esc(rb.description)}</span>` : ''}
                    ${total > 0 ? `<div class="op-rb-progress" style="min-width:180px;max-width:340px;"><div style="width:${pct}%;"></div></div>` : ''}
                </div>
                <div class="op-btn-row" style="flex-wrap:wrap;">
                    ${readOnly ? '' : `<div class="op-filter-seg" role="group" aria-label="Runbook columns">
                        ${[1, 2, 3].map(n => `<button type="button" class="op-filter-btn${cols === n ? ' active' : ''}" data-rb-cols="${n}" data-rb-id="${esc(rb.id)}" title="${n} column${n === 1 ? '' : 's'}">${n} Col</button>`).join('')}
                    </div>`}
                    ${total > 0 ? `<button type="button" class="op-btn sm" data-rb-reset="${esc(rb.id)}">Reset Checks</button>` : ''}
                    <button type="button" class="op-btn sm" data-rb-copy-link="${esc(rb.id)}" title="Copy dedicated link to this runbook">Copy Link</button>
                    <details class="op-rb-menu">
                        <summary class="op-btn sm" aria-label="More runbook actions">More &hellip;</summary>
                        <div class="op-rb-menu-pop">
                            <button type="button" class="op-rb-menu-item" data-rb-copy-dock="${esc(rb.id)}">Copy OBS Dock Link</button>
                            <a class="op-rb-menu-item" href="${esc(buildRunbookUrl(rb.id))}" target="_blank" rel="noopener">Open in New Tab</a>
                            ${readOnly ? '' : `<button type="button" class="op-rb-menu-item" data-rb-rename="${esc(rb.id)}">Edit Name &amp; Info</button>
                            <button type="button" class="op-rb-menu-item" data-rb-dup="${esc(rb.id)}">Duplicate Runbook</button>
                            <button type="button" class="op-rb-menu-item danger" data-rb-delete="${esc(rb.id)}">Delete Runbook</button>`}
                        </div>
                    </details>
                </div>
            </div>
            ${contentHtml}
            ${renderComposerHtml(rb.id, composeKind, readOnly)}
        </div>`;
}

function openItemEditModal(item, onSave) {
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    if (!modal || !titleEl || !bodyEl || !footEl) return;

    const kind = item.kind || 'task';
    titleEl.textContent = kind === 'note' ? 'Edit Note' : kind === 'section' ? 'Rename Section' : 'Edit Task';
    bodyEl.innerHTML = `
        <form id="op-rb-item-form" style="display:grid;gap:.65rem;">
            <div class="op-field">
                <label for="op-rb-item-kind">Type</label>
                <select id="op-rb-item-kind" class="op-profile-select" style="max-width:180px;">
                    <option value="task"${kind === 'task' ? ' selected' : ''}>Task (Checkable)</option>
                    <option value="note"${kind === 'note' ? ' selected' : ''}>Note (Non-task)</option>
                    <option value="section"${kind === 'section' ? ' selected' : ''}>Section Heading</option>
                </select>
            </div>
            <div class="op-field">
                <label for="op-rb-item-text">Content <span style="font-weight:400;text-transform:none;letter-spacing:0;">(Notes support Markdown: **bold**, *italic*, lists, [links](url), \`code\`)</span></label>
                <textarea id="op-rb-item-text" rows="5" style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-inset);color:var(--text);font:inherit;">${esc(item.text || '')}</textarea>
            </div>
        </form>`;
    footEl.innerHTML = `
        <button type="button" class="op-btn sm" data-modal-close="1">Cancel</button>
        <button type="submit" form="op-rb-item-form" class="op-btn sm primary">Save</button>`;

    const form = document.getElementById('op-rb-item-form');
    form?.addEventListener('submit', async e => {
        e.preventDefault();
        const nextKind = document.getElementById('op-rb-item-kind')?.value || 'task';
        const nextText = (document.getElementById('op-rb-item-text')?.value || '').trim();
        if (!nextText) return;
        try {
            await onSave({ kind: nextKind, text: nextText });
            modal.hidden = true;
        } catch (err) { toast(err.message, 'error'); }
    }, { once: true });
    modal.hidden = false;
    document.getElementById('op-rb-item-text')?.focus();
}

function openRunbookFormModal({ title, initialName = '', initialDesc = '', submitLabel = 'Save', onSubmit }) {
    const modal = document.getElementById('op-modal');
    const titleEl = document.getElementById('op-modal-title');
    const bodyEl = document.getElementById('op-modal-body');
    const footEl = document.getElementById('op-modal-foot');
    if (!modal || !titleEl || !bodyEl || !footEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = `
        <form id="op-rb-modal-form" style="display:grid;gap:.65rem;">
            <div class="op-field">
                <label for="op-rb-name">Runbook Name</label>
                <input type="text" id="op-rb-name" maxlength="80" value="${esc(initialName)}" placeholder="e.g. Pre-Show Checklist, Tournament Launch" required>
            </div>
            <div class="op-field">
                <label for="op-rb-desc">Description (optional)</label>
                <input type="text" id="op-rb-desc" maxlength="240" value="${esc(initialDesc)}" placeholder="Short note about when to use this runbook">
            </div>
        </form>`;
    footEl.innerHTML = `
        <button type="button" class="op-btn sm" data-modal-close="1">Cancel</button>
        <button type="submit" form="op-rb-modal-form" class="op-btn sm primary">${esc(submitLabel)}</button>`;

    const form = document.getElementById('op-rb-modal-form');
    form?.addEventListener('submit', async e => {
        e.preventDefault();
        const name = (document.getElementById('op-rb-name')?.value || '').trim();
        const description = (document.getElementById('op-rb-desc')?.value || '').trim();
        if (!name) return;
        try {
            await onSubmit({ name, description });
            modal.hidden = true;
        } catch (err) { toast(err.message, 'error'); }
    }, { once: true });
    modal.hidden = false;
    document.getElementById('op-rb-name')?.focus();
}

function bindRunbookInteractions(el, { getTargetId, getComposeKind, setComposeKind, onAfterMutate, onAfterDeleteRunbook, onAfterCreateOrDup }) {
    let dragIdx = -1;

    const onChange = async e => {
        const cb = e.target.closest('[data-rb-toggle]');
        if (!cb) return;
        const rbId = cb.dataset.rbId || getTargetId();
        try {
            await toggleRunbookItemOnServer(rbId, { itemId: cb.dataset.rbToggle, index: Number(cb.dataset.rbIdx), done: cb.checked });
            onAfterMutate();
        } catch (err) {
            cb.checked = !cb.checked;
            toast(err.message, 'error');
        }
    };

    const onClick = async e => {
        // Close open More menu if clicked outside
        el.querySelectorAll('.op-rb-menu[open]').forEach(menu => {
            if (!menu.contains(e.target)) menu.open = false;
        });

        const kindBtn = e.target.closest('[data-rb-kind]');
        if (kindBtn) {
            setComposeKind(kindBtn.dataset.rbKind);
            onAfterMutate();
            el.querySelector('[data-rb-input]')?.focus();
            return;
        }
        const colsBtn = e.target.closest('[data-rb-cols]');
        if (colsBtn && !isEditLocked()) {
            const rb = getRunbookById(colsBtn.dataset.rbId || getTargetId());
            if (!rb) return;
            try {
                await saveRunbookToServer({ ...rb, columns: Number(colsBtn.dataset.rbCols) || 1 });
                onAfterMutate();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const copyLink = e.target.closest('[data-rb-copy-link]');
        if (copyLink) {
            await copyUrl(buildRunbookUrl(copyLink.dataset.rbCopyLink), 'runbook link');
            return;
        }
        const copyDock = e.target.closest('[data-rb-copy-dock]');
        if (copyDock) {
            el.querySelectorAll('.op-rb-menu[open]').forEach(m => { m.open = false; });
            await copyUrl(buildRunbookUrl(copyDock.dataset.rbCopyDock, { dock: true, bare: true }), 'runbook dock link');
            return;
        }
        const resetBtn = e.target.closest('[data-rb-reset]');
        if (resetBtn) {
            const rbId = resetBtn.dataset.rbReset || getTargetId();
            try {
                await resetRunbookOnServer(rbId);
                onAfterMutate();
                toast('Reset runbook checks', 'info');
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        // Clicking task text toggles its checkbox cleanly
        const textSpan = e.target.closest('[data-rb-text-idx]');
        if (textSpan) {
            const row = textSpan.closest('.op-rb-item');
            const cb = row?.querySelector('[data-rb-toggle]');
            if (cb) {
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
        }
        if (isEditLocked()) return;

        const editBtn = e.target.closest('[data-rb-edit-item]');
        if (editBtn) {
            const rb = getRunbookById(editBtn.dataset.rbId || getTargetId());
            const idx = Number(editBtn.dataset.rbEditItem);
            if (!rb || !rb.items[idx]) return;
            openItemEditModal(rb.items[idx], async patch => {
                const nextItems = rb.items.map((it, i) => (i === idx ? { ...it, ...patch, done: patch.kind === 'task' ? it.done : false } : it));
                await saveRunbookToServer({ ...rb, items: nextItems });
                onAfterMutate();
            });
            return;
        }
        const delBtn = e.target.closest('[data-rb-del]');
        if (delBtn) {
            const rb = getRunbookById(delBtn.dataset.rbId || getTargetId());
            if (!rb) return;
            const idx = Number(delBtn.dataset.rbDel);
            const nextItems = rb.items.filter((_, i) => i !== idx);
            try {
                await saveRunbookToServer({ ...rb, items: nextItems });
                onAfterMutate();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const ren = e.target.closest('[data-rb-rename]');
        if (ren) {
            el.querySelectorAll('.op-rb-menu[open]').forEach(m => { m.open = false; });
            const rb = getRunbookById(ren.dataset.rbRename);
            if (!rb) return;
            openRunbookFormModal({
                title: 'Edit Runbook',
                initialName: rb.name,
                initialDesc: rb.description || '',
                submitLabel: 'Save Changes',
                onSubmit: async ({ name, description }) => {
                    await saveRunbookToServer({ ...rb, name, description });
                    toast('Runbook updated', 'success');
                    onAfterMutate();
                }
            });
            return;
        }
        const dup = e.target.closest('[data-rb-dup]');
        if (dup) {
            el.querySelectorAll('.op-rb-menu[open]').forEach(m => { m.open = false; });
            try {
                const copy = await duplicateRunbookOnServer(dup.dataset.rbDup);
                toast(`Duplicated "${copy.name}"`, 'success');
                onAfterCreateOrDup?.(copy);
                onAfterMutate();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        const delRb = e.target.closest('[data-rb-delete]');
        if (delRb) {
            el.querySelectorAll('.op-rb-menu[open]').forEach(m => { m.open = false; });
            const rb = getRunbookById(delRb.dataset.rbDelete);
            if (!rb || !window.confirm(`Delete runbook "${rb.name}"?`)) return;
            try {
                await deleteRunbookOnServer(rb.id);
                toast(`Deleted "${rb.name}"`, 'info');
                onAfterDeleteRunbook?.();
                onAfterMutate();
            } catch (err) { toast(err.message, 'error'); }
        }
    };

    const onDblClick = e => {
        if (isEditLocked() || e.target.closest('a, button, input, textarea, select')) return;
        const textSpan = e.target.closest('[data-rb-text-idx]');
        if (!textSpan) return;
        const rb = getRunbookById(textSpan.dataset.rbId || getTargetId());
        const idx = Number(textSpan.dataset.rbTextIdx);
        if (!rb || !rb.items[idx]) return;
        openItemEditModal(rb.items[idx], async patch => {
            const nextItems = rb.items.map((it, i) => (i === idx ? { ...it, ...patch, done: patch.kind === 'task' ? it.done : false } : it));
            await saveRunbookToServer({ ...rb, items: nextItems });
            onAfterMutate();
        });
    };

    const onSubmit = async e => {
        const form = e.target.closest('[data-rb-add]');
        if (!form || isEditLocked()) return;
        e.preventDefault();
        const rb = getRunbookById(form.dataset.rbAdd || getTargetId());
        if (!rb) return;
        const inp = form.querySelector('[data-rb-input]');
        const txt = (inp?.value || '').trim();
        if (!txt) return;
        const kind = getComposeKind();
        const nextItems = [...(rb.items || []), { id: `cue-${Date.now().toString(36)}`, kind, text: txt, done: false, note: '' }];
        try {
            await saveRunbookToServer({ ...rb, items: nextItems });
            onAfterMutate();
            el.querySelector('[data-rb-input]')?.focus();
        } catch (err) { toast(err.message, 'error'); }
    };

    // Pure HTML5 Drag-and-Drop Reordering (never up/down arrows)
    const clearDragClasses = () => {
        el.querySelectorAll('.is-dragging, .is-drop-target').forEach(n => n.classList.remove('is-dragging', 'is-drop-target'));
    };
    const onDragStart = e => {
        if (isEditLocked()) return;
        if (e.target.closest('input, textarea, button, a, select')) return;
        const row = e.target.closest('[data-rb-item-idx]');
        if (!row) return;
        e.stopPropagation();
        dragIdx = Number(row.dataset.rbItemIdx);
        row.classList.add('is-dragging');
        e.dataTransfer?.setData('text/plain', String(dragIdx));
    };
    const onDragOver = e => {
        if (dragIdx < 0 || isEditLocked()) return;
        const targetRow = e.target.closest('[data-rb-item-idx]');
        const dropZone = !targetRow ? e.target.closest('[data-rb-drop-zone]') : null;
        if (!targetRow && !dropZone) return;
        e.preventDefault();
        e.stopPropagation();
        el.querySelectorAll('.is-drop-target').forEach(n => {
            if (n !== targetRow) n.classList.remove('is-drop-target');
        });
        if (targetRow && Number(targetRow.dataset.rbItemIdx) !== dragIdx) {
            targetRow.classList.add('is-drop-target');
        }
    };
    const onDrop = async e => {
        if (dragIdx < 0 || isEditLocked()) return;
        const targetRow = e.target.closest('[data-rb-item-idx]');
        const dropZone = !targetRow ? e.target.closest('[data-rb-drop-zone]') : null;
        if (!targetRow && !dropZone) return;
        e.preventDefault();
        e.stopPropagation();
        const fromIdx = dragIdx;
        dragIdx = -1;
        clearDragClasses();

        const rb = getRunbookById(getTargetId());
        if (!rb || fromIdx < 0 || fromIdx >= rb.items.length) return;

        let toIdx;
        if (targetRow) {
            toIdx = Number(targetRow.dataset.rbItemIdx);
            if (fromIdx === toIdx) return;
        } else {
            const secIdx = Number(dropZone.dataset.rbDropZone);
            if (secIdx >= 0) {
                // Insert right after section heading (or at end of that section)
                let endIdx = secIdx + 1;
                while (endIdx < rb.items.length && rb.items[endIdx].kind !== 'section') endIdx++;
                toIdx = endIdx > fromIdx ? endIdx - 1 : endIdx;
            } else {
                toIdx = rb.items.length - 1;
            }
        }
        if (!Number.isInteger(toIdx) || toIdx < 0 || toIdx >= rb.items.length || fromIdx === toIdx) return;

        const nextItems = [...rb.items];
        const [moved] = nextItems.splice(fromIdx, 1);
        nextItems.splice(toIdx, 0, moved);
        try {
            await saveRunbookToServer({ ...rb, items: nextItems });
            onAfterMutate();
        } catch (err) { toast(err.message, 'error'); }
    };
    const onDragEnd = () => {
        dragIdx = -1;
        clearDragClasses();
    };

    el.addEventListener('change', onChange);
    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('submit', onSubmit);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragend', onDragEnd);
    return () => {
        el.removeEventListener('change', onChange);
        el.removeEventListener('click', onClick);
        el.removeEventListener('dblclick', onDblClick);
        el.removeEventListener('submit', onSubmit);
        el.removeEventListener('dragstart', onDragStart);
        el.removeEventListener('dragover', onDragOver);
        el.removeEventListener('drop', onDrop);
        el.removeEventListener('dragend', onDragEnd);
    };
}

// Live Board Card Type: pin any specific server-saved runbook
registerCardType({
    type: 'runbook-cue',
    moduleId: 'runbook',
    label: 'Session Runbook / Cues',
    description: 'Pin any saved Runbook checklist & notes to your Live Board with drag-and-drop order and live sync.',
    iconSvg: OP_ICONS.runbook,
    isEnabled: () => true,
    async getPickerItems() {
        const list = await refreshRunbooks().catch(() => operatorState.runbooks || []);
        return list.map(rb => {
            const c = taskCounts(rb.items);
            return {
                title: rb.name,
                subtitle: `${c.total} task${c.total === 1 ? '' : 's'}${c.notes ? ` · ${c.notes} note${c.notes === 1 ? '' : 's'}` : ''}`,
                defaultTitle: rb.name,
                config: { runbookId: rb.id }
            };
        });
    },
    mount(el, card) {
        let composeKind = 'task';
        const getTargetId = () => card.config?.runbookId || operatorState.runbooks?.[0]?.id || '';
        const draw = () => {
            const rb = getRunbookById(getTargetId());
            renderRunbookSurface(el, rb, { compact: true, composeKind, showCardLinks: true });
        };
        const cleanup = bindRunbookInteractions(el, {
            getTargetId,
            getComposeKind: () => composeKind,
            setComposeKind: k => { composeKind = k; },
            onAfterMutate: draw
        });
        el._opRefresh = draw;
        el._opCleanup = cleanup;
        if (!operatorState.runbooks?.length) {
            refreshRunbooks().then(draw).catch(draw);
        } else {
            draw();
        }
    },
    onSocket(el, card, type) {
        if (type === 'operator-runbooks-update' || type === 'operator-update') {
            el._opRefresh?.();
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

// Top-level Runbook Domain Tab (calm multi-runbook studio + focused #runbook=<id> links)
(() => {
    let hostContainer = null;
    let bodyCleanup = null;
    let shellClick = null;
    let shellChange = null;
    let selectedRunbookId = localStorage.getItem(ACTIVE_RUNBOOK_KEY) || '';
    let composeKind = 'task';

    const getEffectiveSelection = () => {
        const focusedId = getFocusedRunbookIdFromHash();
        const list = operatorState.runbooks || [];
        if (focusedId) {
            return { focusedId, active: list.find(rb => rb.id === focusedId) || null };
        }
        const active = list.find(rb => rb.id === selectedRunbookId) || list[0] || null;
        if (active) {
            selectedRunbookId = active.id;
            try { localStorage.setItem(ACTIVE_RUNBOOK_KEY, active.id); } catch { /* ignore */ }
        }
        return { focusedId: '', active };
    };

    const renderDomain = () => {
        if (!hostContainer) return;
        if (bodyCleanup) { bodyCleanup(); bodyCleanup = null; }
        const list = operatorState.runbooks || [];
        const { focusedId, active } = getEffectiveSelection();
        const readOnly = isEditLocked();

        if (focusedId) {
            hostContainer.innerHTML = `
                <div class="op-domain-stack">
                    ${operatorState.bareMode ? '' : `<section class="op-toolbar" aria-label="Focused runbook">
                        <div class="op-toolbar-left">
                            <button type="button" class="op-btn sm" data-rb-show-all="1">&larr; All Runbooks</button>
                            <span class="op-pill">Dedicated Link</span>
                        </div>
                        <div class="op-toolbar-right">
                            ${active ? `<button type="button" class="op-btn sm" data-rb-shell-copy-dock="${esc(active.id)}">Copy Dock Link</button>` : ''}
                        </div>
                    </section>`}
                    <div data-rb-domain-body="1"></div>
                </div>`;
            const body = hostContainer.querySelector('[data-rb-domain-body]');
            if (body) {
                if (!active) {
                    body.innerHTML = `<div class="op-card" style="padding:1rem;font-size:.84rem;color:var(--text-muted);">Runbook <code>${esc(focusedId)}</code> was not found.</div>`;
                } else {
                    renderRunbookSurface(body, active, { compact: false, composeKind });
                    bodyCleanup = bindRunbookInteractions(body, {
                        getTargetId: () => active.id,
                        getComposeKind: () => composeKind,
                        setComposeKind: k => { composeKind = k; },
                        onAfterMutate: renderDomain,
                        onAfterCreateOrDup: rb => { selectedRunbookId = rb.id; },
                        onAfterDeleteRunbook: () => {
                            const url = new URL(location.href);
                            url.hash = 'tab=runbook';
                            history.replaceState(null, '', url);
                            selectedRunbookId = operatorState.runbooks?.[0]?.id || '';
                        }
                    });
                }
            }
            return;
        }

        hostContainer.innerHTML = `
            <div class="op-domain-stack">
                <section class="op-toolbar" aria-label="Runbook selector">
                    <div class="op-toolbar-left" style="flex-wrap:wrap;gap:.45rem;">
                        <span style="display:inline-flex;align-items:center;gap:.4rem;font-weight:700;font-size:.88rem;">${OP_ICONS.runbook} Runbooks</span>
                        ${list.length ? `<select class="op-profile-select" style="min-width:190px;max-width:280px;" data-rb-picker="1" aria-label="Select runbook">
                            ${list.map(rb => {
                                const c = taskCounts(rb.items);
                                const suffix = c.total > 0 ? ` (${c.done}/${c.total})` : '';
                                return `<option value="${esc(rb.id)}"${active && rb.id === active.id ? ' selected' : ''}>${esc(rb.name)}${suffix}</option>`;
                            }).join('')}
                        </select>` : ''}
                        <span class="op-pill">${list.length} saved</span>
                    </div>
                    <div class="op-toolbar-right">
                        ${readOnly ? '' : `<button type="button" class="op-btn sm primary" data-rb-new="1">${OP_ICONS.plus} New Runbook</button>`}
                    </div>
                </section>
                ${active ? '<div data-rb-domain-body="1"></div>' : `
                    <div class="op-card">
                        <div class="op-empty">
                            <div>No runbooks created yet.</div>
                            ${readOnly ? '' : `<button type="button" class="op-btn sm primary" data-rb-new="1">${OP_ICONS.plus} Create First Runbook</button>`}
                        </div>
                    </div>
                `}
            </div>`;

        const body = hostContainer.querySelector('[data-rb-domain-body]');
        if (body && active) {
            renderRunbookSurface(body, active, { compact: false, composeKind });
            bodyCleanup = bindRunbookInteractions(body, {
                getTargetId: () => active.id,
                getComposeKind: () => composeKind,
                setComposeKind: k => { composeKind = k; },
                onAfterMutate: renderDomain,
                onAfterCreateOrDup: rb => {
                    selectedRunbookId = rb.id;
                    try { localStorage.setItem(ACTIVE_RUNBOOK_KEY, rb.id); } catch { /* ignore */ }
                },
                onAfterDeleteRunbook: () => {
                    selectedRunbookId = operatorState.runbooks?.[0]?.id || '';
                }
            });
        }
    };

    registerOperatorModule({
        id: 'runbook',
        label: 'Runbook',
        iconSvg: OP_ICONS.runbook,
        order: 75,
        isEnabled: () => true,
        async mount(container) {
            if (hostContainer) {
                if (shellClick) hostContainer.removeEventListener('click', shellClick);
                if (shellChange) hostContainer.removeEventListener('change', shellChange);
            }
            if (bodyCleanup) { bodyCleanup(); bodyCleanup = null; }
            hostContainer = container;

            shellChange = e => {
                const picker = e.target.closest('[data-rb-picker]');
                if (!picker) return;
                selectedRunbookId = picker.value;
                try { localStorage.setItem(ACTIVE_RUNBOOK_KEY, selectedRunbookId); } catch { /* ignore */ }
                renderDomain();
            };
            shellClick = async e => {
                if (e.target.closest('[data-rb-show-all]')) {
                    const url = new URL(location.href);
                    url.hash = 'tab=runbook';
                    history.replaceState(null, '', url);
                    renderDomain();
                    return;
                }
                const copyDock = e.target.closest('[data-rb-shell-copy-dock]');
                if (copyDock) {
                    await copyUrl(buildRunbookUrl(copyDock.dataset.rbShellCopyDock, { dock: true, bare: true }), 'runbook dock link');
                    return;
                }
                if (isEditLocked()) return;
                if (e.target.closest('[data-rb-new]')) {
                    openRunbookFormModal({
                        title: 'New Runbook',
                        submitLabel: 'Create Runbook',
                        onSubmit: async ({ name, description }) => {
                            const created = await createRunbookOnServer({ name, description, columns: 1, items: [] });
                            selectedRunbookId = created.id;
                            try { localStorage.setItem(ACTIVE_RUNBOOK_KEY, created.id); } catch { /* ignore */ }
                            toast(`Created runbook "${created.name}"`, 'success');
                            renderDomain();
                        }
                    });
                }
            };
            container.addEventListener('change', shellChange);
            container.addEventListener('click', shellClick);

            if (!operatorState.runbooks?.length) {
                await refreshRunbooks().catch(() => {});
            }
            renderDomain();
        },
        unmount() {
            if (hostContainer) {
                if (shellClick) hostContainer.removeEventListener('click', shellClick);
                if (shellChange) hostContainer.removeEventListener('change', shellChange);
            }
            shellClick = shellChange = null;
            if (bodyCleanup) { bodyCleanup(); bodyCleanup = null; }
            hostContainer = null;
        },
        onSocket(type) {
            if (type === 'operator-runbooks-update' || type === 'operator-update') {
                renderDomain();
            }
        }
    });
})();
