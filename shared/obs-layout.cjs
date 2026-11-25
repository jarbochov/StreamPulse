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
        durationMs: clamp(src.durationMs, 0, 3000, 400)
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
    let width = Number(tx.width);
    let height = Number(tx.height);
    if (!Number.isFinite(width) || width <= 0) {
        width = hasBounds ? Number(tx.boundsWidth) : effSrcW * Math.abs(Number(tx.scaleX) || 1);
    }
    if (!Number.isFinite(height) || height <= 0) {
        height = hasBounds ? Number(tx.boundsHeight) : effSrcH * Math.abs(Number(tx.scaleY) || 1);
    }

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

module.exports = {
    ASPECT_PRESETS,
    RESIZE_MODES,
    ANCHORS,
    normalizeAspectConfig,
    resolveTargetRatio,
    computeAspectCrop,
    sceneItemScreenRect,
    computeAnchoredTransform,
    rectToObsTransformPatch
};
