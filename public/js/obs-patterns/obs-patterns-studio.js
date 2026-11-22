(function () {
    'use strict';

    const TAB_STORAGE_KEY = 'streampulse:obs-patterns:tab';
    const INSPECTOR_TAB_KEY = 'streampulse:obs-patterns:inspector-tab';
    const ADV_STORAGE_KEY = 'streampulse:obs-patterns:adv-open';
    const BG_STORAGE_KEY = 'streampulse:obs-patterns:bg';
    const VIEW_STORAGE_KEY = 'streampulse:obs-patterns:view';

    const CAT = window.StreamPulsePatternCatalog || {};
    const PATTERN_CATEGORIES = Array.isArray(CAT.PATTERN_CATEGORIES) ? CAT.PATTERN_CATEGORIES : [];
    const PATTERN_CAPABILITIES = CAT.PATTERN_CAPABILITIES || {};
    const PATTERN_CODE_MAP = CAT.PATTERN_CODE_MAP || { hexagons: 3 };
    const ANALYTIC_GPU_SET = new Set(Array.isArray(CAT.ANALYTIC_GPU_PRESETS) ? CAT.ANALYTIC_GPU_PRESETS : []);
    const PALETTES = CAT.PALETTES || {};
    const PALETTE_OPTIONS = Array.isArray(CAT.PALETTE_OPTIONS) ? CAT.PALETTE_OPTIONS : [['dual', 'Custom Two-Tone']];
    const SNOWFLAKE_STYLES = Array.isArray(CAT.SNOWFLAKE_STYLES) ? CAT.SNOWFLAKE_STYLES : ['all', 'dendrite', 'plate', 'fern', 'rosette', 'cross', 'needle'];
    const TILE_LAYOUTS = Array.isArray(CAT.TILE_LAYOUTS) ? CAT.TILE_LAYOUTS : [];
    const TILE_SYMMETRY_MODES = Array.isArray(CAT.TILE_SYMMETRY_MODES) ? CAT.TILE_SYMMETRY_MODES : [];
    const TILE_MOTIONS = Array.isArray(CAT.TILE_MOTIONS) ? CAT.TILE_MOTIONS : [];
    const TILE_HUE_MODES = Array.isArray(CAT.TILE_HUE_MODES) ? CAT.TILE_HUE_MODES : [];
    const TILE_PALETTE_STYLES = Array.isArray(CAT.TILE_PALETTE_STYLES) ? CAT.TILE_PALETTE_STYLES : [];
    const TILE_PALETTE_BLENDS = Array.isArray(CAT.TILE_PALETTE_BLENDS) ? CAT.TILE_PALETTE_BLENDS : [];
    const TILE_DISTRIBUTIONS = Array.isArray(CAT.TILE_DISTRIBUTIONS) ? CAT.TILE_DISTRIBUTIONS : [];
    const TILE_ALTERNATE_FLIPS = Array.isArray(CAT.TILE_ALTERNATE_FLIPS) ? CAT.TILE_ALTERNATE_FLIPS : [];
    const TILE_TRACK_MODES = Array.isArray(CAT.TILE_TRACK_MODES) ? CAT.TILE_TRACK_MODES : [];
    const TILE_SPIN_DIRECTIONS = Array.isArray(CAT.TILE_SPIN_DIRECTIONS) ? CAT.TILE_SPIN_DIRECTIONS : [];
    const PROCEDURAL_MOTIONS = Array.isArray(CAT.PROCEDURAL_MOTIONS) ? CAT.PROCEDURAL_MOTIONS : [];
    const PROCEDURAL_COLOR_MODES = Array.isArray(CAT.PROCEDURAL_COLOR_MODES) ? CAT.PROCEDURAL_COLOR_MODES : [];
    const PROCEDURAL_COLOR_ANIMS = Array.isArray(CAT.PROCEDURAL_COLOR_ANIMS) ? CAT.PROCEDURAL_COLOR_ANIMS : [];
    const PROCEDURAL_IN_PLACE_MODES = Array.isArray(CAT.PROCEDURAL_IN_PLACE_MODES) ? CAT.PROCEDURAL_IN_PLACE_MODES : [];
    const PROCEDURAL_FILL_MODES = Array.isArray(CAT.PROCEDURAL_FILL_MODES) ? CAT.PROCEDURAL_FILL_MODES : [];
    const PROCEDURAL_PAN_DIRECTIONS = Array.isArray(CAT.PROCEDURAL_PAN_DIRECTIONS) ? CAT.PROCEDURAL_PAN_DIRECTIONS : [];
    const PROCEDURAL_SPIN_MODES = Array.isArray(CAT.PROCEDURAL_SPIN_MODES) ? CAT.PROCEDURAL_SPIN_MODES : [];
    const BACKGROUND_TYPES = Array.isArray(CAT.BACKGROUND_TYPES) ? CAT.BACKGROUND_TYPES : [];
    const BG_TYPE_CODE_MAP = CAT.BG_TYPE_CODE_MAP || { transparent: 0, solid: 1, linear: 2, radial: 3, conic: 4 };
    const BG_MOTION_MODES = Array.isArray(CAT.BG_MOTION_MODES) ? CAT.BG_MOTION_MODES : [];
    const BG_MOTION_CODE_MAP = CAT.BG_MOTION_CODE_MAP || { none: 0, rotate: 1, pulse: 2, shift: 3 };
    const GPU_FILTER_PRESETS = Array.isArray(CAT.GPU_FILTER_PRESETS) ? CAT.GPU_FILTER_PRESETS : [];

    const TILE_LAYOUT_CODE_MAP = CAT.TILE_LAYOUT_CODE_MAP || { grid: 0, brick: 1, stagger: 2, alternating: 3, checkerboard: 4 };
    const TILE_SYMMETRY_CODE_MAP = CAT.TILE_SYMMETRY_CODE_MAP || { none: 0, quad: 1, radial: 2 };
    const TILE_MOTION_CODE_MAP = CAT.TILE_MOTION_CODE_MAP || { none: 0, scroll: 1 };
    const TILE_HUE_CODE_MAP = CAT.TILE_HUE_CODE_MAP || { none: 0, cycle: 1 };
    const TILE_COLOR_SOURCE_CODE_MAP = CAT.TILE_COLOR_SOURCE_CODE_MAP || { hue: 0, palette: 1 };
    const TILE_PALETTE_STYLE_CODE_MAP = CAT.TILE_PALETTE_STYLE_CODE_MAP || { 'per-tile': 0, gradient: 1 };
    const TILE_PALETTE_BLEND_CODE_MAP = CAT.TILE_PALETTE_BLEND_CODE_MAP || { multiply: 0, recolor: 1 };
    const TILE_DIST_CODE_MAP = CAT.TILE_DIST_CODE_MAP || { diagonal: 0, row: 1, col: 2, grid: 3, random: 4 };
    const TILE_ALT_FLIP_CODE_MAP = CAT.TILE_ALT_FLIP_CODE_MAP || { tilt: 0, h: 1, v: 2, both: 3, none: 4 };
    const TILE_TRACK_CODE_MAP = CAT.TILE_TRACK_CODE_MAP || { uniform: 0 };
    const TILE_SPIN_DIR_CODE_MAP = CAT.TILE_SPIN_DIR_CODE_MAP || { cw: 0, ccw: 1, alternate: 2 };
    const PROC_MOTION_CODE_MAP = CAT.PROCEDURAL_MOTION_CODE_MAP || { none: 0, drift: 1, pan: 8 };
    const PROC_CMODE_CODE_MAP = CAT.PROCEDURAL_COLOR_MODE_CODE_MAP || { mosaic: 0 };
    const PROC_CANIM_CODE_MAP = CAT.PROCEDURAL_COLOR_ANIM_CODE_MAP || { none: 0, cycle: 1, breathe: 2 };
    const PROC_INPLACE_CODE_MAP = CAT.PROCEDURAL_IN_PLACE_CODE_MAP || { none: 0, auto: 1, pulse: 2, gentle: 3, sparkle: 4 };
    const PROC_FILL_CODE_MAP = CAT.PROCEDURAL_FILL_MODE_CODE_MAP || { tinted: 0, solid: 1, outline: 2 };

    const VAR_TOKEN_RE = /^(?:var:([a-z0-9_.]+)(?:\|(.*))?|\{\{\s*var\.([a-z0-9_.]+)\s*(?:\|([^{}]*?))?\s*\}\})$/i;

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
    let obsConnected = false;
    let currentProgramScene = '';
    let activeTab = parseTabFromHash() || localStorage.getItem(TAB_STORAGE_KEY) || 'sources';
    let activeInspectorTab = localStorage.getItem(INSPECTOR_TAB_KEY) || 'canvas';
    let previewBg = localStorage.getItem(BG_STORAGE_KEY) || 'dark';
    let listViewMode = localStorage.getItem(VIEW_STORAGE_KEY) || 'sources';
    const expandedGroups = new Set();
    let isPopulating = false;
    let varBinderMounted = false;
    let animFrameId = null;
    let animOriginMs = performance.now();
    let previewPaused = false;
    let pausedElapsedMs = 0;

    function showToast(msg) {
        const el = document.getElementById('op-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => el.classList.remove('show'), 2600);
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function resolveToken(raw, fallback) {
        if (typeof raw === 'string') {
            const m = raw.trim().match(VAR_TOKEN_RE);
            if (m) {
                const key = (m[1] || m[3] || '').toLowerCase();
                const fb = (m[2] !== undefined ? m[2] : m[4]) ?? '';
                if (variableSettingsEnabled && variableValues[key] !== undefined && String(variableValues[key]).trim() !== '') {
                    return String(variableValues[key]).trim();
                }
                return fb !== '' ? fb : fallback;
            }
        }
        return raw !== undefined && raw !== null && raw !== '' ? raw : fallback;
    }

    function resolveNum(raw, fallback, min, max) {
        const v = Number(resolveToken(raw, fallback));
        return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
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
        if (h.length >= 6) return '#' + h.slice(0, 6);
        return '#ffffff';
    }

    function cloneProfile(p) {
        return JSON.parse(JSON.stringify(p));
    }

    function setControlValue(id, rawVal, fallback, { isColor = false } = {}) {
        const el = document.getElementById(id);
        if (!el) return;
        const rawStr = rawVal === undefined || rawVal === null ? '' : String(rawVal);
        if (VAR_TOKEN_RE.test(rawStr.trim())) {
            el.dataset.varToken = rawStr.trim();
            const resolved = resolveToken(rawStr, fallback);
            el.value = isColor ? resolved : String(Number(resolved) || fallback);
        } else {
            if (el.dataset.varToken) delete el.dataset.varToken;
            el.value = rawStr !== '' ? rawStr : String(fallback ?? '');
        }
    }

    function syncColorPicker(textId, pickId) {
        const t = document.getElementById(textId);
        const p = document.getElementById(pickId);
        if (t && p) p.value = colorPickHex(t.dataset.varToken || t.value);
    }

    function getFieldRawValue(id, fallback) {
        if (window.WizardVariableBinder) {
            const v = window.WizardVariableBinder.readValue(id);
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return document.getElementById(id)?.value ?? fallback;
    }

    function populateSelects() {
        const presetSel = document.getElementById('op-proc-preset');
        if (presetSel) {
            presetSel.innerHTML = PATTERN_CATEGORIES.map(g =>
                `<optgroup label="${escapeHtml(g.group)}">${g.options.map(([id, lbl]) => `<option value="${escapeHtml(id)}">${escapeHtml(lbl)}</option>`).join('')}</optgroup>`
            ).join('');
        }
        const paletteOptsHtml = PALETTE_OPTIONS.map(([id, lbl]) =>
            `<option value="${escapeHtml(id)}">${escapeHtml(lbl)}</option>`
        ).join('');
        const importPresetHtml = '<option value="">Copy Preset…</option>' + PALETTE_OPTIONS
            .filter(([id]) => id !== 'dual' && id !== 'custom' && Array.isArray(PALETTES[id]))
            .map(([id, lbl]) => `<option value="${escapeHtml(id)}">${escapeHtml(lbl)}</option>`)
            .join('');
        for (const id of ['op-proc-palette', 'op-tile-palette']) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = paletteOptsHtml;
        }
        for (const id of ['op-custom-pal-import', 'op-tile-custom-pal-import']) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = importPresetHtml;
        }
        const snowSel = document.getElementById('op-proc-snow-style');
        if (snowSel) {
            const labels = {
                all: 'Mixed Variety (All 6 Styles)',
                dendrite: 'Classic 6-Point Dendrite',
                plate: 'Hexagonal Crystal Plate',
                fern: 'Stellar Fern Dendrite',
                rosette: 'Geometric Rosette Star',
                cross: 'Sharp Crystal Cross',
                needle: 'Faceted Ice Needles'
            };
            snowSel.innerHTML = SNOWFLAKE_STYLES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(labels[s] || s)}</option>`).join('');
        }
        const fillOpts = (id, list) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = list.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('');
        };
        fillOpts('op-bg-type', BACKGROUND_TYPES);
        fillOpts('op-bg-motion', BG_MOTION_MODES);
        fillOpts('op-proc-fill-mode', PROCEDURAL_FILL_MODES);
        fillOpts('op-proc-cmode', PROCEDURAL_COLOR_MODES);
        fillOpts('op-proc-canim', PROCEDURAL_COLOR_ANIMS);
        fillOpts('op-proc-motion', PROCEDURAL_MOTIONS);
        fillOpts('op-proc-pan-dir', PROCEDURAL_PAN_DIRECTIONS);
        fillOpts('op-proc-inplace', PROCEDURAL_IN_PLACE_MODES);
        fillOpts('op-proc-spin', PROCEDURAL_SPIN_MODES);
        fillOpts('op-tile-dist', TILE_DISTRIBUTIONS);
        fillOpts('op-tile-layout', TILE_LAYOUTS);
        fillOpts('op-tile-symmetry', TILE_SYMMETRY_MODES);
        fillOpts('op-tile-alt-flip', TILE_ALTERNATE_FLIPS);
        fillOpts('op-tile-motion', TILE_MOTIONS);
        fillOpts('op-tile-track-mode', TILE_TRACK_MODES);
        fillOpts('op-tile-spin-dir', TILE_SPIN_DIRECTIONS);
        fillOpts('op-tile-hue-mode', TILE_HUE_MODES);
        fillOpts('op-tile-cmode', PROCEDURAL_COLOR_MODES);
        fillOpts('op-tile-canim', PROCEDURAL_COLOR_ANIMS);
        fillOpts('op-tile-pal-style', TILE_PALETTE_STYLES);
        fillOpts('op-tile-pal-blend', TILE_PALETTE_BLENDS);
        const fltSel = document.getElementById('op-flt-preset');
        if (fltSel) {
            fltSel.innerHTML = `<option value="">Custom / Manual</option>` + GPU_FILTER_PRESETS.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`).join('');
        }
    }

    function renderBgGradientBar(p) {
        const bar = document.getElementById('op-bg-gradient-bar');
        if (!bar || !p) return;
        const bt = p.bgType || 'solid';
        const showGrad = bt === 'linear' || bt === 'radial' || bt === 'conic';
        bar.hidden = !showGrad;
        if (!showGrad) return;
        const c1 = resolveColor(p.bgColor, '#0B101BFF').slice(0, 7);
        const c2 = resolveColor(p.bgColor2, '#1E1B4BFF').slice(0, 7);
        const c3 = resolveColor(p.bgColor3, '#0F766EFF').slice(0, 7);
        const stops = p.bgUseMid ? `${c1}, ${c3}, ${c2}` : `${c1}, ${c2}`;
        bar.style.background = `linear-gradient(90deg, ${stops})`;
    }

    function updateBackgroundVisibility() {
        const p = workingProfile;
        if (!p) return;
        const bt = p.bgType || 'solid';
        const isTransparent = bt === 'transparent';
        const isGrad = bt === 'linear' || bt === 'radial' || bt === 'conic';
        const isOrigin = bt === 'radial' || bt === 'conic';
        const hasVig = VAR_TOKEN_RE.test(String(p.vignette ?? '')) || resolveNum(p.vignette, 0, 0, 100) > 0;
        const setHidden = (id, h) => { const el = document.getElementById(id); if (el) el.hidden = Boolean(h); };
        setHidden('op-bg-colors-wrap', isTransparent);
        setHidden('op-bg-c2-wrap', !isGrad);
        setHidden('op-bg-grad-opts', !isGrad);
        setHidden('op-bg-c3-wrap', !isGrad || !p.bgUseMid);
        setHidden('op-bg-origin-wrap', !isOrigin);
        setHidden('op-bg-radius-wrap', bt !== 'radial');
        setHidden('op-bg-angle-wrap', bt === 'radial');
        setHidden('op-bg-motion-speed-wrap', !isGrad || (p.bgMotion || 'none') === 'none');
        setHidden('op-vignette-color-wrap', !hasVig);
        const c1Lbl = document.getElementById('op-bg-c1-label');
        if (c1Lbl) c1Lbl.textContent = isGrad ? 'Gradient Start Color' : 'Background Color';
        renderBgGradientBar(p);
    }

    function ensureCustomColors(pr) {
        if (!pr) return ['#EF4444FF', '#22C55EFF', '#FACC15FF', '#3B82F6FF'];
        if (!Array.isArray(pr.customColors) || pr.customColors.length < 2) {
            pr.customColors = ['#EF4444FF', '#22C55EFF', '#FACC15FF', '#3B82F6FF'];
        }
        pr.customColors = pr.customColors.slice(0, 7).map(c => {
            const clean = String(c || '#58A6FFFF').trim().toUpperCase();
            if (/^#[0-9A-F]{6}$/.test(clean)) return clean + 'FF';
            if (/^#[0-9A-F]{8}$/.test(clean)) return clean;
            return clean.startsWith('$') ? clean : '#58A6FFFF';
        });
        return pr.customColors;
    }

    function getActivePaletteHexList(pr) {
        const palName = pr?.palette || 'dual';
        if (palName === 'custom') {
            return ensureCustomColors(pr).map(c => resolveColor(c, '#58A6FF').slice(0, 7));
        }
        if (palName !== 'dual' && Array.isArray(PALETTES[palName])) {
            return PALETTES[palName];
        }
        return [
            resolveColor(pr?.accent, '#58A6FF').slice(0, 7),
            resolveColor(pr?.secondary, '#A855F7').slice(0, 7)
        ];
    }

    const PALETTE_UI = {
        procedural: {
            selectId: 'op-proc-palette',
            barId: 'op-palette-bar',
            dualWrapId: 'op-proc-dual-colors',
            editorId: 'op-custom-palette-editor',
            customizeBtnId: 'op-pal-customize-btn',
            stopsId: 'op-custom-pal-stops',
            addBtnId: 'op-custom-pal-add',
            reverseBtnId: 'op-custom-pal-reverse',
            shuffleBtnId: 'op-custom-pal-shuffle',
            importSelId: 'op-custom-pal-import',
            saveNameId: 'op-custom-pal-name',
            saveBtnId: 'op-custom-pal-save-btn',
            savedRowId: 'op-saved-palettes-row',
            accentId: 'op-proc-accent',
            accentPickId: 'op-proc-accent-pick',
            secondaryId: 'op-proc-secondary',
            secondaryPickId: 'op-proc-secondary-pick',
            rebake: () => scheduleProceduralRebake()
        },
        tiles: {
            selectId: 'op-tile-palette',
            barId: 'op-tile-palette-bar',
            dualWrapId: 'op-tile-dual-colors',
            editorId: 'op-tile-custom-palette-editor',
            customizeBtnId: 'op-tile-pal-customize-btn',
            stopsId: 'op-tile-custom-pal-stops',
            addBtnId: 'op-tile-custom-pal-add',
            reverseBtnId: 'op-tile-custom-pal-reverse',
            shuffleBtnId: 'op-tile-custom-pal-shuffle',
            importSelId: 'op-tile-custom-pal-import',
            saveNameId: 'op-tile-custom-pal-name',
            saveBtnId: 'op-tile-custom-pal-save-btn',
            savedRowId: 'op-tile-saved-palettes-row',
            accentId: 'op-tile-accent',
            accentPickId: 'op-tile-accent-pick',
            secondaryId: 'op-tile-secondary',
            secondaryPickId: 'op-tile-secondary-pick',
            rebake: () => {}
        }
    };

    function getPaletteTarget(scope = 'procedural') {
        if (!workingProfile) return null;
        return scope === 'tiles'
            ? (workingProfile.tiles = workingProfile.tiles || {})
            : (workingProfile.procedural = workingProfile.procedural || {});
    }

    function renderPaletteBar(prOrName, accentHex, secondaryHex, barId = 'op-palette-bar') {
        const bar = document.getElementById(barId);
        if (!bar) return;
        let colors;
        if (prOrName && typeof prOrName === 'object') {
            colors = getActivePaletteHexList(prOrName);
        } else {
            colors = (prOrName && prOrName !== 'dual' && Array.isArray(PALETTES[prOrName]))
                ? PALETTES[prOrName]
                : [resolveColor(accentHex, '#58A6FF').slice(0, 7), resolveColor(secondaryHex, '#A855F7').slice(0, 7)];
        }
        bar.innerHTML = colors.map(c => `<span style="flex:1;background:${escapeHtml(c)};height:100%;"></span>`).join('');
    }

    function renderCustomPaletteStops(scope = 'procedural') {
        const ui = PALETTE_UI[scope] || PALETTE_UI.procedural;
        const container = document.getElementById(ui.stopsId);
        const target = getPaletteTarget(scope);
        if (!container || !target) return;
        const colors = ensureCustomColors(target);
        container.innerHTML = colors.map((col, idx) => {
            const hex7 = resolveColor(col, '#58A6FF').slice(0, 7);
            const canDel = colors.length > 2;
            return `<div class="op-pal-stop" data-stop-idx="${idx}">
                <input type="color" class="op-stop-pick" value="${escapeHtml(hex7)}" title="Color stop ${idx + 1}">
                <input type="text" class="op-stop-hex" value="${escapeHtml(col)}" maxlength="36" aria-label="Color stop ${idx + 1}">
                ${canDel ? `<button type="button" class="op-pal-stop-del" title="Remove stop ${idx + 1}" aria-label="Remove stop ${idx + 1}"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
            </div>`;
        }).join('');

        container.querySelectorAll('.op-pal-stop').forEach(row => {
            const idx = Number(row.dataset.stopIdx);
            const pick = row.querySelector('.op-stop-pick');
            const hex = row.querySelector('.op-stop-hex');
            const del = row.querySelector('.op-pal-stop-del');
            pick?.addEventListener('input', () => {
                const v = pick.value.toUpperCase() + 'FF';
                target.customColors[idx] = v;
                if (hex) hex.value = v;
                renderPaletteBar(target, null, null, ui.barId);
                schedulePreviewDraw();
                ui.rebake();
            });
            hex?.addEventListener('input', () => {
                const raw = hex.value.trim();
                target.customColors[idx] = raw;
                const resolved = resolveColor(raw, '#58A6FF');
                if (pick && /^#[0-9A-Fa-f]{6}/.test(resolved)) pick.value = resolved.slice(0, 7);
                renderPaletteBar(target, null, null, ui.barId);
                schedulePreviewDraw();
                ui.rebake();
            });
            del?.addEventListener('click', () => {
                if (target.customColors.length <= 2) return;
                target.customColors.splice(idx, 1);
                renderCustomPaletteStops(scope);
                renderPaletteBar(target, null, null, ui.barId);
                schedulePreviewDraw();
                ui.rebake();
            });
        });

        const addBtn = document.getElementById(ui.addBtnId);
        if (addBtn) addBtn.disabled = colors.length >= 7;
        renderSavedPalettesRow(scope);
    }

    function renderSavedPalettesRow(scope = 'procedural') {
        const ui = PALETTE_UI[scope] || PALETTE_UI.procedural;
        const row = document.getElementById(ui.savedRowId);
        if (!row) return;
        const list = Array.isArray(studioState?.customPalettes) ? studioState.customPalettes : [];
        row.hidden = list.length === 0;
        if (!list.length) {
            row.innerHTML = '';
            return;
        }
        row.innerHTML = list.map(entry => {
            const dots = (entry.colors || []).slice(0, 7).map(c =>
                `<i style="background:${escapeHtml(resolveColor(c, '#58A6FF').slice(0, 7))};"></i>`
            ).join('');
            return `<div class="op-saved-pal-chip" data-pal-id="${escapeHtml(entry.id)}" title="Apply saved palette: ${escapeHtml(entry.name)}">
                <span class="op-saved-pal-dots">${dots}</span>
                <span>${escapeHtml(entry.name)}</span>
                <button type="button" class="op-pal-stop-del" data-del-pal="${escapeHtml(entry.id)}" title="Delete saved palette" aria-label="Delete saved palette ${escapeHtml(entry.name)}"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>`;
        }).join('');

        row.querySelectorAll('.op-saved-pal-chip').forEach(chip => {
            const pid = chip.dataset.palId;
            chip.addEventListener('click', (e) => {
                if (e.target.closest('[data-del-pal]')) return;
                const found = list.find(x => x.id === pid);
                const target = getPaletteTarget(scope);
                if (!found || !target) return;
                target.palette = 'custom';
                target.customColors = [...found.colors];
                const palSel = document.getElementById(ui.selectId);
                if (palSel) palSel.value = 'custom';
                renderCustomPaletteStops(scope);
                syncWorkingProfileFromDom();
            });
        });
        row.querySelectorAll('[data-del-pal]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pid = btn.dataset.delPal;
                try {
                    const res = await fetch(`/api/obs-patterns/palette/${encodeURIComponent(pid)}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (res.ok && data.state) {
                        studioState = data.state;
                        renderSavedPalettesRow('procedural');
                        renderSavedPalettesRow('tiles');
                        showToast('Deleted saved palette');
                    }
                } catch {}
            });
        });
    }

    function updateProceduralControlVisibility() {
        const pr = workingProfile?.procedural || {};
        const caps = PATTERN_CAPABILITIES[pr.preset || 'hexagons'] || {};
        const setHidden = (id, hid) => {
            const el = document.getElementById(id);
            if (el) el.hidden = Boolean(hid);
        };
        const pal = pr.palette || 'dual';
        const isDual = pal === 'dual';
        const isCustom = pal === 'custom';
        setHidden('op-proc-dual-colors', !isDual);
        setHidden('op-custom-palette-editor', !isCustom);
        setHidden('op-pal-customize-btn', isCustom);
        setHidden('op-proc-fill-wrap', caps.fill === false);
        setHidden('op-proc-fill-opacity-wrap', caps.fill === false || (pr.fillMode || 'tinted') === 'outline');
        setHidden('op-proc-spin-wrap', !caps.spin);
        setHidden('op-proc-spin-speed-wrap', !caps.spin || (pr.spin || 'none') === 'none');
        setHidden('op-proc-rotvar-wrap', !caps.spin);
        setHidden('op-proc-density-wrap', caps.density === false);
        setHidden('op-proc-spacing-wrap', caps.spacing === false);
        setHidden('op-proc-density-head', caps.density === false && caps.spacing === false);
        setHidden('op-proc-scatter-wrap', caps.scatter === false);
        setHidden('op-proc-sizevar-wrap', caps.sizeVariance === false);
        setHidden('op-proc-detail-wrap', caps.scatter === false && caps.sizeVariance === false);
        setHidden('op-proc-variation-details', !caps.spin && caps.scatter === false && caps.sizeVariance === false);
        setHidden('op-proc-snow-wrap', pr.preset !== 'snowflakes');
        const isPan = pr.motion === 'pan';
        setHidden('op-proc-pan-opts-wrap', !isPan);
        setHidden('op-proc-pan-dir-wrap', !isPan);
        setHidden('op-proc-angle-wrap', !isPan);
        setHidden('op-proc-speed-wrap', (pr.motion || 'drift') === 'none');
        setHidden('op-proc-inplace-speed-wrap', (pr.inPlace || 'auto') === 'none');
        setHidden('op-proc-cspeed-wrap', (pr.colorAnim || 'none') === 'none');

        const hintEl = document.getElementById('op-proc-cap-hint');
        if (hintEl) {
            hintEl.hidden = !caps.hint;
            if (caps.hint) hintEl.textContent = caps.hint;
        }
        renderPaletteBar(pr);
    }

    function updateFilterControlVisibility() {
        const duoOn = Boolean(document.getElementById('op-flt-duo-on')?.checked);
        const tintOn = Boolean(document.getElementById('op-flt-tint-on')?.checked);
        const grainOn = Boolean(document.getElementById('op-flt-grain-on')?.checked);
        const duoWrap = document.getElementById('op-flt-duo-wrap');
        const tintWrap = document.getElementById('op-flt-tint-wrap');
        const grainWrap = document.getElementById('op-flt-grain-wrap');
        if (duoWrap) duoWrap.hidden = !duoOn;
        if (tintWrap) tintWrap.hidden = !tintOn;
        if (grainWrap) grainWrap.hidden = !grainOn;
    }

    function updateTileControlVisibility() {
        const tl = workingProfile?.tiles || {};
        const slots = Array.isArray(tl.slots) ? tl.slots : [];
        const isRadial = tl.symmetry === 'radial';
        const isPal = tl.colorSource === 'palette';
        const pal = tl.palette || 'dual';
        const motionNone = (tl.motion || 'scroll') === 'none';
        const setHidden = (id, hid) => {
            const el = document.getElementById(id);
            if (el) el.hidden = Boolean(hid);
        };
        setHidden('op-tile-dist-wrap', slots.length <= 1);
        setHidden('op-tile-kaleido-wrap', !isRadial);
        setHidden('op-tile-kaleido-morph-wrap', !isRadial);
        setHidden('op-tile-kaleido-speed-wrap', !isRadial || tl.kaleidoMorph === false);
        setHidden('op-tile-speed-wrap', motionNone);
        setHidden('op-tile-motion-details', motionNone);
        setHidden('op-tile-hue-panel', isPal);
        setHidden('op-tile-palette-panel', !isPal);
        setHidden('op-tile-dual-colors', pal !== 'dual');
        setHidden('op-tile-custom-palette-editor', pal !== 'custom');
        setHidden('op-tile-pal-customize-btn', pal === 'custom');
        setHidden('op-tile-pal-angle-wrap', (tl.paletteStyle || 'per-tile') !== 'gradient');
        setHidden('op-tile-hue-speed-wrap', isPal || (tl.hueShift || 'none') === 'none');
        setHidden('op-tile-cspeed-wrap', !isPal || (tl.colorAnim || 'none') === 'none');
        setHidden('op-tile-twinkle-speed-wrap', Number(tl.twinkle || 0) <= 0);
        document.querySelectorAll('#op-tile-color-source-seg button').forEach(btn => {
            btn.setAttribute('aria-pressed', String((btn.dataset.cs === 'palette') === isPal));
        });
        const hueSpeedEl = document.getElementById('op-tile-hue-speed');
        if (hueSpeedEl) {
            const hueOff = isPal || (tl.hueShift || 'none') === 'none';
            hueSpeedEl.disabled = hueOff;
            hueSpeedEl.style.opacity = hueOff ? '0.5' : '';
        }
        const cSpeedEl = document.getElementById('op-tile-cspeed');
        if (cSpeedEl) {
            const cOff = !isPal || (tl.colorAnim || 'none') === 'none';
            cSpeedEl.disabled = cOff;
            cSpeedEl.style.opacity = cOff ? '0.5' : '';
        }
        if (isPal) renderPaletteBar(tl, null, null, 'op-tile-palette-bar');
        const addBtn = document.getElementById('op-tile-add-slot');
        if (addBtn) addBtn.disabled = slots.length >= 4;
    }

    function switchInspectorTab(tab) {
        const valid = ['canvas', 'pattern', 'motion', 'filters'];
        const clean = valid.includes(tab) ? tab : 'canvas';
        activeInspectorTab = clean;
        try { localStorage.setItem(INSPECTOR_TAB_KEY, clean); } catch {}
        document.querySelectorAll('#op-inspector-tabs [data-op-inspector]').forEach(btn => {
            const on = btn.dataset.opInspector === clean;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        valid.forEach(k => {
            const pane = document.getElementById(`op-inspector-${k}`);
            if (pane) pane.hidden = k !== clean;
        });
    }

    function isWorkingProfileDirty() {
        if (!workingProfile || !studioState?.profiles) return false;
        const saved = studioState.profiles.find(p => p.id === selectedProfileId);
        if (!saved) return true;
        return JSON.stringify(workingProfile) !== JSON.stringify(saved);
    }

    function updateDirtyIndicators() {
        const dirty = isWorkingProfileDirty();
        const topPill = document.getElementById('op-dirty-pill');
        const prevPill = document.getElementById('op-preview-sync-pill');
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

    function updatePreviewPauseButtonUI() {
        const btn = document.getElementById('op-btn-preview-pause');
        if (!btn) return;
        btn.classList.toggle('active', previewPaused);
        btn.innerHTML = previewPaused
            ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="6 4 20 12 6 20 6 4"/></svg><span>Resume</span>'
            : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pause</span>';
    }

    function ensureTileSlots(tl) {
        if (!Array.isArray(tl.slots) || tl.slots.length === 0) {
            tl.slots = [{
                id: 'slot-1',
                sourceType: tl.stampFile ? 'image' : 'image',
                label: tl.stampFile ? 'Uploaded Stamp' : 'Built-In Geometric',
                src: tl.stampFile ? `/api/obs-patterns/stamps/${encodeURIComponent(tl.stampFile)}` : '',
                iconClass: '',
                text: '',
                color: '#FFFFFFFF',
                scale: 100
            }];
        }
        return tl.slots;
    }

    function renderTileSlots() {
        const listEl = document.getElementById('op-tile-slots-list');
        if (!listEl || !workingProfile) return;
        const tl = workingProfile.tiles = workingProfile.tiles || {};
        const slots = ensureTileSlots(tl);
        listEl.innerHTML = slots.map((slot, idx) => {
            const hasIcon = slot.sourceType === 'icon' && slot.iconClass;
            const hasImg = slot.sourceType === 'image' && slot.src;
            const isBuiltIn = !hasIcon && !hasImg;
            const effectiveSlotColor = (isBuiltIn && slots.length === 1) ? (tl.tintColor || slot.color || '#FFFFFFFF') : (slot.color || '#FFFFFFFF');
            let thumb = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${escapeHtml(effectiveSlotColor.slice(0, 7))}" stroke-width="1.8"><polygon points="12 2 22 12 12 22 2 12"/></svg>`;
            if (hasImg) thumb = `<img src="${escapeHtml(slot.src)}" alt="" style="width:100%;height:100%;object-fit:contain;">`;
            else if (hasIcon) thumb = `<i class="${escapeHtml(slot.iconClass)}" style="font-size:18px;color:${escapeHtml((slot.color || '#FFFFFFFF').slice(0, 7))};"></i>`;
            const colorControl = hasImg
                ? ''
                : `<input type="color" data-slot-color="${idx}" value="${escapeHtml(colorPickHex(effectiveSlotColor))}" title="${isBuiltIn && slots.length === 1 ? 'Tile color tint (syncs Master Tint)' : 'Icon color tint'}" style="width:26px;height:22px;padding:0;border:1px solid var(--border);border-radius:4px;cursor:pointer;">`;
            return `<div class="op-slot-card" data-slot-idx="${idx}" style="display:flex;align-items:center;gap:0.55rem;padding:0.45rem 0.55rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-inset);">
                <div style="width:36px;height:36px;flex:0 0 36px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;">${thumb}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.76rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Slot ${idx + 1}: ${escapeHtml(slot.label || (hasIcon ? slot.iconClass : (hasImg ? 'Custom Image' : 'Built-In Geometric')))}</div>
                    <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.28rem;align-items:center;">
                        <label class="btn btn-sm" style="cursor:pointer;font-size:0.71rem;padding:0.15rem 0.45rem;">
                            <input type="file" data-slot-upload="${idx}" accept="image/*,.svg" hidden>Upload
                        </label>
                        <button type="button" class="btn btn-sm" data-slot-asset="${idx}" style="font-size:0.71rem;padding:0.15rem 0.45rem;">Asset Library</button>
                        <button type="button" class="btn btn-sm" data-slot-icon="${idx}" style="font-size:0.71rem;padding:0.15rem 0.45rem;">FA Icon</button>
                        <button type="button" class="btn btn-sm" data-slot-clear="${idx}" style="font-size:0.71rem;padding:0.15rem 0.45rem;">Built-In</button>
                        <label style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.7rem;color:var(--text-muted);margin-left:0.2rem;">
                            Scale %<input type="number" data-slot-scale="${idx}" value="${Number(slot.scale ?? 100)}" min="25" max="200" step="5" style="width:52px;padding:0.12rem 0.3rem;font-size:0.72rem;">
                        </label>
                        ${colorControl}
                    </div>
                </div>
                ${slots.length > 1 ? `<button type="button" class="btn btn-sm" data-slot-remove="${idx}" title="Remove slot" aria-label="Remove slot ${idx + 1}" style="padding:0.2rem 0.45rem;">×</button>` : ''}
            </div>`;
        }).join('');

        listEl.querySelectorAll('[data-slot-upload]').forEach(inp => {
            inp.addEventListener('change', async () => {
                const f = inp.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = async () => {
                    slots[Number(inp.dataset.slotUpload)] = {
                        ...slots[Number(inp.dataset.slotUpload)],
                        sourceType: 'image',
                        src: String(reader.result || ''),
                        iconClass: '',
                        label: f.name.slice(0, 40)
                    };
                    renderTileSlots();
                    await rebuildTileAtlasAndUpload('Upload');
                };
                reader.readAsDataURL(f);
            });
        });
        listEl.querySelectorAll('[data-slot-asset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.slotAsset);
                if (!window.ImagePicker?.open) { showToast('Asset Image Picker not loaded'); return; }
                window.ImagePicker.open({
                    value: slots[idx]?.src || '',
                    onPick: async (url) => {
                        if (!url) {
                            slots[idx] = { ...slots[idx], sourceType: 'image', src: '', iconClass: '', label: 'Built-In Geometric' };
                        } else {
                            slots[idx] = { ...slots[idx], sourceType: 'image', src: url, iconClass: '', label: decodeURIComponent(url.split('/').pop() || 'Asset').slice(0, 40) };
                        }
                        renderTileSlots();
                        await rebuildTileAtlasAndUpload('Asset');
                    }
                });
            });
        });
        listEl.querySelectorAll('[data-slot-icon]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.slotIcon);
                if (!window.IconPicker?.open) { showToast('Icon picker not loaded'); return; }
                window.IconPicker.open({
                    value: slots[idx]?.iconClass || '',
                    onPick: async (cls) => {
                        if (!cls) return;
                        slots[idx] = { ...slots[idx], sourceType: 'icon', iconClass: cls, src: '', label: `Icon (${cls.replace(/^fa-\w+\s+/, '')})` };
                        renderTileSlots();
                        await rebuildTileAtlasAndUpload('FA Icon');
                    }
                });
            });
        });
        listEl.querySelectorAll('[data-slot-clear]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.slotClear);
                slots[idx] = { ...slots[idx], sourceType: 'image', src: '', iconClass: '', label: 'Built-In Geometric' };
                renderTileSlots();
                await rebuildTileAtlasAndUpload('Built-In');
            });
        });
        listEl.querySelectorAll('[data-slot-scale]').forEach(inp => {
            inp.addEventListener('change', async () => {
                const idx = Number(inp.dataset.slotScale);
                slots[idx].scale = Math.max(25, Math.min(200, Number(inp.value) || 100));
                await rebuildTileAtlasAndUpload('Scale');
            });
        });
        listEl.querySelectorAll('[data-slot-color]').forEach(inp => {
            inp.addEventListener('change', async () => {
                const idx = Number(inp.dataset.slotColor);
                const hex = inp.value.toUpperCase() + 'FF';
                slots[idx].color = hex;
                if (slots.length === 1 && !(slots[0].sourceType === 'icon' && slots[0].iconClass) && !(slots[0].sourceType === 'image' && slots[0].src)) {
                    tl.tintColor = hex;
                    setControlValue('op-tile-tint', hex, '#FFFFFFFF', { isColor: true });
                    syncColorPicker('op-tile-tint', 'op-tile-tint-pick');
                    previewDirty = true;
                }
                renderTileSlots();
                await rebuildTileAtlasAndUpload('Color');
            });
        });
        listEl.querySelectorAll('[data-slot-remove]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.slotRemove);
                if (slots.length <= 1) return;
                slots.splice(idx, 1);
                renderTileSlots();
                updateTileControlVisibility();
                await rebuildTileAtlasAndUpload('Atlas');
            });
        });
        updateTileControlVisibility();
    }

    function updateModeVisibility(mode) {
        const isTiles = mode === 'tiles';
        const setHid = (id, h) => { const el = document.getElementById(id); if (el) el.hidden = Boolean(h); };
        setHid('op-proc-pattern-block', isTiles);
        setHid('op-proc-motion-block', isTiles);
        setHid('op-tile-pattern-block', !isTiles);
        setHid('op-tile-motion-block', !isTiles);
        const patLbl = document.getElementById('op-tab-pattern-label');
        if (patLbl) patLbl.textContent = isTiles ? 'Tile Layout' : 'Pattern Setup';
        document.querySelectorAll('#op-mode-seg button').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false');
        });
        updateProceduralControlVisibility();
        updateTileControlVisibility();
    }

    function populateFormFromProfile() {
        if (!workingProfile) return;
        isPopulating = true;
        try {
            const p = workingProfile;
            document.getElementById('op-name').value = p.name || '';
            document.getElementById('op-id').value = p.id || '';
            document.getElementById('op-width').value = p.width ?? 1920;
            document.getElementById('op-height').value = p.height ?? 1080;
            document.getElementById('op-bg-type').value = p.bgType || ((String(p.bgColor || '').endsWith('00')) ? 'transparent' : 'solid');
            setControlValue('op-bg-color', p.bgColor, '#0B101BFF', { isColor: true });
            syncColorPicker('op-bg-color', 'op-bg-color-pick');
            setControlValue('op-bg-color2', p.bgColor2, '#1E1B4BFF', { isColor: true });
            syncColorPicker('op-bg-color2', 'op-bg-color2-pick');
            setControlValue('op-bg-color3', p.bgColor3, '#0F766EFF', { isColor: true });
            syncColorPicker('op-bg-color3', 'op-bg-color3-pick');
            document.getElementById('op-bg-use-mid').checked = Boolean(p.bgUseMid);
            document.getElementById('op-bg-angle').value = p.bgAngle ?? 135;
            document.getElementById('op-bg-cx').value = p.bgCenterX ?? 50;
            document.getElementById('op-bg-cy').value = p.bgCenterY ?? 50;
            document.getElementById('op-bg-radius').value = p.bgRadius ?? 75;
            document.getElementById('op-bg-motion').value = p.bgMotion || 'none';
            document.getElementById('op-bg-motion-speed').value = p.bgMotionSpeed ?? 1;
            setControlValue('op-opacity', p.opacity, 100);
            setControlValue('op-vignette', p.vignette, 25);
            setControlValue('op-vignette-color', p.vignetteColor, '#000000FF', { isColor: true });
            syncColorPicker('op-vignette-color', 'op-vignette-color-pick');
            updateBackgroundVisibility();

            const pr = p.procedural || {};
            document.getElementById('op-proc-preset').value = pr.preset || 'hexagons';
            document.getElementById('op-proc-palette').value = pr.palette || 'dual';
            ensureCustomColors(pr);
            renderCustomPaletteStops();
            setControlValue('op-proc-accent', pr.accent, '#58A6FFFF', { isColor: true });
            syncColorPicker('op-proc-accent', 'op-proc-accent-pick');
            setControlValue('op-proc-secondary', pr.secondary, '#A855F7FF', { isColor: true });
            syncColorPicker('op-proc-secondary', 'op-proc-secondary-pick');
            setControlValue('op-proc-scale', pr.scale, 100);
            setControlValue('op-proc-lw', pr.lineWidth, 2);
            document.getElementById('op-proc-fill-mode').value = pr.fillMode || 'tinted';
            document.getElementById('op-proc-fill-opacity').value = pr.fillOpacity ?? 35;
            document.getElementById('op-proc-cmode').value = pr.colorMode || 'mosaic';
            document.getElementById('op-proc-canim').value = pr.colorAnim || 'none';
            document.getElementById('op-proc-cspeed').value = pr.colorSpeed ?? 1;
            document.getElementById('op-proc-motion').value = pr.motion || 'pan';
            setControlValue('op-proc-speed', pr.speed, 1);
            document.getElementById('op-proc-pan-dir').value = pr.panDirection || 'continuous';
            setControlValue('op-proc-angle', pr.panAngle, 45);
            document.getElementById('op-proc-inplace').value = pr.inPlace || 'auto';
            document.getElementById('op-proc-inplace-speed').value = pr.inPlaceSpeed ?? 1;
            document.getElementById('op-proc-spin').value = pr.spin || 'none';
            document.getElementById('op-proc-spin-speed').value = pr.spinSpeed ?? 1;
            document.getElementById('op-proc-rotvar').value = pr.rotationVariance ?? 0;
            document.getElementById('op-proc-density').value = pr.density ?? 1;
            setControlValue('op-proc-spacing', pr.spacing, 100);
            document.getElementById('op-proc-scatter').value = pr.scatter ?? 0;
            document.getElementById('op-proc-sizevar').value = pr.sizeVariance ?? 0;
            document.getElementById('op-proc-snow-style').value = pr.snowflakeStyle || 'all';

            const tl = p.tiles = p.tiles || {};
            ensureTileSlots(tl);
            document.getElementById('op-tile-dist').value = tl.tileDistribution || 'diagonal';
            document.getElementById('op-tile-layout').value = tl.layout || 'brick';
            document.getElementById('op-tile-symmetry').value = tl.symmetry || 'none';
            document.getElementById('op-tile-wedges').value = tl.wedges ?? 6;
            document.getElementById('op-tile-kaleido-dir').value = tl.kaleidoDirection || 'cw';
            document.getElementById('op-tile-kaleido-depth').value = tl.kaleidoDepth ?? 35;
            document.getElementById('op-tile-kaleido-morph').checked = tl.kaleidoMorph !== false;
            document.getElementById('op-tile-kaleido-speed').value = tl.kaleidoSpeed ?? 8;
            setControlValue('op-tile-size', tl.tileSize, 96);
            setControlValue('op-tile-gap', tl.gap, 18);
            document.getElementById('op-tile-offsetx').value = tl.offsetX ?? 50;
            document.getElementById('op-tile-offsety').value = tl.offsetY ?? 50;
            document.getElementById('op-tile-grid-angle').value = tl.gridAngle ?? 0;
            document.getElementById('op-tile-angle').value = tl.tileAngle ?? 0;
            document.getElementById('op-tile-alt-flip').value = tl.alternateFlip || 'tilt';
            document.getElementById('op-tile-opacity').value = tl.tileOpacity ?? 1;
            document.getElementById('op-tile-alt-opacity').value = tl.altOpacity ?? 0.65;
            document.getElementById('op-tile-alt-scale').value = tl.altScale ?? 1;
            setControlValue('op-tile-tint', tl.tintColor, '#FFFFFFFF', { isColor: true });
            syncColorPicker('op-tile-tint', 'op-tile-tint-pick');
            document.getElementById('op-tile-motion').value = tl.motion || 'scroll';
            document.getElementById('op-tile-track-mode').value = tl.trackMode || 'uniform';
            setControlValue('op-tile-speed', tl.speed, 16);
            document.getElementById('op-tile-scroll-angle').value = tl.scrollAngle ?? 35;
            document.getElementById('op-tile-spin').value = tl.spinSpeed ?? 8;
            document.getElementById('op-tile-spin-dir').value = tl.spinDirection || 'cw';
            document.getElementById('op-tile-wave-amt').value = tl.waveAmount ?? 25;
            document.getElementById('op-tile-hue-mode').value = tl.hueShift || 'none';
            document.getElementById('op-tile-hue-speed').value = tl.hueSpeed ?? 14;
            document.getElementById('op-tile-hue-jitter').value = tl.hueJitter ?? 0;
            tl.colorSource = tl.colorSource === 'palette' ? 'palette' : 'hue';
            document.getElementById('op-tile-palette').value = tl.palette || 'dual';
            ensureCustomColors(tl);
            renderCustomPaletteStops('tiles');
            setControlValue('op-tile-accent', tl.accent, '#58A6FFFF', { isColor: true });
            syncColorPicker('op-tile-accent', 'op-tile-accent-pick');
            setControlValue('op-tile-secondary', tl.secondary, '#A855F7FF', { isColor: true });
            syncColorPicker('op-tile-secondary', 'op-tile-secondary-pick');
            document.getElementById('op-tile-cmode').value = tl.colorMode || 'mosaic';
            document.getElementById('op-tile-canim').value = tl.colorAnim || 'none';
            document.getElementById('op-tile-cspeed').value = tl.colorSpeed ?? 1;
            document.getElementById('op-tile-pal-style').value = tl.paletteStyle || 'per-tile';
            document.getElementById('op-tile-pal-blend').value = tl.paletteBlend || 'recolor';
            setControlValue('op-tile-pal-strength', tl.paletteStrength, 100);
            setControlValue('op-tile-pal-scale', tl.paletteScale, 100);
            setControlValue('op-tile-pal-angle', tl.paletteAngle, 0);
            document.getElementById('op-tile-sat-jitter').value = tl.saturationJitter ?? 0;
            document.getElementById('op-tile-bright-jitter').value = tl.brightnessJitter ?? 0;
            document.getElementById('op-tile-scale-jitter').value = tl.scaleJitter ?? 0;
            document.getElementById('op-tile-rot-jitter').value = tl.rotationJitter ?? 0;
            document.getElementById('op-tile-pos-jitter').value = tl.positionJitter ?? 0;
            document.getElementById('op-tile-twinkle').value = tl.twinkle ?? 0;
            document.getElementById('op-tile-twinkle-speed').value = tl.twinkleSpeed ?? 4;

            const fl = p.filters || {};
            const duo = fl.duotone || {};
            const flTint = fl.tint || {};
            const flGrain = fl.grain || {};
            setControlValue('op-flt-brightness', fl.brightness, 100);
            setControlValue('op-flt-contrast', fl.contrast, 100);
            setControlValue('op-flt-saturate', fl.saturate, 100);
            setControlValue('op-flt-grayscale', fl.grayscale, 0);
            setControlValue('op-flt-hue', fl.hueRotate, 0);
            setControlValue('op-flt-blur', fl.blur, 0);
            const duoCheck = document.getElementById('op-flt-duo-on');
            if (duoCheck) duoCheck.checked = Boolean(duo.enabled);
            setControlValue('op-flt-duo-dark', duo.dark, '#1E1B4BFF', { isColor: true });
            syncColorPicker('op-flt-duo-dark', 'op-flt-duo-dark-pick');
            setControlValue('op-flt-duo-light', duo.light, '#22D3EEFF', { isColor: true });
            syncColorPicker('op-flt-duo-light', 'op-flt-duo-light-pick');
            const tintCheck = document.getElementById('op-flt-tint-on');
            if (tintCheck) tintCheck.checked = Boolean(flTint.enabled);
            setControlValue('op-flt-tint-color', flTint.color, '#58A6FFFF', { isColor: true });
            syncColorPicker('op-flt-tint-color', 'op-flt-tint-color-pick');
            const tintOp = document.getElementById('op-flt-tint-opacity');
            if (tintOp) tintOp.value = flTint.opacity ?? 25;
            const grainCheck = document.getElementById('op-flt-grain-on');
            if (grainCheck) grainCheck.checked = Boolean(flGrain.enabled);
            const grainAmt = document.getElementById('op-flt-grain-amt');
            if (grainAmt) grainAmt.value = flGrain.amount ?? 18;
            const grainSz = document.getElementById('op-flt-grain-size');
            if (grainSz) grainSz.value = flGrain.size ?? 150;
            const grainAnim = document.getElementById('op-flt-grain-anim');
            if (grainAnim) grainAnim.checked = flGrain.animate !== false;
            updateFilterControlVisibility();

            updateModeVisibility(p.mode || 'procedural');
            renderTileSlots();

            if (window.WizardVariableBinder) window.WizardVariableBinder.refreshAllBoundControlsUI();
            const activeStamp = p.mode === 'tiles' ? tl.stampFile : pr.bakedStampFile;
            if (p.mode === 'procedural' && !ANALYTIC_GPU_SET.has(pr.preset) && !activeStamp) {
                bakeProceduralPresetToStamp(pr.preset);
            } else {
                lastBakeSignature = (p.mode === 'procedural' && !ANALYTIC_GPU_SET.has(pr.preset))
                    ? computeProceduralBakeSignature(pr)
                    : '';
                loadStampPreviewImage(activeStamp || '');
            }
            updateDirtyIndicators();
            schedulePreviewDraw();
        } finally {
            isPopulating = false;
        }
    }

    function syncWorkingProfileFromDom() {
        if (!workingProfile || isPopulating) return;
        const p = workingProfile;
        p.name = document.getElementById('op-name')?.value || p.name;
        p.id = document.getElementById('op-id')?.value || p.id;
        p.width = Number(document.getElementById('op-width')?.value) || 1920;
        p.height = Number(document.getElementById('op-height')?.value) || 1080;
        p.bgType = document.getElementById('op-bg-type')?.value || 'solid';
        p.bgColor = getFieldRawValue('op-bg-color', '#0B101BFF');
        p.bgColor2 = getFieldRawValue('op-bg-color2', '#1E1B4BFF');
        p.bgColor3 = getFieldRawValue('op-bg-color3', '#0F766EFF');
        p.bgUseMid = Boolean(document.getElementById('op-bg-use-mid')?.checked);
        p.bgAngle = Number(document.getElementById('op-bg-angle')?.value ?? 135);
        p.bgCenterX = Number(document.getElementById('op-bg-cx')?.value ?? 50);
        p.bgCenterY = Number(document.getElementById('op-bg-cy')?.value ?? 50);
        p.bgRadius = Number(document.getElementById('op-bg-radius')?.value ?? 75);
        p.bgMotion = document.getElementById('op-bg-motion')?.value || 'none';
        p.bgMotionSpeed = Number(document.getElementById('op-bg-motion-speed')?.value ?? 1);
        p.opacity = getFieldRawValue('op-opacity', 100);
        p.vignette = getFieldRawValue('op-vignette', 25);
        p.vignetteColor = getFieldRawValue('op-vignette-color', '#000000FF');
        updateBackgroundVisibility();

        p.procedural = p.procedural || {};
        p.procedural.preset = document.getElementById('op-proc-preset')?.value || 'hexagons';
        p.procedural.palette = document.getElementById('op-proc-palette')?.value || 'dual';
        p.procedural.accent = getFieldRawValue('op-proc-accent', '#58A6FFFF');
        p.procedural.secondary = getFieldRawValue('op-proc-secondary', '#A855F7FF');
        p.procedural.scale = getFieldRawValue('op-proc-scale', 100);
        p.procedural.lineWidth = getFieldRawValue('op-proc-lw', 2);
        p.procedural.fillMode = document.getElementById('op-proc-fill-mode')?.value || 'tinted';
        p.procedural.fillOpacity = Number(document.getElementById('op-proc-fill-opacity')?.value ?? 35);
        p.procedural.colorMode = document.getElementById('op-proc-cmode')?.value || 'mosaic';
        p.procedural.colorAnim = document.getElementById('op-proc-canim')?.value || 'none';
        p.procedural.colorSpeed = Number(document.getElementById('op-proc-cspeed')?.value ?? 1);
        p.procedural.motion = document.getElementById('op-proc-motion')?.value || 'pan';
        p.procedural.speed = getFieldRawValue('op-proc-speed', 1);
        p.procedural.panDirection = document.getElementById('op-proc-pan-dir')?.value || 'continuous';
        p.procedural.panAngle = getFieldRawValue('op-proc-angle', 45);
        p.procedural.inPlace = document.getElementById('op-proc-inplace')?.value || 'auto';
        p.procedural.inPlaceSpeed = Number(document.getElementById('op-proc-inplace-speed')?.value ?? 1);
        p.procedural.spin = document.getElementById('op-proc-spin')?.value || 'none';
        p.procedural.spinSpeed = Number(document.getElementById('op-proc-spin-speed')?.value ?? 1);
        p.procedural.rotationVariance = Number(document.getElementById('op-proc-rotvar')?.value ?? 0);
        p.procedural.density = Number(document.getElementById('op-proc-density')?.value) || 1;
        p.procedural.spacing = getFieldRawValue('op-proc-spacing', 100);
        p.procedural.scatter = Number(document.getElementById('op-proc-scatter')?.value) || 0;
        p.procedural.sizeVariance = Number(document.getElementById('op-proc-sizevar')?.value) || 0;
        p.procedural.snowflakeStyle = document.getElementById('op-proc-snow-style')?.value || 'all';

        p.tiles = p.tiles || {};
        p.tiles.tileDistribution = document.getElementById('op-tile-dist')?.value || 'diagonal';
        p.tiles.layout = document.getElementById('op-tile-layout')?.value || 'brick';
        p.tiles.symmetry = document.getElementById('op-tile-symmetry')?.value || 'none';
        p.tiles.wedges = Number(document.getElementById('op-tile-wedges')?.value) || 6;
        p.tiles.kaleidoDirection = document.getElementById('op-tile-kaleido-dir')?.value || 'cw';
        p.tiles.kaleidoDepth = Number(document.getElementById('op-tile-kaleido-depth')?.value ?? 35);
        p.tiles.kaleidoMorph = Boolean(document.getElementById('op-tile-kaleido-morph')?.checked);
        p.tiles.kaleidoSpeed = Number(document.getElementById('op-tile-kaleido-speed')?.value ?? 8);
        p.tiles.tileSize = getFieldRawValue('op-tile-size', 96);
        p.tiles.gap = getFieldRawValue('op-tile-gap', 18);
        p.tiles.offsetX = Number(document.getElementById('op-tile-offsetx')?.value ?? 50);
        p.tiles.offsetY = Number(document.getElementById('op-tile-offsety')?.value ?? 50);
        p.tiles.gridAngle = Number(document.getElementById('op-tile-grid-angle')?.value) || 0;
        p.tiles.tileAngle = Number(document.getElementById('op-tile-angle')?.value) || 0;
        p.tiles.alternateFlip = document.getElementById('op-tile-alt-flip')?.value || 'tilt';
        p.tiles.tileOpacity = Number(document.getElementById('op-tile-opacity')?.value ?? 1);
        p.tiles.altOpacity = Number(document.getElementById('op-tile-alt-opacity')?.value ?? 0.65);
        p.tiles.altScale = Number(document.getElementById('op-tile-alt-scale')?.value ?? 1);
        p.tiles.tintColor = getFieldRawValue('op-tile-tint', '#FFFFFFFF');
        p.tiles.motion = document.getElementById('op-tile-motion')?.value || 'scroll';
        p.tiles.trackMode = document.getElementById('op-tile-track-mode')?.value || 'uniform';
        p.tiles.speed = getFieldRawValue('op-tile-speed', 16);
        p.tiles.scrollAngle = Number(document.getElementById('op-tile-scroll-angle')?.value) || 35;
        p.tiles.spinSpeed = Number(document.getElementById('op-tile-spin')?.value ?? 8);
        p.tiles.spinDirection = document.getElementById('op-tile-spin-dir')?.value || 'cw';
        p.tiles.waveAmount = Number(document.getElementById('op-tile-wave-amt')?.value) || 25;
        p.tiles.hueShift = document.getElementById('op-tile-hue-mode')?.value || 'none';
        p.tiles.hueSpeed = Number(document.getElementById('op-tile-hue-speed')?.value) || 14;
        p.tiles.hueJitter = Number(document.getElementById('op-tile-hue-jitter')?.value ?? 0);
        p.tiles.colorSource = p.tiles.colorSource === 'palette' ? 'palette' : 'hue';
        p.tiles.palette = document.getElementById('op-tile-palette')?.value || 'dual';
        p.tiles.accent = getFieldRawValue('op-tile-accent', '#58A6FFFF');
        p.tiles.secondary = getFieldRawValue('op-tile-secondary', '#A855F7FF');
        p.tiles.colorMode = document.getElementById('op-tile-cmode')?.value || 'mosaic';
        p.tiles.colorAnim = document.getElementById('op-tile-canim')?.value || 'none';
        p.tiles.colorSpeed = Number(document.getElementById('op-tile-cspeed')?.value ?? 1);
        p.tiles.paletteStyle = document.getElementById('op-tile-pal-style')?.value || 'per-tile';
        p.tiles.paletteBlend = document.getElementById('op-tile-pal-blend')?.value || 'recolor';
        p.tiles.paletteStrength = getFieldRawValue('op-tile-pal-strength', 100);
        p.tiles.paletteScale = getFieldRawValue('op-tile-pal-scale', 100);
        p.tiles.paletteAngle = getFieldRawValue('op-tile-pal-angle', 0);
        p.tiles.saturationJitter = Number(document.getElementById('op-tile-sat-jitter')?.value ?? 0);
        p.tiles.brightnessJitter = Number(document.getElementById('op-tile-bright-jitter')?.value ?? 0);
        p.tiles.scaleJitter = Number(document.getElementById('op-tile-scale-jitter')?.value ?? 0);
        p.tiles.rotationJitter = Number(document.getElementById('op-tile-rot-jitter')?.value ?? 0);
        p.tiles.positionJitter = Number(document.getElementById('op-tile-pos-jitter')?.value ?? 0);
        p.tiles.twinkle = Number(document.getElementById('op-tile-twinkle')?.value ?? 0);
        p.tiles.twinkleSpeed = Number(document.getElementById('op-tile-twinkle-speed')?.value ?? 4);

        p.filters = {
            brightness: getFieldRawValue('op-flt-brightness', 100),
            contrast: getFieldRawValue('op-flt-contrast', 100),
            saturate: getFieldRawValue('op-flt-saturate', 100),
            grayscale: getFieldRawValue('op-flt-grayscale', 0),
            hueRotate: getFieldRawValue('op-flt-hue', 0),
            blur: getFieldRawValue('op-flt-blur', 0),
            duotone: {
                enabled: Boolean(document.getElementById('op-flt-duo-on')?.checked),
                dark: getFieldRawValue('op-flt-duo-dark', '#1E1B4BFF'),
                light: getFieldRawValue('op-flt-duo-light', '#22D3EEFF')
            },
            tint: {
                enabled: Boolean(document.getElementById('op-flt-tint-on')?.checked),
                color: getFieldRawValue('op-flt-tint-color', '#58A6FFFF'),
                opacity: Number(document.getElementById('op-flt-tint-opacity')?.value ?? 25)
            },
            grain: {
                enabled: Boolean(document.getElementById('op-flt-grain-on')?.checked),
                amount: Number(document.getElementById('op-flt-grain-amt')?.value ?? 18),
                size: Number(document.getElementById('op-flt-grain-size')?.value ?? 150),
                animate: Boolean(document.getElementById('op-flt-grain-anim')?.checked)
            }
        };
        updateFilterControlVisibility();

        updateProceduralControlVisibility();
        updateTileControlVisibility();
        if (p.mode === 'procedural') {
            if (ANALYTIC_GPU_SET.has(p.procedural.preset)) {
                clearTimeout(rebakeTimer);
                latestProcBakeSeq++;
                p.procedural.bakedStampFile = '';
                p.procedural.stampCols = 0;
                p.procedural.stampRows = 0;
                if (loadedStampFile) loadStampPreviewImage('');
            } else {
                scheduleProceduralRebake();
            }
        }
        updateDirtyIndicators();
        schedulePreviewDraw();
    }

    function initVariableBinderOnce() {
        if (varBinderMounted || !window.WizardVariableBinder) return;
        varBinderMounted = true;
        const bindings = [
            { id: 'op-bg-color', kind: 'color', label: 'Background Color', pairColorId: 'op-bg-color-pick', defaultFallback: '#0B101BFF' },
            { id: 'op-bg-color2', kind: 'color', label: 'Gradient End Color', pairColorId: 'op-bg-color2-pick', defaultFallback: '#1E1B4BFF' },
            { id: 'op-bg-color3', kind: 'color', label: 'Background Mid Color', pairColorId: 'op-bg-color3-pick', defaultFallback: '#0F766EFF' },
            { id: 'op-opacity', kind: 'number', label: 'Master Opacity', defaultFallback: '100' },
            { id: 'op-vignette', kind: 'number', label: 'Vignette', defaultFallback: '25' },
            { id: 'op-vignette-color', kind: 'color', label: 'Vignette Color', pairColorId: 'op-vignette-color-pick', defaultFallback: '#000000FF' },
            { id: 'op-proc-accent', kind: 'color', label: 'Pattern Accent', pairColorId: 'op-proc-accent-pick', defaultFallback: '#58A6FFFF' },
            { id: 'op-proc-secondary', kind: 'color', label: 'Pattern Secondary', pairColorId: 'op-proc-secondary-pick', defaultFallback: '#A855F7FF' },
            { id: 'op-proc-scale', kind: 'number', label: 'Pattern Scale', defaultFallback: '100' },
            { id: 'op-proc-lw', kind: 'number', label: 'Pattern Line Width', defaultFallback: '2' },
            { id: 'op-proc-speed', kind: 'number', label: 'Pattern Speed', defaultFallback: '1' },
            { id: 'op-proc-angle', kind: 'number', label: 'Pan Angle', defaultFallback: '45' },
            { id: 'op-proc-spacing', kind: 'number', label: 'Element Spacing', defaultFallback: '100' },
            { id: 'op-tile-size', kind: 'number', label: 'Tile Size', defaultFallback: '96' },
            { id: 'op-tile-gap', kind: 'number', label: 'Tile Gap', defaultFallback: '18' },
            { id: 'op-tile-tint', kind: 'color', label: 'Tile Tint', pairColorId: 'op-tile-tint-pick', defaultFallback: '#FFFFFFFF' },
            { id: 'op-tile-accent', kind: 'color', label: 'Tile Palette Accent', pairColorId: 'op-tile-accent-pick', defaultFallback: '#58A6FFFF' },
            { id: 'op-tile-secondary', kind: 'color', label: 'Tile Palette Secondary', pairColorId: 'op-tile-secondary-pick', defaultFallback: '#A855F7FF' },
            { id: 'op-tile-pal-strength', kind: 'number', label: 'Tile Palette Strength', defaultFallback: '100' },
            { id: 'op-tile-pal-scale', kind: 'number', label: 'Tile Palette Band Width', defaultFallback: '100' },
            { id: 'op-tile-pal-angle', kind: 'number', label: 'Tile Gradient Angle', defaultFallback: '0' },
            { id: 'op-tile-speed', kind: 'number', label: 'Tile Speed', defaultFallback: '16' },
            { id: 'op-flt-brightness', kind: 'number', label: 'Filter Brightness', defaultFallback: '100' },
            { id: 'op-flt-contrast', kind: 'number', label: 'Filter Contrast', defaultFallback: '100' },
            { id: 'op-flt-saturate', kind: 'number', label: 'Filter Saturation', defaultFallback: '100' },
            { id: 'op-flt-grayscale', kind: 'number', label: 'Filter Grayscale', defaultFallback: '0' },
            { id: 'op-flt-hue', kind: 'number', label: 'Filter Hue Shift', defaultFallback: '0' },
            { id: 'op-flt-blur', kind: 'number', label: 'Filter Blur', defaultFallback: '0' },
            { id: 'op-flt-duo-dark', kind: 'color', label: 'Duotone Shadows', pairColorId: 'op-flt-duo-dark-pick', defaultFallback: '#1E1B4BFF' },
            { id: 'op-flt-duo-light', kind: 'color', label: 'Duotone Highlights', pairColorId: 'op-flt-duo-light-pick', defaultFallback: '#22D3EEFF' },
            { id: 'op-flt-tint-color', kind: 'color', label: 'Filter Tint Color', pairColorId: 'op-flt-tint-color-pick', defaultFallback: '#58A6FFFF' }
        ];
        window.WizardVariableBinder.mount({
            storageKey: 'streampulse:obs-patterns:vars',
            bindings,
            onChange: () => syncWorkingProfileFromDom()
        });
    }

    // ------------------------------------------------------------------------
    // WebGL Live 1:1 Shader Preview (Matches OBS .effect Math)
    // ------------------------------------------------------------------------
    const VERT_GLSL = `
        attribute vec2 a_pos;
        varying vec2 v_uv;
        void main() {
            v_uv = a_pos * 0.5 + 0.5;
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }
    `;

    const FRAG_GLSL = `
        precision highp float;
        varying vec2 v_uv;
        uniform sampler2D stamp_tex;
        uniform sampler2D scene_tex;
        uniform vec2 scene_padding;
        uniform vec2 canvas_size;
        uniform vec2 stamp_size;
        uniform vec2 stamp_grid;
        uniform float mode_code;
        uniform float anim_time;
        uniform float opacity;
        uniform float bg_type;
        uniform vec4 bg_color;
        uniform vec4 bg_color2;
        uniform vec4 bg_color3;
        uniform float bg_use_mid;
        uniform float bg_angle_rad;
        uniform vec2 bg_center;
        uniform float bg_radius;
        uniform float bg_motion;
        uniform float bg_motion_speed;
        uniform float vignette_amt;
        uniform vec4 vignette_color;

        uniform float proc_preset;
        uniform float proc_scale;
        uniform float proc_line_w;
        uniform vec4 proc_accent;
        uniform vec4 proc_secondary;
        uniform vec4 pal_c0;
        uniform vec4 pal_c1;
        uniform vec4 pal_c2;
        uniform vec4 pal_c3;
        uniform vec4 pal_c4;
        uniform vec4 pal_c5;
        uniform vec4 pal_c6;
        uniform float pal_count;
        uniform float proc_fill_mode;
        uniform float proc_fill_opacity;
        uniform float proc_color_mode;
        uniform float proc_color_anim;
        uniform float proc_color_speed;
        uniform float proc_motion;
        uniform float proc_speed;
        uniform float proc_pan_osc;
        uniform float proc_pan_rad;
        uniform float proc_inplace_mode;
        uniform float proc_inplace_speed;
        uniform float proc_spin_mode;
        uniform float proc_spin_speed;
        uniform float proc_density;
        uniform float proc_spacing;
        uniform float proc_size_var;
        uniform float proc_scatter;
        uniform float proc_rot_var;

        uniform float flt_brightness;
        uniform float flt_contrast;
        uniform float flt_saturate;
        uniform float flt_grayscale;
        uniform float flt_hue_rad;
        uniform float flt_blur;
        uniform float flt_duo_on;
        uniform vec4 flt_duo_dark;
        uniform vec4 flt_duo_light;
        uniform float flt_tint_on;
        uniform vec4 flt_tint_color;
        uniform float flt_tint_amt;
        uniform float flt_grain_amt;
        uniform float flt_grain_size;
        uniform float flt_grain_anim;

        uniform float tile_count;
        uniform float tile_dist;
        uniform float tile_layout;
        uniform float tile_symmetry;
        uniform float tile_wedges;
        uniform float tile_kaleido_morph;
        uniform float tile_kaleido_speed;
        uniform float tile_kaleido_dir;
        uniform float tile_kaleido_depth;
        uniform float tile_size;
        uniform float tile_gap;
        uniform float tile_offset_x;
        uniform float tile_offset_y;
        uniform float tile_grid_rad;
        uniform float tile_angle_rad;
        uniform float tile_alt_flip;
        uniform float tile_opacity;
        uniform float tile_alt_opacity;
        uniform float tile_alt_scale;
        uniform float tile_motion;
        uniform float tile_track_mode;
        uniform float tile_spin_dir;
        uniform float tile_scroll_rad;
        uniform float tile_speed;
        uniform float tile_spin_rad;
        uniform float tile_wave_amt;
        uniform float tile_hue_mode;
        uniform float tile_hue_speed;
        uniform float tile_hue_jitter;
        uniform float tile_sat_jitter;
        uniform float tile_bright_jitter;
        uniform float tile_scale_jitter;
        uniform float tile_rot_jitter;
        uniform float tile_pos_jitter;
        uniform float tile_twinkle;
        uniform float tile_twinkle_speed;
        uniform vec4 tile_tint;
        uniform float tile_color_source;
        uniform float tile_pal_cmode;
        uniform float tile_pal_canim;
        uniform float tile_pal_cspeed;
        uniform float tile_pal_style;
        uniform float tile_pal_blend;
        uniform float tile_pal_strength;
        uniform float tile_pal_scale;
        uniform float tile_pal_angle_rad;
        uniform float has_stamp;
        uniform float show_checker;

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        vec2 hash22(vec2 p) {
            float n = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453;
            float m = sin(dot(p, vec2(269.5, 183.3))) * 43758.5453;
            return fract(vec2(n, m));
        }
        float valueNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                       mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        vec2 rot2d(vec2 p, float a) {
            float c = cos(a); float s = sin(a);
            return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        }
        vec3 hueShiftRgb(vec3 col, float angle) {
            vec3 k = vec3(0.57735);
            float cosA = cos(angle);
            return col * cosA + cross(k, col) * sin(angle) + k * dot(k, col) * (1.0 - cosA);
        }
        float sdHex(vec2 p, float r) {
            vec3 k = vec3(-0.8660254, 0.5, 0.57735027);
            p = abs(p);
            p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
            p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
            return length(p) * sign(p.y);
        }
        float sdTri(vec2 p, float r) {
            float k = 1.7320508;
            p.x = abs(p.x) - r;
            p.y = p.y + r / k;
            if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
            p.x -= clamp(p.x, -2.0 * r, 0.0);
            return -length(p) * sign(p.y);
        }
        float sdFourStar(vec2 p, float r) {
            float rr = max(0.5, r);
            vec2 q = max(vec2(0.0001), abs(p) / rr);
            float f = pow(q.x, 0.55) + pow(q.y, 0.55) - 1.0;
            return f * rr * 0.48;
        }
        vec4 getPaletteStop(float idx_f) {
            float n = max(2.0, pal_count);
            float m = mod(abs(idx_f), n);
            if (m < 0.5) return pal_c0;
            if (m < 1.5) return pal_c1;
            if (m < 2.5) return pal_c2;
            if (m < 3.5) return pal_c3;
            if (m < 4.5) return pal_c4;
            if (m < 5.5) return pal_c5;
            return pal_c6;
        }
        vec4 pickProcColor(vec2 id, vec2 px, float t) {
            float n = max(2.0, pal_count);
            float h = hash21(id);
            float idx = 0.0;
            if (proc_color_mode < 0.5) {
                idx = floor(h * n);
            } else if (proc_color_mode < 1.5) {
                vec2 d = (px - canvas_size * 0.5) / max(24.0, proc_scale * 0.72);
                idx = floor(length(d));
            } else if (proc_color_mode < 2.5) {
                idx = floor(abs(id.y));
            } else if (proc_color_mode < 3.5) {
                idx = floor(abs(id.x));
            } else if (proc_color_mode < 4.5) {
                idx = floor(abs(id.x + id.y));
            } else if (proc_color_mode < 5.5) {
                vec2 cp = px - canvas_size * 0.5;
                float ang = (atan(cp.y, cp.x) + 3.1415926) / 6.2831853;
                idx = floor(length(cp) / max(32.0, proc_scale * 0.85) + ang * n);
            } else {
                idx = mod(abs(id.x + id.y), 2.0) * (n > 2.5 ? 2.0 : 1.0);
            }
            float shift = 0.0;
            if (proc_color_anim > 0.5 && proc_color_anim < 1.5) {
                shift = t * proc_color_speed * 1.4;
            } else if (proc_color_anim >= 1.5) {
                shift = (0.5 + 0.5 * sin(t * proc_color_speed * 2.0 + h * 1.8)) * max(1.0, n - 0.5);
            }
            float fidx = idx + shift;
            float i0 = floor(fidx);
            vec4 c = mix(getPaletteStop(i0), getPaletteStop(i0 + 1.0), fract(fidx));
            if (proc_color_anim >= 1.5) {
                c.a *= 0.65 + 0.35 * sin(t * proc_color_speed * 2.2 + h * 6.28318);
            }
            return c;
        }
        float evalShapeMask(float d, float lw) {
            float stroke_m = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, abs(d));
            if (proc_fill_mode >= 1.5) return stroke_m;
            float fill_m = 1.0 - smoothstep(-1.0, 1.0, d);
            float fa = (proc_fill_mode >= 0.5) ? clamp(proc_fill_opacity / 100.0, 0.0, 1.0) : clamp(proc_fill_opacity / 100.0, 0.0, 1.0) * 0.48;
            return max(fill_m * fa, stroke_m);
        }
        vec4 evalProceduralPattern(vec2 px, float t) {
            float s = max(10.0, proc_scale) / 100.0;
            float lw = max(0.5, proc_line_w);
            float dens = max(0.25, proc_density);
            float dens2 = max(0.35, sqrt(dens));
            float sp = clamp(proc_spacing, 50.0, 300.0) / 100.0;
            float elem_s = s / dens2;
            vec2 vel = vec2(cos(proc_pan_rad), sin(proc_pan_rad)) * proc_speed * 42.0;
            vec2 p = px;
            if (proc_motion >= 7.5) {
                p += (proc_pan_osc > 0.5) ? vel * sin(t * 0.8) * 1.8 : vel * t;
            } else if (proc_motion >= 6.5) {
                p += vec2(sin(t * proc_speed * 0.55 + px.y * 0.002), cos(t * proc_speed * 0.4 + px.x * 0.002)) * 28.0;
            } else if (proc_motion >= 4.5 && proc_motion < 5.5) {
                p += vec2(cos(t * proc_speed * 0.8), sin(t * proc_speed * 0.8)) * 36.0;
            } else if (proc_motion >= 3.5 && proc_motion < 4.5) {
                float z = 1.0 + 0.065 * sin(t * proc_speed * 1.6);
                p = (p - canvas_size * 0.5) * z + canvas_size * 0.5;
            } else if (proc_motion >= 2.5 && proc_motion < 3.5) {
                p = rot2d(p - canvas_size * 0.5, sin(t * proc_speed * 0.9) * 0.045) + canvas_size * 0.5;
            } else if (proc_motion >= 1.5 && proc_motion < 2.5) {
                p.y -= t * proc_speed * 48.0;
                p.x += sin(t * proc_speed * 0.7) * 18.0;
            } else if (proc_motion >= 0.5 && proc_motion < 1.5) {
                p += vec2(sin(t * proc_speed * 0.7), cos(t * proc_speed * 0.55)) * 45.0;
            }

            float t_ip = (proc_inplace_mode > 0.5) ? (t * max(0.2, proc_inplace_speed)) : 0.0;
            float spin_base = 0.0;
            if (proc_spin_mode > 0.5 && proc_spin_mode < 1.5) spin_base = t * proc_spin_speed * 1.1;
            else if (proc_spin_mode >= 1.5 && proc_spin_mode < 2.5) spin_base = -t * proc_spin_speed * 1.1;
            else if (proc_spin_mode >= 2.5) spin_base = sin(t * proc_spin_speed * 1.6) * 0.45;

            float mask = 0.0;
            float shade_mul = 1.0;
            vec2 cell_id = floor(p / (64.0 * s));

            if (proc_preset < 0.5) {
                float step_px = 56.0 * elem_s * sp;
                cell_id = floor(p / step_px);
                vec2 g = abs(fract(p / step_px - 0.5) - 0.5) * step_px;
                mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, min(g.x, g.y));
            } else if (proc_preset < 1.5) {
                float step_px = 78.0 * elem_s * sp;
                cell_id = floor(p / step_px);
                vec2 lp = (fract(p / step_px) - 0.5) * step_px;
                float h = hash21(cell_id);
                vec2 rp = rot2d(lp, spin_base * ((h > 0.5) ? 1.0 : -1.0));
                float rad = 78.0 * elem_s;
                float d = (h > 0.66) ? (length(lp) - rad * 0.25) : ((h > 0.33) ? max(abs(rp.x), abs(rp.y)) - rad * 0.23 : sdTri(rp, rad * 0.28));
                mask = evalShapeMask(d, lw);
            } else if (proc_preset < 2.5) {
                vec2 cp = p - canvas_size * 0.5;
                float r = length(cp);
                float ring_step = 78.0 * s * sp / dens;
                float ring_i = floor(r / ring_step);
                cell_id = vec2(ring_i, 1.0);
                float d = abs(fract(r / ring_step) - 0.5) * ring_step;
                mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d);
                float sat_t = (proc_inplace_mode > 0.5) ? t_ip : t;
                float ang = atan(cp.y, cp.x) + sat_t * (0.45 + 0.2 * sin(ring_i * 2.1)) + spin_base * ((mod(ring_i, 2.0) > 0.5) ? 1.0 : -1.0);
                vec2 sat = vec2(cos(ang), sin(ang)) * ((ring_i + 0.5) * ring_step);
                mask = max(mask * 0.68, 1.0 - smoothstep(-1.0, 1.0, length(cp - sat) - (5.5 * s + lw * 0.65)));
            } else if (proc_preset < 3.5) {
                float hex_cell_r = 46.0 * elem_s * sp;
                float hex_r = 46.0 * elem_s;
                vec2 r = vec2(1.7320508, 1.0) * hex_cell_r * 2.0;
                vec2 h = r * 0.5;
                vec2 a = fract(p / r) * r - h;
                vec2 b = fract((p - h) / r) * r - h;
                vec2 gv = (dot(a, a) < dot(b, b)) ? a : b;
                cell_id = floor((p - gv) / h + 0.5);
                float sv = 1.0 + (hash21(cell_id) - 0.5) * (proc_size_var / 100.0) * 0.35;
                vec2 rgv = rot2d(gv, spin_base * ((mod(abs(cell_id.x + cell_id.y), 2.0) > 0.5) ? 1.0 : -1.0));
                mask = evalShapeMask(sdHex(rgv, hex_r * 0.86 * sv), lw);
            } else if (proc_preset < 4.5) {
                float step_px = 58.0 * elem_s * sp;
                vec2 gf = p / step_px;
                vec2 base_cell = floor(gf);
                vec2 f = fract(gf);
                vec2 q = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
                mask = 0.0;
                cell_id = base_cell;
                for (int dy = 0; dy <= 1; dy++) {
                    for (int dx = 0; dx <= 1; dx++) {
                        vec2 off = vec2(float(dx) * q.x, float(dy) * q.y);
                        vec2 cid = base_cell + off;
                        vec2 rnd = hash22(cid);
                        vec2 lp = (f - off - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.4;
                        lp = rot2d(lp, spin_base + (rnd.y - 0.5) * (proc_rot_var / 100.0) * 1.5);
                        float sz = (58.0 * elem_s) * (0.28 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 0.18);
                        float m = evalShapeMask((abs(lp.x) + abs(lp.y)) * 0.7071 - sz, lw);
                        if (m > mask) {
                            mask = m;
                            cell_id = cid;
                        }
                    }
                }
            } else if (proc_preset < 5.5) {
                float step_px = 64.0 * elem_s * sp;
                cell_id = floor(p / step_px);
                vec2 ip1 = rot2d(p, 0.523599);
                vec2 ip2 = rot2d(p, -0.523599);
                float d1 = abs(fract(ip1.y / step_px) - 0.5) * step_px;
                float d2 = abs(fract(ip2.y / step_px) - 0.5) * step_px;
                float d3 = abs(fract(p.x / (step_px * 0.866)) - 0.5) * (step_px * 0.866);
                mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, min(min(d1, d2), d3));
            } else if (proc_preset < 6.5) {
                float step_px = 54.0 * elem_s * sp;
                vec2 mp = p + vec2(sin(p.y * 0.015 / s + t_ip * 1.2) * 14.0, cos(p.x * 0.015 / s + t_ip * 1.2) * 14.0);
                cell_id = floor(mp / step_px);
                vec2 g = abs(fract(mp / step_px - 0.5) - 0.5) * step_px;
                mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, min(g.x, g.y));
            } else if (proc_preset < 7.5) {
                vec2 cp = p - canvas_size * 0.5;
                float rays = max(6.0, floor(18.0 * dens));
                float ang = atan(cp.y, cp.x) + spin_base + t_ip * 0.25;
                float sector = fract(ang / 6.2831853 * rays);
                cell_id = vec2(floor(ang / 6.2831853 * rays), 0.0);
                mask = 1.0 - smoothstep(max(0.0, lw * 0.8 - 0.55), lw * 0.8 + 0.55, abs(sector - 0.5) * (length(cp) * 6.2831853 / rays));
            } else if (proc_preset < 8.5) {
                float step_px = 68.0 * elem_s * sp;
                vec2 gf = p / step_px;
                vec2 base_cell = floor(gf);
                vec2 f = fract(gf);
                vec2 q = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
                mask = 0.0;
                cell_id = base_cell;
                for (int dy = 0; dy <= 1; dy++) {
                    for (int dx = 0; dx <= 1; dx++) {
                        vec2 off = vec2(float(dx) * q.x, float(dy) * q.y);
                        vec2 cid = base_cell + off;
                        vec2 rnd = hash22(cid);
                        vec2 lp = (f - off - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.35;
                        float flip = mod(abs(cid.x + cid.y), 2.0) * 2.0 - 1.0;
                        lp = rot2d(lp, spin_base * flip + (rnd.y - 0.5) * (proc_rot_var / 100.0) * 1.2);
                        float sv = 1.0 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 0.4;
                        float m = evalShapeMask(sdTri(lp * vec2(1.0, flip), (68.0 * elem_s) * 0.30 * sv), lw);
                        if (m > mask) {
                            mask = m;
                            cell_id = cid;
                        }
                    }
                }
            } else if (proc_preset < 9.5) {
                float step_px = 52.0 * s * sp / dens;
                float zig = abs(fract(p.x / (step_px * 1.5)) - 0.5) * step_px;
                float yv = p.y + zig;
                cell_id = vec2(floor(p.x / step_px), floor(yv / step_px));
                mask = 1.0 - smoothstep(max(0.0, lw * 0.6 - 0.55), lw * 0.6 + 0.55, abs(fract(yv / step_px) - 0.5) * step_px);
            } else if (proc_preset < 10.5) {
                float step_px = 56.0 * elem_s * sp;
                cell_id = floor(p / step_px);
                float fa = clamp(proc_fill_opacity / 100.0, 0.08, 1.0);
                float tile_m = mod(abs(cell_id.x + cell_id.y), 2.0) > 0.5 ? fa : fa * 0.14;
                vec2 cg = abs(fract(p / step_px) - 0.5);
                float bd = min(0.5 - cg.x, 0.5 - cg.y) * step_px;
                float bm = (proc_fill_mode >= 1.5 || lw > 2.2) ? (1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, bd)) : 0.0;
                mask = max((proc_fill_mode >= 1.5 ? 0.0 : tile_m), bm);
            } else if (proc_preset < 11.5) {
                float step_px = 46.0 * s * sp / dens;
                float wy = p.y + sin(p.x * 0.022 / s + t_ip * 1.5) * (16.0 * s);
                cell_id = vec2(floor(p.x / (step_px * 2.0)), floor(wy / step_px));
                mask = 1.0 - smoothstep(max(0.0, lw * 0.55 - 0.55), lw * 0.55 + 0.55, abs(fract(wy / step_px) - 0.5) * step_px);
            } else if (proc_preset < 12.5) {
                float step_px = 64.0 * s * sp / dens;
                float r = length(p - canvas_size * 0.5) - t_ip * 24.0;
                cell_id = vec2(floor(r / step_px), 0.0);
                mask = 1.0 - smoothstep(max(0.0, lw * 0.6 - 0.55), lw * 0.6 + 0.55, abs(fract(r / step_px) - 0.5) * step_px);
            } else if (proc_preset < 13.5) {
                float step_px = 56.0 * elem_s * sp;
                float row = floor(p.y / (step_px * 0.5));
                vec2 sp_p = p + vec2(mod(abs(row), 2.0) * step_px * 0.5, 0.0);
                cell_id = floor(sp_p / step_px);
                vec2 rnd = hash22(cell_id);
                vec2 lp = (fract(sp_p / step_px) - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.3;
                float sv = 1.0 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 0.35;
                mask = evalShapeMask(length(lp) - (56.0 * elem_s) * 0.48 * sv, lw);
            } else if (proc_preset < 14.5) {
                float n = valueNoise(p * 0.0055 / s + vec2(t_ip * 0.08, 0.0)) * 0.7
                        + valueNoise(p * 0.012 / s - vec2(0.0, t_ip * 0.05)) * 0.3;
                float bands = 9.0 * max(0.35, dens);
                float band = n * bands;
                cell_id = vec2(floor(band), floor(p.x / 220.0));
                mask = 1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, abs(fract(band) - 0.5) / bands * 140.0);
            } else if (proc_preset < 15.5) {
                float step_px = 58.0 * elem_s * sp;
                vec2 gf = p / step_px;
                vec2 base_cell = floor(gf);
                vec2 f = fract(gf);
                vec2 q = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
                float scatter_f = 0.25 + 0.45 * (proc_scatter / 100.0);
                mask = 0.0;
                cell_id = base_cell;
                for (int dy = 0; dy <= 1; dy++) {
                    for (int dx = 0; dx <= 1; dx++) {
                        vec2 off = vec2(float(dx) * q.x, float(dy) * q.y);
                        vec2 cid = base_cell + off;
                        vec2 rnd = hash22(cid);
                        if (rnd.x < 0.26) continue;
                        vec2 lp = (f - off - mix(vec2(0.5), rnd, scatter_f)) * step_px;
                        float sz_mul = 1.0 + (rnd.y - 0.5) * (proc_size_var / 100.0) * 0.85;
                        float tw = (proc_inplace_mode > 0.5) ? (0.45 + 0.55 * sin(t_ip * (2.0 + rnd.y * 4.0) + rnd.x * 12.0)) : 1.0;
                        float m = 0.0;
                        if (rnd.x > 0.68) {
                            vec2 rlp = rot2d(lp, spin_base * ((rnd.y > 0.5) ? 1.0 : -1.0) + (rnd.x - 0.5) * (proc_rot_var / 100.0) * 1.5);
                            float star_r = min(step_px * 0.42, (5.5 + rnd.x * 7.5) * elem_s * sz_mul);
                            m = evalShapeMask(sdFourStar(rlp, star_r), max(0.8, lw * 0.65)) * tw;
                        } else {
                            float dot_r = min(step_px * 0.35, (1.8 + rnd.x * 1.4) * elem_s * sz_mul);
                            m = evalShapeMask(length(lp) - dot_r, max(0.8, lw * 0.6)) * tw;
                        }
                        if (m > mask) {
                            mask = m;
                            cell_id = cid;
                        }
                    }
                }
            } else if (proc_preset < 16.5) {
                float step_px = 76.0 * elem_s * sp;
                vec2 gf = p / step_px;
                vec2 base_cell = floor(gf);
                vec2 f = fract(gf);
                vec2 q = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
                mask = 0.0;
                cell_id = base_cell;
                for (int dy = 0; dy <= 1; dy++) {
                    for (int dx = 0; dx <= 1; dx++) {
                        vec2 off = vec2(float(dx) * q.x, float(dy) * q.y);
                        vec2 cid = base_cell + off;
                        vec2 rnd = hash22(cid);
                        if (rnd.y < 0.32) continue;
                        vec2 lp = (f - off - (0.24 + rnd * 0.52)) * step_px;
                        lp = rot2d(lp, spin_base + (rnd.x - 0.5) * (proc_rot_var / 100.0) * 1.8);
                        float sz = min(step_px * 0.42, (9.5 + rnd.x * 11.0 * (1.0 + proc_size_var / 100.0 * 0.6)) * elem_s);
                        float tw = (proc_inplace_mode > 0.5) ? (0.35 + 0.65 * pow(0.5 + 0.5 * sin(t_ip * 3.0 + rnd.y * 10.0), 1.6)) : 1.0;
                        float m = evalShapeMask(sdFourStar(lp, sz), max(1.0, lw * 0.75)) * tw;
                        if (m > mask) {
                            mask = m;
                            cell_id = cid;
                        }
                    }
                }
            } else if (proc_preset < 17.5) {
                float step_px = 42.0 * elem_s * sp;
                vec2 gf = p / step_px;
                vec2 base_cell = floor(gf);
                vec2 f = fract(gf);
                vec2 q = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
                mask = 0.0;
                cell_id = base_cell;
                for (int dy = 0; dy <= 1; dy++) {
                    for (int dx = 0; dx <= 1; dx++) {
                        vec2 off = vec2(float(dx) * q.x, float(dy) * q.y);
                        vec2 cid = base_cell + off;
                        vec2 rnd = hash22(cid);
                        vec2 lp = (f - off - 0.5) * step_px - (rnd - 0.5) * (proc_scatter / 100.0) * step_px * 0.55;
                        float rad = min(step_px * 0.42, (5.5 + (rnd.x - 0.5) * (proc_size_var / 100.0) * 6.0) * elem_s);
                        float m = evalShapeMask(length(lp) - rad, lw);
                        if (m > mask) {
                            mask = m;
                            cell_id = cid;
                        }
                    }
                }
            } else if (proc_preset >= 18.5 && proc_preset < 19.5) {
                float step_px = 72.0 * elem_s * sp;
                cell_id = floor(p / step_px);
                vec2 lp = (fract(p / step_px) - 0.5) * step_px;
                float d_line = (hash21(cell_id) > 0.5) ? abs(lp.x - lp.y) * 0.7071 : min(abs(lp.x), abs(lp.y));
                mask = max(1.0 - smoothstep(max(0.0, lw * 0.5 - 0.55), lw * 0.5 + 0.55, d_line), 1.0 - smoothstep(-1.0, 1.0, length(lp) - (4.5 + lw * 0.7)));
            } else if (proc_preset >= 27.5 && proc_preset < 28.5) {
                float hex_cell_r = 46.0 * elem_s * sp;
                float outer_r = 46.0 * elem_s * min(sp, 1.0);
                vec2 r = vec2(1.7320508, 1.0) * hex_cell_r * 2.0;
                vec2 h = r * 0.5;
                vec2 a = fract(p / r) * r - h;
                vec2 b = fract((p - h) / r) * r - h;
                vec2 gv = (dot(a, a) < dot(b, b)) ? a : b;
                cell_id = floor((p - gv) / h + 0.5);
                float d_outer = sdHex(gv, outer_r);
                float wall_m = 1.0 - smoothstep(max(0.0, lw * 0.65 - 0.55), lw * 0.65 + 0.55, abs(d_outer));
                float inside = 1.0 - smoothstep(-0.65, 0.65, d_outer);
                float d_norm = clamp(-d_outer / max(1.0, outer_r), 0.0, 1.0);
                float wall_ao = pow(max(0.0, 1.0 - d_norm), 1.75);
                float dir_light = clamp(dot(gv / max(1.0, outer_r), vec2(0.58, 0.81)) * 0.5 + 0.5, 0.0, 1.0);
                float fa = (proc_fill_mode >= 1.5) ? 0.35 : clamp(proc_fill_opacity / 100.0, 0.22, 1.0) * ((proc_fill_mode >= 0.5) ? 1.0 : 0.82);
                float inner_shade_a = inside * fa * (0.28 + 0.52 * wall_ao + 0.20 * (1.0 - dir_light));
                mask = max(wall_m, inner_shade_a);
                float cavity_brightness = mix(0.32 + 0.55 * dir_light, 0.88 * (0.55 + 0.45 * dir_light), wall_ao);
                shade_mul = mix(cavity_brightness, 1.12, wall_m);
            } else {
                float step_px = 68.0 * elem_s * sp;
                cell_id = floor(p / step_px);
                vec2 lp = (fract(p / step_px) - 0.5) * step_px;
                lp = rot2d(lp, spin_base);
                mask = evalShapeMask((abs(lp.x) + abs(lp.y)) * 0.7071 - (68.0 * elem_s) * 0.22, lw);
            }
            if (proc_motion >= 5.5 && proc_motion < 6.5) {
                float beam = 0.5 + 0.5 * sin((px.x + px.y) * 0.004 - t * proc_speed * 2.2);
                mask *= 0.45 + 0.75 * pow(beam, 3.0);
            }
            if (proc_inplace_mode >= 1.5 && proc_inplace_mode < 2.5) mask *= 0.7 + 0.35 * sin(t_ip * 3.0 + hash21(cell_id) * 6.28318);
            else if (proc_inplace_mode >= 2.5 && proc_inplace_mode < 3.5) mask *= 0.82 + 0.18 * sin(t_ip * 1.4 + hash21(cell_id) * 6.28318);
            else if (proc_inplace_mode >= 3.5) mask *= 0.45 + 0.55 * abs(sin(t_ip * 4.2 + hash21(cell_id) * 12.56));
            vec4 col = pickProcColor(cell_id, px, t);
            float out_a = col.a * clamp(mask, 0.0, 1.0);
            return vec4(clamp(col.rgb * shade_mul, 0.0, 1.0) * out_a, out_a);
        }
        vec4 sampleTileStamp(vec2 uv, float slot_idx) {
            if (uv.x < -0.0001 || uv.x > 1.0001 || uv.y < -0.0001 || uv.y > 1.0001) return vec4(0.0);
            if (has_stamp > 0.5) {
                vec2 suv = clamp(uv, 0.0, 1.0);
                if (tile_count > 1.5) {
                    float n = clamp(tile_count, 1.0, 4.0);
                    float si = floor(mod(abs(slot_idx), n));
                    vec2 qoff = vec2(mod(si, 2.0), floor(si * 0.5)) * 0.5;
                    suv = qoff + 0.006 + clamp(uv, 0.004, 0.996) * 0.488;
                }
                vec4 tex = texture2D(stamp_tex, suv);
                if (tile_color_source < 0.5) tex *= tile_tint;
                return vec4(tex.rgb * tex.a, tex.a);
            }
            vec2 q = (uv - 0.5) * 2.0;
            float d_dia = (abs(q.x) + abs(q.y)) * 0.7071 - 0.58;
            float d_ring = abs(d_dia + 0.14) - 0.06;
            vec4 base_tint = (tile_color_source < 0.5) ? tile_tint : vec4(1.0);
            float a = max((1.0 - smoothstep(-0.04, 0.04, d_dia)) * 0.28, 1.0 - smoothstep(-0.03, 0.03, d_ring)) * base_tint.a;
            return vec4(base_tint.rgb * a, a);
        }
        vec4 evalTilePaletteColor(vec2 cell_id, vec2 tile_screen_center, vec2 screen_p, vec2 grid_p, float step_px, float t) {
            float n = max(2.0, pal_count);
            float g_scale = max(24.0, step_px * max(0.15, tile_pal_scale));
            vec2 gp = rot2d(screen_p, -tile_pal_angle_rad);
            vec2 gg = rot2d(grid_p, -tile_pal_angle_rad);
            float h = hash21(cell_id);
            float idx = 0.0;
            if (tile_pal_style < 0.5) {
                if (tile_pal_cmode < 0.5) idx = floor(h * n);
                else if (tile_pal_cmode < 1.5) idx = floor(length(tile_screen_center) / max(24.0, g_scale * 0.85));
                else if (tile_pal_cmode < 2.5) idx = floor(4200.0 + cell_id.y);
                else if (tile_pal_cmode < 3.5) idx = floor(4200.0 + cell_id.x);
                else if (tile_pal_cmode < 4.5) idx = floor(4200.0 + cell_id.x + cell_id.y);
                else if (tile_pal_cmode < 5.5) {
                    float ang = (atan(tile_screen_center.y, tile_screen_center.x) + 3.1415926) / 6.2831853;
                    idx = floor(length(tile_screen_center) / max(24.0, g_scale * 0.85) + ang * n);
                } else idx = mod(abs(cell_id.x + cell_id.y), 2.0) * (n > 2.5 ? 2.0 : 1.0);
            } else {
                if (tile_pal_cmode < 0.5) {
                    vec2 mg = gg / g_scale;
                    vec2 mi = floor(mg);
                    vec2 mf = smoothstep(0.0, 1.0, fract(mg));
                    float v00 = hash21(mi) * n;
                    float v10 = hash21(mi + vec2(1.0, 0.0)) * n;
                    float v01 = hash21(mi + vec2(0.0, 1.0)) * n;
                    float v11 = hash21(mi + vec2(1.0, 1.0)) * n;
                    idx = mix(mix(v00, v10, mf.x), mix(v01, v11, mf.x), mf.y);
                } else if (tile_pal_cmode < 1.5) idx = length(gp) / max(24.0, g_scale * 0.85);
                else if (tile_pal_cmode < 2.5) idx = 4200.0 + (gp.y / g_scale);
                else if (tile_pal_cmode < 3.5) idx = 4200.0 + (gp.x / g_scale);
                else if (tile_pal_cmode < 4.5) idx = 4200.0 + ((gp.x + gp.y) / (g_scale * 1.4142));
                else if (tile_pal_cmode < 5.5) {
                    float ang = (atan(gp.y, gp.x) + 3.1415926) / 6.2831853;
                    idx = length(gp) / max(24.0, g_scale * 0.85) + ang * n;
                } else {
                    float cw = 0.5 + 0.5 * cos((gg.x / g_scale) * 3.1415926) * cos((gg.y / g_scale) * 3.1415926);
                    idx = cw * (n > 2.5 ? 2.0 : 1.0);
                }
            }
            float h_seed = (tile_pal_style < 0.5) ? h : 0.0;
            float shift = 0.0;
            if (tile_pal_canim > 0.5 && tile_pal_canim < 1.5) shift = t * tile_pal_cspeed * 0.45;
            else if (tile_pal_canim >= 1.5) shift = (0.5 + 0.5 * sin(t * tile_pal_cspeed * 0.85 + h_seed * 1.8)) * max(1.0, n - 0.5);
            float fidx = max(0.0, idx + shift);
            float i0 = floor(fidx);
            vec4 c = mix(getPaletteStop(i0), getPaletteStop(i0 + 1.0), fract(fidx));
            if (tile_pal_canim >= 1.5) c.a *= 0.65 + 0.35 * sin(t * tile_pal_cspeed * 0.95 + h_seed * 6.28318);
            return c;
        }
        vec4 evalPatternTiles(vec2 px, float t) {
            vec2 p = px - canvas_size * 0.5;
            if (tile_symmetry > 1.5) {
                float wedges = max(3.0, tile_wedges);
                float r = length(p);
                float a = atan(p.y, p.x);
                float sector = 6.2831853 / wedges;
                a = mod(a + 6.2831853, sector);
                if (a > sector * 0.5) a = sector - a;
                if (tile_kaleido_morph > 0.5) {
                    float kdir = (tile_kaleido_dir > 0.5) ? -1.0 : 1.0;
                    a += kdir * sin(t * tile_kaleido_speed * 0.05) * (tile_kaleido_depth / 100.0) * 0.65;
                }
                p = vec2(cos(a), sin(a)) * r;
            } else if (tile_symmetry > 0.5) {
                p = abs(p);
            }
            p = rot2d(p, -tile_grid_rad);

            float step_px = max(20.0, tile_size + tile_gap);
            float wave_f = clamp(tile_wave_amt, 5.0, 100.0) / 100.0;
            vec2 scroll_dir = vec2(cos(tile_scroll_rad), sin(tile_scroll_rad));
            vec2 grid_p = p;
            float is_scroll = ((tile_motion > 0.5 && tile_motion < 1.5) || (tile_motion >= 6.5 && tile_motion < 7.5)) ? 1.0 : 0.0;

            if (is_scroll > 0.5 && tile_track_mode < 0.5) {
                grid_p += scroll_dir * tile_speed * t;
            } else if (tile_motion >= 4.5 && tile_motion < 5.5) {
                float sw_ph = t * max(0.0, tile_speed * 0.12);
                grid_p += vec2(sin(sw_ph) * step_px * wave_f * 1.4, cos(sw_ph * 0.5) * step_px * wave_f * 0.8);
            } else if ((tile_motion >= 1.5 && tile_motion < 2.5) || (is_scroll > 0.5 && ((tile_track_mode > 0.5 && tile_track_mode < 2.5) || tile_track_mode >= 4.5))) {
                float sx_dir = (is_scroll > 0.5 && abs(scroll_dir.x) > 0.1) ? sign(scroll_dir.x) : 1.0;
                float r_idx = floor(grid_p.y / step_px);
                float r_odd = mod(abs(r_idx), 2.0) > 0.5 ? 1.0 : 0.0;
                if (tile_track_mode >= 5.5 && tile_track_mode < 6.5) {
                    float s_off = sin(t * max(0.0, tile_speed * 0.12)) * step_px * 1.6 * sx_dir;
                    grid_p.x += (r_odd > 0.5 ? -s_off : s_off);
                } else if ((tile_track_mode >= 1.5 && tile_track_mode < 2.5) || (tile_track_mode >= 6.5 && tile_track_mode < 7.5)) {
                    grid_p.x += sx_dir * tile_speed * t * (r_odd > 0.5 ? 2.0 : 1.0);
                } else if (tile_track_mode >= 7.5) {
                    grid_p.x += sx_dir * tile_speed * t * (r_odd > 0.5 ? 0.0 : 1.0);
                } else {
                    grid_p.x += sx_dir * tile_speed * t * (r_odd > 0.5 ? -1.0 : 1.0);
                }
            } else if ((tile_motion >= 2.5 && tile_motion < 3.5) || (is_scroll > 0.5 && tile_track_mode >= 2.5 && tile_track_mode < 4.5)) {
                float sy_dir = (is_scroll > 0.5 && abs(scroll_dir.y) > 0.1) ? sign(scroll_dir.y) : 1.0;
                float c_idx = floor(grid_p.x / step_px);
                float c_odd = mod(abs(c_idx), 2.0) > 0.5 ? 1.0 : 0.0;
                if (tile_track_mode >= 5.5 && tile_track_mode < 6.5) {
                    float s_off = sin(t * max(0.0, tile_speed * 0.12)) * step_px * 1.6 * sy_dir;
                    grid_p.y += (c_odd > 0.5 ? -s_off : s_off);
                } else if ((tile_track_mode >= 3.5 && tile_track_mode < 4.5) || (tile_track_mode >= 6.5 && tile_track_mode < 7.5)) {
                    grid_p.y += sy_dir * tile_speed * t * (c_odd > 0.5 ? 2.0 : 1.0);
                } else if (tile_track_mode >= 7.5) {
                    grid_p.y += sy_dir * tile_speed * t * (c_odd > 0.5 ? 0.0 : 1.0);
                } else {
                    grid_p.y += sy_dir * tile_speed * t * (c_odd > 0.5 ? -1.0 : 1.0);
                }
            } else if (tile_motion >= 3.5 && tile_motion < 4.5) {
                float cyc = t * max(0.0, tile_speed * 0.015);
                float ph = fract(cyc);
                float q = ph < 0.5 ? ph * 2.0 : (ph - 0.5) * 2.0;
                float eased = q < 0.5 ? 4.0 * q * q * q : 1.0 - pow(-2.0 * q + 2.0, 3.0) * 0.5;
                float turns = mod(floor(cyc), 420.0);
                float x_progress = turns + (ph < 0.5 ? eased : 1.0);
                float y_progress = turns + (ph < 0.5 ? 0.0 : eased);
                float ro = mod(abs(floor(grid_p.y / step_px)), 2.0);
                float rx_dir = (tile_track_mode >= 6.5) ? (ro < 0.5 ? 1.0 : 0.0) : (ro > 0.5 ? -1.0 : 1.0);
                grid_p.x += 2.0 * step_px * x_progress * rx_dir;
                float co = mod(abs(floor(grid_p.x / step_px)), 2.0);
                float cy_dir = (tile_track_mode >= 6.5) ? (co > 0.5 ? 1.0 : 0.0) : (co > 0.5 ? -1.0 : 1.0);
                grid_p.y += 2.0 * step_px * y_progress * cy_dir;
            }

            float row = floor(grid_p.y / step_px);
            if (tile_layout > 0.5 && tile_layout < 1.5) grid_p.x += mod(abs(row), 2.0) * (tile_offset_x / 100.0) * step_px;
            else if (tile_layout >= 1.5 && tile_layout < 2.5) {
                float c_tmp = floor(grid_p.x / step_px);
                grid_p.y += mod(abs(c_tmp), 2.0) * (tile_offset_y / 100.0) * step_px;
                row = floor(grid_p.y / step_px);
            }
            vec2 cell_id = vec2(floor(grid_p.x / step_px), row);
            if (tile_motion >= 3.5 && tile_motion < 4.5) {
                // Match the 840-cell motion wrap; divisible by 2, 3 and 4 for parity and tile slots.
                cell_id -= 840.0 * floor((cell_id + 420.0) / 840.0);
            }
            vec2 rnd = hash22(cell_id);
            vec2 lp_raw = (fract(grid_p / step_px) - 0.5) * step_px;
            vec2 tile_screen_center = p - lp_raw;
            vec2 lp = lp_raw - (rnd - 0.5) * (tile_pos_jitter / 100.0) * (step_px * 0.35);

            float sc_wave = 1.0;
            float rot_extra = 0.0;
            if (tile_motion >= 7.5 && tile_motion < 8.5) {
                float wph = (cell_id.x * 0.55 + cell_id.y * 0.45) - t * max(0.0, tile_speed * 0.15);
                lp.y -= cos(wph) * tile_size * wave_f * 0.16;
                sc_wave = max(0.1, 1.0 + sin(wph) * wave_f * 0.45);
                rot_extra = sin(wph) * wave_f * 0.35;
            } else if (tile_motion >= 8.5) {
                float fph = t * max(0.0, tile_speed * 0.12);
                lp -= vec2(sin(fph + rnd.x * 6.283) * step_px * wave_f * 0.25, cos(fph * 0.85 + rnd.y * 6.283) * step_px * wave_f * 0.25);
                sc_wave = max(0.1, 1.0 + sin(fph + rnd.x * 6.283) * wave_f * 0.18);
                rot_extra = cos(fph + rnd.y * 6.283) * wave_f * 0.35;
            } else if (tile_motion >= 4.5 && tile_motion < 5.5) {
                float sw_ph = t * max(0.0, tile_speed * 0.12);
                float sw_dir = (mod(abs(cell_id.x + cell_id.y), 2.0) > 0.5) ? -1.0 : 1.0;
                rot_extra = sw_dir * sin(sw_ph + (cell_id.x + cell_id.y) * 0.4) * (wave_f * 0.65);
            }

            float is_alt = mod(abs(cell_id.x + cell_id.y), 2.0);
            if (tile_layout > 3.5 && is_alt < 0.5) return vec4(0.0);
            float sc = ((is_alt > 0.5) ? tile_alt_scale : 1.0) * sc_wave * (1.0 + (rnd.x - 0.5) * (tile_scale_jitter / 100.0) * 1.2);
            float sdir = 1.0;
            if (tile_spin_dir > 0.5 && tile_spin_dir < 1.5) sdir = -1.0;
            else if (tile_spin_dir >= 1.5) sdir = (is_alt > 0.5) ? -1.0 : 1.0;
            float spin_amt = ((tile_motion >= 5.5 && tile_motion < 7.5) ? tile_spin_rad * t * sdir : 0.0);
            float tilt_sign = (is_alt > 0.5 && tile_alt_flip < 0.5) ? -1.0 : 1.0;
            float ang = (tile_angle_rad * tilt_sign) + spin_amt + rot_extra + (rnd.y - 0.5) * (tile_rot_jitter / 180.0) * 6.2831853;
            vec2 uv = (rot2d(lp, -ang) / max(0.1, sc)) / max(16.0, tile_size) + 0.5;
            if (is_alt > 0.5) {
                if (tile_alt_flip > 0.5 && tile_alt_flip < 1.5) uv.x = 1.0 - uv.x;
                else if (tile_alt_flip >= 1.5 && tile_alt_flip < 2.5) uv.y = 1.0 - uv.y;
                else if (tile_alt_flip >= 2.5 && tile_alt_flip < 3.5) uv = 1.0 - uv;
            }
            float slot_idx = 0.0;
            if (tile_count > 1.5) {
                float nslots = clamp(tile_count, 1.0, 4.0);
                if (tile_dist < 0.5) slot_idx = mod(cell_id.x + cell_id.y + 4096.0 * nslots, nslots);
                else if (tile_dist < 1.5) slot_idx = mod(cell_id.y + 4096.0 * nslots, nslots);
                else if (tile_dist < 2.5) slot_idx = mod(cell_id.x + 4096.0 * nslots, nslots);
                else if (tile_dist < 3.5) slot_idx = mod(mod(abs(cell_id.x), 2.0) + mod(abs(cell_id.y), 2.0) * 2.0, nslots);
                else slot_idx = floor(rnd.x * nslots);
            }
            vec4 tex = sampleTileStamp(uv, slot_idx);
            if (tex.a <= 0.001) return vec4(0.0);

            vec3 unpm = tex.rgb / max(tex.a, 0.001);
            if (tile_color_source >= 0.5) {
                vec4 pal = evalTilePaletteColor(cell_id, tile_screen_center, p, grid_p, step_px, t);
                vec3 colored = unpm * pal.rgb;
                if (tile_pal_blend >= 0.5) {
                    float lum = dot(unpm, vec3(0.299, 0.587, 0.114));
                    float mx = max(unpm.r, max(unpm.g, unpm.b));
                    float luma = clamp(mix(lum, mx, 0.52), 0.0, 1.0);
                    colored = pal.rgb * luma;
                }
                float st = clamp(tile_pal_strength, 0.0, 1.0);
                unpm = clamp(mix(unpm, colored, st), 0.0, 1.0);
                tex.a *= mix(1.0, pal.a, st);
            } else {
                float hue_a = (rnd.x - 0.5) * (tile_hue_jitter / 180.0) * 6.2831853;
                if (tile_hue_mode > 0.5 && tile_hue_mode < 1.5) hue_a += t * tile_hue_speed * 0.08;
                else if (tile_hue_mode >= 1.5 && tile_hue_mode < 2.5) hue_a += px.x * 0.004 - t * tile_hue_speed * 0.1;
                else if (tile_hue_mode >= 2.5) hue_a += px.y * 0.004 - t * tile_hue_speed * 0.1;
                if (tile_hue_mode > 0.5 || abs(hue_a) > 0.001) {
                    float mx = max(unpm.r, max(unpm.g, unpm.b));
                    float mn = min(unpm.r, min(unpm.g, unpm.b));
                    float chroma = mx - mn;
                    float mono_w = 1.0 - smoothstep(0.02, 0.16, chroma);
                    float l_base = (mx > 0.92) ? 0.58 : clamp(mx * 0.72, 0.0, 0.58);
                    vec3 mono_rgb = hueShiftRgb(vec3(l_base * 1.48, l_base * 0.36, l_base * 0.56), hue_a);
                    vec3 col_rgb = hueShiftRgb(unpm, hue_a);
                    unpm = clamp(mix(col_rgb, mono_rgb, mono_w), 0.0, 1.0);
                }
            }
            if (tile_sat_jitter > 0.5) {
                float lum = dot(unpm, vec3(0.299, 0.587, 0.114));
                unpm = clamp(mix(vec3(lum), unpm, 1.0 + (rnd.y - 0.5) * (tile_sat_jitter / 50.0)), 0.0, 1.0);
            }
            if (tile_bright_jitter > 0.5) {
                unpm = clamp(unpm * (1.0 + (rnd.x - 0.5) * (tile_bright_jitter / 50.0)), 0.0, 1.0);
            }
            tex.rgb = unpm * tex.a;
            float cell_alpha = tile_opacity * ((is_alt > 0.5) ? tile_alt_opacity : 1.0);
            if (tile_twinkle > 0.5) cell_alpha *= 1.0 - (tile_twinkle / 100.0) * (0.5 + 0.5 * sin(t * max(0.5, tile_twinkle_speed) + rnd.y * 12.0));
            return tex * cell_alpha;
        }
        vec4 evalCanvasBackground(vec2 uv, vec2 px, float t) {
            if (bg_type < 0.5) return vec4(0.0);
            vec4 c1 = bg_color;
            if (bg_type < 1.5) return vec4(c1.rgb * c1.a, c1.a);
            vec4 c2 = bg_color2;
            vec4 cm = bg_color3;
            float sp = max(0.1, bg_motion_speed);
            float ang = bg_angle_rad;
            float rad_mul = max(0.1, bg_radius / 100.0);
            float shift = 0.0;
            if (bg_motion > 0.5 && bg_motion < 1.5) ang += t * sp * 0.45;
            else if (bg_motion >= 1.5 && bg_motion < 2.5) rad_mul *= 1.0 + 0.14 * sin(t * sp * 1.4);
            else if (bg_motion >= 2.5) shift = sin(t * sp * 0.85) * 0.25;
            float k = 0.0;
            if (bg_type < 2.5) {
                vec2 dir = vec2(cos(ang), sin(ang));
                vec2 aspect = vec2(canvas_size.x / max(1.0, canvas_size.y), 1.0);
                vec2 centered = (uv - 0.5) * aspect;
                float span = abs(dir.x) * aspect.x + abs(dir.y) * aspect.y;
                k = clamp((dot(centered, dir) / max(0.1, span)) + 0.5 + shift, 0.0, 1.0);
            } else if (bg_type < 3.5) {
                vec2 origin = bg_center / 100.0;
                vec2 aspect = vec2(canvas_size.x / max(1.0, canvas_size.y), 1.0);
                k = clamp(length((uv - origin) * aspect) / max(0.1, rad_mul * 0.72) + shift, 0.0, 1.0);
            } else {
                vec2 origin = bg_center / 100.0;
                vec2 dv = uv - origin;
                float a = atan(dv.y, dv.x) + ang;
                k = 0.5 + 0.5 * sin(a + t * ((bg_motion > 0.5) ? sp * 0.8 : 0.0));
            }
            k = clamp(k + (hash21(px) - 0.5) * 0.004, 0.0, 1.0);
            vec4 col = (bg_use_mid > 0.5) ? ((k < 0.5) ? mix(c1, cm, k * 2.0) : mix(cm, c2, (k - 0.5) * 2.0)) : mix(c1, c2, k);
            return vec4(col.rgb * col.a, col.a);
        }
        vec4 evalBakedProcedural(vec2 px, float t) {
            vec2 p_uv = px;
            vec2 vel = vec2(cos(proc_pan_rad), sin(proc_pan_rad)) * proc_speed * 42.0;
            if (proc_motion >= 7.5) p_uv += (proc_pan_osc > 0.5) ? vel * sin(t * 0.8) * 1.8 : vel * t;
            else if (proc_motion >= 6.5) p_uv += vec2(sin(t * proc_speed * 0.55 + px.y * 0.002), cos(t * proc_speed * 0.4 + px.x * 0.002)) * 28.0;
            else if (proc_motion >= 4.5 && proc_motion < 5.5) p_uv += vec2(cos(t * proc_speed * 0.8), sin(t * proc_speed * 0.8)) * 36.0;
            else if (proc_motion >= 2.5 && proc_motion < 3.5) p_uv = rot2d(p_uv - canvas_size * 0.5, sin(t * proc_speed * 0.9) * 0.045) + canvas_size * 0.5;
            else if (proc_motion >= 1.5 && proc_motion < 2.5) { p_uv.y -= t * proc_speed * 48.0; p_uv.x += sin(t * proc_speed * 0.7) * 18.0; }
            else if (proc_motion >= 0.5 && proc_motion < 1.5) p_uv += vec2(sin(t * proc_speed * 0.7), cos(t * proc_speed * 0.55)) * 45.0;
            else if (proc_motion >= 3.5 && proc_motion < 4.5) p_uv = (p_uv - canvas_size * 0.5) * (1.0 + 0.06 * sin(t * proc_speed * 1.6)) + canvas_size * 0.5;
            float z_scale = max(0.15, proc_scale / 100.0);
            vec2 ts = max(vec2(64.0), stamp_size);
            vec2 uv_px = fract((p_uv / z_scale) / ts) * ts;
            vec2 suv = uv_px / ts;
            if (proc_spin_mode > 0.5 && stamp_grid.x >= 2.0 && stamp_grid.y >= 2.0) {
                vec2 cell_sz = ts / stamp_grid;
                float r0 = floor(uv_px.y / cell_sz.y);
                float best_d2 = 1e9;
                vec2 best_c = vec2(0.0);
                vec2 best_cid = vec2(0.0);
                for (int dr = -1; dr <= 1; dr++) {
                    float rr = r0 + float(dr);
                    float wrow = mod(rr + stamp_grid.y * 100.0, stamp_grid.y);
                    float roff = (mod(wrow, 2.0) >= 0.5) ? (cell_sz.x * 0.5) : 0.0;
                    float c0 = floor((uv_px.x - roff) / cell_sz.x);
                    for (int dc = -1; dc <= 1; dc++) {
                        float cc = c0 + float(dc);
                        float wcol = mod(cc + stamp_grid.x * 100.0, stamp_grid.x);
                        vec2 center = vec2(cc * cell_sz.x + roff, rr * cell_sz.y);
                        vec2 diff = uv_px - center;
                        float d2 = dot(diff, diff);
                        if (d2 < best_d2) {
                            best_d2 = d2;
                            best_c = center;
                            best_cid = vec2(wcol, wrow);
                        }
                    }
                }
                float h = hash21(best_cid);
                float sdir = (h > 0.5) ? 1.0 : -1.0;
                float spin_a = 0.0;
                if (proc_spin_mode < 1.5) spin_a = t * proc_spin_speed * 1.1 * sdir;
                else if (proc_spin_mode < 2.5) spin_a = -t * proc_spin_speed * 1.1 * sdir;
                else spin_a = sin(t * proc_spin_speed * 1.6 + h * 6.2831853) * 0.38;
                suv = fract((best_c + rot2d(uv_px - best_c, -spin_a)) / ts);
            }
            vec4 st = texture2D(stamp_tex, suv);
            if (st.a > 0.001) {
                if (proc_color_anim > 0.5 && proc_color_anim < 1.5) st.rgb = clamp(hueShiftRgb(st.rgb, t * proc_color_speed * 0.85), 0.0, 1.0);
                else if (proc_color_anim >= 1.5) st.a *= 0.65 + 0.35 * sin(t * proc_color_speed * 2.1 + (px.x + px.y) * 0.005);
                if (proc_inplace_mode > 0.5) {
                    float t_ip = t * max(0.2, proc_inplace_speed);
                    st.a *= (proc_inplace_mode >= 3.5)
                        ? (0.55 + 0.45 * abs(sin(t_ip * 3.8 + floor(p_uv.x / 64.0) * 1.7 + floor(p_uv.y / 64.0) * 2.3)))
                        : (0.84 + 0.16 * sin(t_ip * 1.8 + floor(p_uv.x / 96.0) * 1.1));
                }
            }
            return vec4(st.rgb * st.a, st.a);
        }
        vec4 evalSceneSample(vec2 uv, vec2 px, float t) {
            vec4 bg_pm = evalCanvasBackground(uv, px, t);
            vec4 fg_pm = (mode_code > 0.5)
                ? evalPatternTiles(px, t)
                : (has_stamp > 0.5 ? evalBakedProcedural(px, t) : evalProceduralPattern(px, t));
            return fg_pm + bg_pm * (1.0 - fg_pm.a);
        }
        vec4 applyGpuFilters(vec4 res, vec2 px, float t) {
            float a = res.a;
            if (a <= 0.001) return vec4(0.0);
            vec3 rgb = clamp(res.rgb / a, 0.0, 1.0);
            rgb *= max(0.0, flt_brightness / 100.0);
            rgb = clamp((rgb - 0.5) * max(0.0, flt_contrast / 100.0) + 0.5, 0.0, 1.0);
            if (abs(flt_hue_rad) > 0.001) rgb = clamp(hueShiftRgb(rgb, flt_hue_rad), 0.0, 1.0);
            float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
            if (abs(flt_saturate - 100.0) > 0.5) rgb = clamp(mix(vec3(luma), rgb, max(0.0, flt_saturate / 100.0)), 0.0, 1.0);
            if (flt_grayscale > 0.5) {
                float gl = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
                rgb = mix(rgb, vec3(gl), clamp(flt_grayscale / 100.0, 0.0, 1.0));
            }
            if (flt_duo_on > 0.5) {
                float dl = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
                rgb = mix(flt_duo_dark.rgb, flt_duo_light.rgb, clamp(dl, 0.0, 1.0));
            }
            if (flt_tint_on > 0.5) {
                rgb = mix(rgb, flt_tint_color.rgb, clamp(flt_tint_amt / 100.0, 0.0, 1.0));
            }
            if (flt_grain_amt > 0.005) {
                float g_px = max(0.5, flt_grain_size / 100.0);
                vec2 g_seed = floor(px / g_px) + ((flt_grain_anim > 0.5) ? vec2(floor(t * 24.0) * 1.37, floor(t * 24.0) * 0.73) : vec2(0.0));
                rgb = clamp(rgb + (hash21(g_seed) - 0.5) * (flt_grain_amt / 100.0), 0.0, 1.0);
            }
            return vec4(rgb * a, a);
        }
        void main() {
            vec2 uv_top = vec2(v_uv.x, 1.0 - v_uv.y);
#ifdef SP_SCENE_PASS
            vec2 px = uv_top * (canvas_size + 2.0 * scene_padding) - scene_padding;
            gl_FragColor = evalSceneSample(px / canvas_size, px, anim_time);
#else
            vec2 px = uv_top * canvas_size;
#ifdef SP_BLUR_PASS
            vec2 dims = canvas_size + 2.0 * scene_padding;
            vec2 coord = (px + scene_padding) / dims;
            coord.y = 1.0 - coord.y;
            vec4 res = texture2D(scene_tex, coord);
#else
            vec4 res = evalSceneSample(uv_top, px, anim_time);
#endif
            if (flt_blur > 0.25) {
                float br = clamp(flt_blur, 0.25, 60.0);
                vec2 inv_sz = 1.0 / max(canvas_size, vec2(1.0));
                vec4 acc = res;
                float w_sum = 1.0;
                for (int bi = 0; bi < 16; bi++) {
                    float fbi = float(bi);
                    float b_ang = fbi * 2.3999632 + 0.41;
                    float b_rr = sqrt((fbi + 0.5) / 16.0);
                    float b_w = exp(-2.2 * b_rr * b_rr);
                    vec2 b_off = vec2(cos(b_ang), sin(b_ang)) * (b_rr * br);
#ifdef SP_BLUR_PASS
                    acc += texture2D(scene_tex, coord + vec2(b_off.x, -b_off.y) / dims) * b_w;
#else
                    acc += evalSceneSample(uv_top + b_off * inv_sz, px + b_off, anim_time) * b_w;
#endif
                    w_sum += b_w;
                }
                res = acc / w_sum;
            }
            res = applyGpuFilters(res, px, anim_time);
            if (vignette_amt > 0.005) {
                float vr = length((v_uv - 0.5) * 2.0);
                float va = smoothstep(0.35, 1.42, vr) * vignette_amt * vignette_color.a;
                res = vec4(mix(res.rgb, vignette_color.rgb * res.a, va), res.a);
            }
            res *= clamp(opacity, 0.0, 1.0);
            if (show_checker > 0.5) {
                vec2 ch = floor(px / 16.0);
                vec3 chk = (mod(ch.x + ch.y, 2.0) < 0.5) ? vec3(0.11, 0.14, 0.18) : vec3(0.16, 0.20, 0.25);
                res = vec4(res.rgb + chk * (1.0 - res.a), 1.0);
            }
            gl_FragColor = res;
#endif
        }
    `;

    let glCtx = null;
    let glProg = null;
    let glTex = null;
    let glUniforms = null;
    let glSceneProg = null;
    let glBlurProg = null;
    let glSceneUniforms = null;
    let glBlurUniforms = null;
    let glSceneTexture = null;
    let glSceneFramebuffer = null;
    let glSceneWidth = 0;
    let glSceneHeight = 0;
    let lastPreviewUsesBlur = false;
    let initPreviewBlur = null;
    const glPositions = new Map();
    let previewDirty = true;
    let lastAnimDrawMs = 0;
    let lastDimsText = '';
    let hasStampTexture = false;
    let stampTexSize = [512, 512];
    let loadedStampFile = '';
    let hasSyncedObsOnce = false;

    function loadStampPreviewImage(fileName, forceReload = false) {
        if (!fileName) {
            hasStampTexture = false;
            stampTexSize = [512, 512];
            loadedStampFile = '';
            previewDirty = true;
            return;
        }
        if (!forceReload && fileName === loadedStampFile && hasStampTexture) return;
        const img = new Image();
        img.onload = () => {
            if (!ensureWebGL(document.getElementById('op-preview-canvas'))) return;
            const gl = glCtx;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, glTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            stampTexSize = [img.naturalWidth || img.width || 512, img.naturalHeight || img.height || 512];
            hasStampTexture = true;
            loadedStampFile = fileName;
            previewDirty = true;
            schedulePreviewDraw();
            const curPr = workingProfile?.procedural;
            if (workingProfile?.mode === 'procedural' && curPr?.preset && !ANALYTIC_GPU_SET.has(curPr.preset) && curPr.preset !== 'confetti' && stampTexSize[0] <= 512) {
                bakeProceduralPresetToStamp(curPr.preset);
            }
        };
        img.src = `/api/obs-patterns/stamps/${encodeURIComponent(fileName)}?v=${Date.now()}`;
    }

    function ensureWebGL(canvas) {
        if (glCtx) return true;
        if (!canvas) return false;
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
        if (!gl) return false;
        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.error('[ObsPatterns WebGL]', gl.getShaderInfoLog(sh));
                return null;
            }
            return sh;
        };
        const makeProgram = define => {
            const vs = compile(gl.VERTEX_SHADER, VERT_GLSL);
            const fs = compile(gl.FRAGMENT_SHADER, `${define}${FRAG_GLSL}`);
            if (!vs || !fs) {
                if (vs) gl.deleteShader(vs);
                if (fs) gl.deleteShader(fs);
                return null;
            }
            const prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                console.error('[ObsPatterns WebGL]', gl.getProgramInfoLog(prog));
                gl.deleteProgram(prog);
                return null;
            }
            glPositions.set(prog, gl.getAttribLocation(prog, 'a_pos'));
            return prog;
        };
        const prog = makeProgram('');
        if (!prog) return false;
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = glPositions.get(prog);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const names = [
            'stamp_tex', 'canvas_size', 'stamp_size', 'stamp_grid', 'mode_code', 'anim_time', 'opacity',
            'bg_type', 'bg_color', 'bg_color2', 'bg_color3', 'bg_use_mid',
            'bg_angle_rad', 'bg_center', 'bg_radius', 'bg_motion', 'bg_motion_speed',
            'vignette_amt', 'vignette_color',
            'proc_preset', 'proc_scale', 'proc_line_w', 'proc_accent', 'proc_secondary',
            'pal_c0', 'pal_c1', 'pal_c2', 'pal_c3', 'pal_c4', 'pal_c5', 'pal_c6', 'pal_count',
            'proc_fill_mode', 'proc_fill_opacity', 'proc_color_mode', 'proc_color_anim', 'proc_color_speed',
            'proc_motion', 'proc_speed', 'proc_pan_osc', 'proc_pan_rad',
            'proc_inplace_mode', 'proc_inplace_speed', 'proc_spin_mode', 'proc_spin_speed',
            'proc_density', 'proc_spacing', 'proc_size_var', 'proc_scatter', 'proc_rot_var',
            'flt_brightness', 'flt_contrast', 'flt_saturate', 'flt_grayscale', 'flt_hue_rad', 'flt_blur',
            'flt_duo_on', 'flt_duo_dark', 'flt_duo_light', 'flt_tint_on', 'flt_tint_color', 'flt_tint_amt',
            'flt_grain_amt', 'flt_grain_size', 'flt_grain_anim',
            'tile_count', 'tile_dist', 'tile_layout', 'tile_symmetry', 'tile_wedges',
            'tile_kaleido_morph', 'tile_kaleido_speed', 'tile_kaleido_dir', 'tile_kaleido_depth',
            'tile_size', 'tile_gap', 'tile_offset_x', 'tile_offset_y', 'tile_grid_rad', 'tile_angle_rad',
            'tile_alt_flip', 'tile_opacity', 'tile_alt_opacity', 'tile_alt_scale',
            'tile_motion', 'tile_track_mode', 'tile_spin_dir', 'tile_scroll_rad', 'tile_speed', 'tile_spin_rad', 'tile_wave_amt',
            'tile_hue_mode', 'tile_hue_speed', 'tile_hue_jitter', 'tile_sat_jitter', 'tile_bright_jitter',
            'tile_scale_jitter', 'tile_rot_jitter', 'tile_pos_jitter', 'tile_twinkle', 'tile_twinkle_speed',
            'tile_tint', 'tile_color_source', 'tile_pal_cmode', 'tile_pal_canim', 'tile_pal_cspeed',
            'tile_pal_style', 'tile_pal_blend', 'tile_pal_strength', 'tile_pal_scale', 'tile_pal_angle_rad',
            'has_stamp', 'show_checker', 'scene_tex', 'scene_padding'
        ];
        const uniforms = program => {
            const result = {};
            if (program) names.forEach(n => { result[n] = gl.getUniformLocation(program, n); });
            return result;
        };
        glUniforms = uniforms(prog);
        initPreviewBlur = () => {
            initPreviewBlur = null;
            glSceneProg = makeProgram('#define SP_SCENE_PASS\n');
            glBlurProg = makeProgram('#define SP_BLUR_PASS\n');
            if (!glSceneProg || !glBlurProg) {
                for (const program of [glSceneProg, glBlurProg]) {
                    if (program) { glPositions.delete(program); gl.deleteProgram(program); }
                }
                glSceneProg = null;
                glBlurProg = null;
            }
            glSceneUniforms = uniforms(glSceneProg);
            glBlurUniforms = uniforms(glBlurProg);
        };

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

    function uploadPreviewUniforms(gl, u, p, w, h, nowMs) {
        const pr = p.procedural || {};
        const tl = p.tiles || {};
        const bgC = hexToRgbaFloats(resolveColor(p.bgColor, '#0B101BFF'));
        const bgC2 = hexToRgbaFloats(resolveColor(p.bgColor2, '#1E1B4BFF'));
        const bgC3 = hexToRgbaFloats(resolveColor(p.bgColor3, '#0F766EFF'));
        const vigC = hexToRgbaFloats(resolveColor(p.vignetteColor, '#000000FF'));
        const accC = hexToRgbaFloats(resolveColor(pr.accent, '#58A6FFFF'));
        const secC = hexToRgbaFloats(resolveColor(pr.secondary, '#A855F7FF'));
        const tintC = hexToRgbaFloats(resolveColor(tl.tintColor, '#FFFFFFFF'));

        const palSrc = p.mode === 'tiles' ? tl : pr;
        const palAccC = p.mode === 'tiles' ? hexToRgbaFloats(resolveColor(tl.accent, '#58A6FFFF')) : accC;
        const palSecC = p.mode === 'tiles' ? hexToRgbaFloats(resolveColor(tl.secondary, '#A855F7FF')) : secC;
        let palHexList = null;
        if (palSrc.palette === 'custom' && Array.isArray(palSrc.customColors) && palSrc.customColors.length >= 2) {
            palHexList = palSrc.customColors.slice(0, 7).map(c => hexToRgbaFloats(resolveColor(c, '#58A6FFFF')));
        } else if (palSrc.palette && palSrc.palette !== 'dual' && Array.isArray(PALETTES[palSrc.palette])) {
            palHexList = PALETTES[palSrc.palette].slice(0, 7).map(c => hexToRgbaFloats(c));
        }
        const palCount = palHexList ? palHexList.length : 2;
        const stops = palHexList || [palAccC, palSecC];

        gl.uniform1i(u.stamp_tex, 0);
        gl.uniform2f(u.canvas_size, w, h);
        gl.uniform2f(u.stamp_size, stampTexSize[0], stampTexSize[1]);
        gl.uniform1f(u.mode_code, p.mode === 'tiles' ? 1 : 0);
        const elapsedMs = previewPaused ? pausedElapsedMs : Math.max(0, nowMs - animOriginMs);
        gl.uniform1f(u.anim_time, elapsedMs / 1000);
        gl.uniform1f(u.opacity, resolveNum(p.opacity, 100, 0, 100) / 100);
        gl.uniform1f(u.bg_type, BG_TYPE_CODE_MAP[p.bgType || 'solid'] ?? 1);
        gl.uniform4f(u.bg_color, bgC[0], bgC[1], bgC[2], bgC[3]);
        gl.uniform4f(u.bg_color2, bgC2[0], bgC2[1], bgC2[2], bgC2[3]);
        gl.uniform4f(u.bg_color3, bgC3[0], bgC3[1], bgC3[2], bgC3[3]);
        gl.uniform1f(u.bg_use_mid, p.bgUseMid ? 1 : 0);
        gl.uniform1f(u.bg_angle_rad, (Number(p.bgAngle ?? 135) * Math.PI) / 180);
        gl.uniform2f(u.bg_center, Number(p.bgCenterX ?? 50), Number(p.bgCenterY ?? 50));
        gl.uniform1f(u.bg_radius, Number(p.bgRadius ?? 75));
        gl.uniform1f(u.bg_motion, BG_MOTION_CODE_MAP[p.bgMotion || 'none'] ?? 0);
        gl.uniform1f(u.bg_motion_speed, Number(p.bgMotionSpeed ?? 1));
        gl.uniform1f(u.vignette_amt, resolveNum(p.vignette, 25, 0, 100) / 100);
        gl.uniform4f(u.vignette_color, vigC[0], vigC[1], vigC[2], vigC[3]);

        gl.uniform1f(u.proc_preset, PATTERN_CODE_MAP[pr.preset] ?? 3);
        gl.uniform1f(u.proc_scale, resolveNum(pr.scale, 100, 15, 400));
        gl.uniform1f(u.proc_line_w, resolveNum(pr.lineWidth, 2, 0.5, 24));
        gl.uniform4f(u.proc_accent, accC[0], accC[1], accC[2], accC[3]);
        gl.uniform4f(u.proc_secondary, secC[0], secC[1], secC[2], secC[3]);
        const sStop = (i) => stops[i] || stops[i % stops.length] || accC;
        for (let si = 0; si < 7; si++) {
            const c = sStop(si);
            gl.uniform4f(u[`pal_c${si}`], c[0], c[1], c[2], c[3]);
        }
        gl.uniform1f(u.pal_count, palCount);
        gl.uniform1f(u.proc_fill_mode, PROC_FILL_CODE_MAP[pr.fillMode] ?? 0);
        gl.uniform1f(u.proc_fill_opacity, Number(pr.fillOpacity ?? 35));
        gl.uniform1f(u.proc_color_mode, PROC_CMODE_CODE_MAP[pr.colorMode] ?? 0);
        gl.uniform1f(u.proc_color_anim, PROC_CANIM_CODE_MAP[pr.colorAnim] ?? 0);
        gl.uniform1f(u.proc_color_speed, resolveNum(pr.colorSpeed, 1, 0, 5));
        gl.uniform1f(u.proc_motion, PROC_MOTION_CODE_MAP[pr.motion] ?? 1);
        gl.uniform1f(u.proc_speed, resolveNum(pr.speed, 1, 0, 10));
        gl.uniform1f(u.proc_pan_osc, pr.panDirection === 'oscillate' ? 1 : 0);
        gl.uniform1f(u.proc_pan_rad, (resolveNum(pr.panAngle, 45, -360, 360) * Math.PI) / 180);
        gl.uniform1f(u.proc_inplace_mode, PROC_INPLACE_CODE_MAP[pr.inPlace] ?? 1);
        gl.uniform1f(u.proc_inplace_speed, Number(pr.inPlaceSpeed ?? 1));
        gl.uniform1f(u.proc_spin_mode, pr.spin === 'cw' ? 1 : (pr.spin === 'ccw' ? 2 : (pr.spin === 'sway' ? 3 : 0)));
        gl.uniform1f(u.proc_spin_speed, Number(pr.spinSpeed ?? 1));
        gl.uniform1f(u.proc_density, resolveNum(pr.density, 1, 0.25, 4));
        gl.uniform1f(u.proc_spacing, resolveNum(pr.spacing, 100, 50, 300));
        gl.uniform1f(u.proc_size_var, resolveNum(pr.sizeVariance, 0, 0, 100));
        gl.uniform1f(u.proc_scatter, resolveNum(pr.scatter, 0, 0, 100));
        gl.uniform1f(u.proc_rot_var, Number(pr.rotationVariance ?? 0));
        const hasVoronoiGrid = !ANALYTIC_GPU_SET.has(pr.preset) && pr.preset !== 'confetti' && pr.preset !== 'christmas-lights' && pr.preset !== 'football-field';
        const fallbackGrid = (hasVoronoiGrid && !(Number(pr.stampCols) > 0))
            ? window.StreamPulsePatternBake.spec(pr.preset, resolveNum(pr.density, 1, 0.25, 4), resolveNum(pr.spacing, 100, 50, 300))
            : { cols: Number(pr.stampCols) || 0, rows: Number(pr.stampRows) || 0 };
        gl.uniform2f(u.stamp_grid, fallbackGrid.cols, fallbackGrid.rows);

        const fl = p.filters || {};
        const flDuo = fl.duotone || {};
        const flTint = fl.tint || {};
        const flGrain = fl.grain || {};
        const duoDarkC = hexToRgbaFloats(resolveColor(flDuo.dark, '#1E1B4BFF'));
        const duoLightC = hexToRgbaFloats(resolveColor(flDuo.light, '#22D3EEFF'));
        const flTintC = hexToRgbaFloats(resolveColor(flTint.color, '#58A6FFFF'));
        gl.uniform1f(u.flt_brightness, resolveNum(fl.brightness, 100, 0, 200));
        gl.uniform1f(u.flt_contrast, resolveNum(fl.contrast, 100, 0, 200));
        gl.uniform1f(u.flt_saturate, resolveNum(fl.saturate, 100, 0, 300));
        gl.uniform1f(u.flt_grayscale, resolveNum(fl.grayscale, 0, 0, 100));
        gl.uniform1f(u.flt_hue_rad, (resolveNum(fl.hueRotate, 0, -180, 180) * Math.PI) / 180);
        gl.uniform1f(u.flt_blur, resolveNum(fl.blur, 0, 0, 60));
        gl.uniform1f(u.flt_duo_on, flDuo.enabled ? 1 : 0);
        gl.uniform4f(u.flt_duo_dark, duoDarkC[0], duoDarkC[1], duoDarkC[2], duoDarkC[3]);
        gl.uniform4f(u.flt_duo_light, duoLightC[0], duoLightC[1], duoLightC[2], duoLightC[3]);
        gl.uniform1f(u.flt_tint_on, flTint.enabled ? 1 : 0);
        gl.uniform4f(u.flt_tint_color, flTintC[0], flTintC[1], flTintC[2], flTintC[3]);
        gl.uniform1f(u.flt_tint_amt, Number(flTint.opacity ?? 25));
        gl.uniform1f(u.flt_grain_amt, flGrain.enabled ? Number(flGrain.amount ?? 18) : 0);
        gl.uniform1f(u.flt_grain_size, Number(flGrain.size ?? 150));
        gl.uniform1f(u.flt_grain_anim, flGrain.animate !== false ? 1 : 0);

        const slots = Array.isArray(tl.slots) && tl.slots.length > 0 ? tl.slots : [{}];
        gl.uniform1f(u.tile_count, slots.length);
        gl.uniform1f(u.tile_dist, TILE_DIST_CODE_MAP[tl.tileDistribution] ?? 0);
        gl.uniform1f(u.tile_layout, TILE_LAYOUT_CODE_MAP[tl.layout] ?? 1);
        gl.uniform1f(u.tile_symmetry, TILE_SYMMETRY_CODE_MAP[tl.symmetry] ?? 0);
        gl.uniform1f(u.tile_wedges, Number(tl.wedges ?? 6));
        gl.uniform1f(u.tile_kaleido_morph, tl.kaleidoMorph !== false ? 1 : 0);
        gl.uniform1f(u.tile_kaleido_speed, Number(tl.kaleidoSpeed ?? 8));
        gl.uniform1f(u.tile_kaleido_dir, tl.kaleidoDirection === 'ccw' ? 1 : 0);
        gl.uniform1f(u.tile_kaleido_depth, Number(tl.kaleidoDepth ?? 35));
        gl.uniform1f(u.tile_size, resolveNum(tl.tileSize, 96, 16, 512));
        gl.uniform1f(u.tile_gap, resolveNum(tl.gap, 18, 0, 256));
        gl.uniform1f(u.tile_offset_x, Number(tl.offsetX ?? 50));
        gl.uniform1f(u.tile_offset_y, Number(tl.offsetY ?? 50));
        gl.uniform1f(u.tile_grid_rad, (Number(tl.gridAngle ?? 0) * Math.PI) / 180);
        gl.uniform1f(u.tile_angle_rad, (Number(tl.tileAngle ?? 0) * Math.PI) / 180);
        gl.uniform1f(u.tile_alt_flip, TILE_ALT_FLIP_CODE_MAP[tl.alternateFlip] ?? 0);
        gl.uniform1f(u.tile_opacity, Number(tl.tileOpacity ?? 1));
        gl.uniform1f(u.tile_alt_opacity, Number(tl.altOpacity ?? 0.65));
        gl.uniform1f(u.tile_alt_scale, Number(tl.altScale ?? 1));
        gl.uniform1f(u.tile_motion, TILE_MOTION_CODE_MAP[tl.motion] ?? 1);
        gl.uniform1f(u.tile_track_mode, TILE_TRACK_CODE_MAP[tl.trackMode] ?? 0);
        gl.uniform1f(u.tile_spin_dir, TILE_SPIN_DIR_CODE_MAP[tl.spinDirection] ?? 0);
        gl.uniform1f(u.tile_scroll_rad, (Number(tl.scrollAngle ?? 35) * Math.PI) / 180);
        gl.uniform1f(u.tile_speed, resolveNum(tl.speed, 16, 0, 200));
        gl.uniform1f(u.tile_spin_rad, (Number(tl.spinSpeed ?? 8) * Math.PI) / 180);
        gl.uniform1f(u.tile_wave_amt, Number(tl.waveAmount ?? 25));
        gl.uniform1f(u.tile_hue_mode, TILE_HUE_CODE_MAP[tl.hueShift] ?? 0);
        gl.uniform1f(u.tile_hue_speed, Number(tl.hueSpeed ?? 14));
        gl.uniform1f(u.tile_hue_jitter, Number(tl.hueJitter ?? 0));
        gl.uniform1f(u.tile_sat_jitter, Number(tl.saturationJitter ?? 0));
        gl.uniform1f(u.tile_bright_jitter, Number(tl.brightnessJitter ?? 0));
        gl.uniform1f(u.tile_scale_jitter, Number(tl.scaleJitter ?? 0));
        gl.uniform1f(u.tile_rot_jitter, Number(tl.rotationJitter ?? 0));
        gl.uniform1f(u.tile_pos_jitter, Number(tl.positionJitter ?? 0));
        gl.uniform1f(u.tile_twinkle, Number(tl.twinkle ?? 0));
        gl.uniform1f(u.tile_twinkle_speed, Number(tl.twinkleSpeed ?? 4));
        gl.uniform4f(u.tile_tint, tintC[0], tintC[1], tintC[2], tintC[3]);
        gl.uniform1f(u.tile_color_source, TILE_COLOR_SOURCE_CODE_MAP[tl.colorSource] ?? 0);
        gl.uniform1f(u.tile_pal_cmode, PROC_CMODE_CODE_MAP[tl.colorMode] ?? 0);
        gl.uniform1f(u.tile_pal_canim, PROC_CANIM_CODE_MAP[tl.colorAnim] ?? 0);
        gl.uniform1f(u.tile_pal_cspeed, resolveNum(tl.colorSpeed, 1, 0, 5));
        gl.uniform1f(u.tile_pal_style, TILE_PALETTE_STYLE_CODE_MAP[tl.paletteStyle] ?? 0);
        gl.uniform1f(u.tile_pal_blend, TILE_PALETTE_BLEND_CODE_MAP[tl.paletteBlend] ?? 1);
        gl.uniform1f(u.tile_pal_strength, resolveNum(tl.paletteStrength, 100, 0, 100) / 100);
        gl.uniform1f(u.tile_pal_scale, resolveNum(tl.paletteScale, 100, 25, 500) / 100);
        gl.uniform1f(u.tile_pal_angle_rad, (resolveNum(tl.paletteAngle, 0, -360, 360) * Math.PI) / 180);
        const wantsProcBake = p.mode !== 'tiles' && !ANALYTIC_GPU_SET.has(pr.preset);
        const activeStampFile = p.mode === 'tiles' ? tl.stampFile : (wantsProcBake ? pr.bakedStampFile : '');
        gl.uniform1f(u.has_stamp, (hasStampTexture && activeStampFile) ? 1 : 0);
        gl.uniform1f(u.show_checker, previewBg === 'transparent' ? 1 : 0);
    }

    function releasePreviewScene(gl) {
        if (glSceneFramebuffer) gl.deleteFramebuffer(glSceneFramebuffer);
        if (glSceneTexture) gl.deleteTexture(glSceneTexture);
        glSceneFramebuffer = null;
        glSceneTexture = null;
        glSceneWidth = 0;
        glSceneHeight = 0;
    }

    function ensurePreviewScene(gl, width, height) {
        if (glSceneFramebuffer && width === glSceneWidth && height === glSceneHeight) return true;
        releasePreviewScene(gl);
        if (width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return false;
        glSceneTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, glSceneTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        glSceneFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, glSceneFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glSceneTexture, 0);
        const ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        if (!ready) { releasePreviewScene(gl); return false; }
        glSceneWidth = width;
        glSceneHeight = height;
        return true;
    }

    function drawPreviewFrame(nowMs) {
        const canvas = document.getElementById('op-preview-canvas');
        if (!canvas || !workingProfile || !ensureWebGL(canvas)) return;
        const gl = glCtx;
        const p = workingProfile;
        const pr = p.procedural || {};
        const w = Math.max(64, Number(p.width) || 1920);
        const h = Math.max(64, Number(p.height) || 1080);
        const blur = resolveNum(p.filters?.blur, 0, 0, 60);
        if (blur > 0.25 && initPreviewBlur) initPreviewBlur();
        const padX = Math.ceil(blur * canvas.width / w) + 1;
        const padY = Math.ceil(blur * canvas.height / h) + 1;
        const useBlur = blur > 0.25 && glSceneProg && glBlurProg
            && ensurePreviewScene(gl, canvas.width + padX * 2, canvas.height + padY * 2);
        if (Boolean(useBlur) !== lastPreviewUsesBlur) previewDirty = true;
        lastPreviewUsesBlur = Boolean(useBlur);
        if (!useBlur && blur <= 0.25 && glSceneFramebuffer) releasePreviewScene(gl);
        const nextDimsText = `${w}×${h} • ${p.mode === 'tiles' ? 'GPU Pattern Tile' : `GPU Procedural (${pr.preset || 'hexagons'})`}`;
        if (nextDimsText !== lastDimsText) {
            const el = document.getElementById('op-preview-dims');
            if (el) el.textContent = nextDimsText;
            lastDimsText = nextDimsText;
        }

        const draw = (program, u, scene) => {
            gl.useProgram(program);
            const loc = glPositions.get(program);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            if (previewDirty) uploadPreviewUniforms(gl, u, p, w, h, nowMs);
            else {
                const elapsedMs = previewPaused ? pausedElapsedMs : Math.max(0, nowMs - animOriginMs);
                gl.uniform1f(u.anim_time, elapsedMs / 1000);
            }
            if (useBlur) {
                if (!scene) {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, glSceneTexture);
                    gl.activeTexture(gl.TEXTURE0);
                }
                gl.uniform2f(u.scene_padding, padX * w / canvas.width, padY * h / canvas.height);
                gl.uniform1i(u.scene_tex, 1);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, scene ? glSceneFramebuffer : null);
            gl.viewport(0, 0, scene ? glSceneWidth : canvas.width, scene ? glSceneHeight : canvas.height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        if (useBlur) draw(glSceneProg, glSceneUniforms, true);
        draw(useBlur ? glBlurProg : glProg, useBlur ? glBlurUniforms : glUniforms, false);
        previewDirty = false;
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
        if (activeTab !== 'designer' || document.hidden || !workingProfile) return;
        const p = workingProfile;
        const bgAnim = p.bgType && p.bgType !== 'solid' && p.bgType !== 'transparent' && p.bgMotion && p.bgMotion !== 'none';
        const isAnimated = !previewPaused && (bgAnim || (p.filters?.grain?.enabled && p.filters.grain.animate !== false && Number(p.filters.grain.amount ?? 18) > 0) || (p.mode === 'tiles'
            ? (p.tiles?.motion !== 'none' || (p.tiles?.colorSource === 'palette' ? p.tiles?.colorAnim !== 'none' : p.tiles?.hueShift !== 'none') || (p.tiles?.symmetry === 'radial' && p.tiles?.kaleidoMorph !== false) || Number(p.tiles?.twinkle || 0) > 0)
            : (p.procedural?.motion !== 'none' || p.procedural?.colorAnim !== 'none' || (p.procedural?.inPlace && p.procedural?.inPlace !== 'none') || (p.procedural?.spin && p.procedural?.spin !== 'none'))));

        if (isAnimated) {
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
    // Sources, Profiles, & OBS WebSocket
    // ------------------------------------------------------------------------
    function renderProfileSelector() {
        const sel = document.getElementById('op-profile-select');
        const createSel = document.getElementById('op-create-profile');
        if (!studioState) return;
        const opts = studioState.profiles.map(p => {
            const act = p.id === studioState.activeProfileId ? ' (Default)' : '';
            return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${act}</option>`;
        }).join('');
        if (sel) {
            sel.innerHTML = opts;
            sel.value = selectedProfileId;
        }
        if (createSel) {
            createSel.innerHTML = `<option value="auto">Auto (Default Active)</option>${opts}`;
        }
        const activePill = document.getElementById('op-active-pill');
        if (activePill) {
            const act = studioState.profiles.find(p => p.id === studioState.activeProfileId);
            activePill.textContent = `Default: ${act ? act.name : studioState.activeProfileId}`;
        }
    }

    function renderCreateSceneSelect() {
        const sel = document.getElementById('op-create-scene');
        if (!sel || !studioState) return;
        const scenes = studioState.knownScenes || [];
        sel.innerHTML = scenes.length
            ? scenes.map(sc => `<option value="${escapeHtml(sc)}">${escapeHtml(sc)}${sc === currentProgramScene ? ' (Live)' : ''}</option>`).join('')
            : '<option value="">Sync OBS first</option>';
        if (currentProgramScene && scenes.includes(currentProgramScene)) sel.value = currentProgramScene;
    }

    function renderSourceList() {
        const host = document.getElementById('op-source-list');
        const strip = document.getElementById('op-summary-strip');
        if (!host || !studioState) return;

        const sources = studioState.knownPatternSources || [];
        const scenes = studioState.knownScenes || [];
        const profiles = studioState.profiles || [];
        const assignments = studioState.assignments || {};
        const query = (document.getElementById('op-source-search')?.value || '').trim().toLowerCase();

        if (strip) {
            strip.textContent = obsConnected
                ? `Live OBS synced: ${sources.length} pattern source(s) across ${scenes.length} scenes${currentProgramScene ? ` (program scene: ${currentProgramScene})` : ''}.`
                : `OBS offline: ${sources.length} cached pattern source(s), ${profiles.length} saved profiles.`;
        }

        const profileOpts = (cur) => `<option value="auto"${cur === 'auto' ? ' selected' : ''}>Auto (Active Default)</option>` +
            profiles.map(p => `<option value="${escapeHtml(p.id)}"${cur === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

        const profileForId = (pid) => {
            if (!pid || pid === 'auto') return profiles.find(p => p.id === studioState.activeProfileId) || profiles[0];
            return profiles.find(p => p.id === pid) || profiles.find(p => p.id === studioState.activeProfileId) || profiles[0];
        };

        const renderSourceRow = (src) => {
            const cfg = assignments[src] || { defaultProfileId: 'auto', sceneOverrides: {} };
            const scList = studioState.sourceSceneMap?.[src] || [];
            const isOpen = expandedGroups.has(`src:${src}`);
            const prof = profileForId(cfg.defaultProfileId);
            const swatchColor = resolveColor(prof?.procedural?.accent || prof?.bgColor || '#58A6FFFF', '#58A6FFFF').slice(0, 7);
            const ovCount = Object.keys(cfg.sceneOverrides || {}).length;
            const targetScCount = scList.length || 1;
            const liveBadge = scList.includes(currentProgramScene) ? '<span class="ob-pill live-scene">OBS ACTIVE</span>' : '';
            const layersSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';

            return `
                <div class="ob-row">
                    <div class="ob-row-main">
                        <div class="ob-row-info">
                            <span class="ob-src-icon is-active" aria-hidden="true">${layersSvg}</span>
                            <span class="ob-swatch" style="background:${escapeHtml(swatchColor)};" title="Pattern Accent"></span>
                            <strong>${escapeHtml(src)}</strong>
                            ${liveBadge}
                            <button type="button" class="ob-scenes-toggle${ovCount ? ' has-overrides' : ''}" data-toggle-group="src:${escapeHtml(src)}">
                                ${scList.length} ${scList.length === 1 ? 'scene' : 'scenes'}${ovCount ? ` • ${ovCount} override${ovCount === 1 ? '' : 's'}` : ''} ${isOpen ? '▴' : '▾'}
                            </button>
                        </div>
                        <div class="ob-source-controls">
                            <select data-op-assign-src="${escapeHtml(src)}" data-op-assign-scene="" aria-label="Default profile for ${escapeHtml(src)}">${profileOpts(cfg.defaultProfileId || 'auto')}</select>
                            <button type="button" class="btn btn-sm" data-op-edit-profile="${escapeHtml(prof?.id || '')}">Edit</button>
                            <button type="button" class="btn btn-sm primary" data-op-sync-src="${escapeHtml(src)}">Sync Source</button>
                        </div>
                    </div>
                    <div class="ob-drawer"${isOpen ? '' : ' hidden'}>
                        <div class="ob-drawer-head">Per-Scene Overrides (${targetScCount} ${targetScCount === 1 ? 'scene' : 'scenes'})</div>
                        <div class="ob-source-scenes">
                            ${(scList.length ? scList : scenes).map(sc => {
                                const ov = cfg.sceneOverrides?.[sc] || 'inherit';
                                return `
                                    <div class="ob-scene-override-item">
                                        <span class="ob-scene-override-name">${escapeHtml(sc)}${sc === currentProgramScene ? ' <span class="ob-pill live-scene">LIVE</span>' : ''}</span>
                                        <select data-op-assign-src="${escapeHtml(src)}" data-op-assign-scene="${escapeHtml(sc)}">
                                            <option value="inherit"${ov === 'inherit' ? ' selected' : ''}>Inherit Default</option>
                                            ${profiles.map(p => `<option value="${escapeHtml(p.id)}"${ov === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                                        </select>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        };

        let html = '';
        if (listViewMode === 'scenes') {
            const matchedScenes = scenes.filter(sc => !query || sc.toLowerCase().includes(query) || sources.some(src => (studioState.sourceSceneMap?.[src] || []).includes(sc) && src.toLowerCase().includes(query)));
            html = matchedScenes.map(sc => {
                const scSources = sources.filter(src => (studioState.sourceSceneMap?.[src] || []).includes(sc));
                const isOpen = expandedGroups.has(`scene:${sc}`) || sc === currentProgramScene;
                return `
                    <section class="ob-panel" style="margin-bottom:0;">
                        <div class="ob-panel-head" style="cursor:pointer;" data-toggle-group="scene:${escapeHtml(sc)}">
                            <span class="ob-panel-title">${escapeHtml(sc)}${sc === currentProgramScene ? ' <span class="ob-pill live-scene">LIVE</span>' : ''}</span>
                            <span class="ob-pill">${scSources.length} ${scSources.length === 1 ? 'SOURCE' : 'SOURCES'} ${isOpen ? '▴' : '▾'}</span>
                        </div>
                        <div${isOpen ? '' : ' hidden'}>
                            ${scSources.length ? scSources.map(src => {
                                const cfg = assignments[src] || { defaultProfileId: 'auto', sceneOverrides: {} };
                                const ov = cfg.sceneOverrides?.[sc] || 'inherit';
                                const prof = profileForId(ov === 'inherit' ? cfg.defaultProfileId : ov);
                                return `
                                    <div class="ob-row">
                                        <div class="ob-row-main">
                                            <div class="ob-row-info">
                                                <span class="ob-src-icon is-active" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg></span>
                                                <strong>${escapeHtml(src)}</strong>
                                            </div>
                                            <div class="ob-source-controls">
                                                <select data-op-assign-src="${escapeHtml(src)}" data-op-assign-scene="${escapeHtml(sc)}">
                                                    <option value="inherit"${ov === 'inherit' ? ' selected' : ''}>Inherit Default</option>
                                                    ${profiles.map(p => `<option value="${escapeHtml(p.id)}"${ov === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                                                </select>
                                                <button type="button" class="btn btn-sm" data-op-edit-profile="${escapeHtml(prof?.id || '')}">Edit</button>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('') : `
                                <div class="ob-row">
                                    <div class="ob-row-main">
                                        <div class="ob-row-info"><span class="hint">No pattern background source in this scene yet.</span></div>
                                        <div class="ob-source-controls">
                                            <button type="button" class="btn btn-sm primary" data-op-quick-add="${escapeHtml(sc)}">+ Add Pattern Source</button>
                                        </div>
                                    </div>
                                </div>
                            `}
                        </div>
                    </section>
                `;
            }).join('') || '<div class="ob-panel ob-panel-pad hint">No matching OBS scenes found.</div>';
        } else {
            const matchedSources = sources.filter(src => !query || src.toLowerCase().includes(query) || (studioState.sourceSceneMap?.[src] || []).some(sc => sc.toLowerCase().includes(query)));
            html += `
                <section class="ob-panel" style="margin-bottom:0;">
                    <div class="ob-panel-head">
                        <span class="ob-panel-title">Active Pattern Sources</span>
                        <span class="ob-pill">${matchedSources.length}</span>
                    </div>
                    <div>
                        ${matchedSources.length ? matchedSources.map(renderSourceRow).join('') : '<div class="ob-row hint">No <strong>StreamPulse Pattern Background</strong> sources found in OBS yet. Click <strong>+ Add Pattern Source</strong> above to create one in any scene.</div>'}
                    </div>
                </section>
            `;
            const scenesWithout = scenes.filter(sc => (!query || sc.toLowerCase().includes(query)) && !sources.some(src => (studioState.sourceSceneMap?.[src] || []).includes(sc)));
            if (scenesWithout.length) {
                html += `
                    <section class="ob-panel" style="margin-bottom:0;">
                        <div class="ob-panel-head">
                            <span class="ob-panel-title">OBS Scenes Without Pattern Source</span>
                            <span class="ob-pill">${scenesWithout.length}</span>
                        </div>
                        <div>
                            ${scenesWithout.map(sc => `
                                <div class="ob-row">
                                    <div class="ob-row-main">
                                        <div class="ob-row-info">
                                            <span class="ob-src-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg></span>
                                            <strong>${escapeHtml(sc)}</strong>
                                            ${sc === currentProgramScene ? '<span class="ob-pill live-scene">LIVE</span>' : ''}
                                        </div>
                                        <div class="ob-source-controls">
                                            <button type="button" class="btn btn-sm" data-op-quick-add="${escapeHtml(sc)}">+ Add Pattern Source</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                `;
            }
        }

        host.innerHTML = html;

        host.querySelectorAll('[data-toggle-group]').forEach(btn => {
            btn.addEventListener('click', () => {
                const k = btn.dataset.toggleGroup;
                if (expandedGroups.has(k)) expandedGroups.delete(k);
                else expandedGroups.add(k);
                renderSourceList();
            });
        });

        host.querySelectorAll('[data-op-assign-src]').forEach(sel => {
            sel.addEventListener('change', async () => {
                const res = await fetch('/api/obs-patterns/assign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceName: sel.dataset.opAssignSrc,
                        sceneName: sel.dataset.opAssignScene || '',
                        profileId: sel.value
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    studioState = data.state;
                    renderSourceList();
                    showToast('Updated pattern source assignment');
                }
            });
        });

        host.querySelectorAll('[data-op-edit-profile]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pid = btn.dataset.opEditProfile;
                const found = studioState?.profiles.find(p => p.id === pid) || studioState?.profiles[0];
                if (found) {
                    selectedProfileId = found.id;
                    workingProfile = cloneProfile(found);
                    renderProfileSelector();
                    populateFormFromProfile();
                }
                switchTab('designer');
            });
        });

        host.querySelectorAll('[data-op-sync-src]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await syncFromObsWebSocket({ quiet: false });
            });
        });

        host.querySelectorAll('[data-op-quick-add]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sc = btn.dataset.opQuickAdd;
                const drawer = document.getElementById('op-create-drawer');
                const scSel = document.getElementById('op-create-scene');
                if (scSel && sc) scSel.value = sc;
                if (drawer) drawer.hidden = false;
                document.getElementById('op-create-name')?.focus();
            });
        });
    }

    function renderSetupInfo() {
        if (!studioState) return;
        const fp = document.getElementById('op-file-paths');
        if (fp) {
            fp.textContent = `Lua Script: ${studioState.luaScriptPath || '—'}\nManifest JSON: ${studioState.manifestPath || '—'}\nStamps Dir: ${studioState.stampsDir || '—'}`;
        }
    }

    function renderBakeWarning(error) {
        const warning = document.getElementById('op-bake-warning');
        if (!warning) return;
        warning.hidden = !error;
        warning.textContent = error ? `Pattern texture update failed: ${error}. Check the server log and restart StreamPulse after resolving the problem.` : '';
    }

    async function watchBakeStatus() {
        const { connectLiveSocket } = await import('/js/shared/client-core.js');
        let socket = null;
        const close = () => { socket?.close(); socket = null; };
        const open = () => {
            if (document.hidden || socket) return;
            socket = connectLiveSocket({
                onOpen: () => fetch('/api/obs-patterns', { cache: 'no-store' })
                    .then(response => response.ok ? response.json() : null)
                    .then(data => { if (data) renderBakeWarning(data.bakeError); }).catch(() => {}),
                onMessage: message => {
                    if (message.type === 'obs-patterns-update') renderBakeWarning(message.data?.bakeError);
                }
            });
        };
        document.addEventListener('visibilitychange', () => document.hidden ? close() : open());
        window.addEventListener('pagehide', close);
        window.addEventListener('pageshow', open);
        open();
    }

    async function refreshManifestPreview() {
        const box = document.getElementById('op-manifest-preview');
        if (!box) return;
        try {
            const res = await fetch('/api/obs-patterns/manifest', { cache: 'no-store' });
            box.textContent = JSON.stringify(await res.json(), null, 2);
        } catch {
            box.textContent = 'Failed to load manifest.';
        }
    }

    function switchTab(tab, { updateHash = true } = {}) {
        const cleanTab = (tab === 'designer' || tab === 'setup') ? tab : 'sources';
        activeTab = cleanTab;
        try { localStorage.setItem(TAB_STORAGE_KEY, cleanTab); } catch {}
        if (updateHash && window.location.hash !== `#${cleanTab}`) {
            try { history.replaceState(null, '', `#${cleanTab}`); } catch { window.location.hash = cleanTab; }
        }
        document.querySelectorAll('[data-op-tab]').forEach(btn => {
            const on = btn.dataset.opTab === cleanTab;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.getElementById('op-pane-sources').hidden = cleanTab !== 'sources';
        document.getElementById('op-pane-designer').hidden = cleanTab !== 'designer';
        document.getElementById('op-pane-setup').hidden = cleanTab !== 'setup';

        if (cleanTab === 'designer') schedulePreviewDraw();
        else {
            stopPreviewAnim();
            if (glCtx) releasePreviewScene(glCtx);
        }

        if (cleanTab === 'sources' && obsConnected && !hasSyncedObsOnce && studioState) {
            syncFromObsWebSocket({ quiet: true });
        }
        if (cleanTab === 'setup') refreshManifestPreview();
    }

    async function syncFromObsWebSocket({ quiet = false } = {}) {
        const out = document.getElementById('op-sync-status');
        try {
            const res = await fetch('/api/obs-patterns/obs-sync', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'OBS sync failed');
            studioState = data.state;
            currentProgramScene = data.currentProgramScene || '';
            obsConnected = true;
            hasSyncedObsOnce = true;
            renderCreateSceneSelect();
            renderSourceList();
            if (out) out.textContent = `Synced ${data.sourcesCount} pattern source(s) across ${data.scenesCount} OBS scenes.`;
            if (!quiet) showToast('Synced scenes & pattern sources from OBS');
        } catch (err) {
            if (out && !quiet) out.textContent = err.message || 'OBS sync failed';
            if (!quiet) showToast(err.message || 'OBS sync failed');
        }
    }

    async function loadStudioData() {
        try {
            const varsPromise = window.WizardVariableBinder?.fetchVariables
                ? window.WizardVariableBinder.fetchVariables(false).catch(() => null)
                : fetch('/api/variables', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
            const [patRes, vData] = await Promise.all([
                fetch('/api/obs-patterns', { cache: 'no-store' }),
                varsPromise
            ]);
            if (patRes.ok) {
                studioState = await patRes.json();
                renderBakeWarning(studioState.bakeError);
                variableSettingsEnabled = studioState.variableSettingsEnabled !== false;
                selectedProfileId = studioState.activeProfileId || studioState.profiles[0]?.id || '';
                const found = studioState.profiles.find(p => p.id === selectedProfileId) || studioState.profiles[0];
                workingProfile = found ? cloneProfile(found) : null;
            }
            if (vData && typeof vData === 'object') {
                variableValues = vData.values || {};
                if (typeof vData.variableSettingsEnabled === 'boolean') variableSettingsEnabled = vData.variableSettingsEnabled;
            }
            initVariableBinderOnce();
            renderProfileSelector();
            renderCreateSceneSelect();
            populateFormFromProfile();
            renderSetupInfo();

            const stRes = await fetch('/api/obs-patterns/obs-status', { cache: 'no-store' }).catch(() => null);
            if (stRes && stRes.ok) {
                const st = await stRes.json();
                obsConnected = Boolean(st.connected);
                const badge = document.getElementById('op-obs-ws-badge');
                if (badge) {
                    badge.textContent = st.connected ? `OBS Connected (${st.obsVersion || 'WS'})` : 'OBS Disconnected';
                    badge.style.color = st.connected ? '#3fb950' : '#d29922';
                }
                if (obsConnected && activeTab === 'sources') await syncFromObsWebSocket({ quiet: true });
                else renderSourceList();
            }
        } catch (err) {
            console.error('[ObsPatterns] Load failed:', err);
            showToast('Failed to load OBS Pattern Studio');
        }
    }

    let rebakeTimer = null;
    let latestProcBakeSeq = 0;
    let lastBakeSignature = '';
    function computeProceduralBakeSignature(pr) {
        if (!pr) return '';
        return JSON.stringify([
            pr.preset, pr.palette, pr.customColors, pr.accent, pr.secondary,
            pr.fillMode, pr.fillOpacity, pr.colorMode, pr.lineWidth, pr.density, pr.spacing,
            pr.scatter, pr.sizeVariance, pr.rotationVariance, pr.snowflakeStyle
        ]);
    }
    function scheduleProceduralRebake(force = false) {
        if (!workingProfile || workingProfile.mode !== 'procedural') return;
        const pr = workingProfile.procedural || {};
        const preset = pr.preset;
        if (!preset || ANALYTIC_GPU_SET.has(preset)) return;
        const sig = computeProceduralBakeSignature(pr);
        if (!force && sig === lastBakeSignature && pr.bakedStampFile) return;
        clearTimeout(rebakeTimer);
        rebakeTimer = setTimeout(() => { bakeProceduralPresetToStamp(preset); }, 140);
    }

    async function drawSlotIntoCell(ctx, slot, ox, oy, cellSize) {
        const sc = Math.max(0.25, Math.min(2.0, (Number(slot.scale ?? 100) || 100) / 100));
        const pad = Math.round(cellSize * (16 / 256));
        const inner = (cellSize - pad) * sc;
        const cx = ox + cellSize / 2;
        const cy = oy + cellSize / 2;

        if (slot.sourceType === 'image' && slot.src) {
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = slot.src;
            });
            const iw = Math.max(1, img.naturalWidth || img.width || 1);
            const ih = Math.max(1, img.naturalHeight || img.height || 1);
            const target = cellSize * sc;
            let dw;
            let dh;
            if (Math.abs(iw - ih) <= Math.max(2, Math.round(Math.max(iw, ih) * 0.015))) {
                dw = target;
                dh = target;
            } else {
                const s = Math.min(target / iw, target / ih);
                dw = iw * s;
                dh = ih * s;
            }
            ctx.save();
            ctx.beginPath();
            ctx.rect(ox, oy, cellSize, cellSize);
            ctx.clip();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
            ctx.restore();
            return;
        }

        if (slot.sourceType === 'icon' && slot.iconClass) {
            if (window.IconPicker?.ensureFont) window.IconPicker.ensureFont();
            if (document.fonts?.ready) await document.fonts.ready;
            const probe = document.createElement('i');
            probe.className = slot.iconClass;
            probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;font-size:160px;';
            document.body.appendChild(probe);
            let glyph = '';
            let fontFamily = '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif';
            let fontWeight = slot.iconClass.includes('fa-brands') ? '400' : '900';
            for (let attempt = 0; attempt < 10; attempt++) {
                const bs = getComputedStyle(probe, '::before');
                const es = getComputedStyle(probe);
                const raw = bs.content;
                if (raw && raw !== 'none' && raw !== 'normal') {
                    glyph = raw.replace(/^["']|["']$/g, '');
                    fontFamily = bs.fontFamily || es.fontFamily || fontFamily;
                    fontWeight = bs.fontWeight || es.fontWeight || fontWeight;
                    break;
                }
                await new Promise(r => setTimeout(r, 80));
            }
            probe.remove();
            if (glyph) {
                const fontSize = Math.round(inner * 0.78);
                await document.fonts?.load?.(`${fontWeight} ${fontSize}px ${fontFamily}`).catch(() => {});
                ctx.save();
                ctx.fillStyle = (slot.color || '#FFFFFFFF').slice(0, 7);
                ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(glyph, cx, cy);
                ctx.restore();
                return;
            }
        }

        // Built-In Diamond vector fallback for mixed 2-4 slot atlases
        const r = inner * 0.34;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fill();
        ctx.lineWidth = Math.max(4, r * 0.14);
        ctx.strokeStyle = (slot.color || '#FFFFFFFF').slice(0, 7);
        ctx.stroke();
        ctx.restore();
    }

    async function rebuildTileAtlasAndUpload(label) {
        if (!workingProfile) return;
        const tl = workingProfile.tiles = workingProfile.tiles || {};
        const slots = ensureTileSlots(tl);
        const isSingleBuiltIn = slots.length === 1 && !(slots[0].sourceType === 'image' && slots[0].src) && !(slots[0].sourceType === 'icon' && slots[0].iconClass);
        if (isSingleBuiltIn) {
            tl.stampFile = '';
            loadStampPreviewImage('');
            schedulePreviewDraw();
            return;
        }
        try {
            const isAtlas = slots.length > 1;
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 512;
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
            if (!isAtlas) {
                await drawSlotIntoCell(ctx, slots[0], 0, 0, 512);
            } else {
                for (let i = 0; i < Math.min(4, slots.length); i++) {
                    const qx = (i % 2) * 256;
                    const qy = Math.floor(i / 2) * 256;
                    await drawSlotIntoCell(ctx, slots[i], qx, qy, 256);
                }
            }
            const res = await fetch('/api/obs-patterns/stamp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: `${workingProfile.id || 'tile'}-${Date.now().toString(36)}`, dataUrl: c.toDataURL('image/png') })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Stamp upload failed');
            tl.stampFile = data.stampFile;
            loadStampPreviewImage(data.stampFile);
            schedulePreviewDraw();
            if (label) showToast(`${label} updated for OBS GPU`);
        } catch (err) {
            showToast(err.message || 'Failed to bake tile stamp');
        }
    }

    async function bakeProceduralPresetToStamp(preset) {
        if (!preset || !workingProfile || !window.StreamPulsePatternBake) return;
        const bakeSeq = ++latestProcBakeSeq;
        const pr = workingProfile.procedural || {};
        const dens = resolveNum(pr.density, 1, 0.25, 4);
        const sp = resolveNum(pr.spacing, 100, 50, 300);
        lastBakeSignature = computeProceduralBakeSignature(pr);
        const customColors = Array.isArray(pr.customColors)
            ? pr.customColors.slice(0, 7).map(col => resolveColor(col, '#58A6FFFF'))
            : [];
        const baked = window.StreamPulsePatternBake.draw({
            ...pr, preset, customColors,
            accent: resolveColor(pr.accent, '#58A6FFFF'),
            secondary: resolveColor(pr.secondary, '#A855F7FF'),
            lineWidth: resolveNum(pr.lineWidth, 2, 0.5, 24),
            density: dens, spacing: sp,
            scatter: resolveNum(pr.scatter, 0, 0, 100),
            sizeVariance: resolveNum(pr.sizeVariance, 0, 0, 100),
            rotationVariance: resolveNum(pr.rotationVariance, 0, 0, 100),
            fillOpacity: resolveNum(pr.fillOpacity, 35, 0, 100)
        });
        pr.stampCols = baked.cols;
        pr.stampRows = baked.rows;
        try {
            const res = await fetch('/api/obs-patterns/stamp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: `${workingProfile.id || 'proc'}-${preset}`, dataUrl: baked.dataUrl })
            });
            const data = await res.json();
            if (!res.ok) return;
            if (bakeSeq !== latestProcBakeSeq || !workingProfile || workingProfile.mode !== 'procedural'
                || workingProfile.procedural?.preset !== preset || ANALYTIC_GPU_SET.has(preset)) {
                return;
            }
            workingProfile.procedural.bakedStampFile = data.stampFile;
            loadStampPreviewImage(data.stampFile, true);
        } catch {}
    }

    function bindEvents() {
        const bindColorPair = (tId, pId) => {
            const t = document.getElementById(tId);
            const p = document.getElementById(pId);
            if (!t || !p) return;
            p.addEventListener('input', () => { t.value = p.value.toUpperCase() + 'FF'; syncWorkingProfileFromDom(); });
            t.addEventListener('input', () => { syncColorPicker(tId, pId); syncWorkingProfileFromDom(); });
        };
        bindColorPair('op-bg-color', 'op-bg-color-pick');
        bindColorPair('op-bg-color2', 'op-bg-color2-pick');
        bindColorPair('op-bg-color3', 'op-bg-color3-pick');
        bindColorPair('op-vignette-color', 'op-vignette-color-pick');
        bindColorPair('op-proc-accent', 'op-proc-accent-pick');
        bindColorPair('op-proc-secondary', 'op-proc-secondary-pick');
        bindColorPair('op-tile-tint', 'op-tile-tint-pick');
        bindColorPair('op-tile-accent', 'op-tile-accent-pick');
        bindColorPair('op-tile-secondary', 'op-tile-secondary-pick');
        bindColorPair('op-flt-duo-dark', 'op-flt-duo-dark-pick');
        bindColorPair('op-flt-duo-light', 'op-flt-duo-light-pick');
        bindColorPair('op-flt-tint-color', 'op-flt-tint-color-pick');

        document.querySelectorAll('#op-mode-seg button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!workingProfile) return;
                workingProfile.mode = btn.dataset.mode === 'tiles' ? 'tiles' : 'procedural';
                updateModeVisibility(workingProfile.mode);
                updateDirtyIndicators();
                const pr = workingProfile.procedural || {};
                const tl = workingProfile.tiles || {};
                const activeStamp = workingProfile.mode === 'tiles' ? tl.stampFile : (!ANALYTIC_GPU_SET.has(pr.preset) ? pr.bakedStampFile : '');
                if (workingProfile.mode === 'procedural' && !ANALYTIC_GPU_SET.has(pr.preset) && !activeStamp) {
                    bakeProceduralPresetToStamp(pr.preset);
                } else {
                    loadStampPreviewImage(activeStamp || '', true);
                }
                schedulePreviewDraw();
            });
        });

        document.querySelectorAll('#op-tile-color-source-seg button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!workingProfile) return;
                workingProfile.tiles = workingProfile.tiles || {};
                workingProfile.tiles.colorSource = btn.dataset.cs === 'palette' ? 'palette' : 'hue';
                updateTileControlVisibility();
                updateDirtyIndicators();
                schedulePreviewDraw();
            });
        });

        const bindPaletteScopeEvents = (scope) => {
            const ui = PALETTE_UI[scope];
            document.getElementById(ui.selectId)?.addEventListener('change', (e) => {
                const target = getPaletteTarget(scope);
                if (!target) return;
                const palName = e.target.value || 'dual';
                target.palette = palName;
                const pal = PALETTES[palName];
                if (pal) {
                    const c1 = (pal[0] || '#58a6ff').toUpperCase() + 'FF';
                    const c2 = (pal[1] || pal[0] || '#a855f7').toUpperCase() + 'FF';
                    setControlValue(ui.accentId, c1, c1, { isColor: true });
                    syncColorPicker(ui.accentId, ui.accentPickId);
                    setControlValue(ui.secondaryId, c2, c2, { isColor: true });
                    syncColorPicker(ui.secondaryId, ui.secondaryPickId);
                }
                if (palName === 'custom') {
                    ensureCustomColors(target);
                    renderCustomPaletteStops(scope);
                }
                syncWorkingProfileFromDom();
            });

            document.getElementById(ui.customizeBtnId)?.addEventListener('click', () => {
                const target = getPaletteTarget(scope);
                if (!target) return;
                const curHexList = getActivePaletteHexList(target);
                target.customColors = curHexList.slice(0, 7).map(c => c.length === 7 ? c.toUpperCase() + 'FF' : c.toUpperCase());
                ensureCustomColors(target);
                target.palette = 'custom';
                const palSel = document.getElementById(ui.selectId);
                if (palSel) palSel.value = 'custom';
                renderCustomPaletteStops(scope);
                syncWorkingProfileFromDom();
            });

            document.getElementById(ui.addBtnId)?.addEventListener('click', () => {
                const target = getPaletteTarget(scope);
                if (!target) return;
                const colors = ensureCustomColors(target);
                if (colors.length >= 7) return;
                const extras = ['#F43F5EFF', '#06B6D4FF', '#A855F7FF', '#F97316FF', '#10B981FF'];
                colors.push(extras[colors.length % extras.length]);
                renderCustomPaletteStops(scope);
                syncWorkingProfileFromDom();
            });

            document.getElementById(ui.reverseBtnId)?.addEventListener('click', () => {
                const target = getPaletteTarget(scope);
                if (!target) return;
                ensureCustomColors(target).reverse();
                renderCustomPaletteStops(scope);
                syncWorkingProfileFromDom();
            });

            document.getElementById(ui.shuffleBtnId)?.addEventListener('click', () => {
                const target = getPaletteTarget(scope);
                if (!target) return;
                const colors = ensureCustomColors(target);
                for (let i = colors.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [colors[i], colors[j]] = [colors[j], colors[i]];
                }
                renderCustomPaletteStops(scope);
                syncWorkingProfileFromDom();
            });

            document.getElementById(ui.importSelId)?.addEventListener('change', (e) => {
                const presetId = e.target.value;
                e.target.value = '';
                const target = getPaletteTarget(scope);
                if (!presetId || !target || !Array.isArray(PALETTES[presetId])) return;
                target.palette = 'custom';
                target.customColors = PALETTES[presetId].slice(0, 7).map(c => c.toUpperCase() + (c.length === 7 ? 'FF' : ''));
                ensureCustomColors(target);
                renderCustomPaletteStops(scope);
                syncWorkingProfileFromDom();
            });

            document.getElementById(ui.saveBtnId)?.addEventListener('click', async () => {
                const target = getPaletteTarget(scope);
                if (!target) return;
                const nameInput = document.getElementById(ui.saveNameId);
                const name = (nameInput?.value || '').trim() || 'Custom Palette';
                const colors = ensureCustomColors(target);
                try {
                    const res = await fetch('/api/obs-patterns/palette', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, colors })
                    });
                    const data = await res.json();
                    if (!res.ok) { showToast(data.error || 'Failed to save palette'); return; }
                    if (data.state) studioState = data.state;
                    if (nameInput) nameInput.value = '';
                    renderSavedPalettesRow('procedural');
                    renderSavedPalettesRow('tiles');
                    showToast(`Saved custom palette "${data.palette?.name || name}"`);
                } catch {
                    showToast('Failed to save palette');
                }
            });
        };

        bindPaletteScopeEvents('procedural');
        bindPaletteScopeEvents('tiles');

        [
            'op-name', 'op-id', 'op-width', 'op-height',
            'op-bg-type', 'op-bg-use-mid', 'op-bg-angle', 'op-bg-cx', 'op-bg-cy', 'op-bg-radius',
            'op-bg-motion', 'op-bg-motion-speed', 'op-opacity', 'op-vignette',
            'op-proc-preset', 'op-proc-fill-mode', 'op-proc-fill-opacity', 'op-proc-scale', 'op-proc-lw',
            'op-proc-cmode', 'op-proc-canim', 'op-proc-cspeed', 'op-proc-motion', 'op-proc-speed',
            'op-proc-pan-dir', 'op-proc-angle', 'op-proc-inplace', 'op-proc-inplace-speed',
            'op-proc-spin', 'op-proc-spin-speed', 'op-proc-rotvar', 'op-proc-density', 'op-proc-spacing',
            'op-proc-scatter', 'op-proc-sizevar', 'op-proc-snow-style',
            'op-tile-dist', 'op-tile-layout', 'op-tile-symmetry', 'op-tile-wedges',
            'op-tile-kaleido-dir', 'op-tile-kaleido-depth', 'op-tile-kaleido-morph', 'op-tile-kaleido-speed',
            'op-tile-size', 'op-tile-gap', 'op-tile-offsetx', 'op-tile-offsety',
            'op-tile-grid-angle', 'op-tile-angle', 'op-tile-alt-flip',
            'op-tile-opacity', 'op-tile-alt-opacity', 'op-tile-alt-scale',
            'op-tile-motion', 'op-tile-track-mode', 'op-tile-speed', 'op-tile-scroll-angle',
            'op-tile-spin', 'op-tile-spin-dir', 'op-tile-wave-amt',
            'op-tile-hue-mode', 'op-tile-hue-speed', 'op-tile-hue-jitter',
            'op-tile-cmode', 'op-tile-canim', 'op-tile-cspeed', 'op-tile-pal-style', 'op-tile-pal-blend', 'op-tile-pal-strength', 'op-tile-pal-scale', 'op-tile-pal-angle',
            'op-tile-sat-jitter', 'op-tile-bright-jitter', 'op-tile-scale-jitter',
            'op-tile-rot-jitter', 'op-tile-pos-jitter', 'op-tile-twinkle', 'op-tile-twinkle-speed',
            'op-flt-brightness', 'op-flt-contrast', 'op-flt-saturate', 'op-flt-grayscale', 'op-flt-hue', 'op-flt-blur',
            'op-flt-duo-on', 'op-flt-tint-on', 'op-flt-tint-opacity', 'op-flt-grain-on', 'op-flt-grain-amt', 'op-flt-grain-size', 'op-flt-grain-anim'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                if (id.startsWith('op-flt-')) {
                    const pre = document.getElementById('op-flt-preset');
                    if (pre) pre.value = '';
                }
                syncWorkingProfileFromDom();
            });
            el.addEventListener('change', syncWorkingProfileFromDom);
        });

        const applyFilterValuesToDom = (f = {}) => {
            const duo = f.duotone || {};
            const flTint = f.tint || {};
            const flGrain = f.grain || {};
            setControlValue('op-flt-brightness', f.brightness ?? 100, 100);
            setControlValue('op-flt-contrast', f.contrast ?? 100, 100);
            setControlValue('op-flt-saturate', f.saturate ?? 100, 100);
            setControlValue('op-flt-grayscale', f.grayscale ?? 0, 0);
            setControlValue('op-flt-hue', f.hueRotate ?? 0, 0);
            setControlValue('op-flt-blur', f.blur ?? 0, 0);
            const duoCheck = document.getElementById('op-flt-duo-on');
            if (duoCheck) duoCheck.checked = Boolean(duo.enabled);
            if (duo.dark) { setControlValue('op-flt-duo-dark', duo.dark, '#1E1B4BFF', { isColor: true }); syncColorPicker('op-flt-duo-dark', 'op-flt-duo-dark-pick'); }
            if (duo.light) { setControlValue('op-flt-duo-light', duo.light, '#22D3EEFF', { isColor: true }); syncColorPicker('op-flt-duo-light', 'op-flt-duo-light-pick'); }
            const tintCheck = document.getElementById('op-flt-tint-on');
            if (tintCheck) tintCheck.checked = Boolean(flTint.enabled);
            if (flTint.color) { setControlValue('op-flt-tint-color', flTint.color, '#58A6FFFF', { isColor: true }); syncColorPicker('op-flt-tint-color', 'op-flt-tint-color-pick'); }
            const tintOp = document.getElementById('op-flt-tint-opacity');
            if (tintOp && flTint.opacity !== undefined) tintOp.value = flTint.opacity;
            const grainCheck = document.getElementById('op-flt-grain-on');
            if (grainCheck) grainCheck.checked = Boolean(flGrain.enabled);
            const grainAmt = document.getElementById('op-flt-grain-amt');
            if (grainAmt && flGrain.amount !== undefined) grainAmt.value = flGrain.amount;
            const grainSz = document.getElementById('op-flt-grain-size');
            if (grainSz && flGrain.size !== undefined) grainSz.value = flGrain.size;
            const grainAnim = document.getElementById('op-flt-grain-anim');
            if (grainAnim) grainAnim.checked = flGrain.animate !== false;
            syncWorkingProfileFromDom();
        };

        document.getElementById('op-flt-preset')?.addEventListener('change', (e) => {
            const preset = GPU_FILTER_PRESETS.find(p => p.id === e.target.value);
            if (!preset) return;
            applyFilterValuesToDom(preset.filters);
        });
        document.getElementById('op-flt-reset')?.addEventListener('click', () => {
            const pre = document.getElementById('op-flt-preset');
            if (pre) pre.value = 'clean';
            applyFilterValuesToDom({
                brightness: 100, contrast: 100, saturate: 100, grayscale: 0, hueRotate: 0, blur: 0,
                duotone: { enabled: false }, tint: { enabled: false }, grain: { enabled: false }
            });
        });

        document.getElementById('op-bg-clear')?.addEventListener('click', () => {
            const btSel = document.getElementById('op-bg-type');
            if (btSel) btSel.value = 'transparent';
            setControlValue('op-bg-color', '#00000000', '#00000000', { isColor: true });
            syncWorkingProfileFromDom();
            previewBg = 'transparent';
            document.querySelectorAll('#op-preview-bg-chips .ob-chip').forEach(c => c.classList.toggle('active', c.dataset.bg === 'transparent'));
            schedulePreviewDraw();
        });

        document.getElementById('op-proc-preset')?.addEventListener('change', (e) => {
            if (!workingProfile) return;
            const preset = e.target.value;
            if (!ANALYTIC_GPU_SET.has(preset)) {
                bakeProceduralPresetToStamp(preset);
            } else {
                workingProfile.procedural.bakedStampFile = '';
                workingProfile.procedural.stampCols = 0;
                workingProfile.procedural.stampRows = 0;
                loadStampPreviewImage('');
            }
        });

        document.getElementById('op-tile-add-slot')?.addEventListener('click', async () => {
            if (!workingProfile) return;
            const tl = workingProfile.tiles = workingProfile.tiles || {};
            const slots = ensureTileSlots(tl);
            if (slots.length >= 4) return;
            slots.push({
                id: `slot-${slots.length + 1}`,
                sourceType: 'image',
                label: 'Built-In Geometric',
                src: '',
                iconClass: '',
                text: '',
                color: '#FFFFFFFF',
                scale: 100
            });
            renderTileSlots();
            await rebuildTileAtlasAndUpload('Atlas');
        });
        document.getElementById('op-btn-toggle-create')?.addEventListener('click', () => {
            const drawer = document.getElementById('op-create-drawer');
            if (drawer) drawer.hidden = !drawer.hidden;
        });

        document.getElementById('op-profile-select')?.addEventListener('change', (e) => {
            const found = studioState?.profiles.find(p => p.id === e.target.value);
            if (found) {
                selectedProfileId = found.id;
                workingProfile = cloneProfile(found);
                populateFormFromProfile();
            }
        });

        const saveProfile = async (setActive = false) => {
            syncWorkingProfileFromDom();
            if (workingProfile?.mode === 'procedural' && workingProfile.procedural?.preset && !ANALYTIC_GPU_SET.has(workingProfile.procedural.preset)) {
                clearTimeout(rebakeTimer);
                rebakeTimer = null;
                await bakeProceduralPresetToStamp(workingProfile.procedural.preset);
            }
            const res = await fetch('/api/obs-patterns/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: workingProfile, setActive })
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Save failed'); return; }
            studioState = data.state;
            selectedProfileId = data.profile.id;
            workingProfile = cloneProfile(data.profile);
            renderProfileSelector();
            populateFormFromProfile();
            renderSourceList();
            showToast('Saved & synced pattern to OBS');
        };
        document.getElementById('op-btn-save')?.addEventListener('click', () => saveProfile(false));
        document.getElementById('op-btn-preview-save')?.addEventListener('click', () => saveProfile(false));
        document.getElementById('op-btn-activate')?.addEventListener('click', () => saveProfile(true));

        document.getElementById('op-btn-preview-pause')?.addEventListener('click', () => {
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

        document.getElementById('op-btn-preview-restart')?.addEventListener('click', () => {
            pausedElapsedMs = 0;
            animOriginMs = performance.now();
            schedulePreviewDraw();
        });

        document.querySelectorAll('#op-inspector-tabs [data-op-inspector]').forEach(btn => {
            btn.addEventListener('click', () => switchInspectorTab(btn.dataset.opInspector));
        });

        try {
            const savedAdv = JSON.parse(localStorage.getItem(ADV_STORAGE_KEY) || '{}');
            document.querySelectorAll('#op-pane-designer details.ob-adv-details[data-adv-key]').forEach(det => {
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

        document.getElementById('op-btn-new')?.addEventListener('click', () => {
            const base = cloneProfile(studioState.profiles[0] || workingProfile);
            base.id = `pattern-${Date.now().toString(36).slice(-4)}`;
            base.name = 'New Pattern Profile';
            workingProfile = base;
            populateFormFromProfile();
            showToast('Editing new profile — click Save & Sync OBS');
        });
        document.getElementById('op-btn-duplicate')?.addEventListener('click', async () => {
            const res = await fetch(`/api/obs-patterns/profile/${encodeURIComponent(selectedProfileId)}/duplicate`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Duplicate failed'); return; }
            studioState = data.state;
            selectedProfileId = data.profile.id;
            workingProfile = cloneProfile(data.profile);
            renderProfileSelector();
            populateFormFromProfile();
            showToast('Profile duplicated');
        });
        document.getElementById('op-btn-delete')?.addEventListener('click', async () => {
            const res = await fetch(`/api/obs-patterns/profile/${encodeURIComponent(selectedProfileId)}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Delete failed'); return; }
            studioState = data.state;
            selectedProfileId = studioState.activeProfileId;
            workingProfile = cloneProfile(studioState.profiles[0]);
            renderProfileSelector();
            populateFormFromProfile();
            renderSourceList();
            showToast('Profile deleted');
        });

        document.getElementById('op-btn-obs-sync')?.addEventListener('click', () => syncFromObsWebSocket({ quiet: false }));
        document.getElementById('op-btn-obs-create')?.addEventListener('click', async () => {
            const [w, h] = (document.getElementById('op-create-size')?.value || '1920x1080').split('x').map(Number);
            const res = await fetch('/api/obs-patterns/obs-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sceneName: document.getElementById('op-create-scene')?.value || '',
                    sourceName: document.getElementById('op-create-name')?.value || 'StreamPulse Background',
                    profileId: document.getElementById('op-create-profile')?.value || 'auto',
                    width: w || 1920,
                    height: h || 1080
                })
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'OBS source creation failed'); return; }
            studioState = data.state;
            hasSyncedObsOnce = true;
            renderSourceList();
            showToast(`${data.status === 'updated' ? 'Updated' : 'Created'} "${data.sourceName}" in ${data.sceneName}`);
        });

        document.getElementById('op-source-search')?.addEventListener('input', renderSourceList);
        document.querySelectorAll('#op-view-seg button').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.view === listViewMode ? 'true' : 'false');
            btn.addEventListener('click', () => {
                listViewMode = btn.dataset.view;
                try { localStorage.setItem(VIEW_STORAGE_KEY, listViewMode); } catch {}
                document.querySelectorAll('#op-view-seg button').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
                renderSourceList();
            });
        });
        document.getElementById('op-btn-expand-all')?.addEventListener('click', () => {
            if (!studioState) return;
            if (listViewMode === 'scenes') studioState.knownScenes.forEach(s => expandedGroups.add(`scene:${s}`));
            else studioState.knownPatternSources.forEach(s => expandedGroups.add(`src:${s}`));
            renderSourceList();
        });
        document.getElementById('op-btn-collapse-all')?.addEventListener('click', () => {
            expandedGroups.clear();
            renderSourceList();
        });

        document.querySelectorAll('[data-op-tab]').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.opTab));
        });
        document.querySelectorAll('#op-preview-bg-chips .ob-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.bg === previewBg);
            chip.addEventListener('click', () => {
                previewBg = chip.dataset.bg;
                try { localStorage.setItem(BG_STORAGE_KEY, previewBg); } catch {}
                document.querySelectorAll('#op-preview-bg-chips .ob-chip').forEach(c => c.classList.toggle('active', c === chip));
                schedulePreviewDraw();
            });
        });

        document.getElementById('op-btn-refresh-manifest')?.addEventListener('click', refreshManifestPreview);
        document.getElementById('op-btn-reset-defaults')?.addEventListener('click', async () => {
            if (!confirm('Reset all Pattern Profiles and Assignments back to defaults?')) return;
            const res = await fetch('/api/obs-patterns/reset-defaults', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Reset failed'); return; }
            studioState = data.state;
            selectedProfileId = studioState.activeProfileId;
            workingProfile = cloneProfile(studioState.profiles[0]);
            renderProfileSelector();
            populateFormFromProfile();
            renderSourceList();
            refreshManifestPreview();
            showToast('Reset to defaults');
        });
        document.getElementById('op-btn-copy-lua-path')?.addEventListener('click', async () => {
            if (!studioState?.luaScriptPath) return;
            try { await navigator.clipboard.writeText(studioState.luaScriptPath); showToast('Script path copied'); }
            catch { showToast(studioState.luaScriptPath); }
        });

        window.addEventListener('hashchange', () => {
            const t = parseTabFromHash();
            if (t && t !== activeTab) switchTab(t, { updateHash: false });
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopPreviewAnim();
                if (glCtx) releasePreviewScene(glCtx);
            }
            else schedulePreviewDraw();
        });
        window.addEventListener('pagehide', () => {
            stopPreviewAnim();
            if (glCtx) releasePreviewScene(glCtx);
        });
        window.addEventListener('pageshow', schedulePreviewDraw);
    }

    document.addEventListener('DOMContentLoaded', () => {
        populateSelects();
        bindEvents();
        switchInspectorTab(activeInspectorTab);
        updatePreviewPauseButtonUI();
        switchTab(activeTab);
        loadStudioData();
        watchBakeStatus().catch(err => console.error('[ObsPatterns] Status connection failed:', err));
    });
})();
