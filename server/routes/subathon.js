'use strict';

const { readRequestBody, sendJson, sendText, sendError } = require('./helpers');

function createSubathonRoutes({ subathonService }) {
    return async function handleSubathonRoutes(req, res, pathname) {
        if (!pathname.startsWith('/api/subathon')) {
            return false;
        }

        // If module is disabled in config, return 404 or disabled error
        if (!subathonService.isModuleEnabled() && pathname !== '/api/subathon/status') {
            sendJson(res, { ok: false, error: 'Subathon module is disabled in System Configuration', isModuleEnabled: false }, 404);
            return true;
        }

        if (pathname === '/api/subathon' && req.method === 'GET') {
            sendJson(res, {
                ok: true,
                config: subathonService.getConfigSnapshot(),
                state: subathonService.getStateSnapshot(),
                rulesSummary: subathonService.getRuleSummary()
            });
            return true;
        }

        if (pathname === '/api/subathon' && (req.method === 'PUT' || req.method === 'POST')) {
            try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const config = subathonService.updateConfig(payload);
                sendJson(res, { ok: true, config });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/subathon/rules' && req.method === 'GET') {
            sendJson(res, { ok: true, rules: subathonService.getRuleSummary() });
            return true;
        }

        if (pathname === '/api/subathon/toggle' && (req.method === 'POST' || req.method === 'GET')) {
            const current = subathonService.getConfigSnapshot();
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const queryMode = urlObj.searchParams.get('mode') || urlObj.searchParams.get('action');
            let nextState;
            if (queryMode === 'on' || queryMode === 'true') nextState = true;
            else if (queryMode === 'off' || queryMode === 'false') nextState = false;
            else nextState = !current.enabled;

            const config = subathonService.updateConfig({ enabled: nextState });
            sendJson(res, { ok: true, enabled: config.enabled });
            return true;
        }

        if (pathname === '/api/subathon/multiplier' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                const urlObj = new URL(req.url, `http://${req.headers.host}`);
                let factor = parseFloat(urlObj.searchParams.get('factor') || urlObj.searchParams.get('multiplier') || '2');
                let minutes = parseInt(urlObj.searchParams.get('minutes') || urlObj.searchParams.get('duration') || '60', 10);

                if (req.method === 'POST') {
                    const body = await readRequestBody(req);
                    if (body) {
                        try {
                            const parsed = JSON.parse(body);
                            if (parsed.factor !== undefined) factor = parseFloat(parsed.factor);
                            if (parsed.minutes !== undefined) minutes = parseInt(parsed.minutes, 10);
                        } catch (_) {}
                    }
                }

                const mult = subathonService.setMultiplier(factor, minutes);
                sendJson(res, { ok: true, multiplier: mult, rulesSummary: subathonService.getRuleSummary() });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/subathon/clear_multiplier' && (req.method === 'POST' || req.method === 'GET')) {
            const mult = subathonService.clearMultiplier();
            sendJson(res, { ok: true, multiplier: mult, rulesSummary: subathonService.getRuleSummary() });
            return true;
        }

        if (pathname === '/api/subathon/undo' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                const result = subathonService.undoLast();
                sendJson(res, result);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/subathon/reset_stats' && (req.method === 'POST' || req.method === 'GET')) {
            const state = subathonService.resetStats();
            sendJson(res, { ok: true, state });
            return true;
        }

        if (pathname === '/api/subathon/test' && req.method === 'POST') {
            try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const result = subathonService.processEvent(payload);
                sendJson(res, { ok: true, result });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname.startsWith('/api/subathon/field/') && req.method === 'GET') {
            const field = pathname.slice('/api/subathon/field/'.length).trim().toLowerCase();
            const cfg = subathonService.getConfigSnapshot();
            const state = subathonService.getStateSnapshot();
            const summary = subathonService.getRuleSummary();

            const fieldMap = {
                status: cfg.isActive ? 'active' : 'disabled',
                enabled: String(cfg.enabled),
                target_timer: cfg.targetTimerId,
                multiplier: summary.multiplier || '1x',
                happy_hour: String(summary.happyHourActive),
                total_added_seconds: String(state.totalTimeAddedSeconds),
                total_added: summary.formattedTotal || `${Math.round(state.totalTimeAddedSeconds / 60)}m`,
                subs_count: String(state.totalSubs),
                bits_total: String(state.totalBits),
                donations_total: `$${state.totalDonations.toFixed(2)}`,
                follows_total: String(state.totalFollows),
                raids_total: String(state.totalRaids),
                summary: summary.summary
            };

            if (!(field in fieldMap)) {
                sendText(res, `Unknown subathon field: ${field}`, 404, 'text/plain');
                return true;
            }

            sendText(res, fieldMap[field], 200, 'text/plain');
            return true;
        }

        return false;
    };
}

module.exports = {
    createSubathonRoutes
};
