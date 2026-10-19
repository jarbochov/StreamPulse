const fs = require('fs');
const path = require('path');
const {
    buildDateRange,
    normalizeChatSearchFilters,
    filterChatMessages,
    buildChatPdfHtml,
    parseNumericAmount
} = require('../services/ssn');
const { getSessionStreamTimes, getSessionCategorySegments } = require('../services/session');
const { sendJson, sendText, sendError } = require('./helpers');

function createSessionRoutes({
    sessionService,
    ssnService,
    getChatData = () => ({}),
    getStatsData = () => ({}),
    setStatsData = () => {},
    getViewerSummary = () => ({}),
    buildGoalsSnapshot = () => ({}),
    broadcastToOverlays = () => {},
    resetChatData = () => {},
    saveChatData = () => {},
    saveStats = () => {},
    saveChatLog = () => {},
    bannedHashtags = new Set(),
    saveBannedHashtags = () => {},
    sessionsDir = '',
    generatePdf = () => Promise.reject(new Error('PDF generation not available'))
}) {
    return async function handleSessionRoutes(req, res, url, pathname) {
        // --- 1. Viewers ---
        if (pathname === '/api/viewers' && req.method === 'GET') {
            const summary = getViewerSummary();
            const includeSamples = url.searchParams.get('samples') !== 'false';
            sendJson(res, includeSamples ? summary : { ...summary, samples: undefined });
            return true;
        }

        // --- 2. Session control ---
        if (pathname === '/api/reset') {
            resetChatData();
            const chatData = getChatData();
            broadcastToOverlays('update', chatData);
            broadcastToOverlays('viewer-update', getViewerSummary());
            broadcastToOverlays('goals-update', buildGoalsSnapshot());
            sendJson(res, { status: 'reset', message: 'Chat data cleared' });
            console.log('[API] Chat data reset');
            return true;
        }

        if (pathname === '/api/end-session') {
            const { archiveName, streamEndedAt } = sessionService.endSessionNow();
            if (sessionService.lifecycle.liveStreak > 0) sessionService.lifecycle.suppressed = true;
            sessionService.lifecycle.liveId = null;
            sessionService.lifecycle.lastLiveAt = 0;
            sendJson(res, { status: 'ended', archived: archiveName, streamEndedAt, message: 'Session archived and reset. Server still running.' });
            console.log('[API] Session ended — ready for next stream');
            return true;
        }

        if (pathname === '/api/start-session') {
            sessionService.startSessionNow();
            sessionService.lifecycle.suppressed = false;
            sendJson(res, { status: 'started', startedAt: getChatData().startedAt, message: 'New session started.' });
            console.log('[API] New session started');
            return true;
        }

        // --- 3. Stats & Analytics ---
        if (pathname === '/api/stats') {
            const chatData = getChatData();
            const isSession = url.searchParams.get('scope') === 'session' || url.searchParams.get('session') === '1' || url.searchParams.get('session') === 'true' || url.searchParams.get('range') === 'session';
            if (isSession) {
                const sessionHashtags = {};
                for (const [tag, entry] of Object.entries(chatData.hashtags || {})) {
                    sessionHashtags[tag] = { count: entry.count || 0, firstUsed: entry.firstUsed, lastUsed: entry.lastUsed };
                }
                const sessionChatters = {};
                for (const [user, entry] of Object.entries(chatData.chatters || {})) {
                    sessionChatters[user] = { chatname: entry.chatname || user, count: entry.messageCount || 0, chatimg: entry.chatimg || '' };
                }
                const sessionEmotes = {};
                for (const [emote, entry] of Object.entries(chatData.emotes || {})) {
                    sessionEmotes[emote] = { count: typeof entry === 'number' ? entry : (entry.count || 0) };
                }
                sendJson(res, {
                    hashtags: sessionHashtags,
                    chatters: sessionChatters,
                    emotes: sessionEmotes,
                    sessionActive: true,
                    startedAt: chatData.startedAt
                });
                return true;
            }
            sendJson(res, {
                ...getStatsData(),
                sessionHashtags: chatData.hashtags || {},
                sessionChatters: chatData.chatters || {},
                sessionEmotes: chatData.emotes || {}
            });
            return true;
        }

        if (pathname === '/api/stats/reset') {
            setStatsData({
                totalMessages: {}, chatters: {}, emotes: {}, hashtags: {},
                subscribers: {}, followers: {}, giftSubs: {}, bits: {},
                donations: {}, raids: {},
                createdAt: new Date().toISOString()
            });
            saveStats();
            sendJson(res, { status: 'reset', message: 'Stats data cleared' });
            console.log('[API] Stats data reset');
            return true;
        }

        if (pathname === '/api/hashtags/stats' && req.method === 'GET') {
            const range = buildDateRange(url.searchParams);
            const stats = ssnService.collectHashtagStats(range);
            sendJson(res, {
                ...stats,
                range
            });
            return true;
        }

        if (pathname === '/api/analytics' && req.method === 'GET') {
            const range = buildDateRange(url.searchParams);
            const sessions = [];
            const chatData = getChatData();
            if (chatData.startedAt && (!range || chatData.startedAt.slice(0, 10) >= range.from && chatData.startedAt.slice(0, 10) <= range.to)) {
                sessions.push({ file: '__current__', ...chatData });
            }
            if (fs.existsSync(sessionsDir)) {
                for (const file of fs.readdirSync(sessionsDir).filter(f => f.startsWith('chat-') && f.endsWith('.json'))) {
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                        const date = String(data.startedAt || file).slice(0, 10);
                        if (!range || (date >= range.from && date <= range.to)) sessions.push({ file, ...data });
                    } catch {}
                }
            }
            const uniqueChatters = new Set();
            const rows = sessions.map(data => {
                Object.keys(data.chatters || {}).forEach(name => uniqueChatters.add(name.trim().toLowerCase()));
                const viewers = data.viewerStats || {};
                const isCurrent = data.file === '__current__';
                let streamTimes = getSessionStreamTimes(data);
                if (!streamTimes.streamStopAt && streamTimes.streamStartAt) {
                    const chatEntries = isCurrent
                        ? ssnService.getCurrentChatLogEntries()
                        : ssnService.readChatLogFile(path.join(sessionsDir, data.file.replace('chat-', 'chatlog-').replace('.json', '.jsonl')));
                    streamTimes = getSessionStreamTimes(data, chatEntries);
                }
                const categories = getSessionCategorySegments(data, streamTimes.streamStartAt, streamTimes.streamStopAt, isCurrent);
                const streamStartMs = streamTimes.streamStartAt ? Date.parse(streamTimes.streamStartAt) : NaN;
                const streamStopMs = streamTimes.streamStopAt ? Date.parse(streamTimes.streamStopAt) : NaN;
                const durationMinutes = Number.isFinite(streamStartMs) && Number.isFinite(streamStopMs) && streamStopMs > streamStartMs
                    ? Math.round((streamStopMs - streamStartMs) / 60000)
                    : null;
                return {
                    file: data.file,
                    date: data.startedAt || null,
                    streamStartAt: streamTimes.streamStartAt,
                    streamStopAt: streamTimes.streamStopAt,
                    durationMinutes,
                    title: data.streamInfo?.[0]?.title || '',
                    categories,
                    categorySummary: categories.map(entry => `${entry.category} (${entry.durationMinutes ?? 'in progress'} min)`).join(' | '),
                    messages: data.messageCount || 0,
                    chatters: Object.keys(data.chatters || {}).length,
                    uniqueChatters: Object.keys(data.chatters || {}).length,
                    chatterNames: Object.keys(data.chatters || {}).sort().join(' | '),
                    emotes: Object.keys(data.emotes || {}).length,
                    hashtags: Object.keys(data.hashtags || {}).length,
                    subscribers: (data.subscribers || []).length,
                    followers: (data.followers || []).length,
                    giftSubs: (data.giftSubs || []).reduce((sum, item) => sum + Math.max(1, Number(item.count) || 1), 0),
                    bits: (data.bits || []).reduce((sum, item) => sum + (Number(item.bits) || parseNumericAmount(item.amount)), 0),
                    donations: (data.donations || []).reduce((sum, item) => sum + parseNumericAmount(item.amountValue ?? item.amount), 0),
                    raids: (data.raids || []).length,
                    currentViewers: viewers.current || 0,
                    peakViewers: viewers.peak || 0,
                    averageViewers: viewers.average || 0
                };
            }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const totals = rows.reduce((sum, row) => {
                for (const key of Object.keys(sum)) sum[key] += Number(row[key]) || 0;
                return sum;
            }, { messages: 0, chatters: 0, uniqueChatters: 0, emotes: 0, hashtags: 0, subscribers: 0, followers: 0, giftSubs: 0, bits: 0, donations: 0, raids: 0, peakViewers: 0, averageViewers: 0, durationMinutes: 0 });
            totals.peakViewers = rows.reduce((max, row) => Math.max(max, Number(row.peakViewers) || 0), 0);
            totals.averageViewers = rows.length
                ? Number((rows.reduce((sum, row) => sum + (Number(row.averageViewers) || 0), 0) / rows.length).toFixed(1))
                : 0;
            totals.uniqueChatters = uniqueChatters.size;
            totals.streamedSessions = rows.filter(row => row.durationMinutes !== null).length;
            sendJson(res, { range, sessions: rows, totals });
            return true;
        }

        if (pathname === '/api/milestones' && req.method === 'GET') {
            sendJson(res, sessionService.computeMilestones());
            return true;
        }

        // --- 4. Hashtags moderation ---
        if (pathname === '/api/hashtags/banned') {
            const chatData = getChatData();
            const statsData = getStatsData();
            if (req.method === 'GET') {
                const sessionHashtags = Object.entries(chatData.hashtags || {})
                    .map(([tag, d]) => ({ tag, count: d.count || 0, source: 'session' }))
                    .sort((a, b) => b.count - a.count);
                const statsHashtags = Object.entries(statsData.hashtags || {})
                    .map(([tag, d]) => {
                        const total = d.days ? Object.values(d.days).reduce((s, c) => s + c, 0) : 0;
                        return { tag, count: total, source: 'stats' };
                    })
                    .sort((a, b) => b.count - a.count);
                sendJson(res, { banned: [...bannedHashtags], session: sessionHashtags, stats: statsHashtags });
                return true;
            }

            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const { tag } = JSON.parse(body);
                        if (!tag) throw new Error('Missing tag');
                        const normalized = tag.toLowerCase().startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;

                        bannedHashtags.add(normalized);
                        saveBannedHashtags();

                        if (chatData.hashtags) delete chatData.hashtags[normalized];
                        saveChatData();

                        if (statsData.hashtags) delete statsData.hashtags[normalized];
                        saveStats();

                        broadcastToOverlays('update', chatData);
                        console.log(`[Moderation] Banned hashtag: ${normalized}`);
                        sendJson(res, { status: 'banned', tag: normalized });
                    } catch (err) {
                        sendError(res, err, 400);
                    }
                });
                return true;
            }

            if (req.method === 'DELETE') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const { tag } = JSON.parse(body);
                        if (!tag) throw new Error('Missing tag');
                        const normalized = tag.toLowerCase().startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;

                        bannedHashtags.delete(normalized);
                        saveBannedHashtags();

                        console.log(`[Moderation] Unbanned hashtag: ${normalized}`);
                        sendJson(res, { status: 'unbanned', tag: normalized });
                    } catch (err) {
                        sendError(res, err, 400);
                    }
                });
                return true;
            }
        }

        if (pathname === '/api/hashtags' && req.method === 'DELETE') {
            const queryTag = url.searchParams.get('tag');
            const processDelete = (rawTag) => {
                if (!rawTag) {
                    sendError(res, 'Missing tag', 400);
                    return;
                }
                const normalized = rawTag.toLowerCase().startsWith('#') ? rawTag.toLowerCase() : `#${rawTag.toLowerCase()}`;
                const chatData = getChatData();
                const statsData = getStatsData();
                let modified = false;

                if (chatData?.hashtags && chatData.hashtags[normalized]) {
                    delete chatData.hashtags[normalized];
                    saveChatData();
                    modified = true;
                }

                if (statsData?.hashtags && statsData.hashtags[normalized]) {
                    delete statsData.hashtags[normalized];
                    saveStats();
                    modified = true;
                }

                if (bannedHashtags.has(normalized)) {
                    bannedHashtags.delete(normalized);
                    saveBannedHashtags();
                    modified = true;
                }

                if (modified) {
                    broadcastToOverlays('update', chatData);
                }

                console.log(`[Hashtags] Deleted hashtag: ${normalized}`);
                sendJson(res, { status: 'deleted', tag: normalized });
            };

            if (queryTag) {
                processDelete(queryTag);
                return true;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    processDelete(parsed.tag);
                } catch (err) {
                    sendError(res, err, 400);
                }
            });
            return true;
        }

        // --- 5. Sessions ---
        if (pathname === '/api/sessions') {
            if (req.method === 'DELETE') {
                const sessionName = new URL(req.url, 'http://localhost').searchParams.get('session') || '';
                if (!/^chat-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/.test(sessionName)) {
                    sendError(res, 'Invalid archived session name', 400);
                    return true;
                }
                const sessionFile = path.join(sessionsDir, sessionName);
                const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                const logFile = path.join(sessionsDir, logName);
                try {
                    if (!fs.existsSync(sessionFile)) {
                        sendError(res, 'Session not found', 404);
                        return true;
                    }
                    fs.unlinkSync(sessionFile);
                    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
                    sessionService.invalidateArchives(sessionName);
                    console.log(`[Session] Deleted archived session: ${sessionName}`);
                    sendJson(res, { status: 'deleted', session: sessionName });
                } catch (err) {
                    sendError(res, `Could not delete session: ${err.message}`, 500);
                }
                return true;
            }
            try {
                if (!fs.existsSync(sessionsDir)) {
                    sendJson(res, []);
                    return true;
                }
                const files = fs.readdirSync(sessionsDir)
                    .filter(f => f.startsWith('chat-') && f.endsWith('.json'))
                    .sort()
                    .reverse();

                const params = new URL(req.url, 'http://localhost').searchParams;
                if (params.get('detail') === '1') {
                    const detailed = files.map(f => {
                        const entry = { file: f };
                        try {
                            const raw = fs.readFileSync(path.join(sessionsDir, f), 'utf8');
                            const d = JSON.parse(raw);
                            let streamTimes = getSessionStreamTimes(d);
                            if (!streamTimes.streamStopAt && streamTimes.streamStartAt) {
                                const logName = f.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                                streamTimes = getSessionStreamTimes(d, ssnService.readChatLogFile(path.join(sessionsDir, logName)));
                            }
                            if (d.streamInfo && d.streamInfo.length > 0) {
                                entry.title = d.streamInfo[0].title;
                                entry.category = d.streamInfo[0].category;
                            }
                            entry.streamStartAt = streamTimes.streamStartAt;
                            entry.streamStopAt = streamTimes.streamStopAt;
                            entry.messageCount = d.messageCount || 0;
                        } catch {}
                        return entry;
                    });
                    sendJson(res, detailed);
                } else {
                    sendJson(res, files);
                }
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        const chatLogMatch = pathname.match(/^\/api\/sessions\/(.+\.json)\/chat-log$/);
        if (chatLogMatch) {
            const sessionName = chatLogMatch[1];
            const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const logFile = path.join(sessionsDir, logName);
            if (!logFile.startsWith(sessionsDir)) {
                sendError(res, 'Forbidden', 403);
                return true;
            }
            const messages = ssnService.readChatLogFile(logFile);
            sendJson(res, { session: sessionName, count: messages.length, messages });
            return true;
        }

        const timelineMatch = pathname.match(/^\/api\/sessions\/(.+\.json)\/timeline$/);
        if (timelineMatch && req.method === 'GET') {
            const sessionName = timelineMatch[1];
            const isCurrent = sessionName === '__current__.json';
            const sessionFile = path.join(sessionsDir, sessionName);
            if (!isCurrent && (!sessionFile.startsWith(sessionsDir) || !fs.existsSync(sessionFile))) {
                sendError(res, 'Session not found', 404);
                return true;
            }
            try {
                const data = isCurrent ? getChatData() : JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                const logEntries = isCurrent ? ssnService.getCurrentChatLogEntries() : ssnService.readChatLogFile(path.join(sessionsDir, logName));
                const events = logEntries
                    .filter(entry => entry.event || entry.donation)
                    .map(entry => ({
                        ts: entry.ts,
                        type: entry.event || 'donation',
                        user: entry.user,
                        message: entry.message,
                        detail: entry.donation || null
                    }));
                for (const info of data.streamInfo || []) {
                    events.push({ ts: new Date(info.changedAt).getTime(), type: 'stream-info', message: info.title, detail: info.category || null });
                }
                events.sort((a, b) => a.ts - b.ts);
                const stamps = logEntries.map(e => e.ts).filter(Number.isFinite);
                const bucketMs = 5 * 60 * 1000;
                const buckets = {};
                for (const ts of stamps) {
                    const key = Math.floor(ts / bucketMs) * bucketMs;
                    buckets[key] = (buckets[key] || 0) + 1;
                }
                const chat = Object.keys(buckets).map(Number).sort((a, b) => a - b).map(ts => ({ ts, count: buckets[ts] }));
                const startTs = stamps.length ? Math.min(...stamps) : null;
                const endTs = stamps.length ? Math.max(...stamps) : null;
                sendJson(res, { session: sessionName, events, chat, chatBucketMs: bucketMs, messageCount: stamps.length, startTs, endTs });
            } catch (err) {
                sendError(res, err, 500);
            }
            return true;
        }

        const sessionMatch = pathname.match(/^\/api\/sessions\/(.+\.json)$/);
        if (sessionMatch) {
            const sessionName = sessionMatch[1];
            const sessionFile = path.join(sessionsDir, sessionName);
            if (!sessionFile.startsWith(sessionsDir) || !fs.existsSync(sessionFile)) {
                sendError(res, 'Session not found', 404);
                return true;
            }
            const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            const logName = sessionName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
            const streamTimes = getSessionStreamTimes(data, ssnService.readChatLogFile(path.join(sessionsDir, logName)));
            if (streamTimes.streamStopAt && !data.viewerStats?.streamEndedAt) {
                data.viewerStats = {
                    ...(data.viewerStats || {}),
                    streamEndedAt: streamTimes.streamStopAt
                };
            }
            sendJson(res, data);
            return true;
        }

        // --- 6. Export ---
        if (pathname === '/api/export') {
            const params = new URL(req.url, `http://localhost`).searchParams;
            const type = params.get('type') || 'all';
            const days = parseInt(params.get('days'), 10) || 0;
            const date = params.get('date') || '';
            const from = params.get('from') || '';
            const to = params.get('to') || '';

            let range = null;
            if (date) {
                range = { from: date, to: date };
            } else if (from || to) {
                range = { from: from || '1970-01-01', to: to || '9999-12-31' };
            } else if (days) {
                const fromDate = new Date(Date.now() - days * 86400000);
                range = { from: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`, to: '9999-12-31' };
            }

            function sumBuckets(dMap, r) {
                if (!dMap) return 0;
                let total = 0;
                for (const [d, count] of Object.entries(dMap)) {
                    if (!r || (d >= r.from && d <= r.to)) total += count;
                }
                return total;
            }

            let csv = '';
            const types = type === 'all' ? ['chatters', 'emotes', 'hashtags', 'subscribers', 'followers', 'bits', 'donations', 'raids'] : [type];
            const statsData = getStatsData();

            for (const t of types) {
                const data = statsData[t];
                if (!data || typeof data !== 'object') continue;

                if (t === 'chatters') {
                    csv += 'type,name,count,first_seen,last_seen\n';
                    Object.entries(data).forEach(([name, d]) => {
                        const count = sumBuckets(d.days, range);
                        if (count > 0) csv += `chatter,"${name}",${count},${d.firstSeen || ''},${d.lastSeen || ''}\n`;
                    });
                } else if (t === 'emotes') {
                    csv += 'type,name,count,first_used,last_used\n';
                    Object.entries(data).forEach(([name, d]) => {
                        const count = sumBuckets(d.days, range);
                        if (count > 0) csv += `emote,"${name}",${count},${d.firstUsed || ''},${d.lastUsed || ''}\n`;
                    });
                } else if (t === 'hashtags') {
                    csv += 'type,name,count,first_used,last_used\n';
                    Object.entries(data).forEach(([tag, d]) => {
                        const count = sumBuckets(d.days, range);
                        if (count > 0) csv += `hashtag,"${tag}",${count},${d.firstUsed || ''},${d.lastUsed || ''}\n`;
                    });
                } else if (t === 'bits') {
                    csv += 'type,name,amount,first_seen,last_seen\n';
                    Object.entries(data).forEach(([name, d]) => {
                        const amount = sumBuckets(d.days, range);
                        if (amount > 0) csv += `bits,"${name}",${amount},${d.firstSeen || ''},${d.lastSeen || ''}\n`;
                    });
                } else {
                    csv += `type,name,count,first_seen,last_seen\n`;
                    Object.entries(data).forEach(([name, d]) => {
                        const count = sumBuckets(d.days, range);
                        if (count > 0) csv += `${t},"${name}",${count},${d.firstSeen || ''},${d.lastSeen || ''}\n`;
                    });
                }
                csv += '\n';
            }

            const filename = `stats-export-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            res.end(csv);
            return true;
        }

        // --- 7. Chat and Chat Log ---
        if (pathname === '/api/chat') {
            sendJson(res, getChatData());
            return true;
        }

        if (pathname === '/api/chat-log') {
            const messages = ssnService.getCurrentChatLogEntries();
            sendJson(res, { session: 'current', count: messages.length, messages });
            return true;
        }

        if (pathname === '/api/chat-log/search') {
            const params = new URL(req.url, `http://localhost`).searchParams;
            const session = params.get('session') || 'all';
            const filters = normalizeChatSearchFilters({
                q: params.get('q') || '',
                user: params.get('user') || '',
                type: params.get('type') || ''
            });
            const limit = parseInt(params.get('limit'), 10) || 200;
            const offset = parseInt(params.get('offset'), 10) || 0;

            const allResults = [];
            function searchMessages(messages, sessionName) {
                return filterChatMessages(messages, filters, sessionName);
            }

            if (session === 'all' || session === 'current') {
                allResults.push(...searchMessages(ssnService.getCurrentChatLogEntries(), 'current'));
            }

            if (session === 'all') {
                if (fs.existsSync(sessionsDir)) {
                    const logFiles = fs.readdirSync(sessionsDir)
                        .filter(f => f.startsWith('chatlog-') && f.endsWith('.jsonl'))
                        .sort()
                        .reverse();
                    for (const logFile of logFiles) {
                        const messages = ssnService.readChatLogFile(path.join(sessionsDir, logFile));
                        const sessionName = logFile.replace('chatlog-', 'chat-').replace('.jsonl', '.json');
                        allResults.push(...searchMessages(messages, sessionName));
                    }
                }
            } else if (session !== 'current') {
                const logName = session.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                const logFile = path.join(sessionsDir, logName);
                if (logFile.startsWith(sessionsDir) && fs.existsSync(logFile)) {
                    const messages = ssnService.readChatLogFile(logFile);
                    allResults.push(...searchMessages(messages, session));
                }
            }

            allResults.sort((a, b) => b.ts - a.ts);
            const total = allResults.length;
            const paged = allResults.slice(offset, offset + limit);
            sendJson(res, { total, offset, limit, count: paged.length, results: paged });
            return true;
        }

        if (pathname === '/api/chat-log/export') {
            const params = new URL(req.url, `http://localhost`).searchParams;
            const format = params.get('format') || 'tsv';
            const session = params.get('session') || 'current';
            const filters = normalizeChatSearchFilters({
                q: params.get('q') || '',
                user: params.get('user') || '',
                type: params.get('type') || ''
            });

            let messages = [];
            let sessionLabel = session;
            let streamInfo = [];
            const addSessionMessages = (entries, sourceSession) => {
                messages.push(...entries.map(entry => ({ ...entry, session: sourceSession })));
            };

            const chatData = getChatData();
            if (session === 'all') {
                addSessionMessages(ssnService.getCurrentChatLogEntries(), 'current');
                sessionLabel = 'all-sessions';
                streamInfo = chatData.streamInfo || [];
                if (fs.existsSync(sessionsDir)) {
                    const logFiles = fs.readdirSync(sessionsDir)
                        .filter(f => f.startsWith('chatlog-') && f.endsWith('.jsonl'))
                        .sort();
                    for (const logFile of logFiles) {
                        const sourceSession = logFile.replace('chatlog-', 'chat-').replace('.jsonl', '.json');
                        addSessionMessages(ssnService.readChatLogFile(path.join(sessionsDir, logFile)), sourceSession);
                    }
                }
            } else if (session === 'current') {
                addSessionMessages(ssnService.getCurrentChatLogEntries(), 'current');
                sessionLabel = 'current-session';
                streamInfo = chatData.streamInfo || [];
            } else {
                const logName = session.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                const logFile = path.join(sessionsDir, logName);
                if (logFile.startsWith(sessionsDir) && fs.existsSync(logFile)) {
                    addSessionMessages(ssnService.readChatLogFile(logFile), session);
                }
                const sessionFile = path.join(sessionsDir, session);
                if (sessionFile.startsWith(sessionsDir) && fs.existsSync(sessionFile)) {
                    try {
                        const sData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                        streamInfo = sData.streamInfo || [];
                    } catch {}
                }
            }

            messages = filterChatMessages(messages, filters);

            const formatTime = (ts) => {
                if (!ts) return '';
                const d = new Date(ts);
                return d.toLocaleString();
            };

            let friendlyLabel = sessionLabel;
            const dateMatch = sessionLabel.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
            if (dateMatch) {
                const d = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:00`);
                friendlyLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    + ' - ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ');
            }
            const cleanFilename = `chatlog-${friendlyLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

            let streamInfoText = '';
            if (streamInfo && streamInfo.length > 0) {
                streamInfoText = streamInfo.map(si => {
                    const parts = [];
                    if (si.title) parts.push(`"${si.title}"`);
                    if (si.category) parts.push(`Category: ${si.category}`);
                    if (si.changedAt) parts.push(`at ${new Date(si.changedAt).toLocaleTimeString()}`);
                    return parts.join(' — ');
                }).join('\n');
            }

            if (format === 'tsv') {
                const lines = messages.map(m => {
                    let msg = (m.message || '').replace(/[\t\r\n]/g, ' ');
                    const replyMatch = msg.match(/^(.+?):\s\s@(\S+)\s(.+)$/s);
                    if (replyMatch) {
                        msg = `↩ ${replyMatch[1].substring(0, 80)} | ${replyMatch[3]}`;
                    }
                    return `${formatTime(m.ts)}\t${m.user}\t${msg}\t${m.event || ''}\t${m.donation || ''}\t${m.membership || ''}`;
                });
                const header = `Chat Log — ${friendlyLabel}\n${'='.repeat(40)}`;
                const infoBlock = streamInfoText ? `\n${streamInfoText}\n` : '';
                const content = `${header}${infoBlock}\n${messages.length} messages\n\nTimestamp\tUser\tMessage\tEvent\tDonation\tMembership\n` + lines.join('\n');
                res.writeHead(200, {
                    'Content-Type': 'text/tab-separated-values',
                    'Content-Disposition': `attachment; filename="${cleanFilename}.tsv"`
                });
                res.end(content);
                return true;
            }

            if (format === 'txt') {
                const lines = messages.map(m => {
                    let msg = m.message || '';
                    const replyMatch = msg.match(/^(.+?):\s\s@(\S+)\s(.+)$/s);
                    if (replyMatch) {
                        msg = `↩ ${replyMatch[1].substring(0, 80)} | ${replyMatch[3]}`;
                    }
                    let line = `[${formatTime(m.ts)}] ${m.user}: ${msg}`;
                    if (m.event) line += ` [${m.event}]`;
                    if (m.donation) line += ` [${m.donation}]`;
                    return line;
                });
                const header = `Chat Log — ${friendlyLabel}\n${'='.repeat(40)}`;
                const infoBlock = streamInfoText ? `\n${streamInfoText}\n` : '';
                const content = `${header}${infoBlock}\n${messages.length} messages\n\n` + lines.join('\n');
                res.writeHead(200, {
                    'Content-Type': 'text/plain',
                    'Content-Disposition': `attachment; filename="${cleanFilename}.txt"`
                });
                res.end(content);
                return true;
            }

            if (format === 'pdf') {
                try {
                    const subtitle = streamInfoText
                        ? streamInfoText.replace(/\n/g, ' • ') + ` — ${messages.length} messages`
                        : `${messages.length} messages`;
                    const htmlContent = buildChatPdfHtml(`Chat Log — ${friendlyLabel}`, subtitle, messages);
                    const pdfBuffer = await generatePdf(htmlContent);
                    res.writeHead(200, {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="${cleanFilename}.pdf"`,
                        'Content-Length': pdfBuffer.length
                    });
                    res.end(pdfBuffer);
                } catch (err) {
                    console.error('[PDF] Export failed:', err.message);
                    sendError(res, 'PDF generation failed: ' + err.message, 500);
                }
                return true;
            }

            sendError(res, 'Invalid format. Use: tsv, txt, or pdf', 400);
            return true;
        }

        return false;
    };
}

module.exports = {
    createSessionRoutes
};
