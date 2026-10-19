// Timers belong to a single spin, including nested deck and suspense callbacks.
export function createAnimationScope() {
    const timers = new Set();
    const frames = new Set();
    let cancelled = false;
    return {
        setTimeout(callback, delay) {
            if (cancelled) return;
            const id = window.setTimeout(() => {
                timers.delete(id);
                if (!cancelled) callback();
            }, delay);
            timers.add(id);
            return id;
        },
        requestAnimationFrame(callback) {
            if (cancelled) return;
            const id = window.requestAnimationFrame(now => {
                frames.delete(id);
                if (!cancelled) callback(now);
            });
            frames.add(id);
            return id;
        },
        cancel() {
            cancelled = true;
            timers.forEach(id => window.clearTimeout(id));
            frames.forEach(id => window.cancelAnimationFrame(id));
            timers.clear();
            frames.clear();
        }
    };
}
