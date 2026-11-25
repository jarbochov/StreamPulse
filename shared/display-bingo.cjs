'use strict';

const { COUNTER_THEME_PRESETS } = require('./display-counter.cjs');

const BINGO_SIZES = [3, 4, 5];
const BINGO_STAMP_STYLES = ['check', 'x', 'dauber', 'fill', 'star'];
const BINGO_THEMES = ['modern', 'esports', 'sports', 'arcade', 'minimal', 'cozy', 'chalkboard'];

const VAR_TOKEN_RE = /^(?:\{\{[a-z0-9_.:-]{1,80}\}\}|@[a-z0-9_-]{1,60})$/i;
const cleanKey = value => String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
const cleanVarName = value => String(value || '').replace(/[^a-z0-9_.-]/gi, '').slice(0, 80);
const cleanText = (value, limit = 80) => String(value ?? '').trim().slice(0, limit);
const bound = (value, fallback, min, max) => (
    Number.isFinite(Number(value)) && value !== '' && value != null
        ? Math.min(max, Math.max(min, Number(value)))
        : fallback
);
const cleanColor = (value, fallback) => {
    const str = String(value || '').trim();
    if (/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(str) || VAR_TOKEN_RE.test(str)) return str;
    return fallback;
};

const DEFAULT_BINGO_ITEMS = [
    'Chat calls a clutch', 'Mic muted moment', 'First try win', 'Unexpected jump scare', 'Raid arrives',
    'Hydration check', 'Physics glitch', 'Boss phase 2', 'Backseat gamer', 'Perfect parry',
    'Menu music jam', 'Zero deaths', 'FREE', 'Chat poll tie', 'Secret room found',
    'Controller disconnect', 'Clip-worthy fail', 'Sudden plot twist', 'Clutch heal', 'New personal best',
    'Snack break', 'NPC blocks door', 'Voice crack', 'Speedrun strat', 'Victory dance'
];

function defaultDisplayBingo() {
    return {
        sourceMode: 'custom',
        items: [...DEFAULT_BINGO_ITEMS],
        listVariable: '',
        labelField: '$label',
        imageField: '',
        size: 5,
        freeSpace: true,
        freeSpaceLabel: 'FREE',
        showHeader: true,
        headerText: 'BINGO',
        showBingoBanner: true,
        bingoBannerText: 'BINGO!',
        stampStyle: 'dauber',
        theme: 'modern',
        showImages: true,
        boardBackground: '#0f172ad9',
        cellBackground: '#1e293bcc',
        stampedBackground: '#f43f5e33',
        stampColor: '#f43f5e',
        bingoColor: '#22c55e',
        textColor: '#f8fafc',
        borderColor: '#ffffff26',
        headerBackground: '#f43f5e',
        headerTextColor: '#ffffff',
        borderWidth: 1,
        radius: 10,
        cellGap: 6,
        padding: 12,
        fontSize: 13,
        fontFamily: 'sans-serif'
    };
}

function normalizeDisplayBingo(input = {}) {
    const def = defaultDisplayBingo();
    const size = BINGO_SIZES.includes(Number(input.size)) ? Number(input.size) : def.size;
    const rawItems = Array.isArray(input.items)
        ? input.items
        : (typeof input.items === 'string' ? input.items.split(/\r?\n/) : def.items);
    const items = rawItems.map(s => String(s ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 60);
    const rawLabelField = String(input.labelField || '$label').trim();
    const labelField = rawLabelField === '$label' ? '$label' : (cleanKey(rawLabelField) || '$label');

    return {
        sourceMode: ['custom', 'list', 'set'].includes(input.sourceMode) ? input.sourceMode : def.sourceMode,
        items: items.length ? items : [...DEFAULT_BINGO_ITEMS],
        listVariable: cleanVarName(input.listVariable),
        labelField,
        imageField: cleanKey(input.imageField),
        size,
        freeSpace: input.freeSpace !== false,
        freeSpaceLabel: cleanText(input.freeSpaceLabel ?? def.freeSpaceLabel, 24) || 'FREE',
        showHeader: input.showHeader !== false,
        headerText: cleanText(input.headerText ?? def.headerText, 32),
        showBingoBanner: input.showBingoBanner !== false,
        bingoBannerText: cleanText(input.bingoBannerText ?? def.bingoBannerText, 32) || 'BINGO!',
        stampStyle: BINGO_STAMP_STYLES.includes(input.stampStyle) ? input.stampStyle : def.stampStyle,
        theme: BINGO_THEMES.includes(input.theme) ? input.theme : def.theme,
        showImages: input.showImages !== false,
        boardBackground: cleanColor(input.boardBackground, def.boardBackground),
        cellBackground: cleanColor(input.cellBackground, def.cellBackground),
        stampedBackground: cleanColor(input.stampedBackground, def.stampedBackground),
        stampColor: cleanColor(input.stampColor, def.stampColor),
        bingoColor: cleanColor(input.bingoColor, def.bingoColor),
        textColor: cleanColor(input.textColor, def.textColor),
        borderColor: cleanColor(input.borderColor, def.borderColor),
        headerBackground: cleanColor(input.headerBackground, def.headerBackground),
        headerTextColor: cleanColor(input.headerTextColor, def.headerTextColor),
        borderWidth: bound(input.borderWidth, def.borderWidth, 0, 6),
        radius: Math.round(bound(input.radius, def.radius, 0, 32)),
        cellGap: Math.round(bound(input.cellGap, def.cellGap, 0, 24)),
        padding: Math.round(bound(input.padding, def.padding, 0, 40)),
        fontSize: Math.round(bound(input.fontSize, def.fontSize, 9, 42)),
        fontFamily: cleanText(input.fontFamily, 120).replace(/[;<>]/g, '') || def.fontFamily
    };
}

function detectBingoLines(size, stampedSet) {
    const lines = [];
    const winningCells = new Set();
    // Rows
    for (let r = 0; r < size; r++) {
        const row = [];
        for (let c = 0; c < size; c++) row.push(r * size + c);
        if (row.every(idx => stampedSet.has(idx))) {
            lines.push(row);
            row.forEach(idx => winningCells.add(idx));
        }
    }
    // Columns
    for (let c = 0; c < size; c++) {
        const col = [];
        for (let r = 0; r < size; r++) col.push(r * size + c);
        if (col.every(idx => stampedSet.has(idx))) {
            lines.push(col);
            col.forEach(idx => winningCells.add(idx));
        }
    }
    // Main diagonal
    const diag1 = [];
    for (let i = 0; i < size; i++) diag1.push(i * size + i);
    if (diag1.every(idx => stampedSet.has(idx))) {
        lines.push(diag1);
        diag1.forEach(idx => winningCells.add(idx));
    }
    // Anti-diagonal
    const diag2 = [];
    for (let i = 0; i < size; i++) diag2.push(i * size + (size - 1 - i));
    if (diag2.every(idx => stampedSet.has(idx))) {
        lines.push(diag2);
        diag2.forEach(idx => winningCells.add(idx));
    }
    return { lines, winningCells, count: lines.length };
}

function resolveBingoBoard(definition, binding = {}, status = {}, runtimeState = null) {
    const cfg = normalizeDisplayBingo(definition?.bingo);
    const size = cfg.size;
    const total = size * size;
    const centerIdx = size % 2 === 1 ? Math.floor(total / 2) : -1;
    const hasFreeCenter = cfg.freeSpace && centerIdx >= 0;

    const customVars = Array.isArray(status.customVars) ? status.customVars : (Array.isArray(status.variables) ? status.variables : []);
    const sets = Array.isArray(status.variableSets) ? status.variableSets : (Array.isArray(status.sets) ? status.sets : []);

    let pool = [];
    if (cfg.sourceMode === 'list' || binding?.variableName) {
        const varName = binding?.variableName || cfg.listVariable;
        const v = customVars.find(item => item.name === varName);
        const raw = Array.isArray(v?.items) ? v.items : String(v?.value ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        pool = raw.map((label, i) => ({ id: `l_${i}`, label: String(label), image: '' }));
    } else if (cfg.sourceMode === 'set') {
        const setId = binding?.setId || definition?.catalogId || '';
        const setObj = sets.find(s => s.id === setId);
        if (setObj) {
            const imgKey = cfg.imageField || (setObj.fields || []).find(f => f.type === 'image')?.key || '';
            pool = (setObj.roster || [])
                .filter(e => e.enabled !== false)
                .map(entry => ({
                    id: entry.id,
                    label: cfg.labelField === '$label' ? (entry.label || entry.id) : String(entry.values?.[cfg.labelField] ?? entry.label ?? entry.id),
                    image: cfg.showImages && imgKey ? String(entry.values?.[imgKey] ?? '').trim() : '',
                    entry
                }));
        }
    } else {
        pool = cfg.items.map((label, i) => ({ id: `c_${i}`, label, image: '' }));
    }

    const state = runtimeState || status?.bingoState?.[definition?.id] || { stamped: [], order: [] };
    const order = Array.isArray(state.order) && state.order.length === pool.length ? state.order : pool.map((_, i) => i);
    const orderedPool = order.map(idx => pool[idx]).filter(Boolean);

    const stampedSet = new Set(Array.isArray(state.stamped) ? state.stamped.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < total) : []);
    if (hasFreeCenter) stampedSet.add(centerIdx);

    const cells = [];
    let poolCursor = 0;
    for (let idx = 0; idx < total; idx++) {
        if (hasFreeCenter && idx === centerIdx) {
            cells.push({
                index: idx,
                label: cfg.freeSpaceLabel,
                image: '',
                isFree: true,
                stamped: true
            });
            continue;
        }
        const item = orderedPool[poolCursor++] || { id: `empty_${idx}`, label: `Square ${idx + 1}`, image: '' };
        cells.push({
            index: idx,
            label: item.label,
            image: item.image || '',
            entry: item.entry || null,
            isFree: false,
            stamped: stampedSet.has(idx)
        });
    }

    const bingo = detectBingoLines(size, stampedSet);
    for (const cell of cells) {
        cell.winning = bingo.winningCells.has(cell.index);
    }

    return {
        size,
        total,
        cells,
        stampedCount: stampedSet.size,
        bingoCount: bingo.count,
        winningLines: bingo.lines,
        poolLength: pool.length
    };
}

module.exports = {
    BINGO_SIZES,
    BINGO_STAMP_STYLES,
    BINGO_THEMES,
    BINGO_THEME_PRESETS: COUNTER_THEME_PRESETS,
    defaultDisplayBingo,
    normalizeDisplayBingo,
    detectBingoLines,
    resolveBingoBoard
};
