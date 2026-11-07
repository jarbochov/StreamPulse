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

    /**
     * Draws a procedural pattern onto any canvas context.
     * Shared across Promo Editor and Custom Overlay Editor.
     *
     * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context
     * @param {string} pattern - Pattern identifier (e.g. 'hexagons', 'leaves', 'christmas-lights')
     * @param {number} width - Canvas or tile width
     * @param {number} height - Canvas or tile height
     * @param {object} options - Custom options (scale, color, accent, secondary, palette, fillMode, fillOpacity, time, motion, speed, lineWidth)
     */
    function drawProceduralPattern(ctx, pattern, width, height, options = {}) {
        if (!pattern || !ctx || !(width > 0) || !(height > 0)) return;

        const fullWidth = width, fullHeight = height;
        const scale = Math.max(0.05, (options.scale || 100) / 100);
        const time = options.time || 0;
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

        // Base fill if specified
        if (baseColor && baseColor !== 'transparent') {
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, width, height);
        }

        ctx.save();
        const phase = time * Math.PI / 3 * speed;
        // In-place animation (twinkles, pulsing, rotating, leaf flutter) decoupled from overall canvas movement
        const inPlace = options.inPlace ?? (motion !== 'none' ? 'auto' : 'none');
        const hasInPlaceAnim = inPlace !== 'none' && inPlace !== false && inPlace !== 0 && time > 0;
        const isAnimated = (motion !== 'none' || hasInPlaceAnim) && time > 0;
        const inPlaceMult = inPlace === 'sparkle' ? 2.6 : (inPlace === 'pulse' ? 1.8 : (inPlace === 'gentle' ? 0.6 : 1.0));
        const inPlaceSpeed = Number(options.inPlaceSpeed) > 0 ? Number(options.inPlaceSpeed) : 1.0;
        const inPlacePhase = hasInPlaceAnim ? (time * speed * inPlaceMult * inPlaceSpeed) : 0;

        // Size variance and organic scatter (lessons from Pattern Tile)
        const sizeVarAmount = Math.max(0, Math.min(1, (Number(options.sizeVariance ?? options.scaleJitter) || 0) / 100));
        const scatterAmount = Math.max(0, Math.min(1, (Number(options.scatter ?? options.positionJitter) || 0) / 100));
        const rotVarAmount = Math.max(0, Math.min(1, (Number(options.rotationVariance ?? options.rotationJitter) || 0) / 100));

        const pulse = motion === 'pulse' ? (1 - Math.cos(phase)) / 2 : 0;

        // Pattern scale around canvas center so changing scale zooms smoothly without scrambling coordinates
        ctx.translate(fullWidth / 2, fullHeight / 2);
        ctx.scale(scale, scale);
        width = fullWidth / scale;
        height = fullHeight / scale;
        ctx.translate(-width / 2, -height / 2);

        if (motion === 'drift') {
            ctx.translate(Math.sin(phase) * width * 0.05, Math.cos(phase) * height * 0.05);
        } else if (motion === 'sway') {
            ctx.translate(width / 2, height / 2);
            ctx.rotate(Math.sin(phase) * 0.1);
            ctx.scale(1.12 + Math.cos(phase) * 0.05, 1.12 + Math.cos(phase) * 0.05);
            ctx.translate(-width / 2, -height / 2);
        } else if (motion === 'orbit') {
            const r = Math.min(width, height) * 0.04;
            ctx.translate(Math.cos(phase) * r, Math.sin(phase) * r);
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
            const angle = ((options.angle ?? 45) - 90) * Math.PI / 180;
            const u = Math.sin(time / 6 * speed * Math.PI * 2);
            const mx = width * 0.12, my = height * 0.12;
            ctx.translate(Math.cos(angle) * mx * u, Math.sin(angle) * my * u);
        }

        // Overscan bounds so drift/sway/orbit/pan/fall never expose blank canvas edges
        const padX = width * 0.22;
        const padY = height * 0.22;
        const minX = -padX, maxX = width + padX;
        const minY = -padY, maxY = height + padY;

        // Helper for consistent stroke width across all patterns and scales
        const getLineW = (mult = 1) => (customLineWidth > 0 ? customLineWidth : Math.max(1.2, (fullWidth / 700) * mult)) / scale;

        // Continuous, non-jumping vertical displacement for 'fall' motion.
        // For promo video rendering, loop over loopDuration if requested (options.loop === true).
        // For overlay editor and live overlays, time is linear and continuous with ZERO periodic jump!
        const isLoop = options.loop === true;
        const loopDuration = Number(options.loopDuration) > 0 ? Number(options.loopDuration) : 6;
        const fallVelocity = fullHeight * 0.055 * speed;
        const fallDy = motion === 'fall'
            ? (isLoop
                ? (time % loopDuration) * fallVelocity
                : time * fallVelocity)
            : 0;
        const fallSwayX = motion === 'fall' ? Math.sin(phase * 0.8) * (fullWidth * 0.018) : 0;

        ctx.strokeStyle = withAlpha(accent, options.accentAlpha || '55');
        ctx.lineWidth = getLineW(1);

        if (pattern === 'grid') {
            const step = Math.max(3, fullWidth / 32);
            const x0 = Math.floor(minX / step) * step;
            const yStart = Math.floor((minY - fallDy) / step) - 1;
            const yEnd = Math.ceil((maxY - fallDy) / step) + 1;
            ctx.beginPath();
            for (let x = x0; x <= maxX; x += step) { ctx.moveTo(x + fallSwayX, minY); ctx.lineTo(x + fallSwayX, maxY); }
            for (let yi = yStart; yi <= yEnd; yi++) {
                const cy = yi * step + fallDy;
                ctx.moveTo(minX, cy); ctx.lineTo(maxX, cy);
            }
            ctx.stroke();
            ctx.fillStyle = accent;
            ctx.fillRect(width * 0.92, height * 0.12, width * 0.012, height * 0.28);
        } else if (pattern === 'hexagons') {
            const radius = Math.max(3, fullWidth / 28), rowStep = Math.sqrt(3) * radius;
            const columnStep = radius * 1.5;
            ctx.lineWidth = getLineW(1);
            const cStart = Math.floor(minX / columnStep) - 1, cEnd = Math.ceil(maxX / columnStep) + 1;
            const rStart = Math.floor((minY - fallDy) / rowStep) - 1, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 1;
            for (let col = cStart; col <= cEnd; col++) {
                for (let row = rStart; row <= rEnd; row++) {
                    const cx = col * columnStep + fallSwayX;
                    const cy = row * rowStep + (((col % 2) + 2) % 2) * rowStep / 2 + fallDy;
                    const color = getPatternColor(palette, col * 7 + row * 11, accent, secondary);
                    ctx.beginPath();
                    for (let point = 0; point < 6; point++) {
                        const angle = point * Math.PI / 3, x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
                        if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    if (hasFill) {
                        ctx.fillStyle = withAlpha(color, fillHex);
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color, '95');
                    ctx.stroke();
                }
            }
        } else if (pattern === 'diamonds') {
            const step = Math.max(4, fullWidth / 18), radius = step * 0.46;
            ctx.lineWidth = getLineW(1);
            const yStart = Math.floor((minY - fallDy) / step) - 1;
            const yEnd = Math.ceil((maxY - fallDy) / step) + 1;
            const x0 = Math.floor(minX / step) * step;
            for (let yi = yStart; yi <= yEnd; yi++) {
                const cy = yi * step + fallDy;
                for (let x = x0; x <= maxX + step; x += step) {
                    const cx = x + fallSwayX;
                    const color = getPatternColor(palette, Math.round(x / step + yi * 3), accent, secondary);
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx + radius, cy); ctx.lineTo(cx, cy + radius); ctx.lineTo(cx - radius, cy); ctx.closePath();
                    if (hasFill) {
                        ctx.fillStyle = withAlpha(color, fillHex);
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color, '95');
                    ctx.stroke();
                }
            }
        } else if (pattern === 'isometric') {
            const edge = Math.max(1, fullWidth / 20), half = edge * Math.sqrt(3) / 2, slope = Math.tan(Math.PI / 6);
            ctx.lineWidth = getLineW(1);
            ctx.beginPath();
            const x0 = Math.floor(minX / half) * half;
            for (let x = x0; x <= maxX + half; x += half) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); }
            const spanW = maxX - minX;
            const cStart = Math.floor((minY - spanW * slope - edge - fallDy) / edge) * edge;
            const cEnd = maxY + spanW * slope + edge;
            for (let c = cStart; c <= cEnd; c += edge) {
                const cy = c + fallDy;
                ctx.moveTo(minX, cy); ctx.lineTo(maxX, cy + spanW * slope);
                ctx.moveTo(minX, cy + spanW * slope); ctx.lineTo(maxX, cy);
            }
            ctx.stroke();
        } else if (pattern === 'mesh') {
            const rows = 14, columns = 20, amplitude = Math.max(1, fullWidth / 60);
            const spanW = maxX - minX, spanH = maxY - minY;
            const rowStep = spanH / rows;
            const rStart = Math.floor((minY - fallDy) / rowStep) - 2;
            const rEnd = Math.ceil((maxY - fallDy) / rowStep) + 2;
            ctx.lineWidth = getLineW(0.9);
            for (let row = rStart; row <= rEnd; row++) {
                const color = getPatternColor(palette, row, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '75');
                ctx.beginPath();
                for (let column = 0; column <= columns * 6; column++) {
                    const x = minX + column * spanW / (columns * 6);
                    const y = row * rowStep + fallDy + Math.sin((x - minX) / spanW * Math.PI * 4 + row * 0.45) * amplitude;
                    if (!column) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            for (let column = -1; column <= columns + 1; column++) {
                const color = getPatternColor(palette, column, secondary, accent);
                ctx.strokeStyle = withAlpha(color, '75');
                ctx.beginPath();
                for (let row = 0; row <= rows * 6; row++) {
                    const y = minY + row * spanH / (rows * 6);
                    const x = minX + column * spanW / columns + fallSwayX + Math.sin((y - minY) / spanH * Math.PI * 3 + column * 0.5) * amplitude;
                    if (!row) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'sunburst') {
            const cx = width * 0.5, cy = height * 0.5, radius = Math.hypot(maxX - minX, maxY - minY), rays = 28;
            const rotOffset = motion === 'fall' ? (isLoop ? (time % loopDuration) : time) * speed * 0.35 : 0;
            ctx.lineWidth = getLineW(1);
            for (let i = 0; i < rays; i++) {
                const angle = i * Math.PI * 2 / rays + rotOffset;
                const color = getPatternColor(palette, i, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
            }
        } else if (pattern === 'dots') {
            const step = Math.max(3, fullWidth / 24), radius = Math.max(1.2, fullWidth / 300);
            const yStart = Math.floor((minY - fallDy) / step) - 1;
            const yEnd = Math.ceil((maxY - fallDy) / step) + 1;
            const x0 = Math.floor(minX / step) * step + step / 2;
            for (let yi = yStart; yi <= yEnd; yi++) {
                const cy = yi * step + fallDy;
                for (let x = x0; x <= maxX; x += step) {
                    const color = getPatternColor(palette, Math.round(x / step + yi * 3), accent, secondary);
                    ctx.fillStyle = withAlpha(color, hasFill ? fillHex : '65');
                    ctx.beginPath(); ctx.arc(x + fallSwayX, cy, radius * (hasFill ? (0.8 + fillOp * 0.5) : 1), 0, Math.PI * 2); ctx.fill();
                }
            }
        } else if (pattern === 'starfield' || pattern === 'sparkles') {
            const count = pattern === 'starfield' ? 190 : 75;
            const refW = fullWidth * 1.44;
            const refH = fullHeight * 1.44;
            const ox = (width - refW) / 2;
            const oy = (height - refH) / 2;
            for (let i = 0; i < count; i++) {
                const u = (i * 0.61803398875) % 1;
                const v = (i * 0.75487766625) % 1;
                const sizeHash = (((i * 7919 + 104729) % 1000) / 1000);
                const sizeVarMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                const x = ox + u * refW + fallSwayX * (0.6 + (i % 3) * 0.3);
                const y = oy + (((v * refH + fallDy) % refH + refH) % refH);
                const twinkleMult = hasInPlaceAnim ? (0.70 + 0.30 * Math.sin(inPlacePhase * 1.5 + i * 1.7)) : 1;
                const size = Math.max(1.5, fullWidth / (pattern === 'starfield' ? 420 : 250)) * (1 + (i % 3) * 0.35) * twinkleMult * sizeVarMult;
                const pColor = getPatternColor(palette, i, accent, secondary);
                ctx.fillStyle = withAlpha(pColor, hasFill ? fillHex : '85');
                if (pattern === 'starfield' && i % 4) {
                    ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, Math.PI * 2); ctx.fill();
                } else {
                    drawFourPointStar(ctx, x, y, size * 2);
                    ctx.fill();
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
                        const color = getPatternColor(palette, row * 7 + col, accent, secondary);
                        ctx.fillStyle = withAlpha(color, hasFill ? fillHex : '28');
                        ctx.fillRect(col * step + fallSwayX, y, step, step);
                    }
                }
            }
        } else if (pattern === 'waves') {
            const rowStep = Math.max(4, fullHeight / 18), amplitude = Math.max(1, fullWidth / 100), wavelength = Math.max(8, fullWidth / 8);
            const wavePhase = time > 0 ? (time * 1.5 * speed) : 0;
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 1, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 1;
            const xStep = Math.max(2, fullWidth / 160);
            for (let row = rStart; row <= rEnd; row++) {
                const color = getPatternColor(palette, row, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
                const baseY = row * rowStep + fallDy;
                ctx.beginPath();
                for (let x = minX; x <= maxX; x += xStep) {
                    const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + row * 0.45 + wavePhase) * amplitude;
                    if (x === minX) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'rings') {
            const cx = width * 0.5, cy = height * 0.5, step = Math.max(3, fullWidth / 36);
            const rPhase = time > 0 ? (((isLoop ? (time % loopDuration) : time) * 20 * speed) % step + step) % step : 0;
            ctx.lineWidth = getLineW(1.3);
            const maxR = Math.hypot(maxX - minX, maxY - minY);
            let rIdx = 0;
            for (let radius = step + rPhase; radius < maxR + step; radius += step) {
                const color = getPatternColor(palette, rIdx++, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
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
                    const color = getPatternColor(palette, row * 5 + Math.round(x / step), accent, secondary);
                    ctx.beginPath(); ctx.arc(x + offset + fallSwayX, y, step / 2, 0, Math.PI);
                    if (hasFill) {
                        ctx.fillStyle = withAlpha(color, fillHex);
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color, '95');
                    ctx.stroke();
                }
            }
        } else if (pattern === 'triangles') {
            const size = Math.max(4, fullWidth / 20), rowStep = size * Math.sqrt(3) / 2;
            ctx.lineWidth = getLineW(1);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 2, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 2;
            const cStart = Math.floor(minX / size) - 2, cEnd = Math.ceil(maxX / size) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const color1 = getPatternColor(palette, row * 7 + col * 3, accent, secondary);
                    const color2 = getPatternColor(palette, row * 7 + col * 3 + 1, secondary, accent);
                    const x = col * size + (((row % 2) + 2) % 2) * size / 2 + fallSwayX, y = row * rowStep + fallDy;
                    ctx.beginPath();
                    ctx.moveTo(x, y + rowStep); ctx.lineTo(x + size / 2, y); ctx.lineTo(x + size, y + rowStep);
                    ctx.closePath();
                    if (hasFill) {
                        ctx.fillStyle = withAlpha(color1, fillHex);
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color1, '95');
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size, y + rowStep); ctx.lineTo(x + size * 1.5, y);
                    ctx.closePath();
                    if (hasFill) {
                        ctx.fillStyle = withAlpha(color2, fillHex);
                        ctx.fill();
                    }
                    ctx.strokeStyle = withAlpha(color2, '95');
                    ctx.stroke();
                }
            }
        } else if (pattern === 'chevrons') {
            const step = Math.max(4, fullWidth / 22), rowStep = step * 0.65;
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor((minY - fallDy) / rowStep) - 1, rEnd = Math.ceil((maxY - fallDy) / rowStep) + 1;
            const x0 = Math.floor(minX / step) * step;
            for (let row = rStart; row <= rEnd; row++) {
                const color = getPatternColor(palette, row, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
                ctx.beginPath();
                const cy = row * rowStep + fallDy;
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
            for (const [cx, cy] of centers) {
                const color = getPatternColor(palette, cIdx++, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '75');
                for (let ring = 1; ring <= 12; ring++) {
                    ctx.beginPath();
                    ctx.ellipse(width * cx + fallSwayX, height * cy, step * ring, step * ring * (0.58 + (ring % 3) * 0.08), ring * 0.13, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        } else if (pattern === 'confetti') {
            const refW = fullWidth * 1.44;
            const refH = fullHeight * 1.44;
            const ox = (width - refW) / 2;
            const oy = (height - refH) / 2;
            for (let i = 0; i < 180; i++) {
                const u = (i * 0.61803398875) % 1;
                const v = (i * 0.75487766625) % 1;
                const sizeHash = (((i * 7919 + 104729) % 1000) / 1000);
                const sizeVarMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                const x = ox + u * refW + fallSwayX * (0.5 + (i % 4) * 0.25);
                const particleDy = fallDy * (0.8 + (i % 3) * 0.2);
                const y = oy + (((v * refH + particleDy) % refH + refH) % refH);
                const size = Math.max(2, fullWidth / 180) * (1 + (i % 3)) * sizeVarMult;
                const rot = i * 2.399 + (hasInPlaceAnim ? Math.sin(inPlacePhase + i * 0.7) * 0.45 : 0);
                const color = getPatternColor(palette, i, accent, secondary);
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
            const step = Math.max(6, fullWidth / 16), node = Math.max(1.5, fullWidth / 220);
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor((minY - fallDy) / step) - 1, rEnd = Math.ceil((maxY - fallDy) / step) + 1;
            const cStart = Math.floor(minX / step) - 1, cEnd = Math.ceil(maxX / step) + 1;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const x = col * step + fallSwayX, y = row * step + fallDy;
                    const direction = (((row + col) % 2 + 2) % 2) ? 1 : -1;
                    const color = getPatternColor(palette, row * 5 + col, accent, secondary);
                    ctx.strokeStyle = withAlpha(color, '85');
                    ctx.beginPath();
                    ctx.moveTo(x, y); ctx.lineTo(x + step * 0.32, y);
                    ctx.lineTo(x + step * 0.32, y + step * 0.55 * direction);
                    ctx.lineTo(x + step * 0.78, y + step * 0.55 * direction);
                    ctx.stroke();
                    ctx.beginPath(); ctx.arc(x + step * 0.78, y + step * 0.55 * direction, node, 0, Math.PI * 2); ctx.stroke();
                }
            }
        } else if (pattern === 'leaves') {
            // Autumn botanical & maple leaves
            const stepX = Math.max(24, fullWidth / 11);
            const stepY = stepX * 0.86;
            const leafR = stepX * 0.28;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 2, rEnd = Math.ceil((maxY - fallDy) / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
            const leafPalette = palette === 'dual' ? 'dual' : palette;

            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 31);
                    const jitterX = (((idx * 37) % 100) / 100 - 0.5) * stepX * 0.32;
                    const jitterY = (((idx * 53) % 100) / 100 - 0.5) * stepY * 0.32;
                    const extraScatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.55) * scatterAmount;
                    const extraScatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.55) * scatterAmount;
                    const cx = col * stepX + rowOffset + jitterX + extraScatterX + fallSwayX;
                    const cy = row * stepY + jitterY + extraScatterY + fallDy;
                    const baseAngle = ((idx % 12) / 12) * Math.PI * 2;
                    const flutter = hasInPlaceAnim ? Math.sin(inPlacePhase + idx * 0.9) * 0.22 : 0;
                    const leafColor = getPatternColor(leafPalette, idx, accent, secondary);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const r = leafR * (0.85 + (idx % 3) * 0.12) * sizeMult;

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(baseAngle + flutter);
                    ctx.strokeStyle = withAlpha(leafColor, '98');

                    if (idx % 2 === 0) {
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
            }
        } else if (pattern === 'turkeys') {
            // Festive Thanksgiving turkeys with radiating tail fan, tipped plumage, folded wings, eyes, beak, wattle, and claw feet
            const stepX = Math.max(38, fullWidth / 8.5);
            const stepY = stepX * 0.94;
            const baseR = stepX * 0.32;
            ctx.lineWidth = getLineW(1.2);
            const rStart = Math.floor((minY - fallDy) / stepY) - 2, rEnd = Math.ceil((maxY - fallDy) / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
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
                    const tilt = hasInPlaceAnim ? Math.sin(inPlacePhase + idx * 0.8) * 0.08 : 0;
                    const fanSpread = hasInPlaceAnim ? (1 + Math.sin(inPlacePhase * 1.4 + idx) * 0.06) : 1;

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(tilt);

                    // 1. Radiating fanned tail feathers (semi-circle fan behind the body)
                    const feathers = 7;
                    for (let f = 0; f < feathers; f++) {
                        const fNorm = (f - (feathers - 1) / 2) / ((feathers - 1) / 2);
                        const fAng = fNorm * (Math.PI * 0.44) * fanSpread;
                        const fCol = getPatternColor(palette, f * 2 + idx, accent, secondary);
                        const tipCol = getPatternColor(palette, f * 2 + idx + 1, secondary, accent);
                        ctx.save();
                        ctx.translate(0, r * 0.22);
                        ctx.rotate(fAng);

                        // Main feather paddle
                        ctx.fillStyle = withAlpha(fCol, hasFill ? fillHex : '40');
                        ctx.strokeStyle = withAlpha(fCol, 'c0');
                        ctx.beginPath();
                        ctx.ellipse(0, -r * 0.68, r * 0.20, r * 0.48, 0, 0, Math.PI * 2);
                        if (hasFill) ctx.fill();
                        ctx.stroke();

                        // Feather tip band (signature turkey tail feather plumage)
                        ctx.fillStyle = withAlpha(tipCol, hasFill ? (fillMode === 'solid' ? 'ff' : fillHex) : '70');
                        ctx.strokeStyle = withAlpha(tipCol, 'e0');
                        ctx.beginPath();
                        ctx.ellipse(0, -r * 1.02, r * 0.16, r * 0.12, 0, 0, Math.PI * 2);
                        if (hasFill) ctx.fill();
                        ctx.stroke();

                        // Feather center quill line
                        ctx.strokeStyle = withAlpha(fCol, '65');
                        ctx.beginPath();
                        ctx.moveTo(0, -r * 0.22);
                        ctx.lineTo(0, -r * 0.94);
                        ctx.stroke();

                        ctx.restore();
                    }

                    // 2. Plump turkey body (layered over feathers)
                    const bodyCol = getPatternColor(palette, idx, accent, secondary);
                    ctx.fillStyle = withAlpha(bodyCol, hasFill ? fillHex : '48');
                    ctx.strokeStyle = withAlpha(bodyCol, 'd0');
                    ctx.beginPath();
                    ctx.ellipse(0, r * 0.28, r * 0.44, r * 0.40, 0, 0, Math.PI * 2);
                    if (hasFill) ctx.fill();
                    ctx.stroke();

                    // 3. Folded wings on left & right of body
                    const wingCol = getPatternColor(palette, idx + 3, secondary, accent);
                    ctx.fillStyle = withAlpha(wingCol, hasFill ? (fillMode === 'solid' ? withAlpha(wingCol, 'ee') : fillHex) : '35');
                    ctx.strokeStyle = withAlpha(wingCol, 'c8');
                    // Left wing
                    ctx.beginPath();
                    ctx.ellipse(-r * 0.26, r * 0.28, r * 0.14, r * 0.26, -0.22, 0, Math.PI * 2);
                    if (hasFill) ctx.fill();
                    ctx.stroke();
                    // Right wing
                    ctx.beginPath();
                    ctx.ellipse(r * 0.26, r * 0.28, r * 0.14, r * 0.26, 0.22, 0, Math.PI * 2);
                    if (hasFill) ctx.fill();
                    ctx.stroke();

                    // 4. Turkey head & neck
                    ctx.fillStyle = withAlpha(bodyCol, hasFill ? fillHex : '55');
                    ctx.strokeStyle = withAlpha(bodyCol, 'd8');
                    ctx.beginPath();
                    ctx.ellipse(0, -r * 0.18, r * 0.22, r * 0.24, 0, 0, Math.PI * 2);
                    if (hasFill) ctx.fill();
                    ctx.stroke();

                    // 5. Turkey eyes (white sclera + dark pupils for unmistakable character)
                    const eyeY = -r * 0.24;
                    const eyeSpacing = r * 0.085;
                    const eyeR = r * 0.052;
                    const pupilR = r * 0.026;

                    // Left eye
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#27272a';
                    ctx.beginPath();
                    ctx.arc(-eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#18181b';
                    ctx.beginPath();
                    ctx.arc(-eyeSpacing + r * 0.01, eyeY, pupilR, 0, Math.PI * 2);
                    ctx.fill();

                    // Right eye
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#18181b';
                    ctx.beginPath();
                    ctx.arc(eyeSpacing - r * 0.01, eyeY, pupilR, 0, Math.PI * 2);
                    ctx.fill();

                    // 6. Beak (bright triangular beak pointing downward)
                    ctx.fillStyle = '#f59e0b';
                    ctx.strokeStyle = '#d97706';
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.08, -r * 0.16);
                    ctx.lineTo(r * 0.08, -r * 0.16);
                    ctx.lineTo(0, -r * 0.01);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    // 7. Signature red snood/wattle draping over the side of the beak
                    ctx.fillStyle = '#dc2626';
                    ctx.strokeStyle = '#991b1b';
                    ctx.beginPath();
                    ctx.moveTo(r * 0.02, -r * 0.17);
                    quadTo(ctx, r * 0.14, -r * 0.10, r * 0.12, r * 0.02);
                    quadTo(ctx, r * 0.11, r * 0.12, r * 0.05, r * 0.10);
                    quadTo(ctx, 0, r * 0.07, r * 0.01, -r * 0.03);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    // 8. Claw feet with 3 splayed toes in amber/orange
                    const legCol = '#f59e0b';
                    ctx.strokeStyle = legCol;
                    ctx.lineWidth = getLineW(1.4);
                    // Left leg & toes
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.18, r * 0.65);
                    ctx.lineTo(-r * 0.20, r * 0.84);
                    ctx.lineTo(-r * 0.30, r * 0.92);
                    ctx.moveTo(-r * 0.20, r * 0.84);
                    ctx.lineTo(-r * 0.20, r * 0.94);
                    ctx.moveTo(-r * 0.20, r * 0.84);
                    ctx.lineTo(-r * 0.10, r * 0.92);
                    // Right leg & toes
                    ctx.moveTo(r * 0.18, r * 0.65);
                    ctx.lineTo(r * 0.20, r * 0.84);
                    ctx.lineTo(r * 0.10, r * 0.92);
                    ctx.moveTo(r * 0.20, r * 0.84);
                    ctx.lineTo(r * 0.20, r * 0.94);
                    ctx.moveTo(r * 0.20, r * 0.84);
                    ctx.lineTo(r * 0.30, r * 0.92);
                    ctx.stroke();

                    ctx.restore();
                }
            }
        } else if (pattern === 'pumpkins') {
            // Harvest ribbed pumpkins with curly vine tendrils
            const stepX = Math.max(32, fullWidth / 10);
            const stepY = stepX * 0.88;
            const baseR = stepX * 0.28;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 2, rEnd = Math.ceil((maxY - fallDy) / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
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
                    const pColor = getPatternColor(palette, idx, accent, secondary);
                    const stemColor = getPatternColor(palette, idx + 2, secondary, accent);
                    const tilt = ((idx % 5) - 2) * 0.05 + (hasInPlaceAnim ? Math.sin(inPlacePhase + idx) * 0.06 : 0);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(tilt);

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
            }
        } else if (pattern === 'christmas-trees') {
            // Tiered evergreen pine trees with star toppers and twinkling ornaments
            const stepX = Math.max(34, fullWidth / 10);
            const stepY = stepX * 0.95;
            const baseR = stepX * 0.33;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 2, rEnd = Math.ceil((maxY - fallDy) / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
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
                    const treeColor = getPatternColor(palette, idx, accent, secondary);
                    const topperColor = getPatternColor(palette, idx + 1, secondary, accent);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(sway);

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

                    // Twinkling ornaments on boughs (multicolor if palette is selected)
                    const ornaments = [
                        [-r * 0.24, r * 0.36],
                        [r * 0.26, r * 0.28],
                        [0, -r * 0.02],
                        [-r * 0.16, -r * 0.36],
                        [r * 0.18, -r * 0.42]
                    ];
                    ornaments.forEach(([ox, oy], oIdx) => {
                        const ornColor = getPatternColor(palette === 'dual' ? 'multicolor' : palette, oIdx + idx, secondary, accent);
                        const twinkleAlpha = hasInPlaceAnim && ((Math.floor(time * 2 * inPlaceMult * inPlaceSpeed + idx + oIdx) % 2) === 0) ? 'ff' : '90';
                        ctx.fillStyle = withAlpha(ornColor, twinkleAlpha);
                        ctx.beginPath();
                        ctx.arc(ox, oy, r * 0.065, 0, Math.PI * 2);
                        ctx.fill();
                    });

                    // Glowing 4-point star topper
                    const starScale = hasInPlaceAnim ? (1 + 0.18 * Math.sin(inPlacePhase * 2 + idx)) : 1;
                    ctx.fillStyle = withAlpha(topperColor, 'eb');
                    drawFourPointStar(ctx, 0, -r * 0.92, r * 0.22 * starScale);
                    ctx.fill();

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
                    const bColor = getPatternColor(palette, col + row * 3, accent, secondary);
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
            const rStart = Math.floor((minY - fallDy) / stepY) - 2, rEnd = Math.ceil((maxY - fallDy) / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
            const snowflakeStyle = options.snowflakeStyle || 'all';

            for (let row = rStart; row <= rEnd; row++) {
                const rowOffset = (((row % 2) + 2) % 2) * (stepX * 0.5);
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 19 + col * 31);
                    const sizeHash = (((idx * 7919 + 104729) % 1000) / 1000);
                    const sizeMult = (1 - sizeVarAmount * 0.45) + sizeHash * (sizeVarAmount * 0.95);
                    const r = baseFlakeR * (0.80 + (idx % 3) * 0.12) * sizeMult;

                    const scatterX = ((((idx * 43) % 100) / 100 - 0.5) * stepX * 0.55) * scatterAmount;
                    const scatterY = ((((idx * 67) % 100) / 100 - 0.5) * stepY * 0.55) * scatterAmount;
                    const cx = col * stepX + rowOffset + scatterX + fallSwayX;
                    const cy = row * stepY + scatterY + fallDy;

                    const randomAngle = ((((idx * 137) % 360) / 360) * Math.PI * 2) * rotVarAmount;
                    const baseRot = (idx % 6) * (Math.PI / 6) + randomAngle;
                    const rotDir = (idx & 1) ? 1 : -1;
                    const inPlaceRot = hasInPlaceAnim ? (inPlacePhase * 0.22 * rotDir) : 0;
                    const rot = baseRot + inPlaceRot;

                    const sColor = getPatternColor(palette, idx, accent, secondary);
                    const shimmer = hasInPlaceAnim ? (0.84 + 0.16 * Math.sin(inPlacePhase * 1.6 + idx)) : 1;
                    const alphaHex = Math.max(0, Math.min(255, Math.round(0.95 * shimmer * 255))).toString(16).padStart(2, '0');

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
                    ctx.strokeStyle = withAlpha(sColor, alphaHex);

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
                            ctx.fillStyle = withAlpha(accent, 'ee');
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
                            ctx.fillStyle = withAlpha(sColor, fillMode === 'solid' ? 'ff' : fillHex);
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
            }
        } else if (pattern === 'hearts') {
            // Smooth floating vector hearts
            const stepX = Math.max(30, fullWidth / 11);
            const stepY = stepX * 0.88;
            const baseHeartR = stepX * 0.24;
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor((minY - fallDy) / stepY) - 2, rEnd = Math.ceil((maxY - fallDy) / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;

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
                    const hColor = getPatternColor(palette, idx, accent, secondary);
                    const beat = hasInPlaceAnim ? (1 + 0.09 * Math.sin(inPlacePhase * 2 + idx)) : 1;
                    const r = baseHeartR * (0.82 + (idx % 3) * 0.14) * beat * sizeMult;
                    const tilt = ((idx % 5) - 2) * 0.08 + (hasInPlaceAnim ? Math.sin(inPlacePhase + idx) * 0.08 : 0);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(tilt);
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
                    const mainCol = getPatternColor(palette, idx, accent, secondary);
                    const subCol = getPatternColor(palette, idx + 1, secondary, accent);
                    const bloom = hasInPlaceAnim ? (0.86 + 0.18 * Math.sin(inPlacePhase * 1.8 + idx * 1.1)) : 1;
                    const r = baseBurstR * (0.8 + (idx % 3) * 0.12) * bloom * sizeMult;
                    const rays = 12;

                    ctx.save();
                    ctx.translate(cx, cy);

                    // Outer radiating firework streaks
                    ctx.strokeStyle = withAlpha(mainCol, '95');
                    ctx.fillStyle = withAlpha(subCol, hasFill ? fillHex : 'cc');
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
            ctx.fillStyle = withAlpha(accent, '70');
            ctx.globalAlpha *= 0.5;
            ctx.beginPath(); ctx.moveTo(width * 0.55, minY); ctx.lineTo(maxX, minY); ctx.lineTo(maxX, height * 0.85); ctx.closePath(); ctx.fill();
            ctx.globalAlpha *= 0.3;
            ctx.fillStyle = withAlpha(secondary, '70');
            ctx.beginPath(); ctx.moveTo(minX, height * 0.68); ctx.lineTo(width * 0.72, maxY); ctx.lineTo(minX, maxY); ctx.closePath(); ctx.fill();
        } else {
            // Orbits (default fallback)
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.ellipse(width * 0.85, height * 0.2, width * (0.23 + i * 0.06), height * (0.17 + i * 0.04), -0.5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.restore();

        if (motion === 'aurora' || motion === 'flow') {
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

        if (motion === 'sweep') {
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
    }

    const SNOWFLAKE_STYLES = ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle'];

    const exported = {
        PATTERNS,
        PATTERN_CATEGORIES,
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
