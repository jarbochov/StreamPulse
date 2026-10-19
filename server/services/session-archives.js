const fs = require('fs');
const path = require('path');

// Keep only aggregation inputs, not message HTML, avatars, emotes, or other archive payloads.
function summarizeSession(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a session object');
    return {
        startedAt: data.startedAt,
        lastUpdated: data.lastUpdated,
        category: data.category,
        streamInfo: (data.streamInfo || []).map(({ category, changedAt, endedAt }) => ({ category, changedAt, endedAt })),
        viewerStats: {
            streamStartedAt: data.viewerStats?.streamStartedAt,
            streamEndedAt: data.viewerStats?.streamEndedAt,
            samples: (data.viewerStats?.samples || []).map(({ live, ts }) => ({ live, ts }))
        },
        chatters: Object.fromEntries(Object.entries(data.chatters || {}).map(([name, chatter]) => [name, { messageCount: chatter?.messageCount }]))
    };
}

function createSessionArchiveCache({ sessionsDir, warn = console.warn }) {
    const entries = new Map();
    let snapshot = { revision: 0, sessions: [] };
    let nextScanAt = 0;
    let dirty = false;

    function invalidate(filename) {
        if (filename) entries.delete(filename);
        else entries.clear();
        dirty = true;
        nextScanAt = 0;
    }

    function getSnapshot() {
        const now = Date.now();
        if (now < nextScanAt) return snapshot;
        let files;
        try {
            files = fs.readdirSync(sessionsDir).filter(name => name.startsWith('chat-') && name.endsWith('.json'));
        } catch (err) {
            if (err.code !== 'ENOENT') {
                warn('[Sessions] Could not scan archives:', err.message);
                throw err;
            }
            files = [];
        }
        const present = new Set(files);
        let changed = dirty;
        for (const name of entries.keys()) {
            if (!present.has(name)) {
                entries.delete(name);
                changed = true;
            }
        }
        for (const filename of files) {
            const filePath = path.join(sessionsDir, filename);
            let signature;
            try {
                const stat = fs.statSync(filePath);
                signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
                if (entries.get(filename)?.signature === signature) continue;
                const summary = summarizeSession(JSON.parse(fs.readFileSync(filePath, 'utf8')));
                entries.set(filename, { signature, summary });
                changed = true;
            } catch (err) {
                warn(`[Sessions] Could not read archive ${filename}:`, err.message);
                // Retry I/O failures next scan, but do not parse the same malformed file repeatedly.
                if (signature && !err.code) entries.set(filename, { signature, summary: null });
                else entries.delete(filename);
                changed = true;
            }
        }
        if (changed) {
            snapshot = { revision: snapshot.revision + 1, sessions: [...entries.values()].map(entry => entry.summary).filter(Boolean) };
        }
        dirty = false;
        nextScanAt = now + 10000;
        return snapshot;
    }

    return { getSnapshot, invalidate };
}

module.exports = { createSessionArchiveCache };
