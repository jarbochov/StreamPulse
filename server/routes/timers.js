const { sanitizeTimerId, buildTimerSnapshot } = require('../services/timers');
const { readRequestBody, sendJson, sendText, sendError } = require('./helpers');

function createTimersRoutes({ timerService }) {
    return async function handleTimersRoutes(req, res, pathname) {
        if (!pathname.startsWith('/api/timers')) {
            return false;
        }

        if (pathname === '/api/timers' && req.method === 'GET') {
            sendJson(res, timerService.buildTimersSnapshot());
            return true;
        }

        if (pathname === '/api/timers' && req.method === 'POST') {
            try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const timer = timerService.upsertTimer(payload);
                sendJson(res, { ok: true, timer: buildTimerSnapshot(timer) });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/timers/settings' && req.method === 'GET') {
            sendJson(res, timerService.getSettings());
            return true;
        }

        if (pathname === '/api/timers/settings' && req.method === 'PUT') {
            try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const settings = timerService.updateSettings(payload);
                sendJson(res, { ok: true, settings });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname.startsWith('/api/timers/')) {
            const timerPath = pathname.slice('/api/timers/'.length);
            const segments = timerPath.split('/').filter(Boolean).map(decodeURIComponent);
            const timerId = sanitizeTimerId(segments[0]);

            if (!timerId) {
                sendError(res, 'Timer not found', 404);
                return true;
            }

            try {
                if (segments.length === 1 && req.method === 'GET') {
                    const timer = timerService.getTimerOrThrow(timerId);
                    sendJson(res, buildTimerSnapshot(timer));
                    return true;
                }

                if (segments.length === 1 && req.method === 'PUT') {
                    const body = await readRequestBody(req);
                    const payload = JSON.parse(body || '{}');
                    payload.id = timerId;
                    const timer = timerService.upsertTimer(payload);
                    sendJson(res, { ok: true, timer: buildTimerSnapshot(timer) });
                    return true;
                }

                if (segments.length === 1 && req.method === 'DELETE') {
                    timerService.deleteTimer(timerId);
                    sendJson(res, { ok: true, deleted: timerId });
                    return true;
                }

                if (segments[1] === 'control' && (req.method === 'POST' || req.method === 'GET')) {
                    const body = req.method === 'POST' ? await readRequestBody(req) : '';
                    let payload = {};
                    if (body) payload = JSON.parse(body);
                    const urlObj = new URL(req.url, `http://${req.headers.host}`);
                    const action = String(payload.action || urlObj.searchParams.get('action') || '').trim().toLowerCase();
                    const timer = timerService.getTimerOrThrow(timerId);
                    const snapshot = timerService.applyTimerControl(timer, action, {
                        ...payload,
                        durationMs: payload.durationMs ?? urlObj.searchParams.get('durationMs'),
                        days: payload.days ?? urlObj.searchParams.get('days'),
                        hours: payload.hours ?? urlObj.searchParams.get('hours'),
                        minutes: payload.minutes ?? urlObj.searchParams.get('minutes'),
                        seconds: payload.seconds ?? urlObj.searchParams.get('seconds'),
                        mode: payload.mode ?? urlObj.searchParams.get('mode'),
                        value: payload.value ?? urlObj.searchParams.get('value')
                    });
                    sendJson(res, { ok: true, timer: snapshot });
                    return true;
                }

                if (segments[1] === 'field' && segments[2] && req.method === 'GET') {
                    const timer = timerService.getTimerOrThrow(timerId);
                    const snapshot = buildTimerSnapshot(timer);
                    const field = segments[2];
                    const valueMap = {
                        id: snapshot.id,
                        label: snapshot.label,
                        kind: snapshot.kind,
                        state: snapshot.state,
                        visible: String(snapshot.visible),
                        remaining_ms: snapshot.kind === 'countdown' ? String(snapshot.remainingMs) : '',
                        remaining: snapshot.kind === 'countdown' ? snapshot.formattedRemaining : '',
                        elapsed_ms: snapshot.kind === 'stopwatch' ? String(snapshot.elapsedMs) : '',
                        elapsed: snapshot.kind === 'stopwatch' ? snapshot.formattedElapsed : '',
                        progress: snapshot.kind === 'countdown' ? String(Math.round(snapshot.percentComplete * 100)) : '',
                        title: snapshot.displayTitle || snapshot.label
                    };
                    if (!(field in valueMap)) {
                        sendText(res, `Unknown field: ${field}`, 404, 'text/plain');
                        return true;
                    }
                    sendText(res, valueMap[field], 200, 'text/plain');
                    return true;
                }
            } catch (err) {
                const statusCode = err.message === 'Timer not found' ? 404 : 400;
                sendError(res, err, statusCode);
                return true;
            }
        }

        return false;
    };
}

module.exports = {
    createTimersRoutes
};
