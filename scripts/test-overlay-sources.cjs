const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const { createOverlayWsServer } = require('../server/ws');
const { createStaticRouter } = require('../server/static-router');

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
