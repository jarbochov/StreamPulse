const { readRequestBody, sendJson, sendError } = require('./helpers');
const { normalize, normalizeTheme } = require('../../public/js/promo-model');

function createPromoRoutes({ service, artworkService }) {
    return async (req, res, pathname) => {
        if (pathname.startsWith('/api/promos/igdb/')) {
            try {
                if (!artworkService) throw new Error('IGDB artwork service is unavailable.');
                let result;
                if (pathname === '/api/promos/igdb/search' && req.method === 'GET') {
                    result = await artworkService.search(new URL(req.url, 'http://localhost').searchParams.get('q'));
                } else if (/^\/api\/promos\/igdb\/games\/[1-9][0-9]*$/.test(pathname) && req.method === 'GET') {
                    result = await artworkService.gameMedia(pathname.split('/').pop());
                } else if (pathname === '/api/promos/igdb/import' && req.method === 'POST') {
                    let payload;
                    try { payload = JSON.parse(await readRequestBody(req, 8192)); }
                    catch (error) { sendError(res, error.message, 400); return true; }
                    if (!payload || typeof payload !== 'object') { sendError(res, 'Choose an IGDB game and image.', 400); return true; }
                    result = await artworkService.importImage(payload.gameId, payload.imageId);
                } else { sendError(res, 'Unknown artwork operation or method', 405); return true; }
                sendJson(res, result);
            } catch (error) {
                if (!error.status || error.status >= 500) console.error('[Promo artwork]', error.message);
                sendError(res, error.message, error.status || 502);
            }
            return true;
        }
        const match = pathname.match(/^\/api\/(promos|promo-themes)(?:\/([a-zA-Z0-9-]+))?$/);
        if (!match) return false;
        const themes = match[1] === 'promo-themes', id = match[2];
        try {
            if (req.method === 'GET') {
                const designs = themes ? service.listThemes() : service.list();
                const result = id ? designs.find(design => design.id === id) : designs;
                if (!result) sendError(res, themes ? 'Custom theme not found' : 'Promo not found', 404);
                else sendJson(res, result);
            } else if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
                let payload;
                try { payload = (themes ? normalizeTheme : normalize)(JSON.parse(await readRequestBody(req, 256 * 1024))); }
                catch (error) { sendError(res, error.message, 400); return true; }
                const design = themes ? service.saveTheme(payload, id) : service.save(payload, id);
                if (!design) sendError(res, themes ? 'Custom theme not found' : 'Promo not found', 404);
                else sendJson(res, design, id ? 200 : 201);
            } else if (req.method === 'DELETE' && id) {
                if (!(themes ? service.removeTheme(id) : service.remove(id))) sendError(res, themes ? 'Custom theme not found' : 'Promo not found', 404);
                else sendJson(res, { deleted: id });
            } else sendError(res, 'Method not allowed', 405);
        } catch (error) {
            console.error('[Promos]', error.message);
            sendError(res, 'Could not access the promo library. Check the server log.', 500);
        }
        return true;
    };
}

module.exports = { createPromoRoutes };
