'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createPollService } = require('../server/services/polls');

test('Poll Service: lifecycle, chat voting, blind mode, multipliers, and alerts', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poll-test-'));
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
