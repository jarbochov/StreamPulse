
// Extra look-and-feel that every element type shares: gradient fills (box and text), frosted blur and drop shadow.
// Progress elements put the gradient on their fill, so the track stays a plain color.
const TEXT_FILL_TYPES = new Set(['text', 'random-text', 'markdown', 'game-list']);
const isTextGradient = (style, type) => TEXT_FILL_TYPES.has(type) && style?.textGradient?.enabled === true;

const hasBoxFill = style => style?.gradient?.enabled === true || (!!style?.background && !/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(style.background));

function decorationStyle(style = {}, type = '') {
    const out = {
        backdropFilter: style.blur > 0 ? `blur(${style.blur}px)` : '',
        boxShadow: style.shadow?.blur > 0 ? `0 4px ${style.shadow.blur}px ${style.shadow.color || 'rgba(0,0,0,.5)'}` : ''
    };
    const text = isTextGradient(style, type) ? style.textGradient : null;
    const box = style.gradient?.enabled && type !== 'progress' ? style.gradient : null;
    if (!text && !box) return Object.assign(out, { webkitTextFillColor: '', backgroundSize: '', backgroundClip: '', webkitBackgroundClip: '', backgroundPosition: '', animation: '' });
    ensureGradientKeyframes();
    // One background list: the text gradient is clipped to the letters, the box gradient or color fills the box behind it.
    const layers = [], sizes = [], clips = [];
    const add = (css, g, clip) => { layers.push(css); sizes.push(g?.animate ? '200% 200%' : '100% 100%'); clips.push(clip); };
    if (text) add(gradientCss(text), text, 'text');
    if (box) add(gradientCss(box), box, 'border-box');
    else if (text && style.background && style.background !== 'transparent') add(`linear-gradient(${style.background}, ${style.background})`, null, 'border-box');
    const positions = [], anims = [];
    const track = (g, name) => {
        positions.push(g?.animate ? (slidesVertically(g) ? `50% var(--sp-${name})` : `var(--sp-${name}) 50%`) : '0% 50%');
        if (g?.animate) anims.push(`sp-shift-${name} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate`);
    };
    if (text) track(text, 't');
    if (box) track(box, 'b');
    else if (layers.length > (text ? 1 : 0)) track(null, 'b');
    Object.assign(out, {
        background: layers.join(', '),
        backgroundPosition: positions.join(', '),
        backgroundSize: sizes.join(', '),
        backgroundClip: clips.join(', '),
        webkitBackgroundClip: clips.join(', '),
        animation: anims.join(', ')
    });
    // Fill is transparent but color stays solid, so borders, rules and bullets that use currentColor remain visible.
    out.webkitTextFillColor = text ? 'transparent' : '';
    if (text) out.color = text.from || '#1f6feb';
    return out;
}

// Linear or radial fill with 2-3 stops; animated gradients slide an oversized fill back and forth like the timer wizard.
function gradientCss(g) {
    const mid = g.mid && g.mid !== 'transparent' && g.mid !== 'none' ? g.mid : '';
    const stops = [g.from || '#1f6feb', mid, g.to || '#8957e5'].filter(Boolean).join(', ');
    return g.type === 'radial' ? `radial-gradient(circle at ${g.position || 'center'}, ${stops})` : `linear-gradient(${g.angle ?? 135}deg, ${stops})`;
}

// Slide along the axis the gradient actually changes on; a 0/180deg linear gradient doesn't vary horizontally.
function slidesVertically(g) {
    if (g?.type === 'radial') return false;
    const rad = (Number(g?.angle ?? 135) * Math.PI) / 180;
    return Math.abs(Math.cos(rad)) > Math.abs(Math.sin(rad));
}

function gradientStyle(g) {
    ensureGradientKeyframes();
    return g.animate
        ? { background: gradientCss(g), backgroundSize: '200% 200%', animation: `${slidesVertically(g) ? 'sp-gradient-shift-y' : 'sp-gradient-shift'} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate` }
        : { background: gradientCss(g), backgroundSize: '', animation: '' };
}

function ensureGradientKeyframes() {
    if (document.getElementById('sp-gradient-keyframes')) return;
    const tag = document.createElement('style');
    tag.id = 'sp-gradient-keyframes';
    // Registered properties let text and box gradients animate on separate timers.
    tag.textContent = '@property --sp-t { syntax: "<percentage>"; inherits: false; initial-value: 0%; } @property --sp-b { syntax: "<percentage>"; inherits: false; initial-value: 0%; } '
        + '@keyframes sp-gradient-shift { from { background-position: 0% 50%; } to { background-position: 100% 50%; } } @keyframes sp-gradient-shift-y { from { background-position: 50% 0%; } to { background-position: 50% 100%; } } '
        + '@keyframes sp-shift-t { from { --sp-t: 0%; } to { --sp-t: 100%; } } @keyframes sp-shift-b { from { --sp-b: 0%; } to { --sp-b: 100%; } } '
        + '.sp-fx-paused *, .sp-fx-paused { animation-play-state: paused !important; }';
    document.head.appendChild(tag);
}

const BORDER_STYLES = [
    'solid', 'dashed', 'dotted', 'double',
    'groove', 'ridge', 'inset', 'outset',
    'neon-tube', 'double-ring', 'corner-brackets', 'tech-hud', 'chamfer', 'notched', 'crosshair',
    'hazard', 'chevron-track', 'scallop-stamp', 'ornate-filigree', 'pixel-arcade', 'film-sprocket'
];
const CUSTOM_RING_STYLES = new Set([
    'neon-tube', 'double-ring', 'corner-brackets', 'tech-hud', 'chamfer', 'notched', 'crosshair',
    'hazard', 'chevron-track', 'scallop-stamp', 'ornate-filigree', 'pixel-arcade', 'film-sprocket'
]);
const SHAPE_CLIP_STYLES = new Set(['chamfer', 'notched', 'scallop-stamp', 'pixel-arcade']);
const BORDER_PLACEMENTS = ['inside', 'center', 'outside'];
const BORDER_ANIM_TYPES = [
    'none', 'rotating', 'dual-beam', 'radial', 'pulsing',
    'strobe-flash', 'laser-scan', 'plasma', 'gradient', 'rainbow', 'marching'
];
const TEXT_ANIM_TYPES = [
    'none',
    'pulse', 'heartbeat', 'float', 'wave', 'wiggle', 'wobble', 'shake', 'swing', 'bounce', 'glitch',
    'word-bounce', 'word-wave', 'word-wiggle', 'word-wobble', 'word-pop', 'word-reveal',
    'char-bounce', 'char-wave', 'char-wiggle', 'char-wobble', 'char-jitter', 'char-pop', 'typing', 'matrix'
];
const TEXT_SPLIT_ANIM_TYPES = new Set([
    'word-bounce', 'word-wave', 'word-wiggle', 'word-wobble', 'word-pop', 'word-reveal',
    'char-bounce', 'char-wave', 'char-wiggle', 'char-wobble', 'char-jitter', 'char-pop', 'typing', 'matrix'
]);
const MATRIX_GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+<>?@~';

function resolveBorderRadius(style = {}, element = {}) {
    const shape = element?.type === 'cutout' ? (element.cutout?.shape || 'rectangle') : style.shape;
    if (shape === 'circle') return '50%';
    if (shape === 'pill') return '999px';
    const corners = style.borderRadiusCorners;
    if (corners?.enabled) {
        const px = v => `${Math.max(0, Math.min(200, Math.round(Number(v) || 0)))}px`;
        return `${px(corners.tl)} ${px(corners.tr)} ${px(corners.br)} ${px(corners.bl)}`;
    }
    return `${Math.max(0, Math.min(200, Math.round(Number(style.borderRadius) || 0)))}px`;
}

function borderPlacement(style = {}, element = {}) {
    return BORDER_PLACEMENTS.includes(style.borderPlacement) ? style.borderPlacement
        : element.type === 'shape' && element.obsLink?.enabled === true ? 'outside' : 'inside';
}

function ensureBorderKeyframes() {
    if (window.CSS && typeof window.CSS.registerProperty === 'function') {
        try {
            window.CSS.registerProperty({
                name: '--sp-angle',
                syntax: '<angle>',
                inherits: false,
                initialValue: '0deg'
            });
        } catch {}
    }
    if (document.getElementById('sp-border-keyframes')) return;
    const tag = document.createElement('style');
    tag.id = 'sp-border-keyframes';
    tag.textContent = '@property --sp-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; } '
        + '@keyframes sp-border-spin { from { --sp-angle: 0deg; } to { --sp-angle: 360deg; } } '
        + '@keyframes sp-border-pulse { 0%, 100% { opacity: 0.35; filter: brightness(0.85); } 50% { opacity: 1; filter: brightness(1.38) drop-shadow(0 0 10px currentColor); } } '
        + '@keyframes sp-border-surge { 0%, 52%, 100% { opacity: 0.72; filter: brightness(0.95); } 60% { opacity: 1; filter: brightness(1.9) drop-shadow(0 0 14px currentColor); } 67% { opacity: 0.52; filter: brightness(0.82); } 74% { opacity: 1; filter: brightness(1.75) drop-shadow(0 0 10px currentColor); } 88% { opacity: 0.82; filter: brightness(1.06); } } '
        + '@keyframes sp-border-gradient-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } } '
        + '@keyframes sp-border-rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } } '
        + '@keyframes sp-border-marching { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -32; } } '
        + '@keyframes sp-border-marching-bg { from { background-position: 0 0; } to { background-position: 40px 0; } } '
        + '@keyframes sp-border-laser { from { --sp-angle: 0deg; } to { --sp-angle: 360deg; } } '
        + '@keyframes sp-border-plasma { 0% { --sp-angle: 0deg; filter: saturate(1.15) brightness(1); } 50% { --sp-angle: 180deg; filter: saturate(1.5) brightness(1.26); } 100% { --sp-angle: 360deg; filter: saturate(1.15) brightness(1); } } '
        + '@keyframes sp-border-radial-circuit { 0%,100% { transform:translate(0,0); } 25% { transform:translate(var(--sp-border-travel),0); } 50% { transform:translate(var(--sp-border-travel),var(--sp-border-travel)); } 75% { transform:translate(0,var(--sp-border-travel)); } } '
        + '@keyframes sp-border-radial-circuit-rev { 0%,100% { transform:translate(0,0); } 25% { transform:translate(0,var(--sp-border-travel)); } 50% { transform:translate(var(--sp-border-travel),var(--sp-border-travel)); } 75% { transform:translate(var(--sp-border-travel),0); } } '
        + '@keyframes sp-border-radial-paint { 0%,100% { background-position:0% 0%; } 25% { background-position:100% 0%; } 50% { background-position:100% 100%; } 75% { background-position:0% 100%; } } '
        + '@keyframes sp-border-radial-paint-rev { 0%,100% { background-position:0% 0%; } 25% { background-position:0% 100%; } 50% { background-position:100% 100%; } 75% { background-position:100% 0%; } } '
        + '.sp-fx-paused [data-border-fx], .sp-fx-paused [data-border-ring], .sp-fx-paused [data-border-fx-ring] { animation-play-state: paused !important; }';
    document.head.appendChild(tag);
}

function computeBoxShadow(style = {}, width = 0, outset = 0) {
    const shadows = [];
    if (style.shadow?.blur > 0) {
        shadows.push(`0 0 ${style.shadow.blur}px ${outset}px ${style.shadow.color || 'rgba(0,0,0,0.5)'}`);
    }
    const glow = style.borderGlow;
    if (glow?.enabled && width > 0) {
        const gc = glow.color && glow.color !== 'transparent' ? glow.color : (style.borderColor && style.borderColor !== 'transparent' ? style.borderColor : '#38bdf8');
        const gb = Math.max(0, Number(glow.blur ?? 16));
        const gs = Math.max(0, Number(glow.spread ?? 2));
        if (glow.neon) {
            shadows.push(
                `0 0 3px ${outset}px #ffffff`,
                `0 0 ${Math.max(6, Math.round(gb * 0.4))}px ${outset}px ${gc}`,
                `0 0 ${gb}px ${gs + outset}px ${gc}`,
                `0 0 ${Math.round(gb * 1.6)}px ${Math.round(gs * 1.5) + outset}px ${gc}`
            );
        } else {
            shadows.push(`0 0 ${gb}px ${gs + outset}px ${gc}`);
        }
    }
    return shadows.length ? shadows.join(', ') : 'none';
}

function colorWithAlpha(color, alpha = 0.25) {
    const a = Math.max(0, Math.min(1, Number(alpha)));
    const raw = String(color || '#38bdf8').trim();
    if (raw.startsWith('#')) {
        let hex = raw.slice(1);
        if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map(ch => ch + ch).join('');
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
    }
    return `color-mix(in srgb, ${raw} ${Math.round(a * 100)}%, transparent)`;
}

function resolveCornerRadiiPx(style = {}, element = {}, rw = 400, rh = 120, outset = 0) {
    const shape = element?.type === 'cutout' ? (element.cutout?.shape || 'rectangle') : style.shape;
    if (shape === 'circle') return { isEllipse: true, tl: rw / 2, tr: rw / 2, br: rh / 2, bl: rh / 2 };
    const pad = val => {
        const n = Math.max(0, Math.min(200, Math.round(Number(val) || 0)));
        return outset > 0 ? n + outset : n;
    };
    let tl, tr, br, bl;
    if (shape === 'pill') {
        tl = tr = br = bl = Math.min(rw, rh) / 2;
    } else if (style.borderRadiusCorners?.enabled) {
        const c = style.borderRadiusCorners;
        tl = pad(c.tl); tr = pad(c.tr); br = pad(c.br); bl = pad(c.bl);
    } else {
        tl = tr = br = bl = pad(style.borderRadius);
    }
    const f = Math.min(
        tl + tr > 0 ? rw / (tl + tr) : 1,
        bl + br > 0 ? rw / (bl + br) : 1,
        tl + bl > 0 ? rh / (tl + bl) : 1,
        tr + br > 0 ? rh / (tr + br) : 1,
        1
    );
    return { isEllipse: false, tl: tl * f, tr: tr * f, br: br * f, bl: bl * f };
}

function svgRoundedRectPath(x, y, w, h, tl, tr, br, bl) {
    if (w <= 0 || h <= 0) return '';
    const f = Math.min(
        tl + tr > 0 ? w / (tl + tr) : 1,
        bl + br > 0 ? w / (bl + br) : 1,
        tl + bl > 0 ? h / (tl + bl) : 1,
        tr + br > 0 ? h / (tr + br) : 1,
        1
    );
    const a = Math.max(0, tl * f), b = Math.max(0, tr * f), c = Math.max(0, br * f), d = Math.max(0, bl * f);
    return `M${(x + a).toFixed(2)},${y.toFixed(2)}`
        + `H${(x + w - b).toFixed(2)}` + (b > 0 ? `A${b.toFixed(2)},${b.toFixed(2)} 0 0 1 ${(x + w).toFixed(2)},${(y + b).toFixed(2)}` : '')
        + `V${(y + h - c).toFixed(2)}` + (c > 0 ? `A${c.toFixed(2)},${c.toFixed(2)} 0 0 1 ${(x + w - c).toFixed(2)},${(y + h).toFixed(2)}` : '')
        + `H${(x + d).toFixed(2)}` + (d > 0 ? `A${d.toFixed(2)},${d.toFixed(2)} 0 0 1 ${x.toFixed(2)},${(y + h - d).toFixed(2)}` : '')
        + `V${(y + a).toFixed(2)}` + (a > 0 ? `A${a.toFixed(2)},${a.toFixed(2)} 0 0 1 ${(x + a).toFixed(2)},${y.toFixed(2)}` : '')
        + 'Z';
}

function svgEllipsePath(cx, cy, rx, ry) {
    if (rx <= 0 || ry <= 0) return '';
    return `M${cx.toFixed(2)},${(cy - ry).toFixed(2)}`
        + `A${rx.toFixed(2)},${ry.toFixed(2)} 0 1 1 ${cx.toFixed(2)},${(cy + ry).toFixed(2)}`
        + `A${rx.toFixed(2)},${ry.toFixed(2)} 0 1 1 ${cx.toFixed(2)},${(cy - ry).toFixed(2)}Z`;
}

function svgInsetRimPath(rw, rh, extraInset, strokeW, radii) {
    const o = Math.max(0, extraInset);
    const i = o + Math.max(0.5, strokeW);
    if (radii.isEllipse) {
        const cx = rw / 2, cy = rh / 2;
        const outer = svgEllipsePath(cx, cy, Math.max(1, cx - o), Math.max(1, cy - o));
        const inner = svgEllipsePath(cx, cy, Math.max(0, cx - i), Math.max(0, cy - i));
        return `${outer} ${inner}`.trim();
    }
    const outer = svgRoundedRectPath(o, o, Math.max(0, rw - o * 2), Math.max(0, rh - o * 2),
        Math.max(0, radii.tl - o), Math.max(0, radii.tr - o), Math.max(0, radii.br - o), Math.max(0, radii.bl - o));
    const inner = svgRoundedRectPath(i, i, Math.max(0, rw - i * 2), Math.max(0, rh - i * 2),
        Math.max(0, radii.tl - i), Math.max(0, radii.tr - i), Math.max(0, radii.br - i), Math.max(0, radii.bl - i));
    return `${outer} ${inner}`.trim();
}

function svgMidlinePath(rw, rh, midInset, radii) {
    if (radii.isEllipse) {
        return svgEllipsePath(rw / 2, rh / 2, Math.max(1, rw / 2 - midInset), Math.max(1, rh / 2 - midInset));
    }
    return svgRoundedRectPath(midInset, midInset, Math.max(1, rw - midInset * 2), Math.max(1, rh - midInset * 2),
        Math.max(0, radii.tl - midInset), Math.max(0, radii.tr - midInset), Math.max(0, radii.br - midInset), Math.max(0, radii.bl - midInset));
}

function computePolygonBorderSpec(borderStyle, style, rw, rh, width) {
    const minDim = Math.min(rw, rh);
    if (borderStyle === 'chamfer') {
        const cham = Math.max(8, Math.min(Math.floor(minDim / 3), Math.round(Number(style.borderRadius) || 14)));
        const pts = [[cham, 0], [rw - cham, 0], [rw, cham], [rw, rh - cham], [rw - cham, rh], [cham, rh], [0, rh - cham], [0, cham]];
        const css = `polygon(${cham}px 0, calc(100% - ${cham}px) 0, 100% ${cham}px, 100% calc(100% - ${cham}px), calc(100% - ${cham}px) 100%, ${cham}px 100%, 0 calc(100% - ${cham}px), 0 ${cham}px)`;
        return { pts, css, cham };
    }
    if (borderStyle === 'notched') {
        const c1 = Math.max(10, Math.min(Math.floor(minDim * 0.24), Math.round(Number(style.borderRadius) || 18)));
        const c2 = Math.max(4, Math.round(c1 * 0.42));
        const nd = Math.max(3, Math.min(Math.round(width * 0.65), Math.floor(rh * 0.12)));
        const nl = Math.round(rw * 0.34), nr = Math.round(rw * 0.66), sl = nd + 4;
        const pts = [
            [c1, 0], [nl, 0], [nl + sl, nd], [nr - sl, nd], [nr, 0], [rw - c2, 0],
            [rw, c2], [rw, rh - c1], [rw - c1, rh], [nr, rh], [nr - sl, rh - nd],
            [nl + sl, rh - nd], [nl, rh], [c2, rh], [0, rh - c2], [0, c1]
        ];
        const css = `polygon(${pts.map(([x, y]) => `${((x / rw) * 100).toFixed(2)}% ${((y / rh) * 100).toFixed(2)}%`).join(', ')})`;
        return { pts, css, c1, c2, nd };
    }
    if (borderStyle === 'pixel-arcade') {
        const st = Math.max(4, Math.min(Math.floor(minDim / 8), Math.round(Math.max(width * 0.85, 6))));
        const s2 = st * 2;
        const pts = [
            [s2, 0], [rw - s2, 0], [rw - s2, st], [rw - st, st], [rw - st, s2], [rw, s2],
            [rw, rh - s2], [rw - st, rh - s2], [rw - st, rh - st], [rw - s2, rh - st], [rw - s2, rh],
            [s2, rh], [s2, rh - st], [st, rh - st], [st, rh - s2], [0, rh - s2],
            [0, s2], [st, s2], [st, st], [s2, st]
        ];
        const css = `polygon(${s2}px 0, calc(100% - ${s2}px) 0, calc(100% - ${s2}px) ${st}px, calc(100% - ${st}px) ${st}px, calc(100% - ${st}px) ${s2}px, 100% ${s2}px, 100% calc(100% - ${s2}px), calc(100% - ${st}px) calc(100% - ${s2}px), calc(100% - ${st}px) calc(100% - ${st}px), calc(100% - ${s2}px) calc(100% - ${st}px), calc(100% - ${s2}px) 100%, ${s2}px 100%, ${s2}px calc(100% - ${st}px), ${st}px calc(100% - ${st}px), ${st}px calc(100% - ${s2}px), 0 calc(100% - ${s2}px), 0 ${s2}px, ${st}px ${s2}px, ${st}px ${st}px, ${s2}px ${st}px)`;
        return { pts, css, st };
    }
    if (borderStyle === 'scallop-stamp') {
        const depth = Math.max(3, Math.min(8, Math.round(width * 0.45)));
        const step = Math.max(12, Math.min(24, Math.round(depth * 3.4)));
        const pts = [];
        const addEdge = (x0, y0, x1, y1, nx, ny) => {
            const len = Math.hypot(x1 - x0, y1 - y0);
            const count = Math.max(2, Math.round(len / step));
            for (let i = 0; i < count; i++) {
                const t0 = i / count, t1 = (i + 1) / count;
                for (let k = 0; k < 4; k++) {
                    const f = k / 4;
                    const t = t0 + (t1 - t0) * f;
                    const dip = Math.sin(f * Math.PI) * depth;
                    pts.push([x0 + (x1 - x0) * t + nx * dip, y0 + (y1 - y0) * t + ny * dip]);
                }
            }
        };
        addEdge(0, 0, rw, 0, 0, 1);
        addEdge(rw, 0, rw, rh, -1, 0);
        addEdge(rw, rh, 0, rh, 0, -1);
        addEdge(0, rh, 0, 0, 1, 0);
        const css = `polygon(${pts.map(([x, y]) => `${((x / rw) * 100).toFixed(2)}% ${((y / rh) * 100).toFixed(2)}%`).join(', ')})`;
        return { pts, css, depth, step };
    }
    return null;
}

function buildBorderMaskSvg(borderStyle, width, rw, rh, style, element, outset) {
    if (borderStyle === 'solid' || borderStyle === 'neon-tube') return { useBoxMask: true };
    const w = Math.max(1, width);
    const W = Math.max(24, Math.round(rw));
    const H = Math.max(24, Math.round(rh));
    const minDim = Math.min(W, H);
    const radii = resolveCornerRadiiPx(style, element, W, H, outset);
    const parts = [];
    const wrapSvg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

    if (borderStyle === 'dashed') {
        const dash = Math.max(8, Math.round(w * 2.2)), gap = Math.max(5, Math.round(w * 1.3));
        parts.push(`<path d="${svgMidlinePath(W, H, w / 2, radii)}" fill="none" stroke="#fff" stroke-width="${w}" stroke-dasharray="${dash} ${gap}"/>`);
    } else if (borderStyle === 'dotted') {
        const step = Math.max(6, w * 1.85).toFixed(1);
        parts.push(`<path d="${svgMidlinePath(W, H, w / 2, radii)}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="0.1 ${step}"/>`);
    } else if (borderStyle === 'double' || borderStyle === 'double-ring') {
        const isArch = borderStyle === 'double-ring';
        const ow = Math.max(1, +(w * (isArch ? 0.42 : 0.36)).toFixed(2));
        const iw = Math.max(1, +(w * (isArch ? 0.24 : 0.32)).toFixed(2));
        const ins2 = isArch ? Math.max(ow + 2, +(w * 0.85).toFixed(2)) : Math.max(ow + 1, +(w - iw).toFixed(2));
        parts.push(`<path d="${svgInsetRimPath(W, H, 0, ow, radii)}" fill="#fff" fill-rule="evenodd"/>`);
        parts.push(`<path d="${svgInsetRimPath(W, H, ins2, iw, radii)}" fill="#fff" fill-opacity="${isArch ? 0.72 : 1}" fill-rule="evenodd"/>`);
        if (isArch) {
            const bw = Math.max(2, Math.round(w * 0.45)), span = Math.max(2, ins2 - ow);
            parts.push(`<rect x="${(W - bw) / 2}" y="${ow}" width="${bw}" height="${span}" fill="#fff" fill-opacity="0.65"/>`);
            parts.push(`<rect x="${(W - bw) / 2}" y="${H - ow - span}" width="${bw}" height="${span}" fill="#fff" fill-opacity="0.65"/>`);
            parts.push(`<rect x="${ow}" y="${(H - bw) / 2}" width="${span}" height="${bw}" fill="#fff" fill-opacity="0.65"/>`);
            parts.push(`<rect x="${W - ow - span}" y="${(H - bw) / 2}" width="${span}" height="${bw}" fill="#fff" fill-opacity="0.65"/>`);
        }
    } else if (borderStyle === 'groove' || borderStyle === 'ridge') {
        const hw = Math.max(1, +(w * 0.46).toFixed(2));
        const outerAlpha = borderStyle === 'groove' ? 0.44 : 1;
        const innerAlpha = borderStyle === 'groove' ? 1 : 0.42;
        parts.push(`<path d="${svgInsetRimPath(W, H, 0, hw, radii)}" fill="#fff" fill-opacity="${outerAlpha}" fill-rule="evenodd"/>`);
        parts.push(`<path d="${svgInsetRimPath(W, H, Math.max(0.5, w - hw), hw, radii)}" fill="#fff" fill-opacity="${innerAlpha}" fill-rule="evenodd"/>`);
    } else if (borderStyle === 'inset' || borderStyle === 'outset') {
        const rim = svgInsetRimPath(W, H, 0, w, radii);
        const tlAlpha = borderStyle === 'inset' ? 0.36 : 1;
        const brAlpha = borderStyle === 'inset' ? 1 : 0.36;
        const defs = `<clipPath id="tl"><polygon points="0,0 ${W},0 0,${H}"/></clipPath><clipPath id="br"><polygon points="${W},0 ${W},${H} 0,${H}"/></clipPath>`;
        return {
            useBoxMask: false,
            svg: wrapSvg(defs, `<path d="${rim}" fill="#fff" fill-opacity="${tlAlpha}" fill-rule="evenodd" clip-path="url(#tl)"/><path d="${rim}" fill="#fff" fill-opacity="${brAlpha}" fill-rule="evenodd" clip-path="url(#br)"/>`)
        };
    } else if (borderStyle === 'corner-brackets') {
        const arm = Math.max(14, Math.min(Math.floor(minDim * 0.34), Math.round(18 + w * 2.4)));
        const rail = Math.max(1, +(w * 0.2).toFixed(2));
        parts.push(`<path d="${svgInsetRimPath(W, H, 0, rail, radii)}" fill="#fff" fill-opacity="0.24" fill-rule="evenodd"/>`);
        for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [W, H, -1, -1], [0, H, 1, -1]]) {
            const xH = dx > 0 ? cx : cx - arm, yH = dy > 0 ? cy : cy - w;
            const xV = dx > 0 ? cx : cx - w, yV = dy > 0 ? cy : cy - arm;
            parts.push(`<rect x="${xH}" y="${yH}" width="${arm}" height="${w}" fill="#fff"/>`);
            parts.push(`<rect x="${xV}" y="${yV}" width="${w}" height="${arm}" fill="#fff"/>`);
            const eo = w + Math.max(3, Math.round(w * 0.55)), ea = Math.max(6, Math.round(arm * 0.45)), ew = Math.max(1.5, +(w * 0.35).toFixed(1));
            const ex = dx > 0 ? eo : W - eo - ea, ey = dy > 0 ? eo : H - eo - ew;
            const evx = dx > 0 ? eo : W - eo - ew, evy = dy > 0 ? eo : H - eo - ea;
            parts.push(`<rect x="${ex}" y="${ey}" width="${ea}" height="${ew}" fill="#fff" fill-opacity="0.58"/>`);
            parts.push(`<rect x="${evx}" y="${evy}" width="${ew}" height="${ea}" fill="#fff" fill-opacity="0.58"/>`);
        }
    } else if (borderStyle === 'tech-hud') {
        const arm = Math.max(16, Math.min(Math.floor(minDim * 0.28), Math.round(22 + w * 2.5)));
        const rail = Math.max(1.5, +(w * 0.28).toFixed(2));
        parts.push(`<path d="${svgInsetRimPath(W, H, Math.round(w * 0.3), rail, radii)}" fill="#fff" fill-opacity="0.35" fill-rule="evenodd"/>`);
        for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [W, H, -1, -1], [0, H, 1, -1]]) {
            const xH = dx > 0 ? cx : cx - arm, yH = dy > 0 ? cy : cy - w;
            const xV = dx > 0 ? cx : cx - w, yV = dy > 0 ? cy : cy - arm;
            parts.push(`<rect x="${xH}" y="${yH}" width="${arm}" height="${w}" fill="#fff"/>`);
            parts.push(`<rect x="${xV}" y="${yV}" width="${w}" height="${arm}" fill="#fff"/>`);
            // Corner diagonal gusset triangle
            const gSize = Math.max(6, Math.round(w * 1.1));
            const gPts = `${cx + dx * w},${cy + dy * w} ${cx + dx * (w + gSize)},${cy + dy * w} ${cx + dx * w},${cy + dy * (w + gSize)}`;
            parts.push(`<polygon points="${gPts}" fill="#fff" fill-opacity="0.72"/>`);
        }
        // Top & bottom tapered tactical bars
        const bw2 = Math.max(24, Math.min(110, Math.round(W * 0.28))), bx = (W - bw2) / 2, bh2 = Math.max(2, Math.round(w * 0.9)), taper = Math.max(4, bh2);
        parts.push(`<polygon points="${bx},0 ${bx + bw2},0 ${bx + bw2 - taper},${bh2} ${bx + taper},${bh2}" fill="#fff"/>`);
        parts.push(`<polygon points="${bx},${H} ${bx + bw2},${H} ${bx + bw2 - taper},${H - bh2} ${bx + taper},${H - bh2}" fill="#fff"/>`);
        // Left & right caliper ticks + micro signal bars
        const ch2 = Math.max(14, Math.min(36, Math.round(H * 0.26))), cy2 = (H - ch2) / 2, cw2 = Math.max(2, Math.round(w * 0.75));
        parts.push(`<rect x="0" y="${cy2}" width="${cw2}" height="${ch2}" fill="#fff" fill-opacity="0.9"/>`);
        parts.push(`<rect x="${W - cw2}" y="${cy2}" width="${cw2}" height="${ch2}" fill="#fff" fill-opacity="0.9"/>`);
        if (W > 110) {
            const pipW = Math.max(4, Math.round(w * 0.9)), pipH = Math.max(2, Math.round(w * 0.45));
            for (let i = 0; i < 3; i++) {
                parts.push(`<rect x="${arm + 6 + i * (pipW + 3)}" y="${Math.max(1, Math.round(w * 0.25))}" width="${pipW}" height="${pipH}" fill="#fff" fill-opacity="${0.9 - i * 0.2}"/>`);
                parts.push(`<rect x="${W - arm - 6 - pipW - i * (pipW + 3)}" y="${H - Math.max(1, Math.round(w * 0.25)) - pipH}" width="${pipW}" height="${pipH}" fill="#fff" fill-opacity="${0.9 - i * 0.2}"/>`);
            }
        }
    } else if (borderStyle === 'chamfer' || borderStyle === 'notched' || borderStyle === 'pixel-arcade' || borderStyle === 'scallop-stamp') {
        const spec = computePolygonBorderSpec(borderStyle, style, W, H, w);
        const ptsStr = spec.pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
        const defs = `<clipPath id="poly"><polygon points="${ptsStr}"/></clipPath>`;
        const strokeJoin = borderStyle === 'scallop-stamp' ? 'round' : 'miter';
        let extra = '';
        if (borderStyle === 'chamfer' && minDim > w * 5) {
            const d = w + Math.max(2, Math.round(w * 0.45));
            const off = Math.round(d * 0.4142), ch = spec.cham;
            const innerPts = [[ch + off, d], [W - ch - off, d], [W - d, ch + off], [W - d, H - ch - off], [W - ch - off, H - d], [ch + off, H - d], [d, H - ch - off], [d, ch + off]];
            extra = `<polygon points="${innerPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="${Math.max(1, +(w * 0.25).toFixed(1))}"/>`;
        } else if (borderStyle === 'scallop-stamp' && minDim > w * 4) {
            const ins = w + Math.max(2, Math.round(w * 0.35));
            extra = `<rect x="${ins}" y="${ins}" width="${Math.max(2, W - ins * 2)}" height="${Math.max(2, H - ins * 2)}" fill="none" stroke="#fff" stroke-opacity="0.52" stroke-width="${Math.max(1, +(w * 0.25).toFixed(1))}" stroke-dasharray="4 4"/>`;
        } else if (borderStyle === 'notched') {
            extra = `<rect x="${Math.round(W * 0.36)}" y="0" width="${Math.round(W * 0.28)}" height="${Math.max(2, Math.round(w * 0.55))}" fill="#fff" fill-opacity="0.62"/>`
                + `<rect x="${Math.round(W * 0.36)}" y="${H - Math.max(2, Math.round(w * 0.55))}" width="${Math.round(W * 0.28)}" height="${Math.max(2, Math.round(w * 0.55))}" fill="#fff" fill-opacity="0.62"/>`;
        } else if (borderStyle === 'pixel-arcade') {
            const p = Math.max(2, Math.round(spec.st * 0.75)), ins = w + Math.max(2, Math.round(w * 0.3));
            extra = `<rect x="${ins + p}" y="${ins + p}" width="${p}" height="${p}" fill="#fff" fill-opacity="0.58"/>`
                + `<rect x="${W - ins - p * 2}" y="${ins + p}" width="${p}" height="${p}" fill="#fff" fill-opacity="0.58"/>`
                + `<rect x="${W - ins - p * 2}" y="${H - ins - p * 2}" width="${p}" height="${p}" fill="#fff" fill-opacity="0.58"/>`
                + `<rect x="${ins + p}" y="${H - ins - p * 2}" width="${p}" height="${p}" fill="#fff" fill-opacity="0.58"/>`;
        }
        return {
            useBoxMask: false,
            svg: wrapSvg(defs, `<polygon points="${ptsStr}" fill="none" stroke="#fff" stroke-linejoin="${strokeJoin}" stroke-width="${w * 2}" clip-path="url(#poly)"/>${extra}`)
        };
    } else if (borderStyle === 'crosshair') {
        const rail = Math.max(1, +(w * 0.25).toFixed(2));
        parts.push(`<path d="${svgInsetRimPath(W, H, Math.round(w * 0.3), rail, radii)}" fill="#fff" fill-opacity="0.3" fill-rule="evenodd"/>`);
        const arm = Math.max(12, Math.min(Math.floor(minDim * 0.24), Math.round(12 + w * 1.6)));
        for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [W, H, -1, -1], [0, H, 1, -1]]) {
            parts.push(`<rect x="${dx > 0 ? cx : cx - arm}" y="${dy > 0 ? cy : cy - w}" width="${arm}" height="${w}" fill="#fff"/>`);
            parts.push(`<rect x="${dx > 0 ? cx : cx - w}" y="${dy > 0 ? cy : cy - arm}" width="${w}" height="${arm}" fill="#fff"/>`);
        }
        const sightLen = Math.max(8, Math.min(Math.floor(minDim * 0.24), Math.round(w * 2.2))), pinW = Math.max(2, Math.round(w * 0.7)), tickLen = Math.max(4, Math.round(sightLen * 0.55));
        // Top, bottom, left, right rangefinder pins + graduation ticks
        parts.push(`<rect x="${(W - pinW) / 2}" y="0" width="${pinW}" height="${sightLen}" fill="#fff"/>`);
        parts.push(`<rect x="${(W - pinW) / 2}" y="${H - sightLen}" width="${pinW}" height="${sightLen}" fill="#fff"/>`);
        parts.push(`<rect x="0" y="${(H - pinW) / 2}" width="${sightLen}" height="${pinW}" fill="#fff"/>`);
        parts.push(`<rect x="${W - sightLen}" y="${(H - pinW) / 2}" width="${sightLen}" height="${pinW}" fill="#fff"/>`);
        for (const off of [-16, 16, -32, 32]) {
            if (Math.abs(off) < W / 2 - arm) {
                parts.push(`<rect x="${W / 2 + off - 1}" y="0" width="2" height="${tickLen}" fill="#fff" fill-opacity="0.72"/>`);
                parts.push(`<rect x="${W / 2 + off - 1}" y="${H - tickLen}" width="2" height="${tickLen}" fill="#fff" fill-opacity="0.72"/>`);
            }
            if (Math.abs(off) < H / 2 - arm) {
                parts.push(`<rect x="0" y="${H / 2 + off - 1}" width="${tickLen}" height="2" fill="#fff" fill-opacity="0.72"/>`);
                parts.push(`<rect x="${W - tickLen}" y="${H / 2 + off - 1}" width="${tickLen}" height="2" fill="#fff" fill-opacity="0.72"/>`);
            }
        }
    } else if (borderStyle === 'hazard' || borderStyle === 'chevron-track') {
        const rim = svgInsetRimPath(W, H, 0, w, radii);
        const step = Math.max(10, Math.round(w * 2.2));
        const patDef = borderStyle === 'hazard'
            ? `<pattern id="p" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="${(step * 0.52).toFixed(1)}" height="${step}" fill="#fff"/></pattern>`
            : `<pattern id="p" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><polygon points="0,0 ${(step * 0.55).toFixed(1)},0 ${step},${(step / 2).toFixed(1)} ${(step * 0.55).toFixed(1)},${step} 0,${step} ${(step * 0.45).toFixed(1)},${(step / 2).toFixed(1)}" fill="#fff"/></pattern>`;
        const railW = Math.max(1, +(w * 0.16).toFixed(2));
        const innerRail = `<path d="${svgInsetRimPath(W, H, Math.max(0, w - railW), railW, radii)}" fill="#fff" fill-opacity="0.45" fill-rule="evenodd"/>`;
        return {
            useBoxMask: false,
            svg: wrapSvg(patDef,
                `<path d="${rim}" fill="#fff" fill-opacity="0.2" fill-rule="evenodd"/><path d="${rim}" fill="url(#p)" fill-rule="evenodd"/>${innerRail}`)
        };
    } else if (borderStyle === 'ornate-filigree') {
        const ow = Math.max(1.5, +(w * 0.42).toFixed(2)), iw = Math.max(1, +(w * 0.22).toFixed(2));
        const ins2 = Math.max(ow + 2, +(w * 0.78).toFixed(2));
        parts.push(`<path d="${svgInsetRimPath(W, H, 0, ow, radii)}" fill="#fff" fill-rule="evenodd"/>`);
        parts.push(`<path d="${svgInsetRimPath(W, H, ins2, iw, radii)}" fill="#fff" fill-opacity="0.74" fill-rule="evenodd"/>`);
        const dSize = Math.max(7, Math.min(18, Math.round(w * 1.45))), fin = Math.round(dSize * 1.65);
        for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [W, H, -1, -1], [0, H, 1, -1]]) {
            const ox = cx + dx * Math.round(w * 0.55), oy = cy + dy * Math.round(w * 0.55);
            parts.push(`<polygon points="${ox},${oy - dSize} ${ox + dSize},${oy} ${ox},${oy + dSize} ${ox - dSize},${oy}" fill="#fff"/>`);
            parts.push(`<polygon points="${ox},${oy} ${ox + dx * fin},${oy - Math.round(dSize * 0.38)} ${ox + dx * (fin + dSize * 0.55)},${oy} ${ox + dx * fin},${oy + Math.round(dSize * 0.38)}" fill="#fff" fill-opacity="0.88"/>`);
            parts.push(`<polygon points="${ox},${oy} ${ox - Math.round(dSize * 0.38)},${oy + dy * fin} ${ox},${oy + dy * (fin + dSize * 0.55)} ${ox + Math.round(dSize * 0.38)},${oy + dy * fin}" fill="#fff" fill-opacity="0.88"/>`);
        }
        const mD = Math.max(4, Math.round(dSize * 0.65));
        for (const [mx, my] of [[W / 2, ow / 2], [W / 2, H - ow / 2], [ow / 2, H / 2], [W - ow / 2, H / 2]]) {
            parts.push(`<polygon points="${mx},${my - mD} ${mx + mD},${my} ${mx},${my + mD} ${mx - mD},${my}" fill="#fff"/>`);
        }
    } else if (borderStyle === 'film-sprocket') {
        const rail = Math.max(1.5, +(w * 0.34).toFixed(2));
        parts.push(`<path d="${svgInsetRimPath(W, H, 0, rail, radii)}" fill="#fff" fill-opacity="0.52" fill-rule="evenodd"/>`);
        const band = Math.max(6, w), sw = Math.max(4, Math.round(band * 0.68)), sh = Math.max(3, Math.round(band * 0.52));
        const pitch = Math.max(10, Math.round(sw * 2.1)), hyTop = (band - sh) / 2, hyBot = H - band + hyTop;
        let holes = '';
        for (let sx = Math.round(pitch * 0.45); sx < W - sw - 2; sx += pitch) {
            holes += ` ${svgRoundedRectPath(sx, hyTop, sw, sh, 1.5, 1.5, 1.5, 1.5)} ${svgRoundedRectPath(sx, hyBot, sw, sh, 1.5, 1.5, 1.5, 1.5)}`;
        }
        const topBand = `M0,0H${W}V${band}H0Z`;
        const botBand = `M0,${H - band}H${W}V${H}H0Z`;
        parts.push(`<path d="${topBand} ${botBand}${holes}" fill="#fff" fill-rule="evenodd"/>`);
    } else {
        return { useBoxMask: true };
    }
    return { useBoxMask: false, svg: wrapSvg('', parts.join('')) };
}

function applyShapeClipPath(node, borderStyle, style, element, width, outset, rw, rh) {
    const shape = element?.type === 'cutout' ? (element.cutout?.shape || 'rectangle') : style.shape;
    if (!SHAPE_CLIP_STYLES.has(borderStyle) || width <= 0 || outset > 0 || shape === 'circle' || shape === 'pill') {
        if (node.style.clipPath) node.style.clipPath = '';
        return;
    }
    const spec = computePolygonBorderSpec(borderStyle, style, Math.max(24, rw), Math.max(24, rh), width);
    const nextClip = spec ? spec.css : '';
    if (node.style.clipPath !== nextClip) node.style.clipPath = nextClip;
}

function syncNeonCoreChild(ring, enabled, width, glowColor, dimFrame) {
    let core = ring.querySelector('[data-neon-core="true"]');
    if (!enabled) {
        if (core) core.remove();
        return;
    }
    if (!core) {
        core = document.createElement('div');
        core.setAttribute('aria-hidden', 'true');
        core.dataset.neonCore = 'true';
        ring.append(core);
    }
    const coreW = Math.max(1, Math.min(width, Math.round(width * 0.45)));
    const coreInset = Math.max(0, Math.round((width - coreW) / 2));
    const coreAlpha = dimFrame ? 0.24 : 0.92;
    const sig = `${coreW}|${coreInset}|${coreAlpha}|${glowColor}`;
    if (core._sig !== sig) {
        core._sig = sig;
        core.style.cssText = `position:absolute;inset:${coreInset}px;box-sizing:border-box;border:${coreW}px solid rgba(255,255,255,${coreAlpha});border-radius:inherit;pointer-events:none;box-shadow:0 0 ${Math.max(3, Math.round(width * 0.9))}px rgba(255,255,255,${dimFrame ? 0.25 : 0.85}),0 0 ${Math.max(6, Math.round(width * 1.8))}px ${glowColor};`;
    }
}

function clearRingMask(ring) {
    ring.style.removeProperty('-webkit-mask');
    ring.style.removeProperty('mask');
    ring.style.removeProperty('-webkit-mask-composite');
    ring.style.removeProperty('mask-composite');
    ring.style.removeProperty('-webkit-mask-image');
    ring.style.removeProperty('mask-image');
    ring.style.removeProperty('-webkit-mask-size');
    ring.style.removeProperty('mask-size');
    ring.style.removeProperty('-webkit-mask-repeat');
    ring.style.removeProperty('mask-repeat');
}

function applyRingStyleMask(ring, borderStyle, width, rw, rh, style, element, outset, isNeon, glowColor, dimFrame) {
    const maskSig = `${borderStyle}|${width}|${rw}x${rh}|${outset}|${style.shape || ''}|${style.borderRadius || 0}|${JSON.stringify(style.borderRadiusCorners || {})}|${isNeon ? 1 : 0}|${dimFrame ? 1 : 0}|${glowColor}`;
    if (ring._maskSig !== maskSig) {
        ring._maskSig = maskSig;
        const result = buildBorderMaskSvg(borderStyle, width, rw, rh, style, element, outset);
        clearRingMask(ring);
        if (result.useBoxMask) {
            ring.style.border = `${width}px solid transparent`;
            ring.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
            ring.style.setProperty('-webkit-mask-composite', 'xor');
            ring.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
            ring.style.setProperty('mask-composite', 'exclude');
        } else {
            ring.style.border = '0';
            const uri = `url("data:image/svg+xml,${encodeURIComponent(result.svg)}")`;
            ring.style.setProperty('-webkit-mask-image', uri);
            ring.style.setProperty('mask-image', uri);
            ring.style.setProperty('-webkit-mask-size', '100% 100%');
            ring.style.setProperty('mask-size', '100% 100%');
            ring.style.setProperty('-webkit-mask-repeat', 'no-repeat');
            ring.style.setProperty('mask-repeat', 'no-repeat');
        }
    }
    syncNeonCoreChild(ring, isNeon, width, glowColor, dimFrame);
}

// Applies full border styling, gradients, glows, and hardware-accelerated animations across all element types.
function applyBorderEffects(node, style = {}, element = {}) {
    if (!node) return;
    const lineShape = element.type === 'shape' && style.shape === 'line';
    const width = lineShape ? 0 : Math.max(0, Number(style.borderWidth) || 0);
    const shapeBorder = element.type === 'shape' && !lineShape;
    const placement = shapeBorder ? borderPlacement(style, element) : 'inside';
    const outset = width * (placement === 'outside' ? 1 : placement === 'center' ? 0.5 : 0);
    const innerInset = width - outset;
    const radius = resolveBorderRadius(style, element);
    const outerRadius = outset && radius !== '50%'
        ? radius.split(/\s+/).map(part => `calc(${part} + ${outset}px)`).join(' ')
        : radius;
    const borderStyle = style.borderStyle || 'solid';
    const isCustomRing = CUSTOM_RING_STYLES.has(borderStyle);
    const borderColor = style.borderColor || 'transparent';
    const c = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
    const g = style.borderGradient;
    const anim = style.borderAnimation || {};
    const animType = anim.type || 'none';
    const glow = style.borderGlow || {};
    const ish = style.innerShadow || {};
    const hasInnerGlow = glow.enabled && glow.inner;
    const hasInnerShadow = Number(ish.blur) > 0 || Number(ish.spread) > 0;
    const hasBorderGradient = width > 0 && Boolean(g?.enabled);
    const hasBorderAnim = width > 0 && Boolean(animType && animType !== 'none');
    const hasRingBorder = hasBorderGradient || hasBorderAnim || (width > 0 && (shapeBorder || isCustomRing));

    const bw = Math.max(24, Math.round(Number(element.width) || node.offsetWidth || 400));
    const bh = Math.max(24, Math.round(Number(element.height) || node.offsetHeight || 120));
    const rw = Math.round(bw + outset * 2);
    const rh = Math.round(bh + outset * 2);

    applyShapeClipPath(node, borderStyle, style, element, width, outset, bw, bh);
    node.style.boxShadow = computeBoxShadow(style, width, outset);

    if (hasInnerGlow || hasInnerShadow || hasRingBorder) {
        if (!node._borderObserver) {
            node._borderObserver = new MutationObserver(() => {
                if (node._borderRing && node._borderRing.parentNode !== node) node.append(node._borderRing);
                if (node._borderFxRing && node._borderFxRing.parentNode !== node) node.append(node._borderFxRing);
                if (node._innerGlowRing && node._innerGlowRing.parentNode !== node) node.append(node._innerGlowRing);
            });
            node._borderObserver.observe(node, { childList: true });
        }
    } else if (node._borderObserver) {
        node._borderObserver.disconnect();
        node._borderObserver = null;
    }

    // Inner shadow and inner glow render via a dedicated overlay under borders so they stay visible over fills, images, videos, and cutouts.
    if (hasInnerGlow || hasInnerShadow) {
        let innerRing = node._innerGlowRing;
        if (!innerRing) {
            innerRing = node._innerGlowRing = document.createElement('div');
            innerRing.setAttribute('aria-hidden', 'true');
            innerRing.dataset.innerGlow = 'true';
        }
        if (innerRing.parentNode !== node) node.append(innerRing);

        const innerShadows = [];
        if (hasInnerShadow) {
            const isx = Number(ish.x) || 0;
            const isy = Number(ish.y) || 0;
            const isb = Math.max(0, Number(ish.blur) || 0);
            const iss = Math.max(0, Number(ish.spread) || 0);
            const isc = ish.color || 'rgba(0,0,0,0.5)';
            innerShadows.push(`inset ${isx}px ${isy}px ${isb}px ${iss}px ${isc}`);
        }
        if (hasInnerGlow) {
            const gc = glow.color && glow.color !== 'transparent' ? glow.color : c;
            const gb = Math.max(0, Number(glow.blur ?? 16));
            const gs = Math.max(0, Number(glow.spread ?? 2));
            if (glow.neon) {
                innerShadows.push('inset 0 0 3px #ffffff', `inset 0 0 ${gb}px ${Math.max(2, gs)}px ${gc}`);
            } else {
                innerShadows.push(`inset 0 0 ${gb}px ${Math.max(1, gs)}px ${gc}`);
            }
        }
        const innerShadowCss = innerShadows.join(', ');
        const insetCss = hasRingBorder ? `${innerInset}px` : '0';
        const radiusCss = width > 0 && radius !== '50%'
            ? radius.split(/\s+/).map(part => `max(0px, calc(${part} - ${innerInset}px))`).join(' ')
            : radius;
        const innerSig = `${insetCss}|${radiusCss}|${innerShadowCss}`;
        if (innerRing._sig !== innerSig) {
            innerRing._sig = innerSig;
            innerRing.style.cssText = `position:absolute;inset:${insetCss};box-sizing:border-box;border-radius:${radiusCss};pointer-events:none;z-index:1;box-shadow:${innerShadowCss};`;
        }
    } else if (node._innerGlowRing) {
        node._innerGlowRing.remove();
        node._innerGlowRing = null;
    }

    if (width <= 0) {
        if (node._borderRing) { node._borderRing.remove(); node._borderRing = null; }
        if (node._borderFxRing) { node._borderFxRing.remove(); node._borderFxRing = null; }
        if (!hasInnerGlow && !hasInnerShadow && node._borderObserver) {
            node._borderObserver.disconnect();
            node._borderObserver = null;
        }
        if (element.type !== 'cutout') node.style.border = '0';
        node.style.backgroundClip = '';
        return;
    }

    const basePaint1 = hasBorderGradient ? (g.from || '#1f6feb') : c;
    const basePaintMid = hasBorderGradient && g.mid && g.mid !== 'transparent' && g.mid !== 'none' ? g.mid : '';
    const basePaint2 = hasBorderGradient ? (g.to || '#8957e5') : '';
    const staticPaintCss = hasBorderGradient ? gradientCss(g) : c;
    const neonGlowCol = hasBorderGradient ? (g.from || c) : (glow.enabled && glow.color && glow.color !== 'transparent' ? glow.color : c);
    const isNeon = borderStyle === 'neon-tube';

    // Animated Border (handles all 11 animations composed cleanly with all 21 styles and optional borderGradient)
    if (hasBorderAnim) {
        if (node._borderRing) { node._borderRing.remove(); node._borderRing = null; }
        ensureBorderKeyframes();
        let fxRing = node._borderFxRing;
        if (!fxRing) {
            fxRing = node._borderFxRing = document.createElement('div');
            fxRing.setAttribute('aria-hidden', 'true');
            fxRing.dataset.borderFxRing = 'true';
        }
        if (fxRing.parentNode !== node) node.append(fxRing);
        node.style.border = '0';
        node.style.backgroundClip = 'padding-box';

        const isClassicMarching = animType === 'marching' && !hasBorderGradient && !isCustomRing && (borderStyle === 'solid' || borderStyle === 'dashed' || borderStyle === 'dotted');
        if (isClassicMarching) {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
            const rad = node.style.borderRadius || '0px';
            const sig = `marching-svg|${width}|${speed}|${c}|${rad}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing._maskSig = null;
                clearRingMask(fxRing);
                fxRing.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2;';
                fxRing.innerHTML = `<svg data-border-fx="marching" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;"><rect x="${width / 2}" y="${width / 2}" width="calc(100% - ${width}px)" height="calc(100% - ${width}px)" rx="${rad}" ry="${rad}" fill="none" stroke="${c}" stroke-width="${width}" stroke-dasharray="${Math.max(6, width * 2)} ${Math.max(4, width * 1.5)}" style="animation:sp-border-marching ${speed}s linear infinite;"></rect></svg>`;
            }
        } else {
            let paintBg = staticPaintCss;
            let bgSize = 'cover';
            let animRule = '';
            let colorRule = '';
            let filterRule = isNeon ? `drop-shadow(0 0 ${Math.max(5, width * 1.5)}px ${neonGlowCol})` : '';
            let dimNeonFrame = false;
            let radialSurface = 0;

            if (animType === 'rotating') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const size = Math.max(10, Math.min(100, Number(anim.size) || 35));
                const arc = Math.round(360 * (size / 100));
                const head = anim.color2 || '#ffffff';
                const trail = basePaint2 || basePaint1;
                const midStop = basePaintMid ? `${basePaint1} ${360 - arc + Math.round(arc * 0.25)}deg, ${basePaintMid} ${360 - Math.round(arc * 0.5)}deg,` : '';
                paintBg = `conic-gradient(from var(--sp-angle), transparent 0deg, transparent ${360 - arc}deg, ${midStop}${trail} ${360 - Math.round(arc / 3)}deg, ${head} 360deg)`;
                animRule = `sp-border-spin ${speed}s linear infinite`;
                dimNeonFrame = true;
            } else if (animType === 'dual-beam') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const size = Math.max(10, Math.min(100, Number(anim.size) || 35));
                const halfArc = Math.max(18, Math.round(180 * (size / 100)));
                const head = anim.color2 || '#ffffff';
                const trail = basePaint2 || basePaint1;
                paintBg = `conic-gradient(from var(--sp-angle), transparent 0deg, transparent ${180 - halfArc}deg, ${trail} ${180 - Math.round(halfArc * 0.35)}deg, ${head} 180deg, transparent 181deg, transparent ${360 - halfArc}deg, ${trail} ${360 - Math.round(halfArc * 0.35)}deg, ${head} 360deg)`;
                animRule = `sp-border-spin ${speed}s linear infinite`;
                dimNeonFrame = true;
            } else if (animType === 'laser-scan') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 3.5));
                const head = anim.color2 || '#ffffff';
                const trail = basePaint2 || basePaint1;
                const baseDim = colorWithAlpha(trail, 0.22);
                paintBg = `conic-gradient(from var(--sp-angle), ${baseDim} 0deg, ${baseDim} 295deg, ${trail} 342deg, ${head} 357deg, ${baseDim} 360deg)`;
                animRule = `sp-border-laser ${speed}s linear infinite`;
                dimNeonFrame = true;
            } else if (animType === 'plasma') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 3.5));
                const p1 = basePaint1;
                const p2 = anim.color2 || basePaint2 || '#a855f7';
                const pm = (anim.color3 && anim.color3 !== 'transparent' && anim.color3 !== 'none') ? anim.color3 : (basePaintMid || '#ffffff');
                paintBg = `conic-gradient(from var(--sp-angle), ${p1} 0deg, ${pm} 45deg, ${p2} 95deg, ${colorWithAlpha(p1, 0.3)} 145deg, ${pm} 185deg, ${p1} 230deg, ${p2} 285deg, ${pm} 325deg, ${p1} 360deg)`;
                animRule = `sp-border-plasma ${speed}s linear infinite`;
                filterRule = '';
            } else if (animType === 'radial') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const size = Math.max(10, Math.min(100, Number(anim.size) || 40));
                const mode = ['spotlight', 'two-tone', 'fade-white', 'fade-black', 'rainbow'].includes(anim.mode) ? anim.mode : 'spotlight';
                const direction = ['cw', 'ccw', 'alternate'].includes(anim.direction) ? anim.direction : 'cw';
                const head = anim.color2 || (mode === 'spotlight' ? '#ffffff' : '#38bdf8');
                const trail = basePaint2 || basePaint1;
                const mid = (anim.color3 && anim.color3 !== 'transparent' && anim.color3 !== 'none') ? anim.color3 : basePaintMid;
                const pctSize = Math.max(160, Math.min(320, Math.round(150 + size * 1.5)));
                bgSize = `${pctSize}% ${pctSize}%`;
                // Bound promoted textures to 4 MP instead of allocating huge 4K surfaces.
                if (rw * rh * (pctSize / 100) ** 2 <= 4194304) radialSurface = pctSize;
                let stops = '';
                if (mode === 'rainbow') {
                    stops = '#ff0055 0%, #ff9900 17%, #ffee00 33%, #00ff66 50%, #00bbff 67%, #8800ff 83%, #ff0055 100%';
                } else if (mode === 'fade-white') {
                    stops = mid ? `${head} 0%, ${mid} 45%, #ffffff 100%` : `${head} 0%, #ffffff 100%`;
                } else if (mode === 'fade-black') {
                    stops = mid ? `${head} 0%, ${mid} 45%, #000000 100%` : `${head} 0%, #000000 100%`;
                } else if (mode === 'two-tone') {
                    stops = mid ? `${head} 0%, ${mid} 45%, ${trail} 100%` : `${head} 0%, ${trail} 100%`;
                } else {
                    const spreadRatio = Math.max(20, Math.min(80, size));
                    stops = mid
                        ? `${head} 0%, ${mid} ${Math.round(spreadRatio * 0.45)}%, ${trail} ${spreadRatio}%, transparent ${Math.min(100, Math.round(spreadRatio * 1.5))}%`
                        : `${head} 0%, ${trail} ${spreadRatio}%, transparent ${Math.min(100, Math.round(spreadRatio * 1.5))}%`;
                    dimNeonFrame = true;
                }
                const animName = radialSurface
                    ? (direction === 'ccw' ? 'sp-border-radial-circuit-rev' : 'sp-border-radial-circuit')
                    : (direction === 'ccw' ? 'sp-border-radial-paint-rev' : 'sp-border-radial-paint');
                const animDir = direction === 'alternate' ? 'alternate' : 'normal';
                paintBg = `radial-gradient(circle, ${stops})`;
                animRule = `${animName} ${speed}s ease-in-out infinite ${animDir}`;
            } else if (animType === 'pulsing' || animType === 'strobe-flash') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
                paintBg = staticPaintCss;
                colorRule = basePaint1;
                animRule = `${animType === 'strobe-flash' ? 'sp-border-surge' : 'sp-border-pulse'} ${speed}s ease-in-out infinite`;
                filterRule = '';
            } else if (animType === 'gradient') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                const c1 = basePaint1 === '#38bdf8' && borderColor === 'transparent' ? '#1f6feb' : basePaint1;
                const mid = (anim.color3 && anim.color3 !== 'transparent' && anim.color3 !== 'none') ? anim.color3 : basePaintMid;
                const c2 = anim.color2 || basePaint2 || '#8957e5';
                const stops = [c1, mid, c2].filter(Boolean).join(', ');
                paintBg = `linear-gradient(135deg, ${stops})`;
                bgSize = '200% 200%';
                animRule = `sp-border-gradient-shift ${speed}s ease-in-out infinite alternate`;
            } else if (animType === 'rainbow') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
                paintBg = 'linear-gradient(135deg, #ff0055, #ff9900, #ffee00, #00ff66, #00bbff, #8800ff, #ff0055)';
                animRule = `sp-border-rainbow ${speed}s linear infinite`;
                filterRule = '';
            } else if (animType === 'marching') {
                const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
                const m2 = anim.color2 || basePaint2 || colorWithAlpha(basePaint1, 0.22);
                paintBg = `linear-gradient(45deg, ${basePaint1} 25%, ${m2} 25%, ${m2} 50%, ${basePaint1} 50%, ${basePaint1} 75%, ${m2} 75%, ${m2} 100%)`;
                bgSize = '40px 40px';
                animRule = `sp-border-marching-bg ${speed}s linear infinite`;
            }

            const fxSig = `fx|${paintBg}|${bgSize}|${animRule}|${colorRule}|${filterRule}|${radialSurface}`;
            if (fxRing._sig !== fxSig) {
                fxRing._sig = fxSig;
                fxRing._maskSig = null;
                fxRing.querySelectorAll('svg').forEach(el => el.remove());
                fxRing.querySelector('[data-border-fx="radial"]')?.remove();
                fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border-radius:inherit;pointer-events:none;background:${radialSurface ? 'transparent' : paintBg};background-size:${bgSize};animation:${radialSurface ? 'none' : animRule};z-index:2;`
                    + (colorRule ? `color:${colorRule};` : '')
                    + (filterRule ? `filter:${filterRule};` : '');
                if (radialSurface) {
                    const surface = document.createElement('div');
                    surface.dataset.borderFx = 'radial';
                    surface.style.cssText = `position:absolute;top:0;left:0;width:${radialSurface}%;height:${radialSurface}%;background:${paintBg};--sp-border-travel:${-100 * (radialSurface - 100) / radialSurface}%;animation:${animRule};`;
                    fxRing.appendChild(surface);
                }
            }
            applyRingStyleMask(fxRing, borderStyle, width, rw, rh, style, element, outset, isNeon, neonGlowCol, dimNeonFrame);
        }
    } else {
        if (node._borderFxRing) {
            node._borderFxRing.remove();
            node._borderFxRing = null;
        }

        // Static / Gradient Ring OR Native Border
        if (hasBorderGradient || shapeBorder || isCustomRing) {
            let ring = node._borderRing;
            if (!ring) {
                ring = node._borderRing = document.createElement('div');
                ring.setAttribute('aria-hidden', 'true');
                ring.dataset.borderRing = 'true';
            }
            if (ring.parentNode !== node) node.append(ring);
            node.style.border = '0';
            node.style.backgroundClip = hasBorderGradient ? 'padding-box' : '';

            if (!hasBorderGradient && !isCustomRing) {
                // Standard / 3D Bevel border on shapes renders natively on _borderRing
                const sig = `shape-css|${width}|${borderStyle}|${borderColor}`;
                if (ring._sig !== sig) {
                    ring._sig = sig;
                    ring._maskSig = null;
                    clearRingMask(ring);
                    syncNeonCoreChild(ring, false, width, neonGlowCol, false);
                    ring.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px ${borderStyle} ${borderColor};border-radius:inherit;pointer-events:none;z-index:2;`;
                    ring.innerHTML = '';
                }
            } else {
                let animCss = '';
                let bgSize = 'cover';
                if (hasBorderGradient && g.animate) {
                    ensureGradientKeyframes();
                    animCss = `${slidesVertically(g) ? 'sp-gradient-shift-y' : 'sp-gradient-shift'} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate`;
                    bgSize = '200% 200%';
                }
                const filterRule = isNeon ? `drop-shadow(0 0 ${Math.max(5, width * 1.5)}px ${neonGlowCol})` : '';
                const ringSig = `ring|${staticPaintCss}|${bgSize}|${animCss}|${filterRule}`;
                if (ring._sig !== ringSig) {
                    ring._sig = ringSig;
                    ring._maskSig = null;
                    ring.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border-radius:inherit;pointer-events:none;background:${staticPaintCss};background-size:${bgSize};animation:${animCss};z-index:2;`
                        + (filterRule ? `filter:${filterRule};` : '');
                }
                applyRingStyleMask(ring, borderStyle, width, rw, rh, style, element, outset, isNeon, neonGlowCol, false);
            }
        } else {
            if (node._borderRing) {
                node._borderRing.remove();
                node._borderRing = null;
            }
            node.style.border = `${width}px ${borderStyle} ${borderColor}`;
            node.style.backgroundClip = '';
        }
    }

    // The source box stays fixed; only the decorative ring expands beyond it.
    for (const ring of [node._borderRing, node._borderFxRing]) {
        if (!ring) continue;
        ring.style.inset = `${-outset}px`;
        ring.style.width = ring.style.height = '';
        ring.style.borderRadius = outerRadius;
        const rect = ring.querySelector('svg > rect');
        if (rect) {
            const firstRad = String(outerRadius).split(' ')[0];
            const strokeRadius = `max(0px, calc(${firstRad} - ${width / 2}px))`;
            rect.style.rx = rect.style.ry = strokeRadius;
        }
    }
}

function applyBorderGradient(node, style = {}, element = {}) {
    applyBorderEffects(node, style, element);
}

// Outline, text shadow and case/decoration apply to the text itself (and inherit into markdown and alert text).
function textEffectStyle(style = {}, type = '') {
    if (type === 'icon') return {};
    const stroke = style.textStroke?.width > 0;
    const sBlur = Number(style.textShadow?.blur) || 0;
    const sx = Number.isFinite(Number(style.textShadow?.x)) ? Number(style.textShadow.x) : 0;
    const sy = Number.isFinite(Number(style.textShadow?.y)) ? Number(style.textShadow.y) : 2;
    const sColor = style.textShadow?.color || 'rgba(0,0,0,.7)';
    return {
        webkitTextStroke: stroke ? `${style.textStroke.width}px ${style.textStroke.color || '#000'}` : '',
        paintOrder: stroke ? 'stroke fill' : '',
        textShadow: sBlur > 0 && !isTextGradient(style, type) ? `${sx}px ${sy}px ${sBlur}px ${sColor}` : '',
        // Clipped gradient text ignores text-shadow, so a drop-shadow filter follows the letters instead (only when no box fill would be shadowed too).
        filter: sBlur > 0 && isTextGradient(style, type) && !hasBoxFill(style) ? `drop-shadow(${sx}px ${sy}px ${sBlur}px ${sColor})` : '',
        fontStyle: style.fontStyle === 'italic' ? 'italic' : 'normal',
        fontVariantNumeric: style.tabularNums ? 'tabular-nums' : '',
        textTransform: style.textTransform && style.textTransform !== 'none' ? style.textTransform : '',
        textDecoration: style.textDecoration && style.textDecoration !== 'none' ? style.textDecoration : ''
    };
}

function ensureTextAnimKeyframes() {
    if (document.getElementById('sp-text-anim-keyframes')) return;
    const tag = document.createElement('style');
    tag.id = 'sp-text-anim-keyframes';
    tag.textContent = `
        @keyframes sp-text-pulse { 0%, 100% { scale: 1; } 50% { scale: var(--sp-ta-scale, 1.06); } }
        @keyframes sp-text-heartbeat { 0%, 100% { scale: 1; } 12% { scale: var(--sp-ta-scale, 1.08); } 24% { scale: 1; } 36% { scale: var(--sp-ta-scale, 1.08); } 52% { scale: 1; } }
        @keyframes sp-text-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 calc(var(--sp-ta-dist, 6px) * -1); } }
        @keyframes sp-text-wave { 0%, 100% { translate: 0 0; } 25% { translate: calc(var(--sp-ta-dist, 5px) * 0.45) calc(var(--sp-ta-dist, 5px) * -0.7); } 75% { translate: calc(var(--sp-ta-dist, 5px) * -0.45) calc(var(--sp-ta-dist, 5px) * 0.7); } }
        @keyframes sp-text-wiggle { 0%, 100% { rotate: 0deg; } 20% { rotate: calc(var(--sp-ta-rot, 4deg) * -1); } 40% { rotate: var(--sp-ta-rot, 4deg); } 60% { rotate: calc(var(--sp-ta-rot, 4deg) * -0.7); } 80% { rotate: calc(var(--sp-ta-rot, 4deg) * 0.7); } }
        @keyframes sp-text-wobble { 0%, 100% { translate: 0 0; rotate: 0deg; } 15% { translate: calc(var(--sp-ta-dist, 8px) * -1) 0; rotate: calc(var(--sp-ta-rot, 5deg) * -1.1); } 30% { translate: calc(var(--sp-ta-dist, 8px) * 0.8) 0; rotate: var(--sp-ta-rot, 5deg); } 45% { translate: calc(var(--sp-ta-dist, 8px) * -0.55) 0; rotate: calc(var(--sp-ta-rot, 5deg) * -0.7); } 60% { translate: calc(var(--sp-ta-dist, 8px) * 0.35) 0; rotate: calc(var(--sp-ta-rot, 5deg) * 0.45); } 75% { translate: calc(var(--sp-ta-dist, 8px) * -0.15) 0; rotate: calc(var(--sp-ta-rot, 5deg) * -0.2); } }
        @keyframes sp-text-shake { 0%, 55%, 100% { translate: 0 0; } 10%, 30%, 50% { translate: calc(var(--sp-ta-glitch, 4px) * -1) 1px; } 20%, 40% { translate: var(--sp-ta-glitch, 4px) -1px; } }
        @keyframes sp-text-swing { 0%, 100% { rotate: calc(var(--sp-ta-rot, 5deg) * -0.85); translate: 0 0; } 50% { rotate: calc(var(--sp-ta-rot, 5deg) * 0.85); translate: 0 calc(var(--sp-ta-dist, 4px) * -0.25); } }
        @keyframes sp-text-bounce { 0%, 60%, 100% { translate: 0 0; scale: 1 1; } 25% { translate: 0 calc(var(--sp-ta-dist, 8px) * -1.3); scale: 0.97 1.05; } 45% { translate: 0 1px; scale: 1.03 0.94; } 75% { translate: 0 calc(var(--sp-ta-dist, 8px) * -0.45); scale: 0.99 1.02; } }
        @keyframes sp-text-glitch { 0%, 84%, 100% { translate: 0 0; rotate: 0deg; opacity: 1; } 86% { translate: calc(var(--sp-ta-glitch, 3px) * -1.4) 0; rotate: -0.6deg; } 88% { translate: calc(var(--sp-ta-glitch, 3px) * 1.4) 1px; rotate: 0.6deg; opacity: 0.86; } 90% { translate: calc(var(--sp-ta-glitch, 3px) * -0.8) -1px; } 92% { translate: var(--sp-ta-glitch, 3px) 0; opacity: 0.92; } 94% { translate: 0 0; opacity: 1; } }

        @keyframes sp-ta-word-bounce { 0%, 55%, 100% { transform: translate3d(0, 0, 0) scale(1, 1); } 22% { transform: translate3d(0, calc(var(--sp-ta-dist, 7px) * -1.2), 0) scale(0.97, 1.05); } 40% { transform: translate3d(0, 1px, 0) scale(1.03, 0.95); } }
        @keyframes sp-ta-word-wave { 0%, 100% { transform: translate3d(0, 0, 0); } 25% { transform: translate3d(0, calc(var(--sp-ta-dist, 6px) * -0.9), 0); } 75% { transform: translate3d(0, calc(var(--sp-ta-dist, 6px) * 0.6), 0); } }
        @keyframes sp-ta-word-wiggle { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(calc(var(--sp-ta-rot, 5deg) * -1)); } 75% { transform: rotate(var(--sp-ta-rot, 5deg)); } }
        @keyframes sp-ta-word-wobble { 0%, 100% { transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); } 25% { transform: translate3d(calc(var(--sp-ta-dist, 6px) * -0.45), 0, 0) skewX(-6deg) rotate(calc(var(--sp-ta-rot, 4deg) * -0.7)); } 75% { transform: translate3d(calc(var(--sp-ta-dist, 6px) * 0.45), 0, 0) skewX(6deg) rotate(calc(var(--sp-ta-rot, 4deg) * 0.7)); } }
        @keyframes sp-ta-word-pop { 0%, 40%, 100% { transform: scale(1); } 16% { transform: scale(var(--sp-ta-scale, 1.14)); } 28% { transform: scale(0.96); } }
        @keyframes sp-ta-word-reveal { 0%, 6% { opacity: 0; transform: translate3d(0, calc(var(--sp-ta-dist, 8px) * 1.1), 0) scale(0.92); } 18%, 78% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } 90%, 100% { opacity: 0; transform: translate3d(0, calc(var(--sp-ta-dist, 8px) * -0.6), 0) scale(0.96); } }
        @keyframes sp-ta-word-reveal-once { 0% { opacity: 0; transform: translate3d(0, calc(var(--sp-ta-dist, 8px) * 1.1), 0) scale(0.92); } 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }

        @keyframes sp-ta-char-bounce { 0%, 50%, 100% { transform: translate3d(0, 0, 0) scale(1, 1); } 20% { transform: translate3d(0, calc(var(--sp-ta-dist, 7px) * -1.25), 0) scale(0.94, 1.08); } 36% { transform: translate3d(0, 1px, 0) scale(1.06, 0.92); } }
        @keyframes sp-ta-char-wave { 0%, 100% { transform: translate3d(0, 0, 0); } 25% { transform: translate3d(0, calc(var(--sp-ta-dist, 6px) * -1), 0); } 75% { transform: translate3d(0, calc(var(--sp-ta-dist, 6px) * 0.65), 0); } }
        @keyframes sp-ta-char-wiggle { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(calc(var(--sp-ta-rot, 6deg) * -1.35)); } 75% { transform: rotate(calc(var(--sp-ta-rot, 6deg) * 1.35)); } }
        @keyframes sp-ta-char-wobble { 0%, 100% { transform: translate3d(0, 0, 0) skewX(0deg) rotate(0deg); } 25% { transform: translate3d(calc(var(--sp-ta-dist, 5px) * -0.35), 0, 0) skewX(-8deg) rotate(calc(var(--sp-ta-rot, 5deg) * -1)); } 75% { transform: translate3d(calc(var(--sp-ta-dist, 5px) * 0.35), 0, 0) skewX(8deg) rotate(var(--sp-ta-rot, 5deg)); } }
        @keyframes sp-ta-char-jitter { 0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); } 20% { transform: translate3d(calc(var(--sp-ta-glitch, 3px) * -0.8), calc(var(--sp-ta-glitch, 3px) * 0.6), 0) rotate(calc(var(--sp-ta-rot, 4deg) * -0.7)); } 40% { transform: translate3d(calc(var(--sp-ta-glitch, 3px) * 0.9), calc(var(--sp-ta-glitch, 3px) * -0.7), 0) rotate(calc(var(--sp-ta-rot, 4deg) * 0.8)); } 60% { transform: translate3d(calc(var(--sp-ta-glitch, 3px) * -0.6), calc(var(--sp-ta-glitch, 3px) * -0.5), 0) rotate(calc(var(--sp-ta-rot, 4deg) * -0.5)); } 80% { transform: translate3d(calc(var(--sp-ta-glitch, 3px) * 0.7), calc(var(--sp-ta-glitch, 3px) * 0.5), 0) rotate(calc(var(--sp-ta-rot, 4deg) * 0.6)); } }
        @keyframes sp-ta-char-pop { 0%, 35%, 100% { transform: scale(1); } 14% { transform: scale(var(--sp-ta-scale, 1.18)); } 24% { transform: scale(0.92); } }
        @keyframes sp-ta-caret-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

        [data-text-anim]:not(.overlay-marquee) { overflow: visible !important; text-overflow: clip; }
        .sp-ta-wrap { display: inline-block; width: 100%; max-width: 100%; text-align: inherit; overflow: visible; }
        .sp-image-group-field .sp-ta-wrap { width: auto; }
        .sp-ta-word-group { display: inline; white-space: nowrap; overflow: visible; }
        .sp-ta-unit { display: inline-block; will-change: transform, opacity; transform-origin: 50% 60%; }
        .sp-ta-caret { display: inline-block; width: 0; height: 0.92em; vertical-align: -0.1em; border-right: 0.11em solid currentColor; margin-left: 2px; animation: sp-ta-caret-blink 0.75s step-end infinite; }
        .sp-ta-grad .sp-ta-unit, .sp-ta-grad .sp-ta-typed { background-image: var(--sp-ta-tgrad); background-size: 200% 200%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .sp-fx-paused [data-text-anim], .sp-fx-paused [data-text-anim] .sp-ta-unit, .sp-fx-paused [data-text-anim] .sp-ta-caret { animation-play-state: paused !important; }
        @media (prefers-reduced-motion: reduce) { [data-text-anim], [data-text-anim] .sp-ta-unit, [data-text-anim] .sp-ta-caret { animation: none !important; } }
    `;
    document.head.appendChild(tag);
}

function stopTextAnimation(node, restoreText = false) {
    if (!node) return;
    if (node._textAnimHandle?.stop) {
        try { node._textAnimHandle.stop(); } catch {}
        node._textAnimHandle = null;
    }
    if (node._textAnimWrap) {
        node._textAnimWrap.remove();
        node._textAnimWrap = null;
    }
    node._textAnimSig = '';
    if (restoreText && typeof node._rawText === 'string') {
        const text = node._rawText;
        if (!node.firstElementChild) {
            if (node.textContent !== text) node.textContent = text;
        } else {
            let tn = node._textNode;
            if (!tn || tn.parentNode !== node) {
                tn = [...node.childNodes].find(c => c.nodeType === 3);
                if (!tn) {
                    tn = document.createTextNode('');
                    node.insertBefore(tn, node.firstChild);
                }
                node._textNode = tn;
            }
            if (tn.nodeValue !== text) tn.nodeValue = text;
        }
    }
    if (restoreText) delete node._rawText;
}

function readRawText(node) {
    if (typeof node._rawText === 'string' && node._textAnimWrap?.parentNode === node) return node._rawText;
    if (node._textNode && node._textNode.parentNode === node && node._textNode.nodeValue) return node._textNode.nodeValue;
    const joined = [...node.childNodes].filter(c => c.nodeType === 3).map(c => c.nodeValue).join('');
    if (joined) return joined;
    return node.firstElementChild ? '' : (node.textContent || '');
}

function isMotionPaused(node) {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return true;
    return Boolean(node?.closest?.('.sp-fx-paused'));
}

function blockFallbackForSplit(animType) {
    if (animType.includes('wave')) return 'wave';
    if (animType.includes('wiggle')) return 'wiggle';
    if (animType.includes('wobble')) return 'wobble';
    if (animType.includes('bounce')) return 'bounce';
    if (animType === 'char-jitter') return 'shake';
    return 'pulse';
}

function mountSplitTextAnimation(node, animType, speed, intensity, playMode = 'loop', delay = 0) {
    const rawText = readRawText(node);
    node._rawText = rawText;
    for (const c of [...node.childNodes]) {
        if (c.nodeType === 3) c.nodeValue = '';
    }
    const sig = `${animType}|${playMode}|${delay}|${speed}|${intensity}|${rawText}`;
    if (node._textAnimSig === sig && node._textAnimWrap?.parentNode === node) return;

    stopTextAnimation(node, false);
    node._textAnimSig = sig;
    const wrap = document.createElement('span');
    wrap.className = 'sp-ta-wrap';
    wrap.dataset.spTaWrap = animType;
    node._textAnimWrap = wrap;

    const firstEl = [...node.children].find(c => !c.hasAttribute('aria-hidden'));
    if (firstEl) node.insertBefore(wrap, firstEl);
    else node.appendChild(wrap);

    const once = playMode === 'once';
    const iter = once ? '1 both' : 'infinite';

    if (animType.startsWith('word-')) {
        const parts = rawText.split(/(\r?\n|[ \t]+)/);
        const words = parts.filter(p => p && !/^\s+$/.test(p));
        const stagger = Math.min(0.28, (speed * 0.55) / Math.max(1, words.length));
        const timing = animType === 'word-bounce' ? 'cubic-bezier(0.28, 0.84, 0.42, 1)' : 'ease-in-out';
        const kfName = (animType === 'word-reveal' && once) ? 'sp-ta-word-reveal-once' : `sp-ta-${animType}`;
        let wIdx = 0;
        for (const part of parts) {
            if (!part) continue;
            if (/^\r?\n$/.test(part)) wrap.appendChild(document.createElement('br'));
            else if (/^[ \t]+$/.test(part)) wrap.appendChild(document.createTextNode(part));
            else {
                const span = document.createElement('span');
                span.className = 'sp-ta-unit sp-ta-word';
                span.textContent = part;
                span.style.animation = `${kfName} ${speed}s ${timing} ${(delay + wIdx * stagger).toFixed(3)}s ${iter}`;
                wrap.appendChild(span);
                wIdx++;
            }
        }
        return;
    }

    if (animType.startsWith('char-')) {
        const parts = rawText.split(/(\r?\n|[ \t]+)/);
        const totalChars = [...rawText.replace(/\s+/g, '')].length;
        const stagger = Math.min(0.14, (speed * 0.65) / Math.max(1, totalChars));
        const timing = animType === 'char-bounce' ? 'cubic-bezier(0.28, 0.84, 0.42, 1)' : 'ease-in-out';
        let cIdx = 0;
        for (const part of parts) {
            if (!part) continue;
            if (/^\r?\n$/.test(part)) { wrap.appendChild(document.createElement('br')); continue; }
            if (/^[ \t]+$/.test(part)) { wrap.appendChild(document.createTextNode(part)); continue; }
            const chars = [...part];
            const host = chars.length <= 28 ? document.createElement('span') : wrap;
            if (host !== wrap) {
                host.className = 'sp-ta-word-group';
                wrap.appendChild(host);
            }
            for (const ch of chars) {
                const span = document.createElement('span');
                span.className = 'sp-ta-unit sp-ta-char';
                span.textContent = ch;
                const d = delay + (animType === 'char-jitter'
                    ? (((cIdx * 37) % 11) * (speed * 0.09))
                    : (cIdx * stagger));
                span.style.animation = `sp-ta-${animType} ${speed}s ${timing} ${d.toFixed(3)}s ${iter}`;
                host.appendChild(span);
                cIdx++;
            }
        }
        return;
    }

    if (animType === 'typing') {
        const glyphs = [...rawText];
        const typedEl = document.createElement('span');
        typedEl.className = 'sp-ta-typed';
        const caret = document.createElement('span');
        caret.className = 'sp-ta-caret';
        caret.setAttribute('aria-hidden', 'true');
        wrap.append(typedEl, caret);

        if (!glyphs.length) return;
        const totalMs = Math.max(400, speed * 1000);
        const typeMs = once ? totalMs : totalMs * 0.55;
        const stepMs = Math.max(25, Math.min(260, Math.round(typeMs / glyphs.length)));
        const holdSteps = Math.max(6, Math.round((totalMs * 0.45) / stepMs));
        const delayMs = Math.round(delay * 1000);
        let cursor = delayMs > 0 ? 0 : 1;
        let hold = 0;
        let timer = 0;
        let delayTimer = 0;

        const paint = count => {
            const frag = document.createDocumentFragment();
            let buf = '';
            for (let i = 0; i < count; i++) {
                if (glyphs[i] === '\r') continue;
                if (glyphs[i] === '\n') {
                    if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
                    frag.appendChild(document.createElement('br'));
                } else {
                    buf += glyphs[i];
                }
            }
            if (buf) frag.appendChild(document.createTextNode(buf));
            typedEl.replaceChildren(frag);
        };

        const startTypingLoop = () => {
            if (!node.isConnected) return;
            paint(isMotionPaused(node) ? glyphs.length : 1);
            cursor = 1;
            timer = setInterval(() => {
                if (!node.isConnected) { clearInterval(timer); timer = 0; return; }
                if (document.hidden) return;
                if (isMotionPaused(node)) {
                    paint(glyphs.length);
                    return;
                }
                if (cursor < glyphs.length) {
                    cursor++;
                    paint(cursor);
                } else if (once) {
                    clearInterval(timer);
                    timer = 0;
                    caret.remove();
                } else if (hold < holdSteps) {
                    hold++;
                } else {
                    cursor = 1;
                    hold = 0;
                    paint(cursor);
                }
            }, stepMs);
        };

        if (isMotionPaused(node)) {
            paint(glyphs.length);
            if (once) caret.remove();
        } else if (delayMs > 0) {
            paint(0);
            delayTimer = setTimeout(() => { delayTimer = 0; startTypingLoop(); }, delayMs);
        } else {
            startTypingLoop();
        }
        node._textAnimHandle = {
            stop: () => {
                if (delayTimer) { clearTimeout(delayTimer); delayTimer = 0; }
                if (timer) { clearInterval(timer); timer = 0; }
            }
        };
        return;
    }

    if (animType === 'matrix') {
        const parts = rawText.split(/(\r?\n|[ \t]+)/);
        const slots = [];
        for (const part of parts) {
            if (!part) continue;
            if (/^\r?\n$/.test(part)) { wrap.appendChild(document.createElement('br')); continue; }
            if (/^[ \t]+$/.test(part)) { wrap.appendChild(document.createTextNode(part)); continue; }
            const chars = [...part];
            const host = chars.length <= 28 ? document.createElement('span') : wrap;
            if (host !== wrap) {
                host.className = 'sp-ta-word-group';
                wrap.appendChild(host);
            }
            for (const ch of chars) {
                const span = document.createElement('span');
                span.className = 'sp-ta-unit sp-ta-char';
                span.textContent = ch;
                host.appendChild(span);
                slots.push({ span, target: ch });
            }
        }
        if (!slots.length) return;
        const totalMs = Math.max(450, speed * 1000);
        const ticksPerDecode = Math.max(slots.length * 2, 12);
        const tickMs = Math.max(35, Math.min(110, Math.round((once ? totalMs : totalMs * 0.55) / ticksPerDecode)));
        const holdTicks = Math.max(8, Math.round((totalMs * 0.45) / tickMs));
        const delayMs = Math.round(delay * 1000);
        let progress = 0;
        let hold = 0;
        let randomState = (Math.random() * 0x100000000) >>> 0 || 1;
        let timer = 0;
        let delayTimer = 0;

        const paintMatrix = lockedCount => {
            const paused = isMotionPaused(node);
            for (let i = 0; i < slots.length; i++) {
                if (i < lockedCount || paused) {
                    if (slots[i].span.textContent !== slots[i].target) slots[i].span.textContent = slots[i].target;
                } else {
                    randomState ^= randomState << 13;
                    randomState ^= randomState >>> 17;
                    randomState ^= randomState << 5;
                    const g = MATRIX_GLYPHS[(randomState >>> 0) % MATRIX_GLYPHS.length];
                    slots[i].span.textContent = g;
                }
            }
        };

        const stepProgress = Math.max(0.25, slots.length / ticksPerDecode);
        const startDecodeLoop = () => {
            if (!node.isConnected) return;
            timer = setInterval(() => {
                if (!node.isConnected) { clearInterval(timer); timer = 0; return; }
                if (document.hidden) return;
                if (isMotionPaused(node)) {
                    paintMatrix(slots.length);
                    return;
                }
                if (progress < slots.length) {
                    progress += stepProgress;
                    paintMatrix(Math.floor(progress));
                } else if (once) {
                    paintMatrix(slots.length);
                    clearInterval(timer);
                    timer = 0;
                } else if (hold < holdTicks) {
                    hold++;
                } else {
                    progress = 0;
                    hold = 0;
                    paintMatrix(0);
                }
            }, tickMs);
        };

        if (isMotionPaused(node)) {
            paintMatrix(slots.length);
        } else if (delayMs > 0) {
            paintMatrix(0);
            delayTimer = setTimeout(() => { delayTimer = 0; startDecodeLoop(); }, delayMs);
        } else {
            paintMatrix(0);
            startDecodeLoop();
        }
        node._textAnimHandle = {
            stop: () => {
                if (delayTimer) { clearTimeout(delayTimer); delayTimer = 0; }
                if (timer) { clearInterval(timer); timer = 0; }
            }
        };
    }
}

function applyTextAnimation(node, style = {}, type = '') {
    if (!node) return;
    const isTextual = TEXT_FILL_TYPES.has(type) || type === 'speaker-badge';
    if (!isTextual) return;

    node._lastTextAnimStyle = style;
    node._lastTextAnimType = type;

    const anim = style.textAnimation || {};
    const animType = TEXT_ANIM_TYPES.includes(anim.type) ? anim.type : 'none';
    const playMode = anim.mode === 'once' ? 'once' : 'loop';
    const delay = Math.max(0, Math.min(30, Number(anim.delay) || 0));
    const useGrad = isTextGradient(style, type);
    node.classList.toggle('sp-ta-grad', useGrad);
    if (useGrad) node.style.setProperty('--sp-ta-tgrad', gradientCss(style.textGradient));
    else node.style.removeProperty('--sp-ta-tgrad');

    const baseAnims = String(node.style.animation || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('sp-text-'));
    node.style.animation = baseAnims.join(', ');

    if (animType === 'none' || type === 'speaker-badge') {
        stopTextAnimation(node, true);
        delete node.dataset.textAnim;
        delete node.dataset.textAnimOnceSig;
        return;
    }

    ensureTextAnimKeyframes();
    const speed = Math.max(0.3, Math.min(30, Number(anim.speed) || 3));
    const intensity = Math.max(10, Math.min(100, Number(anim.intensity) || 50)) / 100;
    const animSourceText = node.dataset.textAnimSource ?? node.textContent ?? '';
    const animSig = `${animType}|${playMode}|${speed}|${intensity}|${delay}|${useGrad ? 1 : 0}|${animSourceText}`;
    if (playMode === 'once' && node.dataset.textAnimOnceSig === animSig && node.dataset.textAnim === animType) {
        return;
    }
    if (playMode === 'once') node.dataset.textAnimOnceSig = animSig;
    else delete node.dataset.textAnimOnceSig;

    node.dataset.textAnim = animType;
    node.style.setProperty('--sp-ta-scale', (1 + intensity * 0.14).toFixed(3));
    node.style.setProperty('--sp-ta-dist', `${Math.round(3 + intensity * 12)}px`);
    node.style.setProperty('--sp-ta-rot', `${(1.5 + intensity * 6.5).toFixed(1)}deg`);
    node.style.setProperty('--sp-ta-glitch', `${(1.5 + intensity * 5.5).toFixed(1)}px`);

    const canSplitText = (type === 'text' || type === 'random-text')
        && !node._cycleHandle
        && !node.querySelector('.sp-inline-icon, :scope > .overlay-marquee-track, :scope > .overlay-caret');

    if (TEXT_SPLIT_ANIM_TYPES.has(animType) && canSplitText) {
        mountSplitTextAnimation(node, animType, speed, intensity, playMode, delay);
        return;
    }

    stopTextAnimation(node, true);
    const blockType = TEXT_SPLIT_ANIM_TYPES.has(animType) ? blockFallbackForSplit(animType) : animType;
    const timing = (blockType === 'glitch') ? 'steps(1, end)'
        : (blockType === 'bounce') ? 'cubic-bezier(0.28, 0.84, 0.42, 1)' : 'ease-in-out';
    const dur = blockType === 'glitch' ? Math.max(0.8, speed) : speed;
    const iter = playMode === 'once' ? '1 both' : 'infinite';
    const delayPart = delay > 0 ? `${delay}s ` : '';
    const extraAnim = `sp-text-${blockType} ${dur}s ${timing} ${delayPart}${iter}`;
    node.style.animation = [...baseAnims, extraAnim].join(', ');
}

// Layers clip their content, which cuts off text shadows and glows at the box edge. Let the shadow spill out instead.
function shadowClipStyle(element) {
    if (element.type === 'icon' || element.type === 'speaker-badge') return { overflow: 'visible', overflowClipMargin: '' };
    const style = element.style || {};
    if (element.type === 'shape' && (style.shape === 'line' || borderPlacement(style, element) !== 'inside' || style.borderAnimation?.type === 'pulsing')) {
        return { overflow: 'visible', overflowClipMargin: '' };
    }
    const blur = Number(style.textShadow?.blur) || 0;
    const hasTextAnim = Boolean(style.textAnimation?.type && style.textAnimation.type !== 'none');
    const textual = !['image', 'video', 'slideshow', 'embed', 'qr', 'icon', 'shape', 'progress', 'game-list', 'pattern'].includes(element.type)
        || Boolean(element.type === 'image' && element.imageGroup?.enabled);
    if ((!(blur > 0) && !hasTextAnim) || !textual || element.random?.marquee) return { overflow: '', overflowClipMargin: '' };
    if (hasTextAnim) return { overflow: 'visible', overflowClipMargin: '' };
    const margin = blur * 2 + 4;
    if (window.CSS?.supports?.('overflow-clip-margin', '4px')) return { overflow: 'clip', overflowClipMargin: `${Math.ceil(margin)}px` };
    return { overflow: 'visible', overflowClipMargin: '' };
}

export { BORDER_ANIM_TYPES, BORDER_STYLES, TEXT_ANIM_TYPES, applyBorderEffects, applyBorderGradient, applyTextAnimation, borderPlacement, decorationStyle, gradientStyle, hasBoxFill, resolveBorderRadius, shadowClipStyle, textEffectStyle };
