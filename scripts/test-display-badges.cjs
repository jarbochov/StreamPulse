const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { WebSocketServer } = require('ws');
const { createStaticRouter } = require('../server/static-router');
const { normalizeCustomOverlay } = require('../server/services/overlays');
const { normalizeBadge, migrateDisplayBadges } = require('../server/services/display-badges');
const { normalizeDisplay } = require('../shared/variable-displays.cjs');
const fixture = require('./fixtures/variable-display.cjs');

test('legacy badge migration preserves visuals, separates sources, deduplicates and is idempotent', () => {
    const saved = new Map(), displays = { get: id => saved.get(id), save: (value, id) => saved.set(id, value) };
    const source = { setId: 'people', filterMode: 'all', onlySelected: true };
    const element = normalizeCustomOverlay({
        id: 'legacy', elements: [{
            id: 'member', type: 'image', x: 123, width: 640, height: 360,
            imageGroup: { enabled: true, ...source, imageField: 'avatar', showLabels: true, fields: [{ key: 'name', role: 'title', fontFamily: 'Georgia', slot: 'header', color: '@color' }], cardBorderAnimation: { type: 'rotating', speed: 5 } },
            style: { fontSize: 24, rotate: 12, background: '#11223388' }, mediaFilter: { brightness: 120 }
        }]
    }).elements[0];
    const expected = normalizeBadge({ imageGroup: element.imageGroup, style: { ...element.style, rotate: 0 }, mediaFilter: element.mediaFilter, width: element.width, height: element.height });
    const overlays = { one: { id: 'one', elements: [element] }, two: { id: 'two', elements: [{ ...globalThis.structuredClone(element), id: 'second', imageGroup: { ...element.imageGroup, onlySelected: false } }] } };
    let writes = 0;
    const migrate = () => migrateDisplayBadges({ overlays, displays, sets: fixture.sets, saveOverlays: () => writes++ });
    assert.equal(migrate(), 2);
    assert.equal(saved.size, 1);
    assert.equal(element.x, 123);
    assert.equal(element.style.rotate, 12);
    assert.equal(element.type, 'data-display');
    for (const [key, value] of Object.entries(source)) assert.deepEqual(element.display.badgeSource[key], value);
    assert.deepEqual(saved.values().next().value.badge, expected);
    assert.equal(Object.hasOwn(expected.imageGroup, 'setId'), false);
    assert.equal(migrate(), 0);
    assert.equal(writes, 1);
});

test('failed badge persistence retains original saved layer without crashing migration', () => {
    const element = { id: 'member', type: 'image', imageGroup: { enabled: true, setId: 'people' }, style: { color: '#ffffff' } };
    const original = globalThis.structuredClone(element);
    assert.equal(migrateDisplayBadges({
        overlays: [{ elements: [element] }], displays: { get: () => null, save: () => { throw new Error('Library full'); } },
        saveOverlays: () => assert.fail('must not save'), warn: () => {}
    }), 0);
    assert.deepEqual(element, original);
    const saved = new Map();
    assert.equal(migrateDisplayBadges({
        overlays: [{ elements: [element] }], displays: { get: id => saved.get(id), save: (value, id) => saved.set(id, value) },
        saveOverlays: () => { throw new Error('Read-only overlay file'); }, warn: () => {}
    }), 0);
    assert.deepEqual(element, original, 'failed overlay write restores the complete original layer');
});

test('server startup migrates saved badges and reusable presets on the first launch', t => {
    const dataDir = fs.mkdtempSync(path.join(process.cwd(), '.display-badge-test-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const badge = {
        id: 'legacy-badge', type: 'image', width: 720, height: 220,
        imageGroup: { enabled: true, setId: 'people', imageField: 'avatar', showLabels: true },
        style: { color: '#ffffff' }
    };
    const write = (file, value) => fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value));
    write('config.json', { obs_scene_sync_enabled: false });
    write('variable-sets.json', Object.fromEntries(fixture.sets.map(set => [set.id, set])));
    write('custom-overlays.json', { expedition: { id: 'expedition', name: 'Expedition', elements: [badge] } });
    write('overlay-presets.json', [{ id: 'expedition-preset', name: 'Expedition preset', elements: [badge] }]);
    const child = spawnSync(process.execPath, ['-e', `
        const fs = require('fs'), path = require('path'), assert = require('assert/strict');
        const app = require('./server');
        const read = file => JSON.parse(fs.readFileSync(path.join(process.env.STREAMPULSE_DATA_DIR, file), 'utf8'));
        const overlay = read('custom-overlays.json').expedition.elements[0];
        const preset = read('overlay-presets.json').find(item => item.id === 'expedition-preset').elements[0];
        assert.equal(overlay.type, 'data-display');
        assert.equal(preset.type, 'data-display');
        assert.equal(overlay.display.displayId, preset.display.displayId);
        assert.equal(read('variable-displays.json').length, 1);
        app.stopServer().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
    `], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 20000,
        env: { ...process.env, STREAMPULSE_DATA_DIR: dataDir, STREAMPULSE_EMBEDDED: 'true' }
    });
    assert.equal(child.status, 0, child.stderr || child.stdout || child.error?.message);
});

test('standalone library badge builder preserves rich fields, previews and mounted color inputs', { timeout: 60000 }, async t => {
    const sets = globalThis.structuredClone(fixture.sets);
    const variables = [{ name: 'badge_size', type: 'number', value: '32' }, { name: 'badge_accent', type: 'color', value: '#00aacc' }];
    const people = sets.find(set => set.id === 'people');
    people.fields.push({ key: 'team_color', label: 'Team color', type: 'color' });
    people.roster.forEach(member => { member.values.team_color = '#3377cc'; });
    let badge = fixture.badge || { id: 'badge-fixture', name: 'Fictional badge', kind: 'badge', catalogId: 'people', badge: normalizeBadge({ imageGroup: { showAvatar: false, showLabels: true, fields: [{ key: 'name', role: 'title' }] } }) };
    const router = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname.startsWith('/api/variable-displays') && ['PUT', 'POST'].includes(req.method)) {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    const input = JSON.parse(body);
                    badge = { ...normalizeDisplay({ ...input, id: input.id || 'new-badge' }), badge: normalizeBadge(input.badge) };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ display: badge }));
                });
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(url.pathname === '/api/variable-displays' ? { displays: [fixture.display, fixture.table, badge], revision: 1 }
                : url.pathname === '/api/variables' ? { sets, variables } : {}));
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const sockets = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => { await browser.close(); sockets.clients.forEach(socket => socket.terminate()); await new Promise(resolve => sockets.close(resolve)); await new Promise(resolve => server.close(resolve)); });
    const origin = `http://127.0.0.1:${server.address().port}`, errors = [];
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:') ? request.continue() : request.respond({ status: 200, body: '' }));
    if (process.env.DISPLAY_SCREENSHOTS) {
        await page.goto(`${origin}/variable-displays.html`);
        await page.waitForSelector('.display-list-card');
        await page.screenshot({ path: '.validation/display-library-desktop.png', fullPage: true });
        await page.setViewport({ width: 390, height: 844 });
        await page.screenshot({ path: '.validation/display-library-mobile.png', fullPage: true });
        await page.setViewport({ width: 1366, height: 768 });
    }
    await page.goto(`${origin}/variable-displays.html?id=${badge.id}`);
    await page.waitForFunction(() => document.querySelector('#badge-designer .ig-geom-btn') || document.querySelector('#display-alert')?.textContent);
    assert.equal(await page.$eval('#display-alert', node => node.textContent), '', 'badge builder loaded');
    await page.waitForSelector('#badge-designer .ig-geom-btn');
    if (process.env.DISPLAY_SCREENSHOTS) await page.screenshot({ path: '.validation/badge-designer-desktop.png', fullPage: true });
    await page.click('[data-builder-view="appearance"]');
    await page.click('[data-badge-number-pick="style.fontSize"]');
    await page.waitForSelector('#sp-picker[open] [data-token="var.badge_size"]');
    await page.click('#sp-picker [data-token="var.badge_size"]');
    assert.equal(await page.$eval('[data-path="style.fontSize"]', node => node.disabled), true, 'Number variable bindings remain editable in the standalone designer');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#display-preview .sp-saved-badge')).fontSize === '32px');
    await page.click('[data-badge-color-pick="style.color"]');
    await page.click('#sp-picker [data-token="var.badge_accent"]');
    assert.equal(await page.$eval('.color-text[data-path="style.color"]', node => node.value), '{{var.badge_accent}}');
    await page.click('[data-builder-view="design"]');
    await page.select('#badge-arrangement', 'broadcast-hud');
    await page.click('#ig-add-field-btn');
    await page.waitForSelector('#display-preview .sp-saved-badge .sp-image-group-item');
    const count = await page.$$eval('.ig-field-row', rows => rows.length);
    assert.ok(count > 1, 'existing field builder adds additional field');
    const color = await page.$('#badge-designer input[data-ig-fprop="color"]');
    await color.evaluate(node => {
        window.badgeColorInput = node;
        node.value = '#ff8844aa';
        node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('#dirty-state').textContent === 'Unsaved changes');
    assert.equal(await page.evaluate(() => window.badgeColorInput.isConnected), true, 'color editing does not rebuild picker');
    sockets.clients.forEach(socket => socket.send(JSON.stringify({ type: 'variables-update', data: { sets, variables } })));
    await page.setViewport({ width: 390, height: 844 });
    if (process.env.DISPLAY_SCREENSHOTS) await page.screenshot({ path: '.validation/badge-designer-mobile.png', fullPage: true });
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > window.innerWidth + 2).slice(0, 10).map(node => `${node.tagName}#${node.id}.${node.className}`)), [], 'badge designer fits mobile');
    await page.click('#save-display');
    await page.waitForFunction(() => document.querySelector('#dirty-state').textContent === 'Saved');
    assert.equal(badge.badge.style.numberBindings.fontSize, 'badge_size');
    assert.equal(badge.badge.imageGroup.fields[0].color, '#ff8844aa');
    assert.equal(badge.badge.style.color, '{{var.badge_accent}}');
    await page.reload();
    await page.waitForSelector('#display-preview .sp-saved-badge .sp-image-group-item');
    assert.equal(await page.$eval('#badge-designer input[data-ig-fprop="color"]', node => node.value), '#ff8844aa', 'badge fields survive save and reopen');
    await page.goto(`${origin}/variable-displays.html?kind=badge&catalog=people`);
    await page.waitForSelector('#badge-designer .ig-geom-btn');
    await page.waitForSelector('#display-preview .sp-saved-badge .sp-image-group-item');
    assert.equal(await page.$eval('#dirty-state', node => node.textContent), 'Unsaved changes', 'a new design is saveable without an extra edit');
    await page.click('#save-display');
    await page.waitForFunction(() => document.querySelector('#dirty-state').textContent === 'Saved');
    assert.equal(badge.kind, 'badge');
    assert.equal(badge.badge.imageGroup.showLabels, true);
    assert.deepEqual(errors, []);
});
