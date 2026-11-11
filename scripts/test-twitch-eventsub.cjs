const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createTwitchEventSubService } = require('../server/services/twitch-eventsub');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTwitchService } = require('../server/services/twitch');
const { createSsnService, createEmptyChatData, createEmptyStatsData } = require('../server/services/ssn');

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
    assert.ok(!subscribed.includes('channel.chat.message_delete'), 'chat scope gates deletion subscriptions');

    service.stop();
    assert.equal(service.getStatus().status, 'disconnected');
});

test('Twitch EventSub: chat identity, deletes and clears use broadcaster chat-read authorization', async () => {
    MockWebSocket.instances = [];
    const subscriptions = [];
    const messages = [];
    const deletions = [];
    const service = createTwitchEventSubService({
        getAccessToken: () => 'fixture-token', getClientId: () => 'fixture-client', getBroadcasterId: () => '99',
        getTokenScopes: () => ['user:read:chat'],
        fetchImpl: async (url, options) => { subscriptions.push(JSON.parse(options.body)); return { status: 202 }; },
        WebSocketImpl: MockWebSocket, onChatMessage: event => messages.push(event), onChatDeletion: event => deletions.push(event),
        log() {}, warn() {}
    });
    try {
        service.start();
        await new Promise(resolve => setTimeout(resolve, 10));
        MockWebSocket.instances[0].emit('message', JSON.stringify({
            metadata: { message_type: 'session_welcome' },
            payload: { session: { id: 'fixture-session', keepalive_timeout_seconds: 10 } }
        }));
        await new Promise(resolve => setTimeout(resolve, 20));
        const chat = subscriptions.filter(subscription => subscription.type.startsWith('channel.chat.'));
        assert.equal(chat.length, 4);
        for (const subscription of chat) assert.deepEqual(subscription.condition, { broadcaster_user_id: '99', user_id: '99' });
        service.handleNotification({ subscription_type: 'channel.chat.message' }, { event: {
            broadcaster_user_id: '99', chatter_user_id: '42', chatter_user_login: 'fixtureviewer', message_id: 'native-uuid', message: { text: 'fixture text' }
        } });
        for (const type of ['channel.chat.message_delete', 'channel.chat.clear_user_messages', 'channel.chat.clear']) {
            service.handleNotification({ subscription_type: type }, { event: {
                broadcaster_user_id: '99', message_id: 'native-uuid', target_user_id: '42', target_user_login: 'fixtureviewer'
            } });
        }
        assert.equal(messages[0].id, 'native-uuid');
        assert.equal(messages[0].text, 'fixture text');
        assert.deepEqual(deletions.map(event => event.kind), ['message', 'user', 'clear']);
        assert.equal(deletions[0].messageId, messages[0].id);
        assert.equal(deletions[1].userId, '42');
    } finally { service.stop(); }
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

test('Twitch subscriptions without cumulative months retain observed tenure through the service wrapper', () => {
    const { createTwitchService } = require('../server/services/twitch');
    const received = [];
    const tenure = { returningviewer: 15, firstmonthviewer: 1 };
    const service = createTwitchService({
        getSubscriptionMonths: name => tenure[String(name || '').toLowerCase()] || 0,
        onSubscribe: event => received.push(event), log() {}, warn() {}
    });
    const eventsub = service.getEventSub();
    for (const user of ['ReturningViewer', 'FirstMonthViewer', 'UnobservedViewer']) {
        eventsub.handleNotification({ subscription_type: 'channel.subscribe' }, { event: {
            user_id: 'fictional-id', user_name: user, user_login: user.toLowerCase(), tier: '1000'
        } });
    }
    assert.equal(received[0].months, 15, 'an unannotated subscription must not erase known multi-month tenure');
    assert.equal(received[1].months, undefined, 'first-month tenure is not mislabeled as a resub');
    assert.equal(received[2].months, undefined, 'unknown tenure is not guessed');
    eventsub.handleNotification({ subscription_type: 'channel.subscription.message' }, { event: {
        user_id: 'fictional-id', user_name: 'ReturningViewer', tier: '1000', cumulative_months: 16
    } });
    assert.equal(received[3].months, 16, 'the authoritative cumulative count takes precedence over observed history');
    assert.deepEqual(received.map(event => event.months > 1 ? 'resub' : 'sub'), ['resub', 'sub', 'sub', 'resub']);
    service.stopEventSub();
});

test('native subscriptions populate session accounting and retain shared messages without duplicate counts', t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-native-subs-'));
    const chat = createEmptyChatData();
    const stats = createEmptyStatsData();
    let records = [];
    let pending = [];
    const alerts = [];
    let counted = 0;
    const ssn = createSsnService({
        dataDir, getChatData: () => chat, getStatsData: () => stats,
        getChatLog: () => records, setChatLog: value => { records = value; },
        getPendingChatLog: () => pending, setPendingChatLog: value => { pending = value; },
        getBannedUsers: () => ['bannedviewer'],
        alertEngine: { handleEvent: event => alerts.push(event) }, log() {}, warn() {}
    });
    ssn.loadStats();
    const twitch = createTwitchService({
        getSubscriptionMonths: () => 15,
        onSubscribe: data => { if (ssn.processTwitchSubscription(data)) counted++; },
        log() {}, warn() {}
    });
    t.after(() => { twitch.stopEventSub(); ssn.disconnectSSN(); fs.rmSync(dataDir, { recursive: true, force: true }); });
    const eventsub = twitch.getEventSub();
    const subscribe = name => eventsub.handleNotification({ subscription_type: 'channel.subscribe' }, {
        event: { user_id: 'fixture-id', user_name: name, user_login: name.toLowerCase(), tier: '1000' }
    });
    subscribe('ReturningViewer');
    assert.equal(chat.subscribers.length, 1);
    assert.equal(chat.subscribers[0].event, 'resub');
    assert.match(chat.subscribers[0].subtitle, /15 months/);
    assert.equal(records[0].sourceEvent, 'channel.subscribe');
    assert.equal(records[0].message, '', 'a basic subscription must not fabricate a shared viewer message');
    assert.equal(alerts[0].tier, '1000');
    eventsub.handleNotification({ subscription_type: 'channel.subscription.message' }, { event: {
        user_id: 'fixture-id', user_name: 'ReturningViewer', tier: '1000',
        cumulative_months: 16, message: { text: 'Another month together' }
    } });
    assert.equal(chat.subscribers[0].months, 16, 'authoritative months enrich the existing session record');
    assert.equal(stats.subTenure.returningviewer.months, 16);
    assert.match(records[1].message, /Another month together/);
    assert.equal(records[1].sourceEvent, 'channel.subscription.message');
    const result = ssn.processChatMessage({
        chatname: 'returningviewer', type: 'twitch', event: 'resub',
        membership: 'Subscriber', subtitle: '15 months', chatmessage: 'Shared through chat'
    });
    assert.notEqual(result, false, 'shared SSN messages remain eligible for chatbot handling');
    assert.match(chat.subscribers[0].subtitle, /16 months/, 'older badges must not replace newer tenure');
    assert.equal(records[2].source, 'socialstream');
    assert.equal(counted, 1, 'native callbacks do not double-count Subathon events');
    assert.equal(alerts.length, 1);
    assert.equal(Object.values(stats.subscribers.ReturningViewer.days).reduce((a, b) => a + b, 0), 1);
    subscribe('BannedViewer');
    assert.equal(ssn.processTwitchSubscription({ user: 'GiftRecipient', isGift: true }), false);
    assert.equal(chat.subscribers.length, 1);
    ssn.processChatMessage({
        chatname: 'SsnFirstViewer', type: 'twitch', event: 'resub',
        membership: 'Subscriber', subtitle: '15 months', chatmessage: 'SSN arrived first'
    });
    subscribe('SsnFirstViewer');
    subscribe('SsnFirstViewer');
    assert.equal(chat.subscribers.length, 2);
    assert.equal(counted, 2, 'SSN-first delivery preserves native-only effects exactly once');
    assert.equal(alerts.length, 2);
    assert.equal(Object.values(stats.subscribers.SsnFirstViewer.days).reduce((a, b) => a + b, 0), 1);
    const sharedText = 'A < B & C - another month';
    eventsub.handleNotification({ subscription_type: 'channel.subscription.message' }, { event: {
        user_id: 'shared-fixture-id', user_name: 'SharedViewer', tier: '1000',
        cumulative_months: 8, message: { text: sharedText }
    } });
    assert.equal(records.at(-1).message, sharedText, 'native shared text remains intact');
    assert.equal(records.at(-1).messageHtml, 'A &lt; B &amp; C - another month');
    assert.equal(alerts.at(-1).message, sharedText, 'native alert messages keep their original text');
    ssn.saveChatData();
    ssn.saveStats();
    ssn.saveChatLog();
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'chat.json'))).subscribers.length, 3);
    assert.match(fs.readFileSync(path.join(dataDir, 'chat-log.jsonl'), 'utf8'), /channel\.subscription\.message/);
});

test('Twitch channel updates use valid, deduplicated and bounded stream-info timestamps', () => {
    const chat = { streamInfo: [] };
    const service = createTwitchService({ getChatData: () => chat, log() {}, warn() {} });
    const eventsub = service.getEventSub();
    const update = title => eventsub.handleNotification({ subscription_type: 'channel.update' }, {
        event: { title, category_name: 'Fictional Adventure' }
    });
    update('Fixture stream');
    update('Fixture stream');
    assert.equal(chat.streamInfo.length, 1, 'identical notifications do not append duplicate history');
    assert.ok(Number.isFinite(Date.parse(chat.streamInfo[0].changedAt)));
    for (let i = 0; i < 60; i++) update(`Fixture stream ${i}`);
    assert.equal(chat.streamInfo.length, 50, 'native updates use the same history cap as polling');
    service.stopEventSub();
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

    let raidData = null;
    const raidService = createTwitchEventSubService({
        onRaid: (r) => { raidData = r; },
        log: () => {},
        warn: () => {}
    });
    raidService.handleNotification(
        { subscription_type: 'channel.raid' },
        { event: { from_broadcaster_user_id: '456', from_broadcaster_user_login: 'fellowstreamer', from_broadcaster_user_name: 'FellowStreamer', to_broadcaster_user_id: '12345', viewers: 88 } }
    );
    assert.deepEqual(raidData, {
        fromBroadcasterId: '456',
        fromBroadcasterLogin: 'fellowstreamer',
        fromBroadcasterName: 'FellowStreamer',
        toBroadcasterId: '12345',
        viewers: 88
    });
});
