/**
 * OBS Border Studio Service (Beta / Advanced)
 *
 * Manages reusable, variable-driven border profiles for OBS sources and nested
 * bundle scenes. Automatically resolves Variable Settings (`var:<key>|<fallback>`)
 * into `data/obs-borders/manifest.json` and generates the Metal-compatible
 * `streampulse-borders.lua` OBS effect filter script.
 */

const fs = require('fs');
const path = require('path');

const VAR_TOKEN_RE = /^(?:var:([a-zA-Z0-9_.-]+)(?:\|(.*))?|\{\{\s*var\.([a-zA-Z0-9_.-]+)(?:\|([\s\S]*?))?\s*\}\})$/;

const BORDER_STYLES = [
    'solid',
    'gradient',
    'conic-gradient',
    'outset-bevel',
    'inset-bevel',
    'ridge',
    'groove',
    'double',
    'corners'
];

const PLACEMENT_MODES = ['outset', 'center', 'inset'];
const ANIMATION_TYPES = ['none', 'rotate-gradient', 'pulse-glow', 'shimmer-bevel', 'color-cycle'];
const SCENE_MODES = ['all', 'include', 'exclude'];

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

function buildDefaultProfiles() {
    return [
        {
            id: 'dual-gradient-bundle',
            name: 'Dual Gradient Bundle (Inner + Outer)',
            description: 'Matches your 3-shader Bundle setup: 20px rounded corners, 12px white-to-silver inner outset border, and 2px gold-green outer accent ring in 1 Metal pass.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 48,
            seamOverlap: 1,
            cornerJoin: 'rounded',
            perCornerRadius: false,
            radius: 20,
            radiusTL: 20,
            radiusTR: 20,
            radiusBR: 20,
            radiusBL: 20,
            inner: {
                enabled: true,
                style: 'gradient',
                thickness: 12,
                gap: 0,
                color1: '#FFFFFFFF',
                color2: '#999999FF',
                angle: 180
            },
            outer: {
                enabled: true,
                style: 'gradient',
                thickness: 2,
                gap: 0,
                color1: '#99A443FF',
                color2: '#026E54FF',
                angle: 180
            },
            glow: {
                enabled: false,
                color: '#58A6FFFF',
                size: 18,
                intensity: 0.55
            },
            animation: {
                type: 'none',
                speed: 1.0
            },
            sceneMode: 'all',
            scenes: [],
            targetBundles: [
                'Bundle - Webcam Full w/ Border',
                'Bundle - Webcam ROOM Full w/ Border',
                'Bundle - Webcam Razer Full w/ Border',
                'Bundle - Continuity Cam Full w/ Border',
                'Bundle - Elgato w/ Border',
                'Bundle - Desktop  w/ Border'
            ]
        },
        {
            id: 'outset-3d-bevel',
            name: '3D Outset Mitered Bevel',
            description: 'Classic 45-degree mitered 3D outset frame with top/left highlight and bottom/right shadow bevels.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 48,
            seamOverlap: 1,
            cornerJoin: 'miter',
            perCornerRadius: false,
            radius: 0,
            radiusTL: 0,
            radiusTR: 0,
            radiusBR: 0,
            radiusBL: 0,
            inner: {
                enabled: true,
                style: 'outset-bevel',
                thickness: 14,
                gap: 0,
                color1: '#99A443FF',
                color2: '#026E54FF',
                angle: 135
            },
            outer: {
                enabled: true,
                style: 'solid',
                thickness: 2,
                gap: 0,
                color1: '#111820FF',
                color2: '#111820FF',
                angle: 0
            },
            glow: {
                enabled: true,
                color: '#00000099',
                size: 16,
                intensity: 0.5
            },
            animation: {
                type: 'shimmer-bevel',
                speed: 0.8
            },
            sceneMode: 'all',
            scenes: [],
            targetBundles: []
        },
        {
            id: 'neon-rotator',
            name: 'Animated Conic Neon Frame',
            description: '60fps GPU-animated rotating perimeter gradient with rounded corners and soft outer neon glow.',
            baseWidth: 1920,
            baseHeight: 1080,
            placement: 'outset',
            pad: 56,
            seamOverlap: 1,
            cornerJoin: 'rounded',
            perCornerRadius: false,
            radius: 24,
            radiusTL: 24,
            radiusTR: 24,
            radiusBR: 24,
            radiusBL: 24,
            inner: {
                enabled: true,
                style: 'conic-gradient',
                thickness: 8,
                gap: 0,
                color1: '#58A6FFFF',
                color2: '#A371F7FF',
                angle: 0
            },
            outer: {
                enabled: false,
                style: 'solid',
                thickness: 2,
                gap: 2,
                color1: '#FFFFFFFF',
                color2: '#58A6FFFF',
                angle: 0
            },
            glow: {
                enabled: true,
                color: '#58A6FFFF',
                size: 22,
                intensity: 0.7
            },
            animation: {
                type: 'rotate-gradient',
                speed: 1.2
            },
            sceneMode: 'all',
            scenes: [],
            targetBundles: []
        },
        {
            id: 'asymmetric-chat',
            name: 'Asymmetric Chat Corners',
            description: 'Independent per-corner radii (matching Chat Overlay 13/13/87/68) with an optional subtle accent stroke.',
            baseWidth: 530,
            baseHeight: 1040,
            placement: 'outset',
            pad: 32,
            seamOverlap: 1,
            cornerJoin: 'rounded',
            perCornerRadius: true,
            radius: 16,
            radiusTL: 13,
            radiusTR: 13,
            radiusBR: 87,
            radiusBL: 68,
            inner: {
                enabled: true,
                style: 'gradient',
                thickness: 4,
                gap: 0,
                color1: '#58A6FFCC',
                color2: '#1F6FEB66',
                angle: 160
            },
            outer: {
                enabled: false,
                style: 'solid',
                thickness: 0,
                gap: 0,
                color1: '#00000000',
                color2: '#00000000',
                angle: 0
            },
            glow: {
                enabled: false,
                color: '#00000088',
                size: 12,
                intensity: 0.4
            },
            animation: {
                type: 'none',
                speed: 1.0
            },
            sceneMode: 'all',
            scenes: [],
            targetBundles: ['Chat Overlay']
        }
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

function normalizeLayer(raw = {}, defaults = {}) {
    return {
        enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : Boolean(defaults.enabled),
        style: BORDER_STYLES.includes(raw.style) ? raw.style : (defaults.style || 'solid'),
        thickness: sanitizeNumberOrVar(raw.thickness, defaults.thickness ?? 8, 0, 200),
        gap: sanitizeNumberOrVar(raw.gap, defaults.gap ?? 0, 0, 100),
        color1: sanitizeColorOrVar(raw.color1, defaults.color1 || '#FFFFFFFF'),
        color2: sanitizeColorOrVar(raw.color2, defaults.color2 || '#888888FF'),
        angle: sanitizeNumberOrVar(raw.angle, defaults.angle ?? 180, -360, 360)
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
        placement: PLACEMENT_MODES.includes(raw.placement) ? raw.placement : defaults.placement,
        pad: Math.max(0, Math.min(400, Math.round(Number(raw.pad ?? defaults.pad)))),
        seamOverlap: Math.max(0, Math.min(10, Number(raw.seamOverlap ?? defaults.seamOverlap))),
        cornerJoin: raw.cornerJoin === 'miter' ? 'miter' : 'rounded',
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
            size: sanitizeNumberOrVar(raw.glow?.size, defaults.glow.size, 0, 150),
            intensity: sanitizeNumberOrVar(raw.glow?.intensity, defaults.glow.intensity, 0, 2)
        },
        animation: {
            type: ANIMATION_TYPES.includes(raw.animation?.type) ? raw.animation.type : defaults.animation.type,
            speed: sanitizeNumberOrVar(raw.animation?.speed, defaults.animation.speed, 0.05, 10)
        },
        sceneMode: SCENE_MODES.includes(raw.sceneMode) ? raw.sceneMode : 'all',
        scenes: Array.isArray(raw.scenes)
            ? [...new Set(raw.scenes.map(s => String(s || '').trim()).filter(Boolean))].slice(0, 300)
            : [],
        targetBundles: Array.isArray(raw.targetBundles)
            ? [...new Set(raw.targetBundles.map(s => String(s || '').trim()).filter(Boolean))].slice(0, 200)
            : []
    };
}

const STYLE_CODE_MAP = {
    'solid': 0,
    'gradient': 1,
    'conic-gradient': 2,
    'outset-bevel': 3,
    'inset-bevel': 4,
    'ridge': 5,
    'groove': 6,
    'double': 7,
    'corners': 8
};

const ANIM_CODE_MAP = {
    'none': 0,
    'rotate-gradient': 1,
    'pulse-glow': 2,
    'shimmer-bevel': 3,
    'color-cycle': 4
};

const PLACEMENT_CODE_MAP = {
    'outset': 0,
    'center': 1,
    'inset': 2
};

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
    const glowColor = col(profile.glow?.color, '#58A6FFFF');

    return {
        id: profile.id,
        name: profile.name,
        baseWidth: profile.baseWidth,
        baseHeight: profile.baseHeight,
        placement: profile.placement,
        placementCode: PLACEMENT_CODE_MAP[profile.placement] ?? 0,
        pad: profile.pad,
        seamOverlap: profile.seamOverlap,
        cornerJoin: profile.cornerJoin,
        cornerJoinCode: profile.cornerJoin === 'miter' ? 1 : 0,
        perCornerRadius: profile.perCornerRadius,
        radius: uniformR,
        radii: [rTL, rTR, rBR, rBL],
        inner: {
            enabled: Boolean(profile.inner?.enabled),
            style: profile.inner?.style || 'solid',
            styleCode: STYLE_CODE_MAP[profile.inner?.style] ?? 0,
            thickness: num(profile.inner?.thickness, 12, 0, 200),
            gap: num(profile.inner?.gap, 0, 0, 100),
            color1: innerColor1,
            color2: innerColor2,
            color1Rgba: hexToRgbaFloats(innerColor1, [1, 1, 1, 1]),
            color2Rgba: hexToRgbaFloats(innerColor2, [0.6, 0.6, 0.6, 1]),
            angle: num(profile.inner?.angle, 180, -360, 360)
        },
        outer: {
            enabled: Boolean(profile.outer?.enabled),
            style: profile.outer?.style || 'solid',
            styleCode: STYLE_CODE_MAP[profile.outer?.style] ?? 0,
            thickness: num(profile.outer?.thickness, 2, 0, 200),
            gap: num(profile.outer?.gap, 0, 0, 100),
            color1: outerColor1,
            color2: outerColor2,
            color1Rgba: hexToRgbaFloats(outerColor1, [0.6, 0.64, 0.26, 1]),
            color2Rgba: hexToRgbaFloats(outerColor2, [0.01, 0.43, 0.33, 1]),
            angle: num(profile.outer?.angle, 180, -360, 360)
        },
        glow: {
            enabled: Boolean(profile.glow?.enabled),
            color: glowColor,
            colorRgba: hexToRgbaFloats(glowColor, [0.34, 0.65, 1, 1]),
            size: num(profile.glow?.size, 18, 0, 150),
            intensity: num(profile.glow?.intensity, 0.55, 0, 2)
        },
        animation: {
            type: profile.animation?.type || 'none',
            typeCode: ANIM_CODE_MAP[profile.animation?.type] ?? 0,
            speed: num(profile.animation?.speed, 1.0, 0.05, 10)
        },
        sceneMode: profile.sceneMode || 'all',
        scenes: profile.scenes || [],
        targetBundles: profile.targetBundles || []
    };
}

/**
 * Generates the self-contained OBS Lua Filter Script (`streampulse-borders.lua`)
 * compatible with macOS Metal, Windows Direct3D 11, and Linux OpenGL.
 */
function buildObsLuaScript({ manifestPath }) {
    const escapedPath = String(manifestPath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `-- ============================================================================
-- StreamPulse OBS Border Filter (macOS Metal / D3D11 / OpenGL Compatible)
-- ============================================================================
-- HOW TO INSTALL IN OBS STUDIO:
-- 1. Open OBS Studio -> Tools -> Scripts
-- 2. Click '+' and select this file (streampulse-borders.lua)
-- 3. Right-click any Video Source, Nested Bundle Scene, or Group -> Filters
-- 4. Under Effect Filters, click '+' -> select "StreamPulse Border"
-- 5. Pick your Border Profile id (e.g., "dual-gradient-bundle").
--    Any Variable or Profile updates in StreamPulse auto-sync within 0.5s!
-- ============================================================================

local obs = obslua

local DEFAULT_MANIFEST_PATH = "${escapedPath}"
local manifest_path = DEFAULT_MANIFEST_PATH
local manifest_mtime = 0
local manifest_revision = 0
local profiles_by_id = {}
local target_overrides = {}
local default_profile_id = "dual-gradient-bundle"
local active_scene_name = ""

-- ----------------------------------------------------------------------------
-- Metal-safe libobs .effect shader (Single-pass SDF Outset/Inset + Dual Border)
-- ----------------------------------------------------------------------------
local EFFECT_SOURCE = [[
uniform float4x4 ViewProj;
uniform texture2d image;

uniform float2 base_size;
uniform float2 total_size;
uniform float2 pad_xy;
uniform float4 radii;
uniform float seam_overlap;
uniform int placement_code;
uniform int corner_join_code;

uniform int inner_enabled;
uniform int inner_style;
uniform float inner_thickness;
uniform float inner_gap;
uniform float4 inner_color1;
uniform float4 inner_color2;
uniform float inner_angle_rad;

uniform int outer_enabled;
uniform int outer_style;
uniform float outer_thickness;
uniform float outer_gap;
uniform float4 outer_color1;
uniform float4 outer_color2;
uniform float outer_angle_rad;

uniform int glow_enabled;
uniform float4 glow_color;
uniform float glow_size;
uniform float glow_intensity;

uniform int anim_type;
uniform float anim_time;
uniform float anim_speed;

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

float sdMiterBox(float2 p, float2 b) {
    float2 q = abs(p) - b;
    return max(q.x, q.y);
}

float4 evalLayerColor(
    float2 p,
    float2 half_base,
    float band_t,
    int style_code,
    float4 c1,
    float4 c2,
    float angle_rad,
    int a_type,
    float a_time,
    float a_speed
) {
    float phase = a_time * a_speed;
    float4 colA = c1;
    float4 colB = c2;

    if (a_type == 4) {
        float cyc = 0.5 + 0.5 * sin(phase * 2.5);
        colA = lerp(c1, c2, cyc);
        colB = lerp(c2, c1, cyc);
    }

    if (style_code == 0) {
        return colA;
    }

    if (style_code == 1) {
        float ang = angle_rad + ((a_type == 1) ? phase * 1.5 : 0.0);
        float2 dir = float2(sin(ang), -cos(ang));
        float2 norm_p = p / max(half_base, float2(1.0, 1.0));
        float proj = clamp(dot(norm_p, dir) * 0.5 + 0.5, 0.0, 1.0);
        return lerp(colA, colB, proj);
    }

    if (style_code == 2) {
        float ang = atan2(p.y, p.x) + ((a_type == 1) ? phase * 2.0 : angle_rad);
        float t = 0.5 + 0.5 * sin(ang);
        return lerp(colA, colB, t);
    }

    if (style_code == 3 || style_code == 4 || style_code == 5 || style_code == 6) {
        float2 dist_edge = half_base - abs(p);
        bool is_top_or_left = false;
        if (abs(dist_edge.x - dist_edge.y) < 0.5) {
            is_top_or_left = (p.x + p.y) < 0.0;
        } else if (dist_edge.x < dist_edge.y) {
            is_top_or_left = (p.x < 0.0);
        } else {
            is_top_or_left = (p.y < 0.0);
        }

        bool invert = (style_code == 4);
        if (style_code == 5 && band_t < 0.5) invert = true;
        if (style_code == 6 && band_t >= 0.5) invert = true;

        bool use_first = invert ? (!is_top_or_left) : is_top_or_left;
        float4 bevel_col = use_first ? colA : colB;

        if (a_type == 3) {
            float2 norm_p = p / max(half_base, float2(1.0, 1.0));
            float sweep_pos = frac(phase * 0.35) * 3.2 - 1.6;
            float shimmer = exp(-pow((norm_p.x + norm_p.y * 0.7) - sweep_pos, 2.0) * 18.0);
            bevel_col.rgb = clamp(bevel_col.rgb + shimmer * 0.38, 0.0, 1.0);
        }
        return bevel_col;
    }

    if (style_code == 7) {
        if (band_t > 0.33 && band_t < 0.67) {
            return float4(colB.rgb, colB.a * 0.2);
        }
        return (band_t <= 0.33) ? colA : colB;
    }

    if (style_code == 8) {
        float2 corner_dist = half_base - abs(p);
        float bracket_span = min(half_base.x, half_base.y) * 0.24;
        if (corner_dist.x > bracket_span && corner_dist.y > bracket_span) {
            return float4(0.0, 0.0, 0.0, 0.0);
        }
        return lerp(colA, colB, band_t);
    }

    return colA;
}

float4 PSDefault(VertDataOut v_in) : TARGET {
    float2 pixel_pos = v_in.uv * total_size;
    float2 center = total_size * 0.5;
    float2 p = pixel_pos - center;
    float2 half_base = base_size * 0.5;

    float d_round = sdRoundedBox(p, half_base, radii);
    float d_border = (corner_join_code == 1) ? sdMiterBox(p, half_base) : d_round;

    float2 video_uv = (pixel_pos - pad_xy) / max(base_size, float2(1.0, 1.0));
    float4 video_col = float4(0.0, 0.0, 0.0, 0.0);
    if (video_uv.x >= 0.0 && video_uv.x <= 1.0 && video_uv.y >= 0.0 && video_uv.y <= 1.0) {
        video_col = image.Sample(textureSampler, clamp(video_uv, 0.0, 1.0));
    }
    float video_mask = 1.0 - smoothstep(-0.75, 0.75, d_round);
    video_col.a *= video_mask;

    float total_inner = (inner_enabled != 0) ? inner_thickness : 0.0;
    float total_outer = (outer_enabled != 0) ? outer_thickness : 0.0;
    float shift = -seam_overlap;
    if (placement_code == 1) {
        shift = -0.5 * (total_inner + total_outer);
    } else if (placement_code == 2) {
        shift = -(total_inner + total_outer + inner_gap + outer_gap);
    }

    float4 border_accum = float4(0.0, 0.0, 0.0, 0.0);

    float in_start = shift + inner_gap;
    float in_end = in_start + total_inner;
    if (inner_enabled != 0 && total_inner > 0.0) {
        float in_mask = smoothstep(in_start - 0.65, in_start + 0.65, d_border)
                      * (1.0 - smoothstep(in_end - 0.65, in_end + 0.65, d_border));
        if (in_mask > 0.001) {
            float band_t = clamp((d_border - in_start) / max(total_inner, 0.001), 0.0, 1.0);
            float4 ic = evalLayerColor(p, half_base, band_t, inner_style, inner_color1, inner_color2, inner_angle_rad, anim_type, anim_time, anim_speed);
            ic.a *= in_mask;
            border_accum = ic;
        }
    }

    float out_start = in_end + outer_gap;
    float out_end = out_start + total_outer;
    if (outer_enabled != 0 && total_outer > 0.0) {
        float out_mask = smoothstep(out_start - 0.65, out_start + 0.65, d_border)
                       * (1.0 - smoothstep(out_end - 0.65, out_end + 0.65, d_border));
        if (out_mask > 0.001) {
            float band_t = clamp((d_border - out_start) / max(total_outer, 0.001), 0.0, 1.0);
            float4 oc = evalLayerColor(p, half_base, band_t, outer_style, outer_color1, outer_color2, outer_angle_rad, anim_type, anim_time, anim_speed);
            oc.a *= out_mask;
            border_accum = lerp(border_accum, oc, oc.a);
            border_accum.a = max(border_accum.a, oc.a);
        }
    }

    float glow_edge = (outer_enabled != 0 && total_outer > 0.0) ? out_end : in_end;
    float4 glow_accum = float4(0.0, 0.0, 0.0, 0.0);
    if (glow_enabled != 0 && glow_size > 0.5 && d_border > glow_edge - 0.5) {
        float gd = max(0.0, d_border - glow_edge);
        float pulse = (anim_type == 2) ? (0.75 + 0.25 * sin(anim_time * anim_speed * 3.0)) : 1.0;
        float g_alpha = exp(-gd / max(glow_size * 0.45, 1.0)) * glow_intensity * pulse;
        g_alpha *= (1.0 - smoothstep(glow_size * 1.4, glow_size * 1.8, gd));
        glow_accum = float4(glow_color.rgb, clamp(glow_color.a * g_alpha, 0.0, 1.0));
    }

    float4 base_comp = video_col;
    if (glow_accum.a > 0.001 && base_comp.a < 0.999) {
        float out_a = base_comp.a + glow_accum.a * (1.0 - base_comp.a);
        float3 out_rgb = (base_comp.rgb * base_comp.a + glow_accum.rgb * glow_accum.a * (1.0 - base_comp.a)) / max(out_a, 0.0001);
        base_comp = float4(out_rgb, out_a);
    }

    if (border_accum.a > 0.001) {
        float out_a = border_accum.a + base_comp.a * (1.0 - border_accum.a);
        float3 out_rgb = (border_accum.rgb * border_accum.a + base_comp.rgb * base_comp.a * (1.0 - border_accum.a)) / max(out_a, 0.0001);
        return float4(out_rgb, out_a);
    }

    return base_comp;
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

local function parse_string_array(str)
    local arr = {}
    for s in string.gmatch(str or "", '"([^"]*)"') do
        table.insert(arr, s)
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
    local pat = '"' .. key .. '"%s*:%s*(true|false)'
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
    local anim_raw  = extract_object_raw(block, "animation") or "{}"

    return {
        id = id,
        name = extract_string(block, "name", id),
        baseWidth = extract_number(block, "baseWidth", 1920),
        baseHeight = extract_number(block, "baseHeight", 1080),
        placementCode = extract_number(block, "placementCode", 0),
        pad = extract_number(block, "pad", 48),
        seamOverlap = extract_number(block, "seamOverlap", 1),
        cornerJoinCode = extract_number(block, "cornerJoinCode", 0),
        radii = parse_number_array(extract_array_raw(block, "radii") or "[20,20,20,20]"),
        sceneMode = extract_string(block, "sceneMode", "all"),
        scenes = parse_string_array(extract_array_raw(block, "scenes") or "[]"),
        inner = {
            enabled = extract_bool(inner_raw, "enabled", true) and 1 or 0,
            styleCode = extract_number(inner_raw, "styleCode", 1),
            thickness = extract_number(inner_raw, "thickness", 12),
            gap = extract_number(inner_raw, "gap", 0),
            color1Rgba = parse_number_array(extract_array_raw(inner_raw, "color1Rgba") or "[1,1,1,1]"),
            color2Rgba = parse_number_array(extract_array_raw(inner_raw, "color2Rgba") or "[0.6,0.6,0.6,1]"),
            angle = extract_number(inner_raw, "angle", 180)
        },
        outer = {
            enabled = extract_bool(outer_raw, "enabled", true) and 1 or 0,
            styleCode = extract_number(outer_raw, "styleCode", 1),
            thickness = extract_number(outer_raw, "thickness", 2),
            gap = extract_number(outer_raw, "gap", 0),
            color1Rgba = parse_number_array(extract_array_raw(outer_raw, "color1Rgba") or "[0.6,0.64,0.26,1]"),
            color2Rgba = parse_number_array(extract_array_raw(outer_raw, "color2Rgba") or "[0.01,0.43,0.33,1]"),
            angle = extract_number(outer_raw, "angle", 180)
        },
        glow = {
            enabled = extract_bool(glow_raw, "enabled", false) and 1 or 0,
            colorRgba = parse_number_array(extract_array_raw(glow_raw, "colorRgba") or "[0.34,0.65,1,1]"),
            size = extract_number(glow_raw, "size", 18),
            intensity = extract_number(glow_raw, "intensity", 0.55)
        },
        animation = {
            typeCode = extract_number(anim_raw, "typeCode", 0),
            speed = extract_number(anim_raw, "speed", 1.0)
        }
    }
end

local function reload_manifest(force)
    local text = read_file_text(manifest_path)
    if not text or text == "" then return false end
    local rev = extract_number(text, "revision", 0)
    if not force and rev == manifest_revision and rev > 0 then
        return false
    end
    manifest_revision = rev
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

    local overrides_raw = extract_object_raw(text, "targetOverrides") or "{}"
    local next_overrides = {}
    for k, v in string.gmatch(overrides_raw, '"([^"]+)"%s*:%s*"([^"]*)"') do
        next_overrides[k] = v
    end
    target_overrides = next_overrides
    return true
end

local function refresh_active_scene_name()
    if obs.obs_frontend_get_current_scene then
        local sc = obs.obs_frontend_get_current_scene()
        if sc ~= nil then
            active_scene_name = obs.obs_source_get_name(sc) or ""
            obs.obs_source_release(sc)
        end
    end
end

local function is_profile_active_for_scene(profile, scene_name)
    if not profile then return false end
    local mode = profile.sceneMode or "all"
    if mode == "all" or scene_name == "" then return true end
    local list = profile.scenes or {}
    if #list == 0 then return true end
    local matched = false
    for _, s in ipairs(list) do
        if s == scene_name then
            matched = true
            break
        end
    end
    if mode == "include" then return matched end
    if mode == "exclude" then return not matched end
    return true
end

local function set_vec2(param, x, y)
    if param == nil then return end
    local v = obs.vec2()
    v.x = x
    v.y = y
    obs.gs_effect_set_vec2(param, v)
end

local function set_vec4(param, arr)
    if param == nil then return end
    local v = obs.vec4()
    v.x = arr[1] or 0
    v.y = arr[2] or 0
    v.z = arr[3] or 0
    v.w = arr[4] or 1
    obs.gs_effect_set_vec4(param, v)
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
    obs.obs_property_list_add_string(list, "Auto (Active StreamPulse Profile / Target Assignment)", "auto")
    for id, prof in pairs(profiles_by_id) do
        obs.obs_property_list_add_string(list, prof.name .. " (" .. id .. ")", id)
    end
    obs.obs_properties_add_bool(props, "respect_scene_rules", "Respect StreamPulse Per-Scene Include/Exclude Rules")
    return props
end

filter_def.update = function(data, settings)
    data.profile_id = obs.obs_data_get_string(settings, "profile_id")
    if data.profile_id == "" then data.profile_id = "auto" end
    data.respect_scene_rules = obs.obs_data_get_bool(settings, "respect_scene_rules")
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
    data.params = {}

    obs.obs_enter_graphics()
    data.effect = obs.gs_effect_create(EFFECT_SOURCE, "streampulse_border_effect", nil)
    if data.effect ~= nil then
        local names = {
            "base_size", "total_size", "pad_xy", "radii", "seam_overlap",
            "placement_code", "corner_join_code",
            "inner_enabled", "inner_style", "inner_thickness", "inner_gap",
            "inner_color1", "inner_color2", "inner_angle_rad",
            "outer_enabled", "outer_style", "outer_thickness", "outer_gap",
            "outer_color1", "outer_color2", "outer_angle_rad",
            "glow_enabled", "glow_color", "glow_size", "glow_intensity",
            "anim_type", "anim_time", "anim_speed"
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
    local target = obs.obs_filter_get_target(data.context)
    local target_name = target and obs.obs_source_get_name(target) or ""
    local pid = data.profile_id
    if pid == "auto" or pid == "" then
        if target_name ~= "" and target_overrides[target_name] then
            pid = target_overrides[target_name]
        else
            pid = default_profile_id
        end
    end
    if pid == "off" or pid == "none" then return nil end
    return profiles_by_id[pid] or profiles_by_id[default_profile_id]
end

filter_def.get_width = function(data)
    return data.total_w
end

filter_def.get_height = function(data)
    return data.total_h
end

filter_def.video_tick = function(data, seconds)
    data.anim_time = (data.anim_time or 0) + seconds
    local target = obs.obs_filter_get_target(data.context)
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
    if prof == nil or (data.respect_scene_rules and not is_profile_active_for_scene(prof, active_scene_name)) then
        data.active_prof = nil
        data.total_w = bw
        data.total_h = bh
        return
    end
    data.active_prof = prof
    local pad = (prof.placementCode == 0) and (prof.pad or 48) or 0
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
    local pad = data.pad or 0
    set_vec2(p.base_size, data.base_w, data.base_h)
    set_vec2(p.total_size, data.total_w, data.total_h)
    set_vec2(p.pad_xy, pad, pad)
    set_vec4(p.radii, prof.radii or {20, 20, 20, 20})
    obs.gs_effect_set_float(p.seam_overlap, prof.seamOverlap or 1.0)
    obs.gs_effect_set_int(p.placement_code, prof.placementCode or 0)
    obs.gs_effect_set_int(p.corner_join_code, prof.cornerJoinCode or 0)

    obs.gs_effect_set_int(p.inner_enabled, prof.inner.enabled or 1)
    obs.gs_effect_set_int(p.inner_style, prof.inner.styleCode or 0)
    obs.gs_effect_set_float(p.inner_thickness, prof.inner.thickness or 12)
    obs.gs_effect_set_float(p.inner_gap, prof.inner.gap or 0)
    set_vec4(p.inner_color1, prof.inner.color1Rgba)
    set_vec4(p.inner_color2, prof.inner.color2Rgba)
    obs.gs_effect_set_float(p.inner_angle_rad, (prof.inner.angle or 180) * 3.14159265 / 180.0)

    obs.gs_effect_set_int(p.outer_enabled, prof.outer.enabled or 0)
    obs.gs_effect_set_int(p.outer_style, prof.outer.styleCode or 0)
    obs.gs_effect_set_float(p.outer_thickness, prof.outer.thickness or 2)
    obs.gs_effect_set_float(p.outer_gap, prof.outer.gap or 0)
    set_vec4(p.outer_color1, prof.outer.color1Rgba)
    set_vec4(p.outer_color2, prof.outer.color2Rgba)
    obs.gs_effect_set_float(p.outer_angle_rad, (prof.outer.angle or 180) * 3.14159265 / 180.0)

    obs.gs_effect_set_int(p.glow_enabled, prof.glow.enabled or 0)
    set_vec4(p.glow_color, prof.glow.colorRgba)
    obs.gs_effect_set_float(p.glow_size, prof.glow.size or 18)
    obs.gs_effect_set_float(p.glow_intensity, prof.glow.intensity or 0.55)

    obs.gs_effect_set_int(p.anim_type, prof.animation.typeCode or 0)
    obs.gs_effect_set_float(p.anim_time, data.anim_time or 0)
    obs.gs_effect_set_float(p.anim_speed, prof.animation.speed or 1.0)

    obs.obs_source_process_filter_end(data.context, data.effect, data.total_w, data.total_h)
end

-- ----------------------------------------------------------------------------
-- Script Lifecycle & Timer Polling
-- ----------------------------------------------------------------------------
function script_description()
    return "StreamPulse Border Filter (Beta / Advanced)\\n\\n"
        .. "Applies Metal-compatible outset/inset dual borders, 3D bevels, rounded corners, "
        .. "and live Variable Settings directly as an OBS Effect Filter."
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
    obs.timer_add(on_poll_tick, 500)
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

    let state = {
        revision: 1,
        activeProfileId: 'dual-gradient-bundle',
        profiles: buildDefaultProfiles(),
        knownScenes: [],
        knownBundles: [
            'Bundle - Webcam Full w/ Border',
            'Bundle - Webcam ROOM Full w/ Border',
            'Bundle - Webcam Razer Full w/ Border',
            'Bundle - Continuity Cam Full w/ Border',
            'Bundle - Elgato w/ Border',
            'Bundle - Desktop  w/ Border',
            'Chat Overlay'
        ],
        lastImportedJsonPath: ''
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
                        knownBundles: Array.isArray(raw.knownBundles) && raw.knownBundles.length > 0
                            ? raw.knownBundles.slice(0, 200)
                            : state.knownBundles,
                        lastImportedJsonPath: String(raw.lastImportedJsonPath || '')
                    };
                }
            }
        } catch (err) {
            console.error('[ObsBorders] Failed to load state:', err.message);
        }
        syncResolvedManifest();
    }

    function saveState() {
        state.revision = (Number(state.revision) || 0) + 1;
        writeTextFileAtomic(stateFile, JSON.stringify(state, null, 2));
        syncResolvedManifest();
        broadcastToOverlays('obs-borders-update', getPublicState());
    }

    function buildTargetOverrides(profiles) {
        const map = {};
        for (const p of profiles) {
            if (Array.isArray(p.targetBundles)) {
                for (const b of p.targetBundles) {
                    if (b) map[b] = p.id;
                }
            }
        }
        return map;
    }

    function syncResolvedManifest() {
        try {
            const varValues = isVariableSettingsEnabled() ? (getVariablesValues() || {}) : {};
            const resolvedProfiles = state.profiles.map(p => resolveProfileForManifest(p, varValues));
            const manifest = {
                revision: Date.now(),
                updatedAt: new Date().toISOString(),
                activeProfileId: state.activeProfileId,
                targetOverrides: buildTargetOverrides(state.profiles),
                profiles: resolvedProfiles
            };
            writeTextFileAtomic(manifestPath, JSON.stringify(manifest, null, 2));
            if (!fs.existsSync(luaScriptPath)) {
                writeTextFileAtomic(luaScriptPath, buildObsLuaScript({ manifestPath }));
            }
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
            targetOverrides: buildTargetOverrides(state.profiles),
            knownScenes: state.knownScenes,
            knownBundles: state.knownBundles,
            lastImportedJsonPath: state.lastImportedJsonPath,
            manifestPath,
            luaScriptPath,
            variableSettingsEnabled: Boolean(isVariableSettingsEnabled())
        };
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
        saveState();
        return getPublicState();
    }

    function duplicateProfile(profileId) {
        const source = state.profiles.find(p => p.id === profileId);
        if (!source) throw new Error('Border profile not found');
        const copy = JSON.parse(JSON.stringify(source));
        let suffix = 2;
        let candidateId = `${source.id}-copy`;
        while (state.profiles.some(p => p.id === candidateId)) {
            candidateId = `${source.id}-copy-${suffix++}`;
        }
        copy.id = candidateId;
        copy.name = `${source.name} (Copy)`;
        copy.targetBundles = [];
        return upsertProfile(copy, { setActive: true });
    }

    function setActiveProfile(profileId) {
        const found = state.profiles.find(p => p.id === profileId);
        if (!found) throw new Error('Border profile not found');
        state.activeProfileId = found.id;
        saveState();
        return found;
    }

    function assignTargetToProfile(targetName, profileId) {
        const cleanTarget = String(targetName || '').trim();
        if (!cleanTarget) throw new Error('Target bundle/source name is required');
        for (const p of state.profiles) {
            p.targetBundles = (p.targetBundles || []).filter(t => t !== cleanTarget);
            if (p.id === profileId) {
                p.targetBundles.push(cleanTarget);
            }
        }
        if (!state.knownBundles.includes(cleanTarget)) {
            state.knownBundles.push(cleanTarget);
        }
        saveState();
        return getPublicState();
    }

    function resetDefaults() {
        state.profiles = buildDefaultProfiles();
        state.activeProfileId = state.profiles[0].id;
        saveState();
        return getPublicState();
    }

    /**
     * Parses an OBS Scene Collection JSON object (or file on disk) to extract
     * top-level scenes, nested "Bundle" scenes, and sources with legacy shader filters.
     */
    function importObsSceneCollection({ filePath, jsonData } = {}) {
        let data = jsonData;
        let resolvedPath = '';
        if (!data && filePath) {
            resolvedPath = String(filePath).trim().replace(/\\ /g, ' ').replace(/\\~/g, '~');
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`OBS scene file not found: ${resolvedPath}`);
            }
            data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        }
        if (!data || typeof data !== 'object' || !Array.isArray(data.sources)) {
            throw new Error('Invalid OBS Scene Collection JSON (missing sources array)');
        }

        const scenes = [];
        const bundles = [];
        const legacyShaderTargets = [];

        for (const src of data.sources) {
            if (!src || !src.name) continue;
            const filters = Array.isArray(src.filters) ? src.filters : [];
            const hasBorderShader = filters.some(f => f && (f.id === 'shader_filter' || /border|rounded/i.test(f.name || '')));
            if (src.id === 'scene') {
                if (/^bundle\b|w\/\s*border/i.test(src.name) || hasBorderShader) {
                    bundles.push(src.name);
                } else {
                    scenes.push(src.name);
                }
            } else if (hasBorderShader) {
                bundles.push(src.name);
            }
            if (hasBorderShader) {
                legacyShaderTargets.push({
                    name: src.name,
                    id: src.id,
                    shaderFilters: filters.filter(f => f.id === 'shader_filter').map(f => f.name)
                });
            }
        }

        scenes.sort((a, b) => a.localeCompare(b));
        bundles.sort((a, b) => a.localeCompare(b));

        state.knownScenes = [...new Set([...scenes])].slice(0, 400);
        state.knownBundles = [...new Set([...state.knownBundles, ...bundles])].slice(0, 200);
        if (resolvedPath) state.lastImportedJsonPath = resolvedPath;

        saveState();
        return {
            collectionName: data.name || 'OBS Scene Collection',
            scenesCount: state.knownScenes.length,
            bundlesCount: state.knownBundles.length,
            scenes: state.knownScenes,
            bundles: state.knownBundles,
            legacyShaderTargets
        };
    }

    loadState();

    return {
        BORDER_STYLES,
        PLACEMENT_MODES,
        ANIMATION_TYPES,
        SCENE_MODES,
        getState: getPublicState,
        upsertProfile,
        deleteProfile,
        duplicateProfile,
        setActiveProfile,
        assignTargetToProfile,
        resetDefaults,
        syncResolvedManifest,
        regenerateLuaScript,
        importObsSceneCollection
    };
}

module.exports = {
    createObsBordersService,
    BORDER_STYLES,
    PLACEMENT_MODES,
    ANIMATION_TYPES,
    SCENE_MODES,
    resolveProfileForManifest,
    hexToRgbaFloats
};
