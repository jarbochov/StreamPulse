'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { getCardType, registerCardType, registerOperatorModule } from './operator-registry.js';
import { isEditLocked } from './operator-state.js';

let displaysCache = null;
let varsCache = null;

export async function fetchDisplaysCatalog(force = false) {
    if (!force && displaysCache) return displaysCache;
    displaysCache = await api('/api/variable-displays');
    return displaysCache;
}

const fetchDisplays = fetchDisplaysCatalog;

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
    moduleId: 'displays',
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
    moduleId: 'displays',
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
    moduleId: 'displays',
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
// 4. Active Poll & Quick Poll Launcher Card
// ============================================================
function formatPollRemaining(poll) {
    if (!poll || poll.status !== 'ACTIVE' || !poll.duration || !poll.startedAt) return '';
    const startedMs = Date.parse(poll.startedAt);
    if (Number.isNaN(startedMs)) return '';
    const elapsed = Math.floor((Date.now() - startedMs) / 1000);
    const rem = Math.max(0, Number(poll.duration) - elapsed);
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function renderPollComposerHtml(presets, openByDefault) {
    const presetChips = presets.length
        ? `<div style="display:grid;gap:.3rem;margin-bottom:.5rem;">
            <span style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Quick Launch Preset</span>
            <div class="op-btn-row" style="flex-wrap:wrap;">
                ${presets.slice(0, 8).map((p, idx) => `<button type="button" class="op-btn sm" data-poll-launch-preset="${idx}" title="${esc(p.title || p.name || '')}">${esc(p.name || p.title || `Preset ${idx + 1}`)}</button>`).join('')}
            </div>
        </div>`
        : '';

    const formHtml = `
        ${presetChips}
        <form data-poll-create-form="1" style="display:grid;gap:.45rem;">
            <input type="text" class="op-cell-input" name="title" placeholder="Poll question (e.g. What should we play next?)" required autocomplete="off">
            <textarea class="op-cell-input" name="choices" rows="3" placeholder="Choices (one per line, 2–10 choices)" required style="resize:vertical;min-height:66px;font-family:inherit;"></textarea>
            <div class="op-panel-row" style="flex-wrap:wrap;gap:.4rem;">
                <div style="display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;">
                    <label style="display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;color:var(--text-muted);">
                        Duration
                        <select name="duration" class="op-profile-select" style="min-width:86px;max-width:110px;">
                            <option value="60" selected>60s</option>
                            <option value="30">30s</option>
                            <option value="120">2 min</option>
                            <option value="300">5 min</option>
                            <option value="0">Manual</option>
                        </select>
                    </label>
                    <label style="display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;color:var(--text-muted);cursor:pointer;">
                        <input type="checkbox" name="blind">
                        <span>Blind</span>
                    </label>
                </div>
                <button type="submit" class="op-btn sm primary">Start Poll</button>
            </div>
        </form>`;

    if (openByDefault) {
        return `<div style="display:grid;gap:.35rem;padding:.55rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-inset);">
            <strong style="font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Start New Poll</strong>
            ${formHtml}
        </div>`;
    }
    return `<details style="margin-top:.55rem;padding:.45rem .55rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-inset);">
        <summary style="cursor:pointer;font-size:.76rem;font-weight:700;color:var(--text-muted);">Start Another Poll / Presets</summary>
        <div style="margin-top:.5rem;">${formHtml}</div>
    </details>`;
}

registerCardType({
    type: 'poll-quick',
    moduleId: 'polls',
    label: 'Active Poll Controls',
    description: 'Start new polls or saved presets, monitor live votes, extend timer, toggle voting/blind mode, End, or Cancel.',
    iconSvg: OP_ICONS.polls,
    isEnabled: status => status?.modules?.polls !== false,
    mount(el) {
        let latestPoll = null;
        let savedPresets = [];
        let pollTimer = null;

        const stopPollTimer = () => {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        };

        const syncPollTimer = () => {
            if (!latestPoll || latestPoll.status !== 'ACTIVE' || !latestPoll.duration || !latestPoll.startedAt) {
                stopPollTimer();
                return;
            }
            if (!pollTimer) {
                pollTimer = setInterval(() => {
                    if (document.hidden) return;
                    const pill = el.querySelector('[data-poll-remaining]');
                    if (pill) pill.textContent = formatPollRemaining(latestPoll) || '0s';
                }, 500);
            }
        };

        const render = async () => {
            const [latestRes, presetsRes] = await Promise.all([
                api('/api/polls/latest').catch(() => ({ poll: null })),
                api('/api/polls/presets').catch(() => ({ presets: [] }))
            ]);
            latestPoll = latestRes?.poll || null;
            savedPresets = Array.isArray(presetsRes?.presets) ? presetsRes.presets : [];
            const poll = latestPoll;
            const choices = Array.isArray(poll?.choices) ? poll.choices : [];
            const isActive = poll?.status === 'ACTIVE';
            const total = Number(poll?.totalVotes) || choices.reduce((s, c) => s + (Number(c.votes) || 0), 0);
            const readOnly = isEditLocked();
            const remText = formatPollRemaining(poll);

            const pollView = poll && choices.length ? `
                <div style="display:grid;gap:.45rem;margin-bottom:${isActive ? '0' : '.6rem'};">
                    <div class="op-panel-row" style="flex-wrap:wrap;gap:.35rem;">
                        <strong style="font-size:.86rem;">${esc(poll.title || 'Poll')}</strong>
                        <div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap;">
                            ${remText ? `<span class="op-pill is-live" data-poll-remaining="1" style="font-variant-numeric:tabular-nums;">${esc(remText)}</span>` : ''}
                            ${poll.blind ? '<span class="op-pill">Blind</span>' : ''}
                            ${poll.votingPaused ? '<span class="op-pill">Voting Paused</span>' : ''}
                            <span class="op-pill ${isActive ? 'is-live' : ''}">${isActive ? 'Live' : esc(poll.status || 'Ended')} · ${total}</span>
                        </div>
                    </div>
                    <div style="display:grid;gap:.35rem;">
                        ${choices.map((c, idx) => {
                            const votes = Number(c.votes) || 0;
                            const pct = c.percent !== undefined ? Math.round(Number(c.percent) || 0) : (total ? Math.round((votes / total) * 100) : 0);
                            return `<div style="font-size:.78rem;">
                                <div style="display:flex;justify-content:space-between;gap:.4rem;"><span><strong>${idx + 1}.</strong> ${esc(c.title || c.label || '')}</span><span style="font-variant-numeric:tabular-nums;">${votes} (${pct}%)</span></div>
                                <div style="height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:2px;"><div style="height:100%;width:${pct}%;background:var(--accent);transition:width .2s ease;"></div></div>
                            </div>`;
                        }).join('')}
                    </div>
                    ${readOnly || !isActive ? '' : `<div class="op-btn-row" style="flex-wrap:wrap;">
                        <button type="button" class="op-btn sm" data-poll-act="extend" data-seconds="30">+30s</button>
                        <button type="button" class="op-btn sm ${poll.votingPaused ? 'active' : ''}" data-poll-act="toggle-voting">${poll.votingPaused ? 'Resume Voting' : 'Pause Voting'}</button>
                        <button type="button" class="op-btn sm ${poll.blind ? 'active' : ''}" data-poll-act="toggle-blind">${poll.blind ? 'Show Results' : 'Blind Mode'}</button>
                        <button type="button" class="op-btn sm primary" data-poll-act="end">End Poll</button>
                        <button type="button" class="op-btn sm danger" data-poll-act="cancel">Cancel</button>
                    </div>`}
                </div>` : '<div style="font-size:.8rem;color:var(--text-muted);margin-bottom:.55rem;">No poll running right now. Launch one below or open <a href="/polls.html" style="color:var(--accent);">Polls Studio</a>.</div>';

            el.innerHTML = pollView + (readOnly ? '' : renderPollComposerHtml(savedPresets, !isActive));
            syncPollTimer();
        };

        const refresh = () => render().catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const presetBtn = e.target.closest('[data-poll-launch-preset]');
            if (presetBtn) {
                const preset = savedPresets[Number(presetBtn.dataset.pollLaunchPreset)];
                if (!preset) return;
                try {
                    await api('/api/polls/create', 'POST', {
                        title: preset.title || preset.name,
                        choices: preset.choices || [],
                        duration: preset.duration ?? 60,
                        blind: Boolean(preset.blind)
                    });
                    toast(`Started poll "${preset.title || preset.name}"`, 'success');
                    refresh();
                } catch (err) { toast(err.message, 'error'); }
                return;
            }
            const btn = e.target.closest('[data-poll-act]');
            if (!btn) return;
            const act = btn.dataset.pollAct;
            try {
                const payload = act === 'extend' ? { seconds: Number(btn.dataset.seconds) || 30 } : {};
                await api(`/api/polls/${act}`, 'POST', payload);
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        const onSubmit = async e => {
            const form = e.target.closest('[data-poll-create-form]');
            if (!form || isEditLocked()) return;
            e.preventDefault();
            const title = (form.elements.title?.value || '').trim();
            const rawChoices = String(form.elements.choices?.value || '')
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(Boolean);
            const choices = rawChoices.length >= 2
                ? rawChoices
                : String(form.elements.choices?.value || '').split(',').map(s => s.trim()).filter(Boolean);
            const duration = Number(form.elements.duration?.value) || 0;
            const blind = Boolean(form.elements.blind?.checked);
            if (!title) { toast('Enter a poll question', 'error'); return; }
            if (choices.length < 2) { toast('Enter at least 2 poll choices (one per line)', 'error'); return; }
            try {
                await api('/api/polls/create', 'POST', { title, choices, duration, blind });
                toast(`Started poll "${title}"`, 'success');
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        el.addEventListener('click', onClick);
        el.addEventListener('submit', onSubmit);
        el._opRefresh = refresh;
        el._opCleanup = () => {
            stopPollTimer();
            el.removeEventListener('click', onClick);
            el.removeEventListener('submit', onSubmit);
        };
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'poll' || type === 'poll-update') el._opRefresh?.();
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 5. Trivia Quick Control Card (with Up-Next preview & live timer)
// ============================================================
registerCardType({
    type: 'trivia-quick',
    moduleId: 'trivia',
    label: 'Trivia Controls',
    description: 'Preview up-next questions, jump to any question, run Start/Prev/Next/Reveal/Clear/Reset with live countdown and chat vote bars.',
    iconSvg: OP_ICONS.trivia,
    isEnabled: status => status?.modules?.trivia !== false,
    mount(el) {
        let triviaTimer = null;
        let selectedStartIndex = 0;
        let activeEndsAt = 0;
        let activePhase = 'idle';

        const stopTriviaTimer = () => {
            if (triviaTimer) { clearInterval(triviaTimer); triviaTimer = null; }
        };

        const syncTriviaTimer = () => {
            if (activePhase !== 'question' || !activeEndsAt) {
                stopTriviaTimer();
                return;
            }
            if (!triviaTimer) {
                triviaTimer = setInterval(() => {
                    if (document.hidden) return;
                    const pill = el.querySelector('[data-triv-timer]');
                    if (!pill) return;
                    const rem = Math.max(0, Math.ceil((activeEndsAt - Date.now()) / 1000));
                    pill.textContent = `${rem}s`;
                    pill.classList.toggle('is-live', rem > 0);
                }, 250);
            }
        };

        const render = async () => {
            // Prefer full admin state (gives questions bank + endsAt + correctIndex), fall back to /api/trivia/status
            let data = await api('/api/trivia?includeAnswers=true').catch(() => null);
            if (!data || !data.status) {
                data = await api('/api/trivia/status');
            }
            const readOnly = isEditLocked();
            const stateLabel = data?.status || 'idle';
            activePhase = stateLabel;
            const questions = Array.isArray(data?.questions) ? data.questions : [];
            const totalQ = Number(data?.totalQuestions ?? questions.length) || 0;
            const curIdx = Number(data?.currentIndex);
            const activeQ = data?.activeQuestion || null;
            const defaultDur = Number(data?.settings?.defaultDuration) || 20;

            // Choose preview/upcoming question when idle so user immediately sees Q1 + timer
            let upcomingIdx = 0;
            if (questions.length) {
                if (selectedStartIndex >= 0 && selectedStartIndex < questions.length) {
                    upcomingIdx = selectedStartIndex;
                } else {
                    const firstUnplayed = questions.findIndex(q => !q.done && !q.played);
                    upcomingIdx = firstUnplayed !== -1 ? firstUnplayed : 0;
                    selectedStartIndex = upcomingIdx;
                }
            }
            const upcomingQ = stateLabel === 'idle' && questions.length ? questions[upcomingIdx] : null;

            const qNum = stateLabel === 'idle'
                ? (upcomingQ ? upcomingIdx + 1 : 0)
                : (Number.isInteger(curIdx) && curIdx >= 0 ? curIdx + 1 : 1);
            const questionText = activeQ?.question || data?.activeQuestionText || upcomingQ?.question || '';
            const category = activeQ?.category || data?.activeCategory || upcomingQ?.category || '';
            const votes = Number(activeQ?.totalVotes ?? data?.totalVotes) || 0;

            // Compute live timer readout
            const endsAtMs = activeQ?.endsAt ? Number(activeQ.endsAt) : 0;
            const rawRem = Number(activeQ?.remainingSeconds ?? data?.remainingSeconds) || 0;
            activeEndsAt = stateLabel === 'question'
                ? (endsAtMs || (rawRem > 0 ? Date.now() + rawRem * 1000 : 0))
                : 0;
            const timerSeconds = stateLabel === 'question'
                ? (activeEndsAt ? Math.max(0, Math.ceil((activeEndsAt - Date.now()) / 1000)) : rawRem)
                : (Number(activeQ?.duration || upcomingQ?.duration || defaultDur) || 0);

            const choices = Array.isArray(activeQ?.choices)
                ? activeQ.choices.map((c, idx) => ({
                    letter: c.letter || c.label || String.fromCharCode(65 + idx),
                    text: c.text || '',
                    votes: Number(c.votes) || 0,
                    percent: c.percent !== undefined ? Math.round(Number(c.percent) || 0) : (votes ? Math.round(((Number(c.votes) || 0) / votes) * 100) : 0),
                    isCorrect: Boolean(c.isCorrect) || (activeQ.correctIndex !== null && activeQ.correctIndex !== undefined && Number(activeQ.correctIndex) === idx)
                }))
                : (upcomingQ && Array.isArray(upcomingQ.choices)
                    ? upcomingQ.choices.map((txt, idx) => ({
                        letter: String.fromCharCode(65 + idx),
                        text: typeof txt === 'string' ? txt : (txt?.text || ''),
                        votes: 0,
                        percent: 0,
                        isCorrect: upcomingQ.correctIndex !== undefined && Number(upcomingQ.correctIndex) === idx
                    }))
                    : []);

            const statusBadgeText = stateLabel === 'idle'
                ? (upcomingQ ? 'Up Next' : 'Idle')
                : stateLabel === 'question'
                    ? 'Live'
                    : 'Revealed';

            el.innerHTML = `
                <div style="display:grid;gap:.45rem;">
                    <div class="op-panel-row" style="flex-wrap:wrap;gap:.35rem;">
                        <div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap;">
                            <span class="op-pill ${stateLabel === 'question' ? 'is-live' : (stateLabel === 'reveal' ? 'is-ok' : '')}">${esc(statusBadgeText)}</span>
                            ${totalQ > 0 ? `<span class="op-pill">Q ${qNum || 1} / ${totalQ}</span>` : ''}
                            ${category ? `<span class="op-pill">${esc(category)}</span>` : ''}
                        </div>
                        <div style="display:flex;gap:.3rem;align-items:center;">
                            ${timerSeconds > 0 ? `<span class="op-pill ${stateLabel === 'question' ? 'is-live' : ''}" data-triv-timer="1" style="font-family:monospace;font-weight:700;font-variant-numeric:tabular-nums;">${timerSeconds}s</span>` : ''}
                            ${stateLabel !== 'idle' ? `<span class="op-pill">${votes} vote${votes === 1 ? '' : 's'}</span>` : ''}
                        </div>
                    </div>
                    ${questions.length > 1 && !readOnly ? `<select class="op-profile-select" style="max-width:100%;width:100%;" data-triv-pick="1" aria-label="Select trivia question">
                        ${questions.map((q, idx) => `<option value="${idx}"${(stateLabel === 'idle' ? idx === upcomingIdx : idx === curIdx) ? ' selected' : ''}>Q${idx + 1}${q.done || q.played ? ' [Done]' : ''}: ${esc((q.question || '').slice(0, 72))}</option>`).join('')}
                    </select>` : ''}
                    <div style="font-size:.88rem;font-weight:600;line-height:1.35;">${questionText ? esc(questionText) : 'No trivia questions yet. Add questions in <a href="/trivia.html" style="color:var(--accent);">Trivia Studio</a>.'}</div>
                    ${choices.length ? `<div style="display:grid;gap:.3rem;">
                        ${choices.map(c => {
                            const showCorrect = stateLabel === 'reveal' && c.isCorrect;
                            const showHintCorrect = stateLabel !== 'reveal' && c.isCorrect;
                            return `<div style="padding:.3rem .48rem;border:1px solid ${showCorrect ? 'rgba(34,197,94,.55)' : 'var(--border)'};border-radius:6px;background:${showCorrect ? 'rgba(34,197,94,.12)' : 'var(--bg-inset)'};font-size:.78rem;">
                                <div style="display:flex;justify-content:space-between;gap:.4rem;align-items:center;">
                                    <span><strong>${esc(c.letter)}.</strong> ${esc(c.text)}${showCorrect ? ' <span class="op-pill is-ok" style="margin-left:.25rem;font-size:.65rem;">Correct</span>' : (showHintCorrect ? ' <span class="op-pill" style="margin-left:.25rem;font-size:.63rem;opacity:.75;">Answer</span>' : '')}</span>
                                    ${stateLabel !== 'idle' ? `<span style="font-variant-numeric:tabular-nums;color:var(--text-muted);">${c.votes} (${c.percent}%)</span>` : ''}
                                </div>
                                ${stateLabel !== 'idle' ? `<div style="height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:3px;"><div style="height:100%;width:${c.percent}%;background:${showCorrect ? '#22c55e' : 'var(--accent)'};"></div></div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>` : ''}
                    ${stateLabel === 'reveal' && activeQ?.funfact ? `<div style="font-size:.76rem;color:var(--text-muted);padding:.35rem .5rem;border-left:3px solid var(--accent);background:var(--bg-inset);border-radius:4px;">${esc(activeQ.funfact)}</div>` : ''}
                    ${readOnly ? '' : `<div class="op-btn-row" style="flex-wrap:wrap;padding-top:.2rem;">
                        ${stateLabel === 'idle' ? `<button type="button" class="op-btn sm primary" data-triv-start-idx="${upcomingIdx}" ${totalQ > 0 ? '' : 'disabled'}>Start Q${qNum || 1}</button>` : ''}
                        <button type="button" class="op-btn sm" data-triv-act="question/prev" ${totalQ > 0 ? '' : 'disabled'}>Prev</button>
                        <button type="button" class="op-btn sm ${stateLabel !== 'idle' ? 'primary' : ''}" data-triv-act="question/next" ${totalQ > 0 ? '' : 'disabled'}>Next</button>
                        <button type="button" class="op-btn sm" data-triv-act="question/reveal" ${stateLabel === 'question' ? '' : 'disabled'}>Reveal</button>
                        <button type="button" class="op-btn sm" data-triv-act="question/clear" ${stateLabel !== 'idle' ? '' : 'disabled'}>Clear</button>
                        <button type="button" class="op-btn sm danger" data-triv-act="reset">Reset</button>
                    </div>`}
                </div>`;
            syncTriviaTimer();
        };

        const refresh = () => render().catch(err => { el.textContent = err.message; });
        const onClick = async e => {
            if (isEditLocked()) return;
            const startBtn = e.target.closest('[data-triv-start-idx]');
            if (startBtn) {
                try {
                    await api('/api/trivia/question/start', 'POST', { index: Number(startBtn.dataset.trivStartIdx) || 0 });
                    refresh();
                } catch (err) { toast(err.message, 'error'); }
                return;
            }
            const btn = e.target.closest('[data-triv-act]');
            if (!btn) return;
            try {
                await api(`/api/trivia/${btn.dataset.trivAct}`, 'POST', {});
                refresh();
            } catch (err) { toast(err.message, 'error'); }
        };
        const onChange = async e => {
            const pick = e.target.closest('[data-triv-pick]');
            if (!pick || isEditLocked()) return;
            const idx = Number(pick.value) || 0;
            selectedStartIndex = idx;
            if (activePhase === 'idle') {
                refresh();
            } else {
                try {
                    await api('/api/trivia/question/start', 'POST', { index: idx });
                    refresh();
                } catch (err) { toast(err.message, 'error'); }
            }
        };
        el.addEventListener('click', onClick);
        el.addEventListener('change', onChange);
        el._opRefresh = refresh;
        el._opCleanup = () => {
            stopTriviaTimer();
            el.removeEventListener('click', onClick);
            el.removeEventListener('change', onChange);
        };
        refresh();
    },
    onSocket(el, card, type) {
        if (type === 'trivia' || type === 'trivia-update' || String(type || '').startsWith('trivia:')) {
            el._opRefresh?.();
        }
    },
    unmount(el) { el._opCleanup?.(); }
});

// ============================================================
// 6. Collapsible Mini-Monitor (zero idle cost when collapsed)
// ============================================================
registerCardType({
    type: 'live-monitor',
    moduleId: 'displays',
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
// Top-Level Operator Domain Tabs for Displays, Versus, Polls, Trivia & Runbook
// ============================================================

function registerCardBackedDomain({ id, label, iconSvg, order, cardType, studioHref, studioLabel, description, isEnabled = () => true, getCardId = () => `domain-${id}` }) {
    let mountedBody = null;
    let mountedCard = null;
    let mountedDef = null;

    registerOperatorModule({
        id,
        label,
        iconSvg,
        order,
        isEnabled,
        async mount(container, ctx) {
            if (mountedDef && mountedBody) {
                try { mountedDef.unmount?.(mountedBody); } catch { /* ignore */ }
            }
            mountedDef = getCardType(cardType);
            mountedCard = { id: getCardId(ctx), type: cardType, title: label, config: {} };
            container.innerHTML = `
                <div class="op-domain-stack">
                    <section class="op-toolbar" aria-label="${esc(label)} controls">
                        <div class="op-toolbar-left">
                            <span style="display:inline-flex;align-items:center;gap:.45rem;font-weight:700;font-size:.9rem;">${iconSvg} ${esc(label)}</span>
                            <span style="font-size:.78rem;color:var(--text-muted);">${esc(description || '')}</span>
                        </div>
                        <div class="op-toolbar-right">
                            ${studioHref ? `<a class="op-btn sm" href="${esc(studioHref)}">${esc(studioLabel || `Open ${label}`)}</a>` : ''}
                        </div>
                    </section>
                    <section class="op-panel" style="max-width:780px;">
                        <div class="op-panel-body" data-domain-card-host="1"></div>
                    </section>
                </div>`;
            mountedBody = container.querySelector('[data-domain-card-host]');
            if (mountedDef && mountedBody) {
                await mountedDef.mount(mountedBody, mountedCard, ctx);
            }
        },
        unmount() {
            if (mountedDef && mountedBody) {
                try { mountedDef.unmount?.(mountedBody); } catch { /* ignore */ }
            }
            mountedBody = null;
            mountedCard = null;
            mountedDef = null;
        },
        onSocket(type, payload) {
            if (mountedDef && mountedBody && mountedCard) {
                mountedDef.onSocket?.(mountedBody, mountedCard, type, payload);
            }
        }
    });
}

registerCardBackedDomain({
    id: 'polls',
    label: 'Polls',
    iconSvg: OP_ICONS.polls,
    order: 65,
    cardType: 'poll-quick',
    studioHref: '/polls.html',
    studioLabel: 'Open Polls Studio',
    description: 'Start, close, and monitor live polls.',
    isEnabled: status => status?.modules?.polls !== false
});

registerCardBackedDomain({
    id: 'trivia',
    label: 'Trivia',
    iconSvg: OP_ICONS.trivia,
    order: 70,
    cardType: 'trivia-quick',
    studioHref: '/trivia.html',
    studioLabel: 'Open Trivia Studio',
    description: 'Advance questions, reveal answers, and control live trivia rounds.',
    isEnabled: status => status?.modules?.trivia !== false
});
