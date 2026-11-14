/**
 * Stage rendering, wheel canvas, deck/roller previews, spin animation, theming,
 * and URL builders for the Randomizer Studio.
 */

import { createWheelRenderer } from '/js/randomizer/wheel.js';
import { createStageRenderer } from '/js/randomizer/stage-rendering.js';
import { createSpinAnimator } from '/js/randomizer/spin-animation.js';
import {
    DEFAULT_FALLBACK_CHOICES,
    state,
    $,
    AudioFX,
    Confetti,
    rgbToHex,
    getEffectiveBackground,
    playableChoices,
    getClientEffectiveWeights,
    getChoices,
    saveStudioState
} from './randomizer-state.js';

export const stageRenderer = createStageRenderer({
    $,
    getDeckLogo: () => state.currentDeckLogo,
    getDeckWatermark: () => state.currentDeckWatermark,
    isSpinning: () => state.isSpinning
});

export const { getDeckPatternHtml, getDeckWatermarkHtml, updateDeckVisuals } = stageRenderer;

export const wheelRenderer = createWheelRenderer({
    canvas: $('wheel-canvas'),
    stage: $('display-stage'),
    getColors: () => state.currentThemeSlices
});

export function drawWheel(rotationRad = 0, list = getChoices(), weightsMap = null) {
    list = playableChoices(list);
    wheelRenderer.draw(rotationRad, list, weightsMap || getClientEffectiveWeights(list).weights);
}

export function renderIdleDeck(list = getChoices()) {
    stageRenderer.renderIdleDeck(list);
}

export function renderIdleRoller(centerIdx, list) {
    stageRenderer.renderIdleRoller(centerIdx, list);
}

export function finishSpin(winner, customHeader = null, customSub = null) {
    state.isSpinning = false;
    const pendingElim = state.pendingEliminationState;
    state.pendingEliminationState = null;

    if ($('btn-spin')) $('btn-spin').disabled = false;
    if ($('overlay-spin-btn')) {
        $('overlay-spin-btn').disabled = false;
        $('overlay-spin-btn').style.opacity = '1';
        $('overlay-spin-btn').style.pointerEvents = 'auto';
    }

    let statsUpdated = false;
    if (state.currentWeightMode === 'growth' || state.currentWeightMode === 'momentum') {
        const step = state.currentWeightSettings.step || 1;
        const max = state.currentWeightSettings.max || 20;
        const base = state.currentWeightSettings.base || 1;
        state.choices.forEach(c => {
            const isWinner = c.toLowerCase() === String(winner).toLowerCase();
            const baseW = state.currentWeightsMap[c] != null ? Number(state.currentWeightsMap[c]) : base;
            if (!state.currentChoiceStats[c]) {
                state.currentChoiceStats[c] = { picks: 0, unpickedSpins: 0, effectiveWeight: baseW };
            }
            if (state.currentWeightMode === 'growth') {
                if (isWinner) {
                    state.currentChoiceStats[c].picks = (state.currentChoiceStats[c].picks || 0) + 1;
                    state.currentChoiceStats[c].unpickedSpins = 0;
                    state.currentChoiceStats[c].effectiveWeight = baseW;
                } else {
                    state.currentChoiceStats[c].unpickedSpins = (state.currentChoiceStats[c].unpickedSpins || 0) + 1;
                    state.currentChoiceStats[c].effectiveWeight = Math.round(
                        Math.min(max, (state.currentChoiceStats[c].effectiveWeight || baseW) + step) * 100
                    ) / 100;
                }
            } else if (state.currentWeightMode === 'momentum') {
                if (isWinner) {
                    state.currentChoiceStats[c].picks = (state.currentChoiceStats[c].picks || 0) + 1;
                    state.currentChoiceStats[c].unpickedSpins = 0;
                    state.currentChoiceStats[c].effectiveWeight = Math.round(
                        Math.min(max, (state.currentChoiceStats[c].effectiveWeight || baseW) + step) * 100
                    ) / 100;
                } else {
                    state.currentChoiceStats[c].unpickedSpins = (state.currentChoiceStats[c].unpickedSpins || 0) + 1;
                }
            }
        });
        statsUpdated = true;
    }

    if (typeof state.onSpinFinish === 'function') {
        state.onSpinFinish({ pendingElim, statsUpdated });
    }

    const headerText = customHeader || $('winner-header-input')?.value.trim() || 'THE UNIVERSE HAS DECIDED';

    let subText = customSub;
    if (!subText) {
        if (state.activeQuotesPool && state.activeQuotesPool.length) {
            subText = state.activeQuotesPool[Math.floor(Math.random() * state.activeQuotesPool.length)];
        }
        if (!subText) {
            subText = 'The timeline has shifted. Fate is sealed.';
        }
    }

    $('winner-box').style.display = 'block';
    const headerEl = $('winner-header-text');
    if (headerEl) headerEl.textContent = headerText;
    $('winner-text').textContent = winner;
    $('winner-sub').textContent = subText;

    AudioFX.fanfare();
    Confetti.burst();
}

export const spinAnimator = createSpinAnimator({
    $,
    AudioFX,
    drawWheel,
    getDeckPatternHtml,
    getDeckWatermarkHtml,
    getRollerIndex: () => state.currentRollerIndex,
    setRollerIndex: index => { state.currentRollerIndex = index; },
    onFinish: finishSpin
});

window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    spinAnimator.cancel();
    wheelRenderer.dispose();
});

const loadedFonts = new Set();
export function ensureFontLoaded(family, importUrl = null) {
    if (!family) return;
    const cleanName = family.replace(/["']/g, '').trim();
    if (!cleanName || loadedFonts.has(cleanName)) return;

    if (importUrl) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = importUrl;
        document.head.appendChild(link);
        loadedFonts.add(cleanName);
    } else {
        const isGoogle = (window.OverlayFonts && window.OverlayFonts.google && window.OverlayFonts.google.includes(cleanName)) ||
            cleanName === 'Jersey 20' || cleanName.includes(' ') || !['Arial', 'Helvetica', 'Georgia', 'Impact', 'Courier New', 'Trebuchet MS', 'sans-serif', 'serif', 'monospace'].includes(cleanName);

        if (isGoogle) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanName).replace(/%20/g, '+')}:wght@300;400;500;600;700;800;900&display=swap`;
            document.head.appendChild(link);
            loadedFonts.add(cleanName);
        }
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            if (!state.isSpinning) renderInitialState();
        }).catch(() => {});
    }
}

export function applyBackgroundStyle(bgVal) {
    const root = $('display-stage');
    if (!root) return;
    const accent = root.style.getPropertyValue('--stage-accent') || '#8b5cf6';
    const val = (bgVal || '').trim();

    if (!val || val === 'glass') {
        root.style.setProperty('--overlay-bg', 'rgba(15, 23, 42, 0.85)');
        root.style.background = 'var(--overlay-bg)';
        root.style.backdropFilter = 'blur(14px)';
        root.style.webkitBackdropFilter = 'blur(14px)';
        root.style.border = `2px solid color-mix(in srgb, ${accent} 60%, rgba(255,255,255,0.2))`;
        root.style.boxShadow = '0 16px 50px rgba(0,0,0,0.6)';
    } else if (val === 'dark') {
        root.style.setProperty('--overlay-bg', '#0d1117');
        root.style.background = '#0d1117';
        root.style.backdropFilter = 'none';
        root.style.webkitBackdropFilter = 'none';
        root.style.border = `2px solid color-mix(in srgb, ${accent} 60%, #30363d)`;
        root.style.boxShadow = '0 12px 40px rgba(0,0,0,0.7)';
    } else if (val === 'transparent') {
        root.style.setProperty('--overlay-bg', 'transparent');
        root.style.background = 'transparent';
        root.style.backdropFilter = 'none';
        root.style.webkitBackdropFilter = 'none';
        root.style.border = '2px solid transparent';
        root.style.boxShadow = 'none';
    } else {
        root.style.setProperty('--overlay-bg', val);
        root.style.background = val;
        root.style.backdropFilter = 'blur(12px)';
        root.style.webkitBackdropFilter = 'blur(12px)';
        root.style.border = `2px solid color-mix(in srgb, ${accent} 60%, rgba(255,255,255,0.2))`;
        root.style.boxShadow = '0 16px 50px rgba(0,0,0,0.6)';
    }
}

export async function loadOverlayTheme() {
    try {
        const res = await fetch('/api/config').then(r => r.json());
        if (res && res.theme) {
            state.savedOverlayConfigTheme = res.theme;
        }
    } catch {}
    applyTheme(state.currentTheme);
}

export function highlightActiveAccentChip(color) {
    document.querySelectorAll('.p-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.color.toLowerCase() === color.toLowerCase());
    });
}

export function applyTheme(themeKey, skipInputSync = false, bgOverride = null) {
    state.currentTheme = themeKey || 'system';
    const root = $('display-stage');
    if (!root) return;

    const THEMES = window.StudioThemes || {};
    const t = state.savedOverlayConfigTheme || {};
    let accent, indicator, gradient, glow, slices;
    let text, font, weight, bg, outline, fontImport;

    if (state.currentTheme !== 'system' && state.currentTheme !== 'custom' && THEMES[state.currentTheme]) {
        const preset = THEMES[state.currentTheme];
        accent = preset.accent;
        indicator = preset.indicator;
        gradient = preset.gradient;
        glow = preset.glow;
        slices = [...preset.slices];
        text = $('ap-text')?.value.trim() || '#ffffff';
        font = $('ap-font')?.value.trim() || '';
        weight = $('ap-weight')?.value.trim() || '600';
        bg = bgOverride || getEffectiveBackground();
        outline = $('ap-outline')?.value.trim() || '';
    } else if (state.currentTheme === 'system') {
        accent = t.accent_color || '#8b5cf6';
        indicator = `color-mix(in srgb, ${accent} 85%, #fff)`;
        gradient = `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #ec4899) 50%, color-mix(in srgb, ${accent} 50%, #f97316) 100%)`;
        glow = `color-mix(in srgb, ${accent} 40%, transparent)`;
        slices = [accent, '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f43f5e', '#eab308'];
        text = t.text_color || '#ffffff';
        font = t.font_family || '';
        weight = t.font_weight || '600';
        bg = bgOverride || getEffectiveBackground();
        outline = (t.text_outline === false ? 'none' : t.text_outline_color) || '';
        fontImport = t.font_import;
    } else {
        accent = $('ap-accent')?.value.trim() || t.accent_color || '#8b5cf6';
        indicator = `color-mix(in srgb, ${accent} 85%, #fff)`;
        gradient = `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #ec4899) 50%, color-mix(in srgb, ${accent} 50%, #f97316) 100%)`;
        glow = `color-mix(in srgb, ${accent} 40%, transparent)`;
        slices = [accent, '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f43f5e', '#eab308'];
        text = $('ap-text')?.value.trim() || t.text_color || '#ffffff';
        font = $('ap-font')?.value.trim() || t.font_family || '';
        weight = $('ap-weight')?.value.trim() || t.font_weight || '600';
        bg = bgOverride || getEffectiveBackground();
        outline = $('ap-outline')?.value.trim() || (t.text_outline === false ? 'none' : t.text_outline_color) || '';
    }

    state.currentThemeSlices = slices;
    ensureFontLoaded(font, fontImport);

    root.style.setProperty('--stage-accent', accent);
    root.style.setProperty('--stage-indicator', indicator);
    root.style.setProperty('--stage-gradient', gradient);
    root.style.setProperty('--stage-glow', glow);
    root.style.setProperty(
        '--stage-font',
        font ? `"${font}", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` : '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    );
    root.style.setProperty('--stage-weight', weight || '600');
    root.style.setProperty('--stage-text', text || '#ffffff');
    root.style.setProperty('--stage-outline', (outline && outline !== 'none') ? outline : '');
    root.style.setProperty(
        '--stage-outline-shadow',
        (outline && outline !== 'none' && outline !== 'transparent')
            ? `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}, 0 2px 8px rgba(0,0,0,0.6)`
            : '0 2px 8px rgba(0,0,0,0.4)'
    );

    if (font) root.style.fontFamily = `"${font}", -apple-system, system-ui, sans-serif`;
    if (weight) root.style.fontWeight = weight;
    if (text) root.style.color = text;
    applyBackgroundStyle(bg);

    const spinBtn = $('btn-spin');
    if (spinBtn) {
        spinBtn.style.background = gradient;
        spinBtn.style.boxShadow = `0 4px 20px ${glow}`;
    }
    const winnerHeader = $('winner-header-text');
    if (winnerHeader) winnerHeader.style.color = indicator;

    if (!skipInputSync) {
        if ($('theme-select')) $('theme-select').value = state.currentTheme;
        if ($('ap-accent')) $('ap-accent').value = accent;
        if ($('ap-accent-picker')) $('ap-accent-picker').value = rgbToHex(accent);
        if ($('ap-text')) $('ap-text').value = text;
        if ($('ap-text-picker')) $('ap-text-picker').value = rgbToHex(text);
        if ($('ap-font')) {
            if (font && !Array.from($('ap-font').options).some(o => o.value === font)) {
                const opt = document.createElement('option');
                opt.value = font;
                opt.textContent = font;
                $('ap-font').appendChild(opt);
            }
            $('ap-font').value = font;
        }
        if ($('ap-weight')) $('ap-weight').value = weight;
        if ($('ap-outline')) $('ap-outline').value = outline;
        if ($('ap-outline-picker')) {
            const isNone = !outline || outline === 'none' || outline === 'transparent';
            $('ap-outline-picker').value = isNone ? '#000000' : rgbToHex(outline);
        }
        highlightActiveAccentChip(accent);
    }

    renderInitialState();
}

export function setAccentColor(color) {
    if ($('ap-accent')) $('ap-accent').value = color;
    if ($('ap-accent-picker')) $('ap-accent-picker').value = color;
    highlightActiveAccentChip(color);
    if ($('theme-select')) $('theme-select').value = 'custom';
    applyTheme('custom');
    updateObsUrl();
    saveStudioState();
}

export function updateObsUrl() {
    if (!$('obs-url-input')) return;
    const mode = state.currentMode;
    const preset = state.currentPresetId || 'jackbox';
    const suspense = $('suspense-select')?.value || state.currentSuspense;
    const autohide = $('autohide-select')?.value || '8';
    const showButton = $('overlay-button-enabled')?.checked ? '1' : '0';
    const duration = $('spin-duration')?.value || '6';

    const theme = $('theme-select')?.value || state.currentTheme;
    const accent = $('ap-accent')?.value.trim();
    const text = $('ap-text')?.value.trim();
    const font = $('ap-font')?.value.trim();
    const weight = $('ap-weight')?.value.trim();
    const bg = getEffectiveBackground();
    const outline = $('ap-outline')?.value.trim();
    let url = `${window.location.origin}/randomizer.html?mode=${encodeURIComponent(mode)}&preset=${encodeURIComponent(preset)}&suspense=${encodeURIComponent(suspense)}&autohide=${encodeURIComponent(autohide)}&duration=${encodeURIComponent(duration)}&button=${showButton}`;

    if (theme && theme !== 'system' && theme !== 'custom') {
        url += `&theme=${encodeURIComponent(theme)}`;
    } else if (accent) {
        url += `&accent=${encodeURIComponent(accent)}`;
    }
    if (text) url += `&text=${encodeURIComponent(text)}`;
    if (font) url += `&font=${encodeURIComponent(font)}`;
    if (weight) url += `&weight=${encodeURIComponent(weight)}`;
    if (bg && bg !== 'glass') url += `&bg=${encodeURIComponent(bg)}`;
    if (outline) url += `&outline=${encodeURIComponent(outline)}`;
    const btnPreset = state.currentBtnPresetId || 'chaos';
    if (btnPreset === 'static') {
        const sText = $('btn-text-static')?.value.trim();
        if (sText) url += `&btnText=${encodeURIComponent(sText)}`;
    } else {
        url += `&btnPreset=${encodeURIComponent(btnPreset)}`;
    }

    const quotePreset = state.currentQuotePresetId || 'multiverse';
    url += `&quotePreset=${encodeURIComponent(quotePreset)}`;

    const winHeader = $('winner-header-input')?.value.trim();
    if (winHeader && winHeader !== 'THE UNIVERSE HAS DECIDED') {
        url += `&winHeader=${encodeURIComponent(winHeader)}`;
    }

    if (state.currentDeckLogo) {
        url += `&deckLogo=${encodeURIComponent(state.currentDeckLogo)}`;
    }
    if (state.currentDeckWatermark && state.currentDeckWatermark !== 'STREAMPULSE') {
        url += `&deckWatermark=${encodeURIComponent(state.currentDeckWatermark)}`;
    } else if (state.currentDeckWatermark === '') {
        url += `&deckWatermark=`;
    }

    $('obs-url-input').textContent = url;
    if ($('btn-open-overlay')) $('btn-open-overlay').href = url;
    if ($('btn-quick-open-obs')) $('btn-quick-open-obs').href = url;

    if ($('companion-url-input')) {
        let compUrl = `${window.location.origin}/api/randomizer/spin?preset=${encodeURIComponent(preset)}&mode=${encodeURIComponent(mode)}&suspense=${encodeURIComponent(suspense)}`;
        if (theme && theme !== 'system' && theme !== 'custom') {
            compUrl += `&theme=${encodeURIComponent(theme)}`;
        }
        if (bg && bg !== 'glass') {
            compUrl += `&bg=${encodeURIComponent(bg)}`;
        }
        $('companion-url-input').textContent = compUrl;
    }
}

export function updateButtonLabel() {
    let label = 'Let Chaos Reign!';
    const presetVal = state.currentBtnPresetId || 'chaos';

    if (presetVal === 'static') {
        label = $('btn-text-static')?.value.trim() || 'Spin Now!';
    } else if (state.activeButtonPhrases && state.activeButtonPhrases.length) {
        label = state.activeButtonPhrases[Math.floor(Math.random() * state.activeButtonPhrases.length)];
    }

    if ($('btn-spin-text')) $('btn-spin-text').textContent = label;
    if ($('overlay-spin-btn-text')) $('overlay-spin-btn-text').textContent = label;
    return label;
}

export function syncOverlayButtonPreview() {
    const isEnabled = $('overlay-button-enabled')?.checked;
    const btn = $('overlay-spin-btn');
    if (btn) {
        btn.style.display = isEnabled ? 'inline-flex' : 'none';
        const grad = $('display-stage')?.style.getPropertyValue('--stage-gradient');
        const glow = $('display-stage')?.style.getPropertyValue('--stage-glow');
        if (grad) btn.style.background = grad;
        if (glow) btn.style.boxShadow = `0 4px 20px ${glow}`;
    }
}

export function renderInitialState() {
    const list = playableChoices(getChoices());
    $('winner-box').style.display = 'none';
    syncOverlayButtonPreview();

    if (state.currentMode === 'roller') {
        $('wheel-view').style.display = 'none';
        $('deck-view').style.display = 'none';
        $('roller-view').style.display = 'block';
        renderIdleRoller(state.currentRollerIndex, list);
    } else if (state.currentMode === 'wheel') {
        $('roller-view').style.display = 'none';
        $('deck-view').style.display = 'none';
        $('wheel-view').style.display = 'flex';
        drawWheel(0, list);
    } else {
        $('roller-view').style.display = 'none';
        $('wheel-view').style.display = 'none';
        $('deck-view').style.display = 'flex';
        renderIdleDeck(list);
    }
}

export function setStyleMode(mode) {
    state.currentMode = mode;
    $('preview-mode-roller')?.classList.toggle('active', mode === 'roller');
    $('preview-mode-wheel')?.classList.toggle('active', mode === 'wheel');
    $('preview-mode-deck')?.classList.toggle('active', mode === 'deck');
    renderInitialState();
    updateObsUrl();
    saveStudioState();
}

export async function runSpin({
    choices: list = getChoices(),
    weights: weightsMap = null,
    winner = null,
    winnerHeader = null,
    winnerSub = null,
    mode = state.currentMode,
    suspense = ($('suspense-select')?.value || state.currentSuspense),
    theme = ($('theme-select')?.value || state.currentTheme),
    duration = (Number($('spin-duration')?.value) || 6),
    autohide = null
} = {}) {
    if (state.isSpinning) return;
    if (!list || !list.length) {
        list = state.choices.length ? state.choices : DEFAULT_FALLBACK_CHOICES;
    }
    if (!list.length) return;

    if (theme && theme !== state.currentTheme) {
        applyTheme(theme, true);
    }
    state.isSpinning = true;

    clearTimeout(state.autohideTimer);
    if ($('btn-spin')) $('btn-spin').disabled = true;
    if ($('overlay-spin-btn')) {
        $('overlay-spin-btn').disabled = true;
        $('overlay-spin-btn').style.opacity = '0.55';
        $('overlay-spin-btn').style.pointerEvents = 'none';
    }
    $('winner-box').style.display = 'none';

    let winnerIdx = -1;
    if (winner) {
        winnerIdx = list.findIndex(c => c.toLowerCase() === String(winner).toLowerCase());
    }
    if (winnerIdx === -1) {
        const eff = weightsMap || getClientEffectiveWeights(list).weights;
        let total = 0;
        const entries = list.map((c, i) => {
            const w = eff[c] != null ? Number(eff[c]) : 1;
            total += w;
            return { choice: c, index: i, weight: w };
        });
        let rnd = Math.random() * total;
        for (const e of entries) {
            if (rnd < e.weight) {
                winnerIdx = e.index;
                winner = e.choice;
                break;
            }
            rnd -= e.weight;
        }
        if (winnerIdx === -1) {
            winnerIdx = 0;
            winner = list[0];
        }
    }

    const totalDurationMs = Math.max(3000, duration * 1000);
    const isTricky = (suspense === 'tricky') && list.length > 2;

    spinAnimator.play({
        mode,
        list,
        weightsMap: weightsMap || getClientEffectiveWeights(list).weights,
        winner,
        winnerIdx,
        totalDurationMs,
        isTricky,
        suspense,
        winnerHeader,
        winnerSub,
        autohide
    });
}
