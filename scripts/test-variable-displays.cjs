const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const { WebSocketServer } = require('ws');
const { normalizeDisplay, normalizeDisplayBinding, resolveDisplayOwner } = require('../shared/variable-displays.cjs');
const { getDisplayRows, displayFieldValue } = require('../shared/display-table.cjs');
const { normalizeDisplayCounter, resolveCounterCap, formatCounterReadout, resolveCounterRows } = require('../shared/display-counter.cjs');
const createDisplays = require('../server/services/variable-displays');
const createRoutes = require('../server/routes/variable-displays');
const { normalizeCustomOverlay } = require('../server/services/overlays');
const { createShareBundleService } = require('../server/services/share-bundle');
const { createStaticRouter } = require('../server/static-router');
const fixture = require('./fixtures/variable-display.cjs');

test('displays validate ordered sections, fixed cells, type boundaries and read-only role paths', () => {
    assert.throws(() => normalizeDisplay({ kind: 'chart' }), /Unsupported/);
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
    let dependencies = [];
    const service = createDisplays({ dataDir: dir, onChange: state => changes.push(state), getDependencies: () => dependencies });
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
    dependencies = [{ kind: 'overlay', id: 'show', label: 'Show / Player 1 inventory' }];
    assert.deepEqual((await (await fetch(`${url}/${fixture.display.id}/dependencies`)).json()).dependencies, dependencies);
    const blocked = await fetch(`${url}/${fixture.display.id}`, { method: 'DELETE' });
    assert.equal(blocked.status, 409);
    assert.deepEqual((await blocked.json()).dependencies, dependencies);
    assert.ok(service.get(fixture.display.id), 'referenced designs remain saved');
    dependencies = [];
    assert.equal((await fetch(`${url}/${fixture.display.id}`, { method: 'DELETE' })).status, 200);
    assert.equal(service.get(fixture.display.id), null);
    fs.writeFileSync(path.join(dir, 'variable-displays.json'), JSON.stringify([fixture.display]));
    service.reload();
    assert.equal(service.get(fixture.display.id).name, fixture.display.name);
    assert.equal(changes.length, 3);
    assert.equal(changes.at(-1).displays.length, 0);
    assert.equal(fs.existsSync(path.join(dir, 'variable-displays.json.tmp')), false);
});

test('table rows follow saved order, typed linked fields, scopes and live list assignments without changing data', () => {
    const sets = globalThis.structuredClone(fixture.sets);
    const original = globalThis.structuredClone(sets);
    const table = normalizeDisplay({ ...fixture.table, table: { ...fixture.table.table, rowOrder: ['later', 'tonight'] } });
    const rows = binding => getDisplayRows(sets, table, binding).entries.map(entry => entry.id);
    assert.deepEqual(rows({}), ['later', 'tonight']);
    assert.deepEqual(rows({ rows: 'slots' }), ['tonight']);
    assert.deepEqual(rows({ rows: 'active' }), ['tonight']);
    assert.equal(displayFieldValue(sets, sets[2], sets[2].roster[0], 'p1.$label').value, 'River Vale');
    assert.equal(displayFieldValue(sets, sets[2], sets[2].roster[0], 'duration').value, '45m');
    assert.equal(displayFieldValue(sets, sets[2], sets[2].roster[0], 'p1.missing').value, '');
    assert.deepEqual(getDisplayRows(sets, { ...table, table: { ...table.table, sortKey: 'start' } }, {}).entries.map(entry => entry.id), ['tonight', 'later']);
    assert.throws(() => normalizeDisplay({ ...table, table: { columns: [{ key: 'start' }, { key: 'start' }] } }), /unique field/);
    assert.deepEqual(sets, original, 'sorting and row selection do not mutate rosters or live slots');
    sets[2].slots = [null];
    assert.deepEqual(rows({ rows: 'active' }), []);
    assert.deepEqual(rows({ setId: 'schedule', path: ['missing'] }), []);
    sets.push({ id: 'show', slotsCount: 1, slots: ['now'], fields: [{ key: 'events', type: 'ref_list', targetSet: 'schedule' }], roster: [{ id: 'now', values: { events: ['later', 'tonight'] } }] });
    assert.deepEqual(rows({ setId: 'show', fields: ['events'] }), ['later', 'tonight']);
    assert.deepEqual(rows({ setId: 'show', fields: ['unknown'] }), []);
});

test('migrated badge sources use the same canonical binding as new display placements', () => {
    const bind = source => normalizeDisplayBinding({ displayId: 'badge', badgeSource: source });
    assert.deepEqual(bind({ setId: 'people', filterMode: 'inGroup' }), normalizeDisplayBinding({ displayId: 'badge', setId: 'people', rows: 'group' }));
    assert.equal(bind({ setId: 'people', filterMode: 'inGroup', onlySelected: true }).rows, 'group-slots');
    const linked = bind({ filterMode: 'linked', linkedSource: { setId: 'schedule', selector: 'slot:1', fields: ['p2', 'p1'] } });
    assert.equal(linked.setId, 'schedule');
    assert.deepEqual(linked.fields, ['p2', 'p1']);
    assert.equal(Object.hasOwn(linked, 'badgeSource'), false);
    const tracker = bind({ filterMode: 'checklist', linkedSource: { setId: 'people', selector: 'entry:river', fields: ['gear'] }, showMode: 'active' });
    assert.equal(tracker.tracker, 'gear');
    assert.deepEqual(getDisplayRows(fixture.sets, { catalogId: 'equipment' }, tracker).entries.map(entry => entry.id), ['sword', 'shield']);
    const sets = globalThis.structuredClone(fixture.sets);
    sets[0].roster[0].enabled = false;
    assert.deepEqual(getDisplayRows(sets, { catalogId: 'equipment' }, tracker).entries.map(entry => entry.id), ['shield']);
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
    assert.match(await editor.$eval('[data-display-source-state]', node => node.textContent), /Schedule.*Active entry.*Player 1.*Equipment.*River Vale/);
    assert.equal(await editor.$('[data-add="image-group"]'), null, 'Group Strip is not available in the editor');
    const send = (type, data) => wss.clients.forEach(socket => socket.send(JSON.stringify({ type, data })));
    await runtime.bringToFront();
    sets[1].roster[0].values.gear.sword = 1;
    send('variables-update', { sets, variables: [] });
    await runtime.waitForSelector('[data-display-item="sword"][data-level="1"]');
    await editor.bringToFront();
    await editor.waitForSelector('[data-display-item="sword"][data-level="1"]');
    assert.equal(sets[1].roster[1].values.gear.sword, undefined, 'P2 progress remains independent');
    await runtime.bringToFront();
    display.sections[0].title = 'Shared weapons';
    revision++;
    send('variable-displays-update', { displays: [display], revision });
    await runtime.waitForFunction(() => document.body.textContent.match(/Shared weapons/g)?.length === 2);
    sets[2].roster[0].values.p1 = 'sky';
    send('variables-update', { sets, variables: [] });
    await runtime.waitForFunction(() => [...document.querySelectorAll('[data-display-item="sword"]')].every(node => node.dataset.level === '0'));
    await editor.bringToFront();
    await editor.waitForFunction(() => document.querySelector('[data-display-source-state]')?.textContent.includes('Sky Meadow'));
    await runtime.bringToFront();
    sets[0].roster[0].enabled = false;
    send('variables-update', { sets, variables: [] });
    await runtime.waitForFunction(() => !document.querySelector('[data-display-item="sword"]'));
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
    sets[2].slots = ['tonight'];
    send('variables-update', { sets, variables: [] });
    const directory = await open('/placeholders.html');
    await directory.waitForSelector('[data-copy="{{var.schedule_1_p1.field.name}}"]');
    await directory.$eval('#q', input => { input.value = 'Sky Meadow'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await directory.waitForSelector('[data-copy="{{var.schedule_1_p1.field.name}}"]');
    assert.match(await directory.$eval('[data-copy="{{var.schedule_1_p1.field.name}}"]', node => node.closest('tr').textContent), /Schedule.*Player 1.*Name/);
    assert.equal(await directory.$eval('#chat-tokens-card', node => node.hidden), true, 'unrelated chat-only tokens do not leave an empty search section');
    await directory.$eval('#q', input => { input.value = 'Schedule Player 1 Name'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await directory.waitForSelector('[data-copy="{{var.schedule_1_p1.field.name}}"]');
    await editor.bringToFront();
    await editor.evaluate(() => document.querySelector('[data-add="text"]').click());
    await editor.waitForSelector('#prop-content');
    await editor.focus('#prop-content');
    await editor.type('#prop-content', '{{Schedule Player 1 Name');
    const suggestion = '#placeholder-ac.open [data-token="var.schedule_1_p1.field.name"]';
    await editor.waitForSelector(suggestion);
    assert.match(await editor.$eval(suggestion, node => node.textContent), /Sky Meadow/);
    await editor.click(suggestion);
    assert.match(await editor.$eval('#prop-content', node => node.value), /\{\{var\.schedule_1_p1\.field\.name\}\}/, 'readable multiword autocomplete inserts the real linked token');
    assert.deepEqual(errors, []);
});


test('table library, overlay editor and production share ordered typed rows and live field updates', { timeout: 60000 }, async t => {
    const sets = globalThis.structuredClone(fixture.sets);
    let table = globalThis.structuredClone(fixture.table);
    const overlay = normalizeCustomOverlay({
        id: 'table-fixture', canvas: { width: 1280, height: 720 },
        elements: [{ id: 'schedule-table', type: 'data-display', width: 1100, height: 400, display: { displayId: table.id, rows: 'all' } }]
    });
    const router = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname.startsWith('/api/variable-displays') && ['PUT', 'POST'].includes(req.method)) {
                let body = '';
                for await (const chunk of req) body += chunk;
                table = normalizeDisplay(JSON.parse(body));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(table));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(url.pathname === '/api/variable-displays' ? { displays: [table], revision: 1 }
                : url.pathname === '/api/variables' ? { sets, variables: [], variableSetsEnabled: true }
                    : url.pathname === '/api/status' ? { modules: { variableSets: true }, variableDisplaysRevision: 1 }
                        : url.pathname === '/api/custom-overlays/table-fixture' ? overlay : {}));
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const sockets = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        sockets.clients.forEach(socket => socket.terminate());
        await new Promise(resolve => sockets.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    const pages = [];
    for (const route of ['/custom-overlay.html?id=table-fixture', '/custom-overlay-editor.html?id=table-fixture&select=schedule-table', `/variable-displays.html?id=${table.id}`]) {
        const page = await browser.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:')
            ? request.continue() : request.respond({ status: 200, body: '' }));
        await page.goto(origin + route);
        await page.waitForSelector('.sp-display-table [data-display-row="tonight"]');
        assert.deepEqual(await page.$$eval('.sp-display-table tbody tr', rows => rows.map(row => row.dataset.displayRow)), ['tonight', 'later']);
        assert.equal(await page.$eval('[data-display-row="tonight"] [data-display-column="p1.$label"]', cell => cell.textContent), 'River Vale');
        assert.equal(await page.$eval('[data-display-row="tonight"] [data-display-column="duration"]', cell => cell.textContent), '45m');
        pages.push(page);
    }
    sets[2].roster[0].values.duration = '50m';
    sockets.clients.forEach(socket => socket.send(JSON.stringify({ type: 'variables-update', data: { sets, variables: [] } })));
    for (const page of pages) {
        await page.bringToFront();
        await page.waitForFunction(() => document.querySelector('[data-display-row="tonight"] [data-display-column="duration"]')?.textContent === '50m');
    }
    assert.equal(await pages[0].evaluate(({ table, sets }) => {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;top:0;left:0;width:700px;height:220px';
        document.body.append(host);
        const definition = { ...table, style: { ...table.style, fontSize: 60 }, table: { ...table.table, rowHeight: 20, headerHeight: 20 } };
        window.OverlayShared.renderVariableDisplay(host, { display: { displayId: table.id } }, { variableDisplays: [definition], variableSets: sets });
        const root = host.querySelector('.sp-display-table').getBoundingClientRect();
        const last = host.querySelector('tbody tr:last-child').getBoundingClientRect();
        host.remove();
        return last.bottom <= root.bottom + 1;
    }, { table, sets }), true, 'large fonts expand logical row heights and remain inside the scaled placement');
    const builder = pages[2];
    await builder.$eval('#table-column-editor [data-column="0"] [data-path="label"]', input => {
        input.value = 'Goes live';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await builder.click('#table-column-editor [data-column="0"] [data-table-move="1"]');
    await builder.click('[data-row="later"][data-row-move="-1"]');
    await builder.click('#save-display');
    await builder.waitForFunction(() => document.querySelector('#dirty-state').textContent === 'Saved');
    assert.equal(table.table.columns[1].label, 'Goes live');
    assert.deepEqual(table.table.rowOrder, ['later', 'tonight']);
    await builder.reload();
    await builder.waitForSelector('.sp-display-table [data-display-row="later"]');
    assert.deepEqual(await builder.$$eval('.sp-display-table tbody tr', rows => rows.map(row => row.dataset.displayRow)), ['later', 'tonight'], 'saved row order survives reopening the designer');
    assert.equal(await builder.$eval('.sp-display-table thead th:nth-child(2)', cell => cell.textContent), 'Goes live');
    assert.deepEqual(errors, []);
});


test('badge library uses persistent active navigation and keeps placement effects out of its appearance controls', { timeout: 60000 }, async t => {
    const router = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(url.pathname === '/api/variable-displays' ? { displays: [fixture.badge], revision: 1 }
                : url.pathname === '/api/variables' ? { sets: fixture.sets, variables: [], variableSetsEnabled: true }
                    : url.pathname === '/api/status' ? { modules: { variableSets: true }, variableDisplaysRevision: 1 } : {}));
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const sockets = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        sockets.clients.forEach(socket => socket.terminate());
        await new Promise(resolve => sockets.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:')
        ? request.continue() : request.respond({ status: 200, body: '' }));
    await page.goto(`${origin}/variable-displays.html?id=${fixture.badge.id}`);
    await page.waitForSelector('#badge-design-controls');
    const selectedMode = () => page.evaluate(() => [...document.querySelectorAll('.tabs-nav .tab-btn.active')]
        .filter(button => ['Badge', 'Strip'].includes(button.textContent.trim())).map(button => button.textContent.trim()));
    assert.deepEqual(await selectedMode(), ['Badge'], 'shared segmented navigation visibly identifies the initial mode');
    await page.click('.preview-source-details > summary');
    await page.select('[data-source-path="setId"]', 'schedule');
    await page.click('[data-source-field][value="p1"]');
    await page.click('[data-source-field][value="p2"]');
    await page.waitForFunction(() => document.querySelectorAll('#display-preview .sp-image-group-item').length === 2);
    assert.equal(await page.$('[data-source-path="rows"]'), null, 'row selection is hidden when linked members determine the output');
    assert.match(await page.$eval('[data-display-source-state]', node => node.textContent), /Player 1.*Player 2.*2 enabled members/);
    await page.select('[data-source-path="path.0"]', 'p1');
    await page.waitForFunction(() => document.querySelectorAll('#display-preview .sp-image-group-item').length === 1);
    assert.match(await page.$eval('[data-display-source-state]', node => node.textContent), /River Vale/);
    await page.select('[data-source-path="setId"]', '');
    await page.click('.preview-source-details > summary');
    for (const width of [1280, 1320, 1366, 1512]) {
        await page.setViewport({ width, height: 768 });
        await page.$eval('#ig-zone-blueprint', node => node.scrollIntoView({ block: 'start' }));
        const workspace = await page.evaluate(() => {
            const blueprint = document.querySelector('#ig-zone-blueprint').getBoundingClientRect();
            const fields = document.querySelector('#ig-fields-list').getBoundingClientRect();
            const preview = document.querySelector('.builder-preview-column').getBoundingClientRect();
            return {
                sideBySide: blueprint.right <= fields.left + 1 && fields.right <= preview.left + 1,
                blueprintWidth: blueprint.width,
                previewWidth: preview.width,
                fieldWidth: fields.width,
                visibleFieldHeight: Math.min(fields.bottom, window.innerHeight) - Math.max(fields.top, 0),
                controlHeight: document.querySelector('.ig-field-row.is-selected select').getBoundingClientRect().height,
                fits: document.documentElement.scrollWidth <= window.innerWidth + 1
            };
        });
        assert.equal(workspace.sideBySide, true, `blueprint, fields and preview have separate columns at ${width}px`);
        assert.ok(workspace.blueprintWidth >= (width >= 1320 ? 345 : 295), `blueprint has room for its zone map (${workspace.blueprintWidth}px)`);
        assert.ok(workspace.previewWidth >= (width >= 1320 ? 395 : 315), `live preview has a readable laptop column (${workspace.previewWidth}px)`);
        assert.ok(workspace.fieldWidth >= 420, `field settings retain a readable width (${workspace.fieldWidth}px)`);
        assert.ok(workspace.visibleFieldHeight >= 320, `field settings have usable laptop height (${workspace.visibleFieldHeight}px)`);
        assert.ok(workspace.controlHeight <= 30, `laptop field controls are condensed (${workspace.controlHeight}px)`);
        assert.equal(workspace.fits, true, `badge workspace fits ${width}px without horizontal scrolling`);
    }
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluate(() => [...document.querySelectorAll('.tabs-nav .tab-btn')].find(button => button.textContent.trim() === 'Strip').click());
    assert.deepEqual(await selectedMode(), ['Strip']);
    assert.equal(await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.tabs-nav .tab-btn')].filter(button => ['Badge', 'Strip'].includes(button.textContent.trim()));
        return buttons.every(button => button.getAttribute('aria-selected') === String(button.classList.contains('active')));
    }), true, 'accessible selection matches visible selection');
    const backgrounds = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.tabs-nav .tab-btn')].filter(button => ['Badge', 'Strip'].includes(button.textContent.trim()));
        return buttons.map(button => getComputedStyle(button).backgroundColor);
    });
    assert.notEqual(backgrounds[0], backgrounds[1], 'the active segmented button has a visibly different background');
    await page.reload();
    await page.waitForSelector('#badge-design-controls');
    assert.deepEqual(await selectedMode(), ['Strip'], 'reloading retains the designer mode');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Appearance').click());
    const genericEffects = await page.evaluate(() => [...document.querySelectorAll('input, select')]
        .filter(input => input.getClientRects().length)
        .flatMap(input => [...input.attributes].filter(attribute => /path|name/.test(attribute.name)).map(attribute => attribute.value))
        .filter(path => /^(?:badge\.)?(?:mediaFilter\.|style\.(?:opacity|rotation|blendMode|shadow|border|animation))/.test(path)));
    assert.deepEqual(genericEffects, [], 'outer placement effects belong to the overlay inspector, not the library');
    assert.deepEqual(await page.evaluate(({ definition, sets }) => {
        const host = document.createElement('div');
        host.style.cssText = 'width:720px;height:220px;background:rgb(17,34,51);opacity:0.4;border:5px solid red';
        document.body.append(host);
        let disconnected = false;
        host._borderObserver = { disconnect: () => { disconnected = true; } };
        const element = { width: 720, height: 220, display: { displayId: definition.id }, style: { opacity: .4 } };
        const status = { variableDisplays: [definition], variableSets: sets };
        window.OverlayShared.renderVariableDisplay(host, element, status);
        const original = host.querySelector('.sp-saved-badge');
        window.OverlayShared.renderVariableDisplay(host, element, status);
        const unchanged = original === host.querySelector('.sp-saved-badge');
        element.width = 900;
        window.OverlayShared.renderVariableDisplay(host, element, status);
        const resized = original !== host.querySelector('.sp-saved-badge');
        const result = { opacity: host.style.opacity, background: host.style.backgroundColor, border: host.style.borderWidth, disconnected, unchanged, resized };
        host._borderObserver = null;
        window.OverlayShared.cleanupNode(host);
        host.remove();
        return result;
    }, { definition: fixture.badge, sets: fixture.sets }), {
        opacity: '0.4', background: 'rgb(17, 34, 51)', border: '5px', disconnected: false, unchanged: true, resized: true
    }, 'badge rendering preserves outer placement styling and observers while invalidating size-dependent content');
    assert.deepEqual(errors, []);
});

test('counter display schema, cap resolution, and service persistence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-counter-displays-'));
    try {
        const service = createDisplays({ dataDir: dir });
        // Standalone counter display saves without catalogId
        const saved = service.save({
            name: 'Boss Hearts',
            kind: 'counter',
            counter: {
                sourceMode: 'variables',
                variables: [{ name: 'lives', label: 'Lives', cap: null }, { name: 'deaths', label: 'Deaths', cap: 5 }],
                style: 'hearts',
                capMode: 'auto',
                readout: 'fraction'
            }
        }, 'boss_hearts');
        assert.equal(saved.kind, 'counter');
        assert.equal(saved.counter.style, 'hearts');
        assert.equal(saved.counter.variables.length, 2);
        assert.equal(saved.catalogId, '');

        // Variable Set counter display requires catalogId
        assert.throws(() => service.save({
            name: 'Set Scores',
            kind: 'counter',
            counter: { sourceMode: 'set', valueField: 'wins', style: 'tally' }
        }, 'set_scores'), /Choose an item catalog/);

        // Cap resolution: auto uses variable max, none grows dynamically, custom overrides
        const autoCfg = normalizeDisplayCounter({ capMode: 'auto', customCap: 5 });
        const customCfg = normalizeDisplayCounter({ capMode: 'custom', customCap: 3 });
        const noneCfg = normalizeDisplayCounter({ capMode: 'none', customCap: 5 });
        assert.equal(resolveCounterCap(3, autoCfg), 3);
        assert.equal(resolveCounterCap('', autoCfg), null);
        assert.equal(resolveCounterCap(null, customCfg), 3);
        assert.equal(resolveCounterCap(10, noneCfg), null);
        assert.equal(resolveCounterCap(10, noneCfg, 4), 4);

        // Readout formatting
        assert.equal(formatCounterReadout(2, 3, 'fraction'), '2 / 3');
        assert.equal(formatCounterReadout(2, 3, 'of'), '2 of 3');
        assert.equal(formatCounterReadout(7, null, 'fraction'), '7');
        assert.equal(formatCounterReadout(2, 3, 'none'), '');

        // Row resolution: standalone variables + placement override
        const customVars = [
            { name: 'lives', type: 'counter', value: '2', max: '3', step: 1, resetValue: 3 },
            { name: 'deaths', type: 'counter', value: '7', max: '', step: 1, resetValue: 0 }
        ];
        const rows = resolveCounterRows(saved, {}, { customVars });
        assert.equal(rows.length, 2);
        assert.equal(rows[0].value, 2);
        assert.equal(rows[0].cap, 3);
        assert.equal(rows[1].value, 7);
        assert.equal(rows[1].cap, 5);

        const overrideBinding = normalizeDisplayBinding({ displayId: 'boss_hearts', variableName: 'deaths' });
        assert.equal(overrideBinding.variableName, 'deaths');
        const overrideRows = resolveCounterRows(saved, overrideBinding, { customVars });
        assert.equal(overrideRows.length, 1);
        assert.equal(overrideRows[0].variableName, 'deaths');
        assert.equal(overrideRows[0].cap, null);

        // Row resolution: Variable Set numeric field
        const setDef = normalizeDisplay({
            id: 'set_wins',
            name: 'Player Wins',
            kind: 'counter',
            catalogId: 'players',
            counter: { sourceMode: 'set', valueField: 'wins', style: 'tally', capMode: 'custom', customCap: 5 }
        });
        const setRows = resolveCounterRows(setDef, {}, {
            variableSets: [{
                id: 'players',
                name: 'Players',
                fields: [{ key: 'wins', label: 'Wins', type: 'number' }],
                roster: [
                    { id: 'p1', label: 'Nova', enabled: true, values: { wins: 3 } },
                    { id: 'p2', label: 'Echo', enabled: true, values: { wins: 5 } },
                    { id: 'p3', label: 'Bench', enabled: false, values: { wins: 1 } }
                ]
            }]
        });
        assert.equal(setRows.length, 2);
        assert.equal(setRows[0].label, 'Nova');
        assert.equal(setRows[0].value, 3);
        assert.equal(setRows[0].cap, 5);
        assert.equal(setRows[1].label, 'Echo');
        assert.equal(setRows[1].value, 5);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('counter display builder renders hearts, 5-count slashed tallies, caps, and overflow cleanly', { timeout: 60000 }, async t => {
    const sets = globalThis.structuredClone(fixture.sets);
    const variables = [
        { name: 'hearts', type: 'counter', value: '2', max: '3', step: 1, resetValue: 3 },
        { name: 'deaths', type: 'counter', value: '7', max: '', step: 1, resetValue: 0 }
    ];
    let displays = [];
    const router = createStaticRouter({ rootDir: path.resolve(__dirname, '..'), publicDir: path.resolve(__dirname, '../public') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fixture.local');
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname.startsWith('/api/variable-displays') && ['POST', 'PUT'].includes(req.method)) {
                let body = '';
                for await (const chunk of req) body += chunk;
                const saved = normalizeDisplay(JSON.parse(body), 'counter_1');
                displays = [saved];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ display: saved }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(
                url.pathname === '/api/variable-displays' ? { displays, revision: 1 }
                    : url.pathname === '/api/variables' ? { sets, variables, variableSetsEnabled: true }
                        : url.pathname === '/api/status' ? { modules: { variableSets: true, variableSettings: true }, variableDisplaysRevision: 1 }
                            : {}
            ));
        } else if (!router.handleRequest(req, res)) { res.writeHead(404); res.end(); }
    });
    const sockets = new WebSocketServer({ server });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    t.after(async () => {
        await browser.close();
        sockets.clients.forEach(socket => socket.terminate());
        await new Promise(resolve => sockets.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:')
        ? request.continue() : request.respond({ status: 200, body: '' }));

    await page.goto(`${origin}/variable-displays.html?kind=counter`);
    await page.waitForSelector('#counter-design-controls [data-counter-style="hearts"]');

    // Switch to hearts: hearts var has value 2, max 3 -> 2 filled hearts + 1 outlined empty heart
    await page.click('[data-counter-style="hearts"]');
    await page.waitForSelector('.sp-counter-display[data-counter-style="hearts"]');
    const heartStats = await page.evaluate(() => ({
        filled: document.querySelectorAll('.sp-counter-marker[data-marker-style="hearts"][data-marker-state="filled"]').length,
        empty: document.querySelectorAll('.sp-counter-marker[data-marker-style="hearts"][data-marker-state="empty"]').length,
        readout: document.querySelector('.sp-counter-readout')?.textContent
    }));
    assert.deepEqual(heartStats, { filled: 2, empty: 1, readout: '2 / 3' });

    // Test interactive +1 preview button: 2 -> 3 (cap reached) -> 4 (+1 overflow badge)
    await page.click('[data-counter-preview="+1"]');
    await page.click('[data-counter-preview="+1"]');
    await page.waitForSelector('.sp-counter-overflow-badge');
    assert.equal(await page.$eval('.sp-counter-overflow-badge', el => el.textContent), '+1');

    // Add uncapped 'deaths' (value 7) and switch to tally marks -> 1 slashed 5-group + 2 verticals
    await page.click('[data-counter-preview="reset"]');
    await page.select('#counter-var-select', 'deaths');
    await page.click('[data-counter-act="add-var"]');
    await page.click('[data-counter-style="tally"]');
    await page.waitForSelector('.sp-counter-display[data-counter-style="tally"]');
    const tallyStats = await page.evaluate(() => {
        const deathRow = document.querySelector('[data-counter-key="var:deaths"]');
        return {
            groups: deathRow.querySelectorAll('.sp-counter-tally-group').length,
            slashes: deathRow.querySelectorAll('.sp-tally-slash[data-marker-state="filled"]').length,
            readout: deathRow.querySelector('.sp-counter-readout')?.textContent
        };
    });
    assert.deepEqual(tallyStats, { groups: 2, slashes: 1, readout: '7' });

    // Save the display without needing a catalogId
    await page.click('#save-display');
    await page.waitForFunction(() => document.querySelector('#dirty-state')?.textContent === 'Saved');
    assert.equal(displays.length, 1);
    assert.equal(displays[0].kind, 'counter');

    // Verify Operator Mode mini counter HTML helper
    const miniHtml = await page.evaluate(() => window.OverlayShared.renderMiniCounterHtml(2, 3, { style: 'hearts' }));
    assert.match(miniHtml, /data-marker-style="hearts"/);
    assert.match(miniHtml, /data-marker-state="empty"/);

    // Responsive check
    for (const width of [1366, 390]) {
        await page.setViewport({ width, height: 768 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `Counter builder fits ${width}px viewport`);
    }
    assert.deepEqual(errors, []);
});
