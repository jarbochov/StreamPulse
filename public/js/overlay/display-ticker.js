import {
    normalizeDisplayTicker,
    resolveTickerItems
} from '../../../shared/display-ticker.cjs';
import { resolveColorToken } from './variables.js';
import { loadGoogleFont } from './fonts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function ensureTickerStyles() {
    if (typeof document === 'undefined' || document.getElementById('sp-ticker-display-styles')) return;
    const style = document.createElement('style');
    style.id = 'sp-ticker-display-styles';
    style.textContent = `
@keyframes sp-ticker-left {
    0% { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(-50%, 0, 0); }
}
@keyframes sp-ticker-right {
    0% { transform: translate3d(-50%, 0, 0); }
    100% { transform: translate3d(0, 0, 0); }
}
.sp-ticker-track {
    display: flex;
    align-items: center;
    width: max-content;
    will-change: transform;
}
.sp-ticker-display[data-ticker-dir="left"] .sp-ticker-track {
    animation: sp-ticker-left var(--sp-ticker-dur, 20s) linear infinite;
}
.sp-ticker-display[data-ticker-dir="right"] .sp-ticker-track {
    animation: sp-ticker-right var(--sp-ticker-dur, 20s) linear infinite;
}
.sp-ticker-viewport {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent);
    mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent);
}
.sp-ticker-display[data-ticker-theme="modern"] .sp-ticker-shell {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 22px rgba(0, 0, 0, 0.28);
}
.sp-ticker-display[data-ticker-theme="esports"] .sp-ticker-shell {
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.42);
}
.sp-ticker-display[data-ticker-theme="sports"] .sp-ticker-shell {
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 50%, rgba(0, 0, 0, 0.2) 100%);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.36);
}
.sp-ticker-display[data-ticker-theme="arcade"] .sp-ticker-shell {
    box-shadow: 0 0 12px color-mix(in srgb, var(--tkr-accent, #e879f9) 35%, transparent);
}
.sp-ticker-display[data-ticker-theme="minimal"] .sp-ticker-shell {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
.sp-ticker-display[data-ticker-theme="minimal"] .sp-ticker-item {
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.88);
}
html.sp-fx-paused .sp-ticker-track {
    animation-play-state: paused !important;
}
@media (prefers-reduced-motion: reduce) {
    .sp-ticker-track {
        animation: none !important;
    }
}`;
    document.head.appendChild(style);
}

function createSeparator(kind, color) {
    if (kind === 'none') return null;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('width', '10');
    svg.setAttribute('height', '10');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.flex = 'none';
    svg.style.opacity = '0.75';
    if (kind === 'dot') {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', '6'); c.setAttribute('cy', '6'); c.setAttribute('r', '3'); c.setAttribute('fill', color);
        svg.appendChild(c);
    } else if (kind === 'diamond') {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', 'M6 1.5L10.5 6 6 10.5 1.5 6z'); p.setAttribute('fill', color);
        svg.appendChild(p);
    } else if (kind === 'slash') {
        const l = document.createElementNS(SVG_NS, 'line');
        l.setAttribute('x1', '3'); l.setAttribute('y1', '10.5'); l.setAttribute('x2', '9'); l.setAttribute('y2', '1.5');
        l.setAttribute('stroke', color); l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
        svg.appendChild(l);
    } else {
        const r = document.createElementNS(SVG_NS, 'rect');
        r.setAttribute('x', '5'); r.setAttribute('y', '1.5'); r.setAttribute('width', '2'); r.setAttribute('height', '9'); r.setAttribute('rx', '1'); r.setAttribute('fill', color);
        svg.appendChild(r);
    }
    return svg;
}

function resolveColor(raw, fallback, status, member = null) {
    if (!raw) return fallback;
    const str = String(raw).trim();
    if (member) {
        const m = /^\{\{member\.([a-z0-9_-]+)\}\}$/i.exec(str);
        if (m) return String(member.values?.[m[1]] ?? member[m[1]] ?? '').trim() || fallback;
    }
    if (!str.includes('{{') && !str.startsWith('@')) return str;
    return resolveColorToken(str, status, {}, member) || fallback;
}

export function renderDisplayTicker(host, element, status = {}, definition) {
    ensureTickerStyles();
    const cfg = normalizeDisplayTicker(definition?.ticker);
    const binding = element?.display || {};
    const items = resolveTickerItems(definition, binding, status);
    if (!items.length) return false;

    const bg = resolveColor(cfg.background, '#090d16eb', status);
    const textColor = resolveColor(cfg.textColor, '#f8fafc', status);
    const accentColor = resolveColor(cfg.accentColor, '#38bdf8', status);
    const badgeBg = resolveColor(cfg.badgeBackground, '#38bdf8', status);
    const badgeText = resolveColor(cfg.badgeTextColor, '#090d16', status);
    const borderColor = resolveColor(cfg.borderColor, '#38bdf844', status);
    const fontRaw = String(cfg.fontFamily || 'sans-serif').trim();
    const fontFamily = (fontRaw.includes('{{') || fontRaw.startsWith('@'))
        ? (resolveColorToken(fontRaw, status, {}) || 'sans-serif')
        : fontRaw;
    if (typeof loadGoogleFont === 'function' && fontFamily && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(fontFamily)) {
        loadGoogleFont(fontFamily);
    }

    const root = document.createElement('div');
    root.className = 'sp-variable-display sp-ticker-display';
    root.dataset.tickerTheme = cfg.theme;
    root.dataset.tickerDir = cfg.direction;
    root.style.setProperty('--tkr-accent', accentColor);
    Object.assign(root.style, {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '4px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily
    });

    const shell = document.createElement('div');
    shell.className = 'sp-ticker-shell';
    Object.assign(shell.style, {
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: `${cfg.height}px`,
        background: bg,
        border: cfg.borderWidth > 0 ? `${cfg.borderWidth}px solid ${borderColor}` : 'none',
        borderRadius: `${cfg.radius}px`,
        overflow: 'hidden',
        boxSizing: 'border-box'
    });

    if (cfg.badgeText) {
        const badge = document.createElement('div');
        badge.className = 'sp-ticker-badge';
        badge.textContent = cfg.badgeText;
        Object.assign(badge.style, {
            display: 'inline-flex',
            alignItems: 'center',
            height: '100%',
            padding: '0 14px',
            background: badgeBg,
            color: badgeText,
            fontSize: `${Math.max(11, Math.round(cfg.fontSize * 0.82))}px`,
            fontWeight: '850',
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            flex: 'none'
        });
        shell.appendChild(badge);
    }

    const viewport = document.createElement('div');
    viewport.className = 'sp-ticker-viewport';
    const track = document.createElement('div');
    track.className = 'sp-ticker-track';

    const buildPass = () => {
        const pass = document.createElement('div');
        Object.assign(pass.style, {
            display: 'flex',
            alignItems: 'center',
            gap: `${cfg.itemGap}px`,
            paddingRight: `${cfg.itemGap}px`,
            flex: 'none'
        });
        for (const item of items) {
            const itemAccent = resolveColor(cfg.accentColor, accentColor, status, item.entry);
            const node = document.createElement('span');
            node.className = 'sp-ticker-item';
            node.dataset.tickerItem = item.key;
            Object.assign(node.style, {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: textColor,
                fontSize: `${cfg.fontSize}px`,
                fontWeight: '650',
                whiteSpace: 'nowrap'
            });
            if (item.image) {
                const img = document.createElement('img');
                img.src = item.image;
                img.alt = '';
                img.referrerPolicy = 'no-referrer';
                const imgSize = Math.max(18, Math.round(cfg.height * 0.62));
                Object.assign(img.style, { width: `${imgSize}px`, height: `${imgSize}px`, borderRadius: '4px', objectFit: 'cover', flex: 'none' });
                node.appendChild(img);
            }
            const mainText = document.createElement('span');
            mainText.textContent = item.text;
            node.appendChild(mainText);
            if (item.sub) {
                const sub = document.createElement('span');
                sub.textContent = item.sub;
                Object.assign(sub.style, { opacity: '0.72', fontWeight: '500', fontSize: `${Math.max(11, Math.round(cfg.fontSize * 0.88))}px` });
                node.appendChild(sub);
            }
            pass.appendChild(node);
            const sep = createSeparator(cfg.separator, itemAccent);
            if (sep) pass.appendChild(sep);
        }
        return pass;
    };

    const pass1 = buildPass();
    const pass2 = buildPass();
    pass2.setAttribute('aria-hidden', 'true');
    track.append(pass1, pass2);

    // Estimate duration from content length & speed (px/sec), then refine once mounted
    const estPx = items.reduce((sum, it) => sum + (it.text.length + it.sub.length) * (cfg.fontSize * 0.62) + cfg.itemGap + 24, 0);
    const estSec = Math.max(4, Math.round((estPx / Math.max(15, cfg.speed)) * 10) / 10);
    track.style.setProperty('--sp-ticker-dur', `${estSec}s`);

    viewport.appendChild(track);
    shell.appendChild(viewport);
    root.appendChild(shell);
    host.appendChild(root);

    requestAnimationFrame(() => {
        const measured = pass1.getBoundingClientRect().width;
        if (measured > 20) {
            const dur = Math.max(3, Math.round((measured / Math.max(15, cfg.speed)) * 10) / 10);
            track.style.setProperty('--sp-ticker-dur', `${dur}s`);
        }
    });

    return true;
}
