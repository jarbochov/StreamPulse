const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const puppeteer = require('puppeteer');
const { createStaticRouter } = require('../server/static-router');

const rootDir = path.resolve(__dirname, '..');
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#795cf5"/></svg>';
const assets = [
    { name: 'aurora.svg', label: 'Aurora logo', caption: 'Fictional broadcast badge', tags: ['Brand'], modifiedAt: '2026-03-01' },
    { name: 'lunar.svg', label: 'Lunar frame', tags: ['Ambient'], modifiedAt: '2026-04-01' },
    { name: 'orbit.svg', label: 'Orbit', tags: [], modifiedAt: '2026-05-01' },
    ...Array.from({ length: 36 }, (_, i) => ({ name: `art-${i}.svg`, label: `Art ${i}`, tags: ['Ambient'], modifiedAt: '2025-01-01' }))
].map(asset => ({ ...asset, kind: 'image', url: `/custom-overlay-assets/${asset.name}` }));
const fonts = [
    { name: 'fictional-sans.woff2', family: 'Fictional Sans', tags: ['Brand'], modifiedAt: '2026-03-01' },
    { name: 'fictional-sans.ttf', family: 'Fictional Sans', tags: ['Brand'], modifiedAt: '2026-03-02' },
    { name: 'fictional-serif.woff2', family: 'Fictional Serif', tags: ['Serif'], modifiedAt: '2026-04-01' }
].map(asset => ({ ...asset, kind: 'font', url: `/custom-overlay-assets/${asset.name}` }));

test('asset filtering searches metadata, combines tags and uses non-mutating chronological/natural ordering', async () => {
    const source = fs.readFileSync(path.join(rootDir, 'public/js/asset-browser.js'), 'utf8');
    const { filterAssets } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const before = JSON.stringify(assets);
    assert.deepEqual(filterAssets(assets, { query: 'BROADCAST brand' }).map(a => a.name), ['aurora.svg']);
    assert.deepEqual(filterAssets(assets, { tag: 'bRaNd', query: 'aurora.svg' }).map(a => a.name), ['aurora.svg']);
    assert.deepEqual(filterAssets(assets, { tag: '\u0000untagged' }).map(a => a.name), ['orbit.svg']);
    assert.deepEqual(filterAssets(assets).slice(0, 3).map(a => a.name), ['orbit.svg', 'lunar.svg', 'aurora.svg']);
    assert.deepEqual(filterAssets(assets, { sort: 'name' }).slice(0, 3).map(a => a.label), ['Art 0', 'Art 1', 'Art 2']);
    assert.equal(filterAssets(assets, { sort: 'oldest' }).at(-1).name, 'orbit.svg');
    assert.equal(filterAssets([...assets, { name: 'unknown', modifiedAt: 'invalid' }]).at(-1).name, 'unknown');
    assert.equal(JSON.stringify(assets), before);
});

test('shared browsing works in image, badge, multi-select and uploaded-font pickers', { timeout: 60000 }, async t => {
    const staticRouter = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public') });
    const pending = [];
    let deferAssets = false;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname === '/fixture') {
            const view = url.searchParams.get('view');
            const directory = view === 'custom-overlay-editor' ? 'public/editors' : 'public/tools';
            const html = view ? fs.readFileSync(path.join(rootDir, directory, `${view}.html`), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') : '<!doctype html><html><head></head><body></body></html>';
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
        } else if (url.pathname === '/api/custom-overlays/assets') {
            const respond = () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([...assets, ...fonts])); };
            if (deferAssets) pending.push(respond);
            else respond();
        } else if (url.pathname.startsWith('/custom-overlay-assets/')) {
            res.setHeader('Content-Type', 'image/svg+xml'); res.end(image);
        } else if (!staticRouter.handleRequest(req, res)) {
            res.writeHead(404); res.end();
        }
    });
    let browser;
    t.after(async () => {
        pending.splice(0).forEach(respond => respond());
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).origin === origin ? request.continue() : request.abort());
    const search = '.asset-browser-controls input';
    const tag = '.asset-browser-controls [aria-label="Filter assets by tag"]';
    const sort = '.asset-browser-controls [aria-label="Sort assets"]';
    const query = value => page.$eval(search, (input, value) => { input.value = value; input.dispatchEvent(new Event('input')); }, value);

    await t.test('image picker filters dozens of images, persists preferences and fits narrow screens', async () => {
        await page.goto(origin + '/fixture');
        await page.addScriptTag({ url: origin + '/js/image-picker.js' });
        await page.evaluate(() => { window.picks = []; return window.ImagePicker.open({ onPick: url => window.picks.push(url) }); });
        await page.waitForSelector('.mp-grid [role=option]');
        assert.equal(await page.$eval('.mp-cap', el => el.textContent), 'Orbit');
        await query('BROADCAST brand');
        await page.waitForFunction(() => document.querySelectorAll('.mp-grid button').length === 1);
        await page.click('.mp-grid button');
        assert.deepEqual(await page.evaluate(() => window.picks), ['/custom-overlay-assets/aurora.svg']);
        await page.evaluate(() => window.ImagePicker.open({ onPick: () => {} }));
        await page.waitForSelector('.mp-grid button');
        assert.equal(await page.$eval(search, el => el.value), 'BROADCAST brand');
        await query('');
        await page.select(tag, 'ambient');
        await page.select(sort, 'name');
        await page.waitForFunction(() => document.querySelector('.mp-cap')?.textContent === 'Art 0');
        await page.setViewport({ width: 360, height: 740 });
        await page.waitForFunction(() => !!document.getElementById('asset-browser-css')?.sheet);
        assert.equal(await page.$eval('.mp-dialog', el => el.scrollWidth <= el.clientWidth), true, 'toolbar does not cause horizontal overflow');
        await page.click('[data-close]');
        await page.setViewport({ width: 1000, height: 800 });
    });

    await t.test('closed image and badge pickers ignore delayed library responses', async () => {
        deferAssets = true;
        await page.evaluate(() => window.ImagePicker.open({ onPick: () => { throw new Error('Closed image selected'); } }));
        await page.waitForSelector('.mp-backdrop');
        await page.click('[data-close]');
        await page.evaluate(() => {
            import('/js/displays/badge-controls.js').then(module => module.pickBadgeAsset(() => { throw new Error('Closed badge selected'); }));
        });
        await page.waitForSelector('.badge-assets-dialog[open]');
        assert.equal(await page.$eval('.badge-assets-dialog', el => el.firstElementChild.className), 'builder-card-heading');
        await page.click('.badge-assets-dialog [data-close]');
        await page.waitForFunction(() => !document.querySelector('.badge-assets-dialog'));
        deferAssets = false;
        pending.splice(0).forEach(respond => respond());
    });

    await t.test('Tier List Select shown preserves hidden selections without adding hidden matches', async () => {
        await page.goto(origin + '/fixture?view=tier-list');
        await page.evaluate(async () => { const module = await import('/js/tier-list/tier-list-modals.js'); module.initModalListeners(); });
        await page.click('#btn-asset-library');
        await page.waitForSelector('#asset-grid .asset-card');
        await page.click('#asset-grid .asset-card[data-url$="/orbit.svg"]');
        await page.select(tag, 'brand');
        await page.waitForFunction(() => document.querySelectorAll('#asset-grid .asset-card').length === 1);
        await page.click('#btn-select-all-assets');
        assert.equal(await page.$eval('#selected-asset-count', el => el.textContent), '2 selected');
        await page.select(tag, '');
        await page.waitForFunction(() => document.querySelectorAll('#asset-grid .asset-card.selected').length === 2);
        await page.click('[data-close="modal-assets"]');
    });

    await t.test('overlay slideshow and image pickers load fresh assets and retain independent filters', async () => {
        await page.goto(origin + '/fixture?view=custom-overlay-editor');
        await page.evaluate(async () => {
            const { state } = await import('/js/editor/editor-state.js');
            window.editor = await import('/js/editor/editor-main.js');
            state.overlay.elements = [{ id: 'slides', type: 'slideshow', slideshow: { kinds: 'image', files: [] } }, { id: 'art', type: 'image' }];
            state.selectedIds = new Set(['slides']);
            await window.editor.openSlidePicker();
        });
        await page.waitForSelector('#slide-grid .asset-tile');
        await page.select('#slide-dialog [aria-label="Filter assets by tag"]', 'brand');
        await page.waitForFunction(() => document.querySelectorAll('#slide-grid .asset-tile').length === 1);
        assert.equal(await page.$eval('#slide-grid .asset-tile', el => el.dataset.name), 'aurora.svg');
        await page.evaluate(async () => { document.getElementById('slide-dialog').close(); await window.editor.openAssetPicker('art'); });
        assert.equal(await page.$eval('#asset-grid .asset-tile', el => el.dataset.url), '/custom-overlay-assets/orbit.svg');
        await page.$eval('#asset-search', input => { input.value = 'fictional broadcast'; input.dispatchEvent(new Event('input')); });
        await page.waitForFunction(() => document.querySelectorAll('#asset-grid .asset-tile').length === 1);
        assert.equal(await page.$eval('#asset-grid .asset-tile', el => el.dataset.url), '/custom-overlay-assets/aurora.svg');
        await page.evaluate(() => document.getElementById('asset-dialog').close());
    });

    for (const view of ['versus', 'polls']) await t.test(`${view} font browsing keeps family deduplication and shows filtered-empty guidance`, async () => {
        await page.goto(`${origin}/fixture?view=${view}`);
        await page.evaluate(async (view, fonts) => {
            window.OverlayFonts = {
                getAssetFonts: async () => fonts,
                getDeduplicatedFontFamilies: async () => [fonts[0], fonts[2]].map(raw => ({ name: raw.family, source: 'asset', raw }))
            };
            if (view === 'polls') {
                Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });
                await import('/js/polls/polls-main.js');
                delete document.readyState;
            }
            window.preview = await import(`/js/${view}/${view}-preview.js`);
            await window.preview.populateFontDatalist();
            await Promise.all([window.preview.openAssetFontPicker(), window.preview.openAssetFontPicker()]);
        }, view, fonts);
        assert.equal(await page.$$('.asset-browser-controls').then(nodes => nodes.length), 1, 'concurrent opens mount one toolbar');
        assert.equal(await page.$$eval('#asset-font-picker-list button', nodes => nodes.length), 2, 'font variants remain grouped by family');
        await page.select(tag, 'brand');
        await page.waitForFunction(() => document.querySelectorAll('#asset-font-picker-list button').length === 1);
        assert.match(await page.$eval('#asset-font-picker-list', el => el.textContent), /WOFF2/);
        assert.match(await page.$eval('#asset-font-picker-list', el => el.textContent), /TTF/);
        await query('absent');
        await page.waitForFunction(() => document.getElementById('asset-font-picker-list').textContent.includes('No fonts match'));
        await page.evaluate(() => window.preview.closeAssetFontPicker());
    });

    await t.test('controller deduplicates mounts, cancels queued rendering and restores original controls', async () => {
        await page.goto(origin + '/fixture');
        const result = await page.evaluate(async () => {
            const { mountAssetBrowser } = await import('/js/asset-browser.js');
            document.body.innerHTML = '<div id="host"><input id="q"><select id="tag"></select><span id="end"></span></div>';
            const search = document.getElementById('q'), tag = document.getElementById('tag');
            let calls = 0;
            const options = { search, tag, key: 'lifecycle', onChange: () => calls++ };
            const first = mountAssetBrowser(options), second = mountAssetBrowser(options);
            search.dispatchEvent(new Event('input'));
            first.destroy();
            await new Promise(window.requestAnimationFrame);
            return { same: first === second, calls, children: [...document.getElementById('host').children].map(el => el.id) };
        });
        assert.deepEqual(result, { same: true, calls: 0, children: ['q', 'tag', 'end'] });
    });
    assert.deepEqual(errors, []);
});
