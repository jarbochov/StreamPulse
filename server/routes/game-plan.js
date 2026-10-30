const fs = require('fs');
const path = require('path');
const { readRequestBody, sendJson, sendError, parseJsonOrQuery } = require('./helpers');

function createGamePlanRoutes({
    gamePlanService,
    twitchService = null,
    getTwitchClientId = () => '',
    getAppToken = () => Promise.resolve(''),
    getChatData = () => ({}),
    refreshGameInfo = () => Promise.resolve(null),
    publicGameInfo = () => ({}),
    gameInfoCache = {},
    infoKey = (name) => String(name || '').toLowerCase(),
    sessionsDir = ''
}) {
    return async function handleGamePlanRoutes(req, res, pathname, url) {
        const urlObj = url || new URL(req.url, 'http://localhost');
        if (pathname === '/api/game-plan/backfill' && req.method === 'POST') {
            try {
                const result = await gamePlanService.backfillPlayedGames();
                sendJson(res, result);
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        function resolveTwitchCategoryName(item) {
            const raw = String(item?.twitchCategory || '').trim();
            if (raw === '__none__' || raw.toLowerCase() === 'none') return '';
            if (raw) return raw;
            if (item?.custom) return 'Just Chatting';
            return item?.name || '';
        }

        if (pathname === '/api/game-plan/now' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                const body = await parseJsonOrQuery(req, urlObj);
                const targetId = (body.clear === true || body.clear === 'true' || body.clear === '1') ? '' : (body.id || '');
                const snapshot = gamePlanService.setPlayingNow(targetId);
                let twitchResult = null;
                if (targetId && twitchService && typeof twitchService.updateChannelCategory === 'function') {
                    const plan = gamePlanService.loadGamePlan();
                    const item = plan.items.find(i => i.id === targetId);
                    if (item) {
                        const catName = resolveTwitchCategoryName(item);
                        if (catName) {
                            twitchResult = await twitchService.updateChannelCategory(catName);
                        } else {
                            twitchResult = { ok: true, skipped: true, categoryName: '' };
                        }
                    }
                }
                sendJson(res, { ...snapshot, twitchResult });
            } catch (err) {
                sendError(res, err, 400);
            }
            return true;
        }

        if (pathname === '/api/game-plan/advance' && (req.method === 'POST' || req.method === 'GET')) {
            try {
                const result = gamePlanService.advance();
                let twitchResult = null;
                if (result.current && twitchService && typeof twitchService.updateChannelCategory === 'function') {
                    const plan = gamePlanService.loadGamePlan();
                    const nextId = result.snapshot?.playingNowId;
                    const nextItem = nextId ? plan.items.find(i => i.id === nextId) : null;
                    if (nextItem) {
                        const catName = resolveTwitchCategoryName(nextItem);
                        if (catName) {
                            twitchResult = await twitchService.updateChannelCategory(catName);
                        } else {
                            twitchResult = { ok: true, skipped: true, categoryName: '' };
                        }
                    }
                }
                sendJson(res, { ...result, twitchResult });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        if (pathname === '/api/game-plan/twitch-schedule') {
            if (!twitchService) {
                sendJson(res, { ok: false, error: 'Twitch service not configured' }, 503);
                return true;
            }
            if (req.method === 'POST') {
                try {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    const itemId = String(body.itemId || '').trim();
                    if (!itemId) {
                        sendJson(res, { ok: false, error: 'itemId is required' }, 400);
                        return true;
                    }
                    const plan = gamePlanService.loadGamePlan();
                    const item = plan.items.find(i => i.id === itemId);
                    if (!item) {
                        sendJson(res, { ok: false, error: 'Game item not found' }, 404);
                        return true;
                    }

                    // Apply inline updates from dialog if provided so save+sync is atomic
                    if (body.streamDate !== undefined) item.streamDate = String(body.streamDate || '').trim();
                    if (body.streamTime !== undefined) item.streamTime = String(body.streamTime || '').trim();
                    if (body.streamDuration !== undefined) item.streamDuration = Math.min(1380, Math.max(30, Number(body.streamDuration) || 180));
                    if (body.streamRecurring !== undefined) item.streamRecurring = Boolean(body.streamRecurring);
                    if (Array.isArray(body.streamDates)) item.streamDates = body.streamDates;
                    if (body.twitchCategory !== undefined) item.twitchCategory = String(body.twitchCategory || '').trim();
                    if (item.status === 'backlog' || item.status === 'up-next') item.status = 'scheduled';

                    if (!item.streamDate && (!Array.isArray(item.streamDates) || !item.streamDates.length)) {
                        sendJson(res, { ok: false, error: 'Choose at least one stream date first' }, 400);
                        return true;
                    }

                    // Look up Twitch category ID if available
                    let categoryId = '';
                    const catName = resolveTwitchCategoryName(item);
                    if (catName && typeof twitchService.getGameCategoryByName === 'function') {
                        const cat = await twitchService.getGameCategoryByName(catName);
                        if (cat?.id) categoryId = cat.id;
                    }

                    // Delete existing segments before re-syncing so we don't create duplicate segments on Twitch
                    const existingIds = new Set([...(item.twitchSegmentIds || []), item.twitchSegmentId].filter(Boolean));
                    for (const segId of existingIds) {
                        try {
                            await twitchService.deleteScheduleSegment(segId);
                        } catch { /* ignore cleanup error */ }
                    }

                    const durationMinutes = Math.min(1380, Math.max(30, Number(body.durationMinutes || item.streamDuration) || 180));
                    const title = String(body.title || item.name || 'Stream').slice(0, 140);
                    const isRecurring = body.isRecurring !== undefined ? Boolean(body.isRecurring) : (item.streamRecurring === true);

                    // Collect all date slots to schedule
                    const slots = [];
                    if (item.streamDate) {
                        slots.push({ date: item.streamDate, time: item.streamTime || '19:00' });
                    }
                    if (Array.isArray(item.streamDates)) {
                        for (const d of item.streamDates) {
                            const dateStr = typeof d === 'string' ? d : d.date;
                            const timeStr = typeof d === 'string' ? '' : d.time;
                            if (dateStr && !slots.some(s => s.date === dateStr && s.time === (timeStr || item.streamTime || '19:00'))) {
                                slots.push({ date: dateStr, time: timeStr || item.streamTime || '19:00' });
                            }
                        }
                    }

                    const createdSegments = [];
                    const failedSlots = [];

                    for (const slot of slots) {
                        const timePart = slot.time || '19:00';
                        const localIso = `${slot.date}T${timePart}:00`;
                        const dateObj = new Date(localIso);
                        const startTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${slot.date}T19:00:00Z`;

                        const scheduleResult = await twitchService.createScheduleSegment({
                            startTime,
                            durationMinutes,
                            title,
                            categoryId,
                            isRecurring
                        });

                        if (scheduleResult.ok && scheduleResult.segment) {
                            createdSegments.push(scheduleResult.segment);
                        } else {
                            failedSlots.push({ slot, error: scheduleResult.error });
                        }
                    }

                    if (!createdSegments.length) {
                        const firstErr = failedSlots[0]?.error || 'Failed to schedule any segments on Twitch';
                        sendJson(res, { ok: false, error: firstErr, failedSlots }, 400);
                        return true;
                    }

                    item.twitchSegmentId = createdSegments[0]?.id || '';
                    item.twitchSegmentIds = createdSegments.map(s => s.id);
                    if (Array.isArray(item.streamDates)) {
                        item.streamDates.forEach((d, idx) => {
                            if (createdSegments[idx + 1]) {
                                d.segmentId = createdSegments[idx + 1].id;
                            }
                        });
                    }
                    gamePlanService.saveGamePlan(plan);
                    const snapshot = gamePlanService.buildGamePlanSnapshot();
                    sendJson(res, {
                        ok: true,
                        segment: createdSegments[0],
                        segments: createdSegments,
                        item,
                        snapshot,
                        partial: failedSlots.length > 0,
                        failedSlots
                    });
                } catch (err) {
                    sendError(res, err, 500);
                }
                return true;
            }

            if (req.method === 'DELETE') {
                try {
                    const body = JSON.parse(await readRequestBody(req) || '{}');
                    const itemId = String(body.itemId || '').trim();
                    if (!itemId) {
                        sendJson(res, { ok: false, error: 'itemId is required' }, 400);
                        return true;
                    }
                    const plan = gamePlanService.loadGamePlan();
                    const item = plan.items.find(i => i.id === itemId);
                    if (!item) {
                        sendJson(res, { ok: false, error: 'Game item not found' }, 404);
                        return true;
                    }
                    const existingIds = new Set([...(item.twitchSegmentIds || []), item.twitchSegmentId].filter(Boolean));
                    for (const segId of existingIds) {
                        await twitchService.deleteScheduleSegment(segId);
                    }
                    item.twitchSegmentId = '';
                    item.twitchSegmentIds = [];
                    if (Array.isArray(item.streamDates)) {
                        item.streamDates.forEach(d => { d.segmentId = ''; });
                    }
                    gamePlanService.saveGamePlan(plan);
                    const snapshot = gamePlanService.buildGamePlanSnapshot();
                    sendJson(res, { ok: true, snapshot });
                } catch (err) {
                    sendError(res, err, 500);
                }
                return true;
            }
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

        if (pathname === '/api/twitch-categories') {
            const query = (new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0, 100);
            const BUILTIN_CATS = [
                'Just Chatting',
                'Retro',
                'Games + Demos',
                'Special Events',
                'Art',
                'Music',
                'Talk Shows & Podcasts',
                'Makers & Crafting',
                'Science & Technology'
            ];
            if (query.length < 2) {
                sendJson(res, { results: BUILTIN_CATS.map(name => ({ name, boxArt: '' })) });
                return true;
            }
            try {
                if (twitchService && typeof twitchService.twitchHelixRequest === 'function') {
                    const search = await twitchService.twitchHelixRequest('/search/categories', {
                        method: 'GET',
                        params: { query, first: 10 }
                    });
                    if (search.status >= 200 && search.status < 300 && Array.isArray(search.body?.data)) {
                        const results = search.body.data.map(cat => ({
                            id: String(cat.id || ''),
                            name: cat.name || '',
                            boxArt: (cat.box_art_url || '').replace('52x72', '90x120').replace('{width}x{height}', '90x120')
                        })).filter(c => c.name);
                        sendJson(res, { results });
                        return true;
                    }
                }
                const lower = query.toLowerCase();
                const matched = BUILTIN_CATS.filter(name => name.toLowerCase().includes(lower)).map(name => ({ name, boxArt: '' }));
                sendJson(res, { results: matched });
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
