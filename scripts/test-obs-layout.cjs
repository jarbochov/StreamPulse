const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { computeAspectCrop, computeAnchoredTransform, sceneItemScreenRect } = require('../shared/obs-layout.cjs');
const createObsLayoutService = require('../server/services/obs-layout');
const createObsLayoutRoutes = require('../server/routes/obs-layout');

test('OBS Layout math computes exact aspect crops and 9-point anchored resize transforms', () => {
    // 1920x1080 -> 4:3 keeps 1080 height and crops width to 1440
    const crop43 = computeAspectCrop(1920, 1080, { ratio: '4:3', panX: 0, panY: 0, zoom: 1 });
    assert.equal(crop43.outW, 1440);
    assert.equal(crop43.outH, 1080);
    assert.ok(Math.abs(crop43.uvLeft - 0.125) < 0.001);
    assert.ok(Math.abs(crop43.uvRight - 0.875) < 0.001);

    // 1920x1080 -> 1:1 with panX=+100 shifts crop all the way to right edge
    const crop11Right = computeAspectCrop(1920, 1080, { ratio: '1:1', panX: 100, panY: 0, zoom: 1 });
    assert.equal(crop11Right.outW, 1080);
    assert.equal(crop11Right.outH, 1080);
    assert.ok(Math.abs(crop11Right.uvRight - 1.0) < 0.001);

    // Lock-Width + Top-Right anchor: width stays 800, height grows from 450 to 600, top-right corner (1800, 100) stays pinned
    const txTR = {
        positionX: 1000, positionY: 100, scaleX: 800 / 1920, scaleY: 450 / 1080,
        sourceWidth: 1920, sourceHeight: 1080, alignment: 5, boundsType: 'OBS_BOUNDS_NONE'
    };
    const anchored = computeAnchoredTransform(txTR, 1440, 1080, { resizeMode: 'lock-width', anchor: 'tr' });
    assert.ok(Math.abs(anchored.nextRect.width - 800) < 0.1);
    assert.ok(Math.abs(anchored.nextRect.height - 600) < 0.1);
    assert.ok(Math.abs((anchored.nextRect.left + anchored.nextRect.width) - 1800) < 0.1, 'right edge stays pinned at 1800');
    assert.ok(Math.abs(anchored.nextRect.top - 100) < 0.1, 'top edge stays pinned at 100');

    // Lock-Height + Center anchor: height stays 450, width shrinks from 800 to 600, center (1400, 325) stays pinned
    const centered = computeAnchoredTransform(txTR, 1440, 1080, { resizeMode: 'lock-height', anchor: 'c' });
    assert.ok(Math.abs(centered.nextRect.height - 450) < 0.1);
    assert.ok(Math.abs(centered.nextRect.width - 600) < 0.1);
    assert.ok(Math.abs((centered.nextRect.left + centered.nextRect.width / 2) - 1400) < 0.1);
    assert.ok(Math.abs((centered.nextRect.top + centered.nextRect.height / 2) - 325) < 0.1);

    const rect = sceneItemScreenRect(txTR);
    assert.equal(rect.left, 1000);
    assert.equal(rect.top, 100);
});

test('OBS Layout & Aspect Studio enforces opt-in gate, generates Lua script, morphs aspect, and applies saved layouts', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-obs-layout-'));
    let enabled = false;
    const obsCalls = [];
    const mockObs = {
        getStatus: () => ({ enabled: true, connected: true }),
        callRequest: async (type, data) => {
            obsCalls.push({ type, data });
            if (type === 'GetVideoSettings') return { baseWidth: 1920, baseHeight: 1080 };
            if (type === 'GetSceneList') return { currentProgramSceneName: 'Main', scenes: [{ sceneName: 'Main' }] };
            if (type === 'GetSceneItemList') {
                return {
                    sceneItems: [{
                        sceneItemId: 11, sceneItemIndex: 0, sourceName: 'Facecam', inputKind: 'macos-avcapture',
                        sceneItemEnabled: true, sceneItemLocked: false,
                        sceneItemTransform: {
                            positionX: 1000, positionY: 100, scaleX: 0.5, scaleY: 0.5,
                            sourceWidth: 1920, sourceHeight: 1080, alignment: 5, boundsType: 'OBS_BOUNDS_NONE'
                        }
                    }]
                };
            }
            if (type === 'GetSceneItemTransform') {
                return {
                    sceneItemTransform: {
                        positionX: 1000, positionY: 100, scaleX: 0.5, scaleY: 0.5,
                        sourceWidth: 1920, sourceHeight: 1080, alignment: 5, boundsType: 'OBS_BOUNDS_NONE'
                    }
                };
            }
            if (type === 'GetSourceFilterList') {
                return { filters: [{ filterName: 'StreamPulse Aspect', filterKind: 'streampulse_aspect_filter' }] };
            }
            return {};
        }
    };

    const service = createObsLayoutService({ dataDir: dir });
    const route = createObsLayoutRoutes({
        obsLayoutService: service,
        obsService: mockObs,
        isObsLayoutEnabled: () => enabled
    });
    const server = http.createServer(async (req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (!await route(req, res, u, u.pathname)) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    // Lua script is generated on disk & downloadable
    assert.ok(fs.existsSync(service.getState().luaScriptPath));
    const luaRes = await fetch(`${base}/api/obs-layout/lua`);
    assert.equal(luaRes.status, 200);
    assert.ok((await luaRes.text()).includes('streampulse_aspect_filter'));

    // Opt-in disabled -> interactive endpoints return 403
    assert.equal((await fetch(`${base}/api/obs-layout/scenes`)).status, 403);
    assert.equal((await fetch(`${base}/api/obs-layout/aspect`, {
        method: 'POST', body: JSON.stringify({ sourceName: 'Facecam', ratio: '4:3' })
    })).status, 403);

    // Enable module -> scenes & aspect morph work
    enabled = true;
    const scenesRes = await (await fetch(`${base}/api/obs-layout/scenes`)).json();
    assert.deepEqual(scenesRes.scenes, ['Main']);

    const morphRes = await (await fetch(`${base}/api/obs-layout/aspect`, {
        method: 'POST',
        body: JSON.stringify({ sourceName: 'Facecam', sceneName: 'Main', ratio: '4:3', resizeMode: 'lock-width', anchor: 'tr', durationMs: 0 })
    })).json();
    assert.equal(morphRes.ok, true);
    assert.equal(morphRes.aspect.ratio, '4:3');
    assert.ok(obsCalls.some(c => c.type === 'SetSceneItemTransform' && c.data.sceneItemId === 11));

    // Save and apply a Layout Preset
    const savedLayout = await (await fetch(`${base}/api/obs-layout/layouts`, {
        method: 'POST',
        body: JSON.stringify({
            name: 'Retro 4:3',
            sceneName: 'Main',
            durationMs: 0,
            items: [{ sourceName: 'Facecam', visible: true, transform: { positionX: 900, positionY: 120, scaleX: 0.5, scaleY: 0.5 } }]
        })
    })).json();
    assert.equal(savedLayout.ok, true);
    obsCalls.length = 0;

    const applyRes = await (await fetch(`${base}/api/obs-layout/layouts/apply?id=${savedLayout.layout.id}`)).json();
    assert.equal(applyRes.ok, true);
    assert.equal(applyRes.itemsAnimated, 1);
    assert.ok(obsCalls.some(c => c.type === 'SetSceneItemTransform' && c.data.sceneItemTransform.positionX === 900));
});
