'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const createChatbot = require('../server/services/chatbot');
const { createPollService } = require('../server/services/polls');

test('Chatbot Poll Announcements: formatting, readiness, and poll service integration', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poll-announce-test-'));

    // Mock global fetch for SocialStream
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

    const config = {
        chatbot_enabled: true,
        ssn: { session_id: 'test-session-123' }
    };

    const chatbot = createChatbot({
        dataDir: tmpDir,
        getConfig: () => config,
        sessionKey: () => 'test-session'
    });

    let pollService;
    t.after(() => {
        globalThis.fetch = originalFetch;
        chatbot.stop();
        if (pollService) pollService.destroy();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    // Check default status
    const status = chatbot.isReady();
    assert.equal(status.ready, true, 'Chatbot should report ready when enabled with session ID');

    // Announce poll start
    const startResult = await chatbot.announcePollStart({
        title: 'Best RPG',
        choices: [{ title: 'Chrono Trigger' }, { title: 'Final Fantasy VI' }],
        duration: 60
    });
    assert.equal(startResult.sent, true);
    assert.equal(sentMessages.length, 3, 'Should send title plus one message per choice');
    assert.ok(sentMessages[0].includes('Best RPG'));
    assert.ok(sentMessages[0].includes('60s'));
    assert.ok(sentMessages[1].includes('!vote 1: Chrono Trigger'));
    assert.ok(sentMessages[2].includes('!vote 2: Final Fantasy VI'));

    // Announce poll end (winner)
    const endResult = await chatbot.announcePollEnd({
        title: 'Best RPG',
        winner: 'Chrono Trigger',
        winningVotes: 25,
        winningPercent: 71,
        totalVotes: 35
    });
    assert.equal(endResult.sent, true);
    const endMsg = sentMessages[sentMessages.length - 1];
    assert.ok(endMsg.includes('Chrono Trigger'));
    assert.ok(endMsg.includes('25 votes'));
    assert.ok(endMsg.includes('71%'));

    // Announce poll end (tie)
    const tieResult = await chatbot.announcePollEnd({
        title: 'Best RPG',
        isTie: true,
        choices: [{ title: 'Chrono Trigger' }, { title: 'Final Fantasy VI' }]
    });
    assert.equal(tieResult.sent, true);
    const tieMsg = sentMessages[sentMessages.length - 1];
    assert.ok(tieMsg.includes('tie'));

    // Announce tournament champion
    const champResult = await chatbot.announceTournamentChampion({
        title: 'Championship 2026',
        champion: 'EarthBound'
    });
    assert.equal(champResult.sent, true);
    const champMsg = sentMessages[sentMessages.length - 1];
    assert.ok(champMsg.includes('EarthBound'));
    assert.ok(champMsg.includes('Championship 2026'));

    // Test integration with Poll Service
    pollService = createPollService({
        dataDir: tmpDir,
        chatbotAnnouncer: chatbot,
        broadcastToOverlays: () => {},
        onTakeover: () => {},
        onAlert: () => {}
    });

    sentMessages.length = 0;

    // Creating poll with announceChat: true posts start announcement
    const poll1 = pollService.createPoll({
        title: 'Favorite Starter',
        choices: ['Bulbasaur', 'Charmander', 'Squirtle'],
        duration: 30,
        announceChat: true
    });
    assert.ok(poll1);
    // Yield event loop for multi-line choices
    await new Promise(r => setTimeout(r, 1300));
    assert.ok(sentMessages.length >= 4, 'Header plus 3 choice announcements should be dispatched');
    assert.ok(sentMessages[0].includes('Favorite Starter'));
    assert.ok(sentMessages[1].includes('!vote 1: Bulbasaur'));
    assert.ok(sentMessages[2].includes('!vote 2: Charmander'));
    assert.ok(sentMessages[3].includes('!vote 3: Squirtle'));

    // Simulate incoming bot messages from SocialStream echo - these must NEVER count as votes!
    const botSelfVoted1 = pollService.handleChatMessage({ chatname: 'BroadcasterBot', message: '!vote 1: Bulbasaur' });
    assert.equal(botSelfVoted1, false, 'Bot announcement with choice format must never count as a vote');
    const botSelfVoted2 = pollService.handleChatMessage({ chatname: 'BroadcasterBot', message: '[BOT] !vote 2: Charmander' });
    assert.equal(botSelfVoted2, false, 'Bot announcement with [BOT] tag must never count as a vote');
    assert.equal(pollService.getActivePoll().totalVotes, 0, 'Poll total votes must remain 0 after bot announcements');

    // Finishing poll posts end announcement (test voting with !vote 2)
    sentMessages.length = 0;
    pollService.handleChatMessage({ chatname: 'Ash', message: '!vote 2' });
    assert.equal(pollService.getActivePoll().totalVotes, 1, 'Legitimate viewer vote should count');
    pollService.finishPoll();
    await new Promise(r => setTimeout(r, 50));
    assert.ok(sentMessages.length >= 1, 'End announcement should have been dispatched');
    assert.ok(sentMessages[0].includes('Charmander'));

    // Creating poll with announceChat: false should NOT post start or end announcements
    sentMessages.length = 0;
    const poll2 = pollService.createPoll({
        title: 'Secret Vote',
        choices: ['A', 'B'],
        duration: 30,
        announceChat: false
    });
    assert.ok(poll2);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(sentMessages.length, 0, 'No start announcement should post when announceChat is false');

    pollService.handleChatMessage({ chatname: 'Gary', message: '1' });
    pollService.finishPoll();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(sentMessages.length, 0, 'No end announcement should post when announceChat is false');

    // Tournament chat announcement integration
    sentMessages.length = 0;
    const tourney = pollService.createTournament({
        title: 'Retro Cup',
        entrants: ['Link', 'Samus'],
        matchDuration: 30,
        announceChat: true
    });
    assert.ok(tourney);
    assert.equal(tourney.announceChat, true);

    const m = tourney.matches[0];
    assert.ok(m);

    // Starting tournament match should post start announcement
    const started = pollService.startTournamentMatch(m.id);
    assert.ok(started.poll);
    await new Promise(r => setTimeout(r, 900));
    assert.ok(sentMessages.length >= 3, 'Match header and 2 choices should post');
    assert.ok(sentMessages[0].includes('Link vs Samus') || sentMessages[0].includes('Grand Finals'));
    assert.ok(sentMessages.some(msg => msg.includes('!vote 1: Link')));
    assert.ok(sentMessages.some(msg => msg.includes('!vote 2: Samus')));

    // Advancing match and crowning champion
    sentMessages.length = 0;
    const adv = pollService.advanceTournamentMatch(m.id, 'Samus');
    assert.ok(adv);
    assert.equal(adv.champion, 'Samus');
    await new Promise(r => setTimeout(r, 50));
    assert.ok(sentMessages.length >= 1, 'Champion announcement should post');
    assert.ok(sentMessages.some(msg => msg.includes('Samus') && msg.includes('Retro Cup')));

    // Test updating tournament setting to mute announcements
    pollService.updateTournamentSettings({ announceChat: false });
    assert.equal(pollService.getTournament()?.announceChat, false);

    // Foolproof verification: Chatbot disabled or throwing never breaks Poll Service
    const failingChatbot = {
        isReady: () => ({ ready: false, reason: 'Disabled' }),
        announcePollStart: async () => { throw new Error('Network failure'); },
        announcePollEnd: async () => { throw new Error('Network failure'); },
        announceTournamentChampion: async () => { throw new Error('Network failure'); }
    };

    const safePollService = createPollService({
        dataDir: tmpDir,
        chatbotAnnouncer: failingChatbot,
        broadcastToOverlays: () => {},
        onTakeover: () => {},
        onAlert: () => {}
    });

    assert.doesNotThrow(() => {
        const p = safePollService.createPoll({
            title: 'Bulletproof Test',
            choices: ['Pass', 'Fail'],
            announceChat: true
        });
        assert.ok(p);
        safePollService.finishPoll();
    });

    safePollService.destroy();
});

test('Chatbot donation announcements: threshold, source, currency formatting and dedupe', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'donation-announce-test-'));
    const originalFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/sendChat/')) { sent.push(decodeURIComponent(urlStr.split('/sendChat/')[1])); return { ok: true, status: 200 }; }
        if (urlStr.endsWith('/api/status')) return { ok: true, status: 200, json: async () => ({ external: { 'nodecg-tiltify': { total: 8265, campaignGoal: '15000' } } }) };
        return { ok: true, status: 200, json: async () => ({}) };
    };
    const chatbot = createChatbot({ dataDir: tmpDir, getConfig: () => ({ chatbot_enabled: true, ssn: { session_id: 'sess' } }) });
    t.after(() => { globalThis.fetch = originalFetch; chatbot.stop(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

    const settings = chatbot.getData().settings;
    settings.enabled = true;
    settings.tag = '';
    assert.equal(settings.donationAnnouncements.minAmount, 50);
    assert.equal((await chatbot.announceDonation({ user: 'Ann', amount: 100, source: 'tiltify' })).sent, false, 'disabled by default');
    assert.equal(settings.donationAnnouncements.source, 'any', 'core default is host-agnostic');
    settings.donationAnnouncements = { ...settings.donationAnnouncements, enabled: true, source: 'tiltify', totalVar: 'rep.nodecg-tiltify.total', goalVar: 'rep.nodecg-tiltify.campaignGoal', template: '{user} just donated {amount}! {message} Total {total} of {goal}' };

    assert.equal((await chatbot.announceDonation({ id: 't1', user: 'Ann', amount: 1234, source: 'tiltify', message: 'GL' })).sent, true);
    assert.equal(sent.at(-1), 'Ann just donated $1,234.00! GL Total $8,265.00 of $15,000.00');
    assert.equal((await chatbot.announceDonation({ user: 'Ann', amount: 1234, source: 'tiltify' })).sent, false, 'same donor and amount is not repeated');
    assert.equal((await chatbot.announceDonation({ user: 'Bo', amount: 49.99, source: 'tiltify' })).sent, false, 'below minimum');
    assert.equal((await chatbot.announceDonation({ user: 'Cy', amount: 75, source: 'socialstream' })).sent, false, 'other source');
    assert.equal(sent.length, 1);
});

test('Chatbot Tier List Announcements: custom settings, tokens, test endpoint, and toggleable inhibition', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-announce-test-'));
    const originalFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/sendChat/')) {
            sent.push(decodeURIComponent(urlStr.split('/sendChat/')[1]));
            return { ok: true, status: 200, text: async () => 'ok' };
        }
        return { ok: true, status: 200, json: async () => ({}) };
    };

    const chatbot = createChatbot({
        dataDir: tmpDir,
        getConfig: () => ({ chatbot_enabled: true, ssn: { session_id: 'test-sess' } })
    });

    t.after(() => {
        globalThis.fetch = originalFetch;
        chatbot.stop();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    const settings = chatbot.getData().settings;
    assert.ok(settings.tierAnnouncements);
    assert.equal(settings.tierAnnouncements.enabled, true);
    assert.equal(settings.tierAnnouncements.announceStart, true);
    assert.equal(settings.tierAnnouncements.announceEnd, true);

    // 1. Announce start with default template
    const startRes = await chatbot.announceTierVoteStart({
        item: { name: 'Chrono Trigger' },
        tiers: [{ label: 'S' }, { label: 'A' }, { label: 'B' }],
        duration: 45
    });
    assert.equal(startRes.sent, true);
    assert.ok(sent.at(-1).includes('Chrono Trigger'));
    assert.ok(sent.at(-1).includes('!tier <tier>'));
    assert.ok(sent.at(-1).includes('S, A, B'));
    assert.ok(sent.at(-1).includes('45s'));

    // 2. Announce end with custom template and rich tokens ({agreement}, {totalVotes}, {subVotes})
    settings.tierAnnouncements.endTemplate = '[Ranked] {item} -> {tier}! {agreement}% consensus across {totalVotes} voters ({subVotes} subs)';
    const endRes = await chatbot.announceTierVoteEnd({
        item: { name: 'Chrono Trigger' },
        consensusTier: { id: 'tier-s', label: 'S' },
        consensus: {
            totalVotes: 32,
            agreementPercent: 88,
            subVotes: 10,
            distribution: [{ tierId: 'tier-s', count: 28, percentage: 88 }]
        }
    });
    assert.equal(endRes.sent, true);
    assert.equal(sent.at(-1), '[Ranked] Chrono Trigger -> S! 88% consensus across 32 voters (10 subs)');

    // 3. Test endpoint /api/chatbot/test-tier-announce
    // Helper to mock request
    const mockReq = (body = {}) => {
        const stream = new (require('stream').Readable)();
        stream.push(JSON.stringify(body));
        stream.push(null);
        stream.method = 'POST';
        stream.headers = { 'content-type': 'application/json' };
        return stream;
    };
    const mockRes = () => {
        let statusCode = 200;
        let body = '';
        return {
            writeHead(code) { statusCode = code; },
            end(d) { if (d) body += d; },
            getStatusCode: () => statusCode,
            getBody: () => body ? JSON.parse(body) : null
        };
    };

    const req = mockReq({ item: 'EarthBound', duration: 30 });
    const res = mockRes();
    const readBody = async (r) => {
        let b = '';
        for await (const chunk of r) b += chunk;
        return b;
    };
    const handled = await chatbot.handleApi(req, res, '/api/chatbot/test-tier-announce', readBody);
    assert.equal(handled, true);
    assert.equal(res.getStatusCode(), 200);
    assert.equal(res.getBody().sent, true);
    assert.ok(sent.at(-1).includes('EarthBound'));

    // 4. Inhibition: announceStart = false
    settings.tierAnnouncements.announceStart = false;
    const disabledRes = await chatbot.announceTierVoteStart({
        item: { name: 'Final Fantasy VII' },
        tiers: [{ label: 'S' }]
    });
    assert.equal(disabledRes.sent, false);
    assert.ok(disabledRes.reason.includes('disabled'));
});
