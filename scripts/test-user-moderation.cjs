const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');
const { createUserModerationService } = require('../server/services/user-moderation');
const { createSessionRoutes } = require('../server/routes/session');
const { createHighlightsRoutes } = require('../server/routes/highlights');
const { createTwitchRoutes } = require('../server/routes/twitch');
const { createSystemRoutes } = require('../server/routes/system');
const { createStaticRouter } = require('../server/static-router');

function fixture(t, request) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-user-moderation-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    let config = { banned_users: ['ManualViewer'], twitch_ban_sync: { enabled: true } };
    let broadcasterId = 'fictional-channel';
    const service = createUserModerationService({
        dataDir, getConfig: () => config, getBroadcasterId: () => broadcasterId,
        ensureToken: async () => true, getTokenScopes: () => ['moderation:read', 'channel:moderate'], request
    });
    return { service, dataDir, getConfig: () => config, setConfig: value => { config = value; }, setChannel: id => { broadcasterId = id; } };
}
const permanent = { user_id: '42', user_login: 'blockedviewer', user_name: 'BlockedViewer', expires_at: '' };
const ok = (data, pagination = {}) => ({ status: 200, body: { data, pagination } });

test('ban sync paginates, excludes timeouts, retains last good list on failure, and isolates channels', async t => {
    let failing = false;
    const requests = [];
    const f = fixture(t, async (endpoint, params) => {
        requests.push({ endpoint, params });
        if (failing && params.after) return { status: 403, body: { message: 'Missing scope' } };
        return params.after ? ok([{ user_id: '44', user_login: 'otherviewer', user_name: 'OtherViewer', expires_at: '' }])
            : ok([permanent, { user_id: '43', user_login: 'timeoutviewer', expires_at: '2026-12-01T00:00:00Z' }], { cursor: 'page2' });
    });
    const status = await f.service.sync();
    assert.equal(status.count, 2);
    assert.equal(requests[1].params.after, 'page2');
    assert.equal(requests[0].endpoint, '/moderation/banned');
    assert.equal(f.service.isBanned('BLOCKEDVIEWER'), true);
    assert.equal(f.service.isBanned('timeoutviewer'), false);
    const stored = fs.readFileSync(path.join(f.dataDir, 'twitch-bans.json'), 'utf8');
    failing = true;
    assert.match((await f.service.sync()).error, /Missing scope/);
    assert.equal(fs.readFileSync(path.join(f.dataDir, 'twitch-bans.json'), 'utf8'), stored);
    f.setChannel('another-channel');
    assert.equal(f.service.isBanned('blockedviewer'), false);
    assert.equal(f.service.isBanned('@manualviewer'), true);
});

test('live bans and unbans win over in-flight snapshots and never remove manual bans', async t => {
    let release;
    const f = fixture(t, () => new Promise(resolve => { release = resolve; }));
    const pending = f.service.sync();
    const same = f.service.sync();
    assert.equal(same, pending);
    await new Promise(resolve => setImmediate(resolve));
    f.service.onModerationEvent({ id: '42', login: 'blockedviewer', name: 'BlockedViewer', permanent: false });
    f.service.onModerationEvent({ id: '45', login: 'newviewer', name: 'NewViewer', permanent: true });
    release(ok([permanent]));
    assert.equal((await pending).count, 1);
    assert.equal(f.service.isBanned('blockedviewer'), false);
    assert.equal(f.service.isBanned('newviewer'), true);
    f.service.onModerationEvent({ id: '46', login: 'manualviewer', permanent: false });
    assert.equal(f.service.isBanned('manualviewer'), true);
    f.setConfig({ banned_users: ['ManualViewer'], twitch_ban_sync: { enabled: false } });
    assert.equal(f.service.isBanned('newviewer'), false);
    assert.equal(f.service.isBanned('manualviewer'), true);
});

test('archived session, timeline, search, exports, highlights and static credits data are filtered without changing history', async t => {
    const f = fixture(t, async () => ok([permanent]));
    await f.service.sync();
    const sessionsDir = path.join(f.dataDir, 'sessions');
    fs.mkdirSync(sessionsDir);
    const session = 'chat-2026-01-01T12-00.json';
    const data = {
        startedAt: '2026-01-01T12:00:00Z', messageCount: 4,
        chatters: { BlockedViewer: { chatname: 'BlockedViewer', messageCount: 3 }, SafeViewer: { chatname: 'SafeViewer', messageCount: 1 } },
        subscribers: [{ chatname: 'BlockedViewer' }, { chatname: 'SafeViewer' }],
        emotes: { FixtureEmote: { count: 4, users: ['BlockedViewer', 'SafeViewer'] } }
    };
    const log = [{ ts: 1, user: 'BlockedViewer', message: 'hidden', event: 'follow' }, { ts: 2, user: 'SafeViewer', message: 'visible', event: 'follow' }];
    const archiveFile = path.join(sessionsDir, session);
    const logFile = path.join(sessionsDir, session.replace('chat-', 'chatlog-').replace('.json', '.jsonl'));
    fs.writeFileSync(archiveFile, JSON.stringify(data));
    fs.writeFileSync(logFile, log.map(entry => JSON.stringify(entry)).join('\n'));
    fs.writeFileSync(path.join(f.dataDir, 'subs.json'), JSON.stringify({ data: [permanent, { user_id: '99', user_name: 'SafeViewer' }] }));
    const originalArchive = fs.readFileSync(archiveFile, 'utf8');
    const originalLog = fs.readFileSync(logFile, 'utf8');
    let highlights = log.map(item => ({ ...item, session }));
    const readLog = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
    const sessionRoutes = createSessionRoutes({
        sessionsDir, sessionService: {}, getChatData: () => data,
        getStatsData: () => ({ chatters: { BlockedViewer: { days: { today: 3 } }, SafeViewer: { days: { today: 1 } } } }),
        ssnService: { readChatLogFile: readLog, getCurrentChatLogEntries: () => log },
        filterData: f.service.filterData, filterRecords: f.service.filterRecords
    });
    const highlightsRoutes = createHighlightsRoutes({
        getHighlights: () => highlights, setHighlights: value => { highlights = value; },
        filterRecords: f.service.filterRecords, isBanned: f.service.isBanned
    });
    const staticRouter = createStaticRouter({ rootDir: f.dataDir, dataDir: f.dataDir, filterData: f.service.filterData, filterRecords: f.service.filterRecords });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (await sessionRoutes(req, res, url, url.pathname)) return;
        if (await highlightsRoutes(req, res, url, url.pathname)) return;
        staticRouter.handleRequest(req, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const detail = await (await fetch(`${base}/api/sessions/${session}`)).json();
    assert.deepEqual(Object.keys(detail.chatters), ['SafeViewer']);
    assert.equal(detail.messageCount, 1);
    assert.equal(detail.emotes.FixtureEmote.count, 4, 'anonymous aggregate remains intact');
    assert.deepEqual(detail.emotes.FixtureEmote.users, ['SafeViewer']);
    for (const url of [
        `/api/sessions/${session}/chat-log`, `/api/sessions/${session}/timeline`,
        `/api/chat-log/search`, `/api/chat-log/export?session=${session}&format=txt`,
        '/api/export', '/api/highlights', '/api/highlights/export?format=txt', '/subs.json',
        `/sessions/${session}`, `/sessions/${path.basename(logFile)}`
    ]) {
        const response = await fetch(base + url);
        assert.equal(response.status, 200, url);
        assert.doesNotMatch(await response.text(), /blockedviewer/i, url);
    }
    await fetch(`${base}/api/highlights`, { method: 'DELETE', body: JSON.stringify({ ts: 2, user: 'SafeViewer' }) });
    assert.equal(highlights.length, 1, 'editing visible highlights must preserve hidden entries');
    assert.equal(highlights[0].user, 'BlockedViewer');
    assert.equal(fs.readFileSync(archiveFile, 'utf8'), originalArchive);
    assert.equal(fs.readFileSync(logFile, 'utf8'), originalLog);
    f.service.onModerationEvent({ id: '42', login: 'blockedviewer', permanent: false });
    assert.equal((await (await fetch(`${base}/api/highlights`)).json()).length, 1, 'unban restores hidden history');
});

test('System Config enables sync and displays fictional synced accounts through real endpoints', async t => {
    const f = fixture(t, async () => ok([permanent]));
    f.setConfig({ banned_users: ['ManualViewer'], twitch_ban_sync: { enabled: false } });
    const configPath = path.join(f.dataDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(f.getConfig()));
    const systemRoutes = createSystemRoutes({
        configPath, getConfig: f.getConfig, safeWriteFileSync: fs.writeFileSync,
        applyRuntimeConfig: value => f.setConfig(value), isLoopbackRequest: () => true
    });
    const twitchRoutes = createTwitchRoutes({ userModeration: f.service });
    const rootDir = path.resolve(__dirname, '..');
    const staticRouter = createStaticRouter({ rootDir });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (await systemRoutes(req, res, url, url.pathname)) return;
        if (await twitchRoutes(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) { res.writeHead(200); res.end('{}'); return; }
        staticRouter.handleRequest(req, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/config-editor.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('#cfg-banned').value === 'ManualViewer');
    await page.click('#cfg-twitch-ban-sync');
    await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/config') && response.request().method() === 'PUT'),
        page.click('#top-save-config')
    ]);
    assert.equal(f.getConfig().twitch_ban_sync.enabled, true);
    await page.waitForFunction(() => !document.querySelector('#cfg-ban-sync-now').disabled);
    await page.$eval('#cfg-ban-sync-now', el => el.scrollIntoView({ block: 'center' }));
    const [syncResponse] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/twitch/bans/sync')),
        page.click('#cfg-ban-sync-now')
    ]);
    const syncResult = await syncResponse.json();
    assert.equal(syncResult.error, '', JSON.stringify(syncResult));
    await page.waitForFunction(() => document.querySelector('#cfg-ban-users').textContent.includes('blockedviewer'));
    assert.deepEqual(f.getConfig().banned_users, ['ManualViewer']);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#cfg-twitch-ban-sync', el => el.checked), true);
    assert.deepEqual(errors, []);
});
