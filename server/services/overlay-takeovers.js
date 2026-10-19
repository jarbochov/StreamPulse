const PRIORITY = { alert: 4, featured: 3, 'poll-active': 2, 'poll-end': 2, command: 1 };
const keyOf = kind => kind.startsWith('poll-') ? 'poll' : kind;

function createTakeoverScheduler(onChange) {
    const entries = new Map();
    let current = null;
    let timer = null;

    function reconcile() {
        clearTimeout(timer);
        timer = null;
        const now = Date.now();
        for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key);
        const next = [...entries.values()].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind])[0] || null;
        // Only polls are resumable: restarting interrupted media or featured chat can replay stale content.
        if (current && current.key !== next?.key && current.key !== 'poll' && entries.get(current.key) === current) {
            entries.delete(current.key);
        }
        const changed = current !== next;
        current = next;
        if (entries.size) {
            const deadline = Math.min(...[...entries.values()].map(entry => entry.expiresAt));
            timer = setTimeout(reconcile, Math.max(1, deadline - now));
            timer.unref?.();
        }
        if (changed) onChange(current);
    }

    return {
        get active() { return entries.size > 0; },
        get: kind => entries.get(keyOf(kind)),
        offer(entry) {
            const key = keyOf(entry.kind);
            entries.set(key, { ...entry, key });
            reconcile();
        },
        remove(kind) {
            entries.delete(keyOf(kind));
            reconcile();
        },
        prune(keep) {
            for (const [key, entry] of entries) if (!keep(entry)) entries.delete(key);
            reconcile();
        },
        clear() {
            clearTimeout(timer);
            timer = null;
            entries.clear();
            current = null;
        }
    };
}

module.exports = { createTakeoverScheduler };
