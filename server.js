#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const WebSocket = require('ws');

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG_PATH = path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json — copy config.json and fill in your credentials.');
    process.exit(1);
}

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = config.port || 8080;
const BROADCASTER_ID = config.broadcaster_id;
const BROADCASTER_NAME = config.broadcaster_name || '';
const EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
const TWITCH_CLIENT_ID = config.twitch?.client_id;
const TWITCH_CLIENT_SECRET = config.twitch?.client_secret;
const SSN_SESSION_ID = config.ssn?.session_id;
const SSN_SERVER = config.ssn?.server || 'wss://io.socialstream.ninja';
const REFRESH_MINUTES = config.twitch_refresh_minutes || 10;
const SUBS_SOURCE = config.subs_source || 'twitch';       // "twitch", "ssn", or "both"
const ACTIVE_SUBS_ONLY = config.active_subs_only || false; // only show subs who chatted
const DATA_DIR = path.join(__dirname, 'data');
const BANNED_HASHTAGS_PATH = path.join(DATA_DIR, '.banned-hashtags.json');

// Session state
let sessionActive = true;

// Load banned hashtags (persisted across restarts)
let bannedHashtags = new Set();
try {
    if (fs.existsSync(BANNED_HASHTAGS_PATH)) {
        bannedHashtags = new Set(JSON.parse(fs.readFileSync(BANNED_HASHTAGS_PATH, 'utf8')));
        console.log(`[Config] Loaded ${bannedHashtags.size} banned hashtags`);
    }
} catch { /* start fresh */ }

function saveBannedHashtags() {
    fs.writeFileSync(BANNED_HASHTAGS_PATH, JSON.stringify([...bannedHashtags], null, 2));
}

function openBrowser(url) {
    const cmd = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} "${url}"`);
}

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// TWITCH OAUTH (User Token via Authorization Code Flow)
// ============================================================================

const TWITCH_SCOPES = 'channel:read:subscriptions bits:read moderator:read:followers';
const TWITCH_REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;
const TOKEN_PATH = path.join(DATA_DIR, '.twitch-token.json');

let twitchAccessToken = null;
let twitchRefreshToken = null;
let twitchTokenExpiry = 0;

function loadStoredToken() {
    try {
        if (fs.existsSync(TOKEN_PATH)) {
            const stored = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            twitchAccessToken = stored.access_token;
            twitchRefreshToken = stored.refresh_token;
            twitchTokenExpiry = stored.expires_at || 0;
            console.log('[Twitch] Loaded stored token');
            return true;
        }
    } catch { /* ignore */ }
    return false;
}

function saveToken(tokenData) {
    twitchAccessToken = tokenData.access_token;
    twitchRefreshToken = tokenData.refresh_token;
    twitchTokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({
        access_token: twitchAccessToken,
        refresh_token: twitchRefreshToken,
        expires_at: twitchTokenExpiry
    }));
}

function twitchTokenRequest(body) {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams(body).toString();
        const req = https.request('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        resolve(json);
                    } else {
                        reject(new Error(`Token error: ${data}`));
                    }
                } catch {
                    reject(new Error(`Token parse error: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function refreshTwitchToken() {
    if (!twitchRefreshToken) return false;
    try {
        const tokenData = await twitchTokenRequest({
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: twitchRefreshToken
        });
        saveToken(tokenData);
        console.log('[Twitch] Token refreshed, expires in', Math.round(tokenData.expires_in / 60), 'minutes');
        return true;
    } catch (err) {
        console.error('[Twitch] Token refresh failed:', err.message);
        // Clear invalid tokens
        twitchAccessToken = null;
        twitchRefreshToken = null;
        try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
        return false;
    }
}

async function ensureToken() {
    if (twitchAccessToken && Date.now() < twitchTokenExpiry) return true;
    if (twitchRefreshToken) return await refreshTwitchToken();
    return false;
}

// ============================================================================
// TWITCH API HELPERS
// ============================================================================

function twitchApiRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
        const query = new URLSearchParams(params).toString();
        const url = `https://api.twitch.tv/helix${endpoint}${query ? '?' + query : ''}`;

        const req = https.request(url, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${twitchAccessToken}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    reject(new Error(`Twitch API parse error: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ============================================================================
// TWITCH DATA FETCHER
// ============================================================================

async function fetchAllPages(endpoint, params, dataKey = 'data') {
    const allData = [];
    let cursor = null;

    do {
        const queryParams = { ...params, first: '100' };
        if (cursor) queryParams.after = cursor;

        const result = await twitchApiRequest(endpoint, queryParams);
        if (result.status !== 200) {
            console.error(`[Twitch] ${endpoint} returned ${result.status}:`, JSON.stringify(result.body).substring(0, 200));
            break;
        }

        const pageData = result.body[dataKey] || [];
        allData.push(...pageData);
        cursor = result.body.pagination?.cursor || null;
    } while (cursor);

    return allData;
}

async function fetchTwitchData() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !BROADCASTER_ID) {
        console.warn('[Twitch] Missing credentials or broadcaster_id in config.json — skipping Twitch fetch');
        return;
    }

    const hasToken = await ensureToken();
    if (!hasToken) {
        console.warn(`[Twitch] No user token — visit http://localhost:${PORT}/auth/twitch to authorize`);
        return;
    }

    console.log('[Twitch] Fetching data for broadcaster:', BROADCASTER_ID);

    try {
        // Fetch subscribers
        console.log('[Twitch] Fetching subscribers...');
        const subs = await fetchAllPages('/subscriptions', { broadcaster_id: BROADCASTER_ID });
        fs.writeFileSync(path.join(DATA_DIR, 'subs.json'), JSON.stringify({ data: subs }, null, 2));
        console.log(`[Twitch] Saved ${subs.length} subscribers`);

        // Fetch bits leaderboard (month)
        console.log('[Twitch] Fetching bits leaderboard...');
        const bitsResult = await twitchApiRequest('/bits/leaderboard', { count: '100', period: 'month' });
        if (bitsResult.status === 200) {
            fs.writeFileSync(path.join(DATA_DIR, 'bits.json'), JSON.stringify(bitsResult.body, null, 2));
            console.log(`[Twitch] Saved ${bitsResult.body.data?.length || 0} bits leaders`);
        } else {
            console.warn('[Twitch] Bits leaderboard not available:', bitsResult.status);
            fs.writeFileSync(path.join(DATA_DIR, 'bits.json'), JSON.stringify({ data: [] }));
        }

        // Fetch followers
        console.log('[Twitch] Fetching followers...');
        const followers = await fetchAllPages('/channels/followers', { broadcaster_id: BROADCASTER_ID });
        fs.writeFileSync(path.join(DATA_DIR, 'followers.json'), JSON.stringify({ data: followers }, null, 2));
        console.log(`[Twitch] Saved ${followers.length} followers`);

        console.log('[Twitch] Data fetch complete!');
    } catch (err) {
        console.error('[Twitch] Fetch error:', err.message);
    }
}

// ============================================================================
// SSN CHAT COLLECTOR
// ============================================================================

const chatData = {
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
    startedAt: new Date().toISOString(),
    lastUpdated: null,
    messageCount: 0
};

// Persistent stats — survives restarts, daily bucket tracking
const STATS_PATH = path.join(DATA_DIR, 'stats.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
let statsData = {
    totalMessages: {},  // { "YYYY-MM-DD": count }
    chatters: {},       // { name: { chatimg, type, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
    emotes: {},         // { name: { imageUrl, firstUsed, lastUsed, days: { "YYYY-MM-DD": count } } }
    hashtags: {},       // { tag: { firstUsed, lastUsed, days: { "YYYY-MM-DD": count } } }
    subscribers: {},    // { name: { membership, chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
    followers: {},      // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
    giftSubs: {},       // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
    bits: {},           // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": amount } } }
    donations: {},      // { name: { chatimg, firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
    raids: {},          // { name: { firstSeen, lastSeen, days: { "YYYY-MM-DD": count } } }
    createdAt: new Date().toISOString()
};

function loadStats() {
    try {
        if (fs.existsSync(STATS_PATH)) {
            statsData = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
            console.log(`[Stats] Loaded: ${Object.keys(statsData.chatters).length} chatters, ${Object.keys(statsData.emotes).length} emotes, ${Object.keys(statsData.hashtags).length} hashtags`);
        }
    } catch (err) {
        console.warn(`[Stats] stats.json corrupt: ${err.message} — attempting backup restore`);
        // Try rotating backups (most recent first)
        for (let i = 1; i <= 3; i++) {
            const backupPath = path.join(DATA_DIR, `.stats-backup-${i}.json`);
            try {
                if (fs.existsSync(backupPath)) {
                    statsData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
                    console.log(`[Stats] Restored from backup ${i}`);
                    saveStats();
                    return;
                }
            } catch { /* try next */ }
        }
        console.warn('[Stats] No valid backups found — starting fresh');
    }
}

let statsBackupRotation = 1;

function saveStats() {
    const data = JSON.stringify(statsData, null, 2);
    fs.writeFileSync(STATS_PATH, data);

    // Rotating backup (cycles through 1, 2, 3)
    const backupPath = path.join(DATA_DIR, `.stats-backup-${statsBackupRotation}.json`);
    fs.writeFileSync(backupPath, data);
    statsBackupRotation = (statsBackupRotation % 3) + 1;
}

function updateStats(chatname, msg) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowISO = now.toISOString();

    // Total messages per day
    if (!statsData.totalMessages) statsData.totalMessages = {};
    statsData.totalMessages[today] = (statsData.totalMessages[today] || 0) + 1;

    // Track chatter (regular messages only, not events)
    if (!msg.event && chatname) {
        if (!statsData.chatters[chatname]) {
            statsData.chatters[chatname] = {
                chatimg: msg.chatimg, type: msg.type,
                firstSeen: nowISO, lastSeen: nowISO, days: {}
            };
        }
        statsData.chatters[chatname].days[today] = (statsData.chatters[chatname].days[today] || 0) + 1;
        statsData.chatters[chatname].lastSeen = now;
        if (msg.chatimg) statsData.chatters[chatname].chatimg = msg.chatimg;
    }

    // Track follow events
    if (msg.event === 'follow') {
        if (!statsData.followers[chatname]) {
            statsData.followers[chatname] = {
                chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
            };
        }
        statsData.followers[chatname].days[today] = (statsData.followers[chatname].days[today] || 0) + 1;
        statsData.followers[chatname].lastSeen = now;
    }

    // Track subscriber events
    if (msg.membership && msg.event) {
        if (msg.membership.toLowerCase().includes('gift') || msg.contentimg) {
            if (!statsData.giftSubs[chatname]) {
                statsData.giftSubs[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.giftSubs[chatname].days[today] = (statsData.giftSubs[chatname].days[today] || 0) + 1;
            statsData.giftSubs[chatname].lastSeen = now;
        } else {
            if (!statsData.subscribers[chatname]) {
                statsData.subscribers[chatname] = {
                    membership: msg.membership, chatimg: msg.chatimg,
                    firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.subscribers[chatname].days[today] = (statsData.subscribers[chatname].days[today] || 0) + 1;
            statsData.subscribers[chatname].lastSeen = now;
        }
    }

    // Track bits/donations
    if (msg.hasDonation) {
        if (msg.hasDonation.toLowerCase().includes('bit')) {
            if (!statsData.bits[chatname]) {
                statsData.bits[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            const match = msg.hasDonation.match(/(\d+)/);
            const amount = match ? parseInt(match[1]) : 0;
            statsData.bits[chatname].days[today] = (statsData.bits[chatname].days[today] || 0) + amount;
            statsData.bits[chatname].lastSeen = now;
        } else {
            if (!statsData.donations[chatname]) {
                statsData.donations[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.donations[chatname].days[today] = (statsData.donations[chatname].days[today] || 0) + 1;
            statsData.donations[chatname].lastSeen = now;
        }
    }

    // Track emotes
    if (msg.chatmessage) {
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
        const stripped = msg.chatmessage.replace(/<[^>]+>/g, '');
        const decoded = stripped.replace(/&#?\w+;/g, '');
        const hashtags = decoded.match(/#[a-zA-Z]\w{1,}/g);
        if (hashtags) {
            hashtags.forEach(h => {
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

    // Track raids in stats
    if (msg.event === 'raid') {
        if (!statsData.raids[chatname]) {
            statsData.raids[chatname] = { firstSeen: nowISO, lastSeen: nowISO, days: {} };
        }
        statsData.raids[chatname].days[today] = (statsData.raids[chatname].days[today] || 0) + 1;
        statsData.raids[chatname].lastSeen = nowISO;
    }
}

let ssnSocket = null;
let ssnReconnectTimer = null;

function saveChatData() {
    chatData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(path.join(DATA_DIR, 'chat.json'), JSON.stringify(chatData, null, 2));
}

function archiveSession() {
    const chatPath = path.join(DATA_DIR, 'chat.json');
    try {
        if (fs.existsSync(chatPath)) {
            const prevChat = JSON.parse(fs.readFileSync(chatPath, 'utf8'));
            if (prevChat.messageCount > 0) {
                if (!fs.existsSync(SESSIONS_DIR)) {
                    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
                }
                const sessionDate = (prevChat.startedAt || new Date().toISOString()).slice(0, 10);
                let archiveName = `chat-${sessionDate}.json`;
                let counter = 2;
                while (fs.existsSync(path.join(SESSIONS_DIR, archiveName))) {
                    archiveName = `chat-${sessionDate}-${counter}.json`;
                    counter++;
                }
                fs.copyFileSync(chatPath, path.join(SESSIONS_DIR, archiveName));
                console.log(`[Session] Archived → data/sessions/${archiveName}`);
                return archiveName;
            }
        }
    } catch (err) {
        console.warn('[Session] Could not archive:', err.message);
    }
    return null;
}

function resetChatData() {
    chatData.chatters = {};
    chatData.followers = [];
    chatData.subscribers = [];
    chatData.giftSubs = [];
    chatData.bits = [];
    chatData.donations = [];
    chatData.raids = [];
    chatData.hashtags = {};
    chatData.emotes = {};
    chatData.hourlyMessages = {};
    chatData.messageCount = 0;
    chatData.startedAt = new Date().toISOString();
    chatData.lastUpdated = null;
    saveChatData();
}

function processChatMessage(msg) {
    if (msg.bot === true) return;
    const chatname = msg.chatname;
    if (!chatname) return;
    if (EXCLUDE_USERS.includes(chatname.toLowerCase())) return;

    chatData.messageCount++;

    // Track hourly message volume
    const hour = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    chatData.hourlyMessages[hour] = (chatData.hourlyMessages[hour] || 0) + 1;

    updateStats(chatname, msg);

    // Track chatters (only regular messages, not events)
    if (!msg.event) {
        if (!chatData.chatters[chatname]) {
            chatData.chatters[chatname] = { chatname, chatimg: msg.chatimg, type: msg.type, messageCount: 0 };
        }
        chatData.chatters[chatname].messageCount++;
    }

    if (msg.event === 'follow') {
        const alreadyFollowed = chatData.followers.some(f => f.chatname === chatname);
        if (!alreadyFollowed) {
            chatData.followers.push({ chatname, chatimg: msg.chatimg, timestamp: Date.now() });
            console.log(`[SSN] Follow: ${chatname}`);
        }
    }

    // Only track new sub *events*, not the membership badge on every message
    if (msg.membership && msg.event) {
        const alreadySubbed = chatData.subscribers.some(s => s.chatname === chatname);
        if (!alreadySubbed) {
            if (msg.membership.toLowerCase().includes('gift') || msg.contentimg) {
                chatData.giftSubs.push({ chatname, chatimg: msg.chatimg });
                console.log(`[SSN] Gift Sub: ${chatname}`);
            } else {
                chatData.subscribers.push({ chatname, membership: msg.membership, chatimg: msg.chatimg });
                console.log(`[SSN] Sub: ${chatname} - ${msg.membership}`);
            }
        }
    }

    if (msg.hasDonation) {
        const donation = { chatname, amount: msg.hasDonation, chatimg: msg.chatimg };
        if (msg.hasDonation.toLowerCase().includes('bit')) {
            chatData.bits.push(donation);
            console.log(`[SSN] Bits: ${chatname} - ${msg.hasDonation}`);
        } else {
            chatData.donations.push(donation);
            console.log(`[SSN] Donation: ${chatname} - ${msg.hasDonation}`);
        }
    }

    // Track raids
    if (msg.event === 'raid' || (msg.chatmessage && msg.chatmessage.toLowerCase().includes('raid'))) {
        if (msg.event === 'raid') {
            const alreadyRaided = chatData.raids.some(r => r.chatname === chatname);
            if (!alreadyRaided) {
                const viewers = msg.chatmessage ? (msg.chatmessage.match(/(\d+)/) || [])[1] : null;
                chatData.raids.push({ chatname, chatimg: msg.chatimg, viewers: viewers ? parseInt(viewers) : null, timestamp: Date.now() });
                console.log(`[SSN] Raid: ${chatname}${viewers ? ` with ${viewers} viewers` : ''}`);
            }
        }
    }

    if (msg.chatmessage) {
        // Debug: log raw chatmessage to see emote format
        if (msg.chatmessage.includes('<img')) {
            console.log(`[SSN] Emote msg from ${chatname}:`, msg.chatmessage.substring(0, 300));
        }

        // Match img tags regardless of attribute order
        const emoteRegex = /<img[^>]+>/gi;
        let imgMatch;
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

        const stripped = msg.chatmessage.replace(/<[^>]+>/g, '');
        const decoded2 = stripped.replace(/&#?\w+;/g, '');
        const hashtags = decoded2.match(/#[a-zA-Z]\w{1,}/g);
        if (hashtags) {
            hashtags.forEach(tag => {
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

    // Broadcast update to connected overlay clients
    broadcastToOverlays('update', chatData);
}

function connectSSN() {
    if (!SSN_SESSION_ID) {
        console.warn('[SSN] No session_id in config.json — chat collection disabled');
        return;
    }

    console.log(`[SSN] Connecting to ${SSN_SERVER}...`);
    ssnSocket = new WebSocket(SSN_SERVER);

    ssnSocket.on('open', () => {
        console.log(`[SSN] Connected! Joining session: ${SSN_SESSION_ID}`);
        ssnSocket.send(JSON.stringify({ join: SSN_SESSION_ID, in: 4, out: 3 }));
        console.log('[SSN] Listening for chat messages...');
    });

    ssnSocket.on('message', (raw) => {
        try {
            let msg = JSON.parse(raw.toString());
            if (msg.overlayNinja) msg = msg.overlayNinja;
            processChatMessage(msg);
        } catch { /* ignore parse errors */ }
    });

    ssnSocket.on('error', (err) => {
        console.error(`[SSN] Error: ${err.message}`);
    });

    ssnSocket.on('close', () => {
        console.log('[SSN] Disconnected. Reconnecting in 3s...');
        saveChatData();
        clearTimeout(ssnReconnectTimer);
        ssnReconnectTimer = setTimeout(connectSSN, 3000);
    });
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Auth endpoints
    if (pathname === '/auth/twitch') {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
            `client_id=${TWITCH_CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(TWITCH_SCOPES)}`;
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
    }

    if (pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authorization denied</h1><p>${error}</p><p><a href="/auth/twitch">Try again</a></p>`);
            return;
        }

        if (code) {
            try {
                const tokenData = await twitchTokenRequest({
                    client_id: TWITCH_CLIENT_ID,
                    client_secret: TWITCH_CLIENT_SECRET,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: TWITCH_REDIRECT_URI
                });
                saveToken(tokenData);
                console.log('[Twitch] User authorized! Token saved.');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<h1>✅ Twitch authorized!</h1><p>You can close this tab. The server will now fetch your data.</p>');
                fetchTwitchData();
            } catch (err) {
                console.error('[Twitch] Auth callback error:', err.message);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Authorization failed</h1><p>${err.message}</p><p><a href="/auth/twitch">Try again</a></p>`);
            }
            return;
        }

        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Missing authorization code</h1><p><a href="/auth/twitch">Try again</a></p>');
        return;
    }

    // API endpoints
    if (pathname === '/api/config') {
        if (req.method === 'PUT') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const updates = JSON.parse(body);
                    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

                    // Only allow safe fields to be edited
                    const safeFields = ['days_filter', 'subs_source', 'active_subs_only', 'exclude_users', 'credits'];
                    for (const key of safeFields) {
                        if (updates[key] !== undefined) {
                            current[key] = updates[key];
                        }
                    }

                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));

                    // Hot-reload config vars
                    config.credits = current.credits;
                    config.days_filter = current.days_filter;
                    config.subs_source = current.subs_source;
                    config.active_subs_only = current.active_subs_only;
                    config.exclude_users = current.exclude_users;

                    console.log('[Config] Updated and hot-reloaded');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'saved', message: 'Config updated and applied' }));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        // GET — return editable config fields
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            subs_source: config.subs_source || 'twitch',
            active_subs_only: config.active_subs_only || false,
            broadcaster_name: BROADCASTER_NAME,
            exclude_users: config.exclude_users || [],
            days_filter: config.days_filter || 30,
            credits: config.credits || {}
        }));
        return;
    }

    if (pathname === '/api/fetch') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'fetching' }));
        fetchTwitchData();
        return;
    }

    if (pathname === '/api/status') {
        const status = {
            uptime: process.uptime(),
            ssn: {
                connected: ssnSocket?.readyState === WebSocket.OPEN,
                session: SSN_SESSION_ID || null,
                messages: chatData.messageCount,
                chatters: Object.keys(chatData.chatters).length,
                emotes: Object.keys(chatData.emotes).length,
                hashtags: Object.keys(chatData.hashtags).length,
                raids: chatData.raids.length,
                subscribers: chatData.subscribers.length,
                followers: chatData.followers.length
            },
            twitch: {
                broadcaster_id: BROADCASTER_ID || null,
                hasToken: !!twitchAccessToken,
                refreshMinutes: REFRESH_MINUTES
            },
            overlayClients: overlayClients.size,
            sessionActive,
            startedAt: chatData.startedAt,
            hourlyMessages: chatData.hourlyMessages
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status, null, 2));
        return;
    }

    if (pathname === '/api/reset') {
        resetChatData();
        broadcastToOverlays('update', chatData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', message: 'Chat data cleared' }));
        console.log('[API] Chat data reset');
        return;
    }

    if (pathname === '/api/end-session') {
        saveChatData();
        saveStats();
        const archiveName = archiveSession();
        resetChatData();
        sessionActive = false;
        broadcastToOverlays('update', chatData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ended', archived: archiveName, message: 'Session archived and reset. Server still running.' }));
        console.log('[API] Session ended — ready for next stream');
        return;
    }

    if (pathname === '/api/start-session') {
        resetChatData();
        sessionActive = true;
        broadcastToOverlays('update', chatData);
        // Re-fetch Twitch data for the new session
        if (twitchAccessToken && BROADCASTER_ID) {
            fetchTwitchData();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', startedAt: chatData.startedAt, message: 'New session started.' }));
        console.log('[API] New session started');
        return;
    }

    if (pathname === '/api/shutdown') {
        saveChatData();
        saveStats();
        const archiveName = archiveSession();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'shutting_down', archived: archiveName, message: 'Server shutting down...' }));
        console.log('[API] Shutdown requested');
        setTimeout(() => {
            if (ssnSocket) ssnSocket.close();
            server.close();
            console.log('[Server] Goodbye!');
            process.exit(0);
        }, 500);
        return;
    }

    if (pathname === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(statsData, null, 2));
        return;
    }

    if (pathname === '/api/stats/reset') {
        statsData = {
            totalMessages: {}, chatters: {}, emotes: {}, hashtags: {},
            subscribers: {}, followers: {}, giftSubs: {}, bits: {},
            donations: {}, raids: {},
            createdAt: new Date().toISOString()
        };
        saveStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', message: 'Stats data cleared' }));
        console.log('[API] Stats data reset');
        return;
    }

    // Hashtag moderation endpoints
    if (pathname === '/api/hashtags/banned') {
        if (req.method === 'GET') {
            // List all banned hashtags + current session/stats hashtags
            const sessionHashtags = Object.entries(chatData.hashtags || {})
                .map(([tag, d]) => ({ tag, count: d.count || 0, source: 'session' }))
                .sort((a, b) => b.count - a.count);
            const statsHashtags = Object.entries(statsData.hashtags || {})
                .map(([tag, d]) => {
                    const total = d.days ? Object.values(d.days).reduce((s, c) => s + c, 0) : 0;
                    return { tag, count: total, source: 'stats' };
                })
                .sort((a, b) => b.count - a.count);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ banned: [...bannedHashtags], session: sessionHashtags, stats: statsHashtags }));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { tag } = JSON.parse(body);
                    if (!tag) throw new Error('Missing tag');
                    const normalized = tag.toLowerCase().startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;

                    bannedHashtags.add(normalized);
                    saveBannedHashtags();

                    // Purge from session chat data
                    delete chatData.hashtags[normalized];
                    saveChatData();

                    // Purge from persistent stats
                    delete statsData.hashtags[normalized];
                    saveStats();

                    broadcastToOverlays('update', chatData);
                    console.log(`[Moderation] Banned hashtag: ${normalized}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'banned', tag: normalized }));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        if (req.method === 'DELETE') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { tag } = JSON.parse(body);
                    if (!tag) throw new Error('Missing tag');
                    const normalized = tag.toLowerCase().startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;

                    bannedHashtags.delete(normalized);
                    saveBannedHashtags();

                    console.log(`[Moderation] Unbanned hashtag: ${normalized}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'unbanned', tag: normalized }));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }
    }

    if (pathname === '/api/stats/migrate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const migrated = JSON.parse(body);
                statsData = migrated;
                saveStats();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'migrated', message: 'Stats data migrated to daily buckets' }));
                console.log('[API] Stats data migrated to daily buckets');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON', message: err.message }));
            }
        });
        return;
    }

    if (pathname === '/api/sessions') {
        try {
            if (!fs.existsSync(SESSIONS_DIR)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }
            const files = fs.readdirSync(SESSIONS_DIR)
                .filter(f => f.endsWith('.json'))
                .sort()
                .reverse();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/export') {
        const params = new URL(req.url, `http://localhost`).searchParams;
        const type = params.get('type') || 'all';
        const days = parseInt(params.get('days')) || 0;
        const date = params.get('date') || '';
        const from = params.get('from') || '';
        const to = params.get('to') || '';

        // Determine date range
        let range = null;
        if (date) {
            range = { from: date, to: date };
        } else if (from || to) {
            range = { from: from || '1970-01-01', to: to || '9999-12-31' };
        } else if (days) {
            const now = new Date();
            const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate() - days).padStart(2, '0')}`;
            const fromDate = new Date(Date.now() - days * 86400000);
            range = { from: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`, to: '9999-12-31' };
        }

        function sumBuckets(days, range) {
            if (!days) return 0;
            let total = 0;
            for (const [d, count] of Object.entries(days)) {
                if (!range || (d >= range.from && d <= range.to)) total += count;
            }
            return total;
        }

        let csv = '';
        const types = type === 'all' ? ['chatters', 'emotes', 'hashtags', 'subscribers', 'followers', 'bits', 'donations', 'raids'] : [type];

        for (const t of types) {
            const data = statsData[t];
            if (!data || typeof data !== 'object') continue;

            if (t === 'chatters') {
                csv += 'type,name,count,first_seen,last_seen\n';
                Object.entries(data).forEach(([name, d]) => {
                    const count = sumBuckets(d.days, range);
                    if (count > 0) csv += `chatter,"${name}",${count},${d.firstSeen || ''},${d.lastSeen || ''}\n`;
                });
            } else if (t === 'emotes') {
                csv += 'type,name,count,first_used,last_used\n';
                Object.entries(data).forEach(([name, d]) => {
                    const count = sumBuckets(d.days, range);
                    if (count > 0) csv += `emote,"${name}",${count},${d.firstUsed || ''},${d.lastUsed || ''}\n`;
                });
            } else if (t === 'hashtags') {
                csv += 'type,name,count,first_used,last_used\n';
                Object.entries(data).forEach(([tag, d]) => {
                    const count = sumBuckets(d.days, range);
                    if (count > 0) csv += `hashtag,"${tag}",${count},${d.firstUsed || ''},${d.lastUsed || ''}\n`;
                });
            } else if (t === 'bits') {
                csv += 'type,name,amount,first_seen,last_seen\n';
                Object.entries(data).forEach(([name, d]) => {
                    const amount = sumBuckets(d.days, range);
                    if (amount > 0) csv += `bits,"${name}",${amount},${d.firstSeen || ''},${d.lastSeen || ''}\n`;
                });
            } else {
                csv += `type,name,count,first_seen,last_seen\n`;
                Object.entries(data).forEach(([name, d]) => {
                    const count = sumBuckets(d.days, range);
                    if (count > 0) csv += `${t},"${name}",${count},${d.firstSeen || ''},${d.lastSeen || ''}\n`;
                });
            }
            csv += '\n';
        }

        const filename = `stats-export-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        res.writeHead(200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`
        });
        res.end(csv);
        return;
    }

    // Serve individual session files
    const sessionMatch = pathname.match(/^\/api\/sessions\/(.+\.json)$/);
    if (sessionMatch) {
        const sessionFile = path.join(SESSIONS_DIR, sessionMatch[1]);
        if (!sessionFile.startsWith(SESSIONS_DIR) || !fs.existsSync(sessionFile)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(fs.readFileSync(sessionFile, 'utf8'));
        return;
    }

    // Static file serving
    let filePath = pathname === '/' ? '/credits.html' : pathname;
    filePath = path.join(__dirname, filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            const ext = path.extname(filePath);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } catch {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// ============================================================================
// STARTUP
// ============================================================================

console.log('============================================');
console.log('  Stream Credits Server');
console.log('============================================');

// WebSocket server for live overlay push
const overlayWss = new WebSocket.Server({ server });
const overlayClients = new Set();

overlayWss.on('connection', (ws) => {
    overlayClients.add(ws);
    console.log(`[WS] Overlay client connected (${overlayClients.size} total)`);

    // Send current data snapshot immediately
    ws.send(JSON.stringify({ type: 'snapshot', data: chatData }));

    ws.on('close', () => {
        overlayClients.delete(ws);
        console.log(`[WS] Overlay client disconnected (${overlayClients.size} total)`);
    });
});

function broadcastToOverlays(type, payload) {
    const msg = JSON.stringify({ type, data: payload });
    for (const client of overlayClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

server.listen(PORT, () => {
    console.log(`  HTTP:      http://localhost:${PORT}`);
    console.log(`  Credits:   http://localhost:${PORT}/credits.html`);
    console.log(`  Stats:     http://localhost:${PORT}/stats.html`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`  Sessions:  http://localhost:${PORT}/sessions.html`);
    console.log(`  Migrate:   http://localhost:${PORT}/migrate.html`);
    console.log(`  Export:    http://localhost:${PORT}/api/export?type=all`);
    console.log(`  WebSocket: ws://localhost:${PORT} (overlay push)`);
    console.log('============================================\n');

    // Archive previous session's chat data before clearing
    archiveSession();

    // Auto-clear session chat data on startup
    resetChatData();
    console.log('[Startup] Chat data cleared for new session');

    // Load persistent stats
    loadStats();

    // Start SSN collector
    connectSSN();

    // Load stored Twitch token and fetch data
    loadStoredToken();
    if (twitchAccessToken) {
        fetchTwitchData();
    } else if (TWITCH_CLIENT_ID) {
        const authUrl = `http://localhost:${PORT}/auth/twitch`;
        console.log(`[Twitch] No token found — opening browser to authorize...`);
        openBrowser(authUrl);
    }

    // Auto-refresh Twitch data
    if (REFRESH_MINUTES > 0) {
        setInterval(fetchTwitchData, REFRESH_MINUTES * 60 * 1000);
        console.log(`[Twitch] Auto-refresh every ${REFRESH_MINUTES} minutes`);
    }

    // Save chat/stats to disk every 5 seconds
    setInterval(() => {
        saveChatData();
        saveStats();
    }, 5000);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    saveChatData();
    saveStats();
    if (ssnSocket) ssnSocket.close();
    server.close();
    console.log('[Server] Data saved. Goodbye!');
    process.exit(0);
});
