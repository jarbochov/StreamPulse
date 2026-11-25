const { readRequestBody, sendJson, sendError } = require('./helpers');

module.exports = function createVariableDisplayRoutes(service) {
    return async (req, res, url) => {
        const bingoMatch = url.pathname.match(/^\/api\/variable-displays\/([a-z0-9_-]{1,60})\/bingo(?:\/(toggle|shuffle|reset))?$/i);
        if (bingoMatch) {
            const id = bingoMatch[1];
            const action = bingoMatch[2];
            try {
                if (!action && req.method === 'GET') {
                    sendJson(res, { id, state: service.getBingoState(id) });
                    return true;
                }
                if (action && (req.method === 'GET' || req.method === 'POST')) {
                    const body = req.method === 'POST' ? JSON.parse(await readRequestBody(req, 64 * 1024) || '{}') : {};
                    if (action === 'toggle') {
                        const cell = url.searchParams.has('cell') ? Number(url.searchParams.get('cell')) : Number(body.cell);
                        const stateParam = url.searchParams.has('stamped') ? url.searchParams.get('stamped') === '1' || url.searchParams.get('stamped') === 'true' : body.stamped;
                        sendJson(res, { id, state: service.toggleBingoCell(id, cell, stateParam) });
                    } else if (action === 'shuffle') {
                        const poolLen = Number(url.searchParams.get('count') ?? body.count ?? 0) || 0;
                        sendJson(res, { id, state: service.shuffleBingo(id, poolLen) });
                    } else if (action === 'reset') {
                        sendJson(res, { id, state: service.resetBingo(id) });
                    }
                    return true;
                }
                sendError(res, 'Method not allowed', 405);
            } catch (error) {
                sendError(res, error);
            }
            return true;
        }
        const match = url.pathname.match(/^\/api\/variable-displays(?:\/([a-z0-9_-]{1,60})(\/dependencies)?)?$/i);
        if (!match) return false;
        const id = match[1];
        try {
            if (match[2]) {
                if (req.method !== 'GET') sendError(res, 'Method not allowed', 405);
                else sendJson(res, { dependencies: service.dependencies(id) });
                return true;
            }
            if (req.method === 'GET') {
                if (id) {
                    const data = service.get(id);
                    if (!data) sendError(res, 'Display not found', 404);
                    else sendJson(res, data);
                } else {
                    const data = service.getState();
                    const usageCounts = {};
                    for (const d of data.displays || []) {
                        try { usageCounts[d.id] = service.dependencies(d.id).length; } catch { usageCounts[d.id] = 0; }
                    }
                    sendJson(res, { ...data, usageCounts });
                }
            } else if (['POST', 'PUT'].includes(req.method)) {
                sendJson(res, service.save(JSON.parse(await readRequestBody(req, 256 * 1024) || '{}'), id));
            } else if (req.method === 'DELETE' && id) {
                service.remove(id);
                sendJson(res, { ok: true });
            } else sendError(res, 'Method not allowed', 405);
        } catch (error) {
            if (error.dependencies) sendJson(res, { error: error.message, dependencies: error.dependencies }, 409);
            else sendError(res, error);
        }
        return true;
    };
};
