const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');

const MAX_IN_MEMORY_CHAT_MESSAGES = 2000;
const CHAT_WINDOWS = [5, 10, 15, 30, 60];

function parseNumericAmount(value) {
    const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function contentImageHtml(contentimg) {
    const escapeAttribute = value => String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    if (!contentimg) return '';
    if (typeof contentimg === 'string') {
        const trimmed = contentimg.trim();
        if (!trimmed) return '';
        if (/<img\b/i.test(trimmed)) return trimmed;
        if (/^(?:https?:)?\/\//i.test(trimmed)) {
            return `<img src="${escapeAttribute(trimmed)}" alt="GIF">`;
        }
        return '';
    }
    if (typeof contentimg === 'object') {
        const url = contentimg.url || contentimg.src || contentimg.imageUrl;
        return url ? `<img src="${escapeAttribute(url)}" alt="GIF">` : '';
    }
    return '';
}

function alertTierLabel(msg) {
    const text = `${msg.membership || ''} ${msg.subtitle || ''} ${msg.chatmessage || ''}`;
    const metaTier = msg.meta && typeof msg.meta === 'object' ? String(msg.meta.sub_tier || msg.meta.tier || '') : '';
    if (/prime/i.test(text) || /prime/i.test(metaTier)) return { tier: 'prime', label: 'Prime' };
    const n = (text.match(/tier\s*(\d)/i) || [])[1] || (metaTier.match(/^(\d)000$/) || [])[1];
    return n ? { tier: `${n}000`, label: `Tier ${n}` } : { tier: '', label: '' };
}

// Subscription months come from the chat badge subtitle (e.g. "48-Months") or resub payloads; keep the highest seen
function parseSubMonths(msg) {
    if (['subscription_gift', 'giftpurchase', 'sponsorship'].includes(msg.event)) return 0;
    const meta = msg.meta && typeof msg.meta === 'object' ? msg.meta : {};
    const metaMonths = Number(meta.cumulative_months ?? meta.cumulativeMonths ?? meta.months);
    if (metaMonths > 0) return Math.floor(metaMonths);
    const fromText = text => {
        const m = String(text || '').match(/(\d+)\s*-?\s*months?/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    const isSubscriberBadge = /subscriber/i.test(msg.membership || '');
    const fromBadge = isSubscriberBadge || msg.event === 'resub' ? fromText(msg.subtitle) : 0;
    const fromResub = msg.event === 'resub' ? fromText(msg.chatmessage) : 0;
    return Math.max(fromBadge, fromResub);
}

function parseChatSearchTerms(queryText) {
    if (!queryText) return null;
    const orGroups = queryText.split(/\bOR\b/i).map(group => group.trim()).filter(Boolean);
    return orGroups.map(group => {
        const terms = [];
        const tokenRegex = /(?:"([^"]+)"|(\S+))/g;
        let match;
        while ((match = tokenRegex.exec(group)) !== null) {
            const term = (match[1] || match[2]).toLowerCase();
            if (term !== 'and') terms.push(term);
        }
        return terms;
    }).filter(group => group.length > 0);
}

function normalizeChatSearchFilters(input = {}) {
    let queryText = String(input.q || '').trim();
    let user = String(input.user || '').trim().replace(/^@/, '').toLowerCase();
    const type = String(input.type || '').trim();

    if (!user) {
        const userMatches = [...queryText.matchAll(/(?:^|\s)(?:user|from):\s*(\S+)/gi)];
        if (userMatches.length > 0) {
            user = (userMatches[userMatches.length - 1][1] || '').replace(/^@/, '').toLowerCase();
            queryText = queryText.replace(/(?:^|\s)(?:user|from):\s*(\S+)/gi, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    return {
        rawQuery: String(input.q || '').trim(),
        queryText,
        user,
        type,
        searchFilter: parseChatSearchTerms(queryText)
    };
}

function chatMessageHasLink(message) {
    const urlPattern = '(?:(?:[a-z][a-z0-9+.-]*:\\/\\/|www\\.)[^\\s<>"\')\\]]+|(?<![@\\w])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(?:\\/[^\\s<>"\')\\]]*)?)';
    const htmlLinks = String(message.messageHtml || '').match(new RegExp(`href=["']${urlPattern}`, 'i'));
    return !!(
        (message.urls && message.urls.length > 0) ||
        new RegExp(`\\b${urlPattern}`, 'i').test(message.message || '') ||
        htmlLinks
    );
}

function matchChatWildcardTerm(text, term) {
    if (!/[*?]/.test(term)) {
        return text.includes(term);
    }
    let pattern = term.replace(/([.+^${}()|[\]\\])/g, '\\$1');
    pattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const startWord = /^[a-z0-9_]/i.test(term) && !term.startsWith('*');
    const endWord = /[a-z0-9_]$/i.test(term) && !term.endsWith('*');
    let regexStr = pattern;
    if (startWord) regexStr = '(?<=^|\\s|[.,!?;:\'"()\\[\\]{}])' + regexStr;
    if (endWord) regexStr = regexStr + '(?=$|\\s|[.,!?;:\'"()\\[\\]{}])';
    try {
        return new RegExp(regexStr, 'i').test(text);
    } catch {
        return text.includes(term.replace(/[*?]/g, ''));
    }
}

function matchesChatSearchText(text, searchFilter) {
    if (!searchFilter || searchFilter.length === 0) return true;
    const lower = String(text || '').toLowerCase();
    return searchFilter.some(andTerms => andTerms.every(term => matchChatWildcardTerm(lower, term)));
}

function matchesChatFilters(message, filters) {
    const user = (message.user || '').toLowerCase();
    if (filters.user) {
        if (/[*?]/.test(filters.user)) {
            const userPat = '^' + filters.user.replace(/([.+^${}()|[\]\\])/g, '\\$1').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
            try {
                if (!new RegExp(userPat, 'i').test(user)) return false;
            } catch {
                if (user !== filters.user) return false;
            }
        } else if (user !== filters.user) {
            return false;
        }
    }
    if (!matchesChatSearchText(message.message || '', filters.searchFilter)) return false;
    if (filters.type === 'links' && !chatMessageHasLink(message)) return false;
    if (filters.type === 'events' && !message.event) return false;
    if (filters.type === 'donations' && !message.donation) return false;
    return true;
}

function filterChatMessages(messages, filters, sessionName) {
    return messages
        .filter(message => matchesChatFilters(message, filters))
        .map(message => sessionName ? { ...message, session: sessionName } : message);
}

function buildDateRange(params) {
    if (params?.get('range') === 'session' || params?.get('session') === 'true' || params?.get('session') === '1' || params?.get('scope') === 'session') {
        return { session: true };
    }
    const days = parseInt(params?.get('days') || '0', 10) || 0;
    const date = params?.get('date') || '';
    const from = params?.get('from') || '';
    const to = params?.get('to') || '';

    if (date) return { from: date, to: date };
    if (from || to) return { from: from || '1970-01-01', to: to || '9999-12-31' };
    if (days > 0) {
        const fromDate = new Date(Date.now() - days * 86400000);
        return {
            from: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`,
            to: '9999-12-31'
        };
    }
    return undefined;
}

function sumDailyBuckets(days, range) {
    if (!days || typeof days !== 'object') return 0;
    let total = 0;
    for (const [day, count] of Object.entries(days)) {
        if (!range || (day >= range.from && day <= range.to)) total += count;
    }
    return total;
}

function countRangeDays(days, range) {
    if (!days || typeof days !== 'object') return 0;
    let total = 0;
    for (const [day, count] of Object.entries(days)) {
        if ((!range || (day >= range.from && day <= range.to)) && Number(count) > 0) total++;
    }
    return total;
}

function buildChatPdfHtml(title, subtitle, messages) {
    const escHtml = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Deterministic username → HSL color (readable on white PDF background)
    function userColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
        const hue = ((hash >>> 0) % 360);
        return `hsl(${hue}, 65%, 38%)`;
    }

    const sanitizeMsg = (html) => {
        if (!html) return '';
        // Keep only img tags, strip everything else
        return html.replace(/<(?!img\b)[^>]+>/gi, '').replace(/&#?\w+;/g, '');
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const renderMessage = (m) => {
        let badges = '';
        if (m.membership) badges += `<span class="badge">${escHtml(m.membership)}</span>`;
        if (m.event) badges += `<span class="badge">${escHtml(m.event)}</span>`;
        if (m.donation) badges += `<span class="badge">${escHtml(m.donation)}</span>`;

        let display = m.messageHtml ? sanitizeMsg(m.messageHtml) : escHtml(m.message);

        // Detect reply: SSN wraps reply quote in <i><small>...</small></i>
        let replyHtml = '';
        if (m.messageHtml && /<i><small>/.test(m.messageHtml)) {
            const quoteMatch = m.messageHtml.match(/<i><small>(.*?)<\/small><\/i>\s*@?(\S*)\s*/i);
            if (quoteMatch) {
                const quoteText = quoteMatch[1].replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '').replace(/:?\s*$/, '');
                const replyTo = quoteMatch[2] || '';
                const label = replyTo ? `↩ replying to ${escHtml(replyTo)}: ` : '↩ replying to: ';
                replyHtml = `<div class="reply-quote">${label}${escHtml(quoteText.substring(0, 120))}${quoteText.length > 120 ? '...' : ''}</div>`;
                // Strip the reply prefix from display
                display = sanitizeMsg(m.messageHtml.replace(/<i><small>.*?<\/small><\/i>\s*@?\S*\s*/i, ''));
            }
        } else {
            // Fallback: detect from plain text (format: "original msg:  @user reply")
            const plainMsg = m.message || '';
            const replyMatch = plainMsg.match(/^(.+?):\s\s@(\S+)\s(.+)$/s);
            if (replyMatch) {
                replyHtml = `<div class="reply-quote">↩ replying to ${escHtml(replyMatch[2])}: ${escHtml(replyMatch[1].substring(0, 120))}${replyMatch[1].length > 120 ? '...' : ''}</div>`;
                display = m.messageHtml ? sanitizeMsg(m.messageHtml) : escHtml(replyMatch[3]);
            }
        }

        return `<div class="msg">
            <div class="content-col">
                <div class="name-row"><span class="user" style="color:${userColor(m.user)}">${escHtml(m.user)}</span>${badges}<span class="time">${formatTime(m.ts)}</span></div>
                ${replyHtml}
                <div class="text">${display}</div>
            </div>
        </div>`;
    };

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
    @page { margin: 40px; size: A4; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; font-size: 10px; color: #222; line-height: 1.4; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .subtitle { font-size: 11px; color: #666; margin-bottom: 16px; }
    .msg { margin-bottom: 6px; page-break-inside: avoid; }
    .content-col { min-width: 0; }
    .name-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 1px; }
    .user { font-weight: 600; font-size: 10px; }
    .time { font-size: 8px; color: #888; margin-left: auto; }
    .badge { font-size: 7px; color: #888; background: #f0f0f0; border-radius: 3px; padding: 1px 4px; white-space: nowrap; }
    .text { font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; }
    .text img { height: 16px; vertical-align: middle; }
    .reply-quote { font-size: 8px; color: #666; border-left: 2px solid #aaa; padding-left: 6px; margin: 2px 0 4px; font-style: italic; background: #f8f8f8; padding: 2px 6px; border-radius: 0 3px 3px 0; }
</style></head><body>
    <h1>${escHtml(title)}</h1>
    <div class="subtitle">${escHtml(subtitle)}</div>
    ${messages.map(renderMessage).join('\n')}
</body></html>`;
}

function createEmptyChatData(createEmptyViewerStats = () => ({})) {
    return {
        chatters: {},
        followers: [],
        subscribers: [],
        giftSubs: [],
        bits: [],
        donations: [],
        raids: [],
        hashtags: {},
        emotes: {},
        hourlyMessages: {},
        streamInfo: [],
        viewerStats: createEmptyViewerStats(),
        startedAt: new Date().toISOString(),
        lastUpdated: null,
        messageCount: 0
    };
}

function createEmptyStatsData() {
    return {
        totalMessages: {},  // { "YYYY-MM-DD": count }
        chatters: {},       // { name: { chatimg, type, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
        emotes: {},         // { name: { imageUrl, firstUsed, lastUsed, days: { "YYYY-MM-DD": count } } }
        hashtags: {},       // { tag: { firstUsed, lastUsed, days: { "YYYY-MM-DD": count } } }
        subscribers: {},    // { name: { membership, chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
        followers: {},      // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
        giftSubs: {},       // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
        bits: {},           // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": amount } } }
        donations: {},      // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
        subTenure: {},      // { lowercased name: { months, seenAt } } highest subscription months observed from chat badges / resubs
        raids: {},          // { name: { firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
        createdAt: new Date().toISOString()
    };
}

function createSsnService({
    dataDir,
    liveChatPath = path.join(dataDir, 'chat.json'),
    chatLogPath = path.join(dataDir, 'chat-log.jsonl'),
    statsPath = path.join(dataDir, 'stats.json'),
    bannedHashtagsPath = path.join(dataDir, '.banned-hashtags.json'),
    emoteCacheDir = path.join(dataDir, 'emote-cache'),
    safeWriteFileSync = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
    getConfig = () => ({}),
    getSsnSessionId = () => '',
    getSsnServer = () => 'wss://io.socialstream.ninja',
    getBannedUsers = () => [],
    getExcludeUsers = () => [],
    getChatData = () => ({}),
    getStatsData = () => ({}),
    getChatLog = () => [],
    setChatLog = () => {},
    getPendingChatLog = () => [],
    setPendingChatLog = () => {},
    getBannedHashtags = () => new Set(),
    normalizeViewerStats = (v) => v,
    broadcastToOverlays = () => {},
    buildGoalsSnapshot = () => ({}),
    processSSNViewerUpdate = () => {},
    chatbot = null,
    alertEngine = null,
    takeoverPages = () => {},
    addClipCandidate = () => {},
    getClipCandidateConfig = () => ({}),
    getRecentChatTimestamps = () => [],
    setRecentChatTimestamps = () => {},
    log = console.log,
    warn = console.warn,
    error = console.error
}) {
    let ssnSocket = null;
    let ssnReconnectTimer = null;
    let ssnAttempts = 0;
    let featuredSocket = null;
    let lastSavedChatData = null;
    let lastSavedStats = null;
    let statsBackupRotation = 1;
    let statsLoaded = false;

    const emoteCache = new Map();
    const recentChatLog = [];

    function loadEmoteCache() {
        try {
            if (fs.existsSync(emoteCacheDir)) {
                for (const file of fs.readdirSync(emoteCacheDir)) {
                    const ext = path.extname(file).slice(1).toLowerCase();
                    const name = path.basename(file, path.extname(file));
                    if (ext) {
                        const format = ext === 'jpg' ? 'jpeg' : ext;
                        emoteCache.set(name, { path: path.join(emoteCacheDir, file), format });
                    }
                }
                if (emoteCache.size > 0) log(`[Emote Cache] Loaded ${emoteCache.size} cached emotes`);
            }
        } catch { /* start fresh */ }
    }

    const resolveAlertEngine = () => (typeof alertEngine === 'function' ? alertEngine() : alertEngine);
    const resolveChatbot = () => (typeof chatbot === 'function' ? chatbot() : chatbot);

    async function cacheEmote(name, url) {
        if (emoteCache.has(name)) return;
        try {
            if (!fs.existsSync(emoteCacheDir)) fs.mkdirSync(emoteCacheDir, { recursive: true });
            const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');

            const download = (targetUrl, redirects = 0) => {
                if (redirects > 3) return;
                const mod = targetUrl.startsWith('https') ? https : http;
                mod.get(targetUrl, (resp) => {
                    if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                        download(resp.headers.location, redirects + 1);
                        return;
                    }
                    if (resp.statusCode !== 200) { resp.resume(); return; }
                    const ct = (resp.headers['content-type'] || '').toLowerCase();
                    let ext = 'png';
                    let format = 'png';
                    if (ct.includes('jpeg') || ct.includes('jpg')) { ext = 'jpeg'; format = 'jpeg'; }
                    else if (ct.includes('gif')) { ext = 'gif'; format = 'gif'; }
                    else if (ct.includes('webp')) { ext = 'webp'; format = 'webp'; }
                    else if (ct.includes('png')) { ext = 'png'; format = 'png'; }
                    const filePath = path.join(emoteCacheDir, `${safeName}.${ext}`);
                    const ws = fs.createWriteStream(filePath);
                    resp.pipe(ws);
                    ws.on('finish', () => {
                        ws.close();
                        emoteCache.set(name, { path: filePath, format });
                        log(`[Emote Cache] Cached: ${name}`);
                    });
                    ws.on('error', () => { try { fs.unlinkSync(filePath); } catch {} });
                }).on('error', () => {});
            };
            download(url);
        } catch { /* ignore cache errors */ }
    }

    function saveChatData() {
        const chatData = getChatData();
        if (!chatData) return;
        chatData.viewerStats = normalizeViewerStats(chatData.viewerStats);
        // Compare without the timestamp so idle periods don't rewrite the file every interval.
        const { lastUpdated, ...content } = chatData;
        const fingerprint = JSON.stringify(content);
        if (fingerprint === lastSavedChatData) return;
        lastSavedChatData = fingerprint;
        chatData.lastUpdated = new Date().toISOString();
        safeWriteFileSync(liveChatPath, JSON.stringify(chatData, null, 2));
    }

    function saveChatLog() {
        const pending = getPendingChatLog();
        if (pending && pending.length > 0) {
            const lines = pending.map(e => JSON.stringify(e)).join('\n') + '\n';
            fs.appendFileSync(chatLogPath, lines);
            setPendingChatLog([]);
        }
    }

    function readChatLogFile(filepath) {
        if (!fs.existsSync(filepath)) return [];
        return fs.readFileSync(filepath, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean);
    }

    function readChatLogTail(filepath, limit = MAX_IN_MEMORY_CHAT_MESSAGES) {
        if (!fs.existsSync(filepath) || limit <= 0) return [];
        const fd = fs.openSync(filepath, 'r');
        try {
            const { size } = fs.fstatSync(fd);
            const chunkSize = 64 * 1024;
            let position = size;
            let content = '';
            while (position > 0 && content.split('\n').length <= limit + 1) {
                const length = Math.min(chunkSize, position);
                position -= length;
                const chunk = Buffer.allocUnsafe(length);
                fs.readSync(fd, chunk, 0, length, position);
                content = chunk.toString('utf8') + content;
            }
            return content
                .split('\n')
                .filter(line => line.trim())
                .slice(-limit)
                .map(line => { try { return JSON.parse(line); } catch { return null; } })
                .filter(Boolean);
        } finally {
            fs.closeSync(fd);
        }
    }

    function countChatLogEntries(filepath) {
        if (!fs.existsSync(filepath)) return 0;
        const fd = fs.openSync(filepath, 'r');
        try {
            const { size } = fs.fstatSync(fd);
            if (size === 0) return 0;
            const chunkSize = 64 * 1024;
            const chunk = Buffer.allocUnsafe(chunkSize);
            let position = 0;
            let count = 0;
            let lastByte = 0;
            while (position < size) {
                const length = Math.min(chunkSize, size - position);
                fs.readSync(fd, chunk, 0, length, position);
                for (let i = 0; i < length; i++) {
                    if (chunk[i] === 10) count++;
                }
                lastByte = chunk[length - 1];
                position += length;
            }
            return count + (lastByte === 10 ? 0 : 1);
        } finally {
            fs.closeSync(fd);
        }
    }

    function getCurrentChatLogEntries() {
        saveChatLog();
        return readChatLogFile(chatLogPath);
    }

    function loadStats() {
        const statsData = getStatsData();
        try {
            if (fs.existsSync(statsPath)) {
                Object.assign(statsData, JSON.parse(fs.readFileSync(statsPath, 'utf8')));
                log(`[Stats] Loaded: ${Object.keys(statsData.chatters || {}).length} chatters, ${Object.keys(statsData.emotes || {}).length} emotes, ${Object.keys(statsData.hashtags || {}).length} hashtags`);
                statsLoaded = true;
            } else {
                statsLoaded = true;
            }
        } catch (err) {
            warn(`[Stats] stats.json corrupt: ${err.message} — attempting backup restore`);
            // Try rotating backups (most recent first)
            for (let i = 1; i <= 3; i++) {
                const backupPath = path.join(dataDir, `.stats-backup-${i}.json`);
                try {
                    if (fs.existsSync(backupPath)) {
                        Object.assign(statsData, JSON.parse(fs.readFileSync(backupPath, 'utf8')));
                        log(`[Stats] Restored from backup ${i}`);
                        statsLoaded = true;
                        saveStats();
                        return;
                    }
                } catch { /* try next */ }
            }
            warn('[Stats] No valid backups found — starting fresh');
            statsLoaded = true;
        }
    }

    function saveStats() {
        if (!statsLoaded) {
            warn('[Stats] Refusing to save stats before stats have been loaded');
            return;
        }
        const statsData = getStatsData();
        const data = JSON.stringify(statsData, null, 2);
        if (data === lastSavedStats) return;
        lastSavedStats = data;
        safeWriteFileSync(statsPath, data);

        // Rotating backup (cycles through 1, 2, 3)
        const backupPath = path.join(dataDir, `.stats-backup-${statsBackupRotation}.json`);
        safeWriteFileSync(backupPath, data);
        statsBackupRotation = (statsBackupRotation % 3) + 1;
    }

    function recordSubTenure(chatname, msg, nowISO) {
        const months = parseSubMonths(msg);
        if (!months || months > 600 || !chatname) return;
        const statsData = getStatsData();
        if (!statsData.subTenure) statsData.subTenure = {};
        const key = chatname.toLowerCase();
        const existing = statsData.subTenure[key];
        if (!existing || months >= existing.months) statsData.subTenure[key] = { months, seenAt: nowISO };
    }

    function recentChatSummary() {
        const now = Date.now();
        while (recentChatLog.length && now - recentChatLog[0].at > 60 * 60000) recentChatLog.shift();
        const windows = {};
        for (const minutes of CHAT_WINDOWS) {
            const counts = {};
            for (const entry of recentChatLog) if (now - entry.at <= minutes * 60000) counts[entry.name] = (counts[entry.name] || 0) + 1;
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            windows[minutes] = top ? { name: top[0], count: top[1] } : null;
        }
        return { last: recentChatLog.length ? recentChatLog[recentChatLog.length - 1].name : null, windows };
    }

    function updateStats(chatname, msg) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const nowISO = now.toISOString();
        const statsData = getStatsData();
        const config = getConfig();
        const bannedHashtags = getBannedHashtags();

        // Total messages per day
        if (!statsData.totalMessages) statsData.totalMessages = {};
        statsData.totalMessages[today] = (statsData.totalMessages[today] || 0) + 1;

        recordSubTenure(chatname, msg, nowISO);

        // Track chatter (regular messages only, not events)
        if (!msg.event && chatname) {
            if (!statsData.chatters) statsData.chatters = {};
            if (!statsData.chatters[chatname]) {
                statsData.chatters[chatname] = {
                    chatimg: msg.chatimg, type: msg.type,
                    firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.chatters[chatname].days[today] = (statsData.chatters[chatname].days[today] || 0) + 1;
            statsData.chatters[chatname].lastSeen = nowISO;
            if (msg.chatimg) statsData.chatters[chatname].chatimg = msg.chatimg;
            const isMsgMod = [msg.mod, msg.moderator, msg.isMod, msg.isModerator, msg.is_mod].some(v => v === true || v === 'true' || v === 1) || (typeof msg.badges === 'string' && msg.badges.includes('moderator'));
            const isMsgVip = [msg.vip, msg.isVip, msg.is_vip].some(v => v === true || v === 'true' || v === 1) || (typeof msg.badges === 'string' && msg.badges.includes('vip'));
            if (isMsgMod) statsData.chatters[chatname].isMod = true;
            if (isMsgVip) statsData.chatters[chatname].isVip = true;
        }

        // Track follow events
        if (msg.event === 'follow' || msg.event === 'new_follower') {
            if (!statsData.followers) statsData.followers = {};
            if (!statsData.followers[chatname]) {
                statsData.followers[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.followers[chatname].days[today] = (statsData.followers[chatname].days[today] || 0) + 1;
            statsData.followers[chatname].lastSeen = nowISO;
        }

        // Track subscriber events using SSN's documented event names
        const STATS_SUB_EVENTS = ['new_subscriber', 'resub', 'subscription_gift', 'sponsorship', 'giftpurchase', 'giftredemption'];
        const isStatsSubEvent = STATS_SUB_EVENTS.includes(msg.event);
        if (isStatsSubEvent) {
            if (!statsData.giftSubs) statsData.giftSubs = {};
            if (!statsData.subscribers) statsData.subscribers = {};
            const isGift = msg.event === 'subscription_gift' || msg.event === 'giftpurchase' ||
                (msg.membership && msg.membership.toLowerCase().includes('gift')) || msg.contentimg;
            if (isGift) {
                let statsGifter;
                if (msg.event === 'giftredemption' || (msg.membership && msg.membership.toLowerCase() === 'gift_recipient')) {
                    const giftedByMatch = (msg.subtitle || '').match(/gifted\s+by\s+(\S+)/i);
                    statsGifter = giftedByMatch ? giftedByMatch[1] : 'Anonymous';
                } else if (chatname === 'Viewer' || chatname === 'AnAnonymousGifter') {
                    const nameAfterTo = (msg.chatmessage || '').match(/gifted\s+(?:a\s+)?(?:Tier \d\s+)?Sub(?:scription)?\s+to\s+(\S+)/i);
                    statsGifter = nameAfterTo ? nameAfterTo[1].replace(/[.!,]$/, '') : 'Anonymous';
                } else {
                    statsGifter = chatname;
                }
                if (!statsData.giftSubs[statsGifter]) {
                    statsData.giftSubs[statsGifter] = {
                        chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                    };
                }
                statsData.giftSubs[statsGifter].days[today] = (statsData.giftSubs[statsGifter].days[today] || 0) + 1;
                statsData.giftSubs[statsGifter].lastSeen = nowISO;
            } else {
                if (!statsData.subscribers[chatname]) {
                    statsData.subscribers[chatname] = {
                        membership: msg.membership || msg.event, chatimg: msg.chatimg,
                        firstSeen: nowISO, lastSeen: nowISO, days: {}
                    };
                }
                statsData.subscribers[chatname].days[today] = (statsData.subscribers[chatname].days[today] || 0) + 1;
                statsData.subscribers[chatname].lastSeen = nowISO;
            }
        }

        // Track bits/donations in stats
        if (msg.event === 'cheer' || msg.hasDonation) {
            if (!statsData.bits) statsData.bits = {};
            if (!statsData.donations) statsData.donations = {};
            const bitsFromMeta = msg.meta && typeof msg.meta === 'object' ? msg.meta.bits : null;
            const bitsFromDonation = msg.hasDonation ? (msg.hasDonation.match(/(\d+)/) || [])[1] : null;
            const isBits = msg.event === 'cheer' || (msg.hasDonation && msg.hasDonation.toLowerCase().includes('bit'));

            if (isBits) {
                if (!statsData.bits[chatname]) {
                    statsData.bits[chatname] = {
                        chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                    };
                }
                const amount = bitsFromMeta || (bitsFromDonation ? parseInt(bitsFromDonation, 10) : 0);
                statsData.bits[chatname].days[today] = (statsData.bits[chatname].days[today] || 0) + amount;
                statsData.bits[chatname].lastSeen = nowISO;
            } else if (msg.hasDonation) {
                if (!statsData.donations[chatname]) {
                    statsData.donations[chatname] = {
                        chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}, amounts: {}
                    };
                }
                const amount = parseNumericAmount(msg.hasDonation);
                statsData.donations[chatname].days[today] = (statsData.donations[chatname].days[today] || 0) + 1;
                statsData.donations[chatname].amounts[today] = Number(((statsData.donations[chatname].amounts[today] || 0) + amount).toFixed(2));
                statsData.donations[chatname].lastSeen = nowISO;
            }
        }

        // Track emotes
        if (msg.chatmessage) {
            if (!statsData.emotes) statsData.emotes = {};
            const emoteRegex = /<img[^>]+>/gi;
            let imgMatch;
            while ((imgMatch = emoteRegex.exec(msg.chatmessage)) !== null) {
                const tag = imgMatch[0];
                const altMatch = tag.match(/alt="([^"]+)"/);
                const srcMatch = tag.match(/src="([^"]+)"/);
                if (altMatch && srcMatch) {
                    const name = altMatch[1];
                    if (!statsData.emotes[name]) {
                        statsData.emotes[name] = { imageUrl: srcMatch[1], firstUsed: nowISO, lastUsed: nowISO, days: {} };
                    }
                    statsData.emotes[name].days[today] = (statsData.emotes[name].days[today] || 0) + 1;
                    statsData.emotes[name].lastUsed = now;
                }
            }

            // Track hashtags
            if (config.hashtags_enabled !== false) {
                if (!statsData.hashtags) statsData.hashtags = {};
                const noReply = msg.chatmessage.replace(/<i><small>.*?<\/small><\/i>\s*/gi, '');
                const stripped = noReply.replace(/<[^>]+>/g, '');
                const decoded = stripped.replace(/&#?\w+;/g, '');
                const hashtags = decoded.match(/#[a-zA-Z]\w{1,}/g);
                if (hashtags) {
                    const maxTagLen = Math.max(10, Math.min(100, Number(config.hashtag_max_length) || 50));
                    hashtags.forEach(h => {
                        if (h.length < 2 || h.length > maxTagLen) return;
                        const normalized = h.toLowerCase();
                        if (bannedHashtags.has(normalized)) return;
                        if (!statsData.hashtags[normalized]) {
                            statsData.hashtags[normalized] = { firstUsed: nowISO, lastUsed: nowISO, days: {} };
                        }
                        statsData.hashtags[normalized].days[today] = (statsData.hashtags[normalized].days[today] || 0) + 1;
                        statsData.hashtags[normalized].lastUsed = now;
                    });
                }
            }
        }

        // Track raids in stats
        if (msg.event === 'raid') {
            if (!statsData.raids) statsData.raids = {};
            if (!statsData.raids[chatname]) {
                statsData.raids[chatname] = { firstSeen: nowISO, lastSeen: nowISO, days: {} };
            }
            statsData.raids[chatname].days[today] = (statsData.raids[chatname].days[today] || 0) + 1;
            statsData.raids[chatname].lastSeen = nowISO;
        }
    }

    function collectHashtagStats(range = null) {
        const statsData = getStatsData();
        const chatData = getChatData();
        const bannedHashtags = getBannedHashtags();
        const isSessionOnly = range === 'session' || range?.session;
        const statsTags = Object.keys(statsData?.hashtags || {});
        const sessionTags = Object.keys(chatData?.hashtags || {});
        const allTags = new Set([...statsTags, ...sessionTags, ...bannedHashtags]);
        const hashtags = Array.from(allTags).map(tag => {
            const statsEntry = statsData?.hashtags?.[tag] || {};
            const sessionEntry = chatData?.hashtags?.[tag] || {};
            return {
                tag,
                count: isSessionOnly ? (sessionEntry.count || 0) : sumDailyBuckets(statsEntry.days, range),
                sessionCount: sessionEntry.count || 0,
                uniqueDays: isSessionOnly ? (sessionEntry.count > 0 ? 1 : 0) : countRangeDays(statsEntry.days, range),
                firstUsed: isSessionOnly ? (sessionEntry.firstUsed || null) : (statsEntry.firstUsed || null),
                lastUsed: isSessionOnly ? (sessionEntry.lastUsed || null) : (statsEntry.lastUsed || null),
                banned: bannedHashtags.has(tag)
            };
        }).filter(item => isSessionOnly ? item.count > 0 : (item.count > 0 || item.sessionCount > 0 || item.banned))
            .sort((a, b) => b.count - a.count || b.sessionCount - a.sessionCount || a.tag.localeCompare(b.tag));

        const top = hashtags.find(item => item.count > 0 || item.sessionCount > 0) || null;
        return {
            summary: {
                tracked: hashtags.filter(item => item.count > 0 || item.sessionCount > 0).length,
                totalMentions: hashtags.reduce((sum, item) => sum + item.count, 0),
                activeSession: hashtags.filter(item => item.sessionCount > 0).length,
                banned: hashtags.filter(item => item.banned).length,
                topTag: top?.tag || null,
                topCount: top?.count || 0
            },
            hashtags
        };
    }

    function processChatMessage(msg) {
        if (msg.bot === true) return;
        const chatname = msg.chatname;
        if (!chatname) return;

        const config = getConfig();
        const bannedUsers = getBannedUsers();
        const excludeUsers = getExcludeUsers();
        const chatData = getChatData();
        const bannedHashtags = getBannedHashtags();
        const clipCandidateConfig = getClipCandidateConfig();

        // Normalize SSN field names (eventType → event)
        if (msg.eventType && !msg.event) msg.event = msg.eventType;
        const shouldUpdateGoals = msg.event === 'follow' || msg.event === 'new_follower'
            || msg.event === 'new_subscriber' || msg.event === 'resub'
            || msg.event === 'subscription_gift' || msg.event === 'sponsorship'
            || msg.event === 'giftpurchase' || msg.event === 'giftredemption'
            || msg.event === 'cheer' || !!msg.hasDonation;

        // Banned users are completely excluded from everything
        if (bannedUsers.includes(chatname.toLowerCase())) return;

        // Append to chat log BEFORE stats exclusion (captures all non-banned users)
        if (config.chat_log_enabled !== false) {
            const contentImage = contentImageHtml(msg.contentimg);
            const messageHtml = [msg.chatmessage, contentImage].filter(Boolean).join(' ');
            const plainText = messageHtml ? messageHtml.replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '') : '';
            const urls = (plainText.match(/(?:(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"')\]]+|(?<![@\w])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?)/gi) || []);
            const chatEntry = {
                ts: Date.now(),
                user: chatname,
                avatar: msg.chatimg || null,
                message: plainText.trim(),
                messageHtml,
                contentImage: Boolean(contentImage),
                type: msg.type || null,
                event: msg.event || null,
                donation: msg.hasDonation || null,
                membership: msg.membership || null,
                urls: urls.length > 0 ? urls : undefined
            };
            const chatLog = getChatLog();
            chatLog.push(chatEntry);
            if (chatLog.length > MAX_IN_MEMORY_CHAT_MESSAGES) {
                chatLog.splice(0, chatLog.length - MAX_IN_MEMORY_CHAT_MESSAGES);
            }
            setChatLog(chatLog);
            const pending = getPendingChatLog();
            pending.push(chatEntry);
            setPendingChatLog(pending);

            // Extract and cache emotes from messageHtml
            if (messageHtml) {
                const imgRegex = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>|<img[^>]+alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/gi;
                let imgMatch;
                while ((imgMatch = imgRegex.exec(messageHtml)) !== null) {
                    const src = imgMatch[1] || imgMatch[4];
                    const alt = imgMatch[2] || imgMatch[3];
                    if (src && alt && !emoteCache.has(alt)) {
                        cacheEmote(alt, src);
                    }
                }
            }
        }

        // Excluded users appear in chat log but not in stats/overlay
        if (excludeUsers.includes(chatname.toLowerCase())) return;

        chatData.messageCount = (chatData.messageCount || 0) + 1;

        // Track hourly message volume
        const hour = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
        if (!chatData.hourlyMessages) chatData.hourlyMessages = {};
        chatData.hourlyMessages[hour] = (chatData.hourlyMessages[hour] || 0) + 1;

        if (clipCandidateConfig.enabled) {
            let timestamps = getRecentChatTimestamps();
            timestamps.push(Date.now());
            timestamps = timestamps.filter(ts =>
                Date.now() - ts <= clipCandidateConfig.chat_spike_window_seconds * 1000
            );
            setRecentChatTimestamps(timestamps);
            if (timestamps.length >= clipCandidateConfig.chat_spike_messages) {
                addClipCandidate('chat-spike', {
                    messagesLastMinute: timestamps.length
                }, Date.now(), Math.min(0.95, 0.5 + timestamps.length / 100));
            }
        } else {
            setRecentChatTimestamps([]);
        }

        updateStats(chatname, msg);

        // Track chatters (only regular messages, not events)
        if (!msg.event) {
            if (!chatData.chatters) chatData.chatters = {};
            if (!chatData.chatters[chatname]) {
                chatData.chatters[chatname] = { chatname, chatimg: msg.chatimg, type: msg.type, messageCount: 0 };
            }
            chatData.chatters[chatname].messageCount++;
            recentChatLog.push({ name: chatname, at: Date.now() });
            if (recentChatLog.length > 5000) recentChatLog.splice(0, recentChatLog.length - 5000);
        }

        if (msg.event === 'follow' || msg.event === 'new_follower') {
            if (!chatData.followers) chatData.followers = [];
            const alreadyFollowed = chatData.followers.some(f => f.chatname === chatname);
            if (!alreadyFollowed) {
                chatData.followers.push({ chatname, chatimg: msg.chatimg, timestamp: Date.now() });
                log(`[SSN] Follow: ${chatname}`);
                resolveAlertEngine()?.handleEvent({ type: 'follow', user: chatname, avatar: msg.chatimg });
            }
        }

        // Log any event or membership data from SSN for debugging
        if (msg.event || msg.hasDonation || msg.title || msg.contentimg) {
            const debugEntry = {
                ts: new Date().toISOString(),
                chatname,
                event: msg.event, membership: msg.membership, hasDonation: msg.hasDonation,
                title: msg.title, subtitle: msg.subtitle, type: msg.type,
                contentimg: msg.contentimg ? '(present)' : undefined,
                chatmessage: (msg.chatmessage || '').substring(0, 100)
            };
            log(`[SSN] Event data from ${chatname}:`, JSON.stringify(debugEntry));
            try {
                const debugLogPath = path.join(dataDir, 'ssn-debug.log');
                try {
                    if (fs.statSync(debugLogPath).size > 1024 * 1024) fs.renameSync(debugLogPath, `${debugLogPath}.old`);
                } catch { /* log not created yet */ }
                fs.appendFileSync(debugLogPath, JSON.stringify(debugEntry) + '\n');
            } catch (_) {}
        }

        const SUB_EVENTS = ['new_subscriber', 'resub', 'subscription_gift', 'sponsorship', 'giftpurchase', 'giftredemption'];
        const isSubEvent = SUB_EVENTS.includes(msg.event);
        if (isSubEvent) {
            if (!chatData.giftSubs) chatData.giftSubs = [];
            if (!chatData.subscribers) chatData.subscribers = [];
            const isGift = msg.event === 'subscription_gift' || msg.event === 'giftpurchase' ||
                (msg.membership && msg.membership.toLowerCase().includes('gift')) || msg.contentimg;
            if (isGift) {
                log(`[SSN] Gift event raw: chatname=${chatname}, event=${msg.event}, membership=${msg.membership || ''}, subtitle=${msg.subtitle || ''}, chatmessage=${(msg.chatmessage || '').substring(0, 120)}, meta=${JSON.stringify(msg.meta || {})}`);

                const nameAfterTo = (msg.chatmessage || '').match(/gifted\s+(?:a\s+)?(?:Tier \d\s+)?Sub(?:scription)?\s+to\s+(\S+)/i);
                const parsedName = nameAfterTo ? nameAfterTo[1].replace(/[.!,]$/, '') : null;
                const giftedByMatch = (msg.subtitle || '').match(/gifted\s+by\s+(\S+)/i);

                let gifter, recipient;
                if (msg.event === 'giftredemption' || (msg.membership && msg.membership.toLowerCase() === 'gift_recipient')) {
                    recipient = chatname;
                    gifter = giftedByMatch ? giftedByMatch[1] : 'Anonymous';
                } else if (chatname === 'Viewer' || chatname === 'AnAnonymousGifter') {
                    gifter = parsedName || 'Anonymous';
                    recipient = null;
                } else {
                    gifter = chatname;
                    recipient = parsedName || null;
                }

                const gifterAvatar = (chatname === gifter && msg.chatimg) ? msg.chatimg
                    : (chatData.chatters?.[gifter] ? chatData.chatters[gifter].chatimg : null);

                const giftTier = alertTierLabel(msg);
                resolveAlertEngine()?.noteGift({ user: gifter, avatar: gifterAvatar, recipient, tier: giftTier.tier, tierLabel: giftTier.label });

                const existingGift = chatData.giftSubs.find(g => g.gifter === gifter);
                if (existingGift) {
                    existingGift.count = Math.max(1, Number(existingGift.count) || 1) + 1;
                    if (recipient) existingGift.recipient = recipient;
                    if (gifterAvatar) existingGift.chatimg = gifterAvatar;
                } else {
                    chatData.giftSubs.push({ chatname: gifter, gifter, recipient, chatimg: gifterAvatar, event: msg.event || null, count: 1, timestamp: Date.now() });
                    log(`[SSN] Gift Sub: ${gifter}${recipient ? ' → ' + recipient : ''} (event=${msg.event})`);
                }
                if (clipCandidateConfig.enabled && clipCandidateConfig.include_gift_subs) {
                    addClipCandidate('gift-sub', { user: gifter, recipient }, Date.now(), 0.65);
                }
            } else {
                const subMonths = parseSubMonths(msg);
                const subTier = alertTierLabel(msg);
                const streakMatch = String(msg.chatmessage || '').match(/(\d+)\s*-?\s*month\s+streak/i);
                resolveAlertEngine()?.handleEvent({
                    type: msg.event === 'resub' || subMonths > 1 ? 'resub' : 'sub',
                    user: chatname, avatar: msg.chatimg, months: subMonths || '',
                    streak: streakMatch ? parseInt(streakMatch[1], 10) : '',
                    tier: subTier.tier, tierLabel: subTier.label,
                    message: String(msg.chatmessage || '').replace(/<[^>]+>/g, '').split(' - ')[0].trim()
                });
                const alreadySubbed = chatData.subscribers.some(s => s.chatname === chatname);
                if (!alreadySubbed) {
                    chatData.subscribers.push({ chatname, membership: msg.membership || null, subtitle: msg.subtitle || null, chatimg: msg.chatimg, event: msg.event || null, timestamp: Date.now() });
                    log(`[SSN] Sub: ${chatname} - ${msg.membership || msg.event}${msg.subtitle ? ' (' + msg.subtitle + ')' : ''}`);
                    if (clipCandidateConfig.enabled && clipCandidateConfig.include_subscriptions) {
                        addClipCandidate('subscription', { user: chatname, tier: msg.membership || msg.event }, Date.now(), 0.6);
                    }
                }
            }
        }

        // Track bits/donations
        if (msg.event === 'cheer' || msg.hasDonation) {
            if (!chatData.bits) chatData.bits = [];
            if (!chatData.donations) chatData.donations = [];
            const bitsFromMeta = msg.meta && typeof msg.meta === 'object' ? msg.meta.bits : null;
            const bitsFromDonation = msg.hasDonation ? (msg.hasDonation.match(/(\d+)/) || [])[1] : null;
            const isBits = msg.event === 'cheer' || (msg.hasDonation && msg.hasDonation.toLowerCase().includes('bit'));

            if (isBits) {
                const amount = bitsFromMeta || (bitsFromDonation ? parseInt(bitsFromDonation, 10) : 0);
                const label = msg.hasDonation || `${amount} bits`;
                const donation = { chatname, amount: label, bits: amount, chatimg: msg.chatimg, timestamp: Date.now() };
                chatData.bits.push(donation);
                log(`[SSN] Bits: ${chatname} - ${label} (${amount} bits)`);
                resolveAlertEngine()?.handleEvent({ type: 'bits', user: chatname, avatar: msg.chatimg, amount: Number(amount) || 0, message: String(msg.chatmessage || '').replace(/<[^>]+>/g, '').trim() });
                if (clipCandidateConfig.enabled && clipCandidateConfig.include_bits && amount >= clipCandidateConfig.minimum_bits) {
                    addClipCandidate('bits', { user: chatname, amount, label }, Date.now(), Math.min(0.95, 0.55 + amount / 1000));
                }
            } else if (msg.hasDonation) {
                const donation = { chatname, amount: msg.hasDonation, amountValue: parseNumericAmount(msg.hasDonation), chatimg: msg.chatimg, timestamp: Date.now() };
                chatData.donations.push(donation);
                log(`[SSN] Donation: ${chatname} - ${msg.hasDonation}`);
                resolveAlertEngine()?.handleEvent({ type: 'donation', user: chatname, avatar: msg.chatimg, amount: parseNumericAmount(msg.hasDonation) || 0, message: String(msg.chatmessage || '').replace(/<[^>]+>/g, '').trim() });
                const donationValue = parseNumericAmount(msg.hasDonation);
                if (clipCandidateConfig.enabled && clipCandidateConfig.include_donations && donationValue >= clipCandidateConfig.minimum_donation) {
                    addClipCandidate('donation', { user: chatname, amount: msg.hasDonation }, Date.now(), 0.7);
                }
            }
        }

        // Track raids
        if (msg.event === 'raid') {
            if (!chatData.raids) chatData.raids = [];
            const alreadyRaided = chatData.raids.some(r => r.chatname === chatname);
            if (!alreadyRaided) {
                const viewers = msg.chatmessage ? (msg.chatmessage.match(/(\d+)/) || [])[1] : null;
                chatData.raids.push({ chatname, chatimg: msg.chatimg, viewers: viewers ? parseInt(viewers, 10) : null, timestamp: Date.now() });
                log(`[SSN] Raid: ${chatname}${viewers ? ` with ${viewers} viewers` : ''}`);
                const raidViewers = viewers ? parseInt(viewers, 10) : 0;
                resolveAlertEngine()?.handleEvent({ type: 'raid', user: chatname, avatar: msg.chatimg, amount: raidViewers, viewers: raidViewers });
                if (clipCandidateConfig.enabled && clipCandidateConfig.include_raids && raidViewers >= clipCandidateConfig.minimum_raid_viewers) {
                    addClipCandidate('raid', { user: chatname, viewers: raidViewers || null }, Date.now(), 0.8);
                }
                resolveChatbot()?.handleRaid({ user: chatname, viewers: raidViewers, avatar: msg.chatimg }).catch(() => {});
            }
        }

        if (msg.event === 'reward') {
            const rewardMatch = String(msg.chatmessage || '').replace(/<[^>]+>/g, '').match(/redeemed\s+(.+?)\s*(?:\((\d[\d,]*)\s*points?\))?\s*$/i);
            resolveAlertEngine()?.handleEvent({
                type: 'redeem', user: chatname, avatar: msg.chatimg,
                reward: rewardMatch ? rewardMatch[1].trim() : '',
                amount: rewardMatch && rewardMatch[2] ? parseInt(rewardMatch[2].replace(/,/g, ''), 10) : 0
            });
        } else if (!msg.event && msg.chatmessage) {
            resolveAlertEngine()?.handleEvent({ type: 'chat_word', user: chatname, avatar: msg.chatimg, message: String(msg.chatmessage).replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '').trim() });
        }

        if (msg.chatmessage) {
            if (msg.chatmessage.includes('<img')) {
                log(`[SSN] Emote msg from ${chatname}:`, msg.chatmessage.substring(0, 300));
            }

            // Match img tags regardless of attribute order
            const emoteRegex = /<img[^>]+>/gi;
            let imgMatch;
            if (!chatData.emotes) chatData.emotes = {};
            while ((imgMatch = emoteRegex.exec(msg.chatmessage)) !== null) {
                const tag = imgMatch[0];
                const altMatch = tag.match(/alt="([^"]+)"/);
                const srcMatch = tag.match(/src="([^"]+)"/);
                if (altMatch && srcMatch) {
                    const name = altMatch[1];
                    const url = srcMatch[1];
                    if (!chatData.emotes[name]) {
                        chatData.emotes[name] = { count: 0, imageUrl: url, users: [] };
                    }
                    chatData.emotes[name].count++;
                    if (!chatData.emotes[name].users.includes(chatname)) {
                        chatData.emotes[name].users.push(chatname);
                    }
                }
            }

            // Track session hashtags
            const noReply2 = msg.chatmessage.replace(/<i><small>.*?<\/small><\/i>\s*/gi, '');
            const stripped = noReply2.replace(/<[^>]+>/g, '');
            const decoded2 = stripped.replace(/&#?\w+;/g, '');
            if (config.hashtags_enabled !== false) {
                if (!chatData.hashtags) chatData.hashtags = {};
                const hashtags = decoded2.match(/#[a-zA-Z]\w{1,}/g);
                if (hashtags) {
                    const maxTagLen = Math.max(10, Math.min(100, Number(config.hashtag_max_length) || 50));
                    hashtags.forEach(tag => {
                        if (tag.length < 2 || tag.length > maxTagLen) return;
                        const normalized = tag.toLowerCase();
                        if (bannedHashtags.has(normalized)) return;
                        if (!chatData.hashtags[normalized]) {
                            chatData.hashtags[normalized] = { count: 0, users: [] };
                        }
                        chatData.hashtags[normalized].count++;
                        if (!chatData.hashtags[normalized].users.includes(chatname)) {
                            chatData.hashtags[normalized].users.push(chatname);
                        }
                    });
                }
            }
        }

        broadcastToOverlays('update', chatData);
        if (shouldUpdateGoals) {
            broadcastToOverlays('goals-update', buildGoalsSnapshot());
        }
    }

    function scheduleSSNReconnect() {
        ssnAttempts++;
        const delay = Math.min(30000, 3000 * Math.pow(2, Math.min(ssnAttempts - 1, 4)));
        log(`[SSN] Disconnected. Reconnecting in ${Math.round(delay / 1000)}s...`);
        clearTimeout(ssnReconnectTimer);
        ssnReconnectTimer = setTimeout(connectSSN, delay);
    }

    function connectSSN() {
        const ssnSessionId = getSsnSessionId();
        const ssnServer = getSsnServer();
        if (!ssnSessionId) {
            warn('[SSN] No session_id in config.json — chat collection disabled');
            return;
        }

        clearTimeout(ssnReconnectTimer);
        log(`[SSN] Connecting to ${ssnServer}...`);
        let socket;
        try {
            socket = new WebSocket(ssnServer, { handshakeTimeout: 15000 });
        } catch (err) {
            error(`[SSN] Could not start connection: ${err.message}`);
            scheduleSSNReconnect();
            return;
        }
        ssnSocket = socket;

        let lastHeard = Date.now();
        let watchdog = null;
        let closed = false;
        const heard = () => { lastHeard = Date.now(); };

        socket.on('open', () => {
            ssnAttempts = 0;
            heard();
            log(`[SSN] Connected! Joining session: ${ssnSessionId}`);
            socket.send(JSON.stringify({ join: ssnSessionId, in: 4, out: 3 }));
            log('[SSN] Listening for chat messages...');
            watchdog = setInterval(() => {
                if (Date.now() - lastHeard > 60000) {
                    warn('[SSN] No response for 60s — reconnecting');
                    socket.terminate();
                    return;
                }
                try { socket.ping(); } catch { /* socket closing */ }
            }, 20000);
        });

        socket.on('pong', heard);

        socket.on('message', (raw) => {
            heard();
            try {
                let msg = JSON.parse(raw.toString());
                if (msg.overlayNinja) msg = msg.overlayNinja;
                processSSNViewerUpdate(msg);
                processChatMessage(msg);
                resolveChatbot()?.handle(msg).catch(() => {});
            } catch { /* ignore parse errors */ }
        });

        socket.on('error', (err) => {
            error(`[SSN] Error: ${err.message}`);
        });

        socket.on('close', () => {
            if (closed) return;
            closed = true;
            clearInterval(watchdog);
            if (ssnSocket !== socket) return;
            saveChatData();
            saveChatLog();
            scheduleSSNReconnect();
        });
    }

    function connectFeaturedListener() {
        const ssnSessionId = getSsnSessionId();
        const ssnServer = getSsnServer();
        if (!ssnSessionId) return;
        let socket;
        try {
            socket = new WebSocket(ssnServer, { handshakeTimeout: 15000 });
        } catch {
            return setTimeout(connectFeaturedListener, 30000);
        }
        featuredSocket = socket;
        socket.on('open', () => socket.send(JSON.stringify({ join: ssnSessionId, in: 2, out: 9 })));
        socket.on('message', raw => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg && msg.clicked && msg.chatmessage !== undefined) {
                    takeoverPages('featured', '');
                }
            } catch { /* ignore */ }
        });
        socket.on('error', () => {});
        socket.on('close', () => setTimeout(connectFeaturedListener, 15000));
    }

    function disconnectSSN() {
        clearTimeout(ssnReconnectTimer);
        if (ssnSocket) {
            try { ssnSocket.terminate(); } catch {}
            ssnSocket = null;
        }
        if (featuredSocket) {
            try { featuredSocket.terminate(); } catch {}
            featuredSocket = null;
        }
    }

    function loadCurrentSessionStateFromDisk() {
        const chatData = getChatData();
        try {
            if (fs.existsSync(liveChatPath)) {
                Object.assign(chatData, JSON.parse(fs.readFileSync(liveChatPath, 'utf8')));
                chatData.viewerStats = normalizeViewerStats(chatData.viewerStats);
                log('[Restore] Reloaded current session data');
            }
        } catch (err) {
            warn('[Restore] Current session reload failed:', err.message);
        }

        try {
            const reloadedChatLog = readChatLogTail(chatLogPath);
            setChatLog(reloadedChatLog);
            setPendingChatLog([]);
            const count = countChatLogEntries(chatLogPath);
            log(`[Restore] Reloaded current chat log (${count} messages; retained ${reloadedChatLog.length} in memory)`);
        } catch (err) {
            warn('[Restore] Current chat log reload failed:', err.message);
        }
    }

    return {
        connectSSN,
        scheduleSSNReconnect,
        disconnectSSN,
        connectFeaturedListener,
        getSsnSocket: () => ssnSocket,
        getSsnStatus: () => ({
            connected: ssnSocket?.readyState === WebSocket.OPEN,
            session: getSsnSessionId() ? 'configured' : null
        }),
        processChatMessage,
        updateStats,
        recordSubTenure,
        recentChatSummary,
        saveChatData,
        saveStats,
        loadStats,
        saveChatLog,
        readChatLogFile,
        readChatLogTail,
        countChatLogEntries,
        getCurrentChatLogEntries,
        cacheEmote,
        loadEmoteCache,
        getEmoteCache: () => emoteCache,
        collectHashtagStats,
        loadCurrentSessionStateFromDisk
    };
}

module.exports = {
    MAX_IN_MEMORY_CHAT_MESSAGES,
    CHAT_WINDOWS,
    parseNumericAmount,
    contentImageHtml,
    alertTierLabel,
    parseSubMonths,
    parseChatSearchTerms,
    normalizeChatSearchFilters,
    chatMessageHasLink,
    matchChatWildcardTerm,
    matchesChatSearchText,
    matchesChatFilters,
    filterChatMessages,
    buildDateRange,
    sumDailyBuckets,
    countRangeDays,
    buildChatPdfHtml,
    createEmptyChatData,
    createEmptyStatsData,
    createSsnService
};
