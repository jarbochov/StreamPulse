const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createObsBordersService, BORDER_STYLES, ANIMATION_TYPES, resolveProfileForManifest } = require('../server/services/obs-borders');
const { createObsBordersRoutes } = require('../server/routes/obs-borders');

function requestJson(port, method, reqPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: reqPath,
            method,
            headers: payload ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            } : {}
        }, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('OBS Border Studio (Beta / Advanced)', () => {
    let tmpDir;
    let varValues;
    let varSettingsEnabled;
    let service;
    let server;
    let port;

    before(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-obs-borders-'));
        varValues = {
            'theme.primary': '#FF0088FF',
            'theme.border_width': '16',
            'theme.radius': '28'
        };
        varSettingsEnabled = true;

        service = createObsBordersService({
            dataDir: tmpDir,
            getVariablesValues: () => varValues,
            isVariableSettingsEnabled: () => varSettingsEnabled
        });

        const handleRoutes = createObsBordersRoutes({
            obsBordersService: service,
            isLoopbackRequest: () => true
        });

        server = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://localhost');
            if (await handleRoutes(req, res, url, url.pathname)) return;
            res.writeHead(404);
            res.end('Not found');
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    });

    after(async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates default profiles (with all 31 styles & 10 animations), manifest.json, and Lua script without hardcoded example scenes', () => {
        assert.equal(BORDER_STYLES.length, 31);
        assert.equal(ANIMATION_TYPES.length, 11); // none + 10 animations

        const state = service.getState();
        assert.ok(state.profiles.length >= 4);
        assert.equal(state.activeProfileId, 'dual-gradient');
        assert.deepEqual(state.knownScenes, []);
        assert.deepEqual(state.knownSources, []);
        assert.ok(fs.existsSync(state.manifestPath));
        assert.ok(fs.existsSync(state.luaScriptPath));

        const lua = fs.readFileSync(state.luaScriptPath, 'utf8');
        assert.match(lua, /obs\.OBS_SOURCE_TYPE_FILTER/);
        assert.match(lua, /sdRoundedBox/);
        assert.match(lua, /sdChamferBox/);
        assert.match(lua, /assignment_rules/);
        assert.match(lua, /technique Draw/);
        assert.doesNotMatch(lua, /uniform int /);
    });

    it('resolves Variable Settings tokens into manifest.json and respects gate', () => {
        const saved = service.upsertProfile({
            id: 'var-bound-test',
            name: 'Variable Bound Frame',
            radius: 'var:theme.radius|10',
            inner: {
                enabled: true,
                style: 'outset',
                thickness: 'var:theme.border_width|6',
                color1: 'var:theme.primary|#112233FF',
                color2: '#000000FF'
            },
            animation: {
                type: 'dual-beam',
                speed: 3,
                size: 40,
                color2: '#00FFAAFF',
                direction: 'ccw'
            }
        }, { setActive: true });

        assert.equal(saved.id, 'var-bound-test');
        let manifest = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        let resolved = manifest.profiles.find(p => p.id === 'var-bound-test');
        assert.equal(resolved.radius, 28);
        assert.equal(resolved.inner.thickness, 16);
        assert.equal(resolved.inner.color1, '#FF0088FF');
        assert.equal(resolved.inner.styleCode, 7); // outset
        assert.equal(resolved.animation.typeCode, 2); // dual-beam
        assert.equal(resolved.animation.dirCode, -1); // ccw

        // Gate disabled -> falls back to inline fallback values
        varSettingsEnabled = false;
        manifest = service.syncResolvedManifest();
        resolved = manifest.profiles.find(p => p.id === 'var-bound-test');
        assert.equal(resolved.radius, 10);
        assert.equal(resolved.inner.thickness, 6);
        assert.equal(resolved.inner.color1, '#112233FF');
        varSettingsEnabled = true;
    });

    it('tracks live OBS discovered sources/scenes and supports per-source and per-scene border overrides', async () => {
        const syncRes = service.syncFromObsDiscovery({
            scenes: ['Main Scene', 'Fullscreen Cam'],
            sources: ['Facecam', 'Overlay Chat', 'Yeti Mic'],
            byScene: {
                'Main Scene': [
                    { sourceName: 'Facecam', inputKind: 'macos-avcapture' },
                    { sourceName: 'Overlay Chat', inputKind: 'browser_source' }
                ],
                'Fullscreen Cam': [
                    { sourceName: 'Facecam', inputKind: 'macos-avcapture' },
                    { sourceName: 'Yeti Mic', inputKind: 'coreaudio_input_capture' }
                ]
            }
        });

        assert.deepEqual(syncRes.scenes, ['Fullscreen Cam', 'Main Scene']);
        assert.ok(syncRes.sources.includes('Facecam'));
        assert.ok(syncRes.sources.includes('Overlay Chat'));
        assert.ok(!syncRes.sources.includes('Yeti Mic')); // audio-only filtered out

        // Assign different defaults to Facecam vs Overlay Chat, plus bypass Facecam on Fullscreen Cam
        await requestJson(port, 'POST', '/api/obs-borders/assign', {
            sourceName: 'Facecam',
            profileId: 'neon-rotating'
        });
        await requestJson(port, 'POST', '/api/obs-borders/assign', {
            sourceName: 'Overlay Chat',
            profileId: 'cyber-hud'
        });
        const overrideRes = await requestJson(port, 'POST', '/api/obs-borders/assign', {
            sourceName: 'Facecam',
            sceneName: 'Fullscreen Cam',
            profileId: 'none'
        });

        assert.equal(overrideRes.status, 200);
        assert.equal(overrideRes.body.state.assignmentRules['Facecam'], 'neon-rotating');
        assert.equal(overrideRes.body.state.assignmentRules['Overlay Chat'], 'cyber-hud');
        assert.equal(overrideRes.body.state.assignmentRules['Fullscreen Cam::Facecam'], 'none');
    });

    it('supports Companion HTTP activation, duplication, and Lua download', async () => {
        const actRes = await requestJson(
            port,
            'GET',
            '/api/obs-borders/activate?profile=outset-3d-bevel&target=Facecam&scene=Main%20Scene'
        );
        assert.equal(actRes.status, 200);
        assert.equal(actRes.body.status, 'assigned');
        assert.equal(actRes.body.state.assignmentRules['Main Scene::Facecam'], 'outset-3d-bevel');

        const statusRes = await requestJson(port, 'GET', '/api/obs-borders/status');
        assert.equal(statusRes.status, 200);
        assert.ok(statusRes.body.profilesCount >= 4);

        const dupRes = await requestJson(port, 'POST', '/api/obs-borders/profile/outset-3d-bevel/duplicate');
        assert.equal(dupRes.status, 200);
        assert.equal(dupRes.body.profile.id, 'outset-3d-bevel-copy');

        const delRes = await requestJson(port, 'DELETE', '/api/obs-borders/profile/outset-3d-bevel-copy');
        assert.equal(delRes.status, 200);

        const luaRes = await requestJson(port, 'GET', '/api/obs-borders/lua?download=1');
        assert.equal(luaRes.status, 200);
        assert.match(luaRes.headers['content-disposition'] || '', /streampulse-borders\.lua/);
        assert.match(String(luaRes.body), /StreamPulse Border Filter/);
    });

    it('keeps border styles and animations synchronized with Custom Overlay Editor via shared catalog', () => {
        const catalog = require('../shared/border-catalog.cjs');
        assert.deepEqual(BORDER_STYLES, catalog.BORDER_STYLES);
        assert.deepEqual(ANIMATION_TYPES, catalog.BORDER_ANIM_TYPES);

        const stylesJs = fs.readFileSync(path.join(__dirname, '../public/js/overlay/styles.js'), 'utf8');
        assert.match(stylesJs, /border-catalog\.cjs/);

        const inspectorJs = fs.readFileSync(path.join(__dirname, '../public/js/editor/editor-inspector.js'), 'utf8');
        assert.match(inspectorJs, /BORDER_STYLE_GROUPS/);
        assert.match(inspectorJs, /BORDER_ANIMATION_GROUPS/);

        const studioJs = fs.readFileSync(path.join(__dirname, '../public/js/obs-borders/obs-borders-studio.js'), 'utf8');
        assert.match(studioJs, /window\.OverlayShared/);
        assert.match(studioJs, /BORDER_STYLE_GROUPS/);
        assert.match(studioJs, /BORDER_ANIMATION_GROUPS/);
    });

    it('supports Outside Auto-Padding, Auto-Scale, Background Fill Modes (Person, TV Static), and Standby Companion API', async () => {
        const catalog = require('../shared/border-catalog.cjs');
        const autoPad = catalog.computeAutoBorderPad({
            placement: 'outside',
            autoPad: true,
            extraPad: 6,
            seamOverlap: 1,
            inner: { enabled: true, style: 'solid', thickness: 12, gap: 0 },
            outer: { enabled: false, style: 'solid', thickness: 0, gap: 0 },
            glow: { enabled: true, inner: false, blur: 10 }
        });
        // (12 - 1) + ceil(10 * 1.9) = 11 + 19 = 30 + 6 extra + 2 safety = 38
        assert.equal(autoPad, 38);
        assert.equal(catalog.computeAutoBorderPad({ placement: 'inside', autoPad: true, inner: { enabled: true, thickness: 20 } }), 0);

        const saved = service.upsertProfile({
            id: 'standby-tv-static',
            name: 'Standby TV Static',
            placement: 'outside',
            autoPad: true,
            autoScale: true,
            extraPad: 4,
            inner: { enabled: true, style: 'film-sprocket', thickness: 14, color1: '#FFFFFFFF' },
            background: {
                mode: 'tv-static',
                standby: false,
                color1: '#101820FF',
                staticNoise: 85,
                staticScale: 2.5,
                staticSpeed: 20,
                staticColor: true,
                staticGlitch: 45
            }
        });
        assert.equal(saved.autoPad, true);
        assert.equal(saved.autoScale, true);
        assert.equal(saved.background.mode, 'tv-static');

        const manifest = service.syncResolvedManifest();
        const resolved = manifest.profiles.find(p => p.id === 'standby-tv-static');
        assert.equal(resolved.background.modeCode, 4);
        assert.equal(resolved.background.standby, false);
        assert.ok(resolved.pad >= 17);

        const toggleRes = await requestJson(port, 'GET', '/api/obs-borders/standby?profile=standby-tv-static&enabled=1');
        assert.equal(toggleRes.status, 200);
        assert.equal(toggleRes.body.standby, true);

        const lua = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        assert.match(lua, /evalBackgroundFill/);
        assert.match(lua, /bg_static_glitch/);
        assert.match(lua, /size_scale/);
        assert.match(lua, /scene_scales/);
        assert.doesNotMatch(lua, /tick_poll_accum/);
    });

    it('tracks OBS scene transform scales and avoids redundant revision bumps on unchanged discovery', () => {
        const discovery = {
            scenes: ['Live'],
            sources: ['Facecam'],
            byScene: {
                Live: [{ sourceName: 'Facecam', inputKind: 'macos-avcapture', sceneScale: 0.494, sceneItemEnabled: true }]
            }
        };
        const first = service.syncFromObsDiscovery(discovery);
        assert.equal(first.sceneScales['Live::Facecam'], 0.494);
        const revAfterFirst = service.getState().revision;

        const manifest = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        assert.equal(manifest.sceneScales['Live::Facecam'], 0.494);

        // Repeat identical discovery -> must not bump revision
        service.syncFromObsDiscovery(discovery);
        assert.equal(service.getState().revision, revAfterFirst);
    });

    it('duplicates maximum-length IDs without replacing the original and uses distinct manifest revisions', () => {
        const id = 'b'.repeat(64);
        service.upsertProfile({ id, name: 'Original' });
        const first = service.duplicateProfile(id);
        const second = service.duplicateProfile(id);
        assert.notEqual(first.id, id);
        assert.notEqual(first.id, second.id);
        assert.equal(service.getState().profiles.find(p => p.id === id).name, 'Original');
        const now = Date.now;
        try {
            Date.now = () => 1;
            const a = service.syncResolvedManifest({ force: true });
            const b = service.syncResolvedManifest({ force: true });
            assert.ok(b.revision > a.revision);
        } finally { Date.now = now; }
    });

    it('reloads restored profile state and its manifest', () => {
        const statePath = path.join(tmpDir, 'obs-borders.json');
        const saved = fs.readFileSync(statePath, 'utf8');
        service.upsertProfile({ id: 'temporary-restore-test', name: 'Temporary' });
        fs.writeFileSync(statePath, saved);
        service.reload();
        assert.equal(service.getState().profiles.some(p => p.id === 'temporary-restore-test'), false);
        assert.equal(JSON.parse(fs.readFileSync(service.getState().manifestPath)).profiles.some(p => p.id === 'temporary-restore-test'), false);
    });

    it('updates an existing OBS filter without re-enabling it', async () => {
        const calls = [];
        const obsService = {
            getStatus: () => ({ connected: true }),
            callRequest: async (type, params) => {
                calls.push({ type, params });
                if (type === 'GetSourceFilterList') return { filters: [{ filterName: 'StreamPulse Border', filterKind: 'streampulse_border_filter', filterEnabled: false }] };
                return {};
            }
        };
        const route = createObsBordersRoutes({ obsBordersService: service, obsService, isLoopbackRequest: () => true });
        const mockServer = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://localhost');
            if (!await route(req, res, url, url.pathname)) { res.writeHead(404); res.end(); }
        });
        await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
        try {
            const result = await requestJson(mockServer.address().port, 'GET', '/api/obs-borders/activate?profile=dual-gradient&target=Facecam');
            assert.equal(result.status, 200);
            await new Promise(resolve => setImmediate(resolve));
            assert.ok(calls.some(c => c.type === 'SetSourceFilterSettings'));
            assert.equal(calls.some(c => c.type === 'SetSourceFilterEnabled'), false);
        } finally {
            await new Promise(resolve => mockServer.close(resolve));
        }
    });

    it('organizes Border Designer into Hybrid Inspector tabs, collapsible advanced calibration, and preview quickbar', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'tools', 'obs-borders.html'), 'utf8');
        const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'obs-borders', 'obs-borders-studio.js'), 'utf8');
        for (const token of [
            'id="ob-inspector-tabs"', 'data-ob-inspector="geometry"', 'data-ob-inspector="layers"',
            'data-ob-inspector="fx"', 'data-ob-inspector="standby"', 'class="ob-adv-details"',
            'id="ob-btn-preview-pause"', 'id="ob-btn-preview-restart"', 'id="ob-dirty-pill"', 'id="ob-preview-sync-pill"'
        ]) {
            assert.ok(html.includes(token), `obs-borders.html missing ${token}`);
        }
        for (const fn of ['updateBorderDesignerVisibility', 'switchInspectorTab', 'updateDirtyIndicators']) {
            assert.ok(js.includes(fn), `obs-borders-studio.js missing ${fn}`);
        }
        for (const shToken of ['id="ob-shadow-enabled"', 'id="ob-shadow-mode"', 'id="ob-shadow-multiply"', 'id="ob-shadow-blur-wrap"']) {
            assert.ok(html.includes(shToken), `obs-borders.html missing ${shToken}`);
        }
    });

    it('computes borderless Drop Shadow padding, resolves all 4 shadow modes, and exports HLSL/Lua uniforms', () => {
        const catalog = require('../shared/border-catalog.cjs');
        assert.ok(Array.isArray(catalog.SHADOW_MODES) && catalog.SHADOW_MODES.length === 4);

        // Borderless Soft Drop expands evenly by offset + spread + blur * 1.65 + minSafeBleed
        const softPad = catalog.computeAutoBorderPad({
            placement: 'outside',
            autoPad: true,
            inner: { enabled: false },
            outer: { enabled: false },
            glow: { enabled: false },
            shadow: { enabled: true, mode: 'soft', offsetX: 10, offsetY: 14, blur: 20, spread: 0 }
        });
        assert.equal(softPad, 49);

        // Hard Offset expands tightly for crisp solid edge without blur bleed
        const hardPad = catalog.computeAutoBorderPad({
            placement: 'outside',
            autoPad: true,
            inner: { enabled: false },
            outer: { enabled: false },
            shadow: { enabled: true, mode: 'hard', offsetX: 12, offsetY: 16, blur: 30, spread: 4 }
        });
        assert.equal(hardPad, 24);

        // Inner Shadow needs 0 expansion when no outer border/glow is active
        const insetPad = catalog.computeAutoBorderPad({
            placement: 'outside',
            autoPad: true,
            inner: { enabled: false },
            outer: { enabled: false },
            shadow: { enabled: true, mode: 'inset', offsetX: 10, offsetY: 14, blur: 28, spread: 0 }
        });
        assert.equal(insetPad, 0);

        const resolved = service.upsertProfile({
            id: 'borderless-shadow-test',
            name: 'Borderless Shadow',
            inner: { enabled: false },
            outer: { enabled: false },
            shadow: { enabled: true, mode: 'inset', color: '#2563EBCC', offsetX: 8, offsetY: 12, blur: 32, spread: 2, multiply: true }
        });
        const res = resolveProfileForManifest(resolved);
        assert.equal(res.shadow.enabled, true);
        assert.equal(res.shadow.mode, 'inset');
        assert.equal(res.shadow.modeCode, 3);
        assert.equal(res.shadow.multiply, true);
        assert.equal(res.pad, 0);

        const luaText = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        for (const uName of ['shadow_enabled', 'shadow_mode', 'shadow_color', 'shadow_offset', 'shadow_blur', 'shadow_spread', 'shadow_multiply', 'evalSoftShadowAlpha']) {
            assert.ok(luaText.includes(uName), `streampulse-borders.lua missing ${uName}`);
        }
    });

    it('enforces sharp 0px corners, live OBS scene scale detection, and Inside placement notes/guards', () => {
        const luaText = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        for (const token of ['sdShapeBox', 'collect_live_scene_scales', 'placement_code < 1.5']) {
            assert.ok(luaText.includes(token), `streampulse-borders.lua missing ${token}`);
        }
        assert.ok(!luaText.includes('scene_scale > 4.0'), 'inverse scene scale cap should exceed 4.0');

        const htmlPath = path.join(__dirname, '..', 'public', 'tools', 'obs-borders.html');
        const htmlText = fs.readFileSync(htmlPath, 'utf8');
        assert.ok(htmlText.includes('id="ob-glow-inside-note"'), 'obs-borders.html missing #ob-glow-inside-note');
        assert.ok(htmlText.includes('id="ob-shadow-inside-note"'), 'obs-borders.html missing #ob-shadow-inside-note');

        const cssPath = path.join(__dirname, '..', 'public', 'css', 'obs-borders.css');
        const cssText = fs.readFileSync(cssPath, 'utf8');
        assert.ok(!/\.ob-preview-stage\s*\{[^}]*border-radius\s*:\s*[1-9]/.test(cssText), '.ob-preview-stage should not clip previews with non-zero border-radius');
    });

    it('compensates OBS scene item transforms with exact sub-pixel accuracy for outer-border and content pin modes', () => {
        const { computeCompensatedTransform } = require('../shared/obs-border-transform.cjs');

        // 1. Pin Outer Border Edge: Top-Left aligned, border thickness + shadow blur both increase
        const prevProf = {
            placement: 'outside', autoScale: false, baseWidth: 1920, baseHeight: 1080,
            seamOverlap: 0, pad: 30,
            inner: { enabled: true, thickness: 10, gap: 0 },
            outer: { enabled: false }
        };
        const nextProf = {
            placement: 'outside', autoScale: false, baseWidth: 1920, baseHeight: 1080,
            seamOverlap: 0, pad: 70,
            inner: { enabled: true, thickness: 20, gap: 0 },
            outer: { enabled: false }
        };
        // baseW = 1000, baseH = 500 -> sourceWidth = 1060, sourceHeight = 560
        const txTL = {
            positionX: 100, positionY: 80, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5,
            sourceWidth: 1060, sourceHeight: 560, boundsType: 'OBS_BOUNDS_NONE'
        };
        const resOuter = computeCompensatedTransform(txTL, prevProf, nextProf, { pinMode: 'outer-border' });
        assert.equal(resOuter.changed, true);
        // Verify outer border left edge stays at 100 + (30 - 10) = 120.000
        const newLeftEdge = resOuter.patch.positionX + (70 - 20) * resOuter.patch.scaleX;
        const newRightEdge = newLeftEdge + (1000 + 40) * resOuter.patch.scaleX;
        assert.ok(Math.abs(newLeftEdge - 120) < 0.01, `expected left edge 120, got ${newLeftEdge}`);
        assert.ok(Math.abs(newRightEdge - 1140) < 0.01, `expected right edge 1140, got ${newRightEdge}`);

        // 2. Pin Inner Content Box: Top-Left aligned shifts by -Δpad, scale stays unchanged
        const resContent = computeCompensatedTransform(txTL, prevProf, nextProf, { pinMode: 'content' });
        assert.equal(resContent.changed, true);
        assert.equal(resContent.patch.positionX, 60);
        assert.equal(resContent.patch.positionY, 40);
        assert.equal(resContent.patch.scaleX, undefined);

        // 3. Center aligned (alignment = 0): symmetric padding change needs zero position shift in content mode
        const txCenter = { ...txTL, alignment: 0 };
        const resCenter = computeCompensatedTransform(txCenter, prevProf, nextProf, { pinMode: 'content' });
        assert.equal(resCenter.patch.positionX, 100);
        assert.equal(resCenter.patch.positionY, 80);

        // 4. Bounding Box (OBS_BOUNDS_STRETCH): expands boundsWidth/boundsHeight so source never shrinks
        const txBounds = {
            positionX: 100, positionY: 80, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5,
            sourceWidth: 1060, sourceHeight: 560,
            boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: 530, boundsHeight: 280
        };
        const resBounds = computeCompensatedTransform(txBounds, prevProf, nextProf, { pinMode: 'content' });
        // effScale = 0.5, Δpad = +40 -> bounds grow by 2 * 40 * 0.5 = +40, pos shifts by -40 * 0.5 = -20
        assert.equal(resBounds.patch.boundsWidth, 570);
        assert.equal(resBounds.patch.boundsHeight, 320);
        assert.equal(resBounds.patch.positionX, 80);
        assert.equal(resBounds.patch.positionY, 60);

        // 5. 90-degree rotated source: local (-40, -40) rotates to (+40, -40)
        const txRot = { ...txTL, rotation: 90 };
        const resRot = computeCompensatedTransform(txRot, prevProf, nextProf, { pinMode: 'content' });
        assert.ok(Math.abs(resRot.patch.positionX - 140) < 0.01);
        assert.ok(Math.abs(resRot.patch.positionY - 40) < 0.01);
    });

    it('persists transformLock settings and calls SetSceneItemTransform on OBS sync when enabled', async () => {
        const calls = [];
        const mockObs = {
            getStatus: () => ({ enabled: true, connected: true }),
            callRequest: async (type, data) => {
                calls.push({ type, data });
                if (type === 'GetSourceFilterList') {
                    return { filters: [{ filterName: 'StreamPulse Border', filterKind: 'streampulse_border_filter' }] };
                }
                if (type === 'GetSceneList') {
                    return { scenes: [{ sceneName: 'Main' }] };
                }
                if (type === 'GetSceneItemList') {
                    return { sceneItems: [{ sceneItemId: 7, sourceName: 'Facecam', isGroup: false }] };
                }
                if (type === 'GetSceneItemTransform') {
                    return {
                        sceneItemTransform: {
                            positionX: 100, positionY: 80, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5,
                            sourceWidth: 1920, sourceHeight: 1080, boundsType: 'OBS_BOUNDS_NONE'
                        }
                    };
                }
                return {};
            }
        };
        const mockRoutes = createObsBordersRoutes({ obsBordersService: service, obsService: mockObs });
        const mockServer = http.createServer(async (req, res) => {
            const u = new URL(req.url, 'http://127.0.0.1');
            if (await mockRoutes(req, res, u, u.pathname)) return;
            res.writeHead(404); res.end();
        });
        await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
        try {
            const port = mockServer.address().port;
            // Enable Transform Lock
            const setRes = await requestJson(port, 'POST', '/api/obs-borders/settings', {
                transformLock: { enabled: true, mode: 'outer-border' }
            });
            assert.equal(setRes.status, 200);
            assert.equal(setRes.body.state.transformLock.enabled, true);
            assert.equal(setRes.body.state.transformLock.mode, 'outer-border');

            // Ensure Facecam is assigned to a profile and edit its shadow blur so padding increases
            service.syncFromObsDiscovery({ scenes: ['Main'], sources: ['Facecam'], byScene: { Main: [{ sourceName: 'Facecam' }] } });
            await requestJson(port, 'POST', '/api/obs-borders/assign', { sourceName: 'Facecam', profileId: 'dual-gradient' });
            calls.length = 0;

            const existing = service.getState().profiles.find(p => p.id === 'dual-gradient');
            const saveRes = await requestJson(port, 'POST', '/api/obs-borders/profile', {
                profile: { ...existing, shadow: { enabled: true, mode: 'soft', offsetX: 15, offsetY: 20, blur: 40, spread: 5 } }
            });
            assert.equal(saveRes.status, 200);
            const txCall = calls.find(c => c.type === 'SetSceneItemTransform');
            assert.ok(txCall, 'SetSceneItemTransform should be invoked when transformLock is enabled and padding changes');
            assert.equal(txCall.data.sceneName, 'Main');
            assert.equal(txCall.data.sceneItemId, 7);
            assert.ok(txCall.data.sceneItemTransform.positionX < 100, 'positionX shifts outward to compensate larger shadow pad');
        } finally {
            await new Promise(resolve => mockServer.close(resolve));
        }
    });
});
