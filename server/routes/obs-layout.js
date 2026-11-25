const { readRequestBody, sendJson, sendError } = require('./helpers');
const {
    computeAspectCrop,
    computeAnchoredTransform,
    sceneItemScreenRect,
    computeBorderScreenRects,
    computeNativeObsCropPatch,
    evalEasing,
    evalPathPoint
} = require('../../shared/obs-layout.cjs');

const CYCLE_ORDER = ['native', '16:9', '4:3', '1:1', '9:16'];
const FADE_FILTER_NAME = 'StreamPulse Fade';

function lerpNum(a, b, t) {
    return a + (b - a) * t;
}

module.exports = function createObsLayoutRoutes({
    obsLayoutService,
    obsService = null,
    obsBordersService = null,
    isObsLayoutEnabled = () => false,
    isLoopbackRequest = () => true
} = {}) {
    function isObsReady() {
        return Boolean(obsService && typeof obsService.callRequest === 'function' && obsService.getStatus().connected);
    }

    async function setSourceOpacity(sourceName, opacity) {
        if (!isObsReady() || !sourceName) return;
        const clamped = Math.max(0, Math.min(1, Number(opacity)));
        try {
            await obsService.callRequest('SetSourceFilterSettings', {
                sourceName,
                filterName: FADE_FILTER_NAME,
                filterSettings: { opacity: clamped },
                overlay: true
            });
        } catch {
            try {
                await obsService.callRequest('CreateSourceFilter', {
                    sourceName,
                    filterName: FADE_FILTER_NAME,
                    filterKind: 'color_filter_v2',
                    filterSettings: { opacity: clamped }
                });
            } catch { /* source may not support video filters */ }
        }
    }

    async function animateTransforms(entries, options = {}) {
        if (!entries.length || !isObsReady()) return;
        const opts = typeof options === 'number' ? { durationMs: options } : (options || {});
        const transitionType = String(opts.transitionType || 'move');
        const pathType = String(opts.pathType || 'direct');
        const pathCurve = Number.isFinite(Number(opts.pathCurve)) ? Number(opts.pathCurve) : 0.28;
        const controlPoint = opts.pathControlPoint || opts.controlPoint || null;
        const easing = String(opts.easing || 'ease-in-out');
        const dur = transitionType === 'cut' ? 0 : Math.max(0, Math.min(3000, Number(opts.durationMs) || 0));

        if (dur < 25 || transitionType === 'cut') {
            for (const e of entries) {
                await obsService.callRequest('SetSceneItemTransform', {
                    sceneName: e.sceneName,
                    sceneItemId: e.sceneItemId,
                    sceneItemTransform: e.to
                }).catch(() => {});
            }
            return;
        }

        const uniqueSources = [...new Set(entries.map(e => e.sourceName).filter(Boolean))];

        // Pure Fade transition: fade out -> snap transform -> fade in
        if (transitionType === 'fade') {
            const halfSteps = Math.max(3, Math.min(24, Math.round((dur * 0.5) / 24)));
            const stepMs = (dur * 0.5) / halfSteps;
            for (let i = 1; i <= halfSteps; i++) {
                const op = 1 - evalEasing(i / halfSteps, easing);
                await Promise.all(uniqueSources.map(s => setSourceOpacity(s, op)));
                if (i < halfSteps) await new Promise(r => setTimeout(r, stepMs));
            }
            for (const e of entries) {
                await obsService.callRequest('SetSceneItemTransform', {
                    sceneName: e.sceneName,
                    sceneItemId: e.sceneItemId,
                    sceneItemTransform: e.to
                }).catch(() => {});
            }
            for (let i = 1; i <= halfSteps; i++) {
                const op = evalEasing(i / halfSteps, easing);
                await Promise.all(uniqueSources.map(s => setSourceOpacity(s, op)));
                if (i < halfSteps) await new Promise(r => setTimeout(r, stepMs));
            }
            return;
        }

        // Move or Move + Fade with movement paths (direct / arc-up / arc-down / s-curve / custom Bezier)
        const steps = Math.max(3, Math.min(48, Math.round(dur / 22)));
        const stepMs = dur / steps;
        const withFade = transitionType === 'move-fade';
        for (let i = 1; i <= steps; i++) {
            const rawT = i / steps;
            const t = evalEasing(rawT, easing);
            if (withFade) {
                const dip = 1 - 0.65 * Math.sin(rawT * Math.PI);
                await Promise.all(uniqueSources.map(s => setSourceOpacity(s, dip)));
            }
            for (const e of entries) {
                const framePatch = {};
                for (const key of Object.keys(e.to)) {
                    if (key === 'positionX' || key === 'positionY') continue;
                    const fromVal = Number(e.from?.[key]);
                    const toVal = Number(e.to[key]);
                    if (Number.isFinite(fromVal) && Number.isFinite(toVal)) {
                        framePatch[key] = Number(lerpNum(fromVal, toVal, t).toFixed(4));
                    } else {
                        framePatch[key] = e.to[key];
                    }
                }
                const hasPos = e.to.positionX !== undefined || e.to.positionY !== undefined;
                if (hasPos) {
                    const x0 = Number(e.from?.positionX ?? e.to.positionX ?? 0);
                    const y0 = Number(e.from?.positionY ?? e.to.positionY ?? 0);
                    const x1 = Number(e.to.positionX ?? x0);
                    const y1 = Number(e.to.positionY ?? y0);
                    const pt = evalPathPoint(x0, y0, x1, y1, t, { pathType, pathCurve, controlPoint });
                    if (e.to.positionX !== undefined) framePatch.positionX = Number(pt.x.toFixed(3));
                    if (e.to.positionY !== undefined) framePatch.positionY = Number(pt.y.toFixed(3));
                }
                await obsService.callRequest('SetSceneItemTransform', {
                    sceneName: e.sceneName,
                    sceneItemId: e.sceneItemId,
                    sceneItemTransform: framePatch
                }).catch(() => {});
            }
            if (i < steps) {
                await new Promise(resolve => setTimeout(resolve, stepMs));
            }
        }
        if (withFade) {
            await Promise.all(uniqueSources.map(s => setSourceOpacity(s, 1)));
        }
    }

    async function inspectSourceFilters(sourceName) {
        if (!isObsReady() || !sourceName) {
            return { filters: [], hasBorderFilter: false, hasAspectFilter: false, aspectFilterName: null };
        }
        try {
            const fl = await obsService.callRequest('GetSourceFilterList', { sourceName });
            const filters = Array.isArray(fl?.filters) ? fl.filters : [];
            const borderF = filters.find(f => (f.filterKind === 'streampulse_border_filter' || f.filterName === 'StreamPulse Border') && f.filterEnabled !== false);
            const aspectF = filters.find(f => (f.filterKind === 'streampulse_aspect_filter' || f.filterName === 'StreamPulse Aspect') && f.filterEnabled !== false);
            return {
                filters,
                hasBorderFilter: Boolean(borderF),
                hasAspectFilter: Boolean(aspectF),
                aspectFilterName: aspectF?.filterName || null
            };
        } catch {
            return { filters: [], hasBorderFilter: false, hasAspectFilter: false, aspectFilterName: null };
        }
    }

    async function ensureAndPokeAspectFilter(sourceName) {
        if (!isObsReady() || !sourceName) return { attached: false, hasBorderFilter: false };
        const info = await inspectSourceFilters(sourceName);
        if (info.hasAspectFilter) {
            try {
                await obsService.callRequest('SetSourceFilterSettings', {
                    sourceName,
                    filterName: info.aspectFilterName || 'StreamPulse Aspect',
                    filterSettings: { sync_revision: Date.now() },
                    overlay: true
                });
                return { attached: true, hasBorderFilter: info.hasBorderFilter };
            } catch { /* fall through */ }
        }
        // Try auto-attaching StreamPulse Aspect if streampulse-aspect.lua is loaded in OBS
        try {
            await obsService.callRequest('CreateSourceFilter', {
                sourceName,
                filterName: 'StreamPulse Aspect',
                filterKind: 'streampulse_aspect_filter',
                filterSettings: { sync_revision: Date.now() }
            });
            const borderIdx = info.filters.findIndex(f => f.filterKind === 'streampulse_border_filter' || f.filterName === 'StreamPulse Border');
            if (borderIdx >= 0) {
                await obsService.callRequest('SetSourceFilterIndex', {
                    sourceName,
                    filterName: 'StreamPulse Aspect',
                    filterIndex: Math.max(0, borderIdx)
                }).catch(() => {});
            }
            return { attached: true, hasBorderFilter: info.hasBorderFilter };
        } catch {
            return { attached: false, hasBorderFilter: info.hasBorderFilter };
        }
    }

    return async function handleObsLayoutRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/obs-layout')) return false;

        try {
            // GET /api/obs-layout — state + enabled/OBS connection flags
            if (pathname === '/api/obs-layout' && req.method === 'GET') {
                sendJson(res, {
                    ...obsLayoutService.getState(),
                    enabled: isObsLayoutEnabled(),
                    obsConnected: isObsReady()
                });
                return true;
            }

            // GET /api/obs-layout/status — Companion summary
            if (pathname === '/api/obs-layout/status' && req.method === 'GET') {
                const st = obsLayoutService.getState();
                sendJson(res, {
                    enabled: isObsLayoutEnabled(),
                    obsConnected: isObsReady(),
                    configuredSources: Object.keys(st.sources || {}).length,
                    layoutsCount: (st.layouts || []).length,
                    revision: st.revision
                });
                return true;
            }

            // GET /api/obs-layout/lua — download streampulse-aspect.lua
            if (pathname === '/api/obs-layout/lua' && req.method === 'GET') {
                const lua = obsLayoutService.regenerateLuaScript();
                const download = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';
                res.writeHead(200, {
                    'Content-Type': 'text/x-lua; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...(download ? { 'Content-Disposition': 'attachment; filename="streampulse-aspect.lua"' } : {})
                });
                res.end(lua);
                return true;
            }

            // Gate all interactive & mutation endpoints behind opt-in config flag
            if (!isObsLayoutEnabled()) {
                sendError(res, 'OBS Layout & Aspect Studio is disabled in System Config', 403);
                return true;
            }

            // GET /api/obs-layout/scenes — list live OBS scenes + canvas dimensions
            if (pathname === '/api/obs-layout/scenes' && req.method === 'GET') {
                if (!isObsReady()) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const [sl, vs] = await Promise.all([
                    obsService.callRequest('GetSceneList'),
                    obsService.callRequest('GetVideoSettings').catch(() => ({}))
                ]);
                const scenes = (sl?.scenes || []).map(s => s.sceneName).filter(Boolean).reverse();
                sendJson(res, {
                    currentProgramScene: sl?.currentProgramSceneName || scenes[0] || '',
                    scenes,
                    baseWidth: Number(vs?.baseWidth) || 1920,
                    baseHeight: Number(vs?.baseHeight) || 1080
                });
                return true;
            }

            // GET /api/obs-layout/scene?name=... — full scene item transforms + border pad metadata
            if (pathname === '/api/obs-layout/scene' && req.method === 'GET') {
                if (!isObsReady()) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const sceneName = String(url.searchParams.get('name') || '').trim();
                if (!sceneName) throw new Error('Missing scene name');
                const [itemRes, vs] = await Promise.all([
                    obsService.callRequest('GetSceneItemList', { sceneName }),
                    obsService.callRequest('GetVideoSettings').catch(() => ({}))
                ]);
                const rawItems = Array.isArray(itemRes?.sceneItems) ? itemRes.sceneItems : [];
                const borderManifest = obsBordersService ? obsBordersService.syncResolvedManifest() : null;
                const layoutState = obsLayoutService.getState();

                const items = [];
                for (const it of rawItems) {
                    const sourceName = String(it.sourceName || '').trim();
                    const sceneItemId = it.sceneItemId;
                    let tx = it.sceneItemTransform || null;
                    if (!tx) {
                        try {
                            const txRes = await obsService.callRequest('GetSceneItemTransform', { sceneName, sceneItemId });
                            tx = txRes?.sceneItemTransform || null;
                        } catch { tx = null; }
                    }
                    if (!tx) continue;
                    const rect = sceneItemScreenRect(tx);
                    const filterInfo = it.isGroup
                        ? { hasBorderFilter: false, hasAspectFilter: false }
                        : await inspectSourceFilters(sourceName);
                    let borderPad = 0;
                    let borderReach = 0;
                    let borderOuterRect = null;
                    let contentRect = null;
                    if (filterInfo.hasBorderFilter && obsBordersService && borderManifest) {
                        const prof = obsBordersService.resolveManifestProfileForSource(borderManifest, sourceName, sceneName);
                        if (prof) {
                            const bRects = computeBorderScreenRects(tx, prof);
                            if (bRects) {
                                borderPad = bRects.pad;
                                borderReach = bRects.reach;
                                borderOuterRect = bRects.borderOuterRect;
                                contentRect = bRects.contentRect;
                            }
                        }
                    }
                    items.push({
                        sceneItemId,
                        sceneItemIndex: it.sceneItemIndex,
                        sourceName,
                        inputKind: it.inputKind || (it.isGroup ? 'group' : ''),
                        isGroup: Boolean(it.isGroup),
                        visible: it.sceneItemEnabled !== false,
                        locked: Boolean(it.sceneItemLocked),
                        transform: tx,
                        rect,
                        hasBorderFilter: filterInfo.hasBorderFilter,
                        hasAspectFilter: filterInfo.hasAspectFilter,
                        borderPad,
                        borderReach,
                        borderOuterRect,
                        contentRect,
                        aspect: layoutState.sources?.[sourceName] || null
                    });
                }

                sendJson(res, {
                    sceneName,
                    baseWidth: Number(vs?.baseWidth) || 1920,
                    baseHeight: Number(vs?.baseHeight) || 1080,
                    items
                });
                return true;
            }

            // GET /api/obs-layout/screenshot?scene=... — single on-demand backdrop snapshot
            if (pathname === '/api/obs-layout/screenshot' && req.method === 'GET') {
                if (!isObsReady()) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const sourceName = String(url.searchParams.get('scene') || url.searchParams.get('source') || '').trim();
                if (!sourceName) throw new Error('Missing scene parameter');
                const shot = await obsService.callRequest('GetSourceScreenshot', {
                    sourceName,
                    imageFormat: 'jpg',
                    imageWidth: 960,
                    imageHeight: 540,
                    imageCompressionQuality: 70
                });
                sendJson(res, { imageData: shot?.imageData || '' });
                return true;
            }

            // POST /api/obs-layout/transform — live-sync transform / visibility / lock to OBS
            if (pathname === '/api/obs-layout/transform' && req.method === 'POST') {
                if (!isLoopbackRequest(req)) {
                    sendError(res, 'Modifying OBS transforms requires a local loopback connection', 403);
                    return true;
                }
                if (!isObsReady()) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const body = JSON.parse(await readRequestBody(req, 32 * 1024) || '{}');
                const sceneName = String(body.sceneName || '').trim();
                const sceneItemId = Number(body.sceneItemId);
                if (!sceneName || !Number.isFinite(sceneItemId)) throw new Error('Missing sceneName or sceneItemId');

                if (body.transform && typeof body.transform === 'object') {
                    await obsService.callRequest('SetSceneItemTransform', {
                        sceneName,
                        sceneItemId,
                        sceneItemTransform: body.transform
                    });
                }
                if (typeof body.visible === 'boolean') {
                    await obsService.callRequest('SetSceneItemEnabled', {
                        sceneName,
                        sceneItemId,
                        sceneItemEnabled: body.visible
                    });
                }
                if (typeof body.locked === 'boolean') {
                    await obsService.callRequest('SetSceneItemLocked', {
                        sceneName,
                        sceneItemId,
                        sceneItemLocked: body.locked
                    });
                }
                if (Number.isInteger(body.sceneItemIndex) && body.sceneItemIndex >= 0) {
                    await obsService.callRequest('SetSceneItemIndex', {
                        sceneName,
                        sceneItemId,
                        sceneItemIndex: body.sceneItemIndex
                    });
                }
                sendJson(res, { ok: true });
                return true;
            }

            // POST /api/obs-layout/aspect/attach — attach StreamPulse Aspect filter upstream of Border
            if (pathname === '/api/obs-layout/aspect/attach' && req.method === 'POST') {
                if (!isLoopbackRequest(req)) {
                    sendError(res, 'Attaching OBS filters requires a local loopback connection', 403);
                    return true;
                }
                if (!isObsReady()) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const body = JSON.parse(await readRequestBody(req, 16 * 1024) || '{}');
                const sourceName = String(body.sourceName || '').trim();
                if (!sourceName) throw new Error('Missing sourceName');
                const fl = await obsService.callRequest('GetSourceFilterList', { sourceName });
                const filters = Array.isArray(fl?.filters) ? fl.filters : [];
                let existing = filters.find(f => f.filterKind === 'streampulse_aspect_filter' || f.filterName === 'StreamPulse Aspect');
                if (!existing) {
                    await obsService.callRequest('CreateSourceFilter', {
                        sourceName,
                        filterName: 'StreamPulse Aspect',
                        filterKind: 'streampulse_aspect_filter',
                        filterSettings: { sync_revision: Date.now() }
                    });
                    existing = { filterName: 'StreamPulse Aspect' };
                }
                // Place Aspect filter ABOVE StreamPulse Border so borders always wrap the cropped shape
                const borderIdx = filters.findIndex(f => f.filterKind === 'streampulse_border_filter' || f.filterName === 'StreamPulse Border');
                if (borderIdx >= 0) {
                    await obsService.callRequest('SetSourceFilterIndex', {
                        sourceName,
                        filterName: existing.filterName,
                        filterIndex: Math.max(0, borderIdx)
                    }).catch(() => {});
                }
                sendJson(res, { ok: true, sourceName, filterName: existing.filterName });
                return true;
            }

            // GET|POST /api/obs-layout/aspect — set or cycle aspect ratio + animate anchored OBS transforms
            if (pathname === '/api/obs-layout/aspect' && (req.method === 'GET' || req.method === 'POST')) {
                const body = req.method === 'POST' ? JSON.parse(await readRequestBody(req, 32 * 1024) || '{}') : {};
                const sourceName = String(url.searchParams.get('source') ?? body.sourceName ?? body.source ?? '').trim();
                if (!sourceName) throw new Error('Missing sourceName');
                const action = String(url.searchParams.get('action') ?? body.action ?? 'set');
                const curCfg = obsLayoutService.getState().sources?.[sourceName] || { ratio: 'native' };
                let ratio = url.searchParams.get('ratio') ?? body.ratio ?? curCfg.ratio;
                if (action === 'cycle') {
                    const idx = CYCLE_ORDER.indexOf(curCfg.ratio || 'native');
                    ratio = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
                }
                const patch = {
                    ratio,
                    ...(body.customW !== undefined ? { customW: body.customW } : {}),
                    ...(body.customH !== undefined ? { customH: body.customH } : {}),
                    ...(url.searchParams.has('panX') || body.panX !== undefined ? { panX: Number(url.searchParams.get('panX') ?? body.panX) } : {}),
                    ...(url.searchParams.has('panY') || body.panY !== undefined ? { panY: Number(url.searchParams.get('panY') ?? body.panY) } : {}),
                    ...(url.searchParams.has('zoom') || body.zoom !== undefined ? { zoom: Number(url.searchParams.get('zoom') ?? body.zoom) } : {}),
                    ...(url.searchParams.has('resizeMode') || body.resizeMode !== undefined ? { resizeMode: url.searchParams.get('resizeMode') ?? body.resizeMode } : {}),
                    ...(url.searchParams.has('anchor') || body.anchor !== undefined ? { anchor: url.searchParams.get('anchor') ?? body.anchor } : {}),
                    ...(url.searchParams.has('durationMs') || body.durationMs !== undefined ? { durationMs: Number(url.searchParams.get('durationMs') ?? body.durationMs) } : {})
                };

                const saved = obsLayoutService.setSourceAspect(sourceName, patch);
                const sceneNameFilter = String(url.searchParams.get('scene') ?? body.sceneName ?? '').trim();
                const transitionType = String(url.searchParams.get('transitionType') ?? body.transitionType ?? 'move');
                const pathType = String(url.searchParams.get('pathType') ?? body.pathType ?? 'direct');
                const easing = String(url.searchParams.get('easing') ?? body.easing ?? 'ease-in-out');

                let aspectMode = 'saved-only';
                let filterAttached = false;
                let hasBorderFilter = false;
                if (isObsReady()) {
                    const fState = await ensureAndPokeAspectFilter(sourceName);
                    filterAttached = fState.attached;
                    hasBorderFilter = fState.hasBorderFilter;
                    aspectMode = filterAttached ? 'gpu-filter' : 'native-crop';

                    const borderManifest = hasBorderFilter && obsBordersService ? obsBordersService.syncResolvedManifest() : null;
                    const targetScenes = sceneNameFilter
                        ? [sceneNameFilter]
                        : ((await obsService.callRequest('GetSceneList').catch(() => ({ scenes: [] })))?.scenes || []).map(s => s.sceneName);
                    const animEntries = [];
                    for (const sc of targetScenes.slice(0, 40)) {
                        try {
                            const il = await obsService.callRequest('GetSceneItemList', { sceneName: sc });
                            for (const it of (il?.sceneItems || [])) {
                                if (it.sourceName !== sourceName) continue;
                                const txRes = await obsService.callRequest('GetSceneItemTransform', { sceneName: sc, sceneItemId: it.sceneItemId });
                                const curTx = txRes?.sceneItemTransform;
                                if (!curTx) continue;
                                let borderPad = 0;
                                let baseW = curTx.sourceWidth || 1920;
                                let baseH = curTx.sourceHeight || 1080;
                                if (hasBorderFilter && obsBordersService && borderManifest) {
                                    const prof = obsBordersService.resolveManifestProfileForSource(borderManifest, sourceName, sc);
                                    const bRects = prof ? computeBorderScreenRects(curTx, prof) : null;
                                    if (bRects) {
                                        borderPad = bRects.pad;
                                        baseW = bRects.baseW;
                                        baseH = bRects.baseH;
                                    }
                                }
                                let anchored;
                                if (filterAttached) {
                                    const crop = computeAspectCrop(baseW, baseH, saved.aspect);
                                    anchored = computeAnchoredTransform(curTx, crop.outW + borderPad * 2, crop.outH + borderPad * 2, {
                                        resizeMode: saved.aspect.resizeMode,
                                        anchor: saved.aspect.anchor
                                    });
                                    anchored.patch.cropLeft = 0;
                                    anchored.patch.cropRight = 0;
                                    anchored.patch.cropTop = 0;
                                    anchored.patch.cropBottom = 0;
                                } else {
                                    const nativeCrop = computeNativeObsCropPatch(curTx.sourceWidth || 1920, curTx.sourceHeight || 1080, saved.aspect, borderPad);
                                    anchored = computeAnchoredTransform(curTx, nativeCrop.effW, nativeCrop.effH, {
                                        resizeMode: saved.aspect.resizeMode,
                                        anchor: saved.aspect.anchor
                                    });
                                    anchored.patch.cropLeft = nativeCrop.cropLeft;
                                    anchored.patch.cropRight = nativeCrop.cropRight;
                                    anchored.patch.cropTop = nativeCrop.cropTop;
                                    anchored.patch.cropBottom = nativeCrop.cropBottom;
                                }
                                animEntries.push({
                                    sceneName: sc,
                                    sceneItemId: it.sceneItemId,
                                    sourceName,
                                    from: curTx,
                                    to: anchored.patch
                                });
                            }
                        } catch { /* ignore */ }
                    }
                    await animateTransforms(animEntries, {
                        durationMs: saved.aspect.durationMs,
                        transitionType,
                        pathType,
                        easing
                    });
                }

                sendJson(res, { ok: true, mode: aspectMode, filterAttached, hasBorderFilter, ...saved });
                return true;
            }

            // POST /api/obs-layout/layouts — save a multi-element Scene Layout Preset
            if (pathname === '/api/obs-layout/layouts' && req.method === 'POST') {
                const body = JSON.parse(await readRequestBody(req, 128 * 1024) || '{}');
                sendJson(res, { ok: true, ...obsLayoutService.saveLayout(body) });
                return true;
            }

            // DELETE /api/obs-layout/layouts/:id
            const delMatch = pathname.match(/^\/api\/obs-layout\/layouts\/([a-z0-9_-]{1,60})$/i);
            if (delMatch && req.method === 'DELETE') {
                sendJson(res, { ok: true, state: obsLayoutService.deleteLayout(delMatch[1]) });
                return true;
            }

            // GET|POST /api/obs-layout/layouts/apply?id=... — smoothly morph all items in a saved layout
            if (pathname === '/api/obs-layout/layouts/apply' && (req.method === 'GET' || req.method === 'POST')) {
                const body = req.method === 'POST' ? JSON.parse(await readRequestBody(req, 16 * 1024) || '{}') : {};
                const id = String(url.searchParams.get('id') ?? body.id ?? '').trim();
                const layout = (obsLayoutService.getState().layouts || []).find(l => l.id === id);
                if (!layout) {
                    sendError(res, 'Layout preset not found', 404);
                    return true;
                }
                if (!isObsReady()) {
                    sendError(res, 'OBS WebSocket is not connected', 503);
                    return true;
                }
                const durationMs = url.searchParams.has('durationMs') ? Number(url.searchParams.get('durationMs')) : (body.durationMs ?? layout.durationMs);
                const transitionType = String(url.searchParams.get('transitionType') ?? body.transitionType ?? layout.transitionType ?? 'move');
                const pathType = String(url.searchParams.get('pathType') ?? body.pathType ?? layout.pathType ?? 'direct');
                const pathCurve = url.searchParams.has('pathCurve') ? Number(url.searchParams.get('pathCurve')) : (body.pathCurve ?? layout.pathCurve ?? 0.28);
                const pathControlPoint = body.pathControlPoint ?? layout.pathControlPoint ?? null;
                const easing = String(url.searchParams.get('easing') ?? body.easing ?? layout.easing ?? 'ease-in-out');
                const il = await obsService.callRequest('GetSceneItemList', { sceneName: layout.sceneName });
                const sceneItems = Array.isArray(il?.sceneItems) ? il.sceneItems : [];
                const animEntries = [];

                for (const savedItem of layout.items) {
                    if (savedItem.aspect) {
                        obsLayoutService.setSourceAspect(savedItem.sourceName, { ...savedItem.aspect, durationMs });
                        await ensureAndPokeAspectFilter(savedItem.sourceName);
                    }
                    const match = sceneItems.find(si => si.sourceName === savedItem.sourceName);
                    if (!match) continue;
                    if (typeof savedItem.visible === 'boolean') {
                        await obsService.callRequest('SetSceneItemEnabled', {
                            sceneName: layout.sceneName,
                            sceneItemId: match.sceneItemId,
                            sceneItemEnabled: savedItem.visible
                        }).catch(() => {});
                    }
                    if (savedItem.transform) {
                        const curRes = await obsService.callRequest('GetSceneItemTransform', {
                            sceneName: layout.sceneName,
                            sceneItemId: match.sceneItemId
                        }).catch(() => null);
                        animEntries.push({
                            sceneName: layout.sceneName,
                            sceneItemId: match.sceneItemId,
                            sourceName: savedItem.sourceName,
                            from: curRes?.sceneItemTransform || savedItem.transform,
                            to: savedItem.transform
                        });
                    }
                }
                await animateTransforms(animEntries, {
                    durationMs,
                    transitionType,
                    pathType,
                    pathCurve,
                    pathControlPoint,
                    easing
                });
                sendJson(res, { ok: true, applied: layout.id, itemsAnimated: animEntries.length, transitionType, pathType, durationMs });
                return true;
            }

            sendError(res, 'Not found', 404);
        } catch (error) {
            sendError(res, error, error?.statusCode || 400);
        }
        return true;
    };
};
