const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');
const { Response } = globalThis;
const model = require('../public/js/promo-model');
const { createPromoService } = require('../server/services/promos');
const { createPromoArtworkService } = require('../server/services/promo-artwork');
const { createPromoRoutes } = require('../server/routes/promos');
const { createOverlayRoutes } = require('../server/routes/overlays');
const { createStaticRouter } = require('../server/static-router');
const { createBackupService } = require('../server/services/backup');

test('promo model preserves independent layouts and validates export-safe images and Twitch destinations', () => {
    const design = model.normalize({ url: 'https://www.twitch.tv/fictionalstudio', photo: '/custom-overlay-assets/fictional.svg' });
    design.layouts.square.blocks.title.x = 30;
    const restored = model.normalize(design);
    assert.equal(restored.layouts.square.blocks.title.x, 30);
    assert.equal(restored.layouts.landscape.blocks.title.x, 4);
    for (const ratio of Object.keys(model.SIZES)) {
        const next = model.normalize({ layouts: { [ratio]: { blocks: { title: { x: 500, y: -40, w: 900, h: 900 } }, order: ['title', 'title', 'invalid'] } } });
        const b = next.layouts[ratio].blocks.title;
        assert.ok(b.x + b.w <= 100 && b.y + b.h <= 100);
        assert.equal(next.layouts[ratio].order.length, model.BLOCKS.length);
    }
    for (const url of ['javascript:alert(1)', 'https://example.test/channel', 'https://twitch.tv/name?x=1']) assert.throws(() => model.normalize({ url }));
    for (const photo of ['https://example.test/image.png', '/custom-overlay-assets/..%2Fsecret.png', '/custom-overlay-assets/file.mp4']) assert.throws(() => model.normalize({ photo }));
    assert.equal(restored.url, 'https://twitch.tv/fictionalstudio');
    assert.equal(model.assetUrl('/custom-overlay-assets/game art.jpg'), '/custom-overlay-assets/game%20art.jpg');
    const malformed = model.normalize({ theme: '__proto__', layouts: { square: { blocks: { title: { x: 98, y: 98, w: 'invalid', h: null } } } } });
    assert.equal(malformed.layouts.square.blocks.title.w, 2);
    assert.equal(malformed.layouts.square.blocks.title.h, 2);
    assert.equal(malformed.theme, 'midnight');
    assert.equal(model.normalize({ layouts: { square: { template: 'minimal' } } }).layouts.square.blocks.photo.enabled, false);
    assert.throws(() => model.normalize({ layouts: { square: { background: { mode: 'image', image: 'https://example.test/image.png' } } } }), /Asset Library/);
    const background = model.background({ mode: 'gradient', angle: 900, shade: -10, focusX: 'bad' });
    assert.equal(background.angle, 360); assert.equal(background.shade, 0); assert.equal(background.focusX, 50);
    assert.throws(() => model.normalizeTheme({ name: '   ' }), /name/);
});

test('promo persistence, image references and actual studio export work without production or external requests', { timeout: 60000 }, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-promos-'));
    const assetsDir = path.join(dataDir, 'custom-overlay-assets');
    fs.mkdirSync(assetsDir);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#2255cc"/><circle cx="400" cy="225" r="130" fill="#ff9900"/></svg>';
    fs.writeFileSync(path.join(assetsDir, 'fictional.svg'), svg);
    const service = createPromoService({ dataDir });
    let imageData;
    const upstreamRequests = [];
    const artworkService = createPromoArtworkService({
        assetsDir, getTwitchClientId: () => 'fictional-client', getAppToken: async () => 'fictional-token',
        fetchImpl: async (url, options) => {
            upstreamRequests.push({ url, ...options });
            if (url.startsWith('https://images.igdb.com/')) return new Response(imageData);
            return Response.json([{
                id: 42, name: 'Fictional Orbit', cover: { image_id: 'cover42' },
                artworks: [{ image_id: 'art42' }], screenshots: [{ image_id: 'screen42' }]
            }]);
        }
    });
    const routes = createPromoRoutes({ service, artworkService });
    const overlayRoutes = createOverlayRoutes({
        customOverlayAssetsDir: assetsDir,
        promoAssetUsers: name => service.assetUsers(name),
        rewritePromoReferences: (oldName, newName) => service.renameAsset(oldName, newName)
    });
    const rootDir = path.resolve(__dirname, '..');
    const staticRouter = createStaticRouter({ rootDir, publicDir: path.join(rootDir, 'public'), customOverlayAssetsDir: assetsDir });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (await routes(req, res, url.pathname)) return;
        if (await overlayRoutes(req, res, url, url.pathname)) return;
        if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{}'); }
        else if (!staticRouter.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    let browser;
    t.after(async () => {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDir, { recursive: true, force: true });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const api = async (url, method = 'GET', body) => fetch(origin + url, {
        method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    let response = await api('/api/promos', 'POST', { ...model.normalize(), url: 'fictionalstudio', photo: '/custom-overlay-assets/fictional.svg' });
    assert.equal(response.status, 201);
    const design = await response.json();
    assert.equal((await api('/api/promos/missing', 'PUT', design)).status, 404);
    assert.equal((await api('/api/promos', 'POST', { photo: '/private.png' })).status, 400);
    assert.equal((await api('/api/promos', 'PATCH', {})).status, 405);
    assert.equal(service.assetUsers('fictional.svg')[0].id, `promo:${design.id}`);
    assert.equal((await api('/api/custom-overlays/assets/fictional.svg', 'DELETE')).status, 409, 'used promo assets cannot be accidentally deleted');
    assert.ok((await (await api('/api/custom-overlays/assets')).json())[0].usedBy.some(item => item.id === `promo:${design.id}`));
    response = await api('/api/custom-overlays/assets/fictional.svg/rename', 'POST', { name: 'renamed' });
    assert.equal(response.status, 200);
    const renamed = await response.json();
    const stored = (await (await api('/api/promos')).json())[0];
    assert.equal(stored.photo, renamed.url, 'asset rename updates saved promo images');
    assert.equal(createPromoService({ dataDir }).list()[0].photo, renamed.url, 'restart reads persistent data');

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    let acceptDialogs = true;
    page.on('dialog', dialog => acceptDialogs ? dialog.accept() : dialog.dismiss());
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (new URL(req.url()).hostname === 'images.igdb.com') req.respond({ contentType: 'image/svg+xml', body: svg });
        else if (new URL(req.url()).hostname === 'fonts.googleapis.com') req.abort();
        else if (new URL(req.url()).origin === origin || req.url().startsWith('blob:') || req.url().startsWith('data:')) req.continue();
        else { external.push(req.url()); req.abort(); }
    });
    await page.setViewport({ width: 1500, height: 1000 });
    await page.goto(`${origin}/promo-creator.html?id=${design.id}`);
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
    await page.waitForFunction(() => document.querySelector('#preview').width === 1080);
    await page.setViewport({ width: 1024, height: 600 });
    for (const [ratio, expected] of Object.entries({ square: 1, landscape: 16 / 9, portrait: 9 / 16 })) {
        await page.click(`[data-ratio="${ratio}"]`);
        await page.waitForFunction(expected => {
            const canvas = document.querySelector('#preview');
            return canvas.width > 0 && canvas.width / canvas.height === expected;
        }, {}, expected);
        const dimensions = await page.$eval('#stage', stage => {
            const { width, height } = stage.getBoundingClientRect();
            return { ratio: width / height, canvasWidth: stage.querySelector('canvas').getBoundingClientRect().width, width };
        });
        assert.ok(Math.abs(dimensions.ratio - expected) < 0.02, `${ratio} preview keeps its aspect ratio at a short viewport height`);
        assert.ok(Math.abs(dimensions.canvasWidth - dimensions.width) < 1, `${ratio} preview canvas fills the stage width`);
    }
    await page.setViewport({ width: 1500, height: 1000 });
    await page.click('[data-ratio="square"]');
    assert.equal(await page.$eval('#appearance-panel', el => el.open), false, 'theme settings stay tucked away rather than dominating the workspace');
    assert.equal(await page.$('#theme-gallery'), null);
    await page.focus('#tab-square');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('#tab-landscape', el => el.getAttribute('aria-selected')), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.$eval('#tab-square', el => el.tabIndex), 0, 'ratio tabs support arrow and Home navigation');
    assert.match(await page.$eval('#main-nav a[href="/promo-creator.html"]', el => el.closest('.dropdown').textContent), /^Tools/, 'Promo Creator is a tool, not a live overlay');
    imageData = Buffer.from(await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        canvas.getContext('2d').fillRect(0, 0, 64, 64);
        return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.$eval('#title', el => { el.value = 'Fictional launch night'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#block-x', el => { el.value = '12'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval('#block-x', el => el.value), '4');
    await page.click('[data-ratio="square"]');
    assert.equal(await page.$eval('#block-x', el => el.value), '12', 'switching formats restores the edited arrangement');
    acceptDialogs = false;
    await page.select('#template', 'spotlight');
    assert.equal(await page.$eval('#template', el => el.value), 'editorial', 'canceling a layout replacement restores the dropdown');
    assert.equal(await page.$eval('#block-x', el => el.value), '12', 'canceled replacements preserve manual layout edits');
    acceptDialogs = true;
    await page.$eval('#stage', el => el.scrollIntoView({ block: 'center' }));
    const titleBox = await page.$('#handles [data-block="title"]').then(el => el.boundingBox());
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down(); await page.mouse.move(titleBox.x + titleBox.width / 2 + 15, titleBox.y + titleBox.height / 2 + 10); await page.mouse.up();
    assert.ok(Number(await page.$eval('#block-x', el => el.value)) > 12, 'pointer dragging changes the selected block');
    const beforeResize = Number(await page.$eval('#block-w', el => el.value));
    const resize = await page.$('.promo-handle.selected .promo-resize').then(el => el.boundingBox());
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
    await page.mouse.down(); await page.mouse.move(resize.x - 20, resize.y - 10); await page.mouse.up();
    assert.ok(Number(await page.$eval('#block-w', el => el.value)) < beforeResize, 'corner handles resize the block');
    const beforeNudge = Number(await page.$eval('#block-x', el => el.value));
    await page.focus('#stage'); await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
    assert.ok(Number(await page.$eval('#block-x', el => el.value)) < beforeNudge, 'keyboard nudging works after dragging');
    await page.evaluate(() => {
        for (const [id, value] of Object.entries({ x: 12, y: 65, w: 86, h: 14 })) {
            const input = document.querySelector('#block-' + id); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    await page.click('[data-library="artwork"]');
    await page.waitForSelector('.promo-asset');
    await page.click('.promo-asset');
    assert.match(await page.$eval('#artwork-name', el => el.textContent), /renamed/);
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const saved = await (await api(`/api/promos/${design.id}`)).json();
    assert.equal(saved.layouts.square.blocks.title.x, 12);
    assert.equal(saved.title, 'Fictional launch night');
    assert.equal(saved.artwork, renamed.url);
    await page.click('[data-igdb="artwork"]');
    await page.type('#igdb-query', 'Fictional Orbit');
    await page.click('#igdb-search-form button');
    await page.waitForSelector('#igdb-grid .promo-asset');
    await page.click('#igdb-grid .promo-asset');
    await page.waitForFunction(() => document.querySelector('#igdb-status').textContent.includes('choose a cover'));
    assert.equal(await page.$$eval('#igdb-grid .promo-asset', els => els.length), 3);
    await page.click('#igdb-grid .promo-asset:nth-child(2)');
    await page.waitForFunction(() => !document.querySelector('#igdb-dialog').open);
    assert.match(await page.$eval('#artwork-name', el => el.textContent), /Fictional-Orbit-artwork.png/, 'an IGDB .jpg URL can return a valid PNG');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const withArtwork = await (await api(`/api/promos/${design.id}`)).json();
    assert.match(withArtwork.artwork, /^\/custom-overlay-assets\/igdb-/);
    assert.ok(service.assetUsers(decodeURIComponent(withArtwork.artwork.split('/').pop())).length);
    assert.equal(upstreamRequests.find(entry => entry.url.includes('/t_original/')).redirect, 'error');
    assert.ok(upstreamRequests.every(entry => entry.signal instanceof AbortSignal), 'all upstream requests have deadlines');
    assert.equal((await api('/api/promos/igdb/import', 'POST', { gameId: 42, imageId: 'unrelated' })).status, 400);
    assert.equal((await api('/api/promos/igdb/import', 'POST', { gameId: '../private', imageId: 'art42' })).status, 400);

    const themes = Object.keys(require('../public/js/studio-themes')).filter(key => key !== 'system');
    await page.$eval('#appearance-panel', el => { el.open = true; });
    for (const theme of themes) {
        await page.select('#theme', theme);
        assert.equal(await page.$eval('#theme', el => el.value), theme);
        assert.equal(await page.$eval('#title', el => el.value), 'Fictional launch night', 'one-click looks preserve user content');
        assert.equal(await page.$eval('#block-x', el => el.value), '12', 'one-click looks preserve layout edits');
    }
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const themedFormats = (await (await api(`/api/promos/${design.id}`)).json()).layouts;
    assert.equal(themedFormats.square.background.theme, 'matrix');
    assert.equal(themedFormats.landscape.background.theme, 'midnight', 'applying theme artwork to square does not change the landscape background treatment');
    assert.equal(themedFormats.portrait.background.theme, 'midnight');

    for (const [ratio, [width, height]] of Object.entries(model.SIZES)) {
        await page.click(`[data-ratio="${ratio}"]`);
        const qrData = require('qrcode').create(withArtwork.url, { errorCorrectionLevel: 'M' }).modules;
        const exported = await page.evaluate(async ({ ratio, moduleSize }) => {
            const { renderPromo } = await import('/js/promo-renderer.js');
            const data = (await (await fetch('/api/promos')).json())[0];
            const canvas = document.createElement('canvas');
            await renderPromo(canvas, data, ratio, { preview: false });
            const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const image = await window.createImageBitmap(png);
            const sample = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            const colors = new Set();
            for (let i = 0; i < sample.length; i += 64) colors.add(`${sample[i]},${sample[i + 1]},${sample[i + 2]}`);
            const b = data.layouts[ratio].blocks.qr;
            const box = { x: b.x * canvas.width / 100, y: b.y * canvas.height / 100, w: b.w * canvas.width / 100, h: b.h * canvas.height / 100 };
            const size = Math.min(box.w, box.h), qr = [];
            for (let y = 0; y < moduleSize + 8; y++) for (let x = 0; x < moduleSize + 8; x++) {
                const px = Math.floor(box.x + (box.w - size) / 2 + (x + .5) * size / (moduleSize + 8));
                const py = Math.floor(box.y + (box.h - size) / 2 + (y + .5) * size / (moduleSize + 8));
                qr.push(sample[(py * canvas.width + px) * 4] < 128);
            }
            return { width: image.width, height: image.height, bytes: png.size, colors: colors.size, type: png.type, qr };
        }, { ratio, moduleSize: qrData.size });
        assert.equal(exported.width, width); assert.equal(exported.height, height);
        assert.equal(exported.type, 'image/png');
        assert.ok(exported.bytes > 10000 && exported.colors > 100, 'PNG contains the composed image and typography, not a blank canvas');
        const expected = [];
        for (let y = -4; y < qrData.size + 4; y++) for (let x = -4; x < qrData.size + 4; x++) {
            expected.push(x >= 0 && y >= 0 && x < qrData.size && y < qrData.size && Boolean(qrData.get(y, x)));
        }
        assert.deepEqual(exported.qr, expected, `${ratio}: QR modules and four-module white quiet zone survive PNG rendering`);
    }
    await page.evaluate(() => {
        window.downloads = [];
        window.HTMLAnchorElement.prototype.click = function () { window.downloads.push({ href: this.href, name: this.download }); };
    });
    await page.click('#export');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('PNGs exported'));
    assert.match(await page.evaluate(() => window.downloads[0].name), /all-formats.zip$/);
    assert.match(await page.evaluate(() => window.downloads[0].href), /^blob:/);
    const bytes = await page.evaluate(async () => [...new Uint8Array(await (await fetch(window.downloads[0].href)).arrayBuffer())]);
    const zip = new AdmZip(Buffer.from(bytes));
    assert.equal(zip.getEntries().length, 3, 'one download contains every format');
    for (const [ratio, [width, height]] of Object.entries(model.SIZES)) {
        const entry = zip.getEntries().find(item => item.entryName.endsWith(`-${ratio}.png`));
        assert.ok(entry, `${ratio} PNG exists`);
        const png = entry.getData();
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), width);
        assert.equal(png.readUInt32BE(20), height);
    }
    await page.click('[data-ratio="square"]');
    const other = clone(saved.layouts.landscape);
    await page.select('#template', 'minimal');
    assert.equal(await page.$eval('#block-x', el => el.value), '7', 'choosing a starting layout applies it immediately');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const reset = await (await api(`/api/promos/${design.id}`)).json();
    assert.deepEqual(reset.layouts.landscape, other, 'auto-layout never overwrites another ratio');
    const lookSamples = await page.evaluate(async () => {
        const { renderPromo } = await import('/js/promo-renderer.js');
        const results = [];
        for (const theme of Object.keys(window.StudioThemes).filter(key => key !== 'system')) {
            const data = window.PromoModel.normalize({ theme });
            for (const block of Object.values(data.layouts.square.blocks)) block.enabled = false;
            const canvas = document.createElement('canvas');
            await renderPromo(canvas, data, 'square', { preview: false });
            const pixels = canvas.getContext('2d').getImageData(900, 50, 50, 50).data;
            results.push([...pixels].reduce((sum, value, i) => (sum + value * (i + 1)) % 2147483647, 0));
        }
        return results;
    });
    assert.equal(new Set(lookSamples).size, themes.length, 'each shared theme produces its own composed visual treatment, not just a selector label');
    const shapeSamples = await page.evaluate(async photo => {
        const { renderPromo } = await import('/js/promo-renderer.js');
        const results = {};
        for (const shape of ['none', 'rectangle', 'rounded', 'circle']) {
            const data = window.PromoModel.normalize({ photo });
            for (const block of Object.values(data.layouts.square.blocks)) block.enabled = false;
            Object.assign(data.layouts.square.blocks.photo, { enabled: shape !== 'none', shape, radius: 100, x: 10, y: 10, w: 40, h: 40 });
            const canvas = document.createElement('canvas'); await renderPromo(canvas, data, 'square', { preview: false });
            const ctx = canvas.getContext('2d');
            results[shape] = { corner: [...ctx.getImageData(109, 109, 1, 1).data], center: [...ctx.getImageData(324, 324, 1, 1).data] };
        }
        return results;
    }, renamed.url);
    assert.deepEqual(shapeSamples.circle.corner, shapeSamples.none.corner, 'circle crop exposes background outside the logo circle');
    assert.deepEqual(shapeSamples.rounded.corner, shapeSamples.none.corner, 'rounded edges expose background at the corners');
    assert.notDeepEqual(shapeSamples.rectangle.corner, shapeSamples.none.corner);
    assert.notDeepEqual(shapeSamples.circle.center, shapeSamples.none.center);
    const roundedCanvas = await page.evaluate(async () => {
        const { renderPromo } = await import('/js/promo-renderer.js');
        const design = window.PromoModel.normalize(); design.layouts.square.cornerRadius = 100;
        const canvas = document.createElement('canvas'); await renderPromo(canvas, design, 'square', { preview: false });
        return [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data];
    });
    assert.equal(roundedCanvas[3], 0, 'whole-canvas rounding exports transparent corners');
    await page.click('[data-select="photo"]');
    await page.select('#block-shape', 'circle');
    assert.equal(await page.$eval('#radius-control', el => el.hidden), true, 'irrelevant radius control is hidden for circles');
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval('#block-shape', el => el.value), 'rounded', 'shape is independent for each arrangement');
    await page.click('[data-ratio="square"]');
    assert.equal(await page.$eval('#block-shape', el => el.value), 'circle');
    await page.select('#font', 'Georgia');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    assert.equal((await (await api(`/api/promos/${design.id}`)).json()).font, 'Georgia');
    const fontError = await page.evaluate(async () => {
        try { await (await import('/js/promo-fonts.js')).promoFont('Roboto'); return ''; }
        catch (error) { return error.message; }
    });
    assert.match(fontError, /Could not load "Roboto"/, 'export must not silently substitute a failed web font');
    await page.click('[data-ratio="square"]');
    await page.select('#background-mode', 'solid');
    await page.$eval('#background-color', el => { el.value = '#112233'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.$eval('#theme', el => el.value), 'custom');
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval('#background-mode', el => el.value), 'theme');
    await page.select('#background-mode', 'transparent');
    assert.equal(await page.$eval('#background-fill', el => el.hidden), true);
    await page.click('[data-ratio="portrait"]');
    await page.select('#background-mode', 'image');
    await page.click('[data-library="background"]');
    await page.waitForSelector('.promo-asset');
    await page.click('.promo-asset');
    assert.notEqual(await page.$eval('#background-name', el => el.textContent), 'No background image');
    await page.select('#background-fit', 'contain');
    await page.click('#save-theme');
    await page.type('#theme-name', 'Fictional channel style');
    await page.click('#create-theme');
    await page.waitForFunction(() => !document.querySelector('#theme-dialog').open);
    const savedTheme = (await (await api('/api/promo-themes')).json())[0];
    assert.equal(savedTheme.name, 'Fictional channel style');
    assert.equal(savedTheme.background.mode, 'image');
    assert.equal(savedTheme.background.fit, 'contain');
    assert.equal(savedTheme.title, undefined, 'themes store appearance, not promo content');
    await page.click('[data-ratio="square"]');
    assert.equal(await page.$eval('#background-color', el => el.value), '#112233');
    const previousTitleX = await page.$eval('#block-x', el => el.value);
    await page.select('#theme', `saved:${savedTheme.id}`);
    assert.equal(await page.$eval('#background-mode', el => el.value), 'image');
    assert.equal(await page.$eval('#block-x', el => el.value), previousTitleX, 'applying saved appearance never replaces layout geometry');
    await page.select('#background-mode', 'gradient');
    await page.click('#save-theme');
    await page.select('#theme-target', savedTheme.id);
    await page.click('#update-theme');
    await page.waitForFunction(() => !document.querySelector('#theme-dialog').open);
    assert.equal((await (await api(`/api/promo-themes/${savedTheme.id}`)).json()).background.mode, 'gradient');
    await page.select('#template', 'spotlight');
    assert.equal(await page.$eval('#background-mode', el => el.value), 'gradient', 'starting layouts do not reset background configuration');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const backgroundsSaved = createPromoService({ dataDir }).list()[0].layouts;
    assert.equal(backgroundsSaved.square.background.mode, 'gradient');
    assert.equal(backgroundsSaved.landscape.background.mode, 'transparent');
    assert.equal(backgroundsSaved.portrait.background.mode, 'image');
    const imageName = decodeURIComponent(savedTheme.background.image.split('/').pop());
    assert.ok(service.assetUsers(imageName).some(user => user.id === `promo-theme:${savedTheme.id}`));
    await page.click('#save-theme');
    await page.select('#theme-target', savedTheme.id);
    await page.click('#delete-theme');
    await page.waitForFunction(() => !document.querySelector('#theme-dialog').open);
    assert.equal((await api(`/api/promo-themes/${savedTheme.id}`)).status, 404);
    assert.equal(createPromoService({ dataDir }).list()[0].layouts.portrait.background.mode, 'image', 'deleting a theme never changes existing promo backgrounds');
    const backgroundPixels = await page.evaluate(async photo => {
        const { renderPromo } = await import('/js/promo-renderer.js'), output = {};
        const patterns = ['grid', 'geometry', 'orbits', 'hexagons', 'dots', 'diagonal', 'checker'];
        for (const mode of ['solid', 'transparent', 'gradient', 'image', ...patterns]) {
            const design = window.PromoModel.normalize();
            for (const block of Object.values(design.layouts.square.blocks)) block.enabled = false;
            design.layouts.square.background = window.PromoModel.background({
                mode: patterns.includes(mode) ? 'pattern' : mode,
                pattern: mode, color: '#112233', endColor: '#ff0000', angle: 90, image: photo, shade: 0
            });
            const canvas = document.createElement('canvas'); await renderPromo(canvas, design, 'square', { preview: false });
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let fingerprint = 2166136261;
            for (let i = 0; i < data.length; i += 97) fingerprint = Math.imul(fingerprint ^ data[i], 16777619);
            output[mode] = { samples: [10, 540, 1060].map(x => [...ctx.getImageData(x, 540, 1, 1).data]), fingerprint: fingerprint >>> 0 };
        }
        return output;
    }, renamed.url);
    assert.deepEqual(backgroundPixels.solid.samples[1], [17, 34, 51, 255]);
    assert.equal(backgroundPixels.transparent.samples[1][3], 0, 'transparent background stays transparent in export');
    assert.ok(backgroundPixels.gradient.samples[0][0] < backgroundPixels.gradient.samples[2][0], 'gradient angle changes the colors across the canvas');
    assert.deepEqual(backgroundPixels.image.samples[1], [255, 153, 0, 255], 'library image paints behind all blocks');
    assert.equal(new Set(['grid', 'geometry', 'orbits', 'hexagons', 'dots', 'diagonal', 'checker'].map(key => backgroundPixels[key].fingerprint)).size, 7, 'each pattern style produces distinct output');
    assert.equal(model.background({ pattern: 'hexagons' }).pattern, 'hexagons', 'hexagon pattern is persisted by normalization');
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'studio fits narrow screens');
    await page.click('[data-ratio="portrait"]');
    await page.waitForFunction(() => document.querySelector('#preview').height === 1920);
    const stageRatio = await page.$eval('#stage', el => el.clientWidth / el.clientHeight);
    assert.ok(Math.abs(stageRatio - 1080 / 1920) < .01, 'portrait preview and drag handles are not stretched on mobile');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.equal((await api(`/api/promos/${design.id}`, 'DELETE')).status, 200);
    assert.equal(service.list().length, 0);
    assert.equal((await api('/api/promo-themes', 'POST', { name: ' ' })).status, 400);
    assert.equal((await api('/api/promo-themes/missing', 'PUT', { name: 'Fictional' })).status, 404);
    const theme = await (await api('/api/promo-themes', 'POST', { name: 'Fictional background', background: { mode: 'image', image: renamed.url } })).json();
    const backgroundOnly = await (await api('/api/promos', 'POST', { layouts: { portrait: { background: theme.background } } })).json();
    const backups = createBackupService({ backupsDir: path.join(dataDir, 'backups') });
    try {
        fs.writeFileSync(path.join(dataDir, 'stats.json'), '{}');
        const archived = await backups.download({
            files: ['stats.json', 'promos.json', 'promo-themes.json'].map(name => ({ src: path.join(dataDir, name), dest: `data/${name}` })),
            folders: [{ src: assetsDir, dest: 'data/custom-overlay-assets' }]
        }, ({ path: archive }) => fs.readFileSync(archive));
        service.removeTheme(theme.id); service.remove(backgroundOnly.id);
        assert.equal(service.listThemes().length, 0);
        await backups.restore({ dataDir, configPath: path.join(dataDir, 'fixture-config.json') }, Readable.from(archived), result => result);
        assert.equal(service.listThemes()[0].id, theme.id, 'custom themes reload immediately after a full backup restore');
        assert.equal(service.list()[0].layouts.portrait.background.image, renamed.url);
    } finally { await backups.close(); }
    assert.equal(service.assetUsers('renamed.svg').length, 2);
    assert.equal((await api('/api/custom-overlays/assets/renamed.svg', 'DELETE')).status, 409);
    const updatedAsset = await (await api('/api/custom-overlays/assets/renamed.svg/rename', 'POST', { name: 'background-renamed' })).json();
    assert.equal(service.list()[0].layouts.portrait.background.image, updatedAsset.url);
    assert.equal(createPromoService({ dataDir }).listThemes()[0].background.image, updatedAsset.url);
    assert.equal((await api(`/api/promo-themes/${theme.id}`, 'DELETE')).status, 200);
    assert.equal((await api(`/api/promos/${backgroundOnly.id}`, 'DELETE')).status, 200);
    const messages = [];
    t.mock.method(console, 'error', (...args) => messages.push(args.join(' ')));
    fs.writeFileSync(path.join(dataDir, 'promos.json'), '{}');
    assert.equal((await api('/api/promos')).status, 500);
    assert.equal((await api('/api/promos', 'POST', {})).status, 500, 'corrupt storage is not mistaken for invalid user input');
    fs.writeFileSync(path.join(dataDir, 'promo-themes.json'), '{}');
    assert.equal((await api('/api/promo-themes')).status, 500);
    assert.ok(messages.some(message => message.includes('[Promos]')));
});

test('IGDB picker detects actual image formats and reports unavailable credentials and upstream errors explicitly', async t => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-promo-art-'));
    t.after(() => fs.rmSync(assetsDir, { recursive: true, force: true }));
    const unavailable = createPromoArtworkService({ getTwitchClientId: () => '', getAppToken: async () => '' });
    await assert.rejects(unavailable.search('Fictional'), error => error.status === 409);
    const upstream = createPromoArtworkService({
        getTwitchClientId: () => 'fictional', getAppToken: async () => 'fictional',
        fetchImpl: async () => new Response('Unavailable', { status: 503 })
    });
    await assert.rejects(upstream.search('Fictional'), error => error.status === 502);
    const oversized = createPromoArtworkService({
        getTwitchClientId: () => 'fictional', getAppToken: async () => 'fictional',
        fetchImpl: async url => url.includes('api.igdb.com')
            ? Response.json([{ name: 'Fictional', cover: { image_id: 'cover' } }])
            : new Response('oversized', { headers: { 'Content-Length': String(21 * 1024 * 1024) } })
    });
    await assert.rejects(oversized.importImage(42, 'cover'), error => error.status === 413);
    for (const [ext, bytes] of [
        ['jpg', Buffer.from([255, 216, 255, 224])],
        ['png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
        ['webp', Buffer.from('RIFF0000WEBP')],
        ['gif', Buffer.from('GIF89a')],
        ['avif', Buffer.from('0000ftypavif')]
    ]) {
        const service = createPromoArtworkService({
            assetsDir, getTwitchClientId: () => 'fictional', getAppToken: async () => 'fictional',
            fetchImpl: async url => url.includes('api.igdb.com') ? Response.json([{ name: 'Fictional', cover: { image_id: 'cover' } }]) : new Response(bytes)
        });
        const result = await service.importImage(42, 'cover');
        assert.ok(result.name.endsWith(`.${ext}`));
        assert.deepEqual(fs.readFileSync(path.join(assetsDir, result.name)), bytes);
    }
    const invalid = createPromoArtworkService({
        assetsDir, getTwitchClientId: () => 'fictional', getAppToken: async () => 'fictional',
        fetchImpl: async url => url.includes('api.igdb.com') ? Response.json([{ name: 'Fictional', cover: { image_id: 'cover' } }]) : new Response('<html>error page</html>')
    });
    await assert.rejects(invalid.importImage(42, 'cover'), /unsupported image/);
});

const clone = value => JSON.parse(JSON.stringify(value));
