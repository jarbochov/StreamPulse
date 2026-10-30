// Fades a whole overlay page out or in when StreamPulse sends an overlay-visibility message (POST /api/overlay-visibility/:key).
(function() {
    const script = document.currentScript;
    const fromId = script?.dataset.keyFromId !== undefined;
    const key = fromId ? `custom:${new URLSearchParams(location.search).get('id') || ''}` : (script?.dataset.key || '');
    if (!key) return;
    const FADE_MS = 500;
    const root = document.documentElement;
    let hideTimer = null;
    let lastVisible = null;
    let socket = null;
    let reconnectTimer = null;
    let suspended = false;
    const apply = visible => {
        if (visible === lastVisible) return;
        lastVisible = visible;
        clearTimeout(hideTimer);
        // A hidden state delivered right after page load applies instantly so the overlay doesn't flash in
        const instant = performance.now() < 2500;
        root.style.transition = instant ? 'none' : `opacity ${FADE_MS}ms ease`;
        if (visible) {
            root.style.visibility = '';
            void root.offsetWidth;
            root.style.opacity = '';
        } else {
            root.style.opacity = '0';
            if (instant) root.style.visibility = 'hidden';
            else hideTimer = setTimeout(() => { root.style.visibility = 'hidden'; }, FADE_MS);
        }
    };
    function connect() {
        if (suspended || socket) return;
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
        socket = ws;
        ws.onopen = () => {
            if (suspended || socket !== ws) return;
            if (window.self === window.top && new URLSearchParams(location.search).get('preview') !== 'true') {
                ws.send(JSON.stringify({ type: 'overlay-source', key }));
            }
        };
        ws.onmessage = event => {
            if (suspended || socket !== ws) return;
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'overlay-visibility' && msg.data?.key === key) apply(!!msg.data.visible);
            } catch {}
        };
        ws.onclose = () => {
            if (socket !== ws) return;
            socket = null;
            if (suspended || reconnectTimer !== null) return;
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, 3000);
        };
        ws.onerror = () => ws.close();
    }
    window.addEventListener('pagehide', () => {
        suspended = true;
        clearTimeout(hideTimer);
        if (lastVisible === false) root.style.visibility = 'hidden';
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        const ws = socket;
        socket = null;
        ws?.close();
    });
    window.addEventListener('pageshow', () => {
        if (!suspended) return;
        suspended = false;
        connect();
    });
    connect();
})();
