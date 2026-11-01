'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');

const {
    computeObsAuthResponse,
    createObsService,
    normalizeObsConfig
} = require('../server/services/obs');
const { normalizePageStates } = require('../server/services/overlays');
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
        if (message.op !== 6) return;
        this.requests.push(message.d);
        const responseData = this.responseFor(message.d.requestType);
        this.emit('message', JSON.stringify({
            op: 7,
            d: {
                requestId: message.d.requestId,
                requestStatus: { result: true, code: 100 },
                responseData
            }
        }));
    }

    responseFor(requestType) {
        if (requestType === 'GetVersion') return { obsVersion: '31.0', obsWebSocketVersion: '5.5' };
        if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' };
        if (requestType === 'GetSourceFilterKindList') return { sourceFilterKinds: ['move_source_filter'] };
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
            durationMs: 500
        });
        const filterCalls = socket.requests.filter(({ requestType }) =>
            ['SetSourceFilterSettings', 'CreateSourceFilter', 'SetSourceFilterEnabled'].includes(requestType));
        assert.ok(filterCalls.length > 0);
        assert.ok(filterCalls.every(({ requestData }) => requestData.sourceName === 'Camera'));

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
        motionEngine: 'unsupported'
    }), {
        enabled: true,
        host: '127.0.0.1',
        port: 65535,
        password: '',
        syncOnSave: true,
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
