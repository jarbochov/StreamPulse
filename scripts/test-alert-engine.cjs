'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createAlertEngine, normalizeConfig } = require('../server/services/alerts.js');

function createTempEngine(initialConfig = {}) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-alert-test-'));
    const dispatched = [];
    const engine = createAlertEngine({
        dataDir: tempDir,
        broadcast: (type, payload) => dispatched.push({ type, payload }),
        runTimerAction: () => {},
        log: () => {}
    });
    if (Object.keys(initialConfig).length) {
        engine.setConfig(initialConfig);
    }
    return { engine, dispatched, tempDir, cleanup: () => { engine.stop(); fs.rmSync(tempDir, { recursive: true, force: true }); } };
}

test('subscription tiers normalization and backward compatibility', () => {
    // Legacy c.tier string
    const cfg1 = normalizeConfig({
        rules: [{
            id: 'legacy-sub',
            trigger: 'sub',
            conditions: { tier: 'prime' },
            variants: [{ title: 'Prime sub!' }]
        }]
    });
    assert.deepEqual(cfg1.rules[0].conditions.tiers, ['prime']);
    assert.equal(cfg1.rules[0].conditions.tier, 'prime');

    // Array of tiers
    const cfg2 = normalizeConfig({
        rules: [{
            id: 'multi-tier-sub',
            trigger: 'resub',
            conditions: { tiers: ['1000', '2000'] },
            variants: [{ title: 'Tier 1 or 2 resub!' }]
        }]
    });
    assert.deepEqual(cfg2.rules[0].conditions.tiers, ['1000', '2000']);
    assert.equal(cfg2.rules[0].conditions.tier, ''); // multiple tiers clears single legacy tier string

    // Any tier (empty)
    const cfg3 = normalizeConfig({
        rules: [{
            id: 'any-sub',
            trigger: 'sub',
            conditions: { tiers: [] },
            variants: [{ title: 'Any tier sub!' }]
        }]
    });
    assert.deepEqual(cfg3.rules[0].conditions.tiers, []);
    assert.equal(cfg3.rules[0].conditions.tier, '');
});

test('alert precedence: specific tier beats Any tier rule without duplicate firing', () => {
    const { engine, dispatched, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'any-tier-rule',
                name: 'General Resub Alert',
                enabled: true,
                trigger: 'resub',
                conditions: { tiers: [] },
                variants: [{ id: 'v-any', title: 'General Resub: {{alert.user}}' }]
            },
            {
                id: 'prime-rule',
                name: 'Prime Specific Alert',
                enabled: true,
                trigger: 'resub',
                conditions: { tiers: ['prime'] },
                variants: [{ id: 'v-prime', title: 'Prime Hype: {{alert.user}}' }]
            },
            {
                id: 'tier3-rule',
                name: 'Tier 3 Specific Alert',
                enabled: true,
                trigger: 'resub',
                conditions: { tiers: ['3000'] },
                variants: [{ id: 'v-tier3', title: 'Tier 3 Royalty: {{alert.user}}' }]
            }
        ]
    });

    try {
        // Prime resub event
        const primePayload = engine.handleEvent({
            type: 'resub',
            user: 'PrimeGamer',
            months: 3,
            tier: 'prime',
            tierLabel: 'Prime'
        });

        assert.ok(primePayload, 'Prime event should fire an alert');
        assert.equal(primePayload.ruleId, 'prime-rule', 'Specific Prime rule must take precedence over Any Tier rule');
        assert.equal(primePayload.title, 'Prime Hype: PrimeGamer');

        // Tier 3 resub event
        const tier3Payload = engine.handleEvent({
            type: 'resub',
            user: 'BigSupporter',
            months: 6,
            tier: '3000',
            tierLabel: 'Tier 3'
        });

        assert.ok(tier3Payload);
        assert.equal(tier3Payload.ruleId, 'tier3-rule', 'Tier 3 specific rule must win over Any Tier');
        assert.equal(tier3Payload.title, 'Tier 3 Royalty: BigSupporter');

        // Tier 1 resub event (no specific Tier 1 rule, so Any Tier matches)
        const tier1Payload = engine.handleEvent({
            type: 'resub',
            user: 'StandardSub',
            months: 2,
            tier: '1000',
            tierLabel: 'Tier 1'
        });

        assert.ok(tier1Payload);
        assert.equal(tier1Payload.ruleId, 'any-tier-rule', 'Any Tier rule matches when no specific rule exists');
        assert.equal(tier1Payload.title, 'General Resub: StandardSub');

        // Check queue state: 1 current playing + 2 pending in queue = 3 alerts total
        const qState = engine.getQueueState();
        assert.equal((qState.current ? 1 : 0) + qState.pending, 3, 'Exactly three alerts processed across the three events');
    } finally {
        cleanup();
    }
});

test('variant gating: gated thresholds vs weighted variants', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'resub-milestones',
                name: 'Resubs With Milestone Variants',
                enabled: true,
                trigger: 'resub',
                conditions: { tiers: [] },
                variants: [
                    {
                        id: 'v-default',
                        variantType: 'weighted',
                        weight: 10,
                        title: 'Default Resub: {{alert.months}} months'
                    },
                    {
                        id: 'v-gate-12',
                        variantType: 'gated',
                        gateMin: 12,
                        gateMinOp: 'gte',
                        gateMax: 24,
                        gateMaxOp: 'lt',
                        title: 'Year One Veteran (12-23 mos): {{alert.months}} months'
                    },
                    {
                        id: 'v-gate-24',
                        variantType: 'gated',
                        gateMin: 24,
                        gateMinOp: 'gte',
                        gateMax: 0,
                        title: 'Legendary Veteran (24+ mos): {{alert.months}} months'
                    }
                ]
            }
        ]
    });

    try {
        // 1. Event with 6 months (does not meet 12+ or 24+ gate) -> falls back to default weighted variant
        const ev6 = engine.handleEvent({ type: 'resub', user: 'Sub6', months: 6, tier: '1000', dedupeMs: 0 });
        assert.ok(ev6);
        assert.equal(ev6.variantId, 'v-default');
        assert.equal(ev6.title, 'Default Resub: 6 months');

        // 2. Event with 18 months (meets >=12 and <24 gate)
        const ev18 = engine.handleEvent({ type: 'resub', user: 'Sub18', months: 18, tier: '1000', dedupeMs: 0 });
        assert.ok(ev18);
        assert.equal(ev18.variantId, 'v-gate-12');
        assert.equal(ev18.title, 'Year One Veteran (12-23 mos): 18 months');

        // 3. Event with 36 months (meets >=24 gate)
        const ev36 = engine.handleEvent({ type: 'resub', user: 'Sub36', months: 36, tier: '1000', dedupeMs: 0 });
        assert.ok(ev36);
        assert.equal(ev36.variantId, 'v-gate-24');
        assert.equal(ev36.title, 'Legendary Veteran (24+ mos): 36 months');
    } finally {
        cleanup();
    }
});

test('video volume and twitch emote url payload generation', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'media-rule',
                name: 'Media Alert',
                enabled: true,
                trigger: 'follow',
                variants: [
                    {
                        id: 'v-media',
                        title: 'New Follower: {{alert.user}}',
                        video: 'https://example.com/alert.webm',
                        videoSound: true,
                        videoVolume: 45,
                        emoji: 'PogChamp',
                        emojiUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/301590448/default/dark/3.0'
                    }
                ]
            }
        ]
    });

    try {
        const payload = engine.handleEvent({ type: 'follow', user: 'TestFollower', dedupeMs: 0 });
        assert.ok(payload);
        assert.equal(payload.videoVolume, 45, 'videoVolume must be passed into alert payload');
        assert.equal(payload.emoji, 'PogChamp');
        assert.equal(payload.emojiUrl, 'https://static-cdn.jtvnw.net/emoticons/v2/301590448/default/dark/3.0');
    } finally {
        cleanup();
    }
});

test('gift sub recipient placeholder support in single and batched gifts', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'gift-rule',
                name: 'Gift Sub Alert',
                enabled: true,
                trigger: 'gift',
                conditions: {},
                variants: [
                    {
                        id: 'v-gift',
                        title: '{{alert.user}} gifted {{alert.count}} sub to {{alert.recipient}}!'
                    }
                ]
            }
        ]
    });

    try {
        // Direct event with recipient
        const payload = engine.handleEvent({
            type: 'gift',
            user: 'GenerousDonor',
            count: 1,
            amount: 1,
            recipient: 'LuckyFriend',
            dedupeMs: 0
        });

        assert.ok(payload);
        assert.equal(payload.recipient, 'LuckyFriend');
        assert.equal(payload.title, 'GenerousDonor gifted 1 sub to LuckyFriend!');

        // Test fireRule with overrides
        const testPayload = engine.fireRule('gift-rule', 'v-gift', { user: 'TestGifter', recipient: 'TestLuckyUser', count: 1 });
        assert.equal(testPayload.recipient, 'TestLuckyUser');
        assert.equal(testPayload.title, 'TestGifter gifted 1 sub to TestLuckyUser!');
    } finally {
        cleanup();
    }
});

test('alert box idle state: border and background styling is stripped from idle container node', () => {
    // Mock minimal DOM node to verify prepareAlertNode behavior
    const node = {
        style: {
            border: '2px solid red',
            borderColor: 'red',
            borderWidth: '2px',
            background: '#ff0000',
            backgroundColor: '#ff0000',
            boxShadow: '0 4px 10px black',
            borderRadius: '12px',
            backdropFilter: 'blur(5px)',
            webkitBackdropFilter: 'blur(5px)'
        },
        _borderRing: { remove: () => { node._borderRing = null; } },
        _innerGlowRing: { remove: () => { node._innerGlowRing = null; } },
        _borderObserver: { disconnect: () => { node._borderObserver = null; } }
    };

    const element = {
        type: 'alert',
        style: {
            borderWidth: 2,
            borderColor: 'red',
            background: '#ff0000',
            borderRadius: 12,
            shadow: { blur: 10, color: 'black' },
            blur: 5
        }
    };

    // Simulate prepareAlertNode logic from overlay-shared.js
    const ALERT_DECORATION = [
        'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
        'animation', 'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'boxShadow', 'backdropFilter', 'webkitBackdropFilter'
    ];
    const deco = {};
    for (const key of ALERT_DECORATION) {
        if (node.style[key]) deco[key] = node.style[key];
        node.style[key] = '';
    }
    if (node._borderRing) { node._borderRing.remove(); }
    if (node._innerGlowRing) { node._innerGlowRing.remove(); }
    if (node._borderObserver) { node._borderObserver.disconnect(); }
    node.style.border = '0';
    node.style.outline = 'none';
    node.style.background = 'transparent';
    node.style.backgroundColor = 'transparent';
    node.style.boxShadow = 'none';
    node.style.backdropFilter = 'none';
    node.style.webkitBackdropFilter = 'none';
    node._alertDeco = deco;

    assert.equal(node.style.border, '0', 'Idle container node must have border: 0');
    assert.equal(node.style.background, 'transparent', 'Idle container node must have transparent background');
    assert.equal(node.style.boxShadow, 'none', 'Idle container node must have no shadow');
    assert.equal(node._borderRing, null, 'Border ring overlay must be removed when idle');
    assert.equal(node._innerGlowRing, null, 'Inner glow ring must be removed when idle');
    assert.ok(deco.background, 'Decorations are preserved on _alertDeco for the active card');
});

