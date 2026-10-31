'use strict';

const crypto = require('crypto');
const WebSocket = require('ws');

const DEFAULT_OBS_CONFIG = {
    enabled: false,
    host: '127.0.0.1',
    port: 4455,
    password: '',
    syncOnSave: true,
    motionEngine: 'auto' // 'auto' (Move plugin if available, else 60fps WS) | 'websocket' | 'move-plugin' | 'cut'
};

function normalizeObsConfig(input = {}) {
    const raw = input && typeof input === 'object' ? input : {};
    const port = Math.max(1, Math.min(65535, Math.round(Number(raw.port) || DEFAULT_OBS_CONFIG.port)));
    const engineRaw = raw.motionEngine === 'stream' ? 'websocket' : raw.motionEngine;
    const motionEngine = ['auto', 'websocket', 'move-plugin', 'cut'].includes(engineRaw)
        ? engineRaw
        : DEFAULT_OBS_CONFIG.motionEngine;
    return {
        enabled: Boolean(raw.enabled),
        host: String(raw.host || DEFAULT_OBS_CONFIG.host).trim() || DEFAULT_OBS_CONFIG.host,
        port,
        password: String(raw.password ?? ''),
        syncOnSave: raw.syncOnSave !== false,
        motionEngine
    };
}

function buildObsTransform(target = {}, fit = 'cover') {
    const resolvedFit = target.fit || fit || 'cover';
    const x = Number.isFinite(Number(target.x)) ? Number(target.x) : 0;
    const y = Number.isFinite(Number(target.y)) ? Number(target.y) : 0;
    const w = Math.max(1, Number.isFinite(Number(target.width)) ? Number(target.width) : 100);
    const h = Math.max(1, Number.isFinite(Number(target.height)) ? Number(target.height) : 100);
    const rot = Number.isFinite(Number(target.rotate)) ? Number(target.rotate) : 0;

    if (resolvedFit === 'none') {
        return {
            positionX: x,
            positionY: y,
            alignment: 5, // OBS_ALIGN_TOP | OBS_ALIGN_LEFT
            rotation: ((rot % 360) + 360) % 360,
            boundsType: 'OBS_BOUNDS_NONE'
        };
    }

    const boundsType = resolvedFit === 'contain'
        ? 'OBS_BOUNDS_SCALE_INNER'
        : (resolvedFit === 'stretch' ? 'OBS_BOUNDS_STRETCH' : 'OBS_BOUNDS_SCALE_OUTER');

    return {
        positionX: x,
        positionY: y,
        alignment: 5, // Top-Left positional anchor so (x, y) matches StreamPulse canvas coordinates
        rotation: ((rot % 360) + 360) % 360,
        boundsType,
        boundsAlignment: 0, // Center inside bounds
        boundsWidth: w,
        boundsHeight: h
    };
}

function evalMorphEase(name, t) {
    const x = Math.max(0, Math.min(1, t));
    if (name === 'linear') return x;
    if (name === 'ease-in-out') return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    if (name === 'snappy') return 1 - Math.pow(1 - x, 4);
    if (name === 'spring') {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    return 1 - Math.pow(1 - x, 3);
}

function computeObsAuthResponse(password, salt, challenge) {
    const secret = crypto.createHash('sha256').update(String(password || '') + String(salt || '')).digest('base64');
    return crypto.createHash('sha256').update(secret + String(challenge || '')).digest('base64');
}

function createObsService({
    getConfig,
    config = {},
    WebSocketImpl,
    onStatusChange = () => {},
    log = console.log,
    warn = console.warn
} = {}) {
    const WS = WebSocketImpl || WebSocket;
    const configGetter = typeof getConfig === 'function' ? getConfig : () => config;
    let ws = null;
    let reconnectTimer = null;
    let reqSeq = 0;
    const pendingRequests = new Map();
    const activeInterpolations = new Map();
    const sceneItemIdCache = new Map();
    const lastKnownTransforms = new Map();

    let state = {
        connected: false,
        connecting: false,
        identified: false,
        obsVersion: '',
        websocketVersion: '',
        currentProgramScene: '',
        hasMovePlugin: false,
        lastError: ''
    };

    function currentConfig() {
        return normalizeObsConfig(configGetter());
    }

    function getStatus() {
        const cfg = currentConfig();
        return {
            enabled: cfg.enabled,
            host: cfg.host,
            port: cfg.port,
            hasPassword: Boolean(cfg.password),
            syncOnSave: cfg.syncOnSave,
            motionEngine: cfg.motionEngine,
            activeEngine: state.identified
                ? (cfg.motionEngine === 'cut'
                    ? 'cut'
                    : (cfg.motionEngine === 'websocket' || !state.hasMovePlugin ? 'websocket-60fps' : 'move-plugin'))
                : 'disconnected',
            connected: state.connected && state.identified,
            connecting: state.connecting,
            obsVersion: state.obsVersion,
            websocketVersion: state.websocketVersion,
            currentProgramScene: state.currentProgramScene,
            hasMovePlugin: state.hasMovePlugin,
            movePluginAvailable: state.hasMovePlugin,
            lastError: state.lastError
        };
    }

    function clearPendingRequests(reason = 'OBS connection closed') {
        for (const [, entry] of pendingRequests) {
            clearTimeout(entry.timer);
            entry.reject(new Error(reason));
        }
        pendingRequests.clear();
    }

    function cancelAllInterpolations() {
        for (const [, timer] of activeInterpolations) {
            clearInterval(timer);
        }
        activeInterpolations.clear();
    }

    function request(requestType, requestData = {}, timeoutMs = 4000) {
        const openState = WS.OPEN ?? 1;
        if (!ws || ws.readyState !== openState || !state.identified) {
            return Promise.reject(new Error('OBS WebSocket is not connected'));
        }
        const requestId = `sp-${++reqSeq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pendingRequests.delete(requestId);
                reject(new Error(`OBS request timed out: ${requestType}`));
            }, timeoutMs);
            timer.unref?.();
            pendingRequests.set(requestId, { resolve, reject, timer });
            try {
                ws.send(JSON.stringify({
                    op: 6,
                    d: {
                        requestType,
                        requestId,
                        requestData
                    }
                }));
            } catch (err) {
                clearTimeout(timer);
                pendingRequests.delete(requestId);
                reject(err);
            }
        });
    }

    async function probeCapabilities() {
        try {
            const ver = await request('GetVersion').catch(() => null);
            if (ver) {
                state.obsVersion = ver.obsVersion || '';
                state.websocketVersion = ver.obsWebSocketVersion || '';
            }
            const sceneRes = await request('GetCurrentProgramScene').catch(() => null);
            if (sceneRes?.currentProgramSceneName) {
                state.currentProgramScene = sceneRes.currentProgramSceneName;
            }
            // Check if Exeldro's Move Transition plugin (move_source_filter) is available
            const filterKinds = await request('GetSourceFilterKindList').catch(() => null);
            const kinds = Array.isArray(filterKinds?.sourceFilterKinds) ? filterKinds.sourceFilterKinds : [];
            state.hasMovePlugin = kinds.includes('move_source_filter');
            onStatusChange(getStatus());
        } catch (err) {
            warn('[OBS] Capability probe error:', err.message);
        }
    }

    function scheduleReconnect(delayMs = 4000) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        const cfg = currentConfig();
        if (!cfg.enabled) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delayMs);
        reconnectTimer.unref?.();
    }

    function disconnect() {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        cancelAllInterpolations();
        clearPendingRequests('OBS disconnected');
        sceneItemIdCache.clear();
        if (ws) {
            try {
                ws.removeAllListeners();
                ws.close();
            } catch {}
            ws = null;
        }
        state.connected = false;
        state.connecting = false;
        state.identified = false;
        onStatusChange(getStatus());
    }

    function connect() {
        const cfg = currentConfig();
        if (!cfg.enabled) {
            disconnect();
            return;
        }
        const openState = WS.OPEN ?? 1;
        const connectingState = WS.CONNECTING ?? 0;
        if (ws && (ws.readyState === openState || ws.readyState === connectingState)) {
            return;
        }
        disconnect();
        state.connecting = true;
        state.lastError = '';
        onStatusChange(getStatus());

        const url = `ws://${cfg.host}:${cfg.port}`;
        let socket;
        try {
            socket = new WS(url);
        } catch (err) {
            state.connecting = false;
            state.lastError = err.message;
            onStatusChange(getStatus());
            scheduleReconnect(5000);
            return;
        }
        ws = socket;

        const addListener = (event, handler) => {
            if (typeof socket.on === 'function') socket.on(event, handler);
            else if (typeof socket.addEventListener === 'function') socket.addEventListener(event, handler);
        };

        addListener('open', () => {
            state.connected = true;
            state.connecting = false;
            onStatusChange(getStatus());
        });

        addListener('message', eventOrRaw => {
            const raw = eventOrRaw && typeof eventOrRaw === 'object' && 'data' in eventOrRaw ? eventOrRaw.data : eventOrRaw;
            let msg;
            try {
                msg = JSON.parse(String(raw));
            } catch {
                return;
            }
            const { op, d } = msg;
            if (op === 0 && d) {
                // Hello from OBS WebSocket v5
                const identifyPayload = { rpcVersion: 1, eventSubscriptions: (1 << 2) | (1 << 7) }; // Scenes | SceneItems
                if (d.authentication?.challenge && d.authentication?.salt) {
                    identifyPayload.authentication = computeObsAuthResponse(
                        cfg.password,
                        d.authentication.salt,
                        d.authentication.challenge
                    );
                }
                try {
                    socket.send(JSON.stringify({ op: 1, d: identifyPayload }));
                } catch {}
            } else if (op === 2) {
                // Identified
                state.identified = true;
                state.lastError = '';
                sceneItemIdCache.clear();
                log(`[OBS] Connected to OBS WebSocket at ${cfg.host}:${cfg.port}`);
                onStatusChange(getStatus());
                probeCapabilities();
            } else if (op === 5 && d) {
                // Event
                if (d.eventType === 'CurrentProgramSceneChanged' && d.eventData?.sceneName) {
                    state.currentProgramScene = d.eventData.sceneName;
                    onStatusChange(getStatus());
                } else if (d.eventType === 'SceneItemCreated' || d.eventType === 'SceneItemRemoved') {
                    sceneItemIdCache.clear();
                }
            } else if (op === 7 && d) {
                // RequestResponse
                const pending = pendingRequests.get(d.requestId);
                if (!pending) return;
                clearTimeout(pending.timer);
                pendingRequests.delete(d.requestId);
                if (d.requestStatus?.result) {
                    pending.resolve(d.responseData || {});
                } else {
                    const comment = d.requestStatus?.comment || `OBS error code ${d.requestStatus?.code ?? 'unknown'}`;
                    pending.reject(new Error(comment));
                }
            }
        });

        addListener('close', (codeOrEvent, reason) => {
            const code = typeof codeOrEvent === 'object' && codeOrEvent !== null ? codeOrEvent.code : codeOrEvent;
            if (ws === socket) ws = null;
            const wasIdentified = state.identified;
            state.connected = false;
            state.connecting = false;
            state.identified = false;
            clearPendingRequests('OBS socket closed');
            if (code === 4009) {
                state.lastError = 'Authentication failed — check your OBS WebSocket password.';
            } else if (!wasIdentified && !state.lastError) {
                const reasonStr = reason ? String(reason).trim() : '';
                state.lastError = reasonStr || `Could not connect to OBS at ${cfg.host}:${cfg.port}`;
            }
            onStatusChange(getStatus());
            if (code !== 4009) scheduleReconnect(4000);
        });

        addListener('error', err => {
            state.lastError = err?.message || 'Connection refused';
        });
    }

    async function listScenesAndSources() {
        if (!state.identified) {
            return { connected: false, scenes: [], sources: [], currentProgramScene: '' };
        }
        const scenesRes = await request('GetSceneList').catch(() => ({ scenes: [] }));
        const sceneNames = (Array.isArray(scenesRes.scenes) ? scenesRes.scenes : [])
            .map(s => s.sceneName)
            .filter(Boolean)
            .reverse();
        const currentScene = scenesRes.currentProgramSceneName || state.currentProgramScene || sceneNames[0] || '';
        if (currentScene) state.currentProgramScene = currentScene;

        const sourcesSet = new Set();
        const byScene = {};
        for (const sName of sceneNames) {
            const itemsRes = await request('GetSceneItemList', { sceneName: sName }).catch(() => ({ sceneItems: [] }));
            const items = (Array.isArray(itemsRes.sceneItems) ? itemsRes.sceneItems : []).map(item => ({
                sceneItemId: item.sceneItemId,
                sourceName: item.sourceName,
                inputKind: item.inputKind || item.sourceType || '',
                sceneItemEnabled: item.sceneItemEnabled !== false
            }));
            byScene[sName] = items;
            for (const item of items) {
                if (item.sourceName) sourcesSet.add(item.sourceName);
            }
        }
        return {
            connected: true,
            currentProgramScene: currentScene,
            hasMovePlugin: state.hasMovePlugin,
            scenes: sceneNames,
            sources: [...sourcesSet].sort((a, b) => a.localeCompare(b)),
            byScene
        };
    }

    async function resolveSceneItemId(sceneName, sourceName) {
        const key = `${sceneName}::${sourceName}`;
        if (sceneItemIdCache.has(key)) return sceneItemIdCache.get(key);
        const res = await request('GetSceneItemId', { sceneName, sourceName });
        if (res?.sceneItemId != null) {
            sceneItemIdCache.set(key, res.sceneItemId);
            return res.sceneItemId;
        }
        throw new Error(`Source "${sourceName}" not found in OBS scene "${sceneName}"`);
    }

    async function animateItemToTarget({
        sceneName,
        sourceName,
        sceneItemId,
        target,
        fit = 'cover',
        syncVisibility = true,
        durationMs = 0,
        easing = 'smooth'
    }) {
        const itemKey = `${sceneName}::${sceneItemId}`;
        if (activeInterpolations.has(itemKey)) {
            clearInterval(activeInterpolations.get(itemKey));
            activeInterpolations.delete(itemKey);
        }

        const cfg = currentConfig();
        const effectiveMs = cfg.motionEngine === 'cut' ? 0 : Math.max(0, Number(durationMs) || 0);
        const useMovePlugin = state.hasMovePlugin && (cfg.motionEngine === 'auto' || cfg.motionEngine === 'move-plugin') && effectiveMs > 0;

        if (syncVisibility && target.visible !== false) {
            await request('SetSceneItemEnabled', {
                sceneName,
                sceneItemId,
                sceneItemEnabled: true
            }).catch(() => {});
        }

        // Instant snap when duration is 0 or element is hidden immediately
        if (effectiveMs <= 0) {
            if (target.visible !== false) {
                const transform = buildObsTransform(target, fit);
                await request('SetSceneItemTransform', {
                    sceneName,
                    sceneItemId,
                    sceneItemTransform: transform
                }).catch(() => {});
                lastKnownTransforms.set(itemKey, { ...target });
            }
            if (syncVisibility && target.visible === false) {
                await request('SetSceneItemEnabled', {
                    sceneName,
                    sceneItemId,
                    sceneItemEnabled: false
                }).catch(() => {});
            }
            return;
        }

        // Engine A: Exeldro's Move Source Filter (if installed in OBS)
        if (useMovePlugin && target.visible !== false) {
            const filterName = `StreamPulse_Move_${String(sourceName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`;
            const filterSettings = {
                source: sourceName,
                duration: Math.round(effectiveMs),
                pos: { x: Math.round(target.x), y: Math.round(target.y) },
                bounds: { x: Math.max(1, Math.round(target.width)), y: Math.max(1, Math.round(target.height)) },
                rot: Number(target.rotate) || 0
            };
            try {
                // First ensure boundsType is set on the item so Move Filter interpolates bounds cleanly
                const initCheck = lastKnownTransforms.get(itemKey);
                if (!initCheck) {
                    const cur = await request('GetSceneItemTransform', { sceneName, sceneItemId }).catch(() => null);
                    const curT = cur?.sceneItemTransform;
                    if (curT && (!curT.boundsType || curT.boundsType === 'OBS_BOUNDS_NONE') && fit !== 'none') {
                        await request('SetSceneItemTransform', {
                            sceneName,
                            sceneItemId,
                            sceneItemTransform: buildObsTransform({
                                x: curT.positionX ?? target.x,
                                y: curT.positionY ?? target.y,
                                width: curT.width || target.width,
                                height: curT.height || target.height,
                                rotate: curT.rotation || 0
                            }, fit)
                        }).catch(() => {});
                    }
                }
                const setRes = await request('SetSourceFilterSettings', {
                    sourceName: sceneName,
                    filterName,
                    filterSettings,
                    overlay: true
                }).catch(() => null);
                if (!setRes) {
                    await request('CreateSourceFilter', {
                        sourceName: sceneName,
                        filterName,
                        filterKind: 'move_source_filter',
                        filterSettings
                    });
                }
                await request('SetSourceFilterEnabled', {
                    sourceName: sceneName,
                    filterName,
                    filterEnabled: true
                });
                lastKnownTransforms.set(itemKey, { ...target });
                return;
            } catch {
                // Fall through seamlessly to built-in 60fps WebSocket interpolation
            }
        }

        // Engine B: Built-in 60fps WebSocket Transform Interpolation
        let fromState = lastKnownTransforms.get(itemKey);
        if (!fromState) {
            const cur = await request('GetSceneItemTransform', { sceneName, sceneItemId }).catch(() => null);
            const curT = cur?.sceneItemTransform;
            if (curT) {
                fromState = {
                    x: Number(curT.positionX) || 0,
                    y: Number(curT.positionY) || 0,
                    width: Number(curT.boundsWidth > 1 ? curT.boundsWidth : curT.width) || target.width,
                    height: Number(curT.boundsHeight > 1 ? curT.boundsHeight : curT.height) || target.height,
                    rotate: Number(curT.rotation) || 0
                };
            } else {
                fromState = { ...target };
            }
        }

        if (target.visible === false) {
            if (syncVisibility) {
                const hideTimer = setTimeout(() => {
                    activeInterpolations.delete(itemKey);
                    request('SetSceneItemEnabled', {
                        sceneName,
                        sceneItemId,
                        sceneItemEnabled: false
                    }).catch(() => {});
                }, effectiveMs);
                hideTimer.unref?.();
                activeInterpolations.set(itemKey, hideTimer);
            }
            return;
        }

        const startAt = Date.now();
        let inFlight = false;
        const timer = setInterval(() => {
            const elapsed = Date.now() - startAt;
            const rawT = Math.min(1, elapsed / effectiveMs);
            const k = evalMorphEase(easing, rawT);
            const interp = {
                x: fromState.x + (target.x - fromState.x) * k,
                y: fromState.y + (target.y - fromState.y) * k,
                width: Math.max(1, fromState.width + (target.width - fromState.width) * k),
                height: Math.max(1, fromState.height + (target.height - fromState.height) * k),
                rotate: (fromState.rotate || 0) + ((target.rotate || 0) - (fromState.rotate || 0)) * k
            };
            lastKnownTransforms.set(itemKey, interp);
            if (rawT >= 1) {
                clearInterval(timer);
                activeInterpolations.delete(itemKey);
                request('SetSceneItemTransform', {
                    sceneName,
                    sceneItemId,
                    sceneItemTransform: buildObsTransform(target, fit)
                }).catch(() => {});
                return;
            }
            if (!inFlight) {
                inFlight = true;
                request('SetSceneItemTransform', {
                    sceneName,
                    sceneItemId,
                    sceneItemTransform: buildObsTransform(interp, fit)
                }).catch(() => {}).finally(() => { inFlight = false; });
            }
        }, 16);
        timer.unref?.();
        activeInterpolations.set(itemKey, timer);
    }

    function effectiveOverlayElementForPage(el, pageId, overlay) {
        const pagesEnabled = Boolean(overlay?.pages?.enabled);
        const basePageId = overlay?.pages?.items?.[0]?.id || '';
        const inPage = !pagesEnabled || el.page === '*' || el.page === pageId;
        if (!inPage) {
            return {
                x: Number(el.x) || 0,
                y: Number(el.y) || 0,
                width: Math.max(1, Number(el.width) || 100),
                height: Math.max(1, Number(el.height) || 100),
                rotate: Number(el.style?.rotate) || 0,
                visible: false
            };
        }
        const ovr = (pagesEnabled && el.page === '*' && pageId && pageId !== basePageId)
            ? el.pageStates?.[pageId]
            : null;
        return {
            x: Number(ovr?.x ?? el.x) || 0,
            y: Number(ovr?.y ?? el.y) || 0,
            width: Math.max(1, Number(ovr?.width ?? el.width) || 100),
            height: Math.max(1, Number(ovr?.height ?? el.height) || 100),
            rotate: Number(ovr?.rotate ?? el.style?.rotate) || 0,
            visible: (ovr?.visible !== undefined ? ovr.visible : el.visible) !== false
        };
    }

    async function syncOverlayState(overlay, pageId = '', { animate = true, instant = false } = {}) {
        const cfg = currentConfig();
        if (!cfg.enabled || !state.identified || !overlay || !Array.isArray(overlay.elements)) {
            return { ok: false, synced: 0, results: [] };
        }
        const linkedElements = overlay.elements.filter(el => el?.obsLink?.enabled && el?.obsLink?.sourceName);
        if (!linkedElements.length) return { ok: true, synced: 0, results: [] };

        const targetPage = pageId || (overlay.pages?.enabled ? (overlay.pages.items?.[0]?.id || '') : '');
        const durationMs = (instant || !animate || !overlay.pages?.enabled || overlay.pages.transition === 'none')
            ? 0
            : (Number(overlay.pages.transitionMs) || 650);
        const easing = overlay.pages?.transitionEasing || 'smooth';

        let synced = 0;
        const results = [];
        await Promise.all(linkedElements.map(async el => {
            const link = el.obsLink;
            const sceneName = link.sceneName || state.currentProgramScene;
            if (!sceneName) {
                results.push({ id: el.id, sourceName: link.sourceName, ok: false, reason: 'No target OBS scene known' });
                return;
            }
            try {
                const sceneItemId = await resolveSceneItemId(sceneName, link.sourceName);
                const target = effectiveOverlayElementForPage(el, targetPage, overlay);
                await animateItemToTarget({
                    sceneName,
                    sourceName: link.sourceName,
                    sceneItemId,
                    target,
                    fit: link.fit || 'cover',
                    syncVisibility: link.syncVisibility !== false,
                    durationMs,
                    easing
                });
                synced++;
                results.push({ id: el.id, sourceName: link.sourceName, sceneName, sceneItemId, ok: true });
            } catch (err) {
                warn(`[OBS] Could not sync source "${link.sourceName}" in scene "${sceneName}":`, err.message);
                results.push({ id: el.id, sourceName: link.sourceName, sceneName, ok: false, reason: err.message });
            }
        }));
        return { ok: true, synced, results };
    }

    return {
        connect,
        disconnect,
        getStatus,
        listScenesAndSources,
        syncOverlayState,
        animateItemToTarget,
        resolveSceneItemId
    };
}

module.exports = {
    DEFAULT_OBS_CONFIG,
    normalizeObsConfig,
    computeObsAuthResponse,
    buildObsTransform,
    createObsService
};
