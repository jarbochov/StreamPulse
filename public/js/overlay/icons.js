
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

function renderIcon(node, value, style = {}) {
    node.replaceChildren();
    const cls = String(value || '').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
    if (!cls) return;
    const isFa = /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls);
    if (isFa && !document.querySelector('link[data-fa]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; link.dataset.fa = '1';
        document.head.appendChild(link);
    }
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

export { extractGraphemes, qrUrl, renderIcon };
