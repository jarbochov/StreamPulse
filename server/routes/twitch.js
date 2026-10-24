const fs = require('fs');
const path = require('path');
const { safeReturnPath } = require('../services/twitch');
const { readRequestBody, sendJson, sendText, sendError, escapeHtml } = require('./helpers');

function createTwitchRoutes({
    twitchService,
    pollService = null,
    matchupService = null,
    getTwitchClientId = () => '',
    getTwitchClientSecret = () => '',
    getBroadcasterId = () => '',
    getTwitchRedirectUri = () => '',
    getTwitchScopes = () => '',
    ensureToken = () => Promise.resolve(null),
    startDeviceAuth = () => Promise.reject(new Error('Not implemented')),
    pollDeviceAuth = () => Promise.reject(new Error('Not implemented')),
    clearToken = () => {},
    saveToken = () => {},
    twitchTokenRequest = () => Promise.reject(new Error('Not implemented')),
    fetchTwitchData = () => Promise.resolve({}),
    fetchStreamInfo = () => {},
    fetchViewerCount = () => {},
    fetchTwitchPoll = () => {},
    takeoverPages = () => {},
    broadcastToOverlays = () => {},
    getClipCandidates = () => [],
    setClipCandidates = () => {},
    resolveCandidateVodUrls = (c) => Promise.resolve(c),
    addClipCandidate = () => null,
    normalizeClipCandidateConfig = (c) => c,
    getConfig = () => ({}),
    configPath = '',
    safeWriteFileSync = () => {},
    applyRuntimeConfig = () => {},
    backfillClipCandidates = () => ({}),
    isSessionActive = () => false,
    getChatData = () => ({}),
    twitchCreateClip = () => Promise.reject(new Error('Not implemented')),
    getTwitchAuthenticatedUserId = () => Promise.resolve(null),
    twitchCreateClipFromVod = () => Promise.reject(new Error('Not implemented')),
    saveClipCandidates = () => {},
    dataDir = '',
    getStatsData = () => ({}),
    readJsonFileSafe = () => null,
    subHistoryPath = '',
    followerHistoryPath = ''
}) {
    return async function handleTwitchRoutes(req, res, url, pathname) {
        // --- 1. Auth endpoints ---
        if (pathname === '/api/twitch/auth/status' && req.method === 'GET') {
            await ensureToken();
            sendJson(res, {
                connected: !!twitchService.getAccessToken(),
                mode: getTwitchClientSecret() ? 'own_app' : 'shared_device',
                clientId: getTwitchClientId(),
                broadcasterConfigured: !!getBroadcasterId(),
                broadcasterSaved: twitchService.isBroadcasterSynced(),
                scopes: twitchService.getTokenScopes()
            });
            return true;
        }

        if (pathname === '/api/twitch/auth/device/start' && req.method === 'POST') {
            try {
                const d = await startDeviceAuth();
                sendJson(res, { userCode: d.userCode, verificationUri: d.verificationUri, interval: d.interval, expiresAt: d.expiresAt });
            } catch (err) {
                sendError(res, err, 502);
            }
            return true;
        }

        if (pathname === '/api/twitch/auth/device/poll' && req.method === 'GET') {
            try {
                const d = await pollDeviceAuth();
                sendJson(res, { status: d.status, error: d.error || '', interval: d.interval, broadcasterSaved: twitchService.isBroadcasterSynced() });
            } catch (err) {
                sendJson(res, { status: 'pending', error: err.message });
            }
            return true;
        }

        if (pathname === '/api/twitch/auth/disconnect' && req.method === 'POST') {
            clearToken();
            sendJson(res, { ok: true });
            return true;
        }

        if (pathname === '/auth/twitch') {
            if (!getTwitchClientSecret()) {
                res.writeHead(302, { Location: '/twitch-connect.html' });
                res.end();
                return true;
            }
            const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
                `client_id=${getTwitchClientId()}` +
                `&redirect_uri=${encodeURIComponent(getTwitchRedirectUri())}` +
                `&response_type=code` +
                `&scope=${encodeURIComponent(getTwitchScopes())}` +
                `&force_verify=true` +
                `&state=${encodeURIComponent(safeReturnPath(url.searchParams.get('return')))}`;
            res.writeHead(302, { Location: authUrl });
            res.end();
            return true;
        }

        if (pathname === '/auth/callback') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            if (error) {
                sendText(res, `<h1>Authorization denied</h1><p>${escapeHtml(error)}</p><p><a href="/auth/twitch">Try again</a></p>`, 200, 'text/html; charset=utf-8');
                return true;
            }

            if (code) {
                try {
                    const tokenData = await twitchTokenRequest({
                        client_id: getTwitchClientId(),
                        client_secret: getTwitchClientSecret(),
                        code: code,
                        grant_type: 'authorization_code',
                        redirect_uri: getTwitchRedirectUri()
                    });
                    saveToken(tokenData);
                    console.log('[Twitch] User authorized! Token saved.');
                    const returnTo = safeReturnPath(url.searchParams.get('state'));
                    res.writeHead(302, { Location: returnTo === '/' ? '/clips.html?reauthorized=1' : returnTo });
                    res.end();
                    fetchTwitchData();
                    fetchStreamInfo();
                    fetchViewerCount();
                    fetchTwitchPoll();
                } catch (err) {
                    console.error('[Twitch] Auth callback error:', err.message);
                    sendText(res, `<h1>Authorization failed</h1><p>${escapeHtml(err.message)}</p><p><a href="/auth/twitch">Try again</a></p>`, 500, 'text/html; charset=utf-8');
                }
                return true;
            }

            sendText(res, '<h1>Missing authorization code</h1><p><a href="/auth/twitch">Try again</a></p>', 400, 'text/html; charset=utf-8');
            return true;
        }

        // --- 2. Data fetch ---
        if (pathname === '/api/fetch' || pathname === '/api/twitch/fetch-data') {
            const result = await fetchTwitchData();
            fetchStreamInfo();
            fetchViewerCount();
            fetchTwitchPoll();
            sendJson(res, { status: result?.error ? 'error' : 'ok', ...result });
            return true;
        }

        // --- 3. Polls ---
        if (pathname === '/api/polls/latest' && req.method === 'GET') {
            const poll = pollService ? pollService.getLatestPoll() : twitchService.getLatestPoll();
            sendJson(res, { status: 'ok', poll });
            return true;
        }

        if (pathname === '/api/polls/active' && req.method === 'GET') {
            const poll = pollService ? pollService.getActivePoll() : null;
            sendJson(res, { status: 'ok', poll });
            return true;
        }

        if (pathname === '/api/polls/history' && req.method === 'GET') {
            const history = pollService ? pollService.getHistory() : [];
            sendJson(res, { status: 'ok', history });
            return true;
        }

        if (pathname === '/api/polls/history' && req.method === 'DELETE') {
            if (pollService) pollService.clearHistory();
            sendJson(res, { status: 'ok', cleared: true });
            return true;
        }

        if (pathname === '/api/polls/create' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const poll = pollService.createPoll(body);
                sendJson(res, { status: 'ok', poll });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/polls/end' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const poll = pollService.finishPoll('COMPLETED');
            sendJson(res, { status: 'ok', poll });
            return true;
        }

        if (pathname === '/api/polls/cancel' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const poll = pollService.cancelPoll();
            sendJson(res, { status: 'ok', poll });
            return true;
        }

        if (pathname === '/api/polls/extend' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const poll = pollService.extendPoll(body?.seconds || 30);
                sendJson(res, { status: 'ok', poll });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/polls/vote' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const voted = pollService.castVote(body);
                sendJson(res, { status: 'ok', voted });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        // --- Saved Poll Presets / Templates ---
        if (pathname === '/api/polls/presets' && req.method === 'GET') {
            const presets = pollService ? pollService.getPresets() : [];
            sendJson(res, { status: 'ok', presets });
            return true;
        }

        if (pathname === '/api/polls/presets' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const preset = pollService.savePreset(body);
                sendJson(res, { status: 'ok', preset });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        const mPresetDelete = pathname.match(/^\/api\/polls\/presets\/([^/]+)$/);
        if (mPresetDelete && req.method === 'DELETE') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const id = decodeURIComponent(mPresetDelete[1]);
            const result = pollService.deletePreset(id);
            sendJson(res, { status: 'ok', ...result });
            return true;
        }

        // --- Tournament Bracket Endpoints ---
        if (pathname === '/api/tournament' && req.method === 'GET') {
            const tournament = pollService ? pollService.getTournament() : null;
            sendJson(res, { status: 'ok', tournament });
            return true;
        }

        if (pathname === '/api/tournament/create' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const tournament = pollService.createTournament(body);
                sendJson(res, { status: 'ok', tournament });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/start-match' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const result = pollService.startTournamentMatch(body.matchId);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/advance' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const tournament = pollService.advanceTournamentMatch(body.matchId, body.winner);
                sendJson(res, { status: 'ok', tournament });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/score' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const result = pollService.updateMatchScore(body.matchId, body);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/select-match' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const result = pollService.selectActiveMatch(body.matchId);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/reset-match' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const result = pollService.resetMatch(body.matchId);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/rollback' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const result = pollService.rollbackTournamentMatch(body.matchId);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/drafts' && req.method === 'GET') {
            const drafts = pollService ? pollService.getTournamentDrafts() : [];
            sendJson(res, { status: 'ok', drafts });
            return true;
        }

        if (pathname === '/api/tournament/drafts/save' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const item = pollService.saveTournamentDraft(body.name);
                sendJson(res, { status: 'ok', draft: item, drafts: pollService.getTournamentDrafts() });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/drafts/restore' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const result = pollService.restoreTournamentDraft(body.id);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname.startsWith('/api/tournament/drafts/') && req.method === 'DELETE') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const id = decodeURIComponent(pathname.replace('/api/tournament/drafts/', ''));
            const result = pollService.deleteTournamentDraft(id);
            sendJson(res, { status: 'ok', ...result, drafts: pollService.getTournamentDrafts() });
            return true;
        }

        if (pathname === '/api/tournament/settings' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const tournament = pollService.updateTournamentSettings(body);
                sendJson(res, { status: 'ok', tournament });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/tournament/reset' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const result = pollService.resetTournament();
            sendJson(res, { status: 'ok', ...result });
            return true;
        }

        if (pathname === '/api/tournament/history' && req.method === 'GET') {
            const history = pollService ? pollService.getTournamentHistory() : [];
            sendJson(res, { status: 'ok', history });
            return true;
        }

        if (pathname === '/api/tournament/history/restore' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const tournament = pollService.restoreTournament(body.id);
                sendJson(res, { status: 'ok', tournament });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname.startsWith('/api/tournament/history/') && req.method === 'DELETE') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const id = decodeURIComponent(pathname.replace('/api/tournament/history/', ''));
            const result = pollService.deleteTournamentHistory(id);
            sendJson(res, { status: 'ok', ...result, history: pollService.getTournamentHistory() });
            return true;
        }

        if (pathname === '/api/tournament/history/clear' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const result = pollService.clearTournamentHistory();
            sendJson(res, { status: 'ok', ...result, history: [] });
            return true;
        }

        if (pathname === '/api/tournament/presets' && req.method === 'GET') {
            const presets = pollService ? pollService.getTournamentPresets() : [];
            sendJson(res, { status: 'ok', presets });
            return true;
        }

        if (pathname === '/api/tournament/presets' && req.method === 'POST') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const item = pollService.saveTournamentPreset(body);
                sendJson(res, { status: 'ok', preset: item, presets: pollService.getTournamentPresets() });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname.startsWith('/api/tournament/presets/') && req.method === 'DELETE') {
            if (!pollService) {
                sendError(res, 501, 'Native polls not available');
                return true;
            }
            const id = decodeURIComponent(pathname.replace('/api/tournament/presets/', ''));
            const result = pollService.deleteTournamentPreset(id);
            sendJson(res, { status: 'ok', ...result, presets: pollService.getTournamentPresets() });
            return true;
        }

        // --- Matchup Scoreboard & Versus Endpoints ---
        if (pathname === '/api/matchup' && req.method === 'GET') {
            const matchup = matchupService ? matchupService.getMatchup() : null;
            sendJson(res, { status: 'ok', matchup });
            return true;
        }

        if (pathname === '/api/matchup' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const matchup = matchupService.updateMatchup(body);
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/score' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const target = body.competitorId !== undefined ? body.competitorId : (body.index !== undefined ? body.index : body.id);
                const result = matchupService.updateScore(target, body);
                sendJson(res, { status: 'ok', ...result });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/swap' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const matchup = matchupService.swapSides();
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/reset-scores' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const matchup = matchupService.resetScores();
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/reset' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const matchup = matchupService.resetMatchup();
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        // Match Clock & Stopwatch Endpoints
        if (pathname === '/api/matchup/clock/start' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            const clock = matchupService.startClock();
            sendJson(res, { status: 'ok', clock, matchup: matchupService.getMatchup() });
            return true;
        }

        if (pathname === '/api/matchup/clock/pause' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            const clock = matchupService.pauseClock();
            sendJson(res, { status: 'ok', clock, matchup: matchupService.getMatchup() });
            return true;
        }

        if (pathname === '/api/matchup/clock/reset' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const clock = matchupService.resetClock(body.seconds !== undefined ? body.seconds : body.duration);
                sendJson(res, { status: 'ok', clock, matchup: matchupService.getMatchup() });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/clock/set' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const clock = matchupService.setClockMode(body);
                sendJson(res, { status: 'ok', clock, matchup: matchupService.getMatchup() });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/queue' && req.method === 'GET') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            const data = matchupService.getQueue();
            sendJson(res, { status: 'ok', ...data });
            return true;
        }

        if (pathname === '/api/matchup/queue' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                if (Array.isArray(body.queue)) {
                    const queue = matchupService.setQueue(body.queue);
                    sendJson(res, { status: 'ok', queue, matchup: matchupService.getMatchup() });
                } else {
                    const queue = matchupService.addToQueue(body);
                    sendJson(res, { status: 'ok', queue, matchup: matchupService.getMatchup() });
                }
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/presets' && req.method === 'GET') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            const presets = matchupService.getPresets();
            sendJson(res, { status: 'ok', presets });
            return true;
        }

        if (pathname === '/api/matchup/presets' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const presets = matchupService.savePreset(body);
                sendJson(res, { status: 'ok', presets });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/presets/load' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const matchup = matchupService.loadPreset(body.id);
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname.startsWith('/api/matchup/presets/') && req.method === 'DELETE') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const id = decodeURIComponent(pathname.replace('/api/matchup/presets/', ''));
                const presets = matchupService.deletePreset(id);
                sendJson(res, { status: 'ok', presets });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/history' && req.method === 'GET') {
            const history = matchupService ? matchupService.getHistory() : [];
            sendJson(res, { status: 'ok', history });
            return true;
        }

        if (pathname === '/api/matchup/history/restore' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const matchup = matchupService.restoreHistoryItem(body.id);
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname.startsWith('/api/matchup/history/') && req.method === 'DELETE') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const id = decodeURIComponent(pathname.replace('/api/matchup/history/', ''));
                const history = matchupService.deleteHistoryItem(id);
                sendJson(res, { status: 'ok', history });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/history/clear' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const history = matchupService.clearHistory();
                sendJson(res, { status: 'ok', history });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/queue/select' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const raw = await readRequestBody(req);
                const body = raw ? JSON.parse(raw) : {};
                const id = body.id !== undefined ? body.id : body.index;
                const matchup = matchupService.selectQueueMatch(id);
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/queue/next' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const matchup = matchupService.nextQueueMatch();
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/matchup/queue/prev' && req.method === 'POST') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const matchup = matchupService.prevQueueMatch();
                sendJson(res, { status: 'ok', matchup });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname.startsWith('/api/matchup/queue/') && req.method === 'DELETE') {
            if (!matchupService) {
                sendError(res, 501, 'Matchup service not available');
                return true;
            }
            try {
                const id = decodeURIComponent(pathname.replace('/api/matchup/queue/', ''));
                const queue = matchupService.deleteQueueMatch(id);
                sendJson(res, { status: 'ok', queue });
            } catch (err) {
                sendError(res, 400, err.message);
            }
            return true;
        }

        if (pathname === '/api/polls/test' && req.method === 'POST') {
            const testPoll = {
                id: `test-${Date.now()}`,
                title: 'Which game should we play next?',
                status: 'COMPLETED',
                winner: 'Elden Ring',
                winningVotes: 142,
                winningPercent: 68,
                totalVotes: 210,
                choices: [
                    { id: '1', title: 'Elden Ring', votes: 142, percent: 68, channel_points_votes: 12, bits_votes: 0 },
                    { id: '2', title: 'Hollow Knight', votes: 45, percent: 21, channel_points_votes: 0, bits_votes: 0 },
                    { id: '3', title: 'Celeste', votes: 23, percent: 11, channel_points_votes: 0, bits_votes: 0 }
                ],
                duration: 300,
                startedAt: new Date(Date.now() - 300000).toISOString(),
                endedAt: new Date().toISOString()
            };
            twitchService.setLatestPoll(testPoll);
            console.log(`[Twitch] Test poll triggered: "${testPoll.title}" — Winner: "${testPoll.winner}"`);
            takeoverPages('poll-end', testPoll.title, 15000, testPoll);
            broadcastToOverlays('poll-update', testPoll);
            sendJson(res, { status: 'ok', poll: testPoll });
            return true;
        }

        // --- 4. Clip candidates ---
        if (pathname === '/api/clip-candidates' && req.method === 'GET') {
            const sessionFilter = url.searchParams.get('session');
            const statusFilter = url.searchParams.get('status');
            let result = getClipCandidates();
            if (sessionFilter) result = result.filter(candidate => candidate.session === sessionFilter);
            if (statusFilter) result = result.filter(candidate => candidate.status === statusFilter);
            result = await resolveCandidateVodUrls(result);
            sendJson(res, result.slice().reverse());
            return true;
        }

        if (pathname === '/api/clip-candidates' && req.method === 'POST') {
            try {
                const payload = JSON.parse(await readRequestBody(req) || '{}');
                const reason = String(payload.reason || 'manual-marker').trim().slice(0, 120);
                const details = typeof payload.details === 'object' && payload.details !== null ? payload.details : {};
                const candidate = addClipCandidate(reason || 'manual-marker', details, Number(payload.timestamp) || Date.now(), Number(payload.score) || 0.9);
                if (!candidate) {
                    sendError(res, 'A matching candidate was already recorded recently or there is no active session.', 409);
                    return true;
                }
                sendJson(res, candidate, 201);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/clip-candidates/config') {
            const config = getConfig();
            if (req.method === 'GET') {
                sendJson(res, normalizeClipCandidateConfig(config.clip_candidates));
                return true;
            }
            if (req.method === 'PUT') {
                try {
                    const payload = JSON.parse(await readRequestBody(req) || '{}');
                    const settings = normalizeClipCandidateConfig(payload);
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    current.clip_candidates = settings;
                    safeWriteFileSync(configPath, JSON.stringify(current, null, 2));
                    applyRuntimeConfig(current);
                    sendJson(res, settings);
                } catch (err) {
                    sendError(res, err, 400);
                }
                return true;
            }
        }

        if (pathname === '/api/clip-candidates/backfill' && req.method === 'POST') {
            try {
                const payload = JSON.parse(await readRequestBody(req) || '{}');
                const result = backfillClipCandidates(payload.rebuild === true);
                sendJson(res, { status: 'analyzed', ...result });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        if (pathname.startsWith('/api/clip-candidates/')) {
            const segments = pathname.slice('/api/clip-candidates/'.length).split('/').filter(Boolean).map(decodeURIComponent);
            const candidateId = segments[0];
            const candidate = getClipCandidates().find(item => item.id === candidateId);
            if (!candidate) {
                sendError(res, 'Clip candidate not found', 404);
                return true;
            }

            if (segments[1] === 'create' && req.method === 'POST') {
                const clientId = getTwitchClientId();
                const broadcasterId = getBroadcasterId();
                if (!clientId || !broadcasterId) {
                    sendError(res, 'Twitch credentials and broadcaster_id are required.', 400);
                    return true;
                }
                if (!(await ensureToken())) {
                    sendError(res, 'Twitch authorization is required. Re-authorize StreamPulse for clip creation.', 401);
                    return true;
                }

                try {
                    const chatData = getChatData();
                    const isLiveCandidate = isSessionActive() && candidate.sessionStartedAt === chatData.startedAt;
                    let vodCandidate = null;
                    if (!isLiveCandidate) {
                        vodCandidate = (await resolveCandidateVodUrls([candidate]))[0];
                        if (!vodCandidate?.vodId) {
                            sendError(res, 'No matching Twitch VOD was found for this candidate.', 409);
                            return true;
                        }
                    }

                    let result;
                    if (isLiveCandidate) {
                        result = await twitchCreateClip();
                    } else {
                        const editorId = await getTwitchAuthenticatedUserId();
                        if (!editorId) {
                            sendError(res, 'Could not identify the authorized Twitch user for VOD clipping. Re-authorize StreamPulse and try again.', 401);
                            return true;
                        }
                        const duration = Math.min(30, Math.max(5, vodCandidate.vodOffsetSeconds || 0));
                        result = await twitchCreateClipFromVod(
                            editorId,
                            vodCandidate.vodId,
                            vodCandidate.vodOffsetSeconds,
                            duration,
                            candidate.reason
                        );
                    }
                    if (result.status !== 202 || !result.body.data?.[0]?.id) {
                        const message = result.body.message || `Twitch clip creation failed (${result.status})`;
                        candidate.status = 'failed';
                        candidate.error = message;
                        saveClipCandidates();
                        sendJson(res, { error: message, twitchStatus: result.status }, result.status === 403 ? 403 : 502);
                        return true;
                    }

                    const clip = result.body.data[0];
                    candidate.status = 'created';
                    candidate.clipId = clip.id;
                    candidate.editUrl = clip.edit_url || null;
                    candidate.viewUrl = `https://clips.twitch.tv/${encodeURIComponent(clip.id)}`;
                    candidate.createdAt = new Date().toISOString();
                    candidate.error = null;
                    saveClipCandidates();
                    console.log(`[Clips Beta] Twitch clip requested: ${clip.id}`);
                    sendJson(res, candidate);
                } catch (err) {
                    candidate.status = 'failed';
                    candidate.error = err.message;
                    saveClipCandidates();
                    sendError(res, err, 502);
                }
                return true;
            }

            if (!segments[1] && req.method === 'DELETE') {
                setClipCandidates(getClipCandidates().filter(item => item.id !== candidateId));
                saveClipCandidates();
                sendJson(res, { status: 'deleted' });
                return true;
            }
        }

        // --- 5. Subscribers, Followers, VIPs, Moderators ---
        if (pathname === '/api/subscribers/current' && req.method === 'GET') {
            const subsPath = path.join(dataDir, 'subs.json');
            const current = readJsonFileSafe(subsPath, { data: [] })?.data || [];
            const statsData = getStatsData();
            const tenure = statsData.subTenure || {};
            const rows = current.map(sub => {
                const name = sub.user_name || sub.user_login || '';
                const history = statsData.subscribers?.[name] || statsData.subscribers?.[sub.user_login] || {};
                const firstSeen = history.firstSeen || null;
                const days = firstSeen ? Math.max(1, Math.floor((Date.now() - new Date(firstSeen).getTime()) / 86400000) + 1) : null;
                const months = (tenure[String(name).toLowerCase()] || tenure[String(sub.user_login || '').toLowerCase()] || {}).months || null;
                return {
                    name, tier: sub.tier || '', plan: sub.plan_name || '', isGift: !!sub.is_gift,
                    gifter: sub.is_gift ? (sub.gifter_name || sub.gifter_login || 'Anonymous') : '',
                    tenureMonths: months, firstSeen, lastSeen: history.lastSeen || null, observedDays: days
                };
            }).filter(row => row.name).sort((a, b) => (b.tenureMonths || 0) - (a.tenureMonths || 0) || (b.observedDays || 0) - (a.observedDays || 0));

            const gifters = {};
            rows.filter(row => row.isGift).forEach(row => { gifters[row.gifter] = (gifters[row.gifter] || 0) + 1; });
            const withTenure = rows.filter(row => row.tenureMonths);
            const summary = {
                total: rows.length,
                unique: new Set(rows.map(row => row.name.toLowerCase())).size,
                tiers: { '1000': rows.filter(r => String(r.tier) === '1000').length, '2000': rows.filter(r => String(r.tier) === '2000').length, '3000': rows.filter(r => String(r.tier) === '3000').length },
                gifted: rows.filter(r => r.isGift).length,
                tenureKnown: withTenure.length,
                averageTenureMonths: withTenure.length ? Math.round(withTenure.reduce((sum, r) => sum + r.tenureMonths, 0) / withTenure.length * 10) / 10 : 0,
                longestTenureMonths: withTenure.length ? Math.max(...withTenure.map(r => r.tenureMonths)) : 0,
                topGifters: Object.entries(gifters).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
            };
            const snapshots = readJsonFileSafe(subHistoryPath, { snapshots: [] })?.snapshots || [];
            let updatedAt = null;
            try { updatedAt = fs.statSync(subsPath).mtime.toISOString(); } catch { /* no subs file yet */ }
            sendJson(res, { updatedAt, summary, history: snapshots, subscribers: rows });
            return true;
        }

        if (pathname === '/api/followers/current' && req.method === 'GET') {
            const file = path.join(dataDir, 'followers.json');
            const rows = (readJsonFileSafe(file, { data: [] })?.data || []).map(f => ({ name: f.user_name || f.user_login || '', followedAt: f.followed_at || null })).filter(r => r.name);
            const snapshots = readJsonFileSafe(followerHistoryPath, { snapshots: [] })?.snapshots || [];
            let updatedAt = null;
            try { updatedAt = fs.statSync(file).mtime.toISOString(); } catch { /* none yet */ }
            sendJson(res, { updatedAt, total: rows.length, history: snapshots, followers: rows });
            return true;
        }

        if (pathname === '/api/vips' && req.method === 'GET') {
            const vipsList = readJsonFileSafe(path.join(dataDir, 'vips.json'), { data: [] })?.data || [];
            sendJson(res, { total: vipsList.length, vips: vipsList });
            return true;
        }

        if (pathname === '/api/moderators' && req.method === 'GET') {
            const modsList = readJsonFileSafe(path.join(dataDir, 'moderators.json'), { data: [] })?.data || [];
            sendJson(res, { total: modsList.length, moderators: modsList });
            return true;
        }

        return false;
    };
}

module.exports = {
    createTwitchRoutes
};
