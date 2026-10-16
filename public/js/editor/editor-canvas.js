/**
 * StreamPulse Custom Overlay Editor — Canvas Stage, Viewport, Cutout Mask & Rendering
 */

import {
    $, clamp, isLine, boxOf, visualBoxOf, boundsOf, scaleSnapshot, applyScale,
    TEXT_TYPES, MIN_SIZE, LIMITS, state, prefs, byId, selectedElements,
    primary, inView, visibleElements, withGroups, setSelection, changed,
    expand, liveSignature, alertSample, toast
} from './editor-state.js';

const shared = window.OverlayShared || {};

export const stage = $('stage');
export const world = $('world');
export const canvasEl = $('canvas');
export const underlayerEl = $('canvas-underlayer');
export const toplayerEl = $('canvas-toplayer');
export const backdrop = $('backdrop');
export const gridEl = $('grid');
export const guidesEl = $('guides');
export const uiEl = $('ui');

// ---- Viewport (zoom / pan) --------------------------------------------------------
export function applyView() {
    if (!world || !stage) return;
    world.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    stage.style.setProperty('--inv', String(1 / state.zoom));
    const step = state.zoom >= 0.5 ? 20 : state.zoom >= 0.2 ? 50 : 100;
    if (gridEl) gridEl.style.backgroundSize = `${step}px ${step}px`;
    const label = $('bounds-label');
    if (label) {
        label.textContent = `${state.overlay.canvas.width} × ${state.overlay.canvas.height}`;
        label.style.left = `${Math.max(4, state.pan.x)}px`;
        label.style.top = `${Math.max(4, state.pan.y - 20)}px`;
    }
    const zoomReset = $('zoom-reset');
    if (zoomReset) zoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
}

export function zoomAt(next, clientX, clientY) {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const logicalX = (px - state.pan.x) / state.zoom;
    const logicalY = (py - state.pan.y) / state.zoom;
    state.zoom = clamp(next, 0.1, 4);
    state.pan.x = px - logicalX * state.zoom;
    state.pan.y = py - logicalY * state.zoom;
    state.autoFit = false;
    applyView();
}

export function fitView(quiet = false) {
    if (!stage) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w < 50 || h < 50) return;
    state.zoom = clamp(Math.min((w - 72) / state.overlay.canvas.width, (h - 88) / state.overlay.canvas.height), 0.1, 4);
    state.pan.x = Math.round((w - state.overlay.canvas.width * state.zoom) / 2);
    state.pan.y = Math.round((h - state.overlay.canvas.height * state.zoom) / 2 + 8);
    state.autoFit = true;
    applyView();
    if (quiet !== true) toast(`Fit to ${Math.round(state.zoom * 100)}%`, 'info', 900);
}

export const toLogical = (clientX, clientY) => {
    const rect = stage.getBoundingClientRect();
    return {
        x: (clientX - rect.left - state.pan.x) / state.zoom,
        y: (clientY - rect.top - state.pan.y) / state.zoom
    };
};

// ---- Canvas UI synchronization ----------------------------------------------------
export function syncCanvasUI() {
    const { width, height, background } = state.overlay.canvas;
    for (const node of [backdrop, canvasEl, underlayerEl, toplayerEl, gridEl, guidesEl, uiEl, $('safe-zones')]) {
        if (node) { node.style.width = `${width}px`; node.style.height = `${height}px`; }
    }
    if (canvasEl) canvasEl.style.background = 'transparent';
    if (underlayerEl) underlayerEl.style.background = background || 'transparent';
    if (backdrop) backdrop.className = `bd-${prefs.backdrop}`;
    const bdImg = $('backdrop-img');
    if (bdImg) {
        if (prefs.backdropImage) {
            bdImg.src = prefs.backdropImage;
            bdImg.style.display = 'block';
            bdImg.style.opacity = String((prefs.backdropOpacity ?? 80) / 100);
        } else {
            bdImg.style.display = 'none';
            bdImg.removeAttribute('src');
        }
    }
    if (gridEl) gridEl.classList.toggle('on', prefs.grid);
    $('safe-zones')?.classList.toggle('on', !!prefs.safeZones);
    applyView();
}

// ---- Cutout Underlayer Masking ----------------------------------------------------
export function updateEditorCutoutMask() {
    const under = $('canvas-underlayer');
    if (!under) return;
    const canW = Number(state.overlay.canvas?.width) || 1920;
    const canH = Number(state.overlay.canvas?.height) || 1080;
    const cutouts = state.overlay.elements.filter(e => e.type === 'cutout' && e.visible !== false && inView(e));
    if (!cutouts.length) {
        under._lastMaskUrl = '';
        under.style.removeProperty('-webkit-mask-image');
        under.style.removeProperty('-webkit-mask-size');
        under.style.removeProperty('-webkit-mask-repeat');
        under.style.removeProperty('-webkit-mask-position');
        under.style.removeProperty('-webkit-mask');
        under.style.removeProperty('mask-image');
        under.style.removeProperty('mask-size');
        under.style.removeProperty('mask-repeat');
        under.style.removeProperty('mask-position');
        under.style.removeProperty('mask');
        return;
    }
    const filters = [];
    const shapes = cutouts.map(el => {
        const shape = el.cutout?.shape || 'rectangle';
        const feather = Math.max(0, Math.min(100, Number(el.cutout?.feather) || 0));
        let filterAttr = '';
        if (feather > 0) {
            const filterId = `editor-cutout-feather-${el.id}`;
            filters.push(`<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${feather / 2}"/></filter>`);
            filterAttr = `filter="url(#${filterId})"`;
        }
        const b = boxOf(el);
        const x = Number(b.x) || 0;
        const y = Number(b.y) || 0;
        const w = Number(b.w) || 0;
        const h = Number(b.h) || 0;
        if (shape === 'circle') {
            const cx = x + w / 2;
            const cy = y + h / 2;
            const rx = w / 2;
            const ry = h / 2;
            return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="black" ${filterAttr}/>`;
        }
        if (shape === 'pill') {
            const rx = Math.min(w, h) / 2;
            return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="black" ${filterAttr}/>`;
        }
        const rad = Math.max(0, Number(el.style?.borderRadius) || 0);
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" ry="${rad}" fill="black" ${filterAttr}/>`;
    });

    // Use a self-contained SVG image data URI. WebKit (Safari) does not support SVG DOM fragment masks
    // (url(#id)) on HTML elements, but has full hardware-accelerated support for SVG image data URIs in CSS mask-image.
    const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="${canW}" height="${canH}" viewBox="0 0 ${canW} ${canH}"><defs>${filters.join('')}<mask id="m"><rect width="100%" height="100%" fill="white"/>${shapes.join('')}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`;
    const maskDataUrl = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}")`;
    if (under._lastMaskUrl === maskDataUrl) return;
    under._lastMaskUrl = maskDataUrl;
    under.style.setProperty('-webkit-mask-image', maskDataUrl);
    under.style.setProperty('-webkit-mask-size', '100% 100%');
    under.style.setProperty('-webkit-mask-repeat', 'no-repeat');
    under.style.setProperty('-webkit-mask-position', '0 0');
    under.style.setProperty('mask-image', maskDataUrl);
    under.style.setProperty('mask-size', '100% 100%');
    under.style.setProperty('mask-repeat', 'no-repeat');
    under.style.setProperty('mask-position', '0 0');
}

let editorCutoutMaskRaf = null;
export function scheduleEditorCutoutMask() {
    if (editorCutoutMaskRaf) return;
    editorCutoutMaskRaf = requestAnimationFrame(() => {
        editorCutoutMaskRaf = null;
        updateEditorCutoutMask();
    });
}

// ---- Content and Styling ----------------------------------------------------------
export function applyNodeStyle(node, el, index) {
    const s = el.style || {}, b = boxOf(el);
    node.className = `canvas-element type-${el.type}${isLine(el) ? ' is-line' : ''}${state.selectedIds.has(el.id) ? ' selected' : ''}${el.locked ? ' locked' : ''}${el.visible === false ? ' hidden' : ''}${node._extra || ''}`;
    let cutoutBorder = '0';
    let cutoutRadius = '0';
    if (el.type === 'cutout') {
        const sh = el.cutout?.shape || 'rectangle';
        if (sh === 'circle') cutoutRadius = '50%';
        else if (sh === 'pill') cutoutRadius = '999px';
        else cutoutRadius = `${s.borderRadius || 0}px`;
        cutoutBorder = (s.borderWidth && Number(s.borderWidth) > 0) ? `${s.borderWidth}px solid ${s.borderColor || '#38bdf8'}` : '1.5px dashed rgba(56, 189, 248, 0.75)';
    }
    Object.assign(node.style, {
        left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, zIndex: index,
        opacity: s.opacity ?? 1, background: (el.type === 'alert' || el.type === 'cutout') ? 'transparent' : (s.background || 'transparent'),
        border: el.type === 'alert' ? '0' : el.type === 'cutout' ? cutoutBorder : `${s.borderWidth || 0}px solid ${s.borderColor || 'transparent'}`,
        borderRadius: el.type === 'alert' ? '0' : el.type === 'cutout' ? cutoutRadius : `${s.borderRadius || 0}px`,
        padding: `${TEXT_TYPES.has(el.type) ? s.padding || 0 : 0}px`,
        fontFamily: s.fontFamily, fontSize: `${s.fontSize}px`, fontWeight: s.fontWeight, color: s.color, textAlign: s.textAlign,
        lineHeight: s.lineHeight, letterSpacing: `${s.letterSpacing || 0}px`,
        display: s.verticalAlign === 'top' ? 'block' : 'flex',
        alignItems: s.verticalAlign === 'middle' ? 'center' : s.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
        justifyContent: s.textAlign === 'center' ? 'center' : s.textAlign === 'right' ? 'flex-end' : 'flex-start'
    });
    if (el.type === 'cutout') {
        node.style.boxShadow = s.shadow?.blur ? `0 0 ${s.shadow.blur}px ${s.shadow.color || 'rgba(0,0,0,0.5)'}` : 'none';
    }
    if (el.type !== 'alert' && el.type !== 'cutout') {
        Object.assign(node.style, shared.decorationStyle ? shared.decorationStyle(s, el.type) : {});
        if (shared.applyBorderGradient) shared.applyBorderGradient(node, s);
    }
    if (shared.textEffectStyle) Object.assign(node.style, shared.textEffectStyle(s, el.type));
    if (shared.shadowClipStyle) Object.assign(node.style, shared.shadowClipStyle(el));
    if (el.type === 'game-list' || el.type === 'slideshow') node.style.display = 'block';
    if (el.type === 'markdown') {
        node.style.setProperty('--hs', (el.headingScale ?? 100) / 100);
        node.classList.toggle('md-right', s.textAlign === 'right');
        const cols = el.columns > 1 ? Number(el.columns) : 0;
        node.classList.toggle('md-cols', !!cols);
        node.dataset.span = el.headingSpan ?? 6;
        if (cols) node.style.display = 'block';
    }
    if (el.type === 'shape') {
        if (s.shape === 'circle') node.style.borderRadius = '50%';
        if (s.shape === 'pill') node.style.borderRadius = '999px';
        if (s.shape === 'line') node.style.border = '0';
    }
    if (el.type === 'random-text' && node._extra !== undefined) node.style.setProperty('--marquee-duration', `${Math.max(10, el.random?.marqueeSpeed || 60)}s`);
    if (shared.loadGoogleFont) shared.loadGoogleFont(s.fontFamily);
    if (shared.applyMediaFilter) shared.applyMediaFilter(node, el);
    node.style.transform = s.rotate ? `rotate(${s.rotate}deg)` : '';
}

export const placeholder = text => {
    const node = document.createElement('div');
    node.className = 'media-placeholder';
    node.textContent = text;
    return node;
};

export function buildContent(node, el) {
    node.replaceChildren();
    node._extra = '';
    if (el.type === 'image' || el.type === 'video') {
        const url = expand(el.src);
        if (!url) { node.appendChild(placeholder(`No ${el.type} yet — upload one or paste a URL`)); return; }
        if (/\{\{/.test(url)) { node.appendChild(placeholder(`${url} (shows when a value is available)`)); return; }
        if (el.type === 'video' && shared.parseYouTubeUrl && shared.parseYouTubeUrl(url)) {
            const v = el.video || {};
            const embedSrc = shared.embedUrl(url, { autoplay: v.autoplay !== false, loop: v.loop !== false, sound: false });
            const frame = document.createElement('iframe');
            frame.src = embedSrc;
            frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            frame.style.cssText = 'width:100%;height:100%;border:0;';
            node.appendChild(frame);
            return;
        }
        const media = document.createElement(el.type === 'image' ? 'img' : 'video');
        media.src = url;
        media.draggable = false;
        media.style.objectFit = el.style.objectFit || 'cover';
        media.style.objectPosition = `${el.style.focusX ?? 50}% ${el.style.focusY ?? 50}%`;
        if (el.type === 'video') {
            const v = el.video || {};
            const hasSound = Boolean(v.sound === true || (v.sound !== false && v.muted === false));
            const volume = Math.max(0, Math.min(1, (Number.isFinite(Number(v.volume)) ? Number(v.volume) : 100) / 100));
            const auto = v.autoplay !== false;
            media.loop = v.loop !== false;
            media.autoplay = auto;
            if (!auto) media.preload = 'auto';
            media.playsInline = true;
            media.dataset.hasSound = hasSound ? 'true' : 'false';
            media.dataset.targetVolume = String(volume);
            media.muted = !hasSound;
            if (hasSound && auto) {
                media.volume = volume;
                const p = media.play();
                if (p && p.catch) {
                    p.catch(() => {
                        media.dataset.audioPending = 'true';
                        media.muted = true;
                        media.play().catch(() => {});
                    });
                }
            }
        }
        media.addEventListener('error', () => { node.replaceChildren(placeholder(`Couldn't load this ${el.type}. Check the URL or upload it again.`)); });
        node.appendChild(media);
    } else if (el.type === 'icon') {
        if (shared.renderIcon) shared.renderIcon(node, el.content, el.style);
    } else if (el.type === 'qr') {
        const url = shared.qrUrl ? shared.qrUrl(expand(el.src), el.qr) : '';
        if (!url || /\{\{/.test(expand(el.src))) { node.appendChild(placeholder('Enter a link or text for the QR code')); return; }
        const media = document.createElement('img');
        media.src = url; media.draggable = false; media.style.objectFit = 'contain';
        media.addEventListener('error', () => { node.replaceChildren(placeholder("Couldn't build this QR code. Try shorter text.")); });
        node.appendChild(media);
    } else if (el.type === 'embed') {
        const rawUrl = expand(el.src);
        const isYt = Boolean(shared.parseYouTubeUrl && shared.parseYouTubeUrl(rawUrl));
        const v = el.video || {};
        const url = shared.embedUrl ? shared.embedUrl(rawUrl, isYt ? { autoplay: v.autoplay !== false, loop: v.loop !== false, sound: false } : { sound: false }) : rawUrl;
        if (!/^https?:\/\//i.test(url)) { node.appendChild(placeholder('Enter an http(s) webpage URL or YouTube link')); return; }
        const frame = document.createElement('iframe');
        frame.src = url;
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        frame.style.cssText = 'width:100%;height:100%;border:0;';
        if (isYt) {
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
        } else {
            let sameOrigin = false;
            try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch { /* invalid URL stays sandboxed */ }
            frame.sandbox = 'allow-forms allow-popups allow-scripts allow-presentation' + (sameOrigin ? ' allow-same-origin' : '');
            frame.referrerPolicy = 'no-referrer';
        }
        node.appendChild(frame);
    } else if (el.type === 'cutout') {
        const shape = el.cutout?.shape || 'rectangle';
        const s = el.style || {};
        if (shape === 'circle') node.style.borderRadius = '50%';
        else if (shape === 'pill') node.style.borderRadius = '999px';
        else node.style.borderRadius = `${s.borderRadius || 0}px`;
        node.style.background = 'transparent';
        node.style.border = (s.borderWidth && Number(s.borderWidth) > 0) ? `${s.borderWidth}px solid ${s.borderColor || '#38bdf8'}` : '1.5px dashed rgba(56, 189, 248, 0.75)';
        node.style.boxShadow = s.shadow?.blur ? `0 0 ${s.shadow.blur}px ${s.shadow.color || 'rgba(0,0,0,0.5)'}` : 'none';
        node.innerHTML = `
            <div style="position:absolute;top:6px;left:8px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:rgba(56,189,248,0.9);background:rgba(15,23,42,0.85);padding:2px 6px;border-radius:4px;pointer-events:none;border:1px solid rgba(56,189,248,0.3);display:flex;align-items:center;gap:4px;user-select:none;">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="2 2"/></svg>Cutout
            </div>
        `;
    } else if (el.type === 'markdown') {
        node.innerHTML = shared.renderMarkdown ? shared.renderMarkdown(expand(shared.elementContent(el)), el) : expand(el.content);
    } else if (el.type === 'random-text') {
        const first = shared.elementItems ? shared.elementItems(el).find(Boolean) ?? el.content ?? '' : el.content;
        if (el.random?.typewriter) {
            const caret = document.createElement('span');
            caret.className = 'overlay-caret'; caret.textContent = expand(first);
            node.replaceChildren(caret);
            node._extra += ' overlay-typewriter';
        } else node.textContent = expand(first);
        if (el.random?.marquee) {
            node._extra += ' overlay-marquee';
            if (shared.wrapMarquee) shared.wrapMarquee(node);
        }
    } else if (el.type === 'text') {
        node.textContent = expand(shared.elementContent ? shared.elementContent(el) : el.content);
    } else if (el.type === 'slideshow') {
        node._slideHandle?.stop();
        if (shared.mountSlideshow) node._slideHandle = shared.mountSlideshow(node, el, { preview: true, animate: true });
    } else if (el.type === 'game-list') {
        if (shared.renderGameList) shared.renderGameList(node, el, state.liveStatus.gamePlan);
    } else if (el.type === 'progress') {
        node._progressKind = null;
        if (shared.renderProgress) shared.renderProgress(node, el, expand);
    } else if (el.type === 'alert') {
        if (shared.prepareAlertNode) shared.prepareAlertNode(node, el);
        if (node._alertHandle) node._alertHandle.stop();
        if (shared.playAlert) node._alertHandle = shared.playAlert(node, el, { ...alertSample(el), animIn: 'none', durationMs: 3600000 }, { sound: false });
    }
}

export const sourceSignature = el => {
    const stateVal = shared.textSourceState ? shared.textSourceState(el) : null;
    return stateVal ? [stateVal.text, stateVal.error] : null;
};

export const contentSignature = (el, live) =>
    el.type === 'embed' ? JSON.stringify([el.type, expand(el.src)]) :
    el.type === 'slideshow' ? JSON.stringify([el.type, el.slideshow]) :
    el.type === 'cutout' ? JSON.stringify([el.type, el.cutout, el.style?.borderRadius, el.style?.borderWidth, el.style?.borderColor, el.width, el.height]) :
    el.type === 'alert' ? JSON.stringify([el.type, el.alert, el.style]) :
    el.type === 'video' ? JSON.stringify([el.type, expand(el.src), el.video, el.style.objectFit, el.style.focusX, el.style.focusY]) :
    JSON.stringify([
        el.type, el.content, el.src, el.items, el.source, el.textFit, el.columns,
        el.headingSpan, el.headingScale, sourceSignature(el), el.progress, el.gameList,
        el.alert, el.style.color, el.style.fontFamily, el.style.fontWeight, el.style.textStroke,
        el.style.textShadow, el.qr, el.style.fill, el.random?.typewriter, el.random?.marquee,
        el.style.objectFit, el.style.focusX, el.style.focusY, live
    ]);

export function tickPlaceholders() {
    if (!prefs.live) return;
    for (const el of state.overlay.elements) {
        const node = state.nodes.get(el.id);
        if (!node || !['text', 'markdown', 'progress'].includes(el.type) || !shared.hasTicking) continue;
        const textToCheck = el.type === 'progress' ? `${el.content} ${el.progress?.label}` : (shared.elementContent ? shared.elementContent(el) : el.content);
        if (!shared.hasTicking(textToCheck)) continue;
        if (el.type === 'progress') {
            if (shared.renderProgress) shared.renderProgress(node, el, expand);
        } else if (el.type === 'markdown') {
            node.innerHTML = shared.renderMarkdown ? shared.renderMarkdown(expand(shared.elementContent(el)), el) : expand(el.content);
        } else {
            node.textContent = expand(shared.elementContent ? shared.elementContent(el) : el.content);
        }
        if (el.textFit && el.textFit !== 'none' && shared.fitText) shared.fitText(node, el);
    }
}

if (document.fonts) {
    document.fonts.addEventListener('loadingdone', () => {
        if (state.overlay.elements.some(el => el.textFit && el.textFit !== 'none')) renderCanvas();
    });
}

// Pass `only` (a set of element ids) during drags and resizes to restyle just those nodes.
let lastLive = '';
export function renderCanvas(only) {
    const seen = new Set();
    const live = only ? lastLive : (lastLive = liveSignature());
    const activeCutouts = state.overlay.elements.filter(e => e.type === 'cutout' && e.visible !== false && inView(e));
    const maxCutoutIndex = activeCutouts.length ? Math.max(...activeCutouts.map(c => state.overlay.elements.indexOf(c))) : -1;
    const under = $('canvas-underlayer') || canvasEl;
    const top = $('canvas-toplayer') || canvasEl;

    state.overlay.elements.forEach((el, index) => {
        seen.add(el.id);
        if (only && !only.has(el.id)) return;
        const isTop = el.type === 'cutout' || index > maxCutoutIndex;
        const targetParent = isTop ? top : under;
        let node = state.nodes.get(el.id);
        if (!node) {
            node = document.createElement('div');
            node.dataset.id = el.id;
            node.dataset.type = el.type;
            state.nodes.set(el.id, node);
        }
        node.dataset.type = el.type;
        if (node.parentNode !== targetParent) {
            targetParent.appendChild(node);
        }
        if (!node._sig || !only) {
            const signature = contentSignature(el, live);
            if (node._sig !== signature) {
                const existingVid = el.type === 'video' ? node.querySelector(':scope > video') : null;
                const canReuseVid = existingVid && node._src === el.src && node._fit === el.style?.objectFit && node._fx === el.style?.focusX && node._fy === el.style?.focusY;
                if (canReuseVid) {
                    node._sig = signature;
                    const v = el.video || {};
                    const hasSound = Boolean(v.sound === true || (v.sound !== false && v.muted === false));
                    const vol = Math.max(0, Math.min(1, (Number.isFinite(Number(v.volume)) ? Number(v.volume) : 100) / 100));
                    existingVid.loop = v.loop !== false;
                    existingVid.dataset.hasSound = hasSound ? 'true' : 'false';
                    existingVid.dataset.targetVolume = String(vol);
                    existingVid.muted = !hasSound;
                    if (hasSound) {
                        existingVid.volume = vol;
                        delete existingVid.dataset.audioPending;
                        if (existingVid.paused) existingVid.play().catch(() => {});
                    }
                } else {
                    node._sig = signature;
                    node._src = el.src;
                    node._fit = el.style?.objectFit;
                    node._fx = el.style?.focusX;
                    node._fy = el.style?.focusY;
                    buildContent(node, el);
                }
            }
        }
        applyNodeStyle(node, el, index);
        if (!inView(el)) { node.style.display = 'none'; return; }
        if (TEXT_TYPES.has(el.type) && el.textFit && el.textFit !== 'none' && shared.fitText) {
            const probe = el.type === 'random-text' ? (shared.elementItems ? shared.elementItems(el).map(expand).reduce((a, b) => (b.length > a.length ? b : a), '') : null) : null;
            shared.fitText(node, el, probe);
        }
    });
    if (only) {
        if ([...only].some(id => byId(id)?.type === 'cutout')) scheduleEditorCutoutMask();
        return;
    }
    for (const [id, node] of state.nodes) {
        if (!seen.has(id)) {
            node._slideHandle?.stop();
            node.remove();
            state.nodes.delete(id);
        }
    }
    $('empty-hint')?.classList.toggle('on', !visibleElements().length);
    updateEditorCutoutMask();
    renderSelectionUI();
}

export function unlockMediaAudio() {
    document.querySelectorAll('video[data-has-sound="true"]').forEach(video => {
        const targetVol = Number(video.dataset.targetVolume);
        const volume = Number.isFinite(targetVol) ? targetVol : 1;
        video.muted = false;
        video.volume = volume;
        delete video.dataset.audioPending;
        if (video.paused) video.play().catch(() => {});
    });
}
['click', 'touchstart', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockMediaAudio, { passive: true, capture: true });
});

// ---- Selection UI & Handles -------------------------------------------------------
export const HANDLE_POS = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };

export function addHandles(dirs, bounds) {
    if (!uiEl) return;
    for (const dir of dirs) {
        const handle = document.createElement('div');
        handle.className = 'handle'; handle.dataset.dir = dir;
        handle.style.left = `${bounds.x + bounds.w * HANDLE_POS[dir][0] / 100}px`;
        handle.style.top = `${bounds.y + bounds.h * HANDLE_POS[dir][1] / 100}px`;
        uiEl.appendChild(handle);
    }
}

export function renderSelectionUI(chipText) {
    if (!uiEl) return;
    uiEl.replaceChildren();
    const items = selectedElements().filter(el => el.visible !== false);
    if (!items.length) return;
    for (const el of items) {
        const b = boxOf(el), outline = document.createElement('div');
        outline.className = `sel-outline${el.locked ? ' locked' : ''}`;
        Object.assign(outline.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
        if (el.style?.rotate) outline.style.transform = `rotate(${el.style.rotate}deg)`;
        uiEl.appendChild(outline);
    }
    const bounds = boundsOf(items);
    if (items.length > 1) {
        const group = document.createElement('div');
        group.className = 'sel-group';
        Object.assign(group.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.w}px`, height: `${bounds.h}px` });
        uiEl.appendChild(group);
        if (items.some(el => !el.locked)) addHandles(Object.keys(HANDLE_POS), bounds);
    } else if (!items[0].locked) {
        const single = items[0], b = boxOf(single);
        const dirs = isLine(single) ? ['w', 'e'] : Object.keys(HANDLE_POS);
        const rot = ((single.style?.rotate || 0) * Math.PI) / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        for (const dir of dirs) {
            const handle = document.createElement('div');
            handle.className = 'handle'; handle.dataset.dir = dir;
            const lx = -b.w / 2 + b.w * HANDLE_POS[dir][0] / 100;
            const ly = -b.h / 2 + b.h * HANDLE_POS[dir][1] / 100;
            handle.style.left = `${Math.round(cx + lx * cos - ly * sin)}px`;
            handle.style.top = `${Math.round(cy + lx * sin + ly * cos)}px`;
            if (single.style?.rotate) handle.style.transform = `translate(-50%, -50%) rotate(${single.style.rotate}deg)`;
            uiEl.appendChild(handle);
        }
    }
    if (chipText) {
        const chip = document.createElement('div');
        chip.className = 'dim-chip'; chip.textContent = chipText;
        chip.style.left = `${bounds.x + bounds.w / 2}px`;
        chip.style.top = `calc(${bounds.y + bounds.h}px + var(--inv, 1) * 10px)`;
        uiEl.appendChild(chip);
    }
}

export function showGuides(xs = [], ys = []) {
    if (!guidesEl) return;
    guidesEl.replaceChildren();
    for (const x of xs) { const line = document.createElement('div'); line.className = 'guide v'; line.style.left = `${x}px`; guidesEl.appendChild(line); }
    for (const y of ys) { const line = document.createElement('div'); line.className = 'guide h'; line.style.top = `${y}px`; guidesEl.appendChild(line); }
}

export function snapTargets(excludeIds) {
    const xs = [0, state.overlay.canvas.width / 2, state.overlay.canvas.width];
    const ys = [0, state.overlay.canvas.height / 2, state.overlay.canvas.height];
    for (const el of visibleElements()) {
        if (excludeIds.has(el.id) || el.visible === false) continue;
        const b = visualBoxOf(el);
        xs.push(b.x, b.x + b.w / 2, b.x + b.w);
        ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
}

export function snapAxis(candidates, targets) {
    const threshold = 6 / state.zoom;
    let best = null;
    for (const c of candidates) {
        for (const t of targets) {
            const d = t - c;
            if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
        }
    }
    if (best === null) return { delta: 0, lines: [] };
    const lines = new Set();
    for (const c of candidates) {
        for (const t of targets) {
            if (Math.abs(t - (c + best)) < 0.5) lines.add(t);
        }
    }
    return { delta: best, lines: [...lines] };
}

// ---- Canvas Gestures Setup --------------------------------------------------------
export function initCanvasGestures({ onSyncGeometry, onUpdateStatusBar, onRenderProperties, onHideContextMenu }) {
    const isAdditive = event => event.shiftKey || event.ctrlKey || event.metaKey;

    function moveGesture(event, dx, dy) {
        const gesture = state.gesture;
        if (!gesture || gesture.locked || !gesture.items.length) return;
        if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        let guideX = [], guideY = [];
        if (prefs.snap && !event.altKey) {
            const targets = snapTargets(new Set(gesture.items.map(item => item.el.id)));
            const b = gesture.bounds;
            const sx = snapAxis([b.x + dx, b.x + dx + b.w / 2, b.x + dx + b.w], targets.xs);
            const sy = snapAxis([b.y + dy, b.y + dy + b.h / 2, b.y + dy + b.h], targets.ys);
            dx += sx.delta; dy += sy.delta; guideX = sx.lines; guideY = sy.lines;
        }
        for (const item of gesture.items) { item.el.x = Math.round(item.x + dx); item.el.y = Math.round(item.y + dy); }
        showGuides(guideX, guideY);
        renderCanvas(new Set(gesture.items.map(item => item.el.id)));
        renderSelectionUI(gesture.items.length === 1 ? `${gesture.items[0].el.x}, ${gesture.items[0].el.y}` : undefined);
        if (onSyncGeometry) onSyncGeometry();
        if (onUpdateStatusBar) onUpdateStatusBar();
    }

    function multiResizeGesture(event, dx, dy) {
        const gesture = state.gesture;
        const { dir, orig, snaps } = gesture;
        const right = orig.x + orig.w, bottom = orig.y + orig.h;
        const targets = prefs.snap && !event.altKey ? snapTargets(gesture.ids) : null;
        const guides = { xs: [], ys: [] };
        const edge = (value, list, key) => { if (!targets) return value; const s = snapAxis([value], targets[list]); guides[key] = s.lines; return value + s.delta; };
        let w = orig.w, h = orig.h;
        if (dir.includes('w')) w = right - edge(orig.x + dx, 'xs', 'xs');
        if (dir.includes('e')) w = edge(right + dx, 'xs', 'xs') - orig.x;
        if (dir.includes('n')) h = bottom - edge(orig.y + dy, 'ys', 'ys');
        if (dir.includes('s')) h = edge(bottom + dy, 'ys', 'ys') - orig.y;
        let sx = Math.max(0.01, w / orig.w), sy = Math.max(0.01, h / orig.h);
        if (dir.length === 2 && !event.shiftKey) sx = sy = Math.max(sx, sy);
        if (dir === 'n' || dir === 's') sx = 1;
        if (dir === 'e' || dir === 'w') sy = 1;
        const anchor = { x: dir.includes('w') ? right : orig.x, y: dir.includes('n') ? bottom : orig.y };
        const used = applyScale(snaps, anchor, sx, sy);
        showGuides(guides.xs, guides.ys);
        renderCanvas(new Set(gesture.ids));
        renderSelectionUI(`${Math.round(used.sx * 100)}% × ${Math.round(used.sy * 100)}%`.replace(/^(\d+)% × \1%$/, '$1%'));
        if (onSyncGeometry) onSyncGeometry();
        if (onUpdateStatusBar) onUpdateStatusBar();
    }

    function resizeGesture(event, dx, dy) {
        const gesture = state.gesture;
        if (gesture.multi) return multiResizeGesture(event, dx, dy);
        const { dir, orig, el } = gesture;
        const right = orig.x + orig.w, bottom = orig.y + orig.h;
        const targets = prefs.snap && !event.altKey ? snapTargets(new Set([el.id])) : null;
        const guides = { xs: [], ys: [] };
        const edge = (value, list, key) => { if (!targets) return value; const s = snapAxis([value], targets[list]); guides[key] = s.lines; return value + s.delta; };
        let x = orig.x, y = orig.y, w = orig.w, h = orig.h;
        if (dir.includes('w')) { x = edge(orig.x + dx, 'xs', 'xs'); w = right - x; }
        if (dir.includes('e')) { w = edge(right + dx, 'xs', 'xs') - orig.x; }
        if (dir.includes('n')) { y = edge(orig.y + dy, 'ys', 'ys'); h = bottom - y; }
        if (dir.includes('s')) { h = edge(bottom + dy, 'ys', 'ys') - orig.y; }
        if ((event.shiftKey || el.aspectLock) && dir.length === 2) {
            const scale = Math.max(w / orig.w, h / orig.h);
            w = orig.w * scale; h = orig.h * scale;
            if (dir.includes('w')) x = right - w;
            if (dir.includes('n')) y = bottom - h;
        }
        if (w < MIN_SIZE) { w = MIN_SIZE; if (dir.includes('w')) x = right - MIN_SIZE; }
        if (h < MIN_SIZE) { h = MIN_SIZE; if (dir.includes('n')) y = bottom - MIN_SIZE; }
        w = Math.min(w, LIMITS.elementW[1]); h = Math.min(h, LIMITS.elementH[1]);
        el.x = Math.round(x); el.width = Math.round(w);
        if (!isLine(el)) { el.y = Math.round(y); el.height = Math.round(h); }
        showGuides(guides.xs, guides.ys);
        renderCanvas(new Set([el.id]));
        renderSelectionUI(`${el.width} × ${Math.round(boxOf(el).h)}`);
        if (onSyncGeometry) onSyncGeometry();
        if (onUpdateStatusBar) onUpdateStatusBar();
    }

    function marqueeGesture(event) {
        const gesture = state.gesture;
        const current = toLogical(event.clientX, event.clientY), o = gesture.origin;
        const rect = { x: Math.min(o.x, current.x), y: Math.min(o.y, current.y), w: Math.abs(current.x - o.x), h: Math.abs(current.y - o.y) };
        const box = $('marquee'), stageRect = stage.getBoundingClientRect();
        if (box) {
            Object.assign(box.style, {
                display: 'block',
                left: `${Math.min(gesture.startX, event.clientX) - stageRect.left}px`,
                top: `${Math.min(gesture.startY, event.clientY) - stageRect.top}px`,
                width: `${Math.abs(event.clientX - gesture.startX)}px`,
                height: `${Math.abs(event.clientY - gesture.startY)}px`
            });
        }
        const hit = visibleElements().filter(el => {
            if (el.visible === false) return false;
            const b = visualBoxOf(el);
            return b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y;
        }).map(el => el.id);
        setSelection([...withGroups([...gesture.base, ...hit])], { light: true });
    }

    function endGesture(event) {
        if (!state.gesture) return;
        const done = state.gesture;
        state.gesture = null;
        stage.classList.remove('panning');
        const marqueeBox = $('marquee');
        if (marqueeBox) marqueeBox.style.display = 'none';
        try { stage.releasePointerCapture(event.pointerId); } catch {}
        showGuides();
        if (done.type === 'move' && !done.moved && done.deferCollapse) setSelection([done.id]);
        if (done.type === 'marquee' && onRenderProperties) onRenderProperties();
        if ((done.type === 'move' || done.type === 'resize') && done.moved) {
            if (state.overlay.elements.some(e => e.type === 'cutout')) updateEditorCutoutMask();
            renderSelectionUI();
            changed(true);
            if (onRenderProperties) onRenderProperties();
        } else if (done.type === 'move' || done.type === 'resize') {
            renderSelectionUI();
        }
    }

    stage.addEventListener('pointerdown', event => {
        stage.focus({ preventScroll: true });
        if (event.button === 1 || (event.button === 0 && state.spaceDown)) {
            event.preventDefault();
            state.gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, pan: { ...state.pan } };
            stage.classList.add('panning');
            stage.setPointerCapture(event.pointerId);
            return;
        }
        if (event.button !== 0) return;
        const handle = event.target.closest('.handle');
        const node = event.target.closest('.canvas-element');
        if (handle && state.selectedIds.size > 1) {
            const items = selectedElements(), snaps = scaleSnapshot(items);
            if (!snaps.length) return;
            state.gesture = { type: 'resize', multi: true, dir: handle.dataset.dir, startX: event.clientX, startY: event.clientY, snaps, ids: new Set(items.map(el => el.id)), orig: boundsOf(items), moved: false };
        } else if (handle) {
            const el = primary();
            if (!el) return;
            state.gesture = { type: 'resize', dir: handle.dataset.dir, startX: event.clientX, startY: event.clientY, el, orig: { ...boxOf(el), height: el.height }, moved: false };
        } else if (node) {
            const id = node.dataset.id, el = byId(id);
            let deferCollapse = false;
            if (isAdditive(event)) {
                const next = new Set(state.selectedIds), members = [...withGroups([id])];
                if (next.has(id)) { members.forEach(m => next.delete(m)); setSelection(next); return; }
                members.forEach(m => next.add(m)); setSelection(next);
            } else if (!state.selectedIds.has(id)) {
                setSelection(withGroups([id]));
            } else if (state.selectedIds.size > 1) {
                deferCollapse = true;
            }
            const movable = selectedElements().filter(item => !item.locked && item.visible !== false);
            state.gesture = {
                type: 'move', startX: event.clientX, startY: event.clientY, id,
                deferCollapse, moved: false,
                items: movable.map(item => ({ el: item, x: item.x, y: item.y })),
                bounds: movable.length ? boundsOf(movable) : null,
                locked: !movable.length
            };
            if (el?.locked && state.selectedIds.size === 1) state.gesture.locked = true;
        } else {
            const base = isAdditive(event) ? new Set(state.selectedIds) : new Set();
            if (!isAdditive(event)) setSelection([]);
            state.gesture = { type: 'marquee', startX: event.clientX, startY: event.clientY, origin: toLogical(event.clientX, event.clientY), base, moved: false };
        }
        stage.setPointerCapture(event.pointerId);
    });

    stage.addEventListener('pointermove', event => {
        if (!state.gesture) return;
        const rawDx = event.clientX - state.gesture.startX, rawDy = event.clientY - state.gesture.startY;
        if (state.gesture.type === 'pan') {
            state.pan.x = state.gesture.pan.x + rawDx;
            state.pan.y = state.gesture.pan.y + rawDy;
            state.autoFit = false;
            applyView();
            return;
        }
        if (!state.gesture.moved && Math.hypot(rawDx, rawDy) < 3) return;
        state.gesture.moved = true;
        if (state.gesture.type === 'move') moveGesture(event, rawDx / state.zoom, rawDy / state.zoom);
        else if (state.gesture.type === 'resize') resizeGesture(event, rawDx / state.zoom, rawDy / state.zoom);
        else if (state.gesture.type === 'marquee') marqueeGesture(event);
    });

    stage.addEventListener('pointerup', endGesture);
    stage.addEventListener('pointercancel', endGesture);

    stage.addEventListener('dblclick', event => {
        const node = event.target.closest('.canvas-element');
        if (!node) return;
        const field = $('prop-content');
        if (field) { field.focus(); field.select(); }
    });

    stage.addEventListener('wheel', event => {
        if (onHideContextMenu) onHideContextMenu();
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
            zoomAt(state.zoom * Math.exp(-clamp(event.deltaY, -60, 60) * 0.01), event.clientX, event.clientY);
        } else {
            state.pan.x -= event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
            state.pan.y -= event.shiftKey && !event.deltaX ? 0 : event.deltaY;
            state.autoFit = false;
            applyView();
        }
    }, { passive: false });

    new ResizeObserver(() => {
        if (state.autoFit) fitView(true);
        else applyView();
    }).observe(stage);
}
