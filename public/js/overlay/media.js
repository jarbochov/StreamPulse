
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

function resolveGroupMembers(setId, status = {}) {
    if (!setId) return [];
    const sets = status?.variableSets || [];
    const setObj = sets.find(s => s && s.id === setId);
    if (setObj && Array.isArray(setObj.roster)) {
        return setObj.roster.filter(r => r && r.inGroup !== false);
    }
    if (setObj && Array.isArray(setObj.entries)) {
        return setObj.entries.filter(e => e && e.inGroup === true);
    }
    if (Array.isArray(status?.customVars)) {
        const rawVar = status.customVars.find(v => v && v.name === `${setId}_group_members`);
        if (rawVar?.value) {
            try {
                const parsed = JSON.parse(rawVar.value);
                if (Array.isArray(parsed)) return parsed;
            } catch {}
        }
    }
    return [];
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
    if (aspectRatio === '3:4') return { w: size, h: Math.round((size * 4) / 3) };
    return { w: size, h: size };
}

function applyGroupAvatarShape(node, shape = 'rounded') {
    node.style.clipPath = '';
    if (shape === 'circle') node.style.borderRadius = '50%';
    else if (shape === 'rounded') node.style.borderRadius = '10px';
    else if (shape === 'squircle') node.style.borderRadius = '28%';
    else if (shape === 'hexagon') {
        node.style.borderRadius = '0px';
        node.style.clipPath = 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)';
    } else if (shape === 'diamond') {
        node.style.borderRadius = '0px';
        node.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    } else {
        node.style.borderRadius = '0px';
    }
}

const IMAGE_GROUP_LAYOUTS = new Set(['row', 'column', 'grid', 'overlap', 'cards', 'chips', 'spotlight']);
const IMAGE_GROUP_SHAPES = new Set(['rounded', 'circle', 'square', 'squircle', 'hexagon', 'diamond']);

function renderImageGroupStrip(container, element, status, options = {}) {
    const cfg = element?.imageGroup || {};
    const imgField = cfg.imageField || 'image';
    const labelField = cfg.labelField || '';
    const subField = cfg.subField || '';
    const fallbackMode = cfg.fallbackMode === 'initials' ? 'initials' : 'skip';
    const sortOrder = ['roster', 'reverse', 'alpha'].includes(cfg.sortOrder) ? cfg.sortOrder : 'roster';
    const layout = IMAGE_GROUP_LAYOUTS.has(cfg.layout) ? cfg.layout : 'row';
    const shape = IMAGE_GROUP_SHAPES.has(cfg.shape) ? cfg.shape : (layout === 'overlap' || layout === 'chips' ? 'circle' : 'rounded');
    const aspectRatio = ['1:1', '4:3', '16:9', '3:4'].includes(cfg.aspectRatio) ? cfg.aspectRatio : '1:1';
    const baseSize = Math.max(16, Math.min(400, Number(cfg.size) || 56));
    const gap = Math.max(0, Math.min(80, Number(cfg.gap ?? 10)));
    const overlap = Math.max(4, Math.min(60, Number(cfg.overlap ?? 16)));
    const spotlightScale = Math.max(1.1, Math.min(2.0, Number(cfg.spotlightScale) || 1.35));
    const maxItems = Math.max(0, Math.min(60, Math.round(Number(cfg.maxItems) || 0)));
    const showOverflowBadge = cfg.showOverflowBadge !== false;

    const rawMembers = resolveGroupMembers(cfg.setId, status);
    let items = rawMembers.map(m => {
        const vals = m.values || {};
        const imgUrl = String(vals[imgField] ?? m[imgField] ?? m.image ?? '').trim();
        const labelText = labelField
            ? String(vals[labelField] ?? m[labelField] ?? m.label ?? '').trim()
            : String(m.text || m.label || Object.values(vals).find(v => typeof v === 'string' && v.trim() && v.trim() !== imgUrl) || '').trim();
        const subText = subField ? String(vals[subField] ?? m[subField] ?? m.sub ?? '').trim() : '';
        return { id: m.id, imgUrl, labelText, subText };
    }).filter(item => (fallbackMode === 'initials' ? (item.imgUrl !== '' || item.labelText !== '') : item.imgUrl !== ''));

    if (sortOrder === 'reverse') items = items.slice().reverse();
    else if (sortOrder === 'alpha') items = items.slice().sort((a, b) => (a.labelText || a.id || '').localeCompare(b.labelText || b.id || ''));

    const totalCount = items.length;
    const overflowCount = maxItems > 0 && totalCount > maxItems ? totalCount - maxItems : 0;
    if (maxItems > 0 && items.length > maxItems) items = items.slice(0, maxItems);

    container.replaceChildren();
    if (!items.length) return false;

    const showLabels = cfg.showLabels === true;
    const labelPosition = ['below', 'right', 'inside-bottom'].includes(cfg.labelPosition) ? cfg.labelPosition : 'below';
    const labelSize = Math.max(0, Math.min(72, Math.round(Number(cfg.labelSize) || 0)));
    const labelColor = String(cfg.labelColor || '').trim();
    const labelBg = String(cfg.labelBg || '').trim();
    const delimiter = String(cfg.delimiter || '');
    const delimiterColor = String(cfg.delimiterColor || '').trim();

    const avBorderW = Math.max(0, Math.min(12, Math.round(Number(cfg.avatarBorderWidth) || (layout === 'overlap' ? 2 : 0))));
    const avBorderC = String(cfg.avatarBorderColor || (layout === 'overlap' && !cfg.avatarBorderWidth ? '#0f172a' : 'rgba(255,255,255,0.28)')).trim();
    const avBg = String(cfg.avatarBg || '#1e293b').trim();
    const avShadow = Math.max(0, Math.min(40, Math.round(Number(cfg.avatarShadow) || 0)));

    const cardBg = String(cfg.cardBg || 'rgba(15,23,42,0.78)').trim();
    const cardBorderW = Math.max(0, Math.min(8, Math.round(Number(cfg.cardBorderWidth ?? 1))));
    const cardBorderC = String(cfg.cardBorderColor || 'rgba(255,255,255,0.16)').trim();
    const cardRadius = Math.max(0, Math.min(999, Math.round(Number(cfg.cardRadius ?? 12))));
    const cardPadding = Math.max(0, Math.min(32, Math.round(Number(cfg.cardPadding ?? 8))));

    const st = element.style || {};
    const alignH = st.textAlign === 'center' ? 'center' : st.textAlign === 'right' ? 'flex-end' : 'flex-start';
    const alignV = st.verticalAlign === 'middle' ? 'center' : st.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';

    const wrap = document.createElement('div');
    wrap.className = `sp-image-group sp-image-group-${layout}`;
    wrap.style.display = 'flex';
    wrap.style.flexDirection = layout === 'column' ? 'column' : 'row';
    wrap.style.flexWrap = (layout === 'grid' || layout === 'chips') ? 'wrap' : 'nowrap';
    wrap.style.gap = layout === 'overlap' ? '0px' : `${gap}px`;
    wrap.style.alignItems = layout === 'column' ? alignH : alignV;
    wrap.style.justifyContent = layout === 'column' ? alignV : alignH;
    if (layout === 'grid' || layout === 'chips') wrap.style.alignContent = alignV;

    items.forEach((item, idx) => {
        const isSpotlightLead = layout === 'spotlight' && idx === 0;
        const itemSize = isSpotlightLead ? Math.min(400, Math.round(baseSize * spotlightScale)) : baseSize;
        const dims = groupAvatarDimensions(itemSize, aspectRatio);
        const horizontalItem = layout === 'column' || layout === 'chips' || (showLabels && labelPosition === 'right');

        const card = document.createElement('div');
        card.className = `sp-image-group-item${layout === 'cards' ? ' sp-image-group-card' : layout === 'chips' ? ' sp-image-group-chip' : ''}${isSpotlightLead ? ' sp-image-group-lead' : ''}`;
        card.style.display = 'flex';
        card.style.flexDirection = horizontalItem ? 'row' : 'column';
        card.style.alignItems = 'center';
        card.style.gap = layout === 'chips' ? '8px' : horizontalItem ? '8px' : '4px';
        card.style.position = 'relative';
        if (layout === 'overlap' && idx > 0) {
            card.style.marginLeft = `-${overlap}px`;
        }
        if (layout === 'cards') {
            card.style.background = cardBg;
            card.style.border = cardBorderW > 0 ? `${cardBorderW}px solid ${cardBorderC}` : '0';
            card.style.borderRadius = `${cardRadius}px`;
            card.style.padding = `${cardPadding}px`;
            card.style.boxSizing = 'border-box';
        } else if (layout === 'chips') {
            card.style.background = cardBg;
            card.style.border = cardBorderW > 0 ? `${cardBorderW}px solid ${cardBorderC}` : '0';
            card.style.borderRadius = '999px';
            card.style.padding = '4px 12px 4px 4px';
            card.style.boxSizing = 'border-box';
        }

        const avBox = document.createElement('div');
        avBox.className = 'sp-image-group-avatar';
        avBox.style.width = `${dims.w}px`;
        avBox.style.height = `${dims.h}px`;
        avBox.style.flex = '0 0 auto';
        avBox.style.position = 'relative';
        avBox.style.overflow = 'hidden';
        avBox.style.boxSizing = 'border-box';
        avBox.style.background = avBg;
        if (avBorderW > 0 && shape !== 'hexagon' && shape !== 'diamond') {
            avBox.style.border = `${avBorderW}px solid ${avBorderC}`;
        }
        if (avShadow > 0) {
            avBox.style.boxShadow = `0 3px ${avShadow}px rgba(0,0,0,0.55)`;
        }
        applyGroupAvatarShape(avBox, shape);

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
                    mono.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.max(11, Math.round(itemSize * 0.38))}px;color:${labelColor || '#f8fafc'};user-select:none;`;
                    avBox.appendChild(mono);
                } else if (!options.preview) {
                    card.style.display = 'none';
                } else {
                    img.style.opacity = '0.25';
                }
            });
            avBox.appendChild(img);
        } else {
            const mono = document.createElement('span');
            mono.className = 'sp-image-group-initials';
            mono.textContent = computeInitials(item.labelText);
            mono.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.max(11, Math.round(itemSize * 0.38))}px;color:${labelColor || '#f8fafc'};user-select:none;`;
            avBox.appendChild(mono);
        }

        card.appendChild(avBox);

        if (showLabels && (item.labelText || item.subText)) {
            const textWrap = document.createElement('div');
            textWrap.className = 'sp-image-group-meta';
            textWrap.style.display = 'flex';
            textWrap.style.flexDirection = 'column';
            textWrap.style.minWidth = '0';
            const centered = !horizontalItem;
            textWrap.style.alignItems = centered ? 'center' : 'flex-start';
            textWrap.style.textAlign = centered ? 'center' : 'left';
            if (labelPosition === 'inside-bottom' && layout !== 'chips') {
                textWrap.style.position = 'absolute';
                textWrap.style.left = layout === 'cards' ? `${cardPadding + 4}px` : '4px';
                textWrap.style.right = layout === 'cards' ? `${cardPadding + 4}px` : '4px';
                textWrap.style.bottom = layout === 'cards' ? `${cardPadding + 4}px` : '4px';
                textWrap.style.background = (labelBg && labelBg !== 'transparent') ? labelBg : 'rgba(9,13,22,0.78)';
                textWrap.style.padding = '2px 6px';
                textWrap.style.borderRadius = '6px';
            } else if (labelBg && labelBg !== 'transparent') {
                textWrap.style.background = labelBg;
                textWrap.style.padding = '2px 7px';
                textWrap.style.borderRadius = '6px';
            }

            if (item.labelText) {
                const lbl = document.createElement('span');
                lbl.className = 'sp-image-group-label';
                lbl.textContent = item.labelText;
                if (labelSize > 0) lbl.style.fontSize = `${Math.round(isSpotlightLead ? labelSize * 1.15 : labelSize)}px`;
                if (labelColor) lbl.style.color = labelColor;
                if (!horizontalItem && labelPosition !== 'inside-bottom') {
                    lbl.style.maxWidth = `${Math.max(dims.w + 24, 96)}px`;
                }
                textWrap.appendChild(lbl);
            }
            if (item.subText) {
                const sub = document.createElement('span');
                sub.className = 'sp-image-group-sub';
                sub.textContent = item.subText;
                sub.style.fontSize = `${Math.max(10, labelSize > 0 ? Math.round(labelSize * 0.78) : 11)}px`;
                sub.style.opacity = '0.75';
                if (labelColor) sub.style.color = labelColor;
                textWrap.appendChild(sub);
            }
            card.appendChild(textWrap);
        }

        wrap.appendChild(card);

        if (delimiter && layout !== 'overlap' && idx < items.length - 1) {
            const sep = document.createElement('span');
            sep.className = 'sp-image-group-delim';
            sep.textContent = delimiter;
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
        badge.style.color = labelColor || '#f8fafc';
        badge.style.border = `${Math.max(1, avBorderW)}px solid ${avBorderC}`;
        badge.style.boxSizing = 'border-box';
        if (layout === 'overlap') badge.style.marginLeft = `-${overlap}px`;
        applyGroupAvatarShape(badge, shape);
        wrap.appendChild(badge);
    }

    container.appendChild(wrap);
    return true;
}

export { embedUrl, parseYouTubeUrl, renderImageGroupStrip };
