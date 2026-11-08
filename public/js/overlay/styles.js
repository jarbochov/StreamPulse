
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
    const stops = [g.from || '#1f6feb', g.mid, g.to || '#8957e5'].filter(Boolean).join(', ');
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

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
const BORDER_PLACEMENTS = ['inside', 'center', 'outside'];
const BORDER_ANIM_TYPES = ['none', 'rotating', 'radial', 'pulsing', 'gradient', 'rainbow', 'marching'];

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
        + '@keyframes sp-border-pulse { 0%, 100% { opacity: 0.3; filter: brightness(0.85); } 50% { opacity: 1; filter: brightness(1.35) drop-shadow(0 0 10px currentColor); } } '
        + '@keyframes sp-border-gradient-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } } '
        + '@keyframes sp-border-rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } } '
        + '@keyframes sp-border-marching { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -32; } } '
        + '@keyframes sp-border-radial-circuit { 0% { background-position: 0% 0%; } 25% { background-position: 100% 0%; } 50% { background-position: 100% 100%; } 75% { background-position: 0% 100%; } 100% { background-position: 0% 0%; } } '
        + '@keyframes sp-border-radial-circuit-rev { 0% { background-position: 0% 0%; } 25% { background-position: 0% 100%; } 50% { background-position: 100% 100%; } 75% { background-position: 100% 0%; } 100% { background-position: 0% 0%; } } '
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

// Applies full border styling, gradients, glows, and hardware-accelerated animations across all element types.
function applyBorderEffects(node, style = {}, element = {}) {
    if (!node) return;
    const lineShape = element.type === 'shape' && style.shape === 'line';
    const width = lineShape ? 0 : Math.max(0, Number(style.borderWidth) || 0);
    const shapeBorder = element.type === 'shape' && !lineShape;
    const placement = shapeBorder ? borderPlacement(style, element) : 'inside';
    const outset = width * (placement === 'outside' ? 1 : placement === 'center' ? 0.5 : 0);
    const innerInset = width - outset;
    const shape = style.shape || 'rectangle';
    const radius = shapeBorder && shape === 'circle' ? '50%'
        : shapeBorder && shape === 'pill' ? '999px'
            : (node.style.borderRadius || `${Number(style.borderRadius) || 0}px`);
    const outerRadius = outset && radius !== '50%' ? `calc(${radius} + ${outset}px)` : radius;
    const borderStyle = style.borderStyle || 'solid';
    const borderColor = style.borderColor || 'transparent';
    const g = style.borderGradient;
    const anim = style.borderAnimation || {};
    const glow = style.borderGlow || {};
    const ish = style.innerShadow || {};
    const hasInnerGlow = glow.enabled && glow.inner;
    const hasInnerShadow = Number(ish.blur) > 0 || Number(ish.spread) > 0;
    const hasBorderGradient = width > 0 && Boolean(g?.enabled);
    const hasBorderAnim = width > 0 && !hasBorderGradient && Boolean(anim.type && anim.type !== 'none');
    const hasRingBorder = hasBorderGradient || hasBorderAnim || (shapeBorder && width > 0);

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

    // Inner shadow and inner glow are rendered via a dedicated overlay under borders so they stay visible over fills, images, videos, and cutouts without obscuring borders.
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
            const gc = glow.color && glow.color !== 'transparent' ? glow.color : (borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8');
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
        const radiusCss = width > 0 && radius !== '50%' ? `max(0px, calc(${radius} - ${innerInset}px))` : radius;
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

    // Case 1: Gradient Border (with from, optional mid, to, angle/radial, and sweeping animation)
    if (hasBorderGradient) {
        let ring = node._borderRing;
        if (!ring) {
            ring = node._borderRing = document.createElement('div');
            ring.setAttribute('aria-hidden', 'true');
            ring.dataset.borderRing = 'true';
        }
        if (ring.parentNode !== node) node.append(ring);
        node.style.border = '0';
        node.style.backgroundClip = 'padding-box';

        ensureGradientKeyframes();
        const gradCss = gradientCss(g);
        const isVertical = slidesVertically(g);
        const animCss = g.animate
            ? `${isVertical ? 'sp-gradient-shift-y' : 'sp-gradient-shift'} ${Math.max(1, g.speed || 8)}s ease-in-out infinite alternate`
            : '';
        const ringSig = `${width}|${gradCss}|${g.animate}|${g.speed}`;
        if (ring._sig !== ringSig) {
            ring._sig = ringSig;
            ring.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:${gradCss};background-size:${g.animate ? '200% 200%' : 'cover'};animation:${animCss};z-index:2;`;
            ring.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
            ring.style.setProperty('-webkit-mask-composite', 'xor');
            ring.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
            ring.style.setProperty('mask-composite', 'exclude');
        }
    } else if (node._borderRing && (!shapeBorder || hasBorderAnim)) {
        node._borderRing.remove();
        node._borderRing = null;
    }

    // Case 2: Animated Border (Rotating beam, Radial rotating, Pulsing, Sweeping gradient with middle color, Rainbow, Marching ants)
    if (!hasBorderGradient && hasBorderAnim) {
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

        if (anim.type === 'rotating') {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
            const size = Math.max(10, Math.min(100, Number(anim.size) || 35));
            const arc = Math.round(360 * (size / 100));
            const head = anim.color2 || '#ffffff';
            const trail = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
            const sig = `rotating|${width}|${speed}|${size}|${head}|${trail}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:conic-gradient(from var(--sp-angle), transparent 0deg, transparent ${360 - arc}deg, ${trail} ${360 - Math.round(arc / 2)}deg, ${head} 360deg);animation:sp-border-spin ${speed}s linear infinite;z-index:2;`;
                fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('mask-composite', 'exclude');
                fxRing.innerHTML = '';
            }
        } else if (anim.type === 'radial') {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
            const size = Math.max(10, Math.min(100, Number(anim.size) || 40));
            const mode = ['spotlight', 'two-tone', 'fade-white', 'fade-black', 'rainbow'].includes(anim.mode) ? anim.mode : 'spotlight';
            const direction = ['cw', 'ccw', 'alternate'].includes(anim.direction) ? anim.direction : 'cw';
            const head = anim.color2 || (mode === 'spotlight' ? '#ffffff' : '#38bdf8');
            const trail = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
            const mid = anim.color3 || '';
            const bgSize = Math.max(160, Math.min(320, Math.round(150 + (size * 1.5))));

            let gradStops = '';
            if (mode === 'rainbow') {
                gradStops = '#ff0055 0%, #ff9900 17%, #ffee00 33%, #00ff66 50%, #00bbff 67%, #8800ff 83%, #ff0055 100%';
            } else if (mode === 'fade-white') {
                gradStops = mid ? `${head} 0%, ${mid} 45%, #ffffff 100%` : `${head} 0%, #ffffff 100%`;
            } else if (mode === 'fade-black') {
                gradStops = mid ? `${head} 0%, ${mid} 45%, #000000 100%` : `${head} 0%, #000000 100%`;
            } else if (mode === 'two-tone') {
                gradStops = mid ? `${head} 0%, ${mid} 45%, ${trail} 100%` : `${head} 0%, ${trail} 100%`;
            } else {
                const base = 'transparent';
                const spreadRatio = Math.max(20, Math.min(80, size));
                gradStops = mid
                    ? `${head} 0%, ${mid} ${Math.round(spreadRatio * 0.45)}%, ${trail} ${spreadRatio}%, ${base} ${Math.min(100, Math.round(spreadRatio * 1.5))}%`
                    : `${head} 0%, ${trail} ${spreadRatio}%, ${base} ${Math.min(100, Math.round(spreadRatio * 1.5))}%`;
            }

            const animName = direction === 'ccw' ? 'sp-border-radial-circuit-rev' : 'sp-border-radial-circuit';
            const animDir = direction === 'alternate' ? 'alternate' : 'normal';
            const sig = `radial|${width}|${speed}|${size}|${mode}|${direction}|${head}|${mid}|${trail}|${bgSize}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:radial-gradient(circle, ${gradStops});background-size:${bgSize}% ${bgSize}%;animation:${animName} ${speed}s ease-in-out infinite ${animDir};z-index:2;`;
                fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('mask-composite', 'exclude');
                fxRing.innerHTML = '';
            }
        } else if (anim.type === 'pulsing') {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
            const c = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
            const sig = `pulsing|${width}|${borderStyle}|${c}|${speed}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px ${borderStyle} ${c};border-radius:inherit;pointer-events:none;color:${c};box-shadow:0 0 16px ${c};animation:sp-border-pulse ${speed}s ease-in-out infinite;z-index:2;`;
                fxRing.style.webkitMask = fxRing.style.mask = '';
                fxRing.innerHTML = '';
            }
        } else if (anim.type === 'gradient') {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
            const c1 = borderColor && borderColor !== 'transparent' ? borderColor : '#1f6feb';
            const mid = anim.color3 || '';
            const c2 = anim.color2 || '#8957e5';
            const stops = [c1, mid, c2].filter(Boolean).join(', ');
            const sig = `gradient|${width}|${speed}|${stops}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg, ${stops});background-size:200% 200%;animation:sp-border-gradient-shift ${speed}s ease-in-out infinite alternate;z-index:2;`;
                fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('mask-composite', 'exclude');
                fxRing.innerHTML = '';
            }
        } else if (anim.type === 'rainbow') {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 4));
            const sig = `rainbow|${width}|${speed}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing.style.cssText = `position:absolute;inset:0;box-sizing:border-box;border:${width}px solid transparent;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg, #ff0055, #ff9900, #ffee00, #00ff66, #00bbff, #8800ff, #ff0055);animation:sp-border-rainbow ${speed}s linear infinite;z-index:2;`;
                fxRing.style.setProperty('-webkit-mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('-webkit-mask-composite', 'xor');
                fxRing.style.setProperty('mask', 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box');
                fxRing.style.setProperty('mask-composite', 'exclude');
                fxRing.innerHTML = '';
            }
        } else if (anim.type === 'marching') {
            const speed = Math.max(0.5, Math.min(60, Number(anim.speed) || 2));
            const c = borderColor && borderColor !== 'transparent' ? borderColor : '#38bdf8';
            const rad = node.style.borderRadius || '0px';
            const sig = `marching|${width}|${speed}|${c}|${rad}`;
            if (fxRing._sig !== sig) {
                fxRing._sig = sig;
                fxRing.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2;';
                fxRing.style.webkitMask = fxRing.style.mask = '';
                fxRing.innerHTML = `<svg data-border-fx="marching" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;"><rect x="${width / 2}" y="${width / 2}" width="calc(100% - ${width}px)" height="calc(100% - ${width}px)" rx="${rad}" ry="${rad}" fill="none" stroke="${c}" stroke-width="${width}" stroke-dasharray="${Math.max(6, width * 2)} ${Math.max(4, width * 1.5)}" style="animation:sp-border-marching ${speed}s linear infinite;"></rect></svg>`;
            }
        }
    } else if (node._borderFxRing) {
        node._borderFxRing.remove();
        node._borderFxRing = null;
    }

    // Case 3: Static solid/dashed/groove border
    if (!hasBorderGradient && !hasBorderAnim) {
        if (shapeBorder) {
            let ring = node._borderRing;
            if (!ring) {
                ring = node._borderRing = document.createElement('div');
                ring.setAttribute('aria-hidden', 'true');
                ring.dataset.borderRing = 'true';
            }
            if (ring.parentNode !== node) node.append(ring);
            ring._sig = null;
            ring.style.cssText = `position:absolute;box-sizing:border-box;border:${width}px ${borderStyle} ${borderColor};pointer-events:none;z-index:2;`;
            node.style.border = '0';
        } else {
            node.style.border = `${width}px ${borderStyle} ${borderColor}`;
        }
        node.style.backgroundClip = '';
    }

    // The source box stays fixed; only the decorative ring expands beyond it.
    for (const ring of [node._borderRing, node._borderFxRing]) {
        if (!ring) continue;
        ring.style.inset = `${-outset}px`;
        ring.style.width = ring.style.height = '';
        ring.style.borderRadius = outerRadius;
        const rect = ring.querySelector('svg > rect');
        if (rect) {
            const strokeRadius = `max(0px, calc(${outerRadius} - ${width / 2}px))`;
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
    return {
        webkitTextStroke: stroke ? `${style.textStroke.width}px ${style.textStroke.color || '#000'}` : '',
        paintOrder: stroke ? 'stroke fill' : '',
        textShadow: style.textShadow?.blur > 0 && !isTextGradient(style, type) ? `0 2px ${style.textShadow.blur}px ${style.textShadow.color || 'rgba(0,0,0,.7)'}` : '',
        // Clipped gradient text ignores text-shadow, so a drop-shadow filter follows the letters instead (only when no box fill would be shadowed too).
        filter: style.textShadow?.blur > 0 && isTextGradient(style, type) && !hasBoxFill(style) ? `drop-shadow(0 2px ${style.textShadow.blur}px ${style.textShadow.color || 'rgba(0,0,0,.7)'})` : '',
        textTransform: style.textTransform && style.textTransform !== 'none' ? style.textTransform : '',
        textDecoration: style.textDecoration && style.textDecoration !== 'none' ? style.textDecoration : ''
    };
}

// Layers clip their content, which cuts off text shadows and glows at the box edge. Let the shadow spill out instead.
function shadowClipStyle(element) {
    if (element.type === 'icon' || element.type === 'speaker-badge') return { overflow: 'visible', overflowClipMargin: '' };
    const style = element.style || {};
    if (element.type === 'shape' && (style.shape === 'line' || borderPlacement(style, element) !== 'inside' || style.borderAnimation?.type === 'pulsing')) {
        return { overflow: 'visible', overflowClipMargin: '' };
    }
    const blur = Number(style.textShadow?.blur) || 0;
    const textual = !['image', 'video', 'slideshow', 'embed', 'qr', 'icon', 'shape', 'progress', 'game-list', 'pattern'].includes(element.type);
    if (!(blur > 0) || !textual || element.random?.marquee) return { overflow: '', overflowClipMargin: '' };
    if (window.CSS?.supports?.('overflow-clip-margin', '4px')) return { overflow: 'clip', overflowClipMargin: `${Math.ceil(blur * 2 + 4)}px` };
    return { overflow: 'visible', overflowClipMargin: '' };
}

export { BORDER_ANIM_TYPES, BORDER_STYLES, applyBorderEffects, applyBorderGradient, borderPlacement, decorationStyle, gradientStyle, hasBoxFill, shadowClipStyle, textEffectStyle };
