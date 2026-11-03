'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const puppeteer = require('puppeteer');
const { normalizeConfig } = require('../server/services/alerts');
const { createStaticRouter } = require('../server/static-router');

const rootDir = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const alertsMapping = serverSource.match(/\n        alerts: (\{[\s\S]*?\n        \}),\n        modules:/)?.[1];
assert.ok(alertsMapping, 'locate the real /api/status alerts mapping without starting the backend');

function mapAlerts(config, queue = {}, present = true) {
    return JSON.parse(JSON.stringify(vm.runInNewContext(`(${alertsMapping})`, {
        alertEngine: present ? { getConfig: () => normalizeConfig(config), getQueueState: () => queue } : null
    })));
}

// Every browser API request is fictional; time and stalled responses are controlled by the test.
function installFixture(status) {
    const nativeTimeout = window.setTimeout.bind(window);
    const f = window.dashboardFixture = {
        now: Date.now(), timers: new Map(), nextTimer: 0, hidden: false,
        data: status, hold: false, ignoreAbort: false, fail: false, httpOk: true, requests: []
    };
    Object.defineProperty(document, 'hidden', { get: () => f.hidden });
    const RealDate = window.Date;
    window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [f.now])); }
        static now() { return f.now; }
    };
    const timer = (fn, ms, interval) => {
        const id = ++f.nextTimer;
        f.timers.set(id, { fn, due: f.now + ms, interval, ms });
        return id;
    };
    window.setTimeout = (fn, ms = 0) => timer(fn, ms, 0);
    window.setInterval = (fn, ms) => timer(fn, ms, ms);
    window.clearTimeout = window.clearInterval = id => f.timers.delete(id);
    window.requestAnimationFrame = fn => timer(() => fn(f.now), 16, 0);
    window.cancelAnimationFrame = window.clearTimeout;
    f.flush = () => new Promise(resolve => nativeTimeout(resolve, 0));
    f.advance = async ms => {
        const target = f.now + ms;
        for (;;) {
            const next = [...f.timers].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            const [id, t] = next;
            f.now = t.due;
            if (t.interval) t.due += t.interval;
            else f.timers.delete(id);
            t.fn();
            await f.flush();
        }
        f.now = target;
        await f.flush();
    };
    f.setHidden = hidden => {
        f.hidden = hidden;
        document.dispatchEvent(new window.Event('visibilitychange'));
    };
    f.save = detail => window.dispatchEvent(new window.CustomEvent('streampulse:config-saved', { detail }));
    f.active = () => f.requests.filter(r => !r.done && !r.signal?.aborted).length;
    f.release = (index, data) => f.requests[index].release(data);
    window.fetch = (url, options = {}) => {
        if (String(url) !== '/api/status') return Promise.resolve(new window.Response(JSON.stringify(String(url).includes('custom-overlays') ? [] : {})));
        const data = JSON.parse(JSON.stringify(f.data));
        const hold = f.hold, ignoreAbort = f.ignoreAbort, ok = f.httpOk;
        const record = { signal: options.signal, done: false };
        f.requests.push(record);
        if (f.fail) { record.done = true; return Promise.reject(new Error('Fictional offline server')); }
        return new Promise((resolve, reject) => {
            const response = value => ({
                ok,
                json: () => hold === 'body' ? new Promise(done => {
                    record.release = next => { record.done = true; done(next || value); };
                }) : Promise.resolve(value).then(next => { record.done = true; return next; })
            });
            record.release = next => resolve(response(next || data));
            options.signal?.addEventListener('abort', () => {
                if (!ignoreAbort) { record.done = true; reject(new window.DOMException('Fixture aborted', 'AbortError')); }
            }, { once: true });
            if (hold !== 'fetch') resolve(response(data));
        });
    };
    window.localStorage.setItem('streampulse.dashboard.layout.v3', JSON.stringify({
        order: [], spans: {}, heights: {}, hidden: [], compact: true
    }));
    window.localStorage.setItem('streampulse:fixture-view', 'calendar');
}

function fixtureServer(status) {
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/fixture/')) {
            const html = url.pathname === '/fixture/dashboard'
                ? fs.readFileSync(path.join(rootDir, 'public/dashboard.html'), 'utf8')
                : '<!doctype html><html><head></head><body><nav id="main-nav" class="nav"></nav><script src="/nav.js"></script></body></html>';
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html.replace('<head>', `<head><script>(${installFixture.toString()})(${JSON.stringify(status)});</script>`));
        } else if (url.pathname.startsWith('/api/')) {
            res.writeHead(500);
            res.end('Unexpected fixture API request');
        } else if (!router.handleRequest(req, res)) {
            res.writeHead(404);
            res.end();
        }
    });
}

test('dashboard recovery and navigation polling resilience', async t => {
    const status = {
        sessionPhase: 'waiting', uptime: 42, ssn: {}, overlayClients: 0,
        alerts: mapAlerts({ settings: { enabled: false } }),
        modules: { polls: true }, viewers: { live: false }
    };
    const server = fixtureServer(status);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const profile = path.join(os.tmpdir(), `.dashboard-browser-${process.pid}`);
    fs.mkdirSync(profile, { recursive: true });
    let browser;
    t.after(async () => {
        await browser?.close();
        fs.rmSync(profile, { recursive: true, force: true });
    });
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile }, args: ['--no-sandbox']
    });
    async function open(route) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (new URL(request.url()).hostname !== '127.0.0.1') request.abort();
            else request.continue();
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/fixture/${route}`, { waitUntil: 'load' });
        await page.evaluate(() => window.dashboardFixture.flush());
        return { page, errors };
    }

    await t.test('real alerts mapping and refresh success/failure/identical-success rendering', async () => {
        assert.equal(mapAlerts({ settings: { enabled: false } }).enabled, false);
        assert.equal(mapAlerts({ settings: { enabled: true } }).enabled, true);
        assert.equal(mapAlerts({}).enabled, true);
        assert.equal(mapAlerts({}, {}, false).enabled, false);
        const { page, errors } = await open('dashboard');
        const result = await page.evaluate(async () => {
            const f = window.dashboardFixture;
            const connection = document.getElementById('conn-text');
            const before = connection.innerHTML;
            const layout = window.localStorage.getItem('streampulse.dashboard.layout.v3');
            f.fail = true;
            await window.refresh();
            const failed = connection.textContent;
            f.fail = false;
            await window.refresh();
            const recovered = connection.innerHTML;
            await window.refresh();
            f.fail = true;
            await window.refresh();
            const failedAgain = connection.textContent;
            f.fail = false;
            await window.refresh();
            return {
                before, failed, recovered, failedAgain,
                color: document.getElementById('dot-conn').dataset.color,
                alerts: document.getElementById('alerts-status').textContent,
                alertsColor: document.getElementById('dot-alerts').dataset.color,
                layoutPreserved: layout === window.localStorage.getItem('streampulse.dashboard.layout.v3')
            };
        });
        assert.equal(result.before, '<strong>Waiting for stream</strong>');
        assert.equal(result.failed, 'Server unreachable — retrying…');
        assert.equal(result.recovered, result.before);
        assert.equal(result.failedAgain, result.failed, 'both cache directions must invalidate');
        assert.equal(result.color, 'green');
        assert.equal(result.alerts, 'Disabled');
        assert.equal(result.alertsColor, 'red');
        assert.equal(result.layoutPreserved, true);
        assert.equal(await page.evaluate(async () => {
            const node = document.getElementById('conn-text').firstChild;
            await window.refresh();
            return node === document.getElementById('conn-text').firstChild;
        }), true, 'identical healthy snapshots retain existing DOM');
        assert.deepEqual(errors, []);
        await page.close();
    });

    await t.test('single flight, stale JSON/config invalidation, HTTP errors and preserved nav interactions', async () => {
        const { page, errors } = await open('nav');
        assert.equal(await page.$eval('#nav-live-indicator .label', el => el.textContent), 'Offline');
        const result = await page.evaluate(async () => {
            const f = window.dashboardFixture;
            window.openCommandPalette();
            const input = document.getElementById('nav-palette-input');
            input.value = 'Poll Manager';
            input.dispatchEvent(new window.Event('input'));
            const paletteInitiallyVisible = !!document.querySelector('#nav-palette-results a[href="/polls.html"]');
            f.httpOk = false;
            f.data.modules.polls = false;
            await f.advance(15000);
            const ignoredHttpError = !!document.querySelector('#main-nav a[href="/polls.html"]');
            f.httpOk = true;
            f.hold = 'body';
            f.ignoreAbort = true;
            f.data = { modules: { polls: true }, viewers: { live: true, current: 99 } };
            await f.advance(15000);
            const old = f.requests.length - 1;
            const count = f.requests.length;
            for (let i = 0; i < 10; i++) window.dispatchEvent(new window.Event('pageshow'));
            const singleFlight = f.requests.length === count;
            f.data = { modules: { polls: false }, viewers: { live: false } };
            f.save({ polls_enabled: false });
            await f.flush();
            const current = f.requests.length - 1;
            f.release(old);
            await f.flush();
            window.dispatchEvent(new window.Event('pageshow'));
            const oldFinalizerPreservedFlight = f.requests.length === current + 1;
            f.release(current);
            await f.flush();
            const menu = document.querySelector('#main-nav .dropdown-toggle');
            menu.click();
            return {
                ignoredHttpError, singleFlight, oldFinalizerPreservedFlight, paletteInitiallyVisible,
                aborted: f.requests[old].signal.aborted,
                pollsVisible: !!document.querySelector('#main-nav a[href="/polls.html"]'),
                palettePollsVisible: !!document.querySelector('#nav-palette-results a[href="/polls.html"]'),
                menuOpens: menu.closest('.dropdown').classList.contains('open'),
                storedPolls: JSON.parse(window.localStorage.getItem('streampulse:modules')).polls,
                live: document.querySelector('#nav-live-indicator .label').textContent,
                view: window.localStorage.getItem('streampulse:fixture-view')
            };
        });
        assert.deepEqual(result, {
            ignoredHttpError: true, singleFlight: true, oldFinalizerPreservedFlight: true, aborted: true,
            paletteInitiallyVisible: true, pollsVisible: false, palettePollsVisible: false, menuOpens: true,
            storedPolls: false, live: 'Offline', view: 'calendar'
        });
        assert.deepEqual(errors, []);
        await page.close();
    });

    await t.test('missing overlay counts render zero and valid custom lists retain their count', async () => {
        const { page, errors } = await open('dashboard');
        const result = await page.evaluate(async () => {
            const f = window.dashboardFixture;
            delete f.data.overlayClients;
            await window.refresh();
            const statusFetch = window.fetch;
            let overlays = {};
            window.fetch = (url, options) => String(url) === '/api/custom-overlays'
                ? Promise.resolve(new window.Response(JSON.stringify(overlays))) : statusFetch(url, options);
            await window.loadCustomOverlayCount();
            const missing = document.getElementById('overlay-custom-count').textContent;
            overlays = [{ id: 'fictional-one' }, { id: 'fictional-two' }];
            await window.loadCustomOverlayCount();
            const populated = document.getElementById('overlay-custom-count').textContent;
            overlays = [];
            await window.loadCustomOverlayCount();
            return {
                missing, populated, empty: document.getElementById('overlay-custom-count').textContent,
                clients: document.getElementById('overlay-clients').textContent,
                sources: document.getElementById('ws-clients').textContent
            };
        });
        assert.deepEqual(result, { missing: '0', populated: '2', empty: '0', clients: '0', sources: '0' });
        assert.deepEqual(errors, []);
        await page.close();
    });

    await t.test('deadlines bound stalled polling; hidden/pagehide release and pageshow recover', async () => {
        const { page, errors } = await open('nav');
        const result = await page.evaluate(async () => {
            const f = window.dashboardFixture;
            f.hold = 'fetch';
            await f.advance(15000);
            const first = f.requests.length - 1;
            await f.advance(7999);
            const beforeDeadline = f.requests[first].signal.aborted;
            await f.advance(1);
            const deadlineAborted = f.requests[first].signal.aborted;
            let maxActive = 0;
            const start = f.requests.length;
            for (let i = 0; i < 60; i++) { await f.advance(1000); maxActive = Math.max(maxActive, f.active()); }
            const minuteRequests = f.requests.length - start;
            f.setHidden(true);
            const hiddenTimers = f.timers.size;
            const hiddenActive = f.active();
            const hiddenStart = f.requests.length;
            await f.advance(60000);
            const hiddenRequests = f.requests.length - hiddenStart;
            f.setHidden(false);
            const visibleRequests = f.requests.length - hiddenStart;
            window.dispatchEvent(new window.Event('pagehide'));
            const pagehideTimers = f.timers.size;
            const pagehideActive = f.active();
            f.setHidden(true);
            f.setHidden(false);
            const pagehideStart = f.requests.length;
            await f.advance(60000);
            const pagehideRequests = f.requests.length - pagehideStart;
            f.hold = false;
            const restoreStart = f.requests.length;
            window.dispatchEvent(new window.Event('pageshow'));
            await f.flush();
            window.dispatchEvent(new window.Event('pageshow'));
            await f.flush();
            return {
                beforeDeadline, deadlineAborted, maxActive, minuteRequests,
                hiddenTimers, hiddenActive, hiddenRequests, visibleRequests,
                pagehideTimers, pagehideActive, pagehideRequests,
                restoreRequests: f.requests.length - restoreStart,
                intervals: [...f.timers.values()].filter(timer => timer.interval === 15000).length,
                restoredLive: document.querySelector('#nav-live-indicator .label').textContent
            };
        });
        assert.deepEqual(result, {
            beforeDeadline: false, deadlineAborted: true, maxActive: 1, minuteRequests: 4,
            hiddenTimers: 0, hiddenActive: 0, hiddenRequests: 0, visibleRequests: 1,
            pagehideTimers: 0, pagehideActive: 0, pagehideRequests: 0,
            restoreRequests: 1,
            intervals: 1, restoredLive: 'Offline'
        });
        assert.deepEqual(errors, []);
        await page.close();
    });

    await t.test('late JSON cannot undo timeout, lifecycle restore or cross-tab module changes', async () => {
        const { page, errors } = await open('nav');
        const result = await page.evaluate(async () => {
            const f = window.dashboardFixture;
            const holdOld = async () => {
                f.hold = 'body';
                f.ignoreAbort = true;
                f.data = { modules: { polls: true }, viewers: { live: true, current: 99 } };
                await f.advance(15000);
                return f.requests.length - 1;
            };
            const lateTimeout = await holdOld();
            await f.advance(8000);
            f.hold = false;
            f.data = { modules: { polls: false }, viewers: { live: false } };
            await f.advance(7000);
            f.release(lateTimeout);
            await f.flush();
            const timeoutPolls = JSON.parse(window.localStorage.getItem('streampulse:modules')).polls;
            const lateLifecycle = await holdOld();
            window.dispatchEvent(new window.Event('pagehide'));
            f.hold = false;
            f.data = { modules: { polls: false }, viewers: { live: false } };
            window.dispatchEvent(new window.Event('pageshow'));
            await f.flush();
            f.release(lateLifecycle);
            await f.flush();
            const lifecyclePolls = JSON.parse(window.localStorage.getItem('streampulse:modules')).polls;
            const lateStorage = await holdOld();
            window.localStorage.setItem('streampulse:modules', JSON.stringify({ polls: false }));
            window.dispatchEvent(new window.StorageEvent('storage', {
                key: 'streampulse:modules', newValue: JSON.stringify({ polls: false })
            }));
            f.release(lateStorage);
            await f.flush();
            return {
                timeoutPolls, lifecyclePolls,
                storagePolls: JSON.parse(window.localStorage.getItem('streampulse:modules')).polls,
                aborted: [lateTimeout, lateLifecycle, lateStorage].every(index => f.requests[index].signal.aborted),
                pollsVisible: !!document.querySelector('#main-nav a[href="/polls.html"]'),
                live: document.querySelector('#nav-live-indicator .label').textContent,
                active: f.active()
            };
        });
        assert.deepEqual(result, {
            timeoutPolls: false, lifecyclePolls: false, storagePolls: false,
            aborted: true, pollsVisible: false, live: 'Offline', active: 0
        });
        assert.deepEqual(errors, []);
        await page.close();
    });
});
