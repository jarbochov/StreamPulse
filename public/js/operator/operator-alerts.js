'use strict';

import { api, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { registerCardType, registerOperatorModule } from './operator-registry.js';

const QUEUE_DRAWER_KEY = 'streampulse_op_alerts_drawer_open';

let rulesState = { rules: [], pending: 0, current: null, paused: false, muted: false };
let queueDetailState = { pending: 0, waiting: [], history: [], current: null, paused: false, muted: false };
let domainMounted = false;
let domainContainer = null;

async function fetchAlertsState() {
    const [rulesRes, queueRes] = await Promise.all([
        api('/api/alerts/rules'),
        api('/api/alerts/queue').catch(() => ({ queue: {} }))
    ]);
    rulesState = rulesRes || rulesState;
    queueDetailState = queueRes?.queue || queueDetailState;
    return rulesState;
}

function formatAlertLabel(item) {
    if (!item) return 'Alert';
    return item.title || item.message || item.ruleName || item.user || item.type || 'Alert';
}

function renderQueueControlsHtml() {
    const paused = Boolean(rulesState.paused);
    const muted = Boolean(rulesState.muted);
    const pending = Number(rulesState.pending) || 0;
    const waiting = Array.isArray(queueDetailState.waiting) ? queueDetailState.waiting : [];
    const recent = Array.isArray(queueDetailState.history) ? queueDetailState.history.slice(0, 10) : [];
    const currentTitle = formatAlertLabel(rulesState.current);
    const hasCurrent = Boolean(rulesState.current);
    const drawerOpen = localStorage.getItem(QUEUE_DRAWER_KEY) === '1';

    return `
        <div class="op-panel-row">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
                <span class="op-pill ${paused ? '' : 'is-ok'}">
                    <span class="op-badge-dot ${paused ? 'is-paused' : ''}"></span>
                    ${paused ? 'Paused' : 'Active'}
                </span>
                <span class="op-pill">${pending} waiting</span>
                ${muted ? '<span class="op-pill" style="color:#f87171;">Muted</span>' : ''}
            </div>
        </div>
        ${hasCurrent ? `<div style="display:flex;align-items:center;gap:.25rem;min-width:0;max-width:100%;font-size:.76rem;color:var(--text-muted);"><span style="flex-shrink:0;">Now showing:</span><strong style="color:var(--text);min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(currentTitle)}">${esc(currentTitle)}</strong></div>` : ''}
        <div class="op-btn-row">
            <button type="button" class="op-btn sm ${paused ? 'primary' : ''}" data-alert-queue="${paused ? 'resume' : 'pause'}">
                ${paused ? OP_ICONS.play : OP_ICONS.pause} ${paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" class="op-btn sm" data-alert-queue="skip">Skip</button>
            <button type="button" class="op-btn sm" data-alert-queue="clear">Clear</button>
            <button type="button" class="op-btn sm ${muted ? 'is-danger' : ''}" data-alert-mute="${muted ? '0' : '1'}">${muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" class="op-btn sm" data-alert-replay="1">${OP_ICONS.reset} Replay Last</button>
        </div>
        <details class="op-list-collapse" data-alert-queue-details="1"${drawerOpen ? ' open' : ''}>
            <summary>
                <span>Queue (${waiting.length}) · Recent (${recent.length})</span>
                <span style="font-size:.7rem;">${drawerOpen ? 'Hide' : 'Show'}</span>
            </summary>
            <div class="op-list-lines-body">
                ${waiting.length ? `
                    <div class="op-queue-group-label">Up Next</div>
                    ${waiting.map((w, i) => `
                        <div class="op-queue-item">
                            <span class="op-queue-item-label" title="${esc(formatAlertLabel(w))}">${i + 1}. ${esc(formatAlertLabel(w))}</span>
                            <span class="op-pill">Queued</span>
                        </div>`).join('')}
                ` : ''}
                ${recent.length ? `
                    <div class="op-queue-group-label">Recently Shown</div>
                    ${recent.map(a => `
                        <div class="op-queue-item">
                            <span class="op-queue-item-label" title="${esc(formatAlertLabel(a))}">${esc(formatAlertLabel(a))}</span>
                            <button type="button" class="op-btn sm" data-alert-replay-id="${esc(a.id)}" title="Replay this alert">${OP_ICONS.reset} Replay</button>
                        </div>`).join('')}
                ` : (!waiting.length ? '<div style="font-size:.76rem;color:var(--text-muted);">No queued or recent alerts yet.</div>' : '')}
            </div>
        </details>`;
}

function renderQuickTriggerButtonsHtml() {
    const announcements = (rulesState.rules || []).filter(r => r.enabled !== false && r.trigger === 'announcement');
    if (!announcements.length) {
        return '<div style="font-size:.8rem;color:var(--text-muted);">No enabled announcements configured.</div>';
    }
    return `
        <div class="op-alert-triggers">
            ${announcements.map(r => `
                <button type="button" class="op-btn sm" data-alert-fire="${esc(r.id)}">
                    ${OP_ICONS.play} ${esc(r.name || r.id)}
                </button>
            `).join('')}
        </div>`;
}

function bindQueueDrawerToggle(container) {
    const onToggle = e => {
        const details = e.target.closest?.('[data-alert-queue-details]');
        if (!details) return;
        localStorage.setItem(QUEUE_DRAWER_KEY, details.open ? '1' : '0');
        const label = details.querySelector('summary span:last-child');
        if (label) label.textContent = details.open ? 'Hide' : 'Show';
    };
    container.addEventListener('toggle', onToggle, true);
    return () => container.removeEventListener('toggle', onToggle, true);
}

async function handleAlertsClick(e, onUpdate) {
    const qBtn = e.target.closest('[data-alert-queue]');
    if (qBtn) {
        const action = qBtn.dataset.alertQueue;
        try {
            await api(`/api/alerts/queue/${encodeURIComponent(action)}`, 'POST', {});
            await fetchAlertsState();
            onUpdate();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }

    const muteBtn = e.target.closest('[data-alert-mute]');
    if (muteBtn) {
        const muted = muteBtn.dataset.alertMute === '1';
        try {
            await api('/api/alerts/mute', 'POST', { muted });
            await fetchAlertsState();
            onUpdate();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }

    const replayIdBtn = e.target.closest('[data-alert-replay-id]');
    if (replayIdBtn) {
        try {
            await api('/api/alerts/replay', 'POST', { alertId: replayIdBtn.dataset.alertReplayId });
            toast('Replayed alert', 'success');
            await fetchAlertsState();
            onUpdate();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }

    const replayBtn = e.target.closest('[data-alert-replay]');
    if (replayBtn) {
        const count = Number(replayBtn.dataset.alertReplay) || 1;
        try {
            await api('/api/alerts/replay', 'POST', { count });
            toast(`Replayed last ${count === 1 ? 'alert' : `${count} alerts`}`, 'success');
            await fetchAlertsState();
            onUpdate();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }

    const fireBtn = e.target.closest('[data-alert-fire]');
    if (fireBtn) {
        const ruleId = fireBtn.dataset.alertFire;
        try {
            await api('/api/alerts/trigger', 'POST', { rule: ruleId });
            toast(`Triggered announcement "${fireBtn.textContent.trim()}"`, 'success');
            await fetchAlertsState();
            onUpdate();
        } catch (err) {
            toast(err.message, 'error');
        }
        return true;
    }

    return false;
}

function renderDomain(container) {
    const announcements = (rulesState.rules || []).filter(r => r.trigger === 'announcement' && r.enabled !== false);
    container.innerHTML = `
        <div class="op-domain-stack">
            <section class="op-panel-card" aria-label="Alert Queue Controls">
                <div class="op-panel-row">
                    <h2 class="op-section-title">${OP_ICONS.alerts} Live Queue</h2>
                    <div class="op-btn-row">
                        <a class="op-btn sm" href="/alert-queue.html">Full Log</a>
                        <a class="op-btn sm" href="/alerts.html">Alerts Studio</a>
                    </div>
                </div>
                ${renderQueueControlsHtml()}
            </section>
            <section class="op-panel-card" aria-label="Announcements">
                <h2 class="op-section-title">${OP_ICONS.alerts} Announcements (${announcements.length})</h2>
                ${renderQuickTriggerButtonsHtml()}
            </section>
        </div>`;
}

registerOperatorModule({
    id: 'alerts',
    label: 'Alerts',
    iconSvg: OP_ICONS.alerts,
    order: 40,
    isEnabled: status => status?.alerts?.enabled !== false,
    async mount(container) {
        domainMounted = true;
        domainContainer = container;
        container.hidden = false;
        const clickHandler = e => handleAlertsClick(e, () => renderDomain(container));
        const unbindToggle = bindQueueDrawerToggle(container);
        container._opClick = clickHandler;
        container._opToggle = unbindToggle;
        container.addEventListener('click', clickHandler);
        await fetchAlertsState();
        renderDomain(container);
    },
    unmount(ctx) {
        domainMounted = false;
        if (domainContainer?._opClick) {
            domainContainer.removeEventListener('click', domainContainer._opClick);
            delete domainContainer._opClick;
        }
        domainContainer?._opToggle?.();
        delete domainContainer?._opToggle;
        if (ctx?.container) ctx.container.hidden = true;
        domainContainer = null;
    },
    onSocket(type) {
        if (!domainMounted || !domainContainer) return;
        if (type === 'alert' || type === 'alert-skip' || type === 'alert-clear' || type === 'status') {
            fetchAlertsState().then(() => renderDomain(domainContainer)).catch(() => {});
        }
    }
});

// --- Live Board Card: Alert Queue ---
registerCardType({
    type: 'alerts-queue',
    moduleId: 'alerts',
    label: 'Alert Queue',
    description: 'Pause/resume queue, skip, mute SFX, inspect waiting queue, and replay recent alerts.',
    iconSvg: OP_ICONS.alerts,
    isEnabled: status => status?.alerts?.enabled !== false,
    mount(el) {
        const render = () => { el.innerHTML = renderQueueControlsHtml(); };
        const onClick = e => handleAlertsClick(e, render);
        const unbindToggle = bindQueueDrawerToggle(el);
        el.addEventListener('click', onClick);
        el._opRefresh = () => fetchAlertsState().then(render);
        el._opCleanup = () => {
            el.removeEventListener('click', onClick);
            unbindToggle();
        };
        el._opRefresh();
    },
    onSocket(el, card, type) {
        if (type === 'alert' || type === 'alert-skip' || type === 'alert-clear') {
            el._opRefresh?.();
        }
    },
    unmount(el) {
        el._opCleanup?.();
    }
});

// --- Live Board Card: Manual Announcements ---
registerCardType({
    type: 'alerts-triggers',
    moduleId: 'alerts',
    label: 'Announcements',
    description: 'One-click buttons to trigger enabled manual on-stream announcements.',
    iconSvg: OP_ICONS.alerts,
    isEnabled: status => status?.alerts?.enabled !== false,
    mount(el) {
        const render = () => { el.innerHTML = renderQuickTriggerButtonsHtml(); };
        const onClick = e => handleAlertsClick(e, render);
        el.addEventListener('click', onClick);
        el._opRefresh = () => fetchAlertsState().then(render);
        el._opCleanup = () => el.removeEventListener('click', onClick);
        el._opRefresh();
    },
    onSocket(el, card, type) {
        if (type === 'alert' || type === 'status') el._opRefresh?.();
    },
    unmount(el) {
        el._opCleanup?.();
    }
});
