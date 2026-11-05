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
        const end = source.indexOf('\n    let elementNodesKept', start);
        const meterStart = source.indexOf('    function handleObsAudioMeter(');
        const meterEnd = source.indexOf('\n    function connect()', meterStart);
        const callbacks = new Map();
        const renders = [];
        let seq = 0;
        const element = { id: 'speaker', type: 'speaker-badge', speakerBadge: { speaker: { name: 'Original' }, audio: { inputName: 'Mic/Aux', thresholdDb: -36, holdMs: 280 } } };
        const context = vm.createContext({
            speakerStates: new Map(), currentOverlay: { elements: [element] }, elements: new Map([['speaker', {}]]),
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

    test('Speaker editor OBS setup hint targets the shared OBS settings in the modules tab', () => {
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
        assert.match(nodes['sb-obs-status-hint'].innerHTML, /href="\/config-editor.html#modules"/);
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
        const overlays = { [initial.id]: initial }, events = [];
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
                res.end(JSON.stringify({ connected: true, inputs: ['Mic/Aux', 'Guest Audio'] })); return;
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
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/overlay-control.html?id=${initial.id}`, { waitUntil: 'networkidle0' });
        await page.click('#tab-speakers');
        await page.waitForSelector('[data-speaker-form="host"] input');
        await page.$eval('[data-speaker-form="host"] [name="name"]', input => { input.value = 'Edited Host'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.$eval('[data-speaker-form="host"] [name="inputName"]', input => { input.value = 'Guest Audio'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        for (const client of sockets.clients) client.send(JSON.stringify({ type: 'custom-overlay-page', data: { id: initial.id, enabled: false } }));
        assert.equal(await page.$eval('[data-speaker-form="host"] [name="name"]', input => input.value), 'Edited Host');
        assert.equal(await page.$eval('#speaker-audio-inputs', list => list.children.length), 2);
        overlays[initial.id].elements.find(element => element.id === 'heading').content = 'Concurrent heading edit';
        const [saved] = await Promise.all([
            page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'PATCH'),
            page.click('[data-speaker-form="host"] button')
        ]);
        assert.equal(saved.status(), 200);
        const stored = JSON.parse(fs.readFileSync(file, 'utf8'))[initial.id];
        const badge = stored.elements.find(element => element.id === 'host').speakerBadge;
        assert.equal(badge.speaker.name, 'Edited Host');
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
        await page.goto(`${base}/config-editor.html#modules`, { waitUntil: 'networkidle0' });
        assert.equal(await page.$eval('#cfg-obs-enabled', input => input.closest('.tab-pane').hidden), false);
        assert.match(await page.$eval('#cfg-obs-enabled', input => input.closest('.module-card').textContent), /OBS Connection & Sync/);
        assert.equal(await page.$eval('#cfg-speaker-badges-enabled', input => input.closest('.tab-pane').hidden), false);
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
