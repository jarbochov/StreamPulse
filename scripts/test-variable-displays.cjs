const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const { WebSocketServer } = require('ws');
const { normalizeDisplay, normalizeDisplayBinding, resolveDisplayOwner } = require('../shared/variable-displays.cjs');
const createDisplays = require('../server/services/variable-displays');
const createRoutes = require('../server/routes/variable-displays');
const { normalizeCustomOverlay } = require('../server/services/overlays');
const { createShareBundleService } = require('../server/services/share-bundle');
const { createStaticRouter } = require('../server/static-router');
const fixture = require('./fixtures/variable-display.cjs');

test('displays validate ordered sections, fixed cells, type boundaries and read-only role paths', () => {
    assert.throws(() => normalizeDisplay({ kind: 'table' }), /Unsupported/);
    assert.throws(() => normalizeDisplay({ sections: [{ items: [{ itemId: 'sword' }, { itemId: 'sword' }] }] }), /once/);
    assert.throws(() => normalizeDisplay({ layout: { mode: 'fixed' }, sections: [{ items: [{ itemId: 'a', cell: 0 }, { itemId: 'b', cell: 0 }] }] }), /same cell/);
    const flow = normalizeDisplay({ ...fixture.display, layout: { mode: 'flow' } });
    assert.deepEqual(flow.sections[0].items.map(item => item.cell), [0, 1, 2]);
    const sets = globalThis.structuredClone(fixture.sets);
    const before = globalThis.structuredClone(sets);
    assert.equal(resolveDisplayOwner(sets, fixture.binding('p1')).entry.id, 'river');
    assert.equal(resolveDisplayOwner(sets, fixture.binding('p2')).entry.id, 'sky');
    assert.equal(resolveDisplayOwner(sets, { setId: 'people', selector: 'slot:2' }).entry.id, 'sky');
    assert.equal(resolveDisplayOwner(sets, { setId: 'people', selector: 'entry:river' }).entry.id, 'river');
    assert.equal(resolveDisplayOwner(sets, { ...fixture.binding('p1'), path: ['missing'] }).entry, undefined);
    sets[2].slots = [null];
    assert.equal(resolveDisplayOwner(sets, fixture.binding('p1')).entry, undefined);
    sets[2].slots = before[2].slots;
    assert.deepEqual(sets, before, 'source resolution never changes live selections or progress');
    const overlay = normalizeCustomOverlay({ id: 'fixture', elements: [{ id: 'p1', type: 'data-display', display: fixture.binding('p1') }] });
    assert.deepEqual(overlay.elements[0].display, normalizeDisplayBinding(fixture.binding('p1')));
    assert.equal(overlay.elements[0].type, 'data-display');
    const share = createShareBundleService({ getCustomOverlays: () => ({ fixture: overlay }) });
    assert.throws(() => share.buildShareZip([{ type: 'overlay', id: 'fixture' }]), /full backup/);
});

test('display API saves atomically, persists, reloads after restore and broadcasts CRUD changes', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-displays-'));
    const changes = [];
    const service = createDisplays({ dataDir: dir, onChange: state => changes.push(state) });
    const route = createRoutes(service);
    const server = http.createServer(async (req, res) => {
        if (!await route(req, res, new URL(req.url, 'http://fixture.local'))) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
    const url = `http://127.0.0.1:${server.address().port}/api/variable-displays`;
    const save = await fetch(url, { method: 'POST', body: JSON.stringify(fixture.display) });
    assert.equal(save.status, 200);
    assert.deepEqual(await save.json(), fixture.display);
    assert.deepEqual(createDisplays({ dataDir: dir }).get(fixture.display.id), fixture.display);
    const oldRevision = service.getRevision();
    const update = await fetch(`${url}/${fixture.display.id}`, { method: 'PUT', body: JSON.stringify({ ...fixture.display, name: 'Updated layout' }) });
    assert.equal((await update.json()).name, 'Updated layout');
    assert.ok(service.getRevision() > oldRevision);
    assert.equal((await (await fetch(url)).json()).displays.length, 1);
    assert.equal((await fetch(`${url}/missing`)).status, 404);
    assert.equal((await fetch(url, { method: 'POST', body: '{"catalogId":""}' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: '{bad}' })).status, 400);
    assert.equal((await fetch(url, { method: 'PATCH' })).status, 405);
    assert.equal((await fetch(`${url}/${fixture.display.id}`, { method: 'DELETE' })).status, 200);
    assert.equal(service.get(fixture.display.id), null);
    fs.writeFileSync(path.join(dir, 'variable-displays.json'), JSON.stringify([fixture.display]));
    service.reload();
    assert.equal(service.get(fixture.display.id).name, fixture.display.name);
    assert.equal(changes.length, 3);
    assert.equal(changes.at(-1).displays.length, 0);
    assert.equal(fs.existsSync(path.join(dir, 'variable-displays.json.tmp')), false);
});

test('saved inventories render independently in production/editor and update live without iframe reloads', { timeout: 90000 }, async t => {
    const sets = globalThis.structuredClone(fixture.sets);
    let display = globalThis.structuredClone(fixture.display);
    let revision = 1;
    const overlay = normalizeCustomOverlay({
        id: 'fixture', name: 'Fictional inventory show', canvas: { width: 1280, height: 720 },
        elements: ['p1', 'p2'].map((role, index) => ({ id: role, type: 'data-display', name: role,
            x: index * 600, y: 0, width: 560, height: 360, display: fixture.binding(role) }))
    });
    const router = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/variable-displays') && ['POST', 'PUT'].includes(req.method)) {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                display = normalizeDisplay(JSON.parse(body));
                revision++;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(display));
            });
            return;
        }
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            const data = url.pathname === '/api/variable-displays' ? { displays: [display], revision }
                : url.pathname === '/api/variables' ? { sets, variables: [], variableSetsEnabled: true }
                    : url.pathname === '/api/status' ? { modules: { variableSets: true }, variableDisplaysRevision: revision }
                        : url.pathname === '/api/custom-overlays/fixture' ? overlay
                            : url.pathname.endsWith('/page') ? { page: 'page-1' } : {};
            res.end(JSON.stringify(data));
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const wss = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        wss.clients.forEach(socket => socket.terminate());
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    const open = async route => {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:')
            ? request.continue() : request.respond({ status: 200, body: '' }));
        await page.goto(origin + route);
        return page;
    };
    const runtime = await open('/custom-overlay.html?id=fixture');
    await runtime.waitForSelector('[data-display-item="sword"][data-level="2"]');
    assert.equal(await runtime.$$eval('[data-display-item="sword"]', nodes => nodes.map(node => node.dataset.level).join(',')), '2,0');
    assert.equal(await runtime.$eval('[data-display-item="boots"]', node => node.style.gridColumn), '4');
    const dimensions = await runtime.$eval('[data-display-item="sword"]', node => ({ w: node.getBoundingClientRect().width, font: parseFloat(getComputedStyle(node).fontSize) }));
    assert.ok(dimensions.w > 40 && dimensions.font > 5, 'grid and font scale into placement');
    const editor = await open('/custom-overlay-editor.html?id=fixture&select=p1');
    await editor.waitForSelector('[data-path="display.displayId"]');
    await editor.waitForSelector('[data-display-item="sword"][data-level="2"]');
    const bind = await editor.$eval('[data-path="display.path.0"]', select => select.options[select.selectedIndex].text);
    assert.match(bind, /Player 1/);
    const send = (type, data) => wss.clients.forEach(socket => socket.send(JSON.stringify({ type, data })));
    sets[1].roster[0].values.gear.sword = 1;
    send('variables-update', { sets, variables: [] });
    await runtime.waitForSelector('[data-display-item="sword"][data-level="1"]');
    await editor.waitForSelector('[data-display-item="sword"][data-level="1"]');
    assert.equal(sets[1].roster[1].values.gear.sword, undefined, 'P2 progress remains independent');
    display.sections[0].title = 'Shared weapons';
    revision++;
    send('variable-displays-update', { displays: [display], revision });
    await runtime.waitForFunction(() => document.body.textContent.match(/Shared weapons/g)?.length === 2);
    sets[2].roster[0].values.p1 = 'sky';
    send('variables-update', { sets, variables: [] });
    await runtime.waitForFunction(() => [...document.querySelectorAll('[data-display-item="sword"]')].every(node => node.dataset.level === '0'));
    sets[2].slots = [null];
    send('variables-update', { sets, variables: [] });
    await runtime.waitForFunction(() => !document.querySelector('.sp-variable-display'));
    assert.equal(await runtime.$('iframe'), null);
    const builder = await open('/variable-displays.html?id=fictional-inventory');
    await builder.waitForSelector('#display-preview .sp-variable-display');
    await builder.$eval('#display-name', input => { input.value = 'Updated expedition'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await builder.click('#save-display');
    await builder.waitForFunction(() => !document.querySelector('#save-display').disabled);
    assert.equal(display.name, 'Updated expedition', 'focused Builder persists the complete shared design');
    const controls = await builder.evaluate(() => [...document.querySelectorAll('input[type="color"]')].map(input => input.id));
    if (controls.length) {
        assert.equal(await builder.evaluate(() => {
            const input = document.querySelector('input[type="color"]');
            input.value = '#ff8844';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return input.isConnected;
        }), true, 'color controls remain mounted during native picker input');
    }
    for (const width of [1366, 390]) {
        await builder.setViewport({ width, height: 768 });
        assert.equal(await builder.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `Builder fits ${width}px viewport`);
    }
    assert.deepEqual(errors, []);
});
