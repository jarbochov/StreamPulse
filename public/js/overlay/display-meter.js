import {
    formatMeterReadout,
    normalizeDisplayMeter,
    resolveMeterRows
} from '../../../shared/display-meter.cjs';
import { resolveColorToken } from './variables.js';
import { loadGoogleFont } from './fonts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function ensureMeterStyles() {
    if (typeof document === 'undefined' || document.getElementById('sp-meter-display-styles')) return;
    const style = document.createElement('style');
    style.id = 'sp-meter-display-styles';
    style.textContent = `
.sp-meter-bar-fill {
    transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1), height 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms ease;
}
.sp-meter-bar-trail {
    transition: width 760ms ease-out, height 760ms ease-out;
}
.sp-meter-ring-fg {
    transition: stroke-dashoffset 360ms cubic-bezier(0.22, 1, 0.36, 1), stroke 220ms ease;
}
.sp-meter-display[data-meter-theme="modern"] .sp-meter-row {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 22px rgba(0, 0, 0, 0.28);
}
.sp-meter-display[data-meter-theme="esports"] .sp-meter-row {
    box-shadow: inset 4px 0 0 var(--mtr-accent, #38bdf8), 0 8px 22px rgba(0, 0, 0, 0.42);
}
.sp-meter-display[data-meter-theme="esports"] .sp-meter-label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
}
.sp-meter-display[data-meter-theme="sports"] .sp-meter-row {
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0) 48%, rgba(0, 0, 0, 0.22) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 6px 18px rgba(0, 0, 0, 0.36);
}
.sp-meter-display[data-meter-theme="sports"] .sp-meter-label {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
}
.sp-meter-display[data-meter-theme="arcade"] .sp-meter-row {
    box-shadow: 0 0 12px color-mix(in srgb, var(--mtr-accent, #e879f9) 32%, transparent), inset 0 0 12px color-mix(in srgb, var(--mtr-accent, #e879f9) 14%, transparent);
}
.sp-meter-display[data-meter-theme="arcade"] .sp-meter-label {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 800;
}
.sp-meter-display[data-meter-theme="minimal"] .sp-meter-row {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
.sp-meter-display[data-meter-theme="minimal"] .sp-meter-label,
.sp-meter-display[data-meter-theme="minimal"] .sp-meter-readout {
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.88);
}
html.sp-fx-paused .sp-meter-bar-fill,
html.sp-fx-paused .sp-meter-bar-trail,
html.sp-fx-paused .sp-meter-ring-fg {
    transition: none !important;
}
@media (prefers-reduced-motion: reduce) {
    .sp-meter-bar-fill,
    .sp-meter-bar-trail,
    .sp-meter-ring-fg {
        transition: none !important;
    }
}`;
    document.head.appendChild(style);
}

function resolveMeterRowConfig(cfg, status, member, pct) {
    const col = (raw, fallback) => {
        if (!raw) return fallback;
        const str = String(raw).trim();
        if (member) {
            const m = /^\{\{member\.([a-z0-9_-]+)\}\}$/i.exec(str);
            if (m) return String(member.values?.[m[1]] ?? member[m[1]] ?? '').trim() || fallback;
        }
        if (!str.includes('{{') && !str.startsWith('@')) return str;
        return resolveColorToken(str, status, {}, member) || fallback;
    };
    const fontRaw = String(cfg.fontFamily || 'sans-serif').trim();
    const fontFamily = (fontRaw.includes('{{') || fontRaw.startsWith('@'))
        ? (resolveColorToken(fontRaw, status, {}, member) || 'sans-serif')
        : fontRaw;
    if (typeof loadGoogleFont === 'function' && fontFamily && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(fontFamily)) {
        loadGoogleFont(fontFamily);
    }
    let fillColor = col(cfg.fillColor, '#22c55e');
    if (cfg.useThresholds) {
        if (pct <= cfg.lowThreshold) fillColor = col(cfg.lowColor, '#ef4444');
        else if (pct <= cfg.midThreshold) fillColor = col(cfg.midColor, '#f59e0b');
    }
    return {
        ...cfg,
        fillColor,
        trackColor: col(cfg.trackColor, '#ffffff1a'),
        trailColor: col(cfg.trailColor, '#ffffff66'),
        labelColor: col(cfg.labelColor, '#f8fafc'),
        readoutColor: col(cfg.readoutColor, '#e2e8f0'),
        rowBackground: col(cfg.rowBackground, '#0f172ad9'),
        rowBorderColor: col(cfg.rowBorderColor, '#ffffff24'),
        fontFamily
    };
}

function createRingVisual(row, cfg) {
    const size = Math.max(48, Number(cfg.ringSize) || 96);
    const stroke = Math.max(6, Math.round(size * 0.11));
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - row.pct / 100);

    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position: 'relative', width: `${size}px`, height: `${size}px`, flex: 'none', display: 'grid', placeItems: 'center' });

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.style.transform = 'rotate(-90deg)';

    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(size / 2));
    bg.setAttribute('cy', String(size / 2));
    bg.setAttribute('r', String(r));
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', cfg.trackColor);
    bg.setAttribute('stroke-width', String(stroke));

    const fg = document.createElementNS(SVG_NS, 'circle');
    fg.setAttribute('cx', String(size / 2));
    fg.setAttribute('cy', String(size / 2));
    fg.setAttribute('r', String(r));
    fg.setAttribute('fill', 'none');
    fg.setAttribute('stroke', cfg.fillColor);
    fg.setAttribute('stroke-width', String(stroke));
    fg.setAttribute('stroke-linecap', 'round');
    fg.setAttribute('stroke-dasharray', String(circ));
    fg.setAttribute('stroke-dashoffset', String(offset));
    fg.setAttribute('class', 'sp-meter-ring-fg');
    fg.style.filter = `drop-shadow(0 0 6px color-mix(in srgb, ${cfg.fillColor} 50%, transparent))`;

    svg.append(bg, fg);
    wrap.appendChild(svg);

    if (cfg.readout !== 'none') {
        const center = document.createElement('span');
        center.className = 'sp-meter-readout';
        center.textContent = cfg.readout === 'percent' || cfg.readout === 'both'
            ? `${Math.round(row.pct)}%`
            : formatMeterReadout(row.value, row.cap, row.pct, cfg.readout);
        Object.assign(center.style, {
            position: 'absolute',
            fontWeight: '800',
            fontSize: `${Math.max(12, Math.round(size * 0.22))}px`,
            fontVariantNumeric: 'tabular-nums',
            color: cfg.readoutColor
        });
        wrap.appendChild(center);
    }
    return wrap;
}

export function renderDisplayMeter(host, element, status = {}, definition) {
    ensureMeterStyles();
    const baseCfg = normalizeDisplayMeter(definition?.meter);
    const binding = element?.display || {};
    const rows = resolveMeterRows(definition, binding, status);
    if (!rows.length) return false;

    const prevMap = host._meterPrevPct instanceof Map ? host._meterPrevPct : new Map();
    const nextMap = new Map();

    const root = document.createElement('div');
    root.className = 'sp-variable-display sp-meter-display';
    root.dataset.meterStyle = baseCfg.style;
    root.dataset.meterTheme = baseCfg.theme || 'modern';
    Object.assign(root.style, {
        width: '100%',
        height: '100%',
        padding: '6px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: (baseCfg.direction === 'horizontal' || baseCfg.style === 'ring' || baseCfg.style === 'vertical') ? 'row' : 'column',
        flexWrap: (baseCfg.direction === 'horizontal' || baseCfg.style === 'ring' || baseCfg.style === 'vertical') ? 'wrap' : 'nowrap',
        alignItems: baseCfg.style === 'vertical' ? 'stretch' : 'center',
        justifyContent: 'center',
        gap: `${baseCfg.rowGap}px`,
        fontFamily: baseCfg.fontFamily,
        fontSize: `${baseCfg.fontSize}px`,
        overflow: 'hidden'
    });

    for (const row of rows) {
        const cfg = resolveMeterRowConfig(baseCfg, status, row.entry || null, row.pct);
        const prevPct = prevMap.has(row.key) ? prevMap.get(row.key) : row.pct;
        nextMap.set(row.key, row.pct);

        const rowEl = document.createElement('div');
        rowEl.className = 'sp-meter-row';
        rowEl.dataset.meterKey = row.key;
        rowEl.dataset.meterPct = String(Math.round(row.pct));
        rowEl.style.setProperty('--mtr-accent', cfg.fillColor);

        const isVertical = cfg.style === 'vertical';
        const isRing = cfg.style === 'ring';

        Object.assign(rowEl.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: (isRing || isVertical) ? 'center' : 'stretch',
            gap: '8px',
            width: (isRing || isVertical) ? 'auto' : '100%',
            minWidth: isRing ? `${cfg.ringSize + cfg.rowPadding * 2}px` : isVertical ? '76px' : '0',
            padding: `${cfg.rowPadding}px`,
            borderRadius: `${cfg.rowRadius}px`,
            background: cfg.rowBackground,
            border: cfg.rowBorderWidth > 0 ? `${cfg.rowBorderWidth}px solid ${cfg.rowBorderColor}` : 'none',
            boxSizing: 'border-box',
            fontFamily: cfg.fontFamily
        });

        const readoutText = formatMeterReadout(row.value, row.cap, row.pct, cfg.readout);

        if (isRing) {
            rowEl.appendChild(createRingVisual(row, cfg));
            if (cfg.showLabel) {
                const lbl = document.createElement('span');
                lbl.className = 'sp-meter-label';
                lbl.textContent = row.label;
                Object.assign(lbl.style, { color: cfg.labelColor, fontWeight: '700', fontSize: `${cfg.fontSize}px`, textAlign: 'center' });
                rowEl.appendChild(lbl);
            }
            if (cfg.readout === 'both') {
                const sub = document.createElement('span');
                sub.className = 'sp-meter-readout';
                sub.textContent = `${row.value} / ${row.cap}`;
                Object.assign(sub.style, { color: cfg.readoutColor, fontSize: `${Math.max(11, Math.round(cfg.fontSize * 0.85))}px`, fontVariantNumeric: 'tabular-nums', opacity: '0.85' });
                rowEl.appendChild(sub);
            }
        } else if (isVertical) {
            const track = document.createElement('div');
            Object.assign(track.style, {
                position: 'relative',
                width: `${Math.max(16, cfg.barHeight)}px`,
                height: `${Math.max(80, cfg.ringSize)}px`,
                borderRadius: `${Math.round(cfg.barHeight / 2)}px`,
                background: cfg.trackColor,
                overflow: 'hidden'
            });
            const fill = document.createElement('div');
            fill.className = 'sp-meter-bar-fill';
            Object.assign(fill.style, {
                position: 'absolute',
                left: '0', right: '0', bottom: '0',
                height: `${row.pct}%`,
                background: cfg.fillColor,
                boxShadow: `0 0 10px color-mix(in srgb, ${cfg.fillColor} 55%, transparent)`
            });
            track.appendChild(fill);
            rowEl.appendChild(track);
            if (cfg.showLabel) {
                const lbl = document.createElement('span');
                lbl.className = 'sp-meter-label';
                lbl.textContent = row.label;
                Object.assign(lbl.style, { color: cfg.labelColor, fontWeight: '700', fontSize: `${cfg.fontSize}px` });
                rowEl.appendChild(lbl);
            }
            if (readoutText) {
                const rd = document.createElement('span');
                rd.className = 'sp-meter-readout';
                rd.textContent = readoutText;
                Object.assign(rd.style, { color: cfg.readoutColor, fontSize: `${Math.max(11, Math.round(cfg.fontSize * 0.85))}px`, fontVariantNumeric: 'tabular-nums', fontWeight: '700' });
                rowEl.appendChild(rd);
            }
        } else {
            // Horizontal bar or segmented HP bar
            if (cfg.showLabel || readoutText) {
                const header = document.createElement('div');
                Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' });
                if (cfg.showLabel) {
                    const lbl = document.createElement('span');
                    lbl.className = 'sp-meter-label';
                    lbl.textContent = row.label;
                    Object.assign(lbl.style, { color: cfg.labelColor, fontWeight: '700', fontSize: `${cfg.fontSize}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
                    header.appendChild(lbl);
                }
                if (readoutText) {
                    const rd = document.createElement('span');
                    rd.className = 'sp-meter-readout';
                    rd.textContent = readoutText;
                    Object.assign(rd.style, { color: cfg.readoutColor, fontWeight: '700', fontSize: `${Math.max(12, Math.round(cfg.fontSize * 0.9))}px`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
                    header.appendChild(rd);
                }
                rowEl.appendChild(header);
            }

            if (cfg.style === 'segmented') {
                const segs = Math.max(2, Math.min(40, Number(cfg.segments) || 10));
                const segWrap = document.createElement('div');
                Object.assign(segWrap.style, { display: 'grid', gridTemplateColumns: `repeat(${segs}, minmax(0, 1fr))`, gap: '4px', height: `${cfg.barHeight}px` });
                const filledSegs = (row.pct / 100) * segs;
                for (let i = 0; i < segs; i++) {
                    const cell = document.createElement('div');
                    const segFill = Math.max(0, Math.min(1, filledSegs - i));
                    Object.assign(cell.style, {
                        position: 'relative',
                        borderRadius: '3px',
                        background: cfg.trackColor,
                        overflow: 'hidden'
                    });
                    if (segFill > 0) {
                        const inner = document.createElement('div');
                        Object.assign(inner.style, {
                            width: `${segFill * 100}%`,
                            height: '100%',
                            background: cfg.fillColor,
                            boxShadow: `0 0 8px color-mix(in srgb, ${cfg.fillColor} 45%, transparent)`
                        });
                        cell.appendChild(inner);
                    }
                    segWrap.appendChild(cell);
                }
                rowEl.appendChild(segWrap);
            } else {
                const track = document.createElement('div');
                Object.assign(track.style, {
                    position: 'relative',
                    width: '100%',
                    height: `${cfg.barHeight}px`,
                    borderRadius: `${Math.round(cfg.barHeight / 2)}px`,
                    background: cfg.trackColor,
                    overflow: 'hidden'
                });
                if (cfg.trail && prevPct > row.pct) {
                    const trail = document.createElement('div');
                    trail.className = 'sp-meter-bar-trail';
                    Object.assign(trail.style, {
                        position: 'absolute',
                        inset: '0 auto 0 0',
                        width: `${prevPct}%`,
                        background: cfg.trailColor,
                        borderRadius: 'inherit'
                    });
                    track.appendChild(trail);
                    requestAnimationFrame(() => { trail.style.width = `${row.pct}%`; });
                }
                const fill = document.createElement('div');
                fill.className = 'sp-meter-bar-fill';
                Object.assign(fill.style, {
                    position: 'relative',
                    width: `${row.pct}%`,
                    height: '100%',
                    background: cfg.fillColor,
                    borderRadius: 'inherit',
                    boxShadow: `0 0 10px color-mix(in srgb, ${cfg.fillColor} 50%, transparent)`
                });
                track.appendChild(fill);
                rowEl.appendChild(track);
            }
        }
        root.appendChild(rowEl);
    }

    host._meterPrevPct = nextMap;
    host.appendChild(root);
    return true;
}
