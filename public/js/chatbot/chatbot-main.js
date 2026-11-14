/**
 * StreamPulse — Chatbot Studio Main Controller
 */

import {
    $, esc, toast, api, state, setState, dirty, setDirty,
    refreshStatus, liveStatus, prefixOf, download, svgIcon,
    usageRows, setUsageRows
} from './chatbot-state.js';
import {
    renderCommands, readCommands, setupCommandsEvents
} from './chatbot-commands.js';
import {
    renderList, readList, setupMessagesEvents
} from './chatbot-messages.js';
import {
    renderQuotes, setupQuotesEvents
} from './chatbot-quotes.js';
import {
    renderBanner, renderSettings, initSettingsSections,
    loadHostInfo, setupSettingsEvents
} from './chatbot-settings.js';

export function updateCounts() {
    const set = (k, n) => {
        const el = document.querySelector(`[data-c="${k}"]`);
        if (el) el.textContent = (n && Number(n) > 0) ? String(n) : '';
    };
    set('commands', state.commands?.length);
    set('quotes', state.quotes?.length);
    set('messages', state.messages?.length);
    set('triggers', state.triggers?.length);
    const varMatch = ($('var-count')?.textContent || '').match(/\d+/);
    set('variables', varMatch ? varMatch[0] : 0);
}

export async function loadActivity() {
    const listEl = $('activity-list');
    if (!listEl) return;
    try {
        const data = await api('/api/chatbot/activity');
        const actList = (data.activity || []).slice().reverse();
        const countEl = document.querySelector('[data-c="activity"]');
        if (countEl) countEl.textContent = actList.length ? String(actList.length) : '';

        if (!actList.length) {
            listEl.innerHTML = '<div class="empty">No recent chat bot activity. Run a command in chat or press a Companion button to see it here.</div>';
            return;
        }

        listEl.innerHTML = actList.map(a => {
            const dateStr = a.time ? new Date(a.time).toLocaleTimeString() : '';
            const kindBadge = a.kind === 'trigger' ? `<span class="meta-pill" style="border-color:rgba(59,130,246,0.4);color:#60a5fa;">${svgIcon('target')} Trigger</span>`
                : a.kind === 'shoutout' ? `<span class="meta-pill" style="border-color:rgba(245,158,11,0.4);color:#fbbf24;">${svgIcon('crown')} Raid Shoutout</span>`
                : `<span class="meta-pill" style="border-color:rgba(168,85,247,0.4);color:#c084fc;">${svgIcon('chat')} Command</span>`;
            const silentBadge = a.silent ? `<span class="meta-pill silent-pill">${svgIcon('volumeX')} Silent</span>` : '';
            const httpBadge = a.http ? `<span class="meta-pill api-pill">${svgIcon('link')} Webhook / API</span>` : '';
            const userStr = a.user ? `@${esc(a.user)}` : '';
            const nameStr = a.name ? (a.kind === 'command' ? `${prefixOf()}${esc(a.name)}` : esc(a.name)) : '';

            return `<div class="quote" style="grid-template-columns:auto 1fr;align-items:flex-start;gap:.75rem;padding:.75rem 1rem;">
                <div style="font-size:.78rem;font-family:ui-monospace,Menlo,monospace;color:var(--text-muted);white-space:nowrap;padding-top:.15rem;">${dateStr}</div>
                <div style="display:flex;flex-direction:column;gap:.3rem;">
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:.4rem;">
                        ${kindBadge}
                        <b style="font-size:.95rem;">${nameStr}</b>
                        ${userStr ? `<span class="muted" style="font-size:.84rem;">by <b>${userStr}</b></span>` : ''}
                        ${silentBadge}
                        ${httpBadge}
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = `<div class="empty muted">Failed to load activity: ${esc(e.message)}</div>`;
    }
}

export function renderUsage() {
    const sel = $('usage-cmd');
    if (!sel) return;
    const cur = sel.value;
    const cmds = [...new Map(usageRows.map(r => [r.key, r.label]))];
    sel.innerHTML = `<option value="">All commands</option>` + cmds.map(([k, l]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const q = ($('usage-person')?.value || '').trim().toLowerCase();
    const rows = usageRows.filter(r => (!sel.value || r.key === sel.value) && (!q || r.name.toLowerCase().includes(q)));
    const usageEl = $('usage');
    if (usageEl) {
        usageEl.innerHTML = rows.length ? `<table style="width:100%;margin-top:.5rem"><tr><th align=left>Command</th><th align=left>Person</th><th align=left>Used</th><th></th></tr>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.name)}</td><td>${r.n}/${r.limit} per ${r.per === 'forever' ? 'all time' : r.per}${r.n >= r.limit ? ' (at limit)' : ''}</td><td><button class="btn small" data-reset-key="${esc(r.key)}" data-reset-user="${esc(r.user)}">Reset</button></td></tr>`).join('')}</table>` : '<div class="empty">No limited commands have been used yet.</div>';
    }
    const el = document.querySelector('[data-c="usage"]');
    if (el) el.textContent = usageRows.length || '';
}

export async function loadUsage() {
    try {
        const res = await api('/api/chatbot/usage');
        setUsageRows(res.usage || []);
        renderUsage();
    } catch {
        /* usage is optional */
    }
}

export async function loadVars() {
    const varCountEl = $('var-count');
    const varsEl = $('vars');
    if (!varsEl) return;
    try {
        const { variables } = await api('/api/variables');
        if (varCountEl) varCountEl.textContent = `(${variables.length})`;
        updateCounts();
        const inp = 'padding:.25rem;background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;color:var(--text)';
        varsEl.innerHTML = variables.length ? variables.map(v => {
            const head = `<b>${esc(v.name)}</b> <span class="meta">${v.type} · {{var.${esc(v.name)}}}</span>`;
            let body = '';
            if (v.type === 'counter') body = `<button class="btn small" data-v="decrement">-</button><input data-v="value" type="number" value="${v.value}" style="width:6rem;${inp}"><button class="btn small" data-v="increment">+</button><button class="btn small" data-v="reset">Reset</button>`;
            else if (v.type === 'text') body = `<input data-v="value" value="${esc(v.value)}" style="width:14rem;${inp}">`;
            else body = `<span class="muted" style="max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Now: ${esc(v.value) || '(empty)'}</span><button class="btn small" data-v="roll">Pick next</button>`;
            const list = v.type === 'list' ? `<details style="grid-column:1/-1"><summary class="muted" style="cursor:pointer">${v.items.length} items · ${v.mode === 'sequential' ? 'in order' : 'random'} (edit)</summary><textarea data-v="items" rows="5" style="width:100%;margin-top:.4rem;${inp}" placeholder="One item per line">${esc(v.items.join('\n'))}</textarea><div class="row" style="margin-top:.4rem"><label class="check">Pick <select data-v="mode"><option value="random" ${v.mode !== 'sequential' ? 'selected' : ''}>Randomly</option><option value="sequential" ${v.mode === 'sequential' ? 'selected' : ''}>In order</option></select></label><button class="btn small" data-v="save-items">Save list</button></div></details>` : '';
            return `<div class="quote" style="grid-template-columns:1fr auto" data-n="${esc(v.name)}"><div>${head}</div><div class="row">${body}<button class="btn small danger" data-v="delete">Delete</button></div>${list}</div>`;
        }).join('') : '<div class="empty">None yet. Counters track numbers (deaths, wins), text holds a value, lists pick one item at a time.</div>';
    } catch (e) {
        toast(e.message);
    }
}

let activeTabName = 'commands';
let activityPollTimer = null;

function syncActivityPolling() {
    if (activityPollTimer) {
        clearInterval(activityPollTimer);
        activityPollTimer = null;
    }
    if (activeTabName === 'activity' && !document.hidden) {
        activityPollTimer = setInterval(loadActivity, 3000);
    }
}

export function showTab(name) {
    if (name === 'timed') name = 'messages';
    if (!document.querySelector(`#tabs [data-t="${name}"]`)) name = 'commands';
    activeTabName = name;
    try { localStorage.setItem('streampulse:chatbot:tab', name); } catch {}
    let activeBtn = null;
    document.querySelectorAll('#tabs button').forEach(b => {
        const isSel = b.dataset.t === name;
        b.setAttribute('aria-selected', String(isSel));
        b.classList.toggle('active', isSel);
        if (isSel) activeBtn = b;
    });
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    const refFrame = $('ref-frame');
    if (name === 'reference' && refFrame) refFrame.src = '/commands.html';
    if (name === 'activity') loadActivity();
    syncActivityPolling();
    document.querySelectorAll('.card[data-tab]').forEach(c => { c.hidden = c.dataset.tab !== name; });
    history.replaceState(null, '', `#${name}`);
}

export function applyState(data) {
    setDirty(false);
    loadUsage().catch(() => {});
    loadActivity().catch(() => {});
    setState(data);
    updateCounts();
    renderBanner(applyState);
    renderSettings();
    renderCommands();
    renderQuotes();
    renderList('messages');
    renderList('triggers');
}

export function initLiveData() {
    const panel = $('live-data'), tree = $('ld-tree');
    if (!panel || !tree) return;
    let data = {}, paused = localStorage.getItem('sp.chatbot.liveData.paused') === '1';
    const setPause = () => {
        const pauseBtn = $('ld-pause');
        if (pauseBtn) pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    };
    const fmt = v => typeof v === 'string' ? JSON.stringify(v) : String(v);
    const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    function rows(value, path, q, depth) {
        if (value && typeof value === 'object') {
            const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
            return entries.map(([k, v]) => rows(v, `${path}.${k}`, q, depth + 1)).join('');
        }
        const text = fmt(value);
        if (q && !path.toLowerCase().includes(q) && !text.toLowerCase().includes(q)) return '';
        const ph = `{{rep.${path}}}`;
        return `<div style="display:flex;gap:.5rem;align-items:center;padding:.15rem 0;border-bottom:1px solid var(--border);"><code style="flex:0 1 45%;overflow-wrap:anywhere;">${esc(path)}</code><span style="flex:1;overflow-wrap:anywhere;">${esc(text.slice(0, 300))}</span><button class="btn small" type="button" data-ph="${esc(ph)}" title="Copy ${esc(ph)}" aria-label="Copy placeholder">${copyIcon}</button></div>`;
    }
    function render() {
        const filterEl = $('ld-filter');
        const q = filterEl ? filterEl.value.trim().toLowerCase() : '';
        tree.innerHTML = Object.entries(data).map(([k, v]) => rows(v, k, q, 0)).join('') || '<p class="muted">No matches.</p>';
    }
    async function load() {
        if (paused && !panel.hidden) return;
        try {
            const r = await api('/api/external-data');
            data = r.data || {};
            panel.hidden = !r.count;
            const countEl = $('ld-count');
            if (countEl) countEl.textContent = r.count ? String(r.count) : '';
            const noteEl = $('ld-note');
            if (noteEl) noteEl.hidden = !r.truncated;
            if (panel.open) render();
        } catch { /* keep last data */ }
    }
    panel.open = localStorage.getItem('sp.chatbot.liveData.open') === '1';
    panel.addEventListener('toggle', () => {
        localStorage.setItem('sp.chatbot.liveData.open', panel.open ? '1' : '0');
        if (panel.open) render();
    });
    $('ld-filter')?.addEventListener('input', render);
    $('ld-pause')?.addEventListener('click', () => {
        paused = !paused;
        localStorage.setItem('sp.chatbot.liveData.paused', paused ? '1' : '0');
        setPause();
    });
    tree.addEventListener('click', e => {
        const b = e.target.closest('[data-ph]');
        if (b) navigator.clipboard.writeText(b.dataset.ph).then(() => toast(`Copied ${b.dataset.ph}`)).catch(() => {});
    });
    setPause();
    load();
    setInterval(load, 5000);
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    refreshStatus();
    if (window.pollVisible) {
        window.pollVisible(refreshStatus, 5000);
    } else {
        setInterval(refreshStatus, 5000);
    }

    setupCommandsEvents(applyState);
    setupMessagesEvents(applyState);
    setupQuotesEvents(applyState);
    setupSettingsEvents(applyState);

    // Tab navigation
    $('tabs')?.addEventListener('click', e => {
        const b = e.target.closest('button[data-t]');
        if (b) showTab(b.dataset.t);
    });

    // Activity refresh & quick send
    $('refresh-activity')?.addEventListener('click', loadActivity);
    $('activity-send-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('activity-send-input');
        const text = input?.value.trim();
        if (!text) return;
        try {
            await api('/api/chatbot/send', 'POST', { text, source: 'Studio' });
            input.value = '';
            toast('Message sent to chat');
            loadActivity();
        } catch (err) {
            toast(err.message);
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (activeTabName === 'activity' && !document.hidden) loadActivity();
        syncActivityPolling();
    });

    // Usage table filters and actions
    $('usage-cmd')?.addEventListener('change', renderUsage);
    $('usage-person')?.addEventListener('input', renderUsage);
    $('usage')?.closest('.card')?.addEventListener('click', async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-reset-all')) {
            const shown = [...$('usage').querySelectorAll('[data-reset-key]')];
            if (!shown.length) return;
            const confirmed = window.StreamPulse
                ? await window.StreamPulse.confirm('Reset Usage', `Reset ${shown.length} count(s)?`, { danger: true, confirmText: 'Reset' })
                : confirm(`Reset ${shown.length} count(s)?`);
            if (!confirmed) return;
            for (const s of shown) {
                await api('/api/chatbot/usage/reset', 'POST', { key: s.dataset.resetKey, user: s.dataset.resetUser });
            }
        } else if (b.dataset.resetKey) {
            await api('/api/chatbot/usage/reset', 'POST', { key: b.dataset.resetKey, user: b.dataset.resetUser });
        }
        loadUsage();
    });

    // Variables actions
    $('var-add')?.addEventListener('click', async () => {
        try {
            await api(`/api/variables/${encodeURIComponent($('var-name').value)}`, 'PUT', { type: $('var-type').value });
            $('var-name').value = '';
            loadVars();
        } catch (e) {
            toast(e.message);
        }
    });

    $('vars')?.addEventListener('click', async event => {
        const act = event.target.dataset.v, row = event.target.closest('[data-n]');
        if (!act || ['value', 'items', 'mode'].includes(act) || !row) return;
        const url = `/api/variables/${encodeURIComponent(row.dataset.n)}`;
        try {
            if (act === 'delete') {
                await api(url, 'DELETE');
            } else if (act === 'save-items') {
                await api(url, 'PUT', { items: row.querySelector('[data-v=items]').value, mode: row.querySelector('[data-v=mode]').value });
            } else {
                await api(`${url}/${act}`, 'POST', {});
            }
            loadVars();
        } catch (e) {
            toast(e.message);
        }
    });

    $('vars')?.addEventListener('change', async event => {
        const row = event.target.closest('[data-n]');
        if (event.target.dataset.v === 'value' && row) {
            try {
                await api(`/api/variables/${encodeURIComponent(row.dataset.n)}`, 'PUT', { value: event.target.value });
                loadVars();
            } catch (e) {
                toast(e.message);
            }
        }
    });

    // Full export & import
    $('export-all')?.addEventListener('click', async () => {
        try {
            download(`streampulse-chatbot-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(await api('/api/chatbot/export'), null, 2));
        } catch (e) {
            toast(e.message);
        }
    });

    $('import-all')?.addEventListener('click', () => $('import-all-file')?.click());
    $('import-all-file')?.addEventListener('change', async event => {
        const f = event.target.files?.[0];
        event.target.value = '';
        if (!f) return;
        try {
            const body = JSON.parse(await f.text());
            const confirmed = window.StreamPulse
                ? await window.StreamPulse.confirm('Import Chat Bot Configuration', 'Replace all chat bot commands, quotes, messages, triggers, variables and settings with this file?', { danger: true, confirmText: 'Replace All' })
                : confirm('Replace all chat bot commands, quotes, messages, triggers, variables and settings with this file?');
            if (!confirmed) return;
            const r = await api('/api/chatbot/import', 'POST', body);
            applyState(r);
            loadVars();
            if (window.StreamPulse) window.StreamPulse.toast('Configuration imported successfully', 'success');
            else toast('Configuration imported successfully');
        } catch (e) {
            if (window.StreamPulse) window.StreamPulse.toast('Import failed: ' + e.message, 'error');
            else toast('Import failed: ' + e.message);
        }
    });

    // Recent chat
    $('show-recent')?.addEventListener('click', async () => {
        try {
            const { recent } = await api('/api/chatbot/recent');
            $('recent').innerHTML = recent.length ? recent.map(r => `<details class="item" style="margin-top:.4rem"><summary><b>${esc(r.user)}</b><span class="sum">mod: ${r.mod ? 'yes' : 'no'} · subscriber: ${r.sub ? 'yes' : 'no'}</span></summary><pre style="white-space:pre-wrap;font-size:.72rem;color:var(--text-muted)">${esc(Object.entries(r.fields).map(([k, v]) => `${k}: ${v}`).join('\n'))}</pre></details>`).join('') : '<div class="empty">No chat seen since the server started. Send a message in chat, then try again.</div>';
        } catch (e) {
            toast(e.message);
        }
    });

    // Quote settings alias
    $('save-quote-settings')?.addEventListener('click', () => $('save-settings')?.click());

    // Bottom action button relays
    $('save-settings-bottom')?.addEventListener('click', () => $('save-settings')?.click());
    $('add-command-bottom')?.addEventListener('click', () => $('add-command')?.click());
    $('save-commands-bottom')?.addEventListener('click', () => $('save-commands')?.click());
    $('add-message-bottom')?.addEventListener('click', () => $('add-message')?.click());
    $('save-messages-bottom')?.addEventListener('click', () => $('save-messages')?.click());
    $('add-trigger-bottom')?.addEventListener('click', () => $('add-trigger')?.click());
    $('save-triggers-bottom')?.addEventListener('click', () => $('save-triggers')?.click());

    // Cheat sheet copy tags
    document.addEventListener('click', e => {
        const tag = e.target.closest('.copy-tag');
        if (tag && tag.dataset.copy) {
            navigator.clipboard.writeText(tag.dataset.copy).then(() => toast(`Copied ${tag.dataset.copy}`)).catch(() => {});
        }
    });

    // Dirty state tracking
    document.addEventListener('input', e => {
        if (e.target.closest('#tab-settings, #tab-commands, #tab-messages, #tab-triggers')) setDirty(true);
    });
    document.addEventListener('change', e => {
        if (e.target.closest('#tab-settings, #tab-commands, #tab-messages, #tab-triggers')) setDirty(true);
    });
    window.addEventListener('beforeunload', event => {
        if (dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // Initialize UI views
    let initialTab = location.hash.slice(1);
    if (!initialTab) {
        try { initialTab = localStorage.getItem('streampulse:chatbot:tab') || ''; } catch {}
    }
    showTab(initialTab);
    initSettingsSections();
    loadVars().then(updateCounts);
    loadHostInfo();
    initLiveData();

    // Initial server fetch
    api('/api/chatbot').then(applyState).catch(e => {
        const banner = $('banner');
        if (banner) banner.innerHTML = `<div class="banner warn">${esc(e.message)}</div>`;
    });
});
