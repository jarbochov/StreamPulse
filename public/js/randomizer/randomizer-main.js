/**
 * Main entry point, event wiring, WebSocket listener, and studio bootstrap
 * for the Randomizer Studio.
 */

import {
    DEFAULT_FALLBACK_CHOICES,
    STORAGE_KEY,
    state,
    $,
    toast,
    AudioFX,
    Confetti,
    rgbToHex,
    playableChoices,
    getWeightSettings,
    getClientEffectiveWeights,
    parseRawChoicesFromTextarea,
    getChoices,
    getActiveWeightsMap,
    getEffectiveBackground,
    pickWeightedWinnerClient,
    hydrateSavedStudioState,
    syncStudioSettingsToServer,
    saveStudioState
} from './randomizer-state.js';

import {
    updateDeckVisuals,
    drawWheel,
    renderIdleDeck,
    renderIdleRoller,
    applyBackgroundStyle,
    loadOverlayTheme,
    highlightActiveAccentChip,
    applyTheme,
    setAccentColor,
    updateObsUrl,
    updateButtonLabel,
    syncOverlayButtonPreview,
    renderInitialState,
    setStyleMode,
    runSpin
} from './randomizer-preview.js';

import {
    renderEliminationUI,
    applyEliminationState,
    refreshPresetsListQuietly,
    persistEliminationMode,
    syncChoicesToTextarea,
    setPresetNeedsSave,
    renderChoicesTable,
    updateWeightControlsUI,
    setChoices,
    fetchChoicesPresets,
    fetchButtonPresets,
    fetchQuotePresets,
    loadSelectedChoicesPreset,
    loadSelectedButtonPreset,
    loadSelectedQuotePreset,
    exportRandomizerPresetsJson,
    importRandomizerPresetsJson,
    bindPresetControls
} from './randomizer-presets.js';

const unlockAudio = () => {
    AudioFX.init();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { passive: true });

hydrateSavedStudioState();
Confetti.init($('confetti-canvas'));

// Register post-spin UI/preset sync hook (keeps preview module free of preset imports)
state.onSpinFinish = ({ pendingElim, statsUpdated }) => {
    if (pendingElim) {
        applyEliminationState(pendingElim, { redraw: false });
        refreshPresetsListQuietly();
    }
    if (statsUpdated) {
        renderChoicesTable();
    }
};

// Initialize Font Dropdown Options
function initFontDropdown() {
    const fontSelect = $('ap-font');
    if (!fontSelect) return;
    const systemFonts = (window.OverlayFonts && window.OverlayFonts.system) || ['Arial', 'Helvetica', 'Georgia', 'Impact', 'Courier New', 'Trebuchet MS'];
    const rawGoogle = (window.OverlayFonts && window.OverlayFonts.google) || ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Raleway', 'Merriweather', 'Playfair Display', 'Bebas Neue', 'Fira Code', 'Silkscreen'];
    const googleFonts = ['Jersey 20', ...rawGoogle.filter(f => f !== 'Jersey 20')];

    let html = '<option value="">Default (System Sans-Serif)</option>';
    html += '<optgroup label="System Fonts">';
    systemFonts.forEach(f => {
        html += `<option value="${f.replace(/"/g, '&quot;')}">${f.replace(/</g, '&lt;')}</option>`;
    });
    html += '</optgroup><optgroup label="Google Fonts">';
    googleFonts.forEach(f => {
        html += `<option value="${f.replace(/"/g, '&quot;')}">${f.replace(/</g, '&lt;')}</option>`;
    });
    html += '</optgroup>';
    fontSelect.innerHTML = html;
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const btn = $(`tab-btn-${tabId}`);
    const pane = $(`tab-pane-${tabId}`);
    if (btn && pane) {
        btn.classList.add('active');
        pane.classList.add('active');
    }
    saveStudioState();
}

function applySavedStudioUI(s) {
    if (!s) return;
    if (s.mode) {
        state.currentMode = s.mode;
        $('preview-mode-roller')?.classList.toggle('active', s.mode === 'roller');
        $('preview-mode-wheel')?.classList.toggle('active', s.mode === 'wheel');
        $('preview-mode-deck')?.classList.toggle('active', s.mode === 'deck');
    }
    if (s.theme && $('theme-select')) $('theme-select').value = s.theme;
    if (s.bgStyle && $('bg-style-select')) {
        $('bg-style-select').value = s.bgStyle;
        if ($('custom-bg-row')) $('custom-bg-row').style.display = (s.bgStyle === 'custom') ? 'flex' : 'none';
    }
    if (s.customBgColor) {
        if ($('custom-bg-color')) $('custom-bg-color').value = s.customBgColor;
        if ($('custom-bg-color-picker')) $('custom-bg-color-picker').value = rgbToHex(s.customBgColor);
    }
    if (s.customBgOpacity !== undefined && $('custom-bg-opacity')) {
        $('custom-bg-opacity').value = s.customBgOpacity;
        if ($('custom-bg-opacity-label')) $('custom-bg-opacity-label').textContent = `${s.customBgOpacity}%`;
    }
    if (s.accentColor) {
        if ($('ap-accent')) $('ap-accent').value = s.accentColor;
        if ($('ap-accent-picker')) $('ap-accent-picker').value = rgbToHex(s.accentColor);
        highlightActiveAccentChip(s.accentColor);
    }
    if (s.textColor) {
        if ($('ap-text')) $('ap-text').value = s.textColor;
        if ($('ap-text-picker')) $('ap-text-picker').value = rgbToHex(s.textColor);
    }
    if (s.fontFamily && $('ap-font')) {
        if (!Array.from($('ap-font').options).some(o => o.value === s.fontFamily)) {
            const opt = document.createElement('option');
            opt.value = s.fontFamily;
            opt.textContent = s.fontFamily;
            $('ap-font').appendChild(opt);
        }
        $('ap-font').value = s.fontFamily;
    }
    if (s.fontWeight && $('ap-weight')) $('ap-weight').value = s.fontWeight;
    if (s.textOutline) {
        if ($('ap-outline')) $('ap-outline').value = s.textOutline;
        if ($('ap-outline-picker')) {
            const isNone = !s.textOutline || s.textOutline === 'none' || s.textOutline === 'transparent';
            $('ap-outline-picker').value = isNone ? '#000000' : rgbToHex(s.textOutline);
        }
    }
    if (s.winnerHeader && $('winner-header-input')) $('winner-header-input').value = s.winnerHeader;
    if (s.suspense && $('suspense-select')) $('suspense-select').value = s.suspense;
    if (s.duration && $('spin-duration')) $('spin-duration').value = s.duration;
    if (s.autohide && $('autohide-select')) $('autohide-select').value = s.autohide;
    if (s.showButton !== undefined && $('overlay-button-enabled')) {
        $('overlay-button-enabled').checked = s.showButton;
        syncOverlayButtonPreview();
    }
    if (s.soundEnabled !== undefined) {
        AudioFX.enabled = s.soundEnabled;
        if ($('sound-status-label')) $('sound-status-label').textContent = AudioFX.enabled ? 'Sound On' : 'Sound Muted';
        if ($('btn-quick-sound')) $('btn-quick-sound').style.opacity = AudioFX.enabled ? '1' : '0.6';
    }
    if (s.activeTab) {
        const validTabs = ['presets', 'theme', 'buttons', 'quotes', 'obs'];
        const tab = validTabs.includes(s.activeTab) ? s.activeTab : 'presets';
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        $(`tab-btn-${tab}`)?.classList.add('active');
        $(`tab-pane-${tab}`)?.classList.add('active');
    }
    if (s.deckLogo !== undefined) {
        state.currentDeckLogo = s.deckLogo;
        if ($('deck-logo-input')) $('deck-logo-input').value = s.deckLogo;
    }
    if (s.deckWatermark !== undefined) {
        state.currentDeckWatermark = s.deckWatermark;
        if ($('deck-watermark-input')) $('deck-watermark-input').value = s.deckWatermark;
    }
    updateDeckVisuals();
}

function handleAddChoice() {
    const input = $('new-choice-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    const match = val.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/);
    let name = val;
    let w = state.currentWeightSettings.base || 1;
    if (match) {
        name = match[1].trim();
        w = parseFloat(match[2]) || w;
    }
    if (name) {
        state.choices.push(name);
        state.currentWeightsMap[name] = w;
        state.currentChoiceStats[name] = { picks: 0, unpickedSpins: 0, effectiveWeight: w };
        input.value = '';
        syncChoicesToTextarea();
        renderChoicesTable();
        drawWheel(0, state.choices);
        updateObsUrl();
        saveStudioState();
    }
}

function bindStudioControls() {
    document.querySelectorAll('.p-chip').forEach(c => {
        c.onclick = () => setAccentColor(c.dataset.color);
    });

    const overlayBtnEl = $('overlay-spin-btn');
    if (overlayBtnEl) {
        overlayBtnEl.onclick = () => {
            if (!state.isSpinning && $('btn-spin')) $('btn-spin').click();
        };
        overlayBtnEl.onpointerenter = () => {
            if (!state.isSpinning && state.currentBtnPresetId !== 'static') updateButtonLabel();
        };
    }

    state.idleButtonTimer = setInterval(() => {
        if (!state.isSpinning && state.currentBtnPresetId !== 'static') {
            updateButtonLabel();
        }
    }, 6000);

    ['presets', 'theme', 'buttons', 'quotes', 'obs'].forEach(tabId => {
        const btn = $(`tab-btn-${tabId}`);
        if (btn) btn.onclick = () => switchTab(tabId);
    });

    $('preview-mode-roller').onclick = () => setStyleMode('roller');
    $('preview-mode-wheel').onclick = () => setStyleMode('wheel');
    $('preview-mode-deck').onclick = () => setStyleMode('deck');

    bindPresetControls();

    // Theme Inputs
    $('theme-select').onchange = () => {
        applyTheme($('theme-select').value);
        updateObsUrl();
        saveStudioState();
    };
    $('bg-style-select').onchange = () => {
        const val = $('bg-style-select').value;
        if ($('custom-bg-row')) $('custom-bg-row').style.display = (val === 'custom') ? 'flex' : 'none';
        applyBackgroundStyle(getEffectiveBackground());
        updateObsUrl();
        saveStudioState();
    };
    $('custom-bg-color').oninput = () => {
        if ($('custom-bg-color-picker')) $('custom-bg-color-picker').value = rgbToHex($('custom-bg-color').value);
        applyBackgroundStyle(getEffectiveBackground());
        updateObsUrl();
        saveStudioState();
    };
    $('custom-bg-color-picker').oninput = () => {
        if ($('custom-bg-color')) $('custom-bg-color').value = $('custom-bg-color-picker').value;
        applyBackgroundStyle(getEffectiveBackground());
        updateObsUrl();
        saveStudioState();
    };
    $('custom-bg-opacity').oninput = () => {
        if ($('custom-bg-opacity-label')) $('custom-bg-opacity-label').textContent = `${$('custom-bg-opacity').value}%`;
        applyBackgroundStyle(getEffectiveBackground());
        updateObsUrl();
        saveStudioState();
    };
    $('ap-accent').oninput = () => {
        highlightActiveAccentChip($('ap-accent').value.trim());
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('ap-accent-picker').oninput = () => {
        $('ap-accent').value = $('ap-accent-picker').value;
        highlightActiveAccentChip($('ap-accent').value.trim());
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('ap-text').oninput = () => {
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('ap-text-picker').oninput = () => {
        $('ap-text').value = $('ap-text-picker').value;
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    const onFontChange = () => {
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('ap-font').onchange = onFontChange;
    $('ap-font').oninput = onFontChange;
    $('ap-weight').onchange = () => {
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('ap-outline').oninput = () => {
        if ($('theme-select')) $('theme-select').value = 'custom';
        const val = $('ap-outline').value.trim();
        if (val && val !== 'none' && val !== 'transparent' && $('ap-outline-picker')) {
            $('ap-outline-picker').value = rgbToHex(val);
        }
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('ap-outline-picker').oninput = () => {
        $('ap-outline').value = $('ap-outline-picker').value;
        if ($('theme-select')) $('theme-select').value = 'custom';
        applyTheme('custom', true);
        updateObsUrl();
        saveStudioState();
    };
    $('btn-reset-overlay-theme').onclick = () => {
        if ($('theme-select')) $('theme-select').value = 'system';
        applyTheme('system');
        updateObsUrl();
        saveStudioState();
        toast('Reset to StreamPulse shared theme');
    };

    const doShuffle = () => {
        const list = getChoices();
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        setChoices(list);
        saveStudioState();
        toast('Choices shuffled');
    };
    $('btn-shuffle').onclick = doShuffle;
    $('btn-quick-shuffle').onclick = doShuffle;

    $('btn-quick-sound').onclick = () => {
        AudioFX.enabled = !AudioFX.enabled;
        if (AudioFX.enabled) AudioFX.init();
        $('sound-status-label').textContent = AudioFX.enabled ? 'Sound On' : 'Sound Muted';
        $('btn-quick-sound').style.opacity = AudioFX.enabled ? '1' : '0.6';
        saveStudioState();
        toast(AudioFX.enabled ? 'Audio effects enabled' : 'Audio effects muted');
    };

    $('suspense-select').onchange = () => {
        state.currentSuspense = $('suspense-select').value;
        updateObsUrl();
        saveStudioState();
    };
    $('spin-duration').oninput = () => {
        updateObsUrl();
        saveStudioState();
    };
    $('autohide-select').onchange = () => {
        updateObsUrl();
        saveStudioState();
    };
    $('overlay-button-enabled').onchange = () => {
        syncOverlayButtonPreview();
        updateObsUrl();
        saveStudioState();
    };
    $('btn-reset-studio').onclick = () => {
        if (!confirm('Reset all Randomizer Studio settings to defaults?')) return;
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {}
        state.currentMode = 'roller';
        state.currentPresetId = 'jackbox';
        state.currentBtnPresetId = 'chaos';
        state.currentQuotePresetId = 'multiverse';
        state.currentSuspense = 'normal';
        if ($('preview-mode-roller')) $('preview-mode-roller').classList.add('active');
        if ($('preview-mode-wheel')) $('preview-mode-wheel').classList.remove('active');
        if ($('preview-mode-deck')) $('preview-mode-deck').classList.remove('active');
        if ($('bg-style-select')) $('bg-style-select').value = 'glass';
        if ($('custom-bg-row')) $('custom-bg-row').style.display = 'none';
        if ($('theme-select')) $('theme-select').value = 'system';
        if ($('suspense-select')) $('suspense-select').value = 'normal';
        if ($('spin-duration')) $('spin-duration').value = '6';
        if ($('autohide-select')) $('autohide-select').value = '8';
        if ($('overlay-button-enabled')) $('overlay-button-enabled').checked = false;
        applyTheme('system');
        loadSelectedChoicesPreset();
        loadSelectedButtonPreset();
        loadSelectedQuotePreset();
        switchTab('presets');
        updateObsUrl();
        toast('Studio settings reset to defaults');
    };

    $('btn-phrases-textarea').oninput = () => {
        const lines = $('btn-phrases-textarea').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length) state.activeButtonPhrases = lines;
        if ($('btn-phrases-count-pill')) $('btn-phrases-count-pill').textContent = `${state.activeButtonPhrases.length} phrases`;
        updateButtonLabel();
        saveStudioState();
    };

    $('quotes-textarea').oninput = () => {
        const lines = $('quotes-textarea').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length) state.activeQuotesPool = lines;
        if ($('quotes-count-pill')) $('quotes-count-pill').textContent = `${state.activeQuotesPool.length} quotes`;
        saveStudioState();
    };

    $('btn-text-static').oninput = () => {
        updateButtonLabel();
        updateObsUrl();
        saveStudioState();
    };

    $('winner-header-input').oninput = () => {
        updateObsUrl();
        saveStudioState();
    };

    if ($('deck-logo-input')) {
        $('deck-logo-input').oninput = () => {
            state.currentDeckLogo = $('deck-logo-input').value.trim();
            updateDeckVisuals();
            updateObsUrl();
            saveStudioState();
        };
    }

    if ($('deck-watermark-input')) {
        $('deck-watermark-input').oninput = () => {
            state.currentDeckWatermark = $('deck-watermark-input').value.trim();
            updateDeckVisuals();
            updateObsUrl();
            saveStudioState();
        };
    }

    if ($('btn-clear-deck-logo')) {
        $('btn-clear-deck-logo').onclick = () => {
            if ($('deck-logo-input')) $('deck-logo-input').value = '';
            state.currentDeckLogo = '';
            updateDeckVisuals();
            updateObsUrl();
            saveStudioState();
        };
    }

    if ($('btn-upload-deck-logo')) {
        $('btn-upload-deck-logo').onclick = () => {
            $('deck-logo-file-input')?.click();
        };
    }

    if ($('deck-logo-file-input')) {
        $('deck-logo-file-input').onchange = async e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
                const res = await fetch('/api/custom-overlays/assets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': file.type || 'image/png',
                        'x-asset-name': file.name || 'card-logo'
                    },
                    body: file
                }).then(r => r.json());
                if (res && res.url) {
                    if ($('deck-logo-input')) $('deck-logo-input').value = res.url;
                    state.currentDeckLogo = res.url;
                    updateDeckVisuals();
                    updateObsUrl();
                    saveStudioState();
                    toast('Uploaded card deck logo');
                } else {
                    toast('Upload failed');
                }
            } catch (err) {
                toast('Upload error: ' + err.message);
            }
        };
    }

    $('choices-textarea').oninput = () => {
        const parsed = parseRawChoicesFromTextarea();
        state.choices = parsed.choices;
        state.currentWeightsMap = { ...state.currentWeightsMap, ...parsed.weights };
        if ($('choices-count-pill')) $('choices-count-pill').textContent = `${state.choices.length} choices`;
        renderInitialState();
        saveStudioState();
    };

    $('btn-view-table').onclick = () => {
        state.choicesViewMode = 'table';
        $('btn-view-table').classList.add('active');
        $('btn-view-raw').classList.remove('active');
        $('choices-table-container').style.display = 'block';
        $('choices-raw-container').style.display = 'none';
        const parsed = parseRawChoicesFromTextarea();
        state.choices = parsed.choices;
        state.currentWeightsMap = { ...state.currentWeightsMap, ...parsed.weights };
        renderChoicesTable();
        drawWheel(0, state.choices);
    };

    $('btn-view-raw').onclick = () => {
        state.choicesViewMode = 'raw';
        $('btn-view-raw').classList.add('active');
        $('btn-view-table').classList.remove('active');
        $('choices-raw-container').style.display = 'block';
        $('choices-table-container').style.display = 'none';
        syncChoicesToTextarea();
    };

    document.querySelectorAll('.weight-mode-btn').forEach(btn => {
        btn.onclick = () => {
            const mode = btn.dataset.mode;
            state.currentWeightMode = mode;
            updateWeightControlsUI();
            syncChoicesToTextarea();
            drawWheel(0, state.choices);
            updateObsUrl();
            saveStudioState();
            setPresetNeedsSave(true);
        };
    });

    ['weight-step-input', 'weight-max-input', 'weight-base-input'].forEach(id => {
        const el = $(id);
        if (el) {
            el.onchange = () => {
                state.currentWeightSettings = getWeightSettings();
                renderChoicesTable();
                drawWheel(0, state.choices);
                saveStudioState();
                setPresetNeedsSave(true);
            };
        }
    });

    $('btn-reset-weights').onclick = async () => {
        const base = state.currentWeightSettings.base || 1;
        if (state.currentWeightMode === 'manual') {
            state.choices.forEach(c => {
                state.currentWeightsMap[c] = base;
                state.currentChoiceStats[c] = { picks: 0, unpickedSpins: 0, effectiveWeight: base };
            });
            if (state.currentPresetId && state.currentPresetId !== 'chatters' && state.currentPresetId !== 'variables') {
                try {
                    const res = await fetch(`/api/randomizer/presets/${encodeURIComponent(state.currentPresetId)}/reset-weights?mode=equal`, {
                        method: 'POST'
                    }).then(r => r.json());
                    if (res.ok && res.preset) {
                        state.currentChoiceStats = res.preset.choiceStats || {};
                        state.currentWeightsMap = res.preset.weights || {};
                    }
                } catch {}
            }
            renderChoicesTable();
            syncChoicesToTextarea();
            drawWheel(0, state.choices);
            setPresetNeedsSave(true);
            toast(`All choice weights reset to equal (${base}x)`);
        } else {
            state.choices.forEach(c => {
                const b = state.currentWeightsMap[c] != null ? Number(state.currentWeightsMap[c]) : base;
                state.currentChoiceStats[c] = { picks: 0, unpickedSpins: 0, effectiveWeight: b };
            });
            if (state.currentPresetId && state.currentPresetId !== 'chatters' && state.currentPresetId !== 'variables') {
                try {
                    const res = await fetch(`/api/randomizer/presets/${encodeURIComponent(state.currentPresetId)}/reset-weights?mode=streaks`, {
                        method: 'POST'
                    }).then(r => r.json());
                    if (res.ok && res.preset) {
                        state.currentChoiceStats = res.preset.choiceStats || {};
                    }
                } catch {}
            }
            renderChoicesTable();
            drawWheel(0, state.choices);
            setPresetNeedsSave(true);
            const streakLabel = state.currentWeightMode === 'growth' ? 'Pity streaks' : 'Win streaks';
            toast(`${streakLabel} reset to baseline`);
        }
    };

    $('btn-clear-history').onclick = async () => {
        if (!state.currentSpinHistory.length) return;
        if (!confirm('Clear the spin history for this preset?')) return;
        if (state.currentPresetId && state.presetsList.some(p => p.id === state.currentPresetId)) {
            try {
                const res = await fetch(`/api/randomizer/presets/${encodeURIComponent(state.currentPresetId)}/clear-history`, { method: 'POST' }).then(r => r.json());
                if (res.ok) {
                    state.presetsList = res.presets;
                    applyEliminationState(res.preset, { redraw: false });
                }
            } catch {}
        } else {
            state.currentSpinHistory = [];
            renderEliminationUI();
        }
        toast('History cleared');
    };

    $('history-limit-select').onchange = async e => {
        state.currentHistoryLimit = Number(e.target.value) || 100;
        state.currentSpinHistory = state.currentSpinHistory.slice(-state.currentHistoryLimit);
        renderEliminationUI();
        const existing = state.presetsList.find(p => p.id === state.currentPresetId);
        if (!existing) return;
        try {
            const res = await fetch('/api/randomizer/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: existing.id,
                    name: existing.name,
                    choices: existing.choices,
                    historyLimit: state.currentHistoryLimit
                })
            }).then(r => r.json());
            if (res.ok) state.presetsList = res.presets;
        } catch {}
    };

    $('elim-toggle').onchange = e => {
        state.currentEliminationMode = e.target.checked;
        renderEliminationUI();
        renderChoicesTable();
        if (!state.isSpinning) renderInitialState();
        persistEliminationMode();
        toast(state.currentEliminationMode ? 'Elimination mode on: selected choices are removed' : 'Elimination mode off');
    };

    $('btn-reset-elim').onclick = async () => {
        if (state.isSpinning) return;
        if (state.currentPresetId && state.presetsList.some(p => p.id === state.currentPresetId)) {
            try {
                const res = await fetch(`/api/randomizer/presets/${encodeURIComponent(state.currentPresetId)}/reset-eliminated`, { method: 'POST' }).then(r => r.json());
                if (res.ok) {
                    state.presetsList = res.presets;
                    applyEliminationState(res.preset);
                }
            } catch {}
        } else {
            state.currentEliminated = [];
            state.currentSpinHistory = [...state.currentSpinHistory, { type: 'reset', winner: '', eliminated: false, at: Date.now() }];
            applyEliminationState({});
        }
        toast('All eliminated choices restored');
    };

    $('btn-add-choice').onclick = handleAddChoice;
    $('new-choice-input').onkeydown = e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddChoice();
        }
    };

    $('btn-spin').onpointerenter = () => {
        if (state.currentBtnPresetId !== 'static') updateButtonLabel();
    };

    $('btn-spin').onclick = async () => {
        AudioFX.init();
        const list = playableChoices(getChoices());
        if (!getChoices().length) return toast('Please enter at least 1 choice');
        if (!list.length) return toast('Every choice has been eliminated. Use Restore All to bring them back.');
        const mode = state.currentMode;
        const suspense = $('suspense-select').value;
        const theme = $('theme-select')?.value || state.currentTheme;
        const duration = Number($('spin-duration').value) || 6;
        const autohide = Number($('autohide-select').value);
        const winHeader = $('winner-header-input')?.value.trim() || 'THE UNIVERSE HAS DECIDED';

        let winSub = '';
        if (state.activeQuotesPool && state.activeQuotesPool.length) {
            winSub = state.activeQuotesPool[Math.floor(Math.random() * state.activeQuotesPool.length)];
        }

        const weightsMap = getActiveWeightsMap();
        const effWeights = getClientEffectiveWeights(list).weights;
        const weightSettings = getWeightSettings();

        try {
            const res = await fetch('/api/randomizer/spin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preset: state.currentPresetId,
                    choices: list,
                    weightMode: state.currentWeightMode,
                    weightSettings,
                    weights: weightsMap,
                    choiceStats: state.currentChoiceStats,
                    eliminationMode: state.currentEliminationMode,
                    eliminated: state.currentEliminated,
                    winnerHeader: winHeader,
                    winnerSub: winSub,
                    buttonPreset: state.currentBtnPresetId,
                    mode,
                    suspense,
                    theme,
                    bg: getEffectiveBackground(),
                    duration,
                    autohide,
                    buttonPhrases: state.activeButtonPhrases,
                    buttonText: state.currentBtnPresetId === 'static' ? ($('btn-text-static')?.value.trim() || '') : '',
                    showButton: $('overlay-button-enabled')?.checked ? 1 : 0,
                    accent: $('display-stage')?.style.getPropertyValue('--stage-accent') || '',
                    font: $('ap-font')?.value.trim() || '',
                    weight: $('ap-weight')?.value.trim() || '',
                    text: $('ap-text')?.value.trim() || '',
                    outline: $('ap-outline')?.value.trim() || '',
                    deckLogo: state.currentDeckLogo,
                    deckWatermark: state.currentDeckWatermark,
                    historyLimit: state.currentHistoryLimit
                })
            }).then(r => r.json());

            let selectedWinner = res?.winner;
            if (!selectedWinner) {
                selectedWinner = pickWeightedWinnerClient(list, effWeights);
            }
            if (res?.choiceStats) {
                state.currentChoiceStats = res.choiceStats;
            }
            if (res?.ok) state.pendingEliminationState = res;
            if (res?.weights) {
                state.currentWeightsMap = { ...state.currentWeightsMap, ...res.weights };
            }

            runSpin({
                choices: list,
                weights: effWeights,
                winner: selectedWinner,
                winnerHeader: winHeader,
                winnerSub: winSub,
                mode,
                suspense,
                theme,
                duration,
                autohide
            });

            if (res && res.ok) {
                toast(`Spinning live on stream: "${selectedWinner}"`);
            }
        } catch {
            const picked = pickWeightedWinnerClient(list, effWeights);
            runSpin({
                choices: list,
                weights: effWeights,
                winner: picked,
                winnerHeader: winHeader,
                winnerSub: winSub,
                mode,
                suspense,
                theme,
                duration,
                autohide
            });
            toast('Spun in studio (server broadcast offline)');
        }
    };

    const doCopyObs = () => {
        updateObsUrl();
        navigator.clipboard.writeText($('obs-url-input').textContent).then(() => {
            toast('Copied OBS Browser Source URL');
        }).catch(() => {});
    };
    $('btn-copy-obs').onclick = doCopyObs;
    $('btn-quick-copy-obs').onclick = doCopyObs;

    $('btn-copy-companion').onclick = () => {
        navigator.clipboard.writeText($('companion-url-input').textContent).then(() => {
            toast('Copied Bitfocus Companion GET URL');
        }).catch(() => {});
    };
}

// Real-Time WebSocket Listener (Syncs spins from Companion or other control surfaces)
function connectWs() {
    try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}`);
        ws.onopen = () => {
            if (state.studioSettingsReady) syncStudioSettingsToServer();
        };
        ws.onmessage = event => {
            try {
                if (typeof event.data === 'string' && !event.data.includes('"randomizer-spin"') && !event.data.includes('"randomizer-state"')) return;
                const msg = JSON.parse(event.data);
                if (msg.type === 'randomizer-state' && msg.data) {
                    const d = msg.data;
                    if (d.preset !== state.currentPresetId) return;
                    state.currentWeightsMap = { ...(d.baseWeights || {}) };
                    state.currentChoiceStats = d.choiceStats || {};
                    if (d.weightMode) {
                        state.currentWeightMode = d.weightMode;
                        updateWeightControlsUI();
                    }
                    applyEliminationState(d);
                    return;
                }
                if (msg.type === 'randomizer-spin' && msg.data) {
                    const d = msg.data;
                    if (d.weights) state.currentWeightsMap = { ...state.currentWeightsMap, ...d.weights };
                    if (d.choiceStats) state.currentChoiceStats = d.choiceStats;
                    if (d.preset === state.currentPresetId && d.eliminated) state.pendingEliminationState = d;
                    if (d.weightMode) {
                        state.currentWeightMode = d.weightMode;
                        updateWeightControlsUI();
                    }
                    renderChoicesTable();
                    if (state.isSpinning) return;
                    AudioFX.init();
                    if (d.theme) applyTheme(d.theme, true);
                    if (d.bg) applyBackgroundStyle(d.bg);
                    if (d.mode && d.mode !== state.currentMode) setStyleMode(d.mode);
                    let buttonPhraseChanged = false;
                    if (d.showButton !== undefined && $('overlay-button-enabled')) {
                        $('overlay-button-enabled').checked = !!d.showButton;
                        syncOverlayButtonPreview();
                    }
                    if (d.buttonPreset !== undefined) {
                        state.currentBtnPresetId = d.buttonPreset;
                        if ($('btn-preset-select') && Array.from($('btn-preset-select').options).some(option => option.value === d.buttonPreset)) {
                            $('btn-preset-select').value = d.buttonPreset;
                        }
                        buttonPhraseChanged = true;
                    }
                    if (Array.isArray(d.buttonPhrases)) {
                        state.activeButtonPhrases = d.buttonPhrases;
                        if ($('btn-phrases-textarea')) $('btn-phrases-textarea').value = d.buttonPhrases.join('\n');
                        if ($('btn-phrases-count-pill')) $('btn-phrases-count-pill').textContent = `${d.buttonPhrases.length} phrases`;
                        buttonPhraseChanged = true;
                    }
                    if (d.buttonText !== undefined) {
                        const staticText = $('btn-text-static');
                        if (staticText) staticText.value = String(d.buttonText);
                        buttonPhraseChanged = true;
                    }
                    if (buttonPhraseChanged) {
                        updateButtonLabel();
                        syncOverlayButtonPreview();
                    }
                    runSpin({
                        choices: (Array.isArray(d.choices) && d.choices.length) ? d.choices : state.choices,
                        weights: d.weights || state.currentWeightsMap,
                        winner: d.winner,
                        winnerHeader: d.winnerHeader,
                        winnerSub: d.winnerSub,
                        mode: d.mode || state.currentMode,
                        suspense: d.suspense || state.currentSuspense,
                        theme: d.theme || state.currentTheme,
                        duration: d.duration,
                        autohide: d.autohide
                    });
                }
            } catch {}
        };
        ws.onclose = () => setTimeout(connectWs, 3000);
    } catch {
        setTimeout(connectWs, 5000);
    }
}

Object.assign(window, {
    exportRandomizerPresetsJson,
    importRandomizerPresetsJson
});

initFontDropdown();
setChoices(DEFAULT_FALLBACK_CHOICES);
applySavedStudioUI(state.savedStudio);
loadOverlayTheme();
bindStudioControls();
Promise.all([fetchChoicesPresets(), fetchButtonPresets(), fetchQuotePresets()])
    .then(() => {
        state.studioSettingsReady = true;
        return syncStudioSettingsToServer();
    });
setTimeout(() => { state.isInitialLoad = false; }, 400);
updateObsUrl();
connectWs();
