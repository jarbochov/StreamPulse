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
