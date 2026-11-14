'use strict';

const { readRequestBody, sendJson, sendError } = require('./helpers');

/**
 * Creates the HTTP request router for the Trivia module
 * 
 * Supports both standard REST methods (POST, PUT, DELETE) and Companion-friendly
 * GET triggers for Stream Deck / Bitfocus Companion automation buttons.
 */
function createTriviaRoutes({ triviaService, isTriviaEnabled = () => true }) {
    return async function handleTriviaRoutes(req, res, pathname, url) {
        if (!pathname.startsWith('/api/trivia')) return false;

        // Check if module is disabled (unless checking public overlay status or config)
        if (!isTriviaEnabled() && pathname !== '/api/trivia/status') {
            sendError(res, 'Trivia module is disabled in System Config', 403);
            return true;
        }

        try {
            // GET /api/trivia - Full public state (includeAnswers query parameter for admin view)
            if (pathname === '/api/trivia' && req.method === 'GET') {
                const includeAnswers = url.searchParams.get('includeAnswers') === 'true' || url.searchParams.get('admin') === 'true';
                sendJson(res, triviaService.getPublicState({ includeAnswers }));
                return true;
            }

            // GET /api/trivia/status - Lightweight status for Companion/widgets
            if (pathname === '/api/trivia/status' && req.method === 'GET') {
                sendJson(res, triviaService.getStatusSummary());
                return true;
            }

            // PUT /api/trivia - Update settings and/or theme
            if (pathname === '/api/trivia' && req.method === 'PUT') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                if (body.settings) triviaService.updateSettings(body.settings);
                if (body.theme) triviaService.updateTheme(body.theme);
                if (body.leaderboardTheme) triviaService.updateLeaderboardTheme(body.leaderboardTheme);
                sendJson(res, triviaService.getPublicState({ includeAnswers: true }));
                return true;
            }

            // GET /api/trivia/leaderboard - Fetch ranked player stats
            if (pathname === '/api/trivia/leaderboard' && req.method === 'GET') {
                const scope = url.searchParams.get('scope') === 'session' ? 'session' : 'season';
                const sortBy = url.searchParams.get('sort') || url.searchParams.get('sortBy') || null;
                const limitParam = url.searchParams.get('limit');
                const limit = limitParam !== null ? parseInt(limitParam, 10) : null;
                sendJson(res, triviaService.getLeaderboard({ scope, sortBy, limit }));
                return true;
            }

            // GET /api/trivia/leaderboard/player - Lookup individual player stats
            if (pathname === '/api/trivia/leaderboard/player' && req.method === 'GET') {
                const user = url.searchParams.get('user') || url.searchParams.get('name') || '';
                const stats = triviaService.getPlayerStats(user);
                sendJson(res, stats ? { found: true, ...stats } : { found: false, key: user.toLowerCase() });
                return true;
            }

            // POST or GET /api/trivia/leaderboard/reset - Reset session, season, or both (Companion friendly)
            if (pathname === '/api/trivia/leaderboard/reset' && (req.method === 'POST' || req.method === 'GET')) {
                let scope = url.searchParams.get('scope') || '';
                if (!scope && req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    const body = raw ? JSON.parse(raw) : {};
                    scope = body.scope || 'session';
                }
                const result = triviaService.resetLeaderboard(scope || 'session');
                sendJson(res, result);
                return true;
            }

            // GET /api/trivia/leaderboard/export - Export leaderboard stats as JSON or CSV
            if (pathname === '/api/trivia/leaderboard/export' && req.method === 'GET') {
                const scope = url.searchParams.get('scope') === 'session' ? 'session' : 'season';
                const format = (url.searchParams.get('format') || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
                const data = triviaService.exportLeaderboard({ scope, format });
                if (format === 'csv') {
                    res.writeHead(200, {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': `attachment; filename="trivia-leaderboard-${scope}.csv"`
                    });
                    res.end(data);
                    return true;
                }
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': `attachment; filename="trivia-leaderboard-${scope}.json"`
                });
                res.end(JSON.stringify(data, null, 2));
                return true;
            }

            // POST /api/trivia/leaderboard/import - Import leaderboard stats JSON
            if (pathname === '/api/trivia/leaderboard/import' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const scope = (url.searchParams.get('scope') || body.scope) === 'session' ? 'session' : 'season';
                const replace = url.searchParams.get('replace') === 'true' || Boolean(body.replace);
                const result = triviaService.importLeaderboard(body, { replace, scope });
                sendJson(res, { success: true, ...result }, 201);
                return true;
            }

            // PUT or POST /api/trivia/leaderboard/theme - Update or reset leaderboard overlay theme
            if (pathname === '/api/trivia/leaderboard/theme' && (req.method === 'PUT' || req.method === 'POST')) {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const leaderboardTheme = triviaService.updateLeaderboardTheme(body);
                sendJson(res, { success: true, leaderboardTheme });
                return true;
            }

            // POST or GET /api/trivia/question/start (Companion friendly)
            if ((pathname === '/api/trivia/question/start' || pathname === '/api/trivia/start') && (req.method === 'POST' || req.method === 'GET')) {
                let targetIdOrIndex = null;
                let duration = null;

                const startOptions = {};
                if (req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    if (raw) {
                        try {
                            const body = JSON.parse(raw);
                            if (body.id !== undefined) targetIdOrIndex = body.id;
                            else if (body.index !== undefined) targetIdOrIndex = Number(body.index);
                            if (body.duration) duration = Number(body.duration);
                            if (body.autoReveal !== undefined) startOptions.autoReveal = Boolean(body.autoReveal);
                            if (body.manualTransition !== undefined) startOptions.manualTransition = Boolean(body.manualTransition);
                        } catch {}
                    }
                }

                // Check query parameters (GET or fallback)
                if (targetIdOrIndex === null) {
                    if (url.searchParams.has('id')) targetIdOrIndex = url.searchParams.get('id');
                    else if (url.searchParams.has('index')) targetIdOrIndex = parseInt(url.searchParams.get('index'), 10);
                }
                if (!duration && url.searchParams.has('duration')) {
                    duration = parseInt(url.searchParams.get('duration'), 10);
                }
                if (duration !== undefined) startOptions.duration = duration;
                if (url.searchParams.has('manualTransition')) {
                    startOptions.manualTransition = url.searchParams.get('manualTransition') === '1' || url.searchParams.get('manualTransition') === 'true';
                }
                if (url.searchParams.has('autoReveal')) {
                    startOptions.autoReveal = url.searchParams.get('autoReveal') === '1' || url.searchParams.get('autoReveal') === 'true';
                }

                const result = triviaService.startQuestion(targetIdOrIndex, startOptions);
                sendJson(res, result);
                return true;
            }

            // POST or GET /api/trivia/question/reveal (Companion friendly)
            if ((pathname === '/api/trivia/question/reveal' || pathname === '/api/trivia/reveal') && (req.method === 'POST' || req.method === 'GET')) {
                const result = triviaService.revealAnswer();
                sendJson(res, result);
                return true;
            }

            // POST or GET /api/trivia/question/next (Companion friendly)
            if ((pathname === '/api/trivia/question/next' || pathname === '/api/trivia/next') && (req.method === 'POST' || req.method === 'GET')) {
                const result = triviaService.nextQuestion();
                sendJson(res, result);
                return true;
            }

            // POST or GET /api/trivia/question/prev (Companion friendly)
            if ((pathname === '/api/trivia/question/prev' || pathname === '/api/trivia/prev') && (req.method === 'POST' || req.method === 'GET')) {
                const result = triviaService.previousQuestion();
                sendJson(res, result);
                return true;
            }

            if (pathname === '/api/trivia/question/clear' && (req.method === 'POST' || req.method === 'GET')) {
                sendJson(res, triviaService.clearQuestion());
                return true;
            }

            // POST or GET /api/trivia/reset (Companion friendly)
            if (pathname === '/api/trivia/reset' && (req.method === 'POST' || req.method === 'GET')) {
                const result = triviaService.resetTrivia();
                sendJson(res, result);
                return true;
            }

            // POST /api/trivia/vote - Manual or API vote casting
            if (pathname === '/api/trivia/vote' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                let choiceIdx = body.choiceIndex ?? body.index;
                if (choiceIdx === undefined && body.choice !== undefined) {
                    const c = String(body.choice).toLowerCase().trim();
                    if (/^[a-f]$/.test(c)) choiceIdx = c.charCodeAt(0) - 97;
                    else if (/^[1-6]$/.test(c)) choiceIdx = parseInt(c, 10) - 1;
                    else if (c === 'true' || c === 't' || c === 'false') {
                        const answer = c === 't' ? 'true' : c;
                        const choices = triviaService.getPublicState().activeQuestion?.choices || [];
                        choiceIdx = choices.findIndex(choice => choice.text.trim().toLowerCase() === answer);
                    }
                }
                const accepted = triviaService.castVote({
                    user: body.user || 'api_user',
                    userId: body.userId || body.user || 'api_user',
                    choiceIndex: Number(choiceIdx),
                    isSub: Boolean(body.isSub)
                });
                sendJson(res, { success: accepted });
                return true;
            }

            // POST /api/trivia/question - Add new question
            if (pathname === '/api/trivia/question' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const created = triviaService.addQuestion(body);
                sendJson(res, created, 201);
                return true;
            }

            // PUT /api/trivia/question/:id - Update question
            if (pathname.startsWith('/api/trivia/question/') && req.method === 'PUT') {
                const questionId = decodeURIComponent(pathname.slice('/api/trivia/question/'.length));
                const raw = await readRequestBody(req);
                const updates = raw ? JSON.parse(raw) : {};
                const updated = triviaService.updateQuestion(questionId, updates);
                sendJson(res, updated);
                return true;
            }

            // DELETE /api/trivia/question/:id - Delete question
            if (pathname.startsWith('/api/trivia/question/') && req.method === 'DELETE') {
                const questionId = decodeURIComponent(pathname.slice('/api/trivia/question/'.length));
                const success = triviaService.deleteQuestion(questionId);
                sendJson(res, { success });
                return true;
            }

            // POST or GET /api/trivia/question/toggle-done (Companion friendly)
            if (pathname === '/api/trivia/question/toggle-done' && (req.method === 'POST' || req.method === 'GET')) {
                let id = url.searchParams.get('id');
                let doneVal = null;
                if (!id && req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    const body = raw ? JSON.parse(raw) : {};
                    id = body.id || body.questionId;
                    if (body.done !== undefined) doneVal = Boolean(body.done);
                }
                if (!id) {
                    const pub = triviaService.getPublicState();
                    id = pub.activeQuestion ? pub.activeQuestion.id : (pub.questions[pub.currentIndex] || {}).id;
                }
                if (!id) {
                    sendJson(res, { error: 'No question id specified' }, 400);
                    return true;
                }
                const result = triviaService.toggleQuestionDone(id, doneVal);
                sendJson(res, { success: true, ...result });
                return true;
            }

            // POST /api/trivia/question/:id/toggle-done - Toggle played/done state
            if (pathname.startsWith('/api/trivia/question/') && pathname.endsWith('/toggle-done') && req.method === 'POST') {
                const questionId = decodeURIComponent(pathname.slice('/api/trivia/question/'.length, -'/toggle-done'.length));
                const result = triviaService.toggleQuestionDone(questionId);
                sendJson(res, { success: true, ...result });
                return true;
            }

            // POST /api/trivia/question/:id/done - Set played/done state explicitly
            if (pathname.startsWith('/api/trivia/question/') && pathname.endsWith('/done') && req.method === 'POST') {
                const questionId = decodeURIComponent(pathname.slice('/api/trivia/question/'.length, -'/done'.length));
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const isDone = body.done !== undefined ? Boolean(body.done) : true;
                const result = triviaService.setQuestionDone(questionId, isDone);
                sendJson(res, { success: true, ...result });
                return true;
            }

            // POST /api/trivia/question/:id/move - Move question up (-1) or down (1)
            if (pathname.startsWith('/api/trivia/question/') && pathname.endsWith('/move') && req.method === 'POST') {
                const questionId = decodeURIComponent(pathname.slice('/api/trivia/question/'.length, -'/move'.length));
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const direction = Number(body.direction || (body.up ? -1 : 1)) || 1;
                const reordered = triviaService.moveQuestion(questionId, direction);
                sendJson(res, { success: true, count: reordered.length });
                return true;
            }

            // POST or GET /api/trivia/questions/shuffle (Companion friendly)
            if ((pathname === '/api/trivia/questions/shuffle' || pathname === '/api/trivia/shuffle') && (req.method === 'POST' || req.method === 'GET')) {
                const shuffled = triviaService.shuffleQuestions();
                sendJson(res, { success: true, count: shuffled.length });
                return true;
            }

            // POST or GET /api/trivia/questions/reset-done (Companion friendly)
            if ((pathname === '/api/trivia/questions/reset-done' || pathname === '/api/trivia/reset-done') && (req.method === 'POST' || req.method === 'GET')) {
                triviaService.resetDoneQuestions();
                sendJson(res, { success: true });
                return true;
            }

            // POST /api/trivia/questions/reorder - Reorder questions
            if (pathname === '/api/trivia/questions/reorder' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const ids = Array.isArray(body) ? body : (body.ids || []);
                const reordered = triviaService.reorderQuestions(ids);
                sendJson(res, { success: true, count: reordered.length });
                return true;
            }

            // GET /api/trivia/export or /api/trivia/questions/export - Export question bank (JSON or CSV)
            if ((pathname === '/api/trivia/export' || pathname === '/api/trivia/questions/export') && req.method === 'GET') {
                const format = String(url.searchParams.get('format') || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
                if (format === 'csv') {
                    const csv = triviaService.exportQuestions({ format: 'csv' });
                    res.writeHead(200, {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': 'attachment; filename="trivia-questions.csv"'
                    });
                    res.end(csv);
                    return true;
                }
                const payload = triviaService.exportQuestions({ format: 'json' });
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="trivia-questions.json"'
                });
                res.end(JSON.stringify(payload, null, 2));
                return true;
            }

            // POST /api/trivia/import or /api/trivia/questions/import - Import question bank (JSON or CSV)
            if ((pathname === '/api/trivia/import' || pathname === '/api/trivia/questions/import') && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const contentType = String(req.headers['content-type'] || '').toLowerCase();
                let replace = url.searchParams.get('replace') === 'true' || url.searchParams.get('replace') === '1';
                let importInput;

                if (contentType.includes('text/csv')) {
                    importInput = raw;
                } else {
                    const trimmed = String(raw || '').trim();
                    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        const body = JSON.parse(trimmed || '{}');
                        if (body && typeof body === 'object' && !Array.isArray(body) && body.replace !== undefined) {
                            replace = Boolean(body.replace);
                        }
                        importInput = typeof body?.csv === 'string'
                            ? body.csv
                            : (Array.isArray(body) ? body : (body.questions || []));
                    } else {
                        importInput = raw;
                    }
                }

                const imported = triviaService.importQuestions(importInput, { replace });
                sendJson(res, { success: true, count: imported.length }, 201);
                return true;
            }

            // POST /api/trivia/questions/clear - Clear question bank
            if (pathname === '/api/trivia/questions/clear' && req.method === 'POST') {
                triviaService.clearQuestions();
                sendJson(res, { success: true, count: 0 });
                return true;
            }

            // GET /api/trivia/presets - List presets
            if (pathname === '/api/trivia/presets' && req.method === 'GET') {
                const state = triviaService.getPublicState({ includeAnswers: false });
                sendJson(res, state.presets);
                return true;
            }

            // POST /api/trivia/presets/save - Save preset
            if (pathname === '/api/trivia/presets/save' && req.method === 'POST') {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const preset = triviaService.savePreset(body.name, body.description);
                sendJson(res, preset, 201);
                return true;
            }

            // POST or GET /api/trivia/presets/:id/load or /api/trivia/preset/load?id=... (Companion friendly)
            if ((pathname.startsWith('/api/trivia/presets/') && pathname.endsWith('/load')) && (req.method === 'POST' || req.method === 'GET')) {
                const presetId = pathname.slice('/api/trivia/presets/'.length, -'/load'.length);
                if (presetId) {
                    const state = triviaService.loadPreset(presetId);
                    sendJson(res, state);
                    return true;
                }
            }

            if ((pathname === '/api/trivia/preset/load' || pathname === '/api/trivia/presets/load') && (req.method === 'POST' || req.method === 'GET')) {
                let presetId = url.searchParams.get('id') || url.searchParams.get('presetId');
                if (!presetId && req.method === 'POST') {
                    const raw = await readRequestBody(req);
                    const body = raw ? JSON.parse(raw) : {};
                    presetId = body.id || body.presetId;
                }
                if (!presetId) {
                    sendError(res, 'Missing preset id', 400);
                    return true;
                }
                const state = triviaService.loadPreset(presetId);
                sendJson(res, state);
                return true;
            }

            // DELETE /api/trivia/presets/:id - Delete preset
            if (pathname.startsWith('/api/trivia/presets/') && req.method === 'DELETE') {
                const presetId = pathname.slice('/api/trivia/presets/'.length);
                const success = triviaService.deletePreset(presetId);
                sendJson(res, { success });
                return true;
            }

            // POST /api/trivia/presets/reset - Reset to built-in presets
            if (pathname === '/api/trivia/presets/reset' && req.method === 'POST') {
                const presets = triviaService.resetPresets();
                sendJson(res, presets);
                return true;
            }

            return false;
        } catch (err) {
            sendError(res, err.message, 400);
            return true;
        }
    };
}

module.exports = {
    createTriviaRoutes
};
