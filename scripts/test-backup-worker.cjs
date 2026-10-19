const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { test } = require('node:test');
const AdmZip = require('adm-zip');
const { createBackupService } = require('../server/services/backup');
const { createBackupRoutes } = require('../server/routes/backup');
const { createSessionService } = require('../server/services/session');

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture(t, serviceOptions = {}) {
    const root = fs.mkdtempSync(path.join(__dirname, '.backup-worker-test-'));
    const dataDir = path.join(root, 'data');
    const backupsDir = path.join(dataDir, 'backups');
    fs.mkdirSync(dataDir);
    const configPath = path.join(root, 'fixture-config.json');
    fs.writeFileSync(configPath, '{"port":3000,"fixture":true}');
    fs.writeFileSync(path.join(dataDir, 'stats.json'), '{"messages":42}');
    fs.writeFileSync(path.join(dataDir, 'twitch-tokens.json'), '{"token":"fictional-do-not-export"}');
    for (const dir of ['sessions', 'custom-overlay-assets', 'custom-overlay-history']) {
        fs.mkdirSync(path.join(dataDir, dir));
        fs.writeFileSync(path.join(dataDir, dir, 'fictional.json'), `{"kind":"${dir}"}`);
    }
    const options = {
        files: [
            { src: configPath, dest: 'config.json' },
            { src: path.join(dataDir, 'stats.json'), dest: 'data/stats.json' },
            { src: path.join(dataDir, 'missing.json'), dest: 'data/missing.json' }
        ],
        folders: ['sessions', 'custom-overlay-assets', 'custom-overlay-history']
            .map(dir => ({ src: path.join(dataDir, dir), dest: `data/${dir}` }))
    };
    const service = createBackupService({ backupsDir, ...serviceOptions });
    t.after(async () => {
        await service.close();
        fs.rmSync(root, { recursive: true, force: true });
    });
    return { root, dataDir, backupsDir, configPath, options, service };
}

function assertClean(backupsDir) {
    assert.deepEqual(fs.readdirSync(backupsDir).filter(name => name.startsWith('.backup-work-')), []);
}

async function serve(t, handler) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        Promise.resolve(handler(req, res, url, url.pathname)).then(handled => {
            if (!handled) { res.writeHead(404); res.end(); }
        }).catch(err => { res.writeHead(500); res.end(err.message); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    return `http://127.0.0.1:${server.address().port}`;
}

test('worker archives preserve contents/exclusions, publish atomically and retain ten automatic backups', async t => {
    const f = fixture(t);
    fs.mkdirSync(f.backupsDir);
    for (let i = 1; i <= 11; i++) {
        fs.writeFileSync(path.join(f.backupsDir, `backup-2020-01-${String(i).padStart(2, '0')}T00-00.zip`), 'older fixture');
    }
    fs.writeFileSync(path.join(f.backupsDir, 'manual.zip'), 'keep');
    const backupPath = path.join(f.backupsDir, 'backup-2026-10-19T12-00.zip');
    const result = await f.service.autoBackup({ ...f.options, backupPath });
    assert.equal(result.removed.length, 2);
    assert.equal(fs.readdirSync(f.backupsDir).filter(name => name.startsWith('backup-')).length, 10);
    assert.equal(fs.readFileSync(path.join(f.backupsDir, 'manual.zip'), 'utf8'), 'keep');
    const zip = new AdmZip(backupPath);
    const names = zip.getEntries().filter(entry => !entry.isDirectory).map(entry => entry.entryName).sort();
    assert.deepEqual(names, [
        'config.json', 'data/custom-overlay-assets/fictional.json',
        'data/custom-overlay-history/fictional.json', 'data/sessions/fictional.json', 'data/stats.json'
    ]);
    assert.equal(zip.readAsText('data/stats.json'), '{"messages":42}');
    assert.equal(zip.getEntry('data/twitch-tokens.json'), null);
    const before = fs.readFileSync(backupPath);
    await assert.rejects(f.service.autoBackup({
        ...f.options, backupPath, files: [{ src: f.dataDir, dest: 'data/not-a-file' }]
    }));
    assert.deepEqual(fs.readFileSync(backupPath), before, 'failed creation leaves previous backup intact');
    assertClean(f.backupsDir);
});

test('HTTP backup/HEAD/restore retain payloads, reload/restart fields, and selective sharing', async t => {
    const f = fixture(t);
    let reloads = 0;
    const handler = createBackupRoutes({
        rootDir: f.root, dataDir: f.dataDir, configPath: f.configPath, backupsDir: f.backupsDir,
        sessionsDir: path.join(f.dataDir, 'sessions'),
        customOverlayAssetsDir: path.join(f.dataDir, 'custom-overlay-assets'),
        customOverlayHistoryDir: path.join(f.dataDir, 'custom-overlay-history'),
        backupService: f.service, getBackupFileSpecs: () => f.options.files,
        getConfig: () => ({ port: 3000 }),
        onRestore: async ({ previousConfig, restored, entries }) => {
            reloads++;
            assert.deepEqual(previousConfig, { port: 3000 });
            assert.ok(restored.includes('data/stats.json'));
            assert.ok(entries.some(entry => entry.entryName === 'config.json'));
            assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'stats.json'))).messages, 42);
            await sleep(5);
            return { restartFields: ['port'] };
        },
        listShareItems: () => ({ fixture: [] }),
        buildShareZip: () => ({ buffer: Buffer.from('fictional share'), count: 1 }),
        importShareZip: () => [{ id: 'fictional-overlay', status: 'imported' }]
    });
    const base = await serve(t, handler);
    const response = await fetch(base + '/api/backup');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.match(response.headers.get('content-disposition'), /streampulse-backup-\d{4}-\d{2}-\d{2}\.zip/);
    const archive = Buffer.from(await response.arrayBuffer());
    assert.equal(Number(response.headers.get('content-length')), archive.length);
    assert.equal(new AdmZip(archive).readAsText('config.json'), '{"port":3000,"fixture":true}');
    const head = await fetch(base + '/api/backup', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), archive.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    fs.writeFileSync(path.join(f.dataDir, 'stats.json'), '{"messages":0}');
    const restored = await fetch(base + '/api/restore', { method: 'POST', body: archive });
    const payload = await restored.json();
    assert.equal(restored.status, 200);
    assert.equal(payload.status, 'restored');
    assert.equal(payload.files, 5);
    assert.equal(payload.restartRequired, true);
    assert.deepEqual(payload.restartFields, ['port']);
    assert.equal(reloads, 1);
    const invalid = new AdmZip();
    invalid.addFile('config.json', Buffer.from('{}'));
    const rejected = await fetch(base + '/api/restore', { method: 'POST', body: invalid.toBuffer() });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: 'Invalid backup: missing stats.json' });
    const corrupt = await fetch(base + '/api/restore', { method: 'POST', body: 'not a zip' });
    assert.equal(corrupt.status, 500);
    assert.match((await corrupt.json()).error, /Restore failed:/);
    assert.equal(reloads, 1);
    assert.deepEqual(await (await fetch(base + '/api/share/items')).json(), { fixture: [] });
    assert.equal(await (await fetch(base + '/api/share/export', {
        method: 'POST', body: '{"items":["overlay:fictional-overlay"]}'
    })).text(), 'fictional share');
    assert.deepEqual(await (await fetch(base + '/api/share/import', { method: 'POST', body: 'fixture' })).json(),
        { results: [{ id: 'fictional-overlay', status: 'imported' }] });
    const release = deferred();
    const entered = deferred();
    const active = f.service.download(f.options, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const pending = [
        f.service.download(f.options, () => {}),
        f.service.download(f.options, () => {})
    ];
    try {
        const busy = await fetch(base + '/api/backup');
        assert.equal(busy.status, 503);
        assert.match((await busy.json()).error, /busy/);
        const busyRestore = await fetch(base + '/api/restore', { method: 'POST', body: archive });
        assert.equal(busyRestore.status, 503);
    } finally {
        release.resolve();
        await Promise.all([active, ...pending]);
    }
    await f.service.waitForIdle();
    assertClean(f.backupsDir);
});

test('restore stages before publishing, excludes traversal and refuses symlink destinations', async t => {
    const f = fixture(t);
    const zip = new AdmZip();
    zip.addFile('data/stats.json', Buffer.from('{"messages":17}'));
    zip.addFile('data/nested/safe.json', Buffer.from('fictional'));
    zip.addFile('data/../outside.json', Buffer.from('escape'));
    zip.addFile('ignored.json', Buffer.from('ignored'));
    const destinations = { dataDir: f.dataDir, configPath: f.configPath };
    const result = await f.service.restore(destinations, Readable.from(zip.toBuffer()), result => result);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'stats.json'))).messages, 17);
    assert.equal(fs.existsSync(path.join(f.root, 'outside.json')), false);
    assert.ok(!result.restored.includes('ignored.json'));
    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(f.dataDir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const unsafe = new AdmZip();
    unsafe.addFile('data/stats.json', Buffer.from('{"messages":999}'));
    unsafe.addFile('data/linked/escape.json', Buffer.from('escape'));
    await assert.rejects(f.service.restore(destinations, Readable.from(unsafe.toBuffer()), () => assert.fail('must not reload')),
        /symbolic link/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'stats.json'))).messages, 17,
        'destination failure is detected before any live writes');
    assert.equal(fs.existsSync(path.join(outside, 'escape.json')), false);
    assertClean(f.backupsDir);
});

test('restore response disconnect after publication still finishes reload and cleanup', async t => {
    const f = fixture(t);
    const entered = deferred();
    const release = deferred();
    let reloaded = false;
    const handler = createBackupRoutes({
        rootDir: f.root, dataDir: f.dataDir, configPath: f.configPath, backupsDir: f.backupsDir,
        backupService: f.service,
        onRestore: async () => {
            assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'stats.json'))).messages, 73);
            entered.resolve();
            await release.promise;
            reloaded = true;
            return { restartFields: [] };
        }
    });
    const base = await serve(t, handler);
    const zip = new AdmZip();
    zip.addFile('data/stats.json', Buffer.from('{"messages":73}'));
    const controller = new AbortController();
    const request = fetch(base + '/api/restore', { method: 'POST', body: zip.toBuffer(), signal: controller.signal });
    const disconnected = assert.rejects(request, error => error.name === 'AbortError');
    try {
        await entered.promise;
        controller.abort();
        await disconnected;
    } finally {
        release.resolve();
        await f.service.waitForIdle();
    }
    assert.equal(reloaded, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'stats.json'))).messages, 73);
    assertClean(f.backupsDir);
});

test('single-worker queue bounds requests, rejects overflow and cancellation, and releases its disk lease', async t => {
    const f = fixture(t);
    const entered = deferred();
    const release = deferred();
    const first = f.service.download(f.options, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    let secondEntered = false;
    const second = f.service.download(f.options, async () => { secondEntered = true; });
    const controller = new AbortController();
    const third = f.service.download(f.options, () => assert.fail('cancelled job ran'), { signal: controller.signal });
    await assert.rejects(f.service.download(f.options, () => {}), err => err.code === 'BACKUP_BUSY');
    controller.abort();
    await assert.rejects(third, err => err.code === 'ABORT_ERR');
    assert.equal(secondEntered, false);
    assert.equal(fs.readdirSync(f.backupsDir).filter(name => name.startsWith('.backup-work-')).length, 1);
    release.resolve();
    await Promise.all([first, second]);
    assert.equal(secondEntered, true);
    assertClean(f.backupsDir);
    await f.service.close();
    await assert.rejects(f.service.download(f.options, () => {}), err => err.code === 'BACKUP_CLOSED');
});

test('worker exit, exceptions, timeout and active cancellation never return success or leak workspaces', async t => {
    for (const [name, script, expected] of [
        ['exit', 'process.exit(0);', /without a result/],
        ['throw', 'throw new Error("fictional worker failure");', /fictional worker failure/],
        ['timeout', 'setInterval(() => {}, 1000);', /timed out/]
    ]) {
        const f = fixture(t);
        const workerPath = path.join(f.root, `${name}.cjs`);
        fs.writeFileSync(workerPath, script);
        const service = createBackupService({ backupsDir: f.backupsDir, workerPath, workerTimeoutMs: 150 });
        try {
            await assert.rejects(service.download(f.options, () => assert.fail('failure reported success')), expected);
            assertClean(f.backupsDir);
        } finally { await service.close(); }
    }
    const f = fixture(t);
    const marker = path.join(f.root, 'started');
    const workerPath = path.join(f.root, 'cancel.cjs');
    fs.writeFileSync(workerPath, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ready'); setInterval(() => {}, 1000);`);
    const service = createBackupService({ backupsDir: f.backupsDir, workerPath });
    const controller = new AbortController();
    const operation = service.download(f.options, () => assert.fail('cancelled worker reported success'), { signal: controller.signal });
    const failed = assert.rejects(operation, err => err.code === 'ABORT_ERR');
    try {
        for (let i = 0; i < 200 && !fs.existsSync(marker); i++) await sleep(5);
        assert.ok(fs.existsSync(marker), 'worker actually started');
        controller.abort();
        await failed;
        assertClean(f.backupsDir);
        const marker2 = path.join(f.root, 'close-started');
        fs.writeFileSync(workerPath, `require('fs').writeFileSync(${JSON.stringify(marker2)}, 'ready'); setInterval(() => {}, 1000);`);
        const active = service.download(f.options, () => assert.fail('closed worker reported success'));
        const activeFailed = assert.rejects(active, err => err.code === 'ABORT_ERR');
        const queued = service.download(f.options, () => assert.fail('closed queued job ran'));
        const queuedFailed = assert.rejects(queued, err => err.code === 'BACKUP_CLOSED');
        for (let i = 0; i < 200 && !fs.existsSync(marker2); i++) await sleep(5);
        assert.ok(fs.existsSync(marker2));
        await service.close();
        await Promise.all([activeFailed, queuedFailed]);
        assertClean(f.backupsDir);
    } finally { await service.close(); }
});

test('session end awaits backup before reset and propagates backup failure without clearing data', async t => {
    const f = fixture(t);
    const release = deferred();
    const entered = deferred();
    let resets = 0;
    let active = true;
    let chat = { startedAt: new Date().toISOString(), messageCount: 3, viewerStats: {}, streamInfo: [] };
    const svc = createSessionService({
        dataDir: f.dataDir,
        getChatData: () => chat, getStatsData: () => ({}),
        normalizeViewerStats: value => value || {},
        isSessionActive: () => active, setSessionActive: value => { active = value; },
        resetChatData: () => { resets++; chat = { messageCount: 0 }; },
        saveChatData: () => fs.writeFileSync(path.join(f.dataDir, 'chat.json'), JSON.stringify(chat)),
        performAutoBackup: async () => { entered.resolve(); await release.promise; },
        log() {}, warn() {}
    });
    const first = svc.endSessionNow();
    assert.equal(svc.endSessionNow(), first);
    await entered.promise;
    assert.equal(resets, 0);
    assert.equal(active, true);
    assert.throws(() => svc.startSessionNow(), /still in progress/);
    release.resolve();
    await svc.waitForPendingEnd();
    await first;
    assert.equal(resets, 1);
    assert.equal(active, false);
    const failed = createSessionService({
        dataDir: f.dataDir, getChatData: () => ({ messageCount: 3, viewerStats: {} }),
        performAutoBackup: async () => { throw new Error('fictional backup failure'); },
        resetChatData: () => assert.fail('failed backup reset live data'), log() {}, warn() {}
    });
    await assert.rejects(failed.endSessionNow(), /fictional backup failure/);
});

test('automatic lifecycle waits for backup and cannot start a stale session after its watcher stops', async t => {
    const f = fixture(t);
    for (const stopWatcher of [false, true]) {
        const release = deferred();
        const entered = deferred();
        let resets = 0;
        let active = true;
        let chat = {
            startedAt: '2025-01-01T00:00:00Z', lastUpdated: '2025-01-01T01:00:00Z',
            messageCount: 3, streamInfo: [],
            viewerStats: { streamStartedAt: '2025-01-01T00:00:00Z' }
        };
        const svc = createSessionService({
            dataDir: f.dataDir, getChatData: () => chat, getStatsData: () => ({}),
            normalizeViewerStats: value => value || {},
            isSessionActive: () => active, setSessionActive: value => { active = value; },
            resetChatData: () => { resets++; chat = { messageCount: 0 }; },
            saveChatData: () => fs.writeFileSync(path.join(f.dataDir, 'chat.json'), JSON.stringify(chat)),
            performAutoBackup: async () => { entered.resolve(); await release.promise; },
            log() {}, warn() {}
        });
        svc.lifecycle.liveStreak = 1;
        const live = svc.lifecycleOnLive({ id: 'fictional-new-stream', started_at: '2026-10-19T12:00:00Z' },
            { resume_window_minutes: 5 });
        await entered.promise;
        assert.equal(resets, 0);
        if (stopWatcher) svc.stopLifecycleWatcher();
        release.resolve();
        await live;
        assert.equal(resets, stopWatcher ? 1 : 2, 'stopped generation must not start another session');
        assert.equal(active, !stopWatcher);
        svc.stopLifecycleWatcher();
    }
});

test('backup failure/retry and events during compression preserve chat, logs and lifetime counts exactly once', async t => {
    const f = fixture(t);
    let chat = {
        startedAt: '2026-10-19T12:00:00Z', lastUpdated: '2026-10-19T13:00:00Z',
        messageCount: 1, streamInfo: [],
        viewerStats: { streamStartedAt: '2026-10-19T12:00:00Z', streamEndedAt: '2026-10-19T13:00:00Z' }
    };
    let log = [{ ts: Date.parse('2026-10-19T12:10:00Z'), name: 'fictional-first', message: 'first' }];
    const stats = { totalMessages: { '2026-10-19': 1 } };
    let active = true;
    let playedCalls = 0;
    let attempts = 0;
    let gate = deferred();
    let entered = deferred();
    const svc = createSessionService({
        dataDir: f.dataDir, getChatData: () => chat, getChatLog: () => log, getStatsData: () => stats,
        normalizeViewerStats: value => value || {},
        isSessionActive: () => active, setSessionActive: value => { active = value; },
        saveChatData: () => fs.writeFileSync(path.join(f.dataDir, 'chat.json'), JSON.stringify(chat)),
        saveStats: () => fs.writeFileSync(path.join(f.dataDir, 'stats.json'), JSON.stringify(stats)),
        saveChatLog: () => fs.writeFileSync(path.join(f.dataDir, 'chat-log.jsonl'), log.map(row => JSON.stringify(row)).join('\n') + '\n'),
        resetChatData: () => { chat = { messageCount: 0, viewerStats: {} }; log = []; },
        recordPlayedGames: async () => { playedCalls++; },
        performAutoBackup: async () => {
            const attempt = ++attempts;
            entered.resolve();
            await gate.promise;
            if (attempt === 1) throw new Error('fictional compression failure');
        },
        log() {}, warn() {}
    });
    const collect = name => {
        chat.messageCount++;
        stats.totalMessages['2026-10-19']++;
        log.push({ ts: Date.now(), name, message: 'during compression' });
    };
    const failed = svc.endSessionNow();
    const rejection = assert.rejects(failed, /fictional compression failure/);
    await entered.promise;
    collect('fictional-during-failure');
    gate.resolve();
    await rejection;
    assert.equal(active, true);
    assert.equal(chat.messageCount, 2);
    assert.equal(log.length, 2);
    assert.equal(playedCalls, 0, 'failed compression must not repeat Game Plan work on retry');
    gate = deferred();
    entered = deferred();
    const retry = svc.endSessionNow();
    assert.equal(svc.endSessionNow(), retry, 'concurrent retries share one transition');
    await entered.promise;
    collect('fictional-during-success');
    gate.resolve();
    const ended = await retry;
    const archives = fs.readdirSync(path.join(f.dataDir, 'sessions')).filter(name => name.startsWith('chat-'));
    assert.deepEqual(archives, [ended.archiveName], 'retry updates the same archive rather than duplicating it');
    const archivedChat = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'sessions', ended.archiveName)));
    assert.equal(archivedChat.messageCount, 3);
    const archivedLog = fs.readFileSync(path.join(f.dataDir, 'sessions',
        ended.archiveName.replace('chat-', 'chatlog-').replace('.json', '.jsonl')), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(archivedLog.map(row => row.name), ['fictional-first', 'fictional-during-failure', 'fictional-during-success']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'stats.json'))).totalMessages['2026-10-19'], 3);
    assert.equal(svc.computeMilestones().stream_number, 1);
    assert.equal(svc.computeMilestones().lifetime_messages, 3);
    assert.equal(playedCalls, 1);
    assert.equal(active, false);
    assert.equal(chat.messageCount, 0);
});

test('bounded 16 MiB backup and restore leave timer and HTTP handling responsive', async t => {
    const f = fixture(t);
    const large = path.join(f.dataDir, 'custom-overlay-assets', 'fictional-media.bin');
    fs.writeFileSync(large, randomBytes(16 * 1024 * 1024));
    const base = await serve(t, (_req, res) => { res.end('fictional pong'); return true; });
    let ticks = 0;
    let maxGap = 0;
    let previous = performance.now();
    const ticker = setInterval(() => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - previous);
        previous = now;
        ticks++;
    }, 10);
    let probes = 0;
    let maxHttpMs = 0;
    let running = true;
    const probe = (async () => {
        while (running) {
            const started = performance.now();
            assert.equal(await (await fetch(base)).text(), 'fictional pong');
            maxHttpMs = Math.max(maxHttpMs, performance.now() - started);
            probes++;
            await sleep(15);
        }
    })();
    const start = performance.now();
    let zipSize;
    let backupMs;
    let restoreMs;
    try {
        const backupPath = path.join(f.backupsDir, 'backup-2026-10-19T14-00.zip');
        await f.service.autoBackup({ ...f.options, backupPath });
        backupMs = performance.now() - start;
        zipSize = fs.statSync(backupPath).size;
        const restoreStart = performance.now();
        await f.service.restore({ dataDir: f.dataDir, configPath: f.configPath },
            fs.createReadStream(backupPath), result => result);
        restoreMs = performance.now() - restoreStart;
    } finally {
        running = false;
        clearInterval(ticker);
        await probe;
    }
    assert.ok(ticks >= 5, `timer must run throughout archive work (ticks=${ticks})`);
    assert.ok(probes >= 3, `HTTP must run throughout archive work (probes=${probes})`);
    assert.ok(maxGap < 300, `main-loop timer gap ${maxGap.toFixed(1)} ms`);
    assert.ok(maxHttpMs < 300, `HTTP latency ${maxHttpMs.toFixed(1)} ms`);
    console.log(`[Backup fixture] input=16 MiB random media; ZIP=${zipSize} bytes; create=${backupMs.toFixed(1)} ms; restore=${restoreMs.toFixed(1)} ms; ticks=${ticks}; probes=${probes}; max timer gap=${maxGap.toFixed(1)} ms; max HTTP=${maxHttpMs.toFixed(1)} ms`);
    assertClean(f.backupsDir);
});

async function exerciseBackend(root) {
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const http = require('node:http');
    const { ServerManager } = require('./desktop/server-manager');
    const backupModule = require('./server/services/backup');
    const create = backupModule.createBackupService;
    let service;
    backupModule.createBackupService = options => { service = create(options); return service; };
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const configPath = path.join(root, 'config.json');
    const dataDir = path.join(root, 'backend-data');
    fs.mkdirSync(dataDir);
    fs.writeFileSync(configPath, JSON.stringify({
        port, broadcaster_id: '', ssn: {}, twitch_refresh_minutes: -1,
        viewer_tracking: { enabled: false }, session_lifecycle: { auto: false },
        music: { enabled: false }, weather: { enabled: false }
    }));
    fs.writeFileSync(path.join(dataDir, 'chat.json'), JSON.stringify({
        startedAt: new Date().toISOString(), messageCount: 3, chatters: {}, viewerStats: {}
    }));
    const manager = new ServerManager({ projectRoot: process.cwd(), configPath, dataDir, port });
    try {
        await manager.start();
        await manager.waitForReady();
        for (const action of ['restart', 'stop']) {
            let entered;
            let release;
            const started = new Promise(resolve => { entered = resolve; });
            const hold = new Promise(resolve => { release = resolve; });
            const download = service.download({ files: [{ src: configPath, dest: 'config.json' }] },
                async () => { entered(); await hold; });
            await started;
            let finished = false;
            const lifecycle = manager[action]().then(() => { finished = true; });
            await new Promise(resolve => setTimeout(resolve, 30));
            assert.equal(finished, false, `${action} must wait for the backup lease`);
            assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'chat.json'))).messageCount, 3);
            release();
            await Promise.all([download, lifecycle]);
            if (action === 'restart') {
                await manager.waitForReady();
                assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'chat.json'))).messageCount, 3);
            }
        }
        assert.equal(manager.serverInstance.server.listening, false);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'chat.json'))).messageCount, 0);
        assert.equal(fs.readdirSync(path.join(dataDir, 'backups')).length, 0, 'no worker workspaces remain');
    } finally {
        await manager.stop();
        await service?.close();
    }
}

test('real backend shutdown and embedded restart await active backups before mutating session files', t => {
    const f = fixture(t);
    execFileSync(process.execPath, ['-e', `(${exerciseBackend.toString()})(${JSON.stringify(f.root)}).catch(err => { console.error(err); process.exitCode = 1; });`], {
        cwd: path.resolve(__dirname, '..'), timeout: 20000, stdio: 'pipe'
    });
});
