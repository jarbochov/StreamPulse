const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createObsBordersService, BORDER_STYLES, ANIMATION_TYPES } = require('../server/services/obs-borders');
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
        // (12 - 1) + ceil(10 * 1.65) = 11 + 17 = 28 + 6 extra + 2 safety = 36
        assert.equal(autoPad, 36);
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
    });
});
