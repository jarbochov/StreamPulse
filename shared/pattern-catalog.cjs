/**
 * Single Source of Truth for StreamPulse Pattern Presets, Palettes, Capabilities,
 * and Pattern Tile Options.
 *
 * Consumed by:
 *  - Custom Overlay Editor & Procedural Pattern Engine (public/js/patterns-shared.js)
 *  - OBS Pattern Studio Backend & Lua Generator (server/services/obs-patterns.js)
 *  - OBS Pattern Studio Frontend & WebGL Preview (public/js/obs-patterns/obs-patterns-studio.js)
 */

'use strict';

const PATTERNS = [
    'grid', 'geometry', 'orbits', 'hexagons', 'diamonds',
    'isometric', 'mesh', 'sunburst', 'triangles', 'chevrons',
    'checker', 'waves', 'rings', 'scales', 'topography',
    'starfield', 'sparkles', 'dots', 'confetti', 'circuit',
    'leaves', 'turkeys', 'christmas-trees', 'christmas-lights',
    'snowflakes', 'pumpkins', 'hearts', 'fireworks',
    'honeycomb', 'evergreens', 'football-field'
];

const PATTERN_CODE_MAP = PATTERNS.reduce((acc, id, idx) => {
    acc[id] = idx;
    return acc;
}, {});

const ANALYTIC_GPU_PRESETS = new Set([
    'grid', 'geometry', 'orbits', 'hexagons', 'diamonds',
    'isometric', 'mesh', 'sunburst', 'triangles', 'chevrons',
    'checker', 'waves', 'rings', 'scales', 'topography',
    'starfield', 'sparkles', 'dots', 'circuit', 'honeycomb'
]);

const PATTERN_CAPABILITIES = {
    dots: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, density: true, spacing: true, colorMode: true, label: 'Dots matrix' },
    diamonds: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Diamonds grid' },
    hexagons: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Hexagons honeycomb' },
    triangles: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Triangles mosaic' },
    scales: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, density: true, spacing: true, colorMode: true, label: 'Scales pattern' },
    circuit: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Circuit board' },
    starfield: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Starfield' },
    sparkles: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Sparkles' },
    confetti: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: false, colorMode: true, label: 'Confetti' },
    leaves: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Autumn leaves' },
    turkeys: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Thanksgiving turkeys' },
    pumpkins: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Pumpkins & harvest' },
    'christmas-trees': { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Christmas trees' },
    'christmas-lights': { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, density: true, spacing: true, colorMode: true, label: 'Christmas string lights' },
    snowflakes: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Snowflakes' },
    hearts: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Floating hearts' },
    fireworks: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Celebration fireworks' },
    evergreens: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Evergreen forest' },

    honeycomb: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: true, density: true, spacing: true, colorMode: true, label: 'Honeycomb', hint: 'Interlinked contiguous hexagonal honeycomb cells with 3D inner bevel shading and recessed depth.' },
    'football-field': { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: true, density: true, spacing: true, colorMode: true, label: 'Football field', hint: 'Gridiron football field with alternating turf bands, yard lines, hash marks, yard numbers, and directional arrows.' },
    grid: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Grid', hint: 'Continuous Cartesian coordinate grid. Line width, density, geometry scale, color placement, and in-place shimmer adjust this pattern.' },
    isometric: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Isometric tiles', hint: 'Continuous 3D isometric line grid. Line width, density, geometry scale, color placement, and in-place pulse adjust this pattern.' },
    mesh: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Curved mesh', hint: 'Continuous curved wire mesh. Adjust line spacing with density, wave amplitude with scale, color placement, and in-place wave oscillation.' },
    waves: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Waves', hint: 'Continuous horizontal contour waves. Line width, wave density, geometry scale, color placement, and in-place ocean swell adjust this pattern.' },
    rings: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Rings', hint: 'Infinite concentric ripple rings expand continuously from center with adjustable ring density, line width, color placement, and zero seams.' },
    sunburst: { sizeVariance: false, scatter: false, inPlace: true, spin: true, fill: false, density: true, spacing: false, colorMode: true, label: 'Sunburst', hint: 'Radial rays expanding from center. Adjust ray count with density, line width, color placement, and celestial rotation.' },
    topography: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: false, colorMode: true, label: 'Topography', hint: 'Elevation contour lines. Contour density, line width, color placement, and elevation drift adjust this pattern.' },
    chevrons: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, density: true, spacing: true, colorMode: true, label: 'Chevrons', hint: 'Continuous herringbone zig-zag strips. Adjust density, line width, color placement, and in-place wave animation.' },
    checker: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: true, density: true, spacing: true, colorMode: true, label: 'Checkerboard', hint: 'Continuous checkerboard mosaic tiles. Adjust tile density, border outline width, color placement, and animated color waves.' },
    geometry: { sizeVariance: false, scatter: false, inPlace: true, spin: true, fill: true, density: true, spacing: true, colorMode: true, label: 'Geometry', hint: 'Abstract background geometric shapes with adjustable density, color placement, and breathing in-place opacity.' },
    orbits: { sizeVariance: false, scatter: false, inPlace: true, spin: true, fill: false, density: true, spacing: true, colorMode: true, label: 'Orbits', hint: 'Planetary orbit arcs with adjustable track density, line width, subtle in-place orbital drift, and color placement.' }
};

const PATTERN_CATEGORIES = [
    {
        group: 'Geometric',
        options: [
            ['grid', 'Grid'],
            ['geometry', 'Geometry'],
            ['orbits', 'Orbits'],
            ['hexagons', 'Hexagons'],
            ['honeycomb', 'Honeycomb'],
            ['diamonds', 'Diamonds'],
            ['isometric', 'Isometric tiles'],
            ['mesh', 'Curved mesh'],
            ['sunburst', 'Sunburst'],
            ['triangles', 'Triangles'],
            ['chevrons', 'Chevrons'],
            ['checker', 'Checkerboard']
        ]
    },
    {
        group: 'Organic & decorative',
        options: [
            ['waves', 'Waves'],
            ['rings', 'Rings'],
            ['scales', 'Scales'],
            ['topography', 'Topography'],
            ['circuit', 'Circuit board'],
            ['evergreens', 'Evergreen forest'],
            ['football-field', 'Football field']
        ]
    },
    {
        group: 'Particle & field',
        options: [
            ['starfield', 'Starfield'],
            ['sparkles', 'Sparkles'],
            ['dots', 'Dots'],
            ['confetti', 'Confetti']
        ]
    },
    {
        group: 'Seasonal & holiday',
        options: [
            ['leaves', 'Autumn leaves'],
            ['turkeys', 'Thanksgiving turkeys'],
            ['pumpkins', 'Pumpkins & harvest'],
            ['christmas-trees', 'Christmas trees'],
            ['christmas-lights', 'Christmas string lights'],
            ['snowflakes', 'Snowflakes'],
            ['hearts', 'Floating hearts'],
            ['fireworks', 'Celebration fireworks']
        ]
    }
];

const PALETTES = {
    multicolor: ['#ef4444', '#10b981', '#f59e0b', '#3b82f6', '#a855f7', '#f97316', '#06b6d4'],
    christmas: ['#15803d', '#dc2626', '#facc15', '#ffffff', '#b91c1c', '#166534', '#eab308'],
    'holiday-lights': ['#ef4444', '#22c55e', '#facc15', '#3b82f6'],
    autumn: ['#dc2626', '#ea580c', '#eab308', '#65a30d', '#92400e', '#78350f', '#f97316'],
    halloween: ['#f97316', '#a855f7', '#22c55e', '#27272a', '#eab308', '#7c3aed', '#10b981'],
    winter: ['#38bdf8', '#60a5fa', '#818cf8', '#1e3a8a', '#f8fafc', '#bae6fd', '#c7d2fe'],
    valentines: ['#be123c', '#f43f5e', '#fb7185', '#fda4af', '#ffffff', '#e11d48', '#fecdd3'],
    neon: ['#00f5d4', '#ff007f', '#70e000', '#fee440', '#9b5de5', '#00bbf9', '#f15bb5'],
    warm: ['#f59e0b', '#ef4444', '#d97706', '#fef3c7', '#fb7185', '#b45309'],
    cool: ['#38bdf8', '#60a5fa', '#34d399', '#c084fc', '#e2e8f0', '#0284c7'],
    pastel: ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#93c5fd', '#d8b4fe', '#fbcfe8'],
    forest: ['#14532d', '#16a34a', '#84cc16', '#ca8a04', '#78350f', '#15803d', '#3f6212'],
    sunset: ['#4c1d95', '#c026d3', '#f43f5e', '#fb923c', '#facc15', '#e11d48', '#7c3aed'],
    synthwave: ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0'],
    galaxy: ['#240046', '#5a189a', '#9d4edd', '#00b4d8', '#c77dff', '#e0aaff'],
    terracotta: ['#c86446', '#9e472a', '#e6b89c', '#d99b42', '#778465', '#d4a373'],
    vaporwave: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'],
    ocean: ['#0f4c5c', '#06d6a0', '#118ab2', '#f78c6b', '#ffd166', '#e36414'],
    royal: ['#580c1f', '#74121d', '#8b263e', '#c99700', '#f1e0ac', '#3d0c11'],
    sakura: ['#ffb7b2', '#ffdac1', '#b5e7a0', '#86af49', '#e2f0d9', '#ff9aa2'],
    coffee: ['#2c1810', '#4a2c1d', '#8c5835', '#c4a482', '#f5ede2', '#a07855'],
    monochrome: ['#ffffff', '#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#64748b', '#0f172a']
};

const SNOWFLAKE_STYLES = ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle'];

const TILE_LAYOUTS = [
    { id: 'grid', label: 'Grid', code: 0 },
    { id: 'brick', label: 'Brick (Row Stagger)', code: 1 },
    { id: 'stagger', label: 'Stagger (Col Stagger)', code: 2 },
    { id: 'alternating', label: 'Alternating Scale/Opacity', code: 3 },
    { id: 'checkerboard', label: 'Checkerboard', code: 4 }
];
const TILE_LAYOUT_CODE_MAP = { grid: 0, brick: 1, stagger: 2, alternating: 3, checkerboard: 4 };

const TILE_SYMMETRY_MODES = [
    { id: 'none', label: 'None (Standard)', code: 0 },
    { id: 'quad', label: 'Quad Mirror (4-Way)', code: 1 },
    { id: 'radial', label: 'Kaleidoscope Radial', code: 2 }
];
const TILE_SYMMETRY_CODE_MAP = { none: 0, quad: 1, radial: 2 };

const TILE_MOTIONS = [
    { id: 'none', label: 'Static', code: 0 },
    { id: 'scroll', label: 'Continuous Scroll', code: 1 },
    { id: 'alt-rows', label: 'Alternating Rows', code: 2 },
    { id: 'alt-cols', label: 'Alternating Columns', code: 3 },
    { id: 'weave', label: 'Criss-Cross Weave', code: 4 },
    { id: 'sway', label: 'Sway & Rock', code: 5 },
    { id: 'spin', label: 'Spin in Place', code: 6 },
    { id: 'scroll-spin', label: 'Scroll + Spin', code: 7 },
    { id: 'wave', label: 'Ripple Wave', code: 8 },
    { id: 'float', label: 'Organic Float', code: 9 }
];
const TILE_MOTION_CODE_MAP = {
    none: 0, scroll: 1, 'alt-rows': 2, 'alt-cols': 3, weave: 4,
    sway: 5, spin: 6, 'scroll-spin': 7, wave: 8, float: 9
};

const TILE_HUE_MODES = [
    { id: 'none', label: 'Off', code: 0 },
    { id: 'cycle', label: 'Full spectrum cycle', code: 1 },
    { id: 'wave-x', label: 'Horizontal rainbow wave', code: 2 },
    { id: 'wave-y', label: 'Vertical rainbow wave', code: 3 }
];
const TILE_HUE_CODE_MAP = { none: 0, cycle: 1, 'wave-x': 2, 'wave-y': 3 };

const TILE_DISTRIBUTIONS = [
    { id: 'diagonal', label: 'Diagonal weave (A → B → C)', code: 0 },
    { id: 'row', label: 'Alternating rows', code: 1 },
    { id: 'col', label: 'Alternating columns', code: 2 },
    { id: 'grid', label: '2×2 Quadrant matrix', code: 3 },
    { id: 'random', label: 'Organic random mix', code: 4 }
];
const TILE_DIST_CODE_MAP = { diagonal: 0, row: 1, col: 2, grid: 3, random: 4 };

const TILE_ALTERNATE_FLIPS = [
    { id: 'tilt', label: 'Counter-tilt angle (+/−)', code: 0 },
    { id: 'h', label: 'Mirror horizontal', code: 1 },
    { id: 'v', label: 'Mirror vertical', code: 2 },
    { id: 'both', label: 'Mirror both (180°)', code: 3 },
    { id: 'none', label: 'Scale & opacity only', code: 4 }
];
const TILE_ALT_FLIP_CODE_MAP = { tilt: 0, h: 1, v: 2, both: 3, none: 4 };

const TILE_TRACK_MODES = [
    { id: 'uniform', label: 'All tiles together', code: 0 },
    { id: 'alt-rows', label: 'Alternating rows (opposing)', code: 1 },
    { id: 'stagger-rows', label: 'Parallax rows (2x / 1x)', code: 2 },
    { id: 'alt-cols', label: 'Alternating columns (opposing)', code: 3 },
    { id: 'stagger-cols', label: 'Parallax columns (2x / 1x)', code: 4 },
    { id: 'opposite', label: 'Opposite directions', code: 5 },
    { id: 'sine', label: 'Sine-wave slide (back & forth)', code: 6 },
    { id: 'stagger', label: 'Parallax speeds', code: 7 },
    { id: 'alternate-stop', label: 'Every other track slides', code: 8 }
];
const TILE_TRACK_CODE_MAP = {
    uniform: 0, 'alt-rows': 1, 'stagger-rows': 2, 'alt-cols': 3, 'stagger-cols': 4,
    opposite: 5, sine: 6, stagger: 7, 'alternate-stop': 8
};

const TILE_SPIN_DIRECTIONS = [
    { id: 'cw', label: 'Clockwise', code: 0 },
    { id: 'ccw', label: 'Counter-clockwise', code: 1 },
    { id: 'alternate', label: 'Alternating (checkerboard)', code: 2 }
];
const TILE_SPIN_DIR_CODE_MAP = { cw: 0, ccw: 1, alternate: 2 };

const PROCEDURAL_MOTIONS = [
    { id: 'none', label: 'Static (no canvas movement)', code: 0 },
    { id: 'drift', label: 'Drift (gentle floating drift)', code: 1 },
    { id: 'fall', label: 'Fall (continuous falling cascade)', code: 2 },
    { id: 'sway', label: 'Sway (breathing tilt & scale)', code: 3 },
    { id: 'pulse', label: 'Pulse (rhythmic breath)', code: 4 },
    { id: 'orbit', label: 'Orbit (subtle celestial orbit)', code: 5 },
    { id: 'sweep', label: 'Sweep (scanner light sweep)', code: 6 },
    { id: 'aurora', label: 'Aurora (glowing color ribbons)', code: 7 },
    { id: 'pan', label: 'Pan (continuous smooth glide)', code: 8 }
];
const PROCEDURAL_MOTION_CODE_MAP = {
    none: 0, drift: 1, fall: 2, sway: 3, pulse: 4, orbit: 5, sweep: 6, aurora: 7, pan: 8
};

const PROCEDURAL_COLOR_MODES = [
    { id: 'mosaic', label: 'Mosaic scatter (organic dispersion)', code: 0 },
    { id: 'radial', label: 'Concentric radial (rings from center)', code: 1 },
    { id: 'rows', label: 'Horizontal rows (striped bands)', code: 2 },
    { id: 'columns', label: 'Vertical columns (striped bands)', code: 3 },
    { id: 'diagonal', label: 'Diagonal waves (angled bands)', code: 4 },
    { id: 'spiral', label: 'Spiral vortex (twisting outward)', code: 5 },
    { id: 'checker', label: 'Checkerboard rhythm (alternating)', code: 6 }
];
const PROCEDURAL_COLOR_MODE_CODE_MAP = {
    mosaic: 0, radial: 1, rows: 2, columns: 3, diagonal: 4, spiral: 5, checker: 6
};

const PROCEDURAL_COLOR_ANIMS = [
    { id: 'none', label: 'Static (still color layout)', code: 0 },
    { id: 'cycle', label: 'Continuous cycle (flowing color wave)', code: 1 },
    { id: 'breathe', label: 'Breathe (pulsing color wave)', code: 2 }
];
const PROCEDURAL_COLOR_ANIM_CODE_MAP = { none: 0, cycle: 1, breathe: 2 };

const PROCEDURAL_IN_PLACE_MODES = [
    { id: 'auto', label: 'In-place motion (shimmer, pulse & swell)', code: 1 },
    { id: 'pulse', label: 'Vivid rhythmic pulse & swell', code: 2 },
    { id: 'gentle', label: 'Gentle subtle shimmer', code: 3 },
    { id: 'sparkle', label: 'Fast twinkle & shimmer', code: 4 },
    { id: 'none', label: 'Frozen (no in-place motion)', code: 0 }
];
const PROCEDURAL_IN_PLACE_CODE_MAP = { none: 0, auto: 1, pulse: 2, gentle: 3, sparkle: 4 };

const PROCEDURAL_FILL_MODES = [
    { id: 'tinted', label: 'Translucent Tint (Glass / Ambient)', code: 0 },
    { id: 'solid', label: 'Solid Color (Vibrant Opaque)', code: 1 },
    { id: 'outline', label: 'Wireframe Outlines Only', code: 2 }
];
const PROCEDURAL_FILL_MODE_CODE_MAP = { tinted: 0, solid: 1, outline: 2 };

const PROCEDURAL_PAN_DIRECTIONS = [
    { id: 'continuous', label: 'Single-direction continuous glide', code: 0 },
    { id: 'oscillate', label: 'Back-and-forth oscillation', code: 1 }
];

const PROCEDURAL_SPIN_MODES = [
    { id: 'none', label: 'No individual element spin', code: 0 },
    { id: 'cw', label: 'Clockwise rotation', code: 1 },
    { id: 'ccw', label: 'Counter-clockwise rotation', code: 2 },
    { id: 'sway', label: 'Gentle pendulum sway', code: 3 }
];

const BACKGROUND_TYPES = [
    { id: 'solid', label: 'Solid Color', code: 1 },
    { id: 'linear', label: 'Linear Gradient', code: 2 },
    { id: 'radial', label: 'Radial Spotlight Gradient', code: 3 },
    { id: 'conic', label: 'Conic Sweep / Aurora Gradient', code: 4 },
    { id: 'transparent', label: 'Transparent Cutout (Pattern Only)', code: 0 }
];
const BG_TYPE_CODE_MAP = { transparent: 0, solid: 1, linear: 2, radial: 3, conic: 4 };

const BG_MOTION_MODES = [
    { id: 'none', label: 'Static Gradient', code: 0 },
    { id: 'rotate', label: 'Slow Rotate / Flow', code: 1 },
    { id: 'pulse', label: 'Breathing Pulse', code: 2 },
    { id: 'shift', label: 'Smooth Color Pan', code: 3 }
];
const BG_MOTION_CODE_MAP = { none: 0, rotate: 1, pulse: 2, shift: 3 };

const PALETTE_OPTIONS = [
    ['dual', 'Two-Tone (Accent & Secondary)'],
    ['custom', 'Custom Palette (Multi-Stop Editor)'],
    ['multicolor', 'Festive Multicolor (7 Jewel Tones)'],
    ['christmas', 'Holiday Classic (Emerald, Ruby, Gold)'],
    ['holiday-lights', 'Traditional Holiday Lights (Red, Green, Yellow, Blue)'],
    ['autumn', 'Autumn Harvest (Crimson, Orange, Gold, Chestnut)'],
    ['halloween', 'Spooky Halloween (Pumpkin, Witch Violet, Slime)'],
    ['winter', 'Winter Frost (Ice Blue, Periwinkle, Snow)'],
    ['valentines', 'Romance (Crimson, Rose, Blush Pink)'],
    ['neon', 'Cyber Neon (Electric Cyan, Hot Pink, Lime)'],
    ['warm', 'Warm Hearth (Amber, Crimson, Gold)'],
    ['cool', 'Cool Breeze (Sky, Mint, Ocean Teal)'],
    ['pastel', 'Soft Pastel (Coral, Peach, Mint, Lavender)'],
    ['forest', 'Forest & Moss (Deep Pine, Sage, Earth)'],
    ['sunset', 'Dusk & Sunset (Twilight Violet, Coral, Gold)'],
    ['synthwave', 'Synthwave (Neon Magenta, Deep Violet, Electric Cyan)'],
    ['galaxy', 'Cosmic Galaxy (Deep Void, Royal Purple, Bright Teal, Lavender)'],
    ['terracotta', 'Terracotta & Clay (Burnt Sienna, Rust, Sage, Ochre)'],
    ['vaporwave', 'Vaporwave (Hot Pink, Cyan, Mint, Lilac, Pastel Yellow)'],
    ['ocean', 'Deep Ocean (Deep Teal, Emerald, Coral, Gold)'],
    ['royal', 'Imperial Royal (Velvet Crimson, Burgundy, Antique Gold)'],
    ['sakura', 'Cherry Blossom Sakura (Blush Pink, Sage, Tender Green)'],
    ['coffee', 'Warm Coffee & Mocha (Espresso, Warm Caramel, Cream, Chestnut)'],
    ['monochrome', 'Sleek Monochrome (White, Silver, Slate)']
];

const GPU_FILTER_PRESETS = [
    {
        id: 'clean',
        label: 'Clean (None)',
        filters: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, hueRotate: 0, blur: 0, duotone: { enabled: false }, tint: { enabled: false }, grain: { enabled: false } }
    },
    {
        id: 'frosted-backdrop',
        label: 'Soft Frosted Backdrop',
        filters: { brightness: 88, contrast: 95, saturate: 85, grayscale: 0, hueRotate: 0, blur: 10, duotone: { enabled: false }, tint: { enabled: false }, grain: { enabled: false } }
    },
    {
        id: 'moody-dim',
        label: 'Moody Dim',
        filters: { brightness: 65, contrast: 118, saturate: 80, grayscale: 15, hueRotate: 0, blur: 4, duotone: { enabled: false }, tint: { enabled: true, color: '#0B1026FF', opacity: 25 }, grain: { enabled: false } }
    },
    {
        id: 'vibrant-neon',
        label: 'Vibrant Neon Pop',
        filters: { brightness: 112, contrast: 122, saturate: 175, grayscale: 0, hueRotate: 0, blur: 0, duotone: { enabled: false }, tint: { enabled: false }, grain: { enabled: false } }
    },
    {
        id: 'retro-noir',
        label: 'Retro Noir + Film Grain',
        filters: { brightness: 95, contrast: 135, saturate: 100, grayscale: 100, hueRotate: 0, blur: 1, duotone: { enabled: false }, tint: { enabled: false }, grain: { enabled: true, amount: 24, size: 150, animate: true } }
    },
    {
        id: 'cyber-duotone',
        label: 'Cyber Duotone (Violet / Cyan)',
        filters: { brightness: 105, contrast: 115, saturate: 100, grayscale: 0, hueRotate: 0, blur: 0, duotone: { enabled: true, dark: '#1E1B4BFF', light: '#22D3EEFF' }, tint: { enabled: false }, grain: { enabled: false } }
    },
    {
        id: 'sunset-duotone',
        label: 'Warm Sunset Duotone',
        filters: { brightness: 105, contrast: 115, saturate: 100, grayscale: 0, hueRotate: 0, blur: 0, duotone: { enabled: true, dark: '#4C1D95FF', light: '#FB923CFF' }, tint: { enabled: false }, grain: { enabled: false } }
    }
];

module.exports = {
    PATTERNS,
    PATTERN_CODE_MAP,
    ANALYTIC_GPU_PRESETS: Array.from(ANALYTIC_GPU_PRESETS),
    PATTERN_CAPABILITIES,
    PATTERN_CATEGORIES,
    PALETTES,
    SNOWFLAKE_STYLES,
    TILE_LAYOUTS,
    TILE_LAYOUT_CODE_MAP,
    TILE_SYMMETRY_MODES,
    TILE_SYMMETRY_CODE_MAP,
    TILE_MOTIONS,
    TILE_MOTION_CODE_MAP,
    TILE_HUE_MODES,
    TILE_HUE_CODE_MAP,
    PROCEDURAL_MOTIONS,
    PROCEDURAL_MOTION_CODE_MAP,
    PROCEDURAL_COLOR_MODES,
    PROCEDURAL_COLOR_MODE_CODE_MAP,
    PROCEDURAL_COLOR_ANIMS,
    PROCEDURAL_COLOR_ANIM_CODE_MAP,
    PROCEDURAL_IN_PLACE_MODES,
    PROCEDURAL_IN_PLACE_CODE_MAP,
    PROCEDURAL_FILL_MODES,
    PROCEDURAL_FILL_MODE_CODE_MAP,
    PROCEDURAL_PAN_DIRECTIONS,
    PROCEDURAL_SPIN_MODES,
    PALETTE_OPTIONS,
    GPU_FILTER_PRESETS,
    TILE_DISTRIBUTIONS,
    TILE_DIST_CODE_MAP,
    TILE_ALTERNATE_FLIPS,
    TILE_ALT_FLIP_CODE_MAP,
    TILE_TRACK_MODES,
    TILE_TRACK_CODE_MAP,
    TILE_SPIN_DIRECTIONS,
    TILE_SPIN_DIR_CODE_MAP,
    BACKGROUND_TYPES,
    BG_TYPE_CODE_MAP,
    BG_MOTION_MODES,
    BG_MOTION_CODE_MAP
};
