function getStreamInfoChangedAt(entry) {
    return [entry?.changedAt, entry?.time].find(value => value && Number.isFinite(Date.parse(value))) || null;
}

function getCurrentChannelInfo(data) {
    const info = data?.channelInfo || data?.streamInfo?.at(-1);
    return { title: info?.title || '', category: info?.category || '' };
}

function getSessionStreamInfo(data, { current = false } = {}) {
    const entries = (data?.streamInfo || []).filter(getStreamInfoChangedAt);
    if (entries.length && entries.every(entry => entry.live === true)) return entries;
    const ranges = [];
    let start = null;
    for (const sample of data?.viewerStats?.samples || []) {
        const ts = Date.parse(sample.ts);
        if (!Number.isFinite(ts)) continue;
        if (sample.live && start === null) start = ts;
        if (sample.live === false && start !== null) {
            ranges.push({ start, end: ts });
            start = null;
        }
    }
    if (start !== null) ranges.push({ start, end: Infinity });
    const knownStart = Date.parse(data?.viewerStats?.streamStartedAt || '');
    const knownEnd = Date.parse(data?.viewerStats?.streamEndedAt || '');
    if (Number.isFinite(knownStart)) {
        const range = ranges.findLast(range => range.end > knownStart);
        if (range) {
            range.start = knownStart;
            if (Number.isFinite(knownEnd) && knownEnd > knownStart) range.end = knownEnd;
        } else {
            ranges.push({ start: knownStart, end: Number.isFinite(knownEnd) && knownEnd > knownStart ? knownEnd : Infinity });
        }
    }
    if (!ranges.length) return current ? entries.filter(entry => entry.live === true) : entries;
    const sorted = entries.toSorted((a, b) => Date.parse(getStreamInfoChangedAt(a)) - Date.parse(getStreamInfoChangedAt(b)));
    const result = new Map();
    const add = entry => result.set(JSON.stringify([Date.parse(getStreamInfoChangedAt(entry)), entry.title, entry.category]), entry);
    sorted.filter(entry => entry.live === true).forEach(add);
    for (const range of ranges) {
        const baseline = sorted.findLast(entry => Date.parse(getStreamInfoChangedAt(entry)) <= range.start);
        const window = baseline ? [{ ...baseline, changedAt: new Date(range.start).toISOString(),
            endedAt: Date.parse(baseline.endedAt || '') > range.start ? baseline.endedAt : undefined }] : [];
        window.push(...sorted.filter(entry => {
            const ts = Date.parse(getStreamInfoChangedAt(entry));
            return ts > range.start && ts <= range.end;
        }));
        if (Number.isFinite(range.end) && window.length) {
            const last = window.at(-1);
            const end = Date.parse(last.endedAt || '');
            window[window.length - 1] = { ...last, endedAt: new Date(Number.isFinite(end) ? Math.min(end, range.end) : range.end).toISOString() };
        }
        window.forEach(add);
    }
    return [...result.values()].toSorted((a, b) => Date.parse(getStreamInfoChangedAt(a)) - Date.parse(getStreamInfoChangedAt(b)));
}

function syncLiveStreamInfo(data) {
    if (!data) return false;
    const history = data.streamInfo || (data.streamInfo = []);
    const last = history.at(-1);
    const stats = data.viewerStats || {};
    if (stats.live !== true) {
        if (last && !last.endedAt && Number.isFinite(Date.parse(stats.streamEndedAt || ''))) {
            last.endedAt = stats.streamEndedAt;
        }
        return false;
    }
    const info = getCurrentChannelInfo(data);
    if (!info.title && !info.category) return false;
    const now = new Date().toISOString();
    const start = Number.isFinite(Date.parse(stats.streamStartedAt || '')) ? stats.streamStartedAt : now;
    const lastAt = Date.parse(getStreamInfoChangedAt(last));
    const needsBaseline = !last || !Number.isFinite(lastAt) || lastAt < Date.parse(start);
    if (!needsBaseline && !last.endedAt && last.title === info.title && last.category === info.category) return false;
    history.push({ ...info, changedAt: needsBaseline ? start : now, live: true });
    if (history.length > 50) history.splice(0, history.length - 50);
    return true;
}

function createStreamInfoService({ getChatData = () => ({}) } = {}) {
    return {
        getState: () => getCurrentChannelInfo(getChatData()),
        update(info) {
            const data = getChatData();
            if (!data || !info || typeof info.title !== 'string' || typeof info.category !== 'string') return false;
            data.channelInfo = { title: info.title, category: info.category };
            return syncLiveStreamInfo(data);
        },
        syncLiveState: () => syncLiveStreamInfo(getChatData()),
        reset() {
            const data = getChatData();
            if (data) { data.channelInfo = null; data.streamInfo = []; }
        }
    };
}

module.exports = { createStreamInfoService, syncLiveStreamInfo, getCurrentChannelInfo, getSessionStreamInfo, getStreamInfoChangedAt };
