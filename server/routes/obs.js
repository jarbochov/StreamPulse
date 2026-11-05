'use strict';

const { readRequestBody, sendJson, sendError } = require('./helpers');
const { normalizeObsConfig } = require('../services/obs');

function createObsRoutes({
    obsService,
    getConfig = () => ({}),
    saveConfig = () => {},
    getCustomOverlays = () => ({}),
    pageSnapshot = () => ({}),
    isLoopbackRequest = () => true
} = {}) {
    return async function handleObsRoutes(req, res, pathname) {
        if (!pathname.startsWith('/api/obs')) return false;

        if (pathname === '/api/obs/status' && req.method === 'GET') {
            sendJson(res, obsService.getStatus());
            return true;
        }

        if (getConfig()?.obs_scene_sync_enabled === false &&
            ['/api/obs/sources', '/api/obs/sync', '/api/obs/cleanup-filters'].includes(pathname)) {
            sendError(res, 403, 'OBS Scene Sync module is disabled');
            return true;
        }

        if (pathname === '/api/obs/sources' && req.method === 'GET') {
            try {
                const data = await obsService.listScenesAndSources();
                sendJson(res, data);
            } catch (err) {
                sendError(res, 500, err.message || 'Could not query OBS sources');
            }
            return true;
        }

        if (pathname === '/api/obs/audio-inputs' && req.method === 'GET') {
            try {
                const inputs = await obsService.listAudioInputs();
                const status = typeof obsService.getStatus === 'function' ? obsService.getStatus() : null;
                sendJson(res, { inputs, connected: status ? Boolean(status.connected) : inputs.length > 0, enabled: status ? Boolean(status.enabled) : true });
            } catch (err) {
                sendError(res, 500, err.message || 'Could not query OBS audio inputs');
            }
            return true;
        }

        if (pathname === '/api/obs/config' && (req.method === 'POST' || req.method === 'PUT')) {
            if (!isLoopbackRequest(req)) {
                sendError(res, 403, 'OBS WebSocket configuration requires a local loopback connection.');
                return true;
            }
            try {
                const body = JSON.parse((await readRequestBody(req)) || '{}');
                const current = getConfig()?.obs || {};
                const nextObs = normalizeObsConfig({
                    ...current,
                    ...body,
                    password: body.password !== undefined ? body.password : current.password
                });
                saveConfig({ obs: nextObs });
                if (nextObs.enabled) {
                    obsService.disconnect();
                    obsService.connect();
                } else {
                    obsService.disconnect();
                }
                const status = obsService.getStatus();
                sendJson(res, { ok: true, status, ...status });
            } catch (err) {
                sendError(res, 400, err.message || 'Invalid OBS configuration payload');
            }
            return true;
        }

        if (pathname === '/api/obs/connect' && req.method === 'POST') {
            if (!isLoopbackRequest(req)) {
                sendError(res, 403, 'Local loopback required.');
                return true;
            }
            const current = getConfig()?.obs || {};
            if (!current.enabled) {
                saveConfig({ obs: normalizeObsConfig({ ...current, enabled: true }) });
            }
            obsService.disconnect();
            obsService.connect();
            sendJson(res, obsService.getStatus());
            return true;
        }

        if (pathname === '/api/obs/disconnect' && req.method === 'POST') {
            if (!isLoopbackRequest(req)) {
                sendError(res, 403, 'Local loopback required.');
                return true;
            }
            obsService.disconnect();
            sendJson(res, obsService.getStatus());
            return true;
        }

        if (pathname === '/api/obs/cleanup-filters' && req.method === 'POST') {
            if (!isLoopbackRequest(req)) {
                sendError(res, 403, 'Local loopback required.');
                return true;
            }
            try {
                const body = JSON.parse((await readRequestBody(req)) || '{}');
                const result = await obsService.cleanupManagedFilters({ sceneName: String(body.sceneName || ''), force: body.all === true });
                sendJson(res, result, result.ok ? 200 : 503);
            } catch (err) {
                sendError(res, 500, err.message || 'Failed to clean up OBS filters');
            }
            return true;
        }

        if (pathname === '/api/obs/sync' && req.method === 'POST') {
            if (!isLoopbackRequest(req)) {
                sendError(res, 403, 'Local loopback required.');
                return true;
            }
            try {
                const body = JSON.parse((await readRequestBody(req)) || '{}');
                const overlays = getCustomOverlays();
                const overlay = (body.overlay && typeof body.overlay === 'object')
                    ? body.overlay
                    : overlays[body.overlayId || body.id];
                if (!overlay) {
                    sendError(res, 404, 'Overlay not found');
                    return true;
                }
                const pageId = body.pageId || body.page || pageSnapshot(overlay)?.page || '';
                const animate = body.instant ? false : (body.animate !== false);
                const result = await obsService.syncOverlayState(overlay, pageId, { animate, instant: Boolean(body.instant) });
                if (!result.ok) {
                    const unavailable = !obsService.getStatus().connected;
                    const failed = result.results?.find(item => !item.ok);
                    sendJson(res, {
                        ...result,
                        error: unavailable ? 'OBS WebSocket is not connected' : (failed?.reason || 'Could not sync overlay state to OBS')
                    }, unavailable ? 503 : 502);
                    return true;
                }
                sendJson(res, result);
            } catch (err) {
                sendError(res, 500, err.message || 'Failed to sync state to OBS');
            }
            return true;
        }

        return false;
    };
}

module.exports = { createObsRoutes };
