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

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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
    hashtags: {},
    emotes: {},
    startedAt: new Date().toISOString(),
    lastUpdated: null,
    messageCount: 0
};

// Persistent stats — survives restarts, timestamped entries
const STATS_PATH = path.join(DATA_DIR, 'stats.json');
let statsData = {
    chatters: {},    // { name: { messageCount, lastSeen, firstSeen, chatimg, type } }
    emotes: {},      // { name: { count, imageUrl, lastUsed, firstUsed } }
    hashtags: {},    // { tag: { count, lastUsed, firstUsed } }
    totalMessages: 0,
    createdAt: new Date().toISOString()
};

function loadStats() {
    try {
        if (fs.existsSync(STATS_PATH)) {
            statsData = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
            console.log(`[Stats] Loaded: ${Object.keys(statsData.chatters).length} chatters, ${Object.keys(statsData.emotes).length} emotes, ${Object.keys(statsData.hashtags).length} hashtags`);
        }
    } catch { console.warn('[Stats] Could not load stats.json — starting fresh'); }
}

function saveStats() {
    fs.writeFileSync(STATS_PATH, JSON.stringify(statsData, null, 2));
}

function updateStats(chatname, msg) {
    const now = new Date().toISOString();
    statsData.totalMessages++;

    // Track chatter
    if (!msg.event && chatname) {
        if (!statsData.chatters[chatname]) {
            statsData.chatters[chatname] = {
                messageCount: 0, chatimg: msg.chatimg, type: msg.type,
                firstSeen: now, lastSeen: now
            };
        }
        statsData.chatters[chatname].messageCount++;
        statsData.chatters[chatname].lastSeen = now;
        if (msg.chatimg) statsData.chatters[chatname].chatimg = msg.chatimg;
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
                    statsData.emotes[name] = { count: 0, imageUrl: srcMatch[1], firstUsed: now, lastUsed: now };
                }
                statsData.emotes[name].count++;
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
                if (!statsData.hashtags[normalized]) {
                    statsData.hashtags[normalized] = { count: 0, firstUsed: now, lastUsed: now };
                }
                statsData.hashtags[normalized].count++;
                statsData.hashtags[normalized].lastUsed = now;
            });
        }
    }
}

let ssnSocket = null;
let ssnReconnectTimer = null;

function saveChatData() {
    chatData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(path.join(DATA_DIR, 'chat.json'), JSON.stringify(chatData, null, 2));
}

function processChatMessage(msg) {
    if (msg.bot === true) return;
    const chatname = msg.chatname;
    if (!chatname) return;
    if (EXCLUDE_USERS.includes(chatname.toLowerCase())) return;

    chatData.messageCount++;
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            subs_source: SUBS_SOURCE,
            active_subs_only: ACTIVE_SUBS_ONLY,
            broadcaster_name: BROADCASTER_NAME,
            exclude_users: EXCLUDE_USERS,
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
                hashtags: Object.keys(chatData.hashtags).length
            },
            twitch: {
                broadcaster_id: BROADCASTER_ID || null,
                hasToken: !!twitchAccessToken,
                refreshMinutes: REFRESH_MINUTES
            }
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status, null, 2));
        return;
    }

    if (pathname === '/api/reset') {
        chatData.chatters = {};
        chatData.followers = [];
        chatData.subscribers = [];
        chatData.giftSubs = [];
        chatData.bits = [];
        chatData.donations = [];
        chatData.hashtags = {};
        chatData.emotes = {};
        chatData.messageCount = 0;
        chatData.startedAt = new Date().toISOString();
        saveChatData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', message: 'Chat data cleared' }));
        console.log('[API] Chat data reset');
        return;
    }

    if (pathname === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(statsData, null, 2));
        return;
    }

    if (pathname === '/api/stats/reset') {
        statsData = {
            chatters: {}, emotes: {}, hashtags: {},
            totalMessages: 0, createdAt: new Date().toISOString()
        };
        saveStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', message: 'Stats data cleared' }));
        console.log('[API] Stats data reset');
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

server.listen(PORT, () => {
    console.log(`  HTTP:    http://localhost:${PORT}`);
    console.log(`  Credits: http://localhost:${PORT}/credits.html`);
    console.log(`  Stats:   http://localhost:${PORT}/stats.html`);
    console.log(`  Status:  http://localhost:${PORT}/api/status`);
    console.log(`  Fetch:   http://localhost:${PORT}/api/fetch`);
    console.log(`  Reset:   http://localhost:${PORT}/api/reset`);
    console.log('============================================\n');

    // Auto-clear session chat data on startup
    saveChatData();
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
