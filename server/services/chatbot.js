// Chat bot (beta): !commands, quotes and mod-only commands. Replies go out through SocialStream's sendChat endpoint.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { normalizeSsnSessionId } = require('../ssn-config');

const DEFAULT_AUTO_SHOUTOUT = {
    enabled: false,
    message: 'Welcome raiders from @{{user}}! Show them some love: twitch.tv/{{user}}',
    minViewers: 0
};
const DEFAULT_POLL_ANNOUNCEMENTS = {
    enabled: true,
    announceStart: true,
    announceEnd: true,
    startTemplate: '[Poll] {title} ({duration})\n{choices}',
    endTemplate: '[Poll Result] Winner: {winner} with {votes} votes ({percent}%)!',
    tieTemplate: '[Poll Result] The poll ended in a tie between {choices}!',
    championTemplate: '[Tournament Champion] {champion} has won {title}!'
};
const DEFAULT_SETTINGS = { enabled: false, prefix: '!', tag: '[BOT]', cooldown: 5, mods: [], autoShoutout: { ...DEFAULT_AUTO_SHOUTOUT }, pollAnnouncements: { ...DEFAULT_POLL_ANNOUNCEMENTS } };
const MAX_COMMANDS = 200;
const MAX_QUOTES = 5000;
const MAX_MESSAGES = 100;
const MAX_TRIGGERS = 100;
const KINDS = ['interval', 'hourly', 'daily', 'datetime', 'dateinterval'];
const USER_RE = /\{\{\s*(?:user|sender)\s*\}\}|\$\((?:user|sender)\)/gi;
const NAME_RE = /^[a-z0-9_]{1,30}$/;

function formatTokens(text, { user = '', arg = '', msg = {}, viewers = '' } = {}) {
    if (!text) return '';
    let out = String(text);

    const tokens = String(arg || '').trim().split(/\s+/).filter(Boolean);

    // 1. Target user: {{target}}, {{target:fallback}}, $(target), $(touser), etc.
    out = out.replace(/\{\{\s*target(?::([^}]+))?\s*\}\}|\$\((?:target|touser)(?::([^)]+))?\)/gi, (m, fb1, fb2) => {
        const fallback = (fb1 !== undefined ? fb1 : fb2 !== undefined ? fb2 : '').trim();
        if (tokens[0]) return tokens[0].replace(/^@/, '');
        if (fallback) return fallback;
        return user ? String(user).replace(/^@/, '') : 'someone';
    });

    // 2. Positional arguments: {{arg.1}}, {{arg.2:fallback}}, {{1}}, $(1), $(arg.2), etc.
    out = out.replace(/\{\{\s*(?:arg\.?|#)?(\d+)(?::([^}]+))?\s*\}\}|\$\((?:arg\.?|#)?(\d+)(?::([^)]+))?\)/gi, (m, n1, fb1, n2, fb2) => {
        const n = parseInt(n1 || n2, 10);
        const fallback = (fb1 !== undefined ? fb1 : fb2 !== undefined ? fb2 : '').trim();
        if (n > 0 && tokens[n - 1] !== undefined) return tokens[n - 1];
        return fallback;
    });

    // 3. Whole arguments: {{arg}}, {{args}}, $(arg), $(args)
    out = out.replace(/\{\{\s*args?\s*\}\}|\$\(args?\)/gi, arg || '');

    // 4. Chatter / sender: {{user}}, {{sender}}, $(user), $(sender)
    out = out.replace(USER_RE, user || msg.chatname || '');

    // 5. Raid viewers count (if provided): {{viewers}}, $(viewers)
    if (viewers !== '' && viewers !== undefined) {
        out = out.replace(/\{\{\s*viewers?\s*\}\}|\$\(viewers?\)/gi, String(viewers));
    }

    // 6. RNG dice rolls / random integers: {{random min max}}, {{random max}}, $(random min max)
    out = out.replace(/\{\{\s*random\s+(\d+)(?:\s+(\d+))?\s*\}\}|\$\(random\s+(\d+)(?:\s+(\d+))?\)/gi, (m, a1, b1, a2, b2) => {
        const a = a1 !== undefined ? a1 : a2;
        const b = b1 !== undefined ? b1 : b2;
        let min, max;
        if (b !== undefined && b !== '') {
            min = Math.min(Number(a), Number(b));
            max = Math.max(Number(a), Number(b));
        } else {
            min = 1;
            max = Math.max(1, Number(a));
        }
        return String(Math.floor(Math.random() * (max - min + 1)) + min);
    });

    // 7. Choices: {{choice A|B|C}}, {{pick A|B|C}}, $(choice A|B|C), $(pick A|B|C)
    out = out.replace(/\{\{\s*(?:choice|pick)\s+([^{}]+)\s*\}\}|\$\((?:choice|pick)\s+([^()]+)\)/gi, (m, c1, c2) => {
        const raw = c1 !== undefined ? c1 : c2;
        const options = (raw || '').split('|').map(s => s.trim()).filter(Boolean);
        if (!options.length) return '';
        return options[Math.floor(Math.random() * options.length)];
    });

    return out;
}

module.exports = function createChatbot({ sessionKey = () => '', onUse = () => {}, dataDir, getConfig, port = Number(process.env.PORT) || 3000, variables }) {
    const file = path.join(dataDir, 'chatbot.json');
    let data = { settings: { ...DEFAULT_SETTINGS }, commands: [], quotes: [], nextQuoteId: 1, messages: [], triggers: [] };
    const startedAt = Date.now();
    let chatCount = 0;
    const timerState = new Map();
    const lastUsed = new Map();
    let lastAny = 0;
    let shared = null;
    let statusCache = { at: 0, value: null };

    const ACCESS = ['everyone', 'subs', 'mods', 'disabled'];
const BUILTIN_DEFAULTS = { quote: 'everyone', quotes: 'everyone', addquote: 'mods', delquote: 'mods' };
const clean = (value, max) => String(value ?? '').replace(/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

    function normalizeSettings(input = {}) {
        const mods = Array.isArray(input.mods) ? input.mods : String(input.mods || '').split(/[\s,]+/);
        const autoShoutout = input.autoShoutout || {};
        const pollAnnouncements = input.pollAnnouncements || {};
        return {
            enabled: input.enabled !== undefined
                ? input.enabled === true
                : (typeof getConfig === 'function' ? getConfig()?.chatbot_enabled === true : false),
            prefix: clean(input.prefix, 3) || DEFAULT_SETTINGS.prefix,
            tag: clean(input.tag, 20),
            cooldown: Math.max(0, Math.min(3600, Number(input.cooldown ?? DEFAULT_SETTINGS.cooldown) || 0)),
            modCooldown: input.modCooldown === '' || input.modCooldown === null || input.modCooldown === undefined ? null : Math.max(0, Math.min(3600, Number(input.modCooldown) || 0)),
            mods: [...new Set(mods.map(m => clean(m, 60).toLowerCase().replace(/^@/, '')).filter(Boolean))].slice(0, 200),
            autoShoutout: {
                enabled: autoShoutout.enabled === true,
                message: clean(autoShoutout.message ?? DEFAULT_AUTO_SHOUTOUT.message, 1000),
                minViewers: Math.max(0, Math.min(1000000, Number(autoShoutout.minViewers) || 0))
            },
            pollAnnouncements: {
                enabled: pollAnnouncements.enabled !== undefined ? pollAnnouncements.enabled === true : DEFAULT_POLL_ANNOUNCEMENTS.enabled,
                announceStart: pollAnnouncements.announceStart !== undefined ? pollAnnouncements.announceStart === true : DEFAULT_POLL_ANNOUNCEMENTS.announceStart,
                announceEnd: pollAnnouncements.announceEnd !== undefined ? pollAnnouncements.announceEnd === true : DEFAULT_POLL_ANNOUNCEMENTS.announceEnd,
                startTemplate: clean(pollAnnouncements.startTemplate ?? DEFAULT_POLL_ANNOUNCEMENTS.startTemplate, 500) === '[Poll] {title} — Choices: {choices} — Vote with {commands} ({duration}s)'
                    ? DEFAULT_POLL_ANNOUNCEMENTS.startTemplate
                    : clean(pollAnnouncements.startTemplate ?? DEFAULT_POLL_ANNOUNCEMENTS.startTemplate, 500),
                endTemplate: clean(pollAnnouncements.endTemplate ?? DEFAULT_POLL_ANNOUNCEMENTS.endTemplate, 500),
                tieTemplate: clean(pollAnnouncements.tieTemplate ?? DEFAULT_POLL_ANNOUNCEMENTS.tieTemplate, 500),
                championTemplate: clean(pollAnnouncements.championTemplate ?? DEFAULT_POLL_ANNOUNCEMENTS.championTemplate, 500)
            },
            builtins: Object.fromEntries(Object.entries(BUILTIN_DEFAULTS).map(([name, access]) => {
                const b = (input.builtins || {})[name] || {};
                return [name, {
                    access: ACCESS.includes(b.access) ? b.access : access,
                    cooldown: b.cooldown === '' || b.cooldown === null || b.cooldown === undefined ? null : Math.max(0, Math.min(3600, Number(b.cooldown) || 0))
                }];
            }))
        };
    }

    function normalizeHttpAction(input) {
        if (!input || typeof input !== 'object') return null;
        const enabled = input.enabled === true;
        const url = clean(input.url, 1000);
        if (!url && !enabled) return null;
        const method = ['GET', 'POST', 'PUT', 'DELETE'].includes(String(input.method || '').toUpperCase())
            ? String(input.method).toUpperCase()
            : 'GET';
        const body = typeof input.body === 'string' ? clean(input.body, 2000) : '';
        const headers = (input.headers && typeof input.headers === 'object') ? input.headers : {};
        return { enabled, method, url, body, headers };
    }

    function normalizeCommand(input = {}) {
        const name = clean(input.name, 30).toLowerCase().replace(/^[^a-z0-9_]+/, '');
        if (!NAME_RE.test(name)) return null;
        const aliases = (Array.isArray(input.aliases) ? input.aliases : String(input.aliases || '').split(/[\s,]+/))
            .map(a => clean(a, 30).toLowerCase().replace(/^[^a-z0-9_]+/, '')).filter(a => NAME_RE.test(a) && a !== name);
        const httpAction = normalizeHttpAction(input.httpAction);
        const rawResponse = clean(input.response, 1000);
        const silent = input.silent === true || (Boolean(httpAction && httpAction.enabled && httpAction.url) && !rawResponse);
        return {
            name,
            aliases: [...new Set(aliases)].slice(0, 5),
            response: rawResponse,
            silent,
            httpAction,
            random: input.random === true,
            counter: clean(input.counter, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            counterAction: ['increment', 'decrement', 'reset', 'roll'].includes(input.counterAction) ? input.counterAction : 'increment',
            access: ACCESS.includes(input.access) ? input.access : input.modOnly === true ? 'mods' : 'everyone',
            modCooldown: input.modCooldown === '' || input.modCooldown === null || input.modCooldown === undefined ? null : Math.max(0, Math.min(86400, Number(input.modCooldown) || 0)),
            limit: input.limit === '' || input.limit === null || input.limit === undefined ? null : Math.max(1, Math.min(1000, Math.round(Number(input.limit)) || 1)),
            limitPer: ['session', 'day', 'forever'].includes(input.limitPer) ? input.limitPer : 'session',
            cooldown: input.cooldown === '' || input.cooldown === null || input.cooldown === undefined ? null : Math.max(0, Math.min(3600, Number(input.cooldown) || 0)),
            enabled: input.enabled !== false
        };
    }

    const usageFile = path.join(dataDir, 'chatbot-usage.json');
    let usage = {};
    try { usage = JSON.parse(fs.readFileSync(usageFile, 'utf8')) || {}; } catch { /* first run */ }
    const saveUsage = () => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(usageFile, JSON.stringify(usage)); } catch { /* non-fatal */ } };
    const stampFor = per => per === 'forever' ? 'all' : per === 'day' ? new Date().toLocaleDateString('en-CA') : `s${sessionKey()}`;
    // Returns true when this person is out of uses; otherwise counts this use.
    function limited(key, item, msg) {
        if (!item.limit || isMod(msg)) return false;
        const user = String(msg.chatname || '').toLowerCase();
        const stamp = stampFor(item.limitPer);
        const u = (usage[key] = usage[key] || {})[user];
        if (u && u.stamp === stamp && u.n >= item.limit) return true;
        usage[key][user] = { n: u && u.stamp === stamp ? u.n + 1 : 1, stamp, name: msg.chatname || user };
        saveUsage();
        return false;
    }
    function usageList() {
        const items = [...data.commands.map(c => ({ key: c.name, label: prefixOf() + c.name, item: c })), ...data.triggers.map(t => ({ key: `t:${t.id}`, label: `Trigger: ${t.name || t.words[0]}`, item: t }))];
        const rows = [];
        for (const { key, label, item } of items) {
            if (!item.limit) continue;
            for (const [user, u] of Object.entries(usage[key] || {})) if (u.stamp === stampFor(item.limitPer)) rows.push({ key, label, user, name: u.name, n: u.n, limit: item.limit, per: item.limitPer });
        }
        return rows;
    }
    const prefixOf = () => data.settings.prefix;

    const newId = () => crypto.randomBytes(5).toString('hex');
    const num = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) && value !== '' && value !== null ? Math.max(min, Math.min(max, Math.round(n))) : fallback; };

    function normalizeMessage(input = {}) {
        const text = clean(input.text, 1000);
        if (!text) return null;
        const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(input.time || '')) ? String(input.time).replace(/^(\d):/, '0$1:') : '12:00';
        return {
            id: clean(input.id, 20) || newId(),
            name: clean(input.name, 60),
            enabled: input.enabled !== false,
            liveOnly: input.liveOnly === true,
            kind: KINDS.includes(input.kind) ? input.kind : 'interval',
            every: num(input.every, 1, 1440, 30),
            vary: input.vary === true,
            everyMax: num(input.everyMax, 1, 1440, Math.max(1, num(input.every, 1, 1440, 30) * 2)),
            minChat: num(input.minChat, 0, 1000, 5),
            minute: num(input.minute, 0, 59, 0),
            time,
            date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : '',
            md: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(input.md || '')) ? input.md : '',
            from: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.from || '')) ? input.from : '00:00',
            to: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.to || '')) ? input.to : '23:59',
            days: [...new Set((Array.isArray(input.days) ? input.days : []).map(Number).filter(d => d >= 0 && d <= 6))].sort(),
            random: input.random === true,
            text
        };
    }

    function normalizeTrigger(input = {}) {
        const words = (Array.isArray(input.words) ? input.words : String(input.words || '').split(/[\n,]+/)).map(w => clean(w, 60).toLowerCase()).filter(Boolean);
        const text = clean(input.text, 1000);
        const httpAction = normalizeHttpAction(input.httpAction);
        if (!words.length || (!text && (!httpAction || !httpAction.enabled || !httpAction.url))) return null;
        const silent = input.silent === true || (Boolean(httpAction && httpAction.enabled && httpAction.url) && !text);
        return {
            id: clean(input.id, 20) || newId(),
            name: clean(input.name, 60),
            enabled: input.enabled !== false,
            words: [...new Set(words)].slice(0, 30),
            wholeWord: input.wholeWord !== false,
            access: ACCESS.includes(input.access) ? input.access : 'everyone',
            modCooldown: input.modCooldown === '' || input.modCooldown === null || input.modCooldown === undefined ? null : Math.max(0, Math.min(86400, Number(input.modCooldown) || 0)),
            limit: input.limit === '' || input.limit === null || input.limit === undefined ? null : Math.max(1, Math.min(1000, Math.round(Number(input.limit)) || 1)),
            limitPer: ['session', 'day', 'forever'].includes(input.limitPer) ? input.limitPer : 'session',
            cooldown: num(input.cooldown, 0, 86400, 60),
            random: input.random === true,
            silent,
            httpAction,
            text
        };
    }

    const pick = (text, random) => {
        if (!random) return text;
        const lines = String(text).split(/\n/).map(l => l.trim()).filter(Boolean);
        return lines.length ? lines[Math.floor(Math.random() * lines.length)] : text;
    };

    function normalizeQuote(input = {}) {
        const text = clean(input.text, 300);
        if (!text) return null;
        return { id: Math.max(1, Number(input.id) || 0), text, game: clean(input.game, 80), by: clean(input.by, 60), at: Number(input.at) || Date.now() };
    }

    function load() {
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            data.settings = normalizeSettings(raw.settings || (raw.enabled !== undefined ? { enabled: raw.enabled } : {}));
            const seen = new Set();
            data.commands = (raw.commands || []).map(normalizeCommand).filter(c => c && !seen.has(c.name) && seen.add(c.name)).slice(0, MAX_COMMANDS);
            data.quotes = (raw.quotes || []).map(normalizeQuote).filter(Boolean).slice(0, MAX_QUOTES);
            data.messages = (raw.messages || []).map(normalizeMessage).filter(Boolean).slice(0, MAX_MESSAGES);
            data.triggers = (raw.triggers || []).map(normalizeTrigger).filter(Boolean).slice(0, MAX_TRIGGERS);
            data.nextQuoteId = Math.max(Number(raw.nextQuoteId) || 1, ...data.quotes.map(q => q.id + 1), 1);
        } catch {
            data.settings = normalizeSettings({});
        }
    }

    function save() {
        fs.mkdirSync(dataDir, { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, file);
    }

    // The placeholder engine lives in a browser script, so run it in a sandbox with a stubbed document.
    function getShared() {
        if (shared) return shared;
        const sandbox = { document: { addEventListener() {}, documentElement: { classList: { toggle() {} } }, getElementById: () => null }, location: { href: 'http://localhost/' }, navigator: {} };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        const sharedPath = fs.existsSync(path.join(__dirname, 'overlay-shared.js'))
            ? path.join(__dirname, 'overlay-shared.js')
            : path.join(__dirname, '..', '..', 'public', 'js', 'overlay-shared.js');
        vm.runInContext(fs.readFileSync(sharedPath, 'utf8'), sandbox);
        shared = sandbox.OverlayShared;
        return shared;
    }

    async function liveStatus() {
        if (Date.now() - statusCache.at < 2000 && statusCache.value) return statusCache.value;
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                statusCache = { at: Date.now(), value: await res.json() };
                return statusCache.value;
            }
        } catch { /* fallback */ }
        return statusCache.value || {};
    }

    async function expand(text) {
        return String(getShared().expandVariables(text, await liveStatus(), {}, false) || '').replace(/\{\{[^}]*\}\}/g, '').trim();
    }

    const isModuleEnabled = () => {
        const cfg = typeof getConfig === 'function' ? getConfig() : {};
        return cfg?.chatbot_enabled !== false;
    };
    const enabled = () => isModuleEnabled() && data.settings.enabled === true;
    let seq = 0;
    const activity = [];
    const logUse = (kind, name, user, meta = {}) => {
        activity.push({ seq: ++seq, kind, name, user: user || '', at: Date.now(), ...meta });
        if (activity.length > 50) activity.shift();
        try { onUse(kind, name); } catch { /* non-fatal */ }
    };

    async function executeHttpAction(action, { user = '', arg = '', msg = {} } = {}) {
        if (!action || !action.enabled || !action.url) return null;
        try {
            const formattedUrl = formatTokens(action.url, { user, arg, msg });
            let finalUrl = await expand(formattedUrl);
            if (!finalUrl) return null;
            if (finalUrl.startsWith('/')) {
                finalUrl = `http://127.0.0.1:${port}${finalUrl}`;
            }
            const method = (action.method || 'GET').toUpperCase();
            const opts = {
                method,
                signal: AbortSignal.timeout(5000)
            };
            if (method !== 'GET' && method !== 'HEAD') {
                const formattedBody = formatTokens(action.body || '', { user, arg, msg });
                const expandedBody = await expand(formattedBody);
                opts.headers = { 'Content-Type': 'application/json', ...(action.headers || {}) };
                opts.body = expandedBody;
            }
            const res = await fetch(finalUrl, opts);
            const text = await res.text().catch(() => '');
            return { ok: res.ok, status: res.status, statusText: res.statusText, text: text.slice(0, 500) };
        } catch (err) {
            console.warn(`[Chatbot HTTP] Action failed (${action.url}): ${err.message}`);
            return { ok: false, error: err.message };
        }
    }
    const sessionId = () => normalizeSsnSessionId(getConfig().ssn?.session_id);
    const baseUrl = () => String(getConfig().ssn?.chat_base || getConfig().ssn?.server || 'https://io.socialstream.ninja').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');

    async function send(text) {
        const id = sessionId();
        if (!id) throw new Error('SocialStream session ID is not set');
        const { tag } = data.settings;
        const lines = String(text).split(/\\n|\n/).map(l => l.trim()).filter(Boolean).slice(0, 15);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const message = (tag && !line.startsWith(tag)) ? `${tag} ${line}` : line;
            if (i) await new Promise(r => setTimeout(r, 400));
            const res = await fetch(`${baseUrl()}/${encodeURIComponent(id)}/sendChat/${encodeURIComponent(message.slice(0, 400))}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`SocialStream replied ${res.status}`);
        }
    }

    let twitchModsCache = { at: 0, list: [], details: [] };
    function getTwitchMods() {
        if (Date.now() - twitchModsCache.at < 5000 && twitchModsCache.list.length) return twitchModsCache.list;
        try {
            const p = path.join(dataDir, 'moderators.json');
            if (fs.existsSync(p)) {
                const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
                const arr = Array.isArray(raw) ? raw : (raw?.data || []);
                const list = arr.map(m => (m.user_login || m.user_name || '').toLowerCase().replace(/^@/, '')).filter(Boolean);
                const details = arr.map(m => ({
                    login: (m.user_login || '').toLowerCase().replace(/^@/, ''),
                    name: m.user_name || m.user_login || ''
                })).filter(m => m.login);
                twitchModsCache = { at: Date.now(), list, details };
                return list;
            }
        } catch { /* ignore */ }
        twitchModsCache = { at: Date.now(), list: [], details: [] };
        return [];
    }

    function getTwitchModsDetails() {
        getTwitchMods();
        return twitchModsCache.details || [];
    }

    function getBroadcaster() {
        try {
            const cfg = getConfig() || {};
            const name = cfg.broadcaster_name || cfg.twitch?.broadcaster_name || '';
            return String(name).toLowerCase().trim().replace(/^@/, '');
        } catch { return ''; }
    }

    let twitchSubsCache = { at: 0, set: new Set() };
    function getTwitchSubsAndVips() {
        if (Date.now() - twitchSubsCache.at < 5000 && twitchSubsCache.set.size) return twitchSubsCache.set;
        const set = new Set();
        try {
            const subsFile = path.join(dataDir, 'subs.json');
            if (fs.existsSync(subsFile)) {
                const parsed = JSON.parse(fs.readFileSync(subsFile, 'utf8'));
                const list = Array.isArray(parsed) ? parsed : (parsed?.data || []);
                list.forEach(s => {
                    const u = (s.user_login || s.user_name || '').toLowerCase().replace(/^@/, '');
                    if (u) set.add(u);
                });
            }
        } catch {}
        try {
            const vipsFile = path.join(dataDir, 'vips.json');
            if (fs.existsSync(vipsFile)) {
                const parsed = JSON.parse(fs.readFileSync(vipsFile, 'utf8'));
                const list = Array.isArray(parsed) ? parsed : (parsed?.data || []);
                list.forEach(v => {
                    const u = (v.user_login || v.user_name || '').toLowerCase().replace(/^@/, '');
                    if (u) set.add(u);
                });
            }
        } catch {}
        twitchSubsCache = { at: Date.now(), set };
        return set;
    }

    function isMod(msg) {
        if (!msg) return false;
        if ([msg.mod, msg.moderator, msg.isMod, msg.isModerator, msg.is_mod, msg.broadcaster, msg.isBroadcaster, msg.admin, msg.host, msg.owner].some(v => v === true || v === 'true' || v === 1)) return true;
        const badges = JSON.stringify(msg.chatbadges ?? msg.badges ?? msg.membership ?? '').toLowerCase();
        if (/moderator|broadcaster|"mod"/.test(badges)) return true;
        const name = String(msg.chatname || msg.user || msg.username || msg.sender || '').toLowerCase().trim().replace(/^@/, '');
        if (!name) return false;
        const broadcaster = getBroadcaster();
        if (broadcaster && name === broadcaster) return true;
        if (data.settings.mods.includes(name)) return true;
        if (getTwitchMods().includes(name)) return true;
        return false;
    }

    function isSub(msg) {
        if (!msg) return false;
        if (isMod(msg)) return true;
        if ([msg.subscriber, msg.isSub, msg.isSubscriber, msg.is_subscriber, msg.member, msg.isMember, msg.hasMembership, msg.vip].some(v => v === true || v === 'true' || v === 1)) return true;
        if (/subscriber|member|founder|vip/i.test(String(msg.membership || ''))) return true;
        if (/subscriber|"sub"|member|founder|vip/.test(JSON.stringify(msg.chatbadges ?? msg.badges ?? '').toLowerCase())) return true;
        const name = String(msg.chatname || msg.user || msg.username || msg.sender || '').toLowerCase().trim().replace(/^@/, '');
        if (name && getTwitchSubsAndVips().has(name)) return true;
        return false;
    }

    const allowed = (access, msg) => access !== 'disabled' && (access === 'everyone' || isMod(msg) || (access === 'subs' && isSub(msg)));

    const formatQuote = (q, details) => {
        if (!details) return `"${q.text}" (#${q.id})`;
        const when = new Date(q.at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return `"${q.text}" (#${q.id}${q.game ? `, ${q.game}` : ''}${q.by ? `, added by ${q.by}` : ''}, ${when})`;
    };

    function quoteReply(rawArg, msg) {
        const details = /(^|\s)details?$/i.test(rawArg.trim());
        const arg = rawArg.trim().replace(/(^|\s)details?$/i, '').trim();
        const [sub, ...rest] = arg.split(/\s+/);
        if (!data.quotes.length) return 'No quotes yet.';
        if (/^\d+$/.test(sub || '')) {
            const q = data.quotes.find(item => item.id === Number(sub));
            return q ? formatQuote(q, details) : `No quote #${sub}.`;
        }
        if (arg) {
            const matches = data.quotes.filter(q => q.text.toLowerCase().includes(arg.toLowerCase()));
            return matches.length ? formatQuote(matches[Math.floor(Math.random() * matches.length)], details) : `No quote matches "${arg}".`;
        }
        return formatQuote(data.quotes[Math.floor(Math.random() * data.quotes.length)], details);
    }

    function addQuote(text, by) {
        const quote = normalizeQuote({ id: data.nextQuoteId, text, by, at: Date.now() });
        if (!quote) return null;
        if (data.quotes.length >= MAX_QUOTES) return null;
        data.nextQuoteId++;
        data.quotes.push(quote);
        save();
        return quote;
    }

    function deleteQuote(id) {
        const before = data.quotes.length;
        data.quotes = data.quotes.filter(q => q.id !== Number(id));
        if (data.quotes.length !== before) save();
        return data.quotes.length !== before;
    }

    async function reply(name, text, cooldown) {
        const now = Date.now();
        lastUsed.set(name, now);
        lastAny = now;
        try { await send(text); } catch (err) { console.warn(`[Chatbot] ${err.message}`); }
    }

    // Called for every incoming chat message.
    const recent = [];
    function capture(msg) {
        const fields = {};
        for (const [k, v] of Object.entries(msg || {})) {
            if (/message|html|img|content|image|source|avatar/i.test(k) && !/badge/i.test(k)) continue;
            fields[k] = typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v).slice(0, 80);
        }
        recent.unshift({ at: Date.now(), user: msg.chatname || '', mod: isMod(msg), sub: isSub(msg), fields });
        recent.length = Math.min(recent.length, 15);
    }

    async function executeCommand(name, arg = '', msg = {}, { bypassCooldown = false } = {}) {
        const custom = data.commands.find(c => c.enabled && (c.name === name || c.aliases.includes(name)));
        const builtin = ['quote', 'quotes', 'addquote', 'delquote'].includes(name) ? name : null;
        if (!custom && !builtin) return null;
        const key = custom ? custom.name : builtin === 'quotes' ? 'quote' : builtin;
        const cfg = custom || data.settings.builtins?.[key] || { access: BUILTIN_DEFAULTS[key], cooldown: null };
        if (!allowed(cfg.access, msg)) return { ok: false, error: 'Access denied' };
        const now = Date.now();
        if (!bypassCooldown) {
            const base = cfg.cooldown !== null && cfg.cooldown !== undefined ? cfg.cooldown : data.settings.cooldown;
            const wait = (isMod(msg) ? (cfg.modCooldown ?? data.settings.modCooldown ?? base) : base) * 1000;
            if (now - (lastUsed.get(key) || 0) < wait || now - lastAny < 1000) return { ok: false, error: 'Cooldown active' };
            if (custom && limited(key, custom, msg)) return { ok: false, error: 'Usage limit reached' };
        }

        logUse('command', key, msg.chatname, { silent: Boolean(custom?.silent), http: Boolean(custom?.httpAction?.enabled) });

        if (builtin === 'addquote' || builtin === 'delquote') {
            if (builtin === 'addquote') {
                const quote = addQuote(arg, msg.chatname);
                const replyText = quote ? `Quote #${quote.id} added.` : 'Usage: addquote <text>';
                await reply(key, replyText);
                return { ok: true, name: key, reply: replyText };
            }
            const replyText = deleteQuote(arg) ? `Quote #${arg} removed.` : 'Usage: delquote <number>';
            await reply(key, replyText);
            return { ok: true, name: key, reply: replyText };
        }
        if (builtin === 'quotes') {
            const replyText = `${data.quotes.length} quote${data.quotes.length === 1 ? '' : 's'} saved. Use ${prefixOf()}quote or ${prefixOf()}quote <number>.`;
            await reply(key, replyText);
            return { ok: true, name: key, reply: replyText };
        }
        if (builtin === 'quote') {
            const replyText = quoteReply(arg, msg);
            await reply(key, replyText);
            return { ok: true, name: key, reply: replyText };
        }

        if (custom.counter && variables) {
            try {
                if (custom.counterAction === 'roll') variables.roll(custom.counter);
                else variables.change(custom.counter, custom.counterAction, 1);
                statusCache.at = 0;
            } catch (err) {
                console.warn(`[Chatbot] ${err.message}`);
            }
        }

        let httpResult = null;
        if (custom.httpAction && custom.httpAction.enabled) {
            httpResult = await executeHttpAction(custom.httpAction, { user: msg.chatname || '', arg, msg });
        }

        if (custom.silent) {
            return { ok: true, name: key, silent: true, http: httpResult };
        }

        const raw = pick(custom.response, custom.random);
        if (!raw && custom.httpAction?.enabled) {
            return { ok: true, name: key, silent: true, http: httpResult };
        }

        try {
            const formatted = formatTokens(raw, { user: msg.chatname || '', arg, msg });
            const replyText = await expand(formatted);
            await reply(key, replyText || '(no value yet)');
            return { ok: true, name: key, silent: false, reply: replyText, http: httpResult };
        } catch (err) {
            console.warn(`[Chatbot] ${err.message}`);
            return { ok: false, name: key, error: err.message, http: httpResult };
        }
    }

    async function handle(msg) {
        if (!msg || msg.event || msg.hasDonation) { /* events carry no chatter flags worth logging */ } else if (!/^\[BOT\]/.test(String(msg.chatmessage || ''))) capture(msg);
        if (!enabled()) return;
        const { prefix, tag } = data.settings;
        const text = String(msg.chatmessage || '').replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, ' ').trim();
        // Never react to our own tagged replies or to events.
        if (!text || (tag && text.startsWith(tag)) || msg.event || msg.hasDonation) return;
        chatCount++;
        if (!text.startsWith(prefix)) return runTriggers(text, msg);
        const [first, ...rest] = text.slice(prefix.length).trim().split(/\s+/);
        const name = String(first || '').toLowerCase();
        const arg = rest.join(' ').trim();
        try {
            await executeCommand(name, arg, msg, { bypassCooldown: false });
        } catch (err) {
            console.warn(`[Chatbot] ${err.message}`);
        }
    }

    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    async function runTriggers(text, msg) {
        const now = Date.now();
        for (const t of data.triggers) {
            if (!t.enabled || !allowed(t.access, msg)) continue;
            if (now - (lastUsed.get(`t:${t.id}`) || 0) < (isMod(msg) ? (t.modCooldown ?? data.settings.modCooldown ?? t.cooldown) : t.cooldown) * 1000 || now - lastAny < 1000) continue;
            const hit = t.words.some(w => new RegExp(t.wholeWord ? `(^|[^\\p{L}\\p{N}_])${escapeRe(w)}($|[^\\p{L}\\p{N}_])` : escapeRe(w), 'iu').test(text));
            if (!hit) continue;
            if (limited(`t:${t.id}`, t, msg)) continue;
            logUse('trigger', t.name || t.id, msg.chatname, { silent: Boolean(t.silent), http: Boolean(t.httpAction?.enabled) });
            if (t.httpAction && t.httpAction.enabled) {
                executeHttpAction(t.httpAction, { user: msg.chatname || '', arg: text, msg }).catch(() => {});
            }
            if (t.silent) return;
            const raw = pick(t.text, t.random);
            if (!raw && t.httpAction?.enabled) return;
            const formatted = formatTokens(raw, { user: msg.chatname || '', arg: text, msg });
            const out = await expand(formatted);
            if (out) await reply(`t:${t.id}`, out);
            return;
        }
    }

    // Fixed interval, or a random one between every and everyMax when variability is on.
    const waitMs = m => (m.vary && m.everyMax > m.every ? m.every + Math.random() * (m.everyMax - m.every) : m.every) * 60000;

    const pad2 = n => String(n).padStart(2, '0');
    function messageDue(m, d) {
        const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        const fresh = k => (timerState.get(m.id)?.slot === k ? null : k);
        if (m.kind === 'datetime') return m.date === day && hm === m.time ? fresh(`${day}-${hm}`) : null;
        if (m.kind === 'dateinterval') {
            if (m.md !== day.slice(5) || hm < m.from || hm > m.to) return null;
            const st = timerState.get(m.id);
            return !st || Date.now() - st.at >= (st.wait ?? m.every * 60000) ? 'di' : null;
        }
        if (m.days.length && !m.days.includes(d.getDay())) return null;
        if (m.kind === 'hourly') return d.getMinutes() === m.minute ? fresh(`${day}-${d.getHours()}`) : null;
        if (m.kind === 'daily') return hm === m.time ? fresh(`${day}-d`) : null;
        const st = timerState.get(m.id) || { at: startedAt };
        return Date.now() - st.at >= (st.wait ?? m.every * 60000) ? 'interval' : null;
    }

    async function tick() {
        if (!enabled() || Date.now() - lastAny < 1000) return;
        const d = new Date();
        for (const m of data.messages) {
            if (!m.enabled) continue;
            const due = messageDue(m, d);
            if (!due) continue;
            const prev = timerState.get(m.id) || { at: startedAt, count: chatCount };
            if (m.liveOnly) {
                const status = await liveStatus();
                if (!status?.viewers?.live) {
                    if (m.kind !== 'interval') timerState.set(m.id, { ...prev, slot: due });
                    continue;
                }
            }
            if (m.minChat && !['datetime', 'dateinterval'].includes(m.kind) && chatCount - prev.count < m.minChat) {
                if (m.kind !== 'interval') timerState.set(m.id, { ...prev, slot: due });
                continue;
            }
            timerState.set(m.id, { at: Date.now(), count: chatCount, slot: due, wait: waitMs(m) });
            try {
                const raw = pick(m.text, m.random);
                const formatted = formatTokens(raw, {});
                const out = await expand(formatted);
                if (out) { logUse('message', m.name || m.id, ''); await reply(`m:${m.id}`, out); }
            } catch (err) { console.warn(`[Chatbot] ${err.message}`); }
            return;
        }
    }

    function importQuotes(list) {
        const have = new Set(data.quotes.map(q => q.text.toLowerCase()));
        let added = 0, skipped = 0;
        for (const item of list) {
            const base = typeof item === 'string' ? { text: item } : item || {};
            const wanted = Number(base.id);
            const keep = Number.isInteger(wanted) && wanted > 0 && !data.quotes.some(x => x.id === wanted);
            const q = normalizeQuote({ ...base, id: keep ? wanted : data.nextQuoteId });
            if (!q || have.has(q.text.toLowerCase()) || data.quotes.length >= MAX_QUOTES) { skipped++; continue; }
            have.add(q.text.toLowerCase());
            data.nextQuoteId = Math.max(data.nextQuoteId, q.id + 1);
            data.quotes.push(q);
            added++;
        }
        if (added) save();
        return { added, skipped };
    }

    function snapshot() {
        return {
            enabled: enabled(),
            moduleEnabled: isModuleEnabled(),
            botActive: data.settings.enabled === true,
            ssnConfigured: !!sessionId(),
            broadcaster: getBroadcaster(),
            twitchMods: getTwitchModsDetails(),
            settings: data.settings,
            commands: data.commands,
            quotes: data.quotes,
            messages: data.messages,
            triggers: data.triggers
        };
    }

    // Returns true when the request was handled.
    async function handleApi(req, res, pathname, readBody) {
        if (!pathname.startsWith('/api/chatbot')) return false;
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        try {
            const body = req.method === 'GET' || req.method === 'DELETE' ? {} : JSON.parse(await readBody(req) || '{}');
            if (pathname === '/api/chatbot' && req.method === 'GET') return json(200, snapshot()), true;
            if (pathname === '/api/chatbot' && req.method === 'PUT') {
                if (body.settings) data.settings = normalizeSettings({ ...data.settings, ...body.settings });
                if (Array.isArray(body.commands)) {
                    const seen = new Set();
                    data.commands = body.commands.map(normalizeCommand).filter(c => c && !seen.has(c.name) && seen.add(c.name)).slice(0, MAX_COMMANDS);
                }
                if (Array.isArray(body.messages)) data.messages = body.messages.map(normalizeMessage).filter(Boolean).slice(0, MAX_MESSAGES);
                if (Array.isArray(body.triggers)) data.triggers = body.triggers.map(normalizeTrigger).filter(Boolean).slice(0, MAX_TRIGGERS);
                save();
                return json(200, snapshot()), true;
            }
            if (pathname === '/api/chatbot/placeholders' && req.method === 'GET') {
                const table = getShared().variableTable(await liveStatus(), {});
                const out = {};
                for (const [k, v] of Object.entries(table)) if (v !== undefined && v !== null && typeof v !== 'object') out[k] = String(v);
                return json(200, out), true;
            }
            if (pathname === '/api/chatbot/usage' && req.method === 'GET') return json(200, { usage: usageList() }), true;
            if (pathname === '/api/chatbot/usage/reset' && req.method === 'POST') {
                if (!body.key) usage = {};
                else if (!body.user) delete usage[body.key];
                else if (usage[body.key]) delete usage[body.key][String(body.user).toLowerCase()];
                saveUsage();
                return json(200, { usage: usageList() }), true;
            }
            if (pathname === '/api/chatbot/activity' && req.method === 'GET') return json(200, { enabled: enabled(), moduleEnabled: isModuleEnabled(), seq, activity: activity.slice(-20) }), true;
            if (pathname === '/api/chatbot/enabled' && req.method === 'POST') {
                if (!isModuleEnabled()) {
                    return json(400, { error: 'Chat bot is disabled in Config Editor. Enable it in Config first.', enabled: false, moduleEnabled: false }), true;
                }
                data.settings.enabled = body.action === 'toggle' ? !data.settings.enabled : body.enabled === true;
                save();
                return json(200, snapshot()), true;
            }
            if (pathname === '/api/chatbot/export' && req.method === 'GET') {
                return json(200, { format: 'streampulse-chatbot', version: 1, exportedAt: new Date().toISOString(), ...data, variables: variables ? variables.list() : [] }), true;
            }
            if (pathname === '/api/chatbot/import' && req.method === 'POST') {
                if (body.format !== 'streampulse-chatbot') return json(400, { error: 'Not a StreamPulse chat bot export' }), true;
                const seen = new Set();
                data.settings = normalizeSettings(body.settings);
                data.commands = (body.commands || []).map(normalizeCommand).filter(c => c && !seen.has(c.name) && seen.add(c.name)).slice(0, MAX_COMMANDS);
                data.quotes = (body.quotes || []).map(normalizeQuote).filter(Boolean).slice(0, MAX_QUOTES);
                data.messages = (body.messages || []).map(normalizeMessage).filter(Boolean).slice(0, MAX_MESSAGES);
                data.triggers = (body.triggers || []).map(normalizeTrigger).filter(Boolean).slice(0, MAX_TRIGGERS);
                data.nextQuoteId = Math.max(Number(body.nextQuoteId) || 1, ...data.quotes.map(q => q.id + 1), 1);
                let vars = 0;
                if (variables) for (const v of (body.variables || []).slice(0, 300)) { try { variables.set(v.name, v); vars++; } catch { /* skip bad variable */ } }
                save();
                return json(200, { variables: vars, ...snapshot() }), true;
            }
            if (pathname === '/api/chatbot/quotes/import' && req.method === 'POST') {
                if (!Array.isArray(body.quotes)) return json(400, { error: 'Expected a quotes array' }), true;
                return json(200, { ...importQuotes(body.quotes.slice(0, MAX_QUOTES)), ...snapshot() }), true;
            }
            if (pathname === '/api/chatbot/quotes' && req.method === 'POST') {
                const quote = addQuote(body.text, body.by || 'dashboard');
                return json(quote ? 200 : 400, quote ? snapshot() : { error: 'Quote text is required' }), true;
            }
            const match = pathname.match(/^\/api\/chatbot\/quotes\/(\d+)$/);
            if (match && req.method === 'DELETE') return json(200, deleteQuote(match[1]) ? snapshot() : { ...snapshot(), error: 'Not found' }), true;
            if (match && req.method === 'PUT') {
                const quote = data.quotes.find(q => q.id === Number(match[1]));
                if (!quote) return json(404, { error: 'Not found' }), true;
                const text = clean(body.text, 300);
                if (!text) return json(400, { error: 'Quote text is required' }), true;
                quote.text = text;
                if (body.game !== undefined) quote.game = clean(body.game, 80);
                if (body.by !== undefined) quote.by = clean(body.by, 60);
                save();
                return json(200, snapshot()), true;
            }
            if (pathname === '/api/chatbot/recent' && req.method === 'GET') return json(200, { recent }), true;
            if (pathname === '/api/chatbot/preview' && req.method === 'POST') {
                const raw = clean(body.text, 1000);
                const formatted = formatTokens(raw, {
                    user: clean(body.user || 'viewer', 60),
                    arg: body.arg !== undefined ? clean(body.arg, 200) : 'example arg2',
                    viewers: body.viewers || '25'
                });
                return json(200, { text: await expand(formatted) }), true;
            }
            if (pathname === '/api/chatbot/test-shoutout' && req.method === 'POST') {
                const user = clean(body.user || 'AwesomeStreamer', 60);
                const viewers = Number(body.viewers) || 42;
                const raw = clean(body.message || data.settings.autoShoutout?.message || DEFAULT_AUTO_SHOUTOUT.message, 1000);
                const formatted = formatTokens(raw, { user, arg: user, viewers });
                const out = await expand(formatted);
                if (out) await send(out);
                return json(200, { sent: true, text: out }), true;
            }
            if (pathname === '/api/chatbot/run' && (req.method === 'POST' || req.method === 'GET')) {
                const query = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {};
                const input = { ...query, ...body };
                const rawCmd = input.command || input.name || input.cmd;
                if (!rawCmd) return json(400, { error: 'Command name is required (?command=name)' }), true;
                const cmdName = clean(rawCmd, 30).toLowerCase().replace(/^[^a-z0-9_]+/, '');
                const arg = clean(input.arg || input.args, 500);
                const user = clean(input.user || 'Companion', 60);
                const msg = { chatname: user, broadcaster: true, mod: true, isBroadcaster: true, isMod: true };
                const bypass = input.bypassCooldown !== false && input.bypassCooldown !== 'false';
                const result = await executeCommand(cmdName, arg, msg, { bypassCooldown: bypass });
                if (!result) return json(404, { error: `Command "${cmdName}" not found or disabled` }), true;
                return json(200, result), true;
            }
            if (pathname === '/api/chatbot/test-http' && req.method === 'POST') {
                const action = normalizeHttpAction(body.action || body);
                if (!action || !action.url) return json(400, { error: 'URL is required' }), true;
                action.enabled = true;
                const user = clean(body.user || 'Viewer', 60);
                const arg = clean(body.arg || '', 500);
                const res = await executeHttpAction(action, { user, arg, msg: { chatname: user } });
                return json(200, res || { ok: false, error: 'No response' }), true;
            }
            if (pathname === '/api/chatbot/status' && req.method === 'GET') {
                return json(200, isReady()), true;
            }
            if (pathname === '/api/chatbot/test-poll-announce' && req.method === 'POST') {
                const samplePoll = {
                    title: clean(body.title || 'Favorite Retro Platform', 120),
                    choices: (Array.isArray(body.choices) ? body.choices : ['SNES', 'Genesis', 'PlayStation']).map(title => ({ title: clean(title, 60) })),
                    duration: Number(body.duration) || 60
                };
                const result = await announcePollStart(samplePoll);
                return json(200, result || { sent: true }), true;
            }
            if (pathname === '/api/chatbot/send' && req.method === 'POST') {
                await send(clean(body.text, 400));
                return json(200, { sent: true }), true;
            }
        } catch (err) {
            return json(400, { error: err.message }), true;
        }
        return json(404, { error: 'Unknown chatbot endpoint' }), true;
    }

    async function handleRaid(raid = {}) {
        if (!enabled()) return;
        const cfg = data.settings.autoShoutout;
        if (!cfg || !cfg.enabled) return;
        const user = clean(raid.user, 60);
        if (!user) return;
        const viewers = Number(raid.viewers) || 0;
        if (viewers < (cfg.minViewers || 0)) return;

        const now = Date.now();
        if (!raid.isTest && (now - (lastUsed.get('raid:shoutout') || 0) < 10000 || now - lastAny < 1000)) return;
        lastUsed.set('raid:shoutout', now);
        lastAny = now;

        const raw = cfg.message || DEFAULT_AUTO_SHOUTOUT.message;
        const formatted = formatTokens(raw, { user, arg: user, viewers });
        const out = await expand(formatted);
        if (out) {
            logUse('shoutout', user, user);
            try { await send(out); } catch (err) { console.warn(`[Chatbot] Raid shoutout error: ${err.message}`); }
        }
    }

    function isReady() {
        if (!isModuleEnabled()) return { ready: false, reason: 'Chatbot module is disabled in app configuration' };
        if (data.settings.enabled !== true) return { ready: false, reason: 'Chatbot is paused or disabled in Chatbot settings' };
        if (!sessionId()) return { ready: false, reason: 'SocialStream session ID is not configured' };
        return { ready: true };
    }

    async function postMessage(text) {
        if (!isReady().ready) return { ok: false, reason: isReady().reason };
        try {
            await send(text);
            return { ok: true };
        } catch (err) {
            console.warn(`[Chatbot] Post message failed: ${err.message}`);
            return { ok: false, error: err.message };
        }
    }

    async function announcePollStart(poll) {
        const readyStatus = isReady();
        if (!readyStatus.ready) return { sent: false, reason: readyStatus.reason };
        const cfg = data.settings.pollAnnouncements || DEFAULT_POLL_ANNOUNCEMENTS;
        if (!cfg.enabled || !cfg.announceStart) return { sent: false, reason: 'Poll announcements disabled in settings' };
        if (!poll || !Array.isArray(poll.choices) || poll.choices.length < 2) return { sent: false, reason: 'Invalid poll choices' };

        const prefix = data.settings.prefix || '!';
        const tag = data.settings.tag || '';
        const durationStr = poll.duration > 0 ? `${poll.duration}s` : 'open';

        // Format choices one per line with what to use to vote, prefaced with bot setting
        const choicesStr = poll.choices.map((c, i) => `${prefix}vote ${i + 1}: ${c.title}`).join('\n');
        const commandsStr = poll.choices.map((_, i) => `${prefix}vote ${i + 1}`).join(' or ');

        let template = cfg.startTemplate || DEFAULT_POLL_ANNOUNCEMENTS.startTemplate;
        if (template === '[Poll] {title} — Choices: {choices} — Vote with {commands} ({duration}s)') {
            template = DEFAULT_POLL_ANNOUNCEMENTS.startTemplate;
        }

        const text = template
            .replace(/\{tag\}/gi, tag)
            .replace(/\{prefix\}/gi, prefix)
            .replace(/\{title\}/gi, poll.title || 'Untitled Poll')
            .replace(/\{choices\}/gi, choicesStr)
            .replace(/\{commands\}/gi, commandsStr)
            .replace(/\{duration\}s?/gi, durationStr);

        try {
            await send(text);
            return { sent: true, text };
        } catch (err) {
            console.warn(`[Chatbot] Poll start announcement failed: ${err.message}`);
            return { sent: false, error: err.message, text };
        }
    }

    async function announcePollEnd(poll) {
        const readyStatus = isReady();
        if (!readyStatus.ready) return { sent: false, reason: readyStatus.reason };
        const cfg = data.settings.pollAnnouncements || DEFAULT_POLL_ANNOUNCEMENTS;
        if (!cfg.enabled || !cfg.announceEnd) return { sent: false, reason: 'Poll announcements disabled in settings' };
        if (!poll) return { sent: false, reason: 'No poll' };

        let template = '';
        if (poll.isTie) {
            template = cfg.tieTemplate || DEFAULT_POLL_ANNOUNCEMENTS.tieTemplate;
        } else if (poll.winner) {
            template = cfg.endTemplate || DEFAULT_POLL_ANNOUNCEMENTS.endTemplate;
        } else {
            return { sent: false, reason: 'No winner or tie' };
        }

        const choicesStr = (poll.choices || []).map(c => c.title).join(' and ');
        const text = template
            .replace(/\{title\}/gi, poll.title || 'Untitled Poll')
            .replace(/\{winner\}/gi, poll.winner || '')
            .replace(/\{percent\}/gi, String(poll.winningPercent || 0))
            .replace(/\{votes\}/gi, String(poll.winningVotes || 0))
            .replace(/\{totalVotes\}/gi, String(poll.totalVotes || 0))
            .replace(/\{choices\}/gi, choicesStr);

        try {
            await send(text);
            return { sent: true, text };
        } catch (err) {
            console.warn(`[Chatbot] Poll end announcement failed: ${err.message}`);
            return { sent: false, error: err.message, text };
        }
    }

    async function announceTournamentChampion(tournament) {
        const readyStatus = isReady();
        if (!readyStatus.ready) return { sent: false, reason: readyStatus.reason };
        const cfg = data.settings.pollAnnouncements || DEFAULT_POLL_ANNOUNCEMENTS;
        if (!cfg.enabled || !cfg.announceEnd) return { sent: false, reason: 'Poll announcements disabled in settings' };
        if (!tournament || !tournament.champion) return { sent: false, reason: 'No tournament champion' };

        const template = cfg.championTemplate || DEFAULT_POLL_ANNOUNCEMENTS.championTemplate;
        const text = template
            .replace(/\{title\}/gi, tournament.title || 'Tournament')
            .replace(/\{champion\}/gi, tournament.champion || 'Champion');

        try {
            await send(text);
            return { sent: true, text };
        } catch (err) {
            console.warn(`[Chatbot] Tournament champion announcement failed: ${err.message}`);
            return { sent: false, error: err.message, text };
        }
    }

    function getStats() {
        return {
            enabled: enabled(),
            commandsCount: (data.commands || []).filter(c => c.enabled !== false).length,
            totalCommandsCount: (data.commands || []).length,
            timedCount: (data.messages || []).filter(m => m.enabled !== false).length,
            quotesCount: (data.quotes || []).length,
            triggersCount: (data.triggers || []).filter(t => t.enabled !== false).length
        };
    }

    let tickTimer = null;
    function start() {
        if (tickTimer) return;
        tickTimer = setInterval(() => tick().catch(err => console.warn('[Chatbot] Scheduled message failed:', err.message)), 15000);
        tickTimer.unref();
    }

    function stop() {
        clearInterval(tickTimer);
        tickTimer = null;
    }

    load();
    start();
    return {
        handle,
        handleApi,
        handleRaid,
        getStats,
        isReady,
        getPrefix: () => data.settings.prefix || '!',
        getTag: () => data.settings.tag || '',
        postMessage,
        announcePollStart,
        announcePollEnd,
        announceTournamentChampion,
        start,
        stop
    };
};
