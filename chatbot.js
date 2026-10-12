// Chat bot (beta): !commands, quotes and mod-only commands. Replies go out through SocialStream's sendChat endpoint.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEFAULT_SETTINGS = { prefix: '!', tag: '[BOT]', cooldown: 5, mods: [] };
const MAX_COMMANDS = 200;
const MAX_QUOTES = 5000;
const NAME_RE = /^[a-z0-9_]{1,30}$/;

module.exports = function createChatbot({ dataDir, getConfig, port }) {
    const file = path.join(dataDir, 'chatbot.json');
    let data = { settings: { ...DEFAULT_SETTINGS }, commands: [], quotes: [], nextQuoteId: 1 };
    const lastUsed = new Map();
    let lastAny = 0;
    let shared = null;
    let statusCache = { at: 0, value: null };

    const ACCESS = ['everyone', 'subs', 'mods'];
const BUILTIN_DEFAULTS = { quote: 'everyone', quotes: 'everyone', addquote: 'mods', delquote: 'mods' };
const clean = (value, max) => String(value ?? '').replace(/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

    function normalizeSettings(input = {}) {
        const mods = Array.isArray(input.mods) ? input.mods : String(input.mods || '').split(/[\s,]+/);
        return {
            prefix: clean(input.prefix, 3) || DEFAULT_SETTINGS.prefix,
            tag: clean(input.tag, 20),
            cooldown: Math.max(0, Math.min(3600, Number(input.cooldown ?? DEFAULT_SETTINGS.cooldown) || 0)),
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
            access: ACCESS.includes(input.access) ? input.access : input.modOnly === true ? 'mods' : 'everyone',
            cooldown: input.cooldown === '' || input.cooldown === null || input.cooldown === undefined ? null : Math.max(0, Math.min(3600, Number(input.cooldown) || 0)),
            enabled: input.enabled !== false
        };
    }

    function normalizeQuote(input = {}) {
        const text = clean(input.text, 300);
        if (!text) return null;
        return { id: Math.max(1, Number(input.id) || 0), text, by: clean(input.by, 60), at: Number(input.at) || Date.now() };
    }

    function load() {
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            data.settings = normalizeSettings(raw.settings);
            const seen = new Set();
            data.commands = (raw.commands || []).map(normalizeCommand).filter(c => c && !seen.has(c.name) && seen.add(c.name)).slice(0, MAX_COMMANDS);
            data.quotes = (raw.quotes || []).map(normalizeQuote).filter(Boolean).slice(0, MAX_QUOTES);
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

    const enabled = () => getConfig().chatbot_enabled === true;
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
        if ([msg.mod, msg.moderator, msg.isMod, msg.isModerator, msg.is_mod, msg.broadcaster, msg.isBroadcaster].some(v => v === true || v === 'true' || v === 1)) return true;
        const badges = JSON.stringify(msg.chatbadges ?? msg.badges ?? msg.membership ?? '').toLowerCase();
        if (/moderator|broadcaster|"mod"/.test(badges)) return true;
        return data.settings.mods.includes(String(msg.chatname || '').toLowerCase());
    }

    function isSub(msg) {
        if ([msg.subscriber, msg.isSub, msg.isSubscriber, msg.is_subscriber, msg.member, msg.isMember].some(v => v === true || v === 'true' || v === 1)) return true;
        return /subscriber|"sub"|member|founder|vip/.test(JSON.stringify(msg.chatbadges ?? msg.badges ?? msg.membership ?? '').toLowerCase());
    }

    const allowed = (access, msg) => access === 'everyone' || isMod(msg) || (access === 'subs' && isSub(msg));

    const formatQuote = q => `"${q.text}" (#${q.id}${q.by ? `, added by ${q.by}` : ''}, ${new Date(q.at).getFullYear()})`;

    function quoteReply(arg, msg) {
        const [sub, ...rest] = arg.split(/\s+/);
        if (!data.quotes.length) return 'No quotes yet.';
        if (/^\d+$/.test(sub || '')) {
            const q = data.quotes.find(item => item.id === Number(sub));
            return q ? formatQuote(q) : `No quote #${sub}.`;
        }
        if (arg) {
            const matches = data.quotes.filter(q => q.text.toLowerCase().includes(arg.toLowerCase()));
            return matches.length ? formatQuote(matches[Math.floor(Math.random() * matches.length)]) : `No quote matches "${arg}".`;
        }
        return formatQuote(data.quotes[Math.floor(Math.random() * data.quotes.length)]);
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
    async function handle(msg) {
        if (!enabled()) return;
        const { prefix, tag, cooldown } = data.settings;
        const text = String(msg.chatmessage || '').replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, ' ').trim();
        // Never react to our own tagged replies or to events.
        if (!text || (tag && text.startsWith(tag)) || msg.event || msg.hasDonation || !text.startsWith(prefix)) return;
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
        const wait = (cfg.cooldown !== null && cfg.cooldown !== undefined ? cfg.cooldown : cooldown) * 1000;
        if (now - (lastUsed.get(key) || 0) < wait || now - lastAny < 1000) return;

        if (builtin === 'addquote' || builtin === 'delquote') {
            if (builtin === 'addquote') {
                const quote = addQuote(arg, msg.chatname);
                return reply(key, quote ? `Quote #${quote.id} added.` : 'Usage: addquote <text>');
            }
            return reply(key, deleteQuote(arg) ? `Quote #${arg} removed.` : 'Usage: delquote <number>');
        }
        if (builtin === 'quotes') return reply(key, `${data.quotes.length} quote${data.quotes.length === 1 ? '' : 's'} saved. Use ${prefix}quote or ${prefix}quote <number>.`);
        if (builtin === 'quote') return reply(key, quoteReply(arg, msg));
        try { await reply(key, await expand(custom.response.replace(/\{\{\s*args?\s*\}\}/g, arg)) || '(no value yet)'); } catch (err) { console.warn(`[Chatbot] ${err.message}`); }
    }

    function snapshot() {
        return { enabled: enabled(), ssnConfigured: !!sessionId() && !/YOUR_SSN/.test(sessionId()), settings: data.settings, commands: data.commands, quotes: data.quotes };
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
                save();
                return json(200, snapshot()), true;
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
                save();
                return json(200, snapshot()), true;
            }
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
    return { handle, handleApi };
};
