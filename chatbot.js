// Chat bot (beta): !commands, quotes and mod-only commands. Replies go out through SocialStream's sendChat endpoint.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const DEFAULT_SETTINGS = { prefix: '!', tag: '[BOT]', cooldown: 5, mods: [] };
const MAX_COMMANDS = 200;
const MAX_QUOTES = 5000;
const MAX_MESSAGES = 100;
const MAX_TRIGGERS = 100;
const KINDS = ['interval', 'hourly', 'daily', 'datetime', 'dateinterval'];
const USER_RE = /\{\{\s*(?:user|sender)\s*\}\}|\$\((?:user|sender)\)/gi;
const NAME_RE = /^[a-z0-9_]{1,30}$/;

module.exports = function createChatbot({ sessionKey = () => '', onUse = () => {}, dataDir, getConfig, port, variables }) {
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
        return {
            prefix: clean(input.prefix, 3) || DEFAULT_SETTINGS.prefix,
            tag: clean(input.tag, 20),
            cooldown: Math.max(0, Math.min(3600, Number(input.cooldown ?? DEFAULT_SETTINGS.cooldown) || 0)),
            modCooldown: input.modCooldown === '' || input.modCooldown === null || input.modCooldown === undefined ? null : Math.max(0, Math.min(3600, Number(input.modCooldown) || 0)),
            mods: [...new Set(mods.map(m => clean(m, 60).toLowerCase().replace(/^@/, '')).filter(Boolean))].slice(0, 200),
            builtins: Object.fromEntries(Object.entries(BUILTIN_DEFAULTS).map(([name, access]) => {
                const b = (input.builtins || {})[name] || {};
                return [name, {
                    access: ACCESS.includes(b.access) ? b.access : access,
                    cooldown: b.cooldown === '' || b.cooldown === null || b.cooldown === undefined ? null : Math.max(0, Math.min(3600, Number(b.cooldown) || 0))
                }];
            }))
        };
    }

    function normalizeCommand(input = {}) {
        const name = clean(input.name, 30).toLowerCase().replace(/^[^a-z0-9_]+/, '');
        if (!NAME_RE.test(name)) return null;
        const aliases = (Array.isArray(input.aliases) ? input.aliases : String(input.aliases || '').split(/[\s,]+/))
            .map(a => clean(a, 30).toLowerCase().replace(/^[^a-z0-9_]+/, '')).filter(a => NAME_RE.test(a) && a !== name);
        return {
            name,
            aliases: [...new Set(aliases)].slice(0, 5),
            response: clean(input.response, 1000),
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
        if (!words.length || !text) return null;
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
            data.settings = normalizeSettings(raw.settings);
            const seen = new Set();
            data.commands = (raw.commands || []).map(normalizeCommand).filter(c => c && !seen.has(c.name) && seen.add(c.name)).slice(0, MAX_COMMANDS);
            data.quotes = (raw.quotes || []).map(normalizeQuote).filter(Boolean).slice(0, MAX_QUOTES);
            data.messages = (raw.messages || []).map(normalizeMessage).filter(Boolean).slice(0, MAX_MESSAGES);
            data.triggers = (raw.triggers || []).map(normalizeTrigger).filter(Boolean).slice(0, MAX_TRIGGERS);
            data.nextQuoteId = Math.max(Number(raw.nextQuoteId) || 1, ...data.quotes.map(q => q.id + 1), 1);
        } catch { /* first run */ }
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
        vm.runInContext(fs.readFileSync(path.join(__dirname, 'overlay-shared.js'), 'utf8'), sandbox);
        shared = sandbox.OverlayShared;
        return shared;
    }

    async function liveStatus() {
        if (Date.now() - statusCache.at < 2000 && statusCache.value) return statusCache.value;
        const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(3000) });
        statusCache = { at: Date.now(), value: await res.json() };
        return statusCache.value;
    }

    async function expand(text) {
        return String(getShared().expandVariables(text, await liveStatus(), {}, false) || '').replace(/\{\{[^}]*\}\}/g, '').trim();
    }

    let enabledOverride = null;
    const enabled = () => enabledOverride !== null ? enabledOverride : getConfig().chatbot_enabled === true;
    let seq = 0;
    const activity = [];
    const logUse = (kind, name, user) => { activity.push({ seq: ++seq, kind, name, user: user || '', at: Date.now() }); if (activity.length > 50) activity.shift(); try { onUse(kind, name); } catch { /* non-fatal */ } };
    const sessionId = () => getConfig().ssn?.session_id;
    const baseUrl = () => String(getConfig().ssn?.chat_base || getConfig().ssn?.server || 'https://io.socialstream.ninja').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');

    async function send(text) {
        const id = sessionId();
        if (!id || /YOUR_SSN/.test(id)) throw new Error('SocialStream session ID is not set');
        const { tag } = data.settings;
        const lines = String(text).split(/\\n|\n/).map(l => l.trim()).filter(Boolean).slice(0, 5);
        for (let i = 0; i < lines.length; i++) {
            const message = `${tag ? `${tag} ` : ''}${lines[i]}`.slice(0, 400);
            if (i) await new Promise(r => setTimeout(r, 400));
            const res = await fetch(`${baseUrl()}/${encodeURIComponent(id)}/sendChat/${encodeURIComponent(message)}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`SocialStream replied ${res.status}`);
        }
    }

    function isMod(msg) {
        if ([msg.mod, msg.moderator, msg.isMod, msg.isModerator, msg.is_mod, msg.broadcaster, msg.isBroadcaster, msg.admin, msg.host, msg.owner].some(v => v === true || v === 'true' || v === 1)) return true;
        const badges = JSON.stringify(msg.chatbadges ?? msg.badges ?? msg.membership ?? '').toLowerCase();
        if (/moderator|broadcaster|"mod"/.test(badges)) return true;
        return data.settings.mods.includes(String(msg.chatname || '').toLowerCase());
    }

    function isSub(msg) {
        if ([msg.subscriber, msg.isSub, msg.isSubscriber, msg.is_subscriber, msg.member, msg.isMember, msg.hasMembership, msg.vip].some(v => v === true || v === 'true' || v === 1)) return true;
        if (/subscriber|member|founder|vip/i.test(String(msg.membership || ''))) return true;
        return /subscriber|"sub"|member|founder|vip/.test(JSON.stringify(msg.chatbadges ?? msg.badges ?? '').toLowerCase());
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

    async function handle(msg) {
        if (!msg || msg.event || msg.hasDonation) { /* events carry no chatter flags worth logging */ } else if (!/^\[BOT\]/.test(String(msg.chatmessage || ''))) capture(msg);
        if (!enabled()) return;
        const { prefix, tag, cooldown } = data.settings;
        const text = String(msg.chatmessage || '').replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, ' ').trim();
        // Never react to our own tagged replies or to events.
        if (!text || (tag && text.startsWith(tag)) || msg.event || msg.hasDonation) return;
        chatCount++;
        if (!text.startsWith(prefix)) return runTriggers(text, msg);
        const [first, ...rest] = text.slice(prefix.length).trim().split(/\s+/);
        const name = String(first || '').toLowerCase();
        const arg = rest.join(' ').trim();
        const now = Date.now();
        const custom = data.commands.find(c => c.enabled && (c.name === name || c.aliases.includes(name)));
        const builtin = ['quote', 'quotes', 'addquote', 'delquote'].includes(name) ? name : null;
        if (!custom && !builtin) return;
        const key = custom ? custom.name : builtin === 'quotes' ? 'quote' : builtin;
        const cfg = custom || data.settings.builtins?.[key] || { access: BUILTIN_DEFAULTS[key], cooldown: null };
        if (!allowed(cfg.access, msg)) return;
        const base = cfg.cooldown !== null && cfg.cooldown !== undefined ? cfg.cooldown : cooldown;
        const wait = (isMod(msg) ? (cfg.modCooldown ?? data.settings.modCooldown ?? base) : base) * 1000;
        if (now - (lastUsed.get(key) || 0) < wait || now - lastAny < 1000) return;

        if (custom && limited(key, custom, msg)) return;
        logUse('command', key, msg.chatname);
        if (builtin === 'addquote' || builtin === 'delquote') {
            if (builtin === 'addquote') {
                const quote = addQuote(arg, msg.chatname);
                return reply(key, quote ? `Quote #${quote.id} added.` : 'Usage: addquote <text>');
            }
            return reply(key, deleteQuote(arg) ? `Quote #${arg} removed.` : 'Usage: delquote <number>');
        }
        if (builtin === 'quotes') return reply(key, `${data.quotes.length} quote${data.quotes.length === 1 ? '' : 's'} saved. Use ${prefix}quote or ${prefix}quote <number>.`);
        if (builtin === 'quote') return reply(key, quoteReply(arg, msg));
        if (custom.counter && variables) { try { if (custom.counterAction === 'roll') variables.roll(custom.counter); else variables.change(custom.counter, custom.counterAction, 1); statusCache.at = 0; } catch (err) { console.warn(`[Chatbot] ${err.message}`); } }
        try { await reply(key, await expand(pick(custom.response, custom.random).replace(/\{\{\s*args?\s*\}\}|\$\(args?\)/g, arg).replace(USER_RE, msg.chatname || '')) || '(no value yet)'); } catch (err) { console.warn(`[Chatbot] ${err.message}`); }
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
            logUse('trigger', t.name || t.id, msg.chatname);
            const out = await expand(pick(t.text, t.random).replace(USER_RE, msg.chatname || ''));
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
            if (m.minChat && !['datetime', 'dateinterval'].includes(m.kind) && chatCount - prev.count < m.minChat) {
                if (m.kind !== 'interval') timerState.set(m.id, { ...prev, slot: due });
                continue;
            }
            timerState.set(m.id, { at: Date.now(), count: chatCount, slot: due, wait: waitMs(m) });
            try {
                const out = await expand(pick(m.text, m.random));
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
        return { enabled: enabled(), ssnConfigured: !!sessionId() && !/YOUR_SSN/.test(sessionId()), settings: data.settings, commands: data.commands, quotes: data.quotes, messages: data.messages, triggers: data.triggers };
    }

    // Returns true when the request was handled.
    async function handleApi(req, res, pathname, readBody) {
        if (!pathname.startsWith('/api/chatbot')) return false;
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        try {
            const body = req.method === 'GET' || req.method === 'DELETE' ? {} : JSON.parse(await readBody(req) || '{}');
            if (pathname === '/api/chatbot' && req.method === 'GET') return json(200, snapshot()), true;
            if (pathname === '/api/chatbot' && req.method === 'PUT') {
                if (body.settings) data.settings = normalizeSettings(body.settings);
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
            if (pathname === '/api/chatbot/activity' && req.method === 'GET') return json(200, { enabled: enabled(), seq, activity: activity.slice(-20) }), true;
            if (pathname === '/api/chatbot/enabled' && req.method === 'POST') { enabledOverride = body.action === 'toggle' ? !enabled() : body.enabled === true; return json(200, { enabled: enabled() }), true; }
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
            if (pathname === '/api/chatbot/preview' && req.method === 'POST') return json(200, { text: await expand(clean(body.text, 1000)) }), true;
            if (pathname === '/api/chatbot/send' && req.method === 'POST') {
                await send(clean(body.text, 400));
                return json(200, { sent: true }), true;
            }
        } catch (err) {
            return json(400, { error: err.message }), true;
        }
        return json(404, { error: 'Unknown chatbot endpoint' }), true;
    }

    load();
    setInterval(() => tick().catch(() => {}), 15000).unref();
    return { handle, handleApi };
};
