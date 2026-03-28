#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

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
let EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
let BANNED_USERS = (config.banned_users || []).map(u => u.toLowerCase());
const TWITCH_CLIENT_ID = config.twitch?.client_id;
const TWITCH_CLIENT_SECRET = config.twitch?.client_secret;
const SSN_SESSION_ID = config.ssn?.session_id;
const SSN_SERVER = config.ssn?.server || 'wss://io.socialstream.ninja';
const REFRESH_MINUTES = config.twitch_refresh_minutes || 10;
const MUSIC_CONFIG = config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 };

const ACTIVE_SUBS_ONLY = config.active_subs_only || false; // only show subs who chatted
const DATA_DIR = path.join(__dirname, 'data');
const BANNED_HASHTAGS_PATH = path.join(DATA_DIR, '.banned-hashtags.json');
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat-log.jsonl');
const HIGHLIGHTS_PATH = path.join(DATA_DIR, 'highlights.jsonl');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const EMOTE_CACHE_DIR = path.join(DATA_DIR, 'emote-cache');

// Emote image cache: emote name → { path, format }
const emoteCache = new Map();
try {
    if (fs.existsSync(EMOTE_CACHE_DIR)) {
        for (const file of fs.readdirSync(EMOTE_CACHE_DIR)) {
            const ext = path.extname(file).slice(1).toLowerCase();
            const name = path.basename(file, path.extname(file));
            if (ext) {
                const format = ext === 'jpg' ? 'jpeg' : ext;
                emoteCache.set(name, { path: path.join(EMOTE_CACHE_DIR, file), format });
            }
        }
        if (emoteCache.size > 0) console.log(`[Emote Cache] Loaded ${emoteCache.size} cached emotes`);
    }
} catch { /* start fresh */ }

async function cacheEmote(name, url) {
    if (emoteCache.has(name)) return;
    try {
        if (!fs.existsSync(EMOTE_CACHE_DIR)) fs.mkdirSync(EMOTE_CACHE_DIR, { recursive: true });
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
                const filePath = path.join(EMOTE_CACHE_DIR, `${safeName}.${ext}`);
                const ws = fs.createWriteStream(filePath);
                resp.pipe(ws);
                ws.on('finish', () => {
                    ws.close();
                    emoteCache.set(name, { path: filePath, format });
                    console.log(`[Emote Cache] Cached: ${name}`);
                });
                ws.on('error', () => { try { fs.unlinkSync(filePath); } catch {} });
            }).on('error', () => {});
        };
        download(url);
    } catch { /* silently fail */ }
}

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

// ============================================================================
// HIGHLIGHTS (Pin/Unpin chat messages)
// ============================================================================

let highlights = [];

function loadHighlights() {
    try {
        if (fs.existsSync(HIGHLIGHTS_PATH)) {
            highlights = fs.readFileSync(HIGHLIGHTS_PATH, 'utf8')
                .split('\n').filter(l => l.trim())
                .map(l => { try { return JSON.parse(l); } catch { return null; } })
                .filter(Boolean);
            console.log(`[Highlights] Loaded ${highlights.length} highlights`);
        }
    } catch { /* start fresh */ }
}

function saveHighlights() {
    const lines = highlights.map(h => JSON.stringify(h)).join('\n');
    fs.writeFileSync(HIGHLIGHTS_PATH, lines ? lines + '\n' : '');
}

loadHighlights();

// ============================================================================
// WEBHOOKS (Discord)
// ============================================================================

let webhookQueue = [];
let webhookTimer = null;

const WEBHOOK_COLORS = {
    follow: 0x3fb950,    // green
    subscribe: 0xa371f7, // purple
    raid: 0xe3b341,      // orange
    bits: 0xd29922,      // yellow
    donation: 0x58a6ff   // blue
};

function fireWebhook(eventType, data) {
    const wh = config.webhooks;
    if (!wh || !wh.enabled || !wh.discord_url) return;
    if (wh.events && !wh.events.includes(eventType)) return;

    webhookQueue.push({ eventType, data, ts: Date.now() });

    const batchMs = ((wh.batch_seconds || 5) * 1000);
    if (webhookTimer) clearTimeout(webhookTimer);
    webhookTimer = setTimeout(flushWebhooks, batchMs);
}

function flushWebhooks() {
    webhookTimer = null;
    if (webhookQueue.length === 0) return;

    const batch = webhookQueue.splice(0);
    const embeds = batch.map(item => ({
        title: `${item.eventType.charAt(0).toUpperCase() + item.eventType.slice(1)}`,
        description: item.data.message || `${item.data.user || 'Unknown'}`,
        color: WEBHOOK_COLORS[item.eventType] || 0x58a6ff,
        fields: Object.entries(item.data)
            .filter(([k]) => k !== 'message')
            .map(([k, v]) => ({ name: k, value: String(v || ''), inline: true })),
        timestamp: new Date(item.ts).toISOString()
    })).slice(0, 10); // Discord max 10 embeds

    const payload = JSON.stringify({ embeds });
    try {
        const urlObj = new URL(config.webhooks.discord_url);
        const reqLib = urlObj.protocol === 'https:' ? https : http;
        const req = reqLib.request(urlObj, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            if (res.statusCode >= 400) {
                console.warn(`[Webhook] Discord returned ${res.statusCode}`);
            }
            res.resume();
        });
        req.on('error', (err) => console.warn(`[Webhook] Error: ${err.message}`));
        req.write(payload);
        req.end();
    } catch (err) {
        console.warn(`[Webhook] Send error: ${err.message}`);
    }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimitMap = new Map(); // IP -> { reads: [], mutations: [] }

function checkRateLimit(req, res) {
    const rl = config.rate_limit;
    if (!rl || !rl.enabled) return false;

    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60000;

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { reads: [], mutations: [] });
    }
    const entry = rateLimitMap.get(ip);

    // Prune old entries
    entry.reads = entry.reads.filter(t => now - t < windowMs);
    entry.mutations = entry.mutations.filter(t => now - t < windowMs);

    const method = req.method;
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        const limit = rl.mutation_per_minute || 30;
        if (entry.mutations.length >= limit) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
            res.end(JSON.stringify({ error: 'Rate limit exceeded (mutations)', retry_after: 60 }));
            return true;
        }
        entry.mutations.push(now);
    } else {
        const limit = rl.requests_per_minute || 120;
        if (entry.reads.length >= limit) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
            res.end(JSON.stringify({ error: 'Rate limit exceeded', retry_after: 60 }));
            return true;
        }
        entry.reads.push(now);
    }
    return false;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        entry.reads = entry.reads.filter(t => now - t < 60000);
        entry.mutations = entry.mutations.filter(t => now - t < 60000);
        if (entry.reads.length === 0 && entry.mutations.length === 0) {
            rateLimitMap.delete(ip);
        }
    }
}, 300000);

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

async function fetchStreamInfo() {
    if (!TWITCH_CLIENT_ID || !BROADCASTER_ID) return;
    const hasToken = await ensureToken();
    if (!hasToken) return;

    try {
        const result = await twitchApiRequest('/channels', { broadcaster_id: BROADCASTER_ID });
        if (result.status !== 200 || !result.body.data?.[0]) return;

        const ch = result.body.data[0];
        const title = ch.title || '';
        const category = ch.game_name || '';
        const now = new Date().toISOString();

        // Only record if title or category changed from the last entry
        const last = chatData.streamInfo[chatData.streamInfo.length - 1];
        if (!last || last.title !== title || last.category !== category) {
            chatData.streamInfo.push({ title, category, changedAt: now });
            console.log(`[Twitch] Stream info: "${title}" — ${category || '(no category)'}`);
        }
    } catch (err) {
        console.error('[Twitch] Stream info fetch error:', err.message);
    }
}

// ============================================================================
// MUSIC NOW-PLAYING (Apple Music via osascript)
// ============================================================================

const MUSIC_ART_PATH = path.join(DATA_DIR, 'music-artwork.png');
const MUSIC_FALLBACK_ART_PATH = path.join(DATA_DIR, 'music-fallback.png');
let musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
let musicPollTimer = null;

function runOsascript(lines, cb) {
    const args = lines.map(l => `-e '${l.replace(/'/g, "'\\''")}'`).join(' ');
    exec(`osascript ${args}`, cb);
}

function pollAppleMusic() {
    runOsascript([
        'if application "Music" is running then',
        '  tell application "Music"',
        '    set pState to player state as string',
        '    if pState is "playing" or pState is "paused" then',
        '      set tName to name of current track',
        '      set tArtist to artist of current track',
        '      set tAlbum to album of current track',
        '      set tYear to year of current track',
        '      set tDur to duration of current track',
        '      set tPos to player position',
        '      return pState & "|||" & tName & "|||" & tArtist & "|||" & tAlbum & "|||" & tYear & "|||" & tDur & "|||" & tPos',
        '    else',
        '      return "stopped|||||||||||"',
        '    end if',
        '  end tell',
        'else',
        '  return "stopped|||||||||||"',
        'end if'
    ], (err, stdout) => {
        if (err) {
            if (musicState.state !== 'stopped') {
                musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
                broadcastToOverlays('music', musicState);
            }
            return;
        }

        const parts = stdout.trim().split('|||');
        const newState = {
            state: parts[0] || 'stopped',
            track: parts[1] || '',
            artist: parts[2] || '',
            album: parts[3] || '',
            year: parts[4] || '',
            duration: parseFloat(parts[5]) || 0,
            position: parseFloat(parts[6]) || 0,
            artworkUrl: ''
        };

        if (newState.state === 'stopped') {
            if (musicState.state !== 'stopped') {
                musicState = newState;
                broadcastToOverlays('music', musicState);
            }
            return;
        }

        const trackChanged = newState.track !== musicState.track
            || newState.artist !== musicState.artist
            || newState.album !== musicState.album;
        const stateChanged = newState.state !== musicState.state;

        if (trackChanged) {
            runOsascript([
                'tell application "Music"',
                '  set artData to raw data of artwork 1 of current track',
                'end tell',
                `set fRef to open for access (POSIX file "${MUSIC_ART_PATH}") with write permission`,
                'set eof fRef to 0',
                'write artData to fRef',
                'close access fRef'
            ], (artErr) => {
                newState.artworkUrl = artErr ? '' : '/api/music/artwork?t=' + Date.now();
                musicState = newState;
                broadcastToOverlays('music', musicState);
                console.log(`[Music] Now playing: ${musicState.track} — ${musicState.artist}`);
            });
        } else if (stateChanged) {
            newState.artworkUrl = musicState.artworkUrl;
            musicState = newState;
            broadcastToOverlays('music', musicState);
            console.log(`[Music] State: ${musicState.state}`);
        } else {
            // Update position/duration silently (for progress bar)
            musicState.position = newState.position;
            musicState.duration = newState.duration;
        }
    });
}

function startMusicPolling() {
    if (musicPollTimer) return;
    const interval = (MUSIC_CONFIG.poll_seconds || 5) * 1000;
    pollAppleMusic();
    musicPollTimer = setInterval(pollAppleMusic, interval);
    console.log(`[Music] Polling Apple Music every ${MUSIC_CONFIG.poll_seconds || 5}s`);
}

function stopMusicPolling() {
    if (musicPollTimer) {
        clearInterval(musicPollTimer);
        musicPollTimer = null;
        console.log('[Music] Polling stopped');
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
    streamInfo: [],
    startedAt: new Date().toISOString(),
    lastUpdated: null,
    messageCount: 0
};

// Chat log — individual messages stored separately from aggregates
let chatLog = [];
let chatLogFlushed = 0;

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
        statsData.chatters[chatname].lastSeen = nowISO;
        if (msg.chatimg) statsData.chatters[chatname].chatimg = msg.chatimg;
    }

    // Track follow events
    if (msg.event === 'follow' || msg.event === 'new_follower') {
        if (!statsData.followers[chatname]) {
            statsData.followers[chatname] = {
                chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
            };
        }
        statsData.followers[chatname].days[today] = (statsData.followers[chatname].days[today] || 0) + 1;
        statsData.followers[chatname].lastSeen = nowISO;
    }

    // Track subscriber events using SSN's documented event names
    // membership + subtitle alone is badge info, NOT a sub event
    const STATS_SUB_EVENTS = ['new_subscriber', 'resub', 'subscription_gift', 'sponsorship', 'giftpurchase', 'giftredemption'];
    const isStatsSubEvent = STATS_SUB_EVENTS.includes(msg.event);
    if (isStatsSubEvent) {
        const isGift = msg.event === 'subscription_gift' || msg.event === 'giftpurchase' ||
            (msg.membership && msg.membership.toLowerCase().includes('gift')) || msg.contentimg;
        if (isGift) {
            if (!statsData.giftSubs[chatname]) {
                statsData.giftSubs[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.giftSubs[chatname].days[today] = (statsData.giftSubs[chatname].days[today] || 0) + 1;
            statsData.giftSubs[chatname].lastSeen = nowISO;
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
            statsData.bits[chatname].lastSeen = nowISO;
        } else {
            if (!statsData.donations[chatname]) {
                statsData.donations[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            statsData.donations[chatname].days[today] = (statsData.donations[chatname].days[today] || 0) + 1;
            statsData.donations[chatname].lastSeen = nowISO;
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
        if (config.hashtags_enabled !== false) {
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

function saveChatLog() {
    if (chatLog.length > chatLogFlushed) {
        const newEntries = chatLog.slice(chatLogFlushed);
        const lines = newEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
        fs.appendFileSync(CHAT_LOG_PATH, lines);
        chatLogFlushed = chatLog.length;
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

function localDateTimeStr(isoStr) {
    const d = new Date(isoStr || Date.now());
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}-${mi}`;
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
                // Use local time so the date matches what the streamer sees
                const sessionDateTime = localDateTimeStr(prevChat.startedAt);
                const archiveName = `chat-${sessionDateTime}.json`;
                const archivePath = path.join(SESSIONS_DIR, archiveName);

                // Skip if this session was already archived (same startedAt)
                if (fs.existsSync(archivePath)) {
                    try {
                        const existing = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
                        if (existing.startedAt === prevChat.startedAt) {
                            // Update the archive with latest data (more messages may have arrived)
                            fs.copyFileSync(chatPath, archivePath);
                            console.log(`[Session] Updated existing archive → data/sessions/${archiveName}`);
                            if (fs.existsSync(CHAT_LOG_PATH)) {
                                const logArchiveName = archiveName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                                fs.copyFileSync(CHAT_LOG_PATH, path.join(SESSIONS_DIR, logArchiveName));
                            }
                            return archiveName;
                        }
                    } catch (_) { /* corrupted file, overwrite */ }
                }
                fs.copyFileSync(chatPath, archivePath);
                console.log(`[Session] Archived → data/sessions/${archiveName}`);

                // Archive chat log alongside the session
                if (fs.existsSync(CHAT_LOG_PATH)) {
                    const logArchiveName = archiveName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                    fs.copyFileSync(CHAT_LOG_PATH, path.join(SESSIONS_DIR, logArchiveName));
                    console.log(`[Session] Chat log archived → data/sessions/${logArchiveName}`);
                }

                return archiveName;
            }
        }
    } catch (err) {
        console.warn('[Session] Could not archive:', err.message);
    }
    return null;
}

function performAutoBackup() {
    if (!config.auto_backup_on_session_end) return;
    try {
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const backupPath = path.join(BACKUPS_DIR, `backup-${stamp}.zip`);
        const zip = new AdmZip();
        const filesToBackup = [
            { src: CONFIG_PATH, dest: 'config.json' },
            { src: STATS_PATH, dest: 'data/stats.json' },
            { src: BANNED_HASHTAGS_PATH, dest: 'data/.banned-hashtags.json' },
            { src: path.join(DATA_DIR, 'subs.json'), dest: 'data/subs.json' },
            { src: path.join(DATA_DIR, 'bits.json'), dest: 'data/bits.json' },
            { src: path.join(DATA_DIR, 'followers.json'), dest: 'data/followers.json' },
            { src: HIGHLIGHTS_PATH, dest: 'data/highlights.jsonl' }
        ];
        for (const f of filesToBackup) {
            if (fs.existsSync(f.src)) zip.addLocalFile(f.src, path.dirname(f.dest), path.basename(f.dest));
        }
        if (fs.existsSync(SESSIONS_DIR)) {
            zip.addLocalFolder(SESSIONS_DIR, 'data/sessions');
        }
        zip.writeZip(backupPath);
        console.log(`[Backup] Auto-backup saved → ${backupPath}`);

        // Keep only last 10 auto-backups
        const backups = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
            .sort();
        while (backups.length > 10) {
            const oldest = backups.shift();
            fs.unlinkSync(path.join(BACKUPS_DIR, oldest));
            console.log(`[Backup] Removed old backup: ${oldest}`);
        }
    } catch (err) {
        console.warn(`[Backup] Auto-backup failed: ${err.message}`);
    }
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
    chatData.streamInfo = [];
    chatData.messageCount = 0;
    chatData.startedAt = new Date().toISOString();
    chatData.lastUpdated = null;
    chatLog = [];
    chatLogFlushed = 0;
    try { if (fs.existsSync(CHAT_LOG_PATH)) fs.unlinkSync(CHAT_LOG_PATH); } catch {}
    saveChatData();
}

function processChatMessage(msg) {
    if (msg.bot === true) return;
    const chatname = msg.chatname;
    if (!chatname) return;

    // Normalize SSN field names (eventType → event)
    if (msg.eventType && !msg.event) msg.event = msg.eventType;

    // Banned users are completely excluded from everything
    if (BANNED_USERS.includes(chatname.toLowerCase())) return;

    // Append to chat log BEFORE stats exclusion (captures all non-banned users)
    if (config.chat_log_enabled !== false) {
        const plainText = msg.chatmessage ? msg.chatmessage.replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '') : '';
        const urls = (plainText.match(/https?:\/\/[^\s<>"')\]]+/gi) || []);
        chatLog.push({
            ts: Date.now(),
            user: chatname,
            avatar: msg.chatimg || null,
            message: plainText.trim(),
            messageHtml: msg.chatmessage || '',
            type: msg.type || null,
            event: msg.event || null,
            donation: msg.hasDonation || null,
            membership: msg.membership || null,
            urls: urls.length > 0 ? urls : undefined
        });

        // Extract and cache emotes from messageHtml
        if (msg.chatmessage) {
            const imgRegex = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>|<img[^>]+alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/gi;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(msg.chatmessage)) !== null) {
                const src = imgMatch[1] || imgMatch[4];
                const alt = imgMatch[2] || imgMatch[3];
                if (src && alt && !emoteCache.has(alt)) {
                    cacheEmote(alt, src);
                }
            }
        }
    }

    // Excluded users appear in chat log but not in stats/overlay
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

    if (msg.event === 'follow' || msg.event === 'new_follower') {
        const alreadyFollowed = chatData.followers.some(f => f.chatname === chatname);
        if (!alreadyFollowed) {
            chatData.followers.push({ chatname, chatimg: msg.chatimg, timestamp: Date.now() });
            console.log(`[SSN] Follow: ${chatname}`);
            fireWebhook('follow', { user: chatname, message: `${chatname} followed!` });
        }
    }

    // Log any event or membership data from SSN for debugging
    if (msg.membership || msg.event || msg.hasDonation || msg.title || msg.subtitle || msg.contentimg) {
        const debugEntry = {
            ts: new Date().toISOString(),
            chatname,
            event: msg.event, membership: msg.membership, hasDonation: msg.hasDonation,
            title: msg.title, subtitle: msg.subtitle, type: msg.type,
            contentimg: msg.contentimg ? '(present)' : undefined,
            chatmessage: (msg.chatmessage || '').substring(0, 100)
        };
        console.log(`[SSN] Event data from ${chatname}:`, JSON.stringify(debugEntry));
        try {
            fs.appendFileSync(path.join(DATA_DIR, 'ssn-debug.log'), JSON.stringify(debugEntry) + '\n');
        } catch (_) {}
    }

    // Track sub events using SSN's documented event names
    // Twitch WS: new_subscriber, resub, subscription_gift
    // YouTube: sponsorship, giftpurchase, giftredemption
    // Kick WS: new_subscriber, resub, subscription_gift
    // IMPORTANT: membership + subtitle alone is just badge info on regular chat (e.g. "Subscriber" + "48-Months")
    const SUB_EVENTS = ['new_subscriber', 'resub', 'subscription_gift', 'sponsorship', 'giftpurchase', 'giftredemption'];
    const isSubEvent = SUB_EVENTS.includes(msg.event);
    if (isSubEvent) {
        const alreadySubbed = chatData.subscribers.some(s => s.chatname === chatname);
        if (!alreadySubbed) {
            const isGift = msg.event === 'subscription_gift' || msg.event === 'giftpurchase' ||
                (msg.membership && msg.membership.toLowerCase().includes('gift')) || msg.contentimg;
            if (isGift) {
                chatData.giftSubs.push({ chatname, chatimg: msg.chatimg, event: msg.event || null });
                console.log(`[SSN] Gift Sub: ${chatname} (event=${msg.event})`);
                fireWebhook('subscribe', { user: chatname, type: 'gift', message: `${chatname} gifted a sub!` });
            } else {
                chatData.subscribers.push({ chatname, membership: msg.membership || null, subtitle: msg.subtitle || null, chatimg: msg.chatimg, event: msg.event || null });
                console.log(`[SSN] Sub: ${chatname} - ${msg.membership || msg.event}${msg.subtitle ? ' (' + msg.subtitle + ')' : ''}`);
                fireWebhook('subscribe', { user: chatname, tier: msg.membership, detail: msg.subtitle, message: `${chatname} subscribed! (${msg.membership || msg.event})` });
            }
        }
    }

    if (msg.hasDonation) {
        const donation = { chatname, amount: msg.hasDonation, chatimg: msg.chatimg };
        if (msg.hasDonation.toLowerCase().includes('bit')) {
            chatData.bits.push(donation);
            console.log(`[SSN] Bits: ${chatname} - ${msg.hasDonation}`);
            fireWebhook('bits', { user: chatname, amount: msg.hasDonation, message: `${chatname} cheered ${msg.hasDonation}` });
        } else {
            chatData.donations.push(donation);
            console.log(`[SSN] Donation: ${chatname} - ${msg.hasDonation}`);
            fireWebhook('donation', { user: chatname, amount: msg.hasDonation, message: `${chatname} donated ${msg.hasDonation}` });
        }
    }

    // Track raids
    if (msg.event === 'raid') {
        const alreadyRaided = chatData.raids.some(r => r.chatname === chatname);
        if (!alreadyRaided) {
            const viewers = msg.chatmessage ? (msg.chatmessage.match(/(\d+)/) || [])[1] : null;
            chatData.raids.push({ chatname, chatimg: msg.chatimg, viewers: viewers ? parseInt(viewers) : null, timestamp: Date.now() });
            console.log(`[SSN] Raid: ${chatname}${viewers ? ` with ${viewers} viewers` : ''}`);
            fireWebhook('raid', { user: chatname, viewers: viewers || '?', message: `${chatname} raided${viewers ? ` with ${viewers} viewers` : ''}!` });
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
        if (config.hashtags_enabled !== false) {
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
        saveChatLog();
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
        return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessage = (m) => {
        let badges = '';
        if (m.membership) badges += `<span class="badge">${escHtml(m.membership)}</span>`;
        if (m.event) badges += `<span class="badge">${escHtml(m.event)}</span>`;
        if (m.donation) badges += `<span class="badge">${escHtml(m.donation)}</span>`;

        let display = m.messageHtml ? sanitizeMsg(m.messageHtml) : escHtml(m.message);

        const plainMsg = m.message || '';
        const replyMatch = plainMsg.match(/^(.+?):\s\s@(\S+)\s(.+)$/s);
        let replyHtml = '';
        if (replyMatch) {
            replyHtml = `<div class="reply-quote">↩ ${escHtml(replyMatch[1].substring(0, 100))}${replyMatch[1].length > 100 ? '...' : ''}</div>`;
            display = m.messageHtml ? sanitizeMsg(m.messageHtml) : escHtml(replyMatch[3]);
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
    .reply-quote { font-size: 8px; color: #888; border-left: 2px solid #ccc; padding-left: 6px; margin: 2px 0; }
</style></head><body>
    <h1>${escHtml(title)}</h1>
    <div class="subtitle">${escHtml(subtitle)}</div>
    ${messages.map(renderMessage).join('\n')}
</body></html>`;
}

async function generatePdf(htmlContent) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
        const pdf = await page.pdf({ format: 'A4', margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' }, printBackground: true });
        return pdf;
    } finally {
        await browser.close();
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Rate limiting
    if (checkRateLimit(req, res)) return;

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
                fetchStreamInfo();
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
                    const safeFields = ['days_filter', 'active_subs_only', 'exclude_users', 'banned_users', 'hashtags_enabled', 'chat_log_enabled', 'credits', 'auto_backup_on_session_end', 'webhooks', 'rate_limit', 'theme', 'music'];
                    for (const key of safeFields) {
                        if (updates[key] !== undefined) {
                            current[key] = updates[key];
                        }
                    }

                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));

                    // Hot-reload config vars
                    config.credits = current.credits;
                    config.days_filter = current.days_filter;

                    config.active_subs_only = current.active_subs_only;
                    config.exclude_users = current.exclude_users;
                    config.banned_users = current.banned_users;
                    EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
                    BANNED_USERS = (config.banned_users || []).map(u => u.toLowerCase());
                    config.hashtags_enabled = current.hashtags_enabled;
                    config.chat_log_enabled = current.chat_log_enabled;
                    config.auto_backup_on_session_end = current.auto_backup_on_session_end;
                    config.webhooks = current.webhooks;
                    config.rate_limit = current.rate_limit;
                    config.theme = current.theme;

                    // Hot-reload music config
                    const prevMusicEnabled = MUSIC_CONFIG.enabled;
                    Object.assign(MUSIC_CONFIG, current.music || {});
                    if (MUSIC_CONFIG.enabled && !prevMusicEnabled) {
                        startMusicPolling();
                    } else if (!MUSIC_CONFIG.enabled && prevMusicEnabled) {
                        stopMusicPolling();
                        musicState = { track: '', artist: '', album: '', state: 'stopped', artworkUrl: '' };
                        broadcastToOverlays('music', musicState);
                    }

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

            active_subs_only: config.active_subs_only || false,
            hashtags_enabled: config.hashtags_enabled !== false,
            chat_log_enabled: config.chat_log_enabled !== false,
            broadcaster_name: BROADCASTER_NAME,
            exclude_users: config.exclude_users || [],
            banned_users: config.banned_users || [],
            days_filter: config.days_filter || 30,
            credits: config.credits || {},
            auto_backup_on_session_end: config.auto_backup_on_session_end || false,
            webhooks: config.webhooks || { enabled: false, discord_url: '', events: ['raid', 'subscribe', 'donation', 'bits', 'follow'], batch_seconds: 5 },
            rate_limit: config.rate_limit || { enabled: false, requests_per_minute: 120, mutation_per_minute: 30 },
            theme: config.theme || {},
            music: config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 }
        }));
        return;
    }

    if (pathname === '/api/fetch') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'fetching' }));
        fetchTwitchData();
        fetchStreamInfo();
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
            hourlyMessages: chatData.hourlyMessages,
            streamInfo: chatData.streamInfo
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
        saveChatLog();
        const archiveName = archiveSession();
        performAutoBackup();
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
        // Re-fetch Twitch data and stream info for the new session
        if (twitchAccessToken && BROADCASTER_ID) {
            fetchTwitchData();
            fetchStreamInfo();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', startedAt: chatData.startedAt, message: 'New session started.' }));
        console.log('[API] New session started');
        return;
    }

    if (pathname === '/api/shutdown') {
        saveChatData();
        saveStats();
        saveChatLog();
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
                .filter(f => f.startsWith('chat-') && f.endsWith('.json'))
                .sort()
                .reverse();

            const params = new URL(req.url, 'http://localhost').searchParams;
            if (params.get('detail') === '1') {
                const detailed = files.map(f => {
                    const entry = { file: f };
                    try {
                        const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8');
                        const d = JSON.parse(raw);
                        if (d.streamInfo && d.streamInfo.length > 0) {
                            entry.title = d.streamInfo[0].title;
                            entry.category = d.streamInfo[0].category;
                        }
                        entry.messageCount = d.messageCount || 0;
                    } catch {}
                    return entry;
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(detailed));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(files));
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Music now-playing API
    if (pathname === '/api/music/now-playing') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(musicState));
        return;
    }

    if (pathname === '/api/music/artwork') {
        try {
            if (fs.existsSync(MUSIC_ART_PATH)) {
                const art = fs.readFileSync(MUSIC_ART_PATH);
                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'no-cache',
                    'Content-Length': art.length
                });
                res.end(art);
            } else {
                res.writeHead(404);
                res.end('No artwork');
            }
        } catch {
            res.writeHead(500);
            res.end('Artwork read error');
        }
        return;
    }

    if (pathname === '/api/music/fallback-art') {
        if (req.method === 'GET' || req.method === 'HEAD') {
            if (fs.existsSync(MUSIC_FALLBACK_ART_PATH)) {
                const art = fs.readFileSync(MUSIC_FALLBACK_ART_PATH);
                res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache', 'Content-Length': art.length });
                res.end(req.method === 'HEAD' ? undefined : art);
            } else {
                res.writeHead(404);
                res.end(req.method === 'HEAD' ? undefined : 'No fallback art');
            }
            return;
        }
        if (req.method === 'POST') {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const buf = Buffer.concat(chunks);
                if (buf.length > 2 * 1024 * 1024) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'File too large (max 2MB)' }));
                    return;
                }
                fs.writeFileSync(MUSIC_FALLBACK_ART_PATH, buf);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            });
            return;
        }
        if (req.method === 'DELETE') {
            if (fs.existsSync(MUSIC_FALLBACK_ART_PATH)) fs.unlinkSync(MUSIC_FALLBACK_ART_PATH);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
    }

    if (pathname === '/api/categories') {
        try {
            const params = new URL(req.url, 'http://localhost').searchParams;
            const from = params.get('from') || '';
            const to = params.get('to') || '';

            const allSessions = [];

            // Current session
            if (chatData.streamInfo && chatData.streamInfo.length > 0) {
                allSessions.push({
                    startedAt: chatData.startedAt,
                    endedAt: null,
                    streamInfo: chatData.streamInfo,
                    messageCount: chatData.messageCount
                });
            }

            // Archived sessions
            if (fs.existsSync(SESSIONS_DIR)) {
                const files = fs.readdirSync(SESSIONS_DIR)
                    .filter(f => f.startsWith('chat-') && f.endsWith('.json'))
                    .sort();
                for (const file of files) {
                    try {
                        const d = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
                        if (d.streamInfo && d.streamInfo.length > 0) {
                            allSessions.push({
                                startedAt: d.startedAt,
                                endedAt: d.lastUpdated || d.startedAt,
                                streamInfo: d.streamInfo,
                                messageCount: d.messageCount || 0
                            });
                        }
                    } catch {}
                }
            }

            // Aggregate: category → { totalMinutes, sessions: [{ date, title, category, minutes }] }
            const categories = {};
            for (const sess of allSessions) {
                const sessDate = (sess.startedAt || '').substring(0, 10);
                if (from && sessDate < from) continue;
                if (to && sessDate > to) continue;

                const info = sess.streamInfo;
                const sessionEnd = sess.endedAt ? new Date(sess.endedAt) : new Date();

                for (let i = 0; i < info.length; i++) {
                    const entry = info[i];
                    const cat = entry.category || '(No Category)';
                    const start = new Date(entry.changedAt);
                    const end = i + 1 < info.length ? new Date(info[i + 1].changedAt) : sessionEnd;
                    const minutes = Math.max(0, (end - start) / 60000);

                    if (!categories[cat]) categories[cat] = { totalMinutes: 0, sessions: [] };
                    categories[cat].totalMinutes += minutes;
                    categories[cat].sessions.push({
                        date: sessDate,
                        title: entry.title,
                        minutes: Math.round(minutes)
                    });
                }
            }

            // Sort by total time descending
            const sorted = Object.entries(categories)
                .map(([name, data]) => ({ name, totalMinutes: Math.round(data.totalMinutes), sessions: data.sessions }))
                .sort((a, b) => b.totalMinutes - a.totalMinutes);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(sorted));
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

    // Chat log for a specific session (must be before session file handler)
    const chatLogMatch = pathname.match(/^\/api\/sessions\/(.+\.json)\/chat-log$/);
    if (chatLogMatch) {
        const sessionName = chatLogMatch[1];
        const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
        const logFile = path.join(SESSIONS_DIR, logName);
        if (!logFile.startsWith(SESSIONS_DIR)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
        }
        const messages = readChatLogFile(logFile);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ session: sessionName, count: messages.length, messages }));
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

    // Current session data (live)
    if (pathname === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(chatData));
        return;
    }

    // Current session chat log
    if (pathname === '/api/chat-log') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ session: 'current', count: chatLog.length, messages: chatLog }));
        return;
    }

    // Cross-session chat log search
    if (pathname === '/api/chat-log/search') {
        const params = new URL(req.url, `http://localhost`).searchParams;
        const rawQuery = (params.get('q') || '').trim();
        let user = (params.get('user') || '').toLowerCase();
        const session = params.get('session') || 'all';
        const type = params.get('type') || '';
        const limit = parseInt(params.get('limit')) || 200;
        const offset = parseInt(params.get('offset')) || 0;

        // Parse query: extract user:xxx and from:xxx filters, support quoted phrases and AND/OR
        let queryText = rawQuery;
        const userFilterMatch = queryText.match(/(?:user|from):(\S+)/i);
        if (userFilterMatch) {
            user = userFilterMatch[1].toLowerCase();
            queryText = queryText.replace(userFilterMatch[0], '').trim();
        }

        // Parse remaining text into search terms with AND/OR logic
        // "quoted phrase" stays together, OR separates alternatives, everything else is AND
        function parseSearchTerms(q) {
            if (!q) return null;
            // Split by OR (case-insensitive)
            const orGroups = q.split(/\bOR\b/i).map(g => g.trim()).filter(Boolean);
            return orGroups.map(group => {
                const terms = [];
                const quoted = /(?:"([^"]+)"|(\S+))/g;
                let m;
                while ((m = quoted.exec(group)) !== null) {
                    const term = (m[1] || m[2]).toLowerCase();
                    if (term !== 'and') terms.push(term);
                }
                return terms;
            });
        }

        const searchFilter = parseSearchTerms(queryText);
        // searchFilter: array of OR-groups, each group is array of AND-terms
        // e.g. 'pizza AND cheese OR tacos' → [['pizza','cheese'], ['tacos']]

        function matchesSearch(text) {
            if (!searchFilter) return true;
            const lower = text.toLowerCase();
            // Match if ANY or-group has ALL its and-terms present
            return searchFilter.some(andTerms =>
                andTerms.every(term => lower.includes(term))
            );
        }

        let allResults = [];

        // Helper to search messages from a session
        function searchMessages(messages, sessionName) {
            return messages.filter(m => {
                if (user && m.user.toLowerCase() !== user) return false;
                if (!matchesSearch(m.message)) return false;
                if (type === 'links') {
                    if (!((m.urls && m.urls.length > 0) || (m.message && m.message.match(/https?:\/\//))))
                        return false;
                }
                if (type === 'events') {
                    if (!m.event) return false;
                }
                if (type === 'donations') {
                    if (!m.donation) return false;
                }
                return true;
            }).map(m => ({ ...m, session: sessionName }));
        }

        if (session === 'all' || session === 'current') {
            allResults.push(...searchMessages(chatLog, 'current'));
        }

        if (session === 'all') {
            // Search all archived sessions
            if (fs.existsSync(SESSIONS_DIR)) {
                const logFiles = fs.readdirSync(SESSIONS_DIR)
                    .filter(f => f.startsWith('chatlog-') && f.endsWith('.jsonl'))
                    .sort()
                    .reverse();
                for (const logFile of logFiles) {
                    const messages = readChatLogFile(path.join(SESSIONS_DIR, logFile));
                    const sessionName = logFile.replace('chatlog-', 'chat-').replace('.jsonl', '.json');
                    allResults.push(...searchMessages(messages, sessionName));
                }
            }
        } else if (session !== 'current') {
            // Search a specific archived session
            const logName = session.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const logFile = path.join(SESSIONS_DIR, logName);
            if (logFile.startsWith(SESSIONS_DIR) && fs.existsSync(logFile)) {
                const messages = readChatLogFile(logFile);
                allResults.push(...searchMessages(messages, session));
            }
        }

        // Sort by timestamp descending (most recent first)
        allResults.sort((a, b) => b.ts - a.ts);

        const total = allResults.length;
        const paged = allResults.slice(offset, offset + limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total, offset, limit, count: paged.length, results: paged }));
        return;
    }

    // Chat log export (TSV, TXT, PDF)
    if (pathname === '/api/chat-log/export') {
        const params = new URL(req.url, `http://localhost`).searchParams;
        const format = params.get('format') || 'tsv';
        const session = params.get('session') || 'current';
        const rawQuery = (params.get('q') || '').trim();
        const typeFilter = params.get('type') || '';
        const userFilter = (params.get('user') || '').toLowerCase();

        // Load messages and stream info
        let messages = [];
        let sessionLabel = session;
        let streamInfo = [];
        if (session === 'all') {
            // Global search export: current + all archived sessions
            messages = [...chatLog];
            sessionLabel = 'all-sessions';
            streamInfo = chatData.streamInfo || [];
            if (fs.existsSync(SESSIONS_DIR)) {
                const logFiles = fs.readdirSync(SESSIONS_DIR)
                    .filter(f => f.startsWith('chatlog-') && f.endsWith('.jsonl'))
                    .sort();
                for (const logFile of logFiles) {
                    messages.push(...readChatLogFile(path.join(SESSIONS_DIR, logFile)));
                }
            }
        } else if (session === 'current') {
            messages = chatLog;
            sessionLabel = 'current-session';
            streamInfo = chatData.streamInfo || [];
        } else {
            const logName = session.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const logFile = path.join(SESSIONS_DIR, logName);
            if (logFile.startsWith(SESSIONS_DIR) && fs.existsSync(logFile)) {
                messages = readChatLogFile(logFile);
            }
            // Load stream info from session JSON
            const sessionFile = path.join(SESSIONS_DIR, session);
            if (sessionFile.startsWith(SESSIONS_DIR) && fs.existsSync(sessionFile)) {
                try {
                    const sData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                    streamInfo = sData.streamInfo || [];
                } catch {}
            }
        }

        // Apply filters (matching the client-side logic)
        if (userFilter) {
            messages = messages.filter(m => (m.user || '').toLowerCase() === userFilter);
        }
        if (typeFilter === 'links') {
            messages = messages.filter(m =>
                (m.urls && m.urls.length > 0) || (m.message && /https?:\/\//.test(m.message))
            );
        } else if (typeFilter === 'events') {
            messages = messages.filter(m => m.event);
        } else if (typeFilter === 'donations') {
            messages = messages.filter(m => m.donation);
        }
        if (rawQuery) {
            const lower = rawQuery.toLowerCase();
            messages = messages.filter(m =>
                (m.message || '').toLowerCase().includes(lower) || (m.user || '').toLowerCase().includes(lower)
            );
        }

        const formatTime = (ts) => {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleString();
        };

        // Build a clean "Chat Log - Mar 24 2026 - 1-15 PM" label and filename
        let friendlyLabel = sessionLabel;
        const dateMatch = sessionLabel.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
        if (dateMatch) {
            const d = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:00`);
            friendlyLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                + ' - ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } else if (sessionLabel === 'current-session') {
            friendlyLabel = 'Current Session';
        }
        const cleanFilename = `Chat Log - ${friendlyLabel}`.replace(/[^a-zA-Z0-9 _-]/g, '');

        // Build stream info header for exports
        const streamInfoText = streamInfo.length > 0
            ? streamInfo.map((si, i) => {
                const time = new Date(si.changedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const prefix = i === 0 ? 'Stream' : time;
                return `${prefix}: ${si.title}${si.category ? ` [${si.category}]` : ''}`;
            }).join('\n')
            : '';

        if (format === 'tsv') {
            let preamble = '';
            if (streamInfoText) {
                preamble = streamInfo.map((si, i) => {
                    const time = new Date(si.changedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    const prefix = i === 0 ? 'Stream' : time;
                    return `# ${prefix}: ${si.title}${si.category ? ` [${si.category}]` : ''}`;
                }).join('\n') + '\n';
            }
            const header = 'Timestamp\tUser\tMessage\tEvent\tDonation\tMembership';
            const rows = messages.map(m =>
                `${formatTime(m.ts)}\t${m.user}\t${m.message.replace(/\t/g, ' ')}\t${m.event || ''}\t${m.donation || ''}\t${m.membership || ''}`
            );
            const content = preamble + header + '\n' + rows.join('\n');
            res.writeHead(200, {
                'Content-Type': 'text/tab-separated-values',
                'Content-Disposition': `attachment; filename="${cleanFilename}.tsv"`
            });
            res.end(content);
            return;
        }

        if (format === 'txt') {
            const lines = messages.map(m => {
                let line = `[${formatTime(m.ts)}] ${m.user}: ${m.message}`;
                if (m.event) line += ` [${m.event}]`;
                if (m.donation) line += ` [${m.donation}]`;
                return line;
            });
            const header = `Chat Log — ${friendlyLabel}\n${'='.repeat(40)}`;
            const infoBlock = streamInfoText ? `\n${streamInfoText}\n` : '';
            const content = `${header}${infoBlock}\n${messages.length} messages\n\n` + lines.join('\n');
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Disposition': `attachment; filename="${cleanFilename}.txt"`
            });
            res.end(content);
            return;
        }

        if (format === 'pdf') {
            try {
                const subtitle = streamInfoText
                    ? streamInfoText.replace(/\n/g, ' • ') + ` — ${messages.length} messages`
                    : `${messages.length} messages`;
                const htmlContent = buildChatPdfHtml(`Chat Log — ${friendlyLabel}`, subtitle, messages);
                const pdfBuffer = await generatePdf(htmlContent);
                res.writeHead(200, {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${cleanFilename}.pdf"`,
                    'Content-Length': pdfBuffer.length
                });
                res.end(pdfBuffer);
            } catch (err) {
                console.error('[PDF] Export failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'PDF generation failed: ' + err.message }));
            }
            return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid format. Use: tsv, txt, or pdf' }));
        return;
    }

    // ========================================================================
    // BACKUP / RESTORE
    // ========================================================================

    // List auto-backups
    if (pathname === '/api/backups' && req.method === 'GET') {
        try {
            if (!fs.existsSync(BACKUPS_DIR)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ backups: [] }));
                return;
            }
            const files = fs.readdirSync(BACKUPS_DIR)
                .filter(f => f.endsWith('.zip'))
                .sort().reverse();
            const backups = files.map(f => {
                const stat = fs.statSync(path.join(BACKUPS_DIR, f));
                return { name: f, size: stat.size, created: stat.mtime.toISOString() };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ backups }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Download a specific auto-backup
    if (pathname.startsWith('/api/backups/') && req.method === 'GET') {
        const filename = decodeURIComponent(pathname.slice('/api/backups/'.length));
        if (!filename || filename.includes('..') || filename.includes('/')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid filename' }));
            return;
        }
        const filePath = path.join(BACKUPS_DIR, filename);
        if (!filePath.startsWith(BACKUPS_DIR) || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Backup not found' }));
            return;
        }
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': stat.size
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    if (pathname === '/api/backup' && req.method === 'GET') {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const filename = `streampulse-backup-${dateStr}.zip`;

        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`
        });

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        const filesToBackup = [
            { src: CONFIG_PATH, name: 'config.json' },
            { src: STATS_PATH, name: 'data/stats.json' },
            { src: BANNED_HASHTAGS_PATH, name: 'data/.banned-hashtags.json' },
            { src: path.join(DATA_DIR, 'subs.json'), name: 'data/subs.json' },
            { src: path.join(DATA_DIR, 'bits.json'), name: 'data/bits.json' },
            { src: path.join(DATA_DIR, 'followers.json'), name: 'data/followers.json' },
            { src: HIGHLIGHTS_PATH, name: 'data/highlights.jsonl' }
        ];

        for (const f of filesToBackup) {
            if (fs.existsSync(f.src)) {
                archive.file(f.src, { name: f.name });
            }
        }

        if (fs.existsSync(SESSIONS_DIR)) {
            archive.directory(SESSIONS_DIR, 'data/sessions');
        }

        archive.finalize();
        return;
    }

    if (pathname === '/api/restore' && req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const zip = new AdmZip(buffer);
                const entries = zip.getEntries();

                // Validate: must have at least stats.json
                const hasStats = entries.some(e => e.entryName === 'data/stats.json' || e.entryName === 'stats.json');
                if (!hasStats) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid backup: missing stats.json' }));
                    return;
                }

                let restored = [];
                for (const entry of entries) {
                    if (entry.isDirectory) continue;
                    const name = entry.entryName;
                    let destPath;

                    if (name === 'config.json') {
                        destPath = CONFIG_PATH;
                    } else if (name.startsWith('data/')) {
                        destPath = path.join(__dirname, name);
                    } else {
                        continue;
                    }

                    // Security check
                    if (!destPath.startsWith(__dirname)) continue;

                    const dir = path.dirname(destPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(destPath, entry.getData());
                    restored.push(name);
                }

                // Reload in-memory data
                try {
                    if (fs.existsSync(STATS_PATH)) {
                        statsData = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
                        console.log('[Restore] Reloaded stats data');
                    }
                } catch (err) { console.warn('[Restore] Stats reload failed:', err.message); }

                try {
                    if (fs.existsSync(BANNED_HASHTAGS_PATH)) {
                        bannedHashtags = new Set(JSON.parse(fs.readFileSync(BANNED_HASHTAGS_PATH, 'utf8')));
                        console.log('[Restore] Reloaded banned hashtags');
                    }
                } catch { /* ignore */ }

                try {
                    if (fs.existsSync(CONFIG_PATH)) {
                        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                        console.log('[Restore] Reloaded config');
                    }
                } catch { /* ignore */ }

                loadHighlights();

                console.log(`[Restore] Restored ${restored.length} files`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'restored', files: restored.length, restored }));
            } catch (err) {
                console.error('[Restore] Error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Restore failed: ${err.message}` }));
            }
        });
        return;
    }

    // ========================================================================
    // HIGHLIGHTS EXPORT
    // ========================================================================

    if (pathname === '/api/highlights/pin-last' && req.method === 'POST') {
        if (chatLog.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No chat messages yet' }));
            return;
        }
        const last = chatLog[chatLog.length - 1];
        const already = highlights.some(h => h.ts === last.ts && h.user === last.user);
        if (already) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'already_pinned', user: last.user, message: last.message }));
            return;
        }
        const sessionName = 'chat-' + localDateTimeStr(chatData.startedAt) + '.json';
        highlights.push({ ts: last.ts, user: last.user, message: last.message || '', messageHtml: last.messageHtml || '', avatar: last.avatar || null, session: sessionName, pinnedAt: Date.now() });
        saveHighlights();
        console.log(`[Highlights] Pinned last message from ${last.user}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'pinned', user: last.user, message: last.message }));
        return;
    }

    if (pathname === '/api/highlights/export' && req.method === 'GET') {
        const format = url.searchParams.get('format');
        const sessionFilter = url.searchParams.get('session');
        const userFilter = (url.searchParams.get('user') || '').toLowerCase();
        const rawQuery = (url.searchParams.get('q') || '').trim().toLowerCase();
        let data = highlights;
        if (sessionFilter) {
            data = data.filter(h => h.session === sessionFilter);
        }
        if (userFilter) {
            data = data.filter(h => (h.user || '').toLowerCase() === userFilter);
        }
        if (rawQuery) {
            data = data.filter(h =>
                (h.user || '').toLowerCase().includes(rawQuery) ||
                (h.message || '').toLowerCase().includes(rawQuery)
            );
        }

        const formatTime = (ts) => {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleString();
        };

        const safeFilename = sessionFilter
            ? 'highlights-' + sessionFilter.replace(/[^a-zA-Z0-9_-]/g, '_')
            : 'highlights';

        if (format === 'tsv') {
            const header = 'Timestamp\tUser\tMessage\tSession\tPinned At';
            const rows = data.map(h =>
                `${formatTime(h.ts)}\t${h.user}\t${(h.message || '').replace(/\t/g, ' ')}\t${h.session || ''}\t${formatTime(h.pinnedAt)}`
            );
            const content = header + '\n' + rows.join('\n');
            res.writeHead(200, {
                'Content-Type': 'text/tab-separated-values',
                'Content-Disposition': `attachment; filename="${safeFilename}.tsv"`
            });
            res.end(content);
            return;
        }

        if (format === 'txt') {
            const groups = {};
            data.forEach(h => {
                const s = h.session || 'unknown';
                if (!groups[s]) groups[s] = [];
                groups[s].push(h);
            });

            let content = 'Highlights Export\n=================\n';
            for (const [session, items] of Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))) {
                content += `\n--- Session: ${session} ---\n\n`;
                for (const h of items) {
                    const time = formatTime(h.ts);
                    const timeStr = time ? time.split(', ').pop() || time : '';
                    content += `[${timeStr}] ${h.user}: ${h.message || ''}\n`;
                }
            }
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Disposition': `attachment; filename="${safeFilename}.txt"`
            });
            res.end(content);
            return;
        }

        if (format === 'pdf') {
            const title = sessionFilter
                ? `Highlights — ${sessionFilter}`
                : 'Highlights Export';
            try {
                const htmlContent = buildChatPdfHtml(title, `${data.length} highlights`, data);
                const pdfBuffer = await generatePdf(htmlContent);
                res.writeHead(200, {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${safeFilename}.pdf"`,
                    'Content-Length': pdfBuffer.length
                });
                res.end(pdfBuffer);
            } catch (err) {
                console.error('[PDF] Highlights export failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'PDF generation failed: ' + err.message }));
            }
            return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid format. Use: tsv, txt, or pdf' }));
        return;
    }

    // ========================================================================
    // HIGHLIGHTS (Pin/Unpin)
    // ========================================================================

    if (pathname === '/api/highlights') {
        if (req.method === 'GET') {
            const sessionFilter = url.searchParams.get('session');
            let result = highlights;
            if (sessionFilter) {
                result = highlights.filter(h => h.session === sessionFilter);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { ts, user, message, messageHtml, avatar, session } = JSON.parse(body);
                    if (!ts || !user) throw new Error('Missing ts or user');
                    highlights.push({ ts, user, message: message || '', messageHtml: messageHtml || '', avatar: avatar || null, session: session || 'unknown', pinnedAt: Date.now() });
                    saveHighlights();
                    console.log(`[Highlights] Pinned message from ${user}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'pinned', count: highlights.length }));
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
                    const { ts, user } = JSON.parse(body);
                    if (!ts || !user) throw new Error('Missing ts or user');
                    const before = highlights.length;
                    highlights = highlights.filter(h => !(h.ts === ts && h.user === user));
                    saveHighlights();
                    console.log(`[Highlights] Unpinned message from ${user} (${before - highlights.length} removed)`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'unpinned', count: highlights.length }));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }
    }

    // ========================================================================
    // WEBHOOK TEST
    // ========================================================================

    if (pathname === '/api/webhook/test' && req.method === 'POST') {
        const wh = config.webhooks;
        if (!wh || !wh.enabled || !wh.discord_url) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Webhooks not enabled or no Discord URL configured' }));
            return;
        }
        const payload = JSON.stringify({
            embeds: [{
                title: '🧪 Test Webhook',
                description: 'StreamPulse webhook is working!',
                color: 0x58a6ff,
                fields: [
                    { name: 'Server', value: `http://localhost:${PORT}`, inline: true },
                    { name: 'Events', value: (wh.events || []).join(', ') || 'all', inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        });
        try {
            const urlObj = new URL(wh.discord_url);
            const reqLib = urlObj.protocol === 'https:' ? https : http;
            const whReq = reqLib.request(urlObj, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            }, (whRes) => {
                let data = '';
                whRes.on('data', chunk => data += chunk);
                whRes.on('end', () => {
                    if (whRes.statusCode < 300) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'sent', discord_status: whRes.statusCode }));
                    } else {
                        res.writeHead(502, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Discord returned ${whRes.statusCode}`, body: data.substring(0, 200) }));
                    }
                });
            });
            whReq.on('error', (err) => {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            });
            whReq.write(payload);
            whReq.end();
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
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
console.log('  StreamPulse Server');
console.log('============================================');

// WebSocket server for live overlay push
const overlayWss = new WebSocket.Server({ server });
const overlayClients = new Set();

overlayWss.on('connection', (ws) => {
    overlayClients.add(ws);
    console.log(`[WS] Overlay client connected (${overlayClients.size} total)`);

    // Send current data snapshot immediately
    ws.send(JSON.stringify({ type: 'snapshot', data: chatData }));

    // Send current music state if music is enabled
    if (MUSIC_CONFIG.enabled && musicState.state !== 'stopped') {
        ws.send(JSON.stringify({ type: 'music', data: musicState }));
    }

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
    console.log(`  Hashtags:  http://localhost:${PORT}/hashtags.html`);
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
        fetchStreamInfo();
    } else if (TWITCH_CLIENT_ID) {
        const authUrl = `http://localhost:${PORT}/auth/twitch`;
        console.log(`[Twitch] No token found — opening browser to authorize...`);
        openBrowser(authUrl);
    }

    // Auto-refresh Twitch data and stream info
    if (REFRESH_MINUTES > 0) {
        setInterval(() => {
            fetchTwitchData();
            fetchStreamInfo();
        }, REFRESH_MINUTES * 60 * 1000);
        console.log(`[Twitch] Auto-refresh every ${REFRESH_MINUTES} minutes`);
    }

    // Save chat/stats/log to disk every 5 seconds
    setInterval(() => {
        saveChatData();
        saveStats();
        saveChatLog();
    }, 5000);

    // Start music polling if enabled
    if (MUSIC_CONFIG.enabled) {
        startMusicPolling();
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    saveChatData();
    saveStats();
    saveChatLog();
    if (ssnSocket) ssnSocket.close();
    server.close();
    console.log('[Server] Data saved. Goodbye!');
    process.exit(0);
});
