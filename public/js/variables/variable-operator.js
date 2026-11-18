// Modular Variable & Group Card Grid controller for the unified Operator Console
import { api, esc, toast } from '../shared/client-core.js';
import { fontControls } from './variables-groups.js';

const VAR_STORAGE_KEY = 'streampulse_var_operator_target';
const GROUP_LAYOUT_PREFIX = 'streampulse_operator_group_';
const SVG_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const SVG_PLUS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const SVG_UP = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>';
const SVG_DOWN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const SVG_HIDE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_GRIP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

const voState = { variables: [], groups: [] };
let activeKind = 'var';
let activeKey = '';
let searchQuery = '';
let onReloadCb = null;
let onBadgeCb = null;
let onModeSyncCb = null;

try {
    const saved = JSON.parse(localStorage.getItem(VAR_STORAGE_KEY) || 'null');
    if (saved?.kind && saved?.key) {
        activeKind = saved.kind === 'group' ? 'group' : 'var';
        activeKey = saved.key;
    }
} catch { /* ignore */ }

function getListLines(v) {
    if (Array.isArray(v?.items)) return v.items.map(s => String(s || '').trim()).filter(Boolean);
    return String(v?.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function getGroupLayout(groupName, groupVars) {
    const valid = groupVars.map(v => v.name);
    const validSet = new Set(valid);
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(`${GROUP_LAYOUT_PREFIX}${groupName}`) || 'null'); } catch { /* ignore */ }
    const order = Array.isArray(parsed?.order) ? parsed.order.filter(n => validSet.has(n)) : [];
    for (const n of valid) if (!order.includes(n)) order.push(n);
    const hidden = Array.isArray(parsed?.hidden) ? parsed.hidden.filter(n => validSet.has(n)) : [];
    return { order, hidden };
}

function saveGroupLayout(groupName, cfg) {
    localStorage.setItem(`${GROUP_LAYOUT_PREFIX}${groupName}`, JSON.stringify(cfg));
}

function persistTarget() {
    localStorage.setItem(VAR_STORAGE_KEY, JSON.stringify({ kind: activeKind, key: activeKey }));
}

export function getVariableOperatorHash() {
    if (!activeKey) return activeKind === 'group' ? '#group=' : '#var=';
    return activeKind === 'group'
        ? `#group=${encodeURIComponent(activeKey)}`
        : `#var=${encodeURIComponent(activeKey)}`;
}

export function setVariableOperatorTarget(kind, key = '') {
    activeKind = kind === 'group' ? 'group' : 'var';
    if (key) activeKey = key;
    persistTarget();
}

export function updateVariableOperatorData(variables = [], groups = []) {
    voState.variables = variables;
    voState.groups = groups;
}

function resolveTarget() {
    const vars = voState.variables.filter(v => !v.setId && !v.hidden);
    const groups = voState.groups || [];
    if (activeKind === 'group') {
        if (!groups.includes(activeKey)) activeKey = groups[0] || '';
    } else if (!vars.some(v => v.name === activeKey)) {
        activeKey = vars[0]?.name || '';
    }
    persistTarget();
    return { vars, groups };
}

function renderControlForVar(v, compactList = false) {
    const name = esc(v.name);
    const val = String(v.value ?? '');
    if (v.type === 'toggle') {
        const on = val === 'true';
        return `<label class="op-check"><input type="checkbox" data-vo-toggle="${name}" ${on ? 'checked' : ''}><span>${on ? 'On (true)' : 'Off (false)'}</span></label>`;
    }
    if (v.type === 'counter' || v.type === 'number') {
        return `<div class="op-counter-wrap">
            <button type="button" class="op-btn sm" data-vo-step="${name}" data-delta="-1">-1</button>
            <input type="number" step="any" class="op-cell-input op-counter-input" data-vo-val="${name}" value="${esc(val)}">
            <button type="button" class="op-btn sm" data-vo-step="${name}" data-delta="1">+1</button>
            <button type="button" class="op-btn sm" data-vo-reset="${name}">Reset</button>
        </div>`;
    }
    if (v.type === 'color') {
        const hex = /^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : '#3b82f6';
        return `<div class="op-color-wrap">
            <input type="color" class="op-color-swatch" data-vo-color="${name}" value="${esc(hex)}">
            <input type="text" class="op-cell-input" data-vo-val="${name}" value="${esc(val)}" placeholder="#3b82f6">
        </div>`;
    }
    if (v.type === 'image') {
        return `<div class="op-img-wrap">
            ${val ? `<img src="${esc(val)}" alt="" class="op-thumb">` : ''}
            <input type="text" class="op-cell-input" data-vo-val="${name}" value="${esc(val)}" placeholder="/assets/...">
            <button type="button" class="op-btn sm" data-vo-pick-img="${name}">Assets</button>
        </div>`;
    }
    if (v.type === 'icon') {
        return `<div class="op-img-wrap">
            <span class="op-icon-preview">${val ? `<i class="${esc(val)}"></i>` : ''}</span>
            <input type="text" class="op-cell-input" data-vo-val="${name}" value="${esc(val)}" placeholder="fa-solid fa-star">
            <button type="button" class="op-btn sm" data-vo-pick-icon="${name}">Icon</button>
        </div>`;
    }
    if (v.type === 'font') {
        return `<div style="display:grid;gap:.35rem;">${fontControls(v)}<div style="font-family:${esc(val || 'inherit')};font-size:.95rem;color:var(--text-muted);">The quick brown fox</div></div>`;
    }
    if (v.type === 'date' || v.type === 'time' || v.type === 'datetime') {
        const t = v.type === 'datetime' ? 'datetime-local' : v.type;
        return `<input type="${t}" class="op-cell-input" data-vo-val="${name}" value="${esc(val)}">`;
    }
    if (v.type === 'list' && compactList) {
        const lines = getListLines(v);
        const rows = lines.map((line, idx) => `<div style="display:flex;gap:.3rem;align-items:center;">
            <input type="text" class="op-cell-input" data-vo-line-idx="${idx}" data-vo-line-var="${name}" value="${esc(line)}">
            <button type="button" class="op-btn sm danger" data-vo-del-line="${idx}" data-vo-line-var="${name}" title="Remove line">${SVG_TRASH}</button>
        </div>`).join('');
        return `<form class="vo-card-add-form" data-vo-add-var="${name}" style="display:flex;gap:.35rem;">
            <input type="text" class="op-cell-input" data-vo-add-input="${name}" placeholder="Add line…" autocomplete="off">
            <button type="submit" class="op-btn sm primary">${SVG_PLUS}</button>
            <button type="button" class="op-btn sm" data-vo-roll="${name}" title="Roll next">Next</button>
        </form>
        <div class="op-var-card-lines">${rows || '<span style="color:var(--text-muted);font-size:.78rem;">No lines yet.</span>'}</div>`;
    }
    return `<input type="text" class="op-cell-input" data-vo-val="${name}" value="${esc(val)}" placeholder="Value">`;
}

function renderListVariableOperator(v, host, stats, actions) {
    const lines = getListLines(v);
    const filteredLines = lines
        .map((text, idx) => ({ text, idx }))
        .filter(item => !searchQuery || item.text.toLowerCase().includes(searchQuery));
    if (stats) stats.textContent = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · list`;
    if (actions) actions.innerHTML = `<button type="button" class="op-btn sm" data-vo-roll="${esc(v.name)}">Roll Next</button>`;
    const rowsHtml = filteredLines.length
        ? filteredLines.map(item => `<tr>
            <td style="width:3.2rem;color:var(--text-muted);font-variant-numeric:tabular-nums;">#${item.idx + 1}</td>
            <td><input type="text" class="op-cell-input" data-vo-line-idx="${item.idx}" data-vo-line-var="${esc(v.name)}" value="${esc(item.text)}"></td>
            <td style="width:3.2rem;"><button type="button" class="op-btn sm danger" data-vo-del-line="${item.idx}" data-vo-line-var="${esc(v.name)}" title="Remove line">${SVG_TRASH}</button></td>
        </tr>`).join('')
        : `<tr><td colspan="3" class="op-empty">${lines.length ? 'No lines match your filter.' : 'No lines yet. Add your first line above.'}</td></tr>`;

    host.innerHTML = `<div style="padding:.85rem 1rem;border-bottom:1px solid var(--border);background:var(--bg-inset);">
        <form id="vo-add-line-form" class="vo-card-add-form" data-vo-add-var="${esc(v.name)}" style="display:flex;gap:.5rem;align-items:center;">
            <input type="text" id="vo-add-line-input" data-vo-add-input="${esc(v.name)}" class="op-cell-input" style="flex:1;height:36px;font-size:.9rem;" placeholder="Add a new line to ${esc(v.name)} and press Enter…" autocomplete="off">
            <button type="submit" class="op-btn primary">${SVG_PLUS} Add Line</button>
        </form>
    </div>
    <table class="op-table">
        <thead><tr><th>#</th><th>Line Text</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
    </table>`;
}

function renderCardsPopover(groupName, groupVars, cfg) {
    const pop = document.getElementById('vo-cards-pop');
    if (!pop) return;
    const byName = new Map(groupVars.map(v => [v.name, v]));
    const hiddenSet = new Set(cfg.hidden);
    const rows = cfg.order.map((name, idx) => {
        const v = byName.get(name);
        if (!v) return '';
        return `<div class="op-col-item" data-vo-card-cfg="${esc(name)}">
            <label><input type="checkbox" data-vo-card-vis="${esc(name)}" ${hiddenSet.has(name) ? '' : 'checked'}><span>${esc(name)}</span></label>
            <span class="op-col-arrows">
                <button type="button" class="op-col-move" data-vo-card-move="up" data-vo-card-name="${esc(name)}" ${idx === 0 ? 'disabled' : ''}>${SVG_UP}</button>
                <button type="button" class="op-col-move" data-vo-card-move="down" data-vo-card-name="${esc(name)}" ${idx === cfg.order.length - 1 ? 'disabled' : ''}>${SVG_DOWN}</button>
            </span>
        </div>`;
    }).join('');
    pop.innerHTML = `<div class="op-cols-head"><span>Cards &amp; Order</span><button type="button" class="op-btn sm" id="vo-cards-reset">Reset</button></div><div class="op-cols-list">${rows}</div>`;
}

export function renderVariableOperator() {
    const select = document.getElementById('vo-target-select');
    const host = document.getElementById('vo-host');
    const stats = document.getElementById('op-stats');
    const actions = document.getElementById('vo-toolbar-actions');
    const cardsWrap = document.getElementById('vo-cards-wrap');
    if (!select || !host) return;

    const { vars, groups } = resolveTarget();
    if (cardsWrap) cardsWrap.hidden = activeKind !== 'group';

    if (activeKind === 'var') {
        if (!vars.length) {
            select.innerHTML = '<option value="">No custom variables</option>';
            select.disabled = true;
            if (stats) stats.textContent = '0 variables';
            if (actions) actions.innerHTML = '';
            host.innerHTML = '<div class="op-empty"><p>No custom variables exist yet. Create one in <a href="/placeholders.html#variables" style="color:var(--accent);">Placeholders &amp; Variables</a>.</p></div>';
            return;
        }
        select.disabled = false;
        select.innerHTML = vars.map(v => `<option value="${esc(v.name)}"${v.name === activeKey ? ' selected' : ''}>${esc(v.name)} (${esc(v.type)})</option>`).join('');
        const v = vars.find(item => item.name === activeKey);
        if (!v) return;
        if (v.type === 'list') {
            renderListVariableOperator(v, host, stats, actions);
            return;
        }
        if (stats) stats.textContent = `${v.type}${v.group ? ` · ${v.group}` : ''}`;
        if (actions) actions.innerHTML = '';
        const val = String(v.value ?? '');
        const previewHtml = v.type === 'image' && val
            ? `<img src="${esc(val)}" alt="${esc(v.name)}" class="op-var-single-img">`
            : v.type === 'icon' && val
                ? `<div class="op-var-single-icon"><i class="${esc(val)}"></i></div>`
                : '';
        host.innerHTML = `<div class="op-var-single">
            <div class="op-var-single-head">
                <div style="display:flex;align-items:center;gap:.5rem;">
                    <strong style="font-size:1.05rem;">${esc(v.name)}</strong>
                    <span class="op-pill">${esc(v.type)}</span>
                </div>
                <code>{{var.${esc(v.name)}}}</code>
            </div>
            ${previewHtml}
            <div>${renderControlForVar(v)}</div>
        </div>`;
        return;
    }

    if (!groups.length) {
        select.innerHTML = '<option value="">No variable groups</option>';
        select.disabled = true;
        if (stats) stats.textContent = '0 groups';
        if (actions) actions.innerHTML = '';
        host.innerHTML = '<div class="op-empty"><p>No Variable Groups exist yet. Create one in <a href="/placeholders.html#variables" style="color:var(--accent);">Placeholders &amp; Variables</a>.</p></div>';
        return;
    }
    select.disabled = false;
    select.innerHTML = groups.map(g => `<option value="${esc(g)}"${g === activeKey ? ' selected' : ''}>Group: ${esc(g)}</option>`).join('');
    const groupVars = vars.filter(v => (v.group || '') === activeKey);
    const cfg = getGroupLayout(activeKey, groupVars);
    renderCardsPopover(activeKey, groupVars, cfg);
    const byName = new Map(groupVars.map(v => [v.name, v]));
    const hiddenSet = new Set(cfg.hidden);
    const visibleCards = cfg.order
        .filter(n => !hiddenSet.has(n))
        .map(n => byName.get(n))
        .filter(v => v && (!searchQuery || `${v.name} ${v.type} ${v.value}`.toLowerCase().includes(searchQuery)));

    if (stats) stats.textContent = `${visibleCards.length}/${groupVars.length} cards · group`;
    if (actions) actions.innerHTML = '';
    if (!visibleCards.length) {
        host.innerHTML = `<div class="op-empty"><p>${groupVars.length ? 'No cards match your filter or all cards are hidden (use Cards to restore).' : 'This group has no variables yet.'}</p></div>`;
        return;
    }

    host.innerHTML = `<div class="op-var-grid">${visibleCards.map(v => `
        <article class="op-var-card" draggable="true" data-vo-card="${esc(v.name)}">
            <header class="op-var-card-head">
                <div class="op-var-card-title">
                    <span class="op-var-drag" title="Drag to reorder">${SVG_GRIP}</span>
                    <a href="#var=${encodeURIComponent(v.name)}" data-vo-open-var="${esc(v.name)}" title="Open focused view">${esc(v.name)}</a>
                    <span class="op-pill">${esc(v.type)}</span>
                </div>
                <div class="op-var-card-actions">
                    <button type="button" class="op-col-move" data-vo-card-hide="${esc(v.name)}" title="Hide card">${SVG_HIDE}</button>
                </div>
            </header>
            <div class="op-var-card-body">${renderControlForVar(v, true)}</div>
        </article>`).join('')}</div>`;
}

async function saveVariableValue(name, value) {
    onBadgeCb?.('Saving…');
    try {
        await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value });
        onBadgeCb?.('Saved');
        await onReloadCb?.(false);
    } catch (err) {
        onBadgeCb?.('Save failed', true);
        toast(err.message, 'error');
    }
}

async function saveListLines(name, items) {
    onBadgeCb?.('Saving…');
    try {
        await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { items });
        onBadgeCb?.('Saved');
        await onReloadCb?.(false);
    } catch (err) {
        onBadgeCb?.('Save failed', true);
        toast(err.message, 'error');
    }
}

function mutateGroupOrder(name, dir) {
    const groupVars = voState.variables.filter(v => !v.setId && !v.hidden && (v.group || '') === activeKey);
    const cfg = getGroupLayout(activeKey, groupVars);
    const idx = cfg.order.indexOf(name);
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= cfg.order.length) return;
    [cfg.order[idx], cfg.order[swap]] = [cfg.order[swap], cfg.order[idx]];
    saveGroupLayout(activeKey, cfg);
    renderVariableOperator();
}

export function initVariableOperator({ onReload, onBadge, onModeSync } = {}) {
    onReloadCb = onReload;
    onBadgeCb = onBadge;
    onModeSyncCb = onModeSync;

    document.getElementById('vo-target-select')?.addEventListener('change', e => {
        activeKey = e.target.value;
        persistTarget();
        onModeSyncCb?.(getVariableOperatorHash());
        renderVariableOperator();
    });

    document.getElementById('vo-search')?.addEventListener('input', e => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderVariableOperator();
    });

    const cardsBtn = document.getElementById('vo-cards-btn');
    const cardsPop = document.getElementById('vo-cards-pop');
    cardsBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (!cardsPop) return;
        const next = cardsPop.hidden;
        cardsPop.hidden = !next;
        cardsBtn.setAttribute('aria-expanded', String(next));
    });
    document.addEventListener('click', e => {
        if (!cardsPop || cardsPop.hidden) return;
        if (e.target.closest('#vo-cards-wrap')) return;
        cardsPop.hidden = true;
        cardsBtn?.setAttribute('aria-expanded', 'false');
    });
    cardsPop?.addEventListener('change', e => {
        const chk = e.target.closest('[data-vo-card-vis]');
        if (!chk) return;
        const groupVars = voState.variables.filter(v => !v.setId && !v.hidden && (v.group || '') === activeKey);
        const cfg = getGroupLayout(activeKey, groupVars);
        const set = new Set(cfg.hidden);
        if (chk.checked) set.delete(chk.dataset.voCardVis);
        else set.add(chk.dataset.voCardVis);
        cfg.hidden = [...set];
        saveGroupLayout(activeKey, cfg);
        renderVariableOperator();
    });
    cardsPop?.addEventListener('click', e => {
        if (e.target.closest('#vo-cards-reset')) {
            localStorage.removeItem(`${GROUP_LAYOUT_PREFIX}${activeKey}`);
            renderVariableOperator();
            return;
        }
        const moveBtn = e.target.closest('[data-vo-card-move]');
        if (moveBtn) mutateGroupOrder(moveBtn.dataset.voCardName, moveBtn.dataset.voCardMove);
    });

    const host = document.getElementById('vo-host');
    if (!host) return;

    let draggedCard = '';
    host.addEventListener('dragstart', e => {
        const card = e.target.closest('.op-var-card[data-vo-card]');
        if (!card || e.target.closest('input, textarea, select, button, a')) {
            if (e.target.closest('input, textarea, select, button')) e.preventDefault();
            return;
        }
        draggedCard = card.dataset.voCard;
        card.classList.add('is-dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedCard);
        }
    });
    host.addEventListener('dragover', e => {
        if (!draggedCard) return;
        const card = e.target.closest('.op-var-card[data-vo-card]');
        if (!card || card.dataset.voCard === draggedCard) return;
        e.preventDefault();
        host.querySelectorAll('.op-var-card.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
        card.classList.add('is-drag-over');
    });
    host.addEventListener('dragleave', e => {
        const card = e.target.closest('.op-var-card[data-vo-card]');
        if (card && !card.contains(e.relatedTarget)) card.classList.remove('is-drag-over');
    });
    host.addEventListener('drop', e => {
        if (!draggedCard) return;
        const target = e.target.closest('.op-var-card[data-vo-card]');
        host.querySelectorAll('.op-var-card.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
        if (!target || target.dataset.voCard === draggedCard) return;
        e.preventDefault();
        const groupVars = voState.variables.filter(v => !v.setId && !v.hidden && (v.group || '') === activeKey);
        const cfg = getGroupLayout(activeKey, groupVars);
        const fromIdx = cfg.order.indexOf(draggedCard);
        const toIdx = cfg.order.indexOf(target.dataset.voCard);
        if (fromIdx >= 0 && toIdx >= 0) {
            cfg.order.splice(fromIdx, 1);
            cfg.order.splice(toIdx, 0, draggedCard);
            saveGroupLayout(activeKey, cfg);
            renderVariableOperator();
        }
    });
    host.addEventListener('dragend', () => {
        draggedCard = '';
        host.querySelectorAll('.op-var-card.is-dragging, .op-var-card.is-drag-over').forEach(el => {
            el.classList.remove('is-dragging', 'is-drag-over');
        });
    });

    host.addEventListener('submit', async e => {
        const form = e.target.closest('.vo-card-add-form');
        if (!form) return;
        e.preventDefault();
        const name = form.dataset.voAddVar;
        const input = form.querySelector(`[data-vo-add-input="${CSS.escape(name)}"]`);
        const line = (input?.value || '').trim();
        if (!line) return;
        const v = voState.variables.find(item => item.name === name);
        if (!v) return;
        const lines = getListLines(v);
        input.value = '';
        await saveListLines(name, [...lines, line]);
        host.querySelector(`[data-vo-add-input="${CSS.escape(name)}"]`)?.focus();
    });

    host.addEventListener('change', async e => {
        const t = e.target;
        if (t.dataset.voToggle) return saveVariableValue(t.dataset.voToggle, t.checked ? 'true' : 'false');
        if (t.dataset.voColor) return saveVariableValue(t.dataset.voColor, t.value);
        if (t.dataset.voVal) return saveVariableValue(t.dataset.voVal, t.value);
        if (t.dataset.act === 'value') {
            const name = t.closest('[data-vo-card]')?.dataset.voCard || (activeKind === 'var' ? activeKey : '');
            if (name) return saveVariableValue(name, t.value);
        }
        if (t.dataset.voLineVar !== undefined) {
            const name = t.dataset.voLineVar;
            const idx = Number(t.dataset.voLineIdx);
            const v = voState.variables.find(item => item.name === name);
            if (!v) return;
            const lines = getListLines(v);
            const nextText = t.value.trim();
            if (nextText) lines[idx] = nextText;
            else lines.splice(idx, 1);
            await saveListLines(name, lines);
        }
    });

    host.addEventListener('click', async e => {
        const t = e.target;
        const openVar = t.closest('[data-vo-open-var]');
        if (openVar) {
            e.preventDefault();
            setVariableOperatorTarget('var', openVar.dataset.voOpenVar);
            onModeSyncCb?.(getVariableOperatorHash(), 'var');
            renderVariableOperator();
            return;
        }
        const moveBtn = t.closest('[data-vo-card-move]');
        if (moveBtn) {
            mutateGroupOrder(moveBtn.dataset.voCardName, moveBtn.dataset.voCardMove);
            return;
        }
        const hideBtn = t.closest('[data-vo-card-hide]');
        if (hideBtn) {
            const groupVars = voState.variables.filter(v => !v.setId && !v.hidden && (v.group || '') === activeKey);
            const cfg = getGroupLayout(activeKey, groupVars);
            if (!cfg.hidden.includes(hideBtn.dataset.voCardHide)) cfg.hidden.push(hideBtn.dataset.voCardHide);
            saveGroupLayout(activeKey, cfg);
            renderVariableOperator();
            return;
        }
        const del = t.closest('[data-vo-del-line]');
        if (del) {
            const name = del.dataset.voLineVar;
            const idx = Number(del.dataset.voDelLine);
            const v = voState.variables.find(item => item.name === name);
            if (!v) return;
            const lines = getListLines(v);
            lines.splice(idx, 1);
            await saveListLines(name, lines);
            return;
        }
        const roll = t.closest('[data-vo-roll]');
        if (roll) {
            await api(`/api/variables/${encodeURIComponent(roll.dataset.voRoll)}/roll`, 'POST', {});
            await onReloadCb?.(false);
            return;
        }
        const stepBtn = t.closest('[data-vo-step]');
        if (stepBtn) {
            const name = stepBtn.dataset.voStep;
            const delta = Number(stepBtn.dataset.delta) || 0;
            await api(`/api/variables/${encodeURIComponent(name)}/${delta < 0 ? 'decrement' : 'increment'}`, 'POST', {});
            await onReloadCb?.(false);
            return;
        }
        const resetBtn = t.closest('[data-vo-reset]');
        if (resetBtn) {
            await api(`/api/variables/${encodeURIComponent(resetBtn.dataset.voReset)}/reset`, 'POST', {});
            await onReloadCb?.(false);
            return;
        }
        const pickImg = t.closest('[data-vo-pick-img]');
        if (pickImg) {
            const name = pickImg.dataset.voPickImg;
            const v = voState.variables.find(item => item.name === name);
            window.ImagePicker?.open?.({ value: v?.value || '', onPick: async url => { await saveVariableValue(name, url || ''); } });
            return;
        }
        const pickIcon = t.closest('[data-vo-pick-icon]');
        if (pickIcon) {
            const name = pickIcon.dataset.voPickIcon;
            const v = voState.variables.find(item => item.name === name);
            window.IconPicker?.open?.({ value: v?.value || '', onPick: async cls => { await saveVariableValue(name, cls || ''); } });
        }
    });

    document.getElementById('vo-toolbar-actions')?.addEventListener('click', async e => {
        const roll = e.target.closest('[data-vo-roll]');
        if (!roll) return;
        await api(`/api/variables/${encodeURIComponent(roll.dataset.voRoll)}/roll`, 'POST', {});
        await onReloadCb?.(false);
    });
}
