import { root } from './environment.js';


// ---- media filters ----
// Defaults, presets, dithering, halftone screentones and the filter pipeline live in /js/overlay-filters.js.
// That module attaches defaultMediaFilter, mediaFilterActive and MEDIA_FILTER_PRESETS to OverlayShared when it loads.
const patternRunners = new Set();
let fxPaused = false;
function fxResume() {
    if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('sp-fx-paused', fxPaused || document.hidden);
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
    if (document.hidden) fxResume();
}

export { fxPaused, patternRunners, setEffectsPaused };
