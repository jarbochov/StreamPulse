#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const WebSocket = require('ws');
const { ZipArchive } = require('archiver');
const AdmZip = require('adm-zip');
const { createGamePlanService, DEFAULT_TIERS, normalizeGamePlan, gameKey, sanitizeOverlayId } = require('./server/services/game-plan');
const { createAlertEngine, TRIGGERS: ALERT_TRIGGERS, ANIM_IN: ALERT_ANIM_IN, ANIM_OUT: ALERT_ANIM_OUT } = require('./server/alerts');
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
const execFileAsync = promisify(execFile);
const UPDATE_REPOSITORY = 'jarbochov/StreamPulse';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Node refuses to spawn .cmd files without a shell on Windows (EINVAL); the arguments here are fixed.
const runNpmCi = () => execFileAsync(NPM_COMMAND, ['ci', '--omit=dev'], { cwd: __dirname, timeout: 300000, shell: process.platform === 'win32' });
const PROCESS_STARTED_AT = new Date().toISOString();

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG_PATH = path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json — copy config.example.json to config.json and fill in your credentials.');
    process.exit(1);
}

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = config.port || 3000;
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
const DATA_DIR = path.join(__dirname, 'data');
const variablesStore = require('./server/variables')({ dataDir: DATA_DIR });
const chatbot = require('./server/chatbot')({ dataDir: DATA_DIR, getConfig: () => config, port: Number(process.env.PORT) || Number(config.port) || 3000, variables: variablesStore, onUse: (kind, name) => takeoverPages('command', name), sessionKey: () => String(chatData.startedAt || '') });
const LIVE_CHAT_PATH = path.join(DATA_DIR, 'chat.json');
const BANNED_HASHTAGS_PATH = path.join(DATA_DIR, '.banned-hashtags.json');
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat-log.jsonl');
const HIGHLIGHTS_PATH = path.join(DATA_DIR, 'highlights.jsonl');
const CLIP_CANDIDATES_PATH = path.join(DATA_DIR, 'clip-candidates.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const EMOTE_CACHE_DIR = path.join(DATA_DIR, 'emote-cache');
const TIMERS_PATH = path.join(DATA_DIR, 'timers.json');
const CUSTOM_OVERLAYS_PATH = path.join(DATA_DIR, 'custom-overlays.json');
const OVERLAY_PRESETS_PATH = path.join(DATA_DIR, 'overlay-presets.json');
const ASSET_TAGS_PATH = path.join(DATA_DIR, 'asset-tags.json');
const ASSET_CAPTIONS_PATH = path.join(DATA_DIR, 'asset-captions.json');
const CUSTOM_OVERLAY_ASSETS_DIR = path.join(DATA_DIR, 'custom-overlay-assets');
const CUSTOM_OVERLAY_HISTORY_DIR = path.join(DATA_DIR, 'custom-overlay-history');
const CUSTOM_OVERLAY_HISTORY_LIMIT = 30;
const RANDOMIZER_PRESETS_PATH = path.join(DATA_DIR, 'randomizer-presets.json');
const RANDOMIZER_BUTTON_PRESETS_PATH = path.join(DATA_DIR, 'randomizer-button-presets.json');
const RANDOMIZER_QUOTE_PRESETS_PATH = path.join(DATA_DIR, 'randomizer-quote-presets.json');

const DEFAULT_RANDOMIZER_PRESETS = [
    {
        id: 'jackbox',
        name: 'Jackbox Party Games (60 Games)',
        buttonPreset: 'games',
        quotePreset: 'hype',
        winnerHeader: 'NEXT GAME TO PLAY',
        winnerSub: 'Booting up... prepare your phones!',
        choices: [
            "Bidiots", "Blather Round", "Bomb Corp", "Bracketeering", "Champ'd Up",
            "Civic Doodle", "Devils and the Details", "Dictionarium", "Dodo Re Mi",
            "Drawful", "Drawful 2", "Drawful Dirty", "Drawful Animate", "Earwax",
            "Fakin' It", "Fakin' It All Night Long", "Fibbage", "Fibbage 2", "Fibbage 3",
            "Fibbage 4", "Fibbage XL", "FixyText", "Guesspionage", "Hypnotorious",
            "Job Job", "Joke Boat", "Junktopia", "Let Me Finish", "Lie Swatter",
            "Mad Verse City", "Monster Seeking Monster", "Nonsensory", "Patently Stupid",
            "Push the Button", "Poll Mine", "Quiplash", "Quiplash 2", "Quiplash 3",
            "Quiplash XL", "Quixort", "Rifftrax: the Game", "Role Models", "Roomerang",
            "Split the Room", "Survey Scramble", "Survive the Internet", "Talking Points",
            "Tee K.O.", "Tee K.O. 2", "Timejinx", "Trivia Murder Party",
            "Trivia Murder Party 2", "Use Your Words", "Weapons Drawn",
            "Wheel of Enormous Proportions", "Word Spud", "You Don't Know Jack 2015",
            "You Don't Know Jack Full Stream", "Zeeple Dome", "What the Dub"
        ]
    },
    {
        id: 'decision',
        name: 'Quick Decision (Yes / No / Maybe)',
        buttonPreset: 'chaos',
        quotePreset: 'multiverse',
        winnerHeader: 'THE ORACLE HAS SPOKEN',
        winnerSub: 'The timeline has shifted. Fate is sealed.',
        choices: [
            "Yes, absolutely!", "No way", "Ask chat", "Spin again",
            "Definitely yes", "Hard no", "Maybe later", "Roll a die"
        ]
    },
    {
        id: 'punishments',
        name: 'Stream Challenges & Punishments',
        buttonPreset: 'punish',
        quotePreset: 'roast',
        winnerHeader: 'PUNISHMENT CHOSEN',
        winnerSub: 'No mercy. Do not pass GO. Fate is sealed.',
        choices: [
            "10 Pushups / Situps", "Hydrate check (huge gulp)", "Chat picks next music track",
            "Play next round one-handed", "Give a VIP/Sub badge shoutout", "No talking for 3 minutes",
            "Switch camera angle / face cam zoom", "Sing a 15-second jingle"
        ]
    }
];

const DEFAULT_RANDOMIZER_BUTTON_PRESETS = [
    {
        id: 'chaos',
        name: 'Chaos & Mayhem (Original Randomizer)',
        phrases: [
            "Let Chaos Reign!",
            "Shake It Up!",
            "Spin the Wheel of Destiny!",
            "Summon Randomness!",
            "Unleash the Fates!",
            "Roll the Cosmic Dice!",
            "Mayhem Mode!",
            "Toss into the Void!",
            "Destiny, Take the Wheel!",
            "Invoke the Randomizer!",
            "Disorder, Please!",
            "Activate Quantum Luck!",
            "Who Knows?!",
            "Bring the Pandemonium!",
            "Release the Kraken!",
            "YOLO Button!",
            "Throw a Curveball!",
            "Hurl into Uncertainty!",
            "Choose or Lose!",
            "Hit Me With Chaos!",
            "Spin and Grin!",
            "Let the Universe Decide!",
            "Go Bananas!",
            "SLAM IT ON IN THERE!",
            "Guess You'll Die?",
            "Hey look over there!",
            "LET IT BURN",
            "Punch it Margaret!",
            "What's the Worst That Could Happen?"
        ]
    },
    {
        id: 'games',
        name: 'Game Night & Jackbox',
        phrases: [
            "Pick Next Game!",
            "Spin the Wheel!",
            "What Are We Playing?",
            "Game On!",
            "Wheel of Destiny",
            "Next Up!",
            "Choose the Game!"
        ]
    },
    {
        id: 'punish',
        name: 'Challenges & Punishments',
        phrases: [
            "Choose My Fate!",
            "Spin the Wheel of Pain!",
            "Hit Me With It!",
            "No Mercy!",
            "I Regret Nothing!",
            "Make Me Suffer!"
        ]
    },
    {
        id: 'simple',
        name: 'Simple & Direct',
        phrases: [
            "Spin",
            "Randomize",
            "Roll the Dice",
            "Decide Now"
        ]
    }
];

const DEFAULT_RANDOMIZER_QUOTE_PRESETS = [
    {
        id: 'multiverse',
        name: 'Multiverse Respin Quotes (15 Lines)',
        quotes: [
            "The timeline has shifted. But is this really better?",
            "Another universe, another glorious outcome.",
            "You just quantum-leaped to a new result!",
            "That butterfly just flapped its wings. Welcome to a new timeline.",
            "The fabric of fate is fraying. Result updated!",
            "You have rewound the cosmic clock. Again.",
            "A ripple in the multiverse delivers a different destiny.",
            "Parallel worlds say hello! Enjoy your alternate fate.",
            "The universe blinks. Your wish is (randomly) granted.",
            "You've seen another potential future. Satisfied?",
            "You've created a new branch of reality. Good luck!",
            "Another roll, another dimension.",
            "Multiverse roulette: new path unlocked.",
            "Alternate luck engaged. Fate is fickle.",
            "You glitched the matrix. This is your new outcome."
        ]
    },
    {
        id: 'hype',
        name: 'Stream Hype & Victory',
        quotes: [
            "A champion emerges from the chaos!",
            "Bow down to the chosen destiny!",
            "History has been made on stream!",
            "The gods of RNG have smiled upon us!",
            "Absolute perfection. No notes.",
            "Destiny has chosen its champion!"
        ]
    },
    {
        id: 'roast',
        name: 'Sarcastic & Chat Roasts',
        quotes: [
            "Blame RNG, not your lack of skill.",
            "Chat is in absolute shambles right now.",
            "Quantum luck has spoken. Strictly no refunds!",
            "Honestly, that looks like a skill issue.",
            "Do not pass GO. Do not collect 200 bits.",
            "Could have been worse. Probably."
        ]
    },
    {
        id: 'minimal',
        name: 'Short & Clean',
        quotes: [
            "Fate is sealed.",
            "Next up on stream.",
            "Here we go!",
            "The universe has spoken.",
            "Decision locked in."
        ]
    }
];

function loadRandomizerPresets() {
    try {
        if (fs.existsSync(RANDOMIZER_PRESETS_PATH)) {
            const data = JSON.parse(fs.readFileSync(RANDOMIZER_PRESETS_PATH, 'utf8'));
            if (Array.isArray(data) && data.length) return data;
        }
    } catch (e) {
        console.error('[Randomizer] Error loading presets:', e.message);
    }
    safeWriteFileSync(RANDOMIZER_PRESETS_PATH, JSON.stringify(DEFAULT_RANDOMIZER_PRESETS, null, 2));
    return DEFAULT_RANDOMIZER_PRESETS;
}

function saveRandomizerPresets(presets) {
    try {
        safeWriteFileSync(RANDOMIZER_PRESETS_PATH, JSON.stringify(presets, null, 2));
        return true;
    } catch (e) {
        console.error('[Randomizer] Error saving presets:', e.message);
        return false;
    }
}

function loadRandomizerButtonPresets() {
    try {
        if (fs.existsSync(RANDOMIZER_BUTTON_PRESETS_PATH)) {
            const data = JSON.parse(fs.readFileSync(RANDOMIZER_BUTTON_PRESETS_PATH, 'utf8'));
            if (Array.isArray(data) && data.length) return data;
        }
    } catch (e) {
        console.error('[Randomizer] Error loading button presets:', e.message);
    }
    safeWriteFileSync(RANDOMIZER_BUTTON_PRESETS_PATH, JSON.stringify(DEFAULT_RANDOMIZER_BUTTON_PRESETS, null, 2));
    return DEFAULT_RANDOMIZER_BUTTON_PRESETS;
}

function saveRandomizerButtonPresets(presets) {
    try {
        safeWriteFileSync(RANDOMIZER_BUTTON_PRESETS_PATH, JSON.stringify(presets, null, 2));
        return true;
    } catch (e) {
        console.error('[Randomizer] Error saving button presets:', e.message);
        return false;
    }
}

function loadRandomizerQuotePresets() {
    try {
        if (fs.existsSync(RANDOMIZER_QUOTE_PRESETS_PATH)) {
            const data = JSON.parse(fs.readFileSync(RANDOMIZER_QUOTE_PRESETS_PATH, 'utf8'));
            if (Array.isArray(data) && data.length) return data;
        }
    } catch (e) {
        console.error('[Randomizer] Error loading quote presets:', e.message);
    }
    safeWriteFileSync(RANDOMIZER_QUOTE_PRESETS_PATH, JSON.stringify(DEFAULT_RANDOMIZER_QUOTE_PRESETS, null, 2));
    return DEFAULT_RANDOMIZER_QUOTE_PRESETS;
}

function saveRandomizerQuotePresets(presets) {
    try {
        safeWriteFileSync(RANDOMIZER_QUOTE_PRESETS_PATH, JSON.stringify(presets, null, 2));
        return true;
    } catch (e) {
        console.error('[Randomizer] Error saving quote presets:', e.message);
        return false;
    }
}

function safeWriteFileSync(targetPath, data) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(targetPath)}.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, targetPath);
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}



const isLoopbackRequest = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const TEXT_SOURCE_TYPES = new Set(['text', 'random-text', 'markdown']);
const TEXT_SOURCE_EXTS = new Set(['.txt', '.md', '.markdown', '.text']);
const TEXT_SOURCE_MAX_BYTES = 512 * 1024;
const CUSTOM_OVERLAY_ELEMENT_TYPES = new Set(['text', 'random-text', 'markdown', 'image', 'video', 'shape', 'embed', 'progress', 'game-list', 'qr', 'alert', 'slideshow', 'icon']);
let customOverlays = {};

const staticRouter = createStaticRouter({
    rootDir: __dirname,
    publicDir: path.join(__dirname, 'public'),
    customOverlayAssetsDir: CUSTOM_OVERLAY_ASSETS_DIR,
    isLoopbackRequest,
    getCustomOverlays: () => customOverlays
});


// Shared by background, text and border gradients: linear or radial, 2-3 stops, optional animation.
function normalizeGradient(g) {
    g = g || {};
    return {
        enabled: g.enabled === true,
        from: String(g.from || '#1f6feb').slice(0, 80),
        to: String(g.to || '#8957e5').slice(0, 80),
        angle: Number.isFinite(Number(g.angle)) && g.angle !== '' && g.angle !== null ? Math.max(0, Math.min(360, Number(g.angle))) : 135,
        type: g.type === 'radial' ? 'radial' : 'linear',
        mid: String(g.mid || '').slice(0, 80),
        position: ['center', 'top', 'bottom', 'left', 'right'].includes(g.position) ? g.position : 'center',
        animate: g.animate === true,
        speed: Math.max(1, Math.min(120, Number(g.speed) || 8))
    };
}

// Look for images, videos and slideshows (blur, darken, tint, duotone).
function normalizeMediaFilter(f = {}) {
    const hex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback);
    const num = (value, min, max, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Math.max(min, Math.min(max, Number(value))) : fallback);
    return {
        blur: num(f.blur, 0, 60, 0),
        brightness: num(f.brightness, 0, 200, 100),
        contrast: num(f.contrast, 0, 200, 100),
        saturate: num(f.saturate, 0, 300, 100),
        grayscale: num(f.grayscale, 0, 100, 0),
        tint: { enabled: f.tint?.enabled === true, color: hex(f.tint?.color, '#000000'), opacity: num(f.tint?.opacity, 0, 1, 0.4) },
        duotone: {
            enabled: f.duotone?.enabled === true, dark: hex(f.duotone?.dark, '#1b1464'), light: hex(f.duotone?.light, '#ff9de2'),
            animate: ['none', 'blend', 'hue', 'both'].includes(f.duotone?.animate) ? f.duotone.animate : 'none',
            dark2: hex(f.duotone?.dark2, '#0b3d2e'), light2: hex(f.duotone?.light2, '#7dffb2'), speed: num(f.duotone?.speed, 1, 60, 6)
        },
        grain: { enabled: f.grain?.enabled === true, amount: num(f.grain?.amount, 0, 1, 0.25), size: num(f.grain?.size, 0.5, 4, 1), animate: f.grain?.animate !== false }
    };
}

function normalizeOverlayElement(element = {}, index = 0) {
    const type = CUSTOM_OVERLAY_ELEMENT_TYPES.has(element.type) ? element.type : 'text';
    return {
        id: sanitizeOverlayId(element.id) || `element-${index + 1}`,
        name: String(element.name || '').trim().slice(0, 80),
        locked: element.locked === true,
        group: sanitizeOverlayId(element.group).slice(0, 40),
        groupName: element.group ? String(element.groupName || '').trim().slice(0, 60) : '',
        page: element.page === '*' ? '*' : sanitizeOverlayId(element.page).slice(0, 40),
        type,
        mediaFilter: normalizeMediaFilter(element.mediaFilter),
        slideshow: {
            source: element.slideshow?.source === 'manual' ? 'manual' : 'tags',
            tags: normalizeAssetTagList(element.slideshow?.tags).slice(0, 20),
            tagMode: element.slideshow?.tagMode === 'all' ? 'all' : 'any',
            files: [...new Set((Array.isArray(element.slideshow?.files) ? element.slideshow.files : []).map(value => String(value || '').slice(0, 200)).filter(name => name && !/[\\/]/.test(name)))].slice(0, 500),
            kinds: element.slideshow?.kinds === 'both' ? 'both' : element.slideshow?.kinds === 'video' ? 'video' : 'image',
            seconds: Math.max(1, Math.min(3600, Math.round((Number(element.slideshow?.seconds) || 5) * 10) / 10)),
            order: ['sequential', 'shuffle', 'random'].includes(element.slideshow?.order) ? element.slideshow.order : 'sequential',
            fit: ['cover', 'contain'].includes(element.slideshow?.fit) ? element.slideshow.fit : 'cover',
            transition: ['none', 'fade', 'slide'].includes(element.slideshow?.transition) ? element.slideshow.transition : 'fade',
            direction: PAGE_DIRECTIONS.includes(element.slideshow?.direction) ? element.slideshow.direction : 'left',
            transitionMs: Math.max(0, Math.min(5000, Math.round(Number(element.slideshow?.transitionMs ?? 800)))),
            advance: element.slideshow?.advance === 'manual' ? 'manual' : 'auto',
            caption: ['off', 'caption', 'name'].includes(element.slideshow?.caption) ? element.slideshow.caption : element.slideshow?.caption === true ? 'name' : 'off',
            kenBurns: element.slideshow?.kenBurns === true
        },
        gameList: {
            filter: ['scheduled', 'backlog', 'played', 'all'].includes(element.gameList?.filter) || /^list-[a-z0-9-]{1,40}$/.test(element.gameList?.filter || '') ? element.gameList.filter : 'scheduled',
            period: String(element.gameList?.period || '').slice(0, 40),
            periods: [...new Set((Array.isArray(element.gameList?.periods) ? element.gameList.periods : []).map(value => String(value || '').trim().slice(0, 40)).filter(Boolean))].slice(0, 20),
            when: /^(thisYear|lastYear|thisMonth|lastMonth|\d{4}|\d{4}-(0[1-9]|1[0-2]))$/.test(element.gameList?.when || '') ? element.gameList.when : '',
            groupBy: ['month', 'year'].includes(element.gameList?.groupBy) ? element.gameList.groupBy : 'period',
            maxPeriods: Math.max(0, Math.min(20, Math.round(Number(element.gameList?.maxPeriods) || 0))),
            periodsAcross: Math.max(0, Math.min(8, Math.round(Number(element.gameList?.periodsAcross) || 0))),
            layout: ['grid', 'strip', 'list', 'kanban', 'tiers', 'ticker'].includes(element.gameList?.layout) ? element.gameList.layout : 'grid',
            columns: element.gameList?.columns === 0 ? 0 : Math.max(1, Math.min(12, Math.round(Number(element.gameList?.columns) || 3))),
            coverRatio: ['3/4', '1/1', '4/3', '16/9', '21/9', '2/3'].includes(element.gameList?.coverRatio) ? element.gameList.coverRatio : '3/4',
            tickerDirection: element.gameList?.tickerDirection === 'right' ? 'right' : 'left',
            tickerFade: element.gameList?.tickerFade !== false,
            tickerPace: Math.max(0.5, Math.min(30, Math.round((Number(element.gameList?.tickerPace) || 3) * 10) / 10)),
            tickerSpeed: Math.max(10, Math.min(600, Math.round(Number(element.gameList?.tickerSpeed) || 60))),
            alignH: ['left', 'center', 'right'].includes(element.gameList?.alignH) ? element.gameList.alignH : 'left',
            alignV: ['top', 'middle', 'bottom'].includes(element.gameList?.alignV) ? element.gameList.alignV : 'top',
            gap: Math.max(0, Math.min(80, Number(element.gameList?.gap ?? 12))),
            groupGap: element.gameList?.groupGap === undefined || element.gameList?.groupGap === null || element.gameList?.groupGap === '' || !Number.isFinite(Number(element.gameList.groupGap)) ? null : Math.max(0, Math.min(200, Number(element.gameList.groupGap))),
            max: Math.max(0, Math.min(100, Math.round(Number(element.gameList?.max) || 0))),
            coverFit: ['cover', 'contain', 'natural'].includes(element.gameList?.coverFit) ? element.gameList.coverFit : 'cover',
            fit: element.gameList?.fit === 'shrink' ? 'shrink' : 'none',
            coverScale: Math.max(25, Math.min(400, Math.round(Number(element.gameList?.coverScale) || 100))),
            headingSize: Math.max(0, Math.min(300, Math.round(Number(element.gameList?.headingSize) || 0))),
            titleSize: Math.max(0, Math.min(300, Math.round(Number(element.gameList?.titleSize) || 0))),
            titleWrap: element.gameList?.titleWrap === 'wrap' ? 'wrap' : 'ellipsis',
            titlePlacement: element.gameList?.titlePlacement === 'overlay' ? 'overlay' : 'below',
            headingScale: Math.max(0, Math.min(400, Math.round(Number(element.gameList?.headingScale) || 0))),
            titleScale: Math.max(0, Math.min(400, Math.round(Number(element.gameList?.titleScale) || 0))),
            metaScale: Math.max(0, Math.min(400, Math.round(Number(element.gameList?.metaScale) || 0))),
            showCovers: element.gameList?.showCovers !== false,
            showTitles: element.gameList?.showTitles !== false,
            meta: ['none', 'year', 'genres', 'note', 'rating', 'tags'].includes(element.gameList?.meta) ? element.gameList.meta : 'none',
            tierSource: element.gameList?.tierSource === 'tier' ? 'tier' : 'stars',
            sort: ['plan', 'rating', 'name'].includes(element.gameList?.sort) ? element.gameList.sort : 'plan',
            headings: element.gameList?.headings !== false,
            highlightCurrent: element.gameList?.highlightCurrent !== false,
            accent: String(element.gameList?.accent || '#3fb950').slice(0, 80)
        },
        qr: {
            fg: /^#[0-9a-f]{6}$/i.test(element.qr?.fg || '') ? element.qr.fg : '#000000',
            bg: /^#[0-9a-f]{6}$/i.test(element.qr?.bg || '') || element.qr?.bg === 'transparent' ? element.qr.bg : '#ffffff',
            margin: Math.max(0, Math.min(8, Math.round(Number(element.qr?.margin ?? 2)))),
            ecc: ['L', 'M', 'Q', 'H'].includes(element.qr?.ecc) ? element.qr.ecc : 'M'
        },
        progress: {
            kind: element.progress?.kind === 'ring' ? 'ring' : 'bar',
            label: String(element.progress?.label ?? '{{progress}}%').slice(0, 200),
            showLabel: element.progress?.showLabel !== false,
            trackColor: String(element.progress?.trackColor || 'rgba(255,255,255,0.18)').slice(0, 80),
            thickness: Math.max(2, Math.min(40, Number(element.progress?.thickness) || 10))
        },
        content: String(element.content || '').slice(0, 20000),
        columns: type === 'markdown' ? Math.max(1, Math.min(6, Math.round(Number(element.columns)) || 1)) : 1,
        headingScale: type === 'markdown' && Number.isFinite(Number(element.headingScale)) ? Math.max(40, Math.min(200, Math.round(Number(element.headingScale)))) : 100,
        headingSpan: type === 'markdown' && Number.isFinite(Number(element.headingSpan)) ? Math.max(0, Math.min(6, Math.round(Number(element.headingSpan)))) : 6,
        textFit: ['shrink', 'fit'].includes(element.textFit) && TEXT_SOURCE_TYPES.has(type) ? element.textFit : 'none',
        source: {
            mode: ['library', 'file'].includes(element.source?.mode) && TEXT_SOURCE_TYPES.has(type) ? element.source.mode : 'inline',
            path: String(element.source?.path || '').trim().slice(0, 1000),
            split: element.source?.split === 'blocks' ? 'blocks' : 'lines'
        },
        items: Array.isArray(element.items) ? element.items.map(item => String(item).slice(0, 2000)).filter(Boolean).slice(0, 2000) : [],
        src: String(element.src || '').slice(0, 2000),
        alert: {
            layout: ['stack', 'side', 'text', 'media'].includes(element.alert?.layout) ? element.alert.layout : 'stack',
            mediaFit: element.alert?.mediaFit === 'cover' ? 'cover' : 'contain',
            mediaScale: Math.max(10, Math.min(100, Number(element.alert?.mediaScale) || 60)),
            titleSize: Math.max(8, Math.min(300, Number(element.alert?.titleSize) || 44)),
            messageSize: Math.max(8, Math.min(300, Number(element.alert?.messageSize) || 28)),
            titleColor: String(element.alert?.titleColor || '#ffd166').slice(0, 80),
            gap: Math.max(0, Math.min(100, Number(element.alert?.gap) || 12)),
            sound: element.alert?.sound !== false,
            sampleImage: String(element.alert?.sampleImage || '').slice(0, 2000),
            sampleEmoji: String(element.alert?.sampleEmoji || '').trim().slice(0, 40),
            triggers: Array.isArray(element.alert?.triggers) ? element.alert.triggers.filter(t => ALERT_TRIGGERS[t]).slice(0, 20) : []
        },
        random: {
            mode: ['random', 'order'].includes(element.random?.mode) ? element.random.mode : 'random',
            intervalSeconds: Math.max(1, Math.min(3600, Number(element.random?.intervalSeconds) || 5)),
            typewriter: element.random?.typewriter === true,
            typewriterSpeed: Math.max(10, Math.min(1000, Number(element.random?.typewriterSpeed) || 110)),
            marquee: element.random?.marquee === true,
            marqueeSpeed: Math.max(10, Math.min(240, Number(element.random?.marqueeSpeed) || 60))
        },
        x: Number.isFinite(Number(element.x)) ? Number(element.x) : 0,
        y: Number.isFinite(Number(element.y)) ? Number(element.y) : 0,
        width: Math.max(1, Math.min(3840, Number(element.width) || 400)),
        height: Math.max(1, Math.min(2160, Number(element.height) || 100)),
        zIndex: Math.round(Number(element.zIndex) || 0),
        visible: element.visible !== false,
        style: {
            fontFamily: String(element.style?.fontFamily || 'sans-serif').slice(0, 120),
            fontSize: Math.max(8, Math.min(400, Number(element.style?.fontSize) || 32)),
            fontWeight: String(element.style?.fontWeight || '400').slice(0, 20),
            color: String(element.style?.color || '#ffffff').slice(0, 80),
            textAlign: ['left', 'center', 'right'].includes(element.style?.textAlign) ? element.style.textAlign : 'left',
            verticalAlign: ['top', 'middle', 'bottom'].includes(element.style?.verticalAlign) ? element.style.verticalAlign : 'top',
            background: String(element.style?.background || 'transparent').slice(0, 120),
            borderColor: String(element.style?.borderColor || 'transparent').slice(0, 80),
            borderWidth: Math.max(0, Math.min(40, Number(element.style?.borderWidth) || 0)),
            borderRadius: Math.max(0, Math.min(200, Number(element.style?.borderRadius) || 0)),
            padding: TEXT_SOURCE_TYPES.has(type) ? Math.max(0, Math.min(200, Number(element.style?.padding) || 0)) : 0,
            opacity: Number.isFinite(Number(element.style?.opacity))
                ? Math.max(0, Math.min(1, Number(element.style.opacity)))
                : 1,
            objectFit: element.style?.objectFit === 'contain' ? 'contain' : 'cover',
            focusX: Number.isFinite(Number(element.style?.focusX)) ? Math.max(0, Math.min(100, Number(element.style.focusX))) : 50,
            focusY: Number.isFinite(Number(element.style?.focusY)) ? Math.max(0, Math.min(100, Number(element.style.focusY))) : 50,
            shape: ['rectangle', 'circle', 'pill', 'line'].includes(element.style?.shape) ? element.style.shape : 'rectangle',
            fill: String(element.style?.fill || '#1f6feb').slice(0, 80),
            gradient: normalizeGradient(element.style?.gradient),
            textGradient: normalizeGradient(element.style?.textGradient),
            borderGradient: normalizeGradient(element.style?.borderGradient),
            blur: Math.max(0, Math.min(60, Number(element.style?.blur) || 0)),
            shadow: {
                blur: Math.max(0, Math.min(100, Number(element.style?.shadow?.blur) || 0)),
                color: String(element.style?.shadow?.color || 'rgba(0,0,0,0.5)').slice(0, 80)
            },
            textStroke: {
                width: Math.max(0, Math.min(20, Number(element.style?.textStroke?.width) || 0)),
                color: String(element.style?.textStroke?.color || '#000000').slice(0, 80)
            },
            textShadow: {
                blur: Math.max(0, Math.min(60, Number(element.style?.textShadow?.blur) || 0)),
                color: String(element.style?.textShadow?.color || 'rgba(0,0,0,0.7)').slice(0, 80)
            },
            textTransform: ['none', 'uppercase', 'lowercase', 'capitalize'].includes(element.style?.textTransform) ? element.style.textTransform : 'none',
            textDecoration: ['none', 'underline', 'line-through'].includes(element.style?.textDecoration) ? element.style.textDecoration : 'none',
            lineHeight: Math.max(0.5, Math.min(3, Number(element.style?.lineHeight) || 1.2)),
            letterSpacing: Math.max(-10, Math.min(50, Number(element.style?.letterSpacing) || 0))
        }
    };
}

// Multipage overlays: every element belongs to one page, or to '*' (shared across all pages).
const PAGE_TRANSITIONS = ['none', 'fade', 'slide'];
const PAGE_DIRECTIONS = ['left', 'right', 'up', 'down'];
function normalizePages(input = {}) {
    const seen = new Set();
    const items = (Array.isArray(input.items) ? input.items : []).slice(0, 50).map((item, index) => {
        let id = sanitizeOverlayId(item?.id).slice(0, 40) || `page-${index + 1}`;
        while (seen.has(id) || id === '*') id = `${id}-${index + 1}`;
        seen.add(id);
        return {
            id,
            name: String(item?.name || '').trim().slice(0, 60) || `Page ${index + 1}`,
            duration: Math.max(0, Math.min(86400, Number(item?.duration) || 0)),
            enabled: item?.enabled !== false,
            trigger: ['alert', 'featured', 'command', 'poll-end', 'poll-active'].includes(item?.trigger) ? item.trigger : '',
            triggerName: String(item?.triggerName || '').trim().toLowerCase().replace(/^[^a-z0-9_]+/, '').slice(0, 60),
            triggerRules: item?.trigger === 'alert' && Array.isArray(item.triggerRules) ? [...new Set(item.triggerRules.map(String))].slice(0, 100) : [],
            triggerSeconds: Math.max(0, Math.min(3600, Number(item?.triggerSeconds) || 0))
        };
    });
    if (!items.length) items.push({ id: 'page-1', name: 'Page 1', duration: 0, enabled: true, trigger: '', triggerName: '', triggerRules: [], triggerSeconds: 0 });
    if (!items.some(item => item.enabled)) items[0].enabled = true;
    return {
        enabled: input.enabled === true,
        mode: input.mode === 'auto' ? 'auto' : 'manual',
        cycleSeconds: Math.max(1, Math.min(86400, Number(input.cycleSeconds) || 10)),
        loop: input.loop !== false,
        transition: PAGE_TRANSITIONS.includes(input.transition) ? input.transition : 'fade',
        transitionMs: Math.max(0, Math.min(5000, Number(input.transitionMs ?? 500))),
        transitionDirection: PAGE_DIRECTIONS.includes(input.transitionDirection) ? input.transitionDirection : 'left',
        transitionDistance: Math.max(10, Math.min(2000, Math.round(Number(input.transitionDistance) || 120))),
        items
    };
}

function normalizeCustomOverlay(input = {}, idOverride = '') {
    const id = sanitizeOverlayId(idOverride || input.id);
    if (!id) throw new Error('Overlay id is required');
    const pages = normalizePages(input.pages);
    const pageIds = new Set(pages.items.map(item => item.id));
    const elements = (Array.isArray(input.elements)
        ? input.elements.slice(0, 100).map(normalizeOverlayElement)
        : []).map(element => ({ ...element, page: element.page === '*' || pageIds.has(element.page) ? element.page : pages.items[0].id }));
    return {
        id,
        name: String(input.name || id).trim().slice(0, 120) || id,
        revision: Math.max(1, Math.round(Number(input.revision) || 1)),
        updatedAt: input.updatedAt || new Date().toISOString(),
        canvas: {
            width: Math.max(1, Math.min(3840, Number(input.canvas?.width) || 1920)),
            height: Math.max(1, Math.min(2160, Number(input.canvas?.height) || 1080)),
            background: String(input.canvas?.background || 'transparent').slice(0, 120)
        },
        pages,
        elements
    };
}

function loadCustomOverlays() {
    try {
        if (fs.existsSync(CUSTOM_OVERLAYS_PATH)) {
            const stored = JSON.parse(fs.readFileSync(CUSTOM_OVERLAYS_PATH, 'utf8'));
            customOverlays = Object.fromEntries(Object.entries(stored || {}).map(([id, overlay]) => {
                const normalized = normalizeCustomOverlay(overlay, id);
                return [normalized.id, normalized];
            }));
        }
        console.log(`[Overlays] Loaded ${Object.keys(customOverlays).length} custom overlays`);
    } catch (err) {
        console.warn(`[Overlays] Could not load custom overlays: ${err.message}`);
        customOverlays = {};
    }
}

const ASSET_KIND_BY_EXT = { '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image', '.mp4': 'video', '.webm': 'video', '.ogg': 'video', '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font', '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.oga': 'audio', '.txt': 'text', '.md': 'text', '.markdown': 'text', '.text': 'text' };
const assetKind = name => ASSET_KIND_BY_EXT[path.extname(name).toLowerCase()] || 'other';
const assetLabel = name => name.replace(/^[a-z0-9]{6,}-/, '').replace(/\.[A-Za-z0-9]+$/, '').replace(/^[-_.]+|[-_.]+$/g, '');
// Uploaded fonts are referenced in overlays by this family name, so renames must rewrite it too.
const assetFontFamily = name => assetLabel(name).replace(/[^a-zA-Z0-9 _-]+/g, '').replace(/[-_]+/g, ' ').trim() || 'Uploaded Font';
const assetNameBoundary = '(?![A-Za-z0-9._%-])';
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function assetReferencedIn(text, name, family) {
    if (new RegExp(`/custom-overlay-assets/${escapeRegExp(encodeURIComponent(name))}${assetNameBoundary}`).test(text) || new RegExp(`/custom-overlay-assets/${escapeRegExp(name)}${assetNameBoundary}`).test(text)) return true;
    return !!family && text.includes(`'${family}'`);
}
function rewriteAssetReferences(text, oldName, newName, oldFamily, newFamily) {
    let result = text;
    for (const [from, to] of [[encodeURIComponent(oldName), encodeURIComponent(newName)], [oldName, newName]]) {
        result = result.replace(new RegExp(`/custom-overlay-assets/${escapeRegExp(from)}${assetNameBoundary}`, 'g'), `/custom-overlay-assets/${to}`);
    }
    if (oldFamily && newFamily && oldFamily !== newFamily) result = result.split(`'${oldFamily}'`).join(`'${newFamily}'`);
    return result;
}

// Every save keeps the version it replaced, so older revisions can be restored from the editor.
const historyFile = id => path.join(CUSTOM_OVERLAY_HISTORY_DIR, `${sanitizeOverlayId(id)}.json`);
function readOverlayHistory(id) {
    try { const list = JSON.parse(fs.readFileSync(historyFile(id), 'utf8')); return Array.isArray(list) ? list : []; } catch { return []; }
}
function recordOverlayRevision(previous) {
    if (!previous) return;
    try {
        fs.mkdirSync(CUSTOM_OVERLAY_HISTORY_DIR, { recursive: true });
        const list = readOverlayHistory(previous.id).filter(entry => entry.revision !== previous.revision);
        list.push({ revision: previous.revision, updatedAt: previous.updatedAt || '', name: previous.name, canvas: previous.canvas, pages: previous.pages, elements: previous.elements });
        fs.writeFileSync(historyFile(previous.id), JSON.stringify(list.slice(-CUSTOM_OVERLAY_HISTORY_LIMIT)));
    } catch (err) { console.warn('[Overlays] Could not record revision history:', err.message); }
}

// Live page state per multipage overlay. It is shared by every browser source and kept in memory only.
const overlayPageState = new Map();
const pageOf = (overlay, state) => overlay.pages.items.find(item => item.id === state.page) || overlay.pages.items[0];
function pageSnapshot(overlay) {
    const state = overlayPageState.get(overlay.id);
    const items = overlay.pages.items;
    const index = Math.max(0, items.findIndex(item => item.id === state?.page));
    return {
        id: overlay.id,
        enabled: overlay.pages.enabled,
        page: items[index].id,
        name: items[index].name,
        index,
        count: items.length,
        auto: !!state?.auto,
        pages: items.map(({ id, name, duration, enabled, trigger }) => ({ id, name, duration, enabled, trigger }))
    };
}
function broadcastPage(overlay) {
    if (typeof broadcastToOverlays === 'function') broadcastToOverlays('custom-overlay-page', pageSnapshot(overlay));
}
function scheduleAutoAdvance(overlay) {
    const state = overlayPageState.get(overlay.id);
    if (!state) return;
    clearTimeout(state.timer);
    state.timer = null;
    if (!state.auto || !overlay.pages.enabled || overlay.pages.items.filter(item => item.enabled && !item.trigger).length < 2 || state.takeoverTimer) return;
    const seconds = pageOf(overlay, state).duration || overlay.pages.cycleSeconds;
    state.timer = setTimeout(() => {
        const live = customOverlays[overlay.id];
        if (!live) return;
        movePage(live, 'next', { auto: true });
    }, seconds * 1000);
    state.timer.unref?.();
}
// Returns false when the move did nothing (already at the end without looping, or an unknown page).
function movePage(overlay, action, { target, auto } = {}) {
    let state = overlayPageState.get(overlay.id);
    if (!state) { state = { page: overlay.pages.items[0].id, auto: false, timer: null }; overlayPageState.set(overlay.id, state); }
    const items = overlay.pages.items;
    const current = Math.max(0, items.findIndex(item => item.id === state.page));
    // Pages switched off in the editor are skipped by every move.
    const step = dir => {
        for (let i = 1; i <= items.length; i++) {
            let at = current + dir * i;
            if (at < 0 || at >= items.length) { if (!overlay.pages.loop) return -1; at = (at + items.length) % items.length; }
            if (items[at].enabled && !items[at].trigger) return at === current ? -1 : at;
        }
        return -1;
    };
    const manual = !auto;
    if (manual && state.takeoverTimer) { clearTimeout(state.takeoverTimer); state.takeoverTimer = null; state.returnPage = null; }
    let next = current;
    if (action === 'next') next = step(1);
    else if (action === 'prev') next = step(-1);
    else if (action === 'first') next = items.findIndex(item => item.enabled && !item.trigger);
    else if (action === 'last') next = items.map(item => item.enabled && !item.trigger).lastIndexOf(true);
    else if (action === 'goto') {
        const key = String(target ?? '').trim().toLowerCase();
        next = items.findIndex(item => item.id === key || item.name.toLowerCase() === key);
        if (next < 0 && /^\d+$/.test(key)) next = Number(key) - 1;
        if (next < 0 || next >= items.length || !items[next].enabled) return false;
    }
    if (next < 0) {
        // Auto mode that reached the last page without looping simply stops.
        if (auto) { state.auto = false; clearTimeout(state.timer); broadcastPage(overlay); }
        return false;
    }
    state.page = items[next].id;
    scheduleAutoAdvance(overlay);
    broadcastPage(overlay);
    return true;
}
function setPageAuto(overlay, on) {
    let state = overlayPageState.get(overlay.id);
    if (!state) { state = { page: overlay.pages.items[0].id, auto: false, timer: null }; overlayPageState.set(overlay.id, state); }
    state.auto = on === undefined ? !state.auto : !!on;
    scheduleAutoAdvance(overlay);
    broadcastPage(overlay);
}
// Called after a load or save so the live state follows the saved config (mode, page list, timings).
function syncOverlayPages(overlay, previous) {
    const state = overlayPageState.get(overlay.id) || { page: overlay.pages.items[0].id, auto: false, timer: null };
    overlayPageState.set(overlay.id, state);
    const items = overlay.pages.items;
    if (!items.some(item => item.id === state.page && item.enabled && (!item.trigger || state.takeoverTimer))) {
        // The current page was disabled or removed: carry on with the next enabled page in rotation, not the first
        let from = items.findIndex(item => item.id === state.page);
        if (from >= 0) from += 1;
        else {
            const oldAt = (previous?.pages?.items || []).findIndex(item => item.id === state.page);
            from = oldAt >= 0 ? Math.min(oldAt, items.length) : 0;
        }
        let pick = null;
        for (let i = 0; i < items.length && !pick; i++) {
            const candidate = items[(from + i) % items.length];
            if (candidate.enabled && !candidate.trigger) pick = candidate;
        }
        state.page = (pick || items[0]).id;
    }
    if (!previous || previous.pages?.mode !== overlay.pages.mode || previous.pages?.enabled !== overlay.pages.enabled) {
        state.auto = overlay.pages.enabled && overlay.pages.mode === 'auto';
    }
    if (!overlay.pages.enabled) state.auto = false;
    scheduleAutoAdvance(overlay);
}
// Show a trigger page (alert, featured message or chat command) for a while, then return to the rotation.
function takeoverPages(kind, name, ms) {
    for (const overlay of Object.values(customOverlays)) {
        if (!overlay.pages?.enabled) continue;
        const target = overlay.pages.items.find(p => p.enabled && p.trigger === kind && (kind === 'featured' || (kind === 'alert' ? !p.triggerRules.length || p.triggerRules.includes(name) : !p.triggerName || p.triggerName === String(name || '').toLowerCase())));
        if (!target) continue;
        let state = overlayPageState.get(overlay.id);
        if (!state) { state = { page: overlay.pages.items[0].id, auto: false, timer: null }; overlayPageState.set(overlay.id, state); }
        const returnPage = state.takeoverTimer ? state.returnPage : state.page;
        clearTimeout(state.takeoverTimer);
        clearTimeout(state.timer);
        state.returnPage = returnPage;
        state.page = target.id;
        const seconds = target.triggerSeconds || (ms ? ms / 1000 : 10);
        state.takeoverTimer = setTimeout(() => {
            state.takeoverTimer = null;
            const live = customOverlays[overlay.id];
            if (!live) return;
            if (live.pages.items.some(p => p.id === state.returnPage && p.enabled)) state.page = state.returnPage;
            state.returnPage = null;
            scheduleAutoAdvance(live);
            broadcastPage(live);
        }, seconds * 1000);
        state.takeoverTimer.unref?.();
        broadcastPage(overlay);
    }
}
function dropOverlayPages(id) {
    const state = overlayPageState.get(id);
    if (state) clearTimeout(state.timer);
    overlayPageState.delete(id);
}

function saveCustomOverlays() {
    safeWriteFileSync(CUSTOM_OVERLAYS_PATH, JSON.stringify(customOverlays, null, 2));
}

loadCustomOverlays();
Object.values(customOverlays).forEach(overlay => syncOverlayPages(overlay));

// Asset tags: { "<asset file name>": ["Tag", ...] }. Tags are matched case-insensitively.
let assetTags = {};
try { if (fs.existsSync(ASSET_TAGS_PATH)) assetTags = JSON.parse(fs.readFileSync(ASSET_TAGS_PATH, 'utf8')) || {}; } catch (error) { console.warn('[Assets] Could not load asset tags:', error.message); }

function normalizeAssetTagList(input) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(input) ? input : String(input || '').split(',')) {
        const tag = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
    }
    return out;
}

// Asset captions: { "<asset file name>": "Caption text" }, shown by slideshows.
let assetCaptions = {};
try { if (fs.existsSync(ASSET_CAPTIONS_PATH)) assetCaptions = JSON.parse(fs.readFileSync(ASSET_CAPTIONS_PATH, 'utf8')) || {}; } catch (error) { console.warn('[Assets] Could not load asset captions:', error.message); }
function saveAssetCaptions() { safeWriteFileSync(ASSET_CAPTIONS_PATH, JSON.stringify(assetCaptions, null, 2)); }

function saveAssetTags() {
    safeWriteFileSync(ASSET_TAGS_PATH, JSON.stringify(assetTags, null, 2));
}

function setAssetTags(name, tags) {
    const list = normalizeAssetTagList(tags);
    if (list.length) assetTags[name] = list; else delete assetTags[name];
}

function assetMatchesTags(name, wanted, mode) {
    const have = new Set((assetTags[name] || []).map(tag => tag.toLowerCase()));
    const need = wanted.map(tag => tag.toLowerCase());
    if (!need.length) return false;
    return mode === 'all' ? need.every(tag => have.has(tag)) : need.some(tag => have.has(tag));
}

// User-saved element presets for the overlay editor. Element positions are relative to the preset's top-left corner.
let overlayPresets = [];
try { if (fs.existsSync(OVERLAY_PRESETS_PATH)) overlayPresets = normalizeOverlayPresets(JSON.parse(fs.readFileSync(OVERLAY_PRESETS_PATH, 'utf8'))); } catch (error) { console.warn('[Presets] Could not load overlay presets:', error.message); }

function normalizeOverlayPresets(list) {
    return (Array.isArray(list) ? list : []).slice(0, 100).map(preset => {
        const elements = (Array.isArray(preset?.elements) ? preset.elements : []).slice(0, 40).map(normalizeOverlayElement);
        const id = sanitizeOverlayId(preset?.id);
        if (!id || !elements.length) return null;
        return {
            id, name: String(preset.name || 'Preset').trim().slice(0, 60) || 'Preset',
            category: String(preset.category || 'My presets').trim().slice(0, 30) || 'My presets',
            width: Math.max(1, Math.round(Number(preset.width) || 1)), height: Math.max(1, Math.round(Number(preset.height) || 1)),
            elements
        };
    }).filter(Boolean);
}

function saveOverlayPresets() {
    safeWriteFileSync(OVERLAY_PRESETS_PATH, JSON.stringify(overlayPresets, null, 2));
}

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

let clipCandidates = [];
let recentChatTimestamps = [];
let archivedVodCache = { fetchedAt: 0, videos: [] };
const DEFAULT_CLIP_CANDIDATE_CONFIG = {
    enabled: true,
    chat_spike_messages: 20,
    chat_spike_window_seconds: 60,
    cooldown_seconds: 30,
    include_subscriptions: true,
    include_gift_subs: true,
    include_highlights: true,
    include_bits: true,
    minimum_bits: 1,
    include_donations: true,
    minimum_donation: 0,
    include_raids: true,
    minimum_raid_viewers: 0
};

function normalizeClipCandidateConfig(value) {
    const input = value && typeof value === 'object' ? value : {};
    const number = (key, fallback, minimum = 0) => {
        const parsed = Number(input[key]);
        return Number.isFinite(parsed) ? Math.max(minimum, Math.round(parsed)) : fallback;
    };
    return {
        enabled: input.enabled !== false,
        chat_spike_messages: number('chat_spike_messages', DEFAULT_CLIP_CANDIDATE_CONFIG.chat_spike_messages, 2),
        chat_spike_window_seconds: number('chat_spike_window_seconds', DEFAULT_CLIP_CANDIDATE_CONFIG.chat_spike_window_seconds, 10),
        cooldown_seconds: number('cooldown_seconds', DEFAULT_CLIP_CANDIDATE_CONFIG.cooldown_seconds, 0),
        include_subscriptions: input.include_subscriptions !== false,
        include_gift_subs: input.include_gift_subs !== false,
        include_highlights: input.include_highlights !== false,
        include_bits: input.include_bits !== false,
        minimum_bits: number('minimum_bits', DEFAULT_CLIP_CANDIDATE_CONFIG.minimum_bits, 1),
        include_donations: input.include_donations !== false,
        minimum_donation: number('minimum_donation', DEFAULT_CLIP_CANDIDATE_CONFIG.minimum_donation, 0),
        include_raids: input.include_raids !== false,
        minimum_raid_viewers: number('minimum_raid_viewers', DEFAULT_CLIP_CANDIDATE_CONFIG.minimum_raid_viewers, 0)
    };
}

let CLIP_CANDIDATE_CONFIG = normalizeClipCandidateConfig(config.clip_candidates);

function loadClipCandidates() {
    try {
        if (fs.existsSync(CLIP_CANDIDATES_PATH)) {
            const stored = JSON.parse(fs.readFileSync(CLIP_CANDIDATES_PATH, 'utf8'));
            clipCandidates = Array.isArray(stored) ? stored : [];
            console.log(`[Clips Beta] Loaded ${clipCandidates.length} candidates`);
        }
    } catch (err) {
        console.warn(`[Clips Beta] Could not load candidates: ${err.message}`);
        clipCandidates = [];
    }
}

function saveClipCandidates() {
    fs.writeFileSync(CLIP_CANDIDATES_PATH, JSON.stringify(clipCandidates, null, 2));
}

function currentClipSession() {
    return {
        session: chatData.startedAt ? `chat-${localDateTimeStr(chatData.startedAt)}.json` : 'unknown',
        startedAt: chatData.startedAt || null
    };
}

function clipSessionOverrideForName(sessionName) {
    const name = String(sessionName || '');
    const current = currentClipSession();
    if (!name || name === 'current' || name === current.session) return current;
    if (!/^chat-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/.test(name)) return null;
    try {
        const sessionPath = path.join(SESSIONS_DIR, name);
        if (!fs.existsSync(sessionPath)) return null;
        const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        return data.startedAt ? { session: name, startedAt: data.startedAt } : null;
    } catch {
        return null;
    }
}

function parseTwitchDuration(duration) {
    const match = String(duration || '').match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match) return 0;
    return ((Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0)) * 1000;
}

function formatVodOffset(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return `${hours ? `${hours}h` : ''}${minutes ? `${minutes}m` : ''}${remainder || (!hours && !minutes) ? `${remainder}s` : ''}`;
}

async function getArchivedVods() {
    if (!BROADCASTER_ID || !(await ensureToken())) return [];
    if (Date.now() - archivedVodCache.fetchedAt < 60000) return archivedVodCache.videos;
    try {
        const result = await twitchApiRequest('/videos', { user_id: BROADCASTER_ID, first: '100', type: 'archive' });
        if (result.status !== 200 || !Array.isArray(result.body.data)) return [];
        archivedVodCache = { fetchedAt: Date.now(), videos: result.body.data };
        return archivedVodCache.videos;
    } catch (err) {
        console.warn(`[Clips Beta] Could not load Twitch VODs: ${err.message}`);
        return [];
    }
}

async function resolveCandidateVodUrls(candidates) {
    const fallback = BROADCASTER_NAME
        ? `https://www.twitch.tv/${encodeURIComponent(BROADCASTER_NAME)}/videos`
        : null;
    const videos = await getArchivedVods();
    return candidates.map(candidate => {
        const timestamp = Number(candidate.timestamp);
        const match = videos.find(video => {
            const start = Date.parse(video.created_at);
            const duration = parseTwitchDuration(video.duration);
            return Number.isFinite(timestamp) && Number.isFinite(start)
                && timestamp >= start - 15 * 60 * 1000
                && timestamp <= start + duration + 15 * 60 * 1000;
        });
        const vodUrl = match?.id
            ? `https://www.twitch.tv/videos/${encodeURIComponent(match.id)}?t=${formatVodOffset((timestamp - Date.parse(match.created_at)) / 1000)}`
            : fallback;
        return {
            ...candidate,
            vodUrl,
            vodMatched: !!match?.id,
            vodId: match?.id || null,
            vodOffsetSeconds: match?.id ? Math.max(0, Math.round((timestamp - Date.parse(match.created_at)) / 1000)) : null
        };
    });
}

function addClipCandidate(reason, details = {}, timestamp = Date.now(), score = 0.5, sessionOverride = null, sourceKey = null) {
    if (!sessionActive && !sessionOverride) return null;
    const sessionStartedAt = sessionOverride?.startedAt || chatData.startedAt;
    const duplicateWindow = timestamp - (CLIP_CANDIDATE_CONFIG.cooldown_seconds * 1000);
    const duplicate = clipCandidates.some(candidate =>
        candidate.sessionStartedAt === sessionStartedAt &&
        (sourceKey && candidate.sourceKey === sourceKey ||
            candidate.timestamp >= duplicateWindow && candidate.reason === reason)
    );
    if (duplicate) return null;

    const session = sessionOverride || currentClipSession();
    const candidate = {
        id: `clip-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp,
        detectedAt: new Date().toISOString(),
        reason,
        details,
        score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
        session: session.session,
        sessionStartedAt,
        sourceKey,
        status: 'candidate',
        clipId: null,
        editUrl: null,
        viewUrl: null,
        createdAt: null,
        error: null
    };
    clipCandidates.push(candidate);
    clipCandidates = clipCandidates.slice(-500);
    saveClipCandidates();
    console.log(`[Clips Beta] Candidate: ${reason}`);
    return candidate;
}

loadClipCandidates();

function backfillClipCandidatesFromEntries(entries, sessionOverride) {
    if (!Array.isArray(entries) || !sessionOverride?.startedAt) return 0;
    const ordered = entries
        .filter(entry => Number.isFinite(Number(entry.ts)))
        .sort((a, b) => Number(a.ts) - Number(b.ts));
    const timestamps = [];
    let created = 0;

    for (const entry of ordered) {
        const timestamp = Number(entry.ts);
        timestamps.push(timestamp);
        while (timestamps.length && timestamp - timestamps[0] > CLIP_CANDIDATE_CONFIG.chat_spike_window_seconds * 1000) {
            timestamps.shift();
        }

        if (CLIP_CANDIDATE_CONFIG.enabled && timestamps.length >= CLIP_CANDIDATE_CONFIG.chat_spike_messages) {
            created += Number(Boolean(addClipCandidate(
                'chat-spike',
                { messagesInWindow: timestamps.length, windowSeconds: CLIP_CANDIDATE_CONFIG.chat_spike_window_seconds },
                timestamp,
                Math.min(0.95, 0.5 + timestamps.length / 100),
                sessionOverride,
                `${sessionOverride.session}:chat-spike:${timestamp}`
            )));
        }

        const event = String(entry.event || '').toLowerCase();
        const user = entry.user || 'unknown';
        if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_gift_subs &&
            ['subscription_gift', 'giftpurchase', 'giftredemption'].includes(event)) {
            created += Number(Boolean(addClipCandidate('gift-sub', { user }, timestamp, 0.65, sessionOverride, `${sessionOverride.session}:gift-sub:${timestamp}`)));
        } else if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_subscriptions &&
            ['new_subscriber', 'resub', 'sponsorship'].includes(event)) {
            created += Number(Boolean(addClipCandidate('subscription', { user, tier: entry.membership || event }, timestamp, 0.6, sessionOverride, `${sessionOverride.session}:subscription:${timestamp}`)));
        }

        if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_bits &&
            (event === 'cheer' || String(entry.donation || '').toLowerCase().includes('bit'))) {
            const amount = parseNumericAmount(entry.donation);
            if (amount >= CLIP_CANDIDATE_CONFIG.minimum_bits) {
                created += Number(Boolean(addClipCandidate('bits', { user, amount, label: entry.donation || `${amount} bits` }, timestamp, 0.65, sessionOverride, `${sessionOverride.session}:bits:${timestamp}`)));
            }
        }

        if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_donations &&
            entry.donation && !String(entry.donation).toLowerCase().includes('bit')) {
            const amount = parseNumericAmount(entry.donation);
            if (amount >= CLIP_CANDIDATE_CONFIG.minimum_donation) {
                created += Number(Boolean(addClipCandidate('donation', { user, amount: entry.donation }, timestamp, 0.7, sessionOverride, `${sessionOverride.session}:donation:${timestamp}`)));
            }
        }

        if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_raids && event === 'raid') {
            const viewers = Number((entry.message || '').match(/(\d+)/)?.[1] || 0);
            if (viewers >= CLIP_CANDIDATE_CONFIG.minimum_raid_viewers) {
                created += Number(Boolean(addClipCandidate('raid', { user, viewers: viewers || null }, timestamp, 0.8, sessionOverride, `${sessionOverride.session}:raid:${timestamp}`)));
            }
        }
    }
    return created;
}

function backfillHighlightedClipCandidates() {
    let created = 0;
    for (const highlight of highlights) {
        if (!CLIP_CANDIDATE_CONFIG.enabled || !CLIP_CANDIDATE_CONFIG.include_highlights) continue;
        const sessionOverride = clipSessionOverrideForName(highlight.session);
        if (!sessionOverride || !Number.isFinite(Number(highlight.ts))) continue;
        created += Number(Boolean(addClipCandidate(
            'highlighted-chat',
            { user: highlight.user, message: highlight.message || '' },
            Number(highlight.ts),
            0.9,
            sessionOverride,
            `${sessionOverride.session}:highlight:${highlight.ts}:${highlight.user}`
        )));
    }
    return created;
}

function backfillClipCandidates(rebuild = false) {
    let removed = 0;
    if (rebuild) {
        const before = clipCandidates.length;
        clipCandidates = clipCandidates.filter(candidate =>
            candidate.status === 'created'
            || !candidate.sourceKey
            || candidate.sessionStartedAt === chatData.startedAt
        );
        removed = before - clipCandidates.length;
        if (removed) saveClipCandidates();
    }

    const sessions = [];
    if (chatData.startedAt && fs.existsSync(CHAT_LOG_PATH)) {
        sessions.push({
            session: `chat-${localDateTimeStr(chatData.startedAt)}.json`,
            startedAt: chatData.startedAt,
            entries: getCurrentChatLogEntries()
        });
    }

    if (fs.existsSync(SESSIONS_DIR)) {
        for (const file of fs.readdirSync(SESSIONS_DIR).filter(name => name.startsWith('chat-') && name.endsWith('.json'))) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
                const logName = file.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                sessions.push({
                    session: file,
                    startedAt: data.startedAt,
                    entries: readChatLogFile(path.join(SESSIONS_DIR, logName))
                });
            } catch (err) {
                console.warn(`[Clips Beta] Could not analyze ${file}: ${err.message}`);
            }
        }
    }

    let created = 0;
    for (const session of sessions) {
        created += backfillClipCandidatesFromEntries(session.entries, {
            session: session.session,
            startedAt: session.startedAt
        });
    }
    created += backfillHighlightedClipCandidates();
    return { sessions: sessions.length, created, removed };
}

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
        presets: overlayPresets.map(p => ({ type: 'preset', id: p.id, name: p.name, category: p.category })),
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
            const preset = overlayPresets.find(p => p.id === id);
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
                const exists = overlayPresets.some(p => p.id === source.id);
                if (exists && conflict === 'skip') { results.push({ key, status: 'skipped' }); continue; }
                const targetId = exists && conflict === 'copy' ? freeId(source.id, id => overlayPresets.some(p => p.id === id)) : source.id;
                const [preset] = normalizeOverlayPresets([{ ...JSON.parse(importAssets(JSON.stringify(source))), id: targetId }]);
                if (!preset) throw new Error('invalid preset');
                overlayPresets = [...overlayPresets.filter(p => p.id !== targetId), preset];
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
    await execFileAsync('git', ['fetch', '--tags', 'origin'], { cwd: __dirname });
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


// Chatter Dossier / Community CRM
const CHATTER_NOTES_FILE = path.join(DATA_DIR, 'chatter-notes.json');
let chatterNotes = {};
try {
    if (fs.existsSync(CHATTER_NOTES_FILE)) {
        chatterNotes = JSON.parse(fs.readFileSync(CHATTER_NOTES_FILE, 'utf8')) || {};
    }
} catch (e) {
    console.warn('[Chatter Notes] Failed to load:', e.message);
}

function saveChatterNotes() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(`${CHATTER_NOTES_FILE}.tmp`, JSON.stringify(chatterNotes, null, 2), 'utf8');
        fs.renameSync(`${CHATTER_NOTES_FILE}.tmp`, CHATTER_NOTES_FILE);
    } catch (e) {
        console.error('[Chatter Notes] Save error:', e);
    }
}

function getChatterDossier(username) {
    if (!username) return null;
    const key = String(username).toLowerCase().trim();

    let chatter = null;
    let displayName = username;
    for (const [k, c] of Object.entries(statsData.chatters || {})) {
        if (k.toLowerCase() === key) {
            chatter = c;
            displayName = c.chatname || k;
            break;
        }
    }
    if (!chatter && chatData.chatters) {
        for (const [k, c] of Object.entries(chatData.chatters)) {
            if (k.toLowerCase() === key) {
                chatter = { chatimg: c.chatimg, type: c.type, firstSeen: chatData.startedAt, lastSeen: chatData.startedAt, days: { [chatData.startedAt?.slice(0, 10) || 'today']: c.messageCount || 1 } };
                displayName = c.chatname || k;
                break;
            }
        }
    }

    const days = chatter?.days || {};
    const totalMessages = Object.values(days).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const sessionsAttended = Object.keys(days).length;

    const subTenure = statsData.subTenure?.[key] || statsData.subTenure?.[displayName];
    const subMonths = subTenure?.months || 0;
    const subscriber = statsData.subscribers?.[displayName] || statsData.subscribers?.[key];
    const isSubscriber = Boolean(subMonths > 0 || subscriber);

    const bitsRecord = statsData.bits?.[displayName] || statsData.bits?.[key];
    const bitsTotal = bitsRecord ? Object.values(bitsRecord.days || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) : 0;

    const giftSubsRecord = statsData.giftSubs?.[displayName] || statsData.giftSubs?.[key];
    const giftSubsTotal = giftSubsRecord ? Object.values(giftSubsRecord.days || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) : 0;

    const raidsRecord = statsData.raids?.[displayName] || statsData.raids?.[key];
    const raidsCount = raidsRecord ? Object.keys(raidsRecord.days || {}).length : 0;

    const categoriesMap = {};
    if (fs.existsSync(SESSIONS_DIR)) {
        for (const file of fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith('chat-') && f.endsWith('.json'))) {
            try {
                const sData = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
                const chatterEntry = Object.entries(sData.chatters || {}).find(([k]) => k.toLowerCase() === key);
                if (chatterEntry) {
                    const count = chatterEntry[1]?.messageCount || 1;
                    const cats = (sData.streamInfo || []).map(s => s.category).filter(Boolean);
                    const uniqueCats = [...new Set(cats)];
                    if (!uniqueCats.length && sData.category) uniqueCats.push(sData.category);
                    for (const cat of uniqueCats) {
                        if (!categoriesMap[cat]) categoriesMap[cat] = { category: cat, sessions: 0, messages: 0 };
                        categoriesMap[cat].sessions++;
                        categoriesMap[cat].messages += count;
                    }
                }
            } catch {}
        }
    }
    const favoriteGames = Object.values(categoriesMap).sort((a, b) => b.messages - a.messages).slice(0, 8);

    const recentActivity = Object.entries(days)
        .map(([date, msgs]) => ({ date, messages: msgs }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);

    const noteEntry = chatterNotes[key] || {};
    const vipsList = readJsonFileSafe(path.join(DATA_DIR, 'vips.json'), { data: [] })?.data || [];
    const modsList = readJsonFileSafe(path.join(DATA_DIR, 'moderators.json'), { data: [] })?.data || [];
    const isTwitchVip = vipsList.some(v => (v.user_login || v.user_name || '').toLowerCase() === key) || Boolean(chatter?.isVip);
    const isTwitchMod = modsList.some(m => (m.user_login || m.user_name || '').toLowerCase() === key) || Boolean(chatter?.isMod);
    const isVip = Boolean(noteEntry.isVip || isTwitchVip);
    const isMod = Boolean(isTwitchMod || (noteEntry.tags || []).some(t => t.toLowerCase() === 'mod'));

    return {
        username: displayName,
        broadcaster: BROADCASTER_NAME || 'jarbochov',
        chatimg: chatter?.chatimg || '',
        type: chatter?.type || 'twitch',
        firstSeen: chatter?.firstSeen || null,
        lastSeen: chatter?.lastSeen || null,
        totalMessages,
        sessionsAttended,
        isSubscriber,
        subMonths,
        bitsTotal,
        giftSubsTotal,
        raidsCount,
        favoriteGames,
        recentActivity,
        notes: noteEntry.notes || '',
        tags: noteEntry.tags || [],
        isVip,
        isMod,
        updatedAt: noteEntry.updatedAt || null
    };
}

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

    // Auth endpoints
    if (pathname === '/api/twitch/auth/status' && req.method === 'GET') {
        await ensureToken();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: !!twitchService.getAccessToken(),
            mode: TWITCH_CLIENT_SECRET ? 'own_app' : 'shared_device',
            clientId: TWITCH_CLIENT_ID,
            broadcasterConfigured: !!BROADCASTER_ID,
            broadcasterSaved: twitchService.isBroadcasterSynced(),
            scopes: twitchService.getTokenScopes()
        }));
        return;
    }

    if (pathname === '/api/twitch/auth/device/start' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        try {
            const d = await startDeviceAuth();
            res.end(JSON.stringify({ userCode: d.userCode, verificationUri: d.verificationUri, interval: d.interval, expiresAt: d.expiresAt }));
        } catch (err) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/twitch/auth/device/poll' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        try {
            const d = await pollDeviceAuth();
            res.end(JSON.stringify({ status: d.status, error: d.error || '', interval: d.interval, broadcasterSaved: twitchService.isBroadcasterSynced() }));
        } catch (err) {
            res.end(JSON.stringify({ status: 'pending', error: err.message }));
        }
        return;
    }

    if (pathname === '/api/twitch/auth/disconnect' && req.method === 'POST') {
        clearToken();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    if (pathname === '/auth/twitch') {
        if (!TWITCH_CLIENT_SECRET) {
            res.writeHead(302, { Location: '/twitch-connect.html' });
            res.end();
            return;
        }
        const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
            `client_id=${TWITCH_CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(TWITCH_SCOPES)}` +
            `&force_verify=true` +
            `&state=${encodeURIComponent(safeReturnPath(url.searchParams.get('return')))}`;
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
    }

    if (pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>Authorization denied</h1><p>${escapeHtml(error)}</p><p><a href="/auth/twitch">Try again</a></p>`);
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
                const returnTo = safeReturnPath(url.searchParams.get('state'));
                res.writeHead(302, { Location: returnTo === '/' ? '/clips.html?reauthorized=1' : returnTo });
                res.end();
                fetchTwitchData();
                fetchStreamInfo();
                fetchViewerCount();
                fetchTwitchPoll();
            } catch (err) {
                console.error('[Twitch] Auth callback error:', err.message);
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<h1>Authorization failed</h1><p>${escapeHtml(err.message)}</p><p><a href="/auth/twitch">Try again</a></p>`);
            }
            return;
        }

        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Missing authorization code</h1><p><a href="/auth/twitch">Try again</a></p>');
        return;
    }

    if (pathname === '/api/alerts' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...alertEngine.getConfig(), queue: alertEngine.getQueueState(), meta: { triggers: ALERT_TRIGGERS, animIn: ALERT_ANIM_IN, animOut: ALERT_ANIM_OUT } }));
        return;
    }
    if (pathname === '/api/alerts' && req.method === 'PUT') {
        try {
            const saved = alertEngine.setConfig(JSON.parse(await readRequestBody(req) || '{}'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(saved));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (pathname === '/api/alerts/test' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const payload = alertEngine.fireRule(String(body.ruleId || ''), String(body.variantId || ''), body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, alert: payload }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (pathname === '/api/alerts/test-event' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const payload = alertEngine.handleEvent({ ...body, user: body.user || 'TestViewer', dedupeMs: 0 }, { test: true });
            if (body.type === 'raid' && body.triggerChatbot) {
                chatbot.handleRaid({ user: body.user || 'TestViewer', viewers: body.amount || body.viewers || 10, isTest: true }).catch(() => {});
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, alert: payload }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (pathname === '/api/alerts/replay' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const payload = body.alertId ? alertEngine.replayAlert(String(body.alertId)) : alertEngine.replayEvent(String(body.eventId || ''));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, alert: payload }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (pathname === '/api/alerts/queue' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            alertEngine.control(String(body.action || ''));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, queue: alertEngine.getQueueState() }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/custom-overlays/text-source' && req.method === 'GET') {
        const respond = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
        const params = new URL(req.url, 'http://localhost').searchParams;
        const mode = params.get('mode');
        const requested = String(params.get('path') || '').trim();
        let target;
        if (mode === 'library') {
            let name;
            try { name = decodeURIComponent(requested.replace(/^\/custom-overlay-assets\//, '')); } catch { return respond(400, { error: 'Invalid library file' }); }
            target = path.join(CUSTOM_OVERLAY_ASSETS_DIR, name);
            if (!name || name.includes('/') || name.includes('\\') || path.dirname(target) !== CUSTOM_OVERLAY_ASSETS_DIR) return respond(400, { error: 'Invalid library file' });
        } else if (mode === 'file') {
            target = requested.startsWith('~/') ? path.join(os.homedir(), requested.slice(2)) : requested;
            if (!path.isAbsolute(target)) return respond(400, { error: 'Use a full path starting with /' });
            // Remote viewers may only read files that a saved overlay already points at.
            const remote = !isLoopbackRequest(req);
            if (remote && !Object.values(customOverlays).some(o => o.elements.some(el => el.source?.mode === 'file' && el.source.path === requested))) return respond(403, { error: 'File is not used by any overlay' });
        } else return respond(400, { error: 'Unknown source mode' });
        if (!TEXT_SOURCE_EXTS.has(path.extname(target).toLowerCase())) return respond(400, { error: 'Only .txt and .md files can be used' });
        try {
            const stat = fs.statSync(target);
            if (!stat.isFile()) return respond(404, { error: 'That is not a file' });
            if (stat.size > TEXT_SOURCE_MAX_BYTES) return respond(413, { error: 'File is larger than 512 KB' });
            return respond(200, { text: fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''), mtimeMs: Math.floor(stat.mtimeMs), name: path.basename(target) });
        } catch (err) {
            return respond(404, { error: err.code === 'ENOENT' ? 'File not found' : `Could not read file: ${err.message}` });
        }
    }

    if (pathname === '/api/system/choose-file' && req.method === 'POST') {
        const respond = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (!isLoopbackRequest(req)) return respond(403, { error: 'The file chooser only opens on the StreamPulse computer' });
        if (process.platform !== 'darwin') return respond(501, { error: 'The file chooser is only available on macOS. Paste the full path instead.' });
        let wanted = 'text';
        try { wanted = JSON.parse(await readRequestBody(req) || '{}').kind === 'media' ? 'media' : 'text'; } catch { /* default to text */ }
        const chooser = wanted === 'media'
            ? { prompt: 'Choose an image or video', types: '"public.image", "public.movie", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "ogg"' }
            : { prompt: 'Choose a text or Markdown file', types: '"public.plain-text", "net.daringfireball.markdown", "txt", "md", "markdown"' };
        const script = `tell application "System Events"\n activate\n set chosen to choose file with prompt "${chooser.prompt}" of type {${chooser.types}}\n return POSIX path of chosen\nend tell`;
        execFile('osascript', ['-e', script], { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
            if (error) return /-128|User canceled/i.test(`${stderr} ${error.message}`) ? respond(200, { cancelled: true }) : respond(500, { error: 'Could not open the file chooser' });
            respond(200, { path: stdout.trim() });
        });
        return;
    }

    if (pathname === '/api/custom-overlays/assets' && req.method === 'GET') {
        let files = [];
        try { files = fs.readdirSync(CUSTOM_OVERLAY_ASSETS_DIR).filter(name => !name.startsWith('.')); } catch { /* folder not created yet */ }
        const serialized = Object.values(customOverlays).map(overlay => ({ id: overlay.id, name: overlay.name, text: JSON.stringify(overlay) }));
        const assets = files.map(name => {
            let stat;
            try { stat = fs.statSync(path.join(CUSTOM_OVERLAY_ASSETS_DIR, name)); } catch { return null; }
            if (!stat.isFile()) return null;
            const kind = assetKind(name);
            const family = kind === 'font' ? assetFontFamily(name) : null;
            const usedBy = [...serialized.filter(o => assetReferencedIn(o.text, name, family)).map(({ id, name: overlayName }) => ({ id, name: overlayName })), ...timerSoundUsers(name), ...creditsAssetUsers(name), ...gamePlanAssetUsers(name)];
            return { name, kind, family, label: assetLabel(name), url: `/custom-overlay-assets/${encodeURIComponent(name)}`, size: stat.size, modifiedAt: stat.mtime.toISOString(), usedBy, tags: assetTags[name] || [], caption: assetCaptions[name] || '' };
        }).filter(Boolean).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(assets));
        return;
    }

    const assetItemMatch = pathname.match(/^\/api\/custom-overlays\/assets\/([^/]+?)(\/rename)?$/);
    if (assetItemMatch && (req.method === 'DELETE' || (req.method === 'POST' && assetItemMatch[2]))) {
        const respond = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        let name;
        try { name = decodeURIComponent(assetItemMatch[1]); } catch { return respond(400, { error: 'Invalid asset name' }); }
        const target = path.join(CUSTOM_OVERLAY_ASSETS_DIR, name);
        if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.') || path.dirname(target) !== CUSTOM_OVERLAY_ASSETS_DIR) return respond(400, { error: 'Invalid asset name' });
        if (!fs.existsSync(target)) return respond(404, { error: 'Asset not found' });
        const family = assetKind(name) === 'font' ? assetFontFamily(name) : null;

        if (req.method === 'DELETE') {
            const usedBy = [...Object.values(customOverlays).filter(o => assetReferencedIn(JSON.stringify(o), name, family)).map(o => o.id), ...timerSoundUsers(name).map(u => u.id), ...creditsAssetUsers(name).map(u => u.id), ...gamePlanAssetUsers(name).map(u => u.id)];
            if (usedBy.length && new URL(req.url, 'http://localhost').searchParams.get('force') !== '1') return respond(409, { error: 'Asset is used by an overlay', usedBy });
            try { fs.unlinkSync(target); if (assetTags[name]) { delete assetTags[name]; saveAssetTags(); } if (assetCaptions[name] !== undefined) { delete assetCaptions[name]; saveAssetCaptions(); } respond(200, { deleted: name }); } catch (err) { respond(500, { error: err.message }); }
            return;
        }

        let payload;
        try { payload = JSON.parse(await readRequestBody(req) || '{}'); } catch { return respond(400, { error: 'Invalid JSON' }); }
        const ext = path.extname(name);
        const prefix = (name.match(/^([a-z0-9]{6,})-/) || [])[1];
        const label = String(payload.name || '').trim().replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[^a-zA-Z0-9._ ()-]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 100);
        if (!label) return respond(400, { error: 'Enter a name using letters, numbers, dashes or underscores' });
        const newName = `${prefix ? `${prefix}-` : ''}${label}${ext}`;
        if (newName === name) return respond(200, { name, renamed: false, updated: [] });
        const newTarget = path.join(CUSTOM_OVERLAY_ASSETS_DIR, newName);
        if (fs.existsSync(newTarget)) return respond(409, { error: 'An asset with that name already exists' });
        try { fs.renameSync(target, newTarget); } catch (err) { return respond(500, { error: err.message }); }
        if (assetTags[name]) { assetTags[newName] = assetTags[name]; delete assetTags[name]; saveAssetTags(); }
        if (assetCaptions[name] !== undefined) { assetCaptions[newName] = assetCaptions[name]; delete assetCaptions[name]; saveAssetCaptions(); }

        const newFamily = family ? assetFontFamily(newName) : null;
        const updated = [];
        for (const [id, overlay] of Object.entries(customOverlays)) {
            let text = JSON.stringify(overlay);
            const rewritten = rewriteAssetReferences(text, name, newName, family, newFamily);
            if (rewritten === text) continue;
            try {
                const next = normalizeCustomOverlay({ ...JSON.parse(rewritten), id, revision: overlay.revision, createdAt: overlay.createdAt });
                customOverlays[id] = next;
                updated.push(id);
            } catch { /* leave the overlay untouched if the rewritten copy is invalid */ }
        }
        if (rewriteTimerSoundReferences(name, newName)) updated.push('timers');
        if (rewriteGamePlanReferences(name, newName)) updated.push('game-plan');
        if (rewriteCreditsReferences(name, newName)) updated.push('credits');
        if (updated.some(id => customOverlays[id])) {
            saveCustomOverlays();
            for (const id of updated.filter(id => customOverlays[id])) broadcastToOverlays('custom-overlay-update', { id, overlay: customOverlays[id] });
        }
        respond(200, { name: newName, url: `/custom-overlay-assets/${encodeURIComponent(newName)}`, renamed: true, updated });
        return;
    }

    if (pathname === '/api/custom-overlays/assets' && req.method === 'POST') {
        const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const allowedTypes = new Set([
            'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
            'video/mp4', 'video/webm', 'video/ogg',
            'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg',
            'text/plain', 'text/markdown'
        ]);
        const declaredName = String(req.headers['x-asset-name'] || 'asset').trim();
        const safeBase = path.basename(declaredName).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'asset';
        const audioExts = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.oga' };
        const typeExt = { 'text/plain': '.txt', 'text/markdown': '.md' }[contentType] || audioExts[contentType] || (contentType.split('/')[1] === 'jpeg' ? '.jpg' : `.${contentType.split('/')[1] || ''}`);
        // Audio-in-Ogg uses .oga so it is not mistaken for the video .ogg type.
        const namedBase = contentType === 'audio/ogg' ? safeBase.replace(/\.ogg$/i, '') : safeBase;
        const filename = `${Date.now().toString(36)}-${namedBase.includes('.') ? namedBase : `${namedBase}${typeExt}`}`;
        const target = path.join(CUSTOM_OVERLAY_ASSETS_DIR, filename);
        if (!allowedTypes.has(contentType)) {
            res.writeHead(415, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Only common image, video, audio (MP3, WAV, M4A, AAC, OGG) and font (TTF, OTF, WOFF, WOFF2) and text (TXT, MD) asset types are supported' }));
            return;
        }
        if (Number(req.headers['content-length'] || 0) > 100 * 1024 * 1024) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Asset exceeds the 100 MB limit' }));
            return;
        }
        const chunks = [];
        let total = 0;
        req.on('data', chunk => {
            total += chunk.length;
            if (total <= 100 * 1024 * 1024) chunks.push(chunk);
        });
        req.on('end', () => {
            if (total > 100 * 1024 * 1024) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Asset exceeds the 100 MB limit' }));
                return;
            }
            try {
                fs.writeFileSync(target, Buffer.concat(chunks));
                const uploadTags = normalizeAssetTagList(decodeURIComponent(String(req.headers['x-asset-tags'] || '')));
                if (uploadTags.length) { setAssetTags(filename, uploadTags); saveAssetTags(); }
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ url: `/custom-overlay-assets/${encodeURIComponent(filename)}`, name: filename, type: contentType, size: total }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        req.on('error', err => {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        });
        return;
    }

    const historyMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/history(?:\/(\d+))?$/);
    if (historyMatch && req.method === 'GET') {
        const id = sanitizeOverlayId(decodeURIComponent(historyMatch[1]));
        const list = readOverlayHistory(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (historyMatch[2]) {
            const entry = list.find(item => item.revision === Number(historyMatch[2]));
            if (!entry) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Revision not found' })); return; }
            res.end(JSON.stringify(entry));
        } else {
            res.end(JSON.stringify({ current: customOverlays[id]?.revision || 0, revisions: list.map(({ revision, updatedAt, name, elements }) => ({ revision, updatedAt, name, elementCount: (elements || []).length })).reverse() }));
        }
        return;
    }

    const customOverlayMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)$/);
    if (pathname === '/api/custom-overlays' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.values(customOverlays).map(({ id, name, revision, updatedAt, createdAt, canvas, elements, pages }) => ({
            id, name, revision, updatedAt, createdAt, canvas, elementCount: (elements || []).length, pageCount: pages?.enabled ? pages.items.length : 0
        }))));
        return;
    }

    // Bulk tag edit: { names: [...], add: [...], remove: [...] }
    if (pathname === '/api/asset-tags' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const names = (Array.isArray(body.names) ? body.names : []).map(String).filter(name => name && !/[\\/]/.test(name) && fs.existsSync(path.join(CUSTOM_OVERLAY_ASSETS_DIR, name)));
            if (!names.length) throw new Error('No matching assets');
            const add = normalizeAssetTagList(body.add);
            const remove = new Set(normalizeAssetTagList(body.remove).map(tag => tag.toLowerCase()));
            for (const name of names) {
                const current = (assetTags[name] || []).filter(tag => !remove.has(tag.toLowerCase()));
                setAssetTags(name, body.set ? body.set : [...current, ...add]);
            }
            saveAssetTags();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, updated: names.length }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (pathname === '/api/asset-captions' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const name = String(body.name || '');
            if (!name || /[\\/]/.test(name) || !fs.existsSync(path.join(CUSTOM_OVERLAY_ASSETS_DIR, name))) throw new Error('Unknown asset');
            const caption = String(body.caption || '').trim().slice(0, 300);
            if (caption) assetCaptions[name] = caption; else delete assetCaptions[name];
            saveAssetCaptions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // Tag manager: rename (also merges into an existing tag) or delete a tag everywhere, including slideshow settings.
    if (pathname === '/api/asset-tags/manage' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const tag = normalizeAssetTagList([body.tag])[0];
            if (!tag) throw new Error('Missing tag');
            const key = tag.toLowerCase();
            const to = body.action === 'rename' ? normalizeAssetTagList([body.to])[0] : null;
            if (body.action === 'rename' && !to) throw new Error('Missing new name');
            if (body.action !== 'rename' && body.action !== 'delete') throw new Error('Unknown action');
            let touched = 0;
            for (const name of Object.keys(assetTags)) {
                if (!assetTags[name].some(item => item.toLowerCase() === key)) continue;
                setAssetTags(name, assetTags[name].flatMap(item => item.toLowerCase() === key ? (to ? [to] : []) : [item]));
                touched++;
            }
            saveAssetTags();
            const updated = [];
            for (const [id, overlay] of Object.entries(customOverlays)) {
                let changed = false;
                for (const element of overlay.elements || []) {
                    if (element.type !== 'slideshow' || !(element.slideshow?.tags || []).some(item => item.toLowerCase() === key)) continue;
                    element.slideshow.tags = normalizeAssetTagList(element.slideshow.tags.flatMap(item => item.toLowerCase() === key ? (to ? [to] : []) : [item]));
                    changed = true;
                }
                if (changed) updated.push(id);
            }
            if (updated.length) {
                saveCustomOverlays();
                for (const id of updated) broadcastToOverlays('custom-overlay-update', { id, overlay: customOverlays[id] });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, assets: touched, overlays: updated }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // Lightweight list for slideshows: assets matching tags (any/all) and media kinds, newest first.
    if (pathname === '/api/asset-library' && req.method === 'GET') {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const tags = normalizeAssetTagList(params.get('tags'));
        const mode = params.get('mode') === 'all' ? 'all' : 'any';
        const kinds = params.get('kinds') === 'both' ? ['image', 'video'] : [params.get('kinds') === 'video' ? 'video' : 'image'];
        let files = [];
        try { files = fs.readdirSync(CUSTOM_OVERLAY_ASSETS_DIR).filter(name => !name.startsWith('.')); } catch { /* folder not created yet */ }
        const wantedNames = params.get('names');
        const pick = wantedNames !== null ? new Set(wantedNames.split('\n').filter(Boolean)) : null;
        const describe = name => ({ name, kind: assetKind(name), label: assetLabel(name), caption: assetCaptions[name] || '', url: `/custom-overlay-assets/${encodeURIComponent(name)}` });
        const out = pick
            ? [...pick].filter(name => files.includes(name) && kinds.includes(assetKind(name))).map(describe)
            : files.filter(name => kinds.includes(assetKind(name)) && assetMatchesTags(name, tags, mode)).sort().reverse().map(describe);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(out));
        return;
    }

    if (pathname === '/api/overlay-presets' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(overlayPresets));
        return;
    }
    if (pathname === '/api/overlay-presets' && req.method === 'POST') {
        try {
            const [preset] = normalizeOverlayPresets([JSON.parse(await readRequestBody(req) || '{}')]);
            if (!preset) throw new Error('A preset needs an id and at least one element');
            const index = overlayPresets.findIndex(item => item.id === preset.id);
            if (index >= 0) overlayPresets[index] = preset;
            else if (overlayPresets.length >= 100) throw new Error('Preset limit reached (100). Delete some first.');
            else overlayPresets.push(preset);
            saveOverlayPresets();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(preset));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    const presetMatch = pathname.match(/^\/api\/overlay-presets\/([^/]+)$/);
    if (presetMatch && req.method === 'DELETE') {
        const id = sanitizeOverlayId(decodeURIComponent(presetMatch[1]));
        const before = overlayPresets.length;
        overlayPresets = overlayPresets.filter(item => item.id !== id);
        if (overlayPresets.length !== before) saveOverlayPresets();
        res.writeHead(overlayPresets.length !== before ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: overlayPresets.length !== before }));
        return;
    }

    if (pathname === '/api/custom-overlays' && req.method === 'POST') {
        try {
            const payload = JSON.parse(await readRequestBody(req) || '{}');
            const overlay = normalizeCustomOverlay(payload);
            if (customOverlays[overlay.id]) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'An overlay with that id already exists' }));
                return;
            }
            customOverlays[overlay.id] = overlay;
            saveCustomOverlays();
            syncOverlayPages(overlay);
            broadcastToOverlays('custom-overlay-update', { id: overlay.id, overlay });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(overlay));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    const overlayPageMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/page$/);
    if (overlayPageMatch && (req.method === 'GET' || req.method === 'POST')) {
        const respond = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
        const overlay = customOverlays[sanitizeOverlayId(decodeURIComponent(overlayPageMatch[1]))];
        if (!overlay) return respond(404, { error: 'Overlay not found' });
        if (req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const action = String(body.action || '');
                if (!overlay.pages.enabled) return respond(400, { error: 'Pages are not enabled for this overlay' });
                if (action === 'auto') setPageAuto(overlay, typeof body.auto === 'boolean' ? body.auto : undefined);
                else if (['enable', 'disable', 'toggle'].includes(action)) {
                    const targets = (Array.isArray(body.page) ? body.page : [body.page]).map(value => String(value ?? '').trim().toLowerCase());
                    const items = overlay.pages.items;
                    const found = targets.map(key => items.find((item, i) => item.id === key || item.name.toLowerCase() === key || (/^\d+$/.test(key) && i === Number(key) - 1)));
                    if (!targets.length || found.some(item => !item)) return respond(404, { error: 'Page not found' });
                    const wanted = found.map(item => action === 'toggle' ? !item.enabled : action === 'enable');
                    const after = items.map(item => { const at = found.indexOf(item); return at >= 0 ? wanted[at] : item.enabled; });
                    if (!after.some(Boolean)) return respond(400, { error: 'At least one page must stay enabled' });
                    found.forEach((item, at) => { item.enabled = wanted[at]; });
                    saveCustomOverlays();
                    syncOverlayPages(overlay, overlay);
                    broadcastToOverlays('custom-overlay-update', { id: overlay.id, overlay });
                    broadcastPage(overlay);
                }
                else if (['next', 'prev', 'first', 'last', 'goto'].includes(action)) {
                    if (!movePage(overlay, action, { target: body.page }) && action === 'goto') return respond(404, { error: 'Page not found' });
                } else return respond(400, { error: 'action must be next, prev, first, last, goto, auto, enable, disable or toggle' });
            } catch (err) { return respond(400, { error: err.message }); }
        }
        return respond(200, pageSnapshot(overlay));
    }

    if (pathname === '/api/slideshows' && req.method === 'GET') {
        const slideshows = [];
        for (const overlay of Object.values(customOverlays)) {
            for (const element of overlay.elements || []) {
                if (element.type !== 'slideshow') continue;
                const live = slideshowStates.get(`${overlay.id}::${element.id}`);
                slideshows.push({
                    overlayId: overlay.id,
                    overlayName: overlay.name,
                    elementId: element.id,
                    name: element.name || element.id,
                    live: !!live,
                    paused: live ? live.paused : null,
                    position: live ? live.position : 0,
                    count: live ? live.count : 0
                });
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ slideshows }));
        return;
    }

    const slideshowControlMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/slideshow$/);
    if (slideshowControlMatch && req.method === 'POST') {
        const respond = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
        const overlay = customOverlays[sanitizeOverlayId(decodeURIComponent(slideshowControlMatch[1]))];
        if (!overlay) return respond(404, { error: 'Overlay not found' });
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const action = String(body.action || '');
            if (!['next', 'prev', 'pause', 'play', 'toggle'].includes(action)) return respond(400, { error: 'action must be next, prev, pause, play or toggle' });
            const element = body.element ? String(body.element) : '';
            broadcastToOverlays('custom-overlay-slideshow', { id: overlay.id, action, element });
            return respond(200, { ok: true, action, element: element || 'all', listeners: overlayClients.size });
        } catch (err) { return respond(400, { error: err.message }); }
    }

    const overlayIdRenameMatch = pathname.match(/^\/api\/custom-overlays\/([^/]+)\/rename-id$/);
    if (overlayIdRenameMatch && req.method === 'POST') {
        const respond = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        try {
            const oldId = sanitizeOverlayId(decodeURIComponent(overlayIdRenameMatch[1]));
            const { newId: requested } = JSON.parse(await readRequestBody(req) || '{}');
            const newId = sanitizeOverlayId(requested);
            if (!customOverlays[oldId]) return respond(404, { error: 'Overlay not found' });
            if (!newId) return respond(400, { error: 'Enter an id using letters, numbers, - or _' });
            if (newId === oldId) return respond(200, customOverlays[oldId]);
            if (customOverlays[newId]) return respond(409, { error: 'An overlay with that id already exists' });
            const overlay = { ...customOverlays[oldId], id: newId, updatedAt: new Date().toISOString() };
            delete customOverlays[oldId];
            customOverlays[newId] = overlay;
            saveCustomOverlays();
            try { if (fs.existsSync(historyFile(oldId))) fs.renameSync(historyFile(oldId), historyFile(newId)); } catch { /* history is optional */ }
            broadcastToOverlays('custom-overlay-update', { id: oldId, overlay: null });
            broadcastToOverlays('custom-overlay-update', { id: newId, overlay });
            return respond(200, overlay);
        } catch (err) { return respond(400, { error: err.message }); }
    }

    if (customOverlayMatch && req.method === 'GET') {
        const id = sanitizeOverlayId(decodeURIComponent(customOverlayMatch[1]));
        const overlay = customOverlays[id];
        if (!overlay) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Overlay not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(overlay));
        return;
    }

    if (customOverlayMatch && req.method === 'PUT') {
        try {
            const id = sanitizeOverlayId(decodeURIComponent(customOverlayMatch[1]));
            if (!customOverlays[id]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Overlay not found' }));
                return;
            }
            const payload = JSON.parse(await readRequestBody(req) || '{}');
            const overlay = normalizeCustomOverlay({
                ...payload,
                id,
                revision: customOverlays[id].revision + 1,
                updatedAt: new Date().toISOString()
            }, id);
            recordOverlayRevision(customOverlays[id]);
            const previous = customOverlays[id];
            customOverlays[id] = overlay;
            saveCustomOverlays();
            syncOverlayPages(overlay, previous);
            broadcastToOverlays('custom-overlay-update', { id, overlay });
            broadcastPage(overlay);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(overlay));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (customOverlayMatch && req.method === 'DELETE') {
        const id = sanitizeOverlayId(decodeURIComponent(customOverlayMatch[1]));
        if (!customOverlays[id]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Overlay not found' }));
            return;
        }
        delete customOverlays[id];
        dropOverlayPages(id);
        saveCustomOverlays();
        try { fs.unlinkSync(historyFile(id)); } catch { /* no history */ }
        broadcastToOverlays('custom-overlay-update', { id, overlay: null });
        res.writeHead(204);
        res.end();
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
                    const previous = JSON.parse(JSON.stringify(current));

                    // Connection settings are applied at startup, so they save to config.json and ask for a restart.
                    if (typeof updates.ssn_session_id === 'string') {
                        const id = updates.ssn_session_id.trim();
                        if (id) {
                            if (!/^[\w-]{1,100}$/.test(id)) throw new Error('SocialStream session ID can only contain letters, numbers, - and _');
                            current.ssn = { ...(current.ssn || {}), session_id: id };
                        }
                    }
                    const setInterval_ = (key, min, max, fallback) => {
                        if (updates[key] === undefined) return;
                        const value = Math.max(min, Math.min(max, Math.round(Number(updates[key])) || fallback));
                        if (value !== (previous[key] || fallback)) current[key] = value;
                    };
                    setInterval_('twitch_refresh_minutes', 1, 1440, 10);
                    setInterval_('twitch_stream_info_seconds', 10, 3600, 30);

                    // Only allow safe fields to be edited
                    const safeFields = ['days_filter', 'active_subs_only', 'exclude_users', 'banned_users', 'hashtags_enabled', 'hashtag_max_length', 'chat_log_enabled', 'chatbot_enabled', 'credits', 'auto_backup_on_session_end', 'rate_limit', 'theme', 'music', 'viewer_tracking', 'weather', 'goals'];
                    for (const key of safeFields) {
                        if (updates[key] !== undefined) {
                            current[key] = key === 'hashtag_max_length'
                                ? Math.max(10, Math.min(100, Math.round(Number(updates[key])) || 50))
                                : updates[key];
                        }
                    }

                    safeWriteFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
                    applyRuntimeConfig(current);

                    console.log('[Config] Updated and hot-reloaded');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    const restartFields = getRestartRequiredConfigChanges(previous, current);
                    res.end(JSON.stringify({ status: 'saved', message: 'Config updated and applied', restartRequired: restartFields.length > 0, restartFields }));
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
            hashtag_max_length: Number(config.hashtag_max_length) || 50,
            chatbot_enabled: config.chatbot_enabled === true,
            chat_log_enabled: config.chat_log_enabled !== false,
            broadcaster_name: BROADCASTER_NAME,
            connection: {
                port: PORT,
                broadcaster_name: BROADCASTER_NAME,
                broadcaster_id: config.broadcaster_id || null,
                ssn_server: config.ssn?.server || null,
                ssn_session_configured: !!config.ssn?.session_id,
                ssn_session_id: config.ssn?.session_id || '',
                twitch_client_configured: !!TWITCH_CLIENT_ID,
                twitch_auth_mode: TWITCH_CLIENT_SECRET ? 'own_app' : 'shared_device',
                subs_source: config.subs_source || 'twitch',
                twitch_refresh_minutes: REFRESH_MINUTES,
                twitch_stream_info_seconds: STREAM_INFO_POLL_SECONDS
            },
            exclude_users: config.exclude_users || [],
            banned_users: config.banned_users || [],
            days_filter: config.days_filter || 30,
            credits: config.credits || {},
            auto_backup_on_session_end: config.auto_backup_on_session_end || false,
            rate_limit: config.rate_limit || { enabled: false, requests_per_minute: 120, mutation_per_minute: 30 },
            theme: config.theme || {},
            music: config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 },
            viewer_tracking: normalizeViewerTrackingConfig(config.viewer_tracking),
            weather: normalizeWeatherConfig(config.weather),
            goals: normalizeGoalsConfig(config.goals || DEFAULT_GOALS_CONFIG)
        }));
        return;
    }

    if (pathname === '/api/fetch' || pathname === '/api/twitch/fetch-data') {
        const result = await fetchTwitchData();
        fetchStreamInfo();
        fetchViewerCount();
        fetchTwitchPoll();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: result?.error ? 'error' : 'ok', ...result }));
        return;
    }

    if (pathname === '/api/polls/latest' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', poll: twitchService.getLatestPoll() }));
        return;
    }

    if (pathname === '/api/polls/test' && req.method === 'POST') {
        const testPoll = {
            id: `test-${Date.now()}`,
            title: 'Which game should we play next?',
            status: 'COMPLETED',
            winner: 'Elden Ring',
            winningVotes: 142,
            winningPercent: 68,
            totalVotes: 210,
            choices: [
                { id: '1', title: 'Elden Ring', votes: 142, percent: 68, channel_points_votes: 12, bits_votes: 0 },
                { id: '2', title: 'Hollow Knight', votes: 45, percent: 21, channel_points_votes: 0, bits_votes: 0 },
                { id: '3', title: 'Celeste', votes: 23, percent: 11, channel_points_votes: 0, bits_votes: 0 }
            ],
            duration: 300,
            startedAt: new Date(Date.now() - 300000).toISOString(),
            endedAt: new Date().toISOString()
        };
        twitchService.setLatestPoll(testPoll);
        console.log(`[Twitch] Test poll triggered: "${testPoll.title}" — Winner: "${testPoll.winner}"`);
        takeoverPages('poll-end', testPoll.title, 15000);
        broadcastToOverlays('poll-update', testPoll);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', poll: testPoll }));
        return;
    }

    if (pathname.startsWith('/api/variables') && await variablesStore.handleApi(req, res, pathname, readRequestBody)) return;
    if (pathname.startsWith('/api/chatbot') && await chatbot.handleApi(req, res, pathname, readRequestBody)) return;

    if (pathname === '/api/randomizer/presets' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, presets: loadRandomizerPresets() }));
        return;
    }

    if (pathname === '/api/randomizer/presets' && req.method === 'POST') {
        try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw || '{}');
            const name = String(body.name || '').trim();
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Preset name is required' }));
                return;
            }
            const choices = Array.isArray(body.choices)
                ? body.choices.map(c => String(c).trim()).filter(Boolean)
                : String(body.choices || '').split('\n').map(c => c.trim()).filter(Boolean);
            if (!choices.length) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Preset choices cannot be empty' }));
                return;
            }

            const presets = loadRandomizerPresets();
            let presetId = body.id ? String(body.id).trim() : null;
            const winnerHeader = body.winnerHeader !== undefined ? String(body.winnerHeader).trim() : undefined;
            const winnerSub = body.winnerSub !== undefined ? String(body.winnerSub).trim() : undefined;
            const buttonPreset = body.buttonPreset !== undefined ? String(body.buttonPreset).trim() : undefined;
            const buttonPhrases = Array.isArray(body.buttonPhrases)
                ? body.buttonPhrases.map(s => String(s).trim()).filter(Boolean)
                : (typeof body.buttonPhrases === 'string' ? body.buttonPhrases.split('\n').map(s => s.trim()).filter(Boolean) : undefined);
            let updatedPreset;
            if (presetId) {
                const idx = presets.findIndex(p => p.id === presetId);
                if (idx !== -1) {
                    presets[idx] = {
                        ...presets[idx],
                        name,
                        choices,
                        ...(winnerHeader !== undefined ? { winnerHeader } : {}),
                        ...(winnerSub !== undefined ? { winnerSub } : {}),
                        ...(buttonPreset !== undefined ? { buttonPreset } : {}),
                        ...(buttonPhrases !== undefined ? { buttonPhrases } : {}),
                        updatedAt: Date.now()
                    };
                    updatedPreset = presets[idx];
                }
            }
            if (!updatedPreset) {
                presetId = presetId || 'preset_' + Date.now();
                updatedPreset = {
                    id: presetId,
                    name,
                    choices,
                    winnerHeader: winnerHeader || '',
                    winnerSub: winnerSub || '',
                    buttonPreset: buttonPreset || 'chaos',
                    buttonPhrases: buttonPhrases || [],
                    createdAt: Date.now()
                };
                presets.push(updatedPreset);
            }
            saveRandomizerPresets(presets);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, preset: updatedPreset, presets }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if ((pathname.startsWith('/api/randomizer/presets/') && req.method === 'DELETE') ||
        (pathname === '/api/randomizer/presets/delete' && req.method === 'POST')) {
        try {
            let idToDelete = '';
            if (pathname.startsWith('/api/randomizer/presets/')) {
                idToDelete = decodeURIComponent(pathname.slice('/api/randomizer/presets/'.length));
            } else {
                const raw = await readRequestBody(req);
                const body = JSON.parse(raw || '{}');
                idToDelete = body.id;
            }
            let presets = loadRandomizerPresets();
            presets = presets.filter(p => p.id !== idToDelete);
            saveRandomizerPresets(presets);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, presets }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Button Phrase Presets CRUD
    if (pathname === '/api/randomizer/button-presets' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, presets: loadRandomizerButtonPresets() }));
        return;
    }

    if (pathname === '/api/randomizer/button-presets' && req.method === 'POST') {
        try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw || '{}');
            const name = String(body.name || '').trim();
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Preset name is required' }));
                return;
            }
            const phrases = Array.isArray(body.phrases)
                ? body.phrases.map(s => String(s).trim()).filter(Boolean)
                : String(body.phrases || '').split('\n').map(s => s.trim()).filter(Boolean);
            if (!phrases.length) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Button phrases cannot be empty' }));
                return;
            }

            const presets = loadRandomizerButtonPresets();
            let presetId = body.id ? String(body.id).trim() : null;
            let updatedPreset;
            if (presetId) {
                const idx = presets.findIndex(p => p.id === presetId);
                if (idx !== -1) {
                    presets[idx] = {
                        ...presets[idx],
                        name,
                        phrases,
                        updatedAt: Date.now()
                    };
                    updatedPreset = presets[idx];
                }
            }
            if (!updatedPreset) {
                presetId = presetId || 'btn_' + Date.now();
                updatedPreset = {
                    id: presetId,
                    name,
                    phrases,
                    createdAt: Date.now()
                };
                presets.push(updatedPreset);
            }
            saveRandomizerButtonPresets(presets);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, preset: updatedPreset, presets }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if ((pathname.startsWith('/api/randomizer/button-presets/') && req.method === 'DELETE') ||
        (pathname === '/api/randomizer/button-presets/delete' && req.method === 'POST')) {
        try {
            let idToDelete = '';
            if (pathname.startsWith('/api/randomizer/button-presets/')) {
                idToDelete = decodeURIComponent(pathname.slice('/api/randomizer/button-presets/'.length));
            } else {
                const raw = await readRequestBody(req);
                const body = JSON.parse(raw || '{}');
                idToDelete = body.id;
            }
            let presets = loadRandomizerButtonPresets();
            presets = presets.filter(p => p.id !== idToDelete);
            saveRandomizerButtonPresets(presets);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, presets }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Quote Pool Presets CRUD
    if (pathname === '/api/randomizer/quote-presets' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, presets: loadRandomizerQuotePresets() }));
        return;
    }

    if (pathname === '/api/randomizer/quote-presets' && req.method === 'POST') {
        try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw || '{}');
            const name = String(body.name || '').trim();
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Preset name is required' }));
                return;
            }
            const quotes = Array.isArray(body.quotes)
                ? body.quotes.map(s => String(s).trim()).filter(Boolean)
                : String(body.quotes || '').split('\n').map(s => s.trim()).filter(Boolean);
            if (!quotes.length) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Quotes cannot be empty' }));
                return;
            }

            const presets = loadRandomizerQuotePresets();
            let presetId = body.id ? String(body.id).trim() : null;
            let updatedPreset;
            if (presetId) {
                const idx = presets.findIndex(p => p.id === presetId);
                if (idx !== -1) {
                    presets[idx] = {
                        ...presets[idx],
                        name,
                        quotes,
                        updatedAt: Date.now()
                    };
                    updatedPreset = presets[idx];
                }
            }
            if (!updatedPreset) {
                presetId = presetId || 'quote_' + Date.now();
                updatedPreset = {
                    id: presetId,
                    name,
                    quotes,
                    createdAt: Date.now()
                };
                presets.push(updatedPreset);
            }
            saveRandomizerQuotePresets(presets);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, preset: updatedPreset, presets }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if ((pathname.startsWith('/api/randomizer/quote-presets/') && req.method === 'DELETE') ||
        (pathname === '/api/randomizer/quote-presets/delete' && req.method === 'POST')) {
        try {
            let idToDelete = '';
            if (pathname.startsWith('/api/randomizer/quote-presets/')) {
                idToDelete = decodeURIComponent(pathname.slice('/api/randomizer/quote-presets/'.length));
            } else {
                const raw = await readRequestBody(req);
                const body = JSON.parse(raw || '{}');
                idToDelete = body.id;
            }
            let presets = loadRandomizerQuotePresets();
            presets = presets.filter(p => p.id !== idToDelete);
            saveRandomizerQuotePresets(presets);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, presets }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Spin Endpoint (Supports POST with JSON or GET for Bitfocus Companion Stream Deck actions!)
    if (pathname === '/api/randomizer/spin' && (req.method === 'POST' || req.method === 'GET')) {
        try {
            let body = {};
            if (req.method === 'POST') {
                const raw = await readRequestBody(req);
                body = JSON.parse(raw || '{}');
            }
            const query = Object.fromEntries(url.searchParams.entries());
            const presetId = body.preset || query.preset || null;
            let choices = Array.isArray(body.choices) ? body.choices.map(c => String(c).trim()).filter(Boolean) : [];
            let winnerHeader = body.winnerHeader || query.winHeader || query.winnerHeader || '';
            let winnerSub = body.winnerSub || query.winSub || query.winnerSub || '';
            let buttonPhrases = Array.isArray(body.buttonPhrases) ? body.buttonPhrases : [];

            // If no choices provided or preset specified, load from preset
            if (!choices.length) {
                const presets = loadRandomizerPresets();
                const matched = (presetId ? presets.find(p => p.id === presetId) : null) || presets[0];
                if (matched) {
                    choices = matched.choices || [];
                    if (!winnerHeader && matched.winnerHeader) winnerHeader = matched.winnerHeader;
                    if (!winnerSub && matched.winnerSub) winnerSub = matched.winnerSub;
                    if (!buttonPhrases.length && matched.buttonPhrases) buttonPhrases = matched.buttonPhrases;
                }
            }

            const winner = body.winner || query.winner || (choices.length ? choices[Math.floor(Math.random() * choices.length)] : 'Winner');
            const mode = body.mode || query.mode || 'roller';
            const suspense = body.suspense || query.suspense || 'normal';
            const duration = Number(body.duration || query.duration) || 6;
            const autohide = body.autohide !== undefined ? Number(body.autohide) : (query.autohide !== undefined ? Number(query.autohide) : 8);
            const theme = body.theme || query.theme || '';
            const accent = body.accent || query.accent || '';
            const font = body.font || query.font || '';

            const payload = {
                preset: presetId,
                choices,
                winner,
                winnerHeader,
                winnerSub,
                mode,
                suspense,
                theme,
                duration,
                autohide,
                accent,
                font,
                weight: body.weight || query.weight || '',
                text: body.text || query.text || '',
                outline: body.outline || query.outline || '',
                bg: body.bg || query.bg || '',
                scale: body.scale || query.scale || '',
                buttonPhrases,
                showButton: body.showButton !== undefined ? !!body.showButton : (query.button === '1'),
                buttonText: body.buttonText || query.btnText || '',
                at: Date.now()
            };
            broadcastToOverlays('randomizer-spin', payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, winner, preset: presetId, mode, theme, payload }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/randomizer/chatters' && req.method === 'GET') {
        const chatters = Object.keys(chatData?.chatters || {}).concat(Object.keys(statsData?.chatters || {}));
        const unique = [...new Set(chatters.map(c => c.trim()).filter(Boolean))];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ chatters: unique }));
        return;
    }

    if (pathname === '/favicon.ico') {
        try {
            const favPath = fs.existsSync(path.join(__dirname, 'public', 'favicon.svg')) ? path.join(__dirname, 'public', 'favicon.svg') : path.join(__dirname, 'favicon.svg');
            const icon = fs.readFileSync(favPath);
            res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
            res.end(icon);
        } catch {
            res.writeHead(404);
            res.end();
        }
        return;
    }

    if (pathname === '/api/status') {
        // Directory listings and hashtag aggregation are comparatively expensive and the dashboard polls every few seconds.
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
        const status = {
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
                clipCandidates: clipCandidates.length
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
            overlayClients: overlayClients.size,
            sessionActive,
            lifecycle: getLifecycleStatus(),
            sessionPhase: getSessionPhase(),
            streamStartedAt: normalizeViewerStats(chatData.viewerStats).streamStartedAt || null,
            lastSessionEndedAt: lifecycleMemo.lastArchive?.endedAt ? new Date(lifecycleMemo.lastArchive.endedAt).toISOString() : null,
            startedAt: chatData.startedAt,
            hourlyMessages: chatData.hourlyMessages,
            streamInfo: chatData.streamInfo,
            topChatters: Object.values(chatData.chatters)
                .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
                .slice(0, 100)
                .map(c => ({ chatname: c.chatname, chatimg: c.chatimg || '', messageCount: c.messageCount || 0 })),
            recentChat: recentChatSummary(),
            recentEvents: buildRecentEvents(12),
            milestones: computeMilestones()
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
        return;
    }

    if (pathname === '/api/viewers' && req.method === 'GET') {
        const summary = getViewerSummary();
        const includeSamples = url.searchParams.get('samples') !== 'false';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(includeSamples ? summary : { ...summary, samples: undefined }));
        return;
    }

    if (await handleGoalsRoutes(req, res, pathname)) return;

    if (pathname === '/api/clip-candidates' && req.method === 'GET') {
        const sessionFilter = url.searchParams.get('session');
        const statusFilter = url.searchParams.get('status');
        let result = clipCandidates;
        if (sessionFilter) result = result.filter(candidate => candidate.session === sessionFilter);
        if (statusFilter) result = result.filter(candidate => candidate.status === statusFilter);
        result = await resolveCandidateVodUrls(result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.slice().reverse()));
        return;
    }

    if (pathname === '/api/clip-candidates' && req.method === 'POST') {
        try {
            const payload = JSON.parse(await readRequestBody(req) || '{}');
            const reason = String(payload.reason || 'manual-marker').trim().slice(0, 120);
            const details = typeof payload.details === 'object' && payload.details !== null ? payload.details : {};
            const candidate = addClipCandidate(reason || 'manual-marker', details, Number(payload.timestamp) || Date.now(), Number(payload.score) || 0.9);
            if (!candidate) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'A matching candidate was already recorded recently or there is no active session.' }));
                return;
            }
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(candidate));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/clip-candidates/config') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(normalizeClipCandidateConfig(config.clip_candidates)));
            return;
        }
        if (req.method === 'PUT') {
            try {
                const payload = JSON.parse(await readRequestBody(req) || '{}');
                const settings = normalizeClipCandidateConfig(payload);
                const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                current.clip_candidates = settings;
                safeWriteFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
                applyRuntimeConfig(current);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(settings));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }
    }

    if (pathname === '/api/clip-candidates/backfill' && req.method === 'POST') {
        try {
            const payload = JSON.parse(await readRequestBody(req) || '{}');
            const result = backfillClipCandidates(payload.rebuild === true);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'analyzed', ...result }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname.startsWith('/api/clip-candidates/')) {
        const segments = pathname.slice('/api/clip-candidates/'.length).split('/').filter(Boolean).map(decodeURIComponent);
        const candidateId = segments[0];
        const candidate = clipCandidates.find(item => item.id === candidateId);
        if (!candidate) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Clip candidate not found' }));
            return;
        }

        if (segments[1] === 'create' && req.method === 'POST') {
            if (!TWITCH_CLIENT_ID || !BROADCASTER_ID) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Twitch credentials and broadcaster_id are required.' }));
                return;
            }
            if (!(await ensureToken())) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Twitch authorization is required. Re-authorize StreamPulse for clip creation.' }));
                return;
            }

            try {
                const isLiveCandidate = sessionActive && candidate.sessionStartedAt === chatData.startedAt;
                let vodCandidate = null;
                if (!isLiveCandidate) {
                    vodCandidate = (await resolveCandidateVodUrls([candidate]))[0];
                    if (!vodCandidate?.vodId) {
                        res.writeHead(409, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'No matching Twitch VOD was found for this candidate.' }));
                        return;
                    }
                }

                let result;
                if (isLiveCandidate) {
                    result = await twitchCreateClip();
                } else {
                    const editorId = await getTwitchAuthenticatedUserId();
                    if (!editorId) {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Could not identify the authorized Twitch user for VOD clipping. Re-authorize StreamPulse and try again.' }));
                        return;
                    }
                    const duration = Math.min(30, Math.max(5, vodCandidate.vodOffsetSeconds || 0));
                    result = await twitchCreateClipFromVod(
                        editorId,
                        vodCandidate.vodId,
                        vodCandidate.vodOffsetSeconds,
                        duration,
                        candidate.reason
                    );
                }
                if (result.status !== 202 || !result.body.data?.[0]?.id) {
                    const message = result.body.message || `Twitch clip creation failed (${result.status})`;
                    candidate.status = 'failed';
                    candidate.error = message;
                    saveClipCandidates();
                    res.writeHead(result.status === 403 ? 403 : 502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: message, twitchStatus: result.status }));
                    return;
                }

                const clip = result.body.data[0];
                candidate.status = 'created';
                candidate.clipId = clip.id;
                candidate.editUrl = clip.edit_url || null;
                candidate.viewUrl = `https://clips.twitch.tv/${encodeURIComponent(clip.id)}`;
                candidate.createdAt = new Date().toISOString();
                candidate.error = null;
                saveClipCandidates();
                console.log(`[Clips Beta] Twitch clip requested: ${clip.id}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(candidate));
            } catch (err) {
                candidate.status = 'failed';
                candidate.error = err.message;
                saveClipCandidates();
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        if (!segments[1] && req.method === 'DELETE') {
            clipCandidates = clipCandidates.filter(item => item.id !== candidateId);
            saveClipCandidates();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'deleted' }));
            return;
        }
    }

    if (pathname === '/api/reset') {
        resetChatData();
        broadcastToOverlays('update', chatData);
        broadcastToOverlays('viewer-update', getViewerSummary());
        broadcastToOverlays('goals-update', buildGoalsSnapshot());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'reset', message: 'Chat data cleared' }));
        console.log('[API] Chat data reset');
        return;
    }

    if (pathname === '/api/end-session') {
        const { archiveName, streamEndedAt } = endSessionNow();
        // Don't auto-restart a session the streamer just closed while Twitch still shows live
        if (lifecycle.liveStreak > 0) lifecycle.suppressed = true;
        lifecycle.liveId = null;
        lifecycle.lastLiveAt = 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ended', archived: archiveName, streamEndedAt, message: 'Session archived and reset. Server still running.' }));
        console.log('[API] Session ended — ready for next stream');
        return;
    }

    if (pathname === '/api/start-session') {
        startSessionNow();
        lifecycle.suppressed = false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', startedAt: chatData.startedAt, message: 'New session started.' }));
        console.log('[API] New session started');
        return;
    }

    if (pathname === '/api/shutdown') {
        const streamEndedAt = finalizeSessionStreamEnd();
        saveChatData();
        saveStats();
        saveChatLog();
        const archiveName = archiveSession();
        resetChatData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'shutting_down', archived: archiveName, streamEndedAt, message: 'Server shutting down...' }));
        console.log('[API] Shutdown requested');
        setTimeout(() => {
            if (ssnSocket) ssnSocket.close();
            server.close();
            console.log('[Server] Goodbye!');
            process.exit(0);
        }, 500);
        return;
    }

    if (pathname === '/api/restart') {
        saveChatData();
        saveStats();
        saveChatLog();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'restarting', message: 'StreamPulse is restarting and will resume the active session.' }));
        console.log('[API] Restart requested');
        setTimeout(() => restartServer(), 100);
        return;
    }

    if (pathname === '/api/stats') {
        const isSession = url.searchParams.get('scope') === 'session' || url.searchParams.get('session') === '1' || url.searchParams.get('session') === 'true' || url.searchParams.get('range') === 'session';
        if (isSession) {
            const sessionHashtags = {};
            for (const [tag, entry] of Object.entries(chatData.hashtags || {})) {
                sessionHashtags[tag] = { count: entry.count || 0, firstUsed: entry.firstUsed, lastUsed: entry.lastUsed };
            }
            const sessionChatters = {};
            for (const [user, entry] of Object.entries(chatData.chatters || {})) {
                sessionChatters[user] = { chatname: entry.chatname || user, count: entry.messageCount || 0, chatimg: entry.chatimg || '' };
            }
            const sessionEmotes = {};
            for (const [emote, entry] of Object.entries(chatData.emotes || {})) {
                sessionEmotes[emote] = { count: typeof entry === 'number' ? entry : (entry.count || 0) };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                hashtags: sessionHashtags,
                chatters: sessionChatters,
                emotes: sessionEmotes,
                sessionActive: true,
                startedAt: chatData.startedAt
            }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...statsData,
            sessionHashtags: chatData.hashtags || {},
            sessionChatters: chatData.chatters || {},
            sessionEmotes: chatData.emotes || {}
        }));
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

    if (pathname === '/api/update/check' && req.method === 'GET') {
        try {
            const mode = url.searchParams.get('mode') === 'nightly' ? 'nightly' : 'release';
            const update = await getUpdateStatus(mode);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(update));
        } catch (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/update/apply' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const result = await applyUpdate(body.mode === 'nightly' ? 'nightly' : 'release');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (err) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/hashtags/stats' && req.method === 'GET') {
        const range = buildDateRange(url.searchParams);
        const stats = collectHashtagStats(range);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...stats,
            range
        }));
        return;
    }

    if (pathname === '/api/analytics' && req.method === 'GET') {
        const range = buildDateRange(url.searchParams);
        const sessions = [];
        if (chatData.startedAt && (!range || chatData.startedAt.slice(0, 10) >= range.from && chatData.startedAt.slice(0, 10) <= range.to)) {
            sessions.push({ file: '__current__', ...chatData });
        }
        if (fs.existsSync(SESSIONS_DIR)) {
            for (const file of fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith('chat-') && f.endsWith('.json'))) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
                    const date = String(data.startedAt || file).slice(0, 10);
                    if (!range || (date >= range.from && date <= range.to)) sessions.push({ file, ...data });
                } catch {}
            }
        }
        const uniqueChatters = new Set();
        const rows = sessions.map(data => {
            Object.keys(data.chatters || {}).forEach(name => uniqueChatters.add(name.trim().toLowerCase()));
            const viewers = data.viewerStats || {};
            const isCurrent = data.file === '__current__';
            const chatEntries = isCurrent
                ? chatLog
                : readChatLogFile(path.join(SESSIONS_DIR, data.file.replace('chat-', 'chatlog-').replace('.json', '.jsonl')));
            const streamTimes = getSessionStreamTimes(data, chatEntries);
            const categories = getSessionCategorySegments(data, streamTimes.streamStartAt, streamTimes.streamStopAt, isCurrent);
            const streamStartMs = streamTimes.streamStartAt ? Date.parse(streamTimes.streamStartAt) : NaN;
            const streamStopMs = streamTimes.streamStopAt ? Date.parse(streamTimes.streamStopAt) : NaN;
            const durationMinutes = Number.isFinite(streamStartMs) && Number.isFinite(streamStopMs) && streamStopMs > streamStartMs
                ? Math.round((streamStopMs - streamStartMs) / 60000)
                : null;
            return {
                file: data.file,
                date: data.startedAt || null,
                streamStartAt: streamTimes.streamStartAt,
                streamStopAt: streamTimes.streamStopAt,
                durationMinutes,
                title: data.streamInfo?.[0]?.title || '',
                categories,
                categorySummary: categories.map(entry => `${entry.category} (${entry.durationMinutes ?? 'in progress'} min)`).join(' | '),
                messages: data.messageCount || 0,
                chatters: Object.keys(data.chatters || {}).length,
                uniqueChatters: Object.keys(data.chatters || {}).length,
                chatterNames: Object.keys(data.chatters || {}).sort().join(' | '),
                emotes: Object.keys(data.emotes || {}).length,
                hashtags: Object.keys(data.hashtags || {}).length,
                subscribers: (data.subscribers || []).length,
                followers: (data.followers || []).length,
                giftSubs: (data.giftSubs || []).reduce((sum, item) => sum + Math.max(1, Number(item.count) || 1), 0),
                bits: (data.bits || []).reduce((sum, item) => sum + (Number(item.bits) || parseNumericAmount(item.amount)), 0),
                donations: (data.donations || []).reduce((sum, item) => sum + parseNumericAmount(item.amountValue ?? item.amount), 0),
                raids: (data.raids || []).length,
                currentViewers: viewers.current || 0,
                peakViewers: viewers.peak || 0,
                averageViewers: viewers.average || 0
            };
        }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const totals = rows.reduce((sum, row) => {
            for (const key of Object.keys(sum)) sum[key] += Number(row[key]) || 0;
            return sum;
        }, { messages: 0, chatters: 0, uniqueChatters: 0, emotes: 0, hashtags: 0, subscribers: 0, followers: 0, giftSubs: 0, bits: 0, donations: 0, raids: 0, peakViewers: 0, averageViewers: 0, durationMinutes: 0 });
        totals.peakViewers = rows.reduce((max, row) => Math.max(max, Number(row.peakViewers) || 0), 0);
        totals.averageViewers = rows.length
            ? Number((rows.reduce((sum, row) => sum + (Number(row.averageViewers) || 0), 0) / rows.length).toFixed(1))
            : 0;
        totals.uniqueChatters = uniqueChatters.size;
        totals.streamedSessions = rows.filter(row => row.durationMinutes !== null).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ range, sessions: rows, totals }));
        return;
    }

    if (pathname === '/api/subscribers/current' && req.method === 'GET') {
        const subsPath = path.join(DATA_DIR, 'subs.json');
        const current = readJsonFileSafe(subsPath, { data: [] })?.data || [];
        const tenure = statsData.subTenure || {};
        const rows = current.map(sub => {
            const name = sub.user_name || sub.user_login || '';
            const history = statsData.subscribers?.[name] || statsData.subscribers?.[sub.user_login] || {};
            const firstSeen = history.firstSeen || null;
            const days = firstSeen ? Math.max(1, Math.floor((Date.now() - new Date(firstSeen).getTime()) / 86400000) + 1) : null;
            const months = (tenure[String(name).toLowerCase()] || tenure[String(sub.user_login || '').toLowerCase()] || {}).months || null;
            return {
                name, tier: sub.tier || '', plan: sub.plan_name || '', isGift: !!sub.is_gift,
                gifter: sub.is_gift ? (sub.gifter_name || sub.gifter_login || 'Anonymous') : '',
                tenureMonths: months, firstSeen, lastSeen: history.lastSeen || null, observedDays: days
            };
        }).filter(row => row.name).sort((a, b) => (b.tenureMonths || 0) - (a.tenureMonths || 0) || (b.observedDays || 0) - (a.observedDays || 0));

        const gifters = {};
        rows.filter(row => row.isGift).forEach(row => { gifters[row.gifter] = (gifters[row.gifter] || 0) + 1; });
        const withTenure = rows.filter(row => row.tenureMonths);
        const summary = {
            total: rows.length,
            unique: new Set(rows.map(row => row.name.toLowerCase())).size,
            tiers: { '1000': rows.filter(r => String(r.tier) === '1000').length, '2000': rows.filter(r => String(r.tier) === '2000').length, '3000': rows.filter(r => String(r.tier) === '3000').length },
            gifted: rows.filter(r => r.isGift).length,
            tenureKnown: withTenure.length,
            averageTenureMonths: withTenure.length ? Math.round(withTenure.reduce((sum, r) => sum + r.tenureMonths, 0) / withTenure.length * 10) / 10 : 0,
            longestTenureMonths: withTenure.length ? Math.max(...withTenure.map(r => r.tenureMonths)) : 0,
            topGifters: Object.entries(gifters).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
        };
        const snapshots = readJsonFileSafe(SUB_HISTORY_PATH, { snapshots: [] })?.snapshots || [];
        let updatedAt = null;
        try { updatedAt = fs.statSync(subsPath).mtime.toISOString(); } catch { /* no subs file yet */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ updatedAt, summary, history: snapshots, subscribers: rows }));
        return;
    }

    if (pathname === '/api/followers/current' && req.method === 'GET') {
        const file = path.join(DATA_DIR, 'followers.json');
        const rows = (readJsonFileSafe(file, { data: [] })?.data || []).map(f => ({ name: f.user_name || f.user_login || '', followedAt: f.followed_at || null })).filter(r => r.name);
        const snapshots = readJsonFileSafe(FOLLOWER_HISTORY_PATH, { snapshots: [] })?.snapshots || [];
        let updatedAt = null;
        try { updatedAt = fs.statSync(file).mtime.toISOString(); } catch { /* none yet */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ updatedAt, total: rows.length, history: snapshots, followers: rows }));
        return;
    }

    // Milestones & Streaks endpoint
    if (pathname === '/api/milestones' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(computeMilestones()));
        return;
    }

    // Chatter Dossier & Community Chatters endpoints
    if (pathname === '/api/chatters' && req.method === 'GET') {
        const query = (url.searchParams.get('q') || '').toLowerCase().trim();
        const tagFilter = (url.searchParams.get('tag') || '').toLowerCase().trim();
        const vipsList = readJsonFileSafe(path.join(DATA_DIR, 'vips.json'), { data: [] })?.data || [];
        const modsList = readJsonFileSafe(path.join(DATA_DIR, 'moderators.json'), { data: [] })?.data || [];
        const vipSet = new Set(vipsList.map(v => (v.user_login || v.user_name || '').toLowerCase()));
        const modSet = new Set(modsList.map(m => (m.user_login || m.user_name || '').toLowerCase()));

        const chattersList = Object.entries(statsData.chatters || {}).map(([username, d]) => {
            const days = d.days || {};
            const totalMsgs = Object.values(days).reduce((s, c) => s + (Number(c) || 0), 0);
            const notes = chatterNotes[username.toLowerCase()] || {};
            const subTenure = statsData.subTenure?.[username.toLowerCase()] || statsData.subTenure?.[username];
            const subMonths = subTenure?.months || 0;
            const isSubscriber = Boolean(subMonths > 0 || statsData.subscribers?.[username] || statsData.subscribers?.[username.toLowerCase()]);
            const isTwitchVip = vipSet.has(username.toLowerCase()) || Boolean(d.isVip);
            const isTwitchMod = modSet.has(username.toLowerCase()) || Boolean(d.isMod);
            const isVip = Boolean(notes.isVip || isTwitchVip);
            const isMod = Boolean(isTwitchMod || (notes.tags || []).some(t => t.toLowerCase() === 'mod'));
            return {
                username,
                chatname: d.chatname || username,
                chatimg: d.chatimg || '',
                totalMessages: totalMsgs,
                sessionsAttended: Object.keys(days).length,
                firstSeen: d.firstSeen || null,
                lastSeen: d.lastSeen || null,
                isVip,
                isMod,
                isSubscriber,
                subMonths,
                notes: notes.notes || '',
                tags: notes.tags || []
            };
        }).filter(c => {
            if (tagFilter) {
                if (tagFilter === 'vip') {
                    if (!c.isVip) return false;
                } else if (tagFilter === 'mod' || tagFilter === 'moderator') {
                    if (!c.isMod) return false;
                } else if (tagFilter === 'sub' || tagFilter === 'subscriber') {
                    if (!c.isSubscriber) return false;
                } else if (!(c.tags || []).some(t => t.toLowerCase() === tagFilter)) {
                    return false;
                }
            }
            if (!query) return true;
            return c.username.toLowerCase().includes(query)
                || (c.chatname && c.chatname.toLowerCase().includes(query))
                || (c.notes && c.notes.toLowerCase().includes(query))
                || (c.tags || []).some(t => t.toLowerCase().includes(query));
        })
          .sort((a, b) => b.totalMessages - a.totalMessages);

        const allTagsSet = new Set(['VIP', 'Mod', 'Subscriber']);
        for (const note of Object.values(chatterNotes)) {
            if (Array.isArray(note.tags)) {
                for (const t of note.tags) {
                    if (t && t.trim()) allTagsSet.add(t.trim());
                }
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            chatters: chattersList.slice(0, 150),
            total: chattersList.length,
            tags: Array.from(allTagsSet)
        }));
        return;
    }

    if (pathname === '/api/vips' && req.method === 'GET') {
        const vipsList = readJsonFileSafe(path.join(DATA_DIR, 'vips.json'), { data: [] })?.data || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: vipsList.length, vips: vipsList }));
        return;
    }

    if (pathname === '/api/moderators' && req.method === 'GET') {
        const modsList = readJsonFileSafe(path.join(DATA_DIR, 'moderators.json'), { data: [] })?.data || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: modsList.length, moderators: modsList }));
        return;
    }

    const mChatterNotes = pathname.match(/^\/api\/chatters\/([^/]+)\/notes$/);
    if (mChatterNotes && req.method === 'POST') {
        const username = decodeURIComponent(mChatterNotes[1]);
        const key = username.toLowerCase().trim();
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                chatterNotes[key] = {
                    notes: String(data.notes || '').slice(0, 3000),
                    tags: Array.isArray(data.tags) ? data.tags.slice(0, 15).map(t => String(t).trim().slice(0, 30)).filter(Boolean) : (chatterNotes[key]?.tags || []),
                    isVip: Boolean(data.isVip),
                    updatedAt: new Date().toISOString()
                };
                saveChatterNotes();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(getChatterDossier(username)));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    const mChatter = pathname.match(/^\/api\/chatters\/([^/]+)$/);
    if (mChatter && req.method === 'GET') {
        const username = decodeURIComponent(mChatter[1]);
        const dossier = getChatterDossier(username);
        if (!dossier) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Chatter not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dossier));
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

    if (pathname === '/api/hashtags' && req.method === 'DELETE') {
        const queryTag = url.searchParams.get('tag');
        const processDelete = (rawTag) => {
            if (!rawTag) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing tag' }));
                return;
            }
            const normalized = rawTag.toLowerCase().startsWith('#') ? rawTag.toLowerCase() : `#${rawTag.toLowerCase()}`;

            let modified = false;

            if (chatData?.hashtags && chatData.hashtags[normalized]) {
                delete chatData.hashtags[normalized];
                saveChatData();
                modified = true;
            }

            if (statsData?.hashtags && statsData.hashtags[normalized]) {
                delete statsData.hashtags[normalized];
                saveStats();
                modified = true;
            }

            if (bannedHashtags.has(normalized)) {
                bannedHashtags.delete(normalized);
                saveBannedHashtags();
                modified = true;
            }

            if (modified) {
                broadcastToOverlays('update', chatData);
            }

            console.log(`[Hashtags] Deleted hashtag: ${normalized}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'deleted', tag: normalized }));
        };

        if (queryTag) {
            processDelete(queryTag);
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = body ? JSON.parse(body) : {};
                processDelete(parsed.tag);
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    if (pathname === '/api/sessions') {
        if (req.method === 'DELETE') {
            const sessionName = new URL(req.url, 'http://localhost').searchParams.get('session') || '';
            if (!/^chat-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/.test(sessionName)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid archived session name' }));
                return;
            }
            const sessionFile = path.join(SESSIONS_DIR, sessionName);
            const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const logFile = path.join(SESSIONS_DIR, logName);
            try {
                if (!fs.existsSync(sessionFile)) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Session not found' }));
                    return;
                }
                fs.unlinkSync(sessionFile);
                if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
                console.log(`[Session] Deleted archived session: ${sessionName}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'deleted', session: sessionName }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Could not delete session: ${err.message}` }));
            }
            return;
        }
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
                        const logName = f.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                        const streamTimes = getSessionStreamTimes(d, readChatLogFile(path.join(SESSIONS_DIR, logName)));
                        if (d.streamInfo && d.streamInfo.length > 0) {
                            entry.title = d.streamInfo[0].title;
                            entry.category = d.streamInfo[0].category;
                        }
                        entry.streamStartAt = streamTimes.streamStartAt;
                        entry.streamStopAt = streamTimes.streamStopAt;
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

    if (await handleMusicRoutes(req, res, pathname)) return;

    // Per-overlay visibility: GET /api/overlay-visibility, POST /api/overlay-visibility/:key { action: "on"|"off"|"toggle" }
    // Keys: credits, goal, countdown, stopwatch, music, custom:<overlayId>
    if (pathname === '/api/overlay-visibility' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ overlays: listOverlayVisibility() }));
        return;
    }
    const visibilityMatch = pathname.match(/^\/api\/overlay-visibility\/(.+)$/);
    if (visibilityMatch && req.method === 'POST') {
        let key = '';
        try { key = decodeURIComponent(visibilityMatch[1]); } catch { key = visibilityMatch[1]; }
        let action = url.searchParams.get('action') || '';
        if (!action) {
            try { action = JSON.parse(await readRequestBody(req) || '{}').action || ''; } catch {}
        }
        action = ['on', 'off', 'toggle'].includes(action) ? action : 'toggle';
        const result = setOverlayVisibility(key, action);
        res.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result || { error: `Unknown overlay "${key}"` }));
        return;
    }



    if (await handleTimersRoutes(req, res, pathname)) return;

    if (await handleWeatherRoutes(req, res, url, pathname)) return;

    if (await handleGamePlanRoutes(req, res, pathname)) return;

    if (pathname === '/api/qr') {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const text = (params.get('text') || '').slice(0, 1000);
        const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
        if (!text) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Missing text'); return; }
        try {
            const svg = await require('qrcode').toString(text, {
                type: 'svg',
                errorCorrectionLevel: ['L', 'M', 'Q', 'H'].includes(params.get('ecc')) ? params.get('ecc') : 'M',
                margin: Math.max(0, Math.min(8, Math.round(Number(params.get('margin') ?? 2)))),
                color: { dark: color(params.get('fg'), '#000000'), light: params.get('bg') === 'transparent' ? '#00000000' : color(params.get('bg'), '#ffffff') }
            });
            res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
            res.end(svg);
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(err.message);
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

    const timelineMatch = pathname.match(/^\/api\/sessions\/(.+\.json)\/timeline$/);
    if (timelineMatch && req.method === 'GET') {
        const sessionName = timelineMatch[1];
        const isCurrent = sessionName === '__current__.json';
        const sessionFile = path.join(SESSIONS_DIR, sessionName);
        if (!isCurrent && (!sessionFile.startsWith(SESSIONS_DIR) || !fs.existsSync(sessionFile))) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session not found' }));
            return;
        }
        try {
            const data = isCurrent ? chatData : JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const logEntries = isCurrent ? chatLog : readChatLogFile(path.join(SESSIONS_DIR, logName));
            const events = logEntries
                .filter(entry => entry.event || entry.donation)
                .map(entry => ({
                    ts: entry.ts,
                    type: entry.event || 'donation',
                    user: entry.user,
                    message: entry.message,
                    detail: entry.donation || null
                }));
            for (const info of data.streamInfo || []) {
                events.push({ ts: new Date(info.changedAt).getTime(), type: 'stream-info', message: info.title, detail: info.category || null });
            }
            events.sort((a, b) => a.ts - b.ts);
            const stamps = logEntries.map(e => e.ts).filter(Number.isFinite);
            const bucketMs = 5 * 60 * 1000;
            const buckets = {};
            for (const ts of stamps) {
                const key = Math.floor(ts / bucketMs) * bucketMs;
                buckets[key] = (buckets[key] || 0) + 1;
            }
            const chat = Object.keys(buckets).map(Number).sort((a, b) => a - b).map(ts => ({ ts, count: buckets[ts] }));
            const startTs = stamps.length ? Math.min(...stamps) : null;
            const endTs = stamps.length ? Math.max(...stamps) : null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ session: sessionName, events, chat, chatBucketMs: bucketMs, messageCount: stamps.length, startTs, endTs }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Serve individual session files
    const sessionMatch = pathname.match(/^\/api\/sessions\/(.+\.json)$/);
    if (sessionMatch) {
        const sessionName = sessionMatch[1];
        const sessionFile = path.join(SESSIONS_DIR, sessionName);
        if (!sessionFile.startsWith(SESSIONS_DIR) || !fs.existsSync(sessionFile)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session not found' }));
            return;
        }
        const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
        const streamTimes = getSessionStreamTimes(data, readChatLogFile(path.join(SESSIONS_DIR, logName)));
        if (streamTimes.streamStopAt && !data.viewerStats?.streamEndedAt) {
            data.viewerStats = {
                ...(data.viewerStats || {}),
                streamEndedAt: streamTimes.streamStopAt
            };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
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
        const messages = getCurrentChatLogEntries();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ session: 'current', count: messages.length, messages }));
        return;
    }

    // Cross-session chat log search
    if (pathname === '/api/chat-log/search') {
        const params = new URL(req.url, `http://localhost`).searchParams;
        const session = params.get('session') || 'all';
        const filters = normalizeChatSearchFilters({
            q: params.get('q') || '',
            user: params.get('user') || '',
            type: params.get('type') || ''
        });
        const limit = parseInt(params.get('limit')) || 200;
        const offset = parseInt(params.get('offset')) || 0;

        let allResults = [];

        // Helper to search messages from a session
        function searchMessages(messages, sessionName) {
            return filterChatMessages(messages, filters, sessionName);
        }

        if (session === 'all' || session === 'current') {
            allResults.push(...searchMessages(getCurrentChatLogEntries(), 'current'));
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
        const filters = normalizeChatSearchFilters({
            q: params.get('q') || '',
            user: params.get('user') || '',
            type: params.get('type') || ''
        });

        // Load messages and stream info
        let messages = [];
        let sessionLabel = session;
        let streamInfo = [];
        const addSessionMessages = (entries, sourceSession) => {
            messages.push(...entries.map(entry => ({ ...entry, session: sourceSession })));
        };
        if (session === 'all') {
            // Global search export: current + all archived sessions
            addSessionMessages(getCurrentChatLogEntries(), 'current');
            sessionLabel = 'all-sessions';
            streamInfo = chatData.streamInfo || [];
            if (fs.existsSync(SESSIONS_DIR)) {
                const logFiles = fs.readdirSync(SESSIONS_DIR)
                    .filter(f => f.startsWith('chatlog-') && f.endsWith('.jsonl'))
                    .sort();
                for (const logFile of logFiles) {
                    const sourceSession = logFile.replace('chatlog-', 'chat-').replace('.jsonl', '.json');
                    addSessionMessages(readChatLogFile(path.join(SESSIONS_DIR, logFile)), sourceSession);
                }
            }
        } else if (session === 'current') {
            addSessionMessages(getCurrentChatLogEntries(), 'current');
            sessionLabel = 'current-session';
            streamInfo = chatData.streamInfo || [];
        } else {
            const logName = session.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const logFile = path.join(SESSIONS_DIR, logName);
            if (logFile.startsWith(SESSIONS_DIR) && fs.existsSync(logFile)) {
                addSessionMessages(readChatLogFile(logFile), session);
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

        messages = filterChatMessages(messages, filters);

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
            const rows = messages.map(m => {
                let msg = m.message.replace(/\t/g, ' ');
                const replyMatch = msg.match(/^(.+?):\s\s@(\S+)\s(.+)$/s);
                if (replyMatch) msg = `↩ ${replyMatch[1].substring(0, 80)} | ${replyMatch[3]}`;
                return `${formatTime(m.ts)}\t${m.user}\t${msg}\t${m.event || ''}\t${m.donation || ''}\t${m.membership || ''}`;
            });
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
                let msg = m.message;
                // Clean reply format: "original:  @user reply" → "↩ original | reply"
                const replyMatch = msg.match(/^(.+?):\s\s@(\S+)\s(.+)$/s);
                if (replyMatch) {
                    msg = `↩ ${replyMatch[1].substring(0, 80)} | ${replyMatch[3]}`;
                }
                let line = `[${formatTime(m.ts)}] ${m.user}: ${msg}`;
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

    if (pathname === '/api/backup' && (req.method === 'GET' || req.method === 'HEAD')) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const filename = `streampulse-backup-${dateStr}.zip`;

        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`
        });

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const archive = new ZipArchive({ zlib: { level: 9 } });
        archive.pipe(res);

        for (const f of getBackupFileSpecs()) {
            if (fs.existsSync(f.src)) {
                archive.file(f.src, { name: f.dest });
            }
        }

        if (fs.existsSync(SESSIONS_DIR)) {
            archive.directory(SESSIONS_DIR, 'data/sessions');
        }
        if (fs.existsSync(CUSTOM_OVERLAY_ASSETS_DIR)) {
            archive.directory(CUSTOM_OVERLAY_ASSETS_DIR, 'data/custom-overlay-assets');
        }
        if (fs.existsSync(CUSTOM_OVERLAY_HISTORY_DIR)) {
            archive.directory(CUSTOM_OVERLAY_HISTORY_DIR, 'data/custom-overlay-history');
        }

        archive.finalize();
        return;
    }

        if (pathname === '/api/share/items' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(listShareItems()));
        return;
    }

    if (pathname === '/api/share/export' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readRequestBody(req) || '{}');
            const selection = (Array.isArray(body.items) ? body.items : []).map(entry => {
                const [type, ...rest] = String(entry).split(':');
                return { type, id: rest.join(':') };
            });
            const { buffer, count } = buildShareZip(selection, !!body.includeHistory);
            if (!count) throw new Error('Nothing selected to export');
            const stamp = new Date().toISOString().slice(0, 10);
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="streampulse-share-${stamp}.zip"`,
                'Content-Length': buffer.length
            });
            res.end(buffer);
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/share/inspect' && req.method === 'POST') {
        try {
            const { manifest } = openShareZip(await readBinaryBody(req));
            const items = (manifest.items || []).map(item => ({
                ...item,
                exists: item.type === 'overlay' ? !!customOverlays[sanitizeOverlayId(item.id)]
                    : item.type === 'preset' ? overlayPresets.some(p => p.id === item.id)
                    : !!SHARE_SINGLES[item.type] && fs.existsSync(SHARE_SINGLES[item.type].path())
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ items }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/share/import' && req.method === 'POST') {
        try {
            const selected = (url.searchParams.get('items') || '').split(',').filter(Boolean);
            const conflict = ['replace', 'copy', 'skip'].includes(url.searchParams.get('conflict')) ? url.searchParams.get('conflict') : 'copy';
            const results = importShareZip(await readBinaryBody(req), selected, conflict);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ results }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

if (pathname === '/api/restore' && req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const previousConfig = cloneJson(config);
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

                console.log(`[Restore] Restored ${restored.length} files`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'restored',
                    files: restored.length,
                    restored,
                    restartRequired: restartFields.length > 0,
                    restartFields,
                    message: restartFields.length > 0
                        ? 'Restore completed. Restart StreamPulse to apply restored connection and startup settings.'
                        : 'Restore completed and in-memory data reloaded.'
                }));
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
                    let candidate = null;
                    if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_highlights) {
                        const sessionOverride = clipSessionOverrideForName(session);
                        if (sessionOverride) {
                            candidate = addClipCandidate(
                                'highlighted-chat',
                                { user, message: message || '' },
                                Number(ts),
                                0.9,
                                sessionOverride,
                                `${sessionOverride.session}:highlight:${ts}:${user}`
                            );
                        }
                    }
                    console.log(`[Highlights] Pinned message from ${user}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'pinned', count: highlights.length, candidateId: candidate?.id || null }));
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
        }, REFRESH_MINUTES * 60 * 1000);
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
    }, 5000);

    scheduleWeather();

    // Start music polling if enabled
    if (MUSIC_CONFIG.enabled) {
        startMusicPolling();
    }
});

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Shutting down...`);
    finalizeSessionStreamEnd();
    saveChatData();
    saveStats();
    saveChatLog();
    const archiveName = archiveSession();
    if (archiveName) console.log(`[Server] Session archived: ${archiveName}`);
    resetChatData();
    if (ssnSocket) ssnSocket.close();
    server.close();
    console.log('[Server] Data saved. Goodbye!');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});
