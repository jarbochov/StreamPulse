const TILE_VISIT_BUDGET = 16384;

// Bound work by coarsening the complete lattice, never by cropping its outer rows.
function tileCoverage(width, height, tileW, tileH, gap, cos, sin, maxScale) {
    maxScale = Math.min(8, Math.max(1, maxScale || 1));
    let lod = 1;
    while (true) {
        const stepX = Math.max(8, tileW + gap) * lod;
        const stepY = Math.max(8, tileH + gap) * lod;
        const radius = Math.hypot(tileW, tileH) * 0.55 * maxScale * lod;
        const extentX = width / 2 * Math.abs(cos) + height / 2 * Math.abs(sin) + radius;
        const extentY = width / 2 * Math.abs(sin) + height / 2 * Math.abs(cos) + radius;
        // Allow wrap, stagger and jitter to move cells into the viewport.
        const cols = Math.ceil(extentX / stepX) + 3;
        const rows = Math.ceil(extentY / stepY) + 3;
        const visits = (2 * cols + 1) * (2 * rows + 1);
        if (!Number.isFinite(visits)) return { lod: 1, stepX: 1, stepY: 1, radius: 0, cols: -1, rows: -1 };
        if (visits <= TILE_VISIT_BUDGET) return { lod, stepX, stepY, radius, cols, rows };
        lod *= Math.max(1.05, Math.sqrt(visits / TILE_VISIT_BUDGET));
    }
}

function cellHash(r, c, seed = 0) {
    let h = (r * 374761393 + c * 668265263 + seed * 1274126177) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export { cellHash, tileCoverage };
