import { fxPaused, patternRunners } from './effects.js';
import { root } from './environment.js';
import { createSlotState, createPatternStampRenderer, drawSamplePatternStamp, faGlyphCache } from './pattern-stamps.js';
import { cellHash, tileCoverage } from './pattern-geometry.js';
import { hasBoxFill } from './styles.js';

function mountPatternTiles(node, element, options = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-pattern-wrap';
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;contain:strict;';
    const canvas = document.createElement('canvas');
    canvas.className = 'sp-pattern-canvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    wrap.appendChild(canvas);

    const note = document.createElement('div');
    note.style.cssText = 'position:absolute;left:10px;right:10px;bottom:8px;padding:4px 10px;border-radius:6px;background:rgba(13,17,23,0.78);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.82);font:500 11px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;display:none;';
    node.replaceChildren(wrap, note);

    const ctx = canvas.getContext('2d', { alpha: true });

    const allSlots = [createSlotState(0), createSlotState(1), createSlotState(2), createSlotState(3)];
    let activeSlots = [allSlots[0]];

    let stopped = false;
    let rafId = 0;
    let readyToDraw = false;
    let dirtyFrame = true;
    let startTime = 0;
    let lastDrawTs = 0;

    let curElement = element;
    let curOptions = options;
    let layout = 'brick', symmetry = 'none', kaleidoMorph = true, kaleidoSpeed = 8, kaleidoDirection = 'cw', kaleidoDepth = 0.35;
    let aspectRatio = '1:1', tileSize = 96, gap = 16, offsetX = 50, offsetY = 0;
    let tileDistribution = 'diagonal';
    let gridAngleRad = 0, cosG = 1, sinG = 0, tileAngleDeg = 0, tileAngleRad = 0;
    let alternateFlip = 'tilt', tileOpacity = 1, altOpacity = 0.4, altScale = 1;
    let blendMode = 'normal', sourceType = 'image', wedges = 6, feather = 0;
    let motion = 'scroll', trackMode = 'uniform', scrollAngleRad = 0;
    let speed = 12, spinSpeed = 8, spinDirection = 'cw', waveAmount = 0.25;
    let hueShift = 'none', hueSpeed = 12, hueJitter = 0;
    let brightnessJitter = 0, saturationJitter = 0;
    let scaleJitter = 0, rotationJitter = 0, positionJitter = 0;
    let animateJitter = false, jitterSpeed = 6;
    let twinkle = 0, twinkleSpeed = 4;
    let dpr = 1, isKaleido = false;
    let currentFrameId = 0;

    const stampState = {};
    const { captureBaseStampData, computeSlotDimensions, buildStampFromImage, buildStampFromIcon, getTintedIconStamp, getDynamicKaleidoStamp, updateKaleidoCell } = createPatternStampRenderer(stampState);
    function syncStampState() {
        Object.assign(stampState, { curOptions, symmetry, kaleidoMorph, activeSlots, aspectRatio, tileSize, altScale, scaleJitter, dpr, curElement, hueShift, hueJitter, brightnessJitter, saturationJitter, currentFrameId, kaleidoSpeed, kaleidoDirection, kaleidoDepth, tileAngleRad, wedges });
    }

    function drawFrame(now) {
        rafId = 0;
        if (stopped || !readyToDraw || (!node.isConnected && !fxPaused) || !ctx || curElement.visible === false || node.classList.contains('hidden')) return;
        const ts = now || performance.now();
        if (!startTime) startTime = ts;

        const isFloating = (motion === 'float' || (animateJitter && (positionJitter > 0 || scaleJitter > 0 || rotationJitter > 0))) && curOptions.animate !== false;
        const isDynamicKaleido = symmetry !== 'none' && kaleidoMorph && curOptions.animate !== false;
        const hasTileAnim = (motion !== 'none' || isDynamicKaleido || hueShift !== 'none' || twinkle > 0 || isFloating);
        const hasDynamicAnim = hasTileAnim;

        // Frame-rate pacing: cap continuous animation loops at ~60fps (15.8ms interval) across 120Hz/144Hz displays
        if (!dirtyFrame && hasDynamicAnim && lastDrawTs && (ts - lastDrawTs < 15.8)) {
            rafId = requestAnimationFrame(drawFrame);
            return;
        }
        dirtyFrame = false;
        lastDrawTs = ts;
        currentFrameId = (currentFrameId + 1) | 0;
        stampState.currentFrameId = currentFrameId;

        const logicalW = Math.max(1, Number(curElement.width) || node.clientWidth || 300);
        const logicalH = Math.max(1, Number(curElement.height) || node.clientHeight || 200);
        // Render at 1:1 native layer resolution up to 1080p, or up to 1.5x DPR on smaller badges/strips
        const maxDpr = (logicalW * logicalH > 600000) ? 1 : Math.min(dpr, 1.5);
        const maxDim = 1920;
        const scaleCap = Math.min(maxDpr, maxDim / Math.max(logicalW, logicalH, 1));
        const cw = Math.max(1, Math.round(logicalW * scaleCap));
        const ch = Math.max(1, Math.round(logicalH * scaleCap));
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'medium';
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, cw, ch);

        const t = Math.max(0, (ts - startTime) / 1000);

        const hasColorFilter = hueJitter > 0 || hueShift !== 'none' || brightnessJitter > 0 || saturationJitter > 0;
        const numSlots = activeSlots.length;
        let maxTileW = 16;
        let maxTileH = 16;
        for (let i = 0; i < numSlots; i++) {
            const s = activeSlots[i];
            computeSlotDimensions(s, numSlots);
            if (s.tileW > maxTileW) maxTileW = s.tileW;
            if (s.tileH > maxTileH) maxTileH = s.tileH;
            if (isDynamicKaleido && !hasColorFilter && s.kaleidoCellFrameTag !== currentFrameId) {
                updateKaleidoCell(s, t);
                s.kaleidoCellFrameTag = currentFrameId;
            }
        }

        const maxScale = (1 + scaleJitter / 100) * Math.max(1, altScale) * (motion === 'wave' ? 1 + waveAmount * 0.45 : 1);
        const { lod, stepX, stepY, radius: tileRadius, cols, rows } = tileCoverage(logicalW, logicalH, maxTileW, maxTileH, gap, cosG, sinG, maxScale);
        const rowCycle = stepX * 2;
        const colCycle = stepY * 2;
        const u = t / speed;
        const dir = spinDirection === 'ccw' ? -1 : 1;

        let dx = 0, dy = 0;
        if (motion === 'scroll' || motion === 'scroll-spin') {
            const cycleDist = Math.hypot(stepX, stepY) * 2;
            const dist = u * cycleDist;
            dx = Math.cos(scrollAngleRad) * dist;
            dy = Math.sin(scrollAngleRad) * dist;
        } else if (motion === 'sway') {
            const phase = u * Math.PI * 2;
            dx = Math.sin(phase) * stepX * waveAmount * 1.4;
            dy = Math.cos(phase * 0.5) * stepY * waveAmount * 0.8;
        }

        let evenRowX = dx, oddRowX = dx;
        let evenColY = dy, oddColY = dy;

        if (motion === 'alt-rows') {
            if (trackMode === 'sine') {
                const s = Math.sin(u * Math.PI * 2) * stepX * (waveAmount * 2) * dir;
                evenRowX += s;
                oddRowX -= s;
            } else if (trackMode === 'stagger') {
                evenRowX += dir * u * rowCycle * 2;
                oddRowX += dir * u * rowCycle;
            } else if (trackMode === 'alternate-stop') {
                evenRowX += dir * u * rowCycle;
            } else {
                evenRowX += dir * u * rowCycle;
                oddRowX -= dir * u * rowCycle;
            }
        } else if (motion === 'alt-cols') {
            if (trackMode === 'sine') {
                const s = Math.sin(u * Math.PI * 2) * stepY * (waveAmount * 2) * dir;
                evenColY += s;
                oddColY -= s;
            } else if (trackMode === 'stagger') {
                evenColY += dir * u * colCycle * 2;
                oddColY += dir * u * colCycle;
            } else if (trackMode === 'alternate-stop') {
                evenColY += dir * u * colCycle;
            } else {
                evenColY += dir * u * colCycle;
                oddColY -= dir * u * colCycle;
            }
        } else if (motion === 'weave') {
            const phase = u % 1;
            const easeCubic = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
            if (phase < 0.5) {
                const e = easeCubic(phase * 2) * rowCycle * dir;
                evenRowX += e;
                if (trackMode !== 'alternate-stop' && trackMode !== 'stagger') oddRowX -= e;
            } else {
                const e = easeCubic((phase - 0.5) * 2) * colCycle * dir;
                if (trackMode === 'alternate-stop' || trackMode === 'stagger') {
                    oddColY += e;
                } else {
                    evenColY += e;
                    oddColY -= e;
                }
            }
        } else if ((motion === 'scroll' || motion === 'scroll-spin') && trackMode !== 'uniform') {
            if (trackMode === 'alt-rows') {
                const fallbackX = Math.abs(dx) < 0.5 ? dir * u * rowCycle : dx;
                evenRowX = fallbackX;
                oddRowX = -fallbackX;
            } else if (trackMode === 'stagger-rows') {
                const fallbackX = Math.abs(dx) < 0.5 ? dir * u * rowCycle : dx;
                evenRowX = fallbackX * 1.5;
                oddRowX = fallbackX * 0.75;
            } else if (trackMode === 'alt-cols') {
                const fallbackY = Math.abs(dy) < 0.5 ? dir * u * colCycle : dy;
                evenColY = fallbackY;
                oddColY = -fallbackY;
            } else if (trackMode === 'stagger-cols') {
                const fallbackY = Math.abs(dy) < 0.5 ? dir * u * colCycle : dy;
                evenColY = fallbackY * 1.5;
                oddColY = fallbackY * 0.75;
            }
        }

        const wrapAxis = (val, step) => {
            const base = Math.round(val / (step * 2)) * 2;
            return { base, rem: val - base * step };
        };
        const evenRowW = wrapAxis(evenRowX, stepX);
        const oddRowW = wrapAxis(oddRowX, stepX);
        const evenColW = wrapAxis(evenColY, stepY);
        const oddColW = wrapAxis(oddColY, stepY);

        const halfW = logicalW / 2;
        const halfH = logicalH / 2;
        const cullW = halfW + tileRadius;
        const cullH = halfH + tileRadius;

        const altDefaultTilt = (15 * Math.PI) / 180;
        const baseRot = symmetry !== 'none' ? 0 : tileAngleRad;
        const spinPhase = (motion === 'spin' || motion === 'scroll-spin' || motion === 'sway' || motion === 'wave') ? (t / spinSpeed) * Math.PI * 2 : 0;

        // Precompute trig for even/odd cells when rotation is not position-dependent ('sway')
        const isSway = motion === 'sway';
        let evenRot = baseRot, oddRot = baseRot;
        if (layout === 'alternating') {
            if (alternateFlip === 'tilt' && tileAngleDeg === 0) {
                evenRot = altDefaultTilt;
                oddRot = -altDefaultTilt;
            } else if (alternateFlip === 'tilt') {
                oddRot = -baseRot;
            }
        }
        if (motion === 'spin' || motion === 'scroll-spin') {
            const evenDir = spinDirection === 'ccw' ? -1 : 1;
            const oddDir = spinDirection === 'ccw' ? -1 : spinDirection === 'alternate' ? -1 : 1;
            evenRot += evenDir * spinPhase;
            oddRot += oddDir * spinPhase;
        }
        const cosEven = Math.cos(gridAngleRad + evenRot), sinEven = Math.sin(gridAngleRad + evenRot);
        const cosOdd = Math.cos(gridAngleRad + oddRot), sinOdd = Math.sin(gridAngleRad + oddRot);

        let lastAlpha = 1;
        const staticRowShift = (offsetX / 100) * stepX;
        const staticColShift = (offsetY / 100) * stepY;

        const hasHue = hueShift !== 'none' || hueJitter > 0;
        const baseHueCycle = hueShift === 'cycle' ? ((t / hueSpeed) * 360) : 0;
        const floatBasePhase = isFloating ? (t / jitterSpeed) * Math.PI * 2 : 0;

        for (let r = -rows; r <= rows; r++) {
            const oddRow = (r & 1) !== 0;
            const rw = oddRow ? oddRowW : evenRowW;
            const rowShiftX = oddRow ? staticRowShift : 0;

            for (let c = -cols; c <= cols; c++) {
                const oddCol = (c & 1) !== 0;
                const cwWrap = oddCol ? oddColW : evenColW;

                let cx = c * stepX + rw.rem + rowShiftX;
                let cy = r * stepY + cwWrap.rem + (oddCol ? staticColShift : 0);

                const row = r - cwWrap.base;
                const col = c - rw.base;

                if (positionJitter > 0) {
                    const pj = (positionJitter / 100) * 0.45;
                    const jx = (cellHash(row, col, 7) * 2 - 1) * stepX * pj;
                    const jy = (cellHash(row, col, 8) * 2 - 1) * stepY * pj;
                    if (isFloating) {
                        const fSeedX = cellHash(row, col, 10) * Math.PI * 2;
                        const fSeedY = cellHash(row, col, 11) * Math.PI * 2;
                        cx += jx * Math.sin(floatBasePhase + fSeedX);
                        cy += jy * Math.cos(floatBasePhase * 0.85 + fSeedY);
                    } else {
                        cx += jx;
                        cy += jy;
                    }
                } else if (motion === 'float') {
                    const fSeedX = cellHash(row, col, 10) * Math.PI * 2;
                    const fSeedY = cellHash(row, col, 11) * Math.PI * 2;
                    cx += Math.sin(floatBasePhase + fSeedX) * stepX * waveAmount * 0.32;
                    cy += Math.cos(floatBasePhase * 0.85 + fSeedY) * stepY * waveAmount * 0.32;
                }

                let wavePhase = 0;
                if (motion === 'wave') {
                    wavePhase = spinPhase - (col * 0.45 + row * 0.45);
                    cy += Math.cos(wavePhase) * tileSize * lod * waveAmount * 0.16;
                }

                // Screen-space viewport culling (skips off-screen corner tiles on rotated grids)
                const rx = cx * cosG - cy * sinG;
                if (rx < -cullW || rx > cullW) continue;
                const ry = cx * sinG + cy * cosG;
                if (ry < -cullH || ry > cullH) continue;

                const oddCell = ((row + col) & 1) !== 0;
                let alpha = tileOpacity;
                let scale = 1;
                let sx = 1, sy = 1;

                if (oddCell) {
                    if (layout === 'checkerboard') {
                        alpha *= altOpacity;
                        scale *= altScale;
                    } else if (layout === 'alternating') {
                        if (alternateFlip === 'h') sx = -1;
                        else if (alternateFlip === 'v') sy = -1;
                        else if (alternateFlip === 'both') { sx = -1; sy = -1; }
                        alpha *= altOpacity;
                        scale *= altScale;
                    }
                }

                if (scaleJitter > 0) {
                    const rawSj = (cellHash(row, col, 5) * 2 - 1) * (scaleJitter / 100);
                    const sj = isFloating ? 1 + rawSj * Math.sin(floatBasePhase + cellHash(row, col, 12) * Math.PI * 2) : 1 + rawSj;
                    scale *= Math.max(0.05, sj);
                } else if (motion === 'float') {
                    scale *= Math.max(0.1, 1 + Math.sin(floatBasePhase + cellHash(row, col, 12) * Math.PI * 2) * waveAmount * 0.18);
                }

                if (motion === 'wave') {
                    scale *= Math.max(0.1, 1 + Math.sin(wavePhase) * waveAmount * 0.45);
                }

                if (twinkle > 0) {
                    const twSeed = cellHash(row, col, 9);
                    const twPhase = ((t / twinkleSpeed) * Math.PI * 2) + (twSeed * Math.PI * 2);
                    const twPulse = 1 - (Math.cos(twPhase) * 0.5 + 0.5) * (twinkle / 100) * 0.85;
                    alpha *= Math.max(0.01, twPulse);
                }

                if (alpha < 0.01 || scale < 0.02) continue;

                // Select active tile slot for this cell
                let slotObj = activeSlots[0];
                if (numSlots > 1) {
                    let sIdx = 0;
                    if (tileDistribution === 'row') {
                        sIdx = ((col % numSlots) + numSlots) % numSlots;
                    } else if (tileDistribution === 'col') {
                        sIdx = ((row % numSlots) + numSlots) % numSlots;
                    } else if (tileDistribution === 'grid') {
                        sIdx = ((((row & 1) * 2 + (col & 1)) % numSlots) + numSlots) % numSlots;
                    } else if (tileDistribution === 'random') {
                        sIdx = Math.floor(cellHash(row, col, 31) * numSlots) % numSlots;
                    } else {
                        // 'diagonal' default
                        sIdx = (((row + col) % numSlots) + numSlots) % numSlots;
                    }
                    slotObj = activeSlots[sIdx] || activeSlots[0];
                }

                let rotJitterRad = 0;
                if (rotationJitter > 0) {
                    const rawRj = ((cellHash(row, col, 6) * 2 - 1) * rotationJitter * Math.PI) / 180;
                    rotJitterRad = isFloating ? rawRj * Math.cos(floatBasePhase + cellHash(row, col, 13) * Math.PI * 2) : rawRj;
                } else if (motion === 'float') {
                    rotJitterRad = Math.cos(floatBasePhase + cellHash(row, col, 13) * Math.PI * 2) * waveAmount * 0.35;
                }

                let cosT = oddCell ? cosOdd : cosEven;
                let sinT = oddCell ? sinOdd : sinEven;

                if (isSway) {
                    const swayDir = spinDirection === 'alternate' ? (oddCell ? -1 : 1) : 1;
                    const rot = (oddCell ? oddRot : evenRot) + swayDir * Math.sin(spinPhase + (row + col) * 0.4) * (waveAmount * 0.65) + rotJitterRad;
                    cosT = Math.cos(gridAngleRad + rot);
                    sinT = Math.sin(gridAngleRad + rot);
                } else if (rotJitterRad !== 0) {
                    const rot = (oddCell ? oddRot : evenRot) + rotJitterRad;
                    cosT = Math.cos(gridAngleRad + rot);
                    sinT = Math.sin(gridAngleRad + rot);
                }

                const tx = (halfW + rx) * scaleCap;
                const ty = (halfH + ry) * scaleCap;
                const sX = sx * scale * scaleCap;
                const sY = sy * scale * scaleCap;

                if (lastAlpha !== alpha) {
                    ctx.globalAlpha = alpha;
                    lastAlpha = alpha;
                }

                let currentBitmap = (isDynamicKaleido && !hasColorFilter) ? slotObj.cellCanvas : slotObj.stampCanvas;

                if (hasColorFilter) {
                    let hueSlot = 0;
                    if (hasHue) {
                        let tileHue = baseHueCycle;
                        if (hueShift === 'wave-x') {
                            tileHue = ((t / hueSpeed) * 360) + (col * 22.5);
                        } else if (hueShift === 'wave-y') {
                            tileHue = ((t / hueSpeed) * 360) + (row * 22.5);
                        }
                        if (hueJitter > 0) {
                            tileHue += (cellHash(row, col, 1) * 2 - 1) * hueJitter;
                        }
                        hueSlot = ((Math.round(tileHue / 22.5) % 16) + 16) % 16;
                    } else {
                        hueSlot = Math.floor(cellHash(row, col, 2) * 16) % 16;
                    }
                    if (isDynamicKaleido) {
                        currentBitmap = getDynamicKaleidoStamp(slotObj, hueSlot, t);
                    } else {
                        const tinted = getTintedIconStamp(slotObj, hueSlot);
                        if (tinted) currentBitmap = tinted;
                    }
                }

                const cTileW = slotObj.tileW * lod;
                const cTileH = slotObj.tileH * lod;
                ctx.setTransform(cosT * sX, sinT * sX, -sinT * sY, cosT * sY, tx, ty);
                ctx.drawImage(currentBitmap, -cTileW / 2, -cTileH / 2, cTileW, cTileH);
            }
        }

        if (feather > 0) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'destination-in';
            const stop = Math.max(0, 100 - feather);
            const maxR = Math.hypot(cw, ch) / 2;
            const radGrad = ctx.createRadialGradient(cw / 2, ch / 2, maxR * (stop / 100), cw / 2, ch / 2, maxR);
            radGrad.addColorStop(0, '#000000');
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
        }

        if (hasDynamicAnim && curOptions.animate !== false && !fxPaused && !document.hidden) {
            rafId = requestAnimationFrame(drawFrame);
        }
    }

    function wake() {
        if (document.hidden) {
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            return;
        }
        if (stopped || !readyToDraw || curElement.visible === false || node.classList.contains('hidden')) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            return;
        }
        dirtyFrame = true;
        if (fxPaused) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            drawFrame(performance.now());
            return;
        }
        if (!rafId) {
            rafId = requestAnimationFrame(drawFrame);
        }
    }

    function ensureFaStylesheet(onLoadCb) {
        let faLink = document.querySelector('link[data-fa]');
        if (!faLink) {
            faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
            faLink.dataset.fa = '1';
            faLink.addEventListener('load', () => { faGlyphCache.clear(); onLoadCb?.(); }, { once: true });
            document.head.appendChild(faLink);
        }
    }

    function syncSlotStamp(slotObj, isDynamicKaleido) {
        const { w: sW, h: sH } = computeSlotDimensions(slotObj);
        slotObj.stampW = sW;
        slotObj.stampH = sH;

        if (isKaleido) {
            if (!slotObj.cellCanvas) {
                slotObj.cellCanvas = document.createElement('canvas');
                slotObj.cellCtx = slotObj.cellCanvas.getContext('2d');
            }
            if (slotObj.cellCanvas.width !== sW || slotObj.cellCanvas.height !== sH) {
                slotObj.cellCanvas.width = sW;
                slotObj.cellCanvas.height = sH;
            }
        }

        const kaleidoBakeKey = (symmetry !== 'none' && !isDynamicKaleido) ? `${symmetry}:${wedges}:${tileAngleDeg}` : 'raw';
        const nextStampKey = slotObj.sourceType === 'icon'
            ? JSON.stringify(['icon', slotObj.content, sW, sH, aspectRatio, slotObj.color, curElement.style?.textStroke, curElement.style?.textShadow, kaleidoBakeKey, activeSlots.length])
            : JSON.stringify(['image', slotObj.rawSrc, sW, sH, aspectRatio, curElement.style?.objectFit, curElement.style?.focusX, curElement.style?.focusY, kaleidoBakeKey, activeSlots.length]);

        const nextPaletteKey = JSON.stringify([nextStampKey, symmetry, wedges, tileAngleDeg, isDynamicKaleido, hueShift !== 'none' || hueJitter > 0, saturationJitter, brightnessJitter]);
        if (nextPaletteKey !== slotObj.lastPaletteKey) {
            slotObj.lastPaletteKey = nextPaletteKey;
            slotObj.iconHueCache.clear();
            slotObj.kaleidoSlotFrameTags.fill(0);
            slotObj.kaleidoCellFrameTag = 0;
        }

        if (nextStampKey === slotObj.lastStampKey && slotObj.ready) {
            return;
        }
        slotObj.lastStampKey = nextStampKey;
        const revision = ++slotObj.stampRevision;
        if (slotObj.pendingImg) {
            slotObj.pendingImg.onload = slotObj.pendingImg.onerror = null;
            slotObj.pendingImg.removeAttribute('src');
            slotObj.pendingImg = null;
        }
        if (slotObj.stampCanvas.width !== sW || slotObj.stampCanvas.height !== sH) {
            slotObj.stampCanvas.width = sW;
            slotObj.stampCanvas.height = sH;
        }

        if (slotObj.sourceType === 'icon') {
            const cls = String(slotObj.content || 'fa-brands fa-twitch').trim().replace(/^fab\b/, 'fa-brands').replace(/^fas\b/, 'fa-solid').replace(/^far\b/, 'fa-regular');
            const refreshIconStamp = () => {
                if (stopped || slotObj.stampRevision !== revision) return;
                const { glyph, fontFamily, fontWeight, isFa } = buildStampFromIcon(slotObj, cls);
                if (glyph) {
                    if (slotObj.index === 0) note.style.display = 'none';
                    slotObj.ready = true;
                    readyToDraw = true;
                    wake();
                    if (isFa && document.fonts?.load) {
                        document.fonts.load(`${fontWeight} 32px ${fontFamily}`, glyph).then(() => {
                            if (stopped || slotObj.stampRevision !== revision) return;
                            buildStampFromIcon(slotObj, cls);
                            wake();
                        }).catch(() => {});
                    }
                } else if (curOptions.preview) {
                    drawSamplePatternStamp(slotObj.stampCtx, slotObj.stampW, slotObj.stampH, slotObj.index);
                    captureBaseStampData(slotObj);
                    if (slotObj.index === 0) {
                        note.textContent = 'Choose a valid Font Awesome icon or paste an emoji in Content';
                        note.style.display = 'block';
                    }
                    slotObj.ready = true;
                    readyToDraw = true;
                    wake();
                }
            };
            ensureFaStylesheet(refreshIconStamp);
            refreshIconStamp();
        } else {
            const rawSrc = slotObj.rawSrc;
            if (!rawSrc || /\{\{/.test(rawSrc)) {
                if (curOptions.preview) {
                    drawSamplePatternStamp(slotObj.stampCtx, slotObj.stampW, slotObj.stampH, slotObj.index);
                    captureBaseStampData(slotObj);
                    if (slotObj.index === 0 && activeSlots.length === 1) {
                        note.textContent = rawSrc ? `${rawSrc} (sample tile shown until live value is available)` : 'Sample pattern tile — upload an image or switch to Icon / Emoji in Content';
                        note.style.display = 'block';
                    } else if (slotObj.index === 0) {
                        note.style.display = 'none';
                    }
                    slotObj.ready = true;
                    readyToDraw = true;
                    wake();
                } else {
                    drawSamplePatternStamp(slotObj.stampCtx, slotObj.stampW, slotObj.stampH, slotObj.index);
                    captureBaseStampData(slotObj);
                    slotObj.ready = true;
                    readyToDraw = true;
                    wake();
                }
            } else if (slotObj.cachedImg && slotObj.lastImgSrc === rawSrc && slotObj.cachedImg.complete && slotObj.cachedImg.naturalWidth > 0) {
                if (slotObj.index === 0) note.style.display = 'none';
                buildStampFromImage(slotObj, slotObj.cachedImg);
                slotObj.ready = true;
                readyToDraw = true;
                wake();
            } else {
                slotObj.lastImgSrc = rawSrc;
                const img = new Image();
                slotObj.pendingImg = img;
                if (/^https?:\/\//i.test(rawSrc)) img.crossOrigin = 'anonymous';
                img.decoding = 'async';
                img.onload = () => {
                    if (stopped || slotObj.stampRevision !== revision) return;
                    slotObj.pendingImg = null;
                    slotObj.cachedImg = img;
                    if (slotObj.index === 0) note.style.display = 'none';
                    buildStampFromImage(slotObj, img);
                    const onloadDynamicKaleido = symmetry !== 'none' && kaleidoMorph && curOptions.animate !== false;
                    const onloadBakeKey = (symmetry !== 'none' && !onloadDynamicKaleido) ? `${symmetry}:${wedges}:${tileAngleDeg}` : 'raw';
                    slotObj.lastStampKey = JSON.stringify(['image', rawSrc, slotObj.stampW, slotObj.stampH, aspectRatio, curElement.style?.objectFit, curElement.style?.focusX, curElement.style?.focusY, onloadBakeKey, activeSlots.length]);
                    slotObj.lastPaletteKey = JSON.stringify([slotObj.lastStampKey, symmetry, wedges, tileAngleDeg, onloadDynamicKaleido, hueShift !== 'none' || hueJitter > 0, saturationJitter, brightnessJitter]);
                    slotObj.ready = true;
                    readyToDraw = true;
                    wake();
                };
                img.onerror = () => {
                    if (stopped || slotObj.stampRevision !== revision) return;
                    if (img.crossOrigin) {
                        img.removeAttribute('crossorigin');
                        img.src = rawSrc;
                        return;
                    }
                    slotObj.pendingImg = null;
                    slotObj.cachedImg = null;
                    if (curOptions.preview) {
                        drawSamplePatternStamp(slotObj.stampCtx, slotObj.stampW, slotObj.stampH, slotObj.index);
                        captureBaseStampData(slotObj);
                        if (slotObj.index === 0) {
                            note.textContent = "Couldn't load tile image — showing sample pattern";
                            note.style.display = 'block';
                        }
                        slotObj.ready = true;
                        readyToDraw = true;
                        wake();
                    }
                };
                img.src = rawSrc;
            }
        }
    }

    function syncConfig(nextEl, nextOpts = {}) {
        curElement = nextEl || curElement;
        curOptions = nextOpts || curOptions;
        if (curElement.visible === false || node.classList.contains('hidden')) {
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            canvas.width = 1; canvas.height = 1;
            patternRunners.delete(wake);
            return;
        }
        const config = curElement.pattern || {};
        const rawLayout = config.layout || 'brick';
        const rawMotion = config.motion || 'scroll';
        symmetry = ['none', 'quad', 'radial'].includes(config.symmetry)
            ? config.symmetry
            : (rawLayout === 'kaleidoscope-quad' ? 'quad' : (rawLayout === 'kaleidoscope-radial' || rawMotion === 'kaleidoscope' ? 'radial' : 'none'));
        layout = ['grid', 'brick', 'stagger', 'alternating', 'checkerboard'].includes(rawLayout) ? rawLayout : 'grid';
        kaleidoMorph = config.kaleidoMorph !== undefined ? Boolean(config.kaleidoMorph) : true;
        kaleidoSpeed = Math.max(0.5, Math.min(120, Number(config.kaleidoSpeed ?? config.spinSpeed) || 8));
        kaleidoDirection = config.kaleidoDirection === 'ccw' ? 'ccw' : (config.spinDirection === 'ccw' ? 'ccw' : 'cw');
        kaleidoDepth = Math.max(5, Math.min(100, Number(config.kaleidoDepth ?? config.waveAmount) || 35)) / 100;
        aspectRatio = ['1:1', '16:9', '4:3', '3:2', '2:1', '3:4', '9:16', 'natural'].includes(config.aspectRatio) ? config.aspectRatio : '1:1';
        tileSize = Math.max(16, Math.min(1024, Number(config.tileSize) || 96));
        gap = Math.max(0, Math.min(256, Number(config.gap ?? 16)));
        offsetX = Math.max(0, Math.min(100, Number(config.offsetX ?? (layout === 'brick' ? 50 : 0))));
        offsetY = Math.max(0, Math.min(100, Number(config.offsetY ?? (layout === 'stagger' ? 50 : 0))));
        tileDistribution = ['diagonal', 'row', 'col', 'grid', 'random'].includes(config.tileDistribution) ? config.tileDistribution : 'diagonal';
        gridAngleRad = (Number(config.angle ?? -15) * Math.PI) / 180;
        cosG = Math.cos(gridAngleRad);
        sinG = Math.sin(gridAngleRad);
        tileAngleDeg = Number(config.tileAngle ?? 0);
        tileAngleRad = (tileAngleDeg * Math.PI) / 180;
        alternateFlip = ['none', 'tilt', 'h', 'v', 'both'].includes(config.alternateFlip) ? config.alternateFlip : 'tilt';
        tileOpacity = Math.max(0.05, Math.min(1, Number(config.tileOpacity ?? 1)));
        altOpacity = Math.max(0, Math.min(1, Number(config.altOpacity ?? 0.4)));
        altScale = Math.max(10, Math.min(200, Number(config.altScale ?? 100))) / 100;
        blendMode = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'luminosity', 'plus-lighter'].includes(config.blendMode) ? config.blendMode : 'normal';
        sourceType = ['preset', 'icon', 'image'].includes(config.sourceType) ? config.sourceType : (config.preset ? 'preset' : 'image');
        wedges = Math.max(4, Math.min(16, Math.round((Number(config.wedges) || 6) / 2) * 2));
        feather = Math.max(0, Math.min(100, Number(config.feather) || 0));
        const cleanMotion = rawMotion === 'kaleidoscope' ? 'none' : rawMotion;
        motion = curOptions.animate === false ? 'none' : (['none', 'scroll', 'alt-rows', 'alt-cols', 'weave', 'sway', 'spin', 'scroll-spin', 'wave', 'float'].includes(cleanMotion) ? cleanMotion : 'scroll');
        const defaultTrack = (motion === 'alt-rows' || motion === 'alt-cols') ? 'opposite' : 'uniform';
        trackMode = ['uniform', 'opposite', 'stagger', 'sine', 'alternate-stop', 'alt-rows', 'stagger-rows', 'alt-cols', 'stagger-cols'].includes(config.trackMode) ? config.trackMode : defaultTrack;
        scrollAngleRad = (Number(config.scrollAngle ?? 315) * Math.PI) / 180;
        speed = Math.max(0.5, Math.min(120, Number(config.speed) || 12));
        spinSpeed = Math.max(0.5, Math.min(120, Number(config.spinSpeed) || 8));
        spinDirection = ['cw', 'ccw', 'alternate'].includes(config.spinDirection) ? config.spinDirection : 'cw';
        waveAmount = Math.max(5, Math.min(100, Number(config.waveAmount) || 25)) / 100;
        hueShift = ['none', 'cycle', 'wave-x', 'wave-y'].includes(config.hueShift) ? config.hueShift : 'none';
        hueSpeed = Math.max(0.5, Math.min(120, Number(config.hueSpeed) || 12));
        hueJitter = Math.max(0, Math.min(180, Number(config.hueJitter) || 0));
        brightnessJitter = Math.max(0, Math.min(50, Number(config.brightnessJitter) || 0));
        saturationJitter = Math.max(0, Math.min(50, Number(config.saturationJitter) || 0));
        scaleJitter = Math.max(0, Math.min(50, Number(config.scaleJitter) || 0));
        rotationJitter = Math.max(0, Math.min(180, Number(config.rotationJitter) || 0));
        positionJitter = Math.max(0, Math.min(50, Number(config.positionJitter) || 0));
        animateJitter = config.animateJitter === true;
        jitterSpeed = Math.max(0.5, Math.min(60, Number(config.jitterSpeed) || 6));
        twinkle = Math.max(0, Math.min(100, Number(config.twinkle) || 0));
        twinkleSpeed = Math.max(0.5, Math.min(30, Number(config.twinkleSpeed) || 4));

        const hasFill = hasBoxFill(curElement.style || {});
        if (hasFill && blendMode !== 'normal') {
            wrap.style.mixBlendMode = blendMode;
            node.style.mixBlendMode = '';
        } else {
            wrap.style.mixBlendMode = '';
            node.style.mixBlendMode = blendMode !== 'normal' ? blendMode : '';
        }

        wrap.style.webkitMaskImage = '';
        wrap.style.maskImage = '';

        const isDynamicKaleido = symmetry !== 'none' && kaleidoMorph && curOptions.animate !== false;
        const needsRunner = (motion !== 'none' || isDynamicKaleido || hueShift !== 'none' || twinkle > 0 || (animateJitter && (positionJitter > 0 || scaleJitter > 0 || rotationJitter > 0))) && curOptions.animate !== false;
        if (needsRunner) patternRunners.add(wake);
        else patternRunners.delete(wake);

        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        isKaleido = symmetry !== 'none';

        // Configure Slot 0 (primary tile) + up to 3 extra slots from config.tiles
        const slot0 = allSlots[0];
        slot0.sourceType = sourceType === 'icon' ? 'icon' : 'image';
        slot0.rawSrc = curOptions.expand ? curOptions.expand(curElement.src || '') : String(curElement.src || '');
        slot0.content = String(curElement.content || 'fa-brands fa-twitch');
        slot0.color = curElement.style?.color || '#ffffff';
        slot0.scale = Math.max(0.25, Math.min(2, (Number(config.tile1Scale) || 100) / 100));

        const extraConfigs = Array.isArray(config.tiles) ? config.tiles.slice(0, 3) : [];
        activeSlots = [slot0];
        for (let i = 0; i < extraConfigs.length; i++) {
            const tc = extraConfigs[i];
            if (!tc || typeof tc !== 'object') continue;
            const sObj = allSlots[i + 1];
            sObj.sourceType = tc.sourceType === 'icon' ? 'icon' : 'image';
            sObj.rawSrc = curOptions.expand ? curOptions.expand(tc.src || '') : String(tc.src || '');
            sObj.content = String(tc.content || 'fa-solid fa-star');
            sObj.color = tc.color || curElement.style?.color || '#58a6ff';
            sObj.scale = Math.max(0.25, Math.min(2, (Number(tc.scale) || 100) / 100));
            activeSlots.push(sObj);
        }

        syncStampState();
        for (const sObj of activeSlots) {
            syncSlotStamp(sObj, isDynamicKaleido);
        }
        wake();
    }

    syncConfig(element, options);

    const handle = {
        isStopped: () => stopped,
        stop() {
            stopped = true;
            if (node._patternHandle === handle) node._patternHandle = null;
            patternRunners.delete(wake);
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            try {
                canvas.width = 0; canvas.height = 0;
                for (const sObj of allSlots) {
                    sObj.stampRevision++;
                    if (sObj.pendingImg) {
                        sObj.pendingImg.onload = sObj.pendingImg.onerror = null;
                        sObj.pendingImg.removeAttribute('src');
                        sObj.pendingImg = null;
                    }
                    if (sObj.cachedImg) {
                        sObj.cachedImg.onload = sObj.cachedImg.onerror = null;
                        sObj.cachedImg.removeAttribute('src');
                        sObj.cachedImg = null;
                    }
                    sObj.baseStampData = null;
                    sObj.scratchImgData = null;
                    sObj.stampCanvas.width = 0; sObj.stampCanvas.height = 0;
                    sObj.rawStampCanvas.width = 0; sObj.rawStampCanvas.height = 0;
                    if (sObj.cellCanvas) { sObj.cellCanvas.width = 0; sObj.cellCanvas.height = 0; }
                    for (const bitmap of sObj.iconHueCache.values()) {
                        if (bitmap) { bitmap.width = 0; bitmap.height = 0; }
                    }
                    sObj.iconHueCache.clear();
                    for (const bitmap of sObj.kaleidoSlotCanvases) {
                        if (bitmap) { bitmap.width = 0; bitmap.height = 0; }
                    }
                    sObj.kaleidoSlotCanvases.fill(null);
                }
            } catch {}
        },
        update: (nextEl, nextOpts) => { if (!stopped) syncConfig(nextEl, nextOpts); },
        redraw: () => { if (!stopped) wake(); }
    };
    node._patternHandle = handle;
    return handle;
}

export { mountPatternTiles };
