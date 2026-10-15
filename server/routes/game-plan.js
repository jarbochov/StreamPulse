const fs = require('fs');
const path = require('path');
const { readRequestBody, sendJson, sendError } = require('./helpers');

function createGamePlanRoutes({
    gamePlanService,
    getTwitchClientId = () => '',
    getAppToken = () => Promise.resolve(''),
    getChatData = () => ({}),
    refreshGameInfo = () => Promise.resolve(null),
    publicGameInfo = () => ({}),
    gameInfoCache = {},
    infoKey = (name) => String(name || '').toLowerCase(),
    sessionsDir = ''
}) {
    return async function handleGamePlanRoutes(req, res, pathname) {
        if (pathname === '/api/game-plan/backfill' && req.method === 'POST') {
            try {
                const result = await gamePlanService.backfillPlayedGames();
                sendJson(res, result);
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        if (pathname === '/api/game-plan/now' && req.method === 'POST') {
            try {
                const body = JSON.parse(await readRequestBody(req) || '{}');
                const snapshot = gamePlanService.setPlayingNow(body.id);
                sendJson(res, snapshot);
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/game-plan/advance' && req.method === 'POST') {
            try {
                const result = gamePlanService.advance();
                sendJson(res, result);
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        if (pathname === '/api/game-plan') {
            if (req.method === 'PUT') {
                try {
                    const payload = JSON.parse(await readRequestBody(req) || '{}');
                    gamePlanService.updateGamePlan(payload);
                } catch (err) {
                    sendError(res, err, 400);
                    return true;
                }
            }
            sendJson(res, gamePlanService.buildGamePlanSnapshot());
            return true;
        }

        if (pathname === '/api/game-search') {
            const query = (new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0, 100);
            const clientId = getTwitchClientId();
            if (query.length < 2 || !clientId) {
                sendJson(res, { results: [] });
                return true;
            }
            try {
                const token = await getAppToken();
                const body = `search "${query.replace(/["\\]/g, '')}"; fields name,first_release_date,cover.image_id,platforms.abbreviation,category,version_parent; limit 12;`;
                const igdb = await fetch('https://api.igdb.com/v4/games', {
                    method: 'POST',
                    headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
                    body
                });
                const data = await igdb.json();
                const results = (Array.isArray(data) ? data : []).filter(game => !game.version_parent).map(game => ({
                    id: String(game.id),
                    name: game.name || '',
                    year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : '',
                    platforms: (game.platforms || []).map(platform => platform.abbreviation).filter(Boolean).slice(0, 4),
                    cover: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_small/${game.cover.image_id}.jpg` : ''
                }));
                sendJson(res, { results });
            } catch (err) {
                sendJson(res, { results: [], error: err.message });
            }
            return true;
        }

        if (pathname === '/api/game') {
            const chatData = getChatData();
            const name = new URL(req.url, 'http://localhost').searchParams.get('name')
                || chatData.streamInfo?.[chatData.streamInfo.length - 1]?.category || '';
            await refreshGameInfo(name);
            sendJson(res, publicGameInfo(name));
            return true;
        }

        if (pathname === '/api/categories') {
            try {
                const params = new URL(req.url, 'http://localhost').searchParams;
                const from = params.get('from') || '';
                const to = params.get('to') || '';

                const allSessions = [];
                const chatData = getChatData();

                // Current session
                if (chatData.streamInfo && chatData.streamInfo.length > 0) {
                    allSessions.push({
                        file: '__current__',
                        startedAt: chatData.startedAt,
                        endedAt: null,
                        streamInfo: chatData.streamInfo,
                        messageCount: chatData.messageCount
                    });
                }

                // Archived sessions
                if (fs.existsSync(sessionsDir)) {
                    const files = fs.readdirSync(sessionsDir)
                        .filter(f => f.startsWith('chat-') && f.endsWith('.json'))
                        .sort();
                    for (const file of files) {
                        try {
                            const d = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                            if (d.streamInfo && d.streamInfo.length > 0) {
                                allSessions.push({
                                    file,
                                    startedAt: d.startedAt,
                                    endedAt: d.lastUpdated || d.startedAt,
                                    streamInfo: d.streamInfo,
                                    messageCount: d.messageCount || 0
                                });
                            }
                        } catch {}
                    }
                }

                // Aggregate: category → { totalMinutes, sessions: [{ date, title, category, minutes }] }
                const categories = {};
                for (const sess of allSessions) {
                    const sessDate = (sess.startedAt || '').substring(0, 10);
                    if (from && sessDate < from) continue;
                    if (to && sessDate > to) continue;

                    const info = sess.streamInfo;
                    const sessionEnd = sess.endedAt ? new Date(sess.endedAt) : new Date();

                    for (let i = 0; i < info.length; i++) {
                        const entry = info[i];
                        const cat = entry.category || '(No Category)';
                        const start = new Date(entry.changedAt);
                        const end = i + 1 < info.length ? new Date(info[i + 1].changedAt) : sessionEnd;
                        const minutes = Math.max(0, (end - start) / 60000);

                        if (!categories[cat]) categories[cat] = { totalMinutes: 0, sessions: [] };
                        categories[cat].totalMinutes += minutes;
                        categories[cat].sessions.push({
                            date: sessDate,
                            file: sess.file,
                            changedAt: entry.changedAt,
                            title: entry.title,
                            minutes: Math.round(minutes)
                        });
                    }
                }

                // Sort by total time descending
                const sorted = Object.entries(categories)
                    .map(([name, data]) => ({ name, totalMinutes: Math.round(data.totalMinutes), sessions: data.sessions }))
                    .sort((a, b) => b.totalMinutes - a.totalMinutes);

                // Cover art and details come from the cached IGDB lookup; unseen names are queued in the background.
                const real = sorted.filter(c => c.name !== '(No Category)');
                if (typeof gamePlanService.warmGameInfo === 'function') {
                    gamePlanService.warmGameInfo(real.map(c => ({ name: c.name, igdbId: '' })));
                }
                let pending = 0;
                for (const c of real) {
                    const g = publicGameInfo(c.name);
                    c.cover = g.cover || '';
                    c.genres = (g.genres || []).slice(0, 3);
                    c.releaseYear = g.releaseYear || '';
                    c.releaseDate = g.releaseDate || '';
                    c.igdbUrl = g.igdbUrl || '';
                    c.developers = (g.developers || []).slice(0, 2);
                    if (!g.cover && !gameInfoCache[infoKey(c.name)]) pending++;
                }

                sendJson(res, sorted, 200, { 'X-Covers-Pending': String(pending) });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        return false;
    };
}

module.exports = {
    createGamePlanRoutes
};
