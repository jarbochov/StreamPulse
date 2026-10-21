export function snapAxis(candidates, targets, threshold) {
    let best = null;
    for (const candidate of candidates) {
        for (const target of targets) {
            const delta = target - candidate;
            if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
        }
    }
    if (best === null) return { delta: 0, lines: [] };
    const lines = new Set();
    for (const candidate of candidates) {
        for (const target of targets) {
            if (Math.abs(target - (candidate + best)) < 0.5) lines.add(target);
        }
    }
    return { delta: best, lines: [...lines] };
}

export function alignmentOffset(box, relative, mode) {
    if (mode === 'left') return { x: relative.x - box.x, y: 0 };
    if (mode === 'center') return { x: relative.x + (relative.w - box.w) / 2 - box.x, y: 0 };
    if (mode === 'right') return { x: relative.x + relative.w - box.w - box.x, y: 0 };
    if (mode === 'top') return { x: 0, y: relative.y - box.y };
    if (mode === 'middle') return { x: 0, y: relative.y + (relative.h - box.h) / 2 - box.y };
    if (mode === 'bottom') return { x: 0, y: relative.y + relative.h - box.h - box.y };
    return { x: 0, y: 0 };
}
