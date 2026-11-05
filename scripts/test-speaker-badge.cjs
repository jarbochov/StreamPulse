'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
    CUSTOM_OVERLAY_ELEMENT_TYPES,
    normalizeCustomOverlay
} = require('../server/services/overlays');
const { createObsService } = require('../server/services/obs');
const { createObsRoutes } = require('../server/routes/obs');

class FixtureWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
        super();
        this.url = url;
        this.readyState = FixtureWebSocket.CONNECTING;
        this.sent = [];
        FixtureWebSocket.instances.push(this);
    }

    send(raw) {
        this.sent.push(JSON.parse(String(raw)));
    }

    close() {
        this.readyState = FixtureWebSocket.CLOSED;
        this.emit('close', 1000, 'Normal');
    }
}

test('Speaker-only overlays expose controller links without enabling pages', async () => {
    const { createOverlayRoutes } = require('../server/routes/overlays');
    const overlays = Object.fromEntries(['speaker-badge', 'text', 'video'].map(type => [
        type, normalizeCustomOverlay({ id: type, elements: [{ type }] })
    ]));
    const route = createOverlayRoutes({ getCustomOverlays: () => overlays });
    let response;
    const res = { writeHead() {}, end(body) { response = JSON.parse(body); } };
    const url = new URL('http://localhost/api/custom-overlays');
    assert.equal(await route({ method: 'GET' }, res, url, url.pathname), true);
    const speaker = response.find(overlay => overlay.id === 'speaker-badge');
    assert.equal(speaker.pageCount, 0);
    assert.equal(speaker.hasControls, true, 'speaker badges support quick profile/audio controls without pages');
    assert.equal(response.find(overlay => overlay.id === 'text').hasControls, false, 'static overlays do not gain an empty controller');
    assert.equal(response.find(overlay => overlay.id === 'video').hasControls, true, 'existing media controls remain discoverable');
});

test('Speaker Badge element normalization and schema bounds', () => {
    assert.ok(CUSTOM_OVERLAY_ELEMENT_TYPES.has('speaker-badge'), 'CUSTOM_OVERLAY_ELEMENT_TYPES must include speaker-badge');

    const overlay = normalizeCustomOverlay({
        id: 'test-speaker-overlay',
        name: 'Speaker Test Overlay',
        elements: [
            {
                type: 'speaker-badge',
                name: 'Host Badge',
                speakerBadge: {
                    speaker: {
                        name: 'Jane Doe',
                        handle: '@janedoe',
                        pronouns: 'she/her',
                        avatarShape: 'squircle',
                        callIn: {
                            enabled: true,
                            statusText: 'CALLING IN',
                            location: 'Washington, D.C.',
                            statusColor: '#38bdf8'
                        }
                    },
                    audio: {
                        inputName: 'Mic/Aux',
                        thresholdDb: -32,
                        holdMs: 350
                    },
                    reaction: {
                        visualizer: 'bars',
                        barCount: 7,
                        activeColor: '#38bdf8',
                        glowSpread: 18,
                        motionPop: true,
                        dimWhenIdle: true,
                        idleOpacity: 0.65
                    },
                    layout: 'cspan-banner'
                }
            }
        ]
    });

    assert.equal(overlay.elements.length, 1);
    const el = overlay.elements[0];
    assert.equal(el.type, 'speaker-badge');
    assert.equal(el.name, 'Host Badge');
    assert.ok(el.speakerBadge, 'element must contain normalized speakerBadge configuration');

    // Profile & C-SPAN call-in fields
    assert.equal(el.speakerBadge.speaker.name, 'Jane Doe');
    assert.equal(el.speakerBadge.speaker.handle, '@janedoe');
    assert.equal(el.speakerBadge.speaker.pronouns, 'she/her');
    assert.equal(el.speakerBadge.speaker.avatarShape, 'squircle');
    assert.equal(el.speakerBadge.speaker.callIn.enabled, true);
    assert.equal(el.speakerBadge.speaker.callIn.statusText, 'CALLING IN');
    assert.equal(el.speakerBadge.speaker.callIn.location, 'Washington, D.C.');
    assert.equal(el.speakerBadge.speaker.callIn.statusColor, '#38bdf8');

    // Audio gate
    assert.equal(el.speakerBadge.audio.inputName, 'Mic/Aux');
    assert.equal(el.speakerBadge.audio.thresholdDb, -32);
    assert.equal(el.speakerBadge.audio.holdMs, 350);

    // Reactions
    assert.equal(el.speakerBadge.reaction.visualizer, 'bars');
    assert.equal(el.speakerBadge.reaction.barCount, 7);
    assert.equal(el.speakerBadge.reaction.activeColor, '#38bdf8');
    assert.equal(el.speakerBadge.reaction.glowSpread, 18);
    assert.equal(el.speakerBadge.reaction.motionPop, true);
    assert.equal(el.speakerBadge.reaction.dimWhenIdle, true);
    assert.equal(el.speakerBadge.reaction.idleOpacity, 0.65);
    assert.equal(el.speakerBadge.layout, 'cspan-banner');
});

test('Speaker Badge fallback defaults for empty configuration', () => {
    const overlay = normalizeCustomOverlay({
        id: 'test-default-badge',
        elements: [
            {
                type: 'speaker-badge'
            }
        ]
    });

    const el = overlay.elements[0];
    assert.equal(el.type, 'speaker-badge');
    assert.equal(el.speakerBadge.speaker.name, 'Alex Rivera');
    assert.equal(el.speakerBadge.speaker.avatarShape, 'circle');
    assert.equal(el.speakerBadge.speaker.callIn.enabled, false);
    assert.equal(el.speakerBadge.speaker.callIn.statusText, 'ON THE LINE');
    assert.equal(el.speakerBadge.audio.inputName, 'Mic/Aux');
    assert.equal(el.speakerBadge.audio.thresholdDb, -36);
    assert.equal(el.speakerBadge.audio.holdMs, 280);
    assert.equal(el.speakerBadge.reaction.visualizer, 'bars');
    assert.equal(el.speakerBadge.reaction.barCount, 5);
    assert.equal(el.speakerBadge.layout, 'horizontal');
});

test('Speaker sizing and typography preserve valid values and bound invalid input', () => {
    const badges = normalizeCustomOverlay({ id: 'speaker-scaling', elements: [
        { type: 'speaker-badge', speakerBadge: { autoSize: false, paddingX: 18, paddingY: 20,
            typography: { subtitleFontFamily: 'monospace', pillFontFamily: ' Georgia, serif ' },
            speaker: { avatarScale: 1.5, iconScale: 1.4 } } },
        { type: 'speaker-badge', speakerBadge: { speaker: { avatarScale: -10, iconScale: 900 } } },
        { type: 'speaker-badge', speakerBadge: { speaker: { avatarScale: 'invalid', iconScale: null } } }
    ] }).elements.map(element => element.speakerBadge);
    const speakers = badges.map(badge => badge.speaker);
    assert.deepEqual(speakers.map(speaker => [speaker.avatarScale, speaker.iconScale]), [[1.5, 1.4], [0.5, 1.8], [1, 1]]);
    assert.equal(badges[0].autoSize, false);
    assert.deepEqual([badges[0].paddingX, badges[0].paddingY], [18, 20]);
    assert.deepEqual(badges[0].typography, { subtitleFontFamily: 'monospace', pillFontFamily: 'Georgia, serif' });
});

test('Speaker badge normalization preserves a zero gate, border and glow', () => {
        const overlay = normalizeCustomOverlay({ id: 'speaker-zero', elements: [{ type: 'speaker-badge',
            speakerBadge: { audio: { thresholdDb: 0 }, reaction: { borderWidth: 0, glowSpread: 0 } } }] });
        const badge = overlay.elements[0].speakerBadge;
        assert.equal(badge.audio.thresholdDb, 0);
        assert.equal(badge.reaction.borderWidth, 0);
        assert.equal(badge.reaction.glowSpread, 0);
    });

    test('Speaker audio release uses current profile, stops on missing meters, and resets when changing source', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const vm = require('node:vm');
        const source = fs.readFileSync(path.join(__dirname, '../public/js/overlay-runtime.js'), 'utf8');
        const start = source.indexOf('    function speakerState(');
        const end = source.indexOf('\n    const elementNodes =', start);
        const meterStart = source.indexOf('    function handleObsAudioMeter(');
        const meterEnd = source.indexOf('\n    function connect()', meterStart);
        const callbacks = new Map();
        const renders = [];
        let seq = 0;
        const element = { id: 'speaker', type: 'speaker-badge', speakerBadge: { speaker: { name: 'Original' }, audio: { inputName: 'Mic/Aux', thresholdDb: -36, holdMs: 280 } } };
        const context = vm.createContext({
            speakerStates: new Map(), currentOverlay: { elements: [element] }, elementNodes: new Map([['speaker', {}]]),
            params: new URLSearchParams(), shared: { renderSpeakerBadge: (node, element, options) => renders.push({ name: element.speakerBadge.speaker.name, ...options }) },
            setTimeout: callback => { callbacks.set(++seq, callback); return seq; },
            clearTimeout: id => callbacks.delete(id)
        });
        vm.runInContext(source.slice(start, end) + source.slice(meterStart, meterEnd), context);
        const meter = { input: 'Mic/Aux', db: -20, rms: 0.1 };
        context.handleObsAudioMeter(meter);
        assert.equal(renders.at(-1).speaking, true);
        assert.equal(callbacks.size, 1, 'silence/disconnect releases even when no further meters arrive');
        element.speakerBadge.speaker.name = 'Edited live';
        [...callbacks.values()][0]();
        assert.equal(renders.at(-1).name, 'Edited live');
        assert.equal(renders.at(-1).speaking, false);
        callbacks.clear();
        context.handleObsAudioMeter(meter);
        element.speakerBadge.audio.inputName = 'Guest';
        assert.equal(context.speakerState(element).speaking, false);
        assert.equal(callbacks.size, 0, 'old source release timer is cancelled');
    });

    test('Speaker editor OBS setup hint targets the global OBS connection settings', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const vm = require('node:vm');
        const source = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
        const start = source.indexOf('export function updateObsAudioStatus(');
        const end = source.indexOf('\nexport function speakerBadgeSection', start);
        const nodes = { 'sb-obs-status-pill': { style: {} }, 'sb-obs-status-hint': {} };
        const context = vm.createContext({ document: { getElementById: id => nodes[id] } });
        vm.runInContext(source.slice(start, end).replace('export ', ''), context);
        context.updateObsAudioStatus({ connected: false });
        assert.match(nodes['sb-obs-status-hint'].innerHTML, /href="\/config-editor.html#connection"/);
        assert.ok(fs.existsSync(path.join(__dirname, '../public/system/config-editor.html')));
    });

    test('Overlay Control speaker edits persist only badge data, preserve other edits, and keep drafts during page changes', async t => {
        const fs = require('node:fs');
        const os = require('node:os');
        const path = require('node:path');
        const http = require('node:http');
        const { createOverlayRoutes } = require('../server/routes/overlays');
        const { createStaticRouter } = require('../server/static-router');
        const { WebSocketServer } = require('ws');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-speaker-control-'));
        t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
        const initial = normalizeCustomOverlay({
            id: 'fictional-speakers', name: 'Fictional Panel', revision: 1,
            elements: [{ id: 'host', type: 'speaker-badge', name: 'Host', speakerBadge: { layout: 'compact-pill',
                speaker: { name: 'Fictional Host' }, audio: { inputName: 'Mic/Aux', thresholdDb: -27 }, reaction: { glowSpread: 30 } } },
            { id: 'guest', type: 'speaker-badge', name: 'Guest', speakerBadge: { speaker: { name: 'Fictional Guest' } } },
            { id: 'heading', type: 'text', content: 'Original heading' }]
        });
        const overlays = { [initial.id]: initial }, events = [], configSaves = [];
        let audioConnected = true;
        let sceneSyncConnected = false;
        const fixtureConfig = { obs: { enabled: true, host: '127.0.0.2', port: 4456, hasPassword: true, motionEngine: 'cut', syncOnSave: false },
            obs_scene_sync_enabled: false,
            speaker_badges_enabled: false };
        const file = path.join(dir, 'overlays.json');
        const route = createOverlayRoutes({
            getCustomOverlays: () => overlays, normalizeCustomOverlay, customOverlayHistoryDir: path.join(dir, 'history'),
            saveCustomOverlays: () => fs.writeFileSync(file, JSON.stringify(overlays)),
            pageSnapshot: () => ({ id: initial.id, enabled: false }),
            broadcastToOverlays: (type, data) => {
                events.push({ type, data });
                for (const client of sockets.clients) client.send(JSON.stringify({ type, data }));
            }
        });
        const staticRouter = createStaticRouter({ rootDir: path.resolve(__dirname, '..') });
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname === '/api/obs/audio-inputs') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ connected: audioConnected, inputs: ['Mic/Aux', 'Guest Audio'] })); return;
            }
            if (url.pathname === '/api/config') {
                if (req.method === 'PUT') {
                    const chunks = [];
                    for await (const chunk of req) chunks.push(chunk);
                    configSaves.push(JSON.parse(Buffer.concat(chunks).toString()));
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(req.method === 'PUT' ? { status: 'saved' } : fixtureConfig)); return;
            }
            if (url.pathname === '/api/status' || url.pathname === '/api/obs/status') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(url.pathname === '/api/status'
                    ? { modules: { speakerBadges: true, obsSceneSync: false } }
                    : { enabled: true, connected: true, sceneSyncEnabled: sceneSyncConnected, speakerBadgesEnabled: true, sources: [] })); return;
            }
            if (url.pathname === '/api/custom-overlays/assets') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([
                    { kind: 'image', label: 'Fictional host avatar', url: '/favicon.svg' },
                    { kind: 'video', label: 'Fictional video', url: '/video.mp4' }
                ])); return;
            }
            if (await route(req, res, url, url.pathname)) return;
            staticRouter.handleRequest(req, res);
        });
        const sockets = new WebSocketServer({ server });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        t.after(() => { for (const socket of sockets.clients) socket.terminate(); sockets.close(); return new Promise(resolve => server.close(resolve)); });
        const base = `http://127.0.0.1:${server.address().port}`, endpoint = `${base}/api/custom-overlays/${initial.id}/speakers`;
        const { default: puppeteer } = await import('puppeteer');
        const browser = await puppeteer.launch({ headless: true });
        t.after(() => browser.close());
        const page = await browser.newPage(), errors = [];
        await page.setViewport({ width: 1600, height: 1000 });
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        for (const list of ['custom-overlays.html', 'overlays.html']) {
            await page.goto(`${base}/${list}`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector(`a[href="/overlay-control.html?id=${initial.id}"]`);
        }
        await page.goto(`${base}/overlay-control.html?id=${initial.id}`, { waitUntil: 'networkidle0' });
        await page.click('#tab-speakers');
        await page.waitForSelector('[data-speaker-form="host"] input');
        await page.$eval('[data-speaker-form="host"] [name="name"]', input => { input.value = 'Edited Host'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.$eval('[data-speaker-form="host"] [name="inputName"]', input => { input.value = 'Guest Audio'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('[data-speaker-form="host"] [data-speaker-avatar]');
        await page.waitForSelector('.mp-grid [role="option"]');
        assert.equal(await page.$$eval('.mp-grid [role="option"]', tiles => tiles.length), 1, 'avatars only offer image assets');
        await page.type('.mp-head input[type="search"]', 'missing');
        await page.waitForSelector('.mp-empty');
        await page.$eval('.mp-head input[type="search"]', input => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.waitForSelector('.mp-grid [role="option"]');
        await page.evaluate(async () => { await window.loadSpeakers(); });
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="name"]', input => input.value), 'Edited Host');
        await page.click('.mp-grid [role="option"]');
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="avatarSrc"]', input => input.value), '/favicon.svg');
        assert.equal(await page.$eval('[data-speaker-form="guest"] [name="avatarSrc"]', input => input.value), '');
        assert.equal(overlays[initial.id].elements[0].speakerBadge.speaker.avatarSrc, '', 'selection stays a draft until saved');
        await page.click('[data-speaker-form="host"] [data-speaker-avatar]');
        await page.waitForSelector('.mp-grid [role="option"]');
        await page.click('.mp-dialog [data-close]');
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="avatarSrc"]', input => input.value), '/favicon.svg', 'cancel preserves the selected avatar');
        for (const client of sockets.clients) client.send(JSON.stringify({ type: 'custom-overlay-page', data: { id: initial.id, enabled: false } }));
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="name"]', input => input.value), 'Edited Host');
        assert.equal(await page.$eval('#speaker-audio-inputs', list => list.children.length), 2);
        overlays[initial.id].elements.find(element => element.id === 'heading').content = 'Concurrent heading edit';
        const [saved] = await Promise.all([
            page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'PATCH'),
            page.click('[data-speaker-form="host"] button[type="submit"]')
        ]);
        assert.equal(saved.status(), 200);
        const stored = JSON.parse(fs.readFileSync(file, 'utf8'))[initial.id];
        const badge = stored.elements.find(element => element.id === 'host').speakerBadge;
        assert.equal(badge.speaker.name, 'Edited Host');
        assert.equal(badge.speaker.avatarSrc, '/favicon.svg');
        assert.equal(badge.audio.inputName, 'Guest Audio');
        assert.equal(badge.audio.thresholdDb, -27);
        assert.equal(badge.reaction.glowSpread, 30);
        assert.equal(badge.layout, 'compact-pill');
        assert.equal(stored.elements.find(element => element.id === 'heading').content, 'Concurrent heading edit');
        assert.equal(stored.elements.find(element => element.id === 'guest').speakerBadge.speaker.name, 'Fictional Guest');
        assert.ok(events.some(event => event.type === 'custom-overlay-update'));
        const bad = await fetch(endpoint, { method: 'PATCH', body: JSON.stringify({ element: 'heading', speaker: { name: 'Wrong' } }) });
        assert.equal(bad.status, 404);
        const invalid = await fetch(endpoint, { method: 'PATCH', body: JSON.stringify({ element: 'host', audio: { inputName: 42 } }) });
        assert.equal(invalid.status, 400);
        await page.reload({ waitUntil: 'networkidle0' });
        assert.equal(await page.$eval('#tab-speakers', tab => tab.getAttribute('aria-selected')), 'true');
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="name"]', input => input.value), 'Edited Host');
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="avatarSrc"]', input => input.value), '/favicon.svg');
        await page.click('[data-speaker-form="host"] [data-speaker-avatar]');
        await page.click('.mp-dialog [data-clear]');
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="avatarSrc"]', input => input.value), '');
        await page.goto(`${base}/custom-overlay-editor.html?id=${initial.id}`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => window.editorState?.nodes?.has('host'));
        assert.equal(await page.$eval('#btn-obs-modal', button => button.hidden), true);
        assert.equal(await page.$eval('[data-add="obs-frame"]', button => button.hidden), true);
        await page.evaluate(async () => {
            const { setSelection } = await import('/js/editor/editor-state.js');
            setSelection(['host']);
        });
        await page.waitForSelector('#sb-audio-level');
        const sendMeter = (db, input = 'Guest Audio') => {
            for (const client of sockets.clients) client.send(JSON.stringify({ type: 'obs-audio-meter', data: { input, db, rms: 0.1 } }));
        };
        sendMeter(-48);
        await page.waitForFunction(() => document.querySelector('#sb-audio-level').textContent.includes('Input: -48 dB'));
        const firstReadout = await page.$eval('#sb-audio-level', hint => hint.textContent);
        assert.equal(await page.evaluate(() => window.editorState.nodes.get('host').querySelector('.sp-sb-card').classList.contains('is-speaking')), false);
        sendMeter(-15);
        await page.waitForFunction(() => window.editorState.nodes.get('host').querySelector('.sp-sb-card').classList.contains('is-speaking'));
        assert.equal(await page.$eval('#sb-audio-level', hint => hint.textContent), firstReadout, 'readout is rate-limited while detection is immediate');
        sendMeter(-60);
        assert.equal(await page.evaluate(() => window.editorState.nodes.get('host').querySelector('.sp-sb-card').classList.contains('is-speaking')), true, 'release holds across quiet speech pauses');
        await page.waitForFunction(() => !window.editorState.nodes.get('host').querySelector('.sp-sb-card').classList.contains('is-speaking'));
        sendMeter(-10);
        await page.waitForFunction(() => window.editorState.nodes.get('host').querySelector('.sp-sb-card').classList.contains('is-speaking'));
        await page.evaluate(async () => {
            window.editorState.overlay.elements.find(element => element.id === 'host').speakerBadge.audio.inputName = 'Different source';
            const { renderCanvas } = await import('/js/editor/editor-canvas.js');
            renderCanvas();
        });
        assert.equal(await page.evaluate(() => window.editorState.nodes.get('host').querySelector('.sp-sb-card').classList.contains('is-speaking')), false);
        sceneSyncConnected = true;
        for (const client of sockets.clients) client.send(JSON.stringify({ type: 'obs-status', data: { enabled: true, connected: true, sceneSyncEnabled: true } }));
        await page.waitForFunction(() => !document.querySelector('#btn-obs-modal').hidden);
        sceneSyncConnected = false;
        for (const client of sockets.clients) client.send(JSON.stringify({ type: 'obs-status', data: { enabled: true, connected: true, sceneSyncEnabled: false } }));
        await page.waitForFunction(() => document.querySelector('#btn-obs-modal').hidden);
        await page.$eval('[data-path="speakerBadge.speaker.avatarSrc"]', input => {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForFunction(() => !window.editorState.overlay.elements.find(element => element.id === 'host').speakerBadge.speaker.avatarSrc);
        await page.click('[data-inspector-tab="style"]');
        assert.equal(await page.$('[data-path="style.fontSize"]'), null, 'auto-size overrides the manual size field');
        await page.click('[data-path="speakerBadge.autoSize"]');
        await page.waitForSelector('[data-path="style.fontSize"]');
        await page.select('[data-path="speakerBadge.typography.subtitleFontFamily"]', 'monospace');
        await page.select('[data-path="speakerBadge.typography.pillFontFamily"]', 'Georgia, serif');
        await page.select('[data-path="speakerBadge.reaction.visualizer"]', 'pulse-ring');
        await page.waitForFunction(() => !document.querySelector('[data-path="speakerBadge.reaction.barCount"]'));
        await page.select('[data-path="speakerBadge.reaction.visualizer"]', 'bars');
        await page.waitForSelector('[data-path="speakerBadge.reaction.barCount"]');
        await page.click('[data-path="speakerBadge.reaction.highlightBorder"]');
        await page.waitForFunction(() => !document.querySelector('[data-path="speakerBadge.reaction.glowSpread"]'));
        await page.click('[data-path="speakerBadge.reaction.highlightBorder"]');
        await page.waitForSelector('[data-path="speakerBadge.reaction.glowSpread"][type="range"]');
        const glowLabelGap = await page.$eval('[data-path="speakerBadge.reaction.glowSpread"][type="range"]', input => {
            const field = input.closest('.field');
            return input.parentElement.getBoundingClientRect().top - field.firstElementChild.getBoundingClientRect().bottom;
        });
        assert.ok(glowLabelGap <= 8, 'glow slider stays directly beside its label, not stretched alongside the color picker');
        assert.equal(await page.$('[data-path="speakerBadge.reaction.idleOpacity"].range-num'), null, 'idle opacity is hidden until dimming is enabled');
        await page.click('[data-path="speakerBadge.reaction.dimWhenIdle"]');
        await page.waitForSelector('[data-path="speakerBadge.reaction.idleOpacity"].range-num');
        assert.equal(await page.$eval('[data-path="speakerBadge.reaction.idleOpacity"].range-num', input => input.value), '70', 'idle opacity is shown as a percentage, not scaled twice');
        await page.evaluate(async () => {
            const element = window.editorState.overlay.elements.find(item => item.id === 'host');
            element.x = 80;
            element.y = 80;
            element.height = 160;
            Object.assign(window.editorState, { zoom: 1, pan: { x: 100, y: 120 }, autoFit: false });
            const { renderCanvas, applyView } = await import('/js/editor/editor-canvas.js');
            applyView();
            renderCanvas();
        });
        for (const field of ['avatarScale', 'iconScale']) {
            await page.$eval(`[data-path="speakerBadge.speaker.${field}"].range-num`, input => {
                input.value = '150';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        await page.waitForFunction(() => {
            const speaker = window.editorState.overlay.elements.find(element => element.id === 'host').speakerBadge.speaker;
            return speaker.avatarScale === 1.5 && speaker.iconScale === 1.5;
        });
        const avatarSizes = await page.evaluate(() => {
            const node = window.editorState.nodes.get('host');
            return { avatar: node.querySelector('.sp-sb-avatar-wrap').getBoundingClientRect().width,
                icon: node.querySelector('.sp-sb-avatar-placeholder svg').getBoundingClientRect().width };
        });
        assert.ok(Math.abs(avatarSizes.avatar - 48) < 1, 'avatar slider resizes the whole compact avatar');
        assert.ok(Math.abs(avatarSizes.icon - 39.6) < 1, 'icon slider independently resizes the fallback drawing');
        await page.click('#save');
        await page.waitForFunction(() => !window.editorState.saving && !window.editorState.dirty);
        assert.equal(overlays[initial.id].elements.find(element => element.id === 'host').speakerBadge.speaker.avatarScale, 1.5);
        assert.equal(overlays[initial.id].elements.find(element => element.id === 'host').speakerBadge.speaker.iconScale, 1.5);
        assert.deepEqual(overlays[initial.id].elements.find(element => element.id === 'host').speakerBadge.typography,
            { subtitleFontFamily: 'monospace', pillFontFamily: 'Georgia, serif' });
        const nameBounds = () => page.evaluate(() => {
            const name = window.editorState.nodes.get('host').querySelector('.sp-sb-name').getBoundingClientRect();
            return { x: name.x, y: name.y };
        });
        const horizontal = [];
        for (const align of ['left', 'center', 'right']) {
            await page.click(`[data-seg-path="style.textAlign"] [data-seg-value="${align}"]`);
            horizontal.push((await nameBounds()).x);
        }
        assert.ok(horizontal[0] < horizontal[1] && horizontal[1] < horizontal[2], 'real typography controls reposition the name group');
        await page.click('[data-seg-path="style.verticalAlign"] [data-seg-value="top"]');
        const top = (await nameBounds()).y;
        await page.click('[data-seg-path="style.verticalAlign"] [data-seg-value="bottom"]');
        assert.ok((await nameBounds()).y > top + 10, 'vertical justification visibly repositions content');
        await page.evaluate(async () => {
            const element = window.editorState.overlay.elements.find(item => item.id === 'host');
            element._simulateSpeaking = true;
            element.speakerBadge.reaction.highlightBorder = false;
            Object.assign(element.style, { background: '#ff0000', borderWidth: 0, shadow: { blur: 0 }, gradient: { enabled: false } });
            const { setSelection } = await import('/js/editor/editor-state.js');
            setSelection([]);
            const { renderCanvas } = await import('/js/editor/editor-canvas.js');
            renderCanvas();
            await new Promise(resolve => setTimeout(resolve, 250));
        });
        const box = await page.evaluate(() => {
            const node = window.editorState.nodes.get('host'), bounds = node.getBoundingClientRect();
            const card = node.querySelector('.sp-sb-card'), style = getComputedStyle(card);
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, overflow: getComputedStyle(node).overflow,
                card: { className: card.className, background: style.background, transform: style.transform, bounds: card.getBoundingClientRect().toJSON() } };
        });
        assert.equal(box.overflow, 'visible', 'speaker host does not clip growth or glow');
        const screenshot = await page.screenshot({ encoding: 'base64' });
        const painted = await page.evaluate(async (png, box) => {
            const image = new window.Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            return [Math.floor(box.x) - 2, Math.ceil(box.x + box.width) + 2].map(x =>
                [...context.getImageData(x, Math.round(box.y + box.height / 2), 1, 1).data]);
        }, screenshot, box);
        assert.ok(painted.every(([r, g, b]) => r > 200 && g < 60 && b < 60), `growth paints beyond both layer edges instead of being clipped: ${JSON.stringify({ painted, box })}`);
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.evaluate(() => getComputedStyle(window.editorState.nodes.get('host').querySelector('.sp-sb-card')).transform), 'none');
        const layouts = await page.evaluate(() => {
            return ['horizontal', 'compact-pill', 'cspan-banner', 'vertical-card'].map(layout => {
                const host = document.createElement('div');
                host.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:260px;';
                document.body.appendChild(host);
                const element = { type: 'speaker-badge', style: { fontSize: 20, fontWeight: '400', lineHeight: 1.4, letterSpacing: 2, verticalAlign: 'middle' },
                    speakerBadge: { layout, speaker: { name: 'Fictional Speaker', handle: '@fictionalguest', pronouns: 'they/them' }, reaction: { motionPop: false } } };
                const positions = ['left', 'center', 'right'].map(textAlign => {
                    element.style.textAlign = textAlign;
                    window.OverlayShared.renderSpeakerBadge(host, element);
                    const name = host.querySelector('.sp-sb-name'), style = getComputedStyle(name);
                    return { x: name.getBoundingClientRect().x, weight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing };
                });
                host.style.width = '240px';
                element.speakerBadge.speaker.name = 'An intentionally very long fictional speaker name';
                element.speakerBadge.speaker.callIn = { enabled: true, statusText: 'A very long fictional status label', location: 'A very long fictional caller location' };
                window.OverlayShared.renderSpeakerBadge(host, element);
                const rowsFit = [...host.querySelectorAll('.sp-sb-row, .cspan-header-bar')].every(row => row.scrollWidth <= row.clientWidth + 1);
                host.remove();
                return { layout, positions, rowsFit };
            });
        });
        for (const { layout, positions, rowsFit } of layouts) {
            assert.ok(positions[0].x < positions[1].x && positions[1].x < positions[2].x, `${layout}: text group aligns left/center/right when space is available`);
            assert.ok(positions.every(position => position.weight === '400' && position.lineHeight === '28px' && position.letterSpacing === '2px'), `${layout}: name honors typography without layout overrides`);
            assert.equal(rowsFit, true, `${layout}: long optional labels stay inside their content rows`);
        }
        const responsive = await page.evaluate(async () => {
            const results = [];
            for (const [layout, width, height] of [['horizontal', 513, 98], ['compact-pill', 260, 48], ['cspan-banner', 240, 96], ['vertical-card', 180, 200]]) {
                const host = document.createElement('div');
                host.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;`;
                document.body.appendChild(host);
                const element = { type: 'speaker-badge', style: { fontSize: 28, fontWeight: '600' },
                    speakerBadge: { layout, typography: { subtitleFontFamily: 'monospace', pillFontFamily: 'Georgia, serif' },
                        speaker: { name: 'An intentionally long fictional speaker name that must remain readable',
                        handle: '@fictionalguest', pronouns: 'they/them', avatarScale: 1.5,
                        callIn: { enabled: true, statusText: 'CALLING IN', location: 'Remote studio' } },
                    reaction: { visualizer: 'both', barCount: 8, motionPop: false } } };
                window.OverlayShared.renderSpeakerBadge(host, element);
                await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
                const card = host.querySelector('.sp-sb-card'), name = host.querySelector('.sp-sb-name');
                const standaloneName = name.parentElement.children.length === 1;
                const bounds = card.getBoundingClientRect(), title = name.getBoundingClientRect();
                const details = host.querySelector('.sp-sb-details').getBoundingClientRect();
                const contentFits = [...card.querySelectorAll('.sp-sb-name, .sp-sb-row, .sp-sb-avatar-wrap, .sp-sb-eq-bars')].every(child => {
                    const box = child.getBoundingClientRect();
                    return box.left >= bounds.left - 2 && box.right <= bounds.right + 2 && box.top >= bounds.top - 2 && box.bottom <= bounds.bottom + 2;
                });
                const size = parseFloat(getComputedStyle(name).fontSize);
                const paddingY = parseFloat(getComputedStyle(card).paddingTop);
                const subtitleFont = getComputedStyle(host.querySelector('.sp-sb-handle')).fontFamily;
                const pillFont = getComputedStyle(host.querySelector('.sp-sb-pronouns')).fontFamily;
                const separated = () => {
                    const meta = host.querySelector('.sp-sb-meta');
                    const groups = [...host.querySelectorAll('.sp-sb-card, .cspan-main-row, .sp-sb-meta, .sp-sb-row')];
                    return meta.scrollHeight <= meta.clientHeight + 1 && groups.every(group => {
                        const children = [...group.children].map(child => child.getBoundingClientRect());
                        return children.every((a, i) => children.slice(i + 1).every(b =>
                            a.right <= b.left + 0.5 || b.right <= a.left + 0.5 ||
                            a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5));
                    });
                };
                const noOverlaps = separated();
                const minimumRowGap = parseFloat(getComputedStyle(host.querySelector('.sp-sb-meta')).rowGap);
                host.style.width = '480px';
                host.style.height = '260px';
                await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
                const enlargedSize = parseFloat(getComputedStyle(name).fontSize);
                const enlargedNoOverlaps = separated();
                element.style.fontSize = 8;
                window.OverlayShared.renderSpeakerBadge(host, element);
                await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
                const autoSizeIgnoresManual = Math.abs(parseFloat(getComputedStyle(host.querySelector('.sp-sb-name')).fontSize) - enlargedSize) < 0.6;
                results.push({ layout, fixedHeight: bounds.height === height, standaloneName,
                    pillsBelow: details.top >= title.bottom - 1, contentFits, size,
                    enlargedSize, savedFontSize: element.style.fontSize,
                    paddingY, subtitleFont, pillFont, autoSizeIgnoresManual,
                    noOverlaps, enlargedNoOverlaps, minimumRowGap });
                window.OverlayShared.cleanupNode(host);
                host.remove();
            }
            return results;
        });
        for (const result of responsive) {
            assert.ok(result.fixedHeight && result.standaloneName && result.pillsBelow && result.contentFits, `${result.layout}: name has priority, pills stack below, and all content fits the fixed height: ${JSON.stringify(result)}`);
            assert.ok(result.size < 28 && result.enlargedSize > result.size, `${result.layout}: scales down when crowded and restores size after resize: ${JSON.stringify(result)}`);
            assert.equal(result.savedFontSize, 8, 'responsive fitting does not mutate the chosen typography');
            assert.equal(result.autoSizeIgnoresManual, true, 'auto-size fills the space independently of the saved manual font size');
            assert.ok(result.noOverlaps && result.enlargedNoOverlaps, `${result.layout}: metadata cannot shrink over adjacent avatar or EQ: ${JSON.stringify(result)}`);
            assert.ok(result.minimumRowGap >= 2, `${result.layout}: fitting preserves breathing room between text rows`);
            assert.match(result.subtitleFont, /monospace/);
            assert.match(result.pillFont, /Georgia/);
            if (result.layout === 'vertical-card') assert.equal(result.paddingY, 14, 'vertical padding is preserved even when contents scale down');
        }
        for (const preview of [true, false]) {
            await page.goto(`${base}/custom-overlay.html?id=${initial.id}&preview=${preview}`, { waitUntil: 'networkidle0' });
            await page.waitForSelector('[data-element-id="host"] .sp-sb-card');
            const speaking = () => document.querySelector('[data-element-id="host"] .sp-sb-card').classList.contains('is-speaking');
            assert.equal(await page.evaluate(speaking), false);
            const runtimeInput = overlays[initial.id].elements.find(element => element.id === 'host').speakerBadge.audio.inputName;
            sendMeter(-15, runtimeInput);
            await page.waitForFunction(speaking);
            sendMeter(-60, runtimeInput);
            assert.equal(await page.evaluate(speaking), true, `runtime preview=${preview}: release holds through a quiet pause`);
            await page.waitForFunction(() => !document.querySelector('[data-element-id="host"] .sp-sb-card').classList.contains('is-speaking'));
        }
        audioConnected = false;
        await page.goto(`${base}/overlay-control.html?id=${initial.id}`, { waitUntil: 'networkidle0' });
        const setupLink = await page.$eval('#audio-status a', link => link.getAttribute('href'));
        assert.equal(setupLink, '/config-editor.html#connection');
        await page.goto(`${base}${setupLink}`, { waitUntil: 'networkidle0' });
        assert.equal(await page.$eval('#cfg-obs-enabled', input => input.closest('.tab-pane').hidden), false);
        assert.equal(await page.$eval('#cfg-obs-host', input => input.value), '127.0.0.2');
        assert.equal(await page.$eval('#cfg-obs-port', input => input.value), '4456');
        assert.equal(await page.$eval('#cfg-obs-password', input => input.value), '');
        assert.match(await page.$eval('#cfg-obs-password', input => input.placeholder), /Saved/);
        assert.equal(await page.$$eval('#pane-modules #cfg-obs-enabled, #pane-modules #cfg-obs-host, #pane-modules #cfg-obs-password', inputs => inputs.length), 0);
        assert.equal(await page.$eval('#cfg-speaker-badges-enabled', input => input.closest('.tab-pane').hidden), true);
        await page.click('#top-save-config');
        await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('saved and applied'));
        assert.equal(configSaves.at(-1).obs.enabled, true);
        assert.equal(configSaves.at(-1).obs.host, '127.0.0.2');
        assert.equal(configSaves.at(-1).obs.port, 4456);
        assert.equal(configSaves.at(-1).obs.motionEngine, 'cut');
        assert.equal(configSaves.at(-1).obs.syncOnSave, false);
        assert.equal(Object.hasOwn(configSaves.at(-1).obs, 'password'), false, 'blank password preserves the existing credential');
        assert.equal(configSaves.at(-1).speaker_badges_enabled, false, 'global OBS enablement does not enable a module');
        assert.equal(configSaves.at(-1).obs_scene_sync_enabled, false);
        await page.click('.tabs-nav [data-tab="modules"]');
        assert.equal(await page.$eval('#cfg-speaker-badges-enabled', input => input.closest('.tab-pane').hidden), false);
        assert.equal(await page.$eval('#cfg-obs-sync-save', input => input.closest('.tab-pane').hidden), false);
        assert.equal(await page.$eval('#obs-scene-sync-options', options => options.hidden), true);
        await page.click('#cfg-obs-scene-sync-enabled');
        assert.equal(await page.$eval('#obs-scene-sync-options', options => options.hidden), false);
        await page.click('#cfg-obs-scene-sync-enabled');
        await page.click('#cfg-speaker-badges-enabled');
        await page.evaluate(async () => { await window.saveConfig(); });
        assert.equal(configSaves.at(-1).speaker_badges_enabled, true);
        assert.equal(configSaves.at(-1).obs.enabled, true);
        assert.equal(configSaves.at(-1).obs.syncOnSave, false, 'speaker metering does not enable automatic scene sync');
        await page.click('#cfg-speaker-badges-enabled');
        await page.click('.module-card a[href="#connection"]');
        await page.waitForFunction(() => !document.querySelector('#pane-connection').hidden);
        assert.equal(await page.$eval('#cfg-obs-enabled', input => input.checked), true, 'module toggle does not disable the shared connection');
        await page.click('#cfg-obs-enabled');
        await page.evaluate(async () => { await window.saveConfig(); });
        assert.equal(configSaves.at(-1).obs.enabled, false);
        assert.equal(configSaves.at(-1).obs.host, '127.0.0.2', 'disabling the connection retains its settings');
        assert.deepEqual(errors, []);
    });

test('OBS WebSocket subscription conditional on isSpeakerBadgesEnabled', () => {
    FixtureWebSocket.instances = [];
    let enabled = false;

    const obs = createObsService({
        getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 4455 }),
        isSpeakerBadgesEnabled: () => enabled,
        WebSocketImpl: FixtureWebSocket
    });

    obs.connect();
    const ws = FixtureWebSocket.instances[0];
    ws.readyState = FixtureWebSocket.OPEN;
    ws.emit('open');

    // Simulate OBS Hello
    ws.emit('message', JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));

    // When speaker badges disabled: eventSubscriptions should not include (1 << 16)
    const identifyDisabled = ws.sent.find(m => m.op === 1);
    assert.ok(identifyDisabled, 'Identify payload must be sent');
    assert.equal((identifyDisabled.d.eventSubscriptions & (1 << 16)), 0, 'Must NOT subscribe to InputVolumeMeters when disabled');

    obs.disconnect();

    // Now test with enabled = true
    enabled = true;
    obs.connect();
    const ws2 = FixtureWebSocket.instances[1];
    ws2.readyState = FixtureWebSocket.OPEN;
    ws2.emit('open');
    ws2.emit('message', JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));

    const identifyEnabled = ws2.sent.find(m => m.op === 1);
    assert.ok(identifyEnabled, 'Identify payload must be sent');
    assert.equal((identifyEnabled.d.eventSubscriptions & (1 << 16)), (1 << 16), 'Must subscribe to InputVolumeMeters (1 << 16) when enabled');

    obs.disconnect();
});

test('OBS WebSocket InputVolumeMeters triggers onAudioMeter with calculated RMS and dB', () => {
    FixtureWebSocket.instances = [];
    const metersReceived = [];

    const obs = createObsService({
        getConfig: () => ({ enabled: true, host: '127.0.0.1', port: 4455 }),
        isSpeakerBadgesEnabled: () => true,
        onAudioMeter: data => metersReceived.push(data),
        WebSocketImpl: FixtureWebSocket
    });

    obs.connect();
    const ws = FixtureWebSocket.instances[0];
    ws.readyState = FixtureWebSocket.OPEN;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    ws.emit('message', JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));

    // Simulate InputVolumeMeters event from OBS
    ws.emit('message', JSON.stringify({
        op: 5,
        d: {
            eventType: 'InputVolumeMeters',
            eventData: {
                inputs: [
                    {
                        inputName: 'Mic/Aux',
                        inputLevelsMul: [
                            [0.25, 0.1, 0.0],
                            [0.25, 0.1, 0.0]
                        ]
                    }
                ]
            }
        }
    }));

    assert.equal(metersReceived.length, 1);
    const m = metersReceived[0];
    assert.equal(m.input, 'Mic/Aux');
    assert.equal(m.rms, 0.1);
    assert.equal(m.peak, 0.25);
    assert.ok(m.db < 0, 'dB must be negative');
    assert.ok(m.db > -30, 'dB for 0.1 RMS is approx -20 dB');

    obs.disconnect();
});

test('OBS audio inputs query route /api/obs/audio-inputs returns input list', async () => {
    const handleObsRoutes = createObsRoutes({
        obsService: {
            listAudioInputs: async () => ['Mic/Aux', 'Discord Audio', 'Guest 1 Browser']
        }
    });

    let resData = null;
    let resStatus = 200;
    const mockRes = {
        writeHead: (code) => { resStatus = code; },
        end: (payload) => { resData = JSON.parse(payload); }
    };

    const handled = await handleObsRoutes({ method: 'GET' }, mockRes, '/api/obs/audio-inputs');
    assert.equal(handled, true);
    assert.equal(resStatus, 200);
    assert.deepEqual(resData, { inputs: ['Mic/Aux', 'Discord Audio', 'Guest 1 Browser'], connected: true, enabled: true });
});

test('Speaker Badge normalizes all 5 layouts and visualizer options', () => {
    const layouts = ['horizontal', 'cspan-banner', 'compact-pill', 'vertical-card', 'avatar-only'];
    for (const layout of layouts) {
        const overlay = normalizeCustomOverlay({
            id: `test-layout-${layout}`,
            elements: [{
                type: 'speaker-badge',
                speakerBadge: { layout, reaction: { visualizer: 'both' } }
            }]
        });
        assert.equal(overlay.elements[0].speakerBadge.layout, layout);
        assert.equal(overlay.elements[0].speakerBadge.reaction.visualizer, 'both');
    }
});

test('OverlayShared.renderSpeakerBadge renders all 5 layouts without errors or raw emojis', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    class MockNode {
        constructor(tagName = 'div') {
            this.tagName = tagName.toUpperCase();
            this.className = '';
            this.styleProps = {};
            this.style = {
                setProperty: (k, v) => { this.styleProps[k] = String(v); },
                getPropertyValue: (k) => this.styleProps[k] || '',
                removeProperty: (k) => { delete this.styleProps[k]; }
            };
            this.children = [];
            this.childNodes = this.children;
            this.innerHTML = '';
            this.textContent = '';
        }
        appendChild(child) {
            this.children.push(child);
            child.parentNode = this;
            return child;
        }
        replaceChildren(...nodes) {
            this.children = [];
            this.childNodes = this.children;
            for (const n of nodes) {
                if (n) this.appendChild(n);
            }
        }
        hasChildNodes() {
            return this.children.length > 0;
        }
        querySelector(selector) {
            if (selector.includes('.sp-sb-card')) {
                return this.children.find(c => c.className && c.className.includes('sp-sb-card')) || null;
            }
            if (selector.includes('.cspan-header-bar')) {
                return this.children.find(c => c.className && c.className.includes('cspan-header-bar')) || null;
            }
            return null;
        }
        querySelectorAll(selector) {
            const results = [];
            const walk = node => {
                for (const c of node.children) {
                    if (selector.startsWith('.') && c.className && c.className.includes(selector.slice(1))) results.push(c);
                    walk(c);
                }
            };
            walk(this);
            return results;
        }
        setAttribute(k, v) { this[k] = v; }
    }

    const mockDocument = {
        getElementById: () => null,
        createElement: tag => new MockNode(tag),
        head: new MockNode('head'),
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    const mockWin = {
        document: mockDocument,
        window: null
    };
    mockWin.window = mockWin;

    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay-shared.js'), 'utf8');
    const fn = new Function('window', 'document', code);
    fn(mockWin, mockDocument);

    const render = mockWin.OverlayShared.renderSpeakerBadge;
    assert.equal(typeof render, 'function');

    const layouts = ['horizontal', 'cspan-banner', 'compact-pill', 'vertical-card', 'avatar-only'];
    for (const layout of layouts) {
        const host = new MockNode('div');
        const element = {
            type: 'speaker-badge',
            speakerBadge: {
                layout,
                speaker: {
                    name: 'Alex Rivera',
                    handle: '@alex',
                    pronouns: 'they/them',
                    callIn: {
                        enabled: true,
                        statusText: 'ON THE LINE',
                        location: 'Chicago, IL',
                        statusColor: '#22c55e'
                    }
                },
                reaction: {
                    visualizer: 'both',
                    activeColor: '#6366f1',
                    glowSpread: 14,
                    highlightBorder: true,
                    motionPop: true,
                    dimWhenIdle: true
                }
            }
        };

        // Render idle
        render(host, element, { preview: true, speaking: false });
        const cardIdle = host.querySelector('.sp-sb-card');
        assert.ok(cardIdle, `Layout ${layout} must create .sp-sb-card`);
        assert.ok(cardIdle.className.includes(`layout-${layout}`), `Must contain layout-${layout}`);
        assert.ok(cardIdle.className.includes('is-idle'));
        assert.ok(cardIdle.className.includes('has-dim'));

        // Render speaking
        render(host, element, { preview: true, speaking: true });
        const cardSpeaking = host.querySelector('.sp-sb-card');
        assert.ok(cardSpeaking.className.includes('is-speaking'));
        assert.ok(cardSpeaking.className.includes('has-highlight'));
        assert.ok(cardSpeaking.className.includes('has-pop'));

        // Verify visualizer both creates both pulse ring and EQ bars
        const pulseRings = cardSpeaking.querySelectorAll('.sp-sb-pulse-ring');
        assert.ok(pulseRings.length >= 1, `Layout ${layout} with visualizer=both must render pulse ring`);
        const eqBars = cardSpeaking.querySelectorAll('.sp-sb-eq-bars');
        assert.ok(eqBars.length >= 1, `Layout ${layout} with visualizer=both must render EQ bars`);

        // Strict No-Emoji Check: ensure no raw unicode emojis in DOM tree
        const collectText = node => (node.textContent || '') + (node.innerHTML || '') + (node.className || '') + node.children.map(collectText).join(' ');
        const allText = collectText(host);
        assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(allText), `Layout ${layout} must contain zero raw emojis`);
    }

    // Explicit check for C-SPAN Banner structure
    const cspanHost = new MockNode('div');
    render(cspanHost, {
        type: 'speaker-badge',
        speakerBadge: {
            layout: 'cspan-banner',
            speaker: {
                name: 'Guest Speaker',
                callIn: { enabled: true, statusText: 'CALLING IN', location: 'Seattle, WA', statusColor: '#38bdf8' }
            }
        }
    }, { speaking: true });
    const cspanCard = cspanHost.querySelector('.sp-sb-card');
    assert.ok(cspanCard.querySelector('.cspan-header-bar'), 'C-SPAN Banner layout must contain .cspan-header-bar');

    // Transparent and Gradient Background and Proportional Font Scaling checks
    const styleHost = new MockNode('div');
    render(styleHost, {
        type: 'speaker-badge',
        speakerBadge: { layout: 'horizontal', speaker: { name: 'Styling Test' } },
        style: {
            background: 'transparent',
            fontSize: 30,
            fontWeight: 800,
            color: '#38bdf8'
        }
    }, {});
    const styleCard = styleHost.querySelector('.sp-sb-card');
    assert.equal(styleCard.style.background, 'transparent', 'Background transparent must not be overwritten with default dark color');
    assert.equal(styleCard.style.getPropertyValue('--sb-font-size'), '30px', 'Font size must set --sb-font-size');
    assert.equal(styleCard.style.getPropertyValue('--sb-handle-size'), '22px', 'Handle font size must scale proportionally');
    assert.equal(styleCard.style.getPropertyValue('--sb-font-weight'), '800', 'Font weight must be applied');
    assert.equal(styleCard.style.color, '#38bdf8', 'Text color must be applied');

    // Gradient check
    const gradHost = new MockNode('div');
    render(gradHost, {
        type: 'speaker-badge',
        speakerBadge: { layout: 'horizontal', speaker: { name: 'Gradient Test' } },
        style: {
            gradient: { enabled: true, from: '#ff0000', to: '#0000ff', angle: 90 }
        }
    }, {});
    const gradCard = gradHost.querySelector('.sp-sb-card');
    assert.ok(gradCard.style.background.includes('linear-gradient'), 'Gradient background must be applied to card');
});
