// Fades a whole overlay page out or in when StreamPulse sends an overlay-visibility message (POST /api/overlay-visibility/:key).
(function() {
    const script = document.currentScript;
    const fromId = script?.dataset.keyFromId !== undefined;
    const key = fromId ? `custom:${new URLSearchParams(location.search).get('id') || ''}` : (script?.dataset.key || '');
    if (!key) return;
    const FADE_MS = 500;
    const root = document.documentElement;
    let hideTimer = null;
    const apply = visible => {
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
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
        ws.onmessage = event => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'overlay-visibility' && msg.data?.key === key) apply(!!msg.data.visible);
            } catch {}
        };
        ws.onclose = () => setTimeout(connect, 3000);
        ws.onerror = () => ws.close();
    }
    connect();
})();
