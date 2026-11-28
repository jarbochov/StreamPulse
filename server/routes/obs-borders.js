const fs = require('fs');
/**
 * OBS Border Studio API & Companion Routes
 */

const { readRequestBody, sendJson, sendError } = require('./helpers');
const { computeCompensatedTransform } = require('../../shared/obs-border-transform.cjs');

function createObsBordersRoutes({
    obsBordersService,
    obsService = null,
    isLoopbackRequest = () => true
} = {}) {
    async function planCompensatedTransforms({ prevManifest, nextManifest, targetNames, pinMode = 'outer-border' } = {}) {
        const planned = [];
        if (!prevManifest || !nextManifest || !targetNames || targetNames.size === 0) return planned;
        if (!obsService || typeof obsService.callRequest !== 'function' || !obsService.getStatus().connected) {
            return planned;
        }
        const st = obsBordersService.getState();
        let sceneNames = Array.isArray(st.knownScenes) ? [...st.knownScenes] : [];
        if (sceneNames.length === 0) {
            try {
                const sl = await obsService.callRequest('GetSceneList');
                sceneNames = (sl?.scenes || []).map(s => s.sceneName).filter(Boolean);
            } catch {
                sceneNames = [];
            }
        }
        if (sceneNames.length === 0) return planned;

        const sceneScales = st.sceneScales || {};

        async function processSceneItems(containerName, items, isGroup = false) {
            for (const item of items) {
                const sourceName = String(item?.sourceName || '').trim();
                const sceneItemId = item?.sceneItemId;
                if (!sourceName || sceneItemId === undefined) continue;

                if (item.isGroup) {
                    try {
                        const grp = await obsService.callRequest('GetGroupSceneItemList', { sceneName: sourceName });
                        if (Array.isArray(grp?.sceneItems)) {
                            await processSceneItems(sourceName, grp.sceneItems, true);
                        }
                    } catch { /* ignore unreadable group */ }
                }

                if (!targetNames.has(sourceName)) continue;

                const ruleScene = isGroup ? '' : containerName;
                const prevProf = obsBordersService.resolveManifestProfileForSource(prevManifest, sourceName, ruleScene);
                const nextProf = obsBordersService.resolveManifestProfileForSource(nextManifest, sourceName, ruleScene);
                if (!prevProf && !nextProf) continue;

                try {
                    const txRes = await obsService.callRequest('GetSceneItemTransform', {
                        sceneName: containerName,
                        sceneItemId
                    });
                    const curTx = txRes?.sceneItemTransform;
                    if (!curTx) continue;
                    const txScale = Number(sceneScales[`${containerName}::${sourceName}`]) || Math.min(Math.abs(curTx.scaleX || 1), Math.abs(curTx.scaleY || 1)) || 1;
                    const comp = computeCompensatedTransform(curTx, prevProf, nextProf, { pinMode, txScale });
                    if (comp.changed && comp.patch) {
                        planned.push({
                            sceneName: containerName,
                            sceneItemId,
                            sceneItemTransform: comp.patch
                        });
                    }
                } catch {
                    /* ignore transient OBS item transform failures */
                }
            }
        }

        for (const sceneName of sceneNames.slice(0, 60)) {
            try {
                const res = await obsService.callRequest('GetSceneItemList', { sceneName });
                const items = Array.isArray(res?.sceneItems) ? res.sceneItems : [];
                if (items.length > 0) {
                    await processSceneItems(sceneName, items, false);
                }
            } catch {
                /* ignore missing scene */
            }
        }
        return planned;
    }

    async function pushSyncToObsSources(targetNames = [], { autoAttachIfAssigned = false, prevManifest = null } = {}) {
        if (!obsService || typeof obsService.callRequest !== 'function' || !obsService.getStatus().connected) {
            return;
        }
        const st = obsBordersService.getState();
        const names = (Array.isArray(targetNames) && targetNames.length > 0)
            ? [...new Set(targetNames.map(n => String(n || '').trim()).filter(Boolean))]
            : [...new Set([...(st.knownSources || []), ...Object.keys(st.assignments || {})])];
        const filterName = 'StreamPulse Border';
        const filterKind = 'streampulse_border_filter';
        const filterSettings = {
            profile_id: 'auto',
            respect_scene_rules: true,
            sync_revision: Date.now()
        };

        // Step 1: Discover which sources have the border filter (sequentially to avoid OBS lock contention)
        const activeBorderedSources = new Set();
        const filterUpdates = [];
        for (const sourceName of names.slice(0, 40)) {
            try {
                const fl = await obsService.callRequest('GetSourceFilterList', { sourceName });
                const filters = Array.isArray(fl?.filters) ? fl.filters : [];
                const existing = filters.find(f => f.filterKind === filterKind || f.filterName === filterName);
                if (existing) {
                    activeBorderedSources.add(sourceName);
                    filterUpdates.push({ action: 'update', sourceName, filterName: existing.filterName });
                } else if (autoAttachIfAssigned) {
                    const cfg = st.assignments?.[sourceName];
                    const hasRule = Boolean(
                        (cfg?.defaultProfileId && cfg.defaultProfileId !== 'none')
                        || Object.values(cfg?.sceneOverrides || {}).some(pid => pid && pid !== 'inherit' && pid !== 'none')
                    );
                    if (hasRule) {
                        activeBorderedSources.add(sourceName);
                        filterUpdates.push({ action: 'create', sourceName, filterName });
                    }
                }
            } catch {
                /* ignore sources unavailable in current OBS state */
            }
        }

        // Step 2: Plan compensated transforms BEFORE updating filter settings (reads exact pre-sync sourceWidth/Height and avoids AB-BA lock inversion)
        let plannedTransforms = [];
        if (prevManifest && st.transformLock?.enabled && activeBorderedSources.size > 0) {
            const nextManifest = obsBordersService.syncResolvedManifest();
            plannedTransforms = await planCompensatedTransforms({
                prevManifest,
                nextManifest,
                targetNames: activeBorderedSources,
                pinMode: st.transformLock.mode || 'outer-border'
            }).catch(() => []);
        }

        // Step 3: Push filter updates sequentially
        for (const upd of filterUpdates) {
            try {
                if (upd.action === 'update') {
                    await obsService.callRequest('SetSourceFilterSettings', {
                        sourceName: upd.sourceName,
                        filterName: upd.filterName,
                        filterSettings,
                        overlay: true
                    });
                } else {
                    await obsService.callRequest('CreateSourceFilter', {
                        sourceName: upd.sourceName,
                        filterName: upd.filterName,
                        filterKind,
                        filterSettings
                    });
                }
            } catch {
                /* ignore transient filter error */
            }
        }

        // Step 4: Apply compensated transforms after a brief settle delay so OBS finishes the filter update cleanly
        if (plannedTransforms.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 60));
            for (const tx of plannedTransforms) {
                try {
                    await obsService.callRequest('SetSceneItemTransform', tx);
                } catch {
                    /* ignore transient transform error */
                }
            }
        }
    }

    return async function handleObsBordersRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/obs-borders')) return false;

        // GET /api/obs-borders — full studio state
        if (pathname === '/api/obs-borders' && req.method === 'GET') {
            sendJson(res, { ...obsBordersService.getState(), palettes: obsBordersService.BORDER_PALETTES || {} });
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
                sourcesCount: st.knownSources.length,
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

        // GET or POST /api/obs-borders/activate?profile=<id>&target=<optionalSource>&scene=<optionalScene>
        if (pathname === '/api/obs-borders/icon-atlas' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req, 6 * 1024 * 1024) || '{}');
                const saved = obsBordersService.saveIconAtlas(body.profileId || 'border-icons', body.pngBase64 || body.dataUrl);
                sendJson(res, { ok: true, ...saved });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        const atlasMatch = pathname.match(/^\/api\/obs-borders\/atlases\/([a-z0-9_.-]+\.png)$/i);
        if (atlasMatch && req.method === 'GET') {
            const fullPath = obsBordersService.getAtlasFilePath(atlasMatch[1]);
            if (!fullPath || !fs.existsSync(fullPath)) {
                sendError(res, 'Atlas not found', 404);
                return true;
            }
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
            fs.createReadStream(fullPath).pipe(res);
            return true;
        }

        if (pathname === '/api/obs-borders/activate' && (req.method === 'GET' || req.method === 'POST')) {
            try {
                let profileId = url.searchParams.get('profile') || url.searchParams.get('id') || '';
                let targetName = url.searchParams.get('target') || url.searchParams.get('source') || '';
                let sceneName = url.searchParams.get('scene') || '';
                let targetNames = [];
                let sceneNames = [];
                if (req.method === 'POST') {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    if (body.profileId || body.profile || body.id) profileId = body.profileId || body.profile || body.id;
                    if (body.target || body.sourceName || body.source) targetName = body.target || body.sourceName || body.source;
                    if (body.sceneName || body.scene) sceneName = body.sceneName || body.scene;
                    if (Array.isArray(body.sourceNames)) targetNames.push(...body.sourceNames);
                    if (Array.isArray(body.targets)) targetNames.push(...body.targets);
                    if (Array.isArray(body.sceneNames)) sceneNames.push(...body.sceneNames);
                    if (Array.isArray(body.scenes)) sceneNames.push(...body.scenes);
                }
                if (targetName) targetNames.push(targetName);
                if (sceneName) sceneNames.push(sceneName);
                targetNames = [...new Set(targetNames.map(v => String(v || '').trim()).filter(Boolean))];
                sceneNames = [...new Set(sceneNames.map(v => String(v || '').trim()).filter(Boolean))];

                if (!profileId) throw new Error('Missing profile parameter');
                const prevManifest = obsBordersService.syncResolvedManifest();
                if (targetNames.length > 0) {
                    const effectiveScenes = sceneNames.length > 0 ? sceneNames : [''];
                    let nextState = obsBordersService.getState();
                    const applied = [];
                    for (const src of targetNames) {
                        for (const scn of effectiveScenes) {
                            nextState = obsBordersService.setSourceAssignment({
                                sourceName: src,
                                sceneName: scn,
                                profileId
                            });
                            applied.push({ sourceName: src, sceneName: scn });
                        }
                    }
                    pushSyncToObsSources(targetNames, { autoAttachIfAssigned: profileId !== 'none' && profileId !== 'inherit', prevManifest }).catch(() => {});
                    if (applied.length === 1) {
                        sendJson(res, { status: 'assigned', target: applied[0].sourceName, sceneName: applied[0].sceneName, profileId, state: nextState });
                    } else {
                        sendJson(res, { status: 'assigned', count: applied.length, targets: targetNames, scenes: sceneNames, profileId, state: nextState });
                    }
                } else {
                    const active = obsBordersService.setActiveProfile(profileId);
                    pushSyncToObsSources([], { prevManifest }).catch(() => {});
                    sendJson(res, { status: 'activated', activeProfileId: active.id, profile: active, state: obsBordersService.getState() });
                }
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // GET or POST /api/obs-borders/standby?profile=<id>&enabled=1|0|toggle
        if (pathname === '/api/obs-borders/standby' && (req.method === 'GET' || req.method === 'POST')) {
            try {
                let profileId = url.searchParams.get('profile') || url.searchParams.get('id') || '';
                let enabled = url.searchParams.get('enabled') ?? 'toggle';
                if (req.method === 'POST') {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    if (body.profileId || body.profile || body.id) profileId = body.profileId || body.profile || body.id;
                    if (body.enabled !== undefined) enabled = body.enabled;
                }
                const profile = obsBordersService.setBackgroundStandby({ profileId, enabled });
                pushSyncToObsSources().catch(() => {});
                sendJson(res, {
                    status: 'standby-updated',
                    profileId: profile.id,
                    standby: Boolean(profile.background?.standby),
                    mode: profile.background?.mode || 'none',
                    state: obsBordersService.getState()
                });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/settings — update studio-wide settings (e.g. transformLock)
        if (pathname === '/api/obs-borders/settings' && (req.method === 'POST' || req.method === 'PUT')) {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const state = obsBordersService.updateSettings({
                    transformLock: body.transformLock
                });
                sendJson(res, { status: 'updated', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/assign — assign profile per source or per scene+source
        if (pathname === '/api/obs-borders/assign' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const sourceName = String(body.sourceName || body.target || '').trim();
                const sceneName = String(body.sceneName || '').trim();
                const profileId = String(body.profileId || 'none').trim() || 'none';
                const prevManifest = obsBordersService.syncResolvedManifest();
                const state = obsBordersService.setSourceAssignment({
                    sourceName,
                    sceneName,
                    profileId
                });
                await pushSyncToObsSources([sourceName], {
                    autoAttachIfAssigned: profileId !== 'none' && profileId !== 'inherit',
                    prevManifest
                }).catch(() => {});
                sendJson(res, { status: 'assigned', state });
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
                const prevManifest = obsBordersService.syncResolvedManifest();
                const profile = obsBordersService.upsertProfile(body.profile || body, { setActive });
                await pushSyncToObsSources([], { prevManifest }).catch(() => {});
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
                const prevManifest = obsBordersService.syncResolvedManifest();
                const state = obsBordersService.deleteProfile(profileId);
                pushSyncToObsSources([], { prevManifest }).catch(() => {});
                sendJson(res, { status: 'deleted', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/reset-defaults
        if (pathname === '/api/obs-borders/reset-defaults' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                const prevManifest = obsBordersService.syncResolvedManifest();
                const state = obsBordersService.resetDefaults();
                pushSyncToObsSources([], { prevManifest }).catch(() => {});
                sendJson(res, { status: 'reset', state });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        // POST /api/obs-borders/import-scenes — offline OBS JSON fallback importer
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

        // GET /api/obs-borders/obs-status — live OBS WebSocket connection status
        if (pathname === '/api/obs-borders/obs-status' && req.method === 'GET') {
            const st = obsService ? obsService.getStatus() : { enabled: false, connected: false };
            sendJson(res, st);
            return true;
        }

        // POST /api/obs-borders/obs-sync — discover live OBS scenes & visual sources
        if (pathname === '/api/obs-borders/obs-sync' && req.method === 'POST') {
            try {
                if (!obsService) throw new Error('OBS WebSocket service is not initialized');
                const obsSt = obsService.getStatus();
                if (!obsSt.connected) {
                    sendError(res, 'OBS WebSocket is not connected. Enable & connect OBS in System Config > Connection & Security.', 503);
                    return true;
                }
                const discovered = await obsService.listScenesAndSources();
                if (!discovered.connected) throw new Error('OBS disconnected during scene discovery');
                const syncResult = obsBordersService.syncFromObsDiscovery({
                    scenes: discovered.scenes || [],
                    sources: discovered.sources || [],
                    byScene: discovered.byScene || {}
                });

                const filterStatuses = {};
                const targetsToProbe = [...new Set([...(syncResult.sources || []), ...(syncResult.scenes || [])])];
                if (typeof obsService.callRequest === 'function') {
                    await Promise.all(targetsToProbe.slice(0, 60).map(async (targetName) => {
                        try {
                            const fl = await obsService.callRequest('GetSourceFilterList', { sourceName: targetName });
                            const filters = Array.isArray(fl?.filters) ? fl.filters : [];
                            const spFilter = filters.find(f => f.filterKind === 'streampulse_border_filter' || f.filterName === 'StreamPulse Border');
                            filterStatuses[targetName] = {
                                hasStreamPulseBorder: Boolean(spFilter),
                                filterEnabled: spFilter ? spFilter.filterEnabled !== false : false,
                                hasLegacyShader: filters.some(f => f.filterKind === 'shader_filter' && f.filterEnabled !== false),
                                filtersCount: filters.length
                            };
                        } catch {
                            /* ignore sources without filter list */
                        }
                    }));
                }

                sendJson(res, {
                    status: 'synced',
                    currentProgramScene: discovered.currentProgramScene || '',
                    byScene: discovered.byScene || {},
                    ...syncResult,
                    filterStatuses,
                    state: obsBordersService.getState()
                });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        // POST /api/obs-borders/obs-apply — attach, update, or remove StreamPulse Border filter via OBS WebSocket
        if (pathname === '/api/obs-borders/obs-apply' && req.method === 'POST') {
            try {
                if (!isLoopbackRequest(req)) {
                    sendError(res, 'Modifying OBS filters requires a local loopback connection', 403);
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
                const action = body.action === 'remove' ? 'remove' : 'apply';
                const st = obsBordersService.getState();
                const targets = Array.isArray(body.targets) && body.targets.length > 0
                    ? body.targets
                    : Object.keys(st.assignments || {});
                const disableLegacyShaders = Boolean(body.disableLegacyShaders);
                const filterName = 'StreamPulse Border';
                const filterKind = 'streampulse_border_filter';
                const results = [];

                for (const sourceName of targets) {
                    const cleanTarget = String(sourceName || '').trim();
                    if (!cleanTarget) continue;
                    const assignedDefault = st.assignments?.[cleanTarget]?.defaultProfileId;
                    const profileId = body.profileId || 'auto';
                    const filterSettings = {
                        profile_id: profileId,
                        respect_scene_rules: true,
                        sync_revision: Date.now()
                    };
                    try {
                        const fl = await obsService.callRequest('GetSourceFilterList', { sourceName: cleanTarget });
                        const filters = Array.isArray(fl?.filters) ? fl.filters : [];
                        const existing = filters.find(f => f.filterName === filterName || f.filterKind === filterKind);

                        if (action === 'remove') {
                            if (existing) {
                                await obsService.callRequest('RemoveSourceFilter', {
                                    sourceName: cleanTarget,
                                    filterName: existing.filterName
                                });
                            }
                            if (body.clearAssignment !== false) {
                                obsBordersService.clearSourceAssignment(cleanTarget);
                            }
                            results.push({ target: cleanTarget, ok: true, removed: Boolean(existing) });
                            continue;
                        }

                        if (existing) {
                            await obsService.callRequest('SetSourceFilterSettings', {
                                sourceName: cleanTarget,
                                filterName: existing.filterName,
                                filterSettings,
                                overlay: true
                            });
                            await obsService.callRequest('SetSourceFilterEnabled', {
                                sourceName: cleanTarget,
                                filterName: existing.filterName,
                                filterEnabled: true
                            });
                        } else {
                            await obsService.callRequest('CreateSourceFilter', {
                                sourceName: cleanTarget,
                                filterName,
                                filterKind,
                                filterSettings
                            });
                        }

                        if (disableLegacyShaders) {
                            for (const f of filters) {
                                if (f.filterKind === 'shader_filter' && f.filterEnabled !== false) {
                                    await obsService.callRequest('SetSourceFilterEnabled', {
                                        sourceName: cleanTarget,
                                        filterName: f.filterName,
                                        filterEnabled: false
                                    }).catch(() => {});
                                }
                            }
                        }

                        results.push({ target: cleanTarget, ok: true, profileId: assignedDefault || profileId });
                    } catch (err) {
                        if (action === 'remove' && body.clearAssignment !== false && /not found|no source/i.test(err.message)) {
                            obsBordersService.clearSourceAssignment(cleanTarget);
                            results.push({ target: cleanTarget, ok: true, removed: false, clearedMissing: true });
                        } else {
                            results.push({
                                target: cleanTarget,
                                ok: false,
                                error: /not found|unavailable|create/i.test(err.message)
                                    ? `${err.message} (Make sure data/obs-borders/streampulse-borders.lua is loaded in OBS Tools -> Scripts)`
                                    : err.message
                            });
                        }
                    }
                }

                sendJson(res, {
                    status: results.every(r => r.ok) ? 'applied' : 'partial',
                    applied: results.filter(r => r.ok).length,
                    total: results.length,
                    results
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
