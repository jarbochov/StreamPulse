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
