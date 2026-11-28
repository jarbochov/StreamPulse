/**
 * StreamPulse OBS Pattern Studio Routes (Beta / Advanced)
 */

const fs = require('fs');
const { sendJson, sendError, readRequestBody } = require('./helpers');

function createObsPatternsRoutes({ obsPatternsService, obsService, isLoopbackRequest }) {
    async function pushSyncToObsSources() {
        try {
            if (!obsService || typeof obsService.callRequest !== 'function') return;
            if (!obsService.getStatus?.().connected) return;
            const st = obsPatternsService.getState();
            const targets = Array.isArray(st.knownPatternSources) ? st.knownPatternSources : [];
            if (!targets.length) return;
            const syncRev = Date.now();
            await Promise.all(targets.slice(0, 60).map(async (inputName) => {
                try {
                    const patch = { sync_revision: syncRev, profile_id: 'auto' };
                    await obsService.callRequest('SetInputSettings', {
                        inputName,
                        inputSettings: patch,
                        overlay: true
                    });
                } catch {
                    /* ignore sources not currently loaded */
                }
            }));
        } catch {
            /* ignore live push errors */
        }
    }

    return async function handleObsPatternsRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/obs-patterns')) return false;

        // GET /api/obs-patterns/status
        if (pathname === '/api/obs-patterns/status' && req.method === 'GET') {
            const st = obsPatternsService.getState();
            const active = st.profiles.find(p => p.id === st.activeProfileId) || st.profiles[0] || null;
            sendJson(res, {
                revision: st.revision,
                activeProfileId: st.activeProfileId,
                activeProfileName: active?.name || '',
                profilesCount: st.profiles.length,
                assignmentsCount: Object.keys(st.assignments || {}).length,
                knownScenesCount: st.knownScenes.length,
                knownPatternSourcesCount: st.knownPatternSources.length,
                variableSettingsEnabled: st.variableSettingsEnabled
            });
            return true;
        }

        // GET /api/obs-patterns
        if (pathname === '/api/obs-patterns' && req.method === 'GET') {
            sendJson(res, obsPatternsService.getState());
            return true;
        }

        // GET /api/obs-patterns/stamps/:file
        if (pathname.startsWith('/api/obs-patterns/stamps/') && req.method === 'GET') {
            const fileName = decodeURIComponent(pathname.replace('/api/obs-patterns/stamps/', ''));
            const fullPath = obsPatternsService.resolveStampFilePath(fileName);
            if (!fullPath) {
                sendError(res, 'Stamp not found', 404);
                return true;
            }
            const buf = fs.readFileSync(fullPath);
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
                'Content-Length': buf.length
            });
            res.end(buf);
            return true;
        }

        // POST /api/obs-patterns/stamp
        if (pathname === '/api/obs-patterns/stamp' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const saved = obsPatternsService.saveStampPng({ id: body.id, dataUrl: body.dataUrl });
                sendJson(res, { status: 'saved', ...saved });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // GET /api/obs-patterns/manifest
        if (pathname === '/api/obs-patterns/manifest' && req.method === 'GET') {
            const manifest = obsPatternsService.syncResolvedManifest();
            sendJson(res, manifest || {});
            return true;
        }

        // GET /api/obs-patterns/lua
        if (pathname === '/api/obs-patterns/lua' && req.method === 'GET') {
            const lua = obsPatternsService.regenerateLuaScript();
            const download = url.searchParams.get('download') === '1';
            const headers = {
                'Content-Type': 'text/x-lua; charset=utf-8',
                'Cache-Control': 'no-store'
            };
            if (download) headers['Content-Disposition'] = 'attachment; filename="streampulse-patterns.lua"';
            res.writeHead(200, headers);
            res.end(lua);
            return true;
        }

        // GET|POST /api/obs-patterns/activate
        if (pathname === '/api/obs-patterns/activate' && (req.method === 'GET' || req.method === 'POST')) {
            try {
                let body = {};
                if (req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    if (raw) body = JSON.parse(raw);
                }
                const profileId = (url.searchParams.get('profile') || body.profileId || body.profile || '').trim();
                const target = (url.searchParams.get('target') || url.searchParams.get('source') || body.sourceName || body.target || '').trim();
                const scene = (url.searchParams.get('scene') || body.sceneName || body.scene || '').trim();
                let targetNames = [
                    ...(Array.isArray(body.sourceNames) ? body.sourceNames : []),
                    ...(Array.isArray(body.targets) ? body.targets : []),
                    ...(target ? [target] : [])
                ];
                let sceneNames = [
                    ...(Array.isArray(body.sceneNames) ? body.sceneNames : []),
                    ...(Array.isArray(body.scenes) ? body.scenes : []),
                    ...(scene ? [scene] : [])
                ];
                targetNames = [...new Set(targetNames.map(v => String(v || '').trim()).filter(Boolean))];
                sceneNames = [...new Set(sceneNames.map(v => String(v || '').trim()).filter(Boolean))];
                if (!profileId) {
                    sendError(res, 'profile query parameter or profileId body field is required', 400);
                    return true;
                }
                if (targetNames.length > 0) {
                    const effectiveScenes = sceneNames.length > 0 ? sceneNames : [''];
                    let nextState = obsPatternsService.getState();
                    const applied = [];
                    for (const src of targetNames) {
                        for (const scn of effectiveScenes) {
                            nextState = obsPatternsService.setSourceAssignment({ sourceName: src, sceneName: scn, profileId });
                            applied.push({ sourceName: src, sceneName: scn });
                        }
                    }
                    pushSyncToObsSources();
                    if (applied.length === 1) {
                        sendJson(res, { status: 'assigned', target: applied[0].sourceName, scene: applied[0].sceneName || null, profileId, state: nextState });
                    } else {
                        sendJson(res, { status: 'assigned', count: applied.length, targets: targetNames, scenes: sceneNames, profileId, state: nextState });
                    }
                    return true;
                }
                const active = obsPatternsService.setActiveProfile(profileId);
                pushSyncToObsSources();
                sendJson(res, { status: 'activated', activeProfileId: active.id, profile: active, state: obsPatternsService.getState() });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-patterns/assign
        if (pathname === '/api/obs-patterns/assign' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const state = obsPatternsService.setSourceAssignment({
                    sourceName: body.sourceName,
                    sceneName: body.sceneName || '',
                    profileId: body.profileId || 'auto'
                });
                pushSyncToObsSources();
                sendJson(res, { status: 'assigned', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-patterns/palette
        if (pathname === '/api/obs-patterns/palette' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const result = obsPatternsService.upsertCustomPalette(body.palette || body);
                sendJson(res, { status: 'saved', ...result });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // DELETE /api/obs-patterns/palette/:id
        const delPalMatch = pathname.match(/^\/api\/obs-patterns\/palette\/([^/]+)$/);
        if (delPalMatch && req.method === 'DELETE') {
            try {
                const state = obsPatternsService.deleteCustomPalette(decodeURIComponent(delPalMatch[1]));
                sendJson(res, { status: 'deleted', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-patterns/profile
        if (pathname === '/api/obs-patterns/profile' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const profile = obsPatternsService.upsertProfile(body.profile || body, { setActive: Boolean(body.setActive) });
                pushSyncToObsSources();
                sendJson(res, { status: 'saved', profile, state: obsPatternsService.getState() });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-patterns/profile/:id/duplicate
        const dupMatch = pathname.match(/^\/api\/obs-patterns\/profile\/([^/]+)\/duplicate$/);
        if (dupMatch && req.method === 'POST') {
            try {
                const profile = obsPatternsService.duplicateProfile(decodeURIComponent(dupMatch[1]));
                sendJson(res, { status: 'duplicated', profile, state: obsPatternsService.getState() });
            } catch (err) {
                sendError(res, err, 404);
            }
            return true;
        }

        // DELETE /api/obs-patterns/profile/:id
        const delMatch = pathname.match(/^\/api\/obs-patterns\/profile\/([^/]+)$/);
        if (delMatch && req.method === 'DELETE') {
            try {
                const state = obsPatternsService.deleteProfile(decodeURIComponent(delMatch[1]));
                pushSyncToObsSources();
                sendJson(res, { status: 'deleted', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-patterns/reset-defaults
        if (pathname === '/api/obs-patterns/reset-defaults' && req.method === 'POST') {
            try {
                const state = obsPatternsService.resetDefaults();
                pushSyncToObsSources();
                sendJson(res, { status: 'reset', state });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        // GET /api/obs-patterns/obs-status
        if (pathname === '/api/obs-patterns/obs-status' && req.method === 'GET') {
            const st = obsService ? obsService.getStatus() : { enabled: false, connected: false };
            sendJson(res, st);
            return true;
        }

        // POST /api/obs-patterns/obs-sync
        if (pathname === '/api/obs-patterns/obs-sync' && req.method === 'POST') {
            try {
                if (!obsService) throw new Error('OBS WebSocket service is not initialized');
                if (!obsService.getStatus().connected) {
                    sendError(res, 'OBS WebSocket is not connected. Enable & connect OBS in System Config > Connection & Security.', 503);
                    return true;
                }
                const discovered = await obsService.listScenesAndSources();
                if (!discovered.connected) throw new Error('OBS disconnected during scene discovery');
                const syncResult = obsPatternsService.syncFromObsDiscovery({
                    scenes: discovered.scenes || [],
                    byScene: discovered.byScene || {}
                });
                await pushSyncToObsSources();
                sendJson(res, {
                    status: 'synced',
                    currentProgramScene: discovered.currentProgramScene || '',
                    byScene: discovered.byScene || {},
                    ...syncResult,
                    state: obsPatternsService.getState()
                });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        // POST /api/obs-patterns/obs-create — Create or update a StreamPulse Pattern Background source in OBS
        if (pathname === '/api/obs-patterns/obs-create' && req.method === 'POST') {
            try {
                if (!isLoopbackRequest(req)) {
                    sendError(res, 'Modifying OBS sources requires a local loopback connection', 403);
                    return true;
                }
                if (!obsService || typeof obsService.callRequest !== 'function') {
                    throw new Error('OBS WebSocket service is not available');
                }
                if (!obsService.getStatus().connected) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const inputName = String(body.sourceName || 'StreamPulse Background').trim().slice(0, 80) || 'StreamPulse Background';
                const sceneName = String(body.sceneName || '').trim();
                const profileId = String(body.profileId || 'auto').trim() || 'auto';
                const st = obsPatternsService.getState();
                const prof = st.profiles.find(p => p.id === profileId) || st.profiles.find(p => p.id === st.activeProfileId) || st.profiles[0];
                const width = Number(body.width) || prof?.width || 1920;
                const height = Number(body.height) || prof?.height || 1080;

                const discovered = await obsService.listScenesAndSources();
                if (!discovered.connected) throw new Error('OBS disconnected during scene discovery');
                const targetScene = sceneName || discovered.currentProgramScene || discovered.scenes?.[0] || '';
                if (!targetScene) throw new Error('No OBS scene found to place source into');

                const inputs = await obsService.callRequest('GetInputList');
                if (!Array.isArray(inputs.inputs)) throw new Error('OBS returned an invalid input list');
                const existing = inputs.inputs.find(input => input.inputName === inputName);
                if (existing && existing.inputKind !== 'streampulse_pattern_source') {
                    sendError(res, 'An OBS input with that name already exists and is not a StreamPulse pattern source', 409);
                    return true;
                }
                const exists = Boolean(existing);
                const settings = { profile_id: 'auto', width, height, sync_revision: Date.now() };
                if (exists) {
                    await obsService.callRequest('SetInputSettings', { inputName, inputSettings: settings, overlay: true });
                    if (!(discovered.byScene?.[targetScene] || []).some(item => item.sourceName === inputName)) {
                        await obsService.callRequest('CreateSceneItem', { sceneName: targetScene, sourceName: inputName, sceneItemEnabled: true });
                    }
                } else {
                    await obsService.callRequest('CreateInput', {
                        sceneName: targetScene,
                        inputName,
                        inputKind: 'streampulse_pattern_source',
                        inputSettings: settings,
                        sceneItemEnabled: true
                    });
                }

                obsPatternsService.setSourceAssignment({ sourceName: inputName, sceneName: '', profileId });
                const post = await obsService.listScenesAndSources();
                if (!post.connected) throw new Error('OBS disconnected during scene discovery');
                obsPatternsService.syncFromObsDiscovery({ scenes: post.scenes || [], byScene: post.byScene || {} });

                sendJson(res, {
                    status: exists ? 'updated' : 'created',
                    sourceName: inputName,
                    sceneName: targetScene,
                    profileId,
                    state: obsPatternsService.getState()
                });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        return false;
    };
}

module.exports = { createObsPatternsRoutes };
