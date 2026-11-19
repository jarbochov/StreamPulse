'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const http = require('node:http');
const puppeteer = require('puppeteer');
const staticRouter = require('../server/static-router');
const { createTimerService } = require('../server/services/timers');
const { createTimersRoutes } = require('../server/routes/timers');
const { createOperatorService, slugifyProfileId } = require('../server/services/operator');
const { createOperatorRoutes } = require('../server/routes/operator');
const createVariablesStore = require('../server/services/variables');

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(status, headers = {}) {
            this.statusCode = status;
            this.headers = headers;
        },
        end(chunk = '') {
            this.body += chunk;
        },
        json() {
            return JSON.parse(this.body || '{}');
        }
    };
}

function createMockReq(method, urlStr, bodyObj = null) {
    const raw = bodyObj !== null ? JSON.stringify(bodyObj) : '';
    const listeners = {};
    return {
        method,
        url: urlStr,
        headers: { host: 'localhost:3000' },
        on(event, fn) {
            listeners[event] = fn;
            if (event === 'end') {
                setImmediate(() => {
                    if (raw && listeners.data) listeners.data(Buffer.from(raw));
                    fn();
                });
            }
        },
        destroy() {}
    };
}

test('Operator Service manages presets, switching, import/export, validation, and reload', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-svc-'));
    const broadcasts = [];
    const svc = createOperatorService({
        dataDir: tmpDir,
        broadcastToOverlays: (type, data) => broadcasts.push({ type, data })
    });

    // Default seeded state
    const initial = svc.getState();
    assert.equal(initial.activeProfileId, 'default');
    assert.equal(initial.profiles.length, 1);
    assert.equal(initial.profiles[0].name, 'Main Show');

    // Cannot delete last remaining profile
    assert.throws(() => svc.deleteProfile('default'), /last remaining/i);

    // Upsert & activate second preset
    const gameplay = svc.upsertProfile({
        name: 'Gameplay Mode',
        description: 'Live timers and overlays',
        board: {
            columns: 2,
            cards: [
                { type: 'timers-list', title: 'Race Clocks', span: 2 },
                { type: 'overlay-control', title: 'HUD', config: { overlayId: 'hud-main' } }
            ]
        },
        overlays: ['hud-main', 'hud-main', 'credits-bar'],
        tabs: { hidden: ['music'] }
    }, { activate: true });

    assert.equal(gameplay.id, 'gameplay-mode');
    assert.deepEqual(gameplay.overlays, ['hud-main', 'credits-bar']);
    assert.equal(gameplay.board.columns, 2);
    assert.equal(gameplay.board.cards.length, 2);
    assert.equal(svc.getActiveProfile().id, 'gameplay-mode');
    assert.ok(broadcasts.some(b => b.type === 'operator-active-profile' && b.data.activeProfileId === 'gameplay-mode'));

    // Activate by case-insensitive name (Companion-friendly)
    const back = svc.setActiveProfile('main show');
    assert.equal(back.id, 'default');

    // Export single & full
    const exportedSingle = svc.exportState('gameplay-mode');
    assert.equal(exportedSingle.format, 'streampulse-operator-profiles');
    assert.equal(exportedSingle.profiles.length, 1);

    // Delete gameplay-mode then restore via merge import
    const delRes = svc.deleteProfile('gameplay-mode');
    assert.equal(delRes.deleted, 'gameplay-mode');
    assert.equal(svc.listProfiles().length, 1);

    const impMerge = svc.importState(exportedSingle, { mode: 'merge' });
    assert.equal(impMerge.importedCount, 1);
    assert.equal(svc.listProfiles().length, 2);

    // Replace import
    const impReplace = svc.importState({
        activeProfileId: 'talk-show',
        profiles: [{ id: 'talk-show', name: 'Talk Show', board: { columns: 4, cards: [] }, overlays: ['podcast-overlay'] }]
    }, { mode: 'replace' });
    assert.equal(impReplace.mode, 'replace');
    assert.equal(svc.listProfiles().length, 1);
    assert.equal(svc.getActiveProfile().id, 'talk-show');

    // Reload from disk (backup restore behavior)
    const freshSvc = createOperatorService({ dataDir: tmpDir });
    assert.equal(freshSvc.getActiveProfile().name, 'Talk Show');
    fs.writeFileSync(path.join(tmpDir, 'operator-profiles.json'), JSON.stringify({
        version: 1,
        activeProfileId: 'restored',
        profiles: [{ id: 'restored', name: 'Restored Board', board: { columns: 3, cards: [] }, overlays: [] }]
    }));
    svc.reload();
    assert.equal(svc.getActiveProfile().id, 'restored');
    assert.equal(slugifyProfileId('My Cool Scene!'), 'my-cool-scene');

    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Operator Routes handle REST + Companion GET triggers and validation errors', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-routes-'));
    const svc = createOperatorService({ dataDir: tmpDir });
    const handle = createOperatorRoutes({ operatorService: svc });

    const call = async (method, pathAndQuery, body = null) => {
        const url = new URL(`http://localhost:3000${pathAndQuery}`);
        const req = createMockReq(method, pathAndQuery, body);
        const res = createMockRes();
        const handled = await handle(req, res, url, url.pathname);
        return { handled, status: res.statusCode, json: res.json(), headers: res.headers };
    };

    // Unrelated path returns false
    const ignored = await call('GET', '/api/timers');
    assert.equal(ignored.handled, false);

    // Status summary
    const st = await call('GET', '/api/operator/status');
    assert.equal(st.handled, true);
    assert.equal(st.status, 200);
    assert.equal(st.json.activeProfileName, 'Main Show');

    // POST create + select
    const created = await call('POST', '/api/operator/profiles?select=1', {
        name: 'Stream Deck Ops',
        board: { columns: 3, cards: [{ type: 'alerts-queue', title: 'Alerts' }] },
        overlays: ['ov-1']
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.activeProfileId, 'stream-deck-ops');

    // Companion GET /api/operator/profile/select?id=default
    const compSel = await call('GET', '/api/operator/profile/select?id=default');
    assert.equal(compSel.status, 200);
    assert.equal(compSel.json.activeProfileId, 'default');

    // Companion GET /api/operator/profiles/:id/activate
    const act = await call('GET', '/api/operator/profiles/stream-deck-ops/activate');
    assert.equal(act.status, 200);
    assert.equal(act.json.activeProfileId, 'stream-deck-ops');

    // Export download header check
    const exp = await call('GET', '/api/operator/export?download=1');
    assert.equal(exp.status, 200);
    assert.match(exp.headers['Content-Disposition'] || '', /attachment;/);

    // 404 on unknown profile
    const missing = await call('GET', '/api/operator/profiles/does-not-exist');
    assert.equal(missing.status, 404);

    // DELETE created profile falls back to default cleanly
    const del = await call('DELETE', '/api/operator/profiles/stream-deck-ops');
    assert.equal(del.status, 200);
    assert.equal(del.json.activeProfileId, 'default');

    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Operator Mode loads real timers keyed-object /api/timers snapshot in browser and controls timer', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-timers-'));
    const timerSvc = createTimerService({ dataDir: tmpDir });
    timerSvc.upsertTimer({ id: 'show-break', label: 'Intermission Break', kind: 'countdown', mode: 'duration', durationMs: 300000 });
    timerSvc.upsertTimer({ id: 'split-clock', label: 'Chapter Split', kind: 'stopwatch' });

    const opSvc = createOperatorService({ dataDir: tmpDir });
    opSvc.upsertProfile({
        id: 'default',
        name: 'Main Show',
        board: { columns: 2, cards: [{ id: 'c-timers', type: 'timers-list', title: 'Live Timers', span: 1 }] },
        overlays: [],
        tabs: { hidden: [] }
    });

    const handleTimers = createTimersRoutes({ timerService: timerSvc });
    const handleOp = createOperatorRoutes({ operatorService: opSvc });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ modules: { alerts: true, music: false, subathon: false, overlays: true, variables: true }, alerts: { enabled: true } }));
        }
        if (await handleTimers(req, res, url.pathname)) return;
        if (await handleOp(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('{}');
        }
        router.handleRequest(req, res);
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Live Board card check
        await page.goto(`http://127.0.0.1:${port}/operator.html`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-timer-card="show-break"]', { timeout: 10000 });
        const boardText = await page.$eval('[data-card-id="c-timers"]', el => el.textContent);
        assert.match(boardText, /Intermission Break/);
        assert.match(boardText, /Chapter Split/);
        assert.match(boardText, /00:05:00/);
        assert.doesNotMatch(boardText, /No timers configured/);

        // Domain Timers tab + live +1m action check
        await page.click('[data-domain-tab="timers"]');
        await page.waitForSelector('.op-domain-panel:not([hidden]) [data-timer-card="show-break"]', { timeout: 10000 });
        await page.click('.op-domain-panel:not([hidden]) [data-timer-act="add_time"][data-timer-id="show-break"][data-minutes="1"]');
        await page.waitForFunction(
            () => (document.querySelector('.op-domain-panel:not([hidden]) [data-timer-readout="show-break"]')?.textContent || '').includes('00:06:00'),
            { timeout: 5000 }
        );
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Operator Mode Variables tab & Live Board card: single event binding and bounded step/reset', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-vars-'));
    const varSvc = createVariablesStore({ dataDir: tmpDir });
    varSvc.set('deaths', { type: 'number', value: 5, resetValue: 3, min: 0, max: 10, step: 1 });
    varSvc.upsertSet('hosts', {
        id: 'hosts',
        name: 'Show Hosts',
        slotsCount: 1,
        fields: [{ key: 'name', label: 'Name', type: 'text' }],
        roster: [{ id: 'host_1', label: 'Host 1', enabled: true, values: { name: 'Host 1' } }]
    });

    const opSvc = createOperatorService({ dataDir: tmpDir });
    opSvc.upsertProfile({
        id: 'default',
        name: 'Main Show',
        board: {
            columns: 2,
            cards: [
                { id: 'c-var', type: 'variable-single', title: 'Deaths Counter', span: 1, config: { variable: 'deaths' } }
            ]
        },
        overlays: [],
        tabs: { hidden: [] }
    });

    const handleOp = createOperatorRoutes({ operatorService: opSvc });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });

    const readBody = req => new Promise(resolve => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
    });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                modules: { alerts: true, music: false, subathon: false, overlays: true, variableSets: true, variableSettings: true },
                alerts: { enabled: true }
            }));
        }
        if (url.pathname.startsWith('/api/variables') && await varSvc.handleApi(req, res, url.pathname, readBody)) return;
        if (await handleOp(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('{}');
        }
        router.handleRequest(req, res);
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await page.goto(`http://127.0.0.1:${port}/operator.html`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-card-var-step="deaths"]', { timeout: 10000 });

        // Live Board card +5 respects max=10, then +1 clamps at 10, and Reset restores resetValue=3
        await page.click('[data-card-var-step="deaths"][data-delta="5"]');
        await page.waitForFunction(() => document.querySelector('[data-card-var-direct="deaths"]')?.value === '10', { timeout: 5000 });
        await page.click('[data-card-var-step="deaths"][data-delta="1"]');
        await new Promise(r => setTimeout(r, 150));
        assert.equal(await page.$eval('[data-card-var-direct="deaths"]', el => el.value), '10', 'Should clamp at max=10');

        await page.click('[data-card-var-reset="deaths"]');
        await page.waitForFunction(() => document.querySelector('[data-card-var-direct="deaths"]')?.value === '3', { timeout: 5000 });

        // Switch to Variables tab and verify Add Entry only adds 1 item (no duplicate event binding)
        await page.click('[data-domain-tab="variables"]');
        await page.waitForSelector('#op-add-entry', { timeout: 10000 });
        await page.click('#op-add-entry');
        await page.waitForFunction(() => document.querySelectorAll('#op-table-host tbody tr').length === 2, { timeout: 5000 });
        await new Promise(r => setTimeout(r, 200));
        const rowCount = await page.$$eval('#op-table-host tbody tr', rows => rows.length);
        assert.equal(rowCount, 2, 'Clicking Add Entry once must add exactly 1 row');
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
