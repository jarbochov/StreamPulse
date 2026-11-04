import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import overlays from '../server/services/overlays.js';

const names = ['overlay-shared.js', 'poll-widget.js', 'editor-geometry.js', 'motion-easing.js',
    ...['state', 'canvas', 'form', 'layers', 'inspector'].map(name => `editor/editor-${name}.js`)];
const sources = new Map(await Promise.all(names.map(async name =>
    [`/js/${name}`, await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')])));
const css = await readFile(new URL('../public/css/custom-overlay-editor.css', import.meta.url), 'utf8');
for (const name of ['overlay-retro.js', 'overlay-filters.js']) {
    const source = await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
    sources.set(`/${name}`, source);
    sources.set(`/js/${name}`, source);
}
const unexpected = [];
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://fixture.local').pathname;
    if (sources.has(path)) {
        res.setHeader('Content-Type', 'text/javascript'); res.end(sources.get(path));
    } else if (path === '/editor.css') {
        res.setHeader('Content-Type', 'text/css'); res.end(css);
    } else if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><link rel="stylesheet" href="/editor.css"><style>
            :root{--bg-inset:#10141b;--bg-card:#181e28;--bg-raised:#232d3c;--text:#edf2f8;
            --text-muted:#94a3b8;--border:#354155;--accent:#38bdf8;--accent-strong:#0284c7}
            .rail.right{width:344px;height:700px;position:absolute;right:0;top:0}
            #canvas{width:640px;height:360px}
            </style><div id="stage"><div id="canvas"><div id="canvas-underlayer"></div>
            <div id="canvas-toplayer"></div></div><div id="ui"></div></div>
            <aside class="rail right"><div id="properties"></div></aside>`);
    } else if (path === '/api/alerts') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"rules":[{"id":"fictional-brb","name":"BRB in 5 minutes"},{"id":"fictional-follow","name":"Follow"}]}');
    } else if (path === '/favicon.ico') { res.writeHead(204); res.end(); }
    else { unexpected.push(`${req.method} ${path}`); res.writeHead(404); res.end(); }
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
        for (const name of names.slice(0, 2)) await page.addScriptTag({ url: `${origin}/js/${name}` });
        await page.addScriptTag({ url: `${origin}/js/motion-easing.js` });
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
    const locations = {
        text: { content: 'content', typography: 'style' },
        'random-text': { content: 'content', behavior: 'content', typography: 'style' },
        markdown: { content: 'content', typography: 'style' },
        image: { content: 'content', fill: 'style' },
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
        pattern: { content: 'content', patternLayout: 'layout', patternMotion: 'style' },
        'procedural-pattern': { content: 'content', proceduralMotion: 'style' }
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
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('Inspector browser tests passed: all 17 types, conditional panels, narrow rails, persistence, focus, keyboard navigation and multi-selection.');
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
}
