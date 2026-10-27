import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const names = [
    'overlay-shared.js', 'overlay-filters.js', 'overlay-retro.js', 'editor-geometry.js',
    ...['state', 'canvas', 'form', 'layers', 'inspector'].map(name => `editor/editor-${name}.js`),
    'overlay-runtime.js'
];
const sources = new Map(await Promise.all(names.map(async name =>
    [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')])));

const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://fixture.local').pathname;
    if (sources.has(path)) {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(sources.get(path));
    } else if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><style>.canvas-element{position:absolute;box-sizing:border-box}#canvas{width:640px;height:360px}</style>
            <div id="stage"><div id="world"><div id="canvas"><div id="canvas-underlayer"></div>
            <div id="canvas-toplayer"></div></div><div id="ui"></div></div></div><div id="properties"></div>`);
    } else {
        res.writeHead(404);
        res.end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'sp-md-padding-'));
let browser;

try {
    browser = await puppeteer.launch({
        headless: true, userDataDir: profile,
        args: ['--no-sandbox', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(origin);
    for (const name of names.slice(0, 3)) await page.addScriptTag({ url: `${origin}/js/${name}` });

    const results = await page.evaluate(async () => {
        const { state } = await import('/js/editor/editor-state.js');
        const { applyNodeStyle } = await import('/js/editor/editor-canvas.js');
        const { paddingField, fillSection, renderProperties } = await import('/js/editor/editor-inspector.js');

        // Test 1: paddingField availability for markdown without box/background
        const mdNoBox = { id: 'md1', type: 'markdown', style: { background: 'transparent', borderWidth: 0 } };
        const mdHtml = paddingField(mdNoBox);

        // Test 2: paddingField for markdown with padding value
        const mdWithPad = { id: 'md2', type: 'markdown', style: { padding: 24 } };
        const mdWithPadHtml = paddingField(mdWithPad);

        // Test 3: paddingField for text without box
        const textNoBox = { id: 't1', type: 'text', style: { background: 'transparent', borderWidth: 0 } };
        const textHtml = paddingField(textNoBox);

        // Test 4: non-text elements should not have paddingField
        const imageEl = { id: 'img1', type: 'image', style: {} };
        const shapeEl = { id: 's1', type: 'shape', style: {} };

        // Test 5: fillSection contains padding for markdown
        const fillHtml = fillSection(mdNoBox);

        // Test 6: canvas node style applies padding
        const node = document.createElement('div');
        state.overlay = { canvas: { width: 640, height: 360 }, elements: [mdWithPad] };
        applyNodeStyle(node, mdWithPad, 0);

        return {
            mdHasPadding: mdHtml.includes('data-path="style.padding"') && mdHtml.includes('Padding (px)'),
            mdWithPadValue: mdWithPadHtml.includes('value="24"'),
            textHasPadding: textHtml.includes('data-path="style.padding"'),
            imageHasNoPadding: paddingField(imageEl) === '',
            shapeHasNoPadding: paddingField(shapeEl) === '',
            fillHasPadding: fillHtml.includes('style.padding'),
            nodePaddingPx: node.style.padding
        };
    });

    assert.ok(results.mdHasPadding, 'paddingField must generate style.padding control for Markdown elements');
    assert.ok(results.mdWithPadValue, 'paddingField must reflect configured padding value on Markdown elements');
    assert.ok(results.textHasPadding, 'paddingField must generate style.padding control for Text elements');
    assert.ok(results.imageHasNoPadding, 'paddingField must return empty string for Image elements');
    assert.ok(results.shapeHasNoPadding, 'paddingField must return empty string for Shape elements');
    assert.ok(results.fillHasPadding, 'fillSection (Background & border) must include Padding control for Markdown elements');
    assert.equal(results.nodePaddingPx, '24px', 'applyNodeStyle must apply configured padding (24px) to canvas node');
    assert.equal(errors.length, 0, `Page errors: ${errors.join('; ')}`);

    console.log('Markdown padding tests passed: paddingField, fillSection, and canvas DOM rendering verified.');
} finally {
    if (browser) await browser.close();
    server.close();
}
