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
    return { x: block.x * width / 100, y: block.y * height / 100, w: block.w * width / 100, h: block.h * height / 100 };
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

function drawText(ctx, text, box, size, color, font, weight) {
    size = Math.max(12, size);
    let lines;
    for (; size >= 12; size--) {
        ctx.font = `${weight} ${size}px ${font}`;
        lines = wrap(ctx, text, box.w);
        if (lines.length * size * 1.12 <= box.h) break;
    }
    size = Math.max(12, size);
    const limit = Math.max(1, Math.floor(box.h / (size * 1.12)));
    if (lines.length > limit) {
        lines = lines.slice(0, limit);
        let last = lines.at(-1);
        while (last && ctx.measureText(last + '...').width > box.w) last = last.slice(0, -1);
        lines[lines.length - 1] = last + '...';
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, box.x, box.y + i * size * 1.12));
}

function drawImage(ctx, image, box, block) {
    const scale = block.fit === 'contain' ? Math.min(box.w / image.width, box.h / image.height) : Math.max(box.w / image.width, box.h / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, box.x + (box.w - w) * block.focusX / 100, box.y + (box.h - h) * block.focusY / 100, w, h);
}

function drawVignette(ctx, width, height, amount) {
    if (!amount) return;
    const x = width / 2, y = height / 2, inner = Math.min(width, height) * .16, outer = Math.hypot(width, height) * .55;
    const gradient = ctx.createRadialGradient(x, y, inner, x, y, outer);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(.45, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${amount / 100 * .65})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

function drawThemeBackdrop(ctx, width, height, design, pattern) {
    const colors = design.colors, theme = window.StudioThemes[design.theme];
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    const stops = theme?.stops || [colors.accent, colors.accent];
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), i === 0 ? colors.accent : i === stops.length - 1 ? colors.secondary || color : color));
    const glow = (x, y, radius, color, alpha) => {
        const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
        fill.addColorStop(0, color + alpha); fill.addColorStop(1, color + '00');
        ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height);
    };
    glow(width * .9, height * .1, width * .8, colors.accent, 'a0');
    glow(width * .1, height * .75, width * .55, colors.secondary || colors.accent, '45');
    ctx.save();
    ctx.strokeStyle = colors.accent + '35'; ctx.lineWidth = 1.5;
    if (pattern === 'grid' || (!pattern && (design.theme === 'matrix' || design.theme === 'cyberpunk'))) {
        const step = Math.max(28, width / 32);
        ctx.beginPath();
        for (let x = 0; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = 0; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
        ctx.fillStyle = colors.accent;
        ctx.fillRect(width * .92, height * .12, width * .012, height * .28);
    } else if (pattern === 'hexagons') {
        const radius = Math.max(24, width / 28), rowStep = Math.sqrt(3) * radius;
        const columnStep = radius * 1.5;
        ctx.lineWidth = Math.max(1, width / 700);
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
    } else if (pattern === 'dots') {
        const step = Math.max(24, width / 24), radius = Math.max(2, width / 300);
        ctx.fillStyle = colors.accent + '50';
        for (let y = step / 2; y < height; y += step) {
            for (let x = step / 2; x < width; x += step) {
                ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
            }
        }
    } else if (pattern === 'diagonal') {
        const step = Math.max(32, width / 22);
        ctx.lineWidth = Math.max(2, width / 180);
        ctx.beginPath();
        for (let offset = -height; offset < width; offset += step) { ctx.moveTo(offset, 0); ctx.lineTo(offset + height, height); }
        ctx.stroke();
    } else if (pattern === 'checker') {
        const step = Math.max(36, width / 18);
        ctx.fillStyle = colors.accent; ctx.globalAlpha = .16;
        for (let row = 0; row * step < height; row++) {
            for (let col = row % 2; col * step < width; col += 2) ctx.fillRect(col * step, row * step, step, step);
        }
    } else if (pattern === 'crosshatch') {
        const step = Math.max(34, width / 22);
        ctx.lineWidth = Math.max(1, width / 700);
        ctx.beginPath();
        for (let offset = -height; offset < width + height; offset += step) {
            ctx.moveTo(offset, 0); ctx.lineTo(offset + height, height);
            ctx.moveTo(offset, height); ctx.lineTo(offset + height, 0);
        }
        ctx.stroke();
    } else if (pattern === 'waves') {
        const rowStep = Math.max(36, height / 18), amplitude = Math.max(8, width / 100), wavelength = Math.max(70, width / 8);
        ctx.lineWidth = Math.max(1.5, width / 500);
        for (let row = 0; row <= height / rowStep; row++) {
            const baseY = row * rowStep;
            ctx.beginPath();
            for (let x = 0; x <= width; x += Math.max(4, width / 180)) {
                const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + row * .45) * amplitude;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    } else if (pattern === 'rings') {
        const cx = width * .5, cy = height * .5, step = Math.max(24, width / 36);
        ctx.lineWidth = Math.max(1.5, width / 500);
        for (let radius = step; radius < Math.hypot(width, height); radius += step) {
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
        }
    } else if (pattern === 'triangles') {
        const size = Math.max(36, width / 20), rowStep = size * Math.sqrt(3) / 2;
        ctx.lineWidth = Math.max(1, width / 700);
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
        const step = Math.max(36, width / 22), rowStep = step * .65;
        ctx.lineWidth = Math.max(1.5, width / 500);
        ctx.beginPath();
        for (let y = -rowStep; y < height + rowStep; y += rowStep) {
            for (let x = -step; x < width + step; x += step) {
                ctx.moveTo(x, y); ctx.lineTo(x + step / 2, y + rowStep / 2); ctx.lineTo(x + step, y);
            }
        }
        ctx.stroke();
    } else if (pattern === 'topography') {
        const centers = [[.2, .25], [.76, .32], [.49, .82]], step = Math.max(16, width / 54);
        ctx.lineWidth = Math.max(1, width / 850);
        for (const [cx, cy] of centers) {
            for (let ring = 1; ring <= 10; ring++) {
                ctx.beginPath();
                ctx.ellipse(width * cx, height * cy, step * ring, step * ring * (.58 + (ring % 3) * .08), ring * .13, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    } else if (pattern === 'confetti') {
        for (let i = 0; i < 180; i++) {
            const x = (i * 157.31) % width, y = (i * 281.17) % height, size = Math.max(3, width / 180) * (1 + i % 3);
            ctx.save(); ctx.translate(x, y); ctx.rotate(i * 2.399);
            ctx.fillStyle = i % 2 ? colors.accent + '90' : (colors.secondary || colors.accent) + '90';
            if (i % 3 === 0) {
                ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
            } else ctx.fillRect(-size / 2, -size / 4, size, size / 2);
            ctx.restore();
        }
    } else if (pattern === 'circuit') {
        const step = Math.max(52, width / 16), node = Math.max(3, width / 220);
        ctx.lineWidth = Math.max(1.5, width / 500);
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
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, Math.max(6, height * .007));
}

function drawBackdrop(ctx, width, height, design, background, image) {
    if (background.mode === 'transparent') return;
    if (background.mode === 'theme') drawThemeBackdrop(ctx, width, height, { ...design, theme: background.theme });
    else if (background.mode === 'pattern') {
        drawThemeBackdrop(ctx, width, height, { ...design, theme: background.theme, colors: { ...design.colors, background: background.color } }, background.pattern);
    } else {
        ctx.fillStyle = background.color;
        if (background.mode === 'gradient') {
            const angle = background.angle * Math.PI / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
            const distance = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
            const gradient = ctx.createLinearGradient(width / 2 - dx * distance, height / 2 - dy * distance, width / 2 + dx * distance, height / 2 + dy * distance);
            gradient.addColorStop(0, background.color); gradient.addColorStop(1, background.endColor);
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

export async function renderPromo(canvas, design, ratio, { preview = true } = {}) {
    const font = await promoFont(design.font);
    const [width, height] = window.PromoModel.SIZES[ratio];
    const layout = design.layouts[ratio], colors = design.colors;
    const background = window.PromoModel.background(layout.background, design.theme);
    if (!preview && background.mode === 'image' && !background.image) throw new Error(`Choose a background image for ${ratio}, or select another background style.`);
    const qrUrl = design.url ? `/api/qr?text=${encodeURIComponent(design.url)}&margin=4&ecc=M` : '';
    const [photo, artwork, qr, backdrop] = await Promise.all([
        layout.blocks.photo.enabled ? loadImage(design.photo) : null,
        layout.blocks.artwork.enabled ? loadImage(design.artwork) : null,
        layout.blocks.qr.enabled ? loadImage(qrUrl, true) : null,
        background.mode === 'image' ? loadImage(background.image) : null
    ]);
    // Draw offscreen and publish atomically; slow image decoding cannot leave a partial export.
    const buffer = document.createElement('canvas');
    buffer.width = width; buffer.height = height;
    const ctx = buffer.getContext('2d');
    drawBackdrop(ctx, width, height, design, background, backdrop);
    for (const key of layout.order) {
        const block = layout.blocks[key];
        if (!block.enabled) continue;
        let box = rect(block, width, height);
        ctx.save();
        ctx.beginPath();
        if ((key === 'photo' || key === 'artwork') && block.shape === 'circle') {
            const size = Math.min(box.w, box.h);
            box = { x: box.x + (box.w - size) / 2, y: box.y + (box.h - size) / 2, w: size, h: size };
            ctx.arc(box.x + size / 2, box.y + size / 2, size / 2, 0, Math.PI * 2);
        } else if ((key === 'photo' || key === 'artwork') && block.shape === 'rounded') {
            ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(block.radius, box.w / 2, box.h / 2));
        } else ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        if (key === 'photo' || key === 'artwork') {
            const image = key === 'photo' ? photo : artwork;
            if (image) drawImage(ctx, image, box, block);
            else if (preview) {
                ctx.fillStyle = colors.panel; ctx.fillRect(box.x, box.y, box.w, box.h);
                drawText(ctx, key === 'photo' ? 'Add your screenshot' : 'Add artwork', { ...box, x: box.x + 24, y: box.y + 24, w: box.w - 48, h: box.h - 48 }, 28, colors.muted, font, 400);
            }
            if (key === 'photo' && layout.template === 'spotlight') {
                const shade = ctx.createLinearGradient(0, 0, ratio === 'landscape' ? width : 0, ratio === 'landscape' ? 0 : height);
                shade.addColorStop(0, ratio === 'landscape' ? `${colors.background}f0` : `${colors.background}00`);
                shade.addColorStop(1, ratio === 'landscape' ? `${colors.background}35` : `${colors.background}ff`);
                ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
            }
        } else if (key === 'qr') {
            if (qr) {
                const size = Math.min(box.w, box.h);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(qr, box.x + (box.w - size) / 2, box.y + (box.h - size) / 2, size, size);
            }
        } else {
            const value = key === 'url' ? design.url.replace('https://', '') : design[key];
            if (value && key === 'badge') {
                const padding = Math.min(box.h * .18, 14), size = Math.min(block.fontSize, box.h * .55);
                ctx.font = `${block.fontWeight} ${size}px ${font}`;
                const w = Math.min(box.w, ctx.measureText(value).width + padding * 2.8);
                ctx.fillStyle = colors.accent + '25'; ctx.strokeStyle = colors.accent + '90'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect(box.x, box.y, w, box.h, 6); ctx.fill(); ctx.stroke();
                drawText(ctx, value, { x: box.x + padding, y: box.y + padding, w: Math.max(1, w - padding * 2), h: box.h - padding * 2 }, size, block.color || colors.accent, font, block.fontWeight);
            } else if (value) drawText(ctx, value, box, block.fontSize, block.color || (key === 'subtitle' || key === 'url' ? colors.muted : colors.text), font, block.fontWeight);
        }
        ctx.restore();
    }
    if (layout.cornerRadius) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.roundRect(0, 0, width, height, Math.min(layout.cornerRadius, width / 2, height / 2)); ctx.fill();
    }
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(buffer, 0, 0);
}
