const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const createVariablesStore = require('../server/services/variables');

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

        // Cycle slot 2 next (alex -> maya -> sam)
        await callApi(store, 'POST', '/api/variables/sets/speaker/next?slot=2', {});
        assert.equal(getVar(store, 'speaker_2_name').value, 'Maya Patel');
        await callApi(store, 'POST', '/api/variables/sets/speaker/next?slot=2', {});
        assert.equal(getVar(store, 'speaker_2_name').value, 'Sam Rivera');

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
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('OverlayShared: template variables and {{var.NAME|fallback}} expansion', () => {
    const status = {
        customVars: [
            { name: 'speaker_1_name', type: 'text', value: 'Maya Patel' },
            { name: 'speaker_1_title', type: 'text', value: '' },
            { name: 'speaker_1_line', type: 'template', value: '{{var.speaker_1_name}} — {{var.speaker_1_title|Guest}}' }
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
        OverlayShared.expandVariables('{{var.missing_var|Default Value}}', status, {}),
        'Default Value'
    );
});
