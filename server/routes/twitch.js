const fs = require('fs');
const path = require('path');
const { safeReturnPath } = require('../services/twitch');
const { readRequestBody, sendJson, sendText, sendError, escapeHtml } = require('./helpers');

function createTwitchRoutes({
    twitchService,
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
            sendJson(res, { status: 'ok', poll: twitchService.getLatestPoll() });
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
            takeoverPages('poll-end', testPoll.title, 15000);
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
