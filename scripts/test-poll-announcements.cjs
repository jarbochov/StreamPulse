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
    assert.ok(sentMessages.length > 0);
    const startMsg = sentMessages[sentMessages.length - 1];
    assert.ok(startMsg.includes('Best RPG'));
    assert.ok(startMsg.includes('Chrono Trigger'));
    assert.ok(startMsg.includes('!vote 1'));
    assert.ok(startMsg.includes('60s'));

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
    // Yield event loop for async fire-and-forget
    await new Promise(r => setTimeout(r, 50));
    assert.ok(sentMessages.length >= 1, 'Start announcement should have been dispatched');
    assert.ok(sentMessages[0].includes('Favorite Starter'));

    // Finishing poll posts end announcement
    sentMessages.length = 0;
    pollService.handleChatMessage({ chatname: 'Ash', message: '2' });
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
    await new Promise(r => setTimeout(r, 50));
    assert.ok(sentMessages.length >= 1, 'Match start announcement should post');
    assert.ok(sentMessages[0].includes('Link vs Samus') || sentMessages[0].includes('Round 1'));

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
