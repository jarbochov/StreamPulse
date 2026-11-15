
// QR codes are rendered by the server as SVG, so the overlay only needs an image URL.
// Font Awesome icon. The class list is restricted to safe characters, and the stylesheet loads on first use.
function extractGraphemes(str, max = 4) {
    const s = String(str || '').trim();
    if (!s) return '';
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        const out = [];
        for (const part of seg.segment(s)) {
            out.push(part.segment);
            if (out.length >= max) break;
        }
        return out.join('');
    }
    return Array.from(s).slice(0, max).join('');
}

function sanitizeIconClass(value) {
    const cls = String(value || '').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular').replace(/\s+/g, ' ');
    return /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls) ? cls : '';
}

function ensureFontAwesome() {
    if (!document.querySelector('link[data-fa]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; link.dataset.fa = '1';
        document.head.appendChild(link);
    }
}

const INLINE_ICON_RE = /\{\{\s*icon:([a-z0-9 _-]+)\s*\}\}/gi;

function renderInlineText(node, text) {
    const str = String(text ?? '');
    INLINE_ICON_RE.lastIndex = 0;
    const hasIcons = INLINE_ICON_RE.test(str);
    INLINE_ICON_RE.lastIndex = 0;
    if (!hasIcons) {
        if (node._inlineWrap) {
            node._inlineWrap.remove();
            node._inlineWrap = null;
            node._inlineSig = '';
        }
        if (!node.firstElementChild) {
            if (node.textContent !== str) node.textContent = str;
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
            if (tn.nodeValue !== str) tn.nodeValue = str;
        }
        return;
    }
    if (node._inlineSig === str && node._inlineWrap && node._inlineWrap.parentNode === node) return;
    node._inlineSig = str;
    if (node._textNode && node._textNode.parentNode === node) {
        node._textNode.nodeValue = '';
    } else if (!node.firstElementChild) {
        node.textContent = '';
    }
    let wrap = node._inlineWrap;
    if (!wrap || wrap.parentNode !== node) {
        wrap = document.createElement('span');
        wrap.className = 'sp-inline-text-wrap';
        wrap.style.display = 'contents';
        node.insertBefore(wrap, node.firstChild);
        node._inlineWrap = wrap;
    }
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = INLINE_ICON_RE.exec(str)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(str.slice(last, m.index)));
        const cls = sanitizeIconClass(m[1]);
        if (cls) {
            ensureFontAwesome();
            const icon = document.createElement('i');
            icon.className = `${cls} sp-inline-icon`;
            icon.setAttribute('aria-hidden', 'true');
            icon.style.cssText = 'display:inline-block;vertical-align:-0.08em;line-height:1;font-style:normal;';
            frag.appendChild(icon);
        } else {
            frag.appendChild(document.createTextNode(m[0]));
        }
        last = m.index + m[0].length;
    }
    if (last < str.length) frag.appendChild(document.createTextNode(str.slice(last)));
    wrap.replaceChildren(frag);
}

function replaceInlineIconTokensInHtml(html) {
    const str = String(html ?? '');
    if (!str.includes('icon:')) return str;
    return str.replace(INLINE_ICON_RE, (full, rawCls) => {
        const cls = sanitizeIconClass(rawCls);
        if (!cls) return full;
        ensureFontAwesome();
        return `<i class="${cls} sp-inline-icon" aria-hidden="true" style="display:inline-block;vertical-align:-0.08em;line-height:1;font-style:normal;"></i>`;
    });
}

function renderIcon(node, value, style = {}) {
    node.replaceChildren();
    const cls = String(value || '').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
    if (!cls) return;
    const isFa = /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls);
    if (isFa) ensureFontAwesome();
    const icon = document.createElement(isFa ? 'i' : 'span');
    if (isFa) {
        icon.className = cls;
        icon.style.cssText = 'font-size:100cqh;line-height:1;display:block;flex:none;';
    } else {
        icon.textContent = extractGraphemes(cls, 4);
        icon.style.cssText = 'font-size:88cqh;line-height:1;display:block;flex:none;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif;';
    }
    if (style.textStroke?.width > 0) {
        icon.style.webkitTextStroke = `${style.textStroke.width}px ${style.textStroke.color || '#000000'}`;
        icon.style.paintOrder = 'stroke fill';
    }
    if (style.textShadow?.blur > 0) {
        icon.style.filter = `drop-shadow(0 2px ${style.textShadow.blur}px ${style.textShadow.color || 'rgba(0,0,0,0.7)'})`;
    }
    node.style.overflow = 'visible';
    node.style.containerType = 'size';
    node.style.display = 'flex';
    node.style.alignItems = style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center';
    node.style.justifyContent = style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center';
    node.appendChild(icon);
}

function qrUrl(text, qr = {}) {
    const value = String(text ?? '').trim();
    if (!value) return '';
    const params = new URLSearchParams({ text: value, fg: qr.fg || '#000000', bg: qr.bg || '#ffffff', margin: String(qr.margin ?? 2), ecc: qr.ecc || 'M' });
    return `/api/qr?${params}`;
}

export { ensureFontAwesome, extractGraphemes, qrUrl, renderIcon, renderInlineText, replaceInlineIconTokensInHtml, sanitizeIconClass };
