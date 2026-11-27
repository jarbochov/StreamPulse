/**
 * StreamPulse Credit Suite — Shared 60fps Renderer & Deterministic Frame Seeker
 * Powers both /overlays/credit-suite.html (OBS Live + FFmpeg Export)
 * and /tools/credit-suite.html (Interactive Studio Stage).
 */

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getEngine() {
    if (!window.StreamPulseCreditSuiteEngine) {
        throw new Error('StreamPulseCreditSuiteEngine bundle not loaded');
    }
    return window.StreamPulseCreditSuiteEngine;
}

function resolvePlaceholders(text, vars = {}) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/\{\{\s*([^|}]+?)(?:\|([^}]*))?\s*\}\}/g, (_, rawKey, fallback = '') => {
        const key = String(rawKey || '').trim();
        if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined && vars[key] !== null && vars[key] !== '') {
            return String(vars[key]);
        }
        // Try stripped var. prefix
        const stripped = key.replace(/^var\./i, '');
        if (Object.prototype.hasOwnProperty.call(vars, stripped) && vars[stripped] !== undefined && vars[stripped] !== null && vars[stripped] !== '') {
            return String(vars[stripped]);
        }
        return fallback !== undefined ? String(fallback).trim() : '';
    });
}

function resolveColorOrVar(val, vars = {}, fallback = '#FFFFFFFF') {
    const s = String(val || '').trim();
    if (!s) return fallback;
    if (s.startsWith('var:')) {
        const rest = s.slice(4);
        const pipe = rest.indexOf('|');
        const key = (pipe >= 0 ? rest.slice(0, pipe) : rest).trim();
        const def = pipe >= 0 ? rest.slice(pipe + 1).trim() : fallback;
        const found = vars[key] ?? vars[`var.${key}`];
        return found && String(found).trim() ? String(found).trim() : (def || fallback);
    }
    return s;
}

function applyAlphaToColor(color, alpha = 1) {
    const a = Math.max(0, Math.min(1, Number(alpha)));
    const s = String(color || '').trim();
    if (!s || s === 'transparent') return 'transparent';
    const hex6 = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (hex6) {
        const baseA = hex6[2] ? parseInt(hex6[2], 16) / 255 : 1;
        const finalHex = Math.round(Math.max(0, Math.min(1, baseA * a)) * 255).toString(16).padStart(2, '0');
        return `#${hex6[1]}${finalHex}`;
    }
    return s;
}

function createProceduralPatternHost(hostEl, opts = {}) {
    const sp = window.StreamPulsePatterns;
    if (!sp || typeof sp.drawProceduralPattern !== 'function') return null;
    const preset = opts.patternPreset || opts.preset || 'starfield';
    const palette = opts.patternPalette || opts.palette || 'galaxy';
    const width = Number(opts.width) || 1920;
    const height = Number(opts.height) || 1080;
    const validPreset = sp.PATTERNS && sp.PATTERNS.includes(preset) ? preset : 'starfield';
    const validPalette = (sp.PALETTES && sp.PALETTES[palette]) || palette === 'dual' ? palette : 'galaxy';
    // Cap backing resolution to avoid excessive 2D canvas fill cost on 4K stages
    const scaleDown = Math.min(1, 1280 / Math.max(width, height));
    const cw = Math.max(64, Math.round(width * scaleDown));
    const ch = Math.max(64, Math.round(height * scaleDown));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    hostEl.innerHTML = '';
    hostEl.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const densMult = Math.max(0.25, Math.min(4, Number(opts.patternDensity) || 1));
    const resolvedDensity = validPreset === 'starfield'
        ? Math.round(600 * densMult)
        : validPreset === 'sparkles'
            ? Math.round(100 * densMult)
            : validPreset === 'sunburst'
                ? Math.round(28 * densMult)
                : densMult;
    const drawOpts = {
        scale: Number(opts.patternScale) || 100,
        lineWidth: Number(opts.patternLineWidth) || 2,
        fillMode: opts.patternFillMode || 'tinted',
        fillOpacity: opts.patternFillOpacity ?? 35,
        density: resolvedDensity,
        spacing: Number(opts.patternSpacing) || 100,
        scatter: Number(opts.patternScatter) || 0,
        sizeVariance: Number(opts.patternSizeVariance) || 0,
        rotationVariance: Number(opts.patternRotationVariance) || 0,
        snowflakeStyle: opts.patternSnowflakeStyle || 'all',
        motion: opts.patternMotion || 'drift',
        speed: opts.patternSpeed !== undefined ? Number(opts.patternSpeed) : 0.6,
        panDirection: opts.patternPanDirection || 'continuous',
        panAngle: Number(opts.patternPanAngle) || 0,
        inPlace: opts.patternInPlace || 'auto',
        inPlaceSpeed: Number(opts.patternInPlaceSpeed) || 1,
        spin: opts.patternSpin || 'none',
        spinSpeed: Number(opts.patternSpinSpeed) || 1,
        palette: validPalette,
        accent: opts.accent || opts.patternAccent || '#58a6ff',
        secondary: opts.secondary || opts.patternSecondary || '#a855f7',
        colorMode: opts.patternColorMode || 'mosaic',
        colorAnim: opts.patternColorAnim || 'none',
        colorSpeed: Number(opts.patternColorSpeed) || 0.5,
        vignette: Number(opts.patternVignette) || 0,
        vignetteColor: opts.vignetteColor || opts.patternVignetteColor || '#000000FF',
        color: opts.color || undefined
    };
    let lastDrawnT = -1;
    const renderAt = tSec => {
        const quantT = Math.round((Number(tSec) || 0) * 60) / 60;
        if (quantT === lastDrawnT) return;
        lastDrawnT = quantT;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, cw, ch);
        try {
            sp.drawProceduralPattern(ctx, validPreset, cw, ch, {
                ...drawOpts,
                time: quantT
            });
        } catch {}
    };
    renderAt(0);
    return {
        renderAt,
        destroy() {
            canvas.width = 1;
            canvas.height = 1;
        }
    };
}

function applyElementBorder(el, opts = {}, vars = {}, boxDims = null) {
    const style = opts.borderStyle || 'none';
    const width = Number(opts.borderWidth) || 0;
    const radius = Number(opts.borderRadius) || 0;
    el.style.borderRadius = radius ? `${radius}px` : '';
    if (!style || style === 'none' || width <= 0) {
        el.style.border = '';
        return;
    }
    const c1 = resolveColorOrVar(opts.borderColor, vars, '#FFFFFFFF');
    const c2 = resolveColorOrVar(opts.borderColor2, vars, '#38BDF8FF');
    const anim = opts.borderAnim || 'none';
    const speed = Number(opts.borderAnimSpeed) || 3;

    // Leverage shared OverlayShared.applyBorderEffects (all 31 border styles + 17 animations)
    const os = window.OverlayShared;
    if (os && typeof os.applyBorderEffects === 'function') {
        try {
            const hasGrad = c2 && c2.toLowerCase() !== c1.toLowerCase();
            const effectStyle = {
                borderStyle: style,
                borderWidth: width,
                borderColor: c1,
                borderRadius: radius,
                ...(hasGrad ? { borderGradient: { enabled: true, colors: [c1, c2], angle: 135 } } : {}),
                ...(anim && anim !== 'none' ? { borderAnimation: { type: anim, speed } } : {}),
                ...(opts.shadow ? { boxShadow: { enabled: true, x: 0, y: 22, blur: 60, spread: 0, color: 'rgba(0,0,0,0.55)' } } : {})
            };
            os.applyBorderEffects(el, effectStyle, {
                type: 'box',
                width: boxDims?.width || 400,
                height: boxDims?.height || 240
            });
            return;
        } catch { /* fallback below */ }
    }

    const cssNative = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'].includes(style) ? style : 'solid';
    const existingShadow = el.style.boxShadow ? `${el.style.boxShadow}, ` : '';
    el.style.border = `${width}px ${cssNative} ${c1}`;
    if (style === 'neon-tube' || style === 'double-ring') {
        el.style.boxShadow = `${existingShadow}0 0 ${width * 3}px ${c1}, inset 0 0 ${width * 1.5}px ${c2}`;
    } else if (style === 'corner-brackets') {
        el.style.border = `${Math.max(1, Math.round(width * 0.5))}px solid ${applyAlphaToColor(c1, 0.28)}`;
        el.style.outline = `${width}px solid ${c1}`;
        el.style.outlineOffset = `-${width}px`;
    }
}

function collectUsedFonts(project) {
    const engine = getEngine();
    const sys = new Set(engine.SYSTEM_FONTS.map(f => f.toLowerCase()));
    const fonts = new Set();
    const add = f => {
        const clean = String(f || '').trim();
        if (clean && !sys.has(clean.toLowerCase())) fonts.add(clean);
    };
    add(project.theme?.headingFont);
    add(project.theme?.contentFont);
    for (const b of (project.blocks || [])) {
        add(b.style?.headingFont);
        add(b.style?.contentFont);
    }
    for (const tr of (project.tracks || [])) {
        for (const c of (tr.clips || [])) {
            add(c.fontFamily);
        }
    }
    return [...fonts];
}

function ensureFontsLoaded(project, doc = document) {
    const fonts = collectUsedFonts(project);
    if (!fonts.length) return;
    const families = fonts
        .map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,700`)
        .join('&');
    const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    let link = doc.getElementById('cs-google-fonts');
    if (!link) {
        link = doc.createElement('link');
        link.id = 'cs-google-fonts';
        link.rel = 'stylesheet';
        doc.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
}

function ensureFontAwesome(doc = document) {
    if (doc.querySelector('link[data-fa], link[href*="font-awesome"]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    link.dataset.fa = '1';
    doc.head.appendChild(link);
}

export function createCreditSuiteRenderer(mountEl, options = {}) {
    const engine = getEngine();
    const interactive = Boolean(options.interactive);
    const deterministic = Boolean(options.deterministic);
    const onSolved = typeof options.onSolved === 'function' ? options.onSolved : () => {};
    const onTimeUpdate = typeof options.onTimeUpdate === 'function' ? options.onTimeUpdate : () => {};
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {};
    const onClipSelect = typeof options.onClipSelect === 'function' ? options.onClipSelect : () => {};

    let project = null;
    let variables = options.variables || {};
    let solved = null;
    let currentTime = 0;
    let playing = false;
    let pausedByHidden = false;
    let speedRate = 1;
    let lastRafMs = 0;
    let rafId = 0;
    let bgOverride = options.bgOverride || '';
    let chromaOverride = options.chromaOverride || '';
    let bgPatterns = [];
    let bgVideos = [];
    let bgMediaEl = null;
    let bgTileEl = null;
    let lastBgMotionSig = '';
    let inlineVideos = [];
    let edgeMascots = [];
    let destroyed = false;
    let lastCutoutSig = '';
    let lastColW = '';
    let lastColLeft = '';
    let lastIsGlide = null;

    // DOM structure
    const viewport = document.createElement('div');
    viewport.className = 'cs-viewport';

    const bgLayer = document.createElement('div');
    bgLayer.className = 'cs-layer cs-layer-bg';
    const behindLayer = document.createElement('div');
    behindLayer.className = 'cs-layer cs-layer-behind';
    const creditsLayer = document.createElement('div');
    creditsLayer.className = 'cs-layer cs-layer-credits';
    const sideLayer = document.createElement('div');
    sideLayer.className = 'cs-layer cs-layer-side';
    const aboveLayer = document.createElement('div');
    aboveLayer.className = 'cs-layer cs-layer-above';

    const creditsColWrap = document.createElement('div');
    creditsColWrap.className = 'cs-credits-column-wrap';
    const creditsCol = document.createElement('div');
    creditsCol.className = 'cs-credits-column';
    creditsColWrap.appendChild(creditsCol);
    creditsLayer.appendChild(creditsColWrap);

    viewport.append(bgLayer, behindLayer, creditsLayer, sideLayer, aboveLayer);
    mountEl.innerHTML = '';
    mountEl.appendChild(viewport);

    // Indexed DOM caches for zero-allocation frame updates
    const runDomMap = new Map();
    const cardDomMap = new Map();
    const clipDomMap = new Map();

    function releaseVideosIn(rootEl) {
        if (!rootEl) return;
        for (const v of rootEl.querySelectorAll('video')) {
            try {
                v.pause();
                v.removeAttribute('src');
                v.load();
            } catch {}
        }
    }

    function disposePatterns() {
        for (const p of bgPatterns) {
            try { p.destroy?.(); } catch {}
        }
        bgPatterns = [];
        for (const entry of clipDomMap.values()) {
            try { entry.pattern?.destroy?.(); } catch {}
        }
    }

    function applyEdgeFadeMask() {
        const top = Number(project?.canvas?.edgeFadeTop) || 0;
        const bot = Number(project?.canvas?.edgeFadeBottom) || 0;
        if (top <= 0 && bot <= 0) {
            creditsColWrap.style.webkitMaskImage = '';
            creditsColWrap.style.maskImage = '';
            return;
        }
        const mask = `linear-gradient(to bottom, transparent 0%, #000 ${top}%, #000 ${100 - bot}%, transparent 100%)`;
        creditsColWrap.style.webkitMaskImage = mask;
        creditsColWrap.style.maskImage = mask;
    }

    function buildBackground() {
        for (const p of bgPatterns) {
            try { p.destroy?.(); } catch {}
        }
        bgPatterns = [];
        releaseVideosIn(bgLayer);
        bgVideos = [];
        bgMediaEl = null;
        bgTileEl = null;
        lastBgMotionSig = '';
        bgLayer.innerHTML = '';
        bgLayer.style.background = '';

        const bg = project.background || {};
        const effectiveType = bgOverride || bg.type || 'solid';

        if (effectiveType === 'transparent') {
            bgLayer.style.background = 'transparent';
            return;
        }
        if (effectiveType === 'chroma') {
            bgLayer.style.background = resolveColorOrVar(chromaOverride || bg.chromaColor || '#00FF00FF', variables, '#00FF00FF');
            return;
        }
        if (effectiveType === 'solid') {
            bgLayer.style.background = resolveColorOrVar(bg.color1, variables, '#07080CFF');
            return;
        }
        if (effectiveType === 'gradient') {
            const c1 = resolveColorOrVar(bg.color1, variables, '#07080CFF');
            const c2 = resolveColorOrVar(bg.color2, variables, '#11141FFF');
            bgLayer.style.background = `linear-gradient(${bg.angle ?? 180}deg, ${c1}, ${c2})`;
            return;
        }
        if (effectiveType === 'pattern') {
            const c1 = resolveColorOrVar(bg.color1, variables, '#07080CFF');
            bgLayer.style.background = c1;
            const host = document.createElement('div');
            host.className = 'cs-bg-pattern';
            host.style.opacity = String(bg.patternOpacity ?? 0.65);
            bgLayer.appendChild(host);
            const inst = createProceduralPatternHost(host, {
                ...bg,
                width: project.canvas.width,
                height: project.canvas.height,
                color: 'transparent',
                accent: resolveColorOrVar(bg.patternAccent, variables, '#58A6FFFF'),
                secondary: resolveColorOrVar(bg.patternSecondary, variables, '#A855F7FF'),
                vignetteColor: resolveColorOrVar(bg.patternVignetteColor, variables, '#000000FF')
            });
            if (inst) bgPatterns.push(inst);
            return;
        }
        if ((effectiveType === 'image' || effectiveType === 'video') && bg.mediaUrl) {
            bgLayer.style.background = resolveColorOrVar(bg.color1, variables, '#07080CFF');
            // Seamless scrolling tile mode for background images
            if (effectiveType === 'image' && bg.mediaTile) {
                const tile = document.createElement('div');
                tile.className = 'cs-bg-tile';
                tile.style.backgroundImage = `url("${bg.mediaUrl.replace(/"/g, '%22')}")`;
                tile.style.opacity = String(bg.mediaOpacity ?? 0.45);
                if (bg.mediaBlur > 0) tile.style.filter = `blur(${bg.mediaBlur}px)`;
                bgLayer.appendChild(tile);
                bgTileEl = tile;
                return;
            }
            if (bg.mediaFit === 'contain-blur') {
                const blurEl = document.createElement(effectiveType === 'video' ? 'video' : 'img');
                blurEl.className = 'cs-clip-blur-bg';
                blurEl.src = bg.mediaUrl;
                blurEl.style.opacity = String((bg.mediaOpacity ?? 0.45) * 0.8);
                if (effectiveType === 'video') {
                    blurEl.muted = true;
                    blurEl.loop = bg.mediaLoop !== false;
                    blurEl.playsInline = true;
                    blurEl.preload = 'metadata';
                    bgVideos.push({ el: blurEl, cfg: bg, isBlur: true });
                } else {
                    blurEl.crossOrigin = 'anonymous';
                }
                bgLayer.appendChild(blurEl);
            }
            const media = document.createElement(effectiveType === 'video' ? 'video' : 'img');
            media.className = 'cs-bg-media';
            if (bg.mediaMotion && bg.mediaMotion !== 'none') media.style.willChange = 'transform';
            media.src = bg.mediaUrl;
            media.style.opacity = String(bg.mediaOpacity ?? 0.45);
            media.style.objectFit = (bg.mediaFit === 'contain' || bg.mediaFit === 'contain-blur') ? 'contain' : 'cover';
            if (bg.mediaBlur > 0) media.style.filter = `blur(${bg.mediaBlur}px)`;
            if (effectiveType === 'video') {
                media.muted = bg.mediaMuted !== false;
                media.volume = Math.max(0, Math.min(1, (bg.mediaVolume ?? 80) / 100));
                media.loop = bg.mediaLoop !== false;
                media.playsInline = true;
                media.preload = 'metadata';
                bgVideos.push({ el: media, cfg: bg, isBlur: false });
            } else {
                media.crossOrigin = 'anonymous';
            }
            bgMediaEl = media;
            bgLayer.appendChild(media);
        }
    }

    function applyThemeCssVars() {
        const th = project.theme || {};
        viewport.style.width = `${project.canvas.width}px`;
        viewport.style.height = `${project.canvas.height}px`;
        viewport.style.setProperty('--cs-heading-font', `'${th.headingFont || 'Cinzel'}', Georgia, serif`);
        viewport.style.setProperty('--cs-content-font', `'${th.contentFont || 'Cormorant Garamond'}', Georgia, serif`);
        viewport.style.setProperty('--cs-heading-size', `${th.headingSize || 40}px`);
        viewport.style.setProperty('--cs-content-size', `${th.contentSize || 28}px`);
        viewport.style.setProperty('--cs-heading-weight', th.headingWeight || '700');
        viewport.style.setProperty('--cs-content-weight', th.contentWeight || '400');
        viewport.style.setProperty('--cs-heading-style', th.headingStyle || 'normal');
        viewport.style.setProperty('--cs-content-style', th.contentStyle || 'normal');
        viewport.style.setProperty('--cs-heading-transform', th.headingTransform || 'uppercase');
        viewport.style.setProperty('--cs-heading-tracking', `${th.headingLetterSpacing ?? 0.14}em`);
        viewport.style.setProperty('--cs-line-height', String(th.lineHeight || 1.75));
        viewport.style.setProperty('--cs-text', resolveColorOrVar(th.textColor, variables, '#F3F4F6FF'));
        viewport.style.setProperty('--cs-accent', resolveColorOrVar(th.accentColor, variables, '#E5C07BFF'));
        viewport.style.setProperty('--cs-subtitle', resolveColorOrVar(th.subtitleColor, variables, '#9CA3AFFF'));
        viewport.style.setProperty('--cs-divider', resolveColorOrVar(th.dividerColor, variables, '#E5C07B66'));
    }

    function buildBlockElement(block) {
        const th = project.theme || {};
        const st = block.style || {};
        const el = document.createElement('div');
        el.className = `cs-block cs-block-${block.type}`;
        el.dataset.blockId = block.id;

        const padTop = block.paddingTop !== '' ? Number(block.paddingTop) : Math.round((th.sectionSpacing ?? 72) * 0.5);
        const padBot = block.paddingBottom !== '' ? Number(block.paddingBottom) : Math.round((th.sectionSpacing ?? 72) * 0.5);
        const padH = block.paddingH !== '' ? Number(block.paddingH) : (th.paddingH ?? 64);

        if (block.type === 'spacer') {
            el.style.height = `${block.spacerHeight || 120}px`;
            return el;
        }

        el.style.padding = `${padTop}px ${padH}px ${padBot}px`;
        el.dataset.padH = String(padH);
        el.style.textAlign = st.align || 'center';

        const inner = document.createElement('div');
        inner.className = 'cs-block-inner';
        if (st.maxWidth) {
            inner.classList.add('cs-has-custom-width');
            inner.style.maxWidth = `${st.maxWidth}px`;
            el.dataset.customWidth = String(st.maxWidth);
        }
        if (block.type === 'media' && block.mediaKind !== 'icon' && Number(block.mediaWidth) > 0) {
            el.dataset.mediaWidth = String(block.mediaWidth);
        }
        if (st.opacity !== undefined && Number(st.opacity) < 1) {
            inner.style.opacity = String(st.opacity);
        }
        const hasBg = Boolean(st.bgColor && Number(st.bgOpacity) > 0);
        if (hasBg || st.borderWidth > 0) {
            const bgPad = st.bgPadding !== undefined ? Number(st.bgPadding) : 28;
            inner.style.padding = `${bgPad}px ${Math.round(bgPad * 1.25)}px`;
            if (hasBg) {
                inner.style.background = applyAlphaToColor(resolveColorOrVar(st.bgColor, variables, 'transparent'), st.bgOpacity);
            }
            inner.style.borderRadius = `${st.bgRadius || 12}px`;
        }
        applyElementBorder(inner, {
            borderStyle: st.borderStyle,
            borderWidth: st.borderWidth,
            borderColor: st.borderColor,
            borderColor2: st.borderColor2,
            borderRadius: st.bgRadius,
            borderAnim: st.borderAnim,
            borderAnimSpeed: st.borderAnimSpeed
        }, variables, { width: Math.min(project.canvas.width, Number(st.maxWidth) || th.maxColumnWidth || 1180), height: 220 });

        if (st.contentFont) inner.style.fontFamily = `'${st.contentFont}', Georgia, serif`;
        if (st.contentSize) inner.style.fontSize = `${st.contentSize}px`;
        if (st.contentWeight) inner.style.fontWeight = st.contentWeight;
        if (st.contentColor) inner.style.color = resolveColorOrVar(st.contentColor, variables, '');
        if (st.italic) inner.style.fontStyle = 'italic';
        if (st.underline) inner.style.textDecoration = 'underline';
        if (st.textShadow) inner.style.textShadow = '0 4px 20px rgba(0,0,0,0.75)';

        const titleText = resolvePlaceholders(block.title, variables);
        const subText = resolvePlaceholders(block.subtitle, variables);

        const buildTitleAndSub = target => {
            if (st.iconClass) {
                const ic = document.createElement('i');
                ic.className = `cs-block-icon ${st.iconClass}`;
                if (st.iconColor) ic.style.color = resolveColorOrVar(st.iconColor, variables, '');
                target.appendChild(ic);
            }
            if (titleText) {
                const h = document.createElement('div');
                h.className = 'cs-block-title';
                h.textContent = titleText;
                if (st.headingFont) h.style.fontFamily = `'${st.headingFont}', Georgia, serif`;
                if (st.headingSize) h.style.fontSize = `${st.headingSize}px`;
                if (st.headingWeight) h.style.fontWeight = st.headingWeight;
                if (st.headingColor) h.style.color = resolveColorOrVar(st.headingColor, variables, '');
                if (st.uppercase === true) h.style.textTransform = 'uppercase';
                else if (st.uppercase === false) h.style.textTransform = 'none';
                if (st.letterSpacing !== '') h.style.letterSpacing = `${st.letterSpacing}em`;
                target.appendChild(h);
            }
            if (subText) {
                const sub = document.createElement('div');
                sub.className = 'cs-block-subtitle';
                sub.textContent = subText;
                if (st.subtitleColor) sub.style.color = resolveColorOrVar(st.subtitleColor, variables, '');
                target.appendChild(sub);
            }
        };

        const buildInlineMediaNode = (widthCss, heightPx) => {
            const frame = document.createElement('div');
            frame.className = 'cs-inline-media-frame';
            frame.style.width = widthCss;
            if (heightPx > 0) frame.style.height = `${heightPx}px`;
            frame.style.borderRadius = `${block.mediaRadius ?? 12}px`;

            const fit = block.mediaFit || 'cover';
            const isVid = block.mediaKind === 'video';
            if (fit === 'contain-blur') {
                const bgM = document.createElement(isVid ? 'video' : 'img');
                bgM.className = 'cs-clip-blur-bg';
                bgM.src = block.mediaUrl;
                if (isVid) {
                    bgM.muted = true;
                    bgM.loop = block.mediaLoop !== false;
                    bgM.playsInline = true;
                    bgM.preload = 'metadata';
                    bgM.playbackRate = (block.mediaRate || 1) * speedRate;
                    inlineVideos.push({ el: bgM, blockId: block.id, cfg: block, isBlur: true });
                } else {
                    bgM.crossOrigin = 'anonymous';
                }
                frame.appendChild(bgM);
            }

            const m = document.createElement(isVid ? 'video' : 'img');
            m.src = block.mediaUrl;
            m.style.objectFit = fit === 'contain-blur' ? 'contain' : fit;
            if (isVid) {
                m.muted = block.mediaMuted !== false;
                m.volume = Math.max(0, Math.min(1, (block.mediaVolume ?? 80) / 100));
                m.loop = block.mediaLoop !== false;
                m.playsInline = true;
                m.preload = 'metadata';
                m.playbackRate = (block.mediaRate || 1) * speedRate;
                inlineVideos.push({ el: m, blockId: block.id, cfg: block, isBlur: false });
            } else {
                m.crossOrigin = 'anonymous';
            }
            frame.appendChild(m);
            return frame;
        };

        if (block.type === 'divider') {
            const divEl = document.createElement('div');
            const ds = block.dividerStyle || 'fade';
            divEl.className = `cs-divider cs-divider-${ds}`;
            divEl.style.width = `${block.dividerWidth || 55}%`;
            if (ds === 'stars') divEl.textContent = '\u2726  \u2726  \u2726  \u2726  \u2726';
            else if (ds === 'ornament') divEl.innerHTML = '<span>\u2727</span>';
            else if (ds === 'icon') {
                const iconCls = st.iconClass || 'fa-solid fa-star';
                divEl.innerHTML = `<i class="${escHtml(iconCls)}"></i>`;
            }
            inner.appendChild(divEl);
        } else if (block.type === 'featured') {
            buildTitleAndSub(inner);
            const body = resolvePlaceholders(block.content, variables).trim();
            if (body) {
                const div = document.createElement('div');
                div.className = 'cs-featured-body';
                div.textContent = body;
                inner.appendChild(div);
            }
        } else if (block.type === 'role-split') {
            buildTitleAndSub(inner);
            const table = document.createElement('div');
            table.className = 'cs-role-table';
            const rows = (block.rows || []).filter(r => r.checked !== false);
            for (const row of rows) {
                const rEl = document.createElement('div');
                rEl.className = 'cs-role-cell';
                rEl.textContent = resolvePlaceholders(row.role, variables);
                const nEl = document.createElement('div');
                nEl.className = 'cs-name-cell';
                nEl.textContent = resolvePlaceholders(row.name, variables);
                table.append(rEl, nEl);
            }
            inner.appendChild(table);
        } else if (block.type === 'roster') {
            buildTitleAndSub(inner);
            const cols = Math.max(1, Math.min(4, Number(block.columns) || 2));
            const grid = document.createElement('div');
            grid.className = `cs-roster-grid cs-roster-cols-${cols}`;
            const names = (block.names || []).filter(n => n.checked !== false);
            for (const item of names) {
                const txt = resolvePlaceholders(item.editedName || item.name, variables);
                const cell = document.createElement('div');
                cell.className = block.autoFitNames !== false && cols > 1 ? 'cs-name-fit' : 'cs-roster-cell';
                if (block.autoFitNames !== false && cols > 1) {
                    cell.innerHTML = `<span class="cs-name-fit-sizer"><span class="cs-name-fit-text">${escHtml(txt)}</span></span>`;
                } else {
                    cell.textContent = txt;
                }
                grid.appendChild(cell);
            }
            inner.appendChild(grid);
        } else if (block.type === 'section') {
            buildTitleAndSub(inner);
            const rawLines = resolvePlaceholders(block.content, variables).split('\n').filter(l => l.trim() !== '');
            const cols = Math.max(1, Math.min(4, Number(block.columns) || 1));
            if (cols > 1 && rawLines.length) {
                const grid = document.createElement('div');
                grid.className = `cs-roster-grid cs-roster-cols-${cols}`;
                const useFit = block.autoFitNames !== false;
                for (const line of rawLines) {
                    const cell = document.createElement('div');
                    cell.className = useFit ? 'cs-name-fit' : 'cs-roster-cell';
                    if (useFit) {
                        cell.innerHTML = `<span class="cs-name-fit-sizer"><span class="cs-name-fit-text">${escHtml(line)}</span></span>`;
                    } else {
                        cell.textContent = line;
                    }
                    grid.appendChild(cell);
                }
                inner.appendChild(grid);
            } else {
                const body = document.createElement('div');
                body.className = 'cs-section-content';
                body.textContent = resolvePlaceholders(block.content, variables);
                inner.appendChild(body);
            }
        } else if (block.type === 'paragraph') {
            buildTitleAndSub(inner);
            const p = document.createElement('div');
            p.className = 'cs-paragraph-body';
            p.textContent = resolvePlaceholders(block.content, variables);
            inner.appendChild(p);
        } else if (block.type === 'media') {
            buildTitleAndSub(inner);
            const wrap = document.createElement('div');
            wrap.className = 'cs-inline-media';
            if (block.mediaKind === 'icon') {
                const ic = document.createElement('div');
                ic.className = 'cs-inline-media-icon';
                ic.style.fontSize = `${Math.round((block.mediaWidth || 120) * 0.65)}px`;
                ic.innerHTML = `<i class="${escHtml(block.mediaIcon || 'fa-solid fa-film')}"></i>`;
                wrap.appendChild(ic);
            } else if (block.mediaUrl) {
                wrap.appendChild(buildInlineMediaNode(`${block.mediaWidth || 520}px`, Number(block.mediaHeight) || 0));
            } else if (interactive) {
                const ph = document.createElement('div');
                ph.style.cssText = `width:${block.mediaWidth || 480}px;max-width:100%;height:${block.mediaHeight || 260}px;border-radius:${block.mediaRadius ?? 12}px;border:2px dashed rgba(148,163,184,0.45);background:rgba(15,23,42,0.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#94a3b8;font-size:18px;`;
                ph.innerHTML = `<i class="fa-solid ${block.mediaKind === 'video' ? 'fa-video' : 'fa-image'}" style="font-size:40px;opacity:0.65;"></i><span>Select ${block.mediaKind === 'video' ? 'Video' : 'Image'} in Inspector</span>`;
                wrap.appendChild(ph);
            }
            const cap = resolvePlaceholders(block.caption, variables);
            if (cap) {
                const cEl = document.createElement('div');
                cEl.className = 'cs-inline-caption';
                cEl.textContent = cap;
                if (st.subtitleColor) cEl.style.color = resolveColorOrVar(st.subtitleColor, variables, '');
                wrap.appendChild(cEl);
            }
            inner.appendChild(wrap);
        } else if (block.type === 'logo-strip') {
            buildTitleAndSub(inner);
            const strip = document.createElement('div');
            strip.className = 'cs-logo-strip';
            strip.style.gap = `${block.logoGap || 48}px`;
            const lh = block.logoHeight || 64;
            for (const lg of (block.logos || [])) {
                const item = document.createElement('div');
                item.className = 'cs-logo-item';
                if (lg.url) {
                    const img = document.createElement('img');
                    img.src = lg.url;
                    img.crossOrigin = 'anonymous';
                    img.style.height = `${lh}px`;
                    if (block.logoMono) img.style.filter = 'grayscale(1) brightness(1.15)';
                    item.appendChild(img);
                } else if (lg.iconClass) {
                    const ic = document.createElement('div');
                    ic.className = 'cs-logo-item-icon';
                    ic.style.fontSize = `${Math.round(lh * 0.85)}px`;
                    if (block.logoTint) ic.style.color = resolveColorOrVar(block.logoTint, variables, '');
                    ic.innerHTML = `<i class="${escHtml(lg.iconClass)}"></i>`;
                    item.appendChild(ic);
                }
                if (lg.label) {
                    const lbl = document.createElement('div');
                    lbl.className = 'cs-logo-item-label';
                    lbl.textContent = resolvePlaceholders(lg.label, variables);
                    item.appendChild(lbl);
                }
                strip.appendChild(item);
            }
            inner.appendChild(strip);
        } else if (block.type === 'split-row') {
            const row = document.createElement('div');
            row.className = `cs-split-row${block.mediaPosition === 'right' ? ' media-right' : ''}`;
            const mediaSide = document.createElement('div');
            mediaSide.className = 'cs-split-media';
            mediaSide.style.width = `${block.mediaWidth || 260}px`;
            if (block.mediaKind === 'icon' || !block.mediaUrl) {
                const ic = document.createElement('div');
                ic.className = 'cs-inline-media-icon';
                ic.style.fontSize = `${Math.round((block.mediaWidth || 160) * 0.52)}px`;
                ic.innerHTML = `<i class="${escHtml(block.mediaIcon || 'fa-solid fa-clapperboard')}"></i>`;
                mediaSide.appendChild(ic);
            } else {
                mediaSide.appendChild(buildInlineMediaNode('100%', Number(block.mediaHeight) || 0));
            }
            const textSide = document.createElement('div');
            textSide.className = 'cs-split-text';
            buildTitleAndSub(textSide);
            const body = resolvePlaceholders(block.content, variables);
            if (body) {
                const p = document.createElement('div');
                p.className = 'cs-section-content';
                p.textContent = body;
                textSide.appendChild(p);
            }
            row.append(mediaSide, textSide);
            inner.appendChild(row);
        }

        // Optional Section Edge Character / Mascot attached to this block
        const att = block.edgeAttachment;
        if (att && att.enabled) {
            const mascot = document.createElement('div');
            mascot.className = `cs-edge-mascot anchor-${att.anchor || 'hanging-top-right'} z-${att.zLayer === 'back' ? 'back' : 'front'}`;
            const sz = Number(att.size) || 88;
            mascot.style.width = `${sz}px`;
            mascot.style.height = `${sz}px`;
            mascot.style.setProperty('--cs-mascot-size', `${sz}px`);
            if (att.mediaKind === 'video' && att.mediaUrl) {
                const mv = document.createElement('video');
                mv.src = att.mediaUrl;
                mv.muted = true;
                mv.loop = true;
                mv.playsInline = true;
                mv.preload = 'metadata';
                mascot.appendChild(mv);
                inlineVideos.push({ el: mv, blockId: block.id, cfg: { mediaAutoplay: true, mediaLoop: true, mediaMuted: true, mediaStartSec: 0, mediaRate: 1 }, isBlur: true });
            } else if (att.mediaKind === 'image' && att.mediaUrl) {
                const mi = document.createElement('img');
                mi.src = att.mediaUrl;
                mi.crossOrigin = 'anonymous';
                mascot.appendChild(mi);
            } else {
                const ic = document.createElement('i');
                ic.className = att.iconClass || 'fa-solid fa-ghost';
                ic.style.fontSize = `${Math.round(sz * 0.78)}px`;
                ic.style.color = resolveColorOrVar(att.iconColor, variables, '#E5C07BFF');
                mascot.appendChild(ic);
            }
            mascot.style.transform = engine.evaluateEdgeAttachmentTransform(att, currentTime);
            inner.appendChild(mascot);
            edgeMascots.push({ el: mascot, att, lastTransform: mascot.style.transform });
        }

        el.appendChild(inner);
        return el;
    }

    function buildClipElement(track, clip) {
        const el = document.createElement('div');
        el.className = `cs-track-clip${interactive ? ' interactive' : ''}`;
        el.dataset.clipId = clip.id;
        el.dataset.trackId = track.id;
        el.style.left = `${clip.x}%`;
        el.style.top = `${clip.y}%`;
        el.style.width = `${clip.width}%`;
        el.style.height = `${clip.height}%`;
        el.style.borderRadius = `${clip.borderRadius ?? 14}px`;

        const type = clip.elementType || 'image';
        const clipPxW = Math.max(24, Math.round((Number(clip.width) || 35) / 100 * project.canvas.width));
        const clipPxH = Math.max(24, Math.round((Number(clip.height) || 50) / 100 * project.canvas.height));

        if (clip.shadow && type !== 'cutout') {
            el.style.boxShadow = '0 22px 60px rgba(0, 0, 0, 0.55)';
        }
        if (type !== 'cutout') {
            applyElementBorder(el, clip, variables, { width: clipPxW, height: clipPxH });
        }

        const filters = [];
        if ((clip.filterBrightness ?? 100) !== 100) filters.push(`brightness(${clip.filterBrightness}%)`);
        if ((clip.filterContrast ?? 100) !== 100) filters.push(`contrast(${clip.filterContrast}%)`);
        if ((clip.filterSaturate ?? 100) !== 100) filters.push(`saturate(${clip.filterSaturate}%)`);
        if ((clip.filterGrayscale ?? 0) > 0) filters.push(`grayscale(${clip.filterGrayscale}%)`);
        const baseFilterNoBlur = filters.join(' ');
        const baseBlurPx = Number(clip.filterBlur) || 0;

        let innerMedia = null;
        let innerTile = null;
        const clipVideos = [];
        let clipPattern = null;

        const applyClipTextOverrides = node => {
            if (clip.italic) node.style.fontStyle = 'italic';
            if (clip.underline) node.style.textDecoration = 'underline';
            if (clip.uppercase) node.style.textTransform = 'uppercase';
            if (clip.letterSpacing !== '' && clip.letterSpacing !== undefined) node.style.letterSpacing = `${clip.letterSpacing}em`;
            if (clip.textShadow) node.style.textShadow = '0 4px 20px rgba(0,0,0,0.75)';
        };

        if (type === 'cutout') {
            // Cutout clips punch a hole in behind/background layers; invisible fill itself
            el.style.background = interactive ? 'rgba(56, 189, 248, 0.08)' : 'transparent';
            el.style.border = interactive ? '2px dashed rgba(56, 189, 248, 0.65)' : 'none';
        } else if (type === 'image' || type === 'video') {
            const wrap = document.createElement('div');
            wrap.className = 'cs-clip-media-wrap';
            if (clip.mediaUrl) {
                if (type === 'image' && clip.motionTile) {
                    const tile = document.createElement('div');
                    tile.className = 'cs-clip-tile';
                    tile.style.backgroundImage = `url("${clip.mediaUrl.replace(/"/g, '%22')}")`;
                    innerTile = tile;
                    wrap.appendChild(tile);
                } else {
                    if (clip.mediaFit === 'contain-blur') {
                        const bgM = document.createElement(type === 'video' ? 'video' : 'img');
                        bgM.className = 'cs-clip-blur-bg';
                        bgM.src = clip.mediaUrl;
                        if (type === 'video') {
                            bgM.muted = true;
                            bgM.loop = clip.videoLoop !== false;
                            bgM.playsInline = true;
                            bgM.preload = 'metadata';
                            bgM.playbackRate = (clip.videoRate || 1) * speedRate;
                            clipVideos.push(bgM);
                        } else {
                            bgM.crossOrigin = 'anonymous';
                        }
                        wrap.appendChild(bgM);
                    }
                    const media = document.createElement(type === 'video' ? 'video' : 'img');
                    media.className = clip.mediaFit === 'contain-blur' ? 'cs-clip-fg-contain cs-clip-media-el' : 'cs-clip-media-el';
                    if (clip.kenBurns && clip.kenBurns !== 'none') media.style.willChange = 'transform';
                    media.src = clip.mediaUrl;
                    if (clip.mediaFit !== 'contain-blur') {
                        media.style.objectFit = clip.mediaFit || 'cover';
                    }
                    if (type === 'video') {
                        media.muted = clip.videoMuted !== false;
                        media.volume = Math.max(0, Math.min(1, (clip.videoVolume ?? 80) / 100));
                        media.loop = clip.videoLoop !== false;
                        media.playsInline = true;
                        media.preload = 'metadata';
                        media.playbackRate = (clip.videoRate || 1) * speedRate;
                        clipVideos.push(media);
                    } else {
                        media.crossOrigin = 'anonymous';
                    }
                    innerMedia = media;
                    wrap.appendChild(media);
                }
            } else {
                wrap.style.background = 'rgba(15, 23, 42, 0.72)';
                wrap.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:24px;"><i class="fa-solid ${type === 'video' ? 'fa-video' : 'fa-image'}" style="font-size:48px;margin-bottom:10px;display:block;opacity:0.6;"></i><div style="font-size:18px;">Select ${type} from Asset Library</div></div>`;
            }
            if (clip.caption) {
                const cap = document.createElement('div');
                cap.className = 'cs-clip-caption';
                cap.textContent = resolvePlaceholders(clip.caption, variables);
                wrap.appendChild(cap);
            }
            el.appendChild(wrap);
        } else if (type === 'slideshow') {
            const wrap = document.createElement('div');
            wrap.className = 'cs-clip-media-wrap';
            const imgs = (clip.slideshowImages || []).filter(Boolean);
            const img = document.createElement('img');
            img.className = 'cs-clip-media-el';
            if (clip.kenBurns && clip.kenBurns !== 'none') img.style.willChange = 'transform';
            img.crossOrigin = 'anonymous';
            img.style.objectFit = clip.mediaFit === 'contain' ? 'contain' : 'cover';
            if (imgs.length) img.src = imgs[0];
            innerMedia = img;
            wrap.appendChild(img);
            el.appendChild(wrap);
        } else if (type === 'pattern') {
            const host = document.createElement('div');
            host.className = 'cs-clip-media-wrap';
            host.style.background = resolveColorOrVar(clip.fillColor, variables, '#07080CFF');
            el.appendChild(host);
            clipPattern = createProceduralPatternHost(host, {
                ...clip,
                width: clipPxW,
                height: clipPxH,
                color: 'transparent',
                accent: resolveColorOrVar(clip.patternAccent, variables, '#58A6FFFF'),
                secondary: resolveColorOrVar(clip.patternSecondary, variables, '#A855F7FF'),
                vignetteColor: resolveColorOrVar(clip.patternVignetteColor, variables, '#000000FF')
            });
        } else if (type === 'icon') {
            const ic = document.createElement('i');
            ic.className = clip.iconClass || 'fa-solid fa-star';
            ic.style.fontSize = `${Math.max(24, clip.fontSize || 96)}px`;
            ic.style.color = resolveColorOrVar(clip.iconColor, variables, '#E5C07BFF');
            if (clip.textShadow) ic.style.textShadow = '0 6px 24px rgba(0,0,0,0.7)';
            el.appendChild(ic);
        } else if (type === 'text') {
            const body = document.createElement('div');
            body.className = 'cs-clip-text-body';
            body.style.fontFamily = clip.fontFamily ? `'${clip.fontFamily}', sans-serif` : 'var(--cs-heading-font)';
            body.style.fontSize = `${clip.fontSize || 36}px`;
            body.style.fontWeight = clip.fontWeight || '700';
            body.style.textAlign = clip.textAlign || 'center';
            body.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            if (clip.fillColor && clip.fillColor !== '#111827CC' && clip.fillGradient) {
                body.style.background = `linear-gradient(${clip.fillAngle ?? 135}deg, ${resolveColorOrVar(clip.fillColor, variables)}, ${resolveColorOrVar(clip.fillColor2, variables)})`;
            }
            applyClipTextOverrides(body);
            body.textContent = resolvePlaceholders(clip.text || 'Text Overlay', variables);
            el.appendChild(body);
        } else if (type === 'badge') {
            const badge = document.createElement('div');
            badge.className = 'cs-clip-badge';
            badge.style.background = clip.fillGradient
                ? `linear-gradient(${clip.fillAngle ?? 135}deg, ${resolveColorOrVar(clip.fillColor, variables)}, ${resolveColorOrVar(clip.fillColor2, variables)})`
                : resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            badge.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            if (clip.fontFamily) badge.style.fontFamily = `'${clip.fontFamily}', sans-serif`;
            badge.style.fontSize = `${clip.fontSize || 24}px`;
            badge.style.fontWeight = clip.fontWeight || '700';
            applyClipTextOverrides(badge);
            badge.innerHTML = `${clip.badgeIcon ? `<i class="${escHtml(clip.badgeIcon)}" style="color:${escHtml(resolveColorOrVar(clip.iconColor, variables, '#E5C07BFF'))}"></i>` : ''}<span>${escHtml(resolvePlaceholders(clip.badgeLabel || 'FEATURED', variables))}</span>`;
            el.appendChild(badge);
        } else if (type === 'counter') {
            const box = document.createElement('div');
            box.className = 'cs-clip-counter';
            box.style.background = clip.fillGradient
                ? `linear-gradient(${clip.fillAngle ?? 135}deg, ${resolveColorOrVar(clip.fillColor, variables)}, ${resolveColorOrVar(clip.fillColor2, variables)})`
                : resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            box.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            if (clip.fontFamily) box.style.fontFamily = `'${clip.fontFamily}', sans-serif`;
            box.style.fontSize = `${clip.fontSize || 32}px`;
            applyClipTextOverrides(box);
            box.innerHTML = `<div class="cs-clip-counter-val">${escHtml(resolvePlaceholders(clip.counterValue || '0', variables))}</div><div class="cs-clip-counter-lbl">${escHtml(resolvePlaceholders(clip.counterLabel || 'TOTAL', variables))}</div>`;
            el.appendChild(box);
        } else if (type === 'meter') {
            const rawVal = resolvePlaceholders(clip.counterValue || '75', variables).replace(/,/g, '').trim();
            const valNum = Number(rawVal) || 0;
            const maxNum = Math.max(1, Number(clip.counterMax) || 100);
            const pct = Math.max(0, Math.min(100, (valNum / maxNum) * 100));
            const box = document.createElement('div');
            box.className = 'cs-clip-meter';
            box.style.background = clip.fillGradient
                ? `linear-gradient(${clip.fillAngle ?? 135}deg, ${resolveColorOrVar(clip.fillColor, variables)}, ${resolveColorOrVar(clip.fillColor2, variables)})`
                : resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            box.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            if (clip.fontFamily) box.style.fontFamily = `'${clip.fontFamily}', sans-serif`;
            box.style.fontSize = `${clip.fontSize || 28}px`;
            applyClipTextOverrides(box);
            box.innerHTML = `<div class="cs-clip-meter-head"><span>${escHtml(resolvePlaceholders(clip.counterLabel || 'Progress', variables))}</span><span>${Math.round(pct)}%</span></div><div class="cs-clip-meter-track"><div class="cs-clip-meter-fill" style="width:${pct}%"></div></div>`;
            el.appendChild(box);
        } else {
            // 'shape' card (supports optional icon + title + subtext)
            const card = document.createElement('div');
            card.className = 'cs-clip-shape-card';
            card.style.background = clip.fillGradient
                ? `linear-gradient(${clip.fillAngle ?? 135}deg, ${resolveColorOrVar(clip.fillColor, variables)}, ${resolveColorOrVar(clip.fillColor2, variables)})`
                : resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            card.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            card.style.textAlign = clip.textAlign || 'center';
            if (clip.iconClass) {
                const ic = document.createElement('i');
                ic.className = clip.iconClass;
                ic.style.fontSize = '52px';
                ic.style.color = resolveColorOrVar(clip.iconColor, variables, '#E5C07BFF');
                card.appendChild(ic);
            }
            const heading = resolvePlaceholders(clip.text, variables);
            if (heading) {
                const h = document.createElement('div');
                h.style.fontFamily = clip.fontFamily ? `'${clip.fontFamily}', sans-serif` : 'var(--cs-heading-font)';
                h.style.fontSize = `${clip.fontSize || 34}px`;
                h.style.fontWeight = clip.fontWeight || '700';
                h.style.letterSpacing = '0.1em';
                applyClipTextOverrides(h);
                h.textContent = heading;
                card.appendChild(h);
            }
            const sub = resolvePlaceholders(clip.subtext, variables);
            if (sub) {
                const p = document.createElement('div');
                p.style.fontSize = `${Math.max(16, Math.round((clip.fontSize || 34) * 0.62))}px`;
                p.style.opacity = '0.82';
                p.style.lineHeight = '1.55';
                p.style.maxWidth = '88%';
                p.textContent = sub;
                card.appendChild(p);
            }
            el.appendChild(card);
        }

        if (interactive) {
            el.addEventListener('pointerdown', ev => {
                onClipSelect(track.id, clip.id, ev);
            });
        }
        return {
            el,
            clip,
            innerMedia,
            innerTile,
            videos: clipVideos,
            pattern: clipPattern,
            baseFilterNoBlur,
            baseBlurPx,
            active: false,
            lastOpacity: '',
            lastTransform: '',
            lastFilter: '',
            lastClipPath: '',
            lastKbTransform: ''
        };
    }

    function applyAutoFitNames(root = creditsCol) {
        const entries = root.querySelectorAll('.cs-name-fit');
        if (!entries.length) return;
        // Temporarily unhide display:none crawl runs / cards so clientWidth/scrollWidth measure accurately
        const hiddenContainers = [];
        for (const runEl of runDomMap.values()) {
            if (!runEl.classList.contains('active') && runEl.style.display !== 'block') {
                hiddenContainers.push({ el: runEl, disp: runEl.style.display, vis: runEl.style.visibility });
                runEl.style.visibility = 'hidden';
                runEl.style.display = 'block';
            }
        }
        for (const cardEntry of cardDomMap.values()) {
            const cEl = cardEntry.el;
            if (!cEl.classList.contains('active') && cEl.style.display !== 'flex') {
                hiddenContainers.push({ el: cEl, disp: cEl.style.display, vis: cEl.style.visibility });
                cEl.style.visibility = 'hidden';
                cEl.style.display = 'flex';
            }
        }
        // Phase 1: Batch reset styles
        const items = [];
        for (const el of entries) {
            const sizer = el.querySelector('.cs-name-fit-sizer');
            const txt = el.querySelector('.cs-name-fit-text');
            if (!sizer || !txt) continue;
            sizer.style.width = '';
            txt.style.transform = '';
            txt.style.transformOrigin = 'left center';
            items.push({ el, sizer, txt, avail: 0, measured: 0 });
        }
        // Phase 2: Batch layout reads (single reflow)
        for (const it of items) {
            it.avail = Math.max(20, it.el.clientWidth - 6);
            it.measured = Math.max(it.txt.scrollWidth, it.txt.getBoundingClientRect().width);
        }
        // Phase 3: Batch style writes
        for (const it of items) {
            if (it.measured > it.avail + 1) {
                const sx = Math.max(0.55, (it.avail / it.measured) * 0.985);
                it.sizer.style.width = `${Math.max(1, it.measured * sx)}px`;
                it.txt.style.transform = `scaleX(${sx})`;
            }
        }
        for (const h of hiddenContainers) {
            h.el.style.display = h.disp;
            h.el.style.visibility = h.vis;
        }
    }

    function measureCrawlBlockHeights() {
        const heights = {};
        for (const runEl of runDomMap.values()) {
            const prevDisplay = runEl.style.display;
            const prevVis = runEl.style.visibility;
            runEl.style.visibility = 'hidden';
            runEl.style.display = 'block';
            for (const blkEl of runEl.querySelectorAll(':scope > .cs-block[data-block-id]')) {
                const h = blkEl.offsetHeight;
                if (h > 0) heights[blkEl.dataset.blockId] = h;
            }
            runEl.style.display = prevDisplay;
            runEl.style.visibility = prevVis;
        }
        return heights;
    }

    function applyCutoutMasks(activeClips) {
        const cutouts = activeClips.filter(ac => ac.clip.elementType === 'cutout' && ac.opacity > 0.01);
        const sig = cutouts.map(c => `${c.clip.id}:${c.clip.x}:${c.clip.y}:${c.clip.width}:${c.clip.height}:${c.clip.borderRadius}`).join('|');
        if (sig === lastCutoutSig) return;
        lastCutoutSig = sig;

        if (!cutouts.length) {
            bgLayer.style.webkitMaskImage = '';
            bgLayer.style.maskImage = '';
            behindLayer.style.webkitMaskImage = '';
            behindLayer.style.maskImage = '';
            return;
        }
        const cw = project.canvas.width;
        const ch = project.canvas.height;
        const rects = cutouts.map(ac => {
            const x = (ac.clip.x / 100) * cw;
            const y = (ac.clip.y / 100) * ch;
            const w = (ac.clip.width / 100) * cw;
            const h = (ac.clip.height / 100) * ch;
            const r = ac.clip.borderRadius || 0;
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${r}" ry="${r}" fill="black"/>`;
        }).join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cw} ${ch}"><defs><mask id="m"><rect width="100%" height="100%" fill="white"/>${rects}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`;
        const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
        bgLayer.style.webkitMaskImage = uri;
        bgLayer.style.maskImage = uri;
        behindLayer.style.webkitMaskImage = uri;
        behindLayer.style.maskImage = uri;
    }

    function getZoneLayoutHelper() {
        const canvasW = project.canvas.width;
        const maxColW = Math.min(canvasW, project.theme?.maxColumnWidth || 1180);
        const reflowCfg = project.theme?.autoReflow || {};
        const isPerSection = reflowCfg.enabled !== false && reflowCfg.mode !== 'glide';
        const splitRatio = Math.max(35, Math.min(65, Number(reflowCfg.splitRatio) || 50)) / 100;
        const gapPx = Number(reflowCfg.gapPx) || 48;
        const sideColW = Math.max(320, Math.round(canvasW * splitRatio - gapPx * 0.5));

        const applyBlockZoneLayout = (blkEl, zone, clearanceTopPx = 0, zoneBounds = null) => {
            const prevW = blkEl.style.width;
            blkEl.classList.remove('cs-zone-center', 'cs-zone-left', 'cs-zone-right');
            blkEl.style.marginTop = clearanceTopPx > 0 ? `${clearanceTopPx}px` : '';
            blkEl.style.marginRight = '';
            blkEl.style.marginLeft = '';
            const origPadNum = blkEl.dataset.padH !== undefined ? Math.max(0, Number(blkEl.dataset.padH) || 0) : 0;
            const customW = Number(blkEl.dataset.customWidth) || 0;
            const mediaW = Number(blkEl.dataset.mediaWidth) || 0;
            const wantedInnerW = customW > 0 ? customW : mediaW;
            const defaultInnerW = Math.max(200, maxColW - origPadNum * 2);

            const applyExpandedCenterWidth = () => {
                if (wantedInnerW > defaultInnerW) {
                    const clampedInner = Math.min(canvasW, wantedInnerW);
                    const effPadH = Math.max(0, Math.min(origPadNum, Math.floor((canvasW - clampedInner) / 2)));
                    blkEl.style.width = `${Math.min(canvasW, clampedInner + effPadH * 2)}px`;
                    blkEl.style.paddingLeft = `${effPadH}px`;
                    blkEl.style.paddingRight = `${effPadH}px`;
                } else {
                    blkEl.style.width = `${maxColW}px`;
                    if (blkEl.dataset.padH !== undefined) {
                        blkEl.style.paddingLeft = `${origPadNum}px`;
                        blkEl.style.paddingRight = `${origPadNum}px`;
                    }
                }
            };

            if (!isPerSection) {
                blkEl.style.marginLeft = 'auto';
                blkEl.style.marginRight = 'auto';
                if (wantedInnerW > defaultInnerW) {
                    const clampedInner = Math.min(canvasW, wantedInnerW);
                    const effPadH = Math.max(0, Math.min(origPadNum, Math.floor((canvasW - clampedInner) / 2)));
                    blkEl.style.width = '100%';
                    blkEl.style.maxWidth = `${Math.min(canvasW, clampedInner + effPadH * 2)}px`;
                    blkEl.style.paddingLeft = `${effPadH}px`;
                    blkEl.style.paddingRight = `${effPadH}px`;
                } else {
                    blkEl.style.width = '100%';
                    blkEl.style.maxWidth = `${maxColW}px`;
                    if (blkEl.dataset.padH !== undefined) {
                        blkEl.style.paddingLeft = `${origPadNum}px`;
                        blkEl.style.paddingRight = `${origPadNum}px`;
                    }
                }
                return blkEl.style.width !== prevW;
            }
            blkEl.style.maxWidth = '';
            const z = zone || 'center';
            blkEl.classList.add(`cs-zone-${z}`);
            const safeOuterPx = Math.round(canvasW * 0.04);
            if (z === 'center') {
                applyExpandedCenterWidth();
            } else {
                let clearWidth = sideColW - safeOuterPx;
                if (z === 'right' && zoneBounds?.leftEdgePct > 0) {
                    const clipRightPx = (zoneBounds.leftEdgePct / 100) * canvasW;
                    clearWidth = canvasW - clipRightPx - gapPx - safeOuterPx;
                } else if (z === 'left' && zoneBounds?.rightEdgePct < 100) {
                    const clipLeftPx = (zoneBounds.rightEdgePct / 100) * canvasW;
                    clearWidth = clipLeftPx - gapPx - safeOuterPx;
                }
                const maxSide = wantedInnerW > maxColW ? Math.min(canvasW, wantedInnerW) : maxColW;
                const availSide = Math.max(280, Math.min(maxSide, Math.round(clearWidth)));
                blkEl.style.width = `${availSide}px`;
                blkEl.style.paddingLeft = '20px';
                blkEl.style.paddingRight = '20px';
                if (z === 'right') blkEl.style.marginRight = `${safeOuterPx}px`;
                if (z === 'left') blkEl.style.marginLeft = `${safeOuterPx}px`;
            }
            return blkEl.style.width !== prevW;
        };

        return { canvasW, maxColW, isPerSection, applyBlockZoneLayout };
    }

    function syncZonesAndMeasure() {
        const { isPerSection, applyBlockZoneLayout } = getZoneLayoutHelper();
        applyAutoFitNames(creditsCol);
        let measured = measureCrawlBlockHeights();
        solved = engine.solveTimeline(project, measured);

        if (isPerSection) {
            let widthChanged = false;
            const applySolvedZones = () => {
                let changed = false;
                for (const seg of solved.segments) {
                    if (seg.kind === 'crawl') {
                        const runEl = runDomMap.get(seg.id);
                        if (!runEl) continue;
                        for (const bm of seg.blockMetrics) {
                            const blkEl = runEl.querySelector(`:scope > .cs-block[data-block-id="${bm.blockId}"]`);
                            if (blkEl && applyBlockZoneLayout(blkEl, bm.zone, bm.clearanceTopPx, bm.zoneBounds)) {
                                changed = true;
                            }
                        }
                    } else if (seg.kind === 'card') {
                        const cardEntry = cardDomMap.get(seg.blockId);
                        if (cardEntry) {
                            const cardWrap = cardEntry.el;
                            cardWrap.classList.remove('cs-zone-center', 'cs-zone-left', 'cs-zone-right');
                            cardWrap.classList.add(`cs-zone-${seg.zone || 'center'}`);
                            const blkEl = cardWrap.querySelector(':scope > .cs-block');
                            if (blkEl && applyBlockZoneLayout(blkEl, seg.zone, 0, seg.zoneBounds)) {
                                changed = true;
                            }
                        }
                    }
                }
                return changed;
            };
            widthChanged = applySolvedZones();
            applyAutoFitNames(creditsCol);
            // If narrowing/widening a block changed its wrapped height, re-measure & re-solve once!
            if (widthChanged) {
                measured = measureCrawlBlockHeights();
                solved = engine.solveTimeline(project, measured);
                applySolvedZones();
                applyAutoFitNames(creditsCol);
            }
        }
    }

    function buildScene() {
        if (!project) return;
        ensureFontAwesome();
        ensureFontsLoaded(project);
        applyThemeCssVars();
        applyEdgeFadeMask();

        // Release all prior video decoders & pattern canvases before clearing DOM
        disposePatterns();
        releaseVideosIn(creditsCol);
        releaseVideosIn(behindLayer);
        releaseVideosIn(sideLayer);
        releaseVideosIn(aboveLayer);
        inlineVideos = [];
        edgeMascots = [];
        buildBackground();

        creditsCol.innerHTML = '';
        behindLayer.innerHTML = '';
        sideLayer.innerHTML = '';
        aboveLayer.innerHTML = '';
        runDomMap.clear();
        cardDomMap.clear();
        clipDomMap.clear();
        lastCutoutSig = '';
        lastColW = '';
        lastColLeft = '';
        lastIsGlide = null;

        // Initial timeline pass to group runs & cards
        const prelim = engine.solveTimeline(project);
        const { canvasW, maxColW, isPerSection, applyBlockZoneLayout } = getZoneLayoutHelper();

        const initW = isPerSection ? `${canvasW}px` : `${maxColW}px`;
        creditsCol.style.width = initW;
        lastColW = initW;

        for (const seg of prelim.segments) {
            if (seg.kind === 'crawl') {
                const runEl = document.createElement('div');
                runEl.className = 'cs-crawl-run';
                runEl.dataset.runId = seg.id;
                for (const bm of seg.blockMetrics) {
                    const blkEl = buildBlockElement(bm.block);
                    applyBlockZoneLayout(blkEl, bm.zone, bm.clearanceTopPx, bm.zoneBounds);
                    runEl.appendChild(blkEl);
                }
                creditsCol.appendChild(runEl);
                runDomMap.set(seg.id, runEl);
            } else if (seg.kind === 'card') {
                const cardWrap = document.createElement('div');
                cardWrap.className = `cs-card-layer cs-zone-${seg.zone || 'center'}`;
                cardWrap.dataset.blockId = seg.blockId;
                const blkEl = buildBlockElement(seg.block);
                applyBlockZoneLayout(blkEl, seg.zone, 0, seg.zoneBounds);
                cardWrap.appendChild(blkEl);
                creditsCol.appendChild(cardWrap);
                cardDomMap.set(seg.blockId, {
                    el: cardWrap,
                    active: false,
                    lastOpacity: '',
                    lastTransform: '',
                    lastFilter: '',
                    lastClipPath: ''
                });
            }
        }

        // Build all track clip nodes
        for (const track of (project.tracks || [])) {
            if (!track.visible) continue;
            const host = track.layer === 'behind' ? behindLayer : (track.layer === 'above' ? aboveLayer : sideLayer);
            for (const clip of (track.clips || [])) {
                if (clip.enabled === false) continue;
                const clipEntry = buildClipElement(track, clip);
                host.appendChild(clipEntry.el);
                clipDomMap.set(clip.id, clipEntry);
            }
        }

        syncZonesAndMeasure();
        onSolved(solved);
        renderAtTime(currentTime);
    }

    function syncVideoElement(v, {
        mediaTime = 0,
        targetRate = 1,
        loop = true,
        autoplay = true,
        activeWindow = true,
        playDriftTolerance = 0.65,
        pauseDriftTolerance = 0.05
    }) {
        if (!v) return;
        const safeRate = Math.max(0.25, Number(targetRate) || 1);
        if (Math.abs((v.playbackRate || 1) - safeRate) > 0.01) {
            try { v.playbackRate = safeRate; } catch {}
        }
        if (Boolean(v.loop) !== Boolean(loop)) {
            try { v.loop = Boolean(loop); } catch {}
        }
        const decision = engine.computeVideoSyncAction({
            mediaTime,
            duration: v.duration,
            currentTime: v.currentTime || 0,
            paused: Boolean(v.paused),
            ended: Boolean(v.ended),
            seeking: Boolean(v.seeking),
            readyState: v.readyState || 0,
            loop,
            autoplay,
            playing,
            deterministic,
            activeWindow,
            playDriftTolerance,
            pauseDriftTolerance
        });
        if (decision.action === 'pause') {
            if (!v.paused) v.pause();
            if (decision.seekTo !== null) {
                try { v.currentTime = decision.seekTo; } catch {}
            }
        } else if (decision.action === 'play') {
            if (decision.seekTo !== null) {
                try { v.currentTime = decision.seekTo; } catch {}
            }
            if (v.paused) v.play().catch(() => {});
        }
    }

    function syncAmbientVideos(tSec) {
        const syncEntry = (entry, activeWindow = true, localT = tSec) => {
            const cfg = entry.cfg || {};
            const rate = Math.max(0.25, Number(cfg.mediaRate) || 1);
            const startOffset = Number(cfg.mediaStartSec) || 0;
            syncVideoElement(entry.el, {
                mediaTime: startOffset + Math.max(0, localT) * rate,
                targetRate: rate * speedRate,
                loop: cfg.mediaLoop !== false,
                autoplay: cfg.mediaAutoplay !== false,
                activeWindow,
                playDriftTolerance: 0.65,
                pauseDriftTolerance: 0.05
            });
        };
        for (const entry of bgVideos) {
            syncEntry(entry, true, tSec);
        }
        const timings = solved?.blockTimings || {};
        for (const entry of inlineVideos) {
            const bt = timings[entry.blockId];
            if (!bt) {
                syncEntry(entry, true, tSec);
            } else {
                const isVis = tSec >= bt.startSec - 0.15 && tSec <= bt.endSec + 0.15;
                const localT = Math.max(0, tSec - bt.startSec);
                syncEntry(entry, isVis, localT);
            }
        }
    }

    function renderAtTime(tSec) {
        if (!project || !solved) return null;
        currentTime = Math.max(0, tSec);
        const frame = engine.evaluateFrame(currentTime, solved, project);

        // 1. Dynamic Auto-Reflow of the Credits Column (only mutate style when values actually change)
        const canvasW = project.canvas.width;
        const gapPx = project.theme?.autoReflow?.gapPx ?? 48;
        const isPerSection = frame.reflow.mode === 'per-section' && project.theme?.autoReflow?.enabled !== false;
        const glideMaxW = frame.reflow.widthRatio >= 0.99 ? canvasW : Math.min(canvasW, Math.max(320, Math.round(canvasW * frame.reflow.widthRatio - gapPx)));
        const nextW = isPerSection ? `${canvasW}px` : `${glideMaxW}px`;
        const nextLeft = isPerSection ? '50%' : `${frame.reflow.centerXPercent.toFixed(3)}%`;
        if (lastIsGlide !== !isPerSection) {
            lastIsGlide = !isPerSection;
            creditsCol.style.willChange = isPerSection ? '' : 'transform';
        }
        if (nextW !== lastColW) {
            lastColW = nextW;
            creditsCol.style.width = nextW;
        }
        if (nextLeft !== lastColLeft) {
            lastColLeft = nextLeft;
            creditsCol.style.left = nextLeft;
        }

        // 2. Crawl Runs (GPU translate3d)
        const activeRunIds = frame.activeRuns.length ? new Set(frame.activeRuns.map(r => r.runId)) : null;
        for (const r of frame.activeRuns) {
            const el = runDomMap.get(r.runId);
            if (el) {
                if (!el.classList.contains('active')) el.classList.add('active');
                el.style.transform = `translate3d(0, ${r.scrollY.toFixed(2)}px, 0)`;
            }
        }
        for (const [id, el] of runDomMap.entries()) {
            if (!activeRunIds || !activeRunIds.has(id)) {
                if (el.classList.contains('active')) el.classList.remove('active');
            }
        }

        // 3. Featured / Timed Cards (skip unchanged style writes during steady-state hold)
        const activeCardIds = frame.activeCards.length ? new Set(frame.activeCards.map(c => c.blockId)) : null;
        for (const card of frame.activeCards) {
            const entry = cardDomMap.get(card.blockId);
            if (!entry) continue;
            const el = entry.el;
            if (!entry.active) {
                entry.active = true;
                el.classList.add('active');
            }
            const op = card.opacity.toFixed(4);
            const tr = `translate3d(${card.translateX.toFixed(2)}px, ${card.translateY.toFixed(2)}px, 0) scale(${card.scale.toFixed(4)})`;
            const fl = card.blur > 0.05 ? `blur(${card.blur.toFixed(2)}px)` : '';
            const cp = card.clipPath || '';
            if (op !== entry.lastOpacity) { entry.lastOpacity = op; el.style.opacity = op; }
            if (tr !== entry.lastTransform) { entry.lastTransform = tr; el.style.transform = tr; }
            if (fl !== entry.lastFilter) { entry.lastFilter = fl; el.style.filter = fl; }
            if (cp !== entry.lastClipPath) { entry.lastClipPath = cp; el.style.clipPath = cp; }
        }
        for (const [id, entry] of cardDomMap.entries()) {
            if (!activeCardIds || !activeCardIds.has(id)) {
                if (entry.active) {
                    entry.active = false;
                    entry.el.classList.remove('active');
                }
            }
        }

        // 4. Floating / Side / Background Track Clips (zero DOM queries per frame)
        const activeClipIds = frame.activeClips.length ? new Set(frame.activeClips.map(ac => ac.clip.id)) : null;
        for (const ac of frame.activeClips) {
            const entry = clipDomMap.get(ac.clip.id);
            if (!entry) continue;
            const el = entry.el;
            if (!entry.active) {
                entry.active = true;
                el.classList.add('active');
            }
            const op = ac.opacity.toFixed(4);
            const rot = (ac.clip.rotation || 0) + (ac.pathRotDeg || 0);
            const tr = `translate3d(${ac.translateX.toFixed(2)}px, ${ac.translateY.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${ac.scale.toFixed(4)})`;
            const totalBlur = entry.baseBlurPx + (ac.blur > 0.05 ? ac.blur : 0);
            const blurPart = totalBlur > 0.05 ? `blur(${totalBlur.toFixed(2)}px)` : '';
            const fl = entry.baseFilterNoBlur
                ? (blurPart ? `${entry.baseFilterNoBlur} ${blurPart}` : entry.baseFilterNoBlur)
                : blurPart;
            const cp = ac.clipPath || '';
            if (op !== entry.lastOpacity) { entry.lastOpacity = op; el.style.opacity = op; }
            if (tr !== entry.lastTransform) { entry.lastTransform = tr; el.style.transform = tr; }
            if (fl !== entry.lastFilter) { entry.lastFilter = fl; el.style.filter = fl; }
            if (cp !== entry.lastClipPath) { entry.lastClipPath = cp; el.style.clipPath = cp; }

            // Inner media motion (Ken Burns, directional scrolls, ambient float/sway/breathe, or seamless tile)
            if (entry.innerTile) {
                const pos = `${(ac.tileX || 0).toFixed(1)}px ${(ac.tileY || 0).toFixed(1)}px`;
                if (pos !== entry.lastKbTransform) {
                    entry.lastKbTransform = pos;
                    entry.innerTile.style.backgroundPosition = pos;
                }
            } else if (entry.innerMedia) {
                const kb = (ac.kbScale !== 1 || ac.kbX !== 0 || ac.kbY !== 0 || (ac.kbRotDeg || 0) !== 0)
                    ? `translate3d(${ac.kbX.toFixed(2)}%, ${ac.kbY.toFixed(2)}%, 0) rotate(${(ac.kbRotDeg || 0).toFixed(2)}deg) scale(${ac.kbScale.toFixed(4)})`
                    : '';
                if (kb !== entry.lastKbTransform) {
                    entry.lastKbTransform = kb;
                    entry.innerMedia.style.transform = kb;
                }
            }

            // Deterministic slideshow indexing
            if (ac.clip.elementType === 'slideshow' && entry.innerMedia) {
                const imgs = (ac.clip.slideshowImages || []).filter(Boolean);
                if (imgs.length) {
                    const interval = Math.max(1, Number(ac.clip.slideshowIntervalSec) || 4);
                    const idx = Math.floor(ac.localTime / interval) % imgs.length;
                    if (entry.innerMedia.getAttribute('src') !== imgs[idx]) entry.innerMedia.src = imgs[idx];
                }
            }

            // Procedural pattern clip driven deterministically by timeline timestamp (zero idle RAFs)
            if (entry.pattern) {
                entry.pattern.renderAt(ac.localTime);
            }

            // Video synchronization using cached video refs
            if (entry.videos.length) {
                const targetRate = (ac.clip.videoRate || 1) * speedRate;
                const autoplay = ac.clip.videoAutoplay !== false;
                const loop = ac.clip.videoLoop !== false;
                for (const v of entry.videos) {
                    syncVideoElement(v, {
                        mediaTime: ac.mediaTime,
                        targetRate,
                        loop,
                        autoplay,
                        activeWindow: true,
                        playDriftTolerance: 0.6,
                        pauseDriftTolerance: 0.04
                    });
                }
            }
        }
        for (const [id, entry] of clipDomMap.entries()) {
            if (!activeClipIds || !activeClipIds.has(id)) {
                if (entry.active) {
                    entry.active = false;
                    entry.el.classList.remove('active');
                    for (const v of entry.videos) {
                        if (!v.paused) v.pause();
                    }
                }
            }
        }

        // 5. Cutout punchout mask
        applyCutoutMasks(frame.activeClips);

        // 6. Section Edge Characters / Mascots (deterministic per-frame transforms)
        if (edgeMascots.length) {
            for (const m of edgeMascots) {
                const nextT = engine.evaluateEdgeAttachmentTransform(m.att, currentTime);
                if (nextT !== m.lastTransform) {
                    m.lastTransform = nextT;
                    m.el.style.transform = nextT;
                }
            }
        }

        // 7. Background procedural pattern, background media scrolling/motion & ambient/inline videos
        if (bgPatterns.length) {
            for (const inst of bgPatterns) inst.renderAt(currentTime);
        }
        if (bgTileEl && frame.bgMotion) {
            const pos = `${(frame.bgMotion.tileX || 0).toFixed(1)}px ${(frame.bgMotion.tileY || 0).toFixed(1)}px`;
            if (pos !== lastBgMotionSig) {
                lastBgMotionSig = pos;
                bgTileEl.style.backgroundPosition = pos;
            }
        } else if (bgMediaEl && frame.bgMotion) {
            const bm = frame.bgMotion;
            const tr = (bm.scale !== 1 || bm.xPct !== 0 || bm.yPct !== 0 || bm.rotDeg !== 0)
                ? `translate3d(${bm.xPct.toFixed(2)}%, ${bm.yPct.toFixed(2)}%, 0) rotate(${bm.rotDeg.toFixed(2)}deg) scale(${bm.scale.toFixed(4)})`
                : '';
            if (tr !== lastBgMotionSig) {
                lastBgMotionSig = tr;
                bgMediaEl.style.transform = tr;
            }
        }
        syncAmbientVideos(currentTime);

        onTimeUpdate(frame);
        return frame;
    }

    // Async deterministic seek for Puppeteer + FFmpeg export (awaits video seeked + image decode)
    async function seekAsync(tSec) {
        const frame = renderAtTime(Number(tSec) || 0);
        if (!deterministic) return frame;
        const pending = [];
        const awaitVideo = v => {
            if (v.seeking || v.readyState < 2) {
                pending.push(new Promise(resolve => {
                    const done = () => {
                        v.removeEventListener('seeked', done);
                        v.removeEventListener('loadeddata', done);
                        v.removeEventListener('error', done);
                        resolve();
                    };
                    v.addEventListener('seeked', done, { once: true });
                    v.addEventListener('loadeddata', done, { once: true });
                    v.addEventListener('error', done, { once: true });
                    setTimeout(done, 400);
                }));
            }
        };
        for (const entry of bgVideos) awaitVideo(entry.el);
        for (const entry of inlineVideos) awaitVideo(entry.el);
        for (const entry of clipDomMap.values()) {
            if (!entry.active) continue;
            for (const v of entry.videos) awaitVideo(v);
            if (entry.innerMedia && entry.innerMedia.tagName === 'IMG' && !entry.innerMedia.complete) {
                pending.push(entry.innerMedia.decode?.().catch(() => {}) || Promise.resolve());
            }
        }
        if (pending.length) {
            await Promise.all(pending);
            await new Promise(r => requestAnimationFrame(() => r()));
        }
        return frame;
    }

    function tick(nowMs) {
        if (destroyed || !playing) {
            rafId = 0;
            return;
        }
        const dt = lastRafMs ? Math.min(0.1, (nowMs - lastRafMs) / 1000) : 0;
        lastRafMs = nowMs;
        const frame = renderAtTime(currentTime + dt * speedRate);
        if (frame?.ended && !project?.timing?.loop && project?.timing?.endBehavior !== 'loop') {
            pause();
            return;
        }
        rafId = requestAnimationFrame(tick);
    }

    function play() {
        if (destroyed || !project) return;
        pausedByHidden = false;
        if (solved && currentTime >= solved.totalDurationSec) currentTime = 0;
        const wasPlaying = playing;
        playing = true;
        lastRafMs = 0;
        if (!wasPlaying) onStateChange(true);
        if (!document.hidden || deterministic) {
            if (!rafId) rafId = requestAnimationFrame(tick);
            syncAmbientVideos(currentTime);
        } else {
            pausedByHidden = true;
        }
    }

    function pause() {
        pausedByHidden = false;
        const wasPlaying = playing;
        playing = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        for (const entry of bgVideos) { if (!entry.el.paused) entry.el.pause(); }
        for (const entry of inlineVideos) { if (!entry.el.paused) entry.el.pause(); }
        for (const entry of clipDomMap.values()) {
            for (const v of entry.videos) { if (!v.paused) v.pause(); }
        }
        if (wasPlaying) onStateChange(false);
    }

    function handleVisibilityChange() {
        if (destroyed || deterministic) return;
        if (document.hidden) {
            if (playing) {
                pausedByHidden = true;
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                for (const entry of bgVideos) { if (!entry.el.paused) entry.el.pause(); }
                for (const entry of inlineVideos) { if (!entry.el.paused) entry.el.pause(); }
                for (const entry of clipDomMap.values()) {
                    for (const v of entry.videos) { if (!v.paused) v.pause(); }
                }
            }
        } else if (pausedByHidden && playing) {
            pausedByHidden = false;
            lastRafMs = 0;
            if (!rafId) rafId = requestAnimationFrame(tick);
            syncAmbientVideos(currentTime);
        }
    }

    if (!deterministic) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    function seek(tSec) {
        return renderAtTime(Number(tSec) || 0);
    }

    function setSpeedRate(rate) {
        speedRate = Math.max(0.25, Math.min(4, Number(rate) || 1));
        for (const entry of bgVideos) {
            const r = (entry.cfg?.mediaRate || 1) * speedRate;
            try { entry.el.playbackRate = r; } catch {}
        }
        for (const entry of inlineVideos) {
            const r = (entry.cfg?.mediaRate || 1) * speedRate;
            try { entry.el.playbackRate = r; } catch {}
        }
        for (const entry of clipDomMap.values()) {
            const r = (entry.clip?.videoRate || 1) * speedRate;
            for (const v of entry.videos) { try { v.playbackRate = r; } catch {} }
        }
    }

    function setProject(nextProject, opts = {}) {
        project = engine.normalizeProject(nextProject);
        if (opts.variables !== undefined) variables = opts.variables || {};
        if (opts.bgOverride !== undefined) bgOverride = opts.bgOverride;
        if (opts.chromaOverride !== undefined) chromaOverride = opts.chromaOverride;
        buildScene();
    }

    function setVariables(nextVars, { skipRebuild = false } = {}) {
        variables = nextVars || {};
        if (project && !skipRebuild) buildScene();
    }

    function remeasureAndResolve() {
        if (!project || !solved) return solved;
        syncZonesAndMeasure();
        onSolved(solved);
        renderAtTime(currentTime);
        return solved;
    }

    // Static PNG export helpers (Full Tall Sheet & Per-Section PNGs)
    async function awaitImagesIn(root) {
        const imgs = [...root.querySelectorAll('img')];
        if (!imgs.length) return;
        await Promise.all(imgs.map(img => (
            img.complete ? Promise.resolve() : (img.decode?.().catch(() => {}) || new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 2000); }))
        )));
    }

    async function prepareStaticSheet() {
        if (!project) return { width: 1920, height: 1080 };
        pause();
        viewport.classList.add('cs-static-mode');
        creditsColWrap.style.webkitMaskImage = '';
        creditsColWrap.style.maskImage = '';
        behindLayer.innerHTML = '';
        sideLayer.innerHTML = '';
        aboveLayer.innerHTML = '';
        creditsCol.innerHTML = '';
        creditsCol.style.width = `${Math.min(project.canvas.width, project.theme?.maxColumnWidth || 1180)}px`;
        creditsCol.style.left = 'auto';
        creditsCol.style.padding = `${project.theme?.paddingV ?? 48}px 0`;
        for (const blk of (project.blocks || [])) {
            if (!blk.enabled) continue;
            creditsCol.appendChild(buildBlockElement(blk));
        }
        await awaitImagesIn(creditsCol);
        applyAutoFitNames(creditsCol);
        return { width: project.canvas.width, height: Math.max(project.canvas.height, creditsCol.scrollHeight + 80) };
    }

    function listStaticBlocks() {
        if (!project) return [];
        return (project.blocks || [])
            .filter(b => b.enabled !== false && b.type !== 'spacer')
            .map(b => ({ id: b.id, title: b.title, type: b.type }));
    }

    async function prepareStaticBlock(blockId) {
        if (!project) return { width: 1920, height: 1080 };
        const blk = (project.blocks || []).find(b => b.id === blockId);
        if (!blk) return { width: project.canvas.width, height: project.canvas.height };
        pause();
        viewport.classList.add('cs-static-mode');
        creditsColWrap.style.webkitMaskImage = '';
        creditsColWrap.style.maskImage = '';
        behindLayer.innerHTML = '';
        sideLayer.innerHTML = '';
        aboveLayer.innerHTML = '';
        creditsCol.innerHTML = '';
        creditsCol.style.width = `${Math.min(project.canvas.width, project.theme?.maxColumnWidth || 1180)}px`;
        creditsCol.style.left = 'auto';
        creditsCol.style.minHeight = `${project.canvas.height}px`;
        creditsCol.style.display = 'flex';
        creditsCol.style.alignItems = 'center';
        creditsCol.style.justifyContent = 'center';
        creditsCol.appendChild(buildBlockElement(blk));
        await awaitImagesIn(creditsCol);
        applyAutoFitNames(creditsCol);
        return { width: project.canvas.width, height: Math.max(project.canvas.height, creditsCol.scrollHeight + 80) };
    }

    function destroy() {
        destroyed = true;
        if (!deterministic) {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
        pause();
        disposePatterns();
        releaseVideosIn(viewport);
        bgVideos = [];
        inlineVideos = [];
        edgeMascots = [];
        bgMediaEl = null;
        bgTileEl = null;
        mountEl.innerHTML = '';
    }

    return {
        viewport,
        setProject,
        setVariables,
        play,
        pause,
        seek,
        seekAsync,
        setSpeedRate,
        isPlaying: () => playing,
        getTime: () => currentTime,
        getSolved: () => solved,
        getProject: () => project,
        refit: () => applyAutoFitNames(creditsCol),
        remeasureAndResolve,
        prepareStaticSheet,
        listStaticBlocks,
        prepareStaticBlock,
        destroy
    };
}
