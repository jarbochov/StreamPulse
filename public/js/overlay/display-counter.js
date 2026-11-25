import {
    formatCounterReadout,
    normalizeDisplayCounter,
    resolveCounterRows
} from '../../../shared/display-counter.cjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_RENDER_MARKERS = 100;

const SHAPE_PATHS = {
    hearts: 'M12 20.6C12 20.6 3.5 15.1 3.5 9.1C3.5 6.2 5.7 4 8.4 4C10.1 4 11.4 4.9 12 6.2C12.6 4.9 13.9 4 15.6 4C18.3 4 20.5 6.2 20.5 9.1C20.5 15.1 12 20.6 12 20.6Z',
    stars: 'M12 2.6l2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 17.16l-5.7 3.01 1.09-6.36-4.62-4.5 6.38-.93z',
    diamonds: 'M12 2.5L21 12l-9 9.5L3 12z'
};

function ensureCounterStyles() {
    if (typeof document === 'undefined' || document.getElementById('sp-counter-display-styles')) return;
    const style = document.createElement('style');
    style.id = 'sp-counter-display-styles';
    style.textContent = `
@keyframes sp-counter-pop {
    0% { transform: scale(0.55); opacity: 0.35; }
    65% { transform: scale(1.16); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}
@keyframes sp-tally-slash {
    0% { stroke-dashoffset: 40; opacity: 0.25; }
    100% { stroke-dashoffset: 0; opacity: 1; }
}
.sp-counter-marker.is-pop {
    animation: sp-counter-pop 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.sp-tally-slash.is-pop {
    stroke-dasharray: 40;
    animation: sp-tally-slash 240ms ease-out both;
}
html.sp-fx-paused .sp-counter-marker.is-pop,
html.sp-fx-paused .sp-tally-slash.is-pop {
    animation: none !important;
}
@media (prefers-reduced-motion: reduce) {
    .sp-counter-marker.is-pop,
    .sp-tally-slash.is-pop {
        animation: none !important;
    }
}`;
    document.head.appendChild(style);
}

function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) {
        if (val !== undefined && val !== null) node.setAttribute(key, String(val));
    }
    return node;
}

function createShapeMarker(style, state, cfg, pop) {
    // state: 'filled' | 'empty' | 'overflow' | 'cap'
    const isFilled = state !== 'empty';
    const fill = state === 'overflow'
        ? cfg.overflowColor
        : state === 'cap'
            ? (cfg.capReachedColor || cfg.filledColor)
            : isFilled
                ? cfg.filledColor
                : cfg.emptyColor;
    const stroke = state === 'overflow'
        ? cfg.overflowColor
        : state === 'cap'
            ? (cfg.capReachedColor || cfg.filledColor)
            : isFilled
                ? cfg.filledColor
                : cfg.outlineColor;
    const sw = Math.max(0.5, Number(cfg.strokeWidth) || 2);
    const size = Math.max(10, Number(cfg.markerSize) || 26);

    const svg = svgEl('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': 'true',
        class: `sp-counter-marker${pop ? ' is-pop' : ''}`,
        'data-marker-state': state,
        'data-marker-style': style
    });
    svg.style.display = 'block';
    svg.style.flex = 'none';
    svg.style.overflow = 'visible';

    if (style === 'pips') {
        svg.appendChild(svgEl('circle', {
            cx: 12,
            cy: 12,
            r: 8.5,
            fill,
            stroke,
            'stroke-width': sw
        }));
    } else if (style === 'squares') {
        svg.appendChild(svgEl('rect', {
            x: 3.5,
            y: 3.5,
            width: 17,
            height: 17,
            rx: 3.5,
            fill,
            stroke,
            'stroke-width': sw
        }));
    } else if (style === 'bars') {
        svg.appendChild(svgEl('rect', {
            x: 6,
            y: 3,
            width: 12,
            height: 18,
            rx: 3,
            fill,
            stroke,
            'stroke-width': sw
        }));
    } else {
        svg.appendChild(svgEl('path', {
            d: SHAPE_PATHS[style] || SHAPE_PATHS.hearts,
            fill,
            stroke,
            'stroke-width': sw,
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round'
        }));
    }
    return svg;
}

function createTallyGroup(filledInGroup, totalInGroup, isChalk, color, emptyStrokeColor, cfg, popFromIndex = -1, groupStartIndex = 0) {
    const size = Math.max(12, Number(cfg.markerSize) || 26);
    const width = Math.round(size * 1.42);
    const height = size;
    const sw = Math.max(1.5, Number(cfg.strokeWidth) || 2.4);

    const svg = svgEl('svg', {
        viewBox: '0 0 38 28',
        width,
        height,
        fill: 'none',
        'aria-hidden': 'true',
        class: 'sp-counter-tally-group',
        'data-tally-filled': filledInGroup,
        'data-tally-total': totalInGroup
    });
    svg.style.display = 'block';
    svg.style.flex = 'none';
    svg.style.overflow = 'visible';

    // Up to 4 vertical strokes
    const xs = [6, 13, 20, 27];
    const chalkOffsets = [
        { x1: 6.6, y1: 3.6, x2: 5.4, y2: 24.4 },
        { x1: 12.8, y1: 4.2, x2: 13.5, y2: 23.8 },
        { x1: 20.5, y1: 3.8, x2: 19.6, y2: 24.3 },
        { x1: 26.8, y1: 4.3, x2: 27.6, y2: 23.9 }
    ];

    const verticals = Math.min(4, totalInGroup);
    for (let i = 0; i < verticals; i++) {
        const isFilled = i < filledInGroup;
        const globalIdx = groupStartIndex + i;
        const pop = isFilled && popFromIndex >= 0 && globalIdx >= popFromIndex;
        const coords = isChalk
            ? chalkOffsets[i]
            : { x1: xs[i], y1: 4, x2: xs[i], y2: 24 };
        svg.appendChild(svgEl('line', {
            ...coords,
            stroke: isFilled ? color : emptyStrokeColor,
            'stroke-width': sw,
            'stroke-linecap': 'round',
            opacity: isFilled ? 1 : 0.45,
            class: `sp-counter-marker${pop ? ' is-pop' : ''}`,
            'data-marker-state': isFilled ? 'filled' : 'empty'
        }));
    }

    // 5th mark: diagonal scratch-through slash
    if (totalInGroup >= 5) {
        const isFilled = filledInGroup >= 5;
        const globalIdx = groupStartIndex + 4;
        const pop = isFilled && popFromIndex >= 0 && globalIdx >= popFromIndex;
        const slashCoords = isChalk
            ? { x1: 2.2, y1: 21.6, x2: 32.4, y2: 6.4 }
            : { x1: 2.5, y1: 21, x2: 31.5, y2: 7 };
        svg.appendChild(svgEl('line', {
            ...slashCoords,
            stroke: isFilled ? color : emptyStrokeColor,
            'stroke-width': sw * 1.08,
            'stroke-linecap': 'round',
            opacity: isFilled ? 1 : 0.35,
            class: `sp-tally-slash${pop ? ' is-pop' : ''}`,
            'data-marker-state': isFilled ? 'filled' : 'empty'
        }));
    }

    return svg;
}

function buildMarkersNode(value, cap, cfg, prevValue) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-counter-markers';
    const isTally = cfg.style === 'tally' || cfg.style === 'tally-chalk';
    const gap = Math.max(0, Number(cfg.markerGap) || 6);
    const perRow = Math.max(0, Math.round(Number(cfg.perRow) || 0));

    const rawCount = Math.max(0, Math.floor(Number(value) || 0));
    const clampedCount = cap != null && cfg.overflowMode === 'clamp' ? Math.min(rawCount, cap) : rawCount;
    const isCapReached = cap != null && rawCount >= cap;
    const animate = cfg.animate === 'pop' && prevValue !== undefined && rawCount > prevValue;
    const popFromIndex = animate ? Math.max(0, Math.floor(prevValue)) : -1;

    Object.assign(wrap.style, {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${isTally ? Math.max(gap, 10) : gap}px`,
        justifyContent: cfg.align === 'center' ? 'center' : cfg.align === 'right' ? 'flex-end' : 'flex-start'
    });

    if (cfg.style === 'number') {
        const num = document.createElement('span');
        num.className = `sp-counter-number-only${animate ? ' sp-counter-marker is-pop' : ''}`;
        const readoutMode = cfg.readout === 'none' ? (cap != null ? 'fraction' : 'value') : cfg.readout;
        num.textContent = formatCounterReadout(value, cap, readoutMode);
        Object.assign(num.style, {
            fontSize: `${Math.max(14, Math.round(cfg.markerSize * 1.15))}px`,
            fontWeight: '750',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: '1.1',
            color: isCapReached && cfg.capReachedColor ? cfg.capReachedColor : cfg.filledColor
        });
        wrap.appendChild(num);
        return wrap;
    }

    // Apply perRow max-width constraint when perRow > 0
    if (perRow > 0 && !isTally) {
        const maxWidth = perRow * cfg.markerSize + Math.max(0, perRow - 1) * gap;
        wrap.style.maxWidth = `${maxWidth}px`;
    } else if (perRow > 0 && isTally) {
        const groupsPerRow = Math.max(1, Math.ceil(perRow / 5));
        const groupWidth = Math.round(cfg.markerSize * 1.42);
        const tallyGap = Math.max(gap, 10);
        wrap.style.maxWidth = `${groupsPerRow * groupWidth + Math.max(0, groupsPerRow - 1) * tallyGap}px`;
    }

    if (isTally) {
        const isChalk = cfg.style === 'tally-chalk';
        const baseTotal = cap != null ? cap : clampedCount;
        const renderTotal = cap != null && cfg.overflowMode === 'overflow'
            ? Math.min(MAX_RENDER_MARKERS, Math.max(cap, clampedCount))
            : Math.min(MAX_RENDER_MARKERS, baseTotal);
        const displayFilled = Math.min(clampedCount, renderTotal);
        const activeColor = isCapReached && cfg.capReachedColor ? cfg.capReachedColor : cfg.filledColor;
        const emptyStroke = cfg.outlineColor || cfg.emptyColor;

        if (renderTotal === 0) {
            // Uncapped zero state: show a subtle empty placeholder stroke
            wrap.appendChild(createTallyGroup(0, 1, isChalk, activeColor, emptyStroke, cfg, -1, 0));
        } else {
            for (let start = 0; start < renderTotal; start += 5) {
                const totalInGroup = Math.min(5, renderTotal - start);
                const filledInGroup = Math.max(0, Math.min(totalInGroup, displayFilled - start));
                const groupIsOverflow = cap != null && start >= cap;
                wrap.appendChild(createTallyGroup(
                    filledInGroup,
                    totalInGroup,
                    isChalk,
                    groupIsOverflow ? cfg.overflowColor : activeColor,
                    emptyStroke,
                    cfg,
                    popFromIndex,
                    start
                ));
            }
        }
        const overflowCount = cap != null && cfg.overflowMode === 'plus' && rawCount > cap
            ? rawCount - cap
            : (rawCount > renderTotal && cfg.overflowMode !== 'clamp' ? rawCount - renderTotal : 0);
        if (overflowCount > 0) {
            wrap.appendChild(createOverflowPill(overflowCount, cfg, animate));
        }
        return wrap;
    }

    // Shape markers (pips, hearts, stars, diamonds, squares, bars)
    const baseSlots = cap != null ? Math.min(MAX_RENDER_MARKERS, cap) : Math.min(MAX_RENDER_MARKERS, clampedCount);
    const extraOverflowSlots = cap != null && cfg.overflowMode === 'overflow' && rawCount > cap
        ? Math.min(MAX_RENDER_MARKERS - baseSlots, rawCount - cap)
        : 0;

    if (baseSlots === 0 && extraOverflowSlots === 0) {
        // Uncapped 0: render a subtle ghost empty marker so the row stays legible
        wrap.appendChild(createShapeMarker(cfg.style, 'empty', cfg, false));
        return wrap;
    }

    for (let i = 0; i < baseSlots; i++) {
        const isFilled = i < clampedCount;
        const state = !isFilled
            ? 'empty'
            : (isCapReached && cfg.capReachedColor ? 'cap' : 'filled');
        const pop = isFilled && popFromIndex >= 0 && i >= popFromIndex;
        wrap.appendChild(createShapeMarker(cfg.style, state, cfg, pop));
    }

    for (let j = 0; j < extraOverflowSlots; j++) {
        const globalIdx = baseSlots + j;
        const pop = popFromIndex >= 0 && globalIdx >= popFromIndex;
        wrap.appendChild(createShapeMarker(cfg.style, 'overflow', cfg, pop));
    }

    const overflowBadgeCount = cap != null && cfg.overflowMode === 'plus' && rawCount > cap
        ? rawCount - cap
        : (rawCount > baseSlots + extraOverflowSlots && cfg.overflowMode !== 'clamp'
            ? rawCount - (baseSlots + extraOverflowSlots)
            : 0);
    if (overflowBadgeCount > 0) {
        wrap.appendChild(createOverflowPill(overflowBadgeCount, cfg, animate));
    }

    return wrap;
}

function createOverflowPill(count, cfg, pop) {
    const badge = document.createElement('span');
    badge.className = `sp-counter-overflow-badge${pop ? ' sp-counter-marker is-pop' : ''}`;
    badge.textContent = `+${count}`;
    Object.assign(badge.style, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 7px',
        borderRadius: '999px',
        fontSize: `${Math.max(11, Math.round(cfg.markerSize * 0.52))}px`,
        fontWeight: '700',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: '1.2',
        color: cfg.overflowColor,
        border: `1px solid ${cfg.overflowColor}`,
        background: 'rgba(0, 0, 0, 0.25)',
        flex: 'none'
    });
    return badge;
}

export function renderDisplayCounter(host, element, status = {}, definition) {
    ensureCounterStyles();
    const cfg = normalizeDisplayCounter(definition?.counter);
    const binding = element?.display || {};
    const rows = resolveCounterRows(definition, binding, status);
    if (!rows.length) return false;

    const prevMap = host._counterPrevValues instanceof Map ? host._counterPrevValues : new Map();
    const nextMap = new Map();

    const root = document.createElement('div');
    root.className = 'sp-variable-display sp-counter-display';
    root.dataset.counterStyle = cfg.style;
    Object.assign(root.style, {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: cfg.direction === 'horizontal' ? 'row' : 'column',
        flexWrap: cfg.direction === 'horizontal' ? 'wrap' : 'nowrap',
        alignItems: cfg.direction === 'horizontal'
            ? 'center'
            : (cfg.align === 'center' ? 'center' : cfg.align === 'right' ? 'flex-end' : 'stretch'),
        justifyContent: cfg.align === 'center' ? 'center' : cfg.align === 'right' ? 'flex-end' : 'flex-start',
        gap: `${cfg.rowGap}px`,
        fontFamily: cfg.fontFamily,
        fontSize: `${cfg.fontSize}px`,
        overflow: 'hidden'
    });

    for (const row of rows) {
        const prevVal = prevMap.has(row.key) ? prevMap.get(row.key) : undefined;
        nextMap.set(row.key, row.value);

        const rowEl = document.createElement('div');
        rowEl.className = 'sp-counter-row';
        rowEl.dataset.counterKey = row.key;
        rowEl.dataset.counterValue = String(row.value);
        if (row.cap != null) rowEl.dataset.counterCap = String(row.cap);

        const labelPos = cfg.showLabel ? cfg.labelPosition : 'none';
        const isStacked = labelPos === 'top' || labelPos === 'bottom';

        Object.assign(rowEl.style, {
            display: 'flex',
            flexDirection: isStacked ? 'column' : 'row',
            alignItems: isStacked
                ? (cfg.align === 'center' ? 'center' : cfg.align === 'right' ? 'flex-end' : 'flex-start')
                : 'center',
            justifyContent: !isStacked && cfg.align === 'center'
                ? 'center'
                : !isStacked && cfg.align === 'right'
                    ? 'flex-end'
                    : 'space-between',
            gap: isStacked ? '6px' : '12px',
            padding: `${cfg.rowPadding}px`,
            borderRadius: `${cfg.rowRadius}px`,
            background: cfg.rowBackground,
            border: cfg.rowBorderWidth > 0 ? `${cfg.rowBorderWidth}px solid ${cfg.rowBorderColor}` : 'none',
            boxSizing: 'border-box',
            maxWidth: '100%'
        });

        const labelEl = labelPos !== 'none' ? document.createElement('span') : null;
        if (labelEl) {
            labelEl.className = 'sp-counter-label';
            labelEl.textContent = row.label;
            Object.assign(labelEl.style, {
                color: cfg.labelColor,
                fontWeight: '650',
                fontSize: `${cfg.fontSize}px`,
                lineHeight: '1.2',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: '0'
            });
        }

        const markersGroup = document.createElement('div');
        markersGroup.className = 'sp-counter-track';
        const showReadout = cfg.style !== 'number' && cfg.readout !== 'none';
        const readoutStacked = showReadout && (cfg.readoutPosition === 'top' || cfg.readoutPosition === 'bottom');
        Object.assign(markersGroup.style, {
            display: 'flex',
            flexDirection: readoutStacked ? 'column' : 'row',
            alignItems: 'center',
            gap: readoutStacked ? '4px' : '10px',
            minWidth: '0',
            flexWrap: 'nowrap'
        });

        const markersNode = buildMarkersNode(row.value, row.cap, cfg, prevVal);

        let readoutEl = null;
        if (showReadout) {
            readoutEl = document.createElement('span');
            readoutEl.className = 'sp-counter-readout';
            readoutEl.textContent = formatCounterReadout(row.value, row.cap, cfg.readout);
            Object.assign(readoutEl.style, {
                color: cfg.readoutColor,
                fontWeight: '700',
                fontSize: `${Math.max(12, Math.round(cfg.fontSize * 0.92))}px`,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                flex: 'none'
            });
        }

        if (readoutEl && (cfg.readoutPosition === 'left' || cfg.readoutPosition === 'top')) {
            markersGroup.append(readoutEl, markersNode);
        } else if (readoutEl) {
            markersGroup.append(markersNode, readoutEl);
        } else {
            markersGroup.append(markersNode);
        }

        if (labelEl && labelPos === 'bottom') {
            rowEl.append(markersGroup, labelEl);
        } else if (labelEl) {
            rowEl.append(labelEl, markersGroup);
        } else {
            rowEl.append(markersGroup);
        }

        root.appendChild(rowEl);
    }

    host._counterPrevValues = nextMap;
    host.appendChild(root);
    return true;
}

/**
 * Renders a compact inline HTML string preview of markers for Operator Mode cards.
 */
export function renderMiniCounterHtml(value, cap, counterCfg = {}) {
    const cfg = normalizeDisplayCounter({
        ...counterCfg,
        markerSize: Math.min(18, Math.max(14, Number(counterCfg.markerSize) || 16)),
        markerGap: 3,
        perRow: 0,
        animate: 'none'
    });
    const node = buildMarkersNode(value, cap, cfg, undefined);
    const wrapper = document.createElement('div');
    wrapper.appendChild(node);
    return wrapper.innerHTML;
}
