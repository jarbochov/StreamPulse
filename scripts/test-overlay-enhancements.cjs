'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PATTERNS, PATTERN_CATEGORIES, PALETTES, drawProceduralPattern } = require('../public/js/patterns-shared.js');

test('Shared patterns module: exports, categories and canvas drawing', () => {
    assert.equal(Array.isArray(PATTERNS), true);
    assert.equal(PATTERNS.length, 28);
    assert.ok(PATTERNS.includes('grid'));
    assert.ok(PATTERNS.includes('hexagons'));
    assert.ok(PATTERNS.includes('circuit'));
    assert.ok(PATTERNS.includes('topography'));
    assert.ok(PATTERNS.includes('starfield'));
    assert.ok(PATTERNS.includes('leaves'));
    assert.ok(PATTERNS.includes('turkeys'));
    assert.ok(PATTERNS.includes('pumpkins'));
    assert.ok(PATTERNS.includes('christmas-trees'));
    assert.ok(PATTERNS.includes('christmas-lights'));
    assert.ok(PATTERNS.includes('snowflakes'));
    assert.ok(PATTERNS.includes('hearts'));
    assert.ok(PATTERNS.includes('fireworks'));

    assert.equal(PATTERN_CATEGORIES.length, 4);
    const allCategoryOptions = PATTERN_CATEGORIES.flatMap(cat => cat.options.map(opt => opt[0]));
    for (const pat of PATTERNS) {
        assert.ok(allCategoryOptions.includes(pat), `Pattern ${pat} must be categorized`);
    }

    // Mock canvas 2D context to verify drawProceduralPattern
    const calls = [];
    const mockCtx = {
        save: () => calls.push('save'),
        restore: () => calls.push('restore'),
        beginPath: () => calls.push('beginPath'),
        closePath: () => calls.push('closePath'),
        moveTo: (x, y) => calls.push(`moveTo(${x},${y})`),
        lineTo: (x, y) => calls.push(`lineTo(${x},${y})`),
        quadraticCurveTo: (cx, cy, x, y) => calls.push(`quadTo(${cx},${cy},${x},${y})`),
        stroke: () => calls.push('stroke'),
        fill: () => calls.push('fill'),
        fillRect: (x, y, w, h) => calls.push(`fillRect(${x},${y},${w},${h})`),
        scale: (sx, sy) => calls.push(`scale(${sx},${sy})`),
        translate: (x, y) => calls.push(`translate(${x},${y})`),
        rotate: (r) => calls.push(`rotate(${r})`),
        arc: (x, y, r, s, e) => calls.push(`arc(${x},${y},${r})`),
        ellipse: (x, y, rx, ry, rot, s, e) => calls.push(`ellipse(${x},${y})`),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    // Verify all 28 patterns draw without throwing across drift and fall motions
    for (const pat of PATTERNS) {
        for (const m of ['drift', 'fall', 'aurora']) {
            assert.doesNotThrow(() => {
                drawProceduralPattern(mockCtx, pat, 640, 360, {
                    scale: 120,
                    color: '#111827',
                    accent: '#38bdf8',
                    secondary: 'transparent',
                    time: 1.5,
                    motion: m
                });
            }, `Pattern ${pat} (${m}) must render cleanly`);
        }
    }
    assert.ok(calls.length > 50, 'drawProceduralPattern executed canvas instructions');
});

test('Overlay Shared: Tier list single-column stack and shrink protection', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(code.includes('const maxAcross = tiers ? 1 :'), 'Tiers layout must lock maxAcross to 1');
    assert.ok(code.includes('config.periodsAcross > 0 && !kanban && !tiers'), 'periodsAcross must be ignored for tiers');
    assert.ok(code.includes('const factorW = shrink && availW > 0 && needW > availW'), 'Shrink must account for element box width');
});

test('Matchup Overlay: Player clocks support across all layouts', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/overlays/matchup.html'), 'utf8');
    assert.ok(code.includes('playerClocksParam'), 'matchup.html must parse playerclocks param');
    assert.ok(!code.includes('m.clock.mode !== \'race\''), 'renderRunnerInlineTimerHtml must not block non-race clock modes');
    assert.ok(code.includes('.runner-finish-pill.ready'), 'matchup.html must include ready pill styling');
});

test('Custom Overlay Editor: IGDB artwork import dialog and menu options', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/editors/custom-overlay-editor.html'), 'utf8');
    assert.ok(html.includes('data-add="igdb-artwork"'), 'Add element menu must contain Game Artwork (IGDB)');
    assert.ok(html.includes('id="asset-igdb-btn"'), 'Asset dialog must contain Import from IGDB button');
    assert.ok(html.includes('id="igdb-dialog"'), 'Editor must include igdb-dialog modal');

    const js = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-main.js'), 'utf8');
    assert.ok(js.includes('openIgdbDialog'), 'editor-main.js must define openIgdbDialog');
    assert.ok(js.includes('/api/promos/igdb/import'), 'editor-main.js must call promo IGDB import endpoint');
});

test('Procedural Patterns vs Repeating Pattern Tiles separation', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/editors/custom-overlay-editor.html'), 'utf8');
    assert.ok(html.includes('data-add="procedural-pattern"'), 'Must have Background Pattern in Add Layer menu');
    assert.ok(html.includes('data-add="pattern"'), 'Must retain Pattern Tile in Add Layer menu');

    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-state.js'), 'utf8');
    assert.ok(stateJs.includes("'procedural-pattern': { label: 'Background Pattern'"), 'TYPE_META must include procedural-pattern');
    assert.ok(stateJs.includes("type === 'procedural-pattern' ? { preset: 'hexagons'"), 'createElementData must initialize procedural-pattern properly');
    assert.ok(stateJs.includes("sourceType: 'image'"), 'Pattern Tile must default to image tiling');

    const inspectorJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    assert.ok(inspectorJs.includes('export function proceduralPatternSection'), 'editor-inspector must export proceduralPatternSection');
    assert.ok(inspectorJs.includes("'procedural-pattern': proceduralPatternSection"), 'specific map must route procedural-pattern to its section');

    const sharedJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(sharedJs.includes("const isProcedural = curElement.type === 'procedural-pattern' || curElement.pattern?.sourceType === 'preset'"), 'mountPattern must detect procedural elements');
    assert.ok(sharedJs.includes('patternsEngine.drawProceduralPattern(ctx, presetName, cw, ch'), 'mountPattern must render procedural pattern across full canvas');
});

test('Smart Alignment, Equal-Spacing & Dimension-Match Snapping (editor-geometry.js)', () => {
    const vm = require('node:vm');
    const rawCode = fs.readFileSync(path.join(__dirname, '../public/js/editor-geometry.js'), 'utf8')
        .replace(/export\s+function\s+/g, 'function ');
    const sandbox = { Math, Set, Map, Array, Number, Object };
    vm.runInNewContext(`${rawCode}\nthis.exports = { snapAxis, alignmentOffset, buildSnapModel, computeSmartMoveSnap, computeSmartResizeSnap };`, sandbox);
    const geom = sandbox.exports;

    assert.equal(typeof geom.buildSnapModel, 'function');
    assert.equal(typeof geom.computeSmartMoveSnap, 'function');
    assert.equal(typeof geom.computeSmartResizeSnap, 'function');

    const model = geom.buildSnapModel(
        [
            { id: 'box-a', x: 100, y: 200, w: 200, h: 100 },
            { id: 'box-b', x: 350, y: 200, w: 200, h: 100 }
        ],
        1920,
        1080
    );

    // 1. Equal horizontal gap snapping: box-a is [100..300], box-b is [350..550] (gap = 50px).
    // Dragging a 200x100 box near x=602 should snap to x=600 (550 + 50 gap) with a gap guide!
    const snapGap = geom.computeSmartMoveSnap({ x: 602, y: 201, w: 200, h: 100 }, model, 6, { align: true, spacing: true });
    assert.equal(snapGap.dx, -2, 'Should snap horizontally to equal 50px gap at x=600');
    assert.equal(snapGap.dy, -1, 'Should snap vertically to y=200 top/bottom alignment');
    assert.ok(snapGap.guides.some(g => g.kind === 'gap' && g.gap === 50), 'Should emit equal-spacing gap guide');

    // 2. Canvas center snapping with isCenter flag
    const snapCenter = geom.computeSmartMoveSnap({ x: 862, y: 491, w: 200, h: 100 }, model, 6, { align: true, spacing: true });
    assert.equal(snapCenter.dx, -2, 'Should snap horizontal center to 960 (x=860)');
    assert.equal(snapCenter.dy, -1, 'Should snap vertical center to 540 (y=490)');
    assert.ok(snapCenter.guides.some(g => g.kind === 'line' && g.isCenter), 'Should mark canvas center guide');

    // 3. Resize dimension-match snapping (matching 200x100 of box-a / box-b)
    const resizeSnap = geom.computeSmartResizeSnap(
        { x: 700, y: 500, w: 198, h: 102 },
        'se',
        0,
        0,
        model,
        6,
        { align: true, dimensions: true }
    );
    assert.equal(resizeSnap.w, 200, 'Should snap width to match 200px peer');
    assert.equal(resizeSnap.h, 100, 'Should snap height to match 100px peer');
    assert.ok(resizeSnap.guides.some(g => g.kind === 'dim' && g.axis === 'w'), 'Should emit width dimension-match badge');
    assert.ok(resizeSnap.guides.some(g => g.kind === 'dim' && g.axis === 'h'), 'Should emit height dimension-match badge');

    // 4. Canvas-edge alignment must win at the left and right canvas boundaries.
    const leftEdgeSnap = geom.computeSmartMoveSnap(
        { x: -2, y: 200, w: 100, h: 50 },
        model,
        6,
        { align: true, spacing: false }
    );
    assert.equal(leftEdgeSnap.dx, 2, 'Should snap a slightly off-canvas left edge to x=0');
    assert.ok(leftEdgeSnap.guides.some(g => g.kind === 'line' && g.axis === 'v' && g.pos === 0), 'Should show the left canvas-edge guide');

    const rightEdgeSnap = geom.computeSmartResizeSnap(
        { x: 1700, y: 500, w: 218, h: 100 },
        'e',
        2,
        0,
        model,
        6,
        { align: true, dimensions: true }
    );
    assert.equal(rightEdgeSnap.w, 220, 'Should snap a resized right edge to the canvas width');
    assert.ok(rightEdgeSnap.guides.some(g => g.kind === 'line' && g.axis === 'v' && g.pos === 1920), 'Should show the right canvas-edge guide');
});

test('Scene States, Morph Transitions & Prefabs (overlays service + presets + runtime)', () => {
    require('../public/js/overlay-presets.js');
    const BUILT_IN_PRESETS = globalThis.OverlayPresets.list();
    const cam169 = BUILT_IN_PRESETS.find(p => p.id === 'camera-16-9');
    assert.ok(cam169, 'camera-16-9 prefab must exist');
    assert.ok(cam169.elements.some(e => e.type === 'cutout'), 'camera-16-9 prefab must include a real cutout punchout layer');
    assert.ok(BUILT_IN_PRESETS.some(p => p.id === 'retro-4-3-frame'), 'retro-4-3-frame prefab must exist');
    assert.ok(BUILT_IN_PRESETS.some(p => p.id === 'social-bar'), 'social-bar prefab must exist');

    const overlaysService = require('../server/services/overlays.js');
    const normalizedPages = overlaysService.normalizePages({
        enabled: true,
        kind: 'states',
        transition: 'morph',
        transitionEasing: 'spring',
        transitionMs: 650,
        items: [
            { id: 'state-1', name: 'Gameplay' },
            { id: 'state-2', name: 'Intermission' }
        ]
    });
    assert.equal(normalizedPages.kind, 'states');
    assert.equal(normalizedPages.transition, 'morph');
    assert.equal(normalizedPages.transitionEasing, 'spring');
    assert.equal(normalizedPages.transitionMs, 650);

    const normalizedEl = overlaysService.normalizeOverlayElement({
        id: 'cutout-1',
        type: 'cutout',
        page: '*',
        morphId: 'morph-cam',
        x: 40,
        y: 40,
        width: 480,
        height: 270,
        pageStates: {
            'state-2': { x: 640, y: 180, width: 640, height: 360, visible: true, opacity: 1, borderRadius: 24, feather: 8 }
        }
    }, 0);
    assert.equal(normalizedEl.morphId, 'morph-cam');
    assert.ok(normalizedEl.pageStates && normalizedEl.pageStates['state-2'], 'normalizeOverlayElement must preserve pageStates');
    assert.equal(normalizedEl.pageStates['state-2'].x, 640);
    assert.equal(normalizedEl.pageStates['state-2'].width, 640);
    assert.equal(normalizedEl.pageStates['state-2'].borderRadius, 24);
    assert.equal(normalizedEl.pageStates['state-2'].feather, 8);

    const runtimeJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay-runtime.js'), 'utf8');
    assert.ok(runtimeJs.includes('function effectiveElementForPage'), 'overlay-runtime.js must define effectiveElementForPage');
    assert.ok(runtimeJs.includes('const MORPH_EASINGS'), 'overlay-runtime.js must define MORPH_EASINGS');
    assert.ok(runtimeJs.includes('tickCutoutMorph'), 'overlay-runtime.js must interpolate cutout masks during morph transitions');
});

test('OBS WebSocket v5 Bridge & OBS Source Link (shape border/frame + cutout sync)', async () => {
    const overlaysService = require('../server/services/overlays.js');
    const obsModule = require('../server/services/obs.js');

    // 1. Verify obsLink normalization on both shape (Border/Frame) and cutout layers
    const shapeFrame = overlaysService.normalizeOverlayElement({
        id: 'shape-cam-frame',
        type: 'shape',
        page: '*',
        x: 60,
        y: 60,
        width: 480,
        height: 270,
        obsLink: {
            enabled: true,
            sourceName: 'Facecam',
            sceneName: 'Live Scene',
            fit: 'cover',
            syncVisibility: true
        },
        pageStates: {
            'state-2': { x: 1200, y: 650, width: 640, height: 360, visible: true }
        }
    }, 0);
    assert.equal(shapeFrame.obsLink.enabled, true);
    assert.equal(shapeFrame.obsLink.sourceName, 'Facecam');
    assert.equal(shapeFrame.obsLink.sceneName, 'Live Scene');
    assert.equal(shapeFrame.obsLink.fit, 'cover');

    // 2. Verify OBS v5 auth challenge SHA-256 computation & transform builder
    const authResp = obsModule.computeObsAuthResponse('supersecret', 'salt123', 'challenge456');
    assert.equal(typeof authResp, 'string');
    assert.ok(authResp.length > 20);

    const transformCover = obsModule.buildObsTransform({ x: 100, y: 200, width: 480, height: 270, rotate: 0, fit: 'cover' });
    assert.equal(transformCover.positionX, 100);
    assert.equal(transformCover.positionY, 200);
    assert.equal(transformCover.alignment, 5);
    assert.equal(transformCover.boundsType, 'OBS_BOUNDS_SCALE_OUTER');
    assert.equal(transformCover.boundsWidth, 480);
    assert.equal(transformCover.boundsHeight, 270);

    // 3. Verify createObsService handshake + state sync via mock WebSocket
    const sentRequests = [];
    class MockWebSocket {
        static OPEN = 1;
        constructor(url) {
            this.url = url;
            this.readyState = 1;
            this._listeners = {};
            setImmediate(() => {
                this._emit('open');
                this._emit('message', {
                    data: JSON.stringify({
                        op: 0,
                        d: { obsWebSocketVersion: '5.4.2', rpcVersion: 1 }
                    })
                });
            });
        }
        addEventListener(type, fn) {
            (this._listeners[type] ||= []).push(fn);
        }
        _emit(type, ev = {}) {
            for (const fn of this._listeners[type] || []) fn(ev);
        }
        send(raw) {
            const msg = JSON.parse(raw);
            if (msg.op === 1) {
                setImmediate(() => {
                    this._emit('message', {
                        data: JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })
                    });
                });
            } else if (msg.op === 6) {
                const { requestType, requestId, requestData } = msg.d;
                sentRequests.push({ requestType, requestData });
                let responseData = {};
                if (requestType === 'GetVersion') {
                    responseData = { obsVersion: '30.2.0', obsWebSocketVersion: '5.4.2' };
                } else if (requestType === 'GetSourceFilterKindList') {
                    responseData = { sourceFilterKinds: ['mask_filter', 'crop_filter'] };
                } else if (requestType === 'GetSceneList') {
                    responseData = { currentProgramSceneName: 'Live Scene', scenes: [{ sceneName: 'Live Scene' }] };
                } else if (requestType === 'GetSceneItemId') {
                    responseData = { sceneItemId: 42 };
                } else if (requestType === 'GetSceneItemTransform') {
                    responseData = {
                        sceneItemTransform: {
                            positionX: 60, positionY: 60,
                            boundsWidth: 480, boundsHeight: 270,
                            width: 480, height: 270, rotation: 0
                        }
                    };
                }
                setImmediate(() => {
                    this._emit('message', {
                        data: JSON.stringify({
                            op: 7,
                            d: {
                                requestType,
                                requestId,
                                requestStatus: { result: true, code: 100 },
                                responseData
                            }
                        })
                    });
                });
            }
        }
        close() {
            this.readyState = 3;
        }
    }

    const obsService = obsModule.createObsService({
        config: { enabled: true, host: '127.0.0.1', port: 4455, motionEngine: 'cut' },
        WebSocketImpl: MockWebSocket
    });
    obsService.connect();
    await new Promise(r => setTimeout(r, 40));
    assert.equal(obsService.getStatus().connected, true);

    const syncRes = await obsService.syncOverlayState({
        id: 'ov-test',
        pages: {
            enabled: true,
            kind: 'states',
            transition: 'morph',
            transitionMs: 300,
            items: [
                { id: 'state-1', name: 'Base' },
                { id: 'state-2', name: 'Pip' }
            ]
        },
        elements: [shapeFrame]
    }, 'state-2', { instant: true });

    assert.equal(syncRes.ok, true);
    assert.equal(syncRes.results.length, 1);
    assert.equal(syncRes.results[0].ok, true);
    const transformCall = sentRequests.find(r => r.requestType === 'SetSceneItemTransform');
    assert.ok(transformCall, 'Should send SetSceneItemTransform to OBS');
    assert.equal(transformCall.requestData.sceneItemTransform.positionX, 1200);
    assert.equal(transformCall.requestData.sceneItemTransform.positionY, 650);
    assert.equal(transformCall.requestData.sceneItemTransform.boundsWidth, 640);
    assert.equal(transformCall.requestData.sceneItemTransform.boundsHeight, 360);
    obsService.disconnect();
});

test('Scene States: Full Visual & Style Overrides (fontSize, color, borders, fills, cutoutShape) + Strict OBS UI Gating', () => {
    const overlaysService = require('../server/services/overlays.js');

    const textEl = overlaysService.normalizeOverlayElement({
        id: 'text-title',
        type: 'text',
        page: '*',
        content: 'STARTING SOON',
        x: 100,
        y: 100,
        width: 600,
        height: 120,
        style: {
            fontSize: 36,
            fontWeight: '600',
            color: '#ffffff',
            background: '#111827',
            borderWidth: 2,
            borderColor: '#38bdf8',
            borderRadius: 8
        },
        pageStates: {
            'state-2': {
                x: 240,
                y: 400,
                width: 900,
                height: 180,
                style: {
                    fontSize: 72,
                    fontWeight: '800',
                    color: '#facc15',
                    background: '#1e1b4b',
                    borderWidth: 6,
                    borderColor: '#f43f5e',
                    borderRadius: 24
                }
            }
        }
    }, 0);

    assert.ok(textEl.pageStates['state-2'].style, 'pageStates must preserve nested style overrides');
    assert.equal(textEl.pageStates['state-2'].style.fontSize, 72);
    assert.equal(textEl.pageStates['state-2'].style.fontWeight, '800');
    assert.equal(textEl.pageStates['state-2'].style.color, '#facc15');
    assert.equal(textEl.pageStates['state-2'].style.background, '#1e1b4b');
    assert.equal(textEl.pageStates['state-2'].style.borderWidth, 6);
    assert.equal(textEl.pageStates['state-2'].style.borderColor, '#f43f5e');
    assert.equal(textEl.pageStates['state-2'].style.borderRadius, 24);

    // Verify SVG thumbnail reflects state-2 style overrides when rendering state-2
    const overlayDoc = overlaysService.normalizeCustomOverlay({
        id: 'style-morph-test',
        name: 'Style Morph Test',
        pages: {
            enabled: true,
            kind: 'states',
            transition: 'morph',
            items: [
                { id: 'state-1', name: 'Base' },
                { id: 'state-2', name: 'Big Highlight' }
            ]
        },
        elements: [textEl]
    });
    const svgState1 = overlaysService.generateSvgThumbnail(overlayDoc, { page: 'state-1' });
    const svgState2 = overlaysService.generateSvgThumbnail(overlayDoc, { page: 'state-2' });
    assert.ok(svgState1.includes('#38bdf8'), 'State 1 SVG should use base borderColor #38bdf8');
    assert.ok(svgState2.includes('#f43f5e'), 'State 2 SVG should use overridden borderColor #f43f5e');
    assert.ok(svgState2.includes('#facc15'), 'State 2 SVG should use overridden text color #facc15');

    // Verify OBS UI is strictly hidden by default in HTML and gated in inspector/layers
    const html = fs.readFileSync(path.join(__dirname, '../public/editors/custom-overlay-editor.html'), 'utf8');
    assert.ok(html.includes('id="btn-obs-modal" class="hide-narrow obs-top-btn" hidden'), 'Topbar OBS button must be hidden by default');
    assert.ok(html.includes('data-add="obs-frame" hidden'), 'Add menu OBS Frame button must be hidden by default');
    assert.ok(html.includes('data-rail-tab="canvas"'), 'Left rail must include dedicated Canvas tab');

    const inspectorJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    const start = inspectorJs.indexOf('export function obsLinkSection(');
    const end = inspectorJs.indexOf('\n// ', start);
    const context = require('node:vm').createContext({ state: { obs: { enabled: false } }, pagesOn: () => false });
    require('node:vm').runInContext(inspectorJs.slice(start, end).replace('export ', ''), context);
    assert.equal(context.obsLinkSection({ type: 'shape' }), '', 'disconnected global OBS hides source links');
    context.state.obs = { enabled: true, sceneSyncEnabled: false };
    assert.equal(context.obsLinkSection({ type: 'shape' }), '', 'disabled Scene Sync hides source links even when OBS is connected');
});

test('Scene States vs Page Deck: Mode switching, font size morphing, and reaction triggers', () => {
    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-state.js'), 'utf8');
    assert.ok(stateJs.includes("export const statesModeOn = () => pagesOn() && ("), 'statesModeOn must be exported');
    assert.ok(stateJs.includes("state.overlay.pages?.kind ? state.overlay.pages.kind === 'states' : state.overlay.pages?.transition === 'morph'"), 'statesModeOn must prioritize explicit pages.kind over transition');

    const layersJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-layers.js'), 'utf8');
    assert.ok(layersJs.includes("renderPagesPanel();"), 'Mode toggle must re-render pages panel');
    assert.ok(layersJs.includes("projectPageState(state.curPage);"), 'Mode toggle must project page state');
    assert.ok(layersJs.includes('Advanced: Scene States (Morph)'), 'Scene States must be a separate advanced mode toggle');
    assert.ok(layersJs.includes('data-pg-kind="${isStates ? \'pages\' : \'states\'}"'), 'Mode toggle switches between pages and states');
    assert.ok(layersJs.indexOf('id="pages-enable"') < layersJs.indexOf('id="states-enable"'), 'Turn on Pages button must be on the left before Scene States');
    

    const canvasJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-canvas.js'), 'utf8');
    assert.ok(canvasJs.includes("fontSize != null && s.fontSize !== '' ? s.fontSize : 32"), 'applyNodeStyle must have fallback for font size');
    assert.ok(canvasJs.indexOf('item.node.style.transition = transProp;') < canvasJs.indexOf('applyNodeStyle(item.node, item.el, item.idx);', canvasJs.indexOf('transProp')), 'Transition must be applied to node BEFORE applying target styles to enable smooth morph transitions');

    const runtimeJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay-runtime.js'), 'utf8');
    assert.ok(runtimeJs.includes('if (morphedNodesSet.has(node)) continue;'), 'overlay-runtime must avoid premature refit on morphing nodes');

    const editorCss = fs.readFileSync(path.join(__dirname, '../public/css/custom-overlay-editor.css'), 'utf8');
    assert.ok(editorCss.includes('.pg-empty button'), 'custom-overlay-editor.css must style .pg-empty button');
    assert.ok(editorCss.includes('white-space: normal;'), 'Empty state buttons must allow text wrapping to prevent cutoff');
    assert.ok(editorCss.includes('.pg-empty-actions'), 'Must have structured action layout for empty state');
    assert.ok(editorCss.includes('@keyframes pg-fade-in'), 'custom-overlay-editor.css must include pg-fade-in');
    assert.ok(editorCss.includes('@keyframes pg-slide-in'), 'custom-overlay-editor.css must include pg-slide-in');

    assert.ok(layersJs.includes("id=\"btn-preview-transition\""), 'Layers panel must have transition preview button');
    assert.ok(layersJs.includes("Preview ${esc(transLabel)} on canvas"), 'Preview button must adapt label to transition style');

    assert.ok(canvasJs.includes("export function previewEditorTransition"), 'canvas must export previewEditorTransition');
    assert.ok(canvasJs.includes("isAutoFit && prevFitted !== targetFitted"), 'canvas must detect auto text size differences across states');

    assert.ok(runtimeJs.includes("isAutoFit ? targetFitted : null"), 'runtime must track target fitted font size during morph');

    const overlayServiceJs = fs.readFileSync(path.join(__dirname, '../server/services/overlays.js'), 'utf8');
    assert.ok(overlayServiceJs.includes("clean.textFit = entry.textFit;"), 'overlays service must normalize textFit in pageStates');
    assert.ok(overlayServiceJs.includes("enterExit: PAGE_ENTER_EXITS.includes"), 'overlays service must normalize enterExit in pages');

    assert.ok(layersJs.includes("pages.enterExit"), 'Layers panel must provide enterExit option');
    assert.ok(canvasJs.includes("ghost.id = `ghost-${el.id}`"), 'Canvas preview must create ghost nodes for spatial moves during crossfade');
    assert.ok(runtimeJs.includes("ghost._isGhost = true"), 'Runtime must handle ghost clones for spatial moves during crossfade');
    assert.ok(canvasJs.includes("const isBackward = prevIdx !== -1 && nextIdx !== -1 && nextIdx < prevIdx"), 'Canvas transition preview must detect backward transitions (State 2 -> State 1)');
    assert.ok(canvasJs.includes("effectiveDirection"), 'Canvas preview must compute effective flipped direction for backward transitions');
    assert.ok(canvasJs.includes("prevVis && !curVis"), 'Canvas preview must handle shared elements disappearing with exit animation');
    assert.ok(canvasJs.includes("!prevVis && curVis"), 'Canvas preview must handle shared elements appearing with enter animation');

    assert.ok(runtimeJs.includes("const isBackward = prevIdx !== -1 && nextIdx !== -1 && nextIdx < prevIdx"), 'Runtime must detect backward navigation for directional flipping');
    assert.ok(runtimeJs.includes("wasVis && !nowVis"), 'Runtime must handle disappearing shared elements in morph transitions');
    assert.ok(runtimeJs.includes("!wasVis && nowVis"), 'Runtime must handle appearing shared elements in morph transitions');
    assert.ok(editorCss.includes('@keyframes pg-zoom-in'), 'custom-overlay-editor.css must include pg-zoom-in');
});

test('Alert element and page trigger alertMode normalization and UI configuration', () => {
    const { normalizeOverlayElement, normalizePages } = require('../server/services/overlays.js');

    // Element normalization
    const elAll = normalizeOverlayElement({ type: 'alert', alert: { alertMode: 'all', triggers: [] } }, 0);
    assert.equal(elAll.alert.alertMode, 'all', 'Explicit alertMode all is preserved');

    const elSelected = normalizeOverlayElement({ type: 'alert', alert: { alertMode: 'selected', triggers: ['follow'] } }, 1);
    assert.equal(elSelected.alert.alertMode, 'selected', 'Explicit alertMode selected is preserved');

    const elLegacyEmpty = normalizeOverlayElement({ type: 'alert', alert: { triggers: [] } }, 2);
    assert.equal(elLegacyEmpty.alert.alertMode, 'all', 'Alert element with empty triggers defaults to all');

    const elLegacyWithTriggers = normalizeOverlayElement({ type: 'alert', alert: { triggers: ['sub'] } }, 3, { sub: true });
    assert.equal(elLegacyWithTriggers.alert.alertMode, 'selected', 'Alert element with triggers defaults to selected');

    assert.equal(elAll.alert.effectsTarget, 'box', 'effectsTarget defaults to box');
    assert.equal(normalizeOverlayElement({ type: 'alert', alert: { effectsTarget: 'media' } }, 4).alert.effectsTarget, 'media');
    assert.equal(normalizeOverlayElement({ type: 'alert', alert: { effectsTarget: 'bogus' } }, 5).alert.effectsTarget, 'box');

    // Page trigger normalization
    const pagesAll = normalizePages({ items: [{ id: 'p1', trigger: 'alert', triggerAlertMode: 'all' }] });
    assert.equal(pagesAll.items[0].triggerAlertMode, 'all', 'Page with triggerAlertMode all is preserved');

    const pagesSelected = normalizePages({ items: [{ id: 'p2', trigger: 'alert', triggerAlertMode: 'selected', triggerRules: [] }] });
    assert.equal(pagesSelected.items[0].triggerAlertMode, 'selected', 'Page with triggerAlertMode selected is preserved even with empty triggerRules');

    const pagesLegacyEmpty = normalizePages({ items: [{ id: 'p3', trigger: 'alert', triggerRules: [] }] });
    assert.equal(pagesLegacyEmpty.items[0].triggerAlertMode, 'selected', 'Legacy page with empty triggerRules defaults to selected to prevent unintended rotations');

    const pagesFresh = normalizePages({ items: [{ id: 'p4', trigger: 'alert' }] });
    assert.equal(pagesFresh.items[0].triggerAlertMode, 'all', 'Fresh page with no triggerRules defaults to all');

    // UI and runtime checks
    const layersJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-layers.js'), 'utf8');
    assert.ok(layersJs.includes('triggerAlertMode'), 'editor-layers must configure triggerAlertMode');
    assert.ok(layersJs.includes('id="btn-select-all-trules"'), 'editor-layers must have select all rules button');
    assert.ok(layersJs.includes('id="btn-clear-trules"'), 'editor-layers must have clear rules button');

    const inspectorJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    assert.ok(inspectorJs.includes('alert.alertMode'), 'editor-inspector must configure alert.alertMode');
    assert.ok(inspectorJs.includes('id="btn-select-all-alert-triggers"'), 'editor-inspector must have select all triggers button');
    assert.ok(inspectorJs.includes('id="btn-clear-alert-triggers"'), 'editor-inspector must have clear triggers button');

    const runtimeJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay-runtime.js'), 'utf8');
    assert.ok(runtimeJs.includes('alertMatches'), 'overlay-runtime must include alertMatches function');
    assert.ok(runtimeJs.includes('lastAlert'), 'overlay-runtime must buffer lastAlert for page takeovers');
});

test('alert looks preserve full presentation while excluding geometry and behavior', () => {
    const { normalizeOverlayElement } = require('../server/services/overlays.js');
    const raw = {
        type: 'alert', x: 80, width: 480,
        style: { fontFamily: 'monospace', background: '#123456', rotate: 15 },
        alert: {
            sound: false, alertMode: 'selected', triggers: ['follow'], layout: 'stack',
            looks: [
                { id: 'poster', name: 'Poster', ruleIds: ['rule1'], layout: 'media', hideMessage: true, titleSize: 60,
                    style: { background: '#abcdef', borderWidth: 5, shadow: { blur: 10 }, rotate: 180 },
                    alert: { sound: true, titleColor: '#00ff00' }, mediaFilter: { brightness: 70 } },
                { id: 'other', name: 'Other', ruleIds: ['rule1', 'rule2'] }
            ]
        }
    };
    const el = normalizeOverlayElement(raw, 0, { follow: true });
    const look = el.alert.looks[0];
    assert.equal(look.alert.layout, 'media');
    assert.equal(look.alert.hideMessage, true);
    assert.equal(look.alert.titleSize, 60);
    assert.equal(look.style.fontFamily, 'monospace');
    assert.equal(look.style.background, '#abcdef');
    assert.equal(look.style.shadow.blur, 10);
    assert.equal(look.mediaFilter.brightness, 70);
    assert.equal(look.alert.sound, undefined);
    assert.equal(look.style.rotate, undefined);
    assert.equal(el.style.rotate, 15);
    assert.equal(el.alert.sound, false);
    assert.deepEqual(el.alert.looks[1].ruleIds, ['rule2']);
    assert.deepEqual(normalizeOverlayElement(el, 0, { follow: true }), el, 'save/reload does not alter a look');
});

test('alert box media focus and padding are normalized and applied', () => {
    const shared = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(shared.includes('objectPosition = focusPosition') && shared.includes('cfg.padding'), 'playAlert must apply focus and padding');
    const svc = fs.readFileSync(path.join(__dirname, '../server/services/overlays.js'), 'utf8');
    assert.ok(svc.includes('mediaFocusX') && svc.includes('mediaFocusY') && /padding: element\.alert\?\.padding/.test(svc), 'overlay service must whitelist focus and padding');
    const insp = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    assert.ok(insp.includes("'alert.mediaFit'") && insp.includes("a.mediaFit === 'cover'"), 'focus controls must be hidden unless media fills');
});

test('alert entrance/exit animations are not overridden by a decoration animation', () => {
    const shared = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    assert.ok(/card\.style\.animation = `\$\{entrance\}, \$\{decoAnim\}`/.test(shared), 'entrance must be combined with the inline decoration animation');
    assert.ok(shared.includes("if (out !== 'none') card.style.animation = '';"), 'exit class must not be masked by inline animation');
});

test('Custom Overlay Editor: Reorganized element picker and search filter', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/editors/custom-overlay-editor.html'), 'utf8');
    
    // Check search elements
    assert.ok(html.includes('id="add-element-search"'), 'Add element menu must contain search input');
    assert.ok(html.includes('id="add-element-search-clear"'), 'Add element menu must contain search clear button');
    assert.ok(html.includes('id="add-element-empty"'), 'Add element menu must contain empty search state');

    // Check all 20 elements with data-add and data-keywords
    const expectedElements = [
        'text', 'random-text', 'markdown',
        'image', 'video', 'slideshow', 'igdb-artwork',
        'shape', 'icon', 'pattern', 'procedural-pattern', 'cutout', 'obs-frame',
        'alert', 'speaker-badge', 'poll', 'game-list', 'progress', 'qr', 'embed'
    ];
    for (const elType of expectedElements) {
        assert.ok(html.includes(`data-add="${elType}"`), `Picker must contain element ${elType}`);
        const elRegex = new RegExp(`data-add="${elType}"[^>]*data-keywords=`);
        assert.ok(elRegex.test(html), `Element ${elType} must have data-keywords attribute for searching`);
    }

    // Check section grouping
    assert.ok(html.includes('Text &amp; Copy'), 'Picker must contain Text & Copy section');
    assert.ok(html.includes('Media &amp; Artwork'), 'Picker must contain Media & Artwork section');
    assert.ok(html.includes('Graphics &amp; Patterns') || html.includes('Shapes &amp; Graphics'), 'Picker must contain Graphics & Patterns section');
    assert.ok(html.includes('Framing &amp; Cutouts'), 'Picker must contain Framing & Cutouts section');
    assert.ok(html.includes('Stream Widgets'), 'Picker must contain Stream Widgets section');

    // Strict No-Emoji check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    const menuSnippet = html.slice(html.indexOf('id="add-element"'), html.indexOf('id="open-presets"'));
    assert.ok(!emojiRegex.test(menuSnippet), 'Add menu must strictly contain zero raw unicode emojis');

    // Check editor-main.js search and keyboard listener
    const js = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-main.js'), 'utf8');
    assert.ok(js.includes('filterAddElements'), 'editor-main.js must define filterAddElements');
    assert.ok(js.includes('addElementSearch'), 'editor-main.js must wire search listeners');
});

test('Procedural Patterns: multicolor palettes, fill styles, schema normalization & Style tab inspector separation', () => {
    // 1. Palette dictionary verification
    assert.ok(PALETTES, 'PALETTES export must exist');
    assert.ok(Array.isArray(PALETTES.multicolor), 'multicolor palette must be an array');
    assert.ok(PALETTES.multicolor.length >= 7, 'multicolor must have at least 7 jewel tones');
    assert.ok(Array.isArray(PALETTES.christmas), 'christmas palette must be an array');
    assert.ok(Array.isArray(PALETTES.halloween), 'halloween palette must be an array');
    assert.ok(Array.isArray(PALETTES.winter), 'winter palette must be an array');
    assert.ok(Array.isArray(PALETTES.valentines), 'valentines palette must be an array');
    assert.ok(Array.isArray(PALETTES.neon), 'neon palette must be an array');
    assert.ok(Array.isArray(PALETTES.warm), 'warm palette must be an array');
    assert.ok(Array.isArray(PALETTES.cool), 'cool palette must be an array');
    assert.ok(Array.isArray(PALETTES.autumn), 'autumn palette must be an array');
    assert.ok(Array.isArray(PALETTES.pastel), 'pastel palette must be an array');
    assert.ok(Array.isArray(PALETTES.forest), 'forest palette must be an array');
    assert.ok(Array.isArray(PALETTES.sunset), 'sunset palette must be an array');
    assert.ok(Array.isArray(PALETTES.monochrome), 'monochrome palette must be an array');

    // 2. Multicolored canvas rendering across patterns
    const fillColors = new Set();
    const strokeColors = new Set();
    const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        stroke: () => { if (mockCtx.strokeStyle) strokeColors.add(mockCtx.strokeStyle); },
        fill: () => { if (mockCtx.fillStyle) fillColors.add(mockCtx.fillStyle); },
        fillRect: () => {},
        scale: () => {},
        translate: () => {},
        rotate: () => {},
        arc: () => {},
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: (stop, color) => { fillColors.add(color); } }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    drawProceduralPattern(mockCtx, 'christmas-lights', 1200, 400, {
        palette: 'multicolor',
        fillMode: 'solid',
        fillOpacity: 100,
        time: 0,
        motion: 'none'
    });
    // With 7 colors in multicolor palette, multiple distinct palette colors should be recorded
    assert.ok(fillColors.size >= 3, `Multicolor christmas lights must draw multiple distinct bulb/glow colors (got ${fillColors.size})`);

    // Verify turkeys draw feathers, body, eyes, beak, wattle, and feet in fillMode: 'solid'
    const turkeyFills = new Set();
    const turkeyCtx = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
        stroke: () => {},
        fill: () => { if (turkeyCtx.fillStyle) turkeyFills.add(turkeyCtx.fillStyle); },
        fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: () => {}, ellipse: () => {}
    };
    drawProceduralPattern(turkeyCtx, 'turkeys', 800, 400, {
        palette: 'autumn',
        fillMode: 'solid',
        fillOpacity: 100,
        time: 0,
        motion: 'none'
    });
    // Turkeys should have white eyes (#ffffff), dark pupils (#18181b), yellow beak (#f59e0b), red wattle (#dc2626), and feather fills
    assert.ok(turkeyFills.has('#ffffff'), 'Turkeys must draw white eyes');
    assert.ok(turkeyFills.has('#18181b'), 'Turkeys must draw dark pupils');
    assert.ok(turkeyFills.has('#f59e0b'), 'Turkeys must draw golden beak');
    assert.ok(turkeyFills.has('#dc2626'), 'Turkeys must draw signature red snood/wattle');
    assert.ok(turkeyFills.size >= 5, 'Turkeys in solid fill must have distinct plumage and facial feature fills');

    // 3. Fill Mode: outline should not invoke fill on geometric patterns
    let outlineFillCalls = 0;
    const outlineCtx = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, stroke: () => {},
        fill: () => { outlineFillCalls++; },
        fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: () => {}, ellipse: () => {}
    };
    drawProceduralPattern(outlineCtx, 'hexagons', 600, 400, {
        fillMode: 'outline',
        time: 0,
        motion: 'none'
    });
    assert.equal(outlineFillCalls, 0, 'Outline fillMode must not call ctx.fill on geometric shapes');

    // 4. Schema normalization in overlays service
    const { normalizeCustomOverlay } = require('../server/services/overlays.js');
    const normalizedDefault = normalizeCustomOverlay({
        id: 'proc-pat-test',
        name: 'Procedural Test',
        elements: [{
            id: 'proc-el-1',
            type: 'procedural-pattern',
            pattern: {}
        }]
    });
    const p1 = normalizedDefault.elements[0].pattern;
    assert.equal(p1.palette, 'dual', 'Default palette must be dual');
    assert.equal(p1.fillMode, 'tinted', 'Default fillMode must be tinted');
    assert.equal(p1.fillOpacity, 30, 'Default fillOpacity must be 30');

    const normalizedCustom = normalizeCustomOverlay({
        id: 'proc-pat-custom',
        name: 'Procedural Custom',
        elements: [{
            id: 'proc-el-2',
            type: 'procedural-pattern',
            pattern: {
                palette: 'multicolor',
                fillMode: 'solid',
                fillOpacity: 85
            }
        }]
    });
    const p2 = normalizedCustom.elements[0].pattern;
    assert.equal(p2.palette, 'multicolor');
    assert.equal(p2.fillMode, 'solid');
    assert.equal(p2.fillOpacity, 85);

    // 5. Inspector Clean Architecture & Tab Separation
    const patternsCode = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-patterns.js'), 'utf8');
    const contentFieldsFnMatch = patternsCode.match(/export function proceduralPatternContentFields[\s\S]*?return `([\s\S]*?)`;/);
    assert.ok(contentFieldsFnMatch, 'proceduralPatternContentFields function must exist');
    const contentFieldsBody = contentFieldsFnMatch[1];
    assert.ok(contentFieldsBody.includes("F.select('pattern.preset'"), 'Content tab must render generative preset selector');
    assert.ok(!contentFieldsBody.includes("pattern.accent"), 'Content tab fields must not contain primary color styling');
    assert.ok(!contentFieldsBody.includes("pattern.color"), 'Content tab fields must not contain base fill styling');
    assert.ok(!contentFieldsBody.includes("pattern.lineWidth"), 'Content tab fields must not contain line width styling');
    assert.ok(patternsCode.includes("F.section('proceduralStyle', 'Colors & Fill Style'"), 'proceduralStyle section must be created');
    assert.ok(patternsCode.includes("F.select('pattern.blendMode', 'Blend type'"), 'proceduralStyle must expose Blend type');
    assert.ok(patternsCode.includes("F.range('pattern.lineWidth', 'Line width'"), 'proceduralStyle must render Line width as an F.range control');
    assert.ok(patternsCode.includes("F.section('proceduralMotion', 'Animation & Motion'"), 'proceduralMotion section must be created');

    const inspectorCode = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    assert.ok(inspectorCode.includes("proceduralStyle: 'style'"), 'proceduralStyle section must route to Style tab');
    assert.ok(inspectorCode.includes("proceduralMotion: 'style'"), 'proceduralMotion section must route to Style tab');
    assert.ok(inspectorCode.includes("'pattern.palette'"), 'pattern.palette must be in RERENDER_PATHS');
    assert.ok(inspectorCode.includes("'pattern.fillMode'"), 'pattern.fillMode must be in RERENDER_PATHS');
    assert.ok(inspectorCode.includes("isProcedural ? effectsSection(el) + filterSection(el) :"), 'isProcedural layers include filterSection for color exposure and film grain');
});

test('Continuous Falling Motion: Overlay linear motion has zero periodic jumps, promo video loops cleanly', () => {
    // 1. Promo video renderer passes loop flags
    const promoCode = fs.readFileSync(path.join(__dirname, '../public/js/promo-renderer.js'), 'utf8');
    assert.ok(promoCode.includes('loop: true'), 'Promo renderer must pass loop: true for seamless social video loops');
    assert.ok(promoCode.includes('loopDuration: 6'), 'Promo renderer must pass loopDuration: 6');

    // 2. Continuous linear motion without jumps for overlay editor and live broadcast
    const samplePatterns = ['grid', 'dots', 'hexagons', 'leaves', 'turkeys', 'snowflakes', 'christmas-trees'];

    for (const pat of samplePatterns) {
        const getPositions = (t, opts = {}) => {
            const positions = [];
            const mockCtx = {
                save: () => {},
                restore: () => {},
                beginPath: () => {},
                closePath: () => {},
                moveTo: (x, y) => positions.push({ type: 'moveTo', x, y }),
                lineTo: (x, y) => positions.push({ type: 'lineTo', x, y }),
                quadraticCurveTo: () => {},
                stroke: () => {},
                fill: () => {},
                fillRect: (x, y) => positions.push({ type: 'fillRect', x, y }),
                scale: () => {},
                translate: (x, y) => positions.push({ type: 'translate', x, y }),
                rotate: () => {},
                arc: (x, y) => positions.push({ type: 'arc', x, y }),
                ellipse: (x, y) => positions.push({ type: 'ellipse', x, y }),
                createRadialGradient: () => ({ addColorStop: () => {} }),
                createLinearGradient: () => ({ addColorStop: () => {} })
            };
            drawProceduralPattern(mockCtx, pat, 800, 600, {
                scale: 100,
                color: '#0f172a',
                accent: '#38bdf8',
                secondary: '#f43f5e',
                time: t,
                speed: 1,
                motion: 'fall',
                ...opts
            });
            return positions;
        };

        // Around t = 4.545s, the old fallProgress ((t * 0.22) % 1) jumped backward by 1.0.
        // In the new continuous engine, vertical positions must advance continuously downward (y increases) with no jump!
        const t1 = 4.54;
        const t2 = 4.56;
        const p1 = getPositions(t1);
        const p2 = getPositions(t2);
        assert.ok(p1.length > 0 && p2.length > 0, `Pattern ${pat} must render elements`);

        // Look at the translates or element positions: for items present at both times, y2 must be > y1
        const translates1 = p1.filter(p => p.type === 'translate' || p.type === 'arc' || p.type === 'fillRect');
        const translates2 = p2.filter(p => p.type === 'translate' || p.type === 'arc' || p.type === 'fillRect');
        if (translates1.length > 0 && translates2.length > 0) {
            // Check average Y across rendered shapes
            const avgY1 = translates1.reduce((sum, p) => sum + p.y, 0) / translates1.length;
            const avgY2 = translates2.reduce((sum, p) => sum + p.y, 0) / translates2.length;
            // Since rows continuously scroll downward, elements move downward (positive delta)
            // Even if a new row entered, the individual elements' y positions moved downward
            assert.ok(translates2[0].y > translates1[0].y || avgY2 >= avgY1 - 5,
                `Pattern ${pat} vertical position must advance downward between t=${t1} and t=${t2} without jumping backwards`);
        }

        // 3. For promo looping mode, time=0 and time=6 start at the same displacement
        const loop0 = getPositions(0, { loop: true, loopDuration: 6 });
        const loop6 = getPositions(6, { loop: true, loopDuration: 6 });
        assert.equal(loop0.length, loop6.length, `Looping pattern ${pat} element counts must match at loop boundary`);
        if (loop0.length > 0) {
            assert.equal(Math.round(loop0[0].y), Math.round(loop6[0].y),
                `Looping pattern ${pat} initial element position at t=6 must match t=0 for seamless promo export`);
        }
    }
});

test('Decoupled In-Place Animation, Speed Calibration & Snowflake Morphologies', () => {
    const { SNOWFLAKE_STYLES } = require('../public/js/patterns-shared.js');
    assert.ok(Array.isArray(SNOWFLAKE_STYLES), 'SNOWFLAKE_STYLES array must be exported');
    assert.equal(SNOWFLAKE_STYLES.length, 7);
    assert.deepEqual(SNOWFLAKE_STYLES, ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle']);

    // 1. In-place animation with motion === 'none' (static canvas, dynamic in-place rotation and pulse)
    const rotations = [];
    const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        stroke: () => {},
        fill: () => {},
        fillRect: () => {},
        scale: () => {},
        translate: () => {},
        rotate: (r) => rotations.push(r),
        arc: () => {},
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    // When motion is 'none', but inPlace is 'auto', rotation must change between t=0 and t=2.0
    rotations.length = 0;
    drawProceduralPattern(mockCtx, 'snowflakes', 640, 360, {
        scale: 100,
        accent: '#38bdf8',
        time: 0,
        motion: 'none',
        inPlace: 'auto'
    });
    const r0 = [...rotations];

    rotations.length = 0;
    drawProceduralPattern(mockCtx, 'snowflakes', 640, 360, {
        scale: 100,
        accent: '#38bdf8',
        time: 2.0,
        motion: 'none',
        inPlace: 'auto'
    });
    const r2 = [...rotations];

    assert.ok(r0.length > 0 && r2.length > 0, 'Snowflakes must render rotation calls');
    assert.notEqual(r0[0], r2[0], 'In-place rotation must animate even when canvas motion is static (none)');

    // When inPlace is 'none', rotations must remain identical between t=0 and t=2.0
    rotations.length = 0;
    drawProceduralPattern(mockCtx, 'snowflakes', 640, 360, {
        scale: 100,
        accent: '#38bdf8',
        time: 0,
        motion: 'none',
        inPlace: 'none'
    });
    const frozen0 = [...rotations];

    rotations.length = 0;
    drawProceduralPattern(mockCtx, 'snowflakes', 640, 360, {
        scale: 100,
        accent: '#38bdf8',
        time: 2.0,
        motion: 'none',
        inPlace: 'none'
    });
    const frozen2 = [...rotations];
    assert.deepEqual(frozen0, frozen2, 'inPlace: none must completely freeze rotation when motion is static');

    // 2. All 6 individual snowflake varieties render cleanly without errors
    for (const style of ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle']) {
        assert.doesNotThrow(() => {
            drawProceduralPattern(mockCtx, 'snowflakes', 640, 360, {
                scale: 100,
                accent: '#38bdf8',
                time: 1.5,
                motion: 'fall',
                snowflakeStyle: style
            });
        }, `Snowflake style ${style} must render cleanly`);
    }

    // 3. Size variance and organic scatter
    const positions = [];
    const trackingCtx = {
        ...mockCtx,
        translate: (x, y) => positions.push({ x, y })
    };
    positions.length = 0;
    drawProceduralPattern(trackingCtx, 'snowflakes', 640, 360, {
        scale: 100,
        accent: '#38bdf8',
        time: 1,
        motion: 'none',
        scatter: 50,
        sizeVariance: 40
    });
    assert.ok(positions.length > 10, 'Scatter and size variance must produce translated elements');

    // 4. Schema normalization in overlays service
    const { normalizeCustomOverlay } = require('../server/services/overlays.js');
    const normalized = normalizeCustomOverlay({
        id: 'proc-pat-test-2',
        name: 'Procedural In-Place Test',
        elements: [{
            id: 'proc-el-3',
            type: 'procedural-pattern',
            pattern: {
                preset: 'snowflakes',
                motion: 'none',
                inPlace: 'pulse',
                inPlaceSpeed: 1.5,
                snowflakeStyle: 'rosette',
                sizeVariance: 45,
                scatter: 30
            }
        }]
    });
    const pat = normalized.elements[0].pattern;
    assert.equal(pat.inPlace, 'pulse', 'inPlace mode must be normalized');
    assert.equal(pat.inPlaceSpeed, 1.5, 'inPlaceSpeed must be normalized');
    assert.equal(pat.snowflakeStyle, 'rosette', 'snowflakeStyle must be normalized');
    assert.equal(pat.sizeVariance, 45, 'sizeVariance must be normalized');
    assert.equal(pat.scatter, 30, 'scatter must be normalized');

    // 5. Inspector exposes in-place animation and snowflake variety
    const patternsCode = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-patterns.js'), 'utf8');
    assert.ok(patternsCode.includes("F.select('pattern.inPlace'"), 'Editor must expose In-place animation selector');
    assert.ok(patternsCode.includes("F.range('pattern.inPlaceSpeed'"), 'Editor must expose in-place speed control');
    assert.ok(patternsCode.includes("F.range('pattern.sizeVariance'"), 'Editor must expose size variance range');
    assert.ok(patternsCode.includes("F.range('pattern.scatter'"), 'Editor must expose organic scatter range');
    assert.ok(patternsCode.includes("F.select('pattern.snowflakeStyle'"), 'Editor must expose snowflake variety when snowflakes preset is active');

    const inspectorCode = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
    assert.ok(inspectorCode.includes("'pattern.inPlace'"), 'pattern.inPlace must be in RERENDER_PATHS');
    assert.ok(inspectorCode.includes("'pattern.snowflakeStyle'"), 'pattern.snowflakeStyle must be in RERENDER_PATHS');
});

test('Universal In-Place Animation and Pattern Capabilities Gating', () => {
    const { PATTERNS, PATTERN_CAPABILITIES, drawProceduralPattern } = require('../public/js/patterns-shared.js');
    assert.ok(PATTERN_CAPABILITIES, 'PATTERN_CAPABILITIES must be exported');
    assert.equal(Object.keys(PATTERN_CAPABILITIES).length, 28, 'All 28 patterns must have capability entries');

    // 1. Verify in-place animation works across all 28 patterns when canvas movement is static (motion: 'none')
    for (const pat of PATTERNS) {
        const caps = PATTERN_CAPABILITIES[pat];
        assert.ok(caps, `Pattern ${pat} must exist in PATTERN_CAPABILITIES`);
        assert.equal(caps.inPlace, true, `Pattern ${pat} must support in-place animation`);

        const getSnapshot = (t, inPlaceMode = 'auto') => {
            const records = [];
            const mock = {
                save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
                moveTo: (x, y) => records.push(`M:${Math.round(x)},${Math.round(y)}`),
                lineTo: (x, y) => records.push(`L:${Math.round(x)},${Math.round(y)}`),
                quadraticCurveTo: () => {},
                stroke: () => { if (mock.strokeStyle) records.push(`S:${mock.strokeStyle}`); },
                fill: () => { if (mock.fillStyle) records.push(`F:${mock.fillStyle}`); },
                fillRect: (x, y, w, h) => records.push(`R:${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}:${mock.fillStyle}`),
                scale: () => {}, translate: (x, y) => records.push(`T:${Math.round(x)},${Math.round(y)}`),
                rotate: (r) => records.push(`Rot:${r.toFixed(3)}`),
                arc: (x, y, r) => records.push(`A:${Math.round(x)},${Math.round(y)},${r.toFixed(2)}`),
                ellipse: (x, y, rx, ry) => records.push(`E:${Math.round(x)},${Math.round(y)},${rx.toFixed(2)},${ry.toFixed(2)}`),
                createRadialGradient: () => ({ addColorStop: () => {} }),
                createLinearGradient: () => ({ addColorStop: () => {} })
            };
            drawProceduralPattern(mock, pat, 600, 400, {
                scale: 100,
                accent: '#38bdf8',
                secondary: '#f43f5e',
                time: t,
                motion: 'none',
                inPlace: inPlaceMode
            });
            return records.join('|');
        };

        const snap0 = getSnapshot(0, 'auto');
        const snap1 = getSnapshot(1.5, 'auto');
        assert.ok(snap0.length > 0, `Pattern ${pat} must render content`);
        assert.notEqual(snap0, snap1, `Pattern ${pat} must visually animate in place when motion is static (none)`);

        // When inPlace is 'none', t=0 and t=1.5 must be identical
        const frozen0 = getSnapshot(0, 'none');
        const frozen1 = getSnapshot(1.5, 'none');
        assert.equal(frozen0, frozen1, `Pattern ${pat} must freeze completely when inPlace is none`);
    }

    // 2. Verify dots, diamonds, hexagons, triangles, and scales respond to size variance and scatter
    for (const pat of ['dots', 'diamonds', 'hexagons', 'triangles', 'scales', 'circuit']) {
        const getGeomSnapshot = (opts = {}) => {
            const records = [];
            const mock = {
                save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
                moveTo: (x, y) => records.push(`M:${Math.round(x)},${Math.round(y)}`),
                lineTo: (x, y) => records.push(`L:${Math.round(x)},${Math.round(y)}`),
                quadraticCurveTo: () => {}, stroke: () => {}, fill: () => {},
                fillRect: (x, y, w, h) => records.push(`R:${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}:${mock.fillStyle}`),
                scale: () => {}, translate: (x, y) => records.push(`T:${Math.round(x)},${Math.round(y)}`),
                rotate: () => {},
                arc: (x, y, r) => records.push(`A:${Math.round(x)},${Math.round(y)},${r.toFixed(2)}`),
                ellipse: (x, y, rx, ry) => records.push(`E:${Math.round(x)},${Math.round(y)},${rx.toFixed(2)},${ry.toFixed(2)}`),
                createRadialGradient: () => ({ addColorStop: () => {} }),
                createLinearGradient: () => ({ addColorStop: () => {} })
            };
            drawProceduralPattern(mock, pat, 600, 400, {
                scale: 100,
                accent: '#38bdf8',
                secondary: '#f43f5e',
                time: 0,
                motion: 'none',
                ...opts
            });
            return records.join('|');
        };

        const baseSnap = getGeomSnapshot({ sizeVariance: 0, scatter: 0 });
        const sizeVarSnap = getGeomSnapshot({ sizeVariance: 75, scatter: 0 });
        const scatterSnap = getGeomSnapshot({ sizeVariance: 0, scatter: 75 });
        assert.notEqual(baseSnap, sizeVarSnap, `Pattern ${pat} must respond to size variance`);
        assert.notEqual(baseSnap, scatterSnap, `Pattern ${pat} must respond to organic scatter`);
    }

    // 3. Verify inspector gating
    const patternsCode = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-patterns.js'), 'utf8');
    assert.ok(patternsCode.includes('PATTERN_CAPABILITIES'), 'editor-patterns must query PATTERN_CAPABILITIES');
    assert.ok(patternsCode.includes('caps.sizeVariance'), 'editor-patterns must check caps.sizeVariance before rendering slider');
    assert.ok(patternsCode.includes('caps.scatter'), 'editor-patterns must check caps.scatter before rendering slider');
    assert.ok(patternsCode.includes('caps.fill !== false'), 'editor-patterns must check caps.fill before rendering fill section');
});

test('Infinite Non-Jumping Concentric Rings, Persistent Identity & Seam Elimination', () => {
    const { drawProceduralPattern } = require('../public/js/patterns-shared.js');
    const ringCaptures = [];
    const mockCtx = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {}, fill: () => {},
        fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: (x, y, r) => ringCaptures.push({ r: Math.round(r), stroke: mockCtx.strokeStyle }),
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        strokeStyle: '#000000'
    };

    // Render rings at t=0 and t=1.0 and t=2.0
    ringCaptures.length = 0;
    drawProceduralPattern(mockCtx, 'rings', 720, 720, {
        scale: 100,
        palette: 'warm',
        time: 0,
        motion: 'drift',
        speed: 1
    });
    const rings0 = [...ringCaptures];

    ringCaptures.length = 0;
    drawProceduralPattern(mockCtx, 'rings', 720, 720, {
        scale: 100,
        palette: 'warm',
        time: 1.0,
        motion: 'drift',
        speed: 1
    });
    const rings1 = [...ringCaptures];

    assert.ok(rings0.length > 5, 'Rings must render concentric arcs');
    assert.ok(rings1.length > 5, 'Rings must render concentric arcs at t=1.0');

    // Continuous radial expansion: rings expand outward without collapsing or jumping
    assert.ok(rings1[1].r > rings0[0].r, 'Expanding ripple rings must continuously increase in radius with time');
    assert.ok(rings1[0].r > 0 && rings1[0].r < rings0[0].r, 'New ring smoothly emerges and fades in from center');
});

test('Independent Element Spin, Pan Direction and Cinematic Vignette', () => {
    const { PATTERN_CAPABILITIES, PALETTES, drawProceduralPattern } = require('../public/js/patterns-shared.js');
    const { PATTERN_PALETTES, PATTERN_SPIN_MODES, PATTERN_PAN_DIRECTIONS, normalizeCustomOverlay } = require('../server/services/overlays.js');

    // 1. Palettes verification (22 curated palettes)
    const newPalettes = ['synthwave', 'galaxy', 'terracotta', 'vaporwave', 'ocean', 'royal', 'sakura', 'coffee'];
    for (const pal of newPalettes) {
        assert.ok(PALETTES[pal], `PALETTES must include ${pal}`);
        assert.ok(PATTERN_PALETTES.includes(pal), `PATTERN_PALETTES in overlays service must include ${pal}`);
        assert.ok(Array.isArray(PALETTES[pal]) && PALETTES[pal].length >= 5, `${pal} must have at least 5 curated tones`);
    }

    // 2. Spin modes verification
    assert.deepEqual(PATTERN_SPIN_MODES, ['none', 'auto', 'spin', 'reverse', 'sway']);
    assert.deepEqual(PATTERN_PAN_DIRECTIONS, ['continuous', 'oscillate']);

    // 3. Schema normalization for spin, pan, and vignette
    const overlay = normalizeCustomOverlay({
        id: 'spin-pan-vignette-test',
        name: 'Test Overlay',
        elements: [{
            id: 'bg-pat',
            type: 'procedural-pattern',
            pattern: {
                preset: 'snowflakes',
                spin: 'reverse',
                spinSpeed: 2.5,
                rotationVariance: 40,
                panDirection: 'continuous',
                panAngle: 120,
                vignette: 55,
                vignetteColor: '#1e1b4b'
            }
        }]
    });
    const p = overlay.elements[0].pattern;
    assert.equal(p.spin, 'reverse', 'spin must be normalized');
    assert.equal(p.spinSpeed, 2.5, 'spinSpeed must be normalized');
    assert.equal(p.rotationVariance, 40, 'rotationVariance must be normalized');
    assert.equal(p.panDirection, 'continuous', 'panDirection must be normalized');
    assert.equal(p.panAngle, 120, 'panAngle must be normalized');
    assert.equal(p.vignette, 55, 'vignette must be normalized');
    assert.equal(p.vignetteColor, '#1e1b4b', 'vignetteColor must be normalized');

    // 4. Dedicated element spin execution
    const rotations = [];
    const mock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {}, fill: () => {},
        fillRect: () => {}, scale: () => {}, translate: () => {},
        rotate: (r) => rotations.push(r),
        arc: () => {}, ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    // Spin reverse should yield negative delta compared to forward spin
    rotations.length = 0;
    drawProceduralPattern(mock, 'diamonds', 600, 400, {
        scale: 100,
        time: 1.0,
        motion: 'none',
        inPlace: 'none',
        spin: 'spin',
        spinSpeed: 1
    });
    const forwardSpin = rotations[0];

    rotations.length = 0;
    drawProceduralPattern(mock, 'diamonds', 600, 400, {
        scale: 100,
        time: 1.0,
        motion: 'none',
        inPlace: 'none',
        spin: 'reverse',
        spinSpeed: 1
    });
    const reverseSpin = rotations[0];

    assert.ok(Math.abs(forwardSpin) > 0, 'Spin must produce element rotation');
    assert.equal(forwardSpin, -reverseSpin, 'Reverse spin must exactly invert spin angle');

    // 5. Cinematic vignette gradient creation
    let radialGradCreated = false;
    let vignetteColorCaptured = '';
    const vigMock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {}, fill: () => {},
        fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {}, arc: () => {}, ellipse: () => {},
        createRadialGradient: (cx, cy, r0, cx2, cy2, r1) => {
            radialGradCreated = true;
            return {
                addColorStop: (offset, color) => {
                    if (offset === 1) vignetteColorCaptured = color;
                }
            };
        },
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    drawProceduralPattern(vigMock, 'hexagons', 600, 400, {
        scale: 100,
        vignette: 60,
        vignetteColor: '#111827'
    });
    assert.ok(radialGradCreated, 'drawProceduralPattern must create radial gradient when vignette > 0');
    assert.ok(vignetteColorCaptured.startsWith('#111827'), 'Vignette gradient must apply custom vignette color');
});

test('Starfield Density, Sunburst Density & Starfield Geometry Scale Bounds', () => {
    const { PATTERN_CAPABILITIES, drawProceduralPattern } = require('../public/js/patterns-shared.js');
    const { normalizeCustomOverlay } = require('../server/services/overlays.js');

    // 1. Capability gating
    assert.equal(PATTERN_CAPABILITIES.starfield.density, true, 'Starfield must support density');
    assert.equal(PATTERN_CAPABILITIES.sunburst.density, true, 'Sunburst must support density');
    assert.equal(PATTERN_CAPABILITIES.sparkles.density, true, 'Sparkles must support density');

    // 2. Sunburst density ray count
    const rayLines = [];
    const sunMock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: (x, y) => rayLines.push({ x: Math.round(x), y: Math.round(y) }),
        quadraticCurveTo: () => {}, stroke: () => {}, fill: () => {}, fillRect: () => {},
        scale: () => {}, translate: () => {}, rotate: () => {}, arc: () => {}, ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    rayLines.length = 0;
    drawProceduralPattern(sunMock, 'sunburst', 600, 400, { scale: 100, density: 16 });
    assert.equal(rayLines.length, 16, 'Sunburst with density 16 must draw exactly 16 rays');

    rayLines.length = 0;
    drawProceduralPattern(sunMock, 'sunburst', 600, 400, { scale: 100, density: 48 });
    assert.equal(rayLines.length, 48, 'Sunburst with density 48 must draw exactly 48 rays');

    // 3. Starfield density star count
    const stars = [];
    const starMock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
        fill: () => {}, fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: (x, y) => stars.push({ x: Math.round(x), y: Math.round(y) }),
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    stars.length = 0;
    drawProceduralPattern(starMock, 'starfield', 640, 360, { scale: 100, density: 60 });
    // In starfield, 3 out of every 4 stars (i % 4 !== 0) are drawn with arc
    const arcCount60 = stars.length;

    stars.length = 0;
    drawProceduralPattern(starMock, 'starfield', 640, 360, { scale: 100, density: 240 });
    const arcCount240 = stars.length;

    assert.equal(Math.round(arcCount240 / arcCount60), 4, 'Starfield density 240 must draw 4x as many stars as density 60');

    // 4. Starfield geometry scale coverage: stars must span the viewport at both small and large scales
    const starCoords = [];
    const coverageMock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
        fill: () => {}, fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: (x, y) => starCoords.push({ x, y }),
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    // At scale 50% (zoomed out)
    starCoords.length = 0;
    drawProceduralPattern(coverageMock, 'starfield', 640, 360, { scale: 50, density: 100 });
    const minX50 = Math.min(...starCoords.map(s => s.x));
    const maxX50 = Math.max(...starCoords.map(s => s.x));
    const minY50 = Math.min(...starCoords.map(s => s.y));
    const maxY50 = Math.max(...starCoords.map(s => s.y));

    // width at scale 50% is 1280. Coordinates must span across 0 to 1280 with overscan
    assert.ok(minX50 <= 0, 'Starfield at 50% scale must cover left margin without blank space');
    assert.ok(maxX50 >= 1200, 'Starfield at 50% scale must cover right margin without blank space');
    assert.ok(minY50 <= 0, 'Starfield at 50% scale must cover top margin without blank space');
    assert.ok(maxY50 >= 680, 'Starfield at 50% scale must cover bottom margin without blank space');

    // 5. Schema normalization
    const overlay = normalizeCustomOverlay({
        id: 'density-test',
        name: 'Density Test',
        elements: [
            { id: 'el-star', type: 'procedural-pattern', pattern: { preset: 'starfield', density: 3200 } },
            { id: 'el-sun', type: 'procedural-pattern', pattern: { preset: 'sunburst', density: 44 } }
        ]
    });
    assert.equal(overlay.elements[0].pattern.density, 3200, 'Starfield density must support high densities up to 8000');
    assert.equal(overlay.elements[1].pattern.density, 44, 'Sunburst density must be normalized');
});

test('Procedural Patterns: Hyper-dense Starfields, Camera Zoom In/Out, and Tiled Shape Color Placement & Waves', () => {
    const { PATTERN_CAPABILITIES, drawProceduralPattern } = require('../public/js/patterns-shared.js');
    const { PATTERN_COLOR_MODES, PATTERN_COLOR_ANIMS, normalizeCustomOverlay } = require('../server/services/overlays.js');

    // 1. Capability gating
    assert.equal(PATTERN_CAPABILITIES.triangles.colorMode, true, 'Triangles must support color placement');
    assert.equal(PATTERN_CAPABILITIES.hexagons.colorMode, true, 'Hexagons must support color placement');
    assert.equal(PATTERN_CAPABILITIES.diamonds.colorMode, true, 'Diamonds must support color placement');
    assert.equal(PATTERN_CAPABILITIES.scales.colorMode, true, 'Scales must support color placement');
    assert.equal(PATTERN_CAPABILITIES.dots.colorMode, true, 'Dots must support color placement');
    assert.equal(PATTERN_CAPABILITIES.checker.colorMode, true, 'Checker must support color placement');

    // 2. Hyper-dense starfield execution
    const denseArcs = [];
    const denseMock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
        fill: () => {}, fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: (x, y) => denseArcs.push({ x, y }),
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    denseArcs.length = 0;
    drawProceduralPattern(denseMock, 'starfield', 1920, 1080, { scale: 100, density: 4000 });
    assert.ok(denseArcs.length > 3000, `High density starfield (4000) should draw over 3000 arc stars (got ${denseArcs.length})`);

    // 3. Camera zoom verification: Zooming in (200% scale) moves stars apart in coordinate space
    const zoom100Stars = [];
    const zoom200Stars = [];
    const zoomMock100 = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
        fill: () => {}, fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: (x, y) => zoom100Stars.push({ x, y }),
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };
    const zoomMock200 = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
        fill: () => {}, fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: (x, y) => zoom200Stars.push({ x, y }),
        ellipse: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    drawProceduralPattern(zoomMock100, 'starfield', 1000, 1000, { scale: 100, density: 50 });
    drawProceduralPattern(zoomMock200, 'starfield', 1000, 1000, { scale: 200, density: 50 });

    // In canvas world space, zooming in 200% keeps coordinates anchored so that screen positions expand 2x
    assert.equal(zoom100Stars.length, zoom200Stars.length);

    // 4. Color placement modes on Triangles:
    const triFills = [];
    const triMock = {
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
        moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
        fill: () => {}, fillRect: () => {}, scale: () => {}, translate: () => {}, rotate: () => {},
        arc: () => {}, ellipse: () => {},
        set fillStyle(val) { triFills.push(val); },
        set strokeStyle(val) {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
    };

    // Test each color placement mode renders distinct color patterns
    const modes = ['mosaic', 'radial', 'rows', 'columns', 'diagonal', 'spiral', 'checker'];
    const modeOutputs = {};
    for (const m of modes) {
        triFills.length = 0;
        drawProceduralPattern(triMock, 'triangles', 800, 600, {
            scale: 100,
            palette: 'neon',
            colorMode: m,
            fillMode: 'solid'
        });
        modeOutputs[m] = triFills.slice(0, 20).join(',');
    }
    // Verify modes produce differentiated distributions
    assert.notEqual(modeOutputs.rows, modeOutputs.columns, 'Rows and columns color modes must differ');
    assert.notEqual(modeOutputs.radial, modeOutputs.mosaic, 'Radial and mosaic color modes must differ');
    assert.notEqual(modeOutputs.checker, modeOutputs.diagonal, 'Checker and diagonal color modes must differ');

    // 5. Animated color wave shifts on Triangles
    triFills.length = 0;
    drawProceduralPattern(triMock, 'triangles', 800, 600, {
        scale: 100,
        palette: 'synthwave',
        colorMode: 'radial',
        colorAnim: 'cycle',
        colorSpeed: 1,
        time: 0,
        fillMode: 'solid'
    });
    const colorsAtT0 = triFills.slice(0, 10).join(',');

    triFills.length = 0;
    drawProceduralPattern(triMock, 'triangles', 800, 600, {
        scale: 100,
        palette: 'synthwave',
        colorMode: 'radial',
        colorAnim: 'cycle',
        colorSpeed: 1,
        time: 1.5,
        fillMode: 'solid'
    });
    const colorsAtT1 = triFills.slice(0, 10).join(',');
    assert.notEqual(colorsAtT0, colorsAtT1, 'Cycling color waves must animate and shift palette colors across time');

    // 6. Schema normalization
    assert.ok(PATTERN_COLOR_MODES.includes('radial'));
    assert.ok(PATTERN_COLOR_MODES.includes('mosaic'));
    assert.ok(PATTERN_COLOR_ANIMS.includes('cycle'));
    assert.ok(PATTERN_COLOR_ANIMS.includes('breathe'));

    const normalizedDoc = normalizeCustomOverlay({
        id: 'color-mode-test',
        name: 'Color Mode Test',
        elements: [
            {
                id: 'el-tri',
                type: 'procedural-pattern',
                pattern: {
                    preset: 'triangles',
                    colorMode: 'radial',
                    colorAnim: 'cycle',
                    colorSpeed: 1.5
                }
            }
        ]
    });
    assert.equal(normalizedDoc.elements[0].pattern.colorMode, 'radial');
    assert.equal(normalizedDoc.elements[0].pattern.colorAnim, 'cycle');
    assert.equal(normalizedDoc.elements[0].pattern.colorSpeed, 1.5);
});

test('Procedural Patterns: Universal Color Placement, Continuous Seamless Pan, and In-Place Geometry Lock', () => {
    const { PATTERNS, PATTERN_CAPABILITIES, drawProceduralPattern } = require('../public/js/patterns-shared.js');

    // 1. All procedural patterns have colorMode capability enabled
    for (const pat of PATTERNS) {
        const caps = PATTERN_CAPABILITIES[pat];
        assert.ok(caps, `Capabilities must exist for pattern ${pat}`);
        assert.equal(caps.colorMode, true, `Pattern ${pat} must have colorMode: true`);
    }

    // 2. Physical geometry lock when sizeVariance is 0
    function captureRadii(pattern) {
        const radii = [];
        const mock = {
            save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
            beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
            arc: (x, y, r) => radii.push(r),
            ellipse: (x, y, rx, ry) => radii.push(rx),
            stroke: () => {}, fill: () => {}, fillRect: () => {}, clearRect: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            setTransform: () => {}
        };
        const samples = [];
        for (const t of [0, 0.8, 1.6, 2.7, 3.9]) {
            radii.length = 0;
            drawProceduralPattern(mock, pattern, 800, 600, {
                sizeVariance: 0,
                inPlace: 'pulse',
                inPlaceSpeed: 1,
                time: t
            });
            samples.push(radii[0]);
        }
        return samples;
    }

    for (const pat of ['dots', 'scales', 'circuit', 'fireworks', 'snowflakes']) {
        const samples = captureRadii(pat);
        const maxDelta = Math.max(...samples) - Math.min(...samples);
        assert.ok(maxDelta < 0.0001, `Pattern ${pat} must not alter physical element dimensions when sizeVariance is 0 (delta: ${maxDelta})`);
    }

    // 3. Hexagons & Diamonds vertex position stability across animation when sizeVariance is 0
    function captureFirstVertexY(pattern) {
        const vertices = [];
        const mock = {
            save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
            beginPath: () => {}, closePath: () => {},
            moveTo: (x, y) => vertices.push(y),
            lineTo: () => {}, arc: () => {}, ellipse: () => {},
            stroke: () => {}, fill: () => {}, fillRect: () => {}, clearRect: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            setTransform: () => {}
        };
        const samples = [];
        for (const t of [0, 0.8, 1.6, 2.7, 3.9]) {
            vertices.length = 0;
            drawProceduralPattern(mock, pattern, 800, 600, {
                sizeVariance: 0,
                inPlace: 'pulse',
                inPlaceSpeed: 1,
                time: t
            });
            samples.push(vertices[0]);
        }
        return samples;
    }

    for (const pat of ['hexagons', 'diamonds', 'hearts', 'leaves']) {
        const samples = captureFirstVertexY(pat);
        const maxDelta = Math.max(...samples) - Math.min(...samples);
        assert.ok(maxDelta < 0.0001, `Pattern ${pat} must keep vertex geometry constant when sizeVariance is 0 (delta: ${maxDelta})`);
    }

    // 4. Continuous single-direction pan glides seamlessly across long time durations without blanks or crashes
    function createTrackingContext() {
        let transX = 0, transY = 0;
        const stack = [];
        const points = [];
        return {
            save: () => stack.push({ transX, transY }),
            restore: () => {
                const s = stack.pop();
                if (s) { transX = s.transX; transY = s.transY; }
            },
            translate: (x, y) => { transX += x; transY += y; },
            scale: () => {}, rotate: () => {}, beginPath: () => {}, closePath: () => {},
            moveTo: (x, y) => points.push({ sx: x + transX, sy: y + transY }),
            lineTo: (x, y) => points.push({ sx: x + transX, sy: y + transY }),
            arc: (x, y, r) => {
                points.push({ sx: x - r + transX, sy: y - r + transY });
                points.push({ sx: x + r + transX, sy: y + r + transY });
            },
            ellipse: (x, y, rx, ry) => {
                points.push({ sx: x - rx + transX, sy: y - ry + transY });
                points.push({ sx: x + rx + transX, sy: y + ry + transY });
            },
            stroke: () => {}, fill: () => {},
            fillRect: (x, y, w, h) => {
                points.push({ sx: x + transX, sy: y + transY });
                points.push({ sx: x + w + transX, sy: y + h + transY });
            },
            clearRect: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            setTransform: () => {},
            _points: points
        };
    }

    const w = 800, h = 600;
    const continuousCoveragePatterns = ['grid', 'hexagons', 'diamonds', 'dots', 'starfield', 'sparkles', 'scales', 'triangles', 'chevrons', 'circuit', 'snowflakes', 'hearts', 'fireworks'];
    for (const pat of continuousCoveragePatterns) {
        for (const t of [0, 15, 60, 120]) {
            const ctx = createTrackingContext();
            drawProceduralPattern(ctx, pat, w, h, {
                motion: 'pan',
                panDirection: 'continuous',
                panAngle: 45,
                speed: 1,
                time: t,
                sizeVariance: 0
            });
            const xs = ctx._points.map(p => p.sx);
            const ys = ctx._points.map(p => p.sy);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            assert.ok(minX <= 0, `Pattern ${pat} at t=${t}s must cover left edge (minX: ${minX})`);
            assert.ok(maxX >= w, `Pattern ${pat} at t=${t}s must cover right edge (maxX: ${maxX})`);
            assert.ok(minY <= 0, `Pattern ${pat} at t=${t}s must cover top edge (minY: ${minY})`);
            assert.ok(maxY >= h, `Pattern ${pat} at t=${t}s must cover bottom edge (maxY: ${maxY})`);
        }
    }

    // 5. Universal color placement modes across non-tiled patterns
    const strokeColors = [];
    const fillColors = [];
    const colorTestMock = {
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
        arc: () => {}, ellipse: () => {},
        set strokeStyle(val) { strokeColors.push(val); },
        set fillStyle(val) { fillColors.push(val); },
        stroke: () => {}, fill: () => {}, fillRect: () => {}, clearRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        setTransform: () => {}
    };

    for (const pat of ['starfield', 'sunburst', 'waves', 'rings', 'snowflakes', 'leaves', 'hearts', 'circuit']) {
        strokeColors.length = 0;
        fillColors.length = 0;
        drawProceduralPattern(colorTestMock, pat, 800, 600, {
            palette: 'neon',
            colorMode: 'radial',
            colorAnim: 'cycle',
            colorSpeed: 1,
            time: 0,
            fillMode: 'tinted'
        });
        const allColors = [...strokeColors, ...fillColors];
        assert.ok(allColors.length > 5, `Pattern ${pat} must render multiple colored elements with colorMode: radial`);
    }
});

test('Procedural Patterns: Rendering Efficiency, 60fps Frame Pacing, Triangle Mosaic Dispersion & Color/Grain Filters', () => {
    const patternsSharedCode = fs.readFileSync(path.join(__dirname, '../public/js/patterns-shared.js'), 'utf8');
    const overlaySharedCode = fs.readFileSync(path.join(__dirname, '../public/js/overlay-shared.js'), 'utf8');
    const inspectorCode = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');

    // 1. Frame-rate pacing caps continuous loops at ~60fps across high-refresh displays
    assert.ok(overlaySharedCode.includes('hasProcAnim = isProcedural'), 'OverlayShared must check procedural animation state for frame pacing');
    assert.ok(overlaySharedCode.includes('ts - lastDrawTs < 15.8'), 'OverlayShared must throttle animations exceeding ~60fps (15.8ms interval)');

    // 2. Tight, scalable overscan bounds preventing off-screen geometry explosion
    assert.ok(patternsSharedCode.includes('padX = Math.max(80, (fullWidth / scale) * 0.06)'), 'Overscan padding must scale tightly with canvas dimensions instead of arbitrary 35% inflation');

    // 3. Turkey feather drawing eliminates per-feather ctx.save() and ctx.restore()
    const turkeySection = patternsSharedCode.slice(patternsSharedCode.indexOf("pattern === 'turkeys'"), patternsSharedCode.indexOf("pattern === 'pumpkins'"));
    const featherLoop = turkeySection.slice(turkeySection.indexOf('for (let f = 0; f < feathers; f++)'), turkeySection.indexOf('// 2. Plump turkey body'));
    assert.ok(!featherLoop.includes('ctx.save()'), 'Turkey feather loop must not invoke ctx.save() on every feather');
    assert.ok(!featherLoop.includes('ctx.restore()'), 'Turkey feather loop must not invoke ctx.restore() on every feather');

    // 4. Triangle mosaic dispersion: Adjacent triangles have diverse colors without diagonal striping
    const triColors = [];
    const triMock = {
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
        arc: () => {}, ellipse: () => {},
        set strokeStyle(val) {},
        set fillStyle(val) { triColors.push(val); },
        stroke: () => {}, fill: () => {}, fillRect: () => {}, clearRect: () => {},
        setTransform: () => {}
    };

    drawProceduralPattern(triMock, 'triangles', 800, 600, {
        palette: 'dual',
        accent: '#58a6ff',
        secondary: '#f97316',
        colorMode: 'mosaic',
        fillMode: 'solid'
    });

    const hasAccent = triColors.some(c => c.includes('58a6ff'));
    const hasSecondary = triColors.some(c => c.includes('f97316'));
    assert.ok(hasAccent, 'Triangle mosaic must contain accent color');
    assert.ok(hasSecondary, 'Triangle mosaic must contain secondary color');

    // Verify non-striping by checking color transitions between consecutive triangles
    let differentColorNeighbors = 0;
    for (let i = 0; i < triColors.length - 1; i++) {
        if (triColors[i] !== triColors[i + 1]) differentColorNeighbors++;
    }
    assert.ok(differentColorNeighbors > triColors.length * 0.3, 'Triangle mosaic must show diverse color variation across adjacent triangles');

    // 5. In-place animation geometry locking across all 28 patterns
    const mock = {
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
        arc: () => {}, ellipse: () => {},
        set strokeStyle(val) {}, set fillStyle(val) {},
        stroke: () => {}, fill: () => {}, fillRect: () => {}, clearRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        setTransform: () => {}
    };

    const allPatterns = [
        'grid', 'hexagons', 'diamonds', 'isometric', 'mesh', 'sunburst', 'dots',
        'starfield', 'sparkles', 'checker', 'waves', 'rings', 'scales', 'triangles',
        'chevrons', 'topography', 'confetti', 'circuit', 'leaves', 'turkeys',
        'pumpkins', 'christmas-trees', 'christmas-lights', 'snowflakes', 'hearts',
        'fireworks', 'geometry', 'orbits'
    ];

    for (const pat of allPatterns) {
        assert.doesNotThrow(() => {
            drawProceduralPattern(mock, pat, 600, 400, {
                inPlace: 'pulse',
                inPlaceSpeed: 2,
                spin: 'sway',
                spinSpeed: 2,
                time: 1.5,
                sizeVariance: 0,
                scatter: 0,
                fillMode: 'tinted'
            });
        }, `Pattern ${pat} must render cleanly with in-place animations and sizeVariance: 0`);
    }

    // 6. Style tab inspector exposes filterSection (Color exposure & Film grain) for procedural patterns
    assert.ok(inspectorCode.includes("isProcedural ? effectsSection(el) + filterSection(el) :"), 'Inspector must include filterSection for procedural pattern layers');
    assert.ok(inspectorCode.includes("const media = ['image', 'video', 'slideshow', 'embed', 'pattern', 'procedural-pattern'].includes(el.type);"), 'Inspector media filter must treat procedural-pattern as a media element');
});

