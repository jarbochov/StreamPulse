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
    chat_word: 'Chat word or hashtag'
};
const ANIM_IN = ['none', 'fade', 'pop', 'zoom', 'bounce', 'flip', 'spin', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];
const ANIM_OUT = ['none', 'fade', 'pop', 'zoom', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];
const TIMER_ACTIONS = ['start', 'pause', 'resume', 'reset', 'add_time', 'subtract_time'];
const HISTORY_LIMIT = 50;
const EVENT_LIMIT = 100;
const GIFT_QUIET_MS = 4000;
const GIFT_MAX_MS = 15000;

const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const str = (value, max) => String(value ?? '').trim().slice(0, max);
const safeId = (value, fallback) => (String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)) || fallback;

function defaultSettings() {
    return { enabled: true, gapSeconds: 2 };
}

function normalizeVariant(input = {}, index = 0) {
    return {
        id: safeId(input.id, `v${index + 1}`),
        title: str(input.title, 200),
        message: str(input.message, 500),
        image: str(input.image, 2000),
        video: str(input.video, 2000),
        emoji: str(input.emoji, 40),
        emojiLadder: Array.isArray(input.emojiLadder)
            ? input.emojiLadder.slice(0, 12).map(step => ({ min: clamp(step?.min, 0, 1e9, 0), emoji: str(step?.emoji, 40) })).filter(step => step.emoji).sort((a, b) => a.min - b.min)
            : [],
        emojiEvery: clamp(input.emojiEvery, 0, 1e6, 0),
        emojiMax: Math.round(clamp(input.emojiMax, 1, 20, 8)),
        sound: str(input.sound, 2000),
        volume: clamp(input.volume, 0, 100, 70),
        animIn: ANIM_IN.includes(input.animIn) ? input.animIn : 'pop',
        animOut: ANIM_OUT.includes(input.animOut) ? input.animOut : 'fade',
        duration: clamp(input.duration, 1, 120, 6),
        weight: clamp(input.weight, 1, 100, 1)
    };
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
    return {
        id: safeId(input.id, `rule-${index + 1}`),
        name: str(input.name, 80) || TRIGGERS[trigger],
        enabled: input.enabled !== false,
        trigger,
        conditions: {
            minAmount: clamp(c.minAmount, 0, 1e9, 0),
            maxAmount: clamp(c.maxAmount, 0, 1e9, 0),
            tier: ['', '1000', '2000', '3000', 'prime'].includes(c.tier) ? c.tier : '',
            rewardName: str(c.rewardName, 120),
            keywords: Array.isArray(c.keywords) ? c.keywords.map(k => str(k, 60).toLowerCase()).filter(Boolean).slice(0, 30) : [],
            timerId: str(c.timerId, 80),
            goalId: str(c.goalId, 80),
            milestones: Array.isArray(c.milestones) ? [...new Set(c.milestones.map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 1200))].sort((x, y) => x - y).slice(0, 40) : [],
            everyMonths: clamp(c.everyMonths, 0, 120, 0),
            cooldownSeconds: clamp(c.cooldownSeconds, 0, 86400, trigger === 'chat_word' ? 30 : 0)
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
                method: a.http?.method === 'GET' ? 'GET' : 'POST'
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
            gapSeconds: clamp(input.settings?.gapSeconds, 0, 60, 2)
        },
        rules
    };
}

function fill(template, tokens) {
    return String(template || '').replace(/\{\{\s*alert\.([a-z_]+)\s*\}\}/gi, (_, key) => {
        const value = tokens[key.toLowerCase()];
        return value === undefined || value === null ? '' : String(value);
    });
}

function createAlertEngine({ dataDir, broadcast, runTimerAction, log = console.log }) {
    const filePath = path.join(dataDir, 'alerts.json');
    let config = normalizeConfig({});
    try { config = normalizeConfig(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* first run */ }

    const queue = [];
    let current = null;
    let currentTimer = null;
    let paused = false;
    const history = [];
    const eventsPath = path.join(dataDir, 'alert-events.json');
    let events = [];
    try { events = JSON.parse(fs.readFileSync(eventsPath, 'utf8')).slice(0, EVENT_LIMIT); } catch { /* none yet */ }
    let saveEventsTimer = null;
    function recordEvent(ev, payload, status) {
        const entry = { id: `e${Date.now().toString(36)}${(counter++).toString(36)}`, at: new Date().toISOString(), event: ev, status, title: payload ? payload.title || payload.message : '' };
        events.unshift(entry);
        events.length = Math.min(events.length, EVENT_LIMIT);
        clearTimeout(saveEventsTimer);
        saveEventsTimer = setTimeout(() => { try { fs.writeFileSync(eventsPath, JSON.stringify(events)); } catch { /* disk full or read-only */ } }, 1000);
        return entry;
    }
    const cooldowns = new Map();
    const sequence = new Map();
    const lastVariant = new Map();
    const recent = new Map();
    const gifts = new Map();
    let counter = 0;

    function save() {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    }

    function eventAmount(ev) {
        switch (ev.type) {
            case 'bits': case 'donation': case 'raid': case 'redeem': return Number(ev.amount) || 0;
            case 'gift': return Number(ev.count) || 1;
            case 'sub': case 'resub': case 'milestone': return Number(ev.months) || 0;
            default: return Number(ev.amount) || 0;
        }
    }

    function matches(rule, ev) {
        if (!rule.enabled || rule.trigger !== ev.type) return false;
        const c = rule.conditions;
        const amount = eventAmount(ev);
        if (c.minAmount && amount < c.minAmount) return false;
        if (c.maxAmount && amount > c.maxAmount) return false;
        if (c.tier && String(ev.tier || '') !== c.tier) return false;
        if (rule.trigger === 'redeem' && c.rewardName && !String(ev.reward || '').toLowerCase().includes(c.rewardName.toLowerCase())) return false;
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
        if (rule.trigger === 'milestone') {
            const months = Number(ev.months) || 0;
            if (!months) return false;
            const listed = c.milestones.includes(months);
            const periodic = c.everyMonths > 0 && months % c.everyMonths === 0;
            if (!listed && !periodic) return false;
        }
        return true;
    }

    function chooseRule(ev) {
        const candidates = config.rules.filter(rule => matches(rule, ev) && rule.variants.length);
        // Highest threshold wins so tiered rules (100 bits vs 1000 bits) pick the most specific; a rule with a sub tier (e.g. Prime) beats an "Any tier" rule
        candidates.sort((a, b) => (b.conditions.minAmount - a.conditions.minAmount) || (b.conditions.milestones.length - a.conditions.milestones.length) || (Number(!!b.conditions.tier) - Number(!!a.conditions.tier)));
        return candidates[0] || null;
    }

    function chooseVariant(rule) {
        const list = rule.variants;
        if (list.length === 1) return list[0];
        if (rule.pick === 'sequential') {
            const index = (sequence.get(rule.id) || 0) % list.length;
            sequence.set(rule.id, index + 1);
            return list[index];
        }
        const previous = lastVariant.get(rule.id);
        const pool = list.filter(variant => variant.id !== previous);
        const weights = rule.pick === 'weighted' ? pool.map(v => v.weight) : pool.map(() => 1);
        let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);
        for (let i = 0; i < pool.length; i++) {
            roll -= weights[i];
            if (roll <= 0) { lastVariant.set(rule.id, pool[i].id); return pool[i]; }
        }
        const fallback = pool[pool.length - 1];
        lastVariant.set(rule.id, fallback.id);
        return fallback;
    }

    function tokensFor(ev) {
        return {
            user: ev.user || 'Someone',
            recipient: ev.recipient || '',
            amount: ev.amount ?? '',
            count: ev.count ?? '',
            months: ev.months ?? '',
            streak: ev.streak ?? '',
            tier: ev.tierLabel || '',
            message: ev.message || '',
            reward: ev.reward || '',
            viewers: ev.viewers ?? ev.amount ?? '',
            name: ev.name || '',
            keyword: ev.keyword || ''
        };
    }

    // Highest ladder step at or below the amount wins; "one per N" repeats it, capped by emojiMax.
    function pickEmoji(variant, amount) {
        let emoji = variant.emoji;
        for (const step of variant.emojiLadder) if (amount >= step.min) emoji = step.emoji;
        if (emoji && variant.emojiEvery > 0 && amount > 0) {
            emoji = emoji.repeat(Math.max(1, Math.min(variant.emojiMax, Math.floor(amount / variant.emojiEvery))));
        }
        return emoji;
    }

    function buildPayload(rule, variant, ev, test) {
        const tokens = tokensFor(ev);
        return {
            id: `a${Date.now().toString(36)}${(counter++).toString(36)}`,
            ruleId: rule.id,
            ruleName: rule.name,
            trigger: ev.type,
            variantId: variant.id,
            title: fill(variant.title, tokens),
            message: fill(variant.message, tokens),
            image: variant.image,
            video: variant.video,
            emoji: pickEmoji(variant, eventAmount(ev)),
            sound: variant.sound,
            volume: variant.volume,
            animIn: variant.animIn,
            animOut: variant.animOut,
            durationMs: Math.round(variant.duration * 1000),
            user: ev.user || '',
            avatar: ev.avatar || '',
            amount: eventAmount(ev),
            test: !!test,
            at: new Date().toISOString()
        };
    }

    async function runActions(rule, ev) {
        const { timer, http } = rule.actions;
        if (timer.enabled && timer.timerId && runTimerAction) {
            try {
                const units = timer.perUnit ? Math.max(1, eventAmount(ev)) : 1;
                runTimerAction(timer.timerId, timer.action, { seconds: timer.seconds * units });
            } catch (err) { log(`[Alerts] Timer action failed: ${err.message}`); }
        }
        if (http.enabled && /^https?:\/\//i.test(http.url)) {
            try {
                const body = { rule: rule.id, trigger: ev.type, user: ev.user || '', amount: eventAmount(ev), message: ev.message || '', at: new Date().toISOString() };
                if (http.method === 'GET') {
                    const url = new URL(http.url);
                    Object.entries(body).forEach(([k, v]) => url.searchParams.set(k, String(v)));
                    await fetch(url, { signal: AbortSignal.timeout(5000) });
                } else {
                    await fetch(http.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
                }
            } catch (err) { log(`[Alerts] HTTP action failed: ${err.message}`); }
        }
    }

    function pump() {
        if (paused || current || !queue.length) return;
        current = queue.shift();
        broadcast('alert', current);
        history.unshift({ ...current, shownAt: new Date().toISOString() });
        history.length = Math.min(history.length, HISTORY_LIMIT);
        const hold = current.durationMs + (config.settings.gapSeconds * 1000);
        currentTimer = setTimeout(() => { current = null; currentTimer = null; pump(); }, hold);
    }

    function enqueue(payload) {
        queue.push(payload);
        if (queue.length > 100) queue.shift();
        pump();
    }

    // Returns the payload that was queued, or null when nothing matched / was blocked
    function handleEvent(ev, { test = false, runActionsForTest = false, replay = false } = {}) {
        if (!ev || !ev.type) return null;
        if (!test && !config.settings.enabled) { recordEvent(ev, null, 'alerts off'); return null; }

        if (!test) {
            const key = `${ev.type}|${ev.user}|${ev.amount ?? ''}|${ev.months ?? ''}|${ev.reward ?? ''}|${ev.name ?? ''}`;
            const now = Date.now();
            if (recent.has(key) && now - recent.get(key) < (ev.dedupeMs ?? 8000)) return null;
            recent.set(key, now);
            if (recent.size > 500) for (const [k, t] of recent) if (now - t > 600000) recent.delete(k);
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
        if (!rule) { if (!test) recordEvent(ev, null, 'no matching rule'); return null; }

        const cooldown = rule.conditions.cooldownSeconds * 1000;
        const now = Date.now();
        if (!test && cooldown && now - (cooldowns.get(rule.id) || 0) < cooldown) { recordEvent(ev, null, 'cooldown'); return null; }
        cooldowns.set(rule.id, now);

        const variant = chooseVariant(rule);
        const payload = buildPayload(rule, variant, effective, test);
        if (!test || runActionsForTest) runActions(rule, effective);
        if (!test) recordEvent(effective, payload, 'shown');
        enqueue(payload);
        log(`[Alerts] ${test ? 'Test ' : ''}${rule.name}: ${payload.title || payload.message || effective.type}`);
        return payload;
    }

    // Fire one specific rule/variant regardless of conditions (the manager's Test buttons)
    function fireRule(ruleId, variantId, overrides = {}) {
        const rule = config.rules.find(item => item.id === ruleId);
        if (!rule || !rule.variants.length) throw new Error('Rule not found or has no variants');
        const variant = rule.variants.find(item => item.id === variantId) || chooseVariant(rule);
        const ev = {
            type: rule.trigger,
            user: str(overrides.user, 60) || 'TestViewer',
            amount: Number(overrides.amount) || rule.conditions.minAmount || 100,
            count: Number(overrides.count) || Math.max(1, rule.conditions.minAmount || 5),
            months: Number(overrides.months) || rule.conditions.milestones[0] || rule.conditions.everyMonths || 12,
            streak: Number(overrides.streak) || 6,
            tierLabel: 'Tier 1',
            message: str(overrides.message, 200) || 'This is a test message',
            reward: rule.conditions.rewardName || 'Test reward',
            name: rule.conditions.timerId || rule.conditions.goalId || 'Test',
            keyword: rule.conditions.keywords[0] || '',
            viewers: Number(overrides.amount) || 25
        };
        const payload = buildPayload(rule, variant, ev, true);
        enqueue(payload);
        return payload;
    }

    // Gift subs arrive one event at a time, so batch them per gifter into a single alert
    function noteGift({ user, avatar, recipient, tier, tierLabel }) {
        const key = String(user || 'Anonymous').toLowerCase();
        const now = Date.now();
        let batch = gifts.get(key);
        if (!batch) {
            batch = { user: user || 'Anonymous', avatar, recipient, tier, tierLabel, count: 0, first: now, timer: null };
            gifts.set(key, batch);
        }
        batch.count++;
        if (recipient) batch.recipient = recipient;
        if (avatar) batch.avatar = avatar;
        clearTimeout(batch.timer);
        const wait = Math.max(0, Math.min(GIFT_QUIET_MS, batch.first + GIFT_MAX_MS - now));
        batch.timer = setTimeout(() => {
            gifts.delete(key);
            handleEvent({ type: 'gift', user: batch.user, avatar: batch.avatar, count: batch.count, amount: batch.count, recipient: batch.count === 1 ? batch.recipient : '', tier: batch.tier, tierLabel: batch.tierLabel, dedupeMs: 0 });
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

    function control(action) {
        if (action === 'pause') { paused = true; return; }
        if (action === 'resume') { paused = false; pump(); return; }
        if (action === 'clear') {
            queue.length = 0;
            broadcast('alert-clear', {});
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
            broadcast('alert-skip', {});
            pump();
            return;
        }
        throw new Error('Unknown queue action');
    }

    return {
        TRIGGERS, ANIM_IN, ANIM_OUT, TIMER_ACTIONS,
        getConfig: () => config,
        setConfig(next) { config = normalizeConfig(next); save(); return config; },
        getQueueState: () => ({ pending: queue.length, current, paused, history, events }),
        replayEvent, replayAlert,
        handleEvent, fireRule, noteGift, control
    };
}

module.exports = { createAlertEngine, normalizeConfig, TRIGGERS, ANIM_IN, ANIM_OUT };
