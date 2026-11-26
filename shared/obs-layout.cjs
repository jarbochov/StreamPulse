/**
 * Shared math for OBS Layout & Aspect Studio.
 * Pure, zero-dependency helpers for aspect ratio cropping, 9-point anchor pinning,
 * resize modes (lock-width, lock-height, fit-slot), and OBS scene item bounding boxes.
 */

const ASPECT_PRESETS = {
    native: { label: 'Native', ratio: null },
    '16:9': { label: '16:9', ratio: 16 / 9 },
    '4:3': { label: '4:3', ratio: 4 / 3 },
    '1:1': { label: '1:1', ratio: 1 },
    '4:5': { label: '4:5', ratio: 4 / 5 },
    '9:16': { label: '9:16', ratio: 9 / 16 },
    '21:9': { label: '21:9', ratio: 21 / 9 },
    custom: { label: 'Custom', ratio: null }
};

const RESIZE_MODES = ['lock-width', 'lock-height', 'fit-slot', 'keep-area'];

const ANCHORS = {
    tl: { ax: 0, ay: 0, label: 'Top-Left' },
    tc: { ax: 0.5, ay: 0, label: 'Top-Center' },
    tr: { ax: 1, ay: 0, label: 'Top-Right' },
    ml: { ax: 0, ay: 0.5, label: 'Middle-Left' },
    c: { ax: 0.5, ay: 0.5, label: 'Center' },
    mr: { ax: 1, ay: 0.5, label: 'Middle-Right' },
    bl: { ax: 0, ay: 1, label: 'Bottom-Left' },
    bc: { ax: 0.5, ay: 1, label: 'Bottom-Center' },
    br: { ax: 1, ay: 1, label: 'Bottom-Right' }
};

function clamp(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function normalizeAspectConfig(raw = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const ratio = Object.prototype.hasOwnProperty.call(ASPECT_PRESETS, src.ratio) ? src.ratio : 'native';
    return {
        ratio,
        customW: clamp(src.customW, 1, 100, 16),
        customH: clamp(src.customH, 1, 100, 9),
        panX: clamp(src.panX, -100, 100, 0),
        panY: clamp(src.panY, -100, 100, 0),
        zoom: clamp(src.zoom, 1, 3, 1),
        resizeMode: RESIZE_MODES.includes(src.resizeMode) ? src.resizeMode : 'lock-width',
        anchor: Object.prototype.hasOwnProperty.call(ANCHORS, src.anchor) ? src.anchor : 'c',
        durationMs: clamp(src.durationMs, 0, 3000, 400),
        slotW: clamp(src.slotW, 0, 10000, 0),
        slotH: clamp(src.slotH, 0, 10000, 0)
    };
}

function resolveTargetRatio(cfg, baseW = 1920, baseH = 1080) {
    const norm = normalizeAspectConfig(cfg);
    if (norm.ratio === 'native') return Math.max(1, baseW) / Math.max(1, baseH);
    if (norm.ratio === 'custom') return Math.max(0.1, norm.customW / Math.max(0.1, norm.customH));
    return ASPECT_PRESETS[norm.ratio]?.ratio || (Math.max(1, baseW) / Math.max(1, baseH));
}

/**
 * Computes cropped output dimensions and UV sub-rect for a source of size (baseW, baseH).
 */
function computeAspectCrop(baseW, baseH, rawCfg = {}) {
    const bw = Math.max(2, Math.round(Number(baseW) || 1920));
    const bh = Math.max(2, Math.round(Number(baseH) || 1080));
    const cfg = normalizeAspectConfig(rawCfg);
    const nativeRatio = bw / bh;
    const targetRatio = resolveTargetRatio(cfg, bw, bh);

    let outW = bw;
    let outH = bh;
    if (Math.abs(targetRatio - nativeRatio) > 0.0005) {
        if (targetRatio < nativeRatio) {
            // Narrower than native (e.g. 16:9 -> 4:3, 1:1, 9:16): keep full height, crop width
            outH = bh;
            outW = Math.max(2, Math.round(bh * targetRatio));
        } else {
            // Wider than native (e.g. 16:9 -> 21:9): keep full width, crop height
            outW = bw;
            outH = Math.max(2, Math.round(bw / targetRatio));
        }
    }

    // Apply zoom inside the cropped frame
    const zoom = cfg.zoom;
    const visW = outW / zoom;
    const visH = outH / zoom;
    const maxShiftX = Math.max(0, (bw - visW) * 0.5);
    const maxShiftY = Math.max(0, (bh - visH) * 0.5);
    const centerX = bw * 0.5 + (cfg.panX / 100) * maxShiftX;
    const centerY = bh * 0.5 + (cfg.panY / 100) * maxShiftY;

    const uvLeft = clamp((centerX - visW * 0.5) / bw, 0, 1, 0);
    const uvRight = clamp((centerX + visW * 0.5) / bw, 0, 1, 1);
    const uvTop = clamp((centerY - visH * 0.5) / bh, 0, 1, 0);
    const uvBottom = clamp((centerY + visH * 0.5) / bh, 0, 1, 1);

    return {
        outW,
        outH,
        targetRatio,
        uvLeft,
        uvRight,
        uvTop,
        uvBottom
    };
}

function alignmentRatios(alignment) {
    const bits = Number.isFinite(Number(alignment)) ? Number(alignment) : 5;
    const ax = (bits & 1) ? 0 : (bits & 2) ? 1 : 0.5;
    const ay = (bits & 4) ? 0 : (bits & 8) ? 1 : 0.5;
    return { ax, ay };
}

/**
 * Computes the screen-space bounding rectangle of an OBS scene item transform.
 */
function sceneItemScreenRect(tx = {}) {
    const sw = Math.max(1, Number(tx.sourceWidth) || 1920);
    const sh = Math.max(1, Number(tx.sourceHeight) || 1080);
    const cropL = Number(tx.cropLeft) || 0;
    const cropR = Number(tx.cropRight) || 0;
    const cropT = Number(tx.cropTop) || 0;
    const cropB = Number(tx.cropBottom) || 0;
    const effSrcW = Math.max(1, sw - cropL - cropR);
    const effSrcH = Math.max(1, sh - cropT - cropB);

    const boundsType = String(tx.boundsType || 'OBS_BOUNDS_NONE');
    const hasBounds = boundsType !== 'OBS_BOUNDS_NONE' && Number(tx.boundsWidth) > 0 && Number(tx.boundsHeight) > 0;
    const rawW = Number(tx.width);
    const rawH = Number(tx.height);
    const width = hasBounds
        ? Number(tx.boundsWidth)
        : (Number.isFinite(rawW) && rawW > 0 ? rawW : effSrcW * Math.abs(Number(tx.scaleX) || 1));
    const height = hasBounds
        ? Number(tx.boundsHeight)
        : (Number.isFinite(rawH) && rawH > 0 ? rawH : effSrcH * Math.abs(Number(tx.scaleY) || 1));

    const posX = Number(tx.positionX) || 0;
    const posY = Number(tx.positionY) || 0;
    const { ax, ay } = alignmentRatios(tx.alignment);
    const left = posX - ax * width;
    const top = posY - ay * height;
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        ax,
        ay,
        hasBounds,
        boundsType
    };
}

/**
 * Given a scene item's current OBS transform and its new cropped source dimensions (newSrcW, newSrcH),
 * computes the exact OBS `sceneItemTransform` patch so the chosen 9-point anchor stays pinned
 * while resizing according to `resizeMode` ('lock-width', 'lock-height', 'fit-slot', 'keep-area').
 */
function computeAnchoredTransform(currentTx, newSrcW, newSrcH, { resizeMode = 'lock-width', anchor = 'c', slotW = 0, slotH = 0 } = {}) {
    const rect = sceneItemScreenRect(currentTx);
    const targetSrcW = Math.max(2, Number(newSrcW) || 1920);
    const targetSrcH = Math.max(2, Number(newSrcH) || 1080);
    const newAspect = targetSrcW / targetSrcH;

    let newW = rect.width;
    let newH = rect.height;

    if (resizeMode === 'lock-width') {
        newW = rect.width;
        newH = newW / newAspect;
    } else if (resizeMode === 'lock-height') {
        newH = rect.height;
        newW = newH * newAspect;
    } else if (resizeMode === 'keep-area') {
        const area = Math.max(1, rect.width * rect.height);
        newH = Math.sqrt(area / newAspect);
        newW = newH * newAspect;
    } else {
        // 'fit-slot': fit max area inside slotW x slotH (defaults to current rect)
        const boxW = slotW > 0 ? slotW : rect.width;
        const boxH = slotH > 0 ? slotH : rect.height;
        if (boxW / boxH > newAspect) {
            newH = boxH;
            newW = boxH * newAspect;
        } else {
            newW = boxW;
            newH = boxW / newAspect;
        }
    }

    const pin = ANCHORS[anchor] || ANCHORS.c;
    const pinX = rect.left + pin.ax * rect.width;
    const pinY = rect.top + pin.ay * rect.height;
    const nextLeft = pinX - pin.ax * newW;
    const nextTop = pinY - pin.ay * newH;

    const nextPosX = nextLeft + rect.ax * newW;
    const nextPosY = nextTop + rect.ay * newH;

    const patch = {
        positionX: Number(nextPosX.toFixed(3)),
        positionY: Number(nextPosY.toFixed(3))
    };

    if (rect.hasBounds) {
        patch.boundsWidth = Number(Math.max(1, newW).toFixed(3));
        patch.boundsHeight = Number(Math.max(1, newH).toFixed(3));
    } else {
        const signX = (Number(currentTx.scaleX) || 1) < 0 ? -1 : 1;
        const signY = (Number(currentTx.scaleY) || 1) < 0 ? -1 : 1;
        patch.scaleX = Number((signX * (newW / targetSrcW)).toFixed(6));
        patch.scaleY = Number((signY * (newH / targetSrcH)).toFixed(6));
    }

    return {
        patch,
        prevRect: rect,
        nextRect: { left: nextLeft, top: nextTop, width: newW, height: newH }
    };
}

/**
 * Converts a desired screen-space rectangle (left, top, width, height) back into an OBS transform patch.
 */
function rectToObsTransformPatch(currentTx, desiredRect) {
    const sw = Math.max(1, Number(currentTx.sourceWidth) || 1920);
    const sh = Math.max(1, Number(currentTx.sourceHeight) || 1080);
    const cropL = Number(currentTx.cropLeft) || 0;
    const cropR = Number(currentTx.cropRight) || 0;
    const cropT = Number(currentTx.cropTop) || 0;
    const cropB = Number(currentTx.cropBottom) || 0;
    const effSrcW = Math.max(1, sw - cropL - cropR);
    const effSrcH = Math.max(1, sh - cropT - cropB);
    const { ax, ay } = alignmentRatios(currentTx.alignment);
    const boundsType = String(currentTx.boundsType || 'OBS_BOUNDS_NONE');
    const hasBounds = boundsType !== 'OBS_BOUNDS_NONE' && Number(currentTx.boundsWidth) > 0 && Number(currentTx.boundsHeight) > 0;

    const w = Math.max(8, Number(desiredRect.width) || 100);
    const h = Math.max(8, Number(desiredRect.height) || 100);
    const left = Number(desiredRect.left) || 0;
    const top = Number(desiredRect.top) || 0;

    const patch = {
        positionX: Number((left + ax * w).toFixed(3)),
        positionY: Number((top + ay * h).toFixed(3))
    };

    if (hasBounds) {
        patch.boundsWidth = Number(w.toFixed(3));
        patch.boundsHeight = Number(h.toFixed(3));
    } else {
        const signX = (Number(currentTx.scaleX) || 1) < 0 ? -1 : 1;
        const signY = (Number(currentTx.scaleY) || 1) < 0 ? -1 : 1;
        patch.scaleX = Number((signX * (w / effSrcW)).toFixed(6));
        patch.scaleY = Number((signY * (h / effSrcH)).toFixed(6));
    }

    if (desiredRect.rotation !== undefined && Number.isFinite(Number(desiredRect.rotation))) {
        patch.rotation = Number(Number(desiredRect.rotation).toFixed(2));
    }

    return patch;
}

const {
    computeEffectiveBorderMetrics,
    inferBaseDimensions,
    resolveBoundsEffectiveScale
} = require('./obs-border-transform.cjs');

/**
 * Computes exact canvas-space rectangles for an OBS scene item that has a StreamPulse Border filter:
 *  - `borderOuterRect`: visible outer edge of the StreamPulse Border stroke
 *  - `contentRect`: visible inner source content frame (inside the border)
 *  - `pad`, `reach`, `baseW`, `baseH`: resolved border metrics
 */
function computeBorderScreenRects(tx = {}, resolvedProfile = null) {
    if (!resolvedProfile) return null;
    const rect = sceneItemScreenRect(tx);
    const sw = Math.max(1, Number(tx.sourceWidth) || 1920);
    const sh = Math.max(1, Number(tx.sourceHeight) || 1080);
    const cropL = Number(tx.cropLeft) || 0;
    const cropR = Number(tx.cropRight) || 0;
    const cropT = Number(tx.cropTop) || 0;
    const cropB = Number(tx.cropBottom) || 0;
    const effSrcW = Math.max(1, sw - cropL - cropR);
    const effSrcH = Math.max(1, sh - cropT - cropB);

    let sx;
    let sy;
    let renderedW;
    let renderedH;
    let texLeft;
    let texTop;

    if (rect.hasBounds) {
        const sc = resolveBoundsEffectiveScale(rect.boundsType, rect.width, rect.height, effSrcW, effSrcH);
        sx = sc.sx;
        sy = sc.sy;
        renderedW = effSrcW * sx;
        renderedH = effSrcH * sy;
        const { ax: bax, ay: bay } = alignmentRatios(tx.boundsAlignment ?? 0);
        texLeft = rect.left + bax * (rect.width - renderedW);
        texTop = rect.top + bay * (rect.height - renderedH);
    } else {
        sx = Math.abs(Number(tx.scaleX) || 1);
        sy = Math.abs(Number(tx.scaleY) || 1);
        renderedW = rect.width;
        renderedH = rect.height;
        texLeft = rect.left;
        texTop = rect.top;
    }

    const txScale = Math.min(sx, sy);
    const { baseW, baseH } = inferBaseDimensions(sw, sh, resolvedProfile, txScale);
    const metrics = computeEffectiveBorderMetrics(resolvedProfile, baseW, baseH, txScale);
    const pad = metrics.pad || 0;
    const reach = metrics.reach || 0;
    const outerInset = Math.max(0, pad - reach);

    const buildBox = insetPx => {
        const l = texLeft + Math.max(0, insetPx - cropL) * sx;
        const t = texTop + Math.max(0, insetPx - cropT) * sy;
        const r = texLeft + renderedW - Math.max(0, insetPx - cropR) * sx;
        const b = texTop + renderedH - Math.max(0, insetPx - cropB) * sy;
        return {
            left: Number(l.toFixed(2)),
            top: Number(t.toFixed(2)),
            width: Number(Math.max(1, r - l).toFixed(2)),
            height: Number(Math.max(1, b - t).toFixed(2)),
            right: Number(r.toFixed(2)),
            bottom: Number(b.toFixed(2))
        };
    };

    return {
        pad,
        reach,
        baseW,
        baseH,
        borderOuterRect: buildBox(outerInset),
        contentRect: buildBox(pad)
    };
}

/**
 * Fallback native OBS crop calculation (`cropLeft`, `cropRight`, `cropTop`, `cropBottom`)
 * when `streampulse-aspect.lua` GPU filter is not attached to the source.
 */
function computeNativeObsCropPatch(sourceWidth, sourceHeight, rawCfg = {}, borderPad = 0) {
    const sw = Math.max(2, Math.round(Number(sourceWidth) || 1920));
    const sh = Math.max(2, Math.round(Number(sourceHeight) || 1080));
    const pad = Math.max(0, Math.round(Number(borderPad) || 0));
    const innerW = Math.max(2, sw - pad * 2);
    const innerH = Math.max(2, sh - pad * 2);
    const cfg = normalizeAspectConfig(rawCfg);

    if (cfg.ratio === 'native' && Math.abs(cfg.zoom - 1) < 0.001 && Math.abs(cfg.panX) < 0.01 && Math.abs(cfg.panY) < 0.01) {
        return {
            cropLeft: 0,
            cropRight: 0,
            cropTop: 0,
            cropBottom: 0,
            effW: sw,
            effH: sh
        };
    }

    const crop = computeAspectCrop(innerW, innerH, cfg);
    const cropLeft = Math.max(0, Math.round(pad + crop.uvLeft * innerW));
    const cropRight = Math.max(0, Math.round(pad + (1 - crop.uvRight) * innerW));
    const cropTop = Math.max(0, Math.round(pad + crop.uvTop * innerH));
    const cropBottom = Math.max(0, Math.round(pad + (1 - crop.uvBottom) * innerH));
    return {
        cropLeft,
        cropRight,
        cropTop,
        cropBottom,
        effW: Math.max(2, sw - cropLeft - cropRight),
        effH: Math.max(2, sh - cropTop - cropBottom)
    };
}

const TRANSITION_TYPES = ['move', 'fade', 'move-fade', 'cut'];
const PATH_TYPES = ['direct', 'arc-up', 'arc-down', 's-curve', 'elbow-hv', 'elbow-vh', 'custom'];
const EASINGS = ['ease-in-out', 'ease-out', 'ease-in', 'linear', 'overshoot'];

function evalEasing(t, easing = 'ease-in-out') {
    const x = Math.min(1, Math.max(0, Number(t) || 0));
    switch (easing) {
    case 'linear':
        return x;
    case 'ease-in':
        return x * x * x;
    case 'ease-out':
        return 1 - Math.pow(1 - x, 3);
    case 'overshoot': {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'ease-in-out':
    default:
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }
}

/**
 * Evaluates a 2D point along a transition movement path between (x0, y0) and (x1, y1) at eased progress `t`.
 * Supports 'direct', 'arc-up', 'arc-down', 's-curve', and 'custom' (quadratic Bezier with normalized control point).
 */
function evalPathPoint(x0, y0, x1, y1, t, { pathType = 'direct', pathCurve = 0.28, controlPoint = null, waypoints = null } = {}) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (pathType === 'direct' || dist < 1) {
        return { x: x0 + dx * t, y: y0 + dy * t };
    }
    const curve = clamp(pathCurve, -1, 1, 0.28);
    if (pathType === 'arc-up' || pathType === 'arc-down') {
        const dir = pathType === 'arc-up' ? -1 : 1;
        const midX = (x0 + x1) * 0.5;
        const midY = (y0 + y1) * 0.5 + dir * Math.max(40, dist * Math.abs(curve));
        const u = 1 - t;
        return {
            x: u * u * x0 + 2 * u * t * midX + t * t * x1,
            y: u * u * y0 + 2 * u * t * midY + t * t * y1
        };
    }
    if (pathType === 'elbow-hv' || pathType === 'elbow-vh') {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const total = Math.max(1, ax + ay);
        const clampedT = Math.min(1, Math.max(0, t));
        if (pathType === 'elbow-hv') {
            const split = ax / total;
            if (split <= 0.001) return { x: x1, y: y0 + dy * clampedT };
            if (split >= 0.999) return { x: x0 + dx * clampedT, y: y1 };
            if (clampedT <= split) return { x: x0 + dx * (clampedT / split), y: y0 };
            return { x: x1, y: y0 + dy * ((clampedT - split) / (1 - split)) };
        }
        const split = ay / total;
        if (split <= 0.001) return { x: x0 + dx * clampedT, y: y1 };
        if (split >= 0.999) return { x: x1, y: y0 + dy * clampedT };
        if (clampedT <= split) return { x: x0, y: y0 + dy * (clampedT / split) };
        return { x: x0 + dx * ((clampedT - split) / (1 - split)), y: y1 };
    }
    if (pathType === 's-curve') {
        const offset = Math.max(40, dist * Math.abs(curve));
        const c1x = x0 + dx * 0.35;
        const c1y = y0 - offset;
        const c2x = x0 + dx * 0.65;
        const c2y = y1 + offset;
        const u = 1 - t;
        return {
            x: u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
            y: u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1
        };
    }
    if (pathType === 'custom') {
        const pts = [];
        if (Array.isArray(waypoints) && waypoints.length) {
            for (const wp of waypoints) {
                if (wp && Number.isFinite(Number(wp.x)) && Number.isFinite(Number(wp.y))) {
                    pts.push({ x: Number(wp.x), y: Number(wp.y) });
                }
            }
        } else if (controlPoint && Number.isFinite(Number(controlPoint.x)) && Number.isFinite(Number(controlPoint.y))) {
            pts.push({ x: Number(controlPoint.x), y: Number(controlPoint.y) });
        }
        if (pts.length === 1) {
            const u = 1 - t;
            return {
                x: u * u * x0 + 2 * u * t * pts[0].x + t * t * x1,
                y: u * u * y0 + 2 * u * t * pts[0].y + t * t * y1
            };
        }
        if (pts.length >= 2) {
            // De Casteljau smooth Bezier curve through [start, ...waypoints, end]
            let work = [{ x: x0, y: y0 }, ...pts, { x: x1, y: y1 }];
            while (work.length > 1) {
                const next = [];
                for (let i = 0; i < work.length - 1; i++) {
                    next.push({
                        x: work[i].x + (work[i + 1].x - work[i].x) * t,
                        y: work[i].y + (work[i + 1].y - work[i].y) * t
                    });
                }
                work = next;
            }
            return work[0];
        }
    }
    return { x: x0 + dx * t, y: y0 + dy * t };
}

module.exports = {
    ASPECT_PRESETS,
    RESIZE_MODES,
    ANCHORS,
    TRANSITION_TYPES,
    PATH_TYPES,
    EASINGS,
    normalizeAspectConfig,
    resolveTargetRatio,
    computeAspectCrop,
    sceneItemScreenRect,
    computeAnchoredTransform,
    rectToObsTransformPatch,
    computeBorderScreenRects,
    computeNativeObsCropPatch,
    evalEasing,
    evalPathPoint
};
