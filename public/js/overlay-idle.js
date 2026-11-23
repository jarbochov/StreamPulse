// Unified tab + OBS Browser Source + API visibility guard so inactive overlays pause animations and polling.
(function (root) {
    'use strict';
    if (root.StreamPulseIdle) return;

    let tabHidden = typeof document !== 'undefined' ? Boolean(document.hidden) : false;
    let obsHidden = false;
    let apiHidden = false;
    let lastHidden = tabHidden || obsHidden || apiHidden;
    const listeners = new Set();

    function computeHidden() {
        return Boolean(tabHidden || obsHidden || apiHidden);
    }

    function notify() {
        const hidden = computeHidden();
        if (hidden === lastHidden) return;
        lastHidden = hidden;
        const detail = { hidden, tabHidden, obsHidden, apiHidden };
        for (const fn of listeners) {
            try { fn(hidden, detail); } catch {}
        }
        if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
            document.dispatchEvent(new CustomEvent('sp:visibilitychange', { detail }));
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            tabHidden = Boolean(document.hidden);
            notify();
        });
    }

    if (typeof root.addEventListener === 'function') {
        root.addEventListener('obsSourceVisibleChanged', event => {
            if (event?.detail && typeof event.detail.visible === 'boolean') {
                obsHidden = !event.detail.visible;
                notify();
            }
        });
    }

    root.StreamPulseIdle = {
        isHidden: computeHidden,
        getState: () => ({ hidden: computeHidden(), tabHidden, obsHidden, apiHidden }),
        setApiHidden(hidden) {
            const next = Boolean(hidden);
            if (next === apiHidden) return;
            apiHidden = next;
            notify();
        },
        onChange(fn) {
            if (typeof fn !== 'function') return () => {};
            listeners.add(fn);
            return () => listeners.delete(fn);
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
