'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createPalettesService } = require('../server/services/palettes');
const { createPalettesRoutes } = require('../server/routes/palettes');
const { normalizeCustomOverlay, generateSvgThumbnail } = require('../server/services/overlays');

function reqJson(port, method, reqPath, body) {
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
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                let parsed = raw;
                try { parsed = JSON.parse(raw); } catch {}
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('Shared Color Palettes Library & Multi-Stop Overlay Gradients', () => {
    let tmpDir;
    let service;
    let server;
    let port;
    const changeEvents = [];

    before(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streampulse-palettes-test-'));
        service = createPalettesService({
            dataDir: tmpDir,
            onChange: snapshot => changeEvents.push(snapshot)
        });
        const handlePalettes = createPalettesRoutes({ palettesService: service });
        server = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            const handled = await handlePalettes(req, res, url, url.pathname);
            if (!handled) {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    });

    after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exposes built-in curated palettes and persists custom multi-stop CRUD with validation', () => {
        const initial = service.list();
        assert.ok(initial.builtin.length >= 18, 'should include built-in curated palettes');
        assert.equal(initial.custom.length, 0);

        const created = service.create({
            name: 'Brand Sunset',
            colors: ['#FF4D6D', '#FF9E00', '#FFD166', '{{var.brand_accent|#38BDF8}}'],
            angle: 120
        });
        assert.equal(created.name, 'Brand Sunset');
        assert.equal(created.builtin, false);
        assert.equal(created.colors.length, 4);
        assert.equal(created.angle, 120);
        assert.ok(changeEvents.length >= 1);

        // Reload from disk and verify persistence
        const reloaded = createPalettesService({ dataDir: tmpDir });
        assert.equal(reloaded.list().custom.length, 1);
        assert.deepEqual(reloaded.getById(created.id).colors, created.colors);

        // Update custom palette
        const updated = service.update(created.id, {
            name: 'Brand Sunset v2',
            colors: ['#FF0055', '#7B2CBF', '#00BBF9']
        });
        assert.equal(updated.name, 'Brand Sunset v2');
        assert.equal(updated.colors.length, 3);

        // Built-in palettes cannot be overwritten or deleted, but can be duplicated
        assert.throws(() => service.update('neon', { name: 'Hacked' }), /Built-in/);
        assert.throws(() => service.remove('neon'), /Built-in/);
        const dup = service.duplicate('neon', 'My Neon Copy');
        assert.equal(dup.builtin, false);
        assert.equal(dup.name, 'My Neon Copy');
        assert.ok(dup.colors.length >= 2);

        // Validation rejects < 2 stops or blank name
        assert.throws(() => service.create({ name: '', colors: ['#111111', '#222222'] }), /name/i);
        assert.throws(() => service.create({ name: 'Too Short', colors: ['#111111'] }), /At least 2/);

        service.remove(dup.id);
        service.remove(created.id);
        assert.equal(service.list().custom.length, 0);
    });

    it('supports REST CRUD endpoints on /api/palettes', async () => {
        const listRes = await reqJson(port, 'GET', '/api/palettes');
        assert.equal(listRes.status, 200);
        assert.ok(Array.isArray(listRes.body.builtin) && listRes.body.builtin.length >= 18);

        const statusRes = await reqJson(port, 'GET', '/api/palettes/status');
        assert.equal(statusRes.status, 200);
        assert.equal(statusRes.body.customCount, 0);

        const postRes = await reqJson(port, 'POST', '/api/palettes', {
            name: 'Cyber Dawn',
            colors: ['#0F172A', '#3B82F6', '#A855F7', '#EC4899', '#F59E0B'],
            angle: 90
        });
        assert.equal(postRes.status, 201);
        const id = postRes.body.palette.id;
        assert.equal(postRes.body.palette.colors.length, 5);

        const getRes = await reqJson(port, 'GET', `/api/palettes/${encodeURIComponent(id)}`);
        assert.equal(getRes.status, 200);
        assert.equal(getRes.body.palette.name, 'Cyber Dawn');

        const putRes = await reqJson(port, 'PUT', `/api/palettes/${encodeURIComponent(id)}`, {
            name: 'Cyber Dusk',
            colors: ['#1E1B4B', '#7C3AED', '#F43F5E']
        });
        assert.equal(putRes.status, 200);
        assert.equal(putRes.body.palette.name, 'Cyber Dusk');

        const dupRes = await reqJson(port, 'POST', `/api/palettes/${encodeURIComponent(id)}/duplicate`, { name: 'Cyber Dusk 2' });
        assert.equal(dupRes.status, 201);
        assert.equal(dupRes.body.palette.name, 'Cyber Dusk 2');

        const del1 = await reqJson(port, 'DELETE', `/api/palettes/${encodeURIComponent(id)}`);
        const del2 = await reqJson(port, 'DELETE', `/api/palettes/${encodeURIComponent(dupRes.body.palette.id)}`);
        assert.equal(del1.status, 200);
        assert.equal(del2.status, 200);

        const missing = await reqJson(port, 'GET', '/api/palettes/does-not-exist');
        assert.equal(missing.status, 404);
    });

    it('preserves multi-stop custom palettes across overlay text, background, border, canvas, and pattern normalization', () => {
        const saved = normalizeCustomOverlay({
            id: 'pal-test',
            name: 'Palette Test Overlay',
            canvas: {
                width: 1920,
                height: 1080,
                background: 'transparent',
                gradient: {
                    enabled: true,
                    type: 'linear',
                    angle: 135,
                    blendMode: 'stepped',
                    spread: 50,
                    repeat: true,
                    paletteId: 'cyber-dawn',
                    colors: ['#0F172A', '#3B82F6', '#A855F7', '#EC4899'],
                    animate: true,
                    speed: 10
                }
            },
            elements: [
                {
                    id: 'txt-1',
                    type: 'text',
                    name: 'Hero Title',
                    content: 'LIVE NOW',
                    style: {
                        textGradient: {
                            enabled: true,
                            paletteId: 'brand-sunset',
                            colors: ['#FF4D6D', '#FF9E00', '#FFD166', '#06D6A0'],
                            angle: 90
                        },
                        gradient: {
                            enabled: true,
                            colors: ['#0B1120', '#1E293B', '#312E81'],
                            angle: 180
                        },
                        borderWidth: 4,
                        borderGradient: {
                            enabled: true,
                            colors: ['#38BDF8', '#A855F7', '#F472B6', '#FACC15'],
                            angle: 45
                        }
                    }
                },
                {
                    id: 'pat-1',
                    type: 'pattern',
                    name: 'Custom Starfield',
                    pattern: {
                        sourceType: 'preset',
                        preset: 'starfield',
                        palette: 'brand-sunset',
                        customColors: ['#FF4D6D', '#FF9E00', '#FFD166', '#06D6A0']
                    }
                }
            ]
        });

        assert.equal(saved.canvas.gradient.enabled, true);
        assert.equal(saved.canvas.gradient.blendMode, 'stepped');
        assert.equal(saved.canvas.gradient.spread, 50);
        assert.equal(saved.canvas.gradient.repeat, true);
        assert.deepEqual(saved.canvas.gradient.colors, ['#0F172A', '#3B82F6', '#A855F7', '#EC4899']);
        assert.equal(saved.canvas.gradient.paletteId, 'cyber-dawn');

        const txt = saved.elements.find(e => e.id === 'txt-1');
        assert.deepEqual(txt.style.textGradient.colors, ['#FF4D6D', '#FF9E00', '#FFD166', '#06D6A0']);
        assert.deepEqual(txt.style.gradient.colors, ['#0B1120', '#1E293B', '#312E81']);
        assert.deepEqual(txt.style.borderGradient.colors, ['#38BDF8', '#A855F7', '#F472B6', '#FACC15']);

        const pat = saved.elements.find(e => e.id === 'pat-1');
        assert.equal(pat.pattern.palette, 'brand-sunset');
        assert.deepEqual(pat.pattern.customColors, ['#FF4D6D', '#FF9E00', '#FFD166', '#06D6A0']);

        const svg = generateSvgThumbnail(saved);
        assert.ok(svg.includes('#0F172A') && svg.includes('#A855F7') && svg.includes('#EC4899'), 'SVG thumbnail should render all canvas gradient stops');
    });

    it('wires shared palette library across editor, live overlay, OBS studios, and backup without raw emojis', () => {
        const root = path.resolve(__dirname, '..');
        const editorHtml = fs.readFileSync(path.join(root, 'public/editors/custom-overlay-editor.html'), 'utf8');
        const overlayHtml = fs.readFileSync(path.join(root, 'public/overlays/custom-overlay.html'), 'utf8');
        const bordersHtml = fs.readFileSync(path.join(root, 'public/tools/obs-borders.html'), 'utf8');
        const patternsHtml = fs.readFileSync(path.join(root, 'public/tools/obs-patterns.html'), 'utf8');
        const backupJs = fs.readFileSync(path.join(root, 'server/services/backup.js'), 'utf8');
        const palJs = fs.readFileSync(path.join(root, 'public/js/palette-library.js'), 'utf8');

        assert.ok(editorHtml.includes('/js/palette-library.js'));
        assert.ok(editorHtml.includes('/css/palette-library.css'));
        assert.ok(overlayHtml.includes('/js/palette-library.js'));
        assert.ok(bordersHtml.includes('/js/palette-library.js'));
        assert.ok(patternsHtml.includes('/js/palette-library.js'));
        assert.ok(backupJs.includes('palettes.json'));
        assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(palJs), 'palette-library.js must not contain raw unicode emojis');
    });
});
