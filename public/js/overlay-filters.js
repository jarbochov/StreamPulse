/**
 * StreamPulse - Overlay Filters & Genuine Pixel Engine
 * Modularized image processing, ordered dithering, error diffusion, halftone screentones, and SVG filters.
 */
(function (root) {
    'use strict';

    // Numeric option with a real fallback (Number(x) ?? d never falls back because Number() yields NaN).
    const numOr = (value, fallback) => {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : fallback;
    };

    // ---- Filter Defaults & Presets ----
    const defaultHalftone = () => ({
        mode: 'none', size: 8, angle: 45, threshold: 50, softness: 12,
        pixelSize: 1, levels: 4, colorMode: 'manga',
        inkColor: '#0f172a', paperColor: '#ffffff', invert: false,
        fadeMode: 'none', fadeAngle: 135, fadeCenterX: 50, fadeCenterY: 50,
        fadeStart: 15, fadeEnd: 85, fadeInvert: false, fadeStyle: 'dots',
        customMatrix: '0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5'
    });

    const defaultMediaFilter = () => ({
        blur: 0, brightness: 100, contrast: 100, saturate: 100, grayscale: 0,
        tint: { enabled: false, color: '#000000', opacity: 0.4 },
        duotone: { enabled: false, dark: '#1b1464', light: '#ff9de2', animate: 'none', dark2: '#0b3d2e', light2: '#7dffb2', speed: 6 },
        grain: { enabled: false, amount: 0.25, size: 1, animate: true },
        halftone: defaultHalftone()
    });

    const MEDIA_FILTER_PRESETS = [
        ['none', 'None', defaultMediaFilter()],
        ['dark', 'Dark background', { ...defaultMediaFilter(), brightness: 45 }],
        ['soft', 'Soft blur', { ...defaultMediaFilter(), blur: 12, brightness: 80 }],
        ['dim-blur', 'Dim and blur', { ...defaultMediaFilter(), blur: 10, brightness: 55, saturate: 80 }],
        ['noir', 'Noir', { ...defaultMediaFilter(), grayscale: 100, contrast: 125, brightness: 80 }],
        ['dusk', 'Duotone dusk', { ...defaultMediaFilter(), duotone: { enabled: true, dark: '#1b1464', light: '#ff9de2' } }],
        ['mono-green', 'Duotone green', { ...defaultMediaFilter(), duotone: { enabled: true, dark: '#031a0f', light: '#7dffb2' } }],
        ['sepia', 'Duotone sepia', { ...defaultMediaFilter(), duotone: { enabled: true, dark: '#2b1a0c', light: '#f3d9a6' } }],
        ['manga-tone', 'Manga screentone', { ...defaultMediaFilter(), contrast: 115, halftone: { ...defaultHalftone(), mode: 'dots', size: 7, angle: 45, threshold: 50, softness: 8, colorMode: 'manga', inkColor: '#0f172a', paperColor: '#ffffff' } }],
        ['pop-halftone', 'Pop art halftone', { ...defaultMediaFilter(), contrast: 120, saturate: 135, halftone: { ...defaultHalftone(), mode: 'dots', size: 9, angle: 30, threshold: 52, softness: 10, colorMode: 'color', levels: 2 } }],
        ['comic-fade', 'Comic corner fade (ink only)', { ...defaultMediaFilter(), halftone: { ...defaultHalftone(), mode: 'dots', size: 10, angle: 45, threshold: 55, softness: 8, colorMode: 'ink-only', inkColor: '#00f5d4', fadeMode: 'linear', fadeAngle: 135, fadeStart: 10, fadeEnd: 85, fadeStyle: 'dots' } }],
        ['bayer-retro', 'Retro Bayer dither', { ...defaultMediaFilter(), contrast: 110, halftone: { ...defaultHalftone(), mode: 'bayer-8', size: 3, threshold: 50, colorMode: 'color', levels: 4 } }],
        ['mac-atkinson', 'Macintosh 1-bit Atkinson', { ...defaultMediaFilter(), contrast: 115, halftone: { ...defaultHalftone(), mode: 'atkinson', size: 2, threshold: 50, colorMode: 'manga', inkColor: '#111827', paperColor: '#f8fafc' } }],
        ['pixel-16bit', '16-bit pixel art', { ...defaultMediaFilter(), saturate: 115, halftone: { ...defaultHalftone(), mode: 'pixelate', size: 6, levels: 6 } }]
    ];

    function mediaFilterActive(f) {
        if (!f) return false;
        const htMode = f.halftone?.mode;
        return f.blur > 0 || f.brightness !== 100 || f.contrast !== 100 || f.saturate !== 100 || f.grayscale > 0 || f.tint?.enabled || f.duotone?.enabled || f.grain?.enabled || (!!htMode && htMode !== 'none');
    }

    // ---- Ordered Matrices Suite ----
    const BAYER_2 = new Uint8Array([0, 2, 3, 1]);
    const BAYER_4 = new Uint8Array([
        0,  8,  2, 10,
       12,  4, 14,  6,
        3, 11,  1,  9,
       15,  7, 13,  5
    ]);
    const BAYER_8 = new Uint8Array([
        0, 32,  8, 40,  2, 34, 10, 42,
       48, 16, 56, 24, 50, 18, 58, 26,
       12, 44,  4, 36, 14, 46,  6, 38,
       60, 28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43,  1, 33,  9, 41,
       51, 19, 59, 27, 49, 17, 57, 25,
       15, 47,  7, 39, 13, 45,  5, 37,
       63, 31, 55, 23, 61, 29, 53, 21
    ]);
    const BAYER_16 = (() => {
        const out = new Uint8Array(256);
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const qx = x >= 8 ? 1 : 0, qy = y >= 8 ? 1 : 0;
                const sub = BAYER_8[(y % 8) * 8 + (x % 8)];
                const offset = qy === 0 ? (qx === 0 ? 0 : 2) : (qx === 0 ? 3 : 1);
                out[y * 16 + x] = (sub << 2) + offset;
            }
        }
        return out;
    })();

    const CLUSTER_4 = new Uint8Array([
       12,  5,  6, 13,
        4,  0,  1,  7,
       11,  3,  2,  8,
       15, 10,  9, 14
    ]);

    const CLUSTER_8 = new Uint8Array([
       24, 10, 12, 26, 35, 47, 49, 37,
        8,  0,  2, 14, 45, 59, 61, 51,
       22,  6,  4, 16, 43, 57, 63, 53,
       30, 18, 20, 28, 33, 41, 55, 39,
       34, 46, 48, 36, 25, 11, 13, 27,
       44, 58, 60, 50,  9,  1,  3, 15,
       42, 56, 62, 52, 23,  7,  5, 17,
       32, 40, 54, 38, 31, 19, 21, 29
    ]);

    const LINES_H = new Uint8Array([0, 1, 2, 3]);

    const BLUE_NOISE_16 = new Uint8Array([
       143,  19,  83, 179, 103,  23, 163,  95,  35, 135,  47, 191,  67, 151,  11, 115,
        71, 227, 123,  43, 203, 139,  59, 219,   7, 171,  99, 127,  15, 223, 175,  51,
       187,   3, 159, 247,  87,  31, 175, 111,  79, 235,  39, 207,  75, 131,  91, 199,
        39, 119,  67, 135, 167, 215,   3,  47, 147,  19, 155,  55, 179, 243,  35, 127,
       231, 195,  91,  15, 111,  51, 131, 227,  99, 183, 107, 219,  99,  19, 163,  67,
        11, 155, 251, 171,  35, 191,  83,  27, 167,  31, 247,  11, 139, 227,  79, 211,
       135,  75,  31, 127, 223,  95, 147, 243, 119,  71, 127,  79, 187,  43, 115, 147,
       215, 179, 207,  59,  11, 183,  39,  71, 199, 159, 211, 171,  27, 235,  87,   3,
        55, 107,  23, 143, 239,  75, 155, 215,  15,  91,  43, 103, 247, 159,  31, 179,
       163, 247,  87, 175,  47, 119,   7, 107, 179, 239, 135,   7,  63, 123, 207,  99,
        19, 131, 223,  39, 199, 159, 231,  55, 139,  67, 195, 147, 211,  87,  47, 139,
        95,  63, 115, 191,  79,  27,  91, 187,  23, 227,  27,  91, 175,  15, 171, 235,
       203, 239,  11, 151, 251, 135, 211,  43, 123, 171, 115, 239,  51, 135, 247,  71,
        35, 167,  75, 103,  47, 171,   3, 159,  87,   3, 203,  71, 183, 107,  23, 187,
       127, 219, 139, 227,  87, 223,  79, 235,  51, 147,  39, 155,  31, 215, 151,  59,
        83,  43, 183,  19, 163,  31, 119,  27, 191, 103, 251, 119, 231,  95, 119, 195
    ]);

    function parseCustomMatrix(str) {
        if (!str || typeof str !== 'string') return { mat: BAYER_4, size: 4, denom: 16 };
        const nums = str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        if (nums.length < 4) return { mat: BAYER_4, size: 4, denom: 16 };
        const size = Math.floor(Math.sqrt(nums.length));
        const count = size * size;
        const mat = new Uint8Array(nums.slice(0, count));
        let maxVal = 0;
        for (let i = 0; i < count; i++) if (mat[i] > maxVal) maxVal = mat[i];
        return { mat, size, denom: Math.max(1, maxVal + 1) };
    }

    function getOrderedMatrix(mode, customStr) {
        switch (mode) {
            case 'bayer-2': return { mat: BAYER_2, size: 2, denom: 4 };
            case 'bayer-4': return { mat: BAYER_4, size: 4, denom: 16 };
            case 'bayer':
            case 'bayer-8': return { mat: BAYER_8, size: 8, denom: 64 };
            case 'bayer-16': return { mat: BAYER_16, size: 16, denom: 256 };
            case 'cluster-4': return { mat: CLUSTER_4, size: 4, denom: 16 };
            case 'cluster-8': return { mat: CLUSTER_8, size: 8, denom: 64 };
            case 'lines-h': return { mat: LINES_H, size: 4, denom: 4 };
            case 'blue-noise': return { mat: BLUE_NOISE_16, size: 16, denom: 256 };
            case 'custom': return parseCustomMatrix(customStr);
            default: return { mat: BAYER_8, size: 8, denom: 64 };
        }
    }

    // ---- Error Diffusion Kernels Suite ----
    function getErrorKernel(mode) {
        switch (mode) {
            case 'atkinson':
                return {
                    kernel: [
                        [ 1, 0, 1 ], [ 2, 0, 1 ],
                        [-1, 1, 1 ], [ 0, 1, 1 ], [ 1, 1, 1 ],
                        [ 0, 2, 1 ]
                    ],
                    denom: 8,
                    discard: 0.25
                };
            case 'sierra-lite':
                return {
                    kernel: [
                        [ 1, 0, 2 ],
                        [-1, 1, 1 ], [ 0, 1, 1 ]
                    ],
                    denom: 4,
                    discard: 0
                };
            case 'sierra':
                return {
                    kernel: [
                        [ 1, 0, 5 ], [ 2, 0, 3 ],
                        [-2, 1, 2 ], [-1, 1, 4 ], [ 0, 1, 5 ], [ 1, 1, 4 ], [ 2, 1, 2 ],
                        [-1, 2, 2 ], [ 0, 2, 3 ], [ 1, 2, 2 ]
                    ],
                    denom: 32,
                    discard: 0
                };
            case 'burkes':
                return {
                    kernel: [
                        [ 1, 0, 8 ], [ 2, 0, 4 ],
                        [-2, 1, 2 ], [-1, 1, 4 ], [ 0, 1, 8 ], [ 1, 1, 4 ], [ 2, 1, 2 ]
                    ],
                    denom: 32,
                    discard: 0
                };
            case 'jarvis':
                return {
                    kernel: [
                        [ 1, 0, 7 ], [ 2, 0, 5 ],
                        [-2, 1, 3 ], [-1, 1, 5 ], [ 0, 1, 7 ], [ 1, 1, 5 ], [ 2, 1, 3 ],
                        [-2, 2, 1 ], [-1, 2, 3 ], [ 0, 2, 5 ], [ 1, 2, 3 ], [ 2, 2, 1 ]
                    ],
                    denom: 48,
                    discard: 0
                };
            case 'floyd-steinberg':
            default:
                return {
                    kernel: [
                        [ 1, 0, 7 ],
                        [-1, 1, 3 ], [ 0, 1, 5 ], [ 1, 1, 1 ]
                    ],
                    denom: 16,
                    discard: 0
                };
        }
    }

    // Scanline error buffers (allocated once and grown as needed)
    let ERR_BUF_0 = null, ERR_BUF_1 = null, ERR_BUF_2 = null;
    let errBufWidth = 0;
    function getErrorBuffers(w) {
        if (!ERR_BUF_0 || errBufWidth < w) {
            errBufWidth = Math.max(w, 1024);
            ERR_BUF_0 = new Float32Array(errBufWidth * 3);
            ERR_BUF_1 = new Float32Array(errBufWidth * 3);
            ERR_BUF_2 = new Float32Array(errBufWidth * 3);
        }
        ERR_BUF_0.fill(0);
        ERR_BUF_1.fill(0);
        ERR_BUF_2.fill(0);
        return [ERR_BUF_0, ERR_BUF_1, ERR_BUF_2];
    }

    function runErrorDiffusionAlgorithm(w, h, data, kernel, denom, discard, threshVal, colorMode, levels, inkRgb, paperRgb, invert, fadeOpts) {
        const [eb0, eb1, eb2] = getErrorBuffers(w);
        const invDenom = 1 / denom;
        const pR = paperRgb[0], pG = paperRgb[1], pB = paperRgb[2];
        const iR = inkRgb[0], iG = inkRgb[1], iB = inkRgb[2];
        const isLinearFade = fadeOpts?.isLinear;
        const { fStepX, invDiag, fS0, fS1, invSpan, fCenterX, fCenterY, invMaxR, fInv, sinFA } = fadeOpts || {};

        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            let fadeD = isLinearFade ? (y * sinFA * invDiag) : 0;
            const dy = y - fCenterY;
            const dy2 = dy * dy;

            for (let x = 0; x < w; x++, fadeD += fStepX) {
                const idx = row + (x << 2);
                if (data[idx + 3] === 0) continue; // Preserve transparency!

                const ebIdx = x * 3;
                let r = data[idx] + eb0[ebIdx];
                let g = data[idx + 1] + eb0[ebIdx + 1];
                let b = data[idx + 2] + eb0[ebIdx + 2];

                let fade = 1;
                if (fadeOpts) {
                    const d = isLinearFade ? fadeD : Math.sqrt((x - fCenterX) * (x - fCenterX) + dy2) * invMaxR;
                    const rawT = d < fS0 ? 0 : (d > fS1 ? 1 : (d - fS0) * invSpan);
                    fade = fInv ? 1 - rawT : rawT;
                }

                if (colorMode === 'color') {
                    const step = 255 / (levels - 1);
                    const qR = Math.max(0, Math.min(255, Math.round(r / step) * step));
                    const qG = Math.max(0, Math.min(255, Math.round(g / step) * step));
                    const qB = Math.max(0, Math.min(255, Math.round(b / step) * step));

                    const errR = (r - qR) * (1 - discard);
                    const errG = (g - qG) * (1 - discard);
                    const errB = (b - qB) * (1 - discard);

                    data[idx] = (data[idx] * (1 - fade) + qR * fade) | 0;
                    data[idx + 1] = (data[idx + 1] * (1 - fade) + qG * fade) | 0;
                    data[idx + 2] = (data[idx + 2] * (1 - fade) + qB * fade) | 0;
                    data[idx + 3] = 255;

                    for (let k = 0; k < kernel.length; k++) {
                        const [kx, ky, weight] = kernel[k];
                        const nx = x + kx;
                        if (nx < 0 || nx >= w) continue;
                        const factor = weight * invDenom;
                        const nBuf = ky === 0 ? eb0 : (ky === 1 ? eb1 : eb2);
                        const nIdx = nx * 3;
                        nBuf[nIdx] += errR * factor;
                        nBuf[nIdx + 1] += errG * factor;
                        nBuf[nIdx + 2] += errB * factor;
                    }
                } else {
                    let lum = (r * 54 + g * 183 + b * 19) / 65280;
                    if (invert) lum = 1 - lum;

                    let qLum = lum >= threshVal ? 1 : 0;
                    if (fadeOpts) {
                        lum = lum + (1 - fade) * (1 - lum);
                        qLum = lum >= threshVal ? 1 : 0;
                    }

                    const err = ((lum - qLum) * 255 * (1 - discard));
                    const isInk = qLum === 0;

                    if (colorMode === 'manga') {
                        data[idx] = isInk ? iR : pR;
                        data[idx + 1] = isInk ? iG : pG;
                        data[idx + 2] = isInk ? iB : pB;
                        data[idx + 3] = 255;
                    } else if (colorMode === 'ink-only') {
                        data[idx] = iR;
                        data[idx + 1] = iG;
                        data[idx + 2] = iB;
                        data[idx + 3] = isInk ? 255 : 0;
                    } else {
                        const factor = isInk ? 0.25 : 1;
                        data[idx] = (data[idx] * factor) | 0;
                        data[idx + 1] = (data[idx + 1] * factor) | 0;
                        data[idx + 2] = (data[idx + 2] * factor) | 0;
                        data[idx + 3] = 255;
                    }

                    for (let k = 0; k < kernel.length; k++) {
                        const [kx, ky, weight] = kernel[k];
                        const nx = x + kx;
                        if (nx < 0 || nx >= w) continue;
                        const factor = weight * invDenom;
                        const nBuf = ky === 0 ? eb0 : (ky === 1 ? eb1 : eb2);
                        const nIdx = nx * 3;
                        nBuf[nIdx] += err * factor;
                        nBuf[nIdx + 1] += err * factor;
                        nBuf[nIdx + 2] += err * factor;
                    }
                }
            }

            // Roll scanline buffers
            eb0.set(eb1);
            eb1.set(eb2);
            eb2.fill(0);
        }
    }

    // Precomputed 2048-entry Cosine Lookup Table
    const COS_LUT = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
        COS_LUT[i] = Math.cos((i / 2048) * Math.PI * 2);
    }

    // Direct mathematical rasterizers for shapes and gradients
    function fillSolidPixels(buf, w, h, color) {
        let r = 255, g = 255, b = 255, a = 255;
        if (typeof color === 'string' && color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 6) {
                r = parseInt(hex.slice(0, 2), 16) || 0;
                g = parseInt(hex.slice(2, 4), 16) || 0;
                b = parseInt(hex.slice(4, 6), 16) || 0;
            } else if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16) || 0;
                g = parseInt(hex[1] + hex[1], 16) || 0;
                b = parseInt(hex[2] + hex[2], 16) || 0;
            }
        }
        for (let i = 0; i < buf.length; i += 4) {
            buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
        }
    }

    function fillGradientPixels(buf, w, h, grad) {
        const hexToRgb = hex => {
            const s = String(hex || '#000000').replace('#', '');
            if (s.length === 6) return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
            if (s.length === 3) return [parseInt(s[0] + s[0], 16) || 0, parseInt(s[1] + s[1], 16) || 0, parseInt(s[2] + s[2], 16) || 0];
            return [0, 0, 0];
        };
        const c0 = hexToRgb(grad.from || '#38bdf8');
        const c1 = hexToRgb(grad.to || '#6366f1');
        const cm = grad.via ? hexToRgb(grad.via) : null;
        const isRad = grad.type === 'radial';

        if (isRad) {
            const cx = w * 0.5, cy = h * 0.5;
            const maxR = Math.hypot(cx, cy) || 1;
            for (let y = 0; y < h; y++) {
                const dy = y - cy;
                const row = y * w * 4;
                for (let x = 0; x < w; x++) {
                    const dx = x - cx;
                    const t = Math.min(1, Math.hypot(dx, dy) / maxR);
                    const idx = row + (x << 2);
                    let r, gVal, b;
                    if (cm) {
                        if (t < 0.5) {
                            const sub = t * 2;
                            r = c0[0] + (cm[0] - c0[0]) * sub;
                            gVal = c0[1] + (cm[1] - c0[1]) * sub;
                            b = c0[2] + (cm[2] - c0[2]) * sub;
                        } else {
                            const sub = (t - 0.5) * 2;
                            r = cm[0] + (c1[0] - cm[0]) * sub;
                            gVal = cm[1] + (c1[1] - cm[1]) * sub;
                            b = cm[2] + (c1[2] - cm[2]) * sub;
                        }
                    } else {
                        r = c0[0] + (c1[0] - c0[0]) * t;
                        gVal = c0[1] + (c1[1] - c0[1]) * t;
                        b = c0[2] + (c1[2] - c0[2]) * t;
                    }
                    buf[idx] = r | 0; buf[idx + 1] = gVal | 0; buf[idx + 2] = b | 0; buf[idx + 3] = 255;
                }
            }
        } else {
            const angle = ((Number(grad.angle) || 90) * Math.PI) / 180;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const diag = Math.abs(w * cosA) + Math.abs(h * sinA) || 1;
            const invDiag = 1 / diag;
            const stepX = cosA * invDiag;
            for (let y = 0; y < h; y++) {
                let t = (y * sinA) * invDiag;
                const row = y * w * 4;
                for (let x = 0; x < w; x++, t += stepX) {
                    const cl = t < 0 ? 0 : (t > 1 ? 1 : t);
                    const idx = row + (x << 2);
                    let r, gVal, b;
                    if (cm) {
                        if (cl < 0.5) {
                            const sub = cl * 2;
                            r = c0[0] + (cm[0] - c0[0]) * sub;
                            gVal = c0[1] + (cm[1] - c0[1]) * sub;
                            b = c0[2] + (cm[2] - c0[2]) * sub;
                        } else {
                            const sub = (cl - 0.5) * 2;
                            r = cm[0] + (c1[0] - cm[0]) * sub;
                            gVal = cm[1] + (c1[1] - cm[1]) * sub;
                            b = cm[2] + (c1[2] - cm[2]) * sub;
                        }
                    } else {
                        r = c0[0] + (c1[0] - c0[0]) * cl;
                        gVal = c0[1] + (c1[1] - c0[1]) * cl;
                        b = c0[2] + (c1[2] - c0[2]) * cl;
                    }
                    buf[idx] = r | 0; buf[idx + 1] = gVal | 0; buf[idx + 2] = b | 0; buf[idx + 3] = 255;
                }
            }
        }
    }

    /**
     * Draws an image or video onto a canvas while strictly respecting CSS object-fit
     * ('cover' [Fill to fit / crop], 'contain' [letterbox], 'fill', etc.) and focus point.
     */
    function drawMediaWithFit(ctx, mediaEl, pw, ph, fit = 'cover', fx = 0.5, fy = 0.5) {
        const iw = mediaEl.naturalWidth || mediaEl.videoWidth || mediaEl.width || pw;
        const ih = mediaEl.naturalHeight || mediaEl.videoHeight || mediaEl.height || ph;
        if (iw <= 0 || ih <= 0) return;

        ctx.clearRect(0, 0, pw, ph);

        if (fit === 'fill') {
            ctx.drawImage(mediaEl, 0, 0, pw, ph);
        } else {
            const scale = fit === 'contain'
                ? Math.min(pw / iw, ph / ih)
                : fit === 'none'
                    ? 1
                    : fit === 'scale-down'
                        ? Math.min(1, Math.min(pw / iw, ph / ih))
                        : Math.max(pw / iw, ph / ih); // 'cover' is default (Fill, crop to fit)
            const dw = iw * scale;
            const dh = ih * scale;
            const dx = (pw - dw) * fx;
            const dy = (ph - dh) * fy;
            ctx.drawImage(mediaEl, dx, dy, dw, dh);
        }
    }

    /**
     * Bakes the CSS-style brightness / contrast / saturate / grayscale controls into RGBA source pixels
     * (same order and math as the CSS filter chain). Runs before dithering so the adjustments change which
     * pixels turn to ink instead of being lost under the opaque dither canvas.
     */
    function bakeAdjustments(px, f) {
        const br = (f.brightness ?? 100) / 100;
        const co = (f.contrast ?? 100) / 100;
        const sa = (f.saturate ?? 100) / 100;
        const gr = Math.max(0, Math.min(1, (f.grayscale ?? 0) / 100));
        if (br === 1 && co === 1 && sa === 1 && gr === 0) return;
        const a = 1 - gr;
        const s0 = 0.213 + 0.787 * sa, s1 = 0.715 - 0.715 * sa, s2 = 0.072 - 0.072 * sa;
        const s3 = 0.213 - 0.213 * sa, s4 = 0.715 + 0.285 * sa, s5 = 0.072 - 0.072 * sa;
        const s6 = 0.213 - 0.213 * sa, s7 = 0.715 - 0.715 * sa, s8 = 0.072 + 0.928 * sa;
        const g0 = 0.2126 + 0.7874 * a, g1 = 0.7152 - 0.7152 * a, g2 = 0.0722 - 0.0722 * a;
        const g3 = 0.2126 - 0.2126 * a, g4 = 0.7152 + 0.2848 * a, g5 = 0.0722 - 0.0722 * a;
        const g6 = 0.2126 - 0.2126 * a, g7 = 0.7152 - 0.7152 * a, g8 = 0.0722 + 0.9278 * a;
        const off = 127.5 * (1 - co);
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] === 0) continue;
            let r = px[i] * br * co + off, g = px[i + 1] * br * co + off, b = px[i + 2] * br * co + off;
            r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
            const sr = r * s0 + g * s1 + b * s2, sg = r * s3 + g * s4 + b * s5, sb = r * s6 + g * s7 + b * s8;
            px[i] = sr * g0 + sg * g1 + sb * g2;
            px[i + 1] = sr * g3 + sg * g4 + sb * g5;
            px[i + 2] = sr * g6 + sg * g7 + sb * g8;
        }
    }

    function buildCssFadeGradient(ht, forMask) {
        const mode = ht.fadeMode || 'none';
        if (mode === 'none') return '';
        const angle = Math.round(numOr(ht.fadeAngle, 135));
        const s0 = Math.max(0, Math.min(99, numOr(ht.fadeStart, 15)));
        const s1 = Math.max(s0 + 1, Math.min(100, numOr(ht.fadeEnd, 85)));
        const cx = Math.max(0, Math.min(100, numOr(ht.fadeCenterX, 50)));
        const cy = Math.max(0, Math.min(100, numOr(ht.fadeCenterY, 50)));
        const inv = Boolean(ht.fadeInvert);

        let c0, c1;
        if (forMask) {
            c0 = inv ? 'transparent' : '#000';
            c1 = inv ? '#000' : 'transparent';
        } else {
            const biasRgb = ht.invert ? '0,0,0' : '255,255,255';
            c0 = inv ? `rgba(${biasRgb},1)` : `rgba(${biasRgb},0)`;
            c1 = inv ? `rgba(${biasRgb},0)` : `rgba(${biasRgb},1)`;
        }
        return mode === 'radial'
            ? `radial-gradient(circle at ${cx}% ${cy}%, ${c0} ${s0}%, ${c1} ${s1}%)`
            : `linear-gradient(${angle}deg, ${c0} ${s0}%, ${c1} ${s1}%)`;
    }

    /**
     * Genuine Dither & Halftone Render Engine
     * Zero-flash canvas rendering with reusable buffers and aspect-ratio preservation.
     */
    function renderDitherHalftone(canvas, element, node, ht, target) {
        const rawMode = ht.mode || 'none';
        const htMode = rawMode === 'bayer' ? 'bayer-8' : (rawMode === 'atkinson' ? 'atkinson' : rawMode);
        if (htMode === 'none') return;

        const isOrdered = htMode.startsWith('bayer') || htMode.startsWith('cluster') || htMode === 'lines-h' || htMode === 'blue-noise' || htMode === 'custom';
        const isErrorDiff = htMode === 'floyd-steinberg' || htMode === 'atkinson' || htMode.startsWith('sierra') || htMode === 'burkes' || htMode === 'jarvis';
        const isDither = isOrdered || isErrorDiff;
        const isPix = htMode === 'pixelate';
        const isScreen = htMode === 'dots' || htMode === 'lines' || htMode === 'crosshatch';

        const elW = Math.max(1, Math.round(Number(element.width) || node.offsetWidth || 100));
        const elH = Math.max(1, Math.round(Number(element.height) || node.offsetHeight || 100));

        let scale = 1;
        if (isDither) {
            scale = Math.max(1, Math.min(32, Math.round(Number(ht.size) || 3)));
        } else if (isPix) {
            scale = Math.max(2, Math.min(48, Math.round(Number(ht.size) || 6)));
        } else if (isScreen) {
            scale = Math.max(1, Math.min(16, Math.round(Number(ht.pixelSize) || 1)));
        }

        const maxProcessingDim = 960;
        const curMax = Math.max(elW / scale, elH / scale);
        let effScale = scale;
        if (curMax > maxProcessingDim) {
            effScale = scale * (curMax / maxProcessingDim);
        }

        const pw = Math.max(1, Math.round(elW / effScale));
        const ph = Math.max(1, Math.round(elH / effScale));

        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
        }

        const isPixelated = isDither || isPix || effScale > 1.25;
        const softVal = Math.max(0, Math.min(100, numOr(ht.softness, 12)));
        canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:inherit;${isPixelated ? 'image-rendering:pixelated;' : ''}`;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        if (!canvas._imgData || canvas._imgData.width !== pw || canvas._imgData.height !== ph) {
            canvas._imgData = ctx.createImageData(pw, ph);
            canvas._srcPixels = new Uint8ClampedArray(pw * ph * 4);
            canvas._srcSig = '';
        }
        const imgData = canvas._imgData;
        const data = imgData.data;
        const srcPixels = canvas._srcPixels;

        const s = element.style || {};
        const isImage = element.type === 'image';
        const isVideo = element.type === 'video';
        const mediaEl = isImage ? node.querySelector(':scope > img, img') : (isVideo ? node.querySelector(':scope > video, video') : null);

        const fit = s.objectFit || 'cover';
        const fx = (numOr(s.focusX, 50)) / 100;
        const fy = (numOr(s.focusY, 50)) / 100;

        const mf = element.mediaFilter || {};
        const bake = MEDIA_TYPES.has(element.type);
        const adjSig = bake ? `${mf.brightness ?? 100},${mf.contrast ?? 100},${mf.saturate ?? 100},${mf.grayscale ?? 0}` : '';

        const srcSig = mediaEl
            ? `${mediaEl.currentSrc || mediaEl.src}|${fit}|${fx}|${fy}|${pw}|${ph}|${adjSig}`
            : (element.type === 'shape'
                ? `${s.background}|${s.fill}|${JSON.stringify(s.gradient)}|${pw}|${ph}`
                : `${pw}|${ph}|${adjSig}`);

        if (canvas._srcSig !== srcSig) {
            if (mediaEl) {
                const isLoaded = isImage
                    ? (mediaEl.complete && mediaEl.naturalWidth > 0)
                    : (mediaEl.readyState >= 2 && mediaEl.videoWidth > 0);

                if (isLoaded) {
                    drawMediaWithFit(ctx, mediaEl, pw, ph, fit, fx, fy);
                    const readback = ctx.getImageData(0, 0, pw, ph);
                    srcPixels.set(readback.data);
                } else {
                    // Not decoded yet: leave _srcSig unset so the retry after load re-samples, and keep the
                    // media visible meanwhile. Re-run the whole filter pass so canvas/media styling matches.
                    const evt = isImage ? 'load' : 'loadeddata';
                    mediaEl.addEventListener(evt, () => {
                        if (node._fxCanvas === canvas) applyMediaFilter(node, element);
                    }, { once: true });
                    node._fxSig = '';
                    canvas._mode = '';
                    return;
                }
            } else if (element.type === 'shape') {
                if (s.gradient?.enabled) {
                    fillGradientPixels(srcPixels, pw, ph, s.gradient);
                } else {
                    fillSolidPixels(srcPixels, pw, ph, s.fill || s.background || '#ffffff');
                }
            } else {
                const subCanvas = node.querySelector('canvas.sp-pattern-canvas');
                if (subCanvas && subCanvas !== canvas) {
                    ctx.drawImage(subCanvas, 0, 0, pw, ph);
                } else if (s.background && s.background !== 'transparent') {
                    ctx.fillStyle = s.background;
                    ctx.fillRect(0, 0, pw, ph);
                } else {
                    ctx.fillStyle = '#808080';
                    ctx.fillRect(0, 0, pw, ph);
                }
                const readback = ctx.getImageData(0, 0, pw, ph);
                srcPixels.set(readback.data);
            }
            if (bake) bakeAdjustments(srcPixels, mf);
            canvas._srcSig = srcSig;
        }

        // Copy source pixels into destination buffer
        data.set(srcPixels);

        // Palette setup
        const colorMode = ht.colorMode || (isPix ? 'color' : 'manga');
        const num = hex => [1, 3, 5].map(i => parseInt(String(hex || '#000000').slice(i, i + 2), 16) || 0);
        const inkRgb = num(ht.inkColor || '#0f172a');
        const paperRgb = num(ht.paperColor || '#ffffff');
        const invert = Boolean(ht.invert);
        const threshVal = Math.max(1, Math.min(99, numOr(ht.threshold, 50))) / 100;
        const levels = Math.max(2, Math.min(16, numOr(ht.levels, 4)));

        // Fade calculation
        const fadeMode = ht.fadeMode || 'none';
        const fadeStyle = (fadeMode !== 'none' && (ht.fadeStyle === 'blend' || isPix)) ? 'blend' : 'dots';
        const hasTaper = fadeMode !== 'none' && fadeStyle === 'dots';

        const fAngle = (Math.round(numOr(ht.fadeAngle, 135)) * Math.PI) / 180;
        const cosFA = Math.cos(fAngle), sinFA = Math.sin(fAngle);
        const fDiag = Math.abs(pw * cosFA) + Math.abs(ph * sinFA) || 1;
        const fCenterX = ((Math.max(0, Math.min(100, numOr(ht.fadeCenterX, 50))) / 100) * pw);
        const fCenterY = ((Math.max(0, Math.min(100, numOr(ht.fadeCenterY, 50))) / 100) * ph);
        const fMaxR = Math.hypot(Math.max(fCenterX, pw - fCenterX), Math.max(fCenterY, ph - fCenterY)) || 1;
        const fS0 = Math.max(0, Math.min(99, numOr(ht.fadeStart, 15))) / 100;
        const fS1 = Math.max(fS0 + 0.01, Math.min(100, numOr(ht.fadeEnd, 85))) / 100;
        const fInv = Boolean(ht.fadeInvert);

        const isLinearFade = fadeMode === 'linear';
        const invDiag = 1 / fDiag;
        const fStepX = cosFA * invDiag;
        const invSpan = 1 / (fS1 - fS0);
        const invMaxR = 1 / fMaxR;

        const fadeOpts = hasTaper ? {
            isLinear: isLinearFade,
            fStepX, invDiag, fS0, fS1, invSpan,
            fCenterX, fCenterY, invMaxR, fInv, sinFA
        } : null;

        const pR = paperRgb[0], pG = paperRgb[1], pB = paperRgb[2];
        const iR = inkRgb[0], iG = inkRgb[1], iB = inkRgb[2];
        const dR = iR - pR, dG = iG - pG, dB = iB - pB;

        if (isScreen) {
            // Mathematical Halftone Screentone (Dots, Lines, Crosshatch) with precomputed Cosine LUT
            const cell = Math.max(2, (Number(ht.size) || 8) / effScale);
            const rad = ((numOr(ht.angle, 45)) * Math.PI) / 180;
            const cosA = Math.cos(rad) / cell, sinA = Math.sin(rad) / cell;
            const sf = Math.max(0.005, (softVal / 100) * 0.5);
            const k = 1 / sf;

            for (let y = 0; y < ph; y++) {
                const row = y * pw * 4;
                let u = -y * sinA;
                let v = y * cosA;
                let fadeD = isLinearFade ? (y * sinFA * invDiag) : 0;
                const dy = y - fCenterY;
                const dy2 = dy * dy;

                for (let x = 0; x < pw; x++, u += cosA, v += sinA, fadeD += fStepX) {
                    const idx = row + (x << 2);
                    if (data[idx + 3] === 0) continue; // Preserve transparency!

                    let lum = (data[idx] * 54 + data[idx + 1] * 183 + data[idx + 2] * 19) / 65280;
                    if (invert) lum = 1 - lum;

                    if (hasTaper) {
                        const d = isLinearFade ? fadeD : Math.sqrt((x - fCenterX) * (x - fCenterX) + dy2) * invMaxR;
                        const rawT = d < fS0 ? 0 : (d > fS1 ? 1 : (d - fS0) * invSpan);
                        const fade = fInv ? 1 - rawT : rawT;
                        lum = lum + (1 - fade) * (1 - lum);
                    }

                    let wave;
                    if (htMode === 'lines') {
                        const cv = COS_LUT[((v * 2048) | 0) & 2047];
                        wave = 0.5 - 0.5 * cv;
                    } else if (htMode === 'crosshatch') {
                        const cv = COS_LUT[((v * 2048) | 0) & 2047];
                        const cu = COS_LUT[((u * 2048) | 0) & 2047];
                        wave = Math.min(0.5 - 0.5 * cv, 0.5 - 0.5 * cu);
                    } else {
                        const cu = COS_LUT[((u * 2048) | 0) & 2047];
                        const cv = COS_LUT[((v * 2048) | 0) & 2047];
                        wave = 0.5 - 0.25 * (cu + cv);
                    }

                    const inkFactor = Math.max(0, Math.min(1, 0.5 + (wave - (lum + threshVal - 0.5)) * k));

                    if (colorMode === 'manga') {
                        data[idx] = (pR + dR * inkFactor) | 0;
                        data[idx + 1] = (pG + dG * inkFactor) | 0;
                        data[idx + 2] = (pB + dB * inkFactor) | 0;
                        data[idx + 3] = 255;
                    } else if (colorMode === 'ink-only') {
                        data[idx] = iR;
                        data[idx + 1] = iG;
                        data[idx + 2] = iB;
                        data[idx + 3] = (inkFactor * 255) | 0;
                    } else {
                        const factor = 1 - inkFactor * 0.75;
                        data[idx] = (data[idx] * factor) | 0;
                        data[idx + 1] = (data[idx + 1] * factor) | 0;
                        data[idx + 2] = (data[idx + 2] * factor) | 0;
                    }
                }
            }
        } else if (isOrdered) {
            // Ordered Dither Matrices (Bayer 2x2, 4x4, 8x8, 16x16, Clustered 4x4, 8x8, Lines H, Blue noise, Custom)
            const { mat, size: mSize, denom } = getOrderedMatrix(htMode, ht.customMatrix);
            const mMask = (mSize & (mSize - 1)) === 0 ? mSize - 1 : 0;

            for (let y = 0; y < ph; y++) {
                const row = y * pw * 4;
                const mRow = mMask ? (y & mMask) * mSize : (y % mSize) * mSize;
                let fadeD = isLinearFade ? (y * sinFA * invDiag) : 0;
                const dy = y - fCenterY;
                const dy2 = dy * dy;

                for (let x = 0; x < pw; x++, fadeD += fStepX) {
                    const idx = row + (x << 2);
                    if (data[idx + 3] === 0) continue; // Preserve transparency!

                    const col = mMask ? (x & mMask) : (x % mSize);
                    let mVal = (mat[mRow + col] + 0.5) / denom;
                    mVal = Math.max(0, Math.min(1, mVal + (threshVal - 0.5)));

                    let fade = 1;
                    if (hasTaper) {
                        const d = isLinearFade ? fadeD : Math.sqrt((x - fCenterX) * (x - fCenterX) + dy2) * invMaxR;
                        const rawT = d < fS0 ? 0 : (d > fS1 ? 1 : (d - fS0) * invSpan);
                        fade = fInv ? 1 - rawT : rawT;
                    }

                    if (colorMode === 'color') {
                        const step = 255 / (levels - 1);
                        const bias = (mVal - 0.5) * step * fade;
                        const qR = Math.max(0, Math.min(255, Math.round(Math.round((data[idx] + bias) / step) * step)));
                        const qG = Math.max(0, Math.min(255, Math.round(Math.round((data[idx + 1] + bias) / step) * step)));
                        const qB = Math.max(0, Math.min(255, Math.round(Math.round((data[idx + 2] + bias) / step) * step)));
                        data[idx] = (data[idx] * (1 - fade) + qR * fade) | 0;
                        data[idx + 1] = (data[idx + 1] * (1 - fade) + qG * fade) | 0;
                        data[idx + 2] = (data[idx + 2] * (1 - fade) + qB * fade) | 0;
                        data[idx + 3] = 255;
                    } else {
                        let lum = (data[idx] * 54 + data[idx + 1] * 183 + data[idx + 2] * 19) / 65280;
                        if (invert) lum = 1 - lum;

                        if (hasTaper) {
                            lum = lum + (1 - fade) * (1 - lum);
                        }

                        const isInk = lum < mVal;

                        if (colorMode === 'manga') {
                            data[idx] = isInk ? iR : pR;
                            data[idx + 1] = isInk ? iG : pG;
                            data[idx + 2] = isInk ? iB : pB;
                            data[idx + 3] = 255;
                        } else if (colorMode === 'ink-only') {
                            data[idx] = iR;
                            data[idx + 1] = iG;
                            data[idx + 2] = iB;
                            data[idx + 3] = isInk ? 255 : 0;
                        } else {
                            data[idx] = iR;
                            data[idx + 1] = iG;
                            data[idx + 2] = iB;
                            data[idx + 3] = isInk ? 255 : 0;
                        }
                    }
                }
            }
        } else if (isErrorDiff) {
            // Error Diffusion (Floyd-Steinberg, Atkinson, Sierra Lite, Sierra, Burkes, Jarvis-Judice-Ninke)
            const { kernel, denom, discard } = getErrorKernel(htMode);
            runErrorDiffusionAlgorithm(pw, ph, data, kernel, denom, discard, threshVal, colorMode, levels, inkRgb, paperRgb, invert, fadeOpts);
        } else if (isPix) {
            // Pixelate & posterize
            const step = 255 / (levels - 1);
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                data[i] = Math.round(Math.round(data[i] / step) * step);
                data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
                data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
            }
        }

        ctx.putImageData(imgData, 0, 0);

        if (fadeMode !== 'none' && fadeStyle === 'blend') {
            const maskCss = buildCssFadeGradient(ht, true);
            canvas.style.webkitMaskImage = maskCss;
            canvas.style.maskImage = maskCss;
        } else {
            canvas.style.webkitMaskImage = '';
            canvas.style.maskImage = '';
        }

        if (colorMode === 'ink-only') {
            canvas._mode = 'ink';
            canvas.style.mixBlendMode = 'multiply';
            if (mediaEl) mediaEl.style.opacity = '1';
        } else {
            canvas.style.mixBlendMode = 'normal';
            if (fadeMode !== 'none' && fadeStyle === 'blend') {
                canvas._mode = 'blend';
                if (mediaEl) mediaEl.style.opacity = '1';
            } else {
                canvas._mode = 'replace';
                if (mediaEl) mediaEl.style.opacity = '0';
            }
        }
        canvas.style.filter = canvas._fxFilter || '';
        canvas.style.transform = canvas._fxTransform || '';
    }

    // ---- SVG Definitions & Grain Tile Engine ----
    let fxCounter = 0;
    const fxAnimated = new Set();
    let fxRaf = 0;
    let fxPaused = false;
    let fxScratchCanvas = null;

    function getFxScratch(w, h) {
        if (!fxScratchCanvas) fxScratchCanvas = document.createElement('canvas');
        fxScratchCanvas.width = w;
        fxScratchCanvas.height = h;
        return fxScratchCanvas;
    }

    function fxResume() {
        if (!fxRaf && fxAnimated.size && !fxPaused && (typeof document !== 'undefined' && !document.hidden)) {
            fxRaf = requestAnimationFrame(fxLoop);
        }
    }

    function setEffectsPaused(paused) {
        fxPaused = !!paused;
        if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('sp-fx-paused', fxPaused);
        }
        fxResume();
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', fxResume);
    }

    function fxLoop(now) {
        if (fxPaused || (typeof document !== 'undefined' && document.hidden)) { fxRaf = 0; return; }
        for (const node of fxAnimated) {
            if (!node.isConnected || !node._fxAnim) { fxAnimated.delete(node); continue; }
            if (now - node._fxAnim.last < 50) continue;
            node._fxAnim.last = now;
            node._fxAnim.step(now);
        }
        fxRaf = fxAnimated.size ? requestAnimationFrame(fxLoop) : 0;
    }

    function ensureGrainStyle() {
        if (typeof document === 'undefined' || document.getElementById('sp-grain-style')) return;
        const style = document.createElement('style');
        style.id = 'sp-grain-style';
        style.textContent = '@keyframes sp-grain{0%{background-position:0 0}10%{background-position:-37px 21px}20%{background-position:19px -43px}30%{background-position:-52px -14px}40%{background-position:41px 33px}50%{background-position:-9px 58px}60%{background-position:63px -27px}70%{background-position:-28px 47px}80%{background-position:34px -56px}90%{background-position:-61px 12px}100%{background-position:0 0}}.sp-fx-paused .sp-grain{animation-play-state:paused!important}';
        document.head.append(style);
    }

    let cachedGrainCssUrl = '';
    function getGrainCssUrl() {
        if (cachedGrainCssUrl) return cachedGrainCssUrl;
        if (typeof document === 'undefined') return '';
        const S = 128;
        const c = getFxScratch(S, S);
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(S, S);
        const d = img.data;
        let seed = 0x12345678;
        for (let i = 0; i < d.length; i += 4) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const v = (seed >>> 24) & 0xff;
            d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        cachedGrainCssUrl = `url("${c.toDataURL('image/png')}")`;
        return cachedGrainCssUrl;
    }

    const MEDIA_TYPES = new Set(['image', 'video', 'slideshow', 'embed', 'pattern']);
    const FILTERABLE = element => element.type !== 'cutout';

    function ensureFxDefs() {
        if (typeof document === 'undefined') return null;
        let defs = document.getElementById('sp-fx-defs');
        if (defs) return defs;
        let svg = document.getElementById('sp-fx-root');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'sp-fx-root';
            svg.setAttribute('aria-hidden', 'true');
            svg.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;pointer-events:none;overflow:hidden;';
            const mount = document.body || document.documentElement;
            mount.appendChild(svg);
        }
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.id = 'sp-fx-defs';
        svg.appendChild(defs);
        return defs;
    }

    // Builds the per-node SVG duotone (gradient map) filter. It only maps luminance to the dark/light pair,
    // so it composes with any renderer; applyMediaFilter decides which element (media or dither canvas) wears it.
    function syncLightweightSvgFilter(node, element, f) {
        if (typeof document === 'undefined') return false;
        const hasDuo = !!f.duotone?.enabled;

        if (!hasDuo) {
            if (node._fxId) {
                document.getElementById(node._fxId)?.remove();
            }
            node._fxAnim = null;
            fxAnimated.delete(node);
            return false;
        }

        if (!node._fxId) {
            node._fxId = `sp-duo-${String(element.id || 'x').replace(/[^a-z0-9_-]/gi, '')}-${++fxCounter}`;
        }
        const defs = ensureFxDefs();
        if (!defs) return false;
        let filterEl = document.getElementById(node._fxId);
        if (!filterEl) {
            filterEl = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            filterEl.id = node._fxId;
            filterEl.setAttribute('color-interpolation-filters', 'sRGB');
            defs.appendChild(filterEl);
        }

        const rgb = hex => [1, 3, 5].map(i => (parseInt(String(hex || '#000000').slice(i, i + 2), 16) / 255).toFixed(4));
        const mode = f.duotone.animate;
        const blend = mode === 'blend' || mode === 'both';
        const hue = mode === 'hue' || mode === 'both';

        const [dr, dg, db] = rgb(f.duotone.dark);
        const [lr, lg, lb] = rgb(f.duotone.light);
        const inner = `<feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"/><feComponentTransfer color-interpolation-filters="sRGB"><feFuncR class="sp-r" type="table" tableValues="${dr} ${lr}"/><feFuncG class="sp-g" type="table" tableValues="${dg} ${lg}"/><feFuncB class="sp-b" type="table" tableValues="${db} ${lb}"/></feComponentTransfer>${hue ? '<feColorMatrix class="sp-hue" type="hueRotate" values="0"/>' : ''}`;

        if (filterEl.dataset.sig !== inner) {
            filterEl.innerHTML = inner;
            filterEl.dataset.sig = inner;
        }

        if (blend || hue) {
            const speed = Math.max(0.5, Math.min(60, Number(f.duotone.speed) || 6));
            const period = speed * 1000;
            const darkA = rgb(f.duotone.dark).map(Number);
            const lightA = rgb(f.duotone.light).map(Number);
            const darkB = rgb(f.duotone.dark2 || f.duotone.dark).map(Number);
            const lightB = rgb(f.duotone.light2 || f.duotone.light).map(Number);
            const rEl = filterEl.querySelector('.sp-r');
            const gEl = filterEl.querySelector('.sp-g');
            const bEl = filterEl.querySelector('.sp-b');
            const hEl = filterEl.querySelector('.sp-hue');

            node._fxAnim = {
                last: 0,
                step: (now) => {
                    const phase = (now % period) / period;
                    if (blend && rEl && gEl && bEl) {
                        const t = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;
                        const lerp = (a, b) => (a + (b - a) * t).toFixed(4);
                        rEl.setAttribute('tableValues', `${lerp(darkA[0], darkB[0])} ${lerp(lightA[0], lightB[0])}`);
                        gEl.setAttribute('tableValues', `${lerp(darkA[1], darkB[1])} ${lerp(lightA[1], lightB[1])}`);
                        bEl.setAttribute('tableValues', `${lerp(darkA[2], darkB[2])} ${lerp(lightA[2], lightB[2])}`);
                    }
                    if (hue && hEl) {
                        hEl.setAttribute('values', String(Math.round(phase * 360)));
                    }
                }
            };
            fxAnimated.add(node);
            fxResume();
        } else {
            node._fxAnim = null;
            fxAnimated.delete(node);
        }

        return true;
    }

    /**
     * Top-level filter application entry point.
     * Manages CSS filters, SVG definitions, noise grain, and genuine dither canvas.
     */
    function applyMediaFilter(node, element) {
        if (!node || !element || !FILTERABLE(element)) return;
        const f = element.mediaFilter || {};
        const defaults = defaultMediaFilter();
        f.duotone = { ...defaults.duotone, ...(f.duotone || {}) };
        f.grain = { ...defaults.grain, ...(f.grain || {}) };
        f.tint = { ...defaults.tint, ...(f.tint || {}) };
        f.halftone = { ...defaults.halftone, ...(f.halftone || {}) };
        const ht = f.halftone;
        const htMode = ht.mode || 'none';
        const hasHt = htMode !== 'none';
        const media = MEDIA_TYPES.has(element.type);
        const target = !media ? node : (element.type === 'slideshow' || element.type === 'pattern') ? node.firstElementChild : node.querySelector(':scope > video, :scope > img, :scope > iframe');
        if (!target) { node._fxSig = ''; node._fxAnim = null; fxAnimated.delete(node); return; }

        const active = mediaFilterActive(f) && (media || f.blur > 0 || f.brightness !== 100 || f.contrast !== 100 || f.saturate !== 100 || f.grayscale > 0 || f.duotone.enabled || hasHt);
        const signature = JSON.stringify([
            f, media, element.id, element.width, element.height,
            element.style?.objectFit, element.style?.focusX, element.style?.focusY,
            element.style?.background, element.style?.fill, element.style?.gradient,
            element.src
        ]);

        if (node._fxSig !== signature || node._fxTarget !== target) {
            node._fxSig = signature;
            node._fxTarget = target;

            // 1. Genuine Dither & Halftone Canvas Engine (atomic, zero-flash)
            if (active && hasHt) {
                let canvas = node._fxCanvas;
                if (!canvas || canvas.parentNode !== node) {
                    canvas = node._fxCanvas = document.createElement('canvas');
                    canvas.className = 'sp-fx sp-fx-canvas';
                    node.appendChild(canvas);
                }
                renderDitherHalftone(canvas, element, node, ht, target);
            } else if (node._fxCanvas) {
                node._fxCanvas.remove();
                node._fxCanvas = null;
                const img = node.querySelector(':scope > img, :scope > video');
                if (img) img.style.opacity = '';
            }
            if (node._htWrap) {
                node._htWrap.remove();
                node._htWrap = null;
            }

            // 2. Tint Overlay (managed in-place)
            if (active && f.tint?.enabled) {
                let tint = node._fxTint;
                if (!tint || tint.parentNode !== node) {
                    tint = node._fxTint = document.createElement('div');
                    tint.className = 'sp-fx sp-tint';
                    node.appendChild(tint);
                }
                tint.style.cssText = `position:absolute;inset:0;pointer-events:none;border-radius:inherit;background-color:${f.tint.color};opacity:${f.tint.opacity};`;
            } else if (node._fxTint) {
                node._fxTint.remove();
                node._fxTint = null;
            }

            // 3. Film Grain Overlay (managed in-place)
            if (active && f.grain?.enabled) {
                ensureGrainStyle();
                let grain = node._fxGrain;
                if (!grain || grain.parentNode !== node) {
                    grain = node._fxGrain = document.createElement('div');
                    grain.className = 'sp-fx sp-grain';
                    node.appendChild(grain);
                }
                const size = Math.max(0.5, Math.min(4, Number(f.grain.size) || 1));
                grain.style.cssText = `position:absolute;inset:0;pointer-events:none;border-radius:inherit;mix-blend-mode:overlay;background-image:${getGrainCssUrl()};background-size:${Math.round(160 * size)}px;opacity:${f.grain.amount};${f.grain.animate ? 'animation:sp-grain .6s steps(1) infinite;' : ''}`;
            } else if (node._fxGrain) {
                node._fxGrain.remove();
                node._fxGrain = null;
            }
        }

        const hasSvgFilter = active ? syncLightweightSvgFilter(node, element, f) : (node._fxId && (document.getElementById(node._fxId)?.remove(), node._fxId = ''), node._fxAnim = null, fxAnimated.delete(node), false);
        if (node._fxGrain && node._fxGrain.parentNode !== node) node.append(node._fxGrain);

        const cv = active && hasHt ? node._fxCanvas : null;
        // 'replace': the opaque canvas covers the media, so it must wear the duotone/blur; brightness, contrast,
        // saturate and grayscale were already baked into the sampled pixels. 'blend': media and canvas are both
        // visible, so duotone goes on both. 'ink': only the media is recoloured (the canvas is just ink dots).
        const replaced = !!(cv && media && cv._mode === 'replace');
        const svgRef = hasSvgFilter ? `url(#${node._fxId})` : '';

        const parts = [];
        const canvasParts = [];
        if (active) {
            if (f.blur > 0) (replaced ? canvasParts : parts).push(`blur(${f.blur}px)`);
            if (!replaced) {
                if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
                if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
                if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
                if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
            }
            if (svgRef) {
                (replaced ? canvasParts : parts).push(svgRef);
                if (cv && media && cv._mode === 'blend') canvasParts.push(svgRef);
            }
        }
        const nextFilter = parts.join(' ');
        if (target.style.filter !== nextFilter) target.style.filter = nextFilter;

        if (media) {
            if (node.style.filter) node.style.filter = '';
            // Blur fades the edges, so enlarge the media slightly and let the element crop it.
            const size = Math.max(1, Math.min(Number(element.width) || 100, Number(element.height) || 100));
            const nextScale = active && f.blur > 0 ? `scale(${(1 + (f.blur * 2.2) / size).toFixed(3)})` : '';
            const mediaScale = replaced ? '' : nextScale;
            if (target.style.transform !== mediaScale) target.style.transform = mediaScale;
            if (node._fxCanvas) {
                const canvasFilter = canvasParts.join(' ');
                const canvasScale = replaced ? nextScale : '';
                node._fxCanvas._fxFilter = canvasFilter;
                node._fxCanvas._fxTransform = canvasScale;
                if (node._fxCanvas.style.filter !== canvasFilter) node._fxCanvas.style.filter = canvasFilter;
                if (node._fxCanvas.style.transform !== canvasScale) node._fxCanvas.style.transform = canvasScale;
            }
            if (active && node.style.overflow !== 'hidden') node.style.overflow = 'hidden';
        }
    }

    function cleanupFilters(node) {
        if (!node) return;
        if (node._fxCanvas) {
            node._fxCanvas.remove();
            node._fxCanvas = null;
        }
        if (node._htWrap) {
            node._htWrap.remove();
            node._htWrap = null;
        }
        if (node._fxTint) {
            node._fxTint.remove();
            node._fxTint = null;
        }
        if (node._fxGrain) {
            node._fxGrain.remove();
            node._fxGrain = null;
        }
        if (node._fxId) {
            if (typeof document !== 'undefined') {
                document.getElementById(node._fxId)?.remove();
            }
            node._fxId = null;
        }
        node._fxAnim = null;
        fxAnimated.delete(node);
        const img = node.querySelector(':scope > img, :scope > video');
        if (img) img.style.opacity = '';
    }

    // Export module
    const OverlayFilters = {
        applyMediaFilter,
        cleanupFilters,
        renderDitherHalftone,
        drawMediaWithFit,
        defaultHalftone,
        defaultMediaFilter,
        mediaFilterActive,
        MEDIA_FILTER_PRESETS,
        getOrderedMatrix,
        getErrorKernel,
        runErrorDiffusionAlgorithm,
        setEffectsPaused
    };

    root.OverlayFilters = OverlayFilters;

    // Attach / synchronize with OverlayShared if already present
    if (root.OverlayShared) {
        root.OverlayShared.applyMediaFilter = applyMediaFilter;
        root.OverlayShared.defaultMediaFilter = defaultMediaFilter;
        root.OverlayShared.mediaFilterActive = mediaFilterActive;
        root.OverlayShared.MEDIA_FILTER_PRESETS = MEDIA_FILTER_PRESETS;
    }
})(typeof window !== 'undefined' ? window : this);
