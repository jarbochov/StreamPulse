import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

// Real runtime/shared code and DOM; deterministic media, socket, and poll boundaries.
// All data and endpoints are fictional, and external requests are intercepted.
const overlay = {
    id: 'fixture', name: 'Fictional test overlay',
    canvas: { width: 640, height: 360 },
    elements: [
        { id: 'manual', type: 'video', src: '/fixture.webm', video: { autoplay: false, sound: false, volume: 25 } },
        { id: 'auto', type: 'video', src: '/fixture.webm', video: { autoplay: true, sound: true, volume: 60 } },
        { id: 'youtube', type: 'video', src: 'https://youtu.be/abcdefghijk', video: { autoplay: false, sound: true } },
        { id: 'youtube-embed', type: 'embed', src: 'https://youtu.be/abcdefghijk', video: { autoplay: false, sound: false } },
        { id: 'alert', type: 'alert', alert: { triggers: ['follow'], showOnPreview: true } },
        { id: 'label', type: 'text', content: '{{stream.title}}' }
    ]
};
const transitionFixture = {
    id: 'transition-fixture',
    name: 'Fictional transition regression fixture',
    canvas: { width: 640, height: 360 },
    pages: {
        enabled: true,
        kind: 'states',
        transition: 'morph',
        enterExit: 'fade',
        transitionMs: 280,
        items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    },
    elements: [
        {
            id: 'moving-label', type: 'text', page: '*', content: 'FICTIONAL POSITION',
            x: 20, y: 20, width: 200, height: 40, style: { opacity: 0.9 },
            pageStates: {
                b: { x: 240, style: { opacity: 0.5 } },
                c: { x: 420, style: { opacity: 0.7 } }
            }
        },
        {
            id: 'visibility-label', type: 'text', page: '*', content: 'FICTIONAL VISIBILITY',
            x: 20, y: 80, width: 200, height: 40,
            pageStates: { b: { visible: false }, c: { visible: true } }
        },
        {
            id: 'state-cutout', type: 'cutout', page: '*',
            x: 20, y: 160, width: 100, height: 70, cutout: { shape: 'rectangle', feather: 0 },
            pageStates: {
                b: { x: 180, width: 140 },
                c: { x: 360, width: 180 }
            }
        },
        { id: 'own-a', type: 'text', page: 'a', content: 'A', x: 10, y: 300, width: 20, height: 20 },
        { id: 'own-b', type: 'text', page: 'b', content: 'B', x: 40, y: 300, width: 20, height: 20 },
        { id: 'own-c', type: 'text', page: 'c', content: 'C', x: 70, y: 300, width: 20, height: 20 }
    ]
};
const sources = new Map(await Promise.all(['overlay-runtime.js', 'overlay-shared.js'].map(async name =>
    [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')]
)));
for (const name of ['editor/editor-state.js', 'editor/editor-canvas.js', 'editor-geometry.js']) {
    sources.set(`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8'));
}
sources.set('/css/custom-overlay-editor.css', await readFile(new URL('../public/css/custom-overlay-editor.css', import.meta.url), 'utf8'));
for (const name of ['overlay-filters.js', 'overlay-retro.js']) {
    sources.set(`/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8'));
}
const clone = value => JSON.parse(JSON.stringify(value));
let statusVersion = 0;
let receiveInitialSnapshot;
const initialSnapshot = new Promise(resolve => { receiveInitialSnapshot = resolve; });
const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.local').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (sources.has(path)) {
        response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(sources.get(path));
    } else if (path === '/api/custom-overlays/fixture') response.end(JSON.stringify(overlay));
    else if (path === '/api/custom-overlays/transition-fixture') response.end(JSON.stringify(transitionFixture));
    else if (path === '/api/custom-overlays/transition-fixture/page') receiveInitialSnapshot(() => response.end(JSON.stringify({ page: 'a' })));
    else if (path === '/api/status') response.end(JSON.stringify({ stream: { title: `Fictional title ${++statusVersion}` } }));
    else if (path === '/api/custom-overlays/assets') response.end('[]');
    else if (path === '/fixture.webm') { response.writeHead(204); response.end(); }
    else {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><div id="overlay-root"></div>');
    }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(`scripts/.overlay-runtime-browser-${process.pid}`);
let browser;
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (new URL(request.url()).origin === origin) request.continue();
        else request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fictional player</title>' });
    });
    await page.goto(`${origin}/?id=fixture&fit=1`);
    await page.evaluate(() => {
        window.testState = { intervals: new Map(), alerts: [], hidden: false, syncEnd: false };
        const state = window.testState;
        Object.defineProperty(document, 'hidden', { get: () => state.hidden });
        window.setInterval = (callback, ms) => { state.intervals.set(ms, callback); return ms; };
        class Socket extends window.EventTarget {
            static OPEN = 1;
            readyState = 1;
            constructor() { super(); state.socket = this; }
            send() {}
            close() {}
        }
        window.WebSocket = Socket;
        const proto = window.HTMLMediaElement.prototype;
        Object.defineProperty(proto, 'paused', { get() { return this._testPaused !== false; } });
        proto.play = function() {
            this._testPlays = (this._testPlays || 0) + 1;
            if (this._testRejectPlay) {
                this._testRejectPlay = false;
                return Promise.reject(new Error('Fictional autoplay policy'));
            }
            this._testPaused = false;
            this.dispatchEvent(new window.Event('play'));
            return Promise.resolve();
        };
        proto.pause = function() {
            this._testPaused = true;
            this.dispatchEvent(new window.Event('pause'));
        };
        proto.load = function() {};
        state.message = (type, data) => state.socket.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify({ type, data }) }));
    });
    await page.addScriptTag({ url: `${origin}/js/overlay-shared.js` });
    await page.evaluate(() => {
        const original = window.OverlayShared.playAlert;
        window.OverlayShared.playAlert = (node, element, payload, options = {}) => {
            const record = { stops: 0, ends: 0, preview: options.sound === false };
            window.testState.alerts.push(record);
            const onEnd = () => { record.ends++; options.onEnd?.(); };
            if (window.testState.syncEnd) {
                onEnd();
                return { stop() { record.stops++; } };
            }
            const handle = original(node, element, payload, { ...options, onEnd });
            record.finish = handle.stop;
            return { stop() { record.stops++; handle.stop(); } };
        };
    });
    await page.addScriptTag({ url: `${origin}/js/overlay-runtime.js` });
    await page.waitForFunction(() => document.querySelector('.overlay-text')?.textContent === 'Fictional title 1');
    const state = id => page.$eval(`[data-element-id="${id}"]`, node => {
        const video = node.querySelector('video');
        const frame = node.querySelector('iframe');
        return video ? { paused: video.paused, muted: video.muted, volume: video.volume, plays: video._testPlays || 0, time: video.currentTime }
            : { playing: frame._ytPlaying, muted: frame._ytMuted, src: frame.src };
    });
    const control = (action, element) => page.evaluate((action, element) => {
        window.testState.message('custom-overlay-video', { id: 'fixture', action, element });
    }, action, element);
    const refresh = async () => {
        await page.evaluate(() => window.testState.intervals.get(5000)());
    };
    const update = async fixture => {
        await page.evaluate(fixture => window.testState.message('custom-overlay-update', { id: 'fixture', overlay: fixture }), fixture);
        await page.evaluate(() => new Promise(done => window.setTimeout(done, 0)));
    };
    const alert = (durationMs = 60000) => page.evaluate(durationMs => window.testState.message('alert', {
        trigger: 'follow', title: 'Fictional follower', durationMs, animIn: 'none', animOut: 'none'
    }), durationMs);
    const clear = type => page.evaluate(type => window.testState.message(type), type);
    const visible = hidden => page.evaluate(hidden => {
        window.testState.hidden = hidden;
        document.dispatchEvent(new window.Event('visibilitychange'));
    }, hidden);

    assert.deepEqual(await state('manual'), { paused: true, muted: true, volume: 0.25, plays: 0, time: 0 });
    assert.equal((await state('auto')).plays, 1, 'two-phase initial load must not replay media');
    for (const id of ['youtube', 'youtube-embed']) {
        const frame = await state(id);
        assert.equal(new URL(frame.src).searchParams.get('autoplay'), '0');
        assert.equal(frame.playing, false);
    }
    await control('pause', 'auto');
    await page.$eval('[data-element-id="auto"] video', video => { video.volume = 0.31; });
    await control('mute', 'auto');
    const paused = await state('auto');
    await refresh();
    assert.deepEqual(await state('auto'), paused, 'status changes must preserve pause, mute, and volume');
    await control('play', 'manual');
    await control('unmute', 'manual');
    const playing = await state('manual');
    await refresh();
    assert.deepEqual(await state('manual'), playing, 'manual play/unmute must survive refresh with autoplay off');
    await control('stop', 'manual');
    await refresh();
    assert.equal((await state('manual')).paused, true);
    assert.equal((await state('manual')).time, 0);
    await control('restart', 'manual');
    await control('toggle-mute', 'manual');
    await visible(true);
    await visible(false);
    assert.equal((await state('manual')).paused, false);
    assert.equal((await state('manual')).muted, true, 'visibility resume must not restore configured audio');
    await visible(true);
    await control('pause', 'manual');
    await visible(false);
    assert.equal((await state('manual')).paused, true, 'pause while suspended must cancel visibility resume');
    await page.$eval('[data-element-id="manual"] video', video => { video._testRejectPlay = true; });
    await control('unmute', 'manual');
    await control('play', 'manual');
    await page.waitForFunction(() => document.querySelector('[data-element-id="manual"] video').dataset.audioPending === 'true');
    assert.equal(await page.$('#audio-unlock-notice'), null, 'production URL must not show an audio prompt');
    await control('pause', 'manual');
    await control('mute', 'manual');
    await page.evaluate(() => window.dispatchEvent(new window.Event('click')));
    assert.equal((await state('manual')).paused, true, 'audio unlock must not override an intentional pause');
    assert.equal((await state('manual')).muted, true, 'audio unlock must not override an intentional mute');
    for (const id of ['youtube', 'youtube-embed']) {
        await control('play', id);
        await control('unmute', id);
        const before = await state(id);
        await refresh();
        assert.deepEqual(await state(id), before, 'YouTube play/audio state must survive refresh');
        await control('pause', id);
        await control('mute', id);
        await refresh();
        assert.equal((await state(id)).playing, false);
        assert.equal((await state(id)).muted, true);
    }

    await alert();
    await page.evaluate(() => { window.testState.card = document.querySelector('.alert-card'); });
    await refresh();
    assert.equal(await page.evaluate(() => window.testState.card === document.querySelector('.alert-card')), true, 'status refresh must retain an in-flight alert card');
    assert.deepEqual(await page.evaluate(() => window.testState.alerts.map(a => [a.stops, a.ends])), [[0, 0]]);
    await update(clone(overlay));
    assert.equal(await page.evaluate(() => window.testState.card === document.querySelector('.alert-card')), true, 'unchanged definitions must retain alert ownership');
    await page.evaluate(() => window.testState.alerts.at(-1).finish());
    await clear('alert-clear');
    assert.deepEqual(await page.evaluate(() => window.testState.alerts.map(a => [a.stops, a.ends])), [[0, 1]], 'completed handles must not be stopped again');
    await alert(20);
    await page.waitForFunction(() => window.testState.alerts.at(-1).ends === 1);
    await clear('alert-clear');
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).stops), 0, 'timer completion must release the active handle');
    await page.evaluate(() => { window.testState.syncEnd = true; });
    await alert();
    await clear('alert-clear');
    assert.deepEqual(await page.evaluate(() => window.testState.alerts.at(-1).stops), 0, 'synchronous completion must not retain a handle');
    await page.evaluate(() => { window.testState.syncEnd = false; });
    await alert();
    const changed = clone(overlay);
    changed.elements.find(el => el.id === 'alert').alert.titleSize = 32;
    await update(changed);
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).stops), 1, 'changed alert layer must dispose its handle');
    await alert();
    await update({ ...overlay, elements: overlay.elements.filter(el => el.id !== 'alert') });
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).stops), 1, 'removed alert layer must dispose its handle');
    await update(overlay);
    await alert();
    await clear('alert-skip');
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).stops), 1);

    const pages = {
        ...clone(overlay),
        pages: { enabled: true, transition: 'none', items: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] }
    };
    pages.elements.forEach(el => { el.page = el.id === 'auto' ? '*' : 'one'; });
    pages.elements.push({ id: 'page-manual', type: 'video', page: 'two', src: '/fixture.webm', video: { autoplay: false } });
    await update(pages);
    await control('pause', 'auto');
    await alert();
    await page.evaluate(() => window.testState.message('custom-overlay-page', { id: 'fixture', page: 'two' }));
    assert.equal((await state('page-manual')).plays, 0, 'page switches must honor autoplay off');
    assert.equal((await state('auto')).paused, true, 'shared page media must retain pause');
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).stops), 1, 'outgoing alert layers must dispose their handles');
    await page.evaluate(() => window.testState.message('custom-overlay-page', { id: 'fixture', page: 'one' }));
    await page.keyboard.press('a');
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).preview), true, 'preview playback must disable sound');
    const previewCount = await page.evaluate(() => window.testState.alerts.length);
    await refresh();
    assert.equal(await page.evaluate(() => window.testState.alerts.length), previewCount, 'refresh must not restart an unchanged preview');
    await alert();
    await refresh();
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).preview), false, 'preview must not replace an in-flight live alert');
    await page.evaluate(() => window.testState.alerts.at(-1).finish());
    assert.equal(await page.evaluate(() => window.testState.alerts.at(-1).preview), true, 'normal completion must restore the silent preview');
    await clear('alert-clear');
    const clearedCount = await page.evaluate(() => window.testState.alerts.length);
    assert.equal(await page.$('.alert-card'), null, 'explicit clear must not recreate a preview');
    await clear('alert-clear');
    assert.equal(await page.evaluate(() => window.testState.alerts.length), clearedCount);

    const transitionPage = await browser.newPage();
    transitionPage.on('pageerror', error => errors.push(error.message));
    await transitionPage.setRequestInterception(true);
    transitionPage.on('request', request => {
        if (new URL(request.url()).origin === origin) request.continue();
        else request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fictional player</title>' });
    });
    await transitionPage.goto(`${origin}/?id=transition-fixture`);
    await transitionPage.evaluate(() => {
        window.testState = { intervals: new Map(), timers: new Map(), completions: new Map(), clearedTransitionTimers: 0 };
        window.setInterval = (callback, ms) => { window.testState.intervals.set(ms, callback); return ms; };
        const nativeSetTimeout = window.setTimeout.bind(window);
        const nativeClearTimeout = window.clearTimeout.bind(window);
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
            const response = await nativeFetch(...args);
            if (String(args[0]).endsWith('/transition-fixture/page')) {
                const json = response.json.bind(response);
                response.json = async () => {
                    const data = await json();
                    nativeSetTimeout(() => { window.testState.snapshotRead = true; }, 0);
                    return data;
                };
            }
            return response;
        };
        window.setTimeout = (callback, ms, ...args) => {
            // Hold transition completion so CI scheduling cannot finish it before the reversal.
            if (ms === 315) {
                const id = -1 - window.testState.completions.size;
                window.testState.timers.set(id, ms);
                window.testState.completions.set(id, () => callback(...args));
                return id;
            }
            let id;
            id = nativeSetTimeout(() => {
                window.testState.timers.delete(id);
                callback(...args);
            }, ms);
            window.testState.timers.set(id, ms);
            return id;
        };
        window.clearTimeout = id => {
            if (window.testState.timers.get(id) === 315) window.testState.clearedTransitionTimers++;
            window.testState.timers.delete(id);
            window.testState.completions.delete(id);
            nativeClearTimeout(id);
        };
        class Socket extends window.EventTarget {
            static OPEN = 1;
            readyState = 1;
            send() {}
            close() {}
            constructor() { super(); window.testState.socket = this; }
        }
        window.WebSocket = Socket;
        window.testState.message = (type, data) => window.testState.socket.dispatchEvent(
            new window.MessageEvent('message', { data: JSON.stringify({ type, data }) })
        );
    });
    await transitionPage.addScriptTag({ url: `${origin}/js/overlay-shared.js` });
    await transitionPage.addScriptTag({ url: `${origin}/js/overlay-runtime.js` });
    await transitionPage.waitForFunction(() => document.querySelector('[data-element-id="moving-label"]'));
    await transitionPage.bringToFront();
    const switchState = async id => {
        await transitionPage.evaluate(id => {
            window.testState.message('custom-overlay-page', { id: 'transition-fixture', page: id });
        }, id);
        try {
            await transitionPage.waitForFunction(() => window.testState.completions.size > 0, { polling: 'mutation', timeout: 5000 });
        } catch (error) {
            const details = await transitionPage.evaluate(() => ({
                timers: [...window.testState.timers.values()],
                completions: [...window.testState.completions.keys()],
                completionSize: window.testState.completions.size,
                left: document.querySelector('[data-element-id="moving-label"]')?.style.left,
                hidden: document.hidden
            }));
            throw new Error(`${error.message}: ${JSON.stringify(details)}`);
        }
    };
    const stableTransitionState = async () => {
        return transitionPage.evaluate(() => {
            for (const [id, finish] of window.testState.completions) {
                window.testState.timers.delete(id);
                window.testState.completions.delete(id);
                finish();
            }
            const get = id => document.querySelector(`[data-element-id="${id}"]`);
            const label = get('moving-label');
            const visibility = get('visibility-label');
            const mask = document.getElementById('overlay-masked-layer');
            let maskSvg = '';
            try {
                const encoded = mask?._lastMaskUrl?.match(/data:image\/svg\+xml;charset=utf-8,([^)"]+)/)?.[1];
                if (encoded) maskSvg = decodeURIComponent(encoded);
            } catch {}
            return {
                left: label?.style.left,
                opacity: label?.style.opacity,
                transition: label?.style.transition,
                visibility: visibility?.style.visibility,
                ghosts: [...document.querySelectorAll('[data-element-id]')].filter(node => node._isGhost).length,
                ownA: Boolean(get('own-a')),
                ownB: Boolean(get('own-b')),
                ownC: Boolean(get('own-c')),
                maskSvg,
                activeTransitionTimers: [...window.testState.timers.values()].filter(ms => ms === 315).length,
                clearedTransitionTimers: window.testState.clearedTransitionTimers
            };
        });
    };
    await switchState('b');
    (await initialSnapshot)();
    await transitionPage.waitForFunction(() => window.testState.snapshotRead);
    assert.equal(await transitionPage.$eval('[data-element-id="moving-label"]', node => node.style.left), '240px',
        'a late initial page snapshot must not undo a newer live state switch');
    await switchState('a');
    const reversed = await stableTransitionState();
    assert.equal(reversed.left, '20px', 'A→B→A reversal must settle at A position');
    assert.equal(reversed.opacity, '0.9', 'A→B→A reversal must settle at A opacity');
    assert.equal(reversed.visibility, '', 'A→B→A reversal must restore the visible state override');
    assert.equal(reversed.ghosts, 0, 'A→B→A reversal must remove transition ghosts');
    assert.equal(reversed.transition, '', 'A→B→A reversal must clear transition styles and timers');
    assert.equal(reversed.ownA, true);
    assert.equal(reversed.ownB, false, 'superseded B-only elements must be removed after reversal');
    assert.ok(reversed.maskSvg.includes('M 20 160 H 120 V 230 H 20 Z'), 'cutout mask must return to state A geometry after reversal');
    assert.equal(reversed.activeTransitionTimers, 0, 'A→B→A must clear all transition completion timers');
    assert.ok(reversed.clearedTransitionTimers > 0, 'A→B→A must cancel the superseded transition timer');
    await switchState('b');
    await switchState('c');
    const advanced = await stableTransitionState();
    assert.equal(advanced.left, '420px', 'A→B→C sequence must settle at C position');
    assert.equal(advanced.opacity, '0.7', 'A→B→C sequence must settle at C opacity');
    assert.equal(advanced.visibility, '', 'C visibility override must be restored');
    assert.equal(advanced.ghosts, 0, 'A→B→C sequence must remove stale ghosts');
    assert.equal(advanced.transition, '', 'A→B→C sequence must clear transition styles and timers');
    assert.equal(advanced.ownA, false, 'stale A-only elements must be removed');
    assert.equal(advanced.ownB, false, 'superseded B-only elements must be removed');
    assert.equal(advanced.ownC, true);
    assert.ok(advanced.maskSvg.includes('M 360 160 H 540 V 230 H 360 Z'), 'cutout mask must settle at state C geometry');
    assert.equal(advanced.activeTransitionTimers, 0, 'A→B→C must clear all transition completion timers');

    await page.bringToFront();
    // Scene States Morph & 60fps Cutout Interpolation + Zero-Idle-Cost cleanup test
    const morphOverlay = {
        ...clone(overlay),
        pages: {
            enabled: true,
            kind: 'states',
            transition: 'morph',
            transitionEasing: 'smooth',
            transitionMs: 120,
            items: [
                { id: 'state-1', name: 'Gameplay' },
                { id: 'state-2', name: 'Intermission' }
            ]
        },
        elements: [
            {
                id: 'cam-cutout',
                type: 'cutout',
                page: '*',
                x: 40,
                y: 40,
                width: 480,
                height: 270,
                zIndex: 10,
                style: { borderRadius: 12, borderWidth: 3, borderColor: '#38bdf8' },
                cutout: { shape: 'rectangle', feather: 0 },
                pageStates: {
                    'state-2': { x: 640, y: 180, width: 640, height: 360, borderRadius: 24, feather: 4 }
                }
            },
            {
                id: 'cam-label',
                type: 'text',
                page: '*',
                content: 'HOST CAM',
                x: 40,
                y: 320,
                width: 200,
                height: 40,
                zIndex: 11,
                style: { opacity: 1, rotate: 0 },
                pageStates: {
                    'state-2': { x: 640, y: 550, width: 300, height: 48, opacity: 0.85, rotate: -4 }
                }
            },
            {
                id: 'hide-on-intermission',
                type: 'text',
                page: '*',
                content: 'FICTIONAL HIDDEN LABEL',
                x: 40,
                y: 280,
                width: 220,
                height: 32,
                pageStates: { 'state-2': { visible: false } }
            }
        ]
    };
    await update(morphOverlay);
    await page.waitForFunction(() => document.querySelector('[data-element-id="cam-label"]'));
    await page.evaluate(() => window.testState.message('custom-overlay-page', { id: 'fixture', page: 'state-2' }));
    await new Promise(done => setTimeout(done, 100));
    const exitNodes = await page.$$eval('[data-element-id="hide-on-intermission"]', nodes => nodes.map(node => ({
        ghost: node._isGhost,
        visibility: node.style.visibility
    })));
    assert.ok(exitNodes.some(node => !node.ghost && node.visibility === 'hidden'), 'shared exit must hide original node while its ghost exits');
    const hiddenDuringExit = await page.$eval('[data-element-id="hide-on-intermission"]', node => ({
        visibility: node.style.visibility,
        opacity: node.style.opacity
    }));
    assert.ok(
        hiddenDuringExit.visibility === 'hidden' || Number(hiddenDuringExit.opacity) === 0,
        'a disappearing shared state element must not remain visible underneath its outgoing ghost'
    );
    await page.waitForFunction(() => {
        const label = document.querySelector('[data-element-id="cam-label"]');
        return label && label.style.left === '640px' && label.style.willChange === '';
    }, { timeout: 2000 });
    const afterMorphState = await page.evaluate(() => {
        const label = document.querySelector('[data-element-id="cam-label"]');
        const cutout = document.querySelector('[data-element-id="cam-cutout"]');
        const masked = document.getElementById('overlay-masked-layer');
        return {
            labelLeft: label?.style.left,
            labelTop: label?.style.top,
            labelWidth: label?.style.width,
            labelRotate: label?.style.transform,
            labelWillChange: label?.style.willChange,
            labelTransition: label?.style.transition,
            cutoutLeft: cutout?.style.left,
            cutoutWidth: cutout?.style.width,
            cutoutRadius: cutout?.style.borderRadius,
            hiddenVisibility: document.querySelector('[data-element-id="hide-on-intermission"]')?.style.visibility,
            hasMask: Boolean(masked?.style.getPropertyValue('mask-image') || masked?.style.getPropertyValue('-webkit-mask-image'))
        };
    });
    assert.equal(afterMorphState.labelLeft, '640px', 'morphed shared text must settle at state-2 X override');
    assert.equal(afterMorphState.labelTop, '550px', 'morphed shared text must settle at state-2 Y override');
    assert.equal(afterMorphState.labelWidth, '300px', 'morphed shared text must settle at state-2 Width override');
    assert.equal(afterMorphState.labelRotate, 'rotate(-4deg)', 'morphed shared text must settle at state-2 Rotate override');
    assert.equal(afterMorphState.labelWillChange, '', 'will-change must be stripped after morph completion for zero idle overhead');
    assert.equal(afterMorphState.labelTransition, '', 'transition property must be stripped after morph completion');
    assert.equal(afterMorphState.cutoutLeft, '640px', 'morphed cutout border must settle at state-2 X override');
    assert.equal(afterMorphState.cutoutWidth, '640px', 'morphed cutout border must settle at state-2 Width override');
    assert.equal(afterMorphState.cutoutRadius, '24px', 'morphed cutout border must settle at state-2 borderRadius override');
    assert.equal(afterMorphState.hiddenVisibility, 'hidden', 'a hidden state override must remain hidden after its exit animation');
    assert.equal(afterMorphState.hasMask, true, 'underlayer cutout SVG mask must remain active after state morph');

    const instantEnterExit = {
        ...clone(overlay),
        pages: {
            enabled: true,
            kind: 'states',
            transition: 'morph',
            enterExit: 'none',
            transitionMs: 300,
            items: [{ id: 'base', name: 'Base' }, { id: 'next', name: 'Next' }]
        },
        elements: [
            { id: 'base-label', type: 'text', page: 'base', content: 'BASE', x: 0, y: 0, width: 120, height: 32 },
            { id: 'next-label', type: 'text', page: 'next', content: 'NEXT', x: 0, y: 0, width: 120, height: 32 },
            {
                id: 'shared-morph', type: 'text', page: '*', content: 'SHARED STATE',
                x: 10, y: 80, width: 160, height: 32,
                pageStates: { next: { x: 250, opacity: 0.6 } }
            }
        ]
    };
    await update(instantEnterExit);
    await page.evaluate(() => window.testState.message('custom-overlay-page', { id: 'fixture', page: 'next' }));
    await page.waitForFunction(() => {
        const node = document.querySelector('[data-element-id="next-label"]');
        return node && node.style.visibility !== 'hidden';
    }, { timeout: 2000 });
    assert.equal(
        await page.$eval('[data-element-id="next-label"]', node => node.style.animationName),
        '',
        'morph transitions configured with Instant Cut must not animate page-specific entrance elements'
    );
    await page.waitForFunction(() => {
        const node = document.querySelector('[data-element-id="shared-morph"]');
        return node && getComputedStyle(node).left !== '10px';
    }, { timeout: 1000 });
    await page.waitForFunction(() => {
        const node = document.querySelector('[data-element-id="shared-morph"]');
        return node && node.style.left === '250px' && node.style.transition === '';
    }, { timeout: 2000 });
    await new Promise(done => setTimeout(done, 350));

    await update({
        ...clone(overlay),
        pages: { enabled: true, kind: 'pages', transition: 'morph', transitionMs: 1500,
            items: [{ id: 'a', name: 'First' }, { id: 'b', name: 'Second' }] },
        elements: [
            { id: 'page-a', type: 'text', page: 'a', content: 'First page', x: 10, y: 10 },
            { id: 'page-b', type: 'text', page: 'b', content: 'Second page', x: 200, y: 40 }
        ]
    });
    const simplePage = await page.evaluate(() => {
        window.testState.message('custom-overlay-page', { id: 'fixture', page: 'b' });
        const target = document.querySelector('[data-element-id="page-b"]');
        return {
            outgoing: Boolean(document.querySelector('[data-element-id="page-a"]')),
            target: Boolean(target),
            animation: target?.style.animation,
            transition: target?.style.transition,
            visibility: target?.style.visibility,
            ghosts: [...document.querySelectorAll('[data-element-id]')].filter(node => node._isGhost).length
        };
    });
    assert.deepEqual(simplePage, { outgoing: false, target: true, animation: '', transition: '', visibility: '', ghosts: 0 },
        'Pages cut synchronously without morphing, entrance animations, or outgoing ghosts');

    const editorPage = await browser.newPage();
    await editorPage.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    editorPage.on('pageerror', error => errors.push(error.message));
    await editorPage.setRequestInterception(true);
    editorPage.on('request', request => {
        if (new URL(request.url()).origin === origin) request.continue();
        else request.respond({ status: 200, contentType: 'text/css', body: '' });
    });
    await editorPage.goto(`${origin}/?editor-preview-fixture`);
    await editorPage.setContent('<link rel="stylesheet" href="/css/custom-overlay-editor.css"><div id="stage"><div id="canvas"><div id="canvas-underlayer"></div></div></div>');
    await editorPage.evaluate(async () => {
        window.OverlayShared = { pruneSourceCaches() {} };
        const editorState = await import('/js/editor/editor-state.js');
        const canvas = await import('/js/editor/editor-canvas.js');
        const stage = document.getElementById('stage');
        const element = {
            id: 'preview-label', type: 'text', page: '*', content: 'FICTIONAL PREVIEW',
            x: 30, y: 40, width: 140, height: 36, visible: true, style: { opacity: 1 }
        };
        const node = document.createElement('div');
        node.dataset.elementId = element.id;
        node.textContent = element.content;
        node.style.position = 'absolute';
        stage.appendChild(node);
        Object.assign(editorState.state, {
            curPage: 'a',
            stageEl: stage,
            overlay: {
                id: 'editor-preview-fixture',
                canvas: { width: 640, height: 360, background: 'transparent' },
                pages: {
                    enabled: true,
                    kind: 'states',
                    mode: 'manual',
                    items: [{ id: 'a' }, { id: 'b' }],
                    transition: 'morph',
                    transitionMs: 160,
                    transitionDirection: 'left',
                    transitionDistance: 60
                },
                elements: [element]
            }
        });
        editorState.state.nodes = new Map([[element.id, node]]);
        window.editorPreviewFixture = {
            state: editorState.state,
            canvas,
            element,
            node,
            stage,
            run(transition) {
                canvas.cancelEditorStateMorph();
                stage.replaceChildren(node);
                node.className = '';
                node.style.cssText = 'position:absolute;left:30px;top:40px;width:140px;height:36px;opacity:1';
                element.x = 30;
                element.y = 40;
                element.style = { opacity: 1 };
                this.state.curPage = 'a';
                const before = canvas.captureEditorStateSnapshot();
                element.x = 230;
                element.style = { opacity: 0.5 };
                this.state.curPage = 'b';
                canvas.previewEditorTransition(before, {
                    prevPage: 'a',
                    nextPage: 'b',
                    transition,
                    durationMs: 160,
                    direction: 'left',
                    distance: 60,
                    easing: 'linear'
                });
            }
        };
        const nativeTimeout = window.setTimeout.bind(window);
        const nativeClear = window.clearTimeout.bind(window);
        window.setTimeout = (callback, ms, ...args) => {
            if (window.editorPreviewFixture.holdCompletion && ms === 200) {
                window.editorPreviewFixture.finish = () => callback(...args);
                return 1000000000;
            }
            return nativeTimeout(callback, ms, ...args);
        };
        window.clearTimeout = id => {
            if (id === 1000000000) window.editorPreviewFixture.finish = null;
            else nativeClear(id);
        };
    });
    await editorPage.bringToFront();

    const morphPreview = await editorPage.evaluate(async () => {
        await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
        window.editorPreviewFixture.holdCompletion = true;
        window.editorPreviewFixture.run('morph');
        const { node, stage } = window.editorPreviewFixture;
        const animations = node.getAnimations();
        for (const animation of animations) {
            animation.pause();
        }
        await Promise.all(animations.map(animation => animation.ready));
        for (const animation of animations) {
            animation.currentTime = 80;
        }
        await new Promise(resolve => window.requestAnimationFrame(resolve));
        return {
            transition: node.style.transition,
            ghosts: stage.querySelectorAll('[id^="ghost-"]').length,
            start: getComputedStyle(node).left,
            opacity: getComputedStyle(node).opacity,
            animations: animations.length,
            durations: animations.map(animation => animation.effect.getTiming().duration)
        };
    });
    assert.ok(morphPreview.transition.includes('left 160ms'), 'editor morph preview must use the runtime transition duration and animate geometry');
    assert.equal(morphPreview.ghosts, 0, 'morph preview must move the shared element in place');
    const morphLeft = Number.parseFloat(morphPreview.start);
    const morphOpacity = Number.parseFloat(morphPreview.opacity);
    assert.ok(morphLeft > 30 && morphLeft < 230, `morph preview must interpolate from captured geometry toward the target: ${JSON.stringify(morphPreview)}`);
    assert.ok(morphOpacity < 1 && morphOpacity > 0.5, 'morph preview must interpolate style opacity with position');
    assert.ok(morphPreview.animations >= 2, 'native position and opacity transitions must both run');
    await editorPage.evaluate(() => {
        window.editorPreviewFixture.holdCompletion = false;
        window.editorPreviewFixture.finish();
    });
    await editorPage.waitForFunction(() => window.editorPreviewFixture.node.style.transition === '', { polling: 50 });
    assert.deepEqual(await editorPage.evaluate(() => {
        const { node } = window.editorPreviewFixture;
        return { left: node.style.left, opacity: node.style.opacity, transition: node.style.transition, willChange: node.style.willChange };
    }), { left: '230px', opacity: '0.5', transition: '', willChange: '' }, 'morph preview must settle and clear temporary styles');

    await editorPage.evaluate(() => window.editorPreviewFixture.run('fade'));
    const crossfadePreview = await editorPage.evaluate(() => {
        const { node, stage } = window.editorPreviewFixture;
        const ghost = stage.querySelector('#ghost-preview-label');
        return { enter: node.style.animation, exit: ghost?.style.animation, ghostLeft: ghost?.style.left, targetLeft: node.style.left };
    });
    assert.ok(crossfadePreview.enter.includes('pg-fade-in'), 'crossfade preview must fade the target position in');
    assert.ok(crossfadePreview.exit.includes('pg-fade-out'), 'crossfade preview must fade a ghost at the outgoing position');
    assert.equal(crossfadePreview.ghostLeft, '30px');
    assert.equal(crossfadePreview.targetLeft, '230px');
    await new Promise(done => setTimeout(done, 240));
    assert.equal(await editorPage.$('#ghost-preview-label'), null, 'crossfade preview must remove its outgoing ghost');

    await editorPage.evaluate(() => window.editorPreviewFixture.run('slide'));
    const slidePreview = await editorPage.evaluate(() => {
        const { node, stage } = window.editorPreviewFixture;
        const ghost = stage.querySelector('#ghost-preview-label');
        return {
            enter: node.style.animation,
            exit: ghost?.style.animation,
            enterX: node.style.getPropertyValue('--pg-x'),
            exitX: ghost?.style.getPropertyValue('--pg-x')
        };
    });
    assert.ok(slidePreview.enter.includes('pg-slide-in'), 'slide preview must animate the target position in');
    assert.ok(slidePreview.exit.includes('pg-slide-out'), 'slide preview must animate a ghost from the outgoing position');
    assert.equal(slidePreview.enterX, '60px');
    assert.equal(slidePreview.exitX, '60px');
    await new Promise(done => setTimeout(done, 240));
    assert.equal(await editorPage.$('#ghost-preview-label'), null, 'slide preview must remove its outgoing ghost');

    await editorPage.evaluate(() => {
        const fixture = window.editorPreviewFixture;
        fixture.runExit = function (enterExit, paired = false) {
            this.canvas.cancelEditorStateMorph();
            this.stage.querySelectorAll('[id^="ghost-"]').forEach(node => node.remove());
            this.stage.replaceChildren(this.canvas.canvasEl);
            this.state.curPage = 'b';
            this.state.overlay.elements = [{
                id: 'state-two-shape', type: 'shape', page: 'b', morphId: 'paired-shape',
                x: 70, y: 80, width: 120, height: 60, visible: true, style: { opacity: 1 }
            }];
            if (paired) this.state.overlay.elements.push({
                id: 'state-one-shape', type: 'shape', page: 'a', morphId: 'paired-shape',
                x: 170, y: 80, width: 120, height: 60, visible: true, style: { opacity: 1 }
            });
            const changedIds = new Set(['state-two-shape', 'state-one-shape']);
            this.canvas.renderCanvas(changedIds);
            if (!this.state.nodes.get('state-two-shape')?.isConnected) throw new Error('renderer must mount the outgoing layer before snapshot capture');
            const before = this.canvas.captureEditorStateSnapshot();
            this.state.curPage = 'a';
            this.canvas.renderCanvas(changedIds);
            this.canvas.previewEditorTransition(before, {
                prevPage: 'b', nextPage: 'a', transition: 'morph',
                enterExit, durationMs: 240, easing: 'linear'
            });
        };
        fixture.runExit('fade');
    });
    const reverseExit = await editorPage.$eval('#ghost-state-two-shape', node => ({
        animation: node.style.animation, opacity: getComputedStyle(node).opacity
    }));
    assert.ok(reverseExit.animation.includes('pg-fade-out'), 'State 2-only layers must crossfade out after the real canvas unmounts them on return to State 1');
    await new Promise(done => setTimeout(done, 80));
    const fadingOpacity = await editorPage.$eval('#ghost-state-two-shape', node => Number(getComputedStyle(node).opacity));
    assert.ok(fadingOpacity > 0 && fadingOpacity < 1, 'reverse exit must visibly fade rather than instantly disappear');
    await new Promise(done => setTimeout(done, 240));
    assert.equal(await editorPage.$('#ghost-state-two-shape'), null, 'reverse exit ghost must be removed after the crossfade');
    await editorPage.evaluate(() => window.editorPreviewFixture.runExit('zoom'));
    assert.ok((await editorPage.$eval('#ghost-state-two-shape', node => node.style.animation)).includes('pg-zoom-out'), 'saved zoom enter/exit settings must also animate State 2 to State 1');
    await editorPage.evaluate(() => window.editorPreviewFixture.canvas.cancelEditorStateMorph());
    assert.equal(await editorPage.$('#ghost-state-two-shape'), null, 'cancelling a reverse exit must remove its ghost');
    await editorPage.evaluate(() => window.editorPreviewFixture.runExit('none'));
    assert.equal(await editorPage.$('#ghost-state-two-shape'), null, 'Instant Cut must not retain an outgoing ghost');
    const pairedStart = await editorPage.evaluate(() => {
        window.editorPreviewFixture.runExit('fade', true);
        return getComputedStyle(window.editorPreviewFixture.state.nodes.get('state-one-shape')).left;
    });
    assert.equal(await editorPage.$('#ghost-state-two-shape'), null, 'paired page-specific layers must morph without a duplicate outgoing exit');
    assert.equal(pairedStart, '70px', 'paired incoming layer must start at the outgoing position');
    await new Promise(done => setTimeout(done, 320));
    assert.equal(await editorPage.$eval('[data-id="state-one-shape"]', node => node.style.left), '170px', 'paired incoming layer must finish at its target position');

    assert.deepEqual(errors, []);
    console.log('Overlay runtime and editor preview regression tests passed.');
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
    await rm(profile, { recursive: true, force: true });
}
