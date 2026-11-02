'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTierListService, calculateConsensus, DEFAULT_TIERS } = require('../server/services/tier-list');
const { createTierListRoutes } = require('../server/routes/tier-list');
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

        // 7. Presets API: delete & reset
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
