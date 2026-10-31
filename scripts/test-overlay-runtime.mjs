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
const sources = new Map(await Promise.all(['overlay-runtime.js', 'overlay-shared.js'].map(async name =>
    [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')]
)));
for (const name of ['overlay-filters.js', 'overlay-retro.js']) {
    sources.set(`/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8'));
}
const clone = value => JSON.parse(JSON.stringify(value));
let statusVersion = 0;
const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.local').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (sources.has(path)) {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(sources.get(path));
    } else if (path === '/api/custom-overlays/fixture') response.end(JSON.stringify(overlay));
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
            }
        ]
    };
    await update(morphOverlay);
    await page.evaluate(() => window.testState.message('custom-overlay-page', { id: 'fixture', page: 'state-2' }));
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
    assert.equal(afterMorphState.hasMask, true, 'underlayer cutout SVG mask must remain active after state morph');

    assert.deepEqual(errors, []);
    console.log('Overlay runtime regression tests passed.');
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
    await rm(profile, { recursive: true, force: true });
}
