'use strict';

const { COUNTER_THEME_PRESETS, resolveCounterRows } = require('./display-counter.cjs');

const METER_STYLES = ['bar', 'segmented', 'ring', 'vertical'];
const METER_THEMES = ['modern', 'esports', 'sports', 'arcade', 'minimal', 'cozy'];
const METER_READOUTS = ['fraction', 'percent', 'both', 'value', 'none'];
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

function defaultDisplayMeter() {
    return {
        sourceMode: 'variables',
        variables: [],
        valueField: '',
        labelField: '$label',
        rowScope: 'all',
        theme: 'modern',
        style: 'bar',
        capMode: 'auto',
        customCap: 100,
        segments: 10,
        direction: 'vertical',
        readout: 'both',
        showLabel: true,
        trail: true,
        useThresholds: false,
        lowThreshold: 25,
        midThreshold: 55,
        fillColor: '#22c55e',
        trackColor: '#ffffff1a',
        trailColor: '#ffffff66',
        lowColor: '#ef4444',
        midColor: '#f59e0b',
        labelColor: '#f8fafc',
        readoutColor: '#e2e8f0',
        rowBackground: '#0f172ad9',
        rowBorderColor: '#ffffff24',
        rowBorderWidth: 1,
        rowRadius: 12,
        rowPadding: 14,
        barHeight: 16,
        ringSize: 96,
        rowGap: 10,
        fontSize: 15,
        fontFamily: 'sans-serif',
        maxRows: 12
    };
}

function normalizeDisplayMeter(input = {}) {
    const def = defaultDisplayMeter();
    const seen = new Set();
    const variables = (Array.isArray(input.variables) ? input.variables : [])
        .slice(0, 16)
        .flatMap(entry => {
            const raw = typeof entry === 'string' ? { name: entry } : (entry || {});
            const name = cleanVarName(raw.name);
            if (!name || seen.has(name)) return [];
            seen.add(name);
            const rawCap = raw.cap;
            const cap = rawCap !== '' && rawCap != null && Number.isFinite(Number(rawCap)) && Number(rawCap) > 0
                ? Math.min(1000000, Math.max(1, Number(rawCap)))
                : null;
            return [{ name, label: cleanText(raw.label, 60), cap }];
        });
    const rawLabelField = String(input.labelField || '$label').trim();
    const labelField = rawLabelField === '$label' ? '$label' : (cleanKey(rawLabelField) || '$label');
    return {
        sourceMode: input.sourceMode === 'set' ? 'set' : 'variables',
        variables,
        valueField: cleanKey(input.valueField),
        labelField,
        rowScope: ROW_SCOPES.includes(input.rowScope) ? input.rowScope : def.rowScope,
        theme: METER_THEMES.includes(input.theme) ? input.theme : def.theme,
        style: METER_STYLES.includes(input.style) ? input.style : def.style,
        capMode: ['auto', 'custom'].includes(input.capMode) ? input.capMode : def.capMode,
        customCap: bound(input.customCap, def.customCap, 1, 1000000),
        segments: Math.round(bound(input.segments, def.segments, 2, 40)),
        direction: input.direction === 'horizontal' ? 'horizontal' : 'vertical',
        readout: METER_READOUTS.includes(input.readout) ? input.readout : def.readout,
        showLabel: input.showLabel !== false,
        trail: input.trail !== false,
        useThresholds: input.useThresholds === true,
        lowThreshold: Math.round(bound(input.lowThreshold, def.lowThreshold, 1, 99)),
        midThreshold: Math.round(bound(input.midThreshold, def.midThreshold, 2, 99)),
        fillColor: cleanColor(input.fillColor, def.fillColor),
        trackColor: cleanColor(input.trackColor, def.trackColor),
        trailColor: cleanColor(input.trailColor, def.trailColor),
        lowColor: cleanColor(input.lowColor, def.lowColor),
        midColor: cleanColor(input.midColor, def.midColor),
        labelColor: cleanColor(input.labelColor, def.labelColor),
        readoutColor: cleanColor(input.readoutColor, def.readoutColor),
        rowBackground: cleanColor(input.rowBackground, def.rowBackground),
        rowBorderColor: cleanColor(input.rowBorderColor, def.rowBorderColor),
        rowBorderWidth: bound(input.rowBorderWidth, def.rowBorderWidth, 0, 8),
        rowRadius: Math.round(bound(input.rowRadius, def.rowRadius, 0, 48)),
        rowPadding: Math.round(bound(input.rowPadding, def.rowPadding, 0, 48)),
        barHeight: Math.round(bound(input.barHeight, def.barHeight, 6, 64)),
        ringSize: Math.round(bound(input.ringSize, def.ringSize, 48, 240)),
        rowGap: Math.round(bound(input.rowGap, def.rowGap, 0, 48)),
        fontSize: Math.round(bound(input.fontSize, def.fontSize, 10, 64)),
        fontFamily: cleanText(input.fontFamily, 120).replace(/[;<>]/g, '') || def.fontFamily,
        maxRows: Math.round(bound(input.maxRows, def.maxRows, 1, 50))
    };
}

function resolveMeterRows(definition, binding = {}, status = {}) {
    const cfg = normalizeDisplayMeter(definition?.meter);
    const pseudoDef = {
        ...definition,
        counter: {
            sourceMode: cfg.sourceMode,
            variables: cfg.variables,
            valueField: cfg.valueField,
            labelField: cfg.labelField,
            rowScope: cfg.rowScope,
            capMode: cfg.capMode,
            customCap: cfg.customCap,
            maxRows: cfg.maxRows
        }
    };
    return resolveCounterRows(pseudoDef, binding, status).map(row => {
        const cap = row.cap != null && row.cap > 0 ? row.cap : cfg.customCap;
        const min = row.min != null && Number.isFinite(Number(row.min)) ? Number(row.min) : 0;
        const span = Math.max(0.0001, cap - min);
        const pct = Math.max(0, Math.min(100, ((row.value - min) / span) * 100));
        return { ...row, cap, min, pct };
    });
}

function formatMeterReadout(value, cap, pct, mode) {
    if (mode === 'none') return '';
    const vText = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
    const pText = `${Math.round(pct)}%`;
    if (mode === 'percent') return pText;
    if (mode === 'value') return vText;
    if (mode === 'both') return `${vText} / ${cap} · ${pText}`;
    return `${vText} / ${cap}`;
}

module.exports = {
    METER_STYLES,
    METER_THEMES,
    METER_READOUTS,
    METER_THEME_PRESETS: COUNTER_THEME_PRESETS,
    defaultDisplayMeter,
    normalizeDisplayMeter,
    resolveMeterRows,
    formatMeterReadout
};
