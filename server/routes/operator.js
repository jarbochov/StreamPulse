'use strict';

const { readRequestBody, sendJson, sendError } = require('./helpers');

function createOperatorRoutes({ operatorService }) {
    return async function handleOperatorRoutes(req, res, url, pathname) {
        if (!pathname.startsWith('/api/operator')) {
            return false;
        }

        try {
            if (pathname === '/api/operator' && req.method === 'GET') {
                sendJson(res, { ok: true, ...operatorService.getState() });
                return true;
            }

            if (pathname === '/api/operator/status' && req.method === 'GET') {
                sendJson(res, { ok: true, ...operatorService.getStatusSummary() });
                return true;
            }

            if (pathname === '/api/operator/profiles' && req.method === 'GET') {
                const state = operatorService.getState();
                sendJson(res, {
                    ok: true,
                    activeProfileId: state.activeProfileId,
                    profiles: state.profiles
                });
                return true;
            }

            if (pathname === '/api/operator/profiles' && req.method === 'POST') {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const activate = url.searchParams.get('select') === '1' || payload.activate === true;
                const profile = operatorService.upsertProfile(payload, { activate });
                const state = operatorService.getState();
                sendJson(res, {
                    ok: true,
                    profile,
                    activeProfileId: state.activeProfileId
                }, 201);
                return true;
            }

            if (pathname === '/api/operator/profile/select' && (req.method === 'GET' || req.method === 'POST')) {
                let target = url.searchParams.get('id') || url.searchParams.get('profile') || url.searchParams.get('name') || '';
                if (!target && req.method === 'POST') {
                    const body = await readRequestBody(req);
                    if (body) {
                        const parsed = JSON.parse(body);
                        target = parsed.id || parsed.profile || parsed.name || '';
                    }
                }
                const profile = operatorService.setActiveProfile(target);
                sendJson(res, { ok: true, activeProfileId: profile.id, profile });
                return true;
            }

            if (pathname === '/api/operator/export' && req.method === 'GET') {
                const profileId = url.searchParams.get('id') || '';
                const bundle = operatorService.exportState(profileId);
                const extraHeaders = url.searchParams.get('download') === '1'
                    ? { 'Content-Disposition': `attachment; filename="streampulse-operator-${profileId || 'profiles'}.json"` }
                    : {};
                sendJson(res, bundle, 200, extraHeaders);
                return true;
            }

            if (pathname === '/api/operator/import' && req.method === 'POST') {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const mode = url.searchParams.get('mode') || payload.mode || 'merge';
                const result = operatorService.importState(payload, { mode });
                sendJson(res, { ok: true, ...result });
                return true;
            }

            const activateMatch = pathname.match(/^\/api\/operator\/profiles\/([^/]+)\/activate$/);
            if (activateMatch && (req.method === 'GET' || req.method === 'POST')) {
                const id = decodeURIComponent(activateMatch[1]);
                const profile = operatorService.setActiveProfile(id);
                sendJson(res, { ok: true, activeProfileId: profile.id, profile });
                return true;
            }

            const singleMatch = pathname.match(/^\/api\/operator\/profiles\/([^/]+)$/);
            if (singleMatch) {
                const id = decodeURIComponent(singleMatch[1]);
                if (req.method === 'GET') {
                    const profile = operatorService.getProfile(id);
                    if (!profile) {
                        sendError(res, 'Operator profile not found', 404);
                        return true;
                    }
                    sendJson(res, { ok: true, profile });
                    return true;
                }
                if (req.method === 'PUT' || req.method === 'POST') {
                    const body = await readRequestBody(req);
                    const payload = JSON.parse(body || '{}');
                    const activate = url.searchParams.get('select') === '1' || payload.activate === true;
                    const profile = operatorService.upsertProfile({ ...payload, id }, { activate });
                    const state = operatorService.getState();
                    sendJson(res, {
                        ok: true,
                        profile,
                        activeProfileId: state.activeProfileId
                    });
                    return true;
                }
                if (req.method === 'DELETE') {
                    const result = operatorService.deleteProfile(id);
                    sendJson(res, { ok: true, ...result });
                    return true;
                }
            }

            if (pathname === '/api/operator/runbooks' && req.method === 'GET') {
                sendJson(res, { ok: true, runbooks: operatorService.listRunbooks() });
                return true;
            }

            if (pathname === '/api/operator/runbooks' && req.method === 'POST') {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const runbook = operatorService.upsertRunbook(payload);
                sendJson(res, { ok: true, runbook, runbooks: operatorService.listRunbooks() }, 201);
                return true;
            }

            const rbToggleMatch = pathname.match(/^\/api\/operator\/runbooks\/([^/]+)\/toggle$/);
            if (rbToggleMatch && (req.method === 'GET' || req.method === 'POST')) {
                const id = decodeURIComponent(rbToggleMatch[1]);
                let payload = {
                    index: url.searchParams.get('index'),
                    itemId: url.searchParams.get('itemId'),
                    done: url.searchParams.get('done')
                };
                if (req.method === 'POST') {
                    const body = await readRequestBody(req);
                    if (body) payload = { ...payload, ...JSON.parse(body) };
                }
                const runbook = operatorService.toggleRunbookItem(id, payload);
                sendJson(res, { ok: true, runbook });
                return true;
            }

            const rbResetMatch = pathname.match(/^\/api\/operator\/runbooks\/([^/]+)\/reset$/);
            if (rbResetMatch && (req.method === 'GET' || req.method === 'POST')) {
                const id = decodeURIComponent(rbResetMatch[1]);
                const runbook = operatorService.resetRunbook(id);
                sendJson(res, { ok: true, runbook });
                return true;
            }

            const rbDupMatch = pathname.match(/^\/api\/operator\/runbooks\/([^/]+)\/duplicate$/);
            if (rbDupMatch && req.method === 'POST') {
                const id = decodeURIComponent(rbDupMatch[1]);
                const runbook = operatorService.duplicateRunbook(id);
                sendJson(res, { ok: true, runbook, runbooks: operatorService.listRunbooks() }, 201);
                return true;
            }

            const rbSingleMatch = pathname.match(/^\/api\/operator\/runbooks\/([^/]+)$/);
            if (rbSingleMatch) {
                const id = decodeURIComponent(rbSingleMatch[1]);
                if (req.method === 'GET') {
                    const runbook = operatorService.getRunbook(id);
                    if (!runbook) {
                        sendError(res, 'Runbook not found', 404);
                        return true;
                    }
                    sendJson(res, { ok: true, runbook });
                    return true;
                }
                if (req.method === 'PUT' || req.method === 'POST') {
                    const body = await readRequestBody(req);
                    const payload = JSON.parse(body || '{}');
                    const runbook = operatorService.upsertRunbook({ ...payload, id });
                    sendJson(res, { ok: true, runbook, runbooks: operatorService.listRunbooks() });
                    return true;
                }
                if (req.method === 'DELETE') {
                    const result = operatorService.deleteRunbook(id);
                    sendJson(res, { ok: true, ...result });
                    return true;
                }
            }

            return false;
        } catch (err) {
            const status = err instanceof SyntaxError ? 400 : (err.status || 400);
            sendError(res, err, status);
            return true;
        }
    };
}

module.exports = { createOperatorRoutes };
