const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { performance } = require('node:perf_hooks');
const { createSessionService, categoryMinutesFor, getSessionCategorySegments } = require('../server/services/session');
const { createCrmService } = require('../server/services/crm');
const { getSessionStreamInfo, createStreamInfoService } = require('../server/services/stream-info');
const { createStatusService } = require('../server/services/status');
const { createSsnService } = require('../server/services/ssn');

function giftRepairFixture(t, pastGifts = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-gift-repair-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const day = new Date().toISOString().slice(0, 10);
    const gift = { chatname: 'FictionalRecipient', gifter: 'FictionalRecipient', recipient: null, chatimg: '/wrong-avatar.png', count: 1, timestamp: Date.now(), event: 'subscription_gift' };
    const chat = { startedAt: new Date().toISOString(), giftSubs: [gift], chatters: {}, messageCount: 0 };
    const stats = { giftSubs: { FictionalRecipient: { firstSeen: chat.startedAt, lastSeen: chat.startedAt, days: { [day]: 1, ...(pastGifts ? { '2020-01-01': 2 } : {}) } } }, totalMessages: { unrelated: 5 } };
    if (pastGifts) {
        chat.giftSubs.push({ chatname: 'Anonymous', gifter: 'Anonymous', recipient: 'OtherFictionalRecipient', count: 2, timestamp: gift.timestamp - 5000 });
        stats.giftSubs.Anonymous = { days: { [day]: 2 }, firstSeen: new Date(gift.timestamp - 5000).toISOString() };
    }
    const chatPath = path.join(dir, 'chat.json'), statsPath = path.join(dir, 'stats.json');
    fs.writeFileSync(chatPath, JSON.stringify(chat));
    fs.writeFileSync(statsPath, JSON.stringify(stats));
    const broadcasts = [];
    const service = createSsnService({
        dataDir: dir, getChatData: () => chat, getStatsData: () => stats,
        broadcastToOverlays: (type, data) => broadcasts.push({ type, data }),
        alertEngine: { noteGift() { throw new Error('Repairs must never replay gifts'); } },
        log: () => {}, warn: () => {}
    });
    service.loadStats();
    const request = {
        reason: 'Correct fictional anonymous gift attribution', dryRun: true,
        from: 'FictionalRecipient', to: 'Anonymous', recipient: 'FictionalRecipient', timestamp: gift.timestamp, day, count: 1,
        expected: JSON.parse(JSON.stringify({ startedAt: chat.startedAt, gift, sourceStats: stats.giftSubs.FictionalRecipient, targetStats: stats.giftSubs.Anonymous || null }))
    };
    return { dir, day, chat, stats, chatPath, statsPath, service, broadcasts, request };
}

test('gift attribution repair corrects session and lifetime credits, preserves unrelated gifts, and renders both real credits sources', async t => {
    const fixture = giftRepairFixture(t, true);
    const { dir, day, chat, stats, chatPath, statsPath, service, broadcasts, request } = fixture;
    const original = JSON.parse(JSON.stringify({ chat, stats }));
    const { createSessionRoutes } = require('../server/routes/session');
    const router = createSessionRoutes({ ssnService: service, sessionService: { getArchivedSessions: () => [] } });
    async function call(body, method = 'POST') {
        const req = require('stream').Readable.from([JSON.stringify(body)]);
        req.method = method;
        let status, data;
        const res = { writeHead(code) { status = code; }, end(text) { data = JSON.parse(text); } };
        const url = new URL('http://localhost/api/gift-subs/correct');
        await router(req, res, url, url.pathname);
        return { status, data };
    }
    const preview = await call(request);
    assert.equal(preview.status, 200);
    assert.equal(preview.data.backup, null);
    assert.equal(preview.data.replayed, false);
    assert.deepEqual({ chat, stats }, original);
    assert.equal(broadcasts.length, 0);
    assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
    assert.equal((await call(request, 'GET')).status, 405);
    const applied = await call({ ...request, dryRun: false });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.replayed, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, applied.data.backup))).original, original);
    assert.equal(chat.giftSubs.length, 1, 'merge into an existing canonical giver');
    assert.equal(chat.giftSubs[0].gifter, 'Anonymous');
    assert.equal(chat.giftSubs[0].recipient, 'FictionalRecipient');
    assert.equal(chat.giftSubs[0].count, 3);
    assert.equal(chat.giftSubs[0].chatimg, null, 'recipient avatar is not reused for the anonymous giver');
    assert.deepEqual(stats.giftSubs.FictionalRecipient.days, { '2020-01-01': 2 }, 'unrelated legitimate past gifts survive');
    assert.equal(stats.giftSubs.Anonymous.days[day], 3);
    const total = data => Object.values(data.giftSubs).reduce((sum, entry) => sum + Object.values(entry.days).reduce((a, b) => a + b, 0), 0);
    assert.equal(total(stats), total(original.stats), 'lifetime gift total is unchanged');
    assert.equal(chat.giftSubs.reduce((sum, entry) => sum + entry.count, 0), original.chat.giftSubs.reduce((sum, entry) => sum + entry.count, 0), 'session gift total is unchanged');
    assert.deepEqual(stats.totalMessages, original.stats.totalMessages);
    assert.deepEqual(JSON.parse(fs.readFileSync(chatPath)), chat);
    assert.deepEqual(JSON.parse(fs.readFileSync(statsPath)), stats);
    assert.deepEqual(broadcasts.map(message => message.type), ['update'], 'snapshot refresh only, never an alert');
    assert.equal((await call({ ...request, dryRun: false })).status, 404, 'same correction cannot transfer the gift twice');

    const http = require('http');
    const { createStaticRouter } = require('../server/static-router');
    const staticRouter = createStaticRouter({ rootDir: path.resolve(__dirname, '..') });
    let source = 'session';
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        let data;
        if (pathname === '/api/config') data = {
            theme: {}, exclude_users: [], credits: {
                header: { title: '' }, social: { links: [] }, closing: '', custom_sections: [],
                sections: { gift_subs: { enabled: true, title: 'Gift Subs', source } }
            }
        };
        else if (pathname === '/api/chat' || pathname === '/data/chat.json') data = chat;
        else if (pathname === '/api/stats' || pathname === '/data/stats.json') data = stats;
        else if (pathname.startsWith('/data/') || pathname === '/api/highlights') data = [];
        else { staticRouter.handleRequest(req, res); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    for (source of ['session', 'stats']) {
        await page.goto(`http://127.0.0.1:${server.address().port}/credits.html?preview=1`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => document.querySelector('#credits-container')?.textContent.includes('Anonymous'));
        const names = await page.$$eval('#credits-container .person', nodes => nodes.map(node => node.textContent));
        assert.deepEqual(names, [source === 'session' ? 'Anonymous to FictionalRecipient' : 'Anonymous (3)'], `${source} credits never list the recipient as giver`);
    }
});

test('gift correction rejects stale/invalid input and rolls back both stores on replacement failure', t => {
    const { day, chat, stats, chatPath, statsPath, service, broadcasts, request } = giftRepairFixture(t);
    const original = JSON.parse(JSON.stringify({ chat, stats }));
    for (const patch of [
        { expected: { ...request.expected, startedAt: 'different-session' } },
        { count: 2 }, { count: 0.5 }, { day: '2026-02-31' }, { to: request.from }
    ]) assert.throws(() => service.correctGiftAttribution({ ...request, ...patch }));
    const rename = fs.renameSync;
    t.mock.method(fs, 'renameSync', (from, to) => {
        if (to === chatPath) throw new Error('Injected chat replacement failure');
        return rename(from, to);
    });
    assert.throws(() => service.correctGiftAttribution({ ...request, dryRun: false }), /Injected/);
    t.mock.restoreAll();
    assert.deepEqual({ chat, stats }, original);
    assert.deepEqual(JSON.parse(fs.readFileSync(chatPath)), original.chat);
    assert.deepEqual(JSON.parse(fs.readFileSync(statsPath)), original.stats, 'earlier stats replacement rolled back');
    assert.equal(fs.readdirSync(path.dirname(chatPath)).some(name => name.endsWith('.tmp')), false);
    assert.equal(broadcasts.length, 0);
    service.correctGiftAttribution({ ...request, dryRun: false });
    assert.equal(stats.giftSubs.FictionalRecipient, undefined, 'remove the incorrect giver when no legitimate gifts remain');
    assert.equal(stats.giftSubs.Anonymous.days[day], 1);
    assert.equal(chat.giftSubs[0].gifter, 'Anonymous');
    const restoredChat = JSON.parse(fs.readFileSync(chatPath)), restoredStats = {};
    const restored = createSsnService({
        dataDir: path.dirname(chatPath), getChatData: () => restoredChat, getStatsData: () => restoredStats,
        log: () => {}, warn: () => {}
    });
    restored.loadStats();
    assert.equal(restoredStats.giftSubs.Anonymous.days[day], 1, 'attribution survives disk reload');
    assert.equal(restoredStats.giftSubs.FictionalRecipient, undefined);
});

test('legacy pre-stream edits become one live-start baseline without rewriting history or bridging offline gaps', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-live-stream-info-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const data = {
        viewerStats: { streamStartedAt: '2026-01-05T12:00:00Z', streamEndedAt: '2026-01-05T13:00:00Z' },
        streamInfo: [
            { title: 'Earlier preparation', category: 'Old Game', time: '2026-01-05T11:00:00Z' },
            { title: 'Starting title', category: 'First Game', time: '2026-01-05T11:27:00Z' },
            { title: 'Live change', category: 'Second Game', changedAt: '2026-01-05T12:30:00Z' },
            { title: 'Next show', category: 'Offline Game', changedAt: '2026-01-05T13:27:00Z' }
        ]
    };
    const before = JSON.stringify(data);
    const history = getSessionStreamInfo(data, { current: true });
    assert.deepEqual(history.map(info => info.title), ['Starting title', 'Live change']);
    assert.equal(history[0].changedAt, '2026-01-05T12:00:00.000Z');
    assert.deepEqual(categoryMinutesFor(history, Date.parse('2026-01-05T14:00:00Z')), { 'First Game': 30, 'Second Game': 30 });
    assert.equal(JSON.stringify(data), before, 'read-side cleanup never mutates saved legacy records');
    assert.deepEqual(getSessionStreamInfo({ streamInfo: data.streamInfo }, { current: true }), []);
    const offline = { channelInfo: { title: 'Next show', category: 'Offline Game' }, streamInfo: [], viewerStats: { live: false } };
    const status = createStatusService({
        getChatData: () => offline, sessionsDir: path.join(dir, 'sessions'), backupsDir: path.join(dir, 'backups')
    }).buildStatusSnapshot();
    assert.equal(status.stream.title, 'Next show', 'live-only history does not make current channel metadata stale');
    const category = createSessionService({ dataDir: dir, getChatData: () => offline }).currentCategoryStats();
    assert.equal(category.name, 'Offline Game');
    assert.equal(category.sessionMinutes, 0);
    const chat = { streamInfo: [
        { title: 'First broadcast', category: 'First Game', changedAt: '2026-01-05T12:00:00Z', endedAt: '2026-01-05T13:00:00Z', live: true }
    ], viewerStats: { live: false }, channelInfo: { title: 'Resumed broadcast', category: 'Second Game' } };
    const service = createStreamInfoService({ getChatData: () => chat });
    chat.viewerStats = { live: true, streamStartedAt: '2026-01-05T14:00:00Z' };
    service.syncLiveState();
    const resumed = getSessionStreamInfo(chat, { current: true });
    assert.equal(resumed.length, 2, 'resumed sessions keep earlier genuinely live history');
    assert.equal(resumed[1].changedAt, '2026-01-05T14:00:00Z');
    assert.deepEqual(categoryMinutesFor(resumed, Date.parse('2026-01-05T15:00:00Z')), { 'First Game': 60, 'Second Game': 60 });
});

test('legacy channel-update timestamps remain usable and invalid stream-info dates do not corrupt category times', t => {
    const streamInfo = [
        { category: 'First Game', changedAt: '2026-01-05T12:00:00Z' },
        { category: 'Second Game', time: '2026-01-05T12:30:00Z' },
        { category: 'Untimed Game', changedAt: 'invalid' }
    ];
    assert.deepEqual(categoryMinutesFor(streamInfo, Date.parse('2026-01-05T13:00:00Z')), {
        'First Game': 30, 'Second Game': 30
    });
    const segments = getSessionCategorySegments({ streamInfo }, '2026-01-05T12:00:00Z', '2026-01-05T13:00:00Z');
    assert.deepEqual(segments.map(segment => [segment.category, segment.durationMinutes]), [
        ['First Game', 30], ['Second Game', 30]
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-legacy-stream-info-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'sessions'));
    fs.writeFileSync(path.join(dir, 'sessions', 'chat-2026-01-05T12-00.json'), JSON.stringify({
        streamInfo, viewerStats: { streamStartedAt: '2026-01-05T12:00:00Z', streamEndedAt: '2026-01-05T13:00:00Z' }
    }));
    const service = createSessionService({ dataDir: dir });
    assert.deepEqual(service.archivedCategoryMinutes(), { 'First Game': 30, 'Second Game': 30 },
        'compact archive caching must retain legacy timestamps for aggregation');
});

test('archive summaries are shared, compact, and invalidated for writes, removal, and restore', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-archives-'));
    const sessionsDir = path.join(dir, 'sessions');
    fs.mkdirSync(sessionsDir);
    const start = new Date('2026-01-05T12:00:00Z').getTime();
    const makeSession = i => {
        const startedAt = new Date(start + i * 86400000).toISOString();
        return {
            startedAt,
            lastUpdated: new Date(start + i * 86400000 + 3600000).toISOString(),
            viewerStats: { streamStartedAt: startedAt, streamEndedAt: new Date(start + i * 86400000 + 3600000).toISOString() },
            streamInfo: [{ category: 'Fictional Adventure', changedAt: startedAt }],
            chatters: { FixtureViewer: { messageCount: 3, chatimg: 'not-retained' } },
            emotes: { unused: 'x'.repeat(20000) }
        };
    };
    for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(sessionsDir, `chat-${i}.json`), JSON.stringify(makeSession(i)));
    const service = createSessionService({ dataDir: dir });
    const crm = createCrmService({ dataDir: dir, sessionsDir, getArchivedSessions: service.getArchivedSessions });
    const realRead = fs.readFileSync;
    const realNow = Date.now;
    let now = realNow();
    let reads = 0;
    let bytes = 0;
    let failArchiveRead = false;
    fs.readFileSync = function(file, ...args) {
        if (failArchiveRead && String(file) === path.join(sessionsDir, 'chat-0.json')) {
            throw Object.assign(new Error('fixture read failure'), { code: 'EIO' });
        }
        const result = realRead.call(this, file, ...args);
        if (String(file).startsWith(sessionsDir + path.sep)) {
            reads++;
            bytes += Buffer.byteLength(result);
        }
        return result;
    };
    Date.now = () => now;
    try {
        const coldAt = performance.now();
        assert.deepEqual(service.archivedCategoryMinutes(), { 'Fictional Adventure': 120 * 60 });
        const coldMs = performance.now() - coldAt;
        assert.equal(service.computeMilestones().stream_number, 120);
        assert.deepEqual(crm.getChatterDossier('fixtureviewer').favoriteGames, [{ category: 'Fictional Adventure', sessions: 120, messages: 360 }]);
        assert.equal(reads, 120, 'consumers must share the same archive reads');
        const snapshot = service.getArchivedSessions();
        assert.equal(snapshot.sessions[0].emotes, undefined, 'do not retain unrelated archive payloads');
        assert.equal(snapshot.sessions[0].chatters.FixtureViewer.chatimg, undefined);
        const coldBytes = bytes;
        const warmAt = performance.now();
        for (let i = 0; i < 10; i++) {
            now += 31000; // Force both the metadata scan and milestone TTL to expire.
            assert.deepEqual(service.archivedCategoryMinutes(), { 'Fictional Adventure': 7200 });
            assert.equal(service.computeMilestones().stream_number, 120);
            assert.equal(crm.getChatterDossier('fixtureviewer').favoriteGames[0].messages, 360);
        }
        const warmMs = performance.now() - warmAt;
        assert.equal(reads, 120, 'unchanged archives must not be read after cache expiry');
        assert.equal(service.getArchivedSessions(), snapshot, 'unchanged metadata preserves the snapshot revision');
        const summaryBytes = Buffer.byteLength(JSON.stringify(snapshot.sessions));
        assert.ok(summaryBytes < coldBytes / 10, 'retain compact aggregation inputs, not full archive payloads');
        console.log(`Archive fixture: cold ${reads} JSON reads / ${coldBytes} bytes in ${coldMs.toFixed(1)}ms; summaries ${summaryBytes} bytes; 10 warm aggregation rounds: 0 JSON reads in ${warmMs.toFixed(1)}ms.`);

        const replacement = makeSession(0);
        replacement.chatters.FixtureViewer.messageCount = 9;
        fs.writeFileSync(path.join(sessionsDir, 'chat-0.json'), JSON.stringify(replacement));
        now += 11000;
        assert.equal(crm.getChatterDossier('FixtureViewer').favoriteGames[0].messages, 366);
        assert.equal(reads, 121, 'external rewrite rereads only the changed file');

        fs.writeFileSync(path.join(sessionsDir, 'chat-new.json'), JSON.stringify(makeSession(130)));
        service.invalidateArchives('chat-new.json');
        assert.equal(service.computeMilestones().stream_number, 121, 'new internal archive invalidates the milestone TTL immediately');
        assert.equal(reads, 122);
        fs.unlinkSync(path.join(sessionsDir, 'chat-new.json'));
        service.invalidateArchives('chat-new.json');
        assert.equal(service.computeMilestones().stream_number, 120);
        assert.equal(reads, 122, 'deletion needs no JSON reread');

        service.invalidateArchives();
        assert.equal(service.computeMilestones().stream_number, 120);
        assert.equal(reads, 242, 'restore can force a full refresh even if timestamps match');
        fs.writeFileSync(path.join(sessionsDir, 'chat-broken.json'), '{broken');
        const warnings = [];
        const corruptService = createSessionService({ dataDir: dir, warn: (...args) => warnings.push(args) });
        assert.equal(corruptService.computeMilestones().stream_number, 120);
        assert.equal(warnings.length, 1, 'malformed archives are reported');
        const afterCorruptRead = reads;
        now += 31000;
        corruptService.computeMilestones();
        assert.equal(reads, afterCorruptRead, 'unchanged malformed archive is not reparsed');
        assert.equal(warnings.length, 1);
        fs.writeFileSync(path.join(sessionsDir, 'chat-broken.json'), JSON.stringify(makeSession(140)));
        now += 31000;
        assert.equal(corruptService.computeMilestones().stream_number, 121, 'repaired archive becomes visible');

        failArchiveRead = true;
        corruptService.invalidateArchives('chat-0.json');
        assert.equal(corruptService.computeMilestones().stream_number, 120);
        assert.equal(warnings.length, 2, 'filesystem read failures are reported');
        failArchiveRead = false;
        now += 11000;
        assert.equal(corruptService.computeMilestones().stream_number, 121, 'transient read failures retry even without metadata changes');
    } finally {
        fs.readFileSync = realRead;
        Date.now = realNow;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
