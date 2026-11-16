import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import esbuild from 'esbuild';

const bundle = (await esbuild.build({ entryPoints: ['public/js/overlay/index.js'], bundle: true, format: 'iife', target: 'es2020', write: false })).outputFiles[0].text;
const picker = await readFile('public/js/placeholder-picker.js', 'utf8');
const css = await readFile('public/css/placeholder-picker.css', 'utf8');
const sets = [
    { id: 'people', name: 'People', slotsCount: 2, slots: ['', 'owner'],
        fields: [{ key: 'items', label: 'Items', type: 'ref_list', targetSet: 'catalog' }],
        roster: [{ id: 'owner', label: 'Owner', values: { items: ['entry'] } }] },
    { id: 'catalog', name: 'Catalog', fields: [{ key: 'name', label: 'Name', type: 'text' }],
        roster: [{ id: 'entry', label: 'Fictional', values: { name: 'Fictional' } }] }
];
let variableRequests = 0;
const server = createServer((req, res) => {
    if (req.url === '/css/placeholder-picker.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(css); }
    else if (req.url === '/api/variables') { variableRequests++; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ sets })); }
    else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><textarea id="target">Before after</textarea><input id="native" type="color">'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.resolve(`.test-placeholder-picker-browser-${process.pid}`);
let browser;
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({ headless: true, userDataDir: profile, env: { ...process.env, TMPDIR: profile }, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ content: bundle });
    await page.addScriptTag({ content: picker });
    await page.evaluate(() => {
        window.fixtureStatus = { weather: { enabled: true, extras: { harbor: { ok: true, city: 'Harbor' } } }, customVars: [
            { name: 'schedule_1_count', type: 'number', setId: 'schedule', value: '5' },
            { name: 'logo', type: 'image', group: 'Theme', value: '/fictional-logo.svg' },
            { name: 'accent', type: 'color', group: 'Theme', value: '#123456' },
            { name: 'size', type: 'number', group: 'Theme', value: 42 },
            { name: 'image_named_text', type: 'text', value: '/not-an-image-variable.png' },
            { name: 'hidden_logo', type: 'image', hidden: true, value: '/hidden.svg' }
        ], variableSets: [
            { id: 'schedule', name: 'Schedule', slotsCount: 2, slots: ['a', ''], slotNames: ['Live event', 'Next'],
                fields: [{ key: 'player', label: 'Player 1', type: 'ref', targetSet: 'people' }, { key: 'items', label: 'Items', type: 'ref_list', targetSet: 'people' }, { key: 'count', label: 'Count', type: 'number' }],
                roster: [{ id: 'a', label: 'Show', values: { player: 'p', items: ['p'], count: '5' } }] },
            { id: 'people', name: 'People', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'color', label: 'Color', type: 'color' }, { key: 'score', label: 'Score', type: 'number' }, { key: 'avatar', label: 'Avatar', type: 'image' }],
                roster: [{ id: 'p', label: 'Alice', values: { name: 'Alice', color: '#123456', score: '42', avatar: '/fictional-avatar.svg' } }] }
        ] };
        const field = document.querySelector('#target');
        field.focus(); field.setSelectionRange(7, 7);
        window.PlaceholderPicker.open({ getStatus: () => window.fixtureStatus, onPick: token => window.PlaceholderPicker.insertInto(field, token) });
    });
    await page.type('#sp-search', 'Alice');
    let button = await page.$('#sp-list [data-token="var.schedule_1_player.field.name"]');
    assert.ok(button, `search finds linked current names: ${await page.$eval('#sp-list', el => el.textContent)}`);
    await page.$eval('#sp-search', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#sp-search', 'Schedule Player 1 Name');
    button = await page.$('#sp-list [data-token="var.schedule_1_player.field.name"]');
    assert.ok(button, 'search matches terms across breadcrumb parts');
    assert.equal(await page.$eval('#target', el => el.selectionStart), 7, 'selection survives opening picker');
    assert.match(await button.evaluate(el => el.textContent), /Schedule → Slot 1 \/ Live event → Player 1 → Name/);
    await button.click();
    assert.equal(await page.$eval('#target', el => el.value), 'Before {{var.schedule_1_player.field.name}}after');
    assert.equal(await page.$eval('#target', el => el.selectionStart), 'Before {{var.schedule_1_player.field.name}}'.length);
    await page.evaluate(() => {
        window.nativeBefore = document.querySelector('#native');
        window.PlaceholderPicker.open({ filter: 'color', getStatus: () => window.fixtureStatus, onPick() {} });
    });
    assert.ok(await page.$('#sp-list [data-token="var.schedule_1_player.field.color"]'));
    assert.ok(await page.$('#sp-list [data-token="var.theme.accent"]'));
    assert.equal(await page.$('#sp-list [data-token="var.accent"]'), null);
    assert.equal(await page.$eval('#sp-list [data-token="var.schedule_2_player.field.color"] .preview', el => el.textContent.trim()), 'Unassigned');
    assert.equal(await page.evaluate(() => window.nativeBefore === document.querySelector('#native')), true);
    await page.click('#sp-close');
    await page.evaluate(() => window.PlaceholderPicker.open({ filter: 'image', getStatus: () => window.fixtureStatus, onPick() {} }));
    for (const token of ['game.cover', 'music.cover', 'tier_list.item_image', 'weather.icon.url', 'weather.h1.icon.url', 'weather.harbor.d1.icon.url', 'var.theme.logo', 'var.schedule_1_player.field.avatar']) {
        assert.ok(await page.$(`#sp-list [data-token="${token}"]`), `image picker offers ${token}`);
    }
    for (const token of ['stream.title', 'now', 'weather.icon', 'var.image_named_text', 'var.hidden_logo', 'var.schedule_1_count', 'var.schedule_1_player.field.name', 'var.schedule_1_player.field.color', 'var.schedule_1_items.field.avatar']) {
        assert.equal(await page.$(`#sp-list [data-token="${token}"]`), null, `image picker excludes ${token}`);
    }
    assert.equal(await page.$eval('#sp-format', field => getComputedStyle(field.parentElement).display), 'none', 'image sources do not offer date/list formatting');
    assert.equal(await page.$eval('#sp-list [data-token="var.schedule_2_player.field.avatar"] .preview', node => node.textContent.trim()), 'Unassigned', 'empty linked image fields remain discoverable');
    await page.type('#sp-search', 'Schedule Player 1 Avatar');
    assert.ok(await page.$('#sp-list [data-token="var.schedule_1_player.field.avatar"]'), 'image search retains linked breadcrumbs');
    await page.click('#sp-close');
    await page.evaluate(() => window.PlaceholderPicker.open({ getStatus: () => window.fixtureStatus, onPick() {} }));
    assert.ok(await page.$('#sp-list [data-token="stream.title"]'), 'opening the text picker restores non-image placeholders');
    assert.notEqual(await page.$eval('#sp-format', field => getComputedStyle(field.parentElement).display), 'none');
    await page.click('#sp-close');
    await page.evaluate(() => window.PlaceholderPicker.open({ filter: 'number', getStatus: () => window.fixtureStatus, onPick() {} }));
    assert.ok(await page.$('#sp-list [data-token="var.schedule_1_count"]'));
    assert.ok(await page.$('#sp-list [data-token="var.theme.size"]'));
    assert.equal(await page.$('#sp-list [data-token="var.size"]'), null, 'number bindings do not offer old flat grouped paths');
    assert.equal(await page.$('#sp-list [data-token="var.schedule_1_player.field.score"]'), null, 'unsupported numeric bindings are not offered');
    assert.equal(await page.$('#sp-list [data-token="var.schedule_1_player.field.color"]'), null);
    await page.click('#sp-close');
    const raw = [{ name: 'people_2_items', setId: 'people', type: 'text', value: '["entry"]' }];
    const loaded = await page.evaluate(async customVars => {
        const status = { customVars, modules: { variableSets: true } };
        const before = window.OverlayShared.expandVariables('{{var.people_2_items}}', status);
        const elements = [{ type: 'text', content: '{{var.people_2_items}}' }];
        await window.OverlayShared.loadLiveExtras(status, elements);
        const after = window.OverlayShared.expandVariables('{{var.people_2_items}}', status);
        await window.OverlayShared.loadLiveExtras(status, elements);
        await window.OverlayShared.loadLiveExtras({ customVars, modules: { variableSets: false } }, elements);
        return { before, after };
    }, raw);
    assert.deepEqual(loaded, { before: '', after: 'Fictional' });
    assert.equal(variableRequests, 1, 'linked status is fetched once and not when disabled');
    await page.evaluate(customVars => {
        window.lazyStatus = { customVars, modules: { variableSets: true } };
        window.PlaceholderPicker.open({ getStatus: () => window.lazyStatus, onPick() {} });
    }, raw);
    await page.waitForSelector('#sp-list [data-token="var.people_2_items"]');
    assert.equal(variableRequests, 2, 'picker loads sets on demand');
    console.log('Placeholder picker browser checks passed');
} finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
}
