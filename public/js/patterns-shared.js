(function(root) {
    'use strict';

    const PATTERNS = [
        'grid', 'geometry', 'orbits', 'hexagons', 'diamonds',
        'isometric', 'mesh', 'sunburst', 'triangles', 'chevrons',
        'checker', 'waves', 'rings', 'scales', 'topography',
        'starfield', 'sparkles', 'dots', 'confetti', 'circuit',
        'leaves', 'turkeys', 'christmas-trees', 'christmas-lights',
        'snowflakes', 'pumpkins', 'hearts', 'fireworks'
    ];

    const PATTERN_CAPABILITIES = {
        // Discrete element patterns: size variance + organic scatter + in-place animation + spin
        dots: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Dots matrix' },
        diamonds: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Diamonds grid' },
        hexagons: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Hexagons honeycomb' },
        triangles: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Triangles mosaic' },
        scales: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Scales pattern' },
        circuit: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Circuit board' },
        starfield: { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, density: true, colorMode: true, label: 'Starfield' },
        sparkles: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, density: true, colorMode: true, label: 'Sparkles' },
        confetti: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Confetti' },
        leaves: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Autumn leaves' },
        turkeys: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Thanksgiving turkeys' },
        pumpkins: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Pumpkins & harvest' },
        'christmas-trees': { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Christmas trees' },
        'christmas-lights': { sizeVariance: true, scatter: true, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Christmas string lights' },
        snowflakes: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Snowflakes' },
        hearts: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Floating hearts' },
        fireworks: { sizeVariance: true, scatter: true, inPlace: true, spin: true, fill: true, colorMode: true, label: 'Celebration fireworks' },

        // Continuous line & vector mesh patterns: in-place animation (swells, ripples, rotations, line shimmers)
        grid: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Grid', hint: 'Continuous Cartesian coordinate grid. Line width, geometry scale, color placement, and in-place shimmer adjust this pattern.' },
        isometric: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Isometric tiles', hint: 'Continuous 3D isometric line grid. Line width, geometry scale, color placement, and in-place pulse adjust this pattern.' },
        mesh: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Curved mesh', hint: 'Continuous curved wire mesh. Adjust wave amplitude with scale, color placement, and in-place wave oscillation.' },
        waves: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Waves', hint: 'Continuous horizontal contour waves. Line width, geometry scale, color placement, and in-place ocean swell adjust this pattern.' },
        rings: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Rings', hint: 'Infinite concentric ripple rings expand continuously from center with color placement and zero seams.' },
        sunburst: { sizeVariance: false, scatter: false, inPlace: true, spin: true, fill: false, density: true, colorMode: true, label: 'Sunburst', hint: 'Radial rays expanding from center. Adjust ray count with sunburst density, line width, color placement, and celestial rotation.' },
        topography: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Topography', hint: 'Elevation contour lines. Contour lines gently morph and breathe with color placement and elevation drift.' },
        chevrons: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: false, colorMode: true, label: 'Chevrons', hint: 'Continuous herringbone zig-zag strips. Shimmers along rows with color placement and in-place wave animation.' },
        checker: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Checkerboard', hint: 'Continuous checkerboard mosaic tiles. Choose color placement and animated color waves.' },
        geometry: { sizeVariance: false, scatter: false, inPlace: true, spin: false, fill: true, colorMode: true, label: 'Geometry', hint: 'Abstract background geometric shapes with color placement and breathing in-place opacity.' },
        orbits: { sizeVariance: false, scatter: false, inPlace: true, spin: true, fill: false, colorMode: true, label: 'Orbits', hint: 'Planetary orbit arcs with subtle in-place orbital drift and color placement.' }
    };

    const PATTERN_CATEGORIES = [
        {
            group: 'Geometric',
            options: [
                ['grid', 'Grid'],
                ['geometry', 'Geometry'],
                ['orbits', 'Orbits'],
                ['hexagons', 'Hexagons'],
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
                ['circuit', 'Circuit board']
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

    function withAlpha(color, hexAlpha) {
        if (!color || typeof color !== 'string') return '#58a6ff' + hexAlpha;
        const c = color.trim();
        if (c.startsWith('#')) {
            if (c.length === 7) return c + hexAlpha;
            if (c.length === 4) {
                return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] + hexAlpha;
            }
        }
        return c;
    }

    function getPatternColor(palette, index, accent, secondary) {
        if (palette && PALETTES[palette]) {
            const list = PALETTES[palette];
            return list[Math.abs(index) % list.length];
        }
        return (index & 1) === 0 ? accent : secondary;
    }

    function quadTo(ctx, cx, cy, x, y) {
        if (typeof ctx.quadraticCurveTo === 'function') {
            ctx.quadraticCurveTo(cx, cy, x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    function hash2D(i, seed) {
        let h = (i * 374761393 + seed * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    function drawFourPointStar(ctx, x, y, r) {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.28, y - r * 0.28);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x + r * 0.28, y + r * 0.28);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.28, y + r * 0.28);
        ctx.lineTo(x - r, y);
        ctx.lineTo(x - r * 0.28, y - r * 0.28);
        ctx.closePath();
    }

    const motifStampCache = new Map();
    const vignetteGradCache = new Map();
    let patternTileCanvas = null;
    let patternSeamCanvas = null;
    let patternBlendCanvas = null;
    let loopOutgoingCanvas = null;
    let loopIncomingCanvas = null;
    // 48 RGBA 384px stamps use at most 27 MiB, regardless of editor changes.
    const MAX_STAMP_CACHE = 48;

    function getOrCreateStamp(cacheKey, drawFn, stampDim = 384) {
        if (motifStampCache.has(cacheKey)) {
            return motifStampCache.get(cacheKey);
        }
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return null;
        }
        try {
            const canvas = document.createElement('canvas');
            canvas.width = stampDim;
            canvas.height = stampDim;
            const sCtx = canvas.getContext('2d');
            if (!sCtx) return null;
            drawFn(sCtx, stampDim / 2, stampDim / 2, stampDim);
            if (motifStampCache.size >= MAX_STAMP_CACHE) {
                const firstKey = motifStampCache.keys().next().value;
                motifStampCache.delete(firstKey);
            }
            motifStampCache.set(cacheKey, canvas);
            return canvas;
        } catch {
            return null;
        }
    }

    function drawTurkeyMotif(ctx, cx, cy, r, hasFill, fillHex, fillMode, fCol, tipCol, bodyCol, wingCol, lineW) {
        ctx.save();
        ctx.lineWidth = lineW;

        // 1. Radiating fanned tail feathers (semi-circle fan behind the body)
        const feathers = 7;
        const pivotY = cy + r * 0.22;
        for (let f = 0; f < feathers; f++) {
            const fNorm = (f - (feathers - 1) / 2) / ((feathers - 1) / 2);
            const fAng = fNorm * (Math.PI * 0.44);
            const sinA = Math.sin(fAng), cosA = Math.cos(fAng);

            // Main feather paddle
            const distPaddle = r * 0.90;
            const px = cx + distPaddle * sinA;
            const py = pivotY - distPaddle * cosA;
            ctx.fillStyle = withAlpha(fCol, hasFill ? fillHex : '40');
            ctx.strokeStyle = withAlpha(fCol, 'c0');
            ctx.beginPath();
            ctx.ellipse(px, py, r * 0.20, r * 0.48, fAng, 0, Math.PI * 2);
            if (hasFill) ctx.fill();
            ctx.stroke();

            // Feather tip band
            const distTip = r * 1.24;
            const tx = cx + distTip * sinA;
            const ty = pivotY - distTip * cosA;
            ctx.fillStyle = withAlpha(tipCol, hasFill ? (fillMode === 'solid' ? 'ff' : fillHex) : '70');
            ctx.strokeStyle = withAlpha(tipCol, 'e0');
            ctx.beginPath();
            ctx.ellipse(tx, ty, r * 0.16, r * 0.12, fAng, 0, Math.PI * 2);
            if (hasFill) ctx.fill();
            ctx.stroke();

            // Feather center quill line
            const distQuill = r * 1.16;
            ctx.strokeStyle = withAlpha(fCol, '65');
            ctx.beginPath();
            ctx.moveTo(cx, pivotY);
            ctx.lineTo(cx + distQuill * sinA, pivotY - distQuill * cosA);
            ctx.stroke();
        }

        // 2. Plump turkey body (layered over feathers)
        ctx.fillStyle = withAlpha(bodyCol, hasFill ? fillHex : '48');
        ctx.strokeStyle = withAlpha(bodyCol, 'd0');
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.28, r * 0.44, r * 0.40, 0, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();

        // 3. Folded wings on left & right of body
        ctx.fillStyle = withAlpha(wingCol, hasFill ? (fillMode === 'solid' ? withAlpha(wingCol, 'ee') : fillHex) : '35');
        ctx.strokeStyle = withAlpha(wingCol, 'c8');
        // Left wing
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.26, cy + r * 0.28, r * 0.14, r * 0.26, -0.22, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();
        // Right wing
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.26, cy + r * 0.28, r * 0.14, r * 0.26, 0.22, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();

        // 4. Turkey head & neck
        ctx.fillStyle = withAlpha(bodyCol, hasFill ? fillHex : '55');
        ctx.strokeStyle = withAlpha(bodyCol, 'd8');
        ctx.beginPath();
        ctx.ellipse(cx, cy - r * 0.18, r * 0.22, r * 0.24, 0, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();

        // 5. Turkey eyes (white sclera + dark pupils for unmistakable character)
        const eyeY = cy - r * 0.24;
        const eyeSpacing = r * 0.085;
        const eyeR = r * 0.052;
        const pupilR = r * 0.026;

        // Left eye
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#27272a';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing + r * 0.01, eyeY, pupilR, 0, Math.PI * 2);
        ctx.fill();

        // Right eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx + eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.arc(cx + eyeSpacing - r * 0.01, eyeY, pupilR, 0, Math.PI * 2);
        ctx.fill();

        // 6. Beak (bright triangular beak pointing downward)
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#d97706';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.08, cy - r * 0.16);
        ctx.lineTo(cx + r * 0.08, cy - r * 0.16);
        ctx.lineTo(cx, cy - r * 0.01);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 7. Signature red snood/wattle draping over the side of the beak
        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#991b1b';
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.02, cy - r * 0.17);
        quadTo(ctx, cx + r * 0.14, cy - r * 0.10, cx + r * 0.12, cy + r * 0.02);
        quadTo(ctx, cx + r * 0.11, cy + r * 0.12, cx + r * 0.05, cy + r * 0.10);
        quadTo(ctx, cx, cy + r * 0.07, cx + r * 0.01, cy - r * 0.03);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 8. Claw feet with 3 splayed toes in amber/orange
        const legCol = '#f59e0b';
        ctx.strokeStyle = legCol;
        ctx.lineWidth = lineW * 1.15;
        // Left leg & toes
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.18, cy + r * 0.65);
        ctx.lineTo(cx - r * 0.20, cy + r * 0.84);
        ctx.lineTo(cx - r * 0.30, cy + r * 0.92);
        ctx.moveTo(cx - r * 0.20, cy + r * 0.84);
        ctx.lineTo(cx - r * 0.20, cy + r * 0.94);
        ctx.moveTo(cx - r * 0.20, cy + r * 0.84);
        ctx.lineTo(cx - r * 0.10, cy + r * 0.92);
        // Right leg & toes
        ctx.moveTo(cx + r * 0.18, cy + r * 0.65);
        ctx.lineTo(cx + r * 0.20, cy + r * 0.84);
        ctx.lineTo(cx + r * 0.10, cy + r * 0.92);
        ctx.moveTo(cx + r * 0.20, cy + r * 0.84);
        ctx.lineTo(cx + r * 0.20, cy + r * 0.94);
        ctx.moveTo(cx + r * 0.20, cy + r * 0.84);
        ctx.lineTo(cx + r * 0.30, cy + r * 0.92);
        ctx.stroke();

        ctx.restore();
    }

    function drawPumpkinMotif(ctx, cx, cy, r, pColor, stemColor, hasFill, fillHex, lineW) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = lineW;

        // Stem & tendril
        ctx.strokeStyle = withAlpha(stemColor, 'aa');
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.55);
        quadTo(ctx, r * 0.08, -r * 0.95, r * 0.24, -r * 0.98);
        ctx.moveTo(0, -r * 0.62);
        quadTo(ctx, -r * 0.38, -r * 0.92, -r * 0.48, -r * 0.65);
        ctx.stroke();

        // Outer left & right pumpkin ribs
        ctx.fillStyle = withAlpha(pColor, hasFill ? fillHex : '2e');
        ctx.strokeStyle = withAlpha(pColor, '95');
        ctx.beginPath();
        ctx.ellipse(-r * 0.36, 0, r * 0.42, r * 0.56, 0, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(r * 0.36, 0, r * 0.42, r * 0.56, 0, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();

        // Center pumpkin rib
        ctx.fillStyle = withAlpha(pColor, hasFill ? fillHex : '38');
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.4, r * 0.6, 0, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    function drawChristmasTreeMotif(ctx, cx, cy, r, treeColor, topperColor, hasFill, fillHex, lineW) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = lineW;

        // Tree trunk
        ctx.fillStyle = withAlpha(topperColor, '55');
        ctx.strokeStyle = withAlpha(topperColor, '90');
        ctx.fillRect(-r * 0.14, r * 0.52, r * 0.28, r * 0.28);

        // 3 tiered evergreen pine boughs (bottom, middle, top)
        ctx.fillStyle = withAlpha(treeColor, hasFill ? fillHex : '34');
        ctx.strokeStyle = withAlpha(treeColor, 'a5');
        const tiers = [
            { topY: -r * 0.15, botY: r * 0.54, halfW: r * 0.72 },
            { topY: -r * 0.52, botY: r * 0.14, halfW: r * 0.56 },
            { topY: -r * 0.85, botY: -r * 0.24, halfW: r * 0.40 }
        ];
        for (const t of tiers) {
            ctx.beginPath();
            ctx.moveTo(0, t.topY);
            ctx.lineTo(t.halfW, t.botY);
            ctx.lineTo(-t.halfW, t.botY);
            ctx.closePath();
            if (hasFill) ctx.fill();
            ctx.stroke();
        }

        // Ornaments on boughs
        const ornaments = [
            [-r * 0.24, r * 0.36, '#ef4444'],
            [r * 0.26, r * 0.28, '#f59e0b'],
            [0, -r * 0.02, '#3b82f6'],
            [-r * 0.16, -r * 0.36, '#a855f7'],
            [r * 0.18, -r * 0.42, '#10b981']
        ];
        for (const [ox, oy, oCol] of ornaments) {
            ctx.fillStyle = withAlpha(oCol, 'cc');
            ctx.beginPath();
            ctx.arc(ox, oy, r * 0.065, 0, Math.PI * 2);
            ctx.fill();
        }

        // Glowing 4-point star topper
        ctx.fillStyle = withAlpha(topperColor, 'eb');
        drawFourPointStar(ctx, 0, -r * 0.92, r * 0.22);
        ctx.fill();

        ctx.restore();
    }

    function drawLeafMotif(ctx, cx, cy, r, leafType, leafColor, hasFill, fillHex, lineW) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = withAlpha(leafColor, '98');

        if (leafType === 0) {
            // Pointed botanical / oak leaf with veins
            ctx.beginPath();
            ctx.moveTo(0, -r);
            quadTo(ctx, r * 0.88, -r * 0.25, 0, r * 0.85);
            quadTo(ctx, -r * 0.88, -r * 0.25, 0, -r);
            ctx.closePath();
            if (hasFill) {
                ctx.fillStyle = withAlpha(leafColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();

            // Stem & veins
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.82);
            ctx.lineTo(0, r * 1.18);
            ctx.moveTo(0, -r * 0.2); ctx.lineTo(r * 0.36, -r * 0.48);
            ctx.moveTo(0, -r * 0.2); ctx.lineTo(-r * 0.36, -r * 0.48);
            ctx.moveTo(0, r * 0.22); ctx.lineTo(r * 0.38, -r * 0.05);
            ctx.moveTo(0, r * 0.22); ctx.lineTo(-r * 0.38, -r * 0.05);
            ctx.stroke();
        } else {
            // 3-lobed maple leaf
            ctx.beginPath();
            ctx.moveTo(0, -r * 1.05);
            ctx.lineTo(r * 0.25, -r * 0.38);
            ctx.lineTo(r * 0.95, -r * 0.48);
            ctx.lineTo(r * 0.48, r * 0.08);
            ctx.lineTo(r * 0.72, r * 0.52);
            ctx.lineTo(0, r * 0.38);
            ctx.lineTo(-r * 0.72, r * 0.52);
            ctx.lineTo(-r * 0.48, r * 0.08);
            ctx.lineTo(-r * 0.95, -r * 0.48);
            ctx.lineTo(-r * 0.25, -r * 0.38);
            ctx.closePath();
            if (hasFill) {
                ctx.fillStyle = withAlpha(leafColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();

            // Maple veins & stem
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.75);
            ctx.lineTo(0, r * 1.05);
            ctx.moveTo(0, r * 0.15); ctx.lineTo(r * 0.62, -r * 0.3);
            ctx.moveTo(0, r * 0.15); ctx.lineTo(-r * 0.62, -r * 0.3);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawSnowflakeMotif(ctx, cx, cy, r, morphology, sColor, hasFill, fillHex, lineW, accent) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = sColor;

        if (morphology === 0) {
            // 0. Intricate Stellar Dendrite (Classic Feathery Lace)
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                ctx.moveTo(0, 0);
                ctx.lineTo(cosA * r, sinA * r);
                // Spearhead tip
                const tipLen = r * 0.16;
                for (const side of [-1, 1]) {
                    const ba = a + side * (Math.PI / 4);
                    ctx.moveTo(cosA * r, sinA * r);
                    ctx.lineTo(cosA * r - Math.cos(ba) * tipLen, sinA * r - Math.sin(ba) * tipLen);
                }
                // Dual V-dendrites
                for (const dist of [0.44, 0.74]) {
                    const bx = cosA * (r * dist), by = sinA * (r * dist);
                    const bLen = r * (dist === 0.44 ? 0.35 : 0.25);
                    for (const side of [-1, 1]) {
                        const ba = a + side * (Math.PI / 3);
                        const ex = bx + Math.cos(ba) * bLen, ey = by + Math.sin(ba) * bLen;
                        ctx.moveTo(bx, by);
                        ctx.lineTo(ex, ey);
                        if (dist === 0.44) {
                            const subLen = bLen * 0.38;
                            const sa = ba + side * (Math.PI / 3);
                            ctx.moveTo(bx + Math.cos(ba) * (bLen * 0.55), by + Math.sin(ba) * (bLen * 0.55));
                            ctx.lineTo(bx + Math.cos(ba) * (bLen * 0.55) + Math.cos(sa) * subLen, by + Math.sin(ba) * (bLen * 0.55) + Math.sin(sa) * subLen);
                        }
                    }
                }
            }
            ctx.stroke();

            // Inner hexagonal starlet ring
            ctx.beginPath();
            for (let p = 0; p < 6; p++) {
                const a = (p * Math.PI) / 3;
                const hx = Math.cos(a) * r * 0.22, hy = Math.sin(a) * r * 0.22;
                if (p === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();
        } else if (morphology === 1) {
            // 1. Geometric Crystal Plate (Faceted Hexagon Plate)
            ctx.beginPath();
            for (let p = 0; p < 12; p++) {
                const a = (p * Math.PI) / 6;
                const rad = (p % 2 === 0) ? (r * 0.88) : (r * 0.45);
                const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
                if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();

            // Internal diamond kite facets on each branch
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                ctx.moveTo(0, 0); ctx.lineTo(cosA * r, sinA * r);
                const midR = r * 0.55;
                const sideA1 = a - Math.PI / 12, sideA2 = a + Math.PI / 12;
                ctx.moveTo(cosA * (r * 0.28), sinA * (r * 0.28));
                ctx.lineTo(Math.cos(sideA1) * midR, Math.sin(sideA1) * midR);
                ctx.lineTo(cosA * (r * 0.82), sinA * (r * 0.82));
                ctx.lineTo(Math.cos(sideA2) * midR, Math.sin(sideA2) * midR);
                ctx.closePath();
            }
            ctx.stroke();

            // Center hex jewel
            ctx.beginPath();
            for (let p = 0; p < 6; p++) {
                const a = (p * Math.PI) / 3;
                const hx = Math.cos(a) * (r * 0.18), hy = Math.sin(a) * (r * 0.18);
                if (p === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            if (hasFill) {
                ctx.fillStyle = withAlpha(accent || sColor, 'ee');
                ctx.fill();
            }
            ctx.stroke();
        } else if (morphology === 2) {
            // 2. Fernlike Pine Needle Crystal (Triple-Tiered Arbor)
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                ctx.moveTo(0, 0); ctx.lineTo(cosA * r, sinA * r);
                const tiers = [0.36, 0.58, 0.78];
                const bLens = [r * 0.32, r * 0.26, r * 0.18];
                for (let t = 0; t < 3; t++) {
                    const bx = cosA * (r * tiers[t]), by = sinA * (r * tiers[t]);
                    const bl = bLens[t];
                    for (const side of [-1, 1]) {
                        const ba = a + side * (Math.PI * 0.38);
                        ctx.moveTo(bx, by);
                        ctx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl);
                    }
                }
            }
            ctx.stroke();

            // Center 6-point starlet
            ctx.beginPath();
            for (let p = 0; p < 12; p++) {
                const a = (p * Math.PI) / 6;
                const rad = (p % 2 === 0) ? (r * 0.22) : (r * 0.11);
                const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
                if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();
        } else if (morphology === 3) {
            // 3. Jewel Rosette (Scalloped Lace Loops & Center Core)
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                ctx.moveTo(0, 0); ctx.lineTo(cosA * r, sinA * r);

                const baseDist = r * 0.25, peakDist = r * 0.75;
                const leftA = a - Math.PI / 6, rightA = a + Math.PI / 6;
                const loopW = r * 0.28;
                ctx.moveTo(cosA * baseDist, sinA * baseDist);
                quadTo(ctx, cosA * (r * 0.45) + Math.cos(leftA) * loopW, sinA * (r * 0.45) + Math.sin(leftA) * loopW, cosA * peakDist, sinA * peakDist);
                quadTo(ctx, cosA * (r * 0.45) + Math.cos(rightA) * loopW, sinA * (r * 0.45) + Math.sin(rightA) * loopW, cosA * baseDist, sinA * baseDist);
            }
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();

            // Outer finial points & center jewel
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                const p1x = Math.cos(a - Math.PI / 12) * (r * 0.85);
                const p1y = Math.sin(a - Math.PI / 12) * (r * 0.85);
                const p2x = Math.cos(a + Math.PI / 12) * (r * 0.85);
                const p2y = Math.sin(a + Math.PI / 12) * (r * 0.85);
                ctx.moveTo(p1x, p1y);
                ctx.lineTo(cosA * r, sinA * r);
                ctx.lineTo(p2x, p2y);
            }
            ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, 'ee');
                ctx.fill();
            }
            ctx.stroke();
        } else if (morphology === 4) {
            // 4. Scandinavian Double-Bar Cross Crystal
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                ctx.moveTo(0, 0); ctx.lineTo(cosA * r, sinA * r);

                // Perpendicular crossbar at 0.52 * r
                const cDist = r * 0.52, cLen = r * 0.22;
                const cx2 = cosA * cDist, cy2 = sinA * cDist;
                const perpA = a + Math.PI / 2;
                const perpCos = Math.cos(perpA), perpSin = Math.sin(perpA);
                ctx.moveTo(cx2 - perpCos * cLen, cy2 - perpSin * cLen);
                ctx.lineTo(cx2 + perpCos * cLen, cy2 + perpSin * cLen);
                for (const sign of [-1, 1]) {
                    const ex = cx2 + perpCos * (cLen * sign), ey = cy2 + perpSin * (cLen * sign);
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex + cosA * (r * 0.08), ey + sinA * (r * 0.08));
                }

                // Outer arrowhead
                const arrowBaseX = cosA * (r * 0.78), arrowBaseY = sinA * (r * 0.78);
                const aw = r * 0.16;
                ctx.moveTo(arrowBaseX - perpCos * aw, arrowBaseY - perpSin * aw);
                ctx.lineTo(cosA * r, sinA * r);
                ctx.lineTo(arrowBaseX + perpCos * aw, arrowBaseY + perpSin * aw);
                ctx.closePath();
            }
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();

            // Inner 12-sided faceted ring
            ctx.beginPath();
            for (let p = 0; p < 12; p++) {
                const a = (p * Math.PI) / 6;
                const rad = (p % 2 === 0) ? (r * 0.26) : (r * 0.14);
                const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
                if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        } else {
            // 5. Sleek Needle Flurry (Diamond Nodes & Satellite Pearls)
            ctx.beginPath();
            for (let arm = 0; arm < 6; arm++) {
                const a = (arm * Math.PI) / 3;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                ctx.moveTo(0, 0); ctx.lineTo(cosA * r, sinA * r);

                // Diamond node at 0.44 * r
                const nDist = r * 0.44, nw = r * 0.10, nh = r * 0.14;
                const nx = cosA * nDist, ny = sinA * nDist;
                const perpA = a + Math.PI / 2;
                const perpCos = Math.cos(perpA), perpSin = Math.sin(perpA);
                ctx.moveTo(nx - cosA * nh, ny - sinA * nh);
                ctx.lineTo(nx + perpCos * nw, ny + perpSin * nw);
                ctx.lineTo(nx + cosA * nh, ny + sinA * nh);
                ctx.lineTo(nx - perpCos * nw, ny - perpSin * nw);
                ctx.closePath();

                // Satellite pearl crystal at 0.88 * r
                const px = cosA * (r * 0.88), py = sinA * (r * 0.88);
                ctx.moveTo(px + r * 0.05, py);
                ctx.arc(px, py, r * 0.05, 0, Math.PI * 2);
            }
            if (hasFill) {
                ctx.fillStyle = withAlpha(sColor, fillHex);
                ctx.fill();
            }
            ctx.stroke();

            // Inner tiny hex hub
            ctx.beginPath();
            for (let p = 0; p < 6; p++) {
                const a = (p * Math.PI) / 3;
                const hx = Math.cos(a) * (r * 0.15), hy = Math.sin(a) * (r * 0.15);
                if (p === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawHeartMotif(ctx, cx, cy, r, hColor, hasFill, fillHex, lineW) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = lineW;
        ctx.strokeStyle = withAlpha(hColor, '98');

        ctx.beginPath();
        ctx.moveTo(0, r * 0.82);
        quadTo(ctx, -r * 1.15, r * 0.12, -r * 0.92, -r * 0.42);
        quadTo(ctx, -r * 0.65, -r * 0.95, 0, -r * 0.35);
        quadTo(ctx, r * 0.65, -r * 0.95, r * 0.92, -r * 0.42);
        quadTo(ctx, r * 1.15, r * 0.12, 0, r * 0.82);
        ctx.closePath();
        if (hasFill) {
            ctx.fillStyle = withAlpha(hColor, fillHex);
            ctx.fill();
        }
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Draws a procedural pattern onto any canvas context.
     * Shared across Promo Editor and Custom Overlay Editor.
     *
     * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context
     * @param {string} pattern - Pattern identifier (e.g. 'hexagons', 'leaves', 'christmas-lights')
     * @param {number} width - Canvas or tile width
     * @param {number} height - Canvas or tile height
     * @param {object} options - Scale, colors, animation, lineWidth and detail ('exact' bypasses dense sampling)
     */
    function drawProceduralPattern(ctx, pattern, width, height, options = {}) {
        if (!pattern || !ctx || !(width > 0) || !(height > 0)) return;

        const fullWidth = width, fullHeight = height;
        const scale = Math.max(0.05, (options.scale || 100) / 100);
        const isLoop = options.loop === true;
        const loopDuration = Number(options.loopDuration) > 0 ? Number(options.loopDuration) : 6;
        const rawTime = Number(options.time) || 0;
        const loopPosition = ((rawTime % loopDuration) + loopDuration) % loopDuration;
        const time = isLoop ? loopPosition : rawTime;
        const motion = options.motion || 'none';
        const rawSpeed = Number(options.speed) > 0 ? Number(options.speed) : 1;
        // Calibrate speed scale so 1x normal speed is calm, broadcast-ready and ambient (previously 1x was ~3x too fast, requiring 0.3)
        const SPEED_SCALE = 0.35;
        const speed = rawSpeed * SPEED_SCALE;
        const baseColor = options.color || options.background || '';
        const palette = options.palette || 'dual';
        const fillMode = options.fillMode || 'tinted';
        const rawFillOpacity = Number.isFinite(Number(options.fillOpacity))
            ? Number(options.fillOpacity)
            : (fillMode === 'solid' ? 100 : fillMode === 'outline' ? 0 : 30);
        const fillOp = fillMode === 'outline' ? 0 : (fillMode === 'solid' ? 1 : Math.max(0, Math.min(100, rawFillOpacity)) / 100);
        const hasFill = fillOp > 0;
        const fillHex = Math.max(0, Math.min(255, Math.round(fillOp * 255))).toString(16).padStart(2, '0');

        const accent = (options.accent && options.accent !== 'transparent') ? options.accent : '#58a6ff';
        const secondary = (options.secondary && options.secondary !== 'transparent')
            ? options.secondary
            : ((options.altColor && options.altColor !== 'transparent') ? options.altColor : accent);
        const customLineWidth = Number(options.lineWidth) || 0;

        // Two forward-moving snapshots crossfade only during the last fifth of a
        // promo loop. Arbitrary speeds and non-integer local rotations then meet
        // at the seam without making fall or spin reverse halfway through.
        if (isLoop && loopPosition > loopDuration * 0.8 && typeof document !== 'undefined') {
            try {
                const outgoing = loopOutgoingCanvas || (loopOutgoingCanvas = document.createElement('canvas'));
                const incoming = loopIncomingCanvas || (loopIncomingCanvas = document.createElement('canvas'));
                const canvasWidth = Math.ceil(fullWidth), canvasHeight = Math.ceil(fullHeight);
                if (outgoing.width !== canvasWidth || outgoing.height !== canvasHeight) {
                    outgoing.width = canvasWidth;
                    outgoing.height = canvasHeight;
                }
                if (incoming.width !== canvasWidth || incoming.height !== canvasHeight) {
                    incoming.width = canvasWidth;
                    incoming.height = canvasHeight;
                }
                const outCtx = outgoing.getContext('2d'), inCtx = incoming.getContext('2d');
                if (outCtx && inCtx) {
                    outCtx.setTransform(1, 0, 0, 1, 0, 0);
                    outCtx.globalAlpha = 1;
                    outCtx.globalCompositeOperation = 'source-over';
                    outCtx.clearRect(0, 0, canvasWidth, canvasHeight);
                    inCtx.setTransform(1, 0, 0, 1, 0, 0);
                    inCtx.globalAlpha = 1;
                    inCtx.globalCompositeOperation = 'source-over';
                    inCtx.clearRect(0, 0, canvasWidth, canvasHeight);
                    drawProceduralPattern(outCtx, pattern, width, height, { ...options, loop: false, _loopColorCentered: true, time });
                    drawProceduralPattern(inCtx, pattern, width, height, { ...options, loop: false, _loopColorCentered: true, time: time - loopDuration });
                    const u = (loopPosition / loopDuration - 0.8) / 0.2;
                    const blend = u * u * (3 - 2 * u);
                    outCtx.save();
                    outCtx.globalCompositeOperation = 'destination-in';
                    outCtx.fillStyle = `rgba(0,0,0,${1 - blend})`;
                    outCtx.fillRect(0, 0, fullWidth, fullHeight);
                    outCtx.globalCompositeOperation = 'lighter';
                    outCtx.globalAlpha = blend;
                    outCtx.drawImage(incoming, 0, 0);
                    outCtx.restore();
                    ctx.drawImage(outgoing, 0, 0);
                    return;
                }
            } catch {
                // Non-browser contexts continue to render without the raster crossfade.
                loopOutgoingCanvas = null;
                loopIncomingCanvas = null;
            }
        }

        // Base fill if specified
        if (baseColor && baseColor !== 'transparent') {
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, width, height);
        }

        // At tiny scales, repeat a centered sample at the requested scale. The
        // overlap crossfade joins edges without reversing the lattice direction.
        let tiled = false;
        const tileSize = Math.round(Math.max(192, Math.min(384, 384 * scale / 0.1)));
        const tilePatterns = ['dots', 'diamonds', 'hexagons', 'triangles', 'scales', 'circuit',
            'checker', 'chevrons', 'leaves', 'turkeys', 'pumpkins', 'christmas-trees',
            'christmas-lights', 'snowflakes', 'hearts', 'fireworks'];
        if (options.detail !== 'exact' && !options._patternViewport && scale <= 0.2 && fullWidth * fullHeight >= 768 * 768 &&
            tilePatterns.includes(pattern) && typeof document !== 'undefined' && typeof ctx.createPattern === 'function') {
            try {
                const tile = patternTileCanvas || (patternTileCanvas = document.createElement('canvas'));
                if (tile.width !== tileSize || tile.height !== tileSize) {
                    tile.width = tile.height = tileSize;
                }
                const tileCtx = tile.getContext('2d');
                if (tileCtx) {
                    tileCtx.clearRect(0, 0, tile.width, tile.height);
                    tileCtx.save();
                    tileCtx.beginPath(); tileCtx.rect(0, 0, tileSize, tileSize); tileCtx.clip();
                    tileCtx.translate((tileSize - fullWidth) / 2, (tileSize - fullHeight) / 2);
                    drawProceduralPattern(tileCtx, pattern, fullWidth, fullHeight, {
                        ...options, color: 'transparent', background: 'transparent',
                        _patternViewport: tileSize, _skipPatternEffects: true
                    });
                    tileCtx.restore();
                    const period = Math.round(tileSize * 0.75), overlap = tileSize - period;
                    const seam = patternSeamCanvas || (patternSeamCanvas = document.createElement('canvas'));
                    const blendCanvas = patternBlendCanvas || (patternBlendCanvas = document.createElement('canvas'));
                    seam.width = period; seam.height = tileSize;
                    blendCanvas.width = period; blendCanvas.height = tileSize;
                    const seamCtx = seam.getContext('2d'), blendCtx = blendCanvas.getContext('2d');
                    if (!seamCtx || !blendCtx) throw new Error('Canvas unavailable');
                    seamCtx.drawImage(tile, 0, 0);
                    let gradient = seamCtx.createLinearGradient(0, 0, overlap, 0);
                    gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, '#000');
                    seamCtx.globalCompositeOperation = 'destination-in';
                    seamCtx.fillStyle = gradient; seamCtx.fillRect(0, 0, period, tileSize);
                    blendCtx.drawImage(tile, period, 0, overlap, tileSize, 0, 0, overlap, tileSize);
                    gradient = blendCtx.createLinearGradient(0, 0, overlap, 0);
                    gradient.addColorStop(0, '#000'); gradient.addColorStop(1, 'transparent');
                    blendCtx.globalCompositeOperation = 'destination-in';
                    blendCtx.fillStyle = gradient; blendCtx.fillRect(0, 0, period, tileSize);
                    seamCtx.globalCompositeOperation = 'lighter';
                    seamCtx.drawImage(blendCanvas, 0, 0);

                    // Reuse the sample and blend canvases for the vertical join.
                    tile.width = tile.height = period;
                    blendCanvas.width = blendCanvas.height = period;
                    tileCtx.drawImage(seam, 0, 0);
                    gradient = tileCtx.createLinearGradient(0, 0, 0, overlap);
                    gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, '#000');
                    tileCtx.globalCompositeOperation = 'destination-in';
                    tileCtx.fillStyle = gradient; tileCtx.fillRect(0, 0, period, period);
                    blendCtx.drawImage(seam, 0, period, period, overlap, 0, 0, period, overlap);
                    gradient = blendCtx.createLinearGradient(0, 0, 0, overlap);
                    gradient.addColorStop(0, '#000'); gradient.addColorStop(1, 'transparent');
                    blendCtx.globalCompositeOperation = 'destination-in';
                    blendCtx.fillStyle = gradient; blendCtx.fillRect(0, 0, period, period);
                    tileCtx.globalCompositeOperation = 'lighter';
                    tileCtx.drawImage(blendCanvas, 0, 0);
                    const repeating = ctx.createPattern(tile, 'repeat');
                    if (repeating) {
                        ctx.save();
                        const tileX = (fullWidth - tileSize) / 2, tileY = (fullHeight - tileSize) / 2;
                        ctx.translate(tileX, tileY);
                        ctx.fillStyle = repeating;
                        ctx.fillRect(-tileX, -tileY, fullWidth, fullHeight);
                        ctx.restore();
                        tiled = true;
                    }
                }
            } catch {
                // Canvas-less and restricted contexts retain the exact renderer.
                patternTileCanvas = null;
                patternSeamCanvas = null;
                patternBlendCanvas = null;
            }
        }

        if (!tiled) {
        ctx.save();
        const phase = time * Math.PI / 3 * speed;
        // In-place animation (twinkles, pulsing, rotating, leaf flutter) decoupled from overall canvas movement
        const inPlace = options.inPlace ?? (motion !== 'none' ? 'auto' : 'none');
        const hasInPlaceAnim = inPlace !== 'none' && inPlace !== false && inPlace !== 0;
        const inPlaceMult = inPlace === 'sparkle' ? 2.6 : (inPlace === 'pulse' ? 1.8 : (inPlace === 'gentle' ? 0.6 : 1.0));
        const inPlaceSpeed = Number(options.inPlaceSpeed) > 0 ? Number(options.inPlaceSpeed) : 1.0;
        const inPlacePhase = hasInPlaceAnim ? (time * speed * inPlaceMult * inPlaceSpeed) : 0;

        // Size variance and organic scatter (lessons from Pattern Tile)
        const sizeVarAmount = Math.max(0, Math.min(1, (Number(options.sizeVariance ?? options.scaleJitter) || 0) / 100));
        const scatterAmount = Math.max(0, Math.min(1, (Number(options.scatter ?? options.positionJitter) || 0) / 100));
        const rotVarAmount = Math.max(0, Math.min(1, (Number(options.rotationVariance ?? options.rotationJitter) || 0) / 100));

        // Dedicated element spin & rotation control (decoupled from twinkle/pulse)
        const spinMode = options.spin !== undefined ? options.spin : (hasInPlaceAnim ? 'auto' : 'none');
        const rawSpinSpeed = Number(options.spinSpeed) > 0 ? Number(options.spinSpeed) : 1;
        const spinSpeed = rawSpinSpeed * SPEED_SCALE;
        const hasSpin = spinMode !== 'none';
        let continuousSpinAngle = 0;
        if (hasSpin) {
            if (spinMode === 'reverse') {
                continuousSpinAngle = -time * Math.PI * 0.8 * spinSpeed;
            } else if (spinMode === 'sway') {
                continuousSpinAngle = Math.sin(time * Math.PI * 0.6 * spinSpeed) * 0.28;
            } else {
                // 'auto' or 'spin'
                continuousSpinAngle = time * Math.PI * 0.8 * spinSpeed;
            }
        }

        const pulse = motion === 'pulse' ? (1 - Math.cos(phase)) / 2 : 0;

        // Pattern scale around canvas center so changing scale zooms smoothly without scrambling coordinates
        ctx.translate(fullWidth / 2, fullHeight / 2);
        ctx.scale(scale, scale);
        width = fullWidth / scale;
        height = fullHeight / scale;
        ctx.translate(-width / 2, -height / 2);

        let motionTransX = 0;
        let motionTransY = 0;

        if (motion === 'drift') {
            motionTransX = Math.sin(phase) * width * 0.05;
            motionTransY = Math.cos(phase) * height * 0.05;
            ctx.translate(motionTransX, motionTransY);
        } else if (motion === 'sway') {
            ctx.translate(width / 2, height / 2);
            ctx.rotate(Math.sin(phase) * 0.1);
            ctx.scale(1.12 + Math.cos(phase) * 0.05, 1.12 + Math.cos(phase) * 0.05);
            ctx.translate(-width / 2, -height / 2);
        } else if (motion === 'orbit') {
            const r = Math.min(width, height) * 0.04;
            motionTransX = Math.cos(phase) * r;
            motionTransY = Math.sin(phase) * r;
            ctx.translate(motionTransX, motionTransY);
            ctx.translate(width / 2, height / 2);
            ctx.rotate(Math.sin(phase * 2) * 0.04);
            ctx.translate(-width / 2, -height / 2);
        } else if (motion === 'pulse') {
            const zoom = 1 + pulse * 0.04;
            ctx.translate(width / 2, height / 2);
            ctx.scale(zoom, zoom);
            ctx.translate(-width / 2, -height / 2);
            ctx.globalAlpha = 0.65 + 0.35 * pulse;
        } else if (motion === 'pan') {
            const panAngleRaw = Number.isFinite(Number(options.panAngle)) ? Number(options.panAngle) : (Number.isFinite(Number(options.angle)) ? Number(options.angle) : 45);
            const panAngleRad = (panAngleRaw - 90) * Math.PI / 180;
            const panMode = options.panDirection === 'oscillate' ? 'oscillate' : 'continuous';
            if (panMode === 'oscillate') {
                const u = Math.sin(time / 6 * speed * Math.PI * 2);
                const mx = width * 0.16, my = height * 0.16;
                motionTransX = Math.cos(panAngleRad) * mx * u;
                motionTransY = Math.sin(panAngleRad) * my * u;
            } else {
                // Continuous single-direction glide: linear velocity without bounds clipping or wrapping jumps
                const panVelocity = fullHeight * 0.055 * speed;
                const panDist = time * panVelocity;
                motionTransX = Math.cos(panAngleRad) * panDist;
                motionTransY = Math.sin(panAngleRad) * panDist;
            }
            ctx.translate(motionTransX, motionTransY);
        }

        // Dynamic overscan bounds that automatically expand to cover the canvas viewport
        // regardless of pan distance or canvas translation, with zero blank edges or seams
        const viewport = options._patternViewport;
        const viewW = viewport ? viewport / scale : width;
        const viewH = viewport ? viewport / scale : height;
        const padX = Math.max(80, viewW * (viewport ? 0.2 : 0.06));
        const padY = Math.max(80, viewH * (viewport ? 0.2 : 0.06));
        const minX = (width - viewW) / 2 - padX - motionTransX;
        const maxX = (width + viewW) / 2 + padX - motionTransX;
        const minY = (height - viewH) / 2 - padY - motionTransY;
        const maxY = (height + viewH) / 2 + padY - motionTransY;

        // Helper for consistent stroke width across all patterns and scales
        const getLineW = (mult = 1) => (customLineWidth > 0 ? customLineWidth : Math.max(1.2, (fullWidth / 700) * mult)) / scale;
        // Quantize in stamp space, with finer buckets when enlarged so the
        // on-screen error remains below 1/16px. Draw extreme widths directly.
        const stampLineW = (lineW, radius, referenceRadius) => {
            const enlargement = Math.max(1, radius * scale / referenceRadius);
            const quantum = 0.125 / Math.pow(2, Math.ceil(Math.log2(enlargement)));
            return Math.max(quantum, Math.round(lineW * referenceRadius / radius / quantum) * quantum);
        };

        // Continuous, non-jumping vertical displacement for 'fall' motion.
        // Promo loops use the periodic clock above.
        // For overlay editor and live overlays, time is linear and continuous with ZERO periodic jump!
        const fallVelocity = fullHeight * 0.055 * speed;
        const fallDy = motion === 'fall'
            ? time * fallVelocity
            : 0;
        const fallSwayX = motion === 'fall' ? Math.sin(phase * 0.8) * (fullWidth * 0.018) : 0;

        ctx.strokeStyle = withAlpha(accent, options.accentAlpha || '55');
        ctx.lineWidth = getLineW(1);

        const colorMode = options.colorMode || 'mosaic';
        const colorAnim = options.colorAnim || 'none';
        const colorSpeed = Number(options.colorSpeed) > 0 ? Number(options.colorSpeed) : 1;
        const colorShift = colorAnim === 'cycle'
            ? time * 1.8 * colorSpeed
            : (colorAnim === 'breathe' ? Math.sin(time * 1.8 * colorSpeed) * 2.2 : 0);

        function getCellColorIndex(row, col, cellX, cellY, extraIdx = 0) {
            let base = 0;
            // Screen-relative center coordinates accounting for canvas motion translation
            const cxScreen = (width * 0.5) - motionTransX;
            const cyScreen = (height * 0.5) - motionTransY;
            if (colorMode === 'rows') {
                base = row;
            } else if (colorMode === 'columns') {
                base = col;
            } else if (colorMode === 'diagonal') {
                base = row + col;
            } else if (colorMode === 'checker') {
                base = (row + col) & 1;
            } else if (colorMode === 'radial') {
                const dx = (cellX ?? 0) - cxScreen;
                const dy = (cellY ?? 0) - cyScreen;
                const dist = Math.hypot(dx, dy);
                const ringStep = Math.max(20, fullWidth / 20);
                base = Math.floor(dist / ringStep);
            } else if (colorMode === 'spiral') {
                const dx = (cellX ?? 0) - cxScreen;
                const dy = (cellY ?? 0) - cyScreen;
                const dist = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);
                const ringStep = Math.max(24, fullWidth / 18);
                const normAngle = (angle + Math.PI) / (Math.PI * 2);
                base = Math.floor((dist / ringStep) * 2 + normAngle * 4);
            } else {
                // 'mosaic' / default: integer hash distributes palette tones organically without diagonal striping or monochromatic blocking
                let h = (row * 374761393 + col * 668265263 + extraIdx * 1274126177) ^ 0x5bf03635;
                h = Math.imul(h ^ (h >>> 13), 1274126177);
                base = ((h ^ (h >>> 16)) >>> 0) % 997;
            }
            const centeredLoopColor = (isLoop || options._loopColorCentered) && colorAnim !== 'none' ? 0.5 : 0;
            return Math.floor(base + colorShift + centeredLoopColor + (extraIdx && colorMode !== 'mosaic' ? extraIdx : 0));
        }

        if (pattern === 'grid') {
            const step = Math.max(3, fullWidth / 32);
            const x0 = Math.floor(minX / step) * step;
            const yStart = Math.floor((minY - fallDy) / step) - 1;
            const yEnd = Math.ceil((maxY - fallDy) / step) + 1;
            const gridPulse = hasInPlaceAnim ? (0.70 + 0.30 * Math.sin(inPlacePhase * 1.5)) : 1;
            const alphaVal = Math.max(10, Math.min(255, Math.round(Number.parseInt(options.accentAlpha || '55', 16) * gridPulse))).toString(16).padStart(2, '0');

            for (let x = x0; x <= maxX; x += step) {
                const col = Math.round(x / step);
                const cIdx = getCellColorIndex(0, col, x, height * 0.5);
                const colColor = getPatternColor(palette, cIdx, accent, secondary);
                ctx.strokeStyle = withAlpha(colColor, alphaVal);
                ctx.beginPath();
                ctx.moveTo(x + fallSwayX, minY);
                ctx.lineTo(x + fallSwayX, maxY);
                ctx.stroke();
            }
            for (let yi = yStart; yi <= yEnd; yi++) {
                const cy = yi * step + fallDy;
                const cIdx = getCellColorIndex(yi, 0, width * 0.5, cy);
                const rowColor = getPatternColor(palette, cIdx, accent, secondary);
                ctx.strokeStyle = withAlpha(rowColor, alphaVal);
                ctx.beginPath();
                ctx.moveTo(minX, cy);
                ctx.lineTo(maxX, cy);
                ctx.stroke();
            }
            const accentCIdx = getCellColorIndex(0, 0, width * 0.92, height * 0.12);
            ctx.fillStyle = withAlpha(getPatternColor(palette, accentCIdx, accent, secondary), Math.max(10, Math.min(255, Math.round(255 * gridPulse))).toString(16).padStart(2, '0'));
            ctx.fillRect(width * 0.92, height * 0.12, width * 0.012, height * 0.28);
        } else if (pattern === 'hexagons') {
            const baseRadius = Math.max(3, fullWidth / 28), rowStep = Math.sqrt(3) * baseRadius;
            const columnStep = baseRadius * 1.5;
            ctx.lineWidth = getLineW(1);
            const cStart = Math.floor(minX / columnStep) - 2, cEnd = Math.ceil(maxX / columnStep) + 2;
            const rStart = Math.floor((minY - fallDy) / rowStep) - 2, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 2;
            for (let col = cStart; col <= cEnd; col++) {
                for (let row = rStart; row <= rEnd; row++) {
                    const idx = Math.abs(col * 19 + row * 23);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.4) + sizeHash * (sizeVarAmount * 0.8);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * columnStep * 0.55) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * rowStep * 0.55) * scatterAmount;
                    const cellPulse = hasInPlaceAnim ? (0.80 + 0.20 * Math.sin(inPlacePhase * 1.6 + idx * 0.7)) : 1;
                    const radius = baseRadius * sizeMult;

                    const cx = col * columnStep + scatterX + fallSwayX;
                    const cy = row * rowStep + (((col % 2) + 2) % 2) * rowStep / 2 + scatterY + fallDy;
                    const cIdx = getCellColorIndex(row, col, cx, cy);
                    const color = getPatternColor(palette, cIdx, accent, secondary);
                    ctx.beginPath();
                    for (let point = 0; point < 6; point++) {
                        const angle = point * Math.PI / 3, x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
                        if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    if (hasFill) {
                        const baseFillVal = Number.parseInt(fillHex, 16);
                        const fillAlphaVal = hasInPlaceAnim ? Math.max(10, Math.min(255, Math.round(baseFillVal * cellPulse))) : baseFillVal;
                        ctx.fillStyle = withAlpha(color, fillAlphaVal.toString(16).padStart(2, '0'));
                        ctx.fill();
                    }
                    const strokeAlpha = hasInPlaceAnim ? Math.max(30, Math.min(255, Math.round(0x95 * cellPulse))).toString(16).padStart(2, '0') : '95';
                    ctx.strokeStyle = withAlpha(color, strokeAlpha);
                    ctx.stroke();
                }
            }
        } else if (pattern === 'diamonds') {
            const step = Math.max(4, fullWidth / 18), baseRadius = step * 0.46;
            ctx.lineWidth = getLineW(1);
            const yStart = Math.floor((minY - fallDy) / step) - 2;
            const yEnd = Math.ceil((maxY - fallDy) / step) + 2;
            const x0 = Math.floor(minX / step) * step;
            for (let yi = yStart; yi <= yEnd; yi++) {
                const cy = yi * step + fallDy;
                for (let x = x0; x <= maxX + step; x += step) {
                    const col = Math.round(x / step);
                    const idx = Math.abs(yi * 31 + col * 19);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * step * 0.55) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * step * 0.55) * scatterAmount;
                    const breathe = hasInPlaceAnim ? (0.80 + 0.20 * Math.sin(inPlacePhase * 1.8 + idx)) : 1;
                    const radius = baseRadius * sizeMult;
                    const cx = x + scatterX + fallSwayX;
                    const finalCy = cy + scatterY;
                    const cIdx = getCellColorIndex(yi, col, cx, finalCy);
                    const color = getPatternColor(palette, cIdx, accent, secondary);

                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                    const diamondSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx) * 0.15 : continuousSpinAngle * ((idx & 1) ? 1 : -1) * 0.5) : 0;
                    const rot = randomAngle + diamondSpin;

                    ctx.save();
                    ctx.translate(cx, finalCy);
                    if (rot !== 0) ctx.rotate(rot);
                    ctx.beginPath();
                    ctx.moveTo(0, -radius); ctx.lineTo(radius, 0); ctx.lineTo(0, radius); ctx.lineTo(-radius, 0); ctx.closePath();
                    if (hasFill) {
                        const baseFillVal = Number.parseInt(fillHex, 16);
                        const fillAlphaVal = hasInPlaceAnim ? Math.max(10, Math.min(255, Math.round(baseFillVal * breathe))) : baseFillVal;
                        ctx.fillStyle = withAlpha(color, fillAlphaVal.toString(16).padStart(2, '0'));
                        ctx.fill();
                    }
                    const strokeAlpha = hasInPlaceAnim ? Math.max(30, Math.min(255, Math.round(0x95 * breathe))).toString(16).padStart(2, '0') : '95';
                    ctx.strokeStyle = withAlpha(color, strokeAlpha);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        } else if (pattern === 'isometric') {
            const edge = Math.max(1, fullWidth / 20), half = edge * Math.sqrt(3) / 2, slope = Math.tan(Math.PI / 6);
            const isoPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(inPlacePhase * 1.4)) : 1;
            const alphaHex = Math.max(15, Math.min(255, Math.round(0x85 * isoPulse))).toString(16).padStart(2, '0');
            ctx.lineWidth = getLineW(1);
            const x0 = Math.floor(minX / half) * half;
            for (let x = x0; x <= maxX + half; x += half) {
                const col = Math.round(x / half);
                const cIdx = getCellColorIndex(0, col, x, height * 0.5);
                const colColor = getPatternColor(palette, cIdx, accent, secondary);
                ctx.strokeStyle = withAlpha(colColor, alphaHex);
                ctx.beginPath();
                ctx.moveTo(x, minY);
                ctx.lineTo(x, maxY);
                ctx.stroke();
            }
            const spanW = maxX - minX;
            const cStart = Math.floor((minY - spanW * slope - edge - fallDy) / edge) * edge;
            const cEnd = maxY + spanW * slope + edge;
            for (let c = cStart; c <= cEnd; c += edge) {
                const cy = c + fallDy;
                const row = Math.round(c / edge);
                const cIdx = getCellColorIndex(row, 0, width * 0.5, cy);
                const rowColor = getPatternColor(palette, cIdx, accent, secondary);
                ctx.strokeStyle = withAlpha(rowColor, alphaHex);
                ctx.beginPath();
                ctx.moveTo(minX, cy); ctx.lineTo(maxX, cy + spanW * slope);
                ctx.moveTo(minX, cy + spanW * slope); ctx.lineTo(maxX, cy);
                ctx.stroke();
            }
        } else if (pattern === 'mesh') {
            const rows = 14, columns = 20, baseAmp = Math.max(1, fullWidth / 60);
            const spanW = maxX - minX, spanH = maxY - minY;
            const rowStep = spanH / rows;
            const rStart = Math.floor((minY - fallDy) / rowStep) - 2;
            const rEnd = Math.ceil((maxY - fallDy) / rowStep) + 2;
            const meshPhase = (hasInPlaceAnim ? (inPlacePhase * 1.5) : 0) + (motion !== 'none' ? (time * 1.2 * speed) : 0);
            ctx.lineWidth = getLineW(0.9);
            for (let row = rStart; row <= rEnd; row++) {
                const cy = row * rowStep + fallDy;
                const cIdx = getCellColorIndex(row, 0, width * 0.5, cy);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                const rowPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(meshPhase + row * 0.5)) : 1;
                const amplitude = baseAmp * (hasInPlaceAnim ? (0.85 + 0.15 * Math.sin(meshPhase + row * 0.5)) : 1);
                ctx.strokeStyle = withAlpha(color, Math.max(20, Math.min(255, Math.round(0x75 * rowPulse))).toString(16).padStart(2, '0'));
                ctx.beginPath();
                for (let column = 0; column <= columns * 6; column++) {
                    const x = minX + column * spanW / (columns * 6);
                    const y = cy + Math.sin((x - minX) / spanW * Math.PI * 4 + row * 0.45 + meshPhase) * amplitude;
                    if (!column) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            for (let column = -1; column <= columns + 1; column++) {
                const cx = minX + column * spanW / columns;
                const cIdx = getCellColorIndex(0, column, cx, height * 0.5);
                const color = getPatternColor(palette, cIdx, secondary, accent);
                const colPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.cos(meshPhase + column * 0.5)) : 1;
                const amplitude = baseAmp * (hasInPlaceAnim ? (0.85 + 0.15 * Math.cos(meshPhase + column * 0.5)) : 1);
                ctx.strokeStyle = withAlpha(color, Math.max(20, Math.min(255, Math.round(0x75 * colPulse))).toString(16).padStart(2, '0'));
                ctx.beginPath();
                for (let row = 0; row <= rows * 6; row++) {
                    const y = minY + row * spanH / (rows * 6);
                    const x = cx + fallSwayX + Math.sin((y - minY) / spanH * Math.PI * 3 + column * 0.5 + meshPhase) * amplitude;
                    if (!row) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'sunburst') {
            const cx = width * 0.5, cy = height * 0.5, radius = Math.hypot(maxX - minX, maxY - minY);
            const rays = Math.max(4, Math.min(180, Math.round(Number(options.density ?? options.rays) || 28)));
            const rotOffset = motion === 'fall' ? time * speed * 0.35 : 0;
            const sunRot = hasSpin ? (continuousSpinAngle * 0.2) : (hasInPlaceAnim ? (inPlacePhase * 0.15) : 0);
            ctx.lineWidth = getLineW(1);
            for (let i = 0; i < rays; i++) {
                const angle = i * Math.PI * 2 / rays + rotOffset + sunRot;
                const midX = cx + Math.cos(angle) * (radius * 0.4);
                const midY = cy + Math.sin(angle) * (radius * 0.4);
                const cIdx = getCellColorIndex(i, 0, midX, midY, i);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                const rayPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(inPlacePhase * 1.8 + i * 0.6)) : 1;
                const alphaHex = Math.max(20, Math.min(255, Math.round(0x85 * rayPulse))).toString(16).padStart(2, '0');
                ctx.strokeStyle = withAlpha(color, alphaHex);
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
            }
        } else if (pattern === 'dots') {
            const step = Math.max(3, fullWidth / 24), baseRadius = Math.max(1.2, fullWidth / 300);
            const yStart = Math.floor((minY - fallDy) / step) - 2;
            const yEnd = Math.ceil((maxY - fallDy) / step) + 2;
            const x0 = Math.floor(minX / step) * step + step / 2;
            for (let yi = yStart; yi <= yEnd; yi++) {
                const cy = yi * step + fallDy;
                for (let x = x0; x <= maxX + step; x += step) {
                    const col = Math.round(x / step);
                    const idx = Math.abs(yi * 29 + col * 17);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * step * 0.55) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * step * 0.55) * scatterAmount;
                    const twinkle = hasInPlaceAnim ? (0.70 + 0.30 * Math.sin(inPlacePhase * 2 + idx * 1.5)) : 1;
                    const dotR = baseRadius * (hasFill ? (0.8 + fillOp * 0.5) : 1) * sizeMult;
                    const cx = x + scatterX + fallSwayX;
                    const finalCy = cy + scatterY;
                    const cIdx = getCellColorIndex(yi, col, cx, finalCy);
                    const color = getPatternColor(palette, cIdx, accent, secondary);
                    const baseFillVal = hasFill ? Number.parseInt(fillHex, 16) : 0x85;
                    const alphaVal = hasInPlaceAnim ? Math.max(15, Math.min(255, Math.round(baseFillVal * twinkle))) : baseFillVal;
                    ctx.fillStyle = withAlpha(color, alphaVal.toString(16).padStart(2, '0'));
                    ctx.beginPath(); ctx.arc(cx, finalCy, Math.max(0.5, dotR), 0, Math.PI * 2); ctx.fill();
                }
            }
        } else if (pattern === 'starfield' || pattern === 'sparkles') {
            const defaultCount = pattern === 'starfield' ? 600 : 100;
            const count = Math.max(6, Math.min(8000, Math.round(Number(options.density ?? options.count) || defaultCount)));
            const wrapW = Math.max(fullWidth * 2.5, width * 1.5);
            const wrapH = Math.max(fullHeight * 2.5, height * 1.5);

            for (let i = 0; i < count; i++) {
                const u = hash2D(i, 1);
                const v = hash2D(i, 2);
                const sizeHash = hash2D(i, 3);
                const sizeVarMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                const scatterX = (hash2D(i, 5) - 0.5) * (fullWidth * 0.35) * scatterAmount;
                const scatterY = (hash2D(i, 6) - 0.5) * (fullHeight * 0.35) * scatterAmount;

                const rawX = (u - 0.5) * wrapW;
                const rawY = (v - 0.5) * wrapH;
                const screenX = ((((rawX + scatterX + fallSwayX * (0.6 + (i % 3) * 0.3) + motionTransX + wrapW * 1000) % wrapW)) - wrapW * 0.5) + width * 0.5;
                const screenY = ((((rawY + scatterY + fallDy + motionTransY + wrapH * 1000) % wrapH)) - wrapH * 0.5) + height * 0.5;
                const x = screenX - motionTransX;
                const y = screenY - motionTransY;

                const twinkleMult = hasInPlaceAnim ? (0.65 + 0.35 * Math.sin(inPlacePhase * 1.5 + i * 1.7)) : 1;
                const tier = hash2D(i, 8);
                const mag = tier > 0.90 ? 2.0 : (tier > 0.70 ? 1.3 : 0.75);
                const baseSize = Math.max(0.8, (fullWidth / (pattern === 'starfield' ? 460 : 250))) * (sizeVarAmount > 0 ? mag * (1 + (i % 3) * 0.25) * sizeVarMult : (tier > 0.92 ? 1.5 : (tier > 0.75 ? 1.15 : 0.85)));
                const size = baseSize / Math.pow(scale, 0.45);
                const cIdx = getCellColorIndex(0, 0, screenX, screenY, i);
                const pColor = getPatternColor(palette, cIdx, accent, secondary);
                const baseAlphaVal = hasFill ? Number.parseInt(fillHex, 16) : (tier > 0.7 ? 0xcc : 0x75);
                const starAlphaVal = hasInPlaceAnim ? Math.max(20, Math.min(255, Math.round(baseAlphaVal * twinkleMult))) : baseAlphaVal;
                ctx.fillStyle = withAlpha(pColor, starAlphaVal.toString(16).padStart(2, '0'));

                if (pattern === 'starfield' && tier <= 0.88) {
                    ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, Math.PI * 2); ctx.fill();
                } else {
                    const randomAngle = ((((i * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                    const starSpin = (pattern === 'sparkles' && hasSpin)
                        ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + i) * 0.35 : continuousSpinAngle * ((i & 1) ? 1 : -0.7))
                        : 0;
                    ctx.save();
                    ctx.translate(x, y);
                    if (randomAngle !== 0 || starSpin !== 0) ctx.rotate(randomAngle + starSpin);
                    drawFourPointStar(ctx, 0, 0, size * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        } else if (pattern === 'checker') {
            const step = Math.max(4, fullWidth / 18);
            const rStart = Math.floor((minY - fallDy) / step) - 2, rEnd = Math.ceil((maxY - fallDy) / step) + 2;
            const cStart = Math.floor(minX / step) - 2, cEnd = Math.ceil(maxX / step) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                const y = row * step + fallDy;
                for (let col = cStart; col <= cEnd; col++) {
                    if ((((row + col) % 2 + 2) % 2) === 0) {
                        const checkPulse = hasInPlaceAnim ? (0.72 + 0.28 * Math.sin(inPlacePhase * 1.6 + (row + col) * 0.5)) : 1;
                        const checkX = col * step + fallSwayX + step / 2;
                        const checkY = y + step / 2;
                        const cIdx = getCellColorIndex(row, col, checkX, checkY);
                        const color = getPatternColor(palette, cIdx, accent, secondary);
                        const rawHex = hasFill ? fillHex : '28';
                        const checkHex = Math.max(10, Math.min(255, Math.round(Number.parseInt(rawHex, 16) * checkPulse))).toString(16).padStart(2, '0');
                        ctx.fillStyle = withAlpha(color, checkHex);
                        ctx.fillRect(col * step + fallSwayX, y, step, step);
                    }
                }
            }
        } else if (pattern === 'waves') {
            const rowStep = Math.max(4, fullHeight / 18), baseAmp = Math.max(1, fullWidth / 100), wavelength = Math.max(8, fullWidth / 8);
            const wavePhase = (hasInPlaceAnim ? (inPlacePhase * 1.6) : 0) + (motion !== 'none' ? (time * 1.5 * speed) : 0);
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 1, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 1;
            const xStep = Math.max(2, fullWidth / 160);
            for (let row = rStart; row <= rEnd; row++) {
                const baseY = row * rowStep + fallDy;
                const cIdx = getCellColorIndex(row, 0, width * 0.5, baseY);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                const swell = hasInPlaceAnim ? (0.85 + 0.25 * Math.sin(inPlacePhase * 0.8 + row * 0.6)) : 1;
                const amplitude = baseAmp * swell;
                const alphaHex = hasInPlaceAnim ? Math.max(25, Math.min(255, Math.round(0x85 * swell))).toString(16).padStart(2, '0') : '85';
                ctx.strokeStyle = withAlpha(color, alphaHex);
                ctx.beginPath();
                for (let x = minX; x <= maxX; x += xStep) {
                    const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + row * 0.45 + wavePhase) * amplitude;
                    if (x === minX) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'rings') {
            const cx = width * 0.5 - motionTransX, cy = height * 0.5 - motionTransY, step = Math.max(3, fullWidth / 36);
            const rippleDistance = (hasInPlaceAnim ? (inPlacePhase * 20) : (motion !== 'none' ? (time * 20 * speed) : 0));
            const continuousCycle = rippleDistance / step;
            const baseCycle = Math.floor(continuousCycle);
            const rPhase = (continuousCycle - baseCycle) * step;
            ctx.lineWidth = getLineW(1.3);
            const maxR = Math.hypot(maxX - minX, maxY - minY);
            const numRings = Math.ceil(maxR / step) + 2;
            for (let i = 0; i <= numRings; i++) {
                const radius = rPhase + i * step;
                if (radius <= 0) continue;
                // Persistent ring identity: ringId remains constant throughout each ring's expansion lifetime
                const ringId = Math.abs(baseCycle - i);
                const cIdx = getCellColorIndex(ringId, 0, cx + radius, cy, ringId);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                const centerFade = Math.min(1, radius / step);
                const edgeFade = Math.min(1, Math.max(0, (maxR - radius) / (step * 2)));
                const ringPulse = hasInPlaceAnim ? (0.78 + 0.22 * Math.sin(inPlacePhase * 1.2 + ringId * 0.5)) : 1;
                const alphaVal = Math.round(0x85 * ringPulse * centerFade * edgeFade);
                if (alphaVal <= 2) continue;
                const alphaHex = Math.max(0, Math.min(255, alphaVal)).toString(16).padStart(2, '0');
                ctx.strokeStyle = withAlpha(color, alphaHex);
                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (pattern === 'scales') {
            const step = Math.max(3, fullWidth / 24), rowStep = step * 0.5;
            ctx.lineWidth = getLineW(1);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 2, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 2;
            const x0 = Math.floor(minX / step) * step;
            for (let row = rStart; row <= rEnd; row++) {
                const offset = (((row % 2) + 2) % 2) * step / 2, y = row * rowStep + fallDy;
                for (let x = x0; x <= maxX + step; x += step) {
                    const col = Math.round(x / step);
                    const idx = Math.abs(row * 17 + col * 23);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.4) + sizeHash * (sizeVarAmount * 0.8);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * step * 0.45) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * rowStep * 0.45) * scatterAmount;
                    const breathe = hasInPlaceAnim ? (0.85 + 0.15 * Math.sin(inPlacePhase * 1.5 + idx * 0.6)) : 1;
                    const arcR = (step / 2) * sizeMult;
                    const scaleCenterX = x + offset + scatterX + fallSwayX;
                    const scaleCenterY = y + scatterY;
                    const cIdx = getCellColorIndex(row, col, scaleCenterX, scaleCenterY);
                    const color = getPatternColor(palette, cIdx, accent, secondary);
                    ctx.beginPath(); ctx.arc(scaleCenterX, scaleCenterY, Math.max(1, arcR), 0, Math.PI);
                    if (hasFill) {
                        const baseFillVal = Number.parseInt(fillHex, 16);
                        const fillAlphaVal = hasInPlaceAnim ? Math.max(10, Math.min(255, Math.round(baseFillVal * breathe))) : baseFillVal;
                        ctx.fillStyle = withAlpha(color, fillAlphaVal.toString(16).padStart(2, '0'));
                        ctx.fill();
                    }
                    const strokeAlpha = hasInPlaceAnim ? Math.max(25, Math.min(255, Math.round(0x95 * breathe))).toString(16).padStart(2, '0') : '95';
                    ctx.strokeStyle = withAlpha(color, strokeAlpha);
                    ctx.stroke();
                }
            }
        } else if (pattern === 'triangles') {
            const baseSize = Math.max(4, fullWidth / 20), rowStep = baseSize * Math.sqrt(3) / 2;
            ctx.lineWidth = getLineW(1);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 2, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 2;
            const cStart = Math.floor(minX / baseSize) - 2, cEnd = Math.ceil(maxX / baseSize) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 19 + col * 29);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.35) + sizeHash * (sizeVarAmount * 0.7);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * baseSize * 0.45) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * rowStep * 0.45) * scatterAmount;
                    const triPulse1 = hasInPlaceAnim ? (0.84 + 0.16 * Math.sin(inPlacePhase * 1.6 + idx)) : 1;
                    const triPulse2 = hasInPlaceAnim ? (0.84 + 0.16 * Math.cos(inPlacePhase * 1.6 + idx)) : 1;

                    const x = col * baseSize + (((row % 2) + 2) % 2) * baseSize / 2 + scatterX + fallSwayX, y = row * rowStep + scatterY + fallDy;
                    const size = baseSize * sizeMult;
                    const cIdx1 = getCellColorIndex(row, col, x + size * 0.5, y + rowStep * 0.5, 0);
                    const cIdx2 = getCellColorIndex(row, col, x + size, y + rowStep * 0.5, 1);
                    const color1 = getPatternColor(palette, cIdx1, accent, secondary);
                    const color2 = getPatternColor(palette, cIdx2, accent, secondary);
                    const baseFillVal = Number.parseInt(fillHex, 16);

                    ctx.beginPath();
                    ctx.moveTo(x, y + rowStep); ctx.lineTo(x + size / 2, y); ctx.lineTo(x + size, y + rowStep);
                    ctx.closePath();
                    if (hasFill) {
                        const fillAlpha1 = hasInPlaceAnim ? Math.max(10, Math.min(255, Math.round(baseFillVal * triPulse1))) : baseFillVal;
                        ctx.fillStyle = withAlpha(color1, fillAlpha1.toString(16).padStart(2, '0'));
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color1, hasInPlaceAnim ? Math.max(30, Math.min(255, Math.round(0x95 * triPulse1))).toString(16).padStart(2, '0') : '95');
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size, y + rowStep); ctx.lineTo(x + size * 1.5, y);
                    ctx.closePath();
                    if (hasFill) {
                        const fillAlpha2 = hasInPlaceAnim ? Math.max(10, Math.min(255, Math.round(baseFillVal * triPulse2))) : baseFillVal;
                        ctx.fillStyle = withAlpha(color2, fillAlpha2.toString(16).padStart(2, '0'));
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color2, hasInPlaceAnim ? Math.max(30, Math.min(255, Math.round(0x95 * triPulse2))).toString(16).padStart(2, '0') : '95');
                    ctx.stroke();
                }
            }
        } else if (pattern === 'chevrons') {
            const step = Math.max(4, fullWidth / 22), rowStep = step * 0.65;
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 1, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 1;
            const x0 = Math.floor(minX / step) * step;
            for (let row = rStart; row <= rEnd; row++) {
                const cy = row * rowStep + fallDy;
                const cIdx = getCellColorIndex(row, 0, width * 0.5, cy);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                const chevPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(inPlacePhase * 1.8 + row * 0.5)) : 1;
                ctx.strokeStyle = withAlpha(color, Math.max(25, Math.min(255, Math.round(0x85 * chevPulse))).toString(16).padStart(2, '0'));
                ctx.beginPath();
                for (let x = x0; x <= maxX + step; x += step) {
                    const cx = x + fallSwayX;
                    ctx.moveTo(cx, cy); ctx.lineTo(cx + step / 2, cy + rowStep / 2); ctx.lineTo(cx + step, cy);
                }
                ctx.stroke();
            }
        } else if (pattern === 'topography') {
            const centers = [[0.2, 0.25], [0.76, 0.32], [0.49, 0.82], [-0.05, 0.78], [1.05, 0.72]];
            const step = Math.max(2, fullWidth / 54);
            ctx.lineWidth = getLineW(0.95);
            let cIdx = 0;
            for (const [cxRatio, cyRatio] of centers) {
                const cx = width * cxRatio - motionTransX;
                const cy = height * cyRatio - motionTransY;
                const cColorIdx = getCellColorIndex(cIdx, 0, cx, cy, cIdx);
                const color = getPatternColor(palette, cColorIdx, accent, secondary);
                cIdx++;
                for (let ring = 1; ring <= 12; ring++) {
                    const morphScale = hasInPlaceAnim ? (1 + 0.08 * Math.sin(inPlacePhase * 1.1 + ring * 0.4 + cIdx)) : 1;
                    const morphX = hasInPlaceAnim ? Math.sin(inPlacePhase * 0.7 + ring * 0.3 + cIdx) * (step * 0.35) : 0;
                    const morphY = hasInPlaceAnim ? Math.cos(inPlacePhase * 0.7 + ring * 0.3 + cIdx) * (step * 0.35) : 0;
                    const ringPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(inPlacePhase * 1.4 + ring * 0.3)) : 1;
                    ctx.strokeStyle = withAlpha(color, Math.max(25, Math.min(255, Math.round(0x75 * ringPulse))).toString(16).padStart(2, '0'));
                    ctx.beginPath();
                    ctx.ellipse(cx + morphX + fallSwayX, cy + morphY, step * ring * morphScale, step * ring * (0.58 + (ring % 3) * 0.08) * morphScale, ring * 0.13, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        } else if (pattern === 'confetti') {
            const wrapW = Math.max(width * 1.5, fullWidth);
            const wrapH = Math.max(height * 1.5, fullHeight);
            for (let i = 0; i < 180; i++) {
                const u = hash2D(i, 10);
                const v = hash2D(i, 11);
                const sizeHash = hash2D(i, 12);
                const sizeVarMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                const scatterX = (hash2D(i, 14) - 0.5) * (wrapW * 0.15) * scatterAmount;
                const scatterY = (hash2D(i, 15) - 0.5) * (wrapH * 0.15) * scatterAmount;
                const particleDy = fallDy * (0.8 + (i % 3) * 0.2);

                const screenX = ((((u * wrapW + scatterX + fallSwayX * (0.5 + (i % 4) * 0.25) + motionTransX + wrapW * 1000) % wrapW)) - wrapW * 0.5) + width * 0.5;
                const screenY = ((((v * wrapH + particleDy + scatterY + motionTransY + wrapH * 1000) % wrapH)) - wrapH * 0.5) + height * 0.5;
                const x = screenX - motionTransX;
                const y = screenY - motionTransY;

                const size = Math.max(2, fullWidth / 180) * (sizeVarAmount > 0 ? (1 + (i % 3)) * sizeVarMult : 1.5);
                const randomAngle = ((((i * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                const confettiSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + i) * 0.35 : continuousSpinAngle * ((i & 1) ? 1 : -0.8)) : 0;
                const rot = i * 2.399 + randomAngle + confettiSpin + (hasInPlaceAnim ? Math.sin(inPlacePhase + i * 0.7) * 0.25 : 0);
                const cIdx = getCellColorIndex(0, 0, screenX, screenY, i);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(rot);
                ctx.fillStyle = withAlpha(color, hasFill ? fillHex : '95');
                if (i % 3 === 0) {
                    ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
                } else {
                    ctx.fillRect(-size / 2, -size / 4, size, size / 2);
                }
                ctx.restore();
            }
        } else if (pattern === 'circuit') {
            const step = Math.max(6, fullWidth / 16), baseNode = Math.max(1.5, fullWidth / 220);
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor((minY - fallDy) / step) - 1, rEnd = Math.ceil((maxY - fallDy) / step) + 1;
            const cStart = Math.floor(minX / step) - 1, cEnd = Math.ceil(maxX / step) + 1;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 13 + col * 27);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const nodeSizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * step * 0.35) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * step * 0.35) * scatterAmount;
                    const nodePulse = hasInPlaceAnim ? (0.65 + 0.35 * Math.sin(inPlacePhase * 2.2 + idx * 1.2)) : 1;
                    const node = baseNode * nodeSizeMult;

                    const x = col * step + scatterX + fallSwayX, y = row * step + scatterY + fallDy;
                    const direction = (((row + col) % 2 + 2) % 2) ? 1 : -1;
                    const cIdx = getCellColorIndex(row, col, x, y);
                    const color = getPatternColor(palette, cIdx, accent, secondary);
                    const traceAlpha = hasInPlaceAnim ? Math.max(25, Math.min(255, Math.round(0x85 * (0.75 + 0.25 * Math.sin(inPlacePhase * 1.6 + row + col))))).toString(16).padStart(2, '0') : '85';
                    ctx.strokeStyle = withAlpha(color, traceAlpha);
                    ctx.beginPath();
                    ctx.moveTo(x, y); ctx.lineTo(x + step * 0.32, y);
                    ctx.lineTo(x + step * 0.32, y + step * 0.55 * direction);
                    ctx.lineTo(x + step * 0.78, y + step * 0.55 * direction);
                    ctx.stroke();

                    const nodeAlpha = hasInPlaceAnim ? (nodePulse > 0.8 ? 'ff' : 'b0') : 'ff';
                    ctx.fillStyle = withAlpha(color, nodeAlpha);
                    ctx.beginPath(); ctx.arc(x + step * 0.78, y + step * 0.55 * direction, Math.max(1, node), 0, Math.PI * 2); ctx.fill();
                    ctx.stroke();
                }
            }
        } else if (pattern === 'leaves') {
            // Autumn botanical & maple leaves
            const stepX = Math.max(24, fullWidth / 11);
            const stepY = stepX * 0.86;
            const leafR = stepX * 0.28;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;
            const leafPalette = palette === 'dual' ? 'dual' : palette;

            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 31);
                    const jitterX = ((((idx * 37) % 100) / 100 - 0.5) * stepX * 0.45) * scatterAmount;
                    const jitterY = ((((idx * 53) % 100) / 100 - 0.5) * stepY * 0.45) * scatterAmount;
                    const cx = col * stepX + rowOffset + jitterX + fallSwayX;
                    const cy = row * stepY + jitterY + fallDy;
                    const baseAngle = ((idx % 12) / 12) * Math.PI * 2;
                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                    const leafSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx * 0.8) * 0.35 : continuousSpinAngle * ((idx & 1) ? 0.6 : -0.6)) : 0;
                    const flutter = hasInPlaceAnim ? Math.sin(inPlacePhase + idx * 0.9) * 0.18 : 0;
                    const cIdx = getCellColorIndex(row, col, cx, cy, idx);
                    const leafColor = getPatternColor(leafPalette, cIdx, accent, secondary);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const r = leafR * (sizeVarAmount > 0 ? (0.85 + (idx % 3) * 0.12) * sizeMult : 1);
                    const leafType = idx % 2;

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(baseAngle + randomAngle + leafSpin + flutter);

                    const lineW = stampLineW(getLineW(1.15), r, 95);
                    const cacheKey = `leaf:${leafType}:${leafColor}:${hasFill}:${fillHex}:${lineW}`;
                    const stamp = lineW <= 64 && (motifStampCache.get(cacheKey) || getOrCreateStamp(cacheKey, (sCtx, stampCx, stampCy) => {
                        drawLeafMotif(sCtx, stampCx, stampCy, 95, leafType, leafColor, hasFill, fillHex, lineW);
                    }));

                    if (stamp) {
                        const drawDim = (r / 95) * 384;
                        ctx.drawImage(stamp, -drawDim / 2, -drawDim / 2, drawDim, drawDim);
                    } else {
                        drawLeafMotif(ctx, 0, 0, r, leafType, leafColor, hasFill, fillHex, getLineW(1.15));
                    }

                    ctx.restore();
                }
            }
        } else if (pattern === 'turkeys') {
            // Festive Thanksgiving turkeys with radiating tail fan, tipped plumage, folded wings, eyes, beak, wattle, and claw feet
            const stepX = Math.max(38, fullWidth / 8.5);
            const stepY = stepX * 0.94;
            const baseR = stepX * 0.32;
            ctx.lineWidth = getLineW(1.2);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;
            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 13 + col * 29);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.4) + sizeHash * (sizeVarAmount * 0.8);
                    const r = baseR * sizeMult;
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.45) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.45) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;
                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2 - Math.PI) * 0.15 * rotVarAmount;
                    const turkeySpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx * 0.8) * 0.18 : (continuousSpinAngle * 0.3 * ((idx & 1) ? 1 : -1))) : 0;
                    const tilt = hasInPlaceAnim ? Math.sin(inPlacePhase + idx * 0.8) * 0.06 : 0;

                    const cIdx = getCellColorIndex(row, col, cx, cy, 0);
                    const fCol = getPatternColor(palette, cIdx, accent, secondary);
                    const tipCol = getPatternColor(palette, cIdx + 1, accent, secondary);
                    const bodyCol = getPatternColor(palette, idx, accent, secondary);
                    const wingCol = getPatternColor(palette, idx + 1, accent, secondary);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(randomAngle + turkeySpin + tilt);

                    const lineW = stampLineW(getLineW(1.2), r, 90);
                    const cacheKey = `turkey:${fCol}:${tipCol}:${bodyCol}:${wingCol}:${hasFill}:${fillHex}:${fillMode}:${lineW}`;
                    const stamp = lineW <= 64 && (motifStampCache.get(cacheKey) || getOrCreateStamp(cacheKey, (sCtx, stampCx, stampCy) => {
                        drawTurkeyMotif(sCtx, stampCx, stampCy, 90, hasFill, fillHex, fillMode, fCol, tipCol, bodyCol, wingCol, lineW);
                    }));

                    if (stamp) {
                        const drawDim = (r / 90) * 384;
                        ctx.drawImage(stamp, -drawDim / 2, -drawDim / 2, drawDim, drawDim);
                    } else {
                        drawTurkeyMotif(ctx, 0, 0, r, hasFill, fillHex, fillMode, fCol, tipCol, bodyCol, wingCol, getLineW(1.2));
                    }

                    ctx.restore();
                }
            }
        } else if (pattern === 'pumpkins') {
            // Harvest ribbed pumpkins with curly vine tendrils
            const stepX = Math.max(32, fullWidth / 10);
            const stepY = stepX * 0.88;
            const baseR = stepX * 0.28;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;
            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 19 + col * 23);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.4) + sizeHash * (sizeVarAmount * 0.8);
                    const r = baseR * sizeMult;
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.45) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.45) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;
                    const cIdx = getCellColorIndex(row, col, cx, cy, idx);
                    const pColor = getPatternColor(palette, cIdx, accent, secondary);
                    const stemColor = getPatternColor(palette, cIdx + 1, accent, secondary);
                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2 - Math.PI) * 0.2 * rotVarAmount;
                    const pumpkinSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx * 0.7) * 0.22 : (continuousSpinAngle * 0.35 * ((idx & 1) ? 1 : -1))) : 0;
                    const tilt = ((idx % 5) - 2) * 0.05 + (hasInPlaceAnim ? Math.sin(inPlacePhase + idx) * 0.05 : 0);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(randomAngle + pumpkinSpin + tilt);

                    const lineW = stampLineW(getLineW(1.15), r, 100);
                    const cacheKey = `pumpkin:${pColor}:${stemColor}:${hasFill}:${fillHex}:${lineW}`;
                    const stamp = lineW <= 64 && (motifStampCache.get(cacheKey) || getOrCreateStamp(cacheKey, (sCtx, stampCx, stampCy) => {
                        drawPumpkinMotif(sCtx, stampCx, stampCy, 100, pColor, stemColor, hasFill, fillHex, lineW);
                    }));

                    if (stamp) {
                        const drawDim = (r / 100) * 384;
                        ctx.drawImage(stamp, -drawDim / 2, -drawDim / 2, drawDim, drawDim);
                    } else {
                        drawPumpkinMotif(ctx, 0, 0, r, pColor, stemColor, hasFill, fillHex, getLineW(1.15));
                    }

                    ctx.restore();
                }
            }
        } else if (pattern === 'christmas-trees') {
            // Tiered evergreen pine trees with star toppers and twinkling ornaments
            const stepX = Math.max(34, fullWidth / 10);
            const stepY = stepX * 0.95;
            const baseR = stepX * 0.33;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;
            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 29);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.4) + sizeHash * (sizeVarAmount * 0.8);
                    const r = baseR * sizeMult;
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.45) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.45) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;
                    const sway = hasInPlaceAnim ? Math.sin(inPlacePhase + idx * 0.7) * 0.05 : 0;
                    const cIdx = getCellColorIndex(row, col, cx, cy, idx);
                    const treeColor = getPatternColor(palette, cIdx, accent, secondary);
                    const topperColor = getPatternColor(palette, cIdx + 1, accent, secondary);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(sway);

                    const lineW = stampLineW(getLineW(1.15), r, 95);
                    const cacheKey = `tree:${treeColor}:${topperColor}:${hasFill}:${fillHex}:${lineW}`;
                    const stamp = lineW <= 64 && (motifStampCache.get(cacheKey) || getOrCreateStamp(cacheKey, (sCtx, stampCx, stampCy) => {
                        drawChristmasTreeMotif(sCtx, stampCx, stampCy, 95, treeColor, topperColor, hasFill, fillHex, lineW);
                    }));

                    if (stamp) {
                        const drawDim = (r / 95) * 384;
                        ctx.drawImage(stamp, -drawDim / 2, -drawDim / 2, drawDim, drawDim);
                    } else {
                        drawChristmasTreeMotif(ctx, 0, 0, r, treeColor, topperColor, hasFill, fillHex, getLineW(1.15));
                    }

                    ctx.restore();
                }
            }
        } else if (pattern === 'christmas-lights') {
            // Draping catenary fairy-light garlands with glowing twinkling bulbs
            const rowStep = Math.max(36, fullHeight / 6.5);
            const bulbStep = Math.max(26, fullWidth / 18);
            const sag = rowStep * 0.26;
            const baseBulbR = Math.max(3.5, bulbStep * 0.17);
            ctx.lineWidth = getLineW(1.2);

            const rStart = Math.floor((minY - fallDy) / rowStep) - 1, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 1;
            const cStart = Math.floor(minX / bulbStep) - 2, cEnd = Math.ceil(maxX / bulbStep) + 2;

            for (let row = rStart; row <= rEnd; row++) {
                const baseY = row * rowStep + fallDy;
                const rowPhase = (((row % 2) + 2) % 2) * Math.PI;

                // Draw continuous draping wire cord
                ctx.strokeStyle = withAlpha(accent, '48');
                ctx.beginPath();
                const wireStep = Math.max(4, bulbStep / 6);
                for (let x = minX; x <= maxX; x += wireStep) {
                    const wireWave = (x / (bulbStep * 3)) * Math.PI * 2 + rowPhase;
                    const y = baseY + Math.sin(wireWave) * sag;
                    if (x === minX) ctx.moveTo(x + fallSwayX, y);
                    else ctx.lineTo(x + fallSwayX, y);
                }
                ctx.stroke();

                // Draw hanging light sockets & glowing bulbs along the cord
                const colOffset = (((row % 2) + 2) % 2) * (bulbStep * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const bx = col * bulbStep + colOffset + fallSwayX;
                    const wireWave = ((bx - fallSwayX) / (bulbStep * 3)) * Math.PI * 2 + rowPhase;
                    const by = baseY + Math.sin(wireWave) * sag;
                    const slope = Math.cos(wireWave) * 0.24;
                    const idx = Math.abs(row * 13 + col * 7);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.3) + sizeHash * (sizeVarAmount * 0.6);
                    const bulbR = baseBulbR * sizeMult;
                    const cIdx = getCellColorIndex(row, col, bx, by, idx);
                    const bColor = getPatternColor(palette, cIdx, accent, secondary);
                    const glowPulse = hasInPlaceAnim ? (0.65 + 0.35 * Math.sin(inPlacePhase * 2.2 + idx * 1.3)) : 0.9;

                    ctx.save();
                    ctx.translate(bx, by);
                    ctx.rotate(-slope * 0.5 + (hasInPlaceAnim ? Math.sin(inPlacePhase + col * 0.5) * 0.08 : 0));

                    // Outer soft bulb halo glow
                    ctx.fillStyle = withAlpha(bColor, glowPulse > 0.8 ? (hasFill ? '40' : '26') : '14');
                    ctx.beginPath();
                    ctx.arc(0, bulbR * 1.45, bulbR * 2.2 * glowPulse, 0, Math.PI * 2);
                    ctx.fill();

                    // Socket cap
                    ctx.fillStyle = withAlpha(accent, '85');
                    ctx.fillRect(-bulbR * 0.38, 0, bulbR * 0.76, bulbR * 0.52);

                    // Glass bulb teardrop/oval
                    ctx.fillStyle = withAlpha(bColor, hasFill ? fillHex : (glowPulse > 0.75 ? 'e6' : 'a8'));
                    ctx.strokeStyle = withAlpha(bColor, 'ff');
                    ctx.beginPath();
                    ctx.ellipse(0, bulbR * 1.42, bulbR * 0.68, bulbR * 1.05, 0, 0, Math.PI * 2);
                    if (hasFill || fillMode === 'tinted') ctx.fill();
                    ctx.stroke();

                    ctx.restore();
                }
            }
        } else if (pattern === 'snowflakes') {
            // Diverse 6-morphology crystalline snowflakes with size variance, organic scatter, and in-place rotation/shimmer
            const stepX = Math.max(34, fullWidth / 10);
            const stepY = stepX * 0.86;
            const baseFlakeR = stepX * 0.27;
            ctx.lineWidth = getLineW(1.1);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;
            const snowflakeStyle = options.snowflakeStyle || 'all';

            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 19 + col * 31);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const r = baseFlakeR * (sizeVarAmount > 0 ? (0.80 + (idx % 3) * 0.12) * sizeMult : 1);

                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.55) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.55) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;

                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                    const baseRot = (idx % 6) * (Math.PI / 6) + randomAngle;
                    const rotDir = (idx & 1) ? 1 : -1;
                    const flakeSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx * 0.8) * 0.35 : continuousSpinAngle * rotDir * 0.5) : 0;
                    const inPlaceFlutter = hasInPlaceAnim ? Math.sin(inPlacePhase + idx * 0.7) * 0.08 : 0;
                    const rot = baseRot + flakeSpin + inPlaceFlutter;

                    const cIdx = getCellColorIndex(row, col, cx, cy, idx);
                    const sColor = getPatternColor(palette, cIdx, accent, secondary);
                    const shimmer = hasInPlaceAnim ? (0.84 + 0.16 * Math.sin(inPlacePhase * 1.6 + idx)) : 1;

                    // Select morphology
                    let morphology = idx % 6;
                    if (snowflakeStyle === 'dendrite') morphology = 0;
                    else if (snowflakeStyle === 'plate') morphology = 1;
                    else if (snowflakeStyle === 'fern') morphology = 2;
                    else if (snowflakeStyle === 'rosette') morphology = 3;
                    else if (snowflakeStyle === 'cross') morphology = 4;
                    else if (snowflakeStyle === 'needle') morphology = 5;

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(rot);

                    const lineW = stampLineW(getLineW(1.1), r, 105);
                    const cacheKey = `flake:${morphology}:${sColor}:${hasFill}:${fillHex}:${accent}:${lineW}`;
                    const stamp = lineW <= 64 && (motifStampCache.get(cacheKey) || getOrCreateStamp(cacheKey, (sCtx, stampCx, stampCy) => {
                        drawSnowflakeMotif(sCtx, stampCx, stampCy, 105, morphology, sColor, hasFill, fillHex, lineW, accent);
                    }));

                    if (stamp) {
                        const drawDim = (r / 105) * 384;
                        if (shimmer < 0.99) ctx.globalAlpha *= shimmer;
                        ctx.drawImage(stamp, -drawDim / 2, -drawDim / 2, drawDim, drawDim);
                    } else {
                        if (shimmer < 0.99) ctx.globalAlpha *= shimmer;
                        drawSnowflakeMotif(ctx, 0, 0, r, morphology, sColor, hasFill, fillHex, getLineW(1.1), accent);
                    }

                    ctx.restore();
                }
            }
        } else if (pattern === 'hearts') {
            // Smooth floating vector hearts
            const stepX = Math.max(30, fullWidth / 11);
            const stepY = stepX * 0.88;
            const baseHeartR = stepX * 0.24;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;

            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 23);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.50) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.50) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;
                    const cIdx = getCellColorIndex(row, col, cx, cy, idx);
                    const hColor = getPatternColor(palette, cIdx, accent, secondary);
                    const beat = hasInPlaceAnim ? (0.80 + 0.20 * Math.sin(inPlacePhase * 2 + idx)) : 1;
                    const r = baseHeartR * (sizeVarAmount > 0 ? (0.82 + (idx % 3) * 0.14) * sizeMult : 1);
                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2 - Math.PI) * 0.15 * rotVarAmount;
                    const heartSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx * 0.8) * 0.25 : (continuousSpinAngle * 0.4 * ((idx & 1) ? 1 : -1))) : 0;
                    const tilt = ((idx % 5) - 2) * 0.08 + (hasInPlaceAnim ? Math.sin(inPlacePhase + idx) * 0.06 : 0);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(randomAngle + heartSpin + tilt);

                    const lineW = stampLineW(getLineW(1.15), r, 100);
                    const cacheKey = `heart:${hColor}:${hasFill}:${fillHex}:${lineW}`;
                    const stamp = lineW <= 64 && (motifStampCache.get(cacheKey) || getOrCreateStamp(cacheKey, (sCtx, stampCx, stampCy) => {
                        drawHeartMotif(sCtx, stampCx, stampCy, 100, hColor, hasFill, fillHex, lineW);
                    }));

                    if (stamp) {
                        const drawDim = (r / 100) * 384;
                        if (beat < 0.99) ctx.globalAlpha *= beat;
                        ctx.drawImage(stamp, -drawDim / 2, -drawDim / 2, drawDim, drawDim);
                    } else {
                        if (beat < 0.99) ctx.globalAlpha *= beat;
                        drawHeartMotif(ctx, 0, 0, r, hColor, hasFill, fillHex, getLineW(1.15));
                    }

                    ctx.restore();
                }
            }
        } else if (pattern === 'fireworks') {
            // Celebration starburst fireworks with sparkle cores
            const stepX = Math.max(44, fullWidth / 7.5);
            const stepY = stepX * 0.88;
            const baseBurstR = stepX * 0.34;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 1, rEnd = Math.ceil((maxY - fallDy) / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;

            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 13 + col * 29);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.45) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.45) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;
                    const cIdx = getCellColorIndex(row, col, cx, cy, idx);
                    const mainCol = getPatternColor(palette, cIdx, accent, secondary);
                    const subCol = getPatternColor(palette, cIdx + 1, accent, secondary);
                    const bloom = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(inPlacePhase * 1.8 + idx * 1.1)) : 1;
                    const r = baseBurstR * (sizeVarAmount > 0 ? (0.8 + (idx % 3) * 0.12) * sizeMult : 1);
                    const rays = 12;

                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                    const fwSpin = hasSpin ? (spinMode === 'sway' ? Math.sin(continuousSpinAngle + idx) * 0.25 : continuousSpinAngle * ((idx & 1) ? 0.5 : -0.5)) : 0;

                    ctx.save();
                    ctx.translate(cx, cy);
                    if (randomAngle !== 0 || fwSpin !== 0) ctx.rotate(randomAngle + fwSpin);

                    // Outer radiating firework streaks
                    const strokeAlpha = hasInPlaceAnim ? Math.max(25, Math.min(255, Math.round(0x95 * bloom))).toString(16).padStart(2, '0') : '95';
                    ctx.strokeStyle = withAlpha(mainCol, strokeAlpha);
                    const subAlpha = hasInPlaceAnim ? Math.max(25, Math.min(255, Math.round(0xcc * bloom))).toString(16).padStart(2, '0') : (hasFill ? fillHex : 'cc');
                    ctx.fillStyle = withAlpha(subCol, subAlpha);
                    ctx.beginPath();
                    for (let i = 0; i < rays; i++) {
                        const a = (i * Math.PI * 2) / rays + (idx % 3) * 0.15;
                        const inner = r * 0.28;
                        const outer = r * (i % 2 === 0 ? 1 : 0.72);
                        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
                        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
                    }
                    ctx.stroke();

                    // Sparkle tips around the bloom perimeter
                    for (let i = 0; i < rays; i += 2) {
                        const a = (i * Math.PI * 2) / rays + (idx % 3) * 0.15;
                        const tx = Math.cos(a) * r * 1.08;
                        const ty = Math.sin(a) * r * 1.08;
                        ctx.beginPath();
                        ctx.arc(tx, ty, Math.max(1.5, r * 0.055), 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // Center 4-point star core
                    drawFourPointStar(ctx, 0, 0, r * 0.22);
                    ctx.fill();

                    ctx.restore();
                }
            }
        } else if (pattern === 'geometry') {
            const geomPulse = hasInPlaceAnim ? (0.75 + 0.25 * Math.sin(inPlacePhase * 1.4)) : 1;
            const geomMorph = hasInPlaceAnim ? Math.sin(inPlacePhase * 0.9) * (width * 0.02) : 0;
            const alpha1 = Math.max(10, Math.min(255, Math.round(0x70 * geomPulse))).toString(16).padStart(2, '0');
            const alpha2 = Math.max(10, Math.min(255, Math.round(0x70 * (0.75 + 0.25 * Math.cos(inPlacePhase * 1.4))))).toString(16).padStart(2, '0');
            const cIdx1 = getCellColorIndex(0, 0, width * 0.7, height * 0.3);
            const cIdx2 = getCellColorIndex(1, 0, width * 0.3, height * 0.7);
            const color1 = getPatternColor(palette, cIdx1, accent, secondary);
            const color2 = getPatternColor(palette, cIdx2, accent, secondary);
            ctx.fillStyle = withAlpha(color1, alpha1);
            ctx.beginPath(); ctx.moveTo(width * 0.55 + geomMorph, minY); ctx.lineTo(maxX, minY); ctx.lineTo(maxX, height * 0.85); ctx.closePath(); ctx.fill();
            ctx.fillStyle = withAlpha(color2, alpha2);
            ctx.beginPath(); ctx.moveTo(minX, height * 0.68 - geomMorph); ctx.lineTo(width * 0.72, maxY); ctx.lineTo(minX, maxY); ctx.closePath(); ctx.fill();
        } else {
            // Orbits (default fallback)
            const orbitRot = (hasSpin ? continuousSpinAngle * 0.25 : 0) + (hasInPlaceAnim ? Math.sin(inPlacePhase * 0.8) * 0.05 : 0);
            const orbitPulse = hasInPlaceAnim ? (0.8 + 0.2 * Math.sin(inPlacePhase * 1.5)) : 1;
            const cx = width * 0.85 - motionTransX, cy = height * 0.2 - motionTransY;
            const alphaHex = Math.max(20, Math.min(255, Math.round(0x55 * orbitPulse))).toString(16).padStart(2, '0');
            for (let i = 0; i < 4; i++) {
                const cIdx = getCellColorIndex(i, 0, cx, cy, i);
                const color = getPatternColor(palette, cIdx, accent, secondary);
                ctx.strokeStyle = withAlpha(color, alphaHex);
                ctx.beginPath();
                ctx.ellipse(cx, cy, width * (0.23 + i * 0.06), height * (0.17 + i * 0.04), -0.5 + orbitRot, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.restore();
        }

        if (!options._skipPatternEffects && (motion === 'aurora' || motion === 'flow')) {
            const t = (time / 6) * Math.PI * 2 * speed;
            const span = Math.hypot(fullWidth, fullHeight);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.translate(fullWidth / 2, fullHeight / 2);
            ctx.rotate(motion === 'flow' ? -0.5 : 0.35);
            const colorsList = [accent, secondary, accent];
            for (let i = 0; i < 3; i++) {
                const offset = Math.sin(t + i * 2.1) * span * 0.28 + (i - 1) * span * 0.22;
                const w = span * (0.34 + 0.06 * Math.sin(t * 2 + i));
                const g = ctx.createLinearGradient(offset - w, 0, offset + w, 0);
                g.addColorStop(0, withAlpha(colorsList[i], '00'));
                g.addColorStop(0.5, withAlpha(colorsList[i], '75'));
                g.addColorStop(1, withAlpha(colorsList[i], '00'));
                ctx.fillStyle = g;
                ctx.fillRect(-span, -span, span * 2, span * 2);
            }
            ctx.restore();
        }

        if (!options._skipPatternEffects && motion === 'sweep') {
            const t = ((time / 6 * speed) % 1 + 1) % 1;
            const eased = t * t * (3 - 2 * t);
            const span = fullWidth + fullHeight, band = span * 0.22;
            const pos = -band + eased * (span + band * 2);
            const sweep = ctx.createLinearGradient(pos - band, pos - band, pos + band, pos + band);
            sweep.addColorStop(0, withAlpha(accent, '00'));
            sweep.addColorStop(0.5, withAlpha(accent, '5a'));
            sweep.addColorStop(1, withAlpha(accent, '00'));
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = sweep;
            ctx.fillRect(0, 0, fullWidth, fullHeight);
            ctx.restore();
        }

        // Cinematic vignette overlay (smooth radial edge darkening)
        const vignetteAmount = Math.max(0, Math.min(100, Number(options.vignette) || 0)) / 100;
        if (!options._skipPatternEffects && vignetteAmount > 0) {
            const vColor = (options.vignetteColor && options.vignetteColor !== 'transparent') ? options.vignetteColor : '#000000';
            const vKey = `${fullWidth}:${fullHeight}:${vColor}:${vignetteAmount}`;
            let vigGrad = vignetteGradCache.get(vKey);
            if (!vigGrad) {
                const cx = fullWidth / 2, cy = fullHeight / 2;
                const outerR = Math.hypot(fullWidth, fullHeight) / 2;
                const innerR = outerR * 0.22;
                vigGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
                vigGrad.addColorStop(0, withAlpha(vColor, '00'));
                vigGrad.addColorStop(0.65, withAlpha(vColor, Math.round(0x65 * vignetteAmount).toString(16).padStart(2, '0')));
                vigGrad.addColorStop(1, withAlpha(vColor, Math.round(0xff * vignetteAmount).toString(16).padStart(2, '0')));
                if (vignetteGradCache.size >= 16) {
                    const firstKey = vignetteGradCache.keys().next().value;
                    vignetteGradCache.delete(firstKey);
                }
                vignetteGradCache.set(vKey, vigGrad);
            }
            ctx.save();
            ctx.fillStyle = vigGrad;
            ctx.fillRect(0, 0, fullWidth, fullHeight);
            ctx.restore();
        }
    }

    const SNOWFLAKE_STYLES = ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle'];

    const exported = {
        PATTERNS,
        PATTERN_CATEGORIES,
        PATTERN_CAPABILITIES,
        PALETTES,
        SNOWFLAKE_STYLES,
        drawProceduralPattern
    };

    if (root) {
        root.StreamPulsePatterns = exported;
        if (root.OverlayShared) root.OverlayShared.Patterns = exported;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exported;
    }
})(typeof self !== 'undefined' ? self : this);
