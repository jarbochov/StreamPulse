'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createOperatorService, slugifyProfileId } = require('../server/services/operator');
const { createOperatorRoutes } = require('../server/routes/operator');

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(status, headers = {}) {
            this.statusCode = status;
            this.headers = headers;
        },
        end(chunk = '') {
            this.body += chunk;
        },
        json() {
            return JSON.parse(this.body || '{}');
        }
    };
}

function createMockReq(method, urlStr, bodyObj = null) {
    const raw = bodyObj !== null ? JSON.stringify(bodyObj) : '';
    const listeners = {};
    return {
        method,
        url: urlStr,
        headers: { host: 'localhost:3000' },
        on(event, fn) {
            listeners[event] = fn;
            if (event === 'end') {
                setImmediate(() => {
                    if (raw && listeners.data) listeners.data(Buffer.from(raw));
                    fn();
                });
            }
        },
        destroy() {}
    };
}

test('Operator Service manages presets, switching, import/export, validation, and reload', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-svc-'));
    const broadcasts = [];
    const svc = createOperatorService({
        dataDir: tmpDir,
        broadcastToOverlays: (type, data) => broadcasts.push({ type, data })
    });

    // Default seeded state
    const initial = svc.getState();
    assert.equal(initial.activeProfileId, 'default');
    assert.equal(initial.profiles.length, 1);
    assert.equal(initial.profiles[0].name, 'Main Show');

    // Cannot delete last remaining profile
    assert.throws(() => svc.deleteProfile('default'), /last remaining/i);

    // Upsert & activate second preset
    const gameplay = svc.upsertProfile({
        name: 'Gameplay Mode',
        description: 'Live timers and overlays',
        board: {
            columns: 2,
            cards: [
                { type: 'timers-list', title: 'Race Clocks', span: 2 },
                { type: 'overlay-control', title: 'HUD', config: { overlayId: 'hud-main' } }
            ]
        },
        overlays: ['hud-main', 'hud-main', 'credits-bar'],
        tabs: { hidden: ['music'] }
    }, { activate: true });

    assert.equal(gameplay.id, 'gameplay-mode');
    assert.deepEqual(gameplay.overlays, ['hud-main', 'credits-bar']);
    assert.equal(gameplay.board.columns, 2);
    assert.equal(gameplay.board.cards.length, 2);
    assert.equal(svc.getActiveProfile().id, 'gameplay-mode');
    assert.ok(broadcasts.some(b => b.type === 'operator-active-profile' && b.data.activeProfileId === 'gameplay-mode'));

    // Activate by case-insensitive name (Companion-friendly)
    const back = svc.setActiveProfile('main show');
    assert.equal(back.id, 'default');

    // Export single & full
    const exportedSingle = svc.exportState('gameplay-mode');
    assert.equal(exportedSingle.format, 'streampulse-operator-profiles');
    assert.equal(exportedSingle.profiles.length, 1);

    // Delete gameplay-mode then restore via merge import
    const delRes = svc.deleteProfile('gameplay-mode');
    assert.equal(delRes.deleted, 'gameplay-mode');
    assert.equal(svc.listProfiles().length, 1);

    const impMerge = svc.importState(exportedSingle, { mode: 'merge' });
    assert.equal(impMerge.importedCount, 1);
    assert.equal(svc.listProfiles().length, 2);

    // Replace import
    const impReplace = svc.importState({
        activeProfileId: 'talk-show',
        profiles: [{ id: 'talk-show', name: 'Talk Show', board: { columns: 4, cards: [] }, overlays: ['podcast-overlay'] }]
    }, { mode: 'replace' });
    assert.equal(impReplace.mode, 'replace');
    assert.equal(svc.listProfiles().length, 1);
    assert.equal(svc.getActiveProfile().id, 'talk-show');

    // Reload from disk (backup restore behavior)
    const freshSvc = createOperatorService({ dataDir: tmpDir });
    assert.equal(freshSvc.getActiveProfile().name, 'Talk Show');
    fs.writeFileSync(path.join(tmpDir, 'operator-profiles.json'), JSON.stringify({
        version: 1,
        activeProfileId: 'restored',
        profiles: [{ id: 'restored', name: 'Restored Board', board: { columns: 3, cards: [] }, overlays: [] }]
    }));
    svc.reload();
    assert.equal(svc.getActiveProfile().id, 'restored');
    assert.equal(slugifyProfileId('My Cool Scene!'), 'my-cool-scene');

    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Operator Routes handle REST + Companion GET triggers and validation errors', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-operator-routes-'));
    const svc = createOperatorService({ dataDir: tmpDir });
    const handle = createOperatorRoutes({ operatorService: svc });

    const call = async (method, pathAndQuery, body = null) => {
        const url = new URL(`http://localhost:3000${pathAndQuery}`);
        const req = createMockReq(method, pathAndQuery, body);
        const res = createMockRes();
        const handled = await handle(req, res, url, url.pathname);
        return { handled, status: res.statusCode, json: res.json(), headers: res.headers };
    };

    // Unrelated path returns false
    const ignored = await call('GET', '/api/timers');
    assert.equal(ignored.handled, false);

    // Status summary
    const st = await call('GET', '/api/operator/status');
    assert.equal(st.handled, true);
    assert.equal(st.status, 200);
    assert.equal(st.json.activeProfileName, 'Main Show');

    // POST create + select
    const created = await call('POST', '/api/operator/profiles?select=1', {
        name: 'Stream Deck Ops',
        board: { columns: 3, cards: [{ type: 'alerts-queue', title: 'Alerts' }] },
        overlays: ['ov-1']
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.activeProfileId, 'stream-deck-ops');

    // Companion GET /api/operator/profile/select?id=default
    const compSel = await call('GET', '/api/operator/profile/select?id=default');
    assert.equal(compSel.status, 200);
    assert.equal(compSel.json.activeProfileId, 'default');

    // Companion GET /api/operator/profiles/:id/activate
    const act = await call('GET', '/api/operator/profiles/stream-deck-ops/activate');
    assert.equal(act.status, 200);
    assert.equal(act.json.activeProfileId, 'stream-deck-ops');

    // Export download header check
    const exp = await call('GET', '/api/operator/export?download=1');
    assert.equal(exp.status, 200);
    assert.match(exp.headers['Content-Disposition'] || '', /attachment;/);

    // 404 on unknown profile
    const missing = await call('GET', '/api/operator/profiles/does-not-exist');
    assert.equal(missing.status, 404);

    // DELETE created profile falls back to default cleanly
    const del = await call('DELETE', '/api/operator/profiles/stream-deck-ops');
    assert.equal(del.status, 200);
    assert.equal(del.json.activeProfileId, 'default');

    fs.rmSync(tmpDir, { recursive: true, force: true });
});
