const fs = require('fs');
const path = require('path');

const GOAL_TYPE_LABELS = {
    followers: 'Followers',
    subscribers: 'Subscribers',
    gift_subs: 'Gift Subs',
    bits: 'Bits',
    donations: 'Donations',
    viewers: 'Viewers',
    community: 'Community Goal'
};

const GOAL_TYPES = Object.keys(GOAL_TYPE_LABELS);
const GOAL_TRACKING_TYPES = ['persistent', 'session'];
const GOAL_VIEWER_MODES = ['current', 'peak'];
const DEFAULT_COMMUNITY_WEIGHTS = {
    followers: 1,
    subscribers: 5,
    gift_subs: 5,
    bits_per_100: 1,
    donations: 1
};

const DEFAULT_GOALS_CONFIG = {
    enabled: true,
    rotate_seconds: 8,
    skip_completed: true,
    pause_completed_seconds: 0,
    items: []
};

function sanitizeGoalId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function parseNumericAmount(value) {
    const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function normalizeGoalWeights(weights = {}) {
    return {
        followers: Math.max(0, Number(weights?.followers) || DEFAULT_COMMUNITY_WEIGHTS.followers),
        subscribers: Math.max(0, Number(weights?.subscribers) || DEFAULT_COMMUNITY_WEIGHTS.subscribers),
        gift_subs: Math.max(0, Number(weights?.gift_subs) || DEFAULT_COMMUNITY_WEIGHTS.gift_subs),
        bits_per_100: Math.max(0, Number(weights?.bits_per_100) || DEFAULT_COMMUNITY_WEIGHTS.bits_per_100),
        donations: Math.max(0, Number(weights?.donations) || DEFAULT_COMMUNITY_WEIGHTS.donations)
    };
}

function normalizeCommunityBaseline(metrics = {}) {
    return {
        followers: Math.max(0, Number(metrics?.followers) || 0),
        subscribers: Math.max(0, Number(metrics?.subscribers) || 0),
        gift_subs: Math.max(0, Number(metrics?.gift_subs) || 0),
        bits: Math.max(0, Number(metrics?.bits) || 0),
        donations: Math.max(0, Number(metrics?.donations) || 0)
    };
}

function goalDefaultTitle(type, viewerMode) {
    if (type === 'viewers') {
        return viewerMode === 'peak' ? 'Peak Viewers Goal' : 'Current Viewers Goal';
    }
    if (type === 'community') return 'Community Goal';
    return `${GOAL_TYPE_LABELS[type] || 'Goal'} Goal`;
}

function normalizeGoalItem(item = {}, index = 0, seenIds = new Set()) {
    const type = GOAL_TYPES.includes(item?.type) ? item.type : 'followers';
    const viewerMode = GOAL_VIEWER_MODES.includes(item?.viewer_mode) ? item.viewer_mode : 'current';
    const tracking = type === 'viewers'
        ? 'session'
        : (GOAL_TRACKING_TYPES.includes(item?.tracking) ? item.tracking : 'persistent');

    let id = sanitizeGoalId(item?.id) || `goal-${index + 1}`;
    while (seenIds.has(id)) {
        id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    return {
        id,
        enabled: item?.enabled !== false,
        title: String(item?.title || goalDefaultTitle(type, viewerMode)).trim() || goalDefaultTitle(type, viewerMode),
        type,
        target: Math.max(1, Number(item?.target) || 1),
        tracking,
        viewer_mode: viewerMode,
        baseline: Math.max(0, Number(item?.baseline) || 0),
        baseline_metrics: normalizeCommunityBaseline(item?.baseline_metrics),
        weights: normalizeGoalWeights(item?.weights)
    };
}

function normalizeGoalsConfig(input = {}) {
    const seenIds = new Set();
    return {
        enabled: input?.enabled !== false,
        rotate_seconds: clampNumber(input?.rotate_seconds, 3, 60, DEFAULT_GOALS_CONFIG.rotate_seconds),
        skip_completed: input?.skip_completed !== false,
        pause_completed_seconds: clampNumber(input?.pause_completed_seconds, 0, 30, DEFAULT_GOALS_CONFIG.pause_completed_seconds),
        items: Array.isArray(input?.items)
            ? input.items.map((item, index) => normalizeGoalItem(item, index, seenIds))
            : []
    };
}

function buildCommunityMetricSnapshot(metrics, tracking) {
    const source = tracking === 'session' ? metrics.session : metrics.persistent;
    return {
        followers: source.followers,
        subscribers: source.subscribers,
        gift_subs: source.gift_subs,
        bits: source.bits,
        donations: source.donations
    };
}

function computeCommunityPoints(metricSnapshot, weights) {
    const safe = normalizeCommunityBaseline(metricSnapshot);
    const normalizedWeights = normalizeGoalWeights(weights);
    return Number((
        safe.followers * normalizedWeights.followers +
        safe.subscribers * normalizedWeights.subscribers +
        safe.gift_subs * normalizedWeights.gift_subs +
        (safe.bits / 100) * normalizedWeights.bits_per_100 +
        safe.donations * normalizedWeights.donations
    ).toFixed(2));
}

function sumDailyBuckets(days) {
    if (!days || typeof days !== 'object') return 0;
    let sum = 0;
    for (const count of Object.values(days)) {
        sum += (typeof count === 'number' ? count : 0);
    }
    return sum;
}

function createGoalsService({
    dataDir,
    getConfig = () => ({}),
    saveRuntimeConfigSection,
    getChatData = () => ({ followers: [], subscribers: [], giftSubs: [], bits: [], donations: [], raids: [] }),
    getStatsData = () => ({ giftSubs: {}, bits: {}, donations: {} }),
    getViewerSummary = () => ({ live: false, current: 0, peak: 0, average: 0 }),
    readJsonFileSafe = (filePath, fallback = null) => {
        try {
            if (!fs.existsSync(filePath)) return fallback;
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return fallback;
        }
    },
    onGoalAlert = () => {}
}) {
    function getCurrentSubscriberTotal() {
        return readJsonFileSafe(path.join(dataDir, 'subs.json'), { data: [] })?.data?.length || 0;
    }

    function getCurrentFollowerTotal() {
        return readJsonFileSafe(path.join(dataDir, 'followers.json'), { data: [] })?.data?.length || 0;
    }

    function getSessionGiftSubTotal() {
        const chatData = getChatData();
        return (chatData.giftSubs || []).reduce((sum, item) => sum + Math.max(1, Number(item?.count) || 1), 0);
    }

    function getSessionBitsTotal() {
        const chatData = getChatData();
        return (chatData.bits || []).reduce((sum, item) => sum + Math.max(0, Number(item?.bits) || parseNumericAmount(item?.amount)), 0);
    }

    function getSessionDonationTotal() {
        const chatData = getChatData();
        return Number((chatData.donations || []).reduce((sum, item) => sum + parseNumericAmount(item?.amountValue ?? item?.amount), 0).toFixed(2));
    }

    function getLifetimeGiftSubTotal() {
        const statsData = getStatsData();
        return Object.values(statsData.giftSubs || {}).reduce((sum, item) => sum + sumDailyBuckets(item.days), 0);
    }

    function getLifetimeBitsTotal() {
        const statsData = getStatsData();
        return Object.values(statsData.bits || {}).reduce((sum, item) => sum + sumDailyBuckets(item.days), 0);
    }

    function getLifetimeDonationTotal() {
        const statsData = getStatsData();
        return Number(Object.values(statsData.donations || {}).reduce((sum, item) => sum + sumDailyBuckets(item.amounts), 0).toFixed(2));
    }

    function buildRecentEvents(limit = 10) {
        const chatData = getChatData();
        const sources = [
            ['follow', chatData.followers, () => ''],
            ['sub', chatData.subscribers, item => item.membership || item.event || ''],
            ['gift', chatData.giftSubs, item => (item.recipient ? `→ ${item.recipient}` : '')],
            ['bits', chatData.bits, item => item.amount || ''],
            ['donation', chatData.donations, item => item.amount || ''],
            ['raid', chatData.raids, item => (item.viewers ? `${item.viewers} viewers` : '')]
        ];
        const events = [];
        for (const [type, items, detail] of sources) {
            (items || []).slice(-limit).forEach((item, index) => events.push({
                type,
                user: item.chatname || item.gifter || '',
                detail: String(detail(item) || ''),
                timestamp: Number(item.timestamp) || 0,
                order: index
            }));
        }
        return events.sort((a, b) => b.timestamp - a.timestamp || b.order - a.order).slice(0, limit);
    }

    function buildGoalMetrics() {
        const chatData = getChatData();
        const viewers = getViewerSummary();
        return {
            viewers,
            session: {
                followers: (chatData.followers || []).length,
                subscribers: (chatData.subscribers || []).length,
                gift_subs: getSessionGiftSubTotal(),
                bits: getSessionBitsTotal(),
                donations: getSessionDonationTotal()
            },
            persistent: {
                followers: getCurrentFollowerTotal(),
                subscribers: getCurrentSubscriberTotal(),
                gift_subs: getLifetimeGiftSubTotal(),
                bits: getLifetimeBitsTotal(),
                donations: getLifetimeDonationTotal()
            }
        };
    }

    function computeGoalItemState(item, metrics) {
        const normalized = normalizeGoalItem(item, 0, new Set());
        let progress = 0;
        let rawValue = 0;
        let metricLabel = GOAL_TYPE_LABELS[normalized.type] || 'Goal';
        let tracking = normalized.tracking;

        if (normalized.type === 'viewers') {
            tracking = 'session';
            rawValue = normalized.viewer_mode === 'peak' ? metrics.viewers.peak : metrics.viewers.current;
            progress = rawValue;
            metricLabel = normalized.viewer_mode === 'peak' ? 'Peak Viewers' : 'Current Viewers';
        } else if (normalized.type === 'community') {
            const currentMetrics = buildCommunityMetricSnapshot(metrics, tracking);
            rawValue = computeCommunityPoints(currentMetrics, normalized.weights);
            if (tracking === 'session') {
                progress = rawValue;
            } else {
                const diffMetrics = {
                    followers: Math.max(0, currentMetrics.followers - normalized.baseline_metrics.followers),
                    subscribers: Math.max(0, currentMetrics.subscribers - normalized.baseline_metrics.subscribers),
                    gift_subs: Math.max(0, currentMetrics.gift_subs - normalized.baseline_metrics.gift_subs),
                    bits: Math.max(0, currentMetrics.bits - normalized.baseline_metrics.bits),
                    donations: Math.max(0, currentMetrics.donations - normalized.baseline_metrics.donations)
                };
                progress = computeCommunityPoints(diffMetrics, normalized.weights);
            }
            metricLabel = 'Community Points';
        } else {
            rawValue = tracking === 'session' ? metrics.session[normalized.type] : metrics.persistent[normalized.type];
            progress = tracking === 'session' ? rawValue : Math.max(0, rawValue - normalized.baseline);
        }

        const complete = normalized.target > 0 && progress >= normalized.target;
        const remaining = Math.max(0, Number((normalized.target - progress).toFixed(2)));
        const percent = normalized.target > 0 ? Math.min(100, Number(((progress / normalized.target) * 100).toFixed(1))) : 0;

        return {
            ...normalized,
            tracking,
            metric_label: metricLabel,
            unit: normalized.type === 'donations' ? 'usd' : 'count',
            raw_value: Number(rawValue.toFixed ? rawValue.toFixed(2) : rawValue),
            progress: Number(progress.toFixed ? progress.toFixed(2) : progress),
            remaining,
            percent,
            complete
        };
    }

    function buildGoalsSnapshot() {
        const config = getConfig();
        const settings = normalizeGoalsConfig(config.goals || DEFAULT_GOALS_CONFIG);
        const metrics = buildGoalMetrics();
        const items = settings.items.map(item => computeGoalItemState(item, metrics));
        const enabledItems = items.filter(item => item.enabled);
        return {
            settings,
            items,
            summary: {
                total: items.length,
                enabled: enabledItems.length,
                completed: enabledItems.filter(item => item.complete).length
            },
            metrics
        };
    }

    const alertGoalState = new Map();
    function checkGoalAlerts() {
        try {
            const items = buildGoalsSnapshot().items;
            const first = alertGoalState.size === 0;
            items.forEach(item => {
                const was = alertGoalState.get(item.id);
                alertGoalState.set(item.id, !!item.complete);
                if (!first && was === false && item.complete && item.enabled) {
                    if (typeof onGoalAlert === 'function') {
                        onGoalAlert({
                            type: 'goal',
                            goalId: item.id,
                            name: item.label || item.title || item.id,
                            user: item.label || item.title || item.id,
                            amount: item.target || 0,
                            dedupeMs: 0
                        });
                    }
                }
            });
        } catch { /* goals unavailable */ }
    }

    function resetGoalBaseline(goalId) {
        const snapshot = buildGoalsSnapshot();
        const goal = snapshot.items.find(item => item.id === goalId);
        if (!goal) throw new Error('Goal not found');
        if (goal.type === 'viewers') throw new Error('Viewer goals use live/session values and do not support baseline reset');
        if (goal.tracking === 'session') throw new Error('Session goals reset when you start a new session');

        if (typeof saveRuntimeConfigSection === 'function') {
            saveRuntimeConfigSection(current => {
                const settings = normalizeGoalsConfig(current.goals || DEFAULT_GOALS_CONFIG);
                current.goals = settings;
                const target = current.goals.items.find(item => sanitizeGoalId(item.id) === goalId);
                if (!target) throw new Error('Goal not found');
                if (goal.type === 'community') {
                    target.baseline_metrics = buildCommunityMetricSnapshot(snapshot.metrics, 'persistent');
                } else {
                    target.baseline = goal.raw_value;
                }
            });
        }

        return buildGoalsSnapshot();
    }

    function toggleGoalEnabled(goalId, mode = 'toggle') {
        if (typeof saveRuntimeConfigSection === 'function') {
            saveRuntimeConfigSection(current => {
                const settings = normalizeGoalsConfig(current.goals || DEFAULT_GOALS_CONFIG);
                current.goals = settings;
                const target = current.goals.items.find(item => sanitizeGoalId(item.id) === goalId);
                if (!target) throw new Error('Goal not found');
                if (mode === 'on' || mode === 'enable' || mode === 'true') target.enabled = true;
                else if (mode === 'off' || mode === 'disable' || mode === 'false') target.enabled = false;
                else target.enabled = target.enabled === false;
            });
        }

        return buildGoalsSnapshot();
    }

    return {
        buildRecentEvents,
        buildGoalMetrics,
        computeGoalItemState,
        buildGoalsSnapshot,
        checkGoalAlerts,
        resetGoalBaseline,
        toggleGoalEnabled
    };
}

module.exports = {
    createGoalsService,
    GOAL_TYPE_LABELS,
    GOAL_TYPES,
    GOAL_TRACKING_TYPES,
    GOAL_VIEWER_MODES,
    DEFAULT_COMMUNITY_WEIGHTS,
    DEFAULT_GOALS_CONFIG,
    sanitizeGoalId,
    normalizeGoalWeights,
    normalizeCommunityBaseline,
    normalizeGoalItem,
    normalizeGoalsConfig,
    computeCommunityPoints
};
