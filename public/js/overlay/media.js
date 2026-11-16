
import { loadGoogleFont } from './fonts.js';
import { ensureFontAwesome, sanitizeIconClass } from './icons.js';
import { applyBorderEffects, applyTextAnimation, decorationStyle, gradientStyle, textEffectStyle } from './styles.js';
import { expandVariables, resolveColorToken, resolveStyleVariables } from './variables.js';
import numericBindings from '../../../shared/numeric-bindings.cjs';
import { trackerMax, linkedSourceFields } from '../../../shared/variable-links.cjs';

function parseYouTubeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;
    const str = urlStr.trim();
    try {
        const u = new URL(str, typeof location !== 'undefined' ? location.href : 'http://localhost:3000/');
        const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
        const timeParam = u.searchParams.get('t') || u.searchParams.get('start');
        let start = 0;
        if (timeParam) {
            const secMatch = timeParam.match(/^(?:(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?|(\d+))$/);
            if (secMatch) {
                if (secMatch[4]) start = Number(secMatch[4]);
                else start = (Number(secMatch[1] || 0) * 3600) + (Number(secMatch[2] || 0) * 60) + Number(secMatch[3] || 0);
            }
        }
        if (host === 'youtu.be') {
            const id = u.pathname.slice(1).split('/')[0].split('?')[0];
            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                return { type: 'video', id, list: u.searchParams.get('list') || null, start };
            }
        } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
            if (u.pathname === '/watch') {
                const id = u.searchParams.get('v');
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                    return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                }
            } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/live/') || u.pathname.startsWith('/embed/')) {
                const parts = u.pathname.split('/').filter(Boolean);
                const id = parts[1];
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                    return { type: 'video', id, list: u.searchParams.get('list') || null, start };
                }
            } else if (u.pathname === '/playlist' && u.searchParams.get('list')) {
                return { type: 'playlist', list: u.searchParams.get('list') };
            }
        }
    } catch { /* fallback to regex */ }

    const match = str.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|live\/|embed\/))([a-zA-Z0-9_-]{11})/i);
    if (match) {
        const listMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
        const timeMatch = str.match(/[?&](?:t|start)=([0-9hms]+)/i);
        let start = 0;
        if (timeMatch) {
            const m = timeMatch[1].match(/^(?:(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?|(\d+))$/);
            if (m) {
                if (m[4]) start = Number(m[4]);
                else start = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
            }
        }
        return { type: 'video', id: match[1], list: listMatch ? listMatch[1] : null, start };
    }
    const plMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (plMatch && /youtube/i.test(str)) {
        return { type: 'playlist', list: plMatch[1] };
    }
    return null;
}

// Embeds saved as http://localhost:PORT/... break when the overlay is opened from another device; point them at the current origin.
// YouTube links (watch, shorts, live, share) are converted to privacy-enhanced embed URLs.
function embedUrl(url, options = {}) {
    if (!url) return '';
    try {
        const yt = parseYouTubeUrl(url);
        if (yt) {
            const params = new URLSearchParams();
            if (options.autoplay !== false) params.set('autoplay', '1');
            else params.set('autoplay', '0');
            params.set('enablejsapi', '1');
            if (options.loop !== false) {
                params.set('loop', '1');
                if (yt.id) params.set('playlist', yt.id);
            }
            if (options.controls === false) params.set('controls', '0');
            if (options.sound === false || options.mute === true || options.autoplay !== false) params.set('mute', '1');
            params.set('playsinline', '1');
            if (yt.list && yt.type !== 'playlist') params.set('list', yt.list);
            if (yt.start) params.set('start', String(yt.start));
            try {
                if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
                    params.set('origin', location.origin);
                }
            } catch {}
            return yt.type === 'playlist'
                ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(yt.list)}&${params.toString()}`
                : `https://www.youtube-nocookie.com/embed/${yt.id}?${params.toString()}`;
        }

        const parsed = new URL(url, location.href);
        if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && parsed.host !== location.host) {
            parsed.protocol = location.protocol;
            parsed.host = location.host;
            return parsed.toString();
        }
    } catch { /* leave invalid URLs untouched */ }
    return url;
}

function cleanupGroupStrip(container) {
    if (!container) return;
    if (container._igResizeFrame && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(container._igResizeFrame);
        container._igResizeFrame = 0;
    }
    if (container._igResizeObserver) {
        container._igResizeObserver.disconnect();
        container._igResizeObserver = null;
    }
    if (typeof container.querySelectorAll !== 'function') return;
    container.querySelectorAll('.sp-image-group-item, .sp-image-group-avatar, .sp-image-group-field').forEach(node => {
        if (node._borderObserver) { node._borderObserver.disconnect(); node._borderObserver = null; }
        if (node._textAnimHandle?.stop) { try { node._textAnimHandle.stop(); } catch {} node._textAnimHandle = null; }
        node._textAnimWrap = null;
        node._textAnimSig = '';
    });
}

function resolveTieredValue(member, baseKey, level, isImage = false) {
    if (!member || !baseKey) return '';
    const vals = member.values || {};
    if (level >= 1 && Array.isArray(member.tiers) && member.tiers.length) {
        const tierObj = member.tiers.find(t => Number(t.level) === level);
        if (tierObj) {
            const direct = isImage ? tierObj.image : (tierObj.label || tierObj.description);
            if (direct && String(direct).trim()) return String(direct).trim();
        }
    }
    const baseVal = String(vals[baseKey] ?? member[baseKey] ?? '').trim();
    return baseVal;
}

function resolveGroupMembers(setId, status = {}, onlySelected = false, filterMode = 'inGroup') {
    if (!setId) return [];
    const sets = status?.variableSets || [];
    const setObj = sets.find(s => s && s.id === setId);
    if (onlySelected && !setObj) return [];
    let members = [];
    const includeAll = filterMode === 'all' || filterMode === 'checklist';
    if (setObj && Array.isArray(setObj.roster)) {
        members = includeAll ? setObj.roster.filter(Boolean) : setObj.roster.filter(r => r && r.inGroup !== false);
    } else if (setObj && Array.isArray(setObj.entries)) {
        members = includeAll ? setObj.entries.filter(Boolean) : setObj.entries.filter(e => e && e.inGroup === true);
    } else if (Array.isArray(status?.customVars)) {
        const rawVar = status.customVars.find(v => v && v.name === `${setId}_group_members`);
        if (rawVar?.value) {
            try {
                const parsed = JSON.parse(rawVar.value);
                if (Array.isArray(parsed)) members = parsed;
            } catch {}
        }
    }
    if (onlySelected && filterMode !== 'checklist' && setObj) {
        const activeIds = new Set();
        const usesSlots = typeof setObj.slotsCount === 'number'
            ? setObj.slotsCount > 0
            : (Array.isArray(setObj.slots) && setObj.slots.length > 0);
        if (usesSlots && Array.isArray(setObj.slots)) {
            for (const s of setObj.slots) {
                const sid = typeof s === 'string' ? s : (s?.entryId || s?.id);
                if (sid) activeIds.add(sid);
            }
        } else {
            if (setObj.activeEntry) activeIds.add(setObj.activeEntry);
            if (setObj.activeEntryId) activeIds.add(setObj.activeEntryId);
        }
        if (setObj.selectedEntryId) activeIds.add(setObj.selectedEntryId);
        if (!activeIds.size && setObj.rotation?.enabled && setObj.rotation?.entryId) {
            activeIds.add(setObj.rotation.entryId);
        }
        members = activeIds.size > 0 ? members.filter(m => activeIds.has(m.id)) : [];
    }
    return members;
}

function computeInitials(name = '') {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function groupAvatarDimensions(size, aspectRatio = '1:1') {
    if (aspectRatio === '4:3') return { w: Math.round((size * 4) / 3), h: size };
    if (aspectRatio === '16:9') return { w: Math.round((size * 16) / 9), h: size };
    if (aspectRatio === '21:9') return { w: Math.round((size * 21) / 9), h: size };
    if (aspectRatio === '3:4') return { w: size, h: Math.round((size * 4) / 3) };
    return { w: size, h: size };
}

const GROUP_POLY_CLIPS = {
    hexagon: 'polygon(50% 0%, 96% 25%, 96% 75%, 50% 100%, 4% 75%, 4% 25%)',
    diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
    octagon: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)'
};

const GROUP_POLY_POINTS = {
    hexagon: '50,1 96,26 96,74 50,99 4,74 4,26',
    diamond: '50,1 99,50 50,99 1,50',
    octagon: '30,1 70,1 99,30 99,70 70,99 30,99 1,70 1,30'
};

function applyGroupAvatarShape(node, shape = 'rounded', radiusPx = 10) {
    node.style.clipPath = '';
    if (shape === 'circle') node.style.borderRadius = '50%';
    else if (shape === 'rounded') node.style.borderRadius = `${Math.max(0, Math.min(100, Number(radiusPx) ?? 10))}px`;
    else if (shape === 'squircle') node.style.borderRadius = '26%';
    else if (GROUP_POLY_CLIPS[shape]) {
        node.style.borderRadius = '0px';
        node.style.clipPath = GROUP_POLY_CLIPS[shape];
    } else {
        node.style.borderRadius = '0px';
    }
}

function mountPolygonBorder(avBox, shape, width, color, borderStyle) {
    const pts = GROUP_POLY_POINTS[shape];
    if (!pts || width <= 0 || typeof document === 'undefined') return;
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(ns, 'svg');
    svgEl.setAttribute('viewBox', '0 0 100 100');
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible;';
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', color || '#38bdf8');
    poly.setAttribute('stroke-width', String(width * 2));
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    if (borderStyle === 'dashed') poly.setAttribute('stroke-dasharray', `${width * 3} ${width * 2}`);
    else if (borderStyle === 'dotted') poly.setAttribute('stroke-dasharray', `${width} ${width * 1.6}`);
    svgEl.appendChild(poly);
    avBox.appendChild(svgEl);
}

const IMAGE_GROUP_LAYOUTS = new Set(['row', 'column', 'grid', 'overlap', 'cards', 'chips', 'spotlight', 'banners', 'stagger']);
const IMAGE_GROUP_SHAPES = new Set(['rounded', 'circle', 'square', 'squircle', 'hexagon', 'diamond', 'octagon']);
const IMAGE_GROUP_PLACEMENTS = new Set(['below', 'above', 'left', 'right', 'inside-bottom', 'inside-top', 'split']);
const IMAGE_GROUP_SLOTS = new Set(['main', 'header', 'footer', 'trailing', 'avatar-top', 'avatar-bottom', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'avatar-tl', 'avatar-tr', 'avatar-bl', 'avatar-br']);
const FIELD_ROLE_SCALE = { title: 1, accent: 0.88, subtitle: 0.82, caption: 0.75, badge: 0.72 };

function looksLikeImageSource(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    return /^(data:image\/|\/assets\/|\/uploads\/)/i.test(s)
        || /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i.test(s);
}

function resolveGroupFieldSpecs(cfg = {}) {
    const hasExplicit = Array.isArray(cfg.fields) && cfg.fields.length > 0;
    let list = hasExplicit
        ? cfg.fields.filter(f => f && f.key).slice(0, 10)
        : [
            ...(cfg.labelField ? [{ key: cfg.labelField, role: 'title' }] : []),
            ...(cfg.subField ? [{ key: cfg.subField, role: 'subtitle' }] : [])
        ];
    if (hasExplicit && cfg.subField && !list.some(f => f.key === cfg.subField)) {
        list = [...list, { key: cfg.subField, role: 'subtitle' }];
    }
    const optNum = (raw, min, max) => (raw === null || raw === undefined || raw === '') ? null : Math.max(min, Math.min(max, Math.round(Number(raw) || 0)));
    return list.map((f, idx) => ({
        key: String(f.key),
        kind: ['auto', 'text', 'image'].includes(f.kind) ? f.kind : 'auto',
        customSrc: String(f.customSrc || '').trim(),
        role: f.role || (idx === 0 ? 'title' : 'subtitle'),
        slot: IMAGE_GROUP_SLOTS.has(f.slot) ? f.slot : 'main',
        align: ['auto', 'left', 'center', 'right'].includes(f.align) ? f.align : 'auto',
        inline: f.inline === true,
        prefix: String(f.prefix || ''),
        suffix: String(f.suffix || ''),
        icon: String(f.icon || '').trim(),
        sizeScale: Math.max(50, Math.min(200, Number(f.sizeScale) || 100)),
        fontSize: optNum(f.fontSize, 8, 96),
        padX: optNum(f.padX, 0, 32),
        padY: optNum(f.padY, 0, 32),
        imgSize: Math.max(10, Math.min(200, Math.round(Number(f.imgSize) || 28))),
        imgShape: ['rounded', 'circle', 'square', 'auto'].includes(f.imgShape) ? f.imgShape : 'rounded',
        imgFit: ['contain', 'cover'].includes(f.imgFit) ? f.imgFit : 'contain',
        imgBorderW: Math.max(0, Math.min(8, Math.round(Number(f.imgBorderW) || 0))),
        fontFamily: String(f.fontFamily || '').trim(),
        fontWeight: ['400', '600', '700', '900'].includes(String(f.fontWeight || '')) ? String(f.fontWeight) : '',
        fontStyle: ['normal', 'italic'].includes(f.fontStyle) ? f.fontStyle : '',
        textTransform: ['none', 'uppercase', 'lowercase', 'capitalize'].includes(f.textTransform) ? f.textTransform : '',
        color: String(f.color || '').trim(),
        bgColor: String(f.bgColor || '').trim()
    }));
}

function readMemberFieldValue(member, key, fallbackLabel = '') {
    const vals = member.values || {};
    const raw = key ? (vals[key] ?? member[key] ?? (key === 'name' ? member.label : '')) : '';
    const str = String(raw ?? '').trim();
    if (str) return str;
    return fallbackLabel;
}

function createStyledFieldNode(spec, text, ctx) {
    const { st, baseSize, isSpotlightLead, cfg, labelIdx, subIdx, status } = ctx;
    const span = document.createElement('span');
    let roleCls = 'sp-image-group-accent';
    if (spec.role === 'title' || (labelIdx === 0 && spec.role !== 'subtitle' && spec.role !== 'badge' && spec.role !== 'caption')) {
        roleCls = 'sp-image-group-label';
    } else if (spec.role === 'subtitle' || (subIdx === 0 && spec.role === 'subtitle')) {
        roleCls = 'sp-image-group-sub';
    } else if (spec.role === 'badge') {
        roleCls = 'sp-image-group-badge';
    } else if (spec.role === 'caption') {
        roleCls = 'sp-image-group-caption';
    }
    span.className = `sp-image-group-field ${roleCls}`;
    if (spec.slot && spec.slot !== 'main') span.dataset.igSlot = spec.slot;
    const iconCls = sanitizeIconClass(spec.icon);
    if (iconCls) {
        ensureFontAwesome();
        const iconEl = document.createElement('i');
        iconEl.className = `${iconCls} sp-inline-icon`;
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.style.cssText = `display:inline-block;margin-right:${text ? '0.35em' : '0'};vertical-align:-0.08em;line-height:1;font-style:normal;`;
        span.appendChild(iconEl);
        span.appendChild(document.createTextNode(`${spec.prefix}${text}${spec.suffix}`));
    } else {
        span.textContent = `${spec.prefix}${text}${spec.suffix}`;
    }

    const roleFont = (spec.role === 'subtitle' || spec.role === 'caption')
        ? String(cfg.subFontFamily || '').trim()
        : ((spec.role === 'badge' || spec.role === 'accent') ? String(cfg.badgeFontFamily || '').trim() : '');
    const resolvedFont = resolveColorToken(spec.fontFamily, status, {})
        || resolveColorToken(roleFont, status, {}) || st.fontFamily || 'sans-serif';
    if (typeof loadGoogleFont === 'function') loadGoogleFont(resolvedFont);

    const roleFactor = FIELD_ROLE_SCALE[spec.role] ?? 0.9;
    const rawPx = spec.fontSize ? (spec.fontSize * (isSpotlightLead ? 1.12 : 1)) : (baseSize * roleFactor * (spec.sizeScale / 100) * (isSpotlightLead ? 1.12 : 1));
    const px = Math.max(8, Math.round(rawPx));
    span.style.fontFamily = resolvedFont;
    span.style.fontSize = `${px}px`;
    span.style.fontWeight = spec.fontWeight || (spec.role === 'badge' ? '700'
        : spec.role === 'title' ? (st.fontWeight && st.fontWeight !== '400' ? st.fontWeight : '600')
            : (st.fontWeight || '400'));
    const isItalic = (spec.fontStyle || (st.fontStyle === 'italic' ? 'italic' : 'normal')) === 'italic';
    span.style.fontStyle = isItalic ? 'italic' : 'normal';
    span.style.lineHeight = String(st.lineHeight || 1.2);
    if (isItalic) {
        span.style.paddingLeft = '0.06em';
        span.style.paddingRight = '0.16em';
    }
    if (st.letterSpacing) span.style.letterSpacing = `${st.letterSpacing}px`;
    const xform = spec.textTransform || st.textTransform;
    if (xform && xform !== 'none') span.style.textTransform = xform;
    if (st.textDecoration && st.textDecoration !== 'none') span.style.textDecoration = st.textDecoration;
    if (st.tabularNums) span.style.fontVariantNumeric = 'tabular-nums';
    if (cfg.textWrap === 'wrap') {
        span.style.whiteSpace = 'normal';
        span.style.overflow = 'visible';
        span.style.textOverflow = 'clip';
        span.style.wordBreak = 'break-word';
    }

    const labelColor = String(cfg.labelColor || '').trim();
    const subColor = String(cfg.subColor || '').trim();
    const defaultTextColor = st.color && st.color !== 'transparent' ? st.color : '#f8fafc';
    if (spec.role === 'badge') {
        span.style.display = 'inline-block';
        span.style.padding = `${spec.padY ?? 2}px ${spec.padX ?? 7}px`;
        if (isItalic) {
            span.style.paddingLeft = `calc(${spec.padX ?? 7}px + 0.05em)`;
            span.style.paddingRight = `calc(${spec.padX ?? 7}px + 0.14em)`;
        }
        span.style.borderRadius = '999px';
        span.style.background = spec.bgColor || cfg.badgeBg || 'rgba(56,189,248,0.16)';
        span.style.color = spec.color || cfg.badgeColor || '#38bdf8';
    } else {
        const hasPad = spec.padX !== null || spec.padY !== null;
        if ((spec.bgColor && spec.bgColor !== 'transparent') || hasPad) {
            span.style.display = 'inline-block';
            span.style.padding = `${spec.padY ?? 1}px ${spec.padX ?? 6}px`;
            if (spec.bgColor && spec.bgColor !== 'transparent') {
                span.style.borderRadius = '5px';
                span.style.background = spec.bgColor;
            }
        }
        const resolvedColor = spec.color || (
            (spec.role === 'subtitle' || spec.role === 'caption')
                ? (subColor || labelColor || defaultTextColor)
                : (labelColor || defaultTextColor)
        );
        span.style.color = resolvedColor;
        if ((spec.role === 'subtitle' || spec.role === 'caption') && !spec.color && !subColor) {
            span.style.opacity = '0.78';
        }
        if (!spec.color && !labelColor && st.textGradient?.enabled) {
            Object.assign(span.style, decorationStyle({ textGradient: st.textGradient }, 'text'));
        }
    }

    const fx = textEffectStyle(st, 'text');
    if (fx.webkitTextStroke) span.style.webkitTextStroke = fx.webkitTextStroke;
    if (fx.paintOrder) span.style.paintOrder = fx.paintOrder;
    if (fx.textShadow) span.style.textShadow = fx.textShadow;
    if (st.textAnimation?.type && st.textAnimation.type !== 'none') {
        span.style.overflow = 'visible';
        span.style.textOverflow = 'clip';
        const animKey = `${ctx.itemId || ''}:${spec.key || ''}:${text}:${st.textAnimation.type}:${st.textAnimation.mode || 'loop'}:${st.textAnimation.speed ?? ''}:${st.textAnimation.intensity ?? ''}:${st.textAnimation.delay ?? ''}`;
        if (!(st.textAnimation.mode === 'once' && ctx.playedOnce?.has(animKey))) {
            if (st.textAnimation.mode === 'once') ctx.playedOnce?.add(animKey);
            applyTextAnimation(span, st, 'text');
        }
    }
    return span;
}

function createStyledImageFieldNode(spec, src, { isSpotlightLead = false } = {}) {
    const wrap = document.createElement('span');
    wrap.className = 'sp-image-group-field sp-image-group-img-field';
    if (spec.slot && spec.slot !== 'main') wrap.dataset.igSlot = spec.slot;
    const size = Math.max(10, Math.round((spec.imgSize || 28) * (isSpotlightLead ? 1.12 : 1)));
    const shape = spec.imgShape || 'rounded';
    const radius = shape === 'circle' ? '50%' : shape === 'square' ? '0' : shape === 'auto' ? '4px' : `${Math.max(4, Math.round(size * 0.22))}px`;
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.boxSizing = 'border-box';
    wrap.style.flex = '0 0 auto';
    wrap.style.lineHeight = '0';
    wrap.style.borderRadius = radius;
    const hasPlate = spec.bgColor && spec.bgColor !== 'transparent';
    if (hasPlate) wrap.style.background = spec.bgColor;
    const padX = spec.padX ?? (hasPlate ? 4 : 0);
    const padY = spec.padY ?? (hasPlate ? 4 : 0);
    if (padX > 0 || padY > 0) wrap.style.padding = `${padY}px ${padX}px`;
    if (spec.imgBorderW > 0) {
        wrap.style.border = `${spec.imgBorderW}px solid ${spec.color || 'rgba(255,255,255,0.45)'}`;
    }

    const img = document.createElement('img');
    img.draggable = false;
    img.decoding = 'async';
    img.alt = '';
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.src = src;
    img.style.display = 'block';
    img.style.objectFit = spec.imgFit === 'cover' ? 'cover' : 'contain';
    img.style.borderRadius = hasPlate || spec.imgBorderW > 0 ? (shape === 'circle' ? '50%' : '2px') : radius;
    if (shape === 'auto') {
        img.style.height = `${size}px`;
        img.style.width = 'auto';
        img.style.maxWidth = `${Math.round(size * 2.8)}px`;
    } else {
        img.style.width = `${size}px`;
        img.style.height = `${size}px`;
    }
    img.onerror = () => { wrap.style.display = 'none'; };
    wrap.appendChild(img);
    return wrap;
}

function alignToFlex(align) {
    return align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
}

function buildGroupMetaContainer(renderedFields, ctx) {
    const { alignMode, horizontalItem, inside, overlayEdge, fieldGap, labelBg, maxTextW, slotClass = 'sp-image-group-meta', stretchMain = false } = ctx;
    const textWrap = document.createElement('div');
    textWrap.className = slotClass;
    textWrap.style.display = 'flex';
    textWrap.style.flexDirection = 'column';
    textWrap.style.gap = `${fieldGap}px`;
    textWrap.style.minWidth = '0';
    textWrap.style.maxWidth = '100%';
    if (stretchMain) textWrap.style.flex = '1 1 auto';
    else textWrap.style.flex = '0 1 auto';

    const effectiveAlign = ctx.slotAlign || (alignMode !== 'auto'
        ? alignMode
        : (horizontalItem ? (ctx.labelPosition === 'left' ? 'right' : 'left') : 'center'));
    textWrap.style.alignItems = alignToFlex(effectiveAlign);
    textWrap.style.textAlign = effectiveAlign;

    if (inside) {
        const edge = overlayEdge || ctx.labelPosition;
        const isTop = edge === 'inside-top' || edge === 'avatar-top';
        textWrap.style.position = 'absolute';
        textWrap.style.left = '0';
        textWrap.style.right = '0';
        textWrap.style[isTop ? 'top' : 'bottom'] = '0';
        textWrap.style.zIndex = '2';
        textWrap.style.background = (labelBg && labelBg !== 'transparent')
            ? labelBg
            : (isTop
                ? 'linear-gradient(180deg, rgba(9,13,22,0.88) 0%, rgba(9,13,22,0) 100%)'
                : 'linear-gradient(0deg, rgba(9,13,22,0.88) 0%, rgba(9,13,22,0) 100%)');
        textWrap.style.padding = isTop ? '4px 6px 8px' : '8px 6px 4px';
    } else if (!ctx.noLabelBg && labelBg && labelBg !== 'transparent') {
        textWrap.style.background = labelBg;
        textWrap.style.padding = '3px 7px';
        textWrap.style.borderRadius = '6px';
    }

    let inlineRow = null;
    renderedFields.forEach(({ spec, node }) => {
        if (!horizontalItem && !inside && maxTextW && spec.role === 'title') {
            node.style.maxWidth = `${maxTextW}px`;
        }
        if (spec.inline) {
            if (!inlineRow) {
                inlineRow = document.createElement('div');
                inlineRow.className = 'sp-image-group-inline';
                inlineRow.style.display = 'flex';
                inlineRow.style.flexWrap = 'wrap';
                inlineRow.style.alignItems = 'center';
                inlineRow.style.gap = '6px';
                inlineRow.style.maxWidth = '100%';
                const rowAlign = spec.align !== 'auto' ? spec.align : effectiveAlign;
                inlineRow.style.justifyContent = alignToFlex(rowAlign);
                textWrap.appendChild(inlineRow);
            }
            inlineRow.appendChild(node);
        } else {
            inlineRow = null;
            if (spec.align && spec.align !== 'auto') {
                node.style.alignSelf = alignToFlex(spec.align);
                node.style.textAlign = spec.align;
            }
            textWrap.appendChild(node);
        }
    });
    return textWrap;
}

function buildCornerGroupContainer(cornerKey, items, fieldGap, cornerInset = 6) {
    const pos = document.createElement('div');
    pos.className = `sp-image-group-corner sp-image-group-${cornerKey}`;
    const isTop = cornerKey === 'corner-tl' || cornerKey === 'corner-tr' || cornerKey === 'avatar-tl' || cornerKey === 'avatar-tr';
    const isRight = cornerKey === 'corner-tr' || cornerKey === 'corner-br' || cornerKey === 'avatar-tr' || cornerKey === 'avatar-br';
    const inset = Math.max(0, Math.min(32, Math.round(Number(cornerInset ?? 6))));
    const padCss = `${isTop ? `top:${inset}px;` : `bottom:${inset}px;`}${isRight ? `right:${inset}px;align-items:flex-end;text-align:right;` : `left:${inset}px;align-items:flex-start;text-align:left;`}`;
    pos.style.cssText = `position:absolute;${padCss}display:flex;flex-direction:column;gap:${Math.max(2, fieldGap)}px;z-index:5;pointer-events:none;max-width:calc(100% - ${inset * 2}px);`;
    items.forEach(({ node }) => pos.appendChild(node));
    return pos;
}

function mountGroupAvatarMedia(avBox, item, dims, ctx) {
    const { avBg, avBorderW, avBorderC, avBorderStyle, avShadow, shape, avatarRadius, st, cfg, fallbackMode, preview, card, itemSize } = ctx;
    avBox.className = 'sp-image-group-avatar';
    avBox.style.width = `${dims.w}px`;
    avBox.style.height = `${dims.h}px`;
    avBox.style.flex = '0 0 auto';
    avBox.style.position = 'relative';
    avBox.style.overflow = 'visible';
    avBox.style.boxSizing = 'border-box';
    applyGroupAvatarShape(avBox, GROUP_POLY_CLIPS[shape] ? 'square' : shape, avatarRadius);

    const avMedia = document.createElement('div');
    avMedia.className = 'sp-image-group-media';
    avMedia.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box;';
    avMedia.style.background = avBg;
    applyGroupAvatarShape(avMedia, shape, avatarRadius);
    avBox.appendChild(avMedia);

    if (GROUP_POLY_CLIPS[shape]) {
        if (avShadow > 0) avBox.style.filter = `drop-shadow(0 3px ${Math.round(avShadow * 0.6)}px rgba(0,0,0,0.55))`;
        if (avBorderW > 0) mountPolygonBorder(avBox, shape, avBorderW, avBorderC, avBorderStyle);
    } else {
        const avStyleObj = {
            borderWidth: avBorderW,
            borderColor: avBorderC,
            borderGradient: cfg.avatarBorderGradient,
            borderStyle: avBorderStyle,
            borderGlow: cfg.avatarBorderGlow,
            borderAnimation: cfg.avatarBorderAnimation,
            shape: shape === 'circle' ? 'circle' : 'rectangle',
            borderRadius: shape === 'squircle' ? Math.round(Math.min(dims.w, dims.h) * 0.26) : (shape === 'rounded' ? avatarRadius : 0),
            shadow: avShadow > 0 ? { blur: avShadow, color: 'rgba(0,0,0,0.55)' } : undefined
        };
        applyBorderEffects(avBox, avStyleObj, { type: 'box', width: dims.w, height: dims.h });
    }

    const renderInitials = () => {
        const mono = document.createElement('span');
        mono.className = 'sp-image-group-initials';
        mono.textContent = computeInitials(item.labelText);
        mono.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.max(11, Math.round(itemSize * 0.38))}px;color:${cfg.labelColor || st.color || '#f8fafc'};user-select:none;`;
        avMedia.appendChild(mono);
    };

    if (item.imgUrl) {
        const img = document.createElement('img');
        img.className = 'sp-image-group-img';
        img.draggable = false;
        img.decoding = 'async';
        if (!item.imgUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
        img.src = item.imgUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.style.objectFit = st.objectFit || 'cover';
        img.style.objectPosition = `${st.focusX ?? 50}% ${st.focusY ?? 50}%`;
        img.addEventListener('error', () => {
            if (fallbackMode === 'initials' && item.labelText) {
                img.remove();
                renderInitials();
            } else if (!preview) {
                card.style.display = 'none';
            } else {
                img.style.opacity = '0.25';
            }
        });
        avMedia.appendChild(img);
    } else {
        renderInitials();
    }

    if (ctx.showStatusDot) {
        const dot = document.createElement('span');
        dot.className = 'sp-image-group-dot';
        const dotPx = Math.max(8, Math.round(Math.min(dims.w, dims.h) * 0.2));
        dot.style.cssText = `position:absolute;right:1px;bottom:1px;width:${dotPx}px;height:${dotPx}px;border-radius:50%;background:${cfg.badgeColor || '#22c55e'};border:2px solid rgba(9,13,22,0.92);box-shadow:0 0 8px rgba(34,197,94,0.45);z-index:4;pointer-events:none;`;
        avBox.appendChild(dot);
    }
    return avMedia;
}

function renderImageGroupStrip(container, element, status, options = {}) {
    element = numericBindings.resolveNumericElement(element, status);
    cleanupGroupStrip(container);
    const cfg = element?.imageGroup || {};
    const imgField = cfg.imageField || 'image';
    const fallbackMode = cfg.fallbackMode === 'initials' ? 'initials' : 'skip';
    const sortOrder = ['roster', 'reverse', 'alpha'].includes(cfg.sortOrder) ? cfg.sortOrder : 'roster';
    const layout = IMAGE_GROUP_LAYOUTS.has(cfg.layout) ? cfg.layout : 'row';
    const shape = IMAGE_GROUP_SHAPES.has(cfg.shape) ? cfg.shape : (layout === 'overlap' || layout === 'chips' ? 'circle' : 'rounded');
    const aspectRatio = ['1:1', '4:3', '16:9', '3:4', '21:9'].includes(cfg.aspectRatio) ? cfg.aspectRatio : '1:1';
    const showAvatar = cfg.showAvatar !== false;
    const baseSize = Math.max(16, Math.min(400, Number(cfg.size) || 56));
    const avatarRadius = Math.max(0, Math.min(100, Math.round(Number(cfg.avatarRadius ?? 10))));
    const gap = Math.max(0, Math.min(80, Number(cfg.gap ?? 10)));
    const rowGap = cfg.rowGap !== null && cfg.rowGap !== undefined && cfg.rowGap !== '' ? Math.max(0, Math.min(120, Number(cfg.rowGap))) : gap;
    const innerGap = Math.max(0, Math.min(60, Number(cfg.innerGap ?? (layout === 'chips' || layout === 'banners' ? 8 : 6))));
    const fieldGap = Math.max(0, Math.min(40, Number(cfg.fieldGap ?? 2)));
    const overlap = Math.max(4, Math.min(60, Number(cfg.overlap ?? 16)));
    const staggerOffset = Math.max(0, Math.min(80, Number(cfg.staggerOffset ?? 18)));
    const spotlightScale = Math.max(1.1, Math.min(2.0, Number(cfg.spotlightScale) || 1.35));
    const maxItems = Math.max(0, Math.min(60, Math.round(Number(cfg.maxItems) || 0)));
    const showOverflowBadge = cfg.showOverflowBadge !== false;
    const columns = Math.max(0, Math.min(12, Math.round(Number(cfg.columns) || 0)));
    const autoScale = cfg.autoScale === true;
    const wrapItems = cfg.wrap === true || layout === 'grid' || (!autoScale && (layout === 'cards' || layout === 'chips'));

    const fieldSpecs = resolveGroupFieldSpecs(cfg);
    const primarySpec = fieldSpecs[0] || { key: cfg.labelField || '', role: 'title' };
    const subSpec = fieldSpecs.find((f, i) => f.role === 'subtitle' || i === 1) || (cfg.subField ? { key: cfg.subField, role: 'subtitle' } : null);

    const filterMode = cfg.filterMode || 'inGroup';
    const showMode = cfg.showMode === 'dim' ? 'dim' : 'active';
    const linked = linkedSourceFields(status.variableSets, cfg.linkedSource, filterMode === 'checklist' ? ['checklist'] : ['ref', 'ref_list']);
    const trackerField = filterMode === 'checklist' ? linked.fields[0] : null;
    const map = linked.entry?.values?.[trackerField?.key] || {};
    const targetId = ['linked', 'checklist'].includes(filterMode) ? linked.fields[0]?.targetSet : cfg.setId;
    const followsLinks = ['linked', 'checklist'].includes(filterMode);
    let rawMembers = followsLinks && !linked.entry ? [] : resolveGroupMembers(targetId, status, !followsLinks && cfg.onlySelected === true, followsLinks ? 'all' : filterMode);
    if (filterMode === 'linked') {
        const ids = linked.fields.filter(field => field.targetSet === targetId).flatMap(field => {
            const value = linked.entry?.values?.[field.key];
            return field.type === 'ref_list' ? (Array.isArray(value) ? value : []) : value ? [value] : [];
        });
        const byId = new Map(rawMembers.map(member => [member.id, member]));
        rawMembers = [...new Set(ids)].map(id => byId.get(id)).filter(Boolean);
    }
    let items = rawMembers.map(m => {
        const level = filterMode === 'checklist' ? Math.max(0, Math.min(trackerMax(trackerField, m), Number(map[m.id]) || 0)) : 0;
        const tier = filterMode === 'checklist' ? m.tiers?.find(candidate => candidate.level === level) : null;
        const vals = { ...(m.values || {}) };
        if (tier?.image) vals[imgField] = tier.image;
        if (tier?.label && primarySpec.key) vals[primarySpec.key] = tier.label;
        for (const key of ['description', 'color', 'icon']) {
            if (tier?.[key] && Object.hasOwn(vals, key)) vals[key] = tier[key];
        }
        m = { ...m, values: vals, label: tier?.label || m.label };
        const rawImgField = String(vals[imgField] ?? m[imgField] ?? m.image ?? '').trim();
        const hasTierImages = (m.tiers || []).some(tier => tier.image);
        const imgUrl = (filterMode === 'checklist' ? resolveTieredValue(m, imgField, level, true) : '') || rawImgField;
        const autoFallbackLabel = String(m.text || m.label || Object.values(vals).find(v => typeof v === 'string' && v.trim() && v.trim() !== imgUrl && v.trim() !== rawImgField) || '').trim();
        const tieredLabel = (filterMode === 'checklist' && primarySpec.key) ? resolveTieredValue(m, primarySpec.key, level, false) : '';
        const labelText = primarySpec.key ? (tieredLabel || readMemberFieldValue(m, primarySpec.key, '')) : autoFallbackLabel;
        const subText = subSpec && subSpec.key ? readMemberFieldValue(m, subSpec.key, '') : '';
        const hasAnyText = Boolean(labelText || subText || fieldSpecs.some(s => readMemberFieldValue(m, s.key, '')));
        return { id: m.id, raw: m, imgUrl, labelText, subText, hasAnyText, level, hasTierImages, maxTier: trackerMax(trackerField, m), isInactive: filterMode === 'checklist' && level <= 0 };
    }).filter(item => {
        if (filterMode === 'checklist' && showMode !== 'dim' && item.level <= 0) return false;
        return !showAvatar ? (item.hasAnyText || item.imgUrl !== '') : (fallbackMode === 'initials' ? (item.imgUrl !== '' || item.labelText !== '') : item.imgUrl !== '');
    });

    if (sortOrder === 'reverse') items = items.slice().reverse();
    else if (sortOrder === 'alpha') items = items.slice().sort((a, b) => (a.labelText || a.id || '').localeCompare(b.labelText || b.id || ''));

    const totalCount = items.length;
    const overflowCount = maxItems > 0 && totalCount > maxItems ? totalCount - maxItems : 0;
    if (maxItems > 0 && items.length > maxItems) items = items.slice(0, maxItems);

    container.replaceChildren();
    if (!items.length) return false;

    const st = resolveStyleVariables(element.style || {}, status, {});
    if (typeof loadGoogleFont === 'function' && st.fontFamily) loadGoogleFont(st.fontFamily);
    const setObj = (status?.variableSets || []).find(s => s && s.id === targetId) || null;
    const setFieldTypes = new Map((setObj?.fields || []).map(f => [f.key, f.type]));
    const setFieldIcons = new Map((setObj?.fields || []).filter(f => f.icon).map(f => [f.key, f.icon]));
    const resolveMemberColor = (val, member, fallback = '') => resolveColorToken(val, status, {}, member) || fallback;
    const resolveMemberGradient = (grad, member) => {
        if (!grad || typeof grad !== 'object') return grad;
        return {
            ...grad,
            from: resolveMemberColor(grad.from, member, '#1f6feb'),
            mid: grad.mid ? resolveMemberColor(grad.mid, member, '') : grad.mid,
            to: resolveMemberColor(grad.to, member, '#8957e5')
        };
    };
    const showLabels = cfg.showLabels === true;
    const labelPosition = IMAGE_GROUP_PLACEMENTS.has(cfg.labelPosition) ? cfg.labelPosition : 'below';
    const alignMode = ['auto', 'left', 'center', 'right'].includes(cfg.textAlign) ? cfg.textAlign : 'auto';
    const labelSize = Math.max(0, Math.min(72, Math.round(Number(cfg.labelSize) || 0)));
    const baseSizePx = labelSize > 0 ? labelSize : (Number(st.fontSize) || 15);
    const cornerInset = Math.max(0, Math.min(32, Math.round(Number(cfg.cornerInset ?? 6))));
    const delimiter = String(cfg.delimiter || '');
    const delimiterColor = resolveColorToken(cfg.delimiterColor || '', status, {});
    const showStatusDot = cfg.showStatusDot === true;

    const rawAvBorderW = cfg.avatarBorderWidth;
    const avBorderW = Math.max(0, Math.min(12, Math.round(rawAvBorderW !== undefined && rawAvBorderW !== '' ? Number(rawAvBorderW) || 0 : (layout === 'overlap' ? 2 : 0))));
    const rawAvBorderC = String(cfg.avatarBorderColor || (layout === 'overlap' && !avBorderW ? '#0f172a' : 'rgba(255,255,255,0.28)')).trim();
    const avBorderStyle = String(cfg.avatarBorderStyle || 'solid');
    const rawAvBg = String(cfg.avatarBg || '#1e293b').trim();
    const avShadow = Math.max(0, Math.min(40, Math.round(Number(cfg.avatarShadow) || 0)));

    const isChip = layout === 'chips';
    const isBanner = layout === 'banners';
    const layoutAutoFrames = layout === 'cards' || isChip || isBanner;
    const isFramed = cfg.cardFrame === true || layoutAutoFrames;
    const widthMode = ['auto', 'full', 'fixed'].includes(cfg.cardWidthMode) ? cfg.cardWidthMode : (isBanner ? 'full' : 'auto');
    const cardWidthPx = Math.max(60, Math.min(1600, Math.round(Number(cfg.cardWidth) || 240)));
    const cardMinHeight = Math.max(0, Math.min(800, Math.round(Number(cfg.cardMinHeight) || 0)));
    const cardAlign = cfg.cardAlign === 'top' ? 'flex-start' : cfg.cardAlign === 'bottom' ? 'flex-end' : 'center';
    const rawCardBg = String(cfg.cardBg || 'rgba(15,23,42,0.78)').trim();
    const cardBlur = Math.max(0, Math.min(40, Math.round(Number(cfg.cardBlur) || 0)));
    const cardBorderW = Math.max(0, Math.min(16, Math.round(Number(cfg.cardBorderWidth ?? 1))));
    const rawCardBorderC = String(cfg.cardBorderColor || 'rgba(255,255,255,0.16)').trim();
    const cardBorderStyle = String(cfg.cardBorderStyle || 'solid');
    const cardRadius = Math.max(0, Math.min(999, Math.round(Number(cfg.cardRadius ?? 12))));
    const basePad = Math.max(0, Math.min(48, Math.round(Number(cfg.cardPadding ?? 8))));
    const cardShadow = Math.max(0, Math.min(48, Math.round(Number(cfg.cardShadow) || 0)));

    const alignH = st.textAlign === 'center' ? 'center' : st.textAlign === 'right' ? 'flex-end' : 'flex-start';
    const alignV = st.verticalAlign === 'middle' ? 'center' : st.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';

    const wrap = document.createElement('div');
    wrap.className = `sp-image-group sp-image-group-${layout}`;
    const unconstrainedRow = autoScale && !wrapItems && layout !== 'column' && !isBanner && layout !== 'grid';
    wrap.style.width = unconstrainedRow ? 'max-content' : '100%';
    if (unconstrainedRow) wrap.style.minWidth = '100%';
    wrap.style.height = autoScale ? 'auto' : '100%';
    if (autoScale) wrap.style.minHeight = '100%';
    wrap.style.boxSizing = 'border-box';

    const useCssGrid = (layout === 'grid') || (columns > 0 && wrapItems && layout !== 'overlap' && layout !== 'column' && layout !== 'banners');
    const hasWideGridCard = cfg.showLabels === true && (cfg.labelPosition === 'left' || cfg.labelPosition === 'right' || cfg.cardFrame === true);
    if (useCssGrid) {
        wrap.style.display = 'grid';
        wrap.style.gridTemplateColumns = columns > 0
            ? `repeat(${columns}, minmax(0, 1fr))`
            : widthMode === 'fixed'
                ? `repeat(auto-fill, ${cardWidthPx}px)`
                : `repeat(auto-fill, minmax(${Math.max(hasWideGridCard ? 140 : 48, baseSize)}px, 1fr))`;
        wrap.style.columnGap = `${gap}px`;
        wrap.style.rowGap = `${rowGap}px`;
        wrap.style.justifyItems = st.textAlign === 'center' ? 'center' : st.textAlign === 'right' ? 'end' : 'start';
        wrap.style.justifyContent = alignH;
        wrap.style.alignItems = 'start';
        wrap.style.alignContent = alignV;
    } else if (layout === 'column' || isBanner) {
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.rowGap = `${rowGap}px`;
        wrap.style.columnGap = `${gap}px`;
        wrap.style.alignItems = (widthMode === 'full' && st.textAlign !== 'center' && st.textAlign !== 'right') ? 'stretch' : alignH;
        wrap.style.justifyContent = alignV;
    } else {
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'row';
        wrap.style.flexWrap = wrapItems && layout !== 'overlap' ? 'wrap' : 'nowrap';
        wrap.style.columnGap = layout === 'overlap' ? '0px' : `${gap}px`;
        wrap.style.rowGap = `${rowGap}px`;
        wrap.style.alignItems = alignV;
        wrap.style.justifyContent = alignH;
        if (wrapItems) wrap.style.alignContent = alignV;
    }

    const deferredRingCards = [];
    const playedOnce = container._onceTextAnimPlayed || (container._onceTextAnimPlayed = new Set());

    items.forEach((item, idx) => {
        const isSpotlightLead = layout === 'spotlight' && idx === 0;
        const itemSize = isSpotlightLead ? Math.min(400, Math.round(baseSize * spotlightScale)) : baseSize;
        const dims = groupAvatarDimensions(itemSize, aspectRatio);
        const inside = showAvatar && showLabels && (labelPosition === 'inside-bottom' || labelPosition === 'inside-top') && !isChip;
        const splitMode = showAvatar && showLabels && labelPosition === 'split' && !isChip;
        const memberCfg = {
            ...cfg,
            labelColor: resolveMemberColor(cfg.labelColor, item.raw, ''),
            subColor: resolveMemberColor(cfg.subColor, item.raw, ''),
            badgeBg: resolveMemberColor(cfg.badgeBg || 'rgba(56,189,248,0.16)', item.raw, 'rgba(56,189,248,0.16)'),
            badgeColor: resolveMemberColor(cfg.badgeColor || '#38bdf8', item.raw, '#38bdf8'),
            avatarBorderGradient: resolveMemberGradient(cfg.avatarBorderGradient, item.raw),
            avatarBorderGlow: cfg.avatarBorderGlow ? { ...cfg.avatarBorderGlow, color: resolveMemberColor(cfg.avatarBorderGlow.color, item.raw, '#38bdf8') } : cfg.avatarBorderGlow,
            avatarBorderAnimation: cfg.avatarBorderAnimation ? {
                ...cfg.avatarBorderAnimation,
                color2: resolveMemberColor(cfg.avatarBorderAnimation.color2, item.raw, '#ffffff'),
                color3: resolveMemberColor(cfg.avatarBorderAnimation.color3, item.raw, '')
            } : cfg.avatarBorderAnimation
        };
        const avBg = resolveMemberColor(rawAvBg, item.raw, '#1e293b');
        const avBorderC = resolveMemberColor(rawAvBorderC, item.raw, 'rgba(255,255,255,0.28)');
        const cardBg = resolveMemberColor(rawCardBg, item.raw, 'rgba(15,23,42,0.78)');
        const cardBorderC = resolveMemberColor(rawCardBorderC, item.raw, 'rgba(255,255,255,0.16)');
        const labelBg = resolveMemberColor(cfg.labelBg || '', item.raw, '');
        const horizontalItem = showLabels && !inside && !splitMode && (
            !showAvatar
            || labelPosition === 'right'
            || labelPosition === 'left'
            || ((isChip || isBanner) && labelPosition === 'below')
        );

        const card = document.createElement('div');
        card.dataset.groupEntryId = item.id;
        if (filterMode === 'checklist') card.dataset.checklistLevel = String(item.level);
        card.className = `sp-image-group-item${isFramed && !isChip ? ' sp-image-group-card' : ''}${isChip ? ' sp-image-group-chip' : ''}${isBanner ? ' sp-image-group-banner' : ''}${isSpotlightLead ? ' sp-image-group-lead' : ''}${cfg.textWrap === 'wrap' ? ' is-wrap' : ''}${item.isInactive ? ' sp-image-group-inactive' : ''}`;
        card.style.position = 'relative';
        card.style.boxSizing = 'border-box';
        if (item.isInactive) {
            card.style.opacity = '0.32';
            card.style.filter = 'grayscale(100%)';
        }
        if (layout === 'overlap' && idx > 0) card.style.marginLeft = `-${overlap}px`;
        if (layout === 'stagger' && idx % 2 === 1 && staggerOffset > 0) card.style.marginTop = `${staggerOffset}px`;
        if (widthMode === 'full') card.style.width = '100%';
        else if (widthMode === 'fixed') card.style.width = `${cardWidthPx}px`;
        else {
            card.style.width = 'max-content';
            if (!autoScale) card.style.maxWidth = '100%';
        }
        if (cardMinHeight > 0) card.style.minHeight = `${cardMinHeight}px`;

        if (isFramed) {
            if (cfg.cardGradient?.enabled) {
                const grad = gradientStyle(resolveMemberGradient(cfg.cardGradient, item.raw));
                card.style.background = grad.background;
                card.style.backgroundSize = grad.backgroundSize;
                card.style.animation = grad.animation;
            } else {
                card.style.background = cardBg;
            }
            if (cardBlur > 0) {
                card.style.backdropFilter = `blur(${cardBlur}px)`;
                card.style.webkitBackdropFilter = `blur(${cardBlur}px)`;
            }
            card.style.borderRadius = `${isChip ? 999 : cardRadius}px`;
            if (isChip && cfg.cardPaddingX == null && cfg.cardPaddingY == null) {
                card.style.padding = '4px 12px 4px 4px';
            } else {
                const padX = cfg.cardPaddingX ?? basePad;
                const padY = cfg.cardPaddingY ?? basePad;
                card.style.padding = `${padY}px ${padX}px`;
            }
            const cardStyleObj = {
                borderWidth: cardBorderW,
                borderColor: cardBorderC,
                borderGradient: resolveMemberGradient(cfg.cardBorderGradient, item.raw),
                borderStyle: cardBorderStyle,
                borderGlow: cfg.cardBorderGlow ? { ...cfg.cardBorderGlow, color: resolveMemberColor(cfg.cardBorderGlow.color, item.raw, '#38bdf8') } : cfg.cardBorderGlow,
                borderAnimation: cfg.cardBorderAnimation ? {
                    ...cfg.cardBorderAnimation,
                    color2: resolveMemberColor(cfg.cardBorderAnimation.color2, item.raw, '#ffffff'),
                    color3: resolveMemberColor(cfg.cardBorderAnimation.color3, item.raw, '')
                } : cfg.cardBorderAnimation,
                borderRadius: isChip ? 999 : cardRadius,
                shape: isChip ? 'pill' : 'rectangle',
                shadow: cardShadow > 0 ? { blur: cardShadow, color: 'rgba(0,0,0,0.45)' } : undefined
            };
            applyBorderEffects(card, cardStyleObj, { type: 'box' });
            const needsRingResize = cardBorderW > 0 && (
                (cardBorderStyle !== 'solid' && cardBorderStyle !== 'dashed' && cardBorderStyle !== 'dotted' && cardBorderStyle !== 'double')
                || cfg.cardBorderGradient?.enabled
                || (cfg.cardBorderAnimation?.type && cfg.cardBorderAnimation.type !== 'none')
            );
            if (needsRingResize) deferredRingCards.push([card, cardStyleObj]);
        }

        let avBox = null;
        let avMedia = null;
        if (showAvatar) {
            avBox = document.createElement('div');
            avMedia = mountGroupAvatarMedia(avBox, item, dims, {
                avBg, avBorderW, avBorderC, avBorderStyle, avShadow, shape, avatarRadius, st, cfg: memberCfg, fallbackMode, preview: options.preview, card, itemSize, showStatusDot
            });
            avBox._baseW = dims.w;
            avBox._baseH = dims.h;
            avBox._baseBorderW = avBorderW;
        }

        const slotBuckets = {
            header: [], main: [], trailing: [], footer: [],
            'avatar-top': [], 'avatar-bottom': [],
            'corner-tl': [], 'corner-tr': [], 'corner-bl': [], 'corner-br': [],
            'avatar-tl': [], 'avatar-tr': [], 'avatar-bl': [], 'avatar-br': []
        };
        let labelCount = 0;
        let subCount = 0;
        const activeSpecs = fieldSpecs.length ? fieldSpecs : (item.labelText ? [{ key: '', kind: 'text', role: 'title', slot: 'main', align: 'auto', inline: false, prefix: '', suffix: '', sizeScale: 100, color: '', bgColor: '' }] : []);
        activeSpecs.forEach((spec, fIdx) => {
            const sfType = setFieldTypes.get(spec.key);
            let memberRaw = spec.key ? readMemberFieldValue(item.raw, spec.key, fIdx === 0 && !cfg.labelField && spec.kind !== 'image' ? item.labelText : '') : (spec.kind === 'image' ? '' : item.labelText);
            if (sfType === 'template' && memberRaw) {
                const vals = item.raw?.values || {};
                memberRaw = memberRaw.replace(/@([a-z0-9_]{1,20})\b/gi, (_, k) => (vals[k] !== undefined && vals[k] !== null ? String(vals[k]) : ''));
                if (typeof expandVariables === 'function') memberRaw = expandVariables(memberRaw, status);
            } else if (sfType === 'list' && memberRaw) {
                memberRaw = memberRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ');
            }
            let resolvedVal = memberRaw || spec.customSrc || '';
            if (!resolvedVal) return;
            const iconFieldCls = sfType === 'icon' ? sanitizeIconClass(resolvedVal) : '';
            if (iconFieldCls) resolvedVal = '';
            const isImgField = !iconFieldCls && (spec.kind === 'image' || (spec.kind !== 'text' && (sfType === 'image' || Boolean(spec.customSrc && !memberRaw) || looksLikeImageSource(resolvedVal))));
            if (!isImgField && !showLabels) return;
            const resolvedSpec = {
                ...spec,
                icon: iconFieldCls || (spec.icon === 'none' ? '' : (spec.icon || setFieldIcons.get(spec.key) || '')),
                color: spec.color ? resolveMemberColor(spec.color, item.raw, '') : '',
                bgColor: spec.bgColor ? resolveMemberColor(spec.bgColor, item.raw, '') : ''
            };
            const node = isImgField
                ? createStyledImageFieldNode(resolvedSpec, resolvedVal, { isSpotlightLead })
                : createStyledFieldNode(resolvedSpec, resolvedVal, {
                    st, baseSize: baseSizePx, isSpotlightLead, cfg: memberCfg, status,
                    itemId: item.id, playedOnce,
                    labelIdx: resolvedSpec.role === 'title' ? labelCount++ : -1,
                    subIdx: resolvedSpec.role === 'subtitle' ? subCount++ : -1
                });
            let slot = resolvedSpec.slot || 'main';
            if (!showAvatar && slot === 'avatar-top') slot = 'header';
            else if (!showAvatar && slot === 'avatar-bottom') slot = 'footer';
            else if (!showAvatar && slot.startsWith('avatar-')) slot = slot.replace('avatar-', 'corner-');
            (slotBuckets[slot] || slotBuckets.main).push({ spec: resolvedSpec, node });
        });

        const stretchMain = widthMode === 'full' || widthMode === 'fixed';
        const metaCtx = {
            alignMode, horizontalItem, inside, labelPosition, fieldGap, labelBg,
            maxTextW: 0, stretchMain: horizontalItem && stretchMain
        };

        const appendCoreParts = (rowHost, stackColumnFirst = false) => {
            const mainList = slotBuckets.main;
            const trailingList = slotBuckets.trailing;
            const buildTrailing = () => trailingList.length
                ? buildGroupMetaContainer(trailingList, { ...metaCtx, inside: false, stretchMain: false, noLabelBg: true, slotAlign: alignMode !== 'auto' ? alignMode : 'right', slotClass: 'sp-image-group-meta sp-image-group-trailing' })
                : null;
            const trailingNode = buildTrailing();

            if (!horizontalItem && trailingNode) {
                rowHost.style.display = 'flex';
                rowHost.style.flexDirection = 'row';
                rowHost.style.alignItems = cardAlign;
                rowHost.style.gap = `${innerGap}px`;
                const leftCol = document.createElement('div');
                leftCol.className = 'sp-image-group-core-stack';
                leftCol.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:${innerGap}px;flex:1 1 auto;min-width:0;`;
                if (splitMode && mainList.length) {
                    leftCol.appendChild(buildGroupMetaContainer(mainList.slice(0, 1), { ...metaCtx, inside: false, stretchMain: false }));
                    if (avBox) leftCol.appendChild(avBox);
                    if (mainList.length > 1) leftCol.appendChild(buildGroupMetaContainer(mainList.slice(1), { ...metaCtx, inside: false, stretchMain: false }));
                } else if (labelPosition === 'above' && mainList.length) {
                    leftCol.appendChild(buildGroupMetaContainer(mainList, { ...metaCtx, stretchMain: false }));
                    if (avBox) leftCol.appendChild(avBox);
                } else {
                    if (avBox) leftCol.appendChild(avBox);
                    if (mainList.length) leftCol.appendChild(buildGroupMetaContainer(mainList, { ...metaCtx, stretchMain: false }));
                }
                rowHost.appendChild(leftCol);
                trailingNode.style.marginLeft = 'auto';
                trailingNode.style.flex = '0 0 auto';
                rowHost.appendChild(trailingNode);
                return;
            }

            rowHost.style.display = 'flex';
            rowHost.style.flexDirection = horizontalItem ? 'row' : 'column';
            rowHost.style.alignItems = horizontalItem ? cardAlign : 'center';
            if (stackColumnFirst) rowHost.style.justifyContent = stretchMain ? 'space-between' : 'center';
            rowHost.style.gap = `${innerGap}px`;

            if (splitMode && mainList.length) {
                rowHost.appendChild(buildGroupMetaContainer(mainList.slice(0, 1), { ...metaCtx, inside: false }));
                if (avBox) rowHost.appendChild(avBox);
                if (mainList.length > 1) rowHost.appendChild(buildGroupMetaContainer(mainList.slice(1), { ...metaCtx, inside: false }));
            } else if (inside && mainList.length && avMedia) {
                avMedia.appendChild(buildGroupMetaContainer(mainList, metaCtx));
                if (avBox) rowHost.appendChild(avBox);
            } else if ((labelPosition === 'above' || labelPosition === 'left') && mainList.length) {
                rowHost.appendChild(buildGroupMetaContainer(mainList, metaCtx));
                if (avBox) rowHost.appendChild(avBox);
            } else {
                if (avBox) rowHost.appendChild(avBox);
                if (mainList.length) rowHost.appendChild(buildGroupMetaContainer(mainList, metaCtx));
            }
            if (trailingNode) {
                trailingNode.style.marginLeft = 'auto';
                trailingNode.style.flex = '0 0 auto';
                rowHost.appendChild(trailingNode);
            }
        };

        if (avMedia) {
            if (slotBuckets['avatar-top'].length) {
                avMedia.appendChild(buildGroupMetaContainer(slotBuckets['avatar-top'], {
                    ...metaCtx, inside: true, overlayEdge: 'avatar-top', slotAlign: 'center', stretchMain: false,
                    slotClass: 'sp-image-group-meta sp-image-group-avtop'
                }));
            }
            if (slotBuckets['avatar-bottom'].length) {
                avMedia.appendChild(buildGroupMetaContainer(slotBuckets['avatar-bottom'], {
                    ...metaCtx, inside: true, overlayEdge: 'avatar-bottom', slotAlign: 'center', stretchMain: false,
                    slotClass: 'sp-image-group-meta sp-image-group-avbot'
                }));
            }
        }

        const hasOuterZones = slotBuckets.header.length > 0 || slotBuckets.footer.length > 0;
        if (hasOuterZones) {
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'stretch';
            card.style.justifyContent = cardAlign;
            card.style.gap = `${Math.max(4, fieldGap + 3)}px`;
            if (slotBuckets.header.length) {
                card.appendChild(buildGroupMetaContainer(slotBuckets.header, {
                    ...metaCtx, inside: false, horizontalItem: false, stretchMain: false,
                    slotAlign: alignMode !== 'auto' ? alignMode : (horizontalItem ? 'left' : 'center'),
                    slotClass: 'sp-image-group-meta sp-image-group-header'
                }));
            }
            const coreRow = document.createElement('div');
            coreRow.className = 'sp-image-group-core';
            coreRow.style.cssText = 'width:100%;min-width:0;flex:1 1 auto;';
            appendCoreParts(coreRow, true);
            card.appendChild(coreRow);
            if (slotBuckets.footer.length) {
                card.appendChild(buildGroupMetaContainer(slotBuckets.footer, {
                    ...metaCtx, inside: false, horizontalItem: false, stretchMain: false,
                    slotAlign: alignMode !== 'auto' ? alignMode : (horizontalItem ? 'left' : 'center'),
                    slotClass: 'sp-image-group-meta sp-image-group-footer'
                }));
            }
        } else {
            card.style.justifyContent = cardAlign === 'flex-start' ? 'flex-start' : (cardAlign === 'flex-end' ? 'flex-end' : 'center');
            appendCoreParts(card, false);
        }

        if (avBox) {
            for (const ak of ['avatar-tl', 'avatar-tr', 'avatar-bl', 'avatar-br']) {
                if (slotBuckets[ak].length) avBox.appendChild(buildCornerGroupContainer(ak, slotBuckets[ak], fieldGap, cornerInset));
            }
        }
        for (const ck of ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br']) {
            if (slotBuckets[ck].length) card.appendChild(buildCornerGroupContainer(ck, slotBuckets[ck], fieldGap, cornerInset));
        }

        if (filterMode === 'checklist' && item.level >= 1 && (item.maxTier > 1 || item.hasTierImages)) {
            const tierBadge = document.createElement('span');
            tierBadge.className = 'sp-image-group-tier-badge';
            tierBadge.textContent = `Lv.${item.level}`;
            const badgePx = Math.max(9, Math.round(itemSize * 0.2));
            tierBadge.style.cssText = `position:absolute;right:2px;${showStatusDot ? 'top:2px;' : 'bottom:2px;'}padding:1px 5px;border-radius:999px;background:rgba(15,23,42,0.88);border:1px solid rgba(56,189,248,0.65);color:#f8fafc;font-size:${badgePx}px;font-weight:700;line-height:1.2;z-index:6;pointer-events:none;font-variant-numeric:tabular-nums;white-space:nowrap;`;
            (avBox || card).appendChild(tierBadge);
        }

        wrap.appendChild(card);

        if (delimiter && layout !== 'overlap' && idx < items.length - 1) {
            const sep = document.createElement('span');
            sep.className = 'sp-image-group-delim';
            sep.textContent = delimiter;
            sep.style.fontFamily = st.fontFamily || 'sans-serif';
            sep.style.fontSize = `${Math.max(11, Math.round(baseSizePx * 0.9))}px`;
            sep.style.alignSelf = 'center';
            if (delimiterColor) sep.style.color = delimiterColor;
            wrap.appendChild(sep);
        }
    });

    if (overflowCount > 0 && showOverflowBadge) {
        const badge = document.createElement('div');
        badge.className = 'sp-image-group-overflow';
        badge.textContent = `+${overflowCount}`;
        const dims = groupAvatarDimensions(baseSize, aspectRatio);
        badge.style.width = `${dims.w}px`;
        badge.style.height = `${dims.h}px`;
        badge.style.flex = '0 0 auto';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.justifyContent = 'center';
        badge.style.fontWeight = '700';
        badge.style.fontSize = `${Math.max(12, Math.round(baseSize * 0.34))}px`;
        const resolveStripColor = (raw, fb) => {
            const c = resolveColorToken(raw, status, {});
            return (c && !c.startsWith('@')) ? c : fb;
        };
        badge.style.background = resolveStripColor(rawCardBg, 'rgba(15,23,42,0.78)');
        badge.style.color = resolveStripColor(cfg.labelColor, st.color || '#f8fafc');
        badge.style.border = `${Math.max(1, avBorderW)}px solid ${resolveStripColor(rawAvBorderC, 'rgba(255,255,255,0.28)')}`;
        badge.style.boxSizing = 'border-box';
        if (layout === 'overlap') badge.style.marginLeft = `-${overlap}px`;
        applyGroupAvatarShape(badge, shape, avatarRadius);
        wrap.appendChild(badge);
    }

    container.appendChild(wrap);
    container.appendChild(wrap);
    const applyGroupAutoScale = () => {
        if (!autoScale || !wrap.isConnected || !container.isConnected) return;
        const cs = typeof getComputedStyle === 'function' ? getComputedStyle(container) : null;
        const padL = cs ? (parseFloat(cs.paddingLeft) || 0) : 0;
        const padR = cs ? (parseFloat(cs.paddingRight) || 0) : 0;
        const padT = cs ? (parseFloat(cs.paddingTop) || 0) : 0;
        const padB = cs ? (parseFloat(cs.paddingBottom) || 0) : 0;
        const padX = padL + padR;
        const padY = padT + padB;
        const availW = container.clientWidth - padX;
        const availH = container.clientHeight - padY;
        if (availW <= 0 || availH <= 0) return;

        // 1. Reset responsive metrics to their configured base values before measuring.
        wrap.style.position = '';
        wrap.style.left = '';
        wrap.style.top = '';
        wrap.style.transform = '';
        wrap.style.transformOrigin = '0 0';
        wrap.style.columnGap = layout === 'overlap' ? '0px' : `${gap}px`;
        wrap.style.rowGap = `${rowGap}px`;
        wrap.querySelectorAll('.sp-image-group-row-host, .sp-image-group-core-stack').forEach(n => {
            n.style.gap = `${innerGap}px`;
        });
        wrap.querySelectorAll('.sp-image-group-item').forEach(c => {
            if (!c._basePad) {
                const ccs = getComputedStyle(c);
                c._basePad = [parseFloat(ccs.paddingTop) || 0, parseFloat(ccs.paddingRight) || 0, parseFloat(ccs.paddingBottom) || 0, parseFloat(ccs.paddingLeft) || 0];
                c._baseBorderW = parseFloat(ccs.borderLeftWidth) || 0;
            }
            c.style.padding = c._basePad.map(v => `${v}px`).join(' ');
            if (c._baseBorderW > 0) c.style.borderWidth = `${c._baseBorderW}px`;
            c.querySelectorAll('.sp-image-group-avatar').forEach(av => {
                if (av._baseW) {
                    av.style.width = `${av._baseW}px`;
                    av.style.height = `${av._baseH}px`;
                }
                if (av._baseBorderW > 0) av.style.borderWidth = `${av._baseBorderW}px`;
            });
            c.querySelectorAll('.sp-image-group-field img').forEach(im => {
                if (!im._baseImgW) {
                    im._baseImgW = parseFloat(im.style.width) || im.offsetWidth || 24;
                    im._baseImgH = parseFloat(im.style.height) || im.offsetHeight || 24;
                }
                im.style.width = `${im._baseImgW}px`;
                im.style.height = `${im._baseImgH}px`;
            });
        });
        wrap.querySelectorAll('.sp-image-group-corner').forEach(c => { c.style.overflow = 'hidden'; });
        wrap.querySelectorAll('.sp-image-group-field').forEach(fieldEl => {
            if (!fieldEl._baseFontSize) {
                fieldEl._baseFontSize = parseFloat(getComputedStyle(fieldEl).fontSize) || 16;
            }
            fieldEl.style.fontSize = `${fieldEl._baseFontSize}px`;
        });

        // 2. For grid/fixed-width layouts (including auto-columns), scale avatars, field images, padding, borders, gaps, and base fonts together
        //    so narrow or short boxes shrink proportionally instead of letting fixed avatars crush text.
        if (useCssGrid || widthMode === 'fixed') {
            const autoTrackMin = Math.max(hasWideGridCard ? 140 : 48, baseSize);
            const cols = useCssGrid
                ? (columns > 0 ? columns : Math.min(items.length, Math.max(1, Math.floor((availW + gap) / (autoTrackMin + gap)))))
                : Math.max(1, Math.floor((availW + gap) / (cardWidthPx + gap)));
            const rows = Math.max(1, Math.ceil(items.length / cols));
            const slotW = useCssGrid ? Math.max(24, (availW - gap * (cols - 1)) / cols) : cardWidthPx;
            const slotH = Math.max(24, (availH - rowGap * (rows - 1)) / rows);
            let maxCardW = 0;
            let maxCardH = 0;
            wrap.querySelectorAll('.sp-image-group-item').forEach(c => {
                const prevMaxW = c.style.maxWidth;
                c.style.maxWidth = 'none';
                // Measure natural card content excluding overflowing corner badges (handled per-field below).
                const corners = [...c.querySelectorAll('.sp-image-group-corner')];
                corners.forEach(cn => { cn.style.display = 'none'; });
                maxCardW = Math.max(maxCardW, c.scrollWidth, c.offsetWidth);
                maxCardH = Math.max(maxCardH, c.scrollHeight, c.offsetHeight);
                corners.forEach(cn => { cn.style.display = ''; });
                c.style.maxWidth = prevMaxW;
            });
            const s = Math.max(0.28, Math.min(1, slotW / Math.max(1, maxCardW), slotH / Math.max(1, maxCardH)));
            if (s < 0.995) {
                wrap.style.columnGap = layout === 'overlap' ? '0px' : `${Math.round(gap * s)}px`;
                wrap.style.rowGap = `${Math.round(rowGap * s)}px`;
                wrap.querySelectorAll('.sp-image-group-row-host, .sp-image-group-core-stack').forEach(n => {
                    n.style.gap = `${Math.max(2, Math.round(innerGap * s))}px`;
                });
                wrap.querySelectorAll('.sp-image-group-item').forEach(c => {
                    if (c._basePad) c.style.padding = c._basePad.map(v => `${Math.round(v * s)}px`).join(' ');
                    if (c._baseBorderW > 0) c.style.borderWidth = `${Math.max(1, Math.round(c._baseBorderW * s))}px`;
                    c.querySelectorAll('.sp-image-group-avatar').forEach(av => {
                        if (av._baseW) {
                            av.style.width = `${Math.max(18, Math.round(av._baseW * s))}px`;
                            av.style.height = `${Math.max(18, Math.round(av._baseH * s))}px`;
                        }
                        if (av._baseBorderW > 0) av.style.borderWidth = `${Math.max(1, Math.round(av._baseBorderW * s))}px`;
                    });
                    c.querySelectorAll('.sp-image-group-field img').forEach(im => {
                        if (im._baseImgW) {
                            im.style.width = `${Math.max(12, Math.round(im._baseImgW * s))}px`;
                            im.style.height = `${Math.max(12, Math.round(im._baseImgH * s))}px`;
                        }
                    });
                });
                wrap.querySelectorAll('.sp-image-group-field').forEach(fieldEl => {
                    fieldEl.style.fontSize = `${Math.max(9, Math.round(fieldEl._baseFontSize * s * 10) / 10)}px`;
                });
            }
        }

        // 3. Per-field text fit safety net for extra-long individual labels or corner badges.
        wrap.querySelectorAll('.sp-image-group-field').forEach(fieldEl => {
            if (!fieldEl.clientWidth) return;
            const base = parseFloat(fieldEl.style.fontSize) || fieldEl._baseFontSize || 16;
            if (fieldEl.scrollWidth <= fieldEl.clientWidth + 1 || base <= 9) return;
            let lo = 9, hi = base, best = 9;
            while (hi - lo > 0.5) {
                const mid = (lo + hi) / 2;
                fieldEl.style.fontSize = `${mid}px`;
                if (fieldEl.scrollWidth <= fieldEl.clientWidth + 1) { best = mid; lo = mid; }
                else { hi = mid; }
            }
            fieldEl.style.fontSize = `${Math.floor(best * 10) / 10}px`;
        });

        // 4. Whole-strip transform fallback when horizontal/vertical strip still exceeds container bounds.
        const naturalW = wrap.scrollWidth;
        const naturalH = wrap.scrollHeight;
        const scale = Math.max(0.25, Math.min(1, availW / Math.max(1, naturalW), availH / Math.max(1, naturalH)));
        if (scale < 0.995) {
            const scaledW = naturalW * scale;
            const scaledH = naturalH * scale;
            const tx = alignH === 'center' ? Math.max(0, (availW - scaledW) / 2) : alignH === 'flex-end' ? Math.max(0, availW - scaledW) : 0;
            const ty = alignV === 'center' ? Math.max(0, (availH - scaledH) / 2) : alignV === 'flex-end' ? Math.max(0, availH - scaledH) : 0;
            wrap.style.position = 'absolute';
            wrap.style.left = `${padL}px`;
            wrap.style.top = `${padT}px`;
            wrap.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
        }
    };
    if ((deferredRingCards.length || autoScale) && typeof requestAnimationFrame === 'function') {
        container._igResizeFrame = requestAnimationFrame(() => {
            container._igResizeFrame = 0;
            for (const [card, styleObj] of deferredRingCards) {
                if (card.isConnected && card.offsetWidth > 0 && card.offsetHeight > 0) {
                    applyBorderEffects(card, styleObj, { type: 'box', width: card.offsetWidth, height: card.offsetHeight });
                }
            }
            applyGroupAutoScale();
        });
    }
    if (autoScale && typeof ResizeObserver !== 'undefined') {
        container._igResizeObserver = new ResizeObserver(() => applyGroupAutoScale());
        container._igResizeObserver.observe(container);
    }
    return true;
}

export { embedUrl, parseYouTubeUrl, renderImageGroupStrip };
