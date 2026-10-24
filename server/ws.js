const WebSocket = require('ws');

function createOverlayWsServer({
    server = null,
    getChatData = () => ({}),
    getMusicConfig = () => ({ enabled: false }),
    getMusicState = () => ({ state: 'stopped' }),
    getViewerSummary = () => ({}),
    buildGoalsSnapshot = () => ({}),
    buildTimersSnapshot = () => ({}),
    getLatestPoll = () => null,
    getTournament = () => null,
    getMatchup = () => null,
    listOverlayVisibility = () => [],
    log = console.log
} = {}) {
    let overlayWss = server ? new WebSocket.Server({ server }) : null;
    const overlayClients = new Set();
    const slideshowStates = new Map();

    function setupConnection(ws) {
        overlayClients.add(ws);
        log(`[WS] Live client connected (${overlayClients.size} connections)`);

        try {
            // Send current data snapshot immediately
            ws.send(JSON.stringify({ type: 'snapshot', data: getChatData() }));

            // Send current music state if music is enabled
            const musicConfig = getMusicConfig();
            const musicState = getMusicState();
            if (musicConfig?.enabled && musicState?.state !== 'stopped') {
                ws.send(JSON.stringify({ type: 'music', data: musicState }));
            }

            ws.send(JSON.stringify({ type: 'viewer-update', data: getViewerSummary() }));
            ws.send(JSON.stringify({ type: 'goals-update', data: buildGoalsSnapshot() }));
            ws.send(JSON.stringify({ type: 'timers-snapshot', data: buildTimersSnapshot() }));
            const curPoll = getLatestPoll();
            if (curPoll) ws.send(JSON.stringify({ type: 'poll-update', data: curPoll }));
            const curTournament = getTournament();
            if (curTournament) ws.send(JSON.stringify({ type: 'tournament-update', data: curTournament }));
            const curMatchup = getMatchup();
            if (curMatchup) ws.send(JSON.stringify({ type: 'matchup-update', data: curMatchup }));

            // Send current overlay visibility state
            for (const entry of (listOverlayVisibility() || []).filter(o => !o.visible)) {
                ws.send(JSON.stringify({ type: 'overlay-visibility', data: { key: entry.key, visible: false } }));
            }
        } catch { /* ignore initial send failures */ }

        // Overlay pages report slideshow state so controllers can show play/pause and position
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                if (msg.type === 'overlay-source' && typeof msg.key === 'string' && msg.key.length > 0 && msg.key.length <= 100) {
                    ws.overlaySource = msg.key;
                    return;
                }
                if (msg.type !== 'slideshow-state' || !msg.id || !msg.element) return;
                const key = `${String(msg.id).slice(0, 80)}::${String(msg.element).slice(0, 80)}`;
                slideshowStates.set(key, { paused: !!msg.paused, position: Number(msg.position) || 0, count: Number(msg.count) || 0, at: Date.now() });
                ws.slideshowKeys = ws.slideshowKeys || new Set();
                ws.slideshowKeys.add(key);
            } catch { /* ignore malformed overlay messages */ }
        });

        ws.on('close', () => {
            for (const key of ws.slideshowKeys || []) slideshowStates.delete(key);
            overlayClients.delete(ws);
            log(`[WS] Live client disconnected (${overlayClients.size} connections)`);
        });
    }

    if (overlayWss) {
        overlayWss.on('connection', setupConnection);
    }

    function attachServer(httpServer) {
        if (overlayWss) {
            try { overlayWss.close(); } catch {}
        }
        overlayWss = new WebSocket.Server({ server: httpServer });
        overlayWss.on('connection', setupConnection);
        return overlayWss;
    }

    function broadcastToOverlays(type, payload) {
        const msg = JSON.stringify({ type, data: payload });
        for (const client of overlayClients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(msg);
                } catch { /* socket error */ }
            }
        }
    }

    function closeAllConnections() {
        for (const client of overlayClients) {
            try { client.terminate(); } catch {}
        }
        overlayClients.clear();
        slideshowStates.clear();
        if (overlayWss) {
            try { overlayWss.close(); } catch {}
        }
    }

    return {
        get overlayWss() { return overlayWss; },
        overlayClients,
        slideshowStates,
        attachServer,
        setupConnection,
        broadcastToOverlays,
        closeAllConnections,
        getWss: () => overlayWss,
        getSlideshowStates: () => slideshowStates,
        getClientCount: () => overlayClients.size,
        getSourceCount: () => [...overlayClients].filter(ws => ws.readyState === WebSocket.OPEN && ws.overlaySource).length
    };
}

module.exports = {
    createOverlayWsServer
};
