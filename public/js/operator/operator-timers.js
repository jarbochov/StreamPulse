'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';

let timersState = { timers: [] };
let subathonState = null;
let domainMounted = false;
let domainContainer = null;
let tickInterval = null;
const activeTickers = new Set();

/** Normalize `/api/timers` response (`{ timers: { id: snapshot } }` or Array) to an array. */
function normalizeTimersList(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (raw && typeof raw === 'object') return Object.values(raw).filter(Boolean);
    return [];
}

/** Merge a single live `timer-update` snapshot into cached state. */
function upsertTimerSnapshot(snapshot) {
    if (!snapshot?.id) return false;
    const list = [...(timersState.timers || [])];
    const idx = list.findIndex(t => t.id === snapshot.id);
    if (idx >= 0) list[idx] = snapshot;
    else list.push(snapshot);
    timersState = { timers: list };
    syncTickLoop();
    return true;
}

function formatMs(ms, showHours = true) {
    const clamped = Math.max(0, Math.floor(Number(ms) || 0));
    const totalSec = Math.floor(clamped / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    if (showHours || hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
}

function liveTimerMs(t) {
    if (!t) return 0;
    const now = Date.now();
    if (t.kind === 'stopwatch') {
        if (t.state === 'running' && t.startedAt) {
            return Math.max(0, (Number(t.accumulatedMs) || 0) + Math.max(0, now - Number(t.startedAt)));
        }
        return Math.max(0, Number(t.elapsedMs) || Number(t.accumulatedMs) || 0);
    }
    if (t.state === 'running') {
        if (t.endsAt) return Math.max(0, Number(t.endsAt) - now);
        if (t.startedAt && t.startingRemainingMs !== undefined) {
            return Math.max(0, Number(t.startingRemainingMs) - Math.max(0, now - Number(t.startedAt)));
        }
    }
    if (t.mode === 'date' && t.state === 'idle' && t.targetAt) {
        const targetMs = Date.parse(t.targetAt);
        if (Number.isFinite(targetMs)) return Math.max(0, targetMs - now);
    }
    return Math.max(0, Number(t.remainingMs) || 0);
}

function updateLiveTickDOM() {
    if (document.hidden) return;
    for (const host of [domainContainer, ...activeTickers]) {
        if (!host) continue;
        host.querySelectorAll('[data-timer-readout]').forEach(el => {
            const id = el.dataset.timerReadout;
            const timer = (timersState.timers || []).find(t => t.id === id);
            if (!timer) return;
            el.textContent = formatMs(liveTimerMs(timer));
        });
    }
}

function syncTickLoop() {
    const hasRunning = (timersState.timers || []).some(t => t.state === 'running');
    const visibleHolders = Boolean(domainMounted || activeTickers.size > 0);
    if (hasRunning && visibleHolders && !document.hidden) {
        if (!tickInterval) {
            tickInterval = setInterval(updateLiveTickDOM, 1000);
        }
    } else if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateLiveTickDOM();
    syncTickLoop();
});

async function fetchTimersData(includeSubathon = false) {
    const timersRes = await api('/api/timers');
    timersState = { timers: normalizeTimersList(timersRes?.timers ?? timersRes) };
    if (includeSubathon) {
        try {
            subathonState = await api('/api/subathon');
        } catch {
            subathonState = null;
        }
    }
    syncTickLoop();
    return { timersState, subathonState };
}

async function controlTimer(id, action, payload = {}) {
    await api(`/api/timers/${encodeURIComponent(id)}/${action}`, 'POST', payload);
    await fetchTimersData(false);
}

function renderTimerCardHtml(timer, compact = false) {
    const running = timer.state === 'running';
    const ms = liveTimerMs(timer);
    return `
        <article class="${compact ? '' : 'op-panel-card'}" data-timer-card="${esc(timer.id)}">
            <div class="op-panel-row">
                <div>
                    <strong style="font-size:.9rem;">${esc(timer.label || timer.id)}</strong>
                    <div style="font-size:.74rem;color:var(--text-muted);">${esc(timer.kind === 'stopwatch' ? 'Stopwatch' : 'Countdown')} · ${esc(timer.state)}</div>
                </div>
                <span class="op-timer-readout ${running ? 'is-running' : ''}" data-timer-readout="${esc(timer.id)}">${esc(formatMs(ms))}</span>
            </div>
            <div class="op-btn-row">
                <button type="button" class="op-btn sm ${running ? 'active' : 'primary'}" data-timer-act="${running ? 'pause' : 'start'}" data-timer-id="${esc(timer.id)}">
                    ${running ? OP_ICONS.pause : OP_ICONS.play} ${running ? 'Pause' : 'Start'}
                </button>
                <button type="button" class="op-btn sm" data-timer-act="reset" data-timer-id="${esc(timer.id)}">${OP_ICONS.reset} Reset</button>
                ${timer.kind !== 'stopwatch' ? `
                    <button type="button" class="op-btn sm" data-timer-act="subtract_time" data-timer-id="${esc(timer.id)}" data-minutes="1">-1m</button>
                    <button type="button" class="op-btn sm" data-timer-act="add_time" data-timer-id="${esc(timer.id)}" data-minutes="1">+1m</button>
                    <button type="button" class="op-btn sm" data-timer-act="add_time" data-timer-id="${esc(timer.id)}" data-minutes="5">+5m</button>
                ` : ''}
                <button type="button" class="op-btn sm ${timer.visible !== false ? 'active' : ''}" data-timer-act="visibility" data-timer-id="${esc(timer.id)}" data-mode="${timer.visible !== false ? 'hide' : 'show'}">
                    ${timer.visible !== false ? 'Shown' : 'Hidden'}
                </button>
            </div>
        </article>`;
}

function renderSubathonHtml(status) {
    if (!status?.modules?.subathon || !subathonState) return '';
    const cfg = subathonState.config || {};
    const rules = subathonState.rulesSummary || {};
    const active = Boolean(cfg.enabled);
    return `
        <section class="op-panel-card" aria-label="Subathon automation">
            <div class="op-panel-row">
                <div>
                    <h2 class="op-section-title">${OP_ICONS.timers} Subathon Automation</h2>
                    <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem;">
                        Target timer: <strong>${esc(cfg.targetTimerId || 'None')}</strong> · Multiplier: <strong>${esc(String(rules.multiplier || 1))}x</strong>${rules.happyHourActive ? ' (Happy Hour)' : ''}
                    </div>
                </div>
                <span class="op-pill ${active ? 'is-live' : ''}">${active ? 'Subathon Active' : 'Subathon Paused'}</span>
            </div>
            <div class="op-btn-row">
                <button type="button" class="op-btn sm ${active ? 'active' : 'primary'}" data-subathon-act="toggle">${active ? 'Pause Subathon' : 'Enable Subathon'}</button>
                <button type="button" class="op-btn sm" data-subathon-act="boost2x">2x Boost (30m)</button>
                <button type="button" class="op-btn sm" data-subathon-act="clear_multiplier">Clear Boost</button>
                <button type="button" class="op-btn sm" data-subathon-act="undo">Undo Last Added Time</button>
            </div>
        </section>`;
}

async function handleTimerClick(e, refreshCb, ctx) {
    const tBtn = e.target.closest('[data-timer-act]');
    if (tBtn) {
        const id = tBtn.dataset.timerId;
        const act = tBtn.dataset.timerAct;
        const payload = {};
        if (tBtn.dataset.minutes) payload.minutes = Number(tBtn.dataset.minutes);
        if (tBtn.dataset.mode) payload.mode = tBtn.dataset.mode;
        try {
            await controlTimer(id, act, payload);
            refreshCb();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }

    const sBtn = e.target.closest('[data-subathon-act]');
    if (sBtn) {
        const act = sBtn.dataset.subathonAct;
        try {
            if (act === 'toggle') await api('/api/subathon/toggle', 'POST', {});
            else if (act === 'boost2x') await api('/api/subathon/multiplier', 'POST', { factor: 2, minutes: 30 });
            else if (act === 'clear_multiplier') await api('/api/subathon/clear_multiplier', 'POST', {});
            else if (act === 'undo') await api('/api/subathon/undo', 'POST', {});
            await fetchTimersData(Boolean(ctx?.status?.modules?.subathon));
            refreshCb();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }
    return false;
}

function renderDomain(container, status) {
    const timers = timersState.timers || [];
    container.innerHTML = `
        <div class="op-domain-stack">
            <div class="op-toolbar">
                <div class="op-toolbar-left">
                    <span style="display:inline-flex;align-items:center;gap:.4rem;font-weight:700;font-size:.88rem;">${OP_ICONS.timers} Timers</span>
                    <span class="op-pill">${timers.length} timer${timers.length === 1 ? '' : 's'}</span>
                    <span class="op-pill">${timers.filter(t => t.state === 'running').length} running</span>
                </div>
                <div class="op-toolbar-right">
                    <a class="op-btn sm" href="/timers-editor.html">Open Timers Studio</a>
                </div>
            </div>
            ${renderSubathonHtml(status)}
            ${timers.length
                ? `<div class="op-item-grid">${timers.map(t => renderTimerCardHtml(t, false)).join('')}</div>`
                : `<div class="op-card"><div class="op-empty">No timers configured yet. <a class="op-btn sm primary" href="/timers-editor.html">Create a Timer in Timers Studio</a></div></div>`}
        </div>`;
}

registerOperatorModule({
    id: 'timers',
    label: 'Timers',
    iconSvg: OP_ICONS.timers,
    order: 30,
    isEnabled: () => true,
    async mount(container, ctx) {
        domainMounted = true;
        domainContainer = container;
        container.hidden = false;
        const clickHandler = e => handleTimerClick(e, () => renderDomain(container, ctx.status), ctx);
        container._opClick = clickHandler;
        container.addEventListener('click', clickHandler);
        await fetchTimersData(Boolean(ctx.status?.modules?.subathon));
        renderDomain(container, ctx.status);
    },
    unmount(ctx) {
        domainMounted = false;
        if (domainContainer?._opClick) {
            domainContainer.removeEventListener('click', domainContainer._opClick);
            delete domainContainer._opClick;
        }
        if (ctx?.container) ctx.container.hidden = true;
        domainContainer = null;
        syncTickLoop();
    },
    onSocket(type, data, ctx) {
        if (!domainMounted || !domainContainer) return;
        if (type === 'timers-snapshot' && data?.timers) {
            timersState = { timers: normalizeTimersList(data.timers) };
            syncTickLoop();
            renderDomain(domainContainer, ctx.status);
        } else if (type === 'timer-update' && upsertTimerSnapshot(data?.timer)) {
            renderDomain(domainContainer, ctx.status);
        } else if (type === 'timer-delete' || type === 'timer-deleted' || type === 'timers-deleted') {
            fetchTimersData(Boolean(ctx.status?.modules?.subathon)).then(() => renderDomain(domainContainer, ctx.status));
        } else if (type === 'subathon-update') {
            fetchTimersData(Boolean(ctx.status?.modules?.subathon)).then(() => renderDomain(domainContainer, ctx.status));
        }
    },
    onStatus(status) {
        if (domainMounted && domainContainer) {
            fetchTimersData(Boolean(status?.modules?.subathon)).then(() => renderDomain(domainContainer, status));
        }
    }
});

// --- Live Board Card: All Timers ---
registerCardType({
    type: 'timers-list',
    moduleId: 'timers',
    label: 'Timers Quick Rack',
    description: 'Start, pause, reset, and adjust all broadcast timers.',
    iconSvg: OP_ICONS.timers,
    isEnabled: () => true,
    mount(el, card, ctx) {
        activeTickers.add(el);
        const render = () => {
            const timers = timersState.timers || [];
            el.innerHTML = timers.length
                ? timers.map(t => renderTimerCardHtml(t, true)).join('<hr style="border:0;border-top:1px solid var(--border);">')
                : '<div style="font-size:.8rem;color:var(--text-muted);">No timers configured yet.</div>';
            syncTickLoop();
        };
        const onClick = e => handleTimerClick(e, render, ctx);
        el.addEventListener('click', onClick);
        el._opRefresh = () => fetchTimersData(false).then(render);
        el._opRender = render;
        el._opCleanup = () => {
            activeTickers.delete(el);
            el.removeEventListener('click', onClick);
            syncTickLoop();
        };
        el._opRefresh();
    },
    onSocket(el, card, type, data) {
        if (type === 'timers-snapshot' && data?.timers) {
            timersState = { timers: normalizeTimersList(data.timers) };
            el._opRender?.();
        } else if (type === 'timer-update' && upsertTimerSnapshot(data?.timer)) {
            el._opRender?.();
        } else if (type === 'timer-delete' || type === 'timer-deleted' || type === 'timers-deleted') {
            el._opRefresh?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

// --- Live Board Card: Single Timer ---
registerCardType({
    type: 'timer-single',
    moduleId: 'timers',
    label: 'Single Timer',
    description: 'Pin controls for a single timer.',
    iconSvg: OP_ICONS.timers,
    isEnabled: () => true,
    async getPickerItems() {
        const res = await fetchTimersData(false);
        return (res.timersState.timers || []).map(t => ({
            title: t.label || t.id,
            subtitle: `${t.kind === 'stopwatch' ? 'Stopwatch' : 'Countdown'} · ${t.state}`,
            defaultTitle: t.label || t.id,
            config: { timerId: t.id }
        }));
    },
    mount(el, card, ctx) {
        activeTickers.add(el);
        const timerId = card.config?.timerId || '';
        const render = () => {
            const timer = (timersState.timers || []).find(t => t.id === timerId);
            el.innerHTML = timer
                ? renderTimerCardHtml(timer, true)
                : `<div style="font-size:.8rem;color:var(--text-muted);">Timer "${esc(timerId)}" not found.</div>`;
            syncTickLoop();
        };
        const onClick = e => handleTimerClick(e, render, ctx);
        el.addEventListener('click', onClick);
        el._opRefresh = () => fetchTimersData(false).then(render);
        el._opRender = render;
        el._opCleanup = () => {
            activeTickers.delete(el);
            el.removeEventListener('click', onClick);
            syncTickLoop();
        };
        el._opRefresh();
    },
    onSocket(el, card, type, data) {
        if (type === 'timers-snapshot' && data?.timers) {
            timersState = { timers: normalizeTimersList(data.timers) };
            el._opRender?.();
        } else if (type === 'timer-update' && upsertTimerSnapshot(data?.timer)) {
            el._opRender?.();
        } else if (type === 'timer-delete' || type === 'timer-deleted' || type === 'timers-deleted') {
            el._opRefresh?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

// --- Live Board Card: Subathon Automation ---
registerCardType({
    type: 'subathon-controls',
    moduleId: 'timers',
    label: 'Subathon Controls',
    description: 'Pause/resume Subathon automation, trigger boosts, or undo added time.',
    iconSvg: OP_ICONS.timers,
    isEnabled: status => Boolean(status?.modules?.subathon),
    mount(el, card, ctx) {
        const render = () => {
            el.innerHTML = renderSubathonHtml(ctx.status) || '<div style="font-size:.8rem;color:var(--text-muted);">Subathon module disabled.</div>';
        };
        const onClick = e => handleTimerClick(e, render, ctx);
        el.addEventListener('click', onClick);
        el._opRefresh = () => fetchTimersData(true).then(render);
        el._opCleanup = () => el.removeEventListener('click', onClick);
        el._opRefresh();
    },
    onSocket(el, card, type) {
        if (type === 'subathon-update') el._opRefresh?.();
    },
    unmount(el) {
        el._opCleanup?.();
    }
});
