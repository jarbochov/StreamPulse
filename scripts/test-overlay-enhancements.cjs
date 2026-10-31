'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PATTERNS, PATTERN_CATEGORIES, drawProceduralPattern } = require('../public/js/patterns-shared.js');

test('Shared patterns module: exports, categories and canvas drawing', () => {
    assert.equal(Array.isArray(PATTERNS), true);
    assert.equal(PATTERNS.length, 20);
    assert.ok(PATTERNS.includes('grid'));
    assert.ok(PATTERNS.includes('hexagons'));
    assert.ok(PATTERNS.includes('circuit'));
    assert.ok(PATTERNS.includes('topography'));
    assert.ok(PATTERNS.includes('starfield'));

    assert.equal(PATTERN_CATEGORIES.length, 3);
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

    // Verify all 20 patterns draw without throwing
    for (const pat of PATTERNS) {
        assert.doesNotThrow(() => {
            drawProceduralPattern(mockCtx, pat, 640, 360, {
                scale: 100,
                color: '#111827',
                accent: '#38bdf8',
                secondary: '#818cf8',
                time: 1.5,
                motion: 'drift'
            });
        }, `Pattern ${pat} must render cleanly`);
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
    assert.ok(inspectorJs.includes('if (!state.obs?.enabled) return \'\';'), 'obsLinkSection must return empty string when OBS is disabled');
});

test('Scene States vs Page Deck: Mode switching, font size morphing, and reaction triggers', () => {
    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-state.js'), 'utf8');
    assert.ok(stateJs.includes("export const statesModeOn = () => pagesOn() && ("), 'statesModeOn must be exported');
    assert.ok(stateJs.includes("state.overlay.pages?.kind ? state.overlay.pages.kind === 'states' : state.overlay.pages?.transition === 'morph'"), 'statesModeOn must prioritize explicit pages.kind over transition');

    const layersJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-layers.js'), 'utf8');
    assert.ok(layersJs.includes("renderPagesPanel();"), 'Mode toggle must re-render pages panel');
    assert.ok(layersJs.includes("projectPageState(state.curPage);"), 'Mode toggle must project page state');
    assert.ok(layersJs.includes("state.overlay.pages.transition = 'fade';"), 'Switching to pages must default transition from morph to fade');
    assert.ok(layersJs.includes("isStates ? 'Event Reaction' : 'Triggers &amp; Timing'"), 'Triggers section must adapt label in scene states mode');

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
    assert.ok(layersJs.includes("P.transition === 'morph' ? 'Morph' : P.transition === 'fade' ? 'Crossfade' : 'Slide'"), 'Preview button must adapt label to transition style');

    assert.ok(canvasJs.includes("export function previewEditorTransition"), 'canvas must export previewEditorTransition');
    assert.ok(canvasJs.includes("isAutoFit && prevFitted !== targetFitted"), 'canvas must detect auto text size differences across states');

    assert.ok(runtimeJs.includes("isAutoFit ? targetFitted : null"), 'runtime must track target fitted font size during morph');

    const overlayServiceJs = fs.readFileSync(path.join(__dirname, '../server/services/overlays.js'), 'utf8');
    assert.ok(overlayServiceJs.includes("clean.textFit = entry.textFit;"), 'overlays service must normalize textFit in pageStates');
    assert.ok(overlayServiceJs.includes("enterExit: PAGE_ENTER_EXITS.includes"), 'overlays service must normalize enterExit in pages');

    assert.ok(layersJs.includes("pages.enterExit"), 'Layers panel must provide enterExit option');
    assert.ok(canvasJs.includes("ghost.id = `ghost-${el.id}`"), 'Canvas preview must create ghost nodes for spatial moves during crossfade');
    assert.ok(runtimeJs.includes("ghost._isGhost = true"), 'Runtime must handle ghost clones for spatial moves during crossfade');
    assert.ok(editorCss.includes('@keyframes pg-zoom-in'), 'custom-overlay-editor.css must include pg-zoom-in');
});
