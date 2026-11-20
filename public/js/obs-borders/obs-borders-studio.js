(function () {
    'use strict';

    const TAB_STORAGE_KEY = 'streampulse:obs-borders:tab';
    const BG_STORAGE_KEY = 'streampulse:obs-borders:bg';

    let studioState = null;
    let selectedProfileId = '';
    let workingProfile = null;
    let variableValues = {};
    let variableSettingsEnabled = true;
    let activeTab = localStorage.getItem(TAB_STORAGE_KEY) || 'designer';
    let previewBg = localStorage.getItem(BG_STORAGE_KEY) || 'cam';
    let animFrameId = null;
    let animStartMs = performance.now();

    const VAR_TOKEN_RE = /^(?:var:([a-zA-Z0-9_.-]+)(?:\|(.*))?|\{\{\s*var\.([a-zA-Z0-9_.-]+)(?:\|([\s\S]*?))?\s*\}\})$/;

    function showToast(msg) {
        const el = document.getElementById('ob-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2600);
    }

    function resolveToken(raw, fallback) {
        if (typeof raw === 'string') {
            const m = raw.trim().match(VAR_TOKEN_RE);
            if (m) {
                const key = m[1] || m[3] || '';
                const fb = (m[2] !== undefined ? m[2] : m[4]) ?? '';
                if (variableSettingsEnabled && variableValues[key] !== undefined && String(variableValues[key]).trim() !== '') {
                    return String(variableValues[key]).trim();
                }
                if (fb !== '') return fb;
                return fallback;
            }
        }
        return raw !== undefined && raw !== null && raw !== '' ? raw : fallback;
    }

    function resolveNum(raw, fallback, min, max) {
        const v = Number(resolveToken(raw, fallback));
        if (!Number.isFinite(v)) return fallback;
        return Math.max(min, Math.min(max, v));
    }

    function resolveColor(raw, fallback) {
        const c = String(resolveToken(raw, fallback) || fallback).trim();
        return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
    }

    function hexToRgbaCss(hex, alphaOverride) {
        let h = String(hex || '#ffffffff').trim().replace(/^#/, '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + 'ff';
        else if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
        else if (h.length === 6) h += 'ff';
        if (h.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(h)) return 'rgba(255,255,255,1)';
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        const a = alphaOverride !== undefined ? alphaOverride : (parseInt(h.slice(6, 8), 16) / 255);
        return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    }

    function colorPickHex(hex) {
        const c = resolveColor(hex, '#ffffff');
        const h = c.replace(/^#/, '');
        if (h.length === 3) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length >= 6) return '#' + h.slice(0, 6);
        return '#ffffff';
    }

    function cloneProfile(p) {
        return JSON.parse(JSON.stringify(p));
    }

    function setVal(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = Boolean(val);
        else el.value = val ?? '';
    }

    function syncColorPicker(textId, pickId) {
        const textEl = document.getElementById(textId);
        const pickEl = document.getElementById(pickId);
        if (!textEl || !pickEl) return;
        pickEl.value = colorPickHex(textEl.value);
    }

    function bindColorPair(textId, pickId, setter) {
        const textEl = document.getElementById(textId);
        const pickEl = document.getElementById(pickId);
        if (!textEl || !pickEl) return;
        pickEl.addEventListener('input', () => {
            textEl.value = pickEl.value.toUpperCase() + 'FF';
            setter(textEl.value);
            if (window.StreamPulseWizardVarBinder) window.StreamPulseWizardVarBinder.refreshControlState(textEl);
            schedulePreviewDraw();
        });
        textEl.addEventListener('input', () => {
            setter(textEl.value);
            syncColorPicker(textId, pickId);
            schedulePreviewDraw();
        });
    }

    function populateFormFromProfile() {
        if (!workingProfile) return;
        const p = workingProfile;
        setVal('ob-name', p.name);
        setVal('ob-id', p.id);
        setVal('ob-placement', p.placement);
        setVal('ob-corner-join', p.cornerJoin);
        setVal('ob-pad', p.pad);
        setVal('ob-seam', p.seamOverlap);
        setVal('ob-base-w', p.baseWidth);
        setVal('ob-base-h', p.baseHeight);
        setVal('ob-per-corner', p.perCornerRadius);
        setVal('ob-radius', p.radius);
        setVal('ob-r-tl', p.radiusTL);
        setVal('ob-r-tr', p.radiusTR);
        setVal('ob-r-br', p.radiusBR);
        setVal('ob-r-bl', p.radiusBL);

        document.getElementById('ob-radius-uniform-wrap').hidden = Boolean(p.perCornerRadius);
        document.getElementById('ob-radius-percorner-wrap').hidden = !p.perCornerRadius;

        setVal('ob-inner-enabled', p.inner?.enabled);
        setVal('ob-inner-style', p.inner?.style || 'gradient');
        setVal('ob-inner-thickness', p.inner?.thickness);
        setVal('ob-inner-gap', p.inner?.gap);
        setVal('ob-inner-angle', p.inner?.angle);
        setVal('ob-inner-c1', p.inner?.color1);
        setVal('ob-inner-c2', p.inner?.color2);
        syncColorPicker('ob-inner-c1', 'ob-inner-c1-pick');
        syncColorPicker('ob-inner-c2', 'ob-inner-c2-pick');

        setVal('ob-outer-enabled', p.outer?.enabled);
        setVal('ob-outer-style', p.outer?.style || 'gradient');
        setVal('ob-outer-thickness', p.outer?.thickness);
        setVal('ob-outer-gap', p.outer?.gap);
        setVal('ob-outer-angle', p.outer?.angle);
        setVal('ob-outer-c1', p.outer?.color1);
        setVal('ob-outer-c2', p.outer?.color2);
        syncColorPicker('ob-outer-c1', 'ob-outer-c1-pick');
        syncColorPicker('ob-outer-c2', 'ob-outer-c2-pick');

        setVal('ob-glow-enabled', p.glow?.enabled);
        setVal('ob-glow-color', p.glow?.color);
        syncColorPicker('ob-glow-color', 'ob-glow-color-pick');
        setVal('ob-glow-size', p.glow?.size);
        setVal('ob-glow-intensity', p.glow?.intensity);

        setVal('ob-anim-type', p.animation?.type || 'none');
        setVal('ob-anim-speed', p.animation?.speed ?? 1.0);

        setVal('ob-scene-mode', p.sceneMode || 'all');
        renderSceneList();
        mountVariableBinders();
        schedulePreviewDraw();
    }

    function mountVariableBinders() {
        if (!window.StreamPulseWizardVarBinder) return;
        const fields = document.querySelectorAll('#ob-pane-designer input[data-var-type]');
        fields.forEach(input => {
            window.StreamPulseWizardVarBinder.attach(input, {
                kind: input.dataset.varType === 'color' ? 'color' : 'number',
                onUpdate: () => {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            window.StreamPulseWizardVarBinder.refreshControlState(input);
        });
    }

    function renderProfileSelector() {
        const sel = document.getElementById('ob-profile-select');
        if (!sel || !studioState) return;
        sel.innerHTML = '';
        for (const prof of studioState.profiles) {
            const opt = document.createElement('option');
            opt.value = prof.id;
            opt.textContent = prof.id === studioState.activeProfileId
                ? `${prof.name} (Active)`
                : prof.name;
            sel.appendChild(opt);
        }
        sel.value = selectedProfileId;
        const activeProf = studioState.profiles.find(p => p.id === studioState.activeProfileId);
        const pill = document.getElementById('ob-active-pill');
        if (pill) pill.textContent = `Active: ${activeProf ? activeProf.name : '—'}`;
    }

    function renderBundleList() {
        const host = document.getElementById('ob-bundle-list');
        if (!host || !studioState) return;
        const bundles = studioState.knownBundles || [];
        const overrides = studioState.targetOverrides || {};
        if (!bundles.length) {
            host.innerHTML = '<div class="hint">No target bundles yet. Import your OBS JSON or add a bundle name below.</div>';
            return;
        }
        host.innerHTML = '';
        for (const name of bundles) {
            const row = document.createElement('div');
            row.className = 'ob-bundle-row';
            const label = document.createElement('span');
            label.style.fontWeight = '600';
            label.style.fontSize = '0.84rem';
            label.textContent = name;

            const sel = document.createElement('select');
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.textContent = 'Default (Active Profile)';
            sel.appendChild(defOpt);
            for (const p of studioState.profiles) {
                const o = document.createElement('option');
                o.value = p.id;
                o.textContent = p.name;
                sel.appendChild(o);
            }
            sel.value = overrides[name] || '';
            sel.addEventListener('change', async () => {
                try {
                    const res = await fetch('/api/obs-borders/activate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target: name, profileId: sel.value || studioState.activeProfileId })
                    });
                    const data = await res.json();
                    if (data.state) {
                        studioState = data.state;
                        showToast(`Assigned ${name}`);
                    }
                } catch {
                    showToast('Failed to assign target');
                }
            });

            row.appendChild(label);
            row.appendChild(sel);
            host.appendChild(row);
        }
    }

    function renderSceneList() {
        const host = document.getElementById('ob-scene-list');
        const countEl = document.getElementById('ob-scene-count');
        if (!host || !studioState || !workingProfile) return;
        const filter = (document.getElementById('ob-scene-search')?.value || '').trim().toLowerCase();
        const scenes = (studioState.knownScenes || []).filter(s => !filter || s.toLowerCase().includes(filter));
        const selectedSet = new Set(workingProfile.scenes || []);
        if (countEl) countEl.textContent = `${scenes.length} of ${(studioState.knownScenes || []).length} scenes`;

        if (!scenes.length) {
            host.innerHTML = '<div class="hint" style="grid-column:1/-1;padding:0.5rem;">Import an OBS Scene Collection JSON above to populate your scenes.</div>';
            return;
        }
        host.innerHTML = '';
        for (const sc of scenes) {
            const lbl = document.createElement('label');
            lbl.className = 'ob-check';
            lbl.style.fontSize = '0.8rem';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = selectedSet.has(sc);
            cb.addEventListener('change', () => {
                const cur = new Set(workingProfile.scenes || []);
                if (cb.checked) cur.add(sc);
                else cur.delete(sc);
                workingProfile.scenes = [...cur];
            });
            const span = document.createElement('span');
            span.textContent = sc;
            lbl.appendChild(cb);
            lbl.appendChild(span);
            host.appendChild(lbl);
        }
    }

    function renderSetupInfo() {
        if (!studioState) return;
        const pathsBox = document.getElementById('ob-file-paths');
        if (pathsBox) {
            pathsBox.textContent = `Lua Script: ${studioState.luaScriptPath}\nManifest JSON: ${studioState.manifestPath}`;
        }
    }

    async function refreshManifestPreview() {
        const box = document.getElementById('ob-manifest-preview');
        if (!box) return;
        try {
            const res = await fetch('/api/obs-borders/manifest', { cache: 'no-store' });
            const json = await res.json();
            box.textContent = JSON.stringify(json, null, 2);
        } catch {
            box.textContent = 'Manifest preview unavailable.';
        }
    }

    // ------------------------------------------------------------------------
    // Live Canvas Preview Renderer (Mirrors Metal SDF Shader)
    // ------------------------------------------------------------------------
    function drawRoundedRectPath(ctx, x, y, w, h, radii) {
        const [tl, tr, br, bl] = radii;
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        if (tr > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        if (br > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        if (bl > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        if (tl > 0) ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    }

    function drawSampleVideoContent(ctx, x, y, w, h, mode) {
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        if (mode === 'cam') {
            grad.addColorStop(0, '#1f2d42');
            grad.addColorStop(0.55, '#2b3e58');
            grad.addColorStop(1, '#182230');
        } else if (mode === 'game') {
            grad.addColorStop(0, '#1a1230');
            grad.addColorStop(0.5, '#3b1f4a');
            grad.addColorStop(1, '#0f2738');
        } else {
            grad.addColorStop(0, '#11161d');
            grad.addColorStop(1, '#11161d');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        if (mode === 'cam') {
            ctx.fillStyle = 'rgba(255,255,255,0.09)';
            ctx.beginPath();
            ctx.arc(x + w * 0.5, y + h * 0.38, Math.min(w, h) * 0.14, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + w * 0.5, y + h * 0.78, Math.min(w, h) * 0.25, Math.min(w, h) * 0.22, 0, Math.PI, Math.PI * 2);
            ctx.fill();
        } else if (mode === 'game') {
            ctx.strokeStyle = 'rgba(88,166,255,0.22)';
            ctx.lineWidth = 2;
            for (let i = 1; i < 6; i++) {
                ctx.beginPath();
                ctx.moveTo(x, y + (h * i) / 6);
                ctx.lineTo(x + w, y + (h * i) / 6);
                ctx.stroke();
            }
        }

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(mode === 'cam' ? 'WEBCAM SOURCE (16:9)' : (mode === 'game' ? 'GAMEPLAY CAPTURE' : 'SOURCE FRAME'), x + 16, y + 26);
    }

    function createLayerStrokeStyle(ctx, layer, x, y, w, h, animType, phase) {
        let c1 = resolveColor(layer.color1, '#FFFFFFFF');
        let c2 = resolveColor(layer.color2, '#999999FF');
        if (animType === 'color-cycle') {
            const mix = 0.5 + 0.5 * Math.sin(phase * 2.5);
            if (mix > 0.5) [c1, c2] = [c2, c1];
        }
        if (layer.style === 'solid') return hexToRgbaCss(c1);
        const angleDeg = resolveNum(layer.angle, 180, -360, 360) + (animType === 'rotate-gradient' ? phase * 85 : 0);
        const rad = (angleDeg * Math.PI) / 180;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const dx = Math.sin(rad) * (w / 2);
        const dy = -Math.cos(rad) * (h / 2);
        const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        grad.addColorStop(0, hexToRgbaCss(c1));
        grad.addColorStop(1, hexToRgbaCss(c2));
        return grad;
    }

    function drawMiteredBevelBand(ctx, x, y, w, h, thickness, c1Css, c2Css, invert) {
        const topLeft = invert ? c2Css : c1Css;
        const botRight = invert ? c1Css : c2Css;
        // Top trapezoid
        ctx.fillStyle = topLeft;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - thickness, y + thickness);
        ctx.lineTo(x + thickness, y + thickness);
        ctx.closePath();
        ctx.fill();
        // Left trapezoid
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + thickness, y + thickness);
        ctx.lineTo(x + thickness, y + h - thickness);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        // Bottom trapezoid
        ctx.fillStyle = botRight;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + thickness, y + h - thickness);
        ctx.lineTo(x + w - thickness, y + h - thickness);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
        // Right trapezoid
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w - thickness, y + h - thickness);
        ctx.lineTo(x + w - thickness, y + thickness);
        ctx.closePath();
        ctx.fill();
    }

    function drawPreviewFrame(nowMs) {
        const canvas = document.getElementById('ob-preview-canvas');
        if (!canvas || !workingProfile) return;
        const ctx = canvas.getContext('2d');
        const p = workingProfile;

        const baseW = Math.max(64, Number(p.baseWidth) || 1920);
        const baseH = Math.max(64, Number(p.baseHeight) || 1080);
        const pad = p.placement === 'outset' ? Math.max(0, Number(p.pad) || 0) : 0;
        const totalW = baseW + pad * 2;
        const totalH = baseH + pad * 2;

        const dimsEl = document.getElementById('ob-preview-dims');
        if (dimsEl) {
            dimsEl.textContent = pad > 0
                ? `Source: ${baseW}×${baseH} → Expanded: ${totalW}×${totalH} (+${pad}px pad)`
                : `Source: ${baseW}×${baseH} (No outer expansion)`;
        }

        const cw = canvas.width;
        const ch = canvas.height;
        ctx.clearRect(0, 0, cw, ch);

        const scale = Math.min((cw - 24) / totalW, (ch - 24) / totalH);
        const drawTotalW = totalW * scale;
        const drawTotalH = totalH * scale;
        const ox = (cw - drawTotalW) / 2;
        const oy = (ch - drawTotalH) / 2;

        const srcX = ox + pad * scale;
        const srcY = oy + pad * scale;
        const srcW = baseW * scale;
        const srcH = baseH * scale;

        const uniR = resolveNum(p.radius, 20, 0, 500);
        const rArr = p.perCornerRadius
            ? [
                resolveNum(p.radiusTL, uniR, 0, 500) * scale,
                resolveNum(p.radiusTR, uniR, 0, 500) * scale,
                resolveNum(p.radiusBR, uniR, 0, 500) * scale,
                resolveNum(p.radiusBL, uniR, 0, 500) * scale
            ]
            : [uniR * scale, uniR * scale, uniR * scale, uniR * scale];

        const animType = p.animation?.type || 'none';
        const animSpeed = resolveNum(p.animation?.speed, 1.0, 0.05, 10);
        const phase = ((nowMs - animStartMs) / 1000) * animSpeed;

        // Glow behind frame
        if (p.glow?.enabled) {
            const gSize = resolveNum(p.glow.size, 18, 0, 150) * scale;
            const gInt = resolveNum(p.glow.intensity, 0.55, 0, 2);
            const pulse = animType === 'pulse-glow' ? (0.7 + 0.3 * Math.sin(phase * 3)) : 1;
            ctx.save();
            ctx.shadowColor = hexToRgbaCss(resolveColor(p.glow.color, '#58A6FFFF'), Math.min(1, gInt * pulse));
            ctx.shadowBlur = gSize * 1.4;
            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            drawRoundedRectPath(ctx, srcX, srcY, srcW, srcH, rArr);
            ctx.fill();
            ctx.restore();
        }

        // Clipped video frame
        ctx.save();
        drawRoundedRectPath(ctx, srcX, srcY, srcW, srcH, rArr);
        ctx.clip();
        drawSampleVideoContent(ctx, srcX, srcY, srcW, srcH, previewBg);
        ctx.restore();

        // Compute outward band offsets matching shader
        const inT = p.inner?.enabled ? resolveNum(p.inner.thickness, 12, 0, 200) * scale : 0;
        const inGap = resolveNum(p.inner?.gap, 0, 0, 100) * scale;
        const outT = p.outer?.enabled ? resolveNum(p.outer.thickness, 2, 0, 200) * scale : 0;
        const outGap = resolveNum(p.outer?.gap, 0, 0, 100) * scale;
        const seam = (Number(p.seamOverlap) || 0) * scale;

        let shift = -seam;
        if (p.placement === 'center') shift = -0.5 * (inT + outT);
        else if (p.placement === 'inset') shift = -(inT + outT + inGap + outGap);

        const drawBand = (layer, bandStart, thickness) => {
            if (!layer?.enabled || thickness <= 0.1) return;
            const bx = srcX - bandStart - thickness;
            const by = srcY - bandStart - thickness;
            const bw = srcW + (bandStart + thickness) * 2;
            const bh = srcH + (bandStart + thickness) * 2;
            const isMiter = p.cornerJoin === 'miter' || layer.style === 'outset-bevel' || layer.style === 'inset-bevel';

            if ((layer.style === 'outset-bevel' || layer.style === 'inset-bevel' || layer.style === 'ridge' || layer.style === 'groove') && (isMiter || p.cornerJoin === 'miter')) {
                const c1Css = hexToRgbaCss(resolveColor(layer.color1, '#FFFFFFFF'));
                const c2Css = hexToRgbaCss(resolveColor(layer.color2, '#999999FF'));
                drawMiteredBevelBand(ctx, bx, by, bw, bh, thickness, c1Css, c2Css, layer.style === 'inset-bevel');
                return;
            }

            const midOffset = bandStart + thickness * 0.5;
            const mx = srcX - midOffset;
            const my = srcY - midOffset;
            const mw = srcW + midOffset * 2;
            const mh = srcH + midOffset * 2;
            const strokeRadii = p.cornerJoin === 'miter'
                ? [0, 0, 0, 0]
                : rArr.map(r => Math.max(0, r + midOffset));

            ctx.save();
            ctx.lineWidth = thickness;
            ctx.strokeStyle = createLayerStrokeStyle(ctx, layer, mx, my, mw, mh, animType, phase);
            drawRoundedRectPath(ctx, mx, my, mw, mh, strokeRadii);
            ctx.stroke();
            ctx.restore();
        };

        const inStart = shift + inGap;
        const inEnd = inStart + inT;
        const outStart = inEnd + outGap;

        drawBand(p.inner, inStart, inT);
        drawBand(p.outer, outStart, outT);
    }

    function stopPreviewAnim() {
        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    function schedulePreviewDraw() {
        stopPreviewAnim();
        if (activeTab !== 'designer' || document.hidden) return;
        const needsLoop = workingProfile && workingProfile.animation?.type && workingProfile.animation.type !== 'none';
        if (needsLoop) {
            const tick = (now) => {
                if (activeTab !== 'designer' || document.hidden) {
                    animFrameId = null;
                    return;
                }
                drawPreviewFrame(now);
                animFrameId = requestAnimationFrame(tick);
            };
            animFrameId = requestAnimationFrame(tick);
        } else {
            drawPreviewFrame(performance.now());
        }
    }

    // ------------------------------------------------------------------------
    // Tab Switching & Data Loading
    // ------------------------------------------------------------------------
    function switchTab(tab) {
        activeTab = tab;
        try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch {}
        document.querySelectorAll('[data-ob-tab]').forEach(btn => {
            const on = btn.dataset.obTab === tab;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.getElementById('ob-pane-designer').hidden = tab !== 'designer';
        document.getElementById('ob-pane-scenes').hidden = tab !== 'scenes';
        document.getElementById('ob-pane-setup').hidden = tab !== 'setup';

        if (tab === 'designer') schedulePreviewDraw();
        else stopPreviewAnim();

        if (tab === 'setup') refreshManifestPreview();
    }

    async function loadStudioData() {
        try {
            const [bordersRes, varsRes] = await Promise.all([
                fetch('/api/obs-borders', { cache: 'no-store' }),
                fetch('/api/variables', { cache: 'no-store' }).catch(() => null)
            ]);
            if (bordersRes.ok) {
                studioState = await bordersRes.json();
                variableSettingsEnabled = studioState.variableSettingsEnabled !== false;
                if (!selectedProfileId || !studioState.profiles.some(p => p.id === selectedProfileId)) {
                    selectedProfileId = studioState.activeProfileId || studioState.profiles[0]?.id || '';
                }
                const found = studioState.profiles.find(p => p.id === selectedProfileId) || studioState.profiles[0];
                workingProfile = found ? cloneProfile(found) : null;
            }
            if (varsRes && varsRes.ok) {
                const vData = await varsRes.json();
                variableValues = vData.values || {};
                if (typeof vData.variableSettingsEnabled === 'boolean') {
                    variableSettingsEnabled = vData.variableSettingsEnabled;
                }
            }
            renderProfileSelector();
            populateFormFromProfile();
            renderBundleList();
            renderSetupInfo();
        } catch (err) {
            console.error('[ObsBorders] Failed to load:', err);
            showToast('Failed to load OBS Border Studio data');
        }
    }

    async function saveWorkingProfile({ setActive = false } = {}) {
        if (!workingProfile) return;
        try {
            const res = await fetch('/api/obs-borders/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: workingProfile, setActive })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            studioState = data.state;
            selectedProfileId = data.profile.id;
            workingProfile = cloneProfile(data.profile);
            renderProfileSelector();
            populateFormFromProfile();
            renderBundleList();
            renderSetupInfo();
            showToast('Saved & synced to OBS manifest');
        } catch (err) {
            showToast(err.message || 'Save failed');
        }
    }

    function bindFormListeners() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
                if (!workingProfile) return;
                fn(el);
                schedulePreviewDraw();
            });
        };

        bind('ob-name', el => { workingProfile.name = el.value; });
        bind('ob-id', el => { workingProfile.id = el.value; });
        bind('ob-placement', el => { workingProfile.placement = el.value; });
        bind('ob-corner-join', el => { workingProfile.cornerJoin = el.value; });
        bind('ob-pad', el => { workingProfile.pad = Number(el.value) || 0; });
        bind('ob-seam', el => { workingProfile.seamOverlap = Number(el.value) || 0; });
        bind('ob-base-w', el => { workingProfile.baseWidth = Number(el.value) || 1920; });
        bind('ob-base-h', el => { workingProfile.baseHeight = Number(el.value) || 1080; });
        bind('ob-per-corner', el => {
            workingProfile.perCornerRadius = el.checked;
            document.getElementById('ob-radius-uniform-wrap').hidden = el.checked;
            document.getElementById('ob-radius-percorner-wrap').hidden = !el.checked;
        });
        bind('ob-radius', el => { workingProfile.radius = el.value; });
        bind('ob-r-tl', el => { workingProfile.radiusTL = el.value; });
        bind('ob-r-tr', el => { workingProfile.radiusTR = el.value; });
        bind('ob-r-br', el => { workingProfile.radiusBR = el.value; });
        bind('ob-r-bl', el => { workingProfile.radiusBL = el.value; });

        bind('ob-inner-enabled', el => { workingProfile.inner.enabled = el.checked; });
        bind('ob-inner-style', el => { workingProfile.inner.style = el.value; });
        bind('ob-inner-thickness', el => { workingProfile.inner.thickness = el.value; });
        bind('ob-inner-gap', el => { workingProfile.inner.gap = el.value; });
        bind('ob-inner-angle', el => { workingProfile.inner.angle = el.value; });
        bindColorPair('ob-inner-c1', 'ob-inner-c1-pick', v => { workingProfile.inner.color1 = v; });
        bindColorPair('ob-inner-c2', 'ob-inner-c2-pick', v => { workingProfile.inner.color2 = v; });

        bind('ob-outer-enabled', el => { workingProfile.outer.enabled = el.checked; });
        bind('ob-outer-style', el => { workingProfile.outer.style = el.value; });
        bind('ob-outer-thickness', el => { workingProfile.outer.thickness = el.value; });
        bind('ob-outer-gap', el => { workingProfile.outer.gap = el.value; });
        bind('ob-outer-angle', el => { workingProfile.outer.angle = el.value; });
        bindColorPair('ob-outer-c1', 'ob-outer-c1-pick', v => { workingProfile.outer.color1 = v; });
        bindColorPair('ob-outer-c2', 'ob-outer-c2-pick', v => { workingProfile.outer.color2 = v; });

        bind('ob-glow-enabled', el => { workingProfile.glow.enabled = el.checked; });
        bindColorPair('ob-glow-color', 'ob-glow-color-pick', v => { workingProfile.glow.color = v; });
        bind('ob-glow-size', el => { workingProfile.glow.size = el.value; });
        bind('ob-glow-intensity', el => { workingProfile.glow.intensity = el.value; });

        bind('ob-anim-type', el => { workingProfile.animation.type = el.value; });
        bind('ob-anim-speed', el => { workingProfile.animation.speed = el.value; });

        bind('ob-scene-mode', el => { workingProfile.sceneMode = el.value; });

        document.getElementById('ob-scene-search')?.addEventListener('input', renderSceneList);

        document.getElementById('ob-profile-select')?.addEventListener('change', (e) => {
            selectedProfileId = e.target.value;
            const found = studioState.profiles.find(p => p.id === selectedProfileId);
            if (found) {
                workingProfile = cloneProfile(found);
                populateFormFromProfile();
            }
        });

        document.getElementById('ob-btn-save')?.addEventListener('click', () => saveWorkingProfile());
        document.getElementById('ob-btn-activate')?.addEventListener('click', () => saveWorkingProfile({ setActive: true }));

        document.getElementById('ob-btn-new')?.addEventListener('click', () => {
            const base = cloneProfile(studioState.profiles[0] || workingProfile);
            base.id = `custom-border-${Date.now().toString(36).slice(-4)}`;
            base.name = 'New Border Profile';
            base.targetBundles = [];
            base.scenes = [];
            workingProfile = base;
            populateFormFromProfile();
            showToast('Editing new unsaved profile — click Save & Sync OBS');
        });

        document.getElementById('ob-btn-duplicate')?.addEventListener('click', async () => {
            try {
                const res = await fetch(`/api/obs-borders/profile/${encodeURIComponent(selectedProfileId)}/duplicate`, { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Duplicate failed');
                studioState = data.state;
                selectedProfileId = data.profile.id;
                workingProfile = cloneProfile(data.profile);
                renderProfileSelector();
                populateFormFromProfile();
                showToast('Profile duplicated');
            } catch (err) {
                showToast(err.message || 'Duplicate failed');
            }
        });

        document.getElementById('ob-btn-delete')?.addEventListener('click', async () => {
            if (!confirm(`Delete border profile "${workingProfile?.name || selectedProfileId}"?`)) return;
            try {
                const res = await fetch(`/api/obs-borders/profile/${encodeURIComponent(selectedProfileId)}`, { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Delete failed');
                studioState = data.state;
                selectedProfileId = studioState.activeProfileId;
                const found = studioState.profiles.find(p => p.id === selectedProfileId) || studioState.profiles[0];
                workingProfile = found ? cloneProfile(found) : null;
                renderProfileSelector();
                populateFormFromProfile();
                renderBundleList();
                showToast('Profile deleted');
            } catch (err) {
                showToast(err.message || 'Delete failed');
            }
        });

        document.getElementById('ob-btn-add-bundle')?.addEventListener('click', async () => {
            const inp = document.getElementById('ob-add-bundle-name');
            const name = (inp?.value || '').trim();
            if (!name) return;
            try {
                const res = await fetch('/api/obs-borders/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target: name, profileId: selectedProfileId || studioState.activeProfileId })
                });
                const data = await res.json();
                if (data.state) {
                    studioState = data.state;
                    if (inp) inp.value = '';
                    renderBundleList();
                    showToast(`Added target ${name}`);
                }
            } catch {
                showToast('Failed to add target');
            }
        });

        document.getElementById('ob-btn-import-path')?.addEventListener('click', async () => {
            const filePath = (document.getElementById('ob-import-path')?.value || '').trim();
            if (!filePath) return;
            try {
                const res = await fetch('/api/obs-borders/import-scenes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Import failed');
                studioState = data.state;
                renderBundleList();
                renderSceneList();
                document.getElementById('ob-import-result').textContent = `Imported "${data.collectionName}": ${data.scenesCount} scenes, ${data.bundlesCount} bundles (${(data.legacyShaderTargets || []).length} with legacy shader filters).`;
                showToast('OBS Scene Collection imported');
            } catch (err) {
                document.getElementById('ob-import-result').textContent = err.message || 'Import failed';
                showToast(err.message || 'Import failed');
            }
        });

        document.getElementById('ob-import-file')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const jsonData = JSON.parse(await file.text());
                const res = await fetch('/api/obs-borders/import-scenes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonData })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Import failed');
                studioState = data.state;
                renderBundleList();
                renderSceneList();
                document.getElementById('ob-import-result').textContent = `Imported "${data.collectionName}": ${data.scenesCount} scenes, ${data.bundlesCount} bundles.`;
                showToast('OBS Scene Collection imported');
            } catch (err) {
                showToast(err.message || 'Invalid JSON file');
            }
        });

        document.getElementById('ob-btn-refresh-manifest')?.addEventListener('click', refreshManifestPreview);

        document.querySelectorAll('[data-ob-tab]').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.obTab));
        });

        document.querySelectorAll('#ob-preview-bg-chips .ob-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.bg === previewBg);
            chip.addEventListener('click', () => {
                previewBg = chip.dataset.bg;
                try { localStorage.setItem(BG_STORAGE_KEY, previewBg); } catch {}
                document.querySelectorAll('#ob-preview-bg-chips .ob-chip').forEach(c => c.classList.toggle('active', c === chip));
                schedulePreviewDraw();
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopPreviewAnim();
            else schedulePreviewDraw();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindFormListeners();
        switchTab(activeTab);
        loadStudioData();
    });
})();
