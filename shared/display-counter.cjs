'use strict';

const { resolveDisplayOwner } = require('./display-source.cjs');

const COUNTER_STYLES = ['pips', 'hearts', 'stars', 'diamonds', 'squares', 'bars', 'tally', 'tally-chalk', 'number'];
const SOURCE_MODES = ['variables', 'set'];
const CAP_MODES = ['auto', 'custom', 'none'];
const OVERFLOW_MODES = ['clamp', 'overflow', 'plus'];
const READOUT_MODES = ['none', 'fraction', 'value', 'of'];
const LABEL_POSITIONS = ['left', 'top', 'bottom', 'none'];
const READOUT_POSITIONS = ['right', 'left', 'top', 'bottom'];
const ROW_SCOPES = ['all', 'active', 'slots', 'group', 'group-slots'];

const cleanKey = value => String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
const cleanVarName = value => String(value || '').replace(/[^a-z0-9_.-]/gi, '').slice(0, 80);
const cleanText = (value, limit = 80) => String(value ?? '').trim().slice(0, limit);
const bound = (value, fallback, min, max) => (
    Number.isFinite(Number(value)) && value !== '' && value != null
        ? Math.min(max, Math.max(min, Number(value)))
        : fallback
);
const cleanColor = (value, fallback) => /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(value || '') ? value : fallback;
const optionalColor = value => /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(value || '') ? value : '';

function defaultDisplayCounter() {
    return {
        sourceMode: 'variables',
        variables: [],
        valueField: '',
        labelField: '$label',
        rowScope: 'all',
        style: 'pips',
        capMode: 'auto',
        customCap: 5,
        overflowMode: 'plus',
        perRow: 10,
        direction: 'vertical',
        align: 'left',
        showLabel: true,
        labelPosition: 'left',
        readout: 'fraction',
        readoutPosition: 'right',
        filledColor: '#f43f5e',
        emptyColor: '#ffffff1f',
        outlineColor: '#ffffff66',
        capReachedColor: '',
        overflowColor: '#fbbf24',
        labelColor: '#f8fafc',
        readoutColor: '#cbd5e1',
        rowBackground: '#0f172acc',
        rowBorderColor: '#ffffff1a',
        rowBorderWidth: 1,
        rowRadius: 10,
        rowPadding: 12,
        markerSize: 26,
        strokeWidth: 2,
        markerGap: 6,
        rowGap: 10,
        fontSize: 16,
        fontFamily: 'sans-serif',
        animate: 'pop',
        maxRows: 12
    };
}

function normalizeDisplayCounter(input = {}) {
    const def = defaultDisplayCounter();
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
                ? Math.round(Math.min(100, Math.max(1, Number(rawCap))))
                : null;
            return [{ name, label: cleanText(raw.label, 60), cap }];
        });

    const rawLabelField = String(input.labelField || '$label').trim();
    const labelField = rawLabelField === '$label' ? '$label' : (cleanKey(rawLabelField) || '$label');

    return {
        sourceMode: SOURCE_MODES.includes(input.sourceMode) ? input.sourceMode : def.sourceMode,
        variables,
        valueField: cleanKey(input.valueField),
        labelField,
        rowScope: ROW_SCOPES.includes(input.rowScope) ? input.rowScope : def.rowScope,
        style: COUNTER_STYLES.includes(input.style) ? input.style : def.style,
        capMode: CAP_MODES.includes(input.capMode) ? input.capMode : def.capMode,
        customCap: Math.round(bound(input.customCap, def.customCap, 1, 100)),
        overflowMode: OVERFLOW_MODES.includes(input.overflowMode) ? input.overflowMode : def.overflowMode,
        perRow: Math.round(bound(input.perRow, def.perRow, 0, 50)),
        direction: input.direction === 'horizontal' ? 'horizontal' : 'vertical',
        align: ['left', 'center', 'right'].includes(input.align) ? input.align : def.align,
        showLabel: input.showLabel !== false,
        labelPosition: LABEL_POSITIONS.includes(input.labelPosition) ? input.labelPosition : def.labelPosition,
        readout: READOUT_MODES.includes(input.readout) ? input.readout : def.readout,
        readoutPosition: READOUT_POSITIONS.includes(input.readoutPosition) ? input.readoutPosition : def.readoutPosition,
        filledColor: cleanColor(input.filledColor, def.filledColor),
        emptyColor: cleanColor(input.emptyColor, def.emptyColor),
        outlineColor: cleanColor(input.outlineColor, def.outlineColor),
        capReachedColor: optionalColor(input.capReachedColor),
        overflowColor: cleanColor(input.overflowColor, def.overflowColor),
        labelColor: cleanColor(input.labelColor, def.labelColor),
        readoutColor: cleanColor(input.readoutColor, def.readoutColor),
        rowBackground: cleanColor(input.rowBackground, def.rowBackground),
        rowBorderColor: cleanColor(input.rowBorderColor, def.rowBorderColor),
        rowBorderWidth: bound(input.rowBorderWidth, def.rowBorderWidth, 0, 8),
        rowRadius: Math.round(bound(input.rowRadius, def.rowRadius, 0, 48)),
        rowPadding: Math.round(bound(input.rowPadding, def.rowPadding, 0, 48)),
        markerSize: Math.round(bound(input.markerSize, def.markerSize, 10, 96)),
        strokeWidth: bound(input.strokeWidth, def.strokeWidth, 0.5, 6),
        markerGap: Math.round(bound(input.markerGap, def.markerGap, 0, 32)),
        rowGap: Math.round(bound(input.rowGap, def.rowGap, 0, 48)),
        fontSize: Math.round(bound(input.fontSize, def.fontSize, 10, 64)),
        fontFamily: cleanText(input.fontFamily, 120).replace(/[;{}<>]/g, '') || def.fontFamily,
        animate: input.animate === 'none' ? 'none' : 'pop',
        maxRows: Math.round(bound(input.maxRows, def.maxRows, 1, 50))
    };
}

function resolveCounterCap(variableMax, cfg, rowCapOverride = null) {
    if (rowCapOverride != null && Number.isFinite(Number(rowCapOverride)) && Number(rowCapOverride) > 0) {
        return Math.round(Math.min(100, Number(rowCapOverride)));
    }
    if (cfg.capMode === 'none') return null;
    if (cfg.capMode === 'custom') return Math.round(Math.min(100, Math.max(1, Number(cfg.customCap) || 5)));
    // capMode === 'auto': use variable max when defined and > 0; otherwise uncapped (grow dynamically)
    if (variableMax !== '' && variableMax != null && Number.isFinite(Number(variableMax)) && Number(variableMax) > 0) {
        return Math.round(Math.min(100, Number(variableMax)));
    }
    return null;
}

function parseNumericValue(raw) {
    if (raw === '' || raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

function formatCounterReadout(value, cap, mode) {
    if (mode === 'none') return '';
    const vText = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
    if (mode === 'value' || cap == null) return vText;
    if (mode === 'of') return `${vText} of ${cap}`;
    return `${vText} / ${cap}`;
}

function resolveCounterRows(definition, binding = {}, status = {}) {
    const cfg = normalizeDisplayCounter(definition?.counter);
    const customVars = Array.isArray(status.customVars)
        ? status.customVars
        : (Array.isArray(status.variables) ? status.variables : []);
    const sets = Array.isArray(status.variableSets)
        ? status.variableSets
        : (Array.isArray(status.sets) ? status.sets : []);

    // Placement override for a single standalone variable
    if (binding?.variableName) {
        const found = customVars.find(v => v.name === binding.variableName);
        if (!found) return [];
        const value = parseNumericValue(found.value);
        const cap = resolveCounterCap(found.max, cfg, null);
        return [{
            key: `var:${found.name}`,
            kind: 'variable',
            variableName: found.name,
            label: found.name,
            value,
            cap,
            min: found.min ?? null,
            max: found.max ?? null,
            step: Number(found.step) || 1,
            resetValue: found.resetValue ?? 0
        }];
    }

    if (cfg.sourceMode === 'set') {
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
        const valueFieldKey = cfg.valueField || (setObj.fields || []).find(f => f.type === 'number' || f.type === 'counter')?.key || '';
        const fieldDef = (setObj.fields || []).find(f => f.key === valueFieldKey);
        return entries.slice(0, cfg.maxRows).map(entry => {
            const rawVal = valueFieldKey ? entry.values?.[valueFieldKey] : 0;
            const value = parseNumericValue(rawVal);
            const label = cfg.labelField === '$label'
                ? (entry.label || entry.id)
                : (String(entry.values?.[cfg.labelField] ?? entry.label ?? entry.id));
            const cap = resolveCounterCap(fieldDef?.max, cfg, null);
            return {
                key: `set:${setObj.id}:${entry.id}:${valueFieldKey}`,
                kind: 'set-entry',
                setId: setObj.id,
                entryId: entry.id,
                valueField: valueFieldKey,
                label,
                value,
                cap,
                min: fieldDef?.min ?? null,
                max: fieldDef?.max ?? null,
                step: 1,
                resetValue: 0
            };
        });
    }

    // sourceMode === 'variables'
    const varMap = new Map(customVars.map(v => [v.name, v]));
    const rows = [];
    for (const item of cfg.variables.slice(0, cfg.maxRows)) {
        const found = varMap.get(item.name);
        const value = found ? parseNumericValue(found.value) : 0;
        const cap = resolveCounterCap(found?.max, cfg, item.cap);
        rows.push({
            key: `var:${item.name}`,
            kind: 'variable',
            variableName: item.name,
            label: item.label || item.name,
            value,
            cap,
            min: found?.min ?? null,
            max: found?.max ?? null,
            step: Number(found?.step) || 1,
            resetValue: found?.resetValue ?? 0,
            missing: !found
        });
    }
    return rows;
}

module.exports = {
    COUNTER_STYLES,
    SOURCE_MODES,
    CAP_MODES,
    OVERFLOW_MODES,
    READOUT_MODES,
    LABEL_POSITIONS,
    READOUT_POSITIONS,
    ROW_SCOPES,
    defaultDisplayCounter,
    normalizeDisplayCounter,
    resolveCounterCap,
    formatCounterReadout,
    resolveCounterRows
};
