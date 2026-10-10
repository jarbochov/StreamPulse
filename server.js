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
const { DEFAULT_TIERS, normalizeGamePlan, gameKey, sanitizeOverlayId } = require('./game-plan');
const { createAlertEngine, TRIGGERS: ALERT_TRIGGERS, ANIM_IN: ALERT_ANIM_IN, ANIM_OUT: ALERT_ANIM_OUT } = require('./alerts');
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
    console.error('Missing config.json — copy config.json and fill in your credentials.');
    process.exit(1);
}

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = config.port || 8080;
const cleanConfigValue = v => { const t = String(v ?? '').trim(); return /^YOUR_/i.test(t) ? '' : t; };
let BROADCASTER_ID = cleanConfigValue(config.broadcaster_id);
let BROADCASTER_NAME = cleanConfigValue(config.broadcaster_name);
let EXCLUDE_USERS = (config.exclude_users || []).map(u => u.toLowerCase());
let BANNED_USERS = (config.banned_users || []).map(u => u.toLowerCase());
// Shared public Twitch app (device-code flow, no secret). Users can still supply their own client_id/client_secret.
const DEFAULT_TWITCH_CLIENT_ID = 'gbe0673k90le0942bfhw7f7ko6t865';
const TWITCH_CLIENT_ID = cleanConfigValue(config.twitch?.client_id) || DEFAULT_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = cleanConfigValue(config.twitch?.client_secret);
const SSN_SESSION_ID = config.ssn?.session_id;
const SSN_SERVER = config.ssn?.server || 'wss://io.socialstream.ninja';
const REFRESH_MINUTES = config.twitch_refresh_minutes || 10;
const STREAM_INFO_POLL_SECONDS = Math.max(10, config.twitch_stream_info_seconds || 30);
const MUSIC_CONFIG = config.music || { enabled: false, source: 'apple_music', poll_seconds: 5 };
const VIEWER_TRACKING_CONFIG = config.viewer_tracking || { enabled: true, source: 'best_available', poll_seconds: 60, retain_samples: 720 };

const ACTIVE_SUBS_ONLY = config.active_subs_only || false; // only show subs who chatted
const DATA_DIR = path.join(__dirname, 'data');
const LIVE_CHAT_PATH = path.join(DATA_DIR, 'chat.json');
const BANNED_HASHTAGS_PATH = path.join(DATA_DIR, '.banned-hashtags.json');
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat-log.jsonl');
const HIGHLIGHTS_PATH = path.join(DATA_DIR, 'highlights.jsonl');
const CLIP_CANDIDATES_PATH = path.join(DATA_DIR, 'clip-candidates.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const EMOTE_CACHE_DIR = path.join(DATA_DIR, 'emote-cache');
const TIMERS_PATH = path.join(DATA_DIR, 'timers.json');
const CUSTOM_OVERLAYS_PATH = path.join(DATA_DIR, 'custom-overlays.json');
const OVERLAY_PRESETS_PATH = path.join(DATA_DIR, 'overlay-presets.json');
const ASSET_TAGS_PATH = path.join(DATA_DIR, 'asset-tags.json');
const ASSET_CAPTIONS_PATH = path.join(DATA_DIR, 'asset-captions.json');
const CUSTOM_OVERLAY_ASSETS_DIR = path.join(DATA_DIR, 'custom-overlay-assets');
const CUSTOM_OVERLAY_HISTORY_DIR = path.join(DATA_DIR, 'custom-overlay-history');
const CUSTOM_OVERLAY_HISTORY_LIMIT = 30;

const GOAL_TYPE_LABELS = {
    followers: 'Followers',
    subscribers: 'Subscribers',
    gift_subs: 'Gift Subs',
    bits: 'Bits',
    donations: 'Donations',
    viewers: 'Viewers',
    community: 'Community Goal'
};

const GOAL_TYPES = Object.keys(GOAL_TYPE_LABELS);
const GOAL_TRACKING_TYPES = ['persistent', 'session'];
const GOAL_VIEWER_MODES = ['current', 'peak'];
const DEFAULT_COMMUNITY_WEIGHTS = {
    followers: 1,
    subscribers: 5,
    gift_subs: 5,
    bits_per_100: 1,
    donations: 1
};

const DEFAULT_GOALS_CONFIG = {
    enabled: true,
    rotate_seconds: 8,
    skip_completed: true,
    pause_completed_seconds: 0,
    items: []
};

const isLoopbackRequest = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const TEXT_SOURCE_TYPES = new Set(['text', 'random-text', 'markdown']);
const TEXT_SOURCE_EXTS = new Set(['.txt', '.md', '.markdown', '.text']);
const TEXT_SOURCE_MAX_BYTES = 512 * 1024;
const CUSTOM_OVERLAY_ELEMENT_TYPES = new Set(['text', 'random-text', 'markdown', 'image', 'video', 'shape', 'embed', 'progress', 'game-list', 'qr', 'alert', 'slideshow', 'icon']);
let customOverlays = {};


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
        items: Array.isArray(element.items) ? element.items.map(item => String(item).slice(0, 2000)).filter(Boolean).slice(0, 100) : [],
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
            enabled: item?.enabled !== false
        };
    });
    if (!items.length) items.push({ id: 'page-1', name: 'Page 1', duration: 0, enabled: true });
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
        pages: items.map(({ id, name, duration, enabled }) => ({ id, name, duration, enabled }))
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
    if (!state.auto || !overlay.pages.enabled || overlay.pages.items.filter(item => item.enabled).length < 2) return;
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
            if (items[at].enabled) return at === current ? -1 : at;
        }
        return -1;
    };
    let next = current;
    if (action === 'next') next = step(1);
    else if (action === 'prev') next = step(-1);
    else if (action === 'first') next = items.findIndex(item => item.enabled);
    else if (action === 'last') next = items.map(item => item.enabled).lastIndexOf(true);
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
    if (!items.some(item => item.id === state.page && item.enabled)) {
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
            if (candidate.enabled) pick = candidate;
        }
        state.page = (pick || items[0]).id;
    }
    if (!previous || previous.pages?.mode !== overlay.pages.mode || previous.pages?.enabled !== overlay.pages.enabled) {
        state.auto = overlay.pages.enabled && overlay.pages.mode === 'auto';
    }
    if (!overlay.pages.enabled) state.auto = false;
    scheduleAutoAdvance(overlay);
}
function dropOverlayPages(id) {
    const state = overlayPageState.get(id);
    if (state) clearTimeout(state.timer);
    overlayPageState.delete(id);
}

function saveCustomOverlays() {
    fs.writeFileSync(CUSTOM_OVERLAYS_PATH, JSON.stringify(customOverlays, null, 2));
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
function saveAssetCaptions() { fs.writeFileSync(ASSET_CAPTIONS_PATH, JSON.stringify(assetCaptions, null, 2)); }

function saveAssetTags() {
    fs.writeFileSync(ASSET_TAGS_PATH, JSON.stringify(assetTags, null, 2));
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
    fs.writeFileSync(OVERLAY_PRESETS_PATH, JSON.stringify(overlayPresets, null, 2));
}

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

let twitchAuthenticatedUserId = null;

async function getTwitchAuthenticatedUserId() {
    if (twitchAuthenticatedUserId) return twitchAuthenticatedUserId;
    const result = await twitchApiRequest('/users');
    twitchAuthenticatedUserId = result.status === 200 ? result.body.data?.[0]?.id || null : null;
    return twitchAuthenticatedUserId;
}

function twitchCreateClipFromVod(editorId, vodId, vodOffset, duration = 30, title = 'StreamPulse highlight') {
    return new Promise((resolve, reject) => {
        const clipDuration = Math.min(60, Math.max(5, Math.round(Number(duration) || 30)));
        const offset = Math.max(clipDuration, Math.round(Number(vodOffset) || 0));
        const query = new URLSearchParams({
            editor_id: editorId,
            broadcaster_id: BROADCASTER_ID,
            vod_id: vodId,
            vod_offset: String(offset),
            duration: String(clipDuration),
            title: String(title || 'StreamPulse highlight').slice(0, 140)
        }).toString();
        const req = https.request(`https://api.twitch.tv/helix/videos/clips?${query}`, {
            method: 'POST',
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${twitchAccessToken}`,
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
                } catch {
                    reject(new Error(`Twitch VOD clip API parse error: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
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

const DEFAULT_TIMER_SETTINGS = {
    sound_enabled: false,
    sound_volume: 0.35,
    sound_url: ''
};

const TIMER_EVENT_TYPES = ['countdown_started', 'countdown_complete', 'stopwatch_started', 'stopwatch_paused'];

function createDefaultTimerHttpActions() {
    return Object.fromEntries(TIMER_EVENT_TYPES.map(event => [event, { enabled: false, url: '', method: 'POST' }]));
}

let timerStore = {
    settings: JSON.parse(JSON.stringify(DEFAULT_TIMER_SETTINGS)),
    timers: {}
};

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function sanitizeTimerId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function parseDurationMs(input = {}) {
    if (input.durationMs !== undefined && input.durationMs !== null && input.durationMs !== '') {
        return Math.max(0, Math.round(Number(input.durationMs) || 0));
    }
    const days = Math.max(0, Number(input.days) || 0);
    const hours = Math.max(0, Number(input.hours) || 0);
    const minutes = Math.max(0, Number(input.minutes) || 0);
    const seconds = Math.max(0, Number(input.seconds) || 0);
    return Math.round((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
}

function formatTimerClock(ms, opts = {}) {
    const includeDays = !!opts.includeDays;
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = n => String(n).padStart(2, '0');
    if (includeDays || days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Only library assets may be used as custom timer sounds.
function normalizeSoundUrl(value) {
    const url = String(value || '').trim();
    return url.startsWith('/custom-overlay-assets/') && url.length <= 300 && !url.includes('..') ? url : '';
}

// Timers (and the global timer settings) can reference library sounds, so asset usage/renames must cover them.
function timerSoundUsers(name) {
    const users = [];
    const matches = url => url && assetReferencedIn(url, name, null);
    if (matches(timerStore.settings?.sound_url)) users.push({ id: 'timer-settings', name: 'Timer sound (global)' });
    for (const timer of Object.values(timerStore.timers || {})) {
        if (matches(timer.soundUrl)) users.push({ id: `timer:${timer.id}`, name: `Timer: ${timer.label || timer.id}` });
    }
    return users;
}

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
    return loadGamePlan().items.filter(item => item.customCover && assetReferencedIn(item.customCover, name, null)).map(item => ({ id: `game:${item.id}`, name: `Game plan: ${item.name}` }));
}

function rewriteGamePlanReferences(oldName, newName) {
    const plan = loadGamePlan();
    let changed = false;
    for (const item of plan.items) {
        if (!item.customCover) continue;
        const next = rewriteAssetReferences(item.customCover, oldName, newName, null, null);
        if (next !== item.customCover) { item.customCover = next; changed = true; }
    }
    if (changed) fs.writeFileSync(GAME_PLAN_PATH, JSON.stringify(plan, null, 2));
    return changed;
}

function rewriteCreditsReferences(oldName, newName) {
    const credits = config.credits;
    if (!credits) return false;
    const before = JSON.stringify(credits);
    const rewritten = rewriteAssetReferences(before, oldName, newName, null, null);
    if (rewritten === before) return false;
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    current.credits = JSON.parse(rewriteAssetReferences(JSON.stringify(current.credits || {}), oldName, newName, null, null));
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    applyRuntimeConfig(current);
    return true;
}

function rewriteTimerSoundReferences(oldName, newName) {
    let changed = false;
    const fix = url => { const next = rewriteAssetReferences(url || '', oldName, newName, null, null); if (next !== url) changed = true; return next; };
    if (timerStore.settings?.sound_url) timerStore.settings.sound_url = fix(timerStore.settings.sound_url);
    for (const timer of Object.values(timerStore.timers || {})) {
        if (timer.soundUrl) timer.soundUrl = fix(timer.soundUrl);
    }
    if (!changed) return false;
    saveTimers();
    broadcastToOverlays('timers-snapshot', buildTimersSnapshot());
    return true;
}

function normalizeTimerSettings(raw = {}) {
    const settings = cloneJson(DEFAULT_TIMER_SETTINGS);
    if (raw.sound_enabled !== undefined) settings.sound_enabled = !!raw.sound_enabled;
    settings.sound_volume = clampNumber(raw.sound_volume, 0, 1, DEFAULT_TIMER_SETTINGS.sound_volume);
    settings.sound_url = normalizeSoundUrl(raw.sound_url);
    return settings;
}

function normalizeTimerHttpActions(raw = {}) {
    const actions = createDefaultTimerHttpActions();
    for (const eventType of TIMER_EVENT_TYPES) {
        const src = raw[eventType] || {};
        actions[eventType] = {
            enabled: !!src.enabled,
            url: String(src.url || '').trim(),
            method: String(src.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
        };
    }
    return actions;
}

function computeCountdownRemaining(timer, now = Date.now()) {
    if (timer.state !== 'running') {
        if (timer.mode === 'date') {
            const targetMs = Date.parse(timer.targetAt || '');
            return Number.isFinite(targetMs) ? Math.max(0, targetMs - now) : 0;
        }
        return Math.max(0, timer.remainingMs || 0);
    }
    const anchor = Number(timer.startedAt) || now;
    return Math.max(0, (timer.startingRemainingMs || 0) - Math.max(0, now - anchor));
}

function computeStopwatchElapsed(timer, now = Date.now()) {
    const base = Math.max(0, timer.accumulatedMs || 0);
    if (timer.state !== 'running') return base;
    const anchor = Number(timer.startedAt) || now;
    return Math.max(0, base + Math.max(0, now - anchor));
}

function buildTimerSnapshot(timer, now = Date.now()) {
    const base = {
        id: timer.id,
        label: timer.label,
        kind: timer.kind,
        visible: timer.visible !== false,
        state: timer.state || 'idle',
        startedAt: timer.startedAt || null,
        updatedAt: timer.updatedAt || null,
        completedAt: timer.completedAt || null
    };

    if (timer.kind === 'countdown') {
        const startMs = timer.mode === 'date' ? Date.parse(timer.startAt || '') : NaN;
        const totalMs = Math.max(0, timer.mode === 'duration'
            ? (timer.durationMs || 0)
            : Number.isFinite(startMs) && Date.parse(timer.targetAt || '') > startMs
                ? Date.parse(timer.targetAt) - startMs
                : (timer.startingRemainingMs || computeCountdownRemaining(timer, now)));
        const remainingMs = computeCountdownRemaining(timer, now);
        const percentComplete = totalMs > 0 ? Math.min(1, Math.max(0, (totalMs - remainingMs) / totalMs)) : 0;
        return {
            ...base,
            mode: timer.mode || 'duration',
            timezone: timer.timezone || '',
            progress: timer.progress !== false,
            showOnEnd: timer.showOnEnd || 'message',
            endMessage: timer.endMessage || '⌛️',
            soundUrl: normalizeSoundUrl(timer.soundUrl),
            durationMs: Math.max(0, timer.durationMs || 0),
            targetAt: timer.targetAt || null,
            startAt: timer.startAt || null,
            startingRemainingMs: Math.max(0, timer.startingRemainingMs || 0),
            httpActions: normalizeTimerHttpActions(timer.httpActions || {}),
            remainingMs,
            totalMs,
            percentComplete,
            percentRemaining: 1 - percentComplete,
            formattedRemaining: formatTimerClock(remainingMs, { includeDays: remainingMs >= 86400000 }),
            displayTitle: timer.label
        };
    }

    const elapsedMs = computeStopwatchElapsed(timer, now);
    return {
        ...base,
        initialMs: Math.max(0, timer.initialMs || 0),
        accumulatedMs: Math.max(0, timer.accumulatedMs || 0),
        httpActions: normalizeTimerHttpActions(timer.httpActions || {}),
        elapsedMs,
        formattedElapsed: formatTimerClock(elapsedMs, { includeDays: elapsedMs >= 86400000 }),
        displayTitle: timer.label
    };
}

function buildTimersSnapshot() {
    const now = Date.now();
    return {
        settings: timerStore.settings,
        timers: Object.fromEntries(Object.entries(timerStore.timers).map(([id, timer]) => [id, buildTimerSnapshot(timer, now)]))
    };
}

function saveTimers() {
    fs.writeFileSync(TIMERS_PATH, JSON.stringify(timerStore, null, 2));
}

function loadTimers() {
    try {
        if (!fs.existsSync(TIMERS_PATH)) return;
        const parsed = JSON.parse(fs.readFileSync(TIMERS_PATH, 'utf8'));
        timerStore = {
            settings: normalizeTimerSettings(parsed.settings || {}),
            timers: {}
        };
        for (const [rawId, rawTimer] of Object.entries(parsed.timers || {})) {
            const id = sanitizeTimerId(rawId || rawTimer.id);
            if (!id) continue;
            const kind = rawTimer.kind === 'stopwatch' ? 'stopwatch' : 'countdown';
            const timer = {
                id,
                label: String(rawTimer.label || id),
                kind,
                visible: rawTimer.visible !== false,
                state: typeof rawTimer.state === 'string' ? rawTimer.state : 'idle',
                startedAt: rawTimer.startedAt ? Number(rawTimer.startedAt) || null : null,
                updatedAt: rawTimer.updatedAt || null,
                completedAt: rawTimer.completedAt || null
            };
            if (kind === 'countdown') {
                timer.mode = rawTimer.mode === 'date' ? 'date' : 'duration';
                timer.durationMs = Math.max(0, Number(rawTimer.durationMs) || 0);
                timer.targetAt = rawTimer.targetAt || null;
                timer.startAt = rawTimer.startAt || null;
                timer.timezone = String(rawTimer.timezone || '');
                timer.progress = rawTimer.progress !== false;
                timer.endMessage = String(rawTimer.endMessage || '⌛️');
                timer.soundUrl = normalizeSoundUrl(rawTimer.soundUrl);
                timer.showOnEnd = ['message', 'zero', 'none'].includes(rawTimer.showOnEnd) ? rawTimer.showOnEnd : 'message';
                timer.remainingMs = Math.max(0, Number(rawTimer.remainingMs) || 0);
                timer.startingRemainingMs = Math.max(0, Number(rawTimer.startingRemainingMs) || timer.remainingMs || timer.durationMs);
            } else {
                timer.initialMs = Math.max(0, Number(rawTimer.initialMs) || 0);
                timer.accumulatedMs = Math.max(0, Number(rawTimer.accumulatedMs) || timer.initialMs);
            }
            timer.httpActions = normalizeTimerHttpActions(rawTimer.httpActions || {});
            timerStore.timers[id] = timer;
        }
        console.log(`[Timers] Loaded ${Object.keys(timerStore.timers).length} timers`);
    } catch (err) {
        console.warn(`[Timers] Failed to load timers: ${err.message}`);
        timerStore = { settings: cloneJson(DEFAULT_TIMER_SETTINGS), timers: {} };
    }
}

function buildTimerRecord(input) {
    const id = sanitizeTimerId(input.id);
    if (!id) throw new Error('Timer ID is required and must be slug-safe');

    const kind = input.kind === 'stopwatch' ? 'stopwatch' : 'countdown';
    const label = String(input.label || id).trim().slice(0, 80) || id;
    const nowISO = new Date().toISOString();

    if (kind === 'countdown') {
        const mode = input.mode === 'date' ? 'date' : 'duration';
        const durationMs = mode === 'duration'
            ? Math.max(0, parseDurationMs(input))
            : 0;
        const targetAt = mode === 'date' && input.targetAt ? new Date(input.targetAt).toISOString() : null;
        const startAtDate = mode === 'date' && input.startAt ? new Date(input.startAt) : null;
        const startAt = startAtDate && !Number.isNaN(startAtDate.getTime()) ? startAtDate.toISOString() : null;
        if (startAt && targetAt && Date.parse(startAt) >= Date.parse(targetAt)) throw new Error('Start must be before the target date');
        if (mode === 'duration' && durationMs <= 0) throw new Error('Countdown duration must be greater than 0');
        if (mode === 'date' && !targetAt) throw new Error('Countdown target date is required');
        const initialRemainingMs = mode === 'duration'
            ? durationMs
            : Math.max(0, Date.parse(targetAt) - Date.now());
        return {
            id,
            label,
            kind,
            visible: input.visible !== false,
            state: 'idle',
            startedAt: null,
            updatedAt: nowISO,
            completedAt: null,
            mode,
            durationMs,
            targetAt,
            startAt,
            timezone: String(input.timezone || '').trim(),
            progress: input.progress !== false,
            endMessage: String(input.endMessage || '⌛️').slice(0, 120),
            soundUrl: normalizeSoundUrl(input.soundUrl),
            showOnEnd: ['message', 'zero', 'none'].includes(input.showOnEnd) ? input.showOnEnd : 'message',
            remainingMs: initialRemainingMs,
            startingRemainingMs: initialRemainingMs,
            httpActions: normalizeTimerHttpActions(input.httpActions || {})
        };
    }

    const initialMs = Math.max(0, parseDurationMs(input));
    return {
        id,
        label,
        kind,
        visible: input.visible !== false,
        state: 'idle',
        startedAt: null,
        updatedAt: nowISO,
        completedAt: null,
        initialMs,
        accumulatedMs: initialMs,
        httpActions: normalizeTimerHttpActions(input.httpActions || {})
    };
}

function upsertTimer(input) {
    const timer = buildTimerRecord(input);
    timerStore.timers[timer.id] = timer;
    saveTimers();
    broadcastToOverlays('timer-update', { timer: buildTimerSnapshot(timer), settings: timerStore.settings });
    return timer;
}

function getTimerOrThrow(id) {
    const timer = timerStore.timers[sanitizeTimerId(id)];
    if (!timer) throw new Error('Timer not found');
    return timer;
}

function markTimerUpdated(timer) {
    timer.updatedAt = new Date().toISOString();
}

function fireTimerHttpAction(eventType, timer) {
    const action = normalizeTimerHttpActions(timer.httpActions || {})[eventType];
    if (!action || !action.enabled || !action.url) return;
    const snapshot = buildTimerSnapshot(timer);
    const payloadObject = {
        event: eventType,
        timestamp: new Date().toISOString(),
        timer: snapshot
    };

    try {
        const urlObj = new URL(action.url);
        if (action.method === 'GET') {
            Object.entries({
                event: eventType,
                timer_id: snapshot.id,
                timer_label: snapshot.label,
                timer_kind: snapshot.kind,
                timer_state: snapshot.state
            }).forEach(([key, value]) => {
                if (value !== undefined && value !== null) urlObj.searchParams.set(key, String(value));
            });
        }
        const requestLib = urlObj.protocol === 'https:' ? https : http;
        const payload = JSON.stringify(payloadObject);
        const req = requestLib.request(urlObj, {
            method: action.method || 'POST',
            headers: action.method === 'POST'
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                : undefined
        }, (res) => res.resume());
        req.on('error', (err) => console.warn(`[Timer HTTP] Error: ${err.message}`));
        if ((action.method || 'POST') === 'POST') req.write(payload);
        req.end();
    } catch (err) {
        console.warn(`[Timer HTTP] Invalid URL: ${err.message}`);
    }
}

function completeCountdownTimer(timer, now = Date.now()) {
    timer.state = 'completed';
    timer.startedAt = null;
    timer.remainingMs = 0;
    timer.startingRemainingMs = 0;
    if (timer.mode === 'date') {
        timer.targetAt = new Date(now).toISOString();
    }
    timer.completedAt = new Date(now).toISOString();
}

function adjustCountdownTime(timer, deltaMs, now = Date.now()) {
    const currentRemainingMs = computeCountdownRemaining(timer, now);
    const nextRemainingMs = Math.max(0, currentRemainingMs + deltaMs);

    if (timer.mode === 'date') {
        timer.targetAt = new Date(now + nextRemainingMs).toISOString();
    }

    if (nextRemainingMs === 0) {
        completeCountdownTimer(timer, now);
        return { completed: currentRemainingMs > 0 };
    }

    timer.remainingMs = nextRemainingMs;
    timer.startingRemainingMs = nextRemainingMs;
    timer.completedAt = null;

    if (timer.state === 'running') {
        timer.startedAt = now;
    } else {
        timer.startedAt = null;
        timer.state = 'idle';
    }

    return { completed: false };
}

function pauseCountdownTimer(timer, now = Date.now()) {
    if (timer.state !== 'running') throw new Error('Countdown is not running');
    const remainingMs = computeCountdownRemaining(timer, now);
    timer.remainingMs = remainingMs;
    timer.startingRemainingMs = remainingMs;
    timer.startedAt = null;
    timer.state = remainingMs > 0 ? 'paused' : 'completed';
    if (timer.mode === 'date') {
        timer.targetAt = new Date(now + remainingMs).toISOString();
    }
    if (remainingMs <= 0) completeCountdownTimer(timer, now);
}

function resumeCountdownTimer(timer, now = Date.now()) {
    if (timer.state !== 'paused' && timer.state !== 'idle') throw new Error('Countdown cannot resume from current state');
    const remainingMs = timer.state === 'paused'
        ? Math.max(0, timer.remainingMs || timer.startingRemainingMs || 0)
        : (timer.mode === 'date'
            ? Math.max(0, Date.parse(timer.targetAt || '') - now)
            : Math.max(0, timer.remainingMs || timer.durationMs || 0));
    if (remainingMs <= 0) {
        completeCountdownTimer(timer, now);
        return false;
    }
    timer.remainingMs = remainingMs;
    timer.startingRemainingMs = remainingMs;
    timer.startedAt = now;
    timer.state = 'running';
    timer.completedAt = null;
    if (timer.mode === 'date') {
        timer.targetAt = new Date(now + remainingMs).toISOString();
    }
    return true;
}

function adjustStopwatchTime(timer, deltaMs, now = Date.now()) {
    const currentElapsedMs = computeStopwatchElapsed(timer, now);
    const nextElapsedMs = Math.max(0, currentElapsedMs + deltaMs);
    timer.accumulatedMs = nextElapsedMs;
    timer.completedAt = null;
    if (timer.state === 'running') {
        timer.startedAt = now;
    } else {
        timer.startedAt = null;
    }
}

function applyTimerControl(timer, action, params = {}) {
    const now = Date.now();
    const eventType = { value: null };
    const adjustmentMs = parseDurationMs(params);

    if (timer.kind === 'countdown') {
        if (action === 'start') {
            const remainingMs = timer.mode === 'date'
                ? Math.max(0, Date.parse(timer.targetAt || '') - now)
                : Math.max(0, timer.durationMs || 0);
            timer.state = remainingMs > 0 ? 'running' : 'completed';
            timer.startedAt = remainingMs > 0 ? now : null;
            timer.remainingMs = remainingMs;
            timer.startingRemainingMs = remainingMs;
            timer.completedAt = remainingMs > 0 ? null : new Date().toISOString();
            eventType.value = remainingMs > 0 ? 'countdown_started' : 'countdown_complete';
        } else if (action === 'pause') {
            pauseCountdownTimer(timer, now);
        } else if (action === 'resume') {
            const resumed = resumeCountdownTimer(timer, now);
            if (resumed) eventType.value = 'countdown_started';
            else eventType.value = 'countdown_complete';
        } else if (action === 'reset') {
            timer.state = 'idle';
            timer.startedAt = null;
            timer.completedAt = null;
            timer.remainingMs = timer.mode === 'date'
                ? Math.max(0, Date.parse(timer.targetAt || '') - now)
                : Math.max(0, timer.durationMs || 0);
            timer.startingRemainingMs = timer.remainingMs;
        } else if (action === 'add_time' || action === 'subtract_time') {
            if (adjustmentMs <= 0) throw new Error('Adjustment duration must be greater than 0');
            const result = adjustCountdownTime(timer, action === 'subtract_time' ? -adjustmentMs : adjustmentMs, now);
            if (result.completed) eventType.value = 'countdown_complete';
        } else if (action === 'visibility') {
            const mode = String(params.mode || params.actionMode || params.value || 'toggle').toLowerCase();
            if (mode === 'on' || mode === 'show' || mode === 'true') timer.visible = true;
            else if (mode === 'off' || mode === 'hide' || mode === 'false') timer.visible = false;
            else timer.visible = !timer.visible;
        } else {
            throw new Error(`Unsupported action for countdown: ${action}`);
        }
    } else {
        if (action === 'start') {
            timer.state = 'running';
            timer.startedAt = now;
            timer.accumulatedMs = Math.max(0, timer.accumulatedMs ?? timer.initialMs ?? 0);
            timer.completedAt = null;
            eventType.value = 'stopwatch_started';
        } else if (action === 'pause') {
            if (timer.state !== 'running') throw new Error('Stopwatch is not running');
            timer.accumulatedMs = computeStopwatchElapsed(timer, now);
            timer.startedAt = null;
            timer.state = 'paused';
            eventType.value = 'stopwatch_paused';
        } else if (action === 'resume') {
            if (timer.state !== 'paused' && timer.state !== 'idle') throw new Error('Stopwatch cannot resume from current state');
            timer.startedAt = now;
            timer.state = 'running';
            eventType.value = 'stopwatch_started';
        } else if (action === 'reset') {
            timer.accumulatedMs = Math.max(0, timer.initialMs || 0);
            timer.startedAt = null;
            timer.state = 'idle';
            timer.completedAt = null;
        } else if (action === 'set_time') {
            const nextMs = Math.max(0, parseDurationMs(params));
            timer.initialMs = nextMs;
            timer.accumulatedMs = nextMs;
            timer.startedAt = timer.state === 'running' ? now : null;
            if (timer.state === 'running') timer.state = 'running';
        } else if (action === 'add_time' || action === 'subtract_time') {
            if (adjustmentMs <= 0) throw new Error('Adjustment duration must be greater than 0');
            adjustStopwatchTime(timer, action === 'subtract_time' ? -adjustmentMs : adjustmentMs, now);
        } else if (action === 'visibility') {
            const mode = String(params.mode || params.actionMode || params.value || 'toggle').toLowerCase();
            if (mode === 'on' || mode === 'show' || mode === 'true') timer.visible = true;
            else if (mode === 'off' || mode === 'hide' || mode === 'false') timer.visible = false;
            else timer.visible = !timer.visible;
        } else {
            throw new Error(`Unsupported action for stopwatch: ${action}`);
        }
    }

    markTimerUpdated(timer);
    saveTimers();
    const snapshot = buildTimerSnapshot(timer);
    broadcastToOverlays('timer-update', { timer: snapshot, settings: timerStore.settings });
    if (eventType.value) fireTimerHttpAction(eventType.value, timer);
    return snapshot;
}

async function readRequestBody(req) {
    return await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

let timerTickHandle = null;

function startTimerTicker() {
    if (timerTickHandle) return;
    timerTickHandle = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const timer of Object.values(timerStore.timers)) {
            if (timer.kind !== 'countdown' || timer.state !== 'running') continue;
            const remainingMs = computeCountdownRemaining(timer, now);
            if (remainingMs > 0) continue;
            timer.state = 'completed';
            timer.startedAt = null;
            timer.remainingMs = 0;
            timer.startingRemainingMs = 0;
            timer.completedAt = new Date().toISOString();
            markTimerUpdated(timer);
            broadcastToOverlays('timer-update', { timer: buildTimerSnapshot(timer, now), settings: timerStore.settings });
            fireTimerHttpAction('countdown_complete', timer);
            alertEngine.handleEvent({ type: 'timer', timerId: timer.id, name: timer.label || timer.id, user: timer.label || timer.id, dedupeMs: 0 });
            changed = true;
        }
        if (changed) saveTimers();
    }, 250);
}

function sanitizeGoalId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function createEmptyViewerStats() {
    return {
        live: false,
        current: 0,
        peak: 0,
        average: 0,
        source: null,
        sampledAt: null,
        streamStartedAt: null,
        streamEndedAt: null,
        samples: []
    };
}

function normalizeViewerTrackingConfig(input = {}) {
    return {
        enabled: input?.enabled !== false,
        source: input?.source === 'twitch' ? 'twitch' : 'best_available',
        poll_seconds: clampNumber(input?.poll_seconds, 15, 3600, 60),
        retain_samples: clampNumber(input?.retain_samples, 60, 5000, 720)
    };
}

function normalizeViewerStats(input = {}) {
    const normalized = createEmptyViewerStats();
    normalized.live = !!input?.live;
    normalized.current = Math.max(0, Math.round(Number(input?.current) || 0));
    normalized.source = input?.source || null;
    normalized.sampledAt = input?.sampledAt || null;
    normalized.streamStartedAt = input?.streamStartedAt || null;
    normalized.streamEndedAt = input?.streamEndedAt || null;
    if (!normalized.streamStartedAt || normalized.streamStartedAt === normalized.streamEndedAt) {
        normalized.streamEndedAt = null;
    }
    normalized.samples = Array.isArray(input?.samples)
        ? input.samples
            .map(sample => ({
                ts: sample?.ts || new Date().toISOString(),
                count: Math.max(0, Math.round(Number(sample?.count) || 0)),
                live: sample?.live !== false,
                source: sample?.source || null
            }))
            .filter(sample => sample.ts)
        : [];

    const liveSamples = normalized.samples.filter(sample => sample.live !== false);
    normalized.peak = liveSamples.length > 0
        ? liveSamples.reduce((max, sample) => Math.max(max, sample.count), 0)
        : Math.max(0, Math.round(Number(input?.peak) || normalized.current));
    normalized.average = liveSamples.length > 0
        ? Number((liveSamples.reduce((sum, sample) => sum + sample.count, 0) / liveSamples.length).toFixed(1))
        : Math.max(0, Number(input?.average) || (normalized.live ? normalized.current : 0));
    return normalized;
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

function parseNumericAmount(value) {
    const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function normalizeGoalWeights(weights = {}) {
    return {
        followers: Math.max(0, Number(weights?.followers) || DEFAULT_COMMUNITY_WEIGHTS.followers),
        subscribers: Math.max(0, Number(weights?.subscribers) || DEFAULT_COMMUNITY_WEIGHTS.subscribers),
        gift_subs: Math.max(0, Number(weights?.gift_subs) || DEFAULT_COMMUNITY_WEIGHTS.gift_subs),
        bits_per_100: Math.max(0, Number(weights?.bits_per_100) || DEFAULT_COMMUNITY_WEIGHTS.bits_per_100),
        donations: Math.max(0, Number(weights?.donations) || DEFAULT_COMMUNITY_WEIGHTS.donations)
    };
}

function normalizeCommunityBaseline(metrics = {}) {
    return {
        followers: Math.max(0, Number(metrics?.followers) || 0),
        subscribers: Math.max(0, Number(metrics?.subscribers) || 0),
        gift_subs: Math.max(0, Number(metrics?.gift_subs) || 0),
        bits: Math.max(0, Number(metrics?.bits) || 0),
        donations: Math.max(0, Number(metrics?.donations) || 0)
    };
}

function goalDefaultTitle(type, viewerMode) {
    if (type === 'viewers') {
        return viewerMode === 'peak' ? 'Peak Viewers Goal' : 'Current Viewers Goal';
    }
    if (type === 'community') return 'Community Goal';
    return `${GOAL_TYPE_LABELS[type] || 'Goal'} Goal`;
}

function normalizeGoalItem(item = {}, index = 0, seenIds = new Set()) {
    const type = GOAL_TYPES.includes(item?.type) ? item.type : 'followers';
    const viewerMode = GOAL_VIEWER_MODES.includes(item?.viewer_mode) ? item.viewer_mode : 'current';
    const tracking = type === 'viewers'
        ? 'session'
        : (GOAL_TRACKING_TYPES.includes(item?.tracking) ? item.tracking : 'persistent');

    let id = sanitizeGoalId(item?.id) || `goal-${index + 1}`;
    while (seenIds.has(id)) {
        id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    return {
        id,
        enabled: item?.enabled !== false,
        title: String(item?.title || goalDefaultTitle(type, viewerMode)).trim() || goalDefaultTitle(type, viewerMode),
        type,
        target: Math.max(1, Number(item?.target) || 1),
        tracking,
        viewer_mode: viewerMode,
        baseline: Math.max(0, Number(item?.baseline) || 0),
        baseline_metrics: normalizeCommunityBaseline(item?.baseline_metrics),
        weights: normalizeGoalWeights(item?.weights)
    };
}

function normalizeGoalsConfig(input = {}) {
    const seenIds = new Set();
    return {
        enabled: input?.enabled !== false,
        rotate_seconds: clampNumber(input?.rotate_seconds, 3, 60, DEFAULT_GOALS_CONFIG.rotate_seconds),
        skip_completed: input?.skip_completed !== false,
        pause_completed_seconds: clampNumber(input?.pause_completed_seconds, 0, 30, DEFAULT_GOALS_CONFIG.pause_completed_seconds),
        items: Array.isArray(input?.items)
            ? input.items.map((item, index) => normalizeGoalItem(item, index, seenIds))
            : []
    };
}

function buildCommunityMetricSnapshot(metrics, tracking) {
    const source = tracking === 'session' ? metrics.session : metrics.persistent;
    return {
        followers: source.followers,
        subscribers: source.subscribers,
        gift_subs: source.gift_subs,
        bits: source.bits,
        donations: source.donations
    };
}

function computeCommunityPoints(metricSnapshot, weights) {
    const safe = normalizeCommunityBaseline(metricSnapshot);
    const normalizedWeights = normalizeGoalWeights(weights);
    return Number((
        safe.followers * normalizedWeights.followers +
        safe.subscribers * normalizedWeights.subscribers +
        safe.gift_subs * normalizedWeights.gift_subs +
        (safe.bits / 100) * normalizedWeights.bits_per_100 +
        safe.donations * normalizedWeights.donations
    ).toFixed(2));
}

function getCurrentSubscriberTotal() {
    return readJsonFileSafe(path.join(DATA_DIR, 'subs.json'), { data: [] })?.data?.length || 0;
}

function getCurrentFollowerTotal() {
    return readJsonFileSafe(path.join(DATA_DIR, 'followers.json'), { data: [] })?.data?.length || 0;
}

function getSessionGiftSubTotal() {
    return (chatData.giftSubs || []).reduce((sum, item) => sum + Math.max(1, Number(item?.count) || 1), 0);
}

function getSessionBitsTotal() {
    return (chatData.bits || []).reduce((sum, item) => sum + Math.max(0, Number(item?.bits) || parseNumericAmount(item?.amount)), 0);
}

function getSessionDonationTotal() {
    return Number((chatData.donations || []).reduce((sum, item) => sum + parseNumericAmount(item?.amountValue ?? item?.amount), 0).toFixed(2));
}

function getLifetimeGiftSubTotal() {
    return Object.values(statsData.giftSubs || {}).reduce((sum, item) => sum + sumDailyBuckets(item.days), 0);
}

function getLifetimeBitsTotal() {
    return Object.values(statsData.bits || {}).reduce((sum, item) => sum + sumDailyBuckets(item.days), 0);
}

function getLifetimeDonationTotal() {
    return Number(Object.values(statsData.donations || {}).reduce((sum, item) => sum + sumDailyBuckets(item.amounts), 0).toFixed(2));
}

function buildRecentEvents(limit) {
    const sources = [
        ['follow', chatData.followers, () => ''],
        ['sub', chatData.subscribers, item => item.membership || item.event || ''],
        ['gift', chatData.giftSubs, item => (item.recipient ? `→ ${item.recipient}` : '')],
        ['bits', chatData.bits, item => item.amount || ''],
        ['donation', chatData.donations, item => item.amount || ''],
        ['raid', chatData.raids, item => (item.viewers ? `${item.viewers} viewers` : '')]
    ];
    const events = [];
    for (const [type, items, detail] of sources) {
        (items || []).slice(-limit).forEach((item, index) => events.push({
            type,
            user: item.chatname || item.gifter || '',
            detail: String(detail(item) || ''),
            timestamp: Number(item.timestamp) || 0,
            order: index
        }));
    }
    // Entries from before timestamps were recorded sort last, newest-first within their own type.
    return events.sort((a, b) => b.timestamp - a.timestamp || b.order - a.order).slice(0, limit);
}

function buildGoalMetrics() {
    const viewers = getViewerSummary();
    return {
        viewers,
        session: {
            followers: chatData.followers.length,
            subscribers: chatData.subscribers.length,
            gift_subs: getSessionGiftSubTotal(),
            bits: getSessionBitsTotal(),
            donations: getSessionDonationTotal()
        },
        persistent: {
            followers: getCurrentFollowerTotal(),
            subscribers: getCurrentSubscriberTotal(),
            gift_subs: getLifetimeGiftSubTotal(),
            bits: getLifetimeBitsTotal(),
            donations: getLifetimeDonationTotal()
        }
    };
}

function computeGoalItemState(item, metrics) {
    const normalized = normalizeGoalItem(item, 0, new Set());
    let progress = 0;
    let rawValue = 0;
    let metricLabel = GOAL_TYPE_LABELS[normalized.type] || 'Goal';
    let tracking = normalized.tracking;

    if (normalized.type === 'viewers') {
        tracking = 'session';
        rawValue = normalized.viewer_mode === 'peak' ? metrics.viewers.peak : metrics.viewers.current;
        progress = rawValue;
        metricLabel = normalized.viewer_mode === 'peak' ? 'Peak Viewers' : 'Current Viewers';
    } else if (normalized.type === 'community') {
        const currentMetrics = buildCommunityMetricSnapshot(metrics, tracking);
        rawValue = computeCommunityPoints(currentMetrics, normalized.weights);
        if (tracking === 'session') {
            progress = rawValue;
        } else {
            const diffMetrics = {
                followers: Math.max(0, currentMetrics.followers - normalized.baseline_metrics.followers),
                subscribers: Math.max(0, currentMetrics.subscribers - normalized.baseline_metrics.subscribers),
                gift_subs: Math.max(0, currentMetrics.gift_subs - normalized.baseline_metrics.gift_subs),
                bits: Math.max(0, currentMetrics.bits - normalized.baseline_metrics.bits),
                donations: Math.max(0, currentMetrics.donations - normalized.baseline_metrics.donations)
            };
            progress = computeCommunityPoints(diffMetrics, normalized.weights);
        }
        metricLabel = 'Community Points';
    } else {
        rawValue = tracking === 'session' ? metrics.session[normalized.type] : metrics.persistent[normalized.type];
        progress = tracking === 'session' ? rawValue : Math.max(0, rawValue - normalized.baseline);
    }

    const complete = normalized.target > 0 && progress >= normalized.target;
    const remaining = Math.max(0, Number((normalized.target - progress).toFixed(2)));
    const percent = normalized.target > 0 ? Math.min(100, Number(((progress / normalized.target) * 100).toFixed(1))) : 0;

    return {
        ...normalized,
        tracking,
        metric_label: metricLabel,
        unit: normalized.type === 'donations' ? 'usd' : 'count',
        raw_value: Number(rawValue.toFixed ? rawValue.toFixed(2) : rawValue),
        progress: Number(progress.toFixed ? progress.toFixed(2) : progress),
        remaining,
        percent,
        complete
    };
}

function buildGoalsSnapshot() {
    const settings = normalizeGoalsConfig(config.goals || DEFAULT_GOALS_CONFIG);
    const metrics = buildGoalMetrics();
    const items = settings.items.map(item => computeGoalItemState(item, metrics));
    const enabledItems = items.filter(item => item.enabled);
    return {
        settings,
        items,
        summary: {
            total: items.length,
            enabled: enabledItems.length,
            completed: enabledItems.filter(item => item.complete).length
        },
        metrics
    };
}

const alertGoalState = new Map();
function checkGoalAlerts() {
    try {
        const items = buildGoalsSnapshot().items;
        const first = alertGoalState.size === 0;
        items.forEach(item => {
            const was = alertGoalState.get(item.id);
            alertGoalState.set(item.id, !!item.complete);
            if (!first && was === false && item.complete && item.enabled) {
                alertEngine.handleEvent({ type: 'goal', goalId: item.id, name: item.label || item.title || item.id, user: item.label || item.title || item.id, amount: item.target || 0, dedupeMs: 0 });
            }
        });
    } catch { /* goals unavailable */ }
}
setInterval(checkGoalAlerts, 5000).unref();

function saveRuntimeConfigSection(updater) {
    const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    updater(current);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    applyRuntimeConfig(current);
    return current;
}

function resetGoalBaseline(goalId) {
    const snapshot = buildGoalsSnapshot();
    const goal = snapshot.items.find(item => item.id === goalId);
    if (!goal) throw new Error('Goal not found');
    if (goal.type === 'viewers') throw new Error('Viewer goals use live/session values and do not support baseline reset');
    if (goal.tracking === 'session') throw new Error('Session goals reset when you start a new session');

    saveRuntimeConfigSection(current => {
        const settings = normalizeGoalsConfig(current.goals || DEFAULT_GOALS_CONFIG);
        current.goals = settings;
        const target = current.goals.items.find(item => sanitizeGoalId(item.id) === goalId);
        if (!target) throw new Error('Goal not found');
        if (goal.type === 'community') {
            target.baseline_metrics = buildCommunityMetricSnapshot(snapshot.metrics, 'persistent');
        } else {
            target.baseline = goal.raw_value;
        }
    });

    return buildGoalsSnapshot();
}

function toggleGoalEnabled(goalId, mode = 'toggle') {
    saveRuntimeConfigSection(current => {
        const settings = normalizeGoalsConfig(current.goals || DEFAULT_GOALS_CONFIG);
        current.goals = settings;
        const target = current.goals.items.find(item => sanitizeGoalId(item.id) === goalId);
        if (!target) throw new Error('Goal not found');
        if (mode === 'on' || mode === 'enable' || mode === 'true') target.enabled = true;
        else if (mode === 'off' || mode === 'disable' || mode === 'false') target.enabled = false;
        else target.enabled = target.enabled === false;
    });

    return buildGoalsSnapshot();
}

function getViewerSummary(sourceData = chatData) {
    const viewerStats = normalizeViewerStats(sourceData?.viewerStats);
    return {
        enabled: normalizeViewerTrackingConfig(config.viewer_tracking).enabled,
        live: viewerStats.live,
        current: viewerStats.current,
        peak: viewerStats.peak,
        average: viewerStats.average,
        source: viewerStats.source,
        sampledAt: viewerStats.sampledAt,
        streamStartedAt: viewerStats.streamStartedAt,
        streamEndedAt: viewerStats.streamEndedAt,
        sampleCount: viewerStats.samples.length,
        samples: viewerStats.samples
    };
}

function recordViewerSample({ count, live, source, streamStartedAt }) {
    const cfg = normalizeViewerTrackingConfig(config.viewer_tracking);
    const normalized = normalizeViewerStats(chatData.viewerStats);
    const wasLive = normalized.live;
    const now = new Date().toISOString();
    normalized.live = !!live;
    normalized.current = Math.max(0, Math.round(Number(count) || 0));
    normalized.source = source || normalized.source || 'twitch';
    normalized.sampledAt = now;
    if (normalized.live && (!wasLive || !normalized.streamStartedAt)) {
        normalized.streamStartedAt = streamStartedAt || now;
        normalized.streamEndedAt = null;
    } else if (!normalized.live && wasLive && normalized.streamStartedAt) {
        normalized.streamEndedAt = now;
    }
    normalized.samples.push({
        ts: now,
        count: normalized.current,
        live: normalized.live,
        source: normalized.source
    });
    while (normalized.samples.length > cfg.retain_samples) normalized.samples.shift();
    chatData.viewerStats = normalizeViewerStats(normalized);
    broadcastToOverlays('viewer-update', getViewerSummary());
    broadcastToOverlays('goals-update', buildGoalsSnapshot());
}

function findSSNViewerCount(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 3) return null;

    const viewerKeys = ['viewer_count', 'viewerCount', 'viewers', 'audience_count', 'audienceCount', 'current_viewers', 'currentViewers'];
    for (const key of viewerKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            const count = Number(value[key]);
            if (Number.isFinite(count) && count >= 0) {
                return {
                    count,
                    live: value.live !== false && value.online !== false,
                    streamStartedAt: value.stream_started_at || value.streamStartedAt || null
                };
            }
        }
    }

    for (const key of ['data', 'payload', 'meta', 'overlayNinja']) {
        const nested = findSSNViewerCount(value[key], depth + 1);
        if (nested) return nested;
    }
    return null;
}

function processSSNViewerUpdate(msg) {
    const viewerUpdate = findSSNViewerCount(msg);
    if (!viewerUpdate) return false;

    lastSSNViewerUpdateAt = Date.now();
    recordViewerSample({
        ...viewerUpdate,
        source: 'socialstream'
    });
    return true;
}

function startViewerTracking() {
    if (viewerPollHandle) return;
    const cfg = normalizeViewerTrackingConfig(config.viewer_tracking);
    if (!cfg.enabled) return;
    fetchViewerCount();
    viewerPollHandle = setInterval(fetchViewerCount, cfg.poll_seconds * 1000);
    console.log(`[Viewers] Polling every ${cfg.poll_seconds}s`);
}

function stopViewerTracking() {
    if (!viewerPollHandle) return;
    clearInterval(viewerPollHandle);
    viewerPollHandle = null;
    console.log('[Viewers] Polling stopped');
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
if (!fs.existsSync(CUSTOM_OVERLAY_ASSETS_DIR)) {
    fs.mkdirSync(CUSTOM_OVERLAY_ASSETS_DIR, { recursive: true });
}

// ============================================================================
// TWITCH OAUTH (User Token via Authorization Code Flow)
// ============================================================================

const TWITCH_SCOPES = 'channel:read:subscriptions bits:read moderator:read:followers clips:edit channel:manage:clips';
const TWITCH_REDIRECT_URI = config.twitch?.redirect_uri || `http://localhost:${PORT}/auth/callback`;
const TOKEN_PATH = path.join(DATA_DIR, '.twitch-token.json');

let twitchAccessToken = null;
let twitchRefreshToken = null;
let twitchTokenExpiry = 0;
let twitchTokenScopes = [];

function loadStoredToken() {
    try {
        if (fs.existsSync(TOKEN_PATH)) {
            const stored = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            twitchAccessToken = stored.access_token;
            twitchRefreshToken = stored.refresh_token;
            twitchTokenExpiry = stored.expires_at || 0;
            twitchTokenScopes = Array.isArray(stored.scope) ? stored.scope : [];
            if (stored.client_id && stored.client_id !== TWITCH_CLIENT_ID) {
                console.warn('[Twitch] Stored token belongs to a different Twitch app — reconnect required');
                twitchAccessToken = null; twitchRefreshToken = null; twitchTokenExpiry = 0; twitchTokenScopes = [];
                return false;
            }
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
    if (Array.isArray(tokenData.scope)) twitchTokenScopes = tokenData.scope;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({
        access_token: twitchAccessToken,
        refresh_token: twitchRefreshToken,
        expires_at: twitchTokenExpiry,
        scope: twitchTokenScopes,
        client_id: TWITCH_CLIENT_ID
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
        const refreshBody = { client_id: TWITCH_CLIENT_ID, grant_type: 'refresh_token', refresh_token: twitchRefreshToken };
        if (TWITCH_CLIENT_SECRET) refreshBody.client_secret = TWITCH_CLIENT_SECRET;
        const tokenData = await twitchTokenRequest(refreshBody);
        saveToken(tokenData);
        console.log('[Twitch] Token refreshed, expires in', Math.round(tokenData.expires_in / 60), 'minutes');
        return true;
    } catch (err) {
        console.error('[Twitch] Token refresh failed:', err.message);
        // Only a rejection from Twitch means the token is dead; network errors keep it for the next try.
        if (/invalid refresh token|invalid_grant|Invalid refresh|"status":40[01]/i.test(err.message)) {
            twitchAccessToken = null;
            twitchRefreshToken = null;
            try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
        }
        return false;
    }
}

// Only allow same-site relative paths as post-auth redirect targets
function safeReturnPath(value) {
    const v = String(value || '');
    return /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : '/';
}

// Device code grant flow (works for public Twitch apps with no client secret)
let deviceAuth = null;

function twitchFormPost(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
        .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
}

async function startDeviceAuth() {
    const r = await twitchFormPost('https://id.twitch.tv/oauth2/device', { client_id: TWITCH_CLIENT_ID, scopes: TWITCH_SCOPES });
    if (!r.ok || !r.data.device_code) throw new Error(r.data.message || `Twitch device request failed (${r.status})`);
    deviceAuth = {
        deviceCode: r.data.device_code,
        userCode: r.data.user_code,
        verificationUri: r.data.verification_uri,
        interval: Math.max(1, r.data.interval || 5),
        expiresAt: Date.now() + (r.data.expires_in || 1800) * 1000,
        nextPollAt: Date.now() + Math.max(1, r.data.interval || 5) * 1000,
        status: 'pending',
        error: ''
    };
    return deviceAuth;
}

async function pollDeviceAuth() {
    if (!deviceAuth) return { status: 'idle' };
    if (deviceAuth.status !== 'pending') return deviceAuth;
    if (Date.now() > deviceAuth.expiresAt) { deviceAuth.status = 'expired'; return deviceAuth; }
    // Never hit Twitch faster than its polling interval, however often clients ask
    if (Date.now() < deviceAuth.nextPollAt) return deviceAuth;
    deviceAuth.nextPollAt = Date.now() + deviceAuth.interval * 1000;
    const r = await twitchFormPost('https://id.twitch.tv/oauth2/token', {
        client_id: TWITCH_CLIENT_ID,
        scopes: TWITCH_SCOPES,
        device_code: deviceAuth.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
    if (r.ok && r.data.access_token) {
        saveToken(r.data);
        deviceAuth.status = 'authorized';
        await syncBroadcasterFromToken();
        fetchTwitchData(); fetchStreamInfo(); fetchViewerCount();
    } else if (/authorization_pending/i.test(r.data.message || '')) {
        // still waiting for the user to approve
    } else if (/slow_down/i.test(r.data.message || '')) {
        deviceAuth.interval += 5;
        deviceAuth.nextPollAt = Date.now() + deviceAuth.interval * 1000;
    } else {
        deviceAuth.status = /expired|invalid device/i.test(r.data.message || '') ? 'expired' : 'error';
        deviceAuth.error = r.data.message || `Twitch error (${r.status})`;
    }
    return deviceAuth;
}

// Fills in broadcaster_id / broadcaster_name from the authorized account when config.json has none
let broadcasterSyncedFromToken = false;
async function syncBroadcasterFromToken() {
    try {
        const r = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchAccessToken}` } });
        const user = (await r.json()).data?.[0];
        if (!user) return;
        if (!BROADCASTER_ID) {
            const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            current.broadcaster_id = user.id;
            if (!cleanConfigValue(current.broadcaster_name)) current.broadcaster_name = user.login;
            BROADCASTER_ID = user.id;
            if (!BROADCASTER_NAME) BROADCASTER_NAME = user.login;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
            broadcasterSyncedFromToken = true;
            console.log(`[Twitch] Saved broadcaster ${user.login} (${user.id}) to config.json`);
        }
    } catch (err) { console.warn('[Twitch] Could not look up broadcaster:', err.message); }
}

async function ensureToken() {
    if (twitchAccessToken && Date.now() < twitchTokenExpiry) return true;
    if (twitchRefreshToken) return await refreshTwitchToken();
    return false;
}

// ============================================================================
// TWITCH API HELPERS
// ============================================================================

// A 401 means the access token was revoked or expired early, so refresh once and replay.
async function twitchApiRequest(endpoint, params = {}) {
    const result = await twitchApiRequestOnce(endpoint, params);
    if (result.status === 401 && twitchRefreshToken && await refreshTwitchToken()) return twitchApiRequestOnce(endpoint, params);
    return result;
}

function twitchApiRequestOnce(endpoint, params = {}) {
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

function twitchCreateClip() {
    return new Promise((resolve, reject) => {
        const query = new URLSearchParams({ broadcaster_id: BROADCASTER_ID }).toString();
        const req = https.request(`https://api.twitch.tv/helix/clips?${query}`, {
            method: 'POST',
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${twitchAccessToken}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
                } catch {
                    reject(new Error(`Twitch clip API parse error: ${data.substring(0, 200)}`));
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

// One snapshot per day (last refresh wins) so the analytics page can chart subscriber growth and churn
const SUB_HISTORY_PATH = path.join(DATA_DIR, 'sub-history.json');

function recordSubSnapshot(subs) {
    try {
        const history = readJsonFileSafe(SUB_HISTORY_PATH, { snapshots: [], ids: [] }) || { snapshots: [], ids: [] };
        const snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
        const previousIds = new Set(Array.isArray(history.ids) ? history.ids : []);
        const ids = [...new Set(subs.map(sub => String(sub.user_id || sub.user_login || '')).filter(Boolean))];
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const tiers = tier => subs.filter(sub => String(sub.tier) === tier).length;
        const hadHistory = previousIds.size > 0;
        const joined = hadHistory ? ids.filter(id => !previousIds.has(id)).length : 0;
        const left = hadHistory ? [...previousIds].filter(id => !ids.includes(id)).length : 0;
        const entry = { date, total: subs.length, unique: ids.length, t1: tiers('1000'), t2: tiers('2000'), t3: tiers('3000'), gifted: subs.filter(sub => sub.is_gift).length, joined, left };
        const last = snapshots[snapshots.length - 1];
        if (last && last.date === date) {
            entry.joined += last.joined || 0;
            entry.left += last.left || 0;
            snapshots[snapshots.length - 1] = entry;
        } else {
            snapshots.push(entry);
        }
        fs.writeFileSync(SUB_HISTORY_PATH, JSON.stringify({ snapshots: snapshots.slice(-730), ids }));
    } catch (err) {
        console.warn('[Twitch] Could not record subscriber snapshot:', err.message);
    }
}

async function fetchTwitchData() {
    if (!TWITCH_CLIENT_ID || !BROADCASTER_ID) {
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
        recordSubSnapshot(subs);

        // Fetch bits leaderboard (month)
        console.log('[Twitch] Fetching bits leaderboard...');
        const bitsResult = await twitchApiRequest('/bits/leaderboard', { count: '100', period: 'month', started_at: new Date().toISOString() });
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

async function fetchViewerCount() {
    const viewerConfig = normalizeViewerTrackingConfig(config.viewer_tracking);
    if (!viewerConfig.enabled) return;
    const ssnFreshnessMs = Math.max(viewerConfig.poll_seconds * 2000, 30000);
    if (viewerConfig.source === 'best_available' && Date.now() - lastSSNViewerUpdateAt < ssnFreshnessMs) {
        return;
    }
    if (!TWITCH_CLIENT_ID || !BROADCASTER_ID) {
        console.warn('[Viewers] Missing Twitch credentials or broadcaster_id — viewer tracking unavailable');
        return;
    }

    const hasToken = await ensureToken();
    if (!hasToken) return;

    try {
        const result = await twitchApiRequest('/streams', { user_id: BROADCASTER_ID });
        if (result.status !== 200) {
            console.warn(`[Viewers] Twitch /streams returned ${result.status}`);
            return;
        }

        const stream = result.body.data?.[0] || null;
        recordViewerSample({
            count: stream?.viewer_count || 0,
            live: !!stream,
            source: 'twitch',
            streamStartedAt: stream?.started_at || null
        });
    } catch (err) {
        console.error('[Viewers] Fetch error:', err.message);
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
        refreshGameInfo(category);
    } catch (err) {
        console.error('[Twitch] Stream info fetch error:', err.message);
    }
}


// ============================================================================
// SESSION LIFECYCLE (auto start/end driven by Twitch live state)
// ============================================================================

const LIFECYCLE_PATH = path.join(DATA_DIR, 'session-lifecycle.json');
let lifecycleMemo = { lastArchive: null };
try { lifecycleMemo = { lastArchive: null, ...JSON.parse(fs.readFileSync(LIFECYCLE_PATH, 'utf8')) }; } catch { /* first run */ }
const lifecycle = {
    liveStreak: 0,
    liveId: null,        // Twitch stream id already handled
    lastLiveAt: 0,
    offlineSince: 0,
    suppressed: false,   // set by a manual End Session while still live; cleared once Twitch reports offline
    timer: null
};

function normalizeLifecycleConfig(input = {}) {
    return {
        auto: input?.auto !== false,
        end_grace_minutes: clampNumber(input?.end_grace_minutes, 1, 240, 15),
        resume_window_minutes: clampNumber(input?.resume_window_minutes, 0, 1440, 120),
        min_session_minutes: clampNumber(input?.min_session_minutes, 0, 120, 5),
        poll_seconds: clampNumber(input?.poll_seconds, 10, 600, 30)
    };
}

function noteArchivedSession(name) {
    lifecycleMemo.lastArchive = { name, endedAt: Date.now() };
    try { fs.writeFileSync(LIFECYCLE_PATH, JSON.stringify(lifecycleMemo)); } catch { /* non-critical */ }
}

function sessionHasData() {
    return (chatData.messageCount || 0) > 0 || chatLog.length > 0;
}

function broadcastSessionState() {
    broadcastToOverlays('update', chatData);
    broadcastToOverlays('viewer-update', getViewerSummary());
    broadcastToOverlays('goals-update', buildGoalsSnapshot());
}

// Shared by the manual End Session endpoint and the automatic end
function endSessionNow({ endedAtIso = null, discard = false } = {}) {
    if (endedAtIso) {
        const stats = normalizeViewerStats(chatData.viewerStats);
        const startMs = Date.parse(stats.streamStartedAt || '');
        if (Number.isFinite(startMs) && Date.parse(endedAtIso) > startMs) {
            stats.streamEndedAt = endedAtIso;
            chatData.viewerStats = stats;
        }
    }
    const streamEndedAt = finalizeSessionStreamEnd();
    // Close the last category entry at the real stream end so grace/offline time isn't counted
    const lastInfo = chatData.streamInfo?.[chatData.streamInfo.length - 1];
    if (lastInfo && streamEndedAt) lastInfo.endedAt = streamEndedAt;
    saveChatData();
    saveStats();
    saveChatLog();
    let archiveName = null;
    if (!discard) {
        recordPlayedGames(JSON.parse(JSON.stringify(chatData.streamInfo || [])), Date.parse(streamEndedAt || '') || Date.now(), Date.parse(normalizeViewerStats(chatData.viewerStats).streamStartedAt || ''))
            .catch(err => console.error('[GamePlan] Auto-add failed:', err.message));
        archiveName = archiveSession();
        performAutoBackup();
    }
    resetChatData();
    sessionActive = false;
    broadcastSessionState();
    return { archiveName, streamEndedAt };
}

function startSessionNow() {
    resetChatData();
    sessionActive = true;
    broadcastSessionState();
    if (twitchAccessToken && BROADCASTER_ID) {
        fetchTwitchData();
        fetchStreamInfo();
        fetchViewerCount();
    }
}

function resumeArchivedSession(name) {
    const src = path.join(SESSIONS_DIR, name);
    if (!fs.existsSync(src)) return false;
    fs.copyFileSync(src, LIVE_CHAT_PATH);
    const logSrc = path.join(SESSIONS_DIR, name.replace('chat-', 'chatlog-').replace('.json', '.jsonl'));
    if (fs.existsSync(logSrc)) fs.copyFileSync(logSrc, CHAT_LOG_PATH);
    else { try { fs.unlinkSync(CHAT_LOG_PATH); } catch { /* none */ } }
    loadCurrentSessionStateFromDisk();
    // Keep the original stream start so reconnects don't shorten the session
    chatData.viewerStats = normalizeViewerStats({ ...chatData.viewerStats, live: true, streamEndedAt: null });
    // Restart category timing from now so the offline gap isn't counted
    const lastInfo = chatData.streamInfo?.[chatData.streamInfo.length - 1];
    if (lastInfo?.endedAt) chatData.streamInfo.push({ title: lastInfo.title, category: lastInfo.category, changedAt: new Date().toISOString() });
    sessionActive = true;
    broadcastSessionState();
    return true;
}

function lifecycleOnLive(stream, cfg) {
    lifecycle.offlineSince = 0;
    lifecycle.lastLiveAt = Date.now();
    lifecycle.liveStreak++;
    if (lifecycle.suppressed || lifecycle.liveStreak < 2 || lifecycle.liveId === stream.id) return;
    lifecycle.liveId = stream.id;

    const windowMs = cfg.resume_window_minutes * 60000;
    const last = lifecycleMemo.lastArchive;
    const recentArchive = last && Date.now() - last.endedAt <= windowMs ? last.name : null;

    if (!sessionHasData()) {
        if (recentArchive && resumeArchivedSession(recentArchive)) {
            console.log(`[Lifecycle] Live again — resumed ${recentArchive}`);
        } else {
            startSessionNow();
            console.log('[Lifecycle] Live — started a new session');
        }
        return;
    }

    // Leftover data from an earlier stream: close it out unless it's recent enough to be the same stream
    const stats = normalizeViewerStats(chatData.viewerStats);
    const lastActivity = Date.parse(chatData.lastUpdated || '') || 0;
    const sameStream = !stats.streamStartedAt || stats.streamStartedAt === stream.started_at;
    if (!sameStream && Date.now() - lastActivity > windowMs) {
        const ended = endSessionNow({ endedAtIso: chatData.lastUpdated || null });
        console.log(`[Lifecycle] Closed out stale session (${ended.archiveName || 'not archived'}) and starting a new one`);
        startSessionNow();
    } else if (!sessionActive) {
        sessionActive = true;
        broadcastSessionState();
    }
}

function lifecycleOnOffline(cfg) {
    lifecycle.liveStreak = 0;
    lifecycle.suppressed = false;
    if (!lifecycle.lastLiveAt || !sessionActive) return;
    if (!lifecycle.offlineSince) lifecycle.offlineSince = Date.now();
    if (Date.now() - lifecycle.offlineSince < cfg.end_grace_minutes * 60000) return;

    const startMs = Date.parse(normalizeViewerStats(chatData.viewerStats).streamStartedAt || '');
    const endedAtIso = new Date(lifecycle.lastLiveAt).toISOString();
    const tooShort = Number.isFinite(startMs) && lifecycle.lastLiveAt - startMs < cfg.min_session_minutes * 60000;
    const ended = endSessionNow({ endedAtIso, discard: tooShort });
    console.log(tooShort
        ? `[Lifecycle] Stream was under ${cfg.min_session_minutes} min — session discarded`
        : `[Lifecycle] Offline ${cfg.end_grace_minutes} min — session ended${ended.archiveName ? ` (${ended.archiveName})` : ''}`);
    lifecycle.offlineSince = 0;
    lifecycle.lastLiveAt = 0;
    lifecycle.liveId = null;
}

async function pollLifecycle() {
    const cfg = normalizeLifecycleConfig(config.session_lifecycle);
    if (!cfg.auto || !TWITCH_CLIENT_ID || !BROADCASTER_ID) return;
    try {
        if (!(await ensureToken())) return;
        const result = await twitchApiRequest('/streams', { user_id: BROADCASTER_ID });
        // Network or API errors are not "offline", so an internet outage never ends a session
        if (result.status !== 200) return;
        const stream = result.body.data?.[0] || null;
        if (stream) lifecycleOnLive(stream, cfg);
        else lifecycleOnOffline(cfg);
    } catch (err) {
        console.warn('[Lifecycle] Poll failed:', err.message);
    }
}

function getLifecycleStatus() {
    const cfg = normalizeLifecycleConfig(config.session_lifecycle);
    const endsAt = lifecycle.offlineSince && sessionActive
        ? lifecycle.offlineSince + cfg.end_grace_minutes * 60000
        : null;
    return {
        auto: cfg.auto,
        state: !cfg.auto ? 'off' : lifecycle.suppressed ? 'manual' : endsAt ? 'ending' : lifecycle.liveStreak ? 'live' : 'waiting',
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        graceMinutes: cfg.end_grace_minutes
    };
}

// "waiting" means auto sessions are on and nothing has happened yet, so the empty session's start time (usually just when the server booted) is not meaningful.
function getSessionPhase() {
    const cfg = normalizeLifecycleConfig(config.session_lifecycle);
    if (cfg.auto && !sessionHasData() && !lifecycle.liveStreak) return 'waiting';
    return sessionActive ? 'active' : 'ended';
}

function startLifecycleWatcher() {
    if (lifecycle.timer) clearInterval(lifecycle.timer);
    const cfg = normalizeLifecycleConfig(config.session_lifecycle);
    lifecycle.timer = setInterval(pollLifecycle, cfg.poll_seconds * 1000);
    setTimeout(pollLifecycle, 3000);
}

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
        return twitchAccessToken;
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

const GAME_PLAN_PATH = path.join(DATA_DIR, 'game-plan.json');
function loadGamePlan() {
    try { return normalizeGamePlan(JSON.parse(fs.readFileSync(GAME_PLAN_PATH, 'utf8'))); } catch { return { lists: [], tiers: DEFAULT_TIERS, tierSets: {}, items: [], periods: [] }; }
}


// Looks up IGDB data for new names one at a time so a long list does not hit the rate limit.
let gameWarmQueue = Promise.resolve();
function warmGameInfo(games) {
    for (const { name, igdbId, custom } of games) {
        if (custom) continue;
        const cached = gameInfoCache[infoKey(name, igdbId)];
        if (cached && !cached.failed && cached.v === GAME_INFO_VERSION && !(cached.source === 'igdb' && !cached.igdbUrl && !cached.urlTried)) continue;
        gameWarmQueue = gameWarmQueue.then(() => refreshGameInfo(name, igdbId)).then(() => new Promise(resolve => setTimeout(resolve, 300)));
    }
}

// Minutes streamed per category across archived sessions plus the open one, keyed by normalized category name.
let playTimeCache = { at: 0, totals: {} };
function streamedMinutesByKey() {
    if (Date.now() - playTimeCache.at > 60000) {
        const totals = {};
        for (const [name, minutes] of Object.entries(archivedCategoryMinutes())) totals[gameKey(name)] = (totals[gameKey(name)] || 0) + minutes;
        playTimeCache = { at: Date.now(), totals };
    }
    const floor = Date.parse(normalizeViewerStats(chatData.viewerStats).streamStartedAt || '');
    const merged = { ...playTimeCache.totals };
    for (const [name, minutes] of Object.entries(categoryMinutesFor(chatData.streamInfo, Date.now(), floor))) merged[gameKey(name)] = (merged[gameKey(name)] || 0) + minutes;
    return merged;
}

function buildGamePlanSnapshot() {
    const plan = loadGamePlan();
    const streamed = streamedMinutesByKey();
    const category = chatData.streamInfo?.[chatData.streamInfo.length - 1]?.category || '';
    const current = gameKey(category);
    warmGameInfo(plan.items);
    return {
        current: category,
        lists: plan.lists,
        periods: plan.periods,
        tiers: plan.tiers,
        tierSets: plan.tierSets,
        items: plan.items.map(item => {
            const game = item.custom ? { name: item.name } : publicGameInfo(item.name, item.igdbId);
            const raw = item.custom ? null : gameInfoCache[infoKey(item.name, item.igdbId)];
            const keys = [item.name, item.twitchCategory, raw?.igdbName].map(gameKey).filter(Boolean);
            return {
                ...item,
                minutesPlayed: Math.round([...new Set(keys)].reduce((sum, key) => sum + (streamed[key] || 0), 0)),
                cover: item.customCover || game.cover || '',
                releaseYear: game.releaseYear || '',
                genres: game.genres || [],
                platforms: game.platforms || [],
                playingNow: !item.custom && !!current && keys.includes(current)
            };
        })
    };
}

// Adds streamed games to the Game Plan as played, with the dates they were streamed.
// Games already on any list keep their list and only gain dates. Twitch categories without an IGDB id
// (Just Chatting, Special Events, Music, ...) are not games and are skipped.
async function applyPlayedSpans(spans) {
    const auto = { enabled: true, min_minutes: 15, skip: ['Just Chatting'], ...(config.game_plan_auto || {}) };
    const skip = new Set((Array.isArray(auto.skip) ? auto.skip : String(auto.skip || '').split(',')).map(gameKey).filter(Boolean));
    const plan = loadGamePlan();
    const result = { added: [], updated: 0 };
    for (const { name, minutes, dates } of spans) {
        if (!name || name === '(No Category)' || minutes < Number(auto.min_minutes || 0) || skip.has(gameKey(name))) continue;
        const key = gameKey(name);
        let item = plan.items.find(entry => [entry.name, entry.twitchCategory, gameInfoCache[infoKey(entry.name, entry.igdbId)]?.igdbName].map(gameKey).includes(key));
        if (!item) {
            const info = await refreshGameInfo(name);
            if (!info || info.failed || !info.igdbId) continue;
            item = { id: `game-${Date.now().toString(36)}-${plan.items.length}`, name, status: 'played', period: '', note: '', twitchCategory: name, igdbId: String(info.igdbId), custom: false, customCover: '', rating: 0, tier: '', tags: [], finished: '', played: [], autoAdded: true };
            plan.items.push(item);
            result.added.push(name);
        }
        const before = (item.played || []).length;
        item.played = [...new Set([...(item.played || []), ...dates])].sort().slice(-400);
        if (item.played.length !== before && !result.added.includes(name)) result.updated++;
    }
    if (result.added.length || result.updated) fs.writeFileSync(GAME_PLAN_PATH, JSON.stringify(normalizeGamePlan(plan), null, 2));
    return result;
}

async function recordPlayedGames(streamInfo, endMs, startFloorMs) {
    if ((config.game_plan_auto || {}).enabled === false) return;
    const spent = categoryTimeFor(streamInfo, endMs, startFloorMs);
    const result = await applyPlayedSpans(Object.entries(spent).map(([name, slot]) => ({ name, minutes: slot.minutes, dates: [...slot.dates] })));
    for (const name of result.added) console.log(`[GamePlan] Added "${name}" as played`);
}

// Walks every archived session once so games streamed before auto-add existed are picked up too.
async function backfillPlayedGames() {
    const spans = [];
    if (fs.existsSync(SESSIONS_DIR)) {
        for (const file of fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith('chat-') && f.endsWith('.json')).sort()) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
                const endMs = Date.parse(data.lastUpdated || data.startedAt);
                const floor = Date.parse(data.viewerStats?.streamStartedAt || '');
                for (const [name, slot] of Object.entries(categoryTimeFor(data.streamInfo, endMs, floor))) spans.push({ name, minutes: slot.minutes, dates: [...slot.dates] });
            } catch { /* skip unreadable sessions */ }
        }
    }
    return applyPlayedSpans(spans);
}

// ============================================================================
// WEATHER (Open-Meteo: free, no API key)
// ============================================================================

const WEATHER_CODES = {
    0: ['Clear', '☀️', '🌙'], 1: ['Mostly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'], 48: ['Freezing fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'], 56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'], 66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '❄️', '❄️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Light showers', '🌦️', '🌧️'], 81: ['Showers', '🌧️', '🌧️'], 82: ['Heavy showers', '🌧️', '🌧️'], 85: ['Snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm, hail', '⛈️', '⛈️'], 99: ['Thunderstorm, hail', '⛈️', '⛈️']
};

function normalizeWeatherConfig(input = {}) {
    const slugs = new Set();
    const extra = [];
    for (const entry of (Array.isArray(input?.extra_locations) ? input.extra_locations : String(input?.extra_locations || '').split('\n')).slice(0, 8)) {
        const name = String(entry || '').trim().slice(0, 80);
        const slug = weatherSlug(name);
        if (name && slug && !slugs.has(slug)) { slugs.add(slug); extra.push(name); }
    }
    return {
        enabled: input?.enabled === true,
        location: String(input?.location || '').trim().slice(0, 80),
        extra_locations: extra,
        units: input?.units === 'metric' ? 'metric' : 'imperial',
        poll_minutes: Math.max(5, Math.min(180, Math.round(Number(input?.poll_minutes) || 15)))
    };
}

// "Tokyo, Japan" -> "tokyo": the key used in {{weather.tokyo.temp}}
function weatherSlug(location) {
    return String(location || '').split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
}

let weatherState = { ok: false, error: '', extras: {} };
let weatherTimer = null;
const weatherGeoCache = new Map();

async function geocodeWeather(location) {
    if (weatherGeoCache.has(location)) return weatherGeoCache.get(location);
    const [name, ...rest] = location.split(',').map(part => part.trim()).filter(Boolean);
    const hint = rest.join(' ').toLowerCase();
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
    const results = (await response.json()).results || [];
    const match = (hint && results.find(place => [place.admin1, place.country, place.country_code].some(value => value && hint.includes(String(value).toLowerCase())))) || results[0];
    if (!match) throw new Error(`Could not find "${location}"`);
    const place = { city: match.name, region: match.admin1 || match.country || '', latitude: match.latitude, longitude: match.longitude };
    weatherGeoCache.set(location, place);
    return place;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Open-Meteo local times look like "2026-10-04T14:00" and are already in the city's own timezone.
function weatherClock(iso) {
    const match = /T(\d{2}):(\d{2})/.exec(String(iso || ''));
    if (!match) return '';
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}
function weatherHourLabel(iso) { return weatherClock(iso).replace(':00', ''); }
function weatherDayLabel(iso) {
    const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? '' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
}

async function readWeather(location, units) {
    const place = await geocodeWeather(location);
    const imperial = units === 'imperial';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl'
        + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max&forecast_days=6&timezone=auto'
        + `&temperature_unit=${imperial ? 'fahrenheit' : 'celsius'}&wind_speed_unit=${imperial ? 'mph' : 'kmh'}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Forecast failed (${response.status})`);
    const data = await response.json();
    const now = data.current || {};
    const lookup = (code, night) => { const [label, dayIcon, nightIcon] = WEATHER_CODES[code] || ['Unknown', '🌡️', '🌡️']; return { condition: label, icon: night ? nightIcon : dayIcon }; };
    const round = value => (Number.isFinite(value) ? Math.round(value) : '');
    const current = lookup(now.weather_code, now.is_day === 0);

    // Hours after the current one, so "+1h" is always in the future.
    const hourly = [];
    const times = data.hourly?.time || [];
    const start = times.findIndex(time => time > String(now.time || '').slice(0, 13) + ':59');
    for (let i = Math.max(0, start), n = 0; i < times.length && n < 6; i++, n++) {
        hourly.push({ time: weatherHourLabel(times[i]), temp: round(data.hourly.temperature_2m?.[i]), precip: round(data.hourly.precipitation_probability?.[i]), ...lookup(data.hourly.weather_code?.[i], data.hourly.is_day?.[i] === 0) });
    }
    // d1 is tomorrow; today's values stay in the high/low fields.
    const daily = [];
    for (let i = 1; i < (data.daily?.time || []).length && i <= 5; i++) {
        daily.push({ day: weatherDayLabel(data.daily.time[i]), high: round(data.daily.temperature_2m_max?.[i]), low: round(data.daily.temperature_2m_min?.[i]), precip: round(data.daily.precipitation_probability_max?.[i]), ...lookup(data.daily.weather_code?.[i], false) });
    }
    return {
        ok: true, error: '', updatedAt: Date.now(),
        city: place.city, region: place.region, unit: imperial ? '°F' : '°C', wind_unit: imperial ? 'mph' : 'km/h', pressure_unit: imperial ? 'inHg' : 'hPa',
        temp: round(now.temperature_2m), feels_like: round(now.apparent_temperature),
        humidity: round(now.relative_humidity_2m),
        wind: round(now.wind_speed_10m), wind_dir: Number.isFinite(now.wind_direction_10m) ? COMPASS[Math.round(now.wind_direction_10m / 45) % 8] : '',
        gusts: round(now.wind_gusts_10m), cloud_cover: round(now.cloud_cover),
        pressure: Number.isFinite(now.pressure_msl) ? (imperial ? (now.pressure_msl * 0.02953).toFixed(2) : String(Math.round(now.pressure_msl))) : '',
        uv: round(data.daily?.uv_index_max?.[0]), sunrise: weatherClock(data.daily?.sunrise?.[0]), sunset: weatherClock(data.daily?.sunset?.[0]),
        condition: current.condition, icon: current.icon, is_day: now.is_day !== 0,
        high: round(data.daily?.temperature_2m_max?.[0]), low: round(data.daily?.temperature_2m_min?.[0]),
        precip_chance: round(data.daily?.precipitation_probability_max?.[0]),
        hourly, daily
    };
}

async function fetchWeather() {
    const cfg = normalizeWeatherConfig(config.weather);
    if (!cfg.enabled) { weatherState = { ok: false, error: '', extras: {} }; return; }
    const next = { ...weatherState, extras: {} };
    if (!cfg.location) next.error = 'Enter a location in the config editor.';
    else {
        try { Object.assign(next, await readWeather(cfg.location, cfg.units)); } catch (error) { next.ok = false; next.error = error.message; console.warn('[Weather]', error.message); }
    }
    for (const name of cfg.extra_locations) {
        try { next.extras[weatherSlug(name)] = await readWeather(name, cfg.units); }
        catch (error) { next.extras[weatherSlug(name)] = { ok: false, error: error.message, name }; console.warn('[Weather]', name, error.message); }
    }
    weatherState = next;
    broadcastToOverlays('weather', publicWeather());
}

function publicWeather() {
    const cfg = normalizeWeatherConfig(config.weather);
    return { enabled: cfg.enabled, units: cfg.units, location: cfg.location, ...weatherState };
}

function scheduleWeather() {
    clearInterval(weatherTimer);
    weatherTimer = null;
    const cfg = normalizeWeatherConfig(config.weather);
    if (!cfg.enabled) { weatherState = { ok: false, error: '', extras: {} }; return; }
    fetchWeather();
    weatherTimer = setInterval(fetchWeather, cfg.poll_minutes * 60000);
}

// ============================================================================
// MUSIC NOW-PLAYING
// ============================================================================

const MUSIC_ART_PATH = path.join(DATA_DIR, 'music-artwork.png');
const MUSIC_FALLBACK_ART_PATH = path.join(DATA_DIR, 'music-fallback.png');
let musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
let musicPolledAt = 0;
let musicPollTimer = null;
let overlayVisible = true;
// Overlays hidden through the API; the music overlay keeps its own flag (overlayVisible).
const hiddenOverlays = new Set();
const BUILTIN_OVERLAYS = [
    { key: 'credits', label: 'Credits' },
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
let viewerPollHandle = null;
let lastSSNViewerUpdateAt = 0;

// --- Apple Music (macOS only, via osascript) ---

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
        musicPolledAt = Date.now();
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

// --- VLC (cross-platform, via HTTP interface) ---

function pollVLC() {
    const vlcCfg = MUSIC_CONFIG.vlc || {};
    const host = vlcCfg.host || 'localhost';
    const port = vlcCfg.port || 8080;
    const password = vlcCfg.password || '';
    const auth = Buffer.from(`:${password}`).toString('base64');
    const url = `http://${host}:${port}/requests/status.json`;

    const req = http.request(url, {
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: 3000,
        insecureHTTPParser: true
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                processVLCStatus(data);
            } catch (e) {
                if (musicState.state !== 'stopped') {
                    musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
                    broadcastToOverlays('music', musicState);
                }
            }
        });
    });

    req.on('error', () => {
        if (musicState.state !== 'stopped') {
            musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
            broadcastToOverlays('music', musicState);
        }
    });

    req.on('timeout', () => req.destroy());
    req.end();
}

function processVLCStatus(data) {
    musicPolledAt = Date.now();
    // VLC states: playing, paused, stopped
    const vlcState = data.state || 'stopped';
    const state = vlcState === 'playing' ? 'playing' : vlcState === 'paused' ? 'paused' : 'stopped';

    if (state === 'stopped') {
        if (musicState.state !== 'stopped') {
            musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
            broadcastToOverlays('music', musicState);
        }
        return;
    }

    // Extract metadata from VLC's category→meta info
    const meta = (data.information && data.information.category && data.information.category.meta) || {};
    const newState = {
        state,
        track: meta.title || meta.filename || data.information?.category?.meta?.title || '',
        artist: meta.artist || '',
        album: meta.album || '',
        year: meta.date || '',
        duration: data.length || 0,
        position: Math.round((data.position || 0) * (data.length || 0)),
        artworkUrl: ''
    };

    // If track name is empty, try to derive from filename
    if (!newState.track && meta.filename) {
        newState.track = meta.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    }

    const trackChanged = newState.track !== musicState.track
        || newState.artist !== musicState.artist
        || newState.album !== musicState.album;
    const stateChanged = newState.state !== musicState.state;

    if (trackChanged) {
        // Try to fetch album art from VLC
        fetchVLCArtwork((artUrl) => {
            newState.artworkUrl = artUrl;
            musicState = newState;
            broadcastToOverlays('music', musicState);
            console.log(`[Music/VLC] Now playing: ${musicState.track} — ${musicState.artist}`);
        });
    } else if (stateChanged) {
        newState.artworkUrl = musicState.artworkUrl;
        musicState = newState;
        broadcastToOverlays('music', musicState);
        console.log(`[Music/VLC] State: ${musicState.state}`);
    } else {
        musicState.position = newState.position;
        musicState.duration = newState.duration;
    }
}

function fetchVLCArtwork(cb) {
    const vlcCfg = MUSIC_CONFIG.vlc || {};
    const host = vlcCfg.host || 'localhost';
    const port = vlcCfg.port || 8080;
    const password = vlcCfg.password || '';
    const auth = Buffer.from(`:${password}`).toString('base64');
    const url = `http://${host}:${port}/art`;

    const req = http.request(url, {
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: 3000,
        insecureHTTPParser: true
    }, (res) => {
        if (res.statusCode !== 200) {
            cb('');
            return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            try {
                const artBuffer = Buffer.concat(chunks);
                if (artBuffer.length > 0) {
                    fs.writeFileSync(MUSIC_ART_PATH, artBuffer);
                    cb('/api/music/artwork?t=' + Date.now());
                } else {
                    cb('');
                }
            } catch {
                cb('');
            }
        });
    });

    req.on('error', () => cb(''));
    req.on('timeout', () => { req.destroy(); cb(''); });
    req.end();
}

// --- Unified polling start/stop ---

function currentPollFn() {
    const source = MUSIC_CONFIG.source || 'apple_music';
    return source === 'vlc' ? pollVLC : pollAppleMusic;
}

function startMusicPolling() {
    if (musicPollTimer) return;
    const interval = (MUSIC_CONFIG.poll_seconds || 5) * 1000;
    const pollFn = currentPollFn();
    const source = MUSIC_CONFIG.source || 'apple_music';
    pollFn();
    musicPollTimer = setInterval(pollFn, interval);
    console.log(`[Music] Polling ${source === 'vlc' ? 'VLC' : 'Apple Music'} every ${MUSIC_CONFIG.poll_seconds || 5}s`);
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
    viewerStats: createEmptyViewerStats(),
    startedAt: new Date().toISOString(),
    lastUpdated: null,
    messageCount: 0
};

// Chat log — individual messages stored separately from aggregates
let chatLog = [];
let pendingChatLogEntries = [];
const MAX_IN_MEMORY_CHAT_MESSAGES = 2000;

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
    subTenure: {},      // { lowercased name: { months, seenAt } } highest subscription months observed from chat badges / resubs
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

let lastSavedStats = null;
function saveStats() {
    const data = JSON.stringify(statsData, null, 2);
    if (data === lastSavedStats) return;
    lastSavedStats = data;
    fs.writeFileSync(STATS_PATH, data);

    // Rotating backup (cycles through 1, 2, 3)
    const backupPath = path.join(DATA_DIR, `.stats-backup-${statsBackupRotation}.json`);
    fs.writeFileSync(backupPath, data);
    statsBackupRotation = (statsBackupRotation % 3) + 1;
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

function recordSubTenure(chatname, msg, nowISO) {
    const months = parseSubMonths(msg);
    if (!months || months > 600 || !chatname) return;
    if (!statsData.subTenure) statsData.subTenure = {};
    const key = chatname.toLowerCase();
    const existing = statsData.subTenure[key];
    if (!existing || months >= existing.months) statsData.subTenure[key] = { months, seenAt: nowISO };
}

function updateStats(chatname, msg) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowISO = now.toISOString();

    // Total messages per day
    if (!statsData.totalMessages) statsData.totalMessages = {};
    statsData.totalMessages[today] = (statsData.totalMessages[today] || 0) + 1;

    recordSubTenure(chatname, msg, nowISO);

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
            // Determine gifter using same logic as session tracking
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

    // Track bits/donations in stats — mirrors session tracking logic
    if (msg.event === 'cheer' || msg.hasDonation) {
        const bitsFromMeta = msg.meta && typeof msg.meta === 'object' ? msg.meta.bits : null;
        const bitsFromDonation = msg.hasDonation ? (msg.hasDonation.match(/(\d+)/) || [])[1] : null;
        const isBits = msg.event === 'cheer' || (msg.hasDonation && msg.hasDonation.toLowerCase().includes('bit'));

        if (isBits) {
            if (!statsData.bits[chatname]) {
                statsData.bits[chatname] = {
                    chatimg: msg.chatimg, firstSeen: nowISO, lastSeen: nowISO, days: {}
                };
            }
            const amount = bitsFromMeta || (bitsFromDonation ? parseInt(bitsFromDonation) : 0);
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

        // Track hashtags — strip reply quote prefix to avoid double-counting
        if (config.hashtags_enabled !== false) {
        const noReply = msg.chatmessage.replace(/<i><small>.*?<\/small><\/i>\s*/gi, '');
        const stripped = noReply.replace(/<[^>]+>/g, '');
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

let lastSavedChatData = null;
function saveChatData() {
    chatData.viewerStats = normalizeViewerStats(chatData.viewerStats);
    // Compare without the timestamp so idle periods don't rewrite the file every interval.
    const { lastUpdated, ...content } = chatData;
    const fingerprint = JSON.stringify(content);
    if (fingerprint === lastSavedChatData) return;
    lastSavedChatData = fingerprint;
    chatData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(LIVE_CHAT_PATH, JSON.stringify(chatData, null, 2));
}

function saveChatLog() {
    if (pendingChatLogEntries.length > 0) {
        const lines = pendingChatLogEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
        fs.appendFileSync(CHAT_LOG_PATH, lines);
        pendingChatLogEntries = [];
    }
}

function finalizeSessionStreamEnd() {
    const viewerStats = normalizeViewerStats(chatData.viewerStats);
    if (!viewerStats.streamStartedAt) {
        chatData.viewerStats = viewerStats;
        return null;
    }

    const startMs = Date.parse(viewerStats.streamStartedAt);
    if (!Number.isFinite(startMs)) {
        chatData.viewerStats = viewerStats;
        return null;
    }
    if (viewerStats.streamEndedAt) {
        const recordedEndMs = Date.parse(viewerStats.streamEndedAt);
        if (Number.isFinite(recordedEndMs) && recordedEndMs > startMs) {
            return viewerStats.streamEndedAt;
        }
        viewerStats.streamEndedAt = null;
    }

    const lastChatEntry = [...chatLog].reverse().find(entry => {
        const timestamp = Number(entry?.ts);
        return Number.isFinite(timestamp) && timestamp > startMs;
    });
    const lastChatAt = lastChatEntry ? new Date(Number(lastChatEntry.ts)).toISOString() : null;
    const candidateEnd = lastChatAt || new Date().toISOString();
    const candidateMs = Date.parse(candidateEnd);
    if (Number.isFinite(candidateMs) && candidateMs > startMs) {
        viewerStats.streamEndedAt = candidateEnd;
    }
    chatData.viewerStats = viewerStats;
    return viewerStats.streamEndedAt;
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
    return readChatLogFile(CHAT_LOG_PATH);
}

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

    if (MUSIC_CONFIG.enabled && !prevMusicEnabled) {
        startMusicPolling();
    } else if (!MUSIC_CONFIG.enabled && prevMusicEnabled) {
        stopMusicPolling();
        musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
        broadcastToOverlays('music', musicState);
    } else if (MUSIC_CONFIG.enabled && MUSIC_CONFIG.source !== prevSource) {
        stopMusicPolling();
        musicState = { track: '', artist: '', album: '', year: '', duration: 0, position: 0, state: 'stopped', artworkUrl: '' };
        broadcastToOverlays('music', musicState);
        startMusicPolling();
    }

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

function loadCurrentSessionStateFromDisk() {
    try {
        if (fs.existsSync(LIVE_CHAT_PATH)) {
            Object.assign(chatData, JSON.parse(fs.readFileSync(LIVE_CHAT_PATH, 'utf8')));
            chatData.viewerStats = normalizeViewerStats(chatData.viewerStats);
            console.log('[Restore] Reloaded current session data');
        }
    } catch (err) {
        console.warn('[Restore] Current session reload failed:', err.message);
    }

    try {
        chatLog = readChatLogTail(CHAT_LOG_PATH);
        pendingChatLogEntries = [];
        const count = countChatLogEntries(CHAT_LOG_PATH);
        console.log(`[Restore] Reloaded current chat log (${count} messages; retained ${chatLog.length} in memory)`);
    } catch (err) {
        console.warn('[Restore] Current chat log reload failed:', err.message);
    }
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
    if (overlayWss) {
        for (const client of overlayWss.clients) client.terminate();
        overlayWss.close();
    }
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

function buildDateRange(params) {
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

function collectHashtagStats(range = null) {
    const statsTags = Object.keys(statsData?.hashtags || {});
    const sessionTags = Object.keys(chatData?.hashtags || {});
    const allTags = new Set([...statsTags, ...sessionTags, ...bannedHashtags]);
    const hashtags = Array.from(allTags).map(tag => {
        const statsEntry = statsData?.hashtags?.[tag] || {};
        const sessionEntry = chatData?.hashtags?.[tag] || {};
        return {
            tag,
            count: sumDailyBuckets(statsEntry.days, range),
            sessionCount: sessionEntry.count || 0,
            uniqueDays: countRangeDays(statsEntry.days, range),
            firstUsed: statsEntry.firstUsed || null,
            lastUsed: statsEntry.lastUsed || null,
            banned: bannedHashtags.has(tag)
        };
    }).filter(item => item.count > 0 || item.sessionCount > 0 || item.banned)
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
    let user = String(input.user || '').trim().toLowerCase();
    const type = String(input.type || '').trim();

    if (!user) {
        const userMatches = [...queryText.matchAll(/(?:^|\s)(?:user|from):(\S+)/gi)];
        if (userMatches.length > 0) {
            user = (userMatches[userMatches.length - 1][1] || '').toLowerCase();
            queryText = queryText.replace(/(?:^|\s)(?:user|from):(\S+)/gi, ' ').replace(/\s+/g, ' ').trim();
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

function matchesChatSearchText(text, searchFilter) {
    if (!searchFilter || searchFilter.length === 0) return true;
    const lower = String(text || '').toLowerCase();
    return searchFilter.some(andTerms => andTerms.every(term => lower.includes(term)));
}

function matchesChatFilters(message, filters) {
    const user = (message.user || '').toLowerCase();
    if (filters.user && user !== filters.user) return false;
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

function localDateTimeStr(isoStr) {
    const d = new Date(isoStr || Date.now());
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}-${mi}`;
}

function getSessionStreamTimes(data, chatEntries = []) {
    const samples = Array.isArray(data?.viewerStats?.samples) ? data.viewerStats.samples : [];
    const liveSamples = samples.filter(sample => sample.live && sample.ts);
    const streamStartAt = data?.viewerStats?.streamStartedAt
        || liveSamples[0]?.ts
        || null;
    const startMs = streamStartAt ? Date.parse(streamStartAt) : NaN;
    let wasLive = false;
    const offlineTransitions = [];
    for (const sample of samples) {
        const sampleMs = sample.ts ? Date.parse(sample.ts) : NaN;
        if (sample.live && sample.ts && Number.isFinite(startMs) && sampleMs >= startMs) {
            wasLive = true;
        } else if (sample.live === false && sample.ts && wasLive) {
            if (Number.isFinite(startMs) && Number.isFinite(sampleMs) && sampleMs > startMs) {
                offlineTransitions.push(sample);
            }
            wasLive = false;
        }
    }
    const candidateStopAt = data?.viewerStats?.streamEndedAt
        || (offlineTransitions.length > 0
            ? offlineTransitions[offlineTransitions.length - 1].ts
            : null);
    let stopMs = candidateStopAt ? Date.parse(candidateStopAt) : NaN;
    let streamStopAt = streamStartAt
        && Number.isFinite(startMs)
        && Number.isFinite(stopMs)
        && stopMs > startMs
        ? candidateStopAt
        : null;
    if (!streamStopAt && Number.isFinite(startMs)) {
        const lastChatEntry = [...chatEntries].reverse().find(entry => {
            const timestamp = Number(entry?.ts);
            return Number.isFinite(timestamp) && timestamp > startMs;
        });
        if (lastChatEntry) {
            const lastChatAt = new Date(Number(lastChatEntry.ts)).toISOString();
            stopMs = Date.parse(lastChatAt);
            if (Number.isFinite(stopMs) && stopMs > startMs) {
                streamStopAt = lastChatAt;
            }
        }
    }
    return { streamStartAt, streamStopAt };
}

function getSessionCategorySegments(data, streamStartAt, streamStopAt, isCurrent = false) {
    const entries = Array.isArray(data?.streamInfo)
        ? data.streamInfo
            .filter(entry => entry && entry.changedAt)
            .map(entry => ({
                title: entry.title || '',
                category: entry.category || '(No Category)',
                changedAt: entry.changedAt
            }))
            .sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt))
        : [];
    if (entries.length === 0) return [];

    const startMs = streamStartAt ? Date.parse(streamStartAt) : NaN;
    const endMs = streamStopAt
        ? Date.parse(streamStopAt)
        : (isCurrent ? Date.now() : NaN);
    return entries.map((entry, index) => {
        const rawStartMs = Date.parse(entry.changedAt);
        const segmentStartMs = Number.isFinite(startMs) ? Math.max(rawStartMs, startMs) : rawStartMs;
        const nextMs = index + 1 < entries.length ? Date.parse(entries[index + 1].changedAt) : endMs;
        const segmentEndMs = Number.isFinite(nextMs) ? Math.max(segmentStartMs, nextMs) : null;
        return {
            title: entry.title,
            category: entry.category,
            startAt: new Date(segmentStartMs).toISOString(),
            endAt: segmentEndMs ? new Date(segmentEndMs).toISOString() : null,
            durationMinutes: segmentEndMs ? Math.round((segmentEndMs - segmentStartMs) / 60000) : null
        };
    }).filter(entry => Number.isFinite(Date.parse(entry.startAt)));
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
                            noteArchivedSession(archiveName);
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

                noteArchivedSession(archiveName);
                return archiveName;
            }
        }
    } catch (err) {
        console.warn('[Session] Could not archive:', err.message);
    }
    return null;
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

const alertEngine = createAlertEngine({
    dataDir: DATA_DIR,
    broadcast: (type, payload) => broadcastToOverlays(type, payload),
    runTimerAction: (timerId, action, params) => applyTimerControl(getTimerOrThrow(timerId), action, params),
    log: message => console.log(message)
});

function alertTierLabel(msg) {
    const text = `${msg.membership || ''} ${msg.subtitle || ''} ${msg.chatmessage || ''}`;
    const metaTier = msg.meta && typeof msg.meta === 'object' ? String(msg.meta.sub_tier || msg.meta.tier || '') : '';
    if (/prime/i.test(text) || /prime/i.test(metaTier)) return { tier: 'prime', label: 'Prime' };
    const n = (text.match(/tier\s*(\d)/i) || [])[1] || (metaTier.match(/^(\d)000$/) || [])[1];
    return n ? { tier: `${n}000`, label: `Tier ${n}` } : { tier: '', label: '' };
}

function processChatMessage(msg) {
    if (msg.bot === true) return;
    const chatname = msg.chatname;
    if (!chatname) return;

    // Normalize SSN field names (eventType → event)
    if (msg.eventType && !msg.event) msg.event = msg.eventType;
    const shouldUpdateGoals = msg.event === 'follow' || msg.event === 'new_follower'
        || msg.event === 'new_subscriber' || msg.event === 'resub'
        || msg.event === 'subscription_gift' || msg.event === 'sponsorship'
        || msg.event === 'giftpurchase' || msg.event === 'giftredemption'
        || msg.event === 'cheer' || !!msg.hasDonation;

    // Banned users are completely excluded from everything
    if (BANNED_USERS.includes(chatname.toLowerCase())) return;

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
        chatLog.push(chatEntry);
        if (chatLog.length > MAX_IN_MEMORY_CHAT_MESSAGES) {
            chatLog.splice(0, chatLog.length - MAX_IN_MEMORY_CHAT_MESSAGES);
        }
        pendingChatLogEntries.push(chatEntry);

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
    if (EXCLUDE_USERS.includes(chatname.toLowerCase())) return;

    chatData.messageCount++;

    // Track hourly message volume
    const hour = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    chatData.hourlyMessages[hour] = (chatData.hourlyMessages[hour] || 0) + 1;
    if (CLIP_CANDIDATE_CONFIG.enabled) {
        recentChatTimestamps.push(Date.now());
        recentChatTimestamps = recentChatTimestamps.filter(ts =>
            Date.now() - ts <= CLIP_CANDIDATE_CONFIG.chat_spike_window_seconds * 1000
        );
        if (recentChatTimestamps.length >= CLIP_CANDIDATE_CONFIG.chat_spike_messages) {
            addClipCandidate('chat-spike', {
                messagesLastMinute: recentChatTimestamps.length
            }, Date.now(), Math.min(0.95, 0.5 + recentChatTimestamps.length / 100));
        }
    } else {
        recentChatTimestamps = [];
    }

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
            alertEngine.handleEvent({ type: 'follow', user: chatname, avatar: msg.chatimg });
        }
    }

    // Log any event or membership data from SSN for debugging
    // Badge-only chat (membership/subtitle on a regular message) is skipped: it is high volume and tenure is tracked in stats
    if (msg.event || msg.hasDonation || msg.title || msg.contentimg) {
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
            const debugLogPath = path.join(DATA_DIR, 'ssn-debug.log');
            try {
                if (fs.statSync(debugLogPath).size > 1024 * 1024) fs.renameSync(debugLogPath, `${debugLogPath}.old`);
            } catch { /* log not created yet */ }
            fs.appendFileSync(debugLogPath, JSON.stringify(debugEntry) + '\n');
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
        const isGift = msg.event === 'subscription_gift' || msg.event === 'giftpurchase' ||
            (msg.membership && msg.membership.toLowerCase().includes('gift')) || msg.contentimg;
        if (isGift) {
            // SSN subscription_gift observed behavior:
            //   When chatname = "Viewer" (placeholder): the named person in chatmessage is the GIFTER
            //     e.g. chatname="Viewer", chatmessage="Viewer gifted a sub to SirChadlyOC!"
            //     Real event: SirChadlyOC gifted to Go_Hobo_Go — SSN doesn't include recipient
            //   When chatname = real username: standard format, chatname = gifter, "to X" = recipient
            // SSN giftredemption: chatname = recipient, subtitle may contain "Gifted by ..."
            console.log(`[SSN] Gift event raw: chatname=${chatname}, event=${msg.event}, membership=${msg.membership || ''}, subtitle=${msg.subtitle || ''}, chatmessage=${(msg.chatmessage || '').substring(0, 120)}, meta=${JSON.stringify(msg.meta || {})}`);

            const nameAfterTo = (msg.chatmessage || '').match(/gifted\s+(?:a\s+)?(?:Tier \d\s+)?Sub(?:scription)?\s+to\s+(\S+)/i);
            const parsedName = nameAfterTo ? nameAfterTo[1].replace(/[.!,]$/, '') : null;
            const giftedByMatch = (msg.subtitle || '').match(/gifted\s+by\s+(\S+)/i);

            let gifter, recipient;
            if (msg.event === 'giftredemption' || (msg.membership && msg.membership.toLowerCase() === 'gift_recipient')) {
                // giftredemption: chatname = the recipient; gifter is in subtitle
                recipient = chatname;
                gifter = giftedByMatch ? giftedByMatch[1] : 'Anonymous';
            } else if (chatname === 'Viewer' || chatname === 'AnAnonymousGifter') {
                // SSN placeholder — the real gifter name is after "to" in chatmessage
                gifter = parsedName || 'Anonymous';
                recipient = null;
            } else {
                // chatname is a real username = the gifter; name after "to" = the recipient
                gifter = chatname;
                recipient = parsedName || null;
            }

            // Resolve gifter's avatar (skip if chatname was a placeholder)
            const gifterAvatar = (chatname === gifter && msg.chatimg) ? msg.chatimg
                : (chatData.chatters[gifter] ? chatData.chatters[gifter].chatimg : null);

            const giftTier = alertTierLabel(msg);
            alertEngine.noteGift({ user: gifter, avatar: gifterAvatar, recipient, tier: giftTier.tier, tierLabel: giftTier.label });

            const existingGift = chatData.giftSubs.find(g => g.gifter === gifter);
            if (existingGift) {
                existingGift.count = Math.max(1, Number(existingGift.count) || 1) + 1;
                if (recipient) existingGift.recipient = recipient;
                if (gifterAvatar) existingGift.chatimg = gifterAvatar;
            } else {
                chatData.giftSubs.push({ chatname: gifter, gifter, recipient, chatimg: gifterAvatar, event: msg.event || null, count: 1, timestamp: Date.now() });
                console.log(`[SSN] Gift Sub: ${gifter}${recipient ? ' → ' + recipient : ''} (event=${msg.event})`);
            }
            if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_gift_subs) {
                addClipCandidate('gift-sub', { user: gifter, recipient }, Date.now(), 0.65);
            }
        } else {
            const subMonths = parseSubMonths(msg);
            const subTier = alertTierLabel(msg);
            const streakMatch = String(msg.chatmessage || '').match(/(\d+)\s*-?\s*month\s+streak/i);
            alertEngine.handleEvent({
                type: msg.event === 'resub' || subMonths > 1 ? 'resub' : 'sub',
                user: chatname, avatar: msg.chatimg, months: subMonths || '',
                streak: streakMatch ? parseInt(streakMatch[1], 10) : '',
                tier: subTier.tier, tierLabel: subTier.label,
                message: String(msg.chatmessage || '').replace(/<[^>]+>/g, '').split(' - ')[0].trim()
            });
            const alreadySubbed = chatData.subscribers.some(s => s.chatname === chatname);
            if (!alreadySubbed) {
                chatData.subscribers.push({ chatname, membership: msg.membership || null, subtitle: msg.subtitle || null, chatimg: msg.chatimg, event: msg.event || null, timestamp: Date.now() });
                console.log(`[SSN] Sub: ${chatname} - ${msg.membership || msg.event}${msg.subtitle ? ' (' + msg.subtitle + ')' : ''}`);
                if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_subscriptions) {
                    addClipCandidate('subscription', { user: chatname, tier: msg.membership || msg.event }, Date.now(), 0.6);
                }
            }
        }
    }

    // Track bits/donations — SSN EventSub sends event='cheer' with meta.bits;
    // DOM capture sets hasDonation="N bits" without an event
    if (msg.event === 'cheer' || msg.hasDonation) {
        const bitsFromMeta = msg.meta && typeof msg.meta === 'object' ? msg.meta.bits : null;
        const bitsFromDonation = msg.hasDonation ? (msg.hasDonation.match(/(\d+)/) || [])[1] : null;
        const isBits = msg.event === 'cheer' || (msg.hasDonation && msg.hasDonation.toLowerCase().includes('bit'));

        if (isBits) {
            const amount = bitsFromMeta || (bitsFromDonation ? parseInt(bitsFromDonation) : 0);
            const label = msg.hasDonation || `${amount} bits`;
            const donation = { chatname, amount: label, bits: amount, chatimg: msg.chatimg, timestamp: Date.now() };
            chatData.bits.push(donation);
            console.log(`[SSN] Bits: ${chatname} - ${label} (${amount} bits)`);
            alertEngine.handleEvent({ type: 'bits', user: chatname, avatar: msg.chatimg, amount: Number(amount) || 0, message: String(msg.chatmessage || '').replace(/<[^>]+>/g, '').trim() });
            if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_bits && amount >= CLIP_CANDIDATE_CONFIG.minimum_bits) {
                addClipCandidate('bits', { user: chatname, amount, label }, Date.now(), Math.min(0.95, 0.55 + amount / 1000));
            }
        } else if (msg.hasDonation) {
            const donation = { chatname, amount: msg.hasDonation, amountValue: parseNumericAmount(msg.hasDonation), chatimg: msg.chatimg, timestamp: Date.now() };
            chatData.donations.push(donation);
            console.log(`[SSN] Donation: ${chatname} - ${msg.hasDonation}`);
            alertEngine.handleEvent({ type: 'donation', user: chatname, avatar: msg.chatimg, amount: parseNumericAmount(msg.hasDonation) || 0, message: String(msg.chatmessage || '').replace(/<[^>]+>/g, '').trim() });
            const donationValue = parseNumericAmount(msg.hasDonation);
            if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_donations && donationValue >= CLIP_CANDIDATE_CONFIG.minimum_donation) {
                addClipCandidate('donation', { user: chatname, amount: msg.hasDonation }, Date.now(), 0.7);
            }
        }
    }

    // Track raids
    if (msg.event === 'raid') {
        const alreadyRaided = chatData.raids.some(r => r.chatname === chatname);
        if (!alreadyRaided) {
            const viewers = msg.chatmessage ? (msg.chatmessage.match(/(\d+)/) || [])[1] : null;
            chatData.raids.push({ chatname, chatimg: msg.chatimg, viewers: viewers ? parseInt(viewers) : null, timestamp: Date.now() });
            console.log(`[SSN] Raid: ${chatname}${viewers ? ` with ${viewers} viewers` : ''}`);
            const raidViewers = viewers ? parseInt(viewers) : 0;
            alertEngine.handleEvent({ type: 'raid', user: chatname, avatar: msg.chatimg, amount: raidViewers, viewers: raidViewers });
            if (CLIP_CANDIDATE_CONFIG.enabled && CLIP_CANDIDATE_CONFIG.include_raids && raidViewers >= CLIP_CANDIDATE_CONFIG.minimum_raid_viewers) {
                addClipCandidate('raid', { user: chatname, viewers: raidViewers || null }, Date.now(), 0.8);
            }
        }
    }

    if (msg.event === 'reward') {
        const rewardMatch = String(msg.chatmessage || '').replace(/<[^>]+>/g, '').match(/redeemed\s+(.+?)\s*(?:\((\d[\d,]*)\s*points?\))?\s*$/i);
        alertEngine.handleEvent({
            type: 'redeem', user: chatname, avatar: msg.chatimg,
            reward: rewardMatch ? rewardMatch[1].trim() : '',
            amount: rewardMatch && rewardMatch[2] ? parseInt(rewardMatch[2].replace(/,/g, ''), 10) : 0
        });
    } else if (!msg.event && msg.chatmessage) {
        alertEngine.handleEvent({ type: 'chat_word', user: chatname, avatar: msg.chatimg, message: String(msg.chatmessage).replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '').trim() });
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

        // Track session hashtags — strip reply quote prefix to avoid double-counting
        const noReply2 = msg.chatmessage.replace(/<i><small>.*?<\/small><\/i>\s*/gi, '');
        const stripped = noReply2.replace(/<[^>]+>/g, '');
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
    if (shouldUpdateGoals) {
        broadcastToOverlays('goals-update', buildGoalsSnapshot());
    }
}

let ssnAttempts = 0;

function connectSSN() {
    if (!SSN_SESSION_ID) {
        console.warn('[SSN] No session_id in config.json — chat collection disabled');
        return;
    }

    clearTimeout(ssnReconnectTimer);
    console.log(`[SSN] Connecting to ${SSN_SERVER}...`);
    let socket;
    try {
        socket = new WebSocket(SSN_SERVER, { handshakeTimeout: 15000 });
    } catch (err) {
        console.error(`[SSN] Could not start connection: ${err.message}`);
        scheduleSSNReconnect();
        return;
    }
    ssnSocket = socket;

    // A sleeping Mac or dropped network can leave the socket half-open with no close event,
    // so ping regularly and drop the connection if nothing at all comes back.
    let lastHeard = Date.now();
    let watchdog = null;
    let closed = false;
    const heard = () => { lastHeard = Date.now(); };

    socket.on('open', () => {
        ssnAttempts = 0;
        heard();
        console.log(`[SSN] Connected! Joining session: ${SSN_SESSION_ID}`);
        socket.send(JSON.stringify({ join: SSN_SESSION_ID, in: 4, out: 3 }));
        console.log('[SSN] Listening for chat messages...');
        watchdog = setInterval(() => {
            if (Date.now() - lastHeard > 60000) {
                console.warn('[SSN] No response for 60s — reconnecting');
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
        } catch { /* ignore parse errors */ }
    });

    socket.on('error', (err) => {
        console.error(`[SSN] Error: ${err.message}`);
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

// Backs off from 3s up to 30s, and never gives up.
function scheduleSSNReconnect() {
    ssnAttempts++;
    const delay = Math.min(30000, 3000 * Math.pow(2, Math.min(ssnAttempts - 1, 4)));
    console.log(`[SSN] Disconnected. Reconnecting in ${Math.round(delay / 1000)}s...`);
    clearTimeout(ssnReconnectTimer);
    ssnReconnectTimer = setTimeout(connectSSN, delay);
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

// Minutes spent in each category by one session's stream-info history, plus the local dates it was streamed on.
function categoryTimeFor(streamInfo, endMs, startFloorMs = null) {
    const result = {};
    (streamInfo || []).forEach((entry, i) => {
        let start = Date.parse(entry.changedAt);
        let end = i + 1 < streamInfo.length ? Date.parse(streamInfo[i + 1].changedAt) : endMs;
        const closedAt = Date.parse(entry.endedAt || '');
        if (Number.isFinite(closedAt) && closedAt < end) end = closedAt;
        if (Number.isFinite(startFloorMs) && start < startFloorMs) start = startFloorMs;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
        const name = entry.category || '(No Category)';
        const slot = result[name] || (result[name] = { minutes: 0, dates: new Set() });
        slot.minutes += (end - start) / 60000;
        slot.dates.add(localDateString(new Date(start)));
    });
    return result;
}

function localDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function categoryMinutesFor(streamInfo, endMs, startFloorMs = null) {
    return Object.fromEntries(Object.entries(categoryTimeFor(streamInfo, endMs, startFloorMs)).map(([name, slot]) => [name, slot.minutes]));
}

function archivedCategoryMinutes() {
    const totals = {};
    if (!fs.existsSync(SESSIONS_DIR)) return totals;
    for (const file of fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith('chat-') && f.endsWith('.json'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
            const endMs = Date.parse(data.lastUpdated || data.startedAt);
            const floor = Date.parse(data.viewerStats?.streamStartedAt || '');
            for (const [name, minutes] of Object.entries(categoryMinutesFor(data.streamInfo, endMs, floor))) totals[name] = (totals[name] || 0) + minutes;
        } catch {}
    }
    return totals;
}

function currentCategoryStats(archivedTotals) {
    const info = chatData.streamInfo || [];
    const name = info.length ? (info[info.length - 1].category || '(No Category)') : '';
    if (!name) return { name: '', sessionMinutes: 0, totalMinutes: 0 };
    const floor = Date.parse(normalizeViewerStats(chatData.viewerStats).streamStartedAt || '');
    const sessionMinutes = categoryMinutesFor(info, Date.now(), floor)[name] || 0;
    return { name, sessionMinutes: Math.round(sessionMinutes), totalMinutes: Math.round((archivedTotals[name] || 0) + sessionMinutes) };
}
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Rate limiting
    if (checkRateLimit(req, res)) return;

    // Auth endpoints
    if (pathname === '/api/twitch/auth/status' && req.method === 'GET') {
        await ensureToken();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: !!twitchAccessToken,
            mode: TWITCH_CLIENT_SECRET ? 'own_app' : 'shared_device',
            clientId: TWITCH_CLIENT_ID,
            broadcasterConfigured: !!BROADCASTER_ID,
            broadcasterSaved: broadcasterSyncedFromToken,
            scopes: twitchTokenScopes
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
            res.end(JSON.stringify({ status: d.status, error: d.error || '', interval: d.interval, broadcasterSaved: broadcasterSyncedFromToken }));
        } catch (err) {
            res.end(JSON.stringify({ status: 'pending', error: err.message }));
        }
        return;
    }

    if (pathname === '/api/twitch/auth/disconnect' && req.method === 'POST') {
        twitchAccessToken = null; twitchRefreshToken = null; twitchTokenExpiry = 0; twitchTokenScopes = [];
        try { fs.unlinkSync(TOKEN_PATH); } catch { /* none stored */ }
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
                const returnTo = safeReturnPath(url.searchParams.get('state'));
                res.writeHead(302, { Location: returnTo === '/' ? '/clips.html?reauthorized=1' : returnTo });
                res.end();
                fetchTwitchData();
                fetchStreamInfo();
                fetchViewerCount();
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
                    const safeFields = ['days_filter', 'active_subs_only', 'exclude_users', 'banned_users', 'hashtags_enabled', 'chat_log_enabled', 'credits', 'auto_backup_on_session_end', 'rate_limit', 'theme', 'music', 'viewer_tracking', 'weather', 'goals'];
                    for (const key of safeFields) {
                        if (updates[key] !== undefined) {
                            current[key] = updates[key];
                        }
                    }

                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
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

    if (pathname === '/api/fetch') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'fetching' }));
        fetchTwitchData();
        fetchStreamInfo();
        fetchViewerCount();
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
                hasToken: !!twitchAccessToken,
                scopes: twitchTokenScopes,
                refreshMinutes: REFRESH_MINUTES
            },
            viewers: viewerSummary,
            music: {
                enabled: !!MUSIC_CONFIG.enabled,
                source: MUSIC_CONFIG.source || 'apple_music',
                state: musicState.state,
                track: musicState.track,
                artist: musicState.artist,
                album: musicState.album,
                artworkUrl: musicState.artworkUrl || '',
                position: musicState.position || 0,
                duration: musicState.duration || 0,
                positionAgeMs: musicPolledAt ? Date.now() - musicPolledAt : 0
            },
            stream: {
                title: chatData.streamInfo?.[chatData.streamInfo.length - 1]?.title || '',
                category: currentCategoryStats(categoryTotals),
                game: publicGameInfo(chatData.streamInfo?.[chatData.streamInfo.length - 1]?.category)
            },
            goals: goalsSnapshot.summary,
            goalMetrics: goalsSnapshot.metrics,
            timers: {
                total: Object.keys(timerStore.timers).length,
                countdowns: Object.values(timerStore.timers).filter(t => t.kind === 'countdown').length,
                stopwatches: Object.values(timerStore.timers).filter(t => t.kind === 'stopwatch').length,
                running: Object.values(timerStore.timers).filter(t => t.state === 'running').length
            },
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
            recentEvents: buildRecentEvents(12)
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

    if (pathname === '/api/goals' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildGoalsSnapshot()));
        return;
    }

    if (pathname === '/api/goals/config') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                viewer_tracking: normalizeViewerTrackingConfig(config.viewer_tracking),
                goals: normalizeGoalsConfig(config.goals || DEFAULT_GOALS_CONFIG)
            }));
            return;
        }

        if (req.method === 'PUT') {
            try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                if (payload.viewer_tracking !== undefined) current.viewer_tracking = normalizeViewerTrackingConfig(payload.viewer_tracking);
                if (payload.goals !== undefined) current.goals = normalizeGoalsConfig(payload.goals);
                fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
                applyRuntimeConfig(current);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'saved',
                    viewer_tracking: normalizeViewerTrackingConfig(current.viewer_tracking),
                    goals: normalizeGoalsConfig(current.goals || DEFAULT_GOALS_CONFIG)
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }
    }

    if (pathname.startsWith('/api/goals/') && req.method === 'POST') {
        const goalPath = pathname.slice('/api/goals/'.length);
        const [goalIdRaw, actionRaw] = goalPath.split('/').filter(Boolean).map(decodeURIComponent);
        const goalId = sanitizeGoalId(goalIdRaw);
        const action = String(actionRaw || '').toLowerCase();
        if (!goalId || !action) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Goal action not found' }));
            return;
        }

        try {
            if (action === 'reset') {
                const snapshot = resetGoalBaseline(goalId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, goals: snapshot }));
                return;
            }

            if (action === 'toggle' || action === 'enable' || action === 'disable') {
                const snapshot = toggleGoalEnabled(goalId, action === 'enable' ? 'on' : action === 'disable' ? 'off' : 'toggle');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, goals: snapshot }));
                return;
            }

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Unsupported goal action: ${action}` }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

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
                fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
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

    // Music now-playing API
    if (pathname === '/api/music/now-playing') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(musicState));
        return;
    }

    // Individual music field endpoints — plain text for easy integration
    if (pathname.startsWith('/api/music/field/')) {
        const field = pathname.split('/api/music/field/')[1];
        const fields = {
            state: musicState.state,
            track: musicState.track,
            artist: musicState.artist,
            album: musicState.album,
            year: musicState.year,
            duration: String(musicState.duration),
            position: String(musicState.position),
            artwork: musicState.artworkUrl
        };
        if (field in fields) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(fields[field]);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Unknown field: ${field}. Available: ${Object.keys(fields).join(', ')}`);
        }
        return;
    }

    // Overlay visibility control: POST /api/music/overlay { action: "on"|"off"|"toggle" }
    if (pathname === '/api/music/overlay' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let action = 'toggle';
            try { action = JSON.parse(body).action || 'toggle'; } catch {}
            // Also accept ?action= query param
            const qAction = new URL(req.url, `http://${req.headers.host}`).searchParams.get('action');
            if (qAction) action = qAction;

            setOverlayVisibility('music', action);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ visible: overlayVisible }));
        });
        return;
    }

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

    // GET to check overlay visibility state
    if (pathname === '/api/music/overlay' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ visible: overlayVisible }));
        return;
    }

    if (pathname === '/api/music/vlc-test') {
        const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const host = params.get('host') || 'localhost';
        const port = parseInt(params.get('port')) || 8080;
        const password = params.get('password') || '';
        const auth = Buffer.from(`:${password}`).toString('base64');
        const testUrl = `http://${host}:${port}/requests/status.json`;

        const testReq = http.request(testUrl, {
            headers: { 'Authorization': `Basic ${auth}` },
            timeout: 3000,
            insecureHTTPParser: true
        }, (testRes) => {
            let body = '';
            testRes.on('data', chunk => body += chunk);
            testRes.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const meta = data.information?.category?.meta || {};
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, state: data.state, track: meta.title || '', artist: meta.artist || '' }));
                } catch {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Invalid response from VLC' }));
                }
            });
        });

        testReq.on('error', (err) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.code === 'ECONNREFUSED' ? 'Connection refused — is VLC running with HTTP interface enabled?' : err.message }));
        });

        testReq.on('timeout', () => {
            testReq.destroy();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Connection timed out' }));
        });

        testReq.end();
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

    if (pathname === '/api/timers' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildTimersSnapshot()));
        return;
    }

    if (pathname === '/api/timers' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const payload = JSON.parse(body || '{}');
            const timer = upsertTimer(payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, timer: buildTimerSnapshot(timer) }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/timers/settings' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(timerStore.settings));
        return;
    }

    if (pathname === '/api/timers/settings' && req.method === 'PUT') {
        try {
            const body = await readRequestBody(req);
            const payload = JSON.parse(body || '{}');
            timerStore.settings = normalizeTimerSettings(payload);
            saveTimers();
            broadcastToOverlays('timer-settings', timerStore.settings);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, settings: timerStore.settings }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname.startsWith('/api/timers/')) {
        const timerPath = pathname.slice('/api/timers/'.length);
        const segments = timerPath.split('/').filter(Boolean).map(decodeURIComponent);
        const timerId = sanitizeTimerId(segments[0]);

        if (!timerId) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Timer not found' }));
            return;
        }

        try {
            if (segments.length === 1 && req.method === 'GET') {
                const timer = getTimerOrThrow(timerId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(buildTimerSnapshot(timer)));
                return;
            }

            if (segments.length === 1 && req.method === 'PUT') {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                payload.id = timerId;
                const timer = upsertTimer(payload);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, timer: buildTimerSnapshot(timer) }));
                return;
            }

            if (segments.length === 1 && req.method === 'DELETE') {
                getTimerOrThrow(timerId);
                delete timerStore.timers[timerId];
                saveTimers();
                broadcastToOverlays('timer-delete', { id: timerId });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, deleted: timerId }));
                return;
            }

            if (segments[1] === 'control' && (req.method === 'POST' || req.method === 'GET')) {
                const body = req.method === 'POST' ? await readRequestBody(req) : '';
                let payload = {};
                if (body) payload = JSON.parse(body);
                const urlObj = new URL(req.url, `http://${req.headers.host}`);
                const action = String(payload.action || urlObj.searchParams.get('action') || '').trim().toLowerCase();
                const timer = getTimerOrThrow(timerId);
                const snapshot = applyTimerControl(timer, action, {
                    ...payload,
                    durationMs: payload.durationMs ?? urlObj.searchParams.get('durationMs'),
                    days: payload.days ?? urlObj.searchParams.get('days'),
                    hours: payload.hours ?? urlObj.searchParams.get('hours'),
                    minutes: payload.minutes ?? urlObj.searchParams.get('minutes'),
                    seconds: payload.seconds ?? urlObj.searchParams.get('seconds'),
                    mode: payload.mode ?? urlObj.searchParams.get('mode'),
                    value: payload.value ?? urlObj.searchParams.get('value')
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, timer: snapshot }));
                return;
            }

            if (segments[1] === 'field' && segments[2] && req.method === 'GET') {
                const timer = getTimerOrThrow(timerId);
                const snapshot = buildTimerSnapshot(timer);
                const field = segments[2];
                const valueMap = {
                    id: snapshot.id,
                    label: snapshot.label,
                    kind: snapshot.kind,
                    state: snapshot.state,
                    visible: String(snapshot.visible),
                    remaining_ms: snapshot.kind === 'countdown' ? String(snapshot.remainingMs) : '',
                    remaining: snapshot.kind === 'countdown' ? snapshot.formattedRemaining : '',
                    elapsed_ms: snapshot.kind === 'stopwatch' ? String(snapshot.elapsedMs) : '',
                    elapsed: snapshot.kind === 'stopwatch' ? snapshot.formattedElapsed : '',
                    progress: snapshot.kind === 'countdown' ? String(Math.round(snapshot.percentComplete * 100)) : '',
                    title: snapshot.displayTitle || snapshot.label
                };
                if (!(field in valueMap)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end(`Unknown field: ${field}`);
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(valueMap[field]);
                return;
            }
        } catch (err) {
            const statusCode = err.message === 'Timer not found' ? 404 : 400;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }

    if (pathname === '/api/weather') {
        if (url.searchParams.get('refresh') === '1' && normalizeWeatherConfig(config.weather).enabled) await fetchWeather();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(publicWeather()));
        return;
    }

    if (pathname === '/api/weather/icon.svg') {
        const icon = String(url.searchParams.get('e') || '🌡️').replace(/[<>&"']/g, '').slice(0, 8);
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" font-size="80" text-anchor="middle" dominant-baseline="central">${icon}</text></svg>`);
        return;
    }

    if (pathname === '/api/game-plan/backfill' && req.method === 'POST') {
        try {
            const result = await backfillPlayedGames();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/game-plan') {
        if (req.method === 'PUT') {
            try {
                const payload = JSON.parse(await readRequestBody(req) || '{}');
                fs.writeFileSync(GAME_PLAN_PATH, JSON.stringify(normalizeGamePlan(payload), null, 2));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildGamePlanSnapshot()));
        return;
    }

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

    if (pathname === '/api/game-search') {
        const query = (new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0, 100);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (query.length < 2 || !TWITCH_CLIENT_ID) { res.end(JSON.stringify({ results: [] })); return; }
        try {
            const token = await getAppToken();
            const body = `search "${query.replace(/["\\]/g, '')}"; fields name,first_release_date,cover.image_id,platforms.abbreviation,category,version_parent; limit 12;`;
            const igdb = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` }, body });
            const data = await igdb.json();
            const results = (Array.isArray(data) ? data : []).filter(game => !game.version_parent).map(game => ({
                id: String(game.id),
                name: game.name || '',
                year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : '',
                platforms: (game.platforms || []).map(platform => platform.abbreviation).filter(Boolean).slice(0, 4),
                cover: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_small/${game.cover.image_id}.jpg` : ''
            }));
            res.end(JSON.stringify({ results }));
        } catch (err) {
            res.end(JSON.stringify({ results: [], error: err.message }));
        }
        return;
    }

    if (pathname === '/api/game') {
        const name = new URL(req.url, 'http://localhost').searchParams.get('name')
            || chatData.streamInfo?.[chatData.streamInfo.length - 1]?.category || '';
        await refreshGameInfo(name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(publicGameInfo(name)));
        return;
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
                    file: '__current__',
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
                                file,
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
                        file: sess.file,
                        changedAt: entry.changedAt,
                        title: entry.title,
                        minutes: Math.round(minutes)
                    });
                }
            }

            // Sort by total time descending
            const sorted = Object.entries(categories)
                .map(([name, data]) => ({ name, totalMinutes: Math.round(data.totalMinutes), sessions: data.sessions }))
                .sort((a, b) => b.totalMinutes - a.totalMinutes);

            // Cover art and details come from the cached IGDB lookup; unseen names are queued in the background.
            const real = sorted.filter(c => c.name !== '(No Category)');
            warmGameInfo(real.map(c => ({ name: c.name, igdbId: '' })));
            let pending = 0;
            for (const c of real) {
                const g = publicGameInfo(c.name);
                c.cover = g.cover || '';
                c.genres = (g.genres || []).slice(0, 3);
                c.releaseYear = g.releaseYear || '';
                c.releaseDate = g.releaseDate || '';
                c.igdbUrl = g.igdbUrl || '';
                c.developers = (g.developers || []).slice(0, 2);
                if (!g.cover && !gameInfoCache[infoKey(c.name)]) pending++;
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'X-Covers-Pending': String(pending) });
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

    // Static file serving
    // A bare / opens the dashboard; / with overlay parameters still serves credits so older OBS sources keep working.
    let filePath = pathname === '/' ? (new URL(req.url, 'http://localhost').search ? '/credits.html' : '/dashboard.html') : pathname;
    let localMedia = false;
    if (pathname === '/local-file') {
        const requested = String(new URL(req.url, 'http://localhost').searchParams.get('path') || '');
        const ext = path.extname(requested).toLowerCase();
        const kind = ASSET_KIND_BY_EXT[ext];
        const referenced = () => JSON.stringify(Object.values(customOverlays)).includes(`/local-file?path=${encodeURIComponent(requested)}`);
        if (!path.isAbsolute(requested) || !['image', 'video'].includes(kind) || ext === '.oga') { res.writeHead(400); res.end('Only local image and video files can be used'); return; }
        // Remote viewers may only load files that a saved overlay already points at.
        if (!isLoopbackRequest(req) && !referenced()) { res.writeHead(403); res.end('Forbidden'); return; }
        filePath = requested;
        localMedia = true;
    } else if (pathname.startsWith('/custom-overlay-assets/')) {
        const assetName = decodeURIComponent(pathname.slice('/custom-overlay-assets/'.length));
        if (!assetName || assetName.includes('/') || assetName.includes('\\')) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        filePath = path.join(CUSTOM_OVERLAY_ASSETS_DIR, assetName);
    } else {
        filePath = path.join(__dirname, filePath);
    }

    // Security: prevent directory traversal
    if (!localMedia && !filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        const headers = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'ETag': etag,
            'Last-Modified': stat.mtime.toUTCString(),
            // Uploaded assets get unique names; everything else revalidates cheaply with the ETag.
            'Cache-Control': pathname.startsWith('/custom-overlay-assets/') ? 'public, max-age=86400' : 'no-cache'
        };
        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, headers);
            res.end();
            return;
        }
        let start = 0;
        let end = stat.size - 1;
        let status = 200;
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (range && (range[1] || range[2])) {
            if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
            else { start = Math.max(0, stat.size - Number(range[2])); }
            if (start > end || start >= stat.size) {
                res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
                res.end();
                return;
            }
            status = 206;
            headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        }
        headers['Content-Length'] = stat.size === 0 ? 0 : end - start + 1;
        res.writeHead(status, headers);
        if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
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
const slideshowStates = new Map();

overlayWss.on('connection', (ws) => {
    overlayClients.add(ws);
    console.log(`[WS] Overlay client connected (${overlayClients.size} total)`);

    // Send current data snapshot immediately
    ws.send(JSON.stringify({ type: 'snapshot', data: chatData }));

    // Send current music state if music is enabled
    if (MUSIC_CONFIG.enabled && musicState.state !== 'stopped') {
        ws.send(JSON.stringify({ type: 'music', data: musicState }));
    }

    ws.send(JSON.stringify({ type: 'viewer-update', data: getViewerSummary() }));
    ws.send(JSON.stringify({ type: 'goals-update', data: buildGoalsSnapshot() }));
    ws.send(JSON.stringify({ type: 'timers-snapshot', data: buildTimersSnapshot() }));

    // Send current overlay visibility state
    for (const entry of listOverlayVisibility().filter(o => !o.visible)) {
        ws.send(JSON.stringify({ type: 'overlay-visibility', data: { key: entry.key, visible: false } }));
    }

    // Overlay pages report slideshow state so controllers can show play/pause and position
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type !== 'slideshow-state' || !msg.id || !msg.element) return;
            const key = `${String(msg.id).slice(0, 80)}::${String(msg.element).slice(0, 80)}`;
            slideshowStates.set(key, { paused: !!msg.paused, position: Number(msg.position) || 0, count: Number(msg.count) || 0, at: Date.now() });
            ws.slideshowKeys = ws.slideshowKeys || new Set();
            ws.slideshowKeys.add(key);
        } catch { /* ignore malformed overlay messages */ }
    });

    ws.on('close', () => {
        for (const key of ws.slideshowKeys || []) slideshowStates.delete(key);
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
        console.log('[Startup] No active session data to resume');
    }

    // Load persistent stats
    loadStats();
    loadTimers();
    startTimerTicker();

    // Start SSN collector
    connectSSN();

    // Load stored Twitch token and fetch data
    loadStoredToken();
    if (twitchAccessToken) {
        fetchTwitchData();
        fetchStreamInfo();
        fetchViewerCount();
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
    // Keep the token fresh in the background so an idle server never lets it lapse.
    setInterval(() => { if (twitchRefreshToken && Date.now() > twitchTokenExpiry - 30 * 60000) refreshTwitchToken(); }, 5 * 60000).unref();

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
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
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
});
