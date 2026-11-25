/**
 * OBS Border Studio Service (Beta / Advanced)
 *
 * Manages reusable, variable-driven border profiles and per-source / per-scene
 * assignments for OBS Studio. Automatically resolves Variable Settings tokens
 * (`var:<key>|<fallback>`) into `data/obs-borders/manifest.json` and keeps the
 * Metal/OpenGL-compatible `data/obs-borders/streampulse-borders.lua` up to date.
 */

const fs = require('fs');
const path = require('path');
const {
    BORDER_STYLES,
    BORDER_ANIM_TYPES: ANIMATION_TYPES,
    STYLE_CODE_MAP,
    ANIM_CODE_MAP,
    BACKGROUND_FILL_MODES,
    BACKGROUND_MODE_MAP,
    SHADOW_MODES,
    SHADOW_MODE_MAP,
    computeAutoBorderPad
} = require('../../shared/border-catalog.cjs');

const VAR_TOKEN_RE = /^(?:var:([a-zA-Z0-9_.-]+)(?:\|(.*))?|\{\{\s*var\.([a-zA-Z0-9_.-]+)(?:\|([\s\S]*?))?\s*\}\})$/;
const PLACEMENT_MODES = ['outside', 'center', 'inside', 'outset', 'middle', 'inset'];

function normalizePlacement(p) {
    if (p === 'outside' || p === 'outset') return 'outside';
    if (p === 'center' || p === 'middle') return 'center';
    if (p === 'inside' || p === 'inset') return 'inside';
    return 'outside';
}

const PLACEMENT_CODE_MAP = {
    'outside': 0,
    'outset': 0,
    'center': 1,
    'middle': 1,
    'inside': 2,
    'inset': 2
};

function normalizeStyleAlias(style) {
    if (style === 'gradient' || style === 'conic-gradient') return 'solid';
    if (style === 'outset-bevel') return 'outset';
    if (style === 'inset-bevel') return 'inset';
    if (style === 'corners') return 'corner-brackets';
    return BORDER_STYLES.includes(style) ? style : 'solid';
}

function normalizeAnimAlias(type) {
    if (type === 'rotate-gradient') return 'rotating';
    if (type === 'pulse-glow') return 'pulsing';
    if (type === 'shimmer-bevel') return 'laser-scan';
    if (type === 'color-cycle') return 'gradient';
    return ANIMATION_TYPES.includes(type) ? type : 'none';
}

function isVarToken(val) {
    return typeof val === 'string' && VAR_TOKEN_RE.test(val.trim());
}

function parseVarToken(val) {
    if (typeof val !== 'string') return null;
    const m = val.trim().match(VAR_TOKEN_RE);
    if (!m) return null;
    return {
        key: m[1] || m[3] || '',
        fallback: (m[2] !== undefined ? m[2] : m[4]) ?? ''
    };
}

function resolveValue(raw, varValues = {}, fallbackDefault = '') {
    if (typeof raw === 'string') {
        const parsed = parseVarToken(raw);
        if (parsed) {
            const found = varValues[parsed.key];
            if (found !== undefined && found !== null && String(found).trim() !== '') {
                return String(found).trim();
            }
            if (parsed.fallback !== '') return parsed.fallback;
            return fallbackDefault;
        }
    }
    return raw !== undefined && raw !== null && raw !== '' ? raw : fallbackDefault;
}

function sanitizeNumberOrVar(val, fallback, min, max) {
    if (isVarToken(val)) return val.trim();
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeColorOrVar(val, fallback) {
    if (isVarToken(val)) return val.trim();
    if (typeof val !== 'string') return fallback;
    const clean = val.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return clean;
    return fallback;
}

function hexToRgbaFloats(hex, fallback = [1, 1, 1, 1]) {
    if (typeof hex !== 'string') return fallback;
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + 'ff';
    } else if (h.length === 4) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    } else if (h.length === 6) {
        h += 'ff';
    }
    if (h.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(h)) return fallback;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return [
        Math.round(r * 10000) / 10000,
        Math.round(g * 10000) / 10000,
        Math.round(b * 10000) / 10000,
        Math.round(a * 10000) / 10000
    ];
}

function sanitizeId(raw, fallback = 'profile') {
    const clean = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return clean || fallback;
}

function buildDefaultProfiles() {
    return [
        {
            id: 'dual-gradient',
            name: 'Dual Gradient Frame',
            description: '20px rounded corners with a 12px gradient inner border and 2px outer accent ring.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 48,
            seamOverlap: 1,
            perCornerRadius: false,
            radius: 20,
            radiusTL: 20,
            radiusTR: 20,
            radiusBR: 20,
            radiusBL: 20,
            inner: {
                enabled: true,
                style: 'solid',
                gradient: true,
                thickness: 12,
                gap: 0,
                color1: '#FFFFFFFF',
                color2: '#999999FF',
                angle: 180
            },
            outer: {
                enabled: true,
                style: 'solid',
                gradient: true,
                thickness: 2,
                gap: 0,
                color1: '#99A443FF',
                color2: '#026E54FF',
                angle: 180
            },
            glow: {
                enabled: false,
                color: '#38BDF8FF',
                blur: 16,
                neon: false,
                inner: false
            },
            animation: {
                type: 'none',
                speed: 4,
                size: 35,
                color2: '#FFFFFFFF',
                direction: 'cw'
            }
        },
        {
            id: 'outset-3d-bevel',
            name: '3D Outset Bevel Frame',
            description: '45-degree mitered 3D outset bevel with top/left highlight and bottom/right shadow.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 48,
            seamOverlap: 1,
            perCornerRadius: false,
            radius: 0,
            radiusTL: 0,
            radiusTR: 0,
            radiusBR: 0,
            radiusBL: 0,
            inner: {
                enabled: true,
                style: 'outset',
                gradient: false,
                thickness: 14,
                gap: 0,
                color1: '#99A443FF',
                color2: '#026E54FF',
                angle: 135
            },
            outer: {
                enabled: true,
                style: 'solid',
                gradient: false,
                thickness: 2,
                gap: 0,
                color1: '#111820FF',
                color2: '#111820FF',
                angle: 0
            },
            glow: {
                enabled: true,
                color: '#00000099',
                blur: 16,
                neon: false,
                inner: false
            },
            animation: {
                type: 'laser-scan',
                speed: 3.5,
                size: 35,
                color2: '#FFFFFFFF',
                direction: 'cw'
            }
        },
        {
            id: 'neon-rotating',
            name: 'Neon Rotating Beam',
            description: '60fps GPU-animated rotating spotlight beam with rounded corners and neon glow.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 52,
            seamOverlap: 1,
            perCornerRadius: false,
            radius: 24,
            radiusTL: 24,
            radiusTR: 24,
            radiusBR: 24,
            radiusBL: 24,
            inner: {
                enabled: true,
                style: 'neon-tube',
                gradient: true,
                thickness: 10,
                gap: 0,
                color1: '#38BDF8FF',
                color2: '#A855F7FF',
                angle: 135
            },
            outer: {
                enabled: false,
                style: 'solid',
                gradient: false,
                thickness: 2,
                gap: 2,
                color1: '#FFFFFFFF',
                color2: '#38BDF8FF',
                angle: 0
            },
            glow: {
                enabled: true,
                color: '#38BDF8FF',
                blur: 20,
                neon: true,
                inner: false
            },
            animation: {
                type: 'rotating',
                speed: 4,
                size: 35,
                color2: '#FFFFFFFF',
                direction: 'cw'
            }
        },
        {
            id: 'cyber-hud',
            name: 'Cyber Tech HUD',
            description: 'Mecha tech HUD corner brackets & edge rails paired with twin chasing beams.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 48,
            seamOverlap: 1,
            perCornerRadius: false,
            radius: 12,
            radiusTL: 12,
            radiusTR: 12,
            radiusBR: 12,
            radiusBL: 12,
            inner: {
                enabled: true,
                style: 'tech-hud',
                gradient: true,
                thickness: 12,
                gap: 0,
                color1: '#00E1AAFF',
                color2: '#0EA5E9FF',
                angle: 90
            },
            outer: {
                enabled: false,
                style: 'solid',
                gradient: false,
                thickness: 2,
                gap: 0,
                color1: '#FFFFFFFF',
                color2: '#FFFFFFFF',
                angle: 0
            },
            glow: {
                enabled: true,
                color: '#00E1AA99',
                blur: 14,
                neon: false,
                inner: false
            },
            animation: {
                type: 'dual-beam',
                speed: 3.5,
                size: 30,
                color2: '#FFFFFFFF',
                direction: 'cw'
            }
        },
        {
            id: 'floating-shadow',
            name: 'Floating Drop Shadow (Borderless)',
            description: 'Clean rounded frame with layered ambient drop shadow and no border ring.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outside',
            pad: 52,
            seamOverlap: 0,
            perCornerRadius: false,
            radius: 24,
            radiusTL: 24,
            radiusTR: 24,
            radiusBR: 24,
            radiusBL: 24,
            inner: {
                enabled: false,
                style: 'solid',
                gradient: false,
                thickness: 10,
                gap: 0,
                color1: '#FFFFFFFF',
                color2: '#FFFFFFFF',
                angle: 180
            },
            outer: {
                enabled: false,
                style: 'solid',
                gradient: false,
                thickness: 2,
                gap: 0,
                color1: '#FFFFFFFF',
                color2: '#FFFFFFFF',
                angle: 180
            },
            glow: {
                enabled: false,
                color: '#38BDF8FF',
                blur: 16,
                neon: false,
                inner: false
            },
            shadow: {
                enabled: true,
                mode: 'layered',
                color: '#000000BF',
                offsetX: 8,
                offsetY: 16,
                blur: 28,
                spread: 0,
                multiply: true
            },
            animation: {
                type: 'none',
                speed: 4,
                size: 35,
                color2: '#FFFFFFFF',
                direction: 'cw'
            }
        }
    ];
}

function normalizeLayer(raw = {}, defaults = {}) {
    const rawStyle = normalizeStyleAlias(raw.style || defaults.style || 'solid');
    const hadGradientFlag = raw.style === 'gradient' || raw.style === 'conic-gradient' || Boolean(raw.gradient);
    return {
        enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : Boolean(defaults.enabled),
        style: rawStyle,
        gradient: raw.gradient !== undefined ? Boolean(raw.gradient) : (hadGradientFlag || Boolean(defaults.gradient)),
        thickness: sanitizeNumberOrVar(raw.thickness, defaults.thickness ?? 8, 0, 200),
        gap: sanitizeNumberOrVar(raw.gap, defaults.gap ?? 0, 0, 100),
        color1: sanitizeColorOrVar(raw.color1, defaults.color1 || '#FFFFFFFF'),
        color2: sanitizeColorOrVar(raw.color2, defaults.color2 || '#888888FF'),
        angle: sanitizeNumberOrVar(raw.angle, defaults.angle ?? 180, -360, 360)
    };
}

function normalizeBackground(raw = {}) {
    const mode = BACKGROUND_FILL_MODES.includes(raw.mode) ? raw.mode : 'none';
    const staticScaleNum = Number(raw.staticScale);
    const staticSpeedNum = Number(raw.staticSpeed);
    const staticNoiseNum = Number(raw.staticNoise);
    const staticGlitchNum = Number(raw.staticGlitch);
    return {
        mode,
        standby: Boolean(raw.standby),
        color1: sanitizeColorOrVar(raw.color1, '#16202FFF'),
        color2: sanitizeColorOrVar(raw.color2, '#0B101BFF'),
        angle: sanitizeNumberOrVar(raw.angle, 135, -360, 360),
        iconColor: sanitizeColorOrVar(raw.iconColor, '#64748BFF'),
        staticNoise: Number.isFinite(staticNoiseNum) ? Math.max(0, Math.min(100, Math.round(staticNoiseNum))) : 75,
        staticScale: Number.isFinite(staticScaleNum) ? Math.max(1, Math.min(128, staticScaleNum)) : 3.0,
        staticSpeed: Number.isFinite(staticSpeedNum) ? Math.max(4, Math.min(30, Math.round(staticSpeedNum))) : 16,
        staticColor: Boolean(raw.staticColor),
        staticGlitch: Number.isFinite(staticGlitchNum) ? Math.max(0, Math.min(100, Math.round(staticGlitchNum))) : 35
    };
}

function normalizeProfile(raw = {}, fallbackIndex = 0) {
    const defaults = buildDefaultProfiles()[0];
    const id = sanitizeId(raw.id || raw.name, `border-profile-${fallbackIndex + 1}`);
    const name = String(raw.name || 'Border Profile').trim().slice(0, 80) || 'Border Profile';
    const description = String(raw.description || '').trim().slice(0, 240);
    return {
        id,
        name,
        description,
        baseWidth: Math.max(64, Math.min(7680, Math.round(Number(raw.baseWidth) || defaults.baseWidth))),
        baseHeight: Math.max(64, Math.min(4320, Math.round(Number(raw.baseHeight) || defaults.baseHeight))),
        placement: normalizePlacement(raw.placement || defaults.placement),
        autoPad: raw.autoPad !== undefined ? Boolean(raw.autoPad) : true,
        autoScale: raw.autoScale !== undefined ? Boolean(raw.autoScale) : true,
        extraPad: sanitizeNumberOrVar(raw.extraPad, 0, 0, 200),
        pad: sanitizeNumberOrVar(raw.pad, defaults.pad, 0, 400),
        seamOverlap: Math.max(0, Math.min(10, Number(raw.seamOverlap ?? defaults.seamOverlap))),
        perCornerRadius: Boolean(raw.perCornerRadius),
        radius: sanitizeNumberOrVar(raw.radius, defaults.radius, 0, 500),
        radiusTL: sanitizeNumberOrVar(raw.radiusTL, raw.radius ?? defaults.radiusTL, 0, 500),
        radiusTR: sanitizeNumberOrVar(raw.radiusTR, raw.radius ?? defaults.radiusTR, 0, 500),
        radiusBR: sanitizeNumberOrVar(raw.radiusBR, raw.radius ?? defaults.radiusBR, 0, 500),
        radiusBL: sanitizeNumberOrVar(raw.radiusBL, raw.radius ?? defaults.radiusBL, 0, 500),
        inner: normalizeLayer(raw.inner, defaults.inner),
        outer: normalizeLayer(raw.outer, defaults.outer),
        glow: {
            enabled: raw.glow?.enabled !== undefined ? Boolean(raw.glow.enabled) : defaults.glow.enabled,
            color: sanitizeColorOrVar(raw.glow?.color, defaults.glow.color),
            blur: sanitizeNumberOrVar(raw.glow?.blur ?? raw.glow?.size, defaults.glow.blur, 0, 120),
            neon: Boolean(raw.glow?.neon),
            inner: Boolean(raw.glow?.inner)
        },
        shadow: {
            enabled: Boolean(raw.shadow?.enabled),
            mode: SHADOW_MODE_MAP[raw.shadow?.mode] !== undefined ? raw.shadow.mode : 'soft',
            color: sanitizeColorOrVar(raw.shadow?.color, '#000000B3'),
            offsetX: sanitizeNumberOrVar(raw.shadow?.offsetX, 10, -150, 150),
            offsetY: sanitizeNumberOrVar(raw.shadow?.offsetY, 14, -150, 150),
            blur: sanitizeNumberOrVar(raw.shadow?.blur, 24, 0, 120),
            spread: sanitizeNumberOrVar(raw.shadow?.spread, 0, -40, 80),
            multiply: raw.shadow?.multiply !== undefined ? Boolean(raw.shadow.multiply) : true
        },
        animation: {
            type: normalizeAnimAlias(raw.animation?.type || defaults.animation.type),
            speed: sanitizeNumberOrVar(raw.animation?.speed, defaults.animation.speed, 0.25, 60),
            size: sanitizeNumberOrVar(raw.animation?.size, 35, 5, 100),
            color2: sanitizeColorOrVar(raw.animation?.color2, '#FFFFFFFF'),
            direction: ['cw', 'ccw', 'alternate'].includes(raw.animation?.direction) ? raw.animation.direction : 'cw'
        },
        background: normalizeBackground(raw.background || {})
    };
}

function resolveProfileForManifest(profile, varValues = {}) {
    const num = (val, def, min, max) => {
        const resolved = resolveValue(val, varValues, def);
        const n = Number(resolved);
        if (!Number.isFinite(n)) return def;
        return Math.max(min, Math.min(max, n));
    };
    const col = (val, def) => {
        const resolved = String(resolveValue(val, varValues, def) || def).trim();
        return /^#[0-9a-fA-F]{3,8}$/.test(resolved) ? resolved : def;
    };

    const uniformR = num(profile.radius, 20, 0, 500);
    const rTL = profile.perCornerRadius ? num(profile.radiusTL, uniformR, 0, 500) : uniformR;
    const rTR = profile.perCornerRadius ? num(profile.radiusTR, uniformR, 0, 500) : uniformR;
    const rBR = profile.perCornerRadius ? num(profile.radiusBR, uniformR, 0, 500) : uniformR;
    const rBL = profile.perCornerRadius ? num(profile.radiusBL, uniformR, 0, 500) : uniformR;

    const innerColor1 = col(profile.inner?.color1, '#FFFFFFFF');
    const innerColor2 = col(profile.inner?.color2, '#999999FF');
    const outerColor1 = col(profile.outer?.color1, '#99A443FF');
    const outerColor2 = col(profile.outer?.color2, '#026E54FF');
    const glowColor = col(profile.glow?.color, '#38BDF8FF');
    const shadowColor = col(profile.shadow?.color, '#000000B3');
    const animColor2 = col(profile.animation?.color2, '#FFFFFFFF');

    const innerStyle = normalizeStyleAlias(profile.inner?.style || 'solid');
    const outerStyle = normalizeStyleAlias(profile.outer?.style || 'solid');
    const animType = normalizeAnimAlias(profile.animation?.type || 'none');
    const animDir = profile.animation?.direction || 'cw';

    const innerResolved = {
        enabled: Boolean(profile.inner?.enabled),
        style: innerStyle,
        styleCode: STYLE_CODE_MAP[innerStyle] ?? 0,
        gradient: Boolean(profile.inner?.gradient),
        thickness: num(profile.inner?.thickness, 12, 0, 200),
        gap: num(profile.inner?.gap, 0, 0, 100),
        color1: innerColor1,
        color2: innerColor2,
        color1Rgba: hexToRgbaFloats(innerColor1, [1, 1, 1, 1]),
        color2Rgba: hexToRgbaFloats(innerColor2, [0.6, 0.6, 0.6, 1]),
        angle: num(profile.inner?.angle, 180, -360, 360)
    };
    const outerResolved = {
        enabled: Boolean(profile.outer?.enabled),
        style: outerStyle,
        styleCode: STYLE_CODE_MAP[outerStyle] ?? 0,
        gradient: Boolean(profile.outer?.gradient),
        thickness: num(profile.outer?.thickness, 2, 0, 200),
        gap: num(profile.outer?.gap, 0, 0, 100),
        color1: outerColor1,
        color2: outerColor2,
        color1Rgba: hexToRgbaFloats(outerColor1, [0.6, 0.64, 0.26, 1]),
        color2Rgba: hexToRgbaFloats(outerColor2, [0.01, 0.43, 0.33, 1]),
        angle: num(profile.outer?.angle, 180, -360, 360)
    };
    const glowResolved = {
        enabled: Boolean(profile.glow?.enabled),
        color: glowColor,
        colorRgba: hexToRgbaFloats(glowColor, [0.22, 0.74, 0.97, 1]),
        blur: num(profile.glow?.blur, 16, 0, 120),
        neon: Boolean(profile.glow?.neon),
        inner: Boolean(profile.glow?.inner)
    };
    const shMode = SHADOW_MODE_MAP[profile.shadow?.mode] !== undefined ? profile.shadow.mode : 'soft';
    const shadowResolved = {
        enabled: Boolean(profile.shadow?.enabled),
        mode: shMode,
        modeCode: SHADOW_MODE_MAP[shMode] ?? 0,
        color: shadowColor,
        colorRgba: hexToRgbaFloats(shadowColor, [0, 0, 0, 0.7]),
        offsetX: num(profile.shadow?.offsetX, 10, -150, 150),
        offsetY: num(profile.shadow?.offsetY, 14, -150, 150),
        blur: num(profile.shadow?.blur, 24, 0, 120),
        spread: num(profile.shadow?.spread, 0, -40, 80),
        multiply: profile.shadow?.multiply !== undefined ? Boolean(profile.shadow.multiply) : true
    };

    const bgRaw = normalizeBackground(profile.background || {});
    const bgColor1 = col(profile.background?.color1 ?? bgRaw.color1, '#16202FFF');
    const bgColor2 = col(profile.background?.color2 ?? bgRaw.color2, '#0B101BFF');
    const bgIconColor = col(profile.background?.iconColor ?? bgRaw.iconColor, '#64748BFF');

    const placement = normalizePlacement(profile.placement);
    const autoPad = profile.autoPad !== false;
    const manualPad = num(profile.pad, 48, 0, 400);
    const extraPad = num(profile.extraPad, 0, 0, 200);
    const resolvedPad = computeAutoBorderPad({
        placement,
        autoPad,
        pad: manualPad,
        extraPad,
        seamOverlap: profile.seamOverlap,
        inner: innerResolved,
        outer: outerResolved,
        glow: glowResolved,
        shadow: shadowResolved
    });

    return {
        id: profile.id,
        name: profile.name,
        baseWidth: profile.baseWidth,
        baseHeight: profile.baseHeight,
        placement,
        placementCode: PLACEMENT_CODE_MAP[placement] ?? 0,
        autoPad,
        autoScale: profile.autoScale !== false,
        extraPad,
        pad: resolvedPad,
        seamOverlap: profile.seamOverlap,
        perCornerRadius: profile.perCornerRadius,
        radius: uniformR,
        radii: [rTL, rTR, rBR, rBL],
        inner: innerResolved,
        outer: outerResolved,
        glow: glowResolved,
        shadow: shadowResolved,
        animation: {
            type: animType,
            typeCode: ANIM_CODE_MAP[animType] ?? 0,
            speed: num(profile.animation?.speed, 4, 0.25, 60),
            size: num(profile.animation?.size, 35, 5, 100),
            color2: animColor2,
            color2Rgba: hexToRgbaFloats(animColor2, [1, 1, 1, 1]),
            direction: animDir,
            dirCode: animDir === 'ccw' ? -1 : (animDir === 'alternate' ? 2 : 1)
        },
        background: {
            mode: bgRaw.mode,
            modeCode: BACKGROUND_MODE_MAP[bgRaw.mode] ?? 0,
            standby: bgRaw.standby,
            color1: bgColor1,
            color2: bgColor2,
            color1Rgba: hexToRgbaFloats(bgColor1, [0.086, 0.125, 0.184, 1]),
            color2Rgba: hexToRgbaFloats(bgColor2, [0.043, 0.063, 0.106, 1]),
            angle: num(profile.background?.angle ?? bgRaw.angle, 135, -360, 360),
            iconColor: bgIconColor,
            iconColorRgba: hexToRgbaFloats(bgIconColor, [0.39, 0.45, 0.55, 1]),
            staticNoise: bgRaw.staticNoise,
            staticScale: bgRaw.staticScale,
            staticSpeed: bgRaw.staticSpeed,
            staticColor: bgRaw.staticColor,
            staticGlitch: bgRaw.staticGlitch
        }
    };
}

/**
 * Generates the Metal / OpenGL 4.1 / D3D11 compatible OBS Lua Effect Filter (`streampulse-borders.lua`).
 * Note: All scalar switches use `uniform float` + `gs_effect_set_float` for maximum cross-backend reliability.
 */
function buildObsLuaScript({ manifestPath }) {
    const escapedPath = String(manifestPath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `-- ============================================================================
-- StreamPulse OBS Border Filter (macOS Metal / OpenGL / D3D11 Compatible)
-- ============================================================================
-- Load this file ONCE in OBS Studio -> Tools -> Scripts.
-- Auto-updates from StreamPulse manifest.json whenever profiles, per-source /
-- per-scene assignments, or StreamPulse Variable Settings change.
-- ============================================================================

local obs = obslua

local DEFAULT_MANIFEST_PATH = "${escapedPath}"
local manifest_path = DEFAULT_MANIFEST_PATH
local manifest_revision = 0
local manifest_last_sig = ""
local profiles_by_id = {}
local assignment_rules = {}
local scene_scales = {}
local live_scene_scales = {}
local default_profile_id = "dual-gradient"
local active_scene_name = ""

local EFFECT_SOURCE = [[
uniform float4x4 ViewProj;
uniform texture2d image;

uniform float2 base_size;
uniform float2 total_size;
uniform float2 pad_xy;
uniform float4 radii;
uniform float seam_overlap;
uniform float placement_code;

uniform float inner_enabled;
uniform float inner_style;
uniform float inner_grad;
uniform float inner_thickness;
uniform float inner_gap;
uniform float4 inner_color1;
uniform float4 inner_color2;
uniform float inner_angle_rad;

uniform float outer_enabled;
uniform float outer_style;
uniform float outer_grad;
uniform float outer_thickness;
uniform float outer_gap;
uniform float4 outer_color1;
uniform float4 outer_color2;
uniform float outer_angle_rad;

uniform float glow_enabled;
uniform float4 glow_color;
uniform float glow_blur;
uniform float glow_neon;
uniform float glow_inner;

uniform float shadow_enabled;
uniform float shadow_mode;
uniform float4 shadow_color;
uniform float2 shadow_offset;
uniform float shadow_blur;
uniform float shadow_spread;
uniform float shadow_multiply;

uniform float anim_type;
uniform float anim_time;
uniform float anim_speed;
uniform float anim_size;
uniform float anim_dir;
uniform float4 anim_color2;

uniform float bg_mode;
uniform float bg_standby;
uniform float4 bg_color1;
uniform float4 bg_color2;
uniform float bg_angle_rad;
uniform float4 bg_icon_color;
uniform float bg_static_noise;
uniform float bg_static_scale;
uniform float bg_static_speed;
uniform float bg_static_color;
uniform float bg_static_glitch;

sampler_state textureSampler {
    Filter   = Linear;
    AddressU = Clamp;
    AddressV = Clamp;
};

struct VertDataIn {
    float4 pos : POSITION;
    float2 uv  : TEXCOORD0;
};

struct VertDataOut {
    float4 pos : POSITION;
    float2 uv  : TEXCOORD0;
};

VertDataOut VSDefault(VertDataIn v_in) {
    VertDataOut vert_out;
    vert_out.pos = mul(float4(v_in.pos.xyz, 1.0), ViewProj);
    vert_out.uv  = v_in.uv;
    return vert_out;
}

float sdRoundedBox(float2 p, float2 b, float4 r) {
    float2 r_sel = (p.x > 0.0) ? float2(r.y, r.z) : float2(r.x, r.w);
    float rad = (p.y > 0.0) ? r_sel.y : r_sel.x;
    rad = min(rad, min(b.x, b.y));
    float2 q = abs(p) - b + rad;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
}

float sdShapeBox(float2 p, float2 b, float4 r, float sharp_zero) {
    float2 r_sel = (p.x > 0.0) ? float2(r.y, r.z) : float2(r.x, r.w);
    float rad = (p.y > 0.0) ? r_sel.y : r_sel.x;
    rad = min(rad, min(b.x, b.y));
    float2 q = abs(p) - b + rad;
    if (sharp_zero > 0.5 && rad <= 0.001) {
        return max(q.x, q.y);
    }
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
}

float sdChamferBox(float2 p, float2 b, float ch) {
    float2 ap = abs(p);
    float d_rect = max(ap.x - b.x, ap.y - b.y);
    float c = clamp(max(ch, 34.0), 12.0, min(b.x, b.y) * 0.45);
    float d_diag = (ap.x - b.x + ap.y - b.y + c) * 0.70710678;
    return max(d_rect, d_diag);
}

float sdNotchedBox(float2 p, float2 b, float ch) {
    float2 ap = abs(p);
    float d_rect = max(ap.x - b.x, ap.y - b.y);
    float c = clamp(max(ch * 1.15, 32.0), 14.0, min(b.x, b.y) * 0.4);
    // Cutout SDFs: negative INSIDE the corner regions to remove
    float cut1 = max((b.x - c * 0.65) - ap.x, (b.y - c) - ap.y);
    float cut2 = max((b.x - c) - ap.x, (b.y - c * 0.65) - ap.y);
    float d_cut_corner = min(cut1, cut2);
    float mid_w = clamp(b.x * 0.22, 40.0, 180.0);
    float notch_depth = 10.0;
    float d_cut_mid = max(ap.x - mid_w, (b.y - notch_depth) - ap.y);
    float d_cut = min(d_cut_corner, d_cut_mid);
    return max(d_rect, -d_cut);
}

float sdPixelBox(float2 p, float2 b, float step_sz) {
    float2 ap = abs(p);
    float s = clamp(max(step_sz, 12.0), 10.0, min(b.x, b.y) * 0.22);
    float d_rect = max(ap.x - b.x, ap.y - b.y);
    float c = s * 2.0;
    float cut1 = max((b.x - s) - ap.x, (b.y - c) - ap.y);
    float cut2 = max((b.x - c) - ap.x, (b.y - s) - ap.y);
    float d_cut = min(cut1, cut2);
    return max(d_rect, -d_cut);
}

float evalShapeSDF(float2 p, float2 half_base, float4 r, float clip_style, float inner_en, float in_t, float out_t, float sharp_zero) {
    if (clip_style > 11.5 && clip_style < 12.5) {
        return sdChamferBox(p, half_base, r.x);
    } else if (clip_style > 12.5 && clip_style < 13.5) {
        return sdNotchedBox(p, half_base, r.x);
    } else if (clip_style > 18.5 && clip_style < 19.5) {
        float st = (inner_en > 0.5) ? in_t : out_t;
        return sdPixelBox(p, half_base, st);
    }
    return sdShapeBox(p, half_base, r, sharp_zero);
}

float evalSoftShadowAlpha(float dist, float blur_px) {
    if (blur_px < 0.75) {
        return 1.0 - smoothstep(-0.75, 0.75, dist);
    }
    float b = max(blur_px, 1.0);
    float sigma = max(b * 0.45, 0.75);
    float x = max(0.0, dist + b * 0.15);
    float fade = 1.0 - smoothstep(b * 1.15, b * 1.65, max(0.0, dist));
    return clamp(exp(-(x * x) / (2.0 * sigma * sigma)) * fade, 0.0, 1.0);
}

float clockwisePerimDist(float2 p, float2 half_base) {
    float hx = max(half_base.x, 1.0);
    float hy = max(half_base.y, 1.0);
    // Normalized ratios decide which edge quadrant (0:top, 1:right, 2:bottom, 3:left)
    if (abs(p.y) / hy >= abs(p.x) / hx) {
        if (p.y < 0.0) {
            return (p.x + hx); // Top edge: 0 -> 2*hx
        }
        return (hx * 2.0) + (hy * 2.0) + (hx - p.x); // Bottom edge: R -> L
    }
    if (p.x >= 0.0) {
        return (hx * 2.0) + (p.y + hy); // Right edge: T -> B
    }
    return (hx * 4.0) + (hy * 2.0) + (hy - p.y); // Left edge: B -> T
}

float4 hslRainbow(float h) {
    float r = clamp(abs(frac(h + 0.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    float g = clamp(abs(frac(h + 0.6666667) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    float b = clamp(abs(frac(h + 0.3333333) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    return float4(r, g, b, 1.0);
}

float4 applyBorderAnimOverlay(
    float4 base_col,
    float2 p,
    float2 half_base,
    float a_type,
    float a_time,
    float a_speed,
    float a_size,
    float a_dir,
    float4 a_color2
) {
    if (a_type < 0.5 || base_col.a <= 0.001) return base_col;
    float dur = max(a_speed, 0.25);
    float cyc_raw = a_time / dur;
    float dir_sign = (a_dir < 0.0) ? -1.0 : 1.0;
    float phase = cyc_raw * 6.2831853 * dir_sign;
    if (a_dir > 1.5) {
        phase = sin(cyc_raw * 6.2831853) * 3.14159265;
    }

    float theta = atan2(p.y, p.x);
    float norm_ang = (theta + 3.14159265) / 6.2831853;
    float base_a = base_col.a;
    float3 anim_rgb = base_col.rgb;
    float anim_a = base_a;

    if (a_type < 1.5 || (a_type > 4.5 && a_type < 5.5)) {
        // 1: rotating beam, 5: radial rotating
        float arc = clamp(a_size / 100.0, 0.08, 1.0);
        float d = abs(frac(norm_ang - phase / 6.2831853 + 0.5) - 0.5);
        float beam = smoothstep(arc * 0.5, 0.0, d);
        anim_rgb = lerp(base_col.rgb, a_color2.rgb, beam);
    } else if (a_type < 2.5) {
        // 2: dual-beam
        float arc = clamp(a_size / 100.0, 0.08, 0.8);
        float offset = phase / 6.2831853;
        float d1 = abs(frac(norm_ang - offset + 0.5) - 0.5);
        float d2 = abs(frac(norm_ang - offset) - 0.5);
        float beam = max(smoothstep(arc * 0.4, 0.0, d1), smoothstep(arc * 0.4, 0.0, d2));
        anim_rgb = lerp(base_col.rgb, a_color2.rgb, beam);
    } else if (a_type < 3.5) {
        // 3: laser-scan
        float2 norm_p = p / max(half_base, float2(1.0, 1.0));
        float sweep_pos = frac(cyc_raw * dir_sign) * 3.2 - 1.6;
        float laser_d = (norm_p.x + norm_p.y * 0.7) - sweep_pos;
        float laser = exp(-laser_d * laser_d * 18.0);
        anim_rgb = lerp(base_col.rgb, a_color2.rgb, clamp(laser * 0.92, 0.0, 1.0));
    } else if (a_type < 4.5) {
        // 4: plasma
        float wave = 0.5 + 0.5 * sin(norm_ang * 18.8495 + phase * 2.0) * cos(norm_ang * 12.566 - phase * 1.4);
        anim_rgb = lerp(base_col.rgb, a_color2.rgb, wave * 0.78);
    } else if (a_type < 6.5) {
        // 6: pulsing
        float pulse = 0.55 + 0.45 * sin(phase);
        anim_rgb = base_col.rgb * (0.78 + 0.35 * pulse);
        anim_a = base_a * pulse;
    } else if (a_type < 7.5) {
        // 7: strobe-flash
        float f = frac(cyc_raw);
        float surge = (f < 0.10 || (f > 0.18 && f < 0.28)) ? 1.0 : 0.0;
        anim_rgb = lerp(base_col.rgb, a_color2.rgb, surge * 0.9);
    } else if (a_type < 8.5) {
        // 8: gradient sweep
        float cyc = 0.5 + 0.5 * sin(norm_ang * 6.2831853 + phase);
        anim_rgb = lerp(base_col.rgb, a_color2.rgb, cyc * 0.8);
    } else if (a_type < 9.5) {
        // 9: rainbow cycle
        float4 rb = hslRainbow(norm_ang + phase / 6.2831853);
        float lum = dot(base_col.rgb, float3(0.299, 0.587, 0.114));
        anim_rgb = rb.rgb * lerp(0.55, 1.15, clamp(lum, 0.0, 1.0));
    } else {
        // 10: marching ants
        float coord = clockwisePerimDist(p, half_base) / 28.0;
        float dash = step(0.5, frac(coord - cyc_raw * 6.0 * dir_sign));
        anim_rgb = lerp(base_col.rgb * 0.3, a_color2.rgb, dash);
        anim_a = base_a * (0.25 + 0.75 * dash);
    }

    return float4(anim_rgb, clamp(anim_a, 0.0, 1.0));
}

float4 evalStyledLayer(
    float2 p,
    float2 half_base,
    float band_t,
    float thickness,
    float style_code,
    float use_grad,
    float4 c1,
    float4 c2,
    float angle_rad
) {
    float4 col = c1;
    if (use_grad > 0.5) {
        float2 dir = float2(sin(angle_rad), -cos(angle_rad));
        float2 norm_p = p / max(half_base, float2(1.0, 1.0));
        float proj = clamp(dot(norm_p, dir) * 0.5 + 0.5, 0.0, 1.0);
        col = lerp(c1, c2, proj);
    }

    float p_dist = clockwisePerimDist(p, half_base);

    // 1: dashed
    if (style_code > 0.5 && style_code < 1.5) {
        float pitch = max(thickness * 3.2, 24.0);
        float f = frac(p_dist / pitch);
        float dash = smoothstep(0.42, 0.46, f) * (1.0 - smoothstep(0.94, 0.98, f));
        col.a *= step(0.42, f);
        return col;
    }

    // 2: dotted (true circular dots centered in band)
    if (style_code > 1.5 && style_code < 2.5) {
        float pitch = max(thickness * 1.5, 14.0);
        float cell_x = (frac(p_dist / pitch) - 0.5) * pitch;
        float cell_y = (band_t - 0.5) * thickness;
        float r = max(thickness * 0.38, 2.0);
        float dist_dot = length(float2(cell_x, cell_y));
        col.a *= (1.0 - smoothstep(r - 0.8, r + 0.8, dist_dot));
        return col;
    }

    // 3: double or 9: double-ring
    if ((style_code > 2.5 && style_code < 3.5) || (style_code > 8.5 && style_code < 9.5)) {
        if (band_t > 0.34 && band_t < 0.66) {
            if (style_code > 8.5) {
                col.rgb *= 0.18;
                col.a *= 0.45;
            } else {
                col.a = 0.0;
            }
        }
        return col;
    }

    // 4: groove, 5: ridge, 6: inset, 7: outset
    if (style_code > 3.5 && style_code < 7.5) {
        float2 dist_edge = half_base - abs(p);
        float is_tl = 0.0;
        if (abs(dist_edge.x - dist_edge.y) < 1.0) {
            is_tl = ((p.x + p.y) < 0.0) ? 1.0 : 0.0;
        } else if (dist_edge.x < dist_edge.y) {
            is_tl = (p.x < 0.0) ? 1.0 : 0.0;
        } else {
            is_tl = (p.y < 0.0) ? 1.0 : 0.0;
        }
        float invert = 0.0;
        if (style_code > 5.5 && style_code < 6.5) invert = 1.0; // inset
        if (style_code > 3.5 && style_code < 4.5 && band_t < 0.5) invert = 1.0; // groove
        if (style_code > 4.5 && style_code < 5.5 && band_t >= 0.5) invert = 1.0; // ridge
        float use_light = (invert > 0.5) ? (1.0 - is_tl) : is_tl;
        bool same_col = length(c2.rgb - c1.rgb) < 0.04;
        float4 light_c = same_col ? float4(lerp(c1.rgb, float3(1.0, 1.0, 1.0), 0.42), c1.a) : c1;
        float4 dark_c = same_col ? float4(c1.rgb * 0.38, c1.a) : c2;
        return (use_light > 0.5) ? light_c : dark_c;
    }

    // 8: neon-tube (hot white core)
    if (style_code > 7.5 && style_code < 8.5) {
        float core = 1.0 - smoothstep(0.10, 0.36, abs(band_t - 0.5));
        col.rgb = lerp(col.rgb, float3(1.0, 1.0, 1.0), core * 0.88);
        return col;
    }

    // 10: corner-brackets
    if (style_code > 9.5 && style_code < 10.5) {
        float2 corner_dist = half_base - abs(p);
        float span = clamp(min(half_base.x, half_base.y) * 0.28, 30.0, 220.0);
        if (corner_dist.x > span || corner_dist.y > span) {
            col.a = 0.0;
        }
        return col;
    }

    // 11: tech-hud
    if (style_code > 10.5 && style_code < 11.5) {
        float2 corner_dist = half_base - abs(p);
        float span = clamp(min(half_base.x, half_base.y) * 0.25, 28.0, 200.0);
        if (corner_dist.x > span || corner_dist.y > span) {
            bool mid_bar = (abs(p.x) < half_base.x * 0.16 && abs(p.y) > half_base.y * 0.5);
            if (!mid_bar && (band_t < 0.36 || band_t > 0.64)) col.a = 0.0;
            else col.a *= (mid_bar ? 0.95 : 0.48);
        }
        return col;
    }

    // 12: chamfer subtle inner bevel rail
    if (style_code > 11.5 && style_code < 12.5) {
        if (band_t < 0.28) {
            col.rgb = lerp(col.rgb, float3(1.0, 1.0, 1.0), 0.35);
        }
        return col;
    }

    // 13: notched subtle tech edge accent
    if (style_code > 12.5 && style_code < 13.5) {
        if (abs(p.x) < half_base.x * 0.22 && abs(p.y) > half_base.y * 0.5) {
            col.rgb = lerp(col.rgb, float3(1.0, 1.0, 1.0), 0.35);
        } else if (band_t > 0.35 && band_t < 0.65) {
            col.a *= 0.4;
        }
        return col;
    }

    // 14: crosshair
    if (style_code > 13.5 && style_code < 14.5) {
        float2 corner_dist = half_base - abs(p);
        float arm = clamp(min(half_base.x, half_base.y) * 0.2, 24.0, 160.0);
        bool in_corner = (corner_dist.x < arm && corner_dist.y < arm);
        bool in_reticle = (abs(p.x) < 24.0 || abs(p.y) < 24.0);
        if (!in_corner && !in_reticle) {
            if (band_t < 0.32 || band_t > 0.68) col.a = 0.0;
            else col.a *= 0.45;
        }
        if (abs(p.x) < 4.0 || abs(p.y) < 4.0) {
            col.rgb = lerp(col.rgb, float3(1.0, 1.0, 1.0), 0.65);
        }
        return col;
    }

    // 15: hazard stripes
    if (style_code > 14.5 && style_code < 15.5) {
        float pitch = max(thickness * 1.8, 18.0);
        float stripe = step(0.5, frac((p.x + p.y) / pitch));
        float4 c_alt = (use_grad > 0.5 && length(c2.rgb - c1.rgb) > 0.04) ? c2 : float4(0.08, 0.09, 0.11, c1.a);
        return (stripe > 0.5) ? c1 : c_alt;
    }

    // 16: chevron-track (clockwise unidirectional >>>)
    if (style_code > 15.5 && style_code < 16.5) {
        float pitch = max(thickness * 1.8, 18.0);
        float v = frac((p_dist - abs(band_t - 0.5) * thickness * 1.4) / pitch);
        float4 dark = (use_grad > 0.5 && length(c2.rgb - c1.rgb) > 0.04) ? c2 : float4(c1.rgb * 0.28, c1.a);
        return (v < 0.52) ? c1 : dark;
    }

    // 17: scallop-stamp
    if (style_code > 16.5 && style_code < 17.5) {
        float pitch = max(thickness * 1.4, 16.0);
        float dx = (frac(p_dist / pitch) - 0.5) * 2.0;
        float bump = sqrt(max(0.0, 1.0 - dx * dx));
        if (band_t > (0.45 + bump * 0.55)) col.a = 0.0;
        return col;
    }

    // 18: ornate-filigree (double piping rails + mini lattice + corner & edge-center diamonds exported in pass)
    if (style_code > 17.5 && style_code < 18.5) {
        if (band_t > 0.24 && band_t < 0.56) {
            float pitch = max(thickness * 2.2, 26.0);
            float fx = abs(frac(p_dist / pitch) - 0.5) * 2.0;
            float fy = abs((band_t - 0.40) / 0.16);
            if ((fx + fy) > 0.72) {
                col.a = 0.0;
            }
        } else if (band_t <= 0.24) {
            col.a *= 0.80;
        }
        return col;
    }

    // 19: pixel-arcade
    if (style_code > 18.5 && style_code < 19.5) {
        float pitch = max(thickness * 1.1, 12.0);
        float px = step(0.18, frac(p_dist / pitch));
        col.a *= px;
        return col;
    }

    // 20: film-sprocket (Cinema filmstrip: top/bottom punched perforations + crisp outer side guide rails)
    if (style_code > 19.5 && style_code < 20.5) {
        float hx_norm = max(half_base.x, 1.0);
        float hy_norm = max(half_base.y, 1.0);
        bool on_horiz = (abs(p.y) / hy_norm) >= (abs(p.x) / hx_norm);
        if (!on_horiz) {
            if (band_t < 0.62) col.a = 0.0;
            else col.a *= 0.78;
            return col;
        }
        float pitch = max(thickness * 2.4, 28.0);
        float hx = abs(frac(p_dist / pitch) - 0.5);
        float hy = abs(band_t - 0.5);
        float mx = smoothstep(0.22, 0.28, hx);
        float my = smoothstep(0.24, 0.30, hy);
        float hole_keep = max(mx, my);
        col.a *= hole_keep;
        return col;
    }

    // 21: marquee-bulbs (Theater marquee housing + glowing round bulbs)
    if (style_code > 20.5 && style_code < 21.5) {
        float pitch = max(thickness * 1.65, 16.0);
        float bx = (frac(p_dist / pitch) - 0.5) * pitch;
        float by = (band_t - 0.5) * thickness;
        float br = max(thickness * 0.28, 1.8);
        float bulb = 1.0 - smoothstep(br - 0.8, br + 0.8, length(float2(bx, by)));
        bool is_rail = (band_t < 0.16 || band_t > 0.84);
        col.rgb = lerp(col.rgb, float3(1.0, 1.0, 1.0), bulb * 0.42);
        col.a *= max(bulb, is_rail ? 0.76 : 0.24);
        return col;
    }

    // 22: viewfinder-ticks (Corner L-brackets + telemetry ruler ticks)
    if (style_code > 21.5 && style_code < 22.5) {
        float2 corner_dist = half_base - abs(p);
        float span = clamp(min(half_base.x, half_base.y) * 0.24, 24.0, 180.0);
        if (corner_dist.x <= span && corner_dist.y <= span && band_t < 0.48) {
            return col;
        }
        float tick_pitch = max(thickness * 0.95, 10.0);
        bool in_tick = frac(p_dist / tick_pitch) < 0.28;
        bool major_tick = frac(p_dist / (tick_pitch * 5.0)) < 0.20;
        if (band_t < 0.22) {
            col.a *= 0.48;
            return col;
        }
        if (in_tick && band_t <= (major_tick ? 0.96 : 0.58)) {
            col.a *= (major_tick ? 1.0 : 0.72);
            return col;
        }
        col.a = 0.0;
        return col;
    }

    // 23: circuit-trace (PCB alternating trace + circular solder pads)
    if (style_code > 22.5 && style_code < 23.5) {
        float pitch = max(thickness * 2.2, 24.0);
        float u = frac(p_dist / pitch);
        float lane = step(0.5, frac(p_dist / (pitch * 2.0)));
        float target_t = (lane > 0.5) ? 0.72 : 0.28;
        if (u > 0.82) {
            float k = (u - 0.82) / 0.18;
            target_t = lerp(target_t, (lane > 0.5) ? 0.28 : 0.72, k);
        }
        float d_trace = abs(band_t - target_t);
        float m_trace = 1.0 - smoothstep(0.11, 0.20, d_trace);
        float px_c = (u - 0.25) * pitch;
        float py_c = (band_t - target_t) * thickness;
        float pad_r = max(thickness * 0.24, 2.0);
        float m_pad = 1.0 - smoothstep(pad_r - 0.7, pad_r + 0.7, length(float2(px_c, py_c)));
        float rail_a = (band_t < 0.16) ? 0.34 : 0.0;
        col.a *= max(max(m_trace, m_pad), rail_a);
        return col;
    }

    // 24: art-deco (Double rails + stepped corner chevrons + edge center keystones)
    if (style_code > 23.5 && style_code < 24.5) {
        bool in_outer = band_t < 0.34;
        bool in_inner = band_t > 0.76;
        float2 corner_dist = half_base - abs(p);
        float step_span = clamp(min(half_base.x, half_base.y) * 0.22, 24.0, 140.0);
        bool in_corner_step = (corner_dist.x < step_span && corner_dist.y < step_span * 0.38)
                           || (corner_dist.y < step_span && corner_dist.x < step_span * 0.38)
                           || (corner_dist.x < step_span * 0.65 && corner_dist.y < step_span * 0.65);
        bool in_keystone = (abs(p.x) < max(thickness * 1.3, 18.0)) || (abs(p.y) < max(thickness * 1.3, 18.0));
        if (!in_outer && !in_inner && !in_corner_step && !in_keystone) {
            col.a = 0.0;
        }
        return col;
    }

    // 25: rivet-plate (Metallic plate with chamfer rails & circular bolt studs)
    if (style_code > 24.5 && style_code < 25.5) {
        float pitch = max(thickness * 2.2, 24.0);
        float bx = (frac(p_dist / pitch) - 0.5) * pitch;
        float by = (band_t - 0.5) * thickness;
        float d_r = length(float2(bx, by));
        float r_halo = max(thickness * 0.32, 2.4);
        float r_stud = max(thickness * 0.18, 1.4);
        float stud_m = 1.0 - smoothstep(r_stud - 0.6, r_stud + 0.6, d_r);
        float groove_m = (1.0 - smoothstep(r_halo - 0.6, r_halo + 0.6, d_r)) * smoothstep(r_stud - 0.4, r_stud + 0.4, d_r);
        col.rgb *= (0.86 + 0.16 * (1.0 - band_t));
        if (band_t < 0.15 || band_t > 0.85) {
            col.a *= 0.96;
        } else {
            col.rgb = lerp(col.rgb, float3(1.0, 1.0, 1.0), stud_m * 0.35);
            col.a *= lerp(0.76, 0.28, groove_m);
        }
        return col;
    }

    // 26: braid-weave (Crossing rope strands + edge trim rails)
    if (style_code > 25.5 && style_code < 26.5) {
        if (band_t < 0.14 || band_t > 0.86) {
            col.a *= 0.65;
            return col;
        }
        float pitch = max(thickness * 2.0, 22.0);
        float ang = (p_dist / pitch) * 6.2831853;
        float w1 = abs(band_t - (0.5 + 0.28 * sin(ang)));
        float w2 = abs(band_t - (0.5 - 0.28 * sin(ang)));
        float s1 = 1.0 - smoothstep(0.14, 0.22, w1);
        float s2 = 1.0 - smoothstep(0.14, 0.22, w2);
        float top_s = (cos(ang) >= 0.0) ? max(s1, s2 * 0.65) : max(s2, s1 * 0.65);
        col.a *= max(0.18, top_s);
        return col;
    }

    // 27: zigzag (Serrated sawtooth ribbon)
    if (style_code > 26.5 && style_code < 27.5) {
        float pitch = max(thickness * 1.45, 16.0);
        float tri = abs(frac(p_dist / pitch) - 0.5) * 2.0;
        float target_t = 0.18 + 0.64 * tri;
        float m = 1.0 - smoothstep(0.15, 0.26, abs(band_t - target_t));
        col.a *= m;
        return col;
    }

    // 28: sine-wave (Smooth continuous sinusoidal wave + faint outer rail)
    if (style_code > 27.5 && style_code < 28.5) {
        float pitch = max(thickness * 2.2, 22.0);
        float wv = 0.5 + 0.30 * sin((p_dist / pitch) * 6.2831853);
        float m = 1.0 - smoothstep(0.16, 0.27, abs(band_t - wv));
        float rail_a = (band_t < 0.12) ? 0.22 : 0.0;
        col.a *= max(m, rail_a);
        return col;
    }

    // 29: sketch-ink (Hand-drawn organic multi-pass ink strokes)
    if (style_code > 28.5 && style_code < 29.5) {
        float j1 = 0.50 + 0.15 * sin(p_dist * 0.17) + 0.08 * cos(p_dist * 0.41);
        float j2 = 0.46 + 0.14 * cos(p_dist * 0.23) + 0.09 * sin(p_dist * 0.37);
        float m1 = 1.0 - smoothstep(0.14, 0.24, abs(band_t - j1));
        float m2 = (1.0 - smoothstep(0.10, 0.20, abs(band_t - j2))) * 0.68;
        col.a *= clamp(max(m1, m2), 0.0, 1.0);
        return col;
    }

    // 30: segmented-bars (Uniform LED/telemetry bars along track)
    if (style_code > 29.5) {
        float pitch = max(thickness * 2.1, 20.0);
        float f = frac(p_dist / pitch);
        float seg = smoothstep(0.14, 0.18, f) * (1.0 - smoothstep(0.84, 0.88, f));
        float bar_m = (band_t >= 0.08 && band_t <= 0.92) ? seg : 0.0;
        col.a *= max(0.14, bar_m);
        return col;
    }

    return col;
}

float ornateOrnamentMask(float2 p, float2 half_base, float4 radii, float band_mid, float thickness) {
    float2 ap = abs(p);
    float pull = min(radii.x * 0.28, max(band_mid + 10.0, 14.0));
    float2 anchor = float2(half_base.x + band_mid - pull * 0.35, half_base.y + band_mid - pull * 0.35);
    float2 cd = abs(ap - anchor);
    float d_size = clamp(max(thickness * 1.45, 22.0), 14.0, 48.0);
    float d_corner = (cd.x + cd.y) - d_size;

    float fin_len = d_size * 2.2;
    float dx_in = anchor.x - ap.x;
    float d_fin_x = (dx_in >= 0.0 && dx_in <= fin_len) ? (cd.y - d_size * 0.42 * (1.0 - dx_in / fin_len)) : 1000.0;
    float dy_in = anchor.y - ap.y;
    float d_fin_y = (dy_in >= 0.0 && dy_in <= fin_len) ? (cd.x - d_size * 0.42 * (1.0 - dy_in / fin_len)) : 1000.0;

    float md_size = d_size * 0.72;
    float d_tb_mid = (ap.x + abs(ap.y - (half_base.y + band_mid))) - md_size;
    float d_lr_mid = (abs(ap.x - (half_base.x + band_mid)) + ap.y) - md_size;

    float d_orn = min(min(d_corner, min(d_fin_x, d_fin_y)), min(d_tb_mid, d_lr_mid));
    return 1.0 - smoothstep(-0.75, 0.75, d_orn);
}

float hash21(float2 co) {
    float2 k = float2(12.9898, 78.233);
    float dt = dot(co, k);
    return frac(sin(dt) * 43758.5453);
}

float4 evalBackgroundFill(float2 p, float2 half_base, float a_time) {
    if (bg_mode < 0.5) return float4(0.0, 0.0, 0.0, 0.0);

    float2 dir = float2(sin(bg_angle_rad), -cos(bg_angle_rad));
    float2 norm_p = p / max(half_base, float2(1.0, 1.0));
    float proj = clamp(dot(norm_p, dir) * 0.5 + 0.5, 0.0, 1.0);

    // 2: solid
    if (bg_mode > 1.5 && bg_mode < 2.5) {
        return bg_color1;
    }

    // 3: gradient
    if (bg_mode > 2.5 && bg_mode < 3.5) {
        return lerp(bg_color1, bg_color2, proj);
    }

    // 4: tv-static (Retro TV Static & Snow matching OverlayRetro)
    if (bg_mode > 3.5) {
        float sc = max(1.0, bg_static_scale);
        float s_speed = max(2.0, bg_static_speed);
        float t_stat = floor(a_time * s_speed);
        float2 px = p + half_base;
        if (bg_static_glitch > 0.01) {
            float band = floor(px.y / (8.0 * sc));
            float gh = hash21(float2(band, t_stat));
            if (gh > (1.0 - bg_static_glitch * 0.35)) {
                px.x += (gh - 0.5) * 120.0 * bg_static_glitch;
            }
        }
        float2 nc = floor(px / sc);
        float2 seed = float2(frac(t_stat * 0.1983), frac(t_stat * 0.3571)) * 1000.0;
        float wn = hash21(nc + seed);
        float3 snow = float3(wn, wn, wn);
        if (bg_static_color > 0.5) {
            snow.g = hash21(nc + seed + float2(13.1, 7.3));
            snow.b = hash21(nc + seed + float2(37.9, 19.4));
        }
        // Subtle CRT scanline bar
        float scan = 0.90 + 0.10 * sin(px.y * 0.95);
        float3 out_rgb = lerp(bg_color1.rgb, snow * scan, clamp(bg_static_noise, 0.0, 1.0));
        return float4(out_rgb * bg_color1.a, bg_color1.a);
    }

    // 1: person silhouette over subtle gradient backdrop
    float4 card = lerp(bg_color1, bg_color2, proj);
    float min_d = min(half_base.x, half_base.y);
    float head_r = min_d * 0.165;
    float d_head = length(p - float2(0.0, -min_d * 0.15)) - head_r;
    float2 torso_b = float2(min_d * 0.28, min_d * 0.21);
    float d_torso = sdRoundedBox(
        p - float2(0.0, min_d * 0.26),
        torso_b,
        float4(min_d * 0.19, min_d * 0.19, min_d * 0.05, min_d * 0.05)
    );
    float d_person = min(d_head, d_torso);
    float p_mask = (1.0 - smoothstep(-1.2, 1.2, d_person)) * bg_icon_color.a;
    float3 person_rgb = lerp(card.rgb, bg_icon_color.rgb, p_mask);
    return float4(person_rgb * card.a, card.a);
}

float4 PSDefault(VertDataOut v_in) : TARGET {
    float2 pixel_pos = v_in.uv * total_size;
    float2 center = total_size * 0.5;
    float2 p = pixel_pos - center;
    float2 half_base = base_size * 0.5;

    float clip_style = (inner_enabled > 0.5) ? inner_style : outer_style;
    float d_shape = evalShapeSDF(p, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, 1.0);

    // Sample video content safely and apply premultiplied corner clip
    float2 video_uv = (pixel_pos - pad_xy) / max(base_size, float2(1.0, 1.0));
    float4 video_col = float4(0.0, 0.0, 0.0, 0.0);
    if (video_uv.x >= 0.0 && video_uv.x <= 1.0 && video_uv.y >= 0.0 && video_uv.y <= 1.0) {
        video_col = image.Sample(textureSampler, clamp(video_uv, 0.0, 1.0));
    }
    float video_mask = 1.0 - smoothstep(-0.75, 0.75, d_shape);
    video_col *= video_mask;

    if (bg_mode > 0.5) {
        float4 bg_col = evalBackgroundFill(p, half_base, anim_time) * video_mask;
        if (bg_standby > 0.5) {
            video_col = bg_col;
        } else {
            video_col = video_col + bg_col * (1.0 - clamp(video_col.a, 0.0, 1.0));
        }
    }

    float total_inner = (inner_enabled > 0.5) ? inner_thickness : 0.0;
    float total_outer = (outer_enabled > 0.5) ? outer_thickness : 0.0;
    float shift = -seam_overlap;
    if (placement_code > 0.5 && placement_code < 1.5) {
        shift = -0.5 * (total_inner + total_outer);
    } else if (placement_code > 1.5) {
        shift = -(total_inner + total_outer + inner_gap + outer_gap);
    }

    // Accumulate premultiplied border layers
    float4 border_pm = float4(0.0, 0.0, 0.0, 0.0);

    float in_start = shift + inner_gap;
    float in_end = in_start + total_inner;
    if (inner_enabled > 0.5 && total_inner > 0.0) {
        float band_mask = smoothstep(in_start - 0.65, in_start + 0.65, d_shape)
                        * (1.0 - smoothstep(in_end - 0.65, in_end + 0.65, d_shape));
        float orn_mask = (inner_style > 17.5 && inner_style < 18.5)
            ? ornateOrnamentMask(p, half_base, radii, in_start + total_inner * 0.5, total_inner)
            : 0.0;
        float in_mask = max(band_mask, orn_mask);
        if (in_mask > 0.001) {
            float band_t = clamp((d_shape - in_start) / max(total_inner, 0.001), 0.0, 1.0);
            float eff_style = (orn_mask > 0.5) ? 0.0 : inner_style;
            float4 ic = evalStyledLayer(p, half_base, band_t, total_inner, eff_style, inner_grad, inner_color1, inner_color2, inner_angle_rad);
            ic = applyBorderAnimOverlay(ic, p, half_base, anim_type, anim_time, anim_speed, anim_size, anim_dir, anim_color2);
            float a = clamp(ic.a * in_mask, 0.0, 1.0);
            border_pm = float4(ic.rgb * a, a);
        }
    }

    float out_start = in_end + outer_gap;
    float out_end = out_start + total_outer;
    if (outer_enabled > 0.5 && total_outer > 0.0) {
        float band_mask = smoothstep(out_start - 0.65, out_start + 0.65, d_shape)
                        * (1.0 - smoothstep(out_end - 0.65, out_end + 0.65, d_shape));
        float orn_mask = (outer_style > 17.5 && outer_style < 18.5)
            ? ornateOrnamentMask(p, half_base, radii, out_start + total_outer * 0.5, total_outer)
            : 0.0;
        float out_mask = max(band_mask, orn_mask);
        if (out_mask > 0.001) {
            float band_t = clamp((d_shape - out_start) / max(total_outer, 0.001), 0.0, 1.0);
            float eff_style = (orn_mask > 0.5) ? 0.0 : outer_style;
            float4 oc = evalStyledLayer(p, half_base, band_t, total_outer, eff_style, outer_grad, outer_color1, outer_color2, outer_angle_rad);
            oc = applyBorderAnimOverlay(oc, p, half_base, anim_type, anim_time, anim_speed, anim_size, anim_dir, anim_color2);
            float oa = clamp(oc.a * out_mask, 0.0, 1.0);
            float4 oc_pm = float4(oc.rgb * oa, oa);
            border_pm = oc_pm + border_pm * (1.0 - oa);
        }
    }

    float glow_edge = (outer_enabled > 0.5 && total_outer > 0.0) ? out_end : in_end;
    float shadow_edge = (outer_enabled > 0.5 && total_outer > 0.0)
        ? out_end
        : ((inner_enabled > 0.5 && total_inner > 0.0) ? in_end : 0.0);
    float inset_edge = (inner_enabled > 0.5 && total_inner > 0.0)
        ? min(0.0, in_start)
        : ((outer_enabled > 0.5 && total_outer > 0.0) ? min(0.0, out_start) : 0.0);

    // Inner Shadow (inset over source video/background with optional true Multiply blend)
    if (shadow_enabled > 0.5 && shadow_mode >= 2.5 && d_shape <= inset_edge + 0.75) {
        float sharp_in = (shadow_blur < 0.75) ? 1.0 : 0.0;
        float d_in_sh = evalShapeSDF(p - shadow_offset, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, sharp_in) - (inset_edge - shadow_spread);
        float sa_in = evalSoftShadowAlpha(-d_in_sh, shadow_blur);
        float sh_ia = clamp(shadow_color.a * sa_in, 0.0, 1.0) * video_mask;
        if (shadow_multiply > 0.5) {
            video_col.rgb *= lerp(float3(1.0, 1.0, 1.0), shadow_color.rgb, sh_ia);
        } else {
            float4 is_pm = float4(shadow_color.rgb * sh_ia, sh_ia);
            video_col = is_pm + video_col * (1.0 - sh_ia);
        }
    }

    float4 shadow_pm = float4(0.0, 0.0, 0.0, 0.0);
    if (shadow_enabled > 0.5 && shadow_mode < 2.5 && placement_code < 1.5) {
        float edge = shadow_edge + shadow_spread;
        float sa_out = 0.0;
        if (shadow_mode > 1.5) {
            float d_c = evalShapeSDF(p - shadow_offset * 0.35, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, 0.0);
            float d_a = evalShapeSDF(p - shadow_offset, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, 0.0);
            float c_a = evalSoftShadowAlpha(d_c - edge, max(2.0, shadow_blur * 0.28));
            float a_a = evalSoftShadowAlpha(d_a - edge, shadow_blur);
            sa_out = clamp(max(c_a * 0.65, a_a * 0.75) + 0.2 * c_a * a_a, 0.0, 1.0);
        } else {
            float is_hard = (shadow_mode > 0.5 && shadow_mode < 1.5) ? 1.0 : 0.0;
            float eff_blur = (is_hard > 0.5) ? 0.0 : shadow_blur;
            float sharp_out = (eff_blur < 0.75) ? 1.0 : 0.0;
            float d_sh = evalShapeSDF(p - shadow_offset, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, sharp_out);
            sa_out = evalSoftShadowAlpha(d_sh - edge, eff_blur);
        }
        float sh_a = clamp(shadow_color.a * sa_out, 0.0, 1.0) * (1.0 - video_mask);
        shadow_pm = float4(shadow_color.rgb * sh_a, sh_a);
    }

    float4 glow_pm = float4(0.0, 0.0, 0.0, 0.0);
    if (glow_enabled > 0.5 && glow_blur > 0.5) {
        float pulse = (anim_type > 5.5 && anim_type < 6.5) ? (0.65 + 0.35 * sin(anim_time / max(anim_speed, 0.25) * 6.2831853)) : 1.0;
        if (glow_inner > 0.5 && d_shape < in_start) {
            float gd_in = max(0.0, in_start - d_shape);
            float ga = exp(-gd_in / max(glow_blur * 0.45, 1.0)) * 0.65 * pulse;
            ga *= (1.0 - smoothstep(glow_blur * 1.4, glow_blur * 1.9, gd_in));
            float a = clamp(glow_color.a * ga, 0.0, 1.0);
            glow_pm = float4(glow_color.rgb * a, a);
        } else if (glow_inner < 0.5 && placement_code < 1.5 && d_shape > glow_edge - 0.5) {
            float gd_out = max(0.0, d_shape - glow_edge);
            float ga = exp(-gd_out / max(glow_blur * 0.45, 1.0)) * 0.75 * pulse;
            ga *= (1.0 - smoothstep(glow_blur * 1.4, glow_blur * 1.9, gd_out));
            if (glow_neon > 0.5) {
                float core = exp(-gd_out / max(glow_blur * 0.14, 1.0));
                float a = clamp(glow_color.a * max(ga, core), 0.0, 1.0);
                float3 neon_rgb = lerp(glow_color.rgb, float3(1.0, 1.0, 1.0), core * 0.65);
                glow_pm = float4(neon_rgb * a, a);
            } else {
                float a = clamp(glow_color.a * ga, 0.0, 1.0);
                glow_pm = float4(glow_color.rgb * a, a);
            }
        }
    }

    // Composite premultiplied stack: border over glow & video over drop shadow
    float4 result = video_col;
    if (glow_inner > 0.5) {
        result = glow_pm + result * (1.0 - glow_pm.a * 0.35);
    } else {
        result = result + glow_pm * (1.0 - result.a);
    }
    result = result + shadow_pm * (1.0 - clamp(result.a, 0.0, 1.0));
    result = border_pm + result * (1.0 - border_pm.a);
    return result;
}

technique Draw {
    pass {
        vertex_shader = VSDefault(v_in);
        pixel_shader  = PSDefault(v_in);
    }
}
]]

-- ----------------------------------------------------------------------------
-- Simple JSON reader for StreamPulse manifest.json
-- ----------------------------------------------------------------------------
local function read_file_text(file_path)
    local f = io.open(file_path, "rb")
    if not f then return nil end
    local content = f:read("*all")
    f:close()
    return content
end

local function parse_number_array(str)
    local arr = {}
    for num in string.gmatch(str or "", "[-+]?%d*%.?%d+") do
        table.insert(arr, tonumber(num) or 0)
    end
    return arr
end

local function extract_number(block, key, fallback)
    local pat = '"' .. key .. '"%s*:%s*([-+]?%d*%.?%d+)'
    local val = string.match(block, pat)
    if val then return tonumber(val) or fallback end
    return fallback
end

local function extract_bool(block, key, fallback)
    local pat = '"' .. key .. '"%s*:%s*(%a+)'
    local val = string.match(block, pat)
    if val == "true" then return true end
    if val == "false" then return false end
    return fallback
end

local function extract_string(block, key, fallback)
    local pat = '"' .. key .. '"%s*:%s*"([^"]*)"'
    local val = string.match(block, pat)
    return val or fallback
end

local function extract_array_raw(block, key)
    local pat = '"' .. key .. '"%s*:%s*(%b[])'
    return string.match(block, pat)
end

local function extract_object_raw(block, key)
    local pat = '"' .. key .. '"%s*:%s*(%b{})'
    return string.match(block, pat)
end

local function parse_profile_block(block)
    local id = extract_string(block, "id", "")
    if id == "" then return nil end
    local inner_raw = extract_object_raw(block, "inner") or "{}"
    local outer_raw = extract_object_raw(block, "outer") or "{}"
    local glow_raw  = extract_object_raw(block, "glow") or "{}"
    local shad_raw  = extract_object_raw(block, "shadow") or "{}"
    local anim_raw  = extract_object_raw(block, "animation") or "{}"
    local bg_raw    = extract_object_raw(block, "background") or "{}"

    return {
        id = id,
        name = extract_string(block, "name", id),
        baseWidth = extract_number(block, "baseWidth", 1920),
        baseHeight = extract_number(block, "baseHeight", 1080),
        placementCode = extract_number(block, "placementCode", 0),
        autoScale = extract_bool(block, "autoScale", true) and 1.0 or 0.0,
        pad = extract_number(block, "pad", 48),
        seamOverlap = extract_number(block, "seamOverlap", 1),
        radii = parse_number_array(extract_array_raw(block, "radii") or "[20,20,20,20]"),
        inner = {
            enabled = extract_bool(inner_raw, "enabled", true) and 1.0 or 0.0,
            styleCode = extract_number(inner_raw, "styleCode", 0),
            gradient = extract_bool(inner_raw, "gradient", false) and 1.0 or 0.0,
            thickness = extract_number(inner_raw, "thickness", 12),
            gap = extract_number(inner_raw, "gap", 0),
            color1Rgba = parse_number_array(extract_array_raw(inner_raw, "color1Rgba") or "[1,1,1,1]"),
            color2Rgba = parse_number_array(extract_array_raw(inner_raw, "color2Rgba") or "[0.6,0.6,0.6,1]"),
            angle = extract_number(inner_raw, "angle", 180)
        },
        outer = {
            enabled = extract_bool(outer_raw, "enabled", false) and 1.0 or 0.0,
            styleCode = extract_number(outer_raw, "styleCode", 0),
            gradient = extract_bool(outer_raw, "gradient", false) and 1.0 or 0.0,
            thickness = extract_number(outer_raw, "thickness", 2),
            gap = extract_number(outer_raw, "gap", 0),
            color1Rgba = parse_number_array(extract_array_raw(outer_raw, "color1Rgba") or "[0.6,0.64,0.26,1]"),
            color2Rgba = parse_number_array(extract_array_raw(outer_raw, "color2Rgba") or "[0.01,0.43,0.33,1]"),
            angle = extract_number(outer_raw, "angle", 180)
        },
        glow = {
            enabled = extract_bool(glow_raw, "enabled", false) and 1.0 or 0.0,
            colorRgba = parse_number_array(extract_array_raw(glow_raw, "colorRgba") or "[0.22,0.74,0.97,1]"),
            blur = extract_number(glow_raw, "blur", 16),
            neon = extract_bool(glow_raw, "neon", false) and 1.0 or 0.0,
            inner = extract_bool(glow_raw, "inner", false) and 1.0 or 0.0
        },
        shadow = {
            enabled = extract_bool(shad_raw, "enabled", false) and 1.0 or 0.0,
            modeCode = extract_number(shad_raw, "modeCode", 0),
            colorRgba = parse_number_array(extract_array_raw(shad_raw, "colorRgba") or "[0,0,0,0.7]"),
            offsetX = extract_number(shad_raw, "offsetX", 10),
            offsetY = extract_number(shad_raw, "offsetY", 14),
            blur = extract_number(shad_raw, "blur", 24),
            spread = extract_number(shad_raw, "spread", 0),
            multiply = extract_bool(shad_raw, "multiply", true) and 1.0 or 0.0
        },
        animation = {
            typeCode = extract_number(anim_raw, "typeCode", 0),
            speed = extract_number(anim_raw, "speed", 4.0),
            size = extract_number(anim_raw, "size", 35),
            dirCode = extract_number(anim_raw, "dirCode", 1),
            color2Rgba = parse_number_array(extract_array_raw(anim_raw, "color2Rgba") or "[1,1,1,1]")
        },
        background = {
            modeCode = extract_number(bg_raw, "modeCode", 0),
            standby = extract_bool(bg_raw, "standby", false) and 1.0 or 0.0,
            color1Rgba = parse_number_array(extract_array_raw(bg_raw, "color1Rgba") or "[0.086,0.125,0.184,1]"),
            color2Rgba = parse_number_array(extract_array_raw(bg_raw, "color2Rgba") or "[0.043,0.063,0.106,1]"),
            angle = extract_number(bg_raw, "angle", 135),
            iconColorRgba = parse_number_array(extract_array_raw(bg_raw, "iconColorRgba") or "[0.39,0.45,0.55,1]"),
            staticNoise = extract_number(bg_raw, "staticNoise", 75) / 100.0,
            staticScale = extract_number(bg_raw, "staticScale", 3.0),
            staticSpeed = extract_number(bg_raw, "staticSpeed", 16),
            staticColor = extract_bool(bg_raw, "staticColor", false) and 1.0 or 0.0,
            staticGlitch = extract_number(bg_raw, "staticGlitch", 35) / 100.0
        }
    }
end

local function reload_manifest(force)
    local f = io.open(manifest_path, "rb")
    if not f then return false end
    local head = f:read(160) or ""
    local rev = extract_number(head, "revision", 0)
    if not force and rev > 0 and rev == manifest_revision then
        f:close()
        return false
    end
    local rest = f:read("*all") or ""
    f:close()
    local text = head .. rest
    if text == "" then return false end
    if rev == 0 then rev = extract_number(text, "revision", 0) end
    local sig = tostring(rev) .. ":" .. tostring(#text)
    if not force and sig == manifest_last_sig and rev > 0 then
        return false
    end
    manifest_revision = rev
    manifest_last_sig = sig
    default_profile_id = extract_string(text, "activeProfileId", default_profile_id)

    local profiles_arr = extract_array_raw(text, "profiles") or "[]"
    local next_map = {}
    for obj in string.gmatch(profiles_arr, "%b{}") do
        local p = parse_profile_block(obj)
        if p and p.id then
            next_map[p.id] = p
        end
    end
    profiles_by_id = next_map

    local rules_raw = extract_object_raw(text, "assignmentRules") or "{}"
    local next_rules = {}
    for k, v in string.gmatch(rules_raw, '"([^"]+)"%s*:%s*"([^"]*)"') do
        next_rules[k] = v
    end
    assignment_rules = next_rules

    local scales_raw = extract_object_raw(text, "sceneScales") or "{}"
    local next_scales = {}
    for k, v in string.gmatch(scales_raw, '"([^"]+)"%s*:%s*([-+]?%d*%.?%d+)') do
        next_scales[k] = tonumber(v) or 1.0
    end
    scene_scales = next_scales
    obs.blog(obs.LOG_INFO, "[StreamPulse Borders] Synced manifest rev " .. tostring(rev) .. " (default=" .. tostring(default_profile_id) .. ")")
    return true
end

local function collect_live_scene_scales(scene_obj, scene_name, parent_scale, out_map)
    if scene_obj == nil or not obs.obs_scene_enum_items then return end
    local items = obs.obs_scene_enum_items(scene_obj)
    if items == nil then return end
    local sv = obs.vec2()
    local bv = obs.vec2()
    for _, item in ipairs(items) do
        local src = obs.obs_sceneitem_get_source(item)
        if src ~= nil then
            local sname = obs.obs_source_get_name(src) or ""
            local sx = 1.0
            local sy = 1.0
            if obs.obs_sceneitem_get_scale then
                obs.obs_sceneitem_get_scale(item, sv)
                sx = math.abs(sv.x or 1.0)
                sy = math.abs(sv.y or 1.0)
            end
            local eff_item_scale = math.max(0.05, math.min(sx, sy)) * (parent_scale or 1.0)
            if obs.obs_sceneitem_get_bounds_type and obs.obs_sceneitem_get_bounds then
                local btype = obs.obs_sceneitem_get_bounds_type(item)
                if btype ~= nil and btype ~= (obs.OBS_BOUNDS_NONE or 0) then
                    obs.obs_sceneitem_get_bounds(item, bv)
                    local sw = obs.obs_source_get_width(src)
                    local sh = obs.obs_source_get_height(src)
                    if sw > 0 and sh > 0 and bv.x > 1 and bv.y > 1 then
                        eff_item_scale = math.max(0.05, math.min(bv.x / sw, bv.y / sh)) * (parent_scale or 1.0)
                    end
                end
            end
            if sname ~= "" then
                local k = scene_name .. "::" .. sname
                local visible = (not obs.obs_sceneitem_visible) or obs.obs_sceneitem_visible(item)
                if out_map[k] == nil or visible then
                    out_map[k] = eff_item_scale
                end
            end
            if obs.obs_sceneitem_is_group and obs.obs_sceneitem_is_group(item) and obs.obs_sceneitem_group_enum_items then
                local gitems = obs.obs_sceneitem_group_enum_items(item)
                if gitems ~= nil then
                    for _, gitem in ipairs(gitems) do
                        local gsrc = obs.obs_sceneitem_get_source(gitem)
                        if gsrc ~= nil then
                            local gname = obs.obs_source_get_name(gsrc) or ""
                            local gsx, gsy = 1.0, 1.0
                            if obs.obs_sceneitem_get_scale then
                                obs.obs_sceneitem_get_scale(gitem, sv)
                                gsx = math.abs(sv.x or 1.0)
                                gsy = math.abs(sv.y or 1.0)
                            end
                            local geff = math.max(0.05, math.min(gsx, gsy)) * eff_item_scale
                            if gname ~= "" then
                                local gk = scene_name .. "::" .. gname
                                out_map[gk] = geff
                            end
                        end
                    end
                    obs.sceneitem_list_release(gitems)
                end
            end
        end
    end
    obs.sceneitem_list_release(items)
end

local function refresh_active_scene_name()
    if obs.obs_frontend_get_current_scene then
        local sc = obs.obs_frontend_get_current_scene()
        if sc ~= nil then
            active_scene_name = obs.obs_source_get_name(sc) or ""
            if active_scene_name ~= "" and obs.obs_scene_from_source then
                local scene_obj = obs.obs_scene_from_source(sc)
                if scene_obj ~= nil then
                    local next_live = {}
                    pcall(collect_live_scene_scales, scene_obj, active_scene_name, 1.0, next_live)
                    for k, v in pairs(next_live) do
                        live_scene_scales[k] = v
                    end
                end
            end
            obs.obs_source_release(sc)
        end
    end
end

local function set_vec2(vec, param, x, y)
    if param == nil or vec == nil then return end
    vec.x = x
    vec.y = y
    obs.gs_effect_set_vec2(param, vec)
end

local function set_vec4(vec, param, arr)
    if param == nil or vec == nil then return end
    local a = arr or {}
    vec.x = a[1] or 0
    vec.y = a[2] or 0
    vec.z = a[3] or 0
    vec.w = a[4] or 1
    obs.gs_effect_set_vec4(param, vec)
end

-- ----------------------------------------------------------------------------
-- OBS Effect Filter Definition
-- ----------------------------------------------------------------------------
local filter_def = {}
filter_def.id = "streampulse_border_filter"
filter_def.type = obs.OBS_SOURCE_TYPE_FILTER
filter_def.output_flags = obs.OBS_SOURCE_VIDEO

filter_def.get_name = function()
    return "StreamPulse Border"
end

filter_def.get_defaults = function(settings)
    obs.obs_data_set_default_string(settings, "profile_id", "auto")
    obs.obs_data_set_default_bool(settings, "respect_scene_rules", true)
end

filter_def.get_properties = function(data)
    reload_manifest(true)
    local props = obs.obs_properties_create()
    local list = obs.obs_properties_add_list(
        props,
        "profile_id",
        "StreamPulse Border Profile",
        obs.OBS_COMBO_TYPE_LIST,
        obs.OBS_COMBO_FORMAT_STRING
    )
    obs.obs_property_list_add_string(list, "Auto (StreamPulse Per-Source / Per-Scene Assignment)", "auto")
    obs.obs_property_list_add_string(list, "Off (Bypass Border)", "none")
    for id, prof in pairs(profiles_by_id) do
        obs.obs_property_list_add_string(list, prof.name .. " (" .. id .. ")", id)
    end
    obs.obs_properties_add_bool(props, "respect_scene_rules", "Use StreamPulse Per-Scene Overrides")
    return props
end

filter_def.update = function(data, settings)
    data.profile_id = obs.obs_data_get_string(settings, "profile_id")
    if data.profile_id == "" then data.profile_id = "auto" end
    data.respect_scene_rules = obs.obs_data_get_bool(settings, "respect_scene_rules")
    pcall(reload_manifest, true)
    pcall(refresh_active_scene_name)
end

filter_def.create = function(settings, source)
    local data = {}
    data.context = source
    data.profile_id = "auto"
    data.respect_scene_rules = true
    data.anim_time = 0
    data.base_w = 1920
    data.base_h = 1080
    data.total_w = 1920
    data.total_h = 1080
    data._v2 = obs.vec2()
    data._v4 = obs.vec4()
    data._radii = {20, 20, 20, 20}
    data.params = {}

    obs.obs_enter_graphics()
    data.effect = obs.gs_effect_create(EFFECT_SOURCE, "streampulse_border_effect", nil)
    if data.effect ~= nil then
        local names = {
            "base_size", "total_size", "pad_xy", "radii", "seam_overlap",
            "placement_code",
            "inner_enabled", "inner_style", "inner_grad", "inner_thickness", "inner_gap",
            "inner_color1", "inner_color2", "inner_angle_rad",
            "outer_enabled", "outer_style", "outer_grad", "outer_thickness", "outer_gap",
            "outer_color1", "outer_color2", "outer_angle_rad",
            "glow_enabled", "glow_color", "glow_blur", "glow_neon", "glow_inner",
            "shadow_enabled", "shadow_mode", "shadow_color", "shadow_offset", "shadow_blur", "shadow_spread", "shadow_multiply",
            "anim_type", "anim_time", "anim_speed", "anim_size", "anim_dir", "anim_color2",
            "bg_mode", "bg_standby", "bg_color1", "bg_color2", "bg_angle_rad", "bg_icon_color",
            "bg_static_noise", "bg_static_scale", "bg_static_speed", "bg_static_color", "bg_static_glitch"
        }
        for _, n in ipairs(names) do
            data.params[n] = obs.gs_effect_get_param_by_name(data.effect, n)
        end
    else
        obs.blog(obs.LOG_ERROR, "[StreamPulse Borders] Failed to compile Metal/GPU effect shader")
    end
    obs.obs_leave_graphics()

    filter_def.update(data, settings)
    reload_manifest(false)
    return data
end

filter_def.destroy = function(data)
    obs.obs_enter_graphics()
    if data.effect ~= nil then
        obs.gs_effect_destroy(data.effect)
        data.effect = nil
    end
    obs.obs_leave_graphics()
end

local function resolve_active_profile(data)
    local parent = obs.obs_filter_get_parent(data.context)
    local target = parent or obs.obs_filter_get_target(data.context)
    local target_name = target and obs.obs_source_get_name(target) or ""
    local pid = data.profile_id

    if pid == "auto" or pid == "" then
        if data.respect_scene_rules and active_scene_name ~= "" and target_name ~= "" then
            local scene_key = active_scene_name .. "::" .. target_name
            if assignment_rules[scene_key] ~= nil then
                pid = assignment_rules[scene_key]
            end
        end
        if (pid == "auto" or pid == "") and target_name ~= "" and assignment_rules[target_name] ~= nil then
            pid = assignment_rules[target_name]
        end
        if pid == "auto" or pid == "" then
            pid = default_profile_id
        end
    end

    if pid == "off" or pid == "none" or pid == "" then
        return nil
    end
    return profiles_by_id[pid]
end

filter_def.get_width = function(data)
    return data.total_w
end

filter_def.get_height = function(data)
    return data.total_h
end

filter_def.video_tick = function(data, seconds)
    data.anim_time = (data.anim_time or 0) + seconds
    local target = obs.obs_filter_get_target(data.context) or obs.obs_filter_get_parent(data.context)
    if target == nil then return end
    local bw = obs.obs_source_get_base_width(target)
    local bh = obs.obs_source_get_base_height(target)
    if bw == 0 or bh == 0 then
        bw = 1920
        bh = 1080
    end
    data.base_w = bw
    data.base_h = bh

    local prof = resolve_active_profile(data)
    if prof == nil then
        data.active_prof = nil
        data.total_w = bw
        data.total_h = bh
        return
    end
    data.active_prof = prof

    local parent = obs.obs_filter_get_parent(data.context)
    local name_src = parent or target
    local target_name = name_src and obs.obs_source_get_name(name_src) or ""
    local tx_scale = 1.0
    if active_scene_name ~= "" and target_name ~= "" then
        local live_key = active_scene_name .. "::" .. target_name
        local sc_val = live_scene_scales[live_key] or scene_scales[live_key]
        if sc_val ~= nil and sc_val > 0.05 then tx_scale = sc_val end
    end

    local scale = 1.0
    if (prof.autoScale or 1.0) > 0.5 then
        local ref_min = math.max(1.0, math.min(prof.baseWidth or 1920, prof.baseHeight or 1080))
        local cur_min = math.max(1.0, math.min(bw, bh))
        scale = math.max(0.25, math.min(4.0, cur_min / ref_min))
    elseif tx_scale < 0.999 or tx_scale > 1.001 then
        scale = math.max(0.25, math.min(8.0, 1.0 / tx_scale))
    end
    data.size_scale = scale

    local pad = 0
    if prof.placementCode == 0 or prof.placementCode == 1 then
        pad = math.ceil((prof.pad or 0) * scale)
    else
        pad = 0
    end
    data.pad = pad
    data.total_w = bw + (pad * 2)
    data.total_h = bh + (pad * 2)
end

filter_def.video_render = function(data)
    if data.effect == nil or data.active_prof == nil then
        obs.obs_source_skip_video_filter(data.context)
        return
    end
    local prof = data.active_prof
    if not obs.obs_source_process_filter_begin(data.context, obs.GS_RGBA, obs.OBS_NO_DIRECT_RENDERING) then
        return
    end

    local p = data.params
    local v2 = data._v2
    local v4 = data._v4
    local pad = data.pad or 0
    local sc = data.size_scale or 1.0
    local raw_r = prof.radii or {20, 20, 20, 20}
    local scaled_radii = data._radii or {20, 20, 20, 20}
    scaled_radii[1] = (raw_r[1] or 20) * sc
    scaled_radii[2] = (raw_r[2] or 20) * sc
    scaled_radii[3] = (raw_r[3] or 20) * sc
    scaled_radii[4] = (raw_r[4] or 20) * sc
    set_vec2(v2, p.base_size, data.base_w, data.base_h)
    set_vec2(v2, p.total_size, data.total_w, data.total_h)
    set_vec2(v2, p.pad_xy, pad, pad)
    set_vec4(v4, p.radii, scaled_radii)
    obs.gs_effect_set_float(p.seam_overlap, (prof.seamOverlap or 1.0) * sc)
    obs.gs_effect_set_float(p.placement_code, prof.placementCode or 0.0)

    obs.gs_effect_set_float(p.inner_enabled, prof.inner.enabled or 1.0)
    obs.gs_effect_set_float(p.inner_style, prof.inner.styleCode or 0.0)
    obs.gs_effect_set_float(p.inner_grad, prof.inner.gradient or 0.0)
    obs.gs_effect_set_float(p.inner_thickness, (prof.inner.thickness or 12.0) * sc)
    obs.gs_effect_set_float(p.inner_gap, (prof.inner.gap or 0.0) * sc)
    set_vec4(v4, p.inner_color1, prof.inner.color1Rgba)
    set_vec4(v4, p.inner_color2, prof.inner.color2Rgba)
    obs.gs_effect_set_float(p.inner_angle_rad, (prof.inner.angle or 180.0) * 3.14159265 / 180.0)

    obs.gs_effect_set_float(p.outer_enabled, prof.outer.enabled or 0.0)
    obs.gs_effect_set_float(p.outer_style, prof.outer.styleCode or 0.0)
    obs.gs_effect_set_float(p.outer_grad, prof.outer.gradient or 0.0)
    obs.gs_effect_set_float(p.outer_thickness, (prof.outer.thickness or 2.0) * sc)
    obs.gs_effect_set_float(p.outer_gap, (prof.outer.gap or 0.0) * sc)
    set_vec4(v4, p.outer_color1, prof.outer.color1Rgba)
    set_vec4(v4, p.outer_color2, prof.outer.color2Rgba)
    obs.gs_effect_set_float(p.outer_angle_rad, (prof.outer.angle or 180.0) * 3.14159265 / 180.0)

    obs.gs_effect_set_float(p.glow_enabled, prof.glow.enabled or 0.0)
    set_vec4(v4, p.glow_color, prof.glow.colorRgba)
    obs.gs_effect_set_float(p.glow_blur, (prof.glow.blur or 16.0) * sc)
    obs.gs_effect_set_float(p.glow_neon, prof.glow.neon or 0.0)
    obs.gs_effect_set_float(p.glow_inner, prof.glow.inner or 0.0)

    local sh = prof.shadow or {}
    obs.gs_effect_set_float(p.shadow_enabled, sh.enabled or 0.0)
    obs.gs_effect_set_float(p.shadow_mode, sh.modeCode or 0.0)
    set_vec4(v4, p.shadow_color, sh.colorRgba)
    set_vec2(v2, p.shadow_offset, (sh.offsetX or 10.0) * sc, (sh.offsetY or 14.0) * sc)
    obs.gs_effect_set_float(p.shadow_blur, (sh.blur or 24.0) * sc)
    obs.gs_effect_set_float(p.shadow_spread, (sh.spread or 0.0) * sc)
    obs.gs_effect_set_float(p.shadow_multiply, sh.multiply ~= nil and sh.multiply or 1.0)

    obs.gs_effect_set_float(p.anim_type, prof.animation.typeCode or 0.0)
    obs.gs_effect_set_float(p.anim_time, data.anim_time or 0.0)
    obs.gs_effect_set_float(p.anim_speed, prof.animation.speed or 4.0)
    obs.gs_effect_set_float(p.anim_size, prof.animation.size or 35.0)
    obs.gs_effect_set_float(p.anim_dir, prof.animation.dirCode or 1.0)
    set_vec4(v4, p.anim_color2, prof.animation.color2Rgba)

    local bg = prof.background or {}
    obs.gs_effect_set_float(p.bg_mode, bg.modeCode or 0.0)
    obs.gs_effect_set_float(p.bg_standby, bg.standby or 0.0)
    set_vec4(v4, p.bg_color1, bg.color1Rgba)
    set_vec4(v4, p.bg_color2, bg.color2Rgba)
    obs.gs_effect_set_float(p.bg_angle_rad, (bg.angle or 135.0) * 3.14159265 / 180.0)
    set_vec4(v4, p.bg_icon_color, bg.iconColorRgba)
    obs.gs_effect_set_float(p.bg_static_noise, bg.staticNoise or 0.75)
    obs.gs_effect_set_float(p.bg_static_scale, bg.staticScale or 3.0)
    obs.gs_effect_set_float(p.bg_static_speed, bg.staticSpeed or 16.0)
    obs.gs_effect_set_float(p.bg_static_color, bg.staticColor or 0.0)
    obs.gs_effect_set_float(p.bg_static_glitch, bg.staticGlitch or 0.35)

    obs.obs_source_process_filter_end(data.context, data.effect, data.total_w, data.total_h)
end

-- ----------------------------------------------------------------------------
-- Script Lifecycle & Timer Polling
-- ----------------------------------------------------------------------------
function script_description()
    return "StreamPulse Border Filter (Beta / Advanced)\\n\\n"
        .. "Applies Metal-compatible outset/inset dual borders, all 31 Custom Overlay border styles, "
        .. "10 GPU animations, per-source & per-scene overrides, and live Variable Settings."
end

function script_properties()
    local props = obs.obs_properties_create()
    obs.obs_properties_add_path(
        props,
        "manifest_path",
        "StreamPulse Manifest JSON",
        obs.OBS_PATH_FILE,
        "JSON Files (*.json)",
        DEFAULT_MANIFEST_PATH
    )
    return props
end

function script_defaults(settings)
    obs.obs_data_set_default_string(settings, "manifest_path", DEFAULT_MANIFEST_PATH)
end

function script_update(settings)
    local path_setting = obs.obs_data_get_string(settings, "manifest_path")
    if path_setting and path_setting ~= "" then
        manifest_path = path_setting
    else
        manifest_path = DEFAULT_MANIFEST_PATH
    end
    reload_manifest(true)
end

local function on_poll_tick()
    reload_manifest(false)
    refresh_active_scene_name()
end

function script_load(settings)
    reload_manifest(true)
    refresh_active_scene_name()
    obs.obs_register_source(filter_def)
    obs.timer_add(on_poll_tick, 1000)
end

function script_unload()
    obs.timer_remove(on_poll_tick)
end
`;
}

function createObsBordersService({
    dataDir,
    safeWriteFileSync,
    getVariablesValues = () => ({}),
    isVariableSettingsEnabled = () => true,
    broadcastToOverlays = () => {}
} = {}) {
    const stateFile = path.join(dataDir, 'obs-borders.json');
    const exportDir = path.join(dataDir, 'obs-borders');
    const manifestPath = path.join(exportDir, 'manifest.json');
    const luaScriptPath = path.join(exportDir, 'streampulse-borders.lua');

    let lastManifestFingerprint = '';
    let lastManifestObj = null;
    let state = {
        revision: 1,
        activeProfileId: 'dual-gradient',
        profiles: buildDefaultProfiles(),
        knownScenes: [],
        knownSources: [],
        sourceSceneMap: {},
        sourceKinds: {},
        sceneScales: {},
        assignments: {}
    };

    function writeTextFileAtomic(targetPath, content) {
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (typeof safeWriteFileSync === 'function') {
            safeWriteFileSync(targetPath, content);
        } else {
            fs.writeFileSync(targetPath, content, 'utf8');
        }
    }

    function normalizeAssignments(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') return out;
        for (const [src, val] of Object.entries(raw)) {
            const cleanSrc = String(src || '').trim();
            if (!cleanSrc || !val || typeof val !== 'object') continue;
            const defaultProfileId = String(val.defaultProfileId || 'none').trim() || 'none';
            const sceneOverrides = {};
            if (val.sceneOverrides && typeof val.sceneOverrides === 'object') {
                for (const [sc, pid] of Object.entries(val.sceneOverrides)) {
                    const cleanSc = String(sc || '').trim();
                    const cleanPid = String(pid || '').trim();
                    if (!cleanSc || !cleanPid || cleanPid === 'inherit') continue;
                    if (defaultProfileId === 'none' && cleanPid === 'none') continue;
                    sceneOverrides[cleanSc] = cleanPid;
                }
            }
            if (defaultProfileId === 'none' && Object.keys(sceneOverrides).length === 0) {
                continue;
            }
            out[cleanSrc] = {
                defaultProfileId,
                sceneOverrides
            };
        }
        return out;
    }

    function normalizeTransformLock(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        return {
            enabled: Boolean(src.enabled),
            mode: src.mode === 'content' ? 'content' : 'outer-border'
        };
    }

    function resolveManifestProfileForSource(manifest, sourceName, sceneName = '') {
        if (!manifest || !Array.isArray(manifest.profiles)) return null;
        const rules = manifest.assignmentRules || {};
        const sc = String(sceneName || '').trim();
        const src = String(sourceName || '').trim();
        let pid = '';
        if (sc && src && rules[`${sc}::${src}`]) {
            pid = rules[`${sc}::${src}`];
        } else if (src && rules[src]) {
            pid = rules[src];
        } else {
            pid = manifest.activeProfileId || '';
        }
        if (!pid || pid === 'none') return null;
        return manifest.profiles.find(p => p.id === pid) || null;
    }

    function loadState() {
        try {
            if (fs.existsSync(stateFile)) {
                const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                if (raw && typeof raw === 'object') {
                    const profiles = Array.isArray(raw.profiles) && raw.profiles.length > 0
                        ? raw.profiles.map((p, i) => normalizeProfile(p, i))
                        : buildDefaultProfiles();
                    const activeProfileId = profiles.some(p => p.id === raw.activeProfileId)
                        ? raw.activeProfileId
                        : profiles[0].id;
                    state = {
                        revision: Math.max(1, Number(raw.revision) || 1),
                        activeProfileId,
                        profiles,
                        knownScenes: Array.isArray(raw.knownScenes) ? raw.knownScenes.slice(0, 400) : [],
                        knownSources: Array.isArray(raw.knownSources) ? raw.knownSources.slice(0, 400) : [],
                        sourceSceneMap: raw.sourceSceneMap && typeof raw.sourceSceneMap === 'object' ? raw.sourceSceneMap : {},
                        sourceKinds: raw.sourceKinds && typeof raw.sourceKinds === 'object' ? raw.sourceKinds : {},
                        sceneScales: raw.sceneScales && typeof raw.sceneScales === 'object' ? raw.sceneScales : {},
                        assignments: normalizeAssignments(raw.assignments),
                        transformLock: normalizeTransformLock(raw.transformLock)
                    };
                }
            }
        } catch (err) {
            console.error('[ObsBorders] Failed to load state:', err.message);
        }
        if (!state.transformLock) state.transformLock = normalizeTransformLock();
        syncResolvedManifest();
        ensureLuaScriptUpToDate();
    }

    function ensureLuaScriptUpToDate() {
        try {
            const expected = buildObsLuaScript({ manifestPath });
            const existing = fs.existsSync(luaScriptPath) ? fs.readFileSync(luaScriptPath, 'utf8') : '';
            if (existing !== expected) {
                writeTextFileAtomic(luaScriptPath, expected);
            }
            return expected;
        } catch (err) {
            console.error('[ObsBorders] Failed to sync Lua script:', err.message);
            return '';
        }
    }

    function buildAssignmentRulesMap() {
        const rules = {};
        for (const [sourceName, cfg] of Object.entries(state.assignments || {})) {
            if (cfg.defaultProfileId) {
                rules[sourceName] = cfg.defaultProfileId;
            }
            for (const [sceneName, profileId] of Object.entries(cfg.sceneOverrides || {})) {
                if (sceneName && profileId && profileId !== 'inherit') {
                    rules[`${sceneName}::${sourceName}`] = profileId;
                }
            }
        }
        return rules;
    }

    function saveState() {
        state.revision = (Number(state.revision) || 0) + 1;
        writeTextFileAtomic(stateFile, JSON.stringify(state, null, 2));
        syncResolvedManifest();
        broadcastToOverlays('obs-borders-update', getPublicState());
    }

    function syncResolvedManifest({ force = false } = {}) {
        try {
            const varValues = isVariableSettingsEnabled() ? (getVariablesValues() || {}) : {};
            const resolvedProfiles = state.profiles.map(p => resolveProfileForManifest(p, varValues));
            const assignmentRules = buildAssignmentRulesMap();
            const sceneScales = state.sceneScales && typeof state.sceneScales === 'object' ? state.sceneScales : {};
            const body = {
                activeProfileId: state.activeProfileId,
                assignmentRules,
                sceneScales,
                profiles: resolvedProfiles
            };
            const fingerprint = JSON.stringify(body);
            if (!force && fingerprint === lastManifestFingerprint && lastManifestObj && fs.existsSync(manifestPath)) {
                return lastManifestObj;
            }
            let previousRevision = Number(lastManifestObj?.revision) || 0;
            if (!lastManifestObj && fs.existsSync(manifestPath)) {
                try { previousRevision = Number(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).revision) || 0; } catch { /* replace invalid manifest */ }
            }
            const manifest = {
                revision: Math.max(Date.now(), previousRevision + 1),
                updatedAt: new Date().toISOString(),
                ...body
            };
            writeTextFileAtomic(manifestPath, JSON.stringify(manifest, null, 2));
            lastManifestFingerprint = fingerprint;
            lastManifestObj = manifest;
            return manifest;
        } catch (err) {
            console.error('[ObsBorders] Failed to sync manifest:', err.message);
            return null;
        }
    }

    function regenerateLuaScript() {
        const lua = buildObsLuaScript({ manifestPath });
        writeTextFileAtomic(luaScriptPath, lua);
        return lua;
    }

    function getPublicState() {
        const varValues = isVariableSettingsEnabled() ? (getVariablesValues() || {}) : {};
        const resolvedProfiles = state.profiles.map(p => resolveProfileForManifest(p, varValues));
        return {
            revision: state.revision,
            activeProfileId: state.activeProfileId,
            profiles: state.profiles,
            resolvedProfiles,
            assignments: state.assignments,
            assignmentRules: buildAssignmentRulesMap(),
            knownScenes: state.knownScenes,
            knownSources: state.knownSources,
            sourceSceneMap: state.sourceSceneMap,
            sourceKinds: state.sourceKinds || {},
            sceneScales: state.sceneScales || {},
            transformLock: normalizeTransformLock(state.transformLock),
            manifestPath,
            luaScriptPath,
            variableSettingsEnabled: Boolean(isVariableSettingsEnabled())
        };
    }

    function updateSettings({ transformLock } = {}) {
        if (transformLock && typeof transformLock === 'object') {
            state.transformLock = normalizeTransformLock({
                ...normalizeTransformLock(state.transformLock),
                ...transformLock
            });
            saveState();
        }
        return getPublicState();
    }

    function upsertProfile(rawProfile, { setActive = false } = {}) {
        const normalized = normalizeProfile(rawProfile, state.profiles.length);
        const existingIdx = state.profiles.findIndex(p => p.id === normalized.id);
        if (existingIdx >= 0) {
            state.profiles[existingIdx] = normalized;
        } else {
            state.profiles.push(normalized);
        }
        if (setActive || !state.profiles.some(p => p.id === state.activeProfileId)) {
            state.activeProfileId = normalized.id;
        }
        saveState();
        return normalized;
    }

    function deleteProfile(profileId) {
        if (state.profiles.length <= 1) {
            throw new Error('At least one border profile must remain');
        }
        const idx = state.profiles.findIndex(p => p.id === profileId);
        if (idx === -1) throw new Error('Border profile not found');
        state.profiles.splice(idx, 1);
        if (state.activeProfileId === profileId) {
            state.activeProfileId = state.profiles[0].id;
        }
        // Clean references in assignments
        for (const cfg of Object.values(state.assignments)) {
            if (cfg.defaultProfileId === profileId) cfg.defaultProfileId = 'none';
            for (const [sc, pid] of Object.entries(cfg.sceneOverrides || {})) {
                if (pid === profileId) delete cfg.sceneOverrides[sc];
            }
        }
        saveState();
        return getPublicState();
    }

    function duplicateProfile(profileId) {
        const source = state.profiles.find(p => p.id === profileId);
        if (!source) throw new Error('Border profile not found');
        const copy = JSON.parse(JSON.stringify(source));
        let suffix = 2;
        let suffixText = '-copy';
        let candidateId = `${source.id.slice(0, 64 - suffixText.length)}${suffixText}`;
        while (state.profiles.some(p => p.id === candidateId)) {
            suffixText = `-copy-${suffix++}`;
            candidateId = `${source.id.slice(0, 64 - suffixText.length)}${suffixText}`;
        }
        copy.id = candidateId;
        copy.name = `${source.name} (Copy)`;
        return upsertProfile(copy, { setActive: true });
    }

    function setActiveProfile(profileId) {
        const found = state.profiles.find(p => p.id === profileId);
        if (!found) throw new Error('Border profile not found');
        state.activeProfileId = found.id;
        saveState();
        return found;
    }

    function setBackgroundStandby({ profileId, enabled } = {}) {
        const targetId = profileId || state.activeProfileId;
        const found = state.profiles.find(p => p.id === targetId);
        if (!found) throw new Error('Border profile not found');
        if (!found.background || typeof found.background !== 'object') {
            found.background = normalizeBackground({});
        }
        const nextVal = enabled === 'toggle' || enabled === undefined
            ? !Boolean(found.background.standby)
            : Boolean(enabled === true || enabled === 1 || enabled === '1' || enabled === 'true');
        found.background.standby = nextVal;
        if (nextVal && found.background.mode === 'none') {
            found.background.mode = 'person';
        }
        saveState();
        return found;
    }

    function setSourceAssignment({ sourceName, sceneName = '', profileId } = {}) {
        const cleanSource = String(sourceName || '').trim();
        if (!cleanSource) throw new Error('sourceName is required');
        const cleanPid = String(profileId || 'none').trim() || 'none';
        if (!state.assignments[cleanSource]) {
            state.assignments[cleanSource] = { defaultProfileId: 'none', sceneOverrides: {} };
        }
        const entry = state.assignments[cleanSource];
        if (sceneName === '__all__') {
            entry.sceneOverrides = {};
        } else if (sceneName) {
            const cleanScene = String(sceneName).trim();
            if (cleanPid === 'inherit' || cleanPid === '' || (cleanPid === 'none' && entry.defaultProfileId === 'none')) {
                delete entry.sceneOverrides[cleanScene];
            } else {
                entry.sceneOverrides[cleanScene] = cleanPid;
            }
        } else {
            entry.defaultProfileId = cleanPid;
            if (cleanPid === 'none') {
                for (const [sc, pid] of Object.entries(entry.sceneOverrides || {})) {
                    if (pid === 'none' || pid === 'inherit' || !pid) {
                        delete entry.sceneOverrides[sc];
                    }
                }
            }
        }
        if (entry.defaultProfileId === 'none' && Object.keys(entry.sceneOverrides || {}).length === 0) {
            delete state.assignments[cleanSource];
        } else if (!state.knownSources.includes(cleanSource) && !state.knownScenes.includes(cleanSource)) {
            state.knownSources.push(cleanSource);
            state.knownSources.sort((a, b) => a.localeCompare(b));
        }
        saveState();
        return getPublicState();
    }

    function clearSourceAssignment(sourceName) {
        const cleanSource = String(sourceName || '').trim();
        if (!cleanSource) return getPublicState();
        if (state.assignments[cleanSource]) {
            delete state.assignments[cleanSource];
            saveState();
        }
        return getPublicState();
    }

    function resetDefaults() {
        state.profiles = buildDefaultProfiles();
        state.activeProfileId = state.profiles[0].id;
        state.assignments = {};
        saveState();
        return getPublicState();
    }

    /**
     * Replaces discovered scenes/sources cleanly from live OBS WebSocket `listScenesAndSources()`.
     */
    function syncFromObsDiscovery({ scenes = [], sources = [], byScene = {} } = {}) {
        const cleanScenes = [...new Set((scenes || []).map(s => String(s || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b))
            .slice(0, 400);
        const sceneSet = new Set(cleanScenes);

        const sourceMap = {};
        const sourceKinds = {};
        const nextSceneScales = {};
        const visualSourcesSet = new Set();

        for (const [sceneName, items] of Object.entries(byScene || {})) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                const name = String(item?.sourceName || '').trim();
                if (!name) continue;
                const kind = String(item?.inputKind || '');
                // Skip pure audio capture sources unless explicitly assigned
                if (/audio|wasapi|coreaudio|pulseaudio|alsa/i.test(kind) && !state.assignments[name]) {
                    continue;
                }
                if (sceneSet.has(name)) {
                    sourceKinds[name] = 'scene';
                } else {
                    visualSourcesSet.add(name);
                    if (kind && !sourceKinds[name]) sourceKinds[name] = kind;
                }
                if (!sourceMap[name]) sourceMap[name] = [];
                if (!sourceMap[name].includes(sceneName)) sourceMap[name].push(sceneName);
                const rawScale = Number(item?.sceneScale);
                if (Number.isFinite(rawScale) && rawScale > 0) {
                    const key = `${sceneName}::${name}`;
                    if (nextSceneScales[key] === undefined || item?.sceneItemEnabled !== false) {
                        nextSceneScales[key] = Number(rawScale.toFixed(4));
                    }
                }
            }
        }

        // Track scene containers cleanly without polluting visualSourcesSet
        for (const sc of cleanScenes) {
            sourceKinds[sc] = 'scene';
            if (!sourceMap[sc]) sourceMap[sc] = [];
        }

        // Include any extra sources returned flat if byScene was empty
        for (const src of sources || []) {
            const name = String(src || '').trim();
            if (name && !sceneSet.has(name) && Object.keys(byScene || {}).length === 0) {
                visualSourcesSet.add(name);
            }
        }

        const nextKnownSources = [...new Set([...visualSourcesSet])].sort((a, b) => a.localeCompare(b)).slice(0, 400);
        const nextAssignments = normalizeAssignments(state.assignments);

        // Prune assignments for deleted OBS sources/scenes & stale per-scene overrides
        if (cleanScenes.length > 0) {
            for (const [src, cfg] of Object.entries(nextAssignments)) {
                const existsInObs = visualSourcesSet.has(src) || sceneSet.has(src);
                if (!existsInObs) {
                    delete nextAssignments[src];
                    continue;
                }
                const srcScenes = sourceMap[src] || [];
                const nextOverrides = {};
                for (const [sc, pid] of Object.entries(cfg.sceneOverrides || {})) {
                    if (!sceneSet.has(sc)) continue;
                    if (src !== sc && Array.isArray(srcScenes) && !srcScenes.includes(sc)) continue;
                    if (cfg.defaultProfileId === 'none' && pid === 'none') continue;
                    if (pid && pid !== 'inherit') nextOverrides[sc] = pid;
                }
                cfg.sceneOverrides = nextOverrides;
                if (cfg.defaultProfileId === 'none' && Object.keys(cfg.sceneOverrides).length === 0) {
                    delete nextAssignments[src];
                }
            }
        }

        const prevSnap = JSON.stringify({
            knownScenes: state.knownScenes,
            knownSources: state.knownSources,
            sourceSceneMap: state.sourceSceneMap,
            sourceKinds: state.sourceKinds || {},
            sceneScales: state.sceneScales || {},
            assignments: state.assignments || {}
        });
        const nextSnap = JSON.stringify({
            knownScenes: cleanScenes,
            knownSources: nextKnownSources,
            sourceSceneMap: sourceMap,
            sourceKinds,
            sceneScales: nextSceneScales,
            assignments: nextAssignments
        });

        state.knownScenes = cleanScenes;
        state.knownSources = nextKnownSources;
        state.sourceSceneMap = sourceMap;
        state.sourceKinds = sourceKinds;
        state.sceneScales = nextSceneScales;
        state.assignments = nextAssignments;

        if (prevSnap !== nextSnap) {
            saveState();
        }

        return {
            scenesCount: state.knownScenes.length,
            sourcesCount: state.knownSources.length,
            scenes: state.knownScenes,
            sources: state.knownSources,
            sourceSceneMap: state.sourceSceneMap,
            sourceKinds: state.sourceKinds,
            sceneScales: state.sceneScales
        };
    }

    /**
     * Optional offline Scene Collection JSON importer.
     */
    function importObsSceneCollection({ filePath, jsonData } = {}) {
        let data = jsonData;
        if (!data && filePath) {
            const resolvedPath = String(filePath).trim().replace(/\\ /g, ' ').replace(/\\~/g, '~');
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`OBS scene file not found: ${resolvedPath}`);
            }
            data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        }
        if (!data || typeof data !== 'object' || !Array.isArray(data.sources)) {
            throw new Error('Invalid OBS Scene Collection JSON (missing sources array)');
        }

        const scenes = [];
        const sources = [];
        const byScene = {};

        for (const src of data.sources) {
            if (!src || !src.name) continue;
            if (src.id === 'scene') {
                scenes.push(src.name);
                const items = (src.settings && Array.isArray(src.settings.items)) ? src.settings.items : [];
                byScene[src.name] = items.map(it => ({ sourceName: it.name, inputKind: '' }));
            } else if (!/audio|wasapi|coreaudio/i.test(src.id || '')) {
                sources.push(src.name);
            }
        }

        const res = syncFromObsDiscovery({ scenes, sources, byScene });
        return {
            collectionName: data.name || 'OBS Scene Collection',
            ...res
        };
    }

    loadState();

    return {
        BORDER_STYLES,
        PLACEMENT_MODES,
        ANIMATION_TYPES,
        getState: getPublicState,
        reload: loadState,
        upsertProfile,
        deleteProfile,
        duplicateProfile,
        setActiveProfile,
        setBackgroundStandby,
        setSourceAssignment,
        clearSourceAssignment,
        updateSettings,
        resolveManifestProfileForSource,
        resetDefaults,
        syncResolvedManifest,
        regenerateLuaScript,
        syncFromObsDiscovery,
        importObsSceneCollection
    };
}

module.exports = {
    createObsBordersService,
    BORDER_STYLES,
    PLACEMENT_MODES,
    ANIMATION_TYPES,
    SHADOW_MODES,
    SHADOW_MODE_MAP,
    resolveProfileForManifest,
    hexToRgbaFloats
};
