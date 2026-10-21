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
    const elements = clone(model.DEFAULT_ELEMENTS);
    elements.find(element => element.id === 'photo').src = '/custom-overlay-assets/fictional.svg';
    const design = model.normalize({ url: 'https://www.twitch.tv/fictionalstudio', elements });
    design.layouts.square.placements.title.x = 324;
    const restored = model.normalize(design);
    assert.equal(restored.layouts.square.placements.title.x, 324);
    assert.notEqual(restored.layouts.landscape.placements.title.x, 324, 'formats keep independent geometry');
    const titleOf = value => value.elements.find(item => item.id === 'title').style;
    assert.equal(titleOf(restored).fontWeight, 600, 'new headlines use a semibold default');
    assert.equal(restored.elements.find(item => item.id === 'subtitle').style.fontWeight, 400);
    const styled = model.normalize({ elements: [{ id: 'title', type: 'text', role: 'title', content: 'x', style: { fontWeight: 300, letterSpacing: 3, textGradient: { enabled: true } } }] });
    assert.equal(titleOf(styled).fontWeight, 300);
    assert.equal(titleOf(styled).letterSpacing, 3);
    assert.equal(titleOf(styled).textGradient.enabled, true);
    assert.equal(titleOf(model.normalize({ elements: [{ id: 'title', type: 'text', role: 'title', content: 'x', style: { fontWeight: 550 } }] })).fontWeight, 600, 'unsupported font weights fall back safely');
    for (const ratio of Object.keys(model.SIZES)) {
        const [width, height] = model.SIZES[ratio];
        const next = model.normalize({ layouts: { [ratio]: { placements: { title: { x: width - 1, y: height - 1, width: 900, height: 900 } }, order: ['title', 'title', 'invalid'] } } });
        const b = next.layouts[ratio].placements.title;
        assert.ok(b.x + b.width <= width && b.y + b.height <= height);
        assert.equal(next.layouts[ratio].order.length, next.elements.length);
    }
    for (const url of ['javascript:alert(1)', 'https://example.test/channel', 'https://twitch.tv/name?x=1']) assert.throws(() => model.normalize({ url }));
    for (const src of ['https://example.test/image.png', '/custom-overlay-assets/..%2Fsecret.png', '/custom-overlay-assets/file.mp4']) {
        const invalid = clone(model.DEFAULT_ELEMENTS);
        invalid.find(element => element.id === 'photo').src = src;
        assert.throws(() => model.normalize({ elements: invalid }));
    }
    assert.equal(restored.url, 'https://twitch.tv/fictionalstudio');
    assert.equal(model.assetUrl('/custom-overlay-assets/game art.jpg'), '/custom-overlay-assets/game%20art.jpg');
    const malformed = model.normalize({ theme: '__proto__', layouts: { square: { placements: { title: { x: 1078, y: 1078, width: 'invalid', height: null } } } } });
    assert.equal(malformed.layouts.square.placements.title.width, 2);
    assert.equal(malformed.layouts.square.placements.title.height, 2);
    assert.equal(malformed.theme, 'midnight');
    assert.equal(model.normalize({ layouts: { square: { template: 'minimal' } } }).layouts.square.placements.photo.visible, false);
    assert.throws(() => model.normalize({ background: { mode: 'image', image: 'https://example.test/image.png' } }), /Asset Library/);
    const background = model.background({ mode: 'gradient', angle: 900, shade: -10, focusX: 'bad' });
    assert.equal(background.angle, 360); assert.equal(background.shade, 0); assert.equal(background.focusX, 50);
    assert.equal(model.background({ vignette: 140 }).vignette, 100);
    assert.equal(model.background({ motion: 'sweep' }).motion, 'sweep');
    assert.equal(model.background({ motion: 'unexpected' }).motion, 'none');
    assert.equal(model.PATTERNS.length, 20, 'the model publishes the expanded pattern library');
    assert.equal(model.normalize().background.vignette, 18, 'new promos start with a subtle vignette');
    assert.equal(model.normalize({ background: { mode: 'pattern', pattern: 'hexagons' } }).background.vignette, 0, 'existing layouts do not gain a vignette during migration');
    const fresh = model.normalize(), overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const ratio of Object.keys(model.SIZES)) {
        const placements = fresh.layouts[ratio].placements, art = placements.artwork;
        assert.equal(art.visible, false, 'empty artwork layers start hidden');
        assert.equal(fresh.elements.find(item => item.id === 'artwork').style.objectFit, 'contain', 'game artwork starts uncropped');
        for (const key of ['photo', 'badge', 'title', 'subtitle', 'url', 'qr']) {
            assert.equal(overlaps(art, placements[key]), false, `${ratio} artwork starts clear of ${key}`);
        }
    }
    const customText = model.createElement('text', 'custom-message');
    const customImage = model.createElement('image', 'custom-image');
    const customQr = model.createElement('qr', 'custom-qr');
    assert.equal(customQr.source, 'channel-url', 'new QR elements use the promo destination by default');
    const shared = model.normalize({ elements: [...model.DEFAULT_ELEMENTS, customText, customImage, customQr] });
    assert.equal(shared.elements.find(item => item.id === customText.id).content, 'Text element');
    assert.ok(Object.values(shared.layouts).every(layout => layout.placements[customText.id] && layout.placements[customImage.id] && layout.placements[customQr.id]));
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
    const initial = model.normalize({ url: 'fictionalstudio' });
    initial.elements.find(element => element.id === 'photo').src = '/custom-overlay-assets/fictional.svg';
    let response = await api('/api/promos', 'POST', initial);
    assert.equal(response.status, 201);
    const design = await response.json();
    assert.equal((await api('/api/promos/missing', 'PUT', design)).status, 404);
    const invalidDesign = model.normalize();
    invalidDesign.elements.find(element => element.id === 'photo').src = '/private.png';
    assert.equal((await api('/api/promos', 'POST', invalidDesign)).status, 400);
    assert.equal((await api('/api/promos', 'PATCH', {})).status, 405);
    assert.equal(service.assetUsers('fictional.svg')[0].id, `promo:${design.id}`);
    assert.equal((await api('/api/custom-overlays/assets/fictional.svg', 'DELETE')).status, 409, 'used promo assets cannot be accidentally deleted');
    assert.ok((await (await api('/api/custom-overlays/assets')).json())[0].usedBy.some(item => item.id === `promo:${design.id}`));
    response = await api('/api/custom-overlays/assets/fictional.svg/rename', 'POST', { name: 'renamed' });
    assert.equal(response.status, 200);
    const renamed = await response.json();
    const stored = (await (await api('/api/promos')).json())[0];
    assert.equal(stored.elements.find(element => element.id === 'photo').src, renamed.url, 'asset rename updates saved promo images');
    assert.equal(createPromoService({ dataDir }).list()[0].elements.find(element => element.id === 'photo').src, renamed.url, 'restart reads persistent data');

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
    const P = path => `#properties [data-path="${path}"]`;
    const setField = (selector, value) => page.$eval(selector, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return new Promise(r => window.requestAnimationFrame(() => window.requestAnimationFrame(r))); }, String(value));
    await page.setViewport({ width: 1500, height: 1000 });
    await page.goto(`${origin}/promo-creator.html?id=${design.id}`);
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
    await page.waitForFunction(() => document.querySelector('#preview').width === 1080);
    assert.equal(await page.evaluate(() => window.localStorage.getItem('streampulse.promo.lastId')), design.id, 'opening a saved promo remembers it');
    assert.deepEqual(await page.evaluate(async () => {
        const { alignmentOffset, snapAxis } = await import('/js/editor-geometry.js');
        return {
            aligned: alignmentOffset({ x: 10, y: 20, w: 30, h: 40 }, { x: 0, y: 0, w: 100, h: 100 }, 'center'),
            snapped: snapAxis([92, 96], [100, 150], 8)
        };
    }), { aligned: { x: 25, y: 0 }, snapped: { delta: 4, lines: [100] } }, 'Promo Creator and the overlay editor share alignment and snapping geometry');
    await page.goto(`${origin}/promo-creator.html`);
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
    assert.equal(await page.$eval('#saved', el => el.value), design.id, 'opening the editor without an id restores the last saved promo');
    await page.click('#new-design');
    assert.equal(await page.$eval('#saved', el => el.value), '', 'New still starts an unsaved design');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
    assert.equal(await page.$eval('#saved', el => el.value), design.id, 'a deliberate New action does not replace the last saved design');
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
    assert.equal(await page.$eval('#rail-tab-layers', el => el.getAttribute('aria-selected')), 'true', 'layers is the default settings tab');
    await page.click('#rail-tab-content');
    await page.click('#rail-tab-appearance');
    assert.equal(await page.$eval('#appearance-panel', el => el.hidden), false, 'appearance controls are directly available from their tab');
    await page.focus('#rail-tab-appearance');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.$eval('#rail-tab-content', el => el.getAttribute('aria-selected')), 'true', 'settings tabs support arrow-key navigation');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('#appearance-panel', el => el.hidden), false);
    await setField('#style-fields [data-path="background.mode"]', 'pattern');
    assert.deepEqual(await page.$$eval('#style-fields [data-path="background.pattern"] option', options => options.map(option => option.value)), model.PATTERNS, 'every model pattern is available in the editor');
    assert.equal(await page.$('#theme-gallery'), null);
    await page.focus('#tab-square');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('#tab-landscape', el => el.getAttribute('aria-selected')), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.$eval('#tab-square', el => el.tabIndex), 0, 'ratio tabs support arrow and Home navigation');
    assert.match(await page.$eval('.topbar .back', el => el.textContent), /Dashboard/, 'Promo Creator is a tool, not a live overlay');
    imageData = Buffer.from(await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        canvas.getContext('2d').fillRect(0, 0, 64, 64);
        return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.$eval('#title', el => { el.value = 'Fictional launch night'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#rail-tab-layers');
    await page.click('[data-select="title"]');
    await setField(P('x'), 130);
    await setField(P('style.fontWeight'), 300);
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval(P('x'), el => el.value), '77');
    assert.equal(await page.$eval(P('style.fontWeight'), el => el.value), '300', 'font weight is part of the shared element style');
    await page.click('[data-ratio="square"]');
    assert.equal(await page.$eval(P('x'), el => el.value), '130', 'switching formats restores the edited arrangement');
    acceptDialogs = false;
    await page.select('#template', 'spotlight');
    assert.equal(await page.$eval('#template', el => el.value), 'editorial', 'canceling a layout replacement restores the dropdown');
    assert.equal(await page.$eval(P('x'), el => el.value), '130', 'canceled replacements preserve manual layout edits');
    acceptDialogs = true;
    await page.$eval('#stage', el => el.scrollIntoView({ block: 'center' }));
    const titleBox = await page.$('#els [data-id="title"]').then(el => el.boundingBox());
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down(); await page.mouse.move(titleBox.x + titleBox.width / 2 + 15, titleBox.y + titleBox.height / 2 + 10); await page.mouse.up();
    assert.ok(Number(await page.$eval(P('x'), el => el.value)) > 130, 'pointer dragging changes the selected element');
    const beforeResize = Number(await page.$eval(P('width'), el => el.value));
    const resize = await page.$('#sel .rh').then(el => el.boundingBox());
    await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
    await page.mouse.down(); await page.mouse.move(resize.x - 20, resize.y - 10); await page.mouse.up();
    assert.ok(Number(await page.$eval(P('width'), el => el.value)) < beforeResize, 'corner handle resizes the element');
    await new Promise(r => setTimeout(r, 500));
    const beforeNudge = Number(await page.$eval(P('x'), el => el.value));
    await page.focus('#stage'); await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
    assert.ok(Number(await page.$eval(P('x'), el => el.value)) < beforeNudge, 'keyboard nudging works after dragging');
    assert.equal(await page.$eval('#dirty', el => el.hidden), false, 'edits show the dirty indicator');
    const afterNudge = await page.$eval(P('x'), el => el.value);
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    assert.notEqual(await page.$eval(P('x'), el => el.value), afterNudge, 'undo reverts the last coalesced edit');
    await page.click('#rail-tab-layers');
    await page.click('[data-select="title"]');
    await setField(P('x'), 130);
    await setField(P('style.fontWeight'), 300);
    await setField(P('y'), 700); await setField(P('width'), 930); await setField(P('height'), 150);
    await page.click('#rail-tab-content');
    await page.click('[data-library="artwork"]');
    await page.waitForSelector('.promo-asset');
    await page.click('.promo-asset');
    assert.match(await page.$eval('#artwork-name', el => el.textContent), /renamed/);
    for (const ratio of Object.keys(model.SIZES)) {
        await page.click(`[data-ratio="${ratio}"]`);
    await page.click('#rail-tab-layers');
        await page.click('[data-select="artwork"]');
        assert.equal(await page.$eval(P('visible'), el => el.checked), true, `added artwork is enabled in ${ratio}`);
    }
    await page.click('[data-ratio="square"]');
    await page.click('#rail-tab-layers');
    await page.click('[data-select="title"]');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    let saved = await (await api(`/api/promos/${design.id}`)).json();
    assert.equal(saved.layouts.square.placements.title.x, 130);
    assert.equal(saved.elements.find(item => item.id === 'title').style.fontWeight, 300);
    assert.equal(saved.elements.find(item => item.id === 'title').content, 'Fictional launch night');
    assert.equal(saved.elements.find(item => item.id === 'artwork').src, renamed.url);
    const fontWeightPixels = await page.evaluate(async () => {
        const { renderPromo } = await import('/js/promo-renderer.js');
        const render = async fontWeight => {
            const design = window.PromoModel.normalize();
            for (const placement of Object.values(design.layouts.square.placements)) placement.visible = false;
            design.elements.find(item => item.id === 'title').content = 'Weight sample';
            Object.assign(design.layouts.square.placements.title, { visible: true, x: 108, y: 270, width: 864, height: 260 });
            Object.assign(design.elements.find(item => item.id === 'title').style, { fontSize: 100, fontWeight, color: '#ffffff' });
            design.background.mode = 'transparent';
            const canvas = document.createElement('canvas');
            await renderPromo(canvas, design, 'square');
            return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const [light, heavy] = await Promise.all([render(300), render(900)]);
        let differences = 0;
        for (let i = 0; i < light.length; i += 4) if (light[i] !== heavy[i] || light[i + 1] !== heavy[i + 1] || light[i + 2] !== heavy[i + 2]) differences++;
        return differences;
    });
    assert.ok(fontWeightPixels > 0, 'changing a saved font weight changes rendered text pixels');
    await page.click('#add-element');
    await page.click('[data-add-element="text"]');
    const customTextId = await page.$eval('#block-list .layer.selected', row => row.dataset.id);
    await setField('#properties textarea[data-path="content"]', 'A shared custom message');
    await page.click('[data-seg-path="style.textAlign"] [data-seg-value="center"]');
    await setField(P('style.fontFamily'), 'serif');
    await setField(P('x'), 130);
    await page.click('[data-align="center"]');
    assert.equal(await page.$eval(P('x'), el => Number(el.value) > 130 || Number(el.value) < 130), true, 'alignment tools reposition the element');
    await setField(P('x'), 130);
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval('#properties textarea[data-path="content"]', el => el.value), 'A shared custom message', 'element content is shared when switching formats');
    assert.notEqual(await page.$eval(P('x'), el => el.value), '130', 'new text elements retain separate placements per format');
    await page.click('[data-ratio="square"]');
    assert.equal(await page.$eval(P('x'), el => el.value), '130');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    saved = await (await api(`/api/promos/${design.id}`)).json();
    const savedCustomText = saved.elements.find(item => item.id === customTextId);
    assert.equal(savedCustomText.type, 'text');
    assert.equal(savedCustomText.content, 'A shared custom message');
    assert.equal(savedCustomText.style.textAlign, 'center');
    assert.equal(savedCustomText.style.fontFamily, 'serif');
    assert.equal(saved.layouts.square.placements[customTextId].x, 130);
    await page.click('#rail-tab-layers');
    await page.waitForSelector('#block-list [data-select="title"]', { visible: true });
    await page.$eval('#block-list [data-select="title"]', el => el.click());
    await page.click('#rail-tab-content');
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
    const artworkUrl = withArtwork.elements.find(item => item.id === 'artwork').src;
    assert.match(artworkUrl, /^\/custom-overlay-assets\/igdb-/);
    assert.ok(service.assetUsers(decodeURIComponent(artworkUrl.split('/').pop())).length);
    assert.equal(upstreamRequests.find(entry => entry.url.includes('/t_original/')).redirect, 'error');
    assert.ok(upstreamRequests.every(entry => entry.signal instanceof AbortSignal), 'all upstream requests have deadlines');
    assert.equal((await api('/api/promos/igdb/import', 'POST', { gameId: 42, imageId: 'unrelated' })).status, 400);
    assert.equal((await api('/api/promos/igdb/import', 'POST', { gameId: '../private', imageId: 'art42' })).status, 400);

    const themes = Object.keys(require('../public/js/studio-themes')).filter(key => key !== 'system');
    await page.click('#rail-tab-appearance');
    for (const theme of themes) {
        await page.select('#theme', theme);
        assert.equal(await page.$eval('#theme', el => el.value), theme);
        assert.equal(await page.$eval('#title', el => el.value), 'Fictional launch night', 'one-click looks preserve user content');
        assert.equal(await page.$eval(P('x'), el => el.value), '130', 'one-click looks preserve layout edits');
    }
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const themedFormats = await (await api(`/api/promos/${design.id}`)).json();
    assert.equal(themedFormats.background.theme, 'matrix');

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
            const b = data.layouts[ratio].placements.qr;
            const box = { x: b.x, y: b.y, w: b.width, h: b.height };
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
    await page.click('#rail-tab-layers');
    assert.equal(await page.$eval(P('x'), el => el.value), '76', 'choosing a starting layout applies it immediately');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const reset = await (await api(`/api/promos/${design.id}`)).json();
    assert.deepEqual(reset.layouts.landscape, other, 'auto-layout never overwrites another ratio');
    const lookSamples = await page.evaluate(async () => {
        const { renderPromo } = await import('/js/promo-renderer.js');
        const results = [];
        for (const theme of Object.keys(window.StudioThemes).filter(key => key !== 'system')) {
            const data = window.PromoModel.normalize({ theme });
            for (const placement of Object.values(data.layouts.square.placements)) placement.visible = false;
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
            const elements = JSON.parse(JSON.stringify(window.PromoModel.DEFAULT_ELEMENTS));
            elements.find(item => item.id === 'photo').src = photo;
            const data = window.PromoModel.normalize({ elements });
            for (const placement of Object.values(data.layouts.square.placements)) placement.visible = false;
            Object.assign(data.layouts.square.placements.photo, { visible: shape !== 'none', x: 108, y: 108, width: 432, height: 432 });
            Object.assign(data.elements.find(item => item.id === 'photo').style, { objectFit: 'cover', focusX: 50, focusY: 50, shape: shape === 'none' ? 'rectangle' : shape, borderRadius: 100 });
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
        const design = window.PromoModel.normalize(); design.cornerRadius = 100;
        const canvas = document.createElement('canvas'); await renderPromo(canvas, design, 'square', { preview: false });
        return [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data];
    });
    assert.equal(roundedCanvas[3], 0, 'whole-canvas rounding exports transparent corners');
    await page.click('#rail-tab-layers');
    await page.click('[data-select="photo"]');
    await setField(P('style.shape'), 'circle');
    assert.equal(await page.$(P('style.borderRadius')), null, 'irrelevant radius control is hidden for circles');
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval(P('style.shape'), el => el.value), 'circle', 'shape is part of the shared element style');
    await page.click('[data-ratio="square"]');
    await page.click('#rail-tab-appearance');
    await setField('#style-fields [data-path="font"]', 'Georgia');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    assert.equal((await (await api(`/api/promos/${design.id}`)).json()).font, 'Georgia');
    const fontError = await page.evaluate(async () => {
        try { await (await import('/js/promo-fonts.js')).promoFont('Roboto'); return ''; }
        catch (error) { return error.message; }
    });
    assert.match(fontError, /Could not load "Roboto"/, 'export must not silently substitute a failed web font');
    await page.click('[data-ratio="square"]');
    await setField('#style-fields [data-path="background.mode"]', 'solid');
    await setField('#style-fields [data-path="background.color"]', '#112233');
    assert.equal(await page.$eval('#theme', el => el.value), 'custom');
    await page.click('[data-ratio="landscape"]');
    assert.equal(await page.$eval('#style-fields [data-path="background.mode"]', el => el.value), 'solid', 'background is shared across formats');
    await setField('#style-fields [data-path="background.mode"]', 'transparent');
    assert.equal(await page.$('#style-fields [data-path="background.color"]'), null);
    await page.click('[data-ratio="portrait"]');
    await setField('#style-fields [data-path="background.mode"]', 'image');
    await page.click('#rail-tab-appearance');
    await page.click('[data-library="background"]');
    await page.waitForSelector('#asset-grid .promo-asset', { visible: true });
    await page.click('#asset-grid .promo-asset');
    assert.notEqual(await page.$eval('#background-name', el => el.textContent), 'No background image');
    await setField('#style-fields [data-path="background.fit"]', 'contain');
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
    assert.equal(await page.$eval('#style-fields [data-path="background.mode"]', el => el.value), 'image');
    const previousTitleX = await page.$eval(P('x'), el => el.value);
    await page.select('#theme', `saved:${savedTheme.id}`);
    assert.equal(await page.$eval('#style-fields [data-path="background.mode"]', el => el.value), 'image');
    assert.equal(await page.$eval(P('x'), el => el.value), previousTitleX, 'applying saved appearance never replaces layout geometry');
    await setField('#style-fields [data-path="background.mode"]', 'gradient');
    await page.click('#save-theme');
    await page.select('#theme-target', savedTheme.id);
    await page.click('#update-theme');
    await page.waitForFunction(() => !document.querySelector('#theme-dialog').open);
    assert.equal((await (await api(`/api/promo-themes/${savedTheme.id}`)).json()).background.mode, 'gradient');
    await page.select('#template', 'spotlight');
    assert.equal(await page.$eval('#style-fields [data-path="background.mode"]', el => el.value), 'gradient', 'starting layouts do not reset background configuration');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    const backgroundsSaved = createPromoService({ dataDir }).list()[0];
    assert.equal(backgroundsSaved.background.mode, 'gradient');
    await page.click('[data-ratio="square"]');
    await setField('#style-fields [data-path="background.mode"]', 'pattern');
    await setField('#style-fields [data-path="background.pattern"]', 'hexagons');
    assert.ok(await page.$('#style-fields [data-path="background.motion"]'));
    await setField('#style-fields [data-path="background.motion"]', 'sweep');
    await setField('#style-fields [data-path="background.vignette"]', '42');
    assert.equal(await page.$eval('#save-design', el => el.textContent), 'Save changes', 'appearance edits visibly require saving');
    await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Design saved.'));
    let savedPattern = await (await api(`/api/promos/${design.id}`)).json();
    assert.equal(savedPattern.background.mode, 'pattern');
    assert.equal(savedPattern.background.pattern, 'hexagons', 'pattern selection is serialized with the saved format');
    assert.equal(savedPattern.background.motion, 'sweep', 'pattern motion is serialized with the saved format');
    assert.equal(savedPattern.background.vignette, 42);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
    await page.waitForFunction(() => document.querySelector('#preview').width === 1080);
    assert.equal(await page.$eval('#rail-tab-appearance', el => el.getAttribute('aria-selected')), 'true', 'the active settings tab is restored after reload');
    assert.equal(await page.$eval('#style-fields [data-path="background.mode"]', el => el.value), 'pattern');
    assert.equal(await page.$eval('#style-fields [data-path="background.pattern"]', el => el.value), 'hexagons', 'pattern choice restores from the saved promo');
    assert.equal(await page.$eval('#style-fields [data-path="background.motion"]', el => el.value), 'sweep', 'pattern motion restores from the saved promo');
    assert.equal(await page.$eval('#style-fields [data-path="background.vignette"]', el => el.value), '42');
    assert.ok(Object.values(savedPattern.layouts).every(layout => layout.placements.artwork.visible), 'shared artwork is enabled in all saved formats');
    const imageName = decodeURIComponent(savedTheme.background.image.split('/').pop());
    assert.ok(service.assetUsers(imageName).some(user => user.id === `promo-theme:${savedTheme.id}`));
    await page.click('#save-theme');
    await page.select('#theme-target', savedTheme.id);
    await page.click('#delete-theme');
    await page.waitForFunction(() => !document.querySelector('#theme-dialog').open);
    assert.equal((await api(`/api/promo-themes/${savedTheme.id}`)).status, 404);
    assert.equal(createPromoService({ dataDir }).list()[0].background.mode, 'pattern', 'deleting a theme never changes existing promo backgrounds');
    const backgroundPixels = await page.evaluate(async photo => {
        const { renderPromo } = await import('/js/promo-renderer.js'), output = {};
        const patterns = window.PromoModel.PATTERNS;
        for (const mode of ['solid', 'transparent', 'gradient', 'image', 'vignette', ...patterns]) {
            const design = window.PromoModel.normalize();
            for (const placement of Object.values(design.layouts.square.placements)) placement.visible = false;
            design.background = window.PromoModel.background({
                mode: patterns.includes(mode) ? 'pattern' : mode === 'vignette' ? 'solid' : mode,
                pattern: mode, color: mode === 'vignette' ? '#ffffff' : '#112233', endColor: '#ff0000', angle: 90, image: photo, shade: 0,
                vignette: ['vignette', 'transparent'].includes(mode) ? 60 : 0
            });
            const canvas = document.createElement('canvas'); await renderPromo(canvas, design, 'square', { preview: false });
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let fingerprint = 2166136261;
            for (let i = 0; i < data.length; i += 97) fingerprint = Math.imul(fingerprint ^ data[i], 16777619);
            output[mode] = { samples: [[10, 540], [540, 540], [1060, 540]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]), fingerprint: fingerprint >>> 0 };
        }
        const hexDesign = window.PromoModel.normalize();
        for (const placement of Object.values(hexDesign.layouts.square.placements)) placement.visible = false;
        hexDesign.background = window.PromoModel.background({
            mode: 'pattern', pattern: 'hexagons', color: '#112233', vignette: 0
        });
        const hexCanvas = document.createElement('canvas');
        await renderPromo(hexCanvas, hexDesign, 'square', { preview: false });
        const hexCtx = hexCanvas.getContext('2d');
        const radius = Math.max(24, 1080 / 28), rowStep = Math.sqrt(3) * radius;
        const center = { x: 8 * radius * 1.5, y: 8 * rowStep };
        const pixel = (x, y) => [...hexCtx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
        output.hexGridEdgeContrast = Array.from({ length: 6 }, (_, edge) => {
            const angle = (edge + .5) * Math.PI / 3;
            const normal = { x: Math.cos(angle), y: Math.sin(angle) };
            const apothem = radius * Math.cos(Math.PI / 6);
            const midpoint = { x: center.x + normal.x * apothem, y: center.y + normal.y * apothem };
            const outside = [pixel(midpoint.x - normal.x * 6, midpoint.y - normal.y * 6), pixel(midpoint.x + normal.x * 6, midpoint.y + normal.y * 6)];
            const reference = outside[0].map((value, channel) => (value + outside[1][channel]) / 2);
            let contrast = 0;
            for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
                const candidate = pixel(midpoint.x + dx, midpoint.y + dy);
                contrast = Math.max(contrast, Math.hypot(...candidate.map((value, channel) => value - reference[channel])));
            }
            return contrast;
        });
        return output;
    }, renamed.url);
    assert.deepEqual(backgroundPixels.solid.samples[1], [17, 34, 51, 255]);
    assert.equal(backgroundPixels.transparent.samples[1][3], 0, 'transparent background stays transparent in export');
    assert.ok(backgroundPixels.gradient.samples[0][0] < backgroundPixels.gradient.samples[2][0], 'gradient angle changes the colors across the canvas');
    assert.ok(backgroundPixels.vignette.samples[1][0] > backgroundPixels.vignette.samples[0][0], 'vignette shades the edges without darkening its center');
    assert.deepEqual(backgroundPixels.image.samples[1], [255, 153, 0, 255], 'library image paints behind all blocks');
    assert.equal(new Set(model.PATTERNS.map(key => backgroundPixels[key].fingerprint)).size, model.PATTERNS.length, 'each selectable pattern produces distinct output');
    const motionFrames = await page.evaluate(async () => {
        const { renderPromo } = await import('/js/promo-renderer.js'), hashes = [];
        const design = window.PromoModel.normalize();
        for (const placement of Object.values(design.layouts.square.placements)) placement.visible = false;
        design.background = window.PromoModel.background({ mode: 'pattern', pattern: 'starfield', motion: 'sweep', color: '#112233' });
        const canvas = document.createElement('canvas');
        for (const time of [0, 1.5, 6]) {
            await renderPromo(canvas, design, 'square', { preview: false, time });
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261;
            for (let i = 0; i < pixels.length; i += 97) hash = Math.imul(hash ^ pixels[i], 16777619);
            hashes.push(hash >>> 0);
        }
        return hashes;
    });
    assert.notEqual(motionFrames[0], motionFrames[1], 'animated motion changes rendered frames');
    assert.equal(motionFrames[0], motionFrames[2], 'pattern motion returns to the same frame for a seamless six-second loop');
    assert.ok(backgroundPixels.hexGridEdgeContrast.every(contrast => contrast > 8), 'all six edges around an interior hexagon are drawn in a connected tessellation');
    assert.equal(model.background({ pattern: 'hexagons' }).pattern, 'hexagons', 'hexagon pattern is persisted by normalization');
    assert.equal(model.background({ pattern: 'topography' }).pattern, 'topography', 'new patterns are preserved by normalization');
    assert.equal(model.background({ motion: 'drift' }).motion, 'drift', 'pattern motion is preserved by normalization');
    const mp4Export = await page.evaluate(async () => {
        const { exportAnimation, supportsMp4 } = await import('/js/promo-export.js');
        const supported = await supportsMp4();
        if (!supported) return { supported };
        const id = new URLSearchParams(window.location.search).get('id');
        const design = await (await fetch(`/api/promos/${id}`)).json();
        const result = await exportAnimation(design, 'square', { seconds: .2 });
        const header = new window.TextDecoder().decode(await result.blob.slice(0, 32).arrayBuffer());
        return { supported, type: result.blob.type, size: result.blob.size, name: result.name, header };
    });
    if (mp4Export.supported) {
        assert.match(mp4Export.type, /^video\/mp4(?:;codecs=avc1[^,;]+)?$/);
        assert.ok(mp4Export.size > 1000, 'MP4 export contains encoded video data');
        assert.match(mp4Export.name, /-square-animated\.mp4$/);
        assert.ok(mp4Export.header.includes('ftyp'), 'MP4 export contains the expected MP4 file signature');
    } else {
        assert.equal(await page.$eval('#animation-export', el => el.disabled), true, 'MP4 export is disabled when the browser has no H.264 encoder');
    }
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
    const backgroundOnly = await (await api('/api/promos', 'POST', { background: theme.background })).json();
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
        assert.equal(service.list()[0].background.image, renamed.url);
    } finally { await backups.close(); }
    assert.equal(service.assetUsers('renamed.svg').length, 2);
    assert.equal((await api('/api/custom-overlays/assets/renamed.svg', 'DELETE')).status, 409);
    const updatedAsset = await (await api('/api/custom-overlays/assets/renamed.svg/rename', 'POST', { name: 'background-renamed' })).json();
    assert.equal(service.list()[0].background.image, updatedAsset.url);
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
