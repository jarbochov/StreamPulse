const fs = require('fs');
const path = require('path');
const { sanitizeOverlayId } = require('./game-plan');
const { safeWriteFileSync: defaultSafeWrite } = require('../routes/helpers');

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
            "Let Chaos Reign!", "Shake It Up!", "Spin the Wheel of Destiny!",
            "Summon Randomness!", "Unleash the Fates!", "Roll the Cosmic Dice!",
            "Mayhem Mode!", "Toss into the Void!", "Destiny, Take the Wheel!",
            "Invoke the Randomizer!", "Disorder, Please!", "Activate Quantum Luck!",
            "Who Knows?!", "Bring the Pandemonium!", "Release the Kraken!",
            "YOLO Button!", "Throw a Curveball!", "Hurl into Uncertainty!",
            "Choose or Lose!", "Hit Me With Chaos!", "Spin and Grin!",
            "Let the Universe Decide!", "Go Bananas!", "SLAM IT ON IN THERE!",
            "Guess You'll Die?", "Hey look over there!", "LET IT BURN",
            "Punch it Margaret!", "What's the Worst That Could Happen?"
        ]
    },
    {
        id: 'games',
        name: 'Game Night & Jackbox',
        phrases: [
            "Pick Next Game!", "Spin the Wheel!", "What Are We Playing?",
            "Game On!", "Wheel of Destiny", "Next Up!", "Choose the Game!"
        ]
    },
    {
        id: 'punish',
        name: 'Challenges & Punishments',
        phrases: [
            "Choose My Fate!", "Spin the Wheel of Pain!", "Hit Me With It!",
            "No Mercy!", "I Regret Nothing!", "Make Me Suffer!"
        ]
    },
    {
        id: 'simple',
        name: 'Simple & Direct',
        phrases: [
            "Spin", "Randomize", "Roll the Dice", "Decide Now"
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
            "A champion emerges from the chaos!", "Bow down to the chosen destiny!",
            "History has been made on stream!", "The gods of RNG have smiled upon us!",
            "Absolute perfection. No notes.", "Destiny has chosen its champion!"
        ]
    },
    {
        id: 'roast',
        name: 'Sarcastic & Chat Roasts',
        quotes: [
            "Blame RNG, not your lack of skill.", "Chat is in absolute shambles right now.",
            "Quantum luck has spoken. Strictly no refunds!", "Honestly, that looks like a skill issue.",
            "Do not pass GO. Do not collect 200 bits.", "Could have been worse. Probably."
        ]
    },
    {
        id: 'minimal',
        name: 'Short & Clean',
        quotes: [
            "Fate is sealed.", "Next up on stream.", "Here we go!",
            "The universe has spoken.", "Decision locked in."
        ]
    }
];

const TEXT_SOURCE_TYPES = new Set(['text', 'random-text', 'markdown']);
const TEXT_SOURCE_EXTS = new Set(['.txt', '.md', '.markdown', '.text']);
const TEXT_SOURCE_MAX_BYTES = 512 * 1024;
const CUSTOM_OVERLAY_ELEMENT_TYPES = new Set(['text', 'random-text', 'markdown', 'image', 'video', 'shape', 'embed', 'progress', 'game-list', 'qr', 'alert', 'slideshow', 'icon', 'cutout', 'pattern']);
const PAGE_TRANSITIONS = ['none', 'fade', 'slide'];
const PAGE_DIRECTIONS = ['left', 'right', 'up', 'down'];
const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
const BORDER_ANIM_TYPES = ['none', 'rotating', 'radial', 'pulsing', 'gradient', 'rainbow', 'marching'];
const PATTERN_LAYOUTS = ['grid', 'brick', 'stagger', 'alternating', 'checkerboard', 'kaleidoscope-quad', 'kaleidoscope-radial'];
const PATTERN_MOTIONS = ['none', 'scroll', 'sway', 'spin', 'scroll-spin', 'wave', 'kaleidoscope'];
const PATTERN_FLIPS = ['none', 'tilt', 'h', 'v', 'both'];
const PATTERN_BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'luminosity', 'plus-lighter'];

function normalizePattern(p = {}) {
    const num = (value, min, max, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Math.max(min, Math.min(max, Number(value))) : fallback);
    return {
        sourceType: p.sourceType === 'icon' ? 'icon' : 'image',
        layout: PATTERN_LAYOUTS.includes(p.layout) ? p.layout : 'brick',
        tileSize: Math.round(num(p.tileSize, 16, 1024, 96)),
        gap: Math.round(num(p.gap, 0, 256, 16)),
        offsetX: Math.round(num(p.offsetX, 0, 100, 50)),
        offsetY: Math.round(num(p.offsetY, 0, 100, 0)),
        angle: Math.round(num(p.angle, -180, 180, -15)),
        tileAngle: Math.round(num(p.tileAngle, -180, 180, 0)),
        alternateFlip: PATTERN_FLIPS.includes(p.alternateFlip) ? p.alternateFlip : 'tilt',
        tileOpacity: Math.round(num(p.tileOpacity, 0.05, 1, 1) * 100) / 100,
        altOpacity: Math.round(num(p.altOpacity, 0, 1, 0.4) * 100) / 100,
        altScale: Math.round(num(p.altScale, 10, 200, 100)),
        blendMode: PATTERN_BLENDS.includes(p.blendMode) ? p.blendMode : 'normal',
        wedges: Math.round(num(p.wedges, 4, 16, 6) / 2) * 2,
        feather: Math.round(num(p.feather, 0, 100, 0)),
        motion: PATTERN_MOTIONS.includes(p.motion) ? p.motion : 'scroll',
        scrollAngle: Math.round(num(p.scrollAngle, 0, 360, 315)),
        speed: Math.round(num(p.speed, 0.5, 120, 12) * 10) / 10,
        spinSpeed: Math.round(num(p.spinSpeed, 0.5, 120, 8) * 10) / 10,
        spinDirection: ['cw', 'ccw', 'alternate'].includes(p.spinDirection) ? p.spinDirection : 'cw',
        waveAmount: Math.round(num(p.waveAmount, 5, 100, 25))
    };
}

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

function normalizeBorderGlow(g = {}) {
    return {
        enabled: g.enabled === true,
        color: String(g.color || '').slice(0, 80),
        blur: Math.max(0, Math.min(100, Math.round(Number(g.blur ?? 16)))),
        spread: Math.max(0, Math.min(50, Math.round(Number(g.spread ?? 2)))),
        neon: g.neon === true,
        inner: g.inner === true
    };
}

function normalizeInnerShadow(s = {}) {
    return {
        blur: Math.max(0, Math.min(100, Math.round(Number(s.blur) || 0))),
        spread: Math.max(0, Math.min(50, Math.round(Number(s.spread) || 0))),
        x: Math.max(-50, Math.min(50, Math.round(Number(s.x) || 0))),
        y: Math.max(-50, Math.min(50, Math.round(Number(s.y) || 0))),
        color: String(s.color || 'rgba(0,0,0,0.5)').slice(0, 80)
    };
}

function normalizeBorderAnimation(a = {}) {
    return {
        type: BORDER_ANIM_TYPES.includes(a.type) ? a.type : 'none',
        speed: Math.max(0.5, Math.min(60, Math.round((Number(a.speed) || 4) * 10) / 10)),
        color2: String(a.color2 || '').slice(0, 80),
        color3: String(a.color3 || '').slice(0, 80),
        size: Math.max(10, Math.min(100, Math.round(Number(a.size) || 35))),
        mode: ['spotlight', 'two-tone', 'fade-white', 'fade-black', 'rainbow'].includes(a.mode) ? a.mode : 'spotlight',
        direction: ['cw', 'ccw', 'alternate'].includes(a.direction) ? a.direction : 'cw'
    };
}

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

function normalizeAssetTagList(input) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(input) ? input : String(input || '').split(',')) {
        const tag = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
    }
    return out;
}

const ASSET_KIND_BY_EXT = {
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
    '.mp4': 'video', '.webm': 'video', '.ogg': 'video',
    '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
    '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.oga': 'audio',
    '.txt': 'text', '.md': 'text', '.markdown': 'text', '.text': 'text'
};
const assetKind = name => ASSET_KIND_BY_EXT[path.extname(name).toLowerCase()] || 'other';
const assetLabel = name => name.replace(/^[a-z0-9]{6,}-/, '').replace(/\.[A-Za-z0-9]+$/, '').replace(/^[-_.]+|[-_.]+$/g, '');
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

function normalizeOverlayElement(element = {}, index = 0, alertTriggers = {}) {
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
        pattern: normalizePattern(element.pattern),
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
            showStatusBadge: Boolean(element.gameList?.showStatusBadge),
            showGroupBadge: Boolean(element.gameList?.showGroupBadge),
            meta: ['none', 'group', 'status', 'date', 'period', 'year', 'genres', 'note', 'rating', 'tags'].includes(element.gameList?.meta) ? element.gameList.meta : 'none',
            tierSource: element.gameList?.tierSource === 'tier' ? 'tier' : 'stars',
            sort: ['plan', 'date', 'date-asc', 'date-desc', 'group', 'collection', 'status', 'name', 'name-desc', 'rating'].includes(element.gameList?.sort) ? element.gameList.sort : 'plan',
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
        video: {
            autoplay: element.video?.autoplay !== false,
            loop: element.video?.loop !== false,
            sound: element.video?.sound === true || element.video?.muted === false,
            volume: Math.max(0, Math.min(100, Math.round(Number(element.video?.volume ?? 100))))
        },
        alert: {
            layout: ['stack', 'side', 'text', 'media'].includes(element.alert?.layout) ? element.alert.layout : 'stack',
            hideText: Boolean(element.alert?.hideText),
            mediaFit: element.alert?.mediaFit === 'cover' ? 'cover' : 'contain',
            mediaScale: Math.max(10, Math.min(100, Number(element.alert?.mediaScale) || 60)),
            titleSize: Math.max(8, Math.min(300, Number(element.alert?.titleSize) || 44)),
            messageSize: Math.max(8, Math.min(300, Number(element.alert?.messageSize) || 28)),
            titleColor: String(element.alert?.titleColor || '#ffd166').slice(0, 80),
            gap: Math.max(0, Math.min(100, Number(element.alert?.gap) || 12)),
            sound: element.alert?.sound !== false,
            videoSound: Boolean(element.alert?.videoSound),
            videoLoop: element.alert?.videoLoop !== false,
            showOnPreview: Boolean(element.alert?.showOnPreview),
            sampleImage: String(element.alert?.sampleImage || '').slice(0, 2000),
            sampleEmoji: String(element.alert?.sampleEmoji || '').trim().slice(0, 40),
            triggers: Array.isArray(element.alert?.triggers) ? element.alert.triggers.filter(t => !alertTriggers || alertTriggers[t]).slice(0, 20) : []
        },
        cutout: {
            shape: ['rectangle', 'circle', 'pill'].includes(element.cutout?.shape) ? element.cutout.shape : 'rectangle',
            feather: Math.max(0, Math.min(100, Math.round(Number(element.cutout?.feather) || 0)))
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
            borderStyle: BORDER_STYLES.includes(element.style?.borderStyle) ? element.style.borderStyle : 'solid',
            borderRadius: Math.max(0, Math.min(200, Number(element.style?.borderRadius) || 0)),
            borderGlow: normalizeBorderGlow(element.style?.borderGlow),
            borderAnimation: normalizeBorderAnimation(element.style?.borderAnimation),
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
            innerShadow: normalizeInnerShadow(element.style?.innerShadow),
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

function normalizeCustomOverlay(input = {}, idOverride = '', alertTriggers = {}) {
    const id = sanitizeOverlayId(idOverride || input.id);
    if (!id) throw new Error('Overlay id is required');
    const pages = normalizePages(input.pages);
    const pageIds = new Set(pages.items.map(item => item.id));
    const elements = (Array.isArray(input.elements)
        ? input.elements.slice(0, 100).map((el, idx) => normalizeOverlayElement(el, idx, alertTriggers))
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

function normalizeOverlayPresets(list, alertTriggers = {}) {
    return (Array.isArray(list) ? list : []).slice(0, 100).map(preset => {
        const elements = (Array.isArray(preset?.elements) ? preset.elements : []).slice(0, 40).map((el, idx) => normalizeOverlayElement(el, idx, alertTriggers));
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

function createOverlayService({
    dataDir,
    safeWriteFileSync = defaultSafeWrite,
    broadcastToOverlays = () => {},
    ALERT_TRIGGERS = {},
    log = console.log,
    warn = console.warn
} = {}) {
    const customOverlaysPath = path.join(dataDir, 'custom-overlays.json');
    const overlayPresetsPath = path.join(dataDir, 'overlay-presets.json');
    const assetTagsPath = path.join(dataDir, 'asset-tags.json');
    const assetCaptionsPath = path.join(dataDir, 'asset-captions.json');
    const customOverlayAssetsDir = path.join(dataDir, 'custom-overlay-assets');
    const customOverlayHistoryDir = path.join(dataDir, 'custom-overlay-history');
    const customOverlayHistoryLimit = 30;

    const randomizerPresetsPath = path.join(dataDir, 'randomizer-presets.json');
    const randomizerButtonPresetsPath = path.join(dataDir, 'randomizer-button-presets.json');
    const randomizerQuotePresetsPath = path.join(dataDir, 'randomizer-quote-presets.json');

    let customOverlays = {};
    let assetTags = {};
    let assetCaptions = {};
    let overlayPresets = [];
    const overlayPageState = new Map();

    function loadRandomizerPresets() {
        try {
            if (fs.existsSync(randomizerPresetsPath)) {
                const data = JSON.parse(fs.readFileSync(randomizerPresetsPath, 'utf8'));
                if (Array.isArray(data) && data.length) return data;
            }
        } catch (e) {
            warn('[Randomizer] Error loading presets:', e.message);
        }
        safeWriteFileSync(randomizerPresetsPath, JSON.stringify(DEFAULT_RANDOMIZER_PRESETS, null, 2));
        return DEFAULT_RANDOMIZER_PRESETS;
    }

    function saveRandomizerPresets(presets) {
        try {
            safeWriteFileSync(randomizerPresetsPath, JSON.stringify(presets, null, 2));
            return true;
        } catch (e) {
            warn('[Randomizer] Error saving presets:', e.message);
            return false;
        }
    }

    function loadRandomizerButtonPresets() {
        try {
            if (fs.existsSync(randomizerButtonPresetsPath)) {
                const data = JSON.parse(fs.readFileSync(randomizerButtonPresetsPath, 'utf8'));
                if (Array.isArray(data) && data.length) return data;
            }
        } catch (e) {
            warn('[Randomizer] Error loading button presets:', e.message);
        }
        safeWriteFileSync(randomizerButtonPresetsPath, JSON.stringify(DEFAULT_RANDOMIZER_BUTTON_PRESETS, null, 2));
        return DEFAULT_RANDOMIZER_BUTTON_PRESETS;
    }

    function saveRandomizerButtonPresets(presets) {
        try {
            safeWriteFileSync(randomizerButtonPresetsPath, JSON.stringify(presets, null, 2));
            return true;
        } catch (e) {
            warn('[Randomizer] Error saving button presets:', e.message);
            return false;
        }
    }

    function loadRandomizerQuotePresets() {
        try {
            if (fs.existsSync(randomizerQuotePresetsPath)) {
                const data = JSON.parse(fs.readFileSync(randomizerQuotePresetsPath, 'utf8'));
                if (Array.isArray(data) && data.length) return data;
            }
        } catch (e) {
            warn('[Randomizer] Error loading quote presets:', e.message);
        }
        safeWriteFileSync(randomizerQuotePresetsPath, JSON.stringify(DEFAULT_RANDOMIZER_QUOTE_PRESETS, null, 2));
        return DEFAULT_RANDOMIZER_QUOTE_PRESETS;
    }

    function saveRandomizerQuotePresets(presets) {
        try {
            safeWriteFileSync(randomizerQuotePresetsPath, JSON.stringify(presets, null, 2));
            return true;
        } catch (e) {
            warn('[Randomizer] Error saving quote presets:', e.message);
            return false;
        }
    }

    function loadCustomOverlays() {
        try {
            if (fs.existsSync(customOverlaysPath)) {
                const stored = JSON.parse(fs.readFileSync(customOverlaysPath, 'utf8'));
                customOverlays = Object.fromEntries(Object.entries(stored || {}).map(([id, overlay]) => {
                    const normalized = normalizeCustomOverlay(overlay, id, ALERT_TRIGGERS);
                    return [normalized.id, normalized];
                }));
            }
            log(`[Overlays] Loaded ${Object.keys(customOverlays).length} custom overlays`);
        } catch (err) {
            warn(`[Overlays] Could not load custom overlays: ${err.message}`);
            customOverlays = {};
        }
    }

    function saveCustomOverlays() {
        safeWriteFileSync(customOverlaysPath, JSON.stringify(customOverlays, null, 2));
    }

    const historyFile = id => path.join(customOverlayHistoryDir, `${sanitizeOverlayId(id)}.json`);

    function readOverlayHistory(id) {
        try {
            const list = JSON.parse(fs.readFileSync(historyFile(id), 'utf8'));
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    function recordOverlayRevision(previous) {
        if (!previous) return;
        try {
            fs.mkdirSync(customOverlayHistoryDir, { recursive: true });
            const list = readOverlayHistory(previous.id).filter(entry => entry.revision !== previous.revision);
            list.push({
                revision: previous.revision,
                updatedAt: previous.updatedAt || '',
                name: previous.name,
                canvas: previous.canvas,
                pages: previous.pages,
                elements: previous.elements
            });
            fs.writeFileSync(historyFile(previous.id), JSON.stringify(list.slice(-customOverlayHistoryLimit)));
        } catch (err) {
            warn('[Overlays] Could not record revision history:', err.message);
        }
    }

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
        if (typeof broadcastToOverlays === 'function') {
            broadcastToOverlays('custom-overlay-page', pageSnapshot(overlay));
        }
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

    function movePage(overlay, action, { target, auto } = {}) {
        let state = overlayPageState.get(overlay.id);
        if (!state) {
            state = { page: overlay.pages.items[0].id, auto: false, timer: null };
            overlayPageState.set(overlay.id, state);
        }
        const items = overlay.pages.items;
        const current = Math.max(0, items.findIndex(item => item.id === state.page));
        const step = dir => {
            for (let i = 1; i <= items.length; i++) {
                let at = current + dir * i;
                if (at < 0 || at >= items.length) {
                    if (!overlay.pages.loop) return -1;
                    at = (at + items.length) % items.length;
                }
                if (items[at].enabled && !items[at].trigger) return at === current ? -1 : at;
            }
            return -1;
        };
        const manual = !auto;
        if (manual && state.takeoverTimer) {
            clearTimeout(state.takeoverTimer);
            state.takeoverTimer = null;
            state.returnPage = null;
        }
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
            if (auto) {
                state.auto = false;
                clearTimeout(state.timer);
                broadcastPage(overlay);
            }
            return false;
        }
        state.page = items[next].id;
        scheduleAutoAdvance(overlay);
        broadcastPage(overlay);
        return true;
    }

    function setPageAuto(overlay, on) {
        let state = overlayPageState.get(overlay.id);
        if (!state) {
            state = { page: overlay.pages.items[0].id, auto: false, timer: null };
            overlayPageState.set(overlay.id, state);
        }
        state.auto = on === undefined ? !state.auto : !!on;
        scheduleAutoAdvance(overlay);
        broadcastPage(overlay);
    }

    function syncOverlayPages(overlay, previous) {
        const state = overlayPageState.get(overlay.id) || { page: overlay.pages.items[0].id, auto: false, timer: null };
        overlayPageState.set(overlay.id, state);
        const items = overlay.pages.items;
        if (!items.some(item => item.id === state.page && item.enabled && (!item.trigger || state.takeoverTimer))) {
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

    function takeoverPages(kind, name, ms) {
        for (const overlay of Object.values(customOverlays)) {
            if (!overlay.pages?.enabled) continue;
            const target = overlay.pages.items.find(p => p.enabled && p.trigger === kind && (kind === 'featured' || (kind === 'alert' ? !p.triggerRules.length || p.triggerRules.includes(name) : !p.triggerName || p.triggerName === String(name || '').toLowerCase())));
            if (!target) continue;
            let state = overlayPageState.get(overlay.id);
            if (!state) {
                state = { page: overlay.pages.items[0].id, auto: false, timer: null };
                overlayPageState.set(overlay.id, state);
            }
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

    // Asset tags & captions
    try {
        if (fs.existsSync(assetTagsPath)) {
            assetTags = JSON.parse(fs.readFileSync(assetTagsPath, 'utf8')) || {};
        }
    } catch (error) {
        warn('[Assets] Could not load asset tags:', error.message);
    }

    try {
        if (fs.existsSync(assetCaptionsPath)) {
            assetCaptions = JSON.parse(fs.readFileSync(assetCaptionsPath, 'utf8')) || {};
        }
    } catch (error) {
        warn('[Assets] Could not load asset captions:', error.message);
    }

    function saveAssetCaptions() {
        safeWriteFileSync(assetCaptionsPath, JSON.stringify(assetCaptions, null, 2));
    }

    function saveAssetTags() {
        safeWriteFileSync(assetTagsPath, JSON.stringify(assetTags, null, 2));
    }

    function setAssetTags(name, tags) {
        const list = normalizeAssetTagList(tags);
        if (list.length) assetTags[name] = list;
        else delete assetTags[name];
    }

    function assetMatchesTags(name, wanted, mode) {
        const have = new Set((assetTags[name] || []).map(tag => tag.toLowerCase()));
        const need = wanted.map(tag => tag.toLowerCase());
        if (!need.length) return false;
        return mode === 'all' ? need.every(tag => have.has(tag)) : need.some(tag => have.has(tag));
    }

    // Presets
    try {
        if (fs.existsSync(overlayPresetsPath)) {
            overlayPresets = normalizeOverlayPresets(JSON.parse(fs.readFileSync(overlayPresetsPath, 'utf8')), ALERT_TRIGGERS);
        }
    } catch (error) {
        warn('[Presets] Could not load overlay presets:', error.message);
    }

    function saveOverlayPresets() {
        safeWriteFileSync(overlayPresetsPath, JSON.stringify(overlayPresets, null, 2));
    }

    // Initial load
    loadCustomOverlays();
    Object.values(customOverlays).forEach(overlay => syncOverlayPages(overlay));

    return {
        getCustomOverlays: () => customOverlays,
        setCustomOverlays: (val) => { customOverlays = val; },
        loadCustomOverlays,
        saveCustomOverlays,
        normalizeCustomOverlay: (input, idOverride) => normalizeCustomOverlay(input, idOverride, ALERT_TRIGGERS),
        normalizeOverlayElement: (el, idx) => normalizeOverlayElement(el, idx, ALERT_TRIGGERS),
        normalizePages,
        normalizeGradient,
        normalizeMediaFilter,
        readOverlayHistory,
        recordOverlayRevision,
        pageSnapshot,
        broadcastPage,
        movePage,
        setPageAuto,
        syncOverlayPages,
        takeoverPages,
        dropOverlayPages,
        assetReferencedIn,
        rewriteAssetReferences,
        getAssetTags: () => assetTags,
        setAssetTags,
        saveAssetTags,
        assetMatchesTags,
        getAssetCaptions: () => assetCaptions,
        saveAssetCaptions,
        getOverlayPresets: () => overlayPresets,
        setOverlayPresets: (val) => { overlayPresets = val; },
        saveOverlayPresets,
        normalizeOverlayPresets: (list) => normalizeOverlayPresets(list, ALERT_TRIGGERS),
        loadRandomizerPresets,
        saveRandomizerPresets,
        loadRandomizerButtonPresets,
        saveRandomizerButtonPresets,
        loadRandomizerQuotePresets,
        saveRandomizerQuotePresets,
        // Paths & directories
        customOverlaysPath,
        overlayPresetsPath,
        assetTagsPath,
        assetCaptionsPath,
        customOverlayAssetsDir,
        customOverlayHistoryDir,
        customOverlayHistoryLimit,
        randomizerPresetsPath,
        randomizerButtonPresetsPath,
        randomizerQuotePresetsPath,
        TEXT_SOURCE_TYPES,
        TEXT_SOURCE_EXTS,
        TEXT_SOURCE_MAX_BYTES,
        CUSTOM_OVERLAY_ELEMENT_TYPES,
        DEFAULT_RANDOMIZER_PRESETS,
        DEFAULT_RANDOMIZER_BUTTON_PRESETS,
        DEFAULT_RANDOMIZER_QUOTE_PRESETS
    };
}

module.exports = {
    createOverlayService,
    normalizeGradient,
    normalizeMediaFilter,
    normalizeAssetTagList,
    normalizeOverlayElement,
    normalizePages,
    normalizeCustomOverlay,
    normalizeOverlayPresets,
    assetReferencedIn,
    rewriteAssetReferences,
    assetKind,
    assetLabel,
    assetFontFamily,
    TEXT_SOURCE_TYPES,
    TEXT_SOURCE_EXTS,
    TEXT_SOURCE_MAX_BYTES,
    CUSTOM_OVERLAY_ELEMENT_TYPES,
    DEFAULT_RANDOMIZER_PRESETS,
    DEFAULT_RANDOMIZER_BUTTON_PRESETS,
    DEFAULT_RANDOMIZER_QUOTE_PRESETS
};
