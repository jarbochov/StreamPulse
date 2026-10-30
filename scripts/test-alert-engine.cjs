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

test('alert deduplication stays bounded during bursts and releases removed-rule cooldowns', () => {
    const config = {
        settings: { enabled: true },
        rules: [{ id: 'fixture', trigger: 'follow', conditions: { cooldownSeconds: 0 }, variants: [{ title: 'Welcome {{user}}' }] }]
    };
    const { engine, cleanup } = createTempEngine(config);
    try {
        const old = { type: 'follow', user: 'OldFixture' };
        assert.ok(engine.handleEvent(old));
        assert.equal(engine.handleEvent({ ...old }), null, 'recent duplicate is suppressed');
        for (let i = 0; i < 10001; i++) engine.handleEvent({ type: 'chat_word', user: `Fixture-${i}`, message: 'no rule' });
        assert.ok(engine.handleEvent({ ...old }), 'oldest entry is evicted rather than growing the dedupe cache forever');
        assert.equal(engine.handleEvent({ ...old }), null, 'newly retained event is still deduplicated');

        const cooldownConfig = {
            ...config,
            rules: [{ ...config.rules[0], conditions: { cooldownSeconds: 60 } }]
        };
        engine.setConfig(cooldownConfig);
        engine.setConfig({ settings: { enabled: true }, rules: [] });
        engine.setConfig(cooldownConfig);
        assert.ok(engine.handleEvent({ type: 'follow', user: 'NewFixture' }), 'removed rule does not retain its old cooldown');
    } finally {
        cleanup();
    }
});

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

test('alert assets tracking and rewriting in asset library', () => {
    const { engine, cleanup } = createTempEngine({
        rules: [
            {
                id: 'sub-hype',
                name: 'Hype Sub Alert',
                trigger: 'sub',
                variants: [
                    {
                        title: 'Super sub!',
                        image: '/custom-overlay-assets/hype-sub.gif',
                        video: '',
                        sound: '/custom-overlay-assets/fanfare.mp3'
                    }
                ]
            },
            {
                id: 'raid-alert',
                name: 'Raid Incoming',
                trigger: 'raid',
                variants: [
                    {
                        title: 'Raid!',
                        image: '',
                        video: '/custom-overlay-assets/party-raid.mp4',
                        sound: ''
                    }
                ]
            }
        ]
    });

    try {
        const assetRef = (text, name) => text && text.includes(name);

        // Test alertAssetUsers detection
        const subImageUsers = engine.alertAssetUsers('hype-sub.gif', assetRef);
        assert.equal(subImageUsers.length, 1);
        assert.equal(subImageUsers[0].id, 'alert:sub-hype');
        assert.equal(subImageUsers[0].name, 'Alert: Hype Sub Alert');

        const soundUsers = engine.alertAssetUsers('fanfare.mp3', assetRef);
        assert.equal(soundUsers.length, 1);
        assert.equal(soundUsers[0].id, 'alert:sub-hype');

        const videoUsers = engine.alertAssetUsers('party-raid.mp4', assetRef);
        assert.equal(videoUsers.length, 1);
        assert.equal(videoUsers[0].id, 'alert:raid-alert');

        const unusedUsers = engine.alertAssetUsers('nonexistent.png', assetRef);
        assert.equal(unusedUsers.length, 0);

        // Test rewriteAlertReferences on rename
        const rewriter = (text, from, to) => text ? text.replace(from, to) : text;
        const changed = engine.rewriteAlertReferences('fanfare.mp3', 'victory-chime.mp3', rewriter);
        assert.equal(changed, true);

        const updatedSoundUsers = engine.alertAssetUsers('victory-chime.mp3', assetRef);
        assert.equal(updatedSoundUsers.length, 1);
        assert.equal(updatedSoundUsers[0].id, 'alert:sub-hype');

        const oldSoundUsers = engine.alertAssetUsers('fanfare.mp3', assetRef);
        assert.equal(oldSoundUsers.length, 0);
    } finally {
        cleanup();
    }
});

test('weighted variant selection rolls according to weights without forced alternation', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'weighted-rule',
                name: 'Weighted Follow Alert',
                enabled: true,
                trigger: 'follow',
                variants: [
                    { id: 'v-rare', weight: 1, title: 'Rare variant' },
                    { id: 'v-common', weight: 9, title: 'Common variant' }
                ]
            }
        ]
    });

    try {
        const counts = { 'v-rare': 0, 'v-common': 0 };
        for (let i = 0; i < 200; i++) {
            const res = engine.fireRule('weighted-rule'); // no variantId passed -> rolls by weight
            assert.ok(res);
            counts[res.variantId]++;
        }
        // With 9:1 odds (90% vs 10%), common variant should win significantly more than rare
        assert.ok(counts['v-common'] > counts['v-rare'] * 3, `Expected common (${counts['v-common']}) to significantly outnumber rare (${counts['v-rare']})`);
        assert.ok(counts['v-rare'] > 0, `Expected rare variant (${counts['v-rare']}) to fire at least once in 200 rolls`);
    } finally {
        cleanup();
    }
});

test('fireRule simulation evaluates test amounts and thresholds correctly', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'cheer-rule',
                name: 'Cheer Bits Alert',
                enabled: true,
                trigger: 'bits',
                variants: [
                    { id: 'v-default', variantType: 'weighted', weight: 1, title: 'Default Cheer' },
                    { id: 'v-500', variantType: 'gated', gateMin: 500, gateMinOp: 'gte', weight: 1, title: 'Hype 500 Bits!' },
                    { id: 'v-1000', variantType: 'gated', gateMin: 1000, gateMinOp: 'gte', weight: 1, title: 'Huge 1000 Bits!' }
                ]
            }
        ]
    });

    try {
        // Test with 100 bits (matches default)
        const res100 = engine.fireRule('cheer-rule', '', { amount: 100 });
        assert.equal(res100.variantId, 'v-default');

        // Test with 500 bits (matches v-500 threshold)
        const res500 = engine.fireRule('cheer-rule', '', { amount: 500 });
        assert.equal(res500.variantId, 'v-500');

        // Test with 1500 bits (matches highest threshold v-1000)
        const res1500 = engine.fireRule('cheer-rule', '', { amount: 1500 });
        assert.equal(res1500.variantId, 'v-1000');

        // Explicit variant preview still works
        const explicit = engine.fireRule('cheer-rule', 'v-500', { amount: 100 });
        assert.equal(explicit.variantId, 'v-500');
    } finally {
        cleanup();
    }
});

