const { readRequestBody, sendJson, sendError } = require('./helpers');

module.exports = function createMultiplayerBingoRoutes(service, { isMultiplayerBingoEnabled = () => false } = {}) {
    return async (req, res, url) => {
        // 1. Scoped LAN Player endpoints (token-only access to a single player's card)
        const playMatch = url.pathname.match(/^\/api\/bingo\/play\/([a-f0-9]{12,48})(?:\/(toggle))?$/i);
        if (playMatch) {
            if (!isMultiplayerBingoEnabled()) {
                sendError(res, 'Multiplayer Bingo (LAN) is disabled in System Config', 403);
                return true;
            }
            const token = playMatch[1];
            const action = playMatch[2];
            try {
                const found = service.findCardByToken(token);
                if (!found) {
                    sendError(res, 'Bingo card link not found or expired', 404);
                    return true;
                }
                if (!action && req.method === 'GET') {
                    sendJson(res, found);
                    return true;
                }
                if (action === 'toggle' && req.method === 'POST') {
                    const body = JSON.parse(await readRequestBody(req, 16 * 1024) || '{}');
                    service.toggleCell(found.cardId, body.cell, { isHost: false });
                    const updated = service.findCardByToken(token);
                    sendJson(res, { ok: true, ...updated });
                    return true;
                }
                sendError(res, 'Method not allowed', 405);
            } catch (error) {
                sendError(res, error, error?.statusCode || 400);
            }
            return true;
        }

        if (!url.pathname.startsWith('/api/multiplayer-bingo')) return false;
        const sub = url.pathname.slice('/api/multiplayer-bingo'.length).replace(/\/+$/, '');

        try {
            // GET /api/multiplayer-bingo -> full admin state (includes player tokens for host Copy URL)
            if (sub === '' && req.method === 'GET') {
                sendJson(res, { ...service.getState(), enabled: isMultiplayerBingoEnabled() });
                return true;
            }
            // GET /api/multiplayer-bingo/overlay -> sanitized state (no tokens) for OBS overlay
            if (sub === '/overlay' && req.method === 'GET') {
                sendJson(res, service.getSanitizedState());
                return true;
            }
            // GET /api/multiplayer-bingo/status -> Companion-friendly summary
            if (sub === '/status' && req.method === 'GET') {
                sendJson(res, { ...service.getPublicStatus(), enabled: isMultiplayerBingoEnabled() });
                return true;
            }

            // Prompt Packs CRUD
            const packIdMatch = sub.match(/^\/packs\/([a-z0-9_-]{1,60})$/i);
            if (sub === '/packs' && req.method === 'POST') {
                const body = JSON.parse(await readRequestBody(req, 128 * 1024) || '{}');
                const pack = service.savePack(body);
                sendJson(res, { ok: true, pack, state: service.getState() });
                return true;
            }
            if (sub === '/packs/select' && (req.method === 'GET' || req.method === 'POST')) {
                const body = req.method === 'POST' ? JSON.parse(await readRequestBody(req, 16 * 1024) || '{}') : {};
                const packId = url.searchParams.get('id') ?? body.id ?? body.packId ?? '';
                sendJson(res, { ok: true, state: service.selectPack(packId) });
                return true;
            }
            if (packIdMatch) {
                const packId = packIdMatch[1];
                if (req.method === 'PUT' || req.method === 'POST') {
                    const body = JSON.parse(await readRequestBody(req, 128 * 1024) || '{}');
                    const pack = service.savePack(body, packId);
                    sendJson(res, { ok: true, pack, state: service.getState() });
                    return true;
                }
                if (req.method === 'DELETE') {
                    sendJson(res, { ok: true, state: service.deletePack(packId) });
                    return true;
                }
                sendError(res, 'Method not allowed', 405);
                return true;
            }

            // Appearance update
            if (sub === '/appearance' && (req.method === 'POST' || req.method === 'PUT')) {
                const body = JSON.parse(await readRequestBody(req, 32 * 1024) || '{}');
                const appearance = service.updateAppearance(body);
                sendJson(res, { ok: true, appearance, state: service.getState() });
                return true;
            }

            // Companion-friendly GET/POST live controls
            if (req.method === 'GET' || req.method === 'POST') {
                const body = req.method === 'POST' ? JSON.parse(await readRequestBody(req, 32 * 1024) || '{}') : {};

                if (sub === '/players/add') {
                    const result = service.addPlayer({
                        name: url.searchParams.get('name') ?? body.name,
                        color: url.searchParams.get('color') ?? body.color
                    });
                    sendJson(res, { ok: true, ...result });
                    return true;
                }
                if (sub === '/players/remove') {
                    const cardId = url.searchParams.get('card') ?? body.card ?? body.cardId ?? '';
                    sendJson(res, { ok: true, state: service.removePlayer(cardId) });
                    return true;
                }
                if (sub === '/players/regen') {
                    const cardId = url.searchParams.get('card') ?? body.card ?? body.cardId ?? '';
                    sendJson(res, { ok: true, ...service.regenerateToken(cardId) });
                    return true;
                }
                if (sub === '/players/toggle') {
                    const cardId = url.searchParams.get('card') ?? body.card ?? body.cardId ?? '';
                    const cell = url.searchParams.has('cell') ? Number(url.searchParams.get('cell')) : Number(body.cell);
                    const forceState = url.searchParams.has('stamped')
                        ? (url.searchParams.get('stamped') === '1' || url.searchParams.get('stamped') === 'true')
                        : body.stamped;
                    sendJson(res, { ok: true, state: service.toggleCell(cardId, cell, { isHost: true, forceState }) });
                    return true;
                }
                if (sub === '/flags') {
                    const patch = {};
                    if (url.searchParams.has('hidden') || body.hidden !== undefined) {
                        patch.hidden = url.searchParams.has('hidden')
                            ? (url.searchParams.get('hidden') === '1' || url.searchParams.get('hidden') === 'true')
                            : body.hidden;
                    }
                    if (url.searchParams.has('locked') || body.locked !== undefined) {
                        patch.locked = url.searchParams.has('locked')
                            ? (url.searchParams.get('locked') === '1' || url.searchParams.get('locked') === 'true')
                            : body.locked;
                    }
                    if (url.searchParams.has('focusedCardId') || body.focusedCardId !== undefined) {
                        patch.focusedCardId = url.searchParams.get('focusedCardId') ?? body.focusedCardId;
                    }
                    sendJson(res, { ok: true, state: service.setFlags(patch) });
                    return true;
                }
                if (sub === '/focus') {
                    const target = url.searchParams.get('card') ?? body.card ?? '';
                    const cur = service.getState().session;
                    const toggle = url.searchParams.get('toggle') === '1' || body.toggle;
                    const nextFocus = target && cur.focusedCardId === target && toggle ? '' : target;
                    sendJson(res, { ok: true, state: service.setFlags({ focusedCardId: nextFocus }) });
                    return true;
                }
                if (sub === '/shuffle') {
                    sendJson(res, { ok: true, state: service.shuffleAll() });
                    return true;
                }
                if (sub === '/reset') {
                    sendJson(res, { ok: true, state: service.resetBoard() });
                    return true;
                }
                if (sub === '/call') {
                    const prompt = url.searchParams.has('prompt') ? Number(url.searchParams.get('prompt')) : Number(body.prompt);
                    const forceState = url.searchParams.has('called')
                        ? (url.searchParams.get('called') === '1' || url.searchParams.get('called') === 'true')
                        : body.called;
                    sendJson(res, { ok: true, state: service.callPrompt(prompt, forceState) });
                    return true;
                }
            }

            sendError(res, 'Not found', 404);
        } catch (error) {
            sendError(res, error, error?.statusCode || 400);
        }
        return true;
    };
};
