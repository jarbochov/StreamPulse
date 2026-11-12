const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');
const { createAnalyticsInsights } = require('../server/services/analytics-insights');
const { createSessionService, localDateTimeStr, localDateString } = require('../server/services/session');
const { createSessionRoutes } = require('../server/routes/session');
const { createStaticRouter } = require('../server/static-router');

test('heatmap respects time ranges, moderation, resumed sessions, cache changes and live viewer samples', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-insights-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const date = new Date(2026, 0, 5, 10, 0);
    const previous = new Date(2026, 0, 4, 23, 30);
    const day = localDateString(date);
    const startedAt = previous.toISOString();
    const suffix = localDateTimeStr(startedAt);
    const current = {
        startedAt, viewerStats: { samples: [
            { ts: date.toISOString(), count: 10, live: true },
            { ts: new Date(date.getTime() + 60000).toISOString(), count: 20, live: true },
            { ts: date.toISOString(), count: 100, live: false }
        ] }
    };
    const previousSession = { startedAt: new Date(2026, 0, 3).toISOString(),
        viewerStats: { samples: [{ ts: date.toISOString(), count: 30, live: true }] } };
    const resumedLog = path.join(dir, `chatlog-${suffix}.jsonl`);
    fs.writeFileSync(path.join(dir, `chat-${suffix}.json`), JSON.stringify(current));
    fs.writeFileSync(resumedLog, JSON.stringify({ ts: date.getTime(), user: 'Fixture', message: 'duplicate' }));
    const archive = path.join(dir, 'chatlog-other.jsonl');
    const records = [
        { ts: date.getTime(), user: 'Fixture', message: 'hello' },
        { ts: date.getTime(), user: 'Removed', message: 'deleted' },
        { ts: date.getTime(), user: 'Fixture', event: 'follow', message: 'followed' },
        { ts: previous.getTime(), user: 'Fixture', message: 'previous day' }
    ];
    fs.writeFileSync(archive, records.map(JSON.stringify).join('\n'));
    let removed = false;
    let reads = 0;
    const service = createAnalyticsInsights({
        sessionsDir: dir, getChatData: () => current,
        getArchivedSessions: () => ({ sessions: [current, previousSession] }),
        getCurrentChatLogEntries: () => [
            { ts: date.getTime(), user: 'Fixture', message: 'current' },
            { ts: date.getTime(), user: 'Legacy', message: 'deleted' }
        ],
        readChatLogFile: file => { reads++; return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse); },
        filterRecords: entries => entries.filter(item => (!removed || item.user !== 'Removed')
            && !(item.user === 'Legacy' && item.session === `chat-${suffix}.json`))
    });
    const range = { from: day, to: day };
    let result = service.heatmap(range);
    assert.equal(result.total, 3, 'resumed archive is not double counted');
    assert.equal(result.counts[date.getDay()][date.getHours()], 3);
    assert.equal(result.viewers[date.getDay()][date.getHours()], 20);
    assert.equal(result.viewerSamples[date.getDay()][date.getHours()], 3);
    assert.equal(result.viewers[date.getDay()][date.getHours() + 1], null);
    removed = true;
    result = service.heatmap(range);
    assert.equal(result.total, 2, 'moderation changes apply immediately to cached logs');
    assert.equal(reads, 1, 'unchanged archive is not reparsed');
    fs.appendFileSync(archive, '\n' + JSON.stringify({ ts: date.getTime(), user: 'Fixture', message: 'new' }));
    assert.equal(service.heatmap(range).total, 3);
    assert.equal(reads, 2, 'changed archive is reparsed');
    const sessionOnly = service.heatmap({ session: true });
    assert.equal(sessionOnly.total, 1);
    assert.equal(sessionOnly.viewers[date.getDay()][date.getHours()], 15);
    assert.equal(service.heatmap().total, 4, 'all-time includes records across midnight');
});

test('analytics activity and milestone estimates render, respond to range changes and persist on mobile', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-analytics-browser-'));
    fs.mkdirSync(path.join(dir, 'sessions'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const now = new Date();
    const current = {
        startedAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
        viewerStats: { live: true, streamStartedAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
            samples: [{ ts: now.toISOString(), count: 9, live: true }] }
    };
    const log = [{ ts: now.getTime(), user: 'Fixture', message: 'hello' }];
    const sessionService = createSessionService({ dataDir: dir, getChatData: () => current, isSessionActive: () => true });
    const routes = createSessionRoutes({
        sessionsDir: path.join(dir, 'sessions'), sessionService, getChatData: () => current,
        ssnService: { readChatLogFile: () => [], getCurrentChatLogEntries: () => log }
    });
    const staticRouter = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), dataDir: dir });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (await routes(req, res, url, url.pathname)) return;
        if (url.pathname === '/api/subscribers/current') { res.end('{"subscribers":[]}'); return; }
        if (url.pathname === '/api/followers/current') { res.end('{"followers":[]}'); return; }
        if (url.pathname.startsWith('/api/')) { res.end('{}'); return; }
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
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}/analytics.html`, { waitUntil: 'networkidle0' });
    await page.click('[data-activity-view="patterns"]');
    await page.waitForFunction(() => document.querySelector('#heatmap-summary').textContent.includes('1 messages'));
    assert.equal(await page.$eval('#heatmap td.active', el => el.textContent), '1');
    await page.select('#heatmap-metric', 'viewers');
    assert.equal(await page.$eval('#heatmap td.active', el => el.textContent), '9');
    await page.evaluate(() => {
        document.querySelector('#from').value = '2000-01-01';
        document.querySelector('#to').value = '2000-01-01';
    });
    await page.click('#apply');
    await page.waitForFunction(() => document.querySelector('#heatmap').textContent.includes('No recorded live viewer samples'));
    await page.click('[data-days="7"]');
    await page.waitForFunction(() => document.querySelector('#heatmap-summary').textContent.includes('1 live samples'));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('#heatmap-summary').textContent.includes('1 live samples'));
    assert.equal(await page.$eval('#heatmap-metric', el => el.value), 'viewers');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.defaultView.innerWidth), true, 'heatmap scroll is confined to its container');
    await page.click('[data-tab="milestones"]');
    await page.waitForFunction(() => document.querySelector('.milestone-pace')?.textContent.includes('Estimated in'));
    assert.deepEqual(errors, []);
});
