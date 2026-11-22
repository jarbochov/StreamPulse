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

    it('renders continuous weave across phase boundaries with varied tiles', async () => {
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
                for (const fixture of ['original', 'three-slots', 'jitter']) {
                    if (fixture === 'three-slots') {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                            new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]));
                        f('tile_count', 3);
                    } else {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                            new Uint8Array(fixture === 'jitter' ? [180, 90, 30, 255] : [180, 180, 180, 255]));
                        f('tile_count', 1);
                    }
                    f('tile_hue_jitter', fixture === 'jitter' ? 120 : 0);
                    for (const track of [0, 7, 8]) {
                        f('tile_track_mode', track);
                        for (const cycle of [0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 6, 6.25, 7, 419.25, 419.5, 420]) {
                            const t = cycle / (6.5 * 0.015);
                            const epsilon = cycle >= 419 ? 0.005 : 0.0001;
                            const a = draw(t - epsilon), b = draw(t + epsilon);
                            let delta = 0;
                            for (let i = 0; i < a.length; i++) delta += Math.abs(a[i] - b[i]);
                            if (!visiblePixels) for (let i = 3; i < a.length; i += 4) if (a[i] > 0) visiblePixels++;
                            deltas.push({ fixture, track, cycle, value: delta / a.length });
                        }
                    }
                }
                return { deltas, visiblePixels };
            }, { vertex, fragment });
            assert.ok(result.visiblePixels > 100, 'fixture must render visible tiles');
            assert.deepEqual(result.deltas.filter(delta => delta.value >= (delta.cycle === 419.25 ? 4 : 1)), [], 'Weave jumped at a phase boundary');
        } finally {
            await browser.close();
        }
    });

    it('matches the original blur kernel using padded two-pass rendering', async () => {
        const source = fs.readFileSync(path.join(__dirname, '../public/js/obs-patterns/obs-patterns-studio.js'), 'utf8');
        const vertex = source.match(/const VERT_GLSL = `([\s\S]*?)`;/)[1];
        const fragment = source.match(/const FRAG_GLSL = `([\s\S]*?)`;/)[1];
        const browser = await require('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const page = await browser.newPage();
            const results = await page.evaluate(({ vertex, fragment }) => {
                const canvas = document.createElement('canvas');
                canvas.width = 320; canvas.height = 180;
                const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
                function shader(type, text) {
                    const s = gl.createShader(type);
                    gl.shaderSource(s, text); gl.compileShader(s);
                    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
                    return s;
                }
                function program(define) {
                    const p = gl.createProgram();
                    gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex));
                    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, define + fragment));
                    gl.linkProgram(p);
                    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
                    return p;
                }
                const direct = program(''), scene = program('#define SP_SCENE_PASS\n'), blur = program('#define SP_BLUR_PASS\n');
                gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
                const stamp = new Uint8Array(32 * 32 * 4);
                for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
                    const i = (y * 32 + x) * 4;
                    stamp[i] = x * 8; stamp[i + 1] = y * 8; stamp[i + 2] = 180;
                    stamp[i + 3] = (x - 16) ** 2 + (y - 16) ** 2 < 180 ? 220 : 0;
                }
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, stamp);
                for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
                gl.activeTexture(gl.TEXTURE1);
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
                const fb = gl.createFramebuffer();
                function setup(p, mode, radius, pad) {
                    gl.useProgram(p);
                    const loc = gl.getAttribLocation(p, 'a_pos');
                    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
                    const f = (name, value) => gl.uniform1f(gl.getUniformLocation(p, name), value);
                    const v2 = (name, x, y) => gl.uniform2f(gl.getUniformLocation(p, name), x, y);
                    const v4 = (name, x, y, z, a) => gl.uniform4f(gl.getUniformLocation(p, name), x, y, z, a);
                    gl.uniform1i(gl.getUniformLocation(p, 'stamp_tex'), 0);
                    gl.uniform1i(gl.getUniformLocation(p, 'scene_tex'), 1);
                    v2('canvas_size', 320, 180); v2('scene_padding', pad, pad); v2('stamp_size', 32, 32);
                    v4('proc_accent', 0.2, 0.6, 1, 1); v4('proc_secondary', 1, 0.2, 0.7, 1);
                    v4('bg_color', 0.02, 0.04, 0.07, 0.7); v4('tile_tint', 1, 1, 1, 1);
                    for (const [name, value] of Object.entries({
                        mode_code: mode, has_stamp: mode, proc_preset: 3, proc_scale: 30, proc_spacing: 100,
                        proc_density: 1, proc_line_w: 2, opacity: 1, bg_type: 1, flt_blur: radius,
                        flt_brightness: 100, flt_contrast: 100, flt_saturate: 100, tile_count: 1,
                        tile_size: 38, tile_gap: 6, tile_motion: 4, tile_speed: 6.5, tile_hue_mode: 3,
                        tile_hue_speed: 14, tile_opacity: 1, tile_alt_opacity: 0.65, tile_alt_scale: 1, anim_time: 4
                    })) f(name, value);
                }
                const pixels = () => {
                    const result = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, result);
                    return result;
                };
                const comparisons = [];
                for (const mode of [0, 1]) for (const radius of [1, 15, 60]) {
                    const pad = Math.ceil(radius) + 1, width = canvas.width + pad * 2, height = canvas.height + pad * 2;
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
                    setup(direct, mode, radius, pad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    const original = pixels();
                    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
                    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Incomplete framebuffer');
                    gl.viewport(0, 0, width, height);
                    setup(scene, mode, radius, pad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
                    setup(blur, mode, radius, pad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    const actual = pixels();
                    let delta = 0, visible = 0, edgeDelta = 0;
                    for (let i = 0; i < original.length; i++) {
                        const difference = Math.abs(original[i] - actual[i]);
                        delta += difference;
                        if (i < canvas.width * 4 || i >= original.length - canvas.width * 4) edgeDelta += difference;
                        if (i % 4 === 3 && original[i]) visible++;
                    }
                    comparisons.push({ mode, radius, mean: delta / original.length, edge: edgeDelta / (canvas.width * 8), visible });
                }
                return { comparisons, error: gl.getError() };
            }, { vertex, fragment });
            assert.equal(results.error, 0);
            for (const result of results.comparisons) {
                assert.ok(result.visible > 100, JSON.stringify(result));
                assert.ok(result.mean < 2 && result.edge < 2, JSON.stringify(result));
            }
        } finally {
            await browser.close();
        }
    });

    it('uses the two-pass blur in the real studio preview and returns to a single pass when disabled', async () => {
        const state = JSON.parse(JSON.stringify(service.getState()));
        const profile = state.profiles.find(p => p.id === state.activeProfileId);
        profile.filters.blur = 15;
        profile.procedural.motion = 'none';
        profile.procedural.colorAnim = 'none';
        profile.procedural.inPlace = 'none';
        profile.procedural.spin = 'none';
        const root = path.resolve(__dirname, '../public');
        const app = http.createServer((req, res) => {
            const pathname = new URL(req.url, 'http://localhost').pathname;
            if (pathname === '/api/obs-patterns') {
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(state)); return;
            }
            if (pathname === '/api/variables') {
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"values":{}}'); return;
            }
            if (pathname === '/api/obs-patterns/obs-status') {
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"connected":false}'); return;
            }
            const file = path.resolve(root, `.${pathname}`);
            if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(404); res.end(); return; }
            fs.readFile(file, (err, data) => {
                if (err) { res.writeHead(404); res.end(); return; }
                const ext = path.extname(file);
                res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.html' ? 'text/html' : 'application/octet-stream' });
                res.end(data);
            });
        });
        await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
        const browser = await require('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', err => errors.push(err.message));
            await page.evaluateOnNewDocument(() => {
                window.__patternPasses = { scene: 0, output: 0, visible: false };
                const original = window.WebGLRenderingContext.prototype.drawArrays;
                const deleteFramebuffer = window.WebGLRenderingContext.prototype.deleteFramebuffer;
                window.__deletedPatternFrames = 0;
                window.WebGLRenderingContext.prototype.deleteFramebuffer = function (framebuffer) {
                    if (this.canvas.id === 'op-preview-canvas' && framebuffer) window.__deletedPatternFrames++;
                    return deleteFramebuffer.call(this, framebuffer);
                };
                window.WebGLRenderingContext.prototype.drawArrays = function (...args) {
                    original.apply(this, args);
                    if (this.canvas.id !== 'op-preview-canvas') return;
                    if (this.getParameter(this.FRAMEBUFFER_BINDING)) window.__patternPasses.scene++;
                    else {
                        window.__patternPasses.output++;
                        const pixel = new Uint8Array(4);
                        this.readPixels(10, 10, 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
                        window.__patternPasses.visible ||= pixel[3] > 0;
                    }
                };
            });
            await page.goto(`http://127.0.0.1:${app.address().port}/tools/obs-patterns.html#designer`);
            await page.waitForFunction(() => window.__patternPasses.scene > 0 && window.__patternPasses.output > 0);
            assert.equal(await page.evaluate(() => window.__patternPasses.visible), true);
            await page.click('[data-op-tab="sources"]');
            await page.waitForFunction(() => window.__deletedPatternFrames > 0);
            await page.evaluate(() => { window.__patternPasses = { scene: 0, output: 0, visible: false }; });
            await page.click('[data-op-tab="designer"]');
            await page.waitForFunction(() => window.__patternPasses.scene > 0 && window.__patternPasses.output > 0);
            const deletedBeforeDisable = await page.evaluate(() => window.__deletedPatternFrames);
            await page.evaluate(() => {
                window.__patternPasses = { scene: 0, output: 0, visible: false };
                const input = document.getElementById('op-flt-blur');
                input.value = '0';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await page.waitForFunction(() => window.__patternPasses.output > 0);
            assert.equal(await page.evaluate(() => window.__patternPasses.scene), 0);
            assert.ok(await page.evaluate(() => window.__deletedPatternFrames) > deletedBeforeDisable);
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
            await new Promise(resolve => app.close(resolve));
        }
    });

    it('creates default profiles, manifest.json, and Metal-safe Lua input source script', () => {
        assert.equal(PATTERNS.length, 31);
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

    it('emits static-frame cache and smooth monochrome tile hue-shift in Lua/HLSL', () => {
        const lua = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        assert.ok(lua.includes('is_profile_animated(prof)'), 'Expected static-frame check in OBS Lua tick');
        assert.ok(lua.includes('static_rendered_key'), 'Expected static_rendered_key cache in OBS Lua');
        assert.ok(lua.includes('smoothstep(0.02, 0.16, chroma)'), 'Expected smooth monochrome blend for tile hue shift');
        assert.ok(lua.includes('4096.0 * nslots'), 'Expected non-negative modulo for multi-slot tile distribution');
    });

    it('allows fine/slow Move Speed values down to 0 without 0.5 clamping in profile or shader', () => {
        const saved = service.upsertProfile({
            id: 'slow-move-test',
            name: 'Slow Move Test',
            mode: 'tiles',
            procedural: { preset: 'topography', motion: 'drift', speed: 0.05 },
            tiles: { motion: 'wave', speed: 0.1 }
        });
        assert.equal(saved.procedural.speed, 0.05);
        assert.equal(saved.tiles.speed, 0.1);

        const resolvedZero = service.upsertProfile({
            id: 'zero-move-test',
            name: 'Zero Move Test',
            mode: 'tiles',
            procedural: { preset: 'topography', motion: 'drift', speed: 0 },
            tiles: { motion: 'sway', speed: 0 }
        });
        assert.equal(resolvedZero.tiles.speed, 0);

        const manifest = service.syncResolvedManifest();
        const slowManifest = manifest.profiles.find(p => p.id === 'slow-move-test');
        const zeroManifest = manifest.profiles.find(p => p.id === 'zero-move-test');
        assert.equal(slowManifest.tiles.speed, 0.1);
        assert.equal(slowManifest.procedural.speed, 0.05);
        assert.equal(zeroManifest.tiles.speed, 0);

        const lua = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        assert.ok(!lua.includes('max(0.5, tile_speed'), 'Tile shader must not enforce a 0.5 minimum speed floor');
        assert.ok(!lua.includes('max(0.3, tile_speed'), 'Tile pong shader must not enforce a 0.3 minimum speed floor');
        assert.ok(!lua.includes('max(0.12, tile_speed'), 'Tile carousel shader must not enforce a 0.12 minimum speed floor');
    });

    it('bakes uploaded near-square image tiles edge-to-edge with zero gap when tile gap is 0', async () => {
        const source = fs.readFileSync(path.join(__dirname, '../public/js/obs-patterns/obs-patterns-studio.js'), 'utf8');
        const vertex = source.match(/const VERT_GLSL = `([\s\S]*?)`;/)[1];
        const fragment = source.match(/const FRAG_GLSL = `([\s\S]*?)`;/)[1];
        const drawSlotMatch = source.match(/async function drawSlotIntoCell\(ctx, slot, ox, oy, cellSize\) \{[\s\S]*?\n    \}/);
        assert.ok(drawSlotMatch, 'drawSlotIntoCell helper must exist in obs-patterns-studio.js');
        const browser = await require('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const page = await browser.newPage();
            const result = await page.evaluate(async ({ vertex, fragment, drawSlotCode }) => {
                const drawSlotIntoCell = new Function(`return (${drawSlotCode});`)();

                // Near-square 200x201 solid crimson PNG source (mirrors 1000x1001 uploads)
                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = 200;
                srcCanvas.height = 201;
                const sctx = srcCanvas.getContext('2d');
                sctx.fillStyle = '#cc1122';
                sctx.fillRect(0, 0, 200, 201);
                const nearSquareUrl = srcCanvas.toDataURL('image/png');

                // 1) Single-slot 512x512 stamp must fill all edges at scale=100 (min alpha === 255)
                const stampCanvas = document.createElement('canvas');
                stampCanvas.width = 512;
                stampCanvas.height = 512;
                const ctx = stampCanvas.getContext('2d');
                await drawSlotIntoCell(ctx, { sourceType: 'image', src: nearSquareUrl, scale: 100 }, 0, 0, 512);
                const stampPixels = ctx.getImageData(0, 0, 512, 512).data;
                let minEdgeAlpha = 255;
                for (let i = 0; i < 512; i++) {
                    minEdgeAlpha = Math.min(
                        minEdgeAlpha,
                        stampPixels[(0 * 512 + i) * 4 + 3],
                        stampPixels[(511 * 512 + i) * 4 + 3],
                        stampPixels[(i * 512 + 0) * 4 + 3],
                        stampPixels[(i * 512 + 511) * 4 + 3]
                    );
                }

                // 2) Render WebGL shader with bg=#00ff00, tileGap=0, tileSize=500 -> zero green background should bleed through
                const glCanvas = document.createElement('canvas');
                glCanvas.width = 320;
                glCanvas.height = 180;
                const gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true });
                const compile = (type, src) => {
                    const sh = gl.createShader(type);
                    gl.shaderSource(sh, src);
                    gl.compileShader(sh);
                    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
                    return sh;
                };
                const prog = gl.createProgram();
                gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex));
                gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
                gl.linkProgram(prog);
                gl.useProgram(prog);
                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
                const pos = gl.getAttribLocation(prog, 'a_pos');
                gl.enableVertexAttribArray(pos);
                gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stampCanvas);

                const u1f = (n, v) => gl.uniform1f(gl.getUniformLocation(prog, n), v);
                gl.uniform2f(gl.getUniformLocation(prog, 'canvas_size'), 1920, 1080);
                gl.uniform2f(gl.getUniformLocation(prog, 'stamp_size'), 512, 512);
                gl.uniform4f(gl.getUniformLocation(prog, 'bg_color'), 0, 1, 0, 1);
                gl.uniform4f(gl.getUniformLocation(prog, 'tile_tint'), 1, 1, 1, 1);
                for (const [k, v] of Object.entries({
                    mode_code: 1, bg_type: 1, opacity: 1, has_stamp: 1,
                    tile_count: 1, tile_size: 500, tile_gap: 0,
                    tile_opacity: 1, tile_alt_opacity: 1, tile_alt_scale: 1,
                    flt_brightness: 100, flt_contrast: 100, flt_saturate: 100
                })) u1f(k, v);

                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                const out = new Uint8Array(glCanvas.width * glCanvas.height * 4);
                gl.readPixels(0, 0, glCanvas.width, glCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
                let greenGapPixels = 0;
                for (let i = 0; i < out.length; i += 4) {
                    if (out[i + 1] > 40 || out[i] < 160) greenGapPixels++;
                }
                return { minEdgeAlpha, greenGapPixels, totalPixels: glCanvas.width * glCanvas.height };
            }, { vertex, fragment, drawSlotCode: drawSlotMatch[0] });
            assert.equal(result.minEdgeAlpha, 255, 'Single-slot uploaded image must fill 512x512 stamp edge-to-edge without transparent borders');
            assert.equal(result.greenGapPixels, 0, 'WebGL shader with gap=0 must render zero background gap pixels between tiles');
        } finally {
            await browser.close();
        }
    });

    it('supports mutually exclusive Pattern Tile Palette Sets, placements, styles, blends, and Lua animation flags', async () => {
        const palProf = service.upsertProfile({
            id: 'tile-pal-test',
            name: 'Tile Palette Test',
            mode: 'tiles',
            tiles: {
                colorSource: 'palette',
                hueShift: 'cycle',
                palette: 'custom',
                customColors: ['#FF0000FF', '#00FF00FF', '#0000FFFF'],
                colorMode: 'spiral',
                colorAnim: 'cycle',
                colorSpeed: 0.04,
                paletteStyle: 'gradient',
                paletteBlend: 'multiply',
                paletteStrength: 85,
                paletteScale: 220,
                paletteAngle: 45
            }
        });
        assert.equal(palProf.tiles.colorSource, 'palette');
        assert.equal(palProf.tiles.palette, 'custom');
        assert.equal(palProf.tiles.paletteStyle, 'gradient');
        assert.equal(palProf.tiles.paletteBlend, 'multiply');
        assert.equal(palProf.tiles.paletteStrength, 85);
        assert.equal(palProf.tiles.colorSpeed, 0.04);
        assert.equal(palProf.tiles.paletteScale, 220);
        assert.equal(palProf.tiles.paletteAngle, 45);

        const manifest = service.syncResolvedManifest();
        const rTile = manifest.profiles.find(p => p.id === 'tile-pal-test').tiles;
        assert.equal(rTile.colorSourceCode, 1);
        assert.equal(rTile.colorModeCode, 5); // spiral
        assert.equal(rTile.colorAnimCode, 1); // cycle
        assert.equal(rTile.paletteStyleCode, 1); // gradient
        assert.equal(rTile.paletteBlendCode, 0); // multiply
        assert.equal(rTile.paletteScale, 220);
        assert.equal(rTile.paletteAngle, 45);
        assert.equal(rTile.palCount, 3);
        assert.deepEqual(rTile.pal0, [1, 0, 0, 1]);
        assert.deepEqual(rTile.pal1, [0, 1, 0, 1]);
        assert.deepEqual(rTile.pal2, [0, 0, 1, 1]);

        const lua = fs.readFileSync(service.getState().luaScriptPath, 'utf8');
        assert.ok(lua.includes('evalTilePaletteColor'), 'Lua HLSL shader must include evalTilePaletteColor');
        assert.ok(lua.includes('tile_pal_strength'), 'Lua HLSL must expose tile_pal_strength uniform');
        assert.ok(lua.includes('(tl.colorSourceCode or 0) > 0.5'), 'Lua is_profile_animated must handle palette colorSource');

        // Verify WebGL compiles & renders distinct outputs across per-tile vs smooth gradient, placements, and blends
        const source = fs.readFileSync(path.join(__dirname, '../public/js/obs-patterns/obs-patterns-studio.js'), 'utf8');
        const vertex = source.match(/const VERT_GLSL = `([\s\S]*?)`;/)[1];
        const fragment = source.match(/const FRAG_GLSL = `([\s\S]*?)`;/)[1];
        const browser = await require('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const page = await browser.newPage();
            const stats = await page.evaluate(({ vertex, fragment }) => {
                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 90;
                const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
                const compile = (type, src) => {
                    const sh = gl.createShader(type);
                    gl.shaderSource(sh, src);
                    gl.compileShader(sh);
                    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
                    return sh;
                };
                const prog = gl.createProgram();
                gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex));
                gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
                gl.linkProgram(prog);
                if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
                gl.useProgram(prog);
                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
                const pos = gl.getAttribLocation(prog, 'a_pos');
                gl.enableVertexAttribArray(pos);
                gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

                // Warm red-orange test tile so multiply vs recolor differ clearly
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([220, 60, 40, 255]));
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

                const u1f = (n, v) => gl.uniform1f(gl.getUniformLocation(prog, n), v);
                gl.uniform2f(gl.getUniformLocation(prog, 'canvas_size'), 1920, 1080);
                gl.uniform2f(gl.getUniformLocation(prog, 'stamp_size'), 1, 1);
                gl.uniform4f(gl.getUniformLocation(prog, 'tile_tint'), 1, 1, 1, 1);
                gl.uniform4f(gl.getUniformLocation(prog, 'pal_c0'), 0, 1, 0.9, 1);
                gl.uniform4f(gl.getUniformLocation(prog, 'pal_c1'), 1, 0.2, 0.8, 1);
                gl.uniform4f(gl.getUniformLocation(prog, 'pal_c2'), 0.2, 0.4, 1, 1);
                u1f('pal_count', 3);
                for (const [k, v] of Object.entries({
                    mode_code: 1, opacity: 1, has_stamp: 1, tile_count: 1, tile_size: 180, tile_gap: 0,
                    tile_opacity: 1, tile_alt_opacity: 1, tile_alt_scale: 1, tile_color_source: 1,
                    tile_pal_strength: 1, tile_pal_cspeed: 1.5, tile_pal_scale: 1, tile_pal_angle_rad: 0,
                    flt_brightness: 100, flt_contrast: 100, flt_saturate: 100
                })) u1f(k, v);

                const capture = (overrides) => {
                    for (const [k, v] of Object.entries(overrides)) u1f(k, v);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    const p = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, p);
                    let h = 2166136261;
                    for (let i = 0; i < p.length; i += 8) h = ((h ^ p[i]) * 16777619) >>> 0;
                    return { hash: h, pixels: p };
                };

                const digests = [];
                for (const cmode of [0, 1, 2, 3, 4, 5, 6]) {
                    for (const style of [0, 1]) {
                        for (const blend of [0, 1]) {
                            digests.push(capture({ tile_pal_cmode: cmode, tile_pal_style: style, tile_pal_blend: blend, tile_pal_canim: 0, anim_time: 0 }).hash);
                        }
                    }
                }
                const gradBase = capture({ tile_pal_cmode: 2, tile_pal_style: 1, tile_pal_blend: 1, tile_pal_canim: 0, tile_pal_scale: 1, tile_pal_angle_rad: 0, anim_time: 0 }).hash;
                const gradScaled = capture({ tile_pal_scale: 2.5, tile_pal_angle_rad: 0 }).hash;
                const gradAngled = capture({ tile_pal_scale: 1, tile_pal_angle_rad: 0.7854 }).hash;
                // Sample -1, 0, +1 diagonal cells around canvas center (80, 45) to ensure no center mirror
                const diagFrame = capture({ tile_pal_cmode: 4, tile_pal_style: 0, tile_pal_blend: 1, tile_pal_canim: 0, tile_pal_scale: 1, tile_pal_angle_rad: 0, anim_time: 0 }).pixels;
                const pxAt = (cx, cy) => {
                    const idx = (cy * canvas.width + cx) * 4;
                    return `${diagFrame[idx]},${diagFrame[idx + 1]},${diagFrame[idx + 2]}`;
                };
                // Sample -1, 0, +1 diagonal cells around canvas center (tile_size=180 -> 15px in 160w: cells at 72, 88, 102)
                const centerCols = [pxAt(72, 45), pxAt(88, 45), pxAt(102, 45)];
                const animT0 = capture({ tile_pal_cmode: 5, tile_pal_style: 1, tile_pal_blend: 1, tile_pal_canim: 1, anim_time: 0 }).hash;
                const animT1 = capture({ tile_pal_cmode: 5, tile_pal_style: 1, tile_pal_blend: 1, tile_pal_canim: 1, anim_time: 1.2 }).hash;
                const hueIgnoredA = capture({ tile_color_source: 1, tile_hue_mode: 0, tile_pal_cmode: 2, tile_pal_style: 0, tile_pal_blend: 1, tile_pal_canim: 0, anim_time: 0.7 }).hash;
                const hueIgnoredB = capture({ tile_color_source: 1, tile_hue_mode: 2, tile_pal_cmode: 2, tile_pal_style: 0, tile_pal_blend: 1, tile_pal_canim: 0, anim_time: 0.7 }).hash;
                return {
                    uniqueModes: new Set(digests).size,
                    totalTested: digests.length,
                    gradScaleChanged: gradBase !== gradScaled,
                    gradAngleChanged: gradBase !== gradAngled,
                    distinctDiagonalSteps: new Set(centerCols).size,
                    animChanged: animT0 !== animT1,
                    hueMutuallyExclusive: hueIgnoredA === hueIgnoredB
                };
            }, { vertex, fragment });
            assert.equal(stats.totalTested, 28);
            assert.ok(stats.uniqueModes >= 20, `Expected distinct renders across placements/styles/blends, got ${stats.uniqueModes}`);
            assert.equal(stats.gradScaleChanged, true, 'Band Width must adjust gradient band spacing');
            assert.equal(stats.gradAngleChanged, true, 'Gradient Angle must rotate smooth gradient bands');
            assert.equal(stats.distinctDiagonalSteps, 3, 'Per-tile diagonal must not mirror colors across center');
            assert.equal(stats.animChanged, true, 'Palette cycle animation must advance tiles over time');
            assert.equal(stats.hueMutuallyExclusive, true, 'Hue shift uniform must not affect Palette Set output');
        } finally {
            await browser.close();
        }
    });
});
