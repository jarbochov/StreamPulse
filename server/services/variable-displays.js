const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { normalizeDisplay } = require('../../shared/variable-displays.cjs');
const { normalizeBadge } = require('./display-badges');

module.exports = function createVariableDisplays({ dataDir, onChange = () => {}, getDependencies = () => [] }) {
    const file = path.join(dataDir, 'variable-displays.json');
    let displays = [];
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
        revision = Date.now();
    }
    function persist(next) {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
        fs.renameSync(`${file}.tmp`, file);
        displays = next;
        revision = Math.max(Date.now(), revision + 1);
        onChange({ displays: copy(displays), revision });
    }
    reload();
    return {
        reload,
        getState: () => ({ displays: copy(displays), revision }),
        getRevision: () => revision,
        get(id) { return copy(displays.find(display => display.id === id) || null); },
        dependencies(id) {
            if (!displays.some(display => display.id === id)) throw new Error('Display not found');
            return copy(getDependencies(id));
        },
        save(input, id = input.id || randomUUID()) {
            const display = normalize(input, id);
            const needsCatalog = (display.kind === 'counter' && display.counter?.sourceMode === 'set')
                || (display.kind === 'meter' && display.meter?.sourceMode === 'set')
                || (display.kind === 'ticker' && display.ticker?.sourceMode === 'set')
                || !['counter', 'meter', 'ticker'].includes(display.kind);
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
