import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

// Real consumers and shared modules; all data, sockets, resources, and time are isolated.
const choices = ['Fictional Orbit', 'Fictional Moss', 'Fictional Harbor', 'Fictional Cloud'];
const weights = { [choices[0]]: 1, [choices[1]]: 5, [choices[2]]: 2, [choices[3]]: 2 };
const moduleNames = ['wheel', 'stage-rendering', 'spin-animation', 'animation-scope'];
const sources = new Map(await Promise.all(moduleNames.map(async name => [
    `/js/randomizer/${name}.js`, await readFile(new URL(`../public/js/randomizer/${name}.js`, import.meta.url), 'utf8')
])));
const hooks = `
        window.fixture.controls = {
            spin: runSpin, draw: drawWheel,
            idleRoller: renderIdleRoller, idleDeck: renderIdleDeck,
            configure({ mode, colors, logo, watermark, style } = {}) {
                if (mode) currentMode = mode;
                if (colors) currentThemeSlices = colors;
                if (logo !== undefined) currentDeckLogo = logo;
                if (watermark !== undefined) currentDeckWatermark = watermark;
                for (const [name, value] of Object.entries(style || {})) {
                    $('display-stage').style.setProperty(name, value);
                }
                updateDeckVisuals();
            },
            spinning: () => isSpinning
        };
        const originalFanfare = AudioFX.fanfare;
        AudioFX.fanfare = function() {
            window.fixture.completions++;
            return originalFanfare.call(this);
        };
`;
for (const [route, file] of [
    ['/randomizer-editor.html', 'editors/randomizer-editor.html'],
    ['/overlays/randomizer.html', 'overlays/randomizer.html']
]) {
    const html = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
    sources.set(route, html.replace('        connectWs();', `        connectWs();\n${hooks}`));
}
const profile = resolve(`scripts/.randomizer-browser-${process.pid}`);
const errors = [];
const measurements = [];
let browser;
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox']
    });

    async function open(editor) {
        const page = await browser.newPage();
        const requestedModules = new Set();
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = new URL(request.url());
            const source = url.origin === 'http://randomizer.test' && sources.get(url.pathname);
            if (moduleNames.some(name => url.pathname === `/js/randomizer/${name}.js`)) requestedModules.add(url.pathname);
            request.respond({
                status: 200,
                contentType: source ? (url.pathname.endsWith('.html') ? 'text/html' : 'text/javascript')
                    : url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'image/svg+xml',
                body: source || (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ? ''
                    : '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>')
            });
        });
        await page.evaluateOnNewDocument((choices, weights) => {
            const nativeTimeout = window.setTimeout.bind(window);
            const nativeFrame = window.requestAnimationFrame.bind(window);
            let now = 0;
            let nextId = 0;
            const state = window.fixture = {
                timers: new Map(), frames: new Map(), sockets: [], fetches: [],
                arcs: 0, labels: [], blits: 0, rotation: 0, completions: 0
            };
            state.flush = () => new Promise(done => nativeTimeout(done, 0));
            state.layout = () => new Promise(done => nativeFrame(() => nativeFrame(done)));
            const schedule = (fn, ms, interval = 0) => {
                const id = ++nextId;
                state.timers.set(id, { fn, due: now + ms, interval });
                return id;
            };
            window.setTimeout = (fn, ms = 0) => schedule(fn, Number(ms) || 0);
            window.setInterval = (fn, ms) => schedule(fn, ms, ms);
            window.clearTimeout = window.clearInterval = id => state.timers.delete(id);
            window.requestAnimationFrame = fn => {
                const id = ++nextId;
                state.frames.set(id, { fn, due: now + 16 });
                return id;
            };
            window.cancelAnimationFrame = id => state.frames.delete(id);
            Object.defineProperty(window.performance, 'now', { value: () => now });
            state.advance = async ms => {
                const target = now + ms;
                for (;;) {
                    const entries = [
                        ...[...state.timers].map(([id, entry]) => ({ id, entry, frame: false })),
                        ...[...state.frames].map(([id, entry]) => ({ id, entry, frame: true }))
                    ].filter(({ entry }) => entry.due <= target).sort((a, b) => a.entry.due - b.entry.due || a.id - b.id);
                    if (!entries.length) break;
                    const { id, entry, frame } = entries[0];
                    now = entry.due;
                    if (frame) state.frames.delete(id);
                    else if (entry.interval) entry.due += entry.interval;
                    else state.timers.delete(id);
                    entry.fn(now);
                }
                now = target;
                await state.flush();
            };
            window.AudioContext = window.webkitAudioContext = undefined;
            Math.random = () => 0.3;
            const proto = window.CanvasRenderingContext2D.prototype;
            const arc = proto.arc;
            proto.arc = function(...args) {
                state.arcs++;
                return arc.apply(this, args);
            };
            const fillText = proto.fillText;
            proto.fillText = function(...args) {
                state.labels.push(args[0]);
                return fillText.apply(this, args);
            };
            const drawImage = proto.drawImage;
            proto.drawImage = function(...args) {
                if (this.canvas.id === 'wheel-canvas') {
                    state.blits++;
                    const transform = this.getTransform();
                    state.rotation = Math.atan2(transform.b, transform.a);
                }
                return drawImage.apply(this, args);
            };
            window.WebSocket = class {
                constructor() { state.sockets.push(this); }
                send() {}
                close() {}
            };
            state.broadcast = data => {
                state.sockets.at(-1).onmessage({ data: JSON.stringify({ type: 'randomizer-spin', data }) });
            };
            window.fetch = async (url, init = {}) => {
                state.fetches.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
                let data;
                if (url === '/api/randomizer/presets') data = {
                    presets: [{ id: 'jackbox', name: 'Fictional Pool', choices, weights, weightMode: 'manual',
                        deckLogo: '/fiction.svg', deckWatermark: 'FICTIONAL & FRIENDS' }]
                };
                else if (url === '/api/randomizer/button-presets') data = { presets: [{ id: 'chaos', name: 'Fictional Button', phrases: ['Fictional Spin'] }] };
                else if (url === '/api/randomizer/quote-presets') data = { presets: [{ id: 'multiverse', name: 'Fictional Quotes', quotes: ['Fictional Result'] }] };
                else if (url === '/api/config') data = { theme: {} };
                else if (url === '/api/variables') data = { variables: [] };
                else if (url === '/api/randomizer/spin') data = { ok: true, winner: choices[1] };
                else throw new Error(`Unexpected fixture fetch: ${url}`);
                return new window.Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
            };
        }, choices, weights);
        await page.goto(`http://randomizer.test/${editor ? 'randomizer-editor.html' : 'overlays/randomizer.html?button=1&sound=0&autohide=0'}`, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.fixture.controls);
        await page.evaluate(async () => {
            await window.fixture.layout();
            await window.fixture.advance(2000);
            window.fixture.controls.configure({
                logo: '/fiction.svg', watermark: 'FICTIONAL & FRIENDS',
                colors: ['#ef4444', '#00ff66', '#3b82f6', '#fbbf24'],
                style: { '--stage-font': 'Arial', '--stage-weight': '700', '--stage-text': '#ffffff', '--stage-scale': '1', '--stage-outline': '' }
            });
            await window.fixture.flush();
            await window.fixture.advance(32);
        });
        assert.equal(requestedModules.size, moduleNames.length, 'both consumers must load every shared rendering/animation module');
        return page;
    }
    const advance = (page, ms) => page.evaluate(ms => window.fixture.advance(ms), ms);
    const snapshot = page => page.evaluate(() => ({
        arcs: window.fixture.arcs, blits: window.fixture.blits, labels: window.fixture.labels,
        rotation: window.fixture.rotation, completions: window.fixture.completions,
        spinning: window.fixture.controls.spinning(),
        winner: document.getElementById('winner-text').textContent,
        frames: window.fixture.frames.size,
        timers: [...window.fixture.timers.values()].filter(timer => !timer.interval).length
    }));
    const settle = async page => {
        await page.evaluate(() => window.fixture.layout());
        await advance(page, 2200);
        await advance(page, 32);
        const result = await snapshot(page);
        assert.equal(result.frames, 0, 'completed spins must leave no animation frames');
        assert.equal(result.timers, 0, 'completed spins must leave no one-shot callbacks');
    };
    const start = (page, payload, socket = false) => page.evaluate((payload, socket) => {
        if (socket) window.fixture.broadcast(payload);
        else window.fixture.controls.spin(payload);
    }, payload, socket);

    const pages = [await open(true), await open(false)];
    for (const [index, page] of pages.entries()) {
        await page.bringToFront();
        const consumer = index === 0 ? 'editor' : 'overlay';
        const geometry = await page.evaluate(async (choices, weights) => {
            const { getWheelGeometry } = await import('/js/randomizer/wheel.js');
            return {
                weighted: getWheelGeometry(choices, weights),
                invalid: getWheelGeometry(choices, { [choices[0]]: 0, [choices[1]]: -1, [choices[2]]: 'bad' }),
                empty: getWheelGeometry([])
            };
        }, choices, weights);
        assert.equal(geometry.weighted.sliceSpans[1], Math.PI);
        assert.equal(geometry.weighted.cumulativeAngles.at(-1), Math.PI * 2);
        assert(geometry.invalid.sliceSpans.every(span => span === Math.PI / 2));
        assert.deepEqual(geometry.empty.sliceSpans, [Math.PI * 2]);

        await page.evaluate(choices => {
            window.fixture.controls.configure({ mode: 'roller' });
            window.fixture.controls.idleRoller(1, choices);
        }, choices);
        assert.equal(await page.$eval('#roller-track', node => node.children.length), 9);
        assert.equal(await page.$eval('#roller-track .active-winner', node => node.textContent), choices[1]);
        await page.evaluate(() => window.fixture.controls.idleRoller(0, []));
        assert.equal(await page.$eval('#roller-track .active-winner', node => node.textContent), '(empty)');
        await page.evaluate(choices => window.fixture.controls.idleDeck(choices), choices);
        assert.equal(await page.$eval('#deck-count-badge', node => node.textContent), '4 CARDS');
        assert.equal(await page.$eval('#deck-stack .deck-card-custom-logo', node => node.getAttribute('src')), '/fiction.svg');
        assert.equal(await page.$eval('#deck-card-watermark', node => node.textContent), 'FICTIONAL & FRIENDS');

        await page.evaluate((choices, weights) => {
            window.fixture.controls.configure({ mode: 'wheel' });
            document.getElementById('wheel-view').style.display = 'flex';
            window.fixture.controls.draw(0, choices, weights);
        }, choices, weights);
        await settle(page);
        const warm = await snapshot(page);
        await page.evaluate((choices, weights) => {
            for (let frame = 0; frame < 120; frame++) window.fixture.controls.draw(frame / 20, choices, weights);
        }, choices, weights);
        const rotated = await snapshot(page);
        assert.equal(rotated.arcs, warm.arcs, 'rotation-only frames must reuse sectors');
        assert.equal(rotated.labels.length, warm.labels.length, 'rotation-only frames must reuse labels');
        assert.equal(rotated.blits - warm.blits, 120);
        measurements.push({ consumer, rotationFrames: 120, sectorRedraws: rotated.arcs - warm.arcs, labelRedraws: rotated.labels.length - warm.labels.length });

        for (const change of [
            { choices: [...choices.slice(0, 3), 'Fictional New Label Longer Than Twenty Four Characters'] },
            { weights: { ...weights, [choices[1]]: 9 } },
            { colors: ['#123456', '#654321'] },
            { style: { '--stage-font': 'Georgia' } },
            { style: { '--stage-weight': '500' } },
            { style: { '--stage-text': '#abcabc' } },
            { style: { '--stage-outline': '#222222' } }
        ]) {
            const before = await snapshot(page);
            await page.evaluate((change, choices, weights) => {
                window.fixture.controls.configure(change);
                window.fixture.controls.draw(0.7, change.choices || choices, change.weights || weights);
            }, change, choices, weights);
            const after = await snapshot(page);
            assert(after.arcs > before.arcs, `cache must invalidate for ${JSON.stringify(change)}`);
        }
        assert((await snapshot(page)).labels.includes('Fictional New Label Long'), 'wheel label truncation remains 24 characters');
        const beforeFont = await snapshot(page);
        await page.evaluate(() => document.fonts.dispatchEvent(new window.Event('loadingdone')));
        await advance(page, 32);
        assert((await snapshot(page)).arcs > beforeFont.arcs, 'late web fonts invalidate cached glyphs');
        assert(Math.abs((await snapshot(page)).rotation - 0.7) < 1e-6, 'font refresh must retain current wheel rotation');
        await page.evaluate(() => window.fixture.controls.configure({ style: { '--stage-scale': '4' } }));
        await advance(page, 32);
        assert.equal(await page.$eval('#wheel-canvas', node => node.width), 2320, 'scale retains existing high-DPI policy');
        await page.setViewport({ width: 420, height: 420, deviceScaleFactor: 2 });
        await page.evaluate(() => window.fixture.layout());
        await advance(page, 32);
        assert.equal(await page.$eval('#wheel-canvas', node => node.width), 3200, 'DPR/resize is capped at 3200');
        await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
        await page.evaluate((choices, weights) => {
            window.fixture.controls.configure({ style: { '--stage-scale': '1', '--stage-font': 'Arial' } });
            window.fixture.controls.draw(0, choices, weights);
        }, choices, weights);
        await settle(page);

        for (const mode of ['wheel', 'roller', 'deck']) {
            for (const suspense of ['normal', 'tricky', 'instant']) {
                const payload = { choices, weights, winner: choices[1], mode, suspense, duration: 3, autohide: 0,
                    winnerHeader: 'FICTIONAL WINNER', winnerSub: 'Fictional celebration' };
                const before = await snapshot(page);
                await start(page, payload);
                await advance(page, mode === 'deck' && suspense === 'instant' ? 669 : 2999);
                assert.equal((await snapshot(page)).completions, before.completions, 'a spin must not complete before its reveal');
                if (mode === 'deck' && suspense !== 'instant') {
                    assert.equal(await page.$eval('#card-front-name', node => node.textContent), choices[1]);
                }
                await advance(page, 1600);
                const result = await snapshot(page);
                assert.equal(result.spinning, false, `${consumer} ${mode}/${suspense} completes`);
                assert.equal(result.completions, before.completions + 1);
                assert.equal(result.winner, choices[1], 'server-selected winner is never rerolled');
                assert.equal(await page.$eval('#winner-header-text', node => node.textContent), 'FICTIONAL WINNER');
                assert.equal(await page.$eval('#winner-sub', node => node.textContent), 'Fictional celebration');
                if (mode === 'wheel') {
                    const topAngle = (Math.PI * 1.5 - result.rotation + Math.PI * 4) % (Math.PI * 2);
                    assert(topAngle > geometry.weighted.cumulativeAngles[1] && topAngle < geometry.weighted.cumulativeAngles[2], 'pointer must land inside selected weighted sector');
                    assert.equal(await page.$eval('#wheel-pointer', node => node.style.transform), 'translateX(-50%) rotate(0deg)');
                } else if (mode === 'roller') {
                    const centered = await page.$eval('#roller-track', track => {
                        const center = ((document.getElementById('roller-view').clientHeight || 240) - 56) / 2;
                        const position = Math.round((center - new window.DOMMatrix(track.style.transform).m42) / 56);
                        return track.children[position].textContent;
                    });
                    assert.equal(centered, choices[1]);
                } else {
                    assert.equal(await page.$eval('#deck-card-inner', node => node.closest('#deck-active-card').classList.contains('is-flipped')), true);
                    assert.equal(await page.$eval('#deck-shuffle-tray', node => node.children.length), 0);
                }
                await settle(page);
            }
            const before = await snapshot(page);
            await start(page, { choices, weights, winner: choices[2], mode, duration: 3, suspense: 'normal', theme: 'purple', autohide: 0 }, true);
            await advance(page, 3200);
            assert.equal((await snapshot(page)).winner, choices[2], `${consumer} WebSocket ${mode} winner parity`);
            assert.equal((await snapshot(page)).completions, before.completions + 1);
            await settle(page);
        }

        for (const duration of [4, 6, 8, 10]) {
            await start(page, { choices, weights, winner: choices[0], mode: 'deck', duration, suspense: 'tricky', autohide: 0 });
            await advance(page, duration * 1000);
            assert.equal((await snapshot(page)).spinning, false, 'deck retains exact duration-scaled completion');
            assert.equal(await page.$eval('#deck-shuffle-tray', node => node.children.length), 0);
            await settle(page);
        }
        for (const mode of ['deck', 'wheel', 'roller', 'deck', 'roller', 'wheel']) {
            await start(page, { choices, weights, winner: choices[3], mode, duration: 3, suspense: 'tricky', autohide: 0 });
            await advance(page, 4500);
            assert.equal((await snapshot(page)).winner, choices[3], 'repeated spins retain winner and ignore old callbacks');
            await settle(page);
        }

        if (index === 0) {
            await page.$eval('#spin-duration', node => { node.value = '4'; });
            await page.$eval('#autohide-select', node => { node.value = '0'; });
            await page.$eval('#btn-spin', node => node.click());
            await page.evaluate(() => window.fixture.flush());
            await advance(page, 6000);
            assert.equal((await snapshot(page)).winner, choices[1], 'Studio REST response retains selected winner');
            const request = await page.evaluate(() => window.fixture.fetches.findLast(entry => entry.url === '/api/randomizer/spin'));
            assert.equal(request.method, 'POST');
            assert.deepEqual(request.body.choices, choices);
            assert.equal(request.body.deckLogo, '/fiction.svg');
            assert.equal(request.body.deckWatermark, 'FICTIONAL & FRIENDS');
            assert((await page.$eval('#obs-url-input', node => node.textContent)).includes('/randomizer.html?'), 'legacy OBS URL remains unchanged');
            await settle(page);
        }
        await start(page, { choices, weights, winner: choices[1], mode: 'deck', duration: 3, autohide: 0 });
        await advance(page, 600);
        const riffleCount = await page.$eval('#deck-shuffle-tray', node => node.children.length);
        await page.evaluate(() => window.dispatchEvent(new window.PageTransitionEvent('pagehide')));
        await advance(page, 5000);
        assert.equal(await page.$eval('#deck-shuffle-tray', node => node.children.length), riffleCount, 'disposed animation cannot append more riffle cards');
        await settle(page);
        await page.close();
    }
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('Randomizer rendering regression passed: both consumers, all modes/suspense paths, weighted winner parity, branding, cache invalidation, resize/DPR, and callback cleanup.');
    console.log(JSON.stringify(measurements));
} finally {
    await browser?.close();
    await rm(profile, { recursive: true, force: true });
}
