const fs = require('fs');
const path = require('path');
const { sanitizeOverlayId } = require('./game-plan');
const { safeWriteFileSync: defaultSafeWrite } = require('../routes/helpers');
const { settings: normalizePollSettings } = require('../../public/js/poll-widget');

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

function normalizeRandomizerPreset(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const name = String(raw.name || id).trim();
    const choices = Array.isArray(raw.choices) ? raw.choices.map(c => String(c).trim()).filter(Boolean) : [];
    const validModes = ['equal', 'manual', 'growth', 'momentum'];
    const weightMode = validModes.includes(raw.weightMode) ? raw.weightMode : 'equal';
    const settingsRaw = raw.weightSettings || {};
    const weightSettings = {
        step: Math.max(0.1, Math.min(100, Number(settingsRaw.step) || 1)),
        max: Math.max(1, Math.min(1000, Number(settingsRaw.max) || 20)),
        base: Math.max(0.1, Math.min(100, Number(settingsRaw.base) || 1))
    };
    const weights = {};
    if (raw.weights && typeof raw.weights === 'object') {
        for (const [k, v] of Object.entries(raw.weights)) {
            const num = Number(v);
            if (!Number.isNaN(num) && num > 0) weights[k] = Math.round(num * 100) / 100;
        }
    }
    const choiceStats = {};
    if (raw.choiceStats && typeof raw.choiceStats === 'object') {
        for (const [k, v] of Object.entries(raw.choiceStats)) {
            if (v && typeof v === 'object') {
                choiceStats[k] = {
                    picks: Math.max(0, Number(v.picks) || 0),
                    unpickedSpins: Math.max(0, Number(v.unpickedSpins) || 0),
                    effectiveWeight: Math.max(0.01, Number(v.effectiveWeight) || 1)
                };
            }
        }
    }
    const deckLogo = raw.deckLogo !== undefined ? String(raw.deckLogo || '').trim() : undefined;
    const deckWatermark = raw.deckWatermark !== undefined ? String(raw.deckWatermark || '').trim() : undefined;
    return {
        ...raw,
        id,
        name,
        choices,
        weightMode,
        weightSettings,
        weights,
        choiceStats,
        ...(deckLogo !== undefined ? { deckLogo } : {}),
        ...(deckWatermark !== undefined ? { deckWatermark } : {})
    };
}

function getEffectiveWeights(preset, choiceList = null) {
    const choices = choiceList || preset?.choices || [];
    const mode = preset?.weightMode || 'equal';
    const baseMap = preset?.weights || {};
    const statsMap = preset?.choiceStats || {};
    const settings = preset?.weightSettings || { step: 1, max: 20, base: 1 };
    const defaultBase = settings.base || 1;

    const weights = {};
    let totalWeight = 0;

    for (const c of choices) {
        let w = 1;
        const userBase = baseMap[c] != null ? Number(baseMap[c]) : defaultBase;
        if (mode === 'equal') {
            w = 1;
        } else if (mode === 'manual') {
            w = Math.max(0.01, userBase);
        } else if (mode === 'growth' || mode === 'momentum') {
            if (statsMap[c]?.effectiveWeight != null) {
                w = Math.max(0.01, Number(statsMap[c].effectiveWeight));
            } else {
                w = Math.max(0.01, userBase);
            }
        }
        weights[c] = Math.round(w * 100) / 100;
        totalWeight += weights[c];
    }
    totalWeight = Math.round(totalWeight * 100) / 100;
    return { weights, totalWeight, mode };
}

function pickWeightedWinner(choices, weightsMap = {}) {
    if (!choices || !choices.length) return { winner: 'Winner', winnerIndex: -1 };
    let total = 0;
    const entries = choices.map((c, idx) => {
        const w = Math.max(0.01, Number(weightsMap[c]) || 1);
        total += w;
        return { choice: c, index: idx, weight: w };
    });
    let rnd = Math.random() * total;
    for (const entry of entries) {
        if (rnd < entry.weight) {
            return { winner: entry.choice, winnerIndex: entry.index };
        }
        rnd -= entry.weight;
    }
    const last = entries[entries.length - 1];
    return { winner: last.choice, winnerIndex: last.index };
}

function updatePresetWeightsAfterSpin(preset, winner) {
    if (!preset || (preset.weightMode !== 'growth' && preset.weightMode !== 'momentum')) {
        return preset;
    }
    const mode = preset.weightMode;
    const settings = preset.weightSettings || { step: 1, max: 20, base: 1 };
    const step = settings.step || 1;
    const max = settings.max || 20;
    const defaultBase = settings.base || 1;
    const baseMap = preset.weights || {};
    const stats = preset.choiceStats = preset.choiceStats || {};

    const choices = preset.choices || [];
    for (const c of choices) {
        if (!stats[c]) {
            const b = baseMap[c] != null ? Number(baseMap[c]) : defaultBase;
            stats[c] = { picks: 0, unpickedSpins: 0, effectiveWeight: b };
        }
    }

    if (mode === 'growth') {
        for (const c of choices) {
            const isWinner = c.toLowerCase() === String(winner).toLowerCase();
            const b = baseMap[c] != null ? Number(baseMap[c]) : defaultBase;
            if (isWinner) {
                stats[c].picks = (stats[c].picks || 0) + 1;
                stats[c].unpickedSpins = 0;
                stats[c].effectiveWeight = b;
            } else {
                stats[c].unpickedSpins = (stats[c].unpickedSpins || 0) + 1;
                const nextW = Math.min(max, (stats[c].effectiveWeight || b) + step);
                stats[c].effectiveWeight = Math.round(nextW * 100) / 100;
            }
        }
    } else if (mode === 'momentum') {
        for (const c of choices) {
            const isWinner = c.toLowerCase() === String(winner).toLowerCase();
            const b = baseMap[c] != null ? Number(baseMap[c]) : defaultBase;
            if (isWinner) {
                stats[c].picks = (stats[c].picks || 0) + 1;
                stats[c].unpickedSpins = 0;
                const nextW = Math.min(max, (stats[c].effectiveWeight || b) + step);
                stats[c].effectiveWeight = Math.round(nextW * 100) / 100;
            } else {
                stats[c].unpickedSpins = (stats[c].unpickedSpins || 0) + 1;
            }
        }
    }

    return preset;
}

function resetPresetWeights(preset, mode = '') {
    if (!preset) return null;
    const defaultBase = preset.weightSettings?.base || 1;
    if (mode === 'equal' || preset.weightMode === 'equal') {
        preset.weights = {};
        for (const c of (preset.choices || [])) {
            preset.weights[c] = defaultBase;
        }
    }
    const baseMap = preset.weights || {};
    const stats = {};
    for (const c of (preset.choices || [])) {
        const b = baseMap[c] != null ? Number(baseMap[c]) : defaultBase;
        stats[c] = { picks: 0, unpickedSpins: 0, effectiveWeight: b };
    }
    preset.choiceStats = stats;
    return preset;
}


const TEXT_SOURCE_TYPES = new Set(['text', 'random-text', 'markdown']);
const TEXT_SOURCE_EXTS = new Set(['.txt', '.md', '.markdown', '.text']);
const TEXT_SOURCE_MAX_BYTES = 512 * 1024;
const CUSTOM_OVERLAY_ELEMENT_TYPES = new Set(['text', 'random-text', 'markdown', 'image', 'video', 'shape', 'embed', 'progress', 'poll', 'game-list', 'qr', 'alert', 'slideshow', 'icon', 'cutout', 'pattern']);
const PAGE_TRANSITIONS = ['none', 'fade', 'slide'];
const PAGE_DIRECTIONS = ['left', 'right', 'up', 'down'];
const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
const BORDER_ANIM_TYPES = ['none', 'rotating', 'radial', 'pulsing', 'gradient', 'rainbow', 'marching'];
const PATTERN_LAYOUTS = ['grid', 'brick', 'stagger', 'alternating', 'checkerboard', 'kaleidoscope-quad', 'kaleidoscope-radial'];
const PATTERN_MOTIONS = ['none', 'scroll', 'alt-rows', 'alt-cols', 'weave', 'sway', 'spin', 'scroll-spin', 'wave', 'kaleidoscope'];
const PATTERN_TRACK_MODES = ['uniform', 'opposite', 'stagger', 'sine', 'alternate-stop', 'alt-rows', 'stagger-rows', 'alt-cols', 'stagger-cols'];
const PATTERN_FLIPS = ['none', 'tilt', 'h', 'v', 'both'];
const PATTERN_BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'luminosity', 'plus-lighter'];

function normalizePattern(p = {}) {
    const num = (value, min, max, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Math.max(min, Math.min(max, Number(value))) : fallback);
    const motion = PATTERN_MOTIONS.includes(p.motion) ? p.motion : 'scroll';
    const defaultTrack = (motion === 'alt-rows' || motion === 'alt-cols') ? 'opposite' : 'uniform';
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
        motion,
        trackMode: PATTERN_TRACK_MODES.includes(p.trackMode) ? p.trackMode : defaultTrack,
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

function normalizeRetro(retro = {}) {
    const num = (value, min, max, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Math.max(min, Math.min(max, Number(value))) : fallback);
    const bool = value => value === true || value === 'true' || value === 1;

    let display = ['none', 'crt', 'lcd'].includes(retro.display) ? retro.display : 'none';
    if (retro.type === 'crt' && display === 'none') display = 'crt';
    if (retro.type === 'lcd' && display === 'none') display = 'lcd';

    const vhs = bool(retro.vhs) || retro.signal === 'vhs' || retro.type === 'vhs';
    const ntsc = bool(retro.ntsc) || retro.signal === 'ntsc' || retro.type === 'ntsc';
    const staticSignal = bool(retro.static) || retro.signal === 'static' || retro.type === 'static';

    let scanlineScale = 1.0;
    if (retro.crtScanlineScale != null) {
        scanlineScale = num(retro.crtScanlineScale, 0.2, 6.0, 1.0);
    } else if (retro.crtScanlineSize != null || retro.scanlineSize != null) {
        scanlineScale = num(Number(retro.crtScanlineSize ?? retro.scanlineSize) / 4.0, 0.2, 6.0, 1.0);
    }

    let maskScale = 1.0;
    if (retro.crtMaskScale != null) {
        maskScale = num(retro.crtMaskScale, 0.2, 6.0, 1.0);
    } else if (retro.crtMaskSize != null || retro.maskSize != null) {
        maskScale = num(Number(retro.crtMaskSize ?? retro.maskSize) / 2.0, 0.2, 6.0, 1.0);
    }

    const mask = ['none', 'aperture', 'slot', 'dot', 'slot-mask', 'shadow-mask'].includes(retro.crtMask || retro.mask)
        ? (retro.crtMask || retro.mask)
        : 'aperture';

    const lcdPalette = ['default', 'dmg-green', 'pocket', 'cyber-blue', 'amber', 'gameboy-color', 'virtual-boy'].includes(retro.lcdPalette || retro.palette)
        ? (retro.lcdPalette || retro.palette)
        : 'default';

    return {
        display,
        vhs,
        ntsc,
        static: staticSignal,

        // CRT Screen
        crtScanlines: num(retro.crtScanlines ?? retro.scanlines, 0, 100, 45),
        crtScanlineScale: scanlineScale,
        crtScanlineSize: scanlineScale * 4.0,
        crtCurvature: num(retro.crtCurvature ?? retro.curvature, 0, 60, 12),
        crtBloom: num(retro.crtBloom ?? retro.bloom, 0, 100, 25),
        crtVignette: num(retro.crtVignette ?? retro.vignette, 0, 100, 20),
        crtMask: mask,
        crtMaskScale: maskScale,
        crtMaskSize: maskScale * 2.0,
        crtMaskStrength: num(retro.crtMaskStrength, 0, 100, 35),
        crtInterlace: num(retro.crtInterlace, 0, 100, 0),

        // LCD Screen
        lcdGrid: num(retro.lcdGrid ?? retro.grid, 0, 100, 35),
        lcdPalette,
        lcdGhosting: num(retro.lcdGhosting, 0, 100, 0),

        // VHS Signal
        vhsJitter: num(retro.vhsJitter ?? retro.jitter, 0, 100, 25),
        vhsGlitch: num(retro.vhsGlitch ?? retro.glitch, 0, 100, 20),
        vhsChroma: num(retro.vhsChroma ?? retro.chromatic, 0, 100, 20),
        vhsNoise: num(retro.vhsNoise ?? retro.noise, 0, 100, 15),
        vhsHeadNoise: num(retro.vhsHeadNoise, 0, 100, 25),

        // NTSC Signal
        ntscBleed: num(retro.ntscBleed ?? retro.bleed, 0, 100, 30),
        ntscGhost: num(retro.ntscGhost ?? retro.ghosting, 0, 100, 25),
        ntscNoise: num(retro.ntscNoise ?? retro.noise, 0, 100, 12),
        ntscHue: num(retro.ntscHue, -30, 30, 0),

        // TV Static & White Noise
        staticNoise: num(retro.staticNoise ?? retro.noise, 0, 100, 55),
        staticScale: num(retro.staticScale ?? retro.noiseScale, 1.0, 10.0, 2.0),
        staticSpeed: num(retro.staticSpeed ?? retro.noiseSpeed, 2, 60, 16),
        staticPure: bool(retro.staticPure),
        staticColor: bool(retro.staticColor),
        staticGlitch: num(retro.staticGlitch ?? retro.glitch, 0, 100, 40),
        staticRoll: num(retro.staticRoll ?? retro.roll, 0, 100, 15)
    };
}

function normalizeMediaFilter(f = {}) {
    const hex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback);
    const num = (value, min, max, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Math.max(min, Math.min(max, Number(value))) : fallback);
    const ht = f.halftone || {};
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
        grain: { enabled: f.grain?.enabled === true, amount: num(f.grain?.amount, 0, 1, 0.25), size: num(f.grain?.size, 0.5, 4, 1), animate: f.grain?.animate !== false },
        halftone: {
            mode: [
                'none', 'dots', 'lines', 'crosshatch',
                'bayer', 'bayer-2', 'bayer-4', 'bayer-8', 'bayer-16',
                'cluster-4', 'cluster-8', 'lines-h', 'blue-noise', 'custom',
                'floyd-steinberg', 'atkinson', 'sierra-lite', 'sierra', 'burkes', 'jarvis',
                'pixelate'
            ].includes(ht.mode) ? ht.mode : 'none',
            size: Math.round(num(ht.size, 1, 48, 8)),
            angle: Math.round(num(ht.angle, -180, 180, 45)),
            threshold: Math.round(num(ht.threshold, 5, 95, 50)),
            softness: Math.round(num(ht.softness, 0, 100, 12)),
            pixelSize: Math.round(num(ht.pixelSize, 1, 32, 1)),
            levels: Math.round(num(ht.levels, 2, 16, 4)),
            colorMode: ['manga', 'ink-only', 'color'].includes(ht.colorMode) ? ht.colorMode : 'manga',
            customMatrix: String(ht.customMatrix || '').slice(0, 500),
            inkColor: hex(ht.inkColor, '#0f172a'),
            paperColor: hex(ht.paperColor, '#ffffff'),
            invert: ht.invert === true,
            fadeMode: ['none', 'linear', 'radial'].includes(ht.fadeMode) ? ht.fadeMode : 'none',
            fadeAngle: Math.round(num(ht.fadeAngle, 0, 360, 135)),
            fadeCenterX: Math.round(num(ht.fadeCenterX, 0, 100, 50)),
            fadeCenterY: Math.round(num(ht.fadeCenterY, 0, 100, 50)),
            fadeStart: Math.round(num(ht.fadeStart, 0, 100, 15)),
            fadeEnd: Math.round(num(ht.fadeEnd, 0, 100, 85)),
            fadeInvert: ht.fadeInvert === true,
            fadeStyle: ['dots', 'blend'].includes(ht.fadeStyle) ? ht.fadeStyle : 'dots'
        },
        retro: normalizeRetro(f.retro || {})
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
        poll: type === 'poll' ? normalizePollSettings(element.poll) : undefined,
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

function escapeXml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateSvgThumbnail(overlay, { customOverlayAssetsDir = '', page = null, activePage = null } = {}) {
    if (!overlay || !overlay.canvas) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080"><rect width="100%" height="100%" fill="#0b0f17"/></svg>';
    }

    const width = Math.max(10, Math.round(Number(overlay.canvas.width) || 1920));
    const height = Math.max(10, Math.round(Number(overlay.canvas.height) || 1080));
    const bg = overlay.canvas.background || 'transparent';
    const canvasGrad = overlay.canvas.gradient;

    const defs = [];
    const elementsSvg = [];

    // Background gradient or color
    if (canvasGrad && canvasGrad.enabled) {
        const gradId = 'canvas-bg-grad';
        const from = canvasGrad.from || '#1f6feb';
        const to = canvasGrad.to || '#8957e5';
        const mid = canvasGrad.mid ? `<stop offset="50%" stop-color="${escapeXml(canvasGrad.mid)}" />` : '';
        defs.push(`<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${escapeXml(from)}" />
            ${mid}
            <stop offset="100%" stop-color="${escapeXml(to)}" />
        </linearGradient>`);
        elementsSvg.push(`<rect width="100%" height="100%" fill="url(#${gradId})" />`);
    } else if (bg && bg !== 'transparent') {
        elementsSvg.push(`<rect width="100%" height="100%" fill="${escapeXml(bg)}" />`);
    }

    const pagesEnabled = Boolean(overlay.pages?.enabled);
    let targetPage = page || activePage;
    if (!targetPage && pagesEnabled) {
        const items = overlay.pages.items || [];
        const first = items.find(item => item.enabled && !item.trigger) || items.find(item => item.enabled) || items[0];
        targetPage = first ? first.id : '';
    }

    const elements = Array.isArray(overlay.elements) ? [...overlay.elements] : [];
    elements.sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));

    elements.forEach((el, idx) => {
        if (el.visible === false) return;
        if (pagesEnabled && targetPage && el.page && el.page !== '*' && el.page !== targetPage) return;
        const x = Number(el.x) || 0;
        const y = Number(el.y) || 0;
        const w = Math.max(1, Number(el.width) || 100);
        const h = Math.max(1, Number(el.height) || 100);
        const style = el.style || {};
        const opacity = style.opacity != null ? Number(style.opacity) : 1;
        const rx = Number(style.borderRadius) || 0;

        let transform = '';
        if (el.rotation) {
            transform = ` transform="rotate(${Number(el.rotation)}, ${x + w / 2}, ${y + h / 2})"`;
        }
        const opacityAttr = (opacity >= 0 && opacity < 1) ? ` opacity="${opacity}"` : '';

        // Gradient support for element fill
        let bgFill = style.background && style.background !== 'transparent' ? style.background : 'none';
        if (style.gradient && style.gradient.enabled) {
            const gradId = `el-grad-${escapeXml(el.id || idx)}`;
            const from = style.gradient.from || '#1f6feb';
            const to = style.gradient.to || '#8957e5';
            const mid = style.gradient.mid ? `<stop offset="50%" stop-color="${escapeXml(style.gradient.mid)}" />` : '';
            defs.push(`<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${escapeXml(from)}" />
                ${mid}
                <stop offset="100%" stop-color="${escapeXml(to)}" />
            </linearGradient>`);
            bgFill = `url(#${gradId})`;
        }

        const borderWidth = Number(style.borderWidth) || 0;
        const borderColor = style.borderColor || 'none';
        const borderAnim = style.borderAnimation || {};
        const borderGrad = style.borderGradient || {};

        let borderStroke = '';
        let strokeDashAttr = '';

        if (borderWidth > 0) {
            if (borderGrad.enabled) {
                const bGradId = `b-grad-${escapeXml(el.id || idx)}`;
                const bFrom = borderGrad.from || '#1f6feb';
                const bTo = borderGrad.to || '#8957e5';
                const bMid = borderGrad.mid ? `<stop offset="50%" stop-color="${escapeXml(borderGrad.mid)}" />` : '';
                defs.push(`<linearGradient id="${bGradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${escapeXml(bFrom)}" />
                    ${bMid}
                    <stop offset="100%" stop-color="${escapeXml(bTo)}" />
                </linearGradient>`);
                borderStroke = `url(#${bGradId})`;
            } else if (borderAnim.type === 'rainbow') {
                const rbId = `b-rb-${escapeXml(el.id || idx)}`;
                defs.push(`<linearGradient id="${rbId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ff0055" />
                    <stop offset="17%" stop-color="#ff9900" />
                    <stop offset="33%" stop-color="#ffee00" />
                    <stop offset="50%" stop-color="#00ff66" />
                    <stop offset="67%" stop-color="#00bbff" />
                    <stop offset="83%" stop-color="#8800ff" />
                    <stop offset="100%" stop-color="#ff0055" />
                </linearGradient>`);
                borderStroke = `url(#${rbId})`;
            } else if (borderAnim.type === 'gradient') {
                const bgAnimId = `b-an-grad-${escapeXml(el.id || idx)}`;
                const c1 = borderColor && borderColor !== 'none' && borderColor !== 'transparent' ? borderColor : '#1f6feb';
                const c2 = borderAnim.color2 || '#8957e5';
                const mid = borderAnim.color3 ? `<stop offset="50%" stop-color="${escapeXml(borderAnim.color3)}" />` : '';
                defs.push(`<linearGradient id="${bgAnimId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${escapeXml(c1)}" />
                    ${mid}
                    <stop offset="100%" stop-color="${escapeXml(c2)}" />
                </linearGradient>`);
                borderStroke = `url(#${bgAnimId})`;
            } else if (borderAnim.type === 'rotating' || borderAnim.type === 'radial') {
                const mode = borderAnim.mode || 'spotlight';
                if (mode === 'rainbow') {
                    const rbId = `b-rb-${escapeXml(el.id || idx)}`;
                    defs.push(`<linearGradient id="${rbId}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#ff0055" />
                        <stop offset="17%" stop-color="#ff9900" />
                        <stop offset="33%" stop-color="#ffee00" />
                        <stop offset="50%" stop-color="#00ff66" />
                        <stop offset="67%" stop-color="#00bbff" />
                        <stop offset="83%" stop-color="#8800ff" />
                        <stop offset="100%" stop-color="#ff0055" />
                    </linearGradient>`);
                    borderStroke = `url(#${rbId})`;
                } else {
                    const beamId = `b-beam-${escapeXml(el.id || idx)}`;
                    const head = borderAnim.color2 || (mode === 'spotlight' ? '#ffffff' : '#38bdf8');
                    const trail = borderColor && borderColor !== 'none' && borderColor !== 'transparent' ? borderColor : '#38bdf8';
                    const mid = borderAnim.color3 ? `<stop offset="50%" stop-color="${escapeXml(borderAnim.color3)}" />` : '';
                    defs.push(`<linearGradient id="${beamId}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${escapeXml(head)}" />
                        ${mid}
                        <stop offset="100%" stop-color="${escapeXml(trail)}" />
                    </linearGradient>`);
                    borderStroke = `url(#${beamId})`;
                }
            } else if (borderColor && borderColor !== 'none' && borderColor !== 'transparent') {
                borderStroke = borderColor;
            }

            if (borderAnim.type === 'marching' || style.borderStyle === 'dashed') {
                strokeDashAttr = ' stroke-dasharray="8,6"';
            } else if (style.borderStyle === 'dotted') {
                strokeDashAttr = ` stroke-dasharray="${borderWidth},${borderWidth * 1.5}"`;
            }
        }

        const renderBorderOverlay = () => {
            if (borderWidth <= 0 || !borderStroke) return '';
            const halfB = borderWidth / 2;
            const bx = x + halfB;
            const by = y + halfB;
            const bw = Math.max(0, w - borderWidth);
            const bh = Math.max(0, h - borderWidth);
            const brx = Math.max(0, rx - halfB);
            return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${brx}" fill="none" stroke="${escapeXml(borderStroke)}" stroke-width="${borderWidth}"${strokeDashAttr}${opacityAttr}${transform} />`;
        };

        const strokeAttr = borderWidth > 0 && borderStroke ? ` stroke="${escapeXml(borderStroke)}" stroke-width="${borderWidth}"${strokeDashAttr}` : '';

        if (el.type === 'shape') {
            const shape = style.shape || 'rectangle';
            const shapeFill = style.fill || bgFill;
            if (shape === 'circle' || shape === 'ellipse') {
                elementsSvg.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${escapeXml(shapeFill)}"${strokeAttr}${opacityAttr}${transform} />`);
            } else if (shape === 'triangle') {
                const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
                elementsSvg.push(`<polygon points="${points}" fill="${escapeXml(shapeFill)}"${strokeAttr}${opacityAttr}${transform} />`);
            } else if (shape === 'line') {
                const strokeColor = borderStroke || style.borderColor || style.color || '#fff';
                elementsSvg.push(`<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${escapeXml(strokeColor)}" stroke-width="${Math.max(2, borderWidth)}"${strokeDashAttr}${opacityAttr}${transform} />`);
            } else {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${escapeXml(shapeFill)}"${strokeAttr}${opacityAttr}${transform} />`);
            }
        } else if (el.type === 'cutout') {
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="rgba(239, 68, 68, 0.08)" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4" />
                <rect x="${x + 6}" y="${y + 6}" width="64" height="20" rx="3" fill="#ef4444" />
                <text x="${x + 38}" y="${y + 20}" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="0.05em">CUTOUT</text>
            </g>`);
        } else if (el.type === 'image') {
            let href = el.src || '';
            if (customOverlayAssetsDir && href.startsWith('/custom-overlay-assets/')) {
                const filename = href.replace('/custom-overlay-assets/', '');
                const filePath = path.join(customOverlayAssetsDir, filename);
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0 && stats.size <= 50 * 1024 * 1024) {
                        const ext = path.extname(filename).toLowerCase().replace('.', '');
                        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
                        const b64 = fs.readFileSync(filePath).toString('base64');
                        href = `data:${mime};base64,${b64}`;
                    }
                } catch {}
            }
            if (bgFill !== 'none') {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${escapeXml(bgFill)}"${opacityAttr}${transform} />`);
            }
            if (href) {
                let clipAttr = '';
                if (rx > 0) {
                    const clipId = `clip-${escapeXml(el.id || idx)}`;
                    defs.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" /></clipPath>`);
                    clipAttr = ` clip-path="url(#${clipId})"`;
                }
                const focusX = style.focusX != null ? Number(style.focusX) : 50;
                const focusY = style.focusY != null ? Number(style.focusY) : 50;
                const xAlign = focusX < 35 ? 'xMin' : focusX > 65 ? 'xMax' : 'xMid';
                const yAlign = focusY < 35 ? 'YMin' : focusY > 65 ? 'YMax' : 'YMid';
                const fit = style.objectFit === 'contain' ? 'meet' : 'slice';
                elementsSvg.push(`<image href="${escapeXml(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${xAlign}${yAlign} ${fit}"${clipAttr}${opacityAttr}${transform} />`);
            } else {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" stroke-width="1"${opacityAttr}${transform} />`);
            }
            const borderSvg = renderBorderOverlay();
            if (borderSvg) elementsSvg.push(borderSvg);
        } else if (['text', 'random-text', 'markdown'].includes(el.type)) {
            if (bgFill !== 'none') {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${escapeXml(bgFill)}"${opacityAttr}${transform} />`);
            }
            const rawContent = el.content || (el.items && el.items.length ? el.items[0] : '') || el.name || '';
            if (rawContent) {
                const fontSize = Math.max(10, Math.min(180, Number(style.fontSize) || 24));
                const fontFamily = style.fontFamily ? style.fontFamily.replace(/['"]/g, '') : '-apple-system, system-ui, sans-serif';
                const textColor = style.color || '#ffffff';
                const textAlign = style.textAlign || 'left';
                const fontWeight = style.fontWeight || '400';

                let textAnchor = 'start';
                let tx = x + 12;
                if (textAlign === 'center') {
                    textAnchor = 'middle';
                    tx = x + w / 2;
                } else if (textAlign === 'right') {
                    textAnchor = 'end';
                    tx = x + w - 12;
                }

                const lines = String(rawContent).split('\n').slice(0, 8);
                const lineHeight = fontSize * 1.25;
                const totalTextH = lines.length * lineHeight;
                let ty = y + (h - totalTextH) / 2 + fontSize * 0.88;
                if (style.verticalAlign === 'top') {
                    ty = y + fontSize * 0.9 + 8;
                } else if (style.verticalAlign === 'bottom') {
                    ty = y + h - totalTextH + fontSize * 0.9 - 8;
                }

                const tspans = lines.map((line, i) => `<tspan x="${tx}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('');
                elementsSvg.push(`<text x="${tx}" y="${ty}" fill="${escapeXml(textColor)}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${escapeXml(fontWeight)}" text-anchor="${textAnchor}"${opacityAttr}${transform}>${tspans}</text>`);
            }
            const borderSvg = renderBorderOverlay();
            if (borderSvg) elementsSvg.push(borderSvg);
        } else if (el.type === 'icon') {
            if (bgFill !== 'none') {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${escapeXml(bgFill)}"${opacityAttr}${transform} />`);
            }
            const cls = String(el.content || '').trim().toLowerCase();
            const iconColor = style.color || '#ffffff';
            const iconSize = Math.min(w, h) * 0.7;
            const ix = x + (w - iconSize) / 2;
            const iy = y + (h - iconSize) / 2;

            if (cls.includes('twitch')) {
                elementsSvg.push(`<g transform="translate(${ix}, ${iy}) scale(${iconSize / 24})"${opacityAttr}${transform}>
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" fill="${escapeXml(iconColor)}" />
                </g>`);
            } else if (cls.includes('youtube')) {
                elementsSvg.push(`<g transform="translate(${ix}, ${iy}) scale(${iconSize / 24})"${opacityAttr}${transform}>
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="${escapeXml(iconColor)}" />
                </g>`);
            } else if (cls.includes('discord')) {
                elementsSvg.push(`<g transform="translate(${ix}, ${iy}) scale(${iconSize / 24})"${opacityAttr}${transform}>
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="${escapeXml(iconColor)}" />
                </g>`);
            } else if (cls.includes('twitter') || cls.includes('fa-x')) {
                elementsSvg.push(`<g transform="translate(${ix}, ${iy}) scale(${iconSize / 24})"${opacityAttr}${transform}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="${escapeXml(iconColor)}" />
                </g>`);
            } else {
                elementsSvg.push(`<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${iconSize / 2}" fill="none" stroke="${escapeXml(iconColor)}" stroke-width="2"${opacityAttr}${transform} />`);
            }
            const borderSvg = renderBorderOverlay();
            if (borderSvg) elementsSvg.push(borderSvg);
        } else if (['video', 'embed'].includes(el.type)) {
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bgFill !== 'none' ? escapeXml(bgFill) : '#0f172a'}" stroke="${borderWidth > 0 && borderStroke ? escapeXml(borderStroke) : 'rgba(255,255,255,0.15)'}" stroke-width="${Math.max(1, borderWidth)}"${strokeDashAttr} />
                <circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(32, w / 4, h / 4)}" fill="rgba(255,255,255,0.12)" />
                <polygon points="${x + w / 2 - 8},${y + h / 2 - 12} ${x + w / 2 + 14},${y + h / 2} ${x + w / 2 - 8},${y + h / 2 + 12}" fill="#ffffff" />
                <text x="${x + w / 2}" y="${y + h / 2 + Math.min(32, w / 4, h / 4) + 20}" fill="rgba(255,255,255,0.7)" font-family="-apple-system, system-ui, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${escapeXml(el.name || (el.type === 'embed' ? 'Web Embed' : 'Video Player'))}</text>
            </g>`);
        } else if (el.type === 'alert') {
            // Alerts are event-driven overlay popups; hide when idle unless showOnPreview is true
            if (el.alert?.showOnPreview === true) {
                const alertTitle = el.alert.sampleTitle || 'NEW FOLLOWER!';
                const alertUser = el.alert.sampleUser || 'StreamerFan123';
                const titleColor = el.alert.titleColor || '#ffd166';
                elementsSvg.push(`<g${opacityAttr}${transform}>
                    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bgFill !== 'none' ? escapeXml(bgFill) : 'rgba(30, 41, 59, 0.9)'}" stroke="${borderWidth > 0 && borderStroke ? escapeXml(borderStroke) : 'rgba(250, 204, 21, 0.4)'}" stroke-width="${Math.max(1, borderWidth)}"${strokeDashAttr} />
                    <circle cx="${x + 36}" cy="${y + h / 2}" r="16" fill="rgba(250, 204, 21, 0.2)" />
                    <path d="M ${x + 36} ${y + h / 2 - 8} A 6 6 0 0 1 ${x + 42} ${y + h / 2 - 2} L ${x + 44} ${y + h / 2 + 4} L ${x + 28} ${y + h / 2 + 4} L ${x + 30} ${y + h / 2 - 2} A 6 6 0 0 1 ${x + 36} ${y + h / 2 - 8} Z" fill="#facc15" />
                    <text x="${x + 64}" y="${y + h / 2 - 4}" fill="${escapeXml(titleColor)}" font-family="-apple-system, system-ui, sans-serif" font-size="14" font-weight="700">${escapeXml(alertTitle)}</text>
                    <text x="${x + 64}" y="${y + h / 2 + 14}" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-size="12">${escapeXml(alertUser)}</text>
                </g>`);
            }
        } else if (el.type === 'pattern') {
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bgFill !== 'none' ? escapeXml(bgFill) : '#1e1b4b'}" stroke="${borderWidth > 0 && borderStroke ? escapeXml(borderStroke) : 'rgba(167, 139, 250, 0.3)'}" stroke-width="${Math.max(1, borderWidth)}"${strokeDashAttr} />
                <text x="${x + w / 2}" y="${y + h / 2 + 4}" fill="#c4b5fd" font-family="-apple-system, system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">Pattern (${escapeXml(el.pattern?.layout || 'Grid')})</text>
            </g>`);
        } else if (el.type === 'game-list') {
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bgFill !== 'none' ? escapeXml(bgFill) : 'rgba(15, 23, 42, 0.8)'}" stroke="${borderWidth > 0 && borderStroke ? escapeXml(borderStroke) : '#3fb950'}" stroke-width="${Math.max(1, borderWidth)}"${strokeDashAttr} />
                <text x="${x + 16}" y="${y + 28}" fill="#3fb950" font-family="-apple-system, system-ui, sans-serif" font-size="13" font-weight="700">GAME PLAN</text>
                <rect x="${x + 16}" y="${y + 40}" width="${Math.min(60, w / 4)}" height="${Math.min(80, h - 50)}" rx="4" fill="rgba(255,255,255,0.1)" />
                <rect x="${x + 16 + Math.min(60, w / 4) + 12}" y="${y + 40}" width="${Math.min(60, w / 4)}" height="${Math.min(80, h - 50)}" rx="4" fill="rgba(255,255,255,0.1)" />
            </g>`);
        } else if (el.type === 'poll') {
            const accent = escapeXml(el.poll?.accent || '#a78bfa');
            const rowHeight = h * .18;
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bgFill !== 'none' ? escapeXml(bgFill) : 'rgba(13,17,23,0.85)'}"${strokeAttr} />
                <text x="${x + w * .03}" y="${y + h * .17}" fill="${escapeXml(style.color || '#fff')}" font-family="sans-serif" font-size="${h * .1}" font-weight="700">Poll question</text>
                ${[.65, .25, .1].map((fraction, i) => `<rect x="${x + w * .03}" y="${y + h * .3 + i * rowHeight}" width="${w * .94 * fraction}" height="${h * .05}" rx="2" fill="${accent}" />`).join('')}
            </g>`);
        } else if (el.type === 'progress') {
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bgFill !== 'none' ? escapeXml(bgFill) : 'rgba(15, 23, 42, 0.6)'}" stroke="${borderWidth > 0 && borderStroke ? escapeXml(borderStroke) : 'rgba(255,255,255,0.15)'}" stroke-width="${Math.max(1, borderWidth)}"${strokeDashAttr} />
                <rect x="${x + 8}" y="${y + h / 2 - 4}" width="${w - 16}" height="8" rx="4" fill="rgba(255,255,255,0.18)" />
                <rect x="${x + 8}" y="${y + h / 2 - 4}" width="${(w - 16) * 0.65}" height="8" rx="4" fill="#3fb950" />
                <text x="${x + w / 2}" y="${y + h / 2 - 10}" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">65%</text>
            </g>`);
        } else if (el.type === 'qr') {
            elementsSvg.push(`<g${opacityAttr}${transform}>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#ffffff" stroke="${borderWidth > 0 && borderStroke ? escapeXml(borderStroke) : 'none'}" stroke-width="${borderWidth}"${strokeDashAttr} />
                <rect x="${x + 8}" y="${y + 8}" width="${w / 3}" height="${h / 3}" fill="#000000" />
                <rect x="${x + w - 8 - w / 3}" y="${y + 8}" width="${w / 3}" height="${h / 3}" fill="#000000" />
                <rect x="${x + 8}" y="${y + h - 8 - h / 3}" width="${w / 3}" height="${h / 3}" fill="#000000" />
            </g>`);
        } else {
            if (bgFill !== 'none' || borderWidth > 0) {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${escapeXml(bgFill)}"${strokeAttr}${opacityAttr}${transform} />`);
            } else {
                elementsSvg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" stroke-width="1"${opacityAttr}${transform} />`);
            }
            if (el.name) {
                elementsSvg.push(`<text x="${x + w / 2}" y="${y + h / 2 + 4}" fill="rgba(255,255,255,0.7)" font-family="-apple-system, system-ui, sans-serif" font-size="12" font-weight="500" text-anchor="middle"${opacityAttr}${transform}>${escapeXml(el.name)}</text>`);
            }
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
        ${defs.join('\n        ')}
    </defs>
    ${elementsSvg.join('\n    ')}
</svg>`;
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
    const customOverlayThumbnailsDir = path.join(dataDir, 'custom-overlay-thumbnails');

    try {
        if (!fs.existsSync(customOverlayThumbnailsDir)) {
            fs.mkdirSync(customOverlayThumbnailsDir, { recursive: true });
        }
    } catch {}

    function getOverlayThumbnailPath(id) {
        const cleanId = sanitizeOverlayId(id);
        if (!cleanId) return null;
        const webp = path.join(customOverlayThumbnailsDir, `${cleanId}.webp`);
        if (fs.existsSync(webp)) return { path: webp, mime: 'image/webp' };
        const png = path.join(customOverlayThumbnailsDir, `${cleanId}.png`);
        if (fs.existsSync(png)) return { path: png, mime: 'image/png' };
        const svg = path.join(customOverlayThumbnailsDir, `${cleanId}.svg`);
        if (fs.existsSync(svg)) return { path: svg, mime: 'image/svg+xml; charset=utf-8' };
        return null;
    }

    function deleteOverlayThumbnail(id) {
        const cleanId = sanitizeOverlayId(id);
        if (!cleanId) return;
        for (const ext of ['.webp', '.png', '.svg', '.jpg', '.jpeg']) {
            try {
                const p = path.join(customOverlayThumbnailsDir, `${cleanId}${ext}`);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch {}
        }
    }

    function renameOverlayThumbnail(oldId, newId) {
        const cleanOld = sanitizeOverlayId(oldId);
        const cleanNew = sanitizeOverlayId(newId);
        if (!cleanOld || !cleanNew) return;
        for (const ext of ['.webp', '.png', '.svg', '.jpg', '.jpeg']) {
            try {
                const oldPath = path.join(customOverlayThumbnailsDir, `${cleanOld}${ext}`);
                const newPath = path.join(customOverlayThumbnailsDir, `${cleanNew}${ext}`);
                if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
            } catch {}
        }
    }

    function saveOverlayThumbnail(id, dataUrlOrBuffer) {
        const cleanId = sanitizeOverlayId(id);
        if (!cleanId || !dataUrlOrBuffer) return false;
        try {
            fs.mkdirSync(customOverlayThumbnailsDir, { recursive: true });
            if (typeof dataUrlOrBuffer === 'string') {
                const match = dataUrlOrBuffer.match(/^data:image\/(webp|png|jpeg|svg\+xml);base64,(.+)$/);
                if (match) {
                    const ext = match[1] === 'svg+xml' ? '.svg' : match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`;
                    const buf = Buffer.from(match[2], 'base64');
                    fs.writeFileSync(path.join(customOverlayThumbnailsDir, `${cleanId}${ext}`), buf);
                    return true;
                }
                if (dataUrlOrBuffer.trim().startsWith('<svg')) {
                    fs.writeFileSync(path.join(customOverlayThumbnailsDir, `${cleanId}.svg`), dataUrlOrBuffer, 'utf8');
                    return true;
                }
            } else if (Buffer.isBuffer(dataUrlOrBuffer)) {
                fs.writeFileSync(path.join(customOverlayThumbnailsDir, `${cleanId}.webp`), dataUrlOrBuffer);
                return true;
            }
        } catch (err) {
            warn('[Overlays] Could not save overlay thumbnail:', err.message);
        }
        return false;
    }

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
                if (Array.isArray(data) && data.length) {
                    return data.map(normalizeRandomizerPreset).filter(Boolean);
                }
            }
        } catch (e) {
            warn('[Randomizer] Error loading presets:', e.message);
        }
        const defaults = DEFAULT_RANDOMIZER_PRESETS.map(normalizeRandomizerPreset).filter(Boolean);
        safeWriteFileSync(randomizerPresetsPath, JSON.stringify(defaults, null, 2));
        return defaults;
    }

    function saveRandomizerPresets(presets) {
        try {
            const normalized = Array.isArray(presets) ? presets.map(normalizeRandomizerPreset).filter(Boolean) : [];
            safeWriteFileSync(randomizerPresetsPath, JSON.stringify(normalized, null, 2));
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

    function pollResultsSeconds(overlay, page) {
        return overlay.elements.reduce((seconds, element) => {
            if (element.type !== 'poll' || element.visible === false || (element.page !== page.id && element.page !== '*')) return seconds;
            return Math.max(seconds, normalizePollSettings(element.poll).resultsSeconds);
        }, 0);
    }

    function returnFromTakeover(overlay, state) {
        clearTimeout(state.takeoverTimer);
        state.takeoverTimer = null;
        if (overlay.pages.items.some(p => p.id === state.returnPage && p.enabled)) state.page = state.returnPage;
        state.returnPage = null;
        scheduleAutoAdvance(overlay);
        broadcastPage(overlay);
    }

    function scheduleTakeoverReturn(overlay, state, ms) {
        clearTimeout(state.takeoverTimer);
        state.takeoverTimer = setTimeout(() => {
            const live = customOverlays[overlay.id];
            if (live) returnFromTakeover(live, state);
        }, ms);
        state.takeoverTimer.unref?.();
    }

    function takeoverPages(kind, name, ms, poll = {}) {
        for (const overlay of Object.values(customOverlays)) {
            if (!overlay.pages?.enabled) continue;
            const target = overlay.pages.items.find(p => p.enabled && p.trigger === kind && (kind === 'featured' || (kind === 'alert' ? !p.triggerRules.length || p.triggerRules.includes(name) : !p.triggerName || p.triggerName === String(name || '').toLowerCase())));
            if (!target) {
                if (kind === 'poll-end') {
                    const state = overlayPageState.get(overlay.id);
                    if (state && state.takeoverTimer) {
                        const curPage = overlay.pages.items.find(p => p.id === state.page);
                        if (curPage && curPage.trigger === 'poll-active') {
                            const resultsSeconds = curPage.triggerSeconds ? 0 : pollResultsSeconds(overlay, curPage);
                            const endedAt = Date.parse(poll.endedAt);
                            const remaining = (Number.isFinite(endedAt) ? endedAt : Date.now()) + resultsSeconds * 1000 - Date.now();
                            if (resultsSeconds && remaining > 0) {
                                scheduleTakeoverReturn(overlay, state, remaining);
                            } else {
                                returnFromTakeover(overlay, state);
                            }
                        }
                    }
                }
                continue;
            }
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
            // Twitch is polled every 10s: keep the active page mounted while waiting for its final result.
            const pollGraceMs = kind === 'poll-active' && !target.triggerSeconds && pollResultsSeconds(overlay, target) > 0 ? 30000 : 0;
            scheduleTakeoverReturn(overlay, state, seconds * 1000 + pollGraceMs);
            broadcastPage(overlay);
        }
    }

    function dropOverlayPages(id) {
        const state = overlayPageState.get(id);
        if (state) {
            clearTimeout(state.timer);
            clearTimeout(state.takeoverTimer);
        }
        overlayPageState.delete(id);
    }

    function stop() {
        for (const id of overlayPageState.keys()) dropOverlayPages(id);
    }

    function start() {
        for (const overlay of Object.values(customOverlays)) syncOverlayPages(overlay);
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
        normalizeRetro,
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
        // Thumbnail helpers
        generateSvgThumbnail: (overlay, opts = {}) => generateSvgThumbnail(overlay, {
            customOverlayAssetsDir,
            activePage: overlayPageState.get(overlay?.id)?.page,
            ...opts
        }),
        getOverlayPageState: (id) => overlayPageState.get(id),
        start,
        stop,
        getOverlayThumbnailPath,
        saveOverlayThumbnail,
        deleteOverlayThumbnail,
        renameOverlayThumbnail,
        customOverlayThumbnailsDir,
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
        DEFAULT_RANDOMIZER_QUOTE_PRESETS,
        normalizeRandomizerPreset,
        getEffectiveWeights,
        pickWeightedWinner,
        updatePresetWeightsAfterSpin,
        resetPresetWeights
    };
}

module.exports = {
    createOverlayService,
    generateSvgThumbnail,
    normalizeGradient,
    normalizeMediaFilter,
    normalizeRetro,
    normalizeAssetTagList,
    normalizeOverlayElement,
    normalizePages,
    normalizeCustomOverlay,
    normalizeOverlayPresets,
    normalizeRandomizerPreset,
    getEffectiveWeights,
    pickWeightedWinner,
    updatePresetWeightsAfterSpin,
    resetPresetWeights,
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
