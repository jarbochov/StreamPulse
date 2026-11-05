const fs = require('fs');
const WebSocket = require('ws');

function formatDurationClock(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function createStatusService({
    sessionsDir,
    backupsDir,
    getConfig = () => ({}),
    getChatData = () => ({}),
    getVariablesStore = () => ({ list: () => ({}) }),
    getExternalData = () => ({}),
    getHostSources = () => [],
    getPollService = () => null,
    getTwitchService = () => null,
    getMatchupService = () => null,
    getOverlayService = () => null,
    buildGamePlanSnapshot = () => ({}),
    getMusicConfig = () => ({}),
    getMusicService = () => null,
    buildGoalsSnapshot = () => ({ summary: {}, metrics: {} }),
    getTimerService = () => null,
    getClipService = () => null,
    getChatbot = () => null,
    getAlertEngine = () => null,
    getObsService = () => null,
    getTierListService = () => null,
    getWsService = () => null,
    getSessionService = () => null,
    getProcessStartedAt = () => new Date().toISOString(),
    isSessionActive = () => false,
    getSsnSocket = () => null,
    getSsnSessionId = () => '',
    getBroadcasterId = () => '',
    getRefreshMinutes = () => 10,
    collectHashtagStats = () => ({ summary: {}, hashtags: [] }),
    archivedCategoryMinutes = () => ({}),
    currentCategoryStats = () => ({}),
    publicGameInfo = () => ({}),
    computeMilestones = () => [],
    normalizeViewerStats = (v) => v || {},
    getViewerSummary = () => ({}),
    getHighlights = () => [],
    recentChatSummary = () => [],
    buildRecentEvents = () => []
} = {}) {
    let statusHeavyCache = null;

    function invalidateHeavyCache() {
        statusHeavyCache = null;
    }

    function buildStatusSnapshot() {
        const nowMs = Date.now();
        if (!statusHeavyCache || nowMs - statusHeavyCache.at > 10000) {
            statusHeavyCache = {
                at: nowMs,
                archivedSessions: fs.existsSync(sessionsDir)
                    ? fs.readdirSync(sessionsDir).filter(file => file.startsWith('chat-') && file.endsWith('.json')).length
                    : 0,
                backupFiles: fs.existsSync(backupsDir)
                    ? fs.readdirSync(backupsDir).filter(file => file.endsWith('.zip')).sort().reverse()
                    : [],
                hashtagStats: collectHashtagStats(),
                categoryTotals: archivedCategoryMinutes()
            };
        }
        const { archivedSessions, backupFiles, hashtagStats, categoryTotals } = statusHeavyCache;
        const chatData = getChatData();
        const config = getConfig();
        const twitchService = getTwitchService();
        const pollService = getPollService();
        const matchupService = getMatchupService();
        const overlayService = getOverlayService();
        const musicService = getMusicService();
        const timerService = getTimerService();
        const clipService = getClipService();
        const chatbot = getChatbot();
        const alertEngine = getAlertEngine();
        const obsService = getObsService();
        const tierListService = getTierListService();
        const wsService = getWsService();
        const sessionService = getSessionService();
        const variablesStore = getVariablesStore();
        const musicConfig = getMusicConfig();

        const viewerSummary = getViewerSummary();
        const goalsSnapshot = buildGoalsSnapshot();
        const startedAtTime = Date.parse(normalizeViewerStats(chatData.viewerStats).streamStartedAt || chatData.startedAt || '');
        const streamUptimeSec = Number.isFinite(startedAtTime) && startedAtTime > 0
            ? Math.max(0, Math.floor((Date.now() - startedAtTime) / 1000))
            : Math.floor(process.uptime());

        let gamePlanSummary = null;
        try {
            const planSnapshot = buildGamePlanSnapshot();
            const playingNowItem = planSnapshot.items?.find(i => i.id === planSnapshot.playingNowId) || null;
            gamePlanSummary = {
                playingNowId: planSnapshot.playingNowId || null,
                playingNow: playingNowItem ? {
                    id: playingNowItem.id,
                    name: playingNowItem.name,
                    category: playingNowItem.twitchCategory || playingNowItem.name,
                    notes: playingNowItem.notes || ''
                } : null,
                scheduledCount: (planSnapshot.items || []).filter(i => i.list === 'scheduled').length
            };
        } catch { /* ignore */ }

        const ssnSocket = getSsnSocket();

        return {
            customVars: variablesStore.list(),
            external: getExternalData(),
            hostSources: getHostSources(),
            poll: (pollService ? pollService.getLatestPoll() : twitchService?.getLatestPoll?.()) || null,
            tournament: pollService ? pollService.getTournament({ isPoll: false }) : null,
            pollTournament: pollService ? pollService.getTournament({ isPoll: true }) : null,
            matchup: matchupService ? matchupService.getMatchup() : null,
            randomizer: overlayService?.getRandomizerStatus ? overlayService.getRandomizerStatus() : null,
            gamePlan: gamePlanSummary,
            processStartedAt: getProcessStartedAt(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            ssn: {
                connected: ssnSocket?.readyState === WebSocket.OPEN,
                session: getSsnSessionId() ? 'configured' : null,
                messages: chatData.messageCount || 0,
                chatters: Object.keys(chatData.chatters || {}).length,
                emotes: Object.keys(chatData.emotes || {}).length,
                hashtags: Object.keys(chatData.hashtags || {}).length,
                raids: chatData.raids?.length || 0,
                subscribers: chatData.subscribers?.length || 0,
                followers: chatData.followers?.length || 0
            },
            twitch: {
                broadcaster_id: getBroadcasterId() || null,
                hasToken: Boolean(twitchService?.getAccessToken?.()),
                scopes: twitchService?.getTokenScopes?.() || [],
                refreshMinutes: getRefreshMinutes(),
                eventSub: twitchService?.getEventSubStatus ? twitchService.getEventSubStatus() : null
            },
            viewers: viewerSummary,
            music: {
                enabled: Boolean(musicConfig.enabled),
                source: musicConfig.source || 'apple_music',
                ...(musicService?.getState ? musicService.getState() : {}),
                positionAgeMs: musicService?.getPolledAt?.() ? Date.now() - musicService.getPolledAt() : 0
            },
            stream: {
                title: chatData.streamInfo?.[chatData.streamInfo.length - 1]?.title || '',
                category: currentCategoryStats(categoryTotals),
                game: publicGameInfo(chatData.streamInfo?.[chatData.streamInfo.length - 1]?.category),
                uptimeSeconds: streamUptimeSec,
                streamUptime: formatDurationClock(streamUptimeSec),
                latestFollower: chatData.followers?.[chatData.followers.length - 1]?.chatname || '',
                latestSubscriber: chatData.subscribers?.[chatData.subscribers.length - 1]?.chatname || ''
            },
            goals: goalsSnapshot.summary,
            goalMetrics: goalsSnapshot.metrics,
            milestones: computeMilestones(),
            timers: timerService ? timerService.getStats() : {},
            library: {
                highlights: getHighlights().length,
                sessions: archivedSessions,
                clipCandidates: clipService ? clipService.getClipCandidates().length : 0
            },
            hashtags: hashtagStats.summary,
            popularHashtags: {
                overall: hashtagStats.hashtags.slice(0, 10).map(item => ({ tag: item.tag, count: item.count })),
                session: hashtagStats.hashtags.slice().sort((a, b) => b.sessionCount - a.sessionCount || a.tag.localeCompare(b.tag)).slice(0, 10).map(item => ({ tag: item.tag, count: item.sessionCount }))
            },
            backups: {
                autoEnabled: Boolean(config.auto_backup_on_session_end),
                count: backupFiles.length,
                latest: backupFiles[0] || null
            },
            chatbot: {
                ...(chatbot?.getStats ? chatbot.getStats() : { enabled: false, commandsCount: 0, timedCount: 0, quotesCount: 0, triggersCount: 0 }),
                botActive: chatbot?.isReady ? chatbot.isReady().ready : false
            },
            alerts: {
                enabled: alertEngine ? (alertEngine.getConfig()?.settings?.enabled !== false) : false,
                rulesCount: alertEngine ? (alertEngine.getConfig()?.rules?.length || 0) : 0,
                queuePending: alertEngine ? (alertEngine.getQueueState()?.pending || 0) : 0,
                paused: alertEngine ? (alertEngine.getQueueState()?.paused || false) : false,
                current: alertEngine ? alertEngine.getQueueState()?.current || null : null
            },
            modules: {
                chatbot: config.chatbot_enabled !== false,
                speakerBadges: config.speaker_badges_enabled === true,
                clips: config.clip_candidates?.enabled !== false,
                weather: config.weather?.enabled === true,
                music: Boolean(musicConfig.enabled),
                hashtags: config.hashtags_enabled !== false,
                polls: config.polls_enabled !== false,
                versus: config.versus_enabled !== false,
                obs: Boolean(config.obs?.enabled)
            },
            obs: obsService ? obsService.getStatus() : { connected: false },
            tierList: tierListService ? {
                title: tierListService.getState().title,
                itemsCount: tierListService.getState().items.length,
                tiersCount: tierListService.getState().tiers.length,
                activeVote: tierListService.getState().activeVote
            } : {},
            overlayClients: wsService ? wsService.getSourceCount() : 0,
            websocketClients: wsService ? wsService.getClientCount() : 0,
            sessionActive: isSessionActive(),
            lifecycle: sessionService ? sessionService.getLifecycleStatus() : {},
            sessionPhase: sessionService ? sessionService.getSessionPhase() : 'idle',
            streamStartedAt: normalizeViewerStats(chatData.viewerStats).streamStartedAt || null,
            lastSessionEndedAt: sessionService?.getLifecycleMemo?.()?.lastArchive?.endedAt ? new Date(sessionService.getLifecycleMemo().lastArchive.endedAt).toISOString() : null,
            startedAt: chatData.startedAt,
            hourlyMessages: chatData.hourlyMessages,
            streamInfo: chatData.streamInfo,
            topChatters: Object.values(chatData.chatters || {})
                .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
                .slice(0, 100)
                .map(c => ({ chatname: c.chatname, chatimg: c.chatimg || '', messageCount: c.messageCount || 0 })),
            recentChat: recentChatSummary(),
            recentEvents: buildRecentEvents(12)
        };
    }

    return {
        buildStatusSnapshot,
        invalidateHeavyCache,
        getHeavyCache: () => statusHeavyCache
    };
}

module.exports = {
    createStatusService,
    formatDurationClock
};
