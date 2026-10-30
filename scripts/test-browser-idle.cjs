'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const { createStaticRouter } = require('../server/static-router');

// The real pages run against fictional state and deterministic time, without live sockets or APIs.
function installFixture() {
    const nativeTimeout = window.setTimeout.bind(window);
    const state = window.idleFixture = {
        now: Date.now(), timers: new Map(), nextTimer: 0, sockets: [], requests: [],
        renders: 0, choicesRenders: 0, paths: 0, hidden: false, pending: [], hold: false,
        tournament: {
            id: 'fictional-bracket', title: 'Fictional Championship', format: 'single',
            bracketSize: 4, status: 'IN_PROGRESS', activeMatchId: 'm_1_1',
            progressionMode: 'vote',
            matches: [
                { id: 'm_1_1', round: 1, status: 'ACTIVE', entrant1: { name: 'Orbit', votes: 0, percent: 0 }, entrant2: { name: 'Meadow', votes: 0, percent: 0 } },
                { id: 'm_1_2', round: 1, status: 'PENDING', entrant1: { name: 'Harbor' }, entrant2: { name: 'Cloud' } },
                { id: 'm_2_1', round: 2, status: 'PENDING', entrant1: { name: 'TBD' }, entrant2: { name: 'TBD' } }
            ]
        }
    };
    const clone = value => JSON.parse(JSON.stringify(value));
    const RealDate = Date;
    window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [state.now])); }
        static now() { return state.now; }
    };
    Object.defineProperty(document, 'hidden', { get: () => state.hidden });
    const html = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
    Object.defineProperty(window.Element.prototype, 'innerHTML', {
        ...html,
        set(value) {
            if (this.id === 'tournament-container') state.renders++;
            if (this.id === 'active-choices-list') state.choicesRenders++;
            html.set.call(this, value);
        }
    });
    const create = document.createElementNS.bind(document);
    document.createElementNS = (...args) => {
        if (args[1] === 'path') state.paths++;
        return create(...args);
    };
    const timer = (fn, ms, interval) => {
        const id = ++state.nextTimer;
        state.timers.set(id, { fn, due: state.now + ms, interval });
        return id;
    };
    window.setTimeout = (fn, ms = 0) => timer(fn, ms, 0);
    window.setInterval = (fn, ms) => timer(fn, ms, ms);
    window.clearTimeout = window.clearInterval = id => state.timers.delete(id);
    window.requestAnimationFrame = fn => timer(() => fn(state.now), 16, 0);
    window.cancelAnimationFrame = window.clearTimeout;
    state.flush = () => new Promise(done => nativeTimeout(done, 0));
    state.advance = async ms => {
        const target = state.now + ms;
        for (;;) {
            const next = [...state.timers].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            const [id, t] = next;
            state.now = t.due;
            if (t.interval) t.due += t.interval;
            else state.timers.delete(id);
            t.fn();
            await state.flush();
        }
        state.now = target;
        await state.flush();
    };
    window.fetch = (url, options = {}) => {
        state.requests.push(String(url));
        const body = String(url).includes('/tournament') ? { tournament: clone(state.tournament) } : {};
        return new Promise((resolve, reject) => {
            const release = () => resolve(new window.Response(JSON.stringify(body)));
            options.signal?.addEventListener('abort', () => reject(new window.DOMException('Fixture abort', 'AbortError')), { once: true });
            if (state.hold && String(url).includes('/tournament')) state.pending.push(release);
            else release();
        });
    };
    window.WebSocket = class {
        static OPEN = 1;
        readyState = 0;
        constructor() {
            state.sockets.push(this);
            Promise.resolve().then(() => {
                if (this.readyState !== 0) return;
                this.readyState = 1;
                this.onopen?.();
            });
        }
        send() {}
        close() {
            this.readyState = 3;
            // Native close callbacks can arrive after a BFCache restore.
            nativeTimeout(() => this.onclose?.(), 0);
        }
    };
    state.broadcast = (type, data) => {
        for (const socket of state.sockets.filter(s => s.readyState === 1)) {
            socket.onmessage?.({ data: JSON.stringify({ type, data }) });
        }
    };
    state.poll = remainingSeconds => ({
        id: 'fictional-poll', tournamentId: state.tournament.id, tournamentMatchId: 'm_1_1',
        title: 'Fictional vote', status: 'ACTIVE', duration: 120,
        startedAt: new Date(state.now).toISOString(), remainingSeconds, totalVotes: 0,
        choices: [{ title: 'Orbit', votes: 0, percent: 0 }, { title: 'Meadow', votes: 0, percent: 0 }]
    });
}

function fixtureServer() {
    const rootDir = path.resolve(__dirname, '..');
    const router = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/fixture/')) {
            const file = url.pathname === '/fixture/polls' ? 'tools/polls.html'
                : url.pathname === '/fixture/poll-tournament' ? 'overlays/poll-tournament.html' : 'overlays/tournament.html';
            const html = fs.readFileSync(path.join(rootDir, 'public', file), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html.replace('<head>', `<head><script>(${installFixture.toString()})();</script>`));
        } else if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
        } else if (!router.handleRequest(req, res)) {
            res.writeHead(404);
            res.end();
        }
    });
}

if (process.argv.includes('--safari-fixture')) {
    const server = fixtureServer();
    server.listen(0, '127.0.0.1', () => console.log(`Fictional WebKit fixture: http://127.0.0.1:${server.address().port}/fixture/poll-tournament`));
} else {
    test('browser idle: stable brackets, bounded redraws, lifecycle restore, and poll tick work', async t => {
        const server = fixtureServer();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        t.after(() => new Promise(resolve => server.close(resolve)));
        const profile = path.join(__dirname, `.idle-browser-${process.pid}`);
        fs.mkdirSync(profile, { recursive: true });
        let browser;
        t.after(async () => {
            await browser?.close();
            fs.rmSync(profile, { recursive: true, force: true });
        });
        browser = await puppeteer.launch({
            headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile },
            args: ['--no-sandbox']
        });
        const errors = [];
        async function open(route) {
            const page = await browser.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (new URL(req.url()).hostname !== '127.0.0.1') req.abort();
                else req.continue();
            });
            await page.goto(`http://127.0.0.1:${server.address().port}/fixture/${route}`, { waitUntil: 'load' });
            await page.evaluate(() => window.idleFixture.advance(100));
            return page;
        }
        const overlay = await open('poll-tournament');
        assert.equal(await overlay.$eval('.tournament-title', el => el.textContent.trim()), 'Fictional Championship');
        const stable = await overlay.evaluate(async () => {
            const f = window.idleFixture, card = document.querySelector('.match-card'), line = document.querySelector('.bracket-line');
            const start = { renders: f.renders, paths: f.paths };
            for (let i = 0; i < 60; i++) {
                f.broadcast('poll-update', f.poll(120 - i));
                await f.advance(1000);
            }
            for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('resize'));
            await f.advance(100);
            return {
                renders: f.renders - start.renders, paths: f.paths - start.paths,
                card: card === document.querySelector('.match-card'), line: line === document.querySelector('.bracket-line')
            };
        });
        assert.deepEqual(stable, { renders: 0, paths: 0, card: true, line: true });
        assert.deepEqual(await overlay.evaluate(async () => {
            const f = window.idleFixture, card = document.querySelector('.match-card'), line = document.querySelector('.bracket-line');
            const start = [f.renders, f.paths];
            f.hidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
            f.broadcast('poll-update', f.poll(30));
            await f.advance(1000);
            return [f.renders - start[0], f.paths - start[1], card === document.querySelector('.match-card'), line === document.querySelector('.bracket-line')];
        }), [0, 0, true, true]);
        assert.equal(await overlay.evaluate(async () => {
            window.idleFixture.broadcast('poll-update', { ...window.idleFixture.poll(29), choices: [{ votes: 3, percent: 100 }, { votes: 0, percent: 0 }] });
            await window.idleFixture.advance(100);
            return window.TournamentOverlay.getCurrentTournament().matches[0].entrant1.votes;
        }), 3, 'OBS-hidden overlays must still render changed votes');
        assert.deepEqual(await overlay.evaluate(async () => {
            const f = window.idleFixture;
            window.dispatchEvent(new Event('pagehide'));
            window.dispatchEvent(new Event('pageshow'));
            await f.flush();
            await f.advance(10000);
            return [f.sockets.filter(s => s.readyState === 1).length, f.timers.size];
        }), [2, 0], 'BFCache restore keeps exactly visibility + tournament sockets and no idle timers');
        assert.equal(await overlay.evaluate(async () => {
            const f = window.idleFixture;
            f.hold = true;
            f.sockets.at(-1).close();
            await f.flush();
            await f.advance(2000);
            f.broadcast('poll-tournament-update', { ...f.tournament, title: 'Newest fictional bracket' });
            f.pending.splice(0).forEach(fn => fn());
            await f.flush();
            return document.querySelector('.tournament-title').textContent.trim();
        }), 'Newest fictional bracket', 'stale reconnect HTTP response must not replace newer push state');
        const polls = await open('polls');
        assert.deepEqual(await polls.evaluate(async () => {
            const f = window.idleFixture, requests = f.requests.length;
            f.broadcast('poll-update', f.poll(120));
            const choice = document.querySelector('.live-choice-bar');
            const renders = f.choicesRenders;
            for (let i = 0; i < 60; i++) f.broadcast('poll-update', f.poll(119 - i));
            await f.flush();
            return [f.requests.length - requests, f.choicesRenders - renders, choice === document.querySelector('.live-choice-bar'),
                document.getElementById('active-timer-badge').textContent];
        }), [0, 0, true, '1:00'], 'countdown pushes need no bracket HTTP reload or choice node replacement');
        await polls.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/js/overlay-shared.js` });
        const cache = await polls.evaluate(async () => {
            const shared = window.OverlayShared;
            const requests = [];
            let held = null;
            window.fetch = url => {
                requests.push(url);
                const respond = () => new window.Response(JSON.stringify(url.includes('text-source')
                    ? { text: `Fictional content ${url}` } : [{ name: 'fictional.svg', kind: 'image' }]));
                if (held) return new Promise(resolve => held.push(() => resolve(respond())));
                return Promise.resolve(respond());
            };
            const text = path => ({ id: 'text', type: 'text', source: { mode: 'library', path } });
            const slide = name => ({ id: 'slide', type: 'slideshow', slideshow: { source: 'manual', files: [name] } });
            const inactive = { ...text('inactive.txt'), id: 'inactive', page: 'inactive', visible: false };
            const original = text('original.txt');
            const originalSlide = slide('original.svg');
            await shared.refreshTextSources([original, inactive]);
            await shared.slideshowItems(originalSlide.slideshow);
            let current = original, currentSlide = originalSlide;
            for (let i = 0; i < 20; i++) {
                current = text(`replacement-${i}.txt`);
                currentSlide = slide(`replacement-${i}.svg`);
                await shared.refreshTextSources([current]);
                await shared.slideshowItems(currentSlide.slideshow);
                shared.pruneSourceCaches([current, currentSlide, inactive]);
            }
            const inactiveRetained = !!shared.textSourceState(inactive);
            const retiredRemoved = shared.textSourceState(original) === null;
            const currentRetained = !!shared.textSourceState(current);
            const beforeCurrent = requests.length;
            await shared.slideshowItems(currentSlide.slideshow);
            const currentSlideRequests = requests.length - beforeCurrent;
            const beforeOld = requests.length;
            await shared.slideshowItems(originalSlide.slideshow);
            const retiredSlideRequests = requests.length - beforeOld;

            held = [];
            const pendingText = text('pending.txt'), pendingSlide = slide('pending.svg');
            const loads = [shared.refreshTextSources([pendingText]), shared.slideshowItems(pendingSlide.slideshow)];
            shared.pruneSourceCaches([current, currentSlide, inactive]);
            const releases = held;
            held = null;
            releases.forEach(release => release());
            await Promise.all(loads);
            const lateTextRemoved = shared.textSourceState(pendingText) === null;
            const beforePending = requests.length;
            await shared.slideshowItems(pendingSlide.slideshow);
            return {
                inactiveRetained, retiredRemoved, currentRetained, currentSlideRequests, retiredSlideRequests,
                lateTextRemoved, lateSlideRequests: requests.length - beforePending
            };
        });
        assert.deepEqual(cache, {
            inactiveRetained: true, retiredRemoved: true, currentRetained: true,
            currentSlideRequests: 0, retiredSlideRequests: 1, lateTextRemoved: true, lateSlideRequests: 1
        }, 'full-model reconciliation keeps active/hidden-page sources, evicts retired selections, and ignores late retired cache loads');
        assert.deepEqual(errors, []);
    });
}
