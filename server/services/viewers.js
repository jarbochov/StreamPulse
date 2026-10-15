function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function createEmptyViewerStats() {
    return {
        live: false,
        current: 0,
        peak: 0,
        average: 0,
        source: null,
        sampledAt: null,
        streamStartedAt: null,
        streamEndedAt: null,
        samples: []
    };
}

function normalizeViewerTrackingConfig(input = {}) {
    return {
        enabled: input?.enabled !== false,
        source: input?.source === 'twitch' ? 'twitch' : 'best_available',
        poll_seconds: clampNumber(input?.poll_seconds, 15, 3600, 60),
        retain_samples: clampNumber(input?.retain_samples, 60, 5000, 720)
    };
}

function normalizeViewerStats(input = {}) {
    const normalized = createEmptyViewerStats();
    normalized.live = !!input?.live;
    normalized.current = Math.max(0, Math.round(Number(input?.current) || 0));
    normalized.source = input?.source || null;
    normalized.sampledAt = input?.sampledAt || null;
    normalized.streamStartedAt = input?.streamStartedAt || null;
    normalized.streamEndedAt = input?.streamEndedAt || null;
    if (!normalized.streamStartedAt || normalized.streamStartedAt === normalized.streamEndedAt) {
        normalized.streamEndedAt = null;
    }
    normalized.samples = Array.isArray(input?.samples)
        ? input.samples
            .map(sample => ({
                ts: sample?.ts || new Date().toISOString(),
                count: Math.max(0, Math.round(Number(sample?.count) || 0)),
                live: sample?.live !== false,
                source: sample?.source || null
            }))
            .filter(sample => sample.ts)
        : [];

    const liveSamples = normalized.samples.filter(sample => sample.live !== false);
    normalized.peak = liveSamples.length > 0
        ? liveSamples.reduce((max, sample) => Math.max(max, sample.count), 0)
        : Math.max(0, Math.round(Number(input?.peak) || normalized.current));
    normalized.average = liveSamples.length > 0
        ? Number((liveSamples.reduce((sum, sample) => sum + sample.count, 0) / liveSamples.length).toFixed(1))
        : Math.max(0, Number(input?.average) || (normalized.live ? normalized.current : 0));
    return normalized;
}

function findSSNViewerCount(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 3) return null;

    const viewerKeys = ['viewer_count', 'viewerCount', 'viewers', 'audience_count', 'audienceCount', 'current_viewers', 'currentViewers'];
    for (const key of viewerKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            const count = Number(value[key]);
            if (Number.isFinite(count) && count >= 0) {
                return {
                    count,
                    live: value.live !== false && value.online !== false,
                    streamStartedAt: value.stream_started_at || value.streamStartedAt || null
                };
            }
        }
    }

    for (const key of ['data', 'payload', 'meta', 'overlayNinja']) {
        const nested = findSSNViewerCount(value[key], depth + 1);
        if (nested) return nested;
    }
    return null;
}

function createViewerService(options = {}) {
    const {
        getConfig = () => ({}),
        getChatData = () => ({}),
        setChatDataViewerStats = null,
        onViewerUpdate = () => {},
        onGoalsUpdate = () => {},
        fetchLiveStreamViewer = async () => null,
        log = console.log,
        warn = console.warn,
        error = console.error
    } = options;

    let viewerPollHandle = null;
    let lastSSNViewerUpdateAt = 0;

    function getViewerSummary(sourceData = null) {
        const data = sourceData || getChatData();
        const viewerStats = normalizeViewerStats(data?.viewerStats);
        const config = getConfig();
        return {
            enabled: normalizeViewerTrackingConfig(config?.viewer_tracking).enabled,
            live: viewerStats.live,
            current: viewerStats.current,
            peak: viewerStats.peak,
            average: viewerStats.average,
            source: viewerStats.source,
            sampledAt: viewerStats.sampledAt,
            streamStartedAt: viewerStats.streamStartedAt,
            streamEndedAt: viewerStats.streamEndedAt,
            sampleCount: viewerStats.samples.length,
            samples: viewerStats.samples
        };
    }

    function recordViewerSample({ count, live, source, streamStartedAt }) {
        const config = getConfig();
        const chatData = getChatData();
        const cfg = normalizeViewerTrackingConfig(config?.viewer_tracking);
        const normalized = normalizeViewerStats(chatData?.viewerStats);
        const wasLive = normalized.live;
        const now = new Date().toISOString();
        normalized.live = !!live;
        normalized.current = Math.max(0, Math.round(Number(count) || 0));
        normalized.source = source || normalized.source || 'twitch';
        normalized.sampledAt = now;
        if (normalized.live && (!wasLive || !normalized.streamStartedAt)) {
            normalized.streamStartedAt = streamStartedAt || now;
            normalized.streamEndedAt = null;
        } else if (!normalized.live && wasLive && normalized.streamStartedAt) {
            normalized.streamEndedAt = now;
        }
        normalized.samples.push({
            ts: now,
            count: normalized.current,
            live: normalized.live,
            source: normalized.source
        });
        while (normalized.samples.length > cfg.retain_samples) normalized.samples.shift();
        const finalStats = normalizeViewerStats(normalized);
        if (typeof setChatDataViewerStats === 'function') {
            setChatDataViewerStats(finalStats);
        } else if (chatData) {
            chatData.viewerStats = finalStats;
        }
        const summary = getViewerSummary();
        onViewerUpdate(summary);
        onGoalsUpdate();
        return summary;
    }

    function processSSNViewerUpdate(msg) {
        const viewerUpdate = findSSNViewerCount(msg);
        if (!viewerUpdate) return false;

        lastSSNViewerUpdateAt = Date.now();
        recordViewerSample({
            ...viewerUpdate,
            source: 'socialstream'
        });
        return true;
    }

    async function fetchViewerCount() {
        const config = getConfig();
        const viewerConfig = normalizeViewerTrackingConfig(config?.viewer_tracking);
        if (!viewerConfig.enabled) return;
        const ssnFreshnessMs = Math.max(viewerConfig.poll_seconds * 2000, 30000);
        if (viewerConfig.source === 'best_available' && Date.now() - lastSSNViewerUpdateAt < ssnFreshnessMs) {
            return;
        }

        try {
            const stream = await fetchLiveStreamViewer();
            if (!stream) return;

            recordViewerSample({
                count: stream.count ?? stream.viewer_count ?? 0,
                live: !!stream.live,
                source: stream.source || 'twitch',
                streamStartedAt: stream.streamStartedAt || stream.started_at || null
            });
        } catch (err) {
            error('[Viewers] Fetch error:', err.message);
        }
    }

    function startViewerTracking() {
        if (viewerPollHandle) return;
        const config = getConfig();
        const cfg = normalizeViewerTrackingConfig(config?.viewer_tracking);
        if (!cfg.enabled) return;
        fetchViewerCount();
        viewerPollHandle = setInterval(fetchViewerCount, cfg.poll_seconds * 1000);
        log(`[Viewers] Polling every ${cfg.poll_seconds}s`);
    }

    function stopViewerTracking() {
        if (!viewerPollHandle) return;
        clearInterval(viewerPollHandle);
        viewerPollHandle = null;
        log('[Viewers] Polling stopped');
    }

    return {
        getViewerSummary,
        recordViewerSample,
        processSSNViewerUpdate,
        fetchViewerCount,
        startViewerTracking,
        stopViewerTracking,
        getLastSSNViewerUpdateAt: () => lastSSNViewerUpdateAt,
        setLastSSNViewerUpdateAt: (ts) => { lastSSNViewerUpdateAt = ts; },
        isPolling: () => !!viewerPollHandle
    };
}

module.exports = {
    createViewerService,
    clampNumber,
    createEmptyViewerStats,
    normalizeViewerTrackingConfig,
    normalizeViewerStats,
    findSSNViewerCount
};
