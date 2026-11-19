'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const puppeteer = require('puppeteer');
const { createTierListService, calculateConsensus, DEFAULT_TIERS } = require('../server/services/tier-list');
const { createTierListRoutes } = require('../server/routes/tier-list');
const { createOverlayRoutes } = require('../server/routes/overlays');
const createChatbot = require('../server/services/chatbot');

test('Tier List Service: State initialization & defaults', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-init-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });
        const state = service.getState();

        assert.equal(state.title, 'Community Tier List');
        assert.equal(Array.isArray(state.tiers), true);
        assert.equal(state.tiers.length, 6);
        assert.equal(state.tiers[0].label, 'S');
        assert.equal(state.tiers[1].label, 'A');
        assert.equal(state.tiers[2].label, 'B');
        assert.equal(state.tiers[3].label, 'C');
        assert.equal(state.tiers[4].label, 'D');
        assert.equal(state.tiers[5].label, 'F');
        assert.equal(state.items.length, 0);
        assert.equal(state.activeVote, null);
        assert.equal(state.presets.length >= 4, true);
        assert.equal(state.settings.showVoteHint, true);

        // Update settings
        service.updateConfig({ settings: { showVoteHint: false } });
        assert.equal(service.getState().settings.showVoteHint, false);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: CRUD items and batch adding', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-crud-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });

        // Add single item
        const item1 = service.addItem({ name: 'Chrono Trigger', imageUrl: '/assets/chrono.png' });
        assert.ok(item1.id);
        assert.equal(item1.name, 'Chrono Trigger');
        assert.equal(item1.tierId, null); // Unranked by default

        // Batch add items (Asset library multi-select)
        const batch = service.batchAddItems([
            { name: 'Super Metroid', imageUrl: '/assets/metroid.png' },
            { name: 'EarthBound', imageUrl: '/assets/earthbound.png' }
        ]);
        assert.equal(batch.length, 2);

        let state = service.getState();
        assert.equal(state.items.length, 3);

        // Move item to Tier S
        service.moveItem({ itemId: item1.id, toTier: 'tier-s', toIndex: 0 });
        state = service.getState();
        const updatedItem1 = state.items.find(i => i.id === item1.id);
        assert.equal(updatedItem1.tierId, 'tier-s');

        // Move item between tiers
        service.moveItem({ itemId: item1.id, toTier: 'tier-a', toIndex: 0 });
        state = service.getState();
        assert.equal(state.items.find(i => i.id === item1.id).tierId, 'tier-a');

        // Update item details
        service.updateItem(item1.id, { name: 'Chrono Trigger (SNES)', note: 'Masterpiece' });
        state = service.getState();
        assert.equal(state.items.find(i => i.id === item1.id).name, 'Chrono Trigger (SNES)');
        assert.equal(state.items.find(i => i.id === item1.id).note, 'Masterpiece');

        // Reset placements to unranked pool
        service.resetPlacements();
        state = service.getState();
        assert.equal(state.items.every(i => i.tierId === null), true);

        // Delete item
        service.deleteItem(item1.id);
        state = service.getState();
        assert.equal(state.items.length, 2);

        // Clear all
        service.clearItems();
        state = service.getState();
        assert.equal(state.items.length, 0);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Consensus Math — Weighted Mean (A + C = B)', () => {
    // Tiers: S (0), A (1), B (2), C (3), D (4), F (5)
    const tiers = DEFAULT_TIERS;

    // 1 vote for A (index 1), 1 vote for C (index 3)
    const vote = {
        consensusMode: 'weighted_mean',
        votes: {
            'user1': { user: 'Alice', tierId: 'tier-a', weight: 1 },
            'user2': { user: 'Bob', tierId: 'tier-c', weight: 1 }
        }
    };

    const consensus = calculateConsensus(vote, tiers);
    assert.equal(consensus.totalVotes, 2);
    assert.equal(consensus.consensusIndex, 2);
    assert.equal(consensus.consensusTier.label, 'B'); // A (1) + C (3) = 4 / 2 = 2 => B!

    // Add 2 votes for S (index 0)
    vote.votes['user3'] = { user: 'Charlie', tierId: 'tier-s', weight: 1 };
    vote.votes['user4'] = { user: 'Diana', tierId: 'tier-s', weight: 1 };
    // Weighted index sum: 1 + 3 + 0 + 0 = 4. Total = 4. Mean = 4/4 = 1 => A!
    const consensus2 = calculateConsensus(vote, tiers);
    assert.equal(consensus2.consensusIndex, 1);
    assert.equal(consensus2.consensusTier.label, 'A');
});

test('Tier List Service: Consensus Math — Median & Plurality', () => {
    const tiers = DEFAULT_TIERS;

    // Voters: S, S, S, F, F
    // Median index should be S (0)
    // Plurality should be S (0)
    const vote = {
        consensusMode: 'median',
        votes: {
            'u1': { user: 'u1', tierId: 'tier-s', weight: 1 },
            'u2': { user: 'u2', tierId: 'tier-s', weight: 1 },
            'u3': { user: 'u3', tierId: 'tier-s', weight: 1 },
            'u4': { user: 'u4', tierId: 'tier-f', weight: 1 },
            'u5': { user: 'u5', tierId: 'tier-f', weight: 1 }
        }
    };

    const medianRes = calculateConsensus(vote, tiers);
    assert.equal(medianRes.consensusIndex, 0);
    assert.equal(medianRes.consensusTier.label, 'S');

    vote.consensusMode = 'plurality';
    const pluralityRes = calculateConsensus(vote, tiers);
    assert.equal(pluralityRes.consensusIndex, 0);
    assert.equal(pluralityRes.consensusTier.label, 'S');
});

test('Tier List Service: Live Chat Voting & Bot Announcements', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-voting-'));
    let announcedStart = null;
    let announcedEnd = null;

    const mockChatbot = {
        announceTierVoteStart: async (data) => { announcedStart = data; },
        announceTierVoteEnd: async (data) => { announcedEnd = data; },
        isBotMessage: () => false
    };

    try {
        const service = createTierListService({
            dataDir: tmpDir,
            chatbotAnnouncer: mockChatbot,
            log: () => {}
        });

        const item = service.addItem({ name: 'Final Fantasy VII', imageUrl: '/assets/ff7.png' });

        // Start vote
        service.startVote({ itemId: item.id, duration: 0, consensusMode: 'weighted_mean' });
        let state = service.getState();
        assert.ok(state.activeVote);
        assert.equal(state.activeVote.itemId, item.id);
        assert.equal(state.activeVote.status, 'ACTIVE');

        // Cast chat votes via handleChatMessage
        // User 1 votes A
        const handled1 = service.handleChatMessage({
            chatname: 'Player1',
            userId: 'user-1',
            message: '!tier A'
        });
        assert.equal(handled1, true);

        // User 2 votes C
        const handled2 = service.handleChatMessage({
            chatname: 'Player2',
            userId: 'user-2',
            message: '!rank C'
        });
        assert.equal(handled2, true);

        // Verify vote changing: User 1 changes vote from A to S
        const handled3 = service.handleChatMessage({
            chatname: 'Player1',
            userId: 'user-1',
            message: '!tier S'
        });
        assert.equal(handled3, true);

        state = service.getState();
        assert.equal(Object.keys(state.activeVote.votes).length, 2);
        assert.equal(state.activeVote.votes['user-1'].tierId, 'tier-s');

        // End vote and apply consensus
        service.endVote({ applyConsensus: true });
        state = service.getState();
        assert.equal(state.activeVote, null);

        // Verify the item was placed into the winning tier
        const placedItem = state.items.find(i => i.id === item.id);
        assert.ok(placedItem.tierId);
        // S (0) + C (3) = 3 / 2 = 1.5 => Math.round(1.5) = 2 => B!
        assert.equal(placedItem.tierId, 'tier-b');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Presets Management', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-presets-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });

        // Save preset
        const customPreset = service.savePreset({
            name: 'Speedrun Categories',
            description: 'WR / Sub-1h / PB / Dead Run'
        });
        assert.ok(customPreset.id);

        let state = service.getState();
        assert.ok(state.presets.some(p => p.id === customPreset.id));

        // Load built-in preset "Extended Gaming"
        service.loadPreset('preset-extended');
        state = service.getState();
        assert.equal(state.tiers.length, 8);
        assert.equal(state.tiers[0].label, 'S+');
        assert.equal(state.tiers[7].label, 'Trash');

        // Delete custom preset
        const deletedCustom = service.deletePreset(customPreset.id);
        assert.equal(deletedCustom, true);
        state = service.getState();
        assert.equal(state.presets.some(p => p.id === customPreset.id), false);

        // Delete built-in preset
        const deletedBuiltin = service.deletePreset('preset-extended');
        assert.equal(deletedBuiltin, true);
        state = service.getState();
        assert.equal(state.presets.some(p => p.id === 'preset-extended'), false);

        // Reset presets back to defaults
        service.resetPresets();
        state = service.getState();
        assert.equal(state.presets.some(p => p.id === 'preset-extended'), true);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List REST API Routes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-api-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });
        const handleRoutes = createTierListRoutes({ tierListService: service });

        // Helper mock request
        function mockReq(method, pathname, body = null) {
            const stream = new (require('stream').Readable)();
            if (body) {
                stream.push(typeof body === 'string' ? body : JSON.stringify(body));
            }
            stream.push(null);
            stream.method = method;
            stream.url = pathname;
            stream.headers = { 'content-type': 'application/json' };
            return stream;
        }

        function mockRes() {
            let statusCode = 200;
            let headers = {};
            let body = '';
            return {
                writeHead(code, h) { statusCode = code; headers = h; },
                end(data) { if (data) body += data; },
                getStatusCode: () => statusCode,
                getBody: () => body ? JSON.parse(body) : null
            };
        }

        // 1. GET /api/tier-list
        const req1 = mockReq('GET', '/api/tier-list');
        const res1 = mockRes();
        const handled1 = await handleRoutes(req1, res1, '/api/tier-list');
        assert.equal(handled1, true);
        assert.equal(res1.getStatusCode(), 200);
        assert.equal(res1.getBody().title, 'Community Tier List');

        // 2. POST /api/tier-list/item
        const req2 = mockReq('POST', '/api/tier-list/item', { name: 'Dark Souls', imageUrl: '/assets/ds.png' });
        const res2 = mockRes();
        const handled2 = await handleRoutes(req2, res2, '/api/tier-list/item');
        assert.equal(handled2, true);
        assert.equal(res2.getStatusCode(), 201);
        const createdItem = res2.getBody();
        assert.equal(createdItem.name, 'Dark Souls');

        // 3. POST /api/tier-list/move
        const req3 = mockReq('POST', '/api/tier-list/move', { itemId: createdItem.id, toTier: 'tier-s', toIndex: 0 });
        const res3 = mockRes();
        const handled3 = await handleRoutes(req3, res3, '/api/tier-list/move');
        assert.equal(handled3, true);
        assert.equal(res3.getStatusCode(), 200);
        assert.equal(res3.getBody().tierId, 'tier-s');

        // 4. POST /api/tier-list/vote/start
        const req4 = mockReq('POST', '/api/tier-list/vote/start', { itemId: createdItem.id });
        const res4 = mockRes();
        const handled4 = await handleRoutes(req4, res4, '/api/tier-list/vote/start');
        assert.equal(handled4, true);
        assert.equal(res4.getStatusCode(), 200);
        assert.ok(res4.getBody().activeVote);

        // 5. POST /api/tier-list/vote/cast
        const req5 = mockReq('POST', '/api/tier-list/vote/cast', { user: 'Gamer', userId: 'g1', tierId: 'tier-a' });
        const res5 = mockRes();
        const handled5 = await handleRoutes(req5, res5, '/api/tier-list/vote/cast');
        assert.equal(handled5, true);
        assert.equal(res5.getStatusCode(), 200);
        assert.equal(res5.getBody().accepted, true);

        // 6. POST /api/tier-list/vote/end
        const req6 = mockReq('POST', '/api/tier-list/vote/end', { applyConsensus: true });
        const res6 = mockRes();
        const handled6 = await handleRoutes(req6, res6, '/api/tier-list/vote/end');
        assert.equal(handled6, true);
        assert.equal(res6.getStatusCode(), 200);
        assert.equal(res6.getBody().activeVote, null);

        // 7. Presets API: GET /api/tier-list/presets, delete & reset
        const reqPresets = mockReq('GET', '/api/tier-list/presets');
        const resPresets = mockRes();
        const handledPresets = await handleRoutes(reqPresets, resPresets, '/api/tier-list/presets');
        assert.equal(handledPresets, true);
        assert.equal(resPresets.getStatusCode(), 200);
        assert.ok(Array.isArray(resPresets.getBody().presets));
        assert.ok(resPresets.getBody().presets.some(p => p.id === 'preset-standard'));

        const req7 = mockReq('DELETE', '/api/tier-list/presets/preset-standard');
        const res7 = mockRes();
        const handled7 = await handleRoutes(req7, res7, '/api/tier-list/presets/preset-standard');
        assert.equal(handled7, true);
        assert.equal(res7.getStatusCode(), 200);
        assert.equal(res7.getBody().success, true);

        const req8 = mockReq('POST', '/api/tier-list/presets/reset');
        const res8 = mockRes();
        const handled8 = await handleRoutes(req8, res8, '/api/tier-list/presets/reset');
        assert.equal(handled8, true);
        assert.equal(res8.getStatusCode(), 200);
        assert.ok(res8.getBody().presets.some(p => p.id === 'preset-standard'));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Audience Stats & Consensus Breakdown', () => {
    const tiers = DEFAULT_TIERS; // S (0), A (1), B (2), C (3), D (4), F (5)

    const vote = {
        consensusMode: 'weighted_mean',
        subMultiplier: 2,
        votes: {
            'u1': { user: 'Alice', tierId: 'tier-s', weight: 2, isSub: true, timestamp: 1000 },
            'u2': { user: 'Bob', tierId: 'tier-s', weight: 1, isSub: false, timestamp: 2000 },
            'u3': { user: 'Charlie', tierId: 'tier-a', weight: 1, isSub: false, timestamp: 3000 }
        }
    };

    const consensus = calculateConsensus(vote, tiers);
    assert.equal(consensus.totalVotes, 3);
    assert.equal(consensus.subVotes, 1);
    assert.equal(consensus.consensusTier.label, 'S');
    // 2 out of 3 voters picked S => 2/3 = 67% voter agreement
    assert.equal(consensus.agreementPercent, 67);
    // Recent voters list
    assert.equal(consensus.recentVoters.length, 3);
    assert.equal(consensus.recentVoters[0].user, 'Charlie');
    assert.equal(consensus.recentVoters[0].tierLabel, 'A');
    assert.equal(consensus.recentVoters[1].user, 'Bob');
    assert.equal(consensus.recentVoters[2].user, 'Alice');
    assert.equal(consensus.recentVoters[2].isSub, true);
});

test('Tier List Service: Stream Deck & Bitfocus Companion GET Triggers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-companion-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });
        const handleRoutes = createTierListRoutes({ tierListService: service });

        // Add 2 items to unranked pool
        const item1 = service.addItem({ name: 'Chrono Trigger', imageUrl: '/chrono.png' });
        const item2 = service.addItem({ name: 'Secret of Mana', imageUrl: '/mana.png' });

        function mockReq(method, pathname) {
            const stream = new (require('stream').Readable)();
            stream.push(null);
            stream.method = method;
            stream.url = pathname;
            stream.headers = {};
            return stream;
        }

        function mockRes() {
            let statusCode = 200;
            let body = '';
            return {
                writeHead(code) { statusCode = code; },
                end(data) { if (data) body += data; },
                getStatusCode: () => statusCode,
                getBody: () => body ? JSON.parse(body) : null
            };
        }

        // 0. GET /api/tier-list/status while idle
        const statusIdleReq = mockReq('GET', '/api/tier-list/status');
        const statusIdleRes = mockRes();
        await handleRoutes(statusIdleReq, statusIdleRes, '/api/tier-list/status');
        assert.equal(statusIdleRes.getStatusCode(), 200);
        const idleStatus = statusIdleRes.getBody();
        assert.equal(idleStatus.itemCount, 2);
        assert.equal(idleStatus.placedCount, 0);
        assert.equal(idleStatus.unrankedCount, 2);
        assert.equal(idleStatus.voteStatus, 'idle');
        assert.equal(idleStatus.activeVote, null);

        // 1. GET /api/tier-list/vote/start without itemId -> should pick item1 automatically!
        const req1 = mockReq('GET', '/api/tier-list/vote/start?duration=45');
        const res1 = mockRes();
        const handled1 = await handleRoutes(req1, res1, '/api/tier-list/vote/start');
        assert.equal(handled1, true);
        assert.equal(res1.getStatusCode(), 200);
        const state1 = res1.getBody();
        assert.ok(state1.activeVote);
        assert.equal(state1.activeVote.itemId, item1.id);
        assert.equal(state1.activeVote.itemName, 'Chrono Trigger');

        // Cast vote
        service.castVote({ user: 'Fan', userId: 'f1', tierId: 'tier-s' });

        // 1b. GET /api/tier-list/status during open vote
        const statusOpenReq = mockReq('GET', '/api/tier-list/status');
        const statusOpenRes = mockRes();
        await handleRoutes(statusOpenReq, statusOpenRes, '/api/tier-list/status');
        assert.equal(statusOpenRes.getStatusCode(), 200);
        const openStatus = statusOpenRes.getBody();
        assert.equal(openStatus.voteStatus, 'active');
        assert.equal(openStatus.activeVote.itemName, 'Chrono Trigger');
        assert.equal(openStatus.activeVote.totalVotes, 1);
        assert.equal(openStatus.activeVote.consensusTier, 'S');

        // 1c. Lock vote and verify status reports locked
        await handleRoutes(mockReq('GET', '/api/tier-list/vote/lock'), mockRes(), '/api/tier-list/vote/lock');
        const statusLockedReq = mockReq('GET', '/api/tier-list/status');
        const statusLockedRes = mockRes();
        await handleRoutes(statusLockedReq, statusLockedRes, '/api/tier-list/status');
        assert.equal(statusLockedRes.getBody().voteStatus, 'locked');

        // 2. GET /api/tier-list/vote/end?apply=1 -> should end vote and place item in Tier S
        const req2 = mockReq('GET', '/api/tier-list/vote/end?apply=1');
        const res2 = mockRes();
        const handled2 = await handleRoutes(req2, res2, '/api/tier-list/vote/end');
        assert.equal(handled2, true);
        assert.equal(res2.getStatusCode(), 200);
        const state2 = res2.getBody();
        assert.equal(state2.activeVote, null);
        assert.equal(state2.items.find(i => i.id === item1.id).tierId, 'tier-s');

        // 3. GET /api/tier-list/reset -> reset placements back to unranked
        const req3 = mockReq('GET', '/api/tier-list/reset');
        const res3 = mockRes();
        const handled3 = await handleRoutes(req3, res3, '/api/tier-list/reset');
        assert.equal(handled3, true);
        assert.equal(res3.getStatusCode(), 200);
        assert.equal(res3.getBody().items.every(i => i.tierId === null), true);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Overlay: Responsive styles, cover fit, contrast helper and hint scaling present', () => {
    const overlayHtml = fs.readFileSync(path.join(__dirname, '../public/overlays/tier-list.html'), 'utf8');
    assert.ok(overlayHtml.includes('--tl-card-scale'));
    assert.ok(overlayHtml.includes('--tl-cover-fit'));
    assert.ok(overlayHtml.includes('--tl-hint-scale'));
    assert.ok(overlayHtml.includes('getContrastColor'));
    assert.ok(overlayHtml.includes('container-type: inline-size'));
    assert.ok(overlayHtml.includes('isVoteActive'));
});

test('Tier List preview applies appearance and viewport changes without reloading the overlay', async (t) => {
    const publicRoot = path.resolve(__dirname, '../public');
    const profileDir = path.resolve(__dirname, '..', `.test-tier-list-preview-${process.pid}`);
    fs.rmSync(profileDir, { recursive: true, force: true });

    const state = {
        title: 'Fixture Tier List',
        tiers: DEFAULT_TIERS,
        items: [],
        activeVote: null,
        presets: [],
        settings: { showVoteHint: true, soundEnabled: true }
    };
    const contentTypes = {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.svg': 'image/svg+xml'
    };
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state));
            return;
        }

        const filePath = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
            res.writeHead(403);
            res.end();
            return;
        }
        fs.readFile(filePath, (error, content) => {
            if (error) {
                res.writeHead(404);
                res.end();
                return;
            }
            res.writeHead(200, {
                'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(content);
        });
    });

    let browser;
    t.after(async () => {
        if (browser) await browser.close();
        if (server.listening) await new Promise(resolve => server.close(resolve));
        fs.rmSync(profileDir, { recursive: true, force: true });
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({
        headless: true,
        userDataDir: profileDir,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    let overlayNavigations = 0;
    page.on('framenavigated', frame => {
        if (frame.url().includes('/overlays/tier-list.html')) overlayNavigations += 1;
    });
    await page.evaluateOnNewDocument(() => {
        window.WebSocket = class {
            close() {}
            send() {}
        };
    });

    await page.goto(`${origin}/tools/tier-list.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.localStorage.getItem('streampulse:tier-list:overlay-options') !== null);
    await page.click('#tab-btn-theming');
    await page.waitForFunction(() => {
        const frame = document.getElementById('tier-preview-iframe');
        return frame?.dataset.initialLoaded === 'true'
            && frame.contentDocument?.readyState === 'complete'
            && frame.contentDocument?.getElementById('overlay-container');
    });
    const initialOverlayNavigations = overlayNavigations;
    assert.ok(initialOverlayNavigations >= 1, 'preview iframe should load once before changing options');
    await page.select('#overlay-opt-theme', 'light');

    const overlayFrame = page.frames().find(frame => frame.url().includes('/overlays/tier-list.html'));
    await overlayFrame.waitForFunction(() => document.body.classList.contains('theme-light'));
    await page.click('#chip-vp-sidebar');
    await overlayFrame.waitForFunction(() => document.body.classList.contains('layout-sidebar'));
    await page.waitForFunction(() => document.getElementById('preview-res-label')?.textContent.includes('440×1080'));

    assert.equal(overlayNavigations, initialOverlayNavigations, 'preview options must synchronize via postMessage, not iframe reload');
    assert.equal(await overlayFrame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tl-bg').trim()), '#ffffff');
});

test('Chatbot Tier Vote End: Accurately announces total votes and consensus agreement', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-chatbot-vote-count-'));
    const originalFetch = globalThis.fetch;
    const sentMessages = [];
    globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/sendChat/')) {
            const decoded = decodeURIComponent(urlStr.split('/sendChat/')[1] || '');
            sentMessages.push(decoded);
            return { ok: true, status: 200, text: async () => 'ok' };
        }
        return { ok: true, status: 200, text: async () => 'ok', json: async () => ({}) };
    };

    t.after(() => {
        globalThis.fetch = originalFetch;
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    const chatbot = createChatbot({
        dataDir: tmpDir,
        getConfig: () => ({ chatbot_enabled: true, ssn: { session_id: 'test-session-123' } }),
        sessionKey: () => 'test-session'
    });

    // 1. Scenario: Weighted Mean where 1 votes A and 2 vote C => Weighted average consensus is B.
    // 0 chatters voted directly for B. Total votes = 3.
    const res = await chatbot.announceTierVoteEnd({
        item: { name: 'Elden Ring' },
        consensusTier: { id: 'tier-b', label: 'B' },
        consensus: {
            totalVotes: 3,
            agreementPercent: 33,
            distribution: [
                { tierId: 'tier-a', label: 'A', count: 1, percentage: 33 },
                { tierId: 'tier-c', label: 'C', count: 2, percentage: 67 }
            ]
        }
    }, { test: true });

    assert.equal(res.sent, true);
    assert.equal(sentMessages.length, 1);
    // Verifies that {votes} resolves to 3 (total votes cast) and NOT 0!
    assert.ok(sentMessages[0].includes('with 3 votes (33%)!'), `Expected message to include 'with 3 votes (33%)!', got: ${sentMessages[0]}`);
    assert.ok(!sentMessages[0].includes('0 votes'), 'Message should NOT state 0 votes');

    // 2. Custom template with {tiervotes} and {totalvotes}
    chatbot.getData().settings.tierAnnouncements = {
        enabled: true,
        announceEnd: true,
        endTemplate: '[Tier List] {item}: {totalvotes} total votes, {tiervotes} on {tier}'
    };

    const res2 = await chatbot.announceTierVoteEnd({
        item: { name: 'Hollow Knight' },
        consensusTier: { id: 'tier-b', label: 'B' },
        consensus: {
            totalVotes: 3,
            agreementPercent: 33,
            distribution: [
                { tierId: 'tier-a', label: 'A', count: 1, percentage: 33 },
                { tierId: 'tier-c', label: 'C', count: 2, percentage: 67 }
            ]
        }
    }, { test: true });

    assert.equal(res2.sent, true);
    assert.ok(res2.text.includes('3 total votes, 0 on B'), `Expected '3 total votes, 0 on B', got: ${res2.text}`);
});

test('Tier List Service: Resilient Chat Vote Argument Parsing and Punctuation Handling', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-resilient-vote-'));
    try {
        const service = createTierListService({
            dataDir: tmpDir,
            log: () => {}
        });

        const item = service.addItem({ name: 'Chrono Cross' });
        service.startVote({ itemId: item.id, duration: 0 });

        // Trailing exclamation: "!tier S!"
        assert.equal(service.handleChatMessage({ chatname: 'User1', userId: 'u1', message: '!tier S!' }), true);
        assert.equal(service.getState().activeVote.votes['u1'].tierId, 'tier-s');

        // Trailing word: "!tier A tier"
        assert.equal(service.handleChatMessage({ chatname: 'User2', userId: 'u2', message: '!tier A tier' }), true);
        assert.equal(service.getState().activeVote.votes['u2'].tierId, 'tier-a');

        // Trailing polite phrase: "!rank B please"
        assert.equal(service.handleChatMessage({ chatname: 'User3', userId: 'u3', message: '!rank B please' }), true);
        assert.equal(service.getState().activeVote.votes['u3'].tierId, 'tier-b');

        // Lowercase tier: "!tier c"
        assert.equal(service.handleChatMessage({ chatname: 'User4', userId: 'u4', message: '!tier c' }), true);
        assert.equal(service.getState().activeVote.votes['u4'].tierId, 'tier-c');

        // Invalid tier should not cast a vote
        assert.equal(service.handleChatMessage({ chatname: 'User5', userId: 'u5', message: '!tier NONEXISTENT' }), false);
        assert.equal(Boolean(service.getState().activeVote.votes['u5']), false);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Auto Lock-In setting and Manual Finalization', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-auto-lock-'));
    try {
        const service = createTierListService({
            dataDir: tmpDir,
            log: () => {}
        });

        // 1. Verify default setting has autoLockIn: true
        assert.equal(service.getState().settings.autoLockIn, true);

        // 2. Configure autoLockIn: false
        service.updateConfig({ settings: { autoLockIn: false } });
        assert.equal(service.getState().settings.autoLockIn, false);

        const item = service.addItem({ name: 'Super Mario 64' });

        // 3. Start vote with short duration (0.05s / 50ms)
        service.startVote({ itemId: item.id, duration: 0.05, consensusMode: 'weighted_mean' });
        assert.equal(service.getState().activeVote.status, 'ACTIVE');

        // Cast a vote
        service.handleChatMessage({ chatname: 'N64Fan', userId: 'fan1', message: '!tier S' });
        assert.equal(service.getState().activeVote.votes['fan1'].tierId, 'tier-s');

        // 4. Wait for timer expiration (> 60ms)
        await new Promise(resolve => setTimeout(resolve, 80));

        // When autoLockIn is false, timer expiring should NOT end the vote or place the item.
        // Instead, it should transition status to 'LOCKED'.
        const lockedState = service.getState();
        assert.ok(lockedState.activeVote, 'Vote should still be present in LOCKED state');
        assert.equal(lockedState.activeVote.status, 'LOCKED');
        const unplacedItem = lockedState.items.find(i => i.id === item.id);
        assert.equal(unplacedItem.tierId, null, 'Item should not be placed into tier while locked');

        // 5. Votes cast while LOCKED should be rejected
        const lateVoteHandled = service.handleChatMessage({ chatname: 'LateUser', userId: 'fan2', message: '!tier A' });
        assert.equal(lateVoteHandled, false, 'Votes cast while LOCKED should be rejected');
        assert.equal(Boolean(service.getState().activeVote.votes['fan2']), false);

        // 6. Manual lock-in by streamer via endVote
        service.endVote({ applyConsensus: true });
        const finalizedState = service.getState();
        assert.equal(finalizedState.activeVote, null);
        const placedItem = finalizedState.items.find(i => i.id === item.id);
        assert.equal(placedItem.tierId, 'tier-s', 'Item should now be placed in Tier S');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Routes: POST and GET /api/tier-list/vote/lock', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-route-lock-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });
        const handleRoutes = createTierListRoutes({ tierListService: service });
        const item = service.addItem({ name: 'Zelda' });

        function mockReq(method, pathname) {
            const stream = new (require('stream').Readable)();
            stream.push(null);
            stream.method = method;
            stream.url = pathname;
            stream.headers = {};
            return stream;
        }

        function mockRes() {
            let statusCode = 200;
            let body = '';
            return {
                writeHead(code) { statusCode = code; },
                end(data) { if (data) body += data; },
                getStatusCode: () => statusCode,
                getBody: () => body ? JSON.parse(body) : null
            };
        }

        // Start vote
        service.startVote({ itemId: item.id, duration: 60 });
        assert.equal(service.getState().activeVote.status, 'ACTIVE');

        // POST /api/tier-list/vote/lock
        const req1 = mockReq('POST', '/api/tier-list/vote/lock');
        const res1 = mockRes();
        const handled1 = await handleRoutes(req1, res1, '/api/tier-list/vote/lock');
        assert.equal(handled1, true);
        assert.equal(res1.getStatusCode(), 200);
        assert.equal(res1.getBody().activeVote.status, 'LOCKED');

        // GET /api/tier-list/vote/lock (Stream Deck / Companion trigger)
        const req2 = mockReq('GET', '/api/tier-list/vote/lock');
        const res2 = mockRes();
        const handled2 = await handleRoutes(req2, res2, '/api/tier-list/vote/lock');
        assert.equal(handled2, true);
        assert.equal(res2.getStatusCode(), 200);
        assert.equal(res2.getBody().activeVote.status, 'LOCKED');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Asset Library Usage Tracking (tierListAssetUsers)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-assets-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });

        // Add item with asset library URL
        const item1 = service.addItem({
            name: 'Chrono Trigger',
            imageUrl: '/custom-overlay-assets/chrono-trigger.png'
        });

        // Add item with URL-encoded asset library URL
        const item2 = service.addItem({
            name: 'Secret of Mana',
            imageUrl: '/custom-overlay-assets/secret%20of%20mana.jpg'
        });

        // Add item with external image URL (not an asset library file)
        service.addItem({
            name: 'EarthBound',
            imageUrl: 'https://images.igdb.com/earthbound.jpg'
        });

        // 1. Direct match
        const users1 = service.tierListAssetUsers('chrono-trigger.png');
        assert.equal(users1.length, 1);
        assert.equal(users1[0].id, `tier-list:item:${item1.id}`);
        assert.equal(users1[0].name, 'Tier List: Chrono Trigger');

        // 2. URL-encoded asset name match
        const users2 = service.tierListAssetUsers('secret of mana.jpg');
        assert.equal(users2.length, 1);
        assert.equal(users2[0].id, `tier-list:item:${item2.id}`);
        assert.equal(users2[0].name, 'Tier List: Secret of Mana');

        // 3. Unused asset returns empty array
        const usersUnused = service.tierListAssetUsers('unrelated-banner.png');
        assert.equal(usersUnused.length, 0);

        // 4. After deleting item, asset is no longer reported as used
        service.deleteItem(item1.id);
        assert.equal(service.tierListAssetUsers('chrono-trigger.png').length, 0);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service & Overlay Asset Routes: Usage, Deletion Protection, and Renaming', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-asset-routes-'));
    const assetsDir = path.join(tmpDir, 'custom-overlay-assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    try {
        // Create sample asset files on disk
        const sampleImage = '<svg width="10" height="10"></svg>';
        fs.writeFileSync(path.join(assetsDir, 'test-game-cover.png'), sampleImage);
        fs.writeFileSync(path.join(assetsDir, 'unused-art.png'), sampleImage);

        const service = createTierListService({ dataDir: tmpDir, log: () => {} });

        // Add an item using test-game-cover.png
        const item = service.addItem({
            name: 'Super Metroid',
            imageUrl: '/custom-overlay-assets/test-game-cover.png'
        });

        // Start a vote with duration 0 (open indefinitely without active timer) so activeVote also captures the image
        service.startVote({ itemId: item.id, duration: 0 });

        const overlayRoutes = createOverlayRoutes({
            customOverlayAssetsDir: assetsDir,
            tierListAssetUsers: name => service.tierListAssetUsers(name),
            rewriteTierListReferences: (oldName, newName) => service.rewriteTierListReferences(oldName, newName)
        });

        function mockReq(method, pathname, body = null) {
            const stream = new (require('stream').Readable)();
            if (body) stream.push(typeof body === 'string' ? body : JSON.stringify(body));
            stream.push(null);
            stream.method = method;
            stream.url = pathname;
            stream.headers = { 'content-type': 'application/json' };
            return stream;
        }

        function mockRes() {
            let statusCode = 200;
            let body = '';
            return {
                writeHead(code) { statusCode = code; },
                end(data) { if (data) body += data; },
                getStatusCode: () => statusCode,
                getBody: () => body ? JSON.parse(body) : null
            };
        }

        // 1. GET /api/custom-overlays/assets -> test-game-cover.png must report usedBy containing the tier list item
        const req1 = mockReq('GET', '/api/custom-overlays/assets');
        const res1 = mockRes();
        const url1 = new URL('http://localhost/api/custom-overlays/assets');
        const handled1 = await overlayRoutes(req1, res1, url1, '/api/custom-overlays/assets');
        assert.equal(handled1, true);
        assert.equal(res1.getStatusCode(), 200);

        const assetList = res1.getBody();
        assert.ok(Array.isArray(assetList));
        const coverAsset = assetList.find(a => a.name === 'test-game-cover.png');
        assert.ok(coverAsset, 'Cover asset should be listed');
        assert.equal(coverAsset.usedBy.length, 1);
        assert.equal(coverAsset.usedBy[0].id, `tier-list:item:${item.id}`);
        assert.equal(coverAsset.usedBy[0].name, 'Tier List: Super Metroid');

        const unusedAsset = assetList.find(a => a.name === 'unused-art.png');
        assert.ok(unusedAsset);
        assert.equal(unusedAsset.usedBy.length, 0);

        // 2. DELETE /api/custom-overlays/assets/test-game-cover.png without ?force=1 -> Must reject with 409 Conflict
        const req2 = mockReq('DELETE', '/api/custom-overlays/assets/test-game-cover.png');
        const res2 = mockRes();
        const url2 = new URL('http://localhost/api/custom-overlays/assets/test-game-cover.png');
        await overlayRoutes(req2, res2, url2, '/api/custom-overlays/assets/test-game-cover.png');
        assert.equal(res2.getStatusCode(), 409, 'In-use tier list asset should reject deletion with 409');
        assert.ok(fs.existsSync(path.join(assetsDir, 'test-game-cover.png')), 'Asset file must still exist');

        // 3. POST /api/custom-overlays/assets/test-game-cover.png/rename -> Rename to super-metroid.png
        const req3 = mockReq('POST', '/api/custom-overlays/assets/test-game-cover.png/rename', { name: 'super-metroid' });
        const res3 = mockRes();
        const url3 = new URL('http://localhost/api/custom-overlays/assets/test-game-cover.png/rename');
        await overlayRoutes(req3, res3, url3, '/api/custom-overlays/assets/test-game-cover.png/rename');
        assert.equal(res3.getStatusCode(), 200);
        const renameResult = res3.getBody();
        assert.equal(renameResult.renamed, true);
        assert.ok(renameResult.updated.includes('tier-list'), 'updated list must include tier-list');

        // Verify tier list item imageUrl was updated
        const updatedItem = service.getState().items.find(i => i.id === item.id);
        assert.equal(updatedItem.imageUrl, '/custom-overlay-assets/super-metroid.png');
        assert.equal(service.getState().activeVote.itemImage, '/custom-overlay-assets/super-metroid.png');

        // 4. DELETE /api/custom-overlays/assets/super-metroid.png?force=1 -> Must succeed
        const req4 = mockReq('DELETE', '/api/custom-overlays/assets/super-metroid.png?force=1');
        const res4 = mockRes();
        const url4 = new URL('http://localhost/api/custom-overlays/assets/super-metroid.png?force=1');
        await overlayRoutes(req4, res4, url4, '/api/custom-overlays/assets/super-metroid.png');
        assert.equal(res4.getStatusCode(), 200);
        assert.equal(fs.existsSync(path.join(assetsDir, 'super-metroid.png')), false, 'File should now be deleted');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Browser UI: Unranked Pool Sortable draggable config and moving item back to unranked', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-unranked-ui-'));
    const staticRouter = require('../server/static-router');
    const service = createTierListService({ dataDir: tmpDir, log: () => {} });
    const item = service.addItem({ name: 'Chrono Trigger' });
    service.moveItem({ itemId: item.id, toTier: 'tier-s', toIndex: 0 });

    const handleRoutes = createTierListRoutes({ tierListService: service });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (await handleRoutes(req, res, url.pathname)) return;
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
        await page.goto(`http://127.0.0.1:${port}/tools/tier-list.html`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('.tier-content[data-tier-id="tier-s"] .item-card', { timeout: 10000 });

        // Verify Sortable on #unranked-pool ignores #pool-empty-hint via draggable: '.item-card'
        // so SortableJS recognizes the empty pool and allows dropping items back into it
        const unrankedSortConfig = await page.evaluate(() => {
            const pool = document.getElementById('unranked-pool');
            const inst = window.Sortable && window.Sortable.get(pool);
            return {
                hasInstance: Boolean(inst),
                draggable: inst?.options?.draggable,
                toArrayLen: inst?.toArray()?.length
            };
        });
        assert.equal(unrankedSortConfig.hasInstance, true);
        assert.equal(unrankedSortConfig.draggable, '.item-card');
        assert.equal(unrankedSortConfig.toArrayLen, 0, 'Empty unranked pool must have 0 draggable items despite #pool-empty-hint');

        // Simulate SortableJS drop from Tier S back to #unranked-pool
        await page.evaluate(async (itemId) => {
            const pool = document.getElementById('unranked-pool');
            const card = document.querySelector(`.item-card[data-item-id="${itemId}"]`);
            const fromEl = card.parentElement;
            pool.insertBefore(card, document.getElementById('pool-empty-hint'));
            const inst = window.Sortable.get(pool);
            inst.options.onEnd({
                item: card,
                from: fromEl,
                to: pool,
                newIndex: 0,
                newDraggableIndex: 0
            });
        }, item.id);

        await page.waitForFunction(
            () => document.getElementById('unranked-count')?.textContent === '1' &&
                document.getElementById('pool-empty-hint')?.style.display === 'none',
            { timeout: 5000 }
        );
        assert.equal(service.getState().items.find(i => i.id === item.id).tierId, null);
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Expanded theme persistence, normalization, presets, and banner asset tracking', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-theme-persist-'));
    try {
        const svc1 = createTierListService({ dataDir: tmpDir, log: () => {} });
        svc1.updateConfig({
            theme: {
                bannerUrl: '/custom-overlay-assets/header-banner.png',
                bannerMode: 'behind',
                bannerHeight: 999,
                bannerFit: 'contain',
                showCaptions: false,
                fitCaptions: true,
                autoFit: true,
                layout: 'sidebar',
                style: 'light',
                cardSize: 'compact',
                cardAspect: '3/4',
                cardFit: 'contain',
                howToVote: 'always',
                hintScale: '1.25',
                sfx: false
            }
        });

        let theme = svc1.getState().theme;
        assert.equal(theme.bannerUrl, '/custom-overlay-assets/header-banner.png');
        assert.equal(theme.bannerMode, 'behind');
        assert.equal(theme.bannerHeight, 240, 'bannerHeight must clamp to max 240');
        assert.equal(theme.bannerFit, 'contain');
        assert.equal(theme.showCaptions, false);
        assert.equal(theme.fitCaptions, true);
        assert.equal(theme.autoFit, true);
        assert.equal(theme.layout, 'sidebar');
        assert.equal(theme.style, 'light');
        assert.equal(theme.sfx, false);

        // Save preset with current theme, then test unsafe URL & height lower clamp
        const preset = svc1.savePreset({ name: 'Sidebar Dark Banner', includeItems: false });
        assert.equal(preset.theme.bannerUrl, '/custom-overlay-assets/header-banner.png');

        svc1.updateConfig({
            theme: {
                bannerUrl: 'javascript:alert(1)',
                bannerHeight: 12,
                bannerMode: 'invalid-mode',
                style: 'invalid-style'
            }
        });
        theme = svc1.getState().theme;
        assert.equal(theme.bannerUrl, '', 'Unsafe javascript: URL must be rejected');
        assert.equal(theme.bannerHeight, 48, 'bannerHeight must clamp to min 48');
        assert.equal(theme.bannerMode, 'behind', 'Invalid enum must keep previous valid value');
        assert.equal(theme.style, 'light', 'Invalid style must keep previous valid value');

        // Load preset restores saved theme + banner
        svc1.loadPreset(preset.id);
        assert.equal(svc1.getState().theme.bannerUrl, '/custom-overlay-assets/header-banner.png');

        // Asset usage tracking and reference rewriting include bannerUrl and preset banner
        const users = svc1.tierListAssetUsers('header-banner.png');
        assert.ok(users.some(u => u.id === 'tier-list:banner'));
        assert.ok(users.some(u => u.id === `tier-list:preset-banner:${preset.id}`));

        const renamed = svc1.rewriteTierListReferences('header-banner.png', 'season2-banner.png');
        assert.equal(renamed, true);
        assert.equal(svc1.getState().theme.bannerUrl, '/custom-overlay-assets/season2-banner.png');

        // Reload from disk in a fresh service instance
        const svc2 = createTierListService({ dataDir: tmpDir, log: () => {} });
        const reloadedTheme = svc2.getState().theme;
        assert.equal(reloadedTheme.bannerUrl, '/custom-overlay-assets/season2-banner.png');
        assert.equal(reloadedTheme.fitCaptions, true);
        assert.equal(reloadedTheme.autoFit, true);
        assert.equal(reloadedTheme.showCaptions, false);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Overlay & Studio Theming: Server-synced banner, caption toggles, always-fit captions, auto-fit viewport, and query overrides', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-overlay-theming-'));
    const staticRouter = require('../server/static-router');
    const bannerSvg = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='200'><rect width='1600' height='200' fill='#1e3a8a'/></svg>");
    const thumbSvg = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='#334155'/></svg>");

    const service = createTierListService({ dataDir: tmpDir, log: () => {} });
    // Create 8 tiers x 5 items = 40 items including a long-title item
    const eightTiers = [
        { id: 'tier-sp', label: 'S+', color: '#ff4b4b', description: 'GOAT' },
        { id: 'tier-s', label: 'S', color: '#ff7f7f', description: 'Top' },
        { id: 'tier-a', label: 'A', color: '#ffbf7f', description: 'Great' },
        { id: 'tier-b', label: 'B', color: '#ffdf7f', description: 'Good' },
        { id: 'tier-c', label: 'C', color: '#ffff7f', description: 'OK' },
        { id: 'tier-d', label: 'D', color: '#bfff7f', description: 'Meh' },
        { id: 'tier-e', label: 'E', color: '#7fff7f', description: 'Low' },
        { id: 'tier-f', label: 'F', color: '#8b949e', description: 'Skip' }
    ];
    const wideSvg = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='640' height='360' fill='#2563eb'/></svg>");
    const tallSvg = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450'><rect width='300' height='450' fill='#16a34a'/></svg>");
    service.updateConfig({
        tiers: eightTiers,
        theme: {
            bannerUrl: bannerSvg,
            bannerMode: 'replace',
            bannerHeight: 200,
            bannerFit: 'cover',
            showCaptions: true,
            fitCaptions: true,
            autoFit: true,
            hideUnranked: true
        }
    });

    const longItem = service.addItem({
        name: 'Super Long RPG Adventure Subtitle: Definitive Extended Director Cut Edition',
        imageUrl: thumbSvg,
        tierId: 'tier-sp'
    });
    const wideItem = service.addItem({ name: 'Wide Card', imageUrl: wideSvg, tierId: 'tier-s' });
    const tallItem = service.addItem({ name: 'Tall Card', imageUrl: tallSvg, tierId: 'tier-s' });
    for (let i = 0; i < 37; i++) {
        service.addItem({
            name: `Ranked Title ${i + 1}`,
            imageUrl: thumbSvg,
            tierId: eightTiers[i % eightTiers.length].id
        });
    }

    const handleRoutes = createTierListRoutes({ tierListService: service });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (await handleRoutes(req, res, url.pathname, url)) return;
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('{}');
        }
        router.handleRequest(req, res);
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    try {
        // 1. Clean overlay URL (no query params) loads server theme + banner + fitCaptions + autoFit at 1080p and 720p
        const overlayPage = await browser.newPage();
        await overlayPage.evaluateOnNewDocument(() => {
            window.WebSocket = class { close() {} send() {} };
        });
        await overlayPage.setViewport({ width: 1920, height: 1080 });
        await overlayPage.goto(`${origin}/overlays/tier-list.html`, { waitUntil: 'networkidle0' });
        await overlayPage.waitForSelector('#overlay-header.has-banner.banner-replace', { timeout: 10000 });
        await overlayPage.waitForFunction(() => document.body.classList.contains('auto-fit') && document.body.classList.contains('captions-fit'), { timeout: 5000 });

        const check1080 = await overlayPage.evaluate((longId) => {
            const titleStyle = getComputedStyle(document.getElementById('overlay-title'));
            const board = document.getElementById('overlay-board');
            const rows = Array.from(document.querySelectorAll('#overlay-board .overlay-row-items'));
            const rowOverflows = rows.filter(r => r.scrollHeight > r.clientHeight + 2).length;
            const longCap = document.querySelector(`.card[data-item-id="${longId}"] .card-caption`);
            const capCs = getComputedStyle(longCap);
            const hdrH = Math.round(document.getElementById('overlay-header').getBoundingClientRect().height);
            return {
                hdrH,
                titleDisplay: titleStyle.display,
                boardScrollH: board.scrollHeight,
                boardClientH: board.clientHeight,
                rowOverflows,
                capWhiteSpace: capCs.whiteSpace,
                capTextOverflow: capCs.textOverflow,
                capScrollW: longCap.scrollWidth,
                capClientW: longCap.clientWidth,
                capScrollH: longCap.scrollHeight,
                capClientH: longCap.clientHeight
            };
        }, longItem.id);

        assert.ok(check1080.hdrH >= 195 && check1080.hdrH <= 205, `Expected ~200px banner height on 1080p, got ${check1080.hdrH}`);
        assert.equal(check1080.titleDisplay, 'none', 'replace bannerMode should hide title text');
        assert.ok(check1080.boardScrollH <= check1080.boardClientH + 2, `1080p board overflowed: ${check1080.boardScrollH} > ${check1080.boardClientH}`);
        assert.equal(check1080.rowOverflows, 0, 'Every tier row must fit without clipping in auto-fit');
        assert.notEqual(check1080.capWhiteSpace, 'nowrap', 'fitCaptions must wrap multi-line text');
        assert.notEqual(check1080.capTextOverflow, 'ellipsis', 'fitCaptions must not truncate with ellipsis');
        assert.ok(check1080.capScrollW <= check1080.capClientW + 1, 'Wrapped caption width must fit card');
        assert.ok(check1080.capScrollH <= check1080.capClientH + 1, 'Shrunk caption height must fit card');
        const hyphenSetting = await overlayPage.$eval('.card-caption', el => getComputedStyle(el).hyphens);
        assert.notEqual(hyphenSetting, 'auto', 'Captions must not auto-hyphenate words');

        // Verify unranked pool captions never split single words mid-word or clip
        service.addItem({ name: 'Jarbochov', imageUrl: thumbSvg });
        service.addItem({ name: 'Mustard Carl', imageUrl: thumbSvg });
        service.updateConfig({ theme: { hideUnranked: false, fitCaptions: true, showCaptions: true } });
        await overlayPage.reload({ waitUntil: 'networkidle0' });
        await overlayPage.waitForSelector('#overlay-unranked-items .card', { timeout: 10000 });
        const poolTextCheck = await overlayPage.evaluate(() => {
            const caps = Array.from(document.querySelectorAll('#overlay-unranked-items .card-caption'));
            return caps.map(cap => {
                const cs = getComputedStyle(cap);
                const range = document.createRange();
                range.selectNodeContents(cap);
                return {
                    text: cap.textContent.trim(),
                    overflowWrap: cs.overflowWrap,
                    wordBreak: cs.wordBreak,
                    hyphens: cs.hyphens,
                    scrollW: cap.scrollWidth,
                    clientW: cap.clientWidth,
                    scrollH: cap.scrollHeight,
                    clientH: cap.clientHeight,
                    lineCount: range.getClientRects().length
                };
            });
        });
        for (const p of poolTextCheck) {
            assert.equal(p.overflowWrap, 'normal');
            assert.equal(p.wordBreak, 'normal');
            assert.equal(p.hyphens, 'none');
            assert.ok(p.scrollW <= p.clientW + 1, `Pool caption "${p.text}" width clipped: ${p.scrollW} > ${p.clientW}`);
            assert.ok(p.scrollH <= p.clientH + 1, `Pool caption "${p.text}" height clipped: ${p.scrollH} > ${p.clientH}`);
            if (p.text === 'Jarbochov') {
                assert.equal(p.lineCount, 1, 'Single word "Jarbochov" must stay on 1 unbroken line');
            }
        }
        service.updateConfig({ theme: { hideUnranked: true } });

        // Verify coverFit=natural preserves wide and tall aspect ratios without squishing
        await overlayPage.goto(`${origin}/overlays/tier-list.html?coverFit=natural&aspect=1/1`, { waitUntil: 'networkidle0' });
        await overlayPage.waitForFunction(() => document.body.classList.contains('fit-natural'), { timeout: 5000 });
        await new Promise(r => setTimeout(r, 120));
        const naturalMetrics = await overlayPage.evaluate((wId, tId) => {
            const wCard = document.querySelector(`.card[data-item-id="${wId}"]`);
            const tCard = document.querySelector(`.card[data-item-id="${tId}"]`);
            const wRect = wCard.getBoundingClientRect();
            const tRect = tCard.getBoundingClientRect();
            const wImgCs = getComputedStyle(wCard.querySelector('img'));
            return {
                wRatio: wRect.width / wRect.height,
                tRatio: tRect.width / tRect.height,
                imgFit: wImgCs.objectFit
            };
        }, wideItem.id, tallItem.id);
        assert.notEqual(naturalMetrics.imgFit, 'fill', 'Natural fit must not use object-fit: fill');
        assert.ok(naturalMetrics.wRatio > 1.5, `Wide 16:9 image should stay wide in natural mode, got ratio ${naturalMetrics.wRatio}`);
        assert.ok(naturalMetrics.tRatio < 0.85, `Tall 2:3 image should stay tall in natural mode, got ratio ${naturalMetrics.tRatio}`);
        await overlayPage.goto(`${origin}/overlays/tier-list.html`, { waitUntil: 'networkidle0' });
        await overlayPage.waitForSelector('#overlay-header.has-banner.banner-replace', { timeout: 10000 });

        // Also test 720p dense board auto-fit
        await overlayPage.setViewport({ width: 1280, height: 720 });
        await new Promise(r => setTimeout(r, 120));
        const check720 = await overlayPage.evaluate(() => {
            const board = document.getElementById('overlay-board');
            const rows = Array.from(document.querySelectorAll('#overlay-board .overlay-row-items'));
            return {
                boardFits: board.scrollHeight <= board.clientHeight + 2,
                rowOverflows: rows.filter(r => r.scrollHeight > r.clientHeight + 2).length
            };
        });
        assert.equal(check720.boardFits, true, '720p board must fit inside viewport');
        assert.equal(check720.rowOverflows, 0, '720p tier rows must not clip');

        // 2. Server updates (bannerMode: behind, showCaptions: false) take effect cleanly without query params
        service.updateConfig({ theme: { bannerMode: 'behind', showCaptions: false } });
        await overlayPage.reload({ waitUntil: 'networkidle0' });
        await overlayPage.waitForSelector('#overlay-header.has-banner.banner-behind', { timeout: 10000 });
        const behindState = await overlayPage.evaluate(() => ({
            titleDisplay: getComputedStyle(document.getElementById('overlay-title')).display,
            captionsHidden: document.body.classList.contains('captions-hidden'),
            firstCaptionDisplay: getComputedStyle(document.querySelector('.card-caption')).display
        }));
        assert.notEqual(behindState.titleDisplay, 'none', 'behind bannerMode must keep title visible');
        assert.equal(behindState.captionsHidden, true);
        assert.equal(behindState.firstCaptionDisplay, 'none', 'showCaptions: false must hide captions');

        // 3. Explicit URL query params override saved server config
        await overlayPage.goto(`${origin}/overlays/tier-list.html?captions=1&theme=light&bannerMode=replace`, { waitUntil: 'networkidle0' });
        await overlayPage.waitForSelector('#overlay-header.has-banner.banner-replace', { timeout: 10000 });
        const overrideState = await overlayPage.evaluate(() => ({
            lightTheme: document.body.classList.contains('theme-light'),
            captionsHidden: document.body.classList.contains('captions-hidden'),
            firstCaptionDisplay: getComputedStyle(document.querySelector('.card-caption')).display
        }));
        assert.equal(overrideState.lightTheme, true);
        assert.equal(overrideState.captionsHidden, false);
        assert.notEqual(overrideState.firstCaptionDisplay, 'none');
        await overlayPage.close();

        // 4. Studio Overlay & Theming tab saves changes to server + updates preview without reload
        const studioPage = await browser.newPage();
        await studioPage.evaluateOnNewDocument(() => {
            window.WebSocket = class { close() {} send() {} };
        });
        let previewReloads = 0;
        studioPage.on('framenavigated', frame => {
            if (frame.url().includes('/overlays/tier-list.html')) previewReloads += 1;
        });

        await studioPage.setViewport({ width: 1440, height: 900 });
        await studioPage.goto(`${origin}/tools/tier-list.html`, { waitUntil: 'networkidle0' });
        await studioPage.click('#tab-btn-theming');
        await studioPage.waitForSelector('#theming-preview-url', { timeout: 10000 });
        await studioPage.waitForFunction(() => {
            const frame = document.getElementById('tier-preview-iframe');
            return frame?.dataset.initialLoaded === 'true' && frame.contentDocument?.getElementById('overlay-board');
        });
        const initialLoads = previewReloads;

        // Permanent OBS URL stays clean without query parameters
        const cleanObsUrl = await studioPage.$eval('#theming-preview-url', el => el.value);
        assert.ok(cleanObsUrl.endsWith('/overlays/tier-list.html'));

        // Toggle switches render cleanly as 36px pills (overriding admin.css checkbox width)
        const switchWidth = await studioPage.$eval('#overlay-opt-show-captions', el => getComputedStyle(el).width);
        assert.equal(switchWidth, '36px', 'Toggle switch must override admin checkbox width to 36px');

        // Enable Show Captions via Studio toggle -> saves to server & updates preview without reload
        await studioPage.click('#overlay-opt-show-captions');
        await studioPage.waitForFunction(() => {
            const frame = document.getElementById('tier-preview-iframe');
            return frame?.contentDocument && !frame.contentDocument.body.classList.contains('captions-hidden');
        }, { timeout: 5000 });
        await studioPage.waitForFunction(() => document.getElementById('theming-sync-status')?.textContent.includes('Synced'), { timeout: 5000 });

        assert.equal(service.getState().theme.showCaptions, true);
        assert.equal(previewReloads, initialLoads, 'Studio theming changes must sync via postMessage without reloading iframe');

        // Verify banner preview thumbnail shows server-configured banner
        const bannerPreviewVisible = await studioPage.$eval('#banner-preview-img', el => !el.hidden);
        assert.equal(bannerPreviewVisible, true);
        await studioPage.close();
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service: Custom themes, typography/color sanitizers, legacy migration & font asset tracking', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-themes-fonts-'));
    try {
        // 1. Verify legacy dead-default triple migrates cleanly on load()
        const legacyFile = path.join(tmpDir, 'tier-list.json');
        fs.writeFileSync(legacyFile, JSON.stringify({
            title: 'Legacy List',
            theme: {
                style: 'light',
                backgroundColor: 'rgba(13, 17, 23, 0.92)',
                textColor: '#f0f6fc',
                accentColor: '#3b82f6'
            }
        }));
        const migratedSvc = createTierListService({ dataDir: tmpDir, log: () => {} });
        const migratedTheme = migratedSvc.getState().theme;
        assert.equal(migratedTheme.style, 'light');
        assert.equal(migratedTheme.backgroundColor, '', 'Legacy dead-default bg should migrate to empty');
        assert.equal(migratedTheme.textColor, '', 'Legacy dead-default text should migrate to empty');
        assert.equal(migratedTheme.accentColor, '', 'Legacy dead-default accent should migrate to empty');

        // 2. Save full StreamPulse theme + typography + color overrides + custom Asset Library font
        migratedSvc.updateConfig({
            theme: {
                style: 'cyber',
                headingFont: 'Cool Arcade',
                fontFamily: 'Inter',
                fontWeight: 'bold',
                fontScale: 1.25,
                textTransform: 'uppercase',
                textOutline: 'strong',
                backgroundColor: 'rgba(12, 20, 36, 0.9)',
                rowBackgroundColor: '#111827',
                borderColor: '#00f0ff',
                textColor: '#ffffff',
                mutedColor: '#67e8f9',
                accentColor: '#ff0055',
                borderRadius: '12px',
                backdropBlur: '16px'
            }
        });
        const t = migratedSvc.getState().theme;
        assert.equal(t.style, 'cyber');
        assert.equal(t.headingFont, 'Cool Arcade');
        assert.equal(t.fontFamily, 'Inter');
        assert.equal(t.fontWeight, '700');
        assert.equal(t.fontScale, 1.25);
        assert.equal(t.textTransform, 'uppercase');
        assert.equal(t.textOutline, 'strong');
        assert.equal(t.backgroundColor, 'rgba(12, 20, 36, 0.9)');
        assert.equal(t.rowBackgroundColor, '#111827');
        assert.equal(t.borderRadius, '12px');
        assert.equal(t.backdropBlur, '16px');

        // 3. Reject unsafe CSS / font / injection inputs
        migratedSvc.updateConfig({
            theme: {
                backgroundColor: 'red; background: url(http://evil.example/x.png)',
                rowBackgroundColor: 'expression(alert(1))',
                headingFont: 'Oswald";}</style>',
                fontWeight: 'heavy',
                fontScale: 99,
                textTransform: 'blink',
                borderRadius: 'calc(100% + 10px)',
                backdropBlur: '999px'
            }
        });
        const sanitized = migratedSvc.getState().theme;
        assert.equal(sanitized.backgroundColor, '');
        assert.equal(sanitized.rowBackgroundColor, '');
        assert.equal(sanitized.headingFont, 'Oswald/style');
        assert.equal(sanitized.fontWeight, '');
        assert.equal(sanitized.fontScale, 2.5);
        assert.equal(sanitized.textTransform, '');
        assert.equal(sanitized.borderRadius, '');
        assert.equal(sanitized.backdropBlur, '24px');

        // 4. Font usage tracking matches only uploaded font extensions, not images
        migratedSvc.updateConfig({ theme: { headingFont: 'Cool Arcade' } });
        const fontUsers = migratedSvc.tierListAssetUsers('Cool-Arcade.woff2');
        assert.ok(fontUsers.some(u => u.id === 'tier-list:font'));
        const nonFontUsers = migratedSvc.tierListAssetUsers('Cool-Arcade.png');
        assert.equal(nonFontUsers.some(u => u.id === 'tier-list:font'), false);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service & Routes: Disabling chat voting cancels active vote and blocks chat/route triggers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-disable-voting-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });
        const handleRoutes = createTierListRoutes({ tierListService: service });
        const item = service.addItem({ name: 'Hollow Knight', imageUrl: '/assets/hk.png' });

        // Start a vote first
        service.startVote({ itemId: item.id, duration: 60 });
        assert.ok(service.getState().activeVote);

        // Turn off chat voting -> activeVote must cancel cleanly
        service.updateConfig({ settings: { chatVotingEnabled: false } });
        assert.equal(service.getState().settings.chatVotingEnabled, false);
        assert.equal(service.getState().activeVote, null);

        // Chat commands and manual castVote are rejected
        assert.equal(service.handleChatMessage({ chatname: 'Viewer1', userId: 'v1', message: '!tier S' }), false);
        assert.equal(service.castVote({ user: 'Viewer1', userId: 'v1', tierId: 'tier-s' }), false);

        // Starting a vote via service throws 409 error
        assert.throws(() => service.startVote({ itemId: item.id }), err => err.statusCode === 409);

        function mockReq(method, pathname) {
            const stream = new (require('stream').Readable)();
            stream.push(null);
            stream.method = method;
            stream.url = pathname;
            stream.headers = {};
            return stream;
        }
        function mockRes() {
            let statusCode = 200;
            let body = '';
            return {
                writeHead(code) { statusCode = code; },
                end(data) { if (data) body += data; },
                getStatusCode: () => statusCode,
                getBody: () => body ? JSON.parse(body) : null
            };
        }

        // GET /api/tier-list/status reports chatVotingEnabled: false & voteStatus: 'disabled'
        const statusRes = mockRes();
        await handleRoutes(mockReq('GET', '/api/tier-list/status'), statusRes, '/api/tier-list/status');
        assert.equal(statusRes.getStatusCode(), 200);
        assert.equal(statusRes.getBody().chatVotingEnabled, false);
        assert.equal(statusRes.getBody().voteStatus, 'disabled');

        // POST /api/tier-list/vote/start returns 409 when chat voting is disabled
        const startRes = mockRes();
        await handleRoutes(mockReq('POST', '/api/tier-list/vote/start'), startRes, '/api/tier-list/vote/start');
        assert.equal(startRes.getStatusCode(), 409);

        // Re-enable chat voting -> starting a vote works again
        service.updateConfig({ settings: { chatVotingEnabled: true } });
        const startOkRes = mockRes();
        await handleRoutes(mockReq('GET', '/api/tier-list/vote/start'), startOkRes, '/api/tier-list/vote/start');
        assert.equal(startOkRes.getStatusCode(), 200);
        assert.ok(startOkRes.getBody().activeVote);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Browser UI: StreamPulse theme presets, custom fonts/colors, saved custom theme & Disable Chat Voting UX', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-e2e-themes-voting-'));
    const staticRouter = require('../server/static-router');
    const thumbSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='#334155'/></svg>");
    const service = createTierListService({ dataDir: tmpDir, log: () => {} });
    service.addItem({ name: 'Chrono Trigger', imageUrl: thumbSvg, tierId: 'tier-s' });
    service.updateConfig({ theme: { howToVote: 'always' } });

    const handleRoutes = createTierListRoutes({ tierListService: service });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (await handleRoutes(req, res, url.pathname, url)) return;
        if (url.pathname.startsWith('/api/custom-overlays/assets')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('[]');
        }
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('{}');
        }
        router.handleRequest(req, res);
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    try {
        const studioPage = await browser.newPage();
        await studioPage.evaluateOnNewDocument(() => {
            window.WebSocket = class { close() {} send() {} };
        });
        let previewReloads = 0;
        studioPage.on('framenavigated', frame => {
            if (frame.url().includes('/overlays/tier-list.html')) previewReloads += 1;
        });

        await studioPage.setViewport({ width: 1440, height: 900 });
        await studioPage.goto(`${origin}/tools/tier-list.html`, { waitUntil: 'networkidle0' });
        await studioPage.waitForSelector('.item-card', { timeout: 10000 });

        // 1. Open Settings modal & disable Chat Voting
        await studioPage.click('#btn-settings');
        await studioPage.waitForSelector('#setting-chat-voting', { visible: true, timeout: 5000 });
        const beforeDisabled = await studioPage.$eval('#group-chat-vote-settings', el => el.hidden);
        assert.equal(beforeDisabled, false);

        await studioPage.click('#setting-chat-voting');
        const afterToggleHidden = await studioPage.$eval('#group-chat-vote-settings', el => el.hidden);
        assert.equal(afterToggleHidden, true, 'Dependent chat voting options must hide when Chat Voting is off');

        await studioPage.click('#btn-save-settings');
        await studioPage.waitForFunction(() => document.querySelectorAll('[data-action="start-vote"]').length === 0, { timeout: 5000 });
        const tabText = await studioPage.$eval('#tab-btn-board span', el => el.textContent.trim());
        assert.equal(tabText, 'Board');
        assert.equal(service.getState().settings.chatVotingEnabled, false);

        // Verify live overlay hides voting hint ribbon even when ?howtovote=always is set while voting disabled
        const disabledOverlayPage = await browser.newPage();
        await disabledOverlayPage.evaluateOnNewDocument(() => { window.WebSocket = class { close() {} send() {} }; });
        await disabledOverlayPage.goto(`${origin}/overlays/tier-list.html?howtovote=always`, { waitUntil: 'networkidle0' });
        await disabledOverlayPage.waitForSelector('#overlay-board', { timeout: 10000 });
        const hintVisibleWhenDisabled = await disabledOverlayPage.$eval('#overlay-how-to-vote', el => el.classList.contains('visible'));
        assert.equal(hintVisibleWhenDisabled, false, 'Hint ribbon must stay hidden when chat voting is disabled');
        await disabledOverlayPage.close();

        // 2. Verify Overlay & Theming sub-section hides voting controls, then test Themes, Fonts, Colors, Custom Theme
        await studioPage.click('#tab-btn-theming');
        await studioPage.waitForFunction(() => {
            const frame = document.getElementById('tier-preview-iframe');
            return frame?.dataset.initialLoaded === 'true' && frame.contentDocument?.getElementById('overlay-board');
        }, { timeout: 10000 });
        const initialLoads = previewReloads;

        const overlayVotingHidden = await studioPage.$eval('#tl-section-voting-overlay', el => el.hidden);
        assert.equal(overlayVotingHidden, true, 'Voting Hint & Audio controls must hide when chat voting is disabled');

        // Select built-in StreamPulse theme 'cyber'
        await studioPage.select('#overlay-opt-theme', 'cyber');
        const previewFrame = studioPage.frames().find(f => f.url().includes('/overlays/tier-list.html'));
        await previewFrame.waitForFunction(() => document.body.classList.contains('theme-cyber'), { timeout: 5000 });
        await studioPage.waitForFunction(() => document.getElementById('theming-sync-status')?.textContent.includes('Synced'), { timeout: 5000 });
        assert.equal(service.getState().theme.style, 'cyber');

        // Switch to Fonts & Framing sub-tab & set custom fonts + framing
        await studioPage.$eval('#tl-subtab-btn-typography', el => el.click());
        await studioPage.waitForSelector('#tl-subpanel-typography', { visible: true });
        await studioPage.type('#overlay-opt-heading-font', 'Oswald');
        await studioPage.type('#overlay-opt-font', 'Inter');
        await studioPage.select('#overlay-opt-weight', '700');
        await studioPage.select('#overlay-opt-fontscale', '1.25');
        await studioPage.select('#overlay-opt-transform', 'uppercase');
        await studioPage.select('#overlay-opt-outline', 'strong');
        await studioPage.select('#overlay-opt-radius', '16px');

        // Switch to Colors sub-tab & apply swatch + custom background
        await studioPage.$eval('#tl-subtab-btn-colors', el => el.click());
        await studioPage.waitForSelector('#tl-subpanel-colors', { visible: true });
        await studioPage.click('#tl-accent-chips .tl-p-chip[data-color="#10b981"]');
        await studioPage.type('#overlay-opt-bg', '#121826');
        await studioPage.$eval('#overlay-opt-bg', el => el.dispatchEvent(new Event('change', { bubbles: true })));

        await previewFrame.waitForFunction(() => {
            const cs = getComputedStyle(document.documentElement);
            return cs.getPropertyValue('--tl-heading-font').includes('Oswald')
                && cs.getPropertyValue('--tl-font').includes('Inter')
                && cs.getPropertyValue('--tl-accent').trim() === '#10b981'
                && cs.getPropertyValue('--tl-bg').trim() === '#121826'
                && cs.getPropertyValue('--tl-radius').trim() === '16px';
        }, { timeout: 5000 });
        await studioPage.waitForFunction(() => document.getElementById('theming-sync-status')?.textContent.includes('Synced'), { timeout: 5000 });
        assert.equal(previewReloads, initialLoads, 'All theme/font/color edits must sync via postMessage without reloading iframe');

        // Save custom theme via modal
        await studioPage.$eval('#btn-save-custom-theme', el => el.click());
        await studioPage.waitForSelector('#modal-save-theme.open #save-theme-name', { visible: true });
        await studioPage.type('#save-theme-name', 'Synthwave Tier');
        await studioPage.click('#modal-save-theme button[type="submit"]');
        await studioPage.waitForFunction(() => document.getElementById('overlay-opt-theme')?.value === 'synthwave-tier', { timeout: 5000 });
        await studioPage.waitForFunction(() => document.getElementById('theming-sync-status')?.textContent.includes('Synced'), { timeout: 5000 });
        assert.equal(service.getState().theme.style, 'custom');
        assert.equal(service.getState().theme.customThemeId, 'synthwave-tier');
        assert.equal(previewReloads, initialLoads);

        await studioPage.close();

        // 3. Test clean overlay URL reads server-persisted custom theme/fonts/colors AND URL overrides win
        const cleanPage = await browser.newPage();
        await cleanPage.evaluateOnNewDocument(() => { window.WebSocket = class { close() {} send() {} }; });
        await cleanPage.goto(`${origin}/overlays/tier-list.html`, { waitUntil: 'networkidle0' });
        await cleanPage.waitForSelector('#overlay-board', { timeout: 10000 });
        const cleanVars = await cleanPage.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            return {
                headingFont: cs.getPropertyValue('--tl-heading-font'),
                font: cs.getPropertyValue('--tl-font'),
                accent: cs.getPropertyValue('--tl-accent').trim(),
                bg: cs.getPropertyValue('--tl-bg').trim(),
                radius: cs.getPropertyValue('--tl-radius').trim(),
                transform: cs.getPropertyValue('--tl-text-transform').trim()
            };
        });
        assert.ok(cleanVars.headingFont.includes('Oswald'));
        assert.ok(cleanVars.font.includes('Inter'));
        assert.equal(cleanVars.accent, '#10b981');
        assert.equal(cleanVars.bg, '#121826');
        assert.equal(cleanVars.radius, '16px');
        assert.equal(cleanVars.transform, 'uppercase');

        await cleanPage.goto(`${origin}/overlays/tier-list.html?theme=fgc-evo&headingfont=Cinzel&font=Roboto&accent=%23ffd700&radius=4px&transform=capitalize`, { waitUntil: 'networkidle0' });
        await cleanPage.waitForFunction(() => document.body.classList.contains('theme-fgc-evo'), { timeout: 5000 });
        const overrideVars = await cleanPage.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            return {
                headingFont: cs.getPropertyValue('--tl-heading-font'),
                font: cs.getPropertyValue('--tl-font'),
                accent: cs.getPropertyValue('--tl-accent').trim(),
                radius: cs.getPropertyValue('--tl-radius').trim(),
                transform: cs.getPropertyValue('--tl-text-transform').trim()
            };
        });
        assert.ok(overrideVars.headingFont.includes('Cinzel'));
        assert.ok(overrideVars.font.includes('Roboto'));
        assert.equal(overrideVars.accent, '#ffd700');
        assert.equal(overrideVars.radius, '4px');
        assert.equal(overrideVars.transform, 'capitalize');
        await cleanPage.close();
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Service & Routes: Sound sync, 0 volume, exact S+ chat match, and focus/enlarge state', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-sound-focus-'));
    try {
        const service = createTierListService({ dataDir: tmpDir, log: () => {} });
        const handleRoutes = createTierListRoutes({ tierListService: service });

        // 1. settings.soundEnabled: false syncs theme.sfx: false, and soundVolume: 0 persists as 0
        service.updateConfig({ settings: { soundEnabled: false, soundVolume: 0 } });
        assert.equal(service.getState().settings.soundEnabled, false);
        assert.equal(service.getState().settings.soundVolume, 0);
        assert.equal(service.getState().theme.sfx, false);

        // 2. Exact match on S+ and S+! before stripped S
        const extended = service.getState().presets.find(p => p.id === 'preset-extended');
        service.loadPreset(extended.id);
        const item = service.addItem({ name: 'Elden Ring', imageUrl: '/assets/er.png' });
        service.startVote({ itemId: item.id, duration: 60 });
        assert.equal(service.handleChatMessage({ chatname: 'P1', userId: 'p1', message: '!tier S+' }), true);
        assert.equal(service.getState().activeVote.votes['p1'].tierId, 'tier-sp');
        assert.equal(service.handleChatMessage({ chatname: 'P2', userId: 'p2', message: '!tier S+!' }), true);
        assert.equal(service.getState().activeVote.votes['p2'].tierId, 'tier-sp');
        assert.equal(service.handleChatMessage({ chatname: 'P3', userId: 'p3', message: '!tier S' }), true);
        assert.equal(service.getState().activeVote.votes['p3'].tierId, 'tier-s');
        service.cancelVote();

        // 3. focusItem / clearFocus & theme.focusEnlarge persistence + routes
        service.updateConfig({ theme: { focusEnlarge: true } });
        assert.equal(service.getState().theme.focusEnlarge, true);

        function mockReq(method, pathname) {
            const stream = new (require('stream').Readable)();
            stream.push(null);
            stream.method = method;
            stream.url = pathname;
            stream.headers = {};
            return stream;
        }
        function mockRes() {
            let statusCode = 200;
            let body = '';
            return {
                writeHead(code) { statusCode = code; },
                end(data) { if (data) body += data; },
                getStatusCode: () => statusCode,
                getBody: () => body ? JSON.parse(body) : null
            };
        }

        const focusRes = mockRes();
        await handleRoutes(mockReq('GET', `/api/tier-list/focus?itemId=${item.id}`), focusRes, '/api/tier-list/focus', new URL(`http://localhost/api/tier-list/focus?itemId=${item.id}`));
        assert.equal(focusRes.getStatusCode(), 200);
        assert.equal(focusRes.getBody().focusedItemId, item.id);

        const clearRes = mockRes();
        await handleRoutes(mockReq('GET', '/api/tier-list/focus/clear'), clearRes, '/api/tier-list/focus/clear', new URL('http://localhost/api/tier-list/focus/clear'));
        assert.equal(clearRes.getStatusCode(), 200);
        assert.equal(clearRes.getBody().focusedItemId, null);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier List Overlay UX: Single timer, single voting hint, dynamic !tier chips, wrapped descriptions, muted audio & focus/enlarge art', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-overlay-ux-'));
    const staticRouter = require('../server/static-router');
    const thumbSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#2563eb'/></svg>");

    const service = createTierListService({ dataDir: tmpDir, log: () => {} });
    service.updateConfig({
        tiers: [
            { id: 'tier-s', label: 'S', color: '#1e1b4b', description: 'Top Tier' },
            { id: 'tier-a', label: 'A', color: '#ffbf7f', description: 'Great' },
            { id: 'tier-d', label: 'D', color: '#bfff7f', description: 'Below Average' },
            { id: 'tier-f', label: 'F', color: '#7fff7f', description: 'Bottom Tier' }
        ],
        settings: { soundEnabled: false },
        theme: { howToVote: 'always', sfx: true, focusEnlarge: true }
    });
    const item = service.addItem({ name: 'Chrono Trigger', imageUrl: thumbSvg, note: 'Time-travel classic' });

    const handleRoutes = createTierListRoutes({ tierListService: service });
    const router = staticRouter.createStaticRouter({ rootDir: path.join(__dirname, '..') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (await handleRoutes(req, res, url.pathname, url)) return;
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('{}');
        }
        router.handleRequest(req, res);
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    try {
        // 1. Focused item without voting shows enlarged artwork stage
        service.focusItem(item.id);
        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
            window.__audioCtxCreated = 0;
            const Orig = window.AudioContext || window.webkitAudioContext;
            if (Orig) {
                window.AudioContext = class extends Orig {
                    constructor(...a) { window.__audioCtxCreated++; super(...a); }
                };
            }
            window.WebSocket = class { close() {} send() {} };
        });
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(`${origin}/overlays/tier-list.html`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#overlay-focus-stage.active', { timeout: 10000 });

        const focusOnlyCheck = await page.evaluate(() => {
            const imgRect = document.getElementById('focus-stage-img').getBoundingClientRect();
            return {
                hudActive: document.getElementById('vote-hud-overlay').classList.contains('active'),
                stageBadge: document.getElementById('focus-stage-badge').textContent.trim(),
                stageTitle: document.getElementById('focus-stage-title').textContent.trim(),
                imgWidth: imgRect.width,
                imgHeight: imgRect.height
            };
        });
        assert.equal(focusOnlyCheck.hudActive, false);
        assert.equal(focusOnlyCheck.stageBadge, 'Selected');
        assert.equal(focusOnlyCheck.stageTitle, 'Chrono Trigger');
        assert.ok(focusOnlyCheck.imgWidth >= 150 && focusOnlyCheck.imgHeight >= 150, 'Focused artwork must be enlarged');

        // 2. Active vote: single timer, single voting hint, dynamic !tier chips, contrast pill, wrapped descriptions, muted audio
        service.startVote({ itemId: item.id, duration: 45 });
        service.castVote({ user: 'Tester', userId: 'u1', tierId: 'tier-s' });
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForSelector('#vote-hud-overlay.active', { timeout: 10000 });

        const voteCheck = await page.evaluate(() => {
            const hintVisible = document.getElementById('overlay-how-to-vote').classList.contains('visible');
            const badgeText = document.getElementById('overlay-vote-badge').textContent;
            const hudCmdText = document.getElementById('hud-cmd').textContent;
            const hudImgDisplay = getComputedStyle(document.getElementById('hud-img')).display;
            const consensusStyle = getComputedStyle(document.getElementById('hud-consensus'));
            const hudRect = document.getElementById('vote-hud-overlay').getBoundingClientRect();
            const subChecks = Array.from(document.querySelectorAll('.overlay-row-sub')).map(el => {
                const cs = getComputedStyle(el);
                return {
                    text: el.textContent,
                    whiteSpace: cs.whiteSpace,
                    scrollW: el.scrollWidth,
                    clientW: el.clientWidth,
                    scrollH: el.scrollHeight,
                    clientH: el.clientHeight
                };
            });
            return {
                hintVisible,
                badgeText,
                hudCmdText,
                hudImgDisplay,
                consensusColor: consensusStyle.color,
                hudRightEdge: hudRect.right,
                hudBottomEdge: hudRect.bottom,
                subChecks,
                audioCtxCreated: window.__audioCtxCreated
            };
        });

        assert.equal(voteCheck.hintVisible, false, 'Top hint ribbon must NOT duplicate active vote card');
        assert.ok(!/\d+s/.test(voteCheck.badgeText), 'Top vote badge must NOT show a duplicate countdown timer');
        assert.ok(voteCheck.hudCmdText.includes('!tier'), 'HUD must show !tier command');
        assert.ok(!voteCheck.hudCmdText.includes('<tier>'), 'HUD must NOT show cryptic <tier> angle brackets');
        assert.equal(voteCheck.hudImgDisplay, 'none', 'Small #hud-img must hide when focusEnlarge stage is active');
        assert.equal(voteCheck.consensusColor, 'rgb(255, 255, 255)', 'Dark tier color #1e1b4b must use white contrast text');
        assert.equal(voteCheck.audioCtxCreated, 0, 'AudioContext must not be created when settings.soundEnabled is false');
        assert.ok(voteCheck.hudRightEdge <= 1920 && voteCheck.hudBottomEdge <= 1080);
        for (const sub of voteCheck.subChecks) {
            assert.notEqual(sub.whiteSpace, 'nowrap', `Tier description "${sub.text}" must wrap`);
            assert.ok(sub.scrollW <= sub.clientW + 1, `Tier description "${sub.text}" width clipped`);
            assert.ok(sub.scrollH <= sub.clientH + 1, `Tier description "${sub.text}" height clipped`);
        }

        // 3. Sidebar 440x1080 viewport keeps HUD + focus stage inside bounds
        await page.setViewport({ width: 440, height: 1080 });
        await page.goto(`${origin}/overlays/tier-list.html?layout=sidebar&focusEnlarge=1`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#vote-hud-overlay.active', { timeout: 10000 });
        const sidebarRect = await page.evaluate(() => {
            const hud = document.getElementById('vote-hud-overlay').getBoundingClientRect();
            const stage = document.getElementById('overlay-focus-stage').getBoundingClientRect();
            return { hudLeft: hud.left, hudRight: hud.right, stageLeft: stage.left, stageRight: stage.right };
        });
        assert.ok(sidebarRect.hudLeft >= 0 && sidebarRect.hudRight <= 440, `Sidebar HUD overflowed: ${JSON.stringify(sidebarRect)}`);
        assert.ok(sidebarRect.stageLeft >= 0 && sidebarRect.stageRight <= 440, `Sidebar focus stage overflowed: ${JSON.stringify(sidebarRect)}`);

        await page.close();
    } finally {
        await browser.close();
        await new Promise(r => server.close(r));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
