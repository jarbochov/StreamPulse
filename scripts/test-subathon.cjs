'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createSubathonService } = require('../server/services/subathon');
const { createTimerService } = require('../server/services/timers');

test('Subathon Automation Engine: Rules, Exact Amounts, Multipliers, Safety Caps & Undo', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-subathon-test-'));

    let mockConfig = { subathon_enabled: true };
    const broadcasts = [];

    const timerService = createTimerService({
        dataDir: tempDir,
        broadcastToOverlays: (type, payload) => broadcasts.push({ type, payload })
    });

    // Create target countdown timer for subathon
    const initialTimer = timerService.upsertTimer({
        id: 'subathon',
        label: 'Marathon Timer',
        kind: 'countdown',
        mode: 'duration',
        minutes: 60 // 1 hour initial
    });
    assert.equal(initialTimer.id, 'subathon');

    const subathonService = createSubathonService({
        dataDir: tempDir,
        getConfig: () => mockConfig,
        timerService,
        broadcastToOverlays: (type, payload) => broadcasts.push({ type, payload })
    });

    await t.test('1. Module enable gate', () => {
        assert.equal(subathonService.isModuleEnabled(), true);
        assert.equal(subathonService.isSubathonActive(), true);

        // Turn module off in system config
        mockConfig.subathon_enabled = false;
        assert.equal(subathonService.isModuleEnabled(), false);
        assert.equal(subathonService.isSubathonActive(), false);
        const disabledRes = subathonService.processEvent({ type: 'sub', tier: '1000' });
        assert.equal(disabledRes.applied, false);
        assert.equal(disabledRes.reason, 'disabled');

        // Turn back on
        mockConfig.subathon_enabled = true;
        assert.equal(subathonService.isSubathonActive(), true);
    });

    await t.test('2. Subscription additions: Tier 1, Tier 2, Tier 3, and Gift Bomb', () => {
        // Tier 1 sub (default 120s = 2m)
        const sub1 = subathonService.processEvent({ type: 'sub', user: 'ViewerA', tier: '1000' });
        assert.equal(sub1.applied, true);
        assert.equal(sub1.record.deltaSeconds, 120);

        // Tier 3 sub (default 600s = 10m)
        const sub3 = subathonService.processEvent({ type: 'sub', user: 'WhaleUser', tier: '3000' });
        assert.equal(sub3.applied, true);
        assert.equal(sub3.record.deltaSeconds, 600);

        // 5 Gift Subs (5 * 120s = 600s)
        const giftRes = subathonService.processEvent({ type: 'gift', user: 'GenerousDonor', count: 5 });
        assert.equal(giftRes.applied, true);
        assert.equal(giftRes.record.deltaSeconds, 600);
    });

    await t.test('3. Bits & Cheers with threshold gate', () => {
        // Below min bits (default 100)
        const lowBits = subathonService.processEvent({ type: 'bits', user: 'PennyUser', amount: 50 });
        assert.equal(lowBits.applied, false);
        assert.equal(lowBits.reason, 'below_min_bits');

        // 500 bits (5 * 30s = 150s)
        const goodBits = subathonService.processEvent({ type: 'bits', user: 'CheerFan', amount: 500 });
        assert.equal(goodBits.applied, true);
        assert.equal(goodBits.record.deltaSeconds, 150);
    });

    await t.test('4. Donations: Standard dollar rate vs Specific Exact Amounts', () => {
        // Standard $10 donation ($10 * 60s/$ = 600s)
        const standardTip = subathonService.processEvent({ type: 'donation', user: 'RegularTipper', amount: 10.00 });
        assert.equal(standardTip.applied, true);
        assert.equal(standardTip.record.deltaSeconds, 600);

        // Exact amount rule: $4.20 triggers Blaze It (420 seconds) instead of $4.20 * 60 (252s)
        const exactTip = subathonService.processEvent({ type: 'donation', user: 'MemeLord', amount: 4.20 });
        assert.equal(exactTip.applied, true);
        assert.equal(exactTip.record.deltaSeconds, 420);
        assert.equal(exactTip.record.label, '$4.20 (Blaze It)');

        // Below minimum donation ($0.50 < $1.00)
        const microTip = subathonService.processEvent({ type: 'donation', user: 'MicroTipper', amount: 0.50 });
        assert.equal(microTip.applied, false);
        assert.equal(microTip.reason, 'below_min_amount');
    });

    await t.test('5. Toggling individual event channels (e.g. disabling subs, enabling follows)', () => {
        subathonService.updateConfig({
            rules: {
                subs: { enabled: false },
                follows: { enabled: true, seconds: 20 }
            }
        });

        // Sub now ignored
        const subIgnored = subathonService.processEvent({ type: 'sub', user: 'IgnoredSub', tier: '1000' });
        assert.equal(subIgnored.applied, false);
        assert.equal(subIgnored.reason, 'subs_disabled');

        // Follow now works
        const followRes = subathonService.processEvent({ type: 'follow', user: 'NewFollower' });
        assert.equal(followRes.applied, true);
        assert.equal(followRes.record.deltaSeconds, 20);

        // Re-enable subs
        subathonService.updateConfig({ rules: { subs: { enabled: true } } });
    });

    await t.test('6. Boost Period 2x Multiplier', () => {
        // Activate 2x multiplier
        subathonService.setMultiplier(2.0, 30);
        assert.equal(subathonService.getRuleSummary().boostActive, true);
        assert.equal(subathonService.getRuleSummary().happyHourActive, true);
        assert.equal(subathonService.getRuleSummary().multiplier, '2x');

        // Tier 1 sub normally 120s -> now 240s!
        const boostedSub = subathonService.processEvent({ type: 'sub', user: 'BoostUser', tier: '1000' });
        assert.equal(boostedSub.applied, true);
        assert.equal(boostedSub.record.deltaSeconds, 240);
        assert.equal(boostedSub.record.multiplier, 2.0);

        // Clear multiplier
        subathonService.clearMultiplier();
        assert.equal(subathonService.getRuleSummary().boostActive, false);
        assert.equal(subathonService.getRuleSummary().happyHourActive, false);
    });

    await t.test('7. Safety ceiling (hard cap clamp)', () => {
        // Set hard ceiling to 7,200 seconds (2 hours)
        subathonService.updateConfig({
            caps: { maxRemainingSeconds: 7200 }
        });

        // Target timer already has remaining time. Add massive gift bomb of 100 subs (12,000s)
        const cappedRes = subathonService.processEvent({ type: 'gift', user: 'GiganticWhale', count: 100 });
        assert.equal(cappedRes.applied, true);
        assert.equal(cappedRes.record.capped, true);
        assert.ok(cappedRes.record.deltaSeconds < 12000, 'Delta seconds must be clamped');

        // Current timer should now be exactly at or within ceiling
        const snapshot = timerService.getTimerOrThrow('subathon');
        const remainingSec = (snapshot.remainingMs || 0) / 1000;
        assert.ok(remainingSec <= 7200);

        // Further addition when at cap should reject
        const blockedRes = subathonService.processEvent({ type: 'sub', user: 'ExtraUser', tier: '1000' });
        assert.equal(blockedRes.applied, false);
        assert.equal(blockedRes.reason, 'max_cap_reached');
    });

    await t.test('8. Instant Undo Last Event', () => {
        const stateBefore = subathonService.getStateSnapshot();
        const timerBefore = timerService.getTimerOrThrow('subathon');
        const totalBefore = stateBefore.totalTimeAddedSeconds;

        // Reset cap for test
        subathonService.updateConfig({ caps: { maxRemainingSeconds: 0 } });

        // Add 500 bits (+150s)
        const bitEvent = subathonService.processEvent({ type: 'bits', user: 'MistakeUser', amount: 500 });
        assert.equal(bitEvent.applied, true);

        // Undo
        const undoRes = subathonService.undoLast();
        assert.equal(undoRes.ok, true);
        assert.equal(undoRes.undone.deltaSeconds, 150);
        assert.equal(undoRes.undone.undone, true);

        const stateAfter = subathonService.getStateSnapshot();
        assert.equal(stateAfter.totalTimeAddedSeconds, totalBefore);
    });

    await t.test('9. Human-readable rule summary and dynamic parts', () => {
        const summary = subathonService.getRuleSummary();
        assert.ok(summary.summary.includes('1 Sub ='));
        assert.ok(summary.summary.includes('$1 ='));
        assert.ok(summary.subTier1Formatted.includes('2m'));
    });

    await t.test('10. Simulator & event alias normalization', () => {
        // sub_t2 alias via { event: 'sub_t2' }
        const t2Res = subathonService.processEvent({ event: 'sub_t2', user: 'Tier2Fan' });
        assert.equal(t2Res.applied, true);
        assert.equal(t2Res.record.deltaSeconds, 240);

        // gift_bomb alias via { event: 'gift_bomb', count: 5 }
        const bombRes = subathonService.processEvent({ event: 'gift_bomb', count: 5, user: 'BombDonor' });
        assert.equal(bombRes.applied, true);
        assert.equal(bombRes.record.deltaSeconds, 600);

        // don_exact alias via { event: 'don_exact' } ($4.20)
        const donExactRes = subathonService.processEvent({ event: 'don_exact', user: 'ExactDonor' });
        assert.equal(donExactRes.applied, true);
        assert.equal(donExactRes.record.deltaSeconds, 420);
        assert.ok(donExactRes.record.label.includes('Blaze It'));

        // raid_25 alias via { event: 'raid_25' }
        const raidRes = subathonService.processEvent({ event: 'raid_25', user: 'RaidBoss' });
        assert.equal(raidRes.applied, true);
        assert.equal(raidRes.record.deltaSeconds, 30 + 25 * 2); // 80s
    });

    await t.test('11. Subathon Theme schema, normalization and persistence', () => {
        const snap = subathonService.getConfigSnapshot();
        assert.ok(snap.theme, 'Config snapshot must include theme');
        assert.equal(snap.theme.preset, 'dark');
        assert.equal(snap.theme.layout, 'grid');

        // Update theme
        const updated = subathonService.updateConfig({
            theme: {
                preset: 'arcade',
                layout: 'ticker',
                columns: 3,
                titleText: 'Marathon Goals',
                accentColor: '#ff007f',
                cardRadius: 16
            }
        });
        assert.equal(updated.theme.preset, 'arcade');
        assert.equal(updated.theme.layout, 'ticker');
        assert.equal(updated.theme.columns, 3);
        assert.equal(updated.theme.titleText, 'Marathon Goals');
        assert.equal(updated.theme.accentColor, '#ff007f');
        assert.equal(updated.theme.cardRadius, 16);
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
});
