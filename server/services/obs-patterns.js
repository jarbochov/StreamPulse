/**
 * StreamPulse OBS Pattern Studio Service (Beta / Advanced)
 *
 * Manages native OBS GPU background & pattern tile profiles, cached PNG stamps
 * (for Pattern Tile images/icons and auto-baked seasonal/custom presets),
 * Variable Settings resolution, manifest.json export, and Metal-safe
 * standalone OBS Lua Video Input source generation (`streampulse-patterns.lua`).
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const catalog = require('../../shared/pattern-catalog.cjs');

const PATTERNS = catalog.PATTERNS;
const PATTERN_CODE_MAP = catalog.PATTERN_CODE_MAP;
const ANALYTIC_GPU_SET = new Set(catalog.ANALYTIC_GPU_PRESETS || []);
const PALETTES = catalog.PALETTES;
const TILE_LAYOUT_CODE_MAP = catalog.TILE_LAYOUT_CODE_MAP;
const TILE_SYMMETRY_CODE_MAP = catalog.TILE_SYMMETRY_CODE_MAP;
const TILE_MOTION_CODE_MAP = catalog.TILE_MOTION_CODE_MAP;
const TILE_HUE_CODE_MAP = catalog.TILE_HUE_CODE_MAP;
const TILE_DIST_CODE_MAP = catalog.TILE_DIST_CODE_MAP;
const TILE_ALT_FLIP_CODE_MAP = catalog.TILE_ALT_FLIP_CODE_MAP;
const TILE_TRACK_CODE_MAP = catalog.TILE_TRACK_CODE_MAP;
const TILE_SPIN_DIR_CODE_MAP = catalog.TILE_SPIN_DIR_CODE_MAP;
const PROCEDURAL_MOTION_CODE_MAP = catalog.PROCEDURAL_MOTION_CODE_MAP;
const PROCEDURAL_COLOR_MODE_CODE_MAP = catalog.PROCEDURAL_COLOR_MODE_CODE_MAP;
const PROCEDURAL_COLOR_ANIM_CODE_MAP = catalog.PROCEDURAL_COLOR_ANIM_CODE_MAP;
const PROCEDURAL_IN_PLACE_CODE_MAP = catalog.PROCEDURAL_IN_PLACE_CODE_MAP;
const PROCEDURAL_FILL_MODE_CODE_MAP = catalog.PROCEDURAL_FILL_MODE_CODE_MAP;
const BG_TYPE_CODE_MAP = catalog.BG_TYPE_CODE_MAP || { transparent: 0, solid: 1, linear: 2, radial: 3, conic: 4 };
const BG_MOTION_CODE_MAP = catalog.BG_MOTION_CODE_MAP || { none: 0, rotate: 1, pulse: 2, shift: 3 };
const SNOWFLAKE_STYLES = catalog.SNOWFLAKE_STYLES || ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle'];

const VAR_TOKEN_RE = /^(?:var:([a-z0-9_.]+)(?:\|(.*))?|\{\{\s*var\.([a-z0-9_.]+)\s*(?:\|([^{}]*?))?\s*\}\})$/i;

function slugifyId(raw, fallback = 'pattern-profile') {
    const clean = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return clean || fallback;
}

function clampNum(val, fallback, min, max) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function normalizeColor(raw, fallback = '#58A6FFFF') {
    if (typeof raw === 'string' && VAR_TOKEN_RE.test(raw.trim())) {
        return raw.trim();
    }
    const str = String(raw || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(str)) return `${str.toUpperCase()}FF`;
    if (/^#[0-9a-fA-F]{8}$/.test(str)) return str.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(str)) {
        return `#${str[1]}${str[1]}${str[2]}${str[2]}${str[3]}${str[3]}FF`.toUpperCase();
    }
    return fallback;
}

function normalizeNumOrToken(raw, fallback, min, max) {
    if (typeof raw === 'string' && VAR_TOKEN_RE.test(raw.trim())) {
        return raw.trim();
    }
    return clampNum(raw, fallback, min, max);
}

function resolveValueToken(raw, varValues = {}, allowVars = true) {
    if (typeof raw !== 'string') return raw;
    const m = raw.trim().match(VAR_TOKEN_RE);
    if (!m) return raw;
    const key = (m[1] || m[3] || '').toLowerCase();
    const fb = (m[2] !== undefined ? m[2] : m[4]) ?? '';
    if (allowVars && varValues && typeof varValues === 'object') {
        if (varValues[key] !== undefined && String(varValues[key]).trim() !== '') {
            return String(varValues[key]).trim();
        }
        if (key.includes('.')) {
            const shortName = key.split('.').pop();
            if (varValues[shortName] !== undefined && String(varValues[shortName]).trim() !== '') {
                return String(varValues[shortName]).trim();
            }
        }
    }
    return fb;
}

function resolveNumToken(raw, fallback, min, max, varValues, allowVars) {
    const resolved = resolveValueToken(raw, varValues, allowVars);
    return clampNum(resolved, fallback, min, max);
}

function resolveColorToken(raw, fallback, varValues, allowVars) {
    const resolved = resolveValueToken(raw, varValues, allowVars);
    return normalizeColor(resolved, fallback);
}

function hexToRgbaArray(hex, fallback = [0.35, 0.65, 1.0, 1.0]) {
    const norm = normalizeColor(hex, '');
    if (!norm || norm.startsWith('var:') || norm.startsWith('{{')) return fallback;
    const clean = norm.replace('#', '');
    if (clean.length !== 8) return fallback;
    return [
        Number((parseInt(clean.slice(0, 2), 16) / 255).toFixed(4)),
        Number((parseInt(clean.slice(2, 4), 16) / 255).toFixed(4)),
        Number((parseInt(clean.slice(4, 6), 16) / 255).toFixed(4)),
        Number((parseInt(clean.slice(6, 8), 16) / 255).toFixed(4))
    ];
}

function normalizeTileSlot(slot = {}, idx = 0) {
    const sourceType = ['image', 'icon', 'text'].includes(slot.sourceType) ? slot.sourceType : 'image';
    return {
        id: slugifyId(slot.id || `slot-${idx + 1}`, `slot-${idx + 1}`),
        sourceType,
        label: String(slot.label || '').trim().slice(0, 80),
        src: String(slot.src || '').trim().slice(0, 500),
        iconClass: String(slot.iconClass || '').trim().slice(0, 80),
        text: String(slot.text || '').trim().slice(0, 16),
        color: normalizeColor(slot.color, '#FFFFFFFF'),
        scale: clampNum(slot.scale, 100, 25, 200)
    };
}

function normalizeProfile(raw = {}, index = 0) {
    const mode = raw.mode === 'tiles' ? 'tiles' : 'procedural';
    const procIn = raw.procedural && typeof raw.procedural === 'object' ? raw.procedural : {};
    const tilesIn = raw.tiles && typeof raw.tiles === 'object' ? raw.tiles : {};

    const preset = PATTERNS.includes(procIn.preset) ? procIn.preset : 'hexagons';
    const palette = (procIn.palette === 'dual' || procIn.palette === 'custom' || PALETTES[procIn.palette]) ? procIn.palette : 'dual';
    const rawCustomColors = Array.isArray(procIn.customColors) && procIn.customColors.length >= 2
        ? procIn.customColors.slice(0, 7)
        : ['#EF4444FF', '#22C55EFF', '#FACC15FF', '#3B82F6FF'];
    const customColors = rawCustomColors.map((c, idx) => normalizeColor(c, idx === 0 ? '#EF4444FF' : '#3B82F6FF'));
    const procMotion = PROCEDURAL_MOTION_CODE_MAP[procIn.motion] !== undefined ? procIn.motion : 'pan';
    const procColorMode = PROCEDURAL_COLOR_MODE_CODE_MAP[procIn.colorMode] !== undefined ? procIn.colorMode : 'mosaic';
    const procColorAnim = PROCEDURAL_COLOR_ANIM_CODE_MAP[procIn.colorAnim] !== undefined ? procIn.colorAnim : 'none';
    const procInPlace = PROCEDURAL_IN_PLACE_CODE_MAP[procIn.inPlace] !== undefined ? procIn.inPlace : (procMotion !== 'none' ? 'auto' : 'none');
    const procFillMode = PROCEDURAL_FILL_MODE_CODE_MAP[procIn.fillMode] !== undefined ? procIn.fillMode : 'tinted';
    const panDirection = procIn.panDirection === 'oscillate' ? 'oscillate' : 'continuous';
    const procSpin = ['none', 'cw', 'ccw', 'sway'].includes(procIn.spin) ? procIn.spin : 'none';
    const snowflakeStyle = SNOWFLAKE_STYLES.includes(procIn.snowflakeStyle) ? procIn.snowflakeStyle : 'all';

    const layout = TILE_LAYOUT_CODE_MAP[tilesIn.layout] !== undefined ? tilesIn.layout : 'brick';
    const symmetry = TILE_SYMMETRY_CODE_MAP[tilesIn.symmetry] !== undefined ? tilesIn.symmetry : 'none';
    const tileMotion = TILE_MOTION_CODE_MAP[tilesIn.motion] !== undefined ? tilesIn.motion : 'scroll';
    const hueShift = TILE_HUE_CODE_MAP[tilesIn.hueShift] !== undefined ? tilesIn.hueShift : 'none';
    const tileDistribution = TILE_DIST_CODE_MAP[tilesIn.tileDistribution] !== undefined ? tilesIn.tileDistribution : 'diagonal';
    const alternateFlip = TILE_ALT_FLIP_CODE_MAP[tilesIn.alternateFlip] !== undefined ? tilesIn.alternateFlip : 'tilt';
    const trackMode = TILE_TRACK_CODE_MAP[tilesIn.trackMode] !== undefined ? tilesIn.trackMode : 'uniform';
    const spinDirection = TILE_SPIN_DIR_CODE_MAP[tilesIn.spinDirection] !== undefined ? tilesIn.spinDirection : 'cw';

    const cleanStampFile = String(tilesIn.stampFile || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const isAnalyticProc = ANALYTIC_GPU_SET.has(preset);
    const cleanBakedFile = isAnalyticProc ? '' : String(procIn.bakedStampFile || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const fltIn = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
    const duoIn = fltIn.duotone && typeof fltIn.duotone === 'object' ? fltIn.duotone : {};
    const tintIn = fltIn.tint && typeof fltIn.tint === 'object' ? fltIn.tint : {};
    const grainIn = fltIn.grain && typeof fltIn.grain === 'object' ? fltIn.grain : {};
    const rawSlots = Array.isArray(tilesIn.slots) && tilesIn.slots.length > 0
        ? tilesIn.slots.slice(0, 4).map(normalizeTileSlot)
        : [normalizeTileSlot({ sourceType: 'image', label: 'Built-In Geometric' }, 0)];

    const rawBgColor = normalizeColor(raw.bgColor, '#0B101BFF');
    const inferredTransparentBg = !raw.bgType && typeof rawBgColor === 'string' && rawBgColor.endsWith('00');
    const bgType = BG_TYPE_CODE_MAP[raw.bgType] !== undefined ? raw.bgType : (inferredTransparentBg ? 'transparent' : 'solid');
    const bgMotion = BG_MOTION_CODE_MAP[raw.bgMotion] !== undefined ? raw.bgMotion : 'none';

    return {
        id: slugifyId(raw.id || raw.name, `pattern-${index + 1}`),
        name: String(raw.name || `Pattern ${index + 1}`).trim().slice(0, 80) || `Pattern ${index + 1}`,
        mode,
        width: clampNum(raw.width, 1920, 64, 7680),
        height: clampNum(raw.height, 1080, 64, 4320),
        bgType,
        bgColor: rawBgColor,
        bgColor2: normalizeColor(raw.bgColor2, '#1E1B4BFF'),
        bgColor3: normalizeColor(raw.bgColor3, '#0F766EFF'),
        bgUseMid: Boolean(raw.bgUseMid),
        bgAngle: normalizeNumOrToken(raw.bgAngle, 135, -360, 360),
        bgCenterX: normalizeNumOrToken(raw.bgCenterX, 50, 0, 100),
        bgCenterY: normalizeNumOrToken(raw.bgCenterY, 50, 0, 100),
        bgRadius: normalizeNumOrToken(raw.bgRadius, 75, 10, 200),
        bgMotion,
        bgMotionSpeed: normalizeNumOrToken(raw.bgMotionSpeed, 1, 0.1, 5),
        opacity: normalizeNumOrToken(raw.opacity, 100, 0, 100),
        vignette: normalizeNumOrToken(raw.vignette, 25, 0, 100),
        vignetteColor: normalizeColor(raw.vignetteColor, '#000000FF'),
        procedural: {
            preset,
            scale: normalizeNumOrToken(procIn.scale, 100, 15, 400),
            lineWidth: normalizeNumOrToken(procIn.lineWidth, 2, 0.5, 24),
            accent: normalizeColor(procIn.accent, '#58A6FFFF'),
            secondary: normalizeColor(procIn.secondary, '#A855F7FF'),
            palette,
            customColors,
            fillMode: procFillMode,
            fillOpacity: normalizeNumOrToken(procIn.fillOpacity, procFillMode === 'solid' ? 100 : 35, 0, 100),
            colorMode: procColorMode,
            colorAnim: procColorAnim,
            colorSpeed: normalizeNumOrToken(procIn.colorSpeed, 1, 0.2, 3),
            motion: procMotion,
            speed: normalizeNumOrToken(procIn.speed, 1, 0, 10),
            panDirection,
            panAngle: normalizeNumOrToken(procIn.panAngle, 45, -360, 360),
            inPlace: procInPlace,
            inPlaceSpeed: normalizeNumOrToken(procIn.inPlaceSpeed, 1, 0.2, 5),
            spin: procSpin,
            spinSpeed: normalizeNumOrToken(procIn.spinSpeed, 1, 0.1, 5),
            density: normalizeNumOrToken(procIn.density, 1, 0.25, 4),
            spacing: normalizeNumOrToken(procIn.spacing, 100, 50, 300),
            sizeVariance: normalizeNumOrToken(procIn.sizeVariance, 0, 0, 100),
            scatter: normalizeNumOrToken(procIn.scatter, 0, 0, 100),
            rotationVariance: normalizeNumOrToken(procIn.rotationVariance, 0, 0, 100),
            snowflakeStyle,
            bakedStampFile: cleanBakedFile,
            stampCols: isAnalyticProc ? 0 : clampNum(procIn.stampCols, 0, 0, 64),
            stampRows: isAnalyticProc ? 0 : clampNum(procIn.stampRows, 0, 0, 64)
        },
        filters: {
            brightness: normalizeNumOrToken(fltIn.brightness, 100, 0, 200),
            contrast: normalizeNumOrToken(fltIn.contrast, 100, 0, 200),
            saturate: normalizeNumOrToken(fltIn.saturate, 100, 0, 300),
            grayscale: normalizeNumOrToken(fltIn.grayscale, 0, 0, 100),
            hueRotate: normalizeNumOrToken(fltIn.hueRotate, 0, -180, 180),
            blur: normalizeNumOrToken(fltIn.blur, 0, 0, 60),
            duotone: {
                enabled: Boolean(duoIn.enabled),
                dark: normalizeColor(duoIn.dark, '#1E1B4BFF'),
                light: normalizeColor(duoIn.light, '#22D3EEFF')
            },
            tint: {
                enabled: Boolean(tintIn.enabled),
                color: normalizeColor(tintIn.color, '#58A6FFFF'),
                opacity: normalizeNumOrToken(tintIn.opacity, 25, 0, 100)
            },
            grain: {
                enabled: Boolean(grainIn.enabled),
                amount: normalizeNumOrToken(grainIn.amount, 18, 0, 100),
                size: normalizeNumOrToken(grainIn.size, 150, 50, 400),
                animate: grainIn.animate !== false
            }
        },
        tiles: {
            layout,
            symmetry,
            wedges: clampNum(tilesIn.wedges, 6, 4, 16),
            kaleidoMorph: tilesIn.kaleidoMorph !== false,
            kaleidoSpeed: clampNum(tilesIn.kaleidoSpeed, 8, 0.5, 120),
            kaleidoDirection: tilesIn.kaleidoDirection === 'ccw' ? 'ccw' : 'cw',
            kaleidoDepth: clampNum(tilesIn.kaleidoDepth, 35, 5, 100),
            tileSize: normalizeNumOrToken(tilesIn.tileSize, 96, 16, 512),
            gap: normalizeNumOrToken(tilesIn.gap, 18, 0, 256),
            offsetX: normalizeNumOrToken(tilesIn.offsetX, 50, 0, 100),
            offsetY: normalizeNumOrToken(tilesIn.offsetY, 50, 0, 100),
            gridAngle: normalizeNumOrToken(tilesIn.gridAngle, 0, -180, 180),
            tileAngle: normalizeNumOrToken(tilesIn.tileAngle, 0, -180, 180),
            alternateFlip,
            tileOpacity: normalizeNumOrToken(tilesIn.tileOpacity, 1, 0.05, 1),
            altOpacity: normalizeNumOrToken(tilesIn.altOpacity, 0.65, 0, 1),
            altScale: normalizeNumOrToken(tilesIn.altScale, 1, 0.25, 2.5),
            tileDistribution,
            trackMode,
            spinDirection,
            motion: tileMotion,
            scrollAngle: normalizeNumOrToken(tilesIn.scrollAngle, 35, -360, 360),
            speed: normalizeNumOrToken(tilesIn.speed, 16, 0.5, 200),
            spinSpeed: normalizeNumOrToken(tilesIn.spinSpeed, 8, 0.5, 120),
            waveAmount: normalizeNumOrToken(tilesIn.waveAmount, 25, 5, 100),
            hueShift,
            hueSpeed: normalizeNumOrToken(tilesIn.hueSpeed, 14, 0.5, 120),
            hueJitter: normalizeNumOrToken(tilesIn.hueJitter, 0, 0, 180),
            saturationJitter: normalizeNumOrToken(tilesIn.saturationJitter, 0, 0, 50),
            brightnessJitter: normalizeNumOrToken(tilesIn.brightnessJitter, 0, 0, 50),
            scaleJitter: normalizeNumOrToken(tilesIn.scaleJitter, 0, 0, 50),
            rotationJitter: normalizeNumOrToken(tilesIn.rotationJitter, 0, 0, 180),
            positionJitter: normalizeNumOrToken(tilesIn.positionJitter, 0, 0, 50),
            twinkle: normalizeNumOrToken(tilesIn.twinkle, 0, 0, 100),
            twinkleSpeed: normalizeNumOrToken(tilesIn.twinkleSpeed, 4, 0.5, 30),
            tintColor: normalizeColor(tilesIn.tintColor, '#FFFFFFFF'),
            slots: rawSlots,
            stampFile: cleanStampFile
        }
    };
}

function buildDefaultProfiles() {
    return [
        normalizeProfile({
            id: 'cyber-hex-grid',
            name: 'Cyber Honeycomb (GPU)',
            mode: 'procedural',
            bgColor: '#0A0F1CFF',
            vignette: 35,
            procedural: {
                preset: 'hexagons',
                scale: 110,
                lineWidth: 2.5,
                accent: '#38BDF8FF',
                secondary: '#818CF8FF',
                palette: 'dual',
                colorMode: 'mosaic',
                colorAnim: 'cycle',
                colorSpeed: 1.0,
                motion: 'pan',
                speed: 1.0,
                panAngle: 30,
                inPlace: 'auto'
            }
        }, 0),
        normalizeProfile({
            id: 'topo-midnight',
            name: 'Topography Midnight',
            mode: 'procedural',
            bgColor: '#091118FF',
            vignette: 42,
            procedural: {
                preset: 'topography',
                scale: 120,
                lineWidth: 2,
                accent: '#2DD4BFFF',
                secondary: '#0EA5E9FF',
                palette: 'dual',
                colorMode: 'mosaic',
                colorAnim: 'breathe',
                colorSpeed: 0.8,
                motion: 'drift',
                speed: 0.9,
                panAngle: 45,
                inPlace: 'auto'
            }
        }, 1),
        normalizeProfile({
            id: 'starfield-nebula',
            name: 'Deep Starfield Drift',
            mode: 'procedural',
            bgColor: '#060812FF',
            vignette: 30,
            procedural: {
                preset: 'starfield',
                scale: 100,
                lineWidth: 2,
                accent: '#F8FAFCFF',
                secondary: '#60A5FAFF',
                palette: 'cool',
                colorMode: 'mosaic',
                colorAnim: 'cycle',
                colorSpeed: 0.6,
                motion: 'pan',
                speed: 1.4,
                panAngle: 15,
                density: 1.25,
                inPlace: 'sparkle'
            }
        }, 2),
        normalizeProfile({
            id: 'brick-tile-wallpaper',
            name: 'Scrolling Brick Tile',
            mode: 'tiles',
            bgColor: '#111625FF',
            vignette: 25,
            tiles: {
                layout: 'brick',
                symmetry: 'none',
                tileSize: 96,
                gap: 24,
                offsetX: 50,
                gridAngle: -12,
                tileAngle: 0,
                altOpacity: 0.55,
                altScale: 0.92,
                motion: 'scroll',
                scrollAngle: 35,
                speed: 18,
                hueShift: 'cycle',
                hueSpeed: 10,
                tintColor: '#38BDF8FF'
            }
        }, 3)
    ];
}

function buildObsLuaScript({ manifestPath, stampsDir }) {
    const escapedManifest = String(manifestPath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedStamps = String(stampsDir || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `-- ============================================================================
-- StreamPulse Pattern Background Source (Beta / Advanced)
-- Auto-generated by StreamPulse. Add once in OBS -> Tools -> Scripts.
-- Registers a native GPU Video Input source ("StreamPulse Pattern Background")
-- for Procedural Backgrounds and Pattern Tile wallpapers without Browser Sources.
-- ============================================================================

local obs = obslua

local DEFAULT_MANIFEST_PATH = "${escapedManifest}"
local DEFAULT_STAMPS_DIR = "${escapedStamps}"
local manifest_path = DEFAULT_MANIFEST_PATH
local manifest_revision = 0
local manifest_last_sig = ""
local profiles_by_id = {}
local assignment_rules = {}
local default_profile_id = "cyber-hex-grid"
local active_scene_name = ""

local EFFECT_SOURCE = [[
uniform float4x4 ViewProj;
uniform texture2d stamp_tex;

uniform float2 canvas_size;
uniform float2 stamp_size;
uniform float2 stamp_grid;
uniform float mode_code;
uniform float anim_time;
uniform float opacity;
uniform float bg_type;
uniform float4 bg_color;
uniform float4 bg_color2;
uniform float4 bg_color3;
uniform float bg_use_mid;
uniform float bg_angle_rad;
uniform float2 bg_center;
uniform float bg_radius;
uniform float bg_motion;
uniform float bg_motion_speed;
uniform float vignette_amt;
uniform float4 vignette_color;

uniform float proc_preset;
uniform float proc_scale;
uniform float proc_line_w;
uniform float4 proc_accent;
uniform float4 proc_secondary;
uniform float4 pal_c0;
uniform float4 pal_c1;
uniform float4 pal_c2;
uniform float4 pal_c3;
uniform float4 pal_c4;
uniform float4 pal_c5;
uniform float4 pal_c6;
uniform float pal_count;
uniform float proc_fill_mode;
uniform float proc_fill_opacity;
uniform float proc_color_mode;
uniform float proc_color_anim;
uniform float proc_color_speed;
uniform float proc_motion;
uniform float proc_speed;
uniform float proc_pan_osc;
uniform float proc_pan_rad;
uniform float proc_inplace_mode;
uniform float proc_inplace_speed;
uniform float proc_spin_mode;
uniform float proc_spin_speed;
uniform float proc_density;
uniform float proc_spacing;
uniform float proc_size_var;
uniform float proc_scatter;
uniform float proc_rot_var;

uniform float flt_brightness;
uniform float flt_contrast;
uniform float flt_saturate;
uniform float flt_grayscale;
uniform float flt_hue_rad;
uniform float flt_blur;
uniform float flt_duo_on;
uniform float4 flt_duo_dark;
uniform float4 flt_duo_light;
uniform float flt_tint_on;
uniform float4 flt_tint_color;
uniform float flt_tint_amt;
uniform float flt_grain_amt;
uniform float flt_grain_size;
uniform float flt_grain_anim;

uniform float tile_count;
uniform float tile_dist;
uniform float tile_layout;
uniform float tile_symmetry;
uniform float tile_wedges;
uniform float tile_kaleido_morph;
uniform float tile_kaleido_speed;
uniform float tile_kaleido_dir;
uniform float tile_kaleido_depth;
uniform float tile_size;
uniform float tile_gap;
uniform float tile_offset_x;
uniform float tile_offset_y;
uniform float tile_grid_rad;
uniform float tile_angle_rad;
uniform float tile_alt_flip;
uniform float tile_opacity;
uniform float tile_alt_opacity;
uniform float tile_alt_scale;
uniform float tile_motion;
uniform float tile_track_mode;
uniform float tile_spin_dir;
uniform float tile_scroll_rad;
uniform float tile_speed;
uniform float tile_spin_rad;
uniform float tile_wave_amt;
uniform float tile_hue_mode;
uniform float tile_hue_speed;
uniform float tile_hue_jitter;
uniform float tile_sat_jitter;
uniform float tile_bright_jitter;
uniform float tile_scale_jitter;
uniform float tile_rot_jitter;
uniform float tile_pos_jitter;
uniform float tile_twinkle;
uniform float tile_twinkle_speed;
uniform float4 tile_tint;
uniform float has_stamp;

sampler_state textureSampler {
    Filter    = Linear;
    AddressU  = Clamp;
    AddressV  = Clamp;
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
    VertDataOut v_out;
    v_out.pos = mul(float4(v_in.pos.xyz, 1.0), ViewProj);
    v_out.uv  = v_in.uv;
    return v_out;
}

float hash21(float2 p) {
    p = frac(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return frac(p.x * p.y);
}

float2 hash22(float2 p) {
    float n = sin(dot(p, float2(127.1, 311.7))) * 43758.5453;
    float m = sin(dot(p, float2(269.5, 183.3))) * 43758.5453;
    return frac(float2(n, m));
}

float valueNoise(float2 p) {
    float2 i = floor(p);
    float2 f = frac(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + float2(1.0, 0.0));
    float c = hash21(i + float2(0.0, 1.0));
    float d = hash21(i + float2(1.0, 1.0));
    return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
}

float2 rot2d(float2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return float2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float3 hueShiftRgb(float3 col, float angle) {
    float3 k = float3(0.57735, 0.57735, 0.57735);
    float cosA = cos(angle);
    return col * cosA + cross(k, col) * sin(angle) + k * dot(k, col) * (1.0 - cosA);
}

float sdHex(float2 p, float r) {
    float3 k = float3(-0.8660254, 0.5, 0.57735027);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= float2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

float sdTri(float2 p, float r) {
    float k = 1.7320508;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = float2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

float sdFourStar(float2 p, float r) {
    float rr = max(0.5, r);
    float2 q = max(float2(1e-4, 1e-4), abs(p) / rr);
    float f = pow(q.x, 0.55) + pow(q.y, 0.55) - 1.0;
    return f * rr * 0.48;
}

float4 getPaletteStop(float idx_f) {
    float n = max(2.0, pal_count);
    float m = fmod(abs(idx_f), n);
    if (m < 0.5) return pal_c0;
    if (m < 1.5) return pal_c1;
    if (m < 2.5) return pal_c2;
    if (m < 3.5) return pal_c3;
    if (m < 4.5) return pal_c4;
    if (m < 5.5) return pal_c5;
    return pal_c6;
}

float4 pickProcColor(float2 id, float2 px, float t) {
    float n = max(2.0, pal_count);
    float h = hash21(id);
    float idx = 0.0;
    if (proc_color_mode < 0.5) {
        // 0: mosaic
        idx = floor(h * n);
    } else if (proc_color_mode < 1.5) {
        // 1: radial
        float2 d = (px - canvas_size * 0.5) / max(24.0, proc_scale * 0.72);
        idx = floor(length(d));
    } else if (proc_color_mode < 2.5) {
        // 2: rows
        idx = floor(abs(id.y));
    } else if (proc_color_mode < 3.5) {
        // 3: columns
        idx = floor(abs(id.x));
    } else if (proc_color_mode < 4.5) {
        // 4: diagonal
        idx = floor(abs(id.x + id.y));
    } else if (proc_color_mode < 5.5) {
        // 5: spiral
        float2 cp = px - canvas_size * 0.5;
        float ang = (atan2(cp.y, cp.x) + 3.1415926) / 6.2831853;
        idx = floor(length(cp) / max(32.0, proc_scale * 0.85) + ang * n);
    } else {
        // 6: checker
        idx = fmod(abs(id.x + id.y), 2.0) * (n > 2.5 ? 2.0 : 1.0);
    }

    float shift = 0.0;
    if (proc_color_anim > 0.5 && proc_color_anim < 1.5) {
        shift = t * proc_color_speed * 1.4;
    } else if (proc_color_anim >= 1.5) {
        shift = (0.5 + 0.5 * sin(t * proc_color_speed * 2.0 + h * 1.8)) * max(1.0, n - 0.5);
    }

    float fidx = idx + shift;
    float i0 = floor(fidx);
    float4 c = lerp(getPaletteStop(i0), getPaletteStop(i0 + 1.0), frac(fidx));
    if (proc_color_anim >= 1.5) {
        c.a *= 0.65 + 0.35 * sin(t * proc_color_speed * 2.2 + h * 6.28318);
    }
    return c;
}

float evalShapeMask(float d, float lw) {
    float stroke_m = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, abs(d));
    if (proc_fill_mode >= 1.5) {
        // 2: outline
        return stroke_m;
    }
    float fill_m = 1.0 - smoothstep(-1.0, 1.0, d);
    float fa = (proc_fill_mode >= 0.5) ? clamp(proc_fill_opacity / 100.0, 0.0, 1.0) : clamp(proc_fill_opacity / 100.0, 0.0, 1.0) * 0.48;
    return max(fill_m * fa, stroke_m);
}

float4 evalProceduralPattern(float2 px, float t) {
    float s = max(10.0, proc_scale) / 100.0;
    float lw = max(0.5, proc_line_w);
    float dens = max(0.25, proc_density);
    float dens2 = max(0.35, sqrt(dens));
    float sp = clamp(proc_spacing, 50.0, 300.0) / 100.0;
    float elem_s = s / dens2;
    float2 vel = float2(cos(proc_pan_rad), sin(proc_pan_rad)) * proc_speed * 42.0;
    float2 p = px;
    if (proc_motion >= 7.5) {
        // 8: pan (continuous or oscillate)
        p += (proc_pan_osc > 0.5) ? vel * sin(t * 0.8) * 1.8 : vel * t;
    } else if (proc_motion >= 6.5) {
        // 7: aurora
        p += float2(sin(t * proc_speed * 0.55 + px.y * 0.002), cos(t * proc_speed * 0.4 + px.x * 0.002)) * 28.0;
    } else if (proc_motion >= 4.5 && proc_motion < 5.5) {
        // 5: orbit
        p += float2(cos(t * proc_speed * 0.8), sin(t * proc_speed * 0.8)) * 36.0;
    } else if (proc_motion >= 3.5 && proc_motion < 4.5) {
        // 4: pulse
        float z = 1.0 + 0.065 * sin(t * proc_speed * 1.6);
        p = (p - canvas_size * 0.5) * z + canvas_size * 0.5;
    } else if (proc_motion >= 2.5 && proc_motion < 3.5) {
        // 3: sway
        float sa = sin(t * proc_speed * 0.9) * 0.045;
        p = rot2d(p - canvas_size * 0.5, sa) + canvas_size * 0.5;
    } else if (proc_motion >= 1.5 && proc_motion < 2.5) {
        // 2: fall
        p.y -= t * proc_speed * 48.0;
        p.x += sin(t * proc_speed * 0.7) * 18.0;
    } else if (proc_motion >= 0.5 && proc_motion < 1.5) {
        // 1: drift
        p += float2(sin(t * proc_speed * 0.7), cos(t * proc_speed * 0.55)) * 45.0;
    }

    float t_ip = (proc_inplace_mode > 0.5) ? (t * max(0.2, proc_inplace_speed)) : 0.0;
    float spin_base = 0.0;
    if (proc_spin_mode > 0.5 && proc_spin_mode < 1.5) spin_base = t * proc_spin_speed * 1.1;
    else if (proc_spin_mode >= 1.5 && proc_spin_mode < 2.5) spin_base = -t * proc_spin_speed * 1.1;
    else if (proc_spin_mode >= 2.5) spin_base = sin(t * proc_spin_speed * 1.6) * 0.45;

    float mask = 0.0;
    float2 cell_id = floor(p / (64.0 * s));

    if (proc_preset < 0.5) {
        // 0: grid
        float step_px = 56.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 g = abs(frac(p / step_px - 0.5) - 0.5) * step_px;
        float d = min(g.x, g.y);
        mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d);
    } else if (proc_preset < 1.5) {
        // 1: geometry (triangles, circles, diamonds, squares)
        float step_px = 78.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 lp = (frac(p / step_px) - 0.5) * step_px;
        float h = hash21(cell_id);
        float2 rp = rot2d(lp, spin_base * ((h > 0.5) ? 1.0 : -1.0));
        float rad = 78.0 * elem_s;
        float d = (h > 0.66) ? (length(lp) - rad * 0.25) : ((h > 0.33) ? max(abs(rp.x), abs(rp.y)) - rad * 0.23 : sdTri(rp, rad * 0.28));
        mask = evalShapeMask(d, lw);
    } else if (proc_preset < 2.5) {
        // 2: orbits
        float2 cp = p - canvas_size * 0.5;
        float r = length(cp);
        float ring_step = 78.0 * s * sp / dens;
        float ring_i = floor(r / ring_step);
        cell_id = float2(ring_i, 1.0);
        float d = abs(frac(r / ring_step) - 0.5) * ring_step;
        mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d);
        float sat_t = (proc_inplace_mode > 0.5) ? t_ip : t;
        float ang = atan2(cp.y, cp.x) + sat_t * (0.45 + 0.2 * sin(ring_i * 2.1)) + spin_base * ((fmod(ring_i, 2.0) > 0.5) ? 1.0 : -1.0);
        float2 sat = float2(cos(ang), sin(ang)) * ((ring_i + 0.5) * ring_step);
        float ds = length(cp - sat) - (5.5 * s + lw * 0.65);
        mask = max(mask * 0.68, 1.0 - smoothstep(-1.0, 1.0, ds));
    } else if (proc_preset < 3.5) {
        // 3: hexagons
        float hex_cell_r = 46.0 * elem_s * sp;
        float hex_r = 46.0 * elem_s;
        float2 r = float2(1.0, 1.7320508) * hex_cell_r * 2.0;
        float2 h = r * 0.5;
        float2 a = frac(p / r) * r - h;
        float2 b = frac((p - h) / r) * r - h;
        float2 gv = (dot(a, a) < dot(b, b)) ? a : b;
        cell_id = floor((p - gv) / h);
        float sv = 1.0 + (hash21(cell_id) - 0.5) * (proc_size_var / 100.0) * 0.35;
        float2 rgv = rot2d(gv, spin_base * ((fmod(abs(cell_id.x + cell_id.y), 2.0) > 0.5) ? 1.0 : -1.0));
        float d = sdHex(rgv, hex_r * 0.86 * sv);
        mask = evalShapeMask(d, lw);
    } else if (proc_preset < 4.5) {
        // 4: diamonds
        float step_px = 58.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 rnd = hash22(cell_id);
        float2 lp = (frac(p / step_px) - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.4;
        lp = rot2d(lp, spin_base + (rnd.y - 0.5) * (proc_rot_var / 100.0) * 1.5);
        float sz = (58.0 * elem_s) * (0.34 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 0.22);
        float d = (abs(lp.x) + abs(lp.y)) * 0.7071 - sz;
        mask = evalShapeMask(d, lw);
    } else if (proc_preset < 5.5) {
        // 5: isometric
        float step_px = 64.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 ip1 = rot2d(p, 0.523599);
        float2 ip2 = rot2d(p, -0.523599);
        float d1 = abs(frac(ip1.y / step_px) - 0.5) * step_px;
        float d2 = abs(frac(ip2.y / step_px) - 0.5) * step_px;
        float d3 = abs(frac(p.x / (step_px * 0.866)) - 0.5) * (step_px * 0.866);
        float d = min(min(d1, d2), d3);
        mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d);
    } else if (proc_preset < 6.5) {
        // 6: mesh
        float step_px = 54.0 * elem_s * sp;
        float2 mp = p + float2(sin(p.y * 0.015 / s + t_ip * 1.2) * 14.0, cos(p.x * 0.015 / s + t_ip * 1.2) * 14.0);
        cell_id = floor(mp / step_px);
        float2 g = abs(frac(mp / step_px - 0.5) - 0.5) * step_px;
        float d = min(g.x, g.y);
        mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d);
    } else if (proc_preset < 7.5) {
        // 7: sunburst
        float2 cp = p - canvas_size * 0.5;
        float rays = max(6.0, floor(18.0 * dens));
        float ang = atan2(cp.y, cp.x) + spin_base + t_ip * 0.25;
        float sector = frac(ang / 6.2831853 * rays);
        cell_id = float2(floor(ang / 6.2831853 * rays), 0.0);
        float d = abs(sector - 0.5) * (length(cp) * 6.2831853 / rays);
        mask = 1.0 - smoothstep(max(0.0, lw * 0.8 - 0.55), lw * 0.8 + 0.55, d);
    } else if (proc_preset < 8.5) {
        // 8: triangles
        float step_px = 68.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 rnd = hash22(cell_id);
        float2 lp = (frac(p / step_px) - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.35;
        float flip = fmod(abs(cell_id.x + cell_id.y), 2.0) * 2.0 - 1.0;
        lp = rot2d(lp, spin_base * flip + (rnd.y - 0.5) * (proc_rot_var / 100.0) * 1.2);
        float sv = 1.0 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 0.4;
        float d = sdTri(lp * float2(1.0, flip), (68.0 * elem_s) * 0.34 * sv);
        mask = evalShapeMask(d, lw);
    } else if (proc_preset < 9.5) {
        // 9: chevrons
        float step_px = 52.0 * s * sp / dens;
        float zig = abs(frac(p.x / (step_px * 1.5)) - 0.5) * step_px;
        float yv = p.y + zig;
        cell_id = float2(floor(p.x / step_px), floor(yv / step_px));
        float d = abs(frac(yv / step_px) - 0.5) * step_px;
        mask = 1.0 - smoothstep(max(0.0, lw * 0.6 - 0.55), lw * 0.6 + 0.55, d);
    } else if (proc_preset < 10.5) {
        // 10: checker
        float step_px = 56.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float chk = fmod(abs(cell_id.x + cell_id.y), 2.0);
        float fa = clamp(proc_fill_opacity / 100.0, 0.08, 1.0);
        float tile_m = chk > 0.5 ? fa : fa * 0.14;
        float2 cg = abs(frac(p / step_px) - 0.5);
        float bd = min(0.5 - cg.x, 0.5 - cg.y) * step_px;
        float bm = (proc_fill_mode >= 1.5 || lw > 2.2) ? (1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, bd)) : 0.0;
        mask = max((proc_fill_mode >= 1.5 ? 0.0 : tile_m), bm);
    } else if (proc_preset < 11.5) {
        // 11: waves
        float step_px = 46.0 * s * sp / dens;
        float wy = p.y + sin(p.x * 0.022 / s + t_ip * 1.5) * (16.0 * s);
        cell_id = float2(floor(p.x / (step_px * 2.0)), floor(wy / step_px));
        float d = abs(frac(wy / step_px) - 0.5) * step_px;
        mask = 1.0 - smoothstep(max(0.0, lw * 0.55 - 0.55), lw * 0.55 + 0.55, d);
    } else if (proc_preset < 12.5) {
        // 12: rings (concentric outward ripple rings)
        float step_px = 64.0 * s * sp / dens;
        float r = length(p - canvas_size * 0.5) - t_ip * 24.0;
        cell_id = float2(floor(r / step_px), 0.0);
        float d = abs(frac(r / step_px) - 0.5) * step_px;
        mask = 1.0 - smoothstep(max(0.0, lw * 0.6 - 0.55), lw * 0.6 + 0.55, d);
    } else if (proc_preset < 13.5) {
        // 13: scales
        float step_px = 56.0 * elem_s * sp;
        float row = floor(p.y / (step_px * 0.5));
        float2 sp_p = p + float2(fmod(abs(row), 2.0) * step_px * 0.5, 0.0);
        cell_id = floor(sp_p / step_px);
        float2 rnd = hash22(cell_id);
        float2 lp = (frac(sp_p / step_px) - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.3;
        float sv = 1.0 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 0.35;
        float d = length(lp) - (56.0 * elem_s) * 0.48 * sv;
        mask = evalShapeMask(d, lw);
    } else if (proc_preset < 14.5) {
        // 14: topography
        float n = valueNoise(p * 0.0055 / s + float2(t_ip * 0.08, 0.0)) * 0.7
                + valueNoise(p * 0.012 / s - float2(0.0, t_ip * 0.05)) * 0.3;
        float bands = 9.0 * max(0.35, dens);
        float band = n * bands;
        cell_id = float2(floor(band), floor(p.x / 220.0));
        float d = abs(frac(band) - 0.5) / bands * 140.0;
        mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d);
    } else if (proc_preset < 15.5) {
        // 15: starfield (mix of crisp 4-point bright stars & fine backdrop dust)
        float step_px = 58.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 rnd = hash22(cell_id);
        float scatter_f = 0.25 + 0.5 * (proc_scatter / 100.0);
        float2 lp = (frac(p / step_px) - lerp(float2(0.5, 0.5), rnd, scatter_f)) * step_px;
        float2 rlp = rot2d(lp, spin_base * ((rnd.y > 0.5) ? 1.0 : -1.0) + (rnd.x - 0.5) * (proc_rot_var / 100.0) * 1.5);
        float sz_mul = 1.0 + (rnd.y - 0.5) * (proc_size_var / 100.0) * 0.85;
        float tw = (proc_inplace_mode > 0.5) ? (0.45 + 0.55 * sin(t_ip * (2.0 + rnd.y * 4.0) + rnd.x * 12.0)) : 1.0;
        float m_star = evalShapeMask(sdFourStar(rlp, (5.5 + rnd.x * 7.5) * s * sz_mul), max(0.8, lw * 0.65));
        float m_dot = evalShapeMask(length(lp) - (1.8 + rnd.x * 1.4) * s * sz_mul, max(0.8, lw * 0.6));
        mask = (rnd.x > 0.68 ? m_star : m_dot) * tw * step(0.26, rnd.x);
    } else if (proc_preset < 16.5) {
        // 16: sparkles (concave 4-point stars with spin & glint)
        float step_px = 76.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 rnd = hash22(cell_id);
        float2 lp = (frac(p / step_px) - (0.24 + rnd * 0.52)) * step_px;
        lp = rot2d(lp, spin_base + (rnd.x - 0.5) * (proc_rot_var / 100.0) * 1.8);
        float sz = (9.5 + rnd.x * 11.0 * (1.0 + proc_size_var / 100.0 * 0.6)) * s;
        float tw = (proc_inplace_mode > 0.5) ? (0.35 + 0.65 * pow(0.5 + 0.5 * sin(t_ip * 3.0 + rnd.y * 10.0), 1.6)) : 1.0;
        float d = sdFourStar(lp, sz);
        mask = evalShapeMask(d, max(1.0, lw * 0.75)) * tw * step(0.32, rnd.y);
    } else if (proc_preset < 17.5) {
        // 17: dots
        float step_px = 42.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 rnd = hash22(cell_id);
        float2 jitter = (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.55;
        float2 lp = (frac(p / step_px) - 0.5) * step_px - jitter;
        float rad = (5.5 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 6.0) * elem_s;
        float d = length(lp) - rad;
        mask = evalShapeMask(d, lw);
    } else if (proc_preset < 19.5 && proc_preset >= 18.5) {
        // 19: circuit
        float step_px = 72.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 lp = (frac(p / step_px) - 0.5) * step_px;
        float h = hash21(cell_id);
        float d_line = (h > 0.5) ? abs(lp.x - lp.y) * 0.7071 : min(abs(lp.x), abs(lp.y));
        float d_node = length(lp) - (4.5 + lw * 0.7);
        mask = max(1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d_line), 1.0 - smoothstep(-1.0, 1.0, d_node));
    } else {
        // Fallback analytic diamonds for unbaked seasonal presets
        float step_px = 68.0 * elem_s * sp;
        cell_id = floor(p / step_px);
        float2 lp = (frac(p / step_px) - 0.5) * step_px;
        lp = rot2d(lp, spin_base);
        float d = (abs(lp.x) + abs(lp.y)) * 0.7071 - (68.0 * elem_s) * 0.22;
        mask = evalShapeMask(d, lw);
    }

    if (proc_motion >= 5.5 && proc_motion < 6.5) {
        // 6: sweep scanner beam
        float beam = 0.5 + 0.5 * sin((px.x + px.y) * 0.004 - t * proc_speed * 2.2);
        mask *= 0.45 + 0.75 * pow(beam, 3.0);
    }
    if (proc_inplace_mode >= 1.5 && proc_inplace_mode < 2.5) {
        mask *= 0.7 + 0.35 * sin(t_ip * 3.0 + hash21(cell_id) * 6.28318);
    } else if (proc_inplace_mode >= 2.5 && proc_inplace_mode < 3.5) {
        mask *= 0.82 + 0.18 * sin(t_ip * 1.4 + hash21(cell_id) * 6.28318);
    } else if (proc_inplace_mode >= 3.5) {
        mask *= 0.45 + 0.55 * abs(sin(t_ip * 4.2 + hash21(cell_id) * 12.56));
    }

    float4 col = pickProcColor(cell_id, px, t);
    return float4(col.rgb * (col.a * clamp(mask, 0.0, 1.0)), col.a * clamp(mask, 0.0, 1.0));
}

float4 sampleTileStamp(float2 uv, float slot_idx) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return float4(0.0, 0.0, 0.0, 0.0);
    if (has_stamp > 0.5) {
        float2 suv = uv;
        if (tile_count > 1.5) {
            float n = clamp(tile_count, 1.0, 4.0);
            float si = floor(fmod(abs(slot_idx), n));
            float2 qoff = float2(fmod(si, 2.0), floor(si * 0.5)) * 0.5;
            suv = qoff + 0.006 + clamp(uv, 0.004, 0.996) * 0.488;
        }
        float4 tex = stamp_tex.Sample(textureSampler, suv) * tile_tint;
        return float4(tex.rgb * tex.a, tex.a);
    }
    // Built-in crisp fallback geometric diamond/star badge when no image stamp is loaded yet
    float2 q = (uv - 0.5) * 2.0;
    float d_dia = (abs(q.x) + abs(q.y)) * 0.7071 - 0.58;
    float d_ring = abs(d_dia + 0.14) - 0.06;
    float fill_m = (1.0 - smoothstep(-0.04, 0.04, d_dia)) * 0.28;
    float stroke_m = 1.0 - smoothstep(-0.03, 0.03, d_ring);
    float a = max(fill_m, stroke_m) * tile_tint.a;
    return float4(tile_tint.rgb * a, a);
}

float4 evalPatternTiles(float2 px, float t) {
    float2 center = canvas_size * 0.5;
    float2 p = px - center;

    // Optional quad mirror or radial kaleidoscope folding around center
    if (tile_symmetry > 1.5) {
        float wedges = max(3.0, tile_wedges);
        float r = length(p);
        float a = atan2(p.y, p.x);
        float sector = 6.2831853 / wedges;
        a = fmod(a + 6.2831853, sector);
        if (a > sector * 0.5) a = sector - a;
        if (tile_kaleido_morph > 0.5) {
            float kdir = (tile_kaleido_dir > 0.5) ? -1.0 : 1.0;
            a += kdir * sin(t * tile_kaleido_speed * 0.05) * (tile_kaleido_depth / 100.0) * 0.65;
        }
        p = float2(cos(a), sin(a)) * r;
    } else if (tile_symmetry > 0.5) {
        p = abs(p);
    }

    p = rot2d(p, -tile_grid_rad);

    float step_px = max(20.0, tile_size + tile_gap);
    float wave_f = clamp(tile_wave_amt, 5.0, 100.0) / 100.0;
    float2 scroll_dir = float2(cos(tile_scroll_rad), sin(tile_scroll_rad));
    float2 grid_p = p;
    float is_scroll = ((tile_motion > 0.5 && tile_motion < 1.5) || (tile_motion >= 6.5 && tile_motion < 7.5)) ? 1.0 : 0.0;

    // 1. Tracked / continuous motions across all Motion & Track Behavior combinations without lane collisions
    if (is_scroll > 0.5 && tile_track_mode < 0.5) {
        grid_p += scroll_dir * tile_speed * t;
    } else if (tile_motion >= 4.5 && tile_motion < 5.5) {
        float sw_ph = t * max(0.5, tile_speed * 0.12);
        grid_p += float2(sin(sw_ph) * step_px * wave_f * 1.4, cos(sw_ph * 0.5) * step_px * wave_f * 0.8);
    } else if (((tile_motion >= 1.5 && tile_motion < 2.5) || (is_scroll > 0.5 && ((tile_track_mode > 0.5 && tile_track_mode < 2.5) || tile_track_mode >= 4.5)))) {
        // Row-lane tracks (safe horizontal translation per row so lanes never overlap vertically)
        float sx_dir = (is_scroll > 0.5 && abs(scroll_dir.x) > 0.1) ? sign(scroll_dir.x) : 1.0;
        float r_idx = floor(grid_p.y / step_px);
        float r_odd = fmod(abs(r_idx), 2.0) > 0.5 ? 1.0 : 0.0;
        if (tile_track_mode >= 5.5 && tile_track_mode < 6.5) {
            float s_off = sin(t * max(0.3, tile_speed * 0.12)) * step_px * 1.6 * sx_dir;
            grid_p.x += (r_odd > 0.5 ? -s_off : s_off);
        } else if ((tile_track_mode >= 1.5 && tile_track_mode < 2.5) || (tile_track_mode >= 6.5 && tile_track_mode < 7.5)) {
            grid_p.x += sx_dir * tile_speed * t * (r_odd > 0.5 ? 2.0 : 1.0);
        } else if (tile_track_mode >= 7.5) {
            grid_p.x += sx_dir * tile_speed * t * (r_odd > 0.5 ? 0.0 : 1.0);
        } else {
            grid_p.x += sx_dir * tile_speed * t * (r_odd > 0.5 ? -1.0 : 1.0);
        }
    } else if ((tile_motion >= 2.5 && tile_motion < 3.5) || (is_scroll > 0.5 && tile_track_mode >= 2.5 && tile_track_mode < 4.5)) {
        // Column-lane tracks (safe vertical translation per col so lanes never overlap horizontally)
        float sy_dir = (is_scroll > 0.5 && abs(scroll_dir.y) > 0.1) ? sign(scroll_dir.y) : 1.0;
        float c_idx = floor(grid_p.x / step_px);
        float c_odd = fmod(abs(c_idx), 2.0) > 0.5 ? 1.0 : 0.0;
        if (tile_track_mode >= 5.5 && tile_track_mode < 6.5) {
            float s_off = sin(t * max(0.3, tile_speed * 0.12)) * step_px * 1.6 * sy_dir;
            grid_p.y += (c_odd > 0.5 ? -s_off : s_off);
        } else if ((tile_track_mode >= 3.5 && tile_track_mode < 4.5) || (tile_track_mode >= 6.5 && tile_track_mode < 7.5)) {
            grid_p.y += sy_dir * tile_speed * t * (c_odd > 0.5 ? 2.0 : 1.0);
        } else if (tile_track_mode >= 7.5) {
            grid_p.y += sy_dir * tile_speed * t * (c_odd > 0.5 ? 0.0 : 1.0);
        } else {
            grid_p.y += sy_dir * tile_speed * t * (c_odd > 0.5 ? -1.0 : 1.0);
        }
    } else if (tile_motion >= 3.5 && tile_motion < 4.5) {
        // Six completed cycles return lane parity to its starting state.
        float cyc = t * max(0.12, tile_speed * 0.015);
        float base_c = floor(cyc);
        float ph = frac(cyc);
        float ro = fmod(abs(floor(grid_p.y / step_px)), 2.0);
        float co = fmod(abs(floor(grid_p.x / step_px)), 2.0);
        float block = tile_track_mode >= 7.5 ? ((ro > 0.5 && co < 0.5) ? 0.0 : 4.0)
            : (tile_track_mode >= 6.5 ? ((ro > 0.5 && co > 0.5) ? 12.0 : 8.0) : 0.0);
        grid_p += float2(block, block) * floor(base_c / 6.0) * step_px;
        float remainder = fmod(base_c, 6.0);
        for (int wi = 0; wi < 5; wi++) {
            if (float(wi) >= remainder) break;
            ro = fmod(abs(floor(grid_p.y / step_px)), 2.0);
            grid_p.x += step_px * (tile_track_mode >= 7.5 ? (ro < 0.5 ? 1.0 : 0.0)
                : (tile_track_mode >= 6.5 ? (ro > 0.5 ? 2.0 : 1.0) : (ro > 0.5 ? -1.0 : 1.0)));
            co = fmod(abs(floor(grid_p.x / step_px)), 2.0);
            grid_p.y += step_px * (tile_track_mode >= 7.5 ? (co > 0.5 ? 1.0 : 0.0)
                : (tile_track_mode >= 6.5 ? (co > 0.5 ? 2.0 : 1.0) : (co > 0.5 ? -1.0 : 1.0)));
        }
        float q = ph < 0.5 ? ph * 2.0 : (ph - 0.5) * 2.0;
        float eased = q < 0.5 ? 4.0 * q * q * q : 1.0 - pow(-2.0 * q + 2.0, 3.0) * 0.5;
        ro = fmod(abs(floor(grid_p.y / step_px)), 2.0);
        grid_p.x += step_px * (ph < 0.5 ? eased : 1.0) * (tile_track_mode >= 7.5 ? (ro < 0.5 ? 1.0 : 0.0)
            : (tile_track_mode >= 6.5 ? (ro > 0.5 ? 2.0 : 1.0) : (ro > 0.5 ? -1.0 : 1.0)));
        co = fmod(abs(floor(grid_p.x / step_px)), 2.0);
        grid_p.y += step_px * (ph < 0.5 ? 0.0 : eased) * (tile_track_mode >= 7.5 ? (co > 0.5 ? 1.0 : 0.0)
            : (tile_track_mode >= 6.5 ? (co > 0.5 ? 2.0 : 1.0) : (co > 0.5 ? -1.0 : 1.0)));
    }

    float row = floor(grid_p.y / step_px);
    // Layout offsets: 1:brick (row offset X), 2:stagger (col offset Y)
    if (tile_layout > 0.5 && tile_layout < 1.5) {
        grid_p.x += fmod(abs(row), 2.0) * (tile_offset_x / 100.0) * step_px;
    } else if (tile_layout >= 1.5 && tile_layout < 2.5) {
        float c_tmp = floor(grid_p.x / step_px);
        grid_p.y += fmod(abs(c_tmp), 2.0) * (tile_offset_y / 100.0) * step_px;
        row = floor(grid_p.y / step_px);
    }
    float col_idx = floor(grid_p.x / step_px);
    float2 cell_id = float2(col_idx, row);
    float2 rnd = hash22(cell_id);

    float2 lp = (frac(grid_p / step_px) - 0.5) * step_px;
    lp -= (rnd - 0.5) * (tile_pos_jitter / 100.0) * (step_px * 0.35);

    // 8:wave, 9:float per-tile displacement & scale
    float sc_wave = 1.0;
    float rot_extra = 0.0;
    if (tile_motion >= 7.5 && tile_motion < 8.5) {
        float wph = (cell_id.x * 0.55 + cell_id.y * 0.45) - t * max(0.5, tile_speed * 0.15);
        lp.y -= cos(wph) * tile_size * wave_f * 0.16;
        sc_wave = max(0.1, 1.0 + sin(wph) * wave_f * 0.45);
        rot_extra = sin(wph) * wave_f * 0.35;
    } else if (tile_motion >= 8.5) {
        float fph = t * max(0.4, tile_speed * 0.12);
        lp -= float2(sin(fph + rnd.x * 6.283) * step_px * wave_f * 0.25, cos(fph * 0.85 + rnd.y * 6.283) * step_px * wave_f * 0.25);
        sc_wave = max(0.1, 1.0 + sin(fph + rnd.x * 6.283) * wave_f * 0.18);
        rot_extra = cos(fph + rnd.y * 6.283) * wave_f * 0.35;
    } else if (tile_motion >= 4.5 && tile_motion < 5.5) {
        float sw_ph = t * max(0.5, tile_speed * 0.12);
        float sw_dir = (fmod(abs(cell_id.x + cell_id.y), 2.0) > 0.5) ? -1.0 : 1.0;
        rot_extra = sw_dir * sin(sw_ph + (cell_id.x + cell_id.y) * 0.4) * (wave_f * 0.65);
    }

    float is_alt = fmod(abs(cell_id.x + cell_id.y), 2.0);
    if (tile_layout > 3.5 && is_alt < 0.5) return float4(0.0, 0.0, 0.0, 0.0);
    float sc = ((is_alt > 0.5) ? tile_alt_scale : 1.0) * sc_wave;
    sc *= 1.0 + (rnd.x - 0.5) * (tile_scale_jitter / 100.0) * 1.2;

    float sdir = 1.0;
    if (tile_spin_dir > 0.5 && tile_spin_dir < 1.5) sdir = -1.0;
    else if (tile_spin_dir >= 1.5) sdir = (is_alt > 0.5) ? -1.0 : 1.0;
    float spin_amt = ((tile_motion >= 5.5 && tile_motion < 7.5) ? tile_spin_rad * t * sdir : 0.0);
    float tilt_sign = (is_alt > 0.5 && tile_alt_flip < 0.5) ? -1.0 : 1.0;
    float ang = (tile_angle_rad * tilt_sign) + spin_amt + rot_extra + (rnd.y - 0.5) * (tile_rot_jitter / 180.0) * 3.1415926 * 2.0;

    float2 local_px = rot2d(lp, -ang) / max(0.1, sc);
    float2 uv = (local_px / max(16.0, tile_size)) + 0.5;
    if (is_alt > 0.5) {
        if (tile_alt_flip > 0.5 && tile_alt_flip < 1.5) uv.x = 1.0 - uv.x;
        else if (tile_alt_flip >= 1.5 && tile_alt_flip < 2.5) uv.y = 1.0 - uv.y;
        else if (tile_alt_flip >= 2.5 && tile_alt_flip < 3.5) uv = 1.0 - uv;
    }

    float slot_idx = 0.0;
    if (tile_count > 1.5) {
        float nslots = clamp(tile_count, 1.0, 4.0);
        if (tile_dist < 0.5) slot_idx = fmod(abs(cell_id.x + cell_id.y), nslots);
        else if (tile_dist < 1.5) slot_idx = fmod(abs(cell_id.y), nslots);
        else if (tile_dist < 2.5) slot_idx = fmod(abs(cell_id.x), nslots);
        else if (tile_dist < 3.5) slot_idx = fmod(fmod(abs(cell_id.x), 2.0) + fmod(abs(cell_id.y), 2.0) * 2.0, nslots);
        else slot_idx = floor(rnd.x * nslots);
    }

    float4 tex = sampleTileStamp(uv, slot_idx);
    if (tex.a <= 0.001) return float4(0.0, 0.0, 0.0, 0.0);

    float hue_a = (rnd.x - 0.5) * (tile_hue_jitter / 180.0) * 6.2831853;
    if (tile_hue_mode > 0.5 && tile_hue_mode < 1.5) {
        hue_a += t * tile_hue_speed * 0.08;
    } else if (tile_hue_mode >= 1.5 && tile_hue_mode < 2.5) {
        hue_a += px.x * 0.004 - t * tile_hue_speed * 0.1;
    } else if (tile_hue_mode >= 2.5) {
        hue_a += px.y * 0.004 - t * tile_hue_speed * 0.1;
    }
    float has_hue_fx = (tile_hue_mode > 0.5 || abs(hue_a) > 0.001) ? 1.0 : 0.0;
    if (has_hue_fx > 0.5 || tile_sat_jitter > 0.5 || tile_bright_jitter > 0.5) {
        float3 unpm = tex.rgb / max(tex.a, 0.001);
        if (has_hue_fx > 0.5) {
            float mx = max(unpm.r, max(unpm.g, unpm.b));
            float mn = min(unpm.r, min(unpm.g, unpm.b));
            if ((mx - mn) < 0.08) {
                float l_base = (mx > 0.92) ? 0.58 : max(0.32, mx * 0.72);
                unpm = clamp(hueShiftRgb(float3(l_base * 1.48, l_base * 0.36, l_base * 0.56), hue_a), 0.0, 1.0);
            } else {
                unpm = clamp(hueShiftRgb(unpm, hue_a), 0.0, 1.0);
            }
        }
        if (tile_sat_jitter > 0.5) {
            float lum = dot(unpm, float3(0.299, 0.587, 0.114));
            float sf = 1.0 + (rnd.y - 0.5) * (tile_sat_jitter / 50.0);
            unpm = clamp(lerp(float3(lum, lum, lum), unpm, sf), 0.0, 1.0);
        }
        if (tile_bright_jitter > 0.5) {
            unpm = clamp(unpm * (1.0 + (rnd.x - 0.5) * (tile_bright_jitter / 50.0)), 0.0, 1.0);
        }
        tex.rgb = unpm * tex.a;
    }

    float cell_alpha = tile_opacity * ((is_alt > 0.5) ? tile_alt_opacity : 1.0);
    if (tile_twinkle > 0.5) {
        float tw = 1.0 - (tile_twinkle / 100.0) * (0.5 + 0.5 * sin(t * max(0.5, tile_twinkle_speed) + rnd.y * 12.0));
        cell_alpha *= tw;
    }
    return tex * cell_alpha;
}

float4 evalCanvasBackground(float2 uv, float2 px, float t) {
    if (bg_type < 0.5) return float4(0.0, 0.0, 0.0, 0.0);
    float4 c1 = float4(bg_color.rgb, bg_color.a);
    if (bg_type < 1.5) return float4(c1.rgb * c1.a, c1.a);

    float4 c2 = float4(bg_color2.rgb, bg_color2.a);
    float4 cm = float4(bg_color3.rgb, bg_color3.a);
    float sp = max(0.1, bg_motion_speed);
    float ang = bg_angle_rad;
    float rad_mul = max(0.1, bg_radius / 100.0);
    float shift = 0.0;
    if (bg_motion > 0.5 && bg_motion < 1.5) ang += t * sp * 0.45;
    else if (bg_motion >= 1.5 && bg_motion < 2.5) rad_mul *= 1.0 + 0.14 * sin(t * sp * 1.4);
    else if (bg_motion >= 2.5) shift = sin(t * sp * 0.85) * 0.25;

    float k = 0.0;
    if (bg_type < 2.5) {
        // 2: Linear Gradient
        float2 dir = float2(cos(ang), sin(ang));
        float2 aspect = float2(canvas_size.x / max(1.0, canvas_size.y), 1.0);
        float2 centered = (uv - 0.5) * aspect;
        float span = abs(dir.x) * aspect.x + abs(dir.y) * aspect.y;
        k = saturate((dot(centered, dir) / max(0.1, span)) + 0.5 + shift);
    } else if (bg_type < 3.5) {
        // 3: Radial Spotlight Gradient
        float2 origin = bg_center / 100.0;
        float2 aspect = float2(canvas_size.x / max(1.0, canvas_size.y), 1.0);
        float d = length((uv - origin) * aspect) / max(0.1, rad_mul * 0.72);
        k = saturate(d + shift);
    } else {
        // 4: Conic Sweep / Aurora
        float2 origin = bg_center / 100.0;
        float2 dv = uv - origin;
        float a = atan2(dv.y, dv.x) + ang;
        k = 0.5 + 0.5 * sin(a + t * ((bg_motion > 0.5) ? sp * 0.8 : 0.0));
    }

    float dither = (hash21(px) - 0.5) * 0.004;
    k = saturate(k + dither);
    float4 col;
    if (bg_use_mid > 0.5) {
        col = (k < 0.5) ? lerp(c1, cm, k * 2.0) : lerp(cm, c2, (k - 0.5) * 2.0);
    } else {
        col = lerp(c1, c2, k);
    }
    return float4(col.rgb * col.a, col.a);
}

float modPos(float v, float m) {
    float r = fmod(v, m);
    return r < 0.0 ? r + m : r;
}

float4 evalBakedProcedural(float2 px, float t) {
    float2 p_uv = px;
    float2 vel = float2(cos(proc_pan_rad), sin(proc_pan_rad)) * proc_speed * 42.0;
    if (proc_motion >= 7.5) {
        p_uv += (proc_pan_osc > 0.5) ? vel * sin(t * 0.8) * 1.8 : vel * t;
    } else if (proc_motion >= 6.5) {
        p_uv += float2(sin(t * proc_speed * 0.55 + px.y * 0.002), cos(t * proc_speed * 0.4 + px.x * 0.002)) * 28.0;
    } else if (proc_motion >= 4.5 && proc_motion < 5.5) {
        p_uv += float2(cos(t * proc_speed * 0.8), sin(t * proc_speed * 0.8)) * 36.0;
    } else if (proc_motion >= 2.5 && proc_motion < 3.5) {
        p_uv = rot2d(p_uv - canvas_size * 0.5, sin(t * proc_speed * 0.9) * 0.045) + canvas_size * 0.5;
    } else if (proc_motion >= 1.5 && proc_motion < 2.5) {
        p_uv.y -= t * proc_speed * 48.0;
        p_uv.x += sin(t * proc_speed * 0.7) * 18.0;
    } else if (proc_motion >= 0.5 && proc_motion < 1.5) {
        p_uv += float2(sin(t * proc_speed * 0.7), cos(t * proc_speed * 0.55)) * 45.0;
    } else if (proc_motion >= 3.5 && proc_motion < 4.5) {
        float z = 1.0 + 0.06 * sin(t * proc_speed * 1.6);
        p_uv = (p_uv - canvas_size * 0.5) * z + canvas_size * 0.5;
    }
    float z_scale = max(0.15, proc_scale / 100.0);
    float2 ts = max(float2(64.0, 64.0), stamp_size);
    float2 uv_px = frac((p_uv / z_scale) / ts) * ts;
    float2 suv = uv_px / ts;
    if (proc_spin_mode > 0.5 && stamp_grid.x >= 2.0 && stamp_grid.y >= 2.0) {
        float2 cell_sz = ts / stamp_grid;
        float r0 = floor(uv_px.y / cell_sz.y);
        float best_d2 = 1000000000.0;
        float2 best_c = float2(0.0, 0.0);
        float2 best_cid = float2(0.0, 0.0);
        for (int dr = -1; dr <= 1; dr++) {
            float rr = r0 + float(dr);
            float wrow = modPos(rr, stamp_grid.y);
            float roff = (fmod(wrow, 2.0) >= 0.5) ? (cell_sz.x * 0.5) : 0.0;
            float c0 = floor((uv_px.x - roff) / cell_sz.x);
            for (int dc = -1; dc <= 1; dc++) {
                float cc = c0 + float(dc);
                float wcol = modPos(cc, stamp_grid.x);
                float2 center = float2(cc * cell_sz.x + roff, rr * cell_sz.y);
                float2 diff = uv_px - center;
                float d2 = dot(diff, diff);
                if (d2 < best_d2) {
                    best_d2 = d2;
                    best_c = center;
                    best_cid = float2(wcol, wrow);
                }
            }
        }
        float h = hash21(best_cid);
        float sdir = (h > 0.5) ? 1.0 : -1.0;
        float spin_a = 0.0;
        if (proc_spin_mode < 1.5) spin_a = t * proc_spin_speed * 1.1 * sdir;
        else if (proc_spin_mode < 2.5) spin_a = -t * proc_spin_speed * 1.1 * sdir;
        else spin_a = sin(t * proc_spin_speed * 1.6 + h * 6.2831853) * 0.38;
        float2 rel = uv_px - best_c;
        suv = frac((best_c + rot2d(rel, -spin_a)) / ts);
    }
    float4 st = stamp_tex.Sample(textureSampler, suv);
    if (st.a <= 0.001) return float4(0.0, 0.0, 0.0, 0.0);
    if (proc_color_anim > 0.5 && proc_color_anim < 1.5) {
        st.rgb = clamp(hueShiftRgb(st.rgb, t * proc_color_speed * 0.85), 0.0, 1.0);
    } else if (proc_color_anim >= 1.5) {
        st.a *= 0.65 + 0.35 * sin(t * proc_color_speed * 2.1 + (px.x + px.y) * 0.005);
    }
    if (proc_inplace_mode > 0.5) {
        float t_ip = t * max(0.2, proc_inplace_speed);
        float sh = (proc_inplace_mode >= 3.5)
            ? (0.55 + 0.45 * abs(sin(t_ip * 3.8 + floor(p_uv.x / 64.0) * 1.7 + floor(p_uv.y / 64.0) * 2.3)))
            : (0.84 + 0.16 * sin(t_ip * 1.8 + floor(p_uv.x / 96.0) * 1.1));
        st.a *= sh;
    }
    return float4(st.rgb * st.a, st.a);
}

float4 evalSceneSample(float2 uv, float2 px, float t) {
    float4 bg_pm = evalCanvasBackground(uv, px, t);
    float4 fg_pm = (mode_code > 0.5)
        ? evalPatternTiles(px, t)
        : (has_stamp > 0.5 ? evalBakedProcedural(px, t) : evalProceduralPattern(px, t));
    return fg_pm + bg_pm * (1.0 - fg_pm.a);
}

float4 applyGpuFilters(float4 res, float2 px, float t) {
    float a = res.a;
    if (a <= 0.001) return float4(0.0, 0.0, 0.0, 0.0);
    float3 rgb = clamp(res.rgb / a, 0.0, 1.0);

    rgb *= max(0.0, flt_brightness / 100.0);
    rgb = clamp((rgb - 0.5) * max(0.0, flt_contrast / 100.0) + 0.5, 0.0, 1.0);
    if (abs(flt_hue_rad) > 0.001) {
        rgb = clamp(hueShiftRgb(rgb, flt_hue_rad), 0.0, 1.0);
    }
    float luma = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    if (abs(flt_saturate - 100.0) > 0.5) {
        rgb = clamp(lerp(float3(luma, luma, luma), rgb, max(0.0, flt_saturate / 100.0)), 0.0, 1.0);
    }
    if (flt_grayscale > 0.5) {
        float g_luma = dot(rgb, float3(0.2126, 0.7152, 0.0722));
        rgb = lerp(rgb, float3(g_luma, g_luma, g_luma), clamp(flt_grayscale / 100.0, 0.0, 1.0));
    }
    if (flt_duo_on > 0.5) {
        float d_luma = dot(rgb, float3(0.2126, 0.7152, 0.0722));
        rgb = lerp(flt_duo_dark.rgb, flt_duo_light.rgb, clamp(d_luma, 0.0, 1.0));
    }
    if (flt_tint_on > 0.5) {
        rgb = lerp(rgb, flt_tint_color.rgb, clamp(flt_tint_amt / 100.0, 0.0, 1.0));
    }
    if (flt_grain_amt > 0.005) {
        float g_px = max(0.5, flt_grain_size / 100.0);
        float2 g_seed = floor(px / g_px) + ((flt_grain_anim > 0.5) ? float2(floor(t * 24.0) * 1.37, floor(t * 24.0) * 0.73) : float2(0.0, 0.0));
        float g = (hash21(g_seed) - 0.5) * (flt_grain_amt / 100.0);
        rgb = clamp(rgb + g, 0.0, 1.0);
    }
    return float4(rgb * a, a);
}

float4 PSDefault(VertDataOut v_in) : TARGET {
    float2 px = v_in.uv * canvas_size;
    float4 res = evalSceneSample(v_in.uv, px, anim_time);

    if (flt_blur > 0.25) {
        float br = clamp(flt_blur, 0.25, 60.0);
        float2 inv_sz = 1.0 / max(canvas_size, float2(1.0, 1.0));
        float4 acc = res;
        float w_sum = 1.0;
        for (int bi = 0; bi < 16; bi++) {
            float fbi = float(bi);
            float b_ang = fbi * 2.3999632 + 0.41;
            float b_rr = sqrt((fbi + 0.5) / 16.0);
            float b_w = exp(-2.2 * b_rr * b_rr);
            float2 b_off = float2(cos(b_ang), sin(b_ang)) * (b_rr * br);
            acc += evalSceneSample(v_in.uv + b_off * inv_sz, px + b_off, anim_time) * b_w;
            w_sum += b_w;
        }
        res = acc / w_sum;
    }

    res = applyGpuFilters(res, px, anim_time);

    if (vignette_amt > 0.005) {
        float2 vp = (v_in.uv - 0.5) * 2.0;
        float vr = length(vp);
        float va = smoothstep(0.35, 1.42, vr) * vignette_amt * vignette_color.a;
        res = float4(lerp(res.rgb, vignette_color.rgb * res.a, va), res.a);
    }

    return res * clamp(opacity, 0.0, 1.0);
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
    local proc_raw = extract_object_raw(block, "procedural") or "{}"
    local tiles_raw = extract_object_raw(block, "tiles") or "{}"
    local flt_raw = extract_object_raw(block, "filters") or "{}"

    return {
        id = id,
        name = extract_string(block, "name", id),
        modeCode = extract_number(block, "modeCode", 0),
        width = extract_number(block, "width", 1920),
        height = extract_number(block, "height", 1080),
        opacity = extract_number(block, "opacity", 100) / 100.0,
        bgTypeCode = extract_number(block, "bgTypeCode", 1),
        bgColorRgba = parse_number_array(extract_array_raw(block, "bgColorRgba") or "[0.043,0.063,0.106,1]"),
        bgColor2Rgba = parse_number_array(extract_array_raw(block, "bgColor2Rgba") or "[0.118,0.106,0.294,1]"),
        bgColor3Rgba = parse_number_array(extract_array_raw(block, "bgColor3Rgba") or "[0.059,0.463,0.431,1]"),
        bgUseMid = extract_bool(block, "bgUseMid", false) and 1.0 or 0.0,
        bgAngle = extract_number(block, "bgAngle", 135),
        bgCenterX = extract_number(block, "bgCenterX", 50),
        bgCenterY = extract_number(block, "bgCenterY", 50),
        bgRadius = extract_number(block, "bgRadius", 75),
        bgMotionCode = extract_number(block, "bgMotionCode", 0),
        bgMotionSpeed = extract_number(block, "bgMotionSpeed", 1),
        vignette = extract_number(block, "vignette", 25) / 100.0,
        vignetteColorRgba = parse_number_array(extract_array_raw(block, "vignetteColorRgba") or "[0,0,0,1]"),
        procedural = {
            presetCode = extract_number(proc_raw, "presetCode", 3),
            scale = extract_number(proc_raw, "scale", 100),
            lineWidth = extract_number(proc_raw, "lineWidth", 2),
            accentRgba = parse_number_array(extract_array_raw(proc_raw, "accentRgba") or "[0.35,0.65,1,1]"),
            secondaryRgba = parse_number_array(extract_array_raw(proc_raw, "secondaryRgba") or "[0.66,0.33,0.97,1]"),
            pal0 = parse_number_array(extract_array_raw(proc_raw, "pal0") or "[0.35,0.65,1,1]"),
            pal1 = parse_number_array(extract_array_raw(proc_raw, "pal1") or "[0.66,0.33,0.97,1]"),
            pal2 = parse_number_array(extract_array_raw(proc_raw, "pal2") or "[0.35,0.65,1,1]"),
            pal3 = parse_number_array(extract_array_raw(proc_raw, "pal3") or "[0.66,0.33,0.97,1]"),
            pal4 = parse_number_array(extract_array_raw(proc_raw, "pal4") or "[0.35,0.65,1,1]"),
            pal5 = parse_number_array(extract_array_raw(proc_raw, "pal5") or "[0.66,0.33,0.97,1]"),
            pal6 = parse_number_array(extract_array_raw(proc_raw, "pal6") or "[0.35,0.65,1,1]"),
            palCount = extract_number(proc_raw, "palCount", 2),
            fillModeCode = extract_number(proc_raw, "fillModeCode", 0),
            fillOpacity = extract_number(proc_raw, "fillOpacity", 35),
            colorModeCode = extract_number(proc_raw, "colorModeCode", 0),
            colorAnimCode = extract_number(proc_raw, "colorAnimCode", 0),
            colorSpeed = extract_number(proc_raw, "colorSpeed", 1),
            motionCode = extract_number(proc_raw, "motionCode", 1),
            speed = extract_number(proc_raw, "speed", 1),
            panOsc = extract_number(proc_raw, "panOsc", 0),
            panAngle = extract_number(proc_raw, "panAngle", 45),
            inPlaceCode = extract_number(proc_raw, "inPlaceCode", 1),
            inPlaceSpeed = extract_number(proc_raw, "inPlaceSpeed", 1),
            spinModeCode = extract_number(proc_raw, "spinModeCode", 0),
            spinSpeed = extract_number(proc_raw, "spinSpeed", 1),
            density = extract_number(proc_raw, "density", 1),
            spacing = extract_number(proc_raw, "spacing", 100),
            sizeVariance = extract_number(proc_raw, "sizeVariance", 0),
            scatter = extract_number(proc_raw, "scatter", 0),
            rotationVariance = extract_number(proc_raw, "rotationVariance", 0),
            bakedStampFile = extract_string(proc_raw, "bakedStampFile", ""),
            stampCols = extract_number(proc_raw, "stampCols", 0),
            stampRows = extract_number(proc_raw, "stampRows", 0)
        },
        filters = {
            brightness = extract_number(flt_raw, "brightness", 100),
            contrast = extract_number(flt_raw, "contrast", 100),
            saturate = extract_number(flt_raw, "saturate", 100),
            grayscale = extract_number(flt_raw, "grayscale", 0),
            hueRotate = extract_number(flt_raw, "hueRotate", 0),
            blur = extract_number(flt_raw, "blur", 0),
            duoOn = extract_bool(flt_raw, "duoEnabled", false) and 1.0 or 0.0,
            duoDarkRgba = parse_number_array(extract_array_raw(flt_raw, "duoDarkRgba") or "[0.118,0.106,0.294,1]"),
            duoLightRgba = parse_number_array(extract_array_raw(flt_raw, "duoLightRgba") or "[0.133,0.827,0.933,1]"),
            tintOn = extract_bool(flt_raw, "tintEnabled", false) and 1.0 or 0.0,
            tintColorRgba = parse_number_array(extract_array_raw(flt_raw, "tintColorRgba") or "[0.345,0.651,1,1]"),
            tintAmount = extract_number(flt_raw, "tintOpacity", 25),
            grainAmount = extract_number(flt_raw, "grainAmount", 0),
            grainSize = extract_number(flt_raw, "grainSize", 150),
            grainAnim = extract_bool(flt_raw, "grainAnimate", true) and 1.0 or 0.0
        },
        tiles = {
            tileCount = extract_number(tiles_raw, "tileCount", 1),
            tileDistCode = extract_number(tiles_raw, "tileDistCode", 0),
            layoutCode = extract_number(tiles_raw, "layoutCode", 1),
            symmetryCode = extract_number(tiles_raw, "symmetryCode", 0),
            wedges = extract_number(tiles_raw, "wedges", 6),
            kaleidoMorph = extract_bool(tiles_raw, "kaleidoMorph", true) and 1.0 or 0.0,
            kaleidoSpeed = extract_number(tiles_raw, "kaleidoSpeed", 8),
            kaleidoDirCode = extract_number(tiles_raw, "kaleidoDirCode", 0),
            kaleidoDepth = extract_number(tiles_raw, "kaleidoDepth", 35),
            tileSize = extract_number(tiles_raw, "tileSize", 96),
            gap = extract_number(tiles_raw, "gap", 18),
            offsetX = extract_number(tiles_raw, "offsetX", 50),
            offsetY = extract_number(tiles_raw, "offsetY", 50),
            gridAngle = extract_number(tiles_raw, "gridAngle", 0),
            tileAngle = extract_number(tiles_raw, "tileAngle", 0),
            altFlipCode = extract_number(tiles_raw, "altFlipCode", 0),
            tileOpacity = extract_number(tiles_raw, "tileOpacity", 1),
            altOpacity = extract_number(tiles_raw, "altOpacity", 0.65),
            altScale = extract_number(tiles_raw, "altScale", 1),
            motionCode = extract_number(tiles_raw, "motionCode", 1),
            trackModeCode = extract_number(tiles_raw, "trackModeCode", 0),
            spinDirCode = extract_number(tiles_raw, "spinDirCode", 0),
            scrollAngle = extract_number(tiles_raw, "scrollAngle", 35),
            speed = extract_number(tiles_raw, "speed", 16),
            spinSpeed = extract_number(tiles_raw, "spinSpeed", 8),
            waveAmount = extract_number(tiles_raw, "waveAmount", 25),
            hueModeCode = extract_number(tiles_raw, "hueModeCode", 0),
            hueSpeed = extract_number(tiles_raw, "hueSpeed", 14),
            hueJitter = extract_number(tiles_raw, "hueJitter", 0),
            saturationJitter = extract_number(tiles_raw, "saturationJitter", 0),
            brightnessJitter = extract_number(tiles_raw, "brightnessJitter", 0),
            scaleJitter = extract_number(tiles_raw, "scaleJitter", 0),
            rotationJitter = extract_number(tiles_raw, "rotationJitter", 0),
            positionJitter = extract_number(tiles_raw, "positionJitter", 0),
            twinkle = extract_number(tiles_raw, "twinkle", 0),
            twinkleSpeed = extract_number(tiles_raw, "twinkleSpeed", 4),
            tintColorRgba = parse_number_array(extract_array_raw(tiles_raw, "tintColorRgba") or "[1,1,1,1]"),
            stampFile = extract_string(tiles_raw, "stampFile", "")
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
    obs.blog(obs.LOG_INFO, "[StreamPulse Patterns] Synced manifest rev " .. tostring(rev) .. " (default=" .. tostring(default_profile_id) .. ")")
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

local function free_stamp_texture(data)
    obs.obs_enter_graphics()
    if data.stamp_owns_tex and data.stamp_tex ~= nil then
        obs.gs_texture_destroy(data.stamp_tex)
    end
    data.stamp_tex = nil
    data.stamp_owns_tex = false
    if data.stamp_img_ex ~= nil and obs.gs_image_file_ex_free then
        pcall(obs.gs_image_file_ex_free, data.stamp_img_ex)
    end
    if data.stamp_img ~= nil and obs.gs_image_file_free then
        pcall(obs.gs_image_file_free, data.stamp_img)
        data.stamp_img = nil
    end
    obs.obs_leave_graphics()
    data.stamp_cx = 512
    data.stamp_cy = 512
end

local function ensure_stamp_texture(data, stamp_file, stamp_key)
    local target = stamp_file or ""
    local key = stamp_key or target
    if key == (data.loaded_stamp_key or "") then
        return
    end
    data.loaded_stamp_file = target
    data.loaded_stamp_key = key
    free_stamp_texture(data)
    if target == "" then
        return
    end
    local full_path = DEFAULT_STAMPS_DIR .. "/" .. target
    local alpha_straight = obs.GS_IMAGE_ALPHA_STRAIGHT or 0

    if obs.gs_image_file_ex and obs.gs_image_file_ex_init and obs.gs_image_file_ex_init_texture then
        if data.stamp_img_ex == nil then
            local ok_c, img_ex = pcall(obs.gs_image_file_ex)
            if ok_c and img_ex ~= nil then data.stamp_img_ex = img_ex end
        end
        if data.stamp_img_ex ~= nil then
            local ok_i = pcall(obs.gs_image_file_ex_init, data.stamp_img_ex, full_path, alpha_straight)
            if ok_i then
                obs.obs_enter_graphics()
                pcall(obs.gs_image_file_ex_init_texture, data.stamp_img_ex)
                obs.obs_leave_graphics()
                if data.stamp_img_ex.loaded and data.stamp_img_ex.texture ~= nil then
                    data.stamp_tex = data.stamp_img_ex.texture
                    data.stamp_owns_tex = false
                    data.stamp_cx = (data.stamp_img_ex.cx and data.stamp_img_ex.cx > 0) and data.stamp_img_ex.cx or 512
                    data.stamp_cy = (data.stamp_img_ex.cy and data.stamp_img_ex.cy > 0) and data.stamp_img_ex.cy or 512
                    return
                end
            end
        end
    end

    if obs.gs_texture_create_from_file then
        obs.obs_enter_graphics()
        local ok_t, tex = pcall(obs.gs_texture_create_from_file, full_path)
        if ok_t and tex ~= nil then
            data.stamp_tex = tex
            data.stamp_owns_tex = true
            local tw = obs.gs_texture_get_width and obs.gs_texture_get_width(tex) or 512
            local th = obs.gs_texture_get_height and obs.gs_texture_get_height(tex) or 512
            data.stamp_cx = (tw and tw > 0) and tw or 512
            data.stamp_cy = (th and th > 0) and th or 512
        end
        obs.obs_leave_graphics()
        if data.stamp_tex ~= nil then return end
    end

    if obs.gs_image_file and obs.gs_image_file_init and obs.gs_image_file_init_texture then
        obs.obs_enter_graphics()
        local ok, img = pcall(obs.gs_image_file)
        if ok and img ~= nil then
            pcall(obs.gs_image_file_init, img, full_path)
            pcall(obs.gs_image_file_init_texture, img)
            if img.texture ~= nil then
                data.stamp_img = img
                data.stamp_tex = img.texture
                data.stamp_owns_tex = false
                data.stamp_cx = (img.cx and img.cx > 0) and img.cx or 512
                data.stamp_cy = (img.cy and img.cy > 0) and img.cy or 512
            end
        end
        obs.obs_leave_graphics()
    end
end

-- ----------------------------------------------------------------------------
-- OBS Standalone Video Source Definition
-- ----------------------------------------------------------------------------
local bit = bit or bit32
local source_def = {}
source_def.id = "streampulse_pattern_source"
source_def.type = obs.OBS_SOURCE_TYPE_INPUT
source_def.output_flags = bit and bit.bor(obs.OBS_SOURCE_VIDEO, obs.OBS_SOURCE_CUSTOM_DRAW)
    or (obs.OBS_SOURCE_VIDEO + obs.OBS_SOURCE_CUSTOM_DRAW)

source_def.get_name = function()
    return "StreamPulse Pattern Background"
end

source_def.get_defaults = function(settings)
    obs.obs_data_set_default_string(settings, "profile_id", "auto")
    obs.obs_data_set_default_int(settings, "width", 1920)
    obs.obs_data_set_default_int(settings, "height", 1080)
end

source_def.get_properties = function(data)
    reload_manifest(true)
    local props = obs.obs_properties_create()
    local list = obs.obs_properties_add_list(
        props,
        "profile_id",
        "StreamPulse Pattern Profile",
        obs.OBS_COMBO_TYPE_LIST,
        obs.OBS_COMBO_FORMAT_STRING
    )
    obs.obs_property_list_add_string(list, "Auto (Active / Per-Source Assignment)", "auto")
    for id, prof in pairs(profiles_by_id) do
        obs.obs_property_list_add_string(list, prof.name .. " (" .. id .. ")", id)
    end
    obs.obs_properties_add_int(props, "width", "Width", 64, 7680, 1)
    obs.obs_properties_add_int(props, "height", "Height", 64, 4320, 1)
    return props
end

source_def.update = function(data, settings)
    data.profile_id = obs.obs_data_get_string(settings, "profile_id")
    if data.profile_id == "" then data.profile_id = "auto" end
    local w = obs.obs_data_get_int(settings, "width")
    local h = obs.obs_data_get_int(settings, "height")
    data.width = (w and w > 0) and w or 1920
    data.height = (h and h > 0) and h or 1080
    pcall(reload_manifest, true)
    pcall(refresh_active_scene_name)
end

source_def.create = function(settings, source)
    local data = {}
    data.context = source
    data.profile_id = "auto"
    data.width = 1920
    data.height = 1080
    data.anim_time = 0
    data.loaded_stamp_file = ""
    data.loaded_stamp_key = ""
    data.stamp_img = nil
    data.stamp_img_ex = obs.gs_image_file_ex and obs.gs_image_file_ex() or nil
    data.stamp_tex = nil
    data.stamp_owns_tex = false
    data.stamp_cx = 512
    data.stamp_cy = 512
    data.rt = nil
    data.use_rt_fallback = false
    data._v2 = obs.vec2()
    data._v4 = obs.vec4()
    data._zero_v4 = obs.vec4()
    obs.vec4_zero(data._zero_v4)
    data.params = {}

    obs.obs_enter_graphics()
    data.dummy_tex = obs.gs_texture_create(1, 1, obs.GS_RGBA, 1, nil, 0)
    data.effect = obs.gs_effect_create(EFFECT_SOURCE, "streampulse_pattern_effect", nil)
    if data.effect ~= nil then
        local names = {
            "stamp_tex", "canvas_size", "stamp_size", "stamp_grid", "mode_code", "anim_time", "opacity",
            "bg_type", "bg_color", "bg_color2", "bg_color3", "bg_use_mid",
            "bg_angle_rad", "bg_center", "bg_radius", "bg_motion", "bg_motion_speed",
            "vignette_amt", "vignette_color",
            "proc_preset", "proc_scale", "proc_line_w", "proc_accent", "proc_secondary",
            "pal_c0", "pal_c1", "pal_c2", "pal_c3", "pal_c4", "pal_c5", "pal_c6", "pal_count",
            "proc_fill_mode", "proc_fill_opacity", "proc_color_mode", "proc_color_anim", "proc_color_speed",
            "proc_motion", "proc_speed", "proc_pan_osc", "proc_pan_rad",
            "proc_inplace_mode", "proc_inplace_speed", "proc_spin_mode", "proc_spin_speed",
            "proc_density", "proc_spacing", "proc_size_var", "proc_scatter", "proc_rot_var",
            "flt_brightness", "flt_contrast", "flt_saturate", "flt_grayscale", "flt_hue_rad", "flt_blur",
            "flt_duo_on", "flt_duo_dark", "flt_duo_light", "flt_tint_on", "flt_tint_color", "flt_tint_amt",
            "flt_grain_amt", "flt_grain_size", "flt_grain_anim",
            "tile_count", "tile_dist", "tile_layout", "tile_symmetry", "tile_wedges",
            "tile_kaleido_morph", "tile_kaleido_speed", "tile_kaleido_dir", "tile_kaleido_depth",
            "tile_size", "tile_gap", "tile_offset_x", "tile_offset_y", "tile_grid_rad", "tile_angle_rad",
            "tile_alt_flip", "tile_opacity", "tile_alt_opacity", "tile_alt_scale",
            "tile_motion", "tile_track_mode", "tile_spin_dir", "tile_scroll_rad", "tile_speed", "tile_spin_rad", "tile_wave_amt",
            "tile_hue_mode", "tile_hue_speed", "tile_hue_jitter", "tile_sat_jitter", "tile_bright_jitter",
            "tile_scale_jitter", "tile_rot_jitter", "tile_pos_jitter", "tile_twinkle", "tile_twinkle_speed",
            "tile_tint", "has_stamp"
        }
        for _, n in ipairs(names) do
            data.params[n] = obs.gs_effect_get_param_by_name(data.effect, n)
        end
    else
        obs.blog(obs.LOG_ERROR, "[StreamPulse Patterns] Failed to compile Metal/GPU pattern shader")
    end
    obs.obs_leave_graphics()

    source_def.update(data, settings)
    reload_manifest(false)
    return data
end

source_def.destroy = function(data)
    free_stamp_texture(data)
    data.stamp_img_ex = nil
    obs.obs_enter_graphics()
    if data.rt ~= nil then
        obs.gs_texrender_destroy(data.rt)
        data.rt = nil
    end
    if data.dummy_tex ~= nil then
        obs.gs_texture_destroy(data.dummy_tex)
        data.dummy_tex = nil
    end
    if data.effect ~= nil then
        obs.gs_effect_destroy(data.effect)
        data.effect = nil
    end
    obs.obs_leave_graphics()
end

local function resolve_active_profile(data)
    local pid = data.profile_id
    if pid == "auto" or pid == "" then
        local src_name = data.context and obs.obs_source_get_name(data.context) or ""
        if active_scene_name ~= "" and src_name ~= "" and assignment_rules[active_scene_name .. "::" .. src_name] ~= nil then
            pid = assignment_rules[active_scene_name .. "::" .. src_name]
        elseif src_name ~= "" and assignment_rules[src_name] ~= nil then
            pid = assignment_rules[src_name]
        else
            pid = default_profile_id
        end
    end
    return profiles_by_id[pid] or profiles_by_id[default_profile_id]
end

local function upload_effect_uniforms(data, prof)
    local p = data.params
    local v2 = data._v2
    local v4 = data._v4

    set_vec2(v2, p.canvas_size, data.width or 1920, data.height or 1080)
    set_vec2(v2, p.stamp_size, data.stamp_cx or 512, data.stamp_cy or 512)
    obs.gs_effect_set_float(p.mode_code, prof.modeCode or 0.0)
    obs.gs_effect_set_float(p.anim_time, data.anim_time or 0.0)
    obs.gs_effect_set_float(p.opacity, prof.opacity or 1.0)
    obs.gs_effect_set_float(p.bg_type, prof.bgTypeCode or 1.0)
    set_vec4(v4, p.bg_color, prof.bgColorRgba)
    set_vec4(v4, p.bg_color2, prof.bgColor2Rgba)
    set_vec4(v4, p.bg_color3, prof.bgColor3Rgba)
    obs.gs_effect_set_float(p.bg_use_mid, prof.bgUseMid or 0.0)
    obs.gs_effect_set_float(p.bg_angle_rad, (prof.bgAngle or 135.0) * 3.14159265 / 180.0)
    set_vec2(v2, p.bg_center, prof.bgCenterX or 50.0, prof.bgCenterY or 50.0)
    obs.gs_effect_set_float(p.bg_radius, prof.bgRadius or 75.0)
    obs.gs_effect_set_float(p.bg_motion, prof.bgMotionCode or 0.0)
    obs.gs_effect_set_float(p.bg_motion_speed, prof.bgMotionSpeed or 1.0)
    obs.gs_effect_set_float(p.vignette_amt, prof.vignette or 0.25)
    set_vec4(v4, p.vignette_color, prof.vignetteColorRgba)

    local pr = prof.procedural or {}
    obs.gs_effect_set_float(p.proc_preset, pr.presetCode or 3.0)
    obs.gs_effect_set_float(p.proc_scale, pr.scale or 100.0)
    obs.gs_effect_set_float(p.proc_line_w, pr.lineWidth or 2.0)
    set_vec4(v4, p.proc_accent, pr.accentRgba)
    set_vec4(v4, p.proc_secondary, pr.secondaryRgba)
    set_vec4(v4, p.pal_c0, pr.pal0)
    set_vec4(v4, p.pal_c1, pr.pal1)
    set_vec4(v4, p.pal_c2, pr.pal2)
    set_vec4(v4, p.pal_c3, pr.pal3)
    set_vec4(v4, p.pal_c4, pr.pal4)
    set_vec4(v4, p.pal_c5, pr.pal5)
    set_vec4(v4, p.pal_c6, pr.pal6)
    obs.gs_effect_set_float(p.pal_count, pr.palCount or 2.0)
    obs.gs_effect_set_float(p.proc_fill_mode, pr.fillModeCode or 0.0)
    obs.gs_effect_set_float(p.proc_fill_opacity, pr.fillOpacity or 35.0)
    obs.gs_effect_set_float(p.proc_color_mode, pr.colorModeCode or 0.0)
    obs.gs_effect_set_float(p.proc_color_anim, pr.colorAnimCode or 0.0)
    obs.gs_effect_set_float(p.proc_color_speed, pr.colorSpeed or 1.0)
    obs.gs_effect_set_float(p.proc_motion, pr.motionCode or 1.0)
    obs.gs_effect_set_float(p.proc_speed, pr.speed or 1.0)
    obs.gs_effect_set_float(p.proc_pan_osc, pr.panOsc or 0.0)
    obs.gs_effect_set_float(p.proc_pan_rad, (pr.panAngle or 45.0) * 3.14159265 / 180.0)
    obs.gs_effect_set_float(p.proc_inplace_mode, pr.inPlaceCode or 1.0)
    obs.gs_effect_set_float(p.proc_inplace_speed, pr.inPlaceSpeed or 1.0)
    obs.gs_effect_set_float(p.proc_spin_mode, pr.spinModeCode or 0.0)
    obs.gs_effect_set_float(p.proc_spin_speed, pr.spinSpeed or 1.0)
    obs.gs_effect_set_float(p.proc_density, pr.density or 1.0)
    obs.gs_effect_set_float(p.proc_spacing, pr.spacing or 100.0)
    obs.gs_effect_set_float(p.proc_size_var, pr.sizeVariance or 0.0)
    obs.gs_effect_set_float(p.proc_scatter, pr.scatter or 0.0)
    obs.gs_effect_set_float(p.proc_rot_var, pr.rotationVariance or 0.0)
    set_vec2(v2, p.stamp_grid, pr.stampCols or 0.0, pr.stampRows or 0.0)

    local fl = prof.filters or {}
    obs.gs_effect_set_float(p.flt_brightness, fl.brightness or 100.0)
    obs.gs_effect_set_float(p.flt_contrast, fl.contrast or 100.0)
    obs.gs_effect_set_float(p.flt_saturate, fl.saturate or 100.0)
    obs.gs_effect_set_float(p.flt_grayscale, fl.grayscale or 0.0)
    obs.gs_effect_set_float(p.flt_hue_rad, (fl.hueRotate or 0.0) * 3.14159265 / 180.0)
    obs.gs_effect_set_float(p.flt_blur, fl.blur or 0.0)
    obs.gs_effect_set_float(p.flt_duo_on, fl.duoOn or 0.0)
    set_vec4(v4, p.flt_duo_dark, fl.duoDarkRgba)
    set_vec4(v4, p.flt_duo_light, fl.duoLightRgba)
    obs.gs_effect_set_float(p.flt_tint_on, fl.tintOn or 0.0)
    set_vec4(v4, p.flt_tint_color, fl.tintColorRgba)
    obs.gs_effect_set_float(p.flt_tint_amt, fl.tintAmount or 25.0)
    obs.gs_effect_set_float(p.flt_grain_amt, fl.grainAmount or 0.0)
    obs.gs_effect_set_float(p.flt_grain_size, fl.grainSize or 150.0)
    obs.gs_effect_set_float(p.flt_grain_anim, fl.grainAnim or 1.0)

    local tl = prof.tiles or {}
    obs.gs_effect_set_float(p.tile_count, tl.tileCount or 1.0)
    obs.gs_effect_set_float(p.tile_dist, tl.tileDistCode or 0.0)
    obs.gs_effect_set_float(p.tile_layout, tl.layoutCode or 1.0)
    obs.gs_effect_set_float(p.tile_symmetry, tl.symmetryCode or 0.0)
    obs.gs_effect_set_float(p.tile_wedges, tl.wedges or 6.0)
    obs.gs_effect_set_float(p.tile_kaleido_morph, tl.kaleidoMorph or 1.0)
    obs.gs_effect_set_float(p.tile_kaleido_speed, tl.kaleidoSpeed or 8.0)
    obs.gs_effect_set_float(p.tile_kaleido_dir, tl.kaleidoDirCode or 0.0)
    obs.gs_effect_set_float(p.tile_kaleido_depth, tl.kaleidoDepth or 35.0)
    obs.gs_effect_set_float(p.tile_size, tl.tileSize or 96.0)
    obs.gs_effect_set_float(p.tile_gap, tl.gap or 18.0)
    obs.gs_effect_set_float(p.tile_offset_x, tl.offsetX or 50.0)
    obs.gs_effect_set_float(p.tile_offset_y, tl.offsetY or 50.0)
    obs.gs_effect_set_float(p.tile_grid_rad, (tl.gridAngle or 0.0) * 3.14159265 / 180.0)
    obs.gs_effect_set_float(p.tile_angle_rad, (tl.tileAngle or 0.0) * 3.14159265 / 180.0)
    obs.gs_effect_set_float(p.tile_alt_flip, tl.altFlipCode or 0.0)
    obs.gs_effect_set_float(p.tile_opacity, tl.tileOpacity or 1.0)
    obs.gs_effect_set_float(p.tile_alt_opacity, tl.altOpacity or 0.65)
    obs.gs_effect_set_float(p.tile_alt_scale, tl.altScale or 1.0)
    obs.gs_effect_set_float(p.tile_motion, tl.motionCode or 1.0)
    obs.gs_effect_set_float(p.tile_track_mode, tl.trackModeCode or 0.0)
    obs.gs_effect_set_float(p.tile_spin_dir, tl.spinDirCode or 0.0)
    obs.gs_effect_set_float(p.tile_scroll_rad, (tl.scrollAngle or 35.0) * 3.14159265 / 180.0)
    obs.gs_effect_set_float(p.tile_speed, tl.speed or 16.0)
    obs.gs_effect_set_float(p.tile_spin_rad, (tl.spinSpeed or 8.0) * 3.14159265 / 180.0)
    obs.gs_effect_set_float(p.tile_wave_amt, tl.waveAmount or 25.0)
    obs.gs_effect_set_float(p.tile_hue_mode, tl.hueModeCode or 0.0)
    obs.gs_effect_set_float(p.tile_hue_speed, tl.hueSpeed or 14.0)
    obs.gs_effect_set_float(p.tile_hue_jitter, tl.hueJitter or 0.0)
    obs.gs_effect_set_float(p.tile_sat_jitter, tl.saturationJitter or 0.0)
    obs.gs_effect_set_float(p.tile_bright_jitter, tl.brightnessJitter or 0.0)
    obs.gs_effect_set_float(p.tile_scale_jitter, tl.scaleJitter or 0.0)
    obs.gs_effect_set_float(p.tile_rot_jitter, tl.rotationJitter or 0.0)
    obs.gs_effect_set_float(p.tile_pos_jitter, tl.positionJitter or 0.0)
    obs.gs_effect_set_float(p.tile_twinkle, tl.twinkle or 0.0)
    obs.gs_effect_set_float(p.tile_twinkle_speed, tl.twinkleSpeed or 4.0)
    set_vec4(v4, p.tile_tint, tl.tintColorRgba)

    local has_tex = 0.0
    local draw_tex = data.dummy_tex
    local active_stamp_tex = data.stamp_tex or (data.stamp_img_ex ~= nil and data.stamp_img_ex.texture) or (data.stamp_img ~= nil and data.stamp_img.texture) or nil
    if active_stamp_tex ~= nil and p.stamp_tex ~= nil then
        obs.gs_effect_set_texture(p.stamp_tex, active_stamp_tex)
        draw_tex = active_stamp_tex
        has_tex = 1.0
    elseif data.dummy_tex ~= nil and p.stamp_tex ~= nil then
        obs.gs_effect_set_texture(p.stamp_tex, data.dummy_tex)
    end
    obs.gs_effect_set_float(p.has_stamp, has_tex)
    return draw_tex
end

source_def.get_width = function(data)
    return data.width or 1920
end

source_def.get_height = function(data)
    return data.height or 1080
end

source_def.video_tick = function(data, seconds)
    data.anim_time = (data.anim_time or 0) + (seconds or 0.016)
    local prof = resolve_active_profile(data)
    data.active_prof = prof
    if prof ~= nil then
        local stamp = (prof.modeCode > 0.5) and (prof.tiles.stampFile or "") or (prof.procedural.bakedStampFile or "")
        local stamp_key = (stamp ~= "") and (stamp .. ":" .. tostring(manifest_revision)) or ""
        if stamp_key ~= (data.loaded_stamp_key or "") then
            ensure_stamp_texture(data, stamp, stamp_key)
        end
    end

    if data.use_rt_fallback and data.effect ~= nil and prof ~= nil then
        local w = data.width or 1920
        local h = data.height or 1080
        obs.obs_enter_graphics()
        if data.rt == nil then
            data.rt = obs.gs_texrender_create(obs.GS_RGBA, obs.GS_ZS_NONE)
        end
        if data.rt ~= nil then
            obs.gs_texrender_reset(data.rt)
            if obs.gs_texrender_begin(data.rt, w, h) then
                obs.gs_viewport_push()
                obs.gs_projection_push()
                obs.gs_matrix_push()
                obs.gs_matrix_identity()
                obs.gs_ortho(0.0, w, 0.0, h, -100.0, 100.0)
                obs.gs_set_viewport(0, 0, w, h)
                obs.gs_clear(obs.GS_CLEAR_COLOR, data._zero_v4, 0.0, 0)
                obs.gs_blend_state_push()
                obs.gs_blend_function(obs.GS_BLEND_ONE, obs.GS_BLEND_ZERO)
                local draw_tex = upload_effect_uniforms(data, prof)
                while obs.gs_effect_loop(data.effect, "Draw") do
                    obs.gs_draw_sprite(draw_tex, 0, w, h)
                end
                obs.gs_blend_state_pop()
                obs.gs_matrix_pop()
                obs.gs_projection_pop()
                obs.gs_viewport_pop()
                obs.gs_texrender_end(data.rt)
            end
        end
        obs.obs_leave_graphics()
    end
end

source_def.video_render = function(data, effect)
    if data.effect == nil or data.active_prof == nil then return end
    local prof = data.active_prof
    local w = data.width or 1920
    local h = data.height or 1080

    local active_eff = effect or obs.gs_get_effect()
    if active_eff ~= nil then
        data.use_rt_fallback = true
        if data.rt ~= nil then
            local rt_tex = obs.gs_texrender_get_texture(data.rt)
            if rt_tex ~= nil then
                local img_param = obs.gs_effect_get_param_by_name(active_eff, "image")
                if img_param ~= nil then
                    obs.gs_effect_set_texture(img_param, rt_tex)
                end
                obs.gs_blend_state_push()
                obs.gs_blend_function(obs.GS_BLEND_ONE, obs.GS_BLEND_INVSRCALPHA)
                obs.gs_draw_sprite(rt_tex, 0, w, h)
                obs.gs_blend_state_pop()
            end
        end
        return
    end

    local draw_tex = upload_effect_uniforms(data, prof)
    obs.gs_blend_state_push()
    obs.gs_blend_function(obs.GS_BLEND_ONE, obs.GS_BLEND_INVSRCALPHA)
    while obs.gs_effect_loop(data.effect, "Draw") do
        obs.gs_draw_sprite(draw_tex, 0, w, h)
    end
    obs.gs_blend_state_pop()
end

function script_description()
    return "StreamPulse Pattern Background Source (Beta / Advanced)\\n\\n"
        .. "Registers a GPU-rendered OBS Video Source for Pattern Tiles and Procedural Backgrounds."
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
    manifest_path = (path_setting and path_setting ~= "") and path_setting or DEFAULT_MANIFEST_PATH
    reload_manifest(true)
end

local function on_poll_tick()
    reload_manifest(false)
    refresh_active_scene_name()
end

function script_load(settings)
    reload_manifest(true)
    refresh_active_scene_name()
    obs.obs_register_source(source_def)
    obs.timer_add(on_poll_tick, 1000)
end

function script_unload()
    obs.timer_remove(on_poll_tick)
end
`;
}

function createObsPatternsService({
    dataDir,
    safeWriteFileSync,
    getVariablesValues = () => ({}),
    isVariableSettingsEnabled = () => true,
    broadcastToOverlays = () => {},
    renderPatternStamps = null
} = {}) {
    const stateFile = path.join(dataDir, 'obs-patterns.json');
    const exportDir = path.join(dataDir, 'obs-patterns');
    const stampsDir = path.join(exportDir, 'stamps');
    const manifestPath = path.join(exportDir, 'manifest.json');
    const luaScriptPath = path.join(exportDir, 'streampulse-patterns.lua');

    let lastManifestFingerprint = '';
    let lastManifestObj = null;
    const liveBakes = new Map();
    let bakeTimer = null;
    let bakeRunning = false;
    let bakeAbort = null;
    let bakeError = '';
    let stopped = false;
    let state = {
        revision: 1,
        activeProfileId: 'cyber-hex-grid',
        profiles: buildDefaultProfiles(),
        customPalettes: [],
        knownScenes: [],
        knownPatternSources: [],
        sourceSceneMap: {},
        assignments: {}
    };

    function writeTextAtomic(targetPath, content) {
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (typeof safeWriteFileSync === 'function') safeWriteFileSync(targetPath, content);
        else fs.writeFileSync(targetPath, content, 'utf8');
    }

    function normalizeAssignments(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') return out;
        for (const [src, val] of Object.entries(raw)) {
            const cleanSrc = String(src || '').trim();
            if (!cleanSrc || !val || typeof val !== 'object') continue;
            const defaultProfileId = String(val.defaultProfileId || 'auto').trim() || 'auto';
            const sceneOverrides = {};
            if (val.sceneOverrides && typeof val.sceneOverrides === 'object') {
                for (const [sc, pid] of Object.entries(val.sceneOverrides)) {
                    const cleanSc = String(sc || '').trim();
                    const cleanPid = String(pid || '').trim();
                    if (!cleanSc || !cleanPid || cleanPid === 'inherit') continue;
                    sceneOverrides[cleanSc] = cleanPid;
                }
            }
            if (defaultProfileId === 'auto' && Object.keys(sceneOverrides).length === 0) continue;
            out[cleanSrc] = { defaultProfileId, sceneOverrides };
        }
        return out;
    }

    function normalizeCustomPaletteEntry(raw = {}, idx = 0) {
        const name = String(raw.name || `Custom Palette ${idx + 1}`).trim().slice(0, 60) || `Custom Palette ${idx + 1}`;
        const id = slugifyId(raw.id || name, `custom-pal-${idx + 1}`);
        const rawColors = Array.isArray(raw.colors) && raw.colors.length >= 2
            ? raw.colors.slice(0, 7)
            : ['#EF4444FF', '#22C55EFF', '#FACC15FF', '#3B82F6FF'];
        return {
            id,
            name,
            colors: rawColors.map((c, ci) => normalizeColor(c, ci === 0 ? '#EF4444FF' : '#3B82F6FF'))
        };
    }

    function normalizeCustomPaletteList(rawList) {
        if (!Array.isArray(rawList)) return [];
        const seen = new Set();
        const out = [];
        for (let i = 0; i < rawList.length && out.length < 40; i++) {
            const norm = normalizeCustomPaletteEntry(rawList[i], i);
            if (!seen.has(norm.id)) {
                seen.add(norm.id);
                out.push(norm);
            }
        }
        return out;
    }

    function resolvePaletteStops(paletteName, accentRgba, secondaryRgba, customColors = [], varValues = {}, allowVars = true) {
        let list = null;
        if (paletteName === 'custom' && Array.isArray(customColors) && customColors.length >= 2) {
            list = customColors.slice(0, 7).map((c, ci) => resolveColorToken(c, ci === 0 ? '#EF4444FF' : '#3B82F6FF', varValues, allowVars));
        } else if (paletteName && paletteName !== 'dual' && Array.isArray(PALETTES[paletteName])) {
            list = PALETTES[paletteName];
        }
        if (!list || list.length < 2) {
            return {
                palCount: 2,
                pal0: accentRgba,
                pal1: secondaryRgba,
                pal2: accentRgba,
                pal3: secondaryRgba,
                pal4: accentRgba,
                pal5: secondaryRgba,
                pal6: accentRgba
            };
        }
        const stops = list.slice(0, 7).map(c => hexToRgbaArray(c, accentRgba));
        return {
            palCount: stops.length,
            pal0: stops[0],
            pal1: stops[1] || stops[0],
            pal2: stops[2] || stops[0],
            pal3: stops[3] || stops[1] || stops[0],
            pal4: stops[4] || stops[0],
            pal5: stops[5] || stops[1] || stops[0],
            pal6: stops[6] || stops[2] || stops[0]
        };
    }

    function resolveProfileForManifest(profile, varValues) {
        const allowVars = isVariableSettingsEnabled();
        const p = normalizeProfile(profile);
        const pr = p.procedural;
        const tl = p.tiles;
        const accentHex = resolveColorToken(pr.accent, '#58A6FFFF', varValues, allowVars);
        const secondaryHex = resolveColorToken(pr.secondary, '#A855F7FF', varValues, allowVars);
        const accentRgba = hexToRgbaArray(accentHex, [0.35, 0.65, 1, 1]);
        const secondaryRgba = hexToRgbaArray(secondaryHex, [0.66, 0.33, 0.97, 1]);
        const customColorsResolved = Array.isArray(pr.customColors)
            ? pr.customColors.slice(0, 7).map((c, ci) => resolveColorToken(c, ci === 0 ? '#EF4444FF' : '#3B82F6FF', varValues, allowVars))
            : [];
        const palStops = resolvePaletteStops(pr.palette, accentRgba, secondaryRgba, customColorsResolved, varValues, allowVars);
        const bgHex = resolveColorToken(p.bgColor, '#0B101BFF', varValues, allowVars);
        const bgHex2 = resolveColorToken(p.bgColor2, '#1E1B4BFF', varValues, allowVars);
        const bgHex3 = resolveColorToken(p.bgColor3, '#0F766EFF', varValues, allowVars);
        const vigHex = resolveColorToken(p.vignetteColor, '#000000FF', varValues, allowVars);
        const tintHex = resolveColorToken(tl.tintColor, '#FFFFFFFF', varValues, allowVars);
        const spinModeCode = pr.spin === 'cw' ? 1 : (pr.spin === 'ccw' ? 2 : (pr.spin === 'sway' ? 3 : 0));
        const fl = p.filters || {};
        const flDuo = fl.duotone || {};
        const flTint = fl.tint || {};
        const flGrain = fl.grain || {};
        const duoDarkHex = resolveColorToken(flDuo.dark, '#1E1B4BFF', varValues, allowVars);
        const duoLightHex = resolveColorToken(flDuo.light, '#22D3EEFF', varValues, allowVars);
        const flTintHex = resolveColorToken(flTint.color, '#58A6FFFF', varValues, allowVars);

        return {
            id: p.id,
            name: p.name,
            mode: p.mode,
            modeCode: p.mode === 'tiles' ? 1 : 0,
            width: p.width,
            height: p.height,
            opacity: resolveNumToken(p.opacity, 100, 0, 100, varValues, allowVars),
            bgType: p.bgType,
            bgTypeCode: BG_TYPE_CODE_MAP[p.bgType] ?? 1,
            bgColor: bgHex,
            bgColorRgba: hexToRgbaArray(bgHex, [0.043, 0.063, 0.106, 1]),
            bgColor2: bgHex2,
            bgColor2Rgba: hexToRgbaArray(bgHex2, [0.118, 0.106, 0.294, 1]),
            bgColor3: bgHex3,
            bgColor3Rgba: hexToRgbaArray(bgHex3, [0.059, 0.463, 0.431, 1]),
            bgUseMid: Boolean(p.bgUseMid),
            bgAngle: resolveNumToken(p.bgAngle, 135, -360, 360, varValues, allowVars),
            bgCenterX: resolveNumToken(p.bgCenterX, 50, 0, 100, varValues, allowVars),
            bgCenterY: resolveNumToken(p.bgCenterY, 50, 0, 100, varValues, allowVars),
            bgRadius: resolveNumToken(p.bgRadius, 75, 10, 200, varValues, allowVars),
            bgMotion: p.bgMotion,
            bgMotionCode: BG_MOTION_CODE_MAP[p.bgMotion] ?? 0,
            bgMotionSpeed: resolveNumToken(p.bgMotionSpeed, 1, 0.1, 5, varValues, allowVars),
            vignette: resolveNumToken(p.vignette, 25, 0, 100, varValues, allowVars),
            vignetteColor: vigHex,
            vignetteColorRgba: hexToRgbaArray(vigHex, [0, 0, 0, 1]),
            procedural: {
                preset: pr.preset,
                presetCode: PATTERN_CODE_MAP[pr.preset] ?? 3,
                isAnalyticGpu: ANALYTIC_GPU_SET.has(pr.preset),
                scale: resolveNumToken(pr.scale, 100, 15, 400, varValues, allowVars),
                lineWidth: resolveNumToken(pr.lineWidth, 2, 0.5, 24, varValues, allowVars),
                accent: accentHex,
                accentRgba,
                secondary: secondaryHex,
                secondaryRgba,
                palette: pr.palette,
                customColors: customColorsResolved,
                ...palStops,
                fillMode: pr.fillMode,
                fillModeCode: PROCEDURAL_FILL_MODE_CODE_MAP[pr.fillMode] ?? 0,
                fillOpacity: resolveNumToken(pr.fillOpacity, 35, 0, 100, varValues, allowVars),
                colorMode: pr.colorMode,
                colorModeCode: PROCEDURAL_COLOR_MODE_CODE_MAP[pr.colorMode] ?? 0,
                colorAnim: pr.colorAnim,
                colorAnimCode: PROCEDURAL_COLOR_ANIM_CODE_MAP[pr.colorAnim] ?? 0,
                colorSpeed: resolveNumToken(pr.colorSpeed, 1, 0.2, 3, varValues, allowVars),
                motion: pr.motion,
                motionCode: PROCEDURAL_MOTION_CODE_MAP[pr.motion] ?? 1,
                speed: resolveNumToken(pr.speed, 1, 0, 10, varValues, allowVars),
                panDirection: pr.panDirection,
                panOsc: pr.panDirection === 'oscillate' ? 1 : 0,
                panAngle: resolveNumToken(pr.panAngle, 45, -360, 360, varValues, allowVars),
                inPlace: pr.inPlace,
                inPlaceCode: PROCEDURAL_IN_PLACE_CODE_MAP[pr.inPlace] ?? 1,
                inPlaceSpeed: resolveNumToken(pr.inPlaceSpeed, 1, 0.2, 5, varValues, allowVars),
                spin: pr.spin,
                spinModeCode,
                spinSpeed: resolveNumToken(pr.spinSpeed, 1, 0.1, 5, varValues, allowVars),
                density: resolveNumToken(pr.density, 1, 0.25, 4, varValues, allowVars),
                spacing: resolveNumToken(pr.spacing, 100, 50, 300, varValues, allowVars),
                sizeVariance: resolveNumToken(pr.sizeVariance, 0, 0, 100, varValues, allowVars),
                scatter: resolveNumToken(pr.scatter, 0, 0, 100, varValues, allowVars),
                rotationVariance: resolveNumToken(pr.rotationVariance, 0, 0, 100, varValues, allowVars),
                snowflakeStyle: pr.snowflakeStyle,
                bakedStampFile: ANALYTIC_GPU_SET.has(pr.preset) ? '' : (pr.bakedStampFile || ''),
                stampCols: ANALYTIC_GPU_SET.has(pr.preset) ? 0 : (Number(pr.stampCols) || 0),
                stampRows: ANALYTIC_GPU_SET.has(pr.preset) ? 0 : (Number(pr.stampRows) || 0)
            },
            filters: {
                brightness: resolveNumToken(fl.brightness, 100, 0, 200, varValues, allowVars),
                contrast: resolveNumToken(fl.contrast, 100, 0, 200, varValues, allowVars),
                saturate: resolveNumToken(fl.saturate, 100, 0, 300, varValues, allowVars),
                grayscale: resolveNumToken(fl.grayscale, 0, 0, 100, varValues, allowVars),
                hueRotate: resolveNumToken(fl.hueRotate, 0, -180, 180, varValues, allowVars),
                blur: resolveNumToken(fl.blur, 0, 0, 60, varValues, allowVars),
                duoEnabled: Boolean(flDuo.enabled),
                duoDarkRgba: hexToRgbaArray(duoDarkHex, [0.118, 0.106, 0.294, 1]),
                duoLightRgba: hexToRgbaArray(duoLightHex, [0.133, 0.827, 0.933, 1]),
                tintEnabled: Boolean(flTint.enabled),
                tintColorRgba: hexToRgbaArray(flTintHex, [0.345, 0.651, 1, 1]),
                tintOpacity: resolveNumToken(flTint.opacity, 25, 0, 100, varValues, allowVars),
                grainAmount: flGrain.enabled ? resolveNumToken(flGrain.amount, 18, 0, 100, varValues, allowVars) : 0,
                grainSize: resolveNumToken(flGrain.size, 150, 50, 400, varValues, allowVars),
                grainAnimate: flGrain.animate !== false
            },
            tiles: {
                slots: tl.slots,
                tileCount: tl.slots.length,
                tileDistribution: tl.tileDistribution,
                tileDistCode: TILE_DIST_CODE_MAP[tl.tileDistribution] ?? 0,
                layout: tl.layout,
                layoutCode: TILE_LAYOUT_CODE_MAP[tl.layout] ?? 1,
                symmetry: tl.symmetry,
                symmetryCode: TILE_SYMMETRY_CODE_MAP[tl.symmetry] ?? 0,
                wedges: tl.wedges,
                kaleidoMorph: tl.kaleidoMorph,
                kaleidoSpeed: tl.kaleidoSpeed,
                kaleidoDirection: tl.kaleidoDirection,
                kaleidoDirCode: tl.kaleidoDirection === 'ccw' ? 1 : 0,
                kaleidoDepth: tl.kaleidoDepth,
                tileSize: resolveNumToken(tl.tileSize, 96, 16, 512, varValues, allowVars),
                gap: resolveNumToken(tl.gap, 18, 0, 256, varValues, allowVars),
                offsetX: resolveNumToken(tl.offsetX, 50, 0, 100, varValues, allowVars),
                offsetY: resolveNumToken(tl.offsetY, 50, 0, 100, varValues, allowVars),
                gridAngle: resolveNumToken(tl.gridAngle, 0, -180, 180, varValues, allowVars),
                tileAngle: resolveNumToken(tl.tileAngle, 0, -180, 180, varValues, allowVars),
                alternateFlip: tl.alternateFlip,
                altFlipCode: TILE_ALT_FLIP_CODE_MAP[tl.alternateFlip] ?? 0,
                tileOpacity: resolveNumToken(tl.tileOpacity, 1, 0.05, 1, varValues, allowVars),
                altOpacity: resolveNumToken(tl.altOpacity, 0.65, 0, 1, varValues, allowVars),
                altScale: resolveNumToken(tl.altScale, 1, 0.25, 2.5, varValues, allowVars),
                motion: tl.motion,
                motionCode: TILE_MOTION_CODE_MAP[tl.motion] ?? 1,
                trackMode: tl.trackMode,
                trackModeCode: TILE_TRACK_CODE_MAP[tl.trackMode] ?? 0,
                spinDirection: tl.spinDirection,
                spinDirCode: TILE_SPIN_DIR_CODE_MAP[tl.spinDirection] ?? 0,
                scrollAngle: resolveNumToken(tl.scrollAngle, 35, -360, 360, varValues, allowVars),
                speed: resolveNumToken(tl.speed, 16, 0.5, 200, varValues, allowVars),
                spinSpeed: resolveNumToken(tl.spinSpeed, 8, 0.5, 120, varValues, allowVars),
                waveAmount: resolveNumToken(tl.waveAmount, 25, 5, 100, varValues, allowVars),
                hueShift: tl.hueShift,
                hueModeCode: TILE_HUE_CODE_MAP[tl.hueShift] ?? 0,
                hueSpeed: resolveNumToken(tl.hueSpeed, 14, 0.5, 120, varValues, allowVars),
                hueJitter: resolveNumToken(tl.hueJitter, 0, 0, 180, varValues, allowVars),
                saturationJitter: resolveNumToken(tl.saturationJitter, 0, 0, 50, varValues, allowVars),
                brightnessJitter: resolveNumToken(tl.brightnessJitter, 0, 0, 50, varValues, allowVars),
                scaleJitter: resolveNumToken(tl.scaleJitter, 0, 0, 50, varValues, allowVars),
                rotationJitter: resolveNumToken(tl.rotationJitter, 0, 0, 180, varValues, allowVars),
                positionJitter: resolveNumToken(tl.positionJitter, 0, 0, 50, varValues, allowVars),
                twinkle: resolveNumToken(tl.twinkle, 0, 0, 100, varValues, allowVars),
                twinkleSpeed: resolveNumToken(tl.twinkleSpeed, 4, 0.5, 30, varValues, allowVars),
                tintColor: tintHex,
                tintColorRgba: hexToRgbaArray(tintHex, [1, 1, 1, 1]),
                stampFile: tl.stampFile || ''
            }
        };
    }

    function buildAssignmentRulesMap() {
        const rules = {};
        for (const [src, cfg] of Object.entries(state.assignments || {})) {
            if (cfg.defaultProfileId && cfg.defaultProfileId !== 'auto') rules[src] = cfg.defaultProfileId;
            for (const [sc, pid] of Object.entries(cfg.sceneOverrides || {})) {
                if (sc && pid && pid !== 'inherit') rules[`${sc}::${src}`] = pid;
            }
        }
        return rules;
    }

    function liveBakeInput(profile, resolved) {
        if (profile.mode !== 'procedural' || resolved.procedural.isAnalyticGpu) return null;
        const pr = profile.procedural;
        const fields = ['accent', 'secondary', 'lineWidth', 'fillOpacity', 'density', 'spacing', 'scatter', 'sizeVariance', 'rotationVariance'];
        if (![...fields.map(key => pr[key]), ...(pr.customColors || [])].some(value => typeof value === 'string' && VAR_TOKEN_RE.test(value.trim()))) return null;
        const r = resolved.procedural;
        const keys = ['preset', 'palette', 'customColors', 'accent', 'secondary', 'fillMode', 'fillOpacity', 'colorMode', 'lineWidth', 'density', 'spacing', 'scatter', 'sizeVariance', 'rotationVariance', 'snowflakeStyle'];
        return Object.fromEntries(keys.map(key => [key, r[key]]));
    }

    function queueLiveBakes(resolvedProfiles) {
        if (!renderPatternStamps || stopped) return;
        const present = new Set();
        state.profiles.forEach((profile, index) => {
            const input = liveBakeInput(profile, resolvedProfiles[index]);
            if (!input) return;
            present.add(profile.id);
            const signature = JSON.stringify(input);
            const current = liveBakes.get(profile.id);
            if (!current || current.desired !== signature) {
                liveBakes.set(profile.id, { ...current, desired: signature, input, failed: false });
            }
        });
        for (const id of liveBakes.keys()) if (!present.has(id)) liveBakes.delete(id);
        if (!bakeRunning && !bakeTimer && [...liveBakes.values()].some(entry => entry.done !== entry.desired && !entry.failed)) {
            bakeTimer = setTimeout(runLiveBakes, 200);
            bakeTimer.unref?.();
        }
    }

    async function runLiveBakes() {
        bakeTimer = null;
        if (stopped || bakeRunning) return;
        const pending = [...liveBakes.entries()].filter(([, entry]) => entry.done !== entry.desired && !entry.failed)
            .map(([id, entry]) => ({ id, signature: entry.desired, input: entry.input }));
        if (!pending.length) return;
        bakeRunning = true;
        bakeAbort = new AbortController();
        try {
            const results = await renderPatternStamps(pending.map(item => item.input), { signal: bakeAbort.signal });
            if (!Array.isArray(results) || results.length !== pending.length) throw new Error('Pattern renderer returned an incomplete batch');
            for (let i = 0; i < pending.length; i++) {
                const item = pending[i];
                const current = liveBakes.get(item.id);
                if (stopped || !current || current.desired !== item.signature) continue;
                const result = results[i];
                const match = String(result?.dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
                if (!match) throw new Error('Pattern renderer returned an invalid PNG');
                const bytes = Buffer.from(match[1], 'base64');
                if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw new Error('Rendered pattern PNG exceeds the size limit');
                fs.mkdirSync(stampsDir, { recursive: true });
                const stampFile = `live-${createHash('sha256').update(item.id).digest('hex').slice(0, 24)}.png`;
                const target = path.join(stampsDir, stampFile);
                const temp = `${target}.${process.pid}.tmp`;
                try {
                    fs.writeFileSync(temp, bytes);
                    fs.renameSync(temp, target);
                } finally {
                    if (fs.existsSync(temp)) fs.unlinkSync(temp);
                }
                Object.assign(current, { done: item.signature, preset: item.input.preset, stampFile, cols: Number(result.cols) || 0, rows: Number(result.rows) || 0 });
            }
            bakeError = '';
            syncResolvedManifest({ force: true });
            broadcastToOverlays('obs-patterns-update', getPublicState());
        } catch (err) {
            if (stopped) return;
            bakeError = err.message;
            for (const item of pending) {
                const entry = liveBakes.get(item.id);
                if (entry?.desired === item.signature) entry.failed = true;
            }
            console.error('[ObsPatterns] Live pattern bake failed:', err.message);
            broadcastToOverlays('obs-patterns-update', getPublicState());
        } finally {
            bakeRunning = false;
            bakeAbort = null;
            if (!stopped) queueLiveBakes(state.profiles.map(p => resolveProfileForManifest(p, isVariableSettingsEnabled() ? (getVariablesValues() || {}) : {})));
        }
    }

    function syncResolvedManifest({ force = false } = {}) {
        try {
            const varValues = isVariableSettingsEnabled() ? (getVariablesValues() || {}) : {};
            const resolvedProfiles = state.profiles.map(p => resolveProfileForManifest(p, varValues));
            queueLiveBakes(resolvedProfiles);
            for (const profile of resolvedProfiles) {
                const bake = liveBakes.get(profile.id);
                if (bake?.stampFile && bake.preset === profile.procedural.preset) {
                    profile.procedural.bakedStampFile = bake.stampFile;
                    profile.procedural.stampCols = bake.cols;
                    profile.procedural.stampRows = bake.rows;
                }
            }
            const body = {
                activeProfileId: state.activeProfileId,
                assignmentRules: buildAssignmentRulesMap(),
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
            const manifest = { revision: Math.max(Date.now(), previousRevision + 1), updatedAt: new Date().toISOString(), ...body };
            writeTextAtomic(manifestPath, JSON.stringify(manifest, null, 2));
            lastManifestFingerprint = fingerprint;
            lastManifestObj = manifest;
            return manifest;
        } catch (err) {
            console.error('[ObsPatterns] Failed to sync manifest:', err.message);
            return null;
        }
    }

    function ensureLuaScriptUpToDate() {
        try {
            if (!fs.existsSync(stampsDir)) fs.mkdirSync(stampsDir, { recursive: true });
            const expected = buildObsLuaScript({ manifestPath, stampsDir });
            const existing = fs.existsSync(luaScriptPath) ? fs.readFileSync(luaScriptPath, 'utf8') : '';
            if (existing !== expected) writeTextAtomic(luaScriptPath, expected);
            return expected;
        } catch (err) {
            console.error('[ObsPatterns] Failed to sync Lua script:', err.message);
            return '';
        }
    }

    function saveState() {
        state.revision = (Number(state.revision) || 0) + 1;
        writeTextAtomic(stateFile, JSON.stringify(state, null, 2));
        syncResolvedManifest();
        broadcastToOverlays('obs-patterns-update', getPublicState());
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
                        customPalettes: normalizeCustomPaletteList(raw.customPalettes),
                        knownScenes: Array.isArray(raw.knownScenes) ? raw.knownScenes.slice(0, 400) : [],
                        knownPatternSources: Array.isArray(raw.knownPatternSources) ? raw.knownPatternSources.slice(0, 400) : [],
                        sourceSceneMap: raw.sourceSceneMap && typeof raw.sourceSceneMap === 'object' ? raw.sourceSceneMap : {},
                        assignments: normalizeAssignments(raw.assignments)
                    };
                }
            }
        } catch (err) {
            console.error('[ObsPatterns] Failed to load state:', err.message);
        }
        syncResolvedManifest();
        ensureLuaScriptUpToDate();
    }

    function getPublicState() {
        const varValues = isVariableSettingsEnabled() ? (getVariablesValues() || {}) : {};
        return {
            revision: state.revision,
            activeProfileId: state.activeProfileId,
            profiles: state.profiles,
            customPalettes: Array.isArray(state.customPalettes) ? state.customPalettes : [],
            resolvedProfiles: state.profiles.map(p => resolveProfileForManifest(p, varValues)),
            assignments: state.assignments,
            assignmentRules: buildAssignmentRulesMap(),
            knownScenes: state.knownScenes,
            knownPatternSources: state.knownPatternSources,
            sourceSceneMap: state.sourceSceneMap,
            manifestPath,
            stampsDir,
            luaScriptPath,
            variableSettingsEnabled: Boolean(isVariableSettingsEnabled()),
            bakeError
        };
    }

    function upsertProfile(rawProfile, { setActive = false } = {}) {
        const norm = normalizeProfile(rawProfile, state.profiles.length);
        const idx = state.profiles.findIndex(p => p.id === norm.id);
        if (idx >= 0) state.profiles[idx] = norm;
        else state.profiles.push(norm);
        if (setActive || !state.profiles.some(p => p.id === state.activeProfileId)) {
            state.activeProfileId = norm.id;
        }
        saveState();
        return norm;
    }

    function duplicateProfile(profileId) {
        const src = state.profiles.find(p => p.id === profileId);
        if (!src) throw new Error('Pattern profile not found');
        let suffix = '-copy';
        let cand = `${src.id.slice(0, 64 - suffix.length)}${suffix}`;
        let n = 2;
        while (state.profiles.some(p => p.id === cand)) {
            suffix = `-copy-${n++}`;
            cand = `${src.id.slice(0, 64 - suffix.length)}${suffix}`;
        }
        return upsertProfile({ ...JSON.parse(JSON.stringify(src)), id: cand, name: `${src.name} Copy` });
    }

    function deleteProfile(profileId) {
        if (state.profiles.length <= 1) throw new Error('At least one pattern profile must remain');
        const idx = state.profiles.findIndex(p => p.id === profileId);
        if (idx < 0) throw new Error('Pattern profile not found');
        state.profiles.splice(idx, 1);
        if (state.activeProfileId === profileId) state.activeProfileId = state.profiles[0].id;
        for (const [src, cfg] of Object.entries(state.assignments)) {
            if (cfg.defaultProfileId === profileId) cfg.defaultProfileId = 'auto';
            for (const [sc, pid] of Object.entries(cfg.sceneOverrides || {})) {
                if (pid === profileId) delete cfg.sceneOverrides[sc];
            }
        }
        state.assignments = normalizeAssignments(state.assignments);
        saveState();
        return getPublicState();
    }

    function setActiveProfile(profileId) {
        const found = state.profiles.find(p => p.id === profileId);
        if (!found) throw new Error(`Pattern profile "${profileId}" not found`);
        state.activeProfileId = found.id;
        saveState();
        return found;
    }

    function setSourceAssignment({ sourceName, sceneName = '', profileId = 'auto' } = {}) {
        const cleanSrc = String(sourceName || '').trim();
        if (!cleanSrc) throw new Error('sourceName is required');
        const cleanScene = String(sceneName || '').trim();
        const cleanPid = String(profileId || 'auto').trim();
        const cur = state.assignments[cleanSrc] || { defaultProfileId: 'auto', sceneOverrides: {} };
        if (cleanScene) {
            if (!cleanPid || cleanPid === 'inherit') delete cur.sceneOverrides[cleanScene];
            else cur.sceneOverrides[cleanScene] = cleanPid;
        } else {
            cur.defaultProfileId = cleanPid || 'auto';
        }
        state.assignments[cleanSrc] = cur;
        state.assignments = normalizeAssignments(state.assignments);
        saveState();
        return getPublicState();
    }

    function saveStampPng({ id, dataUrl }) {
        const safeId = slugifyId(id || `stamp-${Date.now().toString(36)}`, 'stamp');
        const m = String(dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (!m) throw new Error('Valid PNG dataUrl is required');
        const buf = Buffer.from(m[1], 'base64');
        if (buf.length === 0 || buf.length > 6 * 1024 * 1024) {
            throw new Error('Stamp PNG must be between 1 byte and 6 MB');
        }
        if (!fs.existsSync(stampsDir)) fs.mkdirSync(stampsDir, { recursive: true });
        const fileName = `${safeId}.png`;
        const target = path.join(stampsDir, fileName);
        fs.writeFileSync(target, buf);
        return { stampFile: fileName, stampPath: target, url: `/api/obs-patterns/stamps/${encodeURIComponent(fileName)}` };
    }

    function resolveStampFilePath(fileName) {
        const clean = path.basename(String(fileName || ''));
        if (!clean || !/^[a-zA-Z0-9._-]+\.png$/.test(clean)) return null;
        const full = path.join(stampsDir, clean);
        return fs.existsSync(full) ? full : null;
    }

    function syncFromObsDiscovery({ scenes = [], byScene = {} } = {}) {
        const cleanScenes = [...new Set((scenes || []).map(s => String(s || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b))
            .slice(0, 400);
        const sceneSet = new Set(cleanScenes);
        const sourceMap = {};
        const patternSources = new Set();

        for (const [scName, items] of Object.entries(byScene || {})) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                const name = String(item?.sourceName || '').trim();
                const kind = String(item?.inputKind || '');
                if (!name) continue;
                if (kind === 'streampulse_pattern_source' || state.assignments[name]) {
                    patternSources.add(name);
                    if (!sourceMap[name]) sourceMap[name] = [];
                    if (!sourceMap[name].includes(scName)) sourceMap[name].push(scName);
                }
            }
        }

        const nextKnownSources = [...patternSources].sort((a, b) => a.localeCompare(b)).slice(0, 400);
        const nextAssignments = normalizeAssignments(state.assignments);
        if (cleanScenes.length > 0) {
            for (const [src, cfg] of Object.entries(nextAssignments)) {
                if (!patternSources.has(src)) {
                    delete nextAssignments[src];
                    continue;
                }
                const srcScenes = sourceMap[src] || [];
                for (const sc of Object.keys(cfg.sceneOverrides || {})) {
                    if (!sceneSet.has(sc) || !srcScenes.includes(sc)) delete cfg.sceneOverrides[sc];
                }
            }
        }

        const prevSnap = JSON.stringify({
            knownScenes: state.knownScenes,
            knownPatternSources: state.knownPatternSources,
            sourceSceneMap: state.sourceSceneMap,
            assignments: state.assignments
        });
        const nextSnap = JSON.stringify({
            knownScenes: cleanScenes,
            knownPatternSources: nextKnownSources,
            sourceSceneMap: sourceMap,
            assignments: nextAssignments
        });

        state.knownScenes = cleanScenes;
        state.knownPatternSources = nextKnownSources;
        state.sourceSceneMap = sourceMap;
        state.assignments = nextAssignments;
        if (prevSnap !== nextSnap) saveState();

        return {
            scenesCount: state.knownScenes.length,
            sourcesCount: state.knownPatternSources.length,
            scenes: state.knownScenes,
            sources: state.knownPatternSources,
            sourceSceneMap: state.sourceSceneMap
        };
    }

    function resetDefaults() {
        state.profiles = buildDefaultProfiles();
        state.activeProfileId = state.profiles[0].id;
        state.assignments = {};
        saveState();
        return getPublicState();
    }

    function regenerateLuaScript() {
        if (!fs.existsSync(stampsDir)) fs.mkdirSync(stampsDir, { recursive: true });
        const lua = buildObsLuaScript({ manifestPath, stampsDir });
        writeTextAtomic(luaScriptPath, lua);
        return lua;
    }

    function upsertCustomPalette(rawPalette) {
        const list = Array.isArray(state.customPalettes) ? [...state.customPalettes] : [];
        const entry = normalizeCustomPaletteEntry(rawPalette, list.length);
        const idx = list.findIndex(item => item.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.unshift(entry);
        state.customPalettes = normalizeCustomPaletteList(list);
        saveState();
        return { palette: entry, state: getPublicState() };
    }

    function deleteCustomPalette(paletteId) {
        const cleanId = String(paletteId || '').trim();
        state.customPalettes = (state.customPalettes || []).filter(item => item.id !== cleanId);
        saveState();
        return getPublicState();
    }

    loadState();

    return {
        getState: getPublicState,
        reload: loadState,
        stop: () => { stopped = true; clearTimeout(bakeTimer); bakeAbort?.abort(); },
        syncResolvedManifest,
        upsertProfile,
        duplicateProfile,
        deleteProfile,
        setActiveProfile,
        setSourceAssignment,
        upsertCustomPalette,
        deleteCustomPalette,
        saveStampPng,
        resolveStampFilePath,
        syncFromObsDiscovery,
        resetDefaults,
        regenerateLuaScript
    };
}

module.exports = {
    createObsPatternsService,
    buildObsLuaScript,
    PATTERNS,
    PALETTES
};
