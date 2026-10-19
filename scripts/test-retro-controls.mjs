import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const names = [
    'overlay-shared.js', 'overlay-filters.js', 'overlay-retro.js',
    ...['state', 'canvas', 'form', 'layers', 'inspector'].map(name => `editor/editor-${name}.js`)
];
const sources = new Map(await Promise.all(names.map(async name =>
    [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')])));
const unexpected = [];
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://fixture.local').pathname;
    if (sources.has(path)) {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(sources.get(path));
    } else if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><style>.canvas-element{position:absolute}#canvas{width:256px;height:192px}</style>
            <div id="stage"><div id="world"><div id="canvas"><div id="canvas-underlayer"></div>
            <div id="canvas-toplayer"></div></div><div id="ui"></div></div></div><div id="properties"></div>`);
    } else if (path === '/favicon.ico') { res.writeHead(204); res.end(); }
    else { unexpected.push(path); res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'sp-retro-controls-'));
let browser;
try {
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile,
        args: ['--no-sandbox', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (new URL(request.url()).origin === origin || request.url().startsWith('data:')) request.continue();
        else { unexpected.push(request.url()); request.abort(); }
    });
    await page.goto(origin);
    for (const name of names.slice(0, 3)) await page.addScriptTag({ url: origin + '/js/' + name });
    await page.evaluate(async () => {
        const { state, prefs } = await import('/js/editor/editor-state.js');
        const { renderCanvas } = await import('/js/editor/editor-canvas.js');
        const { renderProperties, initInspectorEvents } = await import('/js/editor/editor-inspector.js');
        const source = document.createElement('canvas');
        source.width = 256; source.height = 192;
        const ctx = source.getContext('2d');
        ctx.fillStyle = '#b4b4b4'; ctx.fillRect(0, 0, 256, 192);
        ctx.fillStyle = '#111111'; ctx.fillRect(128, 0, 128, 192);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(40, 96, 40, 96);
        const element = {
            id: 'fictional-retro', type: 'image', width: 256, height: 192, x: 0, y: 0,
            src: source.toDataURL(), style: { objectFit: 'cover' },
            mediaFilter: { ...window.OverlayShared.defaultMediaFilter(), retro: {
                display: 'crt', crtScanlines: 0, crtMask: 'none', crtCurvature: 0,
                crtBloom: 0, crtVignette: 0, crtInterlace: 0
            } }
        };
        state.overlay = { id: 'fixture', canvas: { width: 256, height: 192 }, elements: [element] };
        state.selectedIds = new Set([element.id]);
        prefs.fx = true;
        renderCanvas(); renderProperties(); initInspectorEvents();
        window.fixture = { state, prefs, element, renderCanvas, renderProperties };
        await state.nodes.get(element.id).querySelector('img').decode();
    });
    await page.waitForFunction(() => window.fixture.state.nodes.get('fictional-retro')._retroRecord);
    const pixels = () => page.evaluate(() => {
        const canvas = window.fixture.state.nodes.get('fictional-retro')._retroCanvas;
        return Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    });
    const change = async (key, value) => {
        await page.evaluate(({ key, value }) => {
            const input = document.querySelector(`[data-path="mediaFilter.retro.${key}"]`);
            if (!input) throw new Error(`Missing inspector control: ${key}`);
            input.value = String(value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, { key, value });
        await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))));
    };
    const difference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
    const referenceDifference = () => page.evaluate(() => {
        const { element, state } = window.fixture, node = state.nodes.get(element.id);
        const reference = document.createElement('canvas');
        reference.width = element.width; reference.height = element.height;
        if (!window.OverlayRetro.renderRetroShader(reference, node.querySelector('img'), element.mediaFilter, 0)) {
            throw new Error('Reference shader failed to render');
        }
        const actual = node._retroCanvas.getContext('2d').getImageData(0, 0, reference.width, reference.height).data;
        const expected = reference.getContext('2d').getImageData(0, 0, reference.width, reference.height).data;
        return actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]), 0) / actual.length;
    });
    const flat = await pixels();
    await change('crtScanlines', 100);
    const scanlines = await pixels();
    assert.ok(difference(flat, scanlines) > 12, 'scanline intensity must visibly darken alternate bands');
    assert.ok(await referenceDifference() < 0.1, 'editor must render raw CRT percentages exactly once');
    await change('crtScanlineScale', 3);
    assert.ok(difference(scanlines, await pixels()) > 8, 'scanline scale must change band spacing');
    await change('crtMask', 'aperture');
    await change('crtMaskStrength', 100);
    const aperture = await pixels();
    assert.ok(await referenceDifference() < 0.1, 'phosphor mask selection/intensity must reach shader unchanged');
    await change('crtMaskScale', 3);
    assert.ok(difference(aperture, await pixels()) > 5, 'mask scale must change RGB grille spacing');
    for (const mask of ['slot', 'dot']) {
        await change('crtMask', mask);
        assert.ok(await referenceDifference() < 0.1, `${mask} mask must match direct shader rendering`);
    }
    await change('display', 'lcd');
    await change('lcdGrid', 0);
    await change('lcdGhosting', 0);
    const lcdFlat = await pixels();
    await change('lcdGrid', 100);
    const grid = await pixels();
    assert.ok(difference(lcdFlat, grid) > 4, 'LCD grid must be visible');
    assert.ok(await referenceDifference() < 0.1, 'LCD grid percentage must reach shader unchanged');
    await change('lcdGrid', 35);
    assert.ok(difference(grid, await pixels()) > 4, 'LCD grid spacing must respond to the slider');
    await change('lcdGrid', 0);
    await change('lcdGhosting', 100);
    assert.ok(difference(lcdFlat, await pixels()) > 0.5, 'LCD ghosting must smear contrasting edges');
    assert.ok(await referenceDifference() < 0.1, 'LCD ghosting percentage must reach shader unchanged');
    await change('lcdPalette', 'dmg-green');
    assert.ok(await referenceDifference() < 0.1, 'LCD palette must survive editor application');
    await page.evaluate(() => {
        const { element, renderCanvas, renderProperties } = window.fixture;
        element.mediaFilter.retro = { type: 'crt', scanlines: 80, scanlineSize: 8, mask: 'dot', crtMaskStrength: 60 };
        renderCanvas(); renderProperties();
    });
    assert.ok(await referenceDifference() < 0.1, 'legacy saved CRT options must also be normalized only once');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('Retro control browser tests passed: real editor sliders, CRT masks/spacing, LCD grid/ghosting/palette and legacy rendering parity.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
}
