'use strict';
// Alert engine: turns stream events into queued on-screen alerts and optional actions.
// Rules live in data/alerts.json. Overlays render alerts through the "Alert box" element.

const fs = require('fs');
const path = require('path');

const TRIGGERS = {
    follow: 'Follow',
    sub: 'New subscriber',
    resub: 'Resub',
    milestone: 'Sub milestone',
    gift: 'Gifted subs',
    bits: 'Bits',
    donation: 'Donation',
    raid: 'Raid',
    redeem: 'Channel point redeem',
    timer: 'Timer finished',
    goal: 'Goal reached',
    chat_word: 'Chat word or hashtag',
    chat_command: 'Chat bot command',
    poll_end: 'Poll completed / winner',
    hype_train: 'Hype train',
    announcement: 'Announcement (manual)'
};
const ANIM_IN = ['none', 'fade', 'pop', 'zoom', 'bounce', 'flip', 'spin', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];
const ANIM_OUT = ['none', 'fade', 'pop', 'zoom', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, critical: 3 };
const TIMER_ACTIONS = ['start', 'pause', 'resume', 'reset', 'add_time', 'subtract_time'];
const HISTORY_LIMIT = 50;
const EVENT_LIMIT = 100;
const GIFT_QUIET_MS = 4000;
const GIFT_MAX_MS = 15000;

const TWITCH_CHEERMOTES = [
    { min: 100000, id: '100000', name: 'Cheer100000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100000/4.gif', color: '#f64747' },
    { min: 10000, id: '10000', name: 'Cheer10000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/10000/4.gif', color: '#e005b9' },
    { min: 5000, id: '5000', name: 'Cheer5000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/5000/4.gif', color: '#f430ff' },
    { min: 1000, id: '1000', name: 'Cheer1000', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1000/4.gif', color: '#0099fe' },
    { min: 500, id: '500', name: 'Cheer500', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/500/4.gif', color: '#1db2a5' },
    { min: 100, id: '100', name: 'Cheer100', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/4.gif', color: '#9c3ee8' },
    { min: 1, id: '1', name: 'Cheer1', url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1/4.gif', color: '#979797' }
];

const makeSpecialTiers = (slug, prefix) => [
    { min: 10000, id: '10000', name: `${prefix}10000`, url: `https://d3aqoihi2n8ty8.cloudfront.net/actions/${slug}/dark/animated/10000/4.gif`, color: '#e005b9' },
    { min: 5000, id: '5000', name: `${prefix}5000`, url: `https://d3aqoihi2n8ty8.cloudfront.net/actions/${slug}/dark/animated/5000/4.gif`, color: '#f430ff' },
    { min: 1000, id: '1000', name: `${prefix}1000`, url: `https://d3aqoihi2n8ty8.cloudfront.net/actions/${slug}/dark/animated/1000/4.gif`, color: '#0099fe' },
    { min: 100, id: '100', name: `${prefix}100`, url: `https://d3aqoihi2n8ty8.cloudfront.net/actions/${slug}/dark/animated/100/4.gif`, color: '#9c3ee8' },
    { min: 1, id: '1', name: `${prefix}1`, url: `https://d3aqoihi2n8ty8.cloudfront.net/actions/${slug}/dark/animated/1/4.gif`, color: '#979797' }
];

const TWITCH_CHEERMOTE_FAMILIES = {
    cheer: { id: 'cheer', prefix: 'Cheer', name: 'Default Cheer', tiers: TWITCH_CHEERMOTES },
    kappa: { id: 'kappa', prefix: 'Kappa', name: 'Kappa', tiers: makeSpecialTiers('kappa', 'Kappa') },
    trihard: { id: 'trihard', prefix: 'TriHard', name: 'TriHard', tiers: makeSpecialTiers('trihard', 'TriHard') },
    kreygasm: { id: 'kreygasm', prefix: 'Kreygasm', name: 'Kreygasm', tiers: makeSpecialTiers('kreygasm', 'Kreygasm') },
    swiftrage: { id: 'swiftrage', prefix: 'SwiftRage', name: 'SwiftRage', tiers: makeSpecialTiers('swiftrage', 'SwiftRage') },
    '4head': { id: '4head', prefix: '4Head', name: '4Head', tiers: makeSpecialTiers('4head', '4Head') },
    pjsalt: { id: 'pjsalt', prefix: 'PJSalt', name: 'PJSalt', tiers: makeSpecialTiers('pjsalt', 'PJSalt') },
    showlove: { id: 'showlove', prefix: 'ShowLove', name: 'ShowLove', tiers: makeSpecialTiers('showlove', 'ShowLove') },
    party: { id: 'party', prefix: 'Party', name: 'Party', tiers: makeSpecialTiers('party', 'Party') },
    pride: { id: 'pride', prefix: 'Pride', name: 'Pride', tiers: makeSpecialTiers('pride', 'Pride') },
    frankerz: { id: 'frankerz', prefix: 'FrankerZ', name: 'FrankerZ', tiers: makeSpecialTiers('frankerz', 'FrankerZ') },
    vohiyo: { id: 'vohiyo', prefix: 'VoHiYo', name: 'VoHiYo', tiers: makeSpecialTiers('vohiyo', 'VoHiYo') },
    heyguys: { id: 'heyguys', prefix: 'HeyGuys', name: 'HeyGuys', tiers: makeSpecialTiers('heyguys', 'HeyGuys') },
    dansgame: { id: 'dansgame', prefix: 'DansGame', name: 'DansGame', tiers: makeSpecialTiers('dansgame', 'DansGame') },
    failfish: { id: 'failfish', prefix: 'FailFish', name: 'FailFish', tiers: makeSpecialTiers('failfish', 'FailFish') },
    notlikethis: { id: 'notlikethis', prefix: 'NotLikeThis', name: 'NotLikeThis', tiers: makeSpecialTiers('notlikethis', 'NotLikeThis') },
    mrdestructoid: { id: 'mrdestructoid', prefix: 'MrDestructoid', name: 'MrDestructoid', tiers: makeSpecialTiers('mrdestructoid', 'MrDestructoid') },
    cheerwhal: { id: 'cheerwhal', prefix: 'Cheerwhal', name: 'Cheerwhal', tiers: makeSpecialTiers('cheerwhal', 'Cheerwhal') },
    shamrock: { id: 'shamrock', prefix: 'Shamrock', name: 'Shamrock', tiers: makeSpecialTiers('shamrock', 'Shamrock') },
    anon: { id: 'anon', prefix: 'Anon', name: 'Anon', tiers: makeSpecialTiers('anon', 'Anon') }
};

const CHEERMOTE_REGEX = /\b(pridecheer|holidaycheer|ripcheer|bibblethump|bitboss|charity|seemsgood|elegiggle|corgo|uni|bday|streamlabs|muxy|cheer|kappa|trihard|kreygasm|swiftrage|4head|pjsalt|showlove|party|pride|frankerz|vohiyo|heyguys|dansgame|failfish|notlikethis|mrdestructoid|cheerwhal|shamrock|anon)(\d+)\b/i;

function extractCheermoteFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(CHEERMOTE_REGEX);
    if (!match) return null;
    return {
        prefix: match[1].toLowerCase(),
        bits: parseInt(match[2], 10)
    };
}

function extractAllCheermotes(text) {
    if (!text || typeof text !== 'string') return [];
    const re = new RegExp(CHEERMOTE_REGEX.source, 'gi');
    return [...text.matchAll(re)].map(m => ({ prefix: m[1].toLowerCase(), bits: parseInt(m[2], 10) }));
}

// Family of the first cheermote, tier from the summed bits; null when the text has none.
function resolveViewerCheermote(ev, amount, familyOverride = 'auto') {
    const all = [ev?.cheermoteSource, ev?.message].map(extractAllCheermotes).find(list => list.length) || [];
    const total = all.reduce((sum, c) => sum + (c.bits || 0), 0);
    const prefix = familyOverride && familyOverride !== 'auto' ? familyOverride : (all[0]?.prefix || 'cheer');
    return getTwitchCheermote(total > 0 ? total : amount, prefix);
}

function getTwitchCheermote(bits = 1, prefix = 'cheer') {
    const key = String(prefix || 'cheer').toLowerCase().replace(/[^a-z0-9]/g, '');
    let family = TWITCH_CHEERMOTE_FAMILIES[key];
    if (!family && key && /^[a-z0-9]{2,30}$/.test(key)) {
        const name = key.charAt(0).toUpperCase() + key.slice(1);
        family = TWITCH_CHEERMOTE_FAMILIES[key] = { id: key, prefix: name, name, tiers: makeSpecialTiers(key, name) };
    }
    family = family || TWITCH_CHEERMOTE_FAMILIES.cheer;
    const amt = Number(bits) || 1;
    for (const tier of family.tiers) {
        if (amt >= tier.min) return { ...tier, prefix: family.prefix };
    }
    return { ...family.tiers[family.tiers.length - 1], prefix: family.prefix };
}

const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const str = (value, max) => String(value ?? '').trim().slice(0, max);
const safeId = (value, fallback) => (String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)) || fallback;

function normalizeBaseUrl(value) {
    try {
        const u = new URL(String(value || '').trim() || 'http://127.0.0.1:8000');
        if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
        return `${u.protocol}//${u.host}`;
    } catch { return 'http://127.0.0.1:8000'; }
}

// "page/row/col" or "page row col" -> numeric parts, null when invalid
function parseLocation(input) {
    const parts = String(input || '').split(/[\s/,]+/).filter(Boolean).map(Number);
    return parts.length === 3 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 999) ? parts : null;
}

function defaultSettings() {
    return { enabled: true, gapSeconds: 2, queueCap: 200, companionUrl: 'http://127.0.0.1:8000' };
}

function normalizeVariant(input = {}, index = 0) {
    const variantType = ['weighted', 'gated'].includes(input.variantType) ? input.variantType : (input.gated ? 'gated' : 'weighted');
    const gateMin = clamp(input.gateMin ?? input.minMonths ?? input.minAmount ?? input.minCount, 0, 1e9, 0);
    let gateMax = clamp(input.gateMax ?? input.maxMonths ?? input.maxAmount ?? input.maxCount, 0, 1e9, 0);
    const gateMode = amountModeFor(input.gateMode, gateMin, gateMax);
    if (gateMode === 'exact') gateMax = gateMin;
    else if (gateMode === 'min') gateMax = 0;
    return {
        id: safeId(input.id, `v${index + 1}`),
        variantType,
        gateMode,
        gateMin,
        gateMinOp: gateMode === 'exact' ? 'gte' : (input.gateMinOp === 'gt' ? 'gt' : 'gte'),
        gateMax,
        gateMaxOp: gateMode === 'exact' ? 'lte' : (input.gateMaxOp === 'lt' ? 'lt' : 'lte'),
        title: str(input.title, 200),
        message: str(input.message, 500),
        image: str(input.image, 2000),
        video: str(input.video, 2000),
        videoSound: Boolean(input.videoSound),
        videoVolume: clamp(input.videoVolume, 0, 100, 70),
        videoLoop: input.videoLoop !== false,
        focusX: clamp(input.focusX, 0, 100, 50),
        focusY: clamp(input.focusY, 0, 100, 50),
        emoji: str(input.emoji, 2000),
        emojiUrl: str(input.emojiUrl, 2000),
        emoteEffect: ['showcase', 'rain', 'party', 'fountain', 'bounce'].includes(input.emoteEffect) ? input.emoteEffect : 'showcase',
        emoteDensity: Math.round(clamp(input.emoteDensity, 10, 100, 30)),
        emoteScale: Math.round(clamp(input.emoteScale, 20, 300, 100)),
        emojiLadder: Array.isArray(input.emojiLadder)
            ? input.emojiLadder.slice(0, 12).map(step => ({ min: clamp(step?.min, 0, 1e9, 0), emoji: str(step?.emoji, 2000), emojiUrl: str(step?.emojiUrl, 2000) })).filter(step => step.emoji || step.emojiUrl).sort((a, b) => a.min - b.min)
            : [],
        emojiEvery: clamp(input.emojiEvery, 0, 1e6, 0),
        emojiMax: Math.round(clamp(input.emojiMax, 1, 25, 8)),
        emoteSource: ['viewer', 'custom'].includes(input.emoteSource)
            ? input.emoteSource
            : ((input.emoji || input.emojiUrl || input.image || input.video || (Array.isArray(input.emojiLadder) && input.emojiLadder.some(st => st?.emoji || st?.emojiUrl))) ? 'custom' : 'viewer'),
        cheermoteFamily: str(input.cheermoteFamily || input.cheermoteStyle, 40).toLowerCase() || 'auto',
        sound: str(input.sound, 2000),
        volume: clamp(input.volume, 0, 100, 70),
        animIn: ANIM_IN.includes(input.animIn) ? input.animIn : 'pop',
        animOut: ANIM_OUT.includes(input.animOut) ? input.animOut : 'fade',
        duration: clamp(input.duration, 1, 120, 6),
        weight: clamp(input.weight, 1, 100, 1)
    };
}

const VALID_TIERS = ['1000', '2000', '3000', 'prime'];
const AMOUNT_MODES = ['min', 'range', 'exact'];
const AMOUNT_TOLERANCE = 0.005;
const sameAmount = (a, b) => Math.abs(a - b) <= AMOUNT_TOLERANCE;

// Older rules only stored min/max; min == max means "equal to".
function amountModeFor(mode, min, max) {
    if (AMOUNT_MODES.includes(mode)) return mode;
    if (min > 0 && min === max) return 'exact';
    return max > 0 ? 'range' : 'min';
}

function normalizeRule(input = {}, index = 0) {
    const trigger = TRIGGERS[input.trigger] ? input.trigger : 'follow';
    const c = input.conditions || {};
    const a = input.actions || {};
    const variants = Array.isArray(input.variants) ? input.variants.slice(0, 30).map(normalizeVariant) : [];
    const seen = new Set();
    variants.forEach((variant, i) => {
        while (seen.has(variant.id)) variant.id = `${variant.id}-${i}`;
        seen.add(variant.id);
    });
    const rawTiers = Array.isArray(c.tiers) ? c.tiers : (c.tier ? [c.tier] : []);
    const tiers = rawTiers.map(String).filter(t => VALID_TIERS.includes(t));
    let minAmount = clamp(c.minAmount, 0, 1e9, 0);
    let maxAmount = clamp(c.maxAmount, 0, 1e9, 0);
    const amountMode = amountModeFor(c.amountMode, minAmount, maxAmount);
    let exactAmount = 0;
    if (amountMode === 'exact') {
        exactAmount = clamp(c.exactAmount ?? minAmount, 0, 1e9, 0);
        minAmount = maxAmount = exactAmount;
    } else if (amountMode === 'min') {
        maxAmount = 0;
    }
    // Built-in sources are any/socialstream/external; embedded hosts register their own ids.
    const source = String(c.source || 'any').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 40) || 'any';
    return {
        id: safeId(input.id, `rule-${index + 1}`),
        name: str(input.name, 80) || TRIGGERS[trigger],
        enabled: input.enabled !== false,
        webhookOnly: input.webhookOnly === true || input.silent === true,
        priority: PRIORITIES.includes(input.priority) ? input.priority : 'normal',
        interrupt: input.priority === 'critical' && input.interrupt === true,
        expireSeconds: Math.round(clamp(input.expireSeconds, 0, 86400, 0)),
        trigger,
        conditions: {
            amountMode,
            minAmount,
            maxAmount,
            exactAmount,
            source: trigger === 'donation' ? source : 'any',
            tiers,
            tier: tiers.length === 1 ? tiers[0] : (VALID_TIERS.includes(c.tier) ? c.tier : ''),
            rewardName: str(c.rewardName, 120),
            rewardIds: Array.isArray(c.rewardIds) ? [...new Set(c.rewardIds.map(x => str(x, 80)).filter(Boolean))].slice(0, 100) : [],
            phase: ['any', 'start', 'levelup', 'end'].includes(c.phase) ? c.phase : 'any',
            keywords: Array.isArray(c.keywords) ? c.keywords.map(k => str(k, 60).toLowerCase()).filter(Boolean).slice(0, 30) : [],
            timerId: str(c.timerId, 80),
            goalId: str(c.goalId, 80),
            milestones: Array.isArray(c.milestones) ? [...new Set(c.milestones.map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 1200))].sort((x, y) => x - y).slice(0, 40) : [],
            everyMonths: clamp(c.everyMonths, 0, 120, 0),
            command: str(c.command, 40).toLowerCase().replace(/^!+/, ''),
            permission: ['everyone', 'subs', 'mods', 'streamer'].includes(c.permission) ? c.permission : (['everyone', 'subs', 'mods', 'streamer'].includes(c.access) ? c.access : 'everyone'),
            cooldownSeconds: clamp(c.cooldownSeconds, 0, 86400, (trigger === 'chat_word' || trigger === 'chat_command') ? 30 : 0)
        },
        pick: ['random', 'weighted', 'sequential'].includes(input.pick) ? input.pick : 'random',
        variants,
        actions: {
            timer: {
                enabled: a.timer?.enabled === true,
                timerId: str(a.timer?.timerId, 80),
                action: TIMER_ACTIONS.includes(a.timer?.action) ? a.timer.action : 'add_time',
                seconds: clamp(a.timer?.seconds, 0, 864000, 30),
                perUnit: a.timer?.perUnit === true
            },
            http: {
                enabled: a.http?.enabled === true,
                url: str(a.http?.url, 2000),
                method: a.http?.method === 'GET' ? 'GET' : 'POST',
                delay: clamp(Number(a.http?.delay ?? a.http?.delaySeconds) || 0, 0, 300, 0)
            },
            chat: {
                enabled: a.chat?.enabled === true,
                template: str(a.chat?.template, 1000),
                cooldownSeconds: clamp(a.chat?.cooldownSeconds, 0, 86400, 30)
            },
            companion: {
                enabled: a.companion?.enabled === true,
                page: Math.round(clamp(a.companion?.page, 0, 999, 1)),
                row: Math.round(clamp(a.companion?.row, 0, 999, 0)),
                column: Math.round(clamp(a.companion?.column, 0, 999, 0)),
                location: str(a.companion?.location, 20),
                delay: clamp(a.companion?.delay, 0, 300, 0)
            }
        }
    };
}

function normalizeConfig(input = {}) {
    const rules = Array.isArray(input.rules) ? input.rules.slice(0, 200).map(normalizeRule) : [];
    const ids = new Set();
    rules.forEach((rule, i) => {
        while (ids.has(rule.id)) rule.id = `${rule.id}-${i}`;
        ids.add(rule.id);
    });
    return {
        settings: {
            enabled: input.settings?.enabled !== false,
            gapSeconds: clamp(input.settings?.gapSeconds, 0, 60, 2),
            queueCap: Math.round(clamp(input.settings?.queueCap, 1, 1000, 200)),
            companionUrl: normalizeBaseUrl(input.settings?.companionUrl)
        },
        rules
    };
}

function fill(template, tokens) {
    return String(template || '').replace(/\{\{\s*(?:alert\.)?([a-z_]+)\s*\}\}/gi, (_, key) => {
        const value = tokens[key.toLowerCase()];
        return value === undefined || value === null ? '' : String(value);
    });
}

function createAlertEngine({ dataDir, broadcast, broadcastToOverlays, runTimerAction, sendChat, log = console.log }) {
    const notify = typeof broadcast === 'function' ? broadcast : (typeof broadcastToOverlays === 'function' ? broadcastToOverlays : () => {});
    const filePath = path.join(dataDir, 'alerts.json');
    let config = normalizeConfig({});
    try { config = normalizeConfig(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* first run */ }

    const queue = [];
    let current = null;
    let currentTimer = null;
    let paused = false;
    let muted = false;
    const history = [];
    const eventsPath = path.join(dataDir, 'alert-events.json');
    let events = [];
    try { events = JSON.parse(fs.readFileSync(eventsPath, 'utf8')).slice(0, EVENT_LIMIT); } catch { /* none yet */ }
    let saveEventsTimer = null;
    function recordEvent(ev, payload, status) {
        const entry = {
            id: `e${Date.now().toString(36)}${(counter++).toString(36)}`,
            at: new Date().toISOString(),
            event: ev,
            status,
            title: payload ? payload.title || payload.message : '',
            ruleId: payload?.ruleId || '',
            ruleName: payload?.ruleName || ''
        };
        events.unshift(entry);
        events.length = Math.min(events.length, EVENT_LIMIT);
        clearTimeout(saveEventsTimer);
        saveEventsTimer = setTimeout(() => { try { fs.writeFileSync(eventsPath, JSON.stringify(events)); } catch { /* disk full or read-only */ } }, 1000);
        return entry;
    }
    const chatCooldowns = new Map();
    async function pressCompanion(c, baseOverride) {
        const loc = parseLocation(c.location) || [c.page, c.row, c.column];
        const base = baseOverride ? normalizeBaseUrl(baseOverride) : config.settings.companionUrl;
        try {
            const res = await fetch(`${base}/api/location/${loc[0]}/${loc[1]}/${loc[2]}/press`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000) });
            return { ok: res.ok, status: res.status };
        } catch (err) {
            return { ok: false, error: err.name === 'TimeoutError' ? 'Timed out after 5 seconds' : err.message };
        }
    }
    const cooldowns = new Map();
    const sequence = new Map();
    const lastVariant = new Map();
    const recent = new Map();
    let nextRecentPruneAt = 0;
    const gifts = new Map();
    const activeWebhookTimers = new Set();
    let counter = 0;

    function save() {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    }

    function eventAmount(ev) {
        switch (ev.type) {
            case 'bits': case 'donation': case 'raid': case 'redeem': return Number(ev.amount) || 0;
            case 'gift': return Number(ev.count) || 1;
            case 'sub': case 'resub': case 'milestone': return Number(ev.months) || 0;
            case 'poll_end': return Number(ev.votes ?? ev.total_votes) || 0;
            case 'hype_train': return Number(ev.level) || 1;
            default: return Number(ev.amount) || 0;
        }
    }

    function matches(rule, ev) {
        if (!rule.enabled || rule.trigger !== ev.type) return false;
        const c = rule.conditions;
        const amount = eventAmount(ev);
        if (c.amountMode === 'exact') {
            if (!sameAmount(amount, c.exactAmount)) return false;
        } else {
            if (c.minAmount && amount < c.minAmount) return false;
            if (c.amountMode === 'range' && c.maxAmount && amount > c.maxAmount) return false;
        }
        // Untagged donations come from SocialStream.
        if (rule.trigger === 'donation' && c.source && c.source !== 'any' && c.source !== String(ev.source || 'socialstream').toLowerCase()) return false;
        if (c.tiers && c.tiers.length > 0) {
            if (!c.tiers.includes(String(ev.tier || ''))) return false;
        } else if (c.tier && String(ev.tier || '') !== c.tier) {
            return false;
        }
        if (rule.trigger === 'redeem' && c.rewardIds?.length && !c.rewardIds.includes(String(ev.rewardId || ''))) return false;
        if (rule.trigger === 'redeem' && c.rewardName && !String(ev.reward || '').toLowerCase().includes(c.rewardName.toLowerCase())) return false;
        if (rule.trigger === 'hype_train' && c.phase && c.phase !== 'any' && c.phase !== ev.phase) return false;
        if (rule.trigger === 'timer' && c.timerId && c.timerId !== ev.timerId) return false;
        if (rule.trigger === 'goal' && c.goalId && c.goalId !== ev.goalId) return false;
        if (rule.trigger === 'chat_word') {
            const text = String(ev.message || '').toLowerCase();
            const hit = c.keywords.find(word => word.startsWith('#')
                ? text.split(/\s+/).includes(word)
                : new RegExp(`(^|[^\\p{L}\\p{N}_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`, 'iu').test(text));
            if (!hit) return false;
            ev.keyword = hit;
        }
        if (rule.trigger === 'chat_command') {
            const evCmd = String(ev.command || '').toLowerCase().replace(/^!+/, '');
            const ruleCmd = String(c.command || '').toLowerCase().replace(/^!+/, '');
            if (!ruleCmd || evCmd !== ruleCmd) return false;

            if (!ev.isTest && !ev.test) {
                const perm = c.permission || 'everyone';
                if (perm === 'subs') {
                    if (!ev.isSub && !ev.isMod && !ev.isBroadcaster) return false;
                } else if (perm === 'mods') {
                    if (!ev.isMod && !ev.isBroadcaster) return false;
                } else if (perm === 'streamer') {
                    if (!ev.isBroadcaster) return false;
                }
            }
        }
        if (rule.trigger === 'milestone') {
            const months = Number(ev.months) || 0;
            if (!months) return false;
            const listed = c.milestones.includes(months);
            const periodic = c.everyMonths > 0 && months % c.everyMonths === 0;
            if (!listed && !periodic) return false;
        }
        return true;
    }

    function tierSpecificity(r) {
        const list = r.conditions.tiers || (r.conditions.tier ? [r.conditions.tier] : []);
        if (list.length > 0 && list.length < 4) {
            return 4 - list.length; // 1 tier = 3 (most specific), 2 tiers = 2, 3 tiers = 1
        }
        return 0; // any tier
    }

    function chooseRule(ev) {
        const candidates = config.rules.filter(rule => matches(rule, ev) && rule.variants.length);
        // Exact amounts beat thresholds, then highest threshold wins; a specific source or sub tier beats "Any" so only the winning rule fires
        const exact = r => (r.conditions.amountMode === 'exact' ? 1 : 0);
        const sourced = r => (r.conditions.source && r.conditions.source !== 'any' ? 1 : 0);
        candidates.sort((a, b) =>
            (exact(b) - exact(a)) ||
            (b.conditions.minAmount - a.conditions.minAmount) ||
            (sourced(b) - sourced(a)) ||
            (tierSpecificity(b) - tierSpecificity(a)) ||
            (b.conditions.milestones.length - a.conditions.milestones.length)
        );
        return candidates[0] || null;
    }

    function getVariantMetric(rule, ev) {
        if (!ev) return 0;
        switch (ev.type) {
            case 'sub': case 'resub': case 'milestone': return Number(ev.months) || 0;
            case 'gift': return Number(ev.count) || Number(ev.amount) || 1;
            case 'bits': case 'donation': case 'raid': case 'redeem': return Number(ev.amount) || Number(ev.viewers) || 0;
            default: return eventAmount(ev);
        }
    }

    function matchesGate(v, val) {
        const isGated = v.variantType === 'gated' || (v.gateMin > 0) || (v.gateMax > 0);
        if (!isGated) return false;
        if (v.gateMode === 'exact') return sameAmount(val, v.gateMin);
        if (v.gateMin > 0) {
            if (v.gateMinOp === 'gt' && !(val > v.gateMin)) return false;
            if (v.gateMinOp !== 'gt' && !(val >= v.gateMin)) return false;
        }
        if (v.gateMax > 0) {
            if (v.gateMaxOp === 'lt' && !(val < v.gateMax)) return false;
            if (v.gateMaxOp !== 'lt' && !(val <= v.gateMax)) return false;
        }
        return true;
    }

    function rollWeighted(pool, ruleId) {
        if (!pool || pool.length === 0) return null;
        if (pool.length === 1) return pool[0];
        const weights = pool.map(v => Math.max(1, Number(v.weight) || 1));
        const total = weights.reduce((sum, w) => sum + w, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < pool.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                if (ruleId) lastVariant.set(ruleId, pool[i].id);
                return pool[i];
            }
        }
        const fallback = pool[pool.length - 1];
        if (ruleId) lastVariant.set(ruleId, fallback.id);
        return fallback;
    }

    function chooseVariant(rule, ev) {
        const list = rule.variants;
        if (list.length === 1) return list[0];

        // 1. Check gated / threshold variants first when event context is provided
        if (ev) {
            const val = getVariantMetric(rule, ev);
            const gatedMatches = list.filter(v => matchesGate(v, val));
            if (gatedMatches.length > 0) {
                // Exact gates win, then the highest minimum (e.g. >24 months beats >12 months)
                const exactGate = v => (v.gateMode === 'exact' ? 1 : 0);
                gatedMatches.sort((a, b) => (exactGate(b) - exactGate(a)) || (b.gateMin - a.gateMin) || (b.weight - a.weight));
                const top = gatedMatches[0];
                const topTied = gatedMatches.filter(v => exactGate(v) === exactGate(top) && v.gateMin === top.gateMin);
                if (topTied.length === 1) return topTied[0];
                return rollWeighted(topTied, rule.id);
            }
        }

        // 2. Fall back to weighted / general variants
        const poolList = list.filter(v => v.variantType !== 'gated' && (v.gateMin === 0 || !v.gateMin) && (v.gateMax === 0 || !v.gateMax));
        const effectiveList = poolList.length ? poolList : list;

        if (effectiveList.length === 1) return effectiveList[0];
        if (rule.pick === 'sequential') {
            const index = (sequence.get(rule.id) || 0) % effectiveList.length;
            sequence.set(rule.id, index + 1);
            return effectiveList[index];
        }

        return rollWeighted(effectiveList, rule.id);
    }

    function tokensFor(ev) {
        const target = ev.target || (ev.args ? String(ev.args).split(/\s+/)[0]?.replace(/^@/, '') : '') || ev.user || 'Someone';
        const recipient = ev.recipient || '';
        return {
            user: ev.user || 'Someone',
            recipient,
            recipientname: recipient,
            recipient_name: recipient,
            gift_recipient: recipient,
            amount: ev.amount ?? '',
            currency: ev.currency || '',
            source: ev.source || (ev.type === 'donation' ? 'socialstream' : ''),
            count: ev.count ?? '',
            months: ev.months ?? '',
            streak: ev.streak ?? '',
            tier: ev.tierLabel || '',
            message: ev.message || ev.args || '',
            reward: ev.reward || '',
            viewers: ev.viewers ?? ev.amount ?? '',
            name: ev.name || '',
            keyword: ev.keyword || '',
            command: ev.command || '',
            winner: ev.winner || '',
            level: ev.level ?? '',
            phase: ev.phase || '',
            total: ev.total ?? '',
            goal: ev.goal ?? '',
            minutes: ev.seconds ? Math.max(1, Math.round(ev.seconds / 60)) : '',
            poll_title: ev.title || '',
            title: ev.title || '',
            votes: ev.votes ?? '',
            percent: ev.percent ?? '',
            total_votes: ev.total_votes ?? '',
            target,
            args: ev.args || ''
        };
    }

    // Highest ladder step at or below the amount wins; "one per N" repeats it, capped by emojiMax.
    function pickEmote(variant, amount, rule = null, ev = null) {
        if (rule && rule.trigger === 'bits' && variant.emoteSource === 'viewer') {
            const cheermote = resolveViewerCheermote(ev, amount, variant.cheermoteFamily);
            let repeat = 1;
            if (variant.emojiEvery > 0 && amount > 0) repeat = Math.max(1, Math.min(variant.emojiMax || 8, Math.floor(amount / variant.emojiEvery)));
            return { emoji: cheermote.name, emojiUrl: cheermote.url, repeat };
        }
        let emoji = variant.emoji;
        let emojiUrl = variant.emojiUrl || (/^(https?:\/\/|\/|data:image\/)/i.test(variant.emoji) ? variant.emoji : '');
        for (const step of variant.emojiLadder) {
            if (amount >= step.min) {
                emoji = step.emoji;
                if (step.emojiUrl) emojiUrl = step.emojiUrl;
                else if (/^(https?:\/\/|\/|data:image\/)/i.test(step.emoji)) emojiUrl = step.emoji;
            }
        }
        // If this is a bits alert and no custom media/emote was specified, fall back to Twitch official cheermote
        if (rule && rule.trigger === 'bits' && !emoji && !emojiUrl && !variant.image && !variant.video) {
            const detected = extractCheermoteFromText(ev?.cheermoteSource) || extractCheermoteFromText(ev?.message);
            const preferredPrefix = (variant.cheermoteFamily && variant.cheermoteFamily !== 'auto')
                ? variant.cheermoteFamily
                : (detected?.prefix || 'cheer');
            const cheermote = getTwitchCheermote((!variant.cheermoteFamily || variant.cheermoteFamily === 'auto') && detected?.bits ? detected.bits : amount, preferredPrefix);
            if (cheermote) {
                emoji = cheermote.name;
                emojiUrl = cheermote.url;
            }
        }
        let repeat = 1;
        if (variant.emojiEvery > 0 && amount > 0) {
            repeat = Math.max(1, Math.min(variant.emojiMax || 8, Math.floor(amount / variant.emojiEvery)));
            if (emoji && !emojiUrl) {
                emoji = emoji.repeat(repeat);
            }
        }
        return { emoji, emojiUrl, repeat };
    }

    function buildPayload(rule, variant, ev, test) {
        const tokens = tokensFor(ev);
        const emote = pickEmote(variant, eventAmount(ev), rule, ev);
        return {
            id: `a${Date.now().toString(36)}${(counter++).toString(36)}`,
            ruleId: rule.id,
            ruleName: rule.name,
            webhookOnly: Boolean(rule.webhookOnly),
            priority: rule.priority || 'normal',
            interrupt: Boolean(rule.interrupt),
            expireSeconds: rule.expireSeconds || 0,
            trigger: ev.type,
            variantId: variant.id,
            title: fill(variant.title, tokens),
            message: fill(variant.message, tokens),
            image: variant.image,
            video: variant.video,
            videoSound: Boolean(variant.videoSound),
            videoVolume: variant.videoVolume !== undefined ? variant.videoVolume : (variant.volume ?? 70),
            videoLoop: variant.videoLoop !== false,
            focusX: variant.focusX ?? 50,
            focusY: variant.focusY ?? 50,
            cheermoteFamily: variant.cheermoteFamily || 'auto',
            emoteSource: variant.emoteSource,
            emoji: emote.emoji,
            emojiUrl: emote.emojiUrl || '',
            emojiRepeat: emote.repeat,
            emoteEffect: variant.emoteEffect || 'showcase',
            emoteDensity: variant.emoteDensity || 30,
            emoteScale: variant.emoteScale || 100,
            sound: variant.sound,
            volume: variant.volume,
            animIn: variant.animIn,
            animOut: variant.animOut,
            durationMs: Math.round(variant.duration * 1000),
            user: ev.user || '',
            avatar: ev.avatar || '',
            recipient: ev.recipient || '',
            amount: eventAmount(ev),
            source: tokens.source,
            test: !!test,
            at: new Date().toISOString()
        };
    }

    async function runActions(rule, ev) {
        const { timer, http, chat, companion } = rule.actions;
        if (chat.enabled && chat.template && typeof sendChat === 'function') {
            const last = chatCooldowns.get(rule.id) || 0;
            if (Date.now() - last >= chat.cooldownSeconds * 1000) {
                chatCooldowns.set(rule.id, Date.now());
                const text = fill(chat.template, tokensFor(ev)).replace(/\s+/g, ' ').trim().slice(0, 400);
                if (text) Promise.resolve(sendChat(text)).catch(err => log(`[Alerts] Chat action failed: ${err.message}`));
            }
        }
        if (companion.enabled) {
            const delayMs = Math.round(companion.delay * 1000);
            const go = () => pressCompanion(companion).then(r => { if (!r.ok) log(`[Alerts] Companion action failed: ${r.error || r.status}`); });
            if (delayMs > 0) {
                const timerId = setTimeout(() => { activeWebhookTimers.delete(timerId); go(); }, delayMs);
                activeWebhookTimers.add(timerId);
            } else go();
        }
        if (timer.enabled && timer.timerId && runTimerAction) {
            try {
                const units = timer.perUnit ? Math.max(1, eventAmount(ev)) : 1;
                runTimerAction(timer.timerId, timer.action, { seconds: timer.seconds * units });
            } catch (err) { log(`[Alerts] Timer action failed: ${err.message}`); }
        }
        if (http.enabled && /^https?:\/\//i.test(http.url)) {
            const sendWebhook = async () => {
                try {
                    const body = { rule: rule.id, trigger: ev.type, user: ev.user || '', amount: eventAmount(ev), message: ev.message || '', at: new Date().toISOString() };
                    let res;
                    if (http.method === 'GET') {
                        const url = new URL(http.url);
                        Object.entries(body).forEach(([k, v]) => url.searchParams.set(k, String(v)));
                        res = await fetch(url, { signal: AbortSignal.timeout(5000) });
                    } else {
                        res = await fetch(http.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
                    }
                    if (!res.ok) {
                        log(`[Alerts] HTTP webhook request to ${http.url} failed with status ${res.status} ${res.statusText}`);
                    } else {
                        log(`[Alerts] HTTP webhook request to ${http.url} succeeded (${res.status})`);
                    }
                } catch (err) { log(`[Alerts] HTTP action failed: ${err.message}`); }
            };

            const delayMs = Math.max(0, Math.round((http.delay || 0) * 1000));
            if (delayMs > 0) {
                const timerId = setTimeout(() => {
                    activeWebhookTimers.delete(timerId);
                    sendWebhook();
                }, delayMs);
                activeWebhookTimers.add(timerId);
            } else {
                sendWebhook();
            }
        }
    }

    function dropPayload(payload, reason) {
        recordEvent({ type: payload.trigger, user: payload.user }, payload, reason);
        log(`[Alerts] Dropped (${reason}): ${payload.ruleName}`);
    }

    function pump() {
        if (paused || muted || current) return;
        while (queue.length) {
            const next = queue.shift();
            if (next.expireSeconds && Date.now() - next.queuedAt > next.expireSeconds * 1000) { dropPayload(next, 'dropped'); continue; }
            current = next;
            break;
        }
        if (!current) return;
        notify('alert', current);
        history.unshift({ ...current, shownAt: new Date().toISOString() });
        history.length = Math.min(history.length, HISTORY_LIMIT);
        const hold = current.durationMs + (config.settings.gapSeconds * 1000);
        currentTimer = setTimeout(() => { current = null; currentTimer = null; pump(); }, hold);
    }

    function interruptCurrent() {
        if (currentTimer) clearTimeout(currentTimer);
        current = null; currentTimer = null;
        notify('alert-skip', {});
    }

    function enqueue(payload) {
        payload.queuedAt = Date.now();
        const rank = PRIORITY_RANK[payload.priority] ?? 1;
        let at = queue.length;
        while (at > 0 && (PRIORITY_RANK[queue[at - 1].priority] ?? 1) < rank) at--;
        queue.splice(at, 0, payload);
        const cap = config.settings.queueCap || 200;
        while (queue.length > cap) {
            // Lowest priority first, oldest within that tier
            const lowest = PRIORITY_RANK[queue[queue.length - 1].priority] ?? 1;
            const victim = queue.findIndex(item => (PRIORITY_RANK[item.priority] ?? 1) === lowest);
            dropPayload(queue.splice(victim, 1)[0], 'dropped');
        }
        if (payload.interrupt && current && !paused && !muted && queue[0] === payload) interruptCurrent();
        pump();
    }

    // Returns the payload that was queued, or null when nothing matched / was blocked
    function handleEvent(ev, { test = false, runActionsForTest = false, replay = false } = {}) {
        if (!ev || !ev.type) return null;
        const isTest = Boolean(test || ev.isTest || ev.test);
        if (isTest) ev.isTest = true;
        if (!isTest && !config.settings.enabled) { recordEvent(ev, null, 'alerts off'); return null; }

        if (!isTest) {
            const key = `${ev.type}|${ev.user}|${ev.command ?? ''}|${ev.amount ?? ''}|${ev.months ?? ''}|${ev.reward ?? ''}|${ev.name ?? ''}`;
            const now = Date.now();
            if (now >= nextRecentPruneAt) {
                for (const [k, t] of recent) if (now - t > 600000) recent.delete(k);
                nextRecentPruneAt = now + 1000;
            }
            if (recent.has(key) && now - recent.get(key) < (ev.dedupeMs ?? 8000)) return null;
            recent.delete(key);
            recent.set(key, now);
            if (recent.size > 10000) recent.delete(recent.keys().next().value);
        }

        let rule = null;
        let effective = ev;
        // A milestone resub replaces the plain resub alert
        if (ev.type === 'resub') {
            const milestoneEvent = { ...ev, type: 'milestone' };
            const milestoneRule = chooseRule(milestoneEvent);
            if (milestoneRule) { rule = milestoneRule; effective = milestoneEvent; }
        }
        if (!rule) rule = chooseRule(ev);
        if (!rule) { if (!isTest && ev.type !== 'chat_word' && ev.type !== 'chat_command') recordEvent(ev, null, 'no matching rule'); return null; }

        const cooldown = rule.conditions.cooldownSeconds * 1000;
        const now = Date.now();
        if (!isTest && cooldown && now - (cooldowns.get(rule.id) || 0) < cooldown) { recordEvent(ev, null, 'cooldown'); return null; }
        if (!isTest) cooldowns.set(rule.id, now);

        const variant = chooseVariant(rule, effective);
        const payload = buildPayload(rule, variant, effective, isTest);
        if (!isTest || runActionsForTest) runActions(rule, effective);
        if (!isTest) recordEvent(effective, payload, rule.webhookOnly ? 'webhook' : 'shown');
        if (!rule.webhookOnly) {
            enqueue(payload);
        }
        log(`[Alerts] ${isTest ? 'Test ' : ''}${rule.webhookOnly ? 'Webhook-only ' : ''}${rule.name}: ${payload.title || payload.message || effective.type}`);
        return payload;
    }

    // Fire one specific rule/variant regardless of conditions (the manager's Test buttons)
    function fireRule(ruleId, variantId, overrides = {}) {
        const rule = config.rules.find(item => item.id === ruleId);
        if (!rule || !rule.variants.length) throw new Error('Rule not found or has no variants');
        const testAmt = (overrides.amount !== undefined && overrides.amount !== '') ? Number(overrides.amount) : null;
        const ev = {
            type: rule.trigger,
            user: str(overrides.user, 60) || 'TestViewer',
            recipient: str(overrides.recipient, 60) || 'TestRecipient',
            amount: testAmt ?? (rule.conditions.amountMode === 'exact' ? rule.conditions.exactAmount : rule.conditions.minAmount) ?? 100,
            source: overrides.source || (rule.conditions.source !== 'any' ? rule.conditions.source : ''),
            count: Number(overrides.count) || testAmt || Math.max(1, rule.conditions.minAmount || 5),
            months: Number(overrides.months) || testAmt || rule.conditions.milestones[0] || rule.conditions.everyMonths || 12,
            streak: Number(overrides.streak) || 6,
            tier: overrides.tier || (rule.conditions.tiers?.[0] || '1000'),
            tierLabel: overrides.tierLabel || (overrides.tier === 'prime' ? 'Prime' : overrides.tier === '2000' ? 'Tier 2' : overrides.tier === '3000' ? 'Tier 3' : 'Tier 1'),
            message: str(overrides.message, 200) || 'This is a test message',
            reward: rule.conditions.rewardName || 'Test reward',
            name: rule.conditions.timerId || rule.conditions.goalId || 'Test',
            keyword: rule.conditions.keywords[0] || '',
            viewers: Number(overrides.viewers) || testAmt || 25
        };
        if (rule.trigger === 'bits') ev.cheermoteSource = str(overrides.cheermoteSource, 200) || `Cheer${Math.max(1, Math.round(Number(ev.amount) || 1))}`;
        const variant = (variantId ? rule.variants.find(item => item.id === variantId) : null) || chooseVariant(rule, ev);
        const payload = buildPayload(rule, variant, ev, true);
        if (overrides.runActions !== false) {
            runActions(rule, ev);
        }
        if (!rule.webhookOnly && !overrides.webhookOnly) {
            enqueue(payload);
        }
        return payload;
    }

    // Manual fire (API / Companion / dock): behaves like a real event, flagged source 'manual'
    function trigger(ref, opts = {}) {
        const key = String(ref || '').trim().toLowerCase();
        const rule = config.rules.find(item => item.id === key) || config.rules.find(item => item.name.toLowerCase() === key);
        if (!rule) throw new Error('Rule not found');
        if (!rule.variants.length) throw new Error('Rule has no variants');
        const test = opts.test === true;
        if (!rule.enabled && !test) throw new Error('Rule is disabled');
        const amount = opts.amount !== undefined && opts.amount !== '' && Number.isFinite(Number(opts.amount)) ? Number(opts.amount) : 0;
        const text = str(opts.message, 500);
        const ev = {
            type: rule.trigger,
            user: str(opts.user, 60) || (rule.trigger === 'announcement' ? '' : 'Someone'),
            amount, count: amount || undefined, months: amount || undefined, viewers: amount || undefined,
            message: text,
            title: str(opts.title, 200),
            source: 'manual',
            manual: true,
            isTest: test
        };
        const variant = chooseVariant(rule, ev);
        const payload = buildPayload(rule, variant, ev, test);
        payload.source = 'manual';
        if (text && rule.trigger === 'announcement') payload.message = text;
        if (!test) {
            runActions(rule, ev);
            recordEvent(ev, payload, rule.webhookOnly ? 'webhook' : 'shown');
        }
        if (!rule.webhookOnly) enqueue(payload);
        log(`[Alerts] Manual ${rule.name}`);
        return { alert: payload, queued: !rule.webhookOnly, pending: queue.length, playing: current === payload };
    }

    // Gift subs arrive one event at a time, so batch them per gifter into a single alert
    function noteGift({ user, avatar, recipient, tier, tierLabel }) {
        const key = String(user || 'Anonymous').toLowerCase();
        const now = Date.now();
        let batch = gifts.get(key);
        if (!batch) {
            batch = { user: user || 'Anonymous', avatar, recipient, tier, tierLabel, count: 0, first: now, timer: null, recipients: [] };
            gifts.set(key, batch);
        }
        batch.count++;
        if (recipient) {
            batch.recipient = recipient;
            if (!batch.recipients.includes(recipient)) batch.recipients.push(recipient);
        }
        if (avatar) batch.avatar = avatar;
        clearTimeout(batch.timer);
        const wait = Math.max(0, Math.min(GIFT_QUIET_MS, batch.first + GIFT_MAX_MS - now));
        batch.timer = setTimeout(() => {
            gifts.delete(key);
            const recipientStr = batch.count === 1 ? (batch.recipient || '') : (batch.recipients.join(', ') || batch.recipient || '');
            handleEvent({
                type: 'gift',
                user: batch.user,
                avatar: batch.avatar,
                count: batch.count,
                amount: batch.count,
                recipient: recipientStr,
                tier: batch.tier,
                tierLabel: batch.tierLabel,
                dedupeMs: 0
            });
        }, wait);
    }

    // Re-run a past event through the current rules (no timer/HTTP actions, no cooldown)
    function replayEvent(eventId) {
        const entry = events.find(item => item.id === eventId);
        if (!entry) throw new Error('Event not found');
        const payload = handleEvent({ ...entry.event }, { test: true });
        if (!payload) throw new Error('No enabled rule matches that event right now');
        return payload;
    }
    function replayAlert(alertId) {
        const old = history.find(item => item.id === alertId);
        if (!old) throw new Error('Alert not found');
        const { shownAt, ...rest } = old;
        const payload = { ...rest, id: `a${Date.now().toString(36)}${(counter++).toString(36)}`, test: true, at: new Date().toISOString() };
        enqueue(payload);
        return payload;
    }

    function setMuted(value) {
        muted = Boolean(value);
        if (!muted) pump();
        return muted;
    }

    function control(action) {
        if (action === 'pause') { paused = true; return; }
        if (action === 'resume') { paused = false; pump(); return; }
        if (action === 'clear') {
            queue.length = 0;
            notify('alert-clear', {});
            if (currentTimer) clearTimeout(currentTimer);
            current = null; currentTimer = null;
            return;
        }
        if (action === 'clear-log') {
            events.length = 0;
            history.length = 0;
            clearTimeout(saveEventsTimer);
            try { fs.writeFileSync(eventsPath, '[]'); } catch { /* read-only */ }
            return;
        }
        if (action === 'skip') {
            if (currentTimer) clearTimeout(currentTimer);
            current = null; currentTimer = null;
            notify('alert-skip', {});
            pump();
            return;
        }
        throw new Error('Unknown queue action');
    }

    function stop() {
        clearTimeout(currentTimer);
        currentTimer = null;
        current = null;
        queue.length = 0;
        for (const t of activeWebhookTimers) clearTimeout(t);
        activeWebhookTimers.clear();
        for (const batch of gifts.values()) clearTimeout(batch.timer);
        gifts.clear();
        recent.clear();
        cooldowns.clear();
        sequence.clear();
        lastVariant.clear();
        clearTimeout(saveEventsTimer);
        saveEventsTimer = null;
        fs.writeFileSync(eventsPath, JSON.stringify(events));
    }

    function alertAssetUsers(name, assetReferencedIn) {
        const users = [];
        const isRef = (val) => {
            if (!val || typeof val !== 'string') return false;
            return typeof assetReferencedIn === 'function' ? assetReferencedIn(val, name, null) : val.includes(name);
        };
        for (const rule of config.rules || []) {
            let matched = false;
            for (const v of rule.variants || []) {
                if (isRef(v.image) || isRef(v.video) || isRef(v.sound)) {
                    matched = true;
                    break;
                }
            }
            if (matched) {
                users.push({
                    id: `alert:${rule.id}`,
                    name: `Alert: ${rule.name || TRIGGERS[rule.trigger] || rule.trigger}`
                });
            }
        }
        return users;
    }

    function rewriteAlertReferences(oldName, newName, rewriteAssetReferences) {
        if (typeof rewriteAssetReferences !== 'function') return false;
        let changed = false;
        for (const rule of config.rules || []) {
            for (const v of rule.variants || []) {
                for (const key of ['image', 'video', 'sound']) {
                    if (v[key] && typeof v[key] === 'string') {
                        const next = rewriteAssetReferences(v[key], oldName, newName, null, null);
                        if (next !== v[key]) {
                            v[key] = next;
                            changed = true;
                        }
                    }
                }
            }
        }
        if (changed) save();
        return changed;
    }

    return {
        TRIGGERS, ANIM_IN, ANIM_OUT, TIMER_ACTIONS, PRIORITIES,
        getConfig: () => config,
        setConfig(next) {
            config = normalizeConfig(next);
            const ruleIds = new Set(config.rules.map(rule => rule.id));
            for (const map of [cooldowns, sequence, lastVariant]) {
                for (const id of map.keys()) if (!ruleIds.has(id)) map.delete(id);
            }
            save();
            return config;
        },
        reload() {
            try { config = normalizeConfig(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { config = normalizeConfig({}); }
            try { events = JSON.parse(fs.readFileSync(eventsPath, 'utf8')).slice(0, EVENT_LIMIT); } catch { events = []; }
            const ruleIds = new Set(config.rules.map(rule => rule.id));
            for (const map of [cooldowns, sequence, lastVariant]) {
                for (const id of map.keys()) if (!ruleIds.has(id)) map.delete(id);
            }
            return config;
        },
        getQueueState: () => ({ pending: queue.length, current, paused, muted, history, events }),
        replayEvent, replayAlert,
        handleEvent, fireRule, trigger, noteGift, pressCompanion, control, setMuted, stop,
        alertAssetUsers, rewriteAlertReferences
    };
}

module.exports = {
    createAlertEngine,
    normalizeConfig,
    TRIGGERS,
    ANIM_IN,
    ANIM_OUT,
    TWITCH_CHEERMOTES,
    TWITCH_CHEERMOTE_FAMILIES,
    getTwitchCheermote,
    extractCheermoteFromText,
    extractAllCheermotes,
    resolveViewerCheermote
};
