import { isOverlayHidden, root } from './environment.js';


// ---- media filters ----
// Defaults, presets, dithering, halftone screentones and the filter pipeline live in /js/overlay-filters.js.
// That module attaches defaultMediaFilter, mediaFilterActive and MEDIA_FILTER_PRESETS to OverlayShared when it loads.
const patternRunners = new Set();
let fxPaused = false;
function fxResume() {
    const hidden = isOverlayHidden();
    if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('sp-fx-paused', fxPaused || hidden);
    }
    for (const wake of patternRunners) wake();
}
function setEffectsPaused(paused) {
    fxPaused = !!paused;
    if (root.OverlayFilters?.setEffectsPaused) root.OverlayFilters.setEffectsPaused(paused);
    if (root.OverlayRetro?.setEffectsPaused) root.OverlayRetro.setEffectsPaused(paused);
    fxResume();
}
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', fxResume);
    document.addEventListener('sp:visibilitychange', fxResume);
    if (isOverlayHidden()) fxResume();
}

function clearFeatherMaskCache(cache) {
    if (!cache || !cache.canvas) return;
    cache.canvas.width = 0;
    cache.canvas.height = 0;
    cache.canvas = null;
    cache.w = 0;
    cache.h = 0;
    cache.feather = -1;
}

function applyRadialFeatherMask(ctx, cw, ch, feather, cache) {
    if (!(feather > 0) || cw < 1 || ch < 1) {
        clearFeatherMaskCache(cache);
        return;
    }
    if (!cache.canvas || cache.w !== cw || cache.h !== ch || cache.feather !== feather) {
        const mask = cache.canvas || (cache.canvas = document.createElement('canvas'));
        mask.width = cw;
        mask.height = ch;
        const mCtx = mask.getContext('2d');
        const stop = Math.max(0, 100 - feather);
        const maxR = Math.hypot(cw, ch) / 2;
        const radGrad = mCtx.createRadialGradient(cw / 2, ch / 2, maxR * (stop / 100), cw / 2, ch / 2, maxR);
        radGrad.addColorStop(0, '#000000');
        radGrad.addColorStop(1, 'rgba(0,0,0,0)');
        mCtx.clearRect(0, 0, cw, ch);
        mCtx.fillStyle = radGrad;
        mCtx.fillRect(0, 0, cw, ch);
        cache.w = cw;
        cache.h = ch;
        cache.feather = feather;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(cache.canvas, 0, 0);
    ctx.restore();
}

export { applyRadialFeatherMask, clearFeatherMaskCache, fxPaused, patternRunners, setEffectsPaused };
