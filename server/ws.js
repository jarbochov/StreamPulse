const WebSocket = require('ws');

const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const MAX_SLIDESHOW_KEYS = 256;

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
    getPollTournament = () => null,
    getMatchup = () => null,
    listOverlayVisibility = () => [],
    log = console.log
} = {}) {
    let overlayWss = null;
    const overlayClients = new Set();
    const slideshowStates = new Map();
    const slideshowOwners = new Map();
    let heartbeatTimer = null;

    function removeClient(ws) {
        for (const key of ws.slideshowKeys || []) {
            if (slideshowOwners.get(key) === ws) {
                slideshowStates.delete(key);
                slideshowOwners.delete(key);
            }
        }
        ws.slideshowKeys?.clear();
        if (!overlayClients.delete(ws)) return;
        if (!overlayClients.size) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        log(`[WS] Live client disconnected (${overlayClients.size} connections)`);
    }

    function disconnect(ws) {
        removeClient(ws);
        try { ws.terminate(); } catch {}
    }

    function canSend(ws) {
        if (ws.readyState !== WebSocket.OPEN) return false;
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
            disconnect(ws);
            return false;
        }
        return true;
    }

    function send(ws, type, data) {
        // Let the finite bootstrap finish even when its first snapshot exceeds the live queue budget.
        if (ws.readyState !== WebSocket.OPEN) return;
        try { ws.send(JSON.stringify({ type, data })); } catch { disconnect(ws); }
    }

    function setupConnection(ws) {
        overlayClients.add(ws);
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('error', () => disconnect(ws));
        ws.on('close', () => removeClient(ws));
        if (!heartbeatTimer) {
            heartbeatTimer = setInterval(() => {
                for (const client of overlayClients) {
                    if (!client.isAlive || !canSend(client)) {
                        disconnect(client);
                        continue;
                    }
                    client.isAlive = false;
                    try { client.ping(); } catch { disconnect(client); }
                }
            }, 30000);
            heartbeatTimer.unref?.();
        }
        log(`[WS] Live client connected (${overlayClients.size} connections)`);

        try {
            // Send current data snapshot immediately
            send(ws, 'snapshot', getChatData());

            // Send current music state if music is enabled
            const musicConfig = getMusicConfig();
            const musicState = getMusicState();
            if (musicConfig?.enabled && musicState?.state !== 'stopped') {
                send(ws, 'music', musicState);
            }

            send(ws, 'viewer-update', getViewerSummary());
            send(ws, 'goals-update', buildGoalsSnapshot());
            send(ws, 'timers-snapshot', buildTimersSnapshot());
            const curPoll = getLatestPoll();
            if (curPoll) send(ws, 'poll-update', curPoll);
            const curTournament = getTournament();
            if (curTournament) send(ws, 'tournament-update', curTournament);
            const curPollTournament = getPollTournament();
            if (curPollTournament) send(ws, 'poll-tournament-update', curPollTournament);
            const curMatchup = getMatchup();
            if (curMatchup) send(ws, 'matchup-update', curMatchup);

            // Send current overlay visibility state
            for (const entry of (listOverlayVisibility() || []).filter(o => !o.visible)) {
                send(ws, 'overlay-visibility', { key: entry.key, visible: false });
            }
        } catch { /* ignore initial send failures */ }

        // Overlay pages report slideshow state so controllers can show play/pause and position
        ws.on('message', (raw) => {
            if (!overlayClients.has(ws)) return;
            try {
                const msg = JSON.parse(raw);
                if (msg.type === 'overlay-source' && typeof msg.key === 'string' && msg.key.length > 0 && msg.key.length <= 100) {
                    ws.overlaySource = msg.key;
                    return;
                }
                if (msg.type !== 'slideshow-state' || !msg.id || !msg.element) return;
                const key = `${String(msg.id).slice(0, 80)}::${String(msg.element).slice(0, 80)}`;
                ws.slideshowKeys = ws.slideshowKeys || new Set();
                if (!ws.slideshowKeys.has(key) && ws.slideshowKeys.size >= MAX_SLIDESHOW_KEYS) return;
                ws.slideshowKeys.add(key);
                slideshowOwners.set(key, ws);
                slideshowStates.set(key, { paused: !!msg.paused, position: Number(msg.position) || 0, count: Number(msg.count) || 0, at: Date.now() });
            } catch { /* ignore malformed overlay messages */ }
        });
    }

    function attachServer(httpServer) {
        if (overlayWss) {
            closeAllConnections();
        }
        overlayWss = new WebSocket.Server({ server: httpServer, maxPayload: 64 * 1024 });
        overlayWss.on('connection', setupConnection);
        return overlayWss;
    }

    if (server) attachServer(server);

    function broadcastToOverlays(type, payload) {
        let msg;
        for (const client of overlayClients) {
            if (canSend(client)) {
                try {
                    msg ??= JSON.stringify({ type, data: payload });
                    client.send(msg);
                } catch { disconnect(client); }
            }
        }
    }

    function closeAllConnections() {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        for (const client of overlayClients) {
            disconnect(client);
        }
        overlayClients.clear();
        slideshowStates.clear();
        slideshowOwners.clear();
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
