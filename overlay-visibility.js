// Hides or shows a whole overlay page when StreamPulse sends an overlay-visibility message (POST /api/overlay-visibility/:key).
(function() {
    const script = document.currentScript;
    const fromId = script?.dataset.keyFromId !== undefined;
    const key = fromId ? `custom:${new URLSearchParams(location.search).get('id') || ''}` : (script?.dataset.key || '');
    if (!key) return;
    const apply = visible => { document.documentElement.style.visibility = visible ? '' : 'hidden'; };
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
