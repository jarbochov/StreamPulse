'use strict';

const { readRequestBody, sendJson, sendError } = require('./helpers');

function createTierListRoutes({ tierListService }) {
    return async function handleTierListRoutes(req, res, pathname, url) {
        if (!pathname.startsWith('/api/tier-list')) return false;

        try {
            // GET /api/tier-list
            if (pathname === '/api/tier-list' && req.method === 'GET') {
                sendJson(res, tierListService.getState());
                return true;
            }

            // PUT /api/tier-list
            if (pathname === '/api/tier-list' && req.method === 'PUT') {
                const raw = await readRequestBody(req);
                const updates = raw ? JSON.parse(raw) : {};
                const updated = tierListService.updateConfig(updates);
                sendJson(res, updated);
                return true;
            }

            // GET /api/tier-list/status (Companion friendly)
            if (pathname === '/api/tier-list/status' && req.method === 'GET') {
                const state = tierListService.getState();
                const vote = state.activeVote;
                const consensus = vote?.consensus || null;
                const chatVotingEnabled = state.settings?.chatVotingEnabled !== false;
                const placedCount = (state.items || []).filter(it => Boolean(it.tierId)).length;
                const unrankedCount = (state.items || []).filter(it => !it.tierId).length;
                sendJson(res, {
                    title: state.title || 'Tier List',
                    chatVotingEnabled,
                    tierCount: (state.tiers || []).length,
                    itemCount: (state.items || []).length,
                    placedCount,
                    unrankedCount,
                    focusedItemId: state.focusedItemId || null,
                    voteStatus: !chatVotingEnabled ? 'disabled' : (vote ? String(vote.status || 'IDLE').toLowerCase() : 'idle'),
                    activeVote: vote ? {
                        itemId: vote.itemId,
                        itemName: vote.itemName,
                        status: vote.status,
                        endsAt: vote.endsAt || null,
                        remainingSeconds: vote.endsAt ? Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000)) : 0,
                        consensusTier: consensus?.consensusTier?.label || null,
                        agreementPercent: consensus?.agreementPercent || 0,
                        totalVotes: consensus?.totalVotes || Object.keys(vote.votes || {}).length
                    } : null
                });
                return true;
            }

            // POST /api/tier-list/item
            if (pathname === '/api/tier-list/item' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const itemData = raw ? JSON.parse(raw) : {};
                const created = tierListService.addItem(itemData);
                sendJson(res, created, 201);
                return true;
            }

            // POST /api/tier-list/items/batch
            if (pathname === '/api/tier-list/items/batch' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const itemsList = Array.isArray(body) ? body : (body.items || []);
                const added = tierListService.batchAddItems(itemsList);
                sendJson(res, { count: added.length, items: added }, 201);
                return true;
            }

            // PUT /api/tier-list/item/:id
            if (pathname.startsWith('/api/tier-list/item/') && req.method === 'PUT') {
                const itemId = decodeURIComponent(pathname.slice('/api/tier-list/item/'.length));
                const raw = await readRequestBody(req);
                const updates = raw ? JSON.parse(raw) : {};
                const updated = tierListService.updateItem(itemId, updates);
                if (!updated) {
                    sendError(res, 'Item not found', 404);
                    return true;
                }
                sendJson(res, updated);
                return true;
            }

            // DELETE /api/tier-list/item/:id
            if (pathname.startsWith('/api/tier-list/item/') && req.method === 'DELETE') {
                const itemId = decodeURIComponent(pathname.slice('/api/tier-list/item/'.length));
                const deleted = tierListService.deleteItem(itemId);
                if (!deleted) {
                    sendError(res, 'Item not found', 404);
                    return true;
                }
                sendJson(res, { success: true, item: deleted });
                return true;
            }

            // POST /api/tier-list/move
            if (pathname === '/api/tier-list/move' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const moveData = raw ? JSON.parse(raw) : {};
                if (!moveData.itemId) {
                    sendError(res, 'Missing itemId', 400);
                    return true;
                }
                const moved = tierListService.moveItem(moveData);
                if (!moved) {
                    sendError(res, 'Item not found', 404);
                    return true;
                }
                sendJson(res, moved);
                return true;
            }

            // POST or GET /api/tier-list/reset (Companion friendly)
            if (pathname === '/api/tier-list/reset' && (req.method === 'POST' || req.method === 'GET')) {
                const state = tierListService.resetPlacements();
                sendJson(res, state);
                return true;
            }

            // POST /api/tier-list/clear
            if (pathname === '/api/tier-list/clear' && req.method === 'POST') {
                const state = tierListService.clearItems();
                sendJson(res, state);
                return true;
            }

            // POST or GET /api/tier-list/focus/clear (Companion friendly)
            if (pathname === '/api/tier-list/focus/clear' && (req.method === 'POST' || req.method === 'GET')) {
                const state = tierListService.clearFocus();
                sendJson(res, state);
                return true;
            }

            // POST or GET /api/tier-list/focus (Companion friendly)
            if (pathname === '/api/tier-list/focus' && (req.method === 'POST' || req.method === 'GET')) {
                let itemId = null;
                let clear = false;
                if (req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    const body = raw ? JSON.parse(raw) : {};
                    if (body.itemId !== undefined) itemId = body.itemId;
                    if (body.clear !== undefined) clear = Boolean(body.clear);
                }
                if (url && url.searchParams) {
                    if (url.searchParams.has('itemId')) itemId = url.searchParams.get('itemId');
                    if (url.searchParams.has('clear')) clear = !['0', 'false', 'no'].includes(url.searchParams.get('clear'));
                }
                if (clear || itemId === '' || itemId === null) {
                    const current = tierListService.getState();
                    if (clear || itemId === '') {
                        sendJson(res, tierListService.clearFocus());
                        return true;
                    }
                    // When called with no itemId, focus the first unranked item (or clear if already focused)
                    const nextUnranked = (current.items || []).find(i => !i.tierId);
                    if (!nextUnranked) {
                        sendError(res, 'No unranked items available to focus', 404);
                        return true;
                    }
                    itemId = nextUnranked.id;
                }
                const updated = tierListService.focusItem(itemId);
                if (!updated) {
                    sendError(res, 'Item not found', 404);
                    return true;
                }
                sendJson(res, updated);
                return true;
            }

            // POST or GET /api/tier-list/vote/start (Companion friendly: auto-selects next unranked if itemId omitted)
            if (pathname === '/api/tier-list/vote/start' && (req.method === 'POST' || req.method === 'GET')) {
                let body = {};
                if (req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    body = raw ? JSON.parse(raw) : {};
                }
                if (url && url.searchParams) {
                    if (url.searchParams.has('itemId')) body.itemId = url.searchParams.get('itemId');
                    if (url.searchParams.has('duration')) body.duration = Number(url.searchParams.get('duration'));
                    if (url.searchParams.has('mode')) body.consensusMode = url.searchParams.get('mode');
                }
                const state = tierListService.startVote(body);
                sendJson(res, state);
                return true;
            }

            // POST /api/tier-list/vote/cast
            if (pathname === '/api/tier-list/vote/cast' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const voteData = raw ? JSON.parse(raw) : {};
                const accepted = tierListService.castVote(voteData);
                sendJson(res, { accepted });
                return true;
            }

            // POST or GET /api/tier-list/vote/lock (Close voting and freeze votes without placing)
            if (pathname === '/api/tier-list/vote/lock' && (req.method === 'POST' || req.method === 'GET')) {
                const state = tierListService.lockVote();
                sendJson(res, state || { error: 'No active vote to lock' });
                return true;
            }

            // POST or GET /api/tier-list/vote/end (Companion friendly: lock & place or discard)
            if (pathname === '/api/tier-list/vote/end' && (req.method === 'POST' || req.method === 'GET')) {
                let apply = true;
                if (req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    const body = raw ? JSON.parse(raw) : {};
                    if (body.applyConsensus !== undefined) apply = body.applyConsensus !== false;
                }
                if (url && url.searchParams && url.searchParams.has('apply')) {
                    apply = !['0', 'false', 'no'].includes(url.searchParams.get('apply'));
                }
                const state = tierListService.endVote({ applyConsensus: apply });
                sendJson(res, state);
                return true;
            }

            // POST or GET /api/tier-list/vote/cancel (Companion friendly)
            if (pathname === '/api/tier-list/vote/cancel' && (req.method === 'POST' || req.method === 'GET')) {
                const state = tierListService.cancelVote();
                sendJson(res, state);
                return true;
            }

            // POST /api/tier-list/presets/save
            if (pathname === '/api/tier-list/presets/save' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const preset = tierListService.savePreset(body);
                sendJson(res, preset, 201);
                return true;
            }

            // GET /api/tier-list/presets
            if (pathname === '/api/tier-list/presets' && req.method === 'GET') {
                const state = tierListService.getState();
                sendJson(res, { presets: state.presets || [] });
                return true;
            }

            // POST or GET /api/tier-list/presets/:id/load (Companion friendly)
            if (pathname.startsWith('/api/tier-list/presets/') && pathname.endsWith('/load') && (req.method === 'POST' || req.method === 'GET')) {
                const presetId = pathname.slice('/api/tier-list/presets/'.length, -'/load'.length);
                const state = tierListService.loadPreset(presetId);
                sendJson(res, state);
                return true;
            }

            // POST /api/tier-list/presets/reset
            if (pathname === '/api/tier-list/presets/reset' && req.method === 'POST') {
                const presets = tierListService.resetPresets();
                sendJson(res, { presets });
                return true;
            }

            // DELETE /api/tier-list/presets/:id
            if (pathname.startsWith('/api/tier-list/presets/') && req.method === 'DELETE') {
                const presetId = pathname.slice('/api/tier-list/presets/'.length);
                const success = tierListService.deletePreset(presetId);
                sendJson(res, { success });
                return true;
            }

            sendError(res, 'Not found', 404);
            return true;
        } catch (err) {
            sendError(res, err, err?.statusCode || 500);
            return true;
        }
    };
}

module.exports = {
    createTierListRoutes
};
