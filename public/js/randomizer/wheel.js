const TAU = Math.PI * 2;

export function getWheelGeometry(list, weights = {}) {
    const values = (list.length ? list : ['']).map(choice =>
        weights?.[choice] != null && Number(weights[choice]) > 0 ? Number(weights[choice]) : 1
    );
    const total = values.reduce((sum, weight) => sum + weight, 0);
    const sliceSpans = values.map(weight => weight / total * TAU);
    const cumulativeAngles = [0];
    for (const span of sliceSpans) cumulativeAngles.push(cumulativeAngles.at(-1) + span);
    return { sliceSpans, cumulativeAngles };
}

export function createWheelRenderer({ canvas, stage, getColors }) {
    const face = document.createElement('canvas');
    let signature = '';
    let lastDraw = null;
    let refreshFrame = null;
    let disposed = false;

    function draw(rotationRad = 0, list = [], weights = {}) {
        if (disposed) return;
        lastDraw = [rotationRad, list, weights];
        const style = stage.style;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const stageScale = parseFloat(style.getPropertyValue('--stage-scale')) || 1;
        const cssWidth = canvas.clientWidth || 400;
        const resolution = Math.max(1160, Math.min(3200, Math.round(Math.max(580, cssWidth) * dpr * Math.max(1, stageScale))));
        const accent = style.getPropertyValue('--stage-accent') || '#8b5cf6';
        const themeColors = getColors();
        const colors = themeColors?.length ? themeColors : [
            accent, '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f43f5e', '#eab308'
        ];
        const font = style.getPropertyValue('--stage-font') || '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
        const weight = style.getPropertyValue('--stage-weight') || '700';
        const text = style.getPropertyValue('--stage-text') || '#ffffff';
        const outline = style.getPropertyValue('--stage-outline') || '';
        const nextSignature = JSON.stringify([list, list.map(choice => weights?.[choice]), colors, font, weight, text, outline, resolution]);

        if (signature !== nextSignature) {
            signature = nextSignature;
            const { sliceSpans, cumulativeAngles } = getWheelGeometry(list, weights);
            face.width = face.height = resolution;
            const ctx = face.getContext('2d');
            ctx.scale(resolution / 580, resolution / 580);
            ctx.translate(290, 290);
            const radius = 276;
            const n = sliceSpans.length;
            for (let i = 0; i < n; i++) {
                const start = cumulativeAngles[i];
                const span = sliceSpans[i];
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, radius, start, start + span);
                ctx.fillStyle = colors[i % colors.length];
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#fff';
                ctx.stroke();

                ctx.save();
                ctx.rotate(start + span / 2);
                ctx.textAlign = 'right';
                const sliceDegrees = span / TAU * 360;
                const fontSize = Math.max(10, Math.min(20, Math.round(Math.min(380 / n, sliceDegrees * 0.75 + 7))));
                ctx.font = `${weight} ${fontSize}px ${font}`;
                const label = (list[i] || '').slice(0, 24);
                const textY = Math.round(fontSize * 0.35);
                if (outline && outline !== 'none' && outline !== 'transparent') {
                    ctx.lineWidth = 3.5;
                    ctx.strokeStyle = outline;
                    ctx.strokeText(label, radius - 18, textY);
                }
                ctx.fillStyle = text;
                ctx.shadowColor = 'rgba(0,0,0,0.55)';
                ctx.shadowBlur = 4;
                ctx.fillText(label, radius - 18, textY);
                ctx.restore();
            }
        }

        if (canvas.width !== resolution || canvas.height !== resolution) {
            canvas.width = canvas.height = resolution;
        }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, resolution, resolution);
        ctx.save();
        ctx.translate(resolution / 2, resolution / 2);
        ctx.rotate(rotationRad);
        ctx.drawImage(face, -resolution / 2, -resolution / 2);
        ctx.restore();
    }

    function refresh() {
        if (disposed || !lastDraw || refreshFrame !== null) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = null;
            draw(...lastDraw);
        });
    }
    function fontsChanged() {
        signature = '';
        refresh();
    }
    const resize = new ResizeObserver(refresh);
    resize.observe(canvas);
    const appearance = new MutationObserver(refresh);
    appearance.observe(stage, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', refresh);
    document.fonts?.addEventListener('loadingdone', fontsChanged);
    document.fonts?.ready.then(fontsChanged);

    return {
        draw,
        refresh: fontsChanged,
        dispose() {
            disposed = true;
            resize.disconnect();
            appearance.disconnect();
            window.removeEventListener('resize', refresh);
            document.fonts?.removeEventListener('loadingdone', fontsChanged);
            if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
            lastDraw = null;
            face.width = face.height = 0;
        }
    };
}
