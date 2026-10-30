'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const { createMatchupService } = require('../server/services/matchup');
const { createPollService } = require('../server/services/polls');
const { createAlertEngine, TRIGGERS } = require('../server/services/alerts');
const { createTwitchRoutes } = require('../server/routes/twitch');
const { createOverlayRoutes } = require('../server/routes/overlays');
const { createSystemRoutes } = require('../server/routes/system');
const { createGamePlanRoutes } = require('../server/routes/game-plan');
const { createGamePlanService } = require('../server/services/game-plan');

function createMockRequestResponse({ method = 'GET', url = '/', headers = {}, body = null }) {
    const req = new Readable({
        read() {
            if (body) {
                this.push(typeof body === 'string' ? body : JSON.stringify(body));
            }
            this.push(null);
        }
    });
    req.method = method;
    req.url = url;
    req.headers = { ...headers };
    if (body && !req.headers['content-type']) {
        req.headers['content-type'] = typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json';
    }

    const resHeaders = {};
    let statusCode = 200;
    const chunks = [];

    let onFinishResolve;
    const done = new Promise(resolve => { onFinishResolve = resolve; });

    const res = {
        statusCode: 200,
        writeHead(code, h = {}) {
            statusCode = code;
            this.statusCode = code;
            Object.assign(resHeaders, h);
            return this;
        },
        setHeader(name, value) {
            resHeaders[name.toLowerCase()] = value;
            return this;
        },
        getHeader(name) {
            return resHeaders[name.toLowerCase()];
        },
        write(chunk) {
            if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            return true;
        },
        end(chunk) {
            if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const buf = Buffer.concat(chunks);
            const text = buf.toString('utf8');
            let json = null;
            try { json = JSON.parse(text); } catch {}
            onFinishResolve({
                status: statusCode,
                headers: resHeaders,
                text,
                json
            });
        }
    };

    return { req, res, done };
}

test('Companion & API Integration: HTTP GET/POST triggers and status snapshot', async (t) => {
    const testDir = path.join(__dirname, '..', 'data', `.test-companion-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    t.after(() => {
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    });

    const matchupService = createMatchupService({
        dataDir: testDir,
        safeWriteFileSync: (p, d) => fs.writeFileSync(p, d),
        broadcastToOverlays: () => {},
        log: () => {},
        warn: () => {}
    });

    const pollService = createPollService({
        dataDir: testDir,
        safeWriteFileSync: (p, d) => fs.writeFileSync(p, d),
        broadcastToOverlays: () => {},
        log: () => {},
        warn: () => {}
    });

    const alertEngine = createAlertEngine({
        dataDir: testDir,
        safeWriteFileSync: (p, d) => { try { fs.writeFileSync(p, d); } catch {} },
        broadcast: () => {},
        log: () => {},
        warn: () => {}
    });

    let mockOverlays = {
        'test-scene': {
            id: 'test-scene',
            name: 'Main Broadcast',
            elements: [
                { id: 'v1', type: 'video', name: 'Intro Bumper', src: '/video.mp4', video: { autoplay: true, sound: true, volume: 80 } },
                { id: 'yt1', type: 'embed', name: 'YT Player', src: 'https://youtube.com/watch?v=dQw4w9WgXcQ', video: { volume: 50 } }
            ]
        }
    };

    let randomizerStatus = {
        lastMode: 'wheel',
        lastDuration: 8,
        lastWinner: 'Pizza Night',
        lastPreset: 'dinner',
        remaining: 5,
        removed: 1,
        elimination: true,
        at: Date.now()
    };

    const mockOverlayService = {
        customOverlayAssetsDir: testDir,
        customOverlayHistoryDir: testDir,
        customOverlayHistoryLimit: 10,
        loadRandomizerPresets: () => [{ id: 'p1', choices: ['A', 'B'], eliminated: [] }],
        saveRandomizerPresets: () => {},
        loadRandomizerButtonPresets: () => [],
        saveRandomizerButtonPresets: () => {},
        loadRandomizerQuotePresets: () => [],
        saveRandomizerQuotePresets: () => {},
        getRandomizerStatus: () => randomizerStatus,
        setRandomizerStatus: (s) => { randomizerStatus = { ...randomizerStatus, ...s }; }
    };

    const gamePlanService = createGamePlanService({
        dataDir: testDir,
        safeWriteFileSync: (p, d) => fs.writeFileSync(p, d),
        broadcastToOverlays: () => {},
        getConfig: () => ({}),
        getStreamInfo: () => [{ category: 'Retro RPGs' }],
        getViewerStats: () => ({ live: true }),
        refreshGameInfo: async () => null,
        getGameInfoCached: () => null,
        GAME_INFO_VERSION: 1,
        sessionsDir: testDir
    });

    const twitchRoutes = createTwitchRoutes({
        twitchService: {
            getAccessToken: () => 'token',
            getTokenScopes: () => ['chat:read'],
            isBroadcasterSynced: () => true,
            setLatestPoll: () => {}
        },
        pollService,
        matchupService,
        dataDir: testDir,
        readJsonFileSafe: () => ({ data: [] })
    });

    let visibilityState = [{ key: 'credits', visible: true }, { key: 'music', visible: true }];
    const overlayRoutes = createOverlayRoutes({
        overlayService: mockOverlayService,
        alertEngine,
        getCustomOverlays: () => mockOverlays,
        broadcastToOverlays: () => {},
        getOverlayClients: () => new Set(['client1']),
        listOverlayVisibility: () => visibilityState,
        setOverlayVisibility: (key, action) => {
            const item = visibilityState.find(v => v.key === key);
            if (!item) return null;
            item.visible = action === 'toggle' ? !item.visible : (action === 'on');
            return item;
        },
        loadRandomizerPresets: () => [{ id: 'p1', choices: ['A', 'B'], eliminated: [] }],
        saveRandomizerPresets: () => {}
    });

    const gamePlanRoutes = createGamePlanRoutes({
        gamePlanService,
        twitchService: null
    });

    const mockStatus = () => {
        const m = matchupService.getMatchup();
        const p = pollService.getLatestPoll();
        const t = pollService.getTournament({ isPoll: false });
        return {
            uptime: 3600,
            sessionActive: true,
            matchup: m,
            poll: p,
            tournament: t,
            randomizer: randomizerStatus,
            viewers: { current: 152, peak: 240 },
            music: { state: 'playing', track: 'Solar Waves', artist: 'Astral Echo' },
            stream: {
                streamUptime: '01:00:00',
                uptimeSeconds: 3600,
                latestFollower: 'SuperFan99',
                latestSubscriber: 'MegaGifter'
            },
            gamePlan: {
                playingNow: { id: 'g1', name: 'Chrono Trigger' }
            },
            customVars: [{ name: 'death_count', value: 7, type: 'counter' }]
        };
    };

    const systemRoutes = createSystemRoutes({
        rootDir: testDir,
        configPath: path.join(testDir, 'config.json'),
        getStatus: mockStatus
    });

    const request = async (urlStr, options = {}) => {
        const method = options.method || 'GET';
        const body = options.body || null;
        const headers = options.headers || {};
        const { req, res, done } = createMockRequestResponse({ method, url: urlStr, headers, body });
        const urlObj = new URL(urlStr, 'http://localhost');
        const pathname = urlObj.pathname;

        let handled = await twitchRoutes(req, res, urlObj, pathname);
        if (!handled) handled = await overlayRoutes(req, res, urlObj, pathname);
        if (!handled) handled = await gamePlanRoutes(req, res, pathname, urlObj);
        if (!handled) handled = await systemRoutes(req, res, urlObj, pathname);

        if (!handled) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('Not Found');
        }

        return await done;
    };

    await t.test('Matchup actions via GET and POST with query params', async () => {
        // Increment P1 score via GET query params
        const incP1 = await request('/api/matchup/score?competitor=1&delta=1');
        assert.equal(incP1.status, 200);
        assert.equal(incP1.json.competitor.score, 1);

        // Plain text field check
        const fieldScore = await request('/api/matchup/field/c1_score');
        assert.equal(fieldScore.status, 200);
        assert.equal(fieldScore.text, '1');

        // Swap sides via GET
        const swap = await request('/api/matchup/swap');
        assert.equal(swap.status, 200);
        assert.equal(swap.json.matchup.competitors[1].score, 1); // was P1, now P2

        // Reset scores via GET
        const resetScores = await request('/api/matchup/reset-scores');
        assert.equal(resetScores.status, 200);
        assert.equal(resetScores.json.matchup.competitors[0].score, 0);
        assert.equal(resetScores.json.matchup.competitors[1].score, 0);

        // Clock toggle via GET
        const toggleClock = await request('/api/matchup/clock/toggle');
        assert.equal(toggleClock.status, 200);
        assert.equal(toggleClock.json.clock.isRunning, true);

        const pauseClock = await request('/api/matchup/clock/pause');
        assert.equal(pauseClock.status, 200);
        assert.equal(pauseClock.json.clock.isRunning, false);

        // Race clock toggle-all via GET
        const toggleRace = await request('/api/matchup/clock/race/toggle-all');
        assert.equal(toggleRace.status, 200);
        assert.equal(toggleRace.json.clock.isRunning, true);

        // Finish runner 1 via GET
        const finishRunner = await request('/api/matchup/clock/race/finish?competitor=1');
        assert.equal(finishRunner.status, 200);
        assert.equal(finishRunner.json.matchup.competitors[0].timer.finished, true);
    });

    await t.test('Tournament actions via GET and POST', async () => {
        const tourney = pollService.createTournament({
            title: 'Championship 2026',
            entrants: ['Alpha', 'Beta', 'Gamma', 'Delta'],
            bestOf: 3
        });
        assert.ok(tourney);
        const matchId = tourney.matches[0].id;

        // Score update via GET
        const scoreMatch = await request(`/api/tournament/score?matchId=${matchId}&entrant=1&delta=2`);
        assert.equal(scoreMatch.status, 200);

        // Advance winner via GET
        const advance = await request(`/api/tournament/advance?matchId=${matchId}&winner=Alpha`);
        assert.equal(advance.status, 200);
        assert.equal(advance.json.tournament.matches[0].status, 'COMPLETED');

        // Rollback via GET
        const rollback = await request(`/api/tournament/rollback?matchId=${matchId}`);
        assert.equal(rollback.status, 200);
        assert.equal(rollback.json.tournament.matches[0].status, 'ACTIVE');
    });

    await t.test('Live Polls actions via GET and POST', async () => {
        // Create poll with comma-separated choices via GET
        const createPoll = await request('/api/polls/create?title=Favorite+Snack&choices=Chips,Cookies,Fruit&duration=60&blind=true');
        assert.equal(createPoll.status, 200);
        assert.equal(createPoll.json.poll.title, 'Favorite Snack');
        assert.equal(createPoll.json.poll.choices.length, 3);
        assert.equal(createPoll.json.poll.blind, true);

        // Toggle blind via GET
        const toggleBlind = await request('/api/polls/toggle-blind');
        assert.equal(toggleBlind.status, 200);
        assert.equal(toggleBlind.json.poll.blind, false);

        // Cast vote via GET
        const vote = await request('/api/polls/vote?user=Tester&choice=1');
        assert.equal(vote.status, 200);
        assert.equal(vote.json.voted, true);

        // Extend timer via GET
        const extend = await request('/api/polls/extend?seconds=45');
        assert.equal(extend.status, 200);
        assert.equal(extend.json.poll.duration, 105);

        // End poll via GET
        const end = await request('/api/polls/end');
        assert.equal(end.status, 200);
        assert.equal(end.json.poll.status, 'COMPLETED');
    });

    await t.test('Alert actions via GET and POST', async () => {
        // Trigger test event via GET
        const testEvent = await request('/api/alerts/test-event?type=bits&user=Cheerer123&amount=250');
        assert.equal(testEvent.status, 200);
        assert.equal(testEvent.json.ok, true);

        // Pause alert queue via GET
        const pauseQueue = await request('/api/alerts/queue/pause');
        assert.equal(pauseQueue.status, 200);
        assert.equal(pauseQueue.json.queue.paused, true);

        // Resume queue via GET
        const resumeQueue = await request('/api/alerts/queue/resume');
        assert.equal(resumeQueue.status, 200);
        assert.equal(resumeQueue.json.queue.paused, false);

        // Clear queue via GET
        const clearQueue = await request('/api/alerts/queue/clear');
        assert.equal(clearQueue.status, 200);
        assert.equal(clearQueue.json.queue.pending, 0);
    });

    await t.test('Video controls via /api/videos/control and custom overlay routes', async () => {
        // Global video pause via GET
        const vidPause = await request('/api/videos/control?action=pause');
        assert.equal(vidPause.status, 200);
        assert.equal(vidPause.json.action, 'pause');
        assert.equal(vidPause.json.target, 'all');

        // Target overlay video play via GET
        const ovPlay = await request('/api/custom-overlays/test-scene/video?action=play');
        assert.equal(ovPlay.status, 200);
        assert.equal(ovPlay.json.action, 'play');
    });

    await t.test('Game Plan and Overlay Visibility actions via GET', async () => {
        const gpAdvance = await request('/api/game-plan/advance');
        assert.equal(gpAdvance.status, 200);

        const ovToggle = await request('/api/overlay-visibility/credits?action=toggle');
        assert.equal(ovToggle.status, 200);
        assert.equal(ovToggle.json.visible, false);
    });

    await t.test('Plain-text fields endpoint /api/status/field/:field', async () => {
        const viewers = await request('/api/status/field/viewers');
        assert.equal(viewers.status, 200);
        assert.equal(viewers.text, '152');

        const track = await request('/api/status/field/track');
        assert.equal(track.status, 200);
        assert.equal(track.text, 'Solar Waves');

        const follow = await request('/api/status/field/latest_follow');
        assert.equal(follow.status, 200);
        assert.equal(follow.text, 'SuperFan99');

        const uptime = await request('/api/status/field/uptime');
        assert.equal(uptime.status, 200);
        assert.equal(uptime.text, '01:00:00');
    });
});
