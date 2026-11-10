/**
 * StreamPulse — Chatbot Studio Settings & Integrations Controller
 */

import { $, esc, svgIcon, toast, api, state, hostInfo, setHostInfo } from './chatbot-state.js';

export function renderBanner(applyState) {
    const bannerEl = $('banner');
    if (!bannerEl) return;
    const msgs = [];
    const isModuleDisabled = state.moduleEnabled === false;
    if (isModuleDisabled) {
        msgs.push('Chat bot is <b>disabled</b> in <a href="/config-editor.html">Config Editor</a>.');
    } else if (!state.enabled) {
        msgs.push('The chat bot is currently <b>Off</b>.');
    }
    if (!state.ssnConfigured) {
        msgs.push('Add your SocialStream session ID in <a href="/config-editor.html">Config</a> so the bot can reply.');
    }
    const toggleBtn = isModuleDisabled
        ? `<a class="btn small" href="/config-editor.html" style="text-decoration:none;">Enable in Config <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`
        : `<button class="btn small ${state.enabled ? '' : 'primary'}" id="btn-toggle-bot">${state.enabled ? 'Turn Off' : 'Turn On'}</button>`;
    bannerEl.innerHTML = `<div class="banner ${state.enabled && state.ssnConfigured && !isModuleDisabled ? '' : 'warn'}" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;"><div>${msgs.length ? msgs.join('<br>') : 'Chat bot is <b>On</b> and ready to respond.'}</div>${toggleBtn}</div>`;
    const btn = $('btn-toggle-bot');
    if (btn) {
        btn.onclick = async () => {
            try {
                const res = await api('/api/chatbot/enabled', 'POST', { action: 'toggle' });
                if (applyState) applyState(res);
                toast(`Chat bot is now ${res.enabled ? 'ON' : 'OFF'}`);
            } catch (e) { toast(e.message); }
        };
    }
}

export function renderTwitchMods() {
    const box = $('twitch-mods-box');
    if (!box) return;
    const mods = state.twitchMods || [];
    const broadcaster = state.broadcaster || '';
    const countEl = $('twitch-mods-count');
    const chipsEl = $('twitch-mods-chips');
    const noteEl = $('twitch-mods-note');

    if (mods.length || broadcaster) {
        if (countEl) {
            countEl.textContent = `${mods.length} mod${mods.length === 1 ? '' : 's'} synced`;
            countEl.style.color = 'var(--text)';
            countEl.style.borderColor = 'var(--border)';
        }

        let chipsHtml = '';
        if (broadcaster) {
            chipsHtml += `<span class="meta-pill" style="color:#f59e0b;border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.08);font-weight:600;">${svgIcon('crown')} ${esc(broadcaster)} (Broadcaster)</span>`;
        }
        for (const m of mods) {
            chipsHtml += `<span class="meta-pill" style="color:#a970ff;border-color:rgba(169,112,255,0.4);background:rgba(169,112,255,0.08);">${svgIcon('shield')} ${esc(m.name || m.login)}</span>`;
        }
        if (chipsEl) chipsEl.innerHTML = chipsHtml;
        if (noteEl) noteEl.innerHTML = `Auto-detected from Twitch API. These users automatically have mod privileges for all commands and quotes.`;
    } else {
        if (countEl) {
            countEl.textContent = '0 synced';
            countEl.style.color = '#f85149';
        }
        if (chipsEl) chipsEl.innerHTML = '<span class="muted" style="font-size:.82rem;">No Twitch moderators synced yet. Click "Sync Twitch Mods" or connect Twitch in Config.</span>';
        if (noteEl) noteEl.textContent = '';
    }
}

export function renderSettings() {
    const s = state.settings;
    if ($('s-prefix')) $('s-prefix').value = s.prefix || '!';
    if ($('s-tag')) $('s-tag').value = s.tag ?? '';
    if ($('s-cooldown')) $('s-cooldown').value = s.cooldown ?? 5;
    if ($('s-modcooldown')) $('s-modcooldown').value = s.modCooldown ?? '';
    if ($('s-mods')) $('s-mods').value = (s.mods || []).join(', ');

    if ($('s-shoutout-enabled')) $('s-shoutout-enabled').checked = s.autoShoutout?.enabled === true;
    if ($('s-shoutout-message')) $('s-shoutout-message').value = s.autoShoutout?.message ?? 'Welcome raiders from @{{user}}! Show them some love: twitch.tv/{{user}}';
    if ($('s-shoutout-min')) $('s-shoutout-min').value = s.autoShoutout?.minViewers ?? 0;

    const pa = s.pollAnnouncements || {};
    if ($('s-poll-announce-enabled')) $('s-poll-announce-enabled').checked = pa.enabled !== false;
    if ($('s-poll-announce-start')) $('s-poll-announce-start').checked = pa.announceStart !== false;
    if ($('s-poll-announce-end')) $('s-poll-announce-end').checked = pa.announceEnd !== false;
    if ($('s-poll-template-start')) $('s-poll-template-start').value = pa.startTemplate ?? '';
    if ($('s-poll-template-end')) $('s-poll-template-end').value = pa.endTemplate ?? '';
    if ($('s-poll-template-tie')) $('s-poll-template-tie').value = pa.tieTemplate ?? '';
    if ($('s-poll-template-champ')) $('s-poll-template-champ').value = pa.championTemplate ?? '';

    const ta = s.tierAnnouncements || {};
    if ($('s-tier-announce-enabled')) $('s-tier-announce-enabled').checked = ta.enabled !== false;
    if ($('s-tier-announce-start')) $('s-tier-announce-start').checked = ta.announceStart !== false;
    if ($('s-tier-announce-end')) $('s-tier-announce-end').checked = ta.announceEnd !== false;
    if ($('s-tier-template-start')) $('s-tier-template-start').value = ta.startTemplate ?? '';
    if ($('s-tier-template-end')) $('s-tier-template-end').value = ta.endTemplate ?? '';

    const tra = s.triviaAnnouncements || {};
    if ($('s-trivia-announce-enabled')) $('s-trivia-announce-enabled').checked = tra.enabled !== false;
    if ($('s-trivia-announce-start')) $('s-trivia-announce-start').checked = tra.announceStart !== false;
    if ($('s-trivia-announce-end')) $('s-trivia-announce-end').checked = tra.announceEnd !== false;
    if ($('s-trivia-template-start')) $('s-trivia-template-start').value = tra.startTemplate ?? '';
    if ($('s-trivia-template-end')) $('s-trivia-template-end').value = tra.endTemplate ?? '';

    const da = s.donationAnnouncements || {};
    if ($('s-don-enabled')) $('s-don-enabled').checked = da.enabled === true;
    renderDonationSources(da.source || 'any');
    if ($('s-don-min')) $('s-don-min').value = da.minAmount ?? 50;
    if ($('s-don-template')) $('s-don-template').value = da.template ?? '';
    if ($('s-don-total')) $('s-don-total').value = da.totalVar ?? '';
    if ($('s-don-goal')) $('s-don-goal').value = da.goalVar ?? '';

    syncDonationFields();
    renderTwitchMods();

    const builtinsEl = $('builtins');
    if (builtinsEl) {
        builtinsEl.innerHTML = ['quote', 'quotes', 'addquote', 'delquote'].map(n => {
            const b = (s.builtins || {})[n] || {};
            return `<div class="row" data-b="${n}"><code style="min-width:7rem">${s.prefix || '!'}${n}</code><label class="check">Who can use <select data-bk="access"><option value="everyone" ${b.access === 'everyone' ? 'selected' : ''}>Everyone</option><option value="subs" ${b.access === 'subs' ? 'selected' : ''}>Subscribers + mods</option><option value="mods" ${b.access === 'mods' ? 'selected' : ''}>Mods only</option><option value="disabled" ${b.access === 'disabled' ? 'selected' : ''}>Disabled</option></select></label><label class="check">Cooldown (s)<input data-bk="cooldown" type="number" min="0" value="${b.cooldown ?? ''}" placeholder="default" style="width:6rem"></label></div>`;
        }).join('');
    }
}

export function renderDonationSources(current) {
    const list = [['any', 'Any source'], ['socialstream', 'SocialStream'], ...hostInfo.hostSources.map(s => [s.id, s.label])];
    if (current && !list.some(([id]) => id === current)) list.push([current, current === 'external' ? 'Other integrations' : `${current} (not connected)`]);
    const sourceEl = $('s-don-source');
    if (sourceEl) {
        sourceEl.innerHTML = list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
        sourceEl.value = current;
    }
}

export async function loadHostInfo() {
    try {
        const st = await api('/api/status');
        const flat = [];
        const walk = (v, p, d = 0) => {
            if (v && typeof v === 'object' && !Array.isArray(v) && d < 3) Object.entries(v).forEach(([k, x]) => walk(x, `${p}.${k}`, d + 1));
            else if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))) flat.push(p);
        };
        Object.entries(st.external || {}).forEach(([k, v]) => walk(v, `rep.${k}`));
        setHostInfo({ hostSources: st.hostSources || [], externalKeys: flat });
    } catch { /* status unavailable */ }

    const has = hostInfo.externalKeys.length > 0;
    document.querySelectorAll('[data-host-data]').forEach(el => { el.hidden = !has; });
    const varsEl = $('s-don-vars');
    if (varsEl) varsEl.innerHTML = hostInfo.externalKeys.map(k => `<option value="${esc(k)}">`).join('');
    const exEl = $('s-don-money-example');
    if (has && exEl) exEl.textContent = `{{${hostInfo.externalKeys[0]}|money}}`;
    if (state.settings) renderDonationSources(state.settings.donationAnnouncements?.source || 'any');
}

export function syncDonationFields() {
    const donEnabled = $('s-don-enabled');
    if (!donEnabled) return;
    const enabled = donEnabled.checked;
    const donFields = $('s-don-fields');
    if (donFields) donFields.hidden = !enabled;
    const hint = $('s-don-disabled-hint');
    if (hint) hint.style.display = enabled ? 'none' : 'block';
}

const SETTINGS_SECTIONS_STORAGE_KEY = 'streampulse:chatbot:settings-sections';

export function initSettingsSections() {
    const sections = document.querySelectorAll('.settings-section[data-section]');
    if (!sections.length) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_SECTIONS_STORAGE_KEY) || '{}'); } catch {}
    sections.forEach(sec => {
        const id = sec.dataset.section;
        if (id && saved[id] !== undefined) {
            sec.open = Boolean(saved[id]);
        }
        sec.addEventListener('toggle', () => {
            if (id) saved[id] = sec.open;
            try { localStorage.setItem(SETTINGS_SECTIONS_STORAGE_KEY, JSON.stringify(saved)); } catch {}
            updateToggleAllBtn();
        });
    });

    function updateToggleAllBtn() {
        const btn = $('btn-toggle-all-settings');
        if (!btn) return;
        const anyOpen = [...sections].some(s => s.open);
        btn.textContent = anyOpen ? 'Collapse all' : 'Expand all';
    }

    $('btn-toggle-all-settings')?.addEventListener('click', () => {
        const anyOpen = [...sections].some(s => s.open);
        const nextState = !anyOpen;
        sections.forEach(sec => {
            sec.open = nextState;
            const id = sec.dataset.section;
            if (id) saved[id] = nextState;
        });
        try { localStorage.setItem(SETTINGS_SECTIONS_STORAGE_KEY, JSON.stringify(saved)); } catch {}
        updateToggleAllBtn();
    });

    updateToggleAllBtn();
}

export function setupSettingsEvents(applyState) {
    $('s-don-enabled')?.addEventListener('change', syncDonationFields);

    $('save-settings')?.addEventListener('click', async () => {
        try {
            applyState(await api('/api/chatbot', 'PUT', {
                settings: {
                    prefix: $('s-prefix').value,
                    tag: $('s-tag').value,
                    cooldown: $('s-cooldown').value,
                    modCooldown: $('s-modcooldown').value,
                    mods: $('s-mods').value,
                    autoShoutout: {
                        enabled: $('s-shoutout-enabled').checked,
                        message: $('s-shoutout-message').value,
                        minViewers: Number($('s-shoutout-min').value) || 0
                    },
                    pollAnnouncements: {
                        enabled: $('s-poll-announce-enabled').checked,
                        announceStart: $('s-poll-announce-start').checked,
                        announceEnd: $('s-poll-announce-end').checked,
                        startTemplate: $('s-poll-template-start').value,
                        endTemplate: $('s-poll-template-end').value,
                        tieTemplate: $('s-poll-template-tie').value,
                        championTemplate: $('s-poll-template-champ').value
                    },
                    tierAnnouncements: {
                        enabled: $('s-tier-announce-enabled').checked,
                        announceStart: $('s-tier-announce-start').checked,
                        announceEnd: $('s-tier-announce-end').checked,
                        startTemplate: $('s-tier-template-start').value,
                        endTemplate: $('s-tier-template-end').value
                    },
                    triviaAnnouncements: {
                        enabled: $('s-trivia-announce-enabled').checked,
                        announceStart: $('s-trivia-announce-start').checked,
                        announceEnd: $('s-trivia-announce-end').checked,
                        startTemplate: $('s-trivia-template-start').value,
                        endTemplate: $('s-trivia-template-end').value
                    },
                    donationAnnouncements: {
                        enabled: $('s-don-enabled').checked,
                        source: $('s-don-source').value,
                        minAmount: Number($('s-don-min').value) || 0,
                        template: $('s-don-template').value,
                        totalVar: $('s-don-total').value,
                        goalVar: $('s-don-goal').value
                    },
                    builtins: Object.fromEntries([...document.querySelectorAll('#builtins [data-b]')].map(r => [r.dataset.b, { access: r.querySelector('[data-bk=access]').value, cooldown: r.querySelector('[data-bk=cooldown]').value }]))
                }
            }));
            toast('Settings saved');
        } catch (e) { toast(e.message); }
    });

    $('test-donation-announce')?.addEventListener('click', async () => {
        try {
            const res = await api('/api/chatbot/test-donation-announce', 'POST');
            toast(res.sent ? 'Test announcement posted to chat' : `Chatbot not ready: ${res.reason || res.error || 'Check SocialStream connection'}`);
        } catch (e) { toast(`Test failed: ${e.message}`); }
    });

    $('test-poll-announce')?.addEventListener('click', async () => {
        try {
            const res = await api('/api/chatbot/test-poll-announce', 'POST');
            if (res.sent) {
                toast('Test announcement posted to chat');
            } else {
                toast(`Chatbot not ready: ${res.reason || 'Check SocialStream connection'}`);
            }
        } catch (e) {
            toast(`Test failed: ${e.message}`);
        }
    });

    $('test-tier-announce')?.addEventListener('click', async () => {
        try {
            const res = await api('/api/chatbot/test-tier-announce', 'POST');
            if (res.sent) {
                toast('Test announcement posted to chat');
            } else {
                toast(`Chatbot not ready: ${res.reason || res.error || 'Check SocialStream connection'}`);
            }
        } catch (e) {
            toast(`Test failed: ${e.message}`);
        }
    });

    $('test-trivia-announce')?.addEventListener('click', async () => {
        try {
            const res = await api('/api/chatbot/test-trivia-announce', 'POST');
            if (res.sent) {
                toast('Test announcement posted to chat');
            } else {
                toast(`Chatbot not ready: ${res.reason || res.error || 'Check SocialStream connection'}`);
            }
        } catch (e) {
            toast(`Test failed: ${e.message}`);
        }
    });

    $('sync-twitch-mods')?.addEventListener('click', async () => {
        const btn = $('sync-twitch-mods');
        const orig = btn.textContent;
        btn.textContent = 'Syncing…';
        btn.disabled = true;
        try {
            const res = await api('/api/fetch', 'POST');
            const updated = await api('/api/chatbot');
            applyState(updated);
            toast(`Synced with Twitch (${res.moderators ?? updated.twitchMods?.length ?? 0} mods detected)`);
        } catch (e) {
            toast(`Twitch sync failed: ${e.message}`);
        } finally {
            btn.textContent = orig;
            btn.disabled = false;
        }
    });

    $('test-shoutout')?.addEventListener('click', async () => {
        try {
            const message = $('s-shoutout-message').value.trim();
            await api('/api/chatbot/test-shoutout', 'POST', {
                user: 'AwesomeStreamer',
                viewers: 42,
                message
            });
            toast('Test shoutout sent to chat');
        } catch (e) { toast(e.message); }
    });
}
