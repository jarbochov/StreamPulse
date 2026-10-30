'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const puppeteer = require('puppeteer');
const { createPollService } = require('../server/services/polls');
const { createStaticRouter } = require('../server/static-router');
const { createOverlayWsServer } = require('../server/ws');
const { createTwitchRoutes } = require('../server/routes/twitch');

test('Tournaments: strict separation between versus and poll tournaments', async (t) => {
    const tmpDataDir = path.join(__dirname, `tmp-tourney-test-${Date.now()}`);
    fs.mkdirSync(tmpDataDir, { recursive: true });

    t.after(() => {
        try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch {}
    });

    const broadcasts = [];
    const pollService = createPollService({
        dataDir: tmpDataDir,
        broadcastToOverlays: (type, data) => {
            broadcasts.push({ type, data });
        }
    });

    // 1. Initial state: both are null
    assert.equal(pollService.getTournament({ isPoll: false }), null, 'Versus tournament should initially be null');
    assert.equal(pollService.getTournament({ isPoll: true }), null, 'Poll tournament should initially be null');

    // 2. Create Versus Tournament
    const versusTourney = pollService.createTournament({
        title: 'Versus Championship',
        format: 'single',
        entrants: ['Daigo', 'Tokido', 'Justin Wong', 'MenaRD'],
        scoringType: 'bestOf',
        bestOf: 3,
        targetScore: 2
    }, { isPoll: false });

    assert.ok(versusTourney, 'Versus tournament created');
    assert.equal(versusTourney.title, 'Versus Championship');
    assert.equal(pollService.getTournament({ isPoll: false })?.title, 'Versus Championship');
    assert.equal(pollService.getTournament({ isPoll: true }), null, 'Poll tournament must still be null after versus creation');

    const lastBroadcast1 = broadcasts[broadcasts.length - 1];
    assert.equal(lastBroadcast1.type, 'tournament-update', 'Versus creation broadcasts tournament-update');
    assert.equal(lastBroadcast1.data.title, 'Versus Championship');

    // 3. Create Poll Tournament
    const pollTourney = pollService.createTournament({
        title: 'Community RPG Vote',
        format: 'single',
        entrants: ['Chrono Trigger', 'EarthBound', 'Final Fantasy VI', 'Lufia II'],
        progressionMode: 'vote'
    }, { isPoll: true });

    assert.ok(pollTourney, 'Poll tournament created');
    assert.equal(pollTourney.title, 'Community RPG Vote');
    assert.equal(pollService.getTournament({ isPoll: true })?.title, 'Community RPG Vote');
    assert.equal(pollService.getTournament({ isPoll: false })?.title, 'Versus Championship', 'Versus tournament must remain unchanged');

    const lastBroadcast2 = broadcasts[broadcasts.length - 1];
    assert.equal(lastBroadcast2.type, 'poll-tournament-update', 'Poll creation broadcasts poll-tournament-update');
    assert.equal(lastBroadcast2.data.title, 'Community RPG Vote');

    // 4. Match ID isolation: both tournaments have match m_1_1
    const vMatch = versusTourney.matches.find(m => m.id === 'm_1_1');
    const pMatch = pollTourney.matches.find(m => m.id === 'm_1_1');
    assert.ok(vMatch && pMatch, 'Both tournaments contain match m_1_1');

    // Update score in Versus tournament ONLY
    pollService.updateMatchScore('m_1_1', { entrant: vMatch.entrant1.name, score: 2, isPoll: false });
    const updatedVersus = pollService.getTournament({ isPoll: false });
    const updatedPoll = pollService.getTournament({ isPoll: true });

    const updatedVMatch = updatedVersus.matches.find(m => m.id === 'm_1_1');
    const updatedPMatch = updatedPoll.matches.find(m => m.id === 'm_1_1');

    assert.equal(updatedVMatch.entrant1.score, 2, 'Versus match score updated to 2');
    assert.equal(updatedPMatch.entrant1.score, 0, 'Poll tournament match must NOT be mutated by versus update');

    // Advance match in Poll tournament ONLY
    pollService.advanceTournamentMatch('m_1_1', updatedPMatch.entrant1.name, { isPoll: true });
    const pollAfterAdv = pollService.getTournament({ isPoll: true });
    const versusAfterAdv = pollService.getTournament({ isPoll: false });

    assert.equal(pollAfterAdv.matches.find(m => m.id === 'm_1_1').status, 'COMPLETED', 'Poll match advanced to completed');
    assert.notEqual(versusAfterAdv.matches.find(m => m.id === 'm_1_1').status, 'COMPLETED', 'Versus match must NOT be advanced by poll call');

    // 5. Settings Isolation
    pollService.updateTournamentSettings({ title: 'New Versus Title' }, { isPoll: false });
    assert.equal(pollService.getTournament({ isPoll: false })?.title, 'New Versus Title');
    assert.equal(pollService.getTournament({ isPoll: true })?.title, 'Community RPG Vote', 'Poll tournament title must NOT change');

    // 6. Reset Isolation: reset versus tournament leaves poll tournament alive
    pollService.resetTournament({ isPoll: false });
    assert.equal(pollService.getTournament({ isPoll: false }), null, 'Versus tournament reset to null');
    assert.equal(pollService.getTournament({ isPoll: true })?.title, 'Community RPG Vote', 'Poll tournament must still be active after versus reset');

    // Reset poll tournament
    pollService.resetTournament({ isPoll: true });
    assert.equal(pollService.getTournament({ isPoll: true }), null, 'Poll tournament reset to null');
});

test('Overlays: /overlays/tournament.html and /overlays/poll-tournament.html structure', () => {
    const versusOverlayPath = path.resolve(__dirname, '../public/overlays/tournament.html');
    const pollOverlayPath = path.resolve(__dirname, '../public/overlays/poll-tournament.html');
    const cssPath = path.resolve(__dirname, '../public/css/tournament.css');
    const sharedJsPath = path.resolve(__dirname, '../public/js/tournament-shared.js');

    assert.ok(fs.existsSync(versusOverlayPath), 'tournament.html must exist');
    assert.ok(fs.existsSync(pollOverlayPath), 'poll-tournament.html must exist');
    assert.ok(fs.existsSync(cssPath), 'tournament.css must exist');
    assert.ok(fs.existsSync(sharedJsPath), 'tournament-shared.js must exist');

    const vContent = fs.readFileSync(versusOverlayPath, 'utf8');
    const pContent = fs.readFileSync(pollOverlayPath, 'utf8');

    assert.ok(vContent.includes('overlayType: \'versus\''), 'tournament.html configured for versus');
    assert.ok(vContent.includes('/css/tournament.css'), 'tournament.html references tournament.css');
    assert.ok(vContent.includes('/js/tournament-shared.js'), 'tournament.html references tournament-shared.js');

    assert.ok(pContent.includes('overlayType: \'poll\''), 'poll-tournament.html configured for poll');
    assert.ok(pContent.includes('/css/tournament.css'), 'poll-tournament.html references tournament.css');
    assert.ok(pContent.includes('/js/tournament-shared.js'), 'poll-tournament.html references tournament-shared.js');
});

test('Poll Manager tournament templates and saved brackets work through UI and source-scoped APIs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-poll-library-ui-'));
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    let live;
    let browser;
    let service;
    let restores = 0;
    const options = { dataDir: dir, log: () => {}, error: () => {}, broadcastToOverlays: (type, data) => live?.broadcastToOverlays(type, data) };
    service = createPollService(options);
    const routes = createTwitchRoutes({ pollService: service });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname === '/api/polls/tournament/history/restore') restores++;
        if (await routes(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"status":"ok"}');
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    live = createOverlayWsServer({ server, log: () => {} });
    try {
        const versus = service.createTournament({ title: 'Other studio', entrants: ['V1', 'V2'] });
        const versusPreset = service.saveTournamentPreset({ name: 'Other studio template', entrants: ['V1', 'V2'] });
        const tournament = service.createTournament({
            title: 'Fictional 16-player bracket', format: 'double', isPoll: true,
            entrants: Array.from({ length: 16 }, (_, i) => `Fictional ${i + 1}`),
            matchDuration: 45, blind: true, announceChat: false
        });
        service.updateMatchScore(tournament.matches[0].id, { isPoll: true, entrant1Color: '#123456' });
        service.advanceTournamentMatch(tournament.matches[0].id, tournament.matches[0].entrant1.name, { isPoll: true });
        const activeMatch = tournament.matches.find(m => m.status === 'PENDING' && m.bracket === 'winners');
        service.startTournamentMatch(activeMatch.id, { isPoll: true });
        service.castVote({ userId: 'Fixture voter', choiceIndex: 0 });
        const livePollId = service.getActivePoll().id;
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const call = async (suffix, method, body) => {
            const response = await fetch(`${origin}/api/polls/tournament/${suffix}`, {
                method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
            });
            return { code: response.status, data: await response.json() };
        };
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        let confirmLoad = true;
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => {
            if (dialog.type() === 'prompt') dialog.accept('Fictional saved item');
            else if (confirmLoad) dialog.accept();
            else dialog.dismiss();
        });
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (new URL(request.url()).origin === origin) request.continue();
            else request.respond({ status: 200, body: '' });
        });
        await page.goto(`${origin}/polls.html`, { waitUntil: 'domcontentloaded' });
        await page.click('#tab-btn-tourney');
        await page.waitForSelector('#save-tourney-template', { visible: true });
        await page.click('#save-tourney-template');
        await page.waitForFunction(() => document.querySelectorAll('[data-template-id]').length === 1);
        await page.click('#save-tourney-checkpoint');
        await page.waitForFunction(() => document.querySelectorAll('[data-history-id]').length === 1);
        const template = service.getTournamentPresets({ isPoll: true })[0];
        const checkpoint = service.getTournamentHistory({ isPoll: true })[0];
        assert.equal(service.getActivePoll().id, livePollId);
        assert.equal(service.getActivePoll().totalVotes, 1);
        assert.equal(service.getPollTournament().id, tournament.id);
        await page.click('#tab-btn-templates');
        await page.waitForSelector('[data-library-action="load-history"]', { visible: true });
        await page.click('[data-library-action="load-history"]');
        assert.equal(restores, 0, 'UI does not attempt restore during an active ballot');
        const blocked = await call('history/restore', 'POST', { id: checkpoint.id });
        assert.equal(blocked.code, 400);
        assert.match(blocked.data.error, /End the current poll/);
        assert.equal(service.getActivePoll().id, livePollId);
        await page.click('[data-library-action="load-template"]');
        await page.waitForSelector('#create-tournament-card', { visible: true });
        await page.waitForFunction(() => document.getElementById('tourney-duration').value === '45');
        assert.equal(await page.$eval('#tourney-format', el => el.value), 'double');
        assert.equal(await page.$eval('#tourney-entrants', el => el.value.split('\n').length), 16);
        assert.equal(await page.$eval('#tourney-blind', el => el.checked), true);
        assert.equal(service.getPollTournament().id, tournament.id, 'loading template only fills form');
        await page.evaluate(() => window.loadTournament());
        assert.equal(await page.$eval('#create-tournament-card', el => getComputedStyle(el).display), 'block', 'live refresh does not hide loaded form');
        service.finishPoll();
        await page.waitForFunction("activePollData?.status !== 'ACTIVE'");
        await page.click('#tab-btn-templates');
        await page.click(`[data-history-id="${checkpoint.id}"] [data-library-action="load-history"]`);
        await page.waitForFunction(() => document.getElementById('tourney-progress-text').textContent === '1 of 30 matches completed');
        assert.equal(service.getPollTournament().matches.find(m => m.id === activeMatch.id).status, 'PENDING');
        assert.equal(service.getActivePoll(), null);
        assert.equal(service.getTournament().id, versus.id);
        const createsBefore = service.getPollTournament().id;
        await page.evaluate(() => document.getElementById('tourney-create-form').requestSubmit());
        await page.waitForFunction(() => document.getElementById('tourney-progress-text').textContent === '0 of 30 matches completed');
        assert.notEqual(service.getPollTournament().id, createsBefore);
        assert.equal(service.getPollTournament().matches.length, 30);
        assert.equal(service.getPollTournament().matches.some(m => m.winner), false);
        assert.equal(service.getPollTournament().matchDuration, 45);
        assert.ok(service.getPollTournament().matches.some(m => m.entrant1?.color === '#123456' || m.entrant2?.color === '#123456'));
        assert.ok(service.getTournamentHistory({ isPoll: true }).some(t => !t.isCheckpoint && t.tournamentId === createsBefore));
        const finals = service.createTournament({ title: 'Fictional finished bracket', isPoll: true, entrants: ['Champion A', 'Finalist B'] });
        service.advanceTournamentMatch(finals.matches[0].id, 'Champion A', { isPoll: true });
        await page.click('#tab-btn-templates');
        await page.waitForFunction(() => document.getElementById('tournament-history-list').textContent.includes('Champion: Champion A'));
        const finalRow = `[data-history-id="${finals.id}"]`;
        await page.click(`${finalRow} [data-library-action="history-template"]`);
        await page.waitForFunction(() => document.querySelectorAll('[data-template-id]').length === 2);
        await page.click(`${finalRow} [data-library-action="load-history"]`);
        await page.waitForFunction(() => document.getElementById('entrant1-votes').textContent === 'Grand Champion');
        assert.equal(service.getPollTournament().status, 'COMPLETED');
        await page.click('#tab-btn-templates');
        confirmLoad = false;
        await page.click(`[data-template-id="${template.id}"] [data-library-action="delete-template"]`);
        assert.equal(service.getTournamentPresets({ isPoll: true }).length, 2, 'cancelled deletion preserves template');
        confirmLoad = true;
        await page.click(`[data-template-id="${template.id}"] [data-library-action="delete-template"]`);
        await page.waitForFunction(id => !document.querySelector(`[data-template-id="${id}"]`), {}, template.id);
        await page.click(`[data-history-id="${checkpoint.id}"] [data-library-action="delete-history"]`);
        await page.waitForFunction(id => !document.querySelector(`[data-history-id="${id}"]`), {}, checkpoint.id);
        assert.equal(service.getPollTournament().id, finals.id, 'deleting saved copies does not reset live bracket');
        assert.ok(service.getTournamentPresets().some(p => p.id === versusPreset.id));
        const missing = await call('history/restore', 'POST', { id: 'missing-fixture' });
        assert.equal(missing.code, 400);
        assert.equal(service.getPollTournament().id, finals.id);
        const regularPoll = service.createPoll({ title: 'Unrelated live vote', choices: ['A', 'B'], duration: 120 });
        const regularBlocked = await call('history/restore', 'POST', { id: finals.id });
        assert.equal(regularBlocked.code, 400, 'even unrelated live votes block history restore');
        assert.equal(service.getActivePoll().id, regularPoll.id);
        service.cancelPoll();
        await page.click('[data-library-action="load-template"]');
        await page.waitForSelector('#save-tourney-form-template', { visible: true });
        await page.$eval('#tourney-title', el => { el.value = 'Reusable form fixture'; });
        await page.$eval('#tourney-entrants', el => { el.value = 'Form A [Team A]\nForm B'; });
        await page.$eval('#tourney-format', el => { el.value = 'single'; });
        await page.$eval('#tourney-duration', el => { el.value = '90'; });
        await page.click('#save-tourney-form-template');
        await page.waitForFunction(() => document.querySelectorAll('[data-template-id]').length === 2);
        const formTemplate = service.getTournamentPresets({ isPoll: true }).find(p => p.title === 'Reusable form fixture');
        assert.deepEqual(formTemplate.entrants, ['Form A [Team A]', 'Form B']);
        assert.equal(formTemplate.matchDuration, 90);
        assert.equal(service.getPollTournament().id, finals.id, 'saving creation settings leaves live history unchanged');
        await page.setViewport({ width: 390, height: 844 });
        await page.click('#tab-btn-templates');
        assert.equal(await page.$eval('[data-template-id]', el => el.scrollWidth <= el.clientWidth), true, 'library buttons fit narrow screens');
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        service.destroy();
        live.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Poll Manager and overlay show a 16-player losers bracket without disrupting a running vote', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-live-bracket-'));
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    let service;
    let live;
    let browser;
    let routes;
    const options = {
        dataDir: dir,
        broadcastToOverlays: (type, data) => live?.broadcastToOverlays(type, data),
        onTakeover: () => {},
        onAlert: () => {},
        log: () => {},
        error: () => {}
    };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (await routes(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"status":"ok"}');
        } else if (!router.handleRequest(req, res)) {
            res.writeHead(404);
            res.end();
        }
    });
    live = createOverlayWsServer({ server, log: () => {} });
    try {
        service = createPollService(options);
        const tournament = service.createTournament({
            title: 'Audience bracket', format: 'double',
            entrants: Array.from({ length: 16 }, (_, i) => `Entrant ${i + 1}`),
            isPoll: true, announceChat: false
        });
        tournament.matches = tournament.matches.filter(m => m.bracket === 'winners');
        for (const match of tournament.matches) {
            delete match.loserNextMatchId;
            delete match.loserNextSlot;
            if (match.id === 'm_4_1') {
                match.roundName = 'Grand Finals';
                match.nextMatchId = null;
            }
        }
        for (const id of ['m_1_1', 'm_1_2']) {
            const match = tournament.matches.find(m => m.id === id);
            service.advanceTournamentMatch(id, match.entrant1.name, { isPoll: true });
        }
        service.startTournamentMatch('m_1_3', { isPoll: true });
        service.handleChatMessage({ user: 'TestVoter', message: '1' });
        const activeId = service.getActivePoll().id;
        service.destroy();
        service = createPollService(options);
        routes = createTwitchRoutes({ pollService: service });
        assert.equal(service.getActivePoll().id, activeId);
        assert.equal(service.getActivePoll().totalVotes, 1);
        const tournamentId = service.getPollTournament().id;
        for (const count of [3, 5, 17]) {
            assert.throws(() => service.createTournament({
                format: 'double', isPoll: true,
                entrants: Array.from({ length: count }, (_, i) => `Entrant ${i + 1}`)
            }), /exactly 2, 4, 8, or 16/);
        }
        assert.equal(service.getPollTournament().id, tournamentId);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${origin}/polls.html`, { waitUntil: 'domcontentloaded' });
        await page.click('#tab-btn-tourney');
        await page.waitForSelector('button[onclick="repairPollBracket()"]', { visible: true });
        page.once('dialog', dialog => dialog.accept());
        await page.$eval('button[onclick="repairPollBracket()"]', button => button.click());
        await page.waitForSelector('#bracket-nav-losers', { visible: true });
        assert.throws(() => service.startTournamentMatch('lb_1_1', { isPoll: true }), /End the current poll/);
        assert.equal(service.getPollTournament().matches.find(m => m.id === 'lb_1_1').status, 'PENDING');
        assert.equal(service.getActivePoll().id, activeId);
        assert.equal(service.getActivePoll().totalVotes, 1);
        await page.waitForFunction(() => document.getElementById('btn-start-match').textContent.trim() === 'End Match Vote');
        await page.click('#bracket-nav-losers');
        assert.equal(await page.$eval('#bracket-studio-view', el => el.scrollTop > 0), true);
        const loser = '#bracket-studio-view [data-match-id="lb_1_1"]';
        await page.click(loser);
        await page.waitForFunction(() => document.getElementById('current-match-round').textContent === 'Losers Round 1');
        await page.click('#btn-start-match');
        await page.waitForFunction(() => document.getElementById('toast').textContent.includes('End the current poll'));
        assert.equal(service.getActivePoll().id, activeId);
        assert.equal(service.getActivePoll().totalVotes, 1);
        service.finishPoll();
        await page.waitForFunction(() => document.getElementById('btn-start-match').textContent.trim() === 'Start Match Vote');
        await page.click('#btn-start-match');
        await page.waitForFunction(() => document.getElementById('btn-start-match').textContent.trim() === 'End Match Vote');
        assert.equal(service.getActivePoll().tournamentMatchId, 'lb_1_1');

        const settings = await browser.newPage();
        await settings.goto(`${origin}/polls.html`, { waitUntil: 'domcontentloaded' });
        await settings.click('#tab-btn-overlays');
        await settings.click('#btn-preview-tree');
        await settings.select('#tourney-opt-bracket', 'losers');
        assert.equal(new URL(await settings.$eval('#url-tourney-overlay', el => el.value)).searchParams.get('bracket'), 'losers');
        await settings.reload({ waitUntil: 'domcontentloaded' });
        await settings.waitForFunction(() => document.getElementById('tourney-opt-bracket').value === 'losers');
        assert.equal(new URL(await settings.$eval('#url-tourney-overlay', el => el.value)).searchParams.get('bracket'), 'losers');
        await settings.select('#tourney-opt-layout', 'active');
        assert.equal(await settings.$eval('#tourney-opt-bracket', el => el.disabled), true);
        assert.equal(new URL(await settings.$eval('#url-tourney-overlay', el => el.value)).searchParams.has('bracket'), false);
        await settings.select('#tourney-opt-layout', 'tree');
        assert.equal(new URL(await settings.$eval('#url-tourney-overlay', el => el.value)).searchParams.get('bracket'), 'losers');
        assert.equal(service.getActivePoll().tournamentMatchId, 'lb_1_1');

        const versusSettings = await browser.newPage();
        await versusSettings.goto(`${origin}/versus.html`, { waitUntil: 'domcontentloaded' });
        await versusSettings.click('#tab-btn-overlays');
        await versusSettings.click('#btn-prev-tourney-tree');
        await versusSettings.select('#tourney-opt-bracket', 'finals');
        assert.equal(new URL(await versusSettings.$eval('#url-tourney-overlay', el => el.value)).searchParams.get('bracket'), 'finals');
        await versusSettings.reload({ waitUntil: 'domcontentloaded' });
        await versusSettings.waitForFunction(() => document.getElementById('tourney-opt-bracket').value === 'finals');
        assert.equal(new URL(await versusSettings.$eval('#url-tourney-overlay', el => el.value)).searchParams.get('bracket'), 'finals');

        const overlay = await browser.newPage();
        await overlay.setViewport({ width: 1280, height: 720 });
        await overlay.goto(`${origin}/overlays/poll-tournament.html?fit=1`, { waitUntil: 'domcontentloaded' });
        await overlay.waitForSelector('.double-elim-losers .match-card');
        await overlay.waitForFunction(() => {
            const stage = document.getElementById('stage');
            const expected = Number(stage.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
            return expected > 0 && Math.abs(new window.DOMMatrix(getComputedStyle(stage).transform).a - expected) < 0.001;
        });
        assert.equal(await overlay.$$('.double-elim-losers .match-card').then(matches => matches.length), 14);
        const bounds = await overlay.$eval('.double-elim-losers', el => {
            const rect = el.getBoundingClientRect();
            const stage = document.getElementById('stage');
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                stageWidth: stage.offsetWidth, stageHeight: stage.offsetHeight,
                scrollWidth: stage.scrollWidth, scrollHeight: stage.scrollHeight,
                transform: stage.style.transform };
        });
        assert.ok(bounds.left >= -1 && bounds.top >= -1 && bounds.right <= 1281 && bounds.bottom <= 721,
            `losers bracket should fit in the OBS viewport: ${JSON.stringify(bounds)}`);

        const focused = await browser.newPage();
        await focused.evaluateOnNewDocument(() => {
            const NativeWebSocket = window.WebSocket;
            window.WebSocket = class extends NativeWebSocket {
                constructor(...args) {
                    super(...args);
                    if (new URL(args[0]).pathname === '/ws') {
                        this.addEventListener('open', () => { window.__testSocketOpen = true; });
                    }
                }
            };
        });
        await focused.setViewport({ width: 1280, height: 720 });
        for (const [view, winners, losers, finals, theme] of [
            ['winners', 15, 0, 0, 'retro'],
            ['losers', 0, 14, 0, 'glass'],
            ['finals', 0, 0, 1, 'neon'],
            ['unknown', 15, 14, 1, 'card']
        ]) {
            await focused.goto(`${origin}/overlays/poll-tournament.html?fit=1&bracket=${view}&overlay=${theme}`,
                { waitUntil: 'domcontentloaded' });
            await focused.waitForSelector('.match-card');
            const counts = await focused.evaluate(() => ({
                winners: document.querySelectorAll('.double-elim-winners .match-card').length,
                losers: document.querySelectorAll('.double-elim-losers .match-card').length,
                finals: document.querySelectorAll('.double-elim-gf .match-card').length
            }));
            assert.deepEqual(counts, { winners, losers, finals });
            if (view !== 'unknown') {
                await focused.waitForFunction(() => {
                    const stage = document.getElementById('stage');
                    const expected = Number(stage.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
                    return expected > 0 && Math.abs(new window.DOMMatrix(getComputedStyle(stage).transform).a - expected) < 0.001;
                });
                const rect = await focused.$eval('.double-elim-section', el => {
                    const r = el.getBoundingClientRect();
                    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
                });
                assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= 1281 && rect.bottom <= 721,
                    `${view} bracket should fit in the OBS viewport: ${JSON.stringify(rect)}`);
            }
        }
        await focused.goto(`${origin}/overlays/poll-tournament.html?fit=1&bracket=finals`, { waitUntil: 'domcontentloaded' });
        await focused.waitForSelector('.double-elim-gf .match-card');
        const fixture = JSON.parse(JSON.stringify(service.getPollTournament()));
        fixture.matches.push({ ...fixture.matches.find(m => m.id === 'gf_1'), id: 'gf_reset', bracket: undefined });
        await focused.evaluate(data => window.TournamentOverlay.renderTournament(data), fixture);
        assert.equal(await focused.$$('.double-elim-gf .match-card').then(matches => matches.length), 2);
        assert.equal(await focused.$$('.double-elim-winners .match-card').then(matches => matches.length), 0);
        await focused.goto(`${origin}/overlays/poll-tournament.html?fit=1&bracket=losers`, { waitUntil: 'domcontentloaded' });
        await focused.waitForSelector('.double-elim-losers .match-card');
        await focused.waitForFunction(() => window.__testSocketOpen === true);

        const loserWinner = service.getPollTournament().matches.find(m => m.id === 'lb_1_1').entrant1.name;
        assert.equal(service.handleChatMessage({ user: 'TestVoter', message: '1' }), true);
        service.finishPoll();
        assert.equal(service.getPollTournament().matches.find(m => m.id === 'lb_2_1').entrant1.name, loserWinner);
        await overlay.waitForFunction(name => {
            const next = document.querySelector('.double-elim-losers [data-match-id="lb_2_1"]');
            return next?.textContent.includes(name);
        }, { timeout: 5000 }, loserWinner);
        await focused.waitForFunction(name => {
            const next = document.querySelector('.double-elim-losers [data-match-id="lb_2_1"]');
            return next?.textContent.includes(name);
        }, { timeout: 5000 }, loserWinner);
    } finally {
        await browser?.close();
        service?.destroy();
        live.closeAllConnections();
        if (server.listening) await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
