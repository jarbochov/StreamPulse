const { readRequestBody, sendJson, sendError } = require('./helpers');

module.exports = function createVariableDisplayRoutes(service) {
    return async (req, res, url) => {
        const match = url.pathname.match(/^\/api\/variable-displays(?:\/([a-z0-9_-]{1,60}))?$/i);
        if (!match) return false;
        const id = match[1];
        try {
            if (req.method === 'GET') {
                const data = id ? service.get(id) : service.getState();
                if (!data) sendError(res, 'Display not found', 404);
                else sendJson(res, data);
            } else if (['POST', 'PUT'].includes(req.method)) {
                sendJson(res, service.save(JSON.parse(await readRequestBody(req, 256 * 1024) || '{}'), id));
            } else if (req.method === 'DELETE' && id) {
                service.remove(id);
                sendJson(res, { ok: true });
            } else sendError(res, 'Method not allowed', 405);
        } catch (error) { sendError(res, error); }
        return true;
    };
};
