/**
 * StreamPulse Shared Client Core — Lightweight DOM, API, Toast & Live WebSocket Primitives
 */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const $ = id => document.getElementById(id);

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ESC_MAP[ch]);
}

let toastTimer = null;
export function toast(message, kind = 'info', ms) {
    const el = $('toast');
    if (el) {
        el.textContent = message;
        el.style.display = '';
        el.className = `show${kind === 'error' ? ' error' : ''}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.className = '';
        }, ms ?? (kind === 'error' ? 4500 : 2400));
        return;
    }
    if (window.StreamPulse?.toast) {
        window.StreamPulse.toast(message, kind);
    }
}

export async function api(url, methodOrOptions = 'GET', body = null) {
    const opts = typeof methodOrOptions === 'string'
        ? { method: methodOrOptions, headers: {} }
        : { headers: {}, ...methodOrOptions };
    if (body !== null && opts.body === undefined) {
        opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
        opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

export function connectLiveSocket({
    path = '/ws',
    onMessage,
    onOpen,
    onClose,
    reconnectMs = 3000
} = {}) {
    let ws = null;
    let timer = null;
    let closed = false;

    function open() {
        if (closed) return;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const suffix = path.startsWith('/') ? path : `/${path}`;
        ws = new WebSocket(`${proto}//${location.host}${suffix}`);
        if (onOpen) ws.onopen = onOpen;
        ws.onmessage = event => {
            if (!onMessage) return;
            try {
                onMessage(JSON.parse(event.data), event);
            } catch {
                // Ignore non-JSON frames
            }
        };
        ws.onclose = event => {
            if (onClose) onClose(event);
            if (!closed && reconnectMs > 0) {
                clearTimeout(timer);
                timer = setTimeout(open, reconnectMs);
            }
        };
    }

    open();
    return {
        close() {
            closed = true;
            clearTimeout(timer);
            try { ws?.close(); } catch {}
            ws = null;
        },
        get socket() {
            return ws;
        }
    };
}
