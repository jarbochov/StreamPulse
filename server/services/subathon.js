'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SUBATHON_THEME = {
    preset: 'dark', // 'dark' | 'glass' | 'arcade' | 'light' | 'minimal'
    layout: 'grid', // 'grid' | 'compact' | 'ticker'
    columns: 0, // 0 = auto-fit, 2, 3, 4
    scale: 1.0,
    showHeader: true,
    titleText: 'Subathon Rates',
    headerSize: '1.15rem',
    valueSize: '1.35rem',
    valueWeight: '800',
    fontFamily: '',
    headerFontFamily: '',
    showTotalBadge: true,
    showBoostBanner: true,
    showCardIcons: true,
    showNotes: true,
    showSubs: true,
    showDonations: true,
    showBits: true,
    showFollows: true,
    showRaids: true,
    cardBackground: 'rgba(18, 24, 38, 0.88)',
    cardBorder: 'rgba(255, 255, 255, 0.12)',
    cardRadius: 10,
    textColor: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.7)',
    accentColor: '#3b82f6',
    boostBannerColor: '#f59e0b'
};

const DEFAULT_SUBATHON_CONFIG = {
    enabled: true,
    targetTimerId: 'subathon',
    theme: cloneJson(DEFAULT_SUBATHON_THEME),
    rules: {
        subs: {
            enabled: true,
            tier1Seconds: 120,
            tier2Seconds: 240,
            tier3Seconds: 600,
            primeMode: 'tier1',
            primeSeconds: 120,
            giftSecondsPerSub: 120,
            resubBonusPerMonth: 0
        },
        bits: {
            enabled: true,
            minBits: 100,
            secondsPer100Bits: 30
        },
        donations: {
            enabled: true,
            minAmount: 1.00,
            secondsPerDollar: 60,
            exactAmounts: [
                { amount: 4.20, seconds: 420, label: 'Blaze It' },
                { amount: 13.37, seconds: 900, label: 'Leet Bonus' }
            ]
        },
        follows: {
            enabled: false,
            seconds: 15,
            maxPerHour: 40
        },
        raids: {
            enabled: true,
            minViewers: 5,
            baseSeconds: 30,
            secondsPerViewer: 2,
            maxRaidSeconds: 600
        },
        channelPoints: {
            enabled: false,
            rewards: []
        }
    },
    caps: {
        maxRemainingSeconds: 43200, // 12 hours hard ceiling (0 = no cap)
        cooldownPerUserSeconds: 0
    },
    multiplier: {
        active: false,
        factor: 2.0,
        expiresAt: null
    }
};

const DEFAULT_SUBATHON_STATE = {
    totalTimeAddedSeconds: 0,
    totalSubs: 0,
    totalBits: 0,
    totalDonations: 0,
    totalFollows: 0,
    totalRaids: 0,
    history: []
};

function cloneJson(val) {
    return JSON.parse(JSON.stringify(val));
}

function formatDurationSeconds(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const remS = s % 60;
    if (h > 0) return remS > 0 ? `${h}h ${m}m ${remS}s` : `${h}h ${m}m`;
    if (m > 0) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
    return `${remS}s`;
}

function normalizeSubathonConfig(raw = {}, base = DEFAULT_SUBATHON_CONFIG) {
    const cfg = cloneJson(base);
    if (raw.enabled !== undefined) cfg.enabled = Boolean(raw.enabled);
    if (raw.targetTimerId !== undefined) {
        cfg.targetTimerId = String(raw.targetTimerId || '').trim().toLowerCase().slice(0, 60) || 'subathon';
    }

    if (raw.rules && typeof raw.rules === 'object') {
        const r = raw.rules;
        if (r.subs) {
            if (r.subs.enabled !== undefined) cfg.rules.subs.enabled = r.subs.enabled !== false;
            if (r.subs.tier1Seconds !== undefined) cfg.rules.subs.tier1Seconds = Math.max(0, Number(r.subs.tier1Seconds) || 0);
            if (r.subs.tier2Seconds !== undefined) cfg.rules.subs.tier2Seconds = Math.max(0, Number(r.subs.tier2Seconds) || 0);
            if (r.subs.tier3Seconds !== undefined) cfg.rules.subs.tier3Seconds = Math.max(0, Number(r.subs.tier3Seconds) || 0);
            if (r.subs.primeMode !== undefined) cfg.rules.subs.primeMode = ['tier1', 'custom', 'disabled'].includes(r.subs.primeMode) ? r.subs.primeMode : 'tier1';
            if (r.subs.primeSeconds !== undefined) cfg.rules.subs.primeSeconds = Math.max(0, Number(r.subs.primeSeconds) || 0);
            if (r.subs.giftSecondsPerSub !== undefined) cfg.rules.subs.giftSecondsPerSub = Math.max(0, Number(r.subs.giftSecondsPerSub) || 0);
            if (r.subs.resubBonusPerMonth !== undefined) cfg.rules.subs.resubBonusPerMonth = Math.max(0, Number(r.subs.resubBonusPerMonth) || 0);
        }
        if (r.bits) {
            if (r.bits.enabled !== undefined) cfg.rules.bits.enabled = r.bits.enabled !== false;
            if (r.bits.minBits !== undefined) cfg.rules.bits.minBits = Math.max(0, Number(r.bits.minBits) || 0);
            if (r.bits.secondsPer100Bits !== undefined) cfg.rules.bits.secondsPer100Bits = Math.max(0, Number(r.bits.secondsPer100Bits) || 0);
        }
        if (r.donations) {
            if (r.donations.enabled !== undefined) cfg.rules.donations.enabled = r.donations.enabled !== false;
            if (r.donations.minAmount !== undefined) cfg.rules.donations.minAmount = Math.max(0, Number(r.donations.minAmount) || 0);
            if (r.donations.secondsPerDollar !== undefined) cfg.rules.donations.secondsPerDollar = Math.max(0, Number(r.donations.secondsPerDollar) || 0);
            if (Array.isArray(r.donations.exactAmounts)) {
                cfg.rules.donations.exactAmounts = r.donations.exactAmounts.map(ea => ({
                    amount: Math.max(0, Number(ea.amount) || 0),
                    seconds: Math.round(Number(ea.seconds) || 0),
                    label: String(ea.label || '').slice(0, 60)
                })).filter(ea => ea.amount > 0);
            }
        }
        if (r.follows) {
            if (r.follows.enabled !== undefined) cfg.rules.follows.enabled = r.follows.enabled === true;
            if (r.follows.seconds !== undefined) cfg.rules.follows.seconds = Math.max(0, Number(r.follows.seconds) || 0);
            if (r.follows.maxPerHour !== undefined) cfg.rules.follows.maxPerHour = Math.max(0, Number(r.follows.maxPerHour) || 0);
        }
        if (r.raids) {
            if (r.raids.enabled !== undefined) cfg.rules.raids.enabled = r.raids.enabled !== false;
            if (r.raids.minViewers !== undefined) cfg.rules.raids.minViewers = Math.max(0, Number(r.raids.minViewers) || 0);
            if (r.raids.baseSeconds !== undefined) cfg.rules.raids.baseSeconds = Math.max(0, Number(r.raids.baseSeconds) || 0);
            if (r.raids.secondsPerViewer !== undefined) cfg.rules.raids.secondsPerViewer = Math.max(0, Number(r.raids.secondsPerViewer) || 0);
            if (r.raids.maxRaidSeconds !== undefined) cfg.rules.raids.maxRaidSeconds = Math.max(0, Number(r.raids.maxRaidSeconds) || 0);
        }
        if (r.channelPoints) {
            if (r.channelPoints.enabled !== undefined) cfg.rules.channelPoints.enabled = r.channelPoints.enabled === true;
            if (Array.isArray(r.channelPoints.rewards)) {
                cfg.rules.channelPoints.rewards = r.channelPoints.rewards.map(rw => ({
                    rewardTitle: String(rw.rewardTitle || '').trim().slice(0, 100),
                    seconds: Math.round(Number(rw.seconds) || 0)
                })).filter(rw => rw.rewardTitle);
            }
        }
    }

    if (raw.caps && typeof raw.caps === 'object') {
        if (raw.caps.maxRemainingSeconds !== undefined) cfg.caps.maxRemainingSeconds = Math.max(0, Number(raw.caps.maxRemainingSeconds) || 0);
        if (raw.caps.cooldownPerUserSeconds !== undefined) cfg.caps.cooldownPerUserSeconds = Math.max(0, Number(raw.caps.cooldownPerUserSeconds) || 0);
    }

    if (raw.multiplier && typeof raw.multiplier === 'object') {
        if (raw.multiplier.active !== undefined) cfg.multiplier.active = raw.multiplier.active === true;
        if (raw.multiplier.factor !== undefined) cfg.multiplier.factor = Math.max(1, Math.min(10, Number(raw.multiplier.factor) || 2.0));
        if (raw.multiplier.expiresAt !== undefined) cfg.multiplier.expiresAt = raw.multiplier.expiresAt ? String(raw.multiplier.expiresAt) : null;
    }

    if (raw.theme && typeof raw.theme === 'object') {
        const t = raw.theme;
        if (t.preset !== undefined) cfg.theme.preset = String(t.preset).toLowerCase();
        if (t.layout !== undefined) cfg.theme.layout = String(t.layout).toLowerCase();
        if (t.columns !== undefined) cfg.theme.columns = Math.max(0, parseInt(t.columns, 10) || 0);
        if (t.scale !== undefined) cfg.theme.scale = Math.max(0.5, Math.min(3.0, parseFloat(t.scale) || 1.0));
        if (t.showHeader !== undefined) cfg.theme.showHeader = t.showHeader !== false;
        if (t.titleText !== undefined) cfg.theme.titleText = String(t.titleText || '').slice(0, 100);
        if (t.headerSize !== undefined) cfg.theme.headerSize = String(t.headerSize || '').slice(0, 30);
        if (t.valueSize !== undefined) cfg.theme.valueSize = String(t.valueSize || '').slice(0, 30);
        if (t.valueWeight !== undefined) cfg.theme.valueWeight = String(t.valueWeight || '').slice(0, 20);
        if (t.fontFamily !== undefined) cfg.theme.fontFamily = String(t.fontFamily || '').slice(0, 100);
        if (t.headerFontFamily !== undefined) cfg.theme.headerFontFamily = String(t.headerFontFamily || '').slice(0, 100);
        if (t.showTotalBadge !== undefined) cfg.theme.showTotalBadge = t.showTotalBadge !== false;
        if (t.showBoostBanner !== undefined) cfg.theme.showBoostBanner = t.showBoostBanner !== false;
        if (t.showCardIcons !== undefined) cfg.theme.showCardIcons = t.showCardIcons !== false;
        if (t.showNotes !== undefined) cfg.theme.showNotes = t.showNotes !== false;
        if (t.showSubs !== undefined) cfg.theme.showSubs = t.showSubs !== false;
        if (t.showDonations !== undefined) cfg.theme.showDonations = t.showDonations !== false;
        if (t.showBits !== undefined) cfg.theme.showBits = t.showBits !== false;
        if (t.showFollows !== undefined) cfg.theme.showFollows = t.showFollows !== false;
        if (t.showRaids !== undefined) cfg.theme.showRaids = t.showRaids !== false;
        if (t.cardBackground !== undefined) cfg.theme.cardBackground = String(t.cardBackground || '').slice(0, 80);
        if (t.cardBorder !== undefined) cfg.theme.cardBorder = String(t.cardBorder || '').slice(0, 80);
        if (t.cardRadius !== undefined) cfg.theme.cardRadius = Math.max(0, Math.min(50, parseInt(t.cardRadius, 10) || 0));
        if (t.textColor !== undefined) cfg.theme.textColor = String(t.textColor || '').slice(0, 80);
        if (t.textMuted !== undefined) cfg.theme.textMuted = String(t.textMuted || '').slice(0, 80);
        if (t.accentColor !== undefined) cfg.theme.accentColor = String(t.accentColor || '').slice(0, 80);
        if (t.boostBannerColor !== undefined) cfg.theme.boostBannerColor = String(t.boostBannerColor || '').slice(0, 80);
    }

    return cfg;
}

function createSubathonService({
    dataDir,
    getConfig = () => ({}),
    timerService,
    broadcastToOverlays = () => {},
    onSubathonEvent = () => {},
    safeWriteFileSync = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8')
}) {
    const SUBATHON_PATH = path.join(dataDir, 'subathon.json');

    let subathonStore = {
        config: cloneJson(DEFAULT_SUBATHON_CONFIG),
        state: cloneJson(DEFAULT_SUBATHON_STATE)
    };
    let multiplierExpiryTimer = null;

    function loadSubathon() {
        try {
            if (fs.existsSync(SUBATHON_PATH)) {
                const parsed = JSON.parse(fs.readFileSync(SUBATHON_PATH, 'utf8'));
                subathonStore.config = normalizeSubathonConfig(parsed.config || parsed);
                if (parsed.state && typeof parsed.state === 'object') {
                    subathonStore.state = {
                        ...cloneJson(DEFAULT_SUBATHON_STATE),
                        ...parsed.state,
                        history: Array.isArray(parsed.state.history) ? parsed.state.history.slice(-100) : []
                    };
                }
            } else {
                saveSubathon();
            }
        } catch (err) {
            console.warn(`[Subathon] Could not load ${SUBATHON_PATH}: ${err.message}`);
        }
    }

    function saveSubathon() {
        try {
            safeWriteFileSync(SUBATHON_PATH, JSON.stringify(subathonStore, null, 2));
        } catch (err) {
            console.error(`[Subathon] Failed to save subathon store: ${err.message}`);
        }
    }

    loadSubathon();
    scheduleMultiplierExpiry();

    function expireMultiplierIfNeeded() {
        const mult = subathonStore.config.multiplier;
        if (!mult.active || !mult.expiresAt) return false;
        const expiresAt = Date.parse(mult.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) return false;

        mult.active = false;
        mult.expiresAt = null;
        if (multiplierExpiryTimer) clearTimeout(multiplierExpiryTimer);
        multiplierExpiryTimer = null;
        saveSubathon();
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });
        return true;
    }

    function scheduleMultiplierExpiry() {
        if (multiplierExpiryTimer) clearTimeout(multiplierExpiryTimer);
        multiplierExpiryTimer = null;

        const mult = subathonStore.config.multiplier;
        if (!mult.active || !mult.expiresAt) return;
        const expiresAt = Date.parse(mult.expiresAt);
        if (!Number.isFinite(expiresAt)) return;

        const delay = expiresAt - Date.now();
        if (delay <= 0) {
            expireMultiplierIfNeeded();
            return;
        }

        multiplierExpiryTimer = setTimeout(() => {
            if (!expireMultiplierIfNeeded()) scheduleMultiplierExpiry();
        }, Math.min(delay, 2147483647));
        multiplierExpiryTimer.unref?.();
    }

    function isModuleEnabled() {
        const cfg = getConfig();
        return cfg.subathon_enabled === true;
    }

    function isSubathonActive() {
        return isModuleEnabled() && subathonStore.config.enabled === true;
    }

    function getActiveMultiplier() {
        const mult = subathonStore.config.multiplier;
        if (!mult.active) return 1.0;
        if (mult.expiresAt) {
            const exp = Date.parse(mult.expiresAt);
            if (Number.isFinite(exp) && exp <= Date.now()) {
                expireMultiplierIfNeeded();
                return 1.0;
            }
        }
        return Number(mult.factor) || 1.0;
    }

    function getConfigSnapshot() {
        const multiplierFactor = getActiveMultiplier();
        return {
            ...cloneJson(subathonStore.config),
            activeMultiplier: multiplierFactor,
            isModuleEnabled: isModuleEnabled(),
            isActive: isSubathonActive()
        };
    }

    function getStateSnapshot() {
        return cloneJson(subathonStore.state);
    }

    function getRuleSummary() {
        const factor = getActiveMultiplier();
        const r = subathonStore.config.rules;
        const multStr = factor > 1 ? ` (${factor}x Boost)` : '';

        const t1 = Math.round(r.subs.tier1Seconds * factor);
        const t2 = Math.round(r.subs.tier2Seconds * factor);
        const t3 = Math.round(r.subs.tier3Seconds * factor);
        const perDollar = Math.round(r.donations.secondsPerDollar * factor);
        const per100Bits = Math.round(r.bits.secondsPer100Bits * factor);
        const followSec = Math.round(r.follows.seconds * factor);

        const summaryParts = [];
        if (r.subs.enabled && t1 > 0) summaryParts.push(`1 Sub = ${formatDurationSeconds(t1)}`);
        if (r.donations.enabled && perDollar > 0) summaryParts.push(`$1 = ${formatDurationSeconds(perDollar)}`);
        if (r.bits.enabled && per100Bits > 0) summaryParts.push(`100 Bits = ${formatDurationSeconds(per100Bits)}`);
        if (r.follows.enabled && followSec > 0) summaryParts.push(`Follow = ${formatDurationSeconds(followSec)}`);

        return {
            multiplier: factor > 1 ? `${factor}x` : '',
            boostActive: factor > 1,
            happyHourActive: factor > 1,
            subTier1Formatted: formatDurationSeconds(t1) + multStr,
            subTier2Formatted: formatDurationSeconds(t2) + multStr,
            subTier3Formatted: formatDurationSeconds(t3) + multStr,
            tipRateFormatted: `${formatDurationSeconds(perDollar)} / $1.00` + multStr,
            bitsRateFormatted: `${formatDurationSeconds(per100Bits)} / 100 bits` + multStr,
            followFormatted: formatDurationSeconds(followSec) + multStr,
            summary: (factor > 1 ? `[${factor}x Boost] ` : '') + (summaryParts.join(' · ') || 'No active rates'),
            summaryParts
        };
    }

    function updateConfig(newConfig = {}) {
        const rules = { ...subathonStore.config.rules };
        for (const [key, value] of Object.entries(newConfig.rules || {})) {
            rules[key] = value && typeof value === 'object' && !Array.isArray(value)
                ? { ...(rules[key] || {}), ...value }
                : value;
        }

        subathonStore.config = normalizeSubathonConfig({
            ...subathonStore.config,
            ...newConfig,
            rules,
            theme: {
                ...subathonStore.config.theme,
                ...(newConfig.theme || {})
            },
            caps: {
                ...subathonStore.config.caps,
                ...(newConfig.caps || {})
            },
            multiplier: {
                ...subathonStore.config.multiplier,
                ...(newConfig.multiplier || {})
            }
        });
        saveSubathon();
        scheduleMultiplierExpiry();
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });
        return getConfigSnapshot();
    }

    function setMultiplier(factor = 2.0, durationMinutes = 60) {
        const f = Math.max(1, Math.min(10, Number(factor) || 2.0));
        const active = f > 1;
        const expiresAt = active && durationMinutes > 0
            ? new Date(Date.now() + durationMinutes * 60000).toISOString()
            : null;

        subathonStore.config.multiplier = { active, factor: f, expiresAt };
        saveSubathon();
        scheduleMultiplierExpiry();
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });
        return subathonStore.config.multiplier;
    }

    function clearMultiplier() {
        subathonStore.config.multiplier = { active: false, factor: 1.0, expiresAt: null };
        if (multiplierExpiryTimer) clearTimeout(multiplierExpiryTimer);
        multiplierExpiryTimer = null;
        saveSubathon();
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });
        return subathonStore.config.multiplier;
    }

    function processEvent(event = {}) {
        if (!isSubathonActive()) return { applied: false, reason: 'disabled' };
        if (!timerService) return { applied: false, reason: 'no_timer_service' };

        const targetId = subathonStore.config.targetTimerId;
        let timer;
        try {
            timer = timerService.getTimerOrThrow(targetId);
        } catch {
            return { applied: false, reason: 'timer_not_found', targetTimerId: targetId };
        }

        let type = String(event.type || event.event || '').toLowerCase().trim();
        // Normalize common aliases & simulator values
        if (type === 'gift_bomb' || type === 'gift_sub' || type === 'subgift') type = 'gift';
        if (type === 'cheer') type = 'bits';
        if (type === 'tip') type = 'donation';
        if (type === 'sub_t1') { type = 'sub'; event.tier = event.tier || '1000'; }
        else if (type === 'sub_t2') { type = 'sub'; event.tier = event.tier || '2000'; }
        else if (type === 'sub_t3') { type = 'sub'; event.tier = event.tier || '3000'; }
        else if (type === 'gift_5') { type = 'gift'; event.count = event.count || 5; }
        else if (type === 'bits_500') { type = 'bits'; event.amount = event.amount || 500; }
        else if (type === 'don_5') { type = 'donation'; event.amount = event.amount || 5.0; }
        else if (type === 'don_exact') { type = 'donation'; event.amount = event.amount || 4.20; }
        else if (type === 'raid_25') { type = 'raid'; event.viewers = event.viewers || 25; }

        const user = String(event.user || event.username || 'Anonymous').trim();
        const rules = subathonStore.config.rules;
        let rawSeconds = 0;
        let eventLabel = '';

        if (type === 'sub' || type === 'resub') {
            if (!rules.subs.enabled) return { applied: false, reason: 'subs_disabled' };
            const tier = String(event.tier || '1000').toLowerCase();
            const isPrime = tier === 'prime' || tier.includes('prime') || event.prime;
            if (isPrime) {
                if (rules.subs.primeMode === 'disabled') return { applied: false, reason: 'prime_disabled' };
                rawSeconds = rules.subs.primeMode === 'custom' ? rules.subs.primeSeconds : rules.subs.tier1Seconds;
                eventLabel = 'Prime Sub';
            } else if (tier === '3000' || tier === 'tier 3' || tier === 'tier3' || tier === '3') {
                rawSeconds = rules.subs.tier3Seconds;
                eventLabel = 'Tier 3 Sub';
            } else if (tier === '2000' || tier === 'tier 2' || tier === 'tier2' || tier === '2') {
                rawSeconds = rules.subs.tier2Seconds;
                eventLabel = 'Tier 2 Sub';
            } else {
                rawSeconds = rules.subs.tier1Seconds;
                eventLabel = 'Tier 1 Sub';
            }

            const streak = Math.max(0, parseInt(event.streak || event.months, 10) || 0);
            if (streak > 1 && rules.subs.resubBonusPerMonth > 0) {
                rawSeconds += streak * rules.subs.resubBonusPerMonth;
                eventLabel += ` (${streak} mo)`;
            }
        } else if (type === 'gift') {
            if (!rules.subs.enabled) return { applied: false, reason: 'subs_disabled' };
            const count = Math.max(1, parseInt(event.count || event.amount, 10) || 1);
            rawSeconds = count * (rules.subs.giftSecondsPerSub || 120);
            eventLabel = `${count} Gift Sub${count > 1 ? 's' : ''}`;
        } else if (type === 'bits' || type === 'cheer') {
            if (!rules.bits.enabled) return { applied: false, reason: 'bits_disabled' };
            const bits = Math.max(0, parseInt(event.amount || event.bits, 10) || 0);
            if (bits < rules.bits.minBits) return { applied: false, reason: 'below_min_bits', min: rules.bits.minBits };
            const rate = rules.bits.secondsPer100Bits || 30;
            rawSeconds = Math.floor((bits / 100) * rate);
            eventLabel = `${bits} Bits`;
        } else if (type === 'donation' || type === 'tip') {
            if (!rules.donations.enabled) return { applied: false, reason: 'donations_disabled' };
            const amount = Math.max(0, parseFloat(event.amount) || 0);

            // Check exact amount match
            const exact = (rules.donations.exactAmounts || []).find(ea => Math.abs(ea.amount - amount) < 0.005);
            if (exact) {
                rawSeconds = exact.seconds;
                eventLabel = exact.label ? `$${amount.toFixed(2)} (${exact.label})` : `$${amount.toFixed(2)} Exact`;
            } else {
                if (amount < rules.donations.minAmount) return { applied: false, reason: 'below_min_amount', min: rules.donations.minAmount };
                rawSeconds = Math.round(amount * (rules.donations.secondsPerDollar || 60));
                eventLabel = `$${amount.toFixed(2)} Donation`;
            }
        } else if (type === 'follow') {
            if (!rules.follows.enabled) return { applied: false, reason: 'follows_disabled' };
            if (rules.follows.maxPerHour > 0) {
                const oneHourAgo = Date.now() - 3600000;
                const recentFollows = subathonStore.state.history.filter(h => h.type === 'follow' && Date.parse(h.timestamp) > oneHourAgo).length;
                if (recentFollows >= rules.follows.maxPerHour) return { applied: false, reason: 'follow_hourly_cap_reached' };
            }
            rawSeconds = rules.follows.seconds || 15;
            eventLabel = 'Follow';
        } else if (type === 'raid') {
            if (!rules.raids.enabled) return { applied: false, reason: 'raids_disabled' };
            const viewers = Math.max(0, parseInt(event.viewers || event.amount, 10) || 0);
            if (viewers < rules.raids.minViewers) return { applied: false, reason: 'below_min_viewers', min: rules.raids.minViewers };
            const calculated = rules.raids.baseSeconds + (viewers * rules.raids.secondsPerViewer);
            rawSeconds = Math.min(rules.raids.maxRaidSeconds || 600, calculated);
            eventLabel = `Raid (${viewers} viewers)`;
        } else if (type === 'channel_points' || type === 'redeem') {
            if (!rules.channelPoints.enabled) return { applied: false, reason: 'channel_points_disabled' };
            const rewardTitle = String(event.rewardTitle || event.name || '').trim().toLowerCase();
            const match = (rules.channelPoints.rewards || []).find(rw => rw.rewardTitle.toLowerCase() === rewardTitle);
            if (!match) return { applied: false, reason: 'reward_not_configured' };
            rawSeconds = match.seconds;
            eventLabel = `Reward: ${match.rewardTitle}`;
        } else {
            return { applied: false, reason: 'unsupported_event_type', type };
        }

        const multiplier = getActiveMultiplier();
        let deltaSeconds = Math.round(rawSeconds * multiplier);
        if (deltaSeconds === 0) return { applied: false, reason: 'zero_time' };

        // Check safety cap (maxRemainingSeconds)
        let capped = false;
        const currentRemainingMs = timer.state === 'running'
            ? Math.max(0, (timer.startingRemainingMs || 0) - Math.max(0, Date.now() - (timer.startedAt || Date.now())))
            : Math.max(0, timer.remainingMs || 0);
        const currentRemainingSec = currentRemainingMs / 1000;
        const maxSec = subathonStore.config.caps.maxRemainingSeconds;

        if (maxSec > 0 && deltaSeconds > 0) {
            if (currentRemainingSec >= maxSec) {
                return { applied: false, reason: 'max_cap_reached', maxSeconds: maxSec };
            }
            if (currentRemainingSec + deltaSeconds > maxSec) {
                deltaSeconds = Math.max(1, Math.round(maxSec - currentRemainingSec));
                capped = true;
            }
        }

        // Apply to timer
        const timerAction = deltaSeconds >= 0 ? 'add_time' : 'subtract_time';
        const updatedTimer = timerService.applyTimerControl(timer, timerAction, { seconds: Math.abs(deltaSeconds) });

        // Update statistics
        subathonStore.state.totalTimeAddedSeconds += deltaSeconds;
        if (type === 'sub' || type === 'resub') subathonStore.state.totalSubs += 1;
        else if (type === 'gift') subathonStore.state.totalSubs += Math.max(1, parseInt(event.count || event.amount, 10) || 1);
        else if (type === 'bits' || type === 'cheer') subathonStore.state.totalBits += Math.max(0, parseInt(event.amount || event.bits, 10) || 0);
        else if (type === 'donation' || type === 'tip') subathonStore.state.totalDonations += Math.max(0, parseFloat(event.amount) || 0);
        else if (type === 'follow') subathonStore.state.totalFollows += 1;
        else if (type === 'raid') subathonStore.state.totalRaids += 1;

        const record = {
            id: 'sb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            timestamp: new Date().toISOString(),
            type,
            user,
            label: eventLabel,
            rawSeconds,
            deltaSeconds,
            multiplier,
            capped,
            undoable: true
        };
        subathonStore.state.history.unshift(record);
        if (subathonStore.state.history.length > 100) subathonStore.state.history.pop();

        saveSubathon();

        const payload = {
            applied: true,
            record,
            timer: updatedTimer,
            totalTimeAddedSeconds: subathonStore.state.totalTimeAddedSeconds,
            rulesSummary: getRuleSummary()
        };

        broadcastToOverlays('subathon-event', payload);
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });

        if (typeof onSubathonEvent === 'function') {
            onSubathonEvent({
                ...record,
                totalTimeAddedSeconds: subathonStore.state.totalTimeAddedSeconds,
                formattedDelta: formatDurationSeconds(deltaSeconds),
                formattedTotal: formatDurationSeconds(subathonStore.state.totalTimeAddedSeconds),
                capped
            });
        }

        return payload;
    }

    function undoLast() {
        const lastEntry = subathonStore.state.history.find(h => h.undoable);
        if (!lastEntry) throw new Error('No undoable subathon event found in history');
        if (!timerService) throw new Error('Timer service unavailable');

        const targetId = subathonStore.config.targetTimerId;
        const timer = timerService.getTimerOrThrow(targetId);

        // Invert the delta
        const invertAction = lastEntry.deltaSeconds >= 0 ? 'subtract_time' : 'add_time';
        timerService.applyTimerControl(timer, invertAction, { seconds: Math.abs(lastEntry.deltaSeconds) });

        subathonStore.state.totalTimeAddedSeconds -= lastEntry.deltaSeconds;
        lastEntry.undoable = false;
        lastEntry.undone = true;

        saveSubathon();
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });

        return { ok: true, undone: lastEntry };
    }

    function resetStats() {
        subathonStore.state = cloneJson(DEFAULT_SUBATHON_STATE);
        saveSubathon();
        broadcastToOverlays('subathon-update', {
            config: getConfigSnapshot(),
            state: getStateSnapshot(),
            rulesSummary: getRuleSummary()
        });
        return getStateSnapshot();
    }

    return {
        isModuleEnabled,
        isSubathonActive,
        getConfigSnapshot,
        getStateSnapshot,
        getRuleSummary,
        updateConfig,
        setMultiplier,
        clearMultiplier,
        processEvent,
        undoLast,
        resetStats
    };
}

module.exports = {
    DEFAULT_SUBATHON_THEME,
    DEFAULT_SUBATHON_CONFIG,
    DEFAULT_SUBATHON_STATE,
    formatDurationSeconds,
    normalizeSubathonConfig,
    createSubathonService
};
