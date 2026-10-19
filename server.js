#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const WebSocket = require('ws');
const AdmZip = require('adm-zip');
const { createGamePlanService, DEFAULT_TIERS, normalizeGamePlan, gameKey, sanitizeOverlayId } = require('./server/services/game-plan');
const { createAlertEngine, TRIGGERS: ALERT_TRIGGERS, ANIM_IN: ALERT_ANIM_IN, ANIM_OUT: ALERT_ANIM_OUT } = require('./server/services/alerts');
const { createStaticRouter } = require('./server/static-router');
const { createWeatherService, normalizeWeatherConfig } = require('./server/services/weather');
const { createMusicService } = require('./server/services/music');
const { createTimerService, DEFAULT_TIMER_SETTINGS, TIMER_EVENT_TYPES, formatTimerClock, parseDurationMs, sanitizeTimerId, normalizeTimerSettings, normalizeTimerHttpActions, buildTimerSnapshot } = require('./server/services/timers');
const { createGoalsService, GOAL_TYPE_LABELS, GOAL_TYPES, GOAL_TRACKING_TYPES, GOAL_VIEWER_MODES, DEFAULT_COMMUNITY_WEIGHTS, DEFAULT_GOALS_CONFIG, sanitizeGoalId, normalizeGoalsConfig } = require('./server/services/goals');
const { createViewerService, clampNumber, createEmptyViewerStats, normalizeViewerTrackingConfig, normalizeViewerStats, findSSNViewerCount } = require('./server/services/viewers');
const { createTwitchService, DEFAULT_TWITCH_CLIENT_ID, DEFAULT_TWITCH_SCOPES, safeReturnPath } = require('./server/services/twitch');
const { createSessionService, normalizeLifecycleConfig, localDateTimeStr, localDateString, categoryTimeFor, categoryMinutesFor, getSessionStreamTimes, getSessionCategorySegments } = require('./server/services/session');
const {
    createSsnService,
    createEmptyChatData,
    createEmptyStatsData,
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
    MAX_IN_MEMORY_CHAT_MESSAGES
} = require('./server/services/ssn');
const { createOverlayWsServer } = require('./server/ws');
const { createTimersRoutes } = require('./server/routes/timers');
const { createGoalsRoutes } = require('./server/routes/goals');
const { createMusicRoutes } = require('./server/routes/music');
const { createWeatherRoutes } = require('./server/routes/weather');
const { createGamePlanRoutes } = require('./server/routes/game-plan');
const { createTwitchRoutes } = require('./server/routes/twitch');
const { createSessionRoutes } = require('./server/routes/session');
const { createOverlayRoutes } = require('./server/routes/overlays');
const { createOverlayService, TEXT_SOURCE_TYPES, TEXT_SOURCE_EXTS, TEXT_SOURCE_MAX_BYTES, CUSTOM_OVERLAY_ELEMENT_TYPES, assetFontFamily } = require('./server/services/overlays');
const { createClipService, normalizeClipCandidateConfig, DEFAULT_CLIP_CANDIDATE_CONFIG } = require('./server/services/clips');
const { safeWriteFileSync, escapeHtml } = require('./server/routes/helpers');
const { createCrmService } = require('./server/services/crm');
const { createCrmRoutes } = require('./server/routes/crm');
const { createSystemRoutes } = require('./server/routes/system');
const { createHighlightsRoutes } = require('./server/routes/highlights');
const { createBackupRoutes } = require('./server/routes/backup');
const execFileAsync = promisify(execFile);
const UPDATE_REPOSITORY = 'jarbochov/StreamPulse';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Node refuses to spawn .cmd files without a shell on Windows (EINVAL); the arguments here are fixed.
const runNpmCi = () => execFileAsync(NPM_COMMAND, ['ci', '--omit=dev'], { cwd: __dirname, timeout: 300000, shell: process.platform === 'win32' });
const PROCESS_STARTED_AT = new Date().toISOString();

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG_PATH = process.env.STREAMPULSE_CONFIG_PATH || path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json — copy config.example.json to config.json and fill in your credentials.');
    process.exit(1);
}

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = Number(process.env.PORT) || config.port || 3000;
const cleanConfigValue = v => { const t = String(v ?? '').trim(); return /^YOUR_/i.test(t) ? '' : t; };
let BROADCASTER_ID = cleanConfigValue(config.broadcaster_id);
let BROADCASTER_NAME = cleanConfigValue(config.broadcaster_name);
let EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
let BANNED_USERS = (config.banned_users || []).map(u => u.toLowerCase());
// Shared public Twitch app (device-code flow, no secret). Users can still supply their own client_id/client_secret.
const TWITCH_CLIENT_ID = cleanConfigValue(config.twitch?.client_id) || DEFAULT_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = cleanConfigValue(config.twitch?.client_secret);
const TWITCH_SCOPES = DEFAULT_TWITCH_SCOPES;
const TWITCH_REDIRECT_URI = config.twitch?.redirect_uri || `http://localhost:${PORT}/auth/callback`;
const SSN_SESSION_ID = config.ssn?.session_id;
const SSN_SERVER = config.ssn?.server || 'wss://io.socialstream.ninja';
const REFRESH_MINUTES = config.twitch_refresh_minutes || 10;
const STREAM_INFO_POLL_SECONDS = Math.max(10, config.twitch_stream_info_seconds || 30);
const MUSIC_CONFIG = config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 };
const VIEWER_TRACKING_CONFIG = config.viewer_tracking || { enabled: true, source: 'best_available', poll_seconds: 60, retain_samples: 720 };

const ACTIVE_SUBS_ONLY = config.active_subs_only || false; // only show subs who chatted
const DATA_DIR = process.env.STREAMPULSE_DATA_DIR || path.join(__dirname, 'data');
const isLoopbackRequest = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const overlayService = createOverlayService({
    dataDir: DATA_DIR,
    safeWriteFileSync,
    broadcastToOverlays: (type, payload) => broadcastToOverlays(type, payload),
    ALERT_TRIGGERS,
    log: console.log,
    warn: console.warn
});

const customOverlays = overlayService.getCustomOverlays();
const CUSTOM_OVERLAY_ASSETS_DIR = overlayService.customOverlayAssetsDir;
const CUSTOM_OVERLAY_HISTORY_DIR = overlayService.customOverlayHistoryDir;
const CUSTOM_OVERLAY_HISTORY_LIMIT = overlayService.customOverlayHistoryLimit;
const takeoverPages = (kind, name, ms) => overlayService.takeoverPages(kind, name, ms);
const assetReferencedIn = (text, name, family) => overlayService.assetReferencedIn(text, name, family);
const rewriteAssetReferences = (text, oldName, newName, oldFamily, newFamily) => overlayService.rewriteAssetReferences(text, oldName, newName, oldFamily, newFamily);
const normalizeCustomOverlay = (input, idOverride) => overlayService.normalizeCustomOverlay(input, idOverride);
const normalizeOverlayPresets = (list) => overlayService.normalizeOverlayPresets(list);
const saveCustomOverlays = () => overlayService.saveCustomOverlays();
const loadCustomOverlays = () => overlayService.loadCustomOverlays();
const syncOverlayPages = (overlay, previous) => overlayService.syncOverlayPages(overlay, previous);
const dropOverlayPages = (id) => overlayService.dropOverlayPages(id);
const setPageAuto = (overlay, on) => overlayService.setPageAuto(overlay, on);
const movePage = (overlay, action, params) => overlayService.movePage(overlay, action, params);
const broadcastPage = (overlay) => overlayService.broadcastPage(overlay);
const pageSnapshot = (overlay) => overlayService.pageSnapshot(overlay);
const saveAssetTags = () => overlayService.saveAssetTags();
const saveAssetCaptions = () => overlayService.saveAssetCaptions();
const setAssetTags = (name, tags) => overlayService.setAssetTags(name, tags);
const assetMatchesTags = (name, wanted, mode) => overlayService.assetMatchesTags(name, wanted, mode);
const saveOverlayPresets = () => overlayService.saveOverlayPresets();
const loadRandomizerPresets = () => overlayService.loadRandomizerPresets();
const saveRandomizerPresets = (p) => overlayService.saveRandomizerPresets(p);
const loadRandomizerButtonPresets = () => overlayService.loadRandomizerButtonPresets();
const saveRandomizerButtonPresets = (p) => overlayService.saveRandomizerButtonPresets(p);
const loadRandomizerQuotePresets = () => overlayService.loadRandomizerQuotePresets();
const saveRandomizerQuotePresets = (p) => overlayService.saveRandomizerQuotePresets(p);
const historyFile = id => path.join(CUSTOM_OVERLAY_HISTORY_DIR, `${sanitizeOverlayId(id)}.json`);
const recordOverlayRevision = (prev) => overlayService.recordOverlayRevision(prev);

const staticRouter = createStaticRouter({
    rootDir: __dirname,
    publicDir: path.join(__dirname, 'public'),
    customOverlayAssetsDir: CUSTOM_OVERLAY_ASSETS_DIR,
    isLoopbackRequest,
    getCustomOverlays: () => customOverlays
});

const variablesStore = require('./server/services/variables')({ dataDir: DATA_DIR });
const chatbot = require('./server/services/chatbot')({ dataDir: DATA_DIR, getConfig: () => config, port: Number(process.env.PORT) || Number(config.port) || 3000, variables: variablesStore, onUse: (kind, name) => takeoverPages('command', name), sessionKey: () => String(chatData.startedAt || '') });
const LIVE_CHAT_PATH = path.join(DATA_DIR, 'chat.json');
const BANNED_HASHTAGS_PATH = path.join(DATA_DIR, '.banned-hashtags.json');
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat-log.jsonl');
const HIGHLIGHTS_PATH = path.join(DATA_DIR, 'highlights.jsonl');
const CLIP_CANDIDATES_PATH = path.join(DATA_DIR, 'clip-candidates.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const EMOTE_CACHE_DIR = path.join(DATA_DIR, 'emote-cache');
const TIMERS_PATH = path.join(DATA_DIR, 'timers.json');
const CUSTOM_OVERLAYS_PATH = overlayService.customOverlaysPath;
const OVERLAY_PRESETS_PATH = overlayService.overlayPresetsPath;
const ASSET_TAGS_PATH = overlayService.assetTagsPath;
const ASSET_CAPTIONS_PATH = overlayService.assetCaptionsPath;
const RANDOMIZER_PRESETS_PATH = overlayService.randomizerPresetsPath;
const RANDOMIZER_BUTTON_PRESETS_PATH = overlayService.randomizerButtonPresetsPath;
const RANDOMIZER_QUOTE_PRESETS_PATH = overlayService.randomizerQuotePresetsPath;
const SUB_HISTORY_PATH = path.join(DATA_DIR, 'sub-history.json');
const FOLLOWER_HISTORY_PATH = path.join(DATA_DIR, 'follower-history.json');




// ============================================================================
// SSN CHAT & STATS SERVICE
// ============================================================================

const chatData = createEmptyChatData(createEmptyViewerStats);
let chatLog = [];
let pendingChatLogEntries = [];
const STATS_PATH = path.join(DATA_DIR, 'stats.json');
let statsData = createEmptyStatsData();
const wsService = createOverlayWsServer({
    getChatData: () => chatData,
    getMusicConfig: () => MUSIC_CONFIG,
    getMusicState: () => musicService.getState(),
    getViewerSummary: () => getViewerSummary(),
    buildGoalsSnapshot: () => buildGoalsSnapshot(),
    buildTimersSnapshot: () => buildTimersSnapshot(),
    getLatestPoll: () => twitchService.getLatestPoll(),
    listOverlayVisibility: () => listOverlayVisibility(),
    log: console.log
});
const broadcastToOverlays = (type, payload) => wsService.broadcastToOverlays(type, payload);
const slideshowStates = wsService.slideshowStates;
const overlayClients = wsService.overlayClients;

const ssnService = createSsnService({
    dataDir: DATA_DIR,
    liveChatPath: LIVE_CHAT_PATH,
    chatLogPath: CHAT_LOG_PATH,
    statsPath: STATS_PATH,
    bannedHashtagsPath: BANNED_HASHTAGS_PATH,
    emoteCacheDir: EMOTE_CACHE_DIR,
    safeWriteFileSync: (targetPath, data) => safeWriteFileSync(targetPath, data),
    getConfig: () => config,
    getSsnSessionId: () => SSN_SESSION_ID,
    getSsnServer: () => SSN_SERVER,
    getBannedUsers: () => BANNED_USERS,
    getExcludeUsers: () => EXCLUDE_USERS,
    getChatData: () => chatData,
    getStatsData: () => statsData,
    getChatLog: () => chatLog,
    setChatLog: (val) => { chatLog = val; },
    getPendingChatLog: () => pendingChatLogEntries,
    setPendingChatLog: (val) => { pendingChatLogEntries = val; },
    getBannedHashtags: () => bannedHashtags,
    normalizeViewerStats: (v) => normalizeViewerStats(v),
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data),
    buildGoalsSnapshot: () => buildGoalsSnapshot(),
    processSSNViewerUpdate: (msg) => processSSNViewerUpdate(msg),
    chatbot: () => chatbot,
    alertEngine: () => alertEngine,
    takeoverPages: (kind, name, dur) => takeoverPages(kind, name, dur),
    addClipCandidate: (reason, details, ts, score) => addClipCandidate(reason, details, ts, score),
    getClipCandidateConfig: () => CLIP_CANDIDATE_CONFIG,
    getRecentChatTimestamps: () => recentChatTimestamps,
    setRecentChatTimestamps: (ts) => { recentChatTimestamps = ts; },
    log: console.log,
    warn: console.warn,
    error: console.error
});

ssnService.loadEmoteCache();

const emoteCache = ssnService.getEmoteCache();
const cacheEmote = (name, url) => ssnService.cacheEmote(name, url);
const connectSSN = () => ssnService.connectSSN();
const scheduleSSNReconnect = () => ssnService.scheduleSSNReconnect();
const connectFeaturedListener = () => ssnService.connectFeaturedListener();
const processChatMessage = (msg) => ssnService.processChatMessage(msg);
const updateStats = (chatname, msg) => ssnService.updateStats(chatname, msg);
const recordSubTenure = (chatname, msg, nowISO) => ssnService.recordSubTenure(chatname, msg, nowISO);
const recentChatSummary = () => ssnService.recentChatSummary();
const saveChatData = () => ssnService.saveChatData();
const saveStats = () => ssnService.saveStats();
const loadStats = () => ssnService.loadStats();
loadStats();
const saveChatLog = () => ssnService.saveChatLog();
const readChatLogFile = (filepath) => ssnService.readChatLogFile(filepath);
const readChatLogTail = (filepath, limit) => ssnService.readChatLogTail(filepath, limit);
const countChatLogEntries = (filepath) => ssnService.countChatLogEntries(filepath);
const getCurrentChatLogEntries = () => ssnService.getCurrentChatLogEntries();
const collectHashtagStats = (range) => ssnService.collectHashtagStats(range);
const loadCurrentSessionStateFromDisk = () => ssnService.loadCurrentSessionStateFromDisk();
const ssnSocket = {
    get readyState() { return ssnService.getSsnSocket()?.readyState; },
    close: () => ssnService.disconnectSSN(),
    terminate: () => ssnService.disconnectSSN()
};


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

const getTwitchAuthenticatedUserId = () => twitchService.getTwitchAuthenticatedUserId();
const twitchCreateClipFromVod = (editorId, vodId, vodOffset, duration, title) => twitchService.twitchCreateClipFromVod(editorId, vodId, vodOffset, duration, title);

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
// BETA CLIP CANDIDATES
// ============================================================================

let recentChatTimestamps = [];

const clipService = createClipService({
    dataDir: DATA_DIR,
    sessionsDir: SESSIONS_DIR,
    chatLogPath: CHAT_LOG_PATH,
    clipCandidatesPath: CLIP_CANDIDATES_PATH,
    getConfig: () => config,
    getChatData: () => chatData,
    isSessionActive: () => sessionActive,
    getBroadcasterId: () => BROADCASTER_ID,
    getBroadcasterName: () => BROADCASTER_NAME,
    ensureToken: () => ensureToken(),
    twitchApiRequest: (endpoint, params, method, body, extraHeaders) => twitchApiRequest(endpoint, params, method, body, extraHeaders),
    getHighlights: () => highlights,
    readChatLogFile: (filepath) => readChatLogFile(filepath),
    getCurrentChatLogEntries: () => getCurrentChatLogEntries(),
    localDateTimeStr,
    log: console.log,
    warn: console.warn
});

const addClipCandidate = (reason, details, timestamp, score, sessionOverride, sourceKey) =>
    clipService.addClipCandidate(reason, details, timestamp, score, sessionOverride, sourceKey);
const resolveCandidateVodUrls = (candidates) => clipService.resolveCandidateVodUrls(candidates);
const backfillClipCandidates = (rebuild) => clipService.backfillClipCandidates(rebuild);
const clipSessionOverrideForName = (sessionName) => clipService.clipSessionOverrideForName(sessionName);
const CLIP_CANDIDATE_CONFIG = clipService.getRuntimeConfig();
const loadClipCandidates = () => clipService.loadClipCandidates();
const saveClipCandidates = () => clipService.saveClipCandidates();


// ============================================================================
// TIMERS
// ============================================================================

const timerService = createTimerService({
    dataDir: DATA_DIR,
    safeWriteFileSync,
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data),
    onTimerEvent: (event) => alertEngine.handleEvent(event)
});
const timerStore = timerService.getStore();
const loadTimers = () => timerService.loadTimers();
const saveTimers = () => timerService.saveTimers();
const buildTimersSnapshot = () => timerService.buildTimersSnapshot();
const startTimerTicker = () => timerService.startTimerTicker();
const upsertTimer = input => timerService.upsertTimer(input);
const getTimerOrThrow = id => timerService.getTimerOrThrow(id);
const applyTimerControl = (timer, action, params) => timerService.applyTimerControl(timer, action, params);
const timerSoundUsers = name => timerService.timerSoundUsers(name, assetReferencedIn);
const rewriteTimerSoundReferences = (oldName, newName) => timerService.rewriteTimerSoundReferences(oldName, newName, rewriteAssetReferences);
const handleTimersRoutes = createTimersRoutes({ timerService });

// The credits header and custom credit sections can use library images.
function creditsAssetUsers(name) {
    const users = [];
    const credits = config.credits || {};
    if (credits.header?.image && assetReferencedIn(credits.header.image, name, null)) users.push({ id: 'credits:header', name: 'Credits: header image' });
    (credits.custom_sections || []).forEach((section, index) => {
        if (section?.image && assetReferencedIn(section.image, name, null)) {
            users.push({ id: `credits:${section.id || index}`, name: `Credits: ${section.label || section.title || `custom section ${index + 1}`}` });
        }
    });
    return users;
}

// Game plan items can use library images as custom artwork.
function gamePlanAssetUsers(name) {
    return gamePlanService.gamePlanAssetUsers(name, assetReferencedIn);
}

function rewriteGamePlanReferences(oldName, newName) {
    return gamePlanService.rewriteGamePlanReferences(oldName, newName, rewriteAssetReferences);
}

function rewriteCreditsReferences(oldName, newName) {
    const credits = config.credits;
    if (!credits) return false;
    const before = JSON.stringify(credits);
    const rewritten = rewriteAssetReferences(before, oldName, newName, null, null);
    if (rewritten === before) return false;
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    current.credits = JSON.parse(rewriteAssetReferences(JSON.stringify(current.credits || {}), oldName, newName, null, null));
    safeWriteFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    applyRuntimeConfig(current);
    return true;
}



async function readRequestBody(req, maxBytes = 25 * 1024 * 1024) {
    return await new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes) {
                req.destroy();
                reject(new Error('Payload too large'));
                return;
            }
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}





// Parsed results are cached per file mtime/size because /api/status and goal broadcasts read the same files repeatedly.
const jsonFileCache = new Map();
function readJsonFileSafe(filePath, fallback = null) {
    try {
        const stat = fs.statSync(filePath);
        const cached = jsonFileCache.get(filePath);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value;
        const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        jsonFileCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value });
        return value;
    } catch {
        return fallback;
    }
}


function saveRuntimeConfigSection(updater) {
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    updater(current);
    safeWriteFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    applyRuntimeConfig(current);
    return current;
}

const twitchService = createTwitchService({
    dataDir: DATA_DIR,
    getClientId: () => TWITCH_CLIENT_ID,
    getClientSecret: () => TWITCH_CLIENT_SECRET,
    getBroadcasterId: () => BROADCASTER_ID,
    getBroadcasterName: () => BROADCASTER_NAME,
    getRedirectUri: () => TWITCH_REDIRECT_URI,
    getChatData: () => chatData,
    readJsonFileSafe,
    safeWriteFileSync,
    onBroadcasterSynced: async (user) => {
        const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        current.broadcaster_id = user.id;
        if (!cleanConfigValue(current.broadcaster_name)) current.broadcaster_name = user.login;
        BROADCASTER_ID = user.id;
        if (!BROADCASTER_NAME) BROADCASTER_NAME = user.login;
        safeWriteFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    },
    onStreamInfoChange: (category) => refreshGameInfo(category),
    onPollUpdate: (pollData) => broadcastToOverlays('poll-update', pollData),
    onTakeover: (action, title, duration) => takeoverPages(action, title, duration),
    onViewerCountUpdate: () => fetchViewerCount()
});
const loadStoredToken = () => twitchService.loadStoredToken();
const saveToken = (tokenData) => twitchService.saveToken(tokenData);
const clearToken = () => twitchService.clearToken();
const refreshTwitchToken = () => twitchService.refreshTwitchToken();
const ensureToken = () => twitchService.ensureToken();
const startDeviceAuth = () => twitchService.startDeviceAuth();
const pollDeviceAuth = () => twitchService.pollDeviceAuth();
const syncBroadcasterFromToken = () => twitchService.syncBroadcasterFromToken();
const twitchTokenRequest = (body) => twitchService.twitchTokenRequest(body);
const twitchApiRequest = (endpoint, params) => twitchService.twitchApiRequest(endpoint, params);
const twitchApiRequestOnce = (endpoint, params) => twitchService.twitchApiRequestOnce(endpoint, params);
const twitchCreateClip = () => twitchService.twitchCreateClip();
const fetchAllPages = (endpoint, params, dataKey, strict) => twitchService.fetchAllPages(endpoint, params, dataKey, strict);
const fetchTwitchData = () => twitchService.fetchTwitchData();
const fetchStreamInfo = () => twitchService.fetchStreamInfo();
const fetchTwitchPoll = () => twitchService.fetchTwitchPoll();
const recordFollowerSnapshot = (followers) => twitchService.recordFollowerSnapshot(followers);
const recordSubSnapshot = (subs) => twitchService.recordSubSnapshot(subs);

const viewerService = createViewerService({
    getConfig: () => config,
    getChatData: () => chatData,
    setChatDataViewerStats: (stats) => { if (chatData) chatData.viewerStats = stats; },
    onViewerUpdate: (summary) => broadcastToOverlays('viewer-update', summary),
    onGoalsUpdate: () => broadcastToOverlays('goals-update', buildGoalsSnapshot()),
    fetchLiveStreamViewer: async () => {
        if (!TWITCH_CLIENT_ID || !BROADCASTER_ID) {
            console.warn('[Viewers] Missing Twitch credentials or broadcaster_id — viewer tracking unavailable');
            return null;
        }
        const hasToken = await ensureToken();
        if (!hasToken) return null;
        const result = await twitchApiRequest('/streams', { user_id: BROADCASTER_ID });
        if (result.status !== 200) {
            console.warn(`[Viewers] Twitch /streams returned ${result.status}`);
            return null;
        }
        const stream = result.body.data?.[0] || null;
        return {
            count: stream?.viewer_count || 0,
            live: !!stream,
            source: 'twitch',
            streamStartedAt: stream?.started_at || null
        };
    }
});
const getViewerSummary = (sourceData) => viewerService.getViewerSummary(sourceData);
const recordViewerSample = (sample) => viewerService.recordViewerSample(sample);
const processSSNViewerUpdate = (msg) => viewerService.processSSNViewerUpdate(msg);
const fetchViewerCount = () => viewerService.fetchViewerCount();
const startViewerTracking = () => viewerService.startViewerTracking();
const stopViewerTracking = () => viewerService.stopViewerTracking();

const goalsService = createGoalsService({
    dataDir: DATA_DIR,
    getConfig: () => config,
    saveRuntimeConfigSection,
    getChatData: () => chatData,
    getStatsData: () => statsData,
    getViewerSummary: () => getViewerSummary(),
    readJsonFileSafe,
    onGoalAlert: (event) => alertEngine.handleEvent(event)
});
const buildGoalsSnapshot = () => goalsService.buildGoalsSnapshot();
const buildGoalMetrics = () => goalsService.buildGoalMetrics();
const resetGoalBaseline = goalId => goalsService.resetGoalBaseline(goalId);
const toggleGoalEnabled = (goalId, mode) => goalsService.toggleGoalEnabled(goalId, mode);
const buildRecentEvents = limit => goalsService.buildRecentEvents(limit);
setInterval(() => goalsService.checkGoalAlerts(), 5000).unref();
const handleGoalsRoutes = createGoalsRoutes({
    goalsService,
    getConfig: () => config,
    configPath: CONFIG_PATH,
    safeWriteFileSync,
    applyRuntimeConfig
});

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
if (!fs.existsSync(CUSTOM_OVERLAY_ASSETS_DIR)) {
    fs.mkdirSync(CUSTOM_OVERLAY_ASSETS_DIR, { recursive: true });
}




const sessionService = createSessionService({
    dataDir: DATA_DIR,
    sessionsDir: SESSIONS_DIR,
    liveChatPath: LIVE_CHAT_PATH,
    chatLogPath: CHAT_LOG_PATH,
    lifecyclePath: path.join(DATA_DIR, 'session-lifecycle.json'),
    getConfig: () => config,
    getChatData: () => chatData,
    getChatLog: () => chatLog,
    getStatsData: () => statsData,
    getTwitchClientId: () => TWITCH_CLIENT_ID,
    getBroadcasterId: () => BROADCASTER_ID,
    ensureTwitchToken: () => ensureToken(),
    fetchTwitchStream: async () => {
        const result = await twitchApiRequest('/streams', { user_id: BROADCASTER_ID });
        return result.status === 200 ? result.body.data?.[0] || null : null;
    },
    fetchTwitchData: () => fetchTwitchData(),
    fetchStreamInfo: () => fetchStreamInfo(),
    fetchViewerCount: () => fetchViewerCount(),
    fetchTwitchPoll: () => fetchTwitchPoll(),
    normalizeViewerStats: (v) => normalizeViewerStats(v),
    getViewerSummary: () => getViewerSummary(),
    buildGoalsSnapshot: () => buildGoalsSnapshot(),
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data),
    saveChatData: () => saveChatData(),
    saveStats: () => saveStats(),
    saveChatLog: () => saveChatLog(),
    resetChatData: () => resetChatData(),
    loadCurrentSessionStateFromDisk: () => loadCurrentSessionStateFromDisk(),
    recordPlayedGames: (streamInfo, endMs, startFloorMs) => recordPlayedGames(streamInfo, endMs, startFloorMs),
    performAutoBackup: (force) => performAutoBackup(force),
    isSessionActive: () => sessionActive,
    setSessionActive: (val) => { sessionActive = !!val; }
});
const noteArchivedSession = (name) => sessionService.noteArchivedSession(name);
const sessionHasData = () => sessionService.sessionHasData();
const broadcastSessionState = () => sessionService.broadcastSessionState();
const finalizeSessionStreamEnd = () => sessionService.finalizeSessionStreamEnd();
const archiveSession = () => sessionService.archiveSession();
const endSessionNow = (opts) => sessionService.endSessionNow(opts);
const startSessionNow = () => sessionService.startSessionNow();
const resumeArchivedSession = (name) => sessionService.resumeArchivedSession(name);
const getLifecycleStatus = () => sessionService.getLifecycleStatus();
const getSessionPhase = () => sessionService.getSessionPhase();
const startLifecycleWatcher = () => sessionService.startLifecycleWatcher();
const stopLifecycleWatcher = () => sessionService.stopLifecycleWatcher();
const archivedCategoryMinutes = () => sessionService.archivedCategoryMinutes();
const currentCategoryStats = (archivedTotals) => sessionService.currentCategoryStats(archivedTotals);
const computeMilestones = () => sessionService.computeMilestones();

// ============================================================================
// GAME INFO (Twitch box art + IGDB details for the current category)
// ============================================================================

const GAME_INFO_PATH = path.join(DATA_DIR, 'game-info-cache.json');
const GAME_INFO_TTL_MS = 30 * 86400000;
const GAME_INFO_RETRY_MS = 10 * 60000;
const GAME_INFO_VERSION = 2;
let gameInfoCache = {};
try { gameInfoCache = JSON.parse(fs.readFileSync(GAME_INFO_PATH, 'utf8')); } catch { /* first run */ }
const gameInfoPending = new Map();
let appTokenCache = { token: '', expiresAt: 0 };

async function getAppToken() {
    // Public apps have no secret for client-credentials, so use the authorized user token instead
    if (!TWITCH_CLIENT_SECRET) {
        if (!(await ensureToken())) throw new Error('Connect Twitch to look up game info');
        return twitchService.getAccessToken();
    }
    if (appTokenCache.token && Date.now() < appTokenCache.expiresAt) return appTokenCache.token;
    const body = new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' });
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error(data.message || `token request failed (${response.status})`);
    appTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 300) * 1000 };
    return appTokenCache.token;
}

async function fetchGameInfo(name, pinnedIgdbId = '') {
    const token = await getAppToken();
    const headers = { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` };
    const info = { name, fetchedAt: Date.now(), source: 'twitch' };

    // A pinned IGDB id (chosen in the Game Plan editor) skips the by-name guess entirely.
    const helix = pinnedIgdbId ? null : await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(name)}`, { headers });
    const game = helix ? (await helix.json()).data?.[0] : null;
    if (pinnedIgdbId) info.igdbId = pinnedIgdbId;
    if (game) {
        info.twitchId = game.id;
        info.boxArt = String(game.box_art_url || '').replace('{width}', '285').replace('{height}', '380');
        info.igdbId = game.igdb_id || '';
    }
    info.v = GAME_INFO_VERSION;

    // A Twitch category with no IGDB id (Just Chatting, Music, ...) is not a game, and a name search would match an unrelated one.
    if (game && !info.igdbId) return info;

    // IGDB shares the Twitch app credentials; Twitch box art remains the fallback if it is unavailable.
    try {
        const where = info.igdbId ? `where id = ${Number(info.igdbId)}` : `search "${name.replace(/["\\]/g, '')}"`;
        const query = `fields name,url,summary,first_release_date,total_rating,cover.image_id,genres.name,platforms.abbreviation,involved_companies.developer,involved_companies.company.name; ${where}; limit 5;`;
        const igdb = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers, body: query });
        const results = await igdb.json();
        if (Array.isArray(results) && results.length) {
            const match = results.find(item => String(item.name).toLowerCase() === name.toLowerCase()) || results[0];
            info.source = 'igdb';
            info.igdbId = match.id;
            info.igdbName = match.name || '';
            info.igdbUrl = match.url || '';
            info.summary = match.summary || '';
            info.releaseTs = match.first_release_date ? match.first_release_date * 1000 : null;
            info.rating = match.total_rating ? Math.round(match.total_rating) : null;
            info.genres = (match.genres || []).map(g => g.name);
            info.platforms = (match.platforms || []).map(p => p.abbreviation).filter(Boolean);
            info.developers = (match.involved_companies || []).filter(c => c.developer).map(c => c.company?.name).filter(Boolean);
            if (match.cover?.image_id) info.cover = `https://images.igdb.com/igdb/image/upload/t_cover_big/${match.cover.image_id}.jpg`;
        }
    } catch (err) {
        console.error('[Game] IGDB lookup failed:', err.message);
    }
    return info;
}

const infoKey = (name, igdbId) => igdbId ? `igdb:${igdbId}` : String(name || '').toLowerCase();

function refreshGameInfo(name, igdbId = '') {
    if (!name || !TWITCH_CLIENT_ID) return Promise.resolve(null);
    const key = infoKey(name, igdbId);
    const cached = gameInfoCache[key];
    const maxAge = cached?.failed || cached?.v !== GAME_INFO_VERSION ? (cached?.failed ? GAME_INFO_RETRY_MS : 0) : GAME_INFO_TTL_MS;
    const needsUrl = cached?.source === 'igdb' && !cached.igdbUrl && !cached.urlTried;
    if (needsUrl) cached.urlTried = true;
    if (cached && !needsUrl && Date.now() - cached.fetchedAt < maxAge) return Promise.resolve(cached);
    if (gameInfoPending.has(key)) return gameInfoPending.get(key);
    const job = fetchGameInfo(name, igdbId).catch(err => {
        console.error('[Game] Lookup failed:', err.message);
        return { name, fetchedAt: Date.now(), failed: true };
    }).then(info => {
        gameInfoCache[key] = info;
        try { fs.writeFileSync(GAME_INFO_PATH, JSON.stringify(gameInfoCache)); } catch { /* cache is best-effort */ }
        gameInfoPending.delete(key);
        return info;
    });
    gameInfoPending.set(key, job);
    return job;
}

// Public shape for overlays; `cover` prefers IGDB art and falls back to Twitch box art.
function publicGameInfo(name, igdbId = '') {
    const info = name ? gameInfoCache[infoKey(name, igdbId)] : null;
    if (!info || info.failed) return { name: name || '' };
    return {
        name: info.name,
        igdbName: info.igdbName || '',
        igdbUrl: info.igdbUrl || '',
        cover: info.cover || info.boxArt || '',
        boxArt: info.boxArt || '',
        summary: info.summary || '',
        releaseDate: info.releaseTs ? new Date(info.releaseTs).toISOString().slice(0, 10) : '',
        releaseYear: info.releaseTs ? new Date(info.releaseTs).getUTCFullYear() : '',
        rating: info.rating ?? '',
        genres: info.genres || [],
        platforms: info.platforms || [],
        developers: info.developers || [],
        source: info.source
    };
}


// ============================================================================
// GAME PLAN (manual list of scheduled / backlog / played games)
// ============================================================================

const gamePlanService = createGamePlanService({
    dataDir: DATA_DIR,
    safeWriteFileSync,
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data),
    getConfig: () => config,
    getStreamInfo: () => chatData.streamInfo,
    getViewerStats: () => chatData.viewerStats,
    normalizeViewerStats,
    archivedCategoryMinutes,
    categoryMinutesFor,
    categoryTimeFor,
    publicGameInfo,
    refreshGameInfo,
    getGameInfoCached: (name, igdbId) => name ? gameInfoCache[infoKey(name, igdbId)] : null,
    GAME_INFO_VERSION,
    sessionsDir: SESSIONS_DIR
});
const GAME_PLAN_PATH = gamePlanService.filePath;
const loadGamePlan = () => gamePlanService.loadGamePlan();
const buildGamePlanSnapshot = () => gamePlanService.buildGamePlanSnapshot();
const applyPlayedSpans = spans => gamePlanService.applyPlayedSpans(spans);
const recordPlayedGames = (streamInfo, endMs, startFloorMs) => gamePlanService.recordPlayedGames(streamInfo, endMs, startFloorMs);
const backfillPlayedGames = () => gamePlanService.backfillPlayedGames();
const handleGamePlanRoutes = createGamePlanRoutes({
    gamePlanService,
    twitchService,
    getTwitchClientId: () => TWITCH_CLIENT_ID,
    getAppToken,
    getChatData: () => chatData,
    refreshGameInfo,
    publicGameInfo,
    gameInfoCache,
    infoKey,
    sessionsDir: SESSIONS_DIR
});

// ============================================================================
// WEATHER (Open-Meteo Service)
// ============================================================================

const weatherService = createWeatherService({
    getConfig: () => config,
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data)
});
const fetchWeather = () => weatherService.fetchWeather();
const publicWeather = () => weatherService.publicWeather();
const scheduleWeather = () => weatherService.scheduleWeather();
const handleWeatherRoutes = createWeatherRoutes({
    weatherService,
    getConfig: () => config
});

// ============================================================================
// MUSIC NOW-PLAYING
// ============================================================================

const musicService = createMusicService({
    dataDir: DATA_DIR,
    getConfig: () => config,
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data)
});
const startMusicPolling = () => musicService.startPolling();
const stopMusicPolling = () => musicService.stopPolling();
let overlayVisible = true;
// Overlays hidden through the API; the music overlay keeps its own flag (overlayVisible).
const hiddenOverlays = new Set();
const BUILTIN_OVERLAYS = [
    { key: 'credits', label: 'Credits' },
    { key: 'stats', label: 'Stats' },
    { key: 'hashtags', label: 'Hashtags' },
    { key: 'viewers', label: 'Viewer Count' },
    { key: 'goal', label: 'Goals' },
    { key: 'countdown', label: 'Countdown timers' },
    { key: 'stopwatch', label: 'Stopwatch timers' },
    { key: 'music', label: 'Music' }
];

function listOverlayVisibility() {
    const visible = key => key === 'music' ? overlayVisible : !hiddenOverlays.has(key);
    return [
        ...BUILTIN_OVERLAYS.map(o => ({ ...o, type: 'builtin', visible: visible(o.key) })),
        ...Object.values(customOverlays).map(o => ({ key: `custom:${o.id}`, label: o.name || o.id, type: 'custom', visible: visible(`custom:${o.id}`) }))
    ];
}

function setOverlayVisibility(key, action) {
    const entry = listOverlayVisibility().find(o => o.key === key);
    if (!entry) return null;
    const next = action === 'on' ? true : action === 'off' ? false : !entry.visible;
    if (key === 'music') overlayVisible = next;
    else if (next) hiddenOverlays.delete(key);
    else hiddenOverlays.add(key);
    broadcastToOverlays('overlay-visibility', { key, visible: next });
    return { ...entry, visible: next };
}

const handleMusicRoutes = createMusicRoutes({
    musicService,
    getOverlayVisible: () => overlayVisible,
    setOverlayVisibility
});



const RESTART_REQUIRED_CONFIG_PATHS = [
    'port',
    'broadcaster_id',
    'broadcaster_name',
    'twitch.client_id',
    'twitch.client_secret',
    'ssn.session_id',
    'ssn.server',
    'twitch_refresh_minutes',
    'twitch_stream_info_seconds'
];

function getConfigPathValue(obj, dottedPath) {
    return dottedPath.split('.').reduce((value, key) => value?.[key], obj);
}

function getRestartRequiredConfigChanges(previousConfig, nextConfig) {
    return RESTART_REQUIRED_CONFIG_PATHS.filter(key => {
        const prev = getConfigPathValue(previousConfig, key);
        const next = getConfigPathValue(nextConfig, key);
        return JSON.stringify(prev) !== JSON.stringify(next);
    });
}

function applyRuntimeConfig(nextConfig) {
    const prevMusicEnabled = MUSIC_CONFIG.enabled;
    const prevSource = MUSIC_CONFIG.source;
    const prevViewerTracking = normalizeViewerTrackingConfig(config.viewer_tracking);

    const prevLifecyclePoll = normalizeLifecycleConfig(config.session_lifecycle).poll_seconds;
    config = nextConfig;
    if (normalizeLifecycleConfig(config.session_lifecycle).poll_seconds !== prevLifecyclePoll) startLifecycleWatcher();
    EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
    BANNED_USERS = (config.banned_users || []).map(u => u.toLowerCase());

    const nextMusicConfig = config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 };
    for (const key of Object.keys(MUSIC_CONFIG)) delete MUSIC_CONFIG[key];
    Object.assign(MUSIC_CONFIG, nextMusicConfig);

    scheduleWeather();

    const nextViewerTracking = normalizeViewerTrackingConfig(config.viewer_tracking);
    for (const key of Object.keys(VIEWER_TRACKING_CONFIG)) delete VIEWER_TRACKING_CONFIG[key];
    Object.assign(VIEWER_TRACKING_CONFIG, nextViewerTracking);

    const nextClipCandidates = normalizeClipCandidateConfig(config.clip_candidates);
    for (const key of Object.keys(CLIP_CANDIDATE_CONFIG)) delete CLIP_CANDIDATE_CONFIG[key];
    Object.assign(CLIP_CANDIDATE_CONFIG, nextClipCandidates);

    musicService.handleConfigChange({ enabled: prevMusicEnabled, source: prevSource }, nextMusicConfig);

    const viewerChanged = prevViewerTracking.enabled !== nextViewerTracking.enabled
        || prevViewerTracking.source !== nextViewerTracking.source
        || prevViewerTracking.poll_seconds !== nextViewerTracking.poll_seconds
        || prevViewerTracking.retain_samples !== nextViewerTracking.retain_samples;
    if (viewerChanged) {
        stopViewerTracking();
        if (nextViewerTracking.enabled) startViewerTracking();
    }

    broadcastToOverlays('goals-update', buildGoalsSnapshot());
}


function getBackupFileSpecs() {
    return [
        { src: CONFIG_PATH, dest: 'config.json' },
        { src: LIVE_CHAT_PATH, dest: 'data/chat.json' },
        { src: CHAT_LOG_PATH, dest: 'data/chat-log.jsonl' },
        { src: STATS_PATH, dest: 'data/stats.json' },
        { src: BANNED_HASHTAGS_PATH, dest: 'data/.banned-hashtags.json' },
        { src: TIMERS_PATH, dest: 'data/timers.json' },
        { src: path.join(DATA_DIR, 'subs.json'), dest: 'data/subs.json' },
        { src: path.join(DATA_DIR, 'bits.json'), dest: 'data/bits.json' },
        { src: path.join(DATA_DIR, 'followers.json'), dest: 'data/followers.json' },
        { src: HIGHLIGHTS_PATH, dest: 'data/highlights.jsonl' },
        { src: CLIP_CANDIDATES_PATH, dest: 'data/clip-candidates.json' },
        { src: CUSTOM_OVERLAYS_PATH, dest: 'data/custom-overlays.json' },
        { src: OVERLAY_PRESETS_PATH, dest: 'data/overlay-presets.json' },
        { src: ASSET_TAGS_PATH, dest: 'data/asset-tags.json' },
        { src: ASSET_CAPTIONS_PATH, dest: 'data/asset-captions.json' },
        { src: GAME_PLAN_PATH, dest: 'data/game-plan.json' },
        { src: path.join(DATA_DIR, 'alerts.json'), dest: 'data/alerts.json' }
    ];
}

// Selective share bundles: pick individual overlays, presets and settings to export or import.
const SHARE_FORMAT = 'streampulse-share';
const SHARE_MAX_BYTES = 600 * 1024 * 1024;
const SHARE_SINGLES = {
    gameplan: { label: 'Game Plan', path: () => GAME_PLAN_PATH, entry: 'game-plan.json' },
    timers: { label: 'Timers', path: () => TIMERS_PATH, entry: 'timers.json' },
    alerts: { label: 'Alerts', path: () => path.join(DATA_DIR, 'alerts.json'), entry: 'alerts.json' }
};
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function readBinaryBody(req, limit = SHARE_MAX_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > limit) { reject(new Error('File is too large')); req.destroy(); return; }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function listShareItems() {
    const singles = Object.entries(SHARE_SINGLES)
        .filter(([, def]) => fs.existsSync(def.path()))
        .map(([type, def]) => ({ type, name: def.label }));
    return {
        overlays: Object.values(customOverlays).map(o => ({ type: 'overlay', id: o.id, name: o.name })),
        presets: overlayService.getOverlayPresets().map(p => ({ type: 'preset', id: p.id, name: p.name, category: p.category })),
        singles
    };
}

function shareAssetNames(text) {
    if (!fs.existsSync(CUSTOM_OVERLAY_ASSETS_DIR)) return [];
    return fs.readdirSync(CUSTOM_OVERLAY_ASSETS_DIR).filter(name =>
        assetReferencedIn(text, name, FONT_EXTENSIONS.has(path.extname(name).toLowerCase()) ? assetFontFamily(name) : ''));
}

function buildShareZip(selection, includeHistory) {
    const zip = new AdmZip();
    const manifest = { format: SHARE_FORMAT, version: 1, createdAt: new Date().toISOString(), items: [] };
    const assets = new Set();
    const presetsOut = [];
    for (const { type, id } of selection) {
        if (type === 'overlay') {
            const overlay = customOverlays[sanitizeOverlayId(id)];
            if (!overlay) continue;
            const text = JSON.stringify(overlay, null, 2);
            zip.addFile(`overlays/${overlay.id}.json`, Buffer.from(text));
            manifest.items.push({ type, id: overlay.id, name: overlay.name });
            shareAssetNames(text).forEach(n => assets.add(n));
            if (includeHistory && fs.existsSync(historyFile(overlay.id))) zip.addLocalFile(historyFile(overlay.id), 'overlays', `${overlay.id}.history.json`);
        } else if (type === 'preset') {
            const preset = overlayService.getOverlayPresets().find(p => p.id === id);
            if (!preset) continue;
            presetsOut.push(preset);
            manifest.items.push({ type, id: preset.id, name: preset.name });
            shareAssetNames(JSON.stringify(preset)).forEach(n => assets.add(n));
        } else if (SHARE_SINGLES[type] && fs.existsSync(SHARE_SINGLES[type].path())) {
            zip.addLocalFile(SHARE_SINGLES[type].path(), '', SHARE_SINGLES[type].entry);
            manifest.items.push({ type, name: SHARE_SINGLES[type].label });
        }
    }
    if (presetsOut.length) zip.addFile('presets.json', Buffer.from(JSON.stringify(presetsOut, null, 2)));
    for (const name of assets) zip.addLocalFile(path.join(CUSTOM_OVERLAY_ASSETS_DIR, name), 'assets', name);
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    return { buffer: zip.toBuffer(), count: manifest.items.length };
}

function openShareZip(buffer) {
    const zip = new AdmZip(buffer);
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) throw new Error('Not a StreamPulse share file (manifest.json is missing)');
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    if (manifest.format !== SHARE_FORMAT) throw new Error('Not a StreamPulse share file');
    return { zip, manifest };
}

function freeId(base, taken) {
    let n = 2;
    while (taken(`${base}-${n}`)) n++;
    return `${base}-${n}`.slice(0, 60);
}

function importShareZip(buffer, selected, conflict) {
    const { zip, manifest } = openShareZip(buffer);
    const wanted = new Set(selected);
    const results = [];
    const entryText = name => { const e = zip.getEntry(name); return e ? e.getData().toString('utf8') : null; };

    // Copy used assets in, renaming only when a different file already has that name.
    const assetMap = {};
    const importAssets = text => {
        let out = text;
        for (const entry of zip.getEntries()) {
            if (!entry.entryName.startsWith('assets/') || entry.isDirectory) continue;
            const name = path.basename(entry.entryName);
            if (name !== entry.entryName.slice('assets/'.length)) continue;
            const family = FONT_EXTENSIONS.has(path.extname(name).toLowerCase()) ? assetFontFamily(name) : '';
            if (!assetReferencedIn(text, name, family)) continue;
            if (!(name in assetMap)) {
                const data = entry.getData();
                const dest = path.join(CUSTOM_OVERLAY_ASSETS_DIR, name);
                if (!fs.existsSync(dest)) { fs.writeFileSync(dest, data); assetMap[name] = name; }
                else if (fs.readFileSync(dest).equals(data)) assetMap[name] = name;
                else {
                    const renamed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}-${name.replace(/^[a-z0-9]{6,}-/, '')}`;
                    fs.writeFileSync(path.join(CUSTOM_OVERLAY_ASSETS_DIR, renamed), data);
                    assetMap[name] = renamed;
                }
            }
            if (assetMap[name] !== name) out = rewriteAssetReferences(out, name, assetMap[name], family, FONT_EXTENSIONS.has(path.extname(name).toLowerCase()) ? assetFontFamily(assetMap[name]) : '');
        }
        return out;
    };

    for (const item of manifest.items || []) {
        const key = item.id ? `${item.type}:${item.id}` : item.type;
        if (!wanted.has(key)) continue;
        try {
            if (item.type === 'overlay') {
                const sourceId = sanitizeOverlayId(item.id);
                const raw = entryText(`overlays/${sourceId}.json`);
                if (!raw) throw new Error('missing from file');
                const exists = !!customOverlays[sourceId];
                if (exists && conflict === 'skip') { results.push({ key, status: 'skipped' }); continue; }
                const targetId = exists && conflict === 'copy' ? freeId(sourceId, id => !!customOverlays[id]) : sourceId;
                const parsed = JSON.parse(importAssets(raw));
                if (exists && conflict === 'copy') parsed.name = `${parsed.name || sourceId} (imported)`;
                const previous = customOverlays[targetId];
                if (previous) recordOverlayRevision(previous);
                const overlay = normalizeCustomOverlay({ ...parsed, revision: previous ? previous.revision + 1 : 1, updatedAt: new Date().toISOString() }, targetId);
                customOverlays[targetId] = overlay;
                saveCustomOverlays();
                syncOverlayPages(overlay, previous);
                const history = !previous && entryText(`overlays/${sourceId}.history.json`);
                if (history) { fs.mkdirSync(CUSTOM_OVERLAY_HISTORY_DIR, { recursive: true }); fs.writeFileSync(historyFile(targetId), history); }
                broadcastToOverlays('custom-overlay-update', { id: targetId, overlay });
                broadcastPage(overlay);
                results.push({ key, status: targetId === sourceId ? (previous ? 'replaced' : 'added') : 'copied', id: targetId });
            } else if (item.type === 'preset') {
                const raw = entryText('presets.json');
                const source = raw && JSON.parse(raw).find(p => p.id === item.id);
                if (!source) throw new Error('missing from file');
                const presetsList = overlayService.getOverlayPresets();
                const exists = presetsList.some(p => p.id === source.id);
                if (exists && conflict === 'skip') { results.push({ key, status: 'skipped' }); continue; }
                const targetId = exists && conflict === 'copy' ? freeId(source.id, id => presetsList.some(p => p.id === id)) : source.id;
                const [preset] = normalizeOverlayPresets([{ ...JSON.parse(importAssets(JSON.stringify(source))), id: targetId }]);
                if (!preset) throw new Error('invalid preset');
                overlayService.setOverlayPresets([...presetsList.filter(p => p.id !== targetId), preset]);
                saveOverlayPresets();
                results.push({ key, status: exists ? (targetId === source.id ? 'replaced' : 'copied') : 'added', id: targetId });
            } else if (SHARE_SINGLES[item.type]) {
                const def = SHARE_SINGLES[item.type];
                const raw = entryText(def.entry);
                if (!raw) throw new Error('missing from file');
                JSON.parse(raw);
                if (conflict === 'skip' && fs.existsSync(def.path())) { results.push({ key, status: 'skipped' }); continue; }
                if (fs.existsSync(def.path())) fs.copyFileSync(def.path(), `${def.path()}.pre-import.bak`);
                fs.writeFileSync(def.path(), raw);
                if (item.type === 'timers') { loadTimers(); broadcastToOverlays('timers-snapshot', buildTimersSnapshot()); }
                if (item.type === 'alerts') alertEngine.setConfig(JSON.parse(raw));
                results.push({ key, status: 'replaced' });
            }
        } catch (err) {
            results.push({ key, status: 'failed', error: err.message });
        }
    }
    return results;
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'StreamPulse-Updater', Accept: 'application/vnd.github+json' } }, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`GitHub returned HTTP ${response.statusCode}`));
                    return;
                }

                try { resolve(JSON.parse(body)); } catch { reject(new Error('GitHub returned invalid JSON')); }
            });
        }).on('error', reject);
    });
}

function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'StreamPulse-Updater' } }, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                downloadFile(response.headers.location, destination).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`GitHub download returned HTTP ${response.statusCode}`));
                return;
            }
            const output = fs.createWriteStream(destination);
            response.pipe(output);
            output.on('finish', () => output.close(resolve));
            output.on('error', reject);
        }).on('error', reject);
    });
}

function restartServer() {
    let restarted = false;
    const launchReplacement = () => {
        if (restarted) return;
        restarted = true;
        const child = require('child_process').spawn(process.execPath, process.argv.slice(1), {
            cwd: __dirname,
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        process.exit(0);
    };

    if (ssnSocket) ssnSocket.terminate();
    wsService.closeAllConnections();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close(launchReplacement);
    setTimeout(launchReplacement, 1500);
}

// Release tags are "0.8" or "0.8.1" while package.json uses "0.8.0", so compare numerically.
function sameVersion(a, b) {
    const parts = v => String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const x = parts(a), y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return false;
    return true;
}

async function getUpdateStatus(mode = 'release') {
    let currentSha = null;
    try {
        const { stdout: current } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: __dirname });
        currentSha = current.trim();
    } catch {}
    if (mode === 'nightly') {
        if (!currentSha) throw new Error('Nightly updates require a Git checkout. Downloaded release folders support stable releases only.');
        const remote = await getJson(`https://api.github.com/repos/${UPDATE_REPOSITORY}/commits/main`);
        return { mode, installation: 'git', currentSha, latestSha: remote.sha, latestLabel: remote.sha.slice(0, 7), updateAvailable: remote.sha !== currentSha };
    }
    const release = await getJson(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`);
    if (!currentSha) {
        let installedVersion = '';
        try { installedVersion = String(JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || ''); } catch {}
        return { mode, installation: 'release-folder', currentSha: null, currentLabel: installedVersion || 'Downloaded release folder', latestSha: release.target_commitish, latestLabel: release.tag_name, releaseName: release.name || release.tag_name, releaseUrl: release.html_url, downloadUrl: release.zipball_url, updateAvailable: !installedVersion || !sameVersion(installedVersion, release.tag_name) };
    }
    let currentLabel = '';
    try {
        const result = await execFileAsync('git', ['describe', '--tags', '--exact-match', 'HEAD'], { cwd: __dirname });
        currentLabel = result.stdout.trim();
    } catch {}
    return { mode, installation: 'git', currentSha, currentLabel, latestLabel: release.tag_name, updateAvailable: release.tag_name !== currentLabel, releaseName: release.name || release.tag_name, releaseUrl: release.html_url, downloadUrl: release.zipball_url };
}

async function applyUpdate(mode) {
    if (!['release', 'nightly'].includes(mode)) throw new Error('Invalid update mode');
    const status = await getUpdateStatus(mode);
    if (!status.updateAvailable) return { ...status, updated: false, message: 'Already up to date.' };
    if (status.installation === 'release-folder') {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-update-'));
        const archivePath = path.join(tempDir, 'release.zip');
        const extractDir = path.join(tempDir, 'extract');
        try {
            performAutoBackup(true);
            await downloadFile(status.downloadUrl, archivePath);
            fs.mkdirSync(extractDir);
            new AdmZip(archivePath).extractAllTo(extractDir, true);
            const root = fs.readdirSync(extractDir, { withFileTypes: true }).find(entry => entry.isDirectory());
            if (!root) throw new Error('Release archive did not contain an application folder.');
            for (const entry of fs.readdirSync(path.join(extractDir, root.name))) {
                if (['config.json', 'data', 'node_modules'].includes(entry)) continue;
                fs.cpSync(path.join(extractDir, root.name, entry), path.join(__dirname, entry), { recursive: true, force: true });
            }
            await runNpmCi();
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        setTimeout(() => restartServer(), 500);
        return { ...status, updated: true, message: 'Release installed. StreamPulse is restarting.' };
    }
    const { stdout: changes } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: __dirname });
    if (changes.trim()) throw new Error('Update blocked: tracked local changes must be committed or stashed first.');
    performAutoBackup(true);
    try {
        await execFileAsync('git', ['fetch', '--tags', '--force', 'origin'], { cwd: __dirname });
    } catch {
        await execFileAsync('git', ['fetch', '--force', 'origin'], { cwd: __dirname });
    }
    if (mode === 'nightly') {
        await execFileAsync('git', ['checkout', 'main'], { cwd: __dirname });
        await execFileAsync('git', ['reset', '--hard', 'origin/main'], { cwd: __dirname });
    } else {
        await execFileAsync('git', ['checkout', status.latestLabel], { cwd: __dirname });
    }
    try {
        await runNpmCi();
    } catch (err) {
        throw new Error(`Dependencies failed to install: ${err.message}`);
    }
    setTimeout(() => {
        restartServer();
    }, 500);
    return { ...status, updated: true, message: 'Update installed. StreamPulse is restarting.' };
}




function performAutoBackup(force = false) {
    if (!force && !config.auto_backup_on_session_end) return;
    try {
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const backupPath = path.join(BACKUPS_DIR, `backup-${stamp}.zip`);
        const zip = new AdmZip();
        for (const f of getBackupFileSpecs()) {
            if (fs.existsSync(f.src)) zip.addLocalFile(f.src, path.dirname(f.dest), path.basename(f.dest));
        }
        if (fs.existsSync(SESSIONS_DIR)) {
            zip.addLocalFolder(SESSIONS_DIR, 'data/sessions');
        }
        if (fs.existsSync(CUSTOM_OVERLAY_ASSETS_DIR)) {
            zip.addLocalFolder(CUSTOM_OVERLAY_ASSETS_DIR, 'data/custom-overlay-assets');
        }
        if (fs.existsSync(CUSTOM_OVERLAY_HISTORY_DIR)) {
            zip.addLocalFolder(CUSTOM_OVERLAY_HISTORY_DIR, 'data/custom-overlay-history');
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
    chatData.viewerStats = createEmptyViewerStats();
    chatData.messageCount = 0;
    chatData.startedAt = new Date().toISOString();
    chatData.lastUpdated = null;
    chatLog = [];
    pendingChatLogEntries = [];
    try { if (fs.existsSync(CHAT_LOG_PATH)) fs.unlinkSync(CHAT_LOG_PATH); } catch {}
    saveChatData();
}


const alertEngine = createAlertEngine({
    dataDir: DATA_DIR,
    broadcast: (type, payload) => { broadcastToOverlays(type, payload); if (type === 'alert') takeoverPages('alert', payload?.ruleId, payload?.durationMs); },
    runTimerAction: (timerId, action, params) => applyTimerControl(getTimerOrThrow(timerId), action, params),
    log: message => console.log(message)
});


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
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};


async function generatePdf(htmlContent) {
    const puppeteer = require('puppeteer'); // loaded lazily; only PDF export needs it
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(async () => {
            /* global document */
            const images = Array.from(document.images || []);
            if (!images.length) return;

            await Promise.race([
                Promise.all(images.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(resolve => {
                        const finish = () => resolve();
                        img.addEventListener('load', finish, { once: true });
                        img.addEventListener('error', finish, { once: true });
                    });
                })),
                new Promise(resolve => setTimeout(resolve, 1500))
            ]);
        });
        const pdf = await page.pdf({ format: 'A4', margin: { top: '40px', bottom: '40px', left: '40px', right: '40px' }, printBackground: true });
        return pdf;
    } finally {
        await browser.close();
    }
}

let statusHeavyCache = null;


const crmService = createCrmService({
    dataDir: DATA_DIR,
    sessionsDir: SESSIONS_DIR,
    getStatsData: () => statsData,
    getChatData: () => chatData,
    getBroadcasterName: () => BROADCASTER_NAME,
    readJsonFileSafe
});

const handleTwitchRoutes = createTwitchRoutes({
    twitchService,
    getTwitchClientId: () => TWITCH_CLIENT_ID,
    getTwitchClientSecret: () => TWITCH_CLIENT_SECRET,
    getBroadcasterId: () => BROADCASTER_ID,
    getTwitchRedirectUri: () => TWITCH_REDIRECT_URI,
    getTwitchScopes: () => TWITCH_SCOPES,
    ensureToken,
    startDeviceAuth,
    pollDeviceAuth,
    clearToken,
    saveToken,
    twitchTokenRequest,
    fetchTwitchData,
    fetchStreamInfo,
    fetchViewerCount,
    fetchTwitchPoll,
    takeoverPages,
    broadcastToOverlays,
    getClipCandidates: () => clipService.getClipCandidates(),
    setClipCandidates: (arr) => { clipService.setClipCandidates(arr); },
    resolveCandidateVodUrls,
    addClipCandidate,
    normalizeClipCandidateConfig,
    getConfig: () => config,
    configPath: CONFIG_PATH,
    safeWriteFileSync,
    applyRuntimeConfig,
    backfillClipCandidates,
    isSessionActive: () => sessionActive,
    getChatData: () => chatData,
    twitchCreateClip,
    getTwitchAuthenticatedUserId,
    twitchCreateClipFromVod,
    saveClipCandidates,
    dataDir: DATA_DIR,
    getStatsData: () => statsData,
    readJsonFileSafe,
    subHistoryPath: SUB_HISTORY_PATH,
    followerHistoryPath: FOLLOWER_HISTORY_PATH
});

const handleSessionRoutes = createSessionRoutes({
    sessionService,
    ssnService,
    getChatData: () => chatData,
    getStatsData: () => statsData,
    setStatsData: (s) => { statsData = s; },
    getViewerSummary: () => getViewerSummary(),
    buildGoalsSnapshot: () => buildGoalsSnapshot(),
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data),
    resetChatData,
    saveChatData,
    saveStats,
    saveChatLog,
    bannedHashtags,
    saveBannedHashtags,
    sessionsDir: SESSIONS_DIR,
    generatePdf
});

const handleOverlayRoutes = createOverlayRoutes({
    overlayService,
    alertEngine,
    ALERT_TRIGGERS,
    ALERT_ANIM_IN,
    ALERT_ANIM_OUT,
    chatbot,
    slideshowStates,
    getOverlayClients: () => overlayClients,
    isLoopbackRequest,
    timerSoundUsers,
    creditsAssetUsers,
    gamePlanAssetUsers,
    rewriteTimerSoundReferences,
    rewriteGamePlanReferences,
    rewriteCreditsReferences,
    broadcastToOverlays,
    getChatData: () => chatData,
    getStatsData: () => statsData,
    listOverlayVisibility,
    setOverlayVisibility
});

const handleCrmRoutes = createCrmRoutes({
    crmService
});

function buildStatusSnapshot() {
    const nowMs = Date.now();
    if (!statusHeavyCache || nowMs - statusHeavyCache.at > 10000) {
        statusHeavyCache = {
            at: nowMs,
            archivedSessions: fs.existsSync(SESSIONS_DIR)
                ? fs.readdirSync(SESSIONS_DIR).filter(file => file.startsWith('chat-') && file.endsWith('.json')).length
                : 0,
            backupFiles: fs.existsSync(BACKUPS_DIR)
                ? fs.readdirSync(BACKUPS_DIR).filter(file => file.endsWith('.zip')).sort().reverse()
                : [],
            hashtagStats: collectHashtagStats(),
            categoryTotals: archivedCategoryMinutes()
        };
    }
    const { archivedSessions, backupFiles, hashtagStats, categoryTotals } = statusHeavyCache;
    const viewerSummary = getViewerSummary();
    const goalsSnapshot = buildGoalsSnapshot();
    return {
        customVars: variablesStore.list(),
        poll: twitchService.getLatestPoll(),
        processStartedAt: PROCESS_STARTED_AT,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        ssn: {
            connected: ssnSocket?.readyState === WebSocket.OPEN,
            session: SSN_SESSION_ID ? 'configured' : null,
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
            hasToken: !!twitchService.getAccessToken(),
            scopes: twitchService.getTokenScopes(),
            refreshMinutes: REFRESH_MINUTES
        },
        viewers: viewerSummary,
        music: {
            enabled: !!MUSIC_CONFIG.enabled,
            source: MUSIC_CONFIG.source || 'apple_music',
            ...musicService.getState(),
            positionAgeMs: musicService.getPolledAt() ? Date.now() - musicService.getPolledAt() : 0
        },
        stream: {
            title: chatData.streamInfo?.[chatData.streamInfo.length - 1]?.title || '',
            category: currentCategoryStats(categoryTotals),
            game: publicGameInfo(chatData.streamInfo?.[chatData.streamInfo.length - 1]?.category)
        },
        goals: goalsSnapshot.summary,
        goalMetrics: goalsSnapshot.metrics,
        milestones: computeMilestones(),
        timers: timerService.getStats(),
        library: {
            highlights: highlights.length,
            sessions: archivedSessions,
            clipCandidates: clipService.getClipCandidates().length
        },
        hashtags: hashtagStats.summary,
        popularHashtags: {
            overall: hashtagStats.hashtags.slice(0, 10).map(item => ({ tag: item.tag, count: item.count })),
            session: hashtagStats.hashtags.slice().sort((a, b) => b.sessionCount - a.sessionCount || a.tag.localeCompare(b.tag)).slice(0, 10).map(item => ({ tag: item.tag, count: item.sessionCount }))
        },
        backups: {
            autoEnabled: !!config.auto_backup_on_session_end,
            count: backupFiles.length,
            latest: backupFiles[0] || null
        },
        chatbot: chatbot.getStats ? chatbot.getStats() : { enabled: false, commandsCount: 0, timedCount: 0, quotesCount: 0, triggersCount: 0 },
        alerts: {
            enabled: alertEngine ? (alertEngine.getConfig()?.enabled !== false) : false,
            rulesCount: alertEngine ? (alertEngine.getConfig()?.rules?.length || 0) : 0,
            queuePending: alertEngine ? (alertEngine.getQueueState()?.pending || 0) : 0,
            paused: alertEngine ? (alertEngine.getQueueState()?.paused || false) : false
        },
        modules: {
            chatbot: config.chatbot_enabled !== false,
            clips: config.clip_candidates?.enabled !== false,
            weather: config.weather?.enabled === true,
            music: !!MUSIC_CONFIG.enabled,
            hashtags: config.hashtags_enabled !== false
        },
        overlayClients: overlayClients.size,
        sessionActive,
        lifecycle: getLifecycleStatus(),
        sessionPhase: getSessionPhase(),
        streamStartedAt: normalizeViewerStats(chatData.viewerStats).streamStartedAt || null,
        lastSessionEndedAt: sessionService.getLifecycleMemo?.()?.lastArchive?.endedAt ? new Date(sessionService.getLifecycleMemo().lastArchive.endedAt).toISOString() : null,
        startedAt: chatData.startedAt,
        hourlyMessages: chatData.hourlyMessages,
        streamInfo: chatData.streamInfo,
        topChatters: Object.values(chatData.chatters)
            .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
            .slice(0, 100)
            .map(c => ({ chatname: c.chatname, chatimg: c.chatimg || '', messageCount: c.messageCount || 0 })),
        recentChat: recentChatSummary(),
        recentEvents: buildRecentEvents(12)
    };
}

async function handleShutdown() {
    const streamEndedAt = finalizeSessionStreamEnd();
    saveChatData();
    saveStats();
    saveChatLog();
    const archiveName = archiveSession();
    resetChatData();
    console.log('[API] Shutdown requested');
    setTimeout(() => {
        if (ssnSocket) ssnSocket.close();
        server.close();
        console.log('[Server] Goodbye!');
        process.exit(0);
    }, 500);
    return { status: 'shutting_down', archived: archiveName, streamEndedAt, message: 'Server shutting down...' };
}

function handleRestart() {
    saveChatData();
    saveStats();
    saveChatLog();
    console.log('[API] Restart requested');
    setTimeout(() => restartServer(), 100);
    return { status: 'restarting', message: 'StreamPulse is restarting and will resume the active session.' };
}

const handleSystemRoutes = createSystemRoutes({
    rootDir: __dirname,
    configPath: CONFIG_PATH,
    getConfig: () => config,
    safeWriteFileSync,
    applyRuntimeConfig,
    getRestartRequiredConfigChanges,
    normalizeViewerTrackingConfig,
    normalizeWeatherConfig,
    normalizeGoalsConfig,
    normalizeClipCandidateConfig,
    defaultGoalsConfig: DEFAULT_GOALS_CONFIG,
    getBroadcasterName: () => BROADCASTER_NAME,
    port: PORT,
    getTwitchClientId: () => TWITCH_CLIENT_ID,
    getTwitchClientSecret: () => TWITCH_CLIENT_SECRET,
    refreshMinutes: REFRESH_MINUTES,
    streamInfoPollSeconds: STREAM_INFO_POLL_SECONDS,
    isLoopbackRequest,
    getStatus: buildStatusSnapshot,
    onShutdown: handleShutdown,
    onRestart: handleRestart,
    getUpdateStatus,
    applyUpdate
});

const handleHighlightsRoutes = createHighlightsRoutes({
    getHighlights: () => highlights,
    setHighlights: (arr) => { highlights = arr; },
    saveHighlights,
    getChatLog: () => chatLog,
    getChatData: () => chatData,
    getClipCandidateConfig: () => CLIP_CANDIDATE_CONFIG,
    clipSessionOverrideForName,
    addClipCandidate,
    buildChatPdfHtml,
    generatePdf,
    localDateTimeStr
});

function handleRestoreReload({ previousConfig }) {
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

    let restartFields = [];
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const restoredConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            restartFields = getRestartRequiredConfigChanges(previousConfig, restoredConfig);
            applyRuntimeConfig(restoredConfig);
            console.log('[Restore] Reloaded config');
        }
    } catch { /* ignore */ }

    loadHighlights();
    loadClipCandidates();
    loadTimers();
    loadCustomOverlays();
    loadCurrentSessionStateFromDisk();
    broadcastToOverlays('update', chatData);
    broadcastToOverlays('timers-snapshot', buildTimersSnapshot());

    return { restartFields };
}

const handleBackupRoutes = createBackupRoutes({
    rootDir: __dirname,
    dataDir: DATA_DIR,
    configPath: CONFIG_PATH,
    backupsDir: BACKUPS_DIR,
    sessionsDir: SESSIONS_DIR,
    customOverlayAssetsDir: CUSTOM_OVERLAY_ASSETS_DIR,
    customOverlayHistoryDir: CUSTOM_OVERLAY_HISTORY_DIR,
    getBackupFileSpecs,
    listShareItems,
    buildShareZip,
    openShareZip,
    importShareZip,
    onRestore: handleRestoreReload,
    getConfig: () => config,
    getCustomOverlays: () => customOverlays,
    getOverlayPresets: () => overlayService.getOverlayPresets(),
    sanitizeOverlayId,
    shareSingles: SHARE_SINGLES
});

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pathname = url.pathname;

        // Auto-enforce strict anti-caching headers on dynamic API and auth endpoints
        // to prevent WebKit / Safari from ballooning memory to 6-12GB by caching thousands of polled JSON responses
        if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
            const origWriteHead = res.writeHead;
            res.writeHead = function(statusCode, statusMessage, headers) {
                let h = typeof statusMessage === 'object' && statusMessage !== null ? statusMessage : headers;
                if (!h) {
                    this.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
                    this.setHeader('Pragma', 'no-cache');
                    this.setHeader('Expires', '0');
                } else {
                    if (!h['Cache-Control'] && !h['cache-control']) {
                        h['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
                    }
                    if (!h['Pragma'] && !h['pragma']) {
                        h['Pragma'] = 'no-cache';
                    }
                    if (!h['Expires'] && !h['expires']) {
                        h['Expires'] = '0';
                    }
                }
                return origWriteHead.apply(this, arguments);
            };
        }

    // Rate limiting
    if (checkRateLimit(req, res)) return;

    if (await handleTwitchRoutes(req, res, url, pathname)) return;

    if (await handleOverlayRoutes(req, res, url, pathname)) return;

    if (await handleSystemRoutes(req, res, url, pathname)) return;



    if (pathname.startsWith('/api/variables') && await variablesStore.handleApi(req, res, pathname, readRequestBody)) return;
    if (pathname.startsWith('/api/chatbot') && await chatbot.handleApi(req, res, pathname, readRequestBody)) return;

    if (await handleSessionRoutes(req, res, url, pathname)) return;

    if (await handleGoalsRoutes(req, res, pathname)) return;


    if (await handleCrmRoutes(req, res, url, pathname)) return;



    if (await handleMusicRoutes(req, res, pathname)) return;

    if (await handleTimersRoutes(req, res, pathname)) return;

    if (await handleWeatherRoutes(req, res, url, pathname)) return;

    if (await handleGamePlanRoutes(req, res, pathname)) return;





    if (await handleBackupRoutes(req, res, url, pathname)) return;

    if (await handleHighlightsRoutes(req, res, url, pathname)) return;

    // Static file serving via cascading static router
    if (staticRouter.handleRequest(req, res)) {
        return;
    }
    } catch (serverErr) {
        console.error(`[Server] Request handler error on ${req.method} ${req.url}:`, serverErr);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: serverErr.message || 'Internal Server Error' }));
        } else {
            res.end();
        }
    }
});

// ============================================================================
// STARTUP
// ============================================================================

console.log('============================================');
console.log('  StreamPulse Server');
console.log('============================================');

// WebSocket server for live overlay push
const overlayWss = wsService.attachServer(server);

// Node's 5s default keep-alive closes sockets Safari still tries to reuse, which stalls requests until the browser is restarted.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, () => {
    console.log(`  HTTP:      http://localhost:${PORT}`);
    console.log(`  Credits:   http://localhost:${PORT}/credits.html`);
    console.log(`  Stats:     http://localhost:${PORT}/stats.html`);
    console.log(`  Hashtags:  http://localhost:${PORT}/hashtags.html`);
    console.log(`  Goal:      http://localhost:${PORT}/goal.html`);
    console.log(`  Viewers:   http://localhost:${PORT}/viewers.html`);
    console.log(`  Countdown: http://localhost:${PORT}/countdown.html`);
    console.log(`  Stopwatch: http://localhost:${PORT}/stopwatch.html`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`  Sessions:  http://localhost:${PORT}/sessions.html`);
    console.log(`  Goals:     http://localhost:${PORT}/goals-editor.html`);
    console.log(`  Export:    http://localhost:${PORT}/api/export?type=all`);
    console.log(`  WebSocket: ws://localhost:${PORT} (overlay push)`);
    console.log('============================================\n');

    // Restore the active session after a process restart. A new session is
    // created explicitly through /api/start-session or /api/end-session.
    loadCurrentSessionStateFromDisk();
    if (chatData.messageCount > 0 || chatLog.length > 0) {
        sessionActive = true;
        console.log(`[Startup] Resumed session from ${chatData.startedAt}`);
    } else {
        if (normalizeLifecycleConfig(config.session_lifecycle).auto) {
            sessionActive = false;
            console.log('[Startup] No session data; waiting for the stream to go live to start one');
        } else {
            console.log('[Startup] No active session data to resume');
        }
    }

    // Load persistent stats
    loadStats();
    loadTimers();
    startTimerTicker();

    // Start SSN collector
    connectSSN();
    connectFeaturedListener();

    // Load stored Twitch token and fetch data
    loadStoredToken();
    if (twitchService.getAccessToken()) {
        fetchTwitchData();
        fetchStreamInfo();
        fetchViewerCount();
        fetchTwitchPoll();
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
        }, REFRESH_MINUTES * 60 * 1000).unref();
        console.log(`[Twitch] Auto-refresh every ${REFRESH_MINUTES} minutes`);
    }
    // Title and category are cheap to poll, so they stay near real time.
    setInterval(fetchStreamInfo, STREAM_INFO_POLL_SECONDS * 1000).unref();
    // Poll for active/completed Twitch polls every 10 seconds.
    setInterval(fetchTwitchPoll, 10 * 1000).unref();
    // Keep the token fresh in the background so an idle server never lets it lapse.
    setInterval(() => { if (twitchService.getRefreshToken() && Date.now() > twitchService.getTokenExpiry() - 30 * 60000) refreshTwitchToken(); }, 5 * 60000).unref();

    startViewerTracking();
    startLifecycleWatcher();

    // Save chat/stats/log to disk every 5 seconds
    setInterval(() => {
        saveChatData();
        saveStats();
        saveChatLog();
    }, 5000).unref();

    scheduleWeather();

    // Start music polling if enabled
    if (MUSIC_CONFIG.enabled) {
        startMusicPolling();
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[Server Error] Port ${PORT} is already in use by another program or StreamPulse instance.`);
        console.error(`Please stop the running process or choose a different port in config.json.\n`);
    } else {
        console.error('[Server Error]', err);
    }
});

// Graceful shutdown
function gracefulShutdown(signal, shouldExit = true) {
    console.log(`\n[Server] Received ${signal}. Shutting down...`);
    try { finalizeSessionStreamEnd(); } catch { /* ignore */ }
    try { saveChatData(); } catch { /* ignore */ }
    try { saveStats(); } catch { /* ignore */ }
    try { saveChatLog(); } catch { /* ignore */ }
    try {
        const archiveName = archiveSession();
        if (archiveName) console.log(`[Server] Session archived: ${archiveName}`);
    } catch { /* ignore */ }
    try { resetChatData(); } catch { /* ignore */ }
    try { if (ssnSocket) ssnSocket.close(); } catch { /* ignore */ }
    try {
        if (server && server.listening) {
            if (typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            server.close();
        }
    } catch { /* ignore */ }
    console.log('[Server] Data saved. Goodbye!');
    if (shouldExit) process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});

module.exports = {
    server,
    gracefulShutdown,
    port: PORT
};
