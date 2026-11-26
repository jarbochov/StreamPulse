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
        .replace(/"/g, '&quot;');
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
        return fallback !== undefined ? String(fallback) : '';
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

function applyElementBorder(el, opts = {}, vars = {}) {
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

    // Leverage shared OverlayShared border styling when available (all 31 styles + 17 animations)
    const os = window.OverlayShared;
    if (os && typeof os.applyBoxBorder === 'function') {
        try {
            os.applyBoxBorder(el, {
                borderStyle: style,
                borderWidth: width,
                borderColor: c1,
                borderColor2: c2,
                borderRadius: radius,
                borderAnimation: anim,
                borderAnimationSpeed: speed
            });
            return;
        } catch { /* fallback below */ }
    }

    const cssNative = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'].includes(style) ? style : 'solid';
    el.style.border = `${width}px ${cssNative} ${c1}`;
    if (style === 'neon-tube' || style === 'double-ring') {
        el.style.boxShadow = `0 0 ${width * 3}px ${c1}, inset 0 0 ${width * 1.5}px ${c2}`;
    } else if (style === 'corner-brackets') {
        el.style.border = `${Math.max(1, Math.round(width * 0.5))}px solid ${c1}44`;
        el.style.boxShadow = `inset 0 0 0 ${width}px transparent`;
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
    const onClipSelect = typeof options.onClipSelect === 'function' ? options.onClipSelect : () => {};

    let project = null;
    let variables = options.variables || {};
    let solved = null;
    let currentTime = 0;
    let playing = false;
    let speedRate = 1;
    let lastRafMs = 0;
    let rafId = 0;
    let bgOverride = options.bgOverride || '';
    let chromaOverride = options.chromaOverride || '';
    let activePatterns = [];
    let destroyed = false;
    let lastCutoutSig = '';

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

    function disposePatterns() {
        for (const p of activePatterns) {
            try { p.destroy?.(); } catch {}
        }
        activePatterns = [];
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
        disposePatterns();
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
            host.style.opacity = String(bg.patternOpacity ?? 0.55);
            bgLayer.appendChild(host);
            if (window.StreamPulsePatterns && typeof window.StreamPulsePatterns.mount === 'function') {
                try {
                    const inst = window.StreamPulsePatterns.mount(host, {
                        preset: bg.patternPreset || 'constellation',
                        palette: bg.patternPalette || 'midnight',
                        speed: bg.patternSpeed ?? 0.4,
                        paused: deterministic
                    });
                    if (inst) activePatterns.push(inst);
                } catch { /* fallback to solid bg */ }
            }
            return;
        }
        if ((effectiveType === 'image' || effectiveType === 'video') && bg.mediaUrl) {
            bgLayer.style.background = resolveColorOrVar(bg.color1, variables, '#07080CFF');
            const media = document.createElement(effectiveType === 'video' ? 'video' : 'img');
            media.className = 'cs-bg-media';
            media.src = bg.mediaUrl;
            media.style.opacity = String(bg.mediaOpacity ?? 0.45);
            media.style.objectFit = bg.mediaFit === 'contain' ? 'contain' : 'cover';
            if (bg.mediaBlur > 0) media.style.filter = `blur(${bg.mediaBlur}px)`;
            if (effectiveType === 'video') {
                media.muted = true;
                media.loop = true;
                media.playsInline = true;
                media.preload = 'auto';
                if (!deterministic) media.play().catch(() => {});
            } else {
                media.crossOrigin = 'anonymous';
            }
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
        el.style.textAlign = st.align || 'center';

        const inner = document.createElement('div');
        inner.className = 'cs-block-inner';
        if (st.bgColor && (st.bgOpacity > 0 || st.borderWidth > 0)) {
            inner.style.padding = '28px 36px';
            inner.style.background = resolveColorOrVar(st.bgColor, variables, 'transparent');
            inner.style.borderRadius = `${st.bgRadius || 12}px`;
        }
        applyElementBorder(inner, {
            borderStyle: st.borderStyle,
            borderWidth: st.borderWidth,
            borderColor: st.borderColor,
            borderColor2: st.borderColor2,
            borderRadius: st.bgRadius,
            borderAnim: st.borderAnim
        }, variables);

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
                target.appendChild(sub);
            }
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
                for (const line of rawLines) {
                    const cell = document.createElement('div');
                    cell.className = 'cs-name-fit';
                    cell.innerHTML = `<span class="cs-name-fit-sizer"><span class="cs-name-fit-text">${escHtml(line)}</span></span>`;
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
                const m = document.createElement(block.mediaKind === 'video' ? 'video' : 'img');
                m.src = block.mediaUrl;
                m.style.width = `${block.mediaWidth || 520}px`;
                if (block.mediaHeight > 0) m.style.height = `${block.mediaHeight}px`;
                m.style.borderRadius = `${block.mediaRadius ?? 12}px`;
                if (block.mediaKind === 'video') {
                    m.muted = true;
                    m.loop = true;
                    m.playsInline = true;
                    m.preload = 'auto';
                } else {
                    m.crossOrigin = 'anonymous';
                }
                wrap.appendChild(m);
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
                const m = document.createElement(block.mediaKind === 'video' ? 'video' : 'img');
                m.src = block.mediaUrl;
                m.style.width = '100%';
                if (block.mediaHeight > 0) m.style.height = `${block.mediaHeight}px`;
                m.style.borderRadius = `${block.mediaRadius ?? 12}px`;
                if (block.mediaKind === 'video') {
                    m.muted = true;
                    m.loop = true;
                    m.playsInline = true;
                } else {
                    m.crossOrigin = 'anonymous';
                }
                mediaSide.appendChild(m);
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

        if (clip.shadow) {
            el.style.boxShadow = '0 22px 60px rgba(0, 0, 0, 0.55)';
        }
        applyElementBorder(el, clip, variables);

        const filters = [];
        if ((clip.filterBrightness ?? 100) !== 100) filters.push(`brightness(${clip.filterBrightness}%)`);
        if ((clip.filterContrast ?? 100) !== 100) filters.push(`contrast(${clip.filterContrast}%)`);
        if ((clip.filterSaturate ?? 100) !== 100) filters.push(`saturate(${clip.filterSaturate}%)`);
        if ((clip.filterGrayscale ?? 0) > 0) filters.push(`grayscale(${clip.filterGrayscale}%)`);
        if ((clip.filterBlur ?? 0) > 0) filters.push(`blur(${clip.filterBlur}px)`);
        el.dataset.baseFilter = filters.join(' ');

        const type = clip.elementType || 'image';

        if (type === 'cutout') {
            // Cutout clips punch a hole in behind/background layers; invisible fill itself
            el.style.background = interactive ? 'rgba(56, 189, 248, 0.08)' : 'transparent';
            el.style.border = interactive ? '2px dashed rgba(56, 189, 248, 0.65)' : 'none';
        } else if (type === 'image' || type === 'video') {
            const wrap = document.createElement('div');
            wrap.className = 'cs-clip-media-wrap';
            if (clip.mediaUrl) {
                if (clip.mediaFit === 'contain-blur') {
                    const bgM = document.createElement(type === 'video' ? 'video' : 'img');
                    bgM.className = 'cs-clip-blur-bg';
                    bgM.src = clip.mediaUrl;
                    if (type === 'video') { bgM.muted = true; bgM.loop = clip.videoLoop !== false; bgM.playsInline = true; }
                    else bgM.crossOrigin = 'anonymous';
                    wrap.appendChild(bgM);
                }
                const media = document.createElement(type === 'video' ? 'video' : 'img');
                media.className = clip.mediaFit === 'contain-blur' ? 'cs-clip-fg-contain cs-clip-media-el' : 'cs-clip-media-el';
                media.src = clip.mediaUrl;
                if (clip.mediaFit !== 'contain-blur') {
                    media.style.objectFit = clip.mediaFit || 'cover';
                }
                if (type === 'video') {
                    media.muted = clip.videoMuted !== false;
                    media.loop = clip.videoLoop !== false;
                    media.playsInline = true;
                    media.preload = 'auto';
                    media.playbackRate = clip.videoRate || 1;
                } else {
                    media.crossOrigin = 'anonymous';
                }
                wrap.appendChild(media);
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
            img.crossOrigin = 'anonymous';
            img.style.objectFit = clip.mediaFit === 'contain' ? 'contain' : 'cover';
            if (imgs.length) img.src = imgs[0];
            wrap.appendChild(img);
            el.appendChild(wrap);
        } else if (type === 'pattern') {
            const host = document.createElement('div');
            host.className = 'cs-clip-media-wrap';
            el.appendChild(host);
            if (window.StreamPulsePatterns && typeof window.StreamPulsePatterns.mount === 'function') {
                try {
                    const inst = window.StreamPulsePatterns.mount(host, {
                        preset: clip.patternPreset || 'constellation',
                        palette: clip.patternPalette || 'midnight',
                        speed: clip.patternSpeed ?? 0.5,
                        paused: deterministic
                    });
                    if (inst) activePatterns.push(inst);
                } catch {}
            }
        } else if (type === 'icon') {
            const ic = document.createElement('i');
            ic.className = clip.iconClass || 'fa-solid fa-star';
            ic.style.fontSize = `${Math.max(24, clip.fontSize || 96)}px`;
            ic.style.color = resolveColorOrVar(clip.iconColor, variables, '#E5C07BFF');
            el.appendChild(ic);
        } else if (type === 'text') {
            const body = document.createElement('div');
            body.className = 'cs-clip-text-body';
            body.style.fontFamily = clip.fontFamily ? `'${clip.fontFamily}', sans-serif` : 'var(--cs-heading-font)';
            body.style.fontSize = `${clip.fontSize || 36}px`;
            body.style.fontWeight = clip.fontWeight || '700';
            body.style.textAlign = clip.textAlign || 'center';
            body.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            body.textContent = resolvePlaceholders(clip.text || 'Text Overlay', variables);
            el.appendChild(body);
        } else if (type === 'badge') {
            const badge = document.createElement('div');
            badge.className = 'cs-clip-badge';
            badge.style.background = clip.fillGradient
                ? `linear-gradient(${clip.fillAngle ?? 135}deg, ${resolveColorOrVar(clip.fillColor, variables)}, ${resolveColorOrVar(clip.fillColor2, variables)})`
                : resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            badge.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            badge.style.fontSize = `${clip.fontSize || 24}px`;
            badge.innerHTML = `${clip.badgeIcon ? `<i class="${escHtml(clip.badgeIcon)}" style="color:${escHtml(resolveColorOrVar(clip.iconColor, variables, '#E5C07BFF'))}"></i>` : ''}<span>${escHtml(resolvePlaceholders(clip.badgeLabel || 'FEATURED', variables))}</span>`;
            el.appendChild(badge);
        } else if (type === 'counter') {
            const box = document.createElement('div');
            box.className = 'cs-clip-counter';
            box.style.background = resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            box.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            box.style.fontSize = `${clip.fontSize || 32}px`;
            box.innerHTML = `<div class="cs-clip-counter-val">${escHtml(resolvePlaceholders(clip.counterValue || '0', variables))}</div><div class="cs-clip-counter-lbl">${escHtml(resolvePlaceholders(clip.counterLabel || 'TOTAL', variables))}</div>`;
            el.appendChild(box);
        } else if (type === 'meter') {
            const valNum = Number(resolvePlaceholders(clip.counterValue || '75', variables)) || 0;
            const maxNum = Math.max(1, Number(clip.counterMax) || 100);
            const pct = Math.max(0, Math.min(100, (valNum / maxNum) * 100));
            const box = document.createElement('div');
            box.className = 'cs-clip-meter';
            box.style.background = resolveColorOrVar(clip.fillColor, variables, '#111827CC');
            box.style.color = resolveColorOrVar(clip.textColor, variables, '#FFFFFFFF');
            box.style.fontSize = `${clip.fontSize || 28}px`;
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
        return el;
    }

    function applyAutoFitNames(root = creditsCol) {
        const entries = root.querySelectorAll('.cs-name-fit');
        if (!entries.length) return;
        for (const el of entries) {
            const sizer = el.querySelector('.cs-name-fit-sizer');
            const txt = el.querySelector('.cs-name-fit-text');
            if (!sizer || !txt) continue;
            sizer.style.width = '';
            txt.style.transform = '';
            txt.style.transformOrigin = 'left center';
            const avail = Math.max(20, el.clientWidth - 6);
            const measured = Math.max(txt.scrollWidth, txt.getBoundingClientRect().width);
            if (measured > avail + 1) {
                const sx = Math.max(0.55, (avail / measured) * 0.985);
                sizer.style.width = `${Math.max(1, measured * sx)}px`;
                txt.style.transform = `scaleX(${sx})`;
            }
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

    function buildScene() {
        if (!project) return;
        ensureFontAwesome();
        ensureFontsLoaded(project);
        applyThemeCssVars();
        applyEdgeFadeMask();
        buildBackground();

        creditsCol.innerHTML = '';
        behindLayer.innerHTML = '';
        sideLayer.innerHTML = '';
        aboveLayer.innerHTML = '';
        runDomMap.clear();
        cardDomMap.clear();
        clipDomMap.clear();
        lastCutoutSig = '';

        // Initial timeline pass to group runs & cards
        const prelim = engine.solveTimeline(project);
        const canvasW = project.canvas.width;
        const maxColW = Math.min(canvasW, project.theme?.maxColumnWidth || 1180);
        const reflowCfg = project.theme?.autoReflow || {};
        const isPerSection = reflowCfg.enabled !== false && reflowCfg.mode !== 'glide';
        const splitRatio = Math.max(35, Math.min(65, Number(reflowCfg.splitRatio) || 50)) / 100;
        const gapPx = Number(reflowCfg.gapPx) || 48;
        const sideColW = Math.max(320, Math.round(canvasW * splitRatio - gapPx * 0.5));

        creditsCol.style.width = isPerSection ? `${canvasW}px` : `${maxColW}px`;

        const applyBlockZoneLayout = (blkEl, zone, clearanceTopPx = 0) => {
            blkEl.classList.remove('cs-zone-center', 'cs-zone-left', 'cs-zone-right');
            blkEl.style.marginTop = clearanceTopPx > 0 ? `${clearanceTopPx}px` : '';
            blkEl.style.marginRight = '';
            blkEl.style.marginLeft = '';
            if (!isPerSection) {
                blkEl.style.width = '100%';
                return;
            }
            const z = zone || 'center';
            blkEl.classList.add(`cs-zone-${z}`);
            const safeOuterPx = Math.round(canvasW * 0.045);
            if (z === 'center') {
                blkEl.style.width = `${maxColW}px`;
            } else {
                const availSide = Math.max(320, Math.min(maxColW, sideColW - safeOuterPx));
                blkEl.style.width = `${availSide}px`;
                blkEl.style.paddingLeft = '24px';
                blkEl.style.paddingRight = '24px';
                if (z === 'right') blkEl.style.marginRight = `${safeOuterPx}px`;
                if (z === 'left') blkEl.style.marginLeft = `${safeOuterPx}px`;
            }
        };

        for (const seg of prelim.segments) {
            if (seg.kind === 'crawl') {
                const runEl = document.createElement('div');
                runEl.className = 'cs-crawl-run';
                runEl.dataset.runId = seg.id;
                for (const bm of seg.blockMetrics) {
                    const blkEl = buildBlockElement(bm.block);
                    applyBlockZoneLayout(blkEl, bm.zone, bm.clearanceTopPx);
                    runEl.appendChild(blkEl);
                }
                creditsCol.appendChild(runEl);
                runDomMap.set(seg.id, runEl);
            } else if (seg.kind === 'card') {
                const cardWrap = document.createElement('div');
                cardWrap.className = `cs-card-layer cs-zone-${seg.zone || 'center'}`;
                cardWrap.dataset.blockId = seg.blockId;
                const blkEl = buildBlockElement(seg.block);
                applyBlockZoneLayout(blkEl, seg.zone, 0);
                cardWrap.appendChild(blkEl);
                creditsCol.appendChild(cardWrap);
                cardDomMap.set(seg.blockId, cardWrap);
            }
        }

        // Build all track clip nodes
        for (const track of (project.tracks || [])) {
            if (!track.visible) continue;
            const host = track.layer === 'behind' ? behindLayer : (track.layer === 'above' ? aboveLayer : sideLayer);
            for (const clip of (track.clips || [])) {
                if (clip.enabled === false) continue;
                const clipEl = buildClipElement(track, clip);
                host.appendChild(clipEl);
                clipDomMap.set(clip.id, clipEl);
            }
        }

        // Auto-fit 2-4 column names and re-solve with actual DOM heights!
        applyAutoFitNames(creditsCol);
        const measured = measureCrawlBlockHeights();
        solved = engine.solveTimeline(project, measured);

        // Sync finalized per-section zones & computed clearance gaps after real DOM height pass
        if (isPerSection) {
            for (const seg of solved.segments) {
                if (seg.kind === 'crawl') {
                    const runEl = runDomMap.get(seg.id);
                    if (!runEl) continue;
                    for (const bm of seg.blockMetrics) {
                        const blkEl = runEl.querySelector(`:scope > .cs-block[data-block-id="${bm.blockId}"]`);
                        if (blkEl) applyBlockZoneLayout(blkEl, bm.zone, bm.clearanceTopPx);
                    }
                } else if (seg.kind === 'card') {
                    const cardWrap = cardDomMap.get(seg.blockId);
                    if (cardWrap) {
                        cardWrap.classList.remove('cs-zone-center', 'cs-zone-left', 'cs-zone-right');
                        cardWrap.classList.add(`cs-zone-${seg.zone || 'center'}`);
                        const blkEl = cardWrap.querySelector(':scope > .cs-block');
                        if (blkEl) applyBlockZoneLayout(blkEl, seg.zone, 0);
                    }
                }
            }
            applyAutoFitNames(creditsCol);
        }

        onSolved(solved);
        renderAtTime(currentTime);
    }

    function renderAtTime(tSec) {
        if (!project || !solved) return null;
        currentTime = Math.max(0, tSec);
        const frame = engine.evaluateFrame(currentTime, solved, project);

        // 1. Dynamic Auto-Reflow of the Credits Column
        const canvasW = project.canvas.width;
        const maxColW = Math.min(canvasW, project.theme?.maxColumnWidth || 1180);
        const gapPx = project.theme?.autoReflow?.gapPx ?? 48;
        if (frame.reflow.mode === 'per-section' && project.theme?.autoReflow?.enabled !== false) {
            creditsCol.style.width = `${canvasW}px`;
            creditsCol.style.left = '50%';
        } else {
            const targetColW = Math.min(maxColW, Math.max(320, Math.round(canvasW * frame.reflow.widthRatio - gapPx)));
            creditsCol.style.width = `${targetColW}px`;
            creditsCol.style.left = `${frame.reflow.centerXPercent.toFixed(3)}%`;
        }

        // 2. Crawl Runs (GPU translate3d)
        const activeRunIds = new Set();
        for (const r of frame.activeRuns) {
            activeRunIds.add(r.runId);
            const el = runDomMap.get(r.runId);
            if (el) {
                el.classList.add('active');
                el.style.transform = `translate3d(0, ${r.scrollY.toFixed(2)}px, 0)`;
            }
        }
        for (const [id, el] of runDomMap.entries()) {
            if (!activeRunIds.has(id)) el.classList.remove('active');
        }

        // 3. Featured / Timed Cards
        const activeCardIds = new Set();
        for (const card of frame.activeCards) {
            activeCardIds.add(card.blockId);
            const el = cardDomMap.get(card.blockId);
            if (el) {
                el.classList.add('active');
                el.style.opacity = String(card.opacity.toFixed(4));
                el.style.transform = `translate3d(${card.translateX.toFixed(2)}px, ${card.translateY.toFixed(2)}px, 0) scale(${card.scale.toFixed(4)})`;
                el.style.filter = card.blur > 0.05 ? `blur(${card.blur.toFixed(2)}px)` : '';
                el.style.clipPath = card.clipPath || '';
            }
        }
        for (const [id, el] of cardDomMap.entries()) {
            if (!activeCardIds.has(id)) el.classList.remove('active');
        }

        // 4. Floating / Side / Background Track Clips
        const activeClipIds = new Set();
        for (const ac of frame.activeClips) {
            activeClipIds.add(ac.clip.id);
            const el = clipDomMap.get(ac.clip.id);
            if (!el) continue;
            el.classList.add('active');
            el.style.opacity = String(ac.opacity.toFixed(4));
            const rot = ac.clip.rotation || 0;
            el.style.transform = `translate3d(${ac.translateX.toFixed(2)}px, ${ac.translateY.toFixed(2)}px, 0) rotate(${rot}deg) scale(${ac.scale.toFixed(4)})`;
            const baseF = el.dataset.baseFilter || '';
            const blurF = ac.blur > 0.05 ? `blur(${ac.blur.toFixed(2)}px)` : '';
            el.style.filter = [baseF, blurF].filter(Boolean).join(' ');
            el.style.clipPath = ac.clipPath || '';

            // Ken Burns inner transform
            const innerMedia = el.querySelector('.cs-clip-media-el');
            if (innerMedia && (ac.kbScale !== 1 || ac.kbX !== 0 || ac.kbY !== 0)) {
                innerMedia.style.transform = `translate3d(${ac.kbX.toFixed(2)}%, ${ac.kbY.toFixed(2)}%, 0) scale(${ac.kbScale.toFixed(4)})`;
            }

            // Deterministic slideshow indexing
            if (ac.clip.elementType === 'slideshow' && innerMedia) {
                const imgs = (ac.clip.slideshowImages || []).filter(Boolean);
                if (imgs.length) {
                    const interval = Math.max(1, Number(ac.clip.slideshowIntervalSec) || 4);
                    const idx = Math.floor(ac.localTime / interval) % imgs.length;
                    if (innerMedia.getAttribute('src') !== imgs[idx]) innerMedia.src = imgs[idx];
                }
            }

            // Video synchronization
            if (ac.clip.elementType === 'video') {
                const vids = el.querySelectorAll('video');
                for (const v of vids) {
                    const targetT = v.duration && Number.isFinite(v.duration)
                        ? (ac.clip.videoLoop !== false ? (ac.mediaTime % v.duration) : Math.min(v.duration, ac.mediaTime))
                        : ac.mediaTime;
                    if (deterministic || !playing) {
                        if (!v.paused) v.pause();
                        if (Math.abs((v.currentTime || 0) - targetT) > 0.04 && v.readyState >= 1) {
                            try { v.currentTime = targetT; } catch {}
                        }
                    } else {
                        if (v.paused) v.play().catch(() => {});
                        if (Math.abs((v.currentTime || 0) - targetT) > 0.6 && v.readyState >= 1) {
                            try { v.currentTime = targetT; } catch {}
                        }
                    }
                }
            }
        }
        for (const [id, el] of clipDomMap.entries()) {
            if (!activeClipIds.has(id)) {
                el.classList.remove('active');
                for (const v of el.querySelectorAll('video')) {
                    if (!v.paused) v.pause();
                }
            }
        }

        // 5. Cutout punchout mask
        applyCutoutMasks(frame.activeClips);

        // 6. Step pattern canvases deterministically during export
        if (deterministic && activePatterns.length) {
            for (const inst of activePatterns) {
                try { inst.renderAt?.(currentTime * 1000); } catch {}
            }
        }

        onTimeUpdate(frame);
        return frame;
    }

    function tick(nowMs) {
        if (destroyed || !playing) {
            rafId = 0;
            return;
        }
        if (document.hidden && !deterministic) {
            lastRafMs = nowMs;
            rafId = requestAnimationFrame(tick);
            return;
        }
        const dt = lastRafMs ? Math.min(0.1, (nowMs - lastRafMs) / 1000) : 0;
        lastRafMs = nowMs;
        const frame = renderAtTime(currentTime + dt * speedRate);
        if (frame?.ended && !project?.timing?.loop && project?.timing?.endBehavior !== 'loop') {
            playing = false;
            rafId = 0;
            return;
        }
        rafId = requestAnimationFrame(tick);
    }

    function play() {
        if (destroyed || !project) return;
        if (solved && currentTime >= solved.totalDurationSec) currentTime = 0;
        playing = true;
        lastRafMs = 0;
        if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function pause() {
        playing = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        for (const v of viewport.querySelectorAll('video')) {
            if (!v.paused) v.pause();
        }
    }

    function seek(tSec) {
        return renderAtTime(Number(tSec) || 0);
    }

    function setSpeedRate(rate) {
        speedRate = Math.max(0.25, Math.min(4, Number(rate) || 1));
    }

    function setProject(nextProject, opts = {}) {
        project = engine.normalizeProject(nextProject);
        if (opts.bgOverride !== undefined) bgOverride = opts.bgOverride;
        if (opts.chromaOverride !== undefined) chromaOverride = opts.chromaOverride;
        buildScene();
    }

    function setVariables(nextVars) {
        variables = nextVars || {};
        if (project) buildScene();
    }

    // Static PNG export helpers (Full Tall Sheet & Per-Section PNGs)
    function prepareStaticSheet() {
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
        applyAutoFitNames(creditsCol);
        return { width: project.canvas.width, height: Math.max(project.canvas.height, creditsCol.scrollHeight + 80) };
    }

    function listStaticBlocks() {
        if (!project) return [];
        return (project.blocks || [])
            .filter(b => b.enabled !== false && b.type !== 'spacer')
            .map(b => ({ id: b.id, title: b.title, type: b.type }));
    }

    function prepareStaticBlock(blockId) {
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
        applyAutoFitNames(creditsCol);
        return { width: project.canvas.width, height: Math.max(project.canvas.height, creditsCol.scrollHeight + 80) };
    }

    function destroy() {
        destroyed = true;
        pause();
        disposePatterns();
        mountEl.innerHTML = '';
    }

    return {
        viewport,
        setProject,
        setVariables,
        play,
        pause,
        seek,
        setSpeedRate,
        isPlaying: () => playing,
        getTime: () => currentTime,
        getSolved: () => solved,
        getProject: () => project,
        refit: () => applyAutoFitNames(creditsCol),
        prepareStaticSheet,
        listStaticBlocks,
        prepareStaticBlock,
        destroy
    };
}
