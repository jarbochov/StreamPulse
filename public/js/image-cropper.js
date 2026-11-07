// StreamPulse — Interactive Image Cropper & Editor Modal
// Clean canvas-based image cropper with aspect ratios, 90° rotation, flip, and download/save options.
// Follows StreamPulse UX: Strict No-Emoji policy (100% inline SVGs), dark theme, accessible dialog.

const ICONS = {
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    rotateCcw: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    rotateCw: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
    flipH: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 3 14 7 18"/><polyline points="17 10 21 14 17 18"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
    reset: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    crop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>'
};

const ASPECT_RATIOS = [
    { id: 'free', label: 'Free (Unconstrained)', ratio: null },
    { id: '1:1', label: '1:1 Square', ratio: 1 },
    { id: '16:9', label: '16:9 Widescreen', ratio: 16 / 9 },
    { id: '4:3', label: '4:3 Standard', ratio: 4 / 3 },
    { id: '3:2', label: '3:2 Photo', ratio: 1.5 },
    { id: '2:1', label: '2:1 Banner', ratio: 2 },
    { id: '3:4', label: '3:4 Portrait', ratio: 0.75 },
    { id: '9:16', label: '9:16 Vertical / Reel', ratio: 9 / 16 }
];

let cropperDialog = null;

function ensureStyles() {
    if (document.getElementById('sp-image-cropper-styles')) return;
    const style = document.createElement('style');
    style.id = 'sp-image-cropper-styles';
    style.textContent = `
        dialog#sp-image-editor-dialog {
            background: var(--bg-card, #161b22);
            color: var(--text, #c9d1d9);
            border: 1px solid var(--border, #30363d);
            border-radius: 12px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
            width: min(880px, 94vw);
            max-height: 94vh;
            padding: 0;
            overflow: hidden;
            flex-direction: column;
            margin: auto;
        }
        dialog#sp-image-editor-dialog[open] { display: flex; }
        dialog#sp-image-editor-dialog::backdrop { background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px); }
        .sp-cropper-header {
            padding: 12px 18px;
            border-bottom: 1px solid var(--border, #30363d);
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--bg-inset, #0d1117);
        }
        .sp-cropper-title-wrap h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .sp-cropper-title-wrap .sp-cropper-meta {
            font-size: 11px;
            color: var(--text-muted, #8b949e);
            margin-top: 2px;
        }
        .sp-cropper-close-btn {
            background: transparent;
            border: none;
            color: var(--text-muted, #8b949e);
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sp-cropper-close-btn:hover { color: var(--text, #c9d1d9); background: var(--bg-raised, #21262d); }
        .sp-cropper-body {
            padding: 14px 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        }
        .sp-cropper-stage-wrap {
            position: relative;
            width: 100%;
            height: clamp(260px, 50vh, 460px);
            background: conic-gradient(var(--bg-raised, #21262d) 25%, var(--bg-inset, #0d1117) 0 50%, var(--bg-raised, #21262d) 0 75%, var(--bg-inset, #0d1117) 0) 0 0 / 16px 16px;
            border: 1px solid var(--border, #30363d);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            user-select: none;
            touch-action: none;
        }
        .sp-cropper-stage-wrap canvas {
            display: block;
            max-width: 100%;
            max-height: 100%;
        }
        .sp-cropper-toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            background: var(--bg-inset, #0d1117);
            border: 1px solid var(--border, #30363d);
            border-radius: 8px;
            padding: 8px 12px;
        }
        .sp-cropper-toolbar label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-muted, #8b949e);
            font-weight: 500;
        }
        .sp-cropper-toolbar select {
            background: var(--bg-card, #161b22);
            color: var(--text, #c9d1d9);
            border: 1px solid var(--border, #30363d);
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 12px;
            outline: none;
        }
        .sp-cropper-btn-group {
            display: inline-flex;
            gap: 4px;
            margin-left: auto;
        }
        .sp-cropper-tool-btn {
            background: var(--bg-raised, #21262d);
            border: 1px solid var(--border, #30363d);
            color: var(--text, #c9d1d9);
            border-radius: 6px;
            padding: 4px 9px;
            font-size: 12px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: background 0.12s, border-color 0.12s;
        }
        .sp-cropper-tool-btn:hover {
            border-color: var(--accent, #58a6ff);
            background: var(--bg-card, #161b22);
        }
        .sp-cropper-info-pill {
            font-size: 11px;
            font-variant-numeric: tabular-nums;
            color: var(--text-muted, #8b949e);
            background: var(--bg-card, #161b22);
            padding: 3px 8px;
            border-radius: 999px;
            border: 1px solid var(--border, #30363d);
        }
        .sp-cropper-footer {
            padding: 12px 18px;
            border-top: 1px solid var(--border, #30363d);
            background: var(--bg-inset, #0d1117);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .sp-cropper-footer .sp-cropper-btn-primary {
            background: var(--accent, #1f6feb);
            border: 1px solid var(--accent, #1f6feb);
            color: #ffffff;
            font-weight: 500;
        }
        .sp-cropper-footer .sp-cropper-btn-primary:hover {
            background: #388bfd;
            border-color: #388bfd;
        }
        .sp-cropper-footer .sp-cropper-btn-secondary {
            background: var(--bg-raised, #21262d);
            border: 1px solid var(--border, #30363d);
            color: var(--text, #c9d1d9);
        }
        .sp-cropper-footer .sp-cropper-btn-secondary:hover {
            border-color: var(--border-strong, #8b949e);
        }
    `;
    document.head.appendChild(style);
}

function ensureDialog() {
    ensureStyles();
    let dlg = document.getElementById('sp-image-editor-dialog');
    if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'sp-image-editor-dialog';
        dlg.innerHTML = `
            <div class="sp-cropper-header">
                <div class="sp-cropper-title-wrap">
                    <h3>
                        <span style="display:inline-flex;color:var(--accent,#58a6ff);">${ICONS.crop}</span>
                        <span>Crop &amp; Edit Image</span>
                    </h3>
                    <div id="sp-cropper-meta" class="sp-cropper-meta">Loading image…</div>
                </div>
                <button type="button" class="sp-cropper-close-btn" id="sp-cropper-close" aria-label="Close dialog">${ICONS.close}</button>
            </div>
            <div class="sp-cropper-body">
                <div class="sp-cropper-stage-wrap" id="sp-cropper-stage-wrap">
                    <canvas id="sp-cropper-canvas"></canvas>
                </div>
                <div class="sp-cropper-toolbar">
                    <label for="sp-cropper-aspect">
                        <span>Aspect:</span>
                        <select id="sp-cropper-aspect">
                            ${ASPECT_RATIOS.map(a => `<option value="${a.id}">${a.label}</option>`).join('')}
                        </select>
                    </label>
                    <span id="sp-cropper-dims" class="sp-cropper-info-pill">0 × 0 px</span>
                    <div class="sp-cropper-btn-group">
                        <button type="button" class="sp-cropper-tool-btn" id="sp-cropper-rot-ccw" title="Rotate 90° counter-clockwise">${ICONS.rotateCcw} Rotate L</button>
                        <button type="button" class="sp-cropper-tool-btn" id="sp-cropper-rot-cw" title="Rotate 90° clockwise">${ICONS.rotateCw} Rotate R</button>
                        <button type="button" class="sp-cropper-tool-btn" id="sp-cropper-flip-h" title="Flip horizontally">${ICONS.flipH} Flip</button>
                        <button type="button" class="sp-cropper-tool-btn" id="sp-cropper-reset" title="Reset crop and orientation">${ICONS.reset} Reset</button>
                    </div>
                </div>
            </div>
            <div class="sp-cropper-footer">
                <a id="sp-cropper-download-btn" class="sp-cropper-tool-btn" href="#" download="cropped-image.png" style="text-decoration:none;" title="Download cropped PNG directly to your computer">${ICONS.download} Download File</a>
                <span style="flex:1;"></span>
                <button type="button" class="sp-cropper-tool-btn sp-cropper-btn-secondary" id="sp-cropper-cancel">Cancel</button>
                <button type="button" class="sp-cropper-tool-btn sp-cropper-btn-secondary" id="sp-cropper-save-new" title="Upload as a new asset in the library">Save as New Asset</button>
                <button type="button" class="sp-cropper-tool-btn sp-cropper-btn-primary" id="sp-cropper-save-primary">Save &amp; Apply</button>
            </div>
        `;
        document.body.appendChild(dlg);
    }
    return dlg;
}

/**
 * Open the interactive image cropper modal.
 * @param {Object} options
 * @param {string} options.url - Source URL or data URL of the image
 * @param {string} [options.name] - Existing filename or asset key if known
 * @param {string} [options.label] - Display name
 * @param {string} [options.aspectRatio] - Initial aspect ratio: 'free', '1:1', '16:9', '4:3', etc.
 * @param {boolean} [options.allowOverwrite=true] - Whether to allow overwriting the asset via PUT
 * @param {Function} [options.onSave] - Callback ({ blob, dataUrl, url, name, isNew })
 */
export function openImageCropper(options = {}) {
    const dialog = ensureDialog();
    const stageWrap = dialog.querySelector('#sp-cropper-stage-wrap');
    const canvas = dialog.querySelector('#sp-cropper-canvas');
    const ctx = canvas.getContext('2d');
    const metaEl = dialog.querySelector('#sp-cropper-meta');
    const dimsEl = dialog.querySelector('#sp-cropper-dims');
    const aspectSelect = dialog.querySelector('#sp-cropper-aspect');
    const btnClose = dialog.querySelector('#sp-cropper-close');
    const btnCancel = dialog.querySelector('#sp-cropper-cancel');
    const btnRotCcw = dialog.querySelector('#sp-cropper-rot-ccw');
    const btnRotCw = dialog.querySelector('#sp-cropper-rot-cw');
    const btnFlipH = dialog.querySelector('#sp-cropper-flip-h');
    const btnReset = dialog.querySelector('#sp-cropper-reset');
    const btnDownload = dialog.querySelector('#sp-cropper-download-btn');
    const btnSaveNew = dialog.querySelector('#sp-cropper-save-new');
    const btnSavePrimary = dialog.querySelector('#sp-cropper-save-primary');

    let img = new Image();
    let rotation = 0; // 0, 90, 180, 270
    let flipH = false;
    let crop = { x: 0, y: 0, w: 0, h: 0 };
    let stageScale = 1;
    let stageOffsetX = 0;
    let stageOffsetY = 0;
    let activeDrag = null; // null | { type: 'move'|'handle', handle: 'nw'..., startX, startY, startCrop }

    const rawName = options.name || (options.url ? options.url.split('/').pop().split('?')[0] : 'image.png');
    const isLocalAsset = options.url && (options.url.startsWith('/custom-overlay-assets/') || options.url.startsWith('/assets/'));
    const canOverwrite = options.allowOverwrite !== false && Boolean(options.name && isLocalAsset);

    btnSavePrimary.textContent = canOverwrite ? 'Overwrite Asset' : 'Apply Cropped Image';
    btnSavePrimary.title = canOverwrite ? `Overwrite "${rawName}" in overlay assets` : 'Apply cropped image';
    btnSaveNew.style.display = 'inline-flex';

    if (options.aspectRatio && ASPECT_RATIOS.some(a => a.id === options.aspectRatio)) {
        aspectSelect.value = options.aspectRatio;
    } else {
        aspectSelect.value = 'free';
    }

    function getOrientedDims() {
        const isSwapped = (rotation % 180) !== 0;
        return {
            ow: isSwapped ? (img.naturalHeight || 1) : (img.naturalWidth || 1),
            oh: isSwapped ? (img.naturalWidth || 1) : (img.naturalHeight || 1)
        };
    }

    function resetCropToAspect(keepCentered = true) {
        const { ow, oh } = getOrientedDims();
        const curAspect = aspectSelect.value;
        const target = ASPECT_RATIOS.find(a => a.id === curAspect)?.ratio;
        if (!target) {
            crop = { x: 0, y: 0, w: ow, h: oh };
        } else {
            let cw, ch;
            if (ow / oh >= target) {
                ch = oh;
                cw = Math.round(ch * target);
            } else {
                cw = ow;
                ch = Math.round(cw / target);
            }
            const cx = keepCentered ? Math.round((ow - cw) / 2) : 0;
            const cy = keepCentered ? Math.round((oh - ch) / 2) : 0;
            crop = { x: Math.max(0, cx), y: Math.max(0, cy), w: Math.min(ow, cw), h: Math.min(oh, ch) };
        }
    }

    function renderStage() {
        if (!img.complete || !img.naturalWidth) return;
        const { ow, oh } = getOrientedDims();
        const wrapW = stageWrap.clientWidth || 700;
        const wrapH = stageWrap.clientHeight || 400;

        const pad = 24;
        const maxW = Math.max(100, wrapW - pad * 2);
        const maxH = Math.max(100, wrapH - pad * 2);
        stageScale = Math.min(maxW / ow, maxH / oh, 1.0);

        const canvasW = Math.round(ow * stageScale);
        const canvasH = Math.round(oh * stageScale);

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(canvasW * dpr);
        canvas.height = Math.round(canvasH * dpr);
        canvas.style.width = `${canvasW}px`;
        canvas.style.height = `${canvasH}px`;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, canvasW, canvasH);

        // 1. Draw oriented image
        ctx.save();
        ctx.translate(canvasW / 2, canvasH / 2);
        if (flipH) ctx.scale(-1, 1);
        ctx.rotate((rotation * Math.PI) / 180);
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const isSwapped = (rotation % 180) !== 0;
        const drawScale = stageScale;
        ctx.drawImage(img, -nw * drawScale / 2, -nh * drawScale / 2, nw * drawScale, nh * drawScale);
        ctx.restore();

        // 2. Draw dim mask outside crop box
        const bx = Math.round(crop.x * stageScale);
        const by = Math.round(crop.y * stageScale);
        const bw = Math.round(crop.w * stageScale);
        const bh = Math.round(crop.h * stageScale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        // Top
        ctx.fillRect(0, 0, canvasW, by);
        // Bottom
        ctx.fillRect(0, by + bh, canvasW, canvasH - (by + bh));
        // Left
        ctx.fillRect(0, by, bx, bh);
        // Right
        ctx.fillRect(bx + bw, by, canvasW - (bx + bw), bh);

        // 3. Rule of thirds lines inside crop box
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // 2 vertical
        ctx.moveTo(bx + bw / 3, by);
        ctx.lineTo(bx + bw / 3, by + bh);
        ctx.moveTo(bx + (bw * 2) / 3, by);
        ctx.lineTo(bx + (bw * 2) / 3, by + bh);
        // 2 horizontal
        ctx.moveTo(bx, by + bh / 3);
        ctx.lineTo(bx + bw, by + bh / 3);
        ctx.moveTo(bx, by + (bh * 2) / 3);
        ctx.lineTo(bx + bw, by + (bh * 2) / 3);
        ctx.stroke();

        // 4. Crop box border
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);

        // 5. Handles (8 handles)
        const handles = getHandles(bx, by, bw, bh);
        const hSize = 8;
        ctx.fillStyle = '#58a6ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        for (const h of Object.values(handles)) {
            ctx.beginPath();
            ctx.rect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
            ctx.fill();
            ctx.stroke();
        }

        // Update dimension text
        const ar = (crop.w / (crop.h || 1)).toFixed(2);
        dimsEl.textContent = `${Math.round(crop.w)} × ${Math.round(crop.h)} px · ${ar}:1`;
    }

    function getHandles(bx, by, bw, bh) {
        return {
            nw: { x: bx, y: by },
            n: { x: bx + bw / 2, y: by },
            ne: { x: bx + bw, y: by },
            e: { x: bx + bw, y: by + bh / 2 },
            se: { x: bx + bw, y: by + bh },
            s: { x: bx + bw / 2, y: by + bh },
            sw: { x: bx, y: by + bh },
            w: { x: bx, y: by + bh / 2 }
        };
    }

    function hitTest(x, y) {
        const bx = crop.x * stageScale;
        const by = crop.y * stageScale;
        const bw = crop.w * stageScale;
        const bh = crop.h * stageScale;
        const handles = getHandles(bx, by, bw, bh);
        const hitRadius = 12;

        for (const [key, pt] of Object.entries(handles)) {
            if (Math.hypot(x - pt.x, y - pt.y) <= hitRadius) {
                return { type: 'handle', handle: key };
            }
        }
        if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
            return { type: 'move' };
        }
        return { type: 'create' };
    }

    function updateCursor(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = hitTest(x, y);
        if (hit.type === 'handle') {
            const cursorMap = {
                nw: 'nwse-resize', se: 'nwse-resize',
                ne: 'nesw-resize', sw: 'nesw-resize',
                n: 'ns-resize', s: 'ns-resize',
                e: 'ew-resize', w: 'ew-resize'
            };
            canvas.style.cursor = cursorMap[hit.handle] || 'default';
        } else if (hit.type === 'move') {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }

    function onPointerDown(e) {
        canvas.setPointerCapture(e.pointerId);
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = hitTest(x, y);
        const { ow, oh } = getOrientedDims();

        if (hit.type === 'create') {
            const startX = Math.max(0, Math.min(ow, x / stageScale));
            const startY = Math.max(0, Math.min(oh, y / stageScale));
            crop = { x: startX, y: startY, w: 1, h: 1 };
            activeDrag = { type: 'handle', handle: 'se', startX: x, startY: y, startCrop: { ...crop }, isCreate: true };
        } else {
            activeDrag = { ...hit, startX: x, startY: y, startCrop: { ...crop } };
        }
    }

    function onPointerMove(e) {
        if (!activeDrag) {
            updateCursor(e);
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dx = (x - activeDrag.startX) / stageScale;
        const dy = (y - activeDrag.startY) / stageScale;
        const { ow, oh } = getOrientedDims();
        const init = activeDrag.startCrop;
        const aspectTarget = ASPECT_RATIOS.find(a => a.id === aspectSelect.value)?.ratio;

        if (activeDrag.type === 'move') {
            let nextX = Math.round(init.x + dx);
            let nextY = Math.round(init.y + dy);
            nextX = Math.max(0, Math.min(ow - init.w, nextX));
            nextY = Math.max(0, Math.min(oh - init.h, nextY));
            crop.x = nextX;
            crop.y = nextY;
        } else if (activeDrag.type === 'handle') {
            const h = activeDrag.handle;
            let nx = init.x;
            let ny = init.y;
            let nw = init.w;
            let nh = init.h;

            if (h.includes('e')) nw = Math.max(16, init.w + dx);
            if (h.includes('s')) nh = Math.max(16, init.h + dy);
            if (h.includes('w')) {
                const adj = Math.min(dx, init.w - 16);
                nx = init.x + adj;
                nw = init.w - adj;
            }
            if (h.includes('n')) {
                const adj = Math.min(dy, init.h - 16);
                ny = init.y + adj;
                nh = init.h - adj;
            }

            if (aspectTarget) {
                if (h === 'e' || h === 'w') {
                    nh = Math.round(nw / aspectTarget);
                } else if (h === 'n' || h === 's') {
                    nw = Math.round(nh * aspectTarget);
                } else {
                    // Corner handles
                    nh = Math.round(nw / aspectTarget);
                }
            }

            // Boundary clamping
            if (nx < 0) { nw += nx; nx = 0; }
            if (ny < 0) { nh += ny; ny = 0; }
            if (nx + nw > ow) nw = ow - nx;
            if (ny + nh > oh) nh = oh - ny;

            if (aspectTarget) {
                if (nw / nh > aspectTarget) nw = Math.round(nh * aspectTarget);
                else nh = Math.round(nw / aspectTarget);
            }

            crop = {
                x: Math.round(Math.max(0, nx)),
                y: Math.round(Math.max(0, ny)),
                w: Math.round(Math.max(16, nw)),
                h: Math.round(Math.max(16, nh))
            };
        }
        renderStage();
    }

    function onPointerUp(e) {
        if (activeDrag) {
            try { canvas.releasePointerCapture(e.pointerId); } catch {}
            activeDrag = null;
            updateDownloadLink();
        }
    }

    /**
     * Export the cropped canvas region as a Blob.
     */
    async function exportCroppedBlob() {
        const { ow, oh } = getOrientedDims();
        const exportCanvas = document.createElement('canvas');
        const outW = Math.max(1, Math.round(crop.w));
        const outH = Math.max(1, Math.round(crop.h));
        exportCanvas.width = outW;
        exportCanvas.height = outH;
        const eCtx = exportCanvas.getContext('2d');

        eCtx.translate(-crop.x, -crop.y);
        eCtx.translate(ow / 2, oh / 2);
        if (flipH) eCtx.scale(-1, 1);
        eCtx.rotate((rotation * Math.PI) / 180);
        eCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        return new Promise(resolve => {
            exportCanvas.toBlob(blob => resolve(blob), 'image/png');
        });
    }

    async function updateDownloadLink() {
        const blob = await exportCroppedBlob();
        if (!blob) return;
        const objUrl = URL.createObjectURL(blob);
        btnDownload.href = objUrl;
        const base = rawName.replace(/\.[^.]+$/, '');
        btnDownload.download = `${base}-crop.png`;
    }

    // Attach canvas events
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    // Toolbar listeners
    aspectSelect.onchange = () => {
        resetCropToAspect(true);
        renderStage();
        updateDownloadLink();
    };

    btnRotCw.onclick = () => {
        rotation = (rotation + 90) % 360;
        resetCropToAspect(true);
        renderStage();
        updateDownloadLink();
    };

    btnRotCcw.onclick = () => {
        rotation = (rotation + 270) % 360;
        resetCropToAspect(true);
        renderStage();
        updateDownloadLink();
    };

    btnFlipH.onclick = () => {
        flipH = !flipH;
        renderStage();
        updateDownloadLink();
    };

    btnReset.onclick = () => {
        rotation = 0;
        flipH = false;
        aspectSelect.value = 'free';
        resetCropToAspect(true);
        renderStage();
        updateDownloadLink();
    };

    const cleanup = () => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        dialog.close();
    };

    btnClose.onclick = cleanup;
    btnCancel.onclick = cleanup;

    // Save as New Asset
    btnSaveNew.onclick = async () => {
        btnSaveNew.disabled = true;
        btnSaveNew.textContent = 'Saving…';
        try {
            const blob = await exportCroppedBlob();
            const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch ? extMatch[1] : 'png';
            const base = rawName.replace(/\.[^.]+$/, '');
            const newName = `${base}-crop.${ext}`;

            const res = await fetch('/api/custom-overlays/assets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'image/png',
                    'X-Asset-Name': newName
                },
                body: blob
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Upload failed (${res.status})`);
            }
            const data = await res.json();
            cleanup();
            if (options.onSave) options.onSave({ blob, url: data.url, name: data.name, isNew: true });
        } catch (err) {
            alert(`Error saving cropped asset: ${err.message}`);
        } finally {
            btnSaveNew.disabled = false;
            btnSaveNew.textContent = 'Save as New Asset';
        }
    };

    // Save & Overwrite / Apply
    btnSavePrimary.onclick = async () => {
        btnSavePrimary.disabled = true;
        btnSavePrimary.textContent = 'Saving…';
        try {
            const blob = await exportCroppedBlob();
            if (canOverwrite) {
                const res = await fetch(`/api/custom-overlays/assets/${encodeURIComponent(rawName)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'image/png' },
                    body: blob
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `Failed to overwrite asset (${res.status})`);
                }
                const data = await res.json();
                cleanup();
                if (options.onSave) options.onSave({ blob, url: data.url, name: rawName, isNew: false });
            } else {
                // Not an overwritable asset (e.g. data URL or external URL): upload as new asset and apply
                const base = rawName.replace(/\.[^.]+$/, '') || 'image';
                const newName = `${base}-crop.png`;
                const res = await fetch('/api/custom-overlays/assets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'image/png',
                        'X-Asset-Name': newName
                    },
                    body: blob
                });
                const data = await res.json();
                cleanup();
                if (options.onSave) options.onSave({ blob, url: data.url, name: data.name, isNew: true });
            }
        } catch (err) {
            alert(`Error saving cropped image: ${err.message}`);
        } finally {
            btnSavePrimary.disabled = false;
            btnSavePrimary.textContent = canOverwrite ? 'Overwrite Asset' : 'Apply Cropped Image';
        }
    };

    // Load Image
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        metaEl.textContent = `${rawName} (${img.naturalWidth} × ${img.naturalHeight} px)`;
        resetCropToAspect(true);
        renderStage();
        updateDownloadLink();
    };
    img.onerror = () => {
        metaEl.textContent = 'Failed to load image. If hosted externally, CORS may be restricted.';
    };

    // Add cache buster if local asset to avoid stale cached renders
    const src = options.url.startsWith('/') ? `${options.url}${options.url.includes('?') ? '&' : '?'}cb=${Date.now()}` : options.url;
    img.src = src;

    dialog.showModal();
}

// Attach to window for standard script tag usage
if (typeof window !== 'undefined') {
    window.StreamPulseImageCropper = { open: openImageCropper };
}
