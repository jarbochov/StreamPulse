const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const { test } = require('node:test');
const { createTwitchService } = require('../server/services/twitch');

test('Twitch deadlines bound stalled requests and response bodies without discarding refresh credentials', async () => {
    let behavior = 'ok';
    const server = http.createServer((req, res) => {
        req.resume();
        if (behavior === 'no-headers') return;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (behavior === 'body-stall') { res.write('{'); return; }
        if (behavior === 'truncated') {
            res.write('{');
            setImmediate(() => res.destroy());
            return;
        }
        res.end(JSON.stringify(req.url.includes('oauth2/token')
            ? { access_token: 'fictional-access', refresh_token: 'fictional-refresh', expires_in: 3600 }
            : { data: [{ id: 'fictional-broadcaster', login: 'fictional-channel' }] }));
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const originalRequest = https.request;
    const originalFetch = global.fetch;
    const originalTimeout = AbortSignal.timeout;
    const deadlines = [];
    const warnings = [];
    https.request = (url, options, callback) => {
        assert.ok(options.signal instanceof AbortSignal, 'every HTTPS request must carry an absolute deadline');
        const target = new URL(url);
        return http.request(origin + target.pathname + target.search, options, callback);
    };
    global.fetch = (url, options) => {
        assert.ok(options.signal instanceof AbortSignal, 'fetch requests must also carry a deadline');
        return originalFetch(origin + new URL(url).pathname, options);
    };
    AbortSignal.timeout = ms => {
        deadlines.push(ms);
        return originalTimeout(150);
    };
    const twitch = createTwitchService({
        dataDir: '/fictional-unused',
        getBroadcasterId: () => 'fictional-broadcaster',
        getClientId: () => 'fictional-client',
        safeWriteFileSync: () => {},
        log: () => {}, warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args)
    });
    try {
        const requests = [
            () => twitch.twitchTokenRequest({ grant_type: 'fictional' }),
            () => twitch.twitchApiRequest('/users'),
            () => twitch.twitchHelixRequest('/channels', { method: 'PATCH', body: { game_id: 'fictional-game' } }),
            () => twitch.twitchCreateClip(),
            () => twitch.twitchCreateClipFromVod('fixture-editor', 'fixture-vod', 60),
            () => twitch.startDeviceAuth()
        ];
        for (const mode of ['no-headers', 'body-stall', 'truncated']) {
            behavior = mode;
            for (const request of requests) await assert.rejects(request, undefined, `${mode} must reject`);
        }
        twitch.saveToken({ access_token: 'fictional-access', refresh_token: 'fictional-refresh', expires_in: 0 });
        behavior = 'body-stall';
        const first = twitch.refreshTwitchToken();
        assert.equal(twitch.refreshTwitchToken(), first, 'concurrent refresh still shares one request');
        assert.equal(await first, false);
        assert.equal(twitch.getRefreshToken(), 'fictional-refresh', 'transient timeouts must not clear reusable auth');
        assert.equal(twitch.getAccessToken(), 'fictional-access');
        assert.equal(await twitch.syncBroadcasterFromToken(), null, 'lookup timeout must use the existing logged failure path');
        assert.equal(warnings.length, 2, 'refresh and lookup failures are surfaced');
        behavior = 'ok';
        assert.equal(await twitch.refreshTwitchToken(), true, 'a timed-out refresh must release its in-flight guard');
        for (const request of requests.slice(0, -1)) await request();
        assert.equal((await twitch.syncBroadcasterFromToken()).login, 'fictional-channel');
        assert.ok(deadlines.length >= 25);
        assert.ok(deadlines.every(ms => ms === 15000), 'all Twitch transports use a 15-second deadline');
    } finally {
        https.request = originalRequest;
        global.fetch = originalFetch;
        AbortSignal.timeout = originalTimeout;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('REST channel polling preserves current offline metadata but records only live history', async t => {
    let title = 'Fixture pre-stream title';
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ title, game_name: 'Fixture Game' }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    t.mock.method(https, 'request', (url, options, callback) => http.request(origin + new URL(url).pathname, options, callback));
    const chat = { streamInfo: [], viewerStats: { live: false } };
    const twitch = createTwitchService({
        getChatData: () => chat, getClientId: () => 'fixture-client', getBroadcasterId: () => 'fixture-channel',
        safeWriteFileSync() {}, log() {}, warn() {}
    });
    twitch.saveToken({ access_token: 'fictional-access', refresh_token: 'fictional-refresh', expires_in: 3600 });
    await twitch.fetchStreamInfo(true);
    assert.equal(chat.streamInfo.length, 0);
    assert.equal(twitch.getStreamInfoState().title, title);
    chat.viewerStats = { live: true, streamStartedAt: new Date(Date.now() - 60000).toISOString() };
    await twitch.fetchStreamInfo(true);
    assert.equal(chat.streamInfo[0].changedAt, chat.viewerStats.streamStartedAt);
    title = 'Fixture live title';
    await twitch.fetchStreamInfo(true);
    assert.equal(chat.streamInfo.length, 2);
    assert.equal(chat.streamInfo.at(-1).title, title);
    chat.viewerStats.live = false;
    title = 'Fixture next show';
    await twitch.fetchStreamInfo(true);
    assert.equal(chat.streamInfo.length, 2);
    assert.equal(twitch.getStreamInfoState().title, title);
});
