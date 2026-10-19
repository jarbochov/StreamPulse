const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const puppeteer = require('puppeteer');
const { createOverlayRoutes } = require('../server/routes/overlays');
const { createStaticRouter } = require('../server/static-router');

test('Game Plan cover library lists real asset API images, filters, saves selection, and reports failures', { timeout: 30000 }, async t => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plan-assets-'));
    const image = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect width="40" height="60" fill="purple"/></svg>';
    fs.writeFileSync(path.join(assetsDir, 'abcdefg-fictional-cover.svg'), image);
    fs.writeFileSync(path.join(assetsDir, 'hijklmn-second-cover.svg'), image);
    fs.writeFileSync(path.join(assetsDir, 'opqrstu-not-an-image.txt'), 'Fictional text asset');
    const rootDir = path.resolve(__dirname, '..');
    const staticRouter = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    const assets = createOverlayRoutes({
        customOverlayAssetsDir: assetsDir,
        getAssetTags: () => ({ 'abcdefg-fictional-cover.svg': ['fictional'], 'hijklmn-second-cover.svg': ['other'] })
    });
    let failure = '';
    let saved = null;
    const plan = { items: [{ id: 'fictional', name: 'Fictional segment', custom: true, status: 'tonight', customCover: '', cover: '' }], lists: [], periods: [] };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname === '/api/custom-overlays/assets' && failure) {
            res.setHeader('Content-Type', 'application/json');
            if (failure === 'http') { res.writeHead(503); res.end('{"error":"Unavailable"}'); }
            else res.end('{"assets":[]}');
        } else if (await assets(req, res, url, url.pathname)) {
            return;
        } else if (url.pathname === '/api/game-plan') {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'PUT') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    saved = JSON.parse(body);
                    plan.items[0].customCover = saved.items[0].customCover;
                    plan.items[0].cover = saved.items[0].customCover;
                    res.end('{"ok":true}');
                });
            } else res.end(JSON.stringify(plan));
        } else if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            res.end('{}');
        } else if (url.pathname.startsWith('/custom-overlay-assets/')) {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(image);
        } else if (!staticRouter.handleRequest(req, res)) {
            res.writeHead(404); res.end();
        }
    });
    let browser;
    t.after(async () => {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(assetsDir, { recursive: true, force: true });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (new URL(request.url()).origin === origin) request.continue();
        else request.abort();
    });
    await page.goto(origin + '/game-plan-editor.html');
    await page.waitForSelector('[data-edit]');
    await page.click('[data-edit]');
    await page.waitForFunction(() => document.querySelector('#dlg').open);
    const open = async () => {
        await page.click('#cover-library');
        await page.waitForFunction(() => !document.querySelector('#asset-status').textContent.startsWith('Loading'));
    };
    await open();
    assert.equal(await page.$$eval('.asset-card', cards => cards.length), 2, 'images are selected by kind from the actual array response');
    assert.deepEqual((await page.$$eval('.asset-name', nodes => nodes.map(n => n.textContent))).sort(), ['fictional-cover', 'second-cover']);
    await page.waitForFunction(() => [...document.querySelectorAll('.asset-card img')].every(img => img.complete && img.naturalWidth > 0));
    await page.type('#asset-search', 'fictional');
    assert.equal(await page.$$eval('.asset-card', cards => cards.length), 1);
    await page.$eval('#asset-search', input => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.select('#asset-tag-filter', 'other');
    assert.equal(await page.$$eval('.asset-card', cards => cards.length), 1);
    await page.click('#asset-dlg-close');
    await open();
    assert.equal(await page.$$eval('.asset-card', cards => cards.length), 2, 'reopening clears stale filters');
    const selected = '/custom-overlay-assets/abcdefg-fictional-cover.svg';
    const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/game-plan') && response.request().method() === 'PUT');
    await page.click(`[data-asset-url="${selected}"]`);
    await page.waitForFunction(() => !document.querySelector('#asset-dlg').open);
    assert.equal(await page.$eval('#f-cover', input => input.value), selected);
    await saveResponse;
    assert.equal(saved.items[0].customCover, selected, 'selected image persists as customCover');
    assert.equal(await page.$eval('#dlg-cover img', img => new URL(img.src).pathname), selected);
    for (failure of ['http', 'shape']) {
        await open();
        assert.equal(await page.$$eval('.asset-card', cards => cards.length), 0, 'failed loads cannot expose stale cached images');
        assert.match(await page.$eval('#asset-status', node => node.textContent), failure === 'http' ? /Could not load assets:.*503/ : /Could not load assets: Invalid Asset Library response/);
        await page.click('#asset-dlg-close');
    }
    assert.deepEqual(errors, []);
});
