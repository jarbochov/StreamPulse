const fs = require('fs');
const path = require('path');
const { localDateTimeStr, localDateString } = require('./session');

function createAnalyticsInsights({ sessionsDir, readChatLogFile, getCurrentChatLogEntries, getChatData, getArchivedSessions, filterRecords }) {
    const cache = new Map();

    function archiveRecords(name) {
        const file = path.join(sessionsDir, name);
        const stat = fs.statSync(file);
        const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        let cached = cache.get(name);
        if (!cached || cached.signature !== signature) {
            const session = name.replace('chatlog-', 'chat-').replace('.jsonl', '.json');
            const records = readChatLogFile(file).map(record => ({
                ts: record.ts, user: record.user, userId: record.userId, user_id: record.user_id,
                chatname: record.chatname, user_login: record.user_login, user_name: record.user_name,
                gifter: record.gifter, gifter_name: record.gifter_name, gifter_id: record.gifter_id,
                event: record.event, donation: record.donation, moderation: record.moderation, session,
                hasMessage: Boolean(record.message || record.messageHtml || record.contentImage)
            }));
            cached = { signature, records };
        }
        cache.delete(name);
        cache.set(name, cached);
        if (cache.size > 25) cache.delete(cache.keys().next().value);
        return cached.records;
    }

    function heatmap(range) {
        const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
        let total = 0;
        function add(records) {
            for (const record of filterRecords(records)) {
                if (record.event || record.donation || !(record.hasMessage ?? (record.message || record.messageHtml || record.contentImage))) continue;
                if (!record.ts) continue;
                const date = new Date(Number(record.ts));
                if (!Number.isFinite(date.getTime())) continue;
                const day = localDateString(date);
                if (range && !range.session && (day < range.from || day > range.to)) continue;
                counts[date.getDay()][date.getHours()]++;
                total++;
            }
        }

        if (!range?.session) {
            let names = [];
            try { names = fs.readdirSync(sessionsDir).filter(name => name.startsWith('chatlog-') && name.endsWith('.jsonl')); }
            catch (err) { if (err.code !== 'ENOENT') throw err; }
            const startedAt = getChatData()?.startedAt;
            let resumedLog = '';
            if (startedAt && Number.isFinite(Date.parse(startedAt))) {
                const suffix = localDateTimeStr(startedAt);
                try {
                    const archive = JSON.parse(fs.readFileSync(path.join(sessionsDir, `chat-${suffix}.json`), 'utf8'));
                    if (archive.startedAt === startedAt) resumedLog = `chatlog-${suffix}.jsonl`;
                } catch { /* No matching archived session. */ }
            }
            const present = new Set(names);
            for (const name of cache.keys()) if (!present.has(name)) cache.delete(name);
            for (const name of names) {
                if (name === resumedLog) continue;
                try { add(archiveRecords(name)); }
                catch (err) { if (err.code !== 'ENOENT') throw err; }
            }
        }
        const startedAt = getChatData()?.startedAt;
        const currentSession = startedAt && Number.isFinite(Date.parse(startedAt))
            ? `chat-${localDateTimeStr(startedAt)}.json` : '';
        add(getCurrentChatLogEntries().map(record => record.session || !currentSession
            ? record : { ...record, session: currentSession }));
        const viewerSums = Array.from({ length: 7 }, () => Array(24).fill(0));
        const viewerSamples = Array.from({ length: 7 }, () => Array(24).fill(0));
        const current = getChatData();
        const archives = range?.session ? [] : getArchivedSessions().sessions;
        const sessions = archives.filter(data => !current?.startedAt || data.startedAt !== current.startedAt);
        sessions.push(current);
        for (const data of sessions) {
            for (const sample of data?.viewerStats?.samples || []) {
                if (sample.live === false || !sample.ts || sample.count == null) continue;
                const date = new Date(sample.ts);
                const count = Number(sample.count);
                if (!Number.isFinite(date.getTime()) || !Number.isFinite(count) || count < 0) continue;
                const day = localDateString(date);
                if (range && !range.session && (day < range.from || day > range.to)) continue;
                viewerSums[date.getDay()][date.getHours()] += count;
                viewerSamples[date.getDay()][date.getHours()]++;
            }
        }
        const viewers = viewerSums.map((hours, day) => hours.map((sum, hour) =>
            viewerSamples[day][hour] ? Number((sum / viewerSamples[day][hour]).toFixed(1)) : null));
        return { counts, total, viewers, viewerSamples, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }

    return { heatmap };
}

module.exports = { createAnalyticsInsights };
