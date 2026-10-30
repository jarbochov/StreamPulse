const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer');
const { createSsnService } = require('../server/services/ssn');
const createChatbot = require('../server/services/chatbot');
const { createSystemRoutes } = require('../server/routes/system');
const { createStaticRouter } = require('../server/static-router');
const { readRequestBody } = require('../server/routes/helpers');

const quiet = () => {};
const rootDir = path.resolve(__dirname, '..');

test('unconfigured SSN never opens either socket; real IDs still join both channels', { timeout: 10000 }, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ssn-'));
    const relay = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(relay, 'listening');
    let id;
    const warnings = [];
    const joins = [];
    const ready = new Promise(resolve => {
        relay.on('connection', socket => socket.on('message', raw => {
            joins.push(JSON.parse(raw));
            if (joins.length === 2) resolve();
        }));
    });
    let connections = 0;
    relay.on('connection', () => connections++);
    const service = createSsnService({
        dataDir, getSsnSessionId: () => id,
        getSsnServer: () => `ws://127.0.0.1:${relay.address().port}`,
        log: quiet, warn: message => warnings.push(message), error: quiet
    });
    t.after(async () => {
        service.disconnectSSN();
        relay.clients.forEach(socket => socket.terminate());
        await new Promise(resolve => relay.close(resolve));
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
    for (id of [undefined, '', '  ', 'YOUR_SSN_SESSION_ID', ' your_ssn_session_id ', 'bad/session']) {
        service.connectSSN();
        service.connectFeaturedListener();
        service.scheduleSSNReconnect();
        assert.deepEqual(service.getSsnStatus(), { connected: false, session: null });
        assert.equal(service.getSsnSocket(), null);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(connections, 0);
    assert.ok(warnings.every(message => message.includes('chat collection disabled')));
    id = ' Fixture_Room-42 ';
    service.connectSSN();
    service.connectFeaturedListener();
    await ready;
    assert.equal(connections, 2);
    assert.deepEqual(joins.sort((a, b) => a.in - b.in), [
        { join: 'Fixture_Room-42', in: 2, out: 9 },
        { join: 'Fixture_Room-42', in: 4, out: 3 }
    ]);
    assert.deepEqual(service.getSsnStatus(), { connected: true, session: 'configured' });
});

test('SSN config and bot APIs reject examples and allow clearing a configured ID', async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-config-'));
    const configPath = path.join(dataDir, 'config.json');
    let config = { ssn: { session_id: 'YOUR_SSN_SESSION_ID' } };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const system = createSystemRoutes({
        configPath, getConfig: () => config,
        safeWriteFileSync: fs.writeFileSync,
        applyRuntimeConfig: value => { config = value; }
    });
    const bot = createChatbot({ dataDir, getConfig: () => config });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/chatbot')) {
            await bot.handleApi(req, res, url.pathname, readRequestBody);
        } else {
            await system(req, res, url, url.pathname);
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        bot.stop();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const update = id => fetch(`${origin}/api/config`, {
        method: 'PUT', body: JSON.stringify({ ssn_session_id: id })
    });
    let response = await fetch(`${origin}/api/config`);
    const initial = await response.json();
    assert.equal(initial.connection.ssn_session_configured, false);
    assert.equal(initial.connection.ssn_session_id, '');
    response = await update('YOUR_SSN_SESSION_ID');
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Replace the example/);
    assert.equal(config.ssn.session_id, 'YOUR_SSN_SESSION_ID');
    config.ssn.session_id = ' your_ssn_session_id ';
    response = await fetch(`${origin}/api/chatbot`);
    assert.equal((await response.json()).ssnConfigured, false);
    response = await fetch(`${origin}/api/chatbot/send`, { method: 'POST', body: JSON.stringify({ text: 'fixture' }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /session ID is not set/);
    response = await update(' Fixture_Room-42 ');
    assert.equal(response.status, 200);
    assert.equal(config.ssn.session_id, 'Fixture_Room-42');
    response = await fetch(`${origin}/api/config`);
    assert.equal((await response.json()).connection.ssn_session_configured, true);
    response = await update('YOUR_custom-room');
    assert.equal(response.status, 200, 'custom room names are not mistaken for the example');
    response = await update('   ');
    assert.equal(response.status, 200);
    assert.equal(config.ssn.session_id, '');
    assert.equal(JSON.parse(fs.readFileSync(configPath)).ssn.session_id, '');
});

test('dashboard defaults form ordered rows before scripts, after load, and after reset', { timeout: 60000 }, async t => {
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(req.url.startsWith('/api/status') ? {
                ssn: { connected: false, session: null }, overlayClients: 0,
                memory: { rss: 200 * 1048576, heapUsed: 40 * 1048576, heapTotal: 80 * 1048576 },
                topChatters: [{ chatname: 'FixtureChatter', messageCount: 1 }],
                hourlyMessages: { '2026-10-19T12': 3 }
            } : req.url.startsWith('/api/custom-overlays') ? [] : {}));
        } else if (!router.handleRequest(req, res)) {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    });
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (new URL(req.url()).origin === origin) req.continue();
        else req.respond({ status: 200, body: '' });
    });
    const boxes = () => page.$$eval('#dashboard-grid > .card', cards => cards.map(card => {
        const { x, y, width, height } = card.getBoundingClientRect();
        return { id: card.dataset.panelId, x, y, width, height, hidden: card.hidden };
    }));
    function checkRows(cards, mobile = false) {
        assert.deepEqual(cards.slice(0, 2).map(card => card.id), ['server-status', 'quick-actions']);
        if (mobile) {
            for (let i = 1; i < cards.length; i++) {
                assert.ok(cards[i].y > cards[i - 1].y);
                assert.ok(Math.abs(cards[i].width - cards[0].width) < 1);
            }
        } else {
            for (let i = 0; i < cards.length; i += 2) {
                assert.equal(cards[i].y, cards[i + 1].y, `${cards[i].id} pair shares a row`);
                assert.ok(Math.abs(cards[i].height - cards[i + 1].height) < 1, `${cards[i].id} pair aligns in height`);
                if (i) assert.ok(cards[i].y > cards[i - 1].y);
            }
        }
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setJavaScriptEnabled(false);
    await page.goto(`${origin}/dashboard.html`);
    checkRows(await boxes());
    await page.setJavaScriptEnabled(true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('ssn-status').textContent === 'Not configured');
    assert.equal(await page.$eval('#memory', element => element.textContent), '200 MB');
    assert.equal(await page.$eval('#memory-heap', element => element.textContent), '40 / 80 MB');
    checkRows(await boxes());
    for (const width of [900, 390]) {
        await page.setViewport({ width, height: 900 });
        await page.waitForFunction(expected => {
            const card = document.querySelector('[data-panel-id="server-status"]');
            return getComputedStyle(card).gridColumnStart === `span ${expected}`;
        }, {}, width === 390 ? 12 : 6);
        checkRows(await boxes(), width === 390);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluate(() => {
        window.localStorage.setItem('streampulse.dashboard.layout.v2', JSON.stringify({ order: ['music', 'server-status'] }));
        window.localStorage.setItem('streampulse.dashboard.layout.v3', JSON.stringify({
            order: ['music', 'server-status', 'quick-actions'],
            spans: { music: 12 }, heights: { music: 300 }, hidden: ['goals'], compact: true
        }));
    });
    await page.reload();
    let cards = await boxes();
    assert.equal(cards[0].id, 'music', 'saved custom order is preserved');
    assert.ok(cards[0].height >= 300, 'saved height is preserved');
    assert.ok(cards[0].width > cards[1].width, 'saved full-width span is preserved');
    assert.equal(cards.find(card => card.id === 'goals').hidden, true);
    await page.evaluate(() => { window.StreamPulse.confirm = async () => true; });
    await page.click('#reset-btn');
    await page.waitForFunction(() => document.querySelector('#dashboard-grid > .card').dataset.panelId === 'server-status');
    await page.reload();
    checkRows(await boxes());
    assert.equal(await page.evaluate(() => window.localStorage.getItem('streampulse.dashboard.layout.v2')), null);
    assert.deepEqual(errors, []);
});
