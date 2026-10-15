const { readRequestBody, sendJson, sendError } = require('./helpers');

function createCrmRoutes({ crmService }) {
    return async function handleCrmRoutes(req, res, url, pathname) {
        if (pathname === '/api/chatters' && req.method === 'GET') {
            const query = (url.searchParams.get('q') || '').toLowerCase().trim();
            const tagFilter = (url.searchParams.get('tag') || '').toLowerCase().trim();
            const result = crmService.getChattersList({ query, tagFilter });
            sendJson(res, result);
            return true;
        }

        const mChatterNotes = pathname.match(/^\/api\/chatters\/([^/]+)\/notes$/);
        if (mChatterNotes && req.method === 'POST') {
            const username = decodeURIComponent(mChatterNotes[1]);
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const dossier = crmService.updateChatterNotes(username, body);
                sendJson(res, dossier);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        const mChatter = pathname.match(/^\/api\/chatters\/([^/]+)$/);
        if (mChatter && req.method === 'GET') {
            const username = decodeURIComponent(mChatter[1]);
            const dossier = crmService.getChatterDossier(username);
            if (!dossier) {
                sendJson(res, { error: 'Chatter not found' }, 404);
                return true;
            }
            sendJson(res, dossier);
            return true;
        }

        return false;
    };
}

module.exports = {
    createCrmRoutes
};
