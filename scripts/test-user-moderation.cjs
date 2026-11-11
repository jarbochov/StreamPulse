const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');
const { createUserModerationService } = require('../server/services/user-moderation');
const { createMessageDeletionService } = require('../server/services/message-deletions');
const { createSsnService } = require('../server/services/ssn');
const { WebSocketServer } = require('ws');
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

function deletionFixture(t) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-message-deletions-'));
    let beforeCleanup = () => {};
    t.after(() => { beforeCleanup(); fs.rmSync(dataDir, { recursive: true, force: true }); });
    let records = [];
    let session = 'fixture-session';
    let room = 'fictional-room';
    let config = {};
    let changed = () => {};
    const options = {
        dataDir, getConfig: () => config, getBroadcasterId: () => '99',
        getSsnSessionId: () => room, getSessionStartedAt: () => session,
        getSessionName: () => 'chat-2026-01-01T12-00.json',
        getCurrentMessages: () => records, onChange: () => changed(), warn() {}
    };
    const service = createMessageDeletionService(options);
    const message = (id, text = 'fixture message', extra = {}) => ({
        ts: Date.now(), user: 'FixtureViewer', message: text,
        moderation: service.identity({ id, type: 'twitch', username: 'fixtureviewer', chatname: 'FixtureViewer', ...extra })
    });
    return {
        service, options, dataDir, message, setRecords: value => { records = value; },
        setSession: value => { session = value; }, setRoom: value => { room = value; },
        setConfig: value => { config = value; }, onChange: callback => { changed = callback; },
        beforeCleanup: callback => { beforeCleanup = callback; }
    };
}

test('message deletions persist exact SSN/native identities, preserve unrelated messages and do not follow reused MIDs', t => {
    t.mock.method(Date, 'now', () => 100000);
    const f = deletionFixture(t);
    const removed = f.message(12);
    const other = f.message(13);
    const otherPlatform = f.message(12, 'fixture message', { type: 'youtube' });
    f.setRecords([removed, other, otherPlatform]);
    assert.equal(f.service.handleSsn({ delete: { id: '12', type: 'twitch' } }), true);
    assert.deepEqual(f.service.filterRecords([removed, other, otherPlatform]), [other, otherPlatform]);
    f.setSession('next-session');
    const reused = f.message(12);
    assert.equal(f.service.isDeleted(reused), false);
    f.setRoom('different-room');
    assert.equal(f.service.isDeleted(f.message(12)), false);
    const restored = createMessageDeletionService(f.options);
    assert.equal(restored.isDeleted(removed), true);
    const native = f.message('ssn-uuid', 'native capture', { meta: { messageId: 'native-uuid' } });
    f.setRecords([native]);
    f.service.handleTwitch({ kind: 'message', broadcasterId: '99', messageId: 'native-uuid' });
    assert.equal(f.service.isDeleted(native), true);
    assert.equal(f.service.isDeleted({ ...native, moderation: { ...native.moderation, broadcasterId: '100' } }), false);
    f.setConfig({ message_deletion_sync: { enabled: false }, banned_users: [] });
    assert.equal(f.service.isDeleted(removed), true, 'disable/unban must not restore deleted messages');
    f.service.handleSsn({ delete: { id: 13, type: 'twitch' } });
    assert.equal(f.service.isDeleted(other), false);
});

test('upstream clears affect only existing messages in the matching source and session; onlyLast stays individual', t => {
    t.mock.method(Date, 'now', () => 100000);
    const f = deletionFixture(t);
    const first = { ...f.message(1), ts: 90000 };
    const second = { ...f.message(2), ts: 95000 };
    const youtube = f.message(3, 'other source', { type: 'youtube' });
    const donation = { ...f.message(4), event: 'donation', donation: '$5' };
    const otherUser = { ...f.message(5, 'other user', { username: 'otherviewer' }), user: 'OtherViewer' };
    const oldSession = { ...first, moderation: { ...first.moderation, sessionStartedAt: 'old-session' } };
    f.setRecords([first, second, youtube, donation, otherUser]);
    f.service.handleSsn({ delete: { chatname: 'FixtureViewer', type: 'twitch', onlyLast: true } });
    assert.equal(f.service.isDeleted(donation), true, 'onlyLast matches the latest source message');
    assert.equal(f.service.isDeleted(first), false);
    f.service.handleTwitch({ kind: 'user', broadcasterId: '99', userId: '42', userLogin: 'fixtureviewer' });
    assert.equal(f.service.isDeleted(first), true);
    assert.equal(f.service.isDeleted(second), true);
    assert.equal(f.service.isDeleted(otherUser), false);
    assert.equal(f.service.isDeleted(youtube), false);
    assert.equal(f.service.isDeleted(oldSession), false);
    const future = { ...first, ts: 100001, moderation: { ...first.moderation, ssnId: 'future' } };
    assert.equal(f.service.isDeleted(future), false);
    f.service.handleTwitch({ kind: 'clear', broadcasterId: '99' });
    assert.equal(f.service.isDeleted(otherUser), true);
    assert.equal(f.service.isDeleted(future), false);
    const aliasHighlight = { ts: first.ts, user: first.user, session: 'chat-2026-01-01T12-00.json' };
    assert.equal(f.service.isDeleted(aliasHighlight), true);
    assert.equal(f.service.isDeleted({ ...aliasHighlight, session: 'chat-other.json' }), false);
    f.service.handleSsn({ delete: {} });
    assert.equal(f.service.isDeleted(youtube), false, 'empty selectors must never clear all sources');
});

test('Twitch UUID bridge uses unique exact text/login matches and leaves repeated messages untouched', t => {
    t.mock.method(Date, 'now', () => 100000);
    const f = deletionFixture(t);
    const unique = f.message(1, 'A & B');
    f.setRecords([unique, f.message(2, 'different')]);
    f.service.observeTwitch({ id: 'native-1', broadcasterId: '99', userLogin: 'fixtureviewer', text: 'A & B' });
    f.service.handleTwitch({ kind: 'message', broadcasterId: '99', messageId: 'native-1' });
    assert.equal(f.service.isDeleted(unique), true);
    const repeated = f.message(3, 'repeat');
    const repeatedAgain = f.message(4, 'repeat');
    f.setRecords([repeated, repeatedAgain]);
    f.service.observeTwitch({ id: 'native-2', broadcasterId: '99', userLogin: 'fixtureviewer', text: 'repeat' });
    f.service.handleTwitch({ kind: 'message', broadcasterId: '99', messageId: 'native-2' });
    assert.deepEqual(f.service.filterRecords([repeated, repeatedAgain]), [repeated, repeatedAgain]);
    f.setRecords([repeated]);
    f.service.observeTwitch({ id: 'native-3', broadcasterId: '99', userLogin: 'fixtureviewer', text: 'repeat' });
    f.service.handleTwitch({ kind: 'message', broadcasterId: '99', messageId: 'native-3' });
    assert.equal(f.service.isDeleted(repeated), false, 'duplicate native observations are ambiguous too');
    f.setRecords([repeated, { ...repeated, moderation: { ...repeated.moderation } }]);
    f.service.handleSsn({ delete: { type: 'twitch', id: 3 } });
    assert.equal(f.service.isDeleted(repeated), false, 'reused SSN IDs cannot delete ambiguous messages');
});

test('delete-before-message delivery is bounded and persistence failures never claim a successful deletion', t => {
    t.mock.method(Date, 'now', () => 100000);
    const f = deletionFixture(t);
    f.service.handleSsn({ delete: { type: 'twitch', id: 7 } });
    const delayed = { ...f.message(7), ts: 100001 };
    f.service.observeRecord(delayed);
    assert.equal(f.service.isDeleted(delayed), true);
    f.service.handleTwitch({ kind: 'message', broadcasterId: '99', messageId: 'delayed-native' });
    const native = f.message(8, 'native', { meta: { messageId: 'delayed-native' } });
    assert.equal(f.service.isDeleted(native), true);
    const broken = createMessageDeletionService({ ...f.options, safeWriteFileSync: () => { throw new Error('fixture disk full'); } });
    const survivor = f.message(9);
    f.setRecords([survivor]);
    broken.handleSsn({ delete: { type: 'twitch', id: 9 } });
    assert.equal(broken.isDeleted(survivor), false);
    assert.match(broken.status().error, /disk full/);
});

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

test('deletion signals traverse the SSN socket and refresh open archive/highlight views without rewriting history', async t => {
    const f = deletionFixture(t);
    const sessionsDir = path.join(f.dataDir, 'sessions');
    fs.mkdirSync(sessionsDir);
    const session = 'chat-2026-01-01T12-00.json';
    const removed = f.message(1, 'fixture removed phrase', { meta: { messageId: 'native-remove' } });
    const survivor = { ...f.message(2, 'fixture survivor phrase'), ts: removed.ts + 1 };
    const log = [removed, survivor];
    f.setRecords(log);
    const data = {
        startedAt: '2026-01-01T12:00:00Z', messageCount: 2, chatters: {}, emotes: {}, hashtags: {},
        streamInfo: [
            { title: 'Fixture opening', changedAt: '2026-01-01T12:00:00Z' },
            { title: 'Fixture channel update', time: '2026-01-01T12:15:00Z' },
            { title: 'Fixture untimed update', changedAt: 'invalid' }
        ]
    };
    const archiveFile = path.join(sessionsDir, session);
    const logFile = path.join(sessionsDir, session.replace('chat-', 'chatlog-').replace('.json', '.jsonl'));
    fs.writeFileSync(archiveFile, JSON.stringify(data));
    fs.writeFileSync(logFile, log.map(record => JSON.stringify(record)).join('\n'));
    let highlights = log.map(record => ({ ...record, session, pinnedAt: record.ts }));
    const originalArchive = fs.readFileSync(archiveFile, 'utf8');
    const originalLog = fs.readFileSync(logFile, 'utf8');
    const moderation = createUserModerationService({ dataDir: f.dataDir, isDeleted: f.service.isDeleted });
    const readLog = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
    const sessionRoutes = createSessionRoutes({
        sessionsDir, sessionService: {}, getChatData: () => data,
        ssnService: { readChatLogFile: readLog, getCurrentChatLogEntries: () => log },
        filterData: moderation.filterData, filterRecords: moderation.filterRecords
    });
    const highlightsRoutes = createHighlightsRoutes({
        getHighlights: () => highlights, setHighlights: value => { highlights = value; },
        filterRecords: moderation.filterRecords, isDeleted: f.service.isDeleted
    });
    const staticRouter = createStaticRouter({
        rootDir: path.resolve(__dirname, '..'), dataDir: f.dataDir,
        filterData: moderation.filterData, filterRecords: moderation.filterRecords
    });
    const dataRouter = createStaticRouter({ rootDir: f.dataDir, dataDir: f.dataDir, filterData: moderation.filterData, filterRecords: moderation.filterRecords });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (await sessionRoutes(req, res, url, url.pathname)) return;
        if (await highlightsRoutes(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/data/')) { req.url = req.url.slice(5); dataRouter.handleRequest(req, res); return; }
        if (url.pathname.startsWith('/api/')) { res.writeHead(200); res.end('{}'); return; }
        staticRouter.handleRequest(req, res);
    });
    const sockets = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        for (const socket of sockets.clients) socket.terminate();
        sockets.close();
        return new Promise(resolve => server.close(resolve));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const sessionsPage = await browser.newPage();
    const highlightsPage = await browser.newPage();
    const errors = [];
    for (const page of [sessionsPage, highlightsPage]) page.on('pageerror', err => errors.push(err.message));
    await Promise.all([
        sessionsPage.goto(`${base}/sessions.html?session=${session}&view=chat`, { waitUntil: 'networkidle0' }),
        highlightsPage.goto(`${base}/highlights.html`, { waitUntil: 'networkidle0' })
    ]);
    await sessionsPage.waitForFunction(() => document.getElementById('chatlog-messages')?.textContent.includes('fixture removed phrase'));
    await highlightsPage.waitForFunction(() => document.getElementById('results')?.textContent.includes('fixture removed phrase'));
    await highlightsPage.type('#search', 'fixture');
    let chatbotCalls = 0;
    const ssn = createSsnService({
        dataDir: f.dataDir, liveChatPath: path.join(f.dataDir, 'chat.json'), chatLogPath: path.join(f.dataDir, 'chatlog.jsonl'),
        getSsnSessionId: () => 'fictional-room', getSsnServer: () => base.replace('http:', 'ws:') + '/ssn',
        getConfig: () => ({}), getChatData: () => data, messageDeletions: f.service,
        chatbot: { handle: () => { chatbotCalls++; return Promise.resolve(); } },
        log() {}, warn() {}
    });
    f.beforeCleanup(() => ssn.disconnectSSN());
    const connected = new Promise(resolve => sockets.on('connection', (socket, req) => {
        if (req.url === '/ssn') socket.once('message', () => resolve(socket));
    }));
    ssn.connectSSN();
    const source = await connected;
    const changed = new Promise(resolve => f.onChange(() => {
        for (const socket of sockets.clients) if (socket !== source) socket.send(JSON.stringify({ type: 'moderation-update', data: {} }));
        resolve();
    }));
    source.send(JSON.stringify({ overlayNinja: { content: { delete: { type: 'twitch', id: '1' } } } }));
    await changed;
    assert.equal(f.service.isDeleted(removed), true);
    await sessionsPage.waitForFunction(() => !document.getElementById('chatlog-messages')?.textContent.includes('fixture removed phrase'), { polling: 100 });
    await highlightsPage.waitForFunction(() => !document.getElementById('results')?.textContent.includes('fixture removed phrase'), { polling: 100 });
    assert.equal(await highlightsPage.$eval('#search', el => el.value), 'fixture', 'live moderation preserves search');
    assert.match(await sessionsPage.$eval('#chatlog-messages', el => el.textContent), /fixture survivor phrase/);
    assert.equal(chatbotCalls, 0, 'deletion envelopes never enter the chatbot');
    for (const url of [
        `/api/sessions/${session}/chat-log`, '/api/chat-log/search',
        `/api/chat-log/export?session=${session}&format=txt`, '/api/highlights', '/api/highlights/export?format=txt',
        `/data/sessions/${path.basename(logFile)}`
    ]) {
        const response = await fetch(base + url);
        assert.equal(response.status, 200, url);
        assert.doesNotMatch(await response.text(), /fixture removed phrase/, url);
    }
    const timeline = await (await fetch(`${base}/api/sessions/${session}/timeline`)).json();
    assert.equal(timeline.messageCount, 1);
    assert.equal(timeline.events.filter(event => event.type === 'stream-info').length, 2);
    assert.ok(timeline.events.every(event => Number.isFinite(event.ts)), 'timeline omits unparseable stream-info timestamps');
    await sessionsPage.goto(`${base}/sessions.html?session=__current__`, { waitUntil: 'networkidle0' });
    await sessionsPage.waitForFunction(() => document.getElementById('detail-panel')?.textContent.includes('Fixture channel update'));
    assert.doesNotMatch(await sessionsPage.$eval('#detail-panel', panel => panel.textContent), /Invalid Date/);
    const currentTimeline = await (await fetch(`${base}/api/sessions/__current__.json/timeline`)).json();
    assert.equal(currentTimeline.events.filter(event => event.type === 'stream-info').length, 2);
    const rejected = await fetch(`${base}/api/highlights`, { method: 'POST', body: JSON.stringify({ ...removed, session }) });
    assert.equal(rejected.status, 400);
    assert.equal(highlights.length, 2, 'stored hidden highlights survive');
    assert.equal(fs.readFileSync(archiveFile, 'utf8'), originalArchive);
    assert.equal(fs.readFileSync(logFile, 'utf8'), originalLog);
    assert.deepEqual(errors, []);
});

test('System Config enables ban sync and configures deletion sync through real endpoints', async t => {
    const f = fixture(t, async () => ok([permanent]));
    f.setConfig({ banned_users: ['ManualViewer'], twitch_ban_sync: { enabled: false } });
    const configPath = path.join(f.dataDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(f.getConfig()));
    const systemRoutes = createSystemRoutes({
        configPath, getConfig: f.getConfig, safeWriteFileSync: fs.writeFileSync,
        applyRuntimeConfig: value => f.setConfig(value), isLoopbackRequest: () => true
    });
    const messageDeletions = createMessageDeletionService({ dataDir: f.dataDir, getConfig: f.getConfig });
    const twitchRoutes = createTwitchRoutes({
        userModeration: f.service, messageDeletions,
        twitchService: { getTokenScopes: () => [], getEventSubStatus: () => ({}) }
    });
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
    assert.equal(await page.$eval('#cfg-message-deletion-sync', el => el.checked), true);
    assert.match(await page.$eval('#cfg-deletion-status', el => el.textContent), /Reconnect Twitch/);
    await page.$eval('#cfg-message-deletion-sync', el => el.scrollIntoView({ block: 'center' }));
    await page.click('#cfg-message-deletion-sync');
    await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/config') && response.request().method() === 'PUT'),
        page.click('#top-save-config')
    ]);
    assert.equal(f.getConfig().message_deletion_sync.enabled, false);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#cfg-message-deletion-sync', el => el.checked), false);
    assert.deepEqual(errors, []);
});
