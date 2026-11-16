const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const createVariablesStore = require('../server/services/variables');
const { normalizeCustomOverlay } = require('../server/services/overlays');

const bundlePath = path.join(__dirname, '../public/js/overlay-shared.js');
const sharedCode = fs.readFileSync(bundlePath, 'utf8');
const fakeWindow = {};
new Function('window', sharedCode)(fakeWindow);
const OverlayShared = fakeWindow.OverlayShared;

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sp-vars-test-'));
}

const getVar = (store, name) => store.list().find(v => v.name === name) || null;
const getSet = (store, id) => store.listSets().find(s => s.id === id) || null;

test('Numbers: counter actions clamp, round, reset explicitly and preserve metadata across import/restart', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.set('score', { type: 'number', value: 1.005, resetValue: 2, min: 0.07, max: 10, step: 0.25, precision: 2, group: 'Scores' });
        assert.equal(store.values().score, 1.01);
        assert.equal(store.change('score', 'increment').value, 1.26);
        assert.equal(store.change('score', 'decrement', 100).value, 0.07);
        assert.equal((await callApi(store, 'GET', '/api/variables/score/set?value=100')).json.value, 10);
        assert.equal(store.change('score', 'reset').value, 2);
        const before = getVar(store, 'score');
        for (const patch of [{ min: 20 }, { step: 0 }, { step: 0.005 }, { precision: 13 }, { value: 'oops' }, { value: null }]) {
            assert.throws(() => store.set('score', patch));
            assert.deepEqual(getVar(store, 'score'), before);
        }
        assert.throws(() => store.change('score', 'increment', Infinity));
        assert.throws(() => store.change('score', 'increment', []));
        assert.throws(() => store.change('score', 'set'));
        store.importBundle({ variables: store.list() });
        store.reload();
        assert.equal(getVar(store, 'score').group, 'Scores');
        assert.equal(getVar(store, 'score').resetValue, 2);
        assert.equal(getVar(store, 'score').precision, 2);
        store.set('fraction', { type: 'number', value: 0.1, step: 0.2 });
        assert.equal(store.change('fraction', 'increment').value, 0.3);
        store.set('precise', { type: 'number', value: 1.2345678901234567 });
        assert.equal(store.values().precise, 1.2345678901234567, 'Omitted precision never rounds manually stored values');
        store.set('large', { type: 'number', min: 1e20, value: 0, precision: 2 });
        assert.equal(store.values().large, 1e20, 'Large bounds never drift below the configured minimum');
        store.set('edge', { type: 'number', min: 0.0700000000000001, value: 0, precision: 2 });
        assert.equal(store.values().edge, 0.08, 'Precision selects a representable value inside the actual bounds');
        store.set('legacy', { type: 'counter', value: 4, initial: 3 });
        assert.equal(store.change('legacy', 'reset').value, 3);
        assert.equal(getVar(store, 'legacy').type, 'counter');
    } finally {
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Number style bindings preserve saved fallbacks, clamp displayed units and reject nonnumeric variables', () => {
    const { normalizeOverlayElement } = require('../server/services/overlays');
    const { numericBindingField } = require('../shared/numeric-bindings.cjs');
    const element = normalizeOverlayElement({
        type: 'text', style: {
            fontSize: 20, borderWidth: 2, opacity: 1, shadow: { blur: 6 },
            numberBindings: { fontSize: 'size', borderWidth: 'size', opacity: 'alpha', 'shadow.blur': 'size', color: 'size' }
        }
    }, 0);
    const status = { customVars: [{ name: 'size', type: 'number', value: 48 }, { name: 'alpha', type: 'counter', value: 50 }] };
    const resolved = OverlayShared.resolveStyleVariables(element.style, status, {});
    assert.equal(resolved.fontSize, 48);
    assert.equal(resolved.borderWidth, 40);
    assert.equal(resolved.opacity, 0.5);
    assert.equal(resolved.shadow.blur, 48);
    assert.equal(element.style.fontSize, 20);
    assert.equal(element.style.shadow.blur, 6);
    assert.equal(element.style.numberBindings.color, undefined);
    status.customVars[0].value = -5;
    const negative = OverlayShared.resolveStyleVariables(element.style, status, {});
    assert.equal(negative.fontSize, 8);
    assert.equal(negative.borderWidth, 0);
    status.customVars[0].type = 'text';
    assert.equal(OverlayShared.resolveStyleVariables(element.style, status, {}).fontSize, 20);
    assert.equal(OverlayShared.resolveStyleVariables(element.style, { customVars: [] }, {}).opacity, 1);
    assert.equal(numericBindingField('style.__proto__'), null);
    assert.equal(numericBindingField('style.constructor'), null);
    const roundtrip = normalizeOverlayElement(JSON.parse(JSON.stringify(element)), 0);
    assert.deepEqual(roundtrip.style.numberBindings, element.style.numberBindings);
    const image = normalizeOverlayElement({ type: 'image', imageGroup: { enabled: true, cardPaddingX: 8, numberBindings: { cardPaddingX: 'size' } } }, 0);
    status.customVars[0] = { name: 'size', type: 'number', value: 32 };
    const imageResolved = OverlayShared.resolveNumericElement(image, { customVars: [...status.customVars] });
    assert.equal(imageResolved.imageGroup.cardPaddingX, 32);
    assert.equal(image.imageGroup.cardPaddingX, 8);
});

test('Numbers: each placeholder formats independently without changing numeric values or legacy fallbacks', () => {
    const status = { customVars: [{ name: 'score', type: 'number', value: 1234.5 }, { name: 'legacy', type: 'counter', value: 0 }] };
    assert.equal(OverlayShared.expandVariables('{{var.score|number:2:comma:%24:%20points}}', status), '$1,234.50 points');
    assert.equal(OverlayShared.expandVariables('{{var.score|number:1:period::}}', status), '1.234,5');
    assert.equal(OverlayShared.expandVariables('{{var.score|number:0:space::}}', status), '1 235');
    assert.equal(OverlayShared.expandVariables('{{var.score|number:2:none::}}', status), '1234.50');
    assert.equal(OverlayShared.expandVariables('{{var.legacy|number:2:none::}}', status), '0.00');
    assert.equal(OverlayShared.expandVariables('{{var.score|Fallback}}', status), '1234.5');
    assert.equal(OverlayShared.expandVariables('{{var.missing|Fallback}}', status), 'Fallback');
    assert.equal(OverlayShared.expandVariables('{{var.score|number:99:comma::}}', status), '1234.5');
    assert.equal(status.customVars[0].value, 1234.5);
});

test('Variable Groups: membership survives edits, export/import and restart without changing placeholders', async () => {
    const dir = makeTmpDir();
    const otherDir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    const imported = createVariablesStore({ dataDir: otherDir });
    try {
        store.set('brand', { type: 'color', value: '#abcdef', group: 'Broadcast Theme' });
        store.set('titles', { type: 'font', value: "'Montserrat', sans-serif", group: 'Broadcast Theme' });
        store.set('names', { type: 'list', items: ['A', 'B'], group: 'Broadcast Theme' });
        store.set('brand', { value: '#123456' });
        store.roll('names');
        assert.equal(getVar(store, 'brand').group, 'Broadcast Theme');
        assert.equal(getVar(store, 'names').group, 'Broadcast Theme');
        const res = await callApi(imported, 'POST', '/api/variables/import', { version: 2, variables: store.list() });
        assert.equal(res.status, 200);
        assert.equal(imported.values().titles, "'Montserrat', sans-serif");
        assert.equal(OverlayShared.expandVariables('{{var.brand}}', { customVars: imported.list() }), '#123456');
        imported.reload();
        assert.equal(getVar(imported, 'titles').group, 'Broadcast Theme');
        imported.set('titles', { group: '' });
        assert.equal(getVar(imported, 'titles').group, undefined);
        assert.equal(getVar(imported, 'titles').value, "'Montserrat', sans-serif");
        const groups = OverlayShared.variableGroups({ customVars: store.list() });
        assert.ok(groups.find(g => g.label === 'Variables: Broadcast Theme').items.some(([key]) => key === 'var.titles'));
    } finally {
        store.dispose();
        imported.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(otherDir, { recursive: true, force: true });
    }
});

test('Font bindings: styles resolve without mutating saved values and use a safe missing-variable fallback', () => {
    const style = { fontFamily: '{{var.heading}}', color: '#ffffff' };
    const resolved = OverlayShared.resolveStyleVariables(style, { customVars: [{ name: 'heading', type: 'font', value: 'monospace' }] });
    assert.equal(resolved.fontFamily, 'monospace');
    assert.equal(style.fontFamily, '{{var.heading}}');
    assert.equal(OverlayShared.resolveStyleVariables(style, { customVars: [] }).fontFamily, 'sans-serif');
    assert.equal(OverlayShared.resolveStyleVariables({ fontFamily: 'serif' }, { customVars: [] }).fontFamily, 'serif');
});

test('Variable Groups: empty groups persist, membership moves preserve values, and invalid edits are atomic', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.set('brand', { type: 'color', value: '#123456', group: 'Old Theme' });
        const created = await callApi(store, 'POST', '/api/variables/groups/manage', { name: 'New Theme', variables: [], createOnly: true });
        assert.equal(created.status, 200);
        store.reload();
        assert.ok(store.listGroups().includes('New Theme'));
        const collision = await callApi(store, 'POST', '/api/variables/groups/manage', { name: 'Old Theme', variables: [], createOnly: true });
        assert.equal(collision.status, 400);
        assert.equal(getVar(store, 'brand').group, 'Old Theme');
        store.manageGroup('New Theme', ['brand']);
        assert.equal(getVar(store, 'brand').value, '#123456');
        assert.equal(getVar(store, 'brand').group, 'New Theme');
        assert.throws(() => store.manageGroup('Broken', ['brand', 'missing']));
        assert.equal(getVar(store, 'brand').group, 'New Theme');
        assert.ok(!store.listGroups().includes('Broken'));
        const renamed = await callApi(store, 'POST', '/api/variables/groups/manage', { name: 'Renamed Theme', originalName: 'New Theme', variables: ['brand'] });
        assert.equal(renamed.status, 200);
        assert.equal(getVar(store, 'brand').group, 'Renamed Theme');
        assert.equal(getVar(store, 'brand').value, '#123456');
        assert.ok(!store.listGroups().includes('New Theme'));
        const duplicate = await callApi(store, 'POST', '/api/variables/groups/manage', { name: 'Old Theme', originalName: 'Renamed Theme', variables: ['brand'] });
        assert.equal(duplicate.status, 400);
        assert.equal(getVar(store, 'brand').group, 'Renamed Theme');
        assert.throws(() => store.manageGroup('Missing', [], { originalName: 'Unknown' }));
        store.reload();
        assert.equal(getVar(store, 'brand').group, 'Renamed Theme');
        store.manageGroup('Renamed Theme', []);
        assert.equal(getVar(store, 'brand').group, undefined);
        assert.ok(store.listGroups().includes('Renamed Theme'));
        store.importBundle({ groups: ['Imported Empty'] });
        store.manageGroup('Empty Renamed', [], { originalName: 'Imported Empty' });
        store.reload();
        assert.ok(store.listGroups().includes('Empty Renamed'));
        assert.ok(!store.listGroups().includes('Imported Empty'));
    } finally {
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Variable Groups UI: top-level creation and one membership dialog per group', async () => {
    const { createServer } = require('node:http');
    const puppeteer = (await import('puppeteer')).default;
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    store.set('brand', { type: 'color', value: '#123456' });
    store.set('heading', { type: 'font', value: 'serif' });
    const files = new Map([
        ...['variables-state.js', 'variables-groups.js', 'variables-numbers.js', 'variables-filter.js'].map(name => [
            `/js/variables/${name}`, fs.readFileSync(path.join(__dirname, '../public/js/variables', name), 'utf8')
        ]),
        ['/js/shared/client-core.js', fs.readFileSync(path.join(__dirname, '../public/js/shared/client-core.js'), 'utf8')]
    ]);
    const server = createServer(async (req, res) => {
        const pathname = new URL(req.url, 'http://fixture').pathname;
        if (pathname.startsWith('/api/variables')) {
            await store.handleApi(req, res, pathname, async request => {
                const chunks = [];
                for await (const chunk of request) chunks.push(chunk);
                return Buffer.concat(chunks).toString();
            });
        } else if (files.has(pathname)) {
            res.writeHead(200, { 'Content-Type': 'text/javascript' });
            res.end(files.get(pathname));
        } else if (pathname === '/groups.css') {
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(fs.readFileSync(path.join(__dirname, '../public/css/variable-groups.css')));
        } else if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); }
        else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<link rel="stylesheet" href="/groups.css"><button id="new-group">+ New Group</button><div id="rows"></div>
                <script type="module">
                import { state } from '/js/variables/variables-state.js';
                import { bindGroupDragDrop, openGroupEditor, groupedRows } from '/js/variables/variables-groups.js';
                import { openNumberEditor } from '/js/variables/variables-numbers.js';
                const refresh = async () => {
                    const data = await (await fetch('/api/variables')).json();
                    state.customVars = data.variables; state.variableGroups = data.groups;
                    document.querySelector('#rows').innerHTML = groupedRows(data.variables, data.variables.map(v => '<strong draggable="true" data-drag-variable="'+v.name+'">'+v.name+'</strong>'));
                };
                document.querySelector('#new-group').onclick = () => openGroupEditor(refresh);
                bindGroupDragDrop(document.querySelector('#rows'), refresh);
                document.querySelector('#rows').onclick = e => {
                    const button = e.target.closest('[data-manage-group]');
                    if (button) openGroupEditor(refresh, button.dataset.manageGroup);
                };
                await refresh();
                window.openNumber = async () => {
                    await fetch('/api/variables/score', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'number', value: 1, resetValue: 0, step: 0.25, min: 0, max: 2 }) });
                    await refresh();
                    openNumberEditor(state.customVars.find(v => v.name === 'score'), refresh);
                };
                window.ready = true;
                </script>`);
        }
    });
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready);
        await page.click('#new-group');
        await page.type('[name="name"]', 'Broadcast Theme');
        await page.click('[name="member"][value="brand"]');
        await page.click('[type="submit"]');
        await page.waitForSelector('[data-manage-group="Broadcast Theme"]');
        assert.equal(getVar(store, 'brand').group, 'Broadcast Theme');
        assert.equal(await page.$('[data-act="group"]'), null);
        await page.click('[data-manage-group="Broadcast Theme"]');
        await page.click('[name="member"][value="brand"]');
        await page.click('[name="member"][value="heading"]');
        await page.click('[type="submit"]');
        await page.waitForFunction(() => !document.querySelector('dialog'));
        assert.equal(getVar(store, 'brand').group, undefined);
        assert.equal(getVar(store, 'heading').group, 'Broadcast Theme');
        assert.equal(getVar(store, 'heading').value, 'serif');
        const dropHighlighted = await page.evaluate(() => {
            const source = document.querySelector('[data-drag-variable="heading"]');
            const target = document.querySelector('[data-drop-group=""]');
            const dataTransfer = new window.DataTransfer();
            source.dispatchEvent(new window.DragEvent('dragstart', { bubbles: true, dataTransfer }));
            target.dispatchEvent(new window.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
            const highlighted = target.classList.contains('is-drop-target');
            target.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
            return highlighted;
        });
        assert.equal(dropHighlighted, true);
        await page.waitForFunction(() => {
            const header = document.querySelector('[data-drop-group=""]');
            return header.closest('details').querySelectorAll('[data-drag-variable]').length === 2;
        });
        assert.equal(getVar(store, 'heading').group, undefined);
        assert.equal(getVar(store, 'heading').value, 'serif');
        await page.evaluate(() => {
            const source = document.querySelector('[data-drag-variable="brand"]');
            const target = document.querySelector('[data-drop-group="Broadcast Theme"]');
            target.closest('details').open = false;
            const dataTransfer = new window.DataTransfer();
            source.dispatchEvent(new window.DragEvent('dragstart', { bubbles: true, dataTransfer }));
            target.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        });
        await page.waitForFunction(() => document.querySelector('[data-drop-group="Broadcast Theme"]').closest('details').querySelector('[data-drag-variable="brand"]'));
        assert.equal(getVar(store, 'brand').group, 'Broadcast Theme');
        assert.equal(getVar(store, 'brand').value, '#123456');
        await page.setViewport({ width: 375, height: 700 });
        await page.click('#new-group');
        assert.ok(await page.evaluate(() => document.querySelector('dialog').getBoundingClientRect().width <= window.innerWidth));
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.openNumber());
        await page.click('[data-number-action="increment"]');
        await page.waitForFunction(() => document.querySelector('[name="value"]').value === '1.25');
        assert.equal(getVar(store, 'score').value, 1.25);
        await page.click('[data-number-action="reset"]');
        await page.waitForFunction(() => document.querySelector('[name="value"]').value === '0');
        await page.$eval('[name="value"]', node => { node.value = '100'; });
        await page.click('[type="submit"]');
        await page.waitForFunction(() => !document.querySelector('dialog'));
        assert.equal(getVar(store, 'score').value, 2);
        await page.waitForFunction(() => !document.querySelector('dialog'));
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Variables page: inline saves, cancellation, live snapshots and persistent group filters', async () => {
    const { createServer } = require('node:http');
    const puppeteer = (await import('puppeteer')).default;
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    store.set('score', { type: 'number', value: 1, resetValue: 0, step: 0.25, min: 0, max: 2, group: 'Broadcast Theme' });
    store.set('message', { type: 'text', value: 'Hello', group: 'Broadcast Theme' });
    store.set('plain', { type: 'text', value: 'Ungrouped' });
    const publicRoot = path.resolve(__dirname, '../public');
    let mutations = 0;
    const server = createServer(async (req, res) => {
        const pathname = new URL(req.url, 'http://fixture').pathname;
        if (pathname.startsWith('/api/variables')) {
            if (req.method === 'PUT') mutations++;
            await store.handleApi(req, res, pathname, async request => {
                const chunks = [];
                for await (const chunk of request) chunks.push(chunk);
                return Buffer.concat(chunks).toString();
            });
        } else if (pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(pathname === '/api/custom-overlays' ? [] : {}));
        } else {
            const mapped = pathname === '/placeholders.html' ? '/tools/placeholders.html' : pathname === '/overlay-shared.js' ? '/js/overlay-shared.js' : pathname;
            const file = path.resolve(publicRoot, `.${mapped}`);
            const javascript = pathname.endsWith('.js');
            res.writeHead(200, { 'Content-Type': javascript ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html' });
            res.end(file.startsWith(`${publicRoot}${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : '');
        }
    });
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.evaluateOnNewDocument(() => {
            window.WebSocket = class extends window.EventTarget {
                constructor() { super(); window.testSocket = this; }
            };
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:') ? request.continue() : request.abort());
        await page.goto(`${origin}/placeholders.html#variables`);
        await page.waitForSelector('[data-n="score"] [data-inline-edit]');
        const queryResults = await page.evaluate(async () => {
            const { parseVariableQuery, matchesVariableQuery, groupFilterTag } = await import('/js/variables/variables-filter.js');
            const groups = ['Broadcast Theme', 'Ungrouped', 'A"B'];
            const vars = [{ name: 'score', type: 'counter', value: 1, group: 'Broadcast Theme' }, { name: 'plain', type: 'text' }, { name: 'set', type: 'text', setId: 'demo' }, { name: 'named', type: 'text', group: 'Ungrouped' }];
            return ['#BroadcastTheme number', '#"Broadcast Theme"', '#ungrouped', '#"Ungrouped"', '#missing', '#"bad\\q"', '#""'].map(raw => vars.filter(v => matchesVariableQuery(v, parseVariableQuery(raw, groups))).map(v => v.name)).concat([[parseVariableQuery(groupFilterTag('A"B'), groups).group]]);
        });
        assert.deepEqual(queryResults, [['score'], ['score'], ['plain'], ['named'], [], [], [], ['A"B']]);

        const edit = async (name, value) => {
            await page.click(`[data-n="${name}"] [data-inline-edit]`);
            await page.waitForSelector(`[aria-label="${name} value"]`);
            await page.$eval(`[aria-label="${name} value"]`, (node, next) => { node.value = next; }, value);
        };
        await edit('score', '1.5');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-n="score"] [data-inline-edit]')?.textContent.includes('1.5'));
        assert.equal(mutations, 1);
        assert.equal(getVar(store, 'score').resetValue, 0);
        assert.equal(getVar(store, 'score').step, 0.25);
        assert.equal(getVar(store, 'score').group, 'Broadcast Theme');

        await edit('message', 'Cancelled');
        await page.keyboard.press('Escape');
        assert.equal(getVar(store, 'message').value, 'Hello');
        assert.equal(mutations, 1);
        await edit('score', '1.5');
        await page.click('[data-n="message"] [data-inline-edit]');
        await page.waitForSelector('[aria-label="message value"]');
        assert.equal(mutations, 1);
        await page.keyboard.press('Escape');

        await edit('score', '1.75');
        const target = await page.$eval('[data-n="message"] [data-inline-edit]', node => {
            const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        });
        await page.mouse.move(target.x, target.y);
        await page.mouse.down();
        await page.waitForFunction(() => document.querySelector('[aria-label="score value"]')?.disabled);
        await page.waitForFunction(async () => (await (await fetch('/api/variables')).json()).variables.find(v => v.name === 'score').value === 1.75);
        assert.equal(getVar(store, 'score').value, 1.75);
        await page.mouse.up();
        await page.waitForSelector('[aria-label="message value"]');
        assert.equal(mutations, 2);
        await page.$eval('[aria-label="message value"]', node => { node.value = 'Draft'; });
        store.set('plain', { value: 'Live update' });
        await page.evaluate(variables => {
            window.testSocket.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify({ type: 'variables-update', data: { variables } }) }));
        }, store.list());
        assert.equal(await page.$eval('[aria-label="message value"]', node => node.value), 'Draft');
        await page.keyboard.press('Escape');
        assert.equal(await page.$eval('[data-n="plain"] [data-inline-edit]', node => node.textContent.trim()), 'Live update');
        await edit('message', 'Saved on blur');
        await page.click('#var-search');
        await page.waitForFunction(() => document.querySelector('[data-n="message"] [data-inline-edit]')?.textContent.includes('Saved on blur'));
        assert.equal(mutations, 3);

        await edit('score', '1.4');
        await page.click('[data-select-variable="score"]');
        await page.waitForSelector('#variable-inspector [name="value"]');
        assert.equal(await page.$eval('#variable-inspector [name="value"]', node => node.value), '1.4');
        await page.click('[data-inspector-close]');
        await edit('score', '');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-n="score"] [data-inline-edit]')?.textContent.includes('1.4'));
        assert.equal(getVar(store, 'score').value, 1.4);
        const search = async value => {
            await page.$eval('#var-search', (node, next) => { node.value = next; node.dispatchEvent(new Event('input', { bubbles: true })); }, value);
        };
        await page.click('[data-filter-group="Broadcast Theme"]');
        assert.equal(await page.evaluate(() => window.location.hash), '#variables#Broadcast%20Theme');
        assert.equal(await page.$eval('[data-filter-group="Broadcast Theme"] span', node => node.textContent), 'Broadcast Theme');
        assert.equal(await page.$eval('#var-group-filter span', node => node.textContent), 'Broadcast Theme');
        assert.equal(await page.$eval('#var-search', node => node.value), '');
        assert.equal(await page.$$eval('#vars-list [data-n]', rows => rows.length), 2);
        await page.goBack();
        await page.waitForFunction(() => window.location.hash === '#variables' && document.querySelectorAll('#vars-list [data-n]').length === 3);
        await page.goForward();
        await page.waitForFunction(() => window.location.hash === '#variables#Broadcast%20Theme' && document.querySelectorAll('#vars-list [data-n]').length === 2);
        await search('HeLLo');
        await page.click('#var-clear-group');
        assert.equal(await page.$eval('#var-search', node => node.value), 'HeLLo');
        assert.equal(await page.evaluate(() => window.location.hash), '#variables');
        await search('');
        await page.evaluate(() => { window.location.hash = '#variables#ungrouped'; });
        await page.waitForSelector('[data-n="plain"]');
        assert.deepEqual(await page.$$eval('#vars-list [data-n]', rows => rows.map(row => row.dataset.n)), ['plain']);
        await page.evaluate(() => { window.location.hash = '#variables#%ZZ'; });
        await page.waitForFunction(() => document.querySelector('#vars-list').textContent.includes('No variables match'));
        assert.equal(await page.$$eval('#vars-list [data-n]', rows => rows.length), 0);
        await page.evaluate(() => { window.location.hash = '#variables'; });
        await page.waitForSelector('[data-n="score"]');
        await search('');
        await page.click('#var-group-add');
        await page.type('dialog [name="name"]', 'Empty');
        await page.click('dialog [type="submit"]');
        await page.waitForSelector('[data-filter-group="Empty"]');
        await page.evaluate(() => { window.location.hash = '#variables#empty'; });
        await page.waitForSelector('[data-manage-group="Empty"]');
        assert.equal(await page.$$eval('#variable-group-nav .is-active', rows => rows.length), 1);
        await page.evaluate(() => { window.location.hash = '#variables#BroadcastTheme'; });
        await page.waitForSelector('[data-n="score"]');
        await search('score');
        await page.select('#var-type-filter', 'number');
        await page.reload();
        await page.waitForSelector('[data-n="score"] [data-inline-edit]');
        assert.equal(await page.evaluate(() => window.location.hash), '#variables#BroadcastTheme');
        assert.equal(await page.$eval('#var-search', node => node.value), 'score');
        assert.equal(await page.$eval('#var-type-filter', node => node.value), 'number');
        assert.equal(await page.$$eval('#vars-list [data-n]', rows => rows.length), 1);
        await page.click('[data-select-variable="score"]');
        await page.$eval('#variable-inspector [name="step"]', node => { node.value = '0.5'; node.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('[data-select-variable="score"]');
        assert.equal(await page.$eval('#variable-inspector [name="step"]', node => node.value), '0.5', 'reselecting the same variable preserves unsaved options');
        await page.click('[data-n="score"] [data-act="increment"]');
        await page.waitForFunction(() => document.querySelector('[data-n="score"] [data-inline-edit]')?.textContent.includes('1.65'));
        assert.equal(await page.$eval('#variable-inspector [name="value"]', node => node.value), '1.4');
        await page.click('#variable-inspector [type="submit"]');
        await page.waitForFunction(() => document.querySelector('#variable-inspector [name="step"]').value === '0.5' && document.querySelector('#variable-inspector [name="value"]').value === '1.65');
        assert.equal(getVar(store, 'score').value, 1.65);
        assert.equal(getVar(store, 'score').step, 0.5);
        await edit('score', '1.4');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-n="score"] [data-inline-edit]')?.textContent.includes('1.4'));
        await page.evaluate(() => {
            const nativeFetch = window.fetch.bind(window);
            window.fetch = async (...args) => {
                const response = await nativeFetch(...args);
                if (args[0] === '/api/variables/groups/manage' && response.ok) {
                    const data = await response.clone().json();
                    window.testSocket.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify({ type: 'variables-update', data }) }));
                }
                return response;
            };
        });
        await page.click('[data-manage-group="Broadcast Theme"]');
        await page.$eval('dialog [name="name"]', node => { node.value = 'Theme'; });
        await page.click('dialog [type="submit"]');
        await page.waitForSelector('[data-filter-group="Theme"]');
        assert.equal(await page.evaluate(() => window.location.hash), '#variables#Theme');
        assert.equal(getVar(store, 'score').group, 'Theme');
        assert.equal(getVar(store, 'score').value, 1.4);
        assert.equal(getVar(store, 'score').step, 0.5);
        assert.equal(getVar(store, 'message').group, 'Theme');
        await page.evaluate(() => { window.location.hash = '#variables#theme'; });
        await page.waitForFunction(() => window.location.hash === '#variables#theme' && document.querySelector('[data-n="score"]'));
        await page.evaluate(() => { window.location.hash = '#variables#BroadcastTheme'; });
        await page.waitForFunction(() => document.querySelector('#vars-list').textContent.includes('No variables match'));
        await search('');
        await page.select('#var-type-filter', 'all');
        await page.evaluate(() => { window.location.hash = '#variables#Theme'; });
        await page.waitForSelector('[data-n="score"]');
        await page.type('#var-name', 'Accent');
        await page.select('#var-type', 'color');
        await page.click('#var-add');
        await page.waitForSelector('#variable-inspector [data-inspector-color]');
        assert.equal(getVar(store, 'accent').group, 'Theme', 'creation uses the current group');
        await page.$eval('#variable-inspector [name="value"]', node => {
            node.value = '#12345678'; node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.$eval('[data-inspector-color]', node => {
            node.value = '#654321'; node.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.click('#variable-inspector [type="submit"]');
        await page.waitForFunction(() => !document.querySelector('#variable-inspector [type="submit"]').disabled);
        assert.equal(getVar(store, 'accent').value, '#65432178', 'native color editing preserves opacity');
        await page.click('[data-select-variable="score"]');
        for (const width of [1366, 1280, 1024, 900]) {
            await page.setViewport({ width, height: 768 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal overflow at ${width}px`);
            assert.ok(await page.evaluate(() => {
                const table = document.querySelector('#vars-list').getBoundingClientRect();
                const inspector = document.querySelector('#variable-inspector').getBoundingClientRect();
                return inspector.left >= table.right && inspector.width >= 280;
            }), 'laptop inspector stays beside the variable list');
        }
        await page.setViewport({ width: 1280, height: 768 });
        assert.ok(await page.$eval('#variable-inspector', node => node.getBoundingClientRect().width) >= 360, 'desktop inspector has room for settings');
        const actionRects = await page.$$eval('.variable-inspector-footer button', buttons =>
            buttons.map(button => ({ top: button.getBoundingClientRect().top, height: button.getBoundingClientRect().height })));
        assert.equal(new Set(actionRects.map(rect => rect.top)).size, 1, 'inspector actions share one row');
        assert.equal(new Set(actionRects.map(rect => rect.height)).size, 1, 'inspector action heights match');
        const selectedWidth = await page.$eval('#vars-list', node => node.getBoundingClientRect().width);
        await page.click('[data-inspector-close]');
        assert.ok(await page.$eval('#vars-list', node => node.getBoundingClientRect().width) > selectedWidth, 'closing the inspector returns space to the list');
        await page.setViewport({ width: 375, height: 700 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        store.upsertSet('laptop', {
            name: 'Fictional panel', slotsCount: 2,
            fields: [{ key: 'name', label: 'Name', type: 'text' }],
            roster: [
                { id: 'alpha', label: 'Fictional Alpha', values: { name: 'Alpha' } },
                { id: 'beta', label: 'Fictional Beta', values: { name: 'Beta' } }
            ],
            slots: ['alpha', 'beta']
        });
        store.setModuleEnabled(true);
        await page.setViewport({ width: 1366, height: 768 });
        await page.goto(`${origin}/placeholders.html#sets`);
        await page.reload();
        await page.waitForSelector('[data-set-card="laptop"] .slot-card');
        const slotTops = await page.$$eval('.slot-card', slots => slots.map(slot => slot.getBoundingClientRect().top));
        assert.equal(new Set(slotTops).size, 1, 'laptop output slots use the available width instead of stacking');
        for (const width of [1366, 1280, 1024, 900, 375]) {
            await page.setViewport({ width, height: 768 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Sets has no horizontal overflow at ${width}px`);
            assert.ok(await page.$$eval('.roster-controls', controls => controls.every(control =>
                new Set([...control.children].map(button => button.getBoundingClientRect().top)).size === 1)), 'roster buttons stay aligned');
        }
        await page.click('[data-set-act="toggle-group-entry"][data-entry="alpha"]');
        await page.waitForFunction(() => document.querySelector('[data-set-act="toggle-group-entry"][data-entry="alpha"]').textContent === 'Out');
        assert.equal(store.listSets().find(set => set.id === 'laptop').roster[0].inGroup, false);
        await page.setViewport({ width: 1366, height: 768 });
        await page.goto(`${origin}/placeholders.html#placeholders`);
        await page.waitForSelector('.placeholder-table');
        const toolbarHeights = await page.$$eval('.placeholder-toolbar input[type="search"], .placeholder-toolbar select, .placeholder-toolbar button',
            controls => controls.map(control => control.getBoundingClientRect().height));
        assert.equal(new Set(toolbarHeights).size, 1, 'reference toolbar controls share one height');
        await page.$eval('#q', input => { input.value = 'var.score'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        assert.equal(await page.$eval('#out [data-copy]', code => code.dataset.copy), '{{var.score}}', 'reference search still finds Number placeholders');
        await page.click('#vals');
        assert.equal(await page.$$eval('#out tr:first-child td', cells => cells.length), 2, 'hiding live values retains token and description columns');
        await page.$eval('#q', input => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('#vals');
        await page.setViewport({ width: 375, height: 700 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'reference tables do not leak horizontally on mobile');
        await page.setViewport({ width: 1366, height: 768 });
        await page.goto(`${origin}/placeholders.html#variables`);
        await page.waitForSelector('#vars-list [data-n]');
        for (const [type, value, updated] of [
            ['date', '2026-12-10', '2026-12-11'],
            ['time', '18:30', '19:45'],
            ['datetime', '2026-12-10T18:30', '2026-12-11T19:45'],
            ['duration', '45m', '1:30:00']
        ]) {
            const name = `show_${type}`;
            await page.type('#var-name', name);
            await page.select('#var-type', type);
            await page.click('#var-add');
            await page.waitForFunction(name => document.querySelector('#variable-inspector h3')?.textContent === name, {}, name);
            assert.equal(await page.$eval('#variable-inspector [name="value"]', input => input.type), type === 'datetime' ? 'datetime-local' : type === 'duration' ? 'text' : type);
            await page.$eval('#variable-inspector [name="value"]', (input, value) => {
                input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
            }, value);
            await page.click('#variable-inspector [type="submit"]');
            await page.waitForFunction(({ name, value }) => document.querySelector(`[data-n="${name}"] [data-inline-edit]`)?.textContent.includes(value), {}, { name, value });
            await page.click('[data-inspector-close]');
            await edit(name, updated);
            await page.keyboard.press('Enter');
            await page.waitForFunction(({ name, updated }) => document.querySelector(`[data-n="${name}"] [data-inline-edit]`)?.textContent.includes(updated), {}, { name, updated });
            assert.equal(getVar(store, name).type, type);
            assert.equal(getVar(store, name).value, updated);
            await page.select('#var-type-filter', type);
            assert.deepEqual(await page.$$eval('#vars-list [data-n]', rows => rows.map(row => row.dataset.n)), [name]);
            await page.select('#var-type-filter', 'all');
        }
        store.reload();
        assert.equal(getVar(store, 'show_datetime').value, '2026-12-11T19:45', 'local date/time survives persistence without timezone conversion');
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

function mockRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(code, headers) {
            this.statusCode = code;
            this.headers = headers || {};
        },
        end(chunk) {
            this.body = chunk ? String(chunk) : '';
        }
    };
    return res;
}

async function callApi(store, method, rawUrl, bodyObj = null, headers = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.url = rawUrl;
    req.headers = headers;
    const urlObj = new URL(rawUrl, 'http://localhost');
    const res = mockRes();
    const readBody = () => Promise.resolve(typeof bodyObj === 'string' ? bodyObj : (bodyObj !== null ? JSON.stringify(bodyObj) : ''));
    const handled = await store.handleApi(req, res, urlObj.pathname, readBody);
    const isJson = String(res.headers['Content-Type'] || '').includes('application/json');
    return { handled, status: res.statusCode, text: res.body, json: (res.body && isJson) ? JSON.parse(res.body) : null };
}

test('Targeted entry operations merge unrelated edits, reject stale cells and preserve explicit linked order', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('show', { fields: [
            { key: 'name', type: 'text' }, { key: 'score', type: 'counter' },
            { key: 'lineup', type: 'ref_list', targetSet: 'show' }
        ], roster: [{ id: 'one', values: { name: 'One', score: '0' } }, { id: 'two', values: { name: 'Two', score: '0' } }] });
        const base = '/api/variables/sets/show/entry';
        const [name, score] = await Promise.all([
            callApi(store, 'PATCH', `${base}/set`, { entry: 'one', field: 'name', value: 'Renamed', expected: 'One' }),
            callApi(store, 'POST', `${base}/set`, { entry: 'one', field: 'score', value: '5', expected: '0' })
        ]);
        assert.equal(name.status, 200);
        assert.equal(score.status, 200);
        assert.equal(getSet(store, 'show').roster[0].values.name, 'Renamed');
        assert.equal(getSet(store, 'show').roster[0].values.score, '5');
        const conflict = await callApi(store, 'PATCH', `${base}/set`, { entry: 'one', field: 'score', value: '99', expected: '0' });
        assert.equal(conflict.status, 409);
        assert.equal(conflict.json.code, 'conflict');
        assert.equal(conflict.json.current, '5');
        await Promise.all([callApi(store, 'GET', `${base}/step?entry=one&field=score&delta=2`), callApi(store, 'POST', `${base}/step`, { entry: 'one', field: 'score', delta: 3 })]);
        assert.equal(getSet(store, 'show').roster[0].values.score, '10');
        assert.equal((await callApi(store, 'GET', `${base}/set?entry=one&property=enabled&value=false&expected=true`)).status, 200);
        assert.equal(getSet(store, 'show').roster[0].enabled, false);
        const ordered = await callApi(store, 'PATCH', `${base}/set`, { entry: 'one', field: 'lineup', value: ['two', 'one'], expected: [] });
        assert.deepEqual(ordered.json.roster[0].values.lineup, ['two', 'one']);
        await callApi(store, 'PATCH', `${base}/set`, { entry: 'one', field: 'lineup', value: ['one', 'two'], expected: ['two', 'one'] });
        assert.deepEqual(getSet(store, 'show').roster[0].values.lineup, ['one', 'two']);
        assert.equal((await callApi(store, 'PATCH', `${base}/set`, { entry: 'one', field: 'lineup', value: [], expected: ['two', 'one'] })).status, 409);
        assert.equal((await callApi(store, 'PATCH', `${base}/add`, { entry: { id: 'three', label: 'Three' } })).status, 200);
        assert.equal((await callApi(store, 'POST', `${base}/add`, { entry: { id: 'three' } })).status, 409);
        assert.equal((await callApi(store, 'DELETE', `${base}/remove?entry=three`)).status, 200);
        store.reload();
        assert.equal(getSet(store, 'show').roster[0].values.score, '10');
        assert.deepEqual(getSet(store, 'show').roster[0].values.lineup, ['one', 'two']);
    } finally { store.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Dependency guards cover links, displays and bindings without blocking internal set deletion or unrelated saves', async () => {
    const dir = makeTmpDir();
    const createDependencies = require('../server/services/variable-dependencies');
    let displays = [], overlays = [], presets = [];
    let helper;
    const store = createVariablesStore({ dataDir: dir, getDependencies: (id, entry, field) => field ? helper.forField(id, field) : helper.forSet(id, entry) });
    helper = createDependencies({ getSets: store.listSets, getVariables: store.list, getDisplays: () => displays, getOverlays: () => overlays, getPresets: () => presets });
    try {
        store.upsertSet('people', { fields: [{ key: 'name' }], roster: [{ id: 'alex', label: 'Alex' }, { id: 'sam', label: 'Sam' }] });
        store.upsertSet('schedule', { fields: [{ key: 'guests', type: 'ref_list', targetSet: 'people' }], roster: [{ id: 'opening', values: { guests: ['alex'] } }] });
        let response = await callApi(store, 'DELETE', '/api/variables/sets/people');
        assert.equal(response.status, 409);
        assert.equal(response.json.code, 'dependencies');
        assert.match(response.json.dependencies[0].label, /schedule.*guests/i);
        response = await callApi(store, 'PATCH', '/api/variables/sets/people/entry/remove', { entry: 'alex' });
        assert.equal(response.status, 409);
        assert.ok(response.json.dependencies.some(use => /opening/.test(use.label)));
        assert.equal((await callApi(store, 'PATCH', '/api/variables/sets/people/entry/remove', { entry: 'sam' })).status, 200);
        store.upsertSet('people', { name: 'People renamed' });
        assert.throws(() => store.upsertSet('people', { roster: [] }), /references first/);
        assert.throws(() => store.importBundle({ sets: [{ id: 'people', roster: [] }] }), /references first/);
        store.deleteSet('schedule');
        displays = [{ id: 'cards', name: 'Guest cards', catalogId: 'people', sections: [{ items: [{ itemId: 'alex' }] }] }];
        assert.equal(helper.forSet('people', 'alex')[0].kind, 'display');
        displays = [{ id: 'table', name: 'Run sheet', catalogId: 'people', table: { rowOrder: ['alex'] } }];
        assert.match(helper.forSet('people', 'alex')[0].label, /row/);
        displays[0].table.columns = [{ key: 'name', label: 'Guest name' }];
        assert.throws(() => store.upsertSet('people', { fields: [{ key: 'other' }] }), /Guest name/);
        assert.throws(() => store.importBundle({ sets: [{ id: 'people', fields: [{ key: 'other' }] }] }), /Guest name/);
        store.upsertSet('people', { fields: [{ key: 'name', label: 'Guest', type: 'text' }, { key: 'other' }] });
        assert.equal(getSet(store, 'people').fields.length, 2, 'Unrelated schema additions stay usable');
        displays = [{ id: 'badge', name: 'Guest badges', kind: 'badge', catalogId: 'people', badge: { imageGroup: { fields: [{ key: 'other' }], cardBorderColor: '@name' } } }];
        assert.ok(helper.forField('people', 'other').some(use => /badge field/.test(use.label)), 'Badge fields protect their catalog schema');
        assert.ok(helper.forField('people', 'name').some(use => /badge field/.test(use.label)), 'Per-member style bindings protect their fields');
        store.upsertSet('schedule', { fields: [{ key: 'guests', type: 'ref_list', targetSet: 'people' }], roster: [{ id: 'opening' }] });
        store.set('caption', { value: '{{var.schedule_guests.field.other}}' });
        assert.ok(helper.forField('people', 'other').some(use => use.kind === 'variable'), 'Linked-list field paths protect their target schema');
        store.set('caption', { value: 'No linked token' });
        store.deleteSet('schedule');
        displays = [];
        overlays = [{ id: 'live', name: 'Live', elements: [{ id: 'card', type: 'data-display', display: { displayId: 'cards', setId: 'people', selector: 'entry:alex' } }] }];
        assert.equal(helper.forDisplay('cards')[0].kind, 'overlay');
        assert.equal(helper.forSet('people', 'alex')[0].kind, 'overlay');
        presets = overlays;
        assert.ok(helper.forDisplay('cards').some(use => use.kind === 'preset'));
        overlays = [{ id: 'literal', name: 'Unrelated', elements: [{ type: 'text', text: 'people alex cards' }] }];
        presets = [];
        assert.deepEqual(helper.forSet('people'), []);
        store.set('caption', { value: '{{var.people_name}}' });
        assert.equal(helper.forSet('people')[0].kind, 'variable');
        store.set('caption', { value: 'No linked token' });
        store.upsertSet('people', { fields: [{ key: 'friend', type: 'ref', targetSet: 'people' }], roster: [{ id: 'alex', values: { friend: 'alex' } }] });
        assert.deepEqual(helper.forSet('people'), []);
        store.deleteSet('people');
    } finally { store.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Operator saves only dirty cells and keeps failed pending edits without reporting Saved', async () => {
    const vm = require('node:vm');
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('live', { fields: [{ key: 'name' }, { key: 'score', type: 'counter' }], roster: [{ id: 'one', values: { name: 'One', score: '0' } }] });
        const state = { sets: [globalThis.structuredClone(getSet(store, 'live'))] };
        const badge = { setAttribute() {} };
        const calls = [];
        const context = vm.createContext({
            state, structuredClone: globalThis.structuredClone, URL, URLSearchParams, console,
            location: { hash: '#live', search: '', href: 'http://localhost/operator#live' },
            localStorage: { getItem: () => null }, document: { getElementById: () => badge, activeElement: { dataset: { opEntry: 'one', opKey: 'name' } } },
            setTimeout: () => 1, clearTimeout() {}, toast() {},
            api: async (url, method, body) => {
                calls.push({ url, method, body });
                const result = await callApi(store, method, url, body);
                if (result.status >= 400) throw new Error(result.json.error);
                return result.json;
            }
        });
        let source = fs.readFileSync(path.join(__dirname, '../public/js/variables/variable-set-operator.js'), 'utf8').replace(/^import .*;\n/gm, '');
        source = source.slice(0, source.lastIndexOf('\nbindEvents();'));
        vm.runInContext(`${source}\nglobalThis.operator = { persistRoster, savedRosters, rebasePendingRoster };`, context);
        const operator = context.operator;
        const setObj = state.sets[0];
        operator.savedRosters.set('live', globalThis.structuredClone(setObj.roster));
        store.mutateEntry('live', 'set', { entry: 'one', field: 'score', value: '10' });
        setObj.roster[0].values.name = 'Local rename';
        await operator.persistRoster(setObj);
        assert.equal(getSet(store, 'live').roster[0].values.score, '10');
        assert.equal(calls.length, 1, 'An unrelated stale score must never be written back');
        assert.equal(calls[0].body.field, 'name');
        assert.equal(calls[0].method, 'PATCH');
        store.mutateEntry('live', 'set', { entry: 'one', field: 'name', value: 'Remote rename' });
        setObj.roster[0].values.name = 'Pending local rename';
        await operator.persistRoster(setObj);
        assert.equal(getSet(store, 'live').roster[0].values.name, 'Remote rename');
        assert.equal(setObj.roster[0].values.name, 'Pending local rename');
        assert.match(badge.textContent, /Unsaved/);
        await operator.persistRoster(setObj);
        assert.match(badge.textContent, /Unsaved/);
        assert.equal(calls.length, 2, 'Failed conflicts require an explicit retry');
        const oldRoster = [
            { id: 'one', values: { name: 'Old', score: '0' } },
            { id: 'two', values: { name: 'Two', score: '0' } }
        ];
        const pending = { roster: globalThis.structuredClone(oldRoster) };
        pending.roster[0].values.name = 'Pending';
        operator.rebasePendingRoster(pending, oldRoster, [{ id: 'one', values: { name: 'Remote', score: '42' } }]);
        assert.deepEqual(pending.roster.map(entry => entry.id), ['one'], 'Retry never recreates unrelated remote deletions');
        assert.equal(pending.roster[0].values.name, 'Pending');
        assert.equal(pending.roster[0].values.score, '42', 'Retry rebases unrelated remote cells');
        assert.throws(() => operator.rebasePendingRoster(pending, oldRoster, []), /removed elsewhere/);
    } finally { store.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Linked selection retains explicit order through additions, removals and keyboard button moves', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/variables/variables-links.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ');
    const { linkControl, bindLinkControls } = new Function('esc', `${source}\nreturn { linkControl, bindLinkControls };`)(value => String(value));
    const html = linkControl({ type: 'ref_list', targetSet: 'people', label: 'Lineup' }, ['b', 'a'],
        [{ id: 'people', roster: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Charlie' }] }], '');
    assert.ok(html.indexOf('data-link-selected="b"') < html.indexOf('data-link-selected="a"'));
    assert.match(html, /aria-label="Move Beta later"/);
    const handlers = {};
    const value = { value: '["b","a"]', dispatchEvent() {} };
    const order = {}, summary = {};
    const inputs = ['a', 'b', 'c'].map(id => ({
        value: id, checked: id !== 'c', parentElement: { textContent: id },
        matches: selector => selector === '[data-link-option] input', closest: () => control
    }));
    const control = {
        querySelector: selector => selector === '[data-link-value]' ? value : selector === 'summary' ? summary : order,
        querySelectorAll: selector => selector === '[data-link-option] input' ? inputs : []
    };
    bindLinkControls({ addEventListener: (name, handler) => { handlers[name] = handler; } });
    inputs[2].checked = true;
    handlers.change({ target: inputs[2] });
    assert.equal(value.value, '["b","a","c"]', 'New selections append; catalog order cannot reorder the lineup');
    inputs[0].checked = false;
    handlers.change({ target: inputs[0] });
    assert.equal(value.value, '["b","c"]');
    const button = {
        dataset: { linkMove: '-1' }, hasAttribute: () => false,
        closest: selector => selector === '[data-link-control]' ? control : { dataset: { linkSelected: 'c' } }
    };
    handlers.click({ target: { closest: () => button } });
    assert.equal(value.value, '["c","b"]');
});

test('Variables: image, toggle, color, and template types + onChange', async () => {
    const dir = makeTmpDir();
    try {
        const events = [];
        const store = createVariablesStore({ dataDir: dir, onChange: payload => events.push(payload) });

        store.set('logo', { type: 'image', value: '/assets/logo.png' });
        store.set('banner_on', { type: 'toggle', value: 'true' });
        store.set('brand_color', { type: 'color', value: '#ff5500' });
        store.set('speaker_name', { type: 'text', value: 'Alex' });
        store.set('speaker_title', { type: 'text', value: '' });
        store.set('speaker_card', { type: 'template', value: '{{var.speaker_name}} — {{var.speaker_title|Guest}}' });

        assert.equal(getVar(store, 'logo').value, '/assets/logo.png');
        assert.equal(getVar(store, 'banner_on').value, 'true');
        assert.equal(getVar(store, 'brand_color').value, '#ff5500');

        const vals = store.values();
        assert.equal(vals.speaker_card, 'Alex — Guest');

        // Toggle via service & HTTP GET (Companion-friendly)
        store.toggleVar('banner_on');
        assert.equal(getVar(store, 'banner_on').value, 'false');

        const apiRes = await callApi(store, 'GET', '/api/variables/banner_on/toggle');
        assert.equal(apiRes.handled, true);
        assert.equal(apiRes.status, 200);
        assert.equal(apiRes.json.value, 'true');

        // ?raw=1 returns unexpanded template as plain text; default GET returns JSON metadata
        const rawRes = await callApi(store, 'GET', '/api/variables/speaker_card?raw=1');
        assert.equal(rawRes.text, '{{var.speaker_name}} — {{var.speaker_title|Guest}}');

        const metaRes = await callApi(store, 'GET', '/api/variables/speaker_card');
        assert.equal(metaRes.json.name, 'speaker_card');
        assert.equal(metaRes.json.type, 'template');

        assert.ok(events.length >= 6, 'onChange should fire on variable mutations');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Variable Sets: multi-slot roster, assign, swap, cycle, clear, and delete', async () => {
    const dir = makeTmpDir();
    try {
        const store = createVariablesStore({ dataDir: dir });

        const setObj = store.upsertSet('speaker', {
            name: 'Speakers',
            slotsCount: 2,
            slotNames: ['Host', 'Guest'],
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'title', label: 'Title', type: 'text' },
                { key: 'photo', label: 'Photo', type: 'image' },
                { key: 'accent', label: 'Accent', type: 'color' }
            ],
            roster: [
                { id: 'alex', label: 'Alex Chen', values: { name: 'Alex Chen', title: 'Host', photo: '/assets/alex.png', accent: '#3b82f6' } },
                { id: 'maya', label: 'Maya Patel', values: { name: 'Maya Patel', title: 'Guest', photo: 'https://example.com/maya.jpg', accent: '#10b981' } },
                { id: 'sam', label: 'Sam Rivera', values: { name: 'Sam Rivera', title: 'Producer', photo: '', accent: '#f59e0b' } }
            ],
            slots: ['alex', 'maya']
        });

        assert.equal(setObj.slotsCount, 2);
        assert.equal(getVar(store, 'speaker_1_slot_name').value, 'Host');
        assert.equal(getVar(store, 'speaker_2_slot_name').value, 'Guest');
        assert.equal(getVar(store, 'speaker_host_name').value, 'Alex Chen');
        assert.equal(getVar(store, 'speaker_guest_name').value, 'Maya Patel');
        assert.equal(getVar(store, 'speaker_1_name').value, 'Alex Chen');
        assert.equal(getVar(store, 'speaker_1_active').value, 'true');
        assert.equal(getVar(store, 'speaker_2_name').value, 'Maya Patel');
        assert.equal(getVar(store, 'speaker_2_photo').value, 'https://example.com/maya.jpg');
        // Slot 1 aliases
        assert.equal(getVar(store, 'speaker_name').value, 'Alex Chen');
        assert.equal(getVar(store, 'speaker_active').value, 'true');

        // Swap slots 1 and 2 via Companion-friendly GET endpoint
        const swapRes = await callApi(store, 'GET', '/api/variables/sets/speaker/swap?from=1&to=2');
        assert.equal(swapRes.status, 200);
        assert.equal(getVar(store, 'speaker_1_name').value, 'Maya Patel');
        assert.equal(getVar(store, 'speaker_2_name').value, 'Alex Chen');
        assert.equal(getVar(store, 'speaker_name').value, 'Maya Patel');

        // Cycle slot 2 next: skips Maya (occupied in slot 1) and goes directly to Sam
        await callApi(store, 'POST', '/api/variables/sets/speaker/next?slot=2', {});
        assert.equal(getVar(store, 'speaker_2_name').value, 'Sam Rivera');

        // Advance queue shifts Slot 2 -> Slot 1 and pulls next unoccupied (Alex) into Slot 2
        await callApi(store, 'GET', '/api/variables/sets/speaker/advance');
        assert.equal(getVar(store, 'speaker_1_name').value, 'Sam Rivera');
        assert.equal(getVar(store, 'speaker_2_name').value, 'Alex Chen');

        // Rewind queue restores Maya -> Slot 1 and Sam -> Slot 2
        await callApi(store, 'POST', '/api/variables/sets/speaker/rewind', {});
        assert.equal(getVar(store, 'speaker_1_name').value, 'Maya Patel');
        assert.equal(getVar(store, 'speaker_2_name').value, 'Sam Rivera');

        // Per-slot queues: enqueue Alex & Sam onto Slot 1, Maya onto Slot 2, then pop on Next
        await callApi(store, 'POST', '/api/variables/sets/speaker/queue/add?slot=1&entry=alex', {});
        await callApi(store, 'POST', '/api/variables/sets/speaker/queue/add?slot=1&entry=sam', {});
        await callApi(store, 'POST', '/api/variables/sets/speaker/queue/add?slot=2&entry=maya', {});
        assert.deepEqual(getSet(store, 'speaker').slotQueues, [['alex', 'sam'], ['maya']]);

        // Next on Slot 1 pops Alex (leaving Sam queued)
        await callApi(store, 'GET', '/api/variables/sets/speaker/next?slot=1');
        assert.equal(getVar(store, 'speaker_1_name').value, 'Alex Chen');
        assert.deepEqual(getSet(store, 'speaker').slotQueues[0], ['sam']);

        // Next on Slot 2 pops Maya (leaving Slot 2 queue empty)
        await callApi(store, 'GET', '/api/variables/sets/speaker/next?slot=2');
        assert.equal(getVar(store, 'speaker_2_name').value, 'Maya Patel');
        assert.deepEqual(getSet(store, 'speaker').slotQueues[1], []);

        // Remove/Clear remaining queue
        await callApi(store, 'POST', '/api/variables/sets/speaker/queue/clear?slot=1', {});
        assert.deepEqual(getSet(store, 'speaker').slotQueues[0], []);

        // Clear slot 1
        await callApi(store, 'GET', '/api/variables/sets/speaker/clear?slot=1');
        assert.equal(getVar(store, 'speaker_1_name').value, '');
        assert.equal(getVar(store, 'speaker_1_active').value, 'false');
        assert.equal(getVar(store, 'speaker_name').value, '');

        // Assign sam to slot 1 by label/id
        await callApi(store, 'POST', '/api/variables/sets/speaker/assign?slot=1&entry=alex', {});
        assert.equal(getVar(store, 'speaker_1_name').value, 'Alex Chen');

        // Import/Export bundle roundtrip
        const bundle = {
            variables: [{ name: 'event_tag', type: 'text', value: 'LIVE' }],
            sets: [getSet(store, 'speaker')]
        };
        const dir2 = makeTmpDir();
        try {
            const store2 = createVariablesStore({ dataDir: dir2 });
            store2.importBundle(bundle);
            assert.equal(getVar(store2, 'event_tag').value, 'LIVE');
            assert.equal(getVar(store2, 'speaker_1_name').value, 'Alex Chen');
        } finally {
            fs.rmSync(dir2, { recursive: true, force: true });
        }

        // Deleting set cleans up materialized set vars
        store.deleteSet('speaker');
        assert.equal(getVar(store, 'speaker_1_name'), null);
        assert.equal(getVar(store, 'speaker_name'), null);

        // Slotless preset mode (slotsCount: 0)
        const presetSet = store.upsertSet('sponsor', {
            name: 'Sponsors',
            slotsCount: 0,
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'logo', label: 'Logo', type: 'image' }
            ],
            roster: [
                { id: 'acme', label: 'Acme Co', values: { name: 'Acme Co', logo: '/assets/acme.png' } },
                { id: 'nova', label: 'Nova Labs', values: { name: 'Nova Labs', logo: 'https://example.com/nova.png' } }
            ]
        });
        assert.equal(presetSet.slotsCount, 0);
        assert.equal(getVar(store, 'sponsor_active').value, 'false');
        assert.equal(getVar(store, 'sponsor_1_name'), null);

        await callApi(store, 'POST', '/api/variables/sets/sponsor/assign?entry=acme', {});
        assert.equal(getVar(store, 'sponsor_active').value, 'true');
        assert.equal(getVar(store, 'sponsor_name').value, 'Acme Co');

        await callApi(store, 'GET', '/api/variables/sets/sponsor/next');
        assert.equal(getVar(store, 'sponsor_name').value, 'Nova Labs');

        await callApi(store, 'GET', '/api/variables/sets/sponsor/clear');
        assert.equal(getVar(store, 'sponsor_active').value, 'false');

        // Uncapped >6 slots (e.g. 8 slots)
        const bigSet = store.upsertSet('panel', { name: 'Panel', slotsCount: 8, fields: [{ key: 'name', label: 'Name', type: 'text' }], roster: [{ id: 'p1', label: 'P1', values: { name: 'P1' } }] });
        assert.equal(bigSet.slotsCount, 8);
        await callApi(store, 'POST', '/api/variables/sets/panel/assign?slot=8&entry=p1', {});
        assert.equal(getVar(store, 'panel_8_name').value, 'P1');

        // CSV Export & Import on Variable Sets (including quoted commas)
        const csvIn = 'Name,Logo\r\n"Pixel, Inc.",https://example.com/pixel.png\r\nVertex Studio,/assets/vertex.png\r\n';
        const impRes = await callApi(store, 'POST', '/api/variables/sets/sponsor/import', csvIn, { 'content-type': 'text/csv' });
        assert.equal(impRes.status, 200);
        assert.equal(impRes.json.imported, 2);
        assert.equal(impRes.json.total, 4);

        const expRes = await callApi(store, 'GET', '/api/variables/sets/sponsor/export?format=csv');
        assert.equal(expRes.status, 200);
        assert.ok(expRes.text.includes('"Pixel, Inc."'));
        assert.ok(expRes.text.includes('Vertex Studio'));

        // Enable / Disable roster entries & skip disabled on next / advance
        const toggleRes = await callApi(store, 'GET', '/api/variables/sets/sponsor/entry/toggle?entry=nova&enabled=false');
        assert.equal(toggleRes.status, 200);
        assert.equal(toggleRes.json.roster.find(r => r.id === 'nova').enabled, false);
        await callApi(store, 'POST', '/api/variables/sets/sponsor/assign?entry=acme', {});
        await callApi(store, 'GET', '/api/variables/sets/sponsor/next');
        assert.notEqual(getVar(store, 'sponsor_name').value, 'Nova Labs');

        // Multi-slot advance skips disabled entries
        store.upsertSet('lineup', {
            name: 'Lineup',
            slotsCount: 2,
            fields: [{ key: 'name', label: 'Name', type: 'text' }],
            roster: [
                { id: 'a', label: 'A', enabled: true, values: { name: 'Alpha' } },
                { id: 'b', label: 'B', enabled: false, values: { name: 'Bravo' } },
                { id: 'c', label: 'C', enabled: true, values: { name: 'Charlie' } }
            ],
            slots: ['a', 'c']
        });
        await callApi(store, 'GET', '/api/variables/sets/lineup/advance');
        assert.equal(getVar(store, 'lineup_1_name').value, 'Charlie');
        assert.equal(getVar(store, 'lineup_2_name').value, 'Alpha');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('OverlayShared: template variables and {{var.NAME|fallback}} expansion', () => {
    const status = {
        stream: { game: { name: 'Elden Ring' } },
        customVars: [
            { name: 'speaker_1_name', type: 'text', value: 'Maya Patel' },
            { name: 'speaker_1_title', type: 'text', value: '' },
            { name: 'speaker_1_line', type: 'template', value: '{{var.speaker_1_name}} — {{var.speaker_1_title|Guest}}' },
            { name: 'stream_banner', type: 'template', value: 'Playing {{game.name}} with {{var.speaker_1_line}}' }
        ]
    };
    assert.equal(
        OverlayShared.expandVariables('Now speaking: {{var.speaker_1_title|Special Guest}}', status, {}),
        'Now speaking: Special Guest'
    );
    assert.equal(
        OverlayShared.expandVariables('{{var.speaker_1_line}}', status, {}),
        'Maya Patel — Guest'
    );
    assert.equal(
        OverlayShared.expandVariables('{{var.stream_banner}}', status, {}),
        'Playing Elden Ring with Maya Patel — Guest'
    );
    assert.equal(
        OverlayShared.expandVariables('{{var.missing_var|Default Value}}', status, {}),
        'Default Value'
    );
});

test('Variable Sets: long duplicate entry ids dedupe without hanging', () => {
    const dir = makeTmpDir();
    try {
        const store = createVariablesStore({ dataDir: dir });
        const long = 'abcdefghijklmnopqrstuvwxyz';
        const set = store.upsertSet('team', { roster: [{ id: long }, { id: long }, { id: long }] });
        assert.deepEqual(set.roster.map(r => r.id), ['abcdefghijklmnopqrstuvwx', 'abcdefghijklmnopqrstuv_2', 'abcdefghijklmnopqrstuv_3']);
        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Variable Sets: failed mutation rolls back sets and vars', () => {
    const dir = makeTmpDir();
    try {
        const store = createVariablesStore({ dataDir: dir });
        store.upsertSet('team', { roster: [{ id: 'a', values: { name: 'A' } }] });
        const before = JSON.stringify({ v: store.list(), s: store.listSets() });
        assert.throws(() => store.importBundle({ sets: [{ id: 'good', roster: [{ id: 'x' }] }, { id: '!!!' }] }));
        assert.equal(getSet(store, 'good'), null);
        assert.equal(JSON.stringify({ v: store.list(), s: store.listSets() }).replace(/"updatedAt":\d+/g, ''), before.replace(/"updatedAt":\d+/g, ''));
        // Set-materialized vars no longer count toward the 500 user-variable cap.
        const fields = Array.from({ length: 12 }, (_, i) => ({ key: `f${i}`, type: 'text' }));
        const big = store.upsertSet('big', { slotsCount: 24, fields, slotNames: Array.from({ length: 24 }, (_, i) => `seat ${String.fromCharCode(97 + i)}`) });
        assert.equal(big.slotsCount, 24);
        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Variable Sets: server rotation endpoints step enabled entries and broadcast', async () => {
    const dir = makeTmpDir();
    try {
        const events = [];
        const store = createVariablesStore({ dataDir: dir, onChange: e => events.push(e) });
        store.upsertSet('p', { roster: [{ id: 'a' }, { id: 'b', enabled: false }, { id: 'c' }] });
        let r = await callApi(store, 'GET', '/api/variables/sets/p/rotation?intervalSeconds=30&mode=sequential');
        assert.equal(r.json.rotation.intervalSeconds, 30);
        assert.equal(r.json.rotation.enabled, false);
        r = await callApi(store, 'POST', '/api/variables/sets/p/rotation/start');
        assert.equal(r.json.rotation.enabled, true);
        assert.equal(r.json.rotation.entryId, 'a');
        assert.equal(events.at(-1).rotated, 'p');
        r = await callApi(store, 'GET', '/api/variables/sets/p/rotation/next');
        assert.equal(r.json.rotation.entryId, 'c');
        r = await callApi(store, 'GET', '/api/variables/sets/p/rotation/next');
        assert.equal(r.json.rotation.entryId, 'a');
        r = await callApi(store, 'GET', '/api/variables/sets/p/rotation/prev');
        assert.equal(r.json.rotation.entryId, 'c');
        // Materialized vars keep live values; rotation is applied by following overlays.
        assert.equal(getVar(store, 'p_active').value, 'false');
        r = await callApi(store, 'POST', '/api/variables/sets/p/rotation/toggle');
        assert.equal(r.json.rotation.enabled, false);
        const reloaded = createVariablesStore({ dataDir: dir });
        assert.equal(getSet(reloaded, 'p').rotation.entryId, 'c');
        // Multi-slot sets (2+ slots) disable timed rotation cleanly
        store.upsertSet('casters', { slotsCount: 2, roster: [{ id: 'x' }, { id: 'y' }], rotation: { enabled: true } });
        assert.equal(getSet(store, 'casters').rotation.enabled, false);
        const startBlocked = await callApi(store, 'POST', '/api/variables/sets/casters/rotation/start');
        assert.equal(startBlocked.status, 400);
        reloaded.dispose();
        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Variables: templates resolve regardless of order (server and overlay)', () => {
    const dir = makeTmpDir();
    try {
        const store = createVariablesStore({ dataDir: dir });
        store.set('outer', { type: 'template', value: '[{{var.inner}}]' });
        store.set('inner', { type: 'template', value: 'Hi {{var.who}}' });
        store.set('who', { type: 'text', value: 'Sam' });
        store.set('loop', { type: 'template', value: 'x{{var.loop|y}}' });
        assert.equal(store.values().outer, '[Hi Sam]');
        assert.equal(store.values().loop, 'xy');
        const out = OverlayShared.expandVariables('{{var.outer}}', { customVars: store.list() }, {});
        assert.equal(out, '[Hi Sam]');
        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Variable Sets: overlays following a set apply server rotation to every slot-1 alias', () => {
    const sets = [{ id: 'p', slotsCount: 2, slotNames: ['Host'], fields: [{ key: 'name', type: 'text' }], roster: [{ id: 'a', values: { name: 'Ann' } }], rotation: { enabled: true, entryId: 'a' } }];
    const overlay = { variableSetFollow: { p: true }, elements: [] };
    const engine = OverlayShared.createVarRotationEngine({ getOverlay: () => overlay, getSets: () => sets, getNodes: () => new Map() });
    engine.setup(overlay);
    const vals = Object.fromEntries(engine.effectiveStatus({ customVars: [] }).customVars.map(v => [v.name, v.value]));
    assert.equal(vals.p_name, 'Ann');
    assert.equal(vals.p_1_name, 'Ann');
    assert.equal(vals.p_host_name, 'Ann');
    assert.equal(vals.p_active, 'true');
    overlay.variableSetFollow.p = false;
    engine.setup(overlay);
    assert.equal(engine.effectiveStatus({ customVars: [] }).customVars.length, 0);

    const normalized = normalizeCustomOverlay({
        id: 'sets-test',
        variableSetFollow: { p: true },
        variableSetTransitions: {
            p: { transition: 'slide-up', durationMs: 600 },
            invalid_tr: { transition: 'bogus', durationMs: 500 },
            '': { transition: 'fade' }
        }
    });
    assert.deepEqual(normalized.variableSetFollow, { p: true });
    assert.deepEqual(normalized.variableSetTransitions, { p: { transition: 'slide-up', durationMs: 600 } });
});

test('Variable Sets: moduleEnabled flag pauses timers, preserves sets on disk, and exposes variableSetsEnabled', async () => {
    const dir = makeTmpDir();
    const events = [];
    const store = createVariablesStore({ dataDir: dir, onChange: ev => events.push(ev) });
    try {
        assert.equal(store.isModuleEnabled(), true);
        store.upsertSet('spot', {
            name: 'Spotlight',
            slotsCount: 0,
            fields: [{ key: 'name', type: 'text' }],
            roster: [
                { id: 'alex', label: 'Alex', values: { name: 'Alex' } },
                { id: 'jordan', label: 'Jordan', values: { name: 'Jordan' } }
            ],
            rotation: { enabled: true, intervalSeconds: 1 }
        });

        assert.equal(store.setModuleEnabled(false), false);
        assert.equal(store.isModuleEnabled(), false);
        assert.equal(events.at(-1)?.variableSetsEnabled, false);

        const apiDisabled = await callApi(store, 'GET', '/api/variables');
        assert.equal(apiDisabled.status, 200);
        assert.equal(apiDisabled.json.variableSetsEnabled, false);
        assert.equal(apiDisabled.json.sets.length, 1, 'disabling module preserves saved sets on disk');

        assert.equal(store.setModuleEnabled(true), true);
        assert.equal(events.at(-1)?.variableSetsEnabled, true);
        const apiEnabled = await callApi(store, 'GET', '/api/variables');
        assert.equal(apiEnabled.json.variableSetsEnabled, true);
        store.dispose();

        // Reloading from disk finds saved set intact
        const reloaded = createVariablesStore({ dataDir: dir });
        assert.equal(reloaded.listSets().length, 1);
        reloaded.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Variable Sets: Group Roster Mode delimiters, empty wrappers, entry toggle & non-empty slot joins', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('squad', {
            name: 'Co-Stream Squad',
            slotsCount: 3,
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'role', label: 'Role', type: 'text' },
                { key: 'avatar', label: 'Avatar', type: 'image' }
            ],
            roster: [
                { id: 'alex', label: 'Alex', inGroup: true, values: { name: 'Alex', role: 'Host', avatar: '/a.png' } },
                { id: 'jordan', label: 'Jordan', inGroup: true, values: { name: 'Jordan', role: '', avatar: '/b.png' } },
                { id: 'casey', label: 'Casey', inGroup: false, values: { name: 'Casey', role: 'Guest', avatar: '/c.png' } },
                { id: 'morgan', label: 'Morgan', inGroup: true, values: { name: 'Morgan', role: 'Mod', avatar: '' } }
            ]
        });

        const groupCfgRes = await callApi(store, 'POST', '/api/variables/sets/squad/group', {
            separator: ', ',
            lastSeparator: ', and ',
            itemTemplate: '{{name}} ({{role}})'
        });
        assert.equal(groupCfgRes.status, 200);

        assert.equal(store.values().squad_group, 'Alex (Host), Jordan, and Morgan (Mod)');
        assert.equal(store.values().squad_group_count, 3);
        assert.equal(store.values().squad_group_name, 'Alex, Jordan, and Morgan');
        assert.equal(store.values().squad_group_role, 'Host, and Mod');

        const membersVar = getVar(store, 'squad_group_members');
        assert.equal(membersVar.hidden, true);
        const members = JSON.parse(store.values().squad_group_members);
        assert.deepEqual(members.map(m => m.id), ['alex', 'jordan', 'morgan']);
        assert.deepEqual(members.map(m => m.image), ['/a.png', '/b.png', '']);

        const toggleRes = await callApi(store, 'GET', '/api/variables/sets/squad/entry/group-toggle?entry=casey&inGroup=1');
        assert.equal(toggleRes.status, 200);
        assert.equal(store.values().squad_group_count, 4);
        assert.equal(store.values().squad_group, 'Alex (Host), Jordan, Casey (Guest), and Morgan (Mod)');

        // Multi-slot joined token skips empty slot 2 cleanly
        store.assignSetSlot('squad', 1, 'alex');
        store.clearSetSlot('squad', 2);
        store.assignSetSlot('squad', 3, 'morgan');
        assert.equal(store.values().squad_joined_name, 'Alex, and Morgan');

        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Linked Variable Sets: ref materialization (1-hop, shorthand, named slot) and targetSet updates', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('weapons', {
            slotsCount: 0,
            fields: [{ key: 'name', type: 'text' }, { key: 'atk', type: 'number' }],
            roster: [{ id: 'sword', values: { name: 'Master Sword', atk: 30 } }]
        });
        store.upsertSet('heroes', {
            slotsCount: 1,
            fields: [
                { key: 'name', type: 'text' },
                { key: 'icon', type: 'image' },
                { key: 'weapon', type: 'ref', targetSet: 'weapons' }
            ],
            roster: [
                { id: 'link', values: { name: 'Link', icon: '/link.png', weapon: 'sword' } },
                { id: 'zelda', values: { name: 'Zelda', icon: '/zelda.png', weapon: '' } }
            ]
        });
        store.upsertSet('match', {
            slotsCount: 2,
            slotNames: ['Player 1', 'Player 2'],
            fields: [
                { key: 'tag', type: 'text' },
                { key: 'fighter', type: 'ref', targetSet: 'heroes' }
            ],
            roster: [
                { id: 'alex', values: { tag: 'ALX', fighter: 'link' } },
                { id: 'sam', values: { tag: 'SAM', fighter: 'zelda' } }
            ]
        });

        store.assignSetSlot('match', 1, 'alex');
        store.assignSetSlot('match', 2, 'sam');

        const vals = store.values();
        // Slot 1 + shorthand + named alias
        assert.equal(vals.match_1_fighter, 'link');
        assert.equal(vals.match_1_fighter_name, 'Link');
        assert.equal(vals.match_1_fighter_icon, '/link.png');
        assert.equal(vals.match_fighter_name, 'Link');
        assert.equal(vals.match_player_1_fighter_name, 'Link');
        // Slot 2 + named alias
        assert.equal(vals.match_2_fighter_name, 'Zelda');
        assert.equal(vals.match_player_2_fighter_name, 'Zelda');
        // 1-hop max: nested ref field 'weapon' on heroes is NOT expanded onto match
        assert.equal(vals.match_1_fighter_weapon_name, undefined);

        // Updating targetSet re-materializes referencing sets
        store.upsertSet('heroes', {
            roster: [
                { id: 'link', values: { name: 'Hero Link', icon: '/link2.png', weapon: 'sword' } },
                { id: 'zelda', values: { name: 'Zelda', icon: '/zelda.png', weapon: '' } }
            ]
        });
        assert.equal(store.values().match_1_fighter_name, 'Hero Link');
        assert.equal(store.values().match_fighter_icon, '/link2.png');

        // Clearing slot resets ref target fields to defaults
        store.clearSetSlot('match', 1);
        assert.equal(store.values().match_1_fighter, '');
        assert.equal(store.values().match_1_fighter_name, '');
        assert.equal(store.values().match_fighter_name, '');

        // 0-slot activeEntry ref materialization
        store.upsertSet('spotlight', {
            slotsCount: 0,
            fields: [{ key: 'hero', type: 'ref', targetSet: 'heroes' }],
            roster: [{ id: 'p1', values: { hero: 'link' } }],
            activeEntry: 'p1'
        });
        assert.equal(store.values().spotlight_hero_name, 'Hero Link');

        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Linked Variable Sets: links follow source selections without changing target live slots', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('chars', {
            slotsCount: 2,
            fields: [{ key: 'name', type: 'text' }],
            roster: [
                { id: 'mario', values: { name: 'Mario' } },
                { id: 'luigi', values: { name: 'Luigi' } }
            ]
        });
        store.upsertSet('players', {
            slotsCount: 1,
            fields: [
                { key: 'name', type: 'text' },
                { key: 'char', type: 'ref', targetSet: 'chars' }
            ],
            roster: [
                { id: 'p1', values: { name: 'Alex', char: 'mario' } },
                { id: 'p2', values: { name: 'Jordan', char: 'luigi' } }
            ]
        });

        store.assignSetSlot('chars', 2, 'luigi');
        store.assignSetSlot('players', 1, 'p1');
        assert.equal(getSet(store, 'chars').slots[1], 'luigi');
        assert.equal(store.values().players_char_name, 'Mario');

        store.cycleSetSlot('players', 1, 1);
        assert.equal(getSet(store, 'chars').slots[1], 'luigi');
        assert.equal(store.values().players_char_name, 'Luigi');

        store.clearSetSlot('players', 1);
        assert.equal(getSet(store, 'chars').slots[1], 'luigi');
        assert.equal(store.values().players_char_name, '');

        // Cyclic link definitions never activate another set.
        store.upsertSet('cycle_a', {
            slotsCount: 1,
            fields: [{ key: 'b', type: 'ref', targetSet: 'cycle_b' }],
            roster: [{ id: 'a1', values: { b: 'b1' } }]
        });
        store.upsertSet('cycle_b', {
            slotsCount: 1,
            fields: [{ key: 'a', type: 'ref', targetSet: 'cycle_a' }],
            roster: [{ id: 'b1', values: { a: 'a1' } }]
        });
        store.assignSetSlot('cycle_a', 1, 'a1');
        assert.equal(getSet(store, 'cycle_a').slots[0], 'a1');
        assert.equal(getSet(store, 'cycle_b').slots[0], '');

        // Self-reference remains bounded to one-hop materialization.
        store.upsertSet('self_ref', {
            slotsCount: 1,
            fields: [{ key: 'next', type: 'ref', targetSet: 'self_ref' }],
            roster: [{ id: 's1', values: { next: 's1' } }]
        });
        store.assignSetSlot('self_ref', 1, 's1');
        assert.equal(getSet(store, 'self_ref').slots[0], 's1');

        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Linked Variable Sets: item levels survive owner edits, validate targets and reset independently', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('equipment', {
            fields: [{ key: 'name', type: 'text' }],
            roster: [
                { id: 'sword', values: { name: 'Sword' }, tiers: [{ label: 'Wood' }, { label: 'Steel' }, { label: 'Legendary', image: '/legendary.png' }] },
                { id: 'badge', values: { name: 'Badge' } }
            ]
        });
        store.upsertSet('people', {
            fields: [{ key: 'name', type: 'text' }, { key: 'gear', type: 'checklist', targetSet: 'equipment', maxTier: 1 }],
            roster: [{ id: 'alex', values: { name: 'Alex' } }, { id: 'sam', values: { name: 'Sam' } }]
        });
        let response = await callApi(store, 'POST', '/api/variables/sets/people/checklist/set', { entry: 'alex', field: 'gear', target: 'sword', value: 3 });
        assert.equal(response.status, 200);
        store.upsertSet('people', { name: 'Renamed' });
        store.upsertSet('people', { roster: getSet(store, 'people').roster });
        store.reload();
        assert.equal(getSet(store, 'people').roster[0].values.gear.sword, 3);
        const owner = getSet(store, 'people');
        const catalog = getSet(store, 'equipment');
        await callApi(store, 'DELETE', '/api/variables/sets/equipment');
        const imported = await callApi(store, 'POST', '/api/variables/import', { sets: [owner, catalog] });
        assert.equal(imported.status, 200);
        assert.equal(getSet(store, 'people').roster[0].values.gear.sword, 3, 'bundle order cannot discard custom levels');
        response = await callApi(store, 'GET', '/api/variables/sets/people/checklist/set?entry=sam&field=gear&target=badge&value=9');
        assert.equal(response.json.roster[1].values.gear.badge, 1);
        response = await callApi(store, 'GET', '/api/variables/sets/people/checklist/set?entry=sam&field=gear&target=missing&value=1');
        assert.equal(response.status, 400);
        response = await callApi(store, 'POST', '/api/variables/sets/people/checklist/reset', { entry: 'alex', field: 'gear' });
        assert.deepEqual(response.json.roster[0].values.gear, {});
        assert.deepEqual(response.json.roster[1].values.gear, { badge: 1 });
        response = await callApi(store, 'GET', '/api/variables/sets/people/checklist/reset?field=gear&all=true');
        assert.deepEqual(response.json.roster.map(entry => entry.values.gear), [{}, {}]);
    } finally { store.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Linked Variable Sets: editors and Operator share link controls and preserve edits before tracker actions', async () => {
    const { createServer } = require('node:http');
    const puppeteer = (await import('puppeteer')).default;
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    store.upsertSet('equipment', {
        fields: [{ key: 'name', label: 'Name', type: 'text' }],
        roster: [
            { id: 'sword', label: 'Sword', values: { name: 'Sword' }, tiers: [{ label: 'Wood' }, { label: 'Steel' }, { label: 'Legendary' }] },
            { id: 'badge', label: 'Badge', values: { name: 'Badge' } }
        ]
    });
    store.upsertSet('people', {
        fields: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'favorite', label: 'Favorite', type: 'ref', targetSet: 'equipment' },
            { key: 'choices', label: 'Choices', type: 'ref_list', targetSet: 'equipment' },
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'color', label: 'Color', type: 'color' },
            { key: 'gear', label: 'Gear', type: 'checklist', targetSet: 'equipment', maxTier: 1 }
        ],
        roster: [{ id: 'alex', label: 'Alex', values: { name: 'Alex', gear: { sword: 2 } } }, { id: 'sam', label: 'Sam', values: { name: 'Sam', gear: { badge: 1 } } }]
    });
    store.setModuleEnabled(true);
    const publicRoot = path.resolve(__dirname, '../public');
    const requests = [];
    const server = createServer(async (req, res) => {
        const pathname = new URL(req.url, 'http://fixture').pathname;
        if (pathname.startsWith('/api/variables')) {
            if (req.method !== 'GET') requests.push(pathname);
            if (req.method === 'PUT' || req.method === 'PATCH') await new Promise(resolve => setTimeout(resolve, 100));
            await store.handleApi(req, res, pathname, async request => {
                const chunks = [];
                for await (const chunk of request) chunks.push(chunk);
                return Buffer.concat(chunks).toString();
            });
        } else if (pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(pathname === '/api/custom-overlays' ? [] : {}));
        } else {
            const mapped = pathname === '/placeholders.html' ? '/tools/placeholders.html' : pathname === '/variable-set-operator.html' ? '/tools/variable-set-operator.html' : pathname === '/overlay-shared.js' ? '/js/overlay-shared.js' : pathname;
            const file = path.resolve(publicRoot, `.${mapped}`);
            res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html' });
            res.end(file.startsWith(`${publicRoot}${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : '');
        }
    });
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.evaluateOnNewDocument(() => { window.WebSocket = class extends window.EventTarget {}; });
        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:') ? request.continue() : request.abort());
        await page.goto(`${origin}/variable-set-operator.html#people`);
        await page.waitForSelector('[data-op-open-matrix="gear"]');
        await page.$eval('[data-op-swatch="alex"]', input => {
            window.originalSwatch = input;
            input.focus();
            input.value = '#ff0000';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForFunction(async () => (await (await fetch('/api/variables/sets/people')).json()).roster[0].values.color === '#ff0000');
        assert.equal(await page.evaluate(() => window.originalSwatch === document.querySelector('[data-op-swatch="alex"]')), true, 'Saving must keep native color pickers mounted');
        assert.equal(await page.$eval('[data-op-type="date"]', input => input.type), 'date');
        await page.select('[data-op-entry="alex"][data-op-type="ref"]', 'sword');
        await page.click('[data-link-control] summary');
        await page.click('[data-link-option] input[value="badge"]');
        await page.waitForFunction(async () => (await (await fetch('/api/variables/sets/people')).json()).roster[0].values.choices.includes('badge'));
        assert.deepEqual(getSet(store, 'people').roster[0].values.choices, ['badge']);
        await page.$eval('[data-op-entry="alex"][data-op-key="name"]', input => {
            input.value = 'Updated Alex'; input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.click('[data-op-open-matrix="gear"][data-op-owner="alex"]');
        await page.click('[data-op-matrix-step][data-op-entry="alex"][data-op-target="sword"]');
        await page.waitForFunction(() => document.querySelector('[data-op-entry="alex"][data-op-target="sword"]')?.textContent.includes('Legendary'));
        assert.equal(getSet(store, 'people').roster[0].values.name, 'Updated Alex');
        assert.equal(getSet(store, 'people').roster[0].values.gear.sword, 3);
        assert.equal(requests.at(-2), '/api/variables/sets/people/entry/set');
        assert.equal(requests.at(-1), '/api/variables/sets/people/checklist/step');
        page.once('dialog', dialog => dialog.accept());
        await page.click('[data-op-reset-entry="alex"]');
        await page.waitForFunction(() => document.querySelector('[data-op-entry="alex"][data-op-target="sword"]')?.textContent.includes('Lv.0'));
        assert.deepEqual(getSet(store, 'people').roster[0].values.gear, {});
        assert.deepEqual(getSet(store, 'people').roster[1].values.gear, { badge: 1 });
        await page.click('[data-op-filter="slotted"]');
        assert.equal(await page.$('[data-op-matrix-step]'), null, 'empty on-air selection must not show every owner');
        await page.click('[data-op-filter="all"]');
        page.once('dialog', dialog => dialog.accept());
        await page.click('[data-op-reset-all]');
        await page.waitForFunction(() => document.querySelector('[data-op-entry="sam"][data-op-target="badge"]')?.classList.contains('is-dim'));
        assert.deepEqual(getSet(store, 'people').roster[1].values.gear, {});
        await page.goto(`${origin}/placeholders.html#sets`);
        await page.waitForSelector('[data-select-set="people"]');
        await page.click('[data-select-set="people"]');
        await page.waitForSelector('[data-set-card="people"]');
        await page.click('[data-set-act="edit-entry"][data-entry="alex"]');
        await page.waitForSelector('#vp-entry-form');
        assert.equal(await page.$eval('[data-entry-field="favorite"]', input => input.value), 'sword');
        await page.click('#vp-entry-form [data-link-control] summary');
        await page.click('#vp-entry-form [data-link-option] input[value="sword"]');
        assert.equal(await page.$eval('#vp-entry-form [data-entry-field="choices"]', input => input.value), '["badge","sword"]', 'Adding to a lineup must append without reordering saved choices');
        await page.click('#vp-entry-form [data-link-selected="sword"] [data-link-move="-1"]');
        await page.$eval('[data-entry-check-item="sword"]', select => {
            select.value = '3'; select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.click('[form="vp-entry-form"][type="submit"]');
        await page.waitForFunction(() => !document.querySelector('#vp-entry-form'));
        assert.deepEqual(getSet(store, 'people').roster[0].values.choices, ['sword', 'badge']);
        assert.deepEqual(getSet(store, 'people').roster[0].values.gear, { sword: 3 });
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        store.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Linked Variable Sets: checklist schema, set/toggle/step endpoints, clamping, wrapping, and persistence', async () => {
    const dir = makeTmpDir();
    const store = createVariablesStore({ dataDir: dir });
    try {
        store.upsertSet('items', {
            slotsCount: 0,
            fields: [{ key: 'name', type: 'text' }],
            roster: [
                { id: 'sword', label: 'Sword', values: { name: 'Sword' } },
                { id: 'shield', label: 'Shield', values: { name: 'Shield' } }
            ]
        });
        store.upsertSet('runners', {
            slotsCount: 1,
            fields: [
                { key: 'name', type: 'text' },
                { key: 'gear', type: 'checklist', targetSet: 'items', maxTier: 3 },
                { key: 'flags', type: 'checklist', targetSet: 'items' } // default maxTier = 1
            ],
            roster: [
                { id: 'alex', values: { name: 'Alex', gear: { sword: 2, invalid_zero: 0, over: 99 } } },
                { id: 'sam', values: { name: 'Sam' } }
            ],
            slots: ['alex']
        });

        const runnerSet = getSet(store, 'runners');
        assert.equal(runnerSet.fields[1].maxTier, 3);
        assert.equal(runnerSet.fields[2].maxTier, 1);
        assert.deepEqual(runnerSet.roster[0].values.gear, { sword: 2, over: 3 });

        // GET toggle (wraps 0 -> 1 -> 2 -> 3 -> 0 when delta omitted) using slot
        let r = await callApi(store, 'GET', '/api/variables/sets/runners/checklist/toggle?slot=1&field=gear&target=shield');
        assert.equal(r.status, 200);
        assert.equal(r.json.roster[0].values.gear.shield, 1);

        r = await callApi(store, 'POST', '/api/variables/sets/runners/checklist/step', { slot: 1, field: 'gear', target: 'shield' });
        assert.equal(r.status, 200);
        assert.equal(r.json.roster[0].values.gear.shield, 2);

        r = await callApi(store, 'GET', '/api/variables/sets/runners/checklist/step?slot=1&field=gear&target=shield');
        assert.equal(r.json.roster[0].values.gear.shield, 3);

        r = await callApi(store, 'GET', '/api/variables/sets/runners/checklist/toggle?slot=1&field=gear&target=shield');
        assert.equal(r.json.roster[0].values.gear.shield, undefined);

        // Step by explicit delta clamps 0..maxTier
        r = await callApi(store, 'POST', '/api/variables/sets/runners/checklist/step', { entry: 'sam', field: 'gear', target: 'sword', delta: 5 });
        assert.equal(r.status, 200);
        assert.equal(r.json.roster[1].values.gear.sword, 3);

        r = await callApi(store, 'POST', '/api/variables/sets/runners/checklist/step', { entry: 'sam', field: 'gear', target: 'sword', delta: -10 });
        assert.equal(r.status, 200);
        assert.equal(r.json.roster[1].values.gear.sword, undefined);

        // Set clamps 0..maxTier and materializes JSON string
        r = await callApi(store, 'GET', '/api/variables/sets/runners/checklist/set?slot=1&field=gear&target=sword&value=10');
        assert.equal(r.status, 200);
        assert.equal(JSON.parse(store.values().runners_1_gear).sword, 3);

        r = await callApi(store, 'POST', '/api/variables/sets/runners/checklist/set', { entry: 'alex', field: 'flags', target: 'Sword', value: 1 });
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(store.values().runners_flags), { sword: 1 });

        // Error cases
        const badField = await callApi(store, 'GET', '/api/variables/sets/runners/checklist/set?slot=1&field=name&target=sword&value=1');
        assert.equal(badField.status, 400);
        const badVal = await callApi(store, 'GET', '/api/variables/sets/runners/checklist/set?slot=1&field=gear&target=sword&value=abc');
        assert.equal(badVal.status, 400);

        // Persists across reload
        store.reload();
        assert.equal(getSet(store, 'runners').roster[0].values.gear.sword, 3);

        store.dispose();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
