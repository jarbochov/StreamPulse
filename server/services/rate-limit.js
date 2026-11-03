function createRateLimiter({ getConfig = () => ({}) } = {}) {
    const rateLimitMap = new Map(); // IP -> { reads: [], mutations: [] }
    const windowMs = 60000;

    function checkRateLimit(req, res) {
        const config = getConfig();
        const rl = config.rate_limit;
        if (!rl || !rl.enabled) return false;

        const ip = req.socket?.remoteAddress || 'unknown';
        const now = Date.now();

        if (!rateLimitMap.has(ip)) {
            rateLimitMap.set(ip, { reads: [], mutations: [] });
        }
        const entry = rateLimitMap.get(ip);

        // Prune old entries
        entry.reads = entry.reads.filter(t => now - t < windowMs);
        entry.mutations = entry.mutations.filter(t => now - t < windowMs);

        const method = req.method;
        if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
            const limit = rl.mutation_per_minute || 30;
            if (entry.mutations.length >= limit) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
                res.end(JSON.stringify({ error: 'Rate limit exceeded (mutations)', retry_after: 60 }));
                return true;
            }
            entry.mutations.push(now);
        } else {
            const limit = rl.requests_per_minute || 120;
            if (entry.reads.length >= limit) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
                res.end(JSON.stringify({ error: 'Rate limit exceeded', retry_after: 60 }));
                return true;
            }
            entry.reads.push(now);
        }
        return false;
    }

    function pruneRateLimits() {
        const now = Date.now();
        for (const [ip, entry] of rateLimitMap) {
            entry.reads = entry.reads.filter(t => now - t < windowMs);
            entry.mutations = entry.mutations.filter(t => now - t < windowMs);
            if (entry.reads.length === 0 && entry.mutations.length === 0) {
                rateLimitMap.delete(ip);
            }
        }
    }

    function clear() {
        rateLimitMap.clear();
    }

    return {
        checkRateLimit,
        pruneRateLimits,
        clear
    };
}

module.exports = {
    createRateLimiter
};
