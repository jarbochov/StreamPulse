(function (root) {
    'use strict';

    function spec(preset, density, spacing) {
        const dens = Math.max(0.25, Math.min(4, Number(density) || 1));
        const spMult = Math.max(0.5, Math.min(3, (Number(spacing) || 100) / 100));
        const d2 = Math.sqrt(dens);
        if (preset === 'confetti') return { width: 1024, height: 1024, cols: 0, rows: 0 };
        const map = {
            leaves: { baseCols: 11, aspect: 0.86 },
            turkeys: { baseCols: 8.5, aspect: 0.94 },
            pumpkins: { baseCols: 10, aspect: 0.88 },
            'christmas-trees': { baseCols: 10, aspect: 0.95 },
            'christmas-lights': { baseCols: 18, aspect: 0.96, multipleOf: 3 },
            snowflakes: { baseCols: 10, aspect: 0.86 },
            hearts: { baseCols: 11, aspect: 0.88 },
            fireworks: { baseCols: 7.5, aspect: 0.88 }
        };
        const sp = map[preset];
        if (!sp) return { width: 1024, height: 1024, cols: 0, rows: 0 };
        let cols = Math.max(4, Math.round(sp.baseCols * d2));
        if (sp.multipleOf) cols = Math.max(sp.multipleOf, Math.round(cols / sp.multipleOf) * sp.multipleOf);
        const nominalStepX = (1920 / (sp.baseCols * d2)) * spMult;
        const width = Math.max(512, Math.min(2560, Math.round(cols * nominalStepX)));
        const actualStepX = width / cols;
        let rows;
        let height;
        if (preset === 'christmas-lights') {
            const nominalRowStep = (1080 / (6.5 * d2)) * spMult;
            rows = Math.max(2, Math.round(6 * d2));
            if (rows % 2 !== 0) rows += 1;
            height = Math.max(384, Math.min(2200, Math.round(rows * nominalRowStep)));
        } else {
            const stepY = actualStepX * sp.aspect;
            rows = Math.max(4, Math.round(1080 / (stepY / spMult)));
            if (rows % 2 !== 0) rows += 1;
            height = Math.max(384, Math.min(2200, Math.round(rows * stepY)));
        }
        return { width, height, cols, rows };
    }

    function draw(pr) {
        const preset = pr.preset;
        const layout = spec(preset, pr.density, pr.spacing);
        const canvas = document.createElement('canvas');
        canvas.width = layout.width;
        canvas.height = layout.height;
        root.StreamPulsePatterns.drawProceduralPattern(canvas.getContext('2d'), preset, layout.width, layout.height, {
            scale: 100, seamlessTile: true, _seamlessCols: layout.cols, _seamlessRows: layout.rows,
            color: 'transparent', accent: pr.accent.slice(0, 7), secondary: pr.secondary.slice(0, 7),
            palette: pr.palette || 'dual', customColors: (pr.customColors || []).slice(0, 7).map(color => color.slice(0, 7)),
            fillMode: pr.fillMode || 'tinted', fillOpacity: Number(pr.fillOpacity ?? 35),
            colorMode: pr.colorMode || 'mosaic', lineWidth: pr.lineWidth, density: pr.density,
            spacing: pr.spacing, scatter: pr.scatter, sizeVariance: pr.sizeVariance,
            rotationVariance: pr.rotationVariance, snowflakeStyle: pr.snowflakeStyle || 'all',
            motion: 'none', inPlace: 'none', vignette: 0
        });
        return {
            dataUrl: canvas.toDataURL('image/png'),
            cols: (preset === 'christmas-lights' || preset === 'confetti') ? 0 : layout.cols,
            rows: (preset === 'christmas-lights' || preset === 'confetti') ? 0 : layout.rows
        };
    }

    root.StreamPulsePatternBake = { spec, draw };
})(typeof window !== 'undefined' ? window : globalThis);
