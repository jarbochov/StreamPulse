const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createTwitchEventSubService } = require('../server/services/twitch-eventsub');

class MockWebSocket extends EventEmitter {
    constructor(url) {
        super();
        this.url = url;
        this.readyState = 1; // OPEN
        MockWebSocket.instances.push(this);
        setTimeout(() => this.emit('open'), 5);
    }
    send(data) {
        this.sent = this.sent || [];
        this.sent.push(data);
    }
    close() {
        this.readyState = 3;
        this.emit('close', 1000, 'Normal');
    }
    terminate() {
        this.readyState = 3;
        this.emit('close', 1006, 'Abnormal');
    }
}
MockWebSocket.instances = [];

test('Twitch EventSub: connects, welcomes and registers subscriptions', async () => {
    MockWebSocket.instances = [];
    const subscribed = [];
    const mockFetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        subscribed.push(body.type);
        assert.equal(opts.headers['Client-Id'], 'test-client');
        assert.equal(opts.headers['Authorization'], 'Bearer test-token');
        assert.equal(body.transport.session_id, 'sess-123');
        return {
            status: 202,
            json: async () => ({})
        };
    };

    const service = createTwitchEventSubService({
        getAccessToken: () => 'test-token',
        getClientId: () => 'test-client',
        getBroadcasterId: () => '12345',
        getTokenScopes: () => ['channel:read:polls', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read', 'channel:moderate'],
        fetchImpl: mockFetch,
        WebSocketImpl: MockWebSocket,
        log: () => {},
        warn: () => {}
    });

    service.start();
    await new Promise(r => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    assert.ok(ws);

    // Send session_welcome
    ws.emit('message', JSON.stringify({
        metadata: { message_type: 'session_welcome' },
        payload: { session: { id: 'sess-123', keepalive_timeout_seconds: 10 } }
    }));

    await new Promise(r => setTimeout(r, 20));

    const status = service.getStatus();
    assert.equal(status.status, 'connected');
    assert.equal(status.sessionId, 'sess-123');
    assert.ok(subscribed.includes('channel.poll.begin'));
    assert.ok(subscribed.includes('channel.poll.end'));
    assert.ok(subscribed.includes('channel.update'));
    assert.ok(subscribed.includes('channel.follow'));
    assert.ok(subscribed.includes('channel.subscribe'));
    assert.ok(subscribed.includes('channel.cheer'));
    assert.ok(subscribed.includes('channel.ban'));
    assert.ok(subscribed.includes('channel.unban'));

    service.stop();
    assert.equal(service.getStatus().status, 'disconnected');
});

test('Twitch EventSub: permanent ban and unban notifications ignore timeouts', () => {
    const events = [];
    const service = createTwitchEventSubService({ onModerationEvent: event => events.push(event) });
    const event = { user_id: '42', user_login: 'fixtureviewer', user_name: 'FixtureViewer', broadcaster_user_id: '99' };
    service.handleNotification({ subscription_type: 'channel.ban' }, { event: { ...event, is_permanent: false } });
    assert.equal(events.length, 0);
    service.handleNotification({ subscription_type: 'channel.ban' }, { event: { ...event, is_permanent: true } });
    service.handleNotification({ subscription_type: 'channel.unban' }, { event });
    assert.deepEqual(events.map(e => e.permanent), [true, false]);
    assert.equal(events[0].broadcasterId, '99');
});

test('Twitch EventSub: processes poll notifications', async () => {
    let pollBegan = null;
    let pollProgressed = null;
    let pollEnded = null;
    let pollWinner = null;

    const service = createTwitchEventSubService({
        onPollBegin: (p) => { pollBegan = p; },
        onPollProgress: (p) => { pollProgressed = p; },
        onPollEnd: (p, w) => { pollEnded = p; pollWinner = w; },
        log: () => {},
        warn: () => {}
    });

    // 1. Poll begin
    service.handleNotification(
        { subscription_type: 'channel.poll.begin' },
        {
            event: {
                id: 'poll-abc',
                title: 'Best RPG?',
                duration: 60,
                choices: [
                    { id: 'c1', title: 'Chrono Trigger', votes: 0 },
                    { id: 'c2', title: 'Final Fantasy VI', votes: 0 }
                ]
            }
        }
    );
    assert.ok(pollBegan);
    assert.equal(pollBegan.id, 'poll-abc');
    assert.equal(pollBegan.status, 'ACTIVE');
    assert.equal(pollBegan.choices.length, 2);

    // 2. Poll progress
    service.handleNotification(
        { subscription_type: 'channel.poll.progress' },
        {
            event: {
                id: 'poll-abc',
                title: 'Best RPG?',
                choices: [
                    { id: 'c1', title: 'Chrono Trigger', votes: 5 },
                    { id: 'c2', title: 'Final Fantasy VI', votes: 8 }
                ]
            }
        }
    );
    assert.ok(pollProgressed);
    assert.equal(pollProgressed.totalVotes, 13);

    // 3. Poll end
    service.handleNotification(
        { subscription_type: 'channel.poll.end' },
        {
            event: {
                id: 'poll-abc',
                title: 'Best RPG?',
                status: 'completed',
                choices: [
                    { id: 'c1', title: 'Chrono Trigger', votes: 12 },
                    { id: 'c2', title: 'Final Fantasy VI', votes: 19 }
                ]
            }
        }
    );
    assert.ok(pollEnded);
    assert.equal(pollEnded.status, 'COMPLETED');
    assert.ok(pollWinner);
    assert.equal(pollWinner.id, 'c2');
    assert.equal(pollWinner.title, 'Final Fantasy VI');
});

test('Twitch EventSub: processes channel updates, follows, cheers and redemptions', async () => {
    let updateData = null;
    let followData = null;
    let cheerData = null;
    let redeemData = null;

    const service = createTwitchEventSubService({
        onChannelUpdate: (d) => { updateData = d; },
        onFollow: (f) => { followData = f; },
        onCheer: (c) => { cheerData = c; },
        onRedemption: (r) => { redeemData = r; },
        log: () => {},
        warn: () => {}
    });

    service.handleNotification(
        { subscription_type: 'channel.update' },
        { event: { category_name: 'Elden Ring', category_id: '512953', title: 'No Hit Run' } }
    );
    assert.deepEqual(updateData, {
        categoryName: 'Elden Ring',
        categoryId: '512953',
        title: 'No Hit Run',
        language: ''
    });

    service.handleNotification(
        { subscription_type: 'channel.follow' },
        { event: { user_id: '99', user_name: 'LegendaryGamer' } }
    );
    assert.equal(followData.user, 'LegendaryGamer');
    assert.equal(followData.userId, '99');

    service.handleNotification(
        { subscription_type: 'channel.cheer' },
        { event: { user_name: 'CheerMaster', bits: 500, message: 'PogChamp' } }
    );
    assert.equal(cheerData.user, 'CheerMaster');
    assert.equal(cheerData.bits, 500);

    service.handleNotification(
        { subscription_type: 'channel.channel_points_custom_reward_redemption.add' },
        { event: { id: 'r1', user_name: 'PointHoarder', reward: { title: 'Hydrate', cost: 250 }, user_input: 'Drink water!' } }
    );
    assert.equal(redeemData.user, 'PointHoarder');
    assert.equal(redeemData.rewardTitle, 'Hydrate');
    assert.equal(redeemData.cost, 250);
});
