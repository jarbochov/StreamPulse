(function() {
    const params = new URLSearchParams(location.search);
    const overlayId = params.get('id');
    const root = document.getElementById('overlay-root');
    if (!overlayId || !root) return;
    let liveStatus = {};
    const randomTimers = new Map();
    const randomIndexes = new Map();
    let currentOverlay = null;
    // Multipage overlays: one shared live page, unless the URL pins a page with ?page= (id, name or 1-based number).
    const pageParam = (params.get('page') || '').trim().toLowerCase();
    let currentPage = '';
    function pagesOn(overlay) { return !!overlay?.pages?.enabled; }
    function resolvePage(overlay, key) {
        const items = overlay?.pages?.items || [];
        const k = String(key || '').trim().toLowerCase();
        const hit = items.find(item => item.id === k || item.name.toLowerCase() === k) || (/^\d+$/.test(k) ? items[Number(k) - 1] : null);
        return hit ? hit.id : '';
    }
    function pageElements(overlay) {
        return (overlay.elements || []).filter(item => item.visible !== false
            && (!pagesOn(overlay) || item.page === '*' || item.page === currentPage));
    }
    const shared = window.OverlayShared;
    const loadGoogleFont = shared.loadGoogleFont;

    // Slideshows survive live-data re-renders (a new song would otherwise restart them): the node is reused while its settings are unchanged.
    const slideshows = new Map();
    let slideshowsKept = new Set();
    const cutoutStates = new Map();
    function stopSlideshows(ids) {
        for (const [id, entry] of [...slideshows]) if (!ids || ids.has(id)) { entry.handle.stop(); slideshows.delete(id); }
    }

    function stopRandomTimers() {
        for (const timer of randomTimers.values()) clearInterval(timer);
        randomTimers.clear();
    }

    function setRandomText(node, element) {
        const pool = shared.elementItems(element);
        const items = pool.length ? pool : [element.content || ''];
        const config = element.random || {};
        let index = randomIndexes.get(element.id) || 0;
        const value = expandVariables(config.mode === 'order' ? items[index % items.length] : items[Math.floor(Math.random() * items.length)]);
        randomIndexes.set(element.id, config.mode === 'order' ? index + 1 : index);
        if (config.typewriter) {
            node.classList.add('overlay-typewriter');
            const typed = document.createElement('span');
            typed.className = 'overlay-caret';
            node.replaceChildren(typed);
            let position = 0;
            const speed = Math.max(10, Number(config.typewriterSpeed) || 110);
            if (node._typeTimer) clearInterval(node._typeTimer);
            node._typeTimer = setInterval(() => {
                typed.textContent = value.slice(0, ++position);
                if (position >= value.length) {
                    clearInterval(node._typeTimer);
                    node._typeTimer = null;
                }
            }, speed);
        } else {
            if (node._typeTimer) { clearInterval(node._typeTimer); node._typeTimer = null; }
            node.classList.remove('overlay-typewriter');
            node.textContent = value;
        }
        if (config.marquee) {
            node.classList.add('overlay-marquee');
            node.style.setProperty('--marquee-duration', `${Math.max(10, Number(config.marqueeSpeed) || 60)}s`);
            shared.wrapMarquee(node);
        } else {
            node.classList.remove('overlay-marquee');
        }
    }

    function variableContext() {
        return { overlayName: liveStatus.overlayName };
    }

    function expandVariables(value) {
        return shared.expandVariables(value, liveStatus, variableContext());
    }

    function renderMarkdown(source, element) {
        return shared.renderMarkdown(expandVariables(source), element);
    }

    function applyElementStyle(node, element) {
        const style = element.style || {};
        loadGoogleFont(style.fontFamily);
        Object.assign(node.style, {
            left: `${element.x || 0}px`,
            top: `${element.y || 0}px`,
            width: `${element.width || 400}px`,
            height: `${element.height || 100}px`,
            zIndex: element.zIndex || 0,
            opacity: style.opacity ?? 1,
            background: style.background || 'transparent',
            borderRadius: `${style.borderRadius || 0}px`,
            padding: `${style.padding || 0}px`,
            fontFamily: style.fontFamily || 'sans-serif',
            fontSize: `${style.fontSize || 32}px`,
            fontWeight: style.fontWeight || '400',
            color: style.color || '#fff',
            textAlign: style.textAlign || 'left',
            lineHeight: style.lineHeight || 1.2,
            letterSpacing: `${style.letterSpacing || 0}px`,
            display: style.verticalAlign === 'top' ? 'block' : 'flex',
            alignItems: style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
            justifyContent: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' ? 'flex-end' : 'flex-start'
        });
        Object.assign(node.style, shared.decorationStyle(style, element.type));
        Object.assign(node.style, shared.textEffectStyle(style, element.type));
        Object.assign(node.style, shared.shadowClipStyle(element));
        if (element.type === 'shape' || element.type === 'cutout') {
            const sh = element.type === 'cutout' ? (element.cutout?.shape || 'rectangle') : style.shape;
            if (sh === 'circle') node.style.borderRadius = '50%';
            if (sh === 'pill') node.style.borderRadius = '999px';
            if (sh === 'line' && element.type === 'shape') { node.style.height = `${Math.max(1, style.borderWidth || 4)}px`; node.style.border = '0'; }
        }
        shared.applyBorderEffects(node, style, element);
        if (element.type === 'game-list' || element.type === 'slideshow' || element.type === 'pattern') node.style.display = 'block';
        if (element.type === 'pattern') {
            const blend = element.pattern?.blendMode || 'normal';
            const hasFill = shared.hasBoxFill ? shared.hasBoxFill(style) : false;
            node.style.mixBlendMode = (!hasFill && blend !== 'normal') ? blend : '';
            const wrap = node.querySelector(':scope > .sp-pattern-wrap');
            if (wrap) wrap.style.mixBlendMode = (hasFill && blend !== 'normal') ? blend : '';
        } else {
            node.style.mixBlendMode = '';
        }
        if (element.type === 'markdown') {
            node.style.setProperty('--hs', (element.headingScale ?? 100) / 100);
            node.classList.toggle('md-right', style.textAlign === 'right');
            const cols = element.columns > 1 ? Number(element.columns) : 0;
            node.classList.toggle('md-cols', !!cols);
            node.dataset.span = element.headingSpan ?? 6;
            if (cols) node.style.display = 'block';
        }
        node.style.transform = style.rotate ? `rotate(${style.rotate}deg)` : '';
    }

    const tickingNodes = [];
    const alertNodes = [];
    const activeAlerts = [];
    let alertPreviewManual = null;

    function isAlertPreview(element) {
        if (alertPreviewManual !== null) return alertPreviewManual;
        return (params.get('preview') === 'true' && (params.get('alert') === 'true' || element.alert?.showOnPreview === true));
    }

    function showAlert(payload) {
        for (const { node, element } of alertNodes) {
            const only = element.alert?.triggers || [];
            if (only.length && !only.includes(payload.trigger)) continue;
            if (node._alertPreviewHandle) {
                node._alertPreviewHandle.stop();
                node._alertPreviewHandle = null;
            }
            activeAlerts.push(shared.playAlert(node, element, payload, {
                onEnd: () => {
                    if (isAlertPreview(element) && !node._alertPreviewHandle) {
                        node._alertPreviewHandle = shared.playAlert(node, element, { ...shared.alertSample(element), animIn: 'none', animOut: 'none', durationMs: 3600000 }, { sound: false });
                    }
                }
            }));
        }
    }

    function stopAlerts() {
        activeAlerts.splice(0).forEach(handle => handle.stop());
        for (const { node } of alertNodes) {
            if (node._alertPreviewHandle) {
                node._alertPreviewHandle.stop();
                node._alertPreviewHandle = null;
            }
        }
    }

    function setNodeText(node, text) {
        if (!node.firstElementChild) {
            if (node.textContent !== text) node.textContent = text;
            return;
        }
        let tn = node._textNode;
        if (!tn || tn.parentNode !== node) {
            tn = [...node.childNodes].find(c => c.nodeType === 3);
            if (!tn) {
                tn = document.createTextNode('');
                node.insertBefore(tn, node.firstChild);
            }
            node._textNode = tn;
        }
        if (tn.nodeValue !== text) tn.nodeValue = text;
    }

    function tickPlaceholders() {
        for (const { node, element } of tickingNodes) {
            if (element.type === 'progress') shared.renderProgress(node, element, expandVariables);
            else if (element.type === 'markdown') {
                const nextHtml = renderMarkdown(shared.elementContent(element), element);
                if (node._mdHtml !== nextHtml) {
                    node._mdHtml = nextHtml;
                    node.innerHTML = nextHtml;
                    shared.applyMediaFilter(node, element);
                }
            }
            else setNodeText(node, expandVariables(shared.elementContent(element) || ''));
            if (element.textFit && element.textFit !== 'none') shared.fitText(node, element);
        }
    }

    const fitNodes = [];
    function refit() {
        for (const { node, element } of fitNodes) {
            const probe = element.type === 'random-text' ? shared.elementItems(element).map(expandVariables).reduce((a, b) => (b.length > a.length ? b : a), '') : null;
            shared.fitText(node, element, probe);
        }
    }
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => refit());

    // A re-render mid-transition replaces every node and makes the animation jump, so it waits until the switch finishes.
    let transitioning = false, pendingRender = null;
    // Embedded widgets (music, goals, timers) keep their iframe across re-renders so they do not reload and flash.
    const embeds = new Map();
    let embedsKept = new Set();

    function playVideoElement(video) {
        if (!video || video.tagName !== 'VIDEO') return;
        const hasSound = video.dataset.hasSound === 'true';
        const targetVol = Number(video.dataset.targetVolume);
        const volume = Number.isFinite(targetVol) ? targetVol : 1;
        if (hasSound) {
            video.muted = false;
            video.volume = volume;
            const promise = video.play();
            if (promise && promise.catch) {
                promise.catch(() => {
                    video.dataset.audioPending = 'true';
                    video.muted = true;
                    video.play().catch(() => {});
                    showAudioUnlockNotice();
                });
            }
        } else {
            video.muted = true;
            video.play().catch(() => {});
        }
    }

    let audioNoticeEl = null;
    function showAudioUnlockNotice() {
        if (audioNoticeEl || window.obsstudio || navigator.userAgent.includes('OBS/') || params.get('preview') !== 'true') return;
        audioNoticeEl = document.createElement('div');
        audioNoticeEl.id = 'audio-unlock-notice';
        audioNoticeEl.setAttribute('role', 'button');
        audioNoticeEl.setAttribute('aria-label', 'Click anywhere to enable audio');
        audioNoticeEl.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:99999;background:rgba(18,20,32,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,255,255,0.18);border-radius:24px;padding:8px 14px;font:600 12px/1 sans-serif;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.45);transition:opacity 0.2s;pointer-events:auto;user-select:none;';
        audioNoticeEl.innerHTML = '<svg style="width:14px;height:14px;flex:none;fill:currentColor" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Click to enable audio</span>';
        document.body.appendChild(audioNoticeEl);
    }

    function removeAudioUnlockNotice() {
        if (audioNoticeEl) {
            audioNoticeEl.remove();
            audioNoticeEl = null;
        }
    }

    function unlockMediaAudio() {
        removeAudioUnlockNotice();
        document.querySelectorAll('video[data-has-sound="true"]').forEach(video => {
            const targetVol = Number(video.dataset.targetVolume);
            const volume = Number.isFinite(targetVol) ? targetVol : 1;
            video.muted = false;
            video.volume = volume;
            delete video.dataset.audioPending;
            if (video.paused) video.play().catch(() => {});
        });
        document.querySelectorAll('iframe[data-audio-pending="true"]').forEach(frame => {
            delete frame.dataset.audioPending;
            try {
                const vol = Number(frame.dataset.targetVolume) || 100;
                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [vol] }), '*');
            } catch {}
        });
    }
    ['click', 'touchstart', 'keydown'].forEach(evt => {
        window.addEventListener(evt, unlockMediaAudio, { passive: true, capture: true });
    });

    function ensureLayers() {
        let masked = document.getElementById('overlay-masked-layer');
        let top = document.getElementById('overlay-top-layer');
        if (!masked) {
            masked = document.createElement('div');
            masked.id = 'overlay-masked-layer';
            masked.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
            root.appendChild(masked);
        }
        if (!top) {
            top = document.createElement('div');
            top.id = 'overlay-top-layer';
            top.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
            root.appendChild(top);
        }
        return { masked, top };
    }

    function updateCutoutMask() {
        if (!currentOverlay) return;
        const canW = Number(currentOverlay.canvas?.width) || 1920;
        const canH = Number(currentOverlay.canvas?.height) || 1080;
        const cutouts = pageElements(currentOverlay).filter(el => el.type === 'cutout' && (cutoutStates.has(el.id) ? cutoutStates.get(el.id) : el.visible !== false));
        const { masked } = ensureLayers();
        const svg = document.getElementById('overlay-cutout-svg');
        if (svg) svg.remove();
        if (!cutouts.length) {
            masked._lastMaskUrl = '';
            masked.style.removeProperty('-webkit-mask-image');
            masked.style.removeProperty('-webkit-mask-size');
            masked.style.removeProperty('-webkit-mask-repeat');
            masked.style.removeProperty('-webkit-mask-position');
            masked.style.removeProperty('-webkit-mask');
            masked.style.removeProperty('mask-image');
            masked.style.removeProperty('mask-size');
            masked.style.removeProperty('mask-repeat');
            masked.style.removeProperty('mask-position');
            masked.style.removeProperty('mask');
            return;
        }
        const filters = [];
        const shapes = cutouts.map(el => {
            const shape = el.cutout?.shape || 'rectangle';
            const feather = Math.max(0, Math.min(100, Number(el.cutout?.feather) || 0));
            let filterAttr = '';
            if (feather > 0) {
                const filterId = `cutout-feather-${el.id}`;
                filters.push(`<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${feather / 2}"/></filter>`);
                filterAttr = `filter="url(#${filterId})"`;
            }
            const x = Number(el.x) || 0;
            const y = Number(el.y) || 0;
            const w = Number(el.width) || 0;
            const h = Number(el.height) || 0;
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
        if (masked._lastMaskUrl === maskDataUrl) return;
        masked._lastMaskUrl = maskDataUrl;
        masked.style.setProperty('-webkit-mask-image', maskDataUrl);
        masked.style.setProperty('-webkit-mask-size', '100% 100%');
        masked.style.setProperty('-webkit-mask-repeat', 'no-repeat');
        masked.style.setProperty('-webkit-mask-position', '0 0');
        masked.style.setProperty('mask-image', maskDataUrl);
        masked.style.setProperty('mask-size', '100% 100%');
        masked.style.setProperty('mask-repeat', 'no-repeat');
        masked.style.setProperty('mask-position', '0 0');
    }

    function render(overlay) {
        if (transitioning) { pendingRender = overlay; return; }
        fitNodes.length = 0;
        currentOverlay = overlay;
        stopRandomTimers();
        slideshowsKept = new Set();
        embedsKept = new Set();
        stopAlerts();
        tickingNodes.length = 0;
        alertNodes.length = 0;
        document.title = `StreamPulse — ${overlay.name}`;
        root.style.width = `${overlay.canvas.width}px`;
        root.style.height = `${overlay.canvas.height}px`;
        root.style.background = 'transparent';
        if (pagesOn(overlay) && !(overlay.pages.items || []).some(item => item.id === currentPage && item.enabled !== false)) currentPage = (overlay.pages.items.find(item => item.enabled !== false) || overlay.pages.items[0]).id;

        const activeCutouts = pageElements(overlay).filter(el => el.type === 'cutout' && (cutoutStates.has(el.id) ? cutoutStates.get(el.id) : el.visible !== false));
        const maxCutoutZ = activeCutouts.length ? Math.max(...activeCutouts.map(c => Number(c.zIndex) || 0)) : -Infinity;

        const built = pageElements(overlay).map(buildNode);
        built.forEach(node => {
            node._layer = (node._isTopLayer || Number(node.style.zIndex || 0) > maxCutoutZ) ? 'top' : 'masked';
        });

        // Embeds on trigger pages stay loaded (hidden) so they already listen when the page takes over.
        if (pagesOn(overlay)) {
            const trig = new Set(overlay.pages.items.filter(item => item.trigger).map(item => item.id));
            for (const element of overlay.elements || []) {
                if (element.type !== 'embed' || element.visible === false || !trig.has(element.page) || element.page === currentPage) continue;
                const node = buildNode(element);
                node._layer = (node._isTopLayer || Number(node.style.zIndex || 0) > maxCutoutZ) ? 'top' : 'masked';
                node.style.visibility = 'hidden'; node.style.pointerEvents = 'none';
                built.push(node);
            }
        }

        const { masked, top } = ensureLayers();
        masked.style.background = overlay.canvas.background || 'transparent';
        [...masked.children, ...top.children].forEach(child => {
            if (!built.includes(child)) {
                shared.cleanupNode(child);
                child.remove();
            }
        });
        built.forEach(node => {
            const parent = node._layer === 'top' ? top : masked;
            if (node.parentNode !== parent) parent.appendChild(node);
        });
        built.forEach(node => {
            const v = node.querySelector(':scope > video');
            if (v) playVideoElement(v);
        });
        stopSlideshows(new Set([...slideshows.keys()].filter(id => !slideshowsKept.has(id))));
        for (const id of [...embeds.keys()]) if (!embedsKept.has(id)) embeds.delete(id);
        updateCutoutMask();
        refit();
        checkViewportFit(overlay);
    }

    function buildNode(element) {
        if (element.type === 'slideshow' || element.type === 'pattern') {
            const sig = element.type === 'pattern' ? `${JSON.stringify(element)}|${expandVariables(element.src || '')}` : JSON.stringify(element);
            const existing = slideshows.get(element.id);
            if (existing && existing.sig === sig) { slideshowsKept.add(element.id); existing.node.dataset.pg = element.page || ''; return existing.node; }
        }
        const embedSig = element.type === 'embed' || element.type === 'video' ? `${JSON.stringify(element)}|${expandVariables(element.src || '')}` : '';
        if (embedSig) {
            const existing = embeds.get(element.id);
            if (existing && existing.sig === embedSig) {
                embedsKept.add(element.id);
                const v = existing.node.querySelector(':scope > video');
                if (v) {
                    const hasSound = Boolean(element.video?.sound === true || (element.video?.sound !== false && element.video?.muted === false));
                    const volume = Math.max(0, Math.min(1, (Number.isFinite(Number(element.video?.volume)) ? Number(element.video?.volume) : 100) / 100));
                    v.dataset.hasSound = hasSound ? 'true' : 'false';
                    v.dataset.targetVolume = String(volume);
                    if (hasSound && !v.dataset.audioPending) {
                        v.muted = false;
                        v.volume = volume;
                    }
                    if (v.paused && element.video?.autoplay !== false) v.play().catch(() => {});
                }
                return existing.node;
            }
        }
        {
            const node = document.createElement('div');
            node.dataset.pg = element.page || '';
            node.dataset.elementId = element.id || '';
            node.className = `overlay-element overlay-${element.type}`;
            applyElementStyle(node, element);
            if (element.type === 'video') {
                const yt = shared.parseYouTubeUrl(expandVariables(element.src || ''));
                if (yt) {
                    const frame = document.createElement('iframe');
                    const v = element.video || {};
                    const auto = v.autoplay !== false;
                    const hasSound = Boolean(v.sound === true || (v.sound !== false && v.muted === false));
                    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
                    frame.referrerPolicy = 'strict-origin-when-cross-origin';
                    frame.style.cssText = 'width:100%;height:100%;border:0;';
                    frame.src = shared.embedUrl(expandVariables(element.src || ''), { autoplay: auto, loop: v.loop !== false, sound: hasSound });
                    frame._ytPlaying = auto;
                    frame._ytMuted = !hasSound;
                    const volume = Math.max(0, Math.min(100, Number.isFinite(Number(v.volume)) ? Number(v.volume) : 100));
                    frame.dataset.hasSound = hasSound ? 'true' : 'false';
                    frame.dataset.targetVolume = String(volume);
                    const isObs = Boolean(window.obsstudio || (navigator.userAgent && navigator.userAgent.includes('OBS/')));
                    if (hasSound && !isObs) {
                        frame.dataset.audioPending = 'true';
                        showAudioUnlockNotice();
                    }
                    frame.addEventListener('load', () => {
                        try {
                            frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
                            if (hasSound && isObs) {
                                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
                                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }), '*');
                            } else {
                                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*');
                            }
                        } catch {}
                    });
                    node.appendChild(frame);
                } else {
                    const media = document.createElement('video');
                    media.src = expandVariables(element.src || '');
                    const v = element.video || {};
                    const auto = v.autoplay !== false;
                    const hasSound = Boolean(v.sound === true || (v.sound !== false && v.muted === false));
                    const volume = Math.max(0, Math.min(1, (Number.isFinite(Number(v.volume)) ? Number(v.volume) : 100) / 100));
                    media.autoplay = auto;
                    if (!auto) media.preload = 'auto';
                    media.loop = v.loop !== false;
                    media.playsInline = true;
                    media.dataset.hasSound = hasSound ? 'true' : 'false';
                    media.dataset.targetVolume = String(volume);
                    media.muted = !hasSound;
                    if (hasSound) media.volume = volume;
                    media.draggable = false;
                    media.style.width = '100%';
                    media.style.height = '100%';
                    media.style.objectFit = element.style?.objectFit || 'cover';
                    media.style.objectPosition = `${element.style?.focusX ?? 50}% ${element.style?.focusY ?? 50}%`;
                    node.appendChild(media);
                }
            } else if (element.type === 'image') {
                const media = document.createElement('img');
                media.src = expandVariables(element.src || '');
                media.draggable = false;
                media.style.width = '100%';
                media.style.height = '100%';
                media.style.objectFit = element.style?.objectFit || 'cover';
                media.style.objectPosition = `${element.style?.focusX ?? 50}% ${element.style?.focusY ?? 50}%`;
                node.appendChild(media);
            } else if (element.type === 'icon') {
                shared.renderIcon(node, element.content, element.style || {});
            } else if (element.type === 'qr') {
                const img = document.createElement('img');
                img.src = shared.qrUrl(expandVariables(element.src || ''), element.qr);
                img.draggable = false;
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
                node.appendChild(img);
            } else if (element.type === 'embed') {
                const frame = document.createElement('iframe');
                const rawUrl = expandVariables(element.src || '');
                const isYt = Boolean(shared.parseYouTubeUrl && shared.parseYouTubeUrl(rawUrl));
                const v = element.video || {};
                const auto = v.autoplay !== false;
                const hasSound = Boolean(v.sound === true || (v.sound !== false && v.muted === false));
                frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
                if (isYt) {
                    frame.referrerPolicy = 'strict-origin-when-cross-origin';
                    frame._ytPlaying = auto;
                    frame._ytMuted = !hasSound;
                    const volume = Math.max(0, Math.min(100, Number.isFinite(Number(v.volume)) ? Number(v.volume) : 100));
                    frame.dataset.hasSound = hasSound ? 'true' : 'false';
                    frame.dataset.targetVolume = String(volume);
                    const isObs = Boolean(window.obsstudio || (navigator.userAgent && navigator.userAgent.includes('OBS/')));
                    if (hasSound && !isObs) {
                        frame.dataset.audioPending = 'true';
                        showAudioUnlockNotice();
                    }
                    frame.addEventListener('load', () => {
                        try {
                            frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
                            if (hasSound && isObs) {
                                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
                                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }), '*');
                            } else {
                                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*');
                            }
                        } catch {}
                    });
                } else {
                    let sameOrigin = false;
                    try { sameOrigin = new URL(rawUrl, location.href).origin === location.origin; } catch { /* invalid URL stays sandboxed */ }
                    frame.sandbox = 'allow-forms allow-popups allow-scripts allow-presentation' + (sameOrigin ? ' allow-same-origin' : '');
                    frame.referrerPolicy = 'no-referrer';
                }
                frame.style.cssText = 'width:100%;height:100%;border:0;';
                frame.src = shared.embedUrl(rawUrl, isYt ? { autoplay: auto, loop: v.loop !== false, sound: hasSound } : {}) || 'about:blank';
                node.appendChild(frame);
            } else if (element.type === 'markdown') {
                node.innerHTML = renderMarkdown(shared.elementContent(element), element);
            } else if (element.type === 'random-text') {
                setRandomText(node, element);
                const interval = Math.max(1, Number(element.random?.intervalSeconds) || 5) * 1000;
                randomTimers.set(element.id, setInterval(() => setRandomText(node, element), interval));
            } else if (element.type === 'slideshow') {
                slideshows.get(element.id)?.handle.stop();
                slideshows.set(element.id, { sig: JSON.stringify(element), node, handle: shared.mountSlideshow(node, element, { onState: state => reportSlideshow(element.id, state) }) });
                slideshowsKept.add(element.id);
            } else if (element.type === 'pattern') {
                slideshows.get(element.id)?.handle.stop();
                const sig = `${JSON.stringify(element)}|${expandVariables(element.src || '')}`;
                slideshows.set(element.id, { sig, node, handle: shared.mountPattern(node, element, { preview: params.get('preview') === 'true', expand: expandVariables }) });
                slideshowsKept.add(element.id);
            } else if (element.type === 'game-list') {
                shared.renderGameList(node, element, liveStatus.gamePlan);
            } else if (element.type === 'progress') {
                shared.renderProgress(node, element, expandVariables);
            } else if (element.type === 'alert') {
                shared.prepareAlertNode(node, element);
                alertNodes.push({ node, element });
                if (isAlertPreview(element)) {
                    node._alertPreviewHandle = shared.playAlert(node, element, { ...shared.alertSample(element), animIn: 'none', animOut: 'none', durationMs: 3600000 }, { sound: false });
                }
            } else if (element.type === 'shape') {
                node.setAttribute('aria-hidden', 'true');
            } else if (element.type === 'cutout') {
                node.setAttribute('aria-hidden', 'true');
                node.style.pointerEvents = 'none';
                node.style.background = 'transparent';
                shared.applyBorderEffects(node, element.style || {}, element);
                node._isTopLayer = true;
            } else {
                setNodeText(node, expandVariables(shared.elementContent(element) || ''));
            }
            const tickSource = element.type === 'progress' ? `${element.content} ${element.progress?.label}` : shared.elementContent(element);
            if (['text', 'markdown', 'progress'].includes(element.type) && shared.hasTicking(tickSource)) tickingNodes.push({ node, element });
            if (element.textFit && element.textFit !== 'none') fitNodes.push({ node, element });
            if (embedSig) { embeds.set(element.id, { sig: embedSig, node }); embedsKept.add(element.id); }
            shared.applyMediaFilter(node, element);
            return node;
        }
    }

    // Swaps only the page's own elements, so shared elements keep running through the transition.
    let pageSwitchTimer = null;
    function switchPage(nextId) {
        if (!currentOverlay || !pagesOn(currentOverlay) || nextId === currentPage || !nextId) return;
        const pages = currentOverlay.pages;
        const previous = currentPage;
        currentPage = nextId;
        const { masked, top } = ensureLayers();
        const activeCutouts = pageElements(currentOverlay).filter(el => el.type === 'cutout' && (cutoutStates.has(el.id) ? cutoutStates.get(el.id) : el.visible !== false));
        const maxCutoutZ = activeCutouts.length ? Math.max(...activeCutouts.map(c => Number(c.zIndex) || 0)) : -Infinity;

        const allNodes = [...masked.children, ...top.children];
        const outgoing = allNodes.filter(node => node.dataset.pg && node.dataset.pg !== '*' && node.dataset.pg === previous);
        const gone = new Set(outgoing);
        const prune = list => {
            for (let i = list.length - 1; i >= 0; i--) {
                if (gone.has(list[i].node)) {
                    if (list[i].node._alertPreviewHandle) {
                        list[i].node._alertPreviewHandle.stop();
                        list[i].node._alertPreviewHandle = null;
                    }
                    list.splice(i, 1);
                }
            }
        };
        [fitNodes, tickingNodes, alertNodes].forEach(prune);
        const prevTrigger = !!currentOverlay.pages.items.find(item => item.id === previous)?.trigger;
        for (const element of currentOverlay.elements || []) if (element.page === previous && element.page !== '*' && !(prevTrigger && element.type === 'embed')) embeds.delete(element.id);
        stopSlideshows(new Set((currentOverlay.elements || []).filter(element => element.page === previous && element.page !== '*').map(element => element.id)));
        for (const element of currentOverlay.elements || []) {
            if (element.page !== previous || element.page === '*') continue;
            clearInterval(randomTimers.get(element.id));
            randomTimers.delete(element.id);
        }
        const ms = pages.transition === 'none' ? 0 : pages.transitionMs;
        const kind = pages.transition;
        // "left" means the content moves left: the new page enters from the right.
        const sign = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] }[pages.transitionDirection] || [1, 0];
        const distance = pages.transitionDistance || 120;
        const slideVars = node => { if (kind === 'slide') { node.style.setProperty('--pg-x', `${sign[0] * distance}px`); node.style.setProperty('--pg-y', `${sign[1] * distance}px`); } };
        clearTimeout(pageSwitchTimer);
        transitioning = ms > 0;
        outgoing.forEach(node => { if (ms) node.style.pointerEvents = 'none'; });
        // Build and lay the new page out first, then start the animation on the next frame, so fitting text
        // and decoding images do not stutter the first frames.
        const incoming = pageElements(currentOverlay).filter(element => element.page === currentPage).map(buildNode);
        incoming.forEach(node => {
            node._layer = (node._isTopLayer || Number(node.style.zIndex || 0) > maxCutoutZ) ? 'top' : 'masked';
            if (ms) { node.style.visibility = 'hidden'; node.style.willChange = 'transform, opacity'; }
            const parent = node._layer === 'top' ? top : masked;
            if (node.parentNode !== parent) parent.appendChild(node);
            const v = node.querySelector(':scope > video');
            if (v) playVideoElement(v);
        });
        outgoing.forEach(node => { if (ms) node.style.willChange = 'transform, opacity'; });
        refit();
        updateCutoutMask();
        const finish = () => {
            outgoing.forEach(node => {
                if (prevTrigger && node.classList.contains('overlay-embed')) { node.style.animation = ''; node.style.willChange = ''; node.style.visibility = 'hidden'; node.style.pointerEvents = 'none'; }
                else { shared.cleanupNode(node); node.remove(); }
            });
            incoming.forEach(node => { node.style.animation = ''; node.style.willChange = ''; node.style.visibility = ''; node.style.pointerEvents = ''; });
            transitioning = false;
            if (pendingRender) { const next = pendingRender; pendingRender = null; render(next); }
        };
        // Fresh embeds are blank until loaded, so hold the switch briefly (max 2s) until they have painted.
        const loading = incoming.flatMap(node => [...node.querySelectorAll('iframe')]).filter(frame => {
            try { return frame.contentDocument?.readyState !== 'complete' || frame.contentWindow.location.href === 'about:blank'; } catch { return true; }
        });
        const ready = loading.length ? Promise.race([Promise.all(loading.map(frame => new Promise(done => frame.addEventListener('load', done, { once: true })))), new Promise(done => setTimeout(done, 2000))]) : Promise.resolve();
        if (!ms) { finish(); return; }
        ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            incoming.forEach(node => { slideVars(node); node.style.visibility = ''; node.style.animation = `pg-${kind}-in ${ms}ms ease both`; });
            outgoing.forEach(node => { slideVars(node); node.style.animation = `pg-${kind}-out ${ms}ms ease both`; });
            pageSwitchTimer = setTimeout(finish, ms + 30);
        })));
    }

    async function load() {
        const response = await fetch(`/api/custom-overlays/${encodeURIComponent(overlayId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Overlay not found');
        const overlay = await response.json();
        liveStatus.overlayName = overlay.name;
        await shared.loadAssetFonts();
        try {
            const statusResponse = await fetch('/api/status', { cache: 'no-store' });
            if (statusResponse.ok) liveStatus = { ...liveStatus, ...(await statusResponse.json()) };
        } catch {}
        await shared.loadLiveExtras(liveStatus, overlay.elements);
        await shared.refreshTextSources(overlay.elements);
        currentOverlay = overlay;
        if (pagesOn(overlay)) {
            currentPage = resolvePage(overlay, pageParam);
            if (!currentPage) {
                try {
                    const state = await (await fetch(`/api/custom-overlays/${encodeURIComponent(overlayId)}/page`, { cache: 'no-store' })).json();
                    currentPage = resolvePage(overlay, state.page);
                } catch {}
            }
            if (!currentPage) currentPage = (overlay.pages.items.find(item => item.enabled !== false) || overlay.pages.items[0]).id;
        }
        render(overlay);
        return overlay;
    }

    async function refreshStatus() {
        try {
            const response = await fetch('/api/status', { cache: 'no-store' });
            if (!response.ok) return;
            const before = shared.variableSnapshot(liveStatus, variableContext());
            liveStatus = { ...liveStatus, ...(await response.json()) };
            await shared.loadLiveExtras(liveStatus, currentOverlay?.elements);
            // Re-rendering restarts typewriters, videos and embeds, so only do it when a placeholder value changed.
            if (currentOverlay && shared.variableSnapshot(liveStatus, variableContext()) !== before) render(currentOverlay);
        } catch {}
    }

    function handleVideoControl(act, targetId) {
        const videoNodes = root.querySelectorAll('.overlay-video, .overlay-embed');
        videoNodes.forEach(node => {
            if (targetId && targetId !== 'all' && node.dataset.elementId !== targetId) return;
            const video = node.querySelector('video');
            if (video) {
                if (act === 'play') {
                    video.play().catch(() => {});
                } else if (act === 'pause') {
                    video.pause();
                } else if (act === 'toggle') {
                    if (video.paused) video.play().catch(() => {});
                    else video.pause();
                } else if (act === 'restart') {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                } else if (act === 'stop') {
                    video.pause();
                    video.currentTime = 0;
                } else if (act === 'mute') {
                    video.muted = true;
                } else if (act === 'unmute') {
                    video.muted = false;
                    delete video.dataset.audioPending;
                } else if (act === 'toggle-mute') {
                    video.muted = !video.muted;
                    if (!video.muted) delete video.dataset.audioPending;
                }
                return;
            }
            const iframe = node.querySelector('iframe');
            if (iframe && iframe.contentWindow) {
                try {
                    const postCmd = (func, args = []) => {
                        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
                    };
                    if (act === 'play') {
                        iframe._ytPlaying = true;
                        postCmd('playVideo');
                    } else if (act === 'pause') {
                        iframe._ytPlaying = false;
                        postCmd('pauseVideo');
                    } else if (act === 'toggle') {
                        const playing = iframe._ytPlaying !== false;
                        iframe._ytPlaying = !playing;
                        postCmd(playing ? 'pauseVideo' : 'playVideo');
                    } else if (act === 'stop' || act === 'restart') {
                        iframe._ytPlaying = act === 'restart';
                        postCmd('seekTo', [0, true]);
                        if (act === 'stop') postCmd('pauseVideo');
                        else postCmd('playVideo');
                    } else if (act === 'mute') {
                        iframe._ytMuted = true;
                        postCmd('mute');
                    } else if (act === 'unmute') {
                        iframe._ytMuted = false;
                        postCmd('unMute');
                    } else if (act === 'toggle-mute') {
                        const muted = iframe._ytMuted !== false;
                        iframe._ytMuted = !muted;
                        postCmd(muted ? 'unMute' : 'mute');
                    }
                } catch {}
            }
        });
    }

    window.addEventListener('message', event => {
        try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data?.event === 'onStateChange' || data?.info?.playerState !== undefined) {
                const state = data?.info?.playerState !== undefined ? data.info.playerState : data.info;
                const iframes = root.querySelectorAll('.overlay-video iframe, .overlay-embed iframe');
                for (const iframe of iframes) {
                    if (iframe.contentWindow === event.source) {
                        if (state === 1) iframe._ytPlaying = true;
                        else if (state === 2) iframe._ytPlaying = false;
                        else if (state === 0) {
                            iframe._ytPlaying = false;
                            const elId = iframe.closest('.overlay-element')?.dataset.elementId;
                            const el = (currentOverlay?.elements || []).find(e => e.id === elId);
                            if (el?.video?.loop !== false) {
                                iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }), '*');
                                iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                                iframe._ytPlaying = true;
                            }
                        }
                    }
                }
            }
        } catch {}
    });

    function handleCutoutControl(act, targetId) {
        for (const element of currentOverlay?.elements || []) {
            if (element.type !== 'cutout') continue;
            if (targetId && targetId !== 'all' && element.id !== targetId) continue;
            const cur = cutoutStates.has(element.id) ? cutoutStates.get(element.id) : (element.visible !== false);
            if (act === 'toggle') cutoutStates.set(element.id, !cur);
            else if (act === 'show') cutoutStates.set(element.id, true);
            else if (act === 'hide') cutoutStates.set(element.id, false);
        }
        updateCutoutMask();
    }

    let liveSocket = null;
    let closing = false;
    function reportSlideshow(elementId, state) {
        if (liveSocket && liveSocket.readyState === WebSocket.OPEN) liveSocket.send(JSON.stringify({ type: 'slideshow-state', id: overlayId, element: elementId, ...state }));
    }

    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${location.host}`);
        liveSocket = socket;
        socket.addEventListener('open', () => {
            // Re-sync overlay state and live status after reconnect so OBS browser source stays fresh
            refreshStatus();
            load().catch(() => {});
        });
        socket.addEventListener('message', event => {
            try {
                if (typeof event.data === 'string' && (event.data.startsWith('{"type":"update"') || event.data.startsWith('{"type":"snapshot"'))) return;
                const message = JSON.parse(event.data);
                if (message.type === 'alert') showAlert(message.data);
                else if (message.type === 'alert-skip' || message.type === 'alert-clear') stopAlerts();
                else if (message.type === 'poll-update') {
                    liveStatus.poll = message.data;
                    tickPlaceholders();
                }
                else if (message.type === 'custom-overlay-page' && message.data?.id === overlayId) {
                    if (!resolvePage(currentOverlay, pageParam)) switchPage(resolvePage(currentOverlay, message.data.page));
                }
                else if (message.type === 'custom-overlay-slideshow' && message.data?.id === overlayId) {
                    for (const [id, entry] of slideshows) if (!message.data.element || message.data.element === id) entry.handle.control(message.data.action);
                }
                else if (message.type === 'custom-overlay-video' && message.data?.id === overlayId) {
                    handleVideoControl(message.data.action, message.data.element);
                }
                else if (message.type === 'custom-overlay-cutout' && message.data?.id === overlayId) {
                    handleCutoutControl(message.data.action, message.data.element);
                }
                else if (message.type === 'custom-overlay-update' && message.data?.id === overlayId) {
                    if (message.data.overlay) {
                        if (pagesOn(message.data.overlay) && pageParam) currentPage = resolvePage(message.data.overlay, pageParam) || currentPage;
                        liveStatus.overlayName = message.data.overlay.name;
                        shared.refreshTextSources(message.data.overlay.elements).finally(() => render(message.data.overlay));
                    }
                    else root.replaceChildren();
                }
            } catch {}
        });
        socket.addEventListener('close', () => { if (!closing) setTimeout(connect, 2000); });
    }

    load().catch(error => {
        root.textContent = error.message;
        root.style.color = '#f85149';
    });
    setInterval(async () => {
        if (currentOverlay && await shared.refreshTextSources(currentOverlay.elements)) render(currentOverlay);
    }, 3000);
    setInterval(refreshStatus, 5000);
    setInterval(tickPlaceholders, 1000);
    connect();

    let fitInitialized = false;
    let fitMode = false;
    const BACKDROP_MODES = ['checker', 'dark', 'transparent'];
    let backdropIndex = 0;

    function toggleAlertPreview() {
        if (!alertNodes.length) return;
        const current = alertNodes.some(item => !!item.node._alertPreviewHandle);
        alertPreviewManual = !current;
        for (const { node, element } of alertNodes) {
            if (alertPreviewManual) {
                if (!node._alertPreviewHandle) {
                    node._alertPreviewHandle = shared.playAlert(node, element, { ...shared.alertSample(element), animIn: 'none', animOut: 'none', durationMs: 3600000 }, { sound: false });
                }
            } else {
                if (node._alertPreviewHandle) {
                    node._alertPreviewHandle.stop();
                    node._alertPreviewHandle = null;
                }
            }
        }
        updatePreviewToolbar();
    }

    function cycleBackdrop() {
        backdropIndex = (backdropIndex + 1) % BACKDROP_MODES.length;
        applyBackdropMode();
    }

    function applyBackdropMode() {
        if (window.obsstudio) return;
        const mode = BACKDROP_MODES[backdropIndex];
        document.body.classList.remove('bd-dark', 'bd-transparent');
        if (mode === 'dark') document.body.classList.add('bd-dark');
        else if (mode === 'transparent') document.body.classList.add('bd-transparent');
        updatePreviewToolbar();
    }

    function checkViewportFit(overlay) {
        if (!overlay?.canvas) return;
        const isPreview = params.get('preview') === 'true' || params.get('fit') === '1' || params.get('scale') === 'fit';
        if (!isPreview) return;

        if (!fitInitialized) {
            fitInitialized = true;
            fitMode = true;
            if (!window.obsstudio && params.get('preview') === 'true') {
                document.body.classList.add('is-preview');
            }

            window.addEventListener('resize', () => {
                if (fitMode && currentOverlay) applyFit(currentOverlay);
            });

            window.addEventListener('keydown', (e) => {
                if (e.target.closest('input, textarea')) return;
                if (e.key === 'f' || e.key === 'F') {
                    fitMode = !fitMode;
                    if (currentOverlay) applyFit(currentOverlay);
                } else if (e.key === 'a' || e.key === 'A') {
                    toggleAlertPreview();
                } else if (e.key === 'b' || e.key === 'B') {
                    cycleBackdrop();
                }
            });
        }

        applyFit(overlay);
    }

    function applyFit(overlay) {
        if (!fitMode) {
            root.style.transform = '';
            root.style.transformOrigin = '';
            root.style.boxShadow = '';
            document.body.style.justifyContent = 'flex-start';
            document.body.style.alignItems = 'flex-start';
            updatePreviewToolbar();
            return;
        }

        const canW = Number(overlay.canvas.width) || 1920;
        const canH = Number(overlay.canvas.height) || 1080;
        const pad = 24;
        const scale = Math.min(1, (window.innerWidth - pad) / canW, (window.innerHeight - pad) / canH);

        root.style.transform = `scale(${scale})`;
        root.style.transformOrigin = 'center center';
        root.style.boxShadow = scale < 0.999 ? '0 0 0 1px rgba(255,255,255,0.18), 0 12px 48px rgba(0,0,0,0.6)' : '';
        document.body.style.justifyContent = 'center';
        document.body.style.alignItems = 'center';

        updatePreviewToolbar();
    }

    function getOrCreatePreviewToolbar() {
        if (window.obsstudio) return null; // Never display controls inside OBS
        let bar = document.getElementById('preview-toolbar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'preview-toolbar';
            bar.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:999999;display:flex;align-items:center;gap:8px;user-select:none;';
            document.body.appendChild(bar);
        }
        return bar;
    }

    function createPillButton(id) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.style.cssText = 'background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#f0f6fc;border:1px solid rgba(255,255,255,0.2);border-radius:999px;padding:5px 13px;font:600 11px system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.5);opacity:0.8;transition:opacity 0.15s ease,transform 0.1s ease;display:inline-flex;align-items:center;';
        btn.onmouseenter = () => { btn.style.opacity = '1'; btn.style.transform = 'scale(1.04)'; };
        btn.onmouseleave = () => { btn.style.opacity = '0.8'; btn.style.transform = ''; };
        return btn;
    }

    function updatePreviewToolbar() {
        if (window.obsstudio) return;
        const bar = getOrCreatePreviewToolbar();
        if (!bar) return;

        let fitBtn = document.getElementById('preview-fit-pill');
        if (!fitBtn) {
            fitBtn = createPillButton('preview-fit-pill');
            fitBtn.onclick = () => {
                fitMode = !fitMode;
                if (currentOverlay) applyFit(currentOverlay);
            };
            bar.appendChild(fitBtn);
        }

        const canW = Number(currentOverlay?.canvas?.width) || 1920;
        const canH = Number(currentOverlay?.canvas?.height) || 1080;
        const pad = 24;
        const scale = Math.min(1, (window.innerWidth - pad) / canW, (window.innerHeight - pad) / canH);
        const fitLabel = !fitMode ? '100% (Press F)' : (scale < 0.999 ? `Fit: ${Math.round(scale * 100)}% (Press F)` : '100% (Press F)');
        fitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:5px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>${fitLabel}`;
        fitBtn.style.borderColor = fitMode ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.2)';

        let alertBtn = document.getElementById('preview-alert-pill');
        if (alertNodes.length > 0) {
            if (!alertBtn) {
                alertBtn = createPillButton('preview-alert-pill');
                alertBtn.onclick = () => toggleAlertPreview();
                bar.appendChild(alertBtn);
            }
            const anyActive = alertNodes.some(item => !!item.node._alertPreviewHandle);
            alertBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:5px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>Alert: ${anyActive ? 'Shown' : 'Hidden'} (Press A)`;
            alertBtn.style.borderColor = anyActive ? 'rgba(56,189,248,0.6)' : 'rgba(255,255,255,0.2)';
            alertBtn.style.color = anyActive ? '#38bdf8' : '#f0f6fc';
        } else if (alertBtn) {
            alertBtn.remove();
        }

        let bdBtn = document.getElementById('preview-backdrop-pill');
        if (!bdBtn) {
            bdBtn = createPillButton('preview-backdrop-pill');
            bdBtn.onclick = () => cycleBackdrop();
            bar.appendChild(bdBtn);
        }
        const bdMode = BACKDROP_MODES[backdropIndex];
        const bdLabel = bdMode === 'checker' ? 'Backdrop: Checker (Press B)' : bdMode === 'dark' ? 'Backdrop: Dark (Press B)' : 'Backdrop: Clear (Press B)';
        bdBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:5px;"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>${bdLabel}`;
    }

    // Tear everything down on close so Safari doesn't unload live videos, iframes and timers all at once.
    addEventListener('pagehide', () => {
        closing = true;
        try { liveSocket?.close(); } catch {}
        root.querySelectorAll('video, audio').forEach(media => { try { media.pause(); media.removeAttribute('src'); media.load(); } catch {} });
        root.querySelectorAll('iframe').forEach(frame => { frame.src = 'about:blank'; });
        root.replaceChildren();
    });
})();
