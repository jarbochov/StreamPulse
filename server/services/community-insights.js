const fs = require('fs');
const path = require('path');
const readline = require('readline');

const nameKey = value => String(value || '').trim().replace(/^@/, '').toLowerCase();
const dictionary = value => Object.assign(Object.create(null), value || {});
const emptyIndex = () => ({ version: 1, complete: false, people: dictionary(), tags: dictionary(), streams: dictionary(), emoteImages: dictionary(), announcements: dictionary() });
function emoteImageUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
        const url = new URL(value.replace(/&amp;/g, '&'));
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
}

function createCommunityInsights({
    dataDir, sessionsDir, chatLogPath, getConfig, getChatData, getArchivedSessions,
    sessionFilename, flushChatLog, filterRecords, isExcluded, isBotMessage, getBannedHashtags,
    isLive, allowSummaryFallback, safeWriteFileSync, getModerationFingerprint = () => '', onActivity = () => {}, warn = console.warn
}) {
    const file = path.join(dataDir, 'community-insights.json');
    const journalFile = path.join(dataDir, 'community-insights-events.jsonl');
    let index = emptyIndex();
    let phase = 'off';
    let error = '';
    let generation = 0;
    let buffer = [];
    let saveTimer = null;
    let retryTimer = null;
    let running = false;
    let progress = { completed: 0, total: 0 };
    let followersCache = { signature: '', records: new Map(), checkAt: 0 };
    let journalPending = [];
    const recordedStreams = new Set();

    const enabled = () => running && getConfig().community_insights_enabled === true;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = null;
        flushJournal();
        safeWriteFileSync(file, JSON.stringify(index));
    }
    function flushJournal() {
        if (!journalPending.length) return;
        fs.mkdirSync(dataDir, { recursive: true });
        fs.appendFileSync(journalFile, `${journalPending.map(record => JSON.stringify(record)).join('\n')}\n`);
        journalPending = [];
    }
    function scheduleSave() {
        if (saveTimer) return;
        saveTimer = setTimeout(() => {
            try { save(); } catch (err) { warn(`[Community] Save failed: ${err.message}`); }
        }, 5000);
        saveTimer.unref?.();
    }
    function person(target, key) {
        if (!Object.hasOwn(target.people, key)) {
            target.people[key] = { hashtags: dictionary(), emotes: dictionary(), streams: dictionary(), lastActivity: 0, lastReturn: null };
        }
        return target.people[key];
    }
    function streamId(session) {
        const start = session?.viewerStats?.streamStartedAt || session?.startedAt;
        const timestamp = Date.parse(start || '');
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
    }
    function addStream(target, session) {
        const id = streamId(session);
        if (id) target.streams[id] = { startedAt: id };
        return id;
    }
    function sessionWindows(session, current = false) {
        const stats = session?.viewerStats || {};
        const samples = (Array.isArray(stats.samples) ? stats.samples : [])
            .map(sample => ({ at: Date.parse(sample.ts || ''), live: sample.live }))
            .filter(sample => Number.isFinite(sample.at) && typeof sample.live === 'boolean')
            .sort((a, b) => a.at - b.at);
        const windows = [];
        for (const sample of samples) {
            const last = windows.at(-1);
            if (sample.live && (!last || Number.isFinite(last.end))) windows.push({ start: sample.at, end: Infinity });
            else if (!sample.live && last && !Number.isFinite(last.end)) last.end = sample.at;
        }
        const knownStart = Date.parse(stats.streamStartedAt || '');
        const knownEnd = Date.parse(stats.streamEndedAt || '');
        if (Number.isFinite(knownStart)) {
            let first = windows.findIndex(window => window.end > knownStart);
            if (first === -1) {
                windows.push({ start: knownStart, end: Number.isFinite(knownEnd) && knownEnd > knownStart ? knownEnd : Infinity });
                first = windows.length - 1;
            } else if (knownStart < windows[first].start) {
                windows[first].start = knownStart;
            }
            for (let i = first; i < windows.length; i++) windows[i].id = new Date(knownStart).toISOString();
            if (Number.isFinite(knownEnd) && knownEnd > knownStart && windows.length) {
                windows[windows.length - 1].end = Math.min(windows[windows.length - 1].end, knownEnd);
            }
        }
        if (!windows.length && (!current || stats.live === true)) {
            const fallback = Date.parse(session?.startedAt || '');
            if (Number.isFinite(fallback)) windows.push({ start: -Infinity, end: Infinity, id: new Date(fallback).toISOString() });
        }
        for (const window of windows) window.id ||= new Date(window.start).toISOString();
        return windows;
    }
    function validRecord(record) {
        const key = nameKey(record?.user);
        const ts = Number(record?.ts);
        return key && Number.isFinite(ts) && ts > 0 && ts <= 8640000000000000 && !record.event && !record.donation && !isExcluded(key)
            && filterRecords([record]).length === 1 && !isBotMessage(record.message || '');
    }
    function extract(record) {
        if (record.derived === true) return {
            hashtags: Array.isArray(record.hashtags) ? record.hashtags.filter(tag => typeof tag === 'string') : [],
            emotes: Array.isArray(record.emotes) ? record.emotes.flatMap(emote => {
                if (typeof emote === 'string') return [{ name: emote, imageUrl: '' }];
                return emote && typeof emote.name === 'string' ? [{ name: emote.name, imageUrl: emoteImageUrl(emote.imageUrl) }] : [];
            }) : []
        };
        const config = getConfig();
        const maxLength = Math.max(10, Math.min(100, Number(config.hashtag_max_length) || 50));
        let hashtags = [];
        if (config.hashtags_enabled !== false) {
            const text = String(record.messageHtml || record.message || '')
                .replace(/<i><small>.*?<\/small><\/i>\s*/gi, '').replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '');
            hashtags = (text.match(/#[a-zA-Z]\w{1,}/g) || []).map(tag => tag.toLowerCase()).filter(tag => tag.length <= maxLength);
        }
        const emotes = [];
        for (const match of String(record.contentImage ? '' : record.messageHtml || '').matchAll(/<img\b[^>]*>/gi)) {
            const tag = match[0];
            const alt = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2];
            const src = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
            if (alt && src) emotes.push({ name: alt, imageUrl: emoteImageUrl(src) });
        }
        return { hashtags, emotes };
    }
    function applyRecord(target, record, stream, live) {
        if (!validRecord(record)) return null;
        const key = nameKey(record.user);
        const entry = person(target, key);
        const oldStreams = Object.keys(entry.streams).length;
        if (live && stream) entry.streams[stream] = true;
        const ts = Number(record.ts);
        if (target.activityDays && Number.isFinite(ts)) {
            const days = target.activityDays.get(key) || new Map();
            const day = new Date(ts).toISOString().slice(0, 10);
            const span = days.get(day);
            days.set(day, span ? { first: Math.min(span.first, ts), last: Math.max(span.last, ts) } : { first: ts, last: ts });
            target.activityDays.set(key, days);
        }
        if (Number.isFinite(ts) && ts > entry.lastActivity) {
            if (entry.lastActivity && ts - entry.lastActivity >= 86400000) {
                entry.lastReturn = { at: ts, previousAt: entry.lastActivity, absenceDays: Math.floor((ts - entry.lastActivity) / 86400000) };
            }
            entry.lastActivity = ts;
        }
        const extracted = extract(record);
        for (const tag of extracted.hashtags) {
            entry.hashtags[tag] = (entry.hashtags[tag] || 0) + 1;
            const first = target.tags[tag];
            if (Number.isFinite(ts) && (!first || ts < first.ts)) target.tags[tag] = { user: key, ts };
        }
        for (const emote of extracted.emotes) {
            entry.emotes[emote.name] = (entry.emotes[emote.name] || 0) + 1;
            if (emote.imageUrl) target.emoteImages[emote.name] = emote.imageUrl;
        }
        return { oldStreams, streams: Object.keys(entry.streams).length };
    }
    function snapshotLog(filePath, session, current = false) {
        try {
            const fd = fs.openSync(filePath, 'r');
            const stat = fs.fstatSync(fd);
            return { fd, size: stat.size, filePath, session, current, mtimeMs: stat.mtimeMs };
        } catch (err) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }
    async function readLog(target, item, token) {
        if (!item.size) { fs.closeSync(item.fd); item.fd = null; return; }
        const stream = fs.createReadStream(item.filePath, { fd: item.fd, autoClose: true, end: item.size - 1 });
        item.fd = null;
        const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
        const session = item.session || {};
        const windows = item.windows || [];
        let processed = 0;
        try {
            for await (const line of lines) {
                if (token !== generation || !enabled()) break;
                if (++processed % 500 === 0) await new Promise(resolve => setImmediate(resolve));
                let record;
                try { record = JSON.parse(line); } catch { continue; }
                if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
                if (item.journal) {
                    if (record.derivedStream === true) {
                        const timestamp = Date.parse(record.stream || '');
                        if (Number.isFinite(timestamp)) {
                            const id = new Date(timestamp).toISOString();
                            target.streams[id] = { startedAt: id };
                        }
                        continue;
                    }
                    if (record.live && record.stream) target.streams[record.stream] = { startedAt: record.stream };
                    applyRecord(target, record, record.stream, record.live === true);
                    continue;
                }
                record.session = session.filename;
                const timestamp = Number(record.ts);
                const window = windows.findLast(range => timestamp >= range.start && timestamp <= range.end);
                applyRecord(target, record, window?.id || '', Boolean(window));
            }
        } finally {
            lines.close();
            stream.destroy();
        }
        if (!item.current && !item.journal) {
            const stat = await fs.promises.stat(item.filePath);
            if (stat.size !== item.size || stat.mtimeMs !== item.mtimeMs) throw new Error('An archived chat log changed during indexing');
        }
    }
    function addFallback(target, session, id) {
        if (!id || !allowSummaryFallback()) return;
        for (const name of Object.keys(session.chatters || {})) {
            const key = nameKey(name);
            if (key && !isExcluded(key) && filterRecords([{ user: name }]).length) person(target, key).streams[id] = true;
        }
    }
    async function rebuild() {
        if (!enabled()) return;
        const token = ++generation;
        phase = 'scanning';
        error = '';
        buffer = [];
        clearTimeout(retryTimer);
        const items = [];
        try {
            index.complete = false;
            save();
            flushChatLog();
            const current = getChatData();
            const sessions = (getArchivedSessions()?.sessions || []).filter(s => s.startedAt !== current.startedAt)
                .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
            const next = emptyIndex();
            next.moderationFingerprint = getModerationFingerprint();
            Object.defineProperty(next, 'activityDays', { value: new Map(), configurable: true });
            next.announcements = dictionary(index.announcements);
            const knownLogs = new Set([sessionFilename(current.startedAt).replace(/^chat-/, 'chatlog-').replace(/\.json$/, '.jsonl')]);
            for (const session of sessions) {
                const windows = sessionWindows(session);
                for (const window of windows) next.streams[window.id] = { startedAt: window.id };
                const ids = [...new Set(windows.map(window => window.id))];
                const filename = sessionFilename(session.startedAt);
                const logName = filename.replace(/^chat-/, 'chatlog-').replace(/\.json$/, '.jsonl');
                knownLogs.add(logName);
                const logPath = path.join(sessionsDir, logName);
                items.push({ filePath: logPath, session: { ...session, filename }, windows, fallbackId: ids.length === 1 ? ids[0] : '' });
            }
            let logNames;
            try { logNames = fs.readdirSync(sessionsDir); } catch (err) {
                if (err.code !== 'ENOENT') throw err;
                logNames = [];
            }
            for (const name of logNames.filter(name => /^chatlog-.*\.jsonl$/.test(name) && !knownLogs.has(name)).sort()) {
                items.push({ filePath: path.join(sessionsDir, name), session: { filename: name.replace(/^chatlog-/, 'chat-').replace(/\.jsonl$/, '.json') } });
            }
            const currentWindows = sessionWindows(current, true);
            for (const window of currentWindows) next.streams[window.id] = { startedAt: window.id };
            const currentItem = snapshotLog(chatLogPath, { ...current, filename: sessionFilename(current.startedAt) }, true);
            if (currentItem) { currentItem.windows = currentWindows; items.push(currentItem); }
            const journal = snapshotLog(journalFile, {}, true);
            if (journal) { journal.journal = true; items.push(journal); }
            progress = { completed: 0, total: items.length };
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                if (item.fd === undefined) {
                    item = snapshotLog(item.filePath, item.session);
                    if (!item) {
                        addFallback(next, items[i].session, items[i].fallbackId);
                        progress.completed++;
                        continue;
                    }
                    item.windows = items[i].windows;
                    items[i] = item;
                }
                await readLog(next, item, token);
                if (token !== generation || !enabled()) return;
                progress.completed++;
            }
            for (const [key, days] of next.activityDays) {
                let previous = null;
                let lastReturn = null;
                for (const [, span] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
                    if (previous !== null && span.first - previous >= 86400000) {
                        lastReturn = { at: span.first, previousAt: previous, absenceDays: Math.floor((span.first - previous) / 86400000) };
                    }
                    previous = span.last;
                }
                next.people[key].lastReturn = lastReturn;
            }
            delete next.activityDays;
            index = next;
            phase = 'ready';
            for (const event of buffer) applyLive(event);
            buffer = [];
            index.complete = false;
            save();
        } catch (err) {
            if (token !== generation || !enabled()) return;
            error = err.message;
            phase = 'error';
            warn(`[Community] Historical scan failed: ${err.message}`);
            retryTimer = setTimeout(() => void rebuild(), 60000);
            retryTimer.unref?.();
        } finally {
            for (const item of items) if (item.fd !== null && item.fd !== undefined) fs.closeSync(item.fd);
        }
    }
    function applyLive(event) {
        if (event.streamOnly) {
            const id = streamId(event.session);
            if (id && !Object.hasOwn(index.streams, id)) {
                index.streams[id] = { startedAt: id };
                scheduleSave();
            }
            return;
        }
        if (event.subscription) {
            if (event.live) onActivity({ ...event.activity, kind: 'subscription' });
            return;
        }
        const id = event.live ? addStream(index, event.session) : '';
        const counts = applyRecord(index, event.record, id, event.live);
        if (counts && event.live) onActivity({ ...event.activity, ...counts, kind: 'chat', user: event.record.user, at: event.record.ts });
    }
    function accept(event) {
        if (phase === 'scanning') {
            if (buffer.length >= 10000) {
                generation++;
                phase = 'error';
                error = 'Historical scan could not keep up with incoming chat';
                buffer = [];
                retryTimer = setTimeout(() => void rebuild(), 60000);
                retryTimer.unref?.();
            } else buffer.push(event);
        } else if (phase === 'ready') {
            applyLive(event);
            scheduleSave();
        }
    }
    function record(record, activity = {}) {
        if (!enabled()) return;
        const session = getChatData();
        const event = {
            record, activity, live: isLive(),
            session: { startedAt: session.startedAt, viewerStats: { streamStartedAt: session.viewerStats?.streamStartedAt } }
        };
        if (activity.logged === false && validRecord(record)) {
            const extracted = extract(record);
            journalPending.push({
                derived: true, ts: record.ts, user: record.user, type: record.type,
                session: sessionFilename(session.startedAt), moderation: record.moderation,
                stream: event.live ? streamId(event.session) : '', live: event.live,
                hashtags: extracted.hashtags, emotes: extracted.emotes
            });
            scheduleSave();
        }
        accept(event);
    }
    function recordSubscription(activity) {
        if (enabled()) accept({ subscription: true, live: isLive(), activity });
    }
    function recordStream() {
        if (!enabled() || !isLive()) return;
        const session = getChatData();
        const snapshot = { startedAt: session.startedAt, viewerStats: { streamStartedAt: session.viewerStats?.streamStartedAt } };
        const id = streamId(snapshot);
        if (!id || recordedStreams.has(id)) return;
        recordedStreams.add(id);
        journalPending.push({ derivedStream: true, stream: id });
        scheduleSave();
        if (phase === 'ready' && Object.hasOwn(index.streams, id)) return;
        accept({ streamOnly: true, session: snapshot });
    }
    function getPerson(username) {
        if (!enabled() || phase !== 'ready') return null;
        const key = nameKey(username);
        if (!key || isExcluded(key) || !filterRecords([{ user: username }]).length) return null;
        const entry = index.people[key];
        if (!entry) return { streams: 0, streak: 0, hashtags: [], hashtagsStarted: 0, emotes: [], lastReturn: null };
        const banned = getBannedHashtags();
        const favorite = values => Object.entries(values).filter(([name]) => !banned.has(name))
            .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8);
        const ids = new Set(Object.keys(index.streams));
        if (isLive()) {
            const current = streamId(getChatData());
            if (current) ids.add(current);
        }
        const ordered = [...ids].sort().reverse();
        let streak = 0;
        for (const id of ordered) {
            if (!entry.streams[id]) break;
            streak++;
        }
        return {
            streams: Object.keys(entry.streams).length, streak,
            hashtags: favorite(entry.hashtags),
            hashtagsStarted: Object.entries(index.tags).filter(([tag, first]) => first.user === key && !banned.has(tag)).length,
            emotes: favorite(entry.emotes).map(emote => ({ ...emote, imageUrl: index.emoteImages[emote.name] || '' })),
            lastReturn: entry.lastReturn
        };
    }
    function getFollow(username) {
        if (!enabled()) return null;
        const key = nameKey(username);
        if (!key || isExcluded(key) || !filterRecords([{ user: username }]).length) return null;
        const followerFile = path.join(dataDir, 'followers.json');
        try {
            if (Date.now() >= followersCache.checkAt) {
                const stat = fs.statSync(followerFile);
                const signature = `${stat.size}:${stat.mtimeMs}:${stat.ino}`;
                if (followersCache.signature !== signature) {
                    const raw = JSON.parse(fs.readFileSync(followerFile, 'utf8'));
                    const records = new Map();
                    for (const follower of Array.isArray(raw?.data) ? raw.data : []) {
                        for (const name of [follower.user_login, follower.user_name]) {
                            const nameId = nameKey(name);
                            if (nameId && !records.has(nameId)) records.set(nameId, follower);
                        }
                    }
                    const syncedAt = Date.parse(raw?.syncedAt || '');
                    followersCache = { signature, records, syncedAt: Number.isFinite(syncedAt) ? new Date(syncedAt).toISOString() : null, checkAt: 0 };
                }
                followersCache.checkAt = Date.now() + 5000;
            }
            const match = followersCache.records.get(key);
            const timestamp = Date.parse(match?.followed_at || '');
            return Number.isFinite(timestamp) && timestamp <= Date.now()
                ? { followedAt: new Date(timestamp).toISOString(), syncedAt: followersCache.syncedAt }
                : null;
        } catch { followersCache = { signature: '', records: new Map(), checkAt: Date.now() + 5000 }; return null; }
    }
    function hasAnnounced(key) {
        return Object.hasOwn(index.announcements, key);
    }
    function markAnnounced(key) {
        if (!enabled() || phase !== 'ready' || hasAnnounced(key)) return false;
        index.announcements[key] = Date.now();
        try { save(); return true; } catch (err) {
            delete index.announcements[key];
            warn(`[Community] Could not record announcement: ${err.message}`);
            return false;
        }
    }
    function load() {
        try {
            const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (stored.version !== 1 || !stored.people || !stored.tags || !stored.streams) return false;
            index = { ...stored, people: dictionary(stored.people), tags: dictionary(stored.tags), streams: dictionary(stored.streams), emoteImages: dictionary(stored.emoteImages), announcements: dictionary(stored.announcements) };
            for (const entry of Object.values(index.people)) {
                entry.hashtags = dictionary(entry.hashtags);
                entry.emotes = dictionary(entry.emotes);
                entry.streams = dictionary(entry.streams);
            }
            return stored.complete === true && stored.moderationFingerprint === getModerationFingerprint();
        } catch { return false; }
    }
    function start({ forceRebuild = false } = {}) {
        running = true;
        if (!enabled()) { phase = 'off'; return; }
        const complete = load();
        if (complete && !forceRebuild) {
            phase = 'ready';
            index.complete = false;
            save();
        } else void rebuild();
        recordStream();
    }
    function stop() {
        generation++;
        running = false;
        clearTimeout(retryTimer);
        if (phase === 'ready') {
            index.complete = true;
            save();
        } else {
            clearTimeout(saveTimer);
            flushJournal();
        }
        phase = 'off';
        buffer = [];
    }
    function pause() {
        generation++;
        running = false;
        clearTimeout(saveTimer);
        saveTimer = null;
        clearTimeout(retryTimer);
        flushJournal();
        followersCache = { signature: '', records: new Map(), checkAt: 0 };
        recordedStreams.clear();
        phase = 'off';
        buffer = [];
    }
    function configChanged(previousEnabled) {
        if (!running) return;
        if (getConfig().community_insights_enabled !== true) {
            generation++;
            clearTimeout(saveTimer);
            clearTimeout(retryTimer);
            try { flushJournal(); } catch (err) { warn(`[Community] Journal save failed: ${err.message}`); }
            phase = 'off';
            buffer = [];
        } else if (!previousEnabled) {
            void rebuild();
            recordStream();
        }
    }
    function invalidate() {
        if (enabled()) void rebuild();
    }
    return {
        start, stop, pause, record, recordStream, recordSubscription, getPerson, getFollow, hasAnnounced, markAnnounced, configChanged, invalidate,
        flush: () => { if (phase === 'ready') save(); else flushJournal(); },
        status: () => ({ enabled: enabled(), phase, error, progress })
    };
}

module.exports = { createCommunityInsights };
