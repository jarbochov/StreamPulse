import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const fixtureDir = fs.mkdtempSync(path.join(root, '.variable-operator-fixture-'));
const store = require('../server/services/variables')({ dataDir: fixtureDir });
const writes = [];
const errors = [];
let failNextWrite = false;
let browser;

store.upsertSet('people', {
    name: 'Fictional people',
    fields: [{ key: 'name', type: 'text' }],
    roster: ['alex', 'sam', 'taylor'].map(id => ({ id, label: id, values: { name: id } }))
});
store.upsertSet('show', {
    name: 'Fictional show',
    fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'score', label: 'Score', type: 'counter' },
        { key: 'visible', label: 'Visible', type: 'toggle' },
        { key: 'lineup', label: 'Lineup', type: 'ref_list', targetSet: 'people' },
        { key: 'color', label: 'Color', type: 'color' }
    ],
    roster: [{ id: 'opening', label: 'Opening', values: { name: 'Opening', score: '0', lineup: ['sam', 'alex'] } }]
});
store.setModuleEnabled(true);
const current = id => store.listSets().find(set => set.id === 'show').roster.find(entry => entry.id === id);
const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://fixture').pathname;
    try {
        if (pathname.startsWith('/api/variables')) {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const rawBody = Buffer.concat(chunks).toString();
            const write = req.method !== 'GET';
            const record = write ? { path: pathname, method: req.method, body: JSON.parse(rawBody || '{}') } : null;
            if (write && failNextWrite) {
                failNextWrite = false;
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Fictional connection failure' }));
            } else {
                await store.handleApi(req, res, pathname, async () => rawBody);
            }
            if (record) writes.push({ ...record, status: res.statusCode });
            return;
        }
        if (pathname.startsWith('/api/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(pathname === '/api/custom-overlays' ? [] : pathname === '/api/status'
                ? { customVars: store.list(), variableSets: store.listSets(), variableSetsEnabled: true } : {}));
            return;
        }
        const mapped = pathname === '/placeholders.html' ? '/tools/placeholders.html'
            : pathname === '/variable-set-operator.html' ? '/tools/variable-set-operator.html'
                : pathname === '/overlay-shared.js' ? '/js/overlay-shared.js' : pathname;
        const file = path.resolve(publicRoot, `.${mapped}`);
        const exists = file.startsWith(`${publicRoot}${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile();
        res.writeHead(exists ? 200 : 404, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript'
            : pathname.endsWith('.css') ? 'text/css' : 'text/html' });
        res.end(exists ? fs.readFileSync(file) : '');
    } catch (error) {
        errors.push(error.message);
        if (!res.headersSent) res.writeHead(500);
        res.end();
    }
});

try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true, userDataDir: path.join(fixtureDir, 'browser'), args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
        window.WebSocket = class {
            constructor() { window.fixtureSocket = this; }
            close() {}
            addEventListener() {}
            removeEventListener() {}
        };
    });
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:')
        ? request.continue() : request.abort());
    const cell = key => `[data-op-entry="opening"][data-op-key="${key}"]`;
    const picker = '[data-link-control]:has([data-op-entry="opening"][data-op-key="lineup"])';
    const waitForLineup = async expected => {
        await page.waitForFunction(async ids => {
            const set = await (await fetch('/api/variables/sets/show')).json();
            return JSON.stringify(set.roster[0].values.lineup) === JSON.stringify(ids);
        }, {}, expected);
        assert.deepEqual(current('opening').values.lineup, expected);
    };
    const waitForSaved = () => page.waitForFunction(() => document.getElementById('op-save-state')?.textContent === 'Saved');
    const edit = (selector, value) => page.$eval(selector, (input, next) => {
        input.focus();
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    const frames = () => page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
    const acceptDialog = () => page.once('dialog', dialog => dialog.accept());

    await page.goto(`${origin}/variable-set-operator.html#show`);
    await page.waitForSelector(cell('lineup'));
    assert.deepEqual(await page.$$eval(`${picker} [data-link-selected]`, rows => rows.map(row => row.dataset.linkSelected)), ['sam', 'alex']);
    await page.click(`${picker} summary`);
    await page.type(`${picker} [data-link-search]`, 'taylor');
    assert.equal(await page.$eval(`${picker} [data-link-option]:has(input[value="alex"])`, row => row.hidden), true);
    await page.click(`${picker} [data-link-option] input[value="taylor"]`);
    await waitForLineup(['sam', 'alex', 'taylor']);
    assert.equal(writes.at(-1).path, '/api/variables/sets/show/entry/set');
    assert.deepEqual(writes.at(-1).body.expected, ['sam', 'alex']);
    await page.focus(`${picker} [data-link-selected="taylor"] [data-link-move="-1"]`);
    await page.keyboard.press('Enter');
    await waitForLineup(['sam', 'taylor', 'alex']);
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-link-selected]')?.dataset.linkSelected), 'taylor');
    await page.keyboard.press('Enter');
    await waitForLineup(['taylor', 'sam', 'alex']);
    await page.keyboard.press('Enter'); // At the first position, focus moves to the usable Down button.
    await waitForLineup(['sam', 'taylor', 'alex']);
    await page.$eval(`${picker} [data-link-search]`, input => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click(`${picker} [data-link-option] input[value="alex"]`);
    await waitForLineup(['sam', 'taylor']);

    await page.click('[data-op-step="opening"][data-op-delta="1"]');
    await page.waitForFunction(async () => (await (await fetch('/api/variables/sets/show')).json()).roster[0].values.score === '1');
    assert.equal(writes.at(-1).path, '/api/variables/sets/show/entry/step');
    await page.click('[data-op-entry="opening"][data-op-flag="enabled"]');
    await page.waitForFunction(async () => (await (await fetch('/api/variables/sets/show')).json()).roster[0].enabled === false);
    assert.equal(writes.at(-1).body.property, 'enabled');
    await waitForSaved();
    await page.waitForNetworkIdle({ idleTime: 100 });

    await page.$eval('[data-op-swatch="opening"]', input => {
        window.originalSwatch = input;
        input.focus();
        input.value = '#ff0000';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        window.fixtureSocket.onmessage({ data: JSON.stringify({ type: 'variables-update' }) });
    });
    await page.waitForFunction(async () => (await (await fetch('/api/variables/sets/show')).json()).roster[0].values.color === '#ff0000');
    await page.evaluate(() => window.fixtureSocket.onmessage({ data: JSON.stringify({ type: 'variables-update' }) }));
    await frames();
    assert.equal(await page.evaluate(() => window.originalSwatch === document.querySelector('[data-op-swatch="opening"]')), true);

    store.mutateEntry('show', 'set', { entry: 'opening', field: 'name', value: 'Remote Opening' });
    await edit(cell('name'), 'Local pending');
    await page.waitForFunction(() => document.getElementById('op-save-state')?.textContent.includes('Unsaved'));
    assert.equal(writes.at(-1).status, 409);
    assert.equal(current('opening').values.name, 'Remote Opening');
    assert.equal(await page.$eval(cell('name'), input => input.value), 'Local pending');
    assert.match(await page.$eval('#op-save-state', badge => badge.title), /Remote Opening/);
    const failedWrites = writes.length;
    await frames();
    assert.equal(writes.length, failedWrites, 'Conflicts must not trigger an automatic unconditional retry');
    store.mutateEntry('show', 'set', { entry: 'opening', field: 'score', value: '99' });
    acceptDialog();
    await page.focus('#op-save-state');
    await page.keyboard.press('Enter');
    await waitForSaved();
    assert.equal(current('opening').values.name, 'Local pending');
    assert.equal(current('opening').values.score, '99');
    assert.equal(writes.at(-1).body.expected, 'Remote Opening');
    await page.waitForFunction(() => document.querySelector('[data-op-entry="opening"][data-op-key="score"]')?.value === '99');

    failNextWrite = true;
    await edit(cell('name'), 'Pending after outage');
    await page.waitForFunction(() => document.getElementById('op-save-state')?.textContent.includes('Unsaved'));
    assert.equal(writes.at(-1).status, 503);
    assert.equal(await page.$eval(cell('name'), input => input.value), 'Pending after outage');
    acceptDialog();
    await page.click('#op-save-state');
    await waitForSaved();
    assert.equal(current('opening').values.name, 'Pending after outage');
    assert.ok(writes.every(write => write.path.includes('/entry/') && write.method === 'PATCH' && !Object.hasOwn(write.body, 'roster')));

    await page.type('#op-search', 'outage');
    await page.click('[data-op-filter="group"]');
    await page.reload();
    await page.waitForSelector(cell('name'));
    assert.equal(await page.$eval('#op-search', input => input.value), 'outage');
    assert.equal(await page.$eval('[data-op-filter="group"]', button => button.classList.contains('active')), true);
    assert.deepEqual(await page.$$eval(`${picker} [data-link-selected]`, rows => rows.map(row => row.dataset.linkSelected)), ['sam', 'taylor']);

    await page.goto(`${origin}/placeholders.html#sets`);
    await page.waitForSelector('[data-select-set="show"]');
    await page.click('[data-select-set="show"]');
    await page.waitForSelector('[data-set-card="show"]');
    await page.click('[data-set-act="add-entry"]');
    await page.waitForSelector('#vp-entry-form');
    await page.type('[data-entry-field="name"]', 'New Segment');
    await edit('[data-entry-field="score"]', '2');
    await page.click('#vp-entry-form [data-link-control] summary');
    await page.click('#vp-entry-form [data-link-option] input[value="taylor"]');
    await page.click('#vp-entry-form [data-link-option] input[value="sam"]');
    await page.click('[form="vp-entry-form"][type="submit"]');
    await page.waitForFunction(() => !document.querySelector('#vp-entry-form'));
    assert.equal(writes.at(-1).path, '/api/variables/sets/show/entry/add');
    assert.deepEqual(current('new_segment').values.lineup, ['taylor', 'sam']);
    await page.click('[data-set-act="edit-entry"][data-entry="new_segment"]');
    await page.waitForSelector('#vp-entry-form');
    await page.$eval('[data-entry-field="score"]', input => { input.value = '7'; });
    await page.click('[form="vp-entry-form"][type="submit"]');
    await page.waitForFunction(() => !document.querySelector('#vp-entry-form'));
    assert.equal(current('new_segment').values.score, '7');
    assert.equal(writes.at(-1).path, '/api/variables/sets/show/entry/update');
    assert.equal(writes.at(-1).body.expected.values.score, '2');
    acceptDialog();
    await page.click('[data-set-act="delete-entry"][data-entry="new_segment"]');
    await page.waitForFunction(async () => !(await (await fetch('/api/variables/sets/show')).json()).roster.some(entry => entry.id === 'new_segment'));
    assert.equal(writes.at(-1).path, '/api/variables/sets/show/entry/remove');
    assert.ok(writes.every(write => write.path.includes('/entry/') && write.method === 'PATCH' && !Object.hasOwn(write.body, 'roster')));
    assert.deepEqual(errors, []);
    console.log('Variable Operator browser regression passed: ordered links, targeted writes, conflicts/retry, mounted colors, preferences, and entry dialogs.');
} catch (error) {
    console.error('Variable Operator fixture diagnostics:', JSON.stringify({ writes, errors, entry: current('opening') }));
    throw error;
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    store.dispose();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
}
