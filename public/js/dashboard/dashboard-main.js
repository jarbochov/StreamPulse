/**
 * StreamPulse Dashboard entry point: live status polling, actions, and layout initialization.
 */

import { $, setDot, setText, showToast } from './dashboard-state.js';
import { createLayoutManager } from './dashboard-layout.js';
import { renderDashboard, loadCustomOverlayCount } from './dashboard-render.js';

const grid = $('dashboard-grid');
const layoutManager = createLayoutManager(grid);

let refreshInterval;
let inFlight = false;
let lastOk = 0;
let liveState = { sessionActive: true, alertsPaused: false, alertsMuted: false };

async function call(url, message) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (message) showToast(message);
    return response.json().catch(() => ({}));
}

async function refresh() {
    if (inFlight || document.hidden) return;
    inFlight = true;
    try {
        const response = await fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Status fetch failed');
        liveState = renderDashboard(await response.json(), layoutManager);
        lastOk = Date.now();
    } catch {
        setDot('dot-server', 'red');
        setText('uptime', 'Offline');
        setDot('dot-conn', 'red');
        setText('conn-text', 'Server unreachable — retrying…');
    } finally {
        inFlight = false;
    }
}

const actions = {
    async 'fetch-twitch'() {
        showToast('Fetching Twitch data…');
        try {
            const data = await call('/api/fetch');
            showToast(data.error ? `Twitch fetch problem: ${data.error}` : `Twitch: ${data.subs ?? '?'} subs, ${data.followers ?? '?'} followers`);
            refresh();
        } catch { showToast('Fetch failed'); }
    },
    'reauth-twitch'() {
        window.open('/auth/twitch?return=/dashboard.html', '_blank');
        showToast('Opening Twitch auth…');
    },
    async 'reset-chat'() {
        if (!await window.StreamPulse.confirm('Reset Chat', 'Reset all chat data for this session?', { danger: true, confirmText: 'Reset Chat' })) return;
        try { await call('/api/reset', 'Chat data reset'); refresh(); } catch { showToast('Reset failed'); }
    },
    async 'reset-stats'() {
        if (!await window.StreamPulse.confirm('Reset Stats', 'Reset ALL persistent stats? This cannot be undone.', { danger: true, confirmText: 'Reset All Stats' })) return;
        try { await call('/api/stats/reset', 'Stats reset'); refresh(); } catch { showToast('Reset failed'); }
    },
    async 'toggle-session'() {
        if (liveState.sessionActive) {
            if (!await window.StreamPulse.confirm('End Session', 'End session? This archives chat data and resets for the next stream. The server keeps running.', { confirmText: 'End Session' })) return;
            try { const data = await call('/api/end-session'); showToast(data.archived ? `Archived: ${data.archived}` : 'Session ended'); refresh(); }
            catch { showToast('End session failed'); }
        } else {
            try { await call('/api/start-session', 'New session started'); refresh(); } catch { showToast('Start session failed'); }
        }
    },
    async 'alert-pause'() {
        const endpoint = liveState.alertsPaused ? '/api/alerts/queue/resume' : '/api/alerts/queue/pause';
        try { await call(endpoint, liveState.alertsPaused ? 'Alerts resumed' : 'Alerts paused'); refresh(); }
        catch { showToast('Alert action failed'); }
    },
    async 'alert-mute'() {
        const nextMuted = !liveState.alertsMuted;
        try { await call(`/api/alerts/mute?muted=${nextMuted}`, nextMuted ? 'Alerts muted' : 'Alerts unmuted'); refresh(); }
        catch { showToast('Mute toggle failed'); }
    },
    async 'alert-skip'() {
        try { await call('/api/alerts/queue/skip', 'Skipped active alert'); refresh(); }
        catch { showToast('Skip failed'); }
    },
    async shutdown() {
        if (!await window.StreamPulse.confirm('Shut Down Server', 'Shut down the server? This archives data and stops the process.', { danger: true, confirmText: 'Shut Down' })) return;
        try {
            await call('/api/shutdown', 'Server shutting down…');
            clearInterval(refreshInterval);
            setTimeout(() => {
                document.body.innerHTML = `<main style="max-width:640px;margin:18vh auto;padding:2rem;text-align:center;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><h1>StreamPulse is stopped</h1><p style="color:var(--text-muted);margin:1rem 0;">The server shut down successfully. Start StreamPulse again to reopen the dashboard.</p></main>`;
            }, 600);
        } catch { showToast('Shutdown failed'); }
    },
    async restart() {
        if (!await window.StreamPulse.confirm('Restart Server', 'Restart StreamPulse and continue the current session?', { confirmText: 'Restart' })) return;
        clearInterval(refreshInterval);
        showToast('Restart requested — waiting for the new process…');
        try {
            const previous = await (await fetch('/api/status', { cache: 'no-store' })).json();
            try { await fetch('/api/restart', { cache: 'no-store' }); } catch { /* the process may drop the connection */ }
            for (let attempt = 0; attempt < 30; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 500));
                try {
                    const data = await (await fetch('/api/status', { cache: 'no-store' })).json();
                    if (data.processStartedAt && data.processStartedAt !== previous.processStartedAt) {
                        showToast('StreamPulse restarted — the current session continues');
                        break;
                    }
                } catch { /* still restarting */ }
            }
        } catch { showToast('Restart failed'); }
        refresh();
        refreshInterval = setInterval(() => { if (!document.hidden) refresh(); }, 3000);
    }
};

document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action && actions[action]) actions[action]();
});

setInterval(() => {
    if (lastOk && Date.now() - lastOk > 10000 && !document.hidden) setDot('dot-conn', 'yellow');
}, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

window.refresh = refresh;
window.loadCustomOverlayCount = loadCustomOverlayCount;

refresh();
loadCustomOverlayCount();
refreshInterval = setInterval(() => { if (!document.hidden) refresh(); }, 3000);
setInterval(() => { if (!document.hidden) loadCustomOverlayCount(); }, 60000);
