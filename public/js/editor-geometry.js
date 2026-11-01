export function snapAxis(candidates, targets, threshold) {
    let best = null;
    for (const candidate of candidates) {
        for (const target of targets) {
            const delta = target - candidate;
            if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
        }
    }
    if (best === null) return { delta: 0, lines: [] };
    const lines = new Set();
    for (const candidate of candidates) {
        for (const target of targets) {
            if (Math.abs(target - (candidate + best)) < 0.5) lines.add(target);
        }
    }
    return { delta: best, lines: [...lines] };
}

export function alignmentOffset(box, relative, mode) {
    if (mode === 'left') return { x: relative.x - box.x, y: 0 };
    if (mode === 'center') return { x: relative.x + (relative.w - box.w) / 2 - box.x, y: 0 };
    if (mode === 'right') return { x: relative.x + relative.w - box.w - box.x, y: 0 };
    if (mode === 'top') return { x: 0, y: relative.y - box.y };
    if (mode === 'middle') return { x: 0, y: relative.y + (relative.h - box.h) / 2 - box.y };
    if (mode === 'bottom') return { x: 0, y: relative.y + relative.h - box.h - box.y };
    return { x: 0, y: 0 };
}

/**
 * Builds a structured snap model from visible element boxes and canvas dimensions.
 */
export function buildSnapModel(boxes, canvasW = 1920, canvasH = 1080) {
    const items = (boxes || []).map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        r: b.x + b.w,
        b: b.y + b.h,
        cx: b.x + b.w / 2,
        cy: b.y + b.h / 2
    }));

    const xPoints = [
        { pos: 0, canvas: true, isCenter: false },
        { pos: canvasW / 2, canvas: true, isCenter: true },
        { pos: canvasW, canvas: true, isCenter: false }
    ];
    const yPoints = [
        { pos: 0, canvas: true, isCenter: false },
        { pos: canvasH / 2, canvas: true, isCenter: true },
        { pos: canvasH, canvas: true, isCenter: false }
    ];

    for (const box of items) {
        xPoints.push(
            { pos: box.x, box, isCenter: false },
            { pos: box.cx, box, isCenter: true },
            { pos: box.r, box, isCenter: false }
        );
        yPoints.push(
            { pos: box.y, box, isCenter: false },
            { pos: box.cy, box, isCenter: true },
            { pos: box.b, box, isCenter: false }
        );
    }

    // Legacy flat arrays for backwards-compatible callers
    const xs = xPoints.map(p => p.pos);
    const ys = yPoints.map(p => p.pos);

    return { items, xPoints, yPoints, xs, ys, canvasW, canvasH };
}

function bandOverlap(aStart, aEnd, bStart, bEnd) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    return end > start ? (start + end) / 2 : null;
}

function axisDistanceInfo(aStart, aEnd, bStart, bEnd) {
    if (bStart > aEnd) {
        return { distance: Math.round(bStart - aEnd), pos: (aEnd + bStart) / 2 };
    }
    if (aStart > bEnd) {
        return { distance: Math.round(aStart - bEnd), pos: (bEnd + aStart) / 2 };
    }
    return null;
}

/**
 * Computes equal-spacing (distribution) snap along one axis ('x' or 'y').
 */
function findEqualGapSnap(moving, items, axis, threshold) {
    const isX = axis === 'x';
    const mStart = isX ? moving.x : moving.y;
    const mSize = isX ? moving.w : moving.h;
    const mEnd = mStart + mSize;
    const mCrossStart = isX ? moving.y : moving.x;
    const mCrossEnd = mCrossStart + (isX ? moving.h : moving.w);

    // Filter items that share a cross-axis band with the moving box
    const peers = items.filter(b => {
        const cStart = isX ? b.y : b.x;
        const cEnd = isX ? b.b : b.r;
        return bandOverlap(mCrossStart, mCrossEnd, cStart, cEnd) !== null;
    });
    if (peers.length < 2) return null;

    let bestDelta = null;
    let bestGuides = [];

    const tryCandidate = (delta, guides) => {
        if (Math.abs(delta) <= threshold && (bestDelta === null || Math.abs(delta) < Math.abs(bestDelta))) {
            bestDelta = delta;
            bestGuides = guides;
        }
    };

    const sorted = peers.slice().sort((a, b) => (isX ? a.x - b.x : a.y - b.y));

    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const A = sorted[i];
            const B = sorted[j];
            const aStart = isX ? A.x : A.y;
            const aEnd = isX ? A.r : A.b;
            const bStart = isX ? B.x : B.y;
            const bEnd = isX ? B.r : B.b;
            const aCrossStart = isX ? A.y : A.x;
            const aCrossEnd = isX ? A.b : A.r;
            const bCrossStart = isX ? B.y : B.x;
            const bCrossEnd = isX ? B.b : B.r;

            // Case 1: Moving box is between A and B -> equalize (M.start - A.end) and (B.start - M.end)
            const totalSpace = bStart - aEnd - mSize;
            if (totalSpace >= 4 && mStart >= aEnd - threshold && mEnd <= bStart + threshold) {
                const targetStart = aEnd + totalSpace / 2;
                const delta = targetStart - mStart;
                const gap = Math.round(totalSpace / 2);
                const cross1 = bandOverlap(mCrossStart, mCrossEnd, aCrossStart, aCrossEnd) ?? (mCrossStart + mCrossEnd) / 2;
                const cross2 = bandOverlap(mCrossStart, mCrossEnd, bCrossStart, bCrossEnd) ?? (mCrossStart + mCrossEnd) / 2;
                tryCandidate(delta, [
                    { kind: 'gap', axis: isX ? 'h' : 'v', start: aEnd, end: targetStart, cross: cross1, gap },
                    { kind: 'gap', axis: isX ? 'h' : 'v', start: targetStart + mSize, end: bStart, cross: cross2, gap }
                ]);
            }

            // Existing gap between A and B
            const gapAB = bStart - aEnd;
            if (gapAB < 2) continue;
            // Ensure no other peer sits directly between A and B
            const obstructed = sorted.some((C, k) => k !== i && k !== j && (isX ? (C.r > aEnd && C.x < bStart) : (C.b > aEnd && C.y < bStart)));
            if (obstructed) continue;

            const crossAB = bandOverlap(aCrossStart, aCrossEnd, bCrossStart, bCrossEnd) ?? (mCrossStart + mCrossEnd) / 2;

            // Case 2: Moving box is after B -> match gap(B, M) === gap(A, B)
            if (mStart >= bEnd - threshold) {
                const targetStart = bEnd + gapAB;
                const delta = targetStart - mStart;
                const crossBM = bandOverlap(mCrossStart, mCrossEnd, bCrossStart, bCrossEnd) ?? crossAB;
                tryCandidate(delta, [
                    { kind: 'gap', axis: isX ? 'h' : 'v', start: aEnd, end: bStart, cross: crossAB, gap: Math.round(gapAB) },
                    { kind: 'gap', axis: isX ? 'h' : 'v', start: bEnd, end: targetStart, cross: crossBM, gap: Math.round(gapAB) }
                ]);
            }

            // Case 3: Moving box is before A -> match gap(M, A) === gap(A, B)
            if (mEnd <= aStart + threshold) {
                const targetStart = aStart - gapAB - mSize;
                const delta = targetStart - mStart;
                const crossMA = bandOverlap(mCrossStart, mCrossEnd, aCrossStart, aCrossEnd) ?? crossAB;
                tryCandidate(delta, [
                    { kind: 'gap', axis: isX ? 'h' : 'v', start: targetStart + mSize, end: aStart, cross: crossMA, gap: Math.round(gapAB) },
                    { kind: 'gap', axis: isX ? 'h' : 'v', start: aEnd, end: bStart, cross: crossAB, gap: Math.round(gapAB) }
                ]);
            }
        }
    }

    return bestDelta !== null ? { delta: bestDelta, guides: bestGuides } : null;
}

/**
 * Computes smart alignment and equal-spacing snapping for a dragged box.
 */
export function computeSmartMoveSnap(movingBox, model, threshold = 6, options = {}) {
    const allowAlign = options.align !== false;
    const allowSpacing = options.spacing !== false;

    let bestDx = null, bestDy = null;
    const guides = [];

    const xCandidates = [movingBox.x, movingBox.x + movingBox.w / 2, movingBox.x + movingBox.w];
    const yCandidates = [movingBox.y, movingBox.y + movingBox.h / 2, movingBox.y + movingBox.h];

    if (allowAlign) {
        for (const cand of xCandidates) {
            for (const pt of model.xPoints) {
                const d = pt.pos - cand;
                if (Math.abs(d) <= threshold && (bestDx === null || Math.abs(d) < Math.abs(bestDx))) bestDx = d;
            }
        }
        for (const cand of yCandidates) {
            for (const pt of model.yPoints) {
                const d = pt.pos - cand;
                if (Math.abs(d) <= threshold && (bestDy === null || Math.abs(d) < Math.abs(bestDy))) bestDy = d;
            }
        }
    }

    let gapSnapX = null, gapSnapY = null;
    if (allowSpacing && model.items.length >= 2) {
        gapSnapX = findEqualGapSnap(movingBox, model.items, 'x', threshold);
        gapSnapY = findEqualGapSnap(movingBox, model.items, 'y', threshold);
        if (gapSnapX && (bestDx === null || Math.abs(gapSnapX.delta) < Math.abs(bestDx))) {
            bestDx = gapSnapX.delta;
        } else {
            gapSnapX = null;
        }
        if (gapSnapY && (bestDy === null || Math.abs(gapSnapY.delta) < Math.abs(bestDy))) {
            bestDy = gapSnapY.delta;
        } else {
            gapSnapY = null;
        }
    }

    const dx = bestDx ?? 0;
    const dy = bestDy ?? 0;
    const snappedBox = {
        x: movingBox.x + dx,
        y: movingBox.y + dy,
        w: movingBox.w,
        h: movingBox.h,
        r: movingBox.x + dx + movingBox.w,
        b: movingBox.y + dy + movingBox.h
    };

    if (allowAlign && bestDx !== null && !gapSnapX) {
        const matchedPos = new Map();
        for (const cand of [snappedBox.x, snappedBox.x + snappedBox.w / 2, snappedBox.r]) {
            for (const pt of model.xPoints) {
                if (Math.abs(pt.pos - cand) < 0.5) {
                    const key = Math.round(pt.pos * 2) / 2;
                    let entry = matchedPos.get(key);
                    if (!entry) {
                        entry = { pos: pt.pos, canvas: false, isCenter: false, boxes: [] };
                        matchedPos.set(key, entry);
                    }
                    if (pt.canvas) entry.canvas = true;
                    if (pt.isCenter) entry.isCenter = true;
                    if (pt.box) entry.boxes.push(pt.box);
                }
            }
        }
        for (const entry of matchedPos.values()) {
            if (entry.canvas && !entry.boxes.length) {
                guides.push({
                    kind: 'line', axis: 'v', pos: entry.pos,
                    start: 0, end: model.canvasH, isCenter: entry.isCenter
                });
            } else {
                const start = Math.min(snappedBox.y, ...entry.boxes.map(b => b.y));
                const end = Math.max(snappedBox.b, ...entry.boxes.map(b => b.b));
                let distInfo = null;
                for (const b of entry.boxes) {
                    const info = axisDistanceInfo(snappedBox.y, snappedBox.b, b.y, b.b);
                    if (info && info.distance > 0 && (!distInfo || info.distance < distInfo.distance)) distInfo = info;
                }
                guides.push({
                    kind: 'line', axis: 'v', pos: entry.pos,
                    start: entry.canvas ? 0 : start,
                    end: entry.canvas ? model.canvasH : end,
                    isCenter: entry.isCenter,
                    distance: distInfo?.distance || 0,
                    distPos: distInfo?.pos || 0
                });
            }
        }
    }

    if (allowAlign && bestDy !== null && !gapSnapY) {
        const matchedPos = new Map();
        for (const cand of [snappedBox.y, snappedBox.y + snappedBox.h / 2, snappedBox.b]) {
            for (const pt of model.yPoints) {
                if (Math.abs(pt.pos - cand) < 0.5) {
                    const key = Math.round(pt.pos * 2) / 2;
                    let entry = matchedPos.get(key);
                    if (!entry) {
                        entry = { pos: pt.pos, canvas: false, isCenter: false, boxes: [] };
                        matchedPos.set(key, entry);
                    }
                    if (pt.canvas) entry.canvas = true;
                    if (pt.isCenter) entry.isCenter = true;
                    if (pt.box) entry.boxes.push(pt.box);
                }
            }
        }
        for (const entry of matchedPos.values()) {
            if (entry.canvas && !entry.boxes.length) {
                guides.push({
                    kind: 'line', axis: 'h', pos: entry.pos,
                    start: 0, end: model.canvasW, isCenter: entry.isCenter
                });
            } else {
                const start = Math.min(snappedBox.x, ...entry.boxes.map(b => b.x));
                const end = Math.max(snappedBox.r, ...entry.boxes.map(b => b.r));
                let distInfo = null;
                for (const b of entry.boxes) {
                    const info = axisDistanceInfo(snappedBox.x, snappedBox.r, b.x, b.r);
                    if (info && info.distance > 0 && (!distInfo || info.distance < distInfo.distance)) distInfo = info;
                }
                guides.push({
                    kind: 'line', axis: 'h', pos: entry.pos,
                    start: entry.canvas ? 0 : start,
                    end: entry.canvas ? model.canvasW : end,
                    isCenter: entry.isCenter,
                    distance: distInfo?.distance || 0,
                    distPos: distInfo?.pos || 0
                });
            }
        }
    }

    if (gapSnapX) guides.push(...gapSnapX.guides);
    if (gapSnapY) guides.push(...gapSnapY.guides);

    return { dx, dy, guides };
}

/**
 * Computes smart edge alignment and dimension-matching for a resized box.
 */
export function computeSmartResizeSnap(orig, dir, dx, dy, model, threshold = 6, options = {}) {
    const allowAlign = options.align !== false;
    const allowDimensions = options.dimensions !== false;

    const right = orig.x + orig.w;
    const bottom = orig.y + orig.h;
    let x = orig.x, y = orig.y, w = orig.w, h = orig.h;
    const guides = [];

    const snapEdge = (val, points, axis, refBox) => {
        if (!allowAlign) return val;
        let best = null;
        for (const pt of points) {
            const d = pt.pos - val;
            if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
        }
        if (best === null) return val;
        const snapped = val + best;
        const matched = points.filter(pt => Math.abs(pt.pos - snapped) < 0.5);
        const isCanvas = matched.some(m => m.canvas);
        const isCenter = matched.some(m => m.isCenter);
        const boxes = matched.map(m => m.box).filter(Boolean);
        if (axis === 'v') {
            guides.push({
                kind: 'line', axis: 'v', pos: snapped,
                start: isCanvas || !boxes.length ? 0 : Math.min(refBox.y, ...boxes.map(b => b.y)),
                end: isCanvas || !boxes.length ? model.canvasH : Math.max(refBox.y + refBox.h, ...boxes.map(b => b.b)),
                isCenter
            });
        } else {
            guides.push({
                kind: 'line', axis: 'h', pos: snapped,
                start: isCanvas || !boxes.length ? 0 : Math.min(refBox.x, ...boxes.map(b => b.x)),
                end: isCanvas || !boxes.length ? model.canvasW : Math.max(refBox.x + refBox.w, ...boxes.map(b => b.r)),
                isCenter
            });
        }
        return snapped;
    };

    if (dir.includes('w')) {
        const nextX = snapEdge(orig.x + dx, model.xPoints, 'v', orig);
        x = nextX;
        w = right - x;
    } else if (dir.includes('e')) {
        const nextR = snapEdge(right + dx, model.xPoints, 'v', orig);
        w = nextR - orig.x;
    }

    if (dir.includes('n')) {
        const nextY = snapEdge(orig.y + dy, model.yPoints, 'h', orig);
        y = nextY;
        h = bottom - y;
    } else if (dir.includes('s')) {
        const nextB = snapEdge(bottom + dy, model.yPoints, 'h', orig);
        h = nextB - orig.y;
    }

    // Dimension-match snapping when an edge didn't already snap to an alignment line
    const snappedV = guides.some(g => g.axis === 'v');
    const snappedH = guides.some(g => g.axis === 'h');

    if (allowDimensions && model.items.length) {
        if ((dir.includes('w') || dir.includes('e')) && !snappedV) {
            let bestWDelta = null, matchBoxW = null;
            for (const b of model.items) {
                const d = b.w - w;
                if (Math.abs(d) <= threshold && (bestWDelta === null || Math.abs(d) < Math.abs(bestWDelta))) {
                    bestWDelta = d;
                    matchBoxW = b;
                }
            }
            if (bestWDelta !== null && matchBoxW) {
                w += bestWDelta;
                if (dir.includes('w')) x = right - w;
                guides.push({ kind: 'dim', axis: 'w', box: matchBoxW, value: Math.round(w) });
            }
        }
        if ((dir.includes('n') || dir.includes('s')) && !snappedH) {
            let bestHDelta = null, matchBoxH = null;
            for (const b of model.items) {
                const d = b.h - h;
                if (Math.abs(d) <= threshold && (bestHDelta === null || Math.abs(d) < Math.abs(bestHDelta))) {
                    bestHDelta = d;
                    matchBoxH = b;
                }
            }
            if (bestHDelta !== null && matchBoxH) {
                h += bestHDelta;
                if (dir.includes('n')) y = bottom - h;
                guides.push({ kind: 'dim', axis: 'h', box: matchBoxH, value: Math.round(h) });
            }
        }
    }

    return { x, y, w, h, guides };
}

