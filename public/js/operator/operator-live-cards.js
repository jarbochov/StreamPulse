'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType } from './operator-registry.js';
import { isEditLocked } from './operator-state.js';

let displaysCache = null;
let varsCache = null;

async function fetchDisplays(force = false) {
    if (!force && displaysCache) return displaysCache;
    displaysCache = await api('/api/variable-displays');
    return displaysCache;
}

async function fetchVars(force = false) {
    if (!force && varsCache) return varsCache;
    varsCache = await api('/api/variables');
    return varsCache;
}

function undoToast(message, undoFn) {
    if (typeof window.opUndoToast === 'function') {
        window.opUndoToast(message, undoFn);
    } else {
        toast(message, 'info');
    }
}

// ============================================================
// 1. Bingo Stamp Card (interactive 3x3 / 4x4 / 5x5 grid)
// ============================================================
async function renderBingoCard(el, card) {
    const displayId = card.config?.displayId || '';
    const [dispRes, varRes] = await Promise.all([fetchDisplays(), fetchVars()]);
    const display = (dispRes.displays || []).find(d => d.id === displayId && d.kind === 'bingo');
    if (!display) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">Saved Bingo Card display not found.</div>';
        return;
    }
    const shared = window.OverlayShared;
    const status = { customVars: varRes.variables || [], variableSets: varRes.sets || [], bingoState: dispRes.bingoState || {} };
    const board = shared?.resolveBingoBoard ? shared.resolveBingoBoard(display, {}, status) : null;
    if (!board) return;
    const readOnly = isEditLocked();
    el.innerHTML = `
        <div class="op-panel-row" style="margin-bottom:.4rem;">
            <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
                <span class="op-pill ${board.bingoCount > 0 ? 'is-ok' : ''}">${board.bingoCount > 0 ? `${board.bingoCount} BINGO` : 'No Bingo'}</span>
                <span class="op-pill">${board.stampedCount} / ${board.total}</span>
            </div>
            ${readOnly ? '' : `<div class="op-btn-row">
                <button type="button" class="op-btn sm" data-bingo-act="shuffle" data-pool="${board.poolLength}">Shuffle</button>
                <button type="button" class="op-btn sm" data-bingo-act="reset">Reset</button>
            </div>`}
        </div>
        <div class="op-bingo-grid" style="display:grid;grid-template-columns:repeat(${board.size},minmax(0,1fr));gap:4px;">
            ${board.cells.map(cell => `
                <button type="button" class="op-bingo-tile${cell.stamped ? ' is-stamped' : ''}${cell.winning ? ' is-winning' : ''}" data-bingo-cell="${cell.index}"${readOnly || cell.isFree ? ' disabled' : ''} title="${esc(cell.label)}">
                    <span>${esc(cell.label)}</span>
                </button>
            `).join('')}
        </div>`;
}

registerCardType({
    type: 'bingo-display',
    moduleId: 'variables',
    label: 'Bingo Stamp Card',
    description: 'Interactive click-to-stamp Bingo grid with automatic line detection and Shuffle/Reset.',
    iconSvg: OP_ICONS.board,
    isEnabled: () => true,
    async getPickerItems() {
        const res = await fetchDisplays(true);
        return (res.displays || [])
            .filter(d => d.kind === 'bingo')
            .map(d => ({
                title: d.name,
                subtitle: `${d.bingo?.size || 5}×${d.bingo?.size || 5} Bingo · ${d.bingo?.stampStyle || 'dauber'}`,
                defaultTitle: d.name,
                config: { displayId: d.id }
            }));
    },
    mount(el, card) {
        const displayId = card.config?.displayId || '';
        const refresh = () => renderBingoCard(el, card).catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked() || !displayId) return;
            const cellBtn = e.target.closest('[data-bingo-cell]');
            if (cellBtn) {
                const cell = Number(cellBtn.dataset.bingoCell);
                await api(`/api/variable-displays/${encodeURIComponent(displayId)}/bingo/toggle`, 'POST', { cell });
                await fetchDisplays(true);
                refresh();
                return;
            }
            const actBtn = e.target.closest('[data-bingo-act]');
            if (!actBtn) return;
            const act = actBtn.dataset.bingoAct;
            if (act === 'shuffle') {
                await api(`/api/variable-displays/${encodeURIComponent(displayId)}/bingo/shuffle`, 'POST', { count: Number(actBtn.dataset.pool) || 25 });
                await fetchDisplays(true);
                refresh();
                toast('Shuffled Bingo board', 'info');
            } else if (act === 'reset') {
                const prev = (await fetchDisplays()).bingoState?.[displayId]?.stamped || [];
                await api(`/api/variable-displays/${encodeURIComponent(displayId)}/bingo/reset`, 'POST', {});
                await fetchDisplays(true);
                refresh();
                if (prev.length) {
                    undoToast('Cleared Bingo stamps', async () => {
                        for (const c of prev) await api(`/api/variable-displays/${encodeURIComponent(displayId)}/bingo/toggle`, 'POST', { cell: c, stamped: true });
                        await fetchDisplays(true);
                        refresh();
                    });
                }
            }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        refresh();
    },
    onSocket(el, card, type) {
        if (['variable-displays', 'variable-displays-update', 'variables', 'variables-update'].includes(type)) {
            displaysCache = null;
            varsCache = null;
            el._opRefresh?.();
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 2. Meter & Gauge Control Card
// ============================================================
async function renderMeterCard(el, card) {
    const displayId = card.config?.displayId || '';
    const [dispRes, varRes] = await Promise.all([fetchDisplays(), fetchVars()]);
    const display = (dispRes.displays || []).find(d => d.id === displayId && d.kind === 'meter');
    if (!display) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">Saved Meter display not found.</div>';
        return;
    }
    const rows = window.OverlayShared?.resolveMeterRows
        ? window.OverlayShared.resolveMeterRows(display, {}, { customVars: varRes.variables || [], variableSets: varRes.sets || [] })
        : [];
    if (!rows.length) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">No sources bound to this meter.</div>';
        return;
    }
    const readOnly = isEditLocked();
    el.innerHTML = `<div style="display:grid;gap:.55rem;">${rows.map(row => {
        const attrs = row.kind === 'set-entry'
            ? `data-mtr-kind="set-entry" data-mtr-set="${esc(row.setId)}" data-mtr-entry="${esc(row.entryId)}" data-mtr-field="${esc(row.valueField)}" data-mtr-cap="${row.cap}"`
            : `data-mtr-kind="variable" data-mtr-var="${esc(row.variableName)}" data-mtr-cap="${row.cap}"`;
        return `<div style="display:grid;gap:.35rem;padding:.45rem .55rem;border:1px solid var(--border);border-radius:7px;background:var(--bg-inset);">
            <div class="op-panel-row"><strong style="font-size:.82rem;">${esc(row.label)}</strong><span class="op-pill" style="font-variant-numeric:tabular-nums;">${row.value} / ${row.cap} (${Math.round(row.pct)}%)</span></div>
            <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;"><div style="height:100%;width:${row.pct}%;background:${esc(display.meter?.fillColor || '#22c55e')};transition:width .25s ease;"></div></div>
            ${readOnly ? '' : `<div class="op-btn-row">
                <button type="button" class="op-btn sm" data-mtr-act="step" data-delta="-10" ${attrs}>-10</button>
                <button type="button" class="op-btn sm" data-mtr-act="step" data-delta="-1" ${attrs}>-1</button>
                <button type="button" class="op-btn sm" data-mtr-act="step" data-delta="1" ${attrs}>+1</button>
                <button type="button" class="op-btn sm" data-mtr-act="step" data-delta="10" ${attrs}>+10</button>
                <button type="button" class="op-btn sm" data-mtr-act="full" ${attrs}>Full</button>
                <button type="button" class="op-btn sm" data-mtr-act="zero" ${attrs}>0</button>
            </div>`}
        </div>`;
    }).join('')}</div>`;
}

registerCardType({
    type: 'meter-display',
    moduleId: 'variables',
    label: 'Meter & Gauge Controls',
    description: 'Quick HP bar / meter controls (-10, -1, +1, +10, Full, 0) for a saved Meter display.',
    iconSvg: OP_ICONS.variables,
    isEnabled: () => true,
    async getPickerItems() {
        const res = await fetchDisplays(true);
        return (res.displays || [])
            .filter(d => d.kind === 'meter')
            .map(d => ({ title: d.name, subtitle: `${d.meter?.style || 'bar'} meter`, defaultTitle: d.name, config: { displayId: d.id } }));
    },
    mount(el, card) {
        const refresh = () => renderMeterCard(el, card).catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const btn = e.target.closest('[data-mtr-act]');
            if (!btn) return;
            const act = btn.dataset.mtrAct;
            const kind = btn.dataset.mtrKind;
            const cap = Number(btn.dataset.mtrCap) || 100;
            try {
                if (kind === 'variable') {
                    const name = btn.dataset.mtrVar;
                    if (act === 'full' || act === 'zero') await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { value: act === 'full' ? cap : 0 });
                    else await api(`/api/variables/${encodeURIComponent(name)}/increment`, 'POST', { delta: Number(btn.dataset.delta) || 1 });
                } else {
                    const setId = btn.dataset.mtrSet, entry = btn.dataset.mtrEntry, field = btn.dataset.mtrField;
                    if (act === 'full' || act === 'zero') await api(`/api/variables/sets/${encodeURIComponent(setId)}/entry/set`, 'PATCH', { entry, field, value: act === 'full' ? String(cap) : '0' });
                    else await api(`/api/variables/sets/${encodeURIComponent(setId)}/entry/step`, 'PATCH', { entry, field, delta: Number(btn.dataset.delta) || 1 });
                }
                await fetchVars(true);
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        refresh();
    },
    onSocket(el, card, type) {
        if (['variables', 'variables-update', 'variable-displays', 'variable-displays-update'].includes(type)) {
            varsCache = null; displaysCache = null; el._opRefresh?.();
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 3. News Ticker Feed Card
// ============================================================
async function renderTickerCard(el, card) {
    const displayId = card.config?.displayId || '';
    const [dispRes, varRes] = await Promise.all([fetchDisplays(), fetchVars()]);
    const display = (dispRes.displays || []).find(d => d.id === displayId && d.kind === 'ticker');
    if (!display) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">Saved News Ticker not found.</div>';
        return;
    }
    const cfg = display.ticker || {};
    const items = window.OverlayShared?.resolveTickerItems
        ? window.OverlayShared.resolveTickerItems(display, {}, { customVars: varRes.variables || [], variableSets: varRes.sets || [] })
        : [];
    const readOnly = isEditLocked();
    const isList = cfg.sourceMode === 'list' && cfg.listVariable;
    el.innerHTML = `
        <div class="op-panel-row" style="margin-bottom:.35rem;">
            <span class="op-pill">${items.length} headlines</span>
            <span class="op-pill">${esc(cfg.badgeText || 'Ticker')}</span>
        </div>
        ${isList && !readOnly ? `<form class="op-inline-group" data-tkr-add="${esc(cfg.listVariable)}" style="margin-bottom:.4rem;">
            <input type="text" class="op-cell-input" data-tkr-input placeholder="Add headline…" autocomplete="off">
            <button type="submit" class="op-btn sm primary">Add</button>
        </form>` : ''}
        <div style="display:grid;gap:.3rem;max-height:190px;overflow:auto;">
            ${items.map((it, idx) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:.4rem;padding:.25rem .45rem;border:1px solid var(--border);border-radius:5px;font-size:.78rem;">
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.text)}</span>
                ${isList && !readOnly ? `<button type="button" class="op-icon-btn danger" data-tkr-del="${esc(cfg.listVariable)}" data-tkr-idx="${idx}" title="Remove">&times;</button>` : ''}
            </div>`).join('') || '<div style="font-size:.78rem;color:var(--text-muted);">No headlines yet.</div>'}
        </div>`;
}

registerCardType({
    type: 'ticker-display',
    moduleId: 'variables',
    label: 'News Ticker Feed',
    description: 'View and quick-add live headlines for a saved News Ticker display.',
    iconSvg: OP_ICONS.variables,
    isEnabled: () => true,
    async getPickerItems() {
        const res = await fetchDisplays(true);
        return (res.displays || [])
            .filter(d => d.kind === 'ticker')
            .map(d => ({ title: d.name, subtitle: d.ticker?.badgeText || 'News Ticker', defaultTitle: d.name, config: { displayId: d.id } }));
    },
    mount(el, card) {
        const refresh = () => renderTickerCard(el, card).catch(err => { el.textContent = err.message; });
        const onSubmit = async e => {
            const form = e.target.closest('[data-tkr-add]');
            if (!form || isEditLocked()) return;
            e.preventDefault();
            const name = form.dataset.tkrAdd;
            const input = form.querySelector('[data-tkr-input]');
            const line = (input?.value || '').trim();
            if (!line) return;
            const vars = await fetchVars(true);
            const v = (vars.variables || []).find(item => item.name === name);
            const cur = Array.isArray(v?.items) ? v.items : [];
            input.value = '';
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { items: [...cur, line] });
            await fetchVars(true);
            refresh();
        };
        const onClick = async e => {
            const del = e.target.closest('[data-tkr-del]');
            if (!del || isEditLocked()) return;
            const name = del.dataset.tkrDel;
            const idx = Number(del.dataset.tkrIdx);
            const vars = await fetchVars(true);
            const v = (vars.variables || []).find(item => item.name === name);
            const cur = Array.isArray(v?.items) ? [...v.items] : [];
            cur.splice(idx, 1);
            await api(`/api/variables/${encodeURIComponent(name)}`, 'PUT', { items: cur });
            await fetchVars(true);
            refresh();
        };
        el.addEventListener('submit', onSubmit);
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => { el.removeEventListener('submit', onSubmit); el.removeEventListener('click', onClick); };
        refresh();
    },
    onSocket(el, card, type) {
        if (['variables', 'variables-update', 'variable-displays', 'variable-displays-update'].includes(type)) {
            varsCache = null; displaysCache = null; el._opRefresh?.();
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 4. Versus Match Quick Score Card
// ============================================================
async function renderVersusCard(el) {
    const data = await api('/api/matchup');
    const p1 = data.p1 || { name: 'Player 1', score: 0 };
    const p2 = data.p2 || { name: 'Player 2', score: 0 };
    const readOnly = isEditLocked();
    el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.5rem;align-items:center;text-align:center;">
            <div style="display:grid;gap:.3rem;">
                <strong style="font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p1.name || 'Player 1')}</strong>
                <div style="font-size:1.45rem;font-weight:800;font-variant-numeric:tabular-nums;">${Number(p1.score) || 0}</div>
                ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;">
                    <button type="button" class="op-btn sm" data-vs-act="p1" data-delta="-1">-1</button>
                    <button type="button" class="op-btn sm primary" data-vs-act="p1" data-delta="1">+1</button>
                </div>`}
            </div>
            <div style="font-size:.72rem;font-weight:800;color:var(--text-muted);">VS</div>
            <div style="display:grid;gap:.3rem;">
                <strong style="font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p2.name || 'Player 2')}</strong>
                <div style="font-size:1.45rem;font-weight:800;font-variant-numeric:tabular-nums;">${Number(p2.score) || 0}</div>
                ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;">
                    <button type="button" class="op-btn sm" data-vs-act="p2" data-delta="-1">-1</button>
                    <button type="button" class="op-btn sm primary" data-vs-act="p2" data-delta="1">+1</button>
                </div>`}
            </div>
        </div>
        ${readOnly ? '' : `<div class="op-btn-row" style="justify-content:center;margin-top:.55rem;">
            <button type="button" class="op-btn sm" data-vs-act="swap">Swap</button>
            <button type="button" class="op-btn sm" data-vs-act="reset">Reset Scores</button>
        </div>`}`;
}

registerCardType({
    type: 'versus-quick',
    moduleId: 'board',
    label: 'Versus Match Score',
    description: 'Live Player 1 / Player 2 score buttons, Swap, and Reset.',
    iconSvg: OP_ICONS.board,
    isEnabled: status => status?.modules?.matchup !== false,
    mount(el) {
        const refresh = () => renderVersusCard(el).catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const btn = e.target.closest('[data-vs-act]');
            if (!btn) return;
            const act = btn.dataset.vsAct;
            try {
                if (act === 'p1' || act === 'p2') {
                    const delta = Number(btn.dataset.delta) || 1;
                    await api(`/api/matchup/score/${act}/${delta > 0 ? 'inc' : 'dec'}`, 'POST', {});
                } else if (act === 'swap') {
                    await api('/api/matchup/swap', 'POST', {});
                } else if (act === 'reset') {
                    const before = await api('/api/matchup');
                    await api('/api/matchup/reset', 'POST', {});
                    undoToast('Reset Versus scores', async () => {
                        await api('/api/matchup', 'POST', { p1: { ...before.p1 }, p2: { ...before.p2 } });
                        refresh();
                    });
                }
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'matchup' || type === 'matchup-update') el._opRefresh?.();
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 5. Active Poll Quick Card
// ============================================================
async function renderPollCard(el) {
    const data = await api('/api/polls/status');
    const poll = data?.poll || data;
    if (!poll || (!poll.active && !(poll.options || []).length)) {
        el.innerHTML = '<div style="font-size:.8rem;color:var(--text-muted);">No active poll. Start one in <a href="/polls.html" style="color:var(--accent);">Polls Studio</a>.</div>';
        return;
    }
    const opts = poll.options || [];
    const total = opts.reduce((s, o) => s + (Number(o.votes) || 0), 0);
    const readOnly = isEditLocked();
    el.innerHTML = `
        <div class="op-panel-row" style="margin-bottom:.4rem;">
            <strong style="font-size:.82rem;">${esc(poll.question || 'Active Poll')}</strong>
            <span class="op-pill ${poll.active ? 'is-live' : ''}">${poll.active ? 'Live' : 'Ended'} · ${total}</span>
        </div>
        <div style="display:grid;gap:.3rem;margin-bottom:.45rem;">
            ${opts.map(o => {
                const votes = Number(o.votes) || 0;
                const pct = total ? Math.round((votes / total) * 100) : 0;
                return `<div style="font-size:.76rem;">
                    <div style="display:flex;justify-content:space-between;"><span>${esc(o.label || o.text || '')}</span><span style="font-variant-numeric:tabular-nums;">${votes} (${pct}%)</span></div>
                    <div style="height:5px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:2px;"><div style="height:100%;width:${pct}%;background:var(--accent);"></div></div>
                </div>`;
            }).join('')}
        </div>
        ${readOnly ? '' : `<div class="op-btn-row">
            ${poll.active ? '<button type="button" class="op-btn sm" data-poll-act="end">End Poll</button>' : ''}
            <button type="button" class="op-btn sm" data-poll-act="clear">Clear</button>
        </div>`}`;
}

registerCardType({
    type: 'poll-quick',
    moduleId: 'board',
    label: 'Active Poll Controls',
    description: 'Monitor live poll votes and End or Clear the active poll.',
    iconSvg: OP_ICONS.board,
    isEnabled: status => status?.modules?.polls !== false,
    mount(el) {
        const refresh = () => renderPollCard(el).catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const btn = e.target.closest('[data-poll-act]');
            if (!btn) return;
            try {
                await api(`/api/polls/${btn.dataset.pollAct}`, 'POST', {});
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'poll' || type === 'poll-update') el._opRefresh?.();
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 6. Trivia Quick Control Card
// ============================================================
async function renderTriviaCard(el) {
    const data = await api('/api/trivia/status');
    const readOnly = isEditLocked();
    const stateLabel = data?.state || 'idle';
    el.innerHTML = `
        <div class="op-panel-row" style="margin-bottom:.35rem;">
            <span class="op-pill ${stateLabel === 'question' ? 'is-live' : ''}">${esc(stateLabel)}</span>
            <span class="op-pill">${Number(data?.voteCount || 0)} votes</span>
        </div>
        <div style="font-size:.82rem;font-weight:600;margin-bottom:.45rem;">${esc(data?.question || 'No active question.')}</div>
        ${readOnly ? '' : `<div class="op-btn-row">
            <button type="button" class="op-btn sm primary" data-triv-act="question/next">Next</button>
            <button type="button" class="op-btn sm" data-triv-act="question/reveal">Reveal</button>
            <button type="button" class="op-btn sm" data-triv-act="reset">Reset</button>
        </div>`}`;
}

registerCardType({
    type: 'trivia-quick',
    moduleId: 'board',
    label: 'Trivia Controls',
    description: 'Run Next Question, Reveal Answer, and Reset from the Live Board.',
    iconSvg: OP_ICONS.board,
    isEnabled: status => status?.modules?.trivia !== false,
    mount(el) {
        const refresh = () => renderTriviaCard(el).catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const btn = e.target.closest('[data-triv-act]');
            if (!btn) return;
            try {
                await api(`/api/trivia/${btn.dataset.trivAct}`, 'POST', {});
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = refresh;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'trivia' || type === 'trivia-update') el._opRefresh?.();
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 7. Session Runbook / Cue Checklist Card
// ============================================================
function runbookKey(cardId) { return `streampulse_op_runbook_${cardId}`; }

function loadRunbook(cardId) {
    try {
        const parsed = JSON.parse(localStorage.getItem(runbookKey(cardId)) || 'null');
        if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
    return [
        { text: 'Check mic levels & OBS recording', done: false },
        { text: 'Verify overlays & scene audio', done: false },
        { text: 'Start StreamPulse session', done: false }
    ];
}

function saveRunbook(cardId, items) {
    try { localStorage.setItem(runbookKey(cardId), JSON.stringify(items)); } catch { /* ignore */ }
}

registerCardType({
    type: 'runbook-cue',
    moduleId: 'board',
    label: 'Session Runbook / Cues',
    description: 'Pin a pre-show or live show checklist with one-click Reset for the next broadcast.',
    iconSvg: OP_ICONS.board,
    isEnabled: () => true,
    mount(el, card) {
        let items = loadRunbook(card.id);
        const draw = () => {
            const doneCount = items.filter(i => i.done).length;
            const readOnly = isEditLocked();
            el.innerHTML = `
                <div class="op-panel-row" style="margin-bottom:.4rem;">
                    <span class="op-pill ${doneCount === items.length && items.length ? 'is-ok' : ''}">${doneCount} / ${items.length} done</span>
                    <button type="button" class="op-btn sm" data-rb-reset="1">Reset Checks</button>
                </div>
                <div style="display:grid;gap:.3rem;margin-bottom:.45rem;">
                    ${items.map((item, idx) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:.4rem;font-size:.8rem;">
                        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;flex:1;min-width:0;text-decoration:${item.done ? 'line-through' : 'none'};opacity:${item.done ? '.6' : '1'};">
                            <input type="checkbox" data-rb-toggle="${idx}"${item.done ? ' checked' : ''}>
                            <span style="overflow:hidden;text-overflow:ellipsis;">${esc(item.text)}</span>
                        </label>
                        ${readOnly ? '' : `<button type="button" class="op-icon-btn danger" data-rb-del="${idx}" aria-label="Remove cue">&times;</button>`}
                    </div>`).join('')}
                </div>
                ${readOnly ? '' : `<form class="op-inline-group" data-rb-add="1">
                    <input type="text" class="op-cell-input" data-rb-input placeholder="Add cue…" autocomplete="off">
                    <button type="submit" class="op-btn sm primary">Add</button>
                </form>`}`;
        };
        const onChange = e => {
            const cb = e.target.closest('[data-rb-toggle]');
            if (!cb) return;
            const idx = Number(cb.dataset.rbToggle);
            if (items[idx]) { items[idx].done = cb.checked; saveRunbook(card.id, items); draw(); }
        };
        const onClick = e => {
            if (e.target.closest('[data-rb-reset]')) {
                items = items.map(i => ({ ...i, done: false }));
                saveRunbook(card.id, items);
                draw();
                return;
            }
            const del = e.target.closest('[data-rb-del]');
            if (del && !isEditLocked()) {
                items.splice(Number(del.dataset.rbDel), 1);
                saveRunbook(card.id, items);
                draw();
            }
        };
        const onSubmit = e => {
            if (!e.target.closest('[data-rb-add]') || isEditLocked()) return;
            e.preventDefault();
            const inp = el.querySelector('[data-rb-input]');
            const txt = (inp?.value || '').trim();
            if (!txt) return;
            items.push({ text: txt, done: false });
            saveRunbook(card.id, items);
            draw();
        };
        el.addEventListener('change', onChange);
        el.addEventListener('click', onClick);
        el.addEventListener('submit', onSubmit);
        el._opCleanup = () => { el.removeEventListener('change', onChange); el.removeEventListener('click', onClick); el.removeEventListener('submit', onSubmit); };
        draw();
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 8. Collapsible Mini-Monitor (zero idle cost when collapsed)
// ============================================================
registerCardType({
    type: 'live-monitor',
    moduleId: 'overlays',
    label: 'Display Mini-Monitor',
    description: 'Collapsible live preview of any saved Display Library design (pauses completely when collapsed).',
    iconSvg: OP_ICONS.overlays,
    isEnabled: () => true,
    async getPickerItems() {
        const res = await fetchDisplays(true);
        return (res.displays || []).map(d => ({
            title: d.name,
            subtitle: `${d.kind || 'inventory'} display`,
            defaultTitle: `Monitor: ${d.name}`,
            config: { displayId: d.id }
        }));
    },
    mount(el, card) {
        const displayId = card.config?.displayId || '';
        const storageKey = `streampulse_op_monitor_open_${card.id}`;
        let isOpen = localStorage.getItem(storageKey) === '1';

        const renderPreview = async () => {
            const stage = el.querySelector('[data-mon-stage]');
            if (!stage) return;
            if (!isOpen) {
                window.OverlayShared?.cleanupNode?.(stage);
                stage.replaceChildren();
                return;
            }
            const [dispRes, varRes] = await Promise.all([fetchDisplays(), fetchVars()]);
            const def = (dispRes.displays || []).find(d => d.id === displayId);
            if (!def) { stage.textContent = 'Display not found.'; return; }
            window.OverlayShared?.renderVariableDisplay?.(stage, {
                type: 'data-display',
                display: { displayId: def.id }
            }, {
                variableDisplays: [def],
                variableSets: varRes.sets || [],
                customVars: varRes.variables || [],
                bingoState: dispRes.bingoState || {}
            });
        };

        const draw = () => {
            el.innerHTML = `
                <div class="op-panel-row" style="margin-bottom:${isOpen ? '.45rem' : '0'};">
                    <span class="op-pill ${isOpen ? 'is-live' : ''}">${isOpen ? 'Live Monitor On' : 'Paused (Collapsed)'}</span>
                    <button type="button" class="op-btn sm" data-mon-toggle="1">${isOpen ? 'Collapse' : 'Show Live Preview'}</button>
                </div>
                <div data-mon-stage style="${isOpen ? 'width:100%;min-height:140px;max-height:260px;background:#090d16;border:1px solid var(--border);border-radius:7px;overflow:hidden;padding:6px;box-sizing:border-box;' : 'display:none;'}"></div>`;
            renderPreview().catch(() => {});
        };

        const onClick = e => {
            if (!e.target.closest('[data-mon-toggle]')) return;
            isOpen = !isOpen;
            try { localStorage.setItem(storageKey, isOpen ? '1' : '0'); } catch { /* ignore */ }
            draw();
        };
        el.addEventListener('click', onClick);
        el._opRefresh = () => { if (isOpen) renderPreview().catch(() => {}); };
        el._opCleanup = () => {
            el.removeEventListener('click', onClick);
            const stage = el.querySelector('[data-mon-stage]');
            if (stage) window.OverlayShared?.cleanupNode?.(stage);
        };
        draw();
    },
    onSocket(el, card, type) {
        if (['variables', 'variables-update', 'variable-displays', 'variable-displays-update'].includes(type)) {
            displaysCache = null; varsCache = null; el._opRefresh?.();
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 9. Credit Suite Live Transport Card
// ============================================================
registerCardType({
    type: 'credit-suite',
    moduleId: 'overlays',
    label: 'Credit Suite Transport',
    description: 'Cue Play, Pause, Restart, Stop, and Marker jumps on any Credit Suite sequence.',
    iconSvg: OP_ICONS.overlays,
    isEnabled: () => true,
    async getPickerItems() {
        try {
            const res = await fetch('/api/credit-suite').then(r => r.json());
            return (res.projects || []).map(p => ({
                title: p.name,
                subtitle: `${(p.blocks || []).length} blocks`,
                defaultTitle: `Credits: ${p.name}`,
                config: { projectId: p.id }
            }));
        } catch {
            return [{ title: 'Active Credit Suite Project', subtitle: 'Uses active project', defaultTitle: 'Credit Suite', config: { projectId: '' } }];
        }
    },
    mount(el, card) {
        const projectId = card.config?.projectId || '';
        const draw = async () => {
            try {
                const status = await fetch('/api/credit-suite/status').then(r => r.json());
                const markers = Array.isArray(status.markers) ? status.markers : [];
                const isPlaying = Boolean(status.playing);
                el.innerHTML = `
                    <div class="op-panel-row" style="margin-bottom:.45rem;">
                        <span class="op-pill ${isPlaying ? 'is-live' : ''}">${isPlaying ? 'Rolling' : 'Paused'}</span>
                        <span style="font-size:11px;color:var(--text-muted);">${Math.round(status.timeSec || 0)}s / ${Math.round(status.durationSec || 0)}s</span>
                    </div>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:${markers.length ? '.45rem' : '0'};">
                        <button type="button" class="op-btn sm primary" data-cs-act="${isPlaying ? 'pause' : 'play'}">${isPlaying ? 'Pause' : 'Play'}</button>
                        <button type="button" class="op-btn sm" data-cs-act="restart">Restart</button>
                        <button type="button" class="op-btn sm" data-cs-act="stop">Stop</button>
                        <a class="op-btn sm" href="/tools/credit-suite.html" style="text-decoration:none;">Studio</a>
                    </div>
                    ${markers.length ? `<div style="display:flex;gap:.3rem;flex-wrap:wrap;">${markers.map(m => `<button type="button" class="op-btn sm" data-cs-jump="${String(m.name || '').replace(/"/g, '&quot;')}">${String(m.name || '').replace(/</g, '&lt;')}</button>`).join('')}</div>` : ''}
                `;
            } catch {
                el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Credit Suite unavailable.</div>';
            }
        };
        const onClick = async e => {
            const actBtn = e.target.closest('[data-cs-act]');
            if (actBtn) {
                await fetch(`/api/credit-suite/${encodeURIComponent(actBtn.dataset.csAct)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId })
                });
                draw();
                return;
            }
            const jumpBtn = e.target.closest('[data-cs-jump]');
            if (jumpBtn) {
                await fetch('/api/credit-suite/jump', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, marker: jumpBtn.dataset.csJump })
                });
                draw();
            }
        };
        el.addEventListener('click', onClick);
        el._opRefresh = draw;
        el._opCleanup = () => el.removeEventListener('click', onClick);
        draw();
    },
    onSocket(el, card, type) {
        if (type === 'credit-suite-update' || type === 'credit-suite-transport') el._opRefresh?.();
    },
    unmount(el) { el._opCleanup?.(); }
});
