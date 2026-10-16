const fs = require('fs');
const path = require('path');
function sanitizeOverlayId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const GAME_PLAN_STATUSES = ['tonight', 'scheduled', 'up-next', 'backlog', 'played'];
const DEFAULT_TIERS = [['S', '#ff7f7f'], ['A', '#ffbf7f'], ['B', '#ffdf7f'], ['C', '#bfff7f'], ['D', '#7fbfff'], ['F', '#bf9fff']].map(([id, color]) => ({ id, label: id, color }));

function normalizeGamePlan(input) {
    const lists = [];
    for (const entry of (Array.isArray(input?.lists) ? input.lists : []).slice(0, 20)) {
        const id = /^list-[a-z0-9-]{1,40}$/.test(entry?.id || '') ? entry.id : '';
        const name = String(entry?.name || '').trim().slice(0, 40);
        if (id && name && !lists.some(list => list.id === id)) lists.push({ id, name });
    }
    const cleanTiers = value => {
        const out = [];
        for (const entry of (Array.isArray(value) ? value : []).slice(0, 12)) {
            const id = /^[A-Za-z0-9-]{1,24}$/.test(entry?.id || '') ? entry.id : '';
            const label = String(entry?.label || '').trim().slice(0, 24);
            const color = /^#[0-9a-f]{6}$/i.test(entry?.color || '') ? entry.color : '#b0b0b0';
            if (id && label && !out.some(tier => tier.id === id)) out.push({ id, label, color });
        }
        return out;
    };
    // `tiers` is the default tier set; each list can have its own in `tierSets`.
    let tiers = cleanTiers(input?.tiers);
    if (!tiers.length && !Array.isArray(input?.tiers)) tiers = DEFAULT_TIERS.map(tier => ({ ...tier }));
    const validStatus = status => GAME_PLAN_STATUSES.includes(status) || lists.some(list => list.id === status);
    const tierSets = {};
    for (const [key, value] of Object.entries(input?.tierSets && typeof input.tierSets === 'object' ? input.tierSets : {})) {
        if (validStatus(key) && Array.isArray(value)) tierSets[key] = cleanTiers(value);
    }
    const tiersFor = status => tierSets[status] || tiers;
    const items = (Array.isArray(input?.items) ? input.items : []).slice(0, 300).map((item, index) => ({
        id: sanitizeOverlayId(item?.id) || `game-${Date.now().toString(36)}-${index}`,
        name: String(item?.name || '').trim().slice(0, 120),
        status: validStatus(item?.status) ? item.status : 'backlog',
        gameType: ['playthrough', 'one-off'].includes(item?.gameType) ? item.gameType : 'playthrough',
        streamDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.streamDate || '')) ? item.streamDate : '',
        streamTime: /^\d{2}:\d{2}$/.test(String(item?.streamTime || '')) ? item.streamTime : '',
        streamDuration: Number.isFinite(Number(item?.streamDuration)) && Number(item?.streamDuration) >= 30 ? Math.min(1380, Math.round(Number(item.streamDuration))) : 180,
        streamRecurring: item?.streamRecurring === true,
        streamDates: Array.isArray(item?.streamDates)
            ? item.streamDates.map(d => {
                if (typeof d === 'string') return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '', time: '', segmentId: '' };
                const dateStr = String(d?.date || '').trim();
                return {
                    date: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : '',
                    time: /^\d{2}:\d{2}$/.test(String(d?.time || '')) ? d.time : '',
                    segmentId: String(d?.segmentId || '').trim().slice(0, 100)
                };
            }).filter(d => Boolean(d.date || d.time)).slice(0, 30)
            : [],
        twitchSegmentId: String(item?.twitchSegmentId || '').trim().slice(0, 100),
        twitchSegmentIds: Array.isArray(item?.twitchSegmentIds)
            ? item.twitchSegmentIds.map(s => String(s || '').trim()).filter(Boolean).slice(0, 30)
            : (item?.twitchSegmentId ? [String(item.twitchSegmentId).trim()] : []),
        period: String(item?.period || '').trim().slice(0, 40),
        note: String(item?.note || '').trim().slice(0, 200),
        twitchCategory: String(item?.twitchCategory || '').trim().slice(0, 120),
        igdbId: /^\d{1,9}$/.test(String(item?.igdbId || '')) ? String(item.igdbId) : '',
        custom: item?.custom === true,
        customCover: /^(https?:\/\/|\/custom-overlay-assets\/)[^\s"'<>]{1,500}$/i.test(String(item?.customCover || '').trim()) ? String(item.customCover).trim() : '',
        rating: Math.max(0, Math.min(5, Math.round((Number(item?.rating) || 0) * 2) / 2)),
        tier: tiersFor(validStatus(item?.status) ? item.status : 'backlog').some(tier => tier.id === item?.tier) ? item.tier : '',
        tags: [...new Set((Array.isArray(item?.tags) ? item.tags : []).map(tag => String(tag || '').trim().slice(0, 24)).filter(Boolean))].slice(0, 8),
        finished: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.finished || '')) ? item.finished : '',
        played: [...new Set((Array.isArray(item?.played) ? item.played : []).map(String).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort().slice(-400),
        autoAdded: item?.autoAdded === true,
        system: String(item?.system || '').trim().slice(0, 40),
        // Custom lists are not exclusive: a game can also belong to others besides its main list.
        extraLists: [...new Set((Array.isArray(item?.extraLists) ? item.extraLists : []).filter(id => lists.some(list => list.id === id) && id !== item?.status))]
    })).filter(item => item.name);
    const used = [...new Set(items.map(item => item.period).filter(Boolean))];
    const saved = (Array.isArray(input?.periods) ? input.periods : []).map(value => String(value || '').trim().slice(0, 40)).filter(value => used.includes(value));
    const periods = [...new Set([...saved, ...used])].slice(0, 40);
    const playingNowId = typeof input?.playingNowId === 'string' ? sanitizeOverlayId(input.playingNowId) : '';
    return { lists, tiers, tierSets, items, periods, playingNowId };
}

const gameKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const GENERIC_TWITCH_CATEGORIES = new Set(['justchatting', 'specialevents', 'gamesdemos', 'retro', 'art', 'music', 'talkshowspodcasts', 'makerscrafting', 'none']);

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
                const catKey = gameKey(item.twitchCategory);
                const includeCatKey = catKey && !GENERIC_TWITCH_CATEGORIES.has(catKey) && !item.custom;
                const keys = [item.name, includeCatKey ? item.twitchCategory : '', raw?.igdbName].map(gameKey).filter(Boolean);
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

    function advance({ markPlayed = true } = {}) {
        const plan = loadGamePlan();
        const today = new Date().toISOString().slice(0, 10);
        const streamInfo = getStreamInfo() || [];
        const currentCategory = streamInfo[streamInfo.length - 1]?.category || '';
        const currentItem = plan.items.find(i => i.id === plan.playingNowId) ||
            plan.items.find(i => !i.custom && gameKey(i.name) === gameKey(currentCategory));

        if (currentItem) {
            if (!currentItem.played) currentItem.played = [];
            if (!currentItem.played.includes(today)) currentItem.played.push(today);

            const isOneOff = currentItem.gameType === 'one-off';
            if (markPlayed && (isOneOff || currentItem.status === 'tonight' || currentItem.status === 'scheduled')) {
                if (isOneOff) {
                    currentItem.status = 'played';
                    currentItem.finished = today;
                }
            }
        }

        const nextItem = plan.items.find(i => i.status === 'tonight' && (!currentItem || i.id !== currentItem.id))
            || plan.items.find(i => i.status === 'scheduled' && (!currentItem || i.id !== currentItem.id));
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
