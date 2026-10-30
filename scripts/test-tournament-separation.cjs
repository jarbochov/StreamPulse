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
        assert.throws(() => service.startTournamentMatch('lb_1_1', { isPoll: true }), /End the current poll/);
        assert.equal(service.getPollTournament().matches.find(m => m.id === 'lb_1_1').status, 'PENDING');
        assert.equal(service.getActivePoll().id, activeId);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`${origin}/polls.html`, { waitUntil: 'domcontentloaded' });
        await page.click('#tab-btn-tourney');
        await page.waitForSelector('#bracket-nav-losers', { visible: true });
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
        const loserWinner = service.getPollTournament().matches.find(m => m.id === 'lb_1_1').entrant1.name;
        service.handleChatMessage({ user: 'TestVoter', message: '1' });
        service.finishPoll();
        await overlay.waitForFunction(name => {
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
