/**
 * OBS Border Studio API & Companion Routes
 */

const fs = require('fs');
const { readRequestBody, sendJson, sendText, sendError } = require('./helpers');

function createObsBordersRoutes({
    obsBordersService,
    obsService = null,
    isLoopbackRequest = () => true
} = {}) {
    return async function handleObsBordersRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/obs-borders')) return false;

        // GET /api/obs-borders — full studio state
        if (pathname === '/api/obs-borders' && req.method === 'GET') {
            sendJson(res, obsBordersService.getState());
            return true;
        }

        // GET /api/obs-borders/status — Companion-friendly status summary
        if (pathname === '/api/obs-borders/status' && req.method === 'GET') {
            const st = obsBordersService.getState();
            const active = st.profiles.find(p => p.id === st.activeProfileId) || st.profiles[0] || null;
            sendJson(res, {
                activeProfileId: st.activeProfileId,
                activeProfileName: active ? active.name : '',
                profilesCount: st.profiles.length,
                bundlesCount: st.knownBundles.length,
                scenesCount: st.knownScenes.length,
                revision: st.revision
            });
            return true;
        }

        // GET /api/obs-borders/manifest — resolved manifest.json for OBS Lua script
        if (pathname === '/api/obs-borders/manifest' && req.method === 'GET') {
            const manifest = obsBordersService.syncResolvedManifest();
            sendJson(res, manifest || { error: 'Manifest unavailable' });
            return true;
        }

        // GET /api/obs-borders/lua — download or view generated streampulse-borders.lua
        if (pathname === '/api/obs-borders/lua' && req.method === 'GET') {
            const lua = obsBordersService.regenerateLuaScript();
            const download = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';
            res.writeHead(200, {
                'Content-Type': 'text/x-lua; charset=utf-8',
                'Cache-Control': 'no-store',
                ...(download ? { 'Content-Disposition': 'attachment; filename="streampulse-borders.lua"' } : {})
            });
            res.end(lua);
            return true;
        }

        // GET or POST /api/obs-borders/activate?profile=<id>&target=<optionalBundleName>
        if (pathname === '/api/obs-borders/activate' && (req.method === 'GET' || req.method === 'POST')) {
            try {
                let profileId = url.searchParams.get('profile') || url.searchParams.get('id') || '';
                let targetName = url.searchParams.get('target') || '';
                if (req.method === 'POST') {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    if (body.profileId || body.profile || body.id) profileId = body.profileId || body.profile || body.id;
                    if (body.target) targetName = body.target;
                }
                if (!profileId) throw new Error('Missing profile parameter');
                if (targetName) {
                    const nextState = obsBordersService.assignTargetToProfile(targetName, profileId);
                    sendJson(res, { status: 'assigned', target: targetName, profileId, state: nextState });
                } else {
                    const active = obsBordersService.setActiveProfile(profileId);
                    sendJson(res, { status: 'activated', activeProfileId: active.id, profile: active, state: obsBordersService.getState() });
                }
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST or PUT /api/obs-borders/profile — create or update a border profile
        if (pathname === '/api/obs-borders/profile' && (req.method === 'POST' || req.method === 'PUT')) {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const setActive = Boolean(body.setActive);
                const profile = obsBordersService.upsertProfile(body.profile || body, { setActive });
                sendJson(res, { status: 'saved', profile, state: obsBordersService.getState() });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/profile/:id/duplicate
        const dupMatch = pathname.match(/^\/api\/obs-borders\/profile\/([^/]+)\/duplicate$/);
        if (dupMatch && req.method === 'POST') {
            try {
                const profileId = decodeURIComponent(dupMatch[1]);
                const profile = obsBordersService.duplicateProfile(profileId);
                sendJson(res, { status: 'duplicated', profile, state: obsBordersService.getState() });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // DELETE /api/obs-borders/profile/:id
        const delMatch = pathname.match(/^\/api\/obs-borders\/profile\/([^/]+)$/);
        if (delMatch && req.method === 'DELETE') {
            try {
                const profileId = decodeURIComponent(delMatch[1]);
                const state = obsBordersService.deleteProfile(profileId);
                sendJson(res, { status: 'deleted', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/reset-defaults
        if (pathname === '/api/obs-borders/reset-defaults' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                const state = obsBordersService.resetDefaults();
                sendJson(res, { status: 'reset', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/import-scenes — import from OBS JSON path, uploaded JSON, or live OBS WebSocket
        if (pathname === '/api/obs-borders/import-scenes' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                if (body.filePath && !isLoopbackRequest(req)) {
                    sendError(res, 'Reading a local OBS JSON path requires a local loopback connection', 403);
                    return true;
                }
                const result = obsBordersService.importObsSceneCollection({
                    filePath: body.filePath,
                    jsonData: body.jsonData
                });
                sendJson(res, {
                    status: 'imported',
                    ...result,
                    state: obsBordersService.getState()
                });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        return false;
    };
}

module.exports = { createObsBordersRoutes };
