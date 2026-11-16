const { readRequestBody, sendJson, sendError } = require('./helpers');

module.exports = function createVariableDisplayRoutes(service) {
    return async (req, res, url) => {
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
                const data = id ? service.get(id) : service.getState();
                if (!data) sendError(res, 'Display not found', 404);
                else sendJson(res, data);
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
