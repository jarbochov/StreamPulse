const MP_BINGO_SIZES = [3, 4, 5];
const MP_BINGO_CLAIM_MODES = ['independent', 'lockout'];
const MP_BINGO_VIEWS = ['multi', 'lockout', 'standings', 'single'];
const MP_BINGO_THEMES = ['modern', 'esports', 'sports', 'arcade', 'minimal', 'cozy', 'synthwave'];
const MP_BINGO_STAMP_STYLES = ['dauber', 'check', 'x', 'star', 'fill'];
const MP_BINGO_SHADOWS = ['none', 'soft', 'medium', 'heavy', 'neon'];
const MP_BINGO_PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

const MP_BINGO_THEME_PRESETS = {
    modern: {
        boardBackground: '#0f172ad9',
        cellBackground: '#1e293bcc',
        textColor: '#f8fafc',
        borderColor: '#ffffff26',
        bingoColor: '#22c55e',
        shadow: 'soft',
        backdropBlur: 8
    },
    esports: {
        boardBackground: '#090d16eb',
        cellBackground: '#111827e6',
        textColor: '#f8fafc',
        borderColor: '#38bdf844',
        bingoColor: '#38bdf8',
        shadow: 'heavy',
        backdropBlur: 4
    },
    sports: {
        boardBackground: '#0b192ce8',
        cellBackground: '#152a45d9',
        textColor: '#ffffff',
        borderColor: '#fbbf2466',
        bingoColor: '#fbbf24',
        shadow: 'medium',
        backdropBlur: 0
    },
    arcade: {
        boardBackground: '#120724eb',
        cellBackground: '#1f0d3dd9',
        textColor: '#fdf4ff',
        borderColor: '#e879f955',
        bingoColor: '#facc15',
        shadow: 'neon',
        backdropBlur: 4
    },
    minimal: {
        boardBackground: '#00000000',
        cellBackground: '#0f172aa6',
        textColor: '#ffffff',
        borderColor: '#ffffff33',
        bingoColor: '#4ade80',
        shadow: 'none',
        backdropBlur: 0
    },
    cozy: {
        boardBackground: '#29201be6',
        cellBackground: '#3b2e26d9',
        textColor: '#fef3c7',
        borderColor: '#f59e0b44',
        bingoColor: '#84cc16',
        shadow: 'soft',
        backdropBlur: 6
    },
    synthwave: {
        boardBackground: '#16082be8',
        cellBackground: '#261147d9',
        textColor: '#f0abfc',
        borderColor: '#22d3ee66',
        bingoColor: '#22d3ee',
        shadow: 'neon',
        backdropBlur: 8
    }
};

const DEFAULT_PROMPTS = [
    'First Try Clear', 'Secret Room Found', 'No-Hit Boss', 'Chat Backseats', 'Clutch 1 HP Save',
    'Menu Misclick', 'Wrong Button', 'Unexpected Softlock', 'Audio Check', 'Hydration Break',
    'New PB Split', 'Golden Item', 'Fall Off Edge', 'RNG Blessing', 'RNG Curse',
    'Skip Discovered', 'Hype Train', 'Sub Goal Hit', 'Sound Alert Scare', 'Victory Emote',
    'Speedrun Strat', 'Co-Op Chaos', 'Plot Twist', 'Perfect Parry', 'Bonus Stage'
];

function clamp(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function cleanColor(val, fallback) {
    const s = String(val ?? '').trim();
    return s && s.length <= 64 ? s : fallback;
}

function sanitizeId(raw, fallback = 'pack-default') {
    const cleaned = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return cleaned || fallback;
}

function defaultPack(id = 'default-race') {
    return {
        id,
        name: 'Stream Night Race',
        size: 5,
        freeSpace: true,
        freeSpaceLabel: 'FREE',
        claimMode: 'lockout',
        headerText: 'BINGO',
        prompts: [...DEFAULT_PROMPTS]
    };
}

function normalizePack(input = {}, fallbackId = 'pack') {
    const src = input && typeof input === 'object' ? input : {};
    const size = MP_BINGO_SIZES.includes(Number(src.size)) ? Number(src.size) : 5;
    const rawPrompts = Array.isArray(src.prompts)
        ? src.prompts
        : typeof src.prompts === 'string'
            ? src.prompts.split(/\r?\n/)
            : [];
    const prompts = rawPrompts
        .map(p => String(p ?? '').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 200);
    return {
        id: sanitizeId(src.id, fallbackId),
        name: String(src.name || 'Untitled Bingo Pack').trim().slice(0, 80) || 'Untitled Bingo Pack',
        size,
        freeSpace: src.freeSpace !== false,
        freeSpaceLabel: String(src.freeSpaceLabel ?? 'FREE').trim().slice(0, 24) || 'FREE',
        claimMode: MP_BINGO_CLAIM_MODES.includes(src.claimMode) ? src.claimMode : 'lockout',
        headerText: String(src.headerText ?? 'BINGO').trim().slice(0, 40),
        prompts: prompts.length ? prompts : [...DEFAULT_PROMPTS]
    };
}

function defaultAppearance() {
    return {
        theme: 'modern',
        stampStyle: 'dauber',
        defaultView: 'multi',
        boardBackground: MP_BINGO_THEME_PRESETS.modern.boardBackground,
        cellBackground: MP_BINGO_THEME_PRESETS.modern.cellBackground,
        textColor: MP_BINGO_THEME_PRESETS.modern.textColor,
        borderColor: MP_BINGO_THEME_PRESETS.modern.borderColor,
        bingoColor: MP_BINGO_THEME_PRESETS.modern.bingoColor,
        fontFamily: 'system-ui',
        fontWeight: 700,
        fontSize: 13,
        uppercaseHeaders: false,
        radius: 10,
        borderWidth: 2,
        cellGap: 6,
        padding: 12,
        outerMargin: 16,
        shadow: 'soft',
        backdropBlur: 8,
        scale: 1,
        showMultiLabels: false,
        showPlayerNames: true,
        showScores: true,
        showBingoBanner: true,
        bingoBannerText: 'BINGO!',
        showFreeMarker: true,
        animate: true
    };
}

function normalizeAppearance(input = {}) {
    const base = defaultAppearance();
    const src = input && typeof input === 'object' ? input : {};
    const theme = MP_BINGO_THEMES.includes(src.theme) ? src.theme : base.theme;
    const preset = MP_BINGO_THEME_PRESETS[theme] || MP_BINGO_THEME_PRESETS.modern;
    return {
        theme,
        stampStyle: MP_BINGO_STAMP_STYLES.includes(src.stampStyle) ? src.stampStyle : base.stampStyle,
        defaultView: MP_BINGO_VIEWS.includes(src.defaultView) ? src.defaultView : base.defaultView,
        boardBackground: cleanColor(src.boardBackground, preset.boardBackground),
        cellBackground: cleanColor(src.cellBackground, preset.cellBackground),
        textColor: cleanColor(src.textColor, preset.textColor),
        borderColor: cleanColor(src.borderColor, preset.borderColor),
        bingoColor: cleanColor(src.bingoColor, preset.bingoColor),
        fontFamily: String(src.fontFamily || base.fontFamily).trim().slice(0, 64) || base.fontFamily,
        fontWeight: clamp(src.fontWeight, 400, 900, base.fontWeight),
        fontSize: clamp(src.fontSize, 9, 32, base.fontSize),
        uppercaseHeaders: Boolean(src.uppercaseHeaders),
        radius: clamp(src.radius, 0, 28, base.radius),
        borderWidth: clamp(src.borderWidth, 0, 6, base.borderWidth),
        cellGap: clamp(src.cellGap, 2, 18, base.cellGap),
        padding: clamp(src.padding, 4, 36, base.padding),
        outerMargin: clamp(src.outerMargin, 0, 48, base.outerMargin),
        shadow: MP_BINGO_SHADOWS.includes(src.shadow) ? src.shadow : (preset.shadow || base.shadow),
        backdropBlur: clamp(src.backdropBlur, 0, 24, preset.backdropBlur ?? base.backdropBlur),
        scale: clamp(src.scale, 0.5, 1.6, base.scale),
        showMultiLabels: Boolean(src.showMultiLabels),
        showPlayerNames: src.showPlayerNames !== false,
        showScores: src.showScores !== false,
        showBingoBanner: src.showBingoBanner !== false,
        bingoBannerText: String(src.bingoBannerText ?? base.bingoBannerText).trim().slice(0, 32) || 'BINGO!',
        showFreeMarker: src.showFreeMarker !== false,
        animate: src.animate !== false
    };
}

function detectBingoLines(size, stampedSet, { fourCorners = false } = {}) {
    const lines = [];
    for (let r = 0; r < size; r++) {
        const row = [];
        for (let c = 0; c < size; c++) row.push(r * size + c);
        if (row.every(i => stampedSet.has(i))) lines.push(row);
    }
    for (let c = 0; c < size; c++) {
        const col = [];
        for (let r = 0; r < size; r++) col.push(r * size + c);
        if (col.every(i => stampedSet.has(i))) lines.push(col);
    }
    const d1 = [];
    const d2 = [];
    for (let i = 0; i < size; i++) {
        d1.push(i * size + i);
        d2.push(i * size + (size - 1 - i));
    }
    if (d1.every(i => stampedSet.has(i))) lines.push(d1);
    if (d2.every(i => stampedSet.has(i))) lines.push(d2);
    if (fourCorners && size >= 2) {
        const corners = [0, size - 1, size * (size - 1), size * size - 1];
        if (corners.every(i => stampedSet.has(i))) lines.push(corners);
    }
    return lines;
}

function resolvePlayerCard(packInput, card, claims = {}, cardsById = {}, { fourCorners = false } = {}) {
    const pack = normalizePack(packInput);
    const size = pack.size;
    const total = size * size;
    const centerIdx = size % 2 === 1 ? Math.floor(total / 2) : -1;
    const hasFree = pack.freeSpace && centerIdx >= 0;
    const isLockout = pack.claimMode === 'lockout';
    const order = Array.isArray(card.order) ? card.order : [];
    const stampedArr = Array.isArray(card.stamped) ? card.stamped : [];
    const stampedSet = new Set(stampedArr.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < total));
    if (hasFree) stampedSet.add(centerIdx);

    const cells = [];
    let poolCursor = 0;
    for (let i = 0; i < total; i++) {
        if (hasFree && i === centerIdx) {
            cells.push({
                index: i,
                promptIndex: -1,
                label: pack.freeSpaceLabel || 'FREE',
                isFree: true,
                stamped: true,
                claimedBy: null,
                lockedByOther: false,
                winning: false
            });
            continue;
        }
        const promptIndex = order[poolCursor] !== undefined ? Number(order[poolCursor]) : poolCursor;
        poolCursor++;
        const label = pack.prompts[promptIndex] || `Square ${i + 1}`;
        let stamped = stampedSet.has(i);
        let claimedBy = null;
        let lockedByOther = false;
        if (isLockout) {
            const claim = claims[String(promptIndex)];
            if (claim) {
                const owner = cardsById[claim.cardId];
                claimedBy = owner ? { cardId: owner.id, name: owner.name, color: owner.color } : { cardId: claim.cardId, name: 'Player', color: '#94a3b8' };
                stamped = claim.cardId === card.id;
                lockedByOther = claim.cardId !== card.id;
                if (stamped) stampedSet.add(i);
                else stampedSet.delete(i);
            } else {
                stamped = false;
                stampedSet.delete(i);
            }
        }
        cells.push({
            index: i,
            promptIndex,
            label,
            isFree: false,
            stamped,
            claimedBy,
            lockedByOther,
            winning: false
        });
    }

    const winningLines = detectBingoLines(size, stampedSet, { fourCorners });
    const winningCells = new Set(winningLines.flat());
    for (const c of cells) c.winning = winningCells.has(c.index);

    return {
        id: card.id,
        name: card.name,
        color: card.color,
        size,
        total,
        cells,
        stampedCount: cells.filter(c => c.stamped).length,
        winningLines,
        bingoCount: winningLines.length
    };
}

function resolveLockoutBoard(packInput, cards = [], claims = {}) {
    const pack = normalizePack(packInput);
    const size = pack.size;
    const total = size * size;
    const cardsById = Object.fromEntries(cards.map(c => [c.id, c]));
    const cells = [];
    for (let i = 0; i < total; i++) {
        const claim = claims[String(i)];
        const owner = claim ? cardsById[claim.cardId] : null;
        cells.push({
            index: i,
            promptIndex: i,
            label: pack.prompts[i] || `Square ${i + 1}`,
            claimedBy: owner ? { cardId: owner.id, name: owner.name, color: owner.color } : null
        });
    }
    return { size, total, cells };
}

function resolveStandings(packInput, cards = [], claims = {}, { fourCorners = false } = {}) {
    const pack = normalizePack(packInput);
    const cardsById = Object.fromEntries(cards.map(c => [c.id, c]));
    return cards
        .map(card => {
            const resolved = resolvePlayerCard(pack, card, claims, cardsById, { fourCorners });
            return {
                id: card.id,
                name: card.name,
                color: card.color,
                stampedCount: resolved.stampedCount,
                total: resolved.total,
                bingoCount: resolved.bingoCount
            };
        })
        .sort((a, b) => (b.bingoCount - a.bingoCount) || (b.stampedCount - a.stampedCount) || a.name.localeCompare(b.name));
}

module.exports = {
    MP_BINGO_SIZES,
    MP_BINGO_CLAIM_MODES,
    MP_BINGO_VIEWS,
    MP_BINGO_THEMES,
    MP_BINGO_STAMP_STYLES,
    MP_BINGO_SHADOWS,
    MP_BINGO_PLAYER_COLORS,
    MP_BINGO_THEME_PRESETS,
    DEFAULT_PROMPTS,
    defaultPack,
    normalizePack,
    defaultAppearance,
    normalizeAppearance,
    detectBingoLines,
    resolvePlayerCard,
    resolveLockoutBoard,
    resolveStandings
};
