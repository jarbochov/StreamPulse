/**
 * Shared "Contain + Blurred Backdrop Fill" (ambilight pillarbox/letterbox fill) helper.
 * Renders an edge-filling blurred copy behind the crisp uncropped media while
 * keeping the primary <img> / <video> as a direct child of the element container.
 */

export function normalizeBlurFill(raw) {
    const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const num = (v, fb, min, max) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;
    };
    return {
        blur: num(b.blur, 24, 0, 80),
        dim: num(b.dim, 30, 0, 85),
        zoom: num(b.zoom, 112, 100, 200),
        shadow: num(b.shadow, 45, 0, 100)
    };
}

export function blurFillShadowCss(bf) {
    const sh = Number(bf?.shadow);
    if (!Number.isFinite(sh) || sh <= 0) return '';
    const blur = Math.max(2, Math.round(sh * 0.45));
    const alpha = Math.min(0.85, 0.25 + (sh / 100) * 0.5).toFixed(2);
    return `drop-shadow(0 6px ${blur}px rgba(0,0,0,${alpha}))`;
}

function detachVideoSync(container) {
    if (container?._blurFillCleanup) {
        try { container._blurFillCleanup(); } catch {}
        container._blurFillCleanup = null;
    }
}

function unloadVideo(v) {
    if (!v || v.tagName !== 'VIDEO') return;
    try {
        v.pause();
        v.removeAttribute('src');
        v.load();
    } catch {}
}

export function syncBlurFillMedia(container, opts = {}) {
    const {
        media,
        kind = media?.tagName === 'VIDEO' ? 'video' : 'img',
        src = '',
        fit = 'cover',
        focusX = 50,
        focusY = 50,
        blurFill = null,
        crossOrigin = '',
        skipShadowOnMedia = false
    } = opts;
    if (!container || !media) return;

    const fx = Number.isFinite(Number(focusX)) ? Number(focusX) : 50;
    const fy = Number.isFinite(Number(focusY)) ? Number(focusY) : 50;

    if (fit !== 'contain-blur') {
        detachVideoSync(container);
        container._blurFillShadowFilter = '';
        const oldBackdrop = container.querySelector(':scope > .sp-blurfill-backdrop');
        if (oldBackdrop) {
            oldBackdrop.querySelectorAll('video').forEach(unloadVideo);
            oldBackdrop.remove();
        }
        media.style.position = '';
        media.style.zIndex = '';
        media.style.objectFit = fit === 'contain' ? 'contain' : 'cover';
        media.style.objectPosition = fit === 'contain' ? '50% 50%' : `${fx}% ${fy}%`;
        if (!skipShadowOnMedia && !media.dataset.filterControlled) {
            media.style.filter = '';
        }
        return;
    }

    const bf = normalizeBlurFill(blurFill);
    const desiredTag = kind === 'video' ? 'VIDEO' : 'IMG';
    let backdrop = container.querySelector(':scope > .sp-blurfill-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sp-blurfill-backdrop';
        container.insertBefore(backdrop, media);
    } else if (backdrop.nextElementSibling !== media && media.parentNode === container) {
        container.insertBefore(backdrop, media);
    }
    backdrop.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;border-radius:inherit;';

    let bgMedia = backdrop.querySelector(':scope > .sp-blurfill-bg');
    if (bgMedia && bgMedia.tagName !== desiredTag) {
        unloadVideo(bgMedia);
        bgMedia.remove();
        bgMedia = null;
        detachVideoSync(container);
    }
    if (!bgMedia) {
        bgMedia = document.createElement(desiredTag.toLowerCase());
        bgMedia.className = 'sp-blurfill-bg';
        if (desiredTag === 'IMG') {
            bgMedia.decoding = 'async';
            bgMedia.draggable = false;
            bgMedia.alt = '';
        } else {
            bgMedia.muted = true;
            bgMedia.playsInline = true;
            bgMedia.draggable = false;
        }
        backdrop.insertBefore(bgMedia, backdrop.firstChild);
    }

    let dimEl = backdrop.querySelector(':scope > .sp-blurfill-dim');
    if (!dimEl) {
        dimEl = document.createElement('div');
        dimEl.className = 'sp-blurfill-dim';
        backdrop.appendChild(dimEl);
    }

    if (crossOrigin) bgMedia.crossOrigin = crossOrigin;
    else bgMedia.removeAttribute('crossorigin');

    const resolvedSrc = src || media.getAttribute('src') || '';
    if (resolvedSrc && bgMedia.getAttribute('src') !== resolvedSrc) {
        bgMedia.src = resolvedSrc;
    }

    bgMedia.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${fx}% ${fy}%;transform:scale(${(bf.zoom / 100).toFixed(3)});filter:${bf.blur > 0 ? `blur(${bf.blur}px)` : 'none'};display:block;pointer-events:none;`;
    dimEl.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,${(bf.dim / 100).toFixed(3)});pointer-events:none;`;

    media.style.position = 'relative';
    media.style.zIndex = '1';
    media.style.objectFit = 'contain';
    media.style.objectPosition = '50% 50%';
    const shadowFilter = blurFillShadowCss(bf);
    container._blurFillShadowFilter = shadowFilter;
    if (!skipShadowOnMedia) {
        media.style.filter = shadowFilter;
    }

    if (desiredTag === 'VIDEO') {
        bgMedia.muted = true;
        bgMedia.playsInline = true;
        bgMedia.loop = media.loop;
        bgMedia.autoplay = media.autoplay;
        if (media.preload) bgMedia.preload = media.preload;
        if (container._blurFillSyncFg !== media || container._blurFillSyncBg !== bgMedia) {
            detachVideoSync(container);
            const syncTime = () => {
                if (!bgMedia.isConnected || !media.isConnected) return;
                try {
                    if (Math.abs((bgMedia.currentTime || 0) - (media.currentTime || 0)) > 0.15) {
                        bgMedia.currentTime = media.currentTime;
                    }
                    bgMedia.playbackRate = media.playbackRate || 1;
                } catch {}
            };
            const onPlay = () => {
                syncTime();
                bgMedia.play().catch(() => {});
            };
            const onPause = () => {
                try { bgMedia.pause(); } catch {}
                syncTime();
            };
            const onSeeked = () => syncTime();
            const onRate = () => {
                try { bgMedia.playbackRate = media.playbackRate || 1; } catch {}
            };
            const onMeta = () => {
                syncTime();
                if (!media.paused) bgMedia.play().catch(() => {});
            };
            media.addEventListener('play', onPlay);
            media.addEventListener('pause', onPause);
            media.addEventListener('seeked', onSeeked);
            media.addEventListener('ratechange', onRate);
            bgMedia.addEventListener('loadedmetadata', onMeta);
            container._blurFillSyncFg = media;
            container._blurFillSyncBg = bgMedia;
            container._blurFillCleanup = () => {
                media.removeEventListener('play', onPlay);
                media.removeEventListener('pause', onPause);
                media.removeEventListener('seeked', onSeeked);
                media.removeEventListener('ratechange', onRate);
                bgMedia.removeEventListener('loadedmetadata', onMeta);
                container._blurFillSyncFg = null;
                container._blurFillSyncBg = null;
            };
            if (!media.paused) bgMedia.play().catch(() => {});
        }
    } else {
        detachVideoSync(container);
    }
}
