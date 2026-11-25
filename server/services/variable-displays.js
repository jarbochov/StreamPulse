const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { normalizeDisplay } = require('../../shared/variable-displays.cjs');
const { normalizeBadge } = require('./display-badges');

module.exports = function createVariableDisplays({ dataDir, onChange = () => {}, getDependencies = () => [] }) {
    const file = path.join(dataDir, 'variable-displays.json');
    const bingoFile = path.join(dataDir, 'bingo-state.json');
    let displays = [];
    let bingoState = {};
    let revision = Date.now();
    const copy = value => globalThis.structuredClone(value);
    const normalize = (input, id) => {
        const display = normalizeDisplay(input, id);
        if (display.kind === 'badge') display.badge = normalizeBadge(input.badge);
        return display;
    };
    function reload() {
        let raw;
        try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { raw = []; }
        displays = (Array.isArray(raw) ? raw : []).slice(0, 100).flatMap(input => {
            try { return [normalize(input)]; } catch { return []; }
        });
        try {
            const rawBingo = JSON.parse(fs.readFileSync(bingoFile, 'utf8'));
            bingoState = rawBingo && typeof rawBingo === 'object' && !Array.isArray(rawBingo) ? rawBingo : {};
        } catch { bingoState = {}; }
        revision = Date.now();
    }
    function persist(next) {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
        fs.renameSync(`${file}.tmp`, file);
        displays = next;
        revision = Math.max(Date.now(), revision + 1);
        onChange({ displays: copy(displays), bingoState: copy(bingoState), revision });
    }
    function persistBingo(next) {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${bingoFile}.tmp`, JSON.stringify(next, null, 2));
        fs.renameSync(`${bingoFile}.tmp`, bingoFile);
        bingoState = next;
        revision = Math.max(Date.now(), revision + 1);
        onChange({ displays: copy(displays), bingoState: copy(bingoState), revision });
    }
    reload();
    return {
        reload,
        getState: () => ({ displays: copy(displays), bingoState: copy(bingoState), revision }),
        getRevision: () => revision,
        get(id) { return copy(displays.find(display => display.id === id) || null); },
        getBingoState(id) {
            const cur = bingoState[id] || { stamped: [], order: [] };
            return copy({ stamped: Array.isArray(cur.stamped) ? cur.stamped : [], order: Array.isArray(cur.order) ? cur.order : [] });
        },
        toggleBingoCell(id, cellIndex, forceState = undefined) {
            const display = displays.find(d => d.id === id && d.kind === 'bingo');
            if (!display) throw new Error('Bingo display not found');
            const maxCells = (display.bingo?.size || 5) ** 2;
            const cell = Number(cellIndex);
            if (!Number.isInteger(cell) || cell < 0 || cell >= maxCells) throw new Error('Invalid bingo cell index');
            const cur = this.getBingoState(id);
            const set = new Set(cur.stamped);
            const nextOn = forceState !== undefined ? Boolean(forceState) : !set.has(cell);
            if (nextOn) set.add(cell);
            else set.delete(cell);
            const updated = { ...cur, stamped: [...set].sort((a, b) => a - b) };
            persistBingo({ ...bingoState, [id]: updated });
            return copy(updated);
        },
        shuffleBingo(id, poolLength = 0) {
            const display = displays.find(d => d.id === id && d.kind === 'bingo');
            if (!display) throw new Error('Bingo display not found');
            const len = Math.max(1, Number(poolLength) || (display.bingo?.items?.length || 25));
            const order = Array.from({ length: len }, (_, i) => i);
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
            const updated = { stamped: [], order };
            persistBingo({ ...bingoState, [id]: updated });
            return copy(updated);
        },
        resetBingo(id) {
            const display = displays.find(d => d.id === id && d.kind === 'bingo');
            if (!display) throw new Error('Bingo display not found');
            const cur = this.getBingoState(id);
            const updated = { ...cur, stamped: [] };
            persistBingo({ ...bingoState, [id]: updated });
            return copy(updated);
        },
        dependencies(id) {
            if (!displays.some(display => display.id === id)) throw new Error('Display not found');
            return copy(getDependencies(id));
        },
        save(input, id = input.id || randomUUID()) {
            const display = normalize(input, id);
            const needsCatalog = (display.kind === 'counter' && display.counter?.sourceMode === 'set')
                || (display.kind === 'meter' && display.meter?.sourceMode === 'set')
                || (display.kind === 'ticker' && display.ticker?.sourceMode === 'set')
                || (display.kind === 'bingo' && display.bingo?.sourceMode === 'set')
                || !['counter', 'meter', 'ticker', 'bingo'].includes(display.kind);
            if (!display.id || (needsCatalog && !display.catalogId)) throw new Error('Choose an item catalog and a display ID');
            if (display.id !== id) throw new Error('Invalid display ID');
            if (!displays.some(item => item.id === display.id) && displays.length >= 100) throw new Error('Display library is full');
            persist([...displays.filter(item => item.id !== display.id), display]);
            return copy(display);
        },
        remove(id) {
            if (!displays.some(display => display.id === id)) throw new Error('Display not found');
            const dependencies = getDependencies(id);
            if (dependencies.length) {
                const error = new Error(`Display is in use: ${dependencies.map(item => item.label).join('; ')}. Remove or replace these placements first.`);
                error.dependencies = copy(dependencies);
                error.statusCode = 409;
                throw error;
            }
            persist(displays.filter(display => display.id !== id));
        },
        reset() { persist([]); }
    };
};
