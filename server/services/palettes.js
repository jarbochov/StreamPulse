'use strict';

/**
 * StreamPulse Shared Color Palettes Library Service
 * Single source of truth for built-in curated palettes + user-created custom
 * multi-stop palettes (2-8 stops), shared across Custom Overlay Editor
 * (text gradients, box/shape/canvas backgrounds, borders, procedural patterns),
 * OBS Pattern Studio, OBS Border Studio, and Credit Suite.
 */

const fs = require('fs');
const path = require('path');
const { PALETTES, PALETTE_OPTIONS } = require('../../shared/pattern-catalog.cjs');

const MAX_CUSTOM_PALETTES = 200;
const MIN_STOPS = 2;
const MAX_STOPS = 8;

function sanitizeId(raw, fallback = 'palette') {
    const clean = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return clean || fallback;
}

function sanitizeStopColor(raw, fallback = '#38bdf8') {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    if (/^\{\{\s*var\.[a-zA-Z0-9_.-]+(?:\|[^}]*)?\s*\}\}$/.test(s)) return s.slice(0, 120);
    if (/^var:[a-zA-Z0-9_.-]+(\|.*)?$/.test(s)) return s.slice(0, 120);
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    if (/^(rgba?|hsla?)\([^)]+\)$/i.test(s)) return s.slice(0, 80);
    return fallback;
}

function normalizeColors(rawColors) {
    const arr = Array.isArray(rawColors) ? rawColors : [];
    const cleaned = arr
        .map(c => sanitizeStopColor(c, ''))
        .filter(Boolean)
        .slice(0, MAX_STOPS);
    if (cleaned.length < MIN_STOPS) {
        return ['#1f6feb', '#8957e5'];
    }
    return cleaned;
}

function buildBuiltinPalettes() {
    const labelMap = new Map();
    if (Array.isArray(PALETTE_OPTIONS)) {
        for (const [id, label] of PALETTE_OPTIONS) {
            if (id && id !== 'dual' && id !== 'custom') {
                labelMap.set(id, String(label || id).replace(/\s*\([^)]*\)\s*$/, '').trim() || id);
            }
        }
    }
    return Object.entries(PALETTES || {}).map(([id, colors]) => ({
        id,
        name: labelMap.get(id) || (id[0].toUpperCase() + id.slice(1)),
        colors: colors.slice(0, MAX_STOPS),
        angle: 135,
        builtin: true
    }));
}

function normalizeCustomPalette(raw = {}, idx = 0) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const now = new Date().toISOString();
    const name = String(p.name || `Custom Palette ${idx + 1}`).trim().slice(0, 80) || `Custom Palette ${idx + 1}`;
    const rawId = p.id ? sanitizeId(p.id, `custom-${idx + 1}`) : sanitizeId(`custom-${name}-${Date.now().toString(36)}`, `custom-${idx + 1}`);
    const angle = Number.isFinite(Number(p.angle)) ? Math.max(0, Math.min(360, Math.round(Number(p.angle)))) : 135;
    return {
        id: rawId,
        name,
        colors: normalizeColors(p.colors),
        angle,
        builtin: false,
        createdAt: p.createdAt || now,
        updatedAt: p.updatedAt || now
    };
}

function createPalettesService({ dataDir, onChange = () => {} } = {}) {
    const filePath = path.join(dataDir, 'palettes.json');
    const builtin = buildBuiltinPalettes();
    const builtinIds = new Set(builtin.map(p => p.id));

    let custom = [];

    function load() {
        try {
            if (!fs.existsSync(filePath)) {
                custom = [];
                return;
            }
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const list = Array.isArray(parsed?.custom) ? parsed.custom : (Array.isArray(parsed) ? parsed : []);
            const seen = new Set(builtinIds);
            custom = [];
            for (let i = 0; i < list.length && custom.length < MAX_CUSTOM_PALETTES; i++) {
                const norm = normalizeCustomPalette(list[i], i);
                if (seen.has(norm.id)) {
                    norm.id = sanitizeId(`${norm.id}-${i + 1}`, `custom-${i + 1}`);
                }
                seen.add(norm.id);
                custom.push(norm);
            }
        } catch (err) {
            console.warn('[Palettes] Failed to load palettes.json:', err.message);
            custom = [];
        }
    }

    function save() {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, custom }, null, 2), 'utf8');
        fs.renameSync(tmp, filePath);
    }

    function emitChange() {
        try { onChange(list()); } catch {}
    }

    function list() {
        return {
            builtin: builtin.map(p => ({ ...p, colors: [...p.colors] })),
            custom: custom.map(p => ({ ...p, colors: [...p.colors] })),
            palettes: [
                ...custom.map(p => ({ ...p, colors: [...p.colors] })),
                ...builtin.map(p => ({ ...p, colors: [...p.colors] }))
            ]
        };
    }

    function getStatus() {
        return {
            builtinCount: builtin.length,
            customCount: custom.length,
            totalCount: builtin.length + custom.length,
            customNames: custom.map(p => p.name)
        };
    }

    function getById(id) {
        const clean = String(id || '').trim();
        if (!clean) return null;
        const foundCustom = custom.find(p => p.id === clean);
        if (foundCustom) return { ...foundCustom, colors: [...foundCustom.colors] };
        const foundBuiltin = builtin.find(p => p.id === clean);
        if (foundBuiltin) return { ...foundBuiltin, colors: [...foundBuiltin.colors] };
        return null;
    }

    function makeUniqueId(baseName) {
        const taken = new Set([...builtinIds, ...custom.map(p => p.id)]);
        const base = sanitizeId(baseName, 'custom-palette');
        const prefixed = builtinIds.has(base) ? `custom-${base}` : base;
        if (!taken.has(prefixed)) return prefixed;
        let n = 2;
        while (taken.has(`${prefixed}-${n}`)) n++;
        return `${prefixed}-${n}`;
    }

    function create(input = {}) {
        if (custom.length >= MAX_CUSTOM_PALETTES) {
            throw new Error(`Maximum of ${MAX_CUSTOM_PALETTES} custom palettes reached`);
        }
        const name = String(input.name || '').trim().slice(0, 80);
        if (!name) throw new Error('Palette name is required');
        if (!Array.isArray(input.colors) || input.colors.length < MIN_STOPS) {
            throw new Error(`At least ${MIN_STOPS} color stops are required`);
        }
        const id = input.id && !builtinIds.has(sanitizeId(input.id, '')) && !custom.some(p => p.id === sanitizeId(input.id, ''))
            ? sanitizeId(input.id, makeUniqueId(name))
            : makeUniqueId(name);
        const now = new Date().toISOString();
        const created = normalizeCustomPalette({
            ...input,
            id,
            name,
            createdAt: now,
            updatedAt: now
        }, custom.length);
        custom.unshift(created);
        save();
        emitChange();
        return { ...created, colors: [...created.colors] };
    }

    function update(id, patch = {}) {
        const clean = String(id || '').trim();
        if (builtinIds.has(clean)) {
            throw new Error('Built-in palettes cannot be overwritten; duplicate it to customize');
        }
        const idx = custom.findIndex(p => p.id === clean);
        if (idx < 0) throw new Error('Custom palette not found');
        const prev = custom[idx];
        const nextName = patch.name !== undefined ? String(patch.name).trim().slice(0, 80) : prev.name;
        if (!nextName) throw new Error('Palette name cannot be empty');
        const nextColors = patch.colors !== undefined ? normalizeColors(patch.colors) : prev.colors;
        const nextAngle = patch.angle !== undefined && Number.isFinite(Number(patch.angle))
            ? Math.max(0, Math.min(360, Math.round(Number(patch.angle))))
            : prev.angle;
        const updated = {
            ...prev,
            name: nextName,
            colors: nextColors,
            angle: nextAngle,
            updatedAt: new Date().toISOString()
        };
        custom[idx] = updated;
        save();
        emitChange();
        return { ...updated, colors: [...updated.colors] };
    }

    function duplicate(id, customName = '') {
        const src = getById(id);
        if (!src) throw new Error('Source palette not found');
        const name = String(customName || `${src.name} (Copy)`).trim().slice(0, 80);
        return create({ name, colors: src.colors, angle: src.angle });
    }

    function remove(id) {
        const clean = String(id || '').trim();
        if (builtinIds.has(clean)) {
            throw new Error('Built-in palettes cannot be deleted');
        }
        const idx = custom.findIndex(p => p.id === clean);
        if (idx < 0) throw new Error('Custom palette not found');
        const [removed] = custom.splice(idx, 1);
        save();
        emitChange();
        return removed;
    }

    function reload() {
        load();
        emitChange();
        return list();
    }

    load();

    return {
        filePath,
        list,
        getStatus,
        getById,
        create,
        update,
        duplicate,
        remove,
        reload,
        sanitizeStopColor,
        normalizeColors
    };
}

module.exports = {
    createPalettesService,
    buildBuiltinPalettes,
    normalizeCustomPalette,
    normalizeColors,
    sanitizeStopColor,
    MIN_STOPS,
    MAX_STOPS
};
