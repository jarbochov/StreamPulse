/**
 * StreamPulse — Alerts Studio Main Controller & Orchestrator
 */

import {
    $, TRIGGERS, cfg, setCfg, sel, setSel, dirty, setDirty,
    setQueue, setTimers, setGoals, hostSources, lookByRule,
    setSfxGroups, showThumbs, rule, api, guard, toast,
    loadAssets, loadChannelEmotes, pollStatus
} from './alerts-state.js';
import { renderSettings, renderRules, syncFilterUi, save, setupRulesEvents } from './alerts-rules.js';
import { renderEditor, setupEditorEvents } from './alerts-editor.js';
import { renderQueue, renderAnnouncements, updateSimVisibility, refreshQueue, setupPanelsEvents } from './alerts-panels.js';

export function renderAll() {
    const simType = $('sim-type')?.value;
    const simTypeEl = $('sim-type');
    if (simTypeEl) {
        simTypeEl.innerHTML = Object.entries(TRIGGERS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
        if (simType) simTypeEl.value = simType;
    }
    updateSimVisibility();
    renderSettings();
    renderRules();
    renderEditor();
    renderQueue();
    renderAnnouncements();
}

export function setTab(name, focus) {
    if (!['rules', 'announce', 'queue', 'sim'].includes(name)) name = 'rules';
    const tabBtns = [...document.querySelectorAll('[role="tab"][data-tab]')];
    tabBtns.forEach(x => {
        const on = x.dataset.tab === name;
        x.classList.toggle('active', on);
        x.setAttribute('aria-selected', on);
        x.tabIndex = on ? 0 : -1;
        if (on && focus) x.focus();
    });
    ['rules', 'announce', 'queue', 'sim'].forEach(n => {
        const pane = $('pane-' + n);
        if (pane) pane.classList.toggle('active', n === name);
    });
    const toolbar = document.querySelector('.alerts-toolbar');
    if (toolbar) toolbar.dataset.tab = name;
    localStorage.setItem('alerts.tab', name);
    history.replaceState(null, '', '#' + name);
    if (name === 'queue') refreshQueue();
    if (name === 'announce') renderAnnouncements();
}

export async function loadAll() {
    const data = await api('/api/alerts', { cache: 'no-store' });
    setCfg({ settings: data.settings, rules: data.rules });
    setQueue(data.queue || {});
    if (!sel) setSel(localStorage.getItem('alerts.selected'));
    if (!sel || !rule()) setSel(cfg.rules[0]?.id || null);
    try { setTimers(Object.values((await api('/api/timers')).timers || {})); } catch { setTimers([]); }
    try { setGoals((await api('/api/goals')).items || []); } catch { setGoals([]); }
    try {
        const statusData = await api('/api/status');
        hostSources.splice(0, hostSources.length, ...(statusData.hostSources || []));
    } catch {}
    await Promise.all([loadAssets(), loadChannelEmotes()]);
    renderAll();
}

export function init() {
    // Top Tabs Navigation
    const tabBtns = [...document.querySelectorAll('[role="tab"][data-tab]')];
    tabBtns.forEach((t, i) => {
        t.addEventListener('click', () => setTab(t.dataset.tab));
        t.addEventListener('keydown', e => {
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (d) { e.preventDefault(); setTab(tabBtns[(i + d + tabBtns.length) % tabBtns.length].dataset.tab, true); }
            else if (e.key === 'Home') { e.preventDefault(); setTab(tabBtns[0].dataset.tab, true); }
            else if (e.key === 'End') { e.preventDefault(); setTab(tabBtns[tabBtns.length - 1].dataset.tab, true); }
        });
    });

    // Master Save button
    $('save')?.addEventListener('click', guard(async () => {
        await save(renderAll);
        toast('Saved successfully');
    }));

    // Revert button
    $('revert')?.addEventListener('click', guard(async () => {
        if (dirty && window.StreamPulse && !await window.StreamPulse.confirm('Revert changes', 'Discard all unsaved changes and reload from the server?', { danger: true, confirmText: 'Revert' })) return;
        await loadAll();
        setDirty(false);
        toast('Reverted to saved alerts');
    }));

    // Thumbs toggle
    const thumbsToggle = $('thumbs-toggle');
    if (thumbsToggle) {
        thumbsToggle.checked = showThumbs();
        thumbsToggle.addEventListener('change', e => {
            localStorage.setItem('alerts.thumbs', e.target.checked ? '1' : '0');
            renderRules();
            renderEditor();
        });
    }

    // Details persistence
    document.addEventListener('toggle', e => {
        const d = e.target;
        if (d.dataset && d.dataset.persist) localStorage.setItem(d.dataset.persist, d.open ? '1' : '0');
    }, true);

    // Global keyboard shortcuts
    document.addEventListener('keydown', e => {
        const mod = e.metaKey || e.ctrlKey, t = e.target;
        const typing = t.matches?.('input, textarea, select, [contenteditable]') && !(t.type === 'checkbox' || t.type === 'radio' || t.type === 'range');
        if (e.key === 'Escape') {
            document.querySelectorAll('details.more-menu[open]').forEach(d => { d.open = false; });
            return;
        }
        if (mod && e.key.toLowerCase() === 's') {
            e.preventDefault();
            $('save')?.click();
        } else if (mod && e.key === 'Enter') {
            const b = document.querySelector('[data-test-rule]');
            if (b) { e.preventDefault(); b.click(); }
        } else if (mod && e.key.toLowerCase() === 'd' && !typing) {
            const b = $('dup-rule');
            if (b) { e.preventDefault(); b.click(); }
        } else if (e.key === '/' && !typing && !mod && !e.altKey) {
            e.preventDefault();
            $('rule-search')?.focus();
        }
    });

    window.addEventListener('beforeunload', event => {
        if (dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // Setup domain sub-modules
    setupRulesEvents(renderAll);
    setupEditorEvents(renderAll);
    setupPanelsEvents(renderAll, setTab);

    // Initial Filter UI state
    syncFilterUi();

    // Active tab
    setTab(location.hash.slice(1) || localStorage.getItem('alerts.tab') || 'rules');

    // SFX Manifest & Overlay Looks
    fetch('/sounds/manifest.json')
        .then(r => r.json())
        .then(m => {
            setSfxGroups(m.groups || []);
            renderEditor();
        })
        .catch(() => {});

    fetch('/api/custom-overlays')
        .then(x => x.json())
        .then(l => {
            (l || []).forEach(o => (o.alertLooks || []).forEach(k => (k.ruleIds || []).forEach(id => {
                lookByRule[id] = k.name;
            })));
            if (rule()) renderEditor();
        })
        .catch(() => {});

    // Polling
    pollStatus();
    setInterval(pollStatus, 15000);

    if (window.pollVisible) {
        window.pollVisible(refreshQueue, 3000);
    } else {
        setInterval(refreshQueue, 3000);
    }

    loadAll().catch(err => toast(err.message, true));
}

// Auto-run if running in browser
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
