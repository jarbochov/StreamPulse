const fs = require('fs');
const path = require('path');

const USER_MAPS = new Set(['chatters', 'sessionChatters', 'subscribers', 'followers', 'giftSubs', 'bits', 'donations', 'raids', 'subTenure']);
const login = value => String(value || '').trim().replace(/^@/, '').toLowerCase();

function createUserModerationService({
    dataDir, getConfig = () => ({}), getBroadcasterId = () => '',
    ensureToken = async () => false, getTokenScopes = () => [],
    request = async () => ({}), safeWriteFileSync = fs.writeFileSync,
    isDeleted = () => false,
    onChange = () => {}
}) {
    const file = path.join(dataDir, 'twitch-bans.json');
    let cache = { broadcasterId: '', users: [], lastSyncAt: null };
    function loadCache() {
        try {
            const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (stored && Array.isArray(stored.users) && stored.users.every(user => user && typeof user.id === 'string' && typeof user.login === 'string')) cache = stored;
        } catch {}
    }
    loadCache();
    let error = '';
    let inFlight = null;
    let events = [];
    let timer = null;
    let running = false;
    let generation = 0;
    const enabled = () => getConfig().twitch_ban_sync?.enabled === true;
    const empty = [];
    const synced = () => enabled() && cache.broadcasterId === getBroadcasterId() ? cache.users : empty;
    let manualRef, syncedRef, names = new Set(), ids = new Set();
    function refreshIndex() {
        const manual = getConfig().banned_users || empty;
        const users = synced();
        if (manual === manualRef && users === syncedRef) return;
        manualRef = manual;
        syncedRef = users;
        names = new Set([...manual.map(login), ...users.flatMap(u => [login(u.login), login(u.name)])].filter(Boolean));
        ids = new Set(users.map(u => String(u.id)));
    }
    const bannedNames = () => { refreshIndex(); return [...names]; };
    const isBanned = (value, id) => { refreshIndex(); return names.has(login(value)) || !!id && ids.has(String(id)); };
    const blocked = record => record && typeof record === 'object' && (
        isBanned(record.user || record.chatname || record.user_login || record.user_name,
            record.userId || record.user_id || (record.moderation?.platform === 'twitch' ? record.moderation.userId : ''))
        || isBanned(record.gifter_name || record.gifter, record.gifter_id)
    );

    function filterRecords(records = []) {
        return records.filter(record => !blocked(record) && !isDeleted(record));
    }

    function filterData(data) {
        if (!data || typeof data !== 'object') return data;
        if (Array.isArray(data)) return filterRecords(data).map(filterData);
        const result = { ...data };
        for (const [key, value] of Object.entries(data)) {
            if (USER_MAPS.has(key) && value && !Array.isArray(value) && typeof value === 'object') {
                result[key] = Object.fromEntries(Object.entries(value).filter(([name, entry]) => !isBanned(name) && !blocked(entry)));
            } else if (['emotes', 'hashtags'].includes(key) && value && !Array.isArray(value) && typeof value === 'object') {
                result[key] = Object.fromEntries(Object.entries(value).map(([name, entry]) => [name,
                    entry && Array.isArray(entry.users) ? { ...entry, users: entry.users.filter(user => !isBanned(user)) } : entry]));
            } else if (Array.isArray(value)) {
                result[key] = filterRecords(value).map(filterData);
            }
        }
        if (data.chatters && typeof data.messageCount === 'number') {
            const removed = Object.entries(data.chatters).filter(([name, entry]) => isBanned(name) || blocked(entry))
                .reduce((sum, [, entry]) => sum + (Number(entry?.messageCount) || 0), 0);
            result.messageCount = Math.max(0, data.messageCount - removed);
        }
        return result;
    }

    function persist(next) {
        safeWriteFileSync(file, JSON.stringify(next, null, 2));
        cache = next;
        onChange();
    }

    function applyEvent(users, event) {
        const next = users.filter(u => u.id !== event.id && u.login !== event.login);
        if (event.permanent) next.push({ id: event.id, login: event.login, name: event.name });
        return next;
    }

    function onModerationEvent(event) {
        if (!enabled() || !event.id || !event.login || event.broadcasterId && event.broadcasterId !== getBroadcasterId()) return;
        const normalized = { ...event, login: login(event.login), broadcasterId: getBroadcasterId() };
        if (inFlight) events.push(normalized);
        const users = applyEvent(synced(), normalized);
        try {
            persist({ broadcasterId: normalized.broadcasterId, users, lastSyncAt: cache.broadcasterId === normalized.broadcasterId ? cache.lastSyncAt : null });
        } catch (err) { error = err.message; }
    }

    function status() {
        const scopes = getTokenScopes();
        return {
            enabled: enabled(), users: synced(), count: synced().length,
            lastSyncAt: cache.broadcasterId === getBroadcasterId() ? cache.lastSyncAt : null,
            syncing: !!inFlight, error,
            liveUpdates: scopes.includes('channel:moderate'),
            scopeReady: scopes.includes('moderation:read') || scopes.includes('moderator:manage:banned_users')
        };
    }

    function sync() {
        if (inFlight) return inFlight;
        events = [];
        const syncGeneration = generation;
        inFlight = (async () => {
            try {
                if (!enabled()) throw new Error('Enable Twitch ban syncing and save System Config first.');
                if (!await ensureToken()) throw new Error('Connect Twitch before syncing banned users.');
                const broadcasterId = getBroadcasterId();
                if (!broadcasterId) throw new Error('Twitch broadcaster is not configured.');
                if (!status().scopeReady) throw new Error('Reconnect Twitch to grant moderation:read.');
                let users = [];
                let after = '';
                const cursors = new Set();
                do {
                    const result = await request('/moderation/banned', { broadcaster_id: broadcasterId, first: 100, ...(after ? { after } : {}) });
                    if (result.status !== 200) throw new Error(result.body?.message || `Twitch returned ${result.status}`);
                    if (!Array.isArray(result.body?.data)) throw new Error('Invalid banned users response from Twitch.');
                    if (result.body.data.some(user => !user || typeof user.user_id !== 'string' || !user.user_login || typeof user.expires_at !== 'string')) throw new Error('Incomplete banned user record from Twitch.');
                    users.push(...result.body.data.filter(u => u.expires_at === '').map(u => ({ id: u.user_id, login: login(u.user_login), name: u.user_name })));
                    after = result.body.pagination?.cursor || '';
                    if (after && cursors.has(after)) throw new Error('Twitch returned a repeated pagination cursor.');
                    cursors.add(after);
                } while (after);
                if (syncGeneration !== generation || !enabled() || broadcasterId !== getBroadcasterId()) throw new Error('Ban sync settings changed during sync; results were not applied.');
                for (const event of events.filter(e => e.broadcasterId === broadcasterId)) users = applyEvent(users, event);
                users = [...new Map(users.filter(u => u.id && u.login).map(u => [u.id, u])).values()];
                persist({ broadcasterId, users, lastSyncAt: new Date().toISOString() });
                error = '';
            } catch (err) { error = err.message; }
        })().finally(() => { inFlight = null; events = []; }).then(status);
        return inFlight;
    }

    function start() {
        running = true;
        if (!timer) {
            timer = setInterval(() => { if (enabled()) void sync(); }, 10 * 60 * 1000);
            timer.unref?.();
        }
        if (enabled()) void sync();
    }
    function stop() { generation++; running = false; clearInterval(timer); timer = null; }
    function configChanged() {
        generation++;
        onChange();
        if (running && enabled()) {
            if (inFlight) void inFlight.then(() => { if (running && enabled()) void sync(); });
            else void sync();
        }
    }
    function reload() { loadCache(); configChanged(); }
    return { sync, status, start, stop, reload, configChanged, onModerationEvent, bannedNames, isBanned, filterRecords, filterData };
}

module.exports = { createUserModerationService };
