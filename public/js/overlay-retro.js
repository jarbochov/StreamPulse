/**
 * StreamPulse — Overlay Retro & Unified GPU Shader Engine
 * Ultra-low-resource WebGL retro screen emulator & hardware-accelerated image processor.
 * Supports: CRT, VHS, NTSC, LCD, Static, Halftone, Bayer Dither, Pixelate, Duotone, Grain.
 *
 * Architecture:
 * - Singleton WebGL Processor (exactly 1 context for entire page, zero context exhaustion in Safari/Chrome).
 * - Per-node texture caching: textures are uploaded once and reused; zero CPU->GPU bus bandwidth while idle.
 * - Reactive animation loop: completely sleeps (0% CPU) when effects are static or elements are hidden.
 * - Combinable Analog Signals: VHS Tape, NTSC Composite, and TV Static / White Noise can overlap freely.
 * - Physical Screen Emulation: CRT Monitor with customizable scanline & aperture grille sizing; LCD Matrix with 4-shade palettes.
 * - Standalone and portable: zero external dependencies, clean UMD export.
 */

(function (root) {
    'use strict';

    // ---- Profile Definitions & Presets ----
    const PROFILES = {
        signals: {
            vhs: { name: 'VHS Tape', jitter: 25, glitch: 20, chromatic: 20, noise: 15 },
            ntsc: { name: 'NTSC Composite', bleed: 30, ghosting: 25, noise: 12 },
            static: { name: 'TV Static & Snow', noise: 55, pure: false, color: false, glitch: 40, roll: 15 }
        },
        display: {
            none: { name: 'None (Flat)' },
            crt: { name: 'CRT Monitor', scanlines: 45, scanlineSize: 4, curvature: 12, bloom: 25, vignette: 20, mask: 'aperture', maskSize: 2, maskStrength: 35 },
            lcd: { name: 'LCD Matrix', grid: 35, palette: 'default' }
        }
    };

    const PALETTES = {
        'dmg-green': [
            [0.059, 0.220, 0.059], // #0f380f (Darkest)
            [0.188, 0.384, 0.188], // #306230
            [0.545, 0.675, 0.059], // #8bac0f
            [0.608, 0.737, 0.059]  // #9bbc0f (Lightest)
        ],
        'pocket': [
            [0.10, 0.11, 0.10],
            [0.32, 0.34, 0.32],
            [0.58, 0.61, 0.58],
            [0.85, 0.88, 0.85]
        ],
        'cyber-blue': [
            [0.02, 0.08, 0.18],
            [0.08, 0.28, 0.45],
            [0.15, 0.58, 0.75],
            [0.45, 0.90, 1.00]
        ],
        'amber': [
            [0.10, 0.04, 0.00],
            [0.40, 0.18, 0.00],
            [0.78, 0.42, 0.00],
            [1.00, 0.70, 0.10]
        ]
    };

    /**
     * Normalizes retro options, ensuring 100% backwards compatibility with legacy schemas.
     */
    function normalizeRetro(retro = {}) {
        let display = retro.display || 'none';
        let vhs = Boolean(retro.vhs);
        let ntsc = Boolean(retro.ntsc);
        let staticSignal = Boolean(retro.static);

        // Support legacy preset / saved schema
        if (retro.signal === 'vhs' || retro.type === 'vhs') vhs = true;
        if (retro.signal === 'ntsc' || retro.type === 'ntsc') ntsc = true;
        if (retro.signal === 'static' || retro.type === 'static') staticSignal = true;

        if (retro.type === 'crt' && display === 'none') display = 'crt';
        if (retro.type === 'lcd' && display === 'none') display = 'lcd';
        if (retro.viewOnCrt && display === 'none') display = 'crt';

        const mask = retro.crtMask || retro.mask || 'aperture';
        const maskVal = mask === 'aperture' ? 1 : (mask === 'slot' || mask === 'slot-mask' || mask === 'shadow-mask' ? 2 : 0);

        return {
            display,
            vhs,
            ntsc,
            static: staticSignal,

            // CRT Screen
            crtScanlines: (retro.crtScanlines ?? retro.scanlines ?? 45) / 100,
            crtScanlineSize: Math.max(1, Math.min(24, Number(retro.crtScanlineSize ?? retro.scanlineSize ?? 4))),
            crtCurvature: (retro.crtCurvature ?? retro.curvature ?? 12) / 100,
            crtBloom: (retro.crtBloom ?? retro.bloom ?? 25) / 100,
            crtVignette: (retro.crtVignette ?? retro.vignette ?? 20) / 100,
            crtMask: maskVal,
            crtMaskSize: Math.max(1, Math.min(10, Number(retro.crtMaskSize ?? retro.maskSize ?? 2))),
            crtMaskStrength: (retro.crtMaskStrength ?? 35) / 100,

            // LCD Screen
            lcdGrid: (retro.lcdGrid ?? retro.grid ?? 35) / 100,
            lcdPalette: retro.lcdPalette || retro.palette || 'default',

            // VHS Signal
            vhsJitter: (retro.vhsJitter ?? retro.jitter ?? 25) / 100,
            vhsGlitch: (retro.vhsGlitch ?? retro.glitch ?? 20) / 100,
            vhsChroma: (retro.vhsChroma ?? retro.chromatic ?? 20) / 100,
            vhsNoise: (retro.vhsNoise ?? retro.noise ?? 15) / 100,

            // NTSC Signal
            ntscBleed: (retro.ntscBleed ?? retro.bleed ?? 30) / 100,
            ntscGhost: (retro.ntscGhost ?? retro.ghosting ?? 25) / 100,
            ntscNoise: (retro.ntscNoise ?? retro.noise ?? 12) / 100,

            // TV Static & White Noise
            staticNoise: (retro.staticNoise ?? retro.noise ?? 55) / 100,
            staticPure: Boolean(retro.staticPure),
            staticColor: Boolean(retro.staticColor),
            staticGlitch: (retro.staticGlitch ?? retro.glitch ?? 40) / 100,
            staticRoll: (retro.staticRoll ?? retro.roll ?? 15) / 100
        };
    }

    // ---- GLSL Shaders ----
    const VS_SOURCE = `
        attribute vec2 a_pos;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        void main() {
            gl_Position = vec4(a_pos, 0.0, 1.0);
            v_uv = a_uv;
        }
    `;

    const FS_SOURCE = `
        precision mediump float;
        varying vec2 v_uv;
        uniform sampler2D u_tex;
        uniform vec2 u_res;
        uniform float u_time;
        uniform vec2 u_uvScale;
        uniform vec2 u_uvOffset;

        // Base Adjustments
        uniform float u_brightness;
        uniform float u_contrast;
        uniform float u_saturate;
        uniform float u_grayscale;

        // Display Mode (0=None, 1=CRT, 2=LCD)
        uniform int u_displayMode;

        // CRT Screen Uniforms
        uniform float u_crtScanlines;
        uniform float u_crtScanlineSize;
        uniform float u_crtCurvature;
        uniform float u_crtBloom;
        uniform float u_crtVignette;
        uniform int u_crtMask; // 0=None, 1=Aperture Grille, 2=Slot Mask
        uniform float u_crtMaskSize;
        uniform float u_crtMaskStrength;

        // LCD Matrix Uniforms
        uniform float u_lcdGrid;
        uniform int u_lcdPalette; // 0=default/color, 1=dmg, 2=pocket, 3=blue, 4=amber

        // Combinable Signals
        uniform int u_vhsEnabled;
        uniform float u_vhsJitter;
        uniform float u_vhsGlitch;
        uniform float u_vhsChroma;
        uniform float u_vhsNoise;

        uniform int u_ntscEnabled;
        uniform float u_ntscBleed;
        uniform float u_ntscGhost;
        uniform float u_ntscNoise;

        uniform int u_staticEnabled;
        uniform float u_staticNoise;
        uniform int u_staticPure;
        uniform int u_staticColor;
        uniform float u_staticGlitch;
        uniform float u_staticRoll;

        // Surface / Color Grade
        uniform float u_grain;
        uniform int u_duoEnabled;
        uniform vec3 u_duoDark;
        uniform vec3 u_duoLight;
        uniform int u_tintEnabled;
        uniform vec3 u_tintColor;
        uniform float u_tintOpacity;

        // High-speed hash
        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        // Barrel Tube Distortion
        vec2 curveUV(vec2 uv, float k) {
            if (k <= 0.001) return uv;
            vec2 centered = uv - 0.5;
            float r2 = dot(centered, centered);
            return centered * (1.0 + r2 * k * 0.9) + 0.5;
        }

        vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        vec4 sampleMedia(vec2 p) {
            vec2 su = p * u_uvScale + u_uvOffset;
            if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) {
                return vec4(0.0);
            }
            return texture2D(u_tex, su);
        }

        void main() {
            vec2 uv = v_uv;

            // 1. Static VSYNC roll
            if (u_staticEnabled == 1 && u_staticRoll > 0.001) {
                uv.y = fract(uv.y + u_time * (u_staticRoll * 0.4));
            }

            // 2. Physical CRT Barrel Tube Curvature
            if (u_displayMode == 1 && u_crtCurvature > 0.001) {
                uv = curveUV(uv, u_crtCurvature);
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
            }

            // 3. VHS Horizontal Tracking Wave & Glitch Slices
            if (u_vhsEnabled == 1) {
                if (u_vhsJitter > 0.001) {
                    float jWave = sin(uv.y * 35.0 + u_time * 5.0) * (u_vhsJitter * 0.004);
                    float jNoise = (hash21(vec2(floor(uv.y * 120.0), floor(u_time * 30.0))) - 0.5) * (u_vhsJitter * 0.003);
                    uv.x += jWave + jNoise;
                }
                if (u_vhsGlitch > 0.001) {
                    float barY = fract(u_time * 0.15);
                    float inBar = smoothstep(0.0, 0.04, 0.04 - abs(uv.y - barY));
                    float slice = (hash21(vec2(floor(uv.y * 40.0), floor(u_time * 25.0))) - 0.5) * inBar * (u_vhsGlitch * 0.05);
                    uv.x += slice;
                }
                // VHS Head switching noise at bottom 2.5% of picture
                if (uv.y > 0.975) {
                    float headNoise = (hash21(vec2(uv.x * 20.0, floor(u_time * 60.0))) - 0.5) * 0.08;
                    uv.x += headNoise;
                }
            }

            // 4. Static / Broken TV Glitch Slices
            if (u_staticEnabled == 1 && u_staticGlitch > 0.001) {
                float sliceY = floor(uv.y * 24.0);
                float isGlitchLine = step(0.85 - u_staticGlitch * 0.3, hash21(vec2(sliceY, floor(u_time * 15.0))));
                float disp = (hash21(vec2(sliceY, floor(u_time * 30.0))) - 0.5) * (u_staticGlitch * 0.08);
                uv.x += disp * isGlitchLine;
            }

            // 5. Sampling & Chromatic Delay / Bleed (VHS + NTSC + CRT Bloom)
            float chromaOffset = 0.0;
            if (u_vhsEnabled == 1 && u_vhsChroma > 0.001) {
                chromaOffset += u_vhsChroma * 0.008;
            }
            if (u_ntscEnabled == 1 && u_ntscBleed > 0.001) {
                chromaOffset += u_ntscBleed * 0.007;
            }
            if (u_displayMode == 1 && u_crtBloom > 0.001) {
                chromaOffset += u_crtBloom * 0.0025;
            }

            vec4 col;
            if (chromaOffset > 0.0001) {
                float r = sampleMedia(vec2(uv.x + chromaOffset, uv.y)).r;
                vec4 center = sampleMedia(uv);
                float b = sampleMedia(vec2(uv.x - chromaOffset, uv.y)).b;
                col = vec4(r, center.g, b, center.a);
            } else {
                col = sampleMedia(uv);
            }

            // 6. NTSC Multipath RF Ghosting
            if (u_ntscEnabled == 1 && u_ntscGhost > 0.001) {
                float ghostOffset = 0.015 + u_ntscGhost * 0.025;
                vec4 ghost = sampleMedia(vec2(uv.x + ghostOffset, uv.y));
                col.rgb = mix(col.rgb, col.rgb + ghost.rgb * 0.45, u_ntscGhost);
            }

            // 7. Base Color & Tone Adjustments
            if (u_brightness != 1.0) col.rgb *= u_brightness;
            if (u_contrast != 1.0) col.rgb = (col.rgb - 0.5) * u_contrast + 0.5;
            if (u_saturate != 1.0) {
                vec3 hsv = rgb2hsv(col.rgb);
                hsv.y *= u_saturate;
                col.rgb = hsv2rgb(hsv);
            }
            if (u_grayscale > 0.0) {
                float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
                col.rgb = mix(col.rgb, vec3(gray), u_grayscale);
            }

            // 8. TV White Noise & Analog Signal Noise
            if (u_staticEnabled == 1 && (u_staticNoise > 0.001 || u_staticPure == 1)) {
                vec2 noiseCoord = floor(gl_FragCoord.xy);
                vec2 timeSeed = vec2(fract(u_time * 29.83), fract(u_time * 53.71));
                float whiteNoise = hash21(noiseCoord + timeSeed * 1000.0);

                vec3 snowColor;
                if (u_staticColor == 1) {
                    float r = whiteNoise;
                    float g = hash21(noiseCoord + timeSeed * 1000.0 + vec2(13.1, 7.3));
                    float b = hash21(noiseCoord + timeSeed * 1000.0 + vec2(37.9, 19.4));
                    snowColor = vec3(r, g, b);
                } else {
                    // Authentic monochrome television salt-and-pepper snow
                    snowColor = vec3(whiteNoise);
                }

                if (u_staticPure == 1) {
                    // Full untuned TV snow screen (No Signal)
                    col.rgb = snowColor;
                } else {
                    // Broadcast snow blended over image
                    col.rgb = mix(col.rgb, snowColor, u_staticNoise);
                }
            }

            // Tape / RF Grain
            float fineNoise = 0.0;
            if (u_vhsEnabled == 1 && u_vhsNoise > 0.001) {
                fineNoise += (hash21(gl_FragCoord.xy * 0.8 + fract(u_time * 19.3) * 500.0) - 0.5) * (u_vhsNoise * 0.4);
            }
            if (u_ntscEnabled == 1 && u_ntscNoise > 0.001) {
                fineNoise += (hash21(gl_FragCoord.xy * 0.5 + fract(u_time * 31.7) * 400.0) - 0.5) * (u_ntscNoise * 0.35);
            }
            if (abs(fineNoise) > 0.0001) {
                col.rgb += fineNoise;
            }

            // 9. CRT Screen Layer: Scanlines, Aperture Grille, Bloom & Vignette
            if (u_displayMode == 1) {
                // Electron Beam Scanlines with customizable pitch/spacing
                if (u_crtScanlines > 0.001) {
                    float linePitch = max(2.0, u_crtScanlineSize);
                    float linePos = fract(gl_FragCoord.y / linePitch);
                    float dist = abs(linePos - 0.5);
                    float beam = exp(-dist * dist * (4.0 + u_crtScanlines * 14.0));
                    col.rgb *= mix(1.0, beam, u_crtScanlines * 0.9);
                }

                // Phosphor Mask (Trinitron Aperture Grille or Slot Mask) with customizable stripe width
                if (u_crtMask > 0 && u_crtMaskStrength > 0.001) {
                    float stripeWidth = max(1.0, floor(u_crtMaskSize));
                    float colIdx = mod(floor(gl_FragCoord.x / stripeWidth), 3.0);
                    vec3 triad = vec3(0.5);
                    if (u_crtMask == 1) { // Aperture Grille (vertical RGB Trinitron stripes)
                        if (colIdx < 0.5) triad = vec3(1.4, 0.45, 0.45);
                        else if (colIdx < 1.5) triad = vec3(0.45, 1.4, 0.45);
                        else triad = vec3(0.45, 0.45, 1.4);
                    } else if (u_crtMask == 2) { // Slot Mask (staggered dot triads)
                        float rowIdx = mod(floor(gl_FragCoord.y / (stripeWidth * 2.0)), 2.0);
                        float slotCol = mod(colIdx + rowIdx, 3.0);
                        if (slotCol < 0.5) triad = vec3(1.35, 0.5, 0.5);
                        else if (slotCol < 1.5) triad = vec3(0.5, 1.35, 0.5);
                        else triad = vec3(0.5, 0.5, 1.35);
                    }
                    col.rgb = mix(col.rgb, col.rgb * triad, u_crtMaskStrength);
                }

                // Phosphor Bloom (warm highlights)
                if (u_crtBloom > 0.001) {
                    float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
                    vec3 glow = col.rgb * (1.0 + pow(lum, 1.8) * (u_crtBloom * 0.5));
                    col.rgb = mix(col.rgb, glow, u_crtBloom * 0.45);
                }

                // CRT Corner Vignette
                if (u_crtVignette > 0.001) {
                    vec2 vigCoord = (uv - 0.5) * 2.0;
                    float vig = 1.0 - dot(vigCoord, vigCoord) * (u_crtVignette * 0.4);
                    col.rgb *= clamp(vig, 0.0, 1.0);
                }
            }

            // 10. LCD Display Layer: Sub-pixel Grid & 4-Shade Palettes
            if (u_displayMode == 2) {
                if (u_lcdGrid > 0.001) {
                    float pitch = mix(3.0, 16.0, u_lcdGrid);
                    vec2 cell = fract(uv * u_res / pitch);
                    float border = step(0.14, cell.x) * step(0.14, cell.y);
                    col.rgb *= mix(0.4, 1.0, border);
                }
                // Authentic Handheld LCD Palettes (4-shade quantization)
                if (u_lcdPalette > 0) {
                    float lum = clamp(dot(col.rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
                    float shade = floor(lum * 3.99);
                    if (u_lcdPalette == 1) { // DMG Green
                        if (shade < 1.0) col.rgb = vec3(0.059, 0.220, 0.059);
                        else if (shade < 2.0) col.rgb = vec3(0.188, 0.384, 0.188);
                        else if (shade < 3.0) col.rgb = vec3(0.545, 0.675, 0.059);
                        else col.rgb = vec3(0.608, 0.737, 0.059);
                    } else if (u_lcdPalette == 2) { // Pocket Silver
                        if (shade < 1.0) col.rgb = vec3(0.10, 0.11, 0.10);
                        else if (shade < 2.0) col.rgb = vec3(0.32, 0.34, 0.32);
                        else if (shade < 3.0) col.rgb = vec3(0.58, 0.61, 0.58);
                        else col.rgb = vec3(0.85, 0.88, 0.85);
                    } else if (u_lcdPalette == 3) { // Cyber Blue
                        if (shade < 1.0) col.rgb = vec3(0.02, 0.08, 0.18);
                        else if (shade < 2.0) col.rgb = vec3(0.08, 0.28, 0.45);
                        else if (shade < 3.0) col.rgb = vec3(0.15, 0.58, 0.75);
                        else col.rgb = vec3(0.45, 0.90, 1.00);
                    } else if (u_lcdPalette == 4) { // Amber Terminal
                        if (shade < 1.0) col.rgb = vec3(0.10, 0.04, 0.00);
                        else if (shade < 2.0) col.rgb = vec3(0.40, 0.18, 0.00);
                        else if (shade < 3.0) col.rgb = vec3(0.78, 0.42, 0.00);
                        else col.rgb = vec3(1.00, 0.70, 0.10);
                    }
                }
            }

            // 11. Film Grain
            if (u_grain > 0.001) {
                float g = (hash21(uv * 450.0 + fract(u_time * 1.8)) - 0.5) * (u_grain * 0.4);
                col.rgb += g;
            }

            // 12. Duotone Gradient Mapping
            if (u_duoEnabled == 1) {
                float lum = clamp(dot(col.rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
                col.rgb = mix(u_duoDark, u_duoLight, lum);
            }

            // 13. Color Tint
            if (u_tintEnabled == 1 && u_tintOpacity > 0.001) {
                col.rgb = mix(col.rgb, u_tintColor, u_tintOpacity);
            }

            gl_FragColor = col;
        }
    `;

    // ---- Singleton WebGL Processor Engine ----
    let glInstance = null;
    const textureCache = new WeakMap();

    function getSharedGL() {
        if (typeof document === 'undefined') return null;
        if (glInstance && !glInstance.gl.isContextLost()) return glInstance;

        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const gl = canvas.getContext('webgl', {
            preserveDrawingBuffer: true,
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
            depth: false,
            stencil: false
        });

        if (!gl) {
            console.warn('[OverlayRetro] WebGL 1.0 not supported in current environment.');
            return null;
        }

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                const info = gl.getShaderInfoLog(s);
                gl.deleteShader(s);
                throw new Error('[OverlayRetro Shader] ' + info);
            }
            return s;
        }

        const vs = compile(gl.VERTEX_SHADER, VS_SOURCE);
        const fs = compile(gl.FRAGMENT_SHADER, FS_SOURCE);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(prog);
            gl.deleteProgram(prog);
            throw new Error('[OverlayRetro Program] ' + info);
        }

        gl.useProgram(prog);

        // Quad geometry (2 triangles full quad)
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1
        ]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        // UV mapping correctly oriented with DOM coordinates:
        // top-left (-1, 1) -> (0, 0), bottom-right (1, -1) -> (1, 1)
        const uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 1, // (-1, -1) bottom-left
            1, 1, // ( 1, -1) bottom-right
            0, 0, // (-1,  1) top-left
            0, 0, // (-1,  1) top-left
            1, 1, // ( 1, -1) bottom-right
            1, 0  // ( 1,  1) top-right
        ]), gl.STATIC_DRAW);

        const aUv = gl.getAttribLocation(prog, 'a_uv');
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

        // Fallback default texture
        const defaultTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, defaultTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Cache uniform locations
        const u = {};
        const uniformNames = [
            'u_tex', 'u_res', 'u_time', 'u_uvScale', 'u_uvOffset',
            'u_brightness', 'u_contrast', 'u_saturate', 'u_grayscale',
            'u_displayMode',
            'u_crtScanlines', 'u_crtScanlineSize', 'u_crtCurvature', 'u_crtBloom', 'u_crtVignette',
            'u_crtMask', 'u_crtMaskSize', 'u_crtMaskStrength',
            'u_lcdGrid', 'u_lcdPalette',
            'u_vhsEnabled', 'u_vhsJitter', 'u_vhsGlitch', 'u_vhsChroma', 'u_vhsNoise',
            'u_ntscEnabled', 'u_ntscBleed', 'u_ntscGhost', 'u_ntscNoise',
            'u_staticEnabled', 'u_staticNoise', 'u_staticPure', 'u_staticColor', 'u_staticGlitch', 'u_staticRoll',
            'u_grain', 'u_duoEnabled', 'u_duoDark', 'u_duoLight', 'u_tintEnabled', 'u_tintColor', 'u_tintOpacity'
        ];
        for (const name of uniformNames) {
            u[name] = gl.getUniformLocation(prog, name);
        }

        glInstance = { canvas, gl, prog, defaultTex, u };
        return glInstance;
    }

    const hex2rgb = hex => [1, 3, 5].map(i => (parseInt(String(hex || '#000000').slice(i, i + 2), 16) || 0) / 255);

    /**
     * Executes the WebGL retro shader for a source element into a destination 2D canvas.
     * Employs zero-allocation per-node texture caching to prevent bus flooding.
     */
    function renderRetroShader(destCanvas, sourceMedia, f, timeSeconds = 0) {
        const shared = getSharedGL();
        if (!shared || !destCanvas) return false;
        const { canvas: glCanvas, gl, prog, defaultTex, u } = shared;

        const w = Math.max(1, Math.round(destCanvas.width));
        const h = Math.max(1, Math.round(destCanvas.height));

        if (glCanvas.width !== w || glCanvas.height !== h) {
            glCanvas.width = w;
            glCanvas.height = h;
            gl.viewport(0, 0, w, h);
        }

        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);

        // Smart texture caching: only upload when source data actually changes
        let tex = defaultTex;
        if (sourceMedia && sourceMedia.tagName) {
            let cached = textureCache.get(sourceMedia);
            if (!cached) {
                cached = { tex: gl.createTexture(), key: '', uploaded: false };
                gl.bindTexture(gl.TEXTURE_2D, cached.tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                textureCache.set(sourceMedia, cached);
            }
            tex = cached.tex;
            gl.bindTexture(gl.TEXTURE_2D, tex);

            const isVideo = sourceMedia.tagName === 'VIDEO';
            const isCanvas = sourceMedia.tagName === 'CANVAS';
            const isImg = sourceMedia.tagName === 'IMG';

            let needsUpload = false;
            if (isVideo) {
                needsUpload = sourceMedia.readyState >= 2 && !sourceMedia.paused && !sourceMedia.ended;
                if (!cached.uploaded && sourceMedia.readyState >= 2) needsUpload = true;
            } else if (isCanvas) {
                const version = sourceMedia._fxVersion || 0;
                const key = `${sourceMedia.width}x${sourceMedia.height}_${version}`;
                if (cached.key !== key) {
                    needsUpload = true;
                    cached.key = key;
                }
            } else if (isImg) {
                const key = sourceMedia.currentSrc || sourceMedia.src || `${sourceMedia.naturalWidth}x${sourceMedia.naturalHeight}`;
                if (cached.key !== key || !cached.uploaded) {
                    needsUpload = true;
                    cached.key = key;
                }
            }

            if (needsUpload) {
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceMedia);
                    cached.uploaded = true;
                } catch {
                    return false;
                }
            }
        } else {
            gl.bindTexture(gl.TEXTURE_2D, defaultTex);
        }

        // UV aspect / fit scaling
        let sx = 1.0, sy = 1.0, ox = 0.0, oy = 0.0;
        if (sourceMedia && (sourceMedia.tagName === 'IMG' || sourceMedia.tagName === 'VIDEO')) {
            const iw = sourceMedia.naturalWidth || sourceMedia.videoWidth || w;
            const ih = sourceMedia.naturalHeight || sourceMedia.videoHeight || h;
            const fit = f._fit || 'cover';
            const fx = (f._focusX ?? 50) / 100;
            const fy = (f._focusY ?? 50) / 100;
            if (iw > 0 && ih > 0) {
                const rElem = w / h;
                const rMedia = iw / ih;
                if (fit === 'cover') {
                    if (rElem > rMedia) {
                        sy = rMedia / rElem;
                        oy = (1.0 - sy) * fy;
                    } else {
                        sx = rElem / rMedia;
                        ox = (1.0 - sx) * fx;
                    }
                } else if (fit === 'contain') {
                    if (rElem > rMedia) {
                        sx = rElem / rMedia;
                        ox = (1.0 - sx) * fx;
                    } else {
                        sy = rMedia / rElem;
                        oy = (1.0 - sy) * fy;
                    }
                }
            }
        }
        gl.uniform2f(u.u_uvScale, sx, sy);
        gl.uniform2f(u.u_uvOffset, ox, oy);

        // Core uniforms
        gl.uniform1i(u.u_tex, 0);
        gl.uniform2f(u.u_res, w, h);
        gl.uniform1f(u.u_time, timeSeconds);

        gl.uniform1f(u.u_brightness, (f.brightness ?? 100) / 100);
        gl.uniform1f(u.u_contrast, (f.contrast ?? 100) / 100);
        gl.uniform1f(u.u_saturate, (f.saturate ?? 100) / 100);
        gl.uniform1f(u.u_grayscale, Math.max(0, Math.min(1, (f.grayscale ?? 0) / 100)));

        const retro = normalizeRetro(f.retro || {});

        const displayCode = retro.display === 'crt' ? 1 :
            retro.display === 'lcd' ? 2 : 0;
        gl.uniform1i(u.u_displayMode, displayCode);

        // CRT uniforms
        gl.uniform1f(u.u_crtScanlines, retro.crtScanlines);
        gl.uniform1f(u.u_crtScanlineSize, retro.crtScanlineSize);
        gl.uniform1f(u.u_crtCurvature, retro.crtCurvature);
        gl.uniform1f(u.u_crtBloom, retro.crtBloom);
        gl.uniform1f(u.u_crtVignette, retro.crtVignette);
        gl.uniform1i(u.u_crtMask, retro.crtMask);
        gl.uniform1f(u.u_crtMaskSize, retro.crtMaskSize);
        gl.uniform1f(u.u_crtMaskStrength, retro.crtMaskStrength);

        // LCD uniforms
        gl.uniform1f(u.u_lcdGrid, retro.lcdGrid);
        const palId = retro.lcdPalette;
        const palIndex = palId === 'dmg-green' ? 1 : palId === 'pocket' ? 2 : palId === 'cyber-blue' ? 3 : palId === 'amber' ? 4 : 0;
        gl.uniform1i(u.u_lcdPalette, palIndex);

        // Combinable Signals
        gl.uniform1i(u.u_vhsEnabled, retro.vhs ? 1 : 0);
        gl.uniform1f(u.u_vhsJitter, retro.vhsJitter);
        gl.uniform1f(u.u_vhsGlitch, retro.vhsGlitch);
        gl.uniform1f(u.u_vhsChroma, retro.vhsChroma);
        gl.uniform1f(u.u_vhsNoise, retro.vhsNoise);

        gl.uniform1i(u.u_ntscEnabled, retro.ntsc ? 1 : 0);
        gl.uniform1f(u.u_ntscBleed, retro.ntscBleed);
        gl.uniform1f(u.u_ntscGhost, retro.ntscGhost);
        gl.uniform1f(u.u_ntscNoise, retro.ntscNoise);

        gl.uniform1i(u.u_staticEnabled, retro.static ? 1 : 0);
        gl.uniform1f(u.u_staticNoise, retro.staticNoise);
        gl.uniform1i(u.u_staticPure, retro.staticPure ? 1 : 0);
        gl.uniform1i(u.u_staticColor, retro.staticColor ? 1 : 0);
        gl.uniform1f(u.u_staticGlitch, retro.staticGlitch);
        gl.uniform1f(u.u_staticRoll, retro.staticRoll);

        // Film Grain
        const grain = f.grain || {};
        gl.uniform1f(u.u_grain, grain.enabled ? (grain.amount ?? 0.25) : 0.0);

        // Duotone
        const duo = f.duotone || {};
        gl.uniform1i(u.u_duoEnabled, duo.enabled ? 1 : 0);
        if (duo.enabled) {
            const darkRgb = hex2rgb(duo.dark || '#000000');
            const lightRgb = hex2rgb(duo.light || '#ffffff');
            gl.uniform3f(u.u_duoDark, darkRgb[0], darkRgb[1], darkRgb[2]);
            gl.uniform3f(u.u_duoLight, lightRgb[0], lightRgb[1], lightRgb[2]);
        }

        // Tint
        const tint = f.tint || {};
        gl.uniform1i(u.u_tintEnabled, tint.enabled ? 1 : 0);
        if (tint.enabled) {
            const tintRgb = hex2rgb(tint.color || '#000000');
            gl.uniform3f(u.u_tintColor, tintRgb[0], tintRgb[1], tintRgb[2]);
            gl.uniform1f(u.u_tintOpacity, Number(tint.opacity ?? 0.4));
        }

        // Draw quad
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Copy rendered result to destination 2D canvas
        const ctx2d = destCanvas.getContext('2d');
        if (ctx2d) {
            ctx2d.clearRect(0, 0, w, h);
            ctx2d.drawImage(glCanvas, 0, 0, w, h);
        }

        return true;
    }

    // ---- Animation Management ----
    const activeNodes = new Set();
    let animRaf = 0;
    let isPaused = false;

    function animLoop(timestamp) {
        if (isPaused || typeof document === 'undefined' || document.hidden) {
            animRaf = 0;
            return;
        }

        const tSec = timestamp * 0.001;
        for (const node of activeNodes) {
            if (!node.isConnected) {
                activeNodes.delete(node);
                continue;
            }
            const record = node._retroRecord;
            if (!record || !record.canvas) {
                activeNodes.delete(node);
                continue;
            }
            renderRetroShader(record.canvas, record.source, record.filter, tSec);
        }

        animRaf = activeNodes.size ? requestAnimationFrame(animLoop) : 0;
    }

    function resumeLoop() {
        if (!animRaf && activeNodes.size && !isPaused && typeof document !== 'undefined' && !document.hidden) {
            animRaf = requestAnimationFrame(animLoop);
        }
    }

    function setEffectsPaused(paused) {
        isPaused = Boolean(paused);
        resumeLoop();
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', resumeLoop);
    }

    /**
     * Public API: Applies retro display & signal effects onto a target DOM element.
     */
    function applyRetroFilter(node, element, options = {}) {
        if (!node || !element) return false;
        const f = element.mediaFilter || {};
        const retro = normalizeRetro(f.retro || {});
        const isRetroActive = retro.display !== 'none' || retro.vhs || retro.ntsc || retro.static;

        if (!isRetroActive) {
            cleanup(node);
            return false;
        }

        let canvas = node._retroCanvas;
        if (!canvas || canvas.parentNode !== node) {
            canvas = node._retroCanvas = document.createElement('canvas');
            canvas.className = 'sp-fx sp-retro-canvas';
            canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:inherit;';
            node.appendChild(canvas);
        }

        const w = Math.max(1, Math.round(Number(element.width) || node.offsetWidth || 100));
        const h = Math.max(1, Math.round(Number(element.height) || node.offsetHeight || 100));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }

        const isImage = element.type === 'image';
        const isVideo = element.type === 'video';
        const mediaEl = isImage ? node.querySelector(':scope > img, img') : (isVideo ? node.querySelector(':scope > video, video') : null);
        const hasFxCanvas = !!(node._fxCanvas && node._fxCanvas.parentNode === node);

        // If media is not yet loaded, wait and re-trigger
        if (!hasFxCanvas && mediaEl) {
            const isLoaded = isImage
                ? (mediaEl.complete && mediaEl.naturalWidth > 0)
                : (mediaEl.readyState >= 2 && mediaEl.videoWidth > 0);

            if (!isLoaded) {
                const evt = isImage ? 'load' : 'loadeddata';
                mediaEl.addEventListener(evt, () => applyRetroFilter(node, element, options), { once: true });
                return false;
            }
        }

        f._fit = element.style?.objectFit || 'cover';
        f._focusX = element.style?.focusX ?? 50;
        f._focusY = element.style?.focusY ?? 50;

        // Hide original media and dither canvas so retro canvas displays cleanly
        if (mediaEl) mediaEl.style.opacity = '0';
        if (hasFxCanvas) node._fxCanvas.style.opacity = '0';

        const source = hasFxCanvas ? node._fxCanvas : (mediaEl || node);
        node._retroRecord = { canvas, source, filter: f };

        // Determine if this effect truly needs continuous 60 FPS animation
        const hasAnimSignal = retro.vhs || retro.ntsc || retro.static;
        const hasAnimGrain = !!(f.grain?.enabled && f.grain?.animate);
        const hasAnimVideo = element.type === 'video' || (source && source.tagName === 'VIDEO');
        const isAnimated = hasAnimSignal || hasAnimGrain || hasAnimVideo;

        renderRetroShader(canvas, source, f, performance.now() * 0.001);

        if (isAnimated) {
            activeNodes.add(node);
            resumeLoop();
        } else {
            activeNodes.delete(node);
        }

        return true;
    }

    function cleanup(node) {
        if (!node) return;
        if (node._retroCanvas) {
            node._retroCanvas.remove();
            node._retroCanvas = null;
        }
        node._retroRecord = null;
        activeNodes.delete(node);
        const hasFxCanvas = !!(node._fxCanvas && node._fxCanvas.parentNode === node);
        if (hasFxCanvas) {
            node._fxCanvas.style.opacity = '';
        }
        const img = node.querySelector(':scope > img, :scope > video');
        if (img) {
            if (hasFxCanvas && node._fxCanvas._mode === 'replace') {
                img.style.opacity = '0';
            } else {
                img.style.opacity = '';
            }
        }
    }

    const OverlayRetro = {
        PROFILES,
        PALETTES,
        normalizeRetro,
        applyRetroFilter,
        renderRetroShader,
        cleanup,
        setEffectsPaused
    };

    root.OverlayRetro = OverlayRetro;
    if (root.OverlayShared) {
        root.OverlayShared.OverlayRetro = OverlayRetro;
    }
})(typeof window !== 'undefined' ? window : this);
