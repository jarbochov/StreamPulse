import { extractGraphemes } from './icons.js';

// ---- pattern tile (repeating mosaic & kaleidoscope motion graphics) ------------------------
const SAMPLE_STAMP_PALETTES = [
    ['rgba(88, 166, 255, 0.92)', 'rgba(163, 113, 247, 0.92)', 'rgba(247, 120, 186, 0.92)', 'rgba(56, 189, 248, 0.95)'],
    ['rgba(52, 211, 153, 0.92)', 'rgba(16, 185, 129, 0.92)', 'rgba(6, 182, 212, 0.92)', 'rgba(167, 243, 208, 0.95)'],
    ['rgba(251, 191, 36, 0.92)', 'rgba(245, 158, 11, 0.92)', 'rgba(244, 63, 94, 0.92)', 'rgba(253, 230, 138, 0.95)'],
    ['rgba(192, 132, 252, 0.92)', 'rgba(129, 140, 248, 0.92)', 'rgba(56, 189, 248, 0.92)', 'rgba(233, 213, 255, 0.95)']
];

function drawSamplePatternStamp(ctx, sw, sh = sw, slotIndex = 0) {
    ctx.clearRect(0, 0, sw, sh);
    ctx.save();
    ctx.translate(sw / 2, sh / 2);
    const r = Math.min(sw, sh) * 0.42;
    const pal = SAMPLE_STAMP_PALETTES[slotIndex % SAMPLE_STAMP_PALETTES.length];
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(0.5, pal[1]);
    grad.addColorStop(1, pal[2]);
    const points = slotIndex % 2 === 1 ? 12 : 8;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
        const ang = (i * Math.PI * 2) / points - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * (slotIndex >= 2 ? 0.48 : 0.36);
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, Math.min(sw, sh) * 0.025);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
    // Asymmetric corner accent so rotation/flip/kaleidoscope are clearly visible
    ctx.beginPath();
    ctx.arc(r * 0.45, -r * 0.45, r * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = pal[3];
    ctx.fill();
    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();
    ctx.restore();
}

const faGlyphCache = new Map();


function createSlotState(index) {
    const sc = document.createElement('canvas');
    const rc = document.createElement('canvas');
    return {
        index,
        sourceType: 'image',
        rawSrc: '',
        content: '',
        color: '#ffffff',
        scale: 1,
        stampCanvas: sc,
        stampCtx: sc.getContext('2d'),
        rawStampCanvas: rc,
        rawStampCtx: rc.getContext('2d'),
        cellCanvas: null,
        cellCtx: null,
        stampW: 96,
        stampH: 96,
        tileW: 96,
        tileH: 96,
        ar: 1,
        cachedImg: null,
        pendingImg: null,
        stampRevision: 0,
        lastImgSrc: '',
        lastStampKey: '',
        lastPaletteKey: '',
        baseStampData: null,
        baseStampIsMonochrome: false,
        scratchImgData: null,
        iconHueCache: new Map(),
        kaleidoSlotCanvases: new Array(16),
        kaleidoSlotFrameTags: new Int32Array(16),
        kaleidoCellFrameTag: 0,
        ready: false
    };
}

function createPatternStampRenderer(state) {
    function captureBaseStampData(slotObj) {
        const { curOptions, symmetry, kaleidoMorph } = state;
        slotObj.iconHueCache.clear();
        slotObj.kaleidoSlotFrameTags.fill(0);
        slotObj.kaleidoCellFrameTag = 0;
        slotObj.baseStampData = null;
        slotObj.baseStampIsMonochrome = false;
        const sW = slotObj.stampW;
        const sH = slotObj.stampH;
        try {
            if (sW > 0 && sH > 0) {
                if (slotObj.rawStampCanvas.width !== sW || slotObj.rawStampCanvas.height !== sH) {
                    slotObj.rawStampCanvas.width = sW;
                    slotObj.rawStampCanvas.height = sH;
                }
                slotObj.rawStampCtx.clearRect(0, 0, sW, sH);
                slotObj.rawStampCtx.drawImage(slotObj.stampCanvas, 0, 0);
                slotObj.baseStampData = slotObj.rawStampCtx.getImageData(0, 0, sW, sH);
                const d = slotObj.baseStampData.data;
                let visible = 0;
                let chromatic = 0;
                for (let i = 0; i < d.length; i += 16) {
                    if (d[i + 3] > 32) {
                        visible++;
                        const r = d[i], g = d[i + 1], b = d[i + 2];
                        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
                        const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
                        if (mx - mn > 18) chromatic++;
                    }
                }
                slotObj.baseStampIsMonochrome = visible > 0 && (chromatic / visible) < 0.05;
                if (symmetry !== 'none' && !(kaleidoMorph && curOptions.animate !== false)) {
                    renderKaleidoCell(slotObj.stampCtx, slotObj.rawStampCanvas, sW, sH, 0);
                }
            }
        } catch {
            slotObj.baseStampData = null;
        }
    }

    function parseColorHex(c) {
        if (!c || c === 'transparent') return { r: 255, g: 255, b: 255 };
        if (c.startsWith('#')) {
            let hex = c.slice(1);
            if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
            const num = parseInt(hex, 16);
            if (!Number.isNaN(num)) return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
        }
        return { r: 255, g: 255, b: 255 };
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s, l };
    }

    const AR_MAP = {
        '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 1.5, '2:1': 2,
        '3:4': 0.75, '9:16': 9 / 16
    };

    function computeSlotDimensions(slotObj, numActive) {
        const { activeSlots, aspectRatio, tileSize, altScale, scaleJitter, dpr } = state;
        numActive ??= activeSlots.length;
        let ar = 1;
        if (aspectRatio === 'natural') {
            if (slotObj.sourceType === 'image' && slotObj.cachedImg && slotObj.cachedImg.naturalWidth && slotObj.cachedImg.naturalHeight) {
                ar = slotObj.cachedImg.naturalWidth / slotObj.cachedImg.naturalHeight;
            } else {
                ar = 1;
            }
        } else {
            ar = AR_MAP[aspectRatio] || 1;
        }
        ar = Math.max(0.1, Math.min(10, ar));
        const sMult = slotObj.scale || 1;
        let tileW, tileH;
        if (aspectRatio === 'natural' && numActive > 1) {
            // Area-balanced sizing so wide, square, and tall tiles have balanced visual weight
            const sqrtAr = Math.min(1.45, Math.max(0.68, Math.sqrt(ar)));
            tileW = Math.max(8, Math.round(tileSize * sqrtAr * sMult));
            tileH = Math.max(8, Math.round((tileSize * sqrtAr / ar) * sMult));
        } else {
            tileW = Math.max(8, Math.round(tileSize * sMult));
            tileH = Math.max(8, Math.round((tileSize / ar) * sMult));
        }
        const maxScale = Math.max(1, altScale) * (1 + scaleJitter / 100);
        const targetMax = Math.max(tileW, tileH) * dpr * maxScale;
        const base = Math.min(512, Math.max(192, Math.round(targetMax / 16) * 16));
        const w = ar >= 1 ? base : Math.max(32, Math.round(base * ar));
        const h = ar >= 1 ? Math.max(32, Math.round(base / ar)) : base;
        slotObj.tileW = tileW;
        slotObj.tileH = tileH;
        slotObj.ar = ar;
        return { tileW, tileH, ar, w, h };
    }

    

    function buildStampFromImage(slotObj, img) {
        const { curElement } = state;
        const { w, h } = computeSlotDimensions(slotObj);
        slotObj.stampW = w;
        slotObj.stampH = h;
        if (slotObj.stampCanvas.width !== w || slotObj.stampCanvas.height !== h) {
            slotObj.stampCanvas.width = w;
            slotObj.stampCanvas.height = h;
        }
        if (slotObj.cellCanvas && (slotObj.cellCanvas.width !== w || slotObj.cellCanvas.height !== h)) {
            slotObj.cellCanvas.width = w;
            slotObj.cellCanvas.height = h;
        }
        const iw = img.naturalWidth || img.width || w;
        const ih = img.naturalHeight || img.height || h;
        const sCtx = slotObj.stampCtx;
        sCtx.clearRect(0, 0, w, h);
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        const fit = curElement.style?.objectFit || 'contain';
        const fx = (curElement.style?.focusX ?? 50) / 100;
        const fy = (curElement.style?.focusY ?? 50) / 100;
        if (fit === 'fill') {
            sCtx.drawImage(img, 0, 0, w, h);
        } else {
            const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
            const dw = iw * scale;
            const dh = ih * scale;
            const dx = (w - dw) * fx;
            const dy = (h - dh) * fy;
            sCtx.drawImage(img, dx, dy, dw, dh);
        }
        captureBaseStampData(slotObj);
    }

    function buildStampFromIcon(slotObj, cls) {
        const { curElement, dpr } = state;
        const { w, h } = computeSlotDimensions(slotObj);
        slotObj.stampW = w;
        slotObj.stampH = h;
        if (slotObj.stampCanvas.width !== w || slotObj.stampCanvas.height !== h) {
            slotObj.stampCanvas.width = w;
            slotObj.stampCanvas.height = h;
        }
        if (slotObj.cellCanvas && (slotObj.cellCanvas.width !== w || slotObj.cellCanvas.height !== h)) {
            slotObj.cellCanvas.width = w;
            slotObj.cellCanvas.height = h;
        }
        const isFa = /^[a-z0-9 -]+$/i.test(cls) && /\bfa-[a-z0-9-]+/i.test(cls);
        let glyph = '';
        let fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
        let fontWeight = '400';

        if (isFa) {
            const cached = faGlyphCache.get(cls);
            if (cached) {
                ({ glyph, fontFamily, fontWeight } = cached);
            } else {
                const probe = document.createElement('i');
                probe.className = cls;
                probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
                document.body.appendChild(probe);
                const beforeStyle = getComputedStyle(probe, '::before');
                const elemStyle = getComputedStyle(probe);
                const rawContent = beforeStyle.content;
                fontFamily = beforeStyle.fontFamily || elemStyle.fontFamily || '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif';
                fontWeight = beforeStyle.fontWeight || elemStyle.fontWeight || (cls.includes('fa-brands') ? '400' : '900');
                probe.remove();

                if (rawContent && rawContent !== 'none' && rawContent !== 'normal') {
                    glyph = rawContent.replace(/^["']|["']$/g, '');
                }
                if (glyph) {
                    if (faGlyphCache.size >= 128) faGlyphCache.delete(faGlyphCache.keys().next().value);
                    faGlyphCache.set(cls, { glyph, fontFamily, fontWeight });
                }
            }
        } else if (cls) {
            glyph = extractGraphemes(cls, 4);
        }
        if (!glyph) return { glyph: '', fontFamily, fontWeight, isFa };

        const s = curElement.style || {};
        const strokeW = Number(s.textStroke?.width) || 0;
        const shadowBlur = Number(s.textShadow?.blur) || 0;
        const padRatio = (strokeW > 0 || shadowBlur > 0) ? 0.68 : 0.78;
        const fontPx = Math.max(12, Math.round(Math.min(w, h) * padRatio));

        const sCtx = slotObj.stampCtx;
        sCtx.clearRect(0, 0, w, h);
        sCtx.save();
        sCtx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';

        const cx = w / 2;
        const cy = h / 2;

        if (shadowBlur > 0) {
            sCtx.shadowBlur = shadowBlur * dpr;
            sCtx.shadowColor = s.textShadow?.color || 'rgba(0,0,0,0.7)';
            sCtx.shadowOffsetX = 0;
            sCtx.shadowOffsetY = 2 * dpr;
        }
        if (strokeW > 0) {
            sCtx.lineWidth = strokeW * 2 * dpr;
            sCtx.lineJoin = 'round';
            sCtx.strokeStyle = s.textStroke?.color || '#000000';
            sCtx.strokeText(glyph, cx, cy);
            sCtx.shadowBlur = 0;
            sCtx.shadowOffsetY = 0;
        }
        sCtx.fillStyle = slotObj.color || s.color || '#ffffff';
        sCtx.fillText(glyph, cx, cy);
        sCtx.restore();
        captureBaseStampData(slotObj);
        return { glyph, fontFamily, fontWeight, isFa };
    }

    function getTintedIconStamp(slotObj, hueSlot) {
        const { curElement, curOptions, symmetry, kaleidoMorph, hueShift, hueJitter, brightnessJitter, saturationJitter } = state;
        const idx = ((hueSlot % 16) + 16) % 16;
        if (slotObj.iconHueCache.has(idx)) return slotObj.iconHueCache.get(idx);

        const hasHue = hueShift !== 'none' || hueJitter > 0;
        const hKey = hasHue ? (idx * 22.5) : 0;
        const satShift = saturationJitter > 0 ? (((idx * 7) % 11 - 5) / 5) * (saturationJitter / 100) : 0;
        const briShift = brightnessJitter > 0 ? (((idx * 13) % 11 - 5) / 5) * (brightnessJitter / 100) : 0;

        if (hKey === 0 && satShift === 0 && briShift === 0) {
            slotObj.iconHueCache.set(idx, null);
            return null;
        }

        const sW = slotObj.stampW;
        const sH = slotObj.stampH;
        const c = document.createElement('canvas');
        c.width = sW; c.height = sH;
        const tCtx = c.getContext('2d');

        if (slotObj.sourceType === 'icon' || (slotObj.baseStampIsMonochrome && hKey !== 0)) {
            const baseHex = slotObj.sourceType === 'icon' ? (slotObj.color || curElement.style?.color || '#ffffff') : '#ffffff';
            const rgb = parseColorHex(baseHex);
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            let h = (hsl.h + hKey) % 360;
            if (h < 0) h += 360;
            let s = hsl.s < 0.08 ? 0.88 : hsl.s;
            let l = (hsl.l > 0.95 || hsl.l < 0.08) ? 0.58 : hsl.l;
            if (satShift !== 0) s = Math.max(0.05, Math.min(1, s + satShift));
            if (briShift !== 0) l = Math.max(0.05, Math.min(0.95, l * (1 + briShift)));
            const colorStr = `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

            tCtx.drawImage(slotObj.rawStampCanvas, 0, 0);
            tCtx.globalCompositeOperation = 'source-in';
            tCtx.fillStyle = colorStr;
            tCtx.fillRect(0, 0, sW, sH);
            tCtx.globalCompositeOperation = 'source-over';
        } else if (slotObj.baseStampData && slotObj.baseStampData.width === sW && slotObj.baseStampData.height === sH) {
            const rad = (hKey * Math.PI) / 180;
            const cosA = Math.cos(rad);
            const sinA = Math.sin(rad);
            const satMult = Math.max(0, 1 + satShift);
            const briMult = Math.max(0.05, 1 + briShift);

            const h00 = 0.213 + cosA * 0.787 - sinA * 0.213;
            const h01 = 0.715 - cosA * 0.715 - sinA * 0.715;
            const h02 = 0.072 - cosA * 0.072 + sinA * 0.928;
            const h10 = 0.213 - cosA * 0.213 + sinA * 0.143;
            const h11 = 0.715 + cosA * 0.285 + sinA * 0.140;
            const h12 = 0.072 - cosA * 0.072 - sinA * 0.283;
            const h20 = 0.213 - cosA * 0.213 - sinA * 0.787;
            const h21 = 0.715 - cosA * 0.715 + sinA * 0.715;
            const h22 = 0.072 + cosA * 0.928 + sinA * 0.072;

            const s00 = (0.213 + 0.787 * satMult) * briMult;
            const s01 = (0.715 - 0.715 * satMult) * briMult;
            const s02 = (0.072 - 0.072 * satMult) * briMult;
            const s10 = (0.213 - 0.213 * satMult) * briMult;
            const s11 = (0.715 + 0.285 * satMult) * briMult;
            const s12 = (0.072 - 0.072 * satMult) * briMult;
            const s20 = (0.213 - 0.213 * satMult) * briMult;
            const s21 = (0.715 - 0.715 * satMult) * briMult;
            const s22 = (0.072 + 0.928 * satMult) * briMult;

            const m00 = Math.round((h00 * s00 + h01 * s10 + h02 * s20) * 1024);
            const m01 = Math.round((h00 * s01 + h01 * s11 + h02 * s21) * 1024);
            const m02 = Math.round((h00 * s02 + h01 * s12 + h02 * s22) * 1024);
            const m10 = Math.round((h10 * s00 + h11 * s10 + h12 * s20) * 1024);
            const m11 = Math.round((h10 * s01 + h11 * s11 + h12 * s21) * 1024);
            const m12 = Math.round((h10 * s02 + h11 * s12 + h12 * s22) * 1024);
            const m20 = Math.round((h20 * s00 + h21 * s10 + h22 * s20) * 1024);
            const m21 = Math.round((h20 * s01 + h21 * s11 + h22 * s21) * 1024);
            const m22 = Math.round((h20 * s02 + h21 * s12 + h22 * s22) * 1024);

            const srcData = slotObj.baseStampData.data;
            if (!slotObj.scratchImgData || slotObj.scratchImgData.width !== sW || slotObj.scratchImgData.height !== sH) {
                slotObj.scratchImgData = tCtx.createImageData(sW, sH);
            }
            const dstData = slotObj.scratchImgData.data;
            const len = srcData.length;
            for (let i = 0; i < len; i += 4) {
                const a = srcData[i + 3];
                if (a === 0) {
                    dstData[i + 3] = 0;
                    continue;
                }
                const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
                dstData[i]     = (r * m00 + g * m01 + b * m02) >> 10;
                dstData[i + 1] = (r * m10 + g * m11 + b * m12) >> 10;
                dstData[i + 2] = (r * m20 + g * m21 + b * m22) >> 10;
                dstData[i + 3] = a;
            }
            tCtx.putImageData(slotObj.scratchImgData, 0, 0);
        } else {
            return null;
        }

        if (symmetry !== 'none' && !(kaleidoMorph && curOptions.animate !== false)) {
            const baked = document.createElement('canvas');
            baked.width = sW;
            baked.height = sH;
            renderKaleidoCell(baked.getContext('2d'), c, sW, sH, 0);
            slotObj.iconHueCache.set(idx, baked);
            return baked;
        }

        slotObj.iconHueCache.set(idx, c);
        return c;
    }

    function getDynamicKaleidoStamp(slotObj, hueSlot, t) {
        const { currentFrameId } = state;
        const idx = ((hueSlot % 16) + 16) % 16;
        if (slotObj.kaleidoSlotFrameTags[idx] === currentFrameId && slotObj.kaleidoSlotCanvases[idx]) {
            return slotObj.kaleidoSlotCanvases[idx];
        }
        const sW = slotObj.stampW;
        const sH = slotObj.stampH;
        let kc = slotObj.kaleidoSlotCanvases[idx];
        if (!kc) {
            kc = document.createElement('canvas');
            slotObj.kaleidoSlotCanvases[idx] = kc;
        }
        if (kc.width !== sW || kc.height !== sH) {
            kc.width = sW;
            kc.height = sH;
        }
        const tintedRaw = getTintedIconStamp(slotObj, idx) || slotObj.rawStampCanvas;
        renderKaleidoCell(kc.getContext('2d'), tintedRaw, sW, sH, t);
        slotObj.kaleidoSlotFrameTags[idx] = currentFrameId;
        return kc;
    }

    function renderKaleidoCell(targetCtx, srcBitmap, sW, sH, t) {
        const { curOptions, symmetry, kaleidoMorph, kaleidoSpeed, kaleidoDirection, kaleidoDepth, tileAngleRad, wedges } = state;
        if (!targetCtx || !srcBitmap) return;
        const halfW = sW / 2;
        const halfH = sH / 2;
        targetCtx.clearRect(0, 0, sW, sH);
        const isMorphing = kaleidoMorph && curOptions.animate !== false;
        const dir = kaleidoDirection === 'ccw' ? -1 : 1;
        const kPhase = isMorphing ? (t / kaleidoSpeed) * Math.PI * 2 * dir : 0;
        const drift = isMorphing ? Math.sin(kPhase * 0.5) * sW * 0.18 * kaleidoDepth : 0;

        if (symmetry === 'quad') {
            const quads = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
            const pW = sW * 0.54, pH = sH * 0.54;
            const cW = sW * 0.34, cH = sH * 0.34;
            for (const [qx, qy] of quads) {
                targetCtx.save();
                targetCtx.translate(halfW, halfH);
                targetCtx.scale(qx, qy);
                targetCtx.beginPath();
                targetCtx.rect(-0.75, -0.75, halfW + 1.5, halfH + 1.5);
                targetCtx.clip();

                // Primary quadrant medallion motif angled toward mirror center
                targetCtx.save();
                targetCtx.translate(halfW * 0.48 + drift * 0.45, halfH * 0.48 + drift * 0.45);
                targetCtx.rotate(kPhase + tileAngleRad - Math.PI / 4);
                targetCtx.drawImage(srcBitmap, -pW / 2, -pH / 2, pW, pH);
                targetCtx.restore();

                // Central crosshair diamond bridge
                targetCtx.save();
                targetCtx.globalAlpha = 0.82;
                targetCtx.translate(halfW * 0.14 - drift * 0.25, halfH * 0.14 - drift * 0.25);
                targetCtx.rotate(-kPhase * 0.75 + tileAngleRad + Math.PI / 4);
                targetCtx.drawImage(srcBitmap, -cW / 2, -cH / 2, cW, cH);
                targetCtx.restore();

                targetCtx.restore();
            }
        } else {
            // Radial Mandala
            const numWedges = Math.max(4, wedges || 6);
            const wedgeAngle = (Math.PI * 2) / numWedges;
            const r = Math.hypot(halfW, halfH) * 1.05;
            const pW = sW * 0.62, pH = sH * 0.62;
            const cW = sW * 0.36, cH = sH * 0.36;
            for (let i = 0; i < numWedges; i++) {
                targetCtx.save();
                targetCtx.translate(halfW, halfH);
                targetCtx.rotate(i * wedgeAngle - Math.PI / 2);
                if (i & 1) targetCtx.scale(1, -1);
                targetCtx.beginPath();
                targetCtx.moveTo(0, 0);
                targetCtx.arc(0, 0, r, -wedgeAngle / 2 - 0.018, wedgeAngle / 2 + 0.018);
                targetCtx.closePath();
                targetCtx.clip();

                // Outer radial petal
                targetCtx.save();
                targetCtx.translate(halfW * 0.46 + drift, drift * 0.22);
                targetCtx.rotate(kPhase + tileAngleRad + Math.PI / 2);
                targetCtx.drawImage(srcBitmap, -pW / 2, -pH / 2, pW, pH);
                targetCtx.restore();

                // Inner mandala rosette core
                targetCtx.save();
                targetCtx.globalAlpha = 0.86;
                targetCtx.translate(halfW * 0.16 - drift * 0.35, 0);
                targetCtx.rotate(-kPhase * 0.65 + tileAngleRad);
                targetCtx.drawImage(srcBitmap, -cW / 2, -cH / 2, cW, cH);
                targetCtx.restore();

                targetCtx.restore();
            }
        }
    }

    function updateKaleidoCell(slotObj, t) {
        if (!slotObj.cellCtx) return;
        renderKaleidoCell(slotObj.cellCtx, slotObj.rawStampCanvas, slotObj.stampW, slotObj.stampH, t);
    }

    return { captureBaseStampData, computeSlotDimensions, buildStampFromImage, buildStampFromIcon, getTintedIconStamp, getDynamicKaleidoStamp, updateKaleidoCell };
}

export { createSlotState, createPatternStampRenderer, drawSamplePatternStamp, faGlyphCache };
