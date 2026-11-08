import { cleanupMedia } from './lifecycle.js';


// ---- slideshow ----------------------------------------------------------------------------
const slideshowCache = new Map();
const mediaKind = name => (/\.(mp4|webm|ogg)$/i.test(name) ? 'video' : /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? 'image' : 'other');
function slideshowSourceKey(config = {}) {
    if (config.source === 'manual') {
        if (!(config.files || []).length) return '';
        return `/api/asset-library?kinds=${config.kinds || 'image'}&names=${encodeURIComponent((config.files || []).join('\n'))}`;
    }
    if (!(config.tags || []).length) return '';
    return `/api/asset-library?tags=${encodeURIComponent(config.tags.join(','))}&mode=${config.tagMode || 'any'}&kinds=${config.kinds || 'image'}`;
}

async function slideshowItems(config) {
    const url = slideshowSourceKey(config);
    if (!url) return [];
    let entry = slideshowCache.get(url);
    if (!entry) {
        entry = { at: 0, items: [] };
        slideshowCache.set(url, entry);
    }
    if (entry.at && Date.now() - entry.at < 8000) return entry.items;
    if (!entry.pending) {
        entry.pending = (async () => {
            try {
                const response = await fetch(url, { cache: 'no-store' });
                const items = response.ok ? await response.json() : [];
                if (slideshowCache.get(url) === entry) {
                    entry.at = Date.now();
                    entry.items = items;
                }
                return items;
            } catch { return entry.items; }
        })();
        entry.pending.finally(() => { entry.pending = null; });
    }
    return entry.pending;
}

// Plays a slideshow inside `node`. With { preview: true } it only shows the first slide. Returns { stop() }.
function mountSlideshow(node, element, options = {}) {
    const config = element.slideshow || {};
    const frozen = options.preview && !options.animate;
    let paused = options.initialState?.paused ?? config.advance === 'manual';
    let items = [], order = [], position = -1, timer = null, refreshTimer = null, stopped = false, current = null, token = 0;
    const pending = new Set(), transitions = new Set();
    cleanupMedia(node);
    node.replaceChildren();
    node.style.position = node.style.position || 'absolute';
    node.style.overflow = 'hidden';
    const stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    node.appendChild(stage);
    const note = document.createElement('div');
    note.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:1rem;color:#8b949e;font:14px sans-serif;pointer-events:none;';
    node.appendChild(note);

    const signature = list => list.map(item => item.name).join('|');
    const buildOrder = () => {
        order = items.map((_, index) => index);
        if (config.order === 'shuffle') for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    };
    const nextIndex = () => {
        if (config.order === 'random' && items.length > 1) { let pick; do { pick = Math.floor(Math.random() * items.length); } while (pick === order[position]); order[position + 1] = pick; position++; return pick; }
        position++;
        if (position >= order.length) { buildOrder(); position = 0; }
        return order[position];
    };

    function makeSlide(item) {
        const layer = document.createElement('div');
        layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
        const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
        media.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${config.fit === 'contain' ? 'contain' : 'cover'};`;
        if (item.kind === 'video') { media.muted = true; media.playsInline = true; media.autoplay = true; }
        else media.decoding = 'async';
        media.src = item.url;
        media.alt = '';
        layer.appendChild(media);
        const captionText = config.caption === 'caption' ? item.caption : config.caption === 'name' || config.caption === true ? item.label : '';
        if (captionText) {
            const bar = document.createElement('div');
            bar.textContent = captionText;
            bar.style.cssText = `position:absolute;left:0;right:0;bottom:0;padding:${Math.max(8, node.clientHeight * 0.03)}px ${Math.max(12, node.clientWidth * 0.02)}px;font:600 ${Math.max(14, node.clientHeight * 0.045)}px sans-serif;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,0.7));text-shadow:0 1px 3px rgba(0,0,0,0.8);`;
            layer.appendChild(bar);
        }
        return { layer, media };
    }

    function ready(media) {
        return new Promise(resolve => {
            if (media.tagName !== 'VIDEO' && media.complete && media.naturalWidth) return resolve(true);
            const evt = media.tagName === 'VIDEO' ? 'loadeddata' : 'load';
            const finish = success => {
                media.removeEventListener(evt, loaded);
                media.removeEventListener('error', failed);
                pending.delete(cancel);
                resolve(success);
            };
            const loaded = () => finish(true), failed = () => finish(false);
            const cancel = () => { cleanupMedia(media); finish(false); };
            pending.add(cancel);
            media.addEventListener(evt, loaded);
            media.addEventListener('error', failed);
        });
    }

    function transitionVectors() {
        const w = node.clientWidth || 1, h = node.clientHeight || 1;
        return { left: [w, 0], right: [-w, 0], up: [0, h], down: [0, -h] }[config.direction] || [w, 0];
    }

    async function show(dir = 1) {
        timer = null;
        if (stopped || !items.length) return;
        if (dir < 0) { position -= 2; if (position < -1) position += order.length; }
        const mine = ++token;
        let attempts = 0, slide = null, item = null;
        // Skip files that fail to load (deleted or corrupt) rather than getting stuck on them.
        while (attempts++ < Math.min(items.length, 8)) {
            item = items[nextIndex()];
            const candidate = makeSlide(item);
            if (await ready(candidate.media)) { slide = candidate; break; }
            cleanupMedia(candidate.layer);
            if (stopped || mine !== token) return;
        }
        if (!slide || stopped || mine !== token) {
            if (slide) cleanupMedia(slide.layer);
            return schedule(config.seconds * 1000);
        }
        const old = current;
        current = slide;
        emitState();
        stage.appendChild(slide.layer);
        const ms = frozen || !old ? 0 : config.transitionMs;
        const easing = config.easing || 'ease';
        if (ms && config.transition === 'fade') {
            slide.layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing, fill: 'both' });
            old.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing, fill: 'both' });
        } else if (ms && config.transition === 'slide') {
            const [x, y] = transitionVectors();
            slide.layer.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], { duration: ms, easing, fill: 'both' });
            old.layer.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-x}px,${-y}px)` }], { duration: ms, easing, fill: 'both' });
        }
        if (config.kenBurns && item.kind === 'image' && !frozen) {
            const grow = Math.random() < 0.5;
            slide.media.animate([{ transform: `scale(${grow ? 1 : 1.08})` }, { transform: `scale(${grow ? 1.08 : 1})` }], { duration: config.seconds * 1000 + ms, easing: 'linear', fill: 'both' });
        }
        if (old) {
            const timer = setTimeout(() => {
                transitions.delete(timer);
                cleanupMedia(old.layer); old.layer.remove();
            }, ms + 60);
            transitions.add(timer);
        }
        note.textContent = '';
        if (frozen) return;
        if (item.kind === 'video' && items.length < 2) slide.media.loop = true;
        else if (item.kind === 'video') {
            slide.media.addEventListener('ended', () => schedule(0), { once: true });
            schedule(Math.max(config.seconds, 600) * 1000);
        } else schedule(config.seconds * 1000);
    }

    // Lets StreamPulse report slideshow state (for Companion and other controllers)
    function emitState() {
        if (options.onState) options.onState({ paused, position: Math.max(0, position) + 1, count: items.length });
    }

    function schedule(ms) {
        clearTimeout(timer);
        if (stopped || frozen || paused || items.length < 2) return;
        timer = setTimeout(show, ms);
    }

    async function refresh(first) {
        const next = await slideshowItems(config);
        if (stopped) return;
        if (!first && signature(next) === signature(items)) return;
        const hadItems = items.length > 0;
        items = next;
        buildOrder();
        position = -1;
        if (first && options.initialState?.item) {
            const index = items.findIndex(item => item.name === options.initialState.item);
            if (index >= 0) position = order.indexOf(index) - 1;
        }
        if (!items.length) {
            clearTimeout(timer);
            cleanupMedia(stage);
            stage.replaceChildren(); current = null;
            note.textContent = options.preview ? (config.source === 'manual' ? 'Slideshow: choose images in the properties panel' : (config.tags || []).length ? `Slideshow: no images tagged ${config.tags.join(', ')}` : 'Slideshow: choose tags or pick images') : '';
            return;
        }
        if (options.preview) note.textContent = '';
        if (first || !hadItems || !current) show();
        else if (!timer) schedule(config.seconds * 1000);
    }

    refresh(true);
    if (!frozen && config.source !== 'manual') refreshTimer = setInterval(() => refresh(false), 20000);
    const control = action => {
        if (stopped || !items.length) return;
        if (action === 'toggle') action = paused ? 'play' : 'pause';
        if (action === 'next' || action === 'prev') { clearTimeout(timer); show(action === 'prev' ? -1 : 1); }
        else if (action === 'pause') { paused = true; clearTimeout(timer); timer = null; emitState(); }
        else if (action === 'play') { paused = false; if (!timer) schedule(config.seconds * 1000); emitState(); }
    };
    return {
        stop() {
            stopped = true;
            ++token;
            clearTimeout(timer); clearInterval(refreshTimer);
            transitions.forEach(clearTimeout); transitions.clear();
            for (const cancel of pending) cancel();
            stage.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
            cleanupMedia(stage);
        },
        snapshot: () => ({ paused, item: items[order[position]]?.name }),
        count: () => items.length,
        control
    };
}

export { mountSlideshow, slideshowCache, slideshowItems, slideshowSourceKey };
