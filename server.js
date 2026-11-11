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
const { createPromoService } = require('./server/services/promos');
const { createPromoShareService } = require('./server/services/promo-share');
const { createShareAssetCodec } = require('./server/services/share-assets');
const { createPromoArtworkService } = require('./server/services/promo-artwork');
const { createPromoRoutes } = require('./server/routes/promos');
const { createTwitchRoutes } = require('./server/routes/twitch');
const { createSessionRoutes } = require('./server/routes/session');
const { createOverlayRoutes } = require('./server/routes/overlays');
const { createOverlayService, TEXT_SOURCE_TYPES, TEXT_SOURCE_EXTS, TEXT_SOURCE_MAX_BYTES, CUSTOM_OVERLAY_ELEMENT_TYPES } = require('./server/services/overlays');
const { createClipService, normalizeClipCandidateConfig, DEFAULT_CLIP_CANDIDATE_CONFIG } = require('./server/services/clips');
const { createPollService } = require('./server/services/polls');
const { createMatchupService } = require('./server/services/matchup');
const { createTierListService } = require('./server/services/tier-list');
const { createTierListRoutes } = require('./server/routes/tier-list');
const { createTriviaService } = require('./server/services/trivia');
const { createTriviaRoutes } = require('./server/routes/trivia');
const { createSubathonService } = require('./server/services/subathon');
const { createSubathonRoutes } = require('./server/routes/subathon');
const { safeWriteFileSync, escapeHtml } = require('./server/routes/helpers');
const { createCrmService } = require('./server/services/crm');
const { createUserModerationService } = require('./server/services/user-moderation');
const { createMessageDeletionService } = require('./server/services/message-deletions');
const { createCrmRoutes } = require('./server/routes/crm');
const { createSystemRoutes } = require('./server/routes/system');
const { createHighlightsRoutes } = require('./server/routes/highlights');
const { createBackupRoutes } = require('./server/routes/backup');
const { createBackupService, buildBackupFileSpecs } = require('./server/services/backup');
const { normalizeSsnSessionId } = require('./server/ssn-config');
const { createUpdateService } = require('./server/services/updates');
const { createObsService, normalizeObsConfig } = require('./server/services/obs');
const { createObsRoutes } = require('./server/routes/obs');
const { createRateLimiter } = require('./server/services/rate-limit');
const { createGameInfoService, infoKey, GAME_INFO_VERSION } = require('./server/services/game-info');
const { createShareBundleService } = require('./server/services/share-bundle');
const { createStatusService } = require('./server/services/status');
const { generatePdf } = require('./server/services/pdf');
const execFileAsync = promisify(execFile);
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
    if (process.env.STREAMPULSE_EMBEDDED === 'true') throw new Error(`StreamPulse config not found at ${CONFIG_PATH}`);
    process.exit(1);
}

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = Number(process.env.PORT) || config.port || 3000;
const cleanConfigValue = v => { const t = String(v ?? '').trim(); return /^YOUR_/i.test(t) ? '' : t; };
let BROADCASTER_ID = cleanConfigValue(config.broadcaster_id);
let BROADCASTER_NAME = cleanConfigValue(config.broadcaster_name);
let EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
// Shared public Twitch app (device-code flow, no secret). Users can still supply their own client_id/client_secret.
const TWITCH_CLIENT_ID = cleanConfigValue(config.twitch?.client_id) || DEFAULT_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = cleanConfigValue(config.twitch?.client_secret);
const TWITCH_SCOPES = DEFAULT_TWITCH_SCOPES;
const TWITCH_REDIRECT_URI = config.twitch?.redirect_uri || `http://localhost:${PORT}/auth/callback`;
const SSN_SESSION_ID = normalizeSsnSessionId(config.ssn?.session_id);
const SSN_SERVER = config.ssn?.server || 'wss://io.socialstream.ninja';
const REFRESH_MINUTES = config.twitch_refresh_minutes || 10;
const STREAM_INFO_POLL_SECONDS = Math.max(10, config.twitch_stream_info_seconds || 30);
const MUSIC_CONFIG = config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 };
const VIEWER_TRACKING_CONFIG = config.viewer_tracking || { enabled: true, source: 'best_available', poll_seconds: 60, retain_samples: 720 };

const ACTIVE_SUBS_ONLY = config.active_subs_only || false; // only show subs who chatted
const DATA_DIR = process.env.STREAMPULSE_DATA_DIR || path.join(__dirname, 'data');
const messageDeletions = createMessageDeletionService({
    dataDir: DATA_DIR,
    getConfig: () => config,
    getBroadcasterId: () => BROADCASTER_ID,
    getSsnSessionId: () => SSN_SESSION_ID,
    getSessionStartedAt: () => chatData.startedAt,
    getSessionName: () => `chat-${localDateTimeStr(chatData.startedAt)}.json`,
    getCurrentMessages: () => ssnService.getCurrentChatLogEntries(),
    safeWriteFileSync,
    onChange: () => {
        statusService.invalidateHeavyCache();
        sessionService.invalidatePresentation();
        broadcastToOverlays('moderation-update', {});
        broadcastToOverlays('update', chatData);
    }
});
const userModeration = createUserModerationService({
    dataDir: DATA_DIR,
    getConfig: () => config,
    getBroadcasterId: () => BROADCASTER_ID,
    ensureToken: () => twitchService.ensureToken(),
    getTokenScopes: () => twitchService.getTokenScopes(),
    request: (endpoint, params) => twitchService.twitchApiRequest(endpoint, params),
    safeWriteFileSync,
    isDeleted: record => messageDeletions.isDeleted(record),
    onChange: () => {
        statusService.invalidateHeavyCache();
        sessionService.invalidatePresentation();
        broadcastToOverlays('update', chatData);
    }
});
const isLoopbackRequest = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const backgroundIntervals = new Set();
function repeatBackground(fn, delay) {
    const timer = setInterval(fn, delay);
    timer.unref();
    backgroundIntervals.add(timer);
}

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
const CUSTOM_OVERLAY_THUMBNAILS_DIR = overlayService.customOverlayThumbnailsDir;
const CUSTOM_OVERLAY_HISTORY_LIMIT = overlayService.customOverlayHistoryLimit;
const takeoverPages = (kind, name, ms, poll) => overlayService.takeoverPages(kind, name, ms, poll);
const assetReferencedIn = (text, name, family) => overlayService.assetReferencedIn(text, name, family);
const rewriteAssetReferences = (text, oldName, newName, oldFamily, newFamily) => overlayService.rewriteAssetReferences(text, oldName, newName, oldFamily, newFamily);
const normalizeCustomOverlay = (input, idOverride) => overlayService.normalizeCustomOverlay(input, idOverride);
const normalizeOverlayPresets = (list) => overlayService.normalizeOverlayPresets(list);
const saveCustomOverlays = () => overlayService.saveCustomOverlays();
const loadCustomOverlays = () => overlayService.loadCustomOverlays();
const loadOverlayPresets = () => overlayService.loadOverlayPresets();
const loadAssetTags = () => overlayService.loadAssetTags();
const loadAssetCaptions = () => overlayService.loadAssetCaptions();
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
    getCustomOverlays: () => customOverlays,
    dataDir: DATA_DIR,
    filterData: data => userModeration.filterData(data),
    filterRecords: records => userModeration.filterRecords(records)
});

const variablesStore = require('./server/services/variables')({ dataDir: DATA_DIR });
const chatbot = require('./server/services/chatbot')({ dataDir: DATA_DIR, getConfig: () => config, port: Number(process.env.PORT) || Number(config.port) || 3000, variables: variablesStore, onUse: (kind, name) => takeoverPages('command', name), sessionKey: () => String(chatData.startedAt || '') });
const LIVE_CHAT_PATH = path.join(DATA_DIR, 'chat.json');
const BANNED_HASHTAGS_PATH = path.join(DATA_DIR, '.banned-hashtags.json');
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat-log.jsonl');
const HIGHLIGHTS_PATH = path.join(DATA_DIR, 'highlights.jsonl');
const CLIP_CANDIDATES_PATH = path.join(DATA_DIR, 'clip-candidates.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const backupService = createBackupService({ backupsDir: BACKUPS_DIR });
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
    getChatData: () => userModeration.filterData(chatData),
    getMusicConfig: () => MUSIC_CONFIG,
    getMusicState: () => musicService.getState(),
    getViewerSummary: () => getViewerSummary(),
    buildGoalsSnapshot: () => buildGoalsSnapshot(),
    buildTimersSnapshot: () => buildTimersSnapshot(),
    getLatestPoll: () => (pollService ? pollService.getLatestPoll() : twitchService.getLatestPoll()),
    getTournament: () => (pollService ? pollService.getTournament({ isPoll: false }) : null),
    getPollTournament: () => (pollService ? pollService.getTournament({ isPoll: true }) : null),
    getMatchup: () => (matchupService ? matchupService.getMatchup() : null),
    listOverlayVisibility: () => listOverlayVisibility(),
    log: console.log
});
const obsService = createObsService({
    getConfig: () => config?.obs || {},
    isSpeakerBadgesEnabled: () => config?.speaker_badges_enabled === true,
    isSceneSyncEnabled: () => config?.obs_scene_sync_enabled !== false,
    onAudioMeter: data => wsService.broadcastToOverlays('obs-audio-meter', data),
    onStatusChange: status => wsService.broadcastToOverlays('obs-status', status),
    log: console.log,
    warn: console.warn
});
const broadcastToOverlays = (type, payload) => {
    if (type === 'update' || type === 'snapshot') payload = userModeration.filterData(payload);
    if (['chat-message', 'featured-chat', 'alert'].includes(type) && userModeration.isBanned(payload?.user || payload?.chatname, payload?.userId)) return;
    if (config?.obs_scene_sync_enabled !== false && config?.obs?.syncOnSave !== false && type === 'custom-overlay-page' && payload?.id && payload?.page && customOverlays[payload.id]) {
        if (obsService.getStatus().activeEngine === 'frame-sync') {
            // Overlay and OBS share one scheduled start time, so neither needs a guessed offset.
            const leadMs = Math.max(50, Math.min(500, Number(config?.obs?.leadMs) || 120));
            const startAt = Date.now() + leadMs;
            wsService.broadcastToOverlays(type, { ...payload, transition: { startAt, serverNow: Date.now() } });
            obsService.syncOverlayState(customOverlays[payload.id], payload.page, { animate: true, startAt }).catch(() => {});
            return;
        }
        // Positive overlayOffsetMs delays the overlay after OBS starts moving; negative sends the overlay first and delays OBS.
        const offset = Math.max(-1000, Math.min(1000, Number(config?.obs?.overlayOffsetMs) || 0));
        const overlay = customOverlays[payload.id];
        if (offset < 0) {
            wsService.broadcastToOverlays(type, payload);
            setTimeout(() => obsService.syncOverlayState(overlay, payload.page, { animate: true }).catch(() => {}), -offset);
            return;
        }
        let sent = false;
        const send = () => { if (sent) return; sent = true; setTimeout(() => wsService.broadcastToOverlays(type, payload), offset); };
        setTimeout(send, 800);
        obsService.syncOverlayState(overlay, payload.page, { animate: true, onMotionStart: send }).catch(() => {}).finally(send);
        return;
    }
    wsService.broadcastToOverlays(type, payload);
    if (type === 'custom-overlay-update' && payload?.overlay && config?.obs_scene_sync_enabled !== false && config?.obs?.syncOnSave !== false) {
        const curPage = pageSnapshot(payload.overlay)?.page || '';
        obsService.syncOverlayState(payload.overlay, curPage, { animate: false }).catch(() => {});
    }
};
const slideshowStates = wsService.slideshowStates;
const overlayClients = wsService.overlayClients;

const ssnService = createSsnService({
    messageDeletions,
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
    getBannedUsers: () => userModeration.bannedNames(),
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
    pollService: () => pollService,
    tierListService: () => tierListService,
    triviaService: () => triviaService,
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

const subathonService = createSubathonService({
    dataDir: DATA_DIR,
    getConfig: () => config,
    timerService,
    broadcastToOverlays: (type, data) => broadcastToOverlays(type, data),
    onSubathonEvent: (evt) => {
        if (typeof chatbot !== 'undefined' && chatbot?.announceSubathonAddition) {
            chatbot.announceSubathonAddition(evt);
        }
    },
    safeWriteFileSync
});
const handleSubathonRoutes = createSubathonRoutes({ subathonService });

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
    enableEventSub: true,
    getClientId: () => TWITCH_CLIENT_ID,
    getClientSecret: () => TWITCH_CLIENT_SECRET,
    getBroadcasterId: () => BROADCASTER_ID,
    getBroadcasterName: () => BROADCASTER_NAME,
    getRedirectUri: () => TWITCH_REDIRECT_URI,
    getChatData: () => chatData,
    readJsonFileSafe,
    safeWriteFileSync,
    getSubscriptionMonths: name => Number(statsData.subTenure?.[String(name || '').toLowerCase()]?.months) || 0,
    onBroadcasterSynced: async (user) => {
        const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        current.broadcaster_id = user.id;
        if (!cleanConfigValue(current.broadcaster_name)) current.broadcaster_name = user.login;
        BROADCASTER_ID = user.id;
        if (!BROADCASTER_NAME) BROADCASTER_NAME = user.login;
        safeWriteFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    },
    onStreamInfoChange: (category) => refreshGameInfo(category),
    onPollUpdate: (pollData) => {
        if (pollService && pollService.getActivePoll()) return;
        broadcastToOverlays('poll-update', pollData);
    },
    onTakeover: (action, title, duration, poll) => takeoverPages(action, title, duration, poll),
    onViewerCountUpdate: () => fetchViewerCount(),
    onFollow: (data) => {
        if (userModeration.isBanned(data.user, data.userId)) return;
        if (typeof alertEngine !== 'undefined' && alertEngine) alertEngine.handleEvent({ type: 'follow', user: data.user });
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) subathonService.processEvent({ type: 'follow', user: data.user });
    },
    onSubscribe: (data) => {
        if (userModeration.isBanned(data.user, data.userId)) return;
        if (typeof alertEngine !== 'undefined' && alertEngine) alertEngine.handleEvent({ type: (data.months && data.months > 1) ? 'resub' : 'sub', user: data.user, tier: data.tier, months: data.months, message: data.message });
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) subathonService.processEvent({ type: (data.months && data.months > 1) ? 'resub' : 'sub', user: data.user, tier: data.tier, months: data.months });
    },
    onGiftSub: (data) => {
        if (userModeration.isBanned(data.user, data.userId)) return;
        if (typeof alertEngine !== 'undefined' && alertEngine) alertEngine.noteGift({ user: data.user, count: data.total, tier: data.tier });
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) subathonService.processEvent({ type: 'gift', user: data.user, count: data.total, tier: data.tier });
    },
    onCheer: (data) => {
        if (userModeration.isBanned(data.user, data.userId)) return;
        if (typeof alertEngine !== 'undefined' && alertEngine) alertEngine.handleEvent({ type: 'bits', user: data.user, amount: data.bits, message: data.message });
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) subathonService.processEvent({ type: 'bits', user: data.user, amount: data.bits });
    },
    onRedemption: (data) => {
        if (userModeration.isBanned(data.user, data.userId)) return;
        if (typeof alertEngine !== 'undefined' && alertEngine) alertEngine.handleEvent({ type: 'redeem', user: data.user, reward: data.rewardTitle, rewardId: data.rewardId, cost: data.cost, message: data.userInput });
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) subathonService.processEvent({ type: 'channel_points', user: data.user, rewardTitle: data.rewardTitle });
    },
    onHypeTrain: (data) => {
        if (typeof alertEngine === 'undefined' || !alertEngine) return;
        const key = data.id || 'train';
        if (data.phase === 'start') hypeLevels.set(key, data.level);
        if (data.phase === 'progress') {
            if (data.level <= (hypeLevels.get(key) || 1)) return;
            hypeLevels.set(key, data.level);
        }
        const phase = data.phase === 'progress' ? 'levelup' : data.phase;
        if (phase === 'end') hypeLevels.delete(key);
        const seconds = data.startedAt && data.endedAt ? Math.max(0, Math.round((Date.parse(data.endedAt) - Date.parse(data.startedAt)) / 1000)) : 0;
        alertEngine.handleEvent({ type: 'hype_train', phase, level: data.level, amount: data.level, total: data.total, goal: data.goal, user: data.topUser, seconds, golden: data.isGolden });
    },
    onStreamOnline: () => {
        if (typeof sessionService !== 'undefined' && sessionService?.pollLifecycle) sessionService.pollLifecycle(true);
    },
    onStreamOffline: () => {
        if (typeof sessionService !== 'undefined' && sessionService?.pollLifecycle) sessionService.pollLifecycle(true);
    },
    onRaid: (data) => {
        const username = data.fromBroadcasterName || data.fromBroadcasterLogin || 'Someone';
        const viewers = Number(data.viewers) || 0;
        if (userModeration.isBanned(username, data.fromBroadcasterId)) return;
        if (typeof alertEngine !== 'undefined' && alertEngine) {
            alertEngine.handleEvent({ type: 'raid', user: username, amount: viewers, viewers });
        }
        if (typeof chatbot !== 'undefined' && chatbot?.handleRaid) {
            chatbot.handleRaid({ user: username, viewers }).catch(() => {});
        }
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) {
            subathonService.processEvent({ type: 'raid', user: username, viewers });
        }
        if (chatData) {
            if (!chatData.raids) chatData.raids = [];
            const alreadyRaided = chatData.raids.some(r => r.chatname === username && Date.now() - r.timestamp < 60000);
            if (!alreadyRaided) {
                chatData.raids.push({ chatname: username, viewers: viewers || null, timestamp: Date.now() });
                if (statsData) {
                    const today = localDateString(new Date());
                    const nowISO = new Date().toISOString();
                    if (!statsData.raids) statsData.raids = {};
                    if (!statsData.raids[username]) {
                        statsData.raids[username] = { firstSeen: nowISO, lastSeen: nowISO, days: {} };
                    }
                    statsData.raids[username].days[today] = (statsData.raids[username].days[today] || 0) + 1;
                    statsData.raids[username].lastSeen = nowISO;
                }
                broadcastToOverlays('update', chatData);
            }
        }
    },
    onModerationEvent: event => userModeration.onModerationEvent(event),
    onChatMessage: message => messageDeletions.observeTwitch(message),
    onChatDeletion: event => messageDeletions.handleTwitch(event)
});
const hypeLevels = new Map();
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
    getChatData: () => userModeration.filterData(chatData),
    getStatsData: () => userModeration.filterData(statsData),
    getViewerSummary: () => getViewerSummary(),
    readJsonFileSafe: (file, fallback) => userModeration.filterData(readJsonFileSafe(file, fallback)),
    onGoalAlert: (event) => alertEngine.handleEvent(event)
});
const buildGoalsSnapshot = () => goalsService.buildGoalsSnapshot();
const buildGoalMetrics = () => goalsService.buildGoalMetrics();
const resetGoalBaseline = goalId => goalsService.resetGoalBaseline(goalId);
const toggleGoalEnabled = (goalId, mode) => goalsService.toggleGoalEnabled(goalId, mode);
const buildRecentEvents = limit => goalsService.buildRecentEvents(limit);
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

const rateLimiter = createRateLimiter({ getConfig: () => config });
const checkRateLimit = (req, res) => rateLimiter.checkRateLimit(req, res);
const pruneRateLimits = () => rateLimiter.pruneRateLimits();

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
    filterData: data => userModeration.filterData(data),
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
    isEventSubActive: () => (typeof twitchService !== 'undefined' && twitchService ? twitchService.isEventSubActive() : false),
    isSessionActive: () => sessionActive,
    setSessionActive: (val) => { sessionActive = !!val; },
    onArchivesInvalidated: () => { if (typeof statusService !== 'undefined' && statusService) statusService.invalidateHeavyCache(); }
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

const gameInfoService = createGameInfoService({
    dataDir: DATA_DIR,
    getTwitchClientId: () => TWITCH_CLIENT_ID,
    getTwitchClientSecret: () => TWITCH_CLIENT_SECRET,
    ensureTwitchToken: () => ensureToken(),
    getTwitchAccessToken: () => twitchService.getAccessToken(),
    error: console.error
});
const getAppToken = () => gameInfoService.getAppToken();
const refreshGameInfo = (name, igdbId) => gameInfoService.refreshGameInfo(name, igdbId);
const publicGameInfo = (name, igdbId) => gameInfoService.publicGameInfo(name, igdbId);
const gameInfoCache = gameInfoService.getCache();


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
    const prevSsnId = config.ssn?.session_id;
    const prevSsnServer = config.ssn?.server;
    const prevObs = normalizeObsConfig(config.obs);

    const prevLifecyclePoll = normalizeLifecycleConfig(config.session_lifecycle).poll_seconds;
    config = nextConfig;
    const nextObs = normalizeObsConfig(config.obs);
    if (prevObs.enabled !== nextObs.enabled || prevObs.host !== nextObs.host || prevObs.port !== nextObs.port || prevObs.password !== nextObs.password) {
        obsService.disconnect();
        if (nextObs.enabled) obsService.connect();
    }
    obsService.refreshModules();
    if (normalizeLifecycleConfig(config.session_lifecycle).poll_seconds !== prevLifecyclePoll) startLifecycleWatcher();
    if (prevSsnId !== config.ssn?.session_id || prevSsnServer !== config.ssn?.server) {
        ssnService.disconnectSSN();
        ssnService.connectSSN();
        ssnService.connectFeaturedListener();
    }
    EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
    userModeration.configChanged();

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


const getBackupFileSpecs = () => buildBackupFileSpecs({ dataDir: DATA_DIR, configPath: CONFIG_PATH });

let restartPromise = null;
function restartServer() {
    if (restartPromise) return restartPromise;
    restartPromise = (async () => {
        await stopServer({ preserveSession: true });
        if (process.env.STREAMPULSE_DESKTOP === 'true') {
            await startServer();
            return;
        }
        launchReplacement();
    })().finally(() => { restartPromise = null; });
    return restartPromise;
}

function launchReplacement() {
    const child = require('child_process').spawn(process.execPath, process.argv.slice(1), {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
    process.exit(0);
}

const { getUpdateInfo, getUpdateStatus, applyUpdate } = createUpdateService({
    rootDir: __dirname,
    packaged: process.env.STREAMPULSE_PACKAGED === 'true',
    execFileAsync,
    performAutoBackup,
    runNpmCi,
    restartServer
});




async function performAutoBackup(force = false) {
    if (!force && !config.auto_backup_on_session_end) return;
    try {
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const backupPath = path.join(BACKUPS_DIR, `backup-${stamp}.zip`);
        const { removed } = await backupService.autoBackup({
            backupPath,
            files: getBackupFileSpecs(),
            folders: [
                { src: SESSIONS_DIR, dest: 'data/sessions' },
                { src: CUSTOM_OVERLAY_ASSETS_DIR, dest: 'data/custom-overlay-assets' },
                { src: CUSTOM_OVERLAY_HISTORY_DIR, dest: 'data/custom-overlay-history' },
                ...(CUSTOM_OVERLAY_THUMBNAILS_DIR ? [{ src: CUSTOM_OVERLAY_THUMBNAILS_DIR, dest: 'data/custom-overlay-thumbnails' }] : [])
            ]
        });
        console.log(`[Backup] Auto-backup saved → ${backupPath}`);
        for (const oldest of removed) console.log(`[Backup] Removed old backup: ${oldest}`);
    } catch (err) {
        console.warn(`[Backup] Auto-backup failed: ${err.message}`);
        throw err;
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
    broadcast: (type, payload) => {
        // Mount triggered alert pages before delivering the alert that their elements must play.
        if (type === 'alert') takeoverPages('alert', payload?.ruleId, payload?.durationMs);
        broadcastToOverlays(type, payload);
        if (type === 'alert-skip' || type === 'alert-clear') overlayService.releaseTakeovers('alert');
    },
    runTimerAction: (timerId, action, params) => applyTimerControl(getTimerOrThrow(timerId), action, params),
    sendChat: text => chatbot.postMessage(text),
    log: message => console.log(message)
});

const pollService = createPollService({
    dataDir: DATA_DIR,
    broadcastToOverlays,
    onTakeover: (action, title, duration, poll) => takeoverPages(action, title, duration, poll),
    onAlert: (event) => alertEngine.evaluate(event, { isTest: false }),
    getTwitchPoll: () => twitchService.getLatestPoll(),
    chatbotAnnouncer: chatbot
});

const matchupService = createMatchupService({
    dataDir: DATA_DIR,
    broadcastToOverlays,
    onAlert: (event) => alertEngine.evaluate(event, { isTest: false })
});

const tierListService = createTierListService({
    dataDir: DATA_DIR,
    tierListPath: path.join(DATA_DIR, 'tier-list.json'),
    broadcastToOverlays,
    chatbotAnnouncer: chatbot,
    log: console.log
});
const handleTierListRoutes = createTierListRoutes({
    tierListService
});

const triviaService = createTriviaService({
    dataDir: DATA_DIR,
    triviaPath: path.join(DATA_DIR, 'trivia.json'),
    broadcastToOverlays,
    chatbotAnnouncer: chatbot,
    log: console.log
});
const handleTriviaRoutes = createTriviaRoutes({
    triviaService,
    isTriviaEnabled: () => config.trivia_enabled === true
});


// ============================================================================
// HTTP SERVER
// ============================================================================


const crmService = createCrmService({
    dataDir: DATA_DIR,
    sessionsDir: SESSIONS_DIR,
    getStatsData: () => userModeration.filterData(statsData),
    getChatData: () => userModeration.filterData(chatData),
    getBroadcasterName: () => BROADCASTER_NAME,
    getArchivedSessions: () => {
        const snapshot = sessionService.getArchivedSessions();
        return { ...snapshot, sessions: snapshot.sessions.map(data => userModeration.filterData(data)) };
    },
    isBanned: userModeration.isBanned,
    readJsonFileSafe: (file, fallback) => userModeration.filterData(readJsonFileSafe(file, fallback))
});

const handleTwitchRoutes = createTwitchRoutes({
    twitchService,
    userModeration,
    messageDeletions,
    pollService,
    matchupService,
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
    getStatsData: () => userModeration.filterData(statsData),
    readJsonFileSafe: (file, fallback) => userModeration.filterData(readJsonFileSafe(file, fallback)),
    subHistoryPath: SUB_HISTORY_PATH,
    followerHistoryPath: FOLLOWER_HISTORY_PATH
});

const handleSessionRoutes = createSessionRoutes({
    sessionService,
    ssnService,
    filterData: data => userModeration.filterData(data),
    filterRecords: records => userModeration.filterRecords(records),
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

// Selective share bundles: pick individual overlays, presets and settings to export or import.
const shareAssetCodec = createShareAssetCodec({ assetsDir: CUSTOM_OVERLAY_ASSETS_DIR });
const promoService = createPromoService({ dataDir: DATA_DIR });
const promoShareService = createPromoShareService({ promoService, shareAssets: shareAssetCodec });
const shareBundleService = createShareBundleService({
    assetsDir: CUSTOM_OVERLAY_ASSETS_DIR,
    historyDir: CUSTOM_OVERLAY_HISTORY_DIR,
    shareAssetCodec,
    getCustomOverlays: () => customOverlays,
    saveCustomOverlays,
    normalizeCustomOverlay,
    syncOverlayPages,
    recordOverlayRevision,
    broadcastToOverlays,
    broadcastPage,
    overlayService,
    saveOverlayPresets,
    normalizeOverlayPresets,
    getPromoShareService: () => promoShareService,
    gamePlanPath: GAME_PLAN_PATH,
    timersPath: TIMERS_PATH,
    alertsPath: path.join(DATA_DIR, 'alerts.json'),
    loadTimers,
    buildTimersSnapshot,
    getAlertEngine: () => alertEngine,
    sanitizeOverlayId
});
const readBinaryBody = (req, limit) => shareBundleService.readBinaryBody(req, limit);
const listShareItems = () => shareBundleService.listShareItems();
const buildShareZip = (selection, includeHistory) => shareBundleService.buildShareZip(selection, includeHistory);
const openShareZip = (buffer) => shareBundleService.openShareZip(buffer);
const importShareZip = (buffer, selected, conflict) => shareBundleService.importShareZip(buffer, selected, conflict);

const handlePromoRoutes = createPromoRoutes({
    service: promoService,
    artworkService: createPromoArtworkService({
        assetsDir: CUSTOM_OVERLAY_ASSETS_DIR,
        getTwitchClientId: () => TWITCH_CLIENT_ID,
        getAppToken
    })
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
    promoAssetUsers: name => promoService.assetUsers(name),
    alertAssetUsers: name => alertEngine.alertAssetUsers(name, assetReferencedIn),
    tierListAssetUsers: name => tierListService.tierListAssetUsers(name, assetReferencedIn),
    rewriteTimerSoundReferences,
    rewriteGamePlanReferences,
    rewritePromoReferences: (oldName, newName) => promoService.renameAsset(oldName, newName),
    rewriteCreditsReferences,
    rewriteAlertReferences: (oldName, newName) => alertEngine.rewriteAlertReferences(oldName, newName, rewriteAssetReferences),
    rewriteTierListReferences: (oldName, newName) => tierListService.rewriteTierListReferences(oldName, newName, rewriteAssetReferences),
    broadcastToOverlays,
    getChatData: () => chatData,
    getStatsData: () => statsData,
    twitchService,
    ssnService,
    listOverlayVisibility,
    setOverlayVisibility
});

const handleCrmRoutes = createCrmRoutes({
    crmService
});

const statusService = createStatusService({
    sessionsDir: SESSIONS_DIR,
    backupsDir: BACKUPS_DIR,
    getConfig: () => config,
    getChatData: () => userModeration.filterData(chatData),
    getVariablesStore: () => variablesStore,
    getExternalData: () => externalData,
    getHostSources: () => getHostSources(),
    getPollService: () => pollService,
    getTwitchService: () => twitchService,
    getMatchupService: () => matchupService,
    getOverlayService: () => overlayService,
    buildGamePlanSnapshot: () => buildGamePlanSnapshot(),
    getMusicConfig: () => MUSIC_CONFIG,
    getMusicService: () => musicService,
    buildGoalsSnapshot: () => buildGoalsSnapshot(),
    getTimerService: () => timerService,
    getClipService: () => clipService,
    getChatbot: () => chatbot,
    getAlertEngine: () => alertEngine,
    getObsService: () => obsService,
    getTierListService: () => tierListService,
    getTriviaService: () => triviaService,
    getSubathonService: () => subathonService,
    getWsService: () => wsService,
    getSessionService: () => sessionService,
    getProcessStartedAt: () => PROCESS_STARTED_AT,
    isSessionActive: () => sessionActive,
    getSsnSocket: () => ssnSocket,
    getSsnSessionId: () => SSN_SESSION_ID,
    getBroadcasterId: () => BROADCASTER_ID,
    getRefreshMinutes: () => REFRESH_MINUTES,
    collectHashtagStats: () => collectHashtagStats(),
    archivedCategoryMinutes: () => archivedCategoryMinutes(),
    currentCategoryStats: (cat) => currentCategoryStats(cat),
    publicGameInfo: (name) => publicGameInfo(name),
    computeMilestones: () => computeMilestones(),
    normalizeViewerStats: (v) => normalizeViewerStats(v),
    getViewerSummary: () => getViewerSummary(),
    getHighlights: () => userModeration.filterRecords(highlights),
    recentChatSummary: () => recentChatSummary(),
    buildRecentEvents: (n) => buildRecentEvents(n)
});
const buildStatusSnapshot = () => statusService.buildStatusSnapshot();

async function handleShutdown() {
    const streamEndedAt = finalizeSessionStreamEnd();
    saveChatData();
    saveStats();
    saveChatLog();
    const archiveName = archiveSession();
    resetChatData();
    console.log('[API] Shutdown requested');
    setTimeout(() => {
        if (process.env.STREAMPULSE_DESKTOP === 'true') require('electron').app.quit();
        else gracefulShutdown('API_SHUTDOWN');
    }, 500);
    return { status: 'shutting_down', archived: archiveName, streamEndedAt, message: 'Server shutting down...' };
}

function handleRestart() {
    saveChatData();
    saveStats();
    saveChatLog();
    console.log('[API] Restart requested');
    setTimeout(() => restartServer().catch(err => console.error('[Server] Restart failed:', err)), 100);
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
    getExternalData: () => externalData,
    onShutdown: handleShutdown,
    onRestart: handleRestart,
    getUpdateInfo,
    getUpdateStatus,
    applyUpdate
});

const handleHighlightsRoutes = createHighlightsRoutes({
    getHighlights: () => highlights,
    setHighlights: (arr) => { highlights = arr; },
    saveHighlights,
    getChatLog: () => chatLog,
    filterRecords: records => userModeration.filterRecords(records),
    isBanned: userModeration.isBanned,
    isDeleted: messageDeletions.isDeleted,
    getChatData: () => chatData,
    getClipCandidateConfig: () => CLIP_CANDIDATE_CONFIG,
    clipSessionOverrideForName,
    addClipCandidate,
    buildChatPdfHtml,
    generatePdf,
    localDateTimeStr
});

function handleRestoreReload({ previousConfig }) {
    sessionService.invalidateArchives();
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
    loadOverlayPresets();
    loadAssetTags();
    loadAssetCaptions();
    loadRandomizerPresets();
    loadRandomizerButtonPresets();
    loadRandomizerQuotePresets();
    loadGamePlan();
    loadCurrentSessionStateFromDisk();

    try { matchupService.reload(); } catch (err) { console.warn('[Restore] Matchup reload failed:', err.message); }
    try { pollService.reload(); } catch (err) { console.warn('[Restore] Poll reload failed:', err.message); }
    try { chatbot.reload(); } catch (err) { console.warn('[Restore] Chatbot reload failed:', err.message); }
    try { variablesStore.reload(); } catch (err) { console.warn('[Restore] Variables reload failed:', err.message); }
    try { alertEngine.reload(); } catch (err) { console.warn('[Restore] Alert engine reload failed:', err.message); }
    try { crmService.reload(); } catch (err) { console.warn('[Restore] CRM reload failed:', err.message); }
    userModeration.reload();
    messageDeletions.reload();
    broadcastToOverlays('moderation-update', {});

    broadcastToOverlays('update', chatData);
    broadcastToOverlays('timers-snapshot', buildTimersSnapshot());
    broadcastToOverlays('goals-update', buildGoalsSnapshot());
    broadcastToOverlays('game-plan-update', buildGamePlanSnapshot());
    try { broadcastToOverlays('matchup-update', matchupService.getMatchup()); } catch { /* ignore */ }
    try { broadcastToOverlays('poll-update', pollService.getActivePoll()); } catch { /* ignore */ }
    try { broadcastToOverlays('tournament-update', pollService.getTournament()); } catch { /* ignore */ }
    try { broadcastToOverlays('poll-tournament-update', pollService.getPollTournament()); } catch { /* ignore */ }

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
    customOverlayThumbnailsDir: CUSTOM_OVERLAY_THUMBNAILS_DIR,
    backupService,
    getBackupFileSpecs,
    listShareItems,
    buildShareZip,
    openShareZip,
    importShareZip,
    onRestore: handleRestoreReload,
    getConfig: () => config,
    getCustomOverlays: () => customOverlays,
    getOverlayPresets: () => overlayService.getOverlayPresets(),
    promoExists: id => promoShareService.exists(id),
    sanitizeOverlayId,
    shareSingles: shareBundleService.shareSingles
});

const handleObsRoutes = createObsRoutes({
    obsService,
    getConfig: () => config,
    saveConfig: updates => saveRuntimeConfigSection(c => Object.assign(c, updates)),
    getCustomOverlays: () => customOverlays,
    pageSnapshot: (overlay, pageId) => overlayService.pageSnapshot(overlay, pageId),
    isLoopbackRequest
});

// Donation sources an embedded host adds (e.g. host bundle registers Tiltify); listed in /api/status for the source pickers.
const hostSources = new Map();
function registerHostSource({ id, label } = {}) {
    const key = String(id || '').toLowerCase().trim();
    if (!/^[a-z0-9_-]{1,40}$/.test(key) || ['any', 'socialstream', 'external'].includes(key)) throw new Error(`Invalid host source id: ${id}`);
    hostSources.set(key, { id: key, label: String(label || key).trim().slice(0, 60) || key });
    return hostSources.get(key);
}
const getHostSources = () => [...hostSources.values()];

// Data pushed in by an embedded host (e.g. host replicants/state), keyed "<bundle>.<name>".
const externalData = {};
function setExternalData(key, value) {
    const id = String(key || '').trim();
    if (!/^[\w-]+(\.[\w-]+)+$/.test(id)) throw new Error(`Invalid external data key: ${key}`);
    if (value === undefined) delete externalData[id];
    else externalData[id] = JSON.parse(JSON.stringify(value));
    broadcastToOverlays('external-update', { key: id, value: externalData[id] ?? null });
}

// Events from an embedded host (e.g. external Tiltify donations) take the same path as SSN donations.
const ingestedEventIds = new Set();
function ingestEvent(input = {}) {
    if (input.type !== 'donation') throw new Error(`Unsupported event type: ${input.type}`);
    const id = String(input.id ?? '').trim().slice(0, 120);
    if (id) {
        if (ingestedEventIds.has(id)) return null;
        ingestedEventIds.add(id);
        if (ingestedEventIds.size > 5000) ingestedEventIds.delete(ingestedEventIds.values().next().value);
    }
    const amount = Number((typeof input.amount === 'number' ? input.amount : parseNumericAmount(input.amount)).toFixed(2)) || 0;
    const user = String(input.user || '').trim().slice(0, 60) || 'Anonymous';
    const currency = String(input.currency || 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
    const message = String(input.message || '').replace(/<[^>]+>/g, '').trim().slice(0, 500);
    const avatar = String(input.avatar || '').slice(0, 2000);
    const source = String(input.source || 'external').trim().slice(0, 40);
    const label = currency === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency}`;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (!chatData.donations) chatData.donations = [];
    chatData.donations.push({ chatname: user, amount: label, amountValue: amount, chatimg: avatar, timestamp: now.getTime(), source, ...(id ? { id } : {}) });
    if (!statsData.donations) statsData.donations = {};
    const entry = statsData.donations[user] ||= { chatimg: avatar, firstSeen: now.toISOString(), lastSeen: now.toISOString(), days: {}, amounts: {} };
    entry.days[today] = (entry.days[today] || 0) + 1;
    entry.amounts[today] = Number(((entry.amounts[today] || 0) + amount).toFixed(2));
    entry.lastSeen = now.toISOString();
    console.log(`[Ingest] Donation (${source}): ${user} - ${label}`);
    saveChatData();
    saveStats();
    broadcastToOverlays('update', chatData);
    broadcastToOverlays('goals-update', buildGoalsSnapshot());
    try { chatbot.announceDonation({ id, user, amount, currency, message, source })?.catch?.(() => {}); } catch { /* chat is optional */ }
    try {
        if (typeof subathonService !== 'undefined' && subathonService?.isSubathonActive?.()) {
            subathonService.processEvent({ type: 'donation', user, amount, currency });
        }
    } catch { /* subathon is optional */ }
    // Ids already dedupe, so identical back-to-back donations still alert.
    return alertEngine.handleEvent({ type: 'donation', user, avatar, amount, currency, message, source, ...(id ? { dedupeMs: 0 } : {}) });
}

// Embedded hosts can serve HTTPS so pages embed in an HTTPS dashboard.
function createHttpServer(handler) {
    const keyPath = process.env.STREAMPULSE_TLS_KEY;
    const certPath = process.env.STREAMPULSE_TLS_CERT;
    if (keyPath && certPath) {
        return require('https').createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handler);
    }
    return http.createServer(handler);
}

const server = createHttpServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pathname = url.pathname;

        // Dynamic snapshots must not accumulate in browser HTTP caches or return stale live state.
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
    if (await handleSubathonRoutes(req, res, pathname)) return;

    if (await handleWeatherRoutes(req, res, url, pathname)) return;

    if (await handleGamePlanRoutes(req, res, pathname, url)) return;
    if (await handleTierListRoutes(req, res, pathname, url)) return;
    if (await handleTriviaRoutes(req, res, pathname, url)) return;
    if (await handlePromoRoutes(req, res, pathname)) return;





    if (await handleBackupRoutes(req, res, url, pathname)) return;

    if (await handleHighlightsRoutes(req, res, url, pathname)) return;

    if (await handleObsRoutes(req, res, pathname)) return;

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

// Node's 5s default keep-alive closes sockets Safari still tries to reuse, which stalls requests until the browser is restarted.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

let initialized = false;
let shutdownPromise = null;
let startPromise = null;

function initializeServer() {
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
    if (!initialized) {
        loadCurrentSessionStateFromDisk();
        if (chatData.messageCount > 0 || chatLog.length > 0) {
            sessionActive = true;
            console.log(`[Startup] Resumed session from ${chatData.startedAt}`);
        } else if (normalizeLifecycleConfig(config.session_lifecycle).auto) {
            sessionActive = false;
            console.log('[Startup] No session data; waiting for the stream to go live to start one');
        } else {
            console.log('[Startup] No active session data to resume');
        }

        loadStats();
        loadTimers();
        loadStoredToken();
        initialized = true;
    }

    startTimerTicker();
    chatbot.start();
    overlayService.start();
    repeatBackground(() => goalsService.checkGoalAlerts(), 5000);
    repeatBackground(pruneRateLimits, 300000);

    // Start SSN collector
    connectSSN();
    connectFeaturedListener();

    // Load stored Twitch token and fetch data
    userModeration.start();
    if (twitchService.getAccessToken()) {
        fetchTwitchData();
        fetchStreamInfo(true);
        fetchViewerCount();
        fetchTwitchPoll(true);
    } else if (TWITCH_CLIENT_ID && !EMBEDDED && process.env.STREAMPULSE_DESKTOP !== 'true') {
        const authUrl = `http://localhost:${PORT}/auth/twitch`;
        console.log(`[Twitch] No token found — opening browser to authorize...`);
        openBrowser(authUrl);
    }

    // Auto-refresh Twitch data and stream info
    if (REFRESH_MINUTES > 0) {
        repeatBackground(() => {
            fetchTwitchData();
            fetchStreamInfo();
        }, REFRESH_MINUTES * 60 * 1000);
        console.log(`[Twitch] Auto-refresh every ${REFRESH_MINUTES} minutes`);
    }
    // Title and category are cheap to poll, so they stay near real time.
    repeatBackground(fetchStreamInfo, STREAM_INFO_POLL_SECONDS * 1000);
    // Poll for active/completed Twitch polls every 10 seconds.
    repeatBackground(fetchTwitchPoll, 10 * 1000);
    // Keep the token fresh in the background so an idle server never lets it lapse.
    repeatBackground(() => { if (twitchService.getRefreshToken() && Date.now() > twitchService.getTokenExpiry() - 30 * 60000) refreshTwitchToken(); }, 5 * 60000);

    startViewerTracking();
    startLifecycleWatcher();

    // Save chat/stats/log to disk every 5 seconds
    repeatBackground(() => {
        saveChatData();
        saveStats();
        saveChatLog();
    }, 5000);

    scheduleWeather();

    // Start music polling if enabled
    if (MUSIC_CONFIG.enabled) {
        startMusicPolling();
    }

    // Connect OBS WebSocket if enabled
    if (normalizeObsConfig(config.obs).enabled) {
        obsService.connect();
    }
}

function startServer() {
    if (startPromise) return startPromise;
    if (server.listening) return Promise.resolve();
    shutdownPromise = null;
    wsService.attachServer(server);
    startPromise = new Promise((resolve, reject) => {
        const onError = err => {
            server.removeListener('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            try {
                initializeServer();
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(PORT);
    }).finally(() => { startPromise = null; });
    return startPromise;
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[Server Error] Port ${PORT} is already in use by another program or StreamPulse instance.`);
        console.error(`Please stop the running process or choose a different port in config.json.\n`);
    } else {
        console.error('[Server Error]', err);
    }
});

function stopServer({ preserveSession = false } = {}) {
    if (!preserveSession && restartPromise) {
        return restartPromise.catch(err => {
            console.error('[Shutdown] Restart did not complete:', err);
        }).then(() => stopServer());
    }
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
        const errors = [];
        const attempt = fn => {
            try { fn(); } catch (err) {
                errors.push(err);
                console.error('[Shutdown]', err);
            }
        };
        if (startPromise) {
            try { await startPromise; } catch (err) {
                errors.push(err);
                console.error('[Shutdown] Startup did not complete:', err);
            }
        }
        for (const timer of backgroundIntervals) clearInterval(timer);
        backgroundIntervals.clear();
        attempt(() => userModeration.stop());
        attempt(() => ssnService.disconnectSSN());
        attempt(() => stopLifecycleWatcher());
        attempt(() => stopViewerTracking());
        attempt(() => timerService.stopTimerTicker());
        attempt(() => stopMusicPolling());
        attempt(() => weatherService.stop());
        attempt(() => chatbot.stop());
        attempt(() => alertEngine.stop());
        attempt(() => overlayService.stop());
        attempt(() => obsService.disconnect());
        attempt(() => pollService.destroy());
        attempt(() => matchupService.destroy());
        for (const wait of [() => sessionService.waitForPendingEnd(), () => backupService.waitForIdle()]) {
            try { await wait(); } catch (err) {
                errors.push(err);
                console.error('[Shutdown] Backup/session completion failed:', err);
            }
        }
        if (!preserveSession) attempt(() => finalizeSessionStreamEnd());
        attempt(() => saveChatData());
        attempt(() => saveStats());
        attempt(() => saveChatLog());
        if (!preserveSession && !errors.length) {
            attempt(() => {
                const archiveName = archiveSession();
                if (sessionService.sessionHasData() && !archiveName) throw new Error('Session archive failed; live data was preserved');
                if (archiveName) console.log(`[Server] Session archived: ${archiveName}`);
                resetChatData();
                sessionActive = false;
            });
        }
        wsService.closeAllConnections();
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(err => err ? reject(err) : resolve());
                server.closeAllConnections();
            });
        }
        if (errors.length) throw new AggregateError(errors, 'StreamPulse shutdown encountered errors');
    })();
    return shutdownPromise;
}

async function gracefulShutdown(signal, shouldExit = true) {
    console.log(`\n[Server] Received ${signal}. Shutting down...`);
    try {
        await stopServer();
        console.log('[Server] Data saved. Goodbye!');
        if (shouldExit) process.exit(0);
    } catch (err) {
        console.error('[Server] Shutdown failed:', err);
        if (shouldExit) process.exit(1);
        throw err;
    }
}

// Embedded hosts own process signals and lifecycle.
const EMBEDDED = process.env.STREAMPULSE_EMBEDDED === 'true';
if (!EMBEDDED) {
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});

module.exports = {
    server,
    gracefulShutdown,
    startServer,
    stopServer,
    restartServer,
    onBroadcast: wsService.onBroadcast,
    setExternalData,
    registerHostSource,
    getHostSources,
    ingestEvent,
    getSnapshots: () => ({
        timers: buildTimersSnapshot(),
        goals: buildGoalsSnapshot(),
        viewers: getViewerSummary(),
        music: musicService.getState(),
        poll: pollService ? pollService.getLatestPoll() : null,
        matchup: matchupService ? matchupService.getMatchup() : null,
        tournament: pollService ? pollService.getTournament({ isPoll: false }) : null,
        pollTournament: pollService ? pollService.getTournament({ isPoll: true }) : null
    }),
    port: PORT
};

if (!EMBEDDED) startServer().catch(err => {
    console.error('[Server] Startup failed:', err);
    process.exitCode = 1;
});
