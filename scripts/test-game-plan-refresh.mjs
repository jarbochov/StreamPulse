import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

// Real overlay/DOM, fictional data, intercepted resources, and deterministic time/socket/fetch.
// No application server or external network is used.
const sources = new Map([
    ['/game-plan.html', await readFile(new URL('../public/overlays/game-plan.html', import.meta.url), 'utf8')],
    ...await Promise.all(['overlay-visibility.js', 'url-params.js', 'overlay-theme.js'].map(async name =>
        [`/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')]
    ))
]);
const plan = {
    items: [
        { id: 'a', name: 'Fictional Orbit', status: 'scheduled', period: 'October', streamDate: '2026-10-18', cover: '/fiction.svg' },
        { id: 'b', name: 'Fictional Meadow', status: 'tonight', playingNow: true, cover: '/fiction.svg' },
        { id: 'c', name: 'Fictional Harbor', status: 'scheduled', period: 'November', streamDate: '2026-10-19', cover: '/fiction.svg' },
        { id: 'd', name: 'Fictional Cloud', status: 'backlog', extraLists: ['collection'], cover: '/fiction.svg' }
    ],
    lists: [{ id: 'collection', name: 'Fictional Collection' }],
    periods: ['October', 'November']
};
const profile = resolve(`scripts/.game-plan-browser-${process.pid}`);
let browser;
const errors = [];
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox']
    });

    async function open(query = '', options = {}) {
        const page = await browser.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = new URL(request.url());
            const source = url.origin === 'http://game-plan.test' && sources.get(url.pathname);
            request.respond({
                status: 200,
                contentType: source ? (url.pathname.endsWith('.html') ? 'text/html' : 'text/javascript') : 'image/svg+xml',
                body: source || '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"/>'
            });
        });
        await page.evaluateOnNewDocument((seed, options) => {
            const clone = value => JSON.parse(JSON.stringify(value));
            const nativeTimeout = window.setTimeout.bind(window);
            const RealDate = Date;
            let now = new RealDate('2026-10-18T23:59:55').getTime();
            const state = window.fixture = {
                plan: clone(seed), hidden: !!options.hidden, renders: 0, requests: 0,
                active: 0, maxActive: 0, aborts: 0, hold: false, pending: [],
                sockets: [], socketAttempts: 0, failSocket: !!options.failSocket,
                httpStatus: 200, timers: new Map(), nextTimer: 0
            };
            if (options.dateOnly) state.plan.items.forEach(item => { delete item.period; });
            window.Date = class extends RealDate {
                constructor(...args) { super(...(args.length ? args : [now])); }
                static now() { return now; }
            };
            Object.defineProperty(document, 'hidden', { get: () => state.hidden });
            const html = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
            Object.defineProperty(window.Element.prototype, 'innerHTML', {
                ...html,
                set(value) {
                    if (this.id === 'container') state.renders++;
                    html.set.call(this, value);
                }
            });
            const timer = (fn, ms, interval) => {
                const id = ++state.nextTimer;
                state.timers.set(id, { fn, due: now + ms, interval });
                return id;
            };
            window.setTimeout = (fn, ms = 0) => timer(fn, ms, 0);
            window.setInterval = (fn, ms) => timer(fn, ms, ms);
            window.clearTimeout = window.clearInterval = id => state.timers.delete(id);
            state.flush = () => new Promise(done => nativeTimeout(done, 0));
            state.advance = async ms => {
                const target = now + ms;
                for (;;) {
                    const next = [...state.timers].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
                    if (!next) break;
                    const [id, t] = next;
                    now = t.due;
                    if (t.interval) t.due += t.interval;
                    else state.timers.delete(id);
                    t.fn();
                    await state.flush();
                }
                now = target;
                await state.flush();
            };
            state.visible = async hidden => {
                state.hidden = hidden;
                document.dispatchEvent(new window.Event('visibilitychange'));
                await state.flush();
            };
            window.fetch = (url, init = {}) => {
                if (url === '/api/config') {
                    return new Promise(resolve => {
                        state.releaseConfig = () => resolve(new window.Response(JSON.stringify({
                            theme: { accent_color: '#aabbcc', font_family: 'Arial' }
                        })));
                        if (!options.holdConfig) state.releaseConfig();
                    });
                }
                if (url !== '/api/game-plan') throw new Error(`Unexpected fixture fetch: ${url}`);
                state.requests++;
                state.active++;
                state.maxActive = Math.max(state.maxActive, state.active);
                const snapshot = clone(state.plan);
                const status = state.httpStatus;
                return new Promise((resolve, reject) => {
                    let done = false;
                    const finish = aborted => {
                        if (done) return;
                        done = true;
                        state.active--;
                        state.pending = state.pending.filter(fn => fn !== release);
                        if (aborted) {
                            state.aborts++;
                            reject(new window.DOMException('Fictional timeout', 'AbortError'));
                        } else resolve(new window.Response(JSON.stringify(snapshot), { status }));
                    };
                    const release = () => finish(false);
                    state.pending.push(release);
                    init.signal?.addEventListener('abort', () => finish(true), { once: true });
                    if (!state.hold) Promise.resolve().then(release);
                });
            };
            window.WebSocket = class {
                static OPEN = 1;
                readyState = 0;
                constructor() {
                    state.socketAttempts++;
                    // Leave the pre-existing visibility helper socket functional.
                    if (state.failSocket && state.socketAttempts > 1) throw new Error('Fictional missing socket');
                    state.sockets.push(this);
                    Promise.resolve().then(() => {
                        if (this.readyState !== 0) return;
                        this.readyState = 1;
                        this.onopen?.();
                    });
                }
                close() {
                    if (this.readyState === 3) return;
                    this.readyState = 3;
                    this.onclose?.();
                }
                send() {}
            };
            state.broadcast = (value = state.plan, legacy = false) => {
                state.sockets.at(-1).onmessage?.({
                    data: JSON.stringify({ type: 'game-plan-update', [legacy ? 'plan' : 'data']: value })
                });
            };
            state.remember = () => {
                state.card = document.querySelector('#container > *');
                state.cover = document.querySelector('.cover-img');
            };
        }, plan, options);
        await page.goto(`http://game-plan.test/game-plan.html${query}`, { waitUntil: 'load' });
        await page.evaluate(() => window.fixture.flush());
        return page;
    }
    const stats = page => page.evaluate(() => ({
        requests: window.fixture.requests, renders: window.fixture.renders,
        active: window.fixture.active, maxActive: window.fixture.maxActive,
        sockets: window.fixture.sockets.filter(s => s.readyState < 2).length
    }));
    const advance = (page, ms) => page.evaluate(ms => window.fixture.advance(ms), ms);
    const visible = (page, hidden) => page.evaluate(hidden => window.fixture.visible(hidden), hidden);
    const retained = page => page.evaluate(() =>
        window.fixture.card === document.querySelector('#container > *') &&
        window.fixture.cover === document.querySelector('.cover-img')
    );
    const titles = page => page.$$eval('.schedule-title, .checklist-title, .ticker-title', nodes => nodes.map(n => n.textContent.trim()));

    const page = await open('', { holdConfig: true });
    assert.deepEqual(await stats(page), { requests: 1, renders: 1, active: 0, maxActive: 1, sockets: 2 });
    await page.evaluate(() => window.fixture.remember());
    await advance(page, 60000);
    assert.equal((await stats(page)).requests, 2, 'healthy/silent socket: only one safety request per minute');
    assert.equal((await stats(page)).renders, 1, 'unchanged safety fetch must not render');
    assert(await retained(page), 'unchanged heartbeat must retain card and cover identity');
    await page.evaluate(() => {
        for (let i = 0; i < 20; i++) window.fixture.broadcast({ ...window.fixture.plan, updatedAt: i });
        window.fixture.releaseConfig();
        return window.fixture.flush();
    });
    assert.equal((await stats(page)).renders, 1, 'unchanged broadcasts and metadata-only updates must not render');
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--gp-accent')), '#aabbcc');
    assert(await retained(page), 'late theme application must preserve nodes');
    await page.setViewport({ width: 420, height: 220 });
    const smallWidth = await page.$eval('#container', node => node.getBoundingClientRect().width);
    await page.setViewport({ width: 1280, height: 720 });
    assert.equal(smallWidth, 420);
    assert.equal(await page.$eval('#container', node => node.getBoundingClientRect().width), 1280);
    assert(await retained(page), 'responsive CSS resizing must not require a render');
    await page.evaluate(() => {
        window.fixture.plan.items[0].name = 'Fictional Orbit Live';
        window.fixture.broadcast();
    });
    assert.equal((await titles(page))[0], 'Fictional Orbit Live', 'server data envelope must update synchronously');
    assert.equal((await stats(page)).renders, 2);
    assert.equal((await stats(page)).requests, 2, 'push update must not require HTTP');
    await page.evaluate(() => { window.fixture.plan.items[0].note = 'Fictional legacy note'; window.fixture.broadcast(undefined, true); });
    assert.equal((await stats(page)).renders, 3, 'legacy plan envelope is still accepted');
    await page.evaluate(() => { window.fixture.plan.items[0].name = 'Fictional Missed Broadcast'; });
    await advance(page, 60000);
    assert.equal((await titles(page))[0], 'Fictional Missed Broadcast', 'stale open socket must recover via safety refresh');
    assert.equal((await stats(page)).renders, 4);

    const beforeHide = await stats(page);
    await page.evaluate(() => window.fixture.remember());
    await visible(page, true);
    await advance(page, 120000);
    assert.deepEqual(await stats(page), beforeHide, 'hidden document must issue no polls or renders');
    await page.evaluate(() => { window.fixture.plan.items[0].name = 'Fictional Hidden Update'; window.fixture.broadcast(); });
    assert.equal((await stats(page)).renders, beforeHide.renders, 'hidden pushes are cached without DOM replacement');
    assert(await retained(page));
    await visible(page, false);
    assert.equal((await stats(page)).requests, beforeHide.requests + 1, 'return must refresh exactly once');
    assert.equal((await stats(page)).renders, beforeHide.renders + 1);
    assert.equal((await titles(page))[0], 'Fictional Hidden Update');

    // CSS visibility is a broadcast control, not document/OBS lifecycle suspension.
    await page.evaluate(() => window.fixture.sockets[0].onmessage({
        data: JSON.stringify({ type: 'overlay-visibility', data: { key: 'game-plan', visible: false } })
    }));
    const beforeCssHide = await stats(page);
    await advance(page, 60000);
    assert.equal((await stats(page)).requests, beforeCssHide.requests + 1, 'CSS-hidden overlay must retain recovery');
    assert.equal(await page.evaluate(() => document.hidden), false);

    await page.evaluate(() => { window.fixture.hold = true; });
    await visible(page, true);
    await visible(page, false);
    await page.evaluate(() => {
        window.fixture.plan.items[0].name = 'Fictional Newer Push';
        window.fixture.broadcast();
        window.fixture.pending[0]();
        return window.fixture.flush();
    });
    assert.equal((await titles(page))[0], 'Fictional Newer Push', 'older in-flight HTTP must not roll back push data');
    await visible(page, true);
    await visible(page, false);
    const pending = await stats(page);
    await visible(page, true);
    await visible(page, false);
    await advance(page, 5000);
    assert.equal((await stats(page)).requests, pending.requests, 'visibility return must coalesce with an existing request');
    assert.equal((await stats(page)).maxActive, 1);
    await advance(page, 15000);
    assert((await page.evaluate(() => window.fixture.aborts)) >= 1, 'stalled requests must time out');
    assert.equal((await stats(page)).maxActive, 1, 'timeouts and interval retries must never overlap');
    await page.evaluate(() => {
        window.fixture.hold = false;
        for (const release of [...window.fixture.pending]) release();
        return window.fixture.flush();
    });

    await page.evaluate(() => { window.fixture.hold = true; });
    await visible(page, true);
    await visible(page, false);
    await page.evaluate(() => {
        window.dispatchEvent(new window.Event('pagehide'));
        return window.fixture.flush();
    });
    const disposed = await stats(page);
    assert.equal(disposed.active, 0, 'teardown must abort the in-flight request');
    assert.equal(disposed.sockets, 1, 'teardown must close its socket (existing visibility helper is independent)');
    assert.equal(await page.evaluate(() => window.fixture.timers.size), 0, 'teardown must remove polling, request, reconnect timers');
    await advance(page, 120000);
    assert.deepEqual(await stats(page), disposed, 'teardown must not leave fetches or reconnects behind');
    await page.evaluate(() => {
        window.fixture.hold = false;
        window.dispatchEvent(new window.Event('pageshow'));
        window.dispatchEvent(new window.Event('pageshow'));
        return window.fixture.flush();
    });
    assert.equal((await stats(page)).requests, disposed.requests + 1, 'BFCache return must refresh once');
    assert.equal((await stats(page)).sockets, 2, 'BFCache return must not duplicate its socket');
    await page.evaluate(async () => {
        window.fixture.hold = true;
        await window.fixture.visible(true);
        await window.fixture.visible(false);
        window.dispatchEvent(new window.Event('pagehide'));
        window.fixture.hold = false;
        window.dispatchEvent(new window.Event('pageshow'));
        await window.fixture.flush();
    });
    assert.equal((await stats(page)).requests, disposed.requests + 3, 'immediate BFCache restore must refresh after abort settles');
    assert.equal((await stats(page)).active, 0);
    assert.equal((await stats(page)).maxActive, 1);
    assert.equal((await stats(page)).sockets, 2);
    await page.close();

    const fallback = await open('', { failSocket: true });
    await fallback.evaluate(() => window.fixture.remember());
    await advance(fallback, 60000);
    assert.equal((await stats(fallback)).requests, 7, 'missing socket must retain ten-second fallback');
    assert.equal((await stats(fallback)).renders, 1);
    assert(await retained(fallback), 'unchanged fallback fetches must retain DOM identity');
    await fallback.evaluate(() => { window.fixture.plan.items[0].name = 'Fictional Fallback Update'; });
    await advance(fallback, 10000);
    assert.equal((await titles(fallback))[0], 'Fictional Fallback Update', 'fallback must render changed data');
    await visible(fallback, true);
    const fallbackHidden = await stats(fallback);
    await advance(fallback, 60000);
    assert.equal((await stats(fallback)).requests, fallbackHidden.requests);
    await visible(fallback, false);
    assert.equal((await stats(fallback)).requests, fallbackHidden.requests + 1);
    await fallback.close();

    const reconnect = await open();
    await reconnect.evaluate(() => {
        window.fixture.plan.items[0].name = 'Fictional Disconnect Recovery';
        window.fixture.sockets.at(-1).close();
        return window.fixture.flush();
    });
    assert.equal((await titles(reconnect))[0], 'Fictional Disconnect Recovery', 'close must trigger immediate recovery');
    await reconnect.evaluate(() => { window.fixture.plan.items[0].name = 'Fictional Reconnect Recovery'; });
    await advance(reconnect, 5000);
    assert.equal((await titles(reconnect))[0], 'Fictional Reconnect Recovery', 'reopen must refresh a missed update');
    assert.equal((await stats(reconnect)).sockets, 2, 'reconnect must replace, not duplicate, its socket');
    await reconnect.evaluate(() => {
        window.fixture.httpStatus = 503;
        return window.fixture.visible(false);
    });
    const failed = (await stats(reconnect)).requests;
    await reconnect.evaluate(() => { window.fixture.httpStatus = 200; window.fixture.plan.items[0].name = 'Fictional HTTP Recovery'; });
    await advance(reconnect, 10000);
    assert.equal((await stats(reconnect)).requests, failed + 1, 'failed safety fetch must retry at fallback cadence');
    assert.equal((await titles(reconnect))[0], 'Fictional HTTP Recovery');
    await reconnect.evaluate(() => {
        window.fixture.sockets.at(-1).close();
        window.dispatchEvent(new window.Event('pagehide'));
        return window.fixture.flush();
    });
    const closed = await stats(reconnect);
    await advance(reconnect, 10000);
    assert.deepEqual(await stats(reconnect), closed, 'teardown must cancel an already scheduled reconnect');
    await reconnect.close();

    const initiallyHidden = await open('', { hidden: true });
    assert.equal((await stats(initiallyHidden)).requests, 0, 'hidden startup must not fetch plan');
    await advance(initiallyHidden, 60000);
    assert.equal((await stats(initiallyHidden)).requests, 0);
    await visible(initiallyHidden, false);
    assert.equal((await stats(initiallyHidden)).requests, 1);
    assert.equal((await stats(initiallyHidden)).renders, 1);
    await initiallyHidden.close();

    // Cross a local Sunday/Monday midnight without fetching: date filters must not freeze.
    for (const [period, before, after] of [
        ['@today', ['Fictional Orbit', 'Fictional Meadow'], ['Fictional Meadow', 'Fictional Harbor']],
        ['@tomorrow', ['Fictional Harbor'], []],
        ['@this-week', ['Fictional Orbit'], ['Fictional Harbor']],
        ['@upcoming', ['Fictional Orbit', 'Fictional Harbor'], ['Fictional Harbor']]
    ]) {
        const dated = await open(`?period=${period}`, { dateOnly: period === '@upcoming' });
        assert.deepEqual(await titles(dated), before, period);
        await advance(dated, 10000);
        assert.deepEqual(await titles(dated), after, `${period} must recompute on local day change`);
        assert.equal((await stats(dated)).requests, 1, 'calendar invalidation must not need another request');
        await dated.close();
    }
    for (const [query, expected] of [
        ['?list=scheduled-only&sort=name', ['Fictional Harbor', 'Fictional Orbit']],
        ['?list=collection&view=checklist', ['Fictional Cloud']],
        ['?period=October,!November&view=checklist', ['Fictional Orbit']],
        ['?view=ticker', ['Fictional Meadow', 'Fictional Orbit']]
    ]) {
        const filtered = await open(query);
        assert.deepEqual(await titles(filtered), expected);
        await filtered.evaluate(() => window.fixture.remember());
        await advance(filtered, 60000);
        assert(await retained(filtered), `unchanged ${query} must retain DOM`);
        await filtered.close();
    }
    const periods = await open('?sort=date');
    await periods.evaluate(() => {
        window.fixture.plan.items.forEach(item => { delete item.streamDate; });
        window.fixture.broadcast();
    });
    assert.deepEqual(await titles(periods), ['Fictional Orbit', 'Fictional Harbor', 'Fictional Meadow']);
    await periods.evaluate(() => {
        window.fixture.plan.periods.reverse();
        window.fixture.broadcast();
    });
    assert.deepEqual(await titles(periods), ['Fictional Harbor', 'Fictional Orbit', 'Fictional Meadow'], 'period ordering belongs in signature');
    await periods.close();
    const collections = await open('?list=collection');
    await collections.evaluate(() => {
        window.fixture.plan.items[3].status = 'collection';
        window.fixture.plan.lists[0].name = 'Fictional Renamed Collection';
        window.fixture.broadcast();
    });
    assert((await collections.$eval('#container', node => node.textContent)).includes('Fictional Renamed Collection'), 'list names belong in signature');
    await collections.close();

    assert.deepEqual(errors, [], 'all browser executions must be free of uncaught errors');
    console.log('Game Plan refresh browser tests passed.');
    console.log('Measured virtual 60s: healthy socket = 1 safety GET, 0 unchanged renders; missing socket = 6 GETs/min, 0 unchanged renders.');
    console.log('20 identical/metadata-only broadcasts = 0 renders; hidden 120s = 0 GETs/0 renders; maximum concurrent plan requests = 1.');
} finally {
    await browser?.close();
    await rm(profile, { recursive: true, force: true });
}
