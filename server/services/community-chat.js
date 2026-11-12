const DEFAULT_COMMUNITY_CHAT = {
    welcomeEnabled: false, welcomeDays: 30, welcomeTemplate: 'Welcome back, @{{user}}! It has been {{days}} days.',
    messagesEnabled: false, messagesEvery: 100, messagesTemplate: '@{{user}} reached {{count}} recorded messages!',
    streamsEnabled: false, streamsEvery: 10, streamsTemplate: '@{{user}} has chatted in approximately {{count}} recorded streams!',
    chatAnniversaryEnabled: false, chatAnniversaryYears: 1, chatAnniversaryTemplate: 'It has been {{years}} years since we first observed @{{user}} in chat!',
    followAnniversaryEnabled: false, followAnniversaryYears: 1, followAnniversaryTemplate: "It's {{years}} years since @{{user}}'s recorded Twitch follow date!",
    subscriptionEnabled: false, subscriptionMonths: [3, 6, 12, 24], subscriptionRepeatMonths: 12,
    subscriptionTemplate: 'We have observed {{months}} subscription months for @{{user}}!',
    anniversaryGraceDays: 7, spacingSeconds: 10, expiryMinutes: 5
};

function normalizeCommunityChat(input = {}) {
    const defaults = DEFAULT_COMMUNITY_CHAT;
    const value = (key, min, max) => {
        const n = Number(input[key]);
        return Number.isFinite(n) && input[key] !== '' && input[key] != null
            ? Math.max(min, Math.min(max, Math.round(n))) : defaults[key];
    };
    const text = key => String(input[key] ?? defaults[key]).replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 400) || defaults[key];
    const rawMonths = Array.isArray(input.subscriptionMonths) ? input.subscriptionMonths : String(input.subscriptionMonths || '').split(',');
    const months = [...new Set(rawMonths.map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 600))].sort((a, b) => a - b).slice(0, 50);
    return {
        welcomeEnabled: input.welcomeEnabled === true, welcomeDays: value('welcomeDays', 1, 36500), welcomeTemplate: text('welcomeTemplate'),
        messagesEnabled: input.messagesEnabled === true, messagesEvery: value('messagesEvery', 1, 10000000), messagesTemplate: text('messagesTemplate'),
        streamsEnabled: input.streamsEnabled === true, streamsEvery: value('streamsEvery', 1, 100000), streamsTemplate: text('streamsTemplate'),
        chatAnniversaryEnabled: input.chatAnniversaryEnabled === true, chatAnniversaryYears: value('chatAnniversaryYears', 1, 100), chatAnniversaryTemplate: text('chatAnniversaryTemplate'),
        followAnniversaryEnabled: input.followAnniversaryEnabled === true, followAnniversaryYears: value('followAnniversaryYears', 1, 100), followAnniversaryTemplate: text('followAnniversaryTemplate'),
        subscriptionEnabled: input.subscriptionEnabled === true, subscriptionMonths: months.length ? months : [...defaults.subscriptionMonths],
        subscriptionRepeatMonths: value('subscriptionRepeatMonths', 0, 600), subscriptionTemplate: text('subscriptionTemplate'),
        anniversaryGraceDays: value('anniversaryGraceDays', 0, 365), spacingSeconds: value('spacingSeconds', 1, 3600),
        expiryMinutes: value('expiryMinutes', 1, 1440)
    };
}

function anniversary(date, now, interval, graceDays) {
    const start = new Date(date);
    const current = new Date(now);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(current.getTime())) return null;
    const years = current.getUTCFullYear() - start.getUTCFullYear();
    if (years < 1 || years % interval) return null;
    const month = start.getUTCMonth();
    const day = Math.min(start.getUTCDate(), new Date(Date.UTC(current.getUTCFullYear(), month + 1, 0)).getUTCDate());
    const anniversaryDay = Date.UTC(current.getUTCFullYear(), month, day);
    const currentDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
    const elapsed = (currentDay - anniversaryDay) / 86400000;
    return elapsed >= 0 && elapsed <= graceDays ? years : null;
}

function createCommunityChat({
    getSettings, isReady, isLive, isTrackingReady, getFollow, hasAnnounced, markAnnounced, send,
    now = Date.now, warn = console.warn
}) {
    const queue = [];
    const pending = new Set();
    let timer = null;
    let sending = false;
    let lastSent = 0;
    const active = () => isTrackingReady() && isLive() && isReady();
    function clear() {
        clearTimeout(timer);
        timer = null;
        queue.length = 0;
        pending.clear();
    }
    function pump() {
        if (sending) return;
        clearTimeout(timer);
        timer = null;
        if (!active()) { clear(); return; }
        const cfg = getSettings();
        while (queue.length && (now() - queue[0].at > cfg.expiryMinutes * 60000 || !cfg[queue[0].feature])) {
            pending.delete(queue.shift().key);
        }
        if (!queue.length) return;
        const delay = Math.max(0, lastSent + cfg.spacingSeconds * 1000 - now());
        if (delay) {
            timer = setTimeout(pump, delay);
            timer.unref?.();
            return;
        }
        const item = queue.shift();
        pending.delete(item.key);
        if (!markAnnounced(item.key)) { pump(); return; }
        sending = true;
        lastSent = now();
        Promise.resolve().then(() => active() && send(item.text)).catch(err => warn(`[Community] Chat announcement failed: ${err.message}`))
            .finally(() => { sending = false; pump(); });
    }
    function enqueue(feature, key, template, tokens, at) {
        if (!getSettings()[feature] || pending.has(key) || hasAnnounced(key) || queue.length >= 100) return;
        const text = template.replace(/\{\{\s*(user|days|count|years|months)\s*\}\}/gi, (_, token) => String(tokens[token.toLowerCase()] ?? ''));
        queue.push({ feature, key, text, at });
        pending.add(key);
    }
    function handle(activity) {
        if (!active()) return;
        const cfg = getSettings();
        const at = Number(activity.at);
        if (!Number.isFinite(at) || now() - at > cfg.expiryMinutes * 60000 || at > now() + 5000) return;
        const user = String(activity.user || '').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 60);
        const key = user.toLowerCase();
        if (!key) return;
        if (activity.kind === 'subscription') {
            const months = Number(activity.months) || 0;
            const last = cfg.subscriptionMonths[cfg.subscriptionMonths.length - 1];
            const threshold = cfg.subscriptionMonths.includes(months)
                || cfg.subscriptionRepeatMonths > 0 && months > last && (months - last) % cfg.subscriptionRepeatMonths === 0;
            if (threshold && months > activity.previousMonths) {
                enqueue('subscriptionEnabled', `subscription:${key}:${months}`, cfg.subscriptionTemplate, { user, months }, at);
            }
        } else if (activity.kind === 'chat') {
            const previous = Date.parse(activity.previousLastSeen || '');
            const days = Math.floor((at - previous) / 86400000);
            if (Number.isFinite(previous) && days >= cfg.welcomeDays) {
                enqueue('welcomeEnabled', `return:${key}:${previous}`, cfg.welcomeTemplate, { user, days }, at);
            }
            const count = Number(activity.totalMessages) || 0;
            if (count > 0 && count % cfg.messagesEvery === 0) {
                enqueue('messagesEnabled', `messages:${key}:${count}`, cfg.messagesTemplate, { user, count }, at);
            }
            const streams = Number(activity.streams) || 0;
            if (streams > activity.oldStreams && streams % cfg.streamsEvery === 0) {
                enqueue('streamsEnabled', `streams:${key}:${streams}`, cfg.streamsTemplate, { user, count: streams }, at);
            }
            const years = cfg.chatAnniversaryEnabled && anniversary(activity.firstSeen, at, cfg.chatAnniversaryYears, cfg.anniversaryGraceDays);
            if (years) enqueue('chatAnniversaryEnabled', `chat-anniversary:${key}:${activity.firstSeen}:${years}`, cfg.chatAnniversaryTemplate, { user, years }, at);
            if (cfg.followAnniversaryEnabled && String(activity.type || '').toLowerCase() === 'twitch') {
                const follow = getFollow(user);
                const followYears = follow && anniversary(follow.followedAt, at, cfg.followAnniversaryYears, cfg.anniversaryGraceDays);
                if (followYears) enqueue('followAnniversaryEnabled', `follow-anniversary:${key}:${follow.followedAt}:${followYears}`, cfg.followAnniversaryTemplate, { user, years: followYears }, at);
            }
        }
        pump();
    }
    return { handle, stop: clear, configChanged: () => { if (!active()) clear(); else pump(); } };
}

module.exports = { DEFAULT_COMMUNITY_CHAT, normalizeCommunityChat, createCommunityChat, anniversary };
