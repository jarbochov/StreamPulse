const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createObsBordersService } = require('../server/services/obs-borders');
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

    it('creates default profiles, manifest.json, and Metal-safe Lua script on init', () => {
        const state = service.getState();
        assert.ok(state.profiles.length >= 4);
        assert.equal(state.activeProfileId, 'dual-gradient-bundle');
        assert.ok(fs.existsSync(state.manifestPath));
        assert.ok(fs.existsSync(state.luaScriptPath));

        const lua = fs.readFileSync(state.luaScriptPath, 'utf8');
        assert.match(lua, /obs\.OBS_SOURCE_TYPE_FILTER/);
        assert.match(lua, /sdRoundedBox/);
        assert.match(lua, /technique Draw/);
    });

    it('resolves Variable Settings tokens into manifest.json and respects gate', () => {
        const saved = service.upsertProfile({
            id: 'var-bound-test',
            name: 'Variable Bound Frame',
            radius: 'var:theme.radius|10',
            inner: {
                enabled: true,
                style: 'outset-bevel',
                thickness: 'var:theme.border_width|6',
                color1: 'var:theme.primary|#112233FF',
                color2: '#000000FF'
            }
        }, { setActive: true });

        assert.equal(saved.id, 'var-bound-test');
        let manifest = JSON.parse(fs.readFileSync(service.getState().manifestPath, 'utf8'));
        let resolved = manifest.profiles.find(p => p.id === 'var-bound-test');
        assert.equal(resolved.radius, 28);
        assert.equal(resolved.inner.thickness, 16);
        assert.equal(resolved.inner.color1, '#FF0088FF');
        assert.equal(resolved.inner.styleCode, 3); // outset-bevel

        // Gate disabled -> falls back to inline fallback values
        varSettingsEnabled = false;
        manifest = service.syncResolvedManifest();
        resolved = manifest.profiles.find(p => p.id === 'var-bound-test');
        assert.equal(resolved.radius, 10);
        assert.equal(resolved.inner.thickness, 6);
        assert.equal(resolved.inner.color1, '#112233FF');
        varSettingsEnabled = true;
    });

    it('imports OBS Scene Collection JSON and extracts scenes, bundles, and shader targets', async () => {
        const fakeObsJson = {
            name: 'TestCollection',
            sources: [
                {
                    name: 'Bundle - Webcam Full w/ Border',
                    id: 'scene',
                    filters: [{ id: 'shader_filter', name: 'Inner Border' }]
                },
                {
                    name: 'Main Gameplay',
                    id: 'scene',
                    filters: []
                },
                {
                    name: 'Fullscreen Camera',
                    id: 'scene',
                    filters: []
                }
            ]
        };

        const res = await requestJson(port, 'POST', '/api/obs-borders/import-scenes', { jsonData: fakeObsJson });
        assert.equal(res.status, 200);
        assert.equal(res.body.collectionName, 'TestCollection');
        assert.ok(res.body.scenes.includes('Main Gameplay'));
        assert.ok(res.body.scenes.includes('Fullscreen Camera'));
        assert.ok(res.body.bundles.includes('Bundle - Webcam Full w/ Border'));
        assert.equal(res.body.legacyShaderTargets.length, 1);
    });

    it('supports Companion HTTP activation, target assignment, duplication, and Lua download', async () => {
        const actRes = await requestJson(
            port,
            'GET',
            '/api/obs-borders/activate?profile=outset-3d-bevel&target=Bundle%20-%20Webcam%20Full%20w%2F%20Border'
        );
        assert.equal(actRes.status, 200);
        assert.equal(actRes.body.status, 'assigned');
        assert.equal(actRes.body.state.targetOverrides['Bundle - Webcam Full w/ Border'], 'outset-3d-bevel');

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
});
