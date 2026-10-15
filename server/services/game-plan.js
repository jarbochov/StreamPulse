const fs = require('fs');
const path = require('path');
const {
    GAME_PLAN_STATUSES,
    DEFAULT_TIERS,
    normalizeGamePlan,
    gameKey,
    sanitizeOverlayId
} = require('../game-plan');

function createGamePlanService({
    dataDir,
    safeWriteFileSync = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
    broadcastToOverlays = () => {},
    getConfig = () => ({}),
    getStreamInfo = () => [],
    getViewerStats = () => ({}),
    normalizeViewerStats = (v) => v || {},
    archivedCategoryMinutes = () => ({}),
    categoryMinutesFor = () => ({}),
    categoryTimeFor = () => ({}),
    publicGameInfo = (name) => ({ name: name || '' }),
    refreshGameInfo = () => Promise.resolve(null),
    getGameInfoCached = () => null,
    GAME_INFO_VERSION = 2,
    sessionsDir = path.join(dataDir, 'sessions')
}) {
    const GAME_PLAN_PATH = path.join(dataDir, 'game-plan.json');

    function loadGamePlan() {
        try {
            return normalizeGamePlan(JSON.parse(fs.readFileSync(GAME_PLAN_PATH, 'utf8')));
        } catch {
            return { lists: [], tiers: DEFAULT_TIERS, tierSets: {}, items: [], periods: [] };
        }
    }

    function saveGamePlan(plan) {
        safeWriteFileSync(GAME_PLAN_PATH, JSON.stringify(normalizeGamePlan(plan), null, 2));
    }

    let gameWarmQueue = Promise.resolve();
    function warmGameInfo(games) {
        for (const { name, igdbId, custom } of games) {
            if (custom) continue;
            const cached = getGameInfoCached(name, igdbId);
            if (cached && !cached.failed && cached.v === GAME_INFO_VERSION && !(cached.source === 'igdb' && !cached.igdbUrl && !cached.urlTried)) continue;
            gameWarmQueue = gameWarmQueue.then(() => refreshGameInfo(name, igdbId)).then(() => new Promise(resolve => setTimeout(resolve, 300)));
        }
    }

    let playTimeCache = { at: 0, totals: {} };
    function streamedMinutesByKey() {
        if (Date.now() - playTimeCache.at > 60000) {
            const totals = {};
            for (const [name, minutes] of Object.entries(archivedCategoryMinutes())) {
                totals[gameKey(name)] = (totals[gameKey(name)] || 0) + minutes;
            }
            playTimeCache = { at: Date.now(), totals };
        }
        const floor = Date.parse(normalizeViewerStats(getViewerStats()).streamStartedAt || '');
        const merged = { ...playTimeCache.totals };
        for (const [name, minutes] of Object.entries(categoryMinutesFor(getStreamInfo(), Date.now(), floor))) {
            merged[gameKey(name)] = (merged[gameKey(name)] || 0) + minutes;
        }
        return merged;
    }

    function buildGamePlanSnapshot() {
        const plan = loadGamePlan();
        const streamed = streamedMinutesByKey();
        const streamInfo = getStreamInfo() || [];
        const category = streamInfo[streamInfo.length - 1]?.category || '';
        const current = gameKey(category);
        warmGameInfo(plan.items);
        return {
            current: category,
            playingNowId: plan.playingNowId || null,
            lists: plan.lists,
            periods: plan.periods,
            tiers: plan.tiers,
            tierSets: plan.tierSets,
            items: plan.items.map(item => {
                const game = item.custom ? { name: item.name } : publicGameInfo(item.name, item.igdbId);
                const raw = item.custom ? null : getGameInfoCached(item.name, item.igdbId);
                const keys = [item.name, item.twitchCategory, raw?.igdbName].map(gameKey).filter(Boolean);
                const isManualNow = !!plan.playingNowId && item.id === plan.playingNowId;
                const isAutoNow = !plan.playingNowId && !item.custom && !!current && keys.includes(current);
                return {
                    ...item,
                    minutesPlayed: Math.round([...new Set(keys)].reduce((sum, key) => sum + (streamed[key] || 0), 0)),
                    cover: item.customCover || game.cover || '',
                    releaseYear: game.releaseYear || '',
                    genres: game.genres || [],
                    platforms: game.platforms || [],
                    playingNow: isManualNow || isAutoNow
                };
            })
        };
    }

    async function applyPlayedSpans(spans) {
        const config = typeof getConfig === 'function' ? getConfig() : {};
        const auto = { enabled: true, min_minutes: 15, skip: ['Just Chatting'], ...(config.game_plan_auto || {}) };
        const skip = new Set((Array.isArray(auto.skip) ? auto.skip : String(auto.skip || '').split(',')).map(gameKey).filter(Boolean));
        const plan = loadGamePlan();
        const result = { added: [], updated: 0 };
        for (const { name, minutes, dates } of spans) {
            if (!name || name === '(No Category)' || minutes < Number(auto.min_minutes || 0) || skip.has(gameKey(name))) continue;
            const key = gameKey(name);
            let item = plan.items.find(entry => [entry.name, entry.twitchCategory, getGameInfoCached(entry.name, entry.igdbId)?.igdbName].map(gameKey).includes(key));
            if (!item) {
                const info = await refreshGameInfo(name);
                if (!info || info.failed || !info.igdbId) continue;
                item = {
                    id: `game-${Date.now().toString(36)}-${plan.items.length}`,
                    name,
                    status: 'played',
                    period: '',
                    note: '',
                    twitchCategory: name,
                    igdbId: String(info.igdbId),
                    custom: false,
                    customCover: '',
                    rating: 0,
                    tier: '',
                    tags: [],
                    finished: '',
                    played: [],
                    autoAdded: true
                };
                plan.items.push(item);
                result.added.push(name);
            }
            const before = (item.played || []).length;
            item.played = [...new Set([...(item.played || []), ...dates])].sort().slice(-400);
            if (item.played.length !== before && !result.added.includes(name)) result.updated++;
        }
        if (result.added.length || result.updated) saveGamePlan(plan);
        return result;
    }

    async function recordPlayedGames(streamInfo, endMs, startFloorMs) {
        const config = typeof getConfig === 'function' ? getConfig() : {};
        if ((config.game_plan_auto || {}).enabled === false) return;
        const spent = categoryTimeFor(streamInfo, endMs, startFloorMs);
        const result = await applyPlayedSpans(Object.entries(spent).map(([name, slot]) => ({ name, minutes: slot.minutes, dates: [...slot.dates] })));
        for (const name of result.added) console.log(`[GamePlan] Added "${name}" as played`);
    }

    async function backfillPlayedGames() {
        const spans = [];
        if (fs.existsSync(sessionsDir)) {
            for (const file of fs.readdirSync(sessionsDir).filter(f => f.startsWith('chat-') && f.endsWith('.json')).sort()) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                    const endMs = Date.parse(data.lastUpdated || data.startedAt);
                    const floor = Date.parse(data.viewerStats?.streamStartedAt || '');
                    for (const [name, slot] of Object.entries(categoryTimeFor(data.streamInfo, endMs, floor))) {
                        spans.push({ name, minutes: slot.minutes, dates: [...slot.dates] });
                    }
                } catch { /* skip unreadable sessions */ }
            }
        }
        return applyPlayedSpans(spans);
    }

    function setPlayingNow(id) {
        const plan = loadGamePlan();
        plan.playingNowId = typeof id === 'string' ? sanitizeOverlayId(id) : '';
        saveGamePlan(plan);
        const snapshot = buildGamePlanSnapshot();
        broadcastToOverlays('game-plan-update', snapshot);
        return snapshot;
    }

    function advance() {
        const plan = loadGamePlan();
        const today = new Date().toISOString().slice(0, 10);
        const streamInfo = getStreamInfo() || [];
        const currentCategory = streamInfo[streamInfo.length - 1]?.category || '';
        const currentItem = plan.items.find(i => i.id === plan.playingNowId) ||
            plan.items.find(i => !i.custom && gameKey(i.name) === gameKey(currentCategory));

        if (currentItem && currentItem.status === 'scheduled') {
            currentItem.status = 'played';
            currentItem.finished = today;
            if (!currentItem.played) currentItem.played = [];
            if (!currentItem.played.includes(today)) currentItem.played.push(today);
        }

        const nextItem = plan.items.find(i => i.status === 'scheduled' && (!currentItem || i.id !== currentItem.id));
        plan.playingNowId = nextItem ? nextItem.id : '';
        saveGamePlan(plan);
        const snapshot = buildGamePlanSnapshot();
        broadcastToOverlays('game-plan-update', snapshot);
        return {
            status: 'advanced',
            previous: currentItem?.name || null,
            current: nextItem?.name || null,
            snapshot
        };
    }

    function updateGamePlan(payload) {
        const plan = normalizeGamePlan(payload);
        saveGamePlan(plan);
        const snapshot = buildGamePlanSnapshot();
        broadcastToOverlays('game-plan-update', snapshot);
        return snapshot;
    }

    function gamePlanAssetUsers(name, assetReferencedIn) {
        return loadGamePlan().items.filter(item => item.customCover && assetReferencedIn(item.customCover, name, null)).map(item => ({ id: `game:${item.id}`, name: `Game plan: ${item.name}` }));
    }

    function rewriteGamePlanReferences(oldName, newName, rewriteAssetReferences) {
        const plan = loadGamePlan();
        let changed = false;
        for (const item of plan.items) {
            if (!item.customCover) continue;
            const next = rewriteAssetReferences(item.customCover, oldName, newName, null, null);
            if (next !== item.customCover) { item.customCover = next; changed = true; }
        }
        if (changed) saveGamePlan(plan);
        return changed;
    }

    return {
        loadGamePlan,
        saveGamePlan,
        buildGamePlanSnapshot,
        applyPlayedSpans,
        recordPlayedGames,
        backfillPlayedGames,
        setPlayingNow,
        advance,
        updateGamePlan,
        warmGameInfo,
        gamePlanAssetUsers,
        rewriteGamePlanReferences,
        get filePath() { return GAME_PLAN_PATH; }
    };
}

module.exports = {
    createGamePlanService,
    GAME_PLAN_STATUSES,
    DEFAULT_TIERS,
    normalizeGamePlan,
    gameKey,
    sanitizeOverlayId
};
