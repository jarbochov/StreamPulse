/**
 * StreamPulse — Alerts Studio Secondary Panels (Queue, Events, Simulator, Announcements)
 */

import {
    $, esc, ICONS, TRIGGERS, TRIGGER_META,
    cfg, sel, setSel, dirty, setDirty,
    queue, setQueue, hideUnmatched, setHideUnmatched,
    rewardList, loadRewards, blankRule,
    ANN_DEFAULTS, ANN_PRESETS, setAnnPresets,
    SIM_PRESETS, api, guard, toast
} from './alerts-state.js';
import { save } from './alerts-rules.js';

let _lastAlertsEventsHtml = '';
let _lastAlertsHistoryHtml = '';

export function renderEvents() {
    const list = (queue.events || []).filter(e => !hideUnmatched || e.status !== 'no matching rule');
    const eventsEl = $('events');
    if (!eventsEl) return;
    const hideUnmatchedBox = $('hide-unmatched');
    if (hideUnmatchedBox) hideUnmatchedBox.checked = hideUnmatched;

    const eventsHtml = list.length ? list.map(e => {
        const meta = TRIGGER_META[e.event.type] || { label: e.event.type, icon: ICONS.zap, color: '#3b82f6' };
        return `
        <div>
            <span class="grow">
                <span class="al-s51">
                    <span style="color:${meta.color}">${meta.icon}</span>
                    <b>${esc(TRIGGERS[e.event.type] || e.event.type)}</b>: ${esc(e.event.user || e.event.name || 'Anonymous')}${e.event.amount ? ` · <b>${esc(e.event.amount)}</b>` : ''}
                </span>
                <span class="st ${e.status === 'shown' ? 'shown' : ''}">${esc(e.status)} · ${new Date(e.at).toLocaleTimeString()}</span>
            </span>
            <button type="button" class="btn sm" data-replay-event="${esc(e.id)}" title="Run this event through your current rules again">
                ${ICONS.refresh} Replay
            </button>
        </div>`;
    }).join('') : '<p class="al-s52 hint">Real stream events appear here as they occur in real time.</p>';

    if (eventsHtml !== _lastAlertsEventsHtml) {
        _lastAlertsEventsHtml = eventsHtml;
        eventsEl.innerHTML = eventsHtml;
    }
}

export function renderQueue() {
    renderEvents();
    const statusDot = $('queue-dot');
    const statusDot2 = $('queue-dot2');
    if (statusDot) {
        statusDot.className = 'status-dot' + (queue.paused ? ' paused' : queue.current ? ' live' : '');
    }
    if (statusDot2) {
        statusDot2.className = 'status-dot' + (queue.paused ? ' paused' : queue.current ? ' live' : '');
    }

    const statusText = `${queue.current ? 'Playing: ' + (queue.current.title || queue.current.ruleName) + ' · ' : 'Idle · '}${queue.pending || 0} waiting${queue.paused ? ' (paused)' : ''}.`;
    const queueLine = $('queue-line');
    if (queueLine) {
        queueLine.textContent = statusText;
        queueLine.title = statusText;
        if (queueLine.parentElement) queueLine.parentElement.title = statusText;
    }
    const queueLine2 = $('queue-line2');
    if (queueLine2) queueLine2.textContent = statusText;

    document.querySelectorAll('.pause-btn').forEach(b => {
        b.innerHTML = `${queue.paused ? ICONS.play : ICONS.pause} <span>${queue.paused ? 'Resume' : 'Pause'}</span>`;
        b.dataset.queue = queue.paused ? 'resume' : 'pause';
    });
    const tabCount = $('tab-count');
    if (tabCount) tabCount.textContent = (queue.pending || 0) ? queue.pending : '';

    const historyEl = $('history');
    if (historyEl) {
        const historyHtml = (queue.history || []).length ? queue.history.map(h => `
            <div>
                <span class="grow">
                    <span class="al-s51">
                        ${h.test ? '<span class="badge accent">Test</span>' : ''}
                        <span>${esc(h.title || h.message || h.ruleName)}</span>
                    </span>
                </span>
                <span class="t">${new Date(h.shownAt || h.at).toLocaleTimeString()}</span>
                <button type="button" class="btn sm icon-btn" data-replay-alert="${esc(h.id)}" title="Show this exact alert again">
                    ${ICONS.refresh}
                </button>
            </div>
        `).join('') : '<p class="al-s52 hint">No alerts shown yet in this session.</p>';
        if (historyHtml !== _lastAlertsHistoryHtml) {
            _lastAlertsHistoryHtml = historyHtml;
            historyEl.innerHTML = historyHtml;
        }
    }
}

export async function refreshQueue() {
    try {
        const data = await api('/api/alerts', { cache: 'no-store' });
        setQueue(data.queue || {});
        renderQueue();
    } catch {
        /* server restarting */
    }
}

// Announcements Tab
export const annRules = () => cfg.rules.filter(r => r.trigger === 'announcement');

export const savePresets = () => {
    localStorage.setItem('alerts.annPresets', JSON.stringify(ANN_PRESETS));
    renderAnnouncements();
};

export function renderAnnouncements() {
    const list = annRules();
    const delIcon = '<svg class="ico" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
    const annGrid = $('ann-grid');
    if (annGrid) {
        annGrid.innerHTML = list.length ? list.map(r => {
            const v = r.variants[0] || {};
            return `<div class="ann-item" draggable="true" data-ann="${esc(r.id)}">
                <div class="ann-head"><input class="ann-name-input" type="text" data-ann-name="${esc(r.id)}" value="${esc(r.name)}" maxlength="80" aria-label="Announcement name" draggable="false">
                    <button type="button" class="btn sm ghost icon-btn danger" data-ann-del="${esc(r.id)}" title="Delete announcement" aria-label="Delete announcement">${delIcon}</button></div>
                <textarea class="ann-text-input" rows="2" data-ann-msg="${esc(r.id)}" maxlength="500" placeholder="Text shown on screen" aria-label="Announcement text" draggable="false">${esc(v.message || '')}</textarea>
                <div class="ann-meta"><span class="badge">${esc(r.priority || 'normal')}</span>${r.actions?.chat?.enabled ? '<span class="badge accent">Chat</span>' : ''}<button type="button" class="btn sm ghost" data-ann-save="${esc(r.id)}" title="Save this announcement as a quick add chip">Save as quick add</button><button type="button" class="btn sm ghost" data-ann-edit="${esc(r.id)}">Media, sound and more</button></div>
                <button type="button" class="btn primary ann-fire" data-fire="${esc(r.id)}">${ICONS.play} Fire</button>
            </div>`;
        }).join('') : '<p class="hint">No announcements yet. Create one with New announcement or Quick add.</p>';
    }

    const annPresetsEl = $('ann-presets');
    if (annPresetsEl) {
        annPresetsEl.innerHTML = ANN_PRESETS.map(([n], i) => `<span class="chip-btn"><button type="button" class="chip-main" data-ann-add="${i}">${esc(n)}</button><button type="button" class="chip-x" data-ann-preset-del="${i}" title="Remove this preset" aria-label="Remove preset ${esc(n)}">&times;</button></span>`).join('');
    }
    const resetBtn = $('ann-preset-reset');
    if (resetBtn) {
        resetBtn.hidden = ANN_PRESETS.length === ANN_DEFAULTS.length && ANN_PRESETS.every((p, i) => p[0] === ANN_DEFAULTS[i][0]);
    }
}

export function addAnnouncement(name, text, renderAll) {
    const annRule = blankRule('announcement', `ann-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
    annRule.name = name;
    annRule.variants[0].title = name;
    annRule.variants[0].message = text;
    cfg.rules.push(annRule);
    setDirty(true);
    if (renderAll) renderAll();
    renderAnnouncements();
}

async function fireAnnouncement(id) {
    const text = $('ann-override')?.value.trim() || '';
    const st = $('ann-status');
    try {
        if (dirty) await save();
        const res = await api('/api/alerts/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule: id, message: text || undefined }) });
        if (st) st.textContent = res.playing ? 'Fired: playing now' : `Fired: queued (${res.pending} waiting)`;
    } catch (err) {
        if (st) st.textContent = `Failed: ${err.message}`;
    }
}

// Simulator Tab
export function updateSimVisibility() {
    const type = $('sim-type')?.value;
    const isSub = ['sub', 'resub', 'milestone', 'gift'].includes(type);
    const row = $('sim-tier-row');
    if (row) row.style.display = isSub ? '' : 'none';
    const recipRow = $('sim-recipient-row');
    if (recipRow) recipRow.style.display = type === 'gift' ? '' : 'none';
    const rewRow = $('sim-reward-row');
    if (rewRow) rewRow.style.display = type === 'redeem' ? '' : 'none';
    if (type === 'redeem') {
        loadRewards(() => { renderSimRewards(); });
        renderSimRewards();
    }
}

export function renderSimRewards() {
    const picker = $('sim-reward');
    if (!picker) return;
    const selected = picker.value;
    const ids = [...new Set(cfg.rules.filter(r => r.trigger === 'redeem').flatMap(r => r.conditions.rewardIds || []))];
    const missing = ids.filter(id => !rewardList.rewards.some(reward => reward.id === id));
    picker.innerHTML = '<option value="">Custom reward title (text below)</option>'
        + rewardList.rewards.map(reward => `<option value="${esc(reward.id)}">${esc(reward.title)} (${reward.cost} pts)</option>`).join('')
        + missing.map(id => `<option value="${esc(id)}">Unlisted selected reward (${esc(id.slice(0, 8))})</option>`).join('');
    picker.value = selected;
    const statusEl = $('sim-reward-status');
    if (statusEl) {
        statusEl.textContent = rewardList.loading ? 'Loading rewards...' : rewardList.error
            || 'Choose the checked reward to test ID matching. Text below is the viewer message, or the title for custom/unlisted rewards.';
    }
}

export function setupPanelsEvents(renderAll, setTab) {
    // Queue Actions
    document.addEventListener('click', guard(async event => {
        const btn = event.target.closest('[data-queue]');
        if (!btn) return;
        const data = await api('/api/alerts/queue', { method: 'POST', body: JSON.stringify({ action: btn.dataset.queue }) });
        setQueue(data.queue);
        renderQueue();
    }));

    // Unmatched events toggle
    document.addEventListener('change', e => {
        if (e.target.id !== 'hide-unmatched') return;
        setHideUnmatched(e.target.checked);
        localStorage.setItem('alerts.hideUnmatched', hideUnmatched ? '1' : '0');
        renderEvents();
    });

    // Replay event and alert
    document.addEventListener('click', guard(async event => {
        const btn = event.target.closest('[data-replay-event],[data-replay-alert]');
        if (!btn) return;
        await api('/api/alerts/replay', {
            method: 'POST',
            body: JSON.stringify(btn.dataset.replayEvent ? { eventId: btn.dataset.replayEvent } : { alertId: btn.dataset.replayAlert })
        });
        toast('Replaying alert');
        refreshQueue();
    }));

    // Simulator presets
    $('sim-type')?.addEventListener('change', updateSimVisibility);

    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-sim-preset]');
        if (!btn) return;
        const preset = SIM_PRESETS[btn.dataset.simPreset];
        if (preset) {
            $('sim-type').value = preset.type;
            $('sim-user').value = preset.user;
            $('sim-amount').value = preset.amount;
            $('sim-text').value = preset.text;
            if ($('sim-tier')) {
                $('sim-tier').value = preset.tier || '1000';
                document.querySelectorAll('[data-simtier]').forEach(x => x.classList.toggle('active', x.dataset.simtier === $('sim-tier').value));
            }
            if ($('sim-recipient')) $('sim-recipient').value = preset.recipient || 'LuckyViewer';
            updateSimVisibility();
            $('sim-go')?.click();
        }
    });

    document.addEventListener('click', e => {
        const b = e.target.closest('[data-simtier]');
        if (!b) return;
        $('sim-tier').value = b.dataset.simtier;
        document.querySelectorAll('[data-simtier]').forEach(x => x.classList.toggle('active', x === b));
    });

    // Run Simulator
    $('sim-go')?.addEventListener('click', guard(async () => {
        if (dirty) await save(renderAll);
        const type = $('sim-type').value, amount = Number($('sim-amount').value) || 0, text = $('sim-text').value;
        const isSub = ['sub', 'resub', 'milestone', 'gift'].includes(type);
        const tier = isSub ? ($('sim-tier')?.value || '1000') : '';
        const tierLabels = { 'prime': 'Prime', '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' };
        const tierLabel = isSub ? (tierLabels[tier] || 'Tier 1') : '';
        const recipient = type === 'gift' ? ($('sim-recipient')?.value || 'LuckyViewer') : '';
        const body = { type, user: $('sim-user').value || 'TestViewer', recipient, amount, count: amount, months: amount, viewers: amount, tier, tierLabel, message: text, reward: text, keyword: text, name: text };
        if (type === 'redeem') {
            const rewardId = $('sim-reward').value;
            const reward = rewardList.rewards.find(item => item.id === rewardId);
            body.rewardId = rewardId;
            body.reward = reward?.title || text;
            body.cost = reward?.cost || amount;
        }
        if (type === 'chat_word') body.message = text;
        if (type === 'chat_command') {
            const clean = text.replace(/^!+/, '').trim();
            const parts = clean.split(/\s+/);
            body.command = (parts[0] || '').toLowerCase();
            body.args = parts.slice(1).join(' ').trim();
            body.target = parts[1] ? parts[1].replace(/^@/, '') : ($('sim-user').value || 'CoolChatter');
            body.message = body.args || text;
            body.isTest = true;
        }
        const data = await api('/api/alerts/test-event', { method: 'POST', body: JSON.stringify(body) });
        const resBox = $('sim-result-box');
        if (resBox) {
            resBox.hidden = false;
            if (data.alert) {
                resBox.className = 'sim-result-box matched';
                resBox.innerHTML = `${ICONS.check} <span>Dispatched alert: <b>"${esc(data.alert.title || data.alert.ruleName)}"</b></span>`;
                toast('Simulated alert dispatched');
            } else {
                resBox.className = 'sim-result-box unmatched';
                resBox.innerHTML = `${ICONS.info} <span>No active rule matched this event. Check your triggers, tiers, or minimum amounts.</span>`;
                toast('No enabled rule matched that event', true);
            }
        }
        refreshQueue();
    }));

    // Announcements events
    document.addEventListener('input', e => {
        const n = e.target.closest?.('[data-ann-name]'), m = e.target.closest?.('[data-ann-msg]');
        const r = cfg.rules.find(x => x.id === (n || m)?.dataset[n ? 'annName' : 'annMsg']);
        if (!r) return;
        if (n) r.name = n.value;
        else r.variants[0].message = m.value;
        setDirty(true);
    });

    document.addEventListener('click', async e => {
        const f = e.target.closest('[data-fire]'), a = e.target.closest('[data-ann-add]'), ed = e.target.closest('[data-ann-edit]');
        const dl = e.target.closest('[data-ann-del]'), nw = e.target.closest('[data-ann-new]');
        const pd = e.target.closest('[data-ann-preset-del]');
        const sv = e.target.closest('[data-ann-save]');
        if (sv) {
            const r = cfg.rules.find(x => x.id === sv.dataset.annSave), msg = r?.variants[0]?.message || '';
            if (r && !ANN_PRESETS.some(p => p[0] === r.name && p[1] === msg)) {
                ANN_PRESETS.push([r.name, msg]);
                savePresets();
                toast('Saved as quick add');
            } else if (r) toast('Already a quick add');
            return;
        }
        if (pd) {
            ANN_PRESETS.splice(Number(pd.dataset.annPresetDel), 1);
            savePresets();
        } else if (e.target.closest('#ann-preset-reset')) {
            setAnnPresets(ANN_DEFAULTS.slice());
            savePresets();
        } else if (f) {
            fireAnnouncement(f.dataset.fire);
        } else if (nw) {
            addAnnouncement('New announcement', '', renderAll);
        } else if (a) {
            const [name, text] = ANN_PRESETS[a.dataset.annAdd];
            addAnnouncement(name, text, renderAll);
        } else if (dl) {
            const r = cfg.rules.find(x => x.id === dl.dataset.annDel);
            const confirmed = window.StreamPulse
                ? await window.StreamPulse.confirm('Delete Announcement', `Delete "${r.name}"?`, { danger: true, confirmText: 'Delete' })
                : confirm(`Delete "${r.name}"?`);
            if (r && confirmed) {
                cfg.rules = cfg.rules.filter(x => x !== r);
                if (sel === r.id) setSel(cfg.rules[0]?.id || null);
                setDirty(true);
                if (renderAll) renderAll();
                renderAnnouncements();
            }
        } else if (ed) {
            setSel(ed.dataset.annEdit);
            if (renderAll) renderAll();
            if (setTab) setTab('rules');
        }
    });

    let annDrag = null;
    document.addEventListener('dragstart', e => { annDrag = e.target.closest?.('[data-ann]')?.dataset.ann || null; });
    document.addEventListener('dragover', e => { if (annDrag && e.target.closest('[data-ann]')) e.preventDefault(); });
    document.addEventListener('drop', e => {
        const to = e.target.closest?.('[data-ann]')?.dataset.ann;
        if (!annDrag || !to || to === annDrag) return;
        const from = cfg.rules.findIndex(r => r.id === annDrag), idx = cfg.rules.findIndex(r => r.id === to);
        cfg.rules.splice(idx, 0, cfg.rules.splice(from, 1)[0]);
        annDrag = null;
        setDirty(true);
        renderAnnouncements();
    });
}
