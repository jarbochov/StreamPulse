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

test('Operator Service & Routes manage profile.displays and server-persisted multiple Runbooks', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-rb-'));
    try {
        const broadcasts = [];
        const svc = createOperatorService({
            dataDir: tmpDir,
            broadcastToOverlays: (type, data) => broadcasts.push({ type, data })
        });
        const handle = createOperatorRoutes({ operatorService: svc });
        const call = async (method, pathAndQuery, body = null) => {
            const url = new URL(`http://localhost:3000${pathAndQuery}`);
            const req = createMockReq(method, pathAndQuery, body);
            const res = createMockRes();
            const handled = await handle(req, res, url, url.pathname);
            return { handled, status: res.statusCode, json: res.json() };
        };

        // Profile displays array persists & dedupes
        const up = svc.upsertProfile({ id: 'default', name: 'Main Show', displays: ['disp-a', 'disp-a', 'disp-b'] });
        assert.deepEqual(up.displays, ['disp-a', 'disp-b']);
        assert.equal(svc.getStatusSummary().displayCount, 2);

        // Default runbook seeded
        const listRes = await call('GET', '/api/operator/runbooks');
        assert.equal(listRes.status, 200);
        assert.equal(listRes.json.runbooks.length, 1);
        assert.equal(listRes.json.runbooks[0].id, 'pre-show');

        // Create second runbook with tasks, notes, sections, and columns
        const createRes = await call('POST', '/api/operator/runbooks', {
            name: 'Tournament Launch',
            description: 'Bracket kickoff cues',
            columns: 2,
            items: [
                { kind: 'section', text: 'Pre-Show' },
                { kind: 'task', text: 'Seed players' },
                { kind: 'note', text: 'Remind viewers about !bracket command' },
                { kind: 'task', text: 'Start match 1' }
            ]
        });
        assert.equal(createRes.status, 201);
        assert.equal(createRes.json.runbook.id, 'tournament-launch');
        assert.equal(createRes.json.runbook.columns, 2);
        assert.equal(createRes.json.runbook.items[0].kind, 'section');
        assert.equal(createRes.json.runbook.items[2].kind, 'note');
        assert.ok(broadcasts.some(b => b.type === 'operator-runbooks-update'));

        // Companion GET toggle & reset
        const togRes = await call('GET', '/api/operator/runbooks/tournament-launch/toggle?index=1&done=1');
        assert.equal(togRes.status, 200);
        assert.equal(togRes.json.runbook.items[1].done, true);

        const rstRes = await call('GET', '/api/operator/runbooks/tournament-launch/reset');
        assert.equal(rstRes.status, 200);
        assert.equal(rstRes.json.runbook.items[1].done, false);

        // Duplicate & delete
        const dupRes = await call('POST', '/api/operator/runbooks/tournament-launch/duplicate', {});
        assert.equal(dupRes.status, 201);
        assert.equal(dupRes.json.runbook.id, 'tournament-launch-copy');

        const delRes = await call('DELETE', '/api/operator/runbooks/tournament-launch-copy');
        assert.equal(delRes.status, 200);
        assert.equal(delRes.json.deleted, 'tournament-launch-copy');

        // Survives reload from disk
        const fresh = createOperatorService({ dataDir: tmpDir });
        assert.equal(fresh.listRunbooks().length, 2);
        assert.deepEqual(fresh.getProfile('default').displays, ['disp-a', 'disp-b']);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Operator Mode Versus, Trivia, Polls, Displays add-to-preset, Runbook focused links & Add Card modal fit', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-e2e-'));
    const opSvc = createOperatorService({ dataDir: tmpDir });
    opSvc.upsertRunbook({
        id: 'raid-plan',
        name: 'Raid Plan',
        items: [
            { id: 'c1', kind: 'task', text: 'Pick raid target', done: false },
            { id: 'n1', kind: 'note', text: '**Sponsor** read: [Site](https://example.com) <script>window.__xss=1</script>' }
        ]
    });
    const handleOp = createOperatorRoutes({ operatorService: opSvc });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });

    const matchupState = {
        title: 'SF6 Exhibition',
        phase: 'First to 5',
        format: 'firstTo',
        targetScore: 5,
        roundsBestOf: 3,
        competitors: [
            { id: 'c1', name: 'RyuPlayer', tag: 'JP', score: 2, rounds: 1, color: '#ef4444' },
            { id: 'c2', name: 'KenPlayer', tag: 'US', score: 1, rounds: 0, color: '#3b82f6' }
        ],
        clock: { enabled: true, mode: 'countdown', duration: 99, remaining: 42, elapsed: 0, isRunning: false, formatted: '42' }
    };
    const triviaBank = [
        { id: 'q1', category: 'Gaming', question: 'Which studio made Half-Life?', choices: ['Valve', 'Id'], correctIndex: 0, duration: 25, done: false }
    ];
    let triviaState = {
        status: 'idle',
        currentIndex: -1,
        totalQuestions: 1,
        settings: { defaultDuration: 25 },
        questions: triviaBank,
        activeQuestion: null
    };
    let pollState = null;
    const displays = [
        { id: 'disp-bingo-1', name: 'Stream Bingo', kind: 'bingo', bingo: { size: 3, prompts: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] } }
    ];

    const readBody = req => new Promise(resolve => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
    });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ modules: { alerts: true, timers: true, music: true, versus: true, matchup: true, polls: true, trivia: true, overlays: true, variableSets: true } }));
        }
        if (url.pathname === '/api/matchup' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', matchup: matchupState }));
        }
        if (url.pathname === '/api/matchup/score' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const comp = matchupState.competitors[Number(body.index) || 0];
            if (comp && body.delta) comp.score += Number(body.delta);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', matchup: matchupState }));
        }
        if (url.pathname === '/api/matchup/clock/start' && req.method === 'POST') {
            matchupState.clock.isRunning = true;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', clock: matchupState.clock, matchup: matchupState }));
        }
        if (url.pathname === '/api/matchup/clock/pause' && req.method === 'POST') {
            matchupState.clock.isRunning = false;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', clock: matchupState.clock, matchup: matchupState }));
        }
        if (url.pathname === '/api/matchup/clock/reset' && req.method === 'POST') {
            matchupState.clock.isRunning = false;
            matchupState.clock.remaining = matchupState.clock.duration;
            matchupState.clock.formatted = String(matchupState.clock.duration);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', clock: matchupState.clock, matchup: matchupState }));
        }
        if (url.pathname === '/api/tournament') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', tournament: null }));
        }
        if ((url.pathname === '/api/trivia' || url.pathname === '/api/trivia/status') && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(triviaState));
        }
        if (url.pathname === '/api/trivia/question/start' && req.method === 'POST') {
            triviaState = {
                ...triviaState,
                status: 'question',
                currentIndex: 0,
                activeQuestion: {
                    id: 'q1',
                    category: 'Gaming',
                    question: 'Which studio made Half-Life?',
                    correctIndex: 0,
                    duration: 25,
                    totalVotes: 12,
                    endsAt: Date.now() + 25000,
                    remainingSeconds: 25,
                    choices: [
                        { index: 0, letter: 'A', text: 'Valve', votes: 10, percent: 83 },
                        { index: 1, letter: 'B', text: 'Id', votes: 2, percent: 17 }
                    ]
                }
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true }));
        }
        if (url.pathname === '/api/trivia/question/reveal') {
            triviaState.status = 'reveal';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true }));
        }
        if (url.pathname === '/api/polls/latest') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', poll: pollState }));
        }
        if (url.pathname === '/api/polls/presets') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', presets: [] }));
        }
        if (url.pathname === '/api/polls/create' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            pollState = {
                title: body.title,
                status: 'ACTIVE',
                duration: body.duration || 60,
                startedAt: new Date().toISOString(),
                totalVotes: 0,
                votingPaused: false,
                blind: Boolean(body.blind),
                choices: (body.choices || []).map((t, i) => ({ id: String(i + 1), title: t, votes: 0, percent: 0 }))
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', poll: pollState }));
        }
        if (url.pathname === '/api/variable-displays') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ displays, bingoState: {} }));
        }
        if (url.pathname === '/api/variables') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ variables: [], sets: [] }));
        }
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

        // 1. Add Card Modal fits inside viewport without horizontal overflow, and URL includes ?preset=
        await page.goto(`http://127.0.0.1:${port}/operator.html#tab=board`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-board-add="1"]', { timeout: 10000 });
        assert.ok(page.url().includes('preset=default'), 'URL should include active preset parameter');
        assert.equal(await page.$('#op-preset-pills'), null, 'Duplicate preset pills bar should not exist');
        await page.click('[data-board-add="1"]');
        await page.waitForSelector('#op-card-cat-seg', { timeout: 5000 });
        const modalFit = await page.evaluate(() => {
            const modal = document.querySelector('.op-modal');
            const body = document.querySelector('.op-modal-body');
            const rect = modal.getBoundingClientRect();
            return {
                fitsWidth: rect.right <= window.innerWidth && rect.left >= 0,
                fitsHeight: rect.bottom <= window.innerHeight && rect.top >= 0,
                noHorizOverflow: body.scrollWidth <= body.clientWidth + 2
            };
        });
        assert.equal(modalFit.fitsWidth, true, 'Add Card modal must fit viewport width');
        assert.equal(modalFit.fitsHeight, true, 'Add Card modal must fit viewport height');
        assert.equal(modalFit.noHorizOverflow, true, 'Add Card modal body must not overflow horizontally');
        await page.click('#op-modal [data-modal-close="1"]');

        // 2. Versus tab renders real matchup competitors, increments score, starts & resets clock
        await page.click('[data-domain-tab="versus"]');
        await page.waitForSelector('[data-vs-m-score="0"]', { timeout: 5000 });
        const vsText = await page.$eval('#op-domain-versus', el => el.textContent);
        assert.ok(vsText.includes('RyuPlayer') && vsText.includes('KenPlayer'), 'Versus tab should display real competitors');
        await page.click('[data-vs-m-score="0"][data-delta="1"]');
        await page.waitForFunction(() => {
            const btn = document.querySelector('[data-vs-m-score="0"]');
            const scoreEl = btn?.closest('div')?.previousElementSibling;
            return scoreEl && scoreEl.textContent.trim() === '3';
        }, { timeout: 5000 });
        assert.equal(matchupState.competitors[0].score, 3);
        await page.waitForSelector('[data-vs-clock="toggle"]', { timeout: 5000 });
        await page.click('[data-vs-clock="toggle"]');
        await page.waitForFunction(() => (document.querySelector('[data-vs-clock="toggle"]')?.textContent || '').includes('Pause Clock'), { timeout: 5000 });
        assert.equal(matchupState.clock.isRunning, true);
        await page.click('[data-vs-clock="reset"]');
        await page.waitForFunction(() => (document.querySelector('[data-vs-clock-readout]')?.textContent || '').trim() === '99', { timeout: 5000 });
        assert.equal(matchupState.clock.remaining, 99);

        // 3. Trivia tab previews first question + timer while idle, then starts & reveals
        await page.click('[data-domain-tab="trivia"]');
        await page.waitForSelector('[data-triv-start-idx="0"]', { timeout: 5000 });
        const trivIdle = await page.$eval('#op-domain-trivia', el => el.textContent);
        assert.ok(trivIdle.includes('Which studio made Half-Life?') && trivIdle.includes('25s'), 'Trivia idle state should show first question and duration timer');
        await page.click('[data-triv-start-idx="0"]');
        await page.waitForSelector('[data-triv-act="question/reveal"]:not([disabled])', { timeout: 5000 });
        await page.click('[data-triv-act="question/reveal"]');
        await page.waitForFunction(() => (document.querySelector('#op-domain-trivia')?.textContent || '').includes('Correct'), { timeout: 5000 });

        // 4. Polls tab allows starting a new poll directly
        await page.click('[data-domain-tab="polls"]');
        await page.waitForSelector('[data-poll-create-form="1"]', { timeout: 5000 });
        await page.type('[data-poll-create-form="1"] input[name="title"]', 'Next game?');
        await page.type('[data-poll-create-form="1"] textarea[name="choices"]', 'Hades II\nBalatro');
        await page.click('[data-poll-create-form="1"] button[type="submit"]');
        await page.waitForSelector('[data-poll-act="end"]', { timeout: 5000 });
        const pollText = await page.$eval('#op-domain-polls', el => el.textContent);
        assert.ok(pollText.includes('Next game?') && pollText.includes('Hades II'), 'Polls tab should launch and display active poll');

        // 5. Displays tab starts empty (add-to-preset), supports columns after adding, and dedicated #display=<id> link
        await page.click('[data-domain-tab="displays"]');
        await page.waitForSelector('[data-disp-open-picker="1"]', { timeout: 5000 });
        assert.ok((await page.$eval('#op-domain-displays', el => el.textContent)).includes('No displays added to this preset yet'));
        await page.click('[data-disp-open-picker="1"]');
        await page.waitForSelector('[data-pick-display="disp-bingo-1"]', { timeout: 5000 });
        await page.click('[data-pick-display="disp-bingo-1"]');
        await page.click('#op-modal [data-modal-close="1"]');
        await page.waitForSelector('[data-disp-cols="3"]', { timeout: 5000 });
        await page.click('[data-disp-cols="3"]');
        const dispColsVar = await page.$eval('[data-disp-card-list="1"]', el => getComputedStyle(el).getPropertyValue('--op-board-cols').trim());
        assert.equal(dispColsVar, '3', 'Displays column button must update --op-board-cols');
        await page.goto(`http://127.0.0.1:${port}/operator.html#display=disp-bingo-1`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-disp-focused-body="1"]', { timeout: 5000 });
        assert.ok((await page.$eval('#op-domain-displays', el => el.textContent)).includes('Stream Bingo'));
        const panelBorder = await page.$eval('#op-domain-displays .op-panel', el => getComputedStyle(el).borderTopStyle);
        assert.equal(panelBorder, 'solid', '.op-panel must have styled card border');

        // 6. Runbook supports dedicated #runbook=<id> link, Markdown notes (sanitized), columns, and zero arrow buttons
        await page.goto(`http://127.0.0.1:${port}/operator.html#runbook=raid-plan`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-rb-domain-body="1"]', { timeout: 5000 });
        const rbHtml = await page.$eval('#op-domain-runbook', el => el.innerHTML);
        assert.ok(rbHtml.includes('Pick raid target'));
        assert.ok(rbHtml.includes('<strong>Sponsor</strong>'), 'Runbook notes should render Markdown bold');
        assert.ok(rbHtml.includes('href="https://example.com"') && rbHtml.includes('target="_blank"'), 'Runbook note links should render safely in new tab');
        assert.equal(rbHtml.includes('<script>'), false, 'Runbook note Markdown must be sanitized via DOMPurify');
        assert.equal(rbHtml.includes('↑') || rbHtml.includes('↓'), false, 'Runbook must use drag-and-drop, never arrows');
        assert.ok(await page.$('[data-rb-cols="2"]'), 'Runbook should expose column selector');
        assert.ok(await page.$('[data-rb-kind="note"]'), 'Runbook should expose non-task Note composer');
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
