#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
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
const TWITCH_CLIENT_ID = config.twitch?.client_id;
const TWITCH_CLIENT_SECRET = config.twitch?.client_secret;
const SSN_SESSION_ID = config.ssn?.session_id;
const SSN_SERVER = config.ssn?.server || 'wss://io.socialstream.ninja';
const REFRESH_MINUTES = config.twitch_refresh_minutes || 10;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// TWITCH OAUTH
// ============================================================================

let twitchAccessToken = null;
let twitchTokenExpiry = 0;

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

function getAppToken() {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials'
        }).toString();

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
                        twitchAccessToken = json.access_token;
                        twitchTokenExpiry = Date.now() + (json.expires_in * 1000) - 60000;
                        console.log('[Twitch] Got app token, expires in', Math.round(json.expires_in / 60), 'minutes');
                        resolve(twitchAccessToken);
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

async function ensureToken() {
    if (!twitchAccessToken || Date.now() > twitchTokenExpiry) {
        await getAppToken();
    }
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

    console.log('[Twitch] Fetching data for broadcaster:', BROADCASTER_ID);

    try {
        await ensureToken();

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

    chatData.messageCount++;

    if (!msg.event) {
        if (!chatData.chatters[chatname]) {
            chatData.chatters[chatname] = { chatname, chatimg: msg.chatimg, type: msg.type, messageCount: 0 };
        }
        chatData.chatters[chatname].messageCount++;
    }

    if (msg.event === 'follow') {
        chatData.followers.push({ chatname, chatimg: msg.chatimg, timestamp: Date.now() });
        console.log(`[SSN] Follow: ${chatname}`);
    }

    if (msg.membership) {
        if (msg.membership.toLowerCase().includes('gift') || msg.contentimg) {
            chatData.giftSubs.push({ chatname, chatimg: msg.chatimg });
            console.log(`[SSN] Gift Sub: ${chatname}`);
        } else {
            chatData.subscribers.push({ chatname, membership: msg.membership, chatimg: msg.chatimg });
            console.log(`[SSN] Sub: ${chatname} - ${msg.membership}`);
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
        const emoteRegex = /<img[^>]+alt="([^"]+)"[^>]+src="([^"]+)"[^>]*>/gi;
        let match;
        while ((match = emoteRegex.exec(msg.chatmessage)) !== null) {
            const name = match[1];
            const url = match[2];
            if (!chatData.emotes[name]) {
                chatData.emotes[name] = { count: 0, imageUrl: url, users: [] };
            }
            chatData.emotes[name].count++;
            if (!chatData.emotes[name].users.includes(chatname)) {
                chatData.emotes[name].users.push(chatname);
            }
        }

        const stripped = msg.chatmessage.replace(/<[^>]+>/g, '');
        const hashtags = stripped.match(/#\w+/g);
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

    if (chatData.messageCount % 10 === 0) {
        saveChatData();
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

    // API endpoints
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
    console.log(`  Credits: http://localhost:${PORT}/credits.html?session=${SSN_SESSION_ID || 'YOUR_SESSION_ID'}`);
    console.log(`  Status:  http://localhost:${PORT}/api/status`);
    console.log(`  Fetch:   http://localhost:${PORT}/api/fetch`);
    console.log(`  Reset:   http://localhost:${PORT}/api/reset`);
    console.log('============================================\n');

    // Start SSN collector
    connectSSN();

    // Initial Twitch fetch
    fetchTwitchData();

    // Auto-refresh Twitch data
    if (REFRESH_MINUTES > 0) {
        setInterval(fetchTwitchData, REFRESH_MINUTES * 60 * 1000);
        console.log(`[Twitch] Auto-refresh every ${REFRESH_MINUTES} minutes`);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    saveChatData();
    if (ssnSocket) ssnSocket.close();
    server.close();
    console.log('[Server] Data saved. Goodbye!');
    process.exit(0);
});
