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

function drawBackdrop(ctx, width, height, design) {
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
    if (design.theme === 'matrix' || design.theme === 'cyberpunk') {
        const step = Math.max(28, width / 32);
        ctx.beginPath();
        for (let x = 0; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = 0; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
        ctx.fillStyle = colors.accent;
        ctx.fillRect(width * .92, height * .12, width * .012, height * .28);
    } else if (design.theme === 'gold') {
        for (let i = 0; i < 6; i++) ctx.strokeRect(width * (.025 + i * .006), height * (.025 + i * .006), width * (.95 - i * .012), height * (.95 - i * .012));
    } else if (design.theme === 'fire' || design.theme === 'purple' || design.theme === 'rainbow') {
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

export async function renderPromo(canvas, design, ratio, { preview = true } = {}) {
    const font = await promoFont(design.font);
    const [width, height] = window.PromoModel.SIZES[ratio];
    const layout = design.layouts[ratio], colors = design.colors;
    const qrUrl = design.url ? `/api/qr?text=${encodeURIComponent(design.url)}&margin=4&ecc=M` : '';
    const [photo, artwork, qr] = await Promise.all([
        layout.blocks.photo.enabled ? loadImage(design.photo) : null,
        layout.blocks.artwork.enabled ? loadImage(design.artwork) : null,
        layout.blocks.qr.enabled ? loadImage(qrUrl, true) : null
    ]);
    // Draw offscreen and publish atomically; slow image decoding cannot leave a partial export.
    const buffer = document.createElement('canvas');
    buffer.width = width; buffer.height = height;
    const ctx = buffer.getContext('2d');
    drawBackdrop(ctx, width, height, design);
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
                ctx.font = `700 ${size}px ${font}`;
                const w = Math.min(box.w, ctx.measureText(value).width + padding * 2.8);
                ctx.fillStyle = colors.accent + '25'; ctx.strokeStyle = colors.accent + '90'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect(box.x, box.y, w, box.h, 6); ctx.fill(); ctx.stroke();
                drawText(ctx, value, { x: box.x + padding, y: box.y + padding, w: Math.max(1, w - padding * 2), h: box.h - padding * 2 }, size, block.color || colors.accent, font, 700);
            } else if (value) drawText(ctx, value, box, block.fontSize, block.color || (key === 'subtitle' || key === 'url' ? colors.muted : colors.text), font, key === 'title' ? 700 : 400);
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
