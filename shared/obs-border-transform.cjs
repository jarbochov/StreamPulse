/**
 * Exact OBS Scene Item Transform Compensation for Auto-Padded Borders.
 *
 * When streampulse-borders.lua expands a source's canvas by `pad` pixels on all 4 sides,
 * OBS shifts/shrinks the source unless its scene item transform is compensated.
 * This module computes the exact compensating transform so either:
 *   - 'outer-border': the visible outer edge of the border stays locked to the exact same screen coordinates
 *   - 'content': the inner camera/video content box stays locked to the exact same screen coordinates & size
 */

function clamp(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function normalizePlacement(raw) {
    const p = String(raw || 'outside').toLowerCase();
    if (p === 'center' || p === 'middle') return 'center';
    if (p === 'inside' || p === 'inset') return 'inside';
    return 'outside';
}

/**
 * Visible outer border reach beyond the content edge in unscaled profile pixels.
 * Matches `computeAutoBorderPad` in shared/border-catalog.cjs.
 */
function computeOuterBorderReach(profile = null) {
    if (!profile) return 0;
    const placement = normalizePlacement(profile.placement);
    if (placement === 'inside') return 0;
    const seamOverlap = clamp(profile.seamOverlap, 0, 20, placement === 'outside' ? 1 : 0);
    const innerOn = Boolean(profile.inner?.enabled);
    const outerOn = Boolean(profile.outer?.enabled);
    const inT = innerOn ? clamp(profile.inner?.thickness, 0, 200, 12) : 0;
    const inGap = innerOn ? clamp(profile.inner?.gap, 0, 100, 0) : 0;
    const outT = outerOn ? clamp(profile.outer?.thickness, 0, 200, 2) : 0;
    const outGap = outerOn ? clamp(profile.outer?.gap, 0, 100, 0) : 0;

    if (placement === 'outside') {
        return Math.max(0, (inGap + inT + outGap + outT) - seamOverlap);
    }
    return Math.max(0, 0.5 * (inT + outT) + inGap + outGap);
}

/**
 * Mirrors streampulse-borders.lua `video_tick` scaling and padding math exactly.
 */
function computeEffectiveBorderMetrics(resolvedProfile, baseWidth, baseHeight, txScale = 1) {
    if (!resolvedProfile) {
        return { pad: 0, reach: 0, sizeScale: 1 };
    }
    const placement = normalizePlacement(resolvedProfile.placement);
    if (placement === 'inside') {
        return { pad: 0, reach: 0, sizeScale: 1 };
    }
    const bw = Math.max(1, Number(baseWidth) || 1920);
    const bh = Math.max(1, Number(baseHeight) || 1080);
    let sizeScale = 1.0;
    if (resolvedProfile.autoScale !== false) {
        const refMin = Math.max(1, Math.min(Number(resolvedProfile.baseWidth) || 1920, Number(resolvedProfile.baseHeight) || 1080));
        const curMin = Math.max(1, Math.min(bw, bh));
        sizeScale = Math.max(0.25, Math.min(4.0, curMin / refMin));
    } else if (txScale < 0.999 || txScale > 1.001) {
        sizeScale = Math.max(0.25, Math.min(8.0, 1.0 / Math.max(0.05, txScale)));
    }
    const pad = Math.ceil((Number(resolvedProfile.pad) || 0) * sizeScale);
    const reach = computeOuterBorderReach(resolvedProfile) * sizeScale;
    return { pad, reach, sizeScale };
}

/**
 * Recovers unpadded base source dimensions `(baseW, baseH)` from OBS's current
 * `sourceWidth` / `sourceHeight` (which already include `2 * prevPad`).
 */
function inferBaseDimensions(sourceWidth, sourceHeight, prevProfile, txScale = 1) {
    const sw = Math.max(1, Number(sourceWidth) || 1920);
    const sh = Math.max(1, Number(sourceHeight) || 1080);
    if (!prevProfile || normalizePlacement(prevProfile.placement) === 'inside') {
        return { baseW: sw, baseH: sh };
    }
    let bw = sw;
    let bh = sh;
    for (let i = 0; i < 4; i++) {
        const { pad } = computeEffectiveBorderMetrics(prevProfile, bw, bh, txScale);
        bw = Math.max(1, sw - pad * 2);
        bh = Math.max(1, sh - pad * 2);
    }
    return { baseW: Math.round(bw), baseH: Math.round(bh) };
}

/**
 * OBS alignment bitmask -> normalized anchor ratios (ax, ay) in [0, 0.5, 1].
 * Bit 1 = Left (0), Bit 2 = Right (1), otherwise Center (0.5).
 * Bit 4 = Top (0), Bit 8 = Bottom (1), otherwise Center (0.5).
 */
function alignmentRatios(alignment) {
    const bits = Number.isFinite(Number(alignment)) ? Number(alignment) : 5;
    const ax = (bits & 1) ? 0 : (bits & 2) ? 1 : 0.5;
    const ay = (bits & 4) ? 0 : (bits & 8) ? 1 : 0.5;
    return { ax, ay };
}

function resolveBoundsEffectiveScale(boundsType, boundsWidth, boundsHeight, curW, curH) {
    const bw = Math.max(1, Number(boundsWidth) || curW);
    const bh = Math.max(1, Number(boundsHeight) || curH);
    const cw = Math.max(1, curW);
    const ch = Math.max(1, curH);
    switch (boundsType) {
    case 'OBS_BOUNDS_STRETCH':
        return { sx: bw / cw, sy: bh / ch };
    case 'OBS_BOUNDS_SCALE_OUTER': {
        const s = Math.max(bw / cw, bh / ch);
        return { sx: s, sy: s };
    }
    case 'OBS_BOUNDS_SCALE_TO_WIDTH': {
        const s = bw / cw;
        return { sx: s, sy: s };
    }
    case 'OBS_BOUNDS_SCALE_TO_HEIGHT': {
        const s = bh / ch;
        return { sx: s, sy: s };
    }
    case 'OBS_BOUNDS_MAX_ONLY': {
        const s = Math.min(1, bw / cw, bh / ch);
        return { sx: s, sy: s };
    }
    case 'OBS_BOUNDS_SCALE_INNER':
    default: {
        const s = Math.min(bw / cw, bh / ch);
        return { sx: s, sy: s };
    }
    }
}

/**
 * Computes the exact OBS `sceneItemTransform` patch needed to keep either
 * the visible outer border edges ('outer-border') or the inner content box ('content')
 * locked in place when a source's border profile changes from `prevProfile` to `nextProfile`.
 */
function computeCompensatedTransform(transform, prevProfile, nextProfile, { pinMode = 'outer-border', txScale = 1 } = {}) {
    if (!transform || typeof transform !== 'object') {
        return { changed: false, patch: null, prevMetrics: null, nextMetrics: null };
    }
    const mode = pinMode === 'content' ? 'content' : 'outer-border';
    const { baseW, baseH } = inferBaseDimensions(transform.sourceWidth, transform.sourceHeight, prevProfile, txScale);
    const prevMetrics = computeEffectiveBorderMetrics(prevProfile, baseW, baseH, txScale);
    const nextMetrics = computeEffectiveBorderMetrics(nextProfile, baseW, baseH, txScale);

    const deltaPad = nextMetrics.pad - prevMetrics.pad;
    const deltaReach = nextMetrics.reach - prevMetrics.reach;
    if (Math.abs(deltaPad) < 0.001 && (mode === 'content' || Math.abs(deltaReach) < 0.001)) {
        return { changed: false, patch: null, prevMetrics, nextMetrics };
    }

    const posX = Number(transform.positionX) || 0;
    const posY = Number(transform.positionY) || 0;
    const rotationDeg = Number(transform.rotation) || 0;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const { ax, ay } = alignmentRatios(transform.alignment);

    const boundsType = String(transform.boundsType || 'OBS_BOUNDS_NONE');
    const hasBounds = boundsType !== 'OBS_BOUNDS_NONE' && Number(transform.boundsWidth) > 0 && Number(transform.boundsHeight) > 0;

    const cropL = Number(transform.cropLeft) || 0;
    const cropR = Number(transform.cropRight) || 0;
    const cropT = Number(transform.cropTop) || 0;
    const cropB = Number(transform.cropBottom) || 0;
    const curW = Math.max(1, (baseW + prevMetrics.pad * 2) - cropL - cropR);
    const curH = Math.max(1, (baseH + prevMetrics.pad * 2) - cropT - cropB);
    const newCurW = Math.max(1, (baseW + nextMetrics.pad * 2) - cropL - cropR);
    const newCurH = Math.max(1, (baseH + nextMetrics.pad * 2) - cropT - cropB);

    const oldScale = hasBounds
        ? resolveBoundsEffectiveScale(boundsType, transform.boundsWidth, transform.boundsHeight, curW, curH)
        : { sx: Number(transform.scaleX) || 1, sy: Number(transform.scaleY) || 1 };
    const oldScaleX = oldScale.sx;
    const oldScaleY = oldScale.sy;

    const isUniformBounds = hasBounds && boundsType !== 'OBS_BOUNDS_STRETCH';
    let newScaleX = oldScaleX;
    let newScaleY = oldScaleY;

    if (mode === 'outer-border') {
        const oldOuterW = Math.max(1, baseW + 2 * prevMetrics.reach);
        const newOuterW = Math.max(1, baseW + 2 * nextMetrics.reach);
        const oldOuterH = Math.max(1, baseH + 2 * prevMetrics.reach);
        const newOuterH = Math.max(1, baseH + 2 * nextMetrics.reach);
        if (isUniformBounds) {
            // Uniform bounding boxes keep a single aspect-preserving scale; match the limiting axis
            const ratioX = (Number(transform.boundsWidth) || curW) / curW;
            const ratioY = (Number(transform.boundsHeight) || curH) / curH;
            const useY = boundsType === 'OBS_BOUNDS_SCALE_TO_HEIGHT'
                || (boundsType === 'OBS_BOUNDS_SCALE_OUTER' && ratioY >= ratioX)
                || (boundsType !== 'OBS_BOUNDS_SCALE_OUTER' && boundsType !== 'OBS_BOUNDS_SCALE_TO_WIDTH' && ratioY <= ratioX);
            const uniformScale = useY ? oldScaleY * (oldOuterH / newOuterH) : oldScaleX * (oldOuterW / newOuterW);
            newScaleX = uniformScale;
            newScaleY = uniformScale;
        } else {
            newScaleX = oldScaleX * (oldOuterW / newOuterW);
            newScaleY = oldScaleY * (oldOuterH / newOuterH);
        }
    }

    const oldMargin = mode === 'outer-border' ? (prevMetrics.pad - prevMetrics.reach) : prevMetrics.pad;
    const newMargin = mode === 'outer-border' ? (nextMetrics.pad - nextMetrics.reach) : nextMetrics.pad;
    const deltaMarginX = (newMargin * newScaleX) - (oldMargin * oldScaleX);
    const deltaMarginY = (newMargin * newScaleY) - (oldMargin * oldScaleY);

    const oldRenderW = curW * oldScaleX;
    const oldRenderH = curH * oldScaleY;
    const newRenderW = newCurW * newScaleX;
    const newRenderH = newCurH * newScaleY;

    const deltaBoxW = newRenderW - oldRenderW;
    const deltaBoxH = newRenderH - oldRenderH;

    // Shift anchor point so the pinned rectangle stays at the exact same screen coordinates
    const localDx = ax * deltaBoxW - deltaMarginX;
    const localDy = ay * deltaBoxH - deltaMarginY;
    const nextPosX = Number((posX + localDx * cos - localDy * sin).toFixed(3));
    const nextPosY = Number((posY + localDx * sin + localDy * cos).toFixed(3));

    const patch = {
        positionX: nextPosX,
        positionY: nextPosY
    };

    if (hasBounds) {
        const nextBoundsW = Math.max(1, Number(transform.boundsWidth) + deltaBoxW);
        const nextBoundsH = Math.max(1, Number(transform.boundsHeight) + deltaBoxH);
        patch.boundsWidth = Number(nextBoundsW.toFixed(3));
        patch.boundsHeight = Number(nextBoundsH.toFixed(3));
    } else if (mode === 'outer-border' && Math.abs(deltaReach) >= 0.001) {
        patch.scaleX = Number(newScaleX.toFixed(6));
        patch.scaleY = Number(newScaleY.toFixed(6));
    }

    return {
        changed: true,
        patch,
        prevMetrics,
        nextMetrics,
        baseWidth: baseW,
        baseHeight: baseH
    };
}

module.exports = {
    computeOuterBorderReach,
    computeEffectiveBorderMetrics,
    inferBaseDimensions,
    alignmentRatios,
    computeCompensatedTransform
};
