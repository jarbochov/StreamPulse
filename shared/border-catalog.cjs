/**
 * Single Source of Truth for StreamPulse Border Styles, Border Animations,
 * Background Placeholder Modes, and Auto-Expansion Padding Calculation.
 *
 * Consumed by:
 *  - Custom Overlay Editor (via public/js/overlay/index.js -> overlay-shared.js)
 *  - Custom Overlay Styles Runtime (public/js/overlay/styles.js)
 *  - OBS Border Studio Backend & Lua Generator (server/services/obs-borders.js)
 *  - OBS Border Studio Frontend & WebGL Preview (public/js/obs-borders/obs-borders-studio.js)
 */

'use strict';

const BORDER_STYLE_GROUPS = [
    {
        label: 'Standard',
        options: [
            { id: 'solid', label: 'Solid', code: 0 },
            { id: 'dashed', label: 'Dashed', code: 1 },
            { id: 'dotted', label: 'Dotted', code: 2 },
            { id: 'double', label: 'Double', code: 3 }
        ]
    },
    {
        label: '3D Bevel',
        options: [
            { id: 'groove', label: '3D Groove', code: 4 },
            { id: 'ridge', label: '3D Ridge', code: 5 },
            { id: 'inset', label: '3D Inset', code: 6 },
            { id: 'outset', label: '3D Outset', code: 7 }
        ]
    },
    {
        label: 'Broadcast & Tech HUD',
        options: [
            { id: 'neon-tube', label: 'Neon tube (hot core)', code: 8 },
            { id: 'double-ring', label: 'Double ring track', code: 9 },
            { id: 'corner-brackets', label: 'Corner brackets (HUD)', code: 10 },
            { id: 'tech-hud', label: 'Mecha tech HUD', code: 11 },
            { id: 'chamfer', label: 'Chamfered octagon', code: 12 },
            { id: 'notched', label: 'Cyber notched HUD', code: 13 },
            { id: 'crosshair', label: 'Scope crosshair reticles', code: 14 },
            { id: 'viewfinder-ticks', label: 'Viewfinder telemetry ticks', code: 22 },
            { id: 'circuit-trace', label: 'PCB circuit trace', code: 23 },
            { id: 'segmented-bars', label: 'Segmented LED bars', code: 30 }
        ]
    },
    {
        label: 'Stylized & Decorative',
        options: [
            { id: 'hazard', label: 'Hazard stripes', code: 15 },
            { id: 'chevron-track', label: 'Speed chevron track', code: 16 },
            { id: 'scallop-stamp', label: 'Scallop ticket stamp', code: 17 },
            { id: 'ornate-filigree', label: 'Royal diamond filigree', code: 18 },
            { id: 'pixel-arcade', label: '8-bit pixel arcade', code: 19 },
            { id: 'film-sprocket', label: 'Cinema filmstrip', code: 20 },
            { id: 'marquee-bulbs', label: 'Theater marquee bulbs', code: 21 },
            { id: 'art-deco', label: 'Art Deco stepped frame', code: 24 },
            { id: 'rivet-plate', label: 'Riveted steel plate', code: 25 },
            { id: 'braid-weave', label: 'Braided rope weave', code: 26 },
            { id: 'zigzag', label: 'Serrated zigzag teeth', code: 27 },
            { id: 'sine-wave', label: 'Smooth wave scallop', code: 28 },
            { id: 'sketch-ink', label: 'Hand-drawn sketch ink', code: 29 }
        ]
    }
];

const BORDER_STYLES = BORDER_STYLE_GROUPS.flatMap(g => g.options.map(o => o.id));

const STYLE_CODE_MAP = {
    'gradient': 0,
    'conic-gradient': 0,
    'outset-bevel': 7,
    'inset-bevel': 6,
    'corners': 10
};
for (const group of BORDER_STYLE_GROUPS) {
    for (const opt of group.options) {
        STYLE_CODE_MAP[opt.id] = opt.code;
    }
}

const BORDER_ANIMATION_GROUPS = [
    {
        label: 'Beams & Energy',
        options: [
            { id: 'rotating', label: 'Rotating beam (spotlight)', code: 1 },
            { id: 'dual-beam', label: 'Twin chasing beams', code: 2 },
            { id: 'laser-scan', label: 'Laser scanner sweep', code: 3 },
            { id: 'plasma', label: 'Electric plasma arc', code: 4 }
        ]
    },
    {
        label: 'Glow & Pulse',
        options: [
            { id: 'radial', label: 'Radial rotating (sweeping glow)', code: 5 },
            { id: 'pulsing', label: 'Pulsing glow (breathing)', code: 6 },
            { id: 'strobe-flash', label: 'Energy surge (double flash)', code: 7 }
        ]
    },
    {
        label: 'Color & Perimeter',
        options: [
            { id: 'gradient', label: 'Gradient sweep (flowing)', code: 8 },
            { id: 'rainbow', label: 'Rainbow cycle (RGB chroma)', code: 9 },
            { id: 'marching', label: 'Marching ants (perimeter chase)', code: 10 }
        ]
    }
];

const BORDER_ANIM_TYPES = [
    'none',
    ...BORDER_ANIMATION_GROUPS.flatMap(g => g.options.map(o => o.id))
];

const ANIM_CODE_MAP = {
    'none': 0,
    'conic-spin': 1,
    'conic-gradient': 8,
    'marching-ants': 10,
    'radial-rotating': 5,
    'gradient-sweep': 8,
    'rainbow-cycle': 9
};
for (const group of BORDER_ANIMATION_GROUPS) {
    for (const opt of group.options) {
        ANIM_CODE_MAP[opt.id] = opt.code;
    }
}

const BACKGROUND_FILL_MODES = ['none', 'person', 'solid', 'gradient', 'tv-static'];
const BACKGROUND_MODE_MAP = {
    'none': 0,
    'person': 1,
    'solid': 2,
    'gradient': 3,
    'tv-static': 4
};

const SHADOW_MODES = [
    { id: 'soft', label: 'Soft Drop (Feathered)', code: 0 },
    { id: 'hard', label: 'Hard Offset (Solid Card)', code: 1 },
    { id: 'layered', label: 'Layered Elevation (Contact + Soft)', code: 2 },
    { id: 'inset', label: 'Inner Shadow (Inset over Source)', code: 3 }
];

const SHADOW_MODE_MAP = Object.fromEntries(SHADOW_MODES.map(m => [m.id, m.code]));

function clampFinite(val, fallback, min, max) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

/**
 * Computes exact outer canvas expansion padding (px) for a resolved profile.
 * In `inside` placement, returns 0.
 * In `outside` / `center` placements when `autoPad !== false`, calculates the
 * tight outer bleed needed to fit active rings, ornate diamond finials, and outer glow,
 * plus any user `extraPad` margin.
 */
function computeAutoBorderPad(profile = {}) {
    const p = String(profile.placement || 'outside').toLowerCase();
    const placement = (p === 'center' || p === 'middle') ? 'center' : ((p === 'inside' || p === 'inset') ? 'inside' : 'outside');
    if (placement === 'inside') return 0;

    const autoPad = profile.autoPad !== false;
    const manualPad = clampFinite(profile.pad, 48, 0, 400);
    if (!autoPad) return Math.round(manualPad);

    const extraPad = clampFinite(profile.extraPad, 0, 0, 200);
    const seamOverlap = clampFinite(profile.seamOverlap, placement === 'outside' ? 1 : 0, 0, 20);
    const innerOn = Boolean(profile.inner?.enabled);
    const outerOn = Boolean(profile.outer?.enabled);
    const inT = innerOn ? clampFinite(profile.inner?.thickness, 12, 0, 200) : 0;
    const inGap = innerOn ? clampFinite(profile.inner?.gap, 0, 0, 100) : 0;
    const outT = outerOn ? clampFinite(profile.outer?.thickness, 2, 0, 200) : 0;
    const outGap = outerOn ? clampFinite(profile.outer?.gap, 0, 0, 100) : 0;

    let outerBorderReach = 0;
    if (placement === 'outside') {
        outerBorderReach = Math.max(0, (inGap + inT + outGap + outT) - seamOverlap);
    } else {
        // Middle (center) straddles edge equally: shift = -0.5 * (inT + outT)
        outerBorderReach = Math.max(0, 0.5 * (inT + outT) + inGap + outGap);
    }

    // Ornate diamond medallions extend beyond band centerline
    let finialOverhang = 0;
    if (innerOn && profile.inner?.style === 'ornate-filigree') {
        const dSize = Math.min(48, Math.max(inT * 1.45, 22));
        finialOverhang = Math.max(finialOverhang, Math.max(0, dSize - inT * 0.5 + 2));
    }
    if (outerOn && profile.outer?.style === 'ornate-filigree') {
        const dSize = Math.min(48, Math.max(outT * 1.45, 22));
        finialOverhang = Math.max(finialOverhang, Math.max(0, dSize - outT * 0.5 + 2));
    }

    const glowEnabled = Boolean(profile.glow?.enabled) && !Boolean(profile.glow?.inner);
    const glowBlur = glowEnabled ? clampFinite(profile.glow?.blur, 16, 0, 120) : 0;
    // Matches HLSL glow fade tail (smoothstep 1.4..1.9 * glow_blur) so glow never hard-clips at canvas edge
    const glowBleed = glowBlur > 0.5 ? Math.ceil(glowBlur * 1.9) : 0;

    const shMode = String(profile.shadow?.mode || 'soft').toLowerCase();
    const shadowEnabled = Boolean(profile.shadow?.enabled) && shMode !== 'inset';
    let shadowBleed = 0;
    if (shadowEnabled) {
        const shOffX = Math.abs(clampFinite(profile.shadow?.offsetX, 10, -150, 150));
        const shOffY = Math.abs(clampFinite(profile.shadow?.offsetY, 14, -150, 150));
        const shSpread = clampFinite(profile.shadow?.spread, 0, -40, 80);
        const shBlur = shMode === 'hard' ? 0 : clampFinite(profile.shadow?.blur, 24, 0, 120);
        const tail = shBlur > 0.5 ? (shBlur * 1.65) : 2;
        shadowBleed = Math.max(0, Math.ceil(Math.max(shOffX, shOffY) + shSpread + tail));
    }

    const minSafeBleed = (inT > 0 || outT > 0 || glowBleed > 0 || shadowBleed > 0) ? 2 : 0;
    const totalBleed = Math.ceil(outerBorderReach + Math.max(finialOverhang, glowBleed, shadowBleed) + extraPad + minSafeBleed);
    return Math.max(0, Math.min(400, totalBleed));
}

module.exports = {
    BORDER_STYLE_GROUPS,
    BORDER_STYLES,
    STYLE_CODE_MAP,
    BORDER_ANIMATION_GROUPS,
    BORDER_ANIM_TYPES,
    ANIM_CODE_MAP,
    BACKGROUND_FILL_MODES,
    BACKGROUND_MODE_MAP,
    SHADOW_MODES,
    SHADOW_MODE_MAP,
    computeAutoBorderPad
};
