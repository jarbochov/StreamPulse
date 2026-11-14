const fs = require('fs');
const { sanitizeGoalId, normalizeGoalsConfig, DEFAULT_GOALS_CONFIG } = require('../services/goals');
const { normalizeViewerTrackingConfig } = require('../services/viewers');
const { readRequestBody, sendJson, sendError } = require('./helpers');

function createGoalsRoutes({
    goalsService,
    getConfig = () => ({}),
    configPath = '',
    safeWriteFileSync = () => {},
    applyRuntimeConfig = () => {}
}) {
    return async function handleGoalsRoutes(req, res, pathname, url) {
        if (!pathname.startsWith('/api/goals')) {
            return false;
        }

        const parsedUrl = url || new URL(req.url || '/', 'http://localhost');

        if (pathname === '/api/goals' && req.method === 'GET') {
            sendJson(res, goalsService.buildGoalsSnapshot());
            return true;
        }

        if (pathname === '/api/goals/status' && req.method === 'GET') {
            sendJson(res, goalsService.getStatusSummary());
            return true;
        }

        if (pathname === '/api/goals/config') {
            if (req.method === 'GET') {
                const config = getConfig();
                sendJson(res, {
                    viewer_tracking: normalizeViewerTrackingConfig(config.viewer_tracking),
                    goals: normalizeGoalsConfig(config.goals || DEFAULT_GOALS_CONFIG)
                });
                return true;
            }

            if (req.method === 'PUT') {
                try {
                    const body = await readRequestBody(req);
                    const payload = JSON.parse(body || '{}');
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    if (payload.viewer_tracking !== undefined) current.viewer_tracking = normalizeViewerTrackingConfig(payload.viewer_tracking);
                    if (payload.goals !== undefined) current.goals = normalizeGoalsConfig(payload.goals);
                    safeWriteFileSync(configPath, JSON.stringify(current, null, 2));
                    applyRuntimeConfig(current);
                    sendJson(res, {
                        status: 'saved',
                        viewer_tracking: normalizeViewerTrackingConfig(current.viewer_tracking),
                        goals: normalizeGoalsConfig(current.goals || DEFAULT_GOALS_CONFIG)
                    });
                } catch (err) {
                    sendError(res, err, 400);
                }
                return true;
            }
        }

        if (pathname.startsWith('/api/goals/') && (req.method === 'POST' || req.method === 'GET')) {
            const goalPath = pathname.slice('/api/goals/'.length);
            const [goalIdRaw, actionRaw] = goalPath.split('/').filter(Boolean).map(decodeURIComponent);
            const goalId = sanitizeGoalId(goalIdRaw);
            const action = String(actionRaw || '').toLowerCase();
            if (!goalId || !action) {
                sendError(res, 'Goal action not found', 404);
                return true;
            }

            try {
                if (action === 'reset') {
                    const snapshot = goalsService.resetGoalBaseline(goalId);
                    sendJson(res, { ok: true, goals: snapshot });
                    return true;
                }

                if (action === 'toggle' || action === 'enable' || action === 'disable') {
                    const snapshot = goalsService.toggleGoalEnabled(goalId, action === 'enable' ? 'on' : action === 'disable' ? 'off' : 'toggle');
                    sendJson(res, { ok: true, goals: snapshot });
                    return true;
                }

                if (action === 'add' || action === 'increment' || action === 'adjust') {
                    let body = {};
                    if (req.method === 'POST') {
                        const raw = await readRequestBody(req);
                        body = raw ? JSON.parse(raw) : {};
                    }
                    const qp = parsedUrl.searchParams;
                    const rawAmount = qp.has('amount')
                        ? qp.get('amount')
                        : (qp.has('delta')
                            ? qp.get('delta')
                            : (qp.has('value') ? qp.get('value') : (body.amount ?? body.delta ?? body.value ?? 1)));
                    const amount = Number(rawAmount);
                    const snapshot = goalsService.adjustGoalProgress(goalId, amount);
                    const goal = snapshot.items.find(item => item.id === goalId) || null;
                    sendJson(res, { ok: true, amount, goal, goals: snapshot });
                    return true;
                }

                sendError(res, `Unsupported goal action: ${action}`, 400);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        return false;
    };
}

module.exports = {
    createGoalsRoutes
};
