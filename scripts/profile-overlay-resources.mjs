import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

// A bounded fictional effect/page-switch workload, never the user's running server or data.
const serveOnly = process.argv.includes('--serve');
const seconds = Number(process.env.PROFILE_SECONDS || 60);
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 600) throw new Error('PROFILE_SECONDS must be 10–600');
const files = ['overlay-shared.js', 'overlay-retro.js', 'overlay-filters.js', 'editor/editor-state.js', 'editor/editor-canvas.js'];
const sources = new Map(await Promise.all(files.map(async name => [
    `/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')
])));
const html = `<!doctype html><title>Fictional StreamPulse resource fixture</title>
<style>.canvas-element{position:absolute}#canvas{position:relative;width:640px;height:360px}
#canvas-underlayer,#canvas-toplayer{position:absolute;width:640px;height:360px}</style>
<div id="stage"><div id="world"><div id="canvas"><div id="canvas-underlayer"></div>
<div id="canvas-toplayer"></div></div><div id="ui"></div></div></div>
<script>
window.profileErrors = [];
addEventListener('error', event => profileErrors.push(event.message));
addEventListener('unhandledrejection', event => profileErrors.push(String(event.reason)));
window.activity = { rafs: new Set(), timers: new Set(), frames: 0 };
const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = callback => {
    const id = raf(now => { activity.rafs.delete(id); activity.frames++; callback(now); });
    activity.rafs.add(id); return id;
};
window.cancelAnimationFrame = id => { activity.rafs.delete(id); cancel(id); };
for (const [start, stop] of [['setTimeout','clearTimeout'],['setInterval','clearInterval']]) {
    const schedule = window[start].bind(window), clear = window[stop].bind(window);
    window[start] = (callback, ms, ...args) => {
        const id = schedule(() => {
            if (start === 'setTimeout') activity.timers.delete(id);
            callback(...args);
        }, ms);
        activity.timers.add(id); return id;
    };
    window[stop] = id => { activity.timers.delete(id); clear(id); };
}
</script>
${files.slice(0, 3).map(name => `<script src="/js/${name}"></script>`).join('')}
<script type="module">
import { state, prefs } from '/js/editor/editor-state.js';
import { renderCanvas } from '/js/editor/editor-canvas.js';
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#385b77"/><circle cx="80" cy="45" r="30" fill="#e9c46a"/></svg>');
const elements = [];
for (const page of ['a','b','*']) {
    for (let i = 0; i < 6; i++) {
        const type = i < 2 ? 'pattern' : 'image';
        const el = { id: page + '-' + i, page, type, src: image,
            width: 160, height: 90, x: (i % 3) * 170, y: Math.floor(i / 3) * 100,
            style: { objectFit: 'cover' }, pattern: { motion: 'scroll', tileSize: 20, speed: 1 } };
        if (i === 2) el.mediaFilter = { retro: { display: 'crt', crtInterlace: 25 } };
        if (i === 3) el.mediaFilter = { retro: { display: 'lcd', lcdGrid: 45, lcdGhosting: 65 } };
        if (i === 4) el.mediaFilter = { duotone: { enabled: true, dark: '#001122', light: '#aaffee', animate: 'hue', speed: 2 } };
        elements.push(el);
    }
}
state.overlay = { id: 'fictional-profile', canvas: { width: 640, height: 360 }, pages: { enabled: true }, elements };
state.curPage = 'a'; prefs.fx = true;
let switches = 0, maxMounted = 0, maxRafs = 0, maxTimers = 0;
renderCanvas();
const sample = () => {
    maxMounted = Math.max(maxMounted, state.nodes.size);
    maxRafs = Math.max(maxRafs, activity.rafs.size);
    maxTimers = Math.max(maxTimers, activity.timers.size);
    return { switches, mounted: state.nodes.size, maxMounted, maxRafs, maxTimers,
        rafs: activity.rafs.size, timers: activity.timers.size, frames: activity.frames,
        errors: [...profileErrors] };
};
window.fixture = {
    sample,
    switchPage() { state.curPage = state.curPage === 'a' ? 'b' : 'a'; switches++; renderCanvas(); return sample(); },
    stop() { state.overlay.elements = []; renderCanvas(); return sample(); }
};
window.fixtureReady = true;
</script>`;
const unexpected = [];
const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://fictional.local').pathname;
    if (sources.has(pathname)) {
        res.setHeader('Content-Type', 'text/javascript'); res.end(sources.get(pathname));
    } else if (pathname === '/') {
        res.setHeader('Content-Type', 'text/html'); res.end(html);
    } else if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); }
    else { unexpected.push(pathname); res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    if (serveOnly) {
        console.log(`Fictional fixture ready at ${origin}; bounded lifetime ${seconds}s. Use window.fixture.switchPage(), sample(), stop().`);
        await delay(seconds * 1000);
    } else {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (new URL(req.url()).origin === origin || req.url().startsWith('data:')) req.continue();
            else { unexpected.push(req.url()); req.abort(); }
        });
        await page.goto(origin);
        await page.waitForFunction(() => window.fixtureReady);
        const cdp = await page.createCDPSession();
        await cdp.send('Performance.enable');
        const collect = async () => {
            await cdp.send('HeapProfiler.collectGarbage');
            const { metrics } = await cdp.send('Performance.getMetrics');
            const values = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
            return { heapBytes: values.JSHeapUsedSize, nodes: values.Nodes, taskSeconds: values.TaskDuration };
        };
        await delay(1000);
        const before = await collect();
        const samples = [];
        for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
            samples.push(await page.evaluate(() => window.fixture.switchPage()));
            await delay(Math.min(2, seconds - elapsed) * 1000);
        }
        const active = await collect();
        await page.evaluate(() => window.fixture.stop());
        await delay(1000);
        const stopped = await page.evaluate(() => window.fixture.sample());
        const after = await collect();
        assert.ok(samples.every(s => s.mounted === 12), 'inactive pages must never mount extra layers');
        assert.equal(stopped.rafs, 0, 'teardown must release every effect RAF chain');
        assert.equal(stopped.timers, 0, 'teardown must release every effect timer');
        assert.deepEqual(stopped.errors, []);
        assert.deepEqual(unexpected, []);
        console.log(JSON.stringify({ browser: await browser.version(), seconds, fixtureLayers: 18, before, active, after, stopped }, null, 2));
        console.log('Synthetic Chromium effect-only workload; no video decode, OBS, hardware GPU, or production CPU/RAM guarantee.');
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
