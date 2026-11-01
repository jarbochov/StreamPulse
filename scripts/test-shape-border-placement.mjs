import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import overlays from '../server/services/overlays.js';

const { normalizeCustomOverlay, normalizeOverlayElement } = overlays;
const placements = ['inside', 'center', 'outside'];
const geometry = { x: 100, y: 100, width: 160, height: 100 };
const makeFixture = (style = {}, extra = {}, normalize = true) => {
    const raw = {
        id: 'fictional-border', name: 'Fictional border regression',
        canvas: { width: 640, height: 360 },
        pages: {
            enabled: true, kind: 'states', transition: 'morph', transitionMs: 100,
            items: [{ id: 'base', name: 'Base' }, { id: 'center', name: 'Center' }, { id: 'inside', name: 'Inside' }]
        },
        elements: [{
            id: 'frame', type: 'shape', page: '*', ...geometry,
            style: { background: '#0000ff', borderColor: '#ff0000', borderWidth: 12, borderRadius: 24, ...style },
            ...extra
        }]
    };
    return normalize ? normalizeCustomOverlay(raw) : raw;
};
let fixture = makeFixture();
const sources = new Map();
for (const name of ['overlay-shared.js', 'overlay-runtime.js', 'poll-widget.js', 'editor-geometry.js',
    ...['state', 'canvas', 'form', 'layers', 'inspector'].map(name => `editor/editor-${name}.js`)]) {
    sources.set(`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8'));
}
const editorCss = await readFile(new URL('../public/css/custom-overlay-editor.css', import.meta.url), 'utf8');
for (const name of ['overlay-retro.js', 'overlay-filters.js']) {
    sources.set(`/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8'));
}
const liveHtml = await readFile(new URL('../public/overlays/custom-overlay.html', import.meta.url), 'utf8');
const liveCss = liveHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
const unexpected = [];
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://fixture.local').pathname;
    if (req.method !== 'GET') {
        unexpected.push(`${req.method} ${path}`);
        res.writeHead(405); res.end(); return;
    }
    if (sources.has(path)) {
        res.setHeader('Content-Type', 'text/javascript'); res.end(sources.get(path));
    } else if (path === '/editor.css') {
        res.setHeader('Content-Type', 'text/css'); res.end(editorCss);
    } else if (path === '/live' || path === '/editor') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html>${path === '/editor' ? '<link rel="stylesheet" href="/editor.css">' : ''}
            <style>${path === '/live' ? liveCss : ''}
            body{margin:0;background:#fff} #source{position:absolute;left:100px;top:100px;width:160px;height:100px;background:#00ff00}
            #stage{background:#fff} #canvas{position:relative;width:640px;height:360px}
            #properties{position:absolute;left:660px;top:0;width:320px}
            </style>${path === '/live' ? '<div id="source"></div>' : ''}<div id="overlay-root"></div>
            <div id="stage"><div id="canvas">${path === '/editor' ? '<div id="source"></div>' : ''}<div id="canvas-underlayer"></div><div id="canvas-toplayer"></div></div><div id="ui"></div></div>
            <div id="properties"></div>`);
    } else if (path === '/api/custom-overlays/fictional-border') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture));
    } else if (path === '/api/custom-overlays/fictional-border/page') {
        res.setHeader('Content-Type', 'application/json'); res.end('{"page":"base"}');
    } else if (path === '/api/custom-overlays/assets') {
        res.setHeader('Content-Type', 'application/json'); res.end('[]');
    } else if (path.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json'); res.end('{}');
    } else if (path === '/favicon.ico') {
        res.writeHead(204); res.end();
    } else {
        unexpected.push(path); res.writeHead(404); res.end();
    }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(`scripts/.shape-border-browser-${process.pid}`);
let browser;
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox']
    });
    const errors = [];
    const setup = async mode => {
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 400, deviceScaleFactor: 1 });
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (new URL(request.url()).origin === origin || request.url().startsWith('data:')) request.continue();
            else { unexpected.push(request.url()); request.abort(); }
        });
        await page.goto(`${origin}/${mode}?id=fictional-border`);
        await page.addScriptTag({ url: `${origin}/js/overlay-shared.js` });
        await page.addScriptTag({ url: `${origin}/js/poll-widget.js` });
        if (mode === 'live') {
            await page.evaluate(() => {
                window.WebSocket = class extends window.EventTarget {
                    static OPEN = 1;
                    readyState = 1;
                    constructor() { super(); window.fixtureSocket = this; }
                    send() {}
                    close() {}
                };
                window.fixtureMessage = (type, data) => window.fixtureSocket.dispatchEvent(
                    new window.MessageEvent('message', { data: JSON.stringify({ type, data }) }));
            });
            await page.addScriptTag({ url: `${origin}/js/overlay-runtime.js` });
            await page.waitForSelector('[data-element-id="frame"]');
            await page.waitForFunction(() => !!window.fixtureSocket);
        } else {
            await page.evaluate(async () => {
                window.model = await import('/js/editor/editor-state.js');
                window.canvas = await import('/js/editor/editor-canvas.js');
                window.inspector = await import('/js/editor/editor-inspector.js');
                window.inspector.initInspectorEvents();
                window.fixtureRender = fixture => {
                    const { state, normalizeLoaded } = window.model;
                    state.overlay = normalizeLoaded(fixture);
                    state.curPage = 'base';
                    state.selectedIds = new Set();
                    window.canvas.renderCanvas();
                };
            });
            await page.evaluate(fixture => window.fixtureRender(fixture), fixture);
        }
        return page;
    };
    const live = await setup('live');
    const editor = await setup('editor');
    const nodeSelector = mode => mode === 'live' ? '[data-element-id="frame"]' : '.canvas-element[data-id="frame"]';
    const render = async (page, mode, next) => {
        await page.bringToFront();
        fixture = next;
        if (mode === 'live') {
            await page.evaluate(fixture => window.fixtureMessage('custom-overlay-update', { id: fixture.id, overlay: fixture }), fixture);
        } else await page.evaluate(fixture => window.fixtureRender(fixture), fixture);
        await page.waitForFunction((selector, expected) => {
            const node = document.querySelector(selector);
            const ring = node?._borderRing || node?._borderFxRing;
            return ring && ring.style.inset === `${-expected}px`;
        }, {}, nodeSelector(mode), 12 * ({ inside: 0, center: 0.5, outside: 1 }[next.elements[0].style.borderPlacement]
            ?? (next.elements[0].obsLink?.enabled ? 1 : 0)));
        await page.evaluate(() => new Promise(done => window.requestAnimationFrame(() => window.requestAnimationFrame(done))));
    };
    const bounds = async (page, mode, outset) => {
        const actual = await page.$eval(nodeSelector(mode), node => {
            const box = node.getBoundingClientRect();
            const ring = (node._borderRing || node._borderFxRing).getBoundingClientRect();
            return { box: [box.x, box.y, box.width, box.height], ring: [ring.x, ring.y, ring.width, ring.height] };
        });
        assert.deepEqual(actual.box, [100, 100, 160, 100], `${mode}: borders must not change the source transform`);
        assert.deepEqual(actual.ring, [100 - outset, 100 - outset, 160 + outset * 2, 100 + outset * 2], `${mode}: painted ring bounds`);
    };
    const pixels = async page => {
        const png = await page.screenshot({ encoding: 'base64' });
        return page.evaluate(async png => {
            const image = new window.Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
            const red = rgb => rgb[0] > 200 && rgb[1] < 80 && rgb[2] < 80;
            const rows = [];
            for (let y = 80; y < 125; y++) {
                if (Array.from({ length: 60 }, (_, dx) => at(150 + dx, y)).some(red)) rows.push(y);
            }
            return { rows, corner: at(108, 108), outerCorner: at(90, 90), source: at(180, 105), shadow: at(180, 86) };
        }, png);
    };
    const variants = [
        { name: 'solid', style: {} },
        { name: 'gradient', style: { borderGradient: { enabled: true, from: '#ff0000', to: '#ff0000' } } },
        { name: 'animated gradient', style: { borderAnimation: { type: 'gradient', color2: '#ff0000' } } },
        { name: 'marching SVG', style: { borderAnimation: { type: 'marching' } } }
    ];
    for (const [mode, page] of [['live', live], ['editor', editor]]) {
        for (const variant of variants) {
            for (const placement of placements) {
                const outset = 12 * ({ inside: 0, center: 0.5, outside: 1 }[placement]);
                await render(page, mode, makeFixture({ ...variant.style, borderPlacement: placement }));
                await bounds(page, mode, outset);
                const shot = await pixels(page);
                assert.deepEqual(shot.rows, Array.from({ length: 12 }, (_, i) => 100 - outset + i),
                    `${mode}/${variant.name}/${placement}: real border pixels must straddle the source boundary correctly`);
                assert.ok(shot.outerCorner[1] > 200, `${mode}/${variant.name}: rounded outer corner must stay clear`);
                if (variant.name !== 'marching SVG') {
                    assert.equal(shot.corner[0] > 200 && shot.corner[1] < 80 && shot.corner[2] < 80, placement !== 'outside',
                        `${mode}/${variant.name}/${placement}: preserve the source corner radius as the ring expands`);
                }
            }
        }
        // Defaults must work both through the saved schema and directly with old, unnormalized overlays.
        for (const normalize of [true, false]) {
            for (const linked of [false, true]) {
                await render(page, mode, makeFixture({ background: 'transparent' }, linked ? { obsLink: { enabled: true, sourceName: 'Fictional source' } } : {}, normalize));
                await bounds(page, mode, linked ? 12 : 0);
                const shot = await pixels(page);
                assert.deepEqual(shot.source, linked ? [0, 255, 0] : [255, 0, 0],
                    `${mode}: linked frames default outside without covering the source; ordinary old shapes stay inside`);
            }
        }
        for (const placement of ['inside', 'center']) {
            await render(page, mode, makeFixture({ borderPlacement: placement }, { obsLink: { enabled: true } }));
            await bounds(page, mode, placement === 'center' ? 6 : 0);
        }
        for (const type of ['rotating', 'radial', 'pulsing', 'rainbow']) {
            for (const placement of placements) {
                await render(page, mode, makeFixture({ borderPlacement: placement, shape: 'circle', borderAnimation: { type, color2: '#ff0000', size: 100 } }));
                await bounds(page, mode, 12 * ({ inside: 0, center: 0.5, outside: 1 }[placement]));
                const painted = await page.$eval(nodeSelector(mode), node => getComputedStyle(node._borderFxRing).animationName);
                assert.notEqual(painted, 'none', `${mode}/${type}: actual animated renderer must remain enabled`);
                assert.ok((await pixels(page)).outerCorner[1] > 200, `${mode}/${type}: ellipse corners must not become rectangular`);
            }
        }
        for (const placement of ['inside', 'outside']) {
            await render(page, mode, makeFixture({ borderPlacement: placement, borderGlow: { enabled: true, blur: 0, spread: 4, color: '#000000' } }));
            assert.deepEqual((await pixels(page)).shadow, placement === 'outside' ? [0, 0, 0] : [255, 255, 255],
                `${mode}: outer glow follows the expanded frame edge`);
        }
        const stateFixture = makeFixture({ background: 'transparent', borderGradient: variants[1].style.borderGradient }, {
            obsLink: { enabled: true },
            pageStates: { center: { style: { borderPlacement: 'center' } }, inside: { style: { borderPlacement: 'inside' } } }
        });
        await render(page, mode, stateFixture);
        for (const id of ['center', 'inside', 'base']) {
            if (mode === 'live') {
                await page.evaluate(id => window.fixtureMessage('custom-overlay-page', { id: 'fictional-border', page: id }), id);
                await new Promise(done => setTimeout(done, 180));
            } else {
                await page.evaluate(id => {
                    window.model.state.curPage = id;
                    window.model.projectPageState(id);
                    window.canvas.renderCanvas();
                }, id);
            }
            const outset = id === 'base' ? 12 : id === 'center' ? 6 : 0;
            await bounds(page, mode, outset);
            assert.deepEqual((await pixels(page)).rows, Array.from({ length: 12 }, (_, i) => 100 - outset + i),
                `${mode}: state changes restore the selected border placement`);
        }
    }
    // Operate the real Style inspector, then serialize/reload a state override without writing to any backend.
    await editor.evaluate(() => {
        const { state } = window.model;
        state.curPage = 'center'; window.model.projectPageState('center');
        state.selectedIds = new Set(['frame']); window.inspector.renderProperties();
    });
    assert.equal(await editor.$eval('[data-path="style.borderPlacement"]', node => node.closest('[data-inspector-panel]').dataset.inspectorPanel), 'style');
    await editor.select('[data-path="style.borderPlacement"]', 'inside');
    const saved = await editor.evaluate(() => window.model.serializeOverlayForSave());
    const reloaded = normalizeCustomOverlay(saved);
    assert.equal(reloaded.elements[0].style.borderPlacement, 'outside', 'saving an override must preserve the linked base default');
    await render(editor, 'editor', reloaded);
    await editor.evaluate(() => {
        window.model.state.curPage = 'center';
        window.model.projectPageState('center'); window.canvas.renderCanvas();
    });
    await bounds(editor, 'editor', 0);
    assert.deepEqual((await pixels(editor)).rows, Array.from({ length: 12 }, (_, i) => 100 + i), 'an inspector placement survives state serialization and server normalization');
    const invalid = normalizeOverlayElement({ type: 'shape', obsLink: { enabled: true }, style: { borderPlacement: 'invalid', borderWidth: 12, borderColor: '#ff0000' } });
    await render(live, 'live', makeFixture(invalid.style, { obsLink: invalid.obsLink }));
    await bounds(live, 'live', 12);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, [], 'fixture must not access live OBS/backend data or perform writes');
    console.log('Shape border pixel/bounds, OBS defaults, animations, inspector, and state regressions passed.');
} finally {
    if (browser) await browser.close();
    await new Promise(done => server.close(done));
    await rm(profile, { recursive: true, force: true });
}
