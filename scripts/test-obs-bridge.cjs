'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const vm = require('node:vm');

const {
    computeObsAuthResponse,
    createObsService,
    normalizeObsConfig
} = require('../server/services/obs');
const { normalizePageStates, normalizePages } = require('../server/services/overlays');
const { createObsRoutes } = require('../server/routes/obs');
const { createSystemRoutes } = require('../server/routes/system');

class FixtureWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
        super();
        this.url = url;
        this.readyState = FixtureWebSocket.CONNECTING;
        this.sent = [];
        this.requests = [];
        FixtureWebSocket.instances.push(this);
    }

    send(raw) {
        const message = JSON.parse(raw);
        this.sent.push(message);
        if (message.op === 8) {
            (this.batches ||= []).push(message.d);
            this.emit('message', JSON.stringify({ op: 9, d: { requestId: message.d.requestId, results: message.d.requests.map(r => ({ requestType: r.requestType, requestStatus: { result: true, code: 100 } })) } }));
            return;
        }
        if (message.op !== 6) return;
        this.requests.push(message.d);
        if (this.handleRequest?.(message.d)) return;
        this.respond(message.d);
    }

    respond(request, error = '') {
        this.emit('message', JSON.stringify({
            op: 7,
            d: {
                requestId: request.requestId,
                requestStatus: { result: !error, code: error ? 500 : 100, comment: error },
                responseData: error ? {} : this.responseFor(request.requestType)
            }
        }));
    }

    responseFor(requestType) {
        if (requestType === 'GetVideoSettings') return FixtureWebSocket.fps ? { fpsNumerator: FixtureWebSocket.fps, fpsDenominator: 1 } : {};
        if (requestType === 'GetVersion') return { obsVersion: '31.0', obsWebSocketVersion: '5.5' };
        if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' };
        if (requestType === 'GetSourceFilterKindList') return { sourceFilterKinds: ['move_source_filter'] };
        if (requestType === 'GetSourceFilterList') return { filters: [] };
        if (requestType === 'GetSceneItemId') return { sceneItemId: 55 };
        if (requestType === 'GetSceneItemTransform') {
            return { sceneItemTransform: { positionX: 0, positionY: 0, width: 1280, height: 720, rotation: 0 } };
        }
        if (requestType === 'GetSceneList') return { scenes: [{ sceneName: 'Main' }], currentProgramSceneName: 'Main' };
        if (requestType === 'GetSceneItemList') return { sceneItems: [] };
        return {};
    }
}

function createConnectedService(overrides = {}) {
    FixtureWebSocket.instances = [];
    const service = createObsService({
        getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 4455, password: 'fixture-pass', ...overrides }),
        WebSocketImpl: FixtureWebSocket,
        log: () => {},
        warn: () => {}
    });
    service.connect();
    const socket = FixtureWebSocket.instances.at(-1);
    socket.readyState = FixtureWebSocket.OPEN;
    socket.emit('open');
    socket.emit('message', JSON.stringify({
        op: 0,
        d: { authentication: { salt: 'fixture-salt', challenge: 'fixture-challenge' } }
    }));
    socket.emit('message', JSON.stringify({ op: 2, d: {} }));
    return { service, socket };
}

async function flush() {
    await new Promise(resolve => setImmediate(resolve));
}

test('simple Pages remain instant and never send OBS commands, even with inherited state settings', async () => {
    const { service, socket } = createConnectedService();
    try {
        await flush();
        const count = socket.requests.length;
        const pages = normalizePages({ enabled: true, kind: 'pages', transition: 'morph', items: [{ id: 'a' }, { id: 'b' }] });
        assert.equal(pages.kind, 'pages');
        assert.equal(pages.transition, 'none');
        const result = await service.syncOverlayState({
            pages,
            elements: [{ id: 'camera', page: '*', obsLink: { enabled: true, sourceName: 'Camera' } }]
        }, 'b');
        assert.equal(result.ok, true);
        assert.equal(result.synced, 0);
        assert.equal(socket.requests.length, count);
    } finally {
        service.disconnect();
    }
});

test('shared easing matches Move plugin curves and maps to its enum', () => {
    const Motion = require('../public/js/motion-easing');
    assert.equal(Motion.evaluate('smooth', 0.5), 1 - 0.5 ** 5);
    assert.equal(Motion.evaluate('quad-in', 0.5), 0.25);
    assert.ok(Motion.evaluate('back-out', 0.8) > 1, 'back overshoots like Move');
    assert.deepEqual(Motion.moveSettings('smooth'), { easing_match: 2, easing_function_match: 4 });
    assert.deepEqual(Motion.moveSettings('snappy'), { easing_match: 2, easing_function_match: 7 });
    assert.deepEqual(Motion.moveSettings('elastic-in-out'), { easing_match: 3, easing_function_match: 8 });
    assert.deepEqual(Motion.moveSettings('linear'), { easing_match: 0, easing_function_match: 2 });
    for (const name of Motion.names) {
        assert.equal(Motion.evaluate(name, 0), 0, name);
        assert.ok(Math.abs(Motion.evaluate(name, 1) - 1) < 1e-9, name);
    }
});

test('cleanup removes only orphaned StreamPulse filters and never user filters', async () => {
    const { service, socket } = createConnectedService();
    try {
        await flush();
        const responseFor = socket.responseFor.bind(socket);
        socket.responseFor = type => type === 'GetSourceFilterList' ? { filters: [
            { filterName: 'StreamPulse_Move_9_Gone', filterSettings: { source: 'Gone' } },
            { filterName: 'StreamPulse_Move_55_Camera', filterSettings: { source: 'Camera' } },
            { filterName: 'StreamPulse_Fade_77', filterSettings: {} },
            { filterName: 'User filter', filterSettings: { source: 'Gone' } }
        ] } : type === 'GetSceneItemList' ? { sceneItems: [{ sourceName: 'Camera', sceneItemId: 55 }] } : responseFor(type);
        const result = await service.cleanupManagedFilters({ sceneName: 'Main' });
        assert.deepEqual(result.removed.map(r => r.filterName).sort(), ['StreamPulse_Fade_77', 'StreamPulse_Move_9_Gone']);
        const all = await service.cleanupManagedFilters({ sceneName: 'Main', force: true });
        assert.equal(all.removed.length, 3);
        assert.ok(!socket.requests.some(r => r.requestType === 'RemoveSourceFilter' && r.requestData.filterName === 'User filter'));
    } finally {
        service.disconnect();
    }
});

test('motion-start callback fires once OBS begins a linked transition', async () => {
    const { service } = createConnectedService();
    try {
        await flush();
        let starts = 0;
        await service.syncOverlayState({
            id: 'start-fixture',
            elements: [{ id: 'camera', page: '*', x: 0, y: 0, width: 400, height: 300, pageStates: { p2: { x: 500 } }, obsLink: { enabled: true, sourceName: 'Camera', sceneName: 'Main' } }],
            pages: { enabled: true, kind: 'states', items: [{ id: 'p1' }, { id: 'p2' }], transition: 'morph', transitionMs: 300 }
        }, 'p2', { onMotionStart: () => { starts++; } });
        assert.equal(starts, 1);
        let unlinked = 0;
        await service.syncOverlayState({ id: 'none', elements: [], pages: { enabled: true, items: [{ id: 'p1' }] } }, 'p1', { onMotionStart: () => { unlinked++; } });
        assert.equal(unlinked, 1);
    } finally {
        service.disconnect();
    }
});

test('frame-sync engine sends frame-paced SerialFrame batches matching the shared easing', async () => {
    FixtureWebSocket.fps = 60;
    const Motion = require('../public/js/motion-easing');
    const { service, socket } = createConnectedService();
    try {
        await flush();
        assert.equal(service.getStatus().activeEngine, 'frame-sync');
        const result = await service.syncOverlayState({
            id: 'frame-sync-fixture',
            elements: [{ id: 'camera', page: '*', x: 0, y: 0, width: 400, height: 300, pageStates: { p2: { x: 600 } }, obsLink: { enabled: true, sourceName: 'Camera', sceneName: 'Main' } }],
            pages: { enabled: true, kind: 'states', items: [{ id: 'p1' }, { id: 'p2' }], transition: 'morph', transitionMs: 100, transitionEasing: 'smooth' }
        }, 'p2', { startAt: Date.now() });
        assert.equal(result.ok, true);
        assert.ok(socket.batches?.length >= 1, 'uses request batches');
        assert.ok(socket.batches.every(b => b.executionType === 1), 'SerialFrame execution');
        const sets = socket.batches.flatMap(b => b.requests).filter(r => r.requestType === 'SetSceneItemTransform');
        const total = Math.round(100 / (1000 / 60));
        const xs = sets.map(r => r.requestData.sceneItemTransform.positionX);
        assert.ok(xs.length >= 2 && xs.length <= total + 1, 'one step per frame');
        assert.equal(Math.round(xs.at(-1)), 600);
        const mid = sets.findIndex((_, i) => i === 3);
        assert.ok(Math.abs(xs[mid] - 600 * Motion.evaluate('smooth', 3 / total)) < 1 || sets.length < 5);
        assert.ok(socket.batches.flatMap(b => b.requests).some(r => r.requestType === 'Sleep' && r.requestData.sleepFrames === 1));
    } finally {
        FixtureWebSocket.fps = 0;
        service.disconnect();
    }
});

test('crossfade and slide transitions never use Move filters and match the overlay effect', async () => {
    for (const transition of ['fade', 'slide', 'zoom']) {
        const { service, socket } = createConnectedService();
        try {
            await flush();
            const result = await service.syncOverlayState({
                id: `parity-${transition}`,
                elements: [{
                    id: 'camera', page: '*', x: 100, y: 100, width: 400, height: 300,
                    pageStates: { p2: { x: 900, y: 400 } },
                    obsLink: { enabled: true, sourceName: 'Camera', sceneName: 'Main' }
                }],
                pages: { enabled: true, kind: 'states', items: [{ id: 'p1' }, { id: 'p2' }], transition, transitionMs: 120, transitionEasing: 'linear' }
            }, 'p2');
            assert.equal(result.ok, true);
            assert.ok(!socket.requests.some(r => r.requestType === 'CreateSourceFilter' && r.requestData.filterKind === 'move_source_filter'), transition);
            assert.ok(!socket.requests.some(r => r.requestType === 'SetSourceFilterSettings' && r.requestData.filterName?.startsWith('StreamPulse_Move_')), transition);
            assert.ok(socket.requests.some(r => r.requestType === 'CreateSourceFilter' && r.requestData.filterKind === 'color_filter_v2'), transition);
            const transforms = socket.requests.filter(r => r.requestType === 'SetSceneItemTransform').map(r => r.requestData.sceneItemTransform);
            assert.equal(transforms.at(-1).positionX, 900);
            assert.equal(transforms.at(-1).positionY, 400);
            assert.ok(socket.requests.some(r => r.requestType === 'RemoveSourceFilter' && r.requestData.filterName === 'StreamPulse_Fade_55'));
        } finally {
            service.disconnect();
        }
    }
});

test('new Move filters load their target after attachment to the containing scene', async () => {
    const { service, socket } = createConnectedService();
    try {
        await flush();
        let created = false;
        const responseFor = socket.responseFor.bind(socket);
        socket.responseFor = type => type === 'GetSourceFilterList' ? {
            filters: [
                { filterName: 'StreamPulse_Move_12_Camera', filterSettings: { source: 'Camera' } },
                { filterName: 'User filter', filterSettings: { source: 'Camera' } }
            ]
        } : responseFor(type);
        socket.handleRequest = request => {
            if (request.requestType === 'CreateSourceFilter') created = true;
            if (request.requestType === 'SetSourceFilterSettings' && !created) {
                socket.respond(request, 'Filter not found');
                return true;
            }
        };
        await service.syncOverlayState({
            id: 'bees-fixture',
            elements: [{
                id: 'camera', page: '*', x: 668, y: 540, width: 540, height: 304,
                pageStates: { p2: { x: 1295, y: 51 } },
                obsLink: { enabled: true, sourceName: 'Camera', sceneName: 'Main' }
            }],
            pages: { enabled: true, items: [{ id: 'p1' }, { id: 'p2' }], transition: 'morph', transitionMs: 1500 }
        }, 'p2');
        const createIndex = socket.requests.findIndex(r => r.requestType === 'CreateSourceFilter');
        assert.ok(createIndex >= 0);
        const reload = socket.requests[createIndex + 1];
        assert.equal(reload.requestType, 'SetSourceFilterSettings');
        assert.equal(reload.requestData.sourceName, 'Main');
        assert.deepEqual(reload.requestData.filterSettings.pos, { x: 1295, y: 51 });
        assert.equal(reload.requestData.filterSettings.duration, 1500);
        assert.ok(socket.requests.some(r => r.requestType === 'RemoveSourceFilter' &&
            r.requestData.filterName === 'StreamPulse_Move_12_Camera'));
        assert.ok(!socket.requests.some(r => r.requestData.filterName === 'User filter'));
    } finally {
        service.disconnect();
    }
});

test('OBS v5 auth, Move filter requests, and page-state rotation use OBS source and state values', async () => {
    const { service, socket } = createConnectedService({ motionEngine: 'auto' });
    try {
        const identify = socket.sent.find(message => message.op === 1);
        assert.equal(
            identify.d.authentication,
            computeObsAuthResponse('fixture-pass', 'fixture-salt', 'fixture-challenge')
        );
        assert.equal(
            identify.d.rpcVersion,
            1
        );
        await flush();
        assert.equal(service.getStatus().connected, true);
        assert.equal(service.getStatus().hasMovePlugin, true);

        await service.animateItemToTarget({
            sceneName: 'Main',
            sourceName: 'Camera',
            sceneItemId: 55,
            target: { x: 10, y: 20, width: 640, height: 360, rotate: 15, visible: true },
            durationMs: 500,
            easing: 'linear'
        });
        const filterCalls = socket.requests.filter(({ requestType }) =>
            ['SetSourceFilterSettings', 'CreateSourceFilter', 'SetSourceFilterEnabled'].includes(requestType));
        assert.ok(filterCalls.length > 0);
        assert.ok(filterCalls.every(({ requestData }) => requestData.sourceName === 'Main'));
        const moveSettings = filterCalls.find(({ requestType }) => requestType === 'SetSourceFilterSettings').requestData.filterSettings;
        assert.equal(moveSettings.source, 'Camera');
        assert.equal(moveSettings.start_trigger, 13);
        assert.equal(moveSettings.enabled_match_moving, false);
        assert.equal(moveSettings.transform, true);
        assert.equal(moveSettings.custom_duration, true);
        assert.deepEqual(moveSettings.scale, { x: 1, y: 1 });
        assert.equal(moveSettings.change_visibility, 0);
        assert.equal(moveSettings.easing_match, 0);

        const firstMoveCount = socket.requests.length;
        await service.animateItemToTarget({
            sceneName: 'Main', sourceName: 'Camera', sceneItemId: 55,
            target: { x: 100, y: 200, width: 640, height: 360, visible: true },
            durationMs: 500, easing: 'spring'
        });
        const repeatedMove = socket.requests.slice(firstMoveCount);
        assert.equal(repeatedMove[1].requestType, 'SetSourceFilterEnabled');
        assert.equal(repeatedMove[1].requestData.filterEnabled, false);
        assert.equal(repeatedMove.find(r => r.requestType === 'SetSourceFilterSettings').requestData.filterSettings.pos.x, 100);
        assert.equal(repeatedMove.find(r => r.requestType === 'SetSourceFilterSettings').requestData.filterSettings.easing_function_match, 10);
        assert.equal(repeatedMove.at(-1).requestData.filterEnabled, true);

        const hideStart = socket.requests.length;
        await service.animateItemToTarget({
            sceneName: 'Main', sourceName: 'Camera', sceneItemId: 55,
            target: { visible: false }, durationMs: 0
        });
        const hiding = socket.requests.slice(hideStart);
        assert.equal(hiding[1].requestData.filterEnabled, false);
        assert.equal(hiding.at(-1).requestData.sceneItemEnabled, false);

        const result = await service.syncOverlayState({
            id: 'fixture',
            elements: [{
                id: 'camera',
                page: '*',
                x: 10,
                y: 20,
                width: 640,
                height: 360,
                visible: true,
                style: { rotate: 5 },
                pageStates: { p2: { style: { rotate: 47 } } },
                obsLink: { enabled: true, sourceName: 'Camera', sceneName: 'Main' }
            }],
            pages: {
                enabled: true,
                items: [{ id: 'p1' }, { id: 'p2' }],
                transition: 'morph'
            }
        }, 'p2', { animate: false });
        assert.equal(result.ok, true);
        const transformCall = socket.requests.filter(({ requestType }) => requestType === 'SetSceneItemTransform').at(-1);
        assert.equal(transformCall.requestData.sceneItemTransform.rotation, 47);
    } finally {
        service.disconnect();
    }
});

test('OBS close code 4006 reports authentication failure without reconnecting', () => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const scheduled = [];
    global.setTimeout = (callback, delay) => {
        const timer = { callback, delay, unref() {} };
        scheduled.push(timer);
        return timer;
    };
    global.clearTimeout = () => {};
    FixtureWebSocket.instances = [];
    const service = createObsService({
        getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 4455 }),
        WebSocketImpl: FixtureWebSocket,
        log: () => {},
        warn: () => {}
    });
    service.connect();
    const socket = FixtureWebSocket.instances.at(-1);
    try {
        socket.emit('close', 4006, Buffer.from('auth failed'));
        assert.match(service.getStatus().lastError, /Authentication failed/);
        assert.equal(scheduled.filter(timer => timer.delay === 4000).length, 0);

        service.disconnect();
        service.connect();
        const nextSocket = FixtureWebSocket.instances.at(-1);
        nextSocket.emit('close', 4009, Buffer.from('unsupported RPC version'));
        assert.doesNotMatch(service.getStatus().lastError, /Authentication failed/);
        assert.equal(scheduled.filter(timer => timer.delay === 4000).length, 1);
        service.disconnect();
    } finally {
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        service.disconnect();
    }
});

test('page-state normalization preserves inherited values instead of coercing nulls to zero', () => {
    const normalized = normalizePageStates({
        p2: { x: null, y: '', width: null, height: '', rotate: null, opacity: null, style: { rotate: 45 } }
    });
    assert.deepEqual(normalized, { p2: { style: { rotate: 45 } } });
});

test('OBS configuration normalization persists bounded, supported settings', () => {
    assert.deepEqual(normalizeObsConfig({
        enabled: true,
        host: '  ',
        port: 70000,
        motionEngine: 'unsupported',
        overlayOffsetMs: -5000
    }), {
        enabled: true,
        host: '127.0.0.1',
        port: 65535,
        password: '',
        syncOnSave: true,
        overlayOffsetMs: -1000,
        leadMs: 120,
        motionEngine: 'auto'
    });
});

test('system config writes OBS settings in normalized form', async () => {
    const configPath = path.join(__dirname, `.obs-config-test-${process.pid}.json`);
    let runtimeConfig;
    fs.writeFileSync(configPath, JSON.stringify({ obs: { enabled: false } }));
    try {
        const handler = createSystemRoutes({
            rootDir: process.cwd(),
            configPath,
            isLoopbackRequest: () => true,
            applyRuntimeConfig: config => { runtimeConfig = config; },
            safeWriteFileSync: (filePath, contents) => fs.writeFileSync(filePath, contents)
        });
        const req = Readable.from([JSON.stringify({
            obs: { enabled: true, host: '  ', port: 70000, motionEngine: 'unsupported' }
        })]);
        req.method = 'PUT';
        const response = {
            writeHead(statusCode) { this.statusCode = statusCode; },
            end(body) { this.body = JSON.parse(body); }
        };
        await handler(req, response, new URL('http://localhost/api/config'), '/api/config');
        const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8')).obs;
        assert.equal(response.statusCode, 200);
        assert.deepEqual(persisted, normalizeObsConfig({
            enabled: true, host: '  ', port: 70000, motionEngine: 'unsupported'
        }));
        assert.deepEqual(runtimeConfig.obs, persisted);
    } finally {
        fs.rmSync(configPath, { force: true });
    }
});

function requestResponse() {
    return {
        writeHead(statusCode) { this.statusCode = statusCode; },
        end(body) { this.body = JSON.parse(body); }
    };
}

function linkedOverlay(x = 100, transitionMs = 50) {
    return {
        elements: [{
            id: 'camera', page: '*', x, y: 20, width: 640, height: 360,
            obsLink: { enabled: true, sourceName: 'Camera', sceneName: 'Main' }
        }],
        pages: { enabled: true, items: [{ id: 'p1' }], transition: 'morph', transitionMs }
    };
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('GET config redacts OBS credentials without changing runtime config or disabling LAN settings', async () => {
    const config = { obs: { enabled: true, password: 'private-fixture', host: 'obs.local' } };
    const handler = createSystemRoutes({ getConfig: () => config, isLoopbackRequest: () => false });
    const response = requestResponse();
    await handler({ method: 'GET' }, response, new URL('http://localhost/api/config'), '/api/config');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.obs.hasPassword, true);
    assert.equal(Object.hasOwn(response.body.obs, 'password'), false);
    assert.ok(!JSON.stringify(response.body).includes('private-fixture'));
    assert.equal(config.obs.password, 'private-fixture');
});

test('OBS config POST preserves omitted passwords, accepts replacements and explicitly clears empty strings', async () => {
    let config = { obs: normalizeObsConfig({ password: 'saved-fixture' }) };
    const handler = createObsRoutes({
        getConfig: () => config,
        saveConfig: update => { config = { ...config, ...update }; },
        obsService: { disconnect() {}, getStatus: () => ({ hasPassword: Boolean(config.obs.password) }) },
        isLoopbackRequest: req => req.local
    });
    for (const [body, expected] of [
        [{ port: 4456 }, 'saved-fixture'],
        [{ password: 'replacement-fixture' }, 'replacement-fixture'],
        [{ password: '' }, '']
    ]) {
        const req = Readable.from([JSON.stringify(body)]);
        Object.assign(req, { method: 'POST', local: true });
        const response = requestResponse();
        await handler(req, response, '/api/obs/config');
        assert.equal(response.statusCode, 200);
        assert.equal(config.obs.password, expected);
        assert.equal(response.body.hasPassword, Boolean(expected));
        assert.equal(Object.hasOwn(response.body, 'password'), false);
    }
    const req = Readable.from(['{"password":"remote-fixture"}']);
    req.method = 'POST';
    const response = requestResponse();
    await handler(req, response, '/api/obs/config');
    assert.equal(response.statusCode, 403);
    assert.equal(config.obs.password, '');
});

test('generic config round trips preserve OBS secrets and restrict only changed OBS settings to loopback', async () => {
    const configPath = path.join(__dirname, `.obs-config-roundtrip-${process.pid}.json`);
    let config = { obs: normalizeObsConfig({ password: 'saved-fixture' }), theme: {} };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const handler = createSystemRoutes({
        configPath,
        getConfig: () => config,
        safeWriteFileSync: (filePath, contents) => fs.writeFileSync(filePath, contents),
        applyRuntimeConfig: next => { config = next; },
        isLoopbackRequest: req => req.local
    });
    async function update(body, local = false) {
        const req = Readable.from([JSON.stringify(body)]);
        Object.assign(req, { method: 'PUT', local });
        const response = requestResponse();
        await handler(req, response, new URL('http://localhost/api/config'), '/api/config');
        return response;
    }
    try {
        const getResponse = requestResponse();
        await handler({ method: 'GET' }, getResponse, new URL('http://localhost/api/config'), '/api/config');
        assert.equal((await update({ obs: getResponse.body.obs, theme: { name: 'fixture' } })).statusCode, 200);
        assert.equal(config.obs.password, 'saved-fixture');
        assert.equal(config.theme.name, 'fixture');
        assert.equal((await update({ obs: { host: 'other.local' }, theme: { name: 'denied' } })).statusCode, 403);
        assert.equal(config.obs.host, '127.0.0.1');
        assert.equal(config.theme.name, 'fixture');
        assert.equal((await update({ obs: { password: 'replacement-fixture' } }, true)).statusCode, 200);
        assert.equal(config.obs.password, 'replacement-fixture');
        assert.equal((await update({ obs: { password: '' } }, true)).statusCode, 200);
        assert.equal(config.obs.password, '');
    } finally {
        fs.rmSync(configPath, { force: true });
    }
});

test('overlapping animations invalidate ownership before visibility or transform-read awaits', async () => {
    for (const heldType of ['SetSceneItemEnabled', 'GetSceneItemTransform']) {
        const { service, socket } = createConnectedService({ motionEngine: 'websocket' });
        await flush();
        const held = [];
        socket.handleRequest = request => {
            if (request.requestType !== heldType) return false;
            held.push(request);
            return true;
        };
        const animate = x => service.animateItemToTarget({
            sceneName: 'Main', sourceName: 'Camera', sceneItemId: 55,
            target: { x, y: 0, width: 640, height: 360, visible: true },
            durationMs: 60
        });
        try {
            const old = animate(-1000).then(() => null, err => err);
            await flush();
            const latest = animate(1000);
            await flush();
            assert.equal(held.length, 2);
            // Resume the newest await first; the older one must never install a timer.
            socket.handleRequest = null;
            socket.respond(held[1]);
            socket.respond(held[0]);
            assert.match((await old).message, /superseded/);
            await latest;
            const writes = socket.requests.filter(request => request.requestType === 'SetSceneItemTransform');
            assert.ok(writes.length > 0);
            assert.ok(writes.every(request => request.requestData.sceneItemTransform.positionX >= 0));
            assert.equal(writes.at(-1).requestData.sceneItemTransform.positionX, 1000);
            const count = socket.requests.length;
            await wait(100);
            assert.equal(socket.requests.length, count);
        } finally {
            service.disconnect();
        }
    }
});

test('newer overlay sync wins even when the older scene-item lookup resolves last', async () => {
    const { service, socket } = createConnectedService({ motionEngine: 'websocket' });
    await flush();
    const held = [];
    socket.handleRequest = request => {
        if (request.requestType !== 'GetSceneItemId') return false;
        held.push(request);
        return true;
    };
    try {
        const old = service.syncOverlayState(linkedOverlay(-1000), 'p1', { animate: false });
        const latest = service.syncOverlayState(linkedOverlay(1000), 'p1', { animate: false });
        assert.equal(held.length, 2);
        socket.respond(held[1]);
        assert.equal((await latest).ok, true);
        socket.respond(held[0]);
        const result = await old;
        assert.equal(result.ok, false);
        assert.match(result.results[0].reason, /superseded/);
        const writes = socket.requests.filter(request => request.requestType === 'SetSceneItemTransform');
        assert.deepEqual(writes.map(request => request.requestData.sceneItemTransform.positionX), [1000]);
    } finally {
        service.disconnect();
    }
});

test('disconnect and socket close invalidate pending animation initialization and delayed hides', async () => {
    for (const close of [service => service.disconnect(), (service, socket) => socket.emit('close', 1000)]) {
        for (const visible of [true, false]) {
            const { service, socket } = createConnectedService({ motionEngine: 'websocket' });
            await flush();
            socket.handleRequest = request => request.requestType === 'GetSceneItemTransform';
            try {
                const animation = service.animateItemToTarget({
                    sceneName: 'Main', sourceName: 'Camera', sceneItemId: 55,
                    target: { x: 100, y: 0, width: 640, height: 360, visible },
                    durationMs: 50
                }).then(() => null, err => err);
                await flush();
                close(service, socket);
                const count = socket.requests.length;
                assert.match((await animation).message, /disconnected|socket closed/);
                await wait(80);
                assert.equal(socket.requests.length, count);
            } finally {
                service.disconnect();
            }
        }
    }
});

test('mandatory transform and visibility rejections fail sync instead of reporting success', async () => {
    for (const [requestType, visible] of [
        ['SetSceneItemTransform', true],
        ['SetSceneItemEnabled', true],
        ['SetSceneItemEnabled', false]
    ]) {
        const { service, socket } = createConnectedService({ motionEngine: 'cut' });
        await flush();
        socket.handleRequest = request => {
            if (request.requestType !== requestType) return false;
            socket.respond(request, 'Fixture write rejected');
            return true;
        };
        try {
            const overlay = linkedOverlay();
            overlay.elements[0].visible = visible;
            const result = await service.syncOverlayState(overlay, 'p1');
            assert.equal(result.ok, false);
            assert.equal(result.synced, 0);
            assert.match(result.results[0].reason, /write rejected/);
        } finally {
            service.disconnect();
        }
    }
});

test('failed transforms never poison the interpolation cache', async () => {
    const { service, socket } = createConnectedService({ motionEngine: 'websocket' });
    await flush();
    socket.handleRequest = request => {
        if (request.requestType !== 'SetSceneItemTransform') return false;
        socket.respond(request, 'Fixture transform rejected');
        return true;
    };
    try {
        assert.equal((await service.syncOverlayState(linkedOverlay(1000), 'p1', { animate: false })).ok, false);
        socket.handleRequest = null;
        const count = socket.requests.length;
        assert.equal((await service.syncOverlayState(linkedOverlay(100, 50), 'p1')).ok, true);
        const writes = socket.requests.slice(count).filter(request => request.requestType === 'SetSceneItemTransform');
        assert.ok(writes.every(request => request.requestData.sceneItemTransform.positionX <= 100));
        assert.equal(writes.at(-1).requestData.sceneItemTransform.positionX, 100);
    } finally {
        service.disconnect();
    }
});

test('streamed sync serializes frames and waits for the final acknowledgement', async () => {
    const { service, socket } = createConnectedService({ motionEngine: 'websocket' });
    await flush();
    const held = [];
    socket.handleRequest = request => {
        if (request.requestType !== 'SetSceneItemTransform') return false;
        held.push(request);
        return true;
    };
    try {
        let settled = false;
        const handler = createObsRoutes({
            obsService: service,
            getCustomOverlays: () => ({ fixture: linkedOverlay(100, 120) }),
            isLoopbackRequest: () => true
        });
        const req = Readable.from(['{"overlayId":"fixture","pageId":"p1"}']);
        req.method = 'POST';
        const response = requestResponse();
        const sync = handler(req, response, '/api/obs/sync').then(() => {
            settled = true;
            return response.body;
        });
        await wait(50);
        assert.equal(held.length, 1);
        assert.equal(settled, false);
        await wait(120);
        assert.equal(held.length, 1, 'no overlapping writes while the previous frame is in flight');
        socket.respond(held[0]);
        await wait(25);
        assert.equal(held.length, 2);
        assert.equal(held[1].requestData.sceneItemTransform.positionX, 100);
        assert.equal(settled, false);
        socket.respond(held[1]);
        assert.equal((await sync).ok, true);
        assert.equal(response.statusCode, 200);
    } finally {
        service.disconnect();
    }
});

test('final streamed transform and delayed hide failures propagate through the OBS route', async () => {
    for (const visible of [true, false]) {
        const { service, socket } = createConnectedService({ motionEngine: 'websocket' });
        await flush();
        socket.handleRequest = request => {
            if (request.requestType !== (visible ? 'SetSceneItemTransform' : 'SetSceneItemEnabled')) return false;
            socket.respond(request, 'Fixture final write rejected');
            return true;
        };
        const overlay = linkedOverlay(100, 1);
        overlay.elements[0].visible = visible;
        const handler = createObsRoutes({
            obsService: service, getCustomOverlays: () => ({ fixture: overlay }), isLoopbackRequest: () => true
        });
        try {
            const req = Readable.from(['{"overlayId":"fixture"}']);
            req.method = 'POST';
            const response = requestResponse();
            await handler(req, response, '/api/obs/sync');
            assert.equal(response.statusCode, 502);
            assert.equal(response.body.synced, 0);
            assert.match(response.body.error, /final write rejected/);
        } finally {
            service.disconnect();
        }
    }
});

test('OBS editor manual sync surfaces HTTP, per-source and network failures and no-link skips', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-main.js'), 'utf8');
    const syncSource = source.slice(source.indexOf('export async function syncObsState('), source.indexOf('export async function snapObsLayer(')).replace('export ', '');
    const handlerSource = source.slice(source.indexOf("    $('obs-sync-now')?.addEventListener"), source.indexOf('    // Overlay Name'));
    const state = { obs: { connected: true }, overlay: linkedOverlay(), curPage: 'p1' };
    let click;
    const toasts = [];
    const context = vm.createContext({
        state, serializeOverlayForSave: () => state.overlay,
        pagesOn: () => state.overlay.pages?.enabled === true,
        statesModeOn: () => state.overlay.pages?.kind === 'states' || (!state.overlay.pages?.kind && state.overlay.pages?.transition === 'morph'),
        $: () => ({ addEventListener: (event, callback) => { click = callback; } }),
        toast: (...args) => toasts.push(args)
    });
    vm.runInContext(syncSource + handlerSource, context);
    for (const response of [
        { ok: false, body: { ok: false, error: 'Rejected transform' } },
        { ok: true, body: { ok: true, results: [{ ok: false, reason: 'Source missing' }] } },
        { ok: true, body: {} },
        null
    ]) {
        context.fetch = async () => {
            if (!response) throw new Error('Network failed');
            return { ok: response.ok, json: async () => response.body };
        };
        await click();
        assert.equal(toasts.at(-1)[1], 'error');
    }
    context.fetch = async () => ({ ok: true, json: async () => ({ ok: true, synced: 1, results: [{ ok: true }] }) });
    await click();
    assert.equal(toasts.at(-1)[1], 'success');
    state.overlay.elements = [];
    await click();
    assert.equal(toasts.at(-1)[1], 'error');
    assert.match(toasts.at(-1)[0], /No linked OBS sources/);
});

test('OBS settings UI keeps blank credentials omitted and exposes explicit password clearing', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-main.js'), 'utf8');
    const functions = source.slice(source.indexOf('export async function openObsModal('), source.indexOf('export async function syncObsState(')).replace(/^export /gm, '');
    const controls = new Map([
        ['obs-cfg-enabled', { checked: false }],
        ['obs-cfg-host', { value: '127.0.0.1' }],
        ['obs-cfg-port', { value: '4455' }],
        ['obs-cfg-engine', { value: 'auto' }],
        ['obs-cfg-sync-save', { checked: true }],
        ['obs-cfg-password', { value: '', parentElement: { after() {} } }]
    ]);
    let password = 'saved-fixture';
    const sent = [];
    const context = vm.createContext({
        state: { obs: { hasPassword: true } },
        $: id => controls.get(id),
        document: {
            createElement: () => ({
                style: {}, append() {},
                set id(value) { controls.set(value, this); }
            }),
            createTextNode: value => value
        },
        refreshObsStatus: async () => {},
        renderObsStatusUI() {}, renderProperties() {}, renderPageBar() {}, toast() {},
        fetch: async (url, options) => {
            const body = JSON.parse(options.body);
            sent.push(body);
            if (Object.hasOwn(body, 'password')) password = body.password;
            return { ok: true, json: async () => ({ status: { hasPassword: Boolean(password) } }) };
        }
    });
    vm.runInContext(functions, context);
    await context.openObsModal();
    assert.equal(controls.get('obs-cfg-password').value, '');
    assert.match(controls.get('obs-cfg-password').placeholder, /Saved/);
    assert.equal(controls.get('obs-cfg-clear-password').checked, false);
    await context.saveAndConnectObs();
    assert.equal(Object.hasOwn(sent.at(-1), 'password'), false);
    controls.get('obs-cfg-password').value = 'replacement-fixture';
    await context.saveAndConnectObs();
    assert.equal(sent.at(-1).password, 'replacement-fixture');
    assert.equal(controls.get('obs-cfg-password').value, '');
    controls.get('obs-cfg-clear-password').checked = true;
    await context.saveAndConnectObs();
    assert.equal(sent.at(-1).password, '');
    assert.equal(password, '');
    assert.equal(controls.get('obs-cfg-clear-password').checked, false);
    assert.doesNotMatch(controls.get('obs-cfg-password').placeholder, /Saved/);
});

test('generic settings consumer never clears a redacted password on an unchanged save', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/system/config-editor.html'), 'utf8');
    const functions = source.slice(source.indexOf('    async function loadConfig('), source.indexOf('    // Tabs switching'));
    const controls = new Map();
    let sent;
    const events = [];
    const context = vm.createContext({
        document: {
            getElementById(id) {
                if (!controls.has(id)) controls.set(id, { value: '', checked: false });
                return controls.get(id);
            }
        },
        window: { dispatchEvent: event => events.push(event) },
        CustomEvent: class { constructor(name, init) { this.detail = init.detail; } },
        console, setTimeout() {},
        clearDirty() {}, updateModuleBadges() {}, showToast() {}, showRestartNotice() {},
        showWeatherStatus() {}, showObsStatus() {}, showBanStatus() {}, showDeletionStatus() {},
        fetch: async (url, options) => {
            if (!options) {
                return { ok: true, json: async () => ({ obs: { enabled: true, hasPassword: true, motionEngine: 'websocket' } }) };
            }
            sent = JSON.parse(options.body);
            return { ok: true, json: async () => ({ status: 'saved' }) };
        }
    });
    vm.runInContext('let loadedConfig;\n' + functions, context);
    await context.loadConfig();
    assert.equal(controls.get('cfg-obs-password').value, '');
    assert.match(controls.get('cfg-obs-password').placeholder, /Saved/);
    assert.equal(controls.get('cfg-obs-engine').value, 'stream');
    await context.saveConfig();
    assert.equal(Object.hasOwn(sent.obs, 'password'), false);
    controls.get('cfg-obs-password').value = 'replacement-fixture';
    await context.saveConfig();
    assert.equal(sent.obs.password, 'replacement-fixture');
    assert.equal(controls.get('cfg-obs-password').value, '');
    assert.equal(Object.hasOwn(events.at(-1).detail.obs, 'password'), false);
    controls.get('cfg-obs-clear-password').checked = true;
    await context.saveConfig();
    assert.equal(sent.obs.password, '');
    assert.equal(events.at(-1).detail.obs.hasPassword, false);
});

test('OBS wiring broadcasts connection, error, capability and scene status through the overlay socket', () => {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const wiring = source.slice(source.indexOf('const obsService = createObsService('), source.indexOf('const broadcastToOverlays ='));
    let onStatusChange;
    const messages = [];
    vm.runInNewContext(wiring, {
        config: { obs: {} },
        console,
        createObsService: options => { onStatusChange = options.onStatusChange; },
        wsService: { broadcastToOverlays: (...args) => messages.push(args) }
    });
    assert.equal(typeof onStatusChange, 'function');
    const status = { connected: true, currentProgramScene: 'Fixture', hasPassword: true };
    onStatusChange(status);
    assert.equal(messages[0][0], 'obs-status');
    assert.equal(messages[0][1], status);
});

test('OBS sync route reports unavailable bridges with a service-unavailable status', async () => {
    const handler = createObsRoutes({
        obsService: {
            getStatus: () => ({ enabled: true, connected: false }),
            syncOverlayState: async () => ({ ok: false, synced: 0, results: [] })
        },
        getCustomOverlays: () => ({ fixture: { id: 'fixture', elements: [] } }),
        isLoopbackRequest: () => true
    });
    const req = Readable.from([JSON.stringify({ overlayId: 'fixture' })]);
    req.method = 'POST';
    const response = {
        writeHead(statusCode) { this.statusCode = statusCode; },
        end(body) { this.body = JSON.parse(body); }
    };
    await handler(req, response, '/api/obs/sync');
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.ok, false);
    assert.match(response.body.error, /not connected/i);
});

test('OBS sync route returns an upstream failure for linked sources that cannot sync', async () => {
    const handler = createObsRoutes({
        obsService: {
            getStatus: () => ({ enabled: true, connected: true }),
            syncOverlayState: async () => ({
                ok: false,
                synced: 0,
                results: [{ ok: false, reason: 'Source not found' }]
            })
        },
        getCustomOverlays: () => ({ fixture: { id: 'fixture', elements: [] } }),
        isLoopbackRequest: () => true
    });
    const req = Readable.from([JSON.stringify({ overlayId: 'fixture' })]);
    req.method = 'POST';
    const response = {
        writeHead(statusCode) { this.statusCode = statusCode; },
        end(body) { this.body = JSON.parse(body); }
    };
    await handler(req, response, '/api/obs/sync');
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.error, 'Source not found');
});
