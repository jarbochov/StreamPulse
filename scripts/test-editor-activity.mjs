import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

// Only these source files and fictional assets are served; no application/config/data access.
const sources = new Map(await Promise.all([
    'overlay-shared.js', 'overlay-filters.js', 'overlay-retro.js',
    'editor/editor-state.js', 'editor/editor-canvas.js'
].map(async name => [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')])));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#38bdf8"/></svg>';
const assets = ['fictional-one.svg', 'fictional-two.svg'].map(name => ({ name, kind: 'image', url: `/${name}` }));
const unexpected = [];
const heldAssets = new Set();
const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://fictional.local'), path = url.pathname;
    if (sources.has(path)) {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(sources.get(path));
    } else if (path === '/api/asset-library') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(url.searchParams.get('names') === 'fictional-delayed.svg'
            ? [{ name: 'fictional-delayed.svg', kind: 'image', url: '/fictional-delayed.svg' }] : assets));
    } else if (path === '/fictional-delayed.svg') {
        response.setHeader('Content-Type', 'image/svg+xml');
        heldAssets.add(response);
    } else if (assets.some(asset => asset.url === path)) {
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end(svg);
    } else if (path === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><style>
            .canvas-element{position:absolute}.canvas-element video{width:100%;height:100%}
            #canvas-underlayer,#canvas-toplayer{position:absolute;width:640px;height:360px}
            </style><div id="stage"><div id="world"><div id="canvas">
            <div id="canvas-underlayer"></div><div id="canvas-toplayer"></div>
            </div><div id="ui"></div></div></div>`);
    } else if (path === '/favicon.ico') { response.writeHead(204); response.end(); }
    else { unexpected.push(path); response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(`scripts/.editor-activity-browser-${process.pid}`);
let browser;
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (new URL(request.url()).origin === origin || request.url().startsWith('blob:')) request.continue();
        else {
            unexpected.push(request.url());
            request.abort();
        }
    });
    await page.goto(origin);
    // A real, silent synthetic movie: assertions below observe native currentTime/paused.
    await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const stream = canvas.captureStream(20);
        const audio = new window.AudioContext();
        const destination = audio.createMediaStreamDestination();
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        const recorder = new window.MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
        const chunks = [];
        recorder.ondataavailable = event => chunks.push(event.data);
        const done = new Promise(resolve => { recorder.onstop = resolve; });
        const timer = window.setInterval(() => {
            ctx.fillStyle = `hsl(${Date.now() % 360} 80% 50%)`;
            ctx.fillRect(0, 0, 32, 32);
        }, 50);
        recorder.start();
        await new Promise(resolve => window.setTimeout(resolve, 1400));
        recorder.stop();
        await done;
        window.clearInterval(timer);
        stream.getTracks().forEach(track => track.stop());
        oscillator.stop();
        await audio.close();
        window.movie = URL.createObjectURL(new window.Blob(chunks, { type: 'video/webm' }));
    });
    await page.evaluate(() => {
        const activity = window.activity = { timers: new Map(), rafs: new Map(), calls: {}, slides: {}, retired: [] };
        for (const [start, stop] of [['setTimeout', 'clearTimeout'], ['setInterval', 'clearInterval']]) {
            const schedule = window[start].bind(window), cancel = window[stop].bind(window);
            window[start] = (callback, ms, ...args) => {
                const id = schedule(() => {
                    if (start === 'setTimeout') activity.timers.delete(id);
                    callback(...args);
                }, ms);
                activity.timers.set(id, { start, ms });
                return id;
            };
            window[stop] = id => { activity.timers.delete(id); return cancel(id); };
        }
        const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => {
            const id = raf(now => {
                activity.rafs.delete(id);
                activity.calls[callback.name] = (activity.calls[callback.name] || 0) + 1;
                callback(now);
            });
            activity.rafs.set(id, callback.name);
            return id;
        };
        window.cancelAnimationFrame = id => { activity.rafs.delete(id); cancel(id); };
        for (const [proto, method] of [
            [window.CanvasRenderingContext2D.prototype, 'clearRect'],
            [window.WebGLRenderingContext.prototype, 'drawArrays'],
            [window.WebGL2RenderingContext.prototype, 'drawArrays']
        ]) {
            const draw = proto[method];
            proto[method] = function(...args) {
                this.canvas._draws = (this.canvas._draws || 0) + 1;
                return draw.apply(this, args);
            };
        }
    });
    for (const name of ['overlay-shared.js', 'overlay-retro.js', 'overlay-filters.js']) {
        await page.addScriptTag({ url: `${origin}/js/${name}` });
    }
    await page.evaluate(async () => {
        const mount = window.OverlayShared.mountSlideshow;
        window.OverlayShared.mountSlideshow = (node, element, options) => mount(node, element, {
            ...options, onState: () => {
                window.activity.slides[element.id] = (window.activity.slides[element.id] || 0) + 1;
            }
        });
        const { state, prefs } = await import('/js/editor/editor-state.js');
        const { renderCanvas, unlockMediaAudio } = await import('/js/editor/editor-canvas.js');
        const element = (id, type, page, extra = {}) => ({
            id, type, page, x: 0, y: 0, width: 96, height: 64,
            style: { fontFamily: 'sans-serif', fontSize: 16, background: '#18283a', objectFit: 'cover' },
            ...extra
        });
        const elements = [];
        for (const page of ['a', 'b', '*']) {
            const prefix = page === '*' ? 'common' : page;
            elements.push(
                element(`${prefix}-video`, 'video', page, { src: window.movie, video: { autoplay: true, sound: true } }),
                element(`${prefix}-manual`, 'video', page, { src: window.movie, video: { autoplay: false, sound: true } }),
                element(`${prefix}-pattern`, 'pattern', page, { pattern: { motion: 'scroll', tileSize: 24, speed: 1 } }),
                element(`${prefix}-retro`, 'shape', page, { mediaFilter: { retro: { static: true } } }),
                element(`${prefix}-duotone`, 'shape', page, { mediaFilter: { duotone: {
                    enabled: true, dark: '#001122', light: '#88bbff', animate: 'hue', speed: 1
                } } }),
                element(`${prefix}-slides`, 'slideshow', page, { slideshow: {
                    source: 'tags', tags: ['fictional'], seconds: 0.15,
                    transition: 'fade', transitionMs: 50, kenBurns: true
                } })
            );
        }
        state.overlay = { id: 'fictional-editor', canvas: { width: 640, height: 360 }, pages: { enabled: true }, elements };
        state.curPage = 'a';
        prefs.fx = true;
        window.fixture = { state, prefs, renderCanvas, unlockMediaAudio, element };
        renderCanvas();
    });
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const snapshot = () => page.evaluate(() => {
        const { state } = window.fixture;
        const values = {};
        for (const [id, node] of state.nodes) {
            const video = node.querySelector(':scope > video');
            values[id] = {
                draws: node.querySelector('canvas')?._draws || 0,
                fxTime: node._fxAnim?.last || 0,
                slide: node._slideHandle?.snapshot(),
                time: video?.currentTime, paused: video?.paused,
                muted: video?.muted, volume: video?.volume
            };
        }
        return {
            values, timers: window.activity.timers.size, rafs: window.activity.rafs.size,
            calls: { ...window.activity.calls }, slides: { ...window.activity.slides }
        };
    });
    const switchPage = value => page.evaluate(value => {
        const { state, renderCanvas } = window.fixture;
        for (const [id, node] of state.nodes) {
            if (id.startsWith(`${state.curPage}-`)) {
                window.activity.retired.push({
                    node, video: node.querySelector('video'), canvas: node.querySelector('canvas'),
                    filter: node._fxId && document.getElementById(node._fxId)
                });
            }
        }
        state.curPage = value;
        renderCanvas();
    }, value);
    await page.waitForFunction(() => {
        const nodes = window.fixture.state.nodes;
        return nodes.get('a-video')?.querySelector('video')?.currentTime > 0.1 &&
            nodes.get('a-retro')?._retroCanvas?._draws > 1 &&
            nodes.get('a-pattern')?.querySelector('canvas')?._draws > 1 &&
            nodes.get('a-slides')?._slideHandle?.snapshot().item;
    });
    const initial = await snapshot();
    assert.equal(Object.keys(initial.values).length, 12, 'only active/common layers may mount');
    assert.ok(!Object.keys(initial.values).some(id => id.startsWith('b-')));
    await wait(240);
    const running = await snapshot();
    for (const prefix of ['a', 'common']) {
        assert.ok(running.values[`${prefix}-pattern`].draws > initial.values[`${prefix}-pattern`].draws);
        assert.ok(running.values[`${prefix}-retro`].draws > initial.values[`${prefix}-retro`].draws);
        assert.ok(running.values[`${prefix}-duotone`].fxTime > initial.values[`${prefix}-duotone`].fxTime);
        assert.ok(running.slides[`${prefix}-slides`] > initial.slides[`${prefix}-slides`], 'active/common slideshows must advance');
        assert.equal(running.values[`${prefix}-manual`].paused, true);
    }
    await page.evaluate(() => {
        const { state, unlockMediaAudio, renderCanvas } = window.fixture;
        const video = state.nodes.get('a-video').querySelector('video');
        video.pause(); video.muted = true; video.volume = 0.37;
        state.nodes.get('a-slides')._slideHandle.control('pause');
        state.selectedIds.add('common-pattern');
        window.activity.common = state.nodes.get('common-video');
        unlockMediaAudio();
        renderCanvas();
    });
    const paused = await snapshot();
    assert.equal(paused.values['a-video'].paused, true, 'audio unlock/render must not start deliberately paused videos');
    await switchPage('b');
    await page.waitForFunction(() => window.fixture.state.nodes.get('b-video').querySelector('video').currentTime > 0.05);
    const retiredBefore = await page.evaluate(() => window.activity.retired.map(({ video, canvas }) => ({
        time: video?.currentTime, draws: canvas?._draws || 0
    })));
    await wait(220);
    assert.deepEqual(await page.evaluate(() => window.activity.retired.map(({ video, canvas }) => ({
        time: video?.currentTime, draws: canvas?._draws || 0
    }))), retiredBefore, 'unmounted video/pattern/retro work must not advance');
    assert.equal((await snapshot()).slides['a-slides'], paused.slides['a-slides'], 'inactive slideshow must not emit state');
    assert.equal(await page.evaluate(() => window.activity.retired.every(({ node, video, filter }) =>
        !node.isConnected && (!video || (video.paused && !video.getAttribute('src'))) &&
        !node._slideHandle && !node._fxAnim && !node._retroRecord && !filter?.isConnected)), true);
    assert.equal(await page.evaluate(() => window.fixture.state.nodes.get('common-video') === window.activity.common), true);
    await switchPage('a');
    await page.waitForFunction(() => window.fixture.state.nodes.get('a-video').querySelector('video').readyState >= 2);
    const revisited = await snapshot();
    assert.equal(revisited.values['a-video'].paused, true);
    assert.equal(revisited.values['a-video'].muted, true);
    assert.equal(revisited.values['a-video'].volume, 0.37);
    assert.ok(Math.abs(revisited.values['a-video'].time - paused.values['a-video'].time) < 0.1);
    assert.deepEqual(revisited.values['a-slides'].slide, paused.values['a-slides'].slide);
    assert.equal(await page.evaluate(() => window.fixture.state.selectedIds.has('common-pattern')), true);
    await page.evaluate(() => {
        const { state } = window.fixture;
        state.nodes.get('a-video').querySelector('video').play();
        state.nodes.get('a-slides')._slideHandle.control('play');
        window.OverlayShared.setEffectsPaused(true);
    });
    await wait(100);
    const effectsOff = await snapshot();
    await wait(220);
    const stillOff = await snapshot();
    assert.deepEqual(stillOff.calls, effectsOff.calls, 'Effects off must stop all pattern/duotone/retro RAF callbacks');
    assert.equal(stillOff.rafs, 0);
    assert.notEqual(stillOff.values['a-video'].time, effectsOff.values['a-video'].time, 'Effects must not pause media');
    await switchPage('b');
    await wait(100);
    const offAfterSwitch = await snapshot();
    await wait(120);
    assert.deepEqual((await snapshot()).calls, offAfterSwitch.calls, 'page activation must honor Effects off');
    await page.evaluate(() => window.OverlayShared.setEffectsPaused(false));
    await page.waitForFunction(() => window.fixture.state.nodes.get('b-pattern').querySelector('canvas')._draws > 1);
    for (let i = 0; i < 4; i++) {
        await switchPage(i % 2 ? 'b' : 'a');
        await wait(200);
    }
    const repeated = await snapshot();
    assert.equal(repeated.rafs, initial.rafs, 'page revisits must not accumulate RAF chains');
    assert.ok(repeated.timers <= initial.timers + 2, 'page revisits must not accumulate slideshow timers');
    await page.evaluate(async () => {
        const { state, renderCanvas } = window.fixture;
        const video = state.nodes.get('b-video').querySelector('video');
        video.currentTime = 0.4;
        await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
        state.nodes.get('b-manual').querySelector('video').play();
    });
    await switchPage('a');
    await switchPage('b');
    await page.waitForFunction(() => {
        const { state } = window.fixture;
        return state.nodes.get('b-video').querySelector('video').currentTime >= 0.4 &&
            !state.nodes.get('b-manual').querySelector('video').paused;
    });
    await page.evaluate(() => {
        const { state, renderCanvas } = window.fixture;
        state.overlay.elements.find(element => element.id === 'b-video').visible = false;
        renderCanvas(new Set(['b-video']));
    });
    assert.equal(await page.evaluate(() => window.fixture.state.nodes.has('b-video')), false, 'hidden layers must release media even during partial renders');
    await page.evaluate(() => {
        const { state, renderCanvas } = window.fixture;
        state.overlay.elements = [];
        renderCanvas();
    });
    await wait(120);
    const removed = await snapshot();
    await wait(220);
    const cleaned = await snapshot();
    assert.equal(Object.keys(cleaned.values).length, 0);
    assert.equal(cleaned.timers, 0, 'removal must cancel slideshow/alert/transition timers');
    assert.equal(cleaned.rafs, 0, 'removal must cancel effect RAF chains');
    assert.deepEqual(cleaned.calls, removed.calls);
    await page.evaluate(() => {
        const { state, renderCanvas, element } = window.fixture;
        state.overlay.elements = [
            element('delayed-slides', 'slideshow', 'b', {
                slideshow: { source: 'manual', files: ['fictional-delayed.svg'], seconds: 0.1 }
            }),
            element('delayed-retro', 'image', 'b', { src: '/fictional-delayed.svg', mediaFilter: { retro: { static: true } } }),
            element('delayed-dither', 'image', 'b', { src: '/fictional-delayed.svg', mediaFilter: { halftone: { mode: 'bayer' } } })
        ];
        renderCanvas();
        renderCanvas();
    });
    await page.waitForFunction(() => window.fixture.state.nodes.get('delayed-retro')._retroMediaWait &&
        window.fixture.state.nodes.get('delayed-dither')._fxMediaWait);
    await page.evaluate(() => {
        const { state, renderCanvas } = window.fixture;
        window.activity.pendingNodes = [...state.nodes.values()];
        state.overlay.elements = [];
        renderCanvas();
    });
    for (const response of heldAssets) response.end(svg);
    heldAssets.clear();
    await wait(160);
    assert.equal(await page.evaluate(() => window.activity.pendingNodes.every(node =>
        !node._retroMediaWait && !node._fxMediaWait && !node._retroRecord && !node._slideHandle)), true);
    const pendingCleaned = await snapshot();
    assert.equal(pendingCleaned.timers, 0, 'late media readiness must not resurrect slideshow work');
    assert.equal(pendingCleaned.rafs, 0, 'late media readiness must not resurrect effect work');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(`Editor activity passed: 18 fictional layers, 12 mounted; ${initial.rafs} active RAF chains, ${cleaned.rafs} after removal; ${cleaned.timers} retained timers. Native video/audio, paused playback, shared layers, slideshow state, Effects and repeated page switches verified.`);
} finally {
    if (browser) await browser.close();
    for (const response of heldAssets) response.end(svg);
    await new Promise(done => server.close(done));
    await rm(profile, { recursive: true, force: true });
}
