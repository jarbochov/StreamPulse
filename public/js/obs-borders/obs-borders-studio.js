(function () {
    'use strict';

    const TAB_STORAGE_KEY = 'streampulse:obs-borders:tab';
    const INSPECTOR_TAB_KEY = 'streampulse:obs-borders:inspector-tab';
    const ADV_STORAGE_KEY = 'streampulse:obs-borders:adv-open';
    const BG_STORAGE_KEY = 'streampulse:obs-borders:bg';
    const VIEW_STORAGE_KEY = 'streampulse:obs-borders:view';
    const FILTER_STORAGE_KEY = 'streampulse:obs-borders:filter';

    const SHARED = window.StreamPulseBorderCatalog || window.OverlayShared || {};
    const BORDER_STYLE_GROUPS = Array.isArray(SHARED.BORDER_STYLE_GROUPS) ? SHARED.BORDER_STYLE_GROUPS : [];
    const BORDER_ANIMATION_GROUPS = Array.isArray(SHARED.BORDER_ANIMATION_GROUPS) ? SHARED.BORDER_ANIMATION_GROUPS : [];
    const STYLE_CODE_MAP = SHARED.STYLE_CODE_MAP || { solid: 0 };
    const ANIM_CODE_MAP = SHARED.ANIM_CODE_MAP || { none: 0 };
    const SHADOW_MODES = Array.isArray(SHARED.SHADOW_MODES) ? SHARED.SHADOW_MODES : [
        { id: 'soft', label: 'Soft Drop (Feathered)', code: 0 },
        { id: 'hard', label: 'Hard Offset (Solid Card)', code: 1 },
        { id: 'layered', label: 'Layered Elevation (Contact + Soft)', code: 2 },
        { id: 'inset', label: 'Inner Shadow (Inset over Source)', code: 3 }
    ];
    const SHADOW_MODE_MAP = SHARED.SHADOW_MODE_MAP || { soft: 0, hard: 1, layered: 2, inset: 3 };
    const BACKGROUND_MODE_MAP = SHARED.BACKGROUND_MODE_MAP || {
        none: 0,
        person: 1,
        solid: 2,
        gradient: 3,
        'tv-static': 4
    };

    const PLACEMENT_HINTS = {
        outside: 'Expands the OBS canvas evenly outward so borders sit outside your 16:9 video cleanly.',
        center: 'Straddles the source edge half inside and half outside; auto-expands for the outer half + glow.',
        inside: 'Renders strictly inside your 16:9 source dimensions (0px expansion — outer shadows & external glow are unavailable; Inner Glow & Inner Shadow still work).'
    };

    function parseTabFromHash() {
        const h = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
        if (h === 'sources' || h === 'live' || h === 'obs') return 'sources';
        if (h === 'designer' || h === 'profiles' || h === 'editor') return 'designer';
        if (h === 'setup' || h === 'api' || h === 'script') return 'setup';
        return '';
    }

    let studioState = null;
    let selectedProfileId = '';
    let workingProfile = null;
    let variableValues = {};
    let variableSettingsEnabled = true;
    let obsFilterStatuses = {};
    let obsByScene = {};
    let currentProgramScene = '';
    let obsConnected = false;
    let activeTab = parseTabFromHash() || localStorage.getItem(TAB_STORAGE_KEY) || 'sources';
    let activeInspectorTab = localStorage.getItem(INSPECTOR_TAB_KEY) || 'geometry';
    let sourceViewMode = localStorage.getItem(VIEW_STORAGE_KEY) || 'sources';
    let sourceFilter = localStorage.getItem(FILTER_STORAGE_KEY) || 'all';
    const expandedDrawers = new Set();
    const collapsedGroups = new Set(['grp:scenes']);
    let previewBg = localStorage.getItem(BG_STORAGE_KEY) || 'cam';
    let showGuides = true;
    let animFrameId = null;
    let animOriginMs = performance.now();
    let previewPaused = false;
    let pausedElapsedMs = 0;
    let varBinderMounted = false;
    let isPopulating = false;

    const VAR_TOKEN_RE = /^(?:var:([a-zA-Z0-9_.-]+)(?:\|(.*))?|\{\{\s*var\.([a-zA-Z0-9_.-]+)(?:\|([\s\S]*?))?\s*\}\})$/;

    function showToast(msg) {
        const el = document.getElementById('ob-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2600);
    }

    function normalizePlacement(p) {
        if (p === 'outside' || p === 'outset') return 'outside';
        if (p === 'center' || p === 'middle') return 'center';
        if (p === 'inside' || p === 'inset') return 'inside';
        return 'outside';
    }

    function normalizeStyleAlias(style) {
        if (style === 'gradient' || style === 'conic-gradient') return 'solid';
        if (style === 'outset-bevel') return 'outset';
        if (style === 'inset-bevel') return 'inset';
        if (style === 'corners') return 'corner-brackets';
        return STYLE_CODE_MAP[style] !== undefined ? style : 'solid';
    }

    function normalizeAnimAlias(type) {
        if (type === 'rotate-gradient') return 'rotating';
        if (type === 'pulse-glow') return 'pulsing';
        if (type === 'shimmer-bevel') return 'laser-scan';
        if (type === 'color-cycle') return 'gradient';
        return ANIM_CODE_MAP[type] !== undefined ? type : 'none';
    }

    function populateStyleSelects() {
        document.querySelectorAll('select.ob-style-select').forEach(sel => {
            sel.innerHTML = '';
            for (const grp of BORDER_STYLE_GROUPS) {
                const og = document.createElement('optgroup');
                og.label = grp.label;
                for (const opt of grp.options) {
                    const o = document.createElement('option');
                    o.value = opt.id ?? opt[0];
                    o.textContent = opt.label ?? opt[1];
                    og.appendChild(o);
                }
                sel.appendChild(og);
            }
        });

        const animSel = document.getElementById('ob-anim-type');
        if (animSel) {
            animSel.innerHTML = '';
            const noneOpt = document.createElement('option');
            noneOpt.value = 'none';
            noneOpt.textContent = 'None (static)';
            animSel.appendChild(noneOpt);
            for (const grp of BORDER_ANIMATION_GROUPS) {
                const og = document.createElement('optgroup');
                og.label = grp.label;
                for (const opt of grp.options) {
                    const o = document.createElement('option');
                    o.value = opt.id ?? opt[0];
                    o.textContent = opt.label ?? opt[1];
                    og.appendChild(o);
                }
                animSel.appendChild(og);
            }
        }

        const shSel = document.getElementById('ob-shadow-mode');
        if (shSel) {
            shSel.innerHTML = '';
            for (const m of SHADOW_MODES) {
                const o = document.createElement('option');
                o.value = m.id;
                o.textContent = m.label;
                shSel.appendChild(o);
            }
        }
    }

    function updateBgFieldVisibility(bgMode) {
        const mode = bgMode || 'none';
        const iconWrap = document.getElementById('ob-bg-icon-wrap');
        const colorsWrap = document.getElementById('ob-bg-colors-wrap');
        const c2Wrap = document.getElementById('ob-bg-c2-wrap');
        const angleWrap = document.getElementById('ob-bg-angle-wrap');
        const staticWrap = document.getElementById('ob-bg-static-wrap');
        if (iconWrap) iconWrap.hidden = mode !== 'person';
        if (colorsWrap) colorsWrap.hidden = mode === 'none';
        if (c2Wrap) c2Wrap.hidden = mode === 'solid' || mode === 'tv-static';
        if (angleWrap) angleWrap.hidden = mode !== 'gradient' && mode !== 'person';
        if (staticWrap) staticWrap.hidden = mode !== 'tv-static';
    }

    function updatePadFieldVisibility(placement, autoPad) {
        const isInside = normalizePlacement(placement) === 'inside';
        const autoRow = document.getElementById('ob-auto-pad-row');
        const autoWrap = document.getElementById('ob-pad-auto-wrap');
        const manualWrap = document.getElementById('ob-pad-manual-wrap');
        if (autoRow) autoRow.style.opacity = isInside ? '0.45' : '1';
        if (autoWrap) autoWrap.hidden = isInside || !autoPad;
        if (manualWrap) manualWrap.hidden = isInside || autoPad;
    }

    function updateBorderDesignerVisibility(profile) {
        const p = profile || workingProfile;
        if (!p) return;
        const innerOn = Boolean(p.inner?.enabled);
        const outerOn = Boolean(p.outer?.enabled);
        const glowOn = Boolean(p.glow?.enabled);
        const animOn = normalizeAnimAlias(p.animation?.type || 'none') !== 'none';

        const toggleSect = (sectId, bodyId, on) => {
            const sect = document.getElementById(sectId);
            const body = document.getElementById(bodyId);
            if (sect) sect.classList.toggle('is-disabled', !on);
            if (body) body.hidden = !on;
        };
        toggleSect('ob-sect-inner', 'ob-inner-body', innerOn);
        toggleSect('ob-sect-outer', 'ob-outer-body', outerOn);
        toggleSect('ob-sect-glow', 'ob-glow-body', glowOn);
        toggleSect('ob-sect-shadow', 'ob-shadow-body', Boolean(p.shadow?.enabled));

        const shMode = p.shadow?.mode || 'soft';
        const isInside = normalizePlacement(p.placement) === 'inside';
        const shBlurWrap = document.getElementById('ob-shadow-blur-wrap');
        if (shBlurWrap) shBlurWrap.hidden = shMode === 'hard';
        const shInsetWrap = document.getElementById('ob-shadow-inset-wrap');
        if (shInsetWrap) shInsetWrap.hidden = shMode !== 'inset';
        const glowInsideNote = document.getElementById('ob-glow-inside-note');
        if (glowInsideNote) glowInsideNote.hidden = !isInside || Boolean(p.glow?.inner);
        const shInsideNote = document.getElementById('ob-shadow-inside-note');
        if (shInsideNote) shInsideNote.hidden = !isInside || shMode === 'inset';
        document.querySelectorAll('#ob-shadow-mode option').forEach(opt => {
            if (opt.value !== 'inset') opt.disabled = isInside;
        });

        const innerAng = document.getElementById('ob-inner-angle-wrap');
        if (innerAng) innerAng.hidden = !p.inner?.gradient;
        const outerAng = document.getElementById('ob-outer-angle-wrap');
        if (outerAng) outerAng.hidden = !p.outer?.gradient;

        const animSpeed = document.getElementById('ob-anim-speed-wrap');
        const animParams = document.getElementById('ob-anim-params-wrap');
        if (animSpeed) animSpeed.hidden = !animOn;
        if (animParams) animParams.hidden = !animOn;
    }

    function isWorkingProfileDirty() {
        if (!workingProfile || !studioState?.profiles) return false;
        const saved = studioState.profiles.find(p => p.id === selectedProfileId);
        if (!saved) return true;
        return JSON.stringify(workingProfile) !== JSON.stringify(saved);
    }

    function updateDirtyIndicators() {
        const dirty = isWorkingProfileDirty();
        const topPill = document.getElementById('ob-dirty-pill');
        const prevPill = document.getElementById('ob-preview-sync-pill');
        if (topPill) {
            topPill.textContent = dirty ? 'Unsaved Changes' : 'Synced';
            topPill.classList.toggle('is-dirty', dirty);
            topPill.classList.toggle('is-synced', !dirty);
        }
        if (prevPill) {
            prevPill.textContent = dirty ? 'Unsaved edits' : 'Synced with OBS';
            prevPill.classList.toggle('is-dirty', dirty);
            prevPill.classList.toggle('is-synced', !dirty);
        }
    }

    function switchInspectorTab(tab) {
        const valid = ['geometry', 'layers', 'fx', 'standby'];
        const clean = valid.includes(tab) ? tab : 'geometry';
        activeInspectorTab = clean;
        try { localStorage.setItem(INSPECTOR_TAB_KEY, clean); } catch {}
        document.querySelectorAll('#ob-inspector-tabs [data-ob-inspector]').forEach(btn => {
            const on = btn.dataset.obInspector === clean;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        valid.forEach(k => {
            const pane = document.getElementById(`ob-inspector-${k}`);
            if (pane) pane.hidden = k !== clean;
        });
    }

    function updatePreviewPauseButtonUI() {
        const btn = document.getElementById('ob-btn-preview-pause');
        if (!btn) return;
        btn.classList.toggle('active', previewPaused);
        btn.innerHTML = previewPaused
            ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="6 4 20 12 6 20 6 4"/></svg><span>Resume</span>'
            : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pause</span>';
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

    function hexToRgbaFloats(hex) {
        let h = String(hex || '#ffffffff').trim().replace(/^#/, '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + 'ff';
        else if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
        else if (h.length === 6) h += 'ff';
        if (h.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(h)) return [1, 1, 1, 1];
        return [
            parseInt(h.slice(0, 2), 16) / 255,
            parseInt(h.slice(2, 4), 16) / 255,
            parseInt(h.slice(4, 6), 16) / 255,
            parseInt(h.slice(6, 8), 16) / 255
        ];
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

    function setSegPressed(containerId, attr, val) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('button').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.getAttribute(attr) === val ? 'true' : 'false');
        });
    }

    function setControlValue(id, rawVal, fallbackNumOrColor, { isColor = false } = {}) {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = Boolean(rawVal);
            return;
        }
        const rawStr = rawVal === undefined || rawVal === null ? '' : String(rawVal);
        if (VAR_TOKEN_RE.test(rawStr.trim())) {
            el.dataset.varToken = rawStr.trim();
            const resolved = resolveToken(rawStr, fallbackNumOrColor);
            el.value = isColor ? resolved : String(Number(resolved) || fallbackNumOrColor);
        } else {
            if (el.dataset.varToken) delete el.dataset.varToken;
            el.value = rawStr !== '' ? rawStr : String(fallbackNumOrColor ?? '');
        }
    }

    function syncColorPicker(textId, pickId) {
        const textEl = document.getElementById(textId);
        const pickEl = document.getElementById(pickId);
        if (!textEl || !pickEl) return;
        pickEl.value = colorPickHex(textEl.dataset.varToken || textEl.value);
    }

    function getFieldRawValue(id, fallback) {
        if (window.WizardVariableBinder) {
            const v = window.WizardVariableBinder.readValue(id);
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        const el = document.getElementById(id);
        return el ? el.value : fallback;
    }

    function syncWorkingProfileFromDom() {
        if (!workingProfile || isPopulating) return;
        const p = workingProfile;
        p.name = document.getElementById('ob-name')?.value || p.name;
        p.id = document.getElementById('ob-id')?.value || p.id;
        p.autoPad = Boolean(document.getElementById('ob-auto-pad')?.checked ?? true);
        p.autoScale = Boolean(document.getElementById('ob-auto-scale')?.checked ?? true);
        p.extraPad = getFieldRawValue('ob-extra-pad', 0);
        p.pad = getFieldRawValue('ob-pad', 48);
        p.seamOverlap = Number(document.getElementById('ob-seam')?.value) || 0;
        p.baseWidth = Number(document.getElementById('ob-base-w')?.value) || 1920;
        p.baseHeight = Number(document.getElementById('ob-base-h')?.value) || 1080;
        p.perCornerRadius = Boolean(document.getElementById('ob-per-corner')?.checked);
        p.radius = getFieldRawValue('ob-radius', 20);
        p.radiusTL = getFieldRawValue('ob-r-tl', p.radius);
        p.radiusTR = getFieldRawValue('ob-r-tr', p.radius);
        p.radiusBL = getFieldRawValue('ob-r-bl', p.radius);
        p.radiusBR = getFieldRawValue('ob-r-br', p.radius);

        p.inner.enabled = Boolean(document.getElementById('ob-inner-enabled')?.checked);
        p.inner.style = document.getElementById('ob-inner-style')?.value || 'solid';
        p.inner.gradient = Boolean(document.getElementById('ob-inner-grad')?.checked);
        p.inner.thickness = getFieldRawValue('ob-inner-thickness', 12);
        p.inner.gap = getFieldRawValue('ob-inner-gap', 0);
        p.inner.angle = getFieldRawValue('ob-inner-angle', 180);
        p.inner.color1 = getFieldRawValue('ob-inner-c1', '#FFFFFFFF');
        p.inner.color2 = getFieldRawValue('ob-inner-c2', '#999999FF');

        p.outer.enabled = Boolean(document.getElementById('ob-outer-enabled')?.checked);
        p.outer.style = document.getElementById('ob-outer-style')?.value || 'solid';
        p.outer.gradient = Boolean(document.getElementById('ob-outer-grad')?.checked);
        p.outer.thickness = getFieldRawValue('ob-outer-thickness', 2);
        p.outer.gap = getFieldRawValue('ob-outer-gap', 0);
        p.outer.angle = getFieldRawValue('ob-outer-angle', 180);
        p.outer.color1 = getFieldRawValue('ob-outer-c1', '#99A443FF');
        p.outer.color2 = getFieldRawValue('ob-outer-c2', '#026E54FF');

        p.glow.enabled = Boolean(document.getElementById('ob-glow-enabled')?.checked);
        p.glow.color = getFieldRawValue('ob-glow-color', '#38BDF8FF');
        p.glow.blur = getFieldRawValue('ob-glow-blur', 16);
        p.glow.neon = Boolean(document.getElementById('ob-glow-neon')?.checked);
        p.glow.inner = Boolean(document.getElementById('ob-glow-inner')?.checked);

        if (!p.shadow || typeof p.shadow !== 'object') p.shadow = {};
        p.shadow.enabled = Boolean(document.getElementById('ob-shadow-enabled')?.checked);
        p.shadow.mode = document.getElementById('ob-shadow-mode')?.value || 'soft';
        p.shadow.color = getFieldRawValue('ob-shadow-color', '#000000B3');
        p.shadow.offsetX = getFieldRawValue('ob-shadow-x', 10);
        p.shadow.offsetY = getFieldRawValue('ob-shadow-y', 14);
        p.shadow.blur = getFieldRawValue('ob-shadow-blur', 24);
        p.shadow.spread = getFieldRawValue('ob-shadow-spread', 0);
        p.shadow.multiply = Boolean(document.getElementById('ob-shadow-multiply')?.checked ?? true);

        p.animation.type = document.getElementById('ob-anim-type')?.value || 'none';
        p.animation.speed = getFieldRawValue('ob-anim-speed', 4);
        p.animation.size = getFieldRawValue('ob-anim-size', 35);
        p.animation.color2 = getFieldRawValue('ob-anim-c2', '#FFFFFFFF');

        if (!p.background || typeof p.background !== 'object') p.background = {};
        p.background.mode = document.getElementById('ob-bg-mode')?.value || 'none';
        p.background.standby = Boolean(document.getElementById('ob-bg-standby')?.checked);
        p.background.color1 = getFieldRawValue('ob-bg-c1', '#16202FFF');
        p.background.color2 = getFieldRawValue('ob-bg-c2', '#0B101BFF');
        p.background.angle = Number(document.getElementById('ob-bg-angle')?.value ?? 135);
        p.background.iconColor = getFieldRawValue('ob-bg-icon-color', '#64748BFF');
        p.background.staticNoise = Number(document.getElementById('ob-bg-static-noise')?.value ?? 75);
        p.background.staticScale = Number(document.getElementById('ob-bg-static-scale')?.value ?? 3);
        p.background.staticSpeed = Number(document.getElementById('ob-bg-static-speed')?.value ?? 16);
        p.background.staticGlitch = Number(document.getElementById('ob-bg-static-glitch')?.value ?? 35);
        p.background.staticColor = Boolean(document.getElementById('ob-bg-static-color')?.checked);

        updatePadFieldVisibility(p.placement, p.autoPad);
        updateBgFieldVisibility(p.background.mode);
        updateBorderDesignerVisibility(p);
        updateDirtyIndicators();
        schedulePreviewDraw();
    }

    function initVariableBinderOnce() {
        if (varBinderMounted || !window.WizardVariableBinder) return;
        varBinderMounted = true;
        const bindings = [
            { id: 'ob-extra-pad', kind: 'number', label: 'Extra Bleed Margin', defaultFallback: '0' },
            { id: 'ob-pad', kind: 'number', label: 'Outer Bleed Padding', defaultFallback: '48' },
            { id: 'ob-radius', kind: 'number', label: 'Corner Radius', defaultFallback: '20' },
            { id: 'ob-r-tl', kind: 'number', label: 'Top-Left Radius', defaultFallback: '13' },
            { id: 'ob-r-tr', kind: 'number', label: 'Top-Right Radius', defaultFallback: '13' },
            { id: 'ob-r-bl', kind: 'number', label: 'Bottom-Left Radius', defaultFallback: '68' },
            { id: 'ob-r-br', kind: 'number', label: 'Bottom-Right Radius', defaultFallback: '87' },
            { id: 'ob-inner-thickness', kind: 'number', label: 'Primary Border Width', defaultFallback: '12' },
            { id: 'ob-inner-angle', kind: 'number', label: 'Primary Gradient Angle', defaultFallback: '180' },
            { id: 'ob-inner-gap', kind: 'number', label: 'Inner Gap', defaultFallback: '0' },
            { id: 'ob-inner-c1', kind: 'color', label: 'Primary Color 1', pairColorId: 'ob-inner-c1-pick', defaultFallback: '#FFFFFFFF' },
            { id: 'ob-inner-c2', kind: 'color', label: 'Primary Color 2', pairColorId: 'ob-inner-c2-pick', defaultFallback: '#999999FF' },
            { id: 'ob-outer-thickness', kind: 'number', label: 'Outer Ring Width', defaultFallback: '2' },
            { id: 'ob-outer-angle', kind: 'number', label: 'Outer Gradient Angle', defaultFallback: '180' },
            { id: 'ob-outer-gap', kind: 'number', label: 'Outer Ring Gap', defaultFallback: '0' },
            { id: 'ob-outer-c1', kind: 'color', label: 'Outer Ring Color 1', pairColorId: 'ob-outer-c1-pick', defaultFallback: '#99A443FF' },
            { id: 'ob-outer-c2', kind: 'color', label: 'Outer Ring Color 2', pairColorId: 'ob-outer-c2-pick', defaultFallback: '#026E54FF' },
            { id: 'ob-glow-color', kind: 'color', label: 'Glow Color', pairColorId: 'ob-glow-color-pick', defaultFallback: '#38BDF8FF' },
            { id: 'ob-glow-blur', kind: 'number', label: 'Glow Blur', defaultFallback: '16' },
            { id: 'ob-shadow-color', kind: 'color', label: 'Drop Shadow Color', pairColorId: 'ob-shadow-color-pick', defaultFallback: '#000000B3' },
            { id: 'ob-shadow-x', kind: 'number', label: 'Shadow Offset X', defaultFallback: '10' },
            { id: 'ob-shadow-y', kind: 'number', label: 'Shadow Offset Y', defaultFallback: '14' },
            { id: 'ob-shadow-blur', kind: 'number', label: 'Shadow Blur', defaultFallback: '24' },
            { id: 'ob-shadow-spread', kind: 'number', label: 'Shadow Spread', defaultFallback: '0' },
            { id: 'ob-anim-speed', kind: 'number', label: 'Animation Speed', defaultFallback: '4' },
            { id: 'ob-anim-c2', kind: 'color', label: 'Beam Color', pairColorId: 'ob-anim-c2-pick', defaultFallback: '#FFFFFFFF' },
            { id: 'ob-anim-size', kind: 'number', label: 'Beam Arc', defaultFallback: '35' },
            { id: 'ob-bg-c1', kind: 'color', label: 'Background Color 1', pairColorId: 'ob-bg-c1-pick', defaultFallback: '#16202FFF' },
            { id: 'ob-bg-c2', kind: 'color', label: 'Background Color 2', pairColorId: 'ob-bg-c2-pick', defaultFallback: '#0B101BFF' },
            { id: 'ob-bg-icon-color', kind: 'color', label: 'Placeholder Person Color', pairColorId: 'ob-bg-icon-color-pick', defaultFallback: '#64748BFF' }
        ];
        window.WizardVariableBinder.mount({
            storageKey: 'streampulse:obs-borders:vars',
            bindings,
            onChange: () => {
                syncWorkingProfileFromDom();
            }
        });
    }

    function populateFormFromProfile() {
        if (!workingProfile) return;
        isPopulating = true;
        const p = workingProfile;
        const placement = normalizePlacement(p.placement);
        p.placement = placement;

        setControlValue('ob-name', p.name, 'Border Profile');
        setControlValue('ob-id', p.id, 'profile');
        setSegPressed('ob-placement-seg', 'data-placement', placement);
        const hintEl = document.getElementById('ob-placement-hint');
        if (hintEl) hintEl.textContent = PLACEMENT_HINTS[placement] || '';

        const autoPadOn = p.autoPad !== false;
        const autoScaleOn = p.autoScale !== false;
        setControlValue('ob-auto-pad', autoPadOn, true);
        setControlValue('ob-auto-scale', autoScaleOn, true);
        setControlValue('ob-extra-pad', p.extraPad ?? 0, 0);
        setControlValue('ob-pad', p.pad, 48);
        setControlValue('ob-seam', p.seamOverlap, 1);
        updatePadFieldVisibility(placement, autoPadOn);
        setControlValue('ob-base-w', p.baseWidth, 1920);
        setControlValue('ob-base-h', p.baseHeight, 1080);
        setControlValue('ob-per-corner', p.perCornerRadius, false);
        setControlValue('ob-radius', p.radius, 20);
        setControlValue('ob-r-tl', p.radiusTL, p.radius ?? 20);
        setControlValue('ob-r-tr', p.radiusTR, p.radius ?? 20);
        setControlValue('ob-r-br', p.radiusBR, p.radius ?? 20);
        setControlValue('ob-r-bl', p.radiusBL, p.radius ?? 20);

        document.getElementById('ob-radius-uniform-wrap').hidden = Boolean(p.perCornerRadius);
        document.getElementById('ob-radius-percorner-wrap').hidden = !p.perCornerRadius;

        setControlValue('ob-inner-enabled', p.inner?.enabled, true);
        setControlValue('ob-inner-style', normalizeStyleAlias(p.inner?.style), 'solid');
        setControlValue('ob-inner-grad', Boolean(p.inner?.gradient), false);
        setControlValue('ob-inner-thickness', p.inner?.thickness, 12);
        setControlValue('ob-inner-gap', p.inner?.gap, 0);
        setControlValue('ob-inner-angle', p.inner?.angle, 180);
        setControlValue('ob-inner-c1', p.inner?.color1, '#FFFFFFFF', { isColor: true });
        setControlValue('ob-inner-c2', p.inner?.color2, '#999999FF', { isColor: true });
        syncColorPicker('ob-inner-c1', 'ob-inner-c1-pick');
        syncColorPicker('ob-inner-c2', 'ob-inner-c2-pick');

        setControlValue('ob-outer-enabled', p.outer?.enabled, false);
        setControlValue('ob-outer-style', normalizeStyleAlias(p.outer?.style), 'solid');
        setControlValue('ob-outer-grad', Boolean(p.outer?.gradient), false);
        setControlValue('ob-outer-thickness', p.outer?.thickness, 2);
        setControlValue('ob-outer-gap', p.outer?.gap, 0);
        setControlValue('ob-outer-angle', p.outer?.angle, 180);
        setControlValue('ob-outer-c1', p.outer?.color1, '#99A443FF', { isColor: true });
        setControlValue('ob-outer-c2', p.outer?.color2, '#026E54FF', { isColor: true });
        syncColorPicker('ob-outer-c1', 'ob-outer-c1-pick');
        syncColorPicker('ob-outer-c2', 'ob-outer-c2-pick');

        setControlValue('ob-glow-enabled', p.glow?.enabled, false);
        setControlValue('ob-glow-color', p.glow?.color, '#38BDF8FF', { isColor: true });
        syncColorPicker('ob-glow-color', 'ob-glow-color-pick');
        setControlValue('ob-glow-blur', p.glow?.blur ?? 16, 16);
        setControlValue('ob-glow-neon', Boolean(p.glow?.neon), false);
        setControlValue('ob-glow-inner', Boolean(p.glow?.inner), false);

        const sh = p.shadow || {};
        setControlValue('ob-shadow-enabled', Boolean(sh.enabled), false);
        setControlValue('ob-shadow-mode', SHADOW_MODE_MAP[sh.mode] !== undefined ? sh.mode : 'soft', 'soft');
        setControlValue('ob-shadow-color', sh.color, '#000000B3', { isColor: true });
        syncColorPicker('ob-shadow-color', 'ob-shadow-color-pick');
        setControlValue('ob-shadow-x', sh.offsetX ?? 10, 10);
        setControlValue('ob-shadow-y', sh.offsetY ?? 14, 14);
        setControlValue('ob-shadow-blur', sh.blur ?? 24, 24);
        setControlValue('ob-shadow-spread', sh.spread ?? 0, 0);
        setControlValue('ob-shadow-multiply', sh.multiply !== undefined ? Boolean(sh.multiply) : true, true);

        setControlValue('ob-anim-type', normalizeAnimAlias(p.animation?.type || 'none'), 'none');
        setControlValue('ob-anim-speed', p.animation?.speed ?? 4, 4);
        setControlValue('ob-anim-c2', p.animation?.color2, '#FFFFFFFF', { isColor: true });
        syncColorPicker('ob-anim-c2', 'ob-anim-c2-pick');
        setControlValue('ob-anim-size', p.animation?.size ?? 35, 35);
        setSegPressed('ob-anim-dir-seg', 'data-dir', p.animation?.direction || 'cw');

        const bg = p.background || {};
        const bgMode = bg.mode || 'none';
        setControlValue('ob-bg-mode', bgMode, 'none');
        setControlValue('ob-bg-standby', Boolean(bg.standby), false);
        setControlValue('ob-bg-c1', bg.color1 || '#16202FFF', '#16202FFF', { isColor: true });
        setControlValue('ob-bg-c2', bg.color2 || '#0B101BFF', '#0B101BFF', { isColor: true });
        syncColorPicker('ob-bg-c1', 'ob-bg-c1-pick');
        syncColorPicker('ob-bg-c2', 'ob-bg-c2-pick');
        setControlValue('ob-bg-angle', bg.angle ?? 135, 135);
        setControlValue('ob-bg-icon-color', bg.iconColor || '#64748BFF', '#64748BFF', { isColor: true });
        syncColorPicker('ob-bg-icon-color', 'ob-bg-icon-color-pick');
        setControlValue('ob-bg-static-noise', bg.staticNoise ?? 75, 75);
        setControlValue('ob-bg-static-scale', bg.staticScale ?? 3, 3);
        setControlValue('ob-bg-static-speed', bg.staticSpeed ?? 16, 16);
        setControlValue('ob-bg-static-glitch', bg.staticGlitch ?? 35, 35);
        setControlValue('ob-bg-static-color', Boolean(bg.staticColor), false);
        updateBgFieldVisibility(bgMode);
        updateBorderDesignerVisibility(p);

        if (window.WizardVariableBinder) {
            window.WizardVariableBinder.refreshAllBoundControlsUI();
        }
        isPopulating = false;
        updateDirtyIndicators();
        schedulePreviewDraw();
    }

    function renderProfileSelector() {
        const sel = document.getElementById('ob-profile-select');
        if (!sel || !studioState) return;
        sel.innerHTML = '';
        for (const prof of studioState.profiles) {
            const opt = document.createElement('option');
            opt.value = prof.id;
            opt.textContent = prof.id === studioState.activeProfileId
                ? `${prof.name} (Default)`
                : prof.name;
            sel.appendChild(opt);
        }
        sel.value = selectedProfileId;
        const activeProf = studioState.profiles.find(p => p.id === studioState.activeProfileId);
        const pill = document.getElementById('ob-active-pill');
        if (pill) pill.textContent = `Default: ${activeProf ? activeProf.name : '—'}`;
    }

    function buildProfileOptions(sel, { includeInherit = false, includeOff = true } = {}) {
        sel.innerHTML = '';
        if (includeInherit) {
            const o = document.createElement('option');
            o.value = 'inherit';
            o.textContent = 'Inherit Source Default';
            sel.appendChild(o);
        }
        if (includeOff) {
            const o = document.createElement('option');
            o.value = 'none';
            o.textContent = 'Off (No Border)';
            sel.appendChild(o);
        }
        for (const p of (studioState?.profiles || [])) {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;
            sel.appendChild(o);
        }
    }

    async function saveAssignment(sourceName, sceneName, profileId) {
        try {
            const res = await fetch('/api/obs-borders/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceName, sceneName, profileId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save assignment');
            studioState = data.state;
            if (obsConnected && profileId && profileId !== 'none' && profileId !== 'inherit') {
                obsFilterStatuses[sourceName] = {
                    ...(obsFilterStatuses[sourceName] || {}),
                    hasStreamPulseBorder: true,
                    filterEnabled: true
                };
            }
            showToast(sceneName
                ? `Updated "${sourceName}" on scene "${sceneName}"`
                : `Assigned "${sourceName}"`);
            renderSourceList();
        } catch (err) {
            showToast(err.message || 'Assignment failed');
        }
    }

    const ICON_CAM = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
    const ICON_BROWSER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    const ICON_SCENE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
    const ICON_MEDIA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 8l7 4-7 4V8z"/></svg>';

    function classifyTargetKind(name) {
        const scenes = studioState?.knownScenes || [];
        const kind = String(studioState?.sourceKinds?.[name] || '');
        if (scenes.includes(name) || kind === 'scene') return 'scenes';
        if (/avcapture|video|camera|dshow|v4l2|screen|window|display|game_capture|syphon/i.test(kind)) return 'video';
        if (/browser/i.test(kind)) return 'browser';
        return 'media';
    }

    function iconForKind(kind) {
        if (kind === 'scenes') return ICON_SCENE;
        if (kind === 'video') return ICON_CAM;
        if (kind === 'browser') return ICON_BROWSER;
        return ICON_MEDIA;
    }

    function swatchColorForProfile(profileId) {
        if (!profileId || profileId === 'none') return 'transparent';
        const prof = (studioState?.resolvedProfiles || studioState?.profiles || []).find(p => p.id === profileId);
        if (!prof) return '#58a6ff';
        const layer = prof.inner?.enabled ? prof.inner : prof.outer;
        return resolveColor(layer?.color1, '#58a6ff');
    }

    function buildSourceRow(name, cfg, scenesForSource, fStatus) {
        const kind = classifyTargetKind(name);
        const overrideKeys = Object.keys(cfg.sceneOverrides || {});
        const hasAnyBorder = Boolean(fStatus?.hasStreamPulseBorder || (cfg.defaultProfileId && cfg.defaultProfileId !== 'none') || overrideKeys.length > 0);
        const drawerKey = `src:${name}`;
        const isOpen = expandedDrawers.has(drawerKey);

        const row = document.createElement('div');
        row.className = 'ob-row';

        const main = document.createElement('div');
        main.className = 'ob-row-main';

        const info = document.createElement('div');
        info.className = 'ob-row-info';

        const ico = document.createElement('span');
        ico.className = `ob-src-icon${hasAnyBorder ? ' is-active' : ''}`;
        ico.innerHTML = iconForKind(kind);
        info.appendChild(ico);

        const title = document.createElement('strong');
        title.style.fontSize = '0.88rem';
        title.textContent = name;
        info.appendChild(title);

        if (kind === 'scenes') {
            const scPill = document.createElement('span');
            scPill.className = 'ob-pill';
            scPill.textContent = name === currentProgramScene ? 'Live Scene' : 'Scene';
            if (name === currentProgramScene) scPill.classList.add('live-scene');
            info.appendChild(scPill);
        }

        if (fStatus) {
            const badge = document.createElement('span');
            badge.className = 'ob-pill';
            if (fStatus.hasStreamPulseBorder && fStatus.filterEnabled) {
                badge.textContent = 'OBS Active';
                badge.style.color = '#3fb950';
                badge.style.borderColor = 'rgba(63,185,80,0.4)';
            } else if (fStatus.hasStreamPulseBorder) {
                badge.textContent = 'OBS Disabled';
            } else if (fStatus.hasLegacyShader) {
                badge.textContent = 'Legacy Shader';
                badge.style.color = '#d29922';
            }
            if (badge.textContent) info.appendChild(badge);
        }

        const baseScenes = scenesForSource.length ? scenesForSource : (studioState.knownScenes || []);
        const sceneCandidates = [...new Set([...baseScenes, ...overrideKeys])];
        let drawerBtn = null;
        if (sceneCandidates.length > 0) {
            drawerBtn = document.createElement('button');
            drawerBtn.type = 'button';
            drawerBtn.className = `ob-scenes-toggle${overrideKeys.length ? ' has-overrides' : ''}`;
            drawerBtn.textContent = overrideKeys.length
                ? `${overrideKeys.length} scene override${overrideKeys.length === 1 ? '' : 's'} ${isOpen ? '▴' : '▾'}`
                : `${sceneCandidates.length} scene${sceneCandidates.length === 1 ? '' : 's'} ${isOpen ? '▴' : '▾'}`;
            drawerBtn.addEventListener('click', () => {
                if (expandedDrawers.has(drawerKey)) expandedDrawers.delete(drawerKey);
                else expandedDrawers.add(drawerKey);
                renderSourceList();
            });
            info.appendChild(drawerBtn);
        }

        const controls = document.createElement('div');
        controls.className = 'ob-source-controls';

        const swatch = document.createElement('span');
        swatch.className = 'ob-swatch';
        const swCol = swatchColorForProfile(cfg.defaultProfileId);
        swatch.style.borderColor = swCol === 'transparent' ? 'var(--border)' : swCol;
        controls.appendChild(swatch);

        const sel = document.createElement('select');
        buildProfileOptions(sel, { includeInherit: false, includeOff: true });
        sel.value = cfg.defaultProfileId || 'none';
        sel.addEventListener('change', () => saveAssignment(name, '', sel.value));
        controls.appendChild(sel);

        if (cfg.defaultProfileId && cfg.defaultProfileId !== 'none') {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-sm';
            editBtn.textContent = 'Edit';
            editBtn.title = 'Open assigned Border Profile in Designer';
            editBtn.addEventListener('click', () => {
                const prof = studioState.profiles.find(p => p.id === cfg.defaultProfileId);
                if (prof) {
                    selectedProfileId = prof.id;
                    workingProfile = cloneProfile(prof);
                    renderProfileSelector();
                    populateFormFromProfile();
                    switchTab('designer');
                }
            });
            controls.appendChild(editBtn);
        }

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = `btn btn-sm${fStatus?.hasStreamPulseBorder ? '' : ' primary'}`;
        applyBtn.textContent = fStatus?.hasStreamPulseBorder ? 'Sync Filter' : 'Apply Filter';
        applyBtn.disabled = !obsConnected;
        applyBtn.addEventListener('click', () => applyFiltersInObs([name], 'apply'));
        controls.appendChild(applyBtn);

        if (fStatus?.hasStreamPulseBorder) {
            const remBtn = document.createElement('button');
            remBtn.type = 'button';
            remBtn.className = 'btn btn-sm';
            remBtn.textContent = 'Remove';
            remBtn.disabled = !obsConnected;
            remBtn.addEventListener('click', () => applyFiltersInObs([name], 'remove'));
            controls.appendChild(remBtn);
        }

        main.appendChild(info);
        main.appendChild(controls);
        row.appendChild(main);

        if (isOpen && sceneCandidates.length > 0) {
            const drawer = document.createElement('div');
            drawer.className = 'ob-drawer';
            const dHead = document.createElement('div');
            dHead.className = 'ob-drawer-head';
            dHead.style.display = 'flex';
            dHead.style.alignItems = 'center';
            dHead.style.justifyContent = 'space-between';
            const dTitle = document.createElement('span');
            dTitle.textContent = `Per-Scene Border Overrides for "${name}"`;
            dHead.appendChild(dTitle);
            if (overrideKeys.length > 0) {
                const clrBtn = document.createElement('button');
                clrBtn.type = 'button';
                clrBtn.className = 'ob-scenes-toggle';
                clrBtn.textContent = 'Clear Overrides';
                clrBtn.addEventListener('click', () => saveAssignment(name, '__all__', 'inherit'));
                dHead.appendChild(clrBtn);
            }
            drawer.appendChild(dHead);

            const scGrid = document.createElement('div');
            scGrid.className = 'ob-source-scenes';
            for (const scName of sceneCandidates) {
                const item = document.createElement('div');
                item.className = 'ob-scene-override-item';

                const scLabel = document.createElement('span');
                scLabel.className = 'ob-scene-override-name';
                const txt = document.createElement('span');
                txt.textContent = scName;
                scLabel.appendChild(txt);
                if (scName === currentProgramScene) {
                    const livePill = document.createElement('span');
                    livePill.className = 'ob-pill live-scene';
                    livePill.textContent = 'Live';
                    scLabel.appendChild(livePill);
                } else if (scenesForSource.length > 0 && !scenesForSource.includes(scName)) {
                    const stalePill = document.createElement('span');
                    stalePill.className = 'ob-pill';
                    stalePill.textContent = 'Not in Scene';
                    scLabel.appendChild(stalePill);
                }

                const scSel = document.createElement('select');
                buildProfileOptions(scSel, { includeInherit: true, includeOff: true });
                scSel.value = cfg.sceneOverrides?.[scName] || 'inherit';
                scSel.addEventListener('change', () => saveAssignment(name, scName, scSel.value));

                item.appendChild(scLabel);
                item.appendChild(scSel);
                scGrid.appendChild(item);
            }
            drawer.appendChild(scGrid);
            row.appendChild(drawer);
        }

        return row;
    }

    function renderGroupSection(titleText, countText, bodyNodes, { groupKey = '' } = {}) {
        const key = groupKey || `grp:${titleText}`;
        const sect = document.createElement('section');
        sect.className = 'sect';
        sect.style.marginBottom = '0';

        const head = document.createElement('div');
        head.className = 'sect-head';
        head.style.cursor = 'pointer';

        const isCollapsed = collapsedGroups.has(key);
        const titleSpan = document.createElement('span');
        titleSpan.className = 'sect-title';
        titleSpan.textContent = `${isCollapsed ? '▸' : '▾'} ${titleText}`;

        const rightSpan = document.createElement('span');
        rightSpan.className = 'ob-pill';
        rightSpan.textContent = countText;

        head.appendChild(titleSpan);
        head.appendChild(rightSpan);

        const body = document.createElement('div');
        body.hidden = isCollapsed;
        for (const n of bodyNodes) body.appendChild(n);

        head.addEventListener('click', () => {
            const nextCollapsed = !body.hidden;
            body.hidden = nextCollapsed;
            if (nextCollapsed) collapsedGroups.add(key);
            else collapsedGroups.delete(key);
            titleSpan.textContent = `${nextCollapsed ? '▸' : '▾'} ${titleText}`;
        });

        sect.appendChild(head);
        sect.appendChild(body);
        return sect;
    }

    function expandAllGroups() {
        collapsedGroups.clear();
        const assignments = studioState?.assignments || {};
        const names = [...new Set([...(studioState?.knownSources || []), ...(studioState?.knownScenes || []), ...Object.keys(assignments)])];
        for (const name of names) {
            expandedDrawers.add(`src:${name}`);
        }
        renderSourceList();
    }

    function collapseAllGroups() {
        expandedDrawers.clear();
        collapsedGroups.add('grp:active');
        collapsedGroups.add('grp:video');
        collapsedGroups.add('grp:other');
        collapsedGroups.add('grp:scenes');
        for (const sc of (studioState?.knownScenes || [])) {
            collapsedGroups.add(`scene:${sc}`);
        }
        renderSourceList();
    }

    function renderSceneCentricList(host, query) {
        const scenes = [...(studioState.knownScenes || [])]
            .filter(sc => !query || sc.toLowerCase().includes(query) || (obsByScene[sc] || []).some(it => String(it.sourceName || '').toLowerCase().includes(query)))
            .sort((a, b) => {
                if (a === currentProgramScene) return -1;
                if (b === currentProgramScene) return 1;
                return a.localeCompare(b);
            });

        if (!scenes.length) {
            host.innerHTML = '<div class="hint">No OBS scenes match this search filter.</div>';
            return;
        }

        host.innerHTML = '';
        const assignments = studioState.assignments || {};

        for (const scName of scenes) {
            const items = (obsByScene[scName] || []).filter(it => {
                const k = String(it?.inputKind || '');
                return !(/audio|wasapi|coreaudio|pulseaudio|alsa/i.test(k));
            });

            const rows = [];
            if (!items.length) {
                const empty = document.createElement('div');
                empty.className = 'ob-row hint';
                empty.textContent = 'No visual video sources in this scene.';
                rows.push(empty);
            } else {
                for (const item of items) {
                    const srcName = item.sourceName;
                    const cfg = assignments[srcName] || { defaultProfileId: 'none', sceneOverrides: {} };
                    const fStatus = obsFilterStatuses[srcName];
                    const row = document.createElement('div');
                    row.className = 'ob-row';

                    const main = document.createElement('div');
                    main.className = 'ob-row-main';

                    const info = document.createElement('div');
                    info.className = 'ob-row-info';

                    const ico = document.createElement('span');
                    ico.className = `ob-src-icon${fStatus?.hasStreamPulseBorder ? ' is-active' : ''}`;
                    ico.innerHTML = iconForKind(classifyTargetKind(srcName));
                    info.appendChild(ico);

                    const title = document.createElement('strong');
                    title.style.fontSize = '0.86rem';
                    title.textContent = srcName;
                    info.appendChild(title);

                    const defLabel = document.createElement('span');
                    defLabel.className = 'hint';
                    const defProf = studioState.profiles.find(p => p.id === cfg.defaultProfileId);
                    defLabel.textContent = `Default: ${defProf ? defProf.name : 'Off'}`;
                    info.appendChild(defLabel);

                    if (fStatus?.hasStreamPulseBorder) {
                        const b = document.createElement('span');
                        b.className = 'ob-pill';
                        b.textContent = 'OBS Active';
                        b.style.color = '#3fb950';
                        b.style.borderColor = 'rgba(63,185,80,0.4)';
                        info.appendChild(b);
                    }

                    const controls = document.createElement('div');
                    controls.className = 'ob-source-controls';

                    const effId = cfg.sceneOverrides?.[scName] && cfg.sceneOverrides[scName] !== 'inherit'
                        ? cfg.sceneOverrides[scName]
                        : cfg.defaultProfileId;
                    const swatch = document.createElement('span');
                    swatch.className = 'ob-swatch';
                    const swCol = swatchColorForProfile(effId);
                    swatch.style.borderColor = swCol === 'transparent' ? 'var(--border)' : swCol;
                    controls.appendChild(swatch);

                    const scSel = document.createElement('select');
                    buildProfileOptions(scSel, { includeInherit: true, includeOff: true });
                    scSel.value = cfg.sceneOverrides?.[scName] || 'inherit';
                    scSel.addEventListener('change', () => saveAssignment(srcName, scName, scSel.value));
                    controls.appendChild(scSel);

                    const applyBtn = document.createElement('button');
                    applyBtn.type = 'button';
                    applyBtn.className = `btn btn-sm${fStatus?.hasStreamPulseBorder ? '' : ' primary'}`;
                    applyBtn.textContent = fStatus?.hasStreamPulseBorder ? 'Sync Filter' : 'Apply Filter';
                    applyBtn.disabled = !obsConnected;
                    applyBtn.addEventListener('click', () => applyFiltersInObs([srcName], 'apply'));
                    controls.appendChild(applyBtn);

                    main.appendChild(info);
                    main.appendChild(controls);
                    row.appendChild(main);
                    rows.push(row);
                }
            }

            const titleBadge = scName === currentProgramScene ? `${scName} (LIVE IN OBS)` : scName;
            const sect = renderGroupSection(titleBadge, `${items.length} visual source${items.length === 1 ? '' : 's'}`, rows, { groupKey: `scene:${scName}` });
            if (scName === currentProgramScene) {
                sect.style.borderColor = 'rgba(63,185,80,0.45)';
            }
            host.appendChild(sect);
        }
    }

    function updateFilterChipCounts(allNames) {
        const assignments = studioState?.assignments || {};
        const scenes = studioState?.knownScenes || [];
        let activeCount = 0;
        let videoCount = 0;
        let otherCount = 0;
        let sceneCount = 0;

        for (const name of allNames) {
            const fStatus = obsFilterStatuses[name];
            const cfg = assignments[name] || {};
            const isActive = Boolean(fStatus?.hasStreamPulseBorder || (cfg.defaultProfileId && cfg.defaultProfileId !== 'none') || Object.keys(cfg.sceneOverrides || {}).length > 0);
            if (isActive) activeCount++;
            const k = classifyTargetKind(name);
            if (k === 'scenes' || scenes.includes(name)) sceneCount++;
            else if (k === 'video') videoCount++;
            else otherCount++;
        }

        const counts = {
            all: allNames.length,
            active: activeCount,
            video: videoCount,
            other: otherCount,
            scenes: sceneCount
        };
        document.querySelectorAll('#ob-source-filter-chips .ob-chip').forEach(chip => {
            const key = chip.dataset.filter;
            const baseLabel = {
                all: 'All',
                active: 'Active / Assigned',
                video: 'Cameras & Video',
                other: 'Browser & Media',
                scenes: 'Scenes'
            }[key] || key;
            chip.textContent = `${baseLabel} (${counts[key] ?? 0})`;
            chip.classList.toggle('active', key === sourceFilter);
        });
    }

    function renderSourceList() {
        const host = document.getElementById('ob-source-list');
        if (!host || !studioState) return;

        setSegPressed('ob-view-seg', 'data-view', sourceViewMode);

        const filter = (document.getElementById('ob-source-search')?.value || '').trim().toLowerCase();
        const assignments = studioState.assignments || {};
        const sourceSceneMap = studioState.sourceSceneMap || {};

        if (sourceViewMode === 'scenes') {
            document.getElementById('ob-source-filter-chips').hidden = true;
            renderSceneCentricList(host, filter);
            return;
        }
        document.getElementById('ob-source-filter-chips').hidden = false;

        // Deduplicated set: all visual sources + assigned targets + scenes (in their own group)
        const allNames = [...new Set([
            ...(studioState.knownSources || []),
            ...(studioState.knownScenes || []),
            ...Object.keys(assignments)
        ])].sort((a, b) => a.localeCompare(b));

        updateFilterChipCounts(allNames);

        if (!allNames.length) {
            host.innerHTML = obsConnected
                ? '<div class="hint">No OBS sources found. Click <strong>Sync Live OBS</strong> above.</div>'
                : '<div class="hint">OBS WebSocket is not connected yet. Start OBS Studio, ensure WebSocket is enabled under <a href="/config-editor.html#connection" style="color:var(--accent);">System Config</a>, then click <strong>Sync Live OBS</strong>.</div>';
            return;
        }

        const groups = {
            active: [],
            video: [],
            other: [],
            scenes: []
        };

        for (const name of allNames) {
            if (filter && !name.toLowerCase().includes(filter)) continue;
            const cfg = assignments[name] || { defaultProfileId: 'none', sceneOverrides: {} };
            const fStatus = obsFilterStatuses[name];
            const isAssignedOrActive = Boolean(fStatus?.hasStreamPulseBorder || (cfg.defaultProfileId && cfg.defaultProfileId !== 'none') || Object.keys(cfg.sceneOverrides || {}).length > 0);
            const kind = classifyTargetKind(name);

            if (sourceFilter === 'active' && !isAssignedOrActive) continue;
            if (sourceFilter === 'video' && kind !== 'video') continue;
            if (sourceFilter === 'other' && (kind === 'video' || kind === 'scenes')) continue;
            if (sourceFilter === 'scenes' && kind !== 'scenes') continue;

            const row = buildSourceRow(name, cfg, sourceSceneMap[name] || [], fStatus);
            if (isAssignedOrActive && sourceFilter === 'all') {
                groups.active.push(row);
            } else if (kind === 'scenes') {
                groups.scenes.push(row);
            } else if (kind === 'video') {
                groups.video.push(row);
            } else {
                groups.other.push(row);
            }
        }

        host.innerHTML = '';
        if (groups.active.length) {
            host.appendChild(renderGroupSection('Active & Assigned Borders', `${groups.active.length}`, groups.active, { groupKey: 'grp:active' }));
        }
        if (groups.video.length) {
            host.appendChild(renderGroupSection('Cameras & Video Capture', `${groups.video.length}`, groups.video, { groupKey: 'grp:video' }));
        }
        if (groups.other.length) {
            host.appendChild(renderGroupSection('Browser, Media & Other Sources', `${groups.other.length}`, groups.other, { groupKey: 'grp:other' }));
        }
        if (groups.scenes.length) {
            host.appendChild(renderGroupSection('OBS Scenes & Nested Bundles', `${groups.scenes.length}`, groups.scenes, { groupKey: 'grp:scenes' }));
        }

        if (!host.children.length) {
            host.innerHTML = '<div class="hint">No OBS sources or scenes match the active filter.</div>';
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
    // WebGL 1:1 SDF Shader Preview (Pixel-Exact Match to OBS Filter Shader)
    // ------------------------------------------------------------------------
    const VERT_GLSL = `
        attribute vec2 a_pos;
        varying vec2 v_uv;
        void main() {
            v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }
    `;

    const FRAG_GLSL = `
        precision highp float;
        varying vec2 v_uv;
        uniform sampler2D u_tex;

        uniform vec2 base_size;
        uniform vec2 total_size;
        uniform vec2 pad_xy;
        uniform vec4 radii;
        uniform float seam_overlap;
        uniform float placement_code;

        uniform float inner_enabled;
        uniform float inner_style;
        uniform float inner_grad;
        uniform float inner_thickness;
        uniform float inner_gap;
        uniform vec4 inner_color1;
        uniform vec4 inner_color2;
        uniform float inner_angle_rad;

        uniform float outer_enabled;
        uniform float outer_style;
        uniform float outer_grad;
        uniform float outer_thickness;
        uniform float outer_gap;
        uniform vec4 outer_color1;
        uniform vec4 outer_color2;
        uniform float outer_angle_rad;

        uniform float glow_enabled;
        uniform vec4 glow_color;
        uniform float glow_blur;
        uniform float glow_neon;
        uniform float glow_inner;

        uniform float shadow_enabled;
        uniform float shadow_mode;
        uniform vec4 shadow_color;
        uniform vec2 shadow_offset;
        uniform float shadow_blur;
        uniform float shadow_spread;
        uniform float shadow_multiply;

        uniform float anim_type;
        uniform float anim_time;
        uniform float anim_speed;
        uniform float anim_size;
        uniform float anim_dir;
        uniform vec4 anim_color2;

        uniform float bg_mode;
        uniform float bg_standby;
        uniform vec4 bg_color1;
        uniform vec4 bg_color2;
        uniform float bg_angle_rad;
        uniform vec4 bg_icon_color;
        uniform float bg_static_noise;
        uniform float bg_static_scale;
        uniform float bg_static_speed;
        uniform float bg_static_color;
        uniform float bg_static_glitch;

        uniform float show_guides;

        float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
            vec2 r_sel = (p.x > 0.0) ? vec2(r.y, r.z) : vec2(r.x, r.w);
            float rad = (p.y > 0.0) ? r_sel.y : r_sel.x;
            rad = min(rad, min(b.x, b.y));
            vec2 q = abs(p) - b + rad;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
        }

        float sdShapeBox(vec2 p, vec2 b, vec4 r, float sharp_zero) {
            vec2 r_sel = (p.x > 0.0) ? vec2(r.y, r.z) : vec2(r.x, r.w);
            float rad = (p.y > 0.0) ? r_sel.y : r_sel.x;
            rad = min(rad, min(b.x, b.y));
            vec2 q = abs(p) - b + rad;
            if (sharp_zero > 0.5 && rad <= 0.001) {
                return max(q.x, q.y);
            }
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
        }

        float sdChamferBox(vec2 p, vec2 b, float ch) {
            vec2 ap = abs(p);
            float d_rect = max(ap.x - b.x, ap.y - b.y);
            float c = clamp(max(ch, 34.0), 12.0, min(b.x, b.y) * 0.45);
            float d_diag = (ap.x - b.x + ap.y - b.y + c) * 0.70710678;
            return max(d_rect, d_diag);
        }

        float sdNotchedBox(vec2 p, vec2 b, float ch) {
            vec2 ap = abs(p);
            float d_rect = max(ap.x - b.x, ap.y - b.y);
            float c = clamp(max(ch * 1.15, 32.0), 14.0, min(b.x, b.y) * 0.4);
            float cut1 = max((b.x - c * 0.65) - ap.x, (b.y - c) - ap.y);
            float cut2 = max((b.x - c) - ap.x, (b.y - c * 0.65) - ap.y);
            float d_cut_corner = min(cut1, cut2);
            float mid_w = clamp(b.x * 0.22, 40.0, 180.0);
            float notch_depth = 10.0;
            float d_cut_mid = max(ap.x - mid_w, (b.y - notch_depth) - ap.y);
            float d_cut = min(d_cut_corner, d_cut_mid);
            return max(d_rect, -d_cut);
        }

        float sdPixelBox(vec2 p, vec2 b, float step_sz) {
            vec2 ap = abs(p);
            float s = clamp(max(step_sz, 12.0), 10.0, min(b.x, b.y) * 0.22);
            float d_rect = max(ap.x - b.x, ap.y - b.y);
            float c = s * 2.0;
            float cut1 = max((b.x - s) - ap.x, (b.y - c) - ap.y);
            float cut2 = max((b.x - c) - ap.x, (b.y - s) - ap.y);
            float d_cut = min(cut1, cut2);
            return max(d_rect, -d_cut);
        }

        float evalShapeSDF(vec2 p, vec2 half_base, vec4 r, float clip_style, float inner_en, float in_t, float out_t, float sharp_zero) {
            if (clip_style > 11.5 && clip_style < 12.5) {
                return sdChamferBox(p, half_base, r.x);
            } else if (clip_style > 12.5 && clip_style < 13.5) {
                return sdNotchedBox(p, half_base, r.x);
            } else if (clip_style > 18.5 && clip_style < 19.5) {
                float st = (inner_en > 0.5) ? in_t : out_t;
                return sdPixelBox(p, half_base, st);
            }
            return sdShapeBox(p, half_base, r, sharp_zero);
        }

        float evalSoftShadowAlpha(float dist, float blur_px) {
            if (blur_px < 0.75) {
                return 1.0 - smoothstep(-0.75, 0.75, dist);
            }
            float b = max(blur_px, 1.0);
            float sigma = max(b * 0.45, 0.75);
            float x = max(0.0, dist + b * 0.15);
            float fade = 1.0 - smoothstep(b * 1.15, b * 1.65, max(0.0, dist));
            return clamp(exp(-(x * x) / (2.0 * sigma * sigma)) * fade, 0.0, 1.0);
        }

        float clockwisePerimDist(vec2 p, vec2 half_base) {
            float hx = max(half_base.x, 1.0);
            float hy = max(half_base.y, 1.0);
            if (abs(p.y) / hy >= abs(p.x) / hx) {
                if (p.y < 0.0) {
                    return (p.x + hx);
                }
                return (hx * 2.0) + (hy * 2.0) + (hx - p.x);
            }
            if (p.x >= 0.0) {
                return (hx * 2.0) + (p.y + hy);
            }
            return (hx * 4.0) + (hy * 2.0) + (hy - p.y);
        }

        vec4 hslRainbow(float h) {
            float r = clamp(abs(fract(h + 0.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
            float g = clamp(abs(fract(h + 0.6666667) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
            float b = clamp(abs(fract(h + 0.3333333) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
            return vec4(r, g, b, 1.0);
        }

        vec4 applyBorderAnimOverlay(
            vec4 base_col, vec2 p, vec2 half_base,
            float a_type, float a_time, float a_speed, float a_size, float a_dir, vec4 a_color2
        ) {
            if (a_type < 0.5 || base_col.a <= 0.001) return base_col;
            float dur = max(a_speed, 0.25);
            float cyc_raw = a_time / dur;
            float dir_sign = (a_dir < 0.0) ? -1.0 : 1.0;
            float phase = cyc_raw * 6.2831853 * dir_sign;
            if (a_dir > 1.5) phase = sin(cyc_raw * 6.2831853) * 3.14159265;

            float theta = atan(p.y, p.x);
            float norm_ang = (theta + 3.14159265) / 6.2831853;
            float base_a = base_col.a;
            vec3 anim_rgb = base_col.rgb;
            float anim_a = base_a;

            if (a_type < 1.5 || (a_type > 4.5 && a_type < 5.5)) {
                float arc = clamp(a_size / 100.0, 0.08, 1.0);
                float d = abs(fract(norm_ang - phase / 6.2831853 + 0.5) - 0.5);
                float beam = smoothstep(arc * 0.5, 0.0, d);
                anim_rgb = mix(base_col.rgb, a_color2.rgb, beam);
            } else if (a_type < 2.5) {
                float arc = clamp(a_size / 100.0, 0.08, 0.8);
                float offset = phase / 6.2831853;
                float d1 = abs(fract(norm_ang - offset + 0.5) - 0.5);
                float d2 = abs(fract(norm_ang - offset) - 0.5);
                float beam = max(smoothstep(arc * 0.4, 0.0, d1), smoothstep(arc * 0.4, 0.0, d2));
                anim_rgb = mix(base_col.rgb, a_color2.rgb, beam);
            } else if (a_type < 3.5) {
                vec2 norm_p = p / max(half_base, vec2(1.0, 1.0));
                float sweep_pos = fract(cyc_raw * dir_sign) * 3.2 - 1.6;
                float laser_d = (norm_p.x + norm_p.y * 0.7) - sweep_pos;
                float laser = exp(-laser_d * laser_d * 18.0);
                anim_rgb = mix(base_col.rgb, a_color2.rgb, clamp(laser * 0.92, 0.0, 1.0));
            } else if (a_type < 4.5) {
                float wave = 0.5 + 0.5 * sin(norm_ang * 18.8495 + phase * 2.0) * cos(norm_ang * 12.566 - phase * 1.4);
                anim_rgb = mix(base_col.rgb, a_color2.rgb, wave * 0.78);
            } else if (a_type < 6.5) {
                float pulse = 0.55 + 0.45 * sin(phase);
                anim_rgb = base_col.rgb * (0.78 + 0.35 * pulse);
                anim_a = base_a * pulse;
            } else if (a_type < 7.5) {
                float f = fract(cyc_raw);
                float surge = (f < 0.10 || (f > 0.18 && f < 0.28)) ? 1.0 : 0.0;
                anim_rgb = mix(base_col.rgb, a_color2.rgb, surge * 0.9);
            } else if (a_type < 8.5) {
                float cyc = 0.5 + 0.5 * sin(norm_ang * 6.2831853 + phase);
                anim_rgb = mix(base_col.rgb, a_color2.rgb, cyc * 0.8);
            } else if (a_type < 9.5) {
                vec4 rb = hslRainbow(norm_ang + phase / 6.2831853);
                float lum = dot(base_col.rgb, vec3(0.299, 0.587, 0.114));
                anim_rgb = rb.rgb * mix(0.55, 1.15, clamp(lum, 0.0, 1.0));
            } else {
                float coord = clockwisePerimDist(p, half_base) / 28.0;
                float dash = step(0.5, fract(coord - cyc_raw * 6.0 * dir_sign));
                anim_rgb = mix(base_col.rgb * 0.3, a_color2.rgb, dash);
                anim_a = base_a * (0.25 + 0.75 * dash);
            }
            return vec4(anim_rgb, clamp(anim_a, 0.0, 1.0));
        }

        vec4 evalStyledLayer(
            vec2 p, vec2 half_base, float band_t, float thickness,
            float style_code, float use_grad, vec4 c1, vec4 c2, float angle_rad
        ) {
            vec4 col = c1;
            if (use_grad > 0.5) {
                vec2 dir = vec2(sin(angle_rad), -cos(angle_rad));
                vec2 norm_p = p / max(half_base, vec2(1.0, 1.0));
                float proj = clamp(dot(norm_p, dir) * 0.5 + 0.5, 0.0, 1.0);
                col = mix(c1, c2, proj);
            }

            float p_dist = clockwisePerimDist(p, half_base);

            if (style_code > 0.5 && style_code < 1.5) {
                float pitch = max(thickness * 3.2, 24.0);
                float f = fract(p_dist / pitch);
                col.a *= step(0.42, f);
                return col;
            }
            if (style_code > 1.5 && style_code < 2.5) {
                float pitch = max(thickness * 1.5, 14.0);
                float cell_x = (fract(p_dist / pitch) - 0.5) * pitch;
                float cell_y = (band_t - 0.5) * thickness;
                float r = max(thickness * 0.38, 2.0);
                float dist_dot = length(vec2(cell_x, cell_y));
                col.a *= (1.0 - smoothstep(r - 0.8, r + 0.8, dist_dot));
                return col;
            }
            if ((style_code > 2.5 && style_code < 3.5) || (style_code > 8.5 && style_code < 9.5)) {
                if (band_t > 0.34 && band_t < 0.66) {
                    if (style_code > 8.5) { col.rgb *= 0.18; col.a *= 0.45; }
                    else col.a = 0.0;
                }
                return col;
            }
            if (style_code > 3.5 && style_code < 7.5) {
                vec2 dist_edge = half_base - abs(p);
                float is_tl = 0.0;
                if (abs(dist_edge.x - dist_edge.y) < 1.0) is_tl = ((p.x + p.y) < 0.0) ? 1.0 : 0.0;
                else if (dist_edge.x < dist_edge.y) is_tl = (p.x < 0.0) ? 1.0 : 0.0;
                else is_tl = (p.y < 0.0) ? 1.0 : 0.0;
                float invert = 0.0;
                if (style_code > 5.5 && style_code < 6.5) invert = 1.0;
                if (style_code > 3.5 && style_code < 4.5 && band_t < 0.5) invert = 1.0;
                if (style_code > 4.5 && style_code < 5.5 && band_t >= 0.5) invert = 1.0;
                float use_light = (invert > 0.5) ? (1.0 - is_tl) : is_tl;
                bool same_col = length(c2.rgb - c1.rgb) < 0.04;
                vec4 light_c = same_col ? vec4(mix(c1.rgb, vec3(1.0, 1.0, 1.0), 0.42), c1.a) : c1;
                vec4 dark_c = same_col ? vec4(c1.rgb * 0.38, c1.a) : c2;
                return (use_light > 0.5) ? light_c : dark_c;
            }
            if (style_code > 7.5 && style_code < 8.5) {
                float core = 1.0 - smoothstep(0.10, 0.36, abs(band_t - 0.5));
                col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), core * 0.88);
                return col;
            }
            if (style_code > 9.5 && style_code < 10.5) {
                vec2 corner_dist = half_base - abs(p);
                float span = clamp(min(half_base.x, half_base.y) * 0.28, 30.0, 220.0);
                if (corner_dist.x > span || corner_dist.y > span) col.a = 0.0;
                return col;
            }
            if (style_code > 10.5 && style_code < 11.5) {
                vec2 corner_dist = half_base - abs(p);
                float span = clamp(min(half_base.x, half_base.y) * 0.25, 28.0, 200.0);
                if (corner_dist.x > span || corner_dist.y > span) {
                    bool mid_bar = (abs(p.x) < half_base.x * 0.16 && abs(p.y) > half_base.y * 0.5);
                    if (!mid_bar && (band_t < 0.36 || band_t > 0.64)) col.a = 0.0;
                    else col.a *= (mid_bar ? 0.95 : 0.48);
                }
                return col;
            }
            if (style_code > 11.5 && style_code < 12.5) {
                if (band_t < 0.28) col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), 0.35);
                return col;
            }
            if (style_code > 12.5 && style_code < 13.5) {
                if (abs(p.x) < half_base.x * 0.22 && abs(p.y) > half_base.y * 0.5) {
                    col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), 0.35);
                } else if (band_t > 0.35 && band_t < 0.65) {
                    col.a *= 0.4;
                }
                return col;
            }
            if (style_code > 13.5 && style_code < 14.5) {
                vec2 corner_dist = half_base - abs(p);
                float arm = clamp(min(half_base.x, half_base.y) * 0.2, 24.0, 160.0);
                bool in_corner = (corner_dist.x < arm && corner_dist.y < arm);
                bool in_reticle = (abs(p.x) < 24.0 || abs(p.y) < 24.0);
                if (!in_corner && !in_reticle) {
                    if (band_t < 0.32 || band_t > 0.68) col.a = 0.0;
                    else col.a *= 0.45;
                }
                if (abs(p.x) < 4.0 || abs(p.y) < 4.0) {
                    col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), 0.65);
                }
                return col;
            }
            if (style_code > 14.5 && style_code < 15.5) {
                float pitch = max(thickness * 1.8, 18.0);
                float stripe = step(0.5, fract((p.x + p.y) / pitch));
                vec4 c_alt = (use_grad > 0.5 && length(c2.rgb - c1.rgb) > 0.04) ? c2 : vec4(0.08, 0.09, 0.11, c1.a);
                return (stripe > 0.5) ? c1 : c_alt;
            }
            if (style_code > 15.5 && style_code < 16.5) {
                float pitch = max(thickness * 1.8, 18.0);
                float v = fract((p_dist - abs(band_t - 0.5) * thickness * 1.4) / pitch);
                vec4 dark = (use_grad > 0.5 && length(c2.rgb - c1.rgb) > 0.04) ? c2 : vec4(c1.rgb * 0.28, c1.a);
                return (v < 0.52) ? c1 : dark;
            }
            if (style_code > 16.5 && style_code < 17.5) {
                float pitch = max(thickness * 1.4, 16.0);
                float dx = (fract(p_dist / pitch) - 0.5) * 2.0;
                float bump = sqrt(max(0.0, 1.0 - dx * dx));
                if (band_t > (0.45 + bump * 0.55)) col.a = 0.0;
                return col;
            }
            if (style_code > 17.5 && style_code < 18.5) {
                if (band_t > 0.24 && band_t < 0.56) {
                    float pitch = max(thickness * 2.2, 26.0);
                    float fx = abs(fract(p_dist / pitch) - 0.5) * 2.0;
                    float fy = abs((band_t - 0.40) / 0.16);
                    if ((fx + fy) > 0.72) col.a = 0.0;
                } else if (band_t <= 0.24) {
                    col.a *= 0.80;
                }
                return col;
            }
            if (style_code > 18.5 && style_code < 19.5) {
                float pitch = max(thickness * 1.1, 12.0);
                float px = step(0.18, fract(p_dist / pitch));
                col.a *= px;
                return col;
            }
            if (style_code > 19.5 && style_code < 20.5) {
                float hx_norm = max(half_base.x, 1.0);
                float hy_norm = max(half_base.y, 1.0);
                bool on_horiz = (abs(p.y) / hy_norm) >= (abs(p.x) / hx_norm);
                if (!on_horiz) {
                    if (band_t < 0.62) col.a = 0.0;
                    else col.a *= 0.78;
                    return col;
                }
                float pitch = max(thickness * 2.4, 28.0);
                float hx = abs(fract(p_dist / pitch) - 0.5);
                float hy = abs(band_t - 0.5);
                float mx = smoothstep(0.22, 0.28, hx);
                float my = smoothstep(0.24, 0.30, hy);
                float hole_keep = max(mx, my);
                col.a *= hole_keep;
                return col;
            }
            if (style_code > 20.5 && style_code < 21.5) {
                float pitch = max(thickness * 1.65, 16.0);
                float bx = (fract(p_dist / pitch) - 0.5) * pitch;
                float by = (band_t - 0.5) * thickness;
                float br = max(thickness * 0.28, 1.8);
                float bulb = 1.0 - smoothstep(br - 0.8, br + 0.8, length(vec2(bx, by)));
                bool is_rail = (band_t < 0.16 || band_t > 0.84);
                col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), bulb * 0.42);
                col.a *= max(bulb, is_rail ? 0.76 : 0.24);
                return col;
            }
            if (style_code > 21.5 && style_code < 22.5) {
                vec2 corner_dist = half_base - abs(p);
                float span = clamp(min(half_base.x, half_base.y) * 0.24, 24.0, 180.0);
                if (corner_dist.x <= span && corner_dist.y <= span && band_t < 0.48) {
                    return col;
                }
                float tick_pitch = max(thickness * 0.95, 10.0);
                bool in_tick = fract(p_dist / tick_pitch) < 0.28;
                bool major_tick = fract(p_dist / (tick_pitch * 5.0)) < 0.20;
                if (band_t < 0.22) {
                    col.a *= 0.48;
                    return col;
                }
                if (in_tick && band_t <= (major_tick ? 0.96 : 0.58)) {
                    col.a *= (major_tick ? 1.0 : 0.72);
                    return col;
                }
                col.a = 0.0;
                return col;
            }
            if (style_code > 22.5 && style_code < 23.5) {
                float pitch = max(thickness * 2.2, 24.0);
                float u = fract(p_dist / pitch);
                float lane = step(0.5, fract(p_dist / (pitch * 2.0)));
                float target_t = (lane > 0.5) ? 0.72 : 0.28;
                if (u > 0.82) {
                    float k = (u - 0.82) / 0.18;
                    target_t = mix(target_t, (lane > 0.5) ? 0.28 : 0.72, k);
                }
                float d_trace = abs(band_t - target_t);
                float m_trace = 1.0 - smoothstep(0.11, 0.20, d_trace);
                float px_c = (u - 0.25) * pitch;
                float py_c = (band_t - target_t) * thickness;
                float pad_r = max(thickness * 0.24, 2.0);
                float m_pad = 1.0 - smoothstep(pad_r - 0.7, pad_r + 0.7, length(vec2(px_c, py_c)));
                float rail_a = (band_t < 0.16) ? 0.34 : 0.0;
                col.a *= max(max(m_trace, m_pad), rail_a);
                return col;
            }
            if (style_code > 23.5 && style_code < 24.5) {
                bool in_outer = band_t < 0.34;
                bool in_inner = band_t > 0.76;
                vec2 corner_dist = half_base - abs(p);
                float step_span = clamp(min(half_base.x, half_base.y) * 0.22, 24.0, 140.0);
                bool in_corner_step = (corner_dist.x < step_span && corner_dist.y < step_span * 0.38)
                                   || (corner_dist.y < step_span && corner_dist.x < step_span * 0.38)
                                   || (corner_dist.x < step_span * 0.65 && corner_dist.y < step_span * 0.65);
                bool in_keystone = (abs(p.x) < max(thickness * 1.3, 18.0)) || (abs(p.y) < max(thickness * 1.3, 18.0));
                if (!in_outer && !in_inner && !in_corner_step && !in_keystone) {
                    col.a = 0.0;
                }
                return col;
            }
            if (style_code > 24.5 && style_code < 25.5) {
                float pitch = max(thickness * 2.2, 24.0);
                float bx = (fract(p_dist / pitch) - 0.5) * pitch;
                float by = (band_t - 0.5) * thickness;
                float d_r = length(vec2(bx, by));
                float r_halo = max(thickness * 0.32, 2.4);
                float r_stud = max(thickness * 0.18, 1.4);
                float stud_m = 1.0 - smoothstep(r_stud - 0.6, r_stud + 0.6, d_r);
                float groove_m = (1.0 - smoothstep(r_halo - 0.6, r_halo + 0.6, d_r)) * smoothstep(r_stud - 0.4, r_stud + 0.4, d_r);
                col.rgb *= (0.86 + 0.16 * (1.0 - band_t));
                if (band_t < 0.15 || band_t > 0.85) {
                    col.a *= 0.96;
                } else {
                    col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), stud_m * 0.35);
                    col.a *= mix(0.76, 0.28, groove_m);
                }
                return col;
            }
            if (style_code > 25.5 && style_code < 26.5) {
                if (band_t < 0.14 || band_t > 0.86) {
                    col.a *= 0.65;
                    return col;
                }
                float pitch = max(thickness * 2.0, 22.0);
                float ang = (p_dist / pitch) * 6.2831853;
                float w1 = abs(band_t - (0.5 + 0.28 * sin(ang)));
                float w2 = abs(band_t - (0.5 - 0.28 * sin(ang)));
                float s1 = 1.0 - smoothstep(0.14, 0.22, w1);
                float s2 = 1.0 - smoothstep(0.14, 0.22, w2);
                float top_s = (cos(ang) >= 0.0) ? max(s1, s2 * 0.65) : max(s2, s1 * 0.65);
                col.a *= max(0.18, top_s);
                return col;
            }
            if (style_code > 26.5 && style_code < 27.5) {
                float pitch = max(thickness * 1.45, 16.0);
                float tri = abs(fract(p_dist / pitch) - 0.5) * 2.0;
                float target_t = 0.18 + 0.64 * tri;
                float m = 1.0 - smoothstep(0.15, 0.26, abs(band_t - target_t));
                col.a *= m;
                return col;
            }
            if (style_code > 27.5 && style_code < 28.5) {
                float pitch = max(thickness * 2.2, 22.0);
                float wv = 0.5 + 0.30 * sin((p_dist / pitch) * 6.2831853);
                float m = 1.0 - smoothstep(0.16, 0.27, abs(band_t - wv));
                float rail_a = (band_t < 0.12) ? 0.22 : 0.0;
                col.a *= max(m, rail_a);
                return col;
            }
            if (style_code > 28.5 && style_code < 29.5) {
                float j1 = 0.50 + 0.15 * sin(p_dist * 0.17) + 0.08 * cos(p_dist * 0.41);
                float j2 = 0.46 + 0.14 * cos(p_dist * 0.23) + 0.09 * sin(p_dist * 0.37);
                float m1 = 1.0 - smoothstep(0.14, 0.24, abs(band_t - j1));
                float m2 = (1.0 - smoothstep(0.10, 0.20, abs(band_t - j2))) * 0.68;
                col.a *= clamp(max(m1, m2), 0.0, 1.0);
                return col;
            }
            if (style_code > 29.5) {
                float pitch = max(thickness * 2.1, 20.0);
                float f = fract(p_dist / pitch);
                float seg = smoothstep(0.14, 0.18, f) * (1.0 - smoothstep(0.84, 0.88, f));
                float bar_m = (band_t >= 0.08 && band_t <= 0.92) ? seg : 0.0;
                col.a *= max(0.14, bar_m);
                return col;
            }
            return col;
        }

        float ornateOrnamentMask(vec2 p, vec2 half_base, vec4 radii, float band_mid, float thickness) {
            vec2 ap = abs(p);
            float pull = min(radii.x * 0.28, max(band_mid + 10.0, 14.0));
            vec2 anchor = vec2(half_base.x + band_mid - pull * 0.35, half_base.y + band_mid - pull * 0.35);
            vec2 cd = abs(ap - anchor);
            float d_size = clamp(max(thickness * 1.45, 22.0), 14.0, 48.0);
            float d_corner = (cd.x + cd.y) - d_size;

            float fin_len = d_size * 2.2;
            float dx_in = anchor.x - ap.x;
            float d_fin_x = (dx_in >= 0.0 && dx_in <= fin_len) ? (cd.y - d_size * 0.42 * (1.0 - dx_in / fin_len)) : 1000.0;
            float dy_in = anchor.y - ap.y;
            float d_fin_y = (dy_in >= 0.0 && dy_in <= fin_len) ? (cd.x - d_size * 0.42 * (1.0 - dy_in / fin_len)) : 1000.0;

            float md_size = d_size * 0.72;
            float d_tb_mid = (ap.x + abs(ap.y - (half_base.y + band_mid))) - md_size;
            float d_lr_mid = (abs(ap.x - (half_base.x + band_mid)) + ap.y) - md_size;

            float d_orn = min(min(d_corner, min(d_fin_x, d_fin_y)), min(d_tb_mid, d_lr_mid));
            return 1.0 - smoothstep(-0.75, 0.75, d_orn);
        }

        float hash21(vec2 co) {
            vec2 k = vec2(12.9898, 78.233);
            float dt = dot(co, k);
            return fract(sin(dt) * 43758.5453);
        }

        vec4 evalBackgroundFill(vec2 p, vec2 half_base, float a_time) {
            if (bg_mode < 0.5) return vec4(0.0);
            vec2 dir = vec2(sin(bg_angle_rad), -cos(bg_angle_rad));
            vec2 norm_p = p / max(half_base, vec2(1.0, 1.0));
            float proj = clamp(dot(norm_p, dir) * 0.5 + 0.5, 0.0, 1.0);

            if (bg_mode > 1.5 && bg_mode < 2.5) return bg_color1;
            if (bg_mode > 2.5 && bg_mode < 3.5) return mix(bg_color1, bg_color2, proj);
            if (bg_mode > 3.5) {
                float sc = max(1.0, bg_static_scale);
                float s_speed = max(2.0, bg_static_speed);
                float t_stat = floor(a_time * s_speed);
                vec2 px = p + half_base;
                if (bg_static_glitch > 0.01) {
                    float band = floor(px.y / (8.0 * sc));
                    float gh = hash21(vec2(band, t_stat));
                    if (gh > (1.0 - bg_static_glitch * 0.35)) {
                        px.x += (gh - 0.5) * 120.0 * bg_static_glitch;
                    }
                }
                vec2 nc = floor(px / sc);
                vec2 seed = vec2(fract(t_stat * 0.1983), fract(t_stat * 0.3571)) * 1000.0;
                float wn = hash21(nc + seed);
                vec3 snow = vec3(wn, wn, wn);
                if (bg_static_color > 0.5) {
                    snow.g = hash21(nc + seed + vec2(13.1, 7.3));
                    snow.b = hash21(nc + seed + vec2(37.9, 19.4));
                }
                float scan = 0.90 + 0.10 * sin(px.y * 0.95);
                vec3 out_rgb = mix(bg_color1.rgb, snow * scan, clamp(bg_static_noise, 0.0, 1.0));
                return vec4(out_rgb * bg_color1.a, bg_color1.a);
            }

            vec4 card = mix(bg_color1, bg_color2, proj);
            float min_d = min(half_base.x, half_base.y);
            float head_r = min_d * 0.165;
            float d_head = length(p - vec2(0.0, -min_d * 0.15)) - head_r;
            vec2 torso_b = vec2(min_d * 0.28, min_d * 0.21);
            float d_torso = sdRoundedBox(
                p - vec2(0.0, min_d * 0.26),
                torso_b,
                vec4(min_d * 0.19, min_d * 0.19, min_d * 0.05, min_d * 0.05)
            );
            float d_person = min(d_head, d_torso);
            float p_mask = (1.0 - smoothstep(-1.2, 1.2, d_person)) * bg_icon_color.a;
            vec3 person_rgb = mix(card.rgb, bg_icon_color.rgb, p_mask);
            return vec4(person_rgb * card.a, card.a);
        }

        void main() {
            vec2 pixel_pos = v_uv * total_size;
            vec2 center = total_size * 0.5;
            vec2 p = pixel_pos - center;
            vec2 half_base = base_size * 0.5;

            float clip_style = (inner_enabled > 0.5) ? inner_style : outer_style;
            float d_shape = evalShapeSDF(p, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, 1.0);

            vec2 video_uv = (pixel_pos - pad_xy) / max(base_size, vec2(1.0, 1.0));
            vec4 video_col = vec4(0.0);
            if (video_uv.x >= 0.0 && video_uv.x <= 1.0 && video_uv.y >= 0.0 && video_uv.y <= 1.0) {
                video_col = texture2D(u_tex, clamp(video_uv, 0.0, 1.0));
            }
            float video_mask = 1.0 - smoothstep(-0.75, 0.75, d_shape);
            video_col *= video_mask;

            if (bg_mode > 0.5) {
                vec4 bg_col = evalBackgroundFill(p, half_base, anim_time) * video_mask;
                if (bg_standby > 0.5) {
                    video_col = bg_col;
                } else {
                    video_col = video_col + bg_col * (1.0 - clamp(video_col.a, 0.0, 1.0));
                }
            }

            float total_inner = (inner_enabled > 0.5) ? inner_thickness : 0.0;
            float total_outer = (outer_enabled > 0.5) ? outer_thickness : 0.0;
            float shift = -seam_overlap;
            if (placement_code > 0.5 && placement_code < 1.5) shift = -0.5 * (total_inner + total_outer);
            else if (placement_code > 1.5) shift = -(total_inner + total_outer + inner_gap + outer_gap);

            vec4 border_pm = vec4(0.0);

            float in_start = shift + inner_gap;
            float in_end = in_start + total_inner;
            if (inner_enabled > 0.5 && total_inner > 0.0) {
                float band_mask = smoothstep(in_start - 0.65, in_start + 0.65, d_shape)
                                * (1.0 - smoothstep(in_end - 0.65, in_end + 0.65, d_shape));
                float orn_mask = (inner_style > 17.5 && inner_style < 18.5)
                    ? ornateOrnamentMask(p, half_base, radii, in_start + total_inner * 0.5, total_inner)
                    : 0.0;
                float in_mask = max(band_mask, orn_mask);
                if (in_mask > 0.001) {
                    float band_t = clamp((d_shape - in_start) / max(total_inner, 0.001), 0.0, 1.0);
                    float eff_style = (orn_mask > 0.5) ? 0.0 : inner_style;
                    vec4 ic = evalStyledLayer(p, half_base, band_t, total_inner, eff_style, inner_grad, inner_color1, inner_color2, inner_angle_rad);
                    ic = applyBorderAnimOverlay(ic, p, half_base, anim_type, anim_time, anim_speed, anim_size, anim_dir, anim_color2);
                    float a = clamp(ic.a * in_mask, 0.0, 1.0);
                    border_pm = vec4(ic.rgb * a, a);
                }
            }

            float out_start = in_end + outer_gap;
            float out_end = out_start + total_outer;
            if (outer_enabled > 0.5 && total_outer > 0.0) {
                float band_mask = smoothstep(out_start - 0.65, out_start + 0.65, d_shape)
                                * (1.0 - smoothstep(out_end - 0.65, out_end + 0.65, d_shape));
                float orn_mask = (outer_style > 17.5 && outer_style < 18.5)
                    ? ornateOrnamentMask(p, half_base, radii, out_start + total_outer * 0.5, total_outer)
                    : 0.0;
                float out_mask = max(band_mask, orn_mask);
                if (out_mask > 0.001) {
                    float band_t = clamp((d_shape - out_start) / max(total_outer, 0.001), 0.0, 1.0);
                    float eff_style = (orn_mask > 0.5) ? 0.0 : outer_style;
                    vec4 oc = evalStyledLayer(p, half_base, band_t, total_outer, eff_style, outer_grad, outer_color1, outer_color2, outer_angle_rad);
                    oc = applyBorderAnimOverlay(oc, p, half_base, anim_type, anim_time, anim_speed, anim_size, anim_dir, anim_color2);
                    float oa = clamp(oc.a * out_mask, 0.0, 1.0);
                    vec4 oc_pm = vec4(oc.rgb * oa, oa);
                    border_pm = oc_pm + border_pm * (1.0 - oa);
                }
            }

            float glow_edge = (outer_enabled > 0.5 && total_outer > 0.0) ? out_end : in_end;
            float shadow_edge = (outer_enabled > 0.5 && total_outer > 0.0)
                ? out_end
                : ((inner_enabled > 0.5 && total_inner > 0.0) ? in_end : 0.0);
            float inset_edge = (inner_enabled > 0.5 && total_inner > 0.0)
                ? min(0.0, in_start)
                : ((outer_enabled > 0.5 && total_outer > 0.0) ? min(0.0, out_start) : 0.0);

            if (shadow_enabled > 0.5 && shadow_mode >= 2.5 && d_shape <= inset_edge + 0.75) {
                float sharp_in = (shadow_blur < 0.75) ? 1.0 : 0.0;
                float d_in_sh = evalShapeSDF(p - shadow_offset, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, sharp_in) - (inset_edge - shadow_spread);
                float sa_in = evalSoftShadowAlpha(-d_in_sh, shadow_blur);
                float sh_ia = clamp(shadow_color.a * sa_in, 0.0, 1.0) * video_mask;
                if (shadow_multiply > 0.5) {
                    video_col.rgb *= mix(vec3(1.0), shadow_color.rgb, sh_ia);
                } else {
                    vec4 is_pm = vec4(shadow_color.rgb * sh_ia, sh_ia);
                    video_col = is_pm + video_col * (1.0 - sh_ia);
                }
            }

            vec4 shadow_pm = vec4(0.0);
            if (shadow_enabled > 0.5 && shadow_mode < 2.5 && placement_code < 1.5) {
                float edge = shadow_edge + shadow_spread;
                float sa_out = 0.0;
                if (shadow_mode > 1.5) {
                    float d_c = evalShapeSDF(p - shadow_offset * 0.35, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, 0.0);
                    float d_a = evalShapeSDF(p - shadow_offset, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, 0.0);
                    float c_a = evalSoftShadowAlpha(d_c - edge, max(2.0, shadow_blur * 0.28));
                    float a_a = evalSoftShadowAlpha(d_a - edge, shadow_blur);
                    sa_out = clamp(max(c_a * 0.65, a_a * 0.75) + 0.2 * c_a * a_a, 0.0, 1.0);
                } else {
                    float is_hard = (shadow_mode > 0.5 && shadow_mode < 1.5) ? 1.0 : 0.0;
                    float eff_blur = (is_hard > 0.5) ? 0.0 : shadow_blur;
                    float sharp_out = (eff_blur < 0.75) ? 1.0 : 0.0;
                    float d_sh = evalShapeSDF(p - shadow_offset, half_base, radii, clip_style, inner_enabled, inner_thickness, outer_thickness, sharp_out);
                    sa_out = evalSoftShadowAlpha(d_sh - edge, eff_blur);
                }
                float sh_a = clamp(shadow_color.a * sa_out, 0.0, 1.0) * (1.0 - video_mask);
                shadow_pm = vec4(shadow_color.rgb * sh_a, sh_a);
            }

            vec4 glow_pm = vec4(0.0);
            if (glow_enabled > 0.5 && glow_blur > 0.5) {
                float pulse = (anim_type > 5.5 && anim_type < 6.5) ? (0.65 + 0.35 * sin(anim_time / max(anim_speed, 0.25) * 6.2831853)) : 1.0;
                if (glow_inner > 0.5 && d_shape < in_start) {
                    float gd_in = max(0.0, in_start - d_shape);
                    float ga = exp(-gd_in / max(glow_blur * 0.45, 1.0)) * 0.65 * pulse;
                    ga *= (1.0 - smoothstep(glow_blur * 1.4, glow_blur * 1.9, gd_in));
                    float a = clamp(glow_color.a * ga, 0.0, 1.0);
                    glow_pm = vec4(glow_color.rgb * a, a);
                } else if (glow_inner < 0.5 && placement_code < 1.5 && d_shape > glow_edge - 0.5) {
                    float gd_out = max(0.0, d_shape - glow_edge);
                    float ga = exp(-gd_out / max(glow_blur * 0.45, 1.0)) * 0.75 * pulse;
                    ga *= (1.0 - smoothstep(glow_blur * 1.4, glow_blur * 1.9, gd_out));
                    if (glow_neon > 0.5) {
                        float core = exp(-gd_out / max(glow_blur * 0.14, 1.0));
                        float a = clamp(glow_color.a * max(ga, core), 0.0, 1.0);
                        vec3 neon_rgb = mix(glow_color.rgb, vec3(1.0), core * 0.65);
                        glow_pm = vec4(neon_rgb * a, a);
                    } else {
                        float a = clamp(glow_color.a * ga, 0.0, 1.0);
                        glow_pm = vec4(glow_color.rgb * a, a);
                    }
                }
            }

            vec4 result = video_col;
            if (glow_inner > 0.5) result = glow_pm + result * (1.0 - glow_pm.a * 0.35);
            else result = result + glow_pm * (1.0 - result.a);
            result = result + shadow_pm * (1.0 - clamp(result.a, 0.0, 1.0));
            result = border_pm + result * (1.0 - border_pm.a);

            if (show_guides > 0.5) {
                float d_rect = max(abs(p.x) - half_base.x, abs(p.y) - half_base.y);
                if (abs(d_rect) < 1.2) {
                    float dash = step(0.5, fract((p.x + p.y) / 14.0));
                    if (dash > 0.5) result = mix(result, vec4(0.35, 0.65, 1.0, 1.0), 0.55);
                }
            }

            gl_FragColor = result;
        }
    `;

    let glCtx = null;
    let glProg = null;
    let glTex = null;
    let glUniforms = null;
    let glLastBgMode = '';
    let previewDirty = true;
    let lastDimsText = '';
    let lastAutoPillText = '';
    let lastAnimDrawMs = 0;
    let hasSyncedObsOnce = false;

    function createMockSourceCanvas(mode) {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 360;
        const ctx = c.getContext('2d');
        if (mode === 'transparent') {
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillText('TRANSPARENT ALPHA CUTOUT', 20, 34);
            return c;
        }
        const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
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
        ctx.fillRect(0, 0, c.width, c.height);

        if (mode === 'cam') {
            ctx.fillStyle = 'rgba(255,255,255,0.09)';
            ctx.beginPath();
            ctx.arc(c.width * 0.5, c.height * 0.38, 48, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.width * 0.5, c.height * 0.80, 92, 76, 0, Math.PI, Math.PI * 2);
            ctx.fill();
        } else if (mode === 'game') {
            ctx.strokeStyle = 'rgba(88,166,255,0.22)';
            ctx.lineWidth = 2;
            for (let i = 1; i < 6; i++) {
                ctx.beginPath();
                ctx.moveTo(0, (c.height * i) / 6);
                ctx.lineTo(c.width, (c.height * i) / 6);
                ctx.stroke();
            }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(mode === 'cam' ? 'OBS SOURCE (16:9)' : (mode === 'game' ? 'GAMEPLAY CAPTURE' : 'SOURCE FRAME'), 20, 34);
        return c;
    }

    function ensureWebGL(canvas) {
        if (glCtx) return true;
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
        if (!gl) return false;

        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.error('[ObsBorders WebGL]', gl.getShaderInfoLog(sh));
                return null;
            }
            return sh;
        };

        const vs = compile(gl.VERTEX_SHADER, VERT_GLSL);
        const fs = compile(gl.FRAGMENT_SHADER, FRAG_GLSL);
        if (!vs || !fs) return false;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('[ObsBorders WebGL Link]', gl.getProgramInfoLog(prog));
            return false;
        }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const names = [
            'u_tex', 'base_size', 'total_size', 'pad_xy', 'radii', 'seam_overlap', 'placement_code',
            'inner_enabled', 'inner_style', 'inner_grad', 'inner_thickness', 'inner_gap',
            'inner_color1', 'inner_color2', 'inner_angle_rad',
            'outer_enabled', 'outer_style', 'outer_grad', 'outer_thickness', 'outer_gap',
            'outer_color1', 'outer_color2', 'outer_angle_rad',
            'glow_enabled', 'glow_color', 'glow_blur', 'glow_neon', 'glow_inner',
            'shadow_enabled', 'shadow_mode', 'shadow_color', 'shadow_offset', 'shadow_blur', 'shadow_spread', 'shadow_multiply',
            'anim_type', 'anim_time', 'anim_speed', 'anim_size', 'anim_dir', 'anim_color2',
            'bg_mode', 'bg_standby', 'bg_color1', 'bg_color2', 'bg_angle_rad', 'bg_icon_color',
            'bg_static_noise', 'bg_static_scale', 'bg_static_speed', 'bg_static_color', 'bg_static_glitch',
            'show_guides'
        ];
        glUniforms = {};
        names.forEach(n => { glUniforms[n] = gl.getUniformLocation(prog, n); });

        glTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, glTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        glCtx = gl;
        glProg = prog;
        return true;
    }

    function drawPreviewFrame(nowMs) {
        const canvas = document.getElementById('ob-preview-canvas');
        if (!canvas || !workingProfile) return;
        const needFullUpload = previewDirty || !glCtx;
        if (!ensureWebGL(canvas)) return;
        const gl = glCtx;
        gl.useProgram(glProg);
        const u = glUniforms;

        if (!needFullUpload) {
            const elapsedMs = previewPaused ? pausedElapsedMs : Math.max(0, nowMs - animOriginMs);
            gl.uniform1f(u.anim_time, elapsedMs / 1000);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            return;
        }
        previewDirty = false;
        const p = workingProfile;

        const refW = Math.max(64, Number(p.baseWidth) || 1920);
        const refH = Math.max(64, Number(p.baseHeight) || 1080);
        const testVal = document.getElementById('ob-preview-test-size')?.value || 'ref';
        let baseW = refW;
        let baseH = refH;
        if (testVal !== 'ref' && testVal.includes('x')) {
            const [tw, th] = testVal.split('x').map(Number);
            if (tw > 0 && th > 0) {
                baseW = tw;
                baseH = th;
            }
        }
        const autoScaleOn = p.autoScale !== false;
        const sizeScale = autoScaleOn
            ? Math.max(0.25, Math.min(4.0, Math.min(baseW, baseH) / Math.max(1, Math.min(refW, refH))))
            : 1.0;

        const placement = normalizePlacement(p.placement);
        const placementCode = placement === 'outside' ? 0 : (placement === 'center' ? 1 : 2);

        const rawInT = p.inner?.enabled ? resolveNum(p.inner.thickness, 12, 0, 200) : 0;
        const rawInGap = resolveNum(p.inner?.gap, 0, 0, 100);
        const rawOutT = p.outer?.enabled ? resolveNum(p.outer.thickness, 2, 0, 200) : 0;
        const rawOutGap = resolveNum(p.outer?.gap, 0, 0, 100);
        const rawGlowBlur = p.glow?.enabled ? resolveNum(p.glow.blur, 16, 0, 120) : 0;
        const shMode = SHADOW_MODE_MAP[p.shadow?.mode] !== undefined ? p.shadow.mode : 'soft';
        const rawShOffX = p.shadow?.enabled ? resolveNum(p.shadow.offsetX, 10, -150, 150) : 0;
        const rawShOffY = p.shadow?.enabled ? resolveNum(p.shadow.offsetY, 14, -150, 150) : 0;
        const rawShBlur = p.shadow?.enabled ? resolveNum(p.shadow.blur, 24, 0, 120) : 0;
        const rawShSpread = p.shadow?.enabled ? resolveNum(p.shadow.spread, 0, -40, 80) : 0;
        const rawSeamOverlap = Number(p.seamOverlap) || 0;

        const inT = rawInT * sizeScale;
        const inGap = rawInGap * sizeScale;
        const outT = rawOutT * sizeScale;
        const outGap = rawOutGap * sizeScale;
        const glowBlur = rawGlowBlur * sizeScale;
        const shOffX = rawShOffX * sizeScale;
        const shOffY = rawShOffY * sizeScale;
        const shBlur = rawShBlur * sizeScale;
        const shSpread = rawShSpread * sizeScale;
        const seamOverlap = rawSeamOverlap * sizeScale;

        const autoPadOn = p.autoPad !== false;
        const manualPad = resolveNum(p.pad, 48, 0, 400);
        const extraPad = resolveNum(p.extraPad, 0, 0, 200);
        const inStyle = normalizeStyleAlias(p.inner?.style);
        const outStyle = normalizeStyleAlias(p.outer?.style);

        let refPad = 0;
        if (typeof SHARED.computeAutoBorderPad === 'function') {
            refPad = SHARED.computeAutoBorderPad({
                placement,
                autoPad: autoPadOn,
                pad: manualPad,
                extraPad,
                seamOverlap: rawSeamOverlap,
                inner: { enabled: Boolean(p.inner?.enabled), style: inStyle, thickness: rawInT, gap: rawInGap },
                outer: { enabled: Boolean(p.outer?.enabled), style: outStyle, thickness: rawOutT, gap: rawOutGap },
                glow: { enabled: Boolean(p.glow?.enabled), inner: Boolean(p.glow?.inner), blur: rawGlowBlur },
                shadow: { enabled: Boolean(p.shadow?.enabled), mode: shMode, offsetX: rawShOffX, offsetY: rawShOffY, blur: rawShBlur, spread: rawShSpread }
            });
        } else if (placementCode !== 2) {
            refPad = manualPad;
        }
        const pad = placementCode === 2 ? 0 : Math.ceil(refPad * sizeScale);
        const totalW = baseW + pad * 2;
        const totalH = baseH + pad * 2;

        const nextPillText = placementCode === 2 ? 'Inside: 0px' : `Auto: ${refPad}px`;
        if (nextPillText !== lastAutoPillText) {
            const autoPill = document.getElementById('ob-auto-pad-pill');
            if (autoPill) autoPill.textContent = nextPillText;
            lastAutoPillText = nextPillText;
        }

        const scaleNote = autoScaleOn ? ` • Scale: ${sizeScale.toFixed(2)}×` : ' • Fixed px (1.00×)';
        const nextDimsText = pad > 0
            ? `Source: ${baseW}×${baseH} → Expanded: ${totalW}×${totalH} (+${pad}px pad)${scaleNote}`
            : `Source: ${baseW}×${baseH} (${placementCode === 2 ? '0px expansion — Inside mode' : '0px expansion'})${scaleNote}`;
        if (nextDimsText !== lastDimsText) {
            const dimsEl = document.getElementById('ob-preview-dims');
            if (dimsEl) dimsEl.textContent = nextDimsText;
            lastDimsText = nextDimsText;
        }

        if (glLastBgMode !== previewBg) {
            glLastBgMode = previewBg;
            const srcCanvas = createMockSourceCanvas(previewBg);
            gl.bindTexture(gl.TEXTURE_2D, glTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
        }

        // Fit expanded aspect cleanly inside 16:9 canvas with viewport centering
        const cw = canvas.width;
        const ch = canvas.height;
        const scale = Math.min(cw / totalW, ch / totalH);
        const vw = Math.round(totalW * scale);
        const vh = Math.round(totalH * scale);
        const vx = Math.floor((cw - vw) / 2);
        const vy = Math.floor((ch - vh) / 2);
        gl.viewport(vx, vy, vw, vh);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const uniR = resolveNum(p.radius, 20, 0, 500);
        const radii = (p.perCornerRadius
            ? [resolveNum(p.radiusTL, uniR, 0, 500), resolveNum(p.radiusTR, uniR, 0, 500), resolveNum(p.radiusBR, uniR, 0, 500), resolveNum(p.radiusBL, uniR, 0, 500)]
            : [uniR, uniR, uniR, uniR]
        ).map(v => v * sizeScale);

        gl.uniform1i(u.u_tex, 0);
        gl.uniform2f(u.base_size, baseW, baseH);
        gl.uniform2f(u.total_size, totalW, totalH);
        gl.uniform2f(u.pad_xy, pad, pad);
        gl.uniform4f(u.radii, radii[0], radii[1], radii[2], radii[3]);
        gl.uniform1f(u.seam_overlap, seamOverlap);
        gl.uniform1f(u.placement_code, placementCode);

        const inC1 = hexToRgbaFloats(resolveColor(p.inner?.color1, '#FFFFFFFF'));
        const inC2 = hexToRgbaFloats(resolveColor(p.inner?.color2, '#999999FF'));
        const outC1 = hexToRgbaFloats(resolveColor(p.outer?.color1, '#99A443FF'));
        const outC2 = hexToRgbaFloats(resolveColor(p.outer?.color2, '#026E54FF'));
        const glC = hexToRgbaFloats(resolveColor(p.glow?.color, '#38BDF8FF'));
        const shC = hexToRgbaFloats(resolveColor(p.shadow?.color, '#000000B3'));
        const animType = normalizeAnimAlias(p.animation?.type || 'none');
        const animC2 = hexToRgbaFloats(resolveColor(p.animation?.color2, '#FFFFFFFF'));
        const animDir = p.animation?.direction === 'ccw' ? -1 : (p.animation?.direction === 'alternate' ? 2 : 1);

        gl.uniform1f(u.inner_enabled, p.inner?.enabled ? 1 : 0);
        gl.uniform1f(u.inner_style, STYLE_CODE_MAP[inStyle] ?? 0);
        gl.uniform1f(u.inner_grad, p.inner?.gradient ? 1 : 0);
        gl.uniform1f(u.inner_thickness, inT);
        gl.uniform1f(u.inner_gap, inGap);
        gl.uniform4f(u.inner_color1, inC1[0], inC1[1], inC1[2], inC1[3]);
        gl.uniform4f(u.inner_color2, inC2[0], inC2[1], inC2[2], inC2[3]);
        gl.uniform1f(u.inner_angle_rad, (resolveNum(p.inner?.angle, 180, -360, 360) * Math.PI) / 180);

        gl.uniform1f(u.outer_enabled, p.outer?.enabled ? 1 : 0);
        gl.uniform1f(u.outer_style, STYLE_CODE_MAP[outStyle] ?? 0);
        gl.uniform1f(u.outer_grad, p.outer?.gradient ? 1 : 0);
        gl.uniform1f(u.outer_thickness, outT);
        gl.uniform1f(u.outer_gap, outGap);
        gl.uniform4f(u.outer_color1, outC1[0], outC1[1], outC1[2], outC1[3]);
        gl.uniform4f(u.outer_color2, outC2[0], outC2[1], outC2[2], outC2[3]);
        gl.uniform1f(u.outer_angle_rad, (resolveNum(p.outer?.angle, 180, -360, 360) * Math.PI) / 180);

        gl.uniform1f(u.glow_enabled, p.glow?.enabled ? 1 : 0);
        gl.uniform4f(u.glow_color, glC[0], glC[1], glC[2], glC[3]);
        gl.uniform1f(u.glow_blur, glowBlur);
        gl.uniform1f(u.glow_neon, p.glow?.neon ? 1 : 0);
        gl.uniform1f(u.glow_inner, p.glow?.inner ? 1 : 0);

        gl.uniform1f(u.shadow_enabled, p.shadow?.enabled ? 1 : 0);
        gl.uniform1f(u.shadow_mode, SHADOW_MODE_MAP[shMode] ?? 0);
        gl.uniform4f(u.shadow_color, shC[0], shC[1], shC[2], shC[3]);
        gl.uniform2f(u.shadow_offset, shOffX, shOffY);
        gl.uniform1f(u.shadow_blur, shBlur);
        gl.uniform1f(u.shadow_spread, shSpread);
        gl.uniform1f(u.shadow_multiply, p.shadow?.multiply !== false ? 1 : 0);

        gl.uniform1f(u.anim_type, ANIM_CODE_MAP[animType] ?? 0);
        const elapsedMs = previewPaused ? pausedElapsedMs : Math.max(0, nowMs - animOriginMs);
        gl.uniform1f(u.anim_time, elapsedMs / 1000);
        gl.uniform1f(u.anim_speed, resolveNum(p.animation?.speed, 4, 0.25, 60));
        gl.uniform1f(u.anim_size, resolveNum(p.animation?.size, 35, 5, 100));
        gl.uniform1f(u.anim_dir, animDir);
        gl.uniform4f(u.anim_color2, animC2[0], animC2[1], animC2[2], animC2[3]);

        const bg = p.background || {};
        const bgModeCode = BACKGROUND_MODE_MAP[bg.mode || 'none'] ?? 0;
        const bgC1 = hexToRgbaFloats(resolveColor(bg.color1, '#16202FFF'));
        const bgC2 = hexToRgbaFloats(resolveColor(bg.color2, '#0B101BFF'));
        const bgIconC = hexToRgbaFloats(resolveColor(bg.iconColor, '#64748BFF'));
        gl.uniform1f(u.bg_mode, bgModeCode);
        gl.uniform1f(u.bg_standby, bg.standby ? 1 : 0);
        gl.uniform4f(u.bg_color1, bgC1[0], bgC1[1], bgC1[2], bgC1[3]);
        gl.uniform4f(u.bg_color2, bgC2[0], bgC2[1], bgC2[2], bgC2[3]);
        gl.uniform1f(u.bg_angle_rad, (Number(bg.angle ?? 135) * Math.PI) / 180);
        gl.uniform4f(u.bg_icon_color, bgIconC[0], bgIconC[1], bgIconC[2], bgIconC[3]);
        gl.uniform1f(u.bg_static_noise, Math.max(0, Math.min(100, Number(bg.staticNoise ?? 75))) / 100);
        gl.uniform1f(u.bg_static_scale, Math.max(1, Math.min(128, Number(bg.staticScale ?? 3))));
        gl.uniform1f(u.bg_static_speed, Math.max(4, Math.min(30, Number(bg.staticSpeed ?? 16))));
        gl.uniform1f(u.bg_static_color, bg.staticColor ? 1 : 0);
        gl.uniform1f(u.bg_static_glitch, Math.max(0, Math.min(100, Number(bg.staticGlitch ?? 35))) / 100);

        gl.uniform1f(u.show_guides, showGuides ? 1 : 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function stopPreviewAnim() {
        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    function schedulePreviewDraw() {
        previewDirty = true;
        stopPreviewAnim();
        if (activeTab !== 'designer' || document.hidden) return;
        const needsLoop = !previewPaused && workingProfile && (
            normalizeAnimAlias(workingProfile.animation?.type) !== 'none'
            || workingProfile.background?.mode === 'tv-static'
        );
        if (needsLoop) {
            lastAnimDrawMs = 0;
            const tick = (now) => {
                if (activeTab !== 'designer' || document.hidden || previewPaused) {
                    animFrameId = null;
                    return;
                }
                if (previewDirty || (now - lastAnimDrawMs) >= 14.5) {
                    lastAnimDrawMs = now;
                    drawPreviewFrame(now);
                }
                animFrameId = requestAnimationFrame(tick);
            };
            animFrameId = requestAnimationFrame(tick);
        } else {
            drawPreviewFrame(performance.now());
        }
    }

    // ------------------------------------------------------------------------
    // Tab Switching & Live OBS Integration
    // ------------------------------------------------------------------------
    function switchTab(tab, { updateHash = true } = {}) {
        const cleanTab = (tab === 'designer' || tab === 'setup') ? tab : 'sources';
        activeTab = cleanTab;
        try { localStorage.setItem(TAB_STORAGE_KEY, cleanTab); } catch {}
        if (updateHash && window.location.hash !== `#${cleanTab}`) {
            try { history.replaceState(null, '', `#${cleanTab}`); } catch { window.location.hash = cleanTab; }
        }
        document.querySelectorAll('[data-ob-tab]').forEach(btn => {
            const on = btn.dataset.obTab === cleanTab;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.getElementById('ob-pane-sources').hidden = cleanTab !== 'sources';
        document.getElementById('ob-pane-designer').hidden = cleanTab !== 'designer';
        document.getElementById('ob-pane-setup').hidden = cleanTab !== 'setup';

        if (cleanTab === 'designer') schedulePreviewDraw();
        else stopPreviewAnim();

        if (cleanTab === 'sources' && obsConnected && !hasSyncedObsOnce && studioState) {
            syncFromObsWebSocket({ quiet: true });
        }
        if (cleanTab === 'setup') refreshManifestPreview();
    }

    async function refreshObsStatus({ autoSyncIfConnected = false } = {}) {
        const badge = document.getElementById('ob-obs-ws-badge');
        try {
            const res = await fetch('/api/obs-borders/obs-status', { cache: 'no-store' });
            const st = await res.json();
            obsConnected = Boolean(st.connected);
            if (badge) {
                badge.textContent = st.connected
                    ? `OBS Connected (${st.obsVersion || 'WebSocket'})`
                    : (st.enabled ? 'OBS Disconnected' : 'OBS Disabled');
                badge.style.color = st.connected ? '#3fb950' : '#d29922';
            }
            const applyAllBtn = document.getElementById('ob-btn-obs-apply-all');
            if (applyAllBtn) applyAllBtn.disabled = !obsConnected;
            if (obsConnected && autoSyncIfConnected) {
                await syncFromObsWebSocket({ quiet: true });
            } else {
                renderSourceList();
            }
        } catch {
            obsConnected = false;
            if (badge) badge.textContent = 'OBS Unavailable';
        }
    }

    async function syncFromObsWebSocket({ quiet = false } = {}) {
        const out = document.getElementById('ob-import-result');
        try {
            const res = await fetch('/api/obs-borders/obs-sync', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'OBS sync failed');
            studioState = data.state;
            obsFilterStatuses = data.filterStatuses || {};
            obsByScene = data.byScene || {};
            currentProgramScene = data.currentProgramScene || '';
            obsConnected = true;
            hasSyncedObsOnce = true;
            renderSourceList();
            if (out) {
                out.textContent = `Live OBS synced: ${data.sourcesCount} visual sources across ${data.scenesCount} scenes (program scene: ${data.currentProgramScene || '—'}).`;
            }
            if (!quiet) showToast('Synced scenes & sources from live OBS');
        } catch (err) {
            if (out && !quiet) out.textContent = err.message || 'OBS sync failed';
            if (!quiet) showToast(err.message || 'OBS sync failed');
        }
    }

    async function applyFiltersInObs(targets, action = 'apply') {
        const out = document.getElementById('ob-import-result');
        const disableLegacyShaders = Boolean(document.getElementById('ob-disable-legacy-shaders')?.checked);
        try {
            const res = await fetch('/api/obs-borders/obs-apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targets, action, disableLegacyShaders })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Operation failed');
            const firstErr = (data.results || []).find(r => !r.ok)?.error;
            const verb = action === 'remove' ? 'Removed' : 'Applied';
            if (out) {
                out.textContent = firstErr
                    ? `${verb} ${data.applied}/${data.total} sources. Note: ${firstErr}`
                    : `${verb} StreamPulse Border filter on ${data.applied}/${data.total} OBS sources.`;
            }
            showToast(`${verb} filter on ${data.applied}/${data.total} OBS sources`);
            await syncFromObsWebSocket({ quiet: true });
        } catch (err) {
            if (out) out.textContent = err.message || 'Operation failed';
            showToast(err.message || 'Operation failed');
        }
    }

    async function loadStudioData() {
        try {
            const varsPromise = window.WizardVariableBinder?.fetchVariables
                ? window.WizardVariableBinder.fetchVariables(false).catch(() => null)
                : fetch('/api/variables', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
            const [bordersRes, vData] = await Promise.all([
                fetch('/api/obs-borders', { cache: 'no-store' }),
                varsPromise
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
            if (vData && typeof vData === 'object') {
                variableValues = vData.values || {};
                if (typeof vData.variableSettingsEnabled === 'boolean') {
                    variableSettingsEnabled = vData.variableSettingsEnabled;
                }
            }
            initVariableBinderOnce();
            renderProfileSelector();
            populateFormFromProfile();
            syncTransformLockControls();
            renderSetupInfo();
            await refreshObsStatus({ autoSyncIfConnected: activeTab === 'sources' });
        } catch (err) {
            console.error('[ObsBorders] Failed to load:', err);
            showToast('Failed to load OBS Border Studio data');
        }
    }

    function syncTransformLockControls() {
        const tl = studioState?.transformLock || { enabled: false, mode: 'outer-border' };
        const en = document.getElementById('ob-tx-lock-enabled');
        const md = document.getElementById('ob-tx-lock-mode');
        if (en) en.checked = Boolean(tl.enabled);
        if (md) {
            md.value = tl.mode === 'content' ? 'content' : 'outer-border';
            md.disabled = !tl.enabled;
        }
    }

    async function persistTransformLock() {
        const enabled = Boolean(document.getElementById('ob-tx-lock-enabled')?.checked);
        const mode = document.getElementById('ob-tx-lock-mode')?.value === 'content' ? 'content' : 'outer-border';
        const md = document.getElementById('ob-tx-lock-mode');
        if (md) md.disabled = !enabled;
        try {
            const res = await fetch('/api/obs-borders/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transformLock: { enabled, mode } })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.state) studioState = data.state;
                showToast(enabled ? `OBS Transform Auto-Align enabled (${mode === 'content' ? 'Inner Content' : 'Outer Border'})` : 'OBS Transform Auto-Align disabled');
            }
        } catch (err) {
            console.error('[ObsBorders] Failed to save transformLock:', err);
        }
    }

    async function saveWorkingProfile({ setActive = false } = {}) {
        if (!workingProfile) return;
        syncWorkingProfileFromDom();
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
            renderSourceList();
            renderSetupInfo();
            if (obsConnected) syncFromObsWebSocket({ quiet: true });
            showToast('Saved & synced to OBS manifest');
        } catch (err) {
            showToast(err.message || 'Save failed');
        }
    }

    function bindColorPair(textId, pickId) {
        const textEl = document.getElementById(textId);
        const pickEl = document.getElementById(pickId);
        if (!textEl || !pickEl) return;
        pickEl.addEventListener('input', () => {
            textEl.value = pickEl.value.toUpperCase() + 'FF';
            syncWorkingProfileFromDom();
        });
        textEl.addEventListener('input', () => {
            syncColorPicker(textId, pickId);
            syncWorkingProfileFromDom();
        });
    }

    function bindFormListeners() {
        const pane = document.getElementById('ob-pane-designer');
        if (pane) {
            pane.addEventListener('input', (e) => {
                if (e.target.id === 'ob-profile-select') return;
                syncWorkingProfileFromDom();
            });
            pane.addEventListener('change', (e) => {
                if (e.target.id === 'ob-profile-select') return;
                if (e.target.id === 'ob-per-corner') {
                    document.getElementById('ob-radius-uniform-wrap').hidden = e.target.checked;
                    document.getElementById('ob-radius-percorner-wrap').hidden = !e.target.checked;
                }
                syncWorkingProfileFromDom();
            });

            // Shift + ArrowUp / ArrowDown fast numeric nudge on all <input type="number">
            pane.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' && e.target.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    if (e.shiftKey) {
                        e.preventDefault();
                        const step = (Number(e.target.step) || 1) * 10;
                        const min = e.target.min !== '' ? Number(e.target.min) : -Infinity;
                        const max = e.target.max !== '' ? Number(e.target.max) : Infinity;
                        const cur = Number(e.target.value) || 0;
                        const next = Math.max(min, Math.min(max, cur + (e.key === 'ArrowUp' ? step : -step)));
                        e.target.value = String(next);
                        e.target.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            });
        }

        // Segmented controls (Border Placement + Animation Direction)
        document.getElementById('ob-placement-seg')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-placement]');
            if (!btn || !workingProfile) return;
            const val = btn.dataset.placement;
            workingProfile.placement = val;
            setSegPressed('ob-placement-seg', 'data-placement', val);
            const hintEl = document.getElementById('ob-placement-hint');
            if (hintEl) hintEl.textContent = PLACEMENT_HINTS[val] || '';
            updatePadFieldVisibility(val, workingProfile.autoPad !== false);
            updateDirtyIndicators();
            schedulePreviewDraw();
        });

        document.getElementById('ob-anim-dir-seg')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-dir]');
            if (!btn || !workingProfile) return;
            const val = btn.dataset.dir;
            workingProfile.animation.direction = val;
            setSegPressed('ob-anim-dir-seg', 'data-dir', val);
            updateDirtyIndicators();
            schedulePreviewDraw();
        });

        bindColorPair('ob-inner-c1', 'ob-inner-c1-pick');
        bindColorPair('ob-inner-c2', 'ob-inner-c2-pick');
        bindColorPair('ob-outer-c1', 'ob-outer-c1-pick');
        bindColorPair('ob-outer-c2', 'ob-outer-c2-pick');
        bindColorPair('ob-glow-color', 'ob-glow-color-pick');
        bindColorPair('ob-shadow-color', 'ob-shadow-color-pick');
        bindColorPair('ob-anim-c2', 'ob-anim-c2-pick');
        bindColorPair('ob-bg-c1', 'ob-bg-c1-pick');
        bindColorPair('ob-bg-c2', 'ob-bg-c2-pick');
        bindColorPair('ob-bg-icon-color', 'ob-bg-icon-color-pick');

        document.getElementById('ob-tx-lock-enabled')?.addEventListener('change', persistTransformLock);
        document.getElementById('ob-tx-lock-mode')?.addEventListener('change', persistTransformLock);

        document.getElementById('ob-btn-expand-all')?.addEventListener('click', expandAllGroups);
        document.getElementById('ob-btn-collapse-all')?.addEventListener('click', collapseAllGroups);

        window.addEventListener('hashchange', () => {
            const h = parseTabFromHash();
            if (h && h !== activeTab) switchTab(h, { updateHash: false });
        });

        document.getElementById('ob-preview-guides')?.addEventListener('change', (e) => {
            showGuides = e.target.checked;
            schedulePreviewDraw();
        });

        document.getElementById('ob-view-seg')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-view]');
            if (!btn) return;
            sourceViewMode = btn.dataset.view;
            try { localStorage.setItem(VIEW_STORAGE_KEY, sourceViewMode); } catch {}
            renderSourceList();
        });

        document.getElementById('ob-source-filter-chips')?.addEventListener('click', (e) => {
            const chip = e.target.closest('button[data-filter]');
            if (!chip) return;
            sourceFilter = chip.dataset.filter;
            try { localStorage.setItem(FILTER_STORAGE_KEY, sourceFilter); } catch {}
            renderSourceList();
        });

        document.getElementById('ob-source-search')?.addEventListener('input', renderSourceList);

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
                renderSourceList();
                showToast('Profile deleted');
            } catch (err) {
                showToast(err.message || 'Delete failed');
            }
        });

        document.getElementById('ob-btn-copy-lua-path')?.addEventListener('click', async () => {
            if (!studioState?.luaScriptPath) return;
            try {
                await navigator.clipboard.writeText(studioState.luaScriptPath);
                showToast('Canonical Lua script path copied');
            } catch {
                showToast(studioState.luaScriptPath);
            }
        });

        document.getElementById('ob-btn-reset-defaults')?.addEventListener('click', async () => {
            if (!confirm('Reset all Border Profiles and Assignments back to defaults?')) return;
            try {
                const res = await fetch('/api/obs-borders/reset-defaults', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Reset failed');
                studioState = data.state;
                selectedProfileId = studioState.activeProfileId;
                workingProfile = cloneProfile(studioState.profiles[0]);
                renderProfileSelector();
                populateFormFromProfile();
                await syncFromObsWebSocket({ quiet: true });
                showToast('Reset to defaults');
            } catch (err) {
                showToast(err.message || 'Reset failed');
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
                renderSourceList();
                showToast(`Imported ${data.sourcesCount} sources from "${data.collectionName}"`);
            } catch (err) {
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
                renderSourceList();
                showToast(`Imported ${data.sourcesCount} sources from "${data.collectionName}"`);
            } catch (err) {
                showToast(err.message || 'Invalid JSON file');
            }
        });

        document.getElementById('ob-btn-refresh-manifest')?.addEventListener('click', refreshManifestPreview);
        document.getElementById('ob-btn-obs-sync')?.addEventListener('click', () => syncFromObsWebSocket({ quiet: false }));
        document.getElementById('ob-btn-obs-apply-all')?.addEventListener('click', () => {
            const assignedTargets = Object.entries(studioState?.assignments || {})
                .filter(([, cfg]) => (cfg.defaultProfileId && cfg.defaultProfileId !== 'none') || Object.keys(cfg.sceneOverrides || {}).length > 0)
                .map(([name]) => name);
            if (!assignedTargets.length) {
                showToast('Assign at least one source to a border profile first');
                return;
            }
            applyFiltersInObs(assignedTargets, 'apply');
        });

        document.querySelectorAll('[data-ob-tab]').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.obTab));
        });

        document.querySelectorAll('#ob-inspector-tabs [data-ob-inspector]').forEach(btn => {
            btn.addEventListener('click', () => switchInspectorTab(btn.dataset.obInspector));
        });

        try {
            const savedAdv = JSON.parse(localStorage.getItem(ADV_STORAGE_KEY) || '{}');
            document.querySelectorAll('#ob-pane-designer details.ob-adv-details[data-adv-key]').forEach(det => {
                const k = det.dataset.advKey;
                if (typeof savedAdv[k] === 'boolean') det.open = savedAdv[k];
                det.addEventListener('toggle', () => {
                    try {
                        const cur = JSON.parse(localStorage.getItem(ADV_STORAGE_KEY) || '{}');
                        cur[k] = det.open;
                        localStorage.setItem(ADV_STORAGE_KEY, JSON.stringify(cur));
                    } catch {}
                });
            });
        } catch {}

        document.getElementById('ob-btn-preview-pause')?.addEventListener('click', () => {
            const now = performance.now();
            if (!previewPaused) {
                pausedElapsedMs = Math.max(0, now - animOriginMs);
                previewPaused = true;
            } else {
                animOriginMs = now - pausedElapsedMs;
                previewPaused = false;
            }
            updatePreviewPauseButtonUI();
            schedulePreviewDraw();
        });

        document.getElementById('ob-btn-preview-restart')?.addEventListener('click', () => {
            pausedElapsedMs = 0;
            animOriginMs = performance.now();
            schedulePreviewDraw();
        });

        document.getElementById('ob-btn-preview-save')?.addEventListener('click', () => saveWorkingProfile());

        document.querySelectorAll('#ob-preview-bg-chips .ob-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.bg === previewBg);
            chip.addEventListener('click', () => {
                previewBg = chip.dataset.bg;
                try { localStorage.setItem(BG_STORAGE_KEY, previewBg); } catch {}
                document.querySelectorAll('#ob-preview-bg-chips .ob-chip').forEach(c => c.classList.toggle('active', c === chip));
                glLastBgMode = '';
                schedulePreviewDraw();
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopPreviewAnim();
            else schedulePreviewDraw();
        });
        window.addEventListener('pagehide', stopPreviewAnim);
        window.addEventListener('pageshow', schedulePreviewDraw);

        let lastFocusSyncMs = 0;
        window.addEventListener('focus', () => {
            if (activeTab === 'sources' && obsConnected && (Date.now() - lastFocusSyncMs) > 30000) {
                lastFocusSyncMs = Date.now();
                syncFromObsWebSocket({ quiet: true });
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        populateStyleSelects();
        bindFormListeners();
        switchInspectorTab(activeInspectorTab);
        updatePreviewPauseButtonUI();
        switchTab(activeTab);
        loadStudioData();
    });
})();
