import { fxPaused, patternRunners } from './effects.js';
import { root } from './environment.js';
import { hasBoxFill } from './styles.js';

function proceduralAnimation(element, options) {
    const procP = element.pattern || {};
    const pMotion = options.animate === false ? 'none' : (procP.motion || 'none');
    const pInPlace = options.animate === false ? 'none' : (procP.inPlace ?? (pMotion !== 'none' ? 'auto' : 'none'));
    const pSpin = options.animate === false ? 'none' : (procP.spin || 'none');
    const pColorAnim = options.animate === false ? 'none' : (procP.colorAnim || 'none');
    const hasProcAnim = pMotion !== 'none' || (pInPlace !== 'none' && pInPlace !== false && pInPlace !== 0) || (pSpin !== 'none' && pSpin !== false) || pColorAnim !== 'none';
    return { procP, pMotion, pInPlace, pSpin, pColorAnim, hasProcAnim };
}

function mountProceduralPattern(node, element, options = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-pattern-wrap';
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;contain:strict;';
    const canvas = document.createElement('canvas');
    canvas.className = 'sp-pattern-canvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    wrap.appendChild(canvas);
    node.replaceChildren(wrap);
    const ctx = canvas.getContext('2d', { alpha: true });
    let curElement = element, curOptions = options;
    let stopped = false, rafId = 0, dirtyFrame = true, startTime = 0, lastDrawTs = 0;

    function drawFrame(now) {
        rafId = 0;
        if (stopped || (!node.isConnected && !fxPaused) || !ctx || curElement.visible === false || node.classList.contains('hidden')) return;
        const ts = now || performance.now();
        if (!startTime) startTime = ts;
        const { procP, pMotion, pInPlace, pSpin, pColorAnim, hasProcAnim } = proceduralAnimation(curElement, curOptions);
        if (!dirtyFrame && hasProcAnim && lastDrawTs && ts - lastDrawTs < 15.8) {
            rafId = requestAnimationFrame(drawFrame);
            return;
        }
        dirtyFrame = false;
        lastDrawTs = ts;
        const logicalW = Math.max(1, Number(curElement.width) || node.clientWidth || 300);
        const logicalH = Math.max(1, Number(curElement.height) || node.clientHeight || 200);
        const scaleCap = Math.min(1, 1920 / Math.max(logicalW, logicalH, 1));
        const cw = Math.max(1, Math.round(logicalW * scaleCap));
        const ch = Math.max(1, Math.round(logicalH * scaleCap));
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw; canvas.height = ch;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'medium';
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, cw, ch);
        const t = Math.max(0, (ts - startTime) / 1000);

        const patternsEngine = window.StreamPulsePatterns || root.OverlayShared?.Patterns;
        const p = procP || curElement.pattern || {};
        const presetName = p.preset || 'hexagons';
        const pColorMode = p.colorMode || 'mosaic';
        const pColorSpeed = Number(p.colorSpeed) || 1;
        if (patternsEngine?.drawProceduralPattern) {
            const cleanAccent = (p.accent && p.accent !== 'transparent') ? p.accent : '#58a6ff';
            const cleanSecondary = (p.secondary && p.secondary !== 'transparent') ? p.secondary : cleanAccent;
            patternsEngine.drawProceduralPattern(ctx, presetName, cw, ch, {
                scale: p.scale ?? 100,
                color: p.color || 'transparent',
                accent: cleanAccent,
                secondary: cleanSecondary,
                palette: p.palette || 'dual',
                fillMode: p.fillMode || 'tinted',
                fillOpacity: p.fillOpacity,
                lineWidth: Number(p.lineWidth) || 0,
                motion: pMotion,
                speed: Number(p.speed) || 1,
                panDirection: p.panDirection || 'continuous',
                panAngle: Number.isFinite(Number(p.panAngle)) ? Number(p.panAngle) : (Number.isFinite(Number(p.angle)) ? Number(p.angle) : 45),
                inPlace: pInPlace,
                inPlaceSpeed: Number(p.inPlaceSpeed) || 1,
                spin: pSpin,
                spinSpeed: Number(p.spinSpeed) || 1,
                sizeVariance: Number(p.sizeVariance ?? p.scaleJitter) || 0,
                scatter: Number(p.scatter ?? p.positionJitter) || 0,
                rotationVariance: Number(p.rotationVariance ?? p.rotationJitter) || 0,
                vignette: Number(p.vignette) || 0,
                vignetteColor: p.vignetteColor || '#000000',
                density: Number(p.density) || undefined,
                detail: p.detail,
                colorMode: pColorMode,
                colorAnim: pColorAnim,
                colorSpeed: pColorSpeed,
                snowflakeStyle: p.snowflakeStyle || 'all',
                time: t
            });
        }
        const pFeather = Number(curElement.feather ?? curElement.pattern?.feather) || 0;
        if (pFeather > 0) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'destination-in';
            const stop = Math.max(0, 100 - pFeather);
            const maxR = Math.hypot(cw, ch) / 2;
            const radGrad = ctx.createRadialGradient(cw / 2, ch / 2, maxR * (stop / 100), cw / 2, ch / 2, maxR);
            radGrad.addColorStop(0, '#000000');
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
        }
        if (hasProcAnim && !fxPaused && !document.hidden) {
            rafId = requestAnimationFrame(drawFrame);
        }
    }

    function wake() {
        if (document.hidden) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            return;
        }
        if (stopped || curElement.visible === false || node.classList.contains('hidden')) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            return;
        }
        dirtyFrame = true;
        if (fxPaused) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            drawFrame(performance.now());
            return;
        }
        if (!rafId) rafId = requestAnimationFrame(drawFrame);
    }

    function update(nextEl, nextOpts = {}) {
        if (stopped) return;
        curElement = nextEl || curElement;
        curOptions = nextOpts || curOptions;
        if (curElement.visible === false || node.classList.contains('hidden')) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            canvas.width = 1; canvas.height = 1;
            patternRunners.delete(wake);
            return;
        }
        const config = curElement.pattern || {};
        const blendMode = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'luminosity', 'plus-lighter'].includes(config.blendMode) ? config.blendMode : 'normal';
        const hasFill = hasBoxFill(curElement.style || {});
        wrap.style.mixBlendMode = hasFill && blendMode !== 'normal' ? blendMode : '';
        node.style.mixBlendMode = !hasFill && blendMode !== 'normal' ? blendMode : '';
        if (proceduralAnimation(curElement, curOptions).hasProcAnim) patternRunners.add(wake);
        else patternRunners.delete(wake);
        wake();
    }

    const handle = {
        isStopped: () => stopped,
        stop() {
            stopped = true;
            if (node._patternHandle === handle) node._patternHandle = null;
            patternRunners.delete(wake);
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            canvas.width = 0; canvas.height = 0;
        },
        update,
        redraw: () => { if (!stopped) wake(); }
    };
    node._patternHandle = handle;
    update(element, options);
    return handle;
}

export { mountProceduralPattern };
