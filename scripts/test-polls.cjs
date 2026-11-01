'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createPollService } = require('../server/services/polls');
const { createSsnService } = require('../server/services/ssn');

    test('Extending an old untimed poll starts a fresh deadline and preserves it across restart', (t) => {
        const dir = fs.mkdtempSync(path.join(__dirname, '..', '.test-untimed-poll-'));
        const options = { dataDir: dir, log: () => {}, error: () => {} };
        let service = createPollService(options);
        t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
        service.createPoll({ title: 'Untimed fixture', choices: ['A', 'B'], duration: 0 });
        service.destroy();
        const file = path.join(dir, 'polls.json');
        const saved = JSON.parse(fs.readFileSync(file));
        saved.active.startedAt = new Date(Date.now() - 120000).toISOString();
        fs.writeFileSync(file, JSON.stringify(saved));
        service = createPollService(options);
        const extended = service.extendPoll(30);
        assert.equal(extended.remainingSeconds, 30);
        assert.ok(extended.duration >= 150);
        assert.equal(extended.startedAt, saved.active.startedAt, 'original start remains available');
        service.destroy();
        service = createPollService(options);
        assert.equal(service.getActivePoll().remainingSeconds, 30);
        assert.equal(service.castVote({ userId: 'fixture', choiceIndex: 0 }), true);
        assert.equal(service.finishPoll().winner, 'A');
    });

    test('SSN uses stable platform-qualified voters, not per-message IDs, across restart', (t) => {
        const dir = fs.mkdtempSync(path.join(__dirname, '..', '.test-ssn-voters-'));
        const options = { dataDir: dir, log: () => {}, error: () => {} };
        let service = createPollService(options);
        t.after(() => { service.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
        const ssn = createSsnService({
            ...options, pollService: () => service,
            getConfig: () => ({ chat_log_enabled: false }),
            getExcludeUsers: () => ['fixture']
        });
        service.createPoll({ title: 'Identity fixture', choices: ['A', 'B'], duration: 0 });
        const chat = (type, mid, userId, chatmessage = '1') =>
            ssn.processChatMessage({ chatname: 'Fixture', type, mid, userId, chatmessage });
        chat('Twitch', 'message-1');
        chat('twitch', 'message-2', undefined, '2');
        assert.equal(service.getActivePoll().totalVotes, 1, 'same named voter cannot use a new message ID to vote twice');
        chat('youtube', 'message-3');
        assert.equal(service.getActivePoll().totalVotes, 2, 'same name on another platform is a separate voter');
        service.destroy();
        service = createPollService(options);
        chat('twitch', 'message-4', undefined, '2');
        assert.equal(service.getActivePoll().totalVotes, 2, 'fallback identity dedupe persists');
        chat('twitch', 'message-5', 'stable-user');
        chat('twitch', 'message-6', 'stable-user', '2');
        chat('youtube', 'message-7', 'stable-user', '2');
        const result = service.finishPoll();
        assert.equal(result.totalVotes, 4);
        assert.deepEqual(result.choices.map(c => c.votes), [3, 1]);
    });

test('Linked manual finalization and poll replacement leave only the current ballot timer', (t) => {
    const dir = fs.mkdtempSync(path.join(__dirname, '..', '.test-poll-tickers-'));
    const intervals = new Set();
    const startInterval = global.setInterval;
    const clearInterval = global.clearInterval;
    t.mock.method(global, 'setInterval', (...args) => {
        const id = startInterval(...args);
        intervals.add(id);
        return id;
    });
    t.mock.method(global, 'clearInterval', id => {
        intervals.delete(id);
        clearInterval(id);
    });
    const service = createPollService({ dataDir: dir, log: () => {}, error: () => {} });
    t.after(() => {
        service.destroy();
        for (const id of intervals) clearInterval(id);
        fs.rmSync(dir, { recursive: true, force: true });
    });
    service.createTournament({ entrants: ['A', 'B'], isPoll: true });
    service.startTournamentMatch('m_1_1', { isPoll: true });
    assert.equal(intervals.size, 1);
    service.reload();
    assert.equal(intervals.size, 1, 'reloading replaces the original ticker');
    service.advanceTournamentMatch('m_1_1', 'A', { isPoll: true });
    assert.equal(intervals.size, 0, 'manual finalization immediately releases the ticker');
    service.createPoll({ title: 'First', choices: ['A', 'B'], duration: 0 });
    service.createPoll({ title: 'Second', choices: ['A', 'B'], duration: 0 });
    assert.equal(intervals.size, 1, 'replacement keeps only one ticker');
    service.cancelPoll();
    assert.equal(intervals.size, 0);
    service.createPoll({ title: 'Third', choices: ['A', 'B'], duration: 0 });
    service.destroy();
    assert.equal(intervals.size, 0);
});

test('Poll Service: lifecycle, chat voting, blind mode, multipliers, and alerts', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', '.test-poll-'));
    const overlaysBroadcasts = [];
    const takeovers = [];
    const alerts = [];
    const pollService = createPollService({
        dataDir: tmpDir,
        broadcastToOverlays: (type, data) => overlaysBroadcasts.push({ type, data }),
        onTakeover: (action, title, duration, poll) => takeovers.push({ action, title, duration, poll }),
        onAlert: (event) => alerts.push(event),
        getTwitchPoll: () => ({ id: 'twitch-1', title: 'Twitch Poll' })
    });
    t.after(() => {
        pollService.destroy();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    // 1. Fallback to Twitch poll when no native poll is active or recently ended
    assert.equal(pollService.getLatestPoll()?.id, 'twitch-1');
    assert.equal(pollService.getActivePoll(), null);

    // 2. Poll validation
    assert.throws(() => pollService.createPoll({ title: '' }), /Poll question/);
    assert.throws(() => pollService.createPoll({ title: 'Game?', choices: ['Only One'] }), /at least 2 distinct choices/);

    // 3. Create a valid native poll
    const created = pollService.createPoll({
        title: 'Which adventure next?',
        choices: ['Zelda', 'Metroid', 'Mario'],
        duration: 120,
        blind: true,
        keywordVoting: true,
        subMultiplier: 2,
        celebration: { sound: '/fanfare.mp3', volume: 80, confetti: true }
    });

    assert.equal(created.title, 'Which adventure next?');
    assert.equal(created.choices.length, 3);
    assert.equal(created.status, 'ACTIVE');
    assert.equal(created.blind, true);
    assert.equal(takeovers.length, 1);
    assert.equal(takeovers[0].action, 'poll-active');

    // In blind mode, individual choice votes are concealed in the public payload
    assert.equal(created.choices[0].votes, 0);

    // 4. Chat voting: direct number
    const voted1 = pollService.handleChatMessage({
        chatname: 'Alice',
        userId: 'u1',
        message: '1'
    });
    assert.equal(voted1, true, 'Alice votes choice 1 (Zelda)');

    // Deduplication: Alice cannot vote again
    const votedAgain = pollService.handleChatMessage({
        chatname: 'Alice',
        userId: 'u1',
        message: '2'
    });
    assert.equal(votedAgain, false, 'Duplicate vote from Alice is rejected');

    // 5. Chat voting: command format
    const voted2 = pollService.handleChatMessage({
        chatname: 'Bob',
        userId: 'u2',
        message: '!vote 2'
    });
    assert.equal(voted2, true, 'Bob votes choice 2 (Metroid)');

    // 6. Chat voting: keyword format
    const voted3 = pollService.handleChatMessage({
        chatname: 'Charlie',
        userId: 'u3',
        message: 'Definitely want Mario today!'
    });
    assert.equal(voted3, true, 'Charlie votes choice 3 via keyword "mario"');

    // 7. Chat voting: Subscriber multiplier
    const voted4 = pollService.handleChatMessage({
        chatname: 'DaveSub',
        userId: 'u4',
        message: '!vote 1',
        subscriber: true
    });
    assert.equal(voted4, true, 'Dave votes Zelda with 2x sub multiplier');

    // 8. Extend poll
    const extended = pollService.extendPoll(30);
    assert.equal(extended.duration, 150);

    // 9. Finish poll
    const completed = pollService.finishPoll('COMPLETED');
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.blind, false, 'Blind mode lifts on completion');
    
    // Zelda has 3 votes (1 from Alice + 2 from DaveSub), Metroid has 1, Mario has 1
    assert.equal(completed.winner, 'Zelda');
    assert.equal(completed.winningVotes, 3);
    assert.equal(completed.totalVotes, 5);
    assert.equal(completed.winningPercent, 60);

    // Verify takeover and alert were triggered
    const endTakeover = takeovers.find(t => t.action === 'poll-end');
    assert.ok(endTakeover, 'takeoverPages called for poll-end');

    const alertEvent = alerts.find(a => a.type === 'poll_end');
    assert.ok(alertEvent, 'AlertEngine called with poll_end event');
    assert.equal(alertEvent.winner, 'Zelda');
    assert.equal(alertEvent.celebration.sound, '/fanfare.mp3');

    // 10. History retention
    const history = pollService.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].winner, 'Zelda');

    pollService.clearHistory();
    assert.equal(pollService.getHistory().length, 0);
});
