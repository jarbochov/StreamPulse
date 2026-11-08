import { root } from './environment.js';


function cleanupMedia(rootNode) {
    if (!rootNode) return;
    const unloadVideo = v => {
        try {
            v.pause();
            v.removeAttribute('src');
            v.load();
        } catch {}
    };
    const unloadFrame = f => {
        try { f.src = 'about:blank'; } catch {}
    };
    const unloadCanvas = c => {
        try { c.width = 0; c.height = 0; } catch {}
    };
    if (rootNode.tagName === 'VIDEO') unloadVideo(rootNode);
    else if (rootNode.tagName === 'IFRAME') unloadFrame(rootNode);
    else if (rootNode.tagName === 'CANVAS') unloadCanvas(rootNode);
    if (rootNode._patternHandle?.stop) { try { rootNode._patternHandle.stop(); } catch {} rootNode._patternHandle = null; }
    if (typeof rootNode.querySelectorAll === 'function') {
        rootNode.querySelectorAll('video').forEach(unloadVideo);
        rootNode.querySelectorAll('iframe').forEach(unloadFrame);
        rootNode.querySelectorAll('canvas.sp-pattern-canvas').forEach(unloadCanvas);
    }
}

function cleanupNode(node) {
    if (!node) return;
    if (node._alertHandle) {
        const handle = node._alertHandle;
        node._alertHandle = null;
        handle.stop();
    }
    cleanupMedia(node);
    if (node._borderObserver) { node._borderObserver.disconnect(); node._borderObserver = null; }
    if (node._fitObserver) { node._fitObserver.disconnect(); node._fitObserver = null; }
    if (node._speakerFitFrame) { root.cancelAnimationFrame(node._speakerFitFrame); node._speakerFitFrame = 0; }
    if (node._slideshow?.stop) { try { node._slideshow.stop(); } catch {} node._slideshow = null; }
    if (node._slideHandle?.stop) { try { node._slideHandle.stop(); } catch {} node._slideHandle = null; }
    if (node._patternHandle?.stop) { try { node._patternHandle.stop(); } catch {} node._patternHandle = null; }
    if (root.OverlayFilters?.cleanupFilters) {
        root.OverlayFilters.cleanupFilters(node);
    }
    if (node._fxCanvas) {
        node._fxCanvas.remove();
        node._fxCanvas = null;
    }
    if (node._htWrap) {
        node._htWrap.remove();
        node._htWrap = null;
    }
    if (node._fxId) {
        document.getElementById(node._fxId)?.remove();
        node._fxId = null;
    }
    if (typeof node.querySelectorAll === 'function') {
        node.querySelectorAll('.alert-card').forEach(c => {
            if (c._borderObserver) { c._borderObserver.disconnect(); c._borderObserver = null; }
        });
        node.querySelectorAll('.sp-fx-canvas').forEach(c => c.remove());
        node.querySelectorAll('.sp-ht-wrap').forEach(w => w.remove());
        node.querySelectorAll('[data-element-id]').forEach(el => {
            if (el._fxId) {
                document.getElementById(el._fxId)?.remove();
                el._fxId = null;
            }
        });
    }
}

export { cleanupMedia, cleanupNode };
