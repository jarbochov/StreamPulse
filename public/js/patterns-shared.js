(function(root) {
    'use strict';

    const PATTERNS = [
        'grid', 'geometry', 'orbits', 'hexagons', 'diamonds',
        'isometric', 'mesh', 'sunburst', 'triangles', 'chevrons',
        'checker', 'waves', 'rings', 'scales', 'topography',
        'starfield', 'sparkles', 'dots', 'confetti', 'circuit'
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
        }
    ];

    /**
     * Draws a procedural pattern onto any canvas context.
     * Shared across Promo Editor and Custom Overlay Editor.
     * 
     * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context
     * @param {string} pattern - Pattern identifier (e.g. 'hexagons', 'circuit')
     * @param {number} width - Canvas or tile width
     * @param {number} height - Canvas or tile height
     * @param {object} options - Custom options (scale, color, accent, secondary, time, motion, speed, lineWidth)
     */
    function drawProceduralPattern(ctx, pattern, width, height, options = {}) {
        if (!pattern || !ctx || !(width > 0) || !(height > 0)) return;

        const fullWidth = width, fullHeight = height;
        const scale = Math.max(0.05, (options.scale || 100) / 100);
        const time = options.time || 0;
        const motion = options.motion || 'none';
        const speed = options.speed || 1;
        const baseColor = options.color || options.background || '';
        const accent = options.accent || '#58a6ff';
        const secondary = options.secondary || options.altColor || accent;
        const customLineWidth = options.lineWidth;

        // Base fill if specified
        if (baseColor && baseColor !== 'transparent') {
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, width, height);
        }

        ctx.save();
        const phase = time * Math.PI / 3 * speed;
        const pulse = motion === 'pulse' ? (1 - Math.cos(phase)) / 2 : 0;

        // Pattern scale: virtual canvas so tiles cover frame
        ctx.scale(scale, scale);
        width = fullWidth / scale;
        height = fullHeight / scale;

        if (motion === 'drift') {
            ctx.translate(Math.sin(phase) * width * 0.05, Math.cos(phase) * height * 0.05);
        }
        if (motion === 'sway') {
            ctx.translate(width / 2, height / 2);
            ctx.rotate(Math.sin(phase) * 0.12);
            ctx.scale(1.2 + Math.cos(phase) * 0.06, 1.2 + Math.cos(phase) * 0.06);
            ctx.translate(-width / 2, -height / 2);
        }
        if (motion === 'orbit') {
            const r = Math.min(width, height) * 0.04;
            ctx.translate(Math.cos(phase) * r, Math.sin(phase) * r);
            ctx.translate(width / 2, height / 2);
            ctx.rotate(Math.sin(phase * 2) * 0.04);
            ctx.translate(-width / 2, -height / 2);
        }
        if (motion === 'pulse') {
            const zoom = 1 + pulse * 0.03;
            ctx.translate(width / 2, height / 2);
            ctx.scale(zoom, zoom);
            ctx.translate(-width / 2, -height / 2);
            ctx.globalAlpha = 0.62 + 0.38 * pulse;
        }
        if (motion === 'pan') {
            const angle = ((options.angle ?? 45) - 90) * Math.PI / 180;
            const u = Math.sin(time / 6 * speed * Math.PI * 2);
            const zoom = 1.25, mx = width * (zoom - 1) / 2, my = height * (zoom - 1) / 2;
            ctx.translate(Math.cos(angle) * mx * u, Math.sin(angle) * my * u);
        }

        ctx.strokeStyle = (accent.startsWith('#') && accent.length === 7) ? accent + (options.accentAlpha || '55') : accent;
        ctx.lineWidth = (customLineWidth || Math.max(1.2, fullWidth / 700)) / scale;

        if (pattern === 'grid') {
            const step = Math.max(3, fullWidth / 32);
            ctx.beginPath();
            for (let x = 0; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
            for (let y = 0; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
            ctx.stroke();
            ctx.fillStyle = accent;
            ctx.fillRect(width * 0.92, height * 0.12, width * 0.012, height * 0.28);
        } else if (pattern === 'hexagons') {
            const radius = Math.max(3, fullWidth / 28), rowStep = Math.sqrt(3) * radius;
            const columnStep = radius * 1.5;
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 700);
            ctx.beginPath();
            for (let col = -1; col <= width / columnStep + 1; col++) {
                for (let row = -1; row <= height / rowStep + 1; row++) {
                    const cx = col * columnStep, cy = row * rowStep + (col & 1) * rowStep / 2;
                    for (let point = 0; point < 6; point++) {
                        const angle = point * Math.PI / 3, x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
                        if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                }
            }
            ctx.stroke();
        } else if (pattern === 'diamonds') {
            const step = Math.max(4, fullWidth / 18), radius = step * 0.46;
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 720);
            ctx.beginPath();
            for (let y = -step; y < height + step; y += step) {
                for (let x = -step; x < width + step; x += step) {
                    ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();
                }
            }
            ctx.stroke();
        } else if (pattern === 'isometric') {
            const edge = Math.max(1, fullWidth / 20), half = edge * Math.sqrt(3) / 2, slope = Math.tan(Math.PI / 6);
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 700);
            ctx.beginPath();
            for (let x = 0; x <= width + half; x += half) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
            for (let c = -width * slope - edge; c <= height + width * slope; c += edge) {
                ctx.moveTo(0, c); ctx.lineTo(width, c + width * slope);
                ctx.moveTo(0, c + width * slope); ctx.lineTo(width, c);
            }
            ctx.stroke();
        } else if (pattern === 'mesh') {
            const rows = 12, columns = 18, amplitude = Math.max(1, fullWidth / 60);
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 800);
            for (let row = 0; row <= rows; row++) {
                ctx.beginPath();
                for (let column = 0; column <= columns * 8; column++) {
                    const x = column * width / (columns * 8), y = row * height / rows + Math.sin(x / width * Math.PI * 4 + row * 0.45) * amplitude;
                    if (!column) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            for (let column = 0; column <= columns; column++) {
                ctx.beginPath();
                for (let row = 0; row <= rows * 8; row++) {
                    const y = row * height / (rows * 8), x = column * width / columns + Math.sin(y / height * Math.PI * 3 + column * 0.5) * amplitude;
                    if (!row) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'sunburst') {
            const cx = width * 0.5, cy = height * 0.5, radius = Math.hypot(width, height), rays = 28;
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 700);
            for (let i = 0; i < rays; i++) {
                const angle = i * Math.PI * 2 / rays;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
            }
        } else if (pattern === 'dots') {
            const step = Math.max(3, fullWidth / 24), radius = Math.max(1, fullWidth / 300);
            ctx.fillStyle = accent.length === 7 ? accent + '60' : accent;
            for (let y = step / 2; y < height; y += step) {
                for (let x = step / 2; x < width; x += step) {
                    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
                }
            }
        } else if (pattern === 'starfield' || pattern === 'sparkles') {
            const count = pattern === 'starfield' ? 190 : 70;
            for (let i = 0; i < count; i++) {
                const x = ((i * 0.61803398875) % 1) * width;
                const y = ((i * 0.75487766625) % 1) * height;
                const size = Math.max(1.5, width / (pattern === 'starfield' ? 420 : 260)) * (1 + i % 3 * 0.35);
                ctx.fillStyle = i % 5 ? (accent.length === 7 ? accent + '70' : accent) : (secondary.length === 7 ? secondary + 'a0' : secondary);
                if (pattern === 'starfield' && i % 4) {
                    ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, Math.PI * 2); ctx.fill();
                } else {
                    ctx.beginPath(); ctx.moveTo(x, y - size * 2); ctx.lineTo(x + size * 0.38, y - size * 0.38);
                    ctx.lineTo(x + size * 2, y); ctx.lineTo(x + size * 0.38, y + size * 0.38);
                    ctx.lineTo(x, y + size * 2); ctx.lineTo(x - size * 0.38, y + size * 0.38);
                    ctx.lineTo(x - size * 2, y); ctx.lineTo(x - size * 0.38, y - size * 0.38); ctx.closePath(); ctx.fill();
                }
            }
        } else if (pattern === 'checker') {
            const step = Math.max(4, fullWidth / 18);
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.16;
            for (let row = 0; row * step < height; row++) {
                for (let col = row % 2; col * step < width; col += 2) ctx.fillRect(col * step, row * step, step, step);
            }
        } else if (pattern === 'waves') {
            const rowStep = Math.max(4, fullHeight / 18), amplitude = Math.max(1, fullWidth / 100), wavelength = Math.max(8, fullWidth / 8);
            const wavePhase = time > 0 ? (time * 1.5 * speed) : 0;
            ctx.lineWidth = (customLineWidth || Math.max(1.5, fullWidth / 500)) / scale;
            for (let row = 0; row <= height / rowStep; row++) {
                const baseY = row * rowStep;
                ctx.beginPath();
                for (let x = 0; x <= width; x += Math.max(1, fullWidth / 180)) {
                    const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + row * 0.45 + wavePhase) * amplitude;
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (pattern === 'rings') {
            const cx = width * 0.5, cy = height * 0.5, step = Math.max(3, fullWidth / 36);
            const rPhase = time > 0 ? (time * 20 * speed) % step : 0;
            ctx.lineWidth = (customLineWidth || Math.max(1.5, fullWidth / 500)) / scale;
            for (let radius = step + rPhase; radius < Math.hypot(width, height) + step; radius += step) {
                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (pattern === 'scales') {
            const step = Math.max(3, fullWidth / 24), rowStep = step * 0.5;
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 720);
            for (let row = -1; row < height / rowStep + 1; row++) {
                const offset = (row & 1) * step / 2, y = row * rowStep;
                for (let x = -step; x < width + step; x += step) {
                    ctx.beginPath(); ctx.arc(x + offset, y, step / 2, 0, Math.PI); ctx.stroke();
                }
            }
        } else if (pattern === 'triangles') {
            const size = Math.max(4, fullWidth / 20), rowStep = size * Math.sqrt(3) / 2;
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 700);
            for (let row = -1; row * rowStep < height + rowStep; row++) {
                for (let col = -1; col * size < width + size; col++) {
                    const x = col * size + (row & 1) * size / 2, y = row * rowStep;
                    ctx.beginPath();
                    ctx.moveTo(x, y + rowStep); ctx.lineTo(x + size / 2, y); ctx.lineTo(x + size, y + rowStep);
                    ctx.closePath(); ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size, y + rowStep); ctx.lineTo(x + size * 1.5, y);
                    ctx.closePath(); ctx.stroke();
                }
            }
        } else if (pattern === 'chevrons') {
            const step = Math.max(4, fullWidth / 22), rowStep = step * 0.65;
            ctx.lineWidth = customLineWidth || Math.max(1.5, fullWidth / 500);
            ctx.beginPath();
            for (let y = -rowStep; y < height + rowStep; y += rowStep) {
                for (let x = -step; x < width + step; x += step) {
                    ctx.moveTo(x, y); ctx.lineTo(x + step / 2, y + rowStep / 2); ctx.lineTo(x + step, y);
                }
            }
            ctx.stroke();
        } else if (pattern === 'topography') {
            const centers = [[0.2, 0.25], [0.76, 0.32], [0.49, 0.82]], step = Math.max(2, fullWidth / 54);
            ctx.lineWidth = customLineWidth || Math.max(1, fullWidth / 850);
            for (const [cx, cy] of centers) {
                for (let ring = 1; ring <= 10; ring++) {
                    ctx.beginPath();
                    ctx.ellipse(width * cx, height * cy, step * ring, step * ring * (0.58 + (ring % 3) * 0.08), ring * 0.13, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        } else if (pattern === 'confetti') {
            for (let i = 0; i < 180; i++) {
                const x = (i * 157.31) % width, y = (i * 281.17) % height, size = Math.max(1, fullWidth / 180) * (1 + i % 3);
                ctx.save(); ctx.translate(x, y); ctx.rotate(i * 2.399);
                ctx.fillStyle = i % 2 ? (accent.length === 7 ? accent + '90' : accent) : (secondary.length === 7 ? secondary + '90' : secondary);
                if (i % 3 === 0) {
                    ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
                } else ctx.fillRect(-size / 2, -size / 4, size, size / 2);
                ctx.restore();
            }
        } else if (pattern === 'circuit') {
            const step = Math.max(6, fullWidth / 16), node = Math.max(1, fullWidth / 220);
            ctx.lineWidth = customLineWidth || Math.max(1.5, fullWidth / 500);
            for (let row = 0; row * step < height + step; row++) {
                for (let col = 0; col * step < width + step; col++) {
                    const x = col * step, y = row * step, direction = (row + col) % 2 ? 1 : -1;
                    ctx.beginPath();
                    ctx.moveTo(x, y); ctx.lineTo(x + step * 0.32, y);
                    ctx.lineTo(x + step * 0.32, y + step * 0.55 * direction);
                    ctx.lineTo(x + step * 0.78, y + step * 0.55 * direction);
                    ctx.stroke();
                    ctx.beginPath(); ctx.arc(x + step * 0.78, y + step * 0.55 * direction, node, 0, Math.PI * 2); ctx.stroke();
                }
            }
        } else if (pattern === 'geometry') {
            ctx.fillStyle = accent.length === 7 ? accent + '70' : accent;
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.moveTo(width * 0.55, 0); ctx.lineTo(width, 0); ctx.lineTo(width, height * 0.8); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 0.15;
            ctx.beginPath(); ctx.moveTo(0, height * 0.72); ctx.lineTo(width * 0.7, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
        } else {
            // Orbits (default fallback)
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.ellipse(width * 0.85, height * 0.2, width * (0.23 + i * 0.06), height * (0.17 + i * 0.04), -0.5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.restore();

        if (motion === 'sweep') {
            const t = ((time / 6 * speed) % 1 + 1) % 1;
            const eased = t * t * (3 - 2 * t);
            const span = fullWidth + fullHeight, band = span * 0.22;
            const pos = -band + eased * (span + band * 2);
            const sweep = ctx.createLinearGradient(pos - band, pos - band, pos + band, pos + band);
            const hexAccent = (accent.startsWith('#') && accent.length === 7) ? accent : '#58a6ff';
            sweep.addColorStop(0, hexAccent + '00');
            sweep.addColorStop(0.5, hexAccent + '5a');
            sweep.addColorStop(1, hexAccent + '00');
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
