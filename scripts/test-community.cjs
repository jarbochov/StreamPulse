'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createCommunityInsights } = require('../server/services/community-insights');
const { createCommunityChat, normalizeCommunityChat, anniversary } = require('../server/services/community-chat');
const { localDateTimeStr } = require('../server/services/session');
const { safeWriteFileSync } = require('../server/routes/helpers');
const { createSsnService } = require('../server/services/ssn');
const createChatbot = require('../server/services/chatbot');
const net = require('node:net');

const waitReady = async service => {
    for (let i = 0; i < 200; i++) {
        const status = service.status();
        if (status.phase === 'ready') return;
        if (status.phase === 'error') throw new Error(status.error);
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Community scan did not finish');
};

test('Community backfill is opt-in, avoids resumed duplicates, tracks live arrivals and honors moderation', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-community-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const sessionsDir = path.join(dir, 'sessions');
    fs.mkdirSync(sessionsDir);
    const currentStart = '2025-03-01T10:00:00.000Z';
    const oldStart = '2025-02-01T10:00:00.000Z';
    const now = Date.parse(currentStart);
    const chat = { startedAt: currentStart, viewerStats: { live: true, streamStartedAt: currentStart }, chatters: {} };
    const old = { startedAt: oldStart, viewerStats: { streamStartedAt: oldStart }, chatters: {} };
    const fallback = { startedAt: '2025-01-01T10:00:00.000Z', chatters: { Alice: { messageCount: 1 } }, viewerStats: {} };
    const filename = startedAt => `chat-${localDateTimeStr(startedAt)}.json`;
    const archiveLog = startedAt => path.join(sessionsDir, filename(startedAt).replace('chat-', 'chatlog-').replace('.json', '.jsonl'));
    fs.writeFileSync(archiveLog(oldStart), 'null\n[]\n42\n{"broken":\n' + [
        { ts: Date.parse(oldStart) + 1000, user: 'Alice', message: '#Hello', messageHtml: '#Hello <img src="https://emotes.example/kappa.png" alt="Kappa">' },
        { ts: Date.parse(oldStart) + 2000, user: 'Bob', message: '#Hello' },
        { ts: Date.parse(oldStart) + 3000, user: 'Alice', message: '#deleted', moderation: { nativeId: 'deleted' } }
    ].map(JSON.stringify).join('\n') + '\n');
    fs.writeFileSync(archiveLog(currentStart), JSON.stringify({ ts: now + 1000, user: 'Alice', message: '#duplicate' }) + '\n');
    fs.writeFileSync(path.join(sessionsDir, 'chatlog-orphan.jsonl'), JSON.stringify({ ts: Date.parse('2025-01-15T10:00:00Z'), user: 'Alice', message: '#orphan' }) + '\n');
    const currentLog = path.join(dir, 'chat-log.jsonl');
    fs.writeFileSync(currentLog, JSON.stringify({ ts: now + 1000, user: 'Alice', message: '#Hello' }) + '\n');
    fs.writeFileSync(path.join(dir, 'followers.json'), JSON.stringify({ data: [{ user_login: 'alice', user_name: 'Alice', followed_at: '2022-01-02T00:00:00Z' }] }));
    let enabled = false;
    let deleted = true;
    let banned = false;
    let allowFallback = true;
    let moderationFingerprint = 'initial';
    const events = [];
    const config = { hashtags_enabled: true };
    const make = () => createCommunityInsights({
        dataDir: dir, sessionsDir, chatLogPath: currentLog,
        getConfig: () => ({ ...config, community_insights_enabled: enabled }),
        getChatData: () => chat, getArchivedSessions: () => ({ sessions: [fallback, old, chat] }),
        sessionFilename: filename, flushChatLog: () => {},
        filterRecords: records => records.filter(r => !(deleted && r.moderation?.nativeId === 'deleted') && !(banned && r.user?.toLowerCase() === 'bob')),
        isExcluded: name => name === 'excluded', isBotMessage: text => text.startsWith('[BOT]'),
        getBannedHashtags: () => new Set(), isLive: () => chat.viewerStats.live,
        allowSummaryFallback: () => allowFallback, getModerationFingerprint: () => moderationFingerprint,
        safeWriteFileSync, onActivity: event => events.push(event)
    });
    const service = make();
    service.start();
    assert.equal(service.status().phase, 'off');
    assert.equal(fs.existsSync(path.join(dir, 'community-insights.json')), false);
    enabled = true;
    service.configChanged(false);
    service.record({ ts: now + 2000, user: 'Alice', message: '#new', messageHtml: '#new <img alt="Wave" src="https://emotes.example/wave.png">' }, { logged: false, totalMessages: 3 });
    await waitReady(service);
    let alice = service.getPerson('ALICE');
    assert.equal(alice.streams, 3);
    assert.equal(alice.streak, 3);
    assert.deepEqual(alice.hashtags, [{ name: '#hello', count: 2 }, { name: '#new', count: 1 }, { name: '#orphan', count: 1 }]);
    assert.equal(alice.hashtagsStarted, 3);
    assert.deepEqual(alice.emotes, [
        { name: 'Kappa', count: 1, imageUrl: 'https://emotes.example/kappa.png' },
        { name: 'Wave', count: 1, imageUrl: 'https://emotes.example/wave.png' }
    ]);
    assert.equal(events.length, 1, 'live message received during scan is replayed once');
    assert.equal(service.getFollow('ALICE').followedAt, '2022-01-02T00:00:00.000Z');
    assert.equal(service.getFollow('Nobody'), null);
    assert.equal(service.markAnnounced('milestone:alice:100'), true);
    service.stop();

    const restored = make();
    restored.start();
    assert.equal(restored.status().phase, 'ready', 'clean restart does not rescan');
    assert.equal(restored.getPerson('Alice').hashtags.find(x => x.name === '#new').count, 1);
    assert.equal(restored.getPerson('Alice').emotes.find(x => x.name === 'Wave').imageUrl, 'https://emotes.example/wave.png');
    assert.equal(restored.hasAnnounced('milestone:alice:100'), true);
    banned = true;
    allowFallback = false;
    restored.invalidate();
    await waitReady(restored);
    alice = restored.getPerson('Alice');
    assert.equal(alice.streams, 2, 'unverifiable summary fallback is omitted after moderation');
    assert.equal(alice.hashtags.find(x => x.name === '#new').count, 1, 'derived-only messages survive rebuild');
    assert.equal(alice.emotes.find(x => x.name === 'Wave').imageUrl, 'https://emotes.example/wave.png');
    assert.equal(restored.getPerson('Bob'), null);
    assert.equal(restored.hasAnnounced('milestone:alice:100'), true);
    deleted = false;
    restored.invalidate();
    await waitReady(restored);
    assert.equal(restored.getPerson('Alice').hashtags.find(x => x.name === '#deleted').count, 1);
    restored.stop();
    banned = false;
    moderationFingerprint = 'changed-while-stopped';
    const restarted = make();
    restarted.start();
    assert.equal(restarted.status().phase, 'scanning', 'changed moderation invalidates a clean persisted index on restart');
    await waitReady(restarted);
    assert.ok(restarted.getPerson('Bob'));
    restarted.stop();
    const journal = fs.readFileSync(path.join(dir, 'community-insights-events.jsonl'), 'utf8');
    assert.ok(!journal.includes('"message"'), 'derived-only journal contains no raw messages');
});

test('SSN passes the previous observation before updating stats and excludes events and configured users', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-community-ssn-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const past = '2024-01-01T00:00:00.000Z';
    const stats = { chatters: { Alice: { firstSeen: past, lastSeen: past, days: { '2024-01-01': 99 } } } };
    const chat = { startedAt: new Date().toISOString(), viewerStats: { live: true }, chatters: {} };
    const messages = [];
    const subscriptions = [];
    const service = createSsnService({
        dataDir: dir, getConfig: () => ({ community_insights_enabled: true, chat_log_enabled: false }),
        getChatData: () => chat, getStatsData: () => stats, getExcludeUsers: () => ['excluded'],
        isBannedUser: (name, id) => id === '42',
        chatbot: { isBotMessage: text => text.startsWith('[BOT]') },
        onCommunityChat: (record, activity) => messages.push({ record, activity }),
        onCommunitySubscription: activity => subscriptions.push(activity),
        log: () => {}, warn: () => {}, error: () => {}
    });
    service.processChatMessage({ chatname: 'Alice', type: 'twitch', chatmessage: 'hello #world' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].activity.previousLastSeen, past);
    assert.equal(messages[0].activity.firstSeen, past);
    assert.equal(messages[0].activity.totalMessages, 100);
    assert.equal(messages[0].activity.logged, false);
    service.processChatMessage({ chatname: 'Excluded', type: 'twitch', chatmessage: 'hello' });
    service.processChatMessage({ chatname: 'Alice', type: 'twitch', event: 'resub', membership: 'subscriber', subtitle: '12-Months' });
    service.processChatMessage({ chatname: 'Alice', type: 'twitch', bot: true, chatmessage: 'hello' });
    assert.equal(messages.length, 1);
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].months, 12);
    service.recordSubTenure('RenamedViewer', { type: 'twitch', userId: '42', membership: 'subscriber', subtitle: '12-Months' }, new Date().toISOString());
    service.recordSubTenure('BotViewer', { type: 'twitch', chatmessage: '[BOT] hello', membership: 'subscriber', subtitle: '12-Months' }, new Date().toISOString());
    assert.equal(subscriptions.length, 1, 'banned IDs and bot messages cannot trigger subscription milestones');
});

test('Backfill separates recorded live windows within a resumed session and ignores offline chat for attendance', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-community-windows-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const sessionsDir = path.join(dir, 'sessions');
    fs.mkdirSync(sessionsDir);
    const session = {
        startedAt: '2025-01-01T10:00:00.000Z',
        viewerStats: {
            streamStartedAt: '2025-01-02T10:00:00.000Z',
            streamEndedAt: '2025-01-02T11:00:00.000Z',
            samples: [
                { ts: '2025-01-01T10:00:00.000Z', live: true },
                { ts: '2025-01-01T11:00:00.000Z', live: false },
                { ts: '2025-01-02T10:00:00.000Z', live: true },
                { ts: '2025-01-02T11:00:00.000Z', live: false }
            ]
        }
    };
    const filename = startedAt => `chat-${localDateTimeStr(startedAt)}.json`;
    const logfile = filename(session.startedAt).replace('chat-', 'chatlog-').replace('.json', '.jsonl');
    fs.writeFileSync(path.join(sessionsDir, logfile), [
        { ts: Date.parse('2025-01-01T10:15:00Z'), user: 'Alice', message: 'first' },
        { ts: Date.parse('2025-01-01T12:15:00Z'), user: 'Bob', message: 'offline' },
        { ts: Date.parse('2025-01-02T10:15:00Z'), user: 'Alice', message: 'second' }
    ].map(JSON.stringify).join('\n'));
    const service = createCommunityInsights({
        dataDir: dir, sessionsDir, chatLogPath: path.join(dir, 'current.jsonl'),
        getConfig: () => ({ community_insights_enabled: true }), getChatData: () => ({ startedAt: '2025-03-01T00:00:00Z', viewerStats: {} }),
        getArchivedSessions: () => ({ sessions: [session] }), sessionFilename: filename, flushChatLog() {},
        filterRecords: records => records, isExcluded: () => false, isBotMessage: () => false, getBannedHashtags: () => new Set(),
        isLive: () => false, allowSummaryFallback: () => true, safeWriteFileSync
    });
    service.start();
    await waitReady(service);
    assert.equal(service.getPerson('Alice').streams, 2);
    assert.equal(service.getPerson('Alice').streak, 2);
    assert.equal(service.getPerson('Bob').streams, 0);
    service.stop();
});

test('A later broadcast without chat breaks an attendance streak even after rebuilding', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-community-empty-stream-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const current = { startedAt: '2025-01-01T10:00:00Z', viewerStats: { live: true, streamStartedAt: '2025-01-01T10:00:00Z' } };
    const service = createCommunityInsights({
        dataDir: dir, sessionsDir: path.join(dir, 'sessions'), chatLogPath: path.join(dir, 'current.jsonl'),
        getConfig: () => ({ community_insights_enabled: true }), getChatData: () => current,
        getArchivedSessions: () => ({ sessions: [] }), sessionFilename: at => `chat-${localDateTimeStr(at)}.json`,
        flushChatLog() {}, filterRecords: records => records, isExcluded: () => false, isBotMessage: () => false,
        getBannedHashtags: () => new Set(), isLive: () => current.viewerStats.live,
        allowSummaryFallback: () => true, safeWriteFileSync
    });
    service.start();
    await waitReady(service);
    service.record({ ts: Date.parse('2025-01-01T10:30:00Z'), user: 'Alice', message: 'hi' }, { logged: false });
    assert.equal(service.getPerson('Alice').streak, 1);
    current.startedAt = '2025-02-01T10:00:00Z';
    current.viewerStats.streamStartedAt = current.startedAt;
    service.recordStream();
    assert.equal(service.getPerson('Alice').streak, 0);
    service.invalidate();
    await waitReady(service);
    assert.equal(service.getPerson('Alice').streams, 1);
    assert.equal(service.getPerson('Alice').streak, 0);
    service.stop();
});

test('Chatbot settings persist independent Community defaults without changing existing announcement settings', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-community-bot-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    let bot = createChatbot({ dataDir: dir, getConfig: () => ({ chatbot_enabled: true }) });
    assert.equal(bot.getData().settings.community.welcomeEnabled, false);
    assert.equal(bot.getData().settings.pollAnnouncements.enabled, true);
    await bot.handleApi({ method: 'PUT' }, { writeHead() {}, end() {} }, '/api/chatbot', async () => JSON.stringify({
        settings: { community: { welcomeEnabled: true, welcomeDays: 730, spacingSeconds: 20, expiryMinutes: 9, subscriptionMonths: '6, 18', subscriptionRepeatMonths: 0 } }
    }));
    bot.stop();
    bot = createChatbot({ dataDir: dir, getConfig: () => ({ chatbot_enabled: true }) });
    assert.equal(bot.getData().settings.community.welcomeDays, 730);
    assert.equal(bot.getData().settings.community.spacingSeconds, 20);
    assert.equal(bot.getData().settings.community.expiryMinutes, 9);
    assert.deepEqual(bot.getData().settings.community.subscriptionMonths, [6, 18]);
    assert.equal(bot.getData().settings.community.subscriptionRepeatMonths, 0);
    assert.equal(bot.getData().settings.pollAnnouncements.enabled, true);
    await bot.handleApi({ method: 'PUT' }, { writeHead() {}, end() {} }, '/api/chatbot', async () => JSON.stringify({
        settings: { community: { messagesEnabled: true } }
    }));
    assert.equal(bot.getData().settings.community.welcomeEnabled, true);
    assert.equal(bot.getData().settings.community.welcomeDays, 730);
    assert.equal(bot.getData().settings.community.messagesEnabled, true);
    bot.stop();
});

test('Community message defaults, date boundaries and configurable milestones', () => {
    const cfg = normalizeCommunityChat();
    for (const key of ['welcomeEnabled', 'messagesEnabled', 'streamsEnabled', 'chatAnniversaryEnabled', 'followAnniversaryEnabled', 'subscriptionEnabled']) assert.equal(cfg[key], false);
    assert.equal(cfg.welcomeDays, 30);
    assert.deepEqual(cfg.subscriptionMonths, [3, 6, 12, 24]);
    assert.equal(anniversary('2020-02-29T12:00:00Z', Date.parse('2025-02-28T04:00:00Z'), 1, 7), 5);
    assert.equal(anniversary('2020-02-29T12:00:00Z', Date.parse('2025-03-07T04:00:00Z'), 1, 7), 5);
    assert.equal(anniversary('2020-02-29T12:00:00Z', Date.parse('2025-03-08T04:00:00Z'), 1, 7), null);
    assert.equal(anniversary('2020-03-10T12:00:00Z', Date.parse('2025-03-09T12:00:00Z'), 1, 7), null);
    assert.equal(anniversary('2020-02-29T12:00:00Z', Date.parse('2025-02-28T04:00:00Z'), 2, 7), null);
    assert.deepEqual(normalizeCommunityChat({ subscriptionMonths: '48, 3, 3, bad, 12', welcomeDays: 730 }).subscriptionMonths, [3, 12, 48]);
});

test('Community messages are individually enabled, spaced, deduplicated and discarded when offline or stale', async () => {
    let now = Date.parse('2025-03-01T12:00:00Z');
    let live = true;
    let tracking = true;
    let settings = normalizeCommunityChat({
        welcomeEnabled: true, welcomeDays: 365, messagesEnabled: true, messagesEvery: 100,
        streamsEnabled: true, streamsEvery: 10, spacingSeconds: 10, expiryMinutes: 5
    });
    const sent = [];
    const marked = new Set();
    const service = createCommunityChat({
        getSettings: () => settings, isReady: () => true, isLive: () => live, isTrackingReady: () => tracking,
        getFollow: () => null, hasAnnounced: key => marked.has(key),
        markAnnounced: key => { if (marked.has(key)) return false; marked.add(key); return true; },
        send: async text => { sent.push(text); }, now: () => now
    });
    const event = { kind: 'chat', at: now, user: 'Alice', previousLastSeen: '2024-01-01T00:00:00Z', totalMessages: 100, oldStreams: 9, streams: 10 };
    service.handle(event);
    await new Promise(setImmediate);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Welcome back/);
    service.handle(event);
    now += 10000;
    service.configChanged();
    await new Promise(setImmediate);
    assert.equal(sent.length, 2);
    assert.match(sent[1], /100 recorded messages/);
    live = false;
    service.configChanged();
    live = true;
    now += 10000;
    service.configChanged();
    await new Promise(setImmediate);
    assert.equal(sent.length, 2, 'offline transition drops queued stream milestone');
    tracking = false;
    service.handle({ ...event, at: now, totalMessages: 200 });
    tracking = true;
    settings = normalizeCommunityChat({ messagesEnabled: true, messagesEvery: 100, expiryMinutes: 1 });
    service.handle({ ...event, at: now - 61000, totalMessages: 200 });
    await new Promise(setImmediate);
    assert.equal(sent.length, 2, 'disabled tracking and expired events never send');
    service.stop();
});

test('Anniversary and observed subscription messages respect windows and custom thresholds', async () => {
    let now = Date.parse('2025-03-07T12:00:00Z');
    const cfg = normalizeCommunityChat({
        chatAnniversaryEnabled: true, followAnniversaryEnabled: true, subscriptionEnabled: true,
        subscriptionMonths: '4, 8', subscriptionRepeatMonths: 6, anniversaryGraceDays: 7, spacingSeconds: 1
    });
    const sent = [];
    const marked = new Set();
    const service = createCommunityChat({
        getSettings: () => cfg, isReady: () => true, isLive: () => true, isTrackingReady: () => true,
        getFollow: () => ({ followedAt: '2022-03-01T00:00:00Z' }),
        hasAnnounced: key => marked.has(key), markAnnounced: key => { marked.add(key); return true; },
        send: async text => sent.push(text), now: () => now
    });
    const chat = { kind: 'chat', at: now, user: 'Alice', type: 'twitch', firstSeen: '2020-03-01T00:00:00Z', oldStreams: 1, streams: 1 };
    service.handle(chat);
    await new Promise(setImmediate);
    now += 1000;
    service.configChanged();
    await new Promise(setImmediate);
    assert.equal(sent.length, 2);
    service.handle({ kind: 'subscription', at: now, user: 'Alice', previousMonths: 8, months: 14 });
    now += 1000;
    service.configChanged();
    await new Promise(setImmediate);
    assert.equal(sent.length, 3);
    assert.match(sent[2], /14 subscription months/);
    service.handle({ ...chat, at: now });
    service.handle({ kind: 'subscription', at: now, user: 'Alice', previousMonths: 8, months: 14 });
    now += 1000;
    service.configChanged();
    await new Promise(setImmediate);
    assert.equal(sent.length, 3, 'each anniversary and subscription threshold is announced at most once');
    now = Date.parse('2025-03-09T12:00:00Z');
    service.handle({ ...chat, at: now, user: 'Bob' });
    await new Promise(setImmediate);
    assert.equal(sent.length, 3, 'anniversary window does not replay older milestones');
    service.stop();
});

test('Community dossier renders observed data safely on mobile', async t => {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url() === 'https://emotes.example/wave.png') {
            void request.respond({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6WQAAAABJRU5ErkJggg==', 'base64') });
        } else void request.continue();
    });
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: path.join(__dirname, '..', 'public/js/chatter-dossier.js') });
    await page.evaluate(() => {
        window.savedNotes = [];
        window.fetch = async (url, options) => {
            if (options?.method === 'POST') {
                window.savedNotes.push({ url, body: JSON.parse(options.body) });
                return { ok: true };
            }
            return { ok: true, json: async () => ({
            username: String(url).endsWith('/Bob') ? 'Bob' : 'Alice', type: 'twitch', firstSeen: '2024-01-01', lastSeen: '2025-01-01',
            sessionsAttended: 4, totalMessages: 100, tags: ['<img onerror=alert(1)>'], favoriteGames: [],
            community: {
                status: { phase: 'ready' },
                follow: { followedAt: '2022-01-01T00:00:00.000Z', syncedAt: '2025-01-01T00:00:00.000Z' },
                insights: { streams: 3, streak: 2, hashtagsStarted: 1, hashtags: [{ name: '#<img onerror=alert(1)>', count: 2 }],
                    emotes: [{ name: 'Wave', count: 3, imageUrl: 'https://emotes.example/wave.png' },
                        { name: '<img onerror=alert(1)>', count: 1, imageUrl: 'javascript:alert(1)' }],
                    lastReturn: { at: Date.parse('2025-01-01'), absenceDays: 40 } }
            }
            }) };
        };
    });
    await page.evaluate(() => window.openChatterDossier('Alice'));
    assert.match(await page.$eval('#dos-follow-value', el => el.textContent), /Following since/i);
    assert.equal(await page.$eval('#dos-tab-overview', el => el.getAttribute('aria-selected')), 'true');
    await page.click('#dos-tab-activity');
    assert.match(await page.$eval('#dos-community-grid', el => el.textContent), /#<img onerror=alert\(1\)>/);
    assert.equal(await page.$$eval('#dos-community-grid img', els => els.length), 0);
    assert.equal(await page.$$eval('#dos-emotes img', els => els.length), 1);
    assert.equal(await page.$eval('#dos-emotes img', el => el.referrerPolicy), 'no-referrer');
    assert.match(await page.$eval('#dos-emotes', el => el.textContent), /Wave.*3/);
    await page.focus('#dos-tab-activity');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('#dos-tab-notes', el => el.getAttribute('aria-selected')), 'true');
    assert.equal(await page.$$eval('#dos-tags-wrap img', els => els.length), 0);
    await page.evaluate(async () => {
        const notes = document.querySelector('#dos-notes');
        notes.value = 'Private Alice note';
        notes.dispatchEvent(new Event('input', { bubbles: true }));
        await window.openChatterDossier('Bob');
    });
    const saved = await page.evaluate(() => window.savedNotes);
    assert.equal(saved[0].url, '/api/chatters/Alice/notes');
    assert.equal(saved[0].body.notes, 'Private Alice note');
    assert.equal(await page.$eval('#dos-username', el => el.textContent), 'Bob');
    assert.equal(await page.$eval('#dos-streams + .dossier-stat-lbl', el => el.textContent), 'Chat Days');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
});

test('real config and Chat Bot pages save opt-in Community controls', async t => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-community-server-'));
        const port = await new Promise(resolve => {
            const probe = net.createServer();
            probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => resolve(value)); });
        });
        const configPath = path.join(dir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({ broadcaster_name: 'FictionalHost', music: { enabled: false } }));
        process.env.STREAMPULSE_EMBEDDED = 'true';
        process.env.STREAMPULSE_CONFIG_PATH = configPath;
        process.env.STREAMPULSE_DATA_DIR = path.join(dir, 'data');
        process.env.PORT = String(port);
        const app = require('../server.js');
        t.after(async () => {
            await app.stopServer();
            delete require.cache[require.resolve('../server.js')];
            delete process.env.STREAMPULSE_EMBEDDED;
            delete process.env.STREAMPULSE_CONFIG_PATH;
            delete process.env.STREAMPULSE_DATA_DIR;
            delete process.env.PORT;
            fs.rmSync(dir, { recursive: true, force: true });
        });
        await app.startServer();
        const base = `http://127.0.0.1:${port}`;
        assert.equal((await (await fetch(`${base}/api/config`)).json()).community_insights_enabled, false);
        assert.equal((await (await fetch(`${base}/api/community/insights/status`)).json()).phase, 'off');
        assert.equal(fs.existsSync(path.join(dir, 'data/community-insights.json')), false);
        const { default: puppeteer } = await import('puppeteer');
        const browser = await puppeteer.launch({ headless: true });
        t.after(() => browser.close());
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.setViewport({ width: 390, height: 844 });
        await page.goto(`${base}/config-editor.html`, { waitUntil: 'networkidle0' });
        assert.equal(await page.$eval('#cfg-community-insights', el => el.checked), false);
        await page.evaluate(() => {
            document.querySelector('#cfg-community-insights').checked = true;
            return window.saveConfig();
        });
        for (let i = 0; i < 100; i++) {
            if ((await (await fetch(`${base}/api/community/insights/status`)).json()).phase === 'ready') break;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal((await (await fetch(`${base}/api/community/insights/status`)).json()).phase, 'ready');
        await page.goto(`${base}/chatbot.html#settings`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#s-community-welcome');
        assert.equal(await page.$eval('#s-community-welcome', el => el.checked), false);
        await page.evaluate(() => { document.querySelector('details[data-section="community"]').open = true; });
        await page.click('#s-community-welcome');
        assert.equal(await page.$eval('[data-community-fields="welcome"]', el => el.hidden), false);
        await page.$eval('#s-community-welcome-days', el => { el.value = '400'; });
        await page.$eval('#s-community-spacing', el => { el.value = '12'; });
        await page.click('#save-settings');
        await page.waitForFunction(async () => {
            const response = await fetch('/api/chatbot');
            const data = await response.json();
            return data.settings.community.welcomeDays === 400;
        });
        const saved = await (await fetch(`${base}/api/chatbot`)).json();
        assert.equal(saved.settings.community.welcomeEnabled, true);
        assert.equal(saved.settings.community.spacingSeconds, 12);
        assert.equal(saved.settings.community.messagesEnabled, false);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
        assert.deepEqual(errors, []);
});
