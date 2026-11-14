/**
 * Dashboard status rendering: health, session stats, alerts, chatters, events, and chart.
 */

import { $, escapeHtml, setText, setHtml, setDot, fmt } from './dashboard-state.js';

const EVENT_ICONS = {
    follow: '<svg class="ico" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
    sub: '<svg class="ico" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
    gift: '<svg class="ico" viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>',
    bits: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"></path></svg>',
    donation: '<svg class="ico" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
    raid: '<svg class="ico" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
};

const formatUptime = seconds => {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
};

function formatBackupName(filename) {
    const match = (filename || '').match(/backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}` : (filename || '—');
}

function renderLifecycle(lc) {
    let text = '';
    if (lc?.auto) {
        if (lc.state === 'ending' && lc.endsAt) {
            const mins = Math.max(0, Math.ceil((Date.parse(lc.endsAt) - Date.now()) / 60000));
            text = `Stream offline — session auto-ends in ~${mins} min if you don't return`;
        } else if (lc.state === 'live') text = 'Auto session: stream is live';
        else if (lc.state === 'manual') text = 'Auto session paused until the stream ends (you ended it manually)';
        else text = 'Auto session: waiting for you to go live';
    }
    setText('lifecycle-hint', text);
    const hint = $('lifecycle-hint');
    if (hint) hint.style.display = text ? 'block' : 'none';
}

let lastChatterOrderSig = '';
function renderChatters(chatters, total) {
    setText('chatter-count', total ? `(${total})` : '');
    const listEl = $('chatters-list');
    if (!chatters.length) {
        lastChatterOrderSig = '';
        setHtml('chatters-list', '<div class="empty">No chatters yet</div>');
        return;
    }
    const orderSig = chatters.map(c => `${c.chatname}\0${c.chatimg || ''}`).join('\n');
    if (orderSig === lastChatterOrderSig && listEl.children.length === chatters.length) {
        chatters.forEach((c, idx) => {
            const countEl = listEl.children[idx]?.querySelector('.count');
            const nextText = `${fmt(c.messageCount)} msgs`;
            if (countEl && countEl.textContent !== nextText) countEl.textContent = nextText;
        });
        return;
    }
    lastChatterOrderSig = orderSig;
    setHtml('chatters-list', chatters.map(c => `
        <div class="chatter clickable" data-chatter="${escapeHtml(c.chatname || c.username)}" title="View chatter dossier">
            ${c.chatimg ? `<img src="${escapeHtml(c.chatimg)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : '<div class="avatar"></div>'}
            <span class="name">${escapeHtml(c.chatname)}</span>
            <span class="count">${fmt(c.messageCount)} msgs</span>
        </div>`).join(''));
}

function renderEvents(events) {
    setHtml('events-list', events.length ? events.map(e => `
        <div class="event">
            <span>${EVENT_ICONS[e.type] || '•'}</span>
            <span class="who">${escapeHtml(e.user || 'Unknown')}</span>
            <span class="what">${escapeHtml(e.detail || e.type)}</span>
        </div>`).join('') : '<div class="empty">No events yet</div>');
}

function renderVolumeChart(hourly) {
    const entries = Object.entries(hourly).sort((a, b) => a[0].localeCompare(b[0]));
    if (!entries.length) {
        setHtml('volume-chart', '<div class="empty" style="width:100%">No message data yet</div>');
        return;
    }
    const max = Math.max(...entries.map(entry => entry[1]), 1);
    setHtml('volume-chart', entries.map(([hour, count]) => `
        <div class="bar-col" title="${escapeHtml(hour)} — ${count} messages">
            <div class="bar-count">${count}</div>
            <div class="bar" style="height:${Math.max(2, (count / max) * 80)}%"></div>
            <div class="bar-label">${escapeHtml(hour.slice(11, 13))}h</div>
        </div>`).join(''));
}

export async function loadCustomOverlayCount() {
    try {
        const overlays = await (await fetch('/api/custom-overlays', { cache: 'no-store' })).json();
        setText('overlay-custom-count', Array.isArray(overlays) ? overlays.length : 0);
    } catch { /* keep placeholder */ }
}

export function renderDashboard(data, layoutManager) {
    const ssn = data.ssn || {};
    const session = data.goalMetrics?.session || {};
    const persistent = data.goalMetrics?.persistent || {};

    if (data.modules && layoutManager) layoutManager.syncModuleVisibility(data.modules);

    setDot('dot-server', 'green');
    setText('uptime', formatUptime(data.uptime));
    setText('memory', `${Math.round((data.memory?.rss || 0) / 1048576)} MB`);
    setText('memory-heap', `${Math.round((data.memory?.heapUsed || 0) / 1048576)} / ${Math.round((data.memory?.heapTotal || 0) / 1048576)} MB`);
    if (ssn.connected) { setDot('dot-ssn', 'green'); setText('ssn-status', 'Connected'); }
    else if (ssn.session) { setDot('dot-ssn', 'red'); setText('ssn-status', 'Disconnected'); }
    else { setDot('dot-ssn', 'yellow'); setText('ssn-status', 'Not configured'); }
    setDot('dot-twitch', data.twitch?.hasToken ? 'green' : 'red');
    setText('twitch-status', data.twitch?.hasToken ? 'Active' : 'Not authenticated');
    const obs = data.obs || {};
    $('obs-health').hidden = !(obs.enabled ?? data.modules?.obs);
    setDot('dot-obs', obs.connected ? 'green' : obs.connecting ? 'yellow' : 'red');
    setText('obs-status', obs.connected ? 'Connected' : obs.connecting ? 'Connecting…' : 'Disconnected');
    $('obs-status').title = !obs.connected && obs.lastError ? obs.lastError : '';
    setText('overlay-clients', data.overlayClients ?? 0);

    setDot('dot-conn', 'green');
    const clock = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dayClock = iso => (new Date(iso).toDateString() === new Date().toDateString() ? '' : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ') + clock(iso);
    let sessionText;
    if (data.sessionPhase === 'waiting') {
        sessionText = `<strong>Waiting for stream</strong>${data.lastSessionEndedAt ? ' · last session ended ' + dayClock(data.lastSessionEndedAt) : ''}`;
    } else if (data.sessionPhase === 'ended') {
        sessionText = `<strong>Session ended</strong>${data.lastSessionEndedAt ? ' · ' + dayClock(data.lastSessionEndedAt) : ''}`;
    } else {
        const since = data.streamStartedAt || data.startedAt;
        sessionText = `<strong>Session live</strong>${since ? (data.streamStartedAt ? ' · live since ' : ' · started ') + dayClock(since) : ''}`;
    }
    setHtml('conn-text', sessionText);

    setText('stat-messages', fmt(ssn.messages));
    setText('stat-chatters', fmt(ssn.chatters));
    setText('stat-emotes', fmt(ssn.emotes));
    setText('stat-hashtags', fmt(ssn.hashtags));
    setText('stat-raids', fmt(ssn.raids));
    setText('stat-subs', fmt(persistent.subscribers ?? ssn.subscribers));
    setText('stat-subs-sub', session.subscribers ? `+${fmt(session.subscribers)} session` : '');
    setText('stat-followers', fmt(persistent.followers ?? ssn.followers));
    setText('stat-followers-sub', session.followers ? `+${fmt(session.followers)} session` : '');
    setText('stat-gifts', fmt(session.gift_subs));
    setText('stat-bits', fmt(session.bits));
    setText('stat-donations', fmt(session.donations, 2));

    setText('viewer-current', fmt(data.viewers?.current));
    setText('viewer-peak', fmt(data.viewers?.peak));
    setText('viewer-average', fmt(data.viewers?.average, 1));
    setText('viewer-source', (data.viewers?.source || '—').replace(/_/g, ' '));
    setText('viewer-live', data.viewers?.live ? 'Yes' : 'No');
    setText('goals-enabled-count', data.goals?.enabled || 0);
    setText('goals-complete-count', data.goals?.completed || 0);
    setText('goals-overlay-status', (data.goals?.enabled || 0) > 0 ? 'Ready' : 'No enabled goals');
    setText('timers-total', data.timers?.total || 0);
    setText('timers-running', data.timers?.running || 0);
    setText('timers-countdowns', data.timers?.countdowns || 0);
    setText('timers-stopwatches', data.timers?.stopwatches || 0);

    const timerItems = Array.isArray(data.timers?.items)
        ? data.timers.items
        : (data.timers?.primary ? [data.timers.primary] : []);
    setHtml('timers-list', timerItems.map(timer => {
        const isRunning = timer.state === 'running';
        const safeId = escapeHtml(timer.id);
        const safeLabel = escapeHtml(timer.label || timer.id);
        const stateCls = isRunning ? 'pill is-accent' : 'pill';
        return `<div class="timer-row">`
            + `<span class="timer-name" title="${safeLabel}">${safeLabel}</span>`
            + `<span class="timer-clock">${escapeHtml(timer.clock || '00:00')}</span>`
            + `<span class="${stateCls}">${escapeHtml(timer.state || 'idle')}</span>`
            + `<span class="timer-actions">`
            + `<button type="button" class="btn xs${isRunning ? ' on' : ''}" data-timer-action="toggle" data-timer-id="${safeId}" title="${isRunning ? 'Pause timer' : 'Start timer'}" aria-label="${isRunning ? 'Pause' : 'Start'} ${safeLabel}">${isRunning ? 'Pause' : 'Start'}</button>`
            + `<button type="button" class="btn xs" data-timer-action="reset" data-timer-id="${safeId}" title="Reset timer" aria-label="Reset ${safeLabel}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>`
            + `</span>`
            + `</div>`;
    }).join(''));

    const musicEnabled = !!data.music?.enabled;
    const musicState = data.music?.state || 'stopped';
    setDot('dot-music', musicEnabled ? (musicState !== 'stopped' ? 'green' : 'yellow') : 'red');
    setText('music-status', musicEnabled ? musicState : 'Disabled');
    setText('music-source', (data.music?.source || '—').replace(/_/g, ' '));
    setText('music-track', data.music?.track || 'Nothing playing');
    setText('music-artist', data.music?.artist || '—');

    setText('library-highlights', data.library?.highlights || 0);
    setText('library-sessions', data.library?.sessions || 0);
    setText('backup-auto', data.backups?.autoEnabled ? 'Enabled' : 'Disabled');
    setText('backup-count', data.backups?.count || 0);
    setText('backup-latest', formatBackupName(data.backups?.latest));

    const bot = data.chatbot || {};
    const botEnabled = bot.enabled !== false && data.modules?.chatbot !== false;
    setDot('dot-chatbot', botEnabled ? 'green' : 'yellow');
    setText('chatbot-status', botEnabled ? 'Active' : 'Disabled');
    setText('chatbot-commands', bot.commandsCount ?? 0);
    setText('chatbot-timed', bot.timedCount ?? 0);
    setText('chatbot-triggers', bot.triggersCount ?? 0);
    setText('chatbot-quotes', bot.quotesCount ?? 0);
    const botToggleBtn = $('chatbot-toggle-btn');
    if (botToggleBtn) {
        botToggleBtn.textContent = botEnabled ? 'Pause Bot' : 'Enable Bot';
        botToggleBtn.classList.toggle('on', !botEnabled);
    }

    const al = data.alerts || {};
    const alEnabled = al.enabled !== false;
    const alertsPaused = !!al.paused;
    const alertsMuted = !!al.muted;
    setDot('dot-alerts', alEnabled ? (alertsPaused ? 'yellow' : 'green') : 'red');
    setText('alerts-status', alEnabled ? (alertsPaused ? 'Paused' : alertsMuted ? 'Muted' : 'Active') : 'Disabled');
    setText('alerts-rules', al.rulesCount ?? 0);
    setText('alerts-pending', al.queuePending ?? 0);
    setText('alert-pause-btn', alertsPaused ? 'Resume' : 'Pause');
    $('alert-pause-btn')?.classList.toggle('on', alertsPaused);
    setText('alert-mute-btn', alertsMuted ? 'Unmute' : 'Mute');
    $('alert-mute-btn')?.classList.toggle('on', alertsMuted);

    setText('hashtags-tracked', data.hashtags?.tracked || 0);
    setText('hashtags-active-session', data.hashtags?.activeSession || 0);
    setText('hashtags-banned', data.hashtags?.banned || 0);
    setText('hashtags-top-tag', data.hashtags?.topTag || '—');

    const ms = data.milestones || {};
    setText('milestone-stream-num', ms.stream_number != null ? `#${ms.stream_number}` : '—');
    setText('milestone-hours', ms.total_hours != null ? `${ms.total_hours}h` : '—');
    setText('milestone-streak-days', ms.streak_days != null ? `${ms.streak_days}d` : '—');
    setText('milestone-streak-weeks', ms.streak_weeks != null ? `${ms.streak_weeks}w` : '—');
    const commChatters = ms.lifetime_chatters != null ? fmt(ms.lifetime_chatters) : '0';
    const commMsgs = ms.lifetime_messages != null ? fmt(ms.lifetime_messages) : '0';
    setText('milestone-community', `${commChatters} chatters · ${commMsgs} msgs`);
    const nextTarget = ms.next_stream_goal ? `Stream #${ms.next_stream_goal} (${Math.max(0, ms.next_stream_goal - (ms.stream_number || 0))} left)` : (ms.next_hours_goal ? `${ms.next_hours_goal}h` : '—');
    setText('milestone-next-target', nextTarget);

    renderVolumeChart(data.hourlyMessages || {});
    renderChatters(data.topChatters || [], ssn.chatters || 0);
    renderEvents(data.recentEvents || []);

    const info = $('stream-info-dash');
    const latest = data.streamInfo?.[data.streamInfo.length - 1];
    const infoHtml = latest ? `<strong>${escapeHtml(latest.title)}</strong>${latest.category ? `<span class="pill is-accent">${escapeHtml(latest.category)}</span>` : ''}` : '';
    setHtml('stream-info-dash', infoHtml);
    info.style.display = latest ? 'flex' : 'none';

    const sessionActive = !!data.sessionActive;
    setText('session-toggle-btn', sessionActive ? 'End Session' : 'Start Session');
    const toggleBtn = $('session-toggle-btn');
    if (toggleBtn) {
        toggleBtn.style.borderColor = sessionActive
            ? 'color-mix(in srgb, var(--warn) 31%, transparent)'
            : 'color-mix(in srgb, var(--success) 45%, transparent)';
    }
    const toolbarSessionBtn = $('toolbar-session-btn');
    if (toolbarSessionBtn) toolbarSessionBtn.hidden = sessionActive;

    renderLifecycle(data.lifecycle);
    return {
        sessionActive,
        alertsPaused,
        alertsMuted,
        botEnabled
    };
}
