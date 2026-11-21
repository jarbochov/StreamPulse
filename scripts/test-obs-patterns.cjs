const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createObsPatternsService, PATTERNS, PALETTES } = require('../server/services/obs-patterns');
const { createObsPatternsRoutes } = require('../server/routes/obs-patterns');

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

describe('OBS Pattern Studio (Beta / Advanced)', () => {
    let tmpDir;
    let varValues;
    let varSettingsEnabled;
    let service;
    let server;
    let port;

    before(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-obs-patterns-'));
        varValues = {
            'theme.accent': '#00FFAAFF',
            'theme.scale': '140'
        };
        varSettingsEnabled = true;

        service = createObsPatternsService({
            dataDir: tmpDir,
            getVariablesValues: () => varValues,
            isVariableSettingsEnabled: () => varSettingsEnabled
        });

        const handleRoutes = createObsPatternsRoutes({
            obsPatternsService: service,
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

    it('rebakes bound procedural textures on relevant changes without a studio client', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pattern-live-bake-'));
        let values = { 'theme.accent': '#FF0000FF', unrelated: 'one' };
        const batches = [];
        const bakerService = createObsPatternsService({
            dataDir: dir,
            getVariablesValues: () => values,
            renderPatternStamps: async profiles => {
                batches.push(profiles);
                return profiles.map(profile => ({
                    dataUrl: `data:image/png;base64,${Buffer.from(profile.accent).toString('base64')}`,
                    cols: 11, rows: 8
                }));
            }
        });
        const until = async predicate => {
            const deadline = Date.now() + 3000;
            while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
            assert.ok(predicate(), 'live bake timed out');
        };
        try {
            bakerService.upsertProfile({ id: 'bound-hearts', name: 'Bound hearts', mode: 'procedural',
                procedural: { preset: 'hearts', accent: 'var:theme.accent|#FFFFFFFF', bakedStampFile: 'original.png' } });
            await until(() => batches.length === 1 && JSON.parse(fs.readFileSync(bakerService.getState().manifestPath)).profiles.find(p => p.id === 'bound-hearts').procedural.bakedStampFile.startsWith('live-'));
            let manifest = JSON.parse(fs.readFileSync(bakerService.getState().manifestPath));
            let baked = manifest.profiles.find(p => p.id === 'bound-hearts').procedural;
            assert.equal(fs.readFileSync(path.join(bakerService.getState().stampsDir, baked.bakedStampFile), 'utf8'), '#FF0000FF');
            assert.equal(baked.stampCols, 11);
            values = { ...values, unrelated: 'two' };
            bakerService.syncResolvedManifest();
            await new Promise(resolve => setTimeout(resolve, 250));
            assert.equal(batches.length, 1);
            values = { ...values, 'theme.accent': '#0000FFFF' };
            bakerService.syncResolvedManifest();
            const revisionBeforeBake = JSON.parse(fs.readFileSync(bakerService.getState().manifestPath)).revision;
            await until(() => batches.length === 2 && fs.readFileSync(path.join(bakerService.getState().stampsDir, baked.bakedStampFile), 'utf8') === '#0000FFFF');
            manifest = JSON.parse(fs.readFileSync(bakerService.getState().manifestPath));
            assert.ok(manifest.revision > revisionBeforeBake, 'OBS must reload the replaced texture after baking');
            baked = manifest.profiles.find(p => p.id === 'bound-hearts').procedural;
            assert.equal(baked.accent, '#0000FFFF');
            assert.equal(bakerService.getState().profiles.find(p => p.id === 'bound-hearts').procedural.accent, 'var:theme.accent|#FFFFFFFF');
        } finally {
            bakerService.stop();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('renders real baked textures with the shared browser canvas renderer', async () => {
        const { renderPatternStamps } = require('../server/services/obs-pattern-baker');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pattern-render-'));
        let value = '#FF0000FF';
        const instance = createObsPatternsService({ dataDir: dir, getVariablesValues: () => ({ color: value }), renderPatternStamps });
        const read = () => {
            const profile = JSON.parse(fs.readFileSync(instance.getState().manifestPath)).profiles.find(p => p.id === 'bound-hearts');
            const file = profile?.procedural?.bakedStampFile;
            return file?.startsWith('live-') ? fs.readFileSync(path.join(instance.getState().stampsDir, file)) : null;
        };
        const until = async predicate => {
            const deadline = Date.now() + 20000;
            while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
            assert.ok(predicate(), instance.getState().bakeError || 'real pattern bake timed out');
        };
        try {
            instance.upsertProfile({ id: 'bound-hearts', mode: 'procedural',
                procedural: { preset: 'hearts', palette: 'dual', accent: 'var:color|#FFFFFFFF', secondary: '#00FF00FF' } });
            await until(() => Boolean(read()));
            const red = read();
            assert.deepEqual(red.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
            value = '#0000FFFF';
            instance.syncResolvedManifest();
            await until(() => !red.equals(read()));
        } finally {
            instance.stop();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('discards stale bakes and cancels outstanding rendering on shutdown', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pattern-stale-'));
        let value = '#FF0000FF';
        const pending = [];
        const instance = createObsPatternsService({
            dataDir: dir, getVariablesValues: () => ({ color: value }),
            renderPatternStamps: (profiles, { signal }) => new Promise(resolve => pending.push({ profiles, signal, resolve }))
        });
        const wait = async predicate => {
            const deadline = Date.now() + 4000;
            while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
            assert.ok(predicate(), 'bake did not reach expected state');
        };
        const result = text => [{ dataUrl: `data:image/png;base64,${Buffer.from(text).toString('base64')}`, cols: 1, rows: 1 }];
        try {
            instance.upsertProfile({ id: 'bound-hearts', mode: 'procedural',
                procedural: { preset: 'hearts', accent: 'var:color|#FFFFFFFF' } });
            await wait(() => pending.length === 1);
            value = '#0000FFFF';
            instance.syncResolvedManifest();
            pending[0].resolve(result('stale'));
            await wait(() => pending.length === 2);
            const profile = JSON.parse(fs.readFileSync(instance.getState().manifestPath)).profiles.find(p => p.id === 'bound-hearts');
            assert.ok(!profile.procedural.bakedStampFile.startsWith('live-'));
            instance.stop();
            assert.equal(pending[1].signal.aborted, true);
            pending[1].resolve(result('after-stop'));
            await new Promise(resolve => setTimeout(resolve, 25));
            assert.deepEqual(fs.readdirSync(instance.getState().stampsDir).filter(name => name.startsWith('live-')), []);
        } finally {
            instance.stop();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('renders continuous weave across phase boundaries for the New Test settings', async () => {
        const source = fs.readFileSync(path.join(__dirname, '../public/js/obs-patterns/obs-patterns-studio.js'), 'utf8');
        const vertex = source.match(/const VERT_GLSL = `([\s\S]*?)`;/)[1];
        const fragment = source.match(/const FRAG_GLSL = `([\s\S]*?)`;/)[1];
        const browser = await require('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const page = await browser.newPage();
            const result = await page.evaluate(({ vertex, fragment }) => {
                const canvas = document.createElement('canvas');
                canvas.width = 160; canvas.height = 90;
                const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
                function shader(type, source) {
                    const s = gl.createShader(type);
                    gl.shaderSource(s, source); gl.compileShader(s);
                    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                    return s;
                }
                const program = gl.createProgram();
                gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
                gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                gl.useProgram(program);
                const buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
                const position = gl.getAttribLocation(program, 'a_pos');
                gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([180, 180, 180, 255]));
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                const f = (name, value) => gl.uniform1f(gl.getUniformLocation(program, name), value);
                gl.uniform2f(gl.getUniformLocation(program, 'canvas_size'), 1920, 1080);
                gl.uniform2f(gl.getUniformLocation(program, 'stamp_size'), 1, 1);
                gl.uniform4f(gl.getUniformLocation(program, 'tile_tint'), 1, 1, 1, 1);
                for (const [name, value] of Object.entries({
                    mode_code: 1, has_stamp: 1, opacity: 1, tile_count: 1, tile_size: 196,
                    tile_gap: 6, tile_grid_rad: -15 * Math.PI / 180, tile_motion: 4, tile_track_mode: 7,
                    tile_speed: 6.5, tile_hue_mode: 3, tile_hue_speed: 14, tile_opacity: 1,
                    tile_alt_opacity: 0.35, tile_alt_scale: 1.15, flt_brightness: 100,
                    flt_contrast: 100, flt_saturate: 100
                })) f(name, value);
                const draw = time => {
                    f('anim_time', time);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    return pixels;
                };
                const deltas = [];
                let visiblePixels = 0;
                for (const track of [0, 7, 8]) {
                    f('tile_track_mode', track);
                    for (const cycle of [0.5, 1, 2, 6, 7]) {
                        const t = cycle / 0.12;
                        const a = draw(t - 0.0001), b = draw(t + 0.0001);
                        let delta = 0;
                        for (let i = 0; i < a.length; i++) delta += Math.abs(a[i] - b[i]);
                        if (!visiblePixels) for (let i = 3; i < a.length; i += 4) if (a[i] > 0) visiblePixels++;
                        deltas.push(delta / a.length);
                    }
                }
                return { deltas, visiblePixels };
            }, { vertex, fragment });
            assert.ok(result.visiblePixels > 100, 'fixture must render visible tiles');
            assert.ok(result.deltas.every(delta => delta < 1), `Weave jumped at a phase boundary: ${result.deltas}`);
        } finally {
            await browser.close();
        }
    });

    it('creates default profiles, manifest.json, and Metal-safe Lua input source script', () => {
        assert.equal(PATTERNS.length, 28);
        const state = service.getState();
        assert.ok(state.profiles.length >= 4);
        assert.equal(state.activeProfileId, 'cyber-hex-grid');
        assert.ok(fs.existsSync(state.manifestPath));
        assert.ok(fs.existsSync(state.luaScriptPath));

        const lua = fs.readFileSync(state.luaScriptPath, 'utf8');
        assert.match(lua, /obs\.OBS_SOURCE_TYPE_INPUT/);
        assert.match(lua, /obs\.OBS_SOURCE_VIDEO/);
        assert.match(lua, /evalProceduralPattern/);
        assert.match(lua, /evalPatternTiles/);
        assert.match(lua, /evalCanvasBackground/);
        assert.match(lua, /gs_texrender_create/);
        assert.match(lua, /sdFourStar/);
        assert.match(lua, /technique Draw/);
        assert.doesNotMatch(lua, /uniform int /);
        // Ensure dummy_tex is created in create() and only destroyed in destroy()
        const destroyMatches = lua.match(/gs_texture_destroy\(data\.dummy_tex\)/g) || [];
        assert.equal(destroyMatches.length, 1);
    });

    it('resolves multi-stop PALETTES, fillMode, inPlace, and 1-4 tile slots in manifest', () => {
        const saved = service.upsertProfile({
            id: 'palette-tile-parity',
            name: 'Palette & 4-Slot Tile Test',
            mode: 'tiles',
            procedural: {
                preset: 'sparkles',
                palette: 'neon',
                fillMode: 'solid',
                fillOpacity: 85,
                inPlace: 'sparkle',
                inPlaceSpeed: 2.5,
                colorMode: 'radial',
                colorAnim: 'cycle',
                spin: 'cw'
            },
            tiles: {
                tileDistribution: 'grid',
                alternateFlip: 'both',
                trackMode: 'alt-rows',
                spinDirection: 'alternate',
                tileOpacity: 0.9,
                slots: [
                    { sourceType: 'icon', iconClass: 'fa-solid fa-star', color: '#FF00FFFF', scale: 90 },
                    { sourceType: 'image', src: '/custom-overlay-assets/test1.png', scale: 100 },
                    { sourceType: 'icon', iconClass: 'fa-solid fa-bolt', color: '#00FFFFFF', scale: 80 },
                    { sourceType: 'image', src: '/custom-overlay-assets/test2.png', scale: 110 }
                ]
            }
        });
        assert.equal(saved.tiles.slots.length, 4);
        assert.equal(saved.tiles.tileDistribution, 'grid');

        const manifest = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        const res = manifest.profiles.find(p => p.id === 'palette-tile-parity');
        assert.equal(res.procedural.palCount, PALETTES.neon.length);
        assert.ok(Array.isArray(res.procedural.pal0) && res.procedural.pal0.length === 4);
        assert.equal(res.procedural.fillModeCode, 1);
        assert.equal(res.procedural.inPlaceCode, 4);
        assert.equal(res.tiles.tileCount, 4);
        assert.equal(res.tiles.tileDistCode, 3);
        assert.equal(res.tiles.altFlipCode, 3);
        assert.equal(res.tiles.trackModeCode, 1);
        assert.equal(res.tiles.spinDirCode, 2);

        const dualSaved = service.upsertProfile({
            id: 'dual-test',
            name: 'Dual Theme Test',
            mode: 'procedural',
            bgType: 'linear',
            bgColor: '#0F172AFF',
            bgColor2: '#7C3AEDFF',
            bgColor3: '#06B6D4FF',
            bgUseMid: true,
            bgAngle: 45,
            bgMotion: 'rotate',
            procedural: { preset: 'rings', palette: 'dual', accent: '#123456FF', secondary: '#ABCDEF99' }
        });
        assert.equal(dualSaved.procedural.palette, 'dual');
        assert.equal(dualSaved.bgType, 'linear');
        assert.equal(dualSaved.bgUseMid, true);
        const m2 = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        const res2 = m2.profiles.find(p => p.id === 'dual-test');
        assert.equal(res2.procedural.palCount, 2);
        assert.equal(res2.bgTypeCode, 2);
        assert.equal(res2.bgMotionCode, 1);
        assert.equal(res2.bgAngle, 45);
    });

    it('resolves Variable Settings tokens into manifest.json and respects gate', () => {
        const saved = service.upsertProfile({
            id: 'var-pattern-test',
            name: 'Variable Pattern',
            mode: 'procedural',
            procedural: {
                preset: 'topography',
                scale: 'var:theme.scale|90',
                accent: 'var:theme.accent|#112233FF'
            }
        }, { setActive: true });

        assert.equal(saved.id, 'var-pattern-test');
        let manifest = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        let resolved = manifest.profiles.find(p => p.id === 'var-pattern-test');
        assert.equal(resolved.procedural.scale, 140);
        assert.equal(resolved.procedural.accent, '#00FFAAFF');

        varSettingsEnabled = false;
        manifest = service.syncResolvedManifest();
        resolved = manifest.profiles.find(p => p.id === 'var-pattern-test');
        assert.equal(resolved.procedural.scale, 90);
        assert.equal(resolved.procedural.accent, '#112233FF');
        varSettingsEnabled = true;
    });

    it('saves PNG stamps, tracks OBS pattern sources idempotently, and supports Companion HTTP triggers', async () => {
        // 1x1 transparent PNG
        const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const stampRes = await requestJson(port, 'POST', '/api/obs-patterns/stamp', { id: 'test-tile', dataUrl: pngDataUrl });
        assert.equal(stampRes.status, 200);
        assert.equal(stampRes.body.stampFile, 'test-tile.png');
        assert.ok(service.resolveStampFilePath('test-tile.png'));

        const discovery = {
            scenes: ['Main Scene', 'BRB'],
            byScene: {
                'Main Scene': [{ sourceName: 'StreamPulse Background', inputKind: 'streampulse_pattern_source' }],
                'BRB': [{ sourceName: 'StreamPulse Background', inputKind: 'streampulse_pattern_source' }]
            }
        };
        const sync1 = service.syncFromObsDiscovery(discovery);
        assert.equal(sync1.sourcesCount, 1);
        const rev1 = service.getState().revision;
        service.syncFromObsDiscovery(discovery);
        assert.equal(service.getState().revision, rev1);

        const actRes = await requestJson(port, 'GET', '/api/obs-patterns/activate?profile=topo-midnight&target=StreamPulse%20Background&scene=BRB');
        assert.equal(actRes.status, 200);
        assert.equal(actRes.body.state.assignmentRules['BRB::StreamPulse Background'], 'topo-midnight');

        const luaRes = await requestJson(port, 'GET', '/api/obs-patterns/lua?download=1');
        assert.equal(luaRes.status, 200);
        assert.match(luaRes.headers['content-disposition'] || '', /streampulse-patterns\.lua/);
    });

    it('keeps pattern presets, categories, capabilities, and palettes synchronized with Custom Overlay Editor', () => {
        const catalog = require('../shared/pattern-catalog.cjs');
        const sharedJs = require('../public/js/patterns-shared.js');

        assert.deepEqual(PATTERNS, catalog.PATTERNS);
        assert.deepEqual(PALETTES, catalog.PALETTES);
        assert.deepEqual(sharedJs.PATTERNS, catalog.PATTERNS);
        assert.deepEqual(sharedJs.PATTERN_CATEGORIES, catalog.PATTERN_CATEGORIES);
        assert.deepEqual(sharedJs.PATTERN_CAPABILITIES, catalog.PATTERN_CAPABILITIES);
        assert.deepEqual(sharedJs.PALETTES, catalog.PALETTES);

        const studioJs = fs.readFileSync(path.join(__dirname, '../public/js/obs-patterns/obs-patterns-studio.js'), 'utf8');
        assert.match(studioJs, /StreamPulsePatternCatalog/);

        assert.deepEqual(catalog.PALETTES['holiday-lights'], ['#ef4444', '#22c55e', '#facc15', '#3b82f6']);
        for (const p of PATTERNS) {
            assert.equal(catalog.PATTERN_CAPABILITIES[p]?.density, true, `${p} should allow density`);
        }

        const lua = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        assert.match(lua, /gs_image_file_ex/);
        assert.match(lua, /gs_image_file_ex_init_texture/);
        assert.match(lua, /GS_IMAGE_ALPHA_STRAIGHT/);
        assert.match(lua, /stamp_size/);
        assert.match(lua, /stamp_grid/);
        assert.match(lua, /proc_spacing/);
        assert.match(lua, /flt_blur/);
        assert.match(lua, /applyGpuFilters/);
        assert.match(lua, /loaded_stamp_key/);
    });

    it('supports Custom Palette Editor, Element Spacing, Element Spin, and GPU Filter uniforms', async () => {
        const palSave = await requestJson(port, 'POST', '/api/obs-patterns/palette', {
            name: 'Holiday Test Mix',
            colors: ['#FF0000FF', '#00FF00FF', '#FFFF00FF', '#0000FFFF']
        });
        assert.equal(palSave.status, 200);
        assert.equal(palSave.body.palette.id, 'holiday-test-mix');
        assert.equal(palSave.body.state.customPalettes.length, 1);

        const profRes = await requestJson(port, 'POST', '/api/obs-patterns/profile', {
            profile: {
                id: 'custom-pal-prof',
                name: 'Custom Pal Profile',
                mode: 'procedural',
                procedural: {
                    preset: 'christmas-trees',
                    palette: 'custom',
                    customColors: ['#FF0000FF', '#00FF00FF', '#0000FFFF'],
                    lineWidth: 6,
                    density: 2,
                    spacing: 165,
                    spin: 'cw',
                    spinSpeed: 2,
                    stampCols: 14,
                    stampRows: 8
                },
                filters: {
                    brightness: 85,
                    contrast: 120,
                    saturate: 140,
                    grayscale: 15,
                    hueRotate: 45,
                    blur: 12,
                    duotone: { enabled: true, dark: '#111122FF', light: '#00FFAAFF' },
                    tint: { enabled: true, color: '#FF5500FF', opacity: 30 },
                    grain: { enabled: true, amount: 22, size: 150, animate: true }
                }
            }
        });
        assert.equal(profRes.status, 200);
        const manifest = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        const resolved = manifest.profiles.find(p => p.id === 'custom-pal-prof');
        assert.equal(resolved.procedural.palette, 'custom');
        assert.equal(resolved.procedural.palCount, 3);
        assert.equal(resolved.procedural.spacing, 165);
        assert.equal(resolved.procedural.spinModeCode, 1);
        assert.equal(resolved.procedural.stampCols, 14);
        assert.equal(resolved.procedural.stampRows, 8);
        assert.equal(resolved.filters.blur, 12);
        assert.equal(resolved.filters.brightness, 85);
        assert.equal(resolved.filters.duoEnabled, true);
        assert.equal(resolved.filters.tintEnabled, true);
        assert.equal(resolved.filters.grainAmount, 22);
        assert.deepEqual(resolved.procedural.pal0, [1, 0, 0, 1]);
        assert.deepEqual(resolved.procedural.pal1, [0, 1, 0, 1]);
        assert.deepEqual(resolved.procedural.pal2, [0, 0, 1, 1]);

        const delRes = await requestJson(port, 'DELETE', '/api/obs-patterns/palette/holiday-test-mix');
        assert.equal(delRes.status, 200);
        assert.equal(delRes.body.state.customPalettes.length, 0);
    });

    it('duplicates maximum-length IDs without replacing the original and uses distinct manifest revisions', () => {
        const id = 'p'.repeat(64);
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
        const statePath = path.join(tmpDir, 'obs-patterns.json');
        const saved = fs.readFileSync(statePath, 'utf8');
        service.upsertProfile({ id: 'temporary-restore-test', name: 'Temporary' });
        fs.writeFileSync(statePath, saved);
        service.reload();
        assert.equal(service.getState().profiles.some(p => p.id === 'temporary-restore-test'), false);
        assert.equal(JSON.parse(fs.readFileSync(service.getState().manifestPath)).profiles.some(p => p.id === 'temporary-restore-test'), false);
    });

    it('keeps OBS sources on auto for scene rules and safely handles existing inputs', async () => {
        const calls = [];
        const inputs = [
            { inputName: 'Pattern', inputKind: 'streampulse_pattern_source' },
            { inputName: 'Camera', inputKind: 'av_capture_input' }
        ];
        const discovery = {
            connected: true, scenes: ['Main', 'BRB', 'Extra'], currentProgramScene: 'Main',
            sources: ['Pattern', 'Camera'],
            byScene: {
                Main: [{ sourceName: 'Pattern', inputKind: 'streampulse_pattern_source' }, { sourceName: 'Camera', inputKind: 'av_capture_input' }],
                BRB: [{ sourceName: 'Pattern', inputKind: 'streampulse_pattern_source' }],
                Extra: []
            }
        };
        service.syncFromObsDiscovery(discovery);
        const obsService = {
            getStatus: () => ({ connected: true }),
            listScenesAndSources: async () => discovery,
            callRequest: async (type, params) => {
                calls.push({ type, params });
                if (type === 'GetInputList') return { inputs };
                return {};
            }
        };
        const route = createObsPatternsRoutes({ obsPatternsService: service, obsService, isLoopbackRequest: () => true });
        const mockServer = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://localhost');
            if (!await route(req, res, url, url.pathname)) { res.writeHead(404); res.end(); }
        });
        await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
        const mockPort = mockServer.address().port;
        try {
            for (const body of [
                { sourceName: 'Pattern', profileId: 'cyber-hex-grid' },
                { sourceName: 'Pattern', sceneName: 'BRB', profileId: 'topo-midnight' },
                { sourceName: 'Pattern', profileId: 'auto' }
            ]) {
                assert.equal((await requestJson(mockPort, 'POST', '/api/obs-patterns/assign', body)).status, 200);
            }
            const updates = calls.filter(c => c.type === 'SetInputSettings');
            assert.equal(updates.length, 3);
            assert.ok(updates.every(c => c.params.inputSettings.profile_id === 'auto'));
            assert.equal(service.getState().assignmentRules['BRB::Pattern'], 'topo-midnight');
            calls.length = 0;
            assert.equal((await requestJson(mockPort, 'POST', '/api/obs-patterns/obs-sync')).status, 200);
            assert.ok(calls.some(c => c.type === 'SetInputSettings' && c.params.inputSettings.profile_id === 'auto'));
            calls.length = 0;
            const collision = await requestJson(mockPort, 'POST', '/api/obs-patterns/obs-create', { sourceName: 'Camera', sceneName: 'BRB' });
            assert.equal(collision.status, 409);
            assert.equal(calls.some(c => c.type === 'SetInputSettings'), false);
            calls.length = 0;
            const existing = await requestJson(mockPort, 'POST', '/api/obs-patterns/obs-create', { sourceName: 'Pattern', sceneName: 'Extra', profileId: 'cyber-hex-grid' });
            assert.equal(existing.status, 200);
            assert.ok(calls.some(c => c.type === 'CreateSceneItem' && c.params.sceneName === 'Extra' && c.params.sourceName === 'Pattern'));
            assert.equal(calls.find(c => c.type === 'SetInputSettings').params.inputSettings.profile_id, 'auto');
        } finally {
            await new Promise(resolve => mockServer.close(resolve));
        }
    });
});
