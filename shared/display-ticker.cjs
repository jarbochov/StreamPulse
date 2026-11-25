'use strict';

const { resolveDisplayOwner } = require('./display-source.cjs');

const TICKER_THEMES = ['esports', 'sports', 'modern', 'arcade', 'minimal'];
const TICKER_SEPARATORS = ['dot', 'diamond', 'slash', 'bar', 'none'];
const ROW_SCOPES = ['all', 'active', 'slots', 'group', 'group-slots'];

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

const TICKER_THEME_PRESETS = {
    esports: {
        label: 'Esports Broadcast',
        background: '#090d16eb',
        textColor: '#f8fafc',
        accentColor: '#38bdf8',
        badgeBackground: '#38bdf8',
        badgeTextColor: '#090d16',
        borderColor: '#38bdf844',
        borderWidth: 1,
        radius: 4
    },
    sports: {
        label: 'Broadcast Sports',
        background: '#0d1a33f2',
        textColor: '#ffffff',
        accentColor: '#f59e0b',
        badgeBackground: '#f59e0b',
        badgeTextColor: '#091122',
        borderColor: '#f59e0b55',
        borderWidth: 1,
        radius: 4
    },
    modern: {
        label: 'Modern Glass',
        background: '#0f172ad9',
        textColor: '#f8fafc',
        accentColor: '#818cf8',
        badgeBackground: '#6366f1',
        badgeTextColor: '#ffffff',
        borderColor: '#ffffff24',
        borderWidth: 1,
        radius: 10
    },
    arcade: {
        label: 'Retro Arcade',
        background: '#120824f2',
        textColor: '#fef08a',
        accentColor: '#e879f9',
        badgeBackground: '#e879f9',
        badgeTextColor: '#120824',
        borderColor: '#22d3ee99',
        borderWidth: 2,
        radius: 3
    },
    minimal: {
        label: 'Minimal HUD',
        background: '#00000000',
        textColor: '#ffffff',
        accentColor: '#38bdf8',
        badgeBackground: '#ffffff22',
        badgeTextColor: '#ffffff',
        borderColor: '#00000000',
        borderWidth: 0,
        radius: 0
    }
};

function defaultDisplayTicker() {
    return {
        sourceMode: 'list',
        listVariable: '',
        labelField: '$label',
        subField: '',
        imageField: '',
        rowScope: 'all',
        theme: 'esports',
        badgeText: 'LIVE',
        separator: 'diamond',
        direction: 'left',
        speed: 75,
        itemGap: 40,
        showImages: true,
        background: '#090d16eb',
        textColor: '#f8fafc',
        accentColor: '#38bdf8',
        badgeBackground: '#38bdf8',
        badgeTextColor: '#090d16',
        borderColor: '#38bdf844',
        borderWidth: 1,
        radius: 4,
        height: 48,
        fontSize: 16,
        fontFamily: 'sans-serif',
        maxItems: 40
    };
}

function normalizeDisplayTicker(input = {}) {
    const def = defaultDisplayTicker();
    const rawLabelField = String(input.labelField || '$label').trim();
    const labelField = rawLabelField === '$label' ? '$label' : (cleanKey(rawLabelField) || '$label');
    return {
        sourceMode: input.sourceMode === 'set' ? 'set' : 'list',
        listVariable: cleanVarName(input.listVariable),
        labelField,
        subField: cleanKey(input.subField),
        imageField: cleanKey(input.imageField),
        rowScope: ROW_SCOPES.includes(input.rowScope) ? input.rowScope : def.rowScope,
        theme: TICKER_THEMES.includes(input.theme) ? input.theme : def.theme,
        badgeText: cleanText(input.badgeText ?? def.badgeText, 32),
        separator: TICKER_SEPARATORS.includes(input.separator) ? input.separator : def.separator,
        direction: input.direction === 'right' ? 'right' : 'left',
        speed: Math.round(bound(input.speed, def.speed, 15, 240)),
        itemGap: Math.round(bound(input.itemGap, def.itemGap, 12, 160)),
        showImages: input.showImages !== false,
        background: cleanColor(input.background, def.background),
        textColor: cleanColor(input.textColor, def.textColor),
        accentColor: cleanColor(input.accentColor, def.accentColor),
        badgeBackground: cleanColor(input.badgeBackground, def.badgeBackground),
        badgeTextColor: cleanColor(input.badgeTextColor, def.badgeTextColor),
        borderColor: cleanColor(input.borderColor, def.borderColor),
        borderWidth: bound(input.borderWidth, def.borderWidth, 0, 8),
        radius: Math.round(bound(input.radius, def.radius, 0, 48)),
        height: Math.round(bound(input.height, def.height, 28, 120)),
        fontSize: Math.round(bound(input.fontSize, def.fontSize, 10, 48)),
        fontFamily: cleanText(input.fontFamily, 120).replace(/[;<>]/g, '') || def.fontFamily,
        maxItems: Math.round(bound(input.maxItems, def.maxItems, 1, 100))
    };
}

function resolveTickerItems(definition, binding = {}, status = {}) {
    const cfg = normalizeDisplayTicker(definition?.ticker);
    const customVars = Array.isArray(status.customVars)
        ? status.customVars
        : (Array.isArray(status.variables) ? status.variables : []);
    const sets = Array.isArray(status.variableSets)
        ? status.variableSets
        : (Array.isArray(status.sets) ? status.sets : []);

    if (binding?.variableName || cfg.sourceMode === 'list') {
        const varName = binding?.variableName || cfg.listVariable;
        if (!varName) return [];
        const v = customVars.find(item => item.name === varName);
        if (!v) return [];
        const rawItems = Array.isArray(v.items)
            ? v.items
            : String(v.value ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        return rawItems.slice(0, cfg.maxItems).map((text, idx) => ({
            key: `list:${varName}:${idx}`,
            text: String(text),
            sub: '',
            image: '',
            entry: null
        }));
    }

    const targetSetId = binding?.setId || definition?.catalogId || '';
    const setObj = sets.find(s => s.id === targetSetId);
    if (!setObj) return [];
    const scope = binding?.rows || cfg.rowScope || 'all';
    let entries = [];
    if (scope === 'active') {
        const owner = resolveDisplayOwner(sets, { ...binding, setId: setObj.id }).entry;
        entries = owner ? [owner] : [];
    } else if (scope === 'slots' || scope === 'group-slots') {
        const ids = setObj.slotsCount > 0 ? (setObj.slots || []) : [setObj.activeEntry];
        entries = [...new Set(ids)]
            .map(id => (setObj.roster || []).find(entry => entry.id === id))
            .filter(entry => entry && (scope !== 'group-slots' || entry.inGroup !== false));
    } else {
        entries = (setObj.roster || []).filter(entry => entry.enabled !== false && (scope !== 'group' || entry.inGroup !== false));
    }
    const imgKey = cfg.imageField || (setObj.fields || []).find(f => f.type === 'image')?.key || '';
    return entries.slice(0, cfg.maxItems).map(entry => ({
        key: `set:${setObj.id}:${entry.id}`,
        text: cfg.labelField === '$label' ? (entry.label || entry.id) : String(entry.values?.[cfg.labelField] ?? entry.label ?? entry.id),
        sub: cfg.subField ? String(entry.values?.[cfg.subField] ?? '').trim() : '',
        image: cfg.showImages && imgKey ? String(entry.values?.[imgKey] ?? '').trim() : '',
        entry
    })).filter(item => item.text);
}

module.exports = {
    TICKER_THEMES,
    TICKER_SEPARATORS,
    TICKER_THEME_PRESETS,
    defaultDisplayTicker,
    normalizeDisplayTicker,
    resolveTickerItems
};
