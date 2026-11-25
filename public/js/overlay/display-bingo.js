import {
    normalizeDisplayBingo,
    resolveBingoBoard
} from '../../../shared/display-bingo.cjs';
import { resolveColorToken } from './variables.js';
import { loadGoogleFont } from './fonts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function ensureBingoStyles() {
    if (typeof document === 'undefined' || document.getElementById('sp-bingo-display-styles')) return;
    const style = document.createElement('style');
    style.id = 'sp-bingo-display-styles';
    style.textContent = `
@keyframes sp-bingo-stamp {
    0% { transform: scale(1.45); opacity: 0.2; }
    65% { transform: scale(0.94); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}
@keyframes sp-bingo-banner-pop {
    0% { transform: translate(-50%, -50%) scale(0.75); opacity: 0; }
    70% { transform: translate(-50%, -50%) scale(1.06); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
.sp-bingo-stamp.is-fresh {
    animation: sp-bingo-stamp 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.sp-bingo-banner {
    animation: sp-bingo-banner-pop 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.sp-bingo-display[data-bingo-theme="modern"] .sp-bingo-board {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 10px 28px rgba(0, 0, 0, 0.34);
}
.sp-bingo-display[data-bingo-theme="esports"] .sp-bingo-board {
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}
.sp-bingo-display[data-bingo-theme="arcade"] .sp-bingo-board {
    box-shadow: 0 0 16px color-mix(in srgb, var(--bng-stamp, #e879f9) 35%, transparent);
}
.sp-bingo-display[data-bingo-theme="minimal"] .sp-bingo-board {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
.sp-bingo-cell.is-winning {
    box-shadow: inset 0 0 0 2px var(--bng-win, #22c55e), 0 0 12px color-mix(in srgb, var(--bng-win, #22c55e) 50%, transparent);
}
html.sp-fx-paused .sp-bingo-stamp.is-fresh,
html.sp-fx-paused .sp-bingo-banner {
    animation: none !important;
}
@media (prefers-reduced-motion: reduce) {
    .sp-bingo-stamp.is-fresh,
    .sp-bingo-banner {
        animation: none !important;
    }
}`;
    document.head.appendChild(style);
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

function createStampGraphic(style, color, fresh) {
    if (style === 'fill') return null;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', `sp-bingo-stamp${fresh ? ' is-fresh' : ''}`);
    Object.assign(svg.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        padding: style === 'dauber' ? '10%' : '18%',
        boxSizing: 'border-box',
        pointerEvents: 'none'
    });
    if (style === 'dauber') {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', '20'); c.setAttribute('cy', '20'); c.setAttribute('r', '15');
        c.setAttribute('fill', color); c.setAttribute('opacity', '0.42');
        const ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('cx', '20'); ring.setAttribute('cy', '20'); ring.setAttribute('r', '15');
        ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', color); ring.setAttribute('stroke-width', '2.5'); ring.setAttribute('opacity', '0.85');
        svg.append(c, ring);
    } else if (style === 'x') {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', 'M9 9L31 31M31 9L9 31');
        p.setAttribute('stroke', color); p.setAttribute('stroke-width', '4.2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('opacity', '0.88');
        svg.appendChild(p);
    } else if (style === 'star') {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', 'M20 5l4.4 9 9.9 1.4-7.2 7 1.7 9.8L20 27.6 11.2 32.2l1.7-9.8-7.2-7 9.9-1.4z');
        p.setAttribute('fill', color); p.setAttribute('opacity', '0.38');
        p.setAttribute('stroke', color); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
    } else {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', 'M9 21l7 7 15-16');
        p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', '4.2');
        p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('opacity', '0.92');
        svg.appendChild(p);
    }
    return svg;
}

export function renderDisplayBingo(host, element, status = {}, definition) {
    ensureBingoStyles();
    const cfg = normalizeDisplayBingo(definition?.bingo);
    const binding = element?.display || {};
    const board = resolveBingoBoard(definition, binding, status);

    const prevStamped = host._bingoPrevStamped instanceof Set ? host._bingoPrevStamped : new Set();
    const nextStamped = new Set(board.cells.filter(c => c.stamped).map(c => c.index));

    const boardBg = resolveColor(cfg.boardBackground, '#0f172ad9', status);
    const cellBg = resolveColor(cfg.cellBackground, '#1e293bcc', status);
    const stampedBg = resolveColor(cfg.stampedBackground, '#f43f5e33', status);
    const stampColor = resolveColor(cfg.stampColor, '#f43f5e', status);
    const bingoColor = resolveColor(cfg.bingoColor, '#22c55e', status);
    const textColor = resolveColor(cfg.textColor, '#f8fafc', status);
    const borderColor = resolveColor(cfg.borderColor, '#ffffff26', status);
    const headerBg = resolveColor(cfg.headerBackground, '#f43f5e', status);
    const headerText = resolveColor(cfg.headerTextColor, '#ffffff', status);

    const fontRaw = String(cfg.fontFamily || 'sans-serif').trim();
    const fontFamily = (fontRaw.includes('{{') || fontRaw.startsWith('@'))
        ? (resolveColorToken(fontRaw, status, {}) || 'sans-serif')
        : fontRaw;
    if (typeof loadGoogleFont === 'function' && fontFamily && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(fontFamily)) {
        loadGoogleFont(fontFamily);
    }

    const root = document.createElement('div');
    root.className = 'sp-variable-display sp-bingo-display';
    root.dataset.bingoTheme = cfg.theme;
    root.dataset.bingoSize = String(board.size);
    root.dataset.bingoCount = String(board.bingoCount);
    root.style.setProperty('--bng-stamp', stampColor);
    root.style.setProperty('--bng-win', bingoColor);
    Object.assign(root.style, {
        width: '100%',
        height: '100%',
        padding: '4px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily
    });

    const boardEl = document.createElement('div');
    boardEl.className = 'sp-bingo-board';
    Object.assign(boardEl.style, {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: `${cfg.cellGap}px`,
        padding: `${cfg.padding}px`,
        background: boardBg,
        border: cfg.borderWidth > 0 ? `${cfg.borderWidth}px solid ${borderColor}` : 'none',
        borderRadius: `${cfg.radius}px`,
        boxSizing: 'border-box',
        overflow: 'hidden'
    });

    if (cfg.showHeader && cfg.headerText) {
        const letters = cfg.headerText.replace(/\s+/g, '');
        if (letters.length === board.size) {
            const headRow = document.createElement('div');
            Object.assign(headRow.style, {
                display: 'grid',
                gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))`,
                gap: `${cfg.cellGap}px`,
                flex: 'none'
            });
            for (const ch of letters) {
                const pill = document.createElement('div');
                pill.textContent = ch.toUpperCase();
                Object.assign(pill.style, {
                    textAlign: 'center',
                    padding: '4px 0',
                    borderRadius: `${Math.max(3, Math.round(cfg.radius * 0.5))}px`,
                    background: headerBg,
                    color: headerText,
                    fontWeight: '850',
                    fontSize: `${Math.max(12, Math.round(cfg.fontSize * 1.25))}px`,
                    letterSpacing: '0.08em'
                });
                headRow.appendChild(pill);
            }
            boardEl.appendChild(headRow);
        } else {
            const title = document.createElement('div');
            title.textContent = cfg.headerText;
            Object.assign(title.style, {
                textAlign: 'center',
                padding: '5px 10px',
                borderRadius: `${Math.max(3, Math.round(cfg.radius * 0.5))}px`,
                background: headerBg,
                color: headerText,
                fontWeight: '800',
                fontSize: `${Math.max(12, Math.round(cfg.fontSize * 1.15))}px`,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                flex: 'none'
            });
            boardEl.appendChild(title);
        }
    }

    const grid = document.createElement('div');
    grid.className = 'sp-bingo-grid';
    Object.assign(grid.style, {
        flex: '1',
        minHeight: '0',
        display: 'grid',
        gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${board.size}, minmax(0, 1fr))`,
        gap: `${cfg.cellGap}px`
    });

    for (const cell of board.cells) {
        const cellEl = document.createElement('div');
        cellEl.className = `sp-bingo-cell${cell.stamped ? ' is-stamped' : ''}${cell.winning ? ' is-winning' : ''}${cell.isFree ? ' is-free' : ''}`;
        cellEl.dataset.bingoCell = String(cell.index);
        cellEl.dataset.stamped = String(cell.stamped);
        const cellStampColor = cell.winning ? bingoColor : resolveColor(cfg.stampColor, stampColor, status, cell.entry);
        Object.assign(cellEl.style, {
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: '6px',
            textAlign: 'center',
            background: cell.stamped ? (cfg.stampStyle === 'fill' ? cellStampColor : stampedBg) : cellBg,
            color: textColor,
            border: cfg.borderWidth > 0 ? `${cfg.borderWidth}px solid ${cell.winning ? bingoColor : borderColor}` : 'none',
            borderRadius: `${Math.max(3, Math.round(cfg.radius * 0.65))}px`,
            overflow: 'hidden',
            boxSizing: 'border-box',
            fontSize: `${cfg.fontSize}px`,
            lineHeight: '1.2',
            fontWeight: cell.isFree ? '800' : '600'
        });

        if (cell.image) {
            const img = document.createElement('img');
            img.src = cell.image;
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            Object.assign(img.style, { width: '60%', maxHeight: '48%', objectFit: 'contain', opacity: cell.stamped ? '0.65' : '1' });
            cellEl.appendChild(img);
        }

        const label = document.createElement('span');
        label.textContent = cell.label;
        Object.assign(label.style, {
            position: 'relative',
            zIndex: '1',
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            webkitLineClamp: '3',
            webkitBoxOrient: 'vertical',
            overflow: 'hidden'
        });
        cellEl.appendChild(label);

        if (cell.stamped) {
            const fresh = !prevStamped.has(cell.index) && !cell.isFree;
            const stamp = createStampGraphic(cfg.stampStyle, cellStampColor, fresh);
            if (stamp) cellEl.appendChild(stamp);
        }
        grid.appendChild(cellEl);
    }
    boardEl.appendChild(grid);

    if (cfg.showBingoBanner && board.bingoCount > 0) {
        const banner = document.createElement('div');
        banner.className = 'sp-bingo-banner';
        banner.textContent = board.bingoCount > 1 ? `${cfg.bingoBannerText} ×${board.bingoCount}` : cfg.bingoBannerText;
        Object.assign(banner.style, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: '5',
            padding: '8px 22px',
            borderRadius: '999px',
            background: bingoColor,
            color: '#090d16',
            fontWeight: '900',
            fontSize: `${Math.max(16, Math.round(cfg.fontSize * 1.65))}px`,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            boxShadow: `0 10px 28px rgba(0,0,0,0.55), 0 0 18px ${bingoColor}`,
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
        });
        boardEl.appendChild(banner);
    }

    host._bingoPrevStamped = nextStamped;
    root.appendChild(boardEl);
    host.appendChild(root);
    return true;
}
