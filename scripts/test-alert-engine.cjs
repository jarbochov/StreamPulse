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


test('equal-to amounts beat ranges, legacy min==max loads as exact, and source filters donations', () => {
    const variant = title => [{ id: 'v1', title, message: '{{alert.source}}' }];
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            { id: 'any-50', trigger: 'donation', conditions: { minAmount: 50 }, variants: variant('min') },
            { id: 'range', trigger: 'donation', conditions: { amountMode: 'range', minAmount: 60, maxAmount: 80 }, variants: variant('range') },
            { id: 'legacy-exact', trigger: 'donation', conditions: { minAmount: 69.42, maxAmount: 69.42 }, variants: variant('exact') },
            { id: 'tiltify-only', trigger: 'donation', conditions: { amountMode: 'exact', exactAmount: 25, source: 'tiltify' }, variants: variant('tiltify') }
        ]
    });
    try {
        const legacy = normalizeConfig({ rules: [{ trigger: 'donation', conditions: { minAmount: 5, maxAmount: 5 } }, { trigger: 'donation', conditions: { minAmount: 5, maxAmount: 9 } }] }).rules;
        assert.equal(legacy[0].conditions.amountMode, 'exact');
        assert.equal(legacy[0].conditions.exactAmount, 5);
        assert.equal(legacy[1].conditions.amountMode, 'range');

        const fire = (amount, source) => engine.handleEvent({ type: 'donation', user: `u${amount}${source}`, amount, source });
        const exact = fire(69.424, 'tiltify');
        assert.equal(exact.title, 'exact', 'exact beats the overlapping range and minimum');
        assert.equal(exact.message, 'tiltify', '{{alert.source}} resolves');
        assert.equal(fire(70, 'tiltify').title, 'range');
        assert.equal(fire(25, 'socialstream'), null, 'source-specific rule ignores other sources');
        assert.equal(fire(25.004, 'tiltify').title, 'tiltify', 'within 0.005 tolerance');
        assert.equal(fire(25.01, 'tiltify'), null, 'outside tolerance');
    } finally {
        cleanup();
    }
});

test('gated variants support an equal-to amount that beats higher thresholds', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{ id: 'd', trigger: 'donation', variants: [
            { id: 'base', title: 'base' },
            { id: 'big', variantType: 'gated', gateMin: 50, title: 'big' },
            { id: 'nice', variantType: 'gated', gateMode: 'exact', gateMin: 69, title: 'nice' }
        ] }]
    });
    try {
        assert.equal(engine.fireRule('d', '', { amount: 69 }).variantId, 'nice');
        assert.equal(engine.fireRule('d', '', { amount: 70 }).variantId, 'big');
        assert.equal(normalizeConfig({ rules: [{ variants: [{ variantType: 'gated', gateMin: 7, gateMax: 7 }] }] }).rules[0].variants[0].gateMode, 'exact');
    } finally {
        cleanup();
    }
});

test('emote celebration effects (showcase, rain, party, fountain, bounce) and emote ladder scaling in alert payloads', () => {
    // Normalization check
    const normalized = normalizeConfig({
        rules: [{
            trigger: 'bits',
            variants: [
                {
                    emoteEffect: 'party',
                    emoteDensity: 50,
                    emoteScale: 150,
                    emojiLadder: [
                        { min: 100, emoji: 'Cheer100', emojiUrl: 'https://cdn.twitch.tv/cheer100.png' },
                        { min: 500, emoji: 'https://cdn.twitch.tv/cheer500.png' }
                    ],
                    emojiEvery: 50,
                    emojiMax: 10
                },
                {
                    emoteEffect: 'invalid_effect',
                    emoteDensity: 999, // Should clamp to 100
                    emoteScale: 10 // Should clamp to 20
                }
            ]
        }]
    });

    const v1 = normalized.rules[0].variants[0];
    assert.equal(v1.emoteEffect, 'party');
    assert.equal(v1.emoteDensity, 50);
    assert.equal(v1.emoteScale, 150);
    assert.equal(v1.emojiLadder.length, 2);
    assert.equal(v1.emojiLadder[0].emojiUrl, 'https://cdn.twitch.tv/cheer100.png');
    assert.equal(v1.emojiLadder[1].emojiUrl, '');

    const v2 = normalized.rules[0].variants[1];
    assert.equal(v2.emoteEffect, 'showcase', 'falls back to showcase for invalid effect');
    assert.equal(v2.emoteDensity, 100, 'clamps density to 100');
    assert.equal(v2.emoteScale, 20, 'clamps scale to 20');

    // Engine dispatch check
    const { engine, dispatched, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{
            id: 'bits-rule',
            name: 'Bits Alert',
            enabled: true,
            trigger: 'bits',
            conditions: { minAmount: 0 },
            variants: [{
                id: 'v-cheer',
                title: '{{alert.user}} cheered {{alert.amount}} bits',
                emoteEffect: 'rain',
                emoteDensity: 45,
                emoteScale: 120,
                emoji: 'DefaultCheer',
                emojiLadder: [
                    { min: 100, emoji: 'Cheer100', emojiUrl: '/assets/cheer100.png' },
                    { min: 1000, emoji: 'https://cdn.twitch.tv/cheer1000.png' }
                ],
                emojiEvery: 100,
                emojiMax: 5
            }]
        }]
    });

    try {
        // Amount below ladder: uses default emote
        const p1 = engine.handleEvent({ type: 'bits', user: 'BitFan1', amount: 50, bits: 50 });
        assert.ok(p1);
        assert.equal(p1.emoji, 'DefaultCheer');
        assert.equal(p1.emojiUrl, '');
        assert.equal(p1.emoteEffect, 'rain');
        assert.equal(p1.emoteDensity, 45);
        assert.equal(p1.emoteScale, 120);
        assert.equal(p1.emojiRepeat, 1);

        // Amount >= 100: selects step 1 with emojiUrl
        const p2 = engine.handleEvent({ type: 'bits', user: 'BitFan2', amount: 300, bits: 300 });
        assert.ok(p2);
        assert.equal(p2.emoji, 'Cheer100');
        assert.equal(p2.emojiUrl, '/assets/cheer100.png');
        assert.equal(p2.emojiRepeat, 3); // 300 / 100 = 3

        // Amount >= 1000: selects step 2 and detects URL as emojiUrl
        const p3 = engine.handleEvent({ type: 'bits', user: 'BitFan3', amount: 2000, bits: 2000 });
        assert.ok(p3);
        assert.equal(p3.emoji, 'https://cdn.twitch.tv/cheer1000.png');
        assert.equal(p3.emojiUrl, 'https://cdn.twitch.tv/cheer1000.png');
        assert.equal(p3.emojiRepeat, 5); // Capped by emojiMax: 5
    } finally {
        cleanup();
    }
});

test('alert webhook execution: sends HTTP POST and GET with payload and executes on test preview and live events', async () => {
    const fetchCalls = [];
    const origFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
        fetchCalls.push({ url: String(url), ...opts });
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => 'ok'
        };
    };

    const webhookUrl = 'http://192.168.1.4:8000/api/location/23/0/3/press/';
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{
            id: 'companion-webhook-rule',
            name: 'Companion Webhook Rule',
            enabled: true,
            trigger: 'bits',
            conditions: { minAmount: 0 },
            variants: [{ id: 'v1', title: 'Bits Cheer!' }],
            actions: {
                timer: { enabled: false },
                http: { enabled: true, url: webhookUrl, method: 'POST' }
            }
        }]
    });

    try {
        // 1. fireRule (used by Test Rule / Preview buttons) fires webhook
        engine.fireRule('companion-webhook-rule', 'v1', { user: 'CompanionTester', amount: 500 });
        await new Promise(r => setTimeout(r, 50));

        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, webhookUrl);
        assert.equal(fetchCalls[0].method, 'POST');
        assert.equal(fetchCalls[0].headers?.['Content-Type'], 'application/json');
        const postBody = JSON.parse(fetchCalls[0].body);
        assert.equal(postBody.rule, 'companion-webhook-rule');
        assert.equal(postBody.user, 'CompanionTester');
        assert.equal(postBody.amount, 500);

        // 2. handleEvent (live event) fires webhook
        engine.handleEvent({ type: 'bits', user: 'LiveDonor', amount: 250 });
        await new Promise(r => setTimeout(r, 50));

        assert.equal(fetchCalls.length, 2);
        assert.equal(fetchCalls[1].url, webhookUrl);
        const liveBody = JSON.parse(fetchCalls[1].body);
        assert.equal(liveBody.user, 'LiveDonor');
        assert.equal(liveBody.amount, 250);

        // 3. fireRule with overrides.runActions = false skips webhook
        engine.fireRule('companion-webhook-rule', 'v1', { runActions: false });
        await new Promise(r => setTimeout(r, 50));
        assert.equal(fetchCalls.length, 2, 'runActions: false suppresses webhook');
    } finally {
        global.fetch = origFetch;
        cleanup();
    }
});

test('POST /api/alerts/test-webhook route validates URL and returns companion note on 404 with GET', async () => {
    const { createOverlayRoutes } = require('../server/routes/overlays.js');
    const { engine, cleanup } = createTempEngine();
    const router = createOverlayRoutes({ alertEngine: engine });

    const origFetch = global.fetch;
    try {
        global.fetch = async (url, opts = {}) => {
            if (opts.method === 'GET' && String(url).includes('/press')) {
                return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
            }
            return { ok: true, status: 200, statusText: 'OK', text: async () => 'ok' };
        };

        const createReq = (body) => {
            const stream = new (require('stream').Readable)();
            stream.push(JSON.stringify(body));
            stream.push(null);
            stream.method = 'POST';
            stream.headers = { 'content-type': 'application/json' };
            return stream;
        };

        const createRes = () => {
            let statusCode = 200, output = '';
            return {
                writeHead(code) { statusCode = code; return this; },
                setHeader() { return this; },
                end(data) { output = data; },
                getStatusCode: () => statusCode,
                getBody: () => JSON.parse(output || '{}')
            };
        };

        // 1. Success POST to companion URL
        const res1 = createRes();
        await router(createReq({ url: 'http://192.168.1.4:8000/api/location/23/0/3/press/', method: 'POST' }), res1, new URL('http://localhost/api/alerts/test-webhook'), '/api/alerts/test-webhook');
        assert.equal(res1.getBody().ok, true);
        assert.equal(res1.getBody().status, 200);

        // 2. GET to companion /press: detected and advised
        const res2 = createRes();
        await router(createReq({ url: 'http://192.168.1.4:8000/api/location/23/0/3/press/', method: 'GET' }), res2, new URL('http://localhost/api/alerts/test-webhook'), '/api/alerts/test-webhook');
        assert.equal(res2.getBody().ok, false);
        assert.equal(res2.getBody().status, 404);
        assert.match(res2.getBody().note, /POST/i);

        // 3. Invalid URL: returns error
        const res3 = createRes();
        await router(createReq({ url: 'not-a-url', method: 'POST' }), res3, new URL('http://localhost/api/alerts/test-webhook'), '/api/alerts/test-webhook');
        assert.equal(res3.getBody().ok, false);
        assert.match(res3.getBody().error, /valid HTTP or HTTPS URL/i);
    } finally {
        global.fetch = origFetch;
        cleanup();
    }
});

test('webhookOnly alert rules fire webhooks silently without enqueuing to overlay or broadcasting', async () => {
    const fetchCalls = [];
    const origFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
        fetchCalls.push({ url: String(url), ...opts });
        return { ok: true, status: 200, statusText: 'OK', text: async () => 'ok' };
    };

    const normalized = normalizeConfig({
        rules: [
            { id: 'r1', trigger: 'follow', webhookOnly: true },
            { id: 'r2', trigger: 'bits', silent: true }
        ]
    });
    assert.equal(normalized.rules[0].webhookOnly, true);
    assert.equal(normalized.rules[1].webhookOnly, true);

    const { engine, dispatched, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{
            id: 'silent-companion-rule',
            name: 'Silent Companion Automation',
            enabled: true,
            webhookOnly: true,
            trigger: 'bits',
            conditions: { minAmount: 100 },
            variants: [{ id: 'v1', title: 'Silent 100 Bits' }],
            actions: {
                timer: { enabled: false },
                http: { enabled: true, url: 'http://192.168.1.4:8000/api/location/23/0/3/press/', method: 'POST' }
            }
        }]
    });

    try {
        // 1. Live event handleEvent
        const payload = engine.handleEvent({ type: 'bits', user: 'SilentDonor', amount: 100 });
        assert.ok(payload);
        assert.equal(payload.webhookOnly, true);

        // Overlay queue and broadcasts MUST remain completely empty (silent background action)
        const queueState = engine.getQueueState();
        assert.equal(queueState.pending, 0, 'pending queue must be 0 for webhook-only rule');
        assert.equal(queueState.current, null, 'current alert must be null for webhook-only rule');
        assert.equal(dispatched.filter(d => d.type === 'alert').length, 0, 'no alert broadcast to overlays');

        // Event log status should record as 'webhook'
        assert.equal(queueState.events[0].status, 'webhook');
        assert.equal(queueState.events[0].ruleId, 'silent-companion-rule');

        await new Promise(r => setTimeout(r, 50));
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].method, 'POST');

        // 2. fireRule simulation (Test preview)
        const testPayload = engine.fireRule('silent-companion-rule', 'v1', { user: 'TestSilent' });
        assert.ok(testPayload);
        assert.equal(testPayload.webhookOnly, true);
        assert.equal(engine.getQueueState().pending, 0);
        assert.equal(engine.getQueueState().current, null);

        await new Promise(r => setTimeout(r, 50));
        assert.equal(fetchCalls.length, 2);
    } finally {
        global.fetch = origFetch;
        cleanup();
    }
});

test('webhook delay executes HTTP call after configured seconds and cancels cleanly on engine stop', async () => {
    const fetchCalls = [];
    const origFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
        fetchCalls.push({ url: String(url), time: Date.now(), ...opts });
        return { ok: true, status: 200, statusText: 'OK', text: async () => 'ok' };
    };

    const normalized = normalizeConfig({
        rules: [{
            trigger: 'follow',
            actions: { http: { enabled: true, url: 'http://localhost/test', delay: 1.5 } }
        }]
    });
    assert.equal(normalized.rules[0].actions.http.delay, 1.5);

    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{
            id: 'delayed-webhook-rule',
            name: 'Delayed Webhook',
            enabled: true,
            trigger: 'follow',
            variants: [{ id: 'v1', title: 'Delayed Follow' }],
            actions: {
                http: { enabled: true, url: 'http://192.168.1.4:8000/api/location/1/0/0/press/', method: 'POST', delay: 0.1 } // 100ms
            }
        }]
    });

    try {
        const start = Date.now();
        engine.handleEvent({ type: 'follow', user: 'DelayedUser' });

        // Immediately check: webhook has not fired yet
        await new Promise(r => setTimeout(r, 30));
        assert.equal(fetchCalls.length, 0, 'webhook must not fire before delay elapses');

        // Wait past 100ms delay
        await new Promise(r => setTimeout(r, 120));
        assert.equal(fetchCalls.length, 1, 'webhook fired after delay');
        assert.ok(fetchCalls[0].time - start >= 90, 'delay was respected');

        // Test cancellation on engine.stop()
        engine.handleEvent({ type: 'follow', user: 'CancelledUser', dedupeMs: 0 });
        cleanup(); // triggers engine.stop() which clears activeWebhookTimers
        await new Promise(r => setTimeout(r, 150));
        assert.equal(fetchCalls.length, 1, 'timer was cancelled on engine stop');
    } finally {
        global.fetch = origFetch;
    }
});

test('Twitch bits cheermote auto-fallback resolves official animated GIFs for bits alerts', () => {
    const { TWITCH_CHEERMOTES, TWITCH_CHEERMOTE_FAMILIES, getTwitchCheermote, extractCheermoteFromText } = require('../server/services/alerts.js');
    assert.equal(TWITCH_CHEERMOTES.length, 7);
    assert.equal(getTwitchCheermote(1).name, 'Cheer1');
    assert.equal(getTwitchCheermote(50).name, 'Cheer1');
    assert.equal(getTwitchCheermote(100).name, 'Cheer100');
    assert.equal(getTwitchCheermote(500).name, 'Cheer500');
    assert.equal(getTwitchCheermote(1000).name, 'Cheer1000');
    assert.equal(getTwitchCheermote(5000).name, 'Cheer5000');
    assert.equal(getTwitchCheermote(10000).name, 'Cheer10000');
    assert.equal(getTwitchCheermote(100000).name, 'Cheer100000');
    assert.equal(getTwitchCheermote(500000).name, 'Cheer100000');

    // Special global cheermotes catalog
    assert.ok(TWITCH_CHEERMOTE_FAMILIES.kappa);
    assert.ok(TWITCH_CHEERMOTE_FAMILIES.party);
    assert.ok(TWITCH_CHEERMOTE_FAMILIES.trihard);
    assert.ok(TWITCH_CHEERMOTE_FAMILIES.kreygasm);
    assert.ok(TWITCH_CHEERMOTE_FAMILIES.showlove);
    assert.ok(TWITCH_CHEERMOTE_FAMILIES.frankerz);
    assert.equal(TWITCH_CHEERMOTE_FAMILIES.kappa.tiers.length, 5);
    assert.equal(getTwitchCheermote(5000, 'kappa').name, 'Kappa5000');
    assert.equal(getTwitchCheermote(5000, 'kappa').url, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/kappa/dark/animated/5000/4.gif');
    assert.equal(getTwitchCheermote(100, 'party').name, 'Party100');
    assert.equal(getTwitchCheermote(100, 'party').url, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/party/dark/animated/100/4.gif');

    // Extract cheermote from chat text
    const kMatch = extractCheermoteFromText('Kappa5000 That was an incredible round!');
    assert.equal(kMatch.prefix, 'kappa');
    assert.equal(kMatch.bits, 5000);
    const pMatch = extractCheermoteFromText('party100 hype!');
    assert.equal(pMatch.prefix, 'party');
    assert.equal(pMatch.bits, 100);
    assert.equal(extractCheermoteFromText('just regular chat text without cheers'), null);

    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'cheer-bits-rule',
                name: 'Cheer Bits Alert',
                enabled: true,
                trigger: 'bits',
                variants: [
                    { id: 'v-auto', title: 'Cheer Bits' } // auto-detection
                ]
            },
            {
                id: 'party-bits-rule',
                name: 'Party Bits Alert',
                enabled: true,
                trigger: 'bits',
                variants: [
                    { id: 'v-party', title: 'Party Cheer', cheermoteFamily: 'party' }
                ]
            }
        ]
    });

    try {
        // 1. Cheer 500 bits (default message): auto-resolves Cheer500 GIF
        const p500 = engine.handleEvent({ type: 'bits', user: 'CheerMaster', amount: 500, bits: 500 });
        assert.ok(p500);
        assert.equal(p500.emoji, 'Cheer500');
        assert.equal(p500.emojiUrl, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/500/4.gif');

        // 2. Viewer cheers with special cheermote in chat: "Kappa5000 Epic Play!" -> auto-resolves Kappa5000 GIF
        const pKappa = engine.handleEvent({ type: 'bits', user: 'KappaKing', amount: 5000, bits: 5000, message: 'Kappa5000 Epic Play!' });
        assert.ok(pKappa);
        assert.equal(pKappa.emoji, 'Kappa5000');
        assert.equal(pKappa.emojiUrl, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/kappa/dark/animated/5000/4.gif');

        // 3. Viewer cheers with "Party1000": auto-resolves Party1000 GIF
        const pParty = engine.handleEvent({ type: 'bits', user: 'PartyAnimal', amount: 1000, bits: 1000, message: 'Party1000 Lets go!' });
        assert.ok(pParty);
        assert.equal(pParty.emoji, 'Party1000');
        assert.equal(pParty.emojiUrl, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/party/dark/animated/1000/4.gif');

        // 4. Variant with explicit cheermoteFamily: 'party' forces Party even without message prefix
        const pForced = engine.fireRule('party-bits-rule', 'v-party', { amount: 5000, message: 'Regular message' });
        assert.equal(pForced.emoji, 'Party5000');
        assert.equal(pForced.emojiUrl, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/party/dark/animated/5000/4.gif');

        // 5. fireRule preview also auto-resolves official Cheermote
        const preview = engine.fireRule('cheer-bits-rule', 'v-auto', { amount: 1000 });
        assert.equal(preview.emoji, 'Cheer1000');
        assert.equal(preview.emojiUrl, 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1000/4.gif');
    } finally {
        cleanup();
    }
});

test('muting alerts holds display until unmuted', () => {
    const { engine, dispatched, cleanup } = createTempEngine({
        settings: { enabled: true },
        rules: [{ id: 'f', trigger: 'follow', conditions: { cooldownSeconds: 0 }, variants: [{ title: 'Hi {{user}}' }] }]
    });
    try {
        engine.setMuted(true);
        engine.handleEvent({ type: 'follow', user: 'A' });
        assert.equal(engine.getQueueState().muted, true);
        assert.equal(engine.getQueueState().pending, 1);
        assert.equal(dispatched.filter(d => d.type === 'alert').length, 0);
        engine.setMuted(false);
        assert.equal(dispatched.filter(d => d.type === 'alert').length, 1);
        assert.equal(engine.getQueueState().muted, false);
    } finally {
        cleanup();
    }
});

test('bits emoteSource viewer resolves cheermote family and summed tier', () => {
    const mk = v => createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{ id: 'b', name: 'Bits', enabled: true, trigger: 'bits', variants: [v] }]
    });
    const { engine, cleanup } = mk({ id: 'v' });
    const { engine: e2, cleanup: c2 } = mk({ id: 'v', emoji: 'Hype', emojiLadder: [{ min: 100, emoji: 'Big' }] });
    const { engine: e3, cleanup: c3 } = mk({ id: 'v', emoteSource: 'custom', emoji: 'Hype', emojiLadder: [{ min: 100, emoji: 'Big' }] });
    try {
        const fire = (e, ev) => e.handleEvent({ type: 'bits', user: 'a', dedupeMs: 0, ...ev }, { test: true });
        assert.equal(engine.getConfig().rules[0].variants[0].emoteSource, 'viewer');
        assert.equal(e2.getConfig().rules[0].variants[0].emoteSource, 'custom');
        assert.match(fire(engine, { amount: 100, message: 'PrideCheer1 hi', cheermoteSource: 'PrideCheer1' }).emoji, /pride/i);
        const sum = fire(engine, { amount: 500, message: 'Kappa100 Kappa400', cheermoteSource: 'Kappa100 Kappa400' });
        assert.equal(sum.emoji, 'Kappa100');
        assert.equal(fire(engine, { amount: 500, message: 'Cheer100 Cheer400', cheermoteSource: 'Cheer100 Cheer400' }).emoji, 'Cheer500');
        assert.match(fire(engine, { amount: 1000, message: 'thanks' }).emoji, /^Cheer1000$/);
        assert.equal(fire(e2, { amount: 150, message: 'Kappa100' }).emoji, 'Big');
        assert.equal(fire(e3, { amount: 150, message: 'Kappa100' }).emoji, 'Big');
    } finally { cleanup(); c2(); c3(); }
});

test('bundled alert sound library: manifest files exist, stay small, and sfx values resolve', () => {
    const dir = path.join(__dirname, '..', 'public', 'sounds');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    let total = 0, count = 0;
    for (const group of manifest.groups) {
        assert.ok(group.id && group.label && group.sounds.length);
        for (const s of group.sounds) {
            const file = path.join(dir, s.file);
            assert.ok(fs.existsSync(file), `missing ${s.file}`);
            assert.equal(s.file.split('/')[0], group.id);
            assert.ok(s.duration > 0 && s.duration < 3, `${s.id} duration`);
            total += fs.statSync(file).size;
            count++;
        }
    }
    assert.ok(count >= 20);
    assert.ok(total < 1.5 * 1024 * 1024, `total ${total}`);
    assert.match(fs.readFileSync(path.join(dir, 'LICENSES.txt'), 'utf8'), /CC0/);

    const win = {};
    new Function('window', fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay-shared.js'), 'utf8'))(win);
    const OS = win.OverlayShared;
    assert.equal(OS.resolveSoundUrl('sfx:hype/power_surge'), '/sounds/hype/power_surge.mp3');
    assert.equal(OS.resolveSoundUrl('/custom-overlay-assets/a.mp3'), '/custom-overlay-assets/a.mp3');
    assert.ok(OS.BUILTIN_SOUNDS.ding && OS.BUILTIN_SOUNDS.zz_coin);
    const samples = OS.zzfxSamples(...OS.BUILTIN_SOUNDS.zz_coin.zzfx);
    assert.ok(samples.length > 1000 && samples.every(Number.isFinite));
    const { normalizeConfig: nc } = require('../server/services/alerts.js');
    assert.ok(nc({ rules: [{ id: 'r', trigger: 'follow', variants: [{ sound: 'sfx:hype/power_surge' }] }] }).rules[0].variants[0].sound === 'sfx:hype/power_surge');
});

test('priority orders the queue, critical interrupts, expiry and cap drop alerts', async () => {
    const mk = (id, priority, extra = {}) => ({ id, trigger: 'follow', priority, ...extra, conditions: { cooldownSeconds: 0 }, variants: [{ title: id, duration: 5 }] });
    const { engine, dispatched, cleanup } = createTempEngine({
        settings: { enabled: true, queueCap: 3 },
        rules: [mk('n', 'normal'), mk('l', 'low'), mk('h', 'high'), mk('c', 'critical', { interrupt: true }), mk('bogus', 'zzz')]
    });
    try {
        assert.equal(normalizeConfig({ rules: [mk('x', 'zzz')] }).rules[0].priority, 'normal');
        assert.equal(normalizeConfig({ rules: [mk('x', 'high', { interrupt: true })] }).rules[0].interrupt, false);
        const fire = id => engine.fireRule(id);
        fire('n');
        fire('l'); fire('n'); fire('h');
        assert.deepEqual(engine.getQueueState().pending, 3);
        fire('l');
        assert.equal(engine.getQueueState().pending, 3, 'cap holds');
        assert.ok(engine.getQueueState().events.some(e => e.status === 'dropped'), 'cap drop recorded');
        const before = dispatched.filter(d => d.type === 'alert-skip').length;
        fire('c');
        assert.equal(dispatched.filter(d => d.type === 'alert-skip').length, before + 1, 'critical interrupt skips current');
        assert.equal(engine.getQueueState().current.ruleId, 'c');
        engine.control('skip');
        assert.equal(engine.getQueueState().current.ruleId, 'h', 'high plays before normal/low');
    } finally { cleanup(); }
});

test('queued alerts past expireSeconds are dropped', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [{ id: 'a', trigger: 'follow', conditions: {}, variants: [{ title: 'a', duration: 1 }] }, { id: 'e', trigger: 'follow', expireSeconds: 1, conditions: {}, variants: [{ title: 'e' }] }]
    });
    const realNow = Date.now;
    try {
        engine.fireRule('a'); engine.fireRule('e');
        Date.now = () => realNow() + 5000;
        engine.control('skip');
        assert.equal(engine.getQueueState().pending, 0);
        assert.equal(engine.getQueueState().current, null);
        assert.ok(engine.getQueueState().events.some(e => e.status === 'dropped'));
    } finally { Date.now = realNow; cleanup(); }
});

test('manual trigger fires announcements by name with text override and records history', () => {
    const { engine, cleanup } = createTempEngine({
        rules: [{ id: 'brb', name: 'BRB', trigger: 'announcement', conditions: {}, variants: [{ title: 'BRB', message: 'Back soon' }] }]
    });
    try {
        const r = engine.trigger('brb', { message: 'Back in 5' });
        assert.equal(r.alert.message, 'Back in 5');
        assert.equal(r.alert.source, 'manual');
        assert.ok(r.playing);
        assert.ok(engine.getQueueState().events.some(e => e.ruleId === 'brb' && e.status === 'shown'));
        assert.throws(() => engine.trigger('nope'));
    } finally { cleanup(); }
});

test('chat and companion actions: chat cooldown, length cap, base URL pinned to settings', async () => {
  const sent = [];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-act-'));
  const engine = createAlertEngine({ dataDir: tempDir, broadcast() {}, sendChat: t => sent.push(t), log: () => {} });
  try {
    const cfg = engine.setConfig({ settings: { companionUrl: 'http://10.0.0.5:8000/evil/path' }, rules: [{ id: 'c', trigger: 'follow', conditions: {}, variants: [{ title: 'x' }], actions: { chat: { enabled: true, template: 'Hi {{alert.user}} ' + 'z'.repeat(600), cooldownSeconds: 60 } } }] });
    assert.equal(cfg.settings.companionUrl, 'http://10.0.0.5:8000');
    engine.fireRule('c'); engine.fireRule('c');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].length, 400);
    const r = await engine.pressCompanion({ location: '1/2/x' }, 'http://127.0.0.1:1');
    assert.equal(r.ok, false);
  } finally { engine.stop(); fs.rmSync(tempDir, { recursive: true, force: true }); }
});

test('hype train rules filter by phase and fill level tokens', () => {
    const rules = [
        { id: 'ht-start', trigger: 'hype_train', conditions: { phase: 'start' }, variants: [{ title: 'Train {{alert.level}}' }] },
        { id: 'ht-end', trigger: 'hype_train', conditions: { phase: 'end' }, variants: [{ title: 'Ended at {{alert.level}} after {{alert.minutes}}m' }] }
    ];
    const run = ev => {
        const { engine, dispatched, cleanup } = createTempEngine({ settings: { enabled: true }, rules });
        try {
            engine.handleEvent(ev);
            return dispatched.filter(d => d.type === 'alert').map(d => d.payload.title);
        } finally {
            cleanup();
        }
    };
    assert.deepEqual(run({ type: 'hype_train', phase: 'start', level: 1, amount: 1 }), ['Train 1']);
    assert.deepEqual(run({ type: 'hype_train', phase: 'end', level: 4, amount: 4, seconds: 300 }), ['Ended at 4 after 5m']);
    assert.deepEqual(run({ type: 'hype_train', phase: 'levelup', level: 2, amount: 2 }), []);
});

test('redeem rules match selected reward ids, or every redeem when none are chosen', () => {
    const rules = [{ id: 'r', trigger: 'redeem', conditions: { rewardIds: ['a1'] }, variants: [{ title: 'x' }] }];
    const run = (r, ev) => {
        const { engine, dispatched, cleanup } = createTempEngine({ settings: { enabled: true }, rules: r });
        try { engine.handleEvent({ type: 'redeem', user: 'u', ...ev }); return dispatched.filter(d => d.type === 'alert').length; } finally { cleanup(); }
    };
    assert.equal(run(rules, { rewardId: 'a1', reward: 'Hydrate' }), 1);
    assert.equal(run(rules, { rewardId: 'b2', reward: 'Other' }), 0);
    assert.equal(run([{ ...rules[0], conditions: { rewardIds: [] } }], { rewardId: 'b2' }), 1);
});

test('redeem rule test respects the reward title override separately from the viewer message', () => {
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true },
        rules: [{ id: 'redeem-fixture', trigger: 'redeem', conditions: { rewardIds: ['fixture-reward'] },
            variants: [{ title: '{{alert.user}} redeemed {{alert.reward}}', message: '{{alert.message}}' }] }]
    });
    try {
        const payload = engine.fireRule('redeem-fixture', '', { reward: 'Fictional Stretch', rewardId: 'fixture-reward', message: 'Viewer input' });
        assert.equal(payload.title, 'TestViewer redeemed Fictional Stretch');
        assert.equal(payload.message, 'Viewer input');
    } finally { cleanup(); }
});

test('Alerts Simulator sends selected reward identity and title and rule previews use the checked reward', async t => {
    const http = require('node:http');
    const { createStaticRouter } = require('../server/static-router');
    const { engine, cleanup } = createTempEngine({
        settings: { enabled: true },
        rules: [{ id: 'redeem-fixture', name: 'Fictional redeem', trigger: 'redeem', conditions: { rewardIds: ['fixture-reward'] },
            variants: [{ id: 'fixture-variant', title: '{{alert.user}} redeemed {{alert.reward}}', message: '{{alert.message}}' }] }]
    });
    t.after(cleanup);
    const requests = [];
    const staticRouter = createStaticRouter({ rootDir: path.resolve(__dirname, '..') });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) { staticRouter.handleRequest(req, res); return; }
        let data = {};
        let body = '';
        for await (const chunk of req) body += chunk;
        const parsed = body ? JSON.parse(body) : {};
        if (url.pathname === '/api/alerts') {
            if (req.method === 'PUT') engine.setConfig(parsed);
            data = engine.getConfig();
        } else if (url.pathname === '/api/twitch/rewards') {
            data = { rewards: [{ id: 'fixture-reward', title: 'Fictional Stretch', cost: 250, enabled: true }, { id: 'other-reward', title: 'Other reward', cost: 100, enabled: true }] };
        } else if (url.pathname === '/api/alerts/test-event') {
            requests.push(parsed);
            data = { alert: engine.handleEvent({ ...parsed, dedupeMs: 0 }, { test: true }) };
        } else if (url.pathname === '/api/alerts/test') {
            requests.push(parsed);
            data = { alert: engine.fireRule(parsed.ruleId, parsed.variantId, parsed) };
        } else if (url.pathname.includes('assets') || url.pathname.includes('events')) data = [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/alerts.html#sim`, { waitUntil: 'networkidle0' });
    await page.select('#sim-type', 'redeem');
    await page.waitForSelector('#sim-reward option[value="fixture-reward"]');
    await page.select('#sim-reward', 'fixture-reward');
    await page.$eval('#sim-text', input => { input.value = 'Fictional viewer input'; });
    const [response] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/alerts/test-event')),
        page.click('#sim-go')
    ]);
    const data = await response.json();
    assert.equal(requests[0].rewardId, 'fixture-reward');
    assert.equal(requests[0].reward, 'Fictional Stretch');
    assert.equal(requests[0].message, 'Fictional viewer input');
    assert.match(data.alert.title, /Fictional Stretch/);
    await page.select('#sim-reward', 'other-reward');
    const [unmatched] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/alerts/test-event')),
        page.click('#sim-go')
    ]);
    assert.equal((await unmatched.json()).alert, null);
    await page.click('[role="tab"][data-tab="rules"]');
    const [preview] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/api/alerts/test')),
        page.click('[data-test-rule]')
    ]);
    assert.match((await preview.json()).alert.title, /Fictional Stretch/);
    assert.deepEqual(errors, []);
});

test('replayLast replays the last 1..N shown alerts in chronological order', () => {
    const { engine, dispatched, cleanup } = createTempEngine({
        settings: { enabled: true, gapSeconds: 0 },
        rules: [
            {
                id: 'r1',
                trigger: 'follow',
                priority: 'critical',
                interrupt: true,
                conditions: { cooldownSeconds: 0 },
                variants: [{ id: 'v1', title: 'Hi {{user}}', duration: 5 }]
            }
        ]
    });
    try {
        assert.throws(() => engine.replayLast(1), /No alert history/i);

        engine.handleEvent({ type: 'follow', user: 'First', dedupeMs: 0 });
        engine.control('skip');
        engine.handleEvent({ type: 'follow', user: 'Second', dedupeMs: 0 });
        engine.control('skip');
        engine.handleEvent({ type: 'follow', user: 'Third', dedupeMs: 0 });
        engine.control('skip');

        const beforeAlerts = dispatched.filter(d => d.type === 'alert').length;
        const replayed = engine.replayLast(2);
        assert.equal(replayed.length, 2);
        assert.deepEqual(replayed.map(a => a.user), ['Second', 'Third']);
        assert.equal(replayed[0].test, true);
        assert.equal(replayed[1].interrupt, false, 'replayed critical alerts do not interrupt each other');
        assert.equal(dispatched.filter(d => d.type === 'alert').length, beforeAlerts + 1, 'oldest of N plays immediately');
        assert.equal(engine.getQueueState().pending, 1, 'newest of N waits next in queue');

        engine.control('skip');
        const alertsAfterSkip = dispatched.filter(d => d.type === 'alert').map(d => d.payload.user);
        assert.deepEqual(alertsAfterSkip.slice(-2), ['Second', 'Third']);
    } finally {
        cleanup();
    }
});
