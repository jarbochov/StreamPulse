import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import overlays from '../server/services/overlays.js';

const names = ['overlay-shared.js', 'poll-widget.js', 'patterns-shared.js', 'editor-geometry.js', 'motion-easing.js',
    ...['state', 'canvas', 'form', 'layers', 'sets', 'inspector', 'speakers', 'patterns', 'style-presets'].map(name => `editor/editor-${name}.js`)];
const sources = new Map(await Promise.all(names.map(async name =>
    [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')])));
const css = await readFile(new URL('../public/css/custom-overlay-editor.css', import.meta.url), 'utf8');
const editorHtml = await readFile(new URL('../public/editors/custom-overlay-editor.html', import.meta.url), 'utf8');
const igDialogHtml = editorHtml.match(/<dialog id="ig-fields-dialog"[\s\S]*?<\/dialog>/)?.[0] || '';
for (const name of ['overlay-retro.js', 'overlay-filters.js', 'placeholder-picker.js']) {
    const source = await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
    sources.set(`/${name}`, source);
    sources.set(`/js/${name}`, source);
}
const unexpected = [];
let savedStylePresets = [];
const readJsonBody = req => new Promise(resolve => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch { resolve({}); }
    });
});
const server = createServer(async (req, res) => {
    const urlPath = new URL(req.url, 'http://fixture.local').pathname;
    if (sources.has(urlPath)) {
        res.setHeader('Content-Type', 'text/javascript'); res.end(sources.get(urlPath));
    } else if (urlPath === '/editor.css') {
        res.setHeader('Content-Type', 'text/css'); res.end(css);
    } else if (urlPath === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><link rel="stylesheet" href="/editor.css"><style>
            :root{--bg-inset:#10141b;--bg-card:#181e28;--bg-raised:#232d3c;--text:#edf2f8;
            --text-muted:#94a3b8;--border:#354155;--accent:#38bdf8;--accent-strong:#0284c7}
            .rail.right{width:344px;height:700px;position:absolute;right:0;top:0}
            #canvas{width:640px;height:360px}
            </style><div id="stage"><div id="canvas"><div id="canvas-underlayer"></div>
            <div id="canvas-toplayer"></div></div><div id="ui"></div></div>
            <aside class="rail right"><div id="properties"></div></aside>${igDialogHtml}`);
    } else if (urlPath === '/api/alerts') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"rules":[{"id":"fictional-brb","name":"BRB in 5 minutes"},{"id":"fictional-follow","name":"Follow"}]}');
    } else if (urlPath === '/api/obs/audio-inputs') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"inputs":["Mic/Aux","Desktop Audio"],"connected":true,"enabled":true}');
    } else if (urlPath === '/api/custom-overlays/style-presets' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(savedStylePresets));
    } else if (urlPath === '/api/custom-overlays/style-presets' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const preset = { id: String(body.id || `style-${savedStylePresets.length + 1}`), name: String(body.name || 'Custom'), category: body.category || 'box', style: body.style || {} };
        savedStylePresets = [...savedStylePresets.filter(p => p.id !== preset.id), preset];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(preset));
    } else if (urlPath.startsWith('/api/custom-overlays/style-presets/') && req.method === 'DELETE') {
        const id = decodeURIComponent(urlPath.slice('/api/custom-overlays/style-presets/'.length));
        savedStylePresets = savedStylePresets.filter(p => p.id !== id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, stylePresets: savedStylePresets }));
    } else if (['/surviving-upload.png', '/newer.png', '/second.png', '/media-a.png', '/media-b.png'].includes(urlPath)) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${urlPath === '/media-b.png' ? '#22c55e' : '#abcdef'}"/></svg>`);
    } else if (urlPath === '/favicon.ico') { res.writeHead(204); res.end(); }
    else { unexpected.push(`${req.method} ${urlPath}`); res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (new URL(request.url()).origin === origin || request.url().startsWith('data:')) request.continue();
        else { unexpected.push(request.url()); request.abort(); }
    });
    const setup = async () => {
        await page.goto(origin);
        for (const name of names.slice(0, 3)) await page.addScriptTag({ url: `${origin}/js/${name}` });
        await page.addScriptTag({ url: `${origin}/js/motion-easing.js` });
        await page.addScriptTag({ url: `${origin}/placeholder-picker.js` });
        await page.evaluate(async () => {
            window.OverlayShared.slideshowItems = async () => [];
            const model = await import('/js/editor/editor-state.js');
            const inspector = await import('/js/editor/editor-inspector.js');
            const { state, prefs, createElementData, TYPE_META } = model;
            prefs.fx = false;
            state.overlay = { id: 'fictional-inspector', canvas: { width: 640, height: 360 }, elements: [] };
            inspector.initInspectorEvents();
            window.fixture = { ...model, ...inspector, types: Object.keys(TYPE_META),
                select(type, overrides = {}) {
                    const el = createElementData(type, overrides);
                    state.overlay.elements = [el];
                    state.selectedIds = new Set([el.id]);
                    inspector.renderProperties();
                    return el;
                }
            };
        });
    };
    await setup();
    const tileEdits = await page.evaluate(async () => {
        const patterns = await import('/js/editor/editor-patterns.js');
        const { state, createElementData } = window.fixture;
        const results = {};
        const makePattern = () => {
            const el = createElementData('pattern', { pattern: { sourceType: 'image', tiles: [
                { sourceType: 'image', src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
                { sourceType: 'image', src: 'second.png' }
            ] } });
            state.overlay.elements = [el];
            state.selectedIds = new Set([el.id]);
            return el;
        };
        const callbacks = { renderProperties() {} };
        const upload = (el, idx = 0) => {
            let resolve;
            const input = document.createElement('input');
            input.type = 'file';
            input.dataset.patternSlotUpload = String(idx);
            const file = new window.File(['dummy'], 'tile.png', { type: 'image/png' });
            const transfer = new window.DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            const pending = patterns.handlePatternInspectorChange({ target: input }, {
                ...callbacks, uploadAsset: () => new Promise(done => { resolve = done; })
            });
            return { pending, resolve };
        };
        let el = makePattern();
        let operation = upload(el);
        el.pattern.tiles.splice(0, 1);
        operation.resolve('removed-upload.png');
        await operation.pending;
        results.removedUpload = el.pattern.tiles[0].src;

        el = makePattern();
        operation = upload(el, 1);
        const surviving = el.pattern.tiles[1];
        el.pattern.tiles.splice(0, 1);
        operation.resolve('surviving-upload.png');
        await operation.pending;
        results.survivingUpload = surviving.src;

        el = makePattern();
        const first = upload(el);
        const second = upload(el);
        second.resolve('newer.png');
        await second.pending;
        first.resolve('older.png');
        await first.pending;
        results.newerUpload = el.pattern.tiles[0].src;

        el = makePattern();
        operation = upload(el);
        el.pattern.tiles[0].src = 'typed.png';
        operation.resolve('old-upload.png');
        await operation.pending;
        results.typedDuringUpload = el.pattern.tiles[0].src;

        el = makePattern();
        operation = upload(el);
        state.overlay = { ...state.overlay, elements: [] };
        operation.resolve('old-document.png');
        await operation.pending;
        results.oldDocument = el.pattern.tiles[0].src;

        el = makePattern();
        let pick;
        const library = document.createElement('button');
        library.dataset.patternSlotLib = '0';
        patterns.handlePatternInspectorClick({ target: library }, {
            ...callbacks, openAssetDialog: (_id, callback) => { pick = callback; }
        });
        el.pattern.tiles.splice(0, 1);
        pick('old-library.png');
        results.removedLibrary = el.pattern.tiles[0].src;

        el = makePattern();
        let save;
        const crop = document.createElement('button');
        crop.dataset.patternSlotCrop = '0';
        window.openImageCropper = options => { save = options.onSave; };
        patterns.handlePatternInspectorClick({ target: crop }, callbacks);
        el.pattern.tiles.splice(0, 1);
        await save({ url: 'old-crop.png', name: 'Crop', isNew: true });
        results.removedCrop = el.pattern.tiles[0].src;
        delete window.openImageCropper;
        return results;
    });
    assert.deepEqual(tileEdits, {
        removedUpload: 'second.png', survivingUpload: 'surviving-upload.png',
        newerUpload: 'newer.png', typedDuringUpload: 'typed.png',
        oldDocument: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        removedLibrary: 'second.png', removedCrop: 'second.png'
    }, 'asynchronous tile edits follow identity, reject stale results, and never overwrite shifted slots');
    const locations = {
        text: { content: 'content', typography: 'style' },
        'random-text': { content: 'content', behavior: 'content', typography: 'style' },
        markdown: { content: 'content', typography: 'style' },
        image: { content: 'content', fill: 'style' },
        'image-group': { content: 'content', igLayout: 'layout', typography: 'style', igAvatar: 'style', igCards: 'style', igTextStyle: 'style', fill: 'style' },
        video: { content: 'content', fill: 'style' },
        embed: { content: 'content', fill: 'style' },
        qr: { content: 'content', fill: 'style' },
        icon: { content: 'content', iconEffects: 'style' },
        shape: { fill: 'style', layout: 'layout' },
        cutout: { content: 'content', layout: 'layout' },
        progress: { content: 'content', progress: 'style', typography: 'style' },
        poll: { poll: 'content', 'poll-preview': 'content', typography: 'style' },
        'game-list': { gamelist: 'content', gamelayout: 'layout', gamecovers: 'style', gametext: 'style' },
        alert: { alert: 'content', typography: 'style' },
        slideshow: { 'slide-what': 'content', 'slide-play': 'content', 'slide-remote': 'content' },
        pattern: { content: 'content', patternLayout: 'style', patternJitter: 'style', patternMotion: 'style' },
        'procedural-pattern': { content: 'content', proceduralStyle: 'style', proceduralMotion: 'style' },
        'speaker-badge': { speakerProfile: 'content', speakerCallIn: 'content', speakerAudio: 'content', speakerLayout: 'layout', speakerStyle: 'style', speakerReaction: 'style' }
    };
    const types = await page.evaluate(() => window.fixture.types);
    assert.deepEqual(types.sort(), Object.keys(locations).sort(), 'every supported element needs an inspector regression');
    for (const type of types) {
        await page.evaluate(type => window.fixture.select(type), type);
        for (const [section, tab] of Object.entries(locations[type])) {
            assert.equal(await page.$eval(`[data-sect="${section}"]`, node => node.closest('[data-inspector-panel]').dataset.inspectorPanel), tab, `${type}/${section} must remain available in ${tab}`);
        }
        const before = await page.evaluate(() => JSON.stringify(window.fixture.state.overlay));
        const tabs = await page.$$eval('[role="tab"]', nodes => nodes.map(node => node.dataset.inspectorTab));
        for (const tab of tabs) {
            await page.click(`[data-inspector-tab="${tab}"]`);
            assert.equal(await page.$$eval('[data-inspector-panel]:not([hidden])', nodes => nodes.length), 1);
            for (const width of [344, 292, 260]) {
                const overflow = await page.evaluate(width => {
                    const rail = document.querySelector('.rail.right');
                    rail.style.width = `${width}px`;
                    const panel = document.querySelector('[data-inspector-panel]:not([hidden])');
                    panel.querySelectorAll('details').forEach(node => { node.open = true; });
                    const bounds = rail.getBoundingClientRect();
                    return [...panel.querySelectorAll('input:not([type=hidden]),select,textarea,button,summary')]
                        .filter(node => {
                            const rect = node.getBoundingClientRect();
                            return rect.width > 0 && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1);
                        }).map(node => node.dataset.path || node.id || node.textContent.trim());
                }, width);
                assert.deepEqual(overflow, [], `${type}/${tab} controls must fit the ${width}px inspector`);
            }
            await page.evaluate(() => { document.querySelector('.rail.right').style.width = '344px'; });
        }
        assert.equal(await page.evaluate(() => JSON.stringify(window.fixture.state.overlay)), before, 'inspector navigation must not mutate the design');
    }

    // Rebuilding conditional controls must keep the tab and the exact focused field.
    await page.evaluate(() => window.fixture.select('progress'));
    await page.click('[data-inspector-tab="style"]');
    await page.select('[data-path="progress.kind"]', 'ring');
    await page.waitForSelector('[data-path="progress.thickness"]');
    assert.equal(await page.$eval('#properties', node => node.dataset.inspectorActiveTab), 'style');
    assert.ok(await page.$('[data-path="progress.thickness"]'));
    await page.evaluate(() => {
        const input = document.querySelector('input[type=number][data-path="style.rotate"]');
        document.querySelector('[data-inspector-tab="layout"]').click();
        input.focus();
        window.fixture.renderProperties();
    });
    assert.equal(await page.evaluate(() => document.activeElement.type), 'number', 'rebuild must not move focus from a number field to its paired slider');

    await page.evaluate(() => window.fixture.select('text'));
    await page.click('[data-inspector-tab="style"]');
    const scroll = await page.evaluate(() => {
        const rail = document.querySelector('.rail.right');
        document.querySelectorAll('[data-inspector-panel="style"] details').forEach(node => { node.open = true; });
        rail.scrollTop = 350;
        return rail.scrollTop;
    });
    assert.ok(scroll > 0);
    await page.click('[data-inspector-tab="content"]');
    await page.click('[data-inspector-tab="style"]');
    assert.equal(await page.$eval('.rail.right', node => node.scrollTop), scroll, 'each tab restores its own scroll position');
    await page.focus('[data-inspector-tab="style"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.inspectorTab), 'content', 'keyboard tabs must wrap');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.inspectorTab), 'style');
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.inspectorTab), 'content');
    assert.equal(await page.$$eval('[role="tab"][tabindex="0"]', nodes => nodes.length), 1);

    // Per-type choices survive reload and selections with different available tabs.
    await page.click('[data-inspector-tab="style"]');
    await page.evaluate(() => window.fixture.select('cutout'));
    assert.equal(await page.$('[data-inspector-tab="style"]'), null, 'cutouts must not offer inapplicable effects');
    await setup();
    await page.evaluate(() => window.fixture.select('text'));
    assert.equal(await page.$eval('#properties', node => node.dataset.inspectorActiveTab), 'style');
    await page.evaluate(() => {
        const { state, createElementData, renderProperties } = window.fixture;
        state.overlay.elements = [createElementData('text'), createElementData('shape')];
        state.selectedIds = new Set(state.overlay.elements.map(el => el.id));
        renderProperties();
    });
    assert.deepEqual(await page.$$eval('[role="tab"]', nodes => nodes.map(node => node.dataset.inspectorTab)), ['layout', 'style'], 'multi-selection retains shared scaling/alignment and appearance without a misleading content tab');

    for (const [type, overrides, path] of [
        ['video', { video: { sound: true } }, 'video.volume'],
        ['embed', { src: 'https://youtube.com/watch?v=dQw4w9WgXcQ', video: { sound: true } }, 'video.volume'],
        ['pattern', { pattern: { sourceType: 'icon' } }, 'style.textStroke.width'],
        ['pattern', { pattern: { sourceType: 'preset' } }, 'pattern.preset'],
        ['game-list', { gameList: { layout: 'ticker' } }, 'gameList.tickerPace'],
        ['slideshow', { slideshow: { source: 'manual' } }, 'slideshow.advance'],
        ['alert', { alert: { videoSound: true } }, 'alert.videoVolume'],
        ['cutout', { cutout: { shape: 'circle' } }, 'cutout.feather']
    ]) {
        await page.evaluate(({ type, overrides }) => window.fixture.select(type, overrides), { type, overrides });
        assert.ok(await page.$(`[data-path="${path}"]`), `${type} conditional controls must be retained`);
    }
    await page.evaluate(() => window.fixture.select('alert', { alert: { mediaFit: 'contain', alertMode: 'selected', triggers: ['raid'] } }));
    assert.equal(await page.$('[data-focal]'), null, 'focus picker is hidden unless media fit is Cover');
    assert.equal((await page.$$('.layout-card')).length, 4, 'alert layout is four visual cards');
    assert.ok(await page.$('[data-trig-group] [data-alert-trigger="raid"]:checked'), 'When lists grouped events');
    await page.evaluate(() => window.fixture.select('alert', { alert: { mediaFit: 'cover' } }));
    assert.equal(await page.$('[data-focal]'), null, 'focus is set per alert in Alerts, not in the overlay editor');
    await page.$eval('[data-seg-path="alert.layout"] [data-seg-value="side"]', node => node.click());
    assert.equal(await page.evaluate(() => window.fixture.primary().alert.layout), 'side');
    await page.evaluate(async () => {
        const { renderCanvas } = await import('/js/editor/editor-canvas.js');
        window.fixture.renderCanvas = renderCanvas;
        window.fixture.select('alert', { style: { fontFamily: 'monospace', background: '#112233' }, alert: { layout: 'stack' } });
        renderCanvas();
    });
    await page.click('[data-inspector-tab="style"]');
    assert.equal(await page.$eval('[data-sect="alert-looks"]', node => node.closest('[data-inspector-panel]').dataset.inspectorPanel), 'style');
    await page.click('#btn-add-look');
    await page.waitForSelector('[data-path="alert.looks.0.style.background"]');
    const original = await page.evaluate(() => JSON.stringify(window.fixture.primary().style));
    const edit = async (path, value) => {
        await page.$eval(`[data-path="${path}"]`, (input, value) => {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        await page.evaluate(() => new Promise(done => window.requestAnimationFrame(() => window.requestAnimationFrame(done))));
    };
    await edit('alert.looks.0.name', 'Poster');
    await page.click('[data-seg-path="alert.looks.0.alert.layout"] [data-seg-value="media"]');
    await page.click('[data-path="alert.looks.0.alert.hideMessage"]');
    await edit('alert.looks.0.alert.titleSize', '60');
    await edit('alert.looks.0.alert.padding', '24');
    await edit('alert.looks.0.style.background', '#345678');
    await edit('alert.looks.0.style.shadow.blur', '12');
    await edit('alert.looks.0.mediaFilter.brightness', '70');
    await page.$eval('[data-look-rule="fictional-brb"]', input => input.scrollIntoView({ block: 'center' }));
    await page.click('[data-look-rule="fictional-brb"]');
    await page.click('#alert-play');
    const preview = await page.evaluate(() => {
        const el = window.fixture.primary(), node = window.fixture.state.nodes.get(el.id);
        return { base: JSON.stringify(el.style), layout: node.querySelector('.alert-card').classList.contains('layout-media'),
            message: !!node.querySelector('.alert-message'), titleSize: node.querySelector('.alert-title').style.fontSize,
            background: node.querySelector('.alert-card').style.backgroundColor, ruleIds: el.alert.looks[0].ruleIds,
            padding: node.querySelector('.alert-text').style.bottom, font: node.querySelector('.alert-text').style.fontFamily };
    });
    assert.equal(preview.base, original, 'editing a look cannot change inherited styling');
    assert.equal(preview.layout, true);
    assert.equal(preview.message, false);
    assert.equal(preview.titleSize, '60px');
    assert.equal(preview.background, 'rgb(52, 86, 120)');
    assert.deepEqual(preview.ruleIds, ['fictional-brb']);
    assert.equal(preview.padding, '24px');
    assert.equal(preview.font, 'monospace');
    await page.waitForFunction(() => {
        const node = window.fixture.state.nodes.get(window.fixture.primary().id);
        return node.querySelector('.alert-card').style.filter.includes('brightness(70%)');
    });
    assert.equal(await page.evaluate(() => window.fixture.state.nodes.get(window.fixture.primary().id).style.filter), '', 'look filters apply once to the card, not its parent');
    const saved = overlays.normalizeOverlayElement(await page.evaluate(() => window.fixture.primary()), 0);
    await page.evaluate(saved => {
        const { state, renderProperties, renderCanvas } = window.fixture;
        state.overlay.elements = [saved];
        state.selectedIds = new Set([saved.id]);
        renderProperties(); renderCanvas();
    }, saved);
    assert.equal(await page.$eval('[data-path="alert.looks.0.mediaFilter.brightness"]', node => node.value), '70');
    await page.select('#alert-look-select', '');
    assert.equal(await page.evaluate(() => window.fixture.state.nodes.get(window.fixture.primary().id).querySelector('.alert-card').classList.contains('layout-stack')), true);
    await page.evaluate(() => {
        const el = window.fixture.primary(), node = window.fixture.state.nodes.get(el.id);
        node._alertHandle?.stop();
        node._alertHandle = window.OverlayShared.playAlert(node, el, { ...window.OverlayShared.ALERT_SAMPLE, ruleId: 'fictional-brb', animIn: 'none' }, { sound: false });
    });
    assert.equal(await page.evaluate(() => !!window.fixture.state.nodes.get(window.fixture.primary().id).querySelector('.alert-message')), false, 'live rule assignment resolves the same look as preview');
    await page.select('#alert-look-select', saved.alert.looks[0].id);
    page.once('dialog', dialog => dialog.accept());
    await page.click('[data-remove-look="0"]');
    assert.equal(await page.evaluate(() => window.fixture.primary().alert.looks.length), 0);
    assert.equal(await page.$eval('#alert-look-select', node => node.value), '');
    await page.evaluate(() => {
        const { state, renderProperties } = window.fixture;
        state.obs = { enabled: true, connected: false, sources: [], scenes: [] };
        state.overlay.pages = { enabled: true, kind: 'states', items: [{ id: 'a', name: 'Base' }, { id: 'b', name: 'Close-up' }] };
        state.curPage = 'b';
        window.fixture.select('obs-frame');
        renderProperties();
    });
    assert.equal(await page.$eval('[data-sect="obsLink"]', node => node.closest('[data-inspector-panel]').dataset.inspectorPanel), 'layout', 'OBS frames retain source linking alongside geometry');
    await page.click('[data-inspector-tab="style"]');
    assert.ok(await page.$eval('#el-shared', node => node.getBoundingClientRect().width > 0), 'state-sharing controls remain available on every tab');
    await page.evaluate(async () => {
        const layers = await import('/js/editor/editor-layers.js');
        const { state, createElementData, extractElementState, projectPageState } = window.fixture;
        for (const id of ['pages-panel', 'page-switch', 'layers', 'layers-panel']) {
            const node = document.createElement('div'); node.id = id; document.body.append(node);
        }
        const camera = createElementData('obs-frame', { id: 'camera', page: '*', x: 20, y: 30, group: 'paired' });
        camera.obsLink.sourceName = 'Fictional camera';
        camera._baseState = extractElementState(camera);
        camera.pageStates = { b: { x: 220, visible: false, style: { borderColor: '#ff0000' } } };
        const label = createElementData('text', { id: 'label', page: '*', content: 'Fictional label', group: 'paired' });
        const own = createElementData('text', { id: 'own', page: 'b', content: 'Break only' });
        state.overlay.elements = [camera, label, own];
        state.overlay.pages = { ...window.fixture.defaultPages('states'), enabled: true,
            items: [{ id: 'a', name: 'State 1', enabled: true }, { id: 'b', name: 'Break', enabled: true }] };
        state.curPage = 'b';
        projectPageState('b');
        state.obs.connected = true;
        window.fixture.obsSyncs = 0;
        layers.registerLayerCallbacks({
            onSyncObsState: () => window.fixture.obsSyncs++,
            onRenderAll: () => { layers.renderPagesPanel(); window.fixture.renderProperties(); },
            onRenderProperties: () => window.fixture.renderProperties()
        });
        layers.renderPagesPanel();
        layers.initLayersAndPages();
        window.fixture.layers = layers;
    });
    await page.click('[data-pg-kind="pages"]');
    const converted = await page.evaluate(() => {
        const { state } = window.fixture;
        return { pages: state.overlay.pages, elements: window.fixture.serializeOverlayForSave().elements };
    });
    assert.equal(converted.pages.kind, 'pages');
    assert.equal(converted.pages.transition, 'none');
    assert.deepEqual(converted.pages.items.map(page => page.name), ['Page 1', 'Break']);
    assert.equal(converted.elements.length, 5, 'shared state layers become independent copies alongside page-specific layers');
    const cameras = converted.elements.filter(el => el.obsLink?.sourceName === 'Fictional camera');
    assert.deepEqual(cameras.map(el => [el.page, el.x, el.visible]), [['a', 20, true], ['b', 220, false]]);
    assert.ok(cameras.every(el => !el.obsLink.enabled && !el.pageStates));
    assert.notEqual(cameras[0].group, cameras[1].group, 'groups remain independent between pages');
    assert.ok(await page.$('[data-seg-path="pages.transition"]'), 'Pages offer cut, crossfade and slide');
    assert.equal(await page.$('[data-path="pages.transitionEasing"]'), null, 'Pages expose no morph controls');
    await page.evaluate(() => {
        const { state, layers } = window.fixture;
        const camera = state.overlay.elements.find(el => el.page === 'b' && el.obsLink?.sourceName);
        camera.x = 320;
        layers.switchEditPage('a');
        layers.switchEditPage('b');
    });
    assert.equal(await page.evaluate(() => window.fixture.state.overlay.elements.find(el => el.id === 'camera').x), 20,
        'editing a converted page cannot overwrite the other page');
    assert.equal(await page.evaluate(() => window.fixture.obsSyncs), 0, 'Pages never synchronize OBS on switching');
    await page.evaluate(() => {
        const { state, renderProperties } = window.fixture;
        state.selectedIds = new Set(['camera']);
        renderProperties();
    });
    assert.equal(await page.$('[data-sect="obsLink"]'), null, 'Pages expose no OBS-link inspector controls');

    // Dedicated Variable Sets tab keeps Pages/Layers uncluttered while managing Follow, transitions, and page triggers
    assert.equal(await page.$('#pages-panel [data-sect="pg-var-rotations"]'), null, 'Pages panel stays free of Variable Set rotation clutter');
    assert.equal(await page.$('#pages-panel #btn-add-var-rot'), null, 'Pages panel no longer embeds Variable Set trigger controls');
    await page.evaluate(async () => {
        const setsMod = await import('/js/editor/editor-sets.js');
        const { state, createElementData } = window.fixture;
        const tabBar = document.createElement('div');
        tabBar.className = 'rail-tabs';
        tabBar.style.maxWidth = '240px';
        for (const id of ['layers', 'pages', 'sets', 'canvas']) {
            const btn = document.createElement('button');
            btn.dataset.railTab = id;
            if (id === 'sets') btn.innerHTML = 'Sets <small id="sets-count"></small>';
            tabBar.append(btn);
        }
        const setsPanel = document.createElement('section');
        setsPanel.id = 'sets-panel';
        setsPanel.style.maxWidth = '240px';
        setsPanel.hidden = true;
        document.body.append(tabBar, setsPanel);
        state.liveStatus.variableSets = [{
            id: 'people',
            name: 'Featured Guests',
            roster: [{ id: 'p1', label: 'Alex', enabled: true, values: { name: 'Alex' } }],
            rotation: { enabled: true, intervalSeconds: 12, mode: 'sequential', transition: 'fade', durationMs: 350, entryId: 'p1' }
        }];
        state.overlay.elements.push(createElementData('text', { id: 'guest-text', page: '*', content: '{{var.people_1_name}}' }));
        setsMod.registerSetsCallbacks({ onRenderCanvas: () => {}, onSwitchEditPage: pageId => window.fixture.layers.switchEditPage(pageId, { animate: false }) });
        setsMod.initSetsPanel();
        window.fixture.layers.setRailTab('sets');
    });
    assert.equal(await page.$eval('#sets-panel', el => el.hidden), false, 'Sets tab unhides the dedicated Sets panel');
    assert.equal(await page.$eval('#pages-panel', el => el.hidden), true, 'Pages panel hides when Sets tab is active');
    assert.ok(await page.$('#sets-panel [data-vrot-set="people"]'), 'Sets tab renders linked variable sets automatically');
    await page.click('#sets-panel [data-vrot-follow="people"]');
    assert.equal(await page.evaluate(() => window.fixture.state.overlay.variableSetFollow.people), true, 'Follow toggle updates overlay.variableSetFollow');
    await page.select('#sets-panel [data-vrot-trans="people"]', 'slide-up');
    await page.evaluate(() => {
        const inp = document.querySelector('#sets-panel [data-vrot-trans-ms="people"]');
        inp.value = '600';
        inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.deepEqual(
        await page.evaluate(() => window.fixture.state.overlay.variableSetTransitions.people),
        { transition: 'slide-up', durationMs: 600 },
        'Per-overlay animation override persists on overlay.variableSetTransitions'
    );
    await page.click('#sets-panel #btn-add-var-rot');
    assert.equal(await page.evaluate(() => window.fixture.state.overlay.variableSetRotations.length), 1, 'Page-show trigger can be added from Sets tab');
    assert.equal(await page.$eval('#sets-count', el => el.textContent), '(2)', 'Sets tab count reflects active follow + enabled page triggers');

    // Multi-slot sets hide timed rotation controls while all other sets appear in the library drawer
    await page.evaluate(async () => {
        const setsMod = await import('/js/editor/editor-sets.js');
        const { state, createElementData } = window.fixture;
        state.liveStatus.variableSets.push(
            {
                id: 'casters',
                name: 'Casters Booth',
                slotsCount: 2,
                fields: [{ key: 'name', type: 'text' }],
                roster: [{ id: 'c1', label: 'Caster 1', enabled: true, values: { name: 'Caster 1' } }]
            },
            {
                id: 'sponsors',
                name: 'Sponsors',
                slotsCount: 0,
                fields: [{ key: 'brand', type: 'text' }],
                roster: [{ id: 's1', label: 'Acme', enabled: true, values: { brand: 'Acme' } }],
                rotation: { enabled: false }
            }
        );
        state.overlay.elements.push(createElementData('text', { id: 'caster-text', page: '*', content: '{{var.casters_1_name}}' }));
        setsMod.renderSetsPanel();
    });
    assert.equal(await page.$('#sets-panel [data-vrot-follow="casters"]'), null, 'Multi-slot set hides timed Follow rotation toggle');
    assert.ok(await page.$('#sets-panel [data-vrot-set="casters"] .vset-channel-meta'), 'Multi-slot set renders manual slots/queues summary card');
    assert.ok(await page.$('#sets-panel [data-vset-lib="sponsors"]'), 'Unlinked sets appear in the All Variable Sets library drawer');

    // Extended Borders, Per-Corner Radii, Text Styles/Animations, and Element Style Presets
    await page.evaluate(async () => {
        const presetsMod = await import('/js/editor/editor-style-presets.js');
        await presetsMod.loadStylePresets();
        window.fixture.select('text', { id: 'styled-text', content: 'Stream Live' });
    });
    await page.click('[data-inspector-tab="style"]');
    await page.$eval('[data-sect="stylePresets"]', d => { d.open = true; });
    assert.ok(await page.$('[data-apply-style-preset="builtin-neon-tube"]'), 'Style Presets grid renders built-in presets');
    await page.click('[data-apply-style-preset="builtin-neon-tube"]');
    const afterPreset = await page.evaluate(() => {
        const el = window.fixture.primary();
        return { borderStyle: el.style.borderStyle, borderColor: el.style.borderColor, borderWidth: el.style.borderWidth };
    });
    assert.deepEqual(afterPreset, { borderStyle: 'neon-tube', borderColor: '#f43f5e', borderWidth: 3 }, 'Applying Style Preset updates border look cleanly');

    await page.evaluate(() => {
        const inp = document.querySelector('#style-preset-name');
        inp.value = 'Broadcast Pink';
        document.querySelector('#save-style-preset-btn').click();
    });
    await page.waitForSelector('[data-delete-style-preset]');
    assert.equal(savedStylePresets.length, 1, 'Saving style preset persists via POST /api/custom-overlays/style-presets');
    await page.$eval('[data-delete-style-preset]', el => el.scrollIntoView({ block: 'center' }));
    await page.click('[data-delete-style-preset]');
    await page.waitForFunction(() => !document.querySelector('[data-delete-style-preset]'));
    assert.equal(savedStylePresets.length, 0, 'Deleting custom style preset removes it via DELETE endpoint');

    await edit('style.borderStyle', 'chamfer');
    await page.click('input[type="checkbox"][data-path="style.borderRadiusCorners.enabled"]');
    await page.waitForSelector('input[data-path="style.borderRadiusCorners.tl"]');
    await edit('style.borderRadiusCorners.tl', '22');

    // Optional middle gradient color stop toggle is explicitly off by default, and toggles/clears cleanly
    await page.$eval('[data-sect="fill"]', d => { d.open = true; });
    await page.click('[data-seg-path="style.gradient.enabled"] [data-seg-value="true"]');
    await page.waitForSelector('[data-grad-mid-toggle="style.gradient.mid"]');
    assert.equal(await page.$('[data-path="style.gradient.mid"]'), null, 'Middle color picker stays hidden until enabled');
    await page.click('[data-grad-mid-toggle="style.gradient.mid"]');
    await page.waitForSelector('input[data-path="style.gradient.mid"]');
    assert.ok(await page.evaluate(() => Boolean(window.fixture.primary().style.gradient.mid)), 'Checking optional middle stop sets mid color');
    await page.$eval('[data-clear="style.gradient.mid"]', el => el.scrollIntoView({ block: 'center' }));
    await page.click('[data-clear="style.gradient.mid"]');
    await page.waitForFunction(() => !document.querySelector('[data-path="style.gradient.mid"]'));
    assert.equal(await page.evaluate(() => window.fixture.primary().style.gradient.mid), '', 'Clicking Off collapses and clears optional middle color');

    await page.$eval('[data-sect="textEffects"]', d => { d.open = true; });
    assert.equal(await page.$('[data-path="style.textHighlight.enabled"]'), null, 'Redundant textHighlight badge checkbox is removed');
    await page.$eval('[data-path="style.textAnimation.type"]', el => el.scrollIntoView({ block: 'center' }));
    await edit('style.textAnimation.type', 'wiggle');
    await page.waitForSelector('input[data-path="style.textAnimation.speed"]');
    assert.equal(await page.$('[data-path="style.textAnimation.color"]'), null, 'Text animation does not expose color pickers');
    const styledState = await page.evaluate(() => window.fixture.primary().style);
    assert.equal(styledState.borderStyle, 'chamfer');
    assert.equal(styledState.borderRadiusCorners.enabled, true);
    assert.equal(styledState.borderRadiusCorners.tl, 22);
    assert.equal(styledState.textAnimation.type, 'wiggle');

    // Pure-motion whole-block, per-word, and per-character animations render without mutating colors
    const animChecks = await page.evaluate(async () => {
        const canvas = await import('/js/editor/editor-canvas.js');
        const { state } = window.fixture;
        const el = window.fixture.primary();
        el.content = 'Stream Alpha';
        el.style.color = '#ef4444';
        el.style.textGradient = { enabled: false };

        el.style.textAnimation = { type: 'word-bounce', speed: 2, intensity: 60 };
        canvas.renderCanvas();
        const node = state.nodes.get(el.id);
        const words = [...(node?.querySelectorAll('.sp-ta-word') || [])].map(w => w.textContent);
        const wordWrapMode = node?.querySelector('[data-sp-ta-wrap]')?.dataset?.spTaWrap || '';
        const colorDuringWord = node?.style.color || '';

        el.style.textAnimation = { type: 'char-bounce', speed: 2, intensity: 60 };
        canvas.renderCanvas();
        const charsCount = node?.querySelectorAll('.sp-ta-char').length || 0;

        el.style.textAnimation = { type: 'typing', speed: 2, intensity: 60 };
        canvas.renderCanvas();
        const hasCaret = Boolean(node?.querySelector('.sp-ta-caret'));
        const typedInit = node?.querySelector('.sp-ta-typed')?.textContent || '';

        el.style.textAnimation = { type: 'matrix', speed: 2, intensity: 60 };
        canvas.renderCanvas();
        const matrixChars = node?.querySelectorAll('.sp-ta-char').length || 0;

        el.style.textAnimation = { type: 'wobble', speed: 2, intensity: 60 };
        canvas.renderCanvas();
        const wrapAfterBlock = node?.querySelector('[data-sp-ta-wrap]');
        const rawRestored = [...(node?.childNodes || [])].filter(c => c.nodeType === 3).map(c => c.nodeValue).join('');

        return { words, wordWrapMode, colorDuringWord, charsCount, hasCaret, typedInit, matrixChars, hasWrapAfterBlock: Boolean(wrapAfterBlock), rawRestored };
    });
    assert.deepEqual(animChecks.words, ['Stream', 'Alpha'], 'Per-word animation wraps individual words cleanly');
    assert.equal(animChecks.wordWrapMode, 'word-bounce');
    assert.ok(animChecks.colorDuringWord.includes('239') || animChecks.colorDuringWord === '#ef4444', 'Text animation preserves user text color');
    assert.equal(animChecks.charsCount, 11, 'Per-char animation wraps every non-space character');
    assert.equal(animChecks.hasCaret, true, 'Typing animation renders blinking caret');
    assert.ok(animChecks.typedInit.length >= 1, 'Typing animation renders initial characters without flicker');
    assert.equal(animChecks.matrixChars, 11, 'Matrix animation builds character slots for cipher decode');
    assert.equal(animChecks.hasWrapAfterBlock, false, 'Switching back to whole-block animation cleans up split spans');
    assert.equal(animChecks.rawRestored, 'Stream Alpha', 'Raw text is restored cleanly after exiting split animation');

    // Dynamic variable image preview updates on variable set changes + Group Image Strip multi-layout customizations
    const imageChecks = await page.evaluate(async () => {
        const canvas = await import('/js/editor/editor-canvas.js');
        const { state, createElementData, renderProperties } = window.fixture;
        state.overlay.pages = { kind: 'pages', activePage: 'p1', transition: 'none', durationMs: 350, items: [{ id: 'p1', name: 'Main' }] };
        state.editPage = 'p1';
        state.liveStatus.modules = { ...(state.liveStatus.modules || {}), variableSets: true };
        state.liveStatus.customVars = [{ name: 'cast_1_avatar', type: 'image', value: '/media-a.png' }];
        state.liveStatus.variableSets = [{
            id: 'cast',
            label: 'Panel Cast',
            fields: [
                { key: 'name', type: 'text', label: 'Name' },
                { key: 'role', type: 'text', label: 'Role' },
                { key: 'avatar', type: 'image', label: 'Avatar' }
            ],
            entries: [
                { id: 'alex', label: 'Alex', inGroup: true, values: { name: 'Alex', role: 'Host', avatar: '/media-a.png' } },
                { id: 'jordan', label: 'Jordan', inGroup: false, values: { name: 'Jordan', role: 'Bench', avatar: '/media-b.png' } },
                { id: 'morgan', label: 'Morgan', inGroup: true, values: { name: 'Morgan', role: 'Mod', avatar: '' } },
                { id: 'casey', label: 'Casey', inGroup: true, values: { name: 'Casey', role: 'Co-Host', avatar: '/media-b.png' } }
            ]
        }];

        const dynImg = createElementData('image', { id: 'dyn-img', page: 'p1', src: '{{var.cast_1_avatar}}' });
        const stripImg = createElementData('image', {
            id: 'strip-img',
            page: 'p1',
            imageGroup: { enabled: true, setId: 'cast', imageField: 'avatar', labelField: 'name', layout: 'row', shape: 'circle', showLabels: true, delimiter: '|' }
        });
        state.overlay.elements = [dynImg, stripImg];
        state.selectedIds = new Set(['strip-img']);
        renderProperties();
        canvas.renderCanvas();

        const firstSrc = state.nodes.get('dyn-img')?.querySelector('img')?.getAttribute('src') || '';
        state.liveStatus.customVars = [{ name: 'cast_1_avatar', type: 'image', value: '/media-b.png' }];
        canvas.renderCanvas();
        const updatedSrc = state.nodes.get('dyn-img')?.querySelector('img')?.getAttribute('src') || '';

        const stripImgs = [...(state.nodes.get('strip-img')?.querySelectorAll('.sp-image-group-img') || [])].map(i => i.getAttribute('src'));
        const stripLabels = [...(state.nodes.get('strip-img')?.querySelectorAll('.sp-image-group-label') || [])].map(s => s.textContent);
        const hasGroupSelect = Boolean(document.querySelector('[data-path="imageGroup.setId"]'));
        const hasDeprecatedModeToggle = Boolean(document.querySelector('[data-image-mode]'));
        const layoutControlsInLayoutTab = Boolean(document.querySelector('[data-inspector-panel="layout"] [data-path="imageGroup.layout"]'));
        const typographyInStyleTab = Boolean(document.querySelector('[data-inspector-panel="style"] [data-sect="typography"]'));
        const textEffectsInStyleTab = Boolean(document.querySelector('[data-inspector-panel="style"] [data-sect="textEffects"]'));
        const noSingleObjectFit = !document.querySelector('[data-inspector-panel="style"] [data-path="style.objectFit"]');

        // Test rich layouts: cards + initials fallback + subField + maxItems overflow badge, plus spotlight & overlap & chips
        stripImg.imageGroup = {
            ...stripImg.imageGroup,
            layout: 'cards',
            shape: 'hexagon',
            subField: 'role',
            fallbackMode: 'initials',
            maxItems: 2,
            showOverflowBadge: true,
            cardBg: '#0f172a',
            cardBorderWidth: 2,
            cardBorderColor: '#38bdf8'
        };
        renderProperties();
        canvas.renderCanvas();
        const cardNode = state.nodes.get('strip-img');
        const cardsCount = cardNode?.querySelectorAll('.sp-image-group-card').length || 0;
        const cardInitials = [...(cardNode?.querySelectorAll('.sp-image-group-initials') || [])].map(s => s.textContent);
        const cardSubs = [...(cardNode?.querySelectorAll('.sp-image-group-sub') || [])].map(s => s.textContent);
        const overflowBadge = cardNode?.querySelector('.sp-image-group-overflow')?.textContent || '';

        // Test multi-field modal, 3+ fields, inline badges, banners/stagger layouts, card 21 border styles, typography & text animations
        stripImg.imageGroup = {
            ...stripImg.imageGroup,
            layout: 'banners',
            shape: 'octagon',
            maxItems: 0,
            fallbackMode: 'skip',
            showLabels: true,
            cardFrame: true,
            cardBorderWidth: 4,
            cardBorderStyle: 'tech-hud',
            cardBorderColor: '#38bdf8',
            fields: [
                { key: 'name', role: 'title', inline: true, prefix: '', suffix: '', sizeScale: 100 },
                { key: 'role', role: 'badge', inline: true, prefix: '[', suffix: ']', sizeScale: 90 },
                { key: 'avatar', role: 'caption', inline: false, prefix: '', suffix: '', sizeScale: 80 }
            ]
        };
        stripImg.style = {
            ...stripImg.style,
            fontSize: 18,
            fontWeight: '700',
            textStroke: { width: 1.5, color: '#000000' },
            textAnimation: { type: 'pulse', speed: 2, intensity: 40 }
        };
        renderProperties();
        canvas.renderCanvas();
        const bannerNode = state.nodes.get('strip-img');
        const bannersCount = bannerNode?.querySelectorAll('.sp-image-group-banner').length || 0;
        const badgesText = [...(bannerNode?.querySelectorAll('.sp-image-group-badge') || [])].map(s => s.textContent);
        const inlineRows = bannerNode?.querySelectorAll('.sp-image-group-inline').length || 0;
        const bannerFieldsCount = bannerNode?.querySelectorAll('.sp-image-group-card')[0]?.querySelectorAll('.sp-image-group-field').length || 0;
        const bannerCardHasRing = Boolean(bannerNode?.querySelector('.sp-image-group-card')?.['_borderRing']);
        const labelAnimActive = Boolean(bannerNode?.querySelector('.sp-image-group-label')?.style.animation || bannerNode?.querySelector('.sp-image-group-label')?.['_textAnimWrap']);

        stripImg.imageGroup = { ...stripImg.imageGroup, layout: 'stagger', staggerOffset: 22 };
        canvas.renderCanvas();
        const staggerTop = state.nodes.get('strip-img')?.querySelectorAll('.sp-image-group-item')[1]?.style.marginTop || '';

        stripImg.imageGroup = { ...stripImg.imageGroup, layout: 'overlap', overlap: 14, maxItems: 0, fallbackMode: 'skip' };
        canvas.renderCanvas();
        const overlapMargin = state.nodes.get('strip-img')?.querySelectorAll('.sp-image-group-item')[1]?.style.marginLeft || '';

        stripImg.imageGroup = { ...stripImg.imageGroup, layout: 'chips', maxItems: 0 };
        canvas.renderCanvas();
        const chipsCount = state.nodes.get('strip-img')?.querySelectorAll('.sp-image-group-chip').length || 0;

        stripImg.imageGroup = { ...stripImg.imageGroup, layout: 'spotlight', spotlightScale: 1.5 };
        canvas.renderCanvas();
        const hasLead = Boolean(state.nodes.get('strip-img')?.querySelector('.sp-image-group-lead'));

        return {
            firstSrc, updatedSrc, stripImgs, stripLabels, hasGroupSelect,
            hasDeprecatedModeToggle, layoutControlsInLayoutTab, typographyInStyleTab, textEffectsInStyleTab, noSingleObjectFit,
            cardsCount, cardInitials, cardSubs, overflowBadge,
            bannersCount, badgesText, inlineRows, bannerFieldsCount, bannerCardHasRing, labelAnimActive, staggerTop,
            overlapMargin, chipsCount, hasLead
        };
    });
    assert.equal(imageChecks.firstSrc, '/media-a.png', 'Dynamic variable image resolves initial source in editor canvas');
    assert.equal(imageChecks.updatedSrc, '/media-b.png', 'Dynamic variable image updates live when set variable changes');
    assert.deepEqual(imageChecks.stripImgs, ['/media-a.png', '/media-b.png'], 'Group Image Strip excludes inGroup:false and blank-image entries');
    assert.deepEqual(imageChecks.stripLabels, ['Alex', 'Casey']);
    assert.equal(imageChecks.hasGroupSelect, true, 'Group strip inspector exposes Variable Set picker');
    assert.equal(imageChecks.hasDeprecatedModeToggle, false, 'Group Image Strip omits confusing Single image mode toggle');
    assert.equal(imageChecks.layoutControlsInLayoutTab, true, 'Group strip layout controls live under Layout tab');
    assert.equal(imageChecks.typographyInStyleTab, true, 'Group strip exposes full Typography controls under Style tab');
    assert.equal(imageChecks.textEffectsInStyleTab, true, 'Group strip exposes Text Effects & Animations under Style tab');
    assert.equal(imageChecks.noSingleObjectFit, true, 'Group strip hides single-image objectFit control');
    assert.equal(imageChecks.cardsCount, 2, 'Cards layout renders maxItems capped cards');
    assert.deepEqual(imageChecks.cardInitials, ['MO'], 'Initials fallback renders monogram when avatar URL is blank');
    assert.deepEqual(imageChecks.cardSubs, ['Host', 'Mod'], 'Cards layout renders subField subtitles');
    assert.equal(imageChecks.overflowBadge, '+1', 'Overflow badge displays count of remaining active members');
    assert.equal(imageChecks.bannersCount, 2, 'Banners layout renders nameplate banners');
    assert.deepEqual(imageChecks.badgesText, ['[Host]', '[Co-Host]'], 'Inline badge role supports prefix and suffix');
    assert.equal(imageChecks.inlineRows, 2, 'Inline fields share horizontal rows per member');
    assert.equal(imageChecks.bannerFieldsCount, 3, 'Multi-field configuration renders 3+ fields per member');
    assert.equal(imageChecks.bannerCardHasRing, true, 'Member cards support standout border ring styles');
    assert.equal(imageChecks.labelAnimActive, true, 'Group strip member labels apply typography text animations');
    assert.equal(imageChecks.staggerTop, '22px', 'Stagger layout offsets alternating members vertically');
    assert.equal(imageChecks.overlapMargin, '-14px', 'Overlap layout applies negative overlap margin');
    assert.equal(imageChecks.chipsCount, 2, 'Chips layout renders capsule chips');
    assert.equal(imageChecks.hasLead, true, 'Spotlight layout marks first member as lead');
    const stripModalChecks = await page.evaluate(() => {
        const openBtn = document.querySelector('#open-ig-fields-modal');
        openBtn?.click();
        const dlg = document.querySelector('#ig-fields-dialog');
        const beforeRows = dlg ? dlg.querySelectorAll('.ig-field-row').length : 0;
        dlg?.querySelector('#ig-add-field-btn')?.click();
        const afterRows = dlg ? dlg.querySelectorAll('.ig-field-row').length : 0;
        dlg?.querySelector('[data-ig-preset="lower-banners"]')?.click();
        const { state } = window.fixture;
        const layoutAfterPreset = state.overlay.elements.find(e => e.id === 'strip-img')?.imageGroup?.layout || '';
        dlg?.querySelector('#ig-fields-close')?.click();
        return { isOpen: Boolean(dlg), beforeRows, afterRows, layoutAfterPreset };
    });
    assert.equal(stripModalChecks.isOpen, true);
    assert.equal(stripModalChecks.beforeRows, 3);
    assert.equal(stripModalChecks.afterRows, 4, 'Fields modal + Add Field appends a fourth configurable field');
    assert.equal(stripModalChecks.layoutAfterPreset, 'banners', 'Fields modal arrangement preset updates strip layout');
    const stripNarrowOverflow = await page.evaluate(() => {
        const rail = document.querySelector('.rail.right');
        rail.style.width = '260px';
        const bad = [];
        for (const tabName of ['content', 'layout', 'style']) {
            const panel = document.querySelector(`[data-inspector-panel="${tabName}"]`);
            document.querySelector(`[data-inspector-tab="${tabName}"]`)?.click();
            panel.querySelectorAll('details').forEach(node => { node.open = true; });
            const bounds = rail.getBoundingClientRect();
            for (const node of panel.querySelectorAll('input:not([type=hidden]),select,textarea,button,summary')) {
                const rect = node.getBoundingClientRect();
                if (rect.width > 0 && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1)) {
                    bad.push(`${tabName}:${node.dataset.path || node.id || node.textContent.trim()}`);
                }
            }
        }
        document.querySelector('[data-inspector-tab="content"]')?.click();
        rail.style.width = '344px';
        return bad;
    });
    assert.deepEqual(stripNarrowOverflow, [], 'Group Image Strip controls must fit the 260px inspector across Content, Layout, and Style');

    // Direct 1-click Group Image Strip creation helper + Sets drawer + Strip action + Add Menu markup
    const editorHtmlMarkup = await readFile(new URL('../public/editors/custom-overlay-editor.html', import.meta.url), 'utf8');
    assert.match(editorHtmlMarkup, /id="menu-add-image-group"[^>]*>|data-add="image-group"[^>]*id="menu-add-image-group"/, 'Group Image Strip menu item exists in custom-overlay-editor.html + Add menu');
    const quickStripChecks = await page.evaluate(async () => {
        const setsMod = await import('/js/editor/editor-sets.js');
        const { state, createElementData } = window.fixture;
        state.liveStatus.modules = { ...(state.liveStatus.modules || {}), variableSets: true };
        const quickStrip = createElementData('image-group', { id: 'quick-strip' });
        state.overlay.elements = [];
        setsMod.renderSetsPanel();
        return {
            type: quickStrip.type,
            enabled: quickStrip.imageGroup?.enabled,
            setId: quickStrip.imageGroup?.setId,
            imageField: quickStrip.imageGroup?.imageField,
            hasStripBtn: Boolean(document.querySelector('#sets-panel [data-vset-insert-strip="cast"]'))
        };
    });
    assert.equal(quickStripChecks.type, 'image');
    assert.equal(quickStripChecks.enabled, true);
    assert.equal(quickStripChecks.setId, 'cast');
    assert.equal(quickStripChecks.imageField, 'avatar');
    assert.equal(quickStripChecks.hasStripBtn, true, 'Sets library offers + Strip quick action for image-capable sets');

    // Composable standout border styles, gradients, and animations
    const borderChecks = await page.evaluate(() => {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:140px;';
        document.body.append(host);
        const testCase = (stylePatch) => {
            const node = document.createElement('div');
            node.style.cssText = 'position:relative;width:320px;height:100px;';
            host.append(node);
            const el = { id: 'b', type: 'shape', width: 320, height: 100, style: { borderWidth: 6, borderColor: '#22d3ee', ...stylePatch } };
            window.OverlayShared.applyBorderEffects(node, el.style, el);
            const fxRing = node._borderFxRing;
            const ring = node._borderRing;
            const activeRing = fxRing || ring;
            const animName = fxRing ? getComputedStyle(fxRing).animationName : 'none';
            const maskImg = activeRing ? (activeRing.style.maskImage || activeRing.style.webkitMaskImage || '') : '';
            const hasNeonCore = Boolean(activeRing?.querySelector('[data-neon-core="true"]'));
            const clipPath = node.style.clipPath || '';
            const bg = activeRing ? activeRing.style.backgroundImage || activeRing.style.background || '' : '';
            node.remove();
            return { animName, hasSvgMask: maskImg.includes('image/svg+xml'), hasNeonCore, clipPath, hasBg: Boolean(bg) };
        };
        const out = {
            techHudDualBeam: testCase({ borderStyle: 'tech-hud', borderAnimation: { type: 'dual-beam', speed: 3, size: 35, color2: '#ffffff' }, borderGradient: { enabled: true, from: '#38bdf8', to: '#a855f7' } }),
            notchedLaser: testCase({ borderStyle: 'notched', borderAnimation: { type: 'laser-scan', speed: 3, color2: '#ffffff' } }),
            ornateGradient: testCase({ borderStyle: 'ornate-filigree', borderGradient: { enabled: true, from: '#facc15', to: '#f97316' } }),
            pixelPlasma: testCase({ borderStyle: 'pixel-arcade', borderAnimation: { type: 'plasma', speed: 3, color2: '#a855f7', color3: '#ffffff' } }),
            chamferRotating: testCase({ borderStyle: 'chamfer', borderAnimation: { type: 'rotating', speed: 4, size: 35, color2: '#ffffff' } }),
            neonRainbow: testCase({ borderStyle: 'neon-tube', borderAnimation: { type: 'rainbow', speed: 3 } })
        };
        host.remove();
        return out;
    });
    assert.notEqual(borderChecks.techHudDualBeam.animName, 'none');
    assert.equal(borderChecks.techHudDualBeam.hasSvgMask, true, 'tech-hud keeps SVG mask even with gradient + dual-beam animation');
    assert.notEqual(borderChecks.notchedLaser.animName, 'none');
    assert.equal(borderChecks.notchedLaser.hasSvgMask, true);
    assert.ok(borderChecks.notchedLaser.clipPath.includes('polygon('), 'notched clips node silhouette when animation is active');
    assert.equal(borderChecks.ornateGradient.animName, 'none');
    assert.equal(borderChecks.ornateGradient.hasSvgMask, true, 'ornate-filigree renders gradient inside SVG filigree mask');
    assert.notEqual(borderChecks.pixelPlasma.animName, 'none');
    assert.equal(borderChecks.pixelPlasma.hasSvgMask, true);
    assert.ok(borderChecks.pixelPlasma.clipPath.includes('polygon('));
    assert.notEqual(borderChecks.chamferRotating.animName, 'none');
    assert.equal(borderChecks.chamferRotating.hasSvgMask, true);
    assert.ok(borderChecks.chamferRotating.clipPath.includes('polygon('));
    assert.notEqual(borderChecks.neonRainbow.animName, 'none');
    assert.equal(borderChecks.neonRainbow.hasNeonCore, true, 'neon-tube preserves inner filament core during rainbow animation');

    // Verify hazard & chevron-track masks keep interior 100% transparent in SVG and rendered pixels
    const maskInteriorChecks = await page.evaluate(async () => {
        const checkStyle = async (borderStyle) => {
            const node = document.createElement('div');
            node.style.cssText = 'position:relative;width:320px;height:100px;';
            document.body.append(node);
            const el = { id: `m-${borderStyle}`, type: 'shape', width: 320, height: 100, style: { borderWidth: 10, borderColor: '#facc15', borderStyle } };
            window.OverlayShared.applyBorderEffects(node, el.style, el);
            const rawMask = node._borderRing?.style.maskImage || node._borderRing?.style.webkitMaskImage || '';
            const match = rawMask.match(/url\("([^"]+)"\)/) || rawMask.match(/url\('([^']+)'\)/);
            const svgUri = match && match[1].startsWith('data:image/svg+xml') ? match[1] : '';
            const decodedSvg = svgUri ? decodeURIComponent(svgUri.split(',')[1] || '') : '';
            let centerAlpha = -1;
            let rimMaxAlpha = 0;
            if (svgUri) {
                await new Promise(resolve => {
                    const im = new window.Image();
                    im.onload = () => {
                        const c = document.createElement('canvas');
                        c.width = 320;
                        c.height = 100;
                        const ctx = c.getContext('2d');
                        ctx.drawImage(im, 0, 0, 320, 100);
                        centerAlpha = ctx.getImageData(160, 50, 1, 1).data[3];
                        const rowData = ctx.getImageData(0, 4, 80, 1).data;
                        for (let i = 3; i < rowData.length; i += 4) {
                            if (rowData[i] > rimMaxAlpha) rimMaxAlpha = rowData[i];
                        }
                        resolve();
                    };
                    im.onerror = resolve;
                    im.src = svgUri;
                });
            }
            node.remove();
            return { hasClipPath: decodedSvg.includes('<clipPath'), centerAlpha, rimMaxAlpha };
        };
        return {
            hazard: await checkStyle('hazard'),
            chevron: await checkStyle('chevron-track')
        };
    });
    assert.equal(maskInteriorChecks.hazard.hasClipPath, false, 'hazard mask uses fill-rule=evenodd path instead of clipPath');
    assert.equal(maskInteriorChecks.hazard.centerAlpha, 0, 'hazard border mask leaves element interior transparent');
    assert.ok(maskInteriorChecks.hazard.rimMaxAlpha > 100, 'hazard border mask paints stripes along perimeter rim');
    assert.deepEqual(maskInteriorChecks.chevron.hasClipPath, false, 'chevron-track mask uses fill-rule=evenodd path instead of clipPath');
    assert.equal(maskInteriorChecks.chevron.centerAlpha, 0, 'chevron-track border mask leaves element interior transparent');
    assert.ok(maskInteriorChecks.chevron.rimMaxAlpha > 100, 'chevron-track border mask paints chevrons along perimeter rim');

    // Verify Style tab places element-specific controls at the top across element types
    const styleOrderChecks = await page.evaluate(() => {
        const check = type => {
            window.fixture.select(type);
            const first = document.querySelector('[data-inspector-panel="style"] > [data-sect]');
            return first ? first.dataset.sect : '';
        };
        return {
            'image-group': check('image-group'),
            alert: check('alert'),
            icon: check('icon'),
            progress: check('progress'),
            'game-list': check('game-list')
        };
    });
    assert.equal(styleOrderChecks['image-group'], 'igAvatar', 'image-group opens Style with Avatar/Card sections before generic box/presets');
    assert.equal(styleOrderChecks.alert, 'alert-looks', 'alert opens Style with alert-specific sections before generic presets');
    assert.equal(styleOrderChecks.icon, 'iconEffects', 'icon opens Style with Icon effects before generic presets');
    assert.equal(styleOrderChecks.progress, 'progress', 'progress opens Style with Progress bar styling at top');
    assert.ok(['gamecovers', 'gametext'].includes(styleOrderChecks['game-list']), 'game-list opens Style with Game list sections at top');

    // Verify Text animation Once on load + 1s delay default & runtime CSS/Matrix once playback
    await page.evaluate(() => window.fixture.select('text'));
    await page.click('[data-inspector-tab="style"]');
    await page.$eval('[data-sect="textEffects"]', d => { d.open = true; });
    await page.select('[data-path="style.textAnimation.type"]', 'char-bounce');
    await page.$eval('[data-sect="textEffects"]', d => { d.open = true; });
    await page.waitForSelector('[data-path="style.textAnimation.mode"]');
    await page.select('[data-path="style.textAnimation.mode"]', 'once');
    await page.waitForSelector('[data-path="style.textAnimation.delay"]');
    const taOnceCheck = await page.evaluate(async () => {
        const delayVal = document.querySelector('[data-path="style.textAnimation.delay"]').value;
        const el = window.fixture.state.overlay.elements.find(e => e.id === [...window.fixture.state.selectedIds][0]);
        const wrap = document.createElement('div');
        wrap.textContent = 'READY';
        document.body.append(wrap);
        window.OverlayShared.applyTextAnimation(wrap, {
            ...el.style,
            textAnimation: { type: 'char-bounce', mode: 'once', delay: 1, speed: 1, intensity: 60 }
        }, 'text');
        const charSpan = wrap.querySelector('.sp-ta-char');
        const charAnim = charSpan ? charSpan.style.animation : '';
        window.OverlayShared.applyTextAnimation(wrap, {}, 'text');
        wrap.textContent = 'AB';

        window.OverlayShared.applyTextAnimation(wrap, {
            textAnimation: { type: 'matrix', mode: 'once', delay: 0, speed: 0.3, intensity: 50 }
        }, 'text');
        await new Promise(r => setTimeout(r, 600));
        const finalMatrixText = wrap.textContent;
        window.OverlayShared.applyTextAnimation(wrap, {}, 'text');
        wrap.remove();
        return { delayVal, taState: el.style.textAnimation, charAnim, finalMatrixText };
    });
    assert.equal(taOnceCheck.delayVal, '1', `Switching text animation to once-on-load defaults start delay to 1s (got: ${JSON.stringify(taOnceCheck)})`);
    assert.equal(taOnceCheck.taState.mode, 'once');
    assert.ok(taOnceCheck.charAnim.includes(' 1s 1 ') && taOnceCheck.charAnim.includes(' both'), `Once CSS animation includes 1s delay and finite once-both fill: ${taOnceCheck.charAnim}`);
    assert.equal(taOnceCheck.finalMatrixText, 'AB', 'Matrix cipher in once mode settles cleanly onto the final decoded text');

    // Verify Group Image Strip badge slots, fonts, width mode, consistent gradients/borders, and live modal preview
    const igModalCheck = await page.evaluate(() => {
        window.fixture.select('image-group');
        const el = window.fixture.state.overlay.elements.find(e => e.id === [...window.fixture.state.selectedIds][0]);
        el.imageGroup.showLabels = true;
        el.imageGroup.cardFrame = true;
        el.imageGroup.avatarBorderWidth = 3;
        el.imageGroup.cardBorderWidth = 3;
        el.imageGroup.fields = [
            { key: 'name', role: 'title', slot: 'main', fontFamily: "'Orbitron', sans-serif", fontWeight: '700', textTransform: 'uppercase' },
            { key: 'role', role: 'subtitle', slot: 'footer', fontStyle: 'italic' },
            { key: 'tag', role: 'badge', slot: 'corner-tr', inline: false }
        ];
        window.fixture.renderProperties();
        document.querySelector('.open-ig-fields-trigger')?.click();
        const dlg = document.getElementById('ig-fields-dialog');
        const previewItems = dlg?.querySelectorAll('#ig-badge-preview .sp-image-group-item').length || 0;
        const cornerCount = dlg?.querySelectorAll('#ig-badge-preview .sp-image-group-corner-tr .sp-image-group-field').length || 0;
        const footerCount = dlg?.querySelectorAll('#ig-badge-preview .sp-image-group-footer .sp-image-group-field').length || 0;
        dlg?.querySelector('[data-ig-preview-bg="light"]')?.click();
        const lightStage = document.getElementById('ig-preview-stage')?.classList.contains('is-light') || false;

        // Change width mode & border gradient/animation on card & avatar via runtime renderer
        el.imageGroup.cardWidthMode = 'fixed';
        el.imageGroup.cardWidth = 280;
        el.imageGroup.cardMinHeight = 96;
        el.imageGroup.textWrap = 'wrap';
        el.imageGroup.cardGradient = { enabled: true, type: 'linear', angle: 90, from: '#0f172a', to: '#1e1b4b', animate: false, speed: 8 };
        el.imageGroup.cardBorderGradient = { enabled: true, type: 'linear', angle: 90, from: '#38bdf8', to: '#a855f7', animate: false, speed: 8 };
        el.imageGroup.cardBorderAnimation = { type: 'rotating', speed: 4, size: 35, color2: '#ffffff', color3: '' };
        el.imageGroup.avatarBorderGradient = { enabled: true, type: 'linear', angle: 90, from: '#22d3ee', to: '#ec4899', animate: false, speed: 8 };
        el.imageGroup.avatarBorderAnimation = { type: 'rainbow', speed: 3, size: 35, color2: '#ffffff', color3: '' };

        const host = document.createElement('div');
        document.body.append(host);
        window.OverlayShared.renderImageGroupStrip(host, el, window.fixture.state.liveStatus);
        const card = host.querySelector('.sp-image-group-item');
        const av = host.querySelector('.sp-image-group-avatar');
        const hasCardFx = Boolean(card?._borderFxRing);
        const hasAvFx = Boolean(av?._borderFxRing);
        const hasWrapClass = card?.classList.contains('is-wrap') || false;
        const widthCss = card?.style.width || '';
        const minHCss = card?.style.minHeight || '';
        const hasSubFont = Boolean(document.querySelector('[data-path="imageGroup.subFontFamily"]'));
        const hasCardGradUI = Boolean(document.querySelector('[data-seg-path="imageGroup.cardBorderGradient.enabled"]'));
        const hasAvGradUI = Boolean(document.querySelector('[data-seg-path="imageGroup.avatarBorderGradient.enabled"]'));
        host.remove();
        dlg?.removeAttribute('open');
        return { previewItems, cornerCount, footerCount, lightStage, hasCardFx, hasAvFx, hasWrapClass, widthCss, minHCss, hasSubFont, hasCardGradUI, hasAvGradUI };
    });
    assert.equal(igModalCheck.previewItems, 1, 'Member Badge Builder modal renders a live single-member preview');
    assert.equal(igModalCheck.cornerCount, 1, 'corner-tr slot places field on avatar corner container');
    assert.equal(igModalCheck.footerCount, 1, 'footer slot places field in card footer container');
    assert.equal(igModalCheck.lightStage, true, 'Modal preview backdrop toggle switches light/dark/checker');
    assert.equal(igModalCheck.hasCardFx, true, 'Group card renders border gradient + animation ring consistently');
    assert.equal(igModalCheck.hasAvFx, true, 'Group avatar renders border gradient + animation ring consistently');
    assert.equal(igModalCheck.hasWrapClass, true, 'textWrap: wrap adds .is-wrap multi-line wrapping class');
    assert.equal(igModalCheck.widthCss, '280px');
    assert.equal(igModalCheck.minHCss, '96px');
    assert.equal(igModalCheck.hasSubFont, true, 'Typography section exposes quick Subtitle / accent font override');
    assert.equal(igModalCheck.hasCardGradUI, true, 'Member card border section exposes Solid/Gradient border fill toggle');
    assert.equal(igModalCheck.hasAvGradUI, true, 'Avatar border section exposes Solid/Gradient border fill toggle');

    // Service-level schema normalization & saved Style Presets persistence
    const tmpOverlaysDir = await mkdtemp(path.join(os.tmpdir(), 'sp-style-presets-'));
    try {
        const svc = overlays.createOverlayService({ dataDir: tmpOverlaysDir, broadcast: () => {} });
        const normEl = overlays.normalizeOverlayElement({
            type: 'text',
            content: 'Host',
            style: {
                borderStyle: 'tech-hud',
                borderAnimation: { type: 'dual-beam', speed: 3, size: 35, color2: '#ffffff', color3: '#a855f7' },
                borderRadiusCorners: { enabled: true, tl: 16, tr: 4, br: 16, bl: 4 },
                fontStyle: 'italic',
                tabularNums: true,
                textShadow: { blur: 6, x: 2, y: -3, color: '#000000' },
                textAnimation: { type: 'char-wiggle', mode: 'once', delay: 1.5, speed: 2.5, intensity: 70, color: '#ffffff' }
            }
        });
        assert.equal(normEl.style.borderStyle, 'tech-hud');
        assert.equal(normEl.style.borderAnimation.type, 'dual-beam');
        assert.equal(overlays.normalizeOverlayElement({ type: 'shape', style: { borderStyle: 'ornate-filigree', borderAnimation: { type: 'laser-scan' } } }).style.borderStyle, 'ornate-filigree');
        assert.equal(overlays.normalizeOverlayElement({ type: 'shape', style: { borderStyle: 'pixel-arcade', borderAnimation: { type: 'plasma' } } }).style.borderAnimation.type, 'plasma');
        assert.deepEqual(normEl.style.borderRadiusCorners, { enabled: true, tl: 16, tr: 4, br: 16, bl: 4 });
        assert.equal(normEl.style.fontStyle, 'italic');
        assert.equal(normEl.style.tabularNums, true);
        assert.equal(normEl.style.textShadow.x, 2);
        assert.equal('textHighlight' in normEl.style, false, 'Removed redundant textHighlight from normalized style');
        assert.equal(normEl.style.textAnimation.type, 'char-wiggle');
        assert.equal(normEl.style.textAnimation.mode, 'once');
        assert.equal(normEl.style.textAnimation.delay, 1.5);
        assert.equal('color' in normEl.style.textAnimation, false, 'Text animation normalization omits color overrides');

        const normGroup = overlays.normalizeOverlayElement({
            type: 'image',
            imageGroup: {
                enabled: true,
                setId: 'crew',
                showAvatar: false,
                cardWidthMode: 'fixed',
                cardWidth: 300,
                cardMinHeight: 110,
                textWrap: 'wrap',
                subFontFamily: "'Inter', sans-serif",
                badgeFontFamily: "'Orbitron', sans-serif",
                cornerInset: 8,
                cardBorderColor: '@team_color',
                cardBorderGradient: { enabled: true, from: '#38bdf8', to: '{{var.accent}}' },
                avatarBorderGradient: { enabled: true, from: '#22d3ee', to: '#a855f7' },
                avatarBorderGlow: { enabled: true, color: '#22d3ee', blur: 12 },
                avatarBorderAnimation: { type: 'rainbow', speed: 3 },
                fields: [
                    { key: 'name', role: 'title', slot: 'corner-tr', align: 'right', fontFamily: "'Oswald', sans-serif", fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase', fontSize: 18, padX: 10, padY: 4, bgColor: '@team_color' },
                    { key: 'crest', kind: 'image', role: 'badge', slot: 'avatar-tl', customSrc: '/media-b.png', imgSize: 24, imgShape: 'circle', imgFit: 'contain', imgBorderW: 2 }
                ]
            }
        });
        assert.equal(normGroup.imageGroup.showAvatar, false);
        assert.equal(normGroup.imageGroup.cardWidthMode, 'fixed');
        assert.equal(normGroup.imageGroup.cardWidth, 300);
        assert.equal(normGroup.imageGroup.cornerInset, 8);
        assert.equal(normGroup.imageGroup.cardBorderColor, '@team_color');
        assert.equal(normGroup.imageGroup.cardBorderGradient.to, '{{var.accent}}');
        assert.equal(normGroup.imageGroup.cardBorderGradient.enabled, true);
        assert.equal(normGroup.imageGroup.avatarBorderGradient.enabled, true);
        assert.equal(normGroup.imageGroup.avatarBorderGlow.enabled, true);
        assert.equal(normGroup.imageGroup.avatarBorderAnimation.type, 'rainbow');
        assert.equal(normGroup.imageGroup.fields[0].slot, 'corner-tr');
        assert.equal(normGroup.imageGroup.fields[0].fontFamily, "'Oswald', sans-serif");
        assert.equal(normGroup.imageGroup.fields[0].fontSize, 18);
        assert.equal(normGroup.imageGroup.fields[0].padX, 10);
        assert.equal(normGroup.imageGroup.fields[0].padY, 4);
        assert.equal(normGroup.imageGroup.fields[0].bgColor, '@team_color');
        assert.equal(normGroup.imageGroup.fields[1].kind, 'image');
        assert.equal(normGroup.imageGroup.fields[1].slot, 'avatar-tl');
        assert.equal(normGroup.imageGroup.fields[1].customSrc, '/media-b.png');
        assert.equal(normGroup.imageGroup.fields[1].imgSize, 24);
        assert.equal(normGroup.imageGroup.fields[1].imgShape, 'circle');
        assert.equal(normGroup.imageGroup.fields[1].imgFit, 'contain');
        assert.equal(normGroup.imageGroup.fields[1].imgBorderW, 2);

        svc.setStylePresets(svc.normalizeStylePresets([{ id: 'p1', name: 'Studio Cyan', category: 'text', style: { borderStyle: 'corner-brackets', color: '#22d3ee' } }]));
        svc.saveStylePresets();
        const svcReloaded = overlays.createOverlayService({ dataDir: tmpOverlaysDir, broadcast: () => {} });
        assert.equal(svcReloaded.getStylePresets().length, 1);
        assert.equal(svcReloaded.getStylePresets()[0].name, 'Studio Cyan');
    } finally {
        await rm(tmpOverlaysDir, { recursive: true, force: true });
    }

    // Verify imageGroup onlySelected filtering never flashes unselected roster entries.
    const onlySelectedCheck = await page.evaluate(() => {
        const sh = window.OverlayShared;
        const container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '180px';
        document.body.appendChild(container);
        const roster = [
            { id: 'm1', label: 'Alpha', inGroup: true, values: { name: 'Alpha', img: '/assets/1.png' } },
            { id: 'm2', label: 'Bravo', inGroup: true, values: { name: 'Bravo', img: '/assets/2.png' } },
            { id: 'm3', label: 'Charlie', inGroup: true, values: { name: 'Charlie', img: '/assets/3.png' } }
        ];
        const baseEl = {
            id: 'ig-filter-check',
            type: 'image',
            width: 800,
            height: 180,
            imageGroup: { enabled: true, setId: 'squad', onlySelected: true, showLabels: true, fallbackMode: 'initials' },
            style: {}
        };
        sh.renderImageGroupStrip(container, baseEl, {
            customVars: [{ name: 'squad_group_members', type: 'text', value: JSON.stringify(roster.map(r => ({ id: r.id, label: r.label, text: r.label, values: r.values }))) }]
        });
        const beforeHydrateCount = container.querySelectorAll('.sp-image-group-item').length;

        sh.renderImageGroupStrip(container, baseEl, {
            variableSets: [{ id: 'squad', slotsCount: 2, slots: ['', ''], roster }]
        });
        const emptySlotsCount = container.querySelectorAll('.sp-image-group-item').length;

        sh.renderImageGroupStrip(container, baseEl, {
            variableSets: [{ id: 'squad', slotsCount: 0, activeEntry: 'm2', roster }]
        });
        const spotlightLabels = [...container.querySelectorAll('.sp-image-group-label')].map(n => n.textContent.trim());

        sh.renderImageGroupStrip(container, baseEl, {
            variableSets: [{ id: 'squad', slotsCount: 2, slots: ['m1', { entryId: 'm3' }], roster }]
        });
        const slotLabels = [...container.querySelectorAll('.sp-image-group-label')].map(n => n.textContent.trim());

        sh.cleanupNode?.(container);
        container.remove();
        return { beforeHydrateCount, emptySlotsCount, spotlightLabels, slotLabels };
    });
    assert.equal(onlySelectedCheck.beforeHydrateCount, 0);
    assert.equal(onlySelectedCheck.emptySlotsCount, 0);
    assert.deepEqual(onlySelectedCheck.spotlightLabels, ['Bravo']);
    assert.deepEqual(onlySelectedCheck.slotLabels, ['Alpha', 'Charlie']);

    // Verify Secondary Images, Avatar/Corner Icons, Padding, FontSize, and Variable Colors ({{var.*}} & @field)
    const builderAndColorsCheck = await page.evaluate(async () => {
        const sh = window.OverlayShared;
        const { state, prefs } = window.fixture;
        const canvasMod = await import('/js/editor/editor-canvas.js');
        prefs.live = true;
        state.liveStatus = {
            ...(state.liveStatus || {}),
            customVars: [{ name: 'accent_color', type: 'color', value: '#f43f5e' }],
            variableSets: [{
                id: 'squad',
                name: 'Squad',
                slotsCount: 0,
                fields: [
                    { key: 'name', type: 'text' },
                    { key: 'image', type: 'image' },
                    { key: 'team_color', type: 'color' },
                    { key: 'crest', type: 'image' }
                ],
                roster: [
                    { id: 'm1', label: 'Alpha', inGroup: true, values: { name: 'Alpha', image: '/media-a.png', team_color: '#22c55e', crest: '/media-b.png' } },
                    { id: 'm2', label: 'Bravo', inGroup: true, values: { name: 'Bravo', image: '/media-a.png', team_color: '#38bdf8', crest: '/media-b.png' } }
                ]
            }]
        };

        // 1. Color-filtered Placeholder Picker (replaces cluttered color swatches) & canvas applyNodeStyle
        const resolvedDirect = sh.resolveColorToken('{{var.accent_color}}', state.liveStatus, {});
        const boxEl = window.fixture.select('box', { id: 'var-color-box', style: { background: '{{var.accent_color}}' } });
        const styledNode = document.createElement('div');
        canvasMod.applyNodeStyle(styledNode, boxEl, 0);
        const liveCanvasBg = styledNode.style.backgroundColor || '';
        document.querySelector('[data-inspector-tab="style"]')?.click();
        const clutteredSwatchCount = document.querySelectorAll('.swatch-var-btn').length;
        const colorPickBtn = document.querySelector('[data-color-pick="style.background"]');
        let chipAppliedValue = '';
        let colorPickerColorOnly = false;
        if (colorPickBtn) {
            boxEl.style.background = '#000000';
            colorPickBtn.click();
            const spDlg = document.getElementById('sp-picker');
            const tokens = [...(spDlg?.querySelectorAll('#sp-list [data-token]') || [])].map(b => b.dataset.token);
            colorPickerColorOnly = Boolean(spDlg?.classList.contains('is-color-mode') && tokens.includes('var.accent_color') && !tokens.includes('stream.title'));
            spDlg?.querySelector('[data-token="var.accent_color"]')?.click();
            chipAppliedValue = boxEl.style.background;
        }

        // 2. Group Strip & Member Badge Builder: Secondary Images, Avatar Corners, Padding, FontSize & @team_color picker
        const grpEl = window.fixture.select('image', {
            id: 'ig-polish-check',
            imageGroup: {
                enabled: true,
                setId: 'squad',
                layout: 'cards',
                cardFrame: true,
                showAvatar: true,
                showLabels: false,
                cardPaddingX: 16,
                cardPaddingY: 12,
                cornerInset: 8,
                labelSize: 15,
                cardBorderColor: '@team_color',
                fields: [
                    { key: 'name', kind: 'text', role: 'title', slot: 'main', fontSize: 19, padX: 9, padY: 4, bgColor: '' }
                ]
            }
        });
        document.querySelector('[data-inspector-tab="content"]')?.click();
        document.querySelector('#open-ig-fields-modal')?.click();
        const dlg = document.getElementById('ig-fields-dialog');
        const hasMemberSelect = Boolean(dlg?.querySelector('#ig-preview-member option[value="m1"]'));
        dlg?.querySelector('#ig-add-image-btn')?.click();
        const hasImageCard = Boolean(dlg?.querySelector('.ig-field-row.is-img-card'));
        const noClutteredSelects = document.querySelectorAll('.ig-color-var-select').length === 0;
        const igVarBtn = dlg?.querySelector('[data-ig-var-pick="bgColor"]');
        let pickedMemberColor = false;
        if (igVarBtn) {
            igVarBtn.click();
            const spDlg = document.getElementById('sp-picker');
            const teamBtn = spDlg?.querySelector('[data-token="@team_color"]');
            pickedMemberColor = Boolean(teamBtn);
            teamBtn?.click();
        }
        const hasGroupColorSwatch = noClutteredSelects && pickedMemberColor && grpEl.imageGroup.fields[0].bgColor === '@team_color';

        // #ig-add-image-btn already placed `crest` at `corner-tl`; add a static secondary image on `avatar-tl` with customSrc
        grpEl.imageGroup.fields.push(
            { key: 'emblem', kind: 'image', customSrc: '/media-b.png', slot: 'avatar-tl', imgSize: 20, imgShape: 'circle', imgBorderW: 1 }
        );
        dlg?.close();

        const container = document.createElement('div');
        container.style.width = '760px';
        container.style.height = '220px';
        document.body.appendChild(container);
        sh.renderImageGroupStrip(container, grpEl, state.liveStatus);
        const cornerImgs = container.querySelectorAll('.sp-image-group-corner-tl .sp-image-group-img-field img').length;
        const avatarCornerImgs = container.querySelectorAll('.sp-image-group-avatar .sp-image-group-img-field img').length;
        const hiddenTextCount = container.querySelectorAll('.sp-image-group-field:not(.sp-image-group-img-field)').length;
        const cornerInsetTop = container.querySelector('.sp-image-group-corner-tl')?.style.top || '';
        const cardColors = [...container.querySelectorAll('.sp-image-group-card')].map(n => n.style.borderColor);
        grpEl.imageGroup.showLabels = true;
        sh.renderImageGroupStrip(container, grpEl, state.liveStatus);
        const badgeEl = container.querySelector('.sp-image-group-field:not(.sp-image-group-img-field)');
        const badgeStyle = badgeEl ? { fontSize: badgeEl.style.fontSize, paddingLeft: badgeEl.style.paddingLeft, paddingTop: badgeEl.style.paddingTop, bg: badgeEl.style.backgroundColor } : null;
        sh.cleanupNode?.(container);
        container.remove();

        return {
            resolvedDirect,
            liveCanvasBg,
            clutteredSwatchCount,
            hasVarChip: Boolean(colorPickBtn) && colorPickerColorOnly,
            chipAppliedValue,
            hasMemberSelect,
            hasImageCard,
            hasGroupColorSwatch,
            cornerImgs,
            avatarCornerImgs,
            hiddenTextCount,
            cornerInsetTop,
            cardColors,
            badgeStyle
        };
    });
    assert.equal(builderAndColorsCheck.resolvedDirect, '#f43f5e');
    assert.equal(builderAndColorsCheck.liveCanvasBg, 'rgb(244, 63, 94)');
    assert.equal(builderAndColorsCheck.clutteredSwatchCount, 0);
    assert.equal(builderAndColorsCheck.hasVarChip, true);
    assert.equal(builderAndColorsCheck.chipAppliedValue, '{{var.accent_color}}');
    assert.equal(builderAndColorsCheck.hasMemberSelect, true);
    assert.equal(builderAndColorsCheck.hasImageCard, true);
    assert.equal(builderAndColorsCheck.hasGroupColorSwatch, true);
    assert.equal(builderAndColorsCheck.cornerImgs, 2);
    assert.equal(builderAndColorsCheck.avatarCornerImgs, 2);
    assert.equal(builderAndColorsCheck.hiddenTextCount, 0);
    assert.equal(builderAndColorsCheck.cornerInsetTop, '8px');
    assert.deepEqual(builderAndColorsCheck.cardColors, ['rgb(34, 197, 94)', 'rgb(56, 189, 248)']);
    assert.equal(builderAndColorsCheck.badgeStyle?.fontSize, '19px');
    assert.equal(builderAndColorsCheck.badgeStyle?.paddingLeft, '9px');
    assert.equal(builderAndColorsCheck.badgeStyle?.paddingTop, '4px');
    assert.equal(builderAndColorsCheck.badgeStyle?.bg, 'rgb(34, 197, 94)');

    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('Inspector browser tests passed: all 19 types, conditional panels, narrow rails, persistence, focus, keyboard navigation and multi-selection.');
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
}
