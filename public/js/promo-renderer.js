import { promoFont } from './promo-fonts.js';

const images = new Map();

async function loadImage(url, qr = false) {
    if (!url) return null;
    if (!images.has(url)) {
        if (images.size > 12) images.delete(images.keys().next().value);
        const pending = (async () => {
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Could not load ${qr ? 'QR code' : 'image'} (${response.status}).`);
            let blob;
            if (qr) {
                const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
                if (svg.querySelector('parsererror') || svg.documentElement.localName !== 'svg') throw new Error('Invalid QR code response.');
                svg.documentElement.setAttribute('width', '1024'); svg.documentElement.setAttribute('height', '1024');
                blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
            } else blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            try {
                const image = new Image();
                image.src = objectUrl;
                await image.decode();
                return image;
            } finally { URL.revokeObjectURL(objectUrl); }
        })();
        images.set(url, pending);
        pending.catch(() => images.delete(url));
    }
    return images.get(url);
}

export function rect(block, width, height) {
    return { x: block.x, y: block.y, w: block.width ?? width, h: block.height ?? height };
}

function wrap(ctx, text, width) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
            const candidate = line ? `${line} ${word}` : word;
            if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
            if (line) { lines.push(line); line = ''; }
            for (const char of word) {
                if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
                line += char;
            }
        }
        lines.push(line);
    }
    return lines;
}

export function layoutText(ctx, value, box, s, font) {
    const lh = s.lineHeight || 1.12, italic = s.fontStyle === 'italic' ? 'italic ' : '';
    let size = Math.max(12, s.fontSize), lines;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${s.letterSpacing || 0}px`;
    for (; size >= 12; size--) {
        ctx.font = `${italic}${s.fontWeight} ${size}px ${font}`;
        lines = wrap(ctx, value, box.w);
        if (lines.length * size * lh <= box.h) break;
    }
    size = Math.max(12, size);
    const limit = Math.max(1, Math.floor(box.h / (size * lh)));
    if (lines.length > limit) {
        lines = lines.slice(0, limit);
        let last = lines.at(-1);
        while (last && ctx.measureText(last + '...').width > box.w) last = last.slice(0, -1);
        lines[lines.length - 1] = last + '...';
    }
    const align = s.textAlign || 'left', textHeight = lines.length * size * lh;
    ctx.textBaseline = 'top'; ctx.textAlign = align;
    const textX = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
    const textY = s.verticalAlign === 'middle' ? box.y + (box.h - textHeight) / 2
        : s.verticalAlign === 'bottom' ? box.y + box.h - textHeight : box.y;
    return { lines, size, lh, textX, textY, align };
}

function drawText(ctx, value, box, s, font, color) {
    const { lines, size, lh, textX, textY } = layoutText(ctx, value, box, s, font);
    const g = s.textGradient;
    if (g?.enabled) {
        const fill = g.type === 'radial'
            ? ctx.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, 0, box.x + box.w / 2, box.y + box.h / 2, Math.hypot(box.w, box.h) / 2)
            : (() => {
                const a = g.angle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), d = (Math.abs(box.w * dx) + Math.abs(box.h * dy)) / 2;
                const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
                return ctx.createLinearGradient(cx - dx * d, cy - dy * d, cx + dx * d, cy + dy * d);
            })();
        fill.addColorStop(0, g.from); fill.addColorStop(1, g.to);
        ctx.fillStyle = fill;
    } else ctx.fillStyle = color;
    const stroke = s.textStroke?.width > 0, shadow = s.textShadow?.blur > 0 && !(g?.enabled && s.background);
    if (stroke) { ctx.lineWidth = s.textStroke.width * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = s.textStroke.color; }
    lines.forEach((line, i) => {
        const y = textY + i * size * lh;
        if (stroke) ctx.strokeText(line, textX, y);
        if (shadow) { ctx.shadowBlur = s.textShadow.blur; ctx.shadowColor = s.textShadow.color; }
        ctx.fillText(line, textX, y);
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    });
}

function drawImage(ctx, image, box, block) {
    const scale = block.objectFit === 'contain' ? Math.min(box.w / image.width, box.h / image.height) : Math.max(box.w / image.width, box.h / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, box.x + (box.w - w) * block.focusX / 100, box.y + (box.h - h) * block.focusY / 100, w, h);
}

const PLAIN = { fontSize: 28, fontWeight: 400, textAlign: 'left', verticalAlign: 'middle' };

function drawVignette(ctx, width, height, amount) {
    if (!amount) return;
    const x = width / 2, y = height / 2, inner = Math.min(width, height) * .16, outer = Math.hypot(width, height) * .55;
    const gradient = ctx.createRadialGradient(x, y, inner, x, y, outer);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(Math.max(.1, .45 - Math.max(0, amount - 70) / 100), 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(1, amount / 100 * .65 + Math.max(0, amount - 70) / 30 * .35)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

function drawThemeBackdrop(ctx, width, height, design, pattern, motion = 'none', time = 0, scale = 1, bg = {}) {
    const fullWidth = width, fullHeight = height;
    const colors = design.colors, theme = window.StudioThemes[design.theme];
    if (!bg.skipBase) { ctx.fillStyle = colors.background; ctx.fillRect(0, 0, width, height); }
    const stops = theme?.stops || [colors.accent, colors.accent];
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), i === 0 ? colors.accent : i === stops.length - 1 ? colors.secondary || color : color));
    const glow = (x, y, radius, color, alpha) => {
        const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
        fill.addColorStop(0, color + alpha); fill.addColorStop(1, color + '00');
        ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height);
    };
    if (!bg.skipBase) {
        glow(width * .9, height * .1, width * .8, colors.accent, 'a0');
        glow(width * .1, height * .75, width * .55, colors.secondary || colors.accent, '45');
    }
    if (bg.baseOnly) { if (!bg.noBar) drawAccentBar(ctx, width, height, design, bg, gradient); return; }
    ctx.save();
    const speed = bg.speed || 1, phase = time * Math.PI / 3 * speed, pulse = motion === 'pulse' ? (1 - Math.cos(phase)) / 2 : 0;
    // Pattern scale: draw in a virtual canvas so tiles always cover the frame.
    ctx.scale(scale, scale); width = fullWidth / scale; height = fullHeight / scale;
    if (motion === 'drift') ctx.translate(Math.sin(phase) * width * .05, Math.cos(phase) * height * .05);
    if (motion === 'sway') {
        ctx.translate(width / 2, height / 2); ctx.rotate(Math.sin(phase) * .12); ctx.scale(1.2 + Math.cos(phase) * .06, 1.2 + Math.cos(phase) * .06); ctx.translate(-width / 2, -height / 2);
    }
    if (motion === 'orbit') {
        const r = Math.min(width, height) * .04;
        ctx.translate(Math.cos(phase) * r, Math.sin(phase) * r); ctx.translate(width / 2, height / 2); ctx.rotate(Math.sin(phase * 2) * .04); ctx.translate(-width / 2, -height / 2);
    }
    if (motion === 'pulse') {
        const zoom = 1 + pulse * .03;
        ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(-width / 2, -height / 2);
        ctx.globalAlpha = .62 + .38 * pulse;
    }
    ctx.strokeStyle = colors.accent + '35'; ctx.lineWidth = 1.5;
    if (pattern === 'grid' || (!pattern && (design.theme === 'matrix' || design.theme === 'cyberpunk'))) {
        const step = Math.max(3, fullWidth / 32);
        ctx.beginPath();
        for (let x = 0; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = 0; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
        ctx.fillStyle = colors.accent;
        ctx.fillRect(width * .92, height * .12, width * .012, height * .28);
    } else if (pattern === 'hexagons') {
        const radius = Math.max(3, fullWidth / 28), rowStep = Math.sqrt(3) * radius;
        const columnStep = radius * 1.5;
        ctx.lineWidth = Math.max(1, fullWidth / 700);
        // Flat-top hexagons tile with half-row offsets between adjacent columns.
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
        const step = Math.max(4, fullWidth / 18), radius = step * .46;
        ctx.lineWidth = Math.max(1, fullWidth / 720);
        ctx.beginPath();
        for (let y = -step; y < height + step; y += step) {
            for (let x = -step; x < width + step; x += step) {
                ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();
            }
        }
        ctx.stroke();
    } else if (pattern === 'isometric') {
        // Triangular lattice: vertical lines plus two families at +/-30 degrees.
        const edge = Math.max(1, fullWidth / 20), half = edge * Math.sqrt(3) / 2, slope = Math.tan(Math.PI / 6);
        ctx.lineWidth = Math.max(1, fullWidth / 700);
        ctx.beginPath();
        for (let x = 0; x <= width + half; x += half) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let c = -width * slope - edge; c <= height + width * slope; c += edge) {
            ctx.moveTo(0, c); ctx.lineTo(width, c + width * slope);
            ctx.moveTo(0, c + width * slope); ctx.lineTo(width, c);
        }
        ctx.stroke();
    } else if (pattern === 'mesh') {
        const rows = 12, columns = 18, amplitude = Math.max(1, fullWidth / 60);
        ctx.lineWidth = Math.max(1, fullWidth / 800);
        for (let row = 0; row <= rows; row++) {
            ctx.beginPath();
            for (let column = 0; column <= columns * 8; column++) {
                const x = column * width / (columns * 8), y = row * height / rows + Math.sin(x / width * Math.PI * 4 + row * .45) * amplitude;
                if (!column) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        for (let column = 0; column <= columns; column++) {
            ctx.beginPath();
            for (let row = 0; row <= rows * 8; row++) {
                const y = row * height / (rows * 8), x = column * width / columns + Math.sin(y / height * Math.PI * 3 + column * .5) * amplitude;
                if (!row) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    } else if (pattern === 'plaid') {
        const step = Math.max(6, fullWidth / 15);
        ctx.fillStyle = colors.accent + '18';
        for (let x = 0; x < width; x += step) {
            ctx.fillRect(x, 0, step * .24, height);
            ctx.fillRect(0, x, width, step * .24);
        }
        ctx.strokeStyle = colors.accent + '42'; ctx.lineWidth = Math.max(1, fullWidth / 600);
        ctx.beginPath();
        for (let offset = 0; offset < width; offset += step) { ctx.moveTo(offset, 0); ctx.lineTo(offset, height); ctx.moveTo(0, offset); ctx.lineTo(width, offset); }
        ctx.stroke();
    } else if (pattern === 'sunburst') {
        const cx = width * .5, cy = height * .5, radius = Math.hypot(width, height), rays = 28;
        ctx.lineWidth = Math.max(1, fullWidth / 700);
        for (let i = 0; i < rays; i++) {
            const angle = i * Math.PI * 2 / rays;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
        }
    } else if (pattern === 'dots') {
        const step = Math.max(3, fullWidth / 24), radius = Math.max(1, fullWidth / 300);
        ctx.fillStyle = colors.accent + '50';
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
            const size = Math.max(1.5, width / (pattern === 'starfield' ? 420 : 260)) * (1 + i % 3 * .35);
            ctx.fillStyle = i % 5 ? colors.accent + '70' : (colors.secondary || colors.accent) + 'a0';
            if (pattern === 'starfield' && i % 4) {
                ctx.beginPath(); ctx.arc(x, y, size * .55, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.beginPath(); ctx.moveTo(x, y - size * 2); ctx.lineTo(x + size * .38, y - size * .38);
                ctx.lineTo(x + size * 2, y); ctx.lineTo(x + size * .38, y + size * .38);
                ctx.lineTo(x, y + size * 2); ctx.lineTo(x - size * .38, y + size * .38);
                ctx.lineTo(x - size * 2, y); ctx.lineTo(x - size * .38, y - size * .38); ctx.closePath(); ctx.fill();
            }
        }
    } else if (pattern === 'diagonal') {
        const step = Math.max(4, fullWidth / 22);
        ctx.lineWidth = Math.max(1, fullWidth / 180);
        ctx.beginPath();
        for (let offset = -height; offset < width; offset += step) { ctx.moveTo(offset, 0); ctx.lineTo(offset + height, height); }
        ctx.stroke();
    } else if (pattern === 'checker') {
        const step = Math.max(4, fullWidth / 18);
        ctx.fillStyle = colors.accent; ctx.globalAlpha = .16;
        for (let row = 0; row * step < height; row++) {
            for (let col = row % 2; col * step < width; col += 2) ctx.fillRect(col * step, row * step, step, step);
        }
    } else if (pattern === 'crosshatch') {
        const step = Math.max(4, fullWidth / 22);
        ctx.lineWidth = Math.max(1, fullWidth / 700);
        ctx.beginPath();
        for (let offset = -height; offset < width + height; offset += step) {
            ctx.moveTo(offset, 0); ctx.lineTo(offset + height, height);
            ctx.moveTo(offset, height); ctx.lineTo(offset + height, 0);
        }
        ctx.stroke();
    } else if (pattern === 'waves') {
        const rowStep = Math.max(4, fullHeight / 18), amplitude = Math.max(1, fullWidth / 100), wavelength = Math.max(8, fullWidth / 8);
        ctx.lineWidth = Math.max(1.5, fullWidth / 500);
        for (let row = 0; row <= height / rowStep; row++) {
            const baseY = row * rowStep;
            ctx.beginPath();
            for (let x = 0; x <= width; x += Math.max(1, fullWidth / 180)) {
                const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + row * .45) * amplitude;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    } else if (pattern === 'rings') {
        const cx = width * .5, cy = height * .5, step = Math.max(3, fullWidth / 36);
        ctx.lineWidth = Math.max(1.5, fullWidth / 500);
        for (let radius = step; radius < Math.hypot(width, height); radius += step) {
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
        }
    } else if (pattern === 'scales') {
        const step = Math.max(3, fullWidth / 24), rowStep = step * .5;
        ctx.lineWidth = Math.max(1, fullWidth / 720);
        for (let row = -1; row < height / rowStep + 1; row++) {
            const offset = (row & 1) * step / 2, y = row * rowStep;
            for (let x = -step; x < width + step; x += step) {
                ctx.beginPath(); ctx.arc(x + offset, y, step / 2, 0, Math.PI); ctx.stroke();
            }
        }
    } else if (pattern === 'triangles') {
        const size = Math.max(4, fullWidth / 20), rowStep = size * Math.sqrt(3) / 2;
        ctx.lineWidth = Math.max(1, fullWidth / 700);
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
        const step = Math.max(4, fullWidth / 22), rowStep = step * .65;
        ctx.lineWidth = Math.max(1.5, fullWidth / 500);
        ctx.beginPath();
        for (let y = -rowStep; y < height + rowStep; y += rowStep) {
            for (let x = -step; x < width + step; x += step) {
                ctx.moveTo(x, y); ctx.lineTo(x + step / 2, y + rowStep / 2); ctx.lineTo(x + step, y);
            }
        }
        ctx.stroke();
    } else if (pattern === 'topography') {
        const centers = [[.2, .25], [.76, .32], [.49, .82]], step = Math.max(2, fullWidth / 54);
        ctx.lineWidth = Math.max(1, fullWidth / 850);
        for (const [cx, cy] of centers) {
            for (let ring = 1; ring <= 10; ring++) {
                ctx.beginPath();
                ctx.ellipse(width * cx, height * cy, step * ring, step * ring * (.58 + (ring % 3) * .08), ring * .13, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    } else if (pattern === 'confetti') {
        for (let i = 0; i < 180; i++) {
            const x = (i * 157.31) % width, y = (i * 281.17) % height, size = Math.max(1, fullWidth / 180) * (1 + i % 3);
            ctx.save(); ctx.translate(x, y); ctx.rotate(i * 2.399);
            ctx.fillStyle = i % 2 ? colors.accent + '90' : (colors.secondary || colors.accent) + '90';
            if (i % 3 === 0) {
                ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
            } else ctx.fillRect(-size / 2, -size / 4, size, size / 2);
            ctx.restore();
        }
    } else if (pattern === 'circuit') {
        const step = Math.max(6, fullWidth / 16), node = Math.max(1, fullWidth / 220);
        ctx.lineWidth = Math.max(1.5, fullWidth / 500);
        for (let row = 0; row * step < height + step; row++) {
            for (let col = 0; col * step < width + step; col++) {
                const x = col * step, y = row * step, direction = (row + col) % 2 ? 1 : -1;
                ctx.beginPath();
                ctx.moveTo(x, y); ctx.lineTo(x + step * .32, y);
                ctx.lineTo(x + step * .32, y + step * .55 * direction);
                ctx.lineTo(x + step * .78, y + step * .55 * direction);
                ctx.stroke();
                ctx.beginPath(); ctx.arc(x + step * .78, y + step * .55 * direction, node, 0, Math.PI * 2); ctx.stroke();
            }
        }
    } else if (!pattern && design.theme === 'gold') {
        for (let i = 0; i < 6; i++) ctx.strokeRect(width * (.025 + i * .006), height * (.025 + i * .006), width * (.95 - i * .012), height * (.95 - i * .012));
    } else if (pattern === 'geometry' || (!pattern && ['fire', 'purple', 'rainbow'].includes(design.theme))) {
        ctx.fillStyle = gradient;
        ctx.globalAlpha = .7;
        ctx.beginPath(); ctx.moveTo(width * .55, 0); ctx.lineTo(width, 0); ctx.lineTo(width, height * .8); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = .15;
        ctx.beginPath(); ctx.moveTo(0, height * .72); ctx.lineTo(width * .7, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
    } else {
        for (let i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.ellipse(width * .85, height * .2, width * (.23 + i * .06), height * (.17 + i * .04), -.5, 0, Math.PI * 2); ctx.stroke();
        }
    }
    ctx.restore();
    width = fullWidth; height = fullHeight;
    if (motion === 'aurora' || motion === 'flow') {
        // Wide colour ribbons sweeping across the frame; loops seamlessly over 6s.
        const t = time / 6 * Math.PI * 2 * (bg.speed || 1), span = Math.hypot(width, height);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(width / 2, height / 2);
        ctx.rotate(motion === 'flow' ? -.5 : t * 0 + .35);
        const colorsList = [colors.accent, colors.secondary || colors.accent, bg.endColor || colors.accent];
        for (let i = 0; i < 3; i++) {
            const offset = Math.sin(t + i * 2.1) * span * .28 + (i - 1) * span * .22;
            const w = span * (.34 + .06 * Math.sin(t * 2 + i));
            const g = ctx.createLinearGradient(offset - w, 0, offset + w, 0);
            g.addColorStop(0, colorsList[i] + '00'); g.addColorStop(.5, colorsList[i] + '85'); g.addColorStop(1, colorsList[i] + '00');
            ctx.fillStyle = g; ctx.fillRect(-span, -span, span * 2, span * 2);
        }
        ctx.restore();
    }
    if (motion === 'sweep' && pattern) {
        // Eased diagonal band that travels fully off-canvas so the loop restarts invisibly.
        const t = time / 6 * (bg.speed || 1) % 1, eased = t * t * (3 - 2 * t);
        const span = width + height, band = span * .22;
        const pos = -band + eased * (span + band * 2);
        const sweep = ctx.createLinearGradient(pos - band, pos - band, pos + band, pos + band);
        sweep.addColorStop(0, colors.accent + '00'); sweep.addColorStop(.5, colors.accent + '5a'); sweep.addColorStop(1, colors.accent + '00');
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = sweep; ctx.fillRect(0, 0, width, height); ctx.restore();
    }
    if (!bg.noBar) drawAccentBar(ctx, width, height, design, bg, gradient);
}

function drawAccentBar(ctx, width, height, design, bg, themeGradient) {
    if (bg.bar === 'none') return;
    let fill = themeGradient;
    if (bg.bar === 'custom') {
        fill = ctx.createLinearGradient(0, 0, width, 0);
        fill.addColorStop(0, bg.barColor || design.colors.accent); fill.addColorStop(1, bg.barEndColor || bg.barColor || design.colors.accent);
    }
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, Math.max(6, height * .007));
}

const panCache = new Map();

function drawBackdrop(ctx, width, height, design, background, image, time) {
    if (background.mode === 'transparent') return;
    if (background.mode === 'theme') drawThemeBackdrop(ctx, width, height, { ...design, theme: background.theme }, null, 'none', time, 1, background);
    else if (background.mode === 'pattern' && background.motion === 'pan') {
        // Only the pattern layer pans; the base stays put. A crossfade between the pattern and its
        // one-wrap-later copy guarantees the 6s loop is seamless for any pattern.
        const theme = { ...design, theme: background.theme, colors: { ...design.colors, background: background.color } };
        drawThemeBackdrop(ctx, width, height, theme, null, 'none', 0, 1, { ...background, baseOnly: true });
        // The real pattern, zoomed slightly so it can travel inside its own margin. It glides
        // back and forth along the angle, so the 6s loop is exact and nothing is distorted.
        const key = JSON.stringify([width, height, background.pattern, background.scale, background.color, background.theme, design.colors]);
        let still = panCache.get(key);
        if (!still) {
            panCache.clear();
            still = document.createElement('canvas'); still.width = width; still.height = height;
            drawThemeBackdrop(still.getContext('2d'), width, height, theme, background.pattern, 'none', 0, (background.scale || 100) / 100, { ...background, skipBase: true, noBar: true });
            panCache.set(key, still);
        }
        const zoom = 1.3, mx = width * (zoom - 1) / 2, my = height * (zoom - 1) / 2;
        const a = (background.angle - 90) * Math.PI / 180, u = Math.sin(time / 6 * (background.speed || 1) * Math.PI * 2);
        ctx.drawImage(still, -mx + Math.cos(a) * mx * u, -my + Math.sin(a) * my * u, width * zoom, height * zoom);
    } else if (background.mode === 'pattern') {
        drawThemeBackdrop(ctx, width, height, { ...design, theme: background.theme, colors: { ...design.colors, background: background.color } }, background.pattern, background.motion, time, (background.scale || 100) / 100, background);
    } else {
        ctx.fillStyle = background.color;
        if (background.mode === 'gradient') {
            const angle = (background.angle + (background.motion === 'rotate' ? 360 * (time / 6 * (background.speed || 1) % 1) : 0)) * Math.PI / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
            const distance = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
            const gradient = background.gradientType === 'radial'
                ? ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2)
                : background.gradientType === 'conic' && ctx.createConicGradient
                    ? ctx.createConicGradient(angle - Math.PI / 2, width / 2, height / 2)
                    : ctx.createLinearGradient(width / 2 - dx * distance, height / 2 - dy * distance, width / 2 + dx * distance, height / 2 + dy * distance);
            gradient.addColorStop(0, background.color);
            if (background.midColor) gradient.addColorStop(.5, background.midColor);
            gradient.addColorStop(1, background.gradientType === 'conic' && !background.midColor ? background.color : background.endColor);
            ctx.fillStyle = gradient;
        }
        ctx.fillRect(0, 0, width, height);
        if (background.mode === 'image' && image) {
            drawImage(ctx, image, { x: 0, y: 0, w: width, h: height }, background);
            ctx.fillStyle = `rgba(0,0,0,${background.shade / 100})`;
            ctx.fillRect(0, 0, width, height);
        }
    }
    drawVignette(ctx, width, height, background.vignette);
}

export async function makeBackdrop(design, ratio, time = 0, preview = true) {
    const [width, height] = window.PromoModel.SIZES[ratio];
    const background = window.PromoModel.background(design.background, design.theme);
    if (!preview && background.mode === 'image' && !background.image) throw new Error(`Choose a background image for ${ratio}, or select another background style.`);
    const image = background.mode === 'image' ? await loadImage(background.image) : null;
    const buffer = document.createElement('canvas');
    buffer.width = width; buffer.height = height;
    drawBackdrop(buffer.getContext('2d'), width, height, design, background, image, time);
    return buffer;
}

function iconGlyph(value) {
    const cls = String(value || '').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
    if (!cls) return null;
    if (/^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls)) {
        const probe = document.createElement('i'); probe.className = cls; probe.style.cssText = 'position:absolute;visibility:hidden';
        document.body.append(probe);
        const after = getComputedStyle(probe, '::before'), content = after.content.replace(/^["']|["']$/g, '');
        const glyph = { text: content, family: after.fontFamily, weight: after.fontWeight, fa: true };
        probe.remove();
        return content && content !== 'none' && content !== 'normal' ? glyph : null;
    }
    return { text: [...cls].slice(0, 4).join(''), family: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', weight: 400, fa: false };
}

export function shapeBox(box, s, type) {
    if ((type === 'image' || type === 'shape') && s.shape === 'circle') {
        const size = Math.min(box.w, box.h);
        return { box: { x: box.x + (box.w - size) / 2, y: box.y + (box.h - size) / 2, w: size, h: size }, radius: size / 2 };
    }
    const radius = (type === 'image' || type === 'shape') && s.shape === 'rectangle' ? 0 : type === 'shape' && s.shape === 'pill' ? 9999 : s.borderRadius || 0;
    return { box, radius: Math.min(radius, box.w / 2, box.h / 2) };
}

export async function renderPromo(canvas, design, ratio, { preview = true, time = 0, backdrop = null } = {}) {
    const fontFamilies = [...new Set([design.font, ...design.elements.filter(element => element.type === 'text').map(element => element.style.fontFamily).filter(Boolean)])];
    const fonts = Object.fromEntries(await Promise.all(fontFamilies.map(async family => [family, await promoFont(family)])));
    const defaultFont = fonts[design.font];
    const [width, height] = window.PromoModel.SIZES[ratio];
    const layout = design.layouts[ratio], colors = design.colors;
    const images = Object.fromEntries(await Promise.all(design.elements.filter(item => item.type === 'image').map(async item => [item.id, await loadImage(item.src)])));
    const qrImages = Object.fromEntries(await Promise.all(design.elements.filter(item => item.type === 'qr').map(async item => {
        const value = item.source === 'channel-url' ? design.url : item.content;
        if (!value) return [item.id, null];
        const params = new URLSearchParams({ text: value, fg: item.qr.fg, bg: item.qr.bg, margin: String(item.qr.margin), ecc: item.qr.ecc });
        return [item.id, await loadImage(`/api/qr?${params}`, true)];
    })));
    if (design.elements.some(item => item.type === 'icon') && document.fonts) { window.IconPicker?.ensureFont?.(); await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); }
    const base = backdrop || await makeBackdrop(design, ratio, time, preview);
    // Draw offscreen and publish atomically; slow image decoding cannot leave a partial export.
    const buffer = document.createElement('canvas');
    buffer.width = width; buffer.height = height;
    const ctx = buffer.getContext('2d');
    ctx.drawImage(base, 0, 0);
    const elements = new Map(design.elements.map(item => [item.id, item]));
    for (const key of layout.order) {
        const item = elements.get(key), placement = layout.placements[key];
        if (!item || !placement?.visible) continue;
        const s = item.style, outer = rect(placement, width, height);
        ctx.save();
        ctx.globalAlpha = s.opacity;
        if (s.rotate) {
            ctx.translate(outer.x + outer.w / 2, outer.y + outer.h / 2); ctx.rotate(s.rotate * Math.PI / 180);
            ctx.translate(-outer.x - outer.w / 2, -outer.y - outer.h / 2);
        }
        const { box, radius } = shapeBox(outer, s, item.type);
        const path = () => { ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, radius); };
        const border = () => {
            if (!(s.borderWidth > 0)) return;
            ctx.lineWidth = s.borderWidth; ctx.strokeStyle = s.borderColor;
            ctx.beginPath(); ctx.roundRect(box.x + s.borderWidth / 2, box.y + s.borderWidth / 2, box.w - s.borderWidth, box.h - s.borderWidth, Math.max(0, radius - s.borderWidth / 2)); ctx.stroke();
        };
        if (item.type === 'image') {
            const image = images[item.id];
            if (s.shadow.blur > 0) {
                ctx.save(); ctx.shadowBlur = s.shadow.blur; ctx.shadowColor = s.shadow.color; ctx.fillStyle = colors.panel; path(); ctx.fill(); ctx.restore();
            }
            ctx.save(); path(); ctx.clip();
            if (image) drawImage(ctx, image, box, s);
            else if (preview) {
                ctx.fillStyle = colors.panel; ctx.fillRect(box.x, box.y, box.w, box.h);
                const placeholder = item.role === 'photo' ? 'Add your screenshot' : item.role === 'artwork' ? 'Add artwork' : 'Add image';
                drawText(ctx, placeholder, { x: box.x + 24, y: box.y + 24, w: box.w - 48, h: box.h - 48 }, PLAIN, defaultFont, colors.muted);
            }
            if (item.role === 'photo' && layout.template === 'spotlight') {
                const shade = ctx.createLinearGradient(0, 0, ratio === 'landscape' ? width : 0, ratio === 'landscape' ? 0 : height);
                shade.addColorStop(0, ratio === 'landscape' ? `${colors.background}f0` : `${colors.background}00`);
                shade.addColorStop(1, ratio === 'landscape' ? `${colors.background}35` : `${colors.background}ff`);
                ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
            }
            ctx.restore();
            border();
        } else if (item.type === 'qr') {
            const qr = qrImages[item.id];
            if (qr) {
                const size = Math.min(box.w, box.h), qx = box.x + (box.w - size) / 2, qy = box.y + (box.h - size) / 2;
                ctx.save(); ctx.beginPath(); ctx.roundRect(qx, qy, size, size, Math.min(radius, size / 2)); ctx.clip();
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(qr, qx, qy, size, size);
                ctx.restore();
            }
        } else if (item.type === 'shape') {
            ctx.save(); ctx.shadowBlur = s.shadow.blur; ctx.shadowColor = s.shadow.color; ctx.fillStyle = s.background; path(); ctx.fill(); ctx.restore();
            border();
        } else if (item.type === 'icon') {
            const side = Math.min(box.w, box.h), glyph = iconGlyph(item.content);
            if (glyph) {
                ctx.save(); ctx.shadowBlur = s.shadow.blur; ctx.shadowColor = s.shadow.color; ctx.fillStyle = s.color;
                ctx.font = `${glyph.weight} ${side * (glyph.fa ? 1 : .88)}px ${glyph.family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(glyph.text, box.x + box.w / 2, box.y + box.h / 2 + side * .04); ctx.restore();
            }
        } else if (item.type === 'text') {
            const value = item.source === 'channel-url' ? design.url.replace(/^https?:\/\//, '') : item.content;
            const font = fonts[s.fontFamily] || defaultFont;
            const badge = item.role === 'badge' && !s.background;
            const fallbackColor = item.role === 'badge' ? colors.accent : ['subtitle', 'url'].includes(item.role) ? colors.muted : colors.text;
            if (value) {
                let inner = box;
                const filled = s.background || badge || s.borderWidth > 0;
                if (filled) {
                    ctx.save();
                    if (s.shadow.blur > 0) { ctx.shadowBlur = s.shadow.blur; ctx.shadowColor = s.shadow.color; }
                    ctx.fillStyle = s.background || (badge ? colors.accent + '25' : 'transparent');
                    path(); ctx.fill(); ctx.restore();
                    if (badge) { ctx.strokeStyle = colors.accent + '90'; ctx.lineWidth = 1.5; path(); ctx.stroke(); }
                    border();
                    const inset = (s.padding || (badge ? Math.min(box.h * .18, 14) : 0)) + (s.borderWidth || 0);
                    inner = { x: box.x + inset, y: box.y + inset, w: Math.max(1, box.w - inset * 2), h: Math.max(1, box.h - inset * 2) };
                }
                drawText(ctx, value, inner, s, font, s.color || fallbackColor);
            }
        }
        ctx.restore();
    }
    if (design.cornerRadius) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.roundRect(0, 0, width, height, Math.min(design.cornerRadius, width / 2, height / 2)); ctx.fill();
    }
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(buffer, 0, 0);
}
