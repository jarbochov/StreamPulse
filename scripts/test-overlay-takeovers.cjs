const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer');
const { createOverlayService, normalizeCustomOverlay } = require('../server/services/overlays');
const { createOverlayRoutes } = require('../server/routes/overlays');
const { createSsnService } = require('../server/services/ssn');
const { createStaticRouter } = require('../server/static-router');

function fixture(t, options = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-takeovers-'));
    const broadcasts = [];
    const service = createOverlayService({ dataDir, log: () => {}, broadcastToOverlays: (type, data) => broadcasts.push({ type, ...data }) });
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-19T12:00:00Z') });
    const overlay = normalizeCustomOverlay({
        id: 'fixture',
        pages: {
            enabled: true, mode: 'auto', cycleSeconds: 20, loop: true,
            items: [
                ...Array.from({ length: 6 }, (_, i) => ({ id: `base-${i}`, name: `Rotation ${i}` })),
                { id: 'alert', trigger: 'alert' }, { id: 'featured', trigger: 'featured' },
                { id: 'poll', trigger: 'poll-active' },
                { id: 'command', trigger: 'command', triggerName: 'fictional' },
                { id: 'other-command', trigger: 'command', triggerName: 'other' },
                { id: 'other-alert', trigger: 'alert' },
                ...(options.endPage ? [{ id: 'results', trigger: 'poll-end', triggerSeconds: 20 }] : [])
            ]
        },
        elements: [{ type: 'poll', page: 'poll', poll: { resultsSeconds: 20 } }]
    });
    service.setCustomOverlays({ fixture: overlay });
    service.start();
    t.after(() => {
        service.stop();
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
    return {
        service, overlay, broadcasts,
        page: () => service.pageSnapshot(overlay).page,
        clock: ms => t.mock.timers.tick(ms),
        send: (kind, ms, name = '') => service.takeoverPages(kind, name, ms),
        end: (endedAt = new Date().toISOString()) => service.takeoverPages('poll-end', '', 15000, { endedAt })
    };
}

test('alerts interrupt a production-shaped poll page and resume its unexpired results before rotation', t => {
    const f = fixture(t);
    f.send('poll-active', 60000);
    f.clock(5000);
    f.send('command', 10000, 'fictional');
    assert.equal(f.page(), 'poll', 'commands cannot interrupt polls');
    f.send('featured', 10000);
    assert.equal(f.page(), 'featured');
    f.clock(1000);
    f.send('alert', 12000);
    assert.equal(f.page(), 'alert');
    f.clock(5000);
    const ended = new Date().toISOString();
    f.end(ended);
    assert.equal(f.page(), 'alert', 'poll ending does not interrupt an alert');
    f.clock(7000);
    assert.equal(f.page(), 'poll', 'poll results resume after the alert, not the old featured message');
    f.clock(12999);
    assert.equal(f.page(), 'poll');
    f.clock(1);
    assert.equal(f.page(), 'base-0', 'results deadline continues during interruptions');
    f.clock(20000);
    assert.equal(f.page(), 'base-1', 'normal rotation resumes only after pending takeovers finish');
    assert.deepEqual(f.broadcasts.map(b => b.page), ['poll', 'featured', 'alert', 'poll', 'base-0', 'base-1']);
});

test('latest-only pending events expire in wall time and alert skip/clear resumes eligible content', t => {
    const f = fixture(t);
    f.send('poll-active', 60000);
    f.send('alert', 8000);
    f.send('featured', 10000);
    f.clock(2000);
    f.send('featured', 10000);
    f.send('command', 1000, 'fictional');
    f.clock(6000);
    assert.equal(f.page(), 'featured', 'newest featured event has four seconds left');
    f.clock(3999);
    assert.equal(f.page(), 'featured');
    f.clock(1);
    assert.equal(f.page(), 'poll', 'expired commands are discarded, not replayed');
    f.send('alert', 30000);
    f.service.releaseTakeovers('alert');
    assert.equal(f.page(), 'poll', 'skip and clear release alert priority immediately');
    f.clock(1000);
    assert.equal(f.page(), 'poll');
});

test('expired polls never reappear; separate results pages keep poll priority; commands are last', t => {
    const f = fixture(t, { endPage: true });
    f.send('command', 10000, 'fictional');
    assert.equal(f.page(), 'command');
    f.send('poll-active', 10000);
    f.send('featured', 5000);
    f.end();
    assert.equal(f.page(), 'featured', 'separate Poll end pages wait behind featured messages');
    f.clock(5000);
    assert.equal(f.page(), 'results');
    f.send('alert', 30000);
    f.clock(30000);
    assert.equal(f.page(), 'base-0', 'expired result is not resurrected after an alert');
    f.send('command', 2000, 'other');
    assert.equal(f.page(), 'other-command');
    f.clock(2000);
    assert.equal(f.page(), 'base-0');
    assert.ok(!f.broadcasts.some((b, i) => i > 1 && b.page === 'command'), 'interrupted command media is not replayed');
});

test('new polls replace suspended polls, repeated alerts extend without page churn, and manual navigation clears everything', t => {
    const f = fixture(t);
    f.send('poll-active', 1000);
    f.end();
    f.send('alert', 10000);
    f.clock(5000);
    f.send('poll-active', 60000);
    f.send('alert', 10000);
    f.clock(5000);
    assert.equal(f.page(), 'alert');
    f.clock(5000);
    assert.equal(f.page(), 'poll', 'new poll remains resumable after alert replacement');
    assert.equal(f.broadcasts.filter(b => b.page === 'alert').length, 1, 'same-page renewals do not rebuild media');
    f.send('featured', 10000);
    assert.equal(f.service.movePage(f.overlay, 'goto', { target: 'does-not-exist' }), false);
    f.clock(1000);
    assert.equal(f.page(), 'featured', 'invalid navigation cannot silently cancel pending takeovers');
    f.service.movePage(f.overlay, 'goto', { target: 'base-3' });
    f.end();
    f.clock(15000);
    assert.equal(f.page(), 'base-3', 'late poll completion does not hijack a manual page choice');
    f.clock(5000);
    assert.equal(f.page(), 'base-4');
});

test('overlay edits prune invalid pending pages, independent overlays stay separate, and stop clears all timers', t => {
    const f = fixture(t);
    const second = normalizeCustomOverlay({ ...f.overlay, id: 'second' });
    f.service.setCustomOverlays({ fixture: f.overlay, second });
    f.service.syncOverlayPages(second);
    f.send('poll-active', 60000);
    f.send('alert', 5000);
    f.service.movePage(second, 'goto', { target: 'base-2' });
    f.clock(5000);
    assert.equal(f.page(), 'poll');
    assert.equal(f.service.pageSnapshot(second).page, 'base-2', 'manual choice is local to one overlay');
    f.send('alert', 5000);
    f.overlay.pages.items.find(p => p.id === 'poll').enabled = false;
    f.service.syncOverlayPages(f.overlay, f.overlay);
    f.clock(5000);
    assert.equal(f.page(), 'base-0', 'disabled pending poll cannot resume');
    f.send('featured', 10000);
    f.overlay.pages.enabled = false;
    f.service.syncOverlayPages(f.overlay, f.overlay);
    assert.equal(f.page(), 'base-0', 'turning off pages releases current and pending triggers');
    f.service.stop();
    f.broadcasts.length = 0;
    f.clock(120000);
    assert.deepEqual(f.broadcasts, [], 'stop removes every scheduler and rotation timeout');
});

test('real overlay mounts an alert before playback and resumes live poll rendering over WebSocket', { timeout: 30000 }, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-live-takeovers-'));
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    let wss;
    const broadcast = (type, data) => {
        for (const socket of wss?.clients || []) socket.send(JSON.stringify({ type, data }));
    };
    const service = createOverlayService({ dataDir, log: () => {}, broadcastToOverlays: broadcast });
    const overlay = normalizeCustomOverlay({
        id: 'fixture', canvas: { width: 400, height: 150 },
        pages: { enabled: true, transition: 'fade', transitionMs: 50, items: [
            { id: 'base' }, { id: 'poll', trigger: 'poll-active' }, { id: 'alert', trigger: 'alert' }
        ] },
        elements: [
            { id: 'base-layer', type: 'text', page: 'base', content: 'Fictional base' },
            { id: 'poll-layer', type: 'poll', page: 'poll', width: 400, height: 150, poll: { previewMode: 'live', resultsSeconds: 20 } },
            { id: 'alert-layer', type: 'alert', page: 'alert', width: 400, height: 150 }
        ]
    });
    let poll = { id: 'fictional', title: 'Which route?', status: 'ACTIVE', duration: 60, startedAt: new Date().toISOString(),
        choices: [{ id: 'one', title: 'River', votes: 4 }, { id: 'two', title: 'Forest', votes: 8 }] };
    service.setCustomOverlays({ fixture: overlay });
    service.start();
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            if (url.pathname === '/api/custom-overlays/fixture') res.end(JSON.stringify(overlay));
            else if (url.pathname === '/api/custom-overlays/fixture/page') res.end(JSON.stringify(service.pageSnapshot(overlay)));
            else if (url.pathname === '/api/status') res.end(JSON.stringify({ poll }));
            else res.end('{}');
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    wss = new WebSocketServer({ server });
    let browser;
    t.after(async () => {
        service.stop();
        if (browser) await browser.close();
        for (const socket of wss.clients) socket.terminate();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (new URL(request.url()).origin === origin) request.continue();
        else request.abort();
    });
    await page.goto(origin + '/custom-overlay.html?id=fixture');
    await page.waitForSelector('[data-element-id="base-layer"]');
    await page.evaluate(() => {
        window.played = [];
        const play = window.OverlayShared.playAlert;
        window.OverlayShared.playAlert = (node, element, payload, options) => {
            window.played.push({ id: element.id, connected: node.isConnected });
            return play(node, element, payload, options);
        };
    });
    service.takeoverPages('poll-active', '', 60000);
    await page.waitForSelector('.sp-poll');
    await page.waitForFunction(() => !document.querySelector('[data-element-id="base-layer"]'));
    const payload = await page.evaluate(() => ({ ...window.OverlayShared.alertSample({ alert: {} }), durationMs: 800, animIn: 'none', animOut: 'none', sound: '' }));
    service.takeoverPages('alert', '', payload.durationMs);
    broadcast('alert', payload);
    await page.waitForFunction(() => window.played.length === 1);
    assert.deepEqual(await page.evaluate(() => window.played), [{ id: 'alert-layer', connected: true }]);
    poll = { ...poll, status: 'COMPLETED', endedAt: new Date().toISOString() };
    service.takeoverPages('poll-end', '', 15000, poll);
    broadcast('poll-update', poll);
    assert.equal(service.pageSnapshot(overlay).page, 'alert', 'completion waits for the running alert');
    await page.waitForFunction(() => document.querySelector('.sp-poll-footer')?.textContent.includes('Results'));
    await page.waitForFunction(() => !document.querySelector('[data-element-id="alert-layer"]'));
    assert.equal(service.pageSnapshot(overlay).page, 'poll');
    assert.equal(await page.evaluate(() => window.played.length), 1, 'returning to poll never replays the alert');
    assert.equal(await page.$eval('.sp-poll', node => getComputedStyle(node.parentNode).visibility), 'visible');
    assert.deepEqual(errors, []);
});

test('HTTP action trigger activates featured message takeover and returns page snapshot', async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-trigger-http-'));
    const service = createOverlayService({ dataDir, log: () => {} });
    const overlay = normalizeCustomOverlay({
        id: 'feat-overlay',
        pages: {
            enabled: true, mode: 'auto', cycleSeconds: 20, loop: true,
            items: [
                { id: 'home', name: 'Home' },
                { id: 'featured-page', name: 'Featured Message', trigger: 'featured', triggerSeconds: 5 }
            ]
        }
    });
    service.setCustomOverlays({ 'feat-overlay': overlay });
    service.start();

    const handleRoutes = createOverlayRoutes({
        overlayService: service,
        getCustomOverlays: () => service.getCustomOverlays()
    });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        await handleRoutes(req, res, url, url.pathname);
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    t.after(async () => {
        service.stop();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    // Verify initial rotation page
    assert.equal(service.pageSnapshot(overlay).page, 'home');

    // Trigger takeover via HTTP API
    const res = await fetch(`http://127.0.0.1:${port}/api/custom-overlays/feat-overlay/page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger', kind: 'featured' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.page, 'featured-page');
    assert.equal(service.pageSnapshot(overlay).page, 'featured-page');
});

test('SSN listener ingests featured messages from channel 2 (plain and wrapped) and channel 4 clicks', { timeout: 10000 }, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ssn-featured-'));
    const relay = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(relay, 'listening');
    const takeovers = [];
    let ch2Socket, ch4Socket;

    relay.on('connection', socket => {
        socket.on('message', raw => {
            const parsed = JSON.parse(raw);
            if (parsed.in === 2) ch2Socket = socket;
            if (parsed.in === 4) ch4Socket = socket;
        });
    });

    const ssnService = createSsnService({
        dataDir,
        getSsnSessionId: () => 'TestRoom',
        getSsnServer: () => `ws://127.0.0.1:${relay.address().port}`,
        takeoverPages: (kind, name, dur) => takeovers.push({ kind, name, dur }),
        log: () => {}, warn: () => {}, error: () => {}
    });

    t.after(async () => {
        ssnService.disconnectSSN();
        relay.clients.forEach(s => s.terminate());
        await new Promise(resolve => relay.close(resolve));
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    ssnService.connectSSN();
    ssnService.connectFeaturedListener();

    // Wait for both channel handshakes
    for (let i = 0; i < 50 && (!ch2Socket || !ch4Socket); i++) {
        await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(ch2Socket, 'Channel 2 (featured) socket joined');
    assert.ok(ch4Socket, 'Channel 4 (chat) socket joined');

    // Test 1: Channel 2 receives wrapped overlayNinja payload with clicked: true
    ch2Socket.send(JSON.stringify({
        overlayNinja: { chatname: 'Alice', chatmessage: 'Featured message 1', clicked: true }
    }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(takeovers.length, 1);
    assert.equal(takeovers[0].kind, 'featured');

    // Test 2: Channel 2 receives unwrapped payload without clicked property
    ch2Socket.send(JSON.stringify({
        chatname: 'Bob', chatmessage: 'Featured message 2'
    }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(takeovers.length, 2);
    assert.equal(takeovers[1].kind, 'featured');

    // Test 3: Channel 2 receives content wrapper
    ch2Socket.send(JSON.stringify({
        content: { chatname: 'Carol', chatmessage: 'Featured message 3' }
    }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(takeovers.length, 3);
    assert.equal(takeovers[2].kind, 'featured');

    // Test 4: Channel 4 receives clicked chat message from dock
    ch4Socket.send(JSON.stringify({
        overlayNinja: { chatname: 'Dan', chatmessage: 'Clicked from dock', clicked: true }
    }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(takeovers.length, 4);
    assert.equal(takeovers[3].kind, 'featured');

    // Test 5: Channel 4 receives regular chat message (no click, no featured) -> should NOT trigger takeover
    ch4Socket.send(JSON.stringify({
        overlayNinja: { chatname: 'Eve', chatmessage: 'Just a regular message' }
    }));
    await new Promise(r => setTimeout(r, 50));
    assert.equal(takeovers.length, 4, 'Regular chat messages do not trigger takeover');
});
