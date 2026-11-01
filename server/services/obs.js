'use strict';

const crypto = require('crypto');
const WebSocket = require('ws');

const DEFAULT_OBS_CONFIG = {
    enabled: false,
    host: '127.0.0.1',
    port: 4455,
    password: '',
    syncOnSave: true,
    overlayOffsetMs: 0, // delay before the overlay starts its transition after OBS begins moving (0-1000)
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
        overlayOffsetMs: Math.max(0, Math.min(1000, Math.round(Number(raw.overlayOffsetMs) || 0))),
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
        scaleX: 1,
        scaleY: 1,
        boundsType,
        boundsAlignment: 0, // Center inside bounds
        boundsWidth: w,
        boundsHeight: h
    };
}

const Motion = require('../../public/js/motion-easing');
const evalMorphEase = (name, t) => Motion.evaluate(name, t);

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
    const pendingSyncs = new Map();
    const overlayPages = new Map();
    let connectionGeneration = 0;
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

    function cancelAllInterpolations(reason = 'OBS disconnected') {
        connectionGeneration++;
        pendingSyncs.clear();
        for (const operation of activeInterpolations.values()) {
            operation.cancel(reason);
        }
        activeInterpolations.clear();
        lastKnownTransforms.clear();
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
            cancelAllInterpolations('OBS socket closed');
            sceneItemIdCache.clear();
            clearPendingRequests('OBS socket closed');
            if (code === 4006) {
                state.lastError = 'Authentication failed — check your OBS WebSocket password.';
            } else if (!wasIdentified && !state.lastError) {
                const reasonStr = reason ? String(reason).trim() : '';
                state.lastError = reasonStr || `Could not connect to OBS at ${cfg.host}:${cfg.port}`;
            }
            onStatusChange(getStatus());
            if (code !== 4006) scheduleReconnect(4000);
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
        const generation = connectionGeneration;
        const res = await request('GetSceneItemId', { sceneName, sourceName });
        if (generation !== connectionGeneration) throw new Error('OBS disconnected');
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
        easing = 'smooth',
        style = {},
        onStart = () => {}
    }) {
        const itemKey = `${sceneName}::${sceneItemId}`;
        // Reserve ownership before any OBS await, including visibility and transform reads.
        activeInterpolations.get(itemKey)?.cancel('OBS sync superseded by a newer target');
        const operation = {
            timer: null,
            error: null,
            reject: null,
            cancel(reason) {
                this.error = new Error(reason);
                clearTimeout(this.timer);
                this.reject?.(this.error);
            }
        };
        activeInterpolations.set(itemKey, operation);
        const checkCurrent = () => {
            if (operation.error) throw operation.error;
            if (activeInterpolations.get(itemKey) !== operation) throw new Error('OBS sync superseded by a newer target');
        };
        const call = async (type, data) => {
            checkCurrent();
            const result = await request(type, data);
            checkCurrent();
            return result;
        };
        const writeTransform = async value => {
            await call('SetSceneItemTransform', {
                sceneName, sceneItemId, sceneItemTransform: buildObsTransform(value, fit)
            });
            lastKnownTransforms.set(itemKey, { ...value });
        };

        try {
            const cfg = currentConfig();
            const effectiveMs = cfg.motionEngine === 'cut' ? 0 : Math.max(0, Number(durationMs) || 0);
            const filterName = `StreamPulse_Move_${sceneItemId}_${String(sourceName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`;
            const useMovePlugin = state.hasMovePlugin && fit !== 'none' && (cfg.motionEngine === 'auto' || cfg.motionEngine === 'move-plugin') && effectiveMs > 0;

            // Move Source filters belong to the scene, and must stop before a replacement target or hide.
            if (state.hasMovePlugin) {
                const existing = await call('GetSourceFilterList', { sourceName: sceneName });
                for (const filter of existing.filters || []) {
                    if (filter.filterName !== filterName && filter.filterName?.startsWith('StreamPulse_Move_') && filter.filterSettings?.source === sourceName) {
                        // A replaced scene item leaves its old managed filter behind, so remove it instead of piling up.
                        await call('RemoveSourceFilter', { sourceName: sceneName, filterName: filter.filterName }).catch(() => null);
                    }
                }
                await call('SetSourceFilterEnabled', {
                    sourceName: sceneName,
                    filterName,
                    filterEnabled: false
                }).catch(() => null);
                checkCurrent();
            }


            const mode = style.mode || 'morph';
            const willShow = target.visible !== false;
            const effectKind = mode === 'morph' ? (style.enterExit || 'fade') : mode;
            const readCurrent = async () => {
                const known = lastKnownTransforms.get(itemKey);
                if (known) return { ...known };
                const cur = await call('GetSceneItemTransform', { sceneName, sceneItemId });
                const curT = cur?.sceneItemTransform;
                if (!curT) return { ...target };
                return {
                    x: Number(curT.positionX) || 0,
                    y: Number(curT.positionY) || 0,
                    width: Number(curT.boundsWidth > 1 ? curT.boundsWidth : curT.width) || target.width,
                    height: Number(curT.boundsHeight > 1 ? curT.boundsHeight : curT.height) || target.height,
                    rotate: Number(curT.rotation) || 0
                };
            };
            const fadeFilterName = `StreamPulse_Fade_${sceneItemId}`;
            let opacityUnavailable = false;
            let opacityFilterTouched = false;
            const setOpacity = async value => {
                if (opacityUnavailable) return;
                const filterSettings = { opacity: Math.round(Math.max(0, Math.min(1, value)) * 100) };
                try {
                    const updated = opacityFilterTouched && await call('SetSourceFilterSettings', { sourceName, filterName: fadeFilterName, filterSettings, overlay: true }).catch(() => null);
                    if (!updated) {
                        await call('CreateSourceFilter', { sourceName, filterName: fadeFilterName, filterKind: 'color_filter_v2', filterSettings }).catch(async () => {
                            await call('SetSourceFilterSettings', { sourceName, filterName: fadeFilterName, filterSettings, overlay: true });
                        });
                    }
                    opacityFilterTouched = true;
                } catch (err) {
                    if (operation.error || activeInterpolations.get(itemKey) !== operation) throw err;
                    opacityUnavailable = true;
                }
            };
            const clearOpacity = async () => {
                if (!opacityFilterTouched) return;
                opacityFilterTouched = false;
                await request('RemoveSourceFilter', { sourceName, filterName: fadeFilterName }).catch(() => null);
            };
            const runFrames = (ms, frame) => new Promise((resolve, reject) => {
                operation.reject = reject;
                const startAt = Date.now();
                const tick = async () => {
                    try {
                        checkCurrent();
                        const frameStart = Date.now();
                        const raw = Math.min(1, (frameStart - startAt) / ms);
                        await frame(raw);
                        if (raw >= 1) { resolve(); return; }
                        checkCurrent();
                        operation.timer = setTimeout(tick, Math.max(0, 16 - (Date.now() - frameStart)));
                    } catch (err) {
                        reject(err);
                    }
                };
                tick();
            });
            // Mirrors the overlay's pg-fade/slide/zoom keyframes: slide travels +/-distance, zoom scales 0.85 to 1.
            const playEffect = async (direction, ms, base) => {
                const sign = style.sign || [1, 0];
                const distance = Number(style.distance) || 120;
                const entering = direction === 'in';
                const frameState = progress => {
                    const away = entering ? 1 - progress : progress;
                    const offset = entering ? away : -away;
                    const scale = effectKind === 'zoom' ? 1 - 0.15 * away : 1;
                    const width = Math.max(1, base.width * scale);
                    const height = Math.max(1, base.height * scale);
                    return {
                        opacity: entering ? progress : 1 - progress,
                        transform: {
                            x: base.x + (effectKind === 'slide' ? offset * sign[0] * distance : 0) - (width - base.width) / 2,
                            y: base.y + (effectKind === 'slide' ? offset * sign[1] * distance : 0) - (height - base.height) / 2,
                            width,
                            height,
                            rotate: base.rotate || 0
                        }
                    };
                };
                const apply = async progress => {
                    const state = frameState(progress);
                    if (effectKind !== 'fade') await writeTransform(state.transform);
                    await setOpacity(state.opacity);
                };
                await apply(0);
                onStart();
                if (entering && syncVisibility) await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
                await runFrames(ms, raw => apply(evalMorphEase(easing, raw)));
            };
            const finishEffect = async base => {
                await writeTransform(base);
                await clearOpacity();
            };

            if (effectiveMs > 0 && syncVisibility) {
                const wasEnabled = (await call('GetSceneItemEnabled', { sceneName, sceneItemId }))?.sceneItemEnabled !== false;
                if (!willShow) {
                    if (wasEnabled && effectKind !== 'none') {
                        const base = await readCurrent();
                        await playEffect('out', effectiveMs, base);
                        await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: false });
                        await finishEffect(base);
                        return;
                    }
                    await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: false });
                    return;
                }
                if (!wasEnabled) {
                    if (effectKind === 'none') {
                        await writeTransform(target);
                        await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
                        return;
                    }
                    await playEffect('in', effectiveMs, target);
                    await finishEffect(target);
                    return;
                }
                if (mode !== 'morph') {
                    const current = await readCurrent();
                    const moved = ['x', 'y', 'width', 'height', 'rotate'].some(key => Math.abs((Number(current[key]) || 0) - (Number(target[key]) || 0)) > 1);
                    if (moved && effectKind !== 'none') {
                        await playEffect('out', effectiveMs / 2, current);
                        await writeTransform(target);
                        await playEffect('in', effectiveMs / 2, target);
                        await finishEffect(target);
                    } else {
                        await writeTransform(target);
                    }
                    return;
                }
            }

            if (syncVisibility && target.visible !== false) {
                await call('SetSceneItemEnabled', {
                    sceneName,
                    sceneItemId,
                    sceneItemEnabled: true
                });
            }

            // Instant snap when duration is 0 or element is hidden immediately
            if (effectiveMs <= 0) {
                if (target.visible !== false) {
                    await writeTransform(target);
                }
                if (syncVisibility && target.visible === false) {
                    await call('SetSceneItemEnabled', {
                        sceneName,
                        sceneItemId,
                        sceneItemEnabled: false
                    });
                }
                return;
            }

            // Engine A: Exeldro's Move Source Filter (if installed in OBS)
            if (useMovePlugin && target.visible !== false) {
                const filterSettings = {
                    source: sourceName,
                    transform: true,
                    custom_duration: true,
                    enabled_match_moving: false,
                    start_trigger: 13, // Move's Load trigger starts on settings updates, including repeated state switches.
                    start_delay: 0,
                    end_delay: 0,
                    ...Motion.moveSettings(easing),
                    duration: Math.round(effectiveMs),
                    scale: { x: 1, y: 1 },
                    change_visibility: 0,
                    pos: { x: Math.round(target.x), y: Math.round(target.y) },
                    bounds: { x: Math.max(1, Math.round(target.width)), y: Math.max(1, Math.round(target.height)) },
                    rot: Number(target.rotate) || 0
                };
                // Required transform preparation must succeed even if filter setup falls back.
                if (!lastKnownTransforms.has(itemKey)) {
                    const cur = await call('GetSceneItemTransform', { sceneName, sceneItemId });
                    const curT = cur?.sceneItemTransform;
                    if (curT && (!curT.boundsType || curT.boundsType === 'OBS_BOUNDS_NONE') && fit !== 'none') {
                        await writeTransform({
                            x: curT.positionX ?? target.x,
                            y: curT.positionY ?? target.y,
                            width: curT.width || target.width,
                            height: curT.height || target.height,
                            rotate: curT.rotation || 0
                        });
                    }
                }
                try {
                    const setRes = await call('SetSourceFilterSettings', {
                        sourceName: sceneName,
                        filterName,
                        filterSettings,
                        overlay: true
                    }).catch(() => null);
                    checkCurrent();
                    if (!setRes) {
                        await call('CreateSourceFilter', {
                            sourceName: sceneName,
                            filterName,
                            filterKind: 'move_source_filter',
                            filterSettings
                        });
                        // Creation may update the filter before it has a parent scene.
                        await call('SetSourceFilterSettings', {
                            sourceName: sceneName,
                            filterName,
                            filterSettings,
                            overlay: true
                        });
                    }
                    await call('SetSourceFilterEnabled', {
                        sourceName: sceneName,
                        filterName,
                        filterEnabled: true
                    });
                    onStart();
                    // OBS acknowledges the filter start, not its eventual playback completion.
                    lastKnownTransforms.delete(itemKey);
                    return;
                } catch {
                    // Fall through seamlessly to built-in 60fps WebSocket interpolation
                    checkCurrent();
                }
            }

            // Engine B: Built-in 60fps WebSocket Transform Interpolation
            if (target.visible === false) {
                if (syncVisibility) {
                    await new Promise((resolve, reject) => {
                        operation.reject = reject;
                        operation.timer = setTimeout(resolve, effectiveMs);
                    });
                    await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: false });
                }
                return;
            }

            let fromState = lastKnownTransforms.get(itemKey);
            if (!fromState) {
                const cur = await call('GetSceneItemTransform', { sceneName, sceneItemId });
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

            onStart();
            const startAt = Date.now();
            // Serialize frames and await the final acknowledgement before reporting success.
            await new Promise((resolve, reject) => {
                operation.reject = reject;
                const tick = async () => {
                    try {
                        checkCurrent();
                        const frameStart = Date.now();
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
                        if (rawT >= 1) {
                            await writeTransform(target);
                            resolve();
                            return;
                        }
                        await writeTransform(interp);
                        checkCurrent();
                        operation.timer = setTimeout(tick, Math.max(0, 16 - (Date.now() - frameStart)));
                    } catch (err) {
                        reject(err);
                    }
                };
                operation.timer = setTimeout(tick, 16);
            });
        } finally {
            onStart();
            clearTimeout(operation.timer);
            operation.reject = null;
            if (activeInterpolations.get(itemKey) === operation) activeInterpolations.delete(itemKey);
        }
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
            rotate: Number(ovr?.rotate ?? ovr?.style?.rotate ?? el.style?.rotate) || 0,
            visible: (ovr?.visible !== undefined ? ovr.visible : el.visible) !== false
        };
    }

    // Removes StreamPulse-managed Move/Fade filters whose source is no longer in the scene, or all of them when force is set.
    async function cleanupManagedFilters({ sceneName = '', force = false } = {}) {
        if (!state.identified) return { ok: false, removed: [], error: 'OBS is not connected' };
        const sceneNames = sceneName ? [sceneName] : ((await request('GetSceneList')).scenes || []).map(scene => scene.sceneName);
        const removed = [];
        for (const name of sceneNames) {
            const filters = (await request('GetSourceFilterList', { sourceName: name }).catch(() => ({ filters: [] }))).filters || [];
            const managed = filters.filter(filter => /^StreamPulse_(Move|Fade)_/.test(filter.filterName || ''));
            if (!managed.length) continue;
            const items = (await request('GetSceneItemList', { sceneName: name }).catch(() => ({ sceneItems: [] }))).sceneItems || [];
            const present = new Set(items.map(item => item.sourceName));
            const ids = new Set(items.map(item => String(item.sceneItemId)));
            for (const filter of managed) {
                const target = filter.filterSettings?.source;
                const fadeId = /^StreamPulse_Fade_(\d+)$/.exec(filter.filterName)?.[1];
                const orphan = fadeId ? !ids.has(fadeId) : !present.has(target);
                if (!force && !orphan) continue;
                await request('RemoveSourceFilter', { sourceName: name, filterName: filter.filterName }).catch(() => null);
                removed.push({ sceneName: name, filterName: filter.filterName });
            }
        }
        return { ok: true, removed };
    }

    async function syncOverlayState(overlay, pageId = '', { animate = true, instant = false, onMotionStart = () => {} } = {}) {
        let pending = 0;
        let released = false;
        const release = () => { if (!released) { released = true; onMotionStart(); } };
        try {
            return await syncOverlayStateInner(overlay, pageId, { animate, instant, started: () => { if (--pending <= 0) release(); }, expect: n => { pending = n; if (!n) release(); } });
        } finally {
            release();
        }
    }

    async function syncOverlayStateInner(overlay, pageId, { animate, instant, started, expect }) {
        if (overlay?.pages?.enabled && (overlay.pages.kind === 'pages' || (!overlay.pages.kind && overlay.pages.transition !== 'morph'))) {
            return { ok: true, synced: 0, results: [], skipped: true };
        }
        const cfg = currentConfig();
        if (!cfg.enabled || !state.identified || !overlay || !Array.isArray(overlay.elements)) {
            return { ok: false, synced: 0, results: [] };
        }
        const linkedElements = overlay.elements.filter(el => el?.obsLink?.enabled && el?.obsLink?.sourceName);
        expect(linkedElements.length);
        if (!linkedElements.length) return { ok: true, synced: 0, results: [] };

        const targetPage = pageId || (overlay.pages?.enabled ? (overlay.pages.items?.[0]?.id || '') : '');
        const durationMs = (instant || !animate || !overlay.pages?.enabled || overlay.pages.transition === 'none')
            ? 0
            : (Number(overlay.pages.transitionMs) || 650);
        const easing = overlay.pages?.transitionEasing || 'smooth';
        const previousPage = overlayPages.get(overlay.id || '');
        if (overlay.id) overlayPages.set(overlay.id, targetPage);
        const items = overlay.pages?.items || [];
        const prevIdx = items.findIndex(item => item.id === previousPage);
        const nextIdx = items.findIndex(item => item.id === targetPage);
        const isBackward = prevIdx !== -1 && nextIdx !== -1 && nextIdx < prevIdx && !(overlay.pages?.mode === 'auto' && prevIdx === items.length - 1 && nextIdx === 0);
        const flipDir = { left: 'right', right: 'left', up: 'down', down: 'up' };
        const direction = isBackward ? (flipDir[overlay.pages?.transitionDirection] || 'right') : (overlay.pages?.transitionDirection || 'left');
        const transitionStyle = {
            mode: ['morph', 'fade', 'slide', 'zoom', 'none'].includes(overlay.pages?.transition) ? overlay.pages.transition : 'morph',
            enterExit: overlay.pages?.enterExit || 'fade',
            sign: { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] }[direction] || [1, 0],
            distance: Number(overlay.pages?.transitionDistance) || 120
        };

        let synced = 0;
        const results = [];
        await Promise.all(linkedElements.map(async el => {
            const link = el.obsLink;
            const sceneName = link.sceneName || state.currentProgramScene;
            if (!sceneName) {
                results.push({ id: el.id, sourceName: link.sourceName, ok: false, reason: 'No target OBS scene known' });
                return;
            }
            const syncKey = `${sceneName}::${link.sourceName}`;
            const previousSync = pendingSyncs.get(syncKey);
            if (previousSync?.itemKey) {
                activeInterpolations.get(previousSync.itemKey)?.cancel('OBS sync superseded by a newer target');
            }
            const token = {};
            const generation = connectionGeneration;
            pendingSyncs.set(syncKey, token);
            try {
                const sceneItemId = await resolveSceneItemId(sceneName, link.sourceName);
                if (generation !== connectionGeneration) throw new Error('OBS disconnected');
                if (pendingSyncs.get(syncKey) !== token) throw new Error('OBS sync superseded by a newer target');
                token.itemKey = `${sceneName}::${sceneItemId}`;
                const target = effectiveOverlayElementForPage(el, targetPage, overlay);
                await animateItemToTarget({
                    sceneName,
                    sourceName: link.sourceName,
                    sceneItemId,
                    target,
                    fit: link.fit || 'cover',
                    syncVisibility: link.syncVisibility !== false,
                    durationMs,
                    easing,
                    style: transitionStyle,
                    onStart: (() => { let done = false; return () => { if (!done) { done = true; started(); } }; })()
                });
                synced++;
                results.push({ id: el.id, sourceName: link.sourceName, sceneName, sceneItemId, ok: true });
            } catch (err) {
                warn(`[OBS] Could not sync source "${link.sourceName}" in scene "${sceneName}":`, err.message);
                results.push({ id: el.id, sourceName: link.sourceName, sceneName, ok: false, reason: err.message });
            } finally {
                if (pendingSyncs.get(syncKey) === token) pendingSyncs.delete(syncKey);
            }
        }));
        return { ok: results.every(result => result.ok), synced, results };
    }

    return {
        connect,
        disconnect,
        getStatus,
        listScenesAndSources,
        syncOverlayState,
        cleanupManagedFilters,
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
