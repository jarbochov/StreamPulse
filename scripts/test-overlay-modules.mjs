import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createStaticRouter } from '../server/static-router.js';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const router = createStaticRouter({ rootDir, publicDir: resolve(rootDir, 'public') });
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fictional.local');
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        const alias = url.searchParams.has('legacy') ? '/overlay-shared.js' : '/js/overlay-shared.js';
        res.end(`<!doctype html><script src="${alias}"></script><script>
            window.fixtureShared = window.OverlayShared;
            window.fixtureImmediate = window.OverlayShared.expandVariables('Hello {{stream.title}}', { stream: { title: 'Fictional show' } });
        </script>`);
    } else if (url.pathname === '/fictional-pending-image.svg') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.flushHeaders();
    } else if (!router.handleRequest(req, res)) {
        res.writeHead(404); res.end();
    }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(rootDir, `.test-overlay-modules-browser-${process.pid}`);
let browser;
const errors = [];
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true,
        userDataDir: profile,
        env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith(origin) || req.url().startsWith('data:')) req.continue();
        else req.abort();
    });

    const publicKeys = 'cleanupMedia cleanupNode alertSample ALERT_SAMPLE ALERT_SAMPLE_IMAGE setEffectsPaused isListKey isListFormat LIST_FORMAT_PRESETS applyBorderEffects BORDER_STYLES BORDER_ANIM_TYPES TEXT_ANIM_TYPES applyBorderGradient applyTextAnimation resolveBorderRadius resolveColorToken resolveStyleVariables renderImageGroupStrip hasBoxFill textEffectStyle wrapMarquee fitText refreshTextSources pruneSourceCaches textSourceState textSourceKey elementContent elementItems qrUrl renderIcon renderInlineText sanitizeIconClass prepareAlertNode playAlert playBuiltinSound playSoundValue resolveSoundUrl zzfxSamples BUILTIN_SOUNDS renderGameList renderSpeakerBadge matchesPeriodFilter matchesPeriodToken mountSlideshow slideshowItems mountPattern mountTextCycle resolveCycleLines createVarRotationEngine decorationStyle renderProgress GOOGLE_FONTS VARIABLE_GROUPS variableGroups variableTable formatDuration formatDate applyFormat isDateKey FORMAT_PRESETS hasTicking loadLiveExtras assetFonts loadAssetFonts expandVariables variableSnapshot renderMarkdown loadGoogleFont parseYouTubeUrl embedUrl applyMediaFilter shadowClipStyle borderPlacement ALERT_PRESENTATION_KEYS resolveAlertLook normalizeNumericBindings numericBindingField resolveNumericConfig resolveNumericElement'.split(' ').sort();
    const hiddenPreload = await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
    await page.goto(`${origin}/`);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('sp-fx-paused')), true, 'effects start paused when the document loads in the background');
    await page.removeScriptToEvaluateOnNewDocument(hiddenPreload.identifier);
    for (const path of ['/', '/?legacy=1']) {
        await page.goto(`${origin}${path}`);
        assert.equal(await page.evaluate(() => window.fixtureImmediate), 'Hello Fictional show', 'blocking classic consumers receive the API immediately');
        assert.deepEqual(await page.evaluate(() => Object.keys(window.OverlayShared).sort()), [...publicKeys, 'variableKey', 'trackerMax', 'linkedSourceEntry', 'linkedSourceFields', 'normalizeDisplay', 'normalizeDisplayBinding', 'resolveDisplayOwner', 'renderVariableDisplay', 'setDisplayLibrary', 'normalizeDisplayTable', 'displayFieldValue', 'getDisplayRows'].sort(), 'facade preserves the complete public contract through both aliases');
    }
    await page.addScriptTag({ url: `${origin}/js/overlay-retro.js` });
    await page.addScriptTag({ url: `${origin}/js/overlay-filters.js` });
    await page.addScriptTag({ url: `${origin}/js/patterns-shared.js` });
    assert.deepEqual(await page.evaluate(() => ({
        same: window.fixtureShared === window.OverlayShared,
        filters: typeof window.OverlayShared.defaultMediaFilter === 'function',
        patterns: window.OverlayShared.Patterns === window.StreamPulsePatterns,
        youtube: window.OverlayShared.embedUrl('https://youtu.be/abcdefghijk', { autoplay: false }).includes('autoplay=0')
    })), { same: true, filters: true, patterns: true, youtube: true });
    await page.evaluate(() => {
        window.fixturePause = window.OverlayShared.setEffectsPaused;
        window.fixtureFilter = window.OverlayShared.applyMediaFilter;
        window.OverlayShared.fixtureExtension = 'preserved';
    });
    await page.addScriptTag({ url: `${origin}/overlay-shared.js` });
    await page.addScriptTag({ url: `${origin}/js/overlay-shared.js` });
    assert.deepEqual(await page.evaluate(() => ({
        same: window.fixtureShared === window.OverlayShared,
        pause: window.fixturePause === window.OverlayShared.setEffectsPaused,
        filter: window.fixtureFilter === window.OverlayShared.applyMediaFilter,
        extension: window.OverlayShared.fixtureExtension
    })), { same: true, pause: true, filter: true, extension: 'preserved' }, 'repeated classic loads retain singleton state, functions and extensions');
    console.log('PASS classic aliases, synchronous facade and filter/pattern extensions');

    const linkedRendering = await page.evaluate(() => {
        const sets = [
            { id: 'people', slotsCount: 1, slots: ['sam'], fields: [{ key: 'name', type: 'text' }], roster: [
                { id: 'alex', label: 'Alex', inGroup: false, values: { name: 'Alex' } },
                { id: 'sam', label: 'Sam', values: { name: 'Sam' } }
            ] },
            { id: 'events', slotsCount: 0, activeEntry: 'first', fields: [
                { key: 'player', type: 'ref', targetSet: 'people' },
                { key: 'guests', type: 'ref_list', targetSet: 'people' }
            ], roster: [
                { id: 'first', values: { player: 'alex', guests: ['sam', 'alex'] } },
                { id: 'second', values: { player: 'sam', guests: [] } }
            ] },
            { id: 'items', fields: [{ key: 'name', type: 'text' }, { key: 'image', type: 'image' }], roster: [
                { id: 'sword', label: 'Sword', values: { name: 'Sword', image: '/base.png' }, tiers: [{ level: 1, label: 'Wood', image: '/wood.png' }, { level: 2, label: 'Steel', image: '/steel.png' }] },
                { id: 'badge', label: 'Badge', values: { name: 'Badge', image: '/badge.png' } }
            ] },
            { id: 'owners', slotsCount: 0, activeEntry: 'alex', fields: [{ key: 'gear', type: 'checklist', targetSet: 'items', maxTier: 1 }], roster: [{ id: 'alex', values: { gear: { sword: 2 } } }] }
        ];
        const container = document.createElement('div');
        document.body.append(container);
        const render = config => {
            window.OverlayShared.renderImageGroupStrip(container, { type: 'imageGroup', imageGroup: { enabled: true, showLabels: true, labelField: 'name', showAvatar: false, ...config } }, { variableSets: sets });
            return container.textContent;
        };
        const config = { setId: 'wrong_catalog', onlySelected: true, filterMode: 'linked', linkedSource: { setId: 'events', selector: 'active', fields: ['player', 'guests'] } };
        const first = render(config);
        sets[1].activeEntry = 'second';
        const second = render(config);
        sets[1].activeEntry = '';
        const empty = render(config);
        const tracker = render({ filterMode: 'checklist', imageField: 'image', showAvatar: true, linkedSource: { setId: 'owners', selector: 'entry:alex', fields: ['gear'] } });
        const image = container.querySelector('img')?.getAttribute('src');
        const dimmed = render({ filterMode: 'checklist', showMode: 'dim', linkedSource: { setId: 'owners', selector: 'active', fields: ['gear'] } });
        sets[3].activeEntry = '';
        const emptyTracker = render({ filterMode: 'checklist', showMode: 'dim', linkedSource: { setId: 'owners', selector: 'active', fields: ['gear'] } });
        container.remove();
        return { first, second, empty, tracker, image, dimmed, emptyTracker, targetSlots: sets[0].slots };
    });
    assert.match(linkedRendering.first, /Alex.*Sam/);
    assert.equal(linkedRendering.first.indexOf('Alex'), linkedRendering.first.lastIndexOf('Alex'), 'repeated links appear once');
    assert.match(linkedRendering.second, /Sam/);
    assert.doesNotMatch(linkedRendering.second, /Alex/);
    assert.equal(linkedRendering.empty, '', 'empty active source never falls back to all catalog entries');
    assert.match(linkedRendering.tracker, /Steel/);
    assert.doesNotMatch(linkedRendering.tracker, /Badge/);
    assert.equal(linkedRendering.image, '/steel.png');
    assert.match(linkedRendering.dimmed, /Badge/);
    assert.equal(linkedRendering.emptyTracker, '', 'empty owner does not show an unassigned tracker board');
    assert.deepEqual(linkedRendering.targetSlots, ['sam']);
    console.log('PASS linked sources, independent target slots and explicit tracker level rendering');

    const sources = await page.evaluate(async () => {
        const shared = window.OverlayShared;
        const originalFetch = window.fetch;
        const pending = [];
        window.fetch = () => new Promise(resolve => pending.push(data => resolve(new window.Response(JSON.stringify(data)))));
        const element = { type: 'text', source: { mode: 'file', path: 'fictional.txt' } };
        try {
            const older = shared.refreshTextSources([element, element]);
            const newer = shared.refreshTextSources([element]);
            const requests = pending.length;
            pending[1]({ text: 'new', mtimeMs: 2 });
            const newChanged = await newer;
            pending[0]({ text: 'old', mtimeMs: 1 });
            const oldChanged = await older;
            const current = shared.elementContent(element);
            const metadata = shared.refreshTextSources([element]);
            pending[2]({ text: 'new', mtimeMs: 3 });
            const metadataChanged = await metadata;
            const same = shared.refreshTextSources([element]);
            pending[3]({ text: 'new', mtimeMs: 3 });
            const sameChanged = await same;
            const retired = shared.refreshTextSources([element]);
            shared.pruneSourceCaches([]);
            const replacement = shared.refreshTextSources([element]);
            pending[5]({ text: 'replacement', mtimeMs: 5 });
            await replacement;
            pending[4]({ text: 'retired', mtimeMs: 4 });
            await retired;
            const retained = shared.elementContent(element);
            shared.pruneSourceCaches([]);
            return { requests, newChanged, oldChanged, current, metadataChanged, sameChanged, retained, pruned: shared.textSourceState(element) };
        } finally { window.fetch = originalFetch; }
    });
    assert.deepEqual(sources, {
        requests: 2, newChanged: true, oldChanged: false, current: 'new',
        metadataChanged: true, sameChanged: false, retained: 'replacement', pruned: null
    });
    console.log('PASS overlapping text refreshes and source-cache retirement');

    const slideshow = await page.evaluate(async () => {
        const shared = window.OverlayShared;
        const originalFetch = window.fetch;
        const pending = [];
        window.fetch = () => new Promise(resolve => pending.push(data => resolve(new window.Response(JSON.stringify(data)))));
        const config = { source: 'manual', files: ['fictional.png'] };
        try {
            const concurrent = Array.from({ length: 20 }, () => shared.slideshowItems(config));
            const calls = pending.length;
            pending[0]([{ name: 'fictional.png', kind: 'image', url: '/fictional.png' }]);
            const lists = await Promise.all(concurrent);
            await shared.slideshowItems(config);
            const cachedCalls = pending.length;
            shared.pruneSourceCaches([]);
            const node = document.createElement('div');
            document.body.appendChild(node);
            const handle = shared.mountSlideshow(node, { slideshow: config }, { preview: true });
            node._slideHandle = handle;
            shared.cleanupNode(node);
            pending[1]([{ name: 'late.png', kind: 'image', url: '/late.png' }]);
            await new Promise(resolve => setTimeout(resolve, 0));
            const result = { calls, cachedCalls, matching: lists.every(list => list[0].name === 'fictional.png'), stoppedCount: handle.count(), media: node.querySelectorAll('img,video').length };
            node.remove();
            shared.pruneSourceCaches([]);
            window.fetch = () => { throw new Error('Fictional synchronous fetch failure'); };
            const retryConfig = { source: 'manual', files: ['retry-fixture.png'] };
            result.failedCount = (await shared.slideshowItems(retryConfig)).length;
            window.fetch = async () => new window.Response(JSON.stringify([{ name: 'retry-fixture.png' }]));
            result.retried = (await shared.slideshowItems(retryConfig))[0]?.name;
            shared.pruneSourceCaches([]);
            return result;
        } finally { window.fetch = originalFetch; }
    });
    assert.deepEqual(slideshow, { calls: 1, cachedCalls: 1, matching: true, stoppedCount: 0, media: 0, failedCount: 0, retried: 'retry-fixture.png' });
    console.log('PASS coalesced slideshow requests and teardown during fetch');

    await page.evaluate(() => {
        let nextId = 0, now = 100;
        const frames = new Map(), canvases = [], images = [];
        window.requestAnimationFrame = callback => { const id = ++nextId; frames.set(id, callback); return id; };
        window.cancelAnimationFrame = id => frames.delete(id);
        const create = document.createElement.bind(document);
        document.createElement = (...args) => {
            const element = create(...args);
            if (args[0] === 'canvas') canvases.push(element);
            return element;
        };
        const NativeImage = window.Image;
        window.Image = function() { const image = new NativeImage(); images.push(image); return image; };
        window.Image.prototype = NativeImage.prototype;
        const prototype = window.CanvasRenderingContext2D.prototype;
        const draw = prototype.drawImage, clear = prototype.clearRect;
        prototype.drawImage = function(...args) {
            if (this.canvas.classList.contains('sp-pattern-canvas')) this.canvas.fixtureOps++;
            return draw.apply(this, args);
        };
        prototype.clearRect = function(...args) {
            if (this.canvas.classList.contains('sp-pattern-canvas')) {
                this.canvas.fixtureOps = 0;
                this.canvas.fixtureFrames = (this.canvas.fixtureFrames || 0) + 1;
            }
            return clear.apply(this, args);
        };
        window.fixtureRender = {
            frames, canvases, images,
            flush() {
                const batch = [...frames.values()];
                frames.clear();
                now += 20;
                const start = window.performance.now();
                for (const callback of batch) callback(now);
                return window.performance.now() - start;
            },
            mount(width, height, pattern = {}) {
                const node = document.createElement('div');
                document.body.appendChild(node);
                const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="white" d="M0 0h32v32H0z"/></svg>');
                const element = { type: 'pattern', width, height, src: pattern.src || src, pattern: { sourceType: 'image', tileSize: 16, gap: 0, motion: 'none', ...pattern } };
                const start = canvases.length;
                const handle = window.OverlayShared.mountPattern(node, element);
                this.current = { node, element, handle, allocations: canvases.slice(start) };
                return handle;
            }
        };
    });
    const coverage = [];
    for (const [width, height, angle] of [[1920, 1080, -15], [1920, 1080, 45], [1920, 1080, 89], [3840, 2160, -15], [16384, 128, -15], [128, 16384, -15]]) {
        await page.evaluate(({ width, height, angle }) => window.fixtureRender.mount(width, height, { angle }), { width, height, angle });
        await page.waitForFunction(() => window.fixtureRender.frames.size > 0);
        const report = await page.evaluate(async () => {
            const fixture = window.fixtureRender;
            const ms = fixture.flush();
            const { node, element, handle } = fixture.current;
            const { tileCoverage } = await import('/js/overlay/pattern-geometry.js');
            const angle = element.pattern.angle * Math.PI / 180;
            const geometry = tileCoverage(element.width, element.height, 16, 16, 0, Math.cos(angle), Math.sin(angle), 1);
            const canvas = node.querySelector('.sp-pattern-canvas');
            const { width, height } = canvas;
            const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
            let holes = 0;
            for (let y = 0; y < height; y += 2) {
                for (let x = 0; x < width; x += 2) {
                    if ((x < 24 || y < 24 || x >= width - 24 || y >= height - 24) && data[(y * width + x) * 4 + 3] < 16) holes++;
                }
            }
            const result = { width, height, ops: canvas.fixtureOps, visits: (geometry.cols * 2 + 1) * (geometry.rows * 2 + 1), lod: geometry.lod, holes, ms, pending: fixture.frames.size };
            window.OverlayShared.cleanupNode(node);
            result.disposed = fixture.current.allocations.every(canvas => canvas.width === 0 && canvas.height === 0);
            result.stopped = handle.isStopped();
            node.remove();
            return result;
        });
        assert.equal(report.holes, 0, `${width}x${height} at ${angle}deg covers every sampled border pixel`);
        assert.ok(report.ops > 0 && report.ops <= 16384, 'dense patterns stay within the per-frame tile-operation budget');
        assert.ok(report.visits <= 16384, 'LOD bounds all candidate visits, not just the visible draw calls');
        if (width === 1920 && height === 1080 && angle === -15) assert.equal(report.lod, 1, 'the default dense 1080p view preserves native tile detail');
        assert.equal(report.pending, 0, 'static patterns never maintain a recurring RAF');
        assert.ok(report.disposed && report.stopped, 'teardown releases all backing canvases');
        coverage.push({ logical: `${width}x${height}@${angle}`, ...report });
    }
    console.log(`PASS pattern border coverage and tile budget: ${JSON.stringify(coverage)}`);

    await page.evaluate(() => window.fixtureRender.mount(640, 360, { motion: 'scroll', symmetry: 'radial', hueShift: 'cycle' }));
    await page.waitForFunction(() => window.fixtureRender.frames.size > 0);
    const lifecycle = await page.evaluate(() => {
        const fixture = window.fixtureRender, shared = window.OverlayShared;
        fixture.flush();
        const active = fixture.frames.size;
        const { node, element, handle } = fixture.current;
        const sameHandle = shared.mountPattern(node, element) === handle;
        shared.setEffectsPaused(true);
        const immediatePaused = fixture.frames.size;
        fixture.flush();
        const paused = fixture.frames.size;
        shared.setEffectsPaused(false);
        fixture.flush();
        const resumed = fixture.frames.size;
        element.visible = false;
        handle.update(element);
        const hidden = fixture.frames.size;
        element.visible = true;
        handle.update(element);
        fixture.flush();
        let disconnected = 0;
        node._fitObserver = { disconnect() { disconnected++; } };
        node._borderObserver = { disconnect() { disconnected++; } };
        node._speakerFitFrame = window.requestAnimationFrame(() => {});
        const canvas = node.querySelector('canvas');
        shared.cleanupNode(node);
        shared.cleanupNode(node);
        shared.setEffectsPaused(false);
        const result = { active, sameHandle, immediatePaused, paused, resumed, hidden, disconnected, pending: fixture.frames.size, cleared: canvas.width === 0 && canvas.height === 0, stopped: handle.isStopped(), handleCleared: node._patternHandle === null };
        node.remove();
        return result;
    });
    assert.deepEqual(lifecycle, { active: 1, sameHandle: true, immediatePaused: 0, paused: 0, resumed: 1, hidden: 0, disconnected: 2, pending: 0, cleared: true, stopped: true, handleCleared: true });

    const procedural = await page.evaluate(() => {
        const fixture = window.fixtureRender, shared = window.OverlayShared;
        const original = window.StreamPulsePatterns;
        const calls = [];
        window.StreamPulsePatterns = {
            drawProceduralPattern(ctx, preset, width, height, options) {
                calls.push({ preset, width, height, options });
                ctx.fillStyle = '#336699';
                ctx.fillRect(0, 0, width, height);
            }
        };
        try {
            const routes = [
                { type: 'procedural-pattern', pattern: { preset: 'dots' } },
                { type: 'pattern', pattern: { sourceType: 'preset', preset: 'hexagons' } },
                { type: 'pattern', pattern: { mode: 'procedural', preset: 'grid', detail: 'exact' } }
            ];
            return routes.map(route => {
                const node = document.createElement('div');
                document.body.appendChild(node);
                const start = fixture.canvases.length;
                const element = { width: 3840, height: 2160, ...route };
                const handle = shared.mountPattern(node, element);
                fixture.flush();
                const result = {
                    preset: calls.at(-1).preset, width: calls.at(-1).width, height: calls.at(-1).height,
                    allocations: fixture.canvases.length - start, pending: fixture.frames.size,
                    reused: shared.mountPattern(node, element) === handle,
                    detail: calls.at(-1).options.detail || 'auto'
                };
                fixture.flush();
                element.pattern.motion = 'scroll';
                handle.update(element);
                fixture.flush();
                result.active = fixture.frames.size;
                result.inPlace = calls.at(-1).options.inPlace;
                shared.setEffectsPaused(true);
                result.immediatePaused = fixture.frames.size;
                fixture.flush();
                result.paused = fixture.frames.size;
                shared.setEffectsPaused(false);
                fixture.flush();
                handle.update(element, { animate: false });
                fixture.flush();
                result.frozen = fixture.frames.size;
                result.motion = calls.at(-1).options.motion;
                shared.cleanupNode(node);
                result.disposed = fixture.canvases.slice(start).every(canvas => canvas.width === 0 && canvas.height === 0);
                node.remove();
                return result;
            });
        } finally { window.StreamPulsePatterns = original; }
    });
    assert.deepEqual(procedural, ['dots', 'hexagons', 'grid'].map(preset => ({
        preset, width: 1920, height: 1080, allocations: 1, pending: 0, reused: true, detail: preset === 'grid' ? 'exact' : 'auto',
        active: 1, inPlace: 'auto', immediatePaused: 0, paused: 0, frozen: 0, motion: 'none', disposed: true
    })), 'procedural dispatch preserves settings and lifecycle without allocating unused tile stamps');
    console.log('PASS procedural dispatch, static/frozen frames, canvas cap and tile-stamp separation');

    const ambientEffects = await page.evaluate(() => {
        const shared = window.OverlayShared, fixture = window.fixtureRender;
        const node = document.createElement('div');
        node.style.cssText = 'width:640px;height:360px';
        document.body.appendChild(node);
        const element = { type: 'procedural-pattern', width: 640, height: 360, pattern: { preset: 'starfield', spin: 'sway', inPlace: 'none' } };
        const handle = shared.mountPattern(node, element);
        fixture.flush();
        const inactive = fixture.frames.size;
        element.pattern.inPlace = 'gentle';
        handle.update(element);
        fixture.flush();
        const active = fixture.frames.size;
        shared.applyMediaFilter(node, { ...element, mediaFilter: { grain: { enabled: true, animate: true, amount: .2, size: 2 } } });
        const grain = node.querySelector('.sp-grain-texture');
        const grainProperties = grain.getAnimations()[0].effect.getKeyframes().flatMap(frame => Object.keys(frame));
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        const hidden = { frames: fixture.frames.size, paused: document.documentElement.classList.contains('sp-fx-paused'), grain: getComputedStyle(grain).animationPlayState };
        shared.setEffectsPaused(true);
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
        const stillPaused = document.documentElement.classList.contains('sp-fx-paused');
        shared.setEffectsPaused(false);
        fixture.flush();
        const resumed = fixture.frames.size;
        shared.cleanupNode(node);
        node.remove();
        return { inactive, active, hidden, stillPaused, resumed, pending: fixture.frames.size, transform: grainProperties.includes('transform'), repaints: grainProperties.includes('backgroundPosition') };
    });
    assert.deepEqual(ambientEffects, { inactive: 0, active: 1, hidden: { frames: 0, paused: true, grain: 'paused' }, stillPaused: true, resumed: 1, pending: 0, transform: true, repaints: false });
    console.log('PASS ambient animation culling, composited grain and hidden/manual pause lifecycle');

    const radialEffects = await page.evaluate(() => {
        const shared = window.OverlayShared, node = document.createElement('div');
        node.style.cssText = 'width:320px;height:180px';
        document.body.appendChild(node);
        const element = { type: 'shape', width: 320, height: 180 };
        const style = { borderWidth: 12, borderStyle: 'notched', borderColor: '#ffffff', borderAnimation: { type: 'radial', size: 54, mode: 'rainbow' } };
        shared.applyBorderEffects(node, style, element);
        const surface = node.querySelector('[data-border-fx="radial"]');
        const keys = surface.getAnimations()[0].effect.getKeyframes().flatMap(frame => Object.keys(frame));
        const mask = node._borderFxRing.style.maskImage || node._borderFxRing.style.webkitMaskImage;
        const first = { transform: keys.includes('transform'), repaints: keys.includes('backgroundPosition'), masked: mask.includes('svg') };
        node.style.width = '3840px'; node.style.height = '2160px';
        shared.applyBorderEffects(node, style, { ...element, width: 3840, height: 2160 });
        const bounded = !node.querySelector('[data-border-fx="radial"]') && getComputedStyle(node._borderFxRing).animationName === 'sp-border-radial-paint';
        node.style.width = '320px'; node.style.height = '180px';
        shared.applyBorderEffects(node, style, element);
        shared.applyBorderEffects(node, { ...style, borderAnimation: { type: 'rainbow' } }, element);
        const replaced = !node.querySelector('[data-border-fx="radial"]');
        shared.cleanupNode(node);
        node.remove();
        return { ...first, bounded, replaced };
    });
    assert.deepEqual(radialEffects, { transform: true, repaints: false, masked: true, bounded: true, replaced: true });
    console.log('PASS masked radial borders use bounded compositor surfaces and retire them on changes');

    await page.evaluate(() => window.fixtureRender.mount(320, 180));
    await page.waitForFunction(() => window.fixtureRender.frames.size > 0);
    const switching = await page.evaluate(() => {
        const fixture = window.fixtureRender, shared = window.OverlayShared;
        fixture.flush();
        const { node, element, handle: tiles } = fixture.current;
        const firstCanvas = node.querySelector('canvas');
        const procedural = shared.mountPattern(node, { ...element, type: 'procedural-pattern', pattern: { preset: 'dots', motion: 'none' } });
        fixture.flush();
        const secondCanvas = node.querySelector('canvas');
        const nextTiles = shared.mountPattern(node, element);
        fixture.flush();
        shared.cleanupNode(node);
        node.remove();
        return {
            distinct: tiles !== procedural && procedural !== nextTiles,
            retired: tiles.isStopped() && procedural.isStopped(),
            released: firstCanvas.width === 0 && secondCanvas.width === 0,
            stopped: nextTiles.isStopped(), pending: fixture.frames.size
        };
    });
    assert.deepEqual(switching, { distinct: true, retired: true, released: true, stopped: true, pending: 0 }, 'switching between tile and procedural kinds cannot reuse the wrong renderer or leak its frame');

    await page.evaluate(() => window.fixtureRender.mount(320, 180, { src: '/fictional-pending-image.svg', motion: 'scroll' }));
    const pendingImage = await page.evaluate(() => {
        const fixture = window.fixtureRender;
        const image = fixture.images.at(-1);
        const hadHandlers = typeof image.onload === 'function';
        const staleLoad = image.onload;
        const { handle, element } = fixture.current;
        handle.update({ ...element, src: '/fictional-pending-image.svg?replacement=1' });
        const replacement = fixture.images.at(-1);
        staleLoad();
        window.OverlayShared.cleanupNode(fixture.current.node);
        fixture.current.node.remove();
        return {
            hadHandlers,
            detached: image.onload === null && image.onerror === null && replacement.onload === null && replacement.onerror === null,
            sourceCleared: !image.hasAttribute('src') && !replacement.hasAttribute('src'),
            pending: fixture.frames.size
        };
    });
    assert.deepEqual(pendingImage, { hadHandlers: true, detached: true, sourceCleared: true, pending: 0 });
    console.log('PASS pattern reuse, pause/resume, hiding and complete pending-image/RAF/observer disposal');
    assert.deepEqual(errors, [], 'modularized classic runtime produces no browser errors');
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
