'use strict';

/**
 * StreamPulse Shared Color Palettes Library API Routes
 * Handles /api/palettes/* endpoints via native Node HTTP router.
 */

const { sendJson, sendError, parseJsonOrQuery } = require('./helpers');

function createPalettesRoutes({ palettesService }) {
    return async function handlePalettesRoutes(req, res, url, pathname) {
        if (pathname !== '/api/palettes' && !pathname.startsWith('/api/palettes/')) {
            return false;
        }

        const method = req.method || 'GET';

        if (pathname === '/api/palettes' && method === 'GET') {
            sendJson(res, palettesService.list());
            return true;
        }

        if (pathname === '/api/palettes/status' && method === 'GET') {
            sendJson(res, palettesService.getStatus());
            return true;
        }

        if (pathname === '/api/palettes' && method === 'POST') {
            try {
                const body = await parseJsonOrQuery(req, url);
                const palette = palettesService.create(body || {});
                sendJson(res, { ok: true, palette, ...palettesService.list() }, 201);
            } catch (err) {
                sendError(res, err.message, 400);
            }
            return true;
        }

        const dupMatch = pathname.match(/^\/api\/palettes\/([^/]+)\/duplicate$/);
        if (dupMatch && (method === 'POST' || method === 'GET')) {
            try {
                const id = decodeURIComponent(dupMatch[1]);
                const body = await parseJsonOrQuery(req, url);
                const palette = palettesService.duplicate(id, body?.name || '');
                sendJson(res, { ok: true, palette, ...palettesService.list() }, 201);
            } catch (err) {
                sendError(res, err.message, /not found/i.test(err.message) ? 404 : 400);
            }
            return true;
        }

        const idMatch = pathname.match(/^\/api\/palettes\/([^/]+)$/);
        if (idMatch) {
            const id = decodeURIComponent(idMatch[1]);
            if (method === 'GET') {
                const palette = palettesService.getById(id);
                if (!palette) {
                    sendError(res, 'Palette not found', 404);
                    return true;
                }
                sendJson(res, { palette });
                return true;
            }
            if (method === 'PUT' || method === 'PATCH') {
                try {
                    const body = await parseJsonOrQuery(req, url);
                    const palette = palettesService.update(id, body || {});
                    sendJson(res, { ok: true, palette, ...palettesService.list() });
                } catch (err) {
                    sendError(res, err.message, /not found/i.test(err.message) ? 404 : 400);
                }
                return true;
            }
            if (method === 'DELETE') {
                try {
                    const removed = palettesService.remove(id);
                    sendJson(res, { ok: true, removed, ...palettesService.list() });
                } catch (err) {
                    sendError(res, err.message, /not found/i.test(err.message) ? 404 : 400);
                }
                return true;
            }
        }

        sendError(res, 'Method not allowed', 405);
        return true;
    };
}

module.exports = { createPalettesRoutes };
