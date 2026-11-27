'use strict';

import { $, connectLiveSocket, esc, toast } from '../shared/client-core.js';
import { OP_ICONS } from './operator-icons.js';
import { openCustomizeTabsModal, openPresetsModal } from './operator-presets.js';
import { getOperatorModule, listEnabledModules } from './operator-registry.js';
import {
    activateProfileOnServer,
    applyRemoteActiveProfile,
    applyRemoteOperatorState,
    applyRemoteRunbooks,
    getCurrentProfile,
    getLockMode,
    isDenseMode,
    isFocusPanelMode,
    isProfileLocked,
    operatorState,
    refreshOperatorProfiles,
    refreshStatus,
    setActiveTabState,
    setDenseMode,
    setFocusPanelMode,
    setLockMode,
    subscribeOperatorState
} from './operator-state.js';

// Register built-in modular Operator domains and Live Board cards
import './operator-board.js';
import './operator-variables.js';
import './operator-overlays.js';
import './operator-timers.js';
import './operator-alerts.js';
import './operator-music.js';
import './operator-live-cards.js';
import './operator-displays.js';
import './operator-versus.js';
import './operator-runbooks.js';

const TOUCH_KEY = 'streampulse_op_touch_mode';
const activityLog = [];
let undoTimer = 0;

function isTouchMode() {
    try { return localStorage.getItem(TOUCH_KEY) === '1'; } catch { return false; }
}

function setTouchMode(on) {
    try { localStorage.setItem(TOUCH_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    document.documentElement.dataset.opTouch = on ? '1' : '0';
    if (on && isDenseMode()) setDenseMode(false);
}

function logActivity(label, detail = '') {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    activityLog.unshift({ time, label, detail });
    if (activityLog.length > 20) activityLog.length = 20;
    const list = $('op-activity-list');
    if (list) {
        list.innerHTML = activityLog.map(item => `<div class="op-activity-row"><span class="op-activity-time">${esc(item.time)}</span><strong>${esc(item.label)}</strong>${item.detail ? `<span>${esc(item.detail)}</span>` : ''}</div>`).join('')
            || '<div style="font-size:.78rem;color:var(--text-muted);">No live events recorded yet.</div>';
    }
}

window.opUndoToast = (message, undoFn) => {
    const el = document.getElementById('toast');
    if (!el) return toast(message, 'info');
    clearTimeout(undoTimer);
    el.className = 'show info';
    el.innerHTML = `<span>${esc(message)}</span> <button type="button" class="op-btn sm" data-op-undo-btn="1" style="margin-left:.5rem;">Undo</button>`;
    const btn = el.querySelector('[data-op-undo-btn]');
    if (btn) {
        btn.onclick = async () => {
            clearTimeout(undoTimer);
            el.className = '';
            try {
                await undoFn();
                toast('Undone', 'success');
            } catch (err) {
                toast(err.message || 'Undo failed', 'error');
            }
        };
    }
    undoTimer = setTimeout(() => { el.className = ''; }, 7000);
};

let currentMountedId = '';

function parseInitialTabFromHash() {
    const raw = (location.hash || '').replace(/^#/, '').trim();
    if (!raw) return '';
    if (raw.startsWith('display=') || /(?:^|&)display=/i.test(raw)) return 'displays';
    if (raw.startsWith('runbook=') || /(?:^|&)runbook=/i.test(raw)) return 'runbook';
    if (raw.startsWith('tab=')) {
        const first = raw.split('&')[0];
        return decodeURIComponent(first.slice(4)).toLowerCase();
    }
    const lower = raw.toLowerCase();
    if (getOperatorModule(lower)) return lower;
    if (raw.startsWith('var=') || raw.startsWith('group=') || raw.startsWith('set=') || raw.endsWith('/matrix')) {
        return 'variables';
    }
    // Plain set hash like #my_set jumps to Variables tab if active/known
    return 'variables';
}

function getDomainContainer(modId) {
    return $(`op-domain-${modId}`);
}

function makeCtx(container = null) {
    return {
        status: operatorState.status,
        profile: getCurrentProfile(),
        container,
        switchTab
    };
}

function renderTopControls() {
    const sel = $('op-global-profile');
    const lockSel = $('op-lock-mode');
    const denseBtn = $('op-dense-btn');
    const focusBtn = $('op-focus-btn');
    const lockPill = $('op-profile-lock-pill');
    const prof = getCurrentProfile();
    if (sel) {
        sel.innerHTML = (operatorState.profiles || []).map(p =>
            `<option value="${esc(p.id)}" ${p.id === prof?.id ? 'selected' : ''}>${esc(p.name)}</option>`
        ).join('');
        sel.disabled = isProfileLocked();
        sel.hidden = operatorState.dockMode && isProfileLocked();
        sel.title = isProfileLocked() ? `Locked to URL ?profile=${operatorState.lockedProfileId}` : 'Switch Operator preset';
    }
    if (lockSel) {
        const mode = getLockMode();
        lockSel.value = mode;
        lockSel.hidden = operatorState.dockMode && operatorState.urlLockPinned;
        lockSel.classList.toggle('is-layout', mode === 'layout');
        lockSel.classList.toggle('is-show', mode === 'show');
    }
    if (denseBtn) {
        const dense = isDenseMode();
        denseBtn.classList.toggle('active', dense);
        denseBtn.setAttribute('aria-pressed', String(dense));
    }
    const touchBtn = $('op-touch-btn');
    if (touchBtn) {
        const touch = isTouchMode();
        document.documentElement.dataset.opTouch = touch ? '1' : '0';
        touchBtn.classList.toggle('active', touch);
        touchBtn.setAttribute('aria-pressed', String(touch));
    }
    if (focusBtn) {
        const focus = isFocusPanelMode();
        focusBtn.innerHTML = `${OP_ICONS.focusPanel} <span class="op-hide-dock">Focus</span>`;
        focusBtn.classList.toggle('active', focus);
        focusBtn.setAttribute('aria-pressed', String(focus));
    }
    if (lockPill) {
        if (isProfileLocked() && !operatorState.dockMode) {
            lockPill.hidden = false;
            lockPill.textContent = `Pinned: ${prof?.name || operatorState.lockedProfileId}`;
            lockPill.title = 'This window uses ?profile= in the URL and ignores remote preset switches.';
        } else {
            lockPill.hidden = true;
        }
    }
}

function renderTabs() {
    const nav = $('op-domain-tabs');
    if (!nav) return [];
    const enabledMods = listEnabledModules(operatorState.status, getCurrentProfile());
    nav.innerHTML = enabledMods.map(mod => {
        const active = mod.id === operatorState.activeTab;
        return `<button type="button" class="tab-btn ${active ? 'active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" aria-label="${esc(mod.label)}" title="${esc(mod.label)}" data-domain-tab="${esc(mod.id)}">
            ${mod.iconSvg || ''}
            <span>${esc(mod.label)}</span>
        </button>`;
    }).join('');
    return enabledMods;
}

async function switchTab(nextTabId, { updateHash = true, forceRemount = false } = {}) {
    const enabledMods = listEnabledModules(operatorState.status, getCurrentProfile());
    const targetMod = enabledMods.find(m => m.id === nextTabId) || enabledMods[0];
    if (!targetMod) return;
    if (currentMountedId === targetMod.id && !forceRemount) return;

    if (currentMountedId && (currentMountedId !== targetMod.id || forceRemount)) {
        const prevMod = getOperatorModule(currentMountedId);
        const prevContainer = getDomainContainer(currentMountedId);
        try {
            prevMod?.unmount?.(makeCtx(prevContainer));
        } catch (err) {
            console.warn('[Operator] Unmount failed:', err);
        }
        if (prevContainer && currentMountedId !== targetMod.id) prevContainer.hidden = true;
    }

    setActiveTabState(targetMod.id);
    renderTabs();

    if (updateHash && targetMod.id !== 'variables') {
        const url = new URL(location.href);
        url.hash = `tab=${encodeURIComponent(targetMod.id)}`;
        history.replaceState(null, '', url);
    }

    const container = getDomainContainer(targetMod.id);
    if (container) {
        container.hidden = false;
        currentMountedId = targetMod.id;
        try {
            await targetMod.mount(container, makeCtx(container));
        } catch (err) {
            toast(err.message || `Could not load ${targetMod.label}`, 'error');
        }
    }
}

async function remountActive() {
    const mod = getOperatorModule(operatorState.activeTab);
    const enabled = listEnabledModules(operatorState.status, getCurrentProfile());
    const target = enabled.find(m => m.id === mod?.id) || enabled[0];
    if (!target) return;
    await switchTab(target.id, { updateHash: false, forceRemount: true });
}

function setLiveSocketPill(connected) {
    const pill = $('op-live-pill');
    if (!pill) return;
    pill.className = `op-pill ${connected ? 'is-ok' : ''}`;
    pill.title = connected ? 'Live WebSocket connected' : 'Reconnecting to server…';
    pill.innerHTML = `<span class="op-badge-dot ${connected ? '' : 'is-offline'}"></span> <span class="op-hide-dock">${connected ? 'Live' : 'Reconnecting'}</span>`;
}

function bindShellEvents() {
    $('op-domain-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-domain-tab]');
        if (!btn) return;
        switchTab(btn.dataset.domainTab);
    });

    $('op-global-profile')?.addEventListener('change', async e => {
        try {
            await activateProfileOnServer(e.target.value);
            renderTopControls();
            await remountActive();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    $('op-customize-tabs-btn')?.addEventListener('click', () => {
        openCustomizeTabsModal(async () => {
            renderTopControls();
            await remountActive();
        });
    });

    $('op-presets-btn')?.addEventListener('click', () => {
        openPresetsModal(async () => {
            renderTopControls();
            await remountActive();
        });
    });

    $('op-dense-btn')?.addEventListener('click', () => {
        const next = !isDenseMode();
        setDenseMode(next);
        if (next && isTouchMode()) setTouchMode(false);
        renderTopControls();
    });

    $('op-touch-btn')?.addEventListener('click', () => {
        setTouchMode(!isTouchMode());
        renderTopControls();
    });

    $('op-activity-btn')?.addEventListener('click', () => {
        const drawer = $('op-activity-drawer');
        const btn = $('op-activity-btn');
        if (!drawer) return;
        drawer.hidden = !drawer.hidden;
        btn?.classList.toggle('active', !drawer.hidden);
        if (!drawer.hidden) logActivity('Opened Activity Log');
    });

    $('op-activity-clear')?.addEventListener('click', () => {
        activityLog.length = 0;
        const list = $('op-activity-list');
        if (list) list.innerHTML = '<div style="font-size:.78rem;color:var(--text-muted);">Log cleared.</div>';
    });

    $('op-focus-btn')?.addEventListener('click', async () => {
        const next = setFocusPanelMode(!isFocusPanelMode());
        renderTopControls();
        await remountActive();
        toast(next ? 'Focused view: 1 panel open at a time' : 'All panels expandable', 'info');
    });

    $('op-lock-mode')?.addEventListener('change', async e => {
        const mode = setLockMode(e.target.value);
        renderTopControls();
        await remountActive();
        toast(
            mode === 'layout' ? 'Layout locked (cards fixed in place)'
                : mode === 'show' ? 'Show Mode enabled (inputs read-only, playback active)'
                    : 'Unlocked',
            'info'
        );
    });

    // Global modal close on backdrop or Escape
    const modal = $('op-modal');
    modal?.addEventListener('click', e => {
        if (e.target === modal || e.target.closest('[data-modal-close]')) {
            modal.hidden = true;
        }
    });
    window.addEventListener('keydown', async e => {
        if (e.key === 'Escape' && modal && !modal.hidden) {
            modal.hidden = true;
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey || isProfileLocked()) return;
        if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        if (/^[1-9]$/.test(e.key)) {
            const idx = Number(e.key) - 1;
            const target = (operatorState.profiles || [])[idx];
            if (target && target.id !== getCurrentProfile()?.id) {
                e.preventDefault();
                try {
                    await activateProfileOnServer(target.id);
                    renderTopControls();
                    await remountActive();
                    toast(`Switched board: ${target.name}`, 'info');
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    });

    window.addEventListener('hashchange', () => {
        const hashTab = parseInitialTabFromHash();
        if (hashTab && hashTab !== operatorState.activeTab) {
            switchTab(hashTab, { updateHash: false });
        } else if (hashTab === 'displays' || hashTab === 'runbook') {
            remountActive();
        }
    });

    subscribeOperatorState((_, reason) => {
        if (reason === 'profiles' || reason === 'active-profile' || reason === 'remote-profiles' || reason === 'remote-active-profile') {
            renderTopControls();
        }
    });
}

async function init() {
    const customizeBtn = $('op-customize-tabs-btn');
    if (customizeBtn) customizeBtn.innerHTML = `${OP_ICONS.sliders} Tabs`;

    bindShellEvents();
    await Promise.all([refreshStatus(), refreshOperatorProfiles()]);
    renderTopControls();

    const hashTab = parseInitialTabFromHash();
    const initialTab = hashTab || operatorState.activeTab || 'board';
    await switchTab(initialTab, { updateHash: !hashTab });

    connectLiveSocket({
        path: '/',
        onOpen: () => setLiveSocketPill(true),
        onClose: () => setLiveSocketPill(false),
        onMessage: async msg => {
            if (!msg?.type) return;
            if (msg.type === 'config-updated' || msg.type === 'status') {
                await refreshStatus();
                const mod = getOperatorModule(currentMountedId);
                const enabled = listEnabledModules(operatorState.status, getCurrentProfile());
                if (!enabled.some(m => m.id === currentMountedId)) {
                    await switchTab(enabled[0]?.id || 'board');
                } else {
                    renderTabs();
                    mod?.onStatus?.(operatorState.status, makeCtx(getDomainContainer(currentMountedId)));
                }
                return;
            }
            if (msg.type === 'operator-active-profile') {
                if (applyRemoteActiveProfile(msg.data)) {
                    toast(`Preset switched to ${msg.data?.profile?.name || msg.data?.activeProfileId}`, 'info');
                    await remountActive();
                }
                return;
            }
            if (msg.type === 'operator-runbooks-update') {
                if (applyRemoteRunbooks(msg.data)) {
                    const activeMod = getOperatorModule(currentMountedId);
                    activeMod?.onSocket?.(msg.type, msg.data, makeCtx(getDomainContainer(currentMountedId)));
                }
                return;
            }
            if (msg.type === 'operator-update') {
                if (applyRemoteOperatorState(msg.data) && ['board', 'overlays', 'displays', 'runbook'].includes(currentMountedId)) {
                    await remountActive();
                }
                return;
            }
            if (['variables-update', 'variable-displays-update', 'matchup-update', 'tournament-update', 'poll-update', 'trivia-update', 'alerts-update'].includes(msg.type) || String(msg.type).startsWith('trivia:')) {
                logActivity(String(msg.type).replace(/-update$/, '').replace(/[:_-]/g, ' '), 'Live state updated');
            }
            const activeMod = getOperatorModule(currentMountedId);
            activeMod?.onSocket?.(msg.type, msg.data, makeCtx(getDomainContainer(currentMountedId)));
        }
    });
}

init().catch(err => {
    toast(err.message || 'Operator Mode failed to initialize', 'error');
});
