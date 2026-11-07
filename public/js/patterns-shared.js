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
        warm: ['#f59e0b', '#ef4444', '#d97706', '#fef3c7', '#fb7185'],
        cool: ['#38bdf8', '#60a5fa', '#34d399', '#c084fc', '#e2e8f0'],
        autumn: ['#dc2626', '#ea580c', '#eab308', '#65a30d', '#92400e'],
        pastel: ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#93c5fd', '#d8b4fe']
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
        const speed = options.speed || 1;
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
        const isAnimated = motion !== 'none' && time > 0;
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

        // Continuous wrap progress for 'fall' motion
        const fallProgress = motion === 'fall' ? (((time * 0.22 * speed) % 1 + 1) % 1) : 0;
        const fallSwayX = motion === 'fall' ? Math.sin(phase * 0.8) * (fullWidth * 0.018) : 0;

        ctx.strokeStyle = withAlpha(accent, options.accentAlpha || '55');
        ctx.lineWidth = getLineW(1);

        if (pattern === 'grid') {
            const step = Math.max(3, fullWidth / 32);
            const dy = fallProgress * step;
            const x0 = Math.floor(minX / step) * step;
            const y0 = Math.floor(minY / step) * step;
            ctx.beginPath();
            for (let x = x0; x <= maxX; x += step) { ctx.moveTo(x + fallSwayX, minY); ctx.lineTo(x + fallSwayX, maxY); }
            for (let y = y0; y <= maxY; y += step) { ctx.moveTo(minX, y + dy); ctx.lineTo(maxX, y + dy); }
            ctx.stroke();
            ctx.fillStyle = accent;
            ctx.fillRect(width * 0.92, height * 0.12, width * 0.012, height * 0.28);
        } else if (pattern === 'hexagons') {
            const radius = Math.max(3, fullWidth / 28), rowStep = Math.sqrt(3) * radius;
            const columnStep = radius * 1.5;
            const dy = fallProgress * rowStep;
            ctx.lineWidth = getLineW(1);
            const cStart = Math.floor(minX / columnStep) - 1, cEnd = Math.ceil(maxX / columnStep) + 1;
            const rStart = Math.floor(minY / rowStep) - 1, rEnd = Math.ceil(maxY / rowStep) + 1;
            for (let col = cStart; col <= cEnd; col++) {
                for (let row = rStart; row <= rEnd; row++) {
                    const cx = col * columnStep + fallSwayX;
                    const cy = row * rowStep + (col & 1) * rowStep / 2 + dy;
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
            const dy = fallProgress * step;
            ctx.lineWidth = getLineW(1);
            const x0 = Math.floor(minX / step) * step, y0 = Math.floor(minY / step) * step;
            for (let y = y0; y <= maxY + step; y += step) {
                for (let x = x0; x <= maxX + step; x += step) {
                    const cx = x + fallSwayX, cy = y + dy;
                    const color = getPatternColor(palette, Math.round(x / step + y / step * 3), accent, secondary);
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
            const dy = fallProgress * edge;
            ctx.lineWidth = getLineW(1);
            ctx.beginPath();
            const x0 = Math.floor(minX / half) * half;
            for (let x = x0; x <= maxX + half; x += half) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); }
            const spanW = maxX - minX;
            for (let c = minY - spanW * slope - edge; c <= maxY + spanW * slope + edge; c += edge) {
                ctx.moveTo(minX, c + dy); ctx.lineTo(maxX, c + dy + spanW * slope);
                ctx.moveTo(minX, c + dy + spanW * slope); ctx.lineTo(maxX, c + dy);
            }
            ctx.stroke();
        } else if (pattern === 'mesh') {
            const rows = 14, columns = 20, amplitude = Math.max(1, fullWidth / 60);
            const spanW = maxX - minX, spanH = maxY - minY;
            const dy = fallProgress * (spanH / rows);
            ctx.lineWidth = getLineW(0.9);
            for (let row = -1; row <= rows + 1; row++) {
                const color = getPatternColor(palette, row, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '75');
                ctx.beginPath();
                for (let column = 0; column <= columns * 6; column++) {
                    const x = minX + column * spanW / (columns * 6);
                    const y = minY + row * spanH / rows + dy + Math.sin((x - minX) / spanW * Math.PI * 4 + row * 0.45) * amplitude;
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
            const rotOffset = motion === 'fall' ? fallProgress * (Math.PI * 2 / rays) : 0;
            ctx.lineWidth = getLineW(1);
            for (let i = 0; i < rays; i++) {
                const angle = i * Math.PI * 2 / rays + rotOffset;
                const color = getPatternColor(palette, i, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
            }
        } else if (pattern === 'dots') {
            const step = Math.max(3, fullWidth / 24), radius = Math.max(1.2, fullWidth / 300);
            const dy = fallProgress * step;
            const x0 = Math.floor(minX / step) * step + step / 2;
            const y0 = Math.floor(minY / step) * step + step / 2;
            for (let y = y0; y <= maxY; y += step) {
                for (let x = x0; x <= maxX; x += step) {
                    const color = getPatternColor(palette, Math.round(x / step + y / step * 3), accent, secondary);
                    ctx.fillStyle = withAlpha(color, hasFill ? fillHex : '65');
                    ctx.beginPath(); ctx.arc(x + fallSwayX, y + dy, radius * (hasFill ? (0.8 + fillOp * 0.5) : 1), 0, Math.PI * 2); ctx.fill();
                }
            }
        } else if (pattern === 'starfield' || pattern === 'sparkles') {
            const count = pattern === 'starfield' ? 190 : 75;
            const refW = fullWidth * 1.44;
            const refH = fullHeight * 1.44;
            const ox = (width - refW) / 2;
            const oy = (height - refH) / 2;
            const dy = fallProgress * refH;
            for (let i = 0; i < count; i++) {
                const u = (i * 0.61803398875) % 1;
                const v = (i * 0.75487766625) % 1;
                const x = ox + u * refW + fallSwayX * (0.6 + (i % 3) * 0.3);
                const y = oy + ((v * refH + dy) % refH);
                const twinkleMult = isAnimated ? (0.72 + 0.28 * Math.sin(phase * 1.5 + i * 1.7)) : 1;
                const size = Math.max(1.5, fullWidth / (pattern === 'starfield' ? 420 : 250)) * (1 + (i % 3) * 0.35) * twinkleMult;
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
            const dy = fallProgress * (step * 2);
            const rStart = Math.floor(minY / step) - 2, rEnd = Math.ceil(maxY / step) + 2;
            const cStart = Math.floor(minX / step) - 2, cEnd = Math.ceil(maxX / step) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    if (((row + col) & 1) === 0) {
                        const color = getPatternColor(palette, row * 7 + col, accent, secondary);
                        ctx.fillStyle = withAlpha(color, hasFill ? fillHex : '28');
                        ctx.fillRect(col * step + fallSwayX, row * step + dy, step, step);
                    }
                }
            }
        } else if (pattern === 'waves') {
            const rowStep = Math.max(4, fullHeight / 18), amplitude = Math.max(1, fullWidth / 100), wavelength = Math.max(8, fullWidth / 8);
            const wavePhase = time > 0 ? (time * 1.5 * speed) : 0;
            const dy = fallProgress * rowStep;
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor(minY / rowStep) - 1, rEnd = Math.ceil(maxY / rowStep) + 1;
            const xStep = Math.max(2, fullWidth / 160);
            for (let row = rStart; row <= rEnd; row++) {
                const color = getPatternColor(palette, row, accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
                const baseY = row * rowStep + dy;
                ctx.beginPath();
                for (let x = minX; x <= maxX; x += xStep) {
                    const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + row * 0.45 + wavePhase) * amplitude;
                    if (x === minX) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'rings') {
            const cx = width * 0.5, cy = height * 0.5, step = Math.max(3, fullWidth / 36);
            const rPhase = time > 0 ? (time * 20 * speed) % step : 0;
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
            const dy = fallProgress * (rowStep * 2);
            ctx.lineWidth = getLineW(1);
            const rStart = Math.floor(minY / rowStep) - 2, rEnd = Math.ceil(maxY / rowStep) + 2;
            const x0 = Math.floor(minX / step) * step;
            for (let row = rStart; row <= rEnd; row++) {
                const offset = (row & 1) * step / 2, y = row * rowStep + dy;
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
            const dy = fallProgress * (rowStep * 2);
            ctx.lineWidth = getLineW(1);
            const rStart = Math.floor(minY / rowStep) - 2, rEnd = Math.ceil(maxY / rowStep) + 2;
            const cStart = Math.floor(minX / size) - 2, cEnd = Math.ceil(maxX / size) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const color1 = getPatternColor(palette, row * 7 + col * 3, accent, secondary);
                    const color2 = getPatternColor(palette, row * 7 + col * 3 + 1, secondary, accent);
                    const x = col * size + (row & 1) * size / 2 + fallSwayX, y = row * rowStep + dy;
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
            const dy = fallProgress * rowStep;
            ctx.lineWidth = getLineW(1.3);
            const y0 = Math.floor(minY / rowStep) * rowStep;
            const x0 = Math.floor(minX / step) * step;
            for (let y = y0; y <= maxY + rowStep; y += rowStep) {
                const color = getPatternColor(palette, Math.round(y / rowStep), accent, secondary);
                ctx.strokeStyle = withAlpha(color, '85');
                ctx.beginPath();
                for (let x = x0; x <= maxX + step; x += step) {
                    const cx = x + fallSwayX, cy = y + dy;
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
            const dy = fallProgress * refH;
            for (let i = 0; i < 180; i++) {
                const u = (i * 0.61803398875) % 1;
                const v = (i * 0.75487766625) % 1;
                const x = ox + u * refW + fallSwayX * (0.5 + (i % 4) * 0.25);
                const y = oy + ((v * refH + dy * (0.8 + (i % 3) * 0.2)) % refH);
                const size = Math.max(2, fullWidth / 180) * (1 + (i % 3));
                const rot = i * 2.399 + (isAnimated ? Math.sin(phase + i * 0.7) * 0.35 : 0);
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
            const dy = fallProgress * (step * 2);
            ctx.lineWidth = getLineW(1.3);
            const rStart = Math.floor(minY / step) - 1, rEnd = Math.ceil(maxY / step) + 1;
            const cStart = Math.floor(minX / step) - 1, cEnd = Math.ceil(maxX / step) + 1;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const x = col * step + fallSwayX, y = row * step + dy;
                    const direction = ((row + col) & 1) ? 1 : -1;
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
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor(minY / stepY) - 2, rEnd = Math.ceil(maxY / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
            const leafPalette = palette === 'dual' ? 'dual' : palette;

            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 31);
                    const jitterX = (((idx * 37) % 100) / 100 - 0.5) * stepX * 0.32;
                    const jitterY = (((idx * 53) % 100) / 100 - 0.5) * stepY * 0.32;
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + jitterX + fallSwayX;
                    const cy = row * stepY + jitterY + dy;
                    const baseAngle = ((idx % 12) / 12) * Math.PI * 2;
                    const flutter = isAnimated ? Math.sin(phase + idx * 0.9) * 0.22 : 0;
                    const leafColor = getPatternColor(leafPalette, idx, accent, secondary);
                    const r = leafR * (0.85 + (idx % 3) * 0.12);

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
            // Festive Thanksgiving turkeys with radiating tail feathers
            const stepX = Math.max(36, fullWidth / 9);
            const stepY = stepX * 0.92;
            const r = stepX * 0.31;
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor(minY / stepY) - 2, rEnd = Math.ceil(maxY / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 13 + col * 29);
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + fallSwayX;
                    const cy = row * stepY + dy;
                    const tilt = isAnimated ? Math.sin(phase + idx * 0.8) * 0.08 : 0;
                    const fanSpread = isAnimated ? (1 + Math.sin(phase * 1.4 + idx) * 0.06) : 1;

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(tilt);

                    // 7 radiating tail feathers
                    const feathers = 7;
                    for (let f = 0; f < feathers; f++) {
                        const fNorm = (f - (feathers - 1) / 2) / ((feathers - 1) / 2);
                        const fAng = fNorm * (Math.PI * 0.42) * fanSpread;
                        const fCol = getPatternColor(palette, f + idx * 2, accent, secondary);
                        ctx.save();
                        ctx.translate(0, r * 0.18);
                        ctx.rotate(fAng);
                        ctx.fillStyle = withAlpha(fCol, hasFill ? fillHex : '38');
                        ctx.strokeStyle = withAlpha(fCol, '95');
                        ctx.beginPath();
                        ctx.ellipse(0, -r * 0.62, r * 0.19, r * 0.48, 0, 0, Math.PI * 2);
                        if (hasFill) ctx.fill();
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Plump turkey body
                    const bodyCol = getPatternColor(palette, idx, accent, secondary);
                    ctx.fillStyle = withAlpha(bodyCol, hasFill ? fillHex : '4d');
                    ctx.strokeStyle = withAlpha(bodyCol, 'b0');
                    ctx.beginPath();
                    ctx.arc(0, r * 0.24, r * 0.42, 0, Math.PI * 2);
                    if (hasFill) ctx.fill();
                    ctx.stroke();

                    // Turkey head
                    ctx.fillStyle = withAlpha(bodyCol, hasFill ? fillHex : '60');
                    ctx.beginPath();
                    ctx.arc(0, -r * 0.22, r * 0.24, 0, Math.PI * 2);
                    if (hasFill) ctx.fill();
                    ctx.stroke();

                    // Beak & wattle
                    const beakCol = getPatternColor(palette, idx + 1, secondary, accent);
                    ctx.fillStyle = withAlpha(beakCol, 'cc');
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.09, -r * 0.2);
                    ctx.lineTo(r * 0.09, -r * 0.2);
                    ctx.lineTo(0, -r * 0.04);
                    ctx.closePath();
                    ctx.fill();

                    // Wattle teardrop
                    ctx.beginPath();
                    ctx.arc(r * 0.09, -r * 0.1, r * 0.065, 0, Math.PI * 2);
                    ctx.fill();

                    // Feet
                    ctx.strokeStyle = withAlpha(beakCol, '95');
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.16, r * 0.65); ctx.lineTo(-r * 0.2, r * 0.84);
                    ctx.moveTo(r * 0.16, r * 0.65); ctx.lineTo(r * 0.2, r * 0.84);
                    ctx.stroke();

                    ctx.restore();
                }
            }
        } else if (pattern === 'pumpkins') {
            // Harvest ribbed pumpkins with curly vine tendrils
            const stepX = Math.max(32, fullWidth / 10);
            const stepY = stepX * 0.88;
            const r = stepX * 0.28;
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor(minY / stepY) - 2, rEnd = Math.ceil(maxY / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 19 + col * 23);
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + fallSwayX;
                    const cy = row * stepY + dy;
                    const pColor = getPatternColor(palette, idx, accent, secondary);
                    const stemColor = getPatternColor(palette, idx + 2, secondary, accent);
                    const tilt = ((idx % 5) - 2) * 0.05 + (isAnimated ? Math.sin(phase + idx) * 0.06 : 0);

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
            const r = stepX * 0.33;
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor(minY / stepY) - 2, rEnd = Math.ceil(maxY / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;
            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 29);
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + fallSwayX;
                    const cy = row * stepY + dy;
                    const sway = isAnimated ? Math.sin(phase + idx * 0.7) * 0.05 : 0;
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
                        const twinkleAlpha = isAnimated && ((Math.floor(time * 2 + idx + oIdx) % 2) === 0) ? 'ff' : '90';
                        ctx.fillStyle = withAlpha(ornColor, twinkleAlpha);
                        ctx.beginPath();
                        ctx.arc(ox, oy, r * 0.065, 0, Math.PI * 2);
                        ctx.fill();
                    });

                    // Glowing 4-point star topper
                    const starScale = isAnimated ? (1 + 0.18 * Math.sin(phase * 2 + idx)) : 1;
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
            const bulbR = Math.max(3.5, bulbStep * 0.17);
            const dy = fallProgress * rowStep;
            ctx.lineWidth = getLineW(1.2);

            const rStart = Math.floor(minY / rowStep) - 1, rEnd = Math.ceil(maxY / rowStep) + 1;
            const cStart = Math.floor(minX / bulbStep) - 2, cEnd = Math.ceil(maxX / bulbStep) + 2;

            for (let row = rStart; row <= rEnd; row++) {
                const baseY = row * rowStep + dy;
                const rowPhase = (row & 1) * Math.PI;

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
                for (let col = cStart; col <= cEnd; col++) {
                    const bx = col * bulbStep + (row & 1) * (bulbStep * 0.5) + fallSwayX;
                    const wireWave = ((bx - fallSwayX) / (bulbStep * 3)) * Math.PI * 2 + rowPhase;
                    const by = baseY + Math.sin(wireWave) * sag;
                    const slope = Math.cos(wireWave) * 0.24;
                    const idx = Math.abs(row * 13 + col * 7);
                    const bColor = getPatternColor(palette, col + row * 3, accent, secondary);
                    const glowPulse = isAnimated ? (0.65 + 0.35 * Math.sin(phase * 2.2 + idx * 1.3)) : 0.9;

                    ctx.save();
                    ctx.translate(bx, by);
                    ctx.rotate(-slope * 0.5 + (isAnimated ? Math.sin(phase + col * 0.5) * 0.08 : 0));

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
            // 6-branch crystalline dendritic snowflakes
            const stepX = Math.max(34, fullWidth / 10);
            const stepY = stepX * 0.86;
            const flakeR = stepX * 0.27;
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.1);
            const rStart = Math.floor(minY / stepY) - 2, rEnd = Math.ceil(maxY / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;

            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 19 + col * 31);
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + fallSwayX;
                    const cy = row * stepY + dy;
                    const sColor = getPatternColor(palette, idx, accent, secondary);
                    const r = flakeR * (0.76 + (idx % 3) * 0.14);
                    const rot = (idx % 6) * (Math.PI / 6) + (isAnimated ? phase * 0.25 * ((idx & 1) ? 1 : -1) : 0);

                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(rot);
                    ctx.strokeStyle = withAlpha(sColor, '95');

                    ctx.beginPath();
                    for (let arm = 0; arm < 6; arm++) {
                        const a = (arm * Math.PI) / 3;
                        const cosA = Math.cos(a), sinA = Math.sin(a);
                        // Main crystal branch
                        ctx.moveTo(0, 0);
                        ctx.lineTo(cosA * r, sinA * r);

                        // Outer & inner V-dendrites
                        for (const dist of [0.48, 0.76]) {
                            const bx = cosA * (r * dist);
                            const by = sinA * (r * dist);
                            const branchLen = r * (dist === 0.48 ? 0.32 : 0.24);
                            for (const side of [-1, 1]) {
                                const ba = a + side * (Math.PI / 3);
                                ctx.moveTo(bx, by);
                                ctx.lineTo(bx + Math.cos(ba) * branchLen, by + Math.sin(ba) * branchLen);
                            }
                        }
                    }
                    ctx.stroke();

                    // Inner hexagonal crystal ring
                    ctx.beginPath();
                    for (let p = 0; p < 6; p++) {
                        const a = (p * Math.PI) / 3;
                        const hx = Math.cos(a) * r * 0.24;
                        const hy = Math.sin(a) * r * 0.24;
                        if (p === 0) ctx.moveTo(hx, hy);
                        else ctx.lineTo(hx, hy);
                    }
                    ctx.closePath();
                    if (hasFill) {
                        ctx.fillStyle = withAlpha(sColor, fillHex);
                        ctx.fill();
                    }
                    ctx.stroke();

                    ctx.restore();
                }
            }
        } else if (pattern === 'hearts') {
            // Smooth floating vector hearts
            const stepX = Math.max(30, fullWidth / 11);
            const stepY = stepX * 0.88;
            const heartR = stepX * 0.24;
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor(minY / stepY) - 2, rEnd = Math.ceil(maxY / stepY) + 2;
            const cStart = Math.floor(minX / stepX) - 2, cEnd = Math.ceil(maxX / stepX) + 2;

            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 17 + col * 23);
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + fallSwayX;
                    const cy = row * stepY + dy;
                    const hColor = getPatternColor(palette, idx, accent, secondary);
                    const beat = isAnimated ? (1 + 0.08 * Math.sin(phase * 2 + idx)) : 1;
                    const r = heartR * (0.82 + (idx % 3) * 0.14) * beat;
                    const tilt = ((idx % 5) - 2) * 0.08 + (isAnimated ? Math.sin(phase + idx) * 0.08 : 0);

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
            const burstR = stepX * 0.34;
            const dy = fallProgress * (stepY * 2);
            ctx.lineWidth = getLineW(1.15);
            const rStart = Math.floor(minY / stepY) - 1, rEnd = Math.ceil(maxY / stepY) + 1;
            const cStart = Math.floor(minX / stepX) - 1, cEnd = Math.ceil(maxX / stepX) + 1;

            for (let row = rStart; row <= rEnd; row++) {
                for (let col = cStart; col <= cEnd; col++) {
                    const idx = Math.abs(row * 13 + col * 29);
                    const cx = col * stepX + (row & 1) * (stepX * 0.5) + fallSwayX;
                    const cy = row * stepY + dy;
                    const mainCol = getPatternColor(palette, idx, accent, secondary);
                    const subCol = getPatternColor(palette, idx + 1, secondary, accent);
                    const bloom = isAnimated ? (0.86 + 0.18 * Math.sin(phase * 1.8 + idx * 1.1)) : 1;
                    const r = burstR * (0.8 + (idx % 3) * 0.12) * bloom;
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

    const exported = {
        PATTERNS,
        PATTERN_CATEGORIES,
        PALETTES,
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
