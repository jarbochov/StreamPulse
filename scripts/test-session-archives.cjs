const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { performance } = require('node:perf_hooks');
const { createSessionService } = require('../server/services/session');
const { createCrmService } = require('../server/services/crm');

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
