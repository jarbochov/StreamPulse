import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

// Keep Chromium's profile and scratch files inside the project.
const profile = resolve(`.pattern-browser-${process.pid}`);
let browser;
try {
    await mkdir(profile, { recursive: true });
    browser = await puppeteer.launch({
        headless: true,
        userDataDir: profile,
        env: { ...process.env, TMPDIR: profile },
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>Pattern rendering fixture</title>');
    await page.addScriptTag({ content: await readFile(new URL('../public/js/patterns-shared.js', import.meta.url), 'utf8') });

    const result = await page.evaluate(() => {
        const { drawProceduralPattern: draw, PATTERNS } = window.StreamPulsePatterns;
        const seasonal = ['leaves', 'turkeys', 'pumpkins', 'christmas-trees',
            'christmas-lights', 'snowflakes', 'hearts', 'fireworks'];
        const stamped = seasonal.filter(p => p !== 'christmas-lights' && p !== 'fireworks');
        const base = { scale: 100, color: '#101820', accent: '#ffb030', secondary: '#33ccee',
            palette: 'dual', fillMode: 'outline', motion: 'none', inPlace: 'none', spin: 'none' };
        const canv = (w = 640, h = 360) => {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            return canvas;
        };
        function render(pattern, options, w = 640, h = 360, exact = false) {
            const canvas = canv(w, h);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (exact) ctx.createPattern = undefined;
            draw(ctx, pattern, w, h, { ...base, ...options });
            return ctx.getImageData(0, 0, w, h).data;
        }
        function diff(a, b) {
            let count = 0, sum = 0;
            for (let i = 0; i < a.length; i++) {
                const delta = Math.abs(a[i] - b[i]);
                sum += delta;
                if (delta) count++;
            }
            return { count, sum };
        }
        function check(condition, message) {
            if (!condition) throw new Error(message);
        }

        // Inspect real stamp creation and drawImage scaling, not the Node fallback.
        const proto = window.CanvasRenderingContext2D.prototype;
        const lineDescriptor = Object.getOwnPropertyDescriptor(proto, 'lineWidth');
        const firstWidths = new WeakMap();
        Object.defineProperty(proto, 'lineWidth', {
            ...lineDescriptor,
            set(value) {
                if (this.canvas.width === 384 && this.canvas.height === 384 && !firstWidths.has(this.canvas)) {
                    firstWidths.set(this.canvas, value);
                }
                lineDescriptor.set.call(this, value);
            }
        });
        const originalDrawImage = proto.drawImage;
        const observed = [];
        let stampSources = new Set();
        proto.drawImage = function(source, ...args) {
            if (firstWidths.has(source) && args.length === 4 && observed.length < 5000) {
                const matrix = this.getTransform();
                observed.push(firstWidths.get(source) * args[2] / source.width * Math.hypot(matrix.a, matrix.b));
                stampSources.add(source);
            }
            return originalDrawImage.call(this, source, ...args);
        };
        render('hearts', { lineWidth: 1 }, 1920, 1080);
        const thinStamps = stampSources;
        stampSources = new Set(); observed.length = 0;
        render('hearts', { lineWidth: 20 }, 1920, 1080);
        const thickStamps = stampSources;
        check(thinStamps.size > 0 && thickStamps.size > 0, 'both line widths must use the real stamp cache');
        check([...thickStamps].every(stamp => !thinStamps.has(stamp)), 'stroke width must change stamp keys');
        check(observed.every(width => Math.abs(width - 20) < 0.12), '20px cached strokes must remain 20px on screen');
        stampSources = new Set(); observed.length = 0;
        render('hearts', { lineWidth: 1 }, 1920, 1080);
        check([...thinStamps].every(stamp => stampSources.has(stamp)), 'cached thin stamps should be reused');
        stampSources = new Set(); observed.length = 0;
        const firstColor = { lineWidth: 1, accent: '#010203', secondary: '#010203' };
        render('hearts', firstColor);
        const oldStamps = stampSources;
        for (let i = 0; i < 55; i++) {
            stampSources = new Set(); observed.length = 0;
            const color = `#${(0x220000 + i * 271).toString(16).padStart(6, '0')}`;
            render('hearts', { lineWidth: 1, accent: color, secondary: color });
        }
        stampSources = new Set(); observed.length = 0;
        render('hearts', firstColor);
        check(oldStamps.size > 0 && [...oldStamps].every(stamp => !stampSources.has(stamp)),
            'old stamps must be evicted after the bounded cache fills');
        const widthResults = {};
        for (const pattern of seasonal) {
            const a = render(pattern, { lineWidth: 1 }, 1920, 1080);
            observed.length = 0;
            const b = render(pattern, { lineWidth: 20 }, 1920, 1080);
            if (stamped.includes(pattern)) {
                check(observed.length > 0 && observed.every(width => Math.abs(width - 20) < 0.12),
                    `${pattern}: thick cached strokes must remain 20px on screen`);
            }
            const c = render(pattern, { lineWidth: 1 }, 1920, 1080);
            const difference = diff(a, b).count;
            check(difference > 500, `${pattern}: line widths 1 and 20 have identical pixels`);
            check(diff(a, c).count === 0, `${pattern}: cached width changed after another width`);
            widthResults[pattern] = difference;
            const zoomThin = render(pattern, { scale: 10, lineWidth: 1 }, 1920, 1080);
            const zoomThick = render(pattern, { scale: 10, lineWidth: 20 }, 1920, 1080);
            check(diff(zoomThin, zoomThick).count > 500, `${pattern}: zoomed-out line width is ignored`);
            const loopStart = render(pattern, { scale: 10, lineWidth: 1, loop: true, motion: 'drift', inPlace: 'auto', time: 0 }, 1920, 1080);
            const loopEnd = render(pattern, { scale: 10, lineWidth: 1, loop: true, motion: 'drift', inPlace: 'auto', time: 6 }, 1920, 1080);
            check(diff(loopStart, loopEnd).sum < 200, `${pattern}: zoomed-out loop endpoints differ ${JSON.stringify(diff(loopStart, loopEnd))}`);
        }
        for (const pattern of stamped) {
            for (const scale of [50, 100, 150, 500]) {
                observed.length = 0;
                render(pattern, { scale, lineWidth: 4, sizeVariance: 35 }, 1920, 1080);
                check(observed.length > 0, `${pattern}: expected real cached stamps at scale ${scale}`);
                check(observed.every(width => Math.abs(width - 4) < 0.12),
                    `${pattern}: stamp stroke does not scale to 4 pixels at ${scale}: ${observed.slice(0, 4)}`);
            }
        }
        proto.drawImage = originalDrawImage;
        Object.defineProperty(proto, 'lineWidth', lineDescriptor);

        const combinations = [
            { motion: 'drift', inPlace: 'auto', spin: 'auto', colorAnim: 'cycle' },
            { motion: 'fall', inPlace: 'pulse', spin: 'reverse', colorAnim: 'breathe' },
            { motion: 'pan', inPlace: 'gentle', spin: 'sway', colorAnim: 'cycle' },
            { motion: 'pan', panDirection: 'oscillate', inPlace: 'gentle', spin: 'sway', colorAnim: 'breathe' },
            { motion: 'sway', inPlace: 'sparkle', spin: 'spin', colorAnim: 'breathe' },
            { motion: 'orbit', inPlace: 'auto', spin: 'none', colorAnim: 'none' },
            { motion: 'pulse', inPlace: 'auto', spin: 'none', colorAnim: 'none' },
            { motion: 'aurora', inPlace: 'auto', spin: 'none', colorAnim: 'none' },
            { motion: 'flow', inPlace: 'auto', spin: 'none', colorAnim: 'none' },
            { motion: 'sweep', inPlace: 'auto', spin: 'none', colorAnim: 'none' }
        ];
        for (const pattern of seasonal) {
            for (const combo of combinations) {
                const opts = { ...combo, loop: true, loopDuration: 6, speed: 1.3, spinSpeed: 1.7,
                    inPlaceSpeed: 1.4, colorSpeed: 1.2, fillMode: 'tinted' };
                const start = render(pattern, { ...opts, time: 0 });
                const end = render(pattern, { ...opts, time: 6 });
                const middle = render(pattern, { ...opts, time: 2 });
                const before = render(pattern, { ...opts, time: 5.99999 });
                check(diff(start, end).count === 0, `${pattern} ${combo.motion}: loop endpoints differ`);
                check(diff(start, middle).count > 100, `${pattern} ${combo.motion}: loop motion is frozen`);
                check(diff(start, before).sum < start.length * 0.6, `${pattern} ${combo.motion}: loop seam jumps ${JSON.stringify(diff(start, before))}`);
            }
            const live = { ...combinations[0], loop: false, fillMode: 'tinted' };
            const t0 = render(pattern, { ...live, time: 0 });
            const t6 = render(pattern, { ...live, time: 6 });
            const t12 = render(pattern, { ...live, time: 12 });
            check(diff(t0, t6).count > 100 && diff(t6, t12).count > 100,
                `${pattern}: non-looping runtime stopped or wrapped`);
            const continuous = { motion: 'fall', inPlace: 'auto', spin: 'reverse', colorAnim: 'none', loop: false };
            const beforeSix = render(pattern, { ...continuous, time: 5.999 });
            const afterSix = render(pattern, { ...continuous, time: 6.001 });
            check(diff(beforeSix, afterSix).sum < beforeSix.length * 0.3, `${pattern}: live motion jumped at six seconds`);
            const beginning = { motion: 'none', inPlace: 'auto', spin: 'none', loop: false };
            const first = render(pattern, { ...beginning, time: 0 });
            const next = render(pattern, { ...beginning, time: 0.000001 });
            check(diff(first, next).sum < first.length * 0.05, `${pattern}: in-place animation jumps after t=0`);
            const animated = { motion: 'none', inPlace: 'auto', spin: 'none', fillMode: 'tinted' };
            check(diff(render(pattern, { ...animated, time: 0 }), render(pattern, { ...animated, time: 2 })).count > 100,
                `${pattern}: isolated in-place animation is frozen`);
            for (const [colorAnim, time] of [['cycle', 1], ['breathe', 0.4]]) {
                const colorOpts = { motion: 'none', inPlace: 'none', spin: 'none', palette: 'multicolor', fillMode: 'tinted', colorAnim };
                check(diff(render(pattern, { ...colorOpts, time: 0 }), render(pattern, { ...colorOpts, time })).count > 100,
                    `${pattern}: isolated ${colorAnim} is frozen`);
            }
            if (!['christmas-trees', 'christmas-lights'].includes(pattern)) {
                const spinOpts = { motion: 'none', inPlace: 'none', fillMode: 'tinted' };
                for (const spin of ['spin', 'reverse', 'sway']) {
                    check(diff(render(pattern, { ...spinOpts, spin, time: 0 }), render(pattern, { ...spinOpts, spin, time: 2 })).count > 100,
                        `${pattern}: isolated ${spin} is frozen`);
                }
                check(diff(render(pattern, { ...spinOpts, spin: 'spin', time: 2 }),
                    render(pattern, { ...spinOpts, spin: 'reverse', time: 2 })).count > 100,
                `${pattern}: reverse spin matches forward spin`);
            }
        }
        // Cover the shared clock beyond the seasonal promo presets too.
        for (const pattern of PATTERNS) {
            const opts = { ...combinations[1], loop: true, loopDuration: 6, time: 0, fillMode: 'tinted' };
            check(diff(render(pattern, opts), render(pattern, { ...opts, time: 6 })).count === 0,
                `${pattern}: non-seasonal loop endpoints differ`);
        }
        for (const loopDuration of [0.7, 3.7, 11]) {
            const opts = { ...combinations[0], loop: true, loopDuration, time: 0 };
            check(diff(render('leaves', opts), render('leaves', { ...opts, time: loopDuration })).count === 0,
                `custom loop duration ${loopDuration} does not return to its starting frame`);
        }
        // Full-size crossfade surfaces are reused across frames and resized only
        // on dimension changes; different patterns and transparent backgrounds
        // must not leak pixels or context state into the next frame.
        const createElement = document.createElement;
        const created = [];
        document.createElement = function(name, ...args) {
            const element = createElement.call(this, name, ...args);
            if (name === 'canvas') created.push(element);
            return element;
        };
        const scratchCanvases = new Set();
        const originalScratchDraw = proto.drawImage;
        proto.drawImage = function(source, ...args) {
            if (source instanceof window.HTMLCanvasElement &&
                source.width === this.canvas.width && source.height === this.canvas.height &&
                source !== this.canvas) scratchCanvases.add(source);
            return originalScratchDraw.call(this, source, ...args);
        };
        function reuseFrame(pattern, w, h, opts) {
            const canvas = canv(w, h);
            draw(canvas.getContext('2d'), pattern, w, h, {
                ...base, color: 'transparent', background: 'transparent', motion: 'fall',
                inPlace: 'auto', loop: true, time: 5.3, ...opts
            });
            return canvas.getContext('2d').getImageData(0, 0, w, h).data;
        }
        const originalFrame = reuseFrame('leaves', 640, 360, {});
        const firstScratch = new Set(scratchCanvases);
        check(firstScratch.size === 2, `crossfade must use exactly two scratch canvases: ${firstScratch.size}`);
        const createdBefore = created.length;
        const repeatedFrame = reuseFrame('leaves', 640, 360, {});
        check(created.length === createdBefore + 1, 'repeated crossfade allocated a scratch canvas');
        check(diff(originalFrame, repeatedFrame).count === 0, 'repeated crossfade retained canvas state');
        reuseFrame('hearts', 640, 360, { fillMode: 'solid', accent: '#ff00aa' });
        const restoredFrame = reuseFrame('leaves', 640, 360, {});
        check(diff(originalFrame, restoredFrame).count === 0, 'crossfade leaked prior transparent frame pixels');
        reuseFrame('hearts', 800, 450, { fillMode: 'solid' });
        const afterResize = reuseFrame('leaves', 640, 360, {});
        check(diff(originalFrame, afterResize).count === 0, 'crossfade changed after resizing scratch surfaces');
        check(scratchCanvases.size === 2 && [...firstScratch].every(canvas => scratchCanvases.has(canvas)),
            'crossfade did not reuse the same two surfaces across sizes');
        proto.drawImage = originalScratchDraw;
        document.createElement = createElement;
        // Inspect real stamp transforms on either side of the midpoint: looped
        // fall and spin must advance in the same direction as live rendering.
        const transformDrawImage = proto.drawImage;
        let transforms = [];
        proto.drawImage = function(source, ...args) {
            if (this.canvas.width === 640 && source.width === 384 && args.length === 4) {
                const m = this.getTransform();
                transforms.push([m.e, m.f, Math.atan2(m.b, m.a)]);
            }
            return transformDrawImage.call(this, source, ...args);
        };
        function firstTransform(time, opts, loop) {
            transforms = [];
            render('leaves', { ...opts, loop, time });
            check(transforms.length > 0, 'direction test needs a real leaf stamp');
            return transforms[0];
        }
        for (const opts of [
            { motion: 'fall', inPlace: 'none', spin: 'none' },
            { motion: 'none', inPlace: 'none', spin: 'spin' },
            { motion: 'none', inPlace: 'none', spin: 'reverse' }
        ]) {
            const loopBefore = firstTransform(2.95, opts, true);
            const loopAfter = firstTransform(3.05, opts, true);
            const liveBefore = firstTransform(2.95, opts, false);
            const liveAfter = firstTransform(3.05, opts, false);
            const axis = opts.motion === 'fall' ? 1 : 2;
            const loopDelta = loopAfter[axis] - loopBefore[axis];
            const liveDelta = liveAfter[axis] - liveBefore[axis];
            check(Math.abs(liveDelta) > 0.001 && Math.abs(loopDelta - liveDelta) < 1e-8,
                `${opts.motion}/${opts.spin}: loop reverses or freezes at the midpoint`);
        }
        proto.drawImage = transformDrawImage;
        const transitionOpts = { motion: 'fall', inPlace: 'auto', spin: 'reverse',
            colorAnim: 'cycle', loop: true, loopDuration: 6, fillMode: 'tinted' };
        const atFadeStart = render('leaves', { ...transitionOpts, time: 4.8 });
        const justInsideFade = render('leaves', { ...transitionOpts, time: 4.80001 });
        check(diff(atFadeStart, justInsideFade).sum < atFadeStart.length * 0.6,
            'crossfade must start without a visible jump');

        // Count geometry operations in Chromium, comparing the exact path to the
        // bounded sample. Timing is reported only, never used as a pass criterion.
        let operations = 0;
        const names = ['beginPath', 'lineTo', 'arc', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'fillRect', 'drawImage'];
        const originals = new Map();
        for (const name of names) {
            const original = proto[name];
            originals.set(name, original);
            proto[name] = function(...args) { operations++; return original.apply(this, args); };
        }
        function measure(scale, exact) {
            const canvas = canv(1920, 1080), ctx = canvas.getContext('2d');
            if (exact) ctx.createPattern = undefined;
            const options = { ...base, scale, lineWidth: 1, motion: 'drift', inPlace: 'auto', time: 2 };
            draw(ctx, 'leaves', 1920, 1080, options);
            const samples = [];
            operations = 0;
            for (let i = 0; i < 7; i++) {
                const start = window.performance.now();
                draw(ctx, 'leaves', 1920, 1080, { ...options, time: 2 + i * 0.03 });
                samples.push(window.performance.now() - start);
            }
            samples.sort((a, b) => a - b);
            return { operations: operations / 7, medianMs: samples[3] };
        }
        const full = measure(100, false);
        const exact = measure(10, true);
        const lod = measure(10, false);
        const workByPattern = {};
        for (const pattern of [...seasonal, 'dots', 'diamonds', 'hexagons', 'triangles', 'scales', 'circuit', 'checker', 'chevrons']) {
            const options = { ...base, scale: 10, lineWidth: 1, motion: 'drift', inPlace: 'auto', time: 2 };
            const canvas = canv(1920, 1080), ctx = canvas.getContext('2d');
            draw(ctx, pattern, 1920, 1080, options);
            operations = 0;
            draw(ctx, pattern, 1920, 1080, options);
            const bounded = operations;
            operations = 0;
            draw(ctx, pattern, 1920, 1080, { ...options, scale: 5 });
            const minimumScale = operations;
            ctx.createPattern = undefined;
            operations = 0;
            draw(ctx, pattern, 1920, 1080, options);
            const unbounded = operations;
            check(bounded < unbounded * 0.3, `${pattern}: dense geometry work is not bounded: ${bounded} vs ${unbounded}`);
            check(minimumScale < bounded * 1.4 + 500, `${pattern}: minimum-scale work grew unexpectedly: ${minimumScale} vs ${bounded}`);
            workByPattern[pattern] = [bounded, minimumScale, unbounded];
        }
        for (const [name, original] of originals) proto[name] = original;
        check(lod.operations < exact.operations * 0.3,
            `dense sample not bounded: ${lod.operations} vs ${exact.operations} operations`);
        check(lod.operations < 3000, `dense sample exceeded operation budget: ${lod.operations}`);
        const sampleOpts = { scale: 10, lineWidth: 1, motion: 'drift', inPlace: 'auto', time: 2 };
        const centerDeltas = {};
        for (const pattern of seasonal) {
            const sampled = render(pattern, sampleOpts, 1920, 1080);
            const unbounded = render(pattern, sampleOpts, 1920, 1080, true);
            const exactOption = render(pattern, { ...sampleOpts, detail: 'exact' }, 1920, 1080);
            check(diff(unbounded, exactOption).count === 0, `${pattern}: exact detail must bypass sampling`);
            let centerDelta = 0;
            for (let y = 450; y < 630; y++) {
                for (let x = 870; x < 1050; x++) {
                    const i = (y * 1920 + x) * 4;
                    for (let c = 0; c < 4; c++) centerDelta += Math.abs(sampled[i + c] - unbounded[i + c]);
                }
            }
            check(centerDelta < 180 * 180 * 10, `${pattern}: dense sample changed centered detail: ${centerDelta}`);
            centerDeltas[pattern] = centerDelta;
        }
        // The repeat boundary continues the sample instead of reflecting its
        // geometry; verify both sides against the adjacent original pixels.
        const sampled = render('leaves', sampleOpts, 1920, 1080);
        const original = render('leaves', { ...sampleOpts, detail: 'exact' }, 1920, 1080);
        let seamDelta = 0;
        for (let y = 450; y < 630; y++) {
            for (const x of [1055, 1056]) {
                const i = (y * 1920 + x) * 4;
                for (let c = 0; c < 4; c++) seamDelta += Math.abs(sampled[i + c] - original[i + c]);
            }
        }
        for (let x = 870; x < 1050; x++) {
            for (const y of [635, 636]) {
                const i = (y * 1920 + x) * 4;
                for (let c = 0; c < 4; c++) seamDelta += Math.abs(sampled[i + c] - original[i + c]);
            }
        }
        check(seamDelta < 720 * 8, `sample repeat introduced a hard lattice seam: ${seamDelta}`);
        return { widthResults, full, exact, lod, centerDeltas, seamDelta, workByPattern };
    });
    assert.ok(result.lod.operations < result.exact.operations);
    console.log('Chromium pattern rendering passed:', JSON.stringify(result));
} finally {
    if (browser) await browser.close();
    await rm(profile, { recursive: true, force: true });
}
