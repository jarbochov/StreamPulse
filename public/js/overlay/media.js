
import { applyBorderEffects, applyTextAnimation, decorationStyle, textEffectStyle } from './styles.js';

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
    if (typeof container.querySelectorAll !== 'function') return;
    container.querySelectorAll('.sp-image-group-item, .sp-image-group-avatar, .sp-image-group-field').forEach(node => {
        if (node._borderObserver) { node._borderObserver.disconnect(); node._borderObserver = null; }
        if (node._textAnimHandle?.stop) { try { node._textAnimHandle.stop(); } catch {} node._textAnimHandle = null; }
        node._textAnimWrap = null;
        node._textAnimSig = '';
    });
}

function resolveGroupMembers(setId, status = {}, onlySelected = false) {
    if (!setId) return [];
    const sets = status?.variableSets || [];
    const setObj = sets.find(s => s && s.id === setId);
    let members = [];
    if (setObj && Array.isArray(setObj.roster)) {
        members = setObj.roster.filter(r => r && r.inGroup !== false);
    } else if (setObj && Array.isArray(setObj.entries)) {
        members = setObj.entries.filter(e => e && e.inGroup === true);
    } else if (Array.isArray(status?.customVars)) {
        const rawVar = status.customVars.find(v => v && v.name === `${setId}_group_members`);
        if (rawVar?.value) {
            try {
                const parsed = JSON.parse(rawVar.value);
                if (Array.isArray(parsed)) members = parsed;
            } catch {}
        }
    }
    if (onlySelected && setObj) {
        const activeIds = new Set(Array.isArray(setObj.slots) ? setObj.slots.filter(Boolean) : []);
        if (setObj.activeEntryId) activeIds.add(setObj.activeEntryId);
        if (setObj.selectedEntryId) activeIds.add(setObj.selectedEntryId);
        if (activeIds.size > 0) members = members.filter(m => activeIds.has(m.id));
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
const FIELD_ROLE_SCALE = { title: 1, accent: 0.88, subtitle: 0.82, caption: 0.75, badge: 0.72 };

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
    return list.map((f, idx) => ({
        key: String(f.key),
        role: f.role || (idx === 0 ? 'title' : 'subtitle'),
        inline: f.inline === true,
        prefix: String(f.prefix || ''),
        suffix: String(f.suffix || ''),
        sizeScale: Math.max(50, Math.min(200, Number(f.sizeScale) || 100)),
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
    const { st, baseSize, isSpotlightLead, cfg, labelIdx, subIdx } = ctx;
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
    span.textContent = `${spec.prefix}${text}${spec.suffix}`;

    const roleFactor = FIELD_ROLE_SCALE[spec.role] ?? 0.9;
    const px = Math.max(9, Math.round(baseSize * roleFactor * (spec.sizeScale / 100) * (isSpotlightLead ? 1.12 : 1)));
    span.style.fontFamily = st.fontFamily || 'sans-serif';
    span.style.fontSize = `${px}px`;
    span.style.fontWeight = spec.role === 'badge' ? '700'
        : spec.role === 'title' ? (st.fontWeight && st.fontWeight !== '400' ? st.fontWeight : '600')
            : (st.fontWeight || '400');
    span.style.fontStyle = st.fontStyle === 'italic' ? 'italic' : 'normal';
    span.style.lineHeight = String(st.lineHeight || 1.2);
    if (st.letterSpacing) span.style.letterSpacing = `${st.letterSpacing}px`;
    if (st.textTransform && st.textTransform !== 'none') span.style.textTransform = st.textTransform;
    if (st.textDecoration && st.textDecoration !== 'none') span.style.textDecoration = st.textDecoration;
    if (st.tabularNums) span.style.fontVariantNumeric = 'tabular-nums';

    const labelColor = String(cfg.labelColor || '').trim();
    const subColor = String(cfg.subColor || '').trim();
    const defaultTextColor = st.color && st.color !== 'transparent' ? st.color : '#f8fafc';
    if (spec.role === 'badge') {
        span.style.display = 'inline-block';
        span.style.padding = '2px 7px';
        span.style.borderRadius = '999px';
        span.style.background = spec.bgColor || cfg.badgeBg || 'rgba(56,189,248,0.16)';
        span.style.color = spec.color || cfg.badgeColor || '#38bdf8';
    } else {
        if (spec.bgColor && spec.bgColor !== 'transparent') {
            span.style.display = 'inline-block';
            span.style.padding = '1px 6px';
            span.style.borderRadius = '5px';
            span.style.background = spec.bgColor;
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
        applyTextAnimation(span, st, 'text');
    }
    return span;
}

function buildGroupMetaContainer(renderedFields, ctx) {
    const { alignMode, horizontalItem, inside, fieldGap, labelBg, maxTextW } = ctx;
    const textWrap = document.createElement('div');
    textWrap.className = 'sp-image-group-meta';
    textWrap.style.display = 'flex';
    textWrap.style.flexDirection = 'column';
    textWrap.style.gap = `${fieldGap}px`;
    textWrap.style.minWidth = '0';

    const effectiveAlign = alignMode !== 'auto'
        ? alignMode
        : (horizontalItem ? (ctx.labelPosition === 'left' ? 'right' : 'left') : 'center');
    textWrap.style.alignItems = effectiveAlign === 'center' ? 'center' : effectiveAlign === 'right' ? 'flex-end' : 'flex-start';
    textWrap.style.textAlign = effectiveAlign;

    if (inside) {
        textWrap.style.position = 'absolute';
        textWrap.style.left = '0';
        textWrap.style.right = '0';
        textWrap.style[ctx.labelPosition === 'inside-top' ? 'top' : 'bottom'] = '0';
        textWrap.style.zIndex = '2';
        textWrap.style.background = (labelBg && labelBg !== 'transparent')
            ? labelBg
            : (ctx.labelPosition === 'inside-top'
                ? 'linear-gradient(180deg, rgba(9,13,22,0.88) 0%, rgba(9,13,22,0) 100%)'
                : 'linear-gradient(0deg, rgba(9,13,22,0.88) 0%, rgba(9,13,22,0) 100%)');
        textWrap.style.padding = ctx.labelPosition === 'inside-top' ? '4px 6px 8px' : '8px 6px 4px';
    } else if (labelBg && labelBg !== 'transparent') {
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
                inlineRow.style.justifyContent = effectiveAlign === 'center' ? 'center' : effectiveAlign === 'right' ? 'flex-end' : 'flex-start';
                textWrap.appendChild(inlineRow);
            }
            inlineRow.appendChild(node);
        } else {
            inlineRow = null;
            textWrap.appendChild(node);
        }
    });
    return textWrap;
}

function renderImageGroupStrip(container, element, status, options = {}) {
    cleanupGroupStrip(container);
    const cfg = element?.imageGroup || {};
    const imgField = cfg.imageField || 'image';
    const fallbackMode = cfg.fallbackMode === 'initials' ? 'initials' : 'skip';
    const sortOrder = ['roster', 'reverse', 'alpha'].includes(cfg.sortOrder) ? cfg.sortOrder : 'roster';
    const layout = IMAGE_GROUP_LAYOUTS.has(cfg.layout) ? cfg.layout : 'row';
    const shape = IMAGE_GROUP_SHAPES.has(cfg.shape) ? cfg.shape : (layout === 'overlap' || layout === 'chips' ? 'circle' : 'rounded');
    const aspectRatio = ['1:1', '4:3', '16:9', '3:4', '21:9'].includes(cfg.aspectRatio) ? cfg.aspectRatio : '1:1';
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
    const wrapItems = cfg.wrap === true || layout === 'grid' || layout === 'cards' || layout === 'chips';

    const fieldSpecs = resolveGroupFieldSpecs(cfg);
    const primarySpec = fieldSpecs[0] || { key: cfg.labelField || '', role: 'title' };
    const subSpec = fieldSpecs.find((f, i) => f.role === 'subtitle' || i === 1) || (cfg.subField ? { key: cfg.subField, role: 'subtitle' } : null);

    const rawMembers = resolveGroupMembers(cfg.setId, status, cfg.onlySelected === true);
    let items = rawMembers.map(m => {
        const vals = m.values || {};
        const imgUrl = String(vals[imgField] ?? m[imgField] ?? m.image ?? '').trim();
        const autoFallbackLabel = String(m.text || m.label || Object.values(vals).find(v => typeof v === 'string' && v.trim() && v.trim() !== imgUrl) || '').trim();
        const labelText = primarySpec.key
            ? readMemberFieldValue(m, primarySpec.key, '')
            : autoFallbackLabel;
        const subText = subSpec && subSpec.key ? readMemberFieldValue(m, subSpec.key, '') : '';
        return { id: m.id, raw: m, imgUrl, labelText, subText };
    }).filter(item => (fallbackMode === 'initials' ? (item.imgUrl !== '' || item.labelText !== '') : item.imgUrl !== ''));

    if (sortOrder === 'reverse') items = items.slice().reverse();
    else if (sortOrder === 'alpha') items = items.slice().sort((a, b) => (a.labelText || a.id || '').localeCompare(b.labelText || b.id || ''));

    const totalCount = items.length;
    const overflowCount = maxItems > 0 && totalCount > maxItems ? totalCount - maxItems : 0;
    if (maxItems > 0 && items.length > maxItems) items = items.slice(0, maxItems);

    container.replaceChildren();
    if (!items.length) return false;

    const st = element.style || {};
    const showLabels = cfg.showLabels === true;
    const labelPosition = IMAGE_GROUP_PLACEMENTS.has(cfg.labelPosition) ? cfg.labelPosition : 'below';
    const alignMode = ['auto', 'left', 'center', 'right'].includes(cfg.textAlign) ? cfg.textAlign : 'auto';
    const labelSize = Math.max(0, Math.min(72, Math.round(Number(cfg.labelSize) || 0)));
    const baseSizePx = labelSize > 0 ? labelSize : (Number(st.fontSize) || 15);
    const labelBg = String(cfg.labelBg || '').trim();
    const delimiter = String(cfg.delimiter || '');
    const delimiterColor = String(cfg.delimiterColor || '').trim();
    const showStatusDot = cfg.showStatusDot === true;

    const avBorderW = Math.max(0, Math.min(12, Math.round(Number(cfg.avatarBorderWidth) || (layout === 'overlap' ? 2 : 0))));
    const avBorderC = String(cfg.avatarBorderColor || (layout === 'overlap' && !cfg.avatarBorderWidth ? '#0f172a' : 'rgba(255,255,255,0.28)')).trim();
    const avBorderStyle = String(cfg.avatarBorderStyle || 'solid');
    const avBg = String(cfg.avatarBg || '#1e293b').trim();
    const avShadow = Math.max(0, Math.min(40, Math.round(Number(cfg.avatarShadow) || 0)));

    const isChip = layout === 'chips';
    const isBanner = layout === 'banners';
    const layoutAutoFrames = layout === 'cards' || isChip || isBanner;
    const isFramed = cfg.cardFrame === true || layoutAutoFrames;
    const cardBg = String(cfg.cardBg || 'rgba(15,23,42,0.78)').trim();
    const cardBorderW = Math.max(0, Math.min(16, Math.round(Number(cfg.cardBorderWidth ?? 1))));
    const cardBorderC = String(cfg.cardBorderColor || 'rgba(255,255,255,0.16)').trim();
    const cardBorderStyle = String(cfg.cardBorderStyle || 'solid');
    const cardRadius = Math.max(0, Math.min(999, Math.round(Number(cfg.cardRadius ?? 12))));
    const basePad = Math.max(0, Math.min(48, Math.round(Number(cfg.cardPadding ?? 8))));
    const cardShadow = Math.max(0, Math.min(48, Math.round(Number(cfg.cardShadow) || 0)));

    const alignH = st.textAlign === 'center' ? 'center' : st.textAlign === 'right' ? 'flex-end' : 'flex-start';
    const alignV = st.verticalAlign === 'middle' ? 'center' : st.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';

    const wrap = document.createElement('div');
    wrap.className = `sp-image-group sp-image-group-${layout}`;
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    wrap.style.boxSizing = 'border-box';

    const useCssGrid = (layout === 'grid') || (columns > 0 && wrapItems && layout !== 'overlap' && layout !== 'column' && layout !== 'banners');
    if (useCssGrid) {
        wrap.style.display = 'grid';
        wrap.style.gridTemplateColumns = columns > 0
            ? `repeat(${columns}, minmax(0, 1fr))`
            : `repeat(auto-fill, minmax(${Math.max(48, baseSize)}px, 1fr))`;
        wrap.style.columnGap = `${gap}px`;
        wrap.style.rowGap = `${rowGap}px`;
        wrap.style.justifyItems = st.textAlign === 'center' ? 'center' : st.textAlign === 'right' ? 'end' : 'start';
        wrap.style.alignItems = 'start';
        wrap.style.alignContent = alignV;
    } else if (layout === 'column' || isBanner) {
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.rowGap = `${rowGap}px`;
        wrap.style.columnGap = `${gap}px`;
        wrap.style.alignItems = (isBanner && st.textAlign !== 'center' && st.textAlign !== 'right') ? 'stretch' : alignH;
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

    items.forEach((item, idx) => {
        const isSpotlightLead = layout === 'spotlight' && idx === 0;
        const itemSize = isSpotlightLead ? Math.min(400, Math.round(baseSize * spotlightScale)) : baseSize;
        const dims = groupAvatarDimensions(itemSize, aspectRatio);
        const inside = showLabels && (labelPosition === 'inside-bottom' || labelPosition === 'inside-top') && !isChip;
        const splitMode = showLabels && labelPosition === 'split' && !isChip;
        const horizontalItem = showLabels && !inside && !splitMode && (
            labelPosition === 'right' || labelPosition === 'left' || ((isChip || isBanner) && labelPosition === 'below')
        );

        const card = document.createElement('div');
        card.className = `sp-image-group-item${isFramed && !isChip ? ' sp-image-group-card' : ''}${isChip ? ' sp-image-group-chip' : ''}${isBanner ? ' sp-image-group-banner' : ''}${isSpotlightLead ? ' sp-image-group-lead' : ''}`;
        card.style.display = 'flex';
        card.style.flexDirection = horizontalItem ? 'row' : 'column';
        card.style.alignItems = 'center';
        card.style.gap = `${innerGap}px`;
        card.style.position = 'relative';
        card.style.boxSizing = 'border-box';
        if (layout === 'overlap' && idx > 0) card.style.marginLeft = `-${overlap}px`;
        if (layout === 'stagger' && idx % 2 === 1 && staggerOffset > 0) card.style.marginTop = `${staggerOffset}px`;
        if (isBanner) card.style.width = '100%';

        if (isFramed) {
            card.style.background = cardBg;
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
                borderStyle: cardBorderStyle,
                borderRadius: isChip ? 999 : cardRadius,
                shape: isChip ? 'pill' : 'rectangle',
                shadow: cardShadow > 0 ? { blur: cardShadow, color: 'rgba(0,0,0,0.45)' } : undefined
            };
            applyBorderEffects(card, cardStyleObj, { type: 'box' });
            if (cardBorderW > 0 && cardBorderStyle !== 'solid' && cardBorderStyle !== 'dashed' && cardBorderStyle !== 'dotted' && cardBorderStyle !== 'double') {
                deferredRingCards.push([card, cardStyleObj]);
            }
        }

        const avBox = document.createElement('div');
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
                borderStyle: avBorderStyle,
                shape: shape === 'circle' ? 'circle' : 'rectangle',
                borderRadius: shape === 'squircle' ? Math.round(Math.min(dims.w, dims.h) * 0.26) : (shape === 'rounded' ? avatarRadius : 0),
                shadow: avShadow > 0 ? { blur: avShadow, color: 'rgba(0,0,0,0.55)' } : undefined
            };
            applyBorderEffects(avBox, avStyleObj, { type: 'box', width: dims.w, height: dims.h });
        }

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
                    const mono = document.createElement('span');
                    mono.className = 'sp-image-group-initials';
                    mono.textContent = computeInitials(item.labelText);
                    mono.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.max(11, Math.round(itemSize * 0.38))}px;color:${cfg.labelColor || st.color || '#f8fafc'};user-select:none;`;
                    avMedia.appendChild(mono);
                } else if (!options.preview) {
                    card.style.display = 'none';
                } else {
                    img.style.opacity = '0.25';
                }
            });
            avMedia.appendChild(img);
        } else {
            const mono = document.createElement('span');
            mono.className = 'sp-image-group-initials';
            mono.textContent = computeInitials(item.labelText);
            mono.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.max(11, Math.round(itemSize * 0.38))}px;color:${cfg.labelColor || st.color || '#f8fafc'};user-select:none;`;
            avMedia.appendChild(mono);
        }

        if (showStatusDot) {
            const dot = document.createElement('span');
            dot.className = 'sp-image-group-dot';
            const dotPx = Math.max(8, Math.round(Math.min(dims.w, dims.h) * 0.2));
            dot.style.cssText = `position:absolute;right:1px;bottom:1px;width:${dotPx}px;height:${dotPx}px;border-radius:50%;background:${cfg.badgeColor || '#22c55e'};border:2px solid rgba(9,13,22,0.92);box-shadow:0 0 8px rgba(34,197,94,0.45);z-index:4;pointer-events:none;`;
            avBox.appendChild(dot);
        }

        const renderedFields = [];
        if (showLabels) {
            let labelCount = 0;
            let subCount = 0;
            const activeSpecs = fieldSpecs.length ? fieldSpecs : (item.labelText ? [{ key: '', role: 'title', inline: false, prefix: '', suffix: '', sizeScale: 100, color: '', bgColor: '' }] : []);
            activeSpecs.forEach((spec, fIdx) => {
                const rawVal = spec.key ? readMemberFieldValue(item.raw, spec.key, fIdx === 0 && !cfg.labelField ? item.labelText : '') : item.labelText;
                if (!rawVal) return;
                const node = createStyledFieldNode(spec, rawVal, {
                    st, baseSize: baseSizePx, isSpotlightLead, cfg,
                    labelIdx: spec.role === 'title' ? labelCount++ : -1,
                    subIdx: spec.role === 'subtitle' ? subCount++ : -1
                });
                renderedFields.push({ spec, node });
            });
        }

        const metaCtx = {
            alignMode, horizontalItem, inside, labelPosition, fieldGap, labelBg,
            maxTextW: horizontalItem ? 0 : Math.max(dims.w + 36, 120)
        };

        if (splitMode && renderedFields.length) {
            const topList = renderedFields.slice(0, 1);
            const botList = renderedFields.slice(1);
            card.appendChild(buildGroupMetaContainer(topList, { ...metaCtx, inside: false }));
            card.appendChild(avBox);
            if (botList.length) card.appendChild(buildGroupMetaContainer(botList, { ...metaCtx, inside: false }));
        } else if (inside && renderedFields.length) {
            avMedia.appendChild(buildGroupMetaContainer(renderedFields, metaCtx));
            card.appendChild(avBox);
        } else if ((labelPosition === 'above' || labelPosition === 'left') && renderedFields.length) {
            card.appendChild(buildGroupMetaContainer(renderedFields, metaCtx));
            card.appendChild(avBox);
        } else {
            card.appendChild(avBox);
            if (renderedFields.length) card.appendChild(buildGroupMetaContainer(renderedFields, metaCtx));
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
        badge.style.background = cardBg;
        badge.style.color = cfg.labelColor || st.color || '#f8fafc';
        badge.style.border = `${Math.max(1, avBorderW)}px solid ${avBorderC}`;
        badge.style.boxSizing = 'border-box';
        if (layout === 'overlap') badge.style.marginLeft = `-${overlap}px`;
        applyGroupAvatarShape(badge, shape, avatarRadius);
        wrap.appendChild(badge);
    }

    container.appendChild(wrap);
    if (deferredRingCards.length && typeof requestAnimationFrame === 'function') {
        container._igResizeFrame = requestAnimationFrame(() => {
            container._igResizeFrame = 0;
            for (const [card, styleObj] of deferredRingCards) {
                if (card.isConnected && card.offsetWidth > 0 && card.offsetHeight > 0) {
                    applyBorderEffects(card, styleObj, { type: 'box', width: card.offsetWidth, height: card.offsetHeight });
                }
            }
        });
    }
    return true;
}

export { embedUrl, parseYouTubeUrl, renderImageGroupStrip };
