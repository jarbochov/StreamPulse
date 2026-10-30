const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once, EventEmitter } = require('node:events');
const { test } = require('node:test');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const { createOverlayWsServer } = require('../server/ws');
const { createStaticRouter } = require('../server/static-router');

class FixtureSocket extends EventEmitter {
    readyState = WebSocket.OPEN;
    bufferedAmount = 0;
    sent = [];
    pings = 0;
    autoPong = true;
    stalled = false;
    send(message) {
        this.sent.push(message);
        if (this.stalled) this.bufferedAmount += Buffer.byteLength(message);
    }
    ping() {
        this.pings++;
        if (this.autoPong) this.emit('pong');
    }
    terminate() {
        this.readyState = WebSocket.CLOSED;
    }
}

test('slow sockets have bounded queues, dead peers expire and idle shutdown clears heartbeats', t => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const live = createOverlayWsServer({ log: () => {} });
    t.after(() => live.closeAllConnections());
    let serializations = 0;
    const payload = { toJSON() { serializations++; return { text: 'x'.repeat(1024 * 1024) }; } };
    live.broadcastToOverlays('poll-tournament-update', payload);
    assert.equal(serializations, 0, 'no allocation-heavy serialization without subscribers');
    const healthy = new FixtureSocket();
    const slow = new FixtureSocket();
    slow.stalled = true;
    live.setupConnection(healthy);
    live.setupConnection(slow);
    for (let i = 0; i < 20; i++) live.broadcastToOverlays('poll-tournament-update', payload);
    assert.equal(slow.readyState, WebSocket.CLOSED, 'slow peer is disconnected instead of retaining every bracket update');
    assert.ok(slow.bufferedAmount < 6 * 1024 * 1024, 'queued bytes stop growing after crossing the high-water mark');
    assert.equal(healthy.sent.filter(message => JSON.parse(message).type === 'poll-tournament-update').length, 20);
    assert.equal(live.getClientCount(), 1, 'closed peer is released even before a close event');

    const dead = new FixtureSocket();
    dead.autoPong = false;
    live.setupConnection(dead);
    dead.emit('message', JSON.stringify({ type: 'slideshow-state', id: 'fixture', element: 'slides', count: 2 }));
    t.mock.timers.tick(30000);
    assert.equal(dead.pings, 1);
    t.mock.timers.tick(30000);
    assert.equal(dead.readyState, WebSocket.CLOSED);
    assert.equal(live.getSlideshowStates().size, 0, 'expired peer releases slideshow state');
    t.mock.timers.tick(90000);
    assert.equal(live.getClientCount(), 1, 'responsive idle browser remains connected');
    const pings = healthy.pings;
    live.closeAllConnections();
    t.mock.timers.tick(120000);
    assert.equal(healthy.pings, pings, 'shutdown leaves no heartbeat activity');
    assert.equal(live.getClientCount(), 0);
});

test('slideshow reports remain bounded and reconnect cleanup preserves the latest reporter', () => {
    const live = createOverlayWsServer({ log: () => {} });
    try {
        const first = new FixtureSocket();
        const second = new FixtureSocket();
        live.setupConnection(first);
        for (let i = 0; i < 5000; i++) {
            first.emit('message', JSON.stringify({ type: 'slideshow-state', id: 'fixture', element: `slides-${i}`, count: 2 }));
        }
        assert.ok(live.getSlideshowStates().size <= 256, 'unique element reports cannot grow forever on one connection');
        first.emit('message', JSON.stringify({ type: 'slideshow-state', id: 'fixture', element: 'slides-0', position: 17, count: 20 }));
        assert.equal(live.getSlideshowStates().get('fixture::slides-0').position, 17, 'existing reports still update at capacity');
        live.setupConnection(second);
        second.emit('message', JSON.stringify({ type: 'slideshow-state', id: 'fixture', element: 'slides-0', position: 1, count: 2 }));
        first.emit('close');
        assert.equal(live.getSlideshowStates().size, 1);
        assert.equal(live.getSlideshowStates().get('fixture::slides-0').position, 1);
        second.emit('error', new Error('fixture transport failure'));
        assert.equal(live.getClientCount(), 0);
        assert.equal(live.getSlideshowStates().size, 0);
    } finally {
        live.closeAllConnections();
    }
});

test('inbound live reports are size-limited without limiting outgoing snapshots', async t => {
    const server = http.createServer();
    const snapshotBytes = 5 * 1024 * 1024;
    const live = createOverlayWsServer({ server, getChatData: () => ({ message: 'x'.repeat(snapshotBytes) }), log: () => {} });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    client.on('error', () => {});
    t.after(async () => {
        client.terminate();
        live.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    const initialMessages = [];
    client.on('message', raw => initialMessages.push(JSON.parse(raw)));
    const initialized = new Promise(resolve => client.on('message', raw => {
        if (JSON.parse(raw).type === 'timers-snapshot') resolve();
    }));
    const snapshot = once(client, 'message');
    await once(client, 'open');
    assert.equal(JSON.parse((await snapshot)[0]).data.message.length, snapshotBytes);
    await initialized;
    assert.equal(live.getClientCount(), 1, 'a large initial snapshot does not cause a reconnect loop on a healthy client');
    assert.ok(initialMessages.some(message => message.type === 'viewer-update'));
    const closed = once(client, 'close');
    client.send('x'.repeat(128 * 1024));
    const [code] = await closed;
    assert.equal(code, 1009, 'oversized incoming messages close cleanly without an unhandled server error');
    assert.equal(live.getClientCount(), 0);
});

test('source count excludes generic live sockets, embedded previews and extra runtime sockets', async () => {
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        const fixtures = {
            '/api/config': { music: { enabled: false }, theme: {} },
            '/api/status': { overlayClients: live.getSourceCount(), websocketClients: live.getClientCount() },
            '/api/randomizer/presets': { presets: [] },
            '/api/music/now-playing': { state: 'stopped' },
            '/api/music/overlay': { visible: true }
        };
        if (Object.hasOwn(fixtures, url.pathname)) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(fixtures[url.pathname]));
        } else if (url.pathname === '/fixture.html') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><script src="/overlay-visibility.js" data-key="fixture"></script>');
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const live = createOverlayWsServer({ server, log: () => {} });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const clients = [];
    let browser;
    try {
        for (let i = 0; i < 3; i++) {
            const ws = new WebSocket(origin.replace('http:', 'ws:'));
            clients.push(ws);
            await once(ws, 'open');
        }
        assert.equal(live.getClientCount(), 3);
        assert.equal(live.getSourceCount(), 0, 'three dashboard/editor/runtime sockets are not three overlay sources');
        clients[0].send(JSON.stringify({ type: 'overlay-source', key: 'fixture' }));
        clients[0].send(JSON.stringify({ type: 'overlay-source', key: 'fixture' }));
        clients[0].send('not json');
        clients[0].send(JSON.stringify({ type: 'slideshow-state', id: 'fixture', element: 'slides', count: 2 }));
        await new Promise(resolve => {
            clients[0].ping();
            clients[0].once('pong', resolve);
        });
        assert.equal(live.getSourceCount(), 1, 'registration repeats and slideshow reports do not inflate counts');
        assert.equal(live.getSlideshowStates().size, 1, 'existing live reporting is preserved');
        const closed = once(clients[0], 'close');
        clients[0].close();
        await closed;
        assert.equal(live.getSourceCount(), 0);

        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const errors = [];
        const pages = [];
        async function open(route) {
            const page = await browser.newPage();
            pages.push(page);
            page.on('pageerror', err => errors.push(err.message));
            await page.setRequestInterception(true);
            page.on('request', request => {
                if (new URL(request.url()).origin === origin) request.continue();
                else request.respond({ status: 200, body: '' });
            });
            await page.goto(origin + route);
            return page;
        }
        async function count(page, expected) {
            try {
                await page.waitForFunction(async expected =>
                    (await (await fetch('/api/status')).json()).overlayClients === expected, { timeout: 5000, polling: 50 }, expected);
            } catch (error) {
                assert.fail(`Expected ${expected} sources, got ${live.getSourceCount()} of ${live.getClientCount()} sockets. Browser errors: ${errors.join('; ')}. ${error.message}`);
            }
        }
        const fixture = await open('/fixture.html');
        await count(fixture, 1);
        await open('/fixture.html?preview=true');
        await fixture.evaluate(() => {
            const frame = document.createElement('iframe');
            frame.src = '/fixture.html';
            document.body.appendChild(frame);
        });
        await fixture.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.readyState === 'complete');
        await count(fixture, 1);
        await open('/music.html');
        await count(fixture, 2);
        await open('/randomizer.html?mode=deck');
        await count(fixture, 3);
        await open('/music.html?preview=true');
        await open('/randomizer.html?preview=true');
        await count(fixture, 3);
        assert.ok(live.getClientCount() > live.getSourceCount(), 'transport sockets remain available separately');
        for (const page of pages) await page.close();
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        clients.forEach(ws => ws.terminate());
        live.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
    assert.equal(live.getSourceCount(), 0);
    assert.equal(live.getClientCount(), 0);
    assert.equal(live.getSlideshowStates().size, 0);
});
