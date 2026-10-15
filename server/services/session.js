const fs = require('fs');
const path = require('path');

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function normalizeLifecycleConfig(input = {}) {
    return {
        auto: input?.auto !== false,
        end_grace_minutes: clampNumber(input?.end_grace_minutes, 1, 240, 15),
        resume_window_minutes: clampNumber(input?.resume_window_minutes, 0, 1440, 120),
        min_session_minutes: clampNumber(input?.min_session_minutes, 0, 120, 5),
        poll_seconds: clampNumber(input?.poll_seconds, 10, 600, 30)
    };
}

function localDateTimeStr(isoStr) {
    const d = new Date(isoStr || Date.now());
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}-${mi}`;
}

function localDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Minutes spent in each category by one session's stream-info history, plus the local dates it was streamed on.
function categoryTimeFor(streamInfo, endMs, startFloorMs = null) {
    const result = {};
    (streamInfo || []).forEach((entry, i) => {
        let start = Date.parse(entry.changedAt);
        let end = i + 1 < streamInfo.length ? Date.parse(streamInfo[i + 1].changedAt) : endMs;
        const closedAt = Date.parse(entry.endedAt || '');
        if (Number.isFinite(closedAt) && closedAt < end) end = closedAt;
        if (Number.isFinite(startFloorMs) && start < startFloorMs) start = startFloorMs;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
        const name = entry.category || '(No Category)';
        const slot = result[name] || (result[name] = { minutes: 0, dates: new Set() });
        slot.minutes += (end - start) / 60000;
        slot.dates.add(localDateString(new Date(start)));
    });
    return result;
}

function categoryMinutesFor(streamInfo, endMs, startFloorMs = null) {
    return Object.fromEntries(Object.entries(categoryTimeFor(streamInfo, endMs, startFloorMs)).map(([name, slot]) => [name, slot.minutes]));
}

function getSessionStreamTimes(data, chatEntries = []) {
    const samples = Array.isArray(data?.viewerStats?.samples) ? data.viewerStats.samples : [];
    const liveSamples = samples.filter(sample => sample.live && sample.ts);
    const streamStartAt = data?.viewerStats?.streamStartedAt
        || liveSamples[0]?.ts
        || null;
    const startMs = streamStartAt ? Date.parse(streamStartAt) : NaN;
    let wasLive = false;
    const offlineTransitions = [];
    for (const sample of samples) {
        const sampleMs = sample.ts ? Date.parse(sample.ts) : NaN;
        if (sample.live && sample.ts && Number.isFinite(startMs) && sampleMs >= startMs) {
            wasLive = true;
        } else if (sample.live === false && sample.ts && wasLive) {
            if (Number.isFinite(startMs) && Number.isFinite(sampleMs) && sampleMs > startMs) {
                offlineTransitions.push(sample);
            }
            wasLive = false;
        }
    }
    const candidateStopAt = data?.viewerStats?.streamEndedAt
        || (offlineTransitions.length > 0
            ? offlineTransitions[offlineTransitions.length - 1].ts
            : null);
    let stopMs = candidateStopAt ? Date.parse(candidateStopAt) : NaN;
    let streamStopAt = streamStartAt
        && Number.isFinite(startMs)
        && Number.isFinite(stopMs)
        && stopMs > startMs
        ? candidateStopAt
        : null;
    if (!streamStopAt && Number.isFinite(startMs)) {
        const lastChatEntry = [...chatEntries].reverse().find(entry => {
            const timestamp = Number(entry?.ts);
            return Number.isFinite(timestamp) && timestamp > startMs;
        });
        if (lastChatEntry) {
            const lastChatAt = new Date(Number(lastChatEntry.ts)).toISOString();
            stopMs = Date.parse(lastChatAt);
            if (Number.isFinite(stopMs) && stopMs > startMs) {
                streamStopAt = lastChatAt;
            }
        }
    }
    return { streamStartAt, streamStopAt };
}

function getSessionCategorySegments(data, streamStartAt, streamStopAt, isCurrent = false) {
    const entries = Array.isArray(data?.streamInfo)
        ? data.streamInfo
            .filter(entry => entry && entry.changedAt)
            .map(entry => ({
                title: entry.title || '',
                category: entry.category || '(No Category)',
                changedAt: entry.changedAt
            }))
            .sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt))
        : [];
    if (entries.length === 0) return [];

    const startMs = streamStartAt ? Date.parse(streamStartAt) : NaN;
    const endMs = streamStopAt
        ? Date.parse(streamStopAt)
        : (isCurrent ? Date.now() : NaN);
    return entries.map((entry, index) => {
        const rawStartMs = Date.parse(entry.changedAt);
        const segmentStartMs = Number.isFinite(startMs) ? Math.max(rawStartMs, startMs) : rawStartMs;
        const nextMs = index + 1 < entries.length ? Date.parse(entries[index + 1].changedAt) : endMs;
        const segmentEndMs = Number.isFinite(nextMs) ? Math.max(segmentStartMs, nextMs) : null;
        return {
            title: entry.title,
            category: entry.category,
            startAt: new Date(segmentStartMs).toISOString(),
            endAt: segmentEndMs ? new Date(segmentEndMs).toISOString() : null,
            durationMinutes: segmentEndMs ? Math.round((segmentEndMs - segmentStartMs) / 60000) : null
        };
    }).filter(entry => Number.isFinite(Date.parse(entry.startAt)));
}

function createSessionService(options = {}) {
    const {
        dataDir = process.cwd(),
        sessionsDir = path.join(dataDir, 'sessions'),
        liveChatPath = path.join(dataDir, 'chat.json'),
        chatLogPath = path.join(dataDir, 'chat-log.jsonl'),
        lifecyclePath = path.join(dataDir, 'session-lifecycle.json'),
        getConfig = () => ({}),
        getChatData = () => ({}),
        getChatLog = () => [],
        getStatsData = () => ({}),
        getTwitchClientId = () => '',
        getBroadcasterId = () => '',
        ensureTwitchToken = async () => false,
        fetchTwitchStream = async () => null,
        fetchTwitchData = () => {},
        fetchStreamInfo = () => {},
        fetchViewerCount = () => {},
        fetchTwitchPoll = () => {},
        normalizeViewerStats = (v) => v || {},
        getViewerSummary = () => ({}),
        buildGoalsSnapshot = () => ({}),
        broadcastToOverlays = () => {},
        saveChatData = () => {},
        saveStats = () => {},
        saveChatLog = () => {},
        resetChatData = () => {},
        loadCurrentSessionStateFromDisk = () => {},
        recordPlayedGames = async () => {},
        performAutoBackup = () => {},
        isSessionActive: customIsSessionActive = null,
        setSessionActive: customSetSessionActive = null,
        log = console.log,
        warn = console.warn,
        error = console.error
    } = options;

    let lifecycleMemo = { lastArchive: null };
    try {
        lifecycleMemo = { lastArchive: null, ...JSON.parse(fs.readFileSync(lifecyclePath, 'utf8')) };
    } catch { /* first run */ }

    const lifecycle = {
        liveStreak: 0,
        liveId: null,
        lastLiveAt: 0,
        offlineSince: 0,
        suppressed: false,
        timer: null
    };

    let internalSessionActive = false;
    const isSessionActive = typeof customIsSessionActive === 'function' ? customIsSessionActive : () => internalSessionActive;
    const setSessionActive = typeof customSetSessionActive === 'function' ? customSetSessionActive : (val) => { internalSessionActive = !!val; };
    let milestoneCache = { at: 0, data: null };

    function noteArchivedSession(name) {
        lifecycleMemo.lastArchive = { name, endedAt: Date.now() };
        try { fs.writeFileSync(lifecyclePath, JSON.stringify(lifecycleMemo)); } catch { /* non-critical */ }
    }

    function sessionHasData() {
        const chatData = getChatData();
        const chatLog = getChatLog();
        return (chatData?.messageCount || 0) > 0 || (chatLog && chatLog.length > 0);
    }

    function broadcastSessionState() {
        const chatData = getChatData();
        broadcastToOverlays('update', chatData);
        broadcastToOverlays('viewer-update', getViewerSummary());
        broadcastToOverlays('goals-update', buildGoalsSnapshot());
    }

    function finalizeSessionStreamEnd() {
        const chatData = getChatData();
        const chatLog = getChatLog();
        const viewerStats = normalizeViewerStats(chatData?.viewerStats);
        if (!viewerStats.streamStartedAt) {
            if (chatData) chatData.viewerStats = viewerStats;
            return null;
        }

        const startMs = Date.parse(viewerStats.streamStartedAt);
        if (!Number.isFinite(startMs)) {
            if (chatData) chatData.viewerStats = viewerStats;
            return null;
        }
        if (viewerStats.streamEndedAt) {
            const recordedEndMs = Date.parse(viewerStats.streamEndedAt);
            if (Number.isFinite(recordedEndMs) && recordedEndMs > startMs) {
                return viewerStats.streamEndedAt;
            }
            viewerStats.streamEndedAt = null;
        }

        const lastChatEntry = [...(chatLog || [])].reverse().find(entry => {
            const timestamp = Number(entry?.ts);
            return Number.isFinite(timestamp) && timestamp > startMs;
        });
        const lastChatAt = lastChatEntry ? new Date(Number(lastChatEntry.ts)).toISOString() : null;
        const candidateEnd = lastChatAt || new Date().toISOString();
        const candidateMs = Date.parse(candidateEnd);
        if (Number.isFinite(candidateMs) && candidateMs > startMs) {
            viewerStats.streamEndedAt = candidateEnd;
            if (chatData) chatData.viewerStats = viewerStats;
            return candidateEnd;
        }
        if (chatData) chatData.viewerStats = viewerStats;
        return null;
    }

    function archiveSession() {
        try {
            if (fs.existsSync(liveChatPath)) {
                const prevChat = JSON.parse(fs.readFileSync(liveChatPath, 'utf8'));
                if (prevChat.messageCount > 0) {
                    if (!fs.existsSync(sessionsDir)) {
                        fs.mkdirSync(sessionsDir, { recursive: true });
                    }
                    const sessionDateTime = localDateTimeStr(prevChat.startedAt);
                    const archiveName = `chat-${sessionDateTime}.json`;
                    const archivePath = path.join(sessionsDir, archiveName);

                    if (fs.existsSync(archivePath)) {
                        try {
                            const existing = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
                            if (existing.startedAt === prevChat.startedAt) {
                                fs.copyFileSync(liveChatPath, archivePath);
                                log(`[Session] Updated existing archive → data/sessions/${archiveName}`);
                                if (fs.existsSync(chatLogPath)) {
                                    const logArchiveName = archiveName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                                    fs.copyFileSync(chatLogPath, path.join(sessionsDir, logArchiveName));
                                }
                                noteArchivedSession(archiveName);
                                return archiveName;
                            }
                        } catch (_) { /* corrupted file, overwrite */ }
                    }
                    fs.copyFileSync(liveChatPath, archivePath);
                    log(`[Session] Archived → data/sessions/${archiveName}`);

                    if (fs.existsSync(chatLogPath)) {
                        const logArchiveName = archiveName.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                        fs.copyFileSync(chatLogPath, path.join(sessionsDir, logArchiveName));
                        log(`[Session] Chat log archived → data/sessions/${logArchiveName}`);
                    }

                    noteArchivedSession(archiveName);
                    return archiveName;
                }
            }
        } catch (err) {
            warn('[Session] Could not archive:', err.message);
        }
        return null;
    }

    function endSessionNow({ endedAtIso = null, discard = false } = {}) {
        const chatData = getChatData();
        if (endedAtIso && chatData) {
            const stats = normalizeViewerStats(chatData.viewerStats);
            const startMs = Date.parse(stats.streamStartedAt || '');
            if (Number.isFinite(startMs) && Date.parse(endedAtIso) > startMs) {
                stats.streamEndedAt = endedAtIso;
                chatData.viewerStats = stats;
            }
        }
        const streamEndedAt = finalizeSessionStreamEnd();
        const lastInfo = chatData?.streamInfo?.[chatData.streamInfo.length - 1];
        if (lastInfo && streamEndedAt) lastInfo.endedAt = streamEndedAt;
        saveChatData();
        saveStats();
        saveChatLog();
        let archiveName = null;
        if (!discard) {
            recordPlayedGames(
                JSON.parse(JSON.stringify(chatData?.streamInfo || [])),
                Date.parse(streamEndedAt || '') || Date.now(),
                Date.parse(normalizeViewerStats(chatData?.viewerStats).streamStartedAt || '')
            ).catch(err => error('[GamePlan] Auto-add failed:', err.message));
            archiveName = archiveSession();
            performAutoBackup();
        }
        resetChatData();
        setSessionActive(false);
        broadcastSessionState();
        return { archiveName, streamEndedAt };
    }

    function startSessionNow() {
        resetChatData();
        setSessionActive(true);
        broadcastSessionState();
        if (getBroadcasterId()) {
            fetchTwitchData();
            fetchStreamInfo();
            fetchViewerCount();
            fetchTwitchPoll();
        }
    }

    function resumeArchivedSession(name) {
        const src = path.join(sessionsDir, name);
        if (!fs.existsSync(src)) return false;
        fs.copyFileSync(src, liveChatPath);
        const logSrc = path.join(sessionsDir, name.replace('chat-', 'chatlog-').replace('.json', '.jsonl'));
        if (fs.existsSync(logSrc)) fs.copyFileSync(logSrc, chatLogPath);
        else { try { fs.unlinkSync(chatLogPath); } catch { /* none */ } }
        loadCurrentSessionStateFromDisk();
        const chatData = getChatData();
        if (chatData) {
            chatData.viewerStats = normalizeViewerStats({ ...chatData.viewerStats, live: true, streamEndedAt: null });
            const lastInfo = chatData.streamInfo?.[chatData.streamInfo.length - 1];
            if (lastInfo?.endedAt) {
                chatData.streamInfo.push({ title: lastInfo.title, category: lastInfo.category, changedAt: new Date().toISOString() });
            }
        }
        setSessionActive(true);
        broadcastSessionState();
        return true;
    }

    function lifecycleOnLive(stream, cfg) {
        lifecycle.offlineSince = 0;
        lifecycle.lastLiveAt = Date.now();
        lifecycle.liveStreak++;
        if (lifecycle.suppressed || lifecycle.liveStreak < 2 || lifecycle.liveId === stream.id) return;
        lifecycle.liveId = stream.id;

        const windowMs = cfg.resume_window_minutes * 60000;
        const last = lifecycleMemo.lastArchive;
        const recentArchive = last && Date.now() - last.endedAt <= windowMs ? last.name : null;

        if (!sessionHasData()) {
            if (recentArchive && resumeArchivedSession(recentArchive)) {
                log(`[Lifecycle] Live again — resumed ${recentArchive}`);
            } else {
                startSessionNow();
                log('[Lifecycle] Live — started a new session');
            }
            return;
        }

        const chatData = getChatData();
        const stats = normalizeViewerStats(chatData?.viewerStats);
        const lastActivity = Date.parse(chatData?.lastUpdated || '') || 0;
        const sameStream = !stats.streamStartedAt || stats.streamStartedAt === stream.started_at;
        if (!sameStream && Date.now() - lastActivity > windowMs) {
            const ended = endSessionNow({ endedAtIso: chatData?.lastUpdated || null });
            log(`[Lifecycle] Closed out stale session (${ended.archiveName || 'not archived'}) and starting a new one`);
            startSessionNow();
        } else if (!isSessionActive()) {
            setSessionActive(true);
            broadcastSessionState();
        }
    }

    function lifecycleOnOffline(cfg) {
        lifecycle.liveStreak = 0;
        lifecycle.suppressed = false;
        if (!lifecycle.lastLiveAt || !isSessionActive()) return;
        if (!lifecycle.offlineSince) lifecycle.offlineSince = Date.now();
        if (Date.now() - lifecycle.offlineSince < cfg.end_grace_minutes * 60000) return;

        const chatData = getChatData();
        const startMs = Date.parse(normalizeViewerStats(chatData?.viewerStats).streamStartedAt || '');
        const endedAtIso = new Date(lifecycle.lastLiveAt).toISOString();
        const tooShort = Number.isFinite(startMs) && lifecycle.lastLiveAt - startMs < cfg.min_session_minutes * 60000;
        const ended = endSessionNow({ endedAtIso, discard: tooShort });
        log(tooShort
            ? `[Lifecycle] Stream was under ${cfg.min_session_minutes} min — session discarded`
            : `[Lifecycle] Offline ${cfg.end_grace_minutes} min — session ended${ended.archiveName ? ` (${ended.archiveName})` : ''}`);
        lifecycle.offlineSince = 0;
        lifecycle.lastLiveAt = 0;
        lifecycle.liveId = null;
    }

    async function pollLifecycle() {
        const config = getConfig();
        const cfg = normalizeLifecycleConfig(config?.session_lifecycle);
        const clientId = getTwitchClientId();
        const broadcasterId = getBroadcasterId();
        if (!cfg.auto || !clientId || !broadcasterId) return;
        try {
            if (!(await ensureTwitchToken())) return;
            const stream = await fetchTwitchStream();
            if (stream) lifecycleOnLive(stream, cfg);
            else lifecycleOnOffline(cfg);
        } catch (err) {
            warn('[Lifecycle] Poll failed:', err.message);
        }
    }

    function getLifecycleStatus() {
        const config = getConfig();
        const cfg = normalizeLifecycleConfig(config?.session_lifecycle);
        const endsAt = lifecycle.offlineSince && isSessionActive()
            ? lifecycle.offlineSince + cfg.end_grace_minutes * 60000
            : null;
        return {
            auto: cfg.auto,
            state: !cfg.auto ? 'off' : lifecycle.suppressed ? 'manual' : endsAt ? 'ending' : lifecycle.liveStreak ? 'live' : 'waiting',
            endsAt: endsAt ? new Date(endsAt).toISOString() : null,
            graceMinutes: cfg.end_grace_minutes
        };
    }

    function getSessionPhase() {
        const config = getConfig();
        const cfg = normalizeLifecycleConfig(config?.session_lifecycle);
        if (cfg.auto && !sessionHasData() && !lifecycle.liveStreak) return 'waiting';
        return isSessionActive() ? 'active' : 'ended';
    }

    function startLifecycleWatcher() {
        if (lifecycle.timer) clearInterval(lifecycle.timer);
        const config = getConfig();
        const cfg = normalizeLifecycleConfig(config?.session_lifecycle);
        lifecycle.timer = setInterval(pollLifecycle, cfg.poll_seconds * 1000);
        setTimeout(pollLifecycle, 3000);
    }

    function stopLifecycleWatcher() {
        if (!lifecycle.timer) return;
        clearInterval(lifecycle.timer);
        lifecycle.timer = null;
    }

    function archivedCategoryMinutes() {
        const totals = {};
        if (!fs.existsSync(sessionsDir)) return totals;
        for (const file of fs.readdirSync(sessionsDir).filter(f => f.startsWith('chat-') && f.endsWith('.json'))) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                const endMs = Date.parse(data.lastUpdated || data.startedAt);
                const floor = Date.parse(data.viewerStats?.streamStartedAt || '');
                for (const [name, minutes] of Object.entries(categoryMinutesFor(data.streamInfo, endMs, floor))) {
                    totals[name] = (totals[name] || 0) + minutes;
                }
            } catch {}
        }
        return totals;
    }

    function currentCategoryStats(archivedTotals = {}) {
        const chatData = getChatData();
        const info = chatData?.streamInfo || [];
        const name = info.length ? (info[info.length - 1].category || '(No Category)') : '';
        if (!name) return { name: '', sessionMinutes: 0, totalMinutes: 0 };
        const floor = Date.parse(normalizeViewerStats(chatData?.viewerStats).streamStartedAt || '');
        const sessionMinutes = categoryMinutesFor(info, Date.now(), floor)[name] || 0;
        return {
            name,
            sessionMinutes: Math.round(sessionMinutes),
            totalMinutes: Math.round((archivedTotals[name] || 0) + sessionMinutes)
        };
    }

    function computeMilestones() {
        const nowMs = Date.now();
        if (milestoneCache.data && (nowMs - milestoneCache.at < 30000)) {
            return milestoneCache.data;
        }

        let archivedFiles = [];
        if (fs.existsSync(sessionsDir)) {
            archivedFiles = fs.readdirSync(sessionsDir).filter(f => f.startsWith('chat-') && f.endsWith('.json'));
        }

        let totalDurationMs = 0;
        const streamDates = new Set();
        const weekSet = new Set();

        function getIsoWeek(d) {
            const date = new Date(d.getTime());
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
            const week1 = new Date(date.getFullYear(), 0, 4);
            const weekNr = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
            return `${date.getFullYear()}-W${String(weekNr).padStart(2, '0')}`;
        }

        for (const file of archivedFiles) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                const start = Date.parse(data.startedAt || '');
                const end = Date.parse(data.lastUpdated || '');
                if (start && end && end > start) {
                    totalDurationMs += (end - start);
                }
                const dateStr = String(data.startedAt || file).slice(0, 10);
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    streamDates.add(dateStr);
                    weekSet.add(getIsoWeek(new Date(dateStr + 'T12:00:00Z')));
                }
            } catch {}
        }

        const chatData = getChatData();
        const statsData = getStatsData();
        if (chatData?.startedAt) {
            const liveStart = Date.parse(chatData.startedAt);
            const liveEnd = Date.now();
            if (liveEnd > liveStart) {
                totalDurationMs += (liveEnd - liveStart);
            }
            const todayStr = new Date().toISOString().slice(0, 10);
            streamDates.add(todayStr);
            weekSet.add(getIsoWeek(new Date()));
        }

        const streamNumber = archivedFiles.length + (chatData?.startedAt && !archivedFiles.some(f => f.includes(chatData.startedAt.slice(0, 10))) ? 1 : 0);
        const totalMinutes = Math.round(totalDurationMs / 60000);
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        const totalTimeString = `${totalHours}h ${remainingMinutes}m`;

        const fmtDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const todayDate = new Date();
        const todayStr = fmtDay(todayDate);
        const yestDate = new Date(todayDate);
        yestDate.setDate(yestDate.getDate() - 1);
        const yestStr = fmtDay(yestDate);

        let streakDays = 0;
        let curDay = streamDates.has(todayStr) ? new Date(todayDate) : (streamDates.has(yestStr) ? yestDate : null);
        if (curDay) {
            while (true) {
                const s = fmtDay(curDay);
                if (streamDates.has(s)) {
                    streakDays++;
                    curDay.setDate(curDay.getDate() - 1);
                } else {
                    break;
                }
            }
        }

        let streakWeeks = 0;
        const thisWeek = getIsoWeek(todayDate);
        const lastWeekDate = new Date(todayDate);
        lastWeekDate.setDate(lastWeekDate.getDate() - 7);
        const lastWeek = getIsoWeek(lastWeekDate);

        let curWeek = weekSet.has(thisWeek) ? new Date(todayDate) : (weekSet.has(lastWeek) ? lastWeekDate : null);
        if (curWeek) {
            while (true) {
                const w = getIsoWeek(curWeek);
                if (weekSet.has(w)) {
                    streakWeeks++;
                    curWeek.setDate(curWeek.getDate() - 7);
                } else {
                    break;
                }
            }
        }

        const lifetimeChatters = Object.keys(statsData?.chatters || {}).length;
        const totalStoredMessages = typeof statsData?.totalMessages === 'object' && statsData.totalMessages !== null
            ? Object.values(statsData.totalMessages).reduce((sum, count) => sum + (Number(count) || 0), 0)
            : (Number(statsData?.totalMessages) || 0);
        const lifetimeMessages = totalStoredMessages + (Number(chatData?.messageCount) || 0);

        const nextStreamGoal = streamNumber < 25 ? 25 : (streamNumber < 50 ? 50 : (Math.floor(streamNumber / 25) + 1) * 25);
        const nextHoursGoal = totalHours < 100 ? 100 : (Math.floor(totalHours / 100) + 1) * 100;
        const nextChattersGoal = lifetimeChatters < 50 ? 50 : (lifetimeChatters < 100 ? 100 : (Math.floor(lifetimeChatters / 50) + 1) * 50);

        const milestonesList = [
            { type: 'streams', title: `Stream #${nextStreamGoal}`, current: streamNumber, target: nextStreamGoal, remaining: Math.max(0, nextStreamGoal - streamNumber), unit: 'streams' },
            { type: 'hours', title: `${nextHoursGoal} Broadcast Hours`, current: totalHours, target: nextHoursGoal, remaining: Math.max(0, nextHoursGoal - totalHours), unit: 'hours' },
            { type: 'chatters', title: `${nextChattersGoal} Unique Chatters`, current: lifetimeChatters, target: nextChattersGoal, remaining: Math.max(0, nextChattersGoal - lifetimeChatters), unit: 'chatters' }
        ];

        const result = {
            stream_number: streamNumber,
            total_hours: totalHours,
            total_minutes: totalMinutes,
            total_time: totalTimeString,
            streak_days: streakDays,
            streak_weeks: streakWeeks,
            lifetime_chatters: lifetimeChatters,
            lifetime_messages: lifetimeMessages,
            next_stream_goal: nextStreamGoal,
            next_hours_goal: nextHoursGoal,
            milestones: milestonesList
        };

        milestoneCache = { at: nowMs, data: result };
        return result;
    }

    return {
        isSessionActive,
        setSessionActive,
        getLifecycle: () => lifecycle,
        getLifecycleMemo: () => lifecycleMemo,
        noteArchivedSession,
        sessionHasData,
        broadcastSessionState,
        finalizeSessionStreamEnd,
        archiveSession,
        endSessionNow,
        startSessionNow,
        resumeArchivedSession,
        lifecycleOnLive,
        lifecycleOnOffline,
        pollLifecycle,
        getLifecycleStatus,
        getSessionPhase,
        startLifecycleWatcher,
        stopLifecycleWatcher,
        archivedCategoryMinutes,
        currentCategoryStats,
        computeMilestones
    };
}

module.exports = {
    createSessionService,
    normalizeLifecycleConfig,
    localDateTimeStr,
    localDateString,
    categoryTimeFor,
    categoryMinutesFor,
    getSessionStreamTimes,
    getSessionCategorySegments
};
