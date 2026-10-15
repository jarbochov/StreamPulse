const fs = require('fs');
const path = require('path');

const DEFAULT_CLIP_CANDIDATE_CONFIG = {
    enabled: true,
    chat_spike_messages: 20,
    chat_spike_window_seconds: 60,
    cooldown_seconds: 30,
    include_subscriptions: true,
    include_gift_subs: true,
    include_highlights: true,
    include_bits: true,
    minimum_bits: 1,
    include_donations: true,
    minimum_donation: 0,
    include_raids: true,
    minimum_raid_viewers: 0
};

function normalizeClipCandidateConfig(value) {
    const input = value && typeof value === 'object' ? value : {};
    const number = (key, fallback, minimum = 0) => {
        const parsed = Number(input[key]);
        return Number.isFinite(parsed) ? Math.max(minimum, Math.round(parsed)) : fallback;
    };
    return {
        enabled: input.enabled !== false,
        chat_spike_messages: number('chat_spike_messages', DEFAULT_CLIP_CANDIDATE_CONFIG.chat_spike_messages, 2),
        chat_spike_window_seconds: number('chat_spike_window_seconds', DEFAULT_CLIP_CANDIDATE_CONFIG.chat_spike_window_seconds, 10),
        cooldown_seconds: number('cooldown_seconds', DEFAULT_CLIP_CANDIDATE_CONFIG.cooldown_seconds, 0),
        include_subscriptions: input.include_subscriptions !== false,
        include_gift_subs: input.include_gift_subs !== false,
        include_highlights: input.include_highlights !== false,
        include_bits: input.include_bits !== false,
        minimum_bits: number('minimum_bits', DEFAULT_CLIP_CANDIDATE_CONFIG.minimum_bits, 1),
        include_donations: input.include_donations !== false,
        minimum_donation: number('minimum_donation', DEFAULT_CLIP_CANDIDATE_CONFIG.minimum_donation, 0),
        include_raids: input.include_raids !== false,
        minimum_raid_viewers: number('minimum_raid_viewers', DEFAULT_CLIP_CANDIDATE_CONFIG.minimum_raid_viewers, 0)
    };
}

function parseTwitchDuration(duration) {
    const match = String(duration || '').match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match) return 0;
    return ((Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0)) * 1000;
}

function formatVodOffset(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return `${hours ? `${hours}h` : ''}${minutes ? `${minutes}m` : ''}${remainder || (!hours && !minutes) ? `${remainder}s` : ''}`;
}

function parseNumericAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
}

function createClipService({
    dataDir,
    sessionsDir,
    clipCandidatesPath,
    chatLogPath,
    getConfig = () => ({}),
    getChatData = () => ({}),
    isSessionActive = () => true,
    getBroadcasterId = () => '',
    getBroadcasterName = () => '',
    ensureToken = async () => false,
    twitchApiRequest = async () => ({ status: 500, body: {} }),
    getHighlights = () => [],
    readChatLogFile = () => [],
    getCurrentChatLogEntries = () => [],
    localDateTimeStr = d => String(d || ''),
    log = console.log,
    warn = console.warn
} = {}) {
    const filePath = clipCandidatesPath || path.join(dataDir, 'clip-candidates.json');
    let clipCandidates = [];
    let archivedVodCache = { fetchedAt: 0, videos: [] };

    function getRuntimeConfig() {
        return normalizeClipCandidateConfig(getConfig().clip_candidates);
    }

    function loadClipCandidates() {
        try {
            if (fs.existsSync(filePath)) {
                const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                clipCandidates = Array.isArray(stored) ? stored : [];
                log(`[Clips Beta] Loaded ${clipCandidates.length} candidates`);
            }
        } catch (err) {
            warn(`[Clips Beta] Could not load candidates: ${err.message}`);
            clipCandidates = [];
        }
    }

    function saveClipCandidates() {
        fs.writeFileSync(filePath, JSON.stringify(clipCandidates, null, 2));
    }

    function currentClipSession() {
        const chatData = getChatData();
        return {
            session: chatData.startedAt ? `chat-${localDateTimeStr(chatData.startedAt)}.json` : 'unknown',
            startedAt: chatData.startedAt || null
        };
    }

    function clipSessionOverrideForName(sessionName) {
        const name = String(sessionName || '');
        const current = currentClipSession();
        if (!name || name === 'current' || name === current.session) return current;
        if (!/^chat-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/.test(name)) return null;
        try {
            const sessionPath = path.join(sessionsDir, name);
            if (!fs.existsSync(sessionPath)) return null;
            const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            return data.startedAt ? { session: name, startedAt: data.startedAt } : null;
        } catch {
            return null;
        }
    }

    async function getArchivedVods() {
        const broadcasterId = getBroadcasterId();
        if (!broadcasterId || !(await ensureToken())) return [];
        if (Date.now() - archivedVodCache.fetchedAt < 60000) return archivedVodCache.videos;
        try {
            const result = await twitchApiRequest('/videos', { user_id: broadcasterId, first: '100', type: 'archive' });
            if (result.status !== 200 || !Array.isArray(result.body.data)) return [];
            archivedVodCache = { fetchedAt: Date.now(), videos: result.body.data };
            return archivedVodCache.videos;
        } catch (err) {
            warn(`[Clips Beta] Could not load Twitch VODs: ${err.message}`);
            return [];
        }
    }

    async function resolveCandidateVodUrls(candidates) {
        const broadcasterName = getBroadcasterName();
        const fallback = broadcasterName
            ? `https://www.twitch.tv/${encodeURIComponent(broadcasterName)}/videos`
            : null;
        const videos = await getArchivedVods();
        return candidates.map(candidate => {
            const timestamp = Number(candidate.timestamp);
            const match = videos.find(video => {
                const start = Date.parse(video.created_at);
                const duration = parseTwitchDuration(video.duration);
                return Number.isFinite(timestamp) && Number.isFinite(start)
                    && timestamp >= start - 15 * 60 * 1000
                    && timestamp <= start + duration + 15 * 60 * 1000;
            });
            const vodUrl = match?.id
                ? `https://www.twitch.tv/videos/${encodeURIComponent(match.id)}?t=${formatVodOffset((timestamp - Date.parse(match.created_at)) / 1000)}`
                : fallback;
            return {
                ...candidate,
                vodUrl,
                vodMatched: !!match?.id,
                vodId: match?.id || null,
                vodOffsetSeconds: match?.id ? Math.max(0, Math.round((timestamp - Date.parse(match.created_at)) / 1000)) : null
            };
        });
    }

    function addClipCandidate(reason, details = {}, timestamp = Date.now(), score = 0.5, sessionOverride = null, sourceKey = null) {
        if (!isSessionActive() && !sessionOverride) return null;
        const config = getRuntimeConfig();
        const chatData = getChatData();
        const sessionStartedAt = sessionOverride?.startedAt || chatData.startedAt;
        const duplicateWindow = timestamp - (config.cooldown_seconds * 1000);
        const duplicate = clipCandidates.some(candidate =>
            candidate.sessionStartedAt === sessionStartedAt &&
            (sourceKey && candidate.sourceKey === sourceKey ||
                candidate.timestamp >= duplicateWindow && candidate.reason === reason)
        );
        if (duplicate) return null;

        const session = sessionOverride || currentClipSession();
        const candidate = {
            id: `clip-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp,
            detectedAt: new Date().toISOString(),
            reason,
            details,
            score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
            session: session.session,
            sessionStartedAt,
            sourceKey,
            status: 'candidate',
            clipId: null,
            editUrl: null,
            viewUrl: null,
            createdAt: null,
            error: null
        };
        clipCandidates.push(candidate);
        clipCandidates = clipCandidates.slice(-500);
        saveClipCandidates();
        log(`[Clips Beta] Candidate: ${reason}`);
        return candidate;
    }

    function backfillClipCandidatesFromEntries(entries, sessionOverride) {
        if (!Array.isArray(entries) || !sessionOverride?.startedAt) return 0;
        const config = getRuntimeConfig();
        const ordered = entries
            .filter(entry => Number.isFinite(Number(entry.ts)))
            .sort((a, b) => Number(a.ts) - Number(b.ts));
        const timestamps = [];
        let created = 0;

        for (const entry of ordered) {
            const timestamp = Number(entry.ts);
            timestamps.push(timestamp);
            while (timestamps.length && timestamp - timestamps[0] > config.chat_spike_window_seconds * 1000) {
                timestamps.shift();
            }

            if (config.enabled && timestamps.length >= config.chat_spike_messages) {
                created += Number(Boolean(addClipCandidate(
                    'chat-spike',
                    { messagesInWindow: timestamps.length, windowSeconds: config.chat_spike_window_seconds },
                    timestamp,
                    Math.min(0.95, 0.5 + timestamps.length / 100),
                    sessionOverride,
                    `${sessionOverride.session}:chat-spike:${timestamp}`
                )));
            }

            const event = String(entry.event || '').toLowerCase();
            const user = entry.user || 'unknown';
            if (config.enabled && config.include_gift_subs &&
                ['subscription_gift', 'giftpurchase', 'giftredemption'].includes(event)) {
                created += Number(Boolean(addClipCandidate('gift-sub', { user }, timestamp, 0.65, sessionOverride, `${sessionOverride.session}:gift-sub:${timestamp}`)));
            } else if (config.enabled && config.include_subscriptions &&
                ['new_subscriber', 'resub', 'sponsorship'].includes(event)) {
                created += Number(Boolean(addClipCandidate('subscription', { user, tier: entry.membership || event }, timestamp, 0.6, sessionOverride, `${sessionOverride.session}:subscription:${timestamp}`)));
            }

            if (config.enabled && config.include_bits &&
                (event === 'cheer' || String(entry.donation || '').toLowerCase().includes('bit'))) {
                const amount = parseNumericAmount(entry.donation);
                if (amount >= config.minimum_bits) {
                    created += Number(Boolean(addClipCandidate('bits', { user, amount, label: entry.donation || `${amount} bits` }, timestamp, 0.65, sessionOverride, `${sessionOverride.session}:bits:${timestamp}`)));
                }
            }

            if (config.enabled && config.include_donations &&
                entry.donation && !String(entry.donation).toLowerCase().includes('bit')) {
                const amount = parseNumericAmount(entry.donation);
                if (amount >= config.minimum_donation) {
                    created += Number(Boolean(addClipCandidate('donation', { user, amount: entry.donation }, timestamp, 0.7, sessionOverride, `${sessionOverride.session}:donation:${timestamp}`)));
                }
            }

            if (config.enabled && config.include_raids && event === 'raid') {
                const viewers = Number((entry.message || '').match(/(\d+)/)?.[1] || 0);
                if (viewers >= config.minimum_raid_viewers) {
                    created += Number(Boolean(addClipCandidate('raid', { user, viewers: viewers || null }, timestamp, 0.8, sessionOverride, `${sessionOverride.session}:raid:${timestamp}`)));
                }
            }
        }
        return created;
    }

    function backfillHighlightedClipCandidates() {
        const config = getRuntimeConfig();
        const highlights = getHighlights();
        let created = 0;
        for (const highlight of highlights) {
            if (!config.enabled || !config.include_highlights) continue;
            const sessionOverride = clipSessionOverrideForName(highlight.session);
            if (!sessionOverride || !Number.isFinite(Number(highlight.ts))) continue;
            created += Number(Boolean(addClipCandidate(
                'highlighted-chat',
                { user: highlight.user, message: highlight.message || '' },
                Number(highlight.ts),
                0.9,
                sessionOverride,
                `${sessionOverride.session}:highlight:${highlight.ts}:${highlight.user}`
            )));
        }
        return created;
    }

    function backfillClipCandidates(rebuild = false) {
        const chatData = getChatData();
        let removed = 0;
        if (rebuild) {
            const before = clipCandidates.length;
            clipCandidates = clipCandidates.filter(candidate =>
                candidate.status === 'created'
                || !candidate.sourceKey
                || candidate.sessionStartedAt === chatData.startedAt
            );
            removed = before - clipCandidates.length;
            if (removed) saveClipCandidates();
        }

        const sessions = [];
        const activeLogPath = chatLogPath || path.join(dataDir, 'chat-log.jsonl');
        if (chatData.startedAt && fs.existsSync(activeLogPath)) {
            sessions.push({
                session: `chat-${localDateTimeStr(chatData.startedAt)}.json`,
                startedAt: chatData.startedAt,
                entries: getCurrentChatLogEntries()
            });
        }

        if (fs.existsSync(sessionsDir)) {
            for (const file of fs.readdirSync(sessionsDir).filter(name => name.startsWith('chat-') && name.endsWith('.json'))) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                    const logName = file.replace('chat-', 'chatlog-').replace('.json', '.jsonl');
                    sessions.push({
                        session: file,
                        startedAt: data.startedAt,
                        entries: readChatLogFile(path.join(sessionsDir, logName))
                    });
                } catch (err) {
                    warn(`[Clips Beta] Could not analyze ${file}: ${err.message}`);
                }
            }
        }

        let created = 0;
        for (const session of sessions) {
            created += backfillClipCandidatesFromEntries(session.entries, {
                session: session.session,
                startedAt: session.startedAt
            });
        }
        created += backfillHighlightedClipCandidates();
        return { sessions: sessions.length, created, removed };
    }

    // Initial load
    loadClipCandidates();

    return {
        getClipCandidates: () => clipCandidates,
        setClipCandidates: (arr) => { clipCandidates = arr; },
        loadClipCandidates,
        saveClipCandidates,
        addClipCandidate,
        resolveCandidateVodUrls,
        backfillClipCandidates,
        clipSessionOverrideForName,
        currentClipSession,
        normalizeClipCandidateConfig,
        getRuntimeConfig,
        DEFAULT_CLIP_CANDIDATE_CONFIG
    };
}

module.exports = {
    createClipService,
    normalizeClipCandidateConfig,
    DEFAULT_CLIP_CANDIDATE_CONFIG,
    parseTwitchDuration,
    formatVodOffset
};
