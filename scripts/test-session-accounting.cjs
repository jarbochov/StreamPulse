const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSessionService } = require('../server/services/session');
const { createSsnService } = require('../server/services/ssn');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-acct-'));
const quiet = () => {};
const iso = ms => new Date(ms).toISOString();
const H = 3600000;
const now = Date.now();

function milestones({ archived = [], current = null, active = true, stats = {} }) {
    const dir = fs.mkdtempSync(path.join(root, 'm-'));
    fs.mkdirSync(path.join(dir, 'sessions'));
    archived.forEach((d, i) => fs.writeFileSync(path.join(dir, 'sessions', `chat-${i}.json`), JSON.stringify(d)));
    const svc = createSessionService({
        dataDir: dir,
        getChatData: () => current,
        getStatsData: () => stats,
        isSessionActive: () => active,
        normalizeViewerStats: v => v || {},
        log: quiet, warn: quiet
    });
    return svc.computeMilestones();
}
const broadcast = (startMs, endMs, extra = {}) => ({
    startedAt: iso(startMs), lastUpdated: iso(endMs + 5 * H), messageCount: 3,
    viewerStats: { live: false, streamStartedAt: iso(startMs), streamEndedAt: iso(endMs), samples: [] }, ...extra
});

(function run() {
    // Real archived broadcast counts; wall-clock tail after the stream does not.
    let r = milestones({ archived: [broadcast(now - 48 * H, now - 46 * H)] });
    assert.strictEqual(r.stream_number, 1);
    assert.strictEqual(r.total_minutes, 120);

    // Legacy archives without viewerStats stream timestamps still count from archive timestamps.
    r = milestones({
        archived: [
            { startedAt: iso(now - 48 * H), lastUpdated: iso(now - 46 * H) },
            { startedAt: iso(now - 24 * H), lastUpdated: iso(now - 21 * H) },
            { startedAt: iso(now - 12 * H) }
        ]
    });
    assert.strictEqual(r.stream_number, 3);
    assert.strictEqual(r.total_minutes, 300, 'only archives with a valid end timestamp contribute duration');

    // Inactive, never-live current session adds nothing.
    r = milestones({ current: { startedAt: iso(now - 3 * H), messageCount: 5, viewerStats: { live: false, samples: [] } }, active: false });
    assert.strictEqual(r.stream_number, 0);
    assert.strictEqual(r.total_minutes, 0);
    assert.strictEqual(r.streak_days, 0);

    // Ended current session does not grow with wall clock.
    const ended = broadcast(now - 10 * H, now - 9 * H);
    r = milestones({ current: ended, active: false });
    assert.strictEqual(r.total_minutes, 60);

    // Live current session counts up to now, and its archived copy is not double counted.
    const live = { startedAt: iso(now - 2 * H), messageCount: 2, viewerStats: { live: true, streamStartedAt: iso(now - 2 * H), samples: [] } };
    r = milestones({ current: live, archived: [broadcast(now - 2 * H, now - H)] });
    assert.strictEqual(r.stream_number, 1);
    assert.strictEqual(r.total_minutes, 120);
    assert.strictEqual(r.streak_days >= 1, true);

    // Two broadcasts on one local date: two streams, one streak day.
    const base = new Date(); base.setHours(1, 0, 0, 0);
    r = milestones({ archived: [broadcast(base.getTime(), base.getTime() + H), broadcast(base.getTime() + 2 * H, base.getTime() + 3 * H)] });
    assert.strictEqual(r.stream_number, 2);

    // One chat counts once.
    r = milestones({ current: { ...live, messageCount: 1 }, stats: { totalMessages: { today: 1 } } });
    assert.strictEqual(r.lifetime_messages, 1);
})();

function ssn(dataDir, failures) {
    const chat = { messageCount: 1, viewerStats: {}, lastUpdated: null };
    const stats = { chatters: { a: 1 } };
    const writes = [];
    const svc = createSsnService({
        dataDir,
        getChatData: () => chat,
        getStatsData: () => stats,
        safeWriteFileSync: (p, c) => {
            if (failures.has(path.basename(p))) throw new Error('injected');
            fs.writeFileSync(p, c);
            writes.push(path.basename(p));
        },
        normalizeViewerStats: v => v || {},
        log: quiet, warn: quiet, error: quiet
    });
    svc.loadStats();
    return { svc, chat, stats, writes };
}

(function idlePersistence() {
    const dir = fs.mkdtempSync(path.join(root, 's-'));
    const { svc, chat, stats, writes } = ssn(dir, new Set());
    chat.extra = 'fictional chat'.repeat(100000);
    stats.extra = 'fictional statistics'.repeat(100000);
    svc.saveChatData();
    svc.saveStats();
    const savedWrites = writes.length;
    const savedTimestamp = chat.lastUpdated;
    for (let i = 0; i < 10; i++) {
        svc.saveChatData();
        svc.saveStats();
    }
    assert.strictEqual(writes.length, savedWrites, 'large unchanged snapshots do not rewrite data or rotating backups');
    assert.strictEqual(chat.lastUpdated, savedTimestamp, 'idle saves do not change the last-update timestamp');
    chat.messageCount++;
    stats.chatters.b = 1;
    svc.saveChatData();
    svc.saveStats();
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'chat.json'))).messageCount, 2);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'stats.json'))).chatters.b, 1);
    assert.strictEqual(writes.length, savedWrites + 3, 'changed chat, stats and backup are still persisted');
})();

(function persistence() {
    const dir = fs.mkdtempSync(path.join(root, 's-'));
    const failures = new Set(['chat.json', 'stats.json']);
    const { svc } = ssn(dir, failures);
    assert.throws(() => svc.saveChatData(), /injected/);
    assert.throws(() => svc.saveStats(), /injected/);
    failures.clear();
    svc.saveChatData();
    svc.saveStats();
    assert.ok(fs.existsSync(path.join(dir, 'chat.json')), 'chat retried after failure');
    assert.ok(fs.existsSync(path.join(dir, 'stats.json')), 'stats retried after failure');

    // Failed backup must not throw nor stop later primary saves.
    const dir2 = fs.mkdtempSync(path.join(root, 's-'));
    const f2 = new Set(['.stats-backup-1.json']);
    const t = ssn(dir2, f2);
    t.svc.saveStats();
    assert.ok(fs.existsSync(path.join(dir2, 'stats.json')));
    t.stats.chatters.b = 1;
    t.svc.saveStats();
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir2, 'stats.json'), 'utf8')).chatters.b);
})();

(function lifecycleAlias() {
    const svc = createSessionService({ dataDir: root, log: quiet, warn: quiet });
    assert.strictEqual(svc.lifecycle, svc.getLifecycle());
    svc.lifecycle.suppressed = true;
    assert.strictEqual(svc.getLifecycle().suppressed, true);
})();

(function teardown() {
    const svc = createSessionService({ dataDir: root, getConfig: () => ({ session_lifecycle: { auto: false } }), log: quiet, warn: quiet });
    svc.startLifecycleWatcher();
    assert.ok(svc.getLifecycle().initialTimer && svc.getLifecycle().timer);
    svc.stopLifecycleWatcher();
    assert.strictEqual(svc.getLifecycle().initialTimer, null);
    assert.strictEqual(svc.getLifecycle().timer, null);

    svc.stopLifecycleWatcher();
})();

async function staleLifecyclePoll() {
    let release;
    const gate = new Promise(r => { release = r; });
    let liveCalls = 0;
    const svc = createSessionService({
        dataDir: root,
        getConfig: () => ({ session_lifecycle: { auto: true, poll_seconds: 3600 } }),
        getTwitchClientId: () => 'fictional',
        getBroadcasterId: () => '1',
        ensureTwitchToken: () => gate.then(() => true),
        fetchTwitchStream: async () => { liveCalls++; return { id: 's1' }; },
        log: quiet, warn: quiet
    });
    svc.startLifecycleWatcher();
    const poll = svc.pollLifecycle();
    svc.stopLifecycleWatcher();
    release();
    await poll;
    assert.strictEqual(liveCalls, 0, 'fetch ran after stop');
    assert.strictEqual(svc.getLifecycle().liveStreak, 0, 'stale completion mutated lifecycle');

    const direct = await (async () => { await svc.pollLifecycle(); return svc.getLifecycle().liveStreak; })();
    assert.strictEqual(direct, 1, 'direct poll still works');
}

async function ssnTeardown() {
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ host: '127.0.0.1', port: 0 });
    await new Promise(r => wss.on('listening', r));
    const live = new Set();
    const realSet = global.setTimeout, realClear = global.clearTimeout;
    global.setTimeout = (fn, ms, ...a) => { const t = realSet(fn, ms, ...a); if (ms >= 1000) live.add(t); return t; };
    global.clearTimeout = t => { live.delete(t); return realClear(t); };
    try {
        const svc = createSsnService({
            dataDir: root,
            getSsnSessionId: () => 'fictional',
            getSsnServer: () => `ws://127.0.0.1:${wss.address().port}`,
            getChatData: () => ({}), getStatsData: () => ({}),
            normalizeViewerStats: v => v || {}, log: quiet, warn: quiet, error: quiet
        });
        svc.connectSSN(); svc.connectSSN();
        svc.connectFeaturedListener(); svc.connectFeaturedListener();
        await new Promise(r => realSet(r, 300));
        assert.strictEqual(wss.clients.size, 2, 'no duplicate sockets');
        svc.disconnectSSN();
        await new Promise(r => realSet(r, 300));
        for (const t of live) realClear(t);
        assert.strictEqual(live.size, 0, 'reconnect timers pending after disconnect');
        svc.connectSSN();
        await new Promise(r => realSet(r, 300));
        assert.strictEqual(wss.clients.size, 1, 'restart reconnects');
        svc.disconnectSSN();
    } finally {
        global.setTimeout = realSet; global.clearTimeout = realClear;
        wss.close();
    }
}

staleLifecyclePoll().then(ssnTeardown).then(() => {
    fs.rmSync(root, { recursive: true, force: true });
    console.log('session accounting tests passed');
}).catch(e => { console.error(e); process.exit(1); });
