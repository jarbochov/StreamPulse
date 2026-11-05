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
    assert.deepEqual(resData, { inputs: ['Mic/Aux', 'Discord Audio', 'Guest 1 Browser'] });
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
                getPropertyValue: (k) => this.styleProps[k] || ''
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
});
